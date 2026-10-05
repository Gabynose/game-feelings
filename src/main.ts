import { startHolo } from './holo/holo';
import './styles/tokens.css';
import './styles/base.css';
import './styles/holo.css';
import './styles/chao.css';
import './styles/screen.css';
import './styles/results.css';
import './styles/detail.css';
import { content } from './content';
import { findGames, type Finder, type Game } from './lib/api';
import { isMuted, setMuted, unlockOnGesture } from './lib/blip';
import { el } from './lib/dom';
import { createDetail } from './sections/detail';
import { createScreen, type Screen } from './sections/screen';

type Theme = 'light' | 'dark';

declare global {
  interface Window {
    /** DEV only: lets tests open/close the (phase 6) detail state. */
    __screen?: Pick<Screen, 'detail'>;
  }
}

// ---------- Theme ----------
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function currentTheme(): Theme {
  const set = root.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return systemDark.matches ? 'dark' : 'light';
}

function themeToggle(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'theme-toggle' }, el('span', { class: 'theme-toggle__icon', 'aria-hidden': 'true' }));
  const sync = () => {
    const dark = currentTheme() === 'dark';
    button.setAttribute('aria-label', dark ? content.theme.toLight : content.theme.toDark);
  };
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next); // key must match the inline script in index.html
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
    sync();
  });
  systemDark.addEventListener('change', sync);
  sync();
  return button;
}

// ---------- Sound toggle (DESIGN §17.6) ----------
function soundToggle(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'sound-toggle', 'aria-pressed': String(isMuted()), 'aria-label': content.sound.mute });
  // static markup of our own (no external text): speaker + waves (sound on) or cross (muted), CSS picks by aria-pressed
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><g class="sound-toggle__waves" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></g><g class="sound-toggle__off" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15.5 9l6 6M21.5 9l-6 6"/></g></svg>';
  button.addEventListener('click', () => {
    setMuted(!isMuted());
    button.setAttribute('aria-pressed', String(isMuted()));
  });
  return button;
}
unlockOnGesture();

// ---------- Page ----------
const app = document.getElementById('app')!;
const q = new URLSearchParams(location.search);
const header = el('header', { class: 'top-bar' }, soundToggle(), themeToggle());
const footer = el('footer', { class: 'credit' }, el('p', {}, content.footer.credit, el('a', { href: content.footer.rawgUrl }, content.footer.rawgLabel)));

if (import.meta.env.DEV && q.has('lab')) {
  // DEV only: style tile + Chao lab (src/dev/lab.ts). Dead code in production builds.
  void import('./dev/lab').then(({ renderLab }) => app.append(header, renderLab(), footer));
} else {
  void finder().then((find) => {
    const screen = createScreen(app, find);
    app.append(header, screen.main, footer);
    if (import.meta.env.DEV) window.__screen = { detail: screen.detail };
    const detail = createDetail(screen);
    app.addEventListener('game:open', (e) => {
      const { game, opener } = (e as CustomEvent<{ game: Game; opener: HTMLElement }>).detail;
      detail.openFromRow(game, opener);
    });
    addEventListener('popstate', detail.sync);
    void screen.start();
    const slug = q.get('game');
    if (slug) detail.open(slug); // direct link: the intro runs behind the panel
  });
}

/** The real API, or in DEV with ?mock=<kind> the simulator (src/dev/mock.ts, loaded only then). */
async function finder(): Promise<Finder> {
  const mock = import.meta.env.DEV ? q.get('mock') : null; // production never reads ?mock
  if (!mock) return findGames;
  const { MOCKS, mockFinder } = await import('./dev/mock');
  return (MOCKS as readonly string[]).includes(mock) ? mockFinder(mock as (typeof MOCKS)[number]) : findGames;
}

// The background is decorative: content renders first and a failure here leaves the CSS fallback.
try {
  startHolo(document.querySelector<HTMLCanvasElement>('.holo__canvas')!);
} catch (e) {
  if (import.meta.env.DEV) console.warn('[holo]', e);
}
