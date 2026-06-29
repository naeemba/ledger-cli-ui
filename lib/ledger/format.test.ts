import { describe, it, expect } from 'vitest';
import { formatLedgerText } from './format';

describe('formatLedgerText', () => {
  it('aligns posting amounts to the shared column', () => {
    const raw = [
      '2026-06-30 * Groceries',
      '  Expenses:Food  USD 42.00',
      '  Assets:Checking  USD -42.00',
    ].join('\n');
    const out = formatLedgerText(raw);
    const lines = out.split('\n');
    // Header is preserved verbatim.
    expect(lines[0]).toBe('2026-06-30 * Groceries');
    // Both amounts start at the same column.
    const col = (l: string) => l.indexOf('USD');
    expect(col(lines[1])).toBe(col(lines[2]));
    expect(lines[1]).toContain('Expenses:Food');
    expect(lines[2]).toContain('Assets:Checking');
  });

  it('preserves comments, uid lines, and blank lines verbatim', () => {
    const raw = [
      '2026-06-30 Groceries',
      '    ; :uid: abc123',
      '    ; a note',
      '  Expenses:Food  USD 1.00',
      '',
      '  Assets:Checking  USD -1.00',
    ].join('\n');
    const out = formatLedgerText(raw).split('\n');
    expect(out).toContain('    ; :uid: abc123');
    expect(out).toContain('    ; a note');
    expect(out).toContain(''); // blank line kept
  });

  it('passes unparsable lines through verbatim', () => {
    const raw = ['2026-06-30 Groceries', '  not a real <<< posting'].join('\n');
    const out = formatLedgerText(raw);
    expect(out).toContain('not a real <<< posting');
  });

  it('returns input unchanged when there is no valid header', () => {
    const raw = 'this is not a transaction\n  neither is this';
    expect(formatLedgerText(raw)).toBe(raw);
  });

  it('is idempotent', () => {
    const raw = [
      '2026-06-30 * Groceries',
      '  Expenses:Food USD 42.00',
      '  Assets:Checking USD -42.00',
    ].join('\n');
    const once = formatLedgerText(raw);
    expect(formatLedgerText(once)).toBe(once);
  });
});
