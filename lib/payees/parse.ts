export type PayeeRow = { payee: string; total: number };

const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', '')) || 0;
};

/**
 * Parse `ledger reg ^Expenses ... --format 'NNN%P|%t\n'` output: each
 * `NNN`-separated chunk is `<payee>|<amount>`. Aggregate per payee, drop
 * zero/negative rows, sort descending — matches what the payees page does
 * inline (kept identical for byte-for-byte parity).
 */
export const parsePayeeRows = (stdout: string): PayeeRow[] => {
  const totals = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [payee, amount] = line.split('|').map((s) => s.trim());
    if (!payee || !amount) continue;
    totals.set(payee, (totals.get(payee) ?? 0) + parseAmount(amount));
  }
  return Array.from(totals.entries())
    .map(([payee, total]) => ({ payee, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
};
