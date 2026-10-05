import { describe, it, expect } from 'vitest';
import { createRateLimiter, createCache } from '../api/_lib/memory';

describe('rate limiter', () => {
  it('allows up to max per window per ip, then blocks', () => {
    const allow = createRateLimiter(3, 60_000);
    expect([1, 2, 3, 4].map(() => allow('1.1.1.1', 0))).toEqual([true, true, true, false]);
  });
  it('tracks ips independently', () => {
    const allow = createRateLimiter(1, 60_000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('b', 0)).toBe(true);
    expect(allow('a', 1)).toBe(false);
  });
  it('resets after the window', () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 999)).toBe(false);
    expect(allow('a', 1001)).toBe(true);
  });
});

describe('rate limiter: cost units', () => {
  it('charges `cost` units per call: 60/min with cost 6 allows 10 calls, not 11', () => {
    const allow = createRateLimiter(60, 60_000);
    const codes = Array.from({ length: 11 }, () => allow('a', 0, 6));
    expect(codes).toEqual([...Array(10).fill(true), false]);
  });
  it('mixes costs in one window and a single call costing more than max is refused', () => {
    const allow = createRateLimiter(10, 60_000);
    expect([allow('a', 0, 6), allow('a', 1, 4), allow('a', 2, 1)]).toEqual([true, true, false]);
    expect(allow('b', 0, 11)).toBe(false);
  });
  it('default cost is 1 and the window still resets', () => {
    const allow = createRateLimiter(2, 1000);
    expect([allow('a', 0), allow('a', 1), allow('a', 2)]).toEqual([true, true, false]);
    expect(allow('a', 1000, 2)).toBe(true);
  });
});

describe('cache', () => {
  it('returns stored values until ttl expires', () => {
    const c = createCache<string>(10, 1000);
    c.set('k', 'v', 0);
    expect(c.get('k', 999)).toBe('v');
    expect(c.get('k', 1001)).toBeUndefined();
  });
  it('evicts the oldest entry beyond max size', () => {
    const c = createCache<number>(2, 1000);
    c.set('a', 1, 0);
    c.set('b', 2, 0);
    c.set('c', 3, 0);
    expect(c.get('a', 1)).toBeUndefined();
    expect(c.get('b', 1)).toBe(2);
    expect(c.get('c', 1)).toBe(3);
  });
});
