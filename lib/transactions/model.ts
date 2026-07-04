import type { ParsedBlock } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';
import { carryAnnotations } from '@/lib/transactions/carryAnnotations.util';
import type { Posting } from '@/lib/transactions/posting';
import type { TransactionDraft } from '@/lib/transactions/schema';

export type { Posting } from '@/lib/transactions/posting';

export type TransactionStatus = TransactionDraft['status'];

/**
 * Plain, structurally-cloneable projection of a {@link Transaction}. This is the
 * shape that crosses the two serialization boundaries where class instances are
 * forbidden — React Server Component props and `unstable_cache` — and that
 * {@link Transaction.from} rehydrates back into a working instance.
 *
 * Content fields are always present; the identity/location fields are optional
 * because a freshly-composed draft has no file, line span, or fingerprint yet —
 * only a transaction parsed from a journal file carries them.
 */
export type TransactionData = {
  date: string;
  payee: string;
  status: TransactionStatus;
  note: string;
  postings: readonly Posting[];
  uid?: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  rawBlock?: string;
  fingerprint?: string;
};

/** The wire payload the entry form submits (see {@link Transaction.toWire}). */
export type TransactionJSON = {
  date: string;
  payee: string;
  status: TransactionStatus;
  note?: string;
  uid?: string;
  postings: Posting[];
};

/** Read-only projection rendered by the transactions list (client boundary). */
export type TransactionRow = {
  uid?: string;
  file?: string;
  startLine?: number;
  date: string;
  payee: string;
  status: TransactionStatus;
  note: string;
  fingerprint?: string;
  postings: Posting[];
};

const trimAnnotation = (a: { amount: string; currency: string }) => ({
  amount: a.amount.trim(),
  currency: a.currency.trim(),
});

const trimPosting = (p: Posting): Posting => ({
  account: p.account.trim(),
  amount: p.amount.trim(),
  currency: p.currency.trim(),
  ...(p.cost ? { cost: trimAnnotation(p.cost) } : {}),
  ...(p.assertion ? { assertion: trimAnnotation(p.assertion) } : {}),
});

/**
 * The single handler for every transaction and posting operation: constructing
 * one (from a parsed block, a template, a form, or scratch), mutating it, and
 * projecting it to a wire/row/template/plain shape. Instances are immutable —
 * every mutator returns a new instance.
 */
export class Transaction {
  readonly date: string;
  readonly payee: string;
  readonly status: TransactionStatus;
  readonly note: string;
  readonly postings: readonly Posting[];
  readonly uid?: string;
  readonly file?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly rawBlock?: string;
  readonly fingerprint?: string;

  constructor(data: TransactionData) {
    this.date = data.date;
    this.payee = data.payee;
    this.status = data.status;
    this.note = data.note;
    this.postings = data.postings;
    this.uid = data.uid;
    this.file = data.file;
    this.startLine = data.startLine;
    this.endLine = data.endLine;
    this.rawBlock = data.rawBlock;
    this.fingerprint = data.fingerprint;
  }

  /** Rehydrate an instance from its plain projection (cache / RSC boundary). */
  static from(data: TransactionData): Transaction {
    return new Transaction(data);
  }

  /**
   * Terse positional factory for fixtures and tests:
   * `(date, payee, status, note, postings, uid?)`. Production code builds
   * through the named factories ({@link empty}, {@link fromParsedBlock},
   * {@link fromTemplate}, {@link from}) or the object constructor.
   */
  static of(
    date: string,
    payee: string,
    status: TransactionStatus,
    note: string,
    postings: readonly Posting[],
    uid?: string
  ): Transaction {
    return new Transaction({ date, payee, status, note, postings, uid });
  }

  /** A blank two-posting draft for a fresh entry. */
  static empty(defaultCurrency: string): Transaction {
    return new Transaction({
      date: '',
      payee: '',
      status: 'none',
      note: '',
      postings: [
        { account: '', amount: '', currency: defaultCurrency },
        { account: '', amount: '', currency: defaultCurrency },
      ],
    });
  }

  static fromParsedBlock(
    block: Omit<ParsedBlock, 'unparsedLines'>,
    prev?: Transaction
  ): Transaction {
    return new Transaction({
      date: block.date,
      payee: block.payee,
      status: block.status,
      note: block.note ?? '',
      postings: block.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency,
        ...carryAnnotations(p),
      })),
      uid: block.uid ?? prev?.uid,
    });
  }

  static fromTemplate(t: TemplateDraft, defaultCurrency: string): Transaction {
    return new Transaction({
      date: '',
      payee: t.payee,
      status: t.status,
      note: t.note ?? '',
      postings: t.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carryAnnotations(p),
      })),
    });
  }

  /**
   * Fill blank posting currencies with the user's default. Used when a parsed
   * transaction (whose commodity-less postings carry an empty currency) is
   * loaded into the editable form.
   */
  withDefaultCurrency(defaultCurrency: string): Transaction {
    return this.replacePostings(
      this.postings.map((p) => ({
        ...p,
        currency: p.currency || defaultCurrency,
      }))
    );
  }

  withField(
    field: 'date' | 'payee' | 'status' | 'note',
    value: string
  ): Transaction {
    return new Transaction({
      ...this.toData(),
      date: field === 'date' ? value : this.date,
      payee: field === 'payee' ? value : this.payee,
      status: field === 'status' ? (value as TransactionStatus) : this.status,
      note: field === 'note' ? value : this.note,
    });
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
    return new Transaction({ ...this.toData(), postings: [...postings] });
  }

  /** Plain projection for the cache / server→client boundary. */
  toData(): TransactionData {
    return {
      date: this.date,
      payee: this.payee,
      status: this.status,
      note: this.note,
      postings: [...this.postings],
      uid: this.uid,
      file: this.file,
      startLine: this.startLine,
      endLine: this.endLine,
      rawBlock: this.rawBlock,
      fingerprint: this.fingerprint,
    };
  }

  /** Lean read-only projection for the transactions list. */
  toRow(): TransactionRow {
    return {
      uid: this.uid,
      file: this.file,
      startLine: this.startLine,
      date: this.date,
      payee: this.payee,
      status: this.status,
      note: this.note,
      fingerprint: this.fingerprint,
      postings: [...this.postings],
    };
  }

  toWire(mode: 'create' | 'edit'): TransactionJSON {
    return {
      date: this.date,
      payee: this.payee.trim(),
      status: this.status,
      note: this.note.trim() || undefined,
      uid: mode === 'edit' ? this.uid : undefined,
      postings: this.postings.map(trimPosting),
    };
  }

  toTemplate(): TemplateDraft {
    return {
      payee: this.payee.trim() || '—',
      status: this.status,
      note: this.note.trim() || undefined,
      postings: this.postings.map(trimPosting),
    };
  }
}
