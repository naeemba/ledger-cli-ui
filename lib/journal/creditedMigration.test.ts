import { describe, expect, it } from 'vitest';
import {
  planRenames,
  rewriteAccounts,
  targetAccount,
} from './creditedMigration';

describe('targetAccount', () => {
  it('routes a non-negative net to receivable', () => {
    expect(targetAccount('Assets:Credited:Alex', 30)).toBe(
      'Assets:Receivable:Alex'
    );
    expect(targetAccount('Assets:Credited:Alex', 0)).toBe(
      'Assets:Receivable:Alex'
    );
  });

  it('routes a negative net to payable', () => {
    expect(targetAccount('Assets:Credited:Bob', -30)).toBe(
      'Liabilities:Payable:Bob'
    );
  });

  it('preserves a deeper person path', () => {
    expect(targetAccount('Assets:Credited:Family:Alex', 5)).toBe(
      'Assets:Receivable:Family:Alex'
    );
  });
});

describe('planRenames', () => {
  it('maps each legacy account by the sign of its net', () => {
    const { renames, manual } = planRenames(
      [
        'Assets:Credited:Alex|$ 30.00',
        'Assets:Credited:Bob|$ -30.00',
        'Assets:Credited:Zero|0',
        'Assets:Checking|$ 500.00', // ignored: not a legacy account
        '|$ 750.00', // ignored: footer Total row
      ].join('\n')
    );
    expect(renames.get('Assets:Credited:Alex')).toBe('Assets:Receivable:Alex');
    expect(renames.get('Assets:Credited:Bob')).toBe('Liabilities:Payable:Bob');
    expect(renames.get('Assets:Credited:Zero')).toBe('Assets:Receivable:Zero');
    expect(renames.has('Assets:Checking')).toBe(false);
    expect(renames.size).toBe(3);
    expect(manual).toEqual([]);
  });

  it('handles comma-grouped amounts', () => {
    const { renames } = planRenames('Assets:Credited:Big|$ -1,200.00\n');
    expect(renames.get('Assets:Credited:Big')).toBe('Liabilities:Payable:Big');
  });

  it('collects a multi-commodity net as manual and never renames it', () => {
    // Ledger emits the second commodity on a continuation line (no `|`).
    const { renames, manual } = planRenames(
      [
        'Assets:Credited:Alex|$ 30.00',
        'Assets:Credited:Bob|$ 50.00',
        '                   €30.00',
        'Assets:Credited:Carol|$ 100.00',
      ].join('\n')
    );
    expect(manual).toEqual(['Assets:Credited:Bob']);
    expect(renames.has('Assets:Credited:Bob')).toBe(false);
    expect(renames.get('Assets:Credited:Alex')).toBe('Assets:Receivable:Alex');
    expect(renames.get('Assets:Credited:Carol')).toBe(
      'Assets:Receivable:Carol'
    );
    expect(renames.size).toBe(2);
  });
});

describe('rewriteAccounts', () => {
  const renames = new Map([
    ['Assets:Credited:Alex', 'Assets:Receivable:Alex'],
    ['Assets:Credited:Bob', 'Liabilities:Payable:Bob'],
  ]);

  it('rewrites whole-account occurrences and counts them', () => {
    const journal = [
      '2026-01-01 Lent to Alex',
      '    Assets:Credited:Alex      $50',
      '    Assets:Checking          $-50',
      '',
      '2026-02-01 Borrowed from Bob',
      '    Assets:Checking           $30',
      '    Assets:Credited:Bob      $-30',
      '',
    ].join('\n');
    const { text, count } = rewriteAccounts(journal, renames);
    expect(count).toBe(2);
    expect(text).toContain('    Assets:Receivable:Alex      $50');
    expect(text).toContain('    Liabilities:Payable:Bob      $-30');
    expect(text).not.toContain('Assets:Credited');
  });

  it('does not match a shorter name inside a longer no-space sibling', () => {
    // "Assets:Credited:Al" must not corrupt "Assets:Credited:Alex".
    const map = new Map([['Assets:Credited:Al', 'Assets:Receivable:Al']]);
    const { text, count } = rewriteAccounts(
      '    Assets:Credited:Alex   $1\n',
      map
    );
    expect(count).toBe(0);
    expect(text).toContain('Assets:Credited:Alex');
  });

  it('does not partially match a space-separated sibling (longest-first)', () => {
    // Both siblings present; "Bob" must not eat into "Bob Smith".
    const map = new Map([
      ['Assets:Credited:Bob', 'Liabilities:Payable:Bob'],
      ['Assets:Credited:Bob Smith', 'Assets:Receivable:Bob Smith'],
    ]);
    const journal = [
      '    Assets:Credited:Bob Smith   $10',
      '    Assets:Credited:Bob         $-5',
    ].join('\n');
    const { text } = rewriteAccounts(journal, map);
    expect(text).toContain('    Assets:Receivable:Bob Smith   $10');
    expect(text).toContain('    Liabilities:Payable:Bob         $-5');
    expect(text).not.toContain('Assets:Credited');
  });

  it('leaves an unrelated account untouched', () => {
    const { text, count } = rewriteAccounts(
      '    Assets:Checking   $5\n',
      renames
    );
    expect(count).toBe(0);
    expect(text).toBe('    Assets:Checking   $5\n');
  });
});
