// Client for /api (SPEC §3, DESIGN §14.5). Every failure becomes an Outcome the narrator can say; nothing throws.
export interface Game { id: number; slug: string; name: string; released: string | null; image: string }

export type ErrorReason = 'rate' | 'busy' | 'network' | 'slow' | 'bad';
export type Outcome =
  | { kind: 'results'; summary: string; games: Game[] }
  | { kind: 'no-results'; summary: string }
  | { kind: 'off-topic' }
  | { kind: 'error'; reason: ErrorReason; retryAfter?: number };

/** text -> outcome. `onInterpreted` fires as soon as the request is understood (games still loading). `summary` may be empty. */
export type Finder = (text: string, onInterpreted: (summary: string) => void) => Promise<Outcome>;

const INTERPRET_TIMEOUT_MS = 12_000; // server budget is ~10 s
const GAMES_TIMEOUT_MS = 14_000; // server budget is ~12 s (RAWG 0.5-7 s)
const RETRY_AFTER_FALLBACK_S = 10;
const RETRY_AFTER_MAX_S = 120; // a broken header must not tell the user to wait an hour
type Err = Extract<Outcome, { kind: 'error' }>;
const BAD: Err = { kind: 'error', reason: 'bad' }; // 400/403/413/415/500, non-JSON or wrong shape

type Call = { ok: true; data: Record<string, unknown> } | { ok: false; outcome: Err; status?: number };

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<Call> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (e) {
    const slow = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, outcome: { kind: 'error', reason: slow ? 'slow' : 'network' } };
  }
  if (res.status === 429) {
    const retryAfter = Math.min(RETRY_AFTER_MAX_S, Math.max(1, Math.ceil(Number(res.headers.get('Retry-After'))) || RETRY_AFTER_FALLBACK_S));
    return { ok: false, outcome: { kind: 'error', reason: 'rate', retryAfter } };
  }
  if (res.status === 503) return { ok: false, outcome: { kind: 'error', reason: 'busy' } };
  if (!res.ok) {
    if (import.meta.env.DEV) console.warn('[api]', url, res.status); // 400/403/413/415/500: a bug on our side
    return { ok: false, outcome: BAD, status: res.status };
  }
  try {
    const data: unknown = await res.json(); // the timeout signal also covers reading the body
    return data && typeof data === 'object' ? { ok: true, data: data as Record<string, unknown> } : { ok: false, outcome: BAD };
  } catch (e) {
    const slow = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, outcome: slow ? { kind: 'error', reason: 'slow' } : BAD };
  }
}

const isGame = (g: unknown): g is Game => {
  const o = g as Partial<Game> | null;
  return !!o && typeof o.id === 'number' && typeof o.slug === 'string' && typeof o.name === 'string' && typeof o.image === 'string';
};
const isStrings = (a: unknown): a is string[] => Array.isArray(a) && a.every((s) => typeof s === 'string');

const isYears = (y: unknown): y is [number, number] =>
  Array.isArray(y) && y.length === 2 && y.every((n) => Number.isInteger(n) && n >= 1000 && n <= 9999);

export const findGames: Finder = async (text, onInterpreted) => {
  const a = await call('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, INTERPRET_TIMEOUT_MS);
  if (!a.ok) return a.outcome;
  const i = a.data;
  if (i.ok === false) return i.reason === 'off_topic' ? { kind: 'off-topic' } : BAD;
  const years = i.years ?? undefined; // optional
  if (typeof i.summary !== 'string' || !isStrings(i.genres) || !isStrings(i.tags) || !isStrings(i.platforms) || !isStrings(i.examples) || (years !== undefined && !isYears(years))) return BAD;
  const summary = i.summary.trim(); // may be '': the narrator then uses the plain lines (DESIGN §14.13)
  onInterpreted(summary);
  const q = new URLSearchParams();
  if (i.genres.length) q.set('genres', i.genres.join(','));
  if (i.tags.length) q.set('tags', i.tags.join(','));
  if (i.platforms.length) q.set('platforms', i.platforms.join(','));
  if (!(i.genres.length || i.tags.length || i.platforms.length) && !i.examples.length) return { kind: 'no-results', summary }; // the server rejects dates alone (400): nothing to look for
  if (years) q.set('dates', `${years[0]}-01-01,${years[1]}-12-31`);
  i.examples.forEach((e) => q.append('examples', e));
  const g = await call(`/api/games?${q}`, {}, GAMES_TIMEOUT_MS);
  if (!g.ok) return g.outcome;
  if (!Array.isArray(g.data.games)) return BAD;
  const games = g.data.games.filter(isGame);
  return games.length ? { kind: 'results', summary, games } : { kind: 'no-results', summary };
};

/** GET /api/game (phase 6, DESIGN §16.5). 404 is its own result: the slug does not exist, retrying is pointless. */
export interface GameDetail { name: string; description: string; released: string | null; trailer: string | null; screenshots: string[]; platforms: string[]; genres: string[]; rating: number | null; metacritic: number | null }
export type DetailResult = { kind: 'ok'; detail: GameDetail } | { kind: 'not-found' } | { kind: 'error'; reason: ErrorReason; retryAfter?: number };

const DETAIL_TIMEOUT_MS = 14_000; // server budget is ~12 s
const https = (u: string | null): string | null => (u?.startsWith('https://') ? u : null);
const strList = (v: unknown, max: number): string[] => (isStrings(v) ? v.map((x) => x.trim()).filter(Boolean).slice(0, max) : []);
/** A finite number in (0, max], else null (RAWG sends 0 when nobody has voted: no data, not zero). */
const score = (v: unknown, max: number): number | null => (typeof v === 'number' && v > 0 && v <= max ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** `signal` aborts the request (the panel was closed); the caller ignores the result then. */
export async function getGame(slug: string, signal?: AbortSignal): Promise<DetailResult> {
  const r = await call(`/api/game?id=${encodeURIComponent(slug)}`, { signal }, DETAIL_TIMEOUT_MS);
  if (!r.ok) {
    if (r.status === 404 || r.status === 400) return { kind: 'not-found' }; // 400 = a slug the server rejects: the same as a game that does not exist
    return r.outcome;
  }
  const d = r.data;
  if (typeof d.name !== 'string' || !d.name || !isStrings(d.screenshots)) return { kind: 'error', reason: 'bad' };
  return { kind: 'ok', detail: { name: d.name, description: typeof d.description === 'string' ? d.description : '', released: strOrNull(d.released), trailer: https(strOrNull(d.trailer)), screenshots: d.screenshots.filter((u) => u.startsWith('https://')), platforms: strList(d.platforms, 12), genres: strList(d.genres, 5), rating: score(d.rating, 5), metacritic: score(d.metacritic, 100) } };
}
