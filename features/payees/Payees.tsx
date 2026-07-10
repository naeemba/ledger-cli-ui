import Chart from '@/components/Chart';
import DateFilter from '@/components/DateFilter';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { Card, CardContent } from '@/components/ui/card';
import { TableScroll } from '@/components/ui/table';
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import { requireUser } from '@/lib/auth/require-user';
import { parsePayeeRows } from '@/lib/payees/parse';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODate, toISODate } from '@/utils/date';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';

const TOP_N = 15;

const formatNumber = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type Props = {
  from: string;
  to: string;
};

const Payees = async ({ from: fromParam, to: toParam }: Props) => {
  const currency = (await getBaseCurrency()).toUpperCase();
  const from = parseISODate(fromParam);
  const to = parseISODate(toParam);
  const user = await requireUser();
  const existingViewNames = await savedViewService.listNames(user.id);
  const currentPath = `/payees/${fromParam}/${toParam}`;
  // `--by-payee --collapse` makes ledger emit one converted row per payee;
  // `--sort '-display_amount'` ranks them descending by converted value. This
  // replaces JS-side summing/sorting and avoids the plain-register variant that
  // segfaults ledger 3.4.1 under `-X`. See LEDGER-AUDIT.md #5.
  const stdout = await runLedger(
    [
      'reg',
      '^Expenses',
      '-b',
      toISODate(from),
      '-e',
      toISODate(to),
      '-X',
      currency,
      '--by-payee',
      '--collapse',
      '--sort',
      '-display_amount',
      '--format',
      'NNN%P|%t\n',
    ],
    { sortByDate: false }
  );

  const sorted = parsePayeeRows(stdout).slice(0, TOP_N);
  const grandTotal = sorted.reduce((acc, r) => acc + r.total, 0);

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Payees</h1>
            <Help label="About payees">
              Top {TOP_N} payees by expense amount in the chosen period.
              Aggregates every <code>Expenses:*</code> posting by payee and
              ranks them. Useful for &ldquo;where is the money actually
              going?&rdquo;
            </Help>
            <ExportButton
              href={`/api/payees/export?start=${fromParam}&end=${toParam}`}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(from.toISOString(), Format.DATE)} –{' '}
            {formatDate(to.toISOString(), Format.DATE)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Top {sorted.length} total
          </div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatNumber(grandTotal)}{' '}
            <span className="text-base font-normal text-muted-foreground">
              {currency}
            </span>
          </div>
        </div>
      </div>

      <DateFilter
        urlPattern="/payees/{from}/{to}"
        from={fromParam}
        to={toParam}
        saveViewSlot={
          <SaveViewButton
            targetPath={currentPath}
            existingNames={existingViewNames}
          />
        }
      />

      <Card className="gap-0 overflow-hidden p-0">
        <TableScroll bleed={false}>
          <table>
            <thead>
              <tr>
                <th>Payee</th>
                <th className="text-right whitespace-nowrap">
                  Total ({currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No payee data in this period
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.payee}>
                    <td>{r.payee}</td>
                    <td className="text-right tabular-nums whitespace-nowrap text-negative">
                      {formatNumber(r.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {sorted.length > 0 && (
        <Card>
          <CardContent>
            <Chart
              type="bar"
              data={sorted.map((r) => ({ payee: r.payee, total: r.total }))}
              xKey="payee"
              series={[
                {
                  key: 'total',
                  label: `Total spend (${currency})`,
                  color: 'var(--chart-3)',
                },
              ]}
              showLegend={false}
              height={320}
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};

export default Payees;
