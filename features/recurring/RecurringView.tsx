'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { createRecurringAction } from './actions/createRecurring';
import { deleteRecurringAction } from './actions/deleteRecurring';
import type { RecurringActionState } from './actions/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableScroll } from '@/components/ui/table';

type PostingRow = {
  id?: string;
  account: string;
  amount: string;
  currency: string;
};

export type RecurringRowView = {
  uid?: string;
  period: string;
  note?: string;
  fingerprint: string;
  postings: PostingRow[];
  nextDue?: string;
  unsupported: boolean;
};

type Props = { rows: RecurringRowView[]; baseCurrency: string };

const emptyPosting = (currency: string): PostingRow => ({
  id: crypto.randomUUID(),
  account: '',
  amount: '',
  currency,
});

const RecurringView = ({ rows, baseCurrency }: Props) => {
  const [state, formAction, isPending] = useActionState<
    RecurringActionState | null,
    FormData
  >(createRecurringAction, null);

  const [unit, setUnit] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [count, setCount] = useState('1');
  const [anchor, setAnchor] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState('');
  const [postings, setPostings] = useState<PostingRow[]>([
    emptyPosting(baseCurrency),
    emptyPosting(''),
  ]);

  const [isDeleting, startDelete] = useTransition();
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (uid: string, fingerprint: string) => {
    setDeleteError(null);
    setDeletingUid(uid);
    startDelete(async () => {
      const result = await deleteRecurringAction(uid, fingerprint);
      setDeletingUid(null);
      if (!result.ok) setDeleteError(result.message);
    });
  };

  const updatePosting = (i: number, patch: Partial<PostingRow>) =>
    setPostings((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPosting = () =>
    setPostings((ps) => [...ps, emptyPosting(baseCurrency)]);
  const removePosting = (i: number) =>
    setPostings((ps) => (ps.length > 2 ? ps.filter((_, j) => j !== i) : ps));

  const draft = JSON.stringify({
    schedule: { unit, count: Number(count), anchor },
    note: note.trim() || undefined,
    postings: postings
      .filter((p) => p.account.trim())
      .map((p) => ({
        account: p.account.trim(),
        amount: p.amount.trim(),
        currency: p.amount.trim() ? p.currency.trim() : '',
      })),
  });

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-4 rounded-lg border p-4">
        <input type="hidden" name="draft" value={draft} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="recurring-count">Repeats</Label>
            <div className="flex gap-2">
              <Input
                id="recurring-count"
                type="number"
                min={1}
                max={366}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-20"
                required
              />
              <select
                id="recurring-unit"
                value={unit}
                onChange={(e) =>
                  setUnit(e.target.value as 'day' | 'week' | 'month' | 'year')
                }
                className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              >
                <option value="day">Day(s)</option>
                <option value="week">Week(s)</option>
                <option value="month">Month(s)</option>
                <option value="year">Year(s)</option>
              </select>
              <Input
                id="recurring-anchor"
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                required
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Repeats on the anchor&apos;s day — e.g. every 1 months starting
              2026-01-05 runs on the 5th.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="recurring-note">Note (optional)</Label>
            <Input
              id="recurring-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Netflix subscription"
            />
          </div>
        </div>

        <div className="space-y-2">
          {postings.map((p, i) => (
            <div
              key={p.id ?? i}
              className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-end sm:rounded-none sm:border-0 sm:p-0"
            >
              <div className="flex-2 space-y-1 sm:flex-1">
                {i === 0 && (
                  <Label htmlFor={`recurring-account-${i}`}>Account</Label>
                )}
                <Input
                  id={`recurring-account-${i}`}
                  value={p.account}
                  onChange={(e) =>
                    updatePosting(i, { account: e.target.value })
                  }
                  placeholder={
                    i === 0
                      ? 'Expenses:Subscriptions:Netflix'
                      : 'Assets:Checking'
                  }
                />
              </div>
              <div className="flex items-end gap-2 sm:contents">
                <div className="w-32 space-y-1">
                  {i === 0 && (
                    <Label htmlFor={`recurring-amount-${i}`}>Amount</Label>
                  )}
                  <Input
                    id={`recurring-amount-${i}`}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={p.amount}
                    onChange={(e) =>
                      updatePosting(i, { amount: e.target.value })
                    }
                    placeholder="15.00"
                  />
                </div>
                <div className="w-24 space-y-1">
                  {i === 0 && (
                    <Label htmlFor={`recurring-currency-${i}`}>Currency</Label>
                  )}
                  <Input
                    id={`recurring-currency-${i}`}
                    value={p.currency}
                    onChange={(e) =>
                      updatePosting(i, { currency: e.target.value })
                    }
                    placeholder={baseCurrency}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove posting"
                  onClick={() => removePosting(i)}
                  disabled={postings.length === 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPosting}
          >
            Add posting
          </Button>
          <p className="text-muted-foreground text-xs">
            Leave one amount blank to auto-balance, just like a normal
            transaction.
          </p>
        </div>

        {state?.formError && (
          <p className="text-destructive text-sm">{state.formError}</p>
        )}
        {state?.fieldErrors &&
          Object.entries(state.fieldErrors).map(([field, message]) => (
            <p key={field} className="text-destructive text-sm">
              {field}: {message}
            </p>
          ))}
        {state?.ok && (
          <p className="text-sm text-green-600">Recurring saved.</p>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save recurring transaction'}
        </Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Your recurring transactions</h2>
        {deleteError && (
          <p className="text-destructive text-sm">{deleteError}</p>
        )}
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing recurring yet. Add your rent, salary, and subscriptions to
            unlock upcoming bills on the dashboard.
          </p>
        ) : (
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 whitespace-nowrap">Repeats</th>
                  <th>Note</th>
                  <th>Postings</th>
                  <th className="whitespace-nowrap">Next due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.uid ?? `nouid:${i}`} className="border-t">
                    <td className="py-1 whitespace-nowrap">{row.period}</td>
                    <td>{row.note ?? ''}</td>
                    <td>
                      {row.postings
                        .map((p) =>
                          p.amount
                            ? `${p.account} ${p.currency} ${p.amount}`
                            : p.account
                        )
                        .join(' → ')}
                    </td>
                    <td className="whitespace-nowrap">
                      {row.unsupported ? (
                        <span className="text-muted-foreground text-xs">
                          unsupported schedule
                        </span>
                      ) : (
                        (row.nextDue ?? '')
                      )}
                    </td>
                    <td className="text-right">
                      {row.uid ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete recurring ${row.period}`}
                          disabled={isDeleting && deletingUid === row.uid}
                          onClick={() =>
                            handleDelete(row.uid!, row.fingerprint)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          no uid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>
    </div>
  );
};

export default RecurringView;
