// Closed RAWG vocabulary for game REQUIREMENTS ("a co-op adventure", "a souls-like for Switch").
// Verified against live RAWG on 2026-10-03 (npm run verify:vocab): every genre is listed by /genres, every
// tag answers /tags/{slug} with >= 900 games, every platform id answers /platforms/{id}.
// Deliberately excluded: adult tags (nudity, sexual-content, dating-sim...), store/controller tags
// (steam-*, controller-support), tags that do not exist or are near-empty on RAWG (rogue-like, casual,
// pve-co-op, 2-player-local, stealth-action, farming-sim, life-sim) and the old mood-only tags that no game
// requirement maps to (calm, chill, peaceful, emotional, sad, nostalgia, beautiful, great-soundtrack,
// comedy, weird, surreal, violent, drama, music, psychological).

export const GENRES = [
  'action',
  'adventure',
  'arcade',
  'card',
  'casual',
  'family',
  'fighting',
  'indie',
  'massively-multiplayer',
  'platformer',
  'puzzle',
  'racing',
  'role-playing-games-rpg',
  'shooter',
  'simulation',
  'sports',
  'strategy',
];

export const TAGS = [
  // sub-genres / how it plays
  'souls-like', 'metroidvania', 'action-rpg', 'jrpg', 'roguelike', 'roguelite', 'hack-and-slash',
  'beat-em-up', 'bullet-hell', 'stealth', 'survival', 'sandbox', 'open-world', 'exploration',
  'turn-based', 'turn-based-combat', 'tactical', 'city-builder', 'base-building', 'crafting',
  'management', 'tower-defense', 'card-game', 'deckbuilding', 'rhythm', 'puzzle-platformer',
  'driving', 'fps', 'third-person-shooter', 'visual-novel', 'detective', 'mystery', 'horror', 'building',
  // players
  'singleplayer', 'multiplayer', 'co-op', 'online-co-op', 'local-co-op', 'local-multiplayer', 'pvp', 'pve',
  'split-screen', 'competitive',
  // perspective
  'first-person', 'third-person', '2d', '3d',
  // feel / pace / story
  'relaxing', 'cozy', 'wholesome', 'family-friendly', 'atmospheric', 'funny', 'cute', 'colorful', 'dark',
  'difficult', 'challenging', 'fast-paced', 'short', 'story-rich', 'narrative', 'choices-matter',
  'multiple-endings', 'noir',
  // look / setting
  'pixel-graphics', 'retro', 'classic', 'hand-drawn', 'cartoony', 'anime', 'realistic', 'minimalist',
  'sci-fi', 'fantasy', 'dark-fantasy', 'medieval', 'cyberpunk', 'space', 'post-apocalyptic', 'zombies', 'magic',
];

// Platform slug -> RAWG platform ids (sent as `platforms=7,18`). Children, not parents, on purpose: the
// parent "nintendo" also covers NES..Wii U, so "for Switch" could not be expressed with parent_platforms.
// PlayStation = PS5, PS4, PS3; Xbox = Series X|S, One, 360. RAWG has no separate Switch 2 platform (checked
// 2026-10-04: its games, e.g. Mario Kart World, are listed under id 7), so 7 covers both.
export const PLATFORMS: Record<string, readonly number[]> = {
  pc: [4],
  playstation: [187, 18, 16],
  xbox: [186, 1, 14],
  'nintendo-switch': [7],
  ios: [3],
  android: [21],
  mac: [5],
  linux: [6],
};
export const PLATFORM_SLUGS = Object.keys(PLATFORMS);

export const GENRE_SET = new Set(GENRES);
export const TAG_SET = new Set(TAGS);
export const PLATFORM_SET = new Set(PLATFORM_SLUGS);

/** Platform slugs -> flat, deduped RAWG ids (unknown slugs ignored: callers validate first). */
export const platformIds = (slugs: readonly string[]): number[] => [...new Set(slugs.flatMap((s) => (PLATFORM_SET.has(s) ? PLATFORMS[s] : [])))];
