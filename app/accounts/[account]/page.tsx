import { exec } from 'child_process';
import { promisify } from 'util';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getLedgerCommand from '@/utils/getLedgerCommand';

const execPromise = promisify(exec);

const Account = async ({ params }: { params: { account: string } }) => {
  const defaultCurrency = getDefaultCurrency();
  const account = decodeURIComponent(params.account);
  const ledgerCommand = getLedgerCommand({ sortByDate: false });
  const { stdout } = await execPromise(
    `${ledgerCommand} register ${account} --format 'NNN%D|%A|%P|%N|%X|%B|%C|%t|%T'`
  );
  const { stdout: balance } = await execPromise(
    `${ledgerCommand} balance ${account} -X ${defaultCurrency} --format '%T'`
  );
  const results = stdout.split('NNN').filter(Boolean);
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
            <th>Date</th>
            <th>Payee</th>
            <th>Amount</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {results.reverse().map((result, idx) => {
            const columns = result.split('|').map((each) => each.trim());
            return (
              <tr key={idx}>
                <td className="text-center">
                  {formatDate(columns[0], Format.DATE)}
                </td>
                <td className="text-center">{columns[2]}</td>
                <td className="text-right">{formatAmount(columns[7], true)}</td>
                <td className="text-right pr-2 py-2">
                  {columns[8].split('\n').map((each) => (
                    <span key={each}>
                      {formatAmount(each, true)}
                      <br />
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Account;
