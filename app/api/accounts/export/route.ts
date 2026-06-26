import { accountsRowsToCsv } from '@/lib/accounts/csv';
import { requireUser } from '@/lib/auth/require-user';
import { parseBalanceRows } from '@/lib/balance/parse';
import { csvDownload } from '@/lib/csv';
import { createLogger } from '@/lib/log';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      '--flat',
      '--no-total',
      '-X',
      base,
      '--format',
      '%A|%T\n',
    ]);
    const rows = parseBalanceRows(stdout).filter((r) => r.account !== 'Total');
    return csvDownload(accountsRowsToCsv(rows, base), 'accounts');
  } catch (e) {
    log.error({ err: e }, 'accounts export failed');
    return NextResponse.json(
      { error: 'Could not export accounts' },
      { status: 500 }
    );
  }
}
