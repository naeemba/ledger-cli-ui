import RowActions from './RowActions';
import type { TransactionRow } from './transactionRow';
import formatAmount from '@/utils/formatAmount';
import { Format, formatDateWithLocale } from '@/utils/formatDateCore';
import Link from 'next/link';

const statusBadge = (status: TransactionRow['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

const accountsSummary = (t: TransactionRow) =>
  `${t.postings
    .slice(0, 2)
    .map((p) => p.account)
    .join(' → ')}${t.postings.length > 2 ? ' …' : ''}`;

const magnitudeByCurrency = (t: TransactionRow): Array<[string, number]> => {
  const sums = new Map<string, number>();
  for (const p of t.postings) {
    const v = Number(p.amount);
    if (!Number.isFinite(v) || v <= 0) continue;
    const key = p.currency || '';
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  return [...sums.entries()];
};

const payeeNode = (t: TransactionRow) =>
  t.uid ? (
    <Link href={`/transactions/${t.uid}/edit`} className="hover:underline">
      {t.payee}
    </Link>
  ) : (
    <span>{t.payee}</span>
  );

const actionsNode = (t: TransactionRow) =>
  t.uid ? (
    <RowActions transaction={t} />
  ) : (
    <span
      className="text-xs text-muted-foreground"
      title="Re-import the journal to enable editing for this transaction"
    >
      no uid
    </span>
  );

const TransactionRowItem = ({ row: t }: { row: TransactionRow }) => (
  <>
    {/* Mobile: stacked card (more readable than a 7-col table on a phone). */}
    <div className="rounded-lg border border-border p-3 text-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium break-words">
            {statusBadge(t.status)}
            {payeeNode(t)}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatDateWithLocale(t.date, Format.DATE)}
          </div>
        </div>
        <div className="shrink-0">{actionsNode(t)}</div>
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
    </div>

    {/* Desktop: grid row mirroring the old table columns (no <table> so the
        parent can absolutely-position it for virtualization). */}
    <div className="hidden grid-cols-[7rem_1.5rem_1fr_1fr_8rem_6rem] items-center gap-2 border-t border-border py-2 text-sm md:grid">
      <span className="whitespace-nowrap tabular-nums">
        {formatDateWithLocale(t.date, Format.DATE)}
      </span>
      <span>{statusBadge(t.status)}</span>
      <span className="min-w-0 truncate">{payeeNode(t)}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {accountsSummary(t)}
      </span>
      <span className="text-right whitespace-nowrap tabular-nums">
        {magnitudeByCurrency(t).map(([ccy, amt]) => (
          <span key={ccy} className="block">
            {formatAmount(`${ccy} ${amt.toFixed(2)}`, true)}
          </span>
        ))}
      </span>
      <span className="text-right">{actionsNode(t)}</span>
    </div>
  </>
);

export default TransactionRowItem;
