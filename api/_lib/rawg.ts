// RAWG client. Semantics verified live on 2026-10-02 / 2026-10-03:
//  - `tags=a,b` and `genres=a,b` are OR within one param; genres AND tags AND platforms combine as AND.
//  - `platforms=` takes platform ids (children: 7 = Switch), `dates=from,to` takes YYYY-MM-DD,YYYY-MM-DD.
//  - `ordering=-rating` surfaces junk (tiny vote counts, adult shovelware). `-added`
//    (popularity, also the default) gives a pool of known games; we re-rank that pool ourselves.
//  - `exclude_additions=true` drops DLC. `metacritic=` is far too restrictive for requirement queries.
//  - `search=<title>&search_precise=true` still fuzzy-matches: an invented title comes back as some other game
//    ("Blasphemous Hollow Knights" -> Hollow Knight) and ranks sequels first ("Dark Souls" -> III, "BioShock" ->
//    "Bioshock Apartment"). So each example title costs two parallel calls: the direct slug `GET /games/{slug}`
//    (exact; 404 = no such slug, not a failure) and the search. The slug wins when its name matches; otherwise
//    the best search result whose name matches (titleMatches); no match = dropped silently.
//  - Adult policy: results that come only from the filters hide everything tagged nudity / sexual-content /
//    hentai / erotic / nsfw or ESRB adults-only; games the user's request NAMES (examples) are hidden only for
//    adults-only and the explicit tags, so M-rated mainstream titles (Sekiro, The Witcher 3) can be pinned.
import { createCache } from './memory.js';
import { deadline, env, type Left } from './http.js';
import { titleKey, type GamesQuery } from './validate.js';
import { platformIds } from './vocab.js';

const BASE = 'https://api.rawg.io/api';
const POOL = 40; // fetched; best 20 returned
const OUT = 20;
const MIN_RATING = 3.3;
// Filler quality (measured on live RAWG 2026-10-04, pools of 40 by -added): a vote count alone cannot tell shovelware
// from small good games (clones had 9-21 ratings; Lil Gator Game 28, Beacon Pines 37), so three cheap rules together:
const MIN_RATINGS_FLOOR = 5; // a 5.0 with 2 ratings is not a signal
const MIN_RATINGS_FRAC = 0.1; // ... and the bar scales: 10% of the ratings_count of the pool's 10th most-rated game
const SERIES_NAMES = 3; // a significant word shared by >= 3 names in the pool = a series ("... Full of Cats", "100 ... Cats")
const SERIES_MAX_RATINGS = 50; // ... is dropped when the game has fewer ratings than this (big franchises stay)
const ENOUGH = 8; // fewer results than this = the query was too thin, relax it
const TRY_MS = 8000; // RAWG latency measured 0.5-7 s per call
const MIN_LEFT_MS = 1000; // do not start a call with less than this left
const SEARCH_SIZE = 5; // results read per example search (the first one that matches wins)
export const GAMES_BUDGET_MS = 12_000; // whole-request budget for /api/games and /api/game
const EXPLICIT_TAGS = new Set(['hentai', 'erotic', 'nsfw']); // never shown, even as a named example
const ADULT_TAGS = new Set(['nudity', 'sexual-content', ...EXPLICIT_TAGS]); // hidden unless the user named the game

export type Game = { id: number; slug: string; name: string; released: string | null; image: string };

/** What one filter query can use. platforms are slugs (mapped to RAWG ids here); dates = [from, to]. */
export type Filters = { genres: string[]; tags: string[]; platforms?: string[]; dates?: [string, string] | null };

// Generic tags (>= ~10k games each on RAWG) flood an OR-union with the same popular titles. The defining
// requirement tags (souls-like, co-op, metroidvania, relaxing, ...) are deliberately NOT here.
const BROAD = new Set([
  'singleplayer', 'multiplayer', 'first-person', 'third-person', '2d', '3d', 'atmospheric', 'story-rich',
  'exploration', 'funny', 'cute', 'colorful', 'pixel-graphics', 'retro', 'sci-fi', 'fantasy', 'horror', 'space',
  'fast-paced', 'difficult', 'short', 'realistic', 'narrative',
]);

/** Tags to send to RAWG. Tags are ORed, so every extra tag widens the pool toward popular AAA noise:
 *  send only the first specific (non-broad) tag (the model lists the most defining first); the rest only
 *  re-rank (see pickGames). All broad? send the first two. */
export function queryTags(tags: string[]): string[] {
  const first = tags.find((t) => !BROAD.has(t));
  return first ? [first] : tags.slice(0, 2);
}

export function buildGamesUrl(key: string, q: Filters): URL {
  const platforms = platformIds(q.platforms ?? []);
  // never a filterless URL: it would return globally popular junk (dates alone are not a filter)
  if (!q.genres.length && !q.tags.length && !platforms.length) throw new Error('invalid_input');
  const u = new URL(`${BASE}/games`);
  u.searchParams.set('key', key);
  if (q.genres.length) u.searchParams.set('genres', q.genres.join(','));
  if (q.tags.length) u.searchParams.set('tags', q.tags.join(','));
  if (platforms.length) u.searchParams.set('platforms', platforms.join(','));
  if (q.dates) u.searchParams.set('dates', q.dates.join(','));
  u.searchParams.set('ordering', '-added');
  u.searchParams.set('exclude_additions', 'true');
  u.searchParams.set('page_size', String(POOL));
  return u;
}

export function buildSearchUrl(key: string, title: string): URL {
  const u = new URL(`${BASE}/games`);
  u.searchParams.set('key', key);
  u.searchParams.set('search', title);
  u.searchParams.set('search_precise', 'true');
  u.searchParams.set('exclude_additions', 'true');
  u.searchParams.set('page_size', String(SEARCH_SIZE));
  return u;
}

type Raw = {
  id: number; slug: string; name: string; released?: string | null; background_image?: string | null;
  rating?: number; ratings_count?: number; added?: number; tags?: { slug: string }[]; esrb_rating?: { slug?: string } | null;
  platforms?: { platform?: { id?: number } }[] | null;
};

// RAWG serves every cover from media.rawg.io (checked live). No whitespace/commas: the client puts it in a srcset.
const coverUrl = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/media\.rawg\.io\/[^\s,]+$/.test(u);

/** Can appear at all: safe cover, not adults-only, no explicit tag. (Ratings are judged separately.) */
const isShowable = (g: Raw) =>
  coverUrl(g.background_image) && g.esrb_rating?.slug !== 'adults-only' && !g.tags?.some((t) => EXPLICIT_TAGS.has(t.slug));

/** Shown when it only came from the filters: also hides nudity / sexual-content. */
const isSafe = (g: Raw) => isShowable(g) && !g.tags?.some((t) => ADULT_TAGS.has(t.slug));

const toGame = (g: Raw): Game => ({ id: g.id, slug: g.slug, name: g.name, released: g.released ?? null, image: g.background_image as string });

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'vs']);
/** Significant words of a name for series detection: lowercase letters/digits, 3+ chars, not a number or stop word. */
const sigWords = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

/** Raw RAWG results -> up to 20 well-rated, safe, deduped, non-shovelware games with an image.
 *  Dropped: no cover / adult / rating < 3.3; fewer ratings than a floor that scales with the pool; low-rated clones
 *  of a series. Ranked by how many of the wanted tags they carry (RAWG's tag filter is an OR), then popularity
 *  (`added`, RAWG's own order), then rating. Missing ratings_count / added (partial payloads) are not judged. */
export function pickGames(results: Raw[], wanted: string[] = []): Game[] {
  const seen = new Set<string>();
  const hits = (g: Raw) => g.tags?.filter((t) => wanted.includes(t.slug)).length ?? 0;
  const ranked = results.map((g) => g.ratings_count ?? 0).sort((x, y) => y - x);
  const minRatings = Math.max(MIN_RATINGS_FLOOR, Math.round(MIN_RATINGS_FRAC * (ranked[9] ?? 0)));
  const nameCount = new Map<string, number>();
  for (const g of results) for (const w of new Set(sigWords(g.name ?? ''))) nameCount.set(w, (nameCount.get(w) ?? 0) + 1);
  const clone = (g: Raw) => (g.ratings_count ?? Infinity) < SERIES_MAX_RATINGS && sigWords(g.name).some((w) => (nameCount.get(w) ?? 0) >= SERIES_NAMES);
  return results
    .filter((g) => isSafe(g) && (g.rating ?? 0) >= MIN_RATING)
    .filter((g) => (g.ratings_count ?? Infinity) >= minRatings && !clone(g))
    .sort((a, b) => hits(b) - hits(a) || (b.added ?? 0) - (a.added ?? 0) || (b.rating ?? 0) - (a.rating ?? 0))
    .filter((g) => {
      const k = g.name.trim().toLowerCase();
      if (seen.has(`#${g.id}`) || seen.has(k)) return false;
      seen.add(`#${g.id}`).add(k);
      return true;
    })
    .slice(0, OUT)
    .map(toGame);
}

// ---- example titles ------------------------------------------------------------------------------

/** Lowercase, no accents, punctuation as spaces, no articles/"and" -> comparable word list. */
const words = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '') // Assassin's -> Assassins
    .replace(/\b(game of the year|goty|definitive|complete|deluxe|ultimate|enhanced|remastered|edition)\b/g, ' ') // re-releases
    .replace(/&/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !['the', 'a', 'an', 'and'].includes(w));

/** RAWG slug guess for a title: lowercase, no accents or apostrophes, anything else non-alphanumeric -> one
 *  hyphen. '' when nothing latin is left (the slug lookup is skipped then). */
export const slugify = (t: string): string =>
  t
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

const MAX_EXTRA_WORDS = 2; // "The Witcher 3" ~ "The Witcher 3: Wild Hunt" (RAWG name longer than the title)
const MAX_EXTRA_WORDS_REVERSE = 1; // RAWG name SHORTER than the title: the model added words, be stricter
// extra words that make it a different thing (a VR spin-off, a demake, a demo...), never "the same game"
const NOT_THE_GAME = new Set(['vr', 'demo', 'demake', 'beta', 'playtest', 'soundtrack', 'mod']);

/** Does RAWG's `found` name denote the game the model called `wanted`? Equal after normalizing, or `wanted` is a
 *  whole-word run inside `found` with at most 2 extra words ("Doom" ~ "Doom Eternal"). The fuzzy search also
 *  returns unrelated games for invented titles; those fail this test. */
export function titleMatches(wanted: string, found: string): boolean {
  const w = words(wanted), f = words(found);
  if (!w.length || !f.length) return false;
  const [short, long] = w.length <= f.length ? [w, f] : [f, w];
  if (long.length - short.length > (long === f ? MAX_EXTRA_WORDS : MAX_EXTRA_WORDS_REVERSE)) return false;
  for (let i = 0; i + short.length <= long.length; i++) {
    if (short.every((x, j) => long[i + j] === x)) return !long.some((x, j) => (j < i || j >= i + short.length) && NOT_THE_GAME.has(x));
  }
  return false;
}

/** GET with one retry (timeout / 5xx / unreadable body), every try clipped to the time left. */
async function rawgGet<T>(url: URL | string, left: Left, tries = 2): Promise<T> {
  for (let i = 0; i < tries && left() >= MIN_LEFT_MS; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(TRY_MS, left())) });
      if (res.ok) return (await res.json()) as T; // the signal also covers reading the body
      await res.body?.cancel();
      if (res.status === 404) throw new Error('not_found');
      if (res.status < 500) break; // other 4xx: retrying will not help
    } catch (e) {
      if (e instanceof Error && e.message === 'not_found') throw e;
    }
  }
  throw new Error('upstream_unavailable');
}

/** A resolved example: the game plus the RAWG platform ids it runs on (null = RAWG did not say). */
type Pin = { game: Game; platforms: number[] | null };
const toPin = (g: Raw): Pin => {
  const ids = (g.platforms ?? []).flatMap((p) => (typeof p.platform?.id === 'number' ? [p.platform.id] : []));
  return { game: toGame(g), platforms: ids.length ? ids : null };
};

// Title -> verified game, 24 h, per instance. A null ("RAWG has no such game") is cached too, but only when both
// calls answered; anything resolved while a call failed is never cached. Dates / platforms are applied AFTER the
// cache (getGames), so one entry serves every query.
const resolved = createCache<Pin | null>(1000, 24 * 60 * 60_000);
/** Test hook: forget every resolved title. */
export const clearResolvedTitles = () => resolved.clear();

/** One example title -> a verified game (or none) and whether every call answered. Two parallel calls: the direct
 *  slug (exact; a 404 or a non-matching name just means "not this way", it is NOT a failure) and the search (one
 *  try). Rejects when nothing was found and a call failed. */
async function resolveOne(key: string, title: string, left: Left): Promise<{ pin: Pin | null; ok: boolean }> {
  const k = titleKey(title);
  const cached = resolved.get(k);
  if (cached !== undefined) return { pin: cached, ok: true };
  const slug = slugify(title);
  const bySlug =
    slug && !/^\d+$/.test(slug) // digits only would be an id lookup, not a slug
      ? rawgGet<Raw>(`${BASE}/games/${slug}?key=${key}`, left, 1).catch((e) => {
          if (e instanceof Error && e.message === 'not_found') return null; // no such slug: not a failure
          throw e;
        })
      : Promise.resolve(null);
  const bySearch = rawgGet<{ results?: Raw[] }>(buildSearchUrl(key, title), left, 1);
  const [direct, search] = await Promise.allSettled([bySlug, bySearch]);
  if (direct.status === 'rejected' && search.status === 'rejected') throw search.reason;
  const ok = direct.status === 'fulfilled' && search.status === 'fulfilled';
  const wanted = words(title).join(' ');
  const named = (r: Raw | null | undefined): r is Raw => !!r && typeof r.name === 'string' && titleMatches(title, r.name);
  const exactName = (r: Raw) => words(r.name).join(' ') === wanted;
  const hits = search.status === 'fulfilled' ? (search.value.results ?? []).filter(named) : [];
  const d = direct.status === 'fulfilled' && named(direct.value) ? direct.value : null;
  // an exact slug beats the search; then an exact name, then a loose match. An exact match that
  // is not showable (adults-only, no cover) is the answer: no falling back to a look-alike.
  // among loose matches the best-rated wins ("The Witcher 3" -> Wild Hunt, not the REDkit modding tool)
  const loose = hits.filter(isShowable).sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))[0];
  const hit = d && exactName(d) ? d : hits.find(exactName) ?? d ?? loose;
  const pin = hit && isShowable(hit) ? toPin(hit) : null;
  if (!pin && !ok) throw new Error('upstream_unavailable'); // nothing found AND a call failed: unknown, not "no such game"
  if (ok) resolved.set(k, pin);
  return { pin, ok };
}

/** Verified example games, in the model's order, resolved in parallel (2 calls each, same time budget). A title
 *  with no matching game is dropped silently. `complete` = no call failed. Throws upstream_unavailable only when
 *  EVERY example failed. */
async function resolveExamples(key: string, titles: string[], left: Left): Promise<{ pins: Pin[]; complete: boolean }> {
  if (!titles.length) return { pins: [], complete: true };
  const found = await Promise.allSettled(titles.map((t) => resolveOne(key, t, left)));
  if (found.every((f) => f.status === 'rejected')) throw new Error('upstream_unavailable');
  const seen = new Set<number>();
  const pins = found.flatMap((f) => (f.status === 'fulfilled' && f.value.pin && !seen.has(f.value.pin.game.id) && seen.add(f.value.pin.game.id) ? [f.value.pin] : []));
  return { pins, complete: found.every((f) => f.status === 'fulfilled' && f.value.ok) };
}

const dupKey = (g: Game) => [`#${g.id}`, g.name.trim().toLowerCase()];

/** Games for the filters: the strict query first; when it is thin, the relaxed ones (date range dropped, then
 *  genres dropped; never a filterless query) fill up behind it without duplicates, up to 20. `complete` is false
 *  when a relax step failed after something was already found. */
async function byFilters(key: string, q: GamesQuery, left: Left): Promise<{ games: Game[]; complete: boolean }> {
  const base: Filters = { genres: q.genres, tags: queryTags(q.tags), platforms: q.platforms, dates: q.dates };
  const steps: Filters[] = [base];
  if (base.dates) steps.push({ ...base, dates: null });
  const last = steps[steps.length - 1];
  // genres AND one tag can be too thin: drop the genres, but only if a tag or platform filter remains
  if (last.genres.length && (last.tags.length || last.platforms?.length)) steps.push({ ...last, genres: [] });
  let acc: Game[] | null = null;
  for (const step of steps) {
    try {
      const { results } = await rawgGet<{ results?: Raw[] }>(buildGamesUrl(key, step), left);
      const games = pickGames(results ?? [], q.tags); // rank by ALL requested tags, even those not sent
      const prev: Game[] = acc ?? [];
      const seen = new Set<string>(prev.flatMap(dupKey));
      acc = [...prev, ...games.filter((g) => dupKey(g).every((k) => !seen.has(k)))].slice(0, OUT);
      if (acc.length >= ENOUGH) break;
    } catch (e) {
      if (acc) return { games: acc, complete: false }; // a failed relax step must not throw away what we already have
      throw e;
    }
  }
  return { games: acc ?? [], complete: true };
}

/** Example games (verified on RAWG, and consistent with the requested platforms and years) first, then the
 *  filter results without duplicates, at most 20. `complete` is false when anything failed upstream and the
 *  list may be missing games: the caller must not cache it. */
export async function getGames(q: GamesQuery, left: Left = deadline(GAMES_BUDGET_MS)): Promise<{ games: Game[]; complete: boolean }> {
  const hasFilter = q.genres.length > 0 || q.tags.length > 0 || q.platforms.length > 0;
  if (!hasFilter && !q.examples.length) throw new Error('invalid_input'); // never a filterless query
  const key = env('RAWG_API_KEY');
  const [ex, fl] = await Promise.allSettled([
    resolveExamples(key, q.examples, left),
    hasFilter ? byFilters(key, q, left) : Promise.resolve({ games: [] as Game[], complete: true }),
  ]);
  // a named game must still honour the hard requirements: released inside the dates, on one of the platforms
  // (when RAWG does not say, it is kept)
  const wantIds = platformIds(q.platforms);
  const fits = ({ game, platforms }: Pin) =>
    (!q.dates || !game.released || (game.released >= q.dates[0] && game.released <= q.dates[1])) &&
    (!wantIds.length || !platforms || platforms.some((id) => wantIds.includes(id)));
  const pinned = ex.status === 'fulfilled' ? ex.value.pins.filter(fits).map((p) => p.game) : [];
  const taken = new Set(pinned.flatMap(dupKey));
  const rest = (fl.status === 'fulfilled' ? fl.value.games : []).filter((g) => dupKey(g).every((k) => !taken.has(k)));
  // one side failing is fine while the other gave something; nothing at all + a failure = upstream down
  if (!pinned.length && !rest.length) {
    const failed = [fl, ex].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
  const complete = ex.status === 'fulfilled' && ex.value.complete && fl.status === 'fulfilled' && fl.value.complete;
  return { games: [...pinned, ...rest].slice(0, OUT), complete };
}

export type GameDetail = {
  name: string; description: string; released: string | null; trailer: string | null; screenshots: string[];
  platforms: string[]; genres: string[]; rating: number | null; metacritic: number | null;
};

// RAWG nested [{ <key>: { name } }] (or [{ name }]) -> unique, bounded plain names; anything else -> []
const names = (v: unknown, key: string | null, max: number): string[] => {
  const out = new Set<string>();
  for (const it of Array.isArray(v) ? v : []) {
    const n = (key ? it?.[key] : it)?.name;
    if (typeof n === 'string' && n.trim()) out.add(n.trim().slice(0, 60));
  }
  return [...out].slice(0, max);
};
const num = (n: unknown, lo: number, hi: number) => (typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : null);

const https = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');
const details = createCache<GameDetail>(200, 30 * 60_000);

/** `ref` is a RAWG numeric id or slug (already validated: it goes into the URL path). */
export async function getGameDetail(ref: string, left: Left = deadline(GAMES_BUDGET_MS)): Promise<GameDetail> {
  const key = env('RAWG_API_KEY');
  const hit = details.get(ref);
  if (hit) return hit;
  const u = (path: string) => `${BASE}/games/${encodeURIComponent(ref)}${path}?key=${key}`;
  const [game, movies, shots] = await Promise.all([
    rawgGet<{ name: string; description_raw?: string; released?: string | null; platforms?: unknown; genres?: unknown; rating?: unknown; ratings_count?: number; metacritic?: unknown }>(u(''), left),
    rawgGet<{ results?: { data?: Record<string, string> }[] }>(u('/movies'), left).catch(() => null), // optional
    rawgGet<{ results?: { image?: string }[] }>(u('/screenshots'), left).catch(() => null), // optional
  ]);
  const d = movies?.results?.[0]?.data;
  const r = num(game.rating, 0, 5);
  const detail: GameDetail = {
    name: game.name,
    description: game.description_raw ?? '',
    released: game.released ?? null,
    trailer: [d?.max, d?.['480']].find(https) ?? null,
    screenshots: (shots?.results ?? []).map((s) => s.image).filter(https),
    platforms: names(game.platforms, 'platform', 12),
    genres: names(game.genres, null, 5),
    rating: game.ratings_count && r ? Math.round(r * 10) / 10 : null,
    metacritic: num(game.metacritic, 1, 100),
  };
  details.set(ref, detail);
  return detail;
}
