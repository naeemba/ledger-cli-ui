import type { DraftState, DraftAction } from './draftReducer';
import { parseBlock } from '@/lib/journal/parser';
import { formatLedgerText } from '@/lib/ledger/format';
import { Transaction } from '@/lib/transactions/model';

export const PARSE_ERROR =
  'Could not parse this as a transaction. Check the date/payee header and that each posting has an account.';

const unparsedLineError = (line: string): string =>
  `Could not parse this line: "${line.trim()}". Each posting needs an account, ` +
  'and an amount must be separated from the account by two or more spaces.';

export type RawTextResult = {
  error: string | null;
  action: DraftAction | null;
};

/** Pure decision for the Raw editor's onChange: parse `value`, returning either
 *  a human error or the `replaceAll` action to dispatch. */
export const applyRawText = (
  value: string,
  draft: DraftState
): RawTextResult => {
  const block = parseBlock(value);
  if (!block || block.postings.length === 0) {
    return { error: PARSE_ERROR, action: null };
  }
  if (block.unparsedLines.length > 0) {
    return { error: unparsedLineError(block.unparsedLines[0]), action: null };
  }
  return {
    error: null,
    action: {
      type: 'replaceAll',
      state: Transaction.fromParsedBlock(block, draft),
    },
  };
};

/** Whether the raw text differs from how the editor opened. Compares the text
 *  itself, not the parsed draft, so a half-typed line that does not parse yet
 *  still counts. Both sides go through the formatter, so the re-align the
 *  editor applies on blur does not count as an edit. */
export const isRawTextEdited = (openedText: string, currentText: string) =>
  formatLedgerText(currentText) !== formatLedgerText(openedText);
