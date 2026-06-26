import { requireUser } from '@/lib/auth/require-user';
import { balanceRowsToCsv } from '@/lib/balance/csv';
import { parseBalanceRows } from '@/lib/balance/parse';
import { csvDownload } from '@/lib/csv';
import { createLogger } from '@/lib/log';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODateStrict } from '@/utils/date';
import runLedger from '@/utils/runLedger';
import { type NextRequest, NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

const buildArgs = (
  currency: string,
  start?: string,
  end?: string
): string[] => {
  const args = [
    'balance',
    'Assets',
    'Liabilities',
    '-X',
    currency,
    '--format',
    '%A|%T\n',
  ];
  if (start) args.push('-b', start);
  if (end) args.push('-e', end);
  return args;
};

export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
  const sp = req.nextUrl.searchParams;

  try {
    const start = parseISODateStrict(sp.get('start'));
    const end = parseISODateStrict(sp.get('end'));
    const base = await getBaseCurrency();
    const stdout = await runLedger(buildArgs(base, start, end));
    return csvDownload(
      balanceRowsToCsv(parseBalanceRows(stdout), base),
      'balance'
    );
  } catch (e) {
    if (e instanceof RangeError) {
      return NextResponse.json(
        { error: 'Invalid date range' },
        { status: 400 }
      );
    }
    log.error({ err: e }, 'balance export failed');
    return NextResponse.json(
      { error: 'Could not export balance' },
      { status: 500 }
    );
  }
}
