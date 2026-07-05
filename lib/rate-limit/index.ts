import 'server-only';
import {
  MemoryStore,
  type RateLimitPolicy,
  type RateLimitResult,
} from './store';

// Pinned on globalThis rather than a plain module-level `const`: Next.js
// evaluates this module in separate instances per server context (route
// handlers, RSC render, instrumentation), so a module-scoped store would give
// each context its own bucket map — counting hits separately and silently
// weakening every limit. A single globalThis-backed store keeps the count
// honest across the whole process. See lib/crypto/sessionKeys.ts for the same
// rationale.
const globalForRateLimit = globalThis as typeof globalThis & {
  __ledgerRateLimitStore?: MemoryStore;
};
const store = (globalForRateLimit.__ledgerRateLimitStore ??= new MemoryStore());

/** Per-user rate-limit check against a named policy. */
export function rateLimit(
  policy: RateLimitPolicy,
  userId: string
): RateLimitResult {
  return store.hit(`${policy.name}:${userId}`, policy);
}

export {
  READ,
  UPLOAD,
  WRITE,
  DESTRUCTIVE,
  UNLOCK,
  RATE_LIMIT_MESSAGE,
} from './limits';
export type { RateLimitPolicy, RateLimitResult } from './store';
