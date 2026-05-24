export type PeriodicBalanceRow = {
  account: string;
  /** Per-account spend in the period, as ledger emitted it (e.g. "USD 1234.50"). */
  amount: string;
};

/**
 * Parse `ledger bal <query> --format 'NNN%A|%t|%T\n'` output. Each NNN-split
 * chunk is `<account>|<line-amount>|<running-total>`. The chunk where
 * line-amount is "0" is ledger's footer total row — we drop it from the
 * per-account list. (The total is exposed separately via `extractPeriodicTotal`.)
 */
export const parsePeriodicBalanceRows = (
  stdout: string
): PeriodicBalanceRow[] => {
  const rows: PeriodicBalanceRow[] = [];
  for (const chunk of stdout.split('NNN')) {
    if (!chunk) continue;
    const parts = chunk.split('|');
    if (parts.length < 2) continue;
    const account = parts[0].trim();
    const line = parts[1]?.split('\n')[0]?.trim() ?? '';
    if (!account) continue;
    if (line === '0') continue;
    rows.push({ account, amount: line });
  }
  return rows;
};

/** Extract the running-total value from the footer row (where %t === '0'). */
export const extractPeriodicTotal = (stdout: string): string => {
  for (const chunk of stdout.split('NNN')) {
    if (!chunk) continue;
    const parts = chunk.split('|');
    if (parts.length < 3) continue;
    const line = parts[1]?.split('\n')[0]?.trim() ?? '';
    if (line === '0') return (parts[2]?.split('\n')[0] ?? '').trim();
  }
  return '';
};
