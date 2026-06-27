import { TableScroll } from '@/components/ui/table';
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
  const existingViewNames = await savedViewService.listNames(user.id);
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
  const rows = [...results]
    .reverse()
    .map((result) => result.split('|').map((each) => each.trim()));
  return (
    <div className="flex flex-col gap-6">
      <AccountHeader
        account={account}
        balance={balance}
        existingViewNames={existingViewNames}
      />

      {/* Mobile: stacked card rows. Multi-currency totals make the 4-col table
          too wide for a phone, so reflow to a readable stack below md. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 ? (
          <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted shadow-sm">
            No transactions
          </li>
        ) : (
          rows.map((columns, idx) => (
            <li
              key={idx}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-medium">
                  {columns[2]}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                  {formatDate(columns[0], Format.DATE)}
                </span>
              </div>
              <dl className="mt-3 flex flex-col gap-1 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    Amount
                  </dt>
                  <dd className="text-right tabular-nums">
                    {formatAmount(columns[7], true)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    Total
                  </dt>
                  <dd className="text-right tabular-nums">
                    {columns[8].split('\n').map((each, i) => (
                      <div key={i}>{formatAmount(each, true)}</div>
                    ))}
                  </dd>
                </div>
              </dl>
            </li>
          ))
        )}
      </ul>

      {/* Desktop: original table, scrollable inside its card for safety. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <TableScroll bleed={false}>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No transactions
                  </td>
                </tr>
              ) : (
                rows.map((columns, idx) => (
                  <tr key={idx}>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(columns[0], Format.DATE)}
                    </td>
                    <td>{columns[2]}</td>
                    <td className="text-right whitespace-nowrap">
                      {formatAmount(columns[7], true)}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {columns[8].split('\n').map((each, i) => (
                        <div key={i}>{formatAmount(each, true)}</div>
                      ))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>
    </div>
  );
};

export default Account;
