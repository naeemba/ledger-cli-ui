import { describe, it, expect } from 'vitest';
import {
  parsePriceHistory,
  ageInDays,
  deriveSource,
  latestGenuinePrice,
  priceKey,
  STALE_THRESHOLD_DAYS,
  parseBaseBalance,
  BALANCE_BASE_FORMAT,
} from './knownPrices';

describe('parsePriceHistory', () => {
  it('parses date|quantity|quote rows into points', () => {
    const stdout = '2026-01-01|40000|$\n2026-06-15|50000|$\n';
    expect(parsePriceHistory(stdout)).toEqual([
      { date: '2026-01-01', price: 40000, quote: '$' },
      { date: '2026-06-15', price: 50000, quote: '$' },
    ]);
  });

  it('strips thousands separators from the quantity', () => {
    expect(parsePriceHistory('2026-01-01|1,234.50|$\n')).toEqual([
      { date: '2026-01-01', price: 1234.5, quote: '$' },
    ]);
  });

  it('dedupes exact (date, price) duplicates', () => {
    const stdout =
      '2026-01-01|40000|$\n2026-01-01|40000|$\n2026-01-02|40000|$\n';
    expect(parsePriceHistory(stdout)).toEqual([
      { date: '2026-01-01', price: 40000, quote: '$' },
      { date: '2026-01-02', price: 40000, quote: '$' },
    ]);
  });

  it('skips blank and malformed lines', () => {
    const stdout = '\n2026-01-01|40000|$\ngarbage\n|bad|\n';
    expect(parsePriceHistory(stdout)).toEqual([
      { date: '2026-01-01', price: 40000, quote: '$' },
    ]);
  });
});

describe('ageInDays', () => {
  it('counts whole UTC days between two ISO dates', () => {
    expect(ageInDays('2026-07-01', '2026-07-08')).toBe(7);
    expect(ageInDays('2026-07-08', '2026-07-08')).toBe(0);
  });
});

describe('deriveSource', () => {
  const base = 'USD';
  const empty = new Set<string>();

  it('returns base when the symbol is the base currency', () => {
    expect(
      deriveSource({
        symbolNormalized: 'USD',
        quoteNormalized: 'USD',
        date: null,
        base,
        manualKeys: empty,
        fetchedKeys: empty,
      })
    ).toBe('base');
  });

  it('returns none when there is no date', () => {
    expect(
      deriveSource({
        symbolNormalized: 'BTC',
        quoteNormalized: 'USD',
        date: null,
        base,
        manualKeys: empty,
        fetchedKeys: empty,
      })
    ).toBe('none');
  });

  it('prefers manual over fetched when both match', () => {
    const key = priceKey('BTC', 'USD', '2026-06-15');
    expect(
      deriveSource({
        symbolNormalized: 'BTC',
        quoteNormalized: 'USD',
        date: '2026-06-15',
        base,
        manualKeys: new Set([key]),
        fetchedKeys: new Set([key]),
      })
    ).toBe('manual');
  });

  it('returns fetched when only the fetched set matches', () => {
    const key = priceKey('BTC', 'USD', '2026-06-15');
    expect(
      deriveSource({
        symbolNormalized: 'BTC',
        quoteNormalized: 'USD',
        date: '2026-06-15',
        base,
        manualKeys: empty,
        fetchedKeys: new Set([key]),
      })
    ).toBe('fetched');
  });

  it('falls back to journal when nothing matches', () => {
    expect(
      deriveSource({
        symbolNormalized: 'BTC',
        quoteNormalized: 'USD',
        date: '2026-06-15',
        base,
        manualKeys: empty,
        fetchedKeys: empty,
      })
    ).toBe('journal');
  });

  it('returns journal when symbolNormalized is null but a date is present', () => {
    expect(
      deriveSource({
        symbolNormalized: null,
        quoteNormalized: 'USD',
        date: '2026-06-15',
        base,
        manualKeys: empty,
        fetchedKeys: empty,
      })
    ).toBe('journal');
  });
});

it('exposes a 7 day stale threshold', () => {
  expect(STALE_THRESHOLD_DAYS).toBe(7);
});

describe('latestGenuinePrice', () => {
  it('returns null for empty input', () => {
    expect(latestGenuinePrice([])).toBeNull();
  });

  it('uses the first (set) date when the price never changes across posting rows', () => {
    const points = [
      { date: '2026-01-01', price: 40000, quote: '$' },
      { date: '2026-01-02', price: 40000, quote: '$' },
      { date: '2026-07-01', price: 40000, quote: '$' },
    ];
    expect(latestGenuinePrice(points)).toEqual({
      date: '2026-01-01',
      price: 40000,
      quote: '$',
    });
  });

  it('returns the change date when the price changes', () => {
    const points = [
      { date: '2026-01-01', price: 40000, quote: '$' },
      { date: '2026-06-15', price: 50000, quote: '$' },
    ];
    expect(latestGenuinePrice(points)).toEqual({
      date: '2026-06-15',
      price: 50000,
      quote: '$',
    });
  });

  it('prefers the freshest quote run over a stale one that sorts last', () => {
    // Shape mirrors `ledger prices BTC`: a fresh `$` fetch series followed by a
    // stale `DAI` cost-annotation run (which sorts last as a commodity). The
    // final row is the stale DAI one, but the current price is the fresh `$`.
    const points = [
      { date: '2026-07-06', price: 64174, quote: '$' },
      { date: '2026-07-09', price: 62513, quote: '$' },
      { date: '2025-01-20', price: 107424, quote: 'DAI' },
    ];
    expect(latestGenuinePrice(points, 'USD')).toEqual({
      date: '2026-07-09',
      price: 62513,
      quote: '$',
    });
  });

  it('breaks an equal-newest-date tie in favour of the base quote', () => {
    const points = [
      { date: '2026-07-09', price: 100, quote: 'DAI' },
      { date: '2026-07-09', price: 62513, quote: '$' },
    ];
    expect(latestGenuinePrice(points, 'USD')).toEqual({
      date: '2026-07-09',
      price: 62513,
      quote: '$',
    });
  });

  it('still returns a non-base quote when it is genuinely the freshest', () => {
    const points = [
      { date: '2026-07-01', price: 62000, quote: '$' },
      { date: '2026-07-09', price: 100, quote: 'DAI' },
    ];
    expect(latestGenuinePrice(points, 'USD')).toEqual({
      date: '2026-07-09',
      price: 100,
      quote: 'DAI',
    });
  });
});

describe('parseBaseBalance', () => {
  it('parses Probe:cN|quantity|commodity rows keyed by index', () => {
    const stdout =
      'Probe:c0|107393.21686406863836|USD\nProbe:c1|117.045492|USD\n';
    const map = parseBaseBalance(stdout);
    expect(map.get(0)).toEqual({
      price: 107393.21686406863836,
      commodity: 'USD',
    });
    expect(map.get(1)).toEqual({ price: 117.045492, commodity: 'USD' });
  });

  it('keeps an unconvertible row in its own commodity', () => {
    const map = parseBaseBalance('Probe:c2|1|XOF\n');
    expect(map.get(2)).toEqual({ price: 1, commodity: 'XOF' });
  });

  it('strips thousands separators from the quantity', () => {
    const map = parseBaseBalance('Probe:c0|1,234.50|USD\n');
    expect(map.get(0)).toEqual({ price: 1234.5, commodity: 'USD' });
  });

  it('ignores offset accounts, blanks, and malformed lines', () => {
    const stdout =
      '\nOffset:c0|-1|USD\nProbe:c0|5|USD\ngarbage\nProbe:cX|9|USD\n';
    const map = parseBaseBalance(stdout);
    expect([...map.keys()]).toEqual([0]);
    expect(map.get(0)).toEqual({ price: 5, commodity: 'USD' });
  });

  it('exposes the exact ledger balance format string', () => {
    expect(BALANCE_BASE_FORMAT).toBe(
      '%(account)|%(quantity(scrub(display_total)))|%(commodity(scrub(display_total)))\n'
    );
  });
});
