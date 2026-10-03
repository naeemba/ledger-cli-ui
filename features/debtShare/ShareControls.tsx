'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { toast } from 'sonner';
import { createDebtShareAction } from './actions/createDebtShare';
import { revokeDebtShareAction } from './actions/revokeDebtShare';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

type Props = {
  person: string;
  link: { shareId: string; key: string; updatedAt: string } | null;
  defaultOwnerName: string;
};

const linkUrl = (shareId: string, key: string): string =>
  `${window.location.origin}/s/${shareId}#${key}`;

const copyLink = async (shareId: string, key: string) => {
  try {
    await navigator.clipboard.writeText(linkUrl(shareId, key));
    toast.success('Link copied.');
  } catch {
    // Safari refuses a copy that follows a server round trip.
    toast.error('Could not copy. Use Copy link.');
  }
};

const formatUpdated = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const noopSubscribe = () => () => {};

/** Share, copy, or revoke the read-only link to this person's debts. */
const ShareControls = ({ person, link, defaultOwnerName }: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [error, setError] = useState<string | null>(null);
  // Formatted in the browser only: the server's time zone would differ, so
  // server render and hydration show the ISO date.
  const updatedAt = link?.updatedAt ?? '';
  const updatedText = useSyncExternalStore(
    noopSubscribe,
    () => (updatedAt ? formatUpdated(updatedAt) : ''),
    () => updatedAt.slice(0, 10)
  );

  const share = () =>
    startTransition(async () => {
      const result = await createDebtShareAction(person, ownerName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      await copyLink(result.shareId, result.key);
    });

  const revoke = (shareId: string) =>
    startTransition(async () => {
      const result = await revokeDebtShareAction(shareId);
      if (result.ok) toast.success('Link revoked. It no longer works.');
      else toast.error(result.error ?? 'Could not revoke the link.');
      router.refresh();
    });

  if (link) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Shared · updated {updatedText}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => copyLink(link.shareId, link.key)}
        >
          Copy link
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button size="sm" variant="outline" disabled={pending} />}
          >
            Revoke
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
              <AlertDialogDescription>
                {person} will see “This link is no longer active”. The link
                can’t be brought back; sharing again makes a new one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => revoke(link.shareId)}>
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Share
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with {person}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {person} gets a read-only link showing your debts with each other:
          dates, descriptions and amounts. No other accounts, no notes. It
          updates whenever you save, until you revoke it.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="share-owner-name">Your name on the page</Label>
          <Input
            id="share-owner-name"
            value={ownerName}
            maxLength={60}
            onChange={(event) => {
              setOwnerName(event.target.value);
              setError(null);
            }}
          />
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={share} disabled={pending || !ownerName.trim()}>
            Create link and copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareControls;
