import { requireUser } from '@/lib/auth/require-user';
import { balanceRowsToCsv } from '@/lib/balance/csv';
import { parseBalanceRows } from '@/lib/balance/parse';
import { csvDownload } from '@/lib/csv';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODate, toISODate } from '@/utils/date';
import runLedger from '@/utils/runLedger';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const parseDateParam = (raw: string): string => {
  const parsed = parseISODate(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Invalid date: ${raw}`);
  }
  return toISODate(parsed);
};

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
  if (start) args.push('-b', parseDateParam(start));
  if (end) args.push('-e', parseDateParam(end));
  return args;
};

export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;

  try {
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
    console.error('balance export failed', e);
    return NextResponse.json(
      { error: 'Could not export balance' },
      { status: 500 }
    );
  }
}
