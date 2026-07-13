import { promises as fs } from 'fs';
import path from 'path';
import 'server-only';
import { VALID_EXTS, GENERATED_PRICE_DB_NAME, PRICE_DB_NAME } from './layout';
import { withUserLock } from './mutex';
import { verifyJournalParseable } from './verify';
import { parseBalanceRows } from '@/lib/balance/parse';
import { journalRepository } from '@/lib/journal';
import { pull, push, StorageConflictError } from '@/lib/storage';
import { runLedgerForUser } from '@/utils/runLedgerForUser';
import { revalidatePath } from 'next/cache';

// Legacy debts lived under one signed account per person. The current model
// splits them: money owed TO you is an asset, money you owe is a liability.
export const LEGACY_ROOT = 'Assets:Credited';
export const RECEIVABLE_ROOT = 'Assets:Receivable';
export const PAYABLE_ROOT = 'Liabilities:Payable';

/**
 * Target account for a legacy `Assets:Credited:<rest>` account, keyed by the
 * SIGN of its net balance (from ledger — never summed here). A non-negative net
 * means the balance is owed to you → receivable; a negative net means you owe
 * it → payable. Only the `Assets:Credited` prefix is swapped; the person path
 * (`<rest>`, any depth) is preserved.
 */
export const targetAccount = (account: string, netSign: number): string => {
  const rest = account.slice(LEGACY_ROOT.length); // includes the leading ':'
  const root = netSign < 0 ? PAYABLE_ROOT : RECEIVABLE_ROOT;
  return `${root}${rest}`;
};

/**
 * Build the rename map from `ledger balance Assets:Credited` output formatted
 * `<account>|<signed-quantity>`. Each legacy account maps to its receivable or
 * payable target. Rows whose amount is empty (or the footer Total row) are
 * skipped. Ledger did the netting; this only reads the sign.
 */
export const planRenames = (balanceOutput: string): Map<string, string> => {
  const renames = new Map<string, string>();
  for (const row of parseBalanceRows(balanceOutput)) {
    if (row.account === 'Total' || !row.account.startsWith(`${LEGACY_ROOT}:`)) {
      continue;
    }
    const sign = Number(row.amount.replace(/,/g, ''));
    if (!Number.isFinite(sign)) continue;
    renames.set(row.account, targetAccount(row.account, sign));
  }
  return renames;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace whole-account occurrences of each legacy account in the journal text,
 * preserving everything else. The boundaries `(?<![\w:])`/`(?![\w:])` stop a
 * shorter name from matching inside a longer sibling (`:Alex` inside
 * `:Alexander`); longest names are rewritten first for the same reason. Returns
 * the new text and how many occurrences changed.
 */
export const rewriteAccounts = (
  text: string,
  renames: Map<string, string>
): { text: string; count: number } => {
  let count = 0;
  let output = text;
  const accounts = [...renames.keys()].sort((a, b) => b.length - a.length);
  for (const account of accounts) {
    const pattern = new RegExp(
      `(?<![\\w:])${escapeRegExp(account)}(?![\\w:])`,
      'g'
    );
    output = output.replace(pattern, () => {
      count += 1;
      return renames.get(account)!;
    });
  }
  return { text: output, count };
};

export type MigrateResult =
  | { status: 'skipped' }
  | { status: 'migrated'; renamed: string[]; occurrences: number };

/**
 * One-shot migration of the legacy `Assets:Credited:<person>` debts model to
 * the current split model: each person account becomes `Assets:Receivable` (net
 * owed to you) or `Liabilities:Payable` (net you owe), decided by ledger's net
 * sign — no summation here. A pure account rename, so every transaction stays
 * balanced and the change is reversible.
 *
 * Mirrors relocateLegacyDefinitions: takes the per-user lock, pulls fresh,
 * snapshots every touched file, rewrites, verifies the result parses, and rolls
 * back on any failure before pushing. Idempotent — `skipped` once no
 * `Assets:Credited` account remains.
 */
export const migrateCreditedToDebts = async (
  userId: string,
  repo = journalRepository
): Promise<MigrateResult> => {
  return withUserLock(userId, async () => {
    try {
      await pull(userId);
    } catch {
      // Locked/encrypted (no DEK) or transient storage error: never write
      // plaintext over ciphertext. A later attempt retries once decryptable.
      return { status: 'skipped' };
    }

    const layout = await repo.ensureLayout(userId);
    // `--empty` includes zero-balance accounts so every posting-bearing legacy
    // account is in the rename map — otherwise a hidden zero sibling like
    // `Assets:Credited:Bob Smith` could be partially matched by an
    // `Assets:Credited:Bob` rule.
    const balance = await runLedgerForUser(userId, [
      'balance',
      '--empty',
      '--flat',
      '--no-total',
      '--format',
      '%(account)|%(quantity(scrub(total)))\n',
      LEGACY_ROOT,
    ]);
    const renames = planRenames(balance);
    if (renames.size === 0) return { status: 'skipped' };

    // Rewrite every journal file in the dir (main + includes), skipping the
    // price DBs. Snapshot originals so a failed verify restores all of them.
    const entries = await fs.readdir(layout.dir);
    const priceFiles = new Set([PRICE_DB_NAME, GENERATED_PRICE_DB_NAME]);
    const targets = entries.filter(
      (name) =>
        VALID_EXTS.includes(path.extname(name).toLowerCase()) &&
        !priceFiles.has(name)
    );

    const snapshots = new Map<string, string>();
    let occurrences = 0;
    try {
      for (const name of targets) {
        const absPath = path.join(layout.dir, name);
        const original = await repo.readFile(absPath);
        const { text, count } = rewriteAccounts(original, renames);
        if (count === 0) continue;
        snapshots.set(absPath, original);
        occurrences += count;
        await repo.writeFileAtomic(absPath, text);
      }

      if (occurrences === 0) return { status: 'skipped' };

      const verify = await verifyJournalParseable(layout.mainPath);
      if (!verify.ok) {
        throw new Error(
          `ledger rejected the migrated journal: ${verify.message}`
        );
      }
      await push(userId);
    } catch (error) {
      // Restore every file we touched so the journal is exactly as before.
      for (const [absPath, original] of snapshots) {
        await repo.writeFileAtomic(absPath, original);
      }
      if (error instanceof StorageConflictError) return { status: 'skipped' };
      throw error;
    }

    try {
      revalidatePath('/', 'layout');
    } catch {
      // no-op outside the Next.js runtime
    }
    return {
      status: 'migrated',
      renamed: [...renames.keys()],
      occurrences,
    };
  });
};
