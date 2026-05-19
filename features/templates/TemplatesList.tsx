'use client';

import { MoreHorizontal, Bookmark } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import RenameDialog from './RenameDialog';
import { deleteTemplateAction } from './actions';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Template } from '@/db/schema/template';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Props = { templates: Template[] };

const relativeTime = (ts: Date) => {
  const diff = Date.now() - ts.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo. ago`;
  const years = Math.floor(days / 365);
  return `${years} yr. ago`;
};

const TemplatesList = ({ templates }: Props) => {
  const router = useRouter();
  const [renameTarget, setRenameTarget] = useState<Template | null>(null);

  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        <Bookmark className="mx-auto mb-2 h-6 w-6 opacity-50" />
        <div className="font-medium text-foreground">No templates yet</div>
        <p className="mt-1">
          Save reusable transaction shapes from the{' '}
          <Link
            href="/transactions/new"
            className={cn(buttonVariants({ variant: 'link', size: 'sm' }))}
          >
            Add transaction
          </Link>{' '}
          page or any existing row.
        </p>
      </div>
    );
  }

  const onDelete = async (t: Template) => {
    const res = await deleteTemplateAction(t.id);
    if (res.ok) {
      toast.success(`Deleted "${t.name}"`);
    } else {
      toast.error(res.message);
    }
    router.refresh();
  };

  return (
    <>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Payee</th>
            <th className="py-2">Accounts</th>
            <th className="py-2">Updated</th>
            <th className="w-8 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="py-2">
                <Link
                  href={`/transactions/new?template=${t.id}`}
                  className="font-medium hover:underline"
                >
                  {t.name}
                </Link>
              </td>
              <td className="py-2 text-muted-foreground">{t.draft.payee}</td>
              <td className="py-2 text-muted-foreground">
                {t.draft.postings
                  .slice(0, 2)
                  .map((p) => p.account)
                  .join(' → ')}
                {t.draft.postings.length > 2 ? ' …' : ''}
              </td>
              <td
                className="py-2 text-muted-foreground"
                title={t.updatedAt.toISOString()}
              >
                {relativeTime(t.updatedAt)}
              </td>
              <td className="py-2 text-right">
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
                      onClick={() =>
                        router.push(`/transactions/new?template=${t.id}`)
                      }
                    >
                      Use
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRenameTarget(t)}>
                      Rename
                    </DropdownMenuItem>
                    <ConfirmDialog
                      title="Delete template?"
                      description={
                        <>
                          Delete <strong>{t.name}</strong>? This won&apos;t
                          affect any transactions you&apos;ve already created
                          from it.
                        </>
                      }
                      confirmLabel="Delete"
                      variant="destructive"
                      onConfirm={() => onDelete(t)}
                    >
                      <DropdownMenuItem
                        variant="destructive"
                        closeOnClick={false}
                      >
                        Delete
                      </DropdownMenuItem>
                    </ConfirmDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {renameTarget && (
        <RenameDialog
          open
          onOpenChange={(open) => !open && setRenameTarget(null)}
          templateId={renameTarget.id}
          initialName={renameTarget.name}
        />
      )}
    </>
  );
};

export default TemplatesList;
