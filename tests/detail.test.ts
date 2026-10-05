// Phase 6 client side: getGame (404 is its own result) and the pure helpers of src/sections/detail.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGame } from '../src/lib/api';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('getGame', () => {
  it('returns the detail and encodes the slug', async () => {
    fetchMock.mockResolvedValue(json({ name: 'Celeste', description: 'Climb.', released: '2018-01-25', trailer: null, screenshots: ['https://x/a.jpg'] }));
    expect(await getGame('a b')).toEqual({ kind: 'ok', detail: { name: 'Celeste', description: 'Climb.', released: '2018-01-25', trailer: null, screenshots: ['https://x/a.jpg'], platforms: [], genres: [], rating: null, metacritic: null } });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/game?id=a%20b');
  });

  it('404 is not-found; 429 keeps Retry-After; 503, 500 and odd bodies are errors', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await getGame('x')).toEqual({ kind: 'not-found' });
    fetchMock.mockResolvedValueOnce(json({}, 400));
    expect(await getGame('X')).toEqual({ kind: 'not-found' });
    fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '7' }));
    expect(await getGame('x')).toEqual({ kind: 'error', reason: 'rate', retryAfter: 7 });
    fetchMock.mockResolvedValueOnce(json({}, 503));
    expect(await getGame('x')).toEqual({ kind: 'error', reason: 'busy' });
    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect(await getGame('x')).toEqual({ kind: 'error', reason: 'bad' });
    fetchMock.mockResolvedValueOnce(json({ nope: 1 }));
    expect(await getGame('x')).toEqual({ kind: 'error', reason: 'bad' });
  });

  it('keeps only https trailer and screenshots', async () => {
    fetchMock.mockResolvedValue(json({ name: 'A', trailer: 'http://x/t.mp4', screenshots: ['http://x/a.jpg', 'https://x/b.jpg'] }));
    expect(await getGame('a')).toMatchObject({ kind: 'ok', detail: { trailer: null, screenshots: ['https://x/b.jpg'] } });
  });

  it('parses the spec fields and turns anything odd into empty / null (rating 0 = no data)', async () => {
    fetchMock.mockResolvedValueOnce(json({ name: 'A', screenshots: [], platforms: ['PC', 'Xbox One'], genres: ['Action'], rating: 4.4, metacritic: 87 }));
    expect(await getGame('a')).toMatchObject({ detail: { platforms: ['PC', 'Xbox One'], genres: ['Action'], rating: 4.4, metacritic: 87 } });
    fetchMock.mockResolvedValueOnce(json({ name: 'A', screenshots: [], platforms: 'PC', genres: [1], rating: 0, metacritic: '87' }));
    expect(await getGame('a')).toMatchObject({ detail: { platforms: [], genres: [], rating: null, metacritic: null } });
    fetchMock.mockResolvedValueOnce(json({ name: 'A', screenshots: [], rating: -1, metacritic: 250, platforms: Array(15).fill('P') }));
    expect(await getGame('a')).toMatchObject({ detail: { rating: null, metacritic: null, platforms: Array(12).fill('P') } });
  });

  it('a network failure is an error, not a throw', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'));
    expect(await getGame('x')).toEqual({ kind: 'error', reason: 'network' });
  });
});

describe('detail helpers', () => {
  const load = async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    return import('../src/sections/detail');
  };

  it('formats the release date as in the reference and rejects anything else', async () => {
    const { formatRelease } = await load();
    expect(formatRelease('2017-02-24')).toEqual({ year: '2017', date: '24 February 2017' });
    expect(formatRelease(null)).toBeNull();
    expect(formatRelease('2017')).toBeNull();
  });

  it('cuts the appended Spanish copy and the leading #, and splits paragraphs', async () => {
    const { paragraphs } = await load();
    expect(paragraphs('# Intro\nline\n\nSecond.\n\nEspañol\nTexto')).toEqual(['Intro\nline', 'Second.']);
    expect(paragraphs('  \n ')).toEqual([]);
  });

  it('builds the spec rows in order and omits the ones without data', async () => {
    const { specRows } = await load();
    const rows = specRows({ platforms: ['PC', 'Switch'], genres: ['Action'], rating: 4, metacritic: 87 });
    expect(rows.map((r) => r.label)).toEqual(['Platforms', 'Genre', 'Player rating', 'Metacritic']);
    expect(rows[0].text).toBe('PC, Switch');
    expect(rows[2]).toEqual({ label: 'Player rating', text: '4.0 / 5', spoken: '4.0 out of 5', fill: 0.8 });
    expect(rows[3]).toMatchObject({ text: '87 / 100', spoken: '87 out of 100', fill: 0.87 });
    expect(specRows({ platforms: ['PC'], genres: [], rating: 0, metacritic: null }).map((r) => r.label)).toEqual(['Platform']);
    expect(specRows({ platforms: [], genres: [], rating: null, metacritic: null })).toEqual([]);
  });

  it('sorts platforms by family, stable inside a family', async () => {
    const { sortPlatforms, specRows } = await load();
    expect(sortPlatforms(['Linux', 'Xbox One', 'PC', 'PlayStation 4', 'Nintendo Switch'])).toEqual(['PC', 'PlayStation 4', 'Xbox One', 'Nintendo Switch', 'Linux']);
    expect(sortPlatforms(['Web', 'Android', 'PS Vita', 'Atari', 'PlayStation 5', 'iOS', 'macOS'])).toEqual(['PS Vita', 'PlayStation 5', 'macOS', 'iOS', 'Android', 'Web', 'Atari']);
    expect(specRows({ platforms: ['Linux', 'PC'], genres: [], rating: null, metacritic: null })[0].text).toBe('PC, Linux');
  });

  it('rounds the scale fill and the shown values', async () => {
    const { specRows } = await load();
    const [a, b] = specRows({ platforms: [], genres: [], rating: 4.4, metacritic: 87.4 });
    expect([a.text, b.text]).toEqual(['4.4 / 5', '87 / 100']);
    expect([a.fill, b.fill]).toEqual([expect.closeTo(0.88), expect.closeTo(0.87)]);
  });

  it('titles a slug and formats m:ss', async () => {
    const { titleFromSlug, mmss } = await load();
    expect(titleFromSlug('hollow-knight')).toBe('Hollow Knight');
    expect(mmss(102)).toBe('1:42');
    expect(mmss(7)).toBe('0:07');
  });
});
