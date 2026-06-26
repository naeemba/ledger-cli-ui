import { getCashFlow } from '@/features/monthlyComparison/MonthlyComparison.utils';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { createLogger } from '@/lib/log';
import { cashFlowRowsToCsv } from '@/lib/monthly/csv';
import { getBaseCurrency } from '@/lib/settings';
import { NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const rows = await getCashFlow(base);
    return csvDownload(cashFlowRowsToCsv(rows, base), 'cash-flow');
  } catch (e) {
    log.error({ err: e }, 'monthly export failed');
    return NextResponse.json(
      { error: 'Could not export cash flow' },
      { status: 500 }
    );
  }
}
