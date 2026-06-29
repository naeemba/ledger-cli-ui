// features/transactions/entry/types/exchange.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
  draftFromHeader,
} from './adapter';
import { absAmount } from './amount';

export type ExchangeFields = HeaderFields & {
  gaveAmount: string;
  gaveCurrency: string;
  gaveFrom: string;
  gotAmount: string;
  gotCurrency: string;
  gotInto: string;
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
  }),
  compile: (f, _ctx): DraftState =>
    draftFromHeader(
      {
        date: f.date,
        payee: f.payee,
        status: f.status,
        note: f.note,
        uid: f.uid,
      },
      [
        {
          account: f.gotInto,
          amount: f.gotAmount,
          currency: f.gotCurrency,
          cost: { amount: f.gaveAmount, currency: f.gaveCurrency },
        },
        {
          account: f.gaveFrom,
          amount: `-${absAmount(f.gaveAmount)}`,
          currency: f.gaveCurrency,
        },
      ]
    ),
  detect: (draft): ExchangeFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.assertion)) return null;
    const got = draft.postings.find((p) => p.cost);
    const gave = draft.postings.find((p) => !p.cost);
    if (!got || !gave || got === gave || !got.cost) return null;
    if (got.amount === '' || gave.amount === '') return null;
    if (!(Number(got.amount) > 0) || !(Number(gave.amount) < 0)) return null;
    if (gave.currency !== got.cost.currency) return null;
    if (Math.abs(Number(gave.amount) + Number(got.cost.amount)) > 1e-9)
      return null;
    return {
      ...headerOf(draft),
      gaveAmount: got.cost.amount,
      gaveCurrency: got.cost.currency,
      gaveFrom: gave.account,
      gotAmount: absAmount(got.amount),
      gotCurrency: got.currency,
      gotInto: got.account,
    };
  },
};
