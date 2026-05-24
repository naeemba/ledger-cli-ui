import type { ReconcileRow } from '@/features/reconcile/Reconcile.utils';
import { formatRow } from '@/lib/csv';

// Note: the underlying parser doesn't expose status today; the reconcile
// page shows only uncleared rows so status is implicitly "pending" or
// "none". The export omits the column for v1 — see plan deviation note.
const COLUMNS = ['date', 'payee', 'account', 'amount', 'currency'] as const;

export const reconcileRowsToCsv = (
  rows: ReconcileRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.date, r.payee, r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
