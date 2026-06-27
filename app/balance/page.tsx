import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import { Card } from '@/components/ui/card';
import { TableScroll } from '@/components/ui/table';
import { parseBalanceRows } from '@/lib/balance/parse';
import { getBaseCurrency } from '@/lib/settings';
import formatAmount from '@/utils/formatAmount';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const Balance = async () => {
  const defaultCurrency = await getBaseCurrency();
  const stdout = await runLedger([
    'balance',
    'Assets',
    'Liabilities',
    '-X',
    defaultCurrency,
    '--format',
    '%A|%T\n',
  ]);
  const rows = parseBalanceRows(stdout);
  const total = rows.find((r) => r.account === 'Total')?.amount ?? '';
  const result = rows
    .filter((r) => r.account !== 'Total')
    .map((r) => `${r.account}|${r.amount}`);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Balance</h1>
            <Help label="About the balance report">
              Current point-in-time balance for every Assets and Liabilities
              account, converted to your default currency. Click an account to
              drill into its transactions.
            </Help>
          </div>
          <p className="mt-1 text-sm text-muted">Assets & liabilities</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              Total
            </div>
            <div className="text-2xl font-semibold tracking-tight">
              {formatAmount(total, true)}
            </div>
          </div>
          <ExportButton href="/api/balance/export" />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <TableScroll bleed={false}>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th className="text-right whitespace-nowrap">
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
                      <td className="text-right whitespace-nowrap">
                        {formatAmount(columns[1], false)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>
    </div>
  );
};

export default Balance;
