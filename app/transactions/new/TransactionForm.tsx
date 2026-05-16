'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  createTransactionAction,
  type TransactionActionState,
} from './actions';
import { useRouter } from 'next/navigation';

type Status = 'cleared' | 'pending' | 'none';

type Posting = {
  account: string;
  amount: string;
  currency: string;
};

type Props = {
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
};

const todayISO = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};

const initialState: TransactionActionState = { ok: false };

const fieldError = (state: TransactionActionState | null, key: string) =>
  state?.fieldErrors?.[key];

const TransactionForm = ({ accounts, payees, defaultCurrency }: Props) => {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createTransactionAction,
    initialState
  );

  const [date, setDate] = useState(todayISO);
  const [payee, setPayee] = useState('');
  const [status, setStatus] = useState<Status>('none');
  const [note, setNote] = useState('');
  const [postings, setPostings] = useState<Posting[]>([
    { account: '', amount: '', currency: defaultCurrency },
    { account: '', amount: '', currency: defaultCurrency },
  ]);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      router.push('/');
      router.refresh();
    }
  }, [state, router]);

  const balance = computeBalance(postings);

  const canSubmit =
    !isPending &&
    date !== '' &&
    payee.trim() !== '' &&
    postings.every((p) => p.account.trim() !== '') &&
    (balance.kind === 'balanced' || balance.kind === 'auto-balance');

  const updatePosting = (idx: number, patch: Partial<Posting>) => {
    setPostings((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const addPosting = () => {
    setPostings((rows) => [
      ...rows,
      { account: '', amount: '', currency: defaultCurrency },
    ]);
  };

  const removePosting = (idx: number) => {
    setPostings((rows) =>
      rows.length <= 2 ? rows : rows.filter((_, i) => i !== idx)
    );
  };

  const draftJson = JSON.stringify({
    date,
    payee: payee.trim(),
    status,
    note: note.trim() || undefined,
    postings: postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
    })),
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <input type="hidden" name="draft" value={draftJson} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" error={fieldError(state, 'date')}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass(!!fieldError(state, 'date'))}
            required
          />
        </Field>

        <Field label="Status">
          <div className="inline-flex rounded-md border border-border bg-bg p-0.5 text-sm">
            {(
              [
                ['none', 'Unmarked'],
                ['pending', 'Pending (!)'],
                ['cleared', 'Cleared (*)'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setStatus(value)}
                className={
                  status === value
                    ? 'rounded-sm bg-subtle px-3 py-1 text-fg'
                    : 'rounded-sm px-3 py-1 text-muted hover:text-fg'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Payee" error={fieldError(state, 'payee')}>
        <input
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          list="payee-suggestions"
          autoComplete="off"
          required
          className={inputClass(!!fieldError(state, 'payee'))}
        />
        <datalist id="payee-suggestions">
          {payees.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>

      <Field label="Note (optional)" error={fieldError(state, 'note')}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Comment lines — written below the payee with a ; prefix"
          className={inputClass(!!fieldError(state, 'note'))}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Postings
          </span>
          <BalanceIndicator balance={balance} />
        </div>

        <datalist id="account-suggestions">
          {accounts.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>

        <div className="flex flex-col gap-2">
          {postings.map((posting, idx) => (
            <PostingRow
              key={idx}
              posting={posting}
              canRemove={postings.length > 2}
              onChange={(patch) => updatePosting(idx, patch)}
              onRemove={() => removePosting(idx)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={addPosting}
            className="text-sm font-medium text-accent hover:underline"
          >
            + Add posting
          </button>
          {fieldError(state, 'postings') && (
            <span className="text-xs text-negative">
              {fieldError(state, 'postings')}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save transaction'}
        </button>
        <span className="text-xs text-muted">
          Appended to your journal&apos;s main file.
        </span>
      </div>

      {state?.formError && (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-sm text-negative">
          {state.formError}
        </div>
      )}
    </form>
  );
};

const inputClass = (invalid: boolean) =>
  `w-full rounded-md border bg-bg px-3 py-2 text-sm text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40 ${
    invalid ? 'border-negative' : 'border-border'
  }`;

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium uppercase tracking-wider text-muted">
      {label}
    </span>
    {children}
    {error && <span className="text-xs text-negative">{error}</span>}
  </label>
);

const PostingRow = ({
  posting,
  canRemove,
  onChange,
  onRemove,
}: {
  posting: Posting;
  canRemove: boolean;
  onChange: (patch: Partial<Posting>) => void;
  onRemove: () => void;
}) => (
  <div className="grid grid-cols-[1fr_140px_90px_auto] items-center gap-2">
    <input
      type="text"
      value={posting.account}
      onChange={(e) => onChange({ account: e.target.value })}
      list="account-suggestions"
      placeholder="Account (e.g. Expenses:Food)"
      autoComplete="off"
      className={inputClass(false)}
    />
    <input
      type="text"
      inputMode="decimal"
      value={posting.amount}
      onChange={(e) => onChange({ amount: e.target.value })}
      placeholder="Amount"
      className={`${inputClass(false)} text-right tabular-nums`}
    />
    <input
      type="text"
      value={posting.currency}
      onChange={(e) => onChange({ currency: e.target.value })}
      placeholder="Currency"
      className={inputClass(false)}
    />
    <button
      type="button"
      onClick={onRemove}
      disabled={!canRemove}
      title={canRemove ? 'Remove posting' : 'At least two postings required'}
      className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-30"
    >
      ×
    </button>
  </div>
);

type Balance =
  | { kind: 'balanced' }
  | { kind: 'auto-balance' }
  | { kind: 'invalid' }
  | { kind: 'too-many-blanks' }
  | { kind: 'unbalanced'; issues: [string, number][] };

const computeBalance = (postings: Posting[]): Balance => {
  const blanks = postings.filter((p) => p.amount.trim() === '').length;
  if (blanks > 1) return { kind: 'too-many-blanks' };
  if (blanks === 1) return { kind: 'auto-balance' };
  const byCurrency = new Map<string, number>();
  for (const p of postings) {
    const value = Number(p.amount);
    if (!Number.isFinite(value)) return { kind: 'invalid' };
    byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + value);
  }
  const issues = [...byCurrency.entries()].filter(
    ([, total]) => Math.abs(total) > 1e-9
  );
  if (issues.length === 0) return { kind: 'balanced' };
  return { kind: 'unbalanced', issues };
};

const BalanceIndicator = ({ balance }: { balance: Balance }) => {
  if (balance.kind === 'balanced') {
    return <span className="text-xs text-positive">Balanced</span>;
  }
  if (balance.kind === 'auto-balance') {
    return (
      <span className="text-xs text-muted">
        Blank posting will auto-balance
      </span>
    );
  }
  if (balance.kind === 'too-many-blanks') {
    return (
      <span className="text-xs text-negative">
        Only one posting may be blank
      </span>
    );
  }
  if (balance.kind === 'invalid') {
    return <span className="text-xs text-negative">Invalid amount</span>;
  }
  return (
    <span className="text-xs text-negative tabular-nums">
      Off by{' '}
      {balance.issues
        .map(([ccy, total]) => `${ccy} ${total.toFixed(2)}`)
        .join(', ')}
    </span>
  );
};

export default TransactionForm;
