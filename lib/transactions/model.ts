import type { ParsedBlock, ParsedTransaction } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';
import { carryAnnotations } from '@/lib/transactions/carryAnnotations.util';
import type { Posting } from '@/lib/transactions/posting';
import type { TransactionDraft } from '@/lib/transactions/schema';

export type { Posting } from '@/lib/transactions/posting';

export type TransactionStatus = TransactionDraft['status'];

export type TransactionJSON = {
  date: string;
  payee: string;
  status: TransactionStatus;
  note?: string;
  uid?: string;
  postings: Posting[];
};

export class Transaction {
  constructor(
    readonly date: string,
    readonly payee: string,
    readonly status: TransactionStatus,
    readonly note: string,
    readonly postings: readonly Posting[],
    readonly uid?: string
  ) {}

  static fromTransaction(
    tx: ParsedTransaction,
    defaultCurrency: string
  ): Transaction {
    return new Transaction(
      tx.date,
      tx.payee,
      tx.status,
      tx.note ?? '',
      tx.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carryAnnotations(p),
      })),
      tx.uid ?? undefined
    );
  }

  static fromParsedBlock(
    block: Omit<ParsedBlock, 'unparsedLines'>,
    prev?: Transaction
  ): Transaction {
    return new Transaction(
      block.date,
      block.payee,
      block.status,
      block.note ?? '',
      block.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency,
        ...carryAnnotations(p),
      })),
      block.uid ?? prev?.uid
    );
  }

  static fromTemplate(t: TemplateDraft, defaultCurrency: string): Transaction {
    return new Transaction(
      '',
      t.payee,
      t.status,
      t.note ?? '',
      t.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carryAnnotations(p),
      }))
    );
  }

  withField(
    field: 'date' | 'payee' | 'status' | 'note',
    value: string
  ): Transaction {
    return new Transaction(
      field === 'date' ? value : this.date,
      field === 'payee' ? value : this.payee,
      field === 'status' ? (value as TransactionStatus) : this.status,
      field === 'note' ? value : this.note,
      this.postings,
      this.uid
    );
  }

  withPosting(index: number, patch: Partial<Posting>): Transaction {
    return this.replacePostings(
      this.postings.map((p, i) => (i === index ? { ...p, ...patch } : p))
    );
  }

  addPosting(currency: string): Transaction {
    return this.replacePostings([
      ...this.postings,
      { account: '', amount: '', currency },
    ]);
  }

  removePosting(index: number): Transaction {
    if (this.postings.length <= 2) return this;
    return this.replacePostings(this.postings.filter((_, i) => i !== index));
  }

  private replacePostings(postings: readonly Posting[]): Transaction {
    return new Transaction(
      this.date,
      this.payee,
      this.status,
      this.note,
      postings,
      this.uid
    );
  }

  private trimmedPostings(): Posting[] {
    return this.postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
      ...(p.cost
        ? {
            cost: {
              amount: p.cost.amount.trim(),
              currency: p.cost.currency.trim(),
            },
          }
        : {}),
      ...(p.assertion
        ? {
            assertion: {
              amount: p.assertion.amount.trim(),
              currency: p.assertion.currency.trim(),
            },
          }
        : {}),
    }));
  }

  toWire(mode: 'create' | 'edit'): TransactionJSON {
    return {
      date: this.date,
      payee: this.payee.trim(),
      status: this.status,
      note: this.note.trim() || undefined,
      uid: mode === 'edit' ? this.uid : undefined,
      postings: this.trimmedPostings(),
    };
  }

  toTemplate(): TemplateDraft {
    return {
      payee: this.payee.trim() || '—',
      status: this.status,
      note: this.note.trim() || undefined,
      postings: this.trimmedPostings(),
    };
  }
}
