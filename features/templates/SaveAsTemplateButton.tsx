'use client';

import { BookmarkPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveTemplateAction } from './actions';
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
import type { TemplateDraft } from '@/lib/templates/schema';
import { useRouter } from 'next/navigation';

type Props = {
  draft: TemplateDraft;
  disabled?: boolean;
};

const SaveAsTemplateButton = ({ draft, disabled = false }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(draft.payee);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setOpen(false);
    setName(draft.payee);
    setConflict(false);
    setError(null);
  };

  const submit = (overwrite: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction({ name, draft }, { overwrite });
      if (result.ok) {
        toast.success('Template saved', {
          action: {
            label: 'View',
            onClick: () => router.push('/templates'),
          },
        });
        reset();
      } else if (result.reason === 'name-conflict' && !overwrite) {
        setConflict(true);
      } else {
        setError(result.message ?? 'Could not save');
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <BookmarkPlus className="h-4 w-4" />
        Save as template
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              Payee — {draft.payee}, {draft.postings.length} postings
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (conflict) setConflict(false);
                }}
                disabled={isPending}
              />
            </div>
            {conflict && (
              <Alert variant="destructive">
                <AlertDescription>
                  A template named &quot;{name}&quot; already exists.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
            {conflict ? (
              <Button
                variant="destructive"
                onClick={() => submit(true)}
                disabled={isPending}
              >
                Overwrite
              </Button>
            ) : (
              <Button
                onClick={() => submit(false)}
                disabled={isPending || !name.trim()}
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SaveAsTemplateButton;
