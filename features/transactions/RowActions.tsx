'use client';

import { MoreHorizontal, Pencil, Trash2, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteTransactionAction } from './actions';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SaveAsTemplateDialog } from '@/features/templates/SaveAsTemplateButton';
import type { Transaction } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';
import { useRouter } from 'next/navigation';

type Props = { transaction: Transaction };

const toTemplateDraft = (t: Transaction): TemplateDraft => ({
  payee: t.payee,
  status: t.status,
  note: t.note ?? undefined,
  postings: t.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
  })),
});

const RowActions = ({ transaction: t }: Props) => {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);

  const onDelete = async () => {
    const res = await deleteTransactionAction(t.uid!, t.fingerprint);
    if (res.ok) toast.success('Transaction deleted');
    else toast.error(res.message);
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/transactions/${t.uid}/edit`)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="h-4 w-4" />
            Save as template
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            title="Delete transaction?"
            description="This will permanently remove the transaction from the journal."
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={onDelete}
          >
            <DropdownMenuItem variant="destructive" closeOnClick={false}>
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </ConfirmDialog>
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveAsTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        draft={toTemplateDraft(t)}
      />
    </>
  );
};

export default RowActions;
