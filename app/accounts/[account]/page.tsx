import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const Account = async ({ params }: { params: { account: string } }) => {
  const account = decodeURIComponent(params.account);
  const { stdout } = await execPromise(
    `ledger register ${account} --format '%-12(date)|%-20(payee)|%12(amount)|%12(total)\n'`
  );
  const results = stdout.split('\n').filter(Boolean);
  return (
    <table className="w-full">
      <thead>
        <tr className="h-10">
          <th>Date</th>
          <th>Payee</th>
          <th>Amount</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => {
          const columns = result.split('|').map((each) => each.trim());
          return (
            <tr
              key={result}
              className="h-10 even:bg-[#020617] odd:bg-[#0f172a]"
            >
              <td className="text-center">{columns[0]}</td>
              <td className="text-center">{columns[1]}</td>
              <td className="text-right">{columns[2]}</td>
              <td className="text-right pr-2">{columns[3]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default Account;
