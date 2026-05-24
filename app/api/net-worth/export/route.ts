import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { netWorthRowsToCsv } from '@/lib/netWorth/csv';
import { parseNetWorthRows } from '@/lib/netWorth/parse';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger(
      [
        'reg',
        '^Assets',
        '^Liabilities',
        '--monthly',
        '-X',
        base,
        '--format',
        'NNN%D|%T\n',
      ],
      { sortByDate: false }
    );
    return csvDownload(
      netWorthRowsToCsv(parseNetWorthRows(stdout), base),
      'net-worth'
    );
  } catch (e) {
    console.error('net-worth export failed', e);
    return NextResponse.json(
      { error: 'Could not export net worth' },
      { status: 500 }
    );
  }
}
