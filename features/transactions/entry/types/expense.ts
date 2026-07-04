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

export type ExpenseFields = HeaderFields & {
  amount: string;
  currency: string;
  paidFrom: string;
  spentOn: string;
};

export const expenseAdapter: TransactionTypeAdapter<ExpenseFields> = {
  id: 'expense',
  label: 'Expense',
  icon: '🛒',
  emptyFields: (ctx: TypeContext): ExpenseFields => ({
    date: '',
    payee: '',
    status: 'none',
    note: '',
    amount: '',
    currency: ctx.defaultCurrency,
    paidFrom: '',
    spentOn: '',
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
        { account: f.spentOn, amount: f.amount, currency: f.currency },
        {
          account: f.paidFrom,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]
    ),
  detect: (draft): ExpenseFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.cost || p.assertion)) return null;
    const exp = draft.postings.find(
      (p) => classifyAccount(p.account) === 'expense'
    );
    const pay = draft.postings.find((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    if (!exp || !pay || exp === pay) return null;
    if (exp.amount === '' || pay.amount === '') return null;
    if (exp.currency !== pay.currency) return null;
    if (!(Number(exp.amount) > 0)) return null;
    if (Math.abs(Number(exp.amount) + Number(pay.amount)) > 1e-9) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(exp.amount),
      currency: exp.currency,
      paidFrom: pay.account,
      spentOn: exp.account,
    };
  },
};
