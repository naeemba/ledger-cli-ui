// features/accounts/AccountsView.tsx
'use client';

import { useMemo, useState } from 'react';
import AccountTreeView from './AccountTreeView';
import BucketSection from './BucketSection';
import { bucketRoots, buildAccountTree, countLeaves } from './accountTree';
import type { BalanceRow } from '@/lib/balance/parse';

type Props = {
  rows: BalanceRow[];
};

const AccountsView = ({ rows }: Props) => {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const buckets = useMemo(() => {
    const filtered = trimmed
      ? rows.filter((r) => r.account.toLowerCase().includes(trimmed))
      : rows;
    return bucketRoots(buildAccountTree(filtered));
  }, [rows, trimmed]);

  const searching = trimmed.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="Search accounts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {buckets.map((bucket) => (
        <BucketSection
          key={bucket.key}
          title={bucket.title}
          count={countLeaves(bucket.roots)}
          defaultOpen={bucket.key !== 'advanced'}
          forceOpen={searching}
        >
          <AccountTreeView nodes={bucket.roots} forceOpen={searching} />
        </BucketSection>
      ))}
    </div>
  );
};

export default AccountsView;
