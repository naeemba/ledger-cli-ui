import { describe, it, expect } from 'vitest';
import { formatLedgerDateTime } from './formatDate';

describe('formatLedgerDateTime', () => {
  it('formats a Date as YYYY/MM/DD HH:MM:SS in UTC', () => {
    const d = new Date('2026-05-25T06:07:08.000Z');
    expect(formatLedgerDateTime(d)).toBe('2026/05/25 06:07:08');
  });

  it('zero-pads single-digit components', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(formatLedgerDateTime(d)).toBe('2026/01/02 03:04:05');
  });

  it('handles end-of-year boundary', () => {
    const d = new Date('2026-12-31T23:59:59.000Z');
    expect(formatLedgerDateTime(d)).toBe('2026/12/31 23:59:59');
  });
});
