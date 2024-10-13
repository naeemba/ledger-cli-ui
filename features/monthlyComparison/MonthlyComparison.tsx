import { getMonthsTotals } from './MonthlyComparison.utils';
import Chart from '@/components/Chart';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getRandomColor from '@/utils/getRandomColor';

const MonthlyComparison = async () => {
  const monthsTotals = await getMonthsTotals();
  const colors = monthsTotals.map(() => getRandomColor(0.8, 1));
  return (
    <div>
      <div className="flex flex-col">
        <h1 className="text-3xl font-bold">Monthly Comparison</h1>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr>
            <th>Date</th>
            <th className="text-right">Amount ({getDefaultCurrency()})</th>
          </tr>
        </thead>
        <tbody>
          {monthsTotals.map((result, idx) => {
            return (
              <tr key={idx}>
                <td className="text-center">
                  {formatDate(result.date.toISOString(), Format.MONTH_YEAR)}
                </td>
                <td className="text-right">
                  {formatAmount(result.total, false)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-8">
        <Chart
          data={{
            labels: monthsTotals
              .reverse()
              .map((each) =>
                formatDate(each.date.toISOString(), Format.MONTH_YEAR)
              ),
            datasets: [
              {
                label: 'Monthly',
                data: monthsTotals
                  .reverse()
                  .map((each) => each.total.split(' ')[1]?.replaceAll(',', '')),
                backgroundColor: colors.map((each) => each[0]),
                borderColor: colors.map((each) => each[1]),
              },
            ],
          }}
        />
      </div>
    </div>
  );
};

export default MonthlyComparison;
