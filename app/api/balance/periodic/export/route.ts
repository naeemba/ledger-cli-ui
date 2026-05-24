import { requireUser } from '@/lib/auth/require-user';
import { periodicBalanceRowsToCsv } from '@/lib/balance/csvPeriodic';
import { parsePeriodicBalanceRows } from '@/lib/balance/parsePeriodic';
import { csvDownload } from '@/lib/csv';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODate, toISODate } from '@/utils/date';
import runLedger from '@/utils/runLedger';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const parseDateParam = (raw: string | null): string | undefined => {
  if (!raw) return undefined;
  const parsed = parseISODate(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Invalid date: ${raw}`);
  }
  return toISODate(parsed);
};

export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
  const sp = req.nextUrl.searchParams;

  try {
    const start = parseDateParam(sp.get('start'));
    const end = parseDateParam(sp.get('end'));
    if (!start || !end) {
      return NextResponse.json(
        { error: 'Missing start or end date' },
        { status: 400 }
      );
    }
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'bal',
      'Expenses',
      '-b',
      start,
      '-e',
      end,
      '-X',
      base,
      '--format',
      'NNN%A|%t|%T\n',
    ]);
    return csvDownload(
      periodicBalanceRowsToCsv(parsePeriodicBalanceRows(stdout), base),
      'periodic-balance'
    );
  } catch (e) {
    if (e instanceof RangeError) {
      return NextResponse.json(
        { error: 'Invalid date range' },
        { status: 400 }
      );
    }
    console.error('periodic balance export failed', e);
    return NextResponse.json(
      { error: 'Could not export periodic balance' },
      { status: 500 }
    );
  }
}
