import { describe, it, expect } from 'vitest';
import { getHighestExpense, parseRecentPostings } from './Dashboard.utils';

describe('getHighestExpense', () => {
  it('picks the largest row by amount', () => {
    const stdout = [
      'Expenses:Food|USD 42.00',
      'Expenses:Rent|USD 1500',
      'Expenses:Coffee|USD 7.50',
      '',
    ].join('\n');
    expect(getHighestExpense(stdout)).toBe('Expenses:Rent|USD 1500');
  });

  it('handles comma thousands separators', () => {
    const stdout = [
      'Expenses:Food|USD 1,500',
      'Expenses:Rent|USD 999',
      '',
    ].join('\n');
    expect(getHighestExpense(stdout)).toBe('Expenses:Food|USD 1,500');
  });

  it('returns empty string when no rows have an amount', () => {
    expect(getHighestExpense('')).toBe('');
    expect(getHighestExpense('\n\n')).toBe('');
  });

  it('skips rows whose amount field is malformed', () => {
    const stdout = ['Expenses:Food|garbage', 'Expenses:Rent|USD 100', ''].join(
      '\n'
    );
    expect(getHighestExpense(stdout)).toBe('Expenses:Rent|USD 100');
  });
});

describe('parseRecentPostings', () => {
  it('extracts date/payee/account/amount and uid from the note', () => {
    const stdout =
      'NNN2026/01/01|Coffee|Assets:Checking|$ -5.00| :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z\n';
    const [row] = parseRecentPostings(stdout);
    expect(row).toEqual({
      date: '2026/01/01',
      payee: 'Coffee',
      account: 'Assets:Checking',
      amount: '$ -5.00',
      uid: '01HZY0Z9QK8G7F6E5D4C3B2A1Z',
    });
  });

  it('leaves uid undefined when the note has no uid tag', () => {
    const stdout = 'NNN2026/01/01|Coffee|Assets:Checking|$ -5.00|\n';
    const [row] = parseRecentPostings(stdout);
    expect(row.uid).toBeUndefined();
  });

  it('rejoins note columns so a pipe inside the note cannot drop the uid', () => {
    const stdout =
      'NNN2026/01/01|Coffee|Assets:Checking|$ -5.00|a|b| :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z\n';
    const [row] = parseRecentPostings(stdout);
    expect(row.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('returns an empty array for empty stdout', () => {
    expect(parseRecentPostings('')).toEqual([]);
  });
});
