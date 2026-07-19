import type { TransactionRowView } from './rowView';
import { uidFromNote } from '@/lib/journal/uid';

// Record/field separators for `ledger reg --format`. ASCII RS (0x1e) and US
// (0x1f) are used instead of a printable marker because a printable one
// collides with content: ULID uids (carried in `%(note)`) draw from an
// alphabet that includes the letter, and a payee/note is free text — a marker
// like "NNN" appears inside a uid such as `01HZXNNN…`, splitting mid-record and
// rendering the next chunk as an "Invalid Date" row. Control chars can never
// occur in a date, amount, ULID, or a normally-typed note.
export const RECORD_SEPARATOR = '\x1e';
export const FIELD_SEPARATOR = '\x1f';

// Compose a register format from a field list, e.g. `['%D', '%P', '%A', '%t']`
// followed by `%(note)`. Keeps every splitRegisterRows caller on the same
// separators so the split below stays correct.
export const registerFormat = (leadingFields: string[]): string =>
  `${RECORD_SEPARATOR}${[...leadingFields, '%(note)'].join(FIELD_SEPARATOR)}\n`;

// Row separator `RECORD_SEPARATOR`; fields joined by `FIELD_SEPARATOR`. `%T` (total) may
// span multiple commodities (embedded newlines, no field sep); `%(note)` is
// taken as the rejoined remainder after the four fixed leading fields.
export const REGISTER_FORMAT = registerFormat(['%D', '%P', '%t', '%T']);

export type RegisterRow = {
  /** Trimmed leading fixed fields, positional per surface. */
  cols: string[];
  /** Uid extracted from the note (the rejoined remainder after `cols[3]`). */
  uid?: string;
};

/**
 * Splits `ledger reg --format` output into trimmed columns plus the uid carried
 * in the note. Shared by every register surface (account register, reconcile)
 * so they agree on the malformed-line guard and the note-is-the-remainder rule.
 * A short/blank chunk is dropped rather than rendered as an empty row.
 */
export const splitRegisterRows = (stdout: string): RegisterRow[] =>
  stdout
    .split(RECORD_SEPARATOR)
    .map((line) => line.split(FIELD_SEPARATOR))
    .filter((cols) => cols.length >= 4 && cols[0].trim())
    .map((cols) => ({
      cols: cols.map((s) => s.trim()),
      uid: uidFromNote(cols.slice(4).join(FIELD_SEPARATOR)) ?? undefined,
    }));

export const parseAccountRegister = (stdout: string): TransactionRowView[] =>
  splitRegisterRows(stdout).map(({ cols, uid }) => ({
    date: cols[0],
    payee: cols[1],
    amount: cols[2],
    runningTotal: cols[3],
    uid,
  }));
