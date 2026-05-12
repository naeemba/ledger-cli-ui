import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';
import isValidAccount from '@/utils/validateAccount';
import { notFound } from 'next/navigation';

const Account = async ({
  params,
}: {
  params: Promise<{ account: string }>;
}) => {
  const defaultCurrency = getDefaultCurrency() ?? 'USD';
  const { account: accountParam } = await params;
  const account = decodeURIComponent(accountParam);
  if (!isValidAccount(account)) notFound();

  const stdout = await runLedger(
    ['register', account, '--format', 'NNN%D|%A|%P|%N|%X|%B|%C|%t|%T'],
    { sortByDate: false }
  );
  const balance = await runLedger(
    ['balance', account, '-X', defaultCurrency, '--format', '%T'],
    { sortByDate: false }
  );
  const results = stdout.split('NNN').filter(Boolean);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Account
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-all">
            {account}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Balance
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(balance, true)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  No transactions
                </td>
              </tr>
            ) : (
              [...results].reverse().map((result, idx) => {
                const columns = result.split('|').map((each) => each.trim());
                return (
                  <tr key={idx}>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(columns[0], Format.DATE)}
                    </td>
                    <td>{columns[2]}</td>
                    <td className="text-right">
                      {formatAmount(columns[7], true)}
                    </td>
                    <td className="text-right">
                      {columns[8].split('\n').map((each, i) => (
                        <div key={i}>{formatAmount(each, true)}</div>
                      ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Account;
