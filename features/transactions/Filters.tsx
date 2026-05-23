'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import Combobox from '@/components/Combobox';
import DateFilter from '@/components/DateFilter';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Props = {
  payees: string[];
  accounts: string[];
  start?: string;
  end?: string;
};

const Filters = ({ payees, accounts, start, end }: Props) => {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [account, setAccount] = useState(params.get('account') ?? '');
  const [payee, setPayee] = useState(params.get('payee') ?? '');

  const apply = (next: Partial<Record<'q' | 'account' | 'payee', string>>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    router.push('/transactions?' + u.toString());
  };

  const dateUrlPattern = (() => {
    const u = new URLSearchParams(params.toString());
    u.delete('start');
    u.delete('end');
    u.set('start', '{from}');
    u.set('end', '{to}');
    return '/transactions?' + u.toString();
  })();

  const hasFilters = q || account || payee || start || end;

  // The export endpoint reuses the same filter params, so the user downloads
  // whatever subset the table is currently showing.
  const exportHref = (() => {
    const u = new URLSearchParams(params.toString());
    return (
      '/api/transactions/export' + (u.toString() ? '?' + u.toString() : '')
    );
  })();

  return (
    <div className="flex flex-col gap-4">
      <DateFilter urlPattern={dateUrlPattern} from={start} to={end} />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Account</label>
          <Combobox
            value={account}
            onChange={(v) => {
              setAccount(v);
              apply({ account: v });
            }}
            options={accounts}
            placeholder="Any account"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Payee</label>
          <Combobox
            value={payee}
            onChange={(v) => {
              setPayee(v);
              apply({ payee: v });
            }}
            options={payees}
            placeholder="Any payee"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => apply({ q })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply({ q });
            }}
            placeholder="payee, note, account…"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ('');
              setAccount('');
              setPayee('');
              router.push('/transactions');
            }}
          >
            Clear
          </Button>
        )}
        <Link
          href={exportHref}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'default' })
          )}
          // download is a same-origin hint; the server also sets
          // Content-Disposition: attachment so most browsers honor it.
          download
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Link>
      </div>
    </div>
  );
};

export default Filters;
