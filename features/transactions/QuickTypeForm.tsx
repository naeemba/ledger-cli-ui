'use client';

import { useEffect, useState, useTransition } from 'react';
import type { TransactionActionState } from './actions';
import type { DraftState } from './entry/draftReducer';
import { Field } from './entry/typeForms/fields';
import type { HeaderFields } from './entry/types/adapter';
import type { QuickEntrySpec } from './quickEntrySpecs';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type QuickTypeFormProps = {
  spec: QuickEntrySpec<HeaderFields>;
  // Replaces the spec's icon and label in the header (duplicate uses it).
  title?: string;
  accounts: string[];
  defaultCurrency: string;
  // Edit seeds from detectType; create leaves it undefined and uses makeEmpty.
  initialFields?: HeaderFields;
  onSave: (draft: DraftState) => Promise<TransactionActionState>;
  // Edit only: hands the compiled draft to the Raw fallback.
  onSwitchToRaw?: (draft: DraftState, dirty: boolean) => void;
  onDone: () => void;
  // Told whenever the fields start or stop differing from how they opened, so
  // the dialog can ask before an accidental dismiss throws the entry away.
  onDirtyChange?: (dirty: boolean) => void;
};

const firstFieldError = (state: TransactionActionState): string | undefined =>
  state.fieldErrors ? Object.values(state.fieldErrors)[0] : undefined;

/**
 * One simplified entry type's form. Owns field state and compiles via the spec's
 * adapter, then hands the draft to the injected `onSave` — so ledger stays the
 * authority on whether the entry balances, whether it is a create or an edit.
 */
export function QuickTypeForm({
  spec,
  title,
  accounts,
  defaultCurrency,
  initialFields,
  onSave,
  onSwitchToRaw,
  onDone,
  onDirtyChange,
}: QuickTypeFormProps) {
  const [initial] = useState<HeaderFields>(
    () => initialFields ?? spec.makeEmpty({ accounts, defaultCurrency })
  );
  const [fields, setFields] = useState<HeaderFields>(initial);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const update = (patch: Partial<HeaderFields>) =>
    setFields((previous) => ({ ...previous, ...patch }));

  const compile = (): DraftState => {
    const payee =
      fields.payee.trim() || spec.resolvePayee?.(fields) || spec.label;
    return spec.compile({ ...fields, payee }, { defaultCurrency });
  };

  const save = () => {
    const invalid = spec.validate(fields);
    if (invalid) return setError(invalid);
    startTransition(async () => {
      const result = await onSave(compile());
      if (result.ok) onDone();
      else
        setError(
          result.formError ?? firstFieldError(result) ?? 'Could not save.'
        );
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title ?? `${spec.icon} ${spec.label}`}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <spec.Fields
          fields={fields}
          update={update}
          accounts={accounts}
          defaultCurrency={defaultCurrency}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input
              type="date"
              value={fields.date}
              onChange={(event) => update({ date: event.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-entry-payee">
              Description{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="quick-entry-payee"
              value={fields.payee}
              onChange={(event) => update({ payee: event.target.value })}
              placeholder="What was it for?"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter showCloseButton>
        {onSwitchToRaw && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={() => onSwitchToRaw(compile(), dirty)}
          >
            Edit as raw
          </Button>
        )}
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
