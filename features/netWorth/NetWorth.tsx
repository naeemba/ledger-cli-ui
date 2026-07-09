import Chart from '@/components/Chart';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { Card, CardContent } from '@/components/ui/card';
import { parseNetWorthRows } from '@/lib/netWorth/parse';
import { getBaseCurrency } from '@/lib/settings';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import runLedger from '@/utils/runLedger';

const MONTHS_BACK = 36;

const NetWorth = async () => {
  const currency = await getBaseCurrency();
  const stdout = await runLedger(
    [
      'reg',
      '^Assets',
      '^Liabilities',
      '--monthly',
      '-X',
      currency,
      '--format',
      'NNN%D|%T\n',
    ],
    { sortByDate: false }
  );

  const rows = parseNetWorthRows(stdout).slice(-MONTHS_BACK);
  const labels = rows.map((r) => formatDate(r.date, Format.SHORT_MONTH_YEAR));
  const data = rows.map((r) => r.value);

  // Preserve the raw amount string (`"<CCY> <comma-grouped>"`) for the last
  // row so `formatAmount` renders the "Current" total identically to before.
  const rawAmounts = stdout
    .split('NNN')
    .map((line) => line.split('|').map((s) => s.trim()))
    .filter(([date, amount]) => date && amount)
    .map(([, amount]) => amount);
  const latest = rawAmounts[rawAmounts.length - 1] ?? '';

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Net Worth</h1>
            <Help label="About net worth">
              Total of all Assets plus all Liabilities at the end of each month,
              converted to your default currency. Liabilities are recorded as
              negative, so this number rises as you save and falls as you take
              on debt.
            </Help>
            <ExportButton href="/api/net-worth/export" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Trend over the last {MONTHS_BACK} months
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Current
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(latest, true)}
          </div>
        </div>
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No data
            </div>
          ) : (
            <Chart
              type="area"
              data={labels.map((month, i) => ({ month, netWorth: data[i] }))}
              xKey="month"
              series={[
                {
                  key: 'netWorth',
                  label: `Net worth (${currency.toUpperCase()})`,
                  color: 'var(--chart-2)',
                },
              ]}
              showLegend={false}
              height={320}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default NetWorth;
