type Bucket = { count: number; resetAt: number };

export const REGISTER_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
export const SYNC_LIMIT = { limit: 60, windowMs: 60 * 1000 };
export const AUTH_FAIL_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export type RateLimiter = {
  /** Consume one hit. Returns false when the window is already exhausted. */
  allow: (key: string, limit: number, windowMs: number) => boolean;
  /** True when the key is already at the cap. Does not consume a hit. */
  isLimited: (key: string, limit: number, windowMs: number) => boolean;
};

/**
 * Soft in-process limiter for register and failed auth.
 *
 * On Vercel each isolate has its own map, so this only dampens bursts that
 * land on a warm instance. It is not a global lock. Replace `syncLimiter`
 * with a shared store (for example Upstash Redis) if register or auth abuse
 * needs a cap across instances. Keys are IP-scoped route names — never put
 * the device secret, hash, or request body in the key or in logs.
 */
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function current(key: string, windowMs: number): Bucket {
    const time = now();
    const existing = buckets.get(key);
    if (!existing || time >= existing.resetAt) {
      const created = { count: 0, resetAt: time + windowMs };
      buckets.set(key, created);
      return created;
    }
    return existing;
  }

  function prune(): void {
    if (buckets.size < 1000) return;
    const time = now();
    for (const [key, bucket] of buckets) {
      if (time >= bucket.resetAt) buckets.delete(key);
    }
  }

  return {
    allow(key, limit, windowMs) {
      prune();
      const bucket = current(key, windowMs);
      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    },
    isLimited(key, limit, windowMs) {
      const time = now();
      const bucket = buckets.get(key);
      if (!bucket || time >= bucket.resetAt) return false;
      return bucket.count >= limit;
    },
  };
}

export const syncLimiter = createRateLimiter();
