import TransactionRow from './TransactionRow';
import type { TransactionRowView } from './rowView';

/**
 * The body every register surface renders: parsed rows newest-first, or the
 * empty state. Shared so the account register and the per-person debt register
 * cannot drift apart.
 */
const RegisterList = ({ views }: { views: TransactionRowView[] }) =>
  views.length === 0 ? (
    <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
      No transactions
    </div>
  ) : (
    <div className="flex flex-col">
      {views.map((view, i) => (
        <TransactionRow key={`${view.uid ?? 'nouid'}:${i}`} view={view} />
      ))}
    </div>
  );

export default RegisterList;
