import { parseReconcileRows } from '@/features/reconcile/Reconcile.utils';
import { registerFormat } from '@/features/transactions/row/registerRows';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { createLogger } from '@/lib/log';
import { reconcileRowsToCsv } from '@/lib/reconcile/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    // Oldest-first from ledger; parseReconcileRows no longer re-sorts.
    const stdout = await runLedger(
      [
        'reg',
        '--uncleared',
        '-X',
        base,
        '--sort',
        'date',
        '--format',
        registerFormat(['%D', '%P', '%A', '%t']),
      ],
      { sortByDate: false }
    );
    return csvDownload(
      reconcileRowsToCsv(parseReconcileRows(stdout), base),
      'reconcile'
    );
  } catch (e) {
    log.error({ err: e }, 'reconcile export failed');
    return NextResponse.json(
      { error: 'Could not export reconcile rows' },
      { status: 500 }
    );
  }
}
