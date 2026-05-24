import { requireUser } from '@/lib/auth/require-user';
import { parseBalanceRows } from '@/lib/balance/parse';
import { csvDownload } from '@/lib/csv';
import { debtsRowsToCsv } from '@/lib/debts/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      'Assets:Credited',
      '-X',
      base,
      '--format',
      '%A|%T\n',
    ]);
    // Drop the parser's "Total" row — the debts page renders it separately and
    // the export keeps per-account rows only.
    const rows = parseBalanceRows(stdout).filter((r) => r.account !== 'Total');
    return csvDownload(debtsRowsToCsv(rows, base), 'debts');
  } catch (e) {
    console.error('debts export failed', e);
    return NextResponse.json(
      { error: 'Could not export debts' },
      { status: 500 }
    );
  }
}
