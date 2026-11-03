// ponytail: in-memory fixed window, per process. Move to Postgres/Redis when
// running more than one web instance.
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns seconds to wait if the limit is exceeded, otherwise 0. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return 0;
  }
  b.count++;
  return b.count > limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

export function resetRateLimits() {
  buckets.clear();
}
