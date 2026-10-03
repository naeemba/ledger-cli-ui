'use client';

import { useEffect, useState } from 'react';
import { openSharedPage } from './lib/openSharedPage';
import { TableScroll } from '@/components/ui/table';
import type { SharedDebtPage } from '@/lib/debt-share/payload';

type Props = { shareId: string; sealedPage: string | null };

type ViewState =
  | { status: 'opening' }
  | { status: 'closed' }
  | { status: 'open'; page: SharedDebtPage };

const formatUpdated = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/**
 * The page a person sees through a shared debt link. The key never leaves the
 * browser: it is read from the fragment and used to decrypt the sealed page
 * the server embedded. Anything that fails to open shows one neutral screen,
 * so a revoked link and a wrong key look the same.
 */
const SharedDebtView = ({ shareId, sealedPage }: Props) => {
  const [state, setState] = useState<ViewState>({ status: 'opening' });

  useEffect(() => {
    const key = window.location.hash.slice(1);
    const opened =
      sealedPage && key
        ? openSharedPage(shareId, sealedPage, key)
        : Promise.resolve(null);
    opened.then((page) =>
      setState(page ? { status: 'open', page } : { status: 'closed' })
    );
  }, [shareId, sealedPage]);

  if (state.status === 'opening') {
    return <main className="mx-auto max-w-2xl px-4 py-16" aria-busy="true" />;
  }
  if (state.status === 'closed') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the person who sent it for a new one.
        </p>
      </main>
    );
  }

  const { page } = state;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Between you and {page.ownerName}
        </div>
        {page.net.length === 0 ? (
          <h1 className="mt-1 text-2xl font-semibold">All settled</h1>
        ) : (
          page.net.map((net) => (
            <h1
              key={net.amount}
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                net.direction === 'viewer-owes'
                  ? 'text-negative'
                  : 'text-positive'
              }`}
            >
              {net.direction === 'viewer-owes'
                ? `You owe ${page.ownerName} ${net.amount}`
                : `${page.ownerName} owes you ${net.amount}`}
            </h1>
          ))
        )}
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <TableScroll bleed={false}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, index) => (
                <tr key={`${row.date}-${index}`}>
                  <td className="whitespace-nowrap">{row.date}</td>
                  <td>{row.payee}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {row.amount}
                  </td>
                  <td className="whitespace-pre-line text-right tabular-nums">
                    {row.balance.join('\n')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      <p className="text-xs text-muted-foreground">
        Negative amounts are what you owe. Updated{' '}
        {formatUpdated(page.generatedAt)}.
      </p>
    </main>
  );
};

export default SharedDebtView;
