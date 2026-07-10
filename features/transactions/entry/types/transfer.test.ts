import { describe, it, expect } from 'vitest';
import { transferAdapter, type TransferFields } from './transfer';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Transfer',
  status: 'none' as const,
  note: '',
};

describe('transferAdapter.compile', () => {
  it('builds a to/from pair with no extras', () => {
    const draft = transferAdapter.compile(
      {
        ...header,
        amount: '500',
        currency: 'USD',
        from: 'Assets:Checking',
        to: 'Assets:Savings',
        extraItems: [],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ]);
  });

  it('adds a transfer fee to the source outflow', () => {
    const draft = transferAdapter.compile(
      {
        ...header,
        amount: '500',
        currency: 'USD',
        from: 'Assets:Checking',
        to: 'Assets:Savings',
        extraItems: [
          { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
        ],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
      // Amount-less: ledger fills the outflow (500 + 15 = 515) on save.
      { account: 'Assets:Checking', amount: '', currency: '' },
    ]);
  });
});

describe('transferAdapter.detect', () => {
  it('recognizes a clean transfer with empty extras', () => {
    const draft = Transaction.of('2026-06-29', 'Transfer', 'none', '', [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ]);
    expect(transferAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Transfer',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '500',
      currency: 'USD',
      from: 'Assets:Checking',
      to: 'Assets:Savings',
      extraItems: [],
    });
  });

  it('round-trips compile -> detect with a fee', () => {
    const fields: TransferFields = {
      ...header,
      uid: undefined,
      amount: '500',
      currency: 'USD',
      from: 'Assets:Checking',
      to: 'Assets:Savings',
      extraItems: [
        { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
      ],
    };
    expect(
      transferAdapter.detect(transferAdapter.compile(fields, ctx))
    ).toEqual(fields);
  });

  it('rejects two positive destinations', () => {
    expect(
      transferAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Assets:Savings', amount: '300', currency: 'USD' },
          { account: 'Assets:Brokerage', amount: '200', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
