'use client';

import { useMemo, useState } from 'react';
import { buildTree } from './Accounts.utils';
import Tree from './Tree';

type Props = {
  accounts: string[];
};

const AccountsView = ({ accounts }: Props) => {
  const [query, setQuery] = useState('');
  const tree = useMemo(() => {
    if (!query.trim()) return buildTree(accounts);
    const needle = query.toLowerCase();
    return buildTree(accounts.filter((a) => a.toLowerCase().includes(needle)));
  }, [accounts, query]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="Search accounts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <Tree tree={tree} />
      </div>
    </div>
  );
};

export default AccountsView;
