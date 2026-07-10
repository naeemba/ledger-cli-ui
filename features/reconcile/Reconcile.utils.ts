export type ReconcileRow = {
  date: string;
  payee: string;
  account: string;
  amount: string;
  /** Days since `date`, inclusive of today. */
  days: number;
};

/**
 * Parses the `NNN%D|%P|%A|%t\n` output of `ledger reg --uncleared --sort date`
 * into typed rows, dropping malformed lines. Row order is ledger's
 * (oldest-first) — no JS re-sort. `now` is injected so the `days` field is
 * deterministic in tests.
 */
export const parseReconcileRows = (
  stdout: string,
  now: number = Date.now()
): ReconcileRow[] => {
  return stdout
    .split('NNN')
    .map((line) => line.split('|').map((s) => s.trim()))
    .filter((cols) => cols.length >= 4 && cols[0])
    .map(([date, payee, account, amount]) => {
      const d = new Date(date);
      const days = Math.floor((now - d.getTime()) / 86_400_000);
      return { date, payee, account, amount, days };
    });
};
