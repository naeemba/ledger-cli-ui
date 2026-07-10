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
 * Extract the base-currency grand total from a dedicated
 * `balance <prefix> -X CCY --depth 1 --format '%A|%T\n'` run.
 *
 * `--depth 1` collapses the whole prefix subtree into a single account row
 * whose `%T` is the rollup total. Ledger prints the report (base) commodity
 * first, on the account-anchored line; any unconvertible commodities spill
 * onto trailing continuation lines with no account column (and no `|`). We
 * return the amount from the first account-anchored line, so an unpriced
 * holding can never masquerade as the Total (the old "last non-empty line"
 * heuristic returned e.g. `100 XYZ` instead of the converted sum).
 */
export const extractTotal = (depthOneStdout: string): string => {
  for (const line of splitRows(depthOneStdout)) {
    const pipe = line.indexOf('|');
    if (pipe === -1) continue; // continuation line for an unpriced commodity
    const account = line.slice(0, pipe).trim();
    if (!account) continue;
    return line.slice(pipe + 1).trim();
  }
  return '';
};
