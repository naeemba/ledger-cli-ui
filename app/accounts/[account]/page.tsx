import { exec } from 'child_process';
import { promisify } from 'util';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

const execPromise = promisify(exec);

const Account = async ({ params }: { params: { account: string } }) => {
  const defaultCurrency = getDefaultCurrency();
  const account = decodeURIComponent(params.account);
  const { stdout } = await execPromise(
    `ledger register ${account} --format 'NNN%D|%A|%P|%N|%X|%B|%C|%t|%T'`
  );
  const { stdout: balance } = await execPromise(
    `ledger balance ${account} -X ${defaultCurrency} --format '%T'`
  );
  const results = stdout.split('NNN').filter(Boolean);
  return (
    <div>
      <div className="flex">
        <h1 className="text-3xl font-bold">{account}</h1>
        <h1 className="text-3xl font-bold ml-auto">{balance}</h1>
      </div>
      <table className="w-full mt-8">
        <thead>
          <tr className="h-10">
            <th>Date</th>
            <th>Payee</th>
            <th>Amount</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, idx) => {
            const columns = result.split('|').map((each) => each.trim());
            return (
              <tr key={idx} className="h-10 even:bg-[#020617] odd:bg-[#0f172a]">
                <td className="text-center">{columns[0]}</td>
                <td className="text-center">{columns[2]}</td>
                <td className="text-right">{columns[7]}</td>
                <td
                  className="text-right pr-2 py-2"
                  dangerouslySetInnerHTML={{
                    __html: columns[8].replaceAll('\n', '<br />'),
                  }}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Account;
