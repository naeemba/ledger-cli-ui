const SYMBOL_TO_CODE: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₽': 'RUB',
  '₩': 'KRW',
};

const NUMBER_RE = /^-?[\d,]+(?:\.\d+)?$/;

/**
 * Extracts the set of commodity codes appearing in the stdout of
 * `ledger balance --flat --no-total -X <base>` that are NOT the base.
 *
 * Ledger prints each balance row as one or more stacked amounts followed
 * (on the last stacked line) by the account name. An amount takes one of
 * three shapes:
 *   1. `<symbol><number>`            e.g. `$1,234.50`, `€100.00`
 *   2. `<number> <code>`             e.g. `10 Kirt`, `5,000 EUR`
 *   3. `"<quoted name>" <number>`    e.g. `"My Coin" 5`
 *
 * Only the FIRST amount on a line is captured; any trailing whitespace-
 * separated tokens are treated as the account name and ignored.
 */
export const parseUnconverted = (stdout: string, base: string): string[] => {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const found = new Set<string>();

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const commodity = extractCommodity(line);
    // Match the base case-insensitively: a case-variant of the base (e.g. `Kirt`
    // when the base is `KIRT`) is the same currency, not an unconverted holding.
    if (commodity && collator.compare(commodity, base) !== 0) {
      found.add(commodity);
    }
  }

  return Array.from(found).sort(collator.compare);
};

/**
 * Returns the commodity code (symbol mapped to ISO code where known)
 * from the FIRST amount on the line, or null if no amount was found.
 */
const extractCommodity = (line: string): string | null => {
  // Shape 3: leading quoted commodity name -- `"My Coin" 5 ...`
  const quoted = /^"([^"]+)"\s+-?[\d,]+(?:\.\d+)?/.exec(line);
  if (quoted) return quoted[1];

  // Shape 1: leading currency symbol -- `$1,234.50 ...`
  const symbol = /^(\p{Sc})(-?[\d,]+(?:\.\d+)?)/u.exec(line);
  if (symbol) return SYMBOL_TO_CODE[symbol[1]] ?? symbol[1];

  // Shape 2: leading number then commodity code -- `10 Kirt ...`
  const numberFirst = /^(-?[\d,]+(?:\.\d+)?)\s+([A-Za-z][\w-]*)/.exec(line);
  if (numberFirst && NUMBER_RE.test(numberFirst[1])) {
    return numberFirst[2];
  }

  return null;
};
