'use client';

import { useSyncExternalStore, useTransition } from 'react';
import { toast } from 'sonner';
import { revokeDebtShareAction } from './actions/revokeDebtShare';
import { copyShareLink } from './lib/copyShareLink';
import { formatUpdated } from './lib/formatUpdated';
import type { SharedLink } from './lib/toSharedLink';
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
import { useRouter } from 'next/navigation';

type Props = { person: string; link: SharedLink };

const noopSubscribe = () => () => {};

/** Copy or revoke a person's existing share link. */
const SharedLinkControls = ({ person, link }: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Formatted in the browser only: the server's time zone would differ, so
  // server render and hydration show the ISO date.
  const updatedText = useSyncExternalStore(
    noopSubscribe,
    () => formatUpdated(link.updatedAt),
    () => link.updatedAt.slice(0, 10)
  );

  const revoke = () =>
    startTransition(async () => {
      const result = await revokeDebtShareAction(link.shareId);
      if (result.ok) toast.success('Link revoked. It no longer works.');
      else toast.error(result.error);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        Shared · updated {updatedText}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => copyShareLink(link.shareId, link.key)}
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
              {person} will see “This link is no longer active”. The link can’t
              be brought back; sharing again makes a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SharedLinkControls;
