import Chart from '@/components/Chart';
import Help from '@/components/Help';
import { Card, CardContent } from '@/components/ui/card';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
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
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              Monthly report
            </div>
            <Help label="About monthly report">
              Aggregated balance for this account, grouped by month. Useful for
              spotting trends or seasonality on a single account.
            </Help>
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

      <Card className="gap-0 overflow-hidden p-0">
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
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent>
            <Chart
              type="bar"
              data={results.map((each) => {
                const [date, raw] = each.split('|');
                return {
                  month: formatDate(date, Format.SHORT_MONTH_YEAR),
                  balance: Number(
                    (raw.split(' ')[1] ?? '0').replaceAll(',', '')
                  ),
                };
              })}
              xKey="month"
              series={[
                {
                  key: 'balance',
                  label: `Balance (${defaultCurrency})`,
                  color: 'var(--chart-1)',
                },
              ]}
              showLegend={false}
              height={320}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Monthly;
