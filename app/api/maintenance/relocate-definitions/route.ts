import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { pullLocked } from '@/lib/storage';
import { NextResponse } from 'next/server';

/**
 * One-shot repair: relocate commodity/account declarations that an early price
 * migration dropped out of the fetcher-owned price DB into an included
 * `definitions.ledger`. Operates only on the caller's own journal. Idempotent —
 * safe to hit more than once; returns `skipped` once there is nothing to move.
 *
 * Pulls first so the local cache (and, for an encryption-enabled caller, the
 * session DEK) is current before the relocation reads its source files.
 */
export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  await pullLocked(user.id);
  const result = await priceService.relocateLegacyDefinitions(user.id);
  return NextResponse.json({ result });
}
