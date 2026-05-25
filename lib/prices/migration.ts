import type { CommodityPriceRow } from './formatter';

const LINE_RE =
  /^P\s+(\d{4})[/-](\d{2})[/-](\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?\s+(\S+)\s+([0-9.]+)\s+(\S+)\s*$/;

/**
 * Best-effort parse of a pre-existing price-db.ledger. Returns one row per
 * recognized `P` directive; silently skips comments, blank lines, and
 * malformed entries. Caller is responsible for upserting into commodity_price.
 */
export const parseLegacyPriceDb = (
  text: string
): Omit<CommodityPriceRow, 'id'>[] => {
  const out: Omit<CommodityPriceRow, 'id'>[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [
      ,
      y,
      mo,
      d,
      hh = '00',
      mm = '00',
      ss = '00',
      symbol,
      priceStr,
      quote,
    ] = m;
    const price = Number(priceStr);
    if (!Number.isFinite(price)) continue;
    const fetchedAt = new Date(
      Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss)
      )
    );
    out.push({
      symbol,
      quote,
      price,
      fetchedAt,
      fetchedDate: `${y}-${mo}-${d}`,
    });
  }
  return out;
};
