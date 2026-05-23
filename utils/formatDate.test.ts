import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import formatDate, { Format } from './formatDate';

// Pin DATE_LOCALE so the tests don't depend on the developer's `.env`.
let savedLocale: string | undefined;
beforeAll(() => {
  savedLocale = process.env.DATE_LOCALE;
  process.env.DATE_LOCALE = 'en-US';
});
afterAll(() => {
  if (savedLocale === undefined) delete process.env.DATE_LOCALE;
  else process.env.DATE_LOCALE = savedLocale;
});

describe('formatDate', () => {
  it('formats Format.DATE as MM/DD/YYYY (en-US)', () => {
    expect(formatDate('2024-09-01', Format.DATE)).toBe('09/01/2024');
  });

  it('formats Format.MONTH_YEAR as long-month year (en-US)', () => {
    expect(formatDate('2024-09-01', Format.MONTH_YEAR)).toBe('September 2024');
  });

  it('formats Format.SHORT_MONTH_YEAR as short-month year (en-US)', () => {
    expect(formatDate('2024-09-01', Format.SHORT_MONTH_YEAR)).toBe('Sep 2024');
  });

  it('accepts a full ISO timestamp', () => {
    expect(formatDate('2024-09-01T12:34:56Z', Format.MONTH_YEAR)).toBe(
      'September 2024'
    );
  });
});
