import Help from '@/components/Help';
import formatAmount from '@/utils/formatAmount';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const Debts = async () => {
  const defaultCurrency = getDefaultCurrency() ?? 'USD';
  const stdout = await runLedger([
    'balance',
    '-X',
    defaultCurrency,
    'Assets:Credited',
    '--format',
    'NNN%A|%T',
  ]);
  const allDebts = stdout.split('NNN').filter((each) => each?.length);
  const total = allDebts[allDebts.length - 1] ?? '';
  const debts = allDebts.slice(1, allDebts.length - 1);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Debts</h1>
            <Help label="About debts">
              Outstanding amounts tracked under
              <code> Assets:Credited</code>. A positive balance means someone
              owes you, a negative balance means you owe them.
            </Help>
          </div>
          <p className="mt-1 text-sm text-muted">Outstanding credit by payee</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Total
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(total.split('|')[1] ?? '', true)}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Payee</th>
              <th className="text-right">
                Amount ({defaultCurrency.toUpperCase()})
              </th>
            </tr>
          </thead>
          <tbody>
            {debts.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted">
                  No debts
                </td>
              </tr>
            ) : (
              debts.map((debt, idx) => {
                const columns = debt.split('|').map((each) => each.trim());
                return (
                  <tr key={idx}>
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

export default Debts;
