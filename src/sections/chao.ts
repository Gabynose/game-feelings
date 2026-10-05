// Chao rig hooks (DESIGN.md §13). The markup is chaoRig() in chao-rig.ts (§13.3).
import { ease, time } from '../lib/tokens';

export const MOODS = ['enter', 'idle', 'listen', 'think', 'happy', 'sad', 'error'] as const;
export type Mood = (typeof MOODS)[number];

const PARTS = '.chao__pose, .chao__wing, .chao__eyes, .chao__ball';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const DECODE_TIMEOUT_MS = 1500; // a stalled image must never block the intro
const ENTER_SAFETY_MS = 300; // after --dur-enter, force the end (background tab, no animation)
const BLINK_FIRST_MS = 1800;
const BLINK_DOUBLE_MS = 260; // 20 % of blinks come in pairs
const BLINK_DOUBLE_ODDS = 0.2;
const BLINK_MIN_MS = 2200;
const BLINK_SPREAD_MS = 3800;
const VOICE_FLOOR = 0.1; // below: mouth shut; the v/open cross-fade band (0.06-0.085) is never held
const VOICE_MIN_OPEN = 0.15;

/** Runs `change`, then blends every part from where it was to where the new state puts it
 *  (Chrome does not transition out of a removed CSS loop: without this, poses jump). */
function blendAround(chao: HTMLElement, change: () => void): void {
  const parts = [...chao.querySelectorAll<HTMLElement>(PARTS)];
  const from = parts.map((p) => {
    const cs = getComputedStyle(p);
    return { translate: cs.translate, rotate: cs.rotate, scale: cs.scale };
  });
  change();
  if (reduce.matches) return;
  const options = { duration: time('--chao-blend-dur', 260, chao), easing: ease('--ease-out', 'ease-out', chao) };
  parts.forEach((p, i) => p.animate([from[i], {}], options));
}

/** Switches mood; the same mood again replays its one-shots (finished animations are not in getAnimations()). */
export function setMood(chao: HTMLElement, mood: Mood): void {
  const prev = chao.dataset.mood;
  const change = () => {
    if (mood === 'error') chao.removeAttribute('data-blink'); // a pending blink would replay when leaving error
    if (prev === mood) {
      chao.removeAttribute('data-mood');
      void chao.offsetWidth;
    }
    chao.dataset.mood = mood;
  };
  if (prev) blendAround(chao, change);
  else change(); // first mood: nothing to blend from
}

const enterCalls = new WeakMap<HTMLElement, number>();

/** Entrance (intro). Resolves when Chao has landed (or faded in); only the latest call switches to idle. */
export async function playEnter(chao: HTMLElement): Promise<void> {
  const call = (enterCalls.get(chao) ?? 0) + 1;
  enterCalls.set(chao, call);
  // only what is visible on entry (the preloaded layers); the other ball glyphs and the happy eyes load later
  const visible = chao.querySelectorAll<HTMLImageElement>('img:not(.chao__glyph, .chao__eyes-happy), .chao__glyph--ball');
  let timeout = 0;
  await Promise.race([
    Promise.all([...visible].map((i) => i.decode().catch(() => undefined))),
    new Promise((r) => { timeout = window.setTimeout(r, DECODE_TIMEOUT_MS); }),
  ]);
  clearTimeout(timeout);
  if (enterCalls.get(chao) !== call) return; // a newer call took over
  return new Promise((done) => {
    let timer = 0;
    const finish = () => {
      chao.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
      if (enterCalls.get(chao) === call && chao.dataset.mood === 'enter') setMood(chao, 'idle');
      done();
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === chao) finish(); // chao-enter-x, or chao-fade-in under reduced motion
    };
    chao.addEventListener('animationend', onEnd);
    timer = window.setTimeout(finish, time('--dur-enter', 1000, chao) + ENTER_SAFETY_MS);
    setMood(chao, 'enter');
  });
}

/** One blink now (no-op under reduced motion or while the error daze plays). */
export function blink(chao: HTMLElement): void {
  if (reduce.matches || chao.dataset.mood === 'error') return;
  chao.removeAttribute('data-blink');
  void chao.offsetWidth;
  chao.setAttribute('data-blink', '');
}

/** Random blinks. Call ONCE per rig, from its owner, and keep the stop function. Stops by itself when the rig leaves the DOM. */
export function startBlink(chao: HTMLElement): () => void {
  let id = 0;
  const onEnd = (e: AnimationEvent) => {
    if (e.animationName === 'chao-blink') chao.removeAttribute('data-blink');
  };
  const stop = () => {
    clearTimeout(id);
    chao.removeEventListener('animationend', onEnd);
  };
  const tick = () => {
    if (!chao.isConnected) return stop();
    const paused = document.hidden || document.documentElement.hasAttribute('data-holo-paused');
    if (!paused && chao.dataset.mood !== 'enter') blink(chao);
    const wait = Math.random() < BLINK_DOUBLE_ODDS ? BLINK_DOUBLE_MS : BLINK_MIN_MS + Math.random() * BLINK_SPREAD_MS;
    id = window.setTimeout(tick, wait);
  };
  chao.addEventListener('animationend', onEnd);
  id = window.setTimeout(tick, BLINK_FIRST_MS);
  return stop;
}

const talkTimers = new WeakMap<HTMLElement, number>();
const rigOf = (chao: HTMLElement) => chao.querySelector<HTMLElement>('.chao__rig')!;
const mouthOf = (chao: HTMLElement) => chao.querySelector<HTMLElement>('.chao__mouth')!;

/** Ends talking without a jump: body scale and mouth ease back (otherwise the body shrinks ~6 % in one frame). */
function stopTalking(chao: HTMLElement): void {
  clearTimeout(talkTimers.get(chao));
  const rig = rigOf(chao), mouth = mouthOf(chao);
  const scale = getComputedStyle(rig).scale;
  const level = getComputedStyle(mouth).getPropertyValue('--voice-level').trim() || '0';
  delete chao.dataset.talking;
  rig.style.removeProperty('scale');
  mouth.style.removeProperty('--voice-level');
  if (reduce.matches) return;
  const options = { duration: time('--dur-fast', 160, chao), easing: ease('--ease-out', 'ease-out', chao) };
  rig.animate([{ scale }, {}], options);
  mouth.animate([{ '--voice-level': level }, { '--voice-level': '0' }], options);
}

/** The mouth cycles for `ms` (the typing time of the bubble line, DESIGN §17.3). */
export function talk(chao: HTMLElement, ms: number): void {
  if (chao.dataset.talking === 'voice') return; // real audio drives the mouth (phase 4c)
  clearTimeout(talkTimers.get(chao));
  chao.dataset.talking = 'cycle';
  talkTimers.set(chao, window.setTimeout(() => {
    if (chao.dataset.talking === 'cycle') stopTalking(chao);
  }, ms));
}

/** Phase 4c: call every animation frame with the smoothed audio level; null when the clip ends. */
export function voiceLevel(chao: HTMLElement, level: number | null): void {
  if (level === null) return stopTalking(chao);
  clearTimeout(talkTimers.get(chao));
  let v = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  if (v < VOICE_FLOOR) v = 0;
  else if (v < VOICE_MIN_OPEN) v = VOICE_MIN_OPEN;
  chao.dataset.talking = 'voice';
  const rig = rigOf(chao), cs = getComputedStyle(rig);
  const k = v * (parseFloat(cs.getPropertyValue('--motion-scale')) || 0); // 0 under reduced motion: only the mouth moves
  const squash = parseFloat(cs.getPropertyValue('--chao-talk-squash')) || 0;
  const stretch = parseFloat(cs.getPropertyValue('--chao-talk-stretch')) || 0;
  rig.style.scale = `${1 - squash * k} ${1 + stretch * k}`; // inline scale: no inherited property re-styling the whole rig
  mouthOf(chao).style.setProperty('--voice-level', v.toFixed(3));
}

declare global {
  interface Window {
    /** DEV only (set by main.ts): drive the lab rig from tests. */
    __chao?: { el: HTMLElement; setMood: typeof setMood; playEnter: typeof playEnter; talk: typeof talk; voiceLevel: typeof voiceLevel; blink: typeof blink };
  }
}
