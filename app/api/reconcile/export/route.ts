import { parseReconcileRows } from '@/features/reconcile/Reconcile.utils';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { reconcileRowsToCsv } from '@/lib/reconcile/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger(
      ['reg', '--uncleared', '-X', base, '--format', 'NNN%D|%P|%A|%t\n'],
      { sortByDate: false }
    );
    return csvDownload(
      reconcileRowsToCsv(parseReconcileRows(stdout), base),
      'reconcile'
    );
  } catch (e) {
    console.error('reconcile export failed', e);
    return NextResponse.json(
      { error: 'Could not export reconcile rows' },
      { status: 500 }
    );
  }
}
