'use client';

import { MoreHorizontal, Pencil, Trash2, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteTransactionAction } from './actions';
import { type TransactionRow } from './transactionRow';
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
import { Txn } from '@/lib/transactions/model';
import { useRouter } from 'next/navigation';

type Props = { transaction: TransactionRow };

const RowActions = ({ transaction: t }: Props) => {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);

  const onDelete = async () => {
    const res = await deleteTransactionAction(t.uid!, t.fingerprint);
    if (res.ok) toast.success('Transaction deleted');
    else toast.error(res.message);
    router.refresh();
  };

  const templateDraft = new Txn(
    t.date,
    t.payee,
    t.status,
    t.note ?? '',
    t.postings,
    t.uid ?? undefined
  ).toTemplate();

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
        draft={templateDraft}
      />
    </>
  );
};

export default RowActions;
