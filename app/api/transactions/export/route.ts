import {
  applyTransactionFilters,
  type TransactionFilters,
} from '@/features/transactions/applyTransactionFilters';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { journalService } from '@/lib/journal';
import { createLogger } from '@/lib/log';
import { transactionsToCsv } from '@/lib/transactions/csv';
import { type NextRequest, NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;
  const filters: TransactionFilters = {
    start: sp.get('start') ?? undefined,
    end: sp.get('end') ?? undefined,
    account: sp.get('account') ?? undefined,
    payee: sp.get('payee') ?? undefined,
    q: sp.get('q') ?? undefined,
  };

  try {
    const { transactions } = await journalService.listTransactions(user.id);
    const filtered = applyTransactionFilters(transactions, filters).sort(
      (a, b) => b.date.localeCompare(a.date)
    );
    return csvDownload(transactionsToCsv(filtered), 'transactions');
  } catch (e) {
    log.error({ err: e }, 'csv export failed');
    return NextResponse.json(
      { error: 'Could not export transactions' },
      { status: 500 }
    );
  }
}
