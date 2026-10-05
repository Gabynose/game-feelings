import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildGamesUrl, buildSearchUrl, clearResolvedTitles, pickGames, slugify, queryTags, titleMatches } from '../api/_lib/rawg';
import { getGames, getGamesFull } from './api-helpers';
import { TAGS } from '../api/_lib/vocab';

describe('buildGamesUrl', () => {
  it('builds the RAWG query with popularity pool and filters', () => {
    const u = buildGamesUrl('KEY', { genres: ['adventure', 'casual'], tags: ['cozy', 'atmospheric'] });
    expect(u.origin + u.pathname).toBe('https://api.rawg.io/api/games');
    expect(u.searchParams.get('key')).toBe('KEY');
    expect(u.searchParams.get('genres')).toBe('adventure,casual');
    expect(u.searchParams.get('tags')).toBe('cozy,atmospheric');
    expect(u.searchParams.get('ordering')).toBe('-added');
    expect(u.searchParams.get('exclude_additions')).toBe('true');
    expect(Number(u.searchParams.get('page_size'))).toBeLessThanOrEqual(40);
  });
  it('omits empty filters', () => {
    const u = buildGamesUrl('K', { genres: [], tags: ['cozy'] });
    expect(u.searchParams.has('genres')).toBe(false);
  });
});

afterEach(() => {
  clearResolvedTitles(); // resolved example titles are cached per module: isolate the tests
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('queryTags', () => {
  it('sends only the first specific tag; the others only re-rank', () => {
    expect(queryTags(['souls-like', 'atmospheric', 'difficult'])).toEqual(['souls-like']);
    expect(queryTags(['singleplayer', 'co-op', 'story-rich'])).toEqual(['co-op']);
    expect(queryTags(['multiplayer', 'online-co-op'])).toEqual(['online-co-op']);
  });
  it('falls back to the first two when every tag is broad', () => {
    expect(queryTags(['atmospheric', 'story-rich', 'fantasy'])).toEqual(['atmospheric', 'story-rich']);
    expect(queryTags(['singleplayer', 'first-person', '3d'])).toEqual(['singleplayer', 'first-person']);
  });
  it('returns [] for no tags and only emits whitelisted slugs', () => {
    expect(queryTags([])).toEqual([]);
    for (const t of queryTags(TAGS)) expect(TAGS).toContain(t);
  });
});

describe('buildSearchUrl', () => {
  it('searches precisely for one title, without DLC', () => {
    const u = buildSearchUrl('KEY', 'Ratchet & Clank');
    expect(u.origin + u.pathname).toBe('https://api.rawg.io/api/games');
    expect(u.searchParams.get('search')).toBe('Ratchet & Clank');
    expect(u.searchParams.get('search_precise')).toBe('true');
    expect(u.searchParams.get('exclude_additions')).toBe('true');
    expect(Number(u.searchParams.get('page_size'))).toBeLessThanOrEqual(5);
    expect(u.searchParams.get('key')).toBe('KEY');
  });
});

describe('slugify', () => {
  it.each([
    ['Dark Souls', 'dark-souls'],
    ['BioShock', 'bioshock'],
    ['Sekiro: Shadows Die Twice', 'sekiro-shadows-die-twice'],
    ["Assassin's Creed II", 'assassins-creed-ii'],
    ['Pokémon  Red!!', 'pokemon-red'],
    ['Ratchet & Clank', 'ratchet-clank'],
    ['  --Doom--  ', 'doom'],
  ])('%s -> %s', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });
  it('is empty when nothing latin is left', () => {
    expect(slugify('ゼルダの伝説')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('titleMatches (normalized: case, accents, punctuation and articles ignored)', () => {
  it.each([
    ['Elden Ring', 'Elden Ring'],
    ['dark souls iii', 'Dark Souls III'],
    ['Monster Hunter World', 'Monster Hunter: World'],
    ['Pokémon Red', 'Pokemon Red'],
    ['The Legend of Zelda: Breath of the Wild', 'Legend of Zelda: Breath of the Wild'],
    ["Assassin's Creed II", 'Assassins Creed II'],
    ['Ratchet & Clank', 'Ratchet and Clank'],
    ['Doom', 'Doom Eternal'], // clear inclusion: the wanted title is a whole-word run inside the found one
    ['Hollow Knight', 'Hollow Knight: Silksong'],
    ['Mario Kart 8 Deluxe Booster', 'Mario Kart 8'], // title longer than RAWG name: one extra word is tolerated
    ['The Witcher 3', 'The Witcher 3: Wild Hunt'], // two extra words is still the same game
    ['Bloodborne', 'Bloodborne: Game of the Year Edition'], // re-release suffixes are ignored
    ['Dark Souls Remastered', 'Dark Souls'],
  ])('accepts %s ~ %s', (wanted, found) => {
    expect(titleMatches(wanted, found)).toBe(true);
  });
  it.each([
    ['Blasphemous Hollow Knights', 'Hollow Knight'], // invented title that RAWG fuzzy-matched
    ['Zorblax Chronicles', 'Chronicles of Riddick'],
    ['Dark Souls', 'Dark Hours'],
    ['Hades', 'Hades Star Fleet Command Online'], // too many extra words
    ['Doom', 'Doomsday Preppers'], // inclusion must be on whole words
    ['Elden Ring', 'Elden Ring: Shadow of the Erdtree Edition Plus'],
    ['A Way Out', 'Way Out (VR)'], // VR spin-off
    ['Mario Kart 8 Booster Course Pass', 'Mario Kart 8'], // title longer than RAWG name: two extra words is too many
    ['Bloodborne', 'Bloodborne PSX Demake'],
    ['Bioshock', 'BioShock: Challenge Rooms Bonus Level'],
    ['', 'Anything'],
    ['The', 'The Game'], // only articles: nothing to compare
  ])('rejects %s ~ %s', (wanted, found) => {
    expect(titleMatches(wanted, found)).toBe(false);
  });
});
const g = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  slug: `g${id}`,
  name: `Game ${id}`,
  released: '2020-01-01',
  background_image: `https://media.rawg.io/media/games/${id}.jpg`,
  rating: 4,
  ratings_count: 50,
  tags: [],
  ...over,
});

describe('pickGames', () => {
  describe("image url", () => {
    const ok = "https://media.rawg.io/media/games/a.jpg";
    it("drops http:, other hosts, and urls with spaces or commas; keeps https media.rawg.io in order", () => {
      const out = pickGames([
        g(1, { rating: 4.9, background_image: ok }),
        g(2, { rating: 4.8, background_image: "http://media.rawg.io/media/games/b.jpg" }),
        g(3, { rating: 4.7, background_image: "https://evil.example/c.jpg" }),
        g(4, { rating: 4.6, background_image: "https://media.rawg.io/media/a.jpg 2x, https://evil.example/x.jpg" }),
        g(5, { rating: 4.5, background_image: "https://media.rawg.io/media/a,b.jpg" }),
        g(6, { rating: 4.4, background_image: "https://media.rawg.io.evil.example/d.jpg" }),
        g(7, { rating: 4.3, background_image: "https://media.rawg.io/media/games/e.jpg" }),
      ]);
      expect(out.map((x) => x.id)).toEqual([1, 7]);
      expect(out[0].image).toBe(ok);
    });
  });
  it('keeps only games with an image and shapes the output', () => {
    const out = pickGames([g(1), g(2, { background_image: null })]);
    expect(out).toEqual([{ id: 1, slug: 'g1', name: 'Game 1', released: '2020-01-01', image: 'https://media.rawg.io/media/games/1.jpg' }]);
  });
  it('orders by rating desc and dedupes by id and name', () => {
    const out = pickGames([g(1, { rating: 3.6 }), g(2, { rating: 4.5 }), g(2, { rating: 4.5 }), g(3, { rating: 4.0, name: 'Game 1' })]);
    expect(out.map((x) => x.id)).toEqual([2, 3]);
  });
  it('ranks games matching more of the requested tags first, then by rating', () => {
    const t = (...s: string[]) => s.map((slug) => ({ slug }));
    const out = pickGames(
      [g(1, { rating: 4.8, tags: t('open-world') }), g(2, { rating: 3.6, tags: t('cozy', 'relaxing') }), g(3, { rating: 4.2, tags: t('cozy') })],
      ['cozy', 'relaxing'],
    );
    expect(out.map((x) => x.id)).toEqual([2, 3, 1]);
  });
  it('drops unrated and low-rated games', () => {
    expect(pickGames([g(1, { rating: 0 }), g(2, { rating: 2.9 })])).toEqual([]);
  });
  it('drops adult content by tag or esrb rating', () => {
    const out = pickGames([
      g(1, { tags: [{ slug: 'nudity' }] }),
      g(2, { tags: [{ slug: 'sexual-content' }] }),
      g(3, { esrb_rating: { slug: 'adults-only' } }),
      g(4),
    ]);
    expect(out.map((x) => x.id)).toEqual([4]);
  });
  it('returns at most 20', () => {
    expect(pickGames(Array.from({ length: 40 }, (_, i) => g(i + 1)))).toHaveLength(20);
  });
  it('tolerates a null released date', () => {
    expect(pickGames([g(1, { released: null })])[0].released).toBeNull();
  });
});

const page = (n: number, over: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ results: Array.from({ length: n }, (_, i) => g(i + 1, over)) }), { status: 200 });
const params = (f: ReturnType<typeof vi.fn>, i: number) => new URL(String(f.mock.calls[i][0])).searchParams;

describe('pickGames: filler quality (clone series, thin ratings, popularity order)', () => {
  const k = (id: number, name: string, ratings_count: number, added: number, rating = 4) => g(id, { name, ratings_count, added, rating });
  const known = [
    k(1, 'Ticket to Ride', 117, 1836, 3.56), k(2, 'Turnip Boy', 99, 1410, 3.88), k(3, 'Sky: Children of the Light', 110, 630, 4),
    k(4, 'Beacon Pines', 37, 472, 4.05), k(5, 'Cozy Grove', 51, 403, 3.64), k(6, 'A Little to the Left', 92, 350, 3.85),
    k(7, 'Lil Gator Game', 28, 183, 4.17), k(8, 'Snufkin', 25, 108, 4.11),
  ];
  const cats = [
    k(20, 'Cats Hidden in Paris', 21, 241, 3.76), k(21, 'An Arcade Full of Cats', 20, 204, 3.65), k(22, '100 Asian Cats', 18, 173, 3.79),
    k(23, 'A Building Full of Cats', 18, 128), k(24, 'A Castle Full of Cats', 20, 108, 4.19), k(25, '100 Christmas Cats', 9, 102),
  ];
  const names = (out: { name: string }[]) => out.map((x) => x.name);

  it('drops a clone series (3+ names in the pool share a significant word) when its games have few ratings', () => {
    const out = names(pickGames([...known, ...cats]));
    for (const c of cats) expect(out).not.toContain(c.name);
    expect(out).toHaveLength(known.length);
  });
  it('a franchise is not a clone series when its games are well rated (Borderlands x4 with thousands of ratings)', () => {
    const fr = [k(1, 'Borderlands', 2126, 10170), k(2, 'Borderlands 2', 3329, 16061), k(3, 'Borderlands 3', 1900, 9000), k(4, 'Borderlands: The Pre-Sequel', 1386, 9339)];
    expect(pickGames(fr)).toHaveLength(4);
  });
  it('two games sharing a word are not a series (needs 3), and a lone low-ratings game stays', () => {
    const out = names(pickGames([k(30, 'Little Kitty, Big City', 44, 202, 3.94), k(31, 'A Little Garden', 20, 100, 3.9), k(32, 'Other', 100, 50, 3.9)]));
    expect(out).toContain('Little Kitty, Big City');
    expect(out).toContain('A Little Garden');
  });
  it('the minimum ratings_count scales with the pool: a 4.5-rated game with 40 ratings is dropped from a pool of 1000-rating games, kept in a thin pool', () => {
    const big = Array.from({ length: 10 }, (_, i) => k(100 + i, `Big ${i}`, 1000 + i, 5000 - i, 3.8));
    const obscure = k(99, 'Obscure Gem', 40, 300, 4.5);
    expect(names(pickGames([...big, obscure]))).not.toContain('Obscure Gem');
    expect(names(pickGames([...known, obscure]))).toContain('Obscure Gem');
  });
  it('an absolute floor of 5 ratings applies even in a thin pool (a 5.0 with 2 ratings is shovelware)', () => {
    const out = names(pickGames([...known, k(40, 'Two Votes', 2, 900, 5), k(41, 'Six Votes', 6, 90, 4.2)]));
    expect(out).not.toContain('Two Votes');
    expect(out).toContain('Six Votes');
  });
  it('within the same tag hits, the more popular (added) game ranks first, even with a lower rating', () => {
    const out = names(pickGames([k(1, 'Niche', 200, 100, 4.9), k(2, 'Famous', 300, 9000, 3.5)]));
    expect(out).toEqual(['Famous', 'Niche']);
  });
  it('tag hits still outrank popularity', () => {
    const t = (...s: string[]) => s.map((slug) => ({ slug }));
    const out = names(pickGames([g(1, { name: 'Famous', ratings_count: 500, added: 9000, rating: 4, tags: t('open-world') }), g(2, { name: 'Fits', ratings_count: 500, added: 50, rating: 4, tags: t('cozy', 'relaxing') })], ['cozy', 'relaxing']));
    expect(out).toEqual(['Fits', 'Famous']);
  });
  it('results without ratings_count / added (older fixtures, partial payloads) are not judged on them', () => {
    expect(pickGames([g(1), g(2, { rating: 4.5 })]).map((x) => x.id)).toEqual([2, 1]);
  });
});

describe('getGames: a thin strict pool still gets filled after the junk is removed', () => {
  it('strict query: 5 good + 6 clones -> only 5 usable (< ENOUGH), so the relaxed query fires and fills behind, still without clones', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const good = Array.from({ length: 5 }, (_, i) => g(i + 1, { name: `Good ${i}`, ratings_count: 200, added: 1000 - i, rating: 4 }));
    const clones = ['Cats Hidden in Paris', 'An Arcade Full of Cats', '100 Asian Cats', 'A Building Full of Cats', 'A Castle Full of Cats', '100 Christmas Cats'].map((n, i) =>
      g(50 + i, { name: n, ratings_count: 15, added: 300 - i, rating: 4 }),
    );
    const relaxedGood = Array.from({ length: 10 }, (_, i) => g(100 + i, { name: `Fill ${i}`, ratings_count: 150, added: 500 - i, rating: 3.9 }));
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [...good, ...clones] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [...relaxedGood, ...clones] })));
    vi.stubGlobal('fetch', f);
    const out = await getGames({ genres: ['adventure'], tags: ['cozy'] });
    expect(f).toHaveBeenCalledTimes(2);
    expect(out.slice(0, 5).map((x) => x.name)).toEqual(good.map((x) => x.name));
    expect(out.length).toBeGreaterThanOrEqual(8);
    expect(out.map((x) => x.name).filter((n) => /Cats/.test(n))).toEqual([]);
  });
});

describe('getGames thin-result fallback', () => {
  it('retries without genres when genres AND tags is too narrow', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockResolvedValueOnce(page(2)).mockResolvedValueOnce(page(12));
    vi.stubGlobal('fetch', f);
    const games = await getGames({ genres: ['adventure'], tags: ['challenging'] });
    expect(games).toHaveLength(12);
    expect(params(f, 0).get('genres')).toBe('adventure');
    expect(params(f, 1).has('genres')).toBe(false);
  });
  it('does not retry when the first query is rich enough', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockResolvedValueOnce(page(15));
    vi.stubGlobal('fetch', f);
    expect(await getGames({ genres: ['adventure'], tags: ['cozy'] })).toHaveLength(15);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('maps an upstream failure to upstream_unavailable (no body leak)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('secret', { status: 500 })));
    await expect(getGames({ genres: [], tags: ['cozy'] })).rejects.toThrow('upstream_unavailable');
  });
  it('relaxes the date range first (keeping genres and platforms), then the genres', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async () => page(2));
    vi.stubGlobal('fetch', f);
    await getGames({ genres: ['action'], tags: ['souls-like'], platforms: ['nintendo-switch'], dates: ['2010-01-01', '2019-12-31'] });
    expect(f).toHaveBeenCalledTimes(3);
    expect(params(f, 0).get('dates')).toBe('2010-01-01,2019-12-31');
    expect(params(f, 0).get('platforms')).toBe('7');
    expect(params(f, 1).has('dates')).toBe(false);
    expect(params(f, 1).get('genres')).toBe('action');
    expect(params(f, 1).get('platforms')).toBe('7');
    expect(params(f, 2).has('genres')).toBe(false);
    expect(params(f, 2).get('tags')).toBe('souls-like');
    expect(params(f, 2).get('platforms')).toBe('7');
  });
});

describe('platforms and dates in the RAWG URL', () => {
  it('sends platform IDS (not slugs) comma-separated, and dates as YYYY-MM-DD,YYYY-MM-DD', () => {
    const u = buildGamesUrl('K', { genres: ['action'], tags: [], platforms: ['playstation', 'nintendo-switch'], dates: ['2010-01-01', '2019-12-31'] });
    expect(u.searchParams.get('platforms')).toBe('187,18,16,7');
    expect(u.searchParams.get('dates')).toBe('2010-01-01,2019-12-31');
    expect(u.searchParams.has('parent_platforms')).toBe(false);
  });
  it('a platform alone is a valid filter; dates alone are not', () => {
    expect(buildGamesUrl('K', { genres: [], tags: [], platforms: ['pc'] }).searchParams.get('platforms')).toBe('4');
    expect(() => buildGamesUrl('K', { genres: [], tags: [], dates: ['2010-01-01', '2019-12-31'] })).toThrow('invalid_input');
  });
});

describe('getGames: examples (verified by RAWG search, pinned first)', () => {
  const rawg = (id: number, name: string, over: Record<string, unknown> = {}) => g(id, { name, slug: name.toLowerCase().replace(/\W+/g, '-'), ...over });
  const route = (search: Record<string, unknown[] | 'fail'>, filtered: unknown[], slugs: Record<string, unknown> = {}) =>
    vi.fn().mockImplementation(async (u: string) => {
      const url = new URL(String(u));
      const m = /\/games\/([^/]+)$/.exec(url.pathname); // direct slug lookup: GET /games/{slug}
      if (m) {
        const hit = slugs[m[1]];
        if (hit === 'fail') return new Response('secret', { status: 500 });
        return hit ? new Response(JSON.stringify(hit)) : new Response('{"detail":"Not found."}', { status: 404 });
      }
      const s = url.searchParams.get('search');
      if (s !== null) {
        const r = search[s];
        if (r === 'fail') return new Response('secret', { status: 500 });
        return new Response(JSON.stringify({ results: r ?? [] }));
      }
      return new Response(JSON.stringify({ results: filtered }));
    });

  it('pins accepted examples first, in the model order, then fills with the filter results without duplicates', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const filtered = [rawg(1, 'Sekiro', { rating: 4.9 }), rawg(2, 'Elden Ring', { rating: 4.5 }), rawg(3, 'Nioh', { rating: 4.0 }), ...Array.from({ length: 9 }, (_, i) => rawg(10 + i, `Filler ${i}`, { rating: 3.5 }))];
    const f = route({ 'Elden Ring': [rawg(2, 'Elden Ring')], 'Dark Souls': [rawg(4, 'Dark Souls', { rating: 3.4 })] }, filtered);
    vi.stubGlobal('fetch', f);
    const out = await getGames({ genres: ['action'], tags: ['souls-like'], examples: ['Elden Ring', 'Dark Souls'] });
    expect(out.slice(0, 2).map((x) => x.name)).toEqual(['Elden Ring', 'Dark Souls']);
    expect(out.map((x) => x.id).filter((id) => id === 2)).toHaveLength(1); // Elden Ring appears once
    expect(out[2].name).toBe('Sekiro');
    expect(out.length).toBeLessThanOrEqual(20);
  });
  it('silently drops an invented title (RAWG fuzzy-matched something else) and still returns the filter results', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const filtered = Array.from({ length: 10 }, (_, i) => rawg(i + 1, `Real ${i}`));
    const f = route({ 'Blasphemous Hollow Knights': [rawg(99, 'Hollow Knight')], 'Zorblax Chronicles': [] }, filtered);
    vi.stubGlobal('fetch', f);
    const out = await getGames({ genres: ['action'], tags: ['metroidvania'], examples: ['Blasphemous Hollow Knights', 'Zorblax Chronicles'] });
    expect(out.map((x) => x.id)).not.toContain(99);
    expect(out).toHaveLength(10);
  });
  it('resolves every example with a precise search (plus its slug lookup)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({}, [rawg(1, 'X')]);
    vi.stubGlobal('fetch', f);
    await getGames({ genres: ['action'], tags: [], examples: ['A1', 'B2', 'C3', 'D4', 'E5'] });
    const searches = f.mock.calls.map((c) => new URL(String(c[0])).searchParams).filter((p) => p.has('search'));
    expect(searches.map((p) => p.get('search')).sort()).toEqual(['A1', 'B2', 'C3', 'D4', 'E5']);
    for (const p of searches) expect(p.get('search_precise')).toBe('true');
  });
  it('only examples and no filters: returns just the verified examples, never a filterless query', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ Hades: [rawg(7, 'Hades')], Fake: [] }, []);
    vi.stubGlobal('fetch', f);
    const out = await getGames({ genres: [], tags: [], examples: ['Hades', 'Fake'] });
    expect(out.map((x) => x.name)).toEqual(['Hades']);
    for (const [u] of f.mock.calls) {
      const url = new URL(String(u));
      expect(url.searchParams.has('search') || /\/games\/[^/]+$/.test(url.pathname)).toBe(true); // searches or slug lookups only
    }
  });
  it('no filters and no examples is refused before any upstream call', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(getGames({ genres: [], tags: [], examples: [] })).rejects.toThrow('invalid_input');
    await expect(getGames({ genres: [], tags: [], dates: ['2010-01-01', '2019-12-31'] })).rejects.toThrow('invalid_input');
    expect(f).not.toHaveBeenCalled();
  });
  it('a pinned example keeps even with a low rating, but still needs a cover', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ Low: [rawg(1, 'Low', { rating: 2 })], NoImg: [rawg(2, 'NoImg', { background_image: null })] }, [rawg(9, 'Filler')]);
    vi.stubGlobal('fetch', f);
    const out = await getGames({ genres: ['action'], tags: [], examples: ['Low', 'NoImg'] });
    expect(out.map((x) => x.name)).toEqual(['Low', 'Filler']);
  });
  it('adult filter: nudity / sexual-content games show as examples but never from the filters; adults-only / hentai / erotic / nsfw never', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const tag = (...s: string[]) => ({ tags: s.map((slug) => ({ slug })) });
    const search = {
      Sekiro: [rawg(1, 'Sekiro', tag('nudity', 'sexual-content'))],
      'Witcher 3': [rawg(2, 'Witcher 3', tag('sexual-content'))],
      Esrb: [rawg(3, 'Esrb', { esrb_rating: { slug: 'adults-only' } })],
      Hentai: [rawg(4, 'Hentai', tag('hentai'))],
      Erotic: [rawg(5, 'Erotic', tag('erotic'))],
    };
    const filtered = [rawg(10, 'FilterNudity', tag('nudity')), rawg(11, 'FilterSex', tag('sexual-content')), rawg(12, 'Clean')];
    vi.stubGlobal('fetch', route(search, filtered));
    const out = await getGames({ genres: ['action'], tags: [], examples: Object.keys(search) });
    expect(out.map((x) => x.name)).toEqual(['Sekiro', 'Witcher 3', 'Clean']);
    // the same game coming only from the filter is hidden
    vi.stubGlobal('fetch', route({}, [rawg(1, 'Sekiro', tag('nudity')), rawg(12, 'Clean')]));
    expect((await getGames({ genres: ['action'], tags: [] })).map((x) => x.name)).toEqual(['Clean']);
  });
  it('an exact match that is hidden (adults-only) is not replaced by a look-alike', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ 'A Way Out': [rawg(1, 'A Way Out', { esrb_rating: { slug: 'adults-only' } }), rawg(2, 'Way Out (VR)')] }, []);
    vi.stubGlobal('fetch', f);
    expect(await getGames({ genres: [], tags: [], examples: ['A Way Out'] })).toEqual([]);
  });
  it('picks the first matching result among the few the search returns', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ Hades: [rawg(5, 'Hades Star Fleet Command Online'), rawg(6, 'Hades')] }, []);
    vi.stubGlobal('fetch', f);
    expect((await getGames({ genres: [], tags: [], examples: ['Hades'] })).map((x) => x.id)).toEqual([6]);
  });
  it('an exact name beats a looser match that RAWG listed first', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ 'Dark Souls': [rawg(3, 'Dark Souls III'), rawg(1, 'Dark Souls')] }, []);
    vi.stubGlobal('fetch', f);
    expect((await getGames({ genres: [], tags: [], examples: ['Dark Souls'] })).map((x) => x.id)).toEqual([1]);
  });
  it('tries the direct slug first: an existing slug with a matching name beats the search (Dark Souls is not Dark Souls III)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ 'Dark Souls': [rawg(3, 'Dark Souls III')] }, [], { 'dark-souls': rawg(1, 'Dark Souls') });
    vi.stubGlobal('fetch', f);
    expect((await getGames({ genres: [], tags: [], examples: ['Dark Souls'] })).map((x) => x.id)).toEqual([1]);
  });
  it('a missing slug (404) or one whose name does not match falls back to the search, and a 404 is not an upstream failure', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ Hades: [rawg(6, 'Hades')], Doom: [rawg(8, 'Doom')] }, [], { doom: rawg(99, 'Doom Slayers Collection Of Things') });
    vi.stubGlobal('fetch', f);
    expect((await getGames({ genres: [], tags: [], examples: ['Hades', 'Doom'] })).map((x) => x.id)).toEqual([6, 8]);
    vi.stubGlobal('fetch', route({}, []));
    expect(await getGames({ genres: [], tags: [], examples: ['Nope'] })).toEqual([]); // 404 + empty search: [] not a 503
  });
  it('costs 2 upstream calls per example (slug + search), in parallel, inside one shared budget', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ A1: [rawg(1, 'A1')], B2: [rawg(2, 'B2')], C3: [rawg(3, 'C3')] }, []);
    vi.stubGlobal('fetch', f);
    const spy = vi.spyOn(AbortSignal, 'timeout');
    await getGames({ genres: [], tags: [], examples: ['A1', 'B2', 'C3'] }, () => 12_000);
    expect(f).toHaveBeenCalledTimes(6);
    for (const [ms] of spy.mock.calls) expect(ms).toBeLessThanOrEqual(12_000);
    spy.mockRestore();
  });
  it('a failing slug lookup does not lose a search result, and vice versa', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', route({ A1: [rawg(1, 'A1')] }, [], { a1: 'fail' }));
    expect((await getGames({ genres: [], tags: [], examples: ['A1'] })).map((x) => x.id)).toEqual([1]);
    vi.stubGlobal('fetch', route({ B2: 'fail' }, [], { b2: rawg(2, 'B2') }));
    expect((await getGames({ genres: [], tags: [], examples: ['B2'] })).map((x) => x.id)).toEqual([2]);
  });
  it('a title with no latin letters or digits skips the slug call', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({}, []);
    vi.stubGlobal('fetch', f);
    await getGames({ genres: [], tags: [], examples: ['ゼルダの伝説'] });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('among loose matches the best-rated wins (The Witcher 3 -> Wild Hunt, not a tool that is one word shorter)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ 'The Witcher 3': [rawg(1, 'The Witcher 3 REDkit', { rating: 0 }), rawg(2, 'The Witcher 3: Wild Hunt', { rating: 4.6, tags: [{ slug: 'nudity' }] })] }, []);
    vi.stubGlobal('fetch', f);
    expect((await getGames({ genres: [], tags: [], examples: ['The Witcher 3'] })).map((x) => x.id)).toEqual([2]);
  });
  it('some searches failing is fine; filters still answer', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = route({ A1: 'fail', B2: [rawg(8, 'B2')] }, [rawg(1, 'X')]);
    vi.stubGlobal('fetch', f);
    const out = await getGames({ genres: ['action'], tags: [], examples: ['A1', 'B2'] });
    expect(out.map((x) => x.name)).toEqual(['B2', 'X']);
  });
  it('filters failing but an example resolved: the example alone is returned', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async (u: string) =>
      new URL(String(u)).searchParams.has('search') ? new Response(JSON.stringify({ results: [rawg(8, 'B2')] })) : new Response('x', { status: 500 }),
    );
    vi.stubGlobal('fetch', f);
    expect((await getGames({ genres: ['action'], tags: [], examples: ['B2'] })).map((x) => x.name)).toEqual(['B2']);
  });
  it('everything failing is upstream_unavailable (not an empty list), without leaking bodies', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('secret', { status: 500 })));
    await expect(getGames({ genres: ['action'], tags: [], examples: ['A1'] })).rejects.toThrow('upstream_unavailable');
    await expect(getGames({ genres: [], tags: [], examples: ['A1'] })).rejects.toThrow('upstream_unavailable');
  });
  it('searches that all answer but match nothing, with no filters, are an empty list', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', route({}, []));
    expect(await getGames({ genres: [], tags: [], examples: ['Nope'] })).toEqual([]);
  });
  it('never returns more than 20 even with 5 pinned', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const filtered = Array.from({ length: 30 }, (_, i) => rawg(100 + i, `F${i}`));
    const search = Object.fromEntries(['A1', 'B2', 'C3', 'D4', 'E5'].map((t, i) => [t, [rawg(i + 1, t)]]));
    vi.stubGlobal('fetch', route(search, filtered));
    const out = await getGames({ genres: ['action'], tags: [], examples: Object.keys(search) });
    expect(out).toHaveLength(20);
    expect(out.slice(0, 5).map((x) => x.name)).toEqual(['A1', 'B2', 'C3', 'D4', 'E5']);
  });
});

describe('getGames: partial answers are flagged incomplete', () => {
  const rawg = (id: number, name: string, over: Record<string, unknown> = {}) => g(id, { name, slug: name.toLowerCase().replace(/\W+/g, '-'), ...over });
  const route = (opts: { filters?: unknown[] | 'fail'; search?: Record<string, unknown[] | 'fail'>; slugs?: Record<string, unknown> }) =>
    vi.fn().mockImplementation(async (u: string) => {
      const url = new URL(String(u));
      const m = /\/games\/([^/]+)$/.exec(url.pathname);
      if (m) return opts.slugs?.[m[1]] ? new Response(JSON.stringify(opts.slugs[m[1]])) : new Response('{}', { status: 404 });
      const s = url.searchParams.get('search');
      if (s !== null) {
        const r2 = opts.search?.[s];
        return r2 === 'fail' ? new Response('x', { status: 500 }) : new Response(JSON.stringify({ results: r2 ?? [] }));
      }
      return opts.filters === 'fail' ? new Response('x', { status: 500 }) : new Response(JSON.stringify({ results: opts.filters ?? [] }));
    });

  it('everything answered (slug 404s included): complete', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', route({ filters: [rawg(1, 'X')], search: { A1: [rawg(2, 'A1')] } }));
    expect(await getGamesFull({ genres: ['action'], tags: [], examples: ['A1'] })).toMatchObject({ complete: true });
  });
  it('filters failing but an example resolved: games are returned, complete is false', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', route({ filters: 'fail', search: { A1: [rawg(2, 'A1')] } }));
    const out = await getGamesFull({ genres: ['action'], tags: [], examples: ['A1'] });
    expect(out.games.map((x) => x.name)).toEqual(['A1']);
    expect(out.complete).toBe(false);
  });
  it('one example search failing (the slug answered 404) is incomplete; filters still answer', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal('fetch', route({ filters: [rawg(1, 'X')], search: { A1: 'fail' } }));
    expect(await getGamesFull({ genres: ['action'], tags: [], examples: ['A1'] })).toMatchObject({ complete: false });
  });
  it('a relax step failing after the strict one answered is incomplete but keeps the strict games', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockResolvedValueOnce(page(3)).mockImplementation(async () => new Response('x', { status: 500 }));
    vi.stubGlobal('fetch', f);
    const out = await getGamesFull({ genres: ['adventure'], tags: ['challenging'] });
    expect(out.games).toHaveLength(3);
    expect(out.complete).toBe(false);
  });
});

describe('getGames: relaxed steps fill behind the strict results', () => {
  it('keeps the strict-step games first, then the relaxed ones without duplicates, up to 20', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const strict = [g(1, { name: 'Strict A', rating: 3.5 }), g(2, { name: 'Strict B', rating: 3.4 })];
    const relaxed = [g(3, { name: 'Relaxed Star', rating: 4.9 }), g(1, { name: 'Strict A', rating: 3.5 }), ...Array.from({ length: 30 }, (_, i) => g(10 + i, { name: `R${i}`, rating: 4 }))];
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: strict })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: relaxed })));
    vi.stubGlobal('fetch', f);
    vi.stubEnv('RAWG_API_KEY', 'K');
    const out = await getGames({ genres: ['adventure'], tags: ['challenging'] });
    expect(out.slice(0, 2).map((x) => x.name)).toEqual(['Strict A', 'Strict B']);
    expect(out[2].name).toBe('Relaxed Star');
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length);
    expect(out).toHaveLength(20);
  });
});

describe('getGames: pinned examples must honour the dates and platforms', () => {
  const rawg = (id: number, name: string, over: Record<string, unknown> = {}) => g(id, { name, slug: name.toLowerCase().replace(/\W+/g, '-'), ...over });
  const plat = (...ids: number[]) => ({ platforms: ids.map((id) => ({ platform: { id } })) });
  const run = (search: Record<string, unknown[]>, q: Parameters<typeof getGames>[0]) => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (u: string) => {
        const url = new URL(String(u));
        if (/\/games\/[^/]+$/.test(url.pathname)) return new Response('{}', { status: 404 });
        const s = url.searchParams.get('search');
        return new Response(JSON.stringify({ results: s !== null ? (search[s] ?? []) : [rawg(99, 'Filler')] }));
      }),
    );
    return getGames(q);
  };
  it('drops an example released outside the requested years (Flower 2009 with 2010-2019)', async () => {
    const out = await run(
      { Flower: [rawg(1, 'Flower', { released: '2009-02-12' })], Abzu: [rawg(2, 'Abzu', { released: '2016-08-02' })] },
      { genres: ['adventure'], tags: [], dates: ['2010-01-01', '2019-12-31'], examples: ['Flower', 'Abzu'] },
    );
    expect(out.map((x) => x.name)).toEqual(['Abzu', 'Filler']);
  });
  it('an example with no release date is kept', async () => {
    const out = await run({ TBA: [rawg(1, 'TBA', { released: null })] }, { genres: ['adventure'], tags: [], dates: ['2010-01-01', '2019-12-31'], examples: ['TBA'] });
    expect(out[0].name).toBe('TBA');
  });
  it('drops an example that is on none of the requested platforms; keeps one on any of them or with unknown platforms', async () => {
    const out = await run(
      {
        Sekiro: [rawg(1, 'Sekiro', plat(4, 18))], // PC + PS4 only
        Dead: [rawg(2, 'Dead', plat(4, 7))], // PC + Switch
        Mystery: [rawg(3, 'Mystery')], // RAWG says nothing about platforms
      },
      { genres: ['adventure'], tags: [], platforms: ['nintendo-switch'], examples: ['Sekiro', 'Dead', 'Mystery'] },
    );
    expect(out.map((x) => x.name)).toEqual(['Dead', 'Mystery', 'Filler']);
  });
});

describe('getGames: resolved titles are cached for 24 h (never on failure)', () => {
  const rawg = (id: number, name: string) => g(id, { name, slug: name.toLowerCase().replace(/\W+/g, '-') });
  const searches = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => new URL(String(c[0])).searchParams.has('search')).length;
  it('a resolved title costs no upstream call the second time (case-insensitive)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async (u: string) =>
      /\/games\/[^/]+$/.test(new URL(String(u)).pathname) ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ results: [rawg(1, 'Hades')] })),
    );
    vi.stubGlobal('fetch', f);
    await getGames({ genres: [], tags: [], examples: ['Hades'] });
    const before = f.mock.calls.length;
    expect((await getGames({ genres: [], tags: [], examples: ['HADES'] })).map((x) => x.id)).toEqual([1]);
    expect(f.mock.calls.length).toBe(before);
  });
  it('"no such game" is cached when both calls answered (404 + empty search)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async (u: string) =>
      /\/games\/[^/]+$/.test(new URL(String(u)).pathname) ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ results: [] })),
    );
    vi.stubGlobal('fetch', f);
    await getGames({ genres: [], tags: [], examples: ['Invented Thing'] });
    await getGames({ genres: [], tags: [], examples: ['Invented Thing'] });
    expect(searches(f)).toBe(1);
  });
  it('nothing is cached when a call failed: the next request asks RAWG again', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    let broken = true;
    const f = vi.fn().mockImplementation(async (u: string) => {
      if (/\/games\/[^/]+$/.test(new URL(String(u)).pathname)) return new Response('{}', { status: 404 });
      return broken ? new Response('x', { status: 500 }) : new Response(JSON.stringify({ results: [rawg(1, 'Hades')] }));
    });
    vi.stubGlobal('fetch', f);
    await expect(getGames({ genres: [], tags: [], examples: ['Hades'] })).rejects.toThrow('upstream_unavailable');
    broken = false;
    expect((await getGames({ genres: [], tags: [], examples: ['Hades'] })).map((x) => x.id)).toEqual([1]);
    expect(searches(f)).toBe(2);
  });
  it('the example search gets one try only (a 500 is not retried)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async (u: string) =>
      /\/games\/[^/]+$/.test(new URL(String(u)).pathname) ? new Response('{}', { status: 404 }) : new Response('x', { status: 500 }),
    );
    vi.stubGlobal('fetch', f);
    await expect(getGames({ genres: [], tags: [], examples: ['Hades'] })).rejects.toThrow('upstream_unavailable');
    expect(searches(f)).toBe(1);
  });
  it('a digits-only title skips the slug lookup (it would be an id lookup)', async () => {
    vi.stubEnv('RAWG_API_KEY', 'K');
    const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ results: [] })));
    vi.stubGlobal('fetch', f);
    await getGames({ genres: [], tags: [], examples: ['2077'] });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
