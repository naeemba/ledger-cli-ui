'use client';

import { useState, useTransition } from 'react';
import SharedLinkControls, { type SharedLink } from './SharedLinkControls';
import { createDebtShareAction } from './actions/createDebtShare';
import { copyShareLink } from './lib/copyShareLink';
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
  link: SharedLink | null;
  defaultOwnerName: string;
};

/** Share, copy, or revoke the read-only link to this person's debts. */
const ShareControls = ({ person, link, defaultOwnerName }: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [error, setError] = useState<string | null>(null);

  const share = () =>
    startTransition(async () => {
      const result = await createDebtShareAction(person, ownerName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      await copyShareLink(result.shareId, result.key);
    });

  if (link) return <SharedLinkControls person={person} link={link} />;

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
