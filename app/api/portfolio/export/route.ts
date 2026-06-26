import { mergePortfolio } from '@/features/portfolio/parsePortfolio';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { env } from '@/lib/env';
import { createLogger } from '@/lib/log';
import { portfolioRowsToCsv } from '@/lib/portfolio/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  const prefix = env.PORTFOLIO_ACCOUNT_PREFIX;

  try {
    const base = await getBaseCurrency();
    const [nativeStdout, convertedStdout] = await Promise.all([
      runLedger(['balance', prefix, '--flat', '--format', '%A|%T\n']),
      runLedger([
        'balance',
        prefix,
        '-X',
        base,
        '--flat',
        '--format',
        '%A|%T\n',
      ]),
    ]);
    const rows = mergePortfolio(nativeStdout, convertedStdout);
    return csvDownload(portfolioRowsToCsv(rows, base), 'portfolio');
  } catch (e) {
    log.error({ err: e }, 'portfolio export failed');
    return NextResponse.json(
      { error: 'Could not export portfolio' },
      { status: 500 }
    );
  }
}
