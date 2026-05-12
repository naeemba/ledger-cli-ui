import { getMonthsTotals } from './MonthlyComparison.utils';
import Chart from '@/components/Chart';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getColor from '@/utils/getColor';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

const MonthlyComparison = async () => {
  const monthsTotals = await getMonthsTotals();
  const colors = monthsTotals.map((m) =>
    getColor(m.date.toISOString(), 0.8, 1)
  );
  const chartOrder = monthsTotals.toReversed();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Monthly Comparison
        </h1>
        <p className="mt-1 text-sm text-muted">
          Expense trend across recent months
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Amount ({getDefaultCurrency()})</th>
            </tr>
          </thead>
          <tbody>
            {monthsTotals.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted">
                  No data
                </td>
              </tr>
            ) : (
              monthsTotals.map((result, idx) => (
                <tr key={idx}>
                  <td>
                    {formatDate(result.date.toISOString(), Format.MONTH_YEAR)}
                  </td>
                  <td className="text-right">
                    {formatAmount(result.total, false)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {chartOrder.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Chart
            data={{
              labels: chartOrder.map((each) =>
                formatDate(each.date.toISOString(), Format.MONTH_YEAR)
              ),
              datasets: [
                {
                  label: 'Monthly',
                  data: chartOrder.map((each) =>
                    each.total.split(' ')[1]?.replaceAll(',', '')
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

export default MonthlyComparison;
