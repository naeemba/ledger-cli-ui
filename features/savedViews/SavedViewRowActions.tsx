'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteSavedViewAction } from './actions/deleteSavedView';
import { renameSavedViewAction } from './actions/renameSavedView';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

type Props = {
  viewId: string;
  currentName: string;
};

const SavedViewRowActions = ({ viewId, currentName }: Props) => {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onRename = () => {
    setError(null);
    startTransition(async () => {
      const result = await renameSavedViewAction(viewId, name);
      if (result.ok) {
        toast.success('View renamed');
        setRenameOpen(false);
        router.refresh();
        return;
      }
      setError(result.message ?? 'Could not rename');
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      await deleteSavedViewAction(viewId);
      toast.success('View deleted');
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open view actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setName(currentName);
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <ConfirmDialog
            title="Delete saved view?"
            description={`"${currentName}" will be removed. This cannot be undone.`}
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={onDelete}
          >
            <DropdownMenuItem variant="destructive" closeOnClick={false}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </ConfirmDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename saved view</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="saved-view-rename">Name</Label>
            <Input
              id="saved-view-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={isPending}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRenameOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onRename}
              disabled={isPending || !name.trim() || name === currentName}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SavedViewRowActions;
