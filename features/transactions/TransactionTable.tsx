'use client';

import RowActions from './RowActions';
import { TableScroll } from '@/components/ui/table';
import type { Transaction } from '@/lib/journal/parser';
import formatAmount from '@/utils/formatAmount';
import Link from 'next/link';

type Props = { transactions: Transaction[] };

const statusBadge = (status: Transaction['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

const formatTxDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const accountsSummary = (t: Transaction) =>
  `${t.postings
    .slice(0, 2)
    .map((p) => p.account)
    .join(' → ')}${t.postings.length > 2 ? ' …' : ''}`;

const magnitudeByCurrency = (t: Transaction): Array<[string, number]> => {
  const sums = new Map<string, number>();
  for (const p of t.postings) {
    const v = Number(p.amount);
    if (!Number.isFinite(v) || v <= 0) continue;
    const key = p.currency || '';
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  return [...sums.entries()];
};

const TransactionTable = ({ transactions }: Props) => {
  if (transactions.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No matches. Try clearing the filters.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked card rows (more readable than a 7-col table on a phone). */}
      <ul className="flex flex-col gap-3 md:hidden">
        {transactions.map((t) => (
          <li
            key={t.uid ?? `${t.file}:${t.startLine}`}
            className="rounded-lg border border-border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  {statusBadge(t.status)}
                  {t.uid ? (
                    <Link
                      href={`/transactions/${t.uid}/edit`}
                      className="break-words hover:underline"
                    >
                      {t.payee}
                    </Link>
                  ) : (
                    <span className="break-words">{t.payee}</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatTxDate(t.date)}
                </div>
              </div>
              <div className="shrink-0">
                {t.uid ? (
                  <RowActions transaction={t} />
                ) : (
                  <span
                    className="text-xs text-muted-foreground"
                    title="Re-import the journal to enable editing for this transaction"
                  >
                    no uid
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="min-w-0 break-words text-xs text-muted-foreground">
                {accountsSummary(t)}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {magnitudeByCurrency(t).map(([ccy, amt]) => (
                  <span key={ccy} className="block">
                    {formatAmount(`${ccy} ${amt.toFixed(2)}`, true)}
                  </span>
                ))}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: original table, wrapped so it scrolls inside its card on narrow widths. */}
      <TableScroll className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2 w-6"></th>
              <th className="py-2">Payee</th>
              <th className="py-2">Accounts</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.uid ?? `${t.file}:${t.startLine}`}
                className="border-t border-border"
              >
                <td className="py-2 whitespace-nowrap tabular-nums">
                  {formatTxDate(t.date)}
                </td>
                <td className="py-2">{statusBadge(t.status)}</td>
                <td className="py-2">
                  {t.uid ? (
                    <Link
                      href={`/transactions/${t.uid}/edit`}
                      className="hover:underline"
                    >
                      {t.payee}
                    </Link>
                  ) : (
                    <span>{t.payee}</span>
                  )}
                </td>
                <td className="py-2 text-muted-foreground">
                  {accountsSummary(t)}
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {magnitudeByCurrency(t).map(([ccy, amt]) => (
                    <div key={ccy}>
                      {formatAmount(`${ccy} ${amt.toFixed(2)}`, true)}
                    </div>
                  ))}
                </td>
                <td className="py-2 text-right">
                  {t.uid ? (
                    <RowActions transaction={t} />
                  ) : (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Re-import the journal to enable editing for this transaction"
                    >
                      no uid
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
};

export default TransactionTable;
