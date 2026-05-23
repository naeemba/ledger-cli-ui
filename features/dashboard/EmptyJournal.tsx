import { FileUp, PlusCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

/**
 * Rendered by the Dashboard when `ledger stats` reports zero postings —
 * either a brand-new account or a journal that's only a stub. Points the
 * user at the two ways to populate it.
 */
const EmptyJournal = () => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">No transactions yet</p>
    </div>
    <Card className="flex flex-col items-center gap-4 p-10 text-center">
      <div className="text-base font-medium">
        Your journal is empty. Let&apos;s fix that.
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        Add a single transaction by hand, or import a Ledger journal you already
        keep — a single <code>.ledger</code> file or a <code>.zip</code> with
        includes both work.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/transactions/new"
          className={cn(buttonVariants({ size: 'sm' }))}
        >
          <PlusCircle className="h-4 w-4" />
          Add transaction
        </Link>
        <Link
          href="/import"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <FileUp className="h-4 w-4" />
          Import journal
        </Link>
      </div>
    </Card>
  </div>
);

export default EmptyJournal;
