// features/transactions/entry/types/exchange.ts
import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount } from './amount';
import {
  type ExtraItem,
  balancingPostings,
  extraItemPostings,
  singleAccount,
  toExtraItems,
} from './extraItems';
import { computeBalance } from '@/lib/transactions/balance';
import { Transaction } from '@/lib/transactions/model';

export type ExchangeFields = HeaderFields & {
  gaveAmount: string;
  gaveCurrency: string;
  gaveFrom: string;
  gotAmount: string;
  gotCurrency: string;
  gotInto: string;
  extraItems: ExtraItem[];
};

export const exchangeAdapter: TransactionTypeAdapter<ExchangeFields> = {
  id: 'exchange',
  label: 'Exchange',
  icon: '💱',
  emptyFields: (ctx: TypeContext): ExchangeFields => ({
    date: '',
    payee: 'Currency exchange',
    status: 'none',
    note: '',
    gaveAmount: '',
    gaveCurrency: ctx.defaultCurrency,
    gaveFrom: '',
    gotAmount: '',
    gotCurrency: '',
    gotInto: '',
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
    const got = {
      account: f.gotInto,
      amount: f.gotAmount,
      currency: f.gotCurrency,
      cost: { amount: f.gaveAmount, currency: f.gaveCurrency },
    };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        got,
        {
          account: f.gaveFrom,
          amount: `-${absAmount(f.gaveAmount)}`,
          currency: f.gaveCurrency,
        },
      ]);
    }
    const items = [got, ...extras];
    return Transaction.fromHeader(header, [
      ...items,
      ...balancingPostings(f.gaveFrom, items),
    ]);
  },
  detect: (draft): ExchangeFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.assertion)) return null;
    const costPostings = postings.filter((p) => p.cost);
    if (costPostings.length !== 1) return null;
    const got = costPostings[0];
    const cost = got.cost;
    if (!cost) return null;
    const rest = postings.filter((p) => p !== got);
    const expensePostings = rest.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    const gavePostings = rest.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    if (expensePostings.length + gavePostings.length !== rest.length)
      return null;
    if (gavePostings.length < 1) return null;
    const gaveFrom = singleAccount(gavePostings);
    if (!gaveFrom) return null;
    if (got.amount === '' || !(Number(got.amount) > 0)) return null;
    const balanceKind = computeBalance(postings).kind;
    if (balanceKind !== 'balanced' && balanceKind !== 'auto-balance')
      return null;
    return {
      ...headerOf(draft),
      gaveAmount: cost.amount,
      gaveCurrency: cost.currency,
      gaveFrom,
      gotAmount: absAmount(got.amount),
      gotCurrency: got.currency,
      gotInto: got.account,
      extraItems: toExtraItems(expensePostings),
    };
  },
};
