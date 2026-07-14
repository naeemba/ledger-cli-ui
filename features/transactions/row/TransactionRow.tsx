import RowActions from '../RowActions';
import type { TransactionRowView } from './rowView';
import formatAmount from '@/utils/formatAmount';
import { Format, formatDateWithLocale } from '@/utils/formatDateCore';
import Link from 'next/link';

const statusBadge = (status: TransactionRowView['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

// One formatted line per '\n'-separated commodity token.
const money = (value?: string) =>
  value
    ? value.split('\n').map((line, i) => (
        <span key={i} className="block">
          {formatAmount(line, true)}
        </span>
      ))
    : null;

const payeeNode = (view: TransactionRowView) =>
  view.uid ? (
    <Link href={`/transactions/${view.uid}/edit`} className="hover:underline">
      {view.payee}
    </Link>
  ) : (
    <span>{view.payee}</span>
  );

const actionsNode = (view: TransactionRowView) => {
  if (view.uid)
    return <RowActions uid={view.uid} templateDraft={view.templateDraft} />;
  // Only the main list supplies templateDraft, so restore its legacy "no uid"
  // hint there — a not-yet-backfilled transaction shows why it can't be edited.
  // Bare register/dashboard/reconcile rows stay silent.
  if (view.templateDraft)
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Re-import the journal to enable editing for this transaction"
      >
        no uid
      </span>
    );
  return null;
};

// The middle descriptor: accounts summary as plain text (main list), a link
// to the account register for a single account (dashboard/reconcile), or
// empty on the account register.
const descriptor = (view: TransactionRowView): React.ReactNode => {
  if (view.accountsSummary) return view.accountsSummary;
  if (view.account) {
    return (
      <Link
        href={`/accounts/${encodeURIComponent(view.account)}`}
        className="hover:underline"
      >
        {view.account}
      </Link>
    );
  }
  return '';
};

const TransactionRow = ({ view }: { view: TransactionRowView }) => (
  <>
    {/* Mobile: stacked card. */}
    <div className="rounded-lg border border-border p-3 text-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium break-words">
            {statusBadge(view.status)}
            {payeeNode(view)}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatDateWithLocale(view.date, Format.DATE)}
            {view.age !== undefined ? ` · ${view.age}d` : ''}
          </div>
        </div>
        <div className="shrink-0">{actionsNode(view)}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="min-w-0 break-words text-xs text-muted-foreground">
          {descriptor(view)}
        </span>
        <span className="shrink-0 text-right tabular-nums">
          {money(view.amount)}
          {view.runningTotal && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {money(view.runningTotal)}
            </span>
          )}
        </span>
      </div>
    </div>

    {/* Desktop: grid row. Columns: date | status | payee | descriptor |
        amount | (total) | actions. The total column only exists when the
        view supplies a runningTotal (account register); the main list keeps
        its original 6-column layout so this refactor doesn't shift it. */}
    {view.runningTotal ? (
      // ponytail: two grid templates (6-col vs 7-col) must stay in sync;
      // duplication is deliberate to preserve layout isolation per surface.
      <div className="hidden grid-cols-[7rem_1.5rem_1fr_1fr_8rem_8rem_6rem] items-center gap-2 border-t border-border py-2 text-sm md:grid">
        <span className="whitespace-nowrap tabular-nums">
          {formatDateWithLocale(view.date, Format.DATE)}
          {view.age !== undefined ? ` · ${view.age}d` : ''}
        </span>
        <span>{statusBadge(view.status)}</span>
        <span className="min-w-0 truncate">{payeeNode(view)}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {descriptor(view)}
        </span>
        <span className="text-right whitespace-nowrap tabular-nums">
          {money(view.amount)}
        </span>
        <span className="text-right whitespace-nowrap tabular-nums text-muted-foreground">
          {money(view.runningTotal)}
        </span>
        <span className="text-right">{actionsNode(view)}</span>
      </div>
    ) : (
      <div className="hidden grid-cols-[7rem_1.5rem_1fr_1fr_8rem_6rem] items-center gap-2 border-t border-border py-2 text-sm md:grid">
        <span className="whitespace-nowrap tabular-nums">
          {formatDateWithLocale(view.date, Format.DATE)}
          {view.age !== undefined ? ` · ${view.age}d` : ''}
        </span>
        <span>{statusBadge(view.status)}</span>
        <span className="min-w-0 truncate">{payeeNode(view)}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {descriptor(view)}
        </span>
        <span className="text-right whitespace-nowrap tabular-nums">
          {money(view.amount)}
        </span>
        <span className="text-right">{actionsNode(view)}</span>
      </div>
    )}
  </>
);

export default TransactionRow;
