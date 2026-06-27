'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import type { TransactionActionState } from './actions';
import Combobox from '@/components/Combobox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import SaveAsTemplateButton from '@/features/templates/SaveAsTemplateButton';
import type { TemplateDraft } from '@/lib/templates/schema';
import type { TransactionDraft } from '@/lib/transactions/schema';
import { useRouter } from 'next/navigation';

type Status = 'cleared' | 'pending' | 'none';

type Posting = {
  account: string;
  amount: string;
  currency: string;
};

type SubmitAction = (
  prev: TransactionActionState | null,
  formData: FormData
) => Promise<TransactionActionState>;

type Props = {
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
  mode?: 'create' | 'edit';
  // `date` is optional on the prop so server-side template prefill can omit it
  // and let the client compute today's date in the user's local timezone.
  initialDraft?: Omit<TransactionDraft, 'date'> & { date?: string };
  uid?: string;
  expectedFingerprint?: string;
  submitAction: SubmitAction;
  templateMissing?: boolean;
};

const todayISO = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};

const initialState: TransactionActionState = { ok: false };

const fieldError = (state: TransactionActionState | null, key: string) =>
  state?.fieldErrors?.[key];

const TransactionForm = ({
  accounts,
  payees,
  defaultCurrency,
  mode,
  initialDraft,
  uid,
  expectedFingerprint,
  submitAction,
  templateMissing,
}: Props) => {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    submitAction,
    initialState
  );

  const [date, setDate] = useState(initialDraft?.date ?? todayISO);
  const [payee, setPayee] = useState(initialDraft?.payee ?? '');
  const [status, setStatus] = useState<Status>(initialDraft?.status ?? 'none');
  const [note, setNote] = useState(initialDraft?.note ?? '');
  const [postings, setPostings] = useState<Posting[]>(
    initialDraft?.postings.map((p) => ({
      account: p.account,
      amount: p.amount,
      currency: p.currency,
    })) ?? [
      { account: '', amount: '', currency: defaultCurrency },
      { account: '', amount: '', currency: defaultCurrency },
    ]
  );

  const formRef = useRef<HTMLFormElement>(null);
  // Set by the "Save & add another" button so the success effect resets the
  // form in place instead of navigating away. Reset after each save.
  const saveAndAddAnother = useRef(false);

  const resetForm = useCallback(() => {
    setDate(todayISO());
    setPayee('');
    setStatus('none');
    setNote('');
    setPostings([
      { account: '', amount: '', currency: defaultCurrency },
      { account: '', amount: '', currency: defaultCurrency },
    ]);
  }, [defaultCurrency]);

  useEffect(() => {
    if (!state?.ok) return;
    if (mode === 'edit') {
      toast.success('Transaction updated');
      router.push('/transactions');
      router.refresh();
      return;
    }
    toast.success('Transaction saved');
    if (saveAndAddAnother.current) {
      saveAndAddAnother.current = false;
      resetForm();
      router.refresh();
      return;
    }
    router.push('/');
    router.refresh();
  }, [state, router, mode, resetForm]);

  useEffect(() => {
    if (templateMissing) {
      toast.error('Template not found — starting from scratch');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const templateDraft: TemplateDraft = {
    payee: payee.trim() || '—',
    status,
    note: note.trim() || undefined,
    postings: postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
    })),
  };
  const canSaveTemplate =
    payee.trim() !== '' &&
    postings.filter((p) => p.account.trim() !== '').length >= 2;

  const draftJson = JSON.stringify({
    date,
    payee: payee.trim(),
    status,
    note: note.trim() || undefined,
    uid: mode === 'edit' ? uid : undefined,
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
          {mode === 'edit' && uid && (
            <input type="hidden" name="uid" value={uid} />
          )}
          {mode === 'edit' && expectedFingerprint && (
            <input
              type="hidden"
              name="expectedFingerprint"
              value={expectedFingerprint}
            />
          )}

          <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
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

            <section className="flex flex-col gap-3 md:border-l md:border-border md:pl-8">
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

          {state?.formError ===
          'This transaction was modified somewhere else.' ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{state.formError} Reload to see the latest version.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.refresh()}
                >
                  Reload
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            state?.formError && (
              <Alert variant="destructive">
                <AlertDescription>{state.formError}</AlertDescription>
              </Alert>
            )
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {mode === 'edit'
                ? 'Rewrites the original block in its source file.'
                : "Appended to your journal's main file."}
            </span>
            <div className="flex items-center gap-2">
              <SaveAsTemplateButton
                draft={templateDraft}
                disabled={!canSaveTemplate}
              />
              {mode !== 'edit' && (
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!canSubmit}
                  onClick={() => {
                    saveAndAddAnother.current = true;
                  }}
                >
                  {isPending ? 'Saving…' : 'Save & add another'}
                </Button>
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                onClick={() => {
                  saveAndAddAnother.current = false;
                }}
              >
                {isPending
                  ? 'Saving…'
                  : mode === 'edit'
                    ? 'Save changes'
                    : 'Add transaction'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-[0.7rem]">
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
  <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_140px_90px_auto] sm:rounded-none sm:border-0 sm:p-0">
    <Combobox
      value={posting.account}
      onChange={(v) => onChange({ account: v })}
      options={accounts}
      placeholder="Account (e.g. Expenses:Food)"
    />
    <div className="flex items-center gap-2 sm:contents">
      <Input
        type="text"
        inputMode="decimal"
        value={posting.amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        placeholder="Amount"
        className="flex-1 text-right tabular-nums sm:flex-none"
      />
      <Input
        type="text"
        value={posting.currency}
        onChange={(e) => onChange({ currency: e.target.value })}
        placeholder="Currency"
        className="w-24 sm:w-auto"
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
      <span className="text-xs text-muted-foreground">
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
