// features/transactions/entry/types/fixBalance.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { Transaction } from '@/lib/transactions/model';

export const ADJUSTMENTS_ACCOUNT = 'Equity:Adjustments';

export type FixBalanceFields = HeaderFields & {
  account: string;
  targetAmount: string;
  targetCurrency: string;
};

export const fixBalanceAdapter: TransactionTypeAdapter<FixBalanceFields> = {
  id: 'fix-balance',
  label: 'Fix balance',
  icon: '⚖️',
  emptyFields: (ctx: TypeContext): FixBalanceFields => ({
    date: '',
    payee: 'Balance adjustment',
    status: 'none',
    note: '',
    account: '',
    targetAmount: '',
    targetCurrency: ctx.defaultCurrency,
  }),
  compile: (f, _ctx): DraftState =>
    Transaction.fromHeader(
      {
        date: f.date,
        payee: f.payee,
        status: f.status,
        note: f.note,
        uid: f.uid,
      },
      [
        {
          account: f.account,
          amount: '',
          currency: '',
          assertion: { amount: f.targetAmount, currency: f.targetCurrency },
        },
        { account: ADJUSTMENTS_ACCOUNT, amount: '', currency: '' },
      ]
    ),
  detect: (draft): FixBalanceFields | null => {
    if (draft.postings.length !== 2) return null;
    const asserted = draft.postings.find((p) => p.assertion && p.amount === '');
    const adjust = draft.postings.find(
      (p) =>
        p.account === ADJUSTMENTS_ACCOUNT &&
        p.amount === '' &&
        !p.assertion &&
        !p.cost
    );
    if (!asserted || !adjust || asserted === adjust || !asserted.assertion)
      return null;
    return {
      ...headerOf(draft),
      account: asserted.account,
      targetAmount: asserted.assertion.amount,
      targetCurrency: asserted.assertion.currency,
    };
  },
};
