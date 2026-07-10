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

export type TransferFields = HeaderFields & {
  amount: string;
  currency: string;
  from: string;
  to: string;
  extraItems: ExtraItem[];
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
    const to = { account: f.to, amount: f.amount, currency: f.currency };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        to,
        {
          account: f.from,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]);
    }
    const items = [to, ...extras];
    return Transaction.fromHeader(header, [
      ...items,
      ...balancingPostings(f.from, items),
    ]);
  },
  detect: (draft): TransferFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.cost || p.assertion)) return null;
    const assetOrLiabilityPostings = postings.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    const expensePostings = postings.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    if (
      assetOrLiabilityPostings.length + expensePostings.length !==
      postings.length
    )
      return null;
    if (assetOrLiabilityPostings.length < 2) return null;
    const balanceKind = computeBalance(postings).kind;
    if (balanceKind !== 'balanced' && balanceKind !== 'auto-balance')
      return null;
    const positives = assetOrLiabilityPostings.filter(
      (p) => Number(p.amount) > 0
    );
    if (positives.length !== 1) return null;
    const to = positives[0];
    // `from` is the other asset/liability account. Its amount may be blank —
    // ledger auto-balances the outflow — so identify it by account, not by
    // sign (a `< 0` filter would miss the amount-less balancing posting).
    const from = singleAccount(
      assetOrLiabilityPostings.filter((p) => p.account !== to.account)
    );
    if (!from || from === to.account) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(to.amount),
      currency: to.currency,
      from,
      to: to.account,
      extraItems: toExtraItems(expensePostings),
    };
  },
};
