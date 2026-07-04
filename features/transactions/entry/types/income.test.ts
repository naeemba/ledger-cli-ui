import { describe, it, expect } from 'vitest';
import { incomeAdapter, type IncomeFields } from './income';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Acme Corp',
  status: 'none' as const,
  note: '',
};

describe('incomeAdapter.compile', () => {
  it('builds a +asset / -income pair', () => {
    const draft = incomeAdapter.compile(
      {
        ...header,
        amount: '3000',
        currency: 'USD',
        receivedInto: 'Assets:Checking',
        from: 'Income:Salary',
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '3000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-3000', currency: 'USD' },
    ]);
  });
});

describe('incomeAdapter.detect', () => {
  const draft = new Transaction('2026-06-29', 'Acme Corp', 'none', '', [
    { account: 'Assets:Checking', amount: '3000', currency: 'USD' },
    { account: 'Income:Salary', amount: '-3000', currency: 'USD' },
  ]);
  it('recognizes a clean income->asset pair', () => {
    expect(incomeAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Acme Corp',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '3000',
      currency: 'USD',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: IncomeFields = {
      ...header,
      uid: undefined,
      amount: '50',
      currency: 'USD',
      receivedInto: 'Assets:Cash',
      from: 'Income:Gifts',
    };
    expect(incomeAdapter.detect(incomeAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });
  it('rejects an expense pair', () => {
    expect(
      incomeAdapter.detect(
        new Transaction(draft.date, draft.payee, draft.status, draft.note, [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
