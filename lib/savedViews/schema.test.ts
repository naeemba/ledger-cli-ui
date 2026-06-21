import { describe, expect, it } from 'vitest';
import {
  canonicalizeTargetPath,
  savedViewInputSchema,
  savedViewNameSchema,
} from './schema';

describe('savedViewNameSchema', () => {
  it('trims and accepts a normal name', () => {
    expect(savedViewNameSchema.parse('  Food spending  ')).toBe(
      'Food spending'
    );
  });

  it('rejects empty / whitespace-only', () => {
    expect(savedViewNameSchema.safeParse('').success).toBe(false);
    expect(savedViewNameSchema.safeParse('    ').success).toBe(false);
  });

  it('rejects names longer than 80 chars', () => {
    expect(savedViewNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
    expect(savedViewNameSchema.safeParse('x'.repeat(80)).success).toBe(true);
  });

  it('rejects control characters', () => {
    expect(
      savedViewNameSchema.safeParse('bad' + String.fromCharCode(0) + 'name')
        .success
    ).toBe(false);
    expect(savedViewNameSchema.safeParse('tab\tname').success).toBe(false);
  });
});

describe('canonicalizeTargetPath', () => {
  it('accepts each allowlisted route', () => {
    expect(canonicalizeTargetPath('/transactions')).toBe('/transactions');
    expect(
      canonicalizeTargetPath('/transactions?account=Expenses%3AFood')
    ).toBe('/transactions?account=Expenses%3AFood');
    expect(canonicalizeTargetPath('/balance')).toBe('/balance');
    expect(canonicalizeTargetPath('/balance/2026-01-01/2026-03-31')).toBe(
      '/balance/2026-01-01/2026-03-31'
    );
    expect(canonicalizeTargetPath('/payees/2026-01-01/2026-03-31')).toBe(
      '/payees/2026-01-01/2026-03-31'
    );
    expect(canonicalizeTargetPath('/registers/monthly/Expenses:Food')).toBe(
      '/registers/monthly/Expenses:Food'
    );
    expect(canonicalizeTargetPath('/accounts/Assets:Cash')).toBe(
      '/accounts/Assets:Cash'
    );
  });

  it('drops a fragment', () => {
    expect(canonicalizeTargetPath('/transactions?a=1#foo')).toBe(
      '/transactions?a=1'
    );
  });

  it('preserves search-param order', () => {
    expect(canonicalizeTargetPath('/transactions?b=2&a=1')).toBe(
      '/transactions?b=2&a=1'
    );
  });

  it('rejects external URLs', () => {
    expect(() => canonicalizeTargetPath('https://evil.example/x')).toThrow();
    expect(() => canonicalizeTargetPath('//evil/x')).toThrow();
  });

  it('rejects path traversal attempts', () => {
    expect(() => canonicalizeTargetPath('/transactions/../../etc')).toThrow();
    expect(() => canonicalizeTargetPath('/accounts/..%2Fetc')).toThrow();
  });

  it('rejects routes outside the allowlist', () => {
    expect(() => canonicalizeTargetPath('/api/upload')).toThrow();
    expect(() => canonicalizeTargetPath('/portfolio')).toThrow();
    expect(() => canonicalizeTargetPath('/settings')).toThrow();
  });

  it('rejects path > 2000 chars', () => {
    expect(() =>
      canonicalizeTargetPath('/transactions?q=' + 'x'.repeat(2000))
    ).toThrow();
  });

  it('rejects /balance/:from/:to when dates are not ISO', () => {
    expect(() => canonicalizeTargetPath('/balance/foo/bar')).toThrow();
    expect(() =>
      canonicalizeTargetPath('/balance/2026-01-01/not-a-date')
    ).toThrow();
  });

  it('accepts accounts with the full routable character set', () => {
    expect(
      canonicalizeTargetPath(
        '/accounts/' + encodeURIComponent('Expenses:Food & Dining')
      )
    ).toBe('/accounts/' + encodeURIComponent('Expenses:Food & Dining'));
    expect(
      canonicalizeTargetPath('/accounts/' + encodeURIComponent('Assets:Café'))
    ).toBe('/accounts/' + encodeURIComponent('Assets:Café'));
    expect(
      canonicalizeTargetPath(
        '/registers/monthly/' + encodeURIComponent('Liabilities:Loan (2024)')
      )
    ).toBe(
      '/registers/monthly/' + encodeURIComponent('Liabilities:Loan (2024)')
    );
  });

  it('accepts an account whose name contains a slash', () => {
    const path = '/accounts/' + encodeURIComponent('Assets:A/B');
    expect(canonicalizeTargetPath(path)).toBe(path);
  });
});

describe('savedViewInputSchema', () => {
  it('returns a parsed object with canonical targetPath', () => {
    const parsed = savedViewInputSchema.parse({
      name: '  Food  ',
      targetPath: '/transactions?account=Expenses:Food#x',
    });
    expect(parsed.name).toBe('Food');
    expect(parsed.targetPath).toBe('/transactions?account=Expenses:Food');
  });

  it('rejects invalid name', () => {
    expect(
      savedViewInputSchema.safeParse({
        name: '',
        targetPath: '/transactions',
      }).success
    ).toBe(false);
  });

  it('rejects invalid targetPath', () => {
    expect(
      savedViewInputSchema.safeParse({
        name: 'x',
        targetPath: '/api/upload',
      }).success
    ).toBe(false);
  });
});
