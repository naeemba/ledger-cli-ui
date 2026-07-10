import parseAmountColumn from '@/utils/parseAmountColumn';

export type NetWorthRow = { date: string; value: number };

/**
 * Parse `ledger reg ^Assets ^Liabilities --monthly --format 'NNN%D|%T\n'`
 * output. Each `NNN`-separated chunk is `<YYYY-MM-DD>|<amount>`. The date
 * is ledger's end-of-month timestamp; we preserve it verbatim for the export.
 */
export const parseNetWorthRows = (stdout: string): NetWorthRow[] => {
  const rows: NetWorthRow[] = [];
  for (const line of stdout.split('NNN')) {
    const [date, amount] = line.split('|').map((s) => s?.trim() ?? '');
    if (!date || !amount) continue;
    rows.push({ date, value: parseAmountColumn(amount) });
  }
  return rows;
};
