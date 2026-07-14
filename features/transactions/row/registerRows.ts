import type { TransactionRowView } from './rowView';
import { uidFromNote } from '@/lib/journal/uid';

// Row separator `NNN`; fields joined by `|`. `%T` (total) may span multiple
// commodities (embedded newlines, no `|`); `%(note)` may itself contain `|`, so
// it is taken as the rejoined remainder after the four fixed leading fields.
export const REGISTER_FORMAT = 'NNN%D|%P|%t|%T|%(note)';

export type RegisterRow = {
  /** Trimmed leading fixed fields (`%D|%P|…`), positional per surface. */
  cols: string[];
  /** Uid extracted from the note (the rejoined remainder after `cols[3]`). */
  uid?: string;
};

/**
 * Splits `ledger reg --format 'NNN…|…'` output into trimmed columns plus the
 * uid carried in the note. Shared by every register surface (account register,
 * dashboard recent, reconcile) so they agree on the malformed-line guard and
 * the note-is-the-remainder rule. A `|` inside a note can't drop the uid, and a
 * short/blank chunk is dropped rather than rendered as an empty row.
 */
export const splitRegisterRows = (stdout: string): RegisterRow[] =>
  stdout
    .split('NNN')
    .map((line) => line.split('|'))
    .filter((cols) => cols.length >= 4 && cols[0].trim())
    .map((cols) => ({
      cols: cols.map((s) => s.trim()),
      uid: uidFromNote(cols.slice(4).join('|')) ?? undefined,
    }));

export const parseAccountRegister = (stdout: string): TransactionRowView[] =>
  splitRegisterRows(stdout).map(({ cols, uid }) => ({
    date: cols[0],
    payee: cols[1],
    amount: cols[2],
    runningTotal: cols[3],
    uid,
  }));
