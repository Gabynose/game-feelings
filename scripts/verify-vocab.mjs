// Re-checks the closed whitelist (api/_lib/vocab.ts) against live RAWG: every genre must be listed by
// /genres, every tag must answer /tags/{slug} and every platform id /platforms/{id}. Prints failures; exit 1 if any (network errors count).
// The RAWG key is read at run time from process.env or .env.local and is never printed.
import { readFile } from 'node:fs/promises';
import { GENRES, PLATFORMS, TAGS } from '../api/_lib/vocab.ts'; // Node 23.6+ strips TS types natively

const BASE = 'https://api.rawg.io/api';
const MIN_GAMES = 900; // vocab.ts documents "every tag answers with >= 900 games"

const envText = await readFile('.env.local', 'utf8').catch(() => '');
const key = (process.env.RAWG_API_KEY || envText.match(/^RAWG_API_KEY=(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
if (!key) {
  console.error('verify-vocab: RAWG_API_KEY not found in env or .env.local');
  process.exit(1);
}

// Never let the key reach the output, even inside an error message.
const scrub = (s) => String(s).split(key).join('***');
async function get(path, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}key=${key}`, { signal: AbortSignal.timeout(15000) });
      if (res.status === 404) return { status: 404 };
      if (res.status >= 500 && i < tries) continue;
      return { status: res.status, body: res.ok ? await res.json() : null };
    } catch (e) {
      if (i >= tries) return { status: 0, error: scrub(e?.cause?.code ?? e?.name ?? 'network') };
    }
  }
}

const failures = [];

const genres = await get('/genres?page_size=40');
if (genres.status !== 200) failures.push(`/genres -> HTTP ${genres.status || genres.error}`);
else {
  const live = new Set(genres.body.results.map((g) => g.slug));
  for (const g of GENRES) if (!live.has(g)) failures.push(`genre "${g}" is not in RAWG /genres`);
}

const rows = [];
for (let i = 0; i < TAGS.length; i += 6) {
  rows.push(...(await Promise.all(TAGS.slice(i, i + 6).map(async (t) => [t, await get(`/tags/${t}`)]))));
}
for (const [t, r] of rows) {
  if (r.status === 404) failures.push(`tag "${t}" does not exist in RAWG (404)`);
  else if (r.status !== 200) failures.push(`tag "${t}" -> HTTP ${r.status || r.error} (could not verify)`);
  else if (r.body.slug !== t) failures.push(`tag "${t}" resolves to slug "${r.body.slug}" (renamed upstream)`);
  else if (r.body.games_count < MIN_GAMES) failures.push(`tag "${t}" has only ${r.body.games_count} games (< ${MIN_GAMES})`);
}

const plats = Object.entries(PLATFORMS).flatMap(([slug, ids]) => ids.map((id) => [slug, id]));
for (let i = 0; i < plats.length; i += 6) {
  const rows2 = await Promise.all(plats.slice(i, i + 6).map(async ([slug, id]) => [slug, id, await get(`/platforms/${id}`)]));
  for (const [slug, id, r] of rows2) {
    if (r.status === 404) failures.push(`platform "${slug}" id ${id} does not exist in RAWG (404)`);
    else if (r.status !== 200) failures.push(`platform "${slug}" id ${id} -> HTTP ${r.status || r.error} (could not verify)`);
    else if (r.body.id !== id) failures.push(`platform "${slug}" id ${id} resolves to id ${r.body.id}`);
    else if (r.body.games_count < MIN_GAMES) failures.push(`platform "${slug}" id ${id} has only ${r.body.games_count} games`);
  }
}

console.log(`verify-vocab: ${GENRES.length} genres, ${TAGS.length} tags, ${plats.length} platform ids checked against live RAWG`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log('verify-vocab: OK, every slug exists');
