import {
  FIELD_SEPARATOR,
  RECORD_SEPARATOR,
} from '@/features/transactions/row/registerRows';
import parseAmountColumn from '@/utils/parseAmountColumn';

export type PayeeRow = { payee: string; total: number };

// Format for the by-payee register surfaces (Payees page + CSV export). A
// payee is free text, so it uses the shared control-char separators instead of
// a printable marker that could appear inside a payee.
export const PAYEE_REGISTER_FORMAT = `${RECORD_SEPARATOR}%P${FIELD_SEPARATOR}%t\n`;

// Under `-X`, ledger emits a synthetic `Commodities revalued` posting for
// mark-to-market gains. `--by-payee` groups it as if it were a real payee; it
// is not one, so drop it (and any other `<...>` pseudo-payee ledger invents).
const isPseudoPayee = (payee: string): boolean =>
  payee === 'Commodities revalued' || /^<.*>$/.test(payee);

/**
 * Parse `ledger reg ^Expenses --by-payee --collapse -X <base>
 * --sort '-display_amount' --format PAYEE_REGISTER_FORMAT` output. Ledger
 * already collapses to one converted row per payee and sorts them descending,
 * so this only maps each `<payee><FIELD_SEPARATOR><amount>` record to a typed
 * row, drops the revaluation pseudo-payee, and keeps positive spend — no JS
 * re-summing or re-sorting (that was the reimplementation ledger does better).
 */
export const parsePayeeRows = (stdout: string): PayeeRow[] => {
  const rows: PayeeRow[] = [];
  for (const chunk of stdout.split(RECORD_SEPARATOR)) {
    const [payee, amount] = chunk.split(FIELD_SEPARATOR).map((s) => s.trim());
    if (!payee || !amount || isPseudoPayee(payee)) continue;
    const total = parseAmountColumn(amount);
    if (total > 0) rows.push({ payee, total });
  }
  return rows;
};
