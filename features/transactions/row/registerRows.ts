import type { TransactionRowView } from './rowView';
import { uidFromNote } from '@/lib/journal/uid';

// Row separator `NNN`; fields joined by `|`. `%T` (total) may span multiple
// commodities (embedded newlines, no `|`); `%(note)` may itself contain `|`, so
// it is taken as the rejoined remainder after the four fixed leading fields.
export const REGISTER_FORMAT = 'NNN%D|%P|%t|%T|%(note)';

export const parseAccountRegister = (stdout: string): TransactionRowView[] =>
  stdout
    .split('NNN')
    .filter(Boolean)
    .map((chunk) => {
      const cols = chunk.split('|');
      const date = (cols[0] ?? '').trim();
      const payee = (cols[1] ?? '').trim();
      const amount = (cols[2] ?? '').trim();
      const runningTotal = (cols[3] ?? '').trim();
      const note = cols.slice(4).join('|');
      const uid = uidFromNote(note) ?? undefined;
      return { date, payee, amount, runningTotal, uid };
    });
