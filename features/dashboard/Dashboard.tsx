import { Fragment } from 'react';
import {
  firstNonEmptyLine,
  getHighestExpense,
  getJournalStats,
  getNetWorthChange,
  getNetWorthSeries,
  getSafeToSpend,
} from './Dashboard.utils';
import EmptyJournal from './EmptyJournal';
import SavedViewsCard from './SavedViewsCard';
import UpcomingBillsWidget from './UpcomingBillsWidget';
import Card from '@/components/Card';
import Chart from '@/components/Chart';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { buttonVariants } from '@/components/ui/button';
import { Card as ShadcnCard } from '@/components/ui/card';
import BudgetsWidget from '@/features/budgets/BudgetsWidget';
import { getBudgetReport } from '@/features/budgets/report';
import { getCashFlow } from '@/features/monthlyComparison/MonthlyComparison.utils';
import { buildDueList } from '@/features/recurring/dueList';
import { loadJournalTransactions } from '@/features/transactions/loadJournalTransactions';
import { pageTransactions } from '@/features/transactions/pageTransactions';
import TransactionRow from '@/features/transactions/row/TransactionRow';
import { transactionRowToView } from '@/features/transactions/row/rowView';
import { requireUser } from '@/lib/auth/require-user';
import { type WidgetId } from '@/lib/dashboard/widgets';
import { env } from '@/lib/env';
import { journalService } from '@/lib/journal';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency, getDashboardWidgets } from '@/lib/settings';
import { endOfMonth, startOfMonth, toISODate } from '@/utils/date';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const RECENT_LIMIT = 10;
const UPCOMING_DAYS = 30;
const SPARKLINE_MONTHS = 12;

const formatNumber = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <span className="text-lg font-semibold tabular-nums">{value || '—'}</span>
  </div>
);

const Dashboard = async () => {
  const currency = await getBaseCurrency();
  const user = await requireUser();
  const now = new Date();
  const monthRange = `${toISODate(startOfMonth(now))}/${toISODate(endOfMonth(now))}`;
  const upcomingStart = toISODate(now);
  const upcomingEnd = toISODate(
    new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000)
  );
  const tomorrow = toISODate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const thisMonthStart = toISODate(startOfMonth(now));
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = toISODate(lastMonth);
  const sparklineCutoff = toISODate(
    new Date(now.getFullYear(), now.getMonth() - (SPARKLINE_MONTHS - 1), 1)
  );

  const [
    currentMonthBalanceRaw,
    safeToSpend,
    expensesMonthly,
    recent,
    stats,
    savedViews,
    dueList,
    netWorthSeries,
    netWorthChange,
    cashFlow,
    widgets,
    budgetReport,
  ] = await Promise.all([
    // `bal --collapse` folds the whole period into one rollup row, so the
    // total comes straight from ledger's `%T` instead of guessing which line
    // of a periodic register is the grand total (fragile once a `<Revalued>`
    // row or the default `--sort -date` reorders the output). See #6.
    runLedger([
      'bal',
      '^Expenses',
      '--period',
      'this month',
      '-X',
      currency,
      '--collapse',
      '--format',
      '%T\n',
    ]),
    getSafeToSpend(
      currency,
      tomorrow,
      upcomingEnd,
      env.PORTFOLIO_ACCOUNT_PREFIX
    ),
    runLedger([
      'reg',
      '^Expenses',
      '--period',
      'this month',
      '--monthly',
      '-X',
      currency,
      '--format',
      '%A|%t\n',
    ]),
    loadJournalTransactions(user.id).then((all) =>
      pageTransactions(all, {}, 0, RECENT_LIMIT).rows.map(transactionRowToView)
    ),
    getJournalStats(),
    savedViewService.list(user.id),
    journalService
      .listRecurring(user.id)
      .then((rules) => buildDueList(rules, upcomingStart, upcomingEnd)),
    getNetWorthSeries(currency, sparklineCutoff),
    getNetWorthChange(currency, lastMonthStart, thisMonthStart),
    getCashFlow(currency),
    // ponytail: data for hidden widgets is still fetched; skip the fetches if
    // the ledger calls ever get slow enough to matter.
    getDashboardWidgets(),
    getBudgetReport(currency, upcomingStart),
  ]);

  const lastMonthReview =
    cashFlow.find(
      (row) =>
        row.date.getFullYear() === lastMonth.getFullYear() &&
        row.date.getMonth() === lastMonth.getMonth()
    ) ?? null;
  const latestNetWorth =
    netWorthSeries.length > 0
      ? netWorthSeries[netWorthSeries.length - 1].value
      : null;

  const currentMonthBalance = firstNonEmptyLine(currentMonthBalanceRaw);
  const highestExpenseThisMonth = getHighestExpense(expensesMonthly);
  const [highestAccount, highestAmount] = highestExpenseThisMonth
    ? highestExpenseThisMonth.split('|')
    : [null, null];

  // `ledger stats` returns "0" (or an empty string when the journal is just
  // the stub from `ensureLayout`). Either way we show the empty-state CTA.
  const postingsCount = Number(stats.postings || '0');
  if (!Number.isFinite(postingsCount) || postingsCount === 0) {
    return <EmptyJournal />;
  }

  const sections: Record<WidgetId, React.ReactNode> = {
    stats: (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          label={`Safe to Spend until ${formatDate(safeToSpend.until, Format.DATE)}`}
          value={
            safeToSpend.amount ? (
              <span className="flex flex-col gap-1">
                <span>{formatAmount(safeToSpend.amount, true)}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  liquid assets after upcoming bills,{' '}
                  {safeToSpend.basedOnIncome
                    ? 'until your next income'
                    : `next ${UPCOMING_DAYS} days`}
                </span>
              </span>
            ) : (
              <span className="text-base font-normal text-muted-foreground">
                No liquid assets found
              </span>
            )
          }
          action={{ title: 'Manage recurring', href: '/recurring' }}
        />
        <Card
          label="Spent This Month"
          value={formatAmount(currentMonthBalance, true)}
          action={{ title: 'More details', href: `/balance/${monthRange}` }}
        />
        <Card
          label="Highest Expense This Month"
          value={
            highestAccount ? (
              <span className="flex flex-col gap-1">
                <span className="text-base font-medium text-muted-foreground">
                  {highestAccount}
                </span>
                <span>{formatAmount(highestAmount, true)}</span>
              </span>
            ) : (
              <span className="text-base font-normal text-muted-foreground">
                No expenses this month
              </span>
            )
          }
          action={{ title: 'More details', href: `/balance/${monthRange}` }}
        />
      </div>
    ),
    trends: (
      <div className="grid gap-4 lg:grid-cols-2">
        <ShadcnCard className="flex flex-col gap-3 p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Net worth
              </h2>
              <Help label="About net worth">
                Assets plus liabilities at the end of each month over the last{' '}
                {SPARKLINE_MONTHS} months, converted to your default currency.
              </Help>
            </div>
            <Link
              href="/net-worth"
              className={buttonVariants({ variant: 'link', size: 'sm' })}
            >
              Full history →
            </Link>
          </div>
          <span className="text-2xl font-semibold tabular-nums">
            {latestNetWorth === null ? '—' : formatNumber(latestNetWorth)}
            {latestNetWorth === null ? '' : ` ${currency.toUpperCase()}`}
          </span>
          {netWorthSeries.length > 1 ? (
            <Chart
              type="area"
              data={netWorthSeries.map((row) => ({
                month: formatDate(row.date, Format.SHORT_MONTH_YEAR),
                netWorth: row.value,
              }))}
              xKey="month"
              series={[
                {
                  key: 'netWorth',
                  label: `Net worth (${currency.toUpperCase()})`,
                  color: 'var(--chart-2)',
                },
              ]}
              showLegend={false}
              hideYAxis
              height={110}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough history for a trend yet.
            </p>
          )}
        </ShadcnCard>

        <ShadcnCard className="flex flex-col gap-3 p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {formatDate(lastMonthStart, Format.MONTH_YEAR)} in review
              </h2>
              <Help label="About last month in review">
                Last month&apos;s income, expenses, what was left over, and how
                your net worth moved. Computed by ledger over the calendar
                month.
              </Help>
            </div>
            <Link
              href="/monthly"
              className={buttonVariants({ variant: 'link', size: 'sm' })}
            >
              Cash flow →
            </Link>
          </div>
          {lastMonthReview === null ? (
            <p className="text-sm text-muted-foreground">
              No activity recorded last month.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Income
                </dt>
                <dd className="font-semibold tabular-nums text-positive">
                  {formatNumber(lastMonthReview.income)}{' '}
                  {currency.toUpperCase()}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Expenses
                </dt>
                <dd className="font-semibold tabular-nums text-negative">
                  {formatNumber(lastMonthReview.expenses)}{' '}
                  {currency.toUpperCase()}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Net
                </dt>
                <dd
                  className={`font-semibold tabular-nums ${lastMonthReview.net >= 0 ? 'text-positive' : 'text-negative'}`}
                >
                  {formatNumber(lastMonthReview.net)} {currency.toUpperCase()}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Net worth Δ
                </dt>
                <dd className="font-semibold tabular-nums">
                  {formatAmount(netWorthChange, true)}
                </dd>
              </div>
            </dl>
          )}
        </ShadcnCard>
      </div>
    ),
    upcomingBills: <UpcomingBillsWidget dueList={dueList} />,
    savedViews: (
      <SavedViewsCard
        views={savedViews.map(({ id, name, targetPath }) => ({
          id,
          name,
          targetPath,
        }))}
      />
    ),
    recentTransactions: (
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Recent transactions
            </h2>
            <Help label="About recent transactions">
              The {RECENT_LIMIT} most recently dated transactions across your
              journal. Each row is one transaction; its postings (e.g. a debit
              and matching credit) are summarized as the accounts it touches.
            </Help>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/transactions"
              className={buttonVariants({ variant: 'link', size: 'sm' })}
            >
              View all →
            </Link>
            <Link
              href="/transactions/new"
              className={buttonVariants({ size: 'sm' })}
            >
              Add transaction
            </Link>
          </div>
        </div>
        {recent.length === 0 ? (
          <ShadcnCard className="p-6 text-center text-sm text-muted-foreground">
            No transactions
          </ShadcnCard>
        ) : (
          <div className="flex flex-col">
            {recent.map((view, i) => (
              <TransactionRow key={`${view.uid ?? 'nouid'}:${i}`} view={view} />
            ))}
          </div>
        )}
      </section>
    ),
    journalHealth: (
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Journal health
          </h2>
          <Help label="About journal health">
            Summary from <code>ledger stats</code>. Helps spot when your journal
            is getting stale or when you have a backlog of uncleared entries to
            reconcile.
          </Help>
        </div>
        <ShadcnCard className="grid grid-cols-1 gap-6 px-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Postings" value={stats.postings} />
          <Stat label="Uncleared" value={stats.uncleared} />
          <Stat label="Last 7 days" value={stats.last7} />
          <Stat label="Last 30 days" value={stats.last30} />
          <Stat label="This month" value={stats.thisMonth} />
          <Stat label="Days since last" value={stats.daysSinceLast} />
        </ShadcnCard>
      </section>
    ),
    budgets: <BudgetsWidget month={budgetReport.month} />,
  };

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <Help label="About the dashboard">
            What&apos;s safe to spend before your next income, this month&apos;s
            spending, and your single biggest expense category. All values are
            converted to your default currency.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(now.toISOString(), Format.MONTH_YEAR)} overview
        </p>
      </div>
      {widgets
        .filter((widget) => !widget.hidden)
        .map((widget) => (
          <Fragment key={widget.id}>{sections[widget.id]}</Fragment>
        ))}
    </PageContainer>
  );
};

export default Dashboard;
