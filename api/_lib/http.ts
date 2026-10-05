// Shared HTTP helpers. Error bodies are always `{ error: '<code>' }` and never contain upstream text.
import type { RateLimiter } from './memory.js';

declare const process: { env: Record<string, string | undefined> };

/** Server secret by name. The error message carries the variable NAME only, never a value. */
export const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env: ${name}`); // clients only ever see a generic server_error
  return v;
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });

export const fail = (code: string, status: number, headers?: Record<string, string>) => json({ error: code }, status, headers);

// Only our own codes may reach the logs ("upstream_unavailable", "missing_env: RAWG_API_KEY"...), so no
// message that could embed a URL or a key is ever printed.
const OWN_CODE = /^[a-z_]+(: [A-Z][A-Z0-9_]*)?$/;

/** Maps thrown errors to a response: upstream/not-found codes, everything else a logged, generic 500. */
export function toErrorResponse(e: unknown): Response {
  const m = e instanceof Error ? e.message : '';
  if (m === 'upstream_unavailable') return fail(m, 503);
  if (m === 'not_found') return fail(m, 404, { 'Cache-Control': 'public, s-maxage=300' });
  console.error('api', OWN_CODE.test(m) ? m : 'unknown');
  return fail('server_error', 500);
}

export const rateLimited = (allow: RateLimiter, ip: string) =>
  fail('rate_limited', 429, { 'Retry-After': String(allow.retryAfter(ip)) });

/** IPv6 clients get a whole /64 for themselves, so key them by the first 4 hextets. */
function ipKey(ip: string): string {
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip)?.[1]; // plain or IPv4-mapped
  if (v4) return v4;
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  const groups = full.slice(0, 4).map((x) => parseInt(x, 16));
  return groups.length === 4 && groups.every((n) => Number.isFinite(n)) ? groups.map((n) => n.toString(16)).join(':') : ip;
}

// On Vercel x-real-ip / x-forwarded-for are set by the platform edge, not the client.
export const clientIp = (req: Request) =>
  ipKey(req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local');

/** Per-request time budget: `left()` = milliseconds remaining. */
export const deadline = (ms: number) => {
  const end = Date.now() + ms;
  return () => end - Date.now();
};
export type Left = ReturnType<typeof deadline>;

/** Cacheable (CDN) headers for read-only RAWG proxies. */
export const CDN_CACHE = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };
