import { exec } from 'child_process';
import dayjs from 'dayjs';
import { promisify } from 'util';
import Chart from '@/components/Chart';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getLedgerCommand from '@/utils/getLedgerCommand';
import getRandomColor from '@/utils/getRandomColor';

const execPromise = promisify(exec);

const Monthly = async ({ params }: { params: { account: string } }) => {
  const defaultCurrency = getDefaultCurrency();
  const account = decodeURIComponent(params.account);
  const ledgerCommand = getLedgerCommand();
  const { stdout } = await execPromise(
    `${ledgerCommand} register ${account} --format 'NNN%D|%t' -M`
  );
  const { stdout: balance } = await execPromise(
    `${ledgerCommand} balance ${account} -X ${defaultCurrency} --format '%T'`
  );
  const results = stdout.split('NNN').filter(Boolean);
  const colors = results.map(() => getRandomColor(0.8, 1));
  return (
    <div>
      <div className="flex">
        <h1 className="text-3xl font-bold">{account}</h1>
        <h1 className="text-3xl font-bold ml-auto">
          {formatAmount(balance, true)}
        </h1>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr>
            <td>Account</td>
            <td className="text-right">Balance ({defaultCurrency})</td>
          </tr>
        </thead>
        <tbody>
          {results.map((item, index) => {
            const columns = item.split('|');
            return (
              <tr key={index}>
                <td>{formatDate(columns[0], Format.MONTH_YEAR)}</td>
                <td className="text-right">
                  {formatAmount(columns[1], false)}
                </td>
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
