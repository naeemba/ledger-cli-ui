'use client';

import TransactionRow from '@/features/transactions/row/TransactionRow';
import type { TransactionRowView } from '@/features/transactions/row/rowView';

const AccountRegister = ({ views }: { views: TransactionRowView[] }) => {
  if (views.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        No transactions
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {views.map((view, i) => (
        <TransactionRow key={view.uid ?? i} view={view} />
      ))}
    </div>
  );
};

export default AccountRegister;
