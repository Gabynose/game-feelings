// Detail panel: a <dialog> opened with showModal(), owner of ?game=<slug>, the history entry and the focus (DESIGN.md §16).
import { content } from '../content';
import { getGame, type Game, type GameDetail } from '../lib/api';
import { el, fill } from '../lib/dom';
import { ease, time, token } from '../lib/tokens';
import { rawgImage } from './results';
import type { Screen } from './screen';

const d = content.detail;
const LOADING_DELAY_MS = 300; // a faster answer never shows "Loading…"
const MAX_SHOTS = 6; // Fig. 2–7

// ---------- pure helpers (unit-tested) ----------
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2017-02-24" -> { year: "2017", date: "24 February 2017" }; anything else -> null. */
export function formatRelease(released: string | null | undefined): { year: string; date: string } | null {
  if (!released || !/^\d{4}-\d{2}-\d{2}$/.test(released)) return null;
  const t = Date.parse(`${released}T00:00:00Z`);
  return Number.isNaN(t) ? null : { year: released.slice(0, 4), date: dateFormat.format(t) };
}

/** RAWG text -> paragraphs: drops the Spanish copy RAWG often appends, leading "#" and empty blocks. */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\n\s*#{0,3}\s*Español\b[\s\S]*$/i, '')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "hollow-knight" -> "Hollow Knight" (provisional title for a direct link). */
export const titleFromSlug = (slug: string): string => slug.replace(/[-_]+/g, ' ').trim().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** 102 -> "1:42" */
export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export interface SpecRow { label: string; text: string; spoken?: string; fill?: number }

const FAMILIES = [/^PC$/, /^(PlayStation|PS )/, /^Xbox/, /^(Nintendo|Wii|Game ?Boy|GameCube)/, /^macOS$/, /^Linux$/, /^iOS$/, /^Android$/];
/** Fixed order by family (PC, PlayStation, Xbox, Nintendo, macOS, Linux, iOS, Android, rest); stable inside a family (DESIGN §16.14). */
export const sortPlatforms = (names: string[]): string[] => {
  const rank = (n: string) => { const i = FAMILIES.findIndex((r) => r.test(n)); return i < 0 ? FAMILIES.length : i; };
  return names.map((n, i) => ({ n, i, r: rank(n) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.n);
};

/** Spec sheet rows in fixed order (platforms, genres, player rating, Metacritic); a row without data does not exist (DESIGN §16.14). Values arrive validated by getGame. */
export function specRows(g: Pick<GameDetail, 'platforms' | 'genres' | 'rating' | 'metacritic'>): SpecRow[] {
  const rows: SpecRow[] = [];
  if (g.platforms.length) rows.push({ label: g.platforms.length > 1 ? d.platforms : d.platform, text: sortPlatforms(g.platforms).join(', ') });
  if (g.genres.length) rows.push({ label: g.genres.length > 1 ? d.genres : d.genre, text: g.genres.join(', ') });
  if (g.rating) rows.push({ label: d.rating, text: fill(d.ratingValue, { value: g.rating.toFixed(1) }), spoken: fill(d.ratingSpoken, { value: g.rating.toFixed(1) }), fill: g.rating / 5 });
  if (g.metacritic) {
    const value = String(Math.round(g.metacritic));
    rows.push({ label: d.metacritic, text: fill(d.metacriticValue, { value }), spoken: fill(d.metacriticSpoken, { value }), fill: Math.round(g.metacritic) / 100 });
  }
  return rows;
}

// ---------- DOM ----------
const svg = (tag: string, attrs: Record<string, string>): SVGElement => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const cap = (n: number, label = '') => el('figcaption', { class: 'detail__dim' }, el('span', {}, fill(d.fig, { n })), ...(label ? [el('span', {}, label)] : []));
const emptyMedia = () => el('div', { class: 'detail__media' });
const urlWithout = (param: string) => {
  const u = new URL(location.href);
  u.searchParams.delete(param);
  return u.pathname + u.search + u.hash;
};

export interface Detail {
  /** Opens the panel for `slug`; `game` (from the row) gives the cover and date at once; `opener` gets the focus back. */
  open(slug: string, game?: Game | null, opener?: HTMLElement | null): void;
  /** From the row: adds a history entry, then opens. */
  openFromRow(game: Game, opener: HTMLElement): void;
  /** popstate: sync the panel with the URL. */
  sync(): void;
}

export function createDetail(screen: Pick<Screen, 'detail'>): Detail {
  const title = el('h2', { class: 'detail__title', id: 'detail-title', tabindex: '-1' });
  const closeBtn = el('button', { class: 'detail__close', type: 'button', 'aria-label': d.close },
    (() => {
      const s = svg('svg', { viewBox: '0 0 20 20', width: '20', height: '20', 'aria-hidden': 'true', focusable: 'false' });
      s.append(svg('path', { d: 'M4 4l12 12M16 4L4 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' }));
      return s;
    })());
  const bar = el('header', { class: 'detail__bar chrome' }, title, closeBtn);

  let mainCap = cap(1, d.noPictures);
  let mainMedia: HTMLElement = emptyMedia();
  const mainFig = el('figure', { class: 'detail__fig detail__fig--main' }, mainCap, mainMedia);
  const release = el('div', { class: 'detail__release' });
  const specs = el('dl', { class: 'detail__specs' });
  const status = el('p', { class: 'detail__status', role: 'status' });
  const retry = el('button', { class: 'detail__retry', type: 'button', hidden: '' }, d.retry);
  const desc = el('div', { class: 'detail__desc' });
  const source = el('p', { class: 'detail__source' });
  const info = el('div', { class: 'detail__info' }, release, specs, status, retry, desc, source);
  const figs = el('ol', { class: 'detail__figs', role: 'list' });
  const sheet = el('div', { class: 'detail__sheet' }, mainFig, info, figs);
  const dialog = el('dialog', { class: 'detail', 'aria-labelledby': 'detail-title' }, bar, sheet);
  document.body.append(dialog);

  let slug = '';
  let game: Game | null = null;
  let opener: HTMLElement | null = null;
  let ctl: AbortController | null = null;
  let loadTimer = 0;
  let animTimer = 0;
  let closing = false;

  // ---- content ----
  const setMain = (label: string, media: HTMLElement) => {
    const next = cap(1, label);
    mainCap.replaceWith(next);
    mainMedia.replaceWith(media);
    mainCap = next;
    mainMedia = media;
  };
  const picture = (url: string, w: number, alt: string, extra: Record<string, string> = {}) =>
    el('img', { class: 'detail__media', alt, width: String(w), height: String((w * 9) / 16), src: rawgImage(url, w), srcset: `${rawgImage(url, w)} 1x, ${rawgImage(url, w * 2)} 2x`, ...extra });

  const renderRelease = (released: string | null | undefined, showEmpty: boolean) => {
    const r = formatRelease(released);
    if (r) release.replaceChildren(el('span', { class: 'detail__label' }, d.released), el('span', { class: 'detail__year' }, r.year), el('span', { class: 'detail__date' }, r.date));
    else if (showEmpty) release.replaceChildren(el('span', { class: 'detail__label' }, d.released), el('span', { class: 'detail__none' }, d.notAnnounced));
    else release.replaceChildren();
  };
  const busy = (on: boolean) => { for (const n of [desc, figs]) n.setAttribute('aria-busy', String(on)); }; // not on the sheet: the status line inside must be announced
  const setStatus = (text: string, retryable = false) => {
    status.textContent = text;
    retry.hidden = !retryable;
  };

  /** Opening state: whatever the row already knows; nothing invented for a direct link. */
  const renderBase = () => {
    title.textContent = game?.name ?? titleFromSlug(slug);
    if (game) setMain(d.cover, picture(game.image, 1280, fill(d.coverAlt, { name: game.name }), { fetchpriority: 'high' }));
    else setMain('', emptyMedia()); // direct link: nothing to say until the data arrives
    mainFig.hidden = false;
    renderRelease(game?.released, false);
    specs.replaceChildren();
    desc.replaceChildren();
    figs.replaceChildren();
    source.replaceChildren();
    busy(true);
    sheet.scrollTop = 0;
    setStatus('');
    renderSource(true);
  };

  const renderSource = (show: boolean) => {
    if (!show) return source.replaceChildren();
    source.replaceChildren(d.source, el('a', { href: `https://rawg.io/games/${encodeURIComponent(slug)}`, target: '_blank', rel: 'noopener noreferrer' }, d.rawg, el('span', { class: 'visually-hidden' }, d.newTab)));
  };

  const renderSpecs = (g: GameDetail) => specs.replaceChildren(...specRows(g).map((r) => {
    const dd = el('dd', {});
    if (r.fill === undefined) dd.textContent = r.text;
    else {
      const scale = el('span', { class: 'detail__scale', 'aria-hidden': 'true' });
      scale.style.setProperty('--fill', `${Math.round(r.fill * 1000) / 10}%`); // CSSOM, not a style attribute (CSP)
      dd.className = 'detail__score';
      dd.append(scale, el('span', { 'aria-hidden': 'true' }, r.text), el('span', { class: 'visually-hidden' }, r.spoken ?? r.text));
    }
    return el('div', { class: 'detail__spec' }, el('dt', {}, r.label), dd);
  }));

  const renderData = (g: GameDetail) => {
    title.textContent = g.name;
    renderRelease(g.released, true);
    renderSpecs(g);
    const cover = game?.image ?? null;
    const shots = g.screenshots.filter((u) => u !== cover);
    const poster = cover ?? shots[0];
    const rest = !cover && shots[0] ? shots.slice(1) : shots; // Fig. 2+: the poster / Fig. 1 screenshot is not repeated
    if (g.trailer) {
      const video = el('video', { class: 'detail__media', controls: '', preload: 'metadata', playsinline: '', 'aria-label': fill(d.trailerLabel, { name: g.name }), src: g.trailer });
      if (poster) video.poster = rawgImage(poster, 1280);
      video.addEventListener('loadedmetadata', () => {
        if (video.isConnected && Number.isFinite(video.duration)) mainCap.lastElementChild!.textContent = fill(d.trailerTime, { time: mmss(video.duration) });
      }, { once: true });
      setMain(d.trailer, video);
    } else if (cover) {
      // keeps the cover already on screen
    } else if (shots[0]) {
      setMain(d.screenshot, picture(shots[0], 1280, fill(d.shotAlt, { name: g.name, n: 1 })));
    } else {
      setMain(d.noPictures, emptyMedia());
    }
    figs.replaceChildren(...rest.slice(0, MAX_SHOTS).map((u, i) =>
      el('li', {}, el('figure', { class: 'detail__fig' }, cap(i + 2), picture(u, 640, fill(d.shotAlt, { name: g.name, n: i + 2 }), { loading: 'lazy', decoding: 'async' })))));
    if (figs.children.length) figs.animate([{ opacity: 0 }, { opacity: 1 }], { duration: time('--dur-base', 260), easing: ease('--ease-out') });
    const paras = paragraphs(g.description);
    if (paras.length) desc.replaceChildren(...paras.map((p) => el('p', {}, p)));
    else desc.replaceChildren(el('p', { class: 'detail__muted' }, d.noDescription));
    busy(false);
  };

  // ---- data ----
  async function load() {
    ctl?.abort();
    const mine = (ctl = new AbortController());
    clearTimeout(loadTimer);
    busy(true);
    setStatus('');
    loadTimer = window.setTimeout(() => setStatus(d.loading), LOADING_DELAY_MS);
    const r = await getGame(slug, mine.signal);
    if (mine.signal.aborted) return; // a newer load owns loadTimer
    clearTimeout(loadTimer);
    if (r.kind === 'ok') {
      setStatus('');
      renderData(r.detail);
      return;
    }
    busy(false);
    if (r.kind === 'not-found') {
      if (!game) { title.textContent = d.notFoundTitle; mainFig.hidden = true; }
      renderSource(false);
      setStatus(d.notFound);
    } else {
      setStatus(r.reason === 'rate' ? fill(d.errorRate, { seconds: r.retryAfter ?? 10 }) : d.error, true);
    }
  }
  retry.addEventListener('click', () => { title.focus(); void load(); }); // the button is about to be hidden: keep the focus

  // ---- motion (transform + opacity only, DESIGN §16.7) ----
  const caseFor = (s: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLAnchorElement>('a.case')].find((a) => a.getAttribute('href') === `?game=${encodeURIComponent(s)}`) ?? null;
  const originRect = (): DOMRect | null => {
    const node = opener?.isConnected ? opener : caseFor(slug);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? r : null;
  };
  const motionScale = () => { const m = parseFloat(token('--motion-scale')); return Number.isNaN(m) ? 1 : m; };

  /** Frames between the panel's place (identity) and the box (or a drop). `out` = closing: opacity holds until 60 %. */
  const frames = (box: DOMRect | null, out: boolean): Keyframe[] => {
    const m = motionScale();
    const p = dialog.getBoundingClientRect();
    let from: Keyframe;
    if (box) {
      const min = parseFloat(token('--detail-scale-min')) || 0.15;
      const s0 = Math.min(1, Math.max(min, box.width / p.width));
      const dx = (box.left + box.width / 2 - (p.left + p.width / 2)) * m;
      const dy = (box.top + box.height / 2 - (p.top + p.height / 2)) * m;
      from = { translate: `${dx}px ${dy}px`, scale: String(1 - (1 - s0) * m), opacity: 0 };
    } else {
      from = { translate: `0 ${(parseFloat(token('--detail-drop')) || 24) * m}px`, scale: '1', opacity: 0 };
    }
    const home: Keyframe = { translate: '0 0', scale: '1', opacity: 1 };
    return out ? [{ ...home, offset: 0 }, { opacity: 1, offset: 0.6 }, { ...from, offset: 1 }] : [{ ...from, offset: 0 }, { opacity: 1, offset: 0.3 }, { ...home, offset: 1 }];
  };

  const animate = (out: boolean, box: DOMRect | null, ms: number) => {
    dialog.setAttribute('data-anim', '');
    clearTimeout(animTimer);
    dialog.animate(frames(box, out), { duration: ms, easing: out ? ease('--ease-in', 'ease-in') : ease('--ease-out'), fill: out ? 'forwards' : 'none' });
    return ms;
  };

  // ---- open / close ----
  function open(s: string, g?: Game | null, from?: HTMLElement | null) {
    if (dialog.open || closing) return;
    slug = s;
    game = g ?? null;
    opener = from ?? null;
    renderBase();
    screen.detail(true); // before showModal: the background freezes before the blur starts
    dialog.showModal();
    title.focus();
    animTimer = window.setTimeout(() => dialog.removeAttribute('data-anim'), animate(false, originRect(), time('--dur-slow', 480)));
    void load();
  }

  function openFromRow(g: Game, from: HTMLElement) {
    if (dialog.open || closing) return;
    const u = new URL(location.href);
    u.searchParams.set('game', g.slug);
    history.pushState({ gameDetail: performance.timeOrigin }, '', u.pathname + u.search + u.hash);
    open(g.slug, g, from);
  }

  // The entry carries this document's load time: after a reload the state survives but the entry is no longer "ours" to go back from.
  const pushed = () => (history.state as { gameDetail?: number } | null)?.gameDetail === performance.timeOrigin;
  let backPending = false; // history.back() was issued and its popstate has not closed the panel yet: never issue a second one

  /** Brings the URL back to "no game" (the panel is closing): back if the app added the entry, replace otherwise. */
  const fixHistory = () => {
    if (backPending || !new URLSearchParams(location.search).has('game')) return;
    if (pushed()) { backPending = true; history.back(); }
    else history.replaceState(null, '', urlWithout('game'));
  };

  function animateClose() {
    if (!dialog.open || closing) return;
    closing = true;
    dialog.getAnimations().forEach((a) => a.cancel());
    dialog.setAttribute('data-closing', '');
    const ms = time('--dur-base', 260);
    animate(true, originRect(), ms);
    animTimer = window.setTimeout(() => dialog.close(), ms); // a timer, not .finished: it must close without frames too
  }

  function requestClose() {
    if (!dialog.open || closing || backPending) return;
    if (pushed()) { backPending = true; history.back(); } // popstate does the closing
    else animateClose(); // direct link: the close handler fixes the URL
  }

  // The scrim is the part of the <dialog> box outside its rectangle; the 8 px glass rim is inside it. Both the press and the click must be there (no close when selecting text).
  const outside = (e: MouseEvent) => { const r = dialog.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  let downOutside = false;
  closeBtn.addEventListener('click', requestClose);
  dialog.addEventListener('cancel', (e) => { if (!e.cancelable) return; e.preventDefault(); requestClose(); }); // Esc
  dialog.addEventListener('pointerdown', (e) => { downOutside = e.target === dialog && outside(e); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog && downOutside && outside(e)) requestClose(); });

  dialog.addEventListener('close', () => { // the one place where everything is put back (also when the browser closes it by itself)
    clearTimeout(animTimer);
    clearTimeout(loadTimer);
    dialog.getAnimations().forEach((a) => a.cancel());
    dialog.removeAttribute('data-closing');
    dialog.removeAttribute('data-anim');
    closing = false;
    ctl?.abort();
    ctl = null;
    if (mainMedia instanceof HTMLVideoElement) { mainMedia.removeAttribute('src'); mainMedia.load(); } // stop the download too
    const blank = emptyMedia();
    mainMedia.replaceWith(blank); // a video stops playing when it leaves the document
    mainMedia = blank; // setMain replaces this node on the next open: it must be the one in the DOM
    figs.replaceChildren();
    fixHistory();
    backPending = false;
    screen.detail(false);
    const back = opener?.isConnected ? opener : caseFor(slug) ?? document.getElementById('feeling');
    back?.focus();
    opener = null;
  });

  function sync() {
    const s = new URLSearchParams(location.search).get('game');
    if (!s) animateClose();
    else if (!dialog.open && !closing) open(s, null, null);
  }

  return { open, openFromRow, sync };
}
