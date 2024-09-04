import { exec } from 'child_process';
import dayjs from 'dayjs';
import { promisify } from 'util';
import Chart from '@/components/Chart';
import DateFilter from '@/components/DateFilter';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getRandomColor from '@/utils/getRandomColor';

const execPromise = promisify(exec);

const PeriodBalance = async ({
  params,
}: {
  params: { from: string; to: string };
}) => {
  const from = dayjs(params.from);
  const to = dayjs(params.to);
  const defaultCurrency = getDefaultCurrency();
  const { stdout } = await execPromise(
    `ledger bal Expenses -b "${from.format('YYYY-MM-DD')}" -e "${to.format('YYYY-MM-DD')}" -X ${defaultCurrency} --format "NNN%A|%t\n"`
  );
  const results = stdout
    .split('NNN')
    .filter(Boolean)
    .filter((each) => each.split('|')[1].split('\n')[0] !== '0');
  const colors = results.map(() => getRandomColor(0.8, 1));

  return (
    <div>
      <DateFilter
        urlPattern="/balance/{from}/{to}"
        from={params.from}
        to={params.to}
      />
      <table className="w-full mt-8">
        <thead>
          <tr className="h-10">
            <td>Account</td>
            <td className="text-right">Spend ({defaultCurrency})</td>
          </tr>
        </thead>
        <tbody>
          {results.map((item, index) => {
            const columns = item.split('|');
            return (
              <tr key={index}>
                <td>{columns[0]}</td>
                <td className="text-right">{columns[1].split(' ')[1]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-8">
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
    </div>
  );
};

export default PeriodBalance;
