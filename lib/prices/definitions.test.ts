import { describe, it, expect } from 'vitest';
import { extractDefinitions, hasDefinitions } from './definitions';
import { renderPriceDb } from './formatter';

describe('extractDefinitions', () => {
  it('drops P directives and keeps commodity/account declarations', () => {
    const text = [
      'commodity KIRT',
      '\tnote Iranian Thousand Toman',
      '\talias Kirt',
      '\tnomarket',
      'P 2026/07/06 22:59:09 DAI 0.999678 USD',
      'account Expenses:Shopping:Coffee',
      'P 2026/07/07 KIRT 0.0056818184 USD',
    ].join('\n');
    expect(extractDefinitions(text)).toBe(
      [
        'commodity KIRT',
        '\tnote Iranian Thousand Toman',
        '\talias Kirt',
        '\tnomarket',
        'account Expenses:Shopping:Coffee',
      ].join('\n')
    );
  });

  it('drops the AUTO-GENERATED banner but keeps user comments', () => {
    const generated = renderPriceDb([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 64000,
        fetchedAt: new Date('2026-07-06T00:00:00Z'),
        fetchedDate: '2026-07-06',
      },
    ]);
    const text = `${generated}\n; my own note\ncommodity BTC\n\tnomarket\n`;
    const out = extractDefinitions(text);
    expect(out).not.toMatch(/AUTO-GENERATED/);
    expect(out).not.toMatch(/^P /m);
    expect(out).toContain('; my own note');
    expect(out).toContain('commodity BTC');
  });

  it('collapses leading and trailing blank lines', () => {
    const text = '\n\ncommodity ADA\n\tnomarket\n\n\n';
    expect(extractDefinitions(text)).toBe('commodity ADA\n\tnomarket');
  });

  it('returns empty string for a prices-only file', () => {
    const text = 'P 2026/07/06 BTC 64000 USD\nP 2026/07/06 ETH 3000 USD\n';
    expect(extractDefinitions(text)).toBe('');
  });
});

describe('hasDefinitions', () => {
  it('is true when a real declaration survives', () => {
    expect(hasDefinitions('P 2026/07/06 BTC 64000 USD\ncommodity BTC\n')).toBe(
      true
    );
  });

  it('is false for prices, blanks, and comments only', () => {
    const text = '; header\n\nP 2026/07/06 BTC 64000 USD\n; footer\n';
    expect(hasDefinitions(text)).toBe(false);
  });
});
