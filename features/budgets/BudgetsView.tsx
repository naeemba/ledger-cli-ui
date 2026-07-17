'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { createBudgetAction } from './actions/createBudget';
import { deleteBudgetAction } from './actions/deleteBudget';
import type { BudgetActionState } from './actions/types';
import type { BudgetReport } from './report';
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

export type BudgetLineView = {
  uid?: string;
  fingerprint: string;
  postings: PostingRow[];
};

type Props = {
  report: BudgetReport;
  lines: BudgetLineView[];
  baseCurrency: string;
};

const emptyPosting = (currency: string): PostingRow => ({
  id: crypto.randomUUID(),
  account: '',
  amount: '',
  currency,
});

const barColor = (usedRatio: number | null): string => {
  if (usedRatio === null) return 'bg-muted-foreground/40';
  if (usedRatio > 1) return 'bg-destructive';
  if (usedRatio > 0.85) return 'bg-amber-500';
  return 'bg-primary';
};

const BudgetsView = ({ report, lines, baseCurrency }: Props) => {
  const [state, formAction, isPending] = useActionState<
    BudgetActionState | null,
    FormData
  >(createBudgetAction, null);

  const [unit, setUnit] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [count, setCount] = useState('1');
  const [anchor, setAnchor] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState('');
  const [postings, setPostings] = useState<PostingRow[]>([
    emptyPosting(baseCurrency),
    {
      id: crypto.randomUUID(),
      account: 'Assets:Checking',
      amount: '',
      currency: '',
    },
  ]);

  const [isDeleting, startDelete] = useTransition();
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (uid: string, fingerprint: string) => {
    setDeleteError(null);
    setDeletingUid(uid);
    startDelete(async () => {
      const result = await deleteBudgetAction(uid, fingerprint);
      setDeletingUid(null);
      if (!result.ok) setDeleteError(result.message);
    });
  };

  const updatePosting = (i: number, patch: Partial<PostingRow>) =>
    setPostings((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

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

  const linesByAccount = new Map(
    lines.map((line) => [line.postings[0]?.account, line])
  );
  const yearToDateByAccount = new Map(
    report.yearToDate.map((row) => [row.account, row])
  );

  const form = (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="draft" value={draft} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="budget-count">Repeats</Label>
          <div className="flex gap-2">
            <Input
              id="budget-count"
              type="number"
              min={1}
              max={366}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-20"
              required
            />
            <select
              id="budget-unit"
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
              id="budget-anchor"
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              required
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Non-monthly schedules bucket on calendar boundaries — e.g. a
            biweekly budget still measures against &quot;this month&quot; and
            &quot;year to date&quot;, not a rolling window.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="budget-note">Note (optional)</Label>
          <Input
            id="budget-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Groceries allowance"
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
                <Label htmlFor={`budget-account-${i}`}>Account</Label>
              )}
              <Input
                id={`budget-account-${i}`}
                value={p.account}
                onChange={(e) => updatePosting(i, { account: e.target.value })}
                placeholder={i === 0 ? 'Expenses:Groceries' : 'Assets:Checking'}
              />
            </div>
            <div className="flex items-end gap-2 sm:contents">
              <div className="w-32 space-y-1">
                {i === 0 && (
                  <Label htmlFor={`budget-amount-${i}`}>Amount</Label>
                )}
                <Input
                  id={`budget-amount-${i}`}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={p.amount}
                  onChange={(e) => updatePosting(i, { amount: e.target.value })}
                  placeholder="500.00"
                />
              </div>
              <div className="w-24 space-y-1">
                {i === 0 && (
                  <Label htmlFor={`budget-currency-${i}`}>Currency</Label>
                )}
                <Input
                  id={`budget-currency-${i}`}
                  value={p.currency}
                  onChange={(e) =>
                    updatePosting(i, { currency: e.target.value })
                  }
                  placeholder={baseCurrency}
                />
              </div>
            </div>
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          Leave the second amount blank to auto-balance, just like a normal
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
      {state?.ok && <p className="text-sm text-green-600">Budget saved.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save budget'}
      </Button>
    </form>
  );

  if (report.month.length === 0) {
    return (
      <div className="space-y-8">
        <p className="text-muted-foreground text-sm">
          No budgets yet. Set an allowance per account and this page will
          compare it against actual spending from ledger.
        </p>
        {form}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {form}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">This month</h2>
        {deleteError && (
          <p className="text-destructive text-sm">{deleteError}</p>
        )}
        <TableScroll>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1">Account</th>
                <th>Progress</th>
                <th>Actual</th>
                <th>Budgeted</th>
                <th>Difference</th>
                <th className="whitespace-nowrap">YTD difference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {report.month.map((row) => {
                const line = linesByAccount.get(row.account);
                const ytd = yearToDateByAccount.get(row.account);
                const widthPercent =
                  row.usedRatio === null
                    ? 0
                    : Math.min(100, row.usedRatio * 100);
                return (
                  <tr key={row.account} className="border-t">
                    <td className="py-1">{row.account}</td>
                    <td className="w-32">
                      <div className="bg-muted h-2 w-32 overflow-hidden rounded-full">
                        <div
                          className={`h-2 rounded-full ${barColor(row.usedRatio)}`}
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </td>
                    <td>{row.actual}</td>
                    <td>{row.budgeted}</td>
                    <td>{row.difference}</td>
                    <td>{ytd?.difference ?? ''}</td>
                    <td className="text-right">
                      {line?.uid ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete budget ${row.account}`}
                          disabled={isDeleting && deletingUid === line.uid}
                          onClick={() =>
                            handleDelete(line.uid!, line.fingerprint)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          from your bills
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {report.unbudgeted.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Not budgeted</h2>
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1">Account</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.unbudgeted.map((row) => (
                  <tr key={row.account} className="border-t">
                    <td className="py-1">{row.account}</td>
                    <td>{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}
    </div>
  );
};

export default BudgetsView;
