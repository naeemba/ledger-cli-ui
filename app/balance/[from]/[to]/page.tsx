import Chart from '@/components/Chart';
import DateFilter from '@/components/DateFilter';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { Card, CardContent } from '@/components/ui/card';
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency } from '@/lib/settings';
import { parseAmountParts } from '@/utils/amountParts';
import { parseISODate, toISODate } from '@/utils/date';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const PeriodBalance = async ({
  params,
}: {
  params: Promise<{ from: string; to: string }>;
}) => {
  const { from: fromParam, to: toParam } = await params;
  const from = parseISODate(fromParam);
  const to = parseISODate(toParam);
  const user = await requireUser();
  const existingViewNames = await savedViewService.listNames(user.id);
  const currentPath = `/balance/${fromParam}/${toParam}`;
  const defaultCurrency = await getBaseCurrency();
  const stdout = await runLedger([
    'bal',
    'Expenses',
    '-b',
    toISODate(from),
    '-e',
    toISODate(to),
    '-X',
    defaultCurrency,
    '--format',
    'NNN%A|%t|%T\n',
  ]);
  const results = stdout
    .split('NNN')
    .filter(Boolean)
    .filter((each) => each.split('|')[1].split('\n')[0] !== '0');
  const total =
    stdout
      .split('NNN')
      .filter(Boolean)
      .find((each) => each.split('|')[1] === '0')
      ?.split('|')[2] ?? '';

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Periodic Balance
          </h1>
          <Help label="About periodic balance">
            Expenses by category within the chosen date range. Use the date
            filter below to pick a month, quarter, year, or custom span.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(from.toISOString(), Format.DATE)} –{' '}
          {formatDate(to.toISOString(), Format.DATE)}
        </p>
      </div>

      <DateFilter
        urlPattern="/balance/{from}/{to}"
        from={fromParam}
        to={toParam}
        saveViewSlot={
          <SaveViewButton
            targetPath={currentPath}
            existingNames={existingViewNames}
          />
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-medium text-fg">Total Expenses</h2>
        <div className="flex items-end gap-3">
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </div>
            <div className="text-2xl font-semibold tracking-tight">
              {formatAmount(total, true)}
            </div>
          </div>
          <ExportButton
            href={`/api/balance/periodic/export?start=${fromParam}&end=${toParam}`}
          />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="text-right">
                Spend ({defaultCurrency.toUpperCase()})
              </th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="py-6 text-center text-muted-foreground"
                >
                  No expenses in this period
                </td>
              </tr>
            ) : (
              results.map((item, index) => {
                const columns = item.split('|');
                return (
                  <tr key={index}>
                    <td>
                      <Link
                        className="block text-fg hover:text-accent-text"
                        href={`/accounts/${encodeURIComponent(columns[0])}`}
                      >
                        {columns[0]}
                      </Link>
                    </td>
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
                const [account, raw] = each.split('|');
                return {
                  account,
                  spend: parseAmountParts(raw).signed,
                };
              })}
              xKey="account"
              series={[
                {
                  key: 'spend',
                  label: `Spend (${defaultCurrency.toUpperCase()})`,
                  color: 'var(--chart-1)',
                },
              ]}
              showLegend={false}
              height={320}
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};

export default PeriodBalance;
