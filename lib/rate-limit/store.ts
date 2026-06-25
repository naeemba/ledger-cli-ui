export interface RateLimitPolicy {
  name: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, policy: RateLimitPolicy): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const SWEEP_EVERY = 1000;

/**
 * Fixed-window counter, single-process. Keyed by an opaque string. The clock is
 * injectable for deterministic tests. Stale buckets are swept lazily so the map
 * cannot grow without bound.
 */
export class MemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private hits = 0;

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, policy: RateLimitPolicy): RateLimitResult {
    const t = this.now();
    if (++this.hits % SWEEP_EVERY === 0) this.sweep(t);

    let bucket = this.buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + policy.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count++;
    return {
      allowed: bucket.count <= policy.max,
      remaining: Math.max(0, policy.max - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  private sweep(t: number): void {
    for (const [key, bucket] of this.buckets) {
      if (t >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}
