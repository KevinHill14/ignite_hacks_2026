/**
 * Per-IP rate limiting for the expensive route.
 *
 * Every upload is a real model call costing roughly $0.16, against a fixed
 * hackathon budget. The password gate stops strangers; this stops someone who
 * *has* the password from emptying the budget with a stuck refresh, which is
 * far more likely than malice.
 *
 * Deliberately in-memory. It is a Map in one process: it resets on deploy and
 * would not be shared across multiple instances. A proper limiter needs Redis
 * or similar. For a single Render service protecting a fixed budget, a Map is
 * the right amount of machinery — and saying so is better than pretending it
 * scales.
 */

interface Bucket {
  /** Timestamps of recent allowed requests, oldest first. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Stop the Map growing without bound on a long-lived server. */
const MAX_TRACKED_CLIENTS = 5_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the next request would be allowed. */
  retryAfter: number;
  limit: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    // Evict the oldest entries wholesale rather than tracking LRU order —
    // a rate limiter that leaks memory is a worse bug than one that
    // occasionally forgives a client after a flood of distinct IPs.
    if (buckets.size >= MAX_TRACKED_CLIENTS) buckets.clear();
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Sliding window: drop anything that has aged out.
  while (bucket.hits.length && bucket.hits[0] <= cutoff) bucket.hits.shift();

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      limit,
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: limit - bucket.hits.length,
    retryAfter: 0,
    limit,
  };
}

/**
 * Best-effort client identity.
 *
 * Behind Render the real address is the first entry in x-forwarded-for; the
 * socket address would be the load balancer. The header is spoofable in
 * general, but only by someone already past the password gate, and the fallback
 * bucket means a missing header degrades to a shared limit rather than to no
 * limit at all.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
