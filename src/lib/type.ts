// Typing schedule of the Chao's bubble (DESIGN.md §17.1). Pure: no DOM, no tokens (screen.ts reads them).
export interface TypeTimes { char: number; pauseSentence: number; pauseComma: number; max: number }
export interface Schedule { chars: string[]; at: number[]; total: number }

const SENTENCE = new Set(['.', '?', '!', '…']);
const COMMA = new Set([',', ';', ':']);

/** Extra wait before `next` when it is a space after punctuation ("Hey! What", never "3.5"). */
const pause = (prev: string, next: string, t: TypeTimes) =>
  !/^\s$/u.test(next) ? 0 : SENTENCE.has(prev) ? t.pauseSentence : COMMA.has(prev) ? t.pauseComma : 0;

/** `at[i]` = ms after the start at which letter i appears (code points, first at 0). Over `max`, every delay is scaled evenly. */
export function typeSchedule(line: string, t: TypeTimes): Schedule {
  const chars = Array.from(line);
  const at: number[] = [];
  chars.forEach((c, i) => at.push(i ? at[i - 1] + t.char + pause(chars[i - 1], c, t) : 0));
  let total = at.length ? at[at.length - 1] : 0;
  if (total > t.max) {
    const k = t.max / total;
    for (let i = 0; i < at.length; i++) at[i] *= k;
    total = t.max;
  }
  return { chars, at, total };
}

/** Which letters get a blip: the 1st, 3rd, 5th... letter/number of each word (DESIGN §17.5). */
export function blipMask(chars: string[]): boolean[] {
  let n = 0;
  return chars.map((c) => (/[\p{L}\p{N}]/u.test(c) ? n++ % 2 === 0 : ((n = 0), false)));
}
