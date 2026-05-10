import { exec } from 'child_process';
import dayjs from 'dayjs';
import { promisify } from 'util';
import { getHighestExpense } from './Dashboard.utils';
import formatAmount from '@/utils/formatAmount';
import getLedgerCommand from '@/utils/getLedgerCommand';
import Card from '@components/Card';

const execPromise = promisify(exec);

const Dashboard = async () => {
  const ledgerCommand = getLedgerCommand();
  const { stdout: currentMonthBalance } = await execPromise(
    `${ledgerCommand} reg ^Expenses --period 'this month' --monthly -X Kirt  --format "%T\n"  | tail -n 1`
  );
  const { stdout: currentYearBalance } = await execPromise(
    `${ledgerCommand} reg ^Expenses --period 'this year' --yearly -X Kirt  --format "%T\n"  | tail -n 1`
  );
  const { stdout: expensesMonthly } = await execPromise(
    `${ledgerCommand} reg ^Expenses --period 'this month' --monthly -X Kirt  --format "%A|%t\n"`
  );
  const highestExpenseThisMonth = getHighestExpense(expensesMonthly);
  const [highestAccount, highestAmount] = highestExpenseThisMonth
    ? highestExpenseThisMonth.split('|')
    : [null, null];
  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <Card
        className="w-full mt-0"
        body="Current Month Balance"
        title={formatAmount(currentMonthBalance.split('\n')[0], true)}
        action={{
          title: 'More Details',
          href: `/balance/${dayjs().startOf('month').format('YYYY-MM-DD')}/${dayjs().endOf('month').format('YYYY-MM-DD')}`,
        }}
      />
      <Card
        className="w-full mt-0"
        body="Current Year Balance"
        title={formatAmount(currentYearBalance.split('\n')[0], true)}
        action={{
          title: 'More Details',
          href: `/balance/${dayjs().startOf('year').format('YYYY-MM-DD')}/${dayjs().endOf('year').format('YYYY-MM-DD')}`,
        }}
      />
      <Card
        className="w-full mt-0"
        body="Highest Expense This Month"
        title={
          highestAccount ? (
            <span>
              {highestAccount}&nbsp;{formatAmount(highestAmount, true)}
            </span>
          ) : (
            <span className="text-gray-400">No expenses this month</span>
          )
        }
        action={{
          title: 'More Details',
          href: `/balance/${dayjs().startOf('month').format('YYYY-MM-DD')}/${dayjs().endOf('month').format('YYYY-MM-DD')}`,
        }}
      />
    </div>
  );
};

export default Dashboard;
