import { BANNER_MARKER } from './formatter';

/**
 * A `P <date> <symbol> <price> <quote>` price directive — the only content the
 * generated price DB is meant to hold. Mirrors the matcher in `migration.ts`
 * (kept as a separate literal so the two files stay independently readable).
 */
const PRICE_LINE =
  /^P\s+\d{4}[/-]\d{2}[/-]\d{2}(?:\s+\d{2}:\d{2}:\d{2})?\s+\S+\s+[0-9.]+\s+\S+\s*$/;

/**
 * Separate a price-db file's *definitions* (commodity/account/tag directives,
 * user comments) from its `P` price directives. Historically users kept
 * `commodity`/`alias`/`account` declarations in `price-db.ledger`, but the price
 * fetcher owns that file and rewrites it with prices only — silently dropping
 * those declarations. This extractor recovers them so they can be relocated
 * into the main journal, where the fetcher never touches them.
 *
 * Drops `P` directives (they live in the DB / generated file) and our own
 * AUTO-GENERATED banner comments. Preserves every other line verbatim,
 * including user comments, and collapses only the leading/trailing blank runs.
 */
export const extractDefinitions = (text: string): string => {
  const kept: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (PRICE_LINE.test(trimmed)) continue;
    if (trimmed.includes(BANNER_MARKER)) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
};

/**
 * True when the file carries at least one real definition — a non-blank,
 * non-comment line that survives {@link extractDefinitions}. A file that is
 * only prices, blanks, and comments has nothing worth relocating.
 */
export const hasDefinitions = (text: string): boolean =>
  extractDefinitions(text)
    .split('\n')
    .some((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith(';');
    });
