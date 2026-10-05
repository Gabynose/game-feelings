import { describe, it, expect } from 'vitest';
import { GENRES, PLATFORMS, PLATFORM_SLUGS, TAGS } from '../api/_lib/vocab';

describe('RAWG whitelist', () => {
  it('has sane sizes', () => {
    expect(GENRES.length).toBeGreaterThanOrEqual(12);
    expect(TAGS.length).toBeGreaterThanOrEqual(50);
    expect(TAGS.length).toBeLessThanOrEqual(90);
  });
  it('contains only unique kebab-case slugs', () => {
    for (const list of [GENRES, TAGS, PLATFORM_SLUGS]) {
      expect(new Set(list).size).toBe(list.length);
      for (const s of list) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
  it('excludes adult tags', () => {
    for (const bad of ['nudity', 'sexual-content', 'porn', 'hentai', 'erotic', 'dating-sim']) expect(TAGS).not.toContain(bad);
  });
  it('covers the requirement vocabulary the product promises', () => {
    for (const t of ['souls-like', 'metroidvania', 'action-rpg', 'online-co-op', 'co-op', 'multiplayer', 'singleplayer', 'turn-based', 'first-person', 'third-person', 'open-world'])
      expect(TAGS, t).toContain(t);
    for (const g of ['action', 'adventure', 'role-playing-games-rpg', 'strategy']) expect(GENRES).toContain(g);
  });
  it('genres and tags do not overlap', () => {
    expect(GENRES.filter((g) => TAGS.includes(g))).toEqual([]);
  });
});

describe('platforms', () => {
  it('maps every slug to a non-empty list of positive integer RAWG platform ids, none shared between slugs', () => {
    const all: number[] = [];
    for (const s of PLATFORM_SLUGS) {
      expect(PLATFORMS[s].length, s).toBeGreaterThan(0);
      for (const id of PLATFORMS[s]) {
        expect(Number.isInteger(id) && id > 0, `${s}:${id}`).toBe(true);
        all.push(id);
      }
    }
    expect(new Set(all).size).toBe(all.length);
  });
  it('knows the platforms people actually name', () => {
    expect(PLATFORM_SLUGS).toEqual(expect.arrayContaining(['pc', 'playstation', 'xbox', 'nintendo-switch', 'ios', 'android']));
    expect(PLATFORMS['nintendo-switch']).toEqual([7]);
  });
});
