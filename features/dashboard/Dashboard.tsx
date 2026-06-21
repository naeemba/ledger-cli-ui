import {
  getHighestExpense,
  getJournalStats,
  getRecentTransactions,
} from './Dashboard.utils';
import EmptyJournal from './EmptyJournal';
import SavedViewsCard from './SavedViewsCard';
import Card from '@/components/Card';
import Help from '@/components/Help';
import { buttonVariants } from '@/components/ui/button';
import { Card as ShadcnCard } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency } from '@/lib/settings';
import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
  toISODate,
} from '@/utils/date';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const lastNonEmptyLine = (stdout: string): string =>
  stdout.split('\n').filter(Boolean).slice(-1)[0] ?? '';

const RECENT_LIMIT = 10;

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-medium uppercase tracking-wider text-muted">
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
  const yearRange = `${toISODate(startOfYear(now))}/${toISODate(endOfYear(now))}`;

  const [
    currentMonthBalanceRaw,
    currentYearBalanceRaw,
    expensesMonthly,
    recent,
    stats,
    savedViews,
  ] = await Promise.all([
    runLedger([
      'reg',
      '^Expenses',
      '--period',
      'this month',
      '--monthly',
      '-X',
      currency,
      '--format',
      '%T\n',
    ]),
    runLedger([
      'reg',
      '^Expenses',
      '--period',
      'this year',
      '--yearly',
      '-X',
      currency,
      '--format',
      '%T\n',
    ]),
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
    getRecentTransactions(RECENT_LIMIT),
    getJournalStats(),
    savedViewService.list(user.id),
  ]);

  const currentMonthBalance = lastNonEmptyLine(currentMonthBalanceRaw);
  const currentYearBalance = lastNonEmptyLine(currentYearBalanceRaw);
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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <Help label="About the dashboard">
            A snapshot of this month&apos;s spending, the year-to-date total,
            and your single biggest expense category. All values are converted
            to your default currency.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatDate(now.toISOString(), Format.MONTH_YEAR)} overview
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          label="Current Month Balance"
          value={formatAmount(currentMonthBalance, true)}
          action={{ title: 'More details', href: `/balance/${monthRange}` }}
        />
        <Card
          label="Current Year Balance"
          value={formatAmount(currentYearBalance, true)}
          action={{ title: 'More details', href: `/balance/${yearRange}` }}
        />
        <Card
          label="Highest Expense This Month"
          value={
            highestAccount ? (
              <span className="flex flex-col gap-1">
                <span className="text-base font-medium text-muted">
                  {highestAccount}
                </span>
                <span>{formatAmount(highestAmount, true)}</span>
              </span>
            ) : (
              <span className="text-base font-normal text-muted">
                No expenses this month
              </span>
            )
          }
          action={{ title: 'More details', href: `/balance/${monthRange}` }}
        />
      </div>

      <SavedViewsCard
        views={savedViews.map(({ id, name, targetPath }) => ({
          id,
          name,
          targetPath,
        }))}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Recent transactions
            </h2>
            <Help label="About recent transactions">
              The {RECENT_LIMIT} most recently dated postings across your
              journal. A single transaction typically produces multiple postings
              (e.g. a debit and matching credit).
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
        <ShadcnCard className="gap-0 overflow-hidden p-0">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Account</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No transactions
                  </td>
                </tr>
              ) : (
                recent.map((row, idx) => (
                  <tr key={idx}>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(row.date, Format.DATE)}
                    </td>
                    <td>{row.payee || '—'}</td>
                    <td>
                      <Link
                        className="text-fg hover:text-accent"
                        href={`/accounts/${encodeURIComponent(row.account)}`}
                      >
                        {row.account}
                      </Link>
                    </td>
                    <td className="text-right">
                      {formatAmount(row.amount, true)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ShadcnCard>
      </section>

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
        <ShadcnCard className="grid grid-cols-2 gap-6 px-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Postings" value={stats.postings} />
          <Stat label="Uncleared" value={stats.uncleared} />
          <Stat label="Last 7 days" value={stats.last7} />
          <Stat label="Last 30 days" value={stats.last30} />
          <Stat label="This month" value={stats.thisMonth} />
          <Stat label="Days since last" value={stats.daysSinceLast} />
        </ShadcnCard>
      </section>
    </div>
  );
};

export default Dashboard;
