'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  createTransactionAction,
  type TransactionActionState,
} from './actions';
import Combobox from '@/components/Combobox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
      toast.success('Transaction saved', {
        description: `${payee.trim() || 'New entry'} appended to your journal.`,
      });
      router.push('/');
      router.refresh();
    }
    // payee is intentionally omitted — we only want this effect to run on
    // state changes from the server action, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="draft" value={draftJson} />

          <div className="grid gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <section className="flex flex-col gap-5">
              <SectionLabel>Details</SectionLabel>

              <Field
                label="Date"
                htmlFor="tx-date"
                error={fieldError(state, 'date')}
              >
                <Input
                  id="tx-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={!!fieldError(state, 'date')}
                  required
                />
              </Field>

              <Field label="Status">
                <ToggleGroup
                  value={[status]}
                  onValueChange={(values) => {
                    if (values.length > 0) setStatus(values[0] as Status);
                  }}
                  spacing={0}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <ToggleGroupItem value="none" className="flex-1">
                    Unmarked
                  </ToggleGroupItem>
                  <ToggleGroupItem value="pending" className="flex-1">
                    Pending (!)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="cleared" className="flex-1">
                    Cleared (*)
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <Field label="Payee" error={fieldError(state, 'payee')}>
                <Combobox
                  value={payee}
                  onChange={setPayee}
                  options={payees}
                  placeholder="Type or pick a payee…"
                />
              </Field>

              <Field
                label="Note (optional)"
                htmlFor="tx-note"
                error={fieldError(state, 'note')}
              >
                <Textarea
                  id="tx-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Comment lines — written below the payee with a ; prefix"
                  aria-invalid={!!fieldError(state, 'note')}
                />
              </Field>
            </section>

            <section className="flex flex-col gap-3 lg:border-l lg:border-border lg:pl-8">
              <div className="flex items-baseline justify-between">
                <SectionLabel>Postings</SectionLabel>
                <BalanceIndicator balance={balance} />
              </div>

              <div className="flex flex-col gap-2">
                {postings.map((posting, idx) => (
                  <PostingRow
                    key={idx}
                    posting={posting}
                    accounts={accounts}
                    canRemove={postings.length > 2}
                    onChange={(patch) => updatePosting(idx, patch)}
                    onRemove={() => removePosting(idx)}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  onClick={addPosting}
                  variant="link"
                  size="sm"
                  className="px-0"
                >
                  + Add posting
                </Button>
                {fieldError(state, 'postings') && (
                  <span className="text-xs text-destructive">
                    {fieldError(state, 'postings')}
                  </span>
                )}
              </div>
            </section>
          </div>

          {state?.formError && (
            <Alert variant="destructive">
              <AlertDescription>{state.formError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              Appended to your journal&apos;s main file.
            </span>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? 'Saving…' : 'Save transaction'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </div>
);

const Field = ({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {error && <span className="text-xs text-destructive">{error}</span>}
  </div>
);

const PostingRow = ({
  posting,
  accounts,
  canRemove,
  onChange,
  onRemove,
}: {
  posting: Posting;
  accounts: string[];
  canRemove: boolean;
  onChange: (patch: Partial<Posting>) => void;
  onRemove: () => void;
}) => (
  <div className="grid grid-cols-[1fr_140px_90px_auto] items-center gap-2">
    <Combobox
      value={posting.account}
      onChange={(v) => onChange({ account: v })}
      options={accounts}
      placeholder="Account (e.g. Expenses:Food)"
    />
    <Input
      type="text"
      inputMode="decimal"
      value={posting.amount}
      onChange={(e) => onChange({ amount: e.target.value })}
      placeholder="Amount"
      className="text-right tabular-nums"
    />
    <Input
      type="text"
      value={posting.currency}
      onChange={(e) => onChange({ currency: e.target.value })}
      placeholder="Currency"
    />
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onRemove}
      disabled={!canRemove}
      title={canRemove ? 'Remove posting' : 'At least two postings required'}
    >
      ×
    </Button>
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
