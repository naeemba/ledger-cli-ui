import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import 'server-only';
import { user as userTable } from '@/db/schema';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { backfillUids } from '@/lib/journal/backfill';
import {
  formatTransaction,
  transactionDraftSchema,
  type TransactionDraft,
} from '@/lib/transactions/schema';

export const DEFAULT_MAIN = 'main.ledger';
export const PRICE_DB_NAME = 'price-db.ledger';
const VALID_EXTS = ['.ledger', '.dat', '.journal', '.txt'];

export const getJournalDir = (userId: string): string =>
  path.join(env.DATA_DIR, 'journals', userId);

export const getJournalCacheTag = (userId: string): string =>
  `ledger:${userId}`;

type UserJournal = {
  dir: string;
  mainFile: string;
  mainPath: string;
  priceDbPath: string | null;
};

const findPriceDb = async (dir: string): Promise<string | null> => {
  const candidate = path.join(dir, PRICE_DB_NAME);
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return null;
  }
};

export const resolveUserJournal = async (
  userId: string
): Promise<UserJournal> => {
  const row = await db
    .select({ journalMain: userTable.journalMain })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .get();
  const mainFile = row?.journalMain ?? DEFAULT_MAIN;
  const dir = getJournalDir(userId);
  return {
    dir,
    mainFile,
    mainPath: path.join(dir, mainFile),
    priceDbPath: await findPriceDb(dir),
  };
};

export const ensureJournal = async (userId: string): Promise<UserJournal> => {
  const resolved = await resolveUserJournal(userId);
  await fs.mkdir(resolved.dir, { recursive: true });
  try {
    await fs.access(resolved.mainPath);
  } catch {
    const stub = `; Ledger journal for user ${userId}\n; Created ${new Date().toISOString()}\n`;
    await fs.writeFile(resolved.mainPath, stub, 'utf-8');
  }
  return resolved;
};

const emptyDir = async (dir: string) => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  await fs.mkdir(dir, { recursive: true });
};

const setJournalMain = async (userId: string, mainFile: string) => {
  await db
    .update(userTable)
    .set({ journalMain: mainFile })
    .where(eq(userTable.id, userId));
};

export const replaceJournalFromSingleFile = async (
  userId: string,
  content: Buffer
): Promise<{ uidsAdded: number }> => {
  const dir = getJournalDir(userId);
  await emptyDir(dir);
  await fs.writeFile(path.join(dir, DEFAULT_MAIN), content);
  await setJournalMain(userId, DEFAULT_MAIN);
  const backfill = await backfillUids(userId);
  return { uidsAdded: backfill.uidsAdded };
};

const PATH_TRAVERSAL = /(^|[/\\])\.\.([/\\]|$)/;

const detectMain = (entries: { name: string }[]): string => {
  const ledgerEntries = entries.filter((e) =>
    VALID_EXTS.includes(path.extname(e.name).toLowerCase())
  );

  // Preferred filenames in priority order.
  for (const preferred of ['main.ledger', 'ledger.ledger', 'main.dat']) {
    const match = ledgerEntries.find(
      (e) => path.basename(e.name).toLowerCase() === preferred
    );
    if (match) return match.name;
  }

  // Otherwise pick the shallowest .ledger file; ties broken alphabetically.
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

export const replaceJournalFromZip = async (
  userId: string,
  buffer: Buffer
): Promise<{ mainFile: string; fileCount: number; uidsAdded: number }> => {
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

  const dir = getJournalDir(userId);
  await emptyDir(dir);

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
  await setJournalMain(userId, mainFile);
  const backfill = await backfillUids(userId);
  return { mainFile, fileCount: entries.length, uidsAdded: backfill.uidsAdded };
};

export type AddTransactionResult =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export const addTransaction = async (
  userId: string,
  rawDraft: unknown
): Promise<AddTransactionResult> => {
  const parsed = transactionDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const draft: TransactionDraft = parsed.data;
  const { mainPath } = await ensureJournal(userId);
  // `appendFile` opens with `'a'` and a single small write is atomic at the
  // syscall level — well under PIPE_BUF for any reasonable transaction.
  // The leading "\n\n" guards against an imported file lacking a trailing
  // newline; ledger ignores extra blank lines.
  const block = `\n\n${formatTransaction(draft)}\n`;
  try {
    await fs.appendFile(mainPath, block, 'utf-8');
  } catch (e) {
    return {
      ok: false,
      fieldErrors: {},
      formError: e instanceof Error ? e.message : 'Failed to write journal',
    };
  }
  return { ok: true };
};
