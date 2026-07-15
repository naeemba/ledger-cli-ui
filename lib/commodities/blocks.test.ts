import { describe, expect, it } from 'vitest';
import {
  parseCommodityBlocks,
  serializeCommodityBlock,
  type CommodityDefinition,
} from './blocks';

const SAMPLE = [
  '; user comment outside blocks',
  'commodity KIRT',
  '\tnote Iranian Thousand Toman',
  '\tdefault',
  '\talias Kirt',
  '',
  'commodity $',
  '\tnote US Dollar',
  '\talias USD',
  '\tformat USD 1,000.00',
  '',
  'P 2026-01-01 BTC 100000 $',
  'commodity ADA',
  '\tformat ADA 1,000.00',
  '\tnomarket',
].join('\n');

describe('parseCommodityBlocks', () => {
  it('parses every block with spans and fields', () => {
    const blocks = parseCommodityBlocks(SAMPLE);
    expect(blocks.map((b) => b.symbol)).toEqual(['KIRT', '$', 'ADA']);
    const kirt = blocks[0];
    expect(kirt).toMatchObject({
      note: 'Iranian Thousand Toman',
      aliases: ['Kirt'],
      decimalPlaces: null,
      nomarket: false,
      isDefault: true,
      startLine: 1,
      endLine: 4,
      opaque: false,
    });
    expect(blocks[1]).toMatchObject({ symbol: '$', decimalPlaces: 2 });
    expect(blocks[2]).toMatchObject({ nomarket: true, decimalPlaces: 2 });
  });

  it('unquotes quoted symbols and reads symbol-after format samples', () => {
    const blocks = parseCommodityBlocks(
      'commodity "د.إ"\n\tformat 1,000.00 "د.إ"\n'
    );
    expect(blocks[0].symbol).toBe('د.إ');
    expect(blocks[0].decimalPlaces).toBe(2);
    expect(blocks[0].opaque).toBe(false);
  });

  it('marks blocks with unmodeled lines opaque but keeps raw text', () => {
    const text = 'commodity XYZ\n\t; inline comment\n\tnote n';
    const [block] = parseCommodityBlocks(text);
    expect(block.opaque).toBe(true);
    expect(block.raw).toBe(text);
  });

  it('marks a format sample without a numeric token opaque', () => {
    const [block] = parseCommodityBlocks('commodity X\n\tformat X abc');
    expect(block.opaque).toBe(true);
  });

  it('marks a non-grouped format sample opaque', () => {
    const [noDecimals] = parseCommodityBlocks('commodity X\n\tformat X 100000');
    expect(noDecimals.opaque).toBe(true);
    const [withDecimals] = parseCommodityBlocks(
      'commodity X\n\tformat X 1000.5'
    );
    expect(withDecimals.opaque).toBe(true);
  });

  it('zero-decimal format parses as decimalPlaces 0', () => {
    const [block] = parseCommodityBlocks('commodity KIRT\n\tformat KIRT 1,000');
    expect(block.decimalPlaces).toBe(0);
  });

  it('marks a block with a duplicate note or format directive opaque', () => {
    const [block] = parseCommodityBlocks(
      'commodity X\n\tformat X 1,000\n\tformat X 1,000.00'
    );
    expect(block.opaque).toBe(true);
  });
});

describe('serializeCommodityBlock', () => {
  const base: CommodityDefinition = {
    symbol: 'KIRT',
    note: 'Iranian Thousand Toman',
    aliases: ['Kirt'],
    decimalPlaces: 1,
    nomarket: false,
    isDefault: true,
  };

  it('emits canonical field order', () => {
    expect(serializeCommodityBlock(base)).toBe(
      [
        'commodity KIRT',
        '\tnote Iranian Thousand Toman',
        '\talias Kirt',
        '\tformat KIRT 1,000.0',
        '\tdefault',
      ].join('\n')
    );
  });

  it('quotes symbols containing separators, symbol-after form', () => {
    expect(
      serializeCommodityBlock({
        symbol: 'د.إ',
        note: '',
        aliases: [],
        decimalPlaces: 2,
        nomarket: true,
        isDefault: false,
      })
    ).toBe(
      ['commodity "د.إ"', '\tformat 1,000.00 "د.إ"', '\tnomarket'].join('\n')
    );
  });

  it('round-trips: parse(serialize(definition)) equals definition', () => {
    const [block] = parseCommodityBlocks(serializeCommodityBlock(base));
    expect(block).toMatchObject(base);
    expect(block.opaque).toBe(false);
  });
});
