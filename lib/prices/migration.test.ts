import { describe, it, expect } from 'vitest';
import { parseLegacyPriceDb } from './migration';

describe('parseLegacyPriceDb', () => {
  it('parses P lines with date + time', () => {
    const out = parseLegacyPriceDb('P 2026/05/25 06:00:00 BTC 67000.5 USD\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'BTC',
      quote: 'USD',
      price: 67000.5,
      fetchedDate: '2026-05-25',
    });
    expect(out[0].fetchedAt.toISOString()).toMatch(/^2026-05-25T/);
  });

  it('parses P lines without time', () => {
    const out = parseLegacyPriceDb('P 2026/05/25 BTC 67000.5 USD\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'BTC',
      quote: 'USD',
      price: 67000.5,
    });
  });

  it('parses dashed dates (2026-05-25)', () => {
    const out = parseLegacyPriceDb('P 2026-05-25 BTC 67000 USD\n');
    expect(out).toHaveLength(1);
    expect(out[0].fetchedDate).toBe('2026-05-25');
  });

  it('skips comments and blank lines', () => {
    const text = [
      '; a comment',
      '',
      'P 2026/05/25 BTC 67000 USD',
      '   ; indented comment',
    ].join('\n');
    expect(parseLegacyPriceDb(text)).toHaveLength(1);
  });

  it('skips malformed lines', () => {
    const text = ['P malformed', 'P 2026/05/25 BTC', 'random text'].join('\n');
    expect(parseLegacyPriceDb(text)).toHaveLength(0);
  });

  it('handles multiple lines in order', () => {
    const text = [
      'P 2026/05/24 BTC 65000 USD',
      'P 2026/05/25 BTC 67000 USD',
    ].join('\n');
    const out = parseLegacyPriceDb(text);
    expect(out.map((r) => r.fetchedDate)).toEqual(['2026-05-24', '2026-05-25']);
  });
});
