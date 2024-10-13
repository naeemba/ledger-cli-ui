import { exec } from 'child_process';
import { promisify } from 'util';
import Chart from '@/components/Chart';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getLedgerCommand from '@/utils/getLedgerCommand';
import getRandomColor from '@/utils/getRandomColor';

const execPromise = promisify(exec);

const Monthly = async () => {
  const { stdout } = await execPromise(
    `${getLedgerCommand()} reg -M Expenses -X ${getDefaultCurrency()} --collapse --format 'NNN%D|%A|%t|%T\n'`
  );
  const results = stdout.split('NNN').filter(Boolean);
  const monthItems = results.filter(
    (each) => each.split('|')[1] !== '<Adjustment>'
  );
  console.log({ monthItems });
  const colors = monthItems.map(() => getRandomColor(0.8, 1));
  return (
    <div>
      <div className="flex flex-col">
        <h1 className="text-3xl font-bold">Monthly Comparison</h1>
        <div className="mt-4">
          It is not accurate, they are adjustments which make this list not
          accurate.
        </div>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th className="text-right">Amount ({getDefaultCurrency()})</th>
          </tr>
        </thead>
        <tbody>
          {results.reverse().map((result, idx) => {
            const columns = result.split('|').map((each) => each.trim());
            return (
              <tr key={idx}>
                <td className="text-center">
                  {formatDate(columns[0], Format.MONTH_YEAR)}
                </td>
                <td className="text-center">
                  {columns[1].replaceAll('<', '').replaceAll('>', '')}
                </td>
                <td className="text-right">
                  {formatAmount(columns[2], false)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-8">
        <Chart
          data={{
            labels: monthItems.map((each) =>
              formatDate(each.split('|')[0], Format.MONTH_YEAR)
            ),
            datasets: [
              {
                label: 'Monthly',
                data: monthItems.map((each) =>
                  each.split('|')[2].split(' ')[1].replaceAll(',', '')
                ),
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

export default Monthly;
