import { requireUser } from '@/lib/auth/require-user';
import { migrateCreditedToDebts } from '@/lib/journal/creditedMigration';
import { createLogger } from '@/lib/log';
import { NextResponse } from 'next/server';

const log = createLogger('migrate-credited-debts');

/**
 * One-shot migration of the legacy `Assets:Credited:<person>` debts model to the
 * current `Assets:Receivable` / `Liabilities:Payable` split. Operates only on the
 * caller's own journal. Idempotent — returns `skipped` once nothing remains.
 *
 * The service takes the per-user lock and pulls fresh under it, verifies the
 * rewritten journal parses, and rolls back every touched file on failure, so a
 * bad migration is fully reversible. We surface a rollback as a structured
 * `failed` result rather than an opaque 500.
 *
 * Returns a `manual` result (200) listing any legacy person accounts whose net
 * spans multiple commodities: those have no single receivable/payable sign and
 * must be resolved by hand before the migration can run.
 */
export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  try {
    const result = await migrateCreditedToDebts(user.id);
    return NextResponse.json({ result });
  } catch (error) {
    log.error({ err: error }, 'credited debts migration failed');
    return NextResponse.json(
      { result: 'failed', message: 'Could not migrate your journal' },
      { status: 500 }
    );
  }
}
