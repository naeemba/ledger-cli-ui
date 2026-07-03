import type { Annotation, Transaction } from '@/lib/journal/parser';

export type Posting = {
  account: string;
  amount: string;
  currency: string;
  cost?: Annotation;
  assertion?: Annotation;
};

export type TxnStatus = 'cleared' | 'pending' | 'none';

const carry = (p: {
  cost?: Annotation;
  assertion?: Annotation;
}): Pick<Posting, 'cost' | 'assertion'> => ({
  ...(p.cost ? { cost: p.cost } : {}),
  ...(p.assertion ? { assertion: p.assertion } : {}),
});

const blankPostings = (currency: string): Posting[] => [
  { account: '', amount: '', currency },
  { account: '', amount: '', currency },
];

export class Txn {
  constructor(
    readonly date: string,
    readonly payee: string,
    readonly status: TxnStatus,
    readonly note: string,
    readonly postings: readonly Posting[],
    readonly uid?: string
  ) {}

  static empty(defaultCurrency: string): Txn {
    return new Txn('', '', 'none', '', blankPostings(defaultCurrency));
  }

  static fromTransaction(tx: Transaction, defaultCurrency: string): Txn {
    return new Txn(
      tx.date,
      tx.payee,
      tx.status,
      tx.note ?? '',
      tx.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carry(p),
      })),
      tx.uid ?? undefined
    );
  }
}
