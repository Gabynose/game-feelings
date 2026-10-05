// ponytail: both live in per-instance memory. On serverless every cold instance starts empty and N warm
// instances each keep their own counters, so the effective ceiling is instances x max per window (e.g.
// 10/min per IP x N for /api/interpret), and an attacker rotating 10k+ IPs can evict their own entries.
// Fine for a portfolio demo; upgrade path is a shared store (Upstash / Vercel KV Redis) behind the same
// two signatures.

const MAX_IPS = 10_000; // hard cap on tracked keys (oldest evicted first)

export type RateLimiter = {
  /** `cost` units are charged per call (default 1): a request that fans out upstream pays for its fan-out. */
  (ip: string, now?: number, cost?: number): boolean;
  /** Whole seconds until this ip's current window ends (>= 1). */
  retryAfter(ip: string, now?: number): number;
};

/** Fixed-window limiter: `allow(ip, now, cost)` is true while the ip has used <= max units in the window. */
export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; start: number }>(); // insertion order = window start order
  let lastPrune = 0;
  const allow = (ip: string, now = Date.now(), cost = 1): boolean => {
    if (now - lastPrune >= windowMs) {
      // at most one O(n) sweep per window
      for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      lastPrune = now;
    }
    const h = hits.get(ip);
    if (!h || now - h.start >= windowMs) {
      hits.delete(ip);
      hits.set(ip, { count: cost, start: now });
      if (hits.size > MAX_IPS) hits.delete(hits.keys().next().value as string);
      return cost <= max;
    }
    h.count += cost;
    return h.count <= max;
  };
  allow.retryAfter = (ip: string, now = Date.now()) => {
    const h = hits.get(ip);
    return h ? Math.max(1, Math.ceil((h.start + windowMs - now) / 1000)) : 1;
  };
  return allow;
}

/** TTL + max-size cache (Map keeps insertion order, so the first key is the oldest). */
export function createCache<T>(max: number, ttlMs: number) {
  const m = new Map<string, { v: T; at: number }>();
  return {
    get(k: string, now = Date.now()): T | undefined {
      const e = m.get(k);
      if (!e) return undefined;
      if (now - e.at > ttlMs) {
        m.delete(k);
        return undefined;
      }
      return e.v;
    },
    clear: () => m.clear(),
    set(k: string, v: T, now = Date.now()) {
      m.delete(k);
      m.set(k, { v, at: now });
      if (m.size > max) m.delete(m.keys().next().value as string);
    },
  };
}
