import { describe, it, expect } from 'vitest';
import {
  formatLedgerDate,
  formatLedgerDateTime,
  formatLedgerInstant,
} from './formatDate';

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

describe('formatLedgerDate', () => {
  it('formats a Date as YYYY/MM/DD in UTC', () => {
    expect(formatLedgerDate(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026/01/02'
    );
  });
});

describe('formatLedgerInstant', () => {
  it('suppresses the time for the end-of-day sentinel (date-only rate)', () => {
    expect(formatLedgerInstant(new Date('2026-06-27T23:59:59.000Z'))).toBe(
      '2026/06/27'
    );
  });

  it('keeps the time when a real time was given', () => {
    expect(formatLedgerInstant(new Date('2026-06-27T06:07:08.000Z'))).toBe(
      '2026/06/27 06:07:08'
    );
  });

  it('keeps the time when only seconds differ from the sentinel', () => {
    expect(formatLedgerInstant(new Date('2026-06-27T23:59:58.000Z'))).toBe(
      '2026/06/27 23:59:58'
    );
  });
});
