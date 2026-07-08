import { requireUser } from '@/lib/auth/require-user';
import { createLogger } from '@/lib/log';
import { priceService } from '@/lib/prices';
import { NextResponse } from 'next/server';

const log = createLogger('repair-price-db');

/**
 * Regenerate the caller's price DB and push it to canonical. Repairs a price DB
 * written before render-time canonicalization existed — one that quoted a
 * commodity the journal also aliases (e.g. `USD` under `commodity $ / alias
 * USD`), which made ledger abort every read with a pool.cc assertion. Operates
 * only on the caller's own journal. Idempotent — safe to hit more than once.
 *
 * The service takes the per-user lock and pulls fresh under it, so this handler
 * does not pull first. A regeneration that leaves the journal unparseable does
 * not push and returns `failed` rather than an opaque 500.
 */
export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  try {
    const result = await priceService.repairUserPriceDb(user.id);
    return NextResponse.json({ result });
  } catch (error) {
    log.error({ err: error }, 'price db repair failed');
    return NextResponse.json(
      { result: 'failed', message: 'Could not repair your price database' },
      { status: 500 }
    );
  }
}
