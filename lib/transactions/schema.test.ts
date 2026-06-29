import { describe, it, expect } from 'vitest';
import { formatTransaction, transactionDraftSchema } from './schema';

describe('transactionDraftSchema — cost and assertion', () => {
  it('accepts an exchange transaction that balances on the cost currency', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2026-06-29',
      payee: 'Currency exchange',
      status: 'none',
      postings: [
        {
          account: 'Assets:EUR',
          amount: '92',
          currency: 'EUR',
          cost: { amount: '100', currency: 'USD' },
        },
        { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(true);
  });
  it('accepts a fix-balance transaction (assertion + blank equity)', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2026-06-29',
      payee: 'Balance adjustment',
      status: 'none',
      postings: [
        {
          account: 'Assets:Checking',
          amount: '',
          currency: '',
          assertion: { amount: '1234.56', currency: 'USD' },
        },
        { account: 'Equity:Adjustments', amount: '', currency: '' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('formatTransaction — cost and assertion', () => {
  it('emits @@ for a cost posting', () => {
    const out = formatTransaction({
      date: '2026-06-29',
      payee: 'Currency exchange',
      status: 'none',
      postings: [
        {
          account: 'Assets:EUR',
          amount: '92',
          currency: 'EUR',
          cost: { amount: '100', currency: 'USD' },
        },
        { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
      ],
    } as never);
    expect(out).toContain('EUR 92 @@ USD 100');
  });
  it('emits a bare = assertion line for a fix-balance posting', () => {
    const out = formatTransaction({
      date: '2026-06-29',
      payee: 'Balance adjustment',
      status: 'none',
      postings: [
        {
          account: 'Assets:Checking',
          amount: '',
          currency: '',
          assertion: { amount: '1234.56', currency: 'USD' },
        },
        { account: 'Equity:Adjustments', amount: '', currency: '' },
      ],
    } as never);
    expect(out).toMatch(/Assets:Checking\s+= USD 1234\.56/);
    expect(out).toMatch(/\n {4}Equity:Adjustments$/);
  });
});

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
