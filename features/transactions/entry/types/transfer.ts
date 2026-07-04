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

export type TransferFields = HeaderFields & {
  amount: string;
  currency: string;
  from: string;
  to: string;
};

export const transferAdapter: TransactionTypeAdapter<TransferFields> = {
  id: 'transfer',
  label: 'Transfer',
  icon: '🔁',
  emptyFields: (ctx: TypeContext): TransferFields => ({
    date: '',
    payee: 'Transfer',
    status: 'none',
    note: '',
    amount: '',
    currency: ctx.defaultCurrency,
    from: '',
    to: '',
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
        { account: f.to, amount: f.amount, currency: f.currency },
        {
          account: f.from,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]
    ),
  detect: (draft): TransferFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.cost || p.assertion)) return null;
    if (draft.postings.some((p) => classifyAccount(p.account) !== 'asset'))
      return null;
    const [a, b] = draft.postings;
    if (a.amount === '' || b.amount === '') return null;
    if (a.currency !== b.currency) return null;
    if (Math.abs(Number(a.amount) + Number(b.amount)) > 1e-9) return null;
    const to = Number(a.amount) > 0 ? a : b;
    const from = Number(a.amount) > 0 ? b : a;
    if (!(Number(to.amount) > 0)) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(to.amount),
      currency: to.currency,
      from: from.account,
      to: to.account,
    };
  },
};
