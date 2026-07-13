import { getPersonDebts } from '@/features/debts';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { debtsRowsToCsv } from '@/lib/debts/csv';
import { createLogger } from '@/lib/log';
import { getBaseCurrency } from '@/lib/settings';
import { NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const debts = await getPersonDebts(base);
    return csvDownload(debtsRowsToCsv(debts, base), 'debts');
  } catch (e) {
    log.error({ err: e }, 'debts export failed');
    return NextResponse.json(
      { error: 'Could not export debts' },
      { status: 500 }
    );
  }
}
