import Chart from '@/components/Chart';
import DateFilter from '@/components/DateFilter';
import Help from '@/components/Help';
import { parseISODate, toISODate } from '@/utils/date';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getColor from '@/utils/getColor';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
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
  const defaultCurrency = getDefaultCurrency() ?? 'USD';
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

  const colors = results.map((each) =>
    getColor(each.split('|')[0] ?? '', 0.8, 1)
  );

  return (
    <div className="flex flex-col gap-6">
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
        <p className="mt-1 text-sm text-muted">
          {formatDate(from.toISOString(), Format.DATE)} –{' '}
          {formatDate(to.toISOString(), Format.DATE)}
        </p>
      </div>

      <DateFilter
        urlPattern="/balance/{from}/{to}"
        from={fromParam}
        to={toParam}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-medium text-fg">Total Expenses</h2>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Total
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(total, true)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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
                <td colSpan={2} className="py-6 text-center text-muted">
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
                        className="block text-fg hover:text-accent"
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
      </div>

      {results.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Chart
            data={{
              labels: results.map((each) => each.split('|')[0]),
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

export default PeriodBalance;
