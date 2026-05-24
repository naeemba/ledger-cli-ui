import { getCashFlow } from '@/features/monthlyComparison/MonthlyComparison.utils';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { cashFlowRowsToCsv } from '@/lib/monthly/csv';
import { getBaseCurrency } from '@/lib/settings';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const rows = await getCashFlow(base);
    return csvDownload(cashFlowRowsToCsv(rows, base), 'cash-flow');
  } catch (e) {
    console.error('monthly export failed', e);
    return NextResponse.json(
      { error: 'Could not export cash flow' },
      { status: 500 }
    );
  }
}
