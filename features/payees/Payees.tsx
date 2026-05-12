import Chart from '@/components/Chart';
import DateFilter from '@/components/DateFilter';
import Help from '@/components/Help';
import { parseISODate, toISODate } from '@/utils/date';
import formatDate, { Format } from '@/utils/formatDate';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';

const TOP_N = 15;

const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', '')) || 0;
};

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
  const currency = (getDefaultCurrency() ?? 'USD').toUpperCase();
  const from = parseISODate(fromParam);
  const to = parseISODate(toParam);
  const stdout = await runLedger([
    'reg',
    '^Expenses',
    '-b',
    toISODate(from),
    '-e',
    toISODate(to),
    '-X',
    currency,
    '--format',
    'NNN%P|%t\n',
  ]);

  const totals = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [payee, amount] = line.split('|').map((s) => s.trim());
    if (!payee || !amount) continue;
    totals.set(payee, (totals.get(payee) ?? 0) + parseAmount(amount));
  }
  const sorted = Array.from(totals.entries())
    .map(([payee, total]) => ({ payee, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);

  const grandTotal = sorted.reduce((acc, r) => acc + r.total, 0);

  return (
    <div className="flex flex-col gap-6">
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
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatDate(from.toISOString(), Format.DATE)} –{' '}
            {formatDate(to.toISOString(), Format.DATE)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Top {sorted.length} total
          </div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatNumber(grandTotal)}{' '}
            <span className="text-base font-normal text-muted">{currency}</span>
          </div>
        </div>
      </div>

      <DateFilter
        urlPattern="/payees/{from}/{to}"
        from={fromParam}
        to={toParam}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table>
          <thead>
            <tr>
              <th>Payee</th>
              <th className="text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted">
                  No payee data in this period
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.payee}>
                  <td>{r.payee}</td>
                  <td className="text-right tabular-nums text-negative">
                    {formatNumber(r.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Chart
            data={{
              labels: sorted.map((r) => r.payee),
              datasets: [
                {
                  label: 'Total spend',
                  data: sorted.map((r) => r.total),
                  backgroundColor: 'rgba(220, 38, 38, 0.7)',
                  borderColor: 'rgb(220, 38, 38)',
                },
              ],
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Payees;
