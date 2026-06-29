import { StreamLanguage } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/** Minimal ledger tokenizer for highlighting: date, status, account, amount,
 *  comment. Mapped to CodeMirror's default highlight tags. */
export const ledgerLanguage = (): Extension =>
  StreamLanguage.define({
    token(stream) {
      if (stream.sol() && stream.match(/\d{4}[-/]\d{2}[-/]\d{2}/)) {
        return 'keyword'; // date
      }
      if (stream.match(/^\s*;.*/)) return 'comment';
      if (stream.match(/[*!](?=\s)/)) return 'operator'; // status marker
      if (stream.match(/-?\d[\d,]*(?:\.\d+)?/)) return 'number'; // amount
      if (stream.match(/[A-Za-z][\w-]*(?::[\w-]+)+/)) return 'variableName'; // account
      stream.next();
      return null;
    },
  });
