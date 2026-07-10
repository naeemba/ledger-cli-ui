export type PayeeRow = { payee: string; total: number };

/**
 * Pull the numeric magnitude out of a rendered ledger amount, regardless of
 * where the commodity sits: `$ 1,000.00`, `USD 7`, `1,234.50`, `$ -5.00`.
 * Grabs the first signed number token and strips thousands separators.
 */
const parseAmount = (raw: string): number => {
  const match = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replaceAll(',', '')) || 0 : 0;
};

// Under `-X`, ledger emits a synthetic `Commodities revalued` posting for
// mark-to-market gains. `--by-payee` groups it as if it were a real payee; it
// is not one, so drop it (and any other `<...>` pseudo-payee ledger invents).
const isPseudoPayee = (payee: string): boolean =>
  payee === 'Commodities revalued' || /^<.*>$/.test(payee);

/**
 * Parse `ledger reg ^Expenses --by-payee --collapse -X <base>
 * --sort '-display_amount' --format 'NNN%P|%t\n'` output. Ledger already
 * collapses to one converted row per payee and sorts them descending, so this
 * only maps each `NNN<payee>|<amount>` chunk to a typed row, drops the
 * revaluation pseudo-payee, and keeps positive spend — no JS re-summing or
 * re-sorting (that was the reimplementation ledger does better).
 */
export const parsePayeeRows = (stdout: string): PayeeRow[] => {
  const rows: PayeeRow[] = [];
  for (const chunk of stdout.split('NNN')) {
    const [payee, amount] = chunk.split('|').map((s) => s.trim());
    if (!payee || !amount || isPseudoPayee(payee)) continue;
    const total = parseAmount(amount);
    if (total > 0) rows.push({ payee, total });
  }
  return rows;
};
