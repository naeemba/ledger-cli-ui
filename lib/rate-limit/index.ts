import 'server-only';
import {
  MemoryStore,
  type RateLimitPolicy,
  type RateLimitResult,
} from './store';

const store = new MemoryStore();

/** Per-user rate-limit check against a named policy. */
export function rateLimit(
  policy: RateLimitPolicy,
  userId: string
): RateLimitResult {
  return store.hit(`${policy.name}:${userId}`, policy);
}

export { UPLOAD, WRITE, DESTRUCTIVE, RATE_LIMIT_MESSAGE } from './limits';
export type { RateLimitPolicy, RateLimitResult } from './store';
