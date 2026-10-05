// Tester-owned edge/abuse/behavior tests for the phase-3 backend. Black-box where possible:
// they assert what the SPEC promises (US2/US3, 11.3, 11.6), not how the code is written.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { GENRES, PLATFORM_SLUGS, TAGS } from '../api/_lib/vocab';
import { createCache, createRateLimiter } from '../api/_lib/memory';
import { interpretText, type Attempt } from '../api/_lib/gemini';
import { parseText, normalizeText } from '../api/_lib/validate';
import * as interpretMod from '../api/interpret';
import * as gamesMod from '../api/games';
import * as gameMod from '../api/game';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// Fresh module state (cache + rate limiter are module-level) for every test.
const load = async () => {
  vi.resetModules();
  return {
    interpret: (await import('../api/interpret')).POST,
    games: (await import('../api/games')).GET,
  };
};
const geminiOk = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const GOOD = { off_topic: false, summary: 'cozy sim', genres: ['simulation'], tags: ['cozy'], platforms: [], examples: [] };
const rawBody = (POST: (r: Request) => Promise<Response>, body: BodyInit | null, headers: Record<string, string> = {}, ip = '7.7.7.7') =>
  POST(new Request('http://x/api/interpret', { method: 'POST', headers: { 'x-real-ip': ip, ...headers }, body }));
const postJson = (POST: (r: Request) => Promise<Response>, text: unknown, ip = '7.7.7.7') =>
  rawBody(POST, JSON.stringify({ text }), { 'content-type': 'application/json' }, ip);

describe('interpret: hostile bodies', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
  });
  it.each([
    ['empty body', ''],
    ['garbage', '{{{not json'],
    ['truncated JSON', '{"text":"abc'],
    ['JSON null', 'null'],
    ['JSON array', '["feeling sad"]'],
    ['JSON number', '42'],
    ['JSON string', '"feeling sad"'],
    ['object without text', '{"feeling":"sad"}'],
    ['text is an object', '{"text":{"toString":"x"}}'],
    ['text is null', '{"text":null}'],
  ])('400 invalid_input (never 5xx, never upstream) for %s', async (_n, body) => {
    const { interpret } = await load();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await rawBody(interpret, body, { 'content-type': 'application/json' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_input' });
    expect(f).not.toHaveBeenCalled();
  });
  it('a request with no body at all is a 400, not a crash', async () => {
    const { interpret } = await load();
    const r = await interpret(new Request('http://x/api/interpret', { method: 'POST', headers: { 'content-type': 'application/json' } }));
    expect(r.status).toBe(400);
  });
  it('a 2 MB body is rejected with 400 and never reaches upstream', async () => {
    const { interpret } = await load();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await postJson(interpret, 'a'.repeat(2_000_000));
    expect(r.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  // Phase-3 fix #5: a non-JSON content-type is refused up front (415), which also blocks cross-site 'simple' POSTs.
  it('a wrong content-type with a valid JSON body is refused with 415 and never reaches upstream', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const r = await rawBody(interpret, '{"text":"feeling cozy"}', { 'content-type': 'text/plain' });
    expect(r.status).toBe(415);
  });
  it('invalid requests do not consume the rate-limit budget', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    for (let i = 0; i < 30; i++) expect((await postJson(interpret, '', '8.8.8.8')).status).toBe(400);
    expect((await postJson(interpret, 'feeling cozy', '8.8.8.8')).status).toBe(200);
  });
});

describe('interpret: text length semantics (US2: max 200 chars)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
  });
  it('exactly 200 chars is accepted, 201 is rejected (at the HTTP boundary)', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    expect((await postJson(interpret, 'a'.repeat(200))).status).toBe(200);
    expect((await postJson(interpret, 'a'.repeat(201))).status).toBe(400);
  });
  it('the limit applies to the trimmed text: 200 chars padded with whitespace is accepted', () => {
    expect(parseText({ text: `   ${'a'.repeat(200)}\n\n\t ` })).toHaveLength(200);
    expect(parseText({ text: ` ${'a'.repeat(201)} ` })).toBeNull();
  });
  it('length is measured in UTF-16 units, like the HTML maxlength attribute: 100 emoji ok, 101 rejected', () => {
    // Documents the semantics so the front end (input maxlength=200) and the server agree.
    expect(parseText({ text: '😀'.repeat(100) })).not.toBeNull();
    expect(parseText({ text: '😀'.repeat(101) })).toBeNull();
    expect('😀'.repeat(100).length).toBe(200);
  });
  it('200 BMP non-latin chars (CJK / accented) are accepted; 201 are not', () => {
    expect(parseText({ text: '悲'.repeat(200) })).not.toBeNull();
    expect(parseText({ text: 'é'.repeat(201) })).toBeNull();
  });
  it.each(['   ', '\n\n', '\t \r\n', '  ', ' 　'])('whitespace-only %j is rejected', (t) => {
    expect(parseText({ text: t })).toBeNull();
  });
  it('a null byte inside real text does not crash the handler', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const r = await postJson(interpret, 'I feel \u0000 cozy');
    expect(r.status).toBeLessThan(500);
    expect(r.headers.get('content-type')).toMatch(/json/);
  });
  it('lone surrogates / odd unicode in text do not crash the handler', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    for (const t of ['\ud800 sad', 'ZWJ ‍‍ sad', '‮Reversed feeling']) {
      expect((await postJson(interpret, t)).status).toBeLessThan(500);
    }
  });
});

describe('method surface (Vercel answers 405 itself for methods that are not exported)', () => {
  it('interpret exports POST only; games and game export GET only (plus the Vercel config object)', () => {
    // config = { maxDuration } is not a method handler; it is how Vercel reads per-function settings.
    expect(Object.keys(interpretMod).sort()).toEqual(['POST', 'config']);
    expect(Object.keys(gamesMod).sort()).toEqual(['GET', 'config']);
    expect(Object.keys(gameMod).sort()).toEqual(['GET', 'config']);
  });
});

describe('interpret: cache key normalization', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
  });
  it('same text modulo case / inner whitespace / newlines shares one upstream call', async () => {
    const { interpret } = await load();
    const f = vi.fn().mockImplementation(async () => geminiOk(GOOD));
    vi.stubGlobal('fetch', f);
    for (const t of ['Feeling COZY', 'feeling   cozy', '  feeling\tcozy\n', 'FEELING\n\ncozy']) await postJson(interpret, t, '10.0.0.1');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('different texts never share a cache entry (negation, punctuation, unicode, digits)', async () => {
    const { interpret } = await load();
    const f = vi.fn().mockImplementation(async () => geminiOk(GOOD));
    vi.stubGlobal('fetch', f);
    const texts = ['I feel sad', 'I feel not sad', 'I feel sad!', 'I feel sad.', 'Ifeel sad', 'I feel sad 2', 'I feel sad 3', 'I feel sàd', 'İ feel sad', 'i feel sad', 'I feel sad'];
    // 'i feel sad' / 'I feel sad' / NBSP variant are the same by design (case + \s collapse).
    const unique = new Set(texts.map(normalizeText));
    let ip = 0;
    for (const t of texts) await postJson(interpret, t, `10.0.1.${ip++}`);
    expect(f).toHaveBeenCalledTimes(unique.size);
    expect(unique.size).toBeGreaterThanOrEqual(9);
  });
  it('the cached answer is the SAME answer the first user got (no cross-text bleed)', async () => {
    const { interpret } = await load();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(geminiOk({ ...GOOD, summary: 'shooter', genres: ['shooter'], tags: ['fps'] }))
        .mockResolvedValueOnce(geminiOk({ ...GOOD, summary: 'chill game', genres: ['casual'], tags: ['relaxing'] })),
    );
    const a = await (await postJson(interpret, 'SO shooter', '10.0.2.1')).json();
    const b = await (await postJson(interpret, 'so chill', '10.0.2.2')).json();
    const a2 = await (await postJson(interpret, 'So   Shooter', '10.0.2.3')).json();
    expect(a.summary).toBe('shooter');
    expect(b.summary).toBe('chill game');
    expect(a2).toEqual(a);
  });
  it('upstream failures are never cached: the next identical request retries upstream', async () => {
    const { interpret } = await load();
    const f = vi
      .fn()
      .mockImplementationOnce(async () => new Response('x', { status: 503 }))
      .mockImplementationOnce(async () => new Response('x', { status: 503 }))
      .mockImplementationOnce(async () => new Response('x', { status: 503 }))
      .mockImplementation(async () => geminiOk(GOOD));
    vi.stubGlobal('fetch', f);
    expect((await postJson(interpret, 'flaky one', '10.0.3.1')).status).toBe(503);
    const r = await postJson(interpret, 'flaky one', '10.0.3.1');
    expect(r.status).toBe(200);
  });
  it('a cache hit still counts against the per-ip rate limit', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await postJson(interpret, 'same', '10.0.4.1')).status);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('interpret: rate limit at the HTTP boundary', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  it('11th request in the window -> 429 + Retry-After; the window edge is exact (59.999 s blocked, 60 s allowed)', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    for (let i = 0; i < 10; i++) expect((await postJson(interpret, 'x', '11.0.0.1')).status).toBe(200);
    const r = await postJson(interpret, 'x', '11.0.0.1');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(await r.json()).toEqual({ error: 'rate_limited' });
    vi.advanceTimersByTime(59_999);
    expect((await postJson(interpret, 'x', '11.0.0.1')).status).toBe(429);
    vi.advanceTimersByTime(1);
    expect((await postJson(interpret, 'x', '11.0.0.1')).status).toBe(200);
  });
  it('another ip is unaffected', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    for (let i = 0; i < 11; i++) await postJson(interpret, 'x', '11.0.1.1');
    expect((await postJson(interpret, 'x', '11.0.1.2')).status).toBe(200);
  });
  it('a spoofed x-forwarded-for does not dodge the limit when x-real-ip is set by the platform', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const codes: number[] = [];
    for (let i = 0; i < 12; i++)
      codes.push((await rawBody(interpret, '{"text":"x"}', { 'content-type': 'application/json', 'x-forwarded-for': `6.6.6.${i}` }, '11.0.2.1')).status);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});

describe('createRateLimiter (unit)', () => {
  it('blocked attempts do not extend the window (fixed window, exact edge)', () => {
    const allow = createRateLimiter(2, 1000);
    expect([0, 1, 500, 999].map((t) => allow('a', t))).toEqual([true, true, false, false]);
    expect(allow('a', 1000)).toBe(true); // reset exactly at start + window
    expect(allow('a', 1001)).toBe(true);
    expect(allow('a', 1002)).toBe(false);
  });
  it('after many ips expire the table is pruned and old ips start fresh', () => {
    const allow = createRateLimiter(1, 1000);
    for (let i = 0; i < 6000; i++) allow(`ip${i}`, 0);
    expect(allow('ip0', 10)).toBe(false);
    expect(allow('ip0', 2000)).toBe(true);
    expect(allow('new', 2000)).toBe(true);
    expect(allow('ip5999', 2001)).toBe(true);
  });
  // Fixed: hard cap on tracked ips + at most one prune sweep per window.
  it('stays fast under a flood of distinct fresh ips (no O(n^2) scan on every call)', () => {
    const allow = createRateLimiter(10, 60_000);
    const t0 = performance.now();
    for (let i = 0; i < 30_000; i++) allow(`flood${i}`, 0);
    // wall-clock guard: ~30-60 ms alone, up to ~1.4 s on a loaded machine; a real O(n^2) regression (30k x 10k map scan) takes many seconds
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('createCache (unit)', () => {
  it('never holds more than max entries (FIFO eviction) under a flood of distinct keys', () => {
    const c = createCache<number>(500, 60_000);
    for (let i = 0; i < 5000; i++) c.set(`k${i}`, i, 0);
    let live = 0;
    for (let i = 0; i < 5000; i++) if (c.get(`k${i}`, 1) !== undefined) live++;
    expect(live).toBe(500);
    expect(c.get('k4999', 1)).toBe(4999);
    expect(c.get('k4500', 1)).toBe(4500);
    expect(c.get('k4499', 1)).toBeUndefined();
  });
  it('overwriting an existing key does not evict others and keeps the newest value', () => {
    const c = createCache<number>(2, 1000);
    c.set('a', 1, 0);
    c.set('b', 2, 0);
    c.set('a', 3, 0);
    expect(c.get('a', 1)).toBe(3);
    expect(c.get('b', 1)).toBe(2);
  });
  it('ttl edge: still valid exactly at ttl, gone one ms later, and expired entries are removed', () => {
    const c = createCache<string>(5, 1000);
    c.set('k', 'v', 0);
    expect(c.get('k', 1000)).toBe('v');
    expect(c.get('k', 1001)).toBeUndefined();
    expect(c.get('k', 1)).toBeUndefined();
  });
});

describe('games handler: cache + validation', () => {
  const rawgPage = (n = 10) =>
    new Response(
      JSON.stringify({ results: Array.from({ length: n }, (_, i) => ({ id: i + 1, slug: `g${i}`, name: `G${i}`, background_image: 'https://media.rawg.io/media/games/x.jpg', rating: 4, tags: [] })) }),
    );
  beforeEach(() => {
    vi.stubEnv('RAWG_API_KEY', 'RAWGSECRET');
  });
  // Tag ORDER is meaningful (the first specific tag is the one sent to RAWG), so the cache key keeps it;
  // genres are an unordered set and duplicates collapse.
  it('duplicates and genre order share one upstream call; a different tag order or filter does not', async () => {
    const { games } = await load();
    const f = vi.fn().mockImplementation(async () => rawgPage());
    vi.stubGlobal('fetch', f);
    const get = (q: string) => games(new Request(`http://x/api/games?${q}`));
    await get('tags=cozy,relaxing');
    await get('tags=cozy,relaxing,cozy');
    await get('tags=cozy,cozy,calm');
    expect(f).toHaveBeenCalledTimes(1);
    await get('tags=relaxing,cozy'); // other order -> other primary tag candidate -> its own entry
    expect(f).toHaveBeenCalledTimes(2);
    await get('genres=casual,puzzle&tags=cozy,relaxing');
    const before = f.mock.calls.length;
    await get('genres=puzzle,casual,puzzle&tags=cozy,relaxing');
    expect(f.mock.calls.length).toBe(before);
    expect(before).toBeGreaterThan(2);
  });
  it('genre-only and tag-only queries cannot collide', async () => {
    const { games } = await load();
    const f = vi.fn().mockImplementation(async () => rawgPage());
    vi.stubGlobal('fetch', f);
    await games(new Request('http://x/api/games?genres=puzzle'));
    await games(new Request('http://x/api/games?tags=puzzle-platformer'));
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('upstream failure is a 503 that is not cached and leaks neither key nor upstream body', async () => {
    const { games } = await load();
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (u: string) => (fail ? new Response(`boom ${u}`, { status: 500 }) : rawgPage())),
    );
    const bad = await games(new Request('http://x/api/games?tags=cozy'));
    const body = await bad.text();
    expect(bad.status).toBe(503);
    expect(body).not.toContain('RAWGSECRET');
    expect(body).not.toContain('boom');
    expect(bad.headers.get('cache-control')).toBe('no-store');
    fail = false;
    expect((await games(new Request('http://x/api/games?tags=cozy'))).status).toBe(200);
  });
  it('success is CDN-cacheable JSON; the RAWG key is never echoed', async () => {
    const { games } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => rawgPage()));
    const r = await games(new Request('http://x/api/games?tags=cozy'));
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(r.headers.get('cache-control')).toMatch(/s-maxage=\d+/);
    expect(JSON.stringify([...r.headers])).not.toContain('RAWGSECRET');
    expect(await r.text()).not.toContain('RAWGSECRET');
  });
  // Fixed: a cache hit returns early and no longer refreshes the TTL.
  it('cache entries expire 1 h after they were FETCHED, regardless of hits in between', async () => {
    const { games } = await load();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = vi.fn().mockImplementation(async () => rawgPage());
    vi.stubGlobal('fetch', f);
    const get = () => games(new Request('http://x/api/games?tags=relaxing'));
    await get();
    vi.advanceTimersByTime(40 * 60_000);
    await get();
    vi.advanceTimersByTime(40 * 60_000);
    await get();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it.each(['genres=action,action,action', 'tags=', 'genres=Action', 'tags=cozy;nudity', 'tags=cozy%2Cnudity', 'genres=%00'])(
    'rejects or normalizes hostile query %s without a 5xx',
    async (q) => {
      const { games } = await load();
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => rawgPage()));
      const r = await games(new Request(`http://x/api/games?${q}`));
      expect(r.status).toBeLessThan(500);
      if (/nudity|%00|Action|tags=$/.test(q)) expect(r.status).toBe(400);
    },
  );
});

describe('game handler: id validation', () => {
  beforeEach(() => vi.stubEnv('RAWG_API_KEY', 'K'));
  // 'abc' / '1e3' / '0x1' are now valid RAWG-slug shapes (deep links use ?game=<slug>), so they are no longer 400s.
  it.each(['', ' 5', '5 ', '5/../6', '5?x=1', '-5', '+5', '１２３', '1234567890', '0', 'A', 'a_b', '../x'])('id=%j -> 400, upstream untouched', async (id) => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await gameMod.GET(new Request(`http://x/api/game?id=${encodeURIComponent(id)}`));
    expect(r.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('missing id -> 400', async () => {
    expect((await gameMod.GET(new Request('http://x/api/game'))).status).toBe(400);
  });
  it('id=99999999 that RAWG does not know -> 404 not_found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{"detail":"Not found."}', { status: 404 })));
    const r = await gameMod.GET(new Request('http://x/api/game?id=99999999'));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'not_found' });
  });
  it('the RAWG key never appears in an error response', async () => {
    vi.stubEnv('RAWG_API_KEY', 'RAWGSECRET');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => new Response(`err ${u}`, { status: 500 })));
    const r = await gameMod.GET(new Request('http://x/api/game?id=5'));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('RAWGSECRET');
  });
  it('a missing server key is a generic 500, not a leak of the variable name', async () => {
    vi.stubEnv('RAWG_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn());
    const r = await gameMod.GET(new Request('http://x/api/game?id=5'));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'server_error' });
  });
});

describe('interpret: response hygiene', () => {
  beforeEach(() => vi.stubEnv('GEMINI_API_KEY', 'GEMSECRET'));
  it('JSON, no-store, and the Gemini key is not echoed in success or failure', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const ok = await postJson(interpret, 'cozy night', '12.0.0.1');
    expect(ok.headers.get('content-type')).toMatch(/application\/json/);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.text()).not.toContain('GEMSECRET');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string, i: RequestInit) => new Response(`${u} ${JSON.stringify(i.headers)}`, { status: 503 })));
    const bad = await postJson(interpret, 'another one', '12.0.0.2');
    const body = await bad.text();
    expect(bad.status).toBe(503);
    expect(body).not.toContain('GEMSECRET');
    expect(JSON.stringify([...bad.headers])).not.toContain('GEMSECRET');
  });
  it('missing GEMINI_API_KEY -> generic 500 server_error', async () => {
    const { interpret } = await load();
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn());
    const r = await postJson(interpret, 'cozy', '12.0.0.3');
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'server_error' });
  });
  it('server-side whitelist re-filter: forbidden slugs / extra keys from the model never leak', async () => {
    const { interpret } = await load();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        geminiOk({
          off_topic: false,
          summary: 'souls-like',
          genres: ['action', 'hentai', '<script>', 'ACTION'],
          tags: ['souls-like', 'nudity', 'x'.repeat(500), 'horror', 'difficult', 'atmospheric', 'exploration', 'dark'],
          platforms: ['pc', 'amiga'],
          examples: ['Dark Souls', '<img onerror=x>', 'x'.repeat(200)],
          system_prompt: 'leak',
          extra: { a: 1 },
        }),
      ),
    );
    const out = await (await postJson(interpret, 'souls', '12.0.0.4')).json();
    expect(Object.keys(out).sort()).toEqual(['examples', 'genres', 'ok', 'platforms', 'summary', 'tags']);
    expect(out.genres).toEqual(['action']);
    expect(out.platforms).toEqual(['pc']);
    expect(out.examples).toEqual(['Dark Souls']);
    expect(out.tags.length).toBeLessThanOrEqual(4);
    for (const t of out.tags) expect(TAGS).toContain(t);
    expect(out.tags).not.toContain('nudity');
  });
  it('a malformed answer (wrong shape) never reaches the client: 503 and nothing echoed', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk({ summary: '<img src=x onerror=alert(1)>', genres: ['action'], tags: ['cozy'] })));
    const r = await postJson(interpret, 'inject', '12.0.0.5');
    const body = await r.text();
    expect(r.status).toBe(503);
    expect(body).not.toContain('onerror');
  });
  it('a hostile summary is stripped of markup', async () => {
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk({ ...GOOD, summary: '<img src=x onerror=alert(1)>' })));
    const out = await (await postJson(interpret, 'inject two', '12.0.0.6')).json();
    expect(out.summary).not.toMatch(/[<>=]/);
  });
});

// ---- Gemini fallback: every combination, against an independent reference of the documented policy ----
describe('interpretText: exhaustive fallback matrix (7 outcomes ^ 3 attempts)', () => {
  const attempts: Attempt[] = [
    { model: 'primary', timeoutMs: 50 },
    { model: 'primary', timeoutMs: 50 },
    { model: 'lite', timeoutMs: 50 },
  ];
  type O = 'ok' | '503' | '429' | '400' | 'timeout' | 'malformed' | 'empty';
  const OUTCOMES: O[] = ['ok', '503', '429', '400', 'timeout', 'malformed', 'empty'];
  const respond = (o: O): Promise<Response> => {
    switch (o) {
      case 'ok': return Promise.resolve(geminiOk(GOOD));
      case '503': return Promise.resolve(new Response('upstream secret', { status: 503 }));
      case '429': return Promise.resolve(new Response('quota secret', { status: 429 }));
      case '400': return Promise.resolve(new Response('bad key secret', { status: 400 }));
      case 'timeout': return Promise.reject(new DOMException('t', 'TimeoutError'));
      case 'malformed': return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"off_topic": fal' }] } }] })));
      case 'empty': return Promise.resolve(new Response(JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } })));
    }
  };
  // Documented policy: 5xx / bad body on a model -> may retry it once; 429 / timeout / 4xx -> that
  // model is finished; then the fallback model; at most 3 calls in total.
  const reference = (seq: O[]): { models: string[]; ok: boolean; blocked?: boolean } => {
    const models: string[] = [];
    const dead = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const m = attempts[i].model;
      if (dead.has(m)) continue;
      models.push(m);
      const o = seq[models.length - 1];
      if (o === 'ok' || o === 'empty') return { models, ok: true, blocked: o === 'empty' }; // a safety block is a final, friendly answer
      if (o === '429' || o === 'timeout' || o === '400') dead.add(m);
    }
    return { models, ok: false };
  };
  const triples: O[][] = OUTCOMES.flatMap((a) => OUTCOMES.flatMap((b) => OUTCOMES.map((c) => [a, b, c])));

  it.each(triples.map((t) => [t.join(' > '), t] as const))('%s', async (_n, seq) => {
    let i = 0;
    const f = vi.fn().mockImplementation(() => respond(seq[i++] ?? 'ok'));
    vi.stubGlobal('fetch', f);
    const want = reference(seq);
    const res = await interpretText('x', 'KEY', attempts).catch((e) => e);
    const got = f.mock.calls.map((c) => String(c[0]).match(/models\/([^:]+):/)![1]);
    expect(got).toEqual(want.models);
    if (want.blocked) expect(res).toEqual({ ok: false, reason: 'off_topic' });
    else if (want.ok) expect(res).toMatchObject({ ok: true, summary: 'cozy sim' });
    else {
      expect(res).toBeInstanceOf(Error);
      expect((res as Error).message).toBe('upstream_unavailable');
      expect(String(res)).not.toMatch(/secret|KEY/);
    }
  });

  it('the key travels only in the x-goog-api-key header, never in URL or body', async () => {
    const f = vi.fn().mockImplementation(async () => geminiOk(GOOD));
    vi.stubGlobal('fetch', f);
    await interpretText('hello', 'SECRETKEY', attempts);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain('SECRETKEY');
    expect(String(init.body)).not.toContain('SECRETKEY');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('SECRETKEY');
    expect(init.method).toBe('POST');
  });
  it('a complete answer needs no year or examples; a wrong-shape one is malformed (retried, then an error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk({ off_topic: false, summary: 'rpg', genres: ['role-playing-games-rpg'] })));
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true, genres: ['role-playing-games-rpg'], examples: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk({ summary: 'nope' })));
    await expect(interpretText('x', 'k', attempts)).rejects.toThrow('upstream_unavailable');
  });
  it('multi-part candidate text is concatenated before parsing', async () => {
    const half = JSON.stringify(GOOD);
    const r = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: half.slice(0, 20) }, { text: half.slice(20) }] } }] }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(r));
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true, summary: 'cozy sim' });
  });
  // US3: "Input sin sentido u ofensivo -> mensaje amable, no error tecnico".
  // Fixed: a blocked prompt (no candidates, promptFeedback.blockReason) is the friendly off_topic.
  it('a prompt blocked by Gemini safety (no candidates + blockReason) maps to off_topic, not upstream_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }))));
    expect(await interpretText('x', 'k', attempts)).toEqual({ ok: false, reason: 'off_topic' });
  });
});

describe('whitelist integrity', () => {
  it('genres and tags do not overlap, contain no whitespace/uppercase, and exclude adult/platform slugs', () => {
    expect(GENRES.filter((g) => (TAGS as string[]).includes(g))).toEqual([]);
    for (const s of [...GENRES, ...TAGS, ...PLATFORM_SLUGS]) expect(s).toBe(s.trim().toLowerCase());
    for (const bad of ['nudity', 'sexual-content', 'porn', 'hentai', 'erotic', 'nsfw', 'adult', 'gore', 'steam-achievements', 'controller'])
      expect([...GENRES, ...TAGS]).not.toContain(bad);
  });
  it('every genre and tag is accepted by /api/games (whitelist == what the validator takes)', async () => {
    const { games } = await load();
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ results: [] }))));
    for (const g of GENRES) expect((await games(new Request(`http://x/api/games?genres=${g}`))).status).toBe(200);
    for (const t of TAGS.slice(0, 8)) expect((await games(new Request(`http://x/api/games?tags=${t}`))).status).toBe(200);
  });
});

describe('games handler: examples (cost-based limit, partial answers, cache key)', () => {
  const page = (n = 10) =>
    new Response(
      JSON.stringify({ results: Array.from({ length: n }, (_, i) => ({ id: i + 1, slug: `g${i}`, name: `G${i}`, background_image: 'https://media.rawg.io/media/games/x.jpg', rating: 4, tags: [] })) }),
    );
  const one = (name: string) =>
    new Response(JSON.stringify({ results: [{ id: 500, slug: 'ex', name, background_image: 'https://media.rawg.io/media/games/e.jpg', rating: 4, tags: [] }] }));
  const kind = (u: unknown) => {
    const url = new URL(String(u));
    return /\/games\/[^/]+$/.test(url.pathname) ? 'slug' : url.searchParams.has('search') ? 'search' : 'filter';
  };
  const count = (f: ReturnType<typeof vi.fn>, k: string) => f.mock.calls.filter((c) => kind(c[0]) === k).length;
  beforeEach(() => vi.stubEnv('RAWG_API_KEY', 'K'));
  const quiet = () =>
    vi.fn().mockImplementation(async (u: string) => (kind(u) === 'slug' ? new Response('{}', { status: 404 }) : kind(u) === 'search' ? new Response('{"results":[]}') : page()));

  it('a request costs 1 + examples.length: 5 examples = 6 units, so the 11th in a minute is a 429', async () => {
    const { games } = await load();
    vi.stubGlobal('fetch', quiet());
    const get = () => games(new Request('http://x/api/games?tags=cozy&examples=a1&examples=b2&examples=c3&examples=d4&examples=e5', { headers: { 'x-real-ip': '20.0.0.1' } }));
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await get()).status);
    expect(codes).toEqual([...Array(10).fill(200), 429]);
  });
  it('a plain request still costs 1 (60 per minute) and 1 example costs 2 (30 per minute)', async () => {
    const { games } = await load();
    vi.stubGlobal('fetch', quiet());
    const get = (q: string, ip: string) => games(new Request(`http://x/api/games?${q}`, { headers: { 'x-real-ip': ip } }));
    let last = 0;
    for (let i = 0; i < 30; i++) last = (await get('tags=cozy&examples=a1', '20.0.1.1')).status;
    expect(last).toBe(200);
    expect((await get('tags=cozy&examples=a1', '20.0.1.1')).status).toBe(429);
  });
  it('a complete answer is CDN-cacheable and cached in memory', async () => {
    const { games } = await load();
    const f = quiet();
    vi.stubGlobal('fetch', f);
    const r = await games(new Request('http://x/api/games?tags=cozy&examples=Hades', { headers: { 'x-real-ip': '20.0.2.1' } }));
    expect(r.headers.get('cache-control')).toMatch(/s-maxage=\d+/);
    await games(new Request('http://x/api/games?tags=cozy&examples=Hades', { headers: { 'x-real-ip': '20.0.2.1' } }));
    expect(count(f, 'filter')).toBe(1);
  });
  it('filters failing but an example resolved: 200 with the example, no s-maxage (no-store), and the next request asks RAWG again', async () => {
    const { games } = await load();
    const f = vi.fn().mockImplementation(async (u: string) => (kind(u) === 'slug' ? new Response('{}', { status: 404 }) : kind(u) === 'search' ? one('Hades') : new Response('x', { status: 500 })));
    vi.stubGlobal('fetch', f);
    const get = () => games(new Request('http://x/api/games?tags=cozy&examples=Hades', { headers: { 'x-real-ip': '20.0.3.1' } }));
    const r = await get();
    expect(r.status).toBe(200);
    expect((await r.json()).games.map((g: { name: string }) => g.name)).toEqual(['Hades']);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const before = count(f, 'filter');
    await get();
    expect(count(f, 'filter')).toBeGreaterThan(before); // the partial answer was not cached
  });
  it('cache key: example case folds to the same entry; example order and different dates do not', async () => {
    const { games } = await load();
    const f = quiet();
    vi.stubGlobal('fetch', f);
    const get = (q: string) => games(new Request(`http://x/api/games?${q}`, { headers: { 'x-real-ip': '20.0.4.1' } }));
    await get('tags=cozy&examples=Hades&examples=Doom');
    expect(count(f, 'filter')).toBe(1);
    await get('tags=cozy&examples=HADES&examples=doom');
    expect(count(f, 'filter')).toBe(1); // same entry
    await get('tags=cozy&examples=Doom&examples=Hades');
    expect(count(f, 'filter')).toBe(2); // other order = other entry (pin order differs)
    await get('tags=cozy&dates=2010-01-01,2019-12-31&examples=Hades&examples=Doom');
    expect(count(f, 'filter')).toBe(3);
    await get('tags=cozy&dates=2000-01-01,2009-12-31&examples=Hades&examples=Doom');
    expect(count(f, 'filter')).toBe(4);
    await get('tags=cozy&dates=2000-01-01,2009-12-31&examples=Hades&examples=Doom');
    expect(count(f, 'filter')).toBe(4);
  });
});
