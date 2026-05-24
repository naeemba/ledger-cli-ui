import { getCashFlow } from './MonthlyComparison.utils';
import Chart from '@/components/Chart';
import Help from '@/components/Help';
import { Card, CardContent } from '@/components/ui/card';
import { getBaseCurrency } from '@/lib/settings';
import formatDate, { Format } from '@/utils/formatDate';

const formatNumber = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const MonthlyComparison = async () => {
  const currency = await getBaseCurrency();
  const rows = await getCashFlow(currency);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Cash Flow</h1>
          <Help label="About cash flow">
            Income and expenses side-by-side for each month, plus net savings
            (income minus expenses). Income is shown as a positive number even
            though Ledger records it as a credit.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted">Income vs expenses by month</p>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Income ({currency.toUpperCase()})</th>
              <th className="text-right">
                Expenses ({currency.toUpperCase()})
              </th>
              <th className="text-right">Net ({currency.toUpperCase()})</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  No data
                </td>
              </tr>
            ) : (
              [...rows].reverse().map((r) => {
                const net = r.income - r.expenses;
                const netClass = net >= 0 ? 'text-positive' : 'text-negative';
                return (
                  <tr key={r.date.toISOString()}>
                    <td>
                      {formatDate(r.date.toISOString(), Format.MONTH_YEAR)}
                    </td>
                    <td className="text-right tabular-nums text-positive">
                      {formatNumber(r.income)}
                    </td>
                    <td className="text-right tabular-nums text-negative">
                      {formatNumber(r.expenses)}
                    </td>
                    <td
                      className={`text-right font-medium tabular-nums ${netClass}`}
                    >
                      {formatNumber(net)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent>
            <Chart
              type="bar"
              data={rows.map((r) => ({
                month: formatDate(
                  r.date.toISOString(),
                  Format.SHORT_MONTH_YEAR
                ),
                income: r.income,
                expenses: r.expenses,
              }))}
              xKey="month"
              series={[
                {
                  key: 'income',
                  label: 'Income',
                  color: 'var(--positive)',
                },
                {
                  key: 'expenses',
                  label: 'Expenses',
                  color: 'var(--negative)',
                },
              ]}
              height={320}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MonthlyComparison;
