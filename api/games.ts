// GET /api/games?genres=a,b&tags=x,y&platforms=pc,nintendo-switch&dates=2010-01-01,2019-12-31&examples=T1&examples=T2
//   ->  { games: [{ id, slug, name, released, image }] } (<= 20)
// At least one of genres / tags / platforms / examples is required (slugs from _lib/vocab.ts; dates alone are
// refused). examples: up to 5 titles, each verified on RAWG by name and pinned first; invented ones are dropped
// silently. The rest is filled from the filters, ordered by tag hits then rating.
// Errors: 400 invalid_input · 429 rate_limited · 503 upstream_unavailable · 500 server_error
import { CDN_CACHE, clientIp, deadline, fail, json, rateLimited, toErrorResponse } from './_lib/http.js';
import { createCache, createRateLimiter } from './_lib/memory.js';
import { GAMES_BUDGET_MS, getGames, type Game } from './_lib/rawg.js';
import { parseGamesQuery } from './_lib/validate.js';

export const config = { maxDuration: 30 };

// ponytail: per-instance memory (see _lib/memory.ts); ceiling = instances x 60/min per IP.
// A request costs 1 + one unit per example (each example is up to 2 RAWG calls): 60/min ~ 10 full searches.
const allow = createRateLimiter(60, 60_000);
const cache = createCache<Game[]>(500, 60 * 60_000); // 1 h (RAWG is slow: 0.5-7 s)

export async function GET(req: Request): Promise<Response> {
  const q = parseGamesQuery(new URL(req.url).searchParams);
  if (!q) return fail('invalid_input', 400);
  const ip = clientIp(req);
  if (!allow(ip, undefined, 1 + q.examples.length)) return rateLimited(allow, ip);

  // The key mirrors what getGames depends on: genres and platforms are unordered sets, but TAG ORDER matters
  // (the first specific tag is sent to RAWG) and so does example order (pinned order). Dupes are already gone.
  const key = JSON.stringify([[...q.genres].sort(), q.tags, [...q.platforms].sort(), q.dates, q.examples.map((e) => e.toLowerCase())]);
  const hit = cache.get(key);
  if (hit) return json({ games: hit }, 200, CDN_CACHE); // no re-set: a hit must not refresh the TTL
  try {
    const { games, complete } = await getGames(q, deadline(GAMES_BUDGET_MS));
    if (!complete) return json({ games }); // something failed upstream: the list may be short, so never cache it (no-store)
    cache.set(key, games);
    return json({ games }, 200, CDN_CACHE);
  } catch (e) {
    return toErrorResponse(e);
  }
}
