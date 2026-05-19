import { promises as fs } from 'fs';
import 'server-only';
import { fingerprintDraft } from './fingerprint';
import { withUserLock } from './mutex';
import { parseJournal, parseJournalFile } from './parser';
import { getJournalCacheTag, resolveUserJournal } from '@/lib/journals';
import {
  formatTransaction,
  transactionDraftSchema,
  type TransactionDraft,
} from '@/lib/transactions/schema';
import { revalidatePath, updateTag } from 'next/cache';

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

const writeFileAtomic = async (filePath: string, content: string) => {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, filePath);
};

const performEdit = async (
  userId: string,
  input: WriteEditInput
): Promise<WriteResult> => {
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

  const { mainPath } = await resolveUserJournal(userId);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === input.uid);
  if (!tx) {
    return {
      ok: false,
      reason: 'not-found',
      message: 'Transaction not found.',
    };
  }

  const text = await fs.readFile(tx.file, 'utf-8');
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
  await writeFileAtomic(tx.file, next);

  // Cache invalidation is best-effort during tests; production has the proper Next.js context.
  try {
    updateTag(getJournalCacheTag(userId));
    revalidatePath('/', 'layout');
  } catch {
    // no-op outside Next.js
  }
  return { ok: true };
};

const performDelete = async (
  userId: string,
  input: WriteDeleteInput
): Promise<WriteResult> => {
  const { mainPath } = await resolveUserJournal(userId);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === input.uid);
  if (!tx) {
    return {
      ok: false,
      reason: 'not-found',
      message: 'Transaction not found.',
    };
  }

  const text = await fs.readFile(tx.file, 'utf-8');
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
  let removeStart = current.startLine - 1; // inclusive, 0-based
  let removeEnd = current.endLine - 1; // inclusive, 0-based
  // Trailing blank line if present
  if (lines[removeEnd + 1] === '') {
    removeEnd++;
  } else if (removeStart > 0 && lines[removeStart - 1] === '') {
    removeStart--;
  }
  const next = [
    ...lines.slice(0, removeStart),
    ...lines.slice(removeEnd + 1),
  ].join('\n');
  await writeFileAtomic(tx.file, next);

  // Cache invalidation — best-effort outside Next.js context
  try {
    updateTag(getJournalCacheTag(userId));
    revalidatePath('/', 'layout');
  } catch {
    // best-effort
  }
  return { ok: true };
};

export const writeJournal = async (
  userId: string,
  input: WriteInput
): Promise<WriteResult> =>
  withUserLock(userId, async () => {
    if (input.kind === 'edit') return performEdit(userId, input);
    return performDelete(userId, input);
  });
