import { describe, it, expect } from 'vitest';
import {
  TAB_IDS,
  DEFAULT_TAB_ORDER,
  entryTabOrderSchema,
  normalizeTabOrder,
  parseEntryTabOrder,
  serializeEntryTabOrder,
} from './entryTabs';

describe('entryTabs constants', () => {
  it('exposes the three canonical tab ids and default order', () => {
    expect(TAB_IDS).toEqual(['types', 'form', 'raw']);
    expect(DEFAULT_TAB_ORDER).toEqual(['types', 'form', 'raw']);
  });
});

describe('normalizeTabOrder', () => {
  it('returns the default order for null/undefined/empty', () => {
    expect(normalizeTabOrder(null)).toEqual(['types', 'form', 'raw']);
    expect(normalizeTabOrder(undefined)).toEqual(['types', 'form', 'raw']);
    expect(normalizeTabOrder([])).toEqual(['types', 'form', 'raw']);
  });

  it('honors a full custom permutation', () => {
    expect(normalizeTabOrder(['raw', 'types', 'form'])).toEqual([
      'raw',
      'types',
      'form',
    ]);
  });

  it('appends missing tabs in default order', () => {
    expect(normalizeTabOrder(['raw'])).toEqual(['raw', 'types', 'form']);
  });

  it('drops unknown ids and de-duplicates', () => {
    expect(normalizeTabOrder(['raw', 'bogus', 'raw', 'form'])).toEqual([
      'raw',
      'form',
      'types',
    ]);
  });
});

describe('parse/serialize round-trip', () => {
  it('parseEntryTabOrder splits and normalizes a stored string', () => {
    expect(parseEntryTabOrder('raw,form,types')).toEqual([
      'raw',
      'form',
      'types',
    ]);
    expect(parseEntryTabOrder(null)).toEqual(['types', 'form', 'raw']);
    expect(parseEntryTabOrder('')).toEqual(['types', 'form', 'raw']);
  });

  it('serializeEntryTabOrder produces a normalized comma string', () => {
    expect(serializeEntryTabOrder(['raw', 'types', 'form'])).toBe(
      'raw,types,form'
    );
    expect(
      parseEntryTabOrder(serializeEntryTabOrder(['form', 'raw', 'types']))
    ).toEqual(['form', 'raw', 'types']);
  });
});

describe('entryTabOrderSchema', () => {
  it('accepts an array of known ids', () => {
    expect(
      entryTabOrderSchema.safeParse(['raw', 'types', 'form']).success
    ).toBe(true);
  });

  it('rejects unknown ids and non-arrays', () => {
    expect(entryTabOrderSchema.safeParse(['raw', 'bogus']).success).toBe(false);
    expect(entryTabOrderSchema.safeParse('raw,form').success).toBe(false);
  });
});
