// The Chao's typing blip: a tiny Web Audio synth, no assets (DESIGN.md §17.5).
// The AudioContext is created in the first user gesture; until then (the intro) the typing is silent.
const BASE_HZ = 784;
const DUR = 0.045; // s
const ATTACK = 0.004;
const PEAK = 0.05;
const MIN_GAP_MS = 50;
const MOOD_ST: Record<string, number> = { think: -1, happy: 3, sad: -4, error: -5 };

/** Deterministic pitch: -2..+2 semitones per letter, plus the mood's offset. */
export const pitch = (char: string, mood = 'idle'): number =>
  BASE_HZ * 2 ** ((((char.codePointAt(0) ?? 0) * 7) % 5 - 2 + (MOOD_ST[mood] ?? 0)) / 12);

let muted: boolean | null = null; // read lazily from storage
let ctx: AudioContext | null = null;
let filter: BiquadFilterNode;
let last = -Infinity;

function ensure(): void {
  if (isMuted()) return;
  if (!ctx) {
    if (!window.AudioContext) return; // no Web Audio: silent, no errors
    ctx = new AudioContext();
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;
    filter.Q.value = 0.7;
    filter.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** Call once at startup: a gesture creates the AudioContext. Touch gives no activation on pointerdown, so pointerup counts too;
 *  the listeners stay until the context is really running (this also recovers an 'interrupted' one). */
export function unlockOnGesture(): void {
  const events = ['pointerdown', 'pointerup', 'keydown'];
  const go = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('.sound-toggle')) return; // its own click decides (no context for a mute click)
    ensure();
    const done = () => { if (ctx?.state === 'running') for (const n of events) removeEventListener(n, go, true); };
    done();
    ctx?.addEventListener('statechange', done, { once: true });
  };
  for (const n of events) addEventListener(n, go, true);
}

export function isMuted(): boolean {
  if (muted === null) {
    try { muted = localStorage.getItem('muted') === '1'; } catch { muted = false; } // storage blocked: sound on
  }
  return muted;
}

export function setMuted(on: boolean): void {
  muted = on;
  try { on ? localStorage.setItem('muted', '1') : localStorage.removeItem('muted'); } catch { /* storage blocked: works for this visit */ }
  ensure(); // called from a click: that is a gesture
}

/** One blip. Silence = no oscillator is created. */
export function blip(char: string, mood?: string): void {
  if (isMuted() || !ctx || ctx.state !== 'running' || document.hidden) return;
  const now = performance.now();
  if (now - last < MIN_GAP_MS) return;
  last = now;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = pitch(char, mood);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(PEAK, t + ATTACK);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + DUR);
  osc.connect(gain).connect(filter);
  osc.start(t);
  osc.stop(t + DUR + 0.005);
}
