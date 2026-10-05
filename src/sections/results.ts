// Games row: one horizontal shelf of PS2-style cases (SPEC US4, DESIGN.md §15).
import { content } from '../content';
import type { Game } from '../lib/api';
import { el, fill } from '../lib/dom';
import { ease, time, token } from '../lib/tokens';

/** Phase 6 hook: a case was activated (click / Enter). `opener` gets the focus back when the detail closes. */
export type OpenGame = (game: Game, opener: HTMLAnchorElement) => void;

export interface Shelf {
  el: HTMLElement;
  /** Replaces the row (the old one fades out first). */
  show(games: Game[], summary: string): void;
  /** No row (no-results / off-topic). */
  clear(): void;
  /** While a new search runs: the current row dims and is inert. */
  busy(on: boolean): void;
}

const STAGGER_CAP = 7; // cases after the 8th enter together (they start off-screen anyway)
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/** RAWG serves resized copies at /media/resize/<width>/-/<path> (640 px wide is ~25-65 KB vs ~140 KB). Other URLs are used as they are. */
export function rawgImage(url: string, width: number): string {
  const m = /^https:\/\/media\.rawg\.io\/media\/(?!resize\/|crop\/)(.+)$/.exec(url);
  return m ? `https://media.rawg.io/media/resize/${width}/-/${m[1]}` : url;
}

function gameCase(game: Game, index: number, onOpen: OpenGame): HTMLLIElement {
  const year = game.released?.slice(0, 4) ?? '';
  const art = el('img', {
    class: 'case__art', alt: '', width: '640', height: '360', loading: 'lazy', decoding: 'async',
    src: rawgImage(game.image, 640), srcset: `${rawgImage(game.image, 640)} 1x, ${rawgImage(game.image, 1280)} 2x`,
  });
  const link = el('a', {
    class: 'case', href: `?game=${encodeURIComponent(game.slug)}`, tabindex: index === 0 ? '0' : '-1', // roving tabindex: one stop for the whole row
    'aria-label': year ? fill(content.shelf.name, { name: game.name, year }) : game.name, // one run: "Cozy Grove, 2021"
  },
    el('span', { class: 'case__band', 'aria-hidden': 'true' }, el('span', { class: 'case__year' }, year)),
    el('span', { class: 'case__cover', 'aria-hidden': 'true' }, art),
    el('span', { class: 'case__title', 'aria-hidden': 'true' }, el('span', { class: 'case__name' }, game.name)), // textContent only: RAWG data never becomes markup
  );
  art.addEventListener('error', () => link.classList.add('case--noimg'), { once: true });
  link.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab / window: the ?game= link works on its own (phase 6)
    e.preventDefault();
    onOpen(game, link);
  });
  const item = el('li', { class: 'shelf__item' }, link);
  item.style.setProperty('--i', String(Math.min(index, STAGGER_CAP)));
  return item;
}

/** Tilt (mouse/pen), roving tabindex + arrow keys, and the "more to the right" fade. */
function wire(row: HTMLUListElement): void {
  const tiltMax = parseFloat(token('--tilt-max')) || 12;
  let item: HTMLElement | null = null; // the li under the pointer: it never moves, so hover and the measurement stay put
  let last: PointerEvent | null = null;
  let raf = 0;
  const caseOf = (li: HTMLElement | null) => li?.firstElementChild as HTMLElement | null | undefined;
  const reset = (li: HTMLElement | null) => { const c = caseOf(li); c?.style.removeProperty('--rx'); c?.style.removeProperty('--ry'); c?.style.removeProperty('--sheen'); };
  const apply = () => {
    raf = 0;
    const c = caseOf(item);
    if (!item || !c || !last) return;
    const r = item.getBoundingClientRect();
    const x = (last.clientX - r.left) / r.width - 0.5;
    const y = (last.clientY - r.top) / r.height - 0.5;
    c.style.setProperty('--rx', `${(-y * 2 * tiltMax).toFixed(2)}deg`);
    c.style.setProperty('--ry', `${(x * 2 * tiltMax).toFixed(2)}deg`);
    c.style.setProperty('--sheen', (x * 2).toFixed(3));
  };
  row.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || reduce.matches) return; // touch scrolls the row; no tilt fighting the finger
    const li = (e.target as Element).closest<HTMLElement>('.shelf__item');
    if (li !== item) { reset(item); item = li; }
    last = e;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  row.addEventListener('pointerleave', () => { reset(item); item = null; });

  const cases = () => [...row.querySelectorAll<HTMLAnchorElement>('.case')];
  row.addEventListener('focusin', (e) => { // the last focused case is the row's single Tab stop
    const target = e.target as HTMLElement;
    if (!target.classList.contains('case')) return;
    for (const c of cases()) c.tabIndex = c === target ? 0 : -1;
  });
  row.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const all = cases();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault(); // also at the ends: the row never scrolls on its own under the focus
    const j = e.key === 'ArrowRight' ? Math.min(i + 1, all.length - 1) : e.key === 'ArrowLeft' ? Math.max(i - 1, 0) : e.key === 'Home' ? 0 : all.length - 1;
    all[j].focus(); // focus scrolls it into view (scroll-padding keeps it clear of the edge)
  });

  const more = () => row.toggleAttribute('data-more', row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  row.addEventListener('scroll', more, { passive: true });
  new ResizeObserver(more).observe(row);
}

export function createShelf(onOpen: OpenGame): Shelf {
  const heading = el('h2', { class: 'visually-hidden', id: 'shelf-heading' });
  const section = el('section', { class: 'shelf', 'aria-labelledby': 'shelf-heading', 'aria-busy': 'false', hidden: '' }, heading);
  let row: HTMLUListElement | null = null;
  let swapTimer = 0;
  const build = (games: Game[], summary: string) => {
    swapTimer = 0;
    row?.remove();
    heading.textContent = summary ? fill(content.shelf.heading, { summary }) : content.shelf.headingPlain;
    row = el('ul', { class: 'shelf__row', role: 'list' }, ...games.map((g, i) => gameCase(g, i, onOpen)));
    wire(row);
    section.append(row);
    section.hidden = false;
  };
  return {
    el: section,
    show(games, summary) {
      clearTimeout(swapTimer);
      if (!row || reduce.matches) return build(games, summary);
      const out = time('--dur-fast', 160);
      row.animate([{ opacity: 0 }], { duration: out, easing: ease('--ease-in', 'ease-in'), fill: 'forwards' });
      swapTimer = window.setTimeout(() => build(games, summary), out); // a timer, not .finished: it fires without frames too
    },
    clear() {
      clearTimeout(swapTimer);
      row?.remove();
      row = null;
      section.hidden = true;
      heading.textContent = "";
    },
    busy(on) {
      section.setAttribute('aria-busy', String(on));
      if (row) row.inert = on; // dimmed = not clickable, not focusable
    },
  };
}
