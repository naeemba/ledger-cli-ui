import type {
  Annotation,
  ParsedBlock,
  Transaction,
} from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

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

  static fromParsedBlock(
    block: Omit<ParsedBlock, 'unparsedLines'>,
    prev?: Txn
  ): Txn {
    return new Txn(
      block.date,
      block.payee,
      block.status,
      block.note ?? '',
      block.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency,
        ...carry(p),
      })),
      block.uid ?? prev?.uid
    );
  }

  static fromTemplate(t: TemplateDraft, defaultCurrency: string): Txn {
    return new Txn(
      '',
      t.payee,
      t.status,
      t.note ?? '',
      t.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carry(p),
      }))
    );
  }

  static fromJSON(j: unknown): Txn {
    const o = j as {
      date?: string;
      payee?: string;
      status?: TxnStatus;
      note?: string;
      uid?: string;
      postings?: Posting[];
    };
    return new Txn(
      o.date ?? '',
      o.payee ?? '',
      o.status ?? 'none',
      o.note ?? '',
      (o.postings ?? []).map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency,
        ...carry(p),
      })),
      o.uid
    );
  }
}
