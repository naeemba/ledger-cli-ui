import { describe, it, expect } from 'vitest';
import { incomeAdapter, type IncomeFields } from './income';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Employer',
  status: 'none' as const,
  note: '',
};

describe('incomeAdapter.compile', () => {
  it('builds a +asset / -income pair with no extras', () => {
    const draft = incomeAdapter.compile(
      {
        ...header,
        amount: '1000',
        currency: 'USD',
        receivedInto: 'Assets:Checking',
        from: 'Income:Salary',
        extraItems: [],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
    ]);
  });

  it('subtracts fee extras from the net received', () => {
    const draft = incomeAdapter.compile(
      {
        ...header,
        amount: '1000',
        currency: 'USD',
        receivedInto: 'Assets:Checking',
        from: 'Income:Salary',
        extraItems: [
          { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
        ],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '970', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
    ]);
  });
});

describe('incomeAdapter.detect', () => {
  it('recognizes a clean income pair with empty extras', () => {
    const draft = Transaction.of('2026-06-29', 'Employer', 'none', '', [
      { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
    ]);
    expect(incomeAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Employer',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '1000',
      currency: 'USD',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
      extraItems: [],
    });
  });

  it('round-trips compile -> detect with extras', () => {
    const fields: IncomeFields = {
      ...header,
      uid: undefined,
      amount: '1000',
      currency: 'USD',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
      extraItems: [{ account: 'Expenses:Fees', amount: '30', currency: 'USD' }],
    };
    expect(incomeAdapter.detect(incomeAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });

  it('rejects a draft with two income sources', () => {
    expect(
      incomeAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
          { account: 'Income:Salary', amount: '-600', currency: 'USD' },
          { account: 'Income:Bonus', amount: '-400', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
