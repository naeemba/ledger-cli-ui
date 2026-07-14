import { uidFromNote } from '@/lib/journal/uid';

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
 * Parses the `NNN%D|%P|%A|%t|%(note)\n` output of
 * `ledger reg --uncleared --sort date` into typed rows, dropping malformed
 * lines. Row order is ledger's (oldest-first) — no JS re-sort. `now` is
 * injected so the `days` field is deterministic in tests. The note is the
 * rejoined remainder after the fixed fields, so a `|` inside a note can't
 * drop the uid.
 */
export const parseReconcileRows = (
  stdout: string,
  now: number = Date.now()
): ReconcileRow[] => {
  return stdout
    .split('NNN')
    .map((line) => line.split('|'))
    .filter((cols) => cols.length >= 4 && cols[0].trim())
    .map((cols) => {
      const [date, payee, account, amount] = cols.map((s) => s.trim());
      const days = Math.floor((now - new Date(date).getTime()) / 86_400_000);
      const uid = uidFromNote(cols.slice(4).join('|')) ?? undefined;
      return { date, payee, account, amount, days, uid };
    });
};
