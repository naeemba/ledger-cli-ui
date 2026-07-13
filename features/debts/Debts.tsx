import { getPersonDebts } from './getPersonDebts';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { TableScroll } from '@/components/ui/table';
import { createLogger } from '@/lib/log';
import { getBaseCurrency } from '@/lib/settings';

const log = createLogger('debts');

const Debts = async () => {
  const base = await getBaseCurrency();
  let debts;
  try {
    debts = await getPersonDebts(base);
  } catch (e) {
    log.error({ err: e }, 'failed to load debts');
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-negative shadow-sm">
        Failed to load debts from ledger.
      </div>
    );
  }

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Debts</h1>
          <Help label="About debts">
            Net balance per person across <code>Assets:Receivable</code> (money
            owed to you) and <code>Liabilities:Payable</code> (money you owe).
            People whose balances cancel out are hidden.
          </Help>
          <ExportButton href="/api/debts/export" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {debts.length} open {debts.length === 1 ? 'balance' : 'balances'}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <TableScroll bleed={false}>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th className="whitespace-nowrap text-right">
                  Net ({base.toUpperCase()})
                </th>
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No open debts
                  </td>
                </tr>
              ) : (
                debts.map((debt) => (
                  <tr key={debt.person}>
                    <td>
                      <span className="text-fg">{debt.person}</span>
                      <span
                        className={`ml-2 text-xs ${
                          debt.direction === 'owes-you'
                            ? 'text-positive'
                            : 'text-negative'
                        }`}
                      >
                        {debt.direction === 'owes-you' ? 'owes you' : 'you owe'}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap text-right tabular-nums ${
                        debt.direction === 'owes-you'
                          ? 'text-positive'
                          : 'text-negative'
                      }`}
                    >
                      {debt.amount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>
    </PageContainer>
  );
};

export default Debts;
