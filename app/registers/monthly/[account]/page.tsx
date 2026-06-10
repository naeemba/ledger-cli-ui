import Chart from '@/components/Chart';
import { Card, CardContent } from '@/components/ui/card';
import RegisterHeader from '@/features/registers/monthly/RegisterHeader';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency } from '@/lib/settings';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import parseAmountColumn from '@/utils/parseAmountColumn';
import runLedger from '@/utils/runLedger';
import isValidAccount from '@/utils/validateAccount';
import { notFound } from 'next/navigation';

const Monthly = async ({
  params,
}: {
  params: Promise<{ account: string }>;
}) => {
  const defaultCurrency = await getBaseCurrency();
  const { account: accountParam } = await params;
  const account = decodeURIComponent(accountParam);
  if (!isValidAccount(account)) notFound();
  const user = await requireUser();
  const existingViewNames = (await savedViewService.list(user.id)).map(
    (v) => v.name
  );

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
      <RegisterHeader
        account={account}
        balance={balance}
        existingViewNames={existingViewNames}
      />

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
                  balance: parseAmountColumn(raw),
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
