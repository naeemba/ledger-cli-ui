import type { RateLimitPolicy } from './store';

/** Expensive import + ledger parse. */
export const UPLOAD: RateLimitPolicy = {
  name: 'upload',
  max: 10,
  windowMs: 60_000,
};

/** Journal/template/saved-view/settings mutations. */
export const WRITE: RateLimitPolicy = {
  name: 'write',
  max: 60,
  windowMs: 60_000,
};

/** Account-deletion request & verify. */
export const DESTRUCTIVE: RateLimitPolicy = {
  name: 'destructive',
  max: 5,
  windowMs: 60_000,
};

/** DEK unlock attempts. */
export const UNLOCK: RateLimitPolicy = {
  name: 'unlock',
  max: 10,
  windowMs: 60_000,
};

export const RATE_LIMIT_MESSAGE =
  'Too many requests. Please wait a moment and try again.';
