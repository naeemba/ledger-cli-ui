// features/transactions/entry/types/roundTrip.test.ts
//
// The safety net behind the edit-dialog simple forms is that
// detect(draft) -> compile(fields) reproduces the original postings, so a
// saved transaction never silently desyncs from the form used to edit it.
// This file asserts that inverse directly for every adapter where it holds.
//
// fixBalance is excluded: its compile always emits an amount-less assertion
// / adjustment pair (see fixBalance.ts) — the actual balance numbers are
// filled in by ledger on save, not reproduced from detect's output — so
// compile is not a pure inverse of detect. It is covered instead by the
// pickEditSurface routing test in editSurface.test.ts.
import { describe, expect, it } from 'vitest';
import { initDraft } from '../draftReducer';
import { exchangeAdapter } from './exchange';
import { expenseAdapter } from './expense';
import { incomeAdapter } from './income';
import { transferAdapter } from './transfer';
import type { Posting } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };

const draftOf = (postings: Posting[]) =>
  initDraft(
    { date: '2026-07-14', payee: 'Test', status: 'none', note: '', postings },
    'USD'
  );

describe('detect -> compile round trip', () => {
  it('expense: rebuilds the original postings', () => {
    const draft = draftOf([
      { account: 'Expenses:Food', amount: '10', currency: 'USD' },
      { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
    ]);
    const detected = expenseAdapter.detect(draft);
    if (!detected) throw new Error('expected expense to be detected');
    expect(expenseAdapter.compile(detected, ctx).postings).toEqual(
      draft.postings
    );
  });

  it('income: rebuilds the original postings', () => {
    const draft = draftOf([
      { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
    ]);
    const detected = incomeAdapter.detect(draft);
    if (!detected) throw new Error('expected income to be detected');
    expect(incomeAdapter.compile(detected, ctx).postings).toEqual(
      draft.postings
    );
  });

  it('transfer: rebuilds the original postings', () => {
    const draft = draftOf([
      { account: 'Assets:Savings', amount: '100', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
    ]);
    const detected = transferAdapter.detect(draft);
    if (!detected) throw new Error('expected transfer to be detected');
    expect(transferAdapter.compile(detected, ctx).postings).toEqual(
      draft.postings
    );
  });

  it('transfer (debt): rebuilds a receivable/payable pair back to its accounts', () => {
    // The accepted simplification routes a debt (Assets:Receivable / Liabilities:
    // Payable) to the Transfer form. This is the pair most likely to silently
    // corrupt a balance if the round trip ever stops reproducing the accounts.
    const draft = draftOf([
      { account: 'Assets:Receivable:Bob', amount: '50', currency: 'USD' },
      { account: 'Liabilities:Payable:Bob', amount: '-50', currency: 'USD' },
    ]);
    const detected = transferAdapter.detect(draft);
    if (!detected) throw new Error('expected debt pair to be detected');
    expect(transferAdapter.compile(detected, ctx).postings).toEqual(
      draft.postings
    );
  });

  it('exchange: rebuilds the original postings, including the cost annotation', () => {
    const draft = draftOf([
      {
        account: 'Assets:EUR-Wallet',
        amount: '92',
        currency: 'EUR',
        cost: { amount: '100', currency: 'USD' },
      },
      { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
    ]);
    const detected = exchangeAdapter.detect(draft);
    if (!detected) throw new Error('expected exchange to be detected');
    expect(exchangeAdapter.compile(detected, ctx).postings).toEqual(
      draft.postings
    );
  });
});
