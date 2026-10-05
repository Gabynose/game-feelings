// Pure parts of the typing polish (DESIGN.md §17): schedule, blip letters, pitch.
import { describe, expect, it } from 'vitest';
import { pitch } from '../src/lib/blip';
import { blipMask, typeSchedule } from '../src/lib/type';

const T = { char: 32, pauseSentence: 200, pauseComma: 100, max: 2200 };

describe('typeSchedule', () => {
  it('first letter at 0; the intro lasts 1544 ms', () => {
    const s = typeSchedule('Hey! What kind of game are you looking for?', T);
    expect(s.at[0]).toBe(0);
    expect(s.total).toBe(1544);
    expect(s.at[4] - s.at[3]).toBe(232); // "!" -> space: 32 + 200
    expect(s.at[5] - s.at[4]).toBe(32);
  });
  it('comma pause only when a space follows', () => {
    expect(typeSchedule('a, b', T).total).toBe(3 * 32 + 100);
    expect(typeSchedule('3.5 S/X a,b', T).total).toBe(10 * 32);
  });
  it('no pause at the end of the line; code points count once', () => {
    expect(typeSchedule('Hmm…', T).total).toBe(3 * 32);
    expect(typeSchedule('Hmm… ok', T).total).toBe(6 * 32 + 200);
    expect(typeSchedule('“a”', T).chars).toHaveLength(3);
  });
  it('caps at max with uniform scaling', () => {
    const long = 'x'.repeat(200);
    const s = typeSchedule(long, T);
    expect(s.total).toBe(2200);
    expect(s.at[100] / s.at[199]).toBeCloseTo(100 / 199 * 1.0, 5);
  });
  it('empty line', () => expect(typeSchedule('', T)).toEqual({ chars: [], at: [], total: 0 }));
});

describe('blipMask', () => {
  it('1st, 3rd, 5th letter of each word', () => {
    const line = 'Want to look for something else?';
    const chars = Array.from(line);
    expect(blipMask(chars).filter(Boolean)).toHaveLength(14);
    expect(blipMask(Array.from('Hi!'))).toEqual([true, false, false]);
  });
});

describe('pitch', () => {
  it('stays within -7..+5 semitones of 784 Hz and is deterministic', () => {
    for (const mood of ['idle', 'think', 'happy', 'sad', 'error']) {
      for (const c of 'abcXYZ09é') {
        const f = pitch(c, mood);
        expect(f).toBeGreaterThanOrEqual(784 * 2 ** (-7 / 12) - 1e-9);
        expect(f).toBeLessThanOrEqual(784 * 2 ** (5 / 12) + 1e-9);
      }
    }
    expect(pitch('a')).toBe(pitch('a'));
    expect(pitch('a', 'happy')).toBeGreaterThan(pitch('a', 'sad'));
  });
});
