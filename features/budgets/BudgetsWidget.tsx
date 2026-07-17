import type { BudgetRow } from './report';
import { buttonVariants } from '@/components/ui/button';
import { Card as ShadcnCard } from '@/components/ui/card';
import Link from 'next/link';

// Same color rules as BudgetsView's barColor.
const barColor = (usedRatio: number | null): string => {
  if (usedRatio === null) return 'bg-muted-foreground/40';
  if (usedRatio > 1) return 'bg-destructive';
  if (usedRatio > 0.85) return 'bg-amber-500';
  return 'bg-primary';
};

type Props = { month: BudgetRow[] };

const BudgetsWidget = ({ month }: Props) => {
  if (month.length === 0) return null;

  const topRows = [...month]
    .sort((a, b) => (b.usedRatio ?? 0) - (a.usedRatio ?? 0))
    .slice(0, 5);

  return (
    <ShadcnCard className="flex flex-col gap-3 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Budgets
        </h2>
        <Link
          href="/budgets"
          className={buttonVariants({ variant: 'link', size: 'sm' })}
        >
          All budgets →
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {topRows.map((row) => {
          const widthPercent =
            row.usedRatio === null ? 0 : Math.min(100, row.usedRatio * 100);
          return (
            <li key={row.account} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{row.account}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {row.actual} / {row.budgeted}
                </span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className={`h-2 rounded-full ${barColor(row.usedRatio)}`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ShadcnCard>
  );
};

export default BudgetsWidget;
