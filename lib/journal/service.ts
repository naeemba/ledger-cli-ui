import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import 'server-only';
import { fingerprintDraft } from './fingerprint';
import {
  DEFAULT_MAIN,
  PRICE_DB_NAME,
  VALID_EXTS,
  getJournalCacheTag,
  getJournalDir,
} from './layout';
import { withUserLock } from './mutex';
import {
  parseJournalFile,
  resolveIncludes,
  type ParsedJournal,
  type Transaction,
} from './parser';
import { JournalRepository } from './repository';
import { detectFirstPostingIndent, findUidInBlock, generateUid } from './uid';
import {
  formatTransaction,
  transactionDraftSchema,
  type TransactionDraft,
} from '@/lib/transactions/schema';
import { revalidatePath, updateTag } from 'next/cache';

const HEADER_START_REGEX = /^\d{4}[-/]\d{2}[-/]\d{2}/;
const PATH_TRAVERSAL = /(^|[/\\])\.\.([/\\]|$)/;

export type AddTransactionResult =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

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
      reason: 'not-found' | 'stale' | 'invalid';
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

const invalidateCache = (userId: string) => {
  // Cache invalidation is best-effort outside the Next.js runtime context
  // (e.g. inside vitest); inside Next, updateTag + revalidatePath fire normally.
  try {
    updateTag(getJournalCacheTag(userId));
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

  const sorted = ledgerEntries
    .filter((e) => path.basename(e.name).toLowerCase() !== PRICE_DB_NAME)
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
    return this.repo.list(userId);
  }

  async findTransaction(
    userId: string,
    uid: string
  ): Promise<Transaction | null> {
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
      return { ok: false, fieldErrors };
    }

    const draft: TransactionDraft = { ...parsed.data, uid: generateUid() };
    const { mainPath } = await this.repo.ensureLayout(userId);
    // Leading "\n\n" guards against imported files that lack a trailing newline.
    const block = `\n\n${formatTransaction(draft)}\n`;
    try {
      await this.repo.appendFile(mainPath, block);
    } catch (e) {
      return {
        ok: false,
        fieldErrors: {},
        formError: e instanceof Error ? e.message : 'Failed to write journal',
      };
    }
    invalidateCache(userId);
    return { ok: true };
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
  ): Promise<{ uidsAdded: number }> {
    await this.repo.emptyJournalDir(userId);
    const dir = getJournalDir(userId);
    await fs.writeFile(path.join(dir, DEFAULT_MAIN), content);
    await this.repo.setMainFile(userId, DEFAULT_MAIN);
    const backfill = await this.backfillUids(userId);
    return { uidsAdded: backfill.uidsAdded };
  }

  /** Extracts a .zip into the journal dir, picks a main file, backfills UIDs. */
  async replaceFromZip(
    userId: string,
    buffer: Buffer
  ): Promise<{ mainFile: string; fileCount: number; uidsAdded: number }> {
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

    await this.repo.emptyJournalDir(userId);
    const dir = getJournalDir(userId);

    for (const entry of entries) {
      const target = path.join(dir, entry.entryName);
      const resolved = path.resolve(target);
      if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
        throw new Error(`Unsafe path in archive: ${entry.entryName}`);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, entry.getData());
    }

    const mainFile = detectMain(entries.map((e) => ({ name: e.entryName })));
    await this.repo.setMainFile(userId, mainFile);
    const backfill = await this.backfillUids(userId);
    return {
      mainFile,
      fileCount: entries.length,
      uidsAdded: backfill.uidsAdded,
    };
  }

  // ---- internals ------------------------------------------------------------

  private async performEdit(
    userId: string,
    input: WriteEditInput
  ): Promise<WriteResult> {
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

    const currentFingerprint = fingerprintDraft({
      date: current.date,
      payee: current.payee,
      status: current.status,
      note: current.note ?? undefined,
      uid: current.uid ?? undefined,
      postings: current.postings,
    });
    if (currentFingerprint !== input.expectedFingerprint) {
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

    invalidateCache(userId);
    return { ok: true };
  }

  private async performDelete(
    userId: string,
    input: WriteDeleteInput
  ): Promise<WriteResult> {
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

    const fp = fingerprintDraft({
      date: current.date,
      payee: current.payee,
      status: current.status,
      note: current.note ?? undefined,
      uid: current.uid ?? undefined,
      postings: current.postings,
    });
    if (fp !== input.expectedFingerprint) {
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

    invalidateCache(userId);
    return { ok: true };
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
