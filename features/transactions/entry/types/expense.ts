import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount, negateAmount } from './amount';
import {
  type ExtraItem,
  balancingPostings,
  extraItemPostings,
  singleAccount,
  toExtraItems,
} from './extraItems';
import { computeBalance } from '@/lib/transactions/balance';
import { Transaction } from '@/lib/transactions/model';

export type ExpenseFields = HeaderFields & {
  amount: string;
  currency: string;
  paidFrom: string;
  spentOn: string;
  extraItems: ExtraItem[];
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
    extraItems: [],
  }),
  compile: (f, _ctx): DraftState => {
    const header = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
    };
    const base = { account: f.spentOn, amount: f.amount, currency: f.currency };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        base,
        {
          account: f.paidFrom,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]);
    }
    const items = [base, ...extras];
    return Transaction.fromHeader(header, [
      ...items,
      ...balancingPostings(f.paidFrom, items),
    ]);
  },
  detect: (draft): ExpenseFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.cost || p.assertion)) return null;
    const expensePostings = postings.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    const payingPostings = postings.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    if (expensePostings.length + payingPostings.length !== postings.length)
      return null;
    if (expensePostings.length < 1 || payingPostings.length < 1) return null;
    const paidFrom = singleAccount(payingPostings);
    if (!paidFrom) return null;
    const balanceKind = computeBalance(postings).kind;
    if (balanceKind !== 'balanced' && balanceKind !== 'auto-balance')
      return null;
    const base = expensePostings[0];
    if (base.amount === '' || !(Number(base.amount) > 0)) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(base.amount),
      currency: base.currency,
      paidFrom,
      spentOn: base.account,
      extraItems: toExtraItems(expensePostings.slice(1)),
    };
  },
};
