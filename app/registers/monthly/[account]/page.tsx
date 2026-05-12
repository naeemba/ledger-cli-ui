import dayjs from 'dayjs';
import Chart from '@/components/Chart';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getColor from '@/utils/getColor';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';
import isValidAccount from '@/utils/validateAccount';
import { notFound } from 'next/navigation';

const Monthly = async ({
  params,
}: {
  params: Promise<{ account: string }>;
}) => {
  const defaultCurrency = getDefaultCurrency() ?? 'USD';
  const { account: accountParam } = await params;
  const account = decodeURIComponent(accountParam);
  if (!isValidAccount(account)) notFound();

  const stdout = await runLedger([
    'register',
    account,
    '--format',
    'NNN%D|%t',
    '-M',
  ]);
  const balance = await runLedger([
    'balance',
    account,
    '-X',
    defaultCurrency,
    '--format',
    '%T',
  ]);
  const results = stdout.split('NNN').filter(Boolean);
  const colors = results.map((each) =>
    getColor(each.split('|')[0] ?? '', 0.8, 1)
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Monthly report
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-all">
            {account}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Balance
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(balance, true)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Balance ({defaultCurrency})</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted">
                  No transactions
                </td>
              </tr>
            ) : (
              results.map((item, index) => {
                const columns = item.split('|');
                return (
                  <tr key={index}>
                    <td>{formatDate(columns[0], Format.MONTH_YEAR)}</td>
                    <td className="text-right">
                      {formatAmount(columns[1], false)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {results.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Chart
            data={{
              labels: results.map((each) =>
                dayjs(each.split('|')[0]).format('MMM YYYY')
              ),
              datasets: [
                {
                  label: 'Monthly',
                  data: results.map((each) =>
                    each.split('|')[1].split(' ')[1].replaceAll(',', '')
                  ),
                  backgroundColor: colors.map((each) => each[0]),
                  borderColor: colors.map((each) => each[1]),
                },
              ],
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Monthly;
