import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { NextResponse } from 'next/server';

/**
 * One-shot repair: relocate commodity/account declarations that an early price
 * migration dropped out of the fetcher-owned price DB into an included
 * `definitions.ledger`. Operates only on the caller's own journal. Idempotent —
 * safe to hit more than once; returns `skipped` once there is nothing to move.
 *
 * The service takes the per-user lock and pulls fresh under it, so this handler
 * does not pull first. A relocation that leaves the journal unparseable rolls
 * back and throws; we translate that into a structured `failed` result rather
 * than an opaque 500 so the caller can distinguish it from `relocated`/`skipped`.
 */
export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  try {
    const result = await priceService.relocateLegacyDefinitions(user.id);
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'definitions relocation failed';
    return NextResponse.json({ result: 'failed', message }, { status: 500 });
  }
}
