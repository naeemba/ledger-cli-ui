import { Briefcase } from 'lucide-react';
import 'server-only';
import {
  extractTotal,
  mergePortfolio,
  type PortfolioRow,
} from './parsePortfolio';
import Help from '@/components/Help';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { env } from '@/lib/env';
import { getBaseCurrency } from '@/lib/settings';
import { cn } from '@/lib/utils';
import formatAmount from '@/utils/formatAmount';
import runLedger from '@/utils/runLedger';
import Link from 'next/link';

const Portfolio = async () => {
  const defaultCurrency = await getBaseCurrency();
  const prefix = env.PORTFOLIO_ACCOUNT_PREFIX;

  // `--flat` keeps the rollup hierarchy from interleaving sub-account totals
  // with the leaf rows we want to display.
  const [nativeStdout, convertedStdout] = await Promise.all([
    runLedger(['balance', prefix, '--flat', '--format', '%A|%T\n']),
    runLedger([
      'balance',
      prefix,
      '-X',
      defaultCurrency,
      '--flat',
      '--format',
      '%A|%T\n',
    ]),
  ]);

  const rows: PortfolioRow[] = mergePortfolio(nativeStdout, convertedStdout);
  const total = extractTotal(convertedStdout);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <Help label="About portfolio">
            Per-account holdings under <code>{prefix}</code> in their native
            commodities, plus the value converted to your default currency.
          </Help>
        </header>
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <Briefcase className="h-6 w-6 opacity-50" />
          <div className="text-base font-medium">No investments tracked</div>
          <p className="max-w-md text-sm text-muted-foreground">
            Nothing found under <code>{prefix}</code>. Set the{' '}
            <code>PORTFOLIO_ACCOUNT_PREFIX</code> env var if your journal uses a
            different account tree.
          </p>
          <Link
            href="/transactions/new"
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            Add a transaction
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
            <Help label="About portfolio">
              Per-account holdings under <code>{prefix}</code> in their native
              commodities, plus the value converted to your default currency.
              Prices come from your <code>price-db.ledger</code> if you have
              one; missing prices show a blank converted column.
            </Help>
          </div>
          <p className="mt-1 text-sm text-muted">
            <code>{prefix}</code>
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Total ({defaultCurrency.toUpperCase()})
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(total, true)}
          </div>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="text-right">Native</th>
              <th className="text-right">
                Value ({defaultCurrency.toUpperCase()})
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.account}>
                <td>
                  <Link
                    className="block text-fg hover:text-accent"
                    href={`/accounts/${encodeURIComponent(row.account)}`}
                  >
                    {row.account}
                  </Link>
                </td>
                <td className="text-right">{formatAmount(row.native, true)}</td>
                <td className="text-right">
                  {row.converted ? (
                    formatAmount(row.converted, true)
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default Portfolio;
