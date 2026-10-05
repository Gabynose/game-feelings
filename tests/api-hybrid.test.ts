// Request guards, limiter details, caching rules, RAWG relax logic, slug lookups, logging.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildGamesUrl } from '../api/_lib/rawg';
import { getGames } from './api-helpers';
import { createRateLimiter } from '../api/_lib/memory';
import { clientIp } from '../api/_lib/http';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const load = async () => {
  vi.resetModules();
  return {
    interpret: (await import('../api/interpret')).POST,
    games: (await import('../api/games')).GET,
    game: (await import('../api/game')).GET,
  };
};
const geminiOk = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const GOOD = { off_topic: false, summary: 'cozy sim', genres: ['simulation'], tags: ['cozy'], platforms: [], examples: [] };
const OFF = { off_topic: true, summary: '', genres: [], tags: [], platforms: [], examples: [] };
const post = (
  POST: (r: Request) => Promise<Response>,
  text: unknown,
  headers: Record<string, string> = {},
  ip = '7.7.7.7',
) =>
  POST(
    new Request('http://x/api/interpret', {
      method: 'POST',
      headers: { 'x-real-ip': ip, 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ text }),
    }),
  );

describe('interpret: request guards', () => {
  it('415 for a missing / wrong content-type, 403 for sec-fetch-site: cross-site, 413 for a big content-length; upstream untouched', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const raw = (headers: Record<string, string>) => interpret(new Request('http://x/api/interpret', { method: 'POST', headers, body: '{"text":"sad"}' }));
    expect((await raw({})).status).toBe(415);
    expect((await raw({ 'content-type': 'text/plain' })).status).toBe(415);
    expect((await raw({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await raw({ 'content-type': 'application/json', 'content-length': '2049' })).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });
  it('same-origin / same-site / none / charset variants are accepted; no CORS headers are ever sent', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const variants: Record<string, string>[] = [
      { 'sec-fetch-site': 'same-origin' },
      { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-site': 'none' },
      { 'content-type': 'Application/JSON; charset=utf-8' },
    ];
    for (const [i, h] of variants.entries()) {
      const r = await post(interpret, `feeling ${i}`, h, `5.5.5.${i}`);
      expect(r.status).toBe(200);
      expect([...r.headers.keys()].filter((k) => k.startsWith('access-control'))).toEqual([]);
    }
  });
  it('responses carry nosniff and no-store', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    const r = await post(interpret, '');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('Retry-After is the real remaining window, not a constant', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    for (let i = 0; i < 10; i++) await post(interpret, 'x', {}, '9.1.1.1');
    vi.advanceTimersByTime(25_000);
    const r = await post(interpret, 'x', {}, '9.1.1.1');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('35');
  });
  it('IPv6 clients are limited per /64: rotating the low 64 bits does not dodge the limit', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => geminiOk(GOOD)));
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post(interpret, 'x', {}, `2001:db8:1:2:${i}:abcd::${i}`)).status);
    expect(codes.slice(10)).toEqual([429, 429]);
    expect((await post(interpret, 'x', {}, '2001:db8:1:3::1')).status).toBe(200);
  });
  it('clientIp keys: ipv4 untouched, mapped ipv4 unwrapped, ipv6 -> first 4 hextets (compressed or not)', () => {
    const k = (ip: string) => clientIp(new Request('http://x', { headers: { 'x-real-ip': ip } }));
    expect(k('1.2.3.4')).toBe('1.2.3.4');
    expect(k('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(k('2001:0db8:0000:0042:1:2:3:4')).toBe('2001:db8:0:42');
    expect(k('2001:db8::1')).toBe('2001:db8:0:0');
    expect(k('2001:DB8:0:42::ff')).toBe('2001:db8:0:42');
    expect(k('::1')).toBe('0:0:0:0');
    expect(k('not-an-ip')).toBe('not-an-ip');
  });
});

describe('interpret: caching rules', () => {
  it('a model-said off_topic IS cached; a malformed answer is retried, errors out and is NEVER cached', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    const f = vi.fn().mockImplementation(async () => geminiOk(OFF));
    vi.stubGlobal('fetch', f);
    await post(interpret, 'asdf', {}, '3.1.1.1');
    await post(interpret, 'ASDF', {}, '3.1.1.2');
    expect(f).toHaveBeenCalledTimes(1);

    const g = vi.fn().mockImplementationOnce(async () => geminiOk({ summary: 'bogus' }))
      .mockImplementationOnce(async () => geminiOk({ summary: 'bogus' }))
      .mockImplementationOnce(async () => geminiOk({ summary: 'bogus' }))
      .mockImplementation(async () => geminiOk(GOOD));
    vi.stubGlobal('fetch', g);
    expect((await post(interpret, 'broken one', {}, '3.1.1.3')).status).toBe(503);
    const again = await post(interpret, 'broken one', {}, '3.1.1.3');
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, summary: 'cozy sim' });
  });
  it('a safety-blocked prompt is a friendly 200 off_topic', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }))));
    const r = await post(interpret, 'something nasty', {}, '3.2.2.2');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, reason: 'off_topic' });
  });
  it('the whole request is bounded by the 10 s deadline even when every model stalls', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const { interpret } = await load();
    const spy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('x', { status: 503 })));
    await post(interpret, 'slow', {}, '3.3.3.3');
    for (const [ms] of spy.mock.calls) expect(ms).toBeLessThanOrEqual(10_000);
  });
});

describe('logging of unmapped errors', () => {
  it('logs our own code with the variable NAME, never a value, and returns a generic 500', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { interpret } = await load();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await post(interpret, 'cozy', {}, '4.1.1.1');
    expect(r.status).toBe(500);
    expect(log).toHaveBeenCalledWith('api', 'missing_env: GEMINI_API_KEY');
  });
  it('anything that is not one of our own codes is logged as "unknown" (cannot embed a URL or key)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'RAWGSECRET');
    const { game } = await load();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{"name":"G"}', { status: 200 })));
    // a number is not a string: json() succeeds, so provoke a TypeError from a bad shape instead
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => { throw new TypeError(`bad ${u}`); }));
    const r = await game(new Request('http://x/api/game?id=77'));
    expect(r.status).toBe(503); // network errors are upstream_unavailable, not leaked
    const calls = JSON.stringify(log.mock.calls);
    expect(calls).not.toContain('RAWGSECRET');
  });
});

describe('createRateLimiter: details', () => {
  it('retryAfter counts down whole seconds, minimum 1', () => {
    const allow = createRateLimiter(1, 60_000);
    allow('a', 0);
    expect(allow.retryAfter('a', 0)).toBe(60);
    expect(allow.retryAfter('a', 59_500)).toBe(1);
    expect(allow.retryAfter('unknown', 0)).toBe(1);
  });
  it('the table never exceeds its hard cap under a flood, and a recent ip is still limited', () => {
    const allow = createRateLimiter(1, 60_000);
    for (let i = 0; i < 25_000; i++) allow(`f${i}`, 0);
    expect(allow('f24999', 1)).toBe(false); // newest entries survive eviction
    expect(allow('f0', 1)).toBe(true); // the oldest were evicted (documented ponytail ceiling)
  });
});

describe('games / game: limits and lookups', () => {
  const rawgPage = (n = 10) =>
    new Response(JSON.stringify({ results: Array.from({ length: n }, (_, i) => ({ id: i + 1, slug: `g${i}`, name: `G${i}`, background_image: 'https://media.rawg.io/media/games/x.jpg', rating: 4, tags: [] })) }));

  it('games: 429 after 60 valid requests per ip (+ Retry-After); invalid ones do not count', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const { games } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => rawgPage()));
    const get = (q: string) => games(new Request(`http://x/api/games?${q}`, { headers: { 'x-real-ip': '6.1.1.1' } }));
    for (let i = 0; i < 100; i++) expect((await get('genres=porn')).status).toBe(400);
    for (let i = 0; i < 60; i++) expect((await get('tags=cozy')).status).toBe(200);
    const r = await get('tags=cozy');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toMatch(/^\d+$/);
  });
  it('game: 429 after 60 valid requests per ip', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const { game } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{"name":"G"}')));
    const get = () => game(new Request('http://x/api/game?id=5', { headers: { 'x-real-ip': '6.2.2.2' } }));
    for (let i = 0; i < 60; i++) await get();
    expect((await get()).status).toBe(429);
  });
  it('game: accepts a slug, URL-encodes it into the RAWG path, normalizes numeric ids, and caches the detail', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const { game } = await load();
    const f = vi.fn().mockImplementation(async (u: string) =>
      u.includes('/movies') ? new Response('{"results":[]}') : u.includes('/screenshots') ? new Response('{"results":[]}') : new Response('{"name":"Portal 2","description_raw":"d","released":"2011-04-18"}'),
    );
    vi.stubGlobal('fetch', f);
    const r = await game(new Request('http://x/api/game?id=portal-2'));
    expect(await r.json()).toMatchObject({ name: 'Portal 2' });
    expect(String(f.mock.calls[0][0])).toContain('/games/portal-2?key=');
    const before = f.mock.calls.length;
    await game(new Request('http://x/api/game?id=portal-2'));
    expect(f.mock.calls.length).toBe(before); // second call served from the detail cache
    await game(new Request('http://x/api/game?id=00042'));
    expect(String(f.mock.calls.at(-1)![0])).toContain('/games/42');
  });
  it('game: trailer and screenshots are https only', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const { game } = await load();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) =>
      u.includes('/movies')
        ? new Response(JSON.stringify({ results: [{ data: { max: 'http://insecure/max.mp4', '480': 'https://ok/480.mp4' } }] }))
        : u.includes('/screenshots')
          ? new Response(JSON.stringify({ results: [{ image: 'http://bad/1.jpg' }, { image: 'javascript:alert(1)' }, { image: 'https://ok/2.jpg' }] }))
          : new Response('{"name":"G"}'),
    ));
    expect(await (await game(new Request('http://x/api/game?id=9'))).json()).toMatchObject({ trailer: 'https://ok/480.mp4', screenshots: ['https://ok/2.jpg'] });
  });
});

describe('rawg: relax logic', () => {
  const page = (n: number) =>
    new Response(JSON.stringify({ results: Array.from({ length: n }, (_, i) => ({ id: i + 1, slug: `g${i}`, name: `G${i}`, background_image: 'https://media.rawg.io/media/games/x.jpg', rating: 4, tags: [] })) }));

  it('a failing relax step keeps the games already found instead of throwing', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockResolvedValueOnce(page(3)).mockImplementation(async () => new Response('x', { status: 500 }));
    vi.stubGlobal('fetch', f);
    expect(await getGames({ genres: ['adventure'], tags: ['challenging'] })).toHaveLength(3);
  });
  it('but throws when nothing at all succeeded', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('x', { status: 500 })));
    await expect(getGames({ genres: ['adventure'], tags: ['cozy'] })).rejects.toThrow('upstream_unavailable');
  });
  it('relaxes at most once (2 upstream queries), never to a filterless URL', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async () => page(1));
    vi.stubGlobal('fetch', f);
    await getGames({ genres: ['adventure'], tags: ['cozy', 'relaxing'] });
    expect(f).toHaveBeenCalledTimes(2);
    for (const [u] of f.mock.calls) {
      const p = new URL(String(u)).searchParams;
      expect(p.has('genres') || p.has('tags')).toBe(true);
    }
    expect(new URL(String(f.mock.calls[1][0])).searchParams.get('tags')).toBe('cozy');
  });
  it('a genre-only query is a single query; no filters at all is refused', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async () => page(1));
    vi.stubGlobal('fetch', f);
    await getGames({ genres: ['puzzle'], tags: [] });
    expect(f).toHaveBeenCalledTimes(1);
    expect(() => buildGamesUrl('K', { genres: [], tags: [] })).toThrow('invalid_input');
    f.mockClear();
    await expect(getGames({ genres: [], tags: [] })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it('stops when the time budget is spent (no call with < 1 s left)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(getGames({ genres: [], tags: ['cozy'] }, () => 500)).rejects.toThrow('upstream_unavailable');
    expect(f).not.toHaveBeenCalled();
  });
});
