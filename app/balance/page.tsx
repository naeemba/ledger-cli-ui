import { exec } from 'child_process';
import { promisify } from 'util';
import formatAmount from '@/utils/formatAmount';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getLedgerCommand from '@/utils/getLedgerCommand';

const execPromise = promisify(exec);

const Balance = async () => {
  const defaultCurrency = getDefaultCurrency();
  const { stdout } = await execPromise(
    `${getLedgerCommand()} balance Assets Liabilities -X ${defaultCurrency} --format='%A|%T\n'`
  );
  const result = stdout.split('\n').filter(Boolean);
  const total = [...result].reverse()[0].split('|')[1];
  return (
    <div>
      <div className="flex">
        <h1 className="text-3xl font-bold">Total</h1>
        <h1 className="text-3xl font-bold ml-auto">{total}</h1>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr>
            <td>Account</td>
            <td>Balance&nbsp;({defaultCurrency?.toUpperCase()})</td>
          </tr>
        </thead>
        <tbody>
          {result.map((item, index) => {
            const columns = item.split('|');
            return (
              <tr key={index}>
                <td>{columns[0]}</td>
                <td>{formatAmount(columns[1], false)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Balance;
