import dayjs from 'dayjs';
import { getHighestExpense } from './Dashboard.utils';
import Card from '@/components/Card';
import formatAmount from '@/utils/formatAmount';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';

const lastNonEmptyLine = (stdout: string): string =>
  stdout.split('\n').filter(Boolean).slice(-1)[0] ?? '';

const Dashboard = async () => {
  const currency = getDefaultCurrency() ?? 'USD';
  const currentMonthBalance = lastNonEmptyLine(
    await runLedger([
      'reg',
      '^Expenses',
      '--period',
      'this month',
      '--monthly',
      '-X',
      currency,
      '--format',
      '%T\n',
    ])
  );
  const currentYearBalance = lastNonEmptyLine(
    await runLedger([
      'reg',
      '^Expenses',
      '--period',
      'this year',
      '--yearly',
      '-X',
      currency,
      '--format',
      '%T\n',
    ])
  );
  const expensesMonthly = await runLedger([
    'reg',
    '^Expenses',
    '--period',
    'this month',
    '--monthly',
    '-X',
    currency,
    '--format',
    '%A|%t\n',
  ]);
  const highestExpenseThisMonth = getHighestExpense(expensesMonthly);
  const [highestAccount, highestAmount] = highestExpenseThisMonth
    ? highestExpenseThisMonth.split('|')
    : [null, null];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          {dayjs().format('MMMM YYYY')} overview
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          label="Current Month Balance"
          value={formatAmount(currentMonthBalance, true)}
          action={{
            title: 'More details',
            href: `/balance/${dayjs().startOf('month').format('YYYY-MM-DD')}/${dayjs().endOf('month').format('YYYY-MM-DD')}`,
          }}
        />
        <Card
          label="Current Year Balance"
          value={formatAmount(currentYearBalance, true)}
          action={{
            title: 'More details',
            href: `/balance/${dayjs().startOf('year').format('YYYY-MM-DD')}/${dayjs().endOf('year').format('YYYY-MM-DD')}`,
          }}
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
          action={{
            title: 'More details',
            href: `/balance/${dayjs().startOf('month').format('YYYY-MM-DD')}/${dayjs().endOf('month').format('YYYY-MM-DD')}`,
          }}
        />
      </div>
    </div>
  );
};

export default Dashboard;
