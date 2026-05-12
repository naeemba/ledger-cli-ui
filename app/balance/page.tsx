import formatAmount from '@/utils/formatAmount';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const Balance = async () => {
  const defaultCurrency = getDefaultCurrency() ?? 'USD';
  const stdout = await runLedger([
    'balance',
    'Assets',
    'Liabilities',
    '-X',
    defaultCurrency,
    '--format',
    '%A|%T\n',
  ]);
  const result = stdout.split('\n').filter(Boolean);
  const total = [...result].reverse()[0]?.split('|')[1] ?? '';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Balance</h1>
          <p className="mt-1 text-sm text-muted">Assets & liabilities</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Total
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(total, true)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="text-right">
                Balance ({defaultCurrency.toUpperCase()})
              </th>
            </tr>
          </thead>
          <tbody>
            {result.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted">
                  No data
                </td>
              </tr>
            ) : (
              result.map((item, index) => {
                const columns = item.split('|');
                return (
                  <tr key={index}>
                    <td>
                      <Link
                        className="block text-fg hover:text-accent"
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Balance;
