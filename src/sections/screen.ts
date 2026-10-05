// Single screen + narrator state machine (SPEC §1.1, DESIGN.md §14).
import { content } from '../content';
import type { Finder, Outcome } from '../lib/api';
import { blip } from '../lib/blip';
import { el, fill } from '../lib/dom';
import { blipMask, typeSchedule } from '../lib/type';
import { ease, px, time } from '../lib/tokens';
import { playEnter, setMood, startBlink, talk, type Mood } from './chao';
import { chaoRig } from './chao-rig';
import { createShelf, type OpenGame } from './results';

export type State = 'intro' | 'typing' | 'empty-input' | 'thinking' | 'results' | 'no-results' | 'error' | 'detail';

/** States that switch the layout to compact. Once compact it stays compact until the Chao is clicked (§18.1). */
const COMPACT: ReadonlySet<State> = new Set<State>(['results', 'no-results', 'error', 'detail']);
const MOOD: Record<State, Mood> = {
  intro: 'idle', typing: 'listen', 'empty-input': 'listen', thinking: 'think',
  results: 'happy', 'no-results': 'sad', error: 'error', detail: 'idle',
};
const LONG_WAIT_MS = 4000; // then the narrator says it is still thinking
const DEFAULT_RETRY_S = 10;
const HAS_TEXT = /[^\p{Cc}\p{Cf}\p{Z}]/u; // same rule as the server (api/_lib/validate.ts): blank = nothing printable

const n = content.narrator;

const SPOKEN_SUMMARY_MAX = 26; // DESIGN §14.13: longer summaries do not fit 2 lines at 375 px compact
/** The narrator repeats short summaries only; an empty or long one gets the plain line. */
const withSummary = (line: string, plain: string, summary: string) =>
  summary && summary.length <= SPOKEN_SUMMARY_MAX ? fill(line, { summary }) : plain;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)'); // touch: never pop the keyboard by script

/** What the narrator says for an outcome, and the state it leads to. */
export function lineFor(o: Outcome): [State, string] {
  switch (o.kind) {
    case 'results': return ['results', withSummary(n.results, n.resultsPlain, o.summary)];
    case 'no-results': return ['no-results', n.noResults];
    case 'off-topic': return ['no-results', n.offTopic];
    case 'error': {
      const line = o.reason === 'rate' ? fill(n.errorRate, { seconds: o.retryAfter ?? DEFAULT_RETRY_S })
        : o.reason === 'busy' ? n.errorBusy
        : o.reason === 'network' ? n.errorNetwork
        : o.reason === 'slow' ? n.errorSlow
        : n.error;
      return ['error', line];
    }
  }
}

export interface Screen {
  main: HTMLElement;
  /** Intro: Chao enters, the bubble says hello, then the form appears. */
  start(): Promise<void>;
  /** Phase 6 hook: the detail panel calls detail(true) when it opens and detail(false) when it closes. */
  detail(open: boolean): void;
}

export function createScreen(app: HTMLElement, find: Finder): Screen {
  const chao = chaoRig();
  const restartLabel = content.character.restart;
  let pending = false; // one request at a time (also guards against a double submit in the same frame)
  // The screen reader gets the whole line once (spoken); the eyes get it typed (DESIGN §17.2). The pending part keeps its place: the box never reflows.
  const spoken = el('span', { class: 'visually-hidden bubble__spoken', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const typed = el('span', { class: 'bubble__typed' });
  const rest = el('span', { class: 'bubble__pending' });
  const text = el('span', { class: 'bubble__text', 'aria-hidden': 'true' }, typed, rest); // only the text fades between lines; the box stays put
  const bubble = el('p', { class: 'bubble', id: 'narrator-line', 'data-hidden': '' }, spoken, text);
  const input = el('input', {
    class: 'feeling__input', id: 'feeling' /* legacy id/class names from the feelings version; the verify scripts depend on them */, name: 'feeling', type: 'text', maxlength: '200', autocomplete: 'off',
    enterkeyhint: 'search', placeholder: content.input.placeholder, 'aria-describedby': 'narrator-line',
  });
  const submit = el('button', { class: 'feeling__submit', type: 'submit' },
    el('span', { class: 'feeling__go' }, content.input.submit), el('span', { class: 'feeling__busy' }, content.input.submitBusy));
  const form = el('form', { class: 'feeling', role: 'search', novalidate: '', 'aria-busy': 'false', 'data-hidden': '' },
    el('label', { class: 'visually-hidden', for: 'feeling' }, content.input.label), input, submit);
  const title = el('div', { class: 'screen__title' },
    el('div', { class: 'title-wrap' }, el('h1', { class: 'title', 'data-text': content.pageTitle }, content.pageTitle)));
  const narrator = el('div', { class: 'narrator' }, chao, bubble);
  // Phase 6 listens for 'game:open' on #app ({ game, opener }) and opens the detail panel (it also owns ?game=<slug>).
  const openGame: OpenGame = (game, opener) => app.dispatchEvent(new CustomEvent('game:open', { detail: { game, opener } }));
  const shelf = createShelf(openGame);
  const main = el('main', { class: 'screen' }, el('div', { class: 'screen__stage' }, title, narrator, form), shelf.el);
  app.dataset.state = 'intro';
  app.dataset.layout = 'full';

  // ---- the bubble: the Chao types each line (DESIGN §17); the old text fades out, then the new one is typed ----
  // Timers (not animation.finished or rAF) drive everything: they still fire in a background tab or on a slow machine.
  const times = {
    char: time('--type-char', 32), pauseSentence: time('--type-pause-sentence', 200),
    pauseComma: time('--type-pause-comma', 100), max: time('--type-max', 2200),
  };
  let swapTimer = 0;
  let typeTimer = 0;
  let finish = () => {}; // stops the typing and paints the rest at once (no blips)
  let nextLine = '';
  const show = (line: string) => {
    clearTimeout(typeTimer);
    text.getAnimations().forEach((a) => a.cancel());
    spoken.textContent = line;
    const { chars, at, total } = typeSchedule(line, times);
    const paint = (k: number) => { typed.textContent = chars.slice(0, k).join(''); rest.textContent = chars.slice(k).join(''); };
    finish = () => { clearTimeout(typeTimer); paint(chars.length); };
    if (reduce.matches) { paint(chars.length); return talk(chao, total); }
    const mask = blipMask(chars);
    const start = performance.now();
    let k = 0;
    const step = () => {
      const t = performance.now() - start;
      const from = k;
      while (k < chars.length && at[k] <= t) k++;
      paint(k);
      for (let i = k - 1; i >= from; i--) if (mask[i]) { blip(chars[i], chao.dataset.mood); break; } // at most one blip per turn
      if (k < chars.length) typeTimer = window.setTimeout(step, Math.max(0, at[k] - (performance.now() - start)));
    };
    step();
    talk(chao, total + times.char);
  };
  const say = (line: string) => {
    nextLine = line;
    finish(); // an unfinished line shows its rest at once (no blips) and then fades
    if (swapTimer) return; // a fade-out is running: it will show the newest line
    if (!spoken.textContent || reduce.matches) return show(line);
    const out = time('--dur-fast', 160);
    text.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: ease('--ease-in', 'ease-in'), fill: 'forwards' });
    swapTimer = window.setTimeout(() => {
      swapTimer = 0;
      show(nextLine); // no fade-in: the letters appearing are the entrance
    }, out);
  };

  // ---- FLIP of the stage when the layout turns compact (transform-origin is set in screen.css) ----
  const measure = () => ({ title: title.getBoundingClientRect(), narrator: narrator.getBoundingClientRect(), form: form.getBoundingClientRect(), chaoH: chao.getBoundingClientRect().height });
  let flips: Animation[] = [];
  const flip = (first: ReturnType<typeof measure>) => {
    const opts: KeyframeAnimationOptions = { duration: time('--dur-slow', 480), easing: ease('--ease-out') };
    // the narrator is anchored at its bottom edge: the Chao and the bubble sit there, its top is only headroom
    flips.forEach((a) => a.cancel()); // a FLIP still running: measure from the real layout, not from the animated pose
    flips = [];
    const move = (node: HTMLElement, a: DOMRect, scaled: boolean, anchor: 'top' | 'bottom' = 'top') => {
      const b = node.getBoundingClientRect();
      const s = scaled && b.width ? a.width / b.width : 1;
      const dy = anchor === 'top' ? a.top - b.top : a.bottom - b.bottom;
      flips.push(node.animate([{ translate: `${a.left - b.left}px ${dy}px`, scale: String(s) }, { translate: '0 0', scale: '1' }], opts));
    };
    move(title, first.title, true);
    move(narrator, first.narrator, false, 'bottom');
    move(form, first.form, false);
    const h = chao.getBoundingClientRect().height;
    if (h) flips.push(chao.animate([{ scale: String(first.chaoH / h) }, { scale: '1' }], opts));
  };

  // The compact Chao is the Start over button (DESIGN §18.1); everywhere else it is an image.
  const syncChao = () => {
    const btn = app.dataset.layout === 'compact' && app.dataset.state !== 'detail';
    chao.setAttribute('role', btn ? 'button' : 'img');
    chao.setAttribute('aria-label', btn ? restartLabel : content.character.alt);
    if (btn) { chao.tabIndex = 0; chao.title = restartLabel; } else { chao.removeAttribute('tabindex'); chao.removeAttribute('title'); }
    if (btn && app.dataset.state === 'thinking') chao.setAttribute('aria-disabled', 'true'); else chao.removeAttribute('aria-disabled');
  };
  const go = (state: State, line?: string, mood: Mood = MOOD[state], reset = false) => {
    const wasCompact = app.dataset.layout === 'compact';
    const compact = !reset && (wasCompact || COMPACT.has(state));
    const first = compact !== wasCompact && !reduce.matches ? measure() : null;
    app.dataset.state = state;
    app.dataset.layout = compact ? 'compact' : 'full';
    if (first) flip(first);
    syncChao();
    if (chao.dataset.mood !== mood) setMood(chao, mood);
    if (line) say(line);
  };

  const restart = (byKeyboard: boolean) => {
    if (pending || app.dataset.state === 'detail' || app.dataset.layout !== 'compact') return;
    shelf.clear();
    input.removeAttribute('aria-invalid');
    go('intro', n.intro, 'idle', true); // the input keeps its text
    if (finePointer.matches || byKeyboard) input.focus({ preventScroll: true }); // the Chao is no longer focusable in full layout
    else (document.activeElement as HTMLElement | null)?.blur(); // touch: no keyboard popping up
  };
  chao.addEventListener('click', () => restart(false));
  // Restart on keyup, after a keydown on the Chao: a held key must not leak into the input that takes the focus
  let armed = false;
  const isAct = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';
  chao.addEventListener('keydown', (e) => { if (isAct(e)) { e.preventDefault(); armed = true; } });
  chao.addEventListener('keyup', (e) => { if (isAct(e) && armed) { armed = false; restart(true); } });
  chao.addEventListener('blur', () => { armed = false; });

  const busy = (on: boolean) => {
    input.readOnly = on;
    submit.disabled = on;
    form.setAttribute('aria-busy', String(on));
  };

  const shake = () => {
    if (reduce.matches) return;
    const d = px('--shake-distance', 6);
    form.animate([0, -d, d, -d, d, -d / 2, 0].map((x) => ({ translate: `${x}px 0` })), { duration: time('--dur-shake', 320), easing: ease('--ease-out') });
  };

  const reveal = (node: HTMLElement, from: Keyframe) => {
    node.removeAttribute('data-hidden');
    const frames: Keyframe[] = reduce.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, ...from }, { opacity: 1, translate: '0 0', scale: '1' }];
    return node.animate(frames, { duration: time('--dur-base', 260), easing: ease('--ease-out') }).finished.catch(() => undefined);
  };

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    const s = app.dataset.state;
    if (s !== 'typing' && s !== 'thinking' && HAS_TEXT.test(input.value)) go('typing', n.typing);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pending) return;
    if (!HAS_TEXT.test(input.value)) {
      go('empty-input', n.emptyInput);
      input.setAttribute('aria-invalid', 'true');
      shake();
      if (finePointer.matches) input.focus();
      return;
    }
    pending = true;
    if (!finePointer.matches) (document.activeElement as HTMLElement | null)?.blur(); // touch: close the keyboard so the answer is visible
    else if (document.activeElement === submit) input.focus({ preventScroll: true }); // the button is about to be disabled
    busy(true);
    shelf.busy(true);
    go('thinking', n.thinking);
    let found = false;
    const long = window.setTimeout(() => { if (!found) say(n.thinkingLong); }, LONG_WAIT_MS);
    let outcome: Outcome;
    try {
      outcome = await find(input.value.trim(), (summary) => { found = true; say(withSummary(n.thinkingFound, n.thinkingFoundPlain, summary)); });
    } finally {
      clearTimeout(long);
      busy(false);
      shelf.busy(false);
      pending = false;
    }
    const [state, line] = lineFor(outcome);
    go(state, line);
    if (outcome.kind === 'results') shelf.show(outcome.games, outcome.summary);
    else if (state === 'no-results') shelf.clear(); // an error keeps the previous row: the failure is temporary, the games are still good
    if (finePointer.matches) {
      input.focus({ preventScroll: true });
      if (state !== 'results') input.select(); // rewrite quickly after a miss
    }
  });

  let beforeDetail: State = 'results';
  return {
    main,
    async start() {
      if (!(import.meta.env.DEV && new URLSearchParams(location.search).has('noblink'))) startBlink(chao);
      await playEnter(chao);
      say(n.intro); // the bubble is empty: the text is set at once, then the box pops in from the Chao's corner
      const bubbleIn = reveal(bubble, { scale: '0.92' });
      if (!reduce.matches) await new Promise((r) => setTimeout(r, time('--dur-base', 260))); // reduced motion: both fade in together
      await Promise.all([bubbleIn, reveal(form, { translate: `0 ${px('--reveal-rise', 12)}px` })]);
      if (finePointer.matches) input.focus({ preventScroll: true });
    },
    detail(open) {
      document.documentElement.toggleAttribute('data-holo-paused', open);
      if (open) {
        finish();
        beforeDetail = app.dataset.state as State;
        go('detail');
      } else {
        go(beforeDetail === 'detail' ? 'results' : beforeDetail, n.detailBack, 'idle');
      }
    },
  };
}
