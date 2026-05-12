import Chart from '@/components/Chart';
import Help from '@/components/Help';
import formatAmount from '@/utils/formatAmount';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';

const MONTHS_BACK = 36;

const parseAmount = (raw: string): number => {
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', ''));
};

const NetWorth = async () => {
  const currency = getDefaultCurrency() ?? 'USD';
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

  const allRows = stdout
    .split('NNN')
    .map((line) => line.split('|').map((s) => s.trim()))
    .filter(([date, amount]) => date && amount);
  const rows = allRows.slice(-MONTHS_BACK);

  const labels = rows.map(([date]) =>
    formatDate(date, Format.SHORT_MONTH_YEAR)
  );
  const data = rows.map(([, amount]) => parseAmount(amount));

  const latest = rows[rows.length - 1]?.[1] ?? '';

  return (
    <div className="flex flex-col gap-6">
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
          </div>
          <p className="mt-1 text-sm text-muted">
            Trend over the last {MONTHS_BACK} months
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Current
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(latest, true)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-muted">No data</div>
        ) : (
          <Chart
            type="line"
            data={{
              labels,
              datasets: [
                {
                  label: `Net worth (${currency.toUpperCase()})`,
                  data,
                  fill: true,
                  borderColor: 'rgb(5, 150, 105)',
                  backgroundColor: 'rgba(5, 150, 105, 0.12)',
                  tension: 0.3,
                  pointRadius: 2,
                  pointHoverRadius: 4,
                },
              ],
            }}
          />
        )}
      </div>
    </div>
  );
};

export default NetWorth;
