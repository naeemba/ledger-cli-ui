'use client';

import RowActions from './RowActions';
import type { Transaction } from '@/lib/journal/parser';
import formatAmount from '@/utils/formatAmount';
import Link from 'next/link';

type Props = { transactions: Transaction[] };

const statusBadge = (status: Transaction['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

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
            <td className="py-2 tabular-nums">
              {new Date(t.date).toLocaleDateString(undefined, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
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
              {t.postings
                .slice(0, 2)
                .map((p) => p.account)
                .join(' → ')}
              {t.postings.length > 2 ? ' …' : ''}
            </td>
            <td className="py-2 text-right tabular-nums">
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
  );
};

export default TransactionTable;
