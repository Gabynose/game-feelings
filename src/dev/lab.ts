// DEV only (?lab): the phase-1 style tile + the Chao lab (DESIGN §13.12). Loaded with import() from main.ts.
import '../styles/style-tile.css';
import { content } from '../content';
import { el, type Child } from '../lib/dom';
import { MOODS, blink, playEnter, setMood, startBlink, talk, voiceLevel, type Mood } from '../sections/chao';
import { chaoRig } from '../sections/chao-rig';

const st = content.styleTile;
const swatches = [
  '--color-bg', '--color-surface', '--color-text', '--color-text-muted', '--color-accent',
  '--color-border', '--color-focus', '--knox-fill', '--knox-extrude-1', '--knox-extrude-2',
  '--knox-highlight', '--knox-shine', '--holo-1', '--holo-2', '--holo-3', '--holo-4',
  '--holo-5', '--holo-6', '--holo-7',
];
const typeSteps = ['sm', 'base', 'lg', 'xl', '2xl'];
const radii = ['--radius-sm', '--radius-case', '--radius-panel', '--radius-bubble', '--radius-pill'];
const spaces = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `--space-${n}`);

const section = (heading: string, ...children: Child[]) =>
  el('section', { class: 'tile-section' }, el('h2', { class: 'tile-section__title' }, heading), ...children);

function chaoLab() {
  const lab = st.chaoLab;
  const chao = chaoRig();
  setMood(chao, 'idle');
  if (!location.search.includes('noblink')) startBlink(chao);
  const btn = (label: string, onClick: () => void) => {
    const b = el('button', { type: 'button', class: 'lab-btn' }, label);
    b.addEventListener('click', onClick);
    return b;
  };
  const moodBtns = new Map<Mood, HTMLButtonElement>();
  const press = (mood: Mood | null) => moodBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === mood)));
  const pick = async (mood: Mood) => {
    press(mood);
    if (mood === 'enter') {
      await playEnter(chao);
      press(chao.dataset.mood as Mood);
    } else setMood(chao, mood);
  };
  for (const m of MOODS) moodBtns.set(m, btn(lab[m], () => void pick(m)));
  press('idle');

  const talkBtn = btn(lab.talk, () => {
    const on = talkBtn.getAttribute('aria-pressed') !== 'true';
    talkBtn.setAttribute('aria-pressed', String(on));
    if (on) chao.dataset.talking = 'cycle';
    else voiceLevel(chao, null); // smooth stop (voiceLevel is otherwise inactive: no voice in the product)
  });
  talkBtn.setAttribute('aria-pressed', 'false');
  const blinkBtn = btn(lab.blink, () => blink(chao));

  const stage = el('div', { class: 'chao-lab__stage', 'aria-hidden': 'true' }, chao);
  const compact = el('input', { id: 'chao-compact', type: 'checkbox' });
  compact.addEventListener('change', () => stage.classList.toggle('chao-lab__stage--compact', compact.checked));

  window.__chao = { el: chao, setMood, playEnter, talk, voiceLevel, blink };
  const q = new URLSearchParams(location.search).get('mood');
  if (q && (MOODS as readonly string[]).includes(q)) void pick(q as Mood);

  return section(
    lab.heading,
    stage,
    el('div', { class: 'chao-lab__row', role: 'group', 'aria-label': lab.moods }, ...moodBtns.values()),
    el('div', { class: 'chao-lab__row' }, talkBtn, blinkBtn),
    el('div', { class: 'chao-lab__row' }, compact, el('label', { for: 'chao-compact' }, lab.compact)),
  );
}

export function renderLab(): HTMLElement {
  return el(
    'main',
    { class: 'page' },
    el('h1', { class: 'tile-section__title' }, st.badge),
    el(
      'div',
      { class: 'tile' },
      section(st.chromeSample, el('div', { class: 'chrome-strip' }, content.pageTitle)),
      section(
        st.typeHeading,
        el('p', { class: 'type-row type-row--display' }, el('code', {}, '--text-display'), el('span', {}, st.typeSample)),
        ...typeSteps.map((s) => el('p', { class: 'type-row', style: `font-size: var(--text-${s})` }, el('code', {}, `--text-${s}`), el('span', {}, st.typeSample))),
      ),
      section(
        st.colorHeading,
        el('ul', { class: 'swatches', role: 'list' },
          ...swatches.map((t) => el('li', { class: 'swatch' }, el('span', { class: 'swatch__chip', style: `background: var(${t})` }), el('code', {}, t)))),
      ),
      chaoLab(),
      section(
        st.shapeHeading,
        el('ul', { class: 'radii', role: 'list' }, ...radii.map((r) => el('li', { class: 'radius', style: `border-radius: var(${r})` }, el('code', {}, r)))),
        el('ul', { class: 'spaces', role: 'list' },
          ...spaces.map((s) => el('li', { class: 'space' }, el('span', { class: 'space__bar', style: `inline-size: var(${s})` }), el('code', {}, s)))),
      ),
    ),
  );
}
