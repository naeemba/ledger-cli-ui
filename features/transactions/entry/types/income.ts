import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount, negateAmount } from './amount';
import { Transaction } from '@/lib/transactions/model';

export type IncomeFields = HeaderFields & {
  amount: string;
  currency: string;
  receivedInto: string;
  from: string;
};

export const incomeAdapter: TransactionTypeAdapter<IncomeFields> = {
  id: 'income',
  label: 'Income',
  icon: '💰',
  emptyFields: (ctx: TypeContext): IncomeFields => ({
    date: '',
    payee: '',
    status: 'none',
    note: '',
    amount: '',
    currency: ctx.defaultCurrency,
    receivedInto: '',
    from: '',
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
        { account: f.receivedInto, amount: f.amount, currency: f.currency },
        {
          account: f.from,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]
    ),
  detect: (draft): IncomeFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.cost || p.assertion)) return null;
    const asset = draft.postings.find(
      (p) => classifyAccount(p.account) === 'asset'
    );
    const income = draft.postings.find(
      (p) => classifyAccount(p.account) === 'income'
    );
    if (!asset || !income || asset === income) return null;
    if (asset.amount === '' || income.amount === '') return null;
    if (asset.currency !== income.currency) return null;
    if (!(Number(asset.amount) > 0)) return null;
    if (Math.abs(Number(asset.amount) + Number(income.amount)) > 1e-9)
      return null;
    return {
      ...headerOf(draft),
      amount: absAmount(asset.amount),
      currency: asset.currency,
      receivedInto: asset.account,
      from: income.account,
    };
  },
};
