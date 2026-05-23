// `ledger bal <prefix> [-X CCY] --flat --format '%A|%T\n'` emits one
// `account|amount` row per leaf account, plus a trailing total. This helper
// parses that into typed rows and merges native + converted views by account.

export type NativeRow = {
  account: string;
  /** Native amount including unit/commodity, exactly as ledger emitted it. */
  raw: string;
};

export type PortfolioRow = {
  account: string;
  /** e.g. "10 AAPL", "1500 USD", "0.5 BTC" — whatever the source journal uses. */
  native: string;
  /** Converted to the user's default currency; empty string if conversion was missing. */
  converted: string;
};

const splitRows = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export const parseNativeRows = (stdout: string): NativeRow[] => {
  const rows: NativeRow[] = [];
  for (const line of splitRows(stdout)) {
    const [account, raw] = line.split('|');
    if (!account || !raw) continue;
    rows.push({ account: account.trim(), raw: raw.trim() });
  }
  return rows;
};

/**
 * Combine a native-balance ledger dump with a converted-balance one. The
 * converted output is grouped by the same accounts; rows are joined on the
 * account key. The final row in each ledger output is the rollup total,
 * which appears with an empty account column — we skip it.
 *
 * Trailing total: ledger emits an empty-account total row at the end of
 * --flat output when there are 2+ accounts. The caller wants per-account
 * rows only; the total is computed separately via the converted call.
 */
export const mergePortfolio = (
  nativeStdout: string,
  convertedStdout: string
): PortfolioRow[] => {
  const native = parseNativeRows(nativeStdout);
  const converted = new Map(
    parseNativeRows(convertedStdout).map((r) => [r.account, r.raw])
  );
  return native.map(({ account, raw }) => ({
    account,
    native: raw,
    converted: converted.get(account) ?? '',
  }));
};

/**
 * Extract the rollup total from `ledger bal` `-X CCY` output. ledger prints
 * the total as a final indented line; we grab the very last non-empty line
 * and strip the account column.
 */
export const extractTotal = (convertedStdout: string): string => {
  const lines = splitRows(convertedStdout);
  if (lines.length === 0) return '';
  const last = lines[lines.length - 1];
  const parts = last.split('|');
  // Final total row in `--flat` mode has an empty account column.
  return (parts[1] ?? parts[0] ?? '').trim();
};
