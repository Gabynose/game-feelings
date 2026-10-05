import { describe, it, expect } from 'vitest';
import { parseText, normalizeText, parseGamesQuery, parseGameId, cleanTitle } from '../api/_lib/validate';

describe('parseText', () => {
  it('accepts and trims a normal request', () => {
    expect(parseText({ text: '  quiero un souls-like  ' })).toBe('quiero un souls-like');
  });
  it.each([
    ['empty', { text: '' }],
    ['whitespace only', { text: '   \n ' }],
    ['non-string', { text: 42 }],
    ['array', { text: ['a'] }],
    ['missing', {}],
    ['null body', null],
    ['not an object', 'hello'],
    ['over 200 chars', { text: 'a'.repeat(201) }],
  ])('rejects %s', (_n, body) => {
    expect(parseText(body)).toBeNull();
  });
  it('accepts exactly 200 chars', () => {
    expect(parseText({ text: 'a'.repeat(200) })).toHaveLength(200);
  });
});

describe('normalizeText', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeText('  Quiero   un SOULS-like\tya ')).toBe('quiero un souls-like ya');
  });
});

describe('cleanTitle (example game titles, from the model or from the query string)', () => {
  it('trims and collapses whitespace, keeps real-world punctuation and accents', () => {
    expect(cleanTitle('  Ratchet &   Clank: Rift Apart ')).toBe('Ratchet & Clank: Rift Apart');
    expect(cleanTitle("Assassin's Creed II")).toBe("Assassin's Creed II");
    expect(cleanTitle('Pokémon Rojo')).toBe('Pokémon Rojo');
    expect(cleanTitle('ゼルダの伝説')).toBe('ゼルダの伝説');
  });
  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['not a string', 5],
    ['null', null],
    ['over 60 chars', 'a'.repeat(61)],
    ['control char', 'Doom\u0000'],
    ['newline inside', 'Doom\nEternal'],
    ['zero-width', 'Do​om'],
    ['bidi override', '‮Doom'],
    ['markup', '<script>alert(1)</script>'],
    ['no letter or digit', '!!! ---'],
  ])('rejects %s', (_n, v) => {
    expect(cleanTitle(v)).toBeNull();
  });
  it('accepts exactly 60 chars', () => {
    expect(cleanTitle('a'.repeat(60))).toHaveLength(60);
  });
  it('is idempotent (a title cleaned by the model path passes the query-string path unchanged)', () => {
    const once = cleanTitle('  Dark   Souls III ')!;
    expect(cleanTitle(once)).toBe(once);
  });
});

describe('parseGamesQuery', () => {
  const q = (s: string) => new URLSearchParams(s);
  const none = { platforms: [], dates: null, examples: [] };
  it('parses whitelisted genres and tags', () => {
    expect(parseGamesQuery(q('genres=adventure,casual&tags=cozy,atmospheric'))).toEqual({
      genres: ['adventure', 'casual'],
      tags: ['cozy', 'atmospheric'],
      ...none,
    });
  });
  it('accepts a query with only one of genres / tags / platforms / examples', () => {
    expect(parseGamesQuery(q('tags=cozy'))).toMatchObject({ genres: [], tags: ['cozy'] });
    expect(parseGamesQuery(q('platforms=nintendo-switch'))).toMatchObject({ platforms: ['nintendo-switch'] });
    expect(parseGamesQuery(q('examples=Dark%20Souls'))).toMatchObject({ examples: ['Dark Souls'] });
  });
  it('parses platforms, dates and repeated examples params', () => {
    const out = parseGamesQuery(q('genres=action&platforms=pc,playstation&dates=2010-01-01,2019-12-31&examples=Dark%20Souls&examples=Elden%20Ring'));
    expect(out).toEqual({
      genres: ['action'],
      tags: [],
      platforms: ['pc', 'playstation'],
      dates: ['2010-01-01', '2019-12-31'],
      examples: ['Dark Souls', 'Elden Ring'],
    });
  });
  it('rejects unknown slugs', () => {
    expect(parseGamesQuery(q('genres=porn'))).toBeNull();
    expect(parseGamesQuery(q('tags=cozy,nudity'))).toBeNull();
    expect(parseGamesQuery(q('genres=action&platforms=amiga-cd32'))).toBeNull();
    expect(parseGamesQuery(q('genres=action&platforms=4'))).toBeNull(); // ids are not accepted: slugs only
  });
  it('rejects a query with no genres, tags, platforms or examples', () => {
    expect(parseGamesQuery(q(''))).toBeNull();
    expect(parseGamesQuery(q('genres=&tags='))).toBeNull();
    expect(parseGamesQuery(q('dates=2010-01-01,2019-12-31'))).toBeNull(); // dates alone = globally popular junk
  });
  it('rejects too many items', () => {
    const many = ['cozy', 'relaxing', 'atmospheric', 'funny', 'cute', 'colorful', 'dark', 'horror', 'difficult'].join(',');
    expect(parseGamesQuery(q(`tags=${many}`))).toBeNull();
    expect(parseGamesQuery(q('platforms=pc,playstation,xbox,nintendo-switch,ios,android,mac'))).toBeNull();
  });
  it.each([
    ['not a date', 'dates=soon'],
    ['one date', 'dates=2010-01-01'],
    ['three dates', 'dates=2010-01-01,2011-01-01,2012-01-01'],
    ['impossible day', 'dates=2010-02-30,2011-01-01'],
    ['from after to', 'dates=2019-01-01,2010-12-31'],
    ['too old', 'dates=1900-01-01,2000-12-31'],
    ['far future', 'dates=2010-01-01,2999-12-31'],
    ['quote injection', "dates=2010-01-01',2011-01-01"],
  ])('rejects dates: %s', (_n, s) => {
    expect(parseGamesQuery(q(`tags=cozy&${s}`))).toBeNull();
  });
  it('accepts a single-day range (from == to)', () => {
    expect(parseGamesQuery(q('tags=cozy&dates=2010-05-05,2010-05-05'))?.dates).toEqual(['2010-05-05', '2010-05-05']);
  });
  it('validates examples at the edge: max 5, clean titles only, deduped', () => {
    const ex = (...t: string[]) => t.map((x) => `examples=${encodeURIComponent(x)}`).join('&');
    expect(parseGamesQuery(q(`tags=cozy&${ex('a1', 'a2', 'a3', 'a4', 'a5')}`))?.examples).toHaveLength(5);
    expect(parseGamesQuery(q(`tags=cozy&${ex('a1', 'a2', 'a3', 'a4', 'a5', 'a6')}`))).toBeNull();
    expect(parseGamesQuery(q(`tags=cozy&${ex('<b>x</b>')}`))).toBeNull();
    expect(parseGamesQuery(q(`tags=cozy&${ex('x'.repeat(61))}`))).toBeNull();
    expect(parseGamesQuery(q(`tags=cozy&${ex('Doom\u0000')}`))).toBeNull();
    expect(parseGamesQuery(q(`tags=cozy&${ex('Doom', ' doom ')}`))?.examples).toEqual(['Doom']);
  });
});

describe('parseGameId (RAWG numeric id or slug)', () => {
  it('accepts digits and normalizes leading zeros', () => {
    expect(parseGameId('3498')).toBe('3498');
    expect(parseGameId('007')).toBe('7');
  });
  it('accepts RAWG slugs', () => {
    expect(parseGameId('grand-theft-auto-v')).toBe('grand-theft-auto-v');
    expect(parseGameId('portal-2')).toBe('portal-2');
    expect(parseGameId('a'.repeat(100))).toHaveLength(100);
  });
  it.each(['', '0', '000', '../1', '-1', '1.5', '1234567890123', 'Portal-2', 'a--b', '-a', 'a-', 'a b', 'a/b', 'a%2Fb', 'a'.repeat(101), '１２３', null])(
    'rejects %s',
    (v) => {
      expect(parseGameId(v as string | null)).toBeNull();
    },
  );
});

describe('parseText: invisible-only input', () => {
  it.each(['​​', '‍', ' ', '‮', '﻿', ' ​   '])('treats %j as empty', (t) => {
    expect(parseText({ text: t })).toBeNull();
  });
  it('still accepts real text that merely contains invisible characters', () => {
    expect(parseText({ text: 'rpg​' })).toBe('rpg​');
  });
});
