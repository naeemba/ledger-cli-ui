'use client';

import { MoreHorizontal, Pencil, Trash2, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteTransactionByUid } from './actions';
import { openEditTransaction } from './editTransactionStore';
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
import type { TemplateDraft } from '@/lib/templates/schema';
import { useRouter } from 'next/navigation';

type Props = { uid: string; templateDraft?: TemplateDraft };

const RowActions = ({ uid, templateDraft }: Props) => {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);

  const onDelete = async () => {
    const res = await deleteTransactionByUid(uid);
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
          <DropdownMenuItem onClick={() => openEditTransaction(uid)}>
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {templateDraft && (
            <DropdownMenuItem onClick={() => setSaveOpen(true)}>
              <BookmarkPlus className="h-4 w-4" />
              Save as template
            </DropdownMenuItem>
          )}
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
      {templateDraft && (
        <SaveAsTemplateDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          draft={templateDraft}
        />
      )}
    </>
  );
};

export default RowActions;
