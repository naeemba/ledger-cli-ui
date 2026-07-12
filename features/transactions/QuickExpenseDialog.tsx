'use client';

import { PlusIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import AmountInput from './AmountInput';
import { createTransactionAction } from './actions';
import { serializeDraftJson } from './entry/draftReducer';
import {
  AccountField,
  CurrencyCombobox,
  Field,
  optionsForRoles,
} from './entry/typeForms/fields';
import { expenseAdapter, type ExpenseFields } from './entry/types/expense';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

// Today in the browser's local timezone (YYYY-MM-DD) — avoids the server/client
// midnight skew the full entry form works around with a '' fallback.
const todayLocal = () => new Date().toLocaleDateString('en-CA');

const leafOf = (account: string) => account.split(':').pop()?.trim() ?? '';

type Props = { accounts: string[]; defaultCurrency: string };

/**
 * A deliberately minimal "log an expense" dialog for everyday use, mounted in
 * the app header so it opens on top of any page. It reuses the expense adapter
 * to compile a balanced draft and the same server action as the full entry
 * form — ledger remains the authority on whether the entry is valid.
 */
export default function QuickExpenseDialog({
  accounts,
  defaultCurrency,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const defaultPaidFrom =
    optionsForRoles(accounts, ['asset', 'liability'])[0] ?? '';

  const empty = (): ExpenseFields => ({
    ...expenseAdapter.emptyFields({ defaultCurrency }),
    date: todayLocal(),
    paidFrom: defaultPaidFrom,
  });
  const [fields, setFields] = useState<ExpenseFields>(empty);
  const update = (patch: Partial<ExpenseFields>) =>
    setFields((f) => ({ ...f, ...patch }));

  const reset = () => {
    setFields(empty());
    setError(undefined);
  };

  const save = () => {
    if (!(Number(fields.amount) > 0)) return setError('Enter an amount.');
    if (!fields.spentOn.trim()) return setError('Pick a category.');
    if (!fields.paidFrom.trim())
      return setError('Pick where it was paid from.');
    startTransition(async () => {
      // Payee is required by the journal; fall back to the category leaf so a
      // user can save with just amount + category.
      const payee = fields.payee.trim() || leafOf(fields.spentOn) || 'Expense';
      const draft = expenseAdapter.compile(
        { ...fields, payee },
        { defaultCurrency }
      );
      const formData = new FormData();
      formData.set('draft', serializeDraftJson(draft, 'create'));
      const result = await createTransactionAction(null, formData);
      if (result.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        const fieldError = result.fieldErrors
          ? Object.values(result.fieldErrors).flat()[0]
          : undefined;
        setError(
          result.formError ?? fieldError ?? 'Could not save the expense.'
        );
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="h-8">
            <PlusIcon />
            <span className="hidden sm:inline">Expense</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Amount">
            <div className="flex gap-2">
              <AmountInput
                autoFocus
                value={fields.amount}
                onChange={(amount) => update({ amount })}
                placeholder="0.00"
                className="flex-1 text-right tabular-nums"
              />
              <CurrencyCombobox
                value={fields.currency}
                onChange={(currency) => update({ currency })}
                className="w-24"
              />
            </div>
          </Field>

          <AccountField
            label="Category"
            role="expense"
            accounts={accounts}
            value={fields.spentOn}
            onChange={(spentOn) => update({ spentOn })}
          />

          <AccountField
            label="Paid from"
            role={['asset', 'liability']}
            accounts={accounts}
            value={fields.paidFrom}
            onChange={(paidFrom) => update({ paidFrom })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={fields.date}
                onChange={(e) => update({ date: e.target.value })}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-expense-payee">
                For <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="quick-expense-payee"
                value={fields.payee}
                onChange={(e) => update({ payee: e.target.value })}
                placeholder="e.g. Groceries"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
