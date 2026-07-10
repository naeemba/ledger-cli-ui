import parseAmountColumn from '@/utils/parseAmountColumn';

export type CashFlowRow = {
  date: Date;
  income: number;
  expenses: number;
};

/**
 * Parse `ledger reg <query> --monthly -X <ccy> --format 'NNN%D|%A|%t\n'` output
 * into per-month totals. Each `NNN`-separated chunk is
 * `<YYYY-MM-DD>|<account>|<amount>`.
 *
 * Two subtleties this handles:
 *  - `-X` conversion injects synthetic `<Adjustment>` / `<Revalued>` postings
 *    that inherit a real payee; rows whose account begins with `<` are skipped
 *    so they are never summed into a month's total.
 *  - A single month can match postings across several accounts, so amounts for
 *    the same date are accumulated rather than overwritten (the bug this fixes).
 */
export const parseMonthlyTotals = (stdout: string): Map<string, number> => {
  const map = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [date, account, amount] = line.split('|').map((s) => s?.trim() ?? '');
    if (!date || !amount) continue;
    if (account.startsWith('<')) continue;
    map.set(date, (map.get(date) ?? 0) + parseAmountColumn(amount));
  }
  return map;
};
