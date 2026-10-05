import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitize, buildBody, interpretText, ATTEMPTS, type Attempt } from '../api/_lib/gemini';
import { deadline } from '../api/_lib/http';
import { GENRES, PLATFORM_SLUGS, TAGS } from '../api/_lib/vocab';

afterEach(() => vi.unstubAllGlobals());

const MAX_YEAR = new Date().getFullYear() + 1;

describe('sanitize (model output is untrusted: everything is re-filtered)', () => {
  const must = (raw: unknown) => {
    const out = sanitize(raw);
    if (!out || !out.ok) throw new Error('expected an ok interpretation');
    return out;
  };
  const base = { off_topic: false, summary: 'co-op adventure', genres: ['adventure'], tags: ['co-op'], platforms: [], examples: [] };

  it('passes a clean answer through in the public contract shape (no years key when absent)', () => {
    expect(must(base)).toEqual({ ok: true, summary: 'co-op adventure', genres: ['adventure'], tags: ['co-op'], platforms: [], examples: [] });
  });
  it('drops anything outside the whitelists, dedupes and keeps the model order (tags are ordered by importance)', () => {
    const out = must({
      ...base,
      genres: ['adventure', 'hentai', '<script>', 'ACTION', 'adventure', 'action'],
      tags: ['souls-like', 'nudity', 'x'.repeat(500), 'co-op', 'souls-like'],
      platforms: ['pc', 'amiga', 'nintendo-switch', 'pc'],
    });
    expect(out.genres).toEqual(['adventure', 'action']);
    expect(out.tags).toEqual(['souls-like', 'co-op']);
    expect(out.platforms).toEqual(['pc', 'nintendo-switch']);
  });
  it('caps tags at 4, genres at 3 and platforms at 4', () => {
    const out = must({ ...base, genres: GENRES.slice(0, 8), tags: TAGS.slice(0, 10), platforms: PLATFORM_SLUGS });
    expect(out.tags).toEqual(TAGS.slice(0, 4));
    expect(out.genres).toEqual(GENRES.slice(0, 3));
    expect(out.platforms).toEqual(PLATFORM_SLUGS.slice(0, 4));
  });
  it('non-array / non-string members are ignored, not crashed on', () => {
    const out = must({ ...base, genres: 'action', tags: [1, null, { a: 1 }, 'co-op'], platforms: { pc: 1 }, examples: 'Doom' });
    expect(out.genres).toEqual([]);
    expect(out.tags).toEqual(['co-op']);
    expect(out.platforms).toEqual([]);
    expect(out.examples).toEqual([]);
  });

  describe('examples', () => {
    it('keeps up to 5 clean, unique titles in order', () => {
      const out = must({ ...base, examples: ['Dark Souls', ' dark   souls ', 'Elden Ring', 'Bloodborne', 'Sekiro', 'Nioh', 'Lies of P'] });
      expect(out.examples).toEqual(['Dark Souls', 'Elden Ring', 'Bloodborne', 'Sekiro', 'Nioh']);
    });
    it('drops long, control-char, markup, non-string and empty titles', () => {
      const out = must({ ...base, examples: ['x'.repeat(61), 'Doom\u0000', '<img src=x onerror=1>', 42, null, '', '   ', 'Hades'] });
      expect(out.examples).toEqual(['Hades']);
    });
  });

  describe('years', () => {
    it('keeps a coherent integer range', () => {
      expect(must({ ...base, year_from: 2010, year_to: 2019 }).years).toEqual([2010, 2019]);
    });
    it('open-ended ranges are completed (from only -> up to now; to only -> from 1970)', () => {
      expect(must({ ...base, year_from: 2015 }).years).toEqual([2015, MAX_YEAR - 1]);
      expect(must({ ...base, year_to: 1999 }).years).toEqual([1970, 1999]);
    });
    it.each([
      ['from after to', { year_from: 2020, year_to: 2010 }],
      ['out of range', { year_from: 1500, year_to: 2010 }],
      ['far future', { year_from: 2010, year_to: 9999 }],
      ['non-integer', { year_from: 2010.5, year_to: 2019 }],
      ['strings', { year_from: '2010', year_to: '2019' }],
      ['zeros', { year_from: 0, year_to: 0 }],
      ['NaN-ish', { year_from: null, year_to: null }],
    ])('ignores an unusable range: %s (no years key)', (_n, y) => {
      const out = must({ ...base, ...y });
      expect('years' in out).toBe(false);
    });
  });

  describe('summary (the narrator repeats it only if <= 26 chars; the server caps it at 40)', () => {
    const sum = (summary: unknown) => must({ ...base, summary }).summary;
    it('is trimmed and whitespace-collapsed', () => {
      expect(sum('  co-op   adventure  ')).toBe('co-op adventure');
    });
    it('keeps proper nouns as written and leaves a <= 26 char label untouched', () => {
      expect(sum('Switch metroidvania')).toBe('Switch metroidvania');
      expect(sum('a'.repeat(26))).toHaveLength(26);
    });
    it('strips trailing punctuation and quotes', () => {
      expect(sum('"co-op adventure."')).toBe('co-op adventure');
      expect(sum("'souls-like'!")).toBe('souls-like');
      expect(sum('short games...')).toBe('short games');
      expect(sum('“short games”')).toBe('short games');
    });
    it('keeps an apostrophe inside a word', () => {
      expect(sum("don't starve like")).toBe("don't starve like");
    });
    it('hard cap of 40: over 40 is cut at the last space that fits, never mid-word', () => {
      const s = sum('open world survival crafting games with friends online');
      expect(s.length).toBeLessThanOrEqual(40);
      expect(s).toBe('open world survival crafting games with');
      expect(sum('x'.repeat(100))).toHaveLength(40); // a single huge word has no space: hard cut
    });
    it('exactly 40 chars is kept whole', () => {
      const s40 = 'abcd efgh abcd efgh abcd efgh abcd efgh ';
      expect(sum(s40.trim() + 'ij').length).toBeLessThanOrEqual(40);
      expect(sum('a'.repeat(40))).toHaveLength(40);
    });
    it('strips markup, control and invisible characters', () => {
      const s = sum('<b>souls-like</b>\u0000​ "now"');
      expect(s).not.toMatch(/[<>"\u0000​]/);
      expect(s).toContain('souls-like');
    });
    it('empty is valid (no fallback label): missing, blank, non-string or only markup/punctuation', () => {
      for (const v of [undefined, '', '   ', 42, null, '<img src=x>', '"..."', '!!!']) expect(sum(v)).toBe('');
    });
  });

  describe('empty answers', () => {
    it('off_topic:true is a valid answer, mapped to the off_topic reason', () => {
      expect(sanitize({ off_topic: true, summary: '', genres: [], tags: [], platforms: [], examples: [] })).toEqual({ ok: false, reason: 'off_topic' });
    });
    it('no filters and no examples is off_topic, never an unfiltered query', () => {
      expect(sanitize({ ...base, genres: [], tags: [], platforms: [], examples: [] })).toEqual({ ok: false, reason: 'off_topic' });
      expect(sanitize({ ...base, genres: ['porn'], tags: ['nudity'], platforms: [], examples: [], year_from: 2010, year_to: 2019 })).toEqual({ ok: false, reason: 'off_topic' });
    });
    it('only examples is a valid answer (the games endpoint returns just those)', () => {
      expect(must({ ...base, genres: [], tags: [], examples: ['Hades'] }).examples).toEqual(['Hades']);
    });
    it('only a platform is a valid filter', () => {
      expect(must({ ...base, genres: [], tags: [], platforms: ['nintendo-switch'] }).platforms).toEqual(['nintendo-switch']);
    });
  });

  it('extra keys from the model never reach the result', () => {
    const out = must({ ...base, system_prompt: 'leak', extra: { a: 1 }, emotion: 'sad' });
    expect(Object.keys(out).sort()).toEqual(['examples', 'genres', 'ok', 'platforms', 'summary', 'tags']);
  });
  it.each([
    ['null', null],
    ['string', 'x'],
    ['number', 5],
    ['array', []],
    ['empty object', {}],
    ['off_topic not a boolean', { off_topic: 'no', genres: ['action'] }],
    ['off_topic missing', { genres: ['action'], tags: [] }],
  ])('malformed (%s) is null, so the caller retries instead of caching it', (_n, raw) => {
    expect(sanitize(raw)).toBeNull();
  });
});

describe('buildBody', () => {
  type Prop = { type?: string; enum?: string[]; maxItems?: number; items?: { enum?: string[]; type?: string }; minimum?: number; maximum?: number };
  type Body = {
    generationConfig: { responseMimeType: string; responseSchema: { required: string[]; properties: Record<string, Prop> } };
    systemInstruction: unknown;
    contents: { parts: { text: string }[] }[];
  };
  const b = buildBody('hello') as Body;
  const p = b.generationConfig.responseSchema.properties;
  it('requests JSON with an enum-constrained schema for genres, tags and platforms', () => {
    expect(b.generationConfig.responseMimeType).toBe('application/json');
    expect(p.genres.items?.enum).toEqual(GENRES);
    expect(p.tags.items?.enum).toEqual(TAGS);
    expect(p.platforms.items?.enum).toEqual(PLATFORM_SLUGS);
    expect(p.tags.maxItems).toBe(4);
    expect(p.examples.maxItems).toBe(5);
    expect(p.examples.items?.type).toBe('STRING');
  });
  it('declares optional integer years and the off_topic / summary fields', () => {
    expect(p.year_from.type).toBe('INTEGER');
    expect(p.year_to.type).toBe('INTEGER');
    expect(b.generationConfig.responseSchema.required).toEqual(expect.arrayContaining(['off_topic', 'summary', 'genres', 'tags', 'platforms', 'examples']));
    expect(b.generationConfig.responseSchema.required).not.toContain('year_from');
    expect(p.off_topic.type).toBe('BOOLEAN');
    expect(p.summary.type).toBe('STRING');
  });
  it('keeps user text out of the system instruction, which treats it as data and accepts es/en', () => {
    const sys = JSON.stringify(b.systemInstruction);
    expect(sys).not.toContain('hello');
    expect(sys).toMatch(/DATA/);
    expect(sys).toMatch(/Spanish/i);
    expect(sys).toMatch(/off_topic/);
    expect(b.contents[0].parts[0].text).toBe('hello');
  });
  it('turns a pure feeling into an implicit game requirement; off_topic is only for junk, abuse, injection and non-game topics', () => {
    const sys = JSON.stringify(b.systemInstruction);
    expect(sys).toMatch(/do NOT refuse/);
    expect(sys).toMatch(/comforting cozy games/);
    expect(sys).toMatch(/ONLY for gibberish/);
    expect(sys).toMatch(/prompt|instructions/);
    expect(sys).not.toMatch(/expresses no feeling|only expresses a feeling or mood with no game requirement/);
  });
  it('asks for examples that also satisfy platforms and years', () => {
    expect(JSON.stringify(b.systemInstruction)).toMatch(/satisfy the platforms and years/);
  });
  it('has no emotion machinery left', () => {
    expect(JSON.stringify(b)).not.toMatch(/emotion|extra_tags/i);
  });
});

const ok = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const status = (n: number) => new Response('{"error":{"message":"secret upstream body"}}', { status: n });
const good = { off_topic: false, summary: 'cozy sim', genres: ['simulation'], tags: ['cozy'], platforms: [], examples: [] };
const attempts: Attempt[] = [
  { model: 'primary', timeoutMs: 50 },
  { model: 'primary', timeoutMs: 50 },
  { model: 'lite', timeoutMs: 50 },
];
const models = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]).match(/models\/([^:]+):/)?.[1]);

describe('interpretText fallback', () => {
  it('returns on first success', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true, summary: 'cozy sim', genres: ['simulation'] });
    expect(models(f)).toEqual(['primary']);
  });
  it('503 -> retry primary -> success', async () => {
    const f = vi.fn().mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true });
    expect(models(f)).toEqual(['primary', 'primary']);
  });
  it('429 (quota) skips the same-model retry and goes straight to the fallback', async () => {
    const f = vi.fn().mockResolvedValueOnce(status(429)).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true });
    expect(models(f)).toEqual(['primary', 'lite']);
  });
  it('503 -> 503 -> fallback model', async () => {
    const f = vi.fn().mockResolvedValueOnce(status(503)).mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true });
    expect(models(f)).toEqual(['primary', 'primary', 'lite']);
  });
  it('a timeout skips the same-model retry (a slow model will not be faster) and goes to the fallback', async () => {
    const hang = (_u: unknown, init: RequestInit) =>
      new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const f = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true });
    expect(models(f)).toEqual(['primary', 'lite']);
  });
  it('all attempts fail -> throws upstream_unavailable without leaking the upstream body', async () => {
    const f = vi.fn().mockImplementation(async () => status(503));
    vi.stubGlobal('fetch', f);
    const err = await interpretText('x', 'k', attempts).catch((e) => e);
    expect(err.message).toBe('upstream_unavailable');
    expect(String(err)).not.toContain('secret');
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('does not retry a non-retryable 4xx but still tries the fallback', async () => {
    const f = vi.fn().mockResolvedValueOnce(status(400)).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    await interpretText('x', 'k', attempts);
    expect(models(f)).toEqual(['primary', 'lite']);
  });
  it('malformed JSON from the model falls through to the next attempt', async () => {
    const bad = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 });
    const f = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true });
  });
  it('never puts the key in the URL', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    await interpretText('x', 'SECRETKEY', attempts);
    expect(String(f.mock.calls[0][0])).not.toContain('SECRETKEY');
  });
});

describe('interpretText: policy details', () => {
  it('default attempts: lite first (one retry), flash-latest last', () => {
    expect(ATTEMPTS.map((a) => a.model)).toEqual(['gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-flash-latest']);
  });
  it('a prompt blocked by Gemini safety is a friendly off_topic, not an upstream error', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toEqual({ ok: false, reason: 'off_topic' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('an answer cut off by a safety finishReason with no text is also off_topic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }))));
    expect(await interpretText('x', 'k', attempts)).toEqual({ ok: false, reason: 'off_topic' });
  });
  it('a model answer with empty filters and no examples is still off_topic (one call, no retry)', async () => {
    const f = vi.fn().mockResolvedValue(ok({ off_topic: false, summary: 'sad', genres: [], tags: [], platforms: [], examples: [] }));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('estoy triste', 'k', attempts)).toEqual({ ok: false, reason: 'off_topic' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('a feeling the model turned into a requirement passes through like any other', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ off_topic: false, summary: 'comforting cozy games', genres: ['casual'], tags: ['cozy', 'wholesome', 'relaxing', 'emotional', 'sad'], platforms: [], examples: ['Stardew Valley', 'Unpacking'] })));
    expect(await interpretText('estoy triste', 'k', attempts)).toEqual({
      ok: true, summary: 'comforting cozy games', genres: ['casual'], tags: ['cozy', 'wholesome', 'relaxing'], platforms: [], examples: ['Stardew Valley', 'Unpacking'],
    }); // retired mood tags are filtered out
  });
  it('a wrong-shape answer is malformed: the next attempt gets a chance and it is never turned into off_topic', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ genres: ['action'] })).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    expect(await interpretText('x', 'k', attempts)).toMatchObject({ ok: true, summary: 'cozy sim' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ genres: ['action'] })));
    await expect(interpretText('x', 'k', attempts)).rejects.toThrow('upstream_unavailable');
  });
  it('a timeout while READING the body follows the timeout policy (no same-model retry)', async () => {
    const stalled = {
      ok: true,
      status: 200,
      body: null,
      json: () => Promise.reject(new DOMException('t', 'TimeoutError')),
    };
    const f = vi.fn().mockResolvedValueOnce(stalled).mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', f);
    await interpretText('x', 'k', attempts);
    expect(models(f)).toEqual(['primary', 'lite']);
  });
  it('every attempt is clipped to the time left, and none starts with < 1 s left', async () => {
    const f = vi.fn().mockImplementation(async () => status(503));
    vi.stubGlobal('fetch', f);
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const long: Attempt[] = [
      { model: 'a', timeoutMs: 60_000 },
      { model: 'a', timeoutMs: 60_000 },
      { model: 'b', timeoutMs: 60_000 },
    ];
    await expect(interpretText('x', 'k', long, deadline(3000))).rejects.toThrow('upstream_unavailable');
    for (const [ms] of spy.mock.calls) expect(ms).toBeLessThanOrEqual(3000);
    spy.mockRestore();
    await expect(interpretText('x', 'k', long, () => 999)).rejects.toThrow('upstream_unavailable');
    expect(f).toHaveBeenCalledTimes(3); // the 999 ms budget made no call at all
  });
});
