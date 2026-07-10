import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { createLogger } from '@/lib/log';
import { payeeRowsToCsv } from '@/lib/payees/csv';
import { parsePayeeRows } from '@/lib/payees/parse';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODateStrict } from '@/utils/date';
import runLedger from '@/utils/runLedger';
import { type NextRequest, NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
  const sp = req.nextUrl.searchParams;

  try {
    const start = parseISODateStrict(sp.get('start'));
    const end = parseISODateStrict(sp.get('end'));
    const base = await getBaseCurrency();
    // One converted row per payee, sorted descending, via ledger itself —
    // matches the Payees page and dodges the -X register segfault. See #5.
    const args = [
      'reg',
      '^Expenses',
      '-X',
      base,
      '--by-payee',
      '--collapse',
      '--sort',
      '-display_amount',
      '--format',
      'NNN%P|%t\n',
    ];
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
    log.error({ err: e }, 'payees export failed');
    return NextResponse.json(
      { error: 'Could not export payees' },
      { status: 500 }
    );
  }
}
