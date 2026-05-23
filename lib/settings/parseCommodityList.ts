/**
 * Parses the stdout of `ledger commodities` into a deduplicated, sorted list
 * with `base` pinned to the front. Strips one optional pair of surrounding
 * double quotes (ledger emits "My Coin" for whitespace-containing names).
 */
export const parseCommodityList = (stdout: string, base: string): string[] => {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of stdout.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('"') && line.endsWith('"') && line.length >= 2) {
      line = line.slice(1, -1);
    }
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }

  const rest = out.filter((c) => c !== base).sort(collator.compare);
  return [base, ...rest];
};
