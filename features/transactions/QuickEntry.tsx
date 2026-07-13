'use client';

import { ChevronDownIcon, PlusIcon, RepeatIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { createTransactionAction } from './actions';
import { serializeDraftJson } from './entry/draftReducer';
import { Field } from './entry/typeForms/fields';
import type { HeaderFields } from './entry/types/adapter';
import {
  QUICK_ENTRY_SPECS,
  todayLocal,
  type QuickEntrySpec,
} from './quickEntrySpecs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Template } from '@/db/schema/template';
import { Transaction } from '@/lib/transactions/model';
import { useRouter } from 'next/navigation';

type Props = {
  accounts: string[];
  defaultCurrency: string;
  templates?: Template[];
};

/**
 * The dialog body for one entry type. Owns the field state and the save path
 * (compile via the spec's adapter → same server action as the full entry form),
 * so ledger stays the authority on whether the entry balances and is valid.
 */
function QuickEntryContent({
  spec,
  accounts,
  defaultCurrency,
  onDone,
}: Props & { spec: QuickEntrySpec<HeaderFields>; onDone: () => void }) {
  const router = useRouter();
  const [fields, setFields] = useState<HeaderFields>(() =>
    spec.makeEmpty({ accounts, defaultCurrency })
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const update = (patch: Partial<HeaderFields>) =>
    setFields((f) => ({ ...f, ...patch }));

  const save = () => {
    const invalid = spec.validate(fields);
    if (invalid) return setError(invalid);
    startTransition(async () => {
      const payee =
        fields.payee.trim() || spec.resolvePayee?.(fields) || spec.label;
      const draft = spec.compile({ ...fields, payee }, { defaultCurrency });
      const formData = new FormData();
      formData.set('draft', serializeDraftJson(draft, 'create'));
      const result = await createTransactionAction(null, formData);
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        const fieldError = result.fieldErrors
          ? Object.values(result.fieldErrors).flat()[0]
          : undefined;
        setError(result.formError ?? fieldError ?? 'Could not save.');
      }
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {spec.icon} {spec.label}
        </DialogTitle>
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
              onChange={(e) => update({ date: e.target.value })}
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
              onChange={(e) => update({ payee: e.target.value })}
              placeholder="What was it for?"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter showCloseButton>
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * One-click repeat of a saved template with today's date — so a daily recurring
 * entry isn't retyped. Reuses the same compile → create action path as the type
 * forms (via Transaction.fromTemplate), so ledger validates the posted result.
 */
function RepeatTemplate({
  templates,
  defaultCurrency,
  onDone,
}: {
  templates: Template[];
  defaultCurrency: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const repeat = (template: Template) =>
    startTransition(async () => {
      const draft = Transaction.fromTemplate(
        template.draft,
        defaultCurrency
      ).withField('date', todayLocal());
      const formData = new FormData();
      formData.set('draft', serializeDraftJson(draft, 'create'));
      const result = await createTransactionAction(null, formData);
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        const fieldError = result.fieldErrors
          ? Object.values(result.fieldErrors).flat()[0]
          : undefined;
        setError(result.formError ?? fieldError ?? 'Could not save.');
      }
    });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Repeat a template</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {templates.map((template) => (
          <Button
            key={template.id}
            variant="outline"
            disabled={pending}
            className="h-auto justify-between py-2 text-left"
            onClick={() => repeat(template)}
          >
            <span className="font-medium">{template.name}</span>
            <span className="text-muted-foreground">
              {template.draft.payee}
            </span>
          </Button>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </DialogContent>
  );
}

/**
 * Split button in the app header: the primary click logs an expense; the caret
 * opens a menu for the other entry types. Mounted globally so it's reachable
 * from every page.
 */
export default function QuickEntry({
  accounts,
  defaultCurrency,
  templates = [],
}: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [primary, ...rest] = QUICK_ENTRY_SPECS;
  const spec = QUICK_ENTRY_SPECS.find((s) => s.kind === active) ?? null;

  return (
    <>
      <div className="inline-flex">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-r-none"
          onClick={() => setActive(primary.kind)}
        >
          <PlusIcon />
          <span className="hidden sm:inline">{primary.label}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-l-none border-l-0 px-1.5"
                aria-label="More entry types"
              >
                <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {rest.map((s) => (
              <DropdownMenuItem key={s.kind} onClick={() => setActive(s.kind)}>
                <span className="mr-1">{s.icon}</span>
                {s.label}
              </DropdownMenuItem>
            ))}
            {templates.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                  <RepeatIcon />
                  Repeat a template
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={spec !== null}
        onOpenChange={(next) => {
          if (!next) setActive(null);
        }}
      >
        {spec && (
          <QuickEntryContent
            key={spec.kind}
            spec={spec}
            accounts={accounts}
            defaultCurrency={defaultCurrency}
            onDone={() => setActive(null)}
          />
        )}
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        {templateOpen && (
          <RepeatTemplate
            templates={templates}
            defaultCurrency={defaultCurrency}
            onDone={() => setTemplateOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}
