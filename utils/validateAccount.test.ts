import { describe, it, expect } from 'vitest';
import isValidAccount from './validateAccount';

describe('isValidAccount', () => {
  it('accepts a normal account', () => {
    expect(isValidAccount('Expenses:Food')).toBe(true);
  });

  it('accepts a single-segment account', () => {
    expect(isValidAccount('Cash')).toBe(true);
  });

  it('rejects empty', () => {
    expect(isValidAccount('')).toBe(false);
  });

  it('rejects accounts starting with a hyphen', () => {
    // Hyphen-prefixed strings look like CLI flags to ledger; reject before
    // they reach the shell.
    expect(isValidAccount('-foo')).toBe(false);
  });

  it('rejects accounts containing NUL or newline', () => {
    expect(isValidAccount('foo\0bar')).toBe(false);
    expect(isValidAccount('foo\nbar')).toBe(false);
    expect(isValidAccount('foo\rbar')).toBe(false);
  });

  it('rejects accounts longer than 256 characters', () => {
    expect(isValidAccount('a'.repeat(256))).toBe(true);
    expect(isValidAccount('a'.repeat(257))).toBe(false);
  });

  it('accepts colons, slashes, dots, parentheses, spaces', () => {
    expect(isValidAccount('Assets:Bank:Checking (US)')).toBe(true);
    expect(isValidAccount('Expenses:Food/Groceries')).toBe(true);
  });
});
