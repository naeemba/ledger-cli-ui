// features/transactions/entry/types/exchange.test.ts
import { describe, it, expect } from 'vitest';
import { exchangeAdapter, type ExchangeFields } from './exchange';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Currency exchange',
  status: 'none' as const,
  note: '',
};

describe('exchangeAdapter.compile', () => {
  it('builds a cost-annotated got posting plus a negative gave posting', () => {
    const draft = exchangeAdapter.compile(
      {
        ...header,
        gaveAmount: '100',
        gaveCurrency: 'USD',
        gaveFrom: 'Assets:Checking',
        gotAmount: '92',
        gotCurrency: 'EUR',
        gotInto: 'Assets:EUR-Wallet',
      },
      ctx
    );
    expect(draft.postings).toEqual([
      {
        account: 'Assets:EUR-Wallet',
        amount: '92',
        currency: 'EUR',
        cost: { amount: '100', currency: 'USD' },
      },
      { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
    ]);
  });
});

describe('exchangeAdapter.detect', () => {
  const draft = Transaction.of('2026-06-29', 'Currency exchange', 'none', '', [
    {
      account: 'Assets:EUR-Wallet',
      amount: '92',
      currency: 'EUR',
      cost: { amount: '100', currency: 'USD' },
    },
    { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
  ]);
  it('recognizes a cost-annotated exchange', () => {
    expect(exchangeAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Currency exchange',
      status: 'none',
      note: '',
      uid: undefined,
      gaveAmount: '100',
      gaveCurrency: 'USD',
      gaveFrom: 'Assets:Checking',
      gotAmount: '92',
      gotCurrency: 'EUR',
      gotInto: 'Assets:EUR-Wallet',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: ExchangeFields = {
      ...header,
      uid: undefined,
      gaveAmount: '50',
      gaveCurrency: 'USD',
      gaveFrom: 'Assets:Cash',
      gotAmount: '46',
      gotCurrency: 'EUR',
      gotInto: 'Assets:EUR',
    };
    expect(
      exchangeAdapter.detect(exchangeAdapter.compile(fields, ctx))
    ).toEqual(fields);
  });
  it('rejects a plain expense pair (no cost)', () => {
    expect(
      exchangeAdapter.detect(
        Transaction.of(draft.date, draft.payee, draft.status, draft.note, [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
