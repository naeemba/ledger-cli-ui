import { getCashFlow } from './MonthlyComparison.utils';
import Chart from '@/components/Chart';
import Help from '@/components/Help';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

const formatNumber = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const MonthlyComparison = async () => {
  const rows = await getCashFlow();
  const currency = (getDefaultCurrency() ?? 'USD').toUpperCase();

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

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Income ({currency})</th>
              <th className="text-right">Expenses ({currency})</th>
              <th className="text-right">Net ({currency})</th>
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
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Chart
            data={{
              labels: rows.map((r) =>
                formatDate(r.date.toISOString(), Format.SHORT_MONTH_YEAR)
              ),
              datasets: [
                {
                  label: 'Income',
                  data: rows.map((r) => r.income),
                  backgroundColor: 'rgba(5, 150, 105, 0.7)',
                  borderColor: 'rgb(5, 150, 105)',
                },
                {
                  label: 'Expenses',
                  data: rows.map((r) => r.expenses),
                  backgroundColor: 'rgba(220, 38, 38, 0.7)',
                  borderColor: 'rgb(220, 38, 38)',
                },
              ],
            }}
          />
        </div>
      )}
    </div>
  );
};

export default MonthlyComparison;
