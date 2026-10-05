// DEV only (?mock=…): exercises every narrator state without the network. main.ts loads it with import()
// under import.meta.env.DEV, so neither this file nor the game fixture reaches production builds.
import type { Finder, Outcome } from '../lib/api';
import { MOCK_GAMES } from './mock-games';

export const MOCKS = ['results', 'empty', 'offtopic', 'error', 'rate', 'busy', 'network', 'slow', 'timeout'] as const;
export type Mock = (typeof MOCKS)[number];

const BAD: Outcome = { kind: 'error', reason: 'bad' };

export function mockFinder(kind: Mock): Finder {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return async (_text, onInterpreted) => {
    await wait(kind === 'slow' ? 5200 : kind === 'timeout' ? 6000 : 1200);
    if (kind === 'offtopic') return { kind: 'off-topic' };
    if (kind === 'error') return BAD;
    if (kind === 'rate') return { kind: 'error', reason: 'rate', retryAfter: 12 };
    if (kind === 'busy') return { kind: 'error', reason: 'busy' };
    if (kind === 'network') return { kind: 'error', reason: 'network' };
    if (kind === 'timeout') return { kind: 'error', reason: 'slow' };
    const summary = kind === 'empty' ? 'single-player metroidvania for Switch' : 'cozy indie games'; // matches the fixture in mock-games.ts
    onInterpreted(summary);
    await wait(900);
    return kind === 'empty' ? { kind: 'no-results', summary } : { kind: 'results', summary, games: MOCK_GAMES };
  };
}
