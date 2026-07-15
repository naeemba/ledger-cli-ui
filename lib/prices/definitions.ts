/**
 * Map every commodity-block `alias` to its canonical `commodity` symbol, e.g.
 * `commodity BITCOIN` / `alias BTC` yields `BTC -> BITCOIN`. Used to canonicalize
 * price rows so the generated price DB never references an alias as a bare
 * commodity: ledger auto-vivifies a commodity from a `P` line's symbol/quote, so
 * a later `alias BTC` in the journal would collide with that auto-created `BTC`
 * and abort the parse (pool.cc assertion).
 *
 * Only picks up `alias` directives indented inside a `commodity` block — a
 * non-indented line closes the block, and a top-level `alias Old=New` is an
 * account alias, not a commodity one.
 */
export const parseAliasMap = (text: string): Map<string, string> => {
  const map = new Map<string, string>();
  let currentCommodity: string | null = null;
  const unquote = (value: string): string =>
    value.trim().replace(/^"(.*)"$/, '$1');
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    const commodityMatch = /^commodity\s+(.+)$/.exec(trimmed);
    if (commodityMatch) {
      currentCommodity = unquote(commodityMatch[1]);
      continue;
    }

    const aliasMatch = /^alias\s+(.+)$/.exec(trimmed);
    // Only an indented alias belongs to the enclosing commodity block.
    if (aliasMatch && currentCommodity && /^\s/.test(line)) {
      map.set(unquote(aliasMatch[1]), currentCommodity);
      continue;
    }

    if (trimmed && !/^\s/.test(line)) currentCommodity = null;
  }
  return map;
};
