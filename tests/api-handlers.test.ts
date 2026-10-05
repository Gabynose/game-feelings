import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '../api/interpret';
import { GET as games } from '../api/games';
import { GET as game } from '../api/game';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const post = (text: unknown, ip = '9.9.9.9') =>
  POST(new Request('http://x/api/interpret', { method: 'POST', headers: { 'x-real-ip': ip, 'content-type': 'application/json' }, body: JSON.stringify({ text }) }));
const gemini = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe('POST /api/interpret', () => {
  it('400 invalid_input for bad bodies, before touching upstream', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const t of ['', '   ', 5, 'a'.repeat(201)]) {
      const r = await post(t);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'invalid_input' });
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('returns the sanitized interpretation and caches by normalized text', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    const f = vi.fn().mockResolvedValue(
      gemini({
        off_topic: false, summary: 'souls-like', genres: ['action', 'hentai'], tags: ['souls-like', 'nudity'], platforms: ['nintendo-switch'],
        year_from: 2010, year_to: 2019, examples: ['Dark Souls', 'Elden Ring', '<b>x</b>'],
      }),
    );
    vi.stubGlobal('fetch', f);
    const a = await (await post('Quiero un  SOULS-like', '1.1.1.1')).json();
    const b = await (await post('quiero un souls-like', '1.1.1.1')).json();
    expect(a).toEqual({
      ok: true, summary: 'souls-like', genres: ['action'], tags: ['souls-like'], platforms: ['nintendo-switch'],
      years: [2010, 2019], examples: ['Dark Souls', 'Elden Ring'],
    });
    expect(b).toEqual(a);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('off_topic is a normal 200 response', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gemini({ off_topic: true, summary: '', genres: [], tags: [], platforms: [], examples: [] })));
    const r = await post('asdf qwerty', '2.2.2.2');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, reason: 'off_topic' });
  });
  it('503 upstream_unavailable when every model fails, without leaking anything', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'SECRETKEY');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('secret upstream', { status: 503 })));
    const r = await post('unique failing text', '3.3.3.3');
    const body = await r.text();
    expect(r.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ error: 'upstream_unavailable' });
    expect(body).not.toMatch(/secret/i);
  });
  it('429 rate_limited after 10 requests per ip per minute', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gemini({ off_topic: true, summary: '', genres: [], tags: [], platforms: [], examples: [] })));
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post('same text', '4.4.4.4')).status);
    expect(codes).toEqual([...Array(10).fill(200), 429, 429]);
  });
});

describe('GET /api/games and /api/game validation', () => {
  it('games: 400 on unknown slug or empty query', async () => {
    for (const q of ['', '?genres=porn', '?tags=nudity']) {
      const r = await games(new Request(`http://x/api/games${q}`));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'invalid_input' });
    }
  });
  it('game: 400 on a non-numeric id, 404 when RAWG says so', async () => {
    expect((await game(new Request('http://x/api/game?id=../x'))).status).toBe(400);
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{}', { status: 404 })));
    const r = await game(new Request('http://x/api/game?id=123'));
    expect(r.status).toBe(404);
    expect(r.headers.get('cache-control')).toBe('public, s-maxage=300');
    expect(await r.json()).toEqual({ error: 'not_found' });
  });
  it('game: maps description_raw, trailer (max, then 480) and screenshots; trailer may be null', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (u: string) => {
        if (u.includes('/movies')) return new Response(JSON.stringify({ results: [{ data: { '480': 'https://v/480.mp4', max: 'https://v/max.mp4' } }] }));
        if (u.includes('/screenshots')) return new Response(JSON.stringify({ results: [{ image: 'https://i/1.jpg' }, { image: 'https://i/2.jpg' }] }));
        return new Response(JSON.stringify({ name: 'G', description_raw: 'plain', released: '2020-01-01', description: '<p>html</p>', rating: 4.256, ratings_count: 10, metacritic: 88, website: 'x',
          platforms: [{ platform: { id: 4, name: 'PC', slug: 'pc' } }, { platform: { name: 'PC' } }, { platform: { name: 7 } }, { nope: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ platform: { name: 'P' + i } }))],
          genres: Array.from({ length: 7 }, (_, i) => ({ id: i, name: 'G' + i })) }));
      }),
    );
    expect(await (await game(new Request('http://x/api/game?id=1'))).json()).toEqual({
      name: 'G', description: 'plain', released: '2020-01-01', trailer: 'https://v/max.mp4', screenshots: ['https://i/1.jpg', 'https://i/2.jpg'],
      platforms: ['PC', ...Array.from({ length: 11 }, (_, i) => 'P' + i)], genres: ['G0', 'G1', 'G2', 'G3', 'G4'], rating: 4.3, metacritic: 88,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (u: string) => {
        if (u.includes('/movies')) return new Response(JSON.stringify({ count: 0, results: [] }));
        if (u.includes('/screenshots')) return new Response('boom', { status: 500 });
        return new Response(JSON.stringify({ name: 'G', description_raw: 'plain', released: null }));
      }),
    );
    const d = await (await game(new Request('http://x/api/game?id=2'))).json();
    expect(d).toMatchObject({ trailer: null, screenshots: [], released: null, platforms: [], genres: [], rating: null, metacritic: null });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => (u.includes('/movies') || u.includes('/screenshots') ? new Response('{}') : new Response(JSON.stringify({ name: 'G', rating: 4.5, ratings_count: 0, metacritic: '90', platforms: 'x', genres: null })))));
    expect(await (await game(new Request('http://x/api/game?id=3'))).json()).toMatchObject({ rating: null, metacritic: null, platforms: [], genres: [] });
  });
});

describe('GET /api/games with the requirement parameters', () => {
  const g = (id: number, name: string) => ({ id, slug: `g${id}`, name, background_image: 'https://media.rawg.io/media/games/x.jpg', rating: 4, tags: [] });
  it('400 on bad platforms, dates or examples; upstream untouched', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const bad = [
      'genres=action&platforms=atari',
      'genres=action&dates=nope',
      'genres=action&dates=2019-01-01,2010-01-01',
      'genres=action&examples=%3Cb%3E',
      'genres=action&examples=a&examples=b&examples=c&examples=d&examples=e&examples=f',
      'dates=2010-01-01,2019-12-31',
    ];
    for (const q of bad) expect((await games(new Request(`http://x/api/games?${q}`))).status, q).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('sends platform ids, dates and verified examples to RAWG, and returns pinned examples first', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async (u: string) => {
      const p = new URL(String(u)).searchParams;
      if (p.has('search')) return new Response(JSON.stringify({ results: p.get('search') === 'Hollow Knight' ? [g(7, 'Hollow Knight')] : [g(99, 'Something Else')] }));
      return new Response(JSON.stringify({ results: [g(1, 'Dead Cells'), g(2, 'Ori')] }));
    });
    vi.stubGlobal('fetch', f);
    const r = await games(new Request('http://x/api/games?genres=action&tags=metroidvania&platforms=nintendo-switch&dates=2015-01-01,2022-12-31&examples=Hollow%20Knight&examples=Totally%20Invented', { headers: { 'x-real-ip': '5.5.5.5' } }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.games.map((x: { name: string }) => x.name)).toEqual(['Hollow Knight', 'Dead Cells', 'Ori']);
    const filterCall = f.mock.calls.map((c) => new URL(String(c[0])).searchParams).find((p) => p.has('platforms'))!;
    expect(filterCall.get('platforms')).toBe('7');
    expect(filterCall.get('dates')).toBe('2015-01-01,2022-12-31');
  });
});
