import { describe, it, expect } from 'vitest';
import { parseAliasMap } from './definitions';

describe('parseAliasMap', () => {
  it('maps each commodity-block alias to its canonical symbol', () => {
    const text = [
      'commodity BITCOIN',
      '\talias BTC',
      '\talias XBT',
      '\tnomarket',
      'commodity KIRT',
      '\talias Kirt',
    ].join('\n');
    const map = parseAliasMap(text);
    expect(map.get('BTC')).toBe('BITCOIN');
    expect(map.get('XBT')).toBe('BITCOIN');
    expect(map.get('Kirt')).toBe('KIRT');
    expect(map.size).toBe(3);
  });

  it('unquotes both the commodity and the alias symbol', () => {
    const text = 'commodity "د.إ"\n\talias "AED"';
    expect(parseAliasMap(text).get('AED')).toBe('د.إ');
  });

  it('ignores a non-indented (block-closing) alias and account aliases', () => {
    // A top-level `alias Old=New` is an account alias, not a commodity alias,
    // and a non-indented line closes the commodity block.
    const text = [
      'commodity KIRT',
      '\talias Kirt',
      'alias Expenses=Ex',
      'alias Bogus',
    ].join('\n');
    const map = parseAliasMap(text);
    expect(map.get('Kirt')).toBe('KIRT');
    expect(map.has('Expenses=Ex')).toBe(false);
    expect(map.has('Bogus')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('returns an empty map when there are no aliases', () => {
    expect(parseAliasMap('commodity BTC\n\tnomarket').size).toBe(0);
  });
});
