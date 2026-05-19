import { describe, it, expect } from 'vitest';
import { formatTransaction, transactionDraftSchema } from './schema';

describe('transactionDraftSchema with uid', () => {
  it('accepts a valid ULID', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid uid format', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      uid: 'not-a-ulid',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('uid is optional', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('formatTransaction with uid', () => {
  it('emits UID metadata line after the header', () => {
    const output = formatTransaction({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    const lines = output.split('\n');
    expect(lines[0]).toBe('2024-09-01 lunch');
    expect(lines[1]).toBe('    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('emits no UID line when uid is absent', () => {
    const output = formatTransaction({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(output.split('\n').some((l) => l.includes(':uid:'))).toBe(false);
  });
});
