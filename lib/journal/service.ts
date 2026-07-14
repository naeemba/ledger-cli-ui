import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import 'server-only';
import {
  DEFAULT_MAIN,
  GENERATED_PRICE_DB_NAME,
  PRICE_DB_NAME,
  VALID_EXTS,
  getJournalDir,
} from './layout';
import { resolveIncludes } from './loader';
import { withUserLock } from './mutex';
import { parseJournalFile, type ParsedJournal } from './parser';
import { getJournalDirSize, journalQuotaBytes, journalQuotaMb } from './quota';
import { JournalRepository } from './repository';
import { detectFirstPostingIndent, findUidInBlock, generateUid } from './uid';
import { verifyJournalParseable } from './verify';
import { encryptFile, isCiphertext } from '@/lib/crypto/fileCrypto';
import { getSessionDek, LockedError } from '@/lib/crypto/sessionKeys';
import { pull, pullLocked, push, StorageConflictError } from '@/lib/storage';
import { listLocalRelPaths } from '@/lib/storage/manifest';
import type { ParsedTransaction } from '@/lib/transactions/model';
import {
  formatTransaction,
  transactionDraftSchema,
  type TransactionDraft,
} from '@/lib/transactions/schema';
import { revalidatePath } from 'next/cache';

const HEADER_START_REGEX = /^\d{4}[-/]\d{2}[-/]\d{2}/;
const PATH_TRAVERSAL = /(^|[/\\])\.\.([/\\]|$)/;

export type AddTransactionResult =
  | { ok: true; uid: string }
  | {
      ok: false;
      reason: 'invalid' | 'quota' | 'write-failed' | 'parse-failed' | 'stale';
      fieldErrors: Record<string, string>;
      formError?: string;
    };

export type WriteEditInput = {
  kind: 'edit';
  uid: string;
  expectedFingerprint: string;
  draft: TransactionDraft;
};

export type WriteDeleteInput = {
  kind: 'delete';
  uid: string;
  expectedFingerprint: string;
};

export type WriteInput = WriteEditInput | WriteDeleteInput;

export type WriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-found' | 'stale' | 'invalid' | 'parse-failed';
      message: string;
      fieldErrors?: Record<string, string>;
    };

export type BackfillFileResult = {
  uidsAdded: number;
  fileTouched: boolean;
};

export type BackfillResult = {
  filesTouched: number;
  uidsAdded: number;
};

const invalidateCache = (_userId: string) => {
  // Cache invalidation is best-effort outside the Next.js runtime context
  // (e.g. inside vitest); inside Next, revalidatePath fires normally.
  //
  // The journal's max mtime is part of every cache key (see runLedger and
  // Transactions.tsx), so any file change implicitly invalidates the data
  // cache. revalidatePath here forces the RSC payload re-render.
  try {
    revalidatePath('/', 'layout');
  } catch {
    // no-op outside Next.js
  }
};

const detectMain = (entries: { name: string }[]): string => {
  const ledgerEntries = entries.filter((e) =>
    VALID_EXTS.includes(path.extname(e.name).toLowerCase())
  );

  for (const preferred of ['main.ledger', 'ledger.ledger', 'main.dat']) {
    const match = ledgerEntries.find(
      (e) => path.basename(e.name).toLowerCase() === preferred
    );
    if (match) return match.name;
  }

  const priceFiles = new Set([GENERATED_PRICE_DB_NAME, PRICE_DB_NAME]);
  const sorted = ledgerEntries
    .filter((e) => !priceFiles.has(path.basename(e.name).toLowerCase()))
    .sort((a, b) => {
      const depthA = a.name.split('/').length;
      const depthB = b.name.split('/').length;
      if (depthA !== depthB) return depthA - depthB;
      return a.name.localeCompare(b.name);
    });
  return sorted[0]?.name ?? DEFAULT_MAIN;
};

/**
 * High-level operations over the user's journal: read passthroughs, mutations
 * with Zod validation + fingerprint guards + per-user mutex + cache
 * invalidation, the UID backfill pass, and the import flow.
 */
export class JournalService {
  constructor(private readonly repo: JournalRepository) {}

  // ---- read passthroughs ----------------------------------------------------

  async listTransactions(userId: string): Promise<ParsedJournal> {
    await pullLocked(userId);
    return this.repo.list(userId);
  }

  async findTransaction(
    userId: string,
    uid: string
  ): Promise<ParsedTransaction | null> {
    await pullLocked(userId);
    return this.repo.find(userId, uid);
  }

  // ---- mutations ------------------------------------------------------------

  async addTransaction(
    userId: string,
    rawDraft: unknown
  ): Promise<AddTransactionResult> {
    const parsed = transactionDraftSchema.safeParse(rawDraft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, reason: 'invalid', fieldErrors };
    }

    return withUserLock(userId, async () => {
      const uid = generateUid();
      const draft: TransactionDraft = { ...parsed.data, uid };
      await pull(userId);
      const { mainPath } = await this.repo.ensureLayout(userId);
      // Snapshot the file so we can roll back if ledger rejects the result.
      const snapshot = await this.repo.readFile(mainPath);
      // Leading "\n\n" guards against imported files that lack a trailing newline.
      const block = `\n\n${formatTransaction(draft)}\n`;
      const projected =
        (await getJournalDirSize(userId)) + Buffer.byteLength(block);
      if (projected > journalQuotaBytes()) {
        return {
          ok: false,
          reason: 'quota',
          fieldErrors: {},
          formError: `This transaction would exceed your ${journalQuotaMb()} MB journal limit.`,
        };
      }
      try {
        await this.repo.appendFile(mainPath, block);
      } catch (e) {
        return {
          ok: false,
          reason: 'write-failed',
          fieldErrors: {},
          formError: e instanceof Error ? e.message : 'Failed to write journal',
        };
      }
      const verify = await verifyJournalParseable(mainPath);
      if (!verify.ok) {
        // Roll back so the journal stays parseable.
        await this.repo.writeFileAtomic(mainPath, snapshot);
        return {
          ok: false,
          reason: 'parse-failed',
          fieldErrors: {},
          formError: `Ledger rejected the new transaction: ${verify.message}`,
        };
      }
      try {
        await push(userId);
      } catch (e) {
        // Local is ahead of canonical — roll back so we never diverge.
        await this.repo.writeFileAtomic(mainPath, snapshot);
        const formError =
          e instanceof StorageConflictError
            ? e.message
            : 'Failed to save journal to storage.';
        return { ok: false, reason: 'stale', fieldErrors: {}, formError };
      }
      invalidateCache(userId);
      return { ok: true, uid };
    });
  }

  async editTransaction(
    userId: string,
    input: WriteEditInput
  ): Promise<WriteResult> {
    return withUserLock(userId, () => this.performEdit(userId, input));
  }

  async deleteTransaction(
    userId: string,
    input: WriteDeleteInput
  ): Promise<WriteResult> {
    return withUserLock(userId, () => this.performDelete(userId, input));
  }

  // ---- bulk + import --------------------------------------------------------

  /** Stamps a UID line on every transaction block that doesn't have one yet. */
  async backfillUids(userId: string): Promise<BackfillResult> {
    const { mainPath } = await this.repo.getLayout(userId);
    const files = await resolveIncludes(mainPath);
    let filesTouched = 0;
    let uidsAdded = 0;
    for (const file of files) {
      const result = await this.backfillFile(file);
      if (result.fileTouched) filesTouched++;
      uidsAdded += result.uidsAdded;
    }
    return { filesTouched, uidsAdded };
  }

  /** Wipes the journal dir, writes the single uploaded file, backfills UIDs. */
  async replaceFromSingleFile(
    userId: string,
    content: Buffer
  ): Promise<{
    uidsAdded: number;
    parseFailure?: string;
    quotaExceeded?: boolean;
  }> {
    return withUserLock(userId, async () => {
      if (content.length > journalQuotaBytes()) {
        return { uidsAdded: 0, quotaExceeded: true };
      }
      await pull(userId); // sync local cache + manifest to canonical
      await this.repo.resetLocalJournal(userId); // wipe local files, keep manifest
      const dir = getJournalDir(userId);
      const mainPath = path.join(dir, DEFAULT_MAIN);
      await fs.writeFile(mainPath, content);
      await this.repo.setMainFile(userId, DEFAULT_MAIN);
      const backfill = await this.backfillUids(userId);
      invalidateCache(userId);
      // No rollback on parse failure for imports — too much state to undo.
      // Surface the error so the user can re-upload a clean journal.
      const verify = await verifyJournalParseable(mainPath);
      try {
        await push(userId);
      } catch (e) {
        return {
          uidsAdded: backfill.uidsAdded,
          parseFailure:
            e instanceof StorageConflictError
              ? e.message
              : 'Failed to save journal to storage.',
        };
      }
      return {
        uidsAdded: backfill.uidsAdded,
        ...(verify.ok ? {} : { parseFailure: verify.message }),
      };
    });
  }

  /** Extracts a .zip into the journal dir, picks a main file, backfills UIDs. */
  async replaceFromZip(
    userId: string,
    buffer: Buffer
  ): Promise<{
    mainFile: string;
    fileCount: number;
    uidsAdded: number;
    parseFailure?: string;
    quotaExceeded?: boolean;
  }> {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);

    for (const entry of entries) {
      if (
        PATH_TRAVERSAL.test(entry.entryName) ||
        path.isAbsolute(entry.entryName)
      ) {
        throw new Error(`Unsafe path in archive: ${entry.entryName}`);
      }
    }

    // Decompress each entry exactly once (adm-zip does not cache buffers) and
    // short-circuit the quota sum as soon as it crosses the cap, so a malicious
    // archive (a "zip bomb") can't force us to decompress its entire payload
    // into memory before the quota rejects it.
    const quota = journalQuotaBytes();
    const decompressed: { entry: AdmZip.IZipEntry; data: Buffer }[] = [];
    let extractedBytes = 0;
    for (const entry of entries) {
      const data = entry.getData();
      extractedBytes += data.length;
      decompressed.push({ entry, data });
      if (extractedBytes > quota) {
        return {
          mainFile: '',
          fileCount: entries.length,
          uidsAdded: 0,
          quotaExceeded: true,
        };
      }
    }

    return withUserLock(userId, async () => {
      await pull(userId); // sync local cache + manifest to canonical
      await this.repo.resetLocalJournal(userId); // wipe local files, keep manifest
      const dir = getJournalDir(userId);

      for (const { entry, data } of decompressed) {
        const target = path.join(dir, entry.entryName);
        const resolved = path.resolve(target);
        if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
          throw new Error(`Unsafe path in archive: ${entry.entryName}`);
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data);
      }

      const mainFile = detectMain(entries.map((e) => ({ name: e.entryName })));
      await this.repo.setMainFile(userId, mainFile);
      const backfill = await this.backfillUids(userId);
      invalidateCache(userId);
      // No rollback on parse failure for imports — too much state to undo.
      // Surface the error so the user can re-upload a clean journal.
      const verify = await verifyJournalParseable(path.join(dir, mainFile));
      try {
        await push(userId);
      } catch (e) {
        return {
          mainFile,
          fileCount: entries.length,
          uidsAdded: backfill.uidsAdded,
          parseFailure:
            e instanceof StorageConflictError
              ? e.message
              : 'Failed to save journal to storage.',
        };
      }
      return {
        mainFile,
        fileCount: entries.length,
        uidsAdded: backfill.uidsAdded,
        ...(verify.ok ? {} : { parseFailure: verify.message }),
      };
    });
  }

  // ---- internals ------------------------------------------------------------

  private async performEdit(
    userId: string,
    input: WriteEditInput
  ): Promise<WriteResult> {
    await pull(userId);
    if (input.uid !== input.draft.uid) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'Submitted uid does not match the transaction being edited.',
      };
    }
    const parsedDraft = transactionDraftSchema.safeParse(input.draft);
    if (!parsedDraft.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsedDraft.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return {
        ok: false,
        reason: 'invalid',
        message: 'Validation failed.',
        fieldErrors,
      };
    }

    const tx = await this.repo.find(userId, input.uid);
    if (!tx) {
      return {
        ok: false,
        reason: 'not-found',
        message: 'Transaction not found.',
      };
    }

    const text = await this.repo.readFile(tx.file);
    const fileTxs = parseJournalFile(tx.file, text);
    const current = fileTxs.find((t) => t.uid === input.uid);
    if (!current) {
      return {
        ok: false,
        reason: 'not-found',
        message: 'Transaction not found.',
      };
    }

    // parseJournalFile already stamped the canonical fingerprint on `current`;
    // reuse it rather than recomputing the same hash from a rebuilt draft.
    if (current.fingerprint !== input.expectedFingerprint) {
      return {
        ok: false,
        reason: 'stale',
        message: 'This transaction was modified somewhere else.',
      };
    }

    const newBlock = formatTransaction(parsedDraft.data);
    const lines = text.split('\n');
    const before = lines.slice(0, current.startLine - 1).join('\n');
    const after = lines.slice(current.endLine).join('\n');
    const next =
      (before ? before + '\n' : '') + newBlock + (after ? '\n' + after : '');
    await this.repo.writeFileAtomic(tx.file, next);

    const { mainPath } = await this.repo.getLayout(userId);
    const verify = await verifyJournalParseable(mainPath);
    if (!verify.ok) {
      // Roll the file back to its pre-edit content so the journal stays parseable.
      await this.repo.writeFileAtomic(tx.file, text);
      return {
        ok: false,
        reason: 'parse-failed',
        message: `Ledger rejected the edit: ${verify.message}`,
      };
    }
    try {
      await push(userId);
    } catch (e) {
      await this.repo.writeFileAtomic(tx.file, text); // restore pre-edit content
      return {
        ok: false,
        reason: 'stale',
        message:
          e instanceof StorageConflictError
            ? e.message
            : 'Failed to save journal to storage.',
      };
    }
    invalidateCache(userId);
    return { ok: true };
  }

  private async performDelete(
    userId: string,
    input: WriteDeleteInput
  ): Promise<WriteResult> {
    await pull(userId);
    const tx = await this.repo.find(userId, input.uid);
    if (!tx) {
      return {
        ok: false,
        reason: 'not-found',
        message: 'Transaction not found.',
      };
    }

    const text = await this.repo.readFile(tx.file);
    const fileTxs = parseJournalFile(tx.file, text);
    const current = fileTxs.find((t) => t.uid === input.uid);
    if (!current) {
      return {
        ok: false,
        reason: 'not-found',
        message: 'Transaction not found.',
      };
    }

    // Reuse the parser's stamped fingerprint rather than recomputing it.
    if (current.fingerprint !== input.expectedFingerprint) {
      return {
        ok: false,
        reason: 'stale',
        message: 'This transaction was modified somewhere else.',
      };
    }

    const lines = text.split('\n');
    let removeStart = current.startLine - 1;
    let removeEnd = current.endLine - 1;
    if (lines[removeEnd + 1] === '') {
      removeEnd++;
    } else if (removeStart > 0 && lines[removeStart - 1] === '') {
      removeStart--;
    }
    const next = [
      ...lines.slice(0, removeStart),
      ...lines.slice(removeEnd + 1),
    ].join('\n');
    await this.repo.writeFileAtomic(tx.file, next);

    const { mainPath } = await this.repo.getLayout(userId);
    const verify = await verifyJournalParseable(mainPath);
    if (!verify.ok) {
      // Roll back so the journal stays parseable.
      await this.repo.writeFileAtomic(tx.file, text);
      return {
        ok: false,
        reason: 'parse-failed',
        message: `Ledger rejected the delete: ${verify.message}`,
      };
    }
    try {
      await push(userId);
    } catch (e) {
      await this.repo.writeFileAtomic(tx.file, text); // restore pre-delete content
      return {
        ok: false,
        reason: 'stale',
        message:
          e instanceof StorageConflictError
            ? e.message
            : 'Failed to save journal to storage.',
      };
    }
    invalidateCache(userId);
    return { ok: true };
  }

  async enableEncryption(
    userId: string
  ): Promise<{ encrypted: number; alreadyCiphertext: number }> {
    return withUserLock(userId, async () => {
      const dek = getSessionDek(userId);
      if (!dek) throw new LockedError();
      await pull(userId); // bring canonical down (decrypts any already-ciphertext)
      const dir = getJournalDir(userId);
      let encrypted = 0;
      let alreadyCiphertext = 0;
      for (const rel of await listLocalRelPaths(dir)) {
        const abs = path.join(dir, rel);
        const body = await fs.readFile(abs);
        if (isCiphertext(body)) {
          alreadyCiphertext++;
          continue;
        }
        await fs.writeFile(abs, encryptFile(dek, rel, body));
        encrypted++;
      }
      await push(userId); // re-encrypts on the seam too (DEK present) — uploads ciphertext
      return { encrypted, alreadyCiphertext };
    });
  }

  private async backfillFile(filePath: string): Promise<BackfillFileResult> {
    const original = await this.repo.readFile(filePath);
    const lines = original.split('\n');
    const output: string[] = [];
    let inBlock = false;
    let blockBuf: string[] = [];
    let uidsAdded = 0;

    const flushBlock = () => {
      if (blockBuf.length === 0) return;
      const blockText = blockBuf.join('\n');
      if (findUidInBlock(blockText) === null) {
        const indent = detectFirstPostingIndent(blockBuf);
        const uidLine = `${indent}; :uid: ${generateUid()}`;
        output.push(blockBuf[0], uidLine, ...blockBuf.slice(1));
        uidsAdded++;
      } else {
        output.push(...blockBuf);
      }
      blockBuf = [];
      inBlock = false;
    };

    for (const line of lines) {
      if (!inBlock) {
        if (HEADER_START_REGEX.test(line)) {
          inBlock = true;
          blockBuf = [line];
        } else {
          output.push(line);
        }
        continue;
      }
      if (line.trim() === '') {
        flushBlock();
        output.push(line);
        continue;
      }
      blockBuf.push(line);
    }
    flushBlock();

    const next = output.join('\n');
    if (next === original) {
      return { uidsAdded: 0, fileTouched: false };
    }
    await this.repo.writeFileAtomic(filePath, next);
    return { uidsAdded, fileTouched: true };
  }
}
