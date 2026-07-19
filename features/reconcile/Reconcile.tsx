import { parseReconcileRows } from './Reconcile.utils';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import TransactionRow from '@/features/transactions/row/TransactionRow';
import { registerFormat } from '@/features/transactions/row/registerRows';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';

const STALE_DAYS = 30;

const Reconcile = async () => {
  const currency = await getBaseCurrency();
  // `--sort date` makes ledger emit uncleared postings oldest-first; the JS
  // re-sort is gone. `sortByDate: false` stops runLedger adding its own
  // `--sort -date` (newest-first), which would fight this.
  const stdout = await runLedger(
    [
      'reg',
      '--uncleared',
      '-X',
      currency,
      '--sort',
      'date',
      '--format',
      registerFormat(['%D', '%P', '%A', '%t']),
    ],
    { sortByDate: false }
  );

  const rows = parseReconcileRows(stdout);

  const stale = rows.filter((r) => r.days > STALE_DAYS).length;

  return (
    <PageContainer>
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

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          Nothing to reconcile
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map((row, i) => (
            <TransactionRow
              key={`${row.uid ?? 'nouid'}:${i}`}
              view={{
                date: row.date,
                payee: row.payee,
                amount: row.amount,
                account: row.account,
                age: row.days,
                uid: row.uid,
              }}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default Reconcile;
