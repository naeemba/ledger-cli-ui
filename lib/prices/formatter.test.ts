import { describe, it, expect } from 'vitest';
import { renderPriceDb, hasGeneratedBanner, BANNER_MARKER } from './formatter';

const sampleRows = [
  {
    id: 1,
    symbol: 'BTC',
    quote: 'EUR',
    price: 67234.12,
    fetchedAt: new Date('2026-05-25T06:00:00.000Z'),
    fetchedDate: '2026-05-25',
  },
  {
    id: 2,
    symbol: 'ADA',
    quote: 'EUR',
    price: 0.41,
    fetchedAt: new Date('2026-05-25T06:00:00.000Z'),
    fetchedDate: '2026-05-25',
  },
];

describe('renderPriceDb', () => {
  it('emits the AUTO-GENERATED banner', () => {
    const out = renderPriceDb(sampleRows);
    expect(out).toContain(BANNER_MARKER);
    expect(out).toContain('Do not edit by hand');
  });

  it('emits one P line per row', () => {
    const out = renderPriceDb(sampleRows);
    expect(out).toContain('P 2026/05/25 06:00:00 BTC 67234.12 EUR');
    expect(out).toContain('P 2026/05/25 06:00:00 ADA 0.41 EUR');
  });

  it('ends with a trailing newline', () => {
    const out = renderPriceDb(sampleRows);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('emits banner-only output for empty input', () => {
    const out = renderPriceDb([]);
    expect(out).toContain(BANNER_MARKER);
    expect(out).not.toMatch(/^P /m);
  });

  it('double-quotes a symbol or quote that ledger cannot read bare', () => {
    const out = renderPriceDb([
      {
        symbol: 'Real Estate',
        quote: 'د.إ',
        price: 100,
        fetchedAt: new Date('2026-05-25T06:00:00.000Z'),
        fetchedDate: '2026-05-25',
      },
    ]);
    expect(out).toContain('P 2026/05/25 06:00:00 "Real Estate" 100 "د.إ"');
  });

  it('leaves bare-safe tickers unquoted', () => {
    const out = renderPriceDb([
      {
        symbol: '$',
        quote: 'USD',
        price: 1,
        fetchedAt: new Date('2026-05-25T06:00:00.000Z'),
        fetchedDate: '2026-05-25',
      },
    ]);
    expect(out).toContain('P 2026/05/25 06:00:00 $ 1 USD');
  });
});

describe('hasGeneratedBanner', () => {
  it('returns true when the marker is present', () => {
    expect(hasGeneratedBanner(renderPriceDb(sampleRows))).toBe(true);
  });

  it('returns false for arbitrary text', () => {
    expect(hasGeneratedBanner('P 2026/01/01 BTC 50000 USD')).toBe(false);
    expect(hasGeneratedBanner('')).toBe(false);
  });
});
