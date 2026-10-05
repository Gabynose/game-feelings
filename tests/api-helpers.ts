// Not a test file: small wrappers so tests can pass partial queries to getGames.
import { getGames as real } from '../api/_lib/rawg';
import type { GamesQuery } from '../api/_lib/validate';

export type Q = Pick<GamesQuery, 'genres' | 'tags'> & Partial<GamesQuery>;
type Left = Parameters<typeof real>[1];

/** The full { games, complete } answer. */
export const getGamesFull = (q: Q, left?: Left) => real({ platforms: [], dates: null, examples: [], ...q }, left);
/** Just the games. */
export const getGames = async (q: Q, left?: Left) => (await getGamesFull(q, left)).games;
