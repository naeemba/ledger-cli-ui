import { describe, it, expect } from 'vitest';
import { transactionsToCsv } from './csv';
import type { ParsedTransaction } from '@/lib/journal/parser';

const tx = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
  file: '/tmp/main.ledger',
  startLine: 1,
  endLine: 3,
  date: '2024-09-01',
  payee: "Trader Joe's",
  status: 'none',
  note: null,
  postings: [
    { account: 'Expenses:Food', amount: '10', currency: 'USD' },
    { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
  ],
  rawBlock: '',
  fingerprint: 'abc',
  ...overrides,
});

describe('transactionsToCsv', () => {
  it('emits a header row even when there are no transactions', () => {
    expect(transactionsToCsv([])).toBe(
      'date,payee,status,note,uid,account,amount,currency\n'
    );
  });

  it('emits one row per posting', () => {
    const csv = transactionsToCsv([tx()]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 postings
    expect(lines[1]).toContain('Expenses:Food');
    expect(lines[1]).toContain('10');
    expect(lines[2]).toContain('Assets:Cash');
    expect(lines[2]).toContain('-10');
  });

  it('renders null/undefined fields as empty', () => {
    const csv = transactionsToCsv([
      tx({
        note: null,
        uid: null,
        postings: [{ account: 'A', amount: '', currency: '' }],
      }),
    ]);
    const lines = csv.trim().split('\n');
    // header,date,payee,status,(empty note),(empty uid),A,(empty amount),(empty currency)
    expect(lines[1]).toBe("2024-09-01,Trader Joe's,none,,,A,,");
  });
});
