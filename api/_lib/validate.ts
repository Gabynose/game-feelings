import { GENRE_SET, PLATFORM_SET, TAG_SET } from './vocab.js';

const MAX_TEXT = 200;
const MAX_GENRES = 5;
const MAX_TAGS = 8;
const MAX_PLATFORMS = 6;

/** Request body -> trimmed text, or null if invalid (non-object, non-string, empty or
 *  invisible-only, > 200 UTF-16 units: the same unit as the HTML maxlength attribute). */
export function parseText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const text = (body as { text?: unknown }).text;
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > MAX_TEXT) return null;
  // only control / format (zero-width, bidi) / separator characters = nothing to interpret
  return /[^\p{Cc}\p{Cf}\p{Z}]/u.test(t) ? t : null;
}

/** Cache key: case/whitespace-insensitive. */
export const normalizeText = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

function slugs(raw: string | null, allowed: Set<string>, max: number): string[] | null {
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length > max || list.some((s) => !allowed.has(s))) return null;
  return [...new Set(list)]; // deduped, original order kept (the first specific tag drives the RAWG query)
}

export const MAX_EXAMPLES = 5;
export const MIN_YEAR = 1970;
/** Latest year accepted anywhere (a game announced for next year can already be in RAWG). */
export const maxYear = () => new Date().getFullYear() + 1;

/** A game title coming from the model or from the query string -> cleaned title, or null. Whitespace is
 *  collapsed, 1-60 chars, no control / invisible / markup characters, at least one letter or digit.
 *  Idempotent, so what the model path returns passes the query-string path unchanged. */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // control chars (tabs and newlines too) are rejected before spaces are collapsed
  if (/[\p{Cc}\p{Cf}<>]/u.test(raw)) return null;
  const t = raw.replace(/\p{Z}+/gu, ' ').trim();
  if (!t || t.length > 60 || !/[\p{L}\p{N}]/u.test(t)) return null;
  return t;
}

/** Title identity for dedupe: case-insensitive. */
export const titleKey = (t: string) => t.toLowerCase();

/** "YYYY-MM-DD" that really exists, within [MIN_YEAR, maxYear()]. */
function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  const y = Number(s.slice(0, 4));
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s) && y >= MIN_YEAR && y <= maxYear();
}

export type GamesQuery = {
  genres: string[];
  tags: string[];
  platforms: string[];
  dates: [string, string] | null;
  examples: string[];
};

/** ?genres=&tags=&platforms=&dates=from,to&examples=A&examples=B -> validated query, or null (unknown slug,
 *  too many, bad dates/titles, or nothing to search by: dates alone would be globally popular junk). */
export function parseGamesQuery(p: URLSearchParams): GamesQuery | null {
  const genres = slugs(p.get('genres'), GENRE_SET, MAX_GENRES);
  const tags = slugs(p.get('tags'), TAG_SET, MAX_TAGS);
  const platforms = slugs(p.get('platforms'), PLATFORM_SET, MAX_PLATFORMS);
  if (!genres || !tags || !platforms) return null;

  let dates: [string, string] | null = null;
  const rawDates = p.get('dates');
  if (rawDates !== null) {
    const parts = rawDates.split(',');
    if (parts.length !== 2 || !parts.every(validDate) || parts[0] > parts[1]) return null;
    dates = [parts[0], parts[1]];
  }

  const rawExamples = p.getAll('examples');
  if (rawExamples.length > MAX_EXAMPLES) return null;
  const examples: string[] = [];
  for (const r of rawExamples) {
    const t = cleanTitle(r);
    if (!t) return null;
    if (!examples.some((e) => titleKey(e) === titleKey(t))) examples.push(t);
  }

  if (!genres.length && !tags.length && !platforms.length && !examples.length) return null;
  return { genres, tags, platforms, dates, examples };
}

/** ?id= -> a RAWG numeric id (1-9 digits, leading zeros dropped, not 0) or a RAWG slug
 *  (lowercase kebab, <= 100 chars); null otherwise. It ends up in an upstream URL path. */
export function parseGameId(raw: string | null): string | null {
  if (raw === null) return null;
  if (/^\d+$/.test(raw)) {
    if (raw.length > 9) return null;
    const n = String(Number(raw));
    return n === '0' ? null : n;
  }
  return raw.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw) ? raw : null;
}
