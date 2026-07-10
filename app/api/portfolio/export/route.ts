import {
  parseNativeRows,
  parseNativeSplit,
} from '@/features/portfolio/parsePortfolio';
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
    const [nativeSplitStdout, convertedStdout] = await Promise.all([
      // Let ledger split each holding into quantity + commodity; `--no-total`
      // drops the multi-commodity rollup row that would break `quantity()`.
      runLedger([
        'balance',
        prefix,
        '--flat',
        '--no-total',
        '--format',
        '%A|%(quantity(scrub(display_total)))|%(commodity(scrub(display_total)))\n',
      ]),
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
    const converted = new Map(
      parseNativeRows(convertedStdout).map((r) => [r.account, r.raw])
    );
    const rows = parseNativeSplit(nativeSplitStdout).map((r) => ({
      account: r.account,
      commodity: r.commodity,
      quantity: r.quantity,
      value: converted.get(r.account) ?? '',
    }));
    return csvDownload(portfolioRowsToCsv(rows, base), 'portfolio');
  } catch (e) {
    log.error({ err: e }, 'portfolio export failed');
    return NextResponse.json(
      { error: 'Could not export portfolio' },
      { status: 500 }
    );
  }
}
