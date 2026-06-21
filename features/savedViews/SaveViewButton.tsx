'use client';

import { Bookmark } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveSavedViewAction } from './actions/saveSavedView';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

type Props = {
  targetPath: string;
  existingNames: string[];
};

const SaveViewButton = ({ targetPath, existingNames }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = (opts: { overwrite?: boolean } = {}) => {
    setError(null);
    startTransition(async () => {
      const result = await saveSavedViewAction(
        { name: name.trim(), targetPath },
        opts
      );
      if (result.ok) {
        toast.success(`Saved view "${name.trim()}"`);
        setOpen(false);
        setName('');
        setConflict(false);
        router.refresh();
        return;
      }
      if (result.reason === 'name-conflict') {
        setConflict(true);
        setError(result.message ?? 'That name is already in use.');
        return;
      }
      setError(result.message ?? 'Could not save view.');
    });
  };

  const localConflict = !conflict && existingNames.includes(name.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setName('');
          setError(null);
          setConflict(false);
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Bookmark className="size-4" aria-hidden />
        Save view
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="saved-view-name">Name</Label>
            <Input
              id="saved-view-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (conflict) setConflict(false);
              }}
              maxLength={80}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground break-all">
              {targetPath}
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center gap-3">
                <span>{error}</span>
                {conflict && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => submit({ overwrite: true })}
                    disabled={isPending}
                  >
                    Replace
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {localConflict && !error && (
            <Alert variant="destructive">
              <AlertDescription>
                A view named &quot;{name.trim()}&quot; already exists. Saving
                will require Replace.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => submit()}
            disabled={isPending || !name.trim()}
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveViewButton;
