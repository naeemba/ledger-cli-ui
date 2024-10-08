import { exec } from 'child_process';
import { promisify } from 'util';
import formatAmount from '@/utils/formatAmount';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getLedgerCommand from '@/utils/getLedgerCommand';
import Link from 'next/link';

const execPromise = promisify(exec);

const Debts = async () => {
  const defaultCurrency = getDefaultCurrency();
  const { stdout } = await execPromise(
    `${getLedgerCommand()} balance -X ${defaultCurrency} Assets:Credited --format  'NNN%A|%T'`
  );
  let debts = stdout.split('NNN').filter((each) => each?.length);
  const total = debts[debts.length - 1];
  debts = debts.slice(1, debts.length - 1);
  return (
    <div>
      <div className="flex">
        <h1 className="text-3xl font-bold">Total</h1>
        <h1 className="text-3xl font-bold ml-auto">
          {formatAmount(total.split('|')[1], true)}
        </h1>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr>
            <th>Payee</th>
            <th className="text-right">
              Amount&nbsp;({defaultCurrency?.toUpperCase()})
            </th>
          </tr>
        </thead>
        <tbody>
          {debts.map((debt, idx) => {
            const columns = debt.split('|').map((each) => each.trim());
            return (
              <tr key={idx}>
                <td className="text-center">
                  <Link
                    className="py-3 px-6 block"
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
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Debts;
