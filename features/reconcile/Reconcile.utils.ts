import { splitRegisterRows } from '@/features/transactions/row/registerRows';

export type ReconcileRow = {
  date: string;
  payee: string;
  account: string;
  amount: string;
  /** Days since `date`, inclusive of today. */
  days: number;
  uid?: string;
};

/**
 * Parses the `registerFormat(['%D', '%P', '%A', '%t'])` output of
 * `ledger reg --uncleared --sort date` into typed rows, dropping malformed
 * lines. Row order is ledger's (oldest-first) — no JS re-sort. `now` is
 * injected so the `days` field is deterministic in tests.
 */
export const parseReconcileRows = (
  stdout: string,
  now: number = Date.now()
): ReconcileRow[] =>
  splitRegisterRows(stdout).map(({ cols, uid }) => {
    const [date, payee, account, amount] = cols;
    const days = Math.floor((now - new Date(date).getTime()) / 86_400_000);
    return { date, payee, account, amount, days, uid };
  });
