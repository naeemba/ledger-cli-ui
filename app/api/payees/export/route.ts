import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { payeeRowsToCsv } from '@/lib/payees/csv';
import { parsePayeeRows } from '@/lib/payees/parse';
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
    const base = await getBaseCurrency();
    const args = ['reg', '^Expenses', '-X', base, '--format', 'NNN%P|%t\n'];
    if (start) args.push('-b', start);
    if (end) args.push('-e', end);
    const stdout = await runLedger(args);
    return csvDownload(payeeRowsToCsv(parsePayeeRows(stdout), base), 'payees');
  } catch (e) {
    if (e instanceof RangeError) {
      return NextResponse.json(
        { error: 'Invalid date range' },
        { status: 400 }
      );
    }
    console.error('payees export failed', e);
    return NextResponse.json(
      { error: 'Could not export payees' },
      { status: 500 }
    );
  }
}
