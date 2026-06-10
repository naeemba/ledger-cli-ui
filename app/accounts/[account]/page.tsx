import AccountHeader from '@/features/accounts/AccountHeader';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency } from '@/lib/settings';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';
import isValidAccount from '@/utils/validateAccount';
import { notFound } from 'next/navigation';

const Account = async ({
  params,
}: {
  params: Promise<{ account: string }>;
}) => {
  const user = await requireUser();
  const existingViewNames = (await savedViewService.list(user.id)).map(
    (v) => v.name
  );
  const defaultCurrency = await getBaseCurrency();
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
      <AccountHeader
        account={account}
        balance={balance}
        existingViewNames={existingViewNames}
      />

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
