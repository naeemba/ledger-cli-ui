import type { ParsedBlock } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';
import { type Balance, computeBalance } from '@/lib/transactions/balance';
import { carryAnnotations } from '@/lib/transactions/carryAnnotations.util';
import type { Posting } from '@/lib/transactions/posting';
import type { TransactionDraft } from '@/lib/transactions/schema';

export type { Posting } from '@/lib/transactions/posting';
export type { Balance } from '@/lib/transactions/balance';

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

  /** The two blank postings a fresh entry seeds with. */
  static blankPostings(defaultCurrency: string): Posting[] {
    return [
      { account: '', amount: '', currency: defaultCurrency },
      { account: '', amount: '', currency: defaultCurrency },
    ];
  }

  /** A blank two-posting draft for a fresh entry. */
  static empty(defaultCurrency: string): Transaction {
    return new Transaction({
      date: '',
      payee: '',
      status: 'none',
      note: '',
      postings: Transaction.blankPostings(defaultCurrency),
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

  /** Assemble a draft from its header fields and an explicit posting list. */
  static fromHeader(
    header: {
      date: string;
      payee: string;
      status: TransactionStatus;
      note: string;
      uid?: string;
    },
    postings: readonly Posting[]
  ): Transaction {
    return new Transaction({ ...header, postings });
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

  /** Classify whether the postings balance to zero per currency. */
  balance(): Balance {
    return computeBalance(this.postings);
  }

  /**
   * Compact `source → destination` summary using leaf account names. Sides are
   * split by posting sign (money out vs money in) so the arrow reflects the
   * real flow — `Blubank → Cigarette_Alcohol, Wage` — rather than journal
   * order. Leaf names keep the useful legs from being truncated away behind
   * long `Expenses:`/`Assets:Bank:` prefixes. Not accounting math: it only
   * reads the signs ledger already assigned, and never sums across currencies.
   */
  accountsSummary(): string {
    const leaf = (account: string) => account.split(':').pop() || account;
    const side = (accounts: string[]) => {
      const names = accounts.map(leaf);
      return names.length > 2
        ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
        : names.join(', ');
    };
    const sources: string[] = [];
    const destinations: string[] = [];
    const balancing: string[] = [];
    for (const p of this.postings) {
      const value = Number(p.amount);
      if (value < 0) sources.push(p.account);
      else if (value > 0) destinations.push(p.account);
      // A bare auto-balanced posting parses to `amount: ''` (→ NaN). It's the
      // balancing leg, so its sign is opposite the explicit legs — the most
      // common ledger style elides exactly this side.
      else if (p.amount.trim() === '' || !Number.isFinite(value))
        balancing.push(p.account);
    }
    // Assign the elided balancing leg to whichever side is empty: if every
    // explicit posting is money-out it settles as money-in, and vice versa.
    if (balancing.length) {
      if (destinations.length && !sources.length) sources.push(...balancing);
      else if (sources.length && !destinations.length)
        destinations.push(...balancing);
    }
    if (sources.length && destinations.length) {
      return `${side(sources)} → ${side(destinations)}`;
    }
    // No clear two sides (single posting, or amounts that don't parse):
    // fall back to a plain leaf-name list.
    return side(this.postings.map((p) => p.account));
  }

  /** Sum of positive posting amounts per currency — the transaction magnitude. */
  magnitudesByCurrency(): Array<[string, number]> {
    const sums = new Map<string, number>();
    for (const p of this.postings) {
      const value = Number(p.amount);
      if (!Number.isFinite(value) || value <= 0) continue;
      sums.set(p.currency || '', (sums.get(p.currency || '') ?? 0) + value);
    }
    return [...sums.entries()];
  }

  toTemplate(): TemplateDraft {
    // Drop blank filler rows (the default two-row scaffold and leftover "Add
    // posting" rows) so the saved template matches the postings the entry form
    // counted as savable — an empty account fails accountSchema and would
    // otherwise reject the whole template with an opaque "Validation failed."
    return {
      payee: this.payee.trim() || '—',
      status: this.status,
      note: this.note.trim() || undefined,
      postings: this.postings
        .filter((p) => p.account.trim() !== '')
        .map(trimPosting),
    };
  }
}

/**
 * A {@link Transaction} that came from a parsed journal file, where the
 * identity/location fields are guaranteed present. The base model widens these
 * to optional so scratch drafts can share the class; this alias restores the
 * compile-time guarantee for the read/write paths that require a real file,
 * line span, and fingerprint. `parseJournalFile` is the sole producer — the one
 * place that vouches for these fields, so consumers never need `!`.
 */
export type ParsedTransaction = Transaction &
  Required<
    Pick<
      Transaction,
      'file' | 'startLine' | 'endLine' | 'rawBlock' | 'fingerprint'
    >
  >;
