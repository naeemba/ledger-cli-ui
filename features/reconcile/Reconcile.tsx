import { parseReconcileRows } from './Reconcile.utils';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import { getBaseCurrency } from '@/lib/settings';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const STALE_DAYS = 30;

const Reconcile = async () => {
  const currency = await getBaseCurrency();
  const stdout = await runLedger(
    ['reg', '--uncleared', '-X', currency, '--format', 'NNN%D|%P|%A|%t\n'],
    { sortByDate: false }
  );

  const rows = parseReconcileRows(stdout);

  const stale = rows.filter((r) => r.days > STALE_DAYS).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Reconcile</h1>
            <Help label="About reconcile">
              Uncleared postings sorted by age, oldest first. A posting stays
              uncleared until you mark it with <code>*</code> (cleared) in your
              journal. Stale entries often indicate a forgotten import or an
              unreconciled bank statement.
            </Help>
            <ExportButton href="/api/reconcile/export" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} uncleared posting{rows.length === 1 ? '' : 's'}
            {stale > 0 && (
              <span className="text-negative">
                {' '}
                — {stale} older than {STALE_DAYS} days
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Age</th>
              <th>Payee</th>
              <th>Account</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  Nothing to reconcile
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {formatDate(row.date, Format.DATE)}
                  </td>
                  <td
                    className={`text-right tabular-nums ${row.days > STALE_DAYS ? 'text-negative' : 'text-muted-foreground'}`}
                  >
                    {row.days}d
                  </td>
                  <td>{row.payee || '—'}</td>
                  <td>
                    <Link
                      className="text-fg hover:text-accent"
                      href={`/accounts/${encodeURIComponent(row.account)}`}
                    >
                      {row.account}
                    </Link>
                  </td>
                  <td className="text-right">
                    {formatAmount(row.amount, true)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reconcile;
