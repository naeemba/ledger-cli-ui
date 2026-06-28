import { describe, it, expect } from 'vitest';
import {
  cleanAmountInput,
  groupAmountInput,
  caretAfterFormat,
} from './AmountInput.util';

describe('cleanAmountInput', () => {
  it('strips comma separators back to a raw number string', () => {
    expect(cleanAmountInput('1,234,567.89')).toBe('1234567.89');
  });

  it('keeps a single leading minus and drops minus elsewhere', () => {
    expect(cleanAmountInput('-1,234')).toBe('-1234');
    expect(cleanAmountInput('1-2-3')).toBe('123');
  });

  it('collapses multiple dots to the first one', () => {
    expect(cleanAmountInput('1.2.3')).toBe('1.23');
  });

  it('drops any other non-numeric characters', () => {
    expect(cleanAmountInput('$1 234abc.5')).toBe('1234.5');
  });

  it('returns empty for empty input', () => {
    expect(cleanAmountInput('')).toBe('');
  });
});

describe('groupAmountInput', () => {
  it('groups the integer part with comma thousands separators', () => {
    expect(groupAmountInput('1997.5')).toBe('1,997.5');
    expect(groupAmountInput('20000.0')).toBe('20,000.0');
    expect(groupAmountInput('1234567')).toBe('1,234,567');
  });

  it('preserves a negative sign', () => {
    expect(groupAmountInput('-1234567.89')).toBe('-1,234,567.89');
  });

  it('preserves a trailing dot so decimals can still be typed', () => {
    expect(groupAmountInput('1234.')).toBe('1,234.');
  });

  it('preserves a leading dot', () => {
    expect(groupAmountInput('.5')).toBe('.5');
  });

  it('does not group amounts below one thousand', () => {
    expect(groupAmountInput('42')).toBe('42');
  });

  it('is robust to already-grouped input', () => {
    expect(groupAmountInput('1,234')).toBe('1,234');
  });

  it('returns empty for empty input', () => {
    expect(groupAmountInput('')).toBe('');
  });
});

describe('caretAfterFormat', () => {
  it('places the caret after the same number of significant chars', () => {
    // caret after "12" of raw "1234" → after "2" in "1,234" (index 3)
    expect(caretAfterFormat('1,234', 2)).toBe(3);
  });

  it('returns the start when no significant chars precede the caret', () => {
    expect(caretAfterFormat('1,234', 0)).toBe(0);
  });

  it('returns the end when all significant chars precede the caret', () => {
    expect(caretAfterFormat('1,234', 4)).toBe(5);
  });

  it('counts the minus sign as significant', () => {
    // caret after "-1" of "-1234" → after "1" in "-1,234" (index 2)
    expect(caretAfterFormat('-1,234', 2)).toBe(2);
  });
});
