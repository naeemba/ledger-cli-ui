import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

/** Minimal ledger tokenizer: date, status, account, amount, comment. */
const ledgerTokens = StreamLanguage.define({
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

// Account text and comments defer to the app's CSS variables so they track the
// active (light/dark) theme; the date/status/amount accents are picked to read
// on both backgrounds.
const ledgerHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#8b5cf6' }, // date
  { tag: t.operator, color: '#d97706' }, // status marker (* / !)
  { tag: t.number, color: '#16a34a' }, // amount
  { tag: t.variableName, color: 'var(--foreground)' }, // account
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
]);

/** Ledger syntax highlighting: the tokenizer plus a theme-aware highlight
 *  style. The style is registered without `fallback`, so it takes precedence
 *  over basicSetup's light-tuned default highlight style. */
export const ledgerLanguage = (): Extension => [
  ledgerTokens,
  syntaxHighlighting(ledgerHighlightStyle),
];
