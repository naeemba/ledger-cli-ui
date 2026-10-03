'use client';

import { ChevronDownIcon, PlusIcon, RepeatIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { QuickTypeForm } from './QuickTypeForm';
import type { DraftState } from './entry/draftReducer';
import { QUICK_ENTRY_SPECS, todayLocal } from './quickEntrySpecs';
import { saveNewTransaction } from './saveNewTransaction';
import { useDiscardGuard } from './useDiscardGuard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import type { Template } from '@/db/schema/template';
import { Transaction } from '@/lib/transactions/model';
import { useRouter } from 'next/navigation';

type Props = {
  accounts: string[];
  defaultCurrency: string;
  templates?: Template[];
};

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
      const result = await saveNewTransaction(draft, template.name, () =>
        router.refresh()
      );
      if (result.ok) {
        onDone();
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
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const guard = useDiscardGuard(() => setActive(null));
  const [primary, ...rest] = QUICK_ENTRY_SPECS;
  const spec = QUICK_ENTRY_SPECS.find((entry) => entry.kind === active) ?? null;

  const onSave = (draft: DraftState) =>
    saveNewTransaction(draft, spec?.label ?? '', () => router.refresh());

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
            {rest.map((entry) => (
              <DropdownMenuItem
                key={entry.kind}
                onClick={() => setActive(entry.kind)}
              >
                <span className="mr-1">{entry.icon}</span>
                {entry.label}
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

      <Dialog open={spec !== null} onOpenChange={guard.onOpenChange}>
        {spec && (
          <QuickTypeForm
            key={spec.kind}
            spec={spec}
            accounts={accounts}
            defaultCurrency={defaultCurrency}
            onSave={onSave}
            onDone={guard.close}
            onDirtyChange={guard.setDirty}
          />
        )}
      </Dialog>

      {guard.confirmDialog}

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
