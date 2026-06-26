import { describe, it, expect } from 'vitest';
import { manualPriceDraftSchema, buildPricedAt } from './manualSchema';

describe('manualPriceDraftSchema', () => {
  const valid = {
    date: '2026-06-27',
    quote: 'USD',
    rows: [{ symbol: 'KIRT', price: 0.0000033 }],
  };

  it('accepts a well-formed draft', () => {
    expect(manualPriceDraftSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, date: '27/06/2026' }).success
    ).toBe(false);
  });

  it('rejects a non-positive price', () => {
    expect(
      manualPriceDraftSchema.safeParse({
        ...valid,
        rows: [{ symbol: 'KIRT', price: 0 }],
      }).success
    ).toBe(false);
  });

  it('rejects an empty rows array', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, rows: [] }).success
    ).toBe(false);
  });

  it('rejects a bad time format', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, time: '9am' }).success
    ).toBe(false);
  });

  it('allows an empty-string time (means "no time")', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, time: '' }).success
    ).toBe(true);
  });
});

describe('buildPricedAt', () => {
  it('defaults blank time to end-of-day UTC', () => {
    expect(buildPricedAt('2026-06-27')?.toISOString()).toBe(
      '2026-06-27T23:59:59.000Z'
    );
    expect(buildPricedAt('2026-06-27', '')?.toISOString()).toBe(
      '2026-06-27T23:59:59.000Z'
    );
  });

  it('uses an explicit time as UTC', () => {
    expect(buildPricedAt('2026-06-27', '14:30')?.toISOString()).toBe(
      '2026-06-27T14:30:00.000Z'
    );
  });

  it('returns null for an unparseable date', () => {
    expect(buildPricedAt('2026-13-40')).toBeNull();
  });
});
