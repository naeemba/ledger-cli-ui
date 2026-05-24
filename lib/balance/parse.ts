export type BalanceRow = {
  account: string;
  /** Numeric amount as ledger emitted it (e.g. "1,234.50", "-200.00"). */
  amount: string;
};

/**
 * Parse `ledger balance --format '%A|%T\n'` output. Each non-empty line is
 * `<account>|<amount>`. Ledger's footer total comes through as an empty
 * account; we re-label it "Total" so the CSV export carries it explicitly.
 */
export const parseBalanceRows = (stdout: string): BalanceRow[] => {
  const rows: BalanceRow[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.includes('|')) continue;
    const [accountRaw, amountRaw] = line.split('|');
    const account = accountRaw.trim();
    const amount = (amountRaw ?? '').trim();
    if (!amount) continue;
    rows.push({ account: account || 'Total', amount });
  }
  return rows;
};
