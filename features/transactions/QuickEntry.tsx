'use client';

import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { QuickTypeForm } from './QuickTypeForm';
import { createTransactionAction } from './actions';
import { serializeDraftJson } from './entry/draftReducer';
import { QUICK_ENTRY_SPECS } from './quickEntrySpecs';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

type Props = { accounts: string[]; defaultCurrency: string };

/**
 * Split button in the app header: the primary click logs an expense; the caret
 * opens a menu for the other entry types. Mounted globally so it's reachable
 * from every page.
 */
export default function QuickEntry({ accounts, defaultCurrency }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [primary, ...rest] = QUICK_ENTRY_SPECS;
  const spec = QUICK_ENTRY_SPECS.find((entry) => entry.kind === active) ?? null;

  const onSave = async (draft: Parameters<typeof serializeDraftJson>[0]) => {
    const formData = new FormData();
    formData.set('draft', serializeDraftJson(draft, 'create'));
    const result = await createTransactionAction(null, formData);
    if (result.ok) router.refresh();
    return result;
  };

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
          <QuickTypeForm
            key={spec.kind}
            spec={spec}
            accounts={accounts}
            defaultCurrency={defaultCurrency}
            onSave={onSave}
            onDone={() => setActive(null)}
          />
        )}
      </Dialog>
    </>
  );
}
