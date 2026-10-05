// GET /api/game?id=3498  or  ?id=grand-theft-auto-v  (RAWG numeric id or slug)
//   ->  { name, description, released, trailer: string|null, screenshots: string[],
//         platforms: string[] (<=12), genres: string[] (<=5), rating: number|null (0-5, 1 decimal), metacritic: number|null (1-100) }
// description is plain text (RAWG description_raw): render it with textContent. trailer/screenshots are https only.
// Errors: 400 invalid_input · 404 not_found · 429 rate_limited · 503 upstream_unavailable · 500 server_error
import { CDN_CACHE, clientIp, deadline, fail, json, rateLimited, toErrorResponse } from './_lib/http.js';
import { createRateLimiter } from './_lib/memory.js';
import { GAMES_BUDGET_MS, getGameDetail } from './_lib/rawg.js';
import { parseGameId } from './_lib/validate.js';

export const config = { maxDuration: 30 };

// ponytail: per-instance memory (see _lib/memory.ts); ceiling = instances x 60/min per IP.
const allow = createRateLimiter(60, 60_000);

export async function GET(req: Request): Promise<Response> {
  const ref = parseGameId(new URL(req.url).searchParams.get('id'));
  if (!ref) return fail('invalid_input', 400);
  const ip = clientIp(req);
  if (!allow(ip)) return rateLimited(allow, ip);
  try {
    return json(await getGameDetail(ref, deadline(GAMES_BUDGET_MS)), 200, CDN_CACHE);
  } catch (e) {
    return toErrorResponse(e);
  }
}
