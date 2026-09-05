import { getPersonDebts } from './getPersonDebts';
import { directionClass } from './parse';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import LedgerErrorCard from '@/components/LedgerErrorCard';
import PageContainer from '@/components/PageContainer';
import { TableScroll } from '@/components/ui/table';
import { createLogger } from '@/lib/log';
import { getBaseCurrency } from '@/lib/settings';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

const log = createLogger('debts');

const Debts = async () => {
  const base = await getBaseCurrency();
  let debts;
  try {
    debts = await getPersonDebts(base);
  } catch (e) {
    // redirect() and the prerender bailout signal by throwing; re-throw those
    // so a signed-out user reaches /sign-in instead of a "ledger broke" card.
    unstable_rethrow(e);
    log.error({ err: e }, 'failed to load debts');
    return <LedgerErrorCard what="debts" />;
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
                      <Link
                        href={`/debts/${encodeURIComponent(debt.person)}`}
                        className="text-fg hover:underline"
                      >
                        {debt.person}
                      </Link>
                      <span
                        className={`ml-2 text-xs ${directionClass(debt.direction)}`}
                      >
                        {debt.direction === 'owes-you' ? 'owes you' : 'you owe'}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap text-right tabular-nums ${directionClass(debt.direction)}`}
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
