// Client side of phase 4b: src/lib/api.ts (every response becomes an Outcome, nothing throws),
// the dev mock finder, and the narrator line for each Outcome (src/sections/screen.ts lineFor).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findGames, type Outcome } from '../src/lib/api';
import { mockFinder, MOCKS } from '../src/dev/mock';
import { content } from '../src/content';
import { MOCK_GAMES } from '../src/dev/mock-games';
import { fill } from '../src/lib/dom';

const game = { id: 7, slug: 'celeste', name: 'Celeste', released: '2018-01-25', image: 'https://img.example/celeste.jpg' };
const interp = { ok: true, summary: 'co-op adventure', genres: ['adventure'], tags: ['co-op', 'story-rich'], platforms: ['nintendo-switch'], years: [2010, 2019], examples: ['It Takes Two', 'Portal 2'] };
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const route = (interpret: () => Response | Promise<Response>, games: () => Response | Promise<Response> = () => json({ games: [game] })) =>
  fetchMock.mockImplementation((url: string) => (String(url).startsWith('/api/interpret') ? interpret() : games()));

describe('findGames: happy path', () => {
  it('returns results with the summary from the API', async () => {
    route(() => json(interp));
    expect(await findGames('I miss someone', () => undefined)).toEqual({ kind: 'results', summary: 'co-op adventure', games: [game] });
  });

  it('announces the summary before the games request is made', async () => {
    const order: string[] = [];
    fetchMock.mockImplementation((url: string) => { order.push(String(url).split('?')[0]); return Promise.resolve(String(url).startsWith('/api/interpret') ? json(interp) : json({ games: [game] })); });
    await findGames('x', (summary) => order.push(`onInterpreted:${summary}`));
    expect(order).toEqual(['/api/interpret', 'onInterpreted:co-op adventure', '/api/games']);
  });

  it('sends the text as JSON by POST and the filters as query by GET', async () => {
    route(() => json(interp));
    await findGames('I feel so in love', () => undefined);
    const [url1, init1] = fetchMock.mock.calls[0];
    expect(url1).toBe('/api/interpret');
    expect(init1.method).toBe('POST');
    expect(init1.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init1.body)).toEqual({ text: 'I feel so in love' });
    const [url2, init2] = fetchMock.mock.calls[1];
    const q = new URL(url2, 'http://x').searchParams;
    expect(q.get('genres')).toBe('adventure');
    expect(q.get('tags')).toBe('co-op,story-rich');
    expect(q.get('platforms')).toBe('nintendo-switch');
    expect(q.get('dates')).toBe('2010-01-01,2019-12-31');
    expect(q.getAll('examples')).toEqual(['It Takes Two', 'Portal 2']);
    expect(init2.method ?? 'GET').toBe('GET');
  });

  it('drops malformed game entries instead of failing', async () => {
    route(() => json(interp), () => json({ games: [game, { id: 'x' }, null, 5, { ...game, id: 8, image: undefined }] }));
    const o = await findGames('x', () => undefined);
    expect(o).toEqual({ kind: 'results', summary: 'co-op adventure', games: [game] });
  });

  it('is no-results (with the summary) when RAWG returns no games, or only malformed ones', async () => {
    route(() => json(interp), () => json({ games: [] }));
    expect(await findGames('x', () => undefined)).toEqual({ kind: 'no-results', summary: 'co-op adventure' });
    route(() => json(interp), () => json({ games: [{ nope: true }] }));
    expect(await findGames('x', () => undefined)).toEqual({ kind: 'no-results', summary: 'co-op adventure' });
  });

  it('reports off-topic without calling /api/games or announcing a summary', async () => {
    const seen = vi.fn();
    route(() => json({ ok: false, reason: 'off_topic' }));
    expect(await findGames('what is the capital of France', seen)).toEqual({ kind: 'off-topic' });
    expect(seen).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('findGames: every failure is an Outcome, never an exception', () => {
  const err = (reason: string, retryAfter?: number): Outcome => ({ kind: 'error', reason, ...(retryAfter === undefined ? {} : { retryAfter }) }) as Outcome;

  it.each([
    ['Retry-After: 7', { 'Retry-After': '7' }, 7],
    ['Retry-After: 2.2 (rounds up)', { 'Retry-After': '2.2' }, 3],
    ['no Retry-After', {}, 10],
    ['Retry-After: 0', { 'Retry-After': '0' }, 10],
    ['Retry-After: soon (not a number)', { 'Retry-After': 'soon' }, 10],
    ['Retry-After: 120 (the cap itself)', { 'Retry-After': '120' }, 120],
    ['Retry-After: 121 (capped at 120)', { 'Retry-After': '121' }, 120],
    ['Retry-After: 3600 (a broken header must not say "wait an hour")', { 'Retry-After': '3600' }, 120],
    ['Retry-After: Infinity (capped at 120)', { 'Retry-After': 'Infinity' }, 120],
    ['Retry-After: -5 (never below 1 s)', { 'Retry-After': '-5' }, 1],
  ])('429 with %s -> rate limited, retryAfter %s s', async (_n, headers, seconds) => {
    route(() => new Response('{}', { status: 429, headers }));
    expect(await findGames('x', () => undefined)).toEqual(err('rate', seconds));
  });

  it('503 -> busy, on either endpoint', async () => {
    route(() => new Response('{}', { status: 503 }));
    expect(await findGames('x', () => undefined)).toEqual(err('busy'));
    route(() => json(interp), () => new Response('{}', { status: 503 }));
    expect(await findGames('x', () => undefined)).toEqual(err('busy'));
  });

  it.each([400, 403, 405, 413, 415, 500, 502])('HTTP %s -> bad (a bug, generic message)', async (status) => {
    route(() => new Response('{}', { status }));
    expect(await findGames('x', () => undefined)).toEqual(err('bad'));
  });

  it('a 200 with a non-JSON body (an HTML error page) -> bad', async () => {
    route(() => new Response('<html>Bad gateway</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect(await findGames('x', () => undefined)).toEqual(err('bad'));
  });

  it.each([
    ['JSON null', null],
    ['a JSON string', 'hello'],
    ['an empty object', {}],
    ['summary of the wrong type', { ...interp, summary: 5 }],
    ['genres that are not strings', { ...interp, genres: [1] }],
    ['tags that are not an array', { ...interp, tags: 'cozy' }],
    ['platforms missing', { ok: true, summary: 'x', genres: [], tags: [], examples: [] }],
    ['examples that are not strings', { ...interp, examples: [3] }],
    ['years that are not a pair of numbers', { ...interp, years: ['2010', 2019] }],
    ['years with three entries', { ...interp, years: [2010, 2015, 2019] }],
    ['ok:false with an unknown reason', { ok: false, reason: 'weird' }],
  ])('a 200 with %s -> bad', async (_n, body) => {
    route(() => json(body));
    expect(await findGames('x', () => undefined)).toEqual(err('bad'));
  });

  it('an empty summary is fine: it is passed on trimmed so the narrator uses the plain line', async () => {
    const seen = vi.fn();
    route(() => json({ ...interp, summary: '  ' }));
    expect(await findGames('x', seen)).toEqual({ kind: 'results', summary: '', games: [game] });
    expect(seen).toHaveBeenCalledWith('');
  });

  it('without years the request carries no dates; without any filter or example it does not call /api/games', async () => {
    route(() => json({ ...interp, years: undefined }));
    await findGames('x', () => undefined);
    expect(new URL(fetchMock.mock.calls[1][0], 'http://x').searchParams.has('dates')).toBe(false);
    fetchMock.mockClear();
    route(() => json({ ...interp, genres: [], tags: [], platforms: [], examples: [] }));
    expect(await findGames('x', () => undefined)).toEqual({ kind: 'no-results', summary: 'co-op adventure' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('games response without a games array -> bad', async () => {
    route(() => json(interp), () => json({ games: 'none' }));
    expect(await findGames('x', () => undefined)).toEqual(err('bad'));
  });

  it('a network failure (fetch rejects with TypeError) -> network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await findGames('x', () => undefined)).toEqual(err('network'));
  });

  it('a client timeout (TimeoutError) -> slow, whether it hits on the request or while reading the body', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await findGames('x', () => undefined)).toEqual(err('slow'));
    route(() => ({ status: 200, ok: true, headers: new Headers(), json: () => Promise.reject(new DOMException('timed out', 'TimeoutError')) }) as unknown as Response);
    expect(await findGames('x', () => undefined)).toEqual(err('slow'));
  });

  it('gives each request its own time limit: 12 s to interpret, 14 s for games (server budgets are ~10 s and ~12 s)', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    route(() => json(interp));
    await findGames('x', () => undefined);
    expect(spy.mock.calls.map((c) => c[0])).toEqual([12_000, 14_000]);
  });
});

describe('mockFinder (DEV ?mock=...)', () => {
  const run = async (kind: (typeof MOCKS)[number]) => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const p = mockFinder(kind)('anything', (l) => seen.push(l));
    await vi.runAllTimersAsync();
    return { outcome: await p, seen };
  };

  it('offers the 9 outcomes the tester relies on', () => {
    expect([...MOCKS]).toEqual(['results', 'empty', 'offtopic', 'error', 'rate', 'busy', 'network', 'slow', 'timeout']);
  });

  it.each([
    ['results', { kind: 'results', summary: 'cozy indie games', games: MOCK_GAMES }, ['cozy indie games']],
    ['slow', { kind: 'results', summary: 'cozy indie games', games: MOCK_GAMES }, ['cozy indie games']],
    ['empty', { kind: 'no-results', summary: 'single-player metroidvania for Switch' }, ['single-player metroidvania for Switch']],
    ['offtopic', { kind: 'off-topic' }, []],
    ['error', { kind: 'error', reason: 'bad' }, []],
    ['rate', { kind: 'error', reason: 'rate', retryAfter: 12 }, []],
    ['busy', { kind: 'error', reason: 'busy' }, []],
    ['network', { kind: 'error', reason: 'network' }, []],
    ['timeout', { kind: 'error', reason: 'slow' }, []],
  ] as const)('%s', async (kind, outcome, seen) => {
    const r = await run(kind);
    expect(r.outcome).toEqual(outcome);
    expect(r.seen).toEqual(seen);
  });

  it('slow and timeout take longer than the 4 s "still thinking" threshold; the others do not', async () => {
    vi.useFakeTimers();
    for (const [kind, over] of [['slow', true], ['timeout', true], ['results', false], ['busy', false]] as const) {
      let done = false;
      void mockFinder(kind)('x', () => undefined).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(4000);
      expect(done, kind).toBe(!over);
      await vi.runAllTimersAsync();
    }
  });
});

describe('narrator line per outcome (lineFor)', () => {
  const n = content.narrator;
  // screen.ts reads matchMedia at import time; the stub means "no reduced motion, fine pointer"
  const load = async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    return (await import('../src/sections/screen')).lineFor;
  };

  it('maps every outcome to its state and its line (DESIGN §14.6)', async () => {
    const lineFor = await load();
    expect(lineFor({ kind: 'results', summary: 'co-op adventure', games: [] })).toEqual(['results', 'Ooh, co-op adventure! Try these.']);
    expect(lineFor({ kind: 'results', summary: 'single-player metroidvania for Switch', games: [] })).toEqual(['results', n.resultsPlain]); // 37 chars: over the 26 limit
    expect(lineFor({ kind: 'results', summary: '', games: [] })).toEqual(['results', n.resultsPlain]);
    expect(lineFor({ kind: 'no-results', summary: 'cozy' })).toEqual(['no-results', n.noResults]);
    expect(lineFor({ kind: 'off-topic' })).toEqual(['no-results', n.offTopic]);
    expect(lineFor({ kind: 'error', reason: 'busy' })).toEqual(['error', n.errorBusy]);
    expect(lineFor({ kind: 'error', reason: 'network' })).toEqual(['error', n.errorNetwork]);
    expect(lineFor({ kind: 'error', reason: 'slow' })).toEqual(['error', n.errorSlow]);
    expect(lineFor({ kind: 'error', reason: 'bad' })).toEqual(['error', n.error]);
  });

  it('puts the Retry-After seconds in the rate-limit line, defaulting to 10', async () => {
    const lineFor = await load();
    expect(lineFor({ kind: 'error', reason: 'rate', retryAfter: 12 })).toEqual(['error', 'Too many searches in a row. Try again in 12s.']);
    expect(lineFor({ kind: 'error', reason: 'rate' })).toEqual(['error', 'Too many searches in a row. Try again in 10s.']);
  });
});

describe('fill (content templates)', () => {
  it('replaces known slots, leaves unknown ones visible, and never evaluates the value as HTML or a pattern', () => {
    expect(fill('Ooh, {summary}!', { summary: 'co-op adventure' })).toBe('Ooh, co-op adventure!');
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(fill('{summary}', { summary: '$& <b>x</b>' })).toBe('$& <b>x</b>');
  });
});
