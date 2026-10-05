// POST /api/interpret  { text }  ->  { ok:true, summary, genres[], tags[], platforms[], years?: [from, to], examples[] }
//                                  |  { ok:false, reason:'off_topic' }
// text = a game REQUIREMENT in Spanish or English (<= 200 chars). Gemini translates it into RAWG filters (all
// whitelisted and re-filtered server-side: see _lib/vocab.ts, _lib/gemini.ts) and names up to 5 example games;
// /api/games verifies them on RAWG. platforms are slugs, years are integers (the client turns them into
// dates=YYYY-01-01,YYYY-12-31 for /api/games). Feeling-only text, gibberish, abuse and prompt injection are
// off_topic, as is an answer with no filters and no examples.
// Errors: 400 invalid_input · 403 forbidden · 413 payload_too_large · 415 unsupported_media_type ·
//         429 rate_limited (+ Retry-After) · 503 upstream_unavailable · 500 server_error
// No CORS headers on purpose: the page and the API share one origin.
import { INTERPRET_BUDGET_MS, interpretText, type Interpretation, ATTEMPTS } from './_lib/gemini.js';
import { clientIp, deadline, env, fail, json, rateLimited, toErrorResponse } from './_lib/http.js';
import { createCache, createRateLimiter } from './_lib/memory.js';
import { normalizeText, parseText } from './_lib/validate.js';

export const config = { maxDuration: 30 };

const MAX_BODY_BYTES = 2048;
// ponytail: per-instance memory, see _lib/memory.ts. Ceiling = instances x 10/min per IP (IPv6 keyed by /64).
// Upgrade: Redis (Upstash / Vercel KV) with the same allow(ip) signature.
const allow = createRateLimiter(10, 60_000);
const cache = createCache<Interpretation>(500, 60 * 60_000); // 1 h, keyed by normalized text

export async function POST(req: Request): Promise<Response> {
  const left = deadline(INTERPRET_BUDGET_MS);
  // cheap header checks first, before reading the body
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail('unsupported_media_type', 415);
  if (req.headers.get('sec-fetch-site') === 'cross-site') return fail('forbidden', 403);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail('payload_too_large', 413);

  // invalid input is rejected before the limiter, so it never burns the caller's budget
  const text = parseText(await req.json().catch(() => null));
  if (!text) return fail('invalid_input', 400);
  const ip = clientIp(req);
  if (!allow(ip)) return rateLimited(allow, ip);

  const key = normalizeText(text);
  const hit = cache.get(key);
  if (hit) return json(hit);
  try {
    const result = await interpretText(text, env('GEMINI_API_KEY'), ATTEMPTS, left);
    cache.set(key, result); // only real answers (incl. off_topic) are cached: failures and malformed output throw
    return json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
