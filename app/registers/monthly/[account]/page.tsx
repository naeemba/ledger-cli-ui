import { exec } from 'child_process';
import dayjs from 'dayjs';
import { promisify } from 'util';
import Chart from '@/components/Chart';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getRandomColor from '@/utils/getRandomColor';

const execPromise = promisify(exec);

const Monthly = async ({ params }: { params: { account: string } }) => {
  const defaultCurrency = getDefaultCurrency();
  const account = decodeURIComponent(params.account);
  const { stdout } = await execPromise(
    `ledger register ${account} --format 'NNN%D|%t' -M`
  );
  const { stdout: balance } = await execPromise(
    `ledger balance ${account} -X ${defaultCurrency} --format '%T'`
  );
  const results = stdout.split('NNN').filter(Boolean);
  const colors = results.map(() => getRandomColor(0.8, 1));
  return (
    <div>
      <div className="flex">
        <h1 className="text-3xl font-bold">{account}</h1>
        <h1 className="text-3xl font-bold ml-auto">{balance}</h1>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr className="h-10">
            <td>Account</td>
            <td className="text-right">Balance ({defaultCurrency})</td>
          </tr>
        </thead>
        <tbody>
          {results.map((item, index) => {
            const columns = item.split('|');
            const date = dayjs(columns[0]);
            return (
              <tr key={index}>
                <td>{date.format('MMM YYYY')}</td>
                <td className="text-right">{columns[1].split(' ')[1]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div>
        <Chart
          data={{
            labels: results.map((each) =>
              dayjs(each.split('|')[0]).format('MMM YYYY')
            ),
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

export default Monthly;
