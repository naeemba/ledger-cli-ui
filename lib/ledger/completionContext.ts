export type CompletionLists = {
  accounts: string[];
  payees: string[];
  commodities: string[];
};

export type LedgerCompletion = { from: number; options: string[] };

const HEADER_PREFIX = /^(\d{4}[-/]\d{2}[-/]\d{2}\s+(?:[*!]\s+)?)(.*)$/;

const filterList = (options: string[], token: string): string[] => {
  const needle = token.toLowerCase();
  return options.filter(
    (o) => o.toLowerCase().includes(needle) && o.toLowerCase() !== needle
  );
};

const result = (from: number, options: string[]): LedgerCompletion | null =>
  options.length > 0 ? { from, options } : null;

/**
 * Resolve which ledger suggestion list applies at `pos`, based only on the
 * text of the current line up to the caret. Returns the replacement start
 * offset and the filtered options, or null when nothing should be suggested.
 */
export const completionAt = (
  doc: string,
  pos: number,
  lists: CompletionLists
): LedgerCompletion | null => {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const isFirstLine = lineStart === 0;
  const upToCaret = doc.slice(lineStart, pos);

  // Header line: complete the payee after the date (and optional status).
  if (isFirstLine) {
    const m = upToCaret.match(HEADER_PREFIX);
    if (!m) return null; // still typing the date
    const payeeToken = m[2];
    const from = lineStart + m[1].length;
    return result(from, filterList(lists.payees, payeeToken));
  }

  // Posting line must be indented.
  if (!/^\s/.test(upToCaret)) return null;

  // An amount gap (2+ spaces or a tab after the account) splits the line into
  // account region (before) and amount/commodity region (after).
  const gap = upToCaret.match(/\s{2,}|\t+/g);
  const hasAmountGap = / {2,}|\t/.test(upToCaret.replace(/^\s+/, ''));

  if (hasAmountGap) {
    // Commodity region: token = text after the last whitespace run.
    const token = upToCaret.slice(upToCaret.search(/\S*$/));
    const from = pos - token.length;
    return result(from, filterList(lists.commodities, token));
  }

  // Account region: token = the indented account text typed so far.
  const token = upToCaret.replace(/^\s+/, '');
  const from = pos - token.length;
  void gap;
  return result(from, filterList(lists.accounts, token));
};
