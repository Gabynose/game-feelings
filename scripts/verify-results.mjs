// Phase 5 checks: games row of PS2 cases (DESIGN §15, §15.10).
// Called by scripts/verify.mjs (runResults). Standalone (dev server on :5173, `npm run build` done):
//   node scripts/verify-results.mjs            (VERIFY_URL overrides the base; VERIFY_ONLY=structure,sizes,... picks sections)
// Sections: structure, sizes, entrance, interaction, states, perf, contrast, theme, build
import { chromium } from 'playwright-core';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { content as contentDefault } from '../src/content.ts';
import { MOCK_GAMES } from '../src/dev/mock-games.ts';

/**
 * The ONLY console/network error the shelf tests tolerate: entry 5 of ?mock=results has a broken image on purpose
 * (src/dev/mock-games.ts), RAWG answers it with 307 -> 404 on .../gf-missing-cover.jpg. Any other 4xx/5xx, console error or
 * failed request still fails the run. Used by verify.mjs / verify-screen.mjs watchers too.
 */
export const isExpected404 = (url) => /\/gf-missing-cover\.jpg$/.test(url ?? '');

const fillT = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// In-page: records the entrance of every row that is inserted (per-frame opacity/translate of the 1st and 4th case + CSS delays).
const ENTRANCE = () => {
  window.__ent = [];
  new MutationObserver((ms) => {
    for (const m of ms) for (const nd of m.addedNodes) {
      if (nd.nodeType !== 1 || !nd.matches?.('.shelf__row')) continue;
      const run = { t0: performance.now(), s: [], delays: null };
      window.__ent.push(run);
      const row = nd;
      const tick = () => {
        const t = performance.now() - run.t0, lis = [...row.children];
        if (!lis.length) return;
        if (!run.delays) run.delays = lis.map((li) => li.getAnimations().find((a) => a.animationName === 'case-in')?.effect.getTiming().delay ?? null);
        const g = (i) => { const cs = getComputedStyle(lis[i]); return { o: Number(cs.opacity), tr: cs.translate }; };
        run.s.push({ t, a: g(0), d: g(3) });
        if (t < 1800 && row.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }).observe(document, { subtree: true, childList: true });
};

// In-page: game:open + click bookkeeping (document listener runs after the link's own handler, so defaultPrevented is its decision).
const OPEN_PROBE = () => {
  window.__opens = []; window.__clicks = [];
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#app').addEventListener('game:open', (e) => window.__opens.push({ slug: e.detail?.game?.slug, name: e.detail?.game?.name, opener: e.detail?.opener === document.activeElement, openerIsCase: e.detail?.opener?.classList?.contains('case'), href: location.href, bubbles: e.bubbles }));
  });
  document.addEventListener('click', (e) => { window.__clicks.push({ prevented: e.defaultPrevented, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, button: e.button }); if (e.target.closest?.('.case')) e.preventDefault(); /* never navigate away in the probe */ }, false);
};

export async function runResults(env) {
  const { browser, BASE, OUT, errors, lines, check, info } = env;
  const content = env.content ?? contentDefault;
  const n = content.narrator;
  const only = process.env.VERIFY_ONLY ? process.env.VERIFY_ONLY.split(',') : null;
  const want = (s) => !only || only.includes(s);
  const shots = [];
  await mkdir(OUT, { recursive: true });

  // Strict watcher: console errors, page errors, failed requests and HTTP >= 400 all count, except the one expected 404.
  const seen404 = [];
  const provoked503 = (url) => /\/api\/interpret$/.test(url ?? ''); // only the '5-states' page provokes it on purpose (error-keeps-row step)
  const watch = (page, tag, allow = null) => {
    const prov = tag === '5-states';
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (allow && allow.test(m.text())) return; // a status this page provokes on purpose
      if (prov && /status of 503/.test(m.text()) && provoked503(m.location().url)) return;
      if (/status of 404/.test(m.text()) && isExpected404(m.location().url)) { seen404.push(`${tag} console`); return; }
      errors.push(`[${tag}] console: ${m.text()} (${m.location().url})`);
    });
    page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      if (r.resourceType() === 'image' && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) return; // lazy image cancelled when the row is replaced / the context closes
      if (r.url().includes("/api/game?id=") && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) return;
      if (r.resourceType() === 'media' && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) return; // trailer <video> cancelled when the context closes // detail panel closed while its request was in flight (AbortController, by design)
      errors.push(`[${tag}] request failed: ${r.url()} (${r.failure()?.errorText})`);
    });
    page.on('response', (r) => {
      if (r.status() < 400) return;
      if (allow && allow.test(`status of ${r.status()}`) && r.url().includes('/api/game?')) return;
      if (prov && r.status() === 503 && provoked503(r.url())) return;
      if (r.status() === 404 && isExpected404(r.url())) { seen404.push(`${tag} ${r.status()}`); return; }
      errors.push(`[${tag}] HTTP ${r.status()}: ${r.url()}`);
    });
  };
  const open = async (opts, { url, tag, init = [], allow = null, pre = null }) => {
    const ctx = await browser.newContext(opts);
    for (const f of init) await ctx.addInitScript(f);
    const p = await ctx.newPage();
    watch(p, tag, allow);
    if (pre) await pre(p);
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => document.fonts.ready);
    return { ctx, p };
  };
  const waitIntro = (p) => p.waitForFunction(() => {
    const a = document.querySelector('#app'), f = document.querySelector('form.feeling');
    return a?.dataset.state === 'intro' && document.querySelector('.narrator .chao')?.dataset.mood === 'idle' && f && !f.hasAttribute('data-hidden') && f.getAnimations().length === 0 && document.querySelector('#narrator-line .bubble__spoken').textContent !== '';
  }, null, { timeout: 40000 });
  const settle = (p) => p.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length === 0, null, { timeout: 10000 }).catch(() => undefined);
  const waitState = (p, st, timeout = 20000) => p.waitForFunction((s) => document.querySelector('#app').dataset.state === s, st, { timeout }).then(() => true, () => false);
  const submitText = async (p, text) => { await p.fill('#feeling', text); await p.press('#feeling', 'Enter'); };
  const toResults = async (p, text = 'cozy') => {
    await waitIntro(p);
    await submitText(p, text);
    await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'results' && document.querySelector('.shelf__row li'), null, { timeout: 25000 });
    await p.evaluate(() => document.fonts.ready);
    await settle(p);
  };
  const shot = async (p, name, tag, opts = {}) => { const f = `${OUT}/5-${name}-${tag}.png`; await p.screenshot({ path: f, ...opts }); shots.push(f); };
  const URL_RES = (extra = '') => `${BASE}/?t=9500&noblink&mock=results${extra}`;

  // ================= 1. Structure (1440 light, DPR 1) =================
  if (want('structure')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, { url: URL_RES(), tag: '5-structure' });
    await toResults(p);
    const heading = fillT(content.shelf.heading, { summary: 'cozy indie games' });
    const r = await p.evaluate(() => {
      const sec = document.querySelector('section.shelf'), h2 = document.querySelector('#shelf-heading'), row = document.querySelector('ul.shelf__row');
      const lis = [...row.children], cases = [...row.querySelectorAll('li > a.case')], hr = h2.getBoundingClientRect(), rcs = getComputedStyle(row);
      return {
        secLabel: sec?.getAttribute('aria-labelledby'), secTag: sec?.tagName, h2Text: h2?.textContent, h2Tag: h2?.tagName, h1: document.querySelectorAll('h1').length, h2n: document.querySelectorAll('h2:not(dialog:not([open]) h2)').length,
        h2Box: [hr.width, hr.height], h2Disp: getComputedStyle(h2).display, role: row.getAttribute('role'), nLi: lis.length, nCases: cases.length, liAreAnchors: lis.every((li) => li.children.length === 1 && li.firstElementChild.matches('a.case')),
        hrefs: cases.map((c) => c.getAttribute('href')), bands: cases.map((c) => c.querySelector('.case__band')?.getAttribute('aria-hidden')), aria: sec.getAttribute('aria-hidden'),
        imgs: cases.map((c) => { const i = c.querySelector('img'); return { alt: i?.getAttribute('alt'), lazy: i?.getAttribute('loading'), src: i?.getAttribute('src'), srcset: i?.getAttribute('srcset'), w: i?.getAttribute('width'), h: i?.getAttribute('height') }; }),
        overflowX: rcs.overflowX, snap: rcs.scrollSnapType, shelfBlock: getComputedStyle(document.documentElement).getPropertyValue('--shelf-block'), secMin: getComputedStyle(sec).minBlockSize,
        tabbables: cases.filter((c) => c.tabIndex >= 0).length, tab0: cases.findIndex((c) => c.tabIndex === 0), labels: cases.map((c) => c.getAttribute('aria-label')),
      };
    });
    check(r.secTag === 'SECTION' && r.secLabel === 'shelf-heading' && r.h2Tag === 'H2' && r.h2Text === heading, 'Structure: section.shelf[aria-labelledby=shelf-heading] with h2#shelf-heading', `${r.secTag} aria-labelledby ${r.secLabel}; h2 "${r.h2Text}" (want "${heading}")`);
    check(r.h1 === 1 && r.h2n === 1, 'Structure: exactly one h1 and one h2 in the document (a closed detail dialog is not counted)', `h1 ${r.h1}, h2 ${r.h2n}`);
    check(r.h2Box[0] <= 1.01 && r.h2Box[1] <= 1.01 && r.h2Disp !== 'none', 'Structure: the h2 is visually hidden (<= 1x1 px box) but not display:none', `box ${r.h2Box.map((v) => v.toFixed(2)).join('x')}, display ${r.h2Disp}`);
    check(r.role === 'list' && r.nLi === 20 && r.nCases === 20 && r.liAreAnchors, 'Structure: ul.shelf__row[role=list] with 20 li > a.case', `role ${r.role}, li ${r.nLi}, li>a.case ${r.nCases}, each li holds exactly one anchor ${r.liAreAnchors}`);
    check(r.hrefs.every((h, i) => h === `?game=${encodeURIComponent(MOCK_GAMES[i].slug)}`), 'Structure: every case href is ?game=<slug>, in result order', `first 3 ${JSON.stringify(r.hrefs.slice(0, 3))}; mismatches [${r.hrefs.map((h, i) => (h === `?game=${encodeURIComponent(MOCK_GAMES[i].slug)}` ? null : `${i}:${h}`)).filter(Boolean)}]`);
    check(r.bands.length === 20 && r.bands.every((b) => b === 'true'), 'Structure: the black band of every case is aria-hidden="true"', `values ${JSON.stringify([...new Set(r.bands)])} x${r.bands.length}`);
    check(r.imgs.every((i) => i.alt === '' && i.lazy === 'lazy' && i.w === '640' && i.h === '360'), 'Structure: every cover img has alt="" (present, empty), loading=lazy and width/height attributes (no layout shift)', `alt ${JSON.stringify([...new Set(r.imgs.map((i) => i.alt))])}, loading ${JSON.stringify([...new Set(r.imgs.map((i) => i.lazy))])}, size ${JSON.stringify([...new Set(r.imgs.map((i) => i.w + 'x' + i.h))])}`);
    const rawgOk = r.imgs.every((i) => /^https:\/\/media\.rawg\.io\/media\/resize\/640\/-\/(games|screenshots)\//.test(i.src) && i.srcset.includes('/media/resize/1280/-/') && /640\/-\/.* 1x, .*1280\/-\/.* 2x$/.test(i.srcset));
    check(rawgOk, 'Images: src is the RAWG /media/resize/640/-/ copy and srcset adds the /media/resize/1280/-/ copy as 2x', `src[0] ${r.imgs[0].src}; srcset[0] ${r.imgs[0].srcset}`);
    // loaded copy (DPR 1): the 1st visible covers really were requested at 640
    await p.waitForFunction(() => [...document.querySelectorAll('.case__art')].slice(0, 4).every((i) => i.complete), null, { timeout: 20000 }).catch(() => undefined);
    const loaded = await p.evaluate(() => [...document.querySelectorAll('.case__art')].slice(0, 4).map((i) => ({ cur: i.currentSrc, ok: i.complete && i.naturalWidth > 0, nw: i.naturalWidth })));
    check(loaded.every((l) => l.ok && l.cur.includes('/media/resize/640/-/')), 'Images (DPR 1): the 4 first covers loaded and currentSrc is the 640 copy', JSON.stringify(loaded.map((l) => `${l.cur.split('/-/')[1]?.slice(0, 22)}.. ${l.nw}px`)));
    check(r.tabbables === 1 && r.tab0 === 0, 'Structure: roving tabindex at load, exactly one case has tabindex 0 (the 1st) and the other 19 have -1', `tabIndex>=0 on ${r.tabbables} case(s), index of the stop ${r.tab0}`);
    check(r.labels.every((l, i) => l === `${MOCK_GAMES[i].name}, ${MOCK_GAMES[i].released.slice(0, 4)}`), 'Structure: aria-label of each link is one text "<name>, <year>"', `first ${JSON.stringify(r.labels[0])}`);
    check(r.overflowX === 'auto' && r.snap.includes('x') && r.snap.includes('mandatory'), 'Structure: the row scrolls horizontally with mandatory x snap', `overflow-x ${r.overflowX}, scroll-snap-type ${r.snap}`);
    check(r.aria === null && r.shelfBlock.trim() === '' && ['auto', '0px', 'normal'].includes(r.secMin), 'Obsolete --shelf-block is gone: no token, the section has no aria-hidden and no min-block-size', `--shelf-block "${r.shelfBlock.trim()}", aria-hidden ${r.aria}, min-block-size ${r.secMin}`);
    // accessible names
    const tree = await p.locator('.shelf').ariaSnapshot();
    const names = MOCK_GAMES.map((g) => `${g.name}, ${g.released.slice(0, 4)}`);
    const missing = names.filter((nm) => !new RegExp(`link "${esc(nm)}"`).test(tree));
    check(missing.length === 0 && /heading "Games matching cozy indie games" \[level=2\]/.test(tree) && !/link "[^"]*Game Feelings/.test(tree), 'Accessible names: every link is "<title>, <year>" (e.g. "Sky: Children of the Light, 2019"), no "Game Feelings" from the band, h2 is level 2', `missing [${missing}]; "Sky: Children of the Light, 2019" present ${tree.includes('link "Sky: Children of the Light, 2019"')}`);
    check((tree.match(/link "/g) ?? []).length === 20, 'Accessibility tree: the shelf exposes exactly 20 links', `${(tree.match(/link "/g) ?? []).length} links`);
    const expectedSeen = seen404.length;
    info('Expected 404 of the broken mock image (case 5), filtered explicitly by isExpected404(/gf-missing-cover.jpg)', `${expectedSeen} event(s) seen in this page (console + response)`);
    // fallback of the 5th case
    await p.waitForFunction(() => document.querySelectorAll('.shelf__row li')[4]?.firstElementChild.classList.contains('case--noimg'), null, { timeout: 20000 }).catch(() => undefined);
    const f5 = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('.shelf__row .case')], c5 = cs[4], c4 = cs[3];
      const cov = getComputedStyle(c5.querySelector('.case__cover'));
      return { noimg: cs.map((c, i) => (c.classList.contains('case--noimg') ? i : null)).filter((x) => x !== null), artDisp: getComputedStyle(c5.querySelector('.case__art')).display, cover: cov.backgroundImage + '|' + cov.backgroundColor, t5: parseFloat(getComputedStyle(c5.querySelector('.case__title')).fontSize), t4: parseFloat(getComputedStyle(c4.querySelector('.case__title')).fontSize) };
    });
    check(f5.noimg.includes(4) && f5.artDisp === 'none' && f5.cover !== 'none|rgba(0, 0, 0, 0)' && f5.t5 > f5.t4, 'No image: the 5th case gets case--noimg, hides the img, shows the blue fallback and a larger title', `case--noimg indexes [${f5.noimg}] (only the broken one expected among loaded), art display ${f5.artDisp}, cover bg "${f5.cover.slice(0, 60)}", title ${f5.t5}px vs ${f5.t4}px of case 4`);
    await shot(p, 'noimg-case', '1440-light', { clip: await p.evaluate(() => { const r = document.querySelectorAll('.shelf__row .case')[4].getBoundingClientRect(); return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40 }; }) });
    await ctx.close();
  }

  // ================= 2. Sizes per viewport (DESIGN §15.2) =================
  // DESIGN §15.2 measured table. box = case px (+-2), vis = whole cases, peek = px of the cut case (+-8; 0 => none, <= 2), frac = share of the first case above the fold.
  const SIZES = [
    { w: 1920, h: 1080, dpr: 1, box: [320, 450], vis: 5, peek: 152, frac: [0.97, 1], scroll: 'none' },
    { w: 1440, h: 900, dpr: 1, box: [234, 329], vis: 5, peek: 101, frac: [0.97, 1], scroll: 'none' },
    { w: 1280, h: 800, dpr: 1, box: [205, 288], vis: 5, peek: 93, frac: [0.97, 1], scroll: 'some', scrollMax: 40 },
    { w: 1280, h: 600, dpr: 1, box: [153, 216], vis: 7, peek: 0, frac: [0.97, 1], scroll: 'some' },
    { w: 1024, h: 768, dpr: 1, box: [163, 229], vis: 5, peek: 77, frac: [0.97, 1], scroll: 'none' },
    { w: 768, h: 1024, dpr: 2, mobile: true, box: [197, 277], vis: 3, peek: 100, frac: [0.97, 1], scroll: 'none' },
    { w: 390, h: 844, dpr: 3, mobile: true, box: [147, 206], vis: 2, peek: 49, frac: [0.97, 1], scroll: 'none' },
    { w: 375, h: 667, dpr: 2, mobile: true, box: [144, 203], vis: 2, peek: 39, frac: [0.97, 1], scroll: 'some' },
    { w: 320, h: 568, dpr: 2, mobile: true, box: [144, 203], vis: 2, peek: 0, frac: [0.78, 0.92], scroll: 'some' },
    { w: 844, h: 390, dpr: 3, mobile: true, box: [144, 203], vis: 5, peek: 10, frac: [0.6, 0.72], scroll: 'some' },
  ];
  const SHOT_DARK = new Set(['1440x900', '1280x600', '768x1024', '390x844', '375x667', '844x390']);
  if (want('sizes')) {
    for (const s of SIZES) {
      for (const scheme of ['light', 'dark']) {
        if (scheme === 'dark' && !SHOT_DARK.has(`${s.w}x${s.h}`)) continue;
        const tag = `${s.w}x${s.h}-${scheme}`;
        const { ctx, p } = await open({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: !!s.mobile, hasTouch: !!s.mobile, colorScheme: scheme, reducedMotion: 'reduce' }, { url: URL_RES(), tag: `5-size-${tag}` });
        await toResults(p);
        await p.waitForFunction(() => document.querySelector('.case__art')?.complete, null, { timeout: 20000 }).catch(() => undefined);
        const m = await p.evaluate(() => {
          const cases = [...document.querySelectorAll('.shelf__row .case')], rs = cases.map((c) => c.getBoundingClientRect()), iw = innerWidth, ih = innerHeight, de = document.documentElement, r0 = rs[0];
          const vis = rs.filter((r) => r.left >= -0.5 && r.right <= iw + 0.5).length, next = rs[vis];
          const row = document.querySelector('.shelf__row'), sh = document.querySelector('.shelf');
          const img = cases[0].querySelector('img');
          return { w: r0.width, h: r0.height, vis, peeks: !!next && next.left < iw - 0.5 && next.right > iw + 0.5, peekPx: next ? Math.max(0, iw - next.left) : 0, more: row.hasAttribute('data-more'), shadow: Number(getComputedStyle(sh, '::after').opacity), frac: Math.max(0, Math.min(r0.bottom, ih) - Math.max(r0.top, 0)) / r0.height, left0: r0.left, sw: de.scrollWidth, iw, sh: de.scrollHeight, ih, cur: img.currentSrc, dpr: devicePixelRatio, formBottom: document.querySelector('form.feeling').getBoundingClientRect().bottom };
        });
        // the row shadow fades in over --dur-base: read it after it settled
        await p.waitForTimeout(500);
        m.shadow = await p.evaluate(() => Number(getComputedStyle(document.querySelector('.shelf'), '::after').opacity));
        if (scheme === 'light') {
          const exp = s.box;
          check(Math.abs(m.w - exp[0]) <= 2 && Math.abs(m.h - exp[1]) <= 2, `[${s.w}x${s.h}] case box is ~${exp[0]}x${exp[1]} px (DESIGN §15.2)`, `measured ${m.w.toFixed(1)}x${m.h.toFixed(1)}; ratio ${(m.w / m.h).toFixed(4)} (135:190 = ${(135 / 190).toFixed(4)})`);
          check(Math.abs(m.w / m.h - 135 / 190) < 0.005, `[${s.w}x${s.h}] case proportion is 135:190`, `${(m.w / m.h).toFixed(4)}`);
          check(m.vis === s.vis, `[${s.w}x${s.h}] ${s.vis} whole cases visible (§15.2)`, `whole cases ${m.vis}, first case left ${m.left0.toFixed(1)}`);
          if (s.peek) check(Math.abs(m.peekPx - s.peek) <= 8, `[${s.w}x${s.h}] the next case peeks in ~${s.peek} px from the right (+-8)`, `peek ${m.peekPx.toFixed(0)} px`);
          else check(m.peekPx <= 2, `[${s.w}x${s.h}] no case peeks (floor / height cap decides); the edge shadow is the hint`, `peek ${m.peekPx.toFixed(1)} px`);
          check(m.more && m.shadow === 1, `[${s.w}x${s.h}] row start: data-more present and the .shelf::after edge shadow is at opacity 1`, `data-more ${m.more}, ::after opacity ${m.shadow}`);
          check(m.frac >= s.frac[0] && m.frac <= s.frac[1] + 0.001 && m.frac >= 0.5, `[${s.w}x${s.h}] fraction of the first case visible without scroll in [${s.frac}] (and >= 0.5)`, `${(m.frac * 100).toFixed(0)} %`);
          check(m.sw <= m.iw, `[${s.w}x${s.h}] no horizontal page scroll`, `scrollWidth ${m.sw} / innerWidth ${m.iw}`);
          if (s.scroll === 'none') check(m.sh === m.ih, `[${s.w}x${s.h}] no vertical scroll (scrollHeight == innerHeight)`, `scrollHeight ${m.sh} / innerHeight ${m.ih}`);
          else check(m.sh > m.ih && (!s.scrollMax || m.sh - m.ih <= s.scrollMax), `[${s.w}x${s.h}] vertical scroll exists as designed (the footer)${s.scrollMax ? ` and is <= ${s.scrollMax} px` : ''}`, `scrollHeight ${m.sh} / innerHeight ${m.ih} => ${m.sh - m.ih} px`);
          check(m.formBottom <= m.ih, `[${s.w}x${s.h}] the whole form stays above the fold with the row shown`, `form bottom ${m.formBottom.toFixed(0)} <= ${m.ih}`);
          const want = s.dpr >= 2 ? '/media/resize/1280/-/' : '/media/resize/640/-/';
          check(m.cur.includes(want), `[${s.w}x${s.h} @${s.dpr}x] the first cover is loaded from the ${s.dpr >= 2 ? '1280 (2x)' : '640 (1x)'} copy`, m.cur.replace(/^https:\/\/media\.rawg\.io/, ''));
        }
        // end of the row: no data-more, no shadow
        await p.evaluate(() => { const r = document.querySelector('.shelf__row'); r.scrollTo({ left: r.scrollWidth, behavior: 'instant' }); });
        await p.waitForTimeout(500);
        if (scheme === 'light') {
          const e = await p.evaluate(() => { const r = document.querySelector('.shelf__row'); return { more: r.hasAttribute('data-more'), shadow: Number(getComputedStyle(document.querySelector('.shelf'), '::after').opacity), left: r.scrollLeft, max: r.scrollWidth - r.clientWidth }; });
          check(e.left > 0 && !e.more && e.shadow === 0, `[${s.w}x${s.h}] row end (scrollLeft max): no data-more and the edge shadow is gone`, `scrollLeft ${e.left.toFixed(0)} / ${e.max.toFixed(0)}, data-more ${e.more}, ::after opacity ${e.shadow}`);
        }
        await p.evaluate(() => document.querySelector('.shelf__row').scrollTo({ left: 0, behavior: 'instant' }));
        await p.waitForTimeout(300);
        await shot(p, 'results', tag);
        await ctx.close();
      }
    }
  }

  // ================= 3. Entrance (staggered with motion, fade only with reduce) + reduced-motion interaction =================
  if (want('entrance')) {
    for (const reduce of [false, true]) {
      const lab = reduce ? 'reduced motion' : 'motion';
      const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...(reduce ? { reducedMotion: 'reduce' } : {}) }, { url: URL_RES(), tag: `5-entrance-${reduce ? 'rm' : 'motion'}`, init: [ENTRANCE] });
      await toResults(p);
      const run = await p.evaluate(() => window.__ent.at(-1));
      const { s, delays } = run;
      const ahead = s.filter((x) => x.a.o > x.d.o + 0.05).length, behind = s.filter((x) => x.d.o > x.a.o + 0.001).length;
      const trs = s.flatMap((x) => [x.a.tr, x.d.tr]);
      if (!reduce) {
        check(delays[0] === 0 && delays[3] === 180 && delays[7] === 420 && delays[19] === 420, 'Entrance (motion): CSS delays are staggered by 60 ms per case and capped after the 8th (0, 180 ms for the 4th, 420 ms from the 8th on)', `delays ${JSON.stringify(delays.slice(0, 9))} ... [19]=${delays[19]}`);
        check(ahead > 0 && behind === 0, 'Entrance (motion): sampled per frame, the 1st case is ahead of the 4th (higher opacity) in some frames and never behind', `frames with 1st ahead ${ahead}, with 4th ahead ${behind}, of ${s.length} frames in ${s.at(-1).t.toFixed(0)} ms (a healthy run has ~100 frames; few frames = main thread starved during the entrance)`);
        const first = s[0];
        check(first.a.o < 0.6 && parseFloat(first.a.tr.split(' ').at(-1)) > 10, 'Entrance (motion): the first sample of the 1st case is still displaced upward (rises ~40 px) and not yet opaque', `1st case first frame: opacity ${first.a.o.toFixed(2)}, translate "${first.a.tr}"; 4th: opacity ${first.d.o.toFixed(2)}, translate "${first.d.tr}"`);
        const last = s.at(-1);
        check(last.a.o === 1 && /^(none|0px( 0px)?)$/.test(last.a.tr) && last.d.o === 1, 'Entrance (motion): settles at opacity 1 and translate 0', `last frame at ${last.t.toFixed(0)} ms: 1st opacity ${last.a.o}, translate "${last.a.tr}"; 4th opacity ${last.d.o}`);
      } else {
        check(delays.every((d) => d === 0), 'Entrance (reduced motion): all cases start together (every CSS delay is 0)', `delays ${JSON.stringify([...new Set(delays)])}`);
        check(trs.every((t) => /^(none|0px( 0px)?)$/.test(t)), 'Entrance (reduced motion): translate is 0px from the first frame on (no rise, only a fade)', `translate values seen ${JSON.stringify([...new Set(trs)])} over ${s.length} frames`);
        check(Math.min(...s.map((x) => x.a.o)) < 1 && s.at(-1).a.o === 1, 'Entrance (reduced motion): there is a (short) fade, ending at opacity 1', `min opacity of the 1st case ${Math.min(...s.map((x) => x.a.o)).toFixed(2)} -> ${s.at(-1).a.o}; settled by ${s.find((x) => x.a.o === 1)?.t.toFixed(0)} ms`);
        // no tilt, no lift, no sheen travel, no focus transform
        const box = await p.evaluate(() => { const r = document.querySelectorAll('.shelf__row .case')[1].getBoundingClientRect(); return { x: r.right - r.width * 0.1, y: r.top + r.height * 0.1 }; });
        await p.mouse.move(box.x, box.y, { steps: 6 });
        await p.waitForTimeout(350);
        const h = await p.evaluate(() => { const c = document.querySelectorAll('.shelf__row .case')[1]; return { rx: c.style.getPropertyValue('--rx'), transform: getComputedStyle(c).transform, sheenT: getComputedStyle(c, '::after').translate }; });
        check(h.rx === '' && h.transform === 'none' && h.sheenT === 'none', 'Reduced motion: hovering a case does not tilt, lift or move the sheen (transform none, --rx unset)', JSON.stringify(h));
        await p.focus('.feeling__submit'); await p.keyboard.press('Tab');
        const f = await p.evaluate(() => { const c = document.activeElement; return { cls: c.className, transform: getComputedStyle(c).transform, ring: getComputedStyle(c).outlineStyle + ' ' + getComputedStyle(c).outlineWidth }; });
        check(/case/.test(f.cls) && f.transform === 'none' && !/^none/.test(f.ring), 'Reduced motion: a focused case has no transform but keeps its focus ring', JSON.stringify(f));
      }
      await ctx.close();
    }
  }

  // ================= 4. Interaction: keyboard, game:open, tilt, hover/focus shots (1440 light) =================
  if (want('interaction')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, { url: URL_RES(), tag: '5-interaction', init: [OPEN_PROBE] });
    await toResults(p);
    const caseRect = (i) => p.evaluate((i) => { const r = document.querySelectorAll('.shelf__row .case')[i].getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right }; }, i);
    const active = () => p.evaluate(() => { const c = document.activeElement, cs = [...document.querySelectorAll('.shelf__row .case')]; const r = c.getBoundingClientRect(); return { idx: cs.indexOf(c), href: c.getAttribute('href'), left: r.left, right: r.right, iw: innerWidth, scrollLeft: document.querySelector('.shelf__row').scrollLeft, transform: getComputedStyle(c).transform, ring: getComputedStyle(c).outlineStyle + ' ' + getComputedStyle(c).outlineWidth, ringVisible: c.matches(':focus-visible'), scrollY: scrollY }; });
    const scrolled = () => p.waitForFunction(() => { const r = document.querySelector('.shelf__row'); const v = r.scrollLeft; window.__sl2 = window.__sl1; window.__sl1 = v; return window.__sl2 === v; }, null, { polling: 80, timeout: 5000 }).catch(() => undefined);

    // --- tilt (mouse) ---
    const c2 = await caseRect(1);
    await p.mouse.move(c2.l + c2.w * 0.9, c2.t + c2.h * 0.1, { steps: 8 });
    await p.waitForTimeout(450);
    const t = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('.shelf__row .case')], c = cs[1];
      return { rx: parseFloat(c.style.getPropertyValue('--rx')), ry: parseFloat(c.style.getPropertyValue('--ry')), sheen: parseFloat(c.style.getPropertyValue('--sheen')), tr: getComputedStyle(c).transform.slice(0, 9), withInline: cs.filter((x) => x.style.getPropertyValue('--rx') !== '').length, lift: getComputedStyle(c).getPropertyValue('--lift'), sheenT: getComputedStyle(c, '::after').translate };
    });
    check(t.rx >= 7 && t.rx <= 11 && t.ry >= 7 && t.ry <= 11 && t.tr === 'matrix3d(', 'Tilt: pointer near the top-right corner (90 %, 10 %) of the 2nd case => --rx and --ry about +8..10 deg and transform is matrix3d', `--rx ${t.rx}deg, --ry ${t.ry}deg, --sheen ${t.sheen}, transform ${t.tr}.., --lift ${t.lift}, sheen translate ${t.sheenT}`);
    check(t.withInline === 1, 'Tilt: only the case under the pointer carries inline tilt values', `${t.withInline} cases with --rx set`);
    await shot(p, 'hover-tilt', '1440-light');
    const nextC = await caseRect(2);
    await p.mouse.move(nextC.l + nextC.w * 0.5, nextC.t + nextC.h * 0.5, { steps: 4 });
    await p.waitForTimeout(100);
    const sw = await p.evaluate(() => ({ prev: document.querySelectorAll('.shelf__row .case')[1].style.getPropertyValue('--rx'), now: document.querySelectorAll('.shelf__row .case')[2].style.getPropertyValue('--rx') }));
    check(sw.prev === '' && sw.now !== '', 'Tilt: moving to the next case resets the previous one and tilts the new one', `prev --rx "${sw.prev}", new --rx "${sw.now}"`);
    await p.mouse.move(5, 5, { steps: 6 });
    await p.waitForTimeout(450);
    const back = await p.evaluate(() => { const cs = [...document.querySelectorAll('.shelf__row .case')]; return { inline: cs.filter((x) => x.style.getPropertyValue('--rx') !== '' || x.style.getPropertyValue('--ry') !== '' || x.style.getPropertyValue('--sheen') !== '').length, rx: getComputedStyle(cs[2]).getPropertyValue('--rx'), ry: getComputedStyle(cs[2]).getPropertyValue('--ry'), lift: getComputedStyle(cs[2]).getPropertyValue('--lift') }; });
    check(back.inline === 0 && back.rx === '0deg' && back.ry === '0deg' && back.lift === '0px', 'Tilt: when the pointer leaves, --rx/--ry/--sheen are removed and the case returns to 0deg / lift 0', JSON.stringify(back));
    // touch pointer: no tilt
    const tc = await caseRect(3);
    await p.evaluate(([x, y]) => { const c = document.querySelectorAll('.shelf__row .case')[3]; c.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); }, [tc.l + tc.w * 0.9, tc.t + tc.h * 0.1]);
    await p.waitForTimeout(120);
    const touchRx = await p.evaluate(() => document.querySelectorAll('.shelf__row .case')[3].style.getPropertyValue('--rx'));
    check(touchRx === '', 'Tilt: a touch pointermove never tilts (the finger scrolls the row)', `--rx "${touchRx}"`);

    // --- hover stability: pointer 4 px above the bottom edge of a case (rev 1 bug: lift -> lost hover -> drop -> shake) ---
    {
      const li = await p.evaluate(() => { const r = document.querySelectorAll('.shelf__row li')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 4 }; });
      await p.mouse.move(li.x, 40, { steps: 4 });
      await p.mouse.move(li.x, li.y, { steps: 10 });
      await p.waitForTimeout(350);
      const samples = [];
      for (let i = 0; i < 12; i++) {
        samples.push(await p.evaluate(() => { const l = document.querySelectorAll('.shelf__row li')[2]; return { hover: l.matches(':hover'), lift: getComputedStyle(l.firstElementChild).getPropertyValue('--lift').trim(), top: l.getBoundingClientRect().top }; }));
        await p.waitForTimeout(60);
      }
      const tops = new Set(samples.map((x) => x.top.toFixed(2)));
      check(samples.every((x) => x.hover && x.lift === '-6px') && tops.size === 1, 'Hover stability: pointer 4 px above the case bottom => the li stays :hover, --lift stays -6px and the li top does not move in 12 samples (~720 ms)', JSON.stringify({ hover: samples.filter((x) => x.hover).length + '/12', lifts: [...new Set(samples.map((x) => x.lift))], tops: [...tops] }));
      await shot(p, 'hover-bottom-edge', '1440-light');
      await p.mouse.move(5, 5, { steps: 6 });
      await p.waitForTimeout(300);
    }

    // --- keyboard: roving tabindex ---
    const stops = () => p.evaluate(() => [...document.querySelectorAll('.shelf__row .case')].map((c, i) => (c.tabIndex === 0 ? i : null)).filter((x) => x !== null));
    check(JSON.stringify(await stops()) === '[0]', 'Roving tabindex: exactly one case with tabIndex 0 (the 1st) at the start', JSON.stringify(await stops()));
    await p.focus('.feeling__submit');
    await p.keyboard.press('Tab');
    let a = await active();
    check(a.idx === 0 && a.href === `?game=${MOCK_GAMES[0].slug}`, 'Keyboard: Tab from the submit button lands on the 1st case', `index ${a.idx}, href ${a.href}`);
    check(a.transform !== 'none' && a.transform.startsWith('matrix3d') && a.ringVisible && !a.ring.startsWith('none'), 'Keyboard: the focused case lifts and tilts (transform != none) and shows the focus ring', `transform ${a.transform.slice(0, 40)}.., ring ${a.ring}, :focus-visible ${a.ringVisible}`);
    await shot(p, 'focus-first', '1440-light');
    for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
    await scrolled();
    a = await active();
    check(a.idx === 3 && JSON.stringify(await stops()) === '[3]', '3 x ArrowRight => case 4 focused and it is now the only tabIndex 0', `index ${a.idx}, stops ${JSON.stringify(await stops())}`);
    await p.keyboard.press('Tab');
    const out = await p.evaluate(() => { const e = document.activeElement; return { tag: e.tagName, href: e.getAttribute('href'), inFooter: !!e.closest('footer'), inRow: !!e.closest('.shelf__row'), text: e.textContent }; });
    check(!out.inRow && out.tag === 'A' && out.inFooter && /rawg/i.test(out.href + out.text), 'Tab from case 4 leaves the row: next stop is the RAWG link in the footer (the row is ONE Tab stop)', JSON.stringify(out));
    await p.keyboard.press('Shift+Tab');
    a = await active();
    check(a.idx === 3, 'Shift+Tab from the RAWG link returns to the last focused case (4th)', `index ${a.idx}`);
    // modifiers never move the focus
    for (const combo of ['Shift+ArrowRight', 'Control+ArrowRight', 'Alt+ArrowRight', 'Meta+ArrowRight', 'Shift+End', 'Control+Home']) await p.keyboard.press(combo);
    a = await active();
    check(a.idx === 3, 'Modified keys (Shift/Ctrl/Alt/Meta + arrows, Shift+End, Ctrl+Home) are ignored: focus stays on the 4th case', `index ${a.idx}`);
    for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
    await scrolled();
    a = await active();
    check(a.idx === 6 && a.left >= 0 && a.right <= a.iw + 0.5 && a.scrollLeft > 0 && a.scrollY === 0, 'ArrowRight again => focus on the 7th case, fully inside the screen, row scrollLeft > 0, page not scrolled', `index ${a.idx}, left ${a.left.toFixed(0)}, right ${a.right.toFixed(0)} of ${a.iw}, scrollLeft ${a.scrollLeft.toFixed(0)}, scrollY ${a.scrollY}`);
    await shot(p, 'focus-seventh', '1440-light');
    await p.keyboard.press('End'); await scrolled();
    a = await active();
    check(a.idx === 19 && a.right <= a.iw + 0.5 && a.left >= 0 && JSON.stringify(await stops()) === '[19]', 'End => focus on the 20th case, in view, single stop moved to it', `index ${a.idx}, left ${a.left.toFixed(0)}, right ${a.right.toFixed(0)}, scrollLeft ${a.scrollLeft.toFixed(0)}, stops ${JSON.stringify(await stops())}`);
    await p.keyboard.press('ArrowRight');
    a = await active();
    check(a.idx === 19, 'ArrowRight on the last case stays on it (no wrap, no focus loss)', `index ${a.idx}`);
    await p.keyboard.press('Home'); await scrolled();
    a = await active();
    check(a.idx === 0 && a.scrollLeft === 0, 'Home => focus on the 1st case and the row is back at scrollLeft 0', `index ${a.idx}, scrollLeft ${a.scrollLeft}`);
    await p.keyboard.press('ArrowLeft');
    a = await active();
    check(a.idx === 0, 'ArrowLeft on the first case stays on it', `index ${a.idx}`);
    await p.keyboard.press('ArrowRight');
    a = await active();
    check(a.idx === 1, 'ArrowRight moves one case at a time', `index ${a.idx}`);
    await p.keyboard.press('ArrowLeft');

    // --- open: Enter ---
    await p.evaluate(() => { window.__opens.length = 0; window.__clicks.length = 0; });
    await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
    const o = await p.evaluate(() => ({ opens: window.__opens, clicks: window.__clicks }));
    check(o.opens.length === 1 && o.opens[0].slug === MOCK_GAMES[0].slug && o.opens[0].opener === true && o.opens[0].openerIsCase && o.clicks[0]?.prevented === true,
      'Enter on a case fires game:open on #app once with detail.game.slug and detail.opener = the focused link', `events ${JSON.stringify(o.opens)}; click defaultPrevented ${o.clicks[0]?.prevented}`);
    // phase 6: game:open now opens the detail panel; close it (Esc) so the next steps see the shelf again
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    // plain mouse click
    await p.evaluate(() => { window.__opens.length = 0; window.__clicks.length = 0; });
    await p.click('.shelf__row li:nth-child(3) a.case');
    await p.waitForTimeout(200);
    const o2 = await p.evaluate(() => ({ opens: window.__opens, clicks: window.__clicks }));
    check(o2.opens.length === 1 && o2.opens[0].slug === MOCK_GAMES[2].slug, 'A plain mouse click fires game:open (3rd case)', `events ${JSON.stringify(o2.opens.map((x) => x.slug))}`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    // modified clicks: synthetic (the page keeps its state), link's own decision recorded by a later document listener
    await p.evaluate(() => { window.__opens.length = 0; window.__clicks.length = 0; });
    for (const mod of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      await p.evaluate((mod) => { document.querySelector('.shelf__row li a.case').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, [mod]: true })); }, mod);
    }
    await p.evaluate(() => document.querySelector('.shelf__row li a.case').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 })));
    const o3 = await p.evaluate(() => ({ opens: window.__opens.length, clicks: window.__clicks.map((c) => ({ k: c.ctrl ? 'ctrl' : c.meta ? 'meta' : c.shift ? 'shift' : c.alt ? 'alt' : 'button' + c.button, prevented: c.prevented })) }));
    check(o3.opens === 0 && o3.clicks.length === 5, 'Ctrl / Cmd / Shift / Alt / middle click: the link handler does NOT fire game:open', `game:open count ${o3.opens} over ${o3.clicks.length} clicks`);
    // note: the probe's own listener always cancels clicks on .case (to keep the page), so `prevented` here is the handler's decision only because it is read at the start of that listener
    check(o3.clicks.every((c) => c.prevented === false), 'Ctrl / Cmd / Shift / Alt / middle click: the case handler leaves the default action alone (defaultPrevented false, so the browser follows ?game=<slug>)', JSON.stringify(o3.clicks));
    // real browser behaviour: Ctrl+click and middle click open ?game=<slug> in a new tab
    for (const how of ['ctrl', 'middle']) {
      // the probe cancels clicks on .case, so the real new-tab test uses a fresh page without the probe
      const { ctx: qctx, p: q } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, { url: URL_RES(), tag: `5-newtab-${how}` }); // own context: the probe's init script would cancel the click
      await toResults(q);
      let np = null;
      for (let attempt = 0; attempt < 3 && !np; attempt++) {
        const w2 = qctx.waitForEvent('page', { timeout: 6000 }).catch(() => null);
        if (how === 'ctrl') await q.click('.shelf__row li:nth-child(2) a.case', { modifiers: ['Control'] });
        else await q.click('.shelf__row li:nth-child(2) a.case', { button: 'middle' });
        np = await w2;
      }
      const stay = q.url();
      check(!!np && np.url().includes('?game=snufkin-melody-of-moominvalley'), `${how === 'ctrl' ? 'Ctrl' : 'Middle'} click really opens ?game=<slug> in a new tab and the original page keeps its URL`, `new tab url ${np ? np.url() : 'none opened'}; original ${stay}`);
      if (np) await np.close().catch(() => undefined);
      await qctx.close();
    }
    await ctx.close();
  }

  // ================= 4b. Detail panel smoke (phase 6, DESIGN §16.13): open / focus / url / Esc / focus back / holo pause =================
  if (want('detail')) {
    // headless swiftshader starves the main thread (the 260 ms close timer fired after 2.4 s once): wait for the state, not for a fixed time
    const waitClosed = (pg) => pg.waitForFunction(() => !document.querySelector("dialog.detail").open && !document.documentElement.hasAttribute("data-holo-paused"), null, { timeout: 8000 }).catch(() => undefined);
    const waitOpen = (pg) => pg.waitForFunction(() => document.querySelector("dialog.detail").open && document.activeElement?.id === "detail-title", null, { timeout: 8000 }).catch(() => undefined);
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, { url: URL_RES(), tag: '6-detail' });
    await p.route('**/api/game?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Mock game', description: 'x', released: null, trailer: null, screenshots: [] }) }));
    await toResults(p);
    await p.click('.shelf__row li:nth-child(2) a.case');
    await p.waitForTimeout(700);
    const d = await p.evaluate(() => ({ open: document.querySelector('dialog.detail')?.open, active: document.activeElement?.id, url: location.search, state: document.getElementById('app').dataset.state, paused: document.documentElement.hasAttribute('data-holo-paused') }));
    check(d.open && d.active === 'detail-title' && d.url.includes('game=' + MOCK_GAMES[1].slug) && d.state === 'detail' && d.paused, 'Click on a case opens the detail dialog: focus on its title, ?game=<slug>, data-state=detail, background paused', JSON.stringify(d));
    await p.keyboard.press('Escape');
    await waitClosed(p);
    const c = await p.evaluate(() => ({ open: document.querySelector('dialog.detail').open, url: location.search, paused: document.documentElement.hasAttribute('data-holo-paused'), href: document.activeElement?.getAttribute('href') }));
    check(!c.open && !c.url.includes('game=') && !c.paused && c.href === '?game=' + MOCK_GAMES[1].slug, 'Esc closes it: URL clean, background resumes, focus back on the same case', JSON.stringify(c));
    // regression: after close the next open must still show Fig. 1 (open A, close, open B)
    await p.click('.shelf__row li:nth-child(3) a.case'); await waitOpen(p); await p.waitForTimeout(300);
    const re = await p.evaluate(() => ({ img: !!document.querySelector('.detail__fig--main img.detail__media'), media: document.querySelectorAll('.detail__fig--main .detail__media').length }));
    check(re.img && re.media === 1, 'Reopen another game after closing: Fig. 1 (cover) is present, exactly one media node', JSON.stringify(re));
    await p.keyboard.press('Escape'); await waitClosed(p);
    // --- history (code review 6): each step compares navigation.currentEntry.index so a double history.back() shows up ---
    const slug1 = MOCK_GAMES[1].slug;
    const idx = (pg) => pg.evaluate(() => navigation.currentEntry.index);
    const st = (pg) => pg.evaluate(() => ({ open: document.querySelector('dialog.detail').open, url: location.search, active: document.activeElement?.className || document.activeElement?.tagName }));
    const k = await idx(p);
    await p.click('.shelf__row li:nth-child(2) a.case'); await p.waitForTimeout(700);
    check((await idx(p)) === k + 1, 'History: opening a case adds exactly one entry', 'index ' + (await idx(p)) + ' vs ' + k);
    await p.goBack(); await waitClosed(p);
    let h = await st(p);
    check(!h.open && !h.url.includes('game=') && (await idx(p)) === k, 'History: Back closes the panel (URL clean, one entry back)', JSON.stringify(h));
    await p.goForward(); await waitOpen(p);
    h = await st(p);
    check(h.open && h.url.includes('game=' + slug1) && (await idx(p)) === k + 1, 'History: Forward reopens it', JSON.stringify(h));
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await waitClosed(p);
    h = await st(p);
    check(!h.open && !h.url.includes('game=') && (await idx(p)) === k, 'History: Forward then Esc (twice) goes back ONCE (no double history.back)', JSON.stringify(h) + ' index ' + (await idx(p)) + ' vs ' + k);
    await p.click('.shelf__row li:nth-child(2) a.case'); await p.waitForTimeout(700);
    await p.click('.detail__close', { clickCount: 2, delay: 20 }); await waitClosed(p);
    h = await st(p);
    check(!h.open && (await idx(p)) === k, 'History: a double click on Close goes back once', JSON.stringify(h) + ' index ' + (await idx(p)) + ' vs ' + k);
    await p.click('.shelf__row li:nth-child(2) a.case'); await p.waitForTimeout(700);
    await p.mouse.click(5, 5); await p.keyboard.press('Escape'); await waitClosed(p);
    h = await st(p);
    check(!h.open && (await idx(p)) === k, 'History: scrim click + Esc goes back once', JSON.stringify(h) + ' index ' + (await idx(p)) + ' vs ' + k);
    await p.click('.shelf__row li:nth-child(2) a.case'); await p.waitForTimeout(700);
    const box = await p.evaluate(() => { const r = document.querySelector('dialog.detail').getBoundingClientRect(); return { x: r.left + 3, y: r.top + r.height / 2 }; });
    await p.mouse.click(box.x, box.y); await p.waitForTimeout(500);
    check((await st(p)).open, 'Click on the 8 px glass rim does not close the panel', JSON.stringify(await st(p)));
    // reload with the panel open: the entry survives the reload but is no longer ours -> Esc must replace, not go back
    await p.reload(); await p.waitForTimeout(1500);
    const k2 = await idx(p);
    h = await st(p);
    check(h.open && h.url.includes('game='), 'Reload with the panel open: it reopens from ?game=', JSON.stringify(h));
    await p.keyboard.press('Escape'); await waitClosed(p);
    h = await st(p);
    check(!h.open && !h.url.includes('game=') && (await idx(p)) === k2, 'Reload with the panel open, then Esc: URL cleaned in place (replaceState, same entry)', JSON.stringify(h) + ' index ' + (await idx(p)) + ' vs ' + k2);
    await ctx.close();
    // direct link: close leaves no entry to reopen from
    const dl = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, { url: BASE + '/?game=hollow-knight&t=9500&noblink', tag: '6-direct', pre: (pg) => pg.route('**/api/game?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Hollow Knight', description: 'x', released: null, trailer: null, screenshots: [] }) })) });
    await dl.p.waitForTimeout(1500);
    const i0 = await idx(dl.p);
    await dl.p.keyboard.press('Escape'); await dl.p.waitForFunction(() => !document.querySelector('dialog.detail').open, null, { timeout: 8000 }).catch(() => undefined);
    h = await st(dl.p);
    const i1 = await idx(dl.p);
    await dl.p.goBack().catch(() => null); await dl.p.waitForTimeout(500);
    check(!h.open && !h.url.includes('game=') && i1 === i0 && !dl.p.url().includes('game='), 'Direct link, then close: URL clean in place (same entry) and Back leaves the page (to the blank entry before it) instead of reopening the panel', JSON.stringify(h) + ' after Back: ' + dl.p.url());
    await dl.ctx.close();
    // Uppercase slug (the server answers 400) and Try again keeping the focus
    const um = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, { url: BASE + '/?game=Hollow-Knight&t=9500&noblink', tag: '6-upper', allow: /status of 400/, pre: (pg) => pg.route('**/api/game?*', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false }) })) });
    await um.p.waitForTimeout(1500);
    const u = await um.p.evaluate(() => ({ title: document.querySelector('.detail__title').textContent, status: document.querySelector('.detail__status').textContent, retry: !document.querySelector('.detail__retry').hidden, link: document.querySelectorAll('.detail__source a').length, fig: !document.querySelector('.detail__fig--main').hidden }));
    check(u.title === content.detail.notFoundTitle && u.status === content.detail.notFound && !u.retry && u.link === 0 && !u.fig, '?game=Hollow-Knight (400 from the server): "Game not found", no Try again, no RAWG link, no empty figure', JSON.stringify(u));
    await um.ctx.close();
    const rt = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, { url: BASE + '/?game=boom&t=9500&noblink', tag: '6-retry', allow: /status of 500/, pre: (pg) => pg.route('**/api/game?*', async (r) => { await sleep(500); return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); }) });
    await rt.p.waitForTimeout(2000);
    await rt.p.focus('.detail__retry'); await rt.p.keyboard.press('Enter'); await rt.p.waitForTimeout(150);
    const f1 = await rt.p.evaluate(() => document.activeElement?.className);
    await rt.p.waitForTimeout(1200);
    const f2 = await rt.p.evaluate(() => ({ cls: document.activeElement?.className, retry: !document.querySelector('.detail__retry').hidden }));
    check(f1 === 'detail__title' && f2.cls === 'detail__title' && f2.retry, 'Try again: focus stays in the dialog (title) while loading and after failing again', JSON.stringify({ f1, f2 }));
    await rt.ctx.close();

    // --- ficha tecnica (DESIGN §16.14): real API on celeste / witcher / a game with no scores, plus routed 8-platform case ---
    const SPEC = () => {
      const dl = document.querySelector('dl.detail__specs'), dlcs = dl && getComputedStyle(dl), dlg = document.querySelector('dialog.detail');
      const rows = [...(dl?.children ?? [])].map((r) => {
        const dt = r.querySelector('dt'), dd = r.querySelector('dd'), sc = r.querySelector('.detail__scale'), vis = dd.querySelector('.visually-hidden');
        return { label: dt.textContent, text: dd.textContent, sc: sc ? { fill: sc.style.getPropertyValue('--fill'), hidden: sc.getAttribute('aria-hidden'), disp: getComputedStyle(sc).display } : null, spoken: vis?.textContent ?? null, ddW: Math.round(dd.getBoundingClientRect().width), dtX: Math.round(dt.getBoundingClientRect().left), ddX: Math.round(dd.getBoundingClientRect().left), ddOver: dd.scrollWidth > dd.clientWidth + 1 };
      });
      const info = document.querySelector('.detail__info');
      return { rows, dlDisp: dlcs?.display ?? 'none', dlH: dl ? Math.round(dl.getBoundingClientRect().height) : 0, nonEmpty: !!dl && dl.children.length > 0,
        docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth, dlgOver: dlg ? dlg.scrollWidth - dlg.clientWidth : 0, infoOver: info ? info.scrollWidth - info.clientWidth : 0,
        stack: dl && rows.length > 1 ? getComputedStyle(dl).gridTemplateColumns.split(' ').length : null, title: document.querySelector('.detail__title')?.textContent, sheetBg: dlg ? getComputedStyle(dlg).backgroundColor : null };
    };
    const specPage = async (slug, vp, scheme, extra = {}, tag = '6-spec', route = null) => {
      const o = await open({ viewport: vp, colorScheme: scheme, ...extra }, { url: `${BASE}/?game=${slug}&t=9500&noblink`, tag, pre: route });
      await o.p.waitForFunction(() => document.querySelector('dialog.detail')?.open && document.querySelector('.detail__status')?.textContent === '' && document.querySelector('.detail__title')?.textContent, null, { timeout: 20000 }).catch(() => undefined);
      await o.p.waitForTimeout(900);
      return o;
    };
    const sshot = async (p, name) => { const f = `${OUT}/6-spec-${name}.png`; await p.screenshot({ path: f }); shots.push(f); };
    const want5 = ['Platforms', 'Genres', 'Player rating', 'Metacritic'];
    for (const [vpName, vp] of [['1280', { width: 1280, height: 800 }], ['375', { width: 375, height: 667 }], ['320', { width: 320, height: 568 }]]) {
      for (const scheme of ['light', 'dark']) {
        const c = await specPage('celeste', vp, scheme, vp.width < 500 ? { isMobile: true, hasTouch: true } : {});
        const r = await c.p.evaluate(SPEC);
        await sshot(c.p, `celeste-${vpName}-${scheme}`);
        check(r.rows.map((x) => x.label.replace(/s$/, '')).join('|') === ['Platform', 'Genre', 'Player rating', 'Metacritic'].join('|') && r.rows[0].label === 'Platforms' && r.rows[1].label === 'Genres', `Spec celeste ${vpName} ${scheme}: 4 rows in order Platforms, Genres, Player rating, Metacritic`, JSON.stringify(r.rows.map((x) => [x.label, x.text])));
        const rt2 = r.rows[2], mc = r.rows[3];
        check(rt2?.text.includes('4.4 / 5') && Math.abs(parseFloat(rt2.sc?.fill) - 88) < 0.01 && rt2.sc?.hidden === 'true' && rt2.spoken === '4.4 out of 5' && mc?.text.includes('91 / 100') && parseFloat(mc.sc?.fill) === 91 && mc.spoken === '91 out of 100', `Spec celeste ${vpName} ${scheme}: rating 4.4 (fill 88%), Metacritic 91 (fill 91%), decorative bars aria-hidden, spoken text`, JSON.stringify([rt2, mc]));
        check(r.docOver <= 0 && r.dlgOver <= 0 && r.infoOver <= 0 && r.rows.every((x) => !x.ddOver), `Spec celeste ${vpName} ${scheme}: no horizontal scroll (doc ${r.docOver}, dialog ${r.dlgOver}, info ${r.infoOver})`, '');
        if (vp.width <= 375) check(r.stack === 1 && r.rows.every((x) => x.dtX === x.ddX), `Spec celeste ${vpName}: rows stack (label above value, one column)`, `cols ${r.stack}; dtX/ddX ${JSON.stringify(r.rows.map((x) => [x.dtX, x.ddX]))}`);
        else check(r.stack === 2 && r.rows.every((x) => x.ddX === r.rows[0].ddX), `Spec celeste ${vpName}: two columns, values aligned (subgrid)`, `cols ${r.stack}; ddX ${JSON.stringify(r.rows.map((x) => x.ddX))}`);
        await c.ctx.close();
      }
    }
    const w3 = await specPage('the-witcher-3-wild-hunt', { width: 1280, height: 800 }, 'light');
    const rw = await w3.p.evaluate(SPEC); await sshot(w3.p, 'witcher-1280-light');
    check(rw.rows.length === 4 && rw.docOver <= 0 && rw.dlgOver <= 0, 'Spec witcher 1280 light: 4 rows, no horizontal scroll', JSON.stringify(rw.rows.map((x) => [x.label, x.text])));
    await w3.ctx.close();
    for (const vp of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      const e = await specPage('monroe-murders', vp, 'light', vp.width < 500 ? { isMobile: true, hasTouch: true } : {}, '6-spec-empty');
      const r = await e.p.evaluate(SPEC); await sshot(e.p, `norating-${vp.width}`);
      check(r.rows.map((x) => x.label).join('|') === 'Platform|Genres' && r.docOver <= 0 && r.dlgOver <= 0, `Spec game with no rating/metacritic (${vp.width}): only Platform + Genres rows, no empty rows`, JSON.stringify(r.rows.map((x) => [x.label, x.text])));
      await e.ctx.close();
    }
    // no data at all: the dl vanishes without a gap (:empty -> display none, height 0)
    const none = await specPage('x-none', { width: 1280, height: 800 }, 'light', {}, '6-spec-none', (pg) => pg.route('**/api/game?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'No Data', description: 'Just a description.', released: '2020-01-01', trailer: null, screenshots: [], platforms: [], genres: [], rating: 0, metacritic: null }) })));
    const rn = await none.p.evaluate(SPEC); await sshot(none.p, 'nodata-1280');
    const gapN = await none.p.evaluate(() => { const i = document.querySelector('.detail__info'); const g = getComputedStyle(i); return { dl: !!document.querySelector('dl.detail__specs'), disp: getComputedStyle(document.querySelector('dl.detail__specs') ?? i).display, gap: g.rowGap }; });
    check(rn.rows.length === 0 && rn.dlDisp === 'none' && rn.dlH === 0 && rn.title === 'No Data', 'Spec with no data at all (rating 0, metacritic null, empty lists): no rows, dl display:none, height 0', JSON.stringify({ rows: rn.rows.length, disp: rn.dlDisp, h: rn.dlH, gapN }));
    await none.ctx.close();
    // rating-only partial + clamping (rating 7 -> 5.0, metacritic 150.4 -> 100, rating 4 -> "4.0")
    const part = await specPage('x-part', { width: 1280, height: 800 }, 'light', {}, '6-spec-part', (pg) => pg.route('**/api/game?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Part', description: 'x', released: null, trailer: null, screenshots: [], platforms: ['PC'], genres: [], rating: 4, metacritic: 150.4 }) })));
    const rp = await part.p.evaluate(SPEC);
    check(rp.rows.map((x) => x.label).join('|') === 'Platform|Player rating' && rp.rows[1].text.includes('4.0 / 5'), 'Spec formatting: singular "Platform", rating 4 -> "4.0 / 5", metacritic 150.4 (out of range) = no row, empty genres row omitted', JSON.stringify(rp.rows.map((x) => [x.label, x.text])));
    await part.ctx.close();
    // 8 platforms at 320x568 (worst case), light + dark, mobile
    const PLAT8 = ['PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series S/X', 'Xbox One', 'Nintendo Switch', 'macOS', 'Linux'];
    for (const scheme of ['light', 'dark']) {
      const b = await specPage('x-8plat', { width: 320, height: 568 }, scheme, { isMobile: true, hasTouch: true }, '6-spec-8plat', (pg) => pg.route('**/api/game?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Eight Platforms Test', description: 'A description.', released: '2021-03-04', trailer: null, screenshots: [], platforms: PLAT8, genres: ['Action', 'Adventure', 'RPG', 'Indie', 'Platformer'], rating: 3.7, metacritic: 74 }) })));
      const r = await b.p.evaluate(SPEC); await sshot(b.p, `8plat-320-${scheme}`);
      check(r.rows.length === 4 && r.rows[0].text === PLAT8.join(', ') && r.docOver <= 0 && r.dlgOver <= 0 && r.infoOver <= 0 && r.rows.every((x) => !x.ddOver), `Spec 8 platforms 320x568 ${scheme}: all 8 names present, no horizontal overflow`, `dl height ${r.dlH}px; overflow doc ${r.docOver} dlg ${r.dlgOver} info ${r.infoOver}`);
      const reach = await b.p.evaluate(async () => { const s = document.querySelector('.detail__specs'); s.scrollIntoView({ block: 'end' }); await new Promise((r) => setTimeout(r, 300)); const bt = s.getBoundingClientRect().bottom; return { bottom: bt, vh: innerHeight }; });
      check(reach.bottom <= reach.vh + 1, `Spec 8 platforms 320x568 ${scheme}: the sheet can be scrolled fully into view`, `bottom ${Math.round(reach.bottom)}px of ${reach.vh}`);
      await b.ctx.close();
    }
    // reduced motion: no animation on the sheet's spec rows
    const rm = await specPage('celeste', { width: 1280, height: 800 }, 'light', { reducedMotion: 'reduce' }, '6-spec-rm');
    const arm = await rm.p.evaluate(() => ({ anims: [...document.querySelectorAll('.detail__specs, .detail__specs *')].flatMap((e) => e.getAnimations()).length, rows: document.querySelectorAll('.detail__spec').length }));
    await sshot(rm.p, 'celeste-reduced-1280');
    check(arm.rows === 4 && arm.anims === 0, 'Spec with prefers-reduced-motion: 4 rows, no running animations/transitions on the sheet', JSON.stringify(arm));
    await rm.ctx.close();
    // forced colors: bars hidden, text still carries the data and is visible
    for (const vp of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
      const fc = await specPage('celeste', vp, 'light', { forcedColors: 'active', ...(vp.width < 500 ? { isMobile: true, hasTouch: true } : {}) }, '6-spec-fc');
      const r = await fc.p.evaluate(SPEC); await sshot(fc.p, `celeste-forced-${vp.width}`);
      const fcm = await fc.p.evaluate(() => matchMedia('(forced-colors: active)').matches);
      check(fcm && r.rows.length === 4 && r.rows.filter((x) => x.sc).every((x) => x.sc.disp === 'none') && r.rows.every((x) => x.text.length > 0) && r.docOver <= 0 && r.dlgOver <= 0, `Spec forced-colors (${vp.width}): media matches, scale bars display:none, values still in text, no horizontal scroll`, JSON.stringify({ fcm, bars: r.rows.map((x) => x.sc?.disp), texts: r.rows.map((x) => x.text) }));
      await fc.ctx.close();
    }
  }

  // ================= 5. States via the real client with routed /api (busy dim, replace, error keeps, no-results hides) =================
  if (want('states')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, { url: `${BASE}/?t=9500&noblink`, tag: '5-states' });
    await p.route('**/media.rawg.io/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }));
    const A = MOCK_GAMES.slice(0, 20);
    const B = [...MOCK_GAMES].reverse();
    let mode = { kind: 'results', games: A, delay: 0 };
    const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await p.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (mode.delay) await sleep(mode.delay);
      if (path.endsWith('interpret')) {
        if (mode.kind === 'offtopic') return route.fulfill(json(200, { ok: false, reason: 'off_topic' }));
        if (mode.kind === 'error') return route.fulfill(json(503, { ok: false }));
        return route.fulfill(json(200, { ok: true, summary: 'co-op adventure', genres: ['adventure'], tags: ['co-op'], platforms: [], examples: [] }));
      }
      return route.fulfill(json(200, { games: mode.kind === 'empty' ? [] : mode.games }));
    });
    await waitIntro(p);
    const go = async (text) => { await p.fill('#feeling', text); await p.press('#feeling', 'Enter'); };
    const snapShelf = () => p.evaluate(() => { const s = document.querySelector('.shelf'), rows = s.querySelectorAll('.shelf__row'), row = rows[0]; return { hidden: s.hidden, display: getComputedStyle(s).display, busy: s.getAttribute('aria-busy'), rows: rows.length, opacity: row ? Number(getComputedStyle(row).opacity) : null, first: row?.querySelector('a.case')?.getAttribute('href'), scrollLeft: row?.scrollLeft, n: row?.children.length, state: document.querySelector('#app').dataset.state, tag: row ? (row.__mark ?? null) : null, inert: row ? row.inert : null, stops: row ? [...row.querySelectorAll('.case')].map((c, i) => (c.tabIndex === 0 ? i : null)).filter((x) => x !== null) : null }; });
    // a) first search
    await go('cozy a');
    await waitState(p, 'results'); await settle(p);
    let s = await snapShelf();
    check(!s.hidden && s.rows === 1 && s.n === 20 && s.busy === 'false' && s.first === `?game=${A[0].slug}`, 'States: first search shows one row of 20 cases, aria-busy=false', JSON.stringify(s));
    check(JSON.stringify(s.stops) === '[0]' && s.inert === false, 'States: first row has a single Tab stop (case 1) and is not inert', `stops ${JSON.stringify(s.stops)}, inert ${s.inert}`);
    // move the stop to case 6 (like a user who browsed): after the next search it must go back to case 1
    await p.focus('.shelf__row li:nth-child(6) a.case');
    await p.evaluate(() => { const r = document.querySelector('.shelf__row'); r.__mark = 'old'; r.scrollLeft = 900; });
    await p.waitForTimeout(150);
    const sl = await p.evaluate(() => document.querySelector('.shelf__row').scrollLeft);
    check(sl > 0, 'States: the row was scrolled before the next search (precondition)', `scrollLeft ${sl}`);
    // b) second search: dimmed while thinking, replaced after
    mode = { kind: 'results', games: B, delay: 1800 };
    await go('cozy b');
    await waitState(p, 'thinking');
    await p.waitForTimeout(900);
    s = await snapShelf();
    check(s.busy === 'true' && Math.abs(s.opacity - 0.45) <= 0.03 && s.rows === 1 && s.first === `?game=${A[0].slug}`, 'Thinking: section aria-busy="true" and the previous row is dimmed to 0.45 (still the old row)', `aria-busy ${s.busy}, row opacity ${s.opacity}, rows ${s.rows}, first ${s.first}`);
    check(s.inert === true, 'Thinking: the dimmed row is inert (no click, no focus)', `row.inert ${s.inert}`);
    const probe = await p.evaluate(() => { const c = document.querySelectorAll('.shelf__row .case')[2]; c.focus(); return { focusedInRow: !!document.activeElement.closest?.('.shelf__row') }; });
    check(!probe.focusedInRow, 'Thinking: focus() on a case of the inert row does not take the focus', JSON.stringify(probe));
    await shot(p, 'busy-dimmed', '1440-light');
    await waitState(p, 'results'); await p.waitForFunction((slug) => document.querySelector('.shelf__row a.case')?.getAttribute('href') === `?game=${slug}`, B[0].slug, { timeout: 8000 }).catch(() => undefined);
    await settle(p);
    s = await snapShelf();
    check(s.inert === false && JSON.stringify(s.stops) === '[0]', 'After the new search: the new row is not inert and has ONE Tab stop, the 1st case (the old stop on case 6 did not survive)', `inert ${s.inert}, stops ${JSON.stringify(s.stops)}`);
    check(s.rows === 1 && s.tag === null && s.first === `?game=${B[0].slug}` && s.busy === 'false' && s.scrollLeft === 0 && s.opacity === 1, 'After the new search: a single (new) row replaced the old one, aria-busy=false, scrollLeft 0, opacity 1', JSON.stringify(s));
    // c) error keeps the row
    await p.evaluate(() => { document.querySelector('.shelf__row').__mark = 'keep'; });
    mode = { kind: 'error', games: B, delay: 0 };
    await go('cozy c');
    await waitState(p, 'error'); await settle(p);
    s = await snapShelf();
    check(s.state === 'error' && !s.hidden && s.rows === 1 && s.tag === 'keep' && s.first === `?game=${B[0].slug}` && s.busy === 'false' && s.opacity === 1 && s.inert === false, 'Error after results: the previous row stays (same element), not dimmed, aria-busy=false', JSON.stringify(s));
    await shot(p, 'error-keeps-row', '1440-light');
    // d) no-results hides the section
    mode = { kind: 'empty', games: [], delay: 0 };
    await go('cozy d');
    await waitState(p, 'no-results'); await settle(p);
    s = await snapShelf();
    check(s.hidden && s.display === 'none' && s.rows === 0, 'no-results (empty games): section.shelf[hidden], display none, no row left', JSON.stringify(s));
    // e) results again, then off-topic
    mode = { kind: 'results', games: A, delay: 0 };
    await go('cozy e');
    await waitState(p, 'results'); await settle(p);
    s = await snapShelf();
    check(!s.hidden && s.rows === 1 && s.n === 20, 'After no-results a new search brings the section back with one row', JSON.stringify(s));
    mode = { kind: 'offtopic', games: A, delay: 0 };
    await go('what is the capital of france');
    await waitState(p, 'no-results'); await settle(p);
    s = await snapShelf();
    check(s.hidden && s.display === 'none' && s.rows === 0, 'off_topic: section hidden and the row removed', JSON.stringify(s));
    await ctx.close();
  }

  // ================= 6. Performance: 20 cases, mouse sweep + row scroll, LIVE WebGL background (no ?t=), 3 takes =================
  if (want('perf')) {
    for (const [vp, dpr, mobile] of [[{ width: 1440, height: 900 }, 1, false], [{ width: 390, height: 844 }, 3, true]]) {
      for (let take = 1; take <= 3; take++) {
        const { ctx, p } = await open({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, colorScheme: 'light' }, { url: `${BASE}/?noblink&mock=results`, tag: `5-perf-${vp.width}-${take}` });
        await toResults(p);
        await p.waitForFunction(() => [...document.querySelectorAll('.case__art')].slice(0, 3).every((i) => i.complete), null, { timeout: 20000 }).catch(() => undefined);
        await p.waitForTimeout(500);
        await p.evaluate(() => { window.__fr = []; let last = 0; const tick = (now) => { if (last) window.__fr.push(now - last); last = now; if (!window.__frStop) requestAnimationFrame(tick); }; window.__frStop = false; requestAnimationFrame(tick); });
        const rowY = await p.evaluate(() => { const r = document.querySelector('.shelf__row').getBoundingClientRect(); return r.top + r.height / 2; });
        for (let i = 0; i < 80; i++) {
          const x = 20 + ((i * 37) % (vp.width - 40)), jitter = (i % 2) * 40 - 20;
          await p.mouse.move(x, rowY + jitter);
          if (i === 40) await p.evaluate(() => document.querySelector('.shelf__row').scrollBy({ left: 600, behavior: 'instant' }));
          await p.waitForTimeout(50);
        }
        const fr = await p.evaluate(() => { window.__frStop = true; return window.__fr; });
        const sorted = [...fr].sort((x, y) => x - y), q = (k) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * k))];
        const long = fr.filter((x) => x > 33.4).length;
        check(fr.length > 120 && q(0.95) <= 17 && long <= 2, `[${vp.width}@${dpr}x take ${take}/3] performance (live background): p95 <= 17 ms and frames > 33 ms <= 2`, `${fr.length} frames; p50 ${q(0.5).toFixed(1)} ms, p95 ${q(0.95).toFixed(1)} ms, p99 ${q(0.99).toFixed(1)} ms, max ${sorted.at(-1).toFixed(1)} ms; frames > 33 ms: ${long}`);
        await ctx.close();
      }
    }
  }

  // ================= 6b. Title contrast over WHITE covers (DESIGN §15.6: 15.9:1; hard minimum 4.5) =================
  if (want('contrast')) {
    const WHITE = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#fff"/></svg>';
    const vps = [{ w: 1440, h: 900, dpr: 1 }, { w: 390, h: 844, dpr: 2, mobile: true }, { w: 1280, h: 600, dpr: 1 }];
    for (const c of vps) {
      const { ctx, p } = await open({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr, isMobile: !!c.mobile, hasTouch: !!c.mobile, colorScheme: 'light', reducedMotion: 'reduce' }, { url: URL_RES(), tag: `5-contrast-${c.w}` });
      await p.route('**/media.rawg.io/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: WHITE }));
      await toResults(p);
      await p.waitForFunction(() => [...document.querySelectorAll('.case__art')].slice(0, 4).every((i) => i.complete), null, { timeout: 15000 }).catch(() => undefined);
      const q = await ctx.newPage();
      await q.goto('about:blank');
      const res = [];
      for (const lines of [1, 2, 3]) {
        const idx = lines - 1;
        // force the title to N lines; hide the glyphs (and any text-shadow) so only the plate under them is left
        const inf = await p.evaluate(([idx, lines]) => {
          const cs = [...document.querySelectorAll('.shelf__row .case')], cse = cs[idx], name = cse.querySelector('.case__name'), title = cse.querySelector('.case__title');
          const count = () => { const r = document.createRange(); r.selectNodeContents(name); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
          let t = 'Wm', guard = 0;
          name.textContent = t;
          while (count() < lines && guard++ < 60) { t += ' Wondrous'; name.textContent = t; }
          cse.scrollIntoView({ behavior: 'instant', inline: 'start', block: 'nearest' });
          title.style.setProperty('color', 'transparent', 'important'); title.style.setProperty('text-shadow', 'none', 'important'); name.style.setProperty('text-shadow', 'none', 'important');
          const rr = document.createRange(); rr.selectNodeContents(name);
          const rects = [...rr.getClientRects()], L = Math.min(...rects.map((x) => x.left)), T = Math.min(...rects.map((x) => x.top)), R = Math.max(...rects.map((x) => x.right)), B = Math.max(...rects.map((x) => x.bottom));
          const cb = cse.getBoundingClientRect();
          return { lines: count(), box: { x: L, y: T, width: R - L, height: B - T }, whole: cb.left >= 0 && cb.right <= innerWidth, artOk: cse.querySelector('.case__art').naturalWidth > 0 && !cse.classList.contains('case--noimg') };
        }, [idx, lines]);
        await p.waitForTimeout(150);
        const png = (await p.screenshot({ clip: inf.box })).toString('base64');
        const lum = await q.evaluate(async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, cv.width, cv.height).data; let max = 0;
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          for (let i = 0; i < d.length; i += 4) { const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (L > max) max = L; }
          return max;
        }, png);
        res.push({ lines: inf.lines, want: lines, ratio: 1.05 / (lum + 0.05), whole: inf.whole, artOk: inf.artOk });
      }
      await q.close();
      const worst = Math.min(...res.map((r) => r.ratio));
      check(res.every((r) => r.lines === r.want && r.artOk && r.whole) && worst >= 15.7, `[${c.w}x${c.h}] title contrast over a white cover, 1/2/3 lines: lightest plate pixel vs white text >= 15.7:1 (DESIGN 15.6 says 15.9; 0.2 of slack for 8-bit pixel quantisation; WCAG AA needs 4.5)`, res.map((r) => `${r.want}L(${r.lines} real, art ${r.artOk}, whole ${r.whole}) ${r.ratio.toFixed(1)}:1`).join(' | ') + ` => worst ${worst.toFixed(1)}:1`);
      await ctx.close();
    }
  }

  // ================= 7. Theme: the case is a printed object (same colours in both themes), rim differs; toggle =================
  if (want('theme')) {
    const read = async (scheme, toggle) => {
      const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: scheme === 'dark' && toggle ? 'light' : scheme, reducedMotion: 'reduce' }, { url: URL_RES(), tag: `5-theme-${scheme}${toggle ? '-toggle' : ''}` });
      await toResults(p);
      if (toggle) { await p.click('.theme-toggle'); await p.waitForTimeout(400); }
      const r = await p.evaluate(() => { const c = document.querySelector('.shelf__row .case'); const cs = (e) => getComputedStyle(e); return { theme: document.documentElement.dataset.theme ?? null, band: cs(c.querySelector('.case__band')).backgroundColor, title: cs(c.querySelector('.case__title')).color, year: cs(c.querySelector('.case__year')).color, plastic: cs(c).backgroundImage + cs(c).backgroundColor, rim: cs(c).boxShadow, sheen: cs(c, '::after').backgroundImage, scrim: cs(c.querySelector('.case__cover'), '::after').backgroundImage }; });
      if (toggle) { await shot(p, 'results-toggle', '1440-dark'); }
      await ctx.close();
      return r;
    };
    const L = await read('light'), D = await read('dark'), T = await read('dark', true);
    const same = ['band', 'title', 'year', 'plastic', 'sheen', 'scrim'].filter((k) => L[k] === D[k]);
    check(same.length === 6, 'Theme: the printed parts of a case (band, title, year, plastic, sheen, scrim) have identical colours in light and dark', `same: [${same}]; different: [${['band', 'title', 'year', 'plastic', 'sheen', 'scrim'].filter((k) => L[k] !== D[k])}]`);
    check(L.rim !== D.rim, 'Theme: only the rim/shadow separating the case from the background changes with the theme', `light "${L.rim.slice(0, 60)}" / dark "${D.rim.slice(0, 60)}"`);
    check(T.theme === 'dark' && T.rim === D.rim && T.band === D.band, 'Theme toggle: clicking the toggle gives the same dark case as the dark colour scheme', `data-theme ${T.theme}`);
  }

  // ================= 8. Production build: no mock games, no test URLs =================
  if (want('build')) {
    const dir = 'dist/assets';
    const all = await readdir(dir).catch(() => []);
    const text = (await Promise.all(all.filter((f) => /\.(js|css)$/.test(f)).map((f) => readFile(join(dir, f), 'utf8')))).join('\n') + (await readFile('dist/index.html', 'utf8').catch(() => ''));
    const needles = ['mock-games', 'MOCK_GAMES', 'gf-missing-cover', 'sky-light-awaits', 'cozy-grove', 'snufkin', 'cb14d42b58bdb6cf5948d0eed778c2f0', 'example.invalid', 'media.rawg.io/media/games', 'media.rawg.io/media/screenshots', '--shelf-block', 'MOCKS', 'mockFinder', '[api]', 'dev/mock'];
    const hits = needles.filter((k) => text.includes(k));
    check(all.length > 0 && hits.length === 0, 'Build: dist (JS, CSS, HTML) has no mock/MOCKS/mockFinder/mock-games/"[api]", no test game data, no test image URLs and no --shelf-block', `${all.length} asset(s), ${(text.length / 1024).toFixed(1)} KB scanned; hits: [${hits}]`);
    check(text.includes('resize') && text.includes('shelf__row'), 'Build: the RAWG resize helper (rawgImage) and the shelf code are in the bundle (control: the scan above can see real code)', `contains "resize": ${text.includes('resize')}, "shelf__row": ${text.includes('shelf__row')}`);
    const src = await Promise.all((await readdir('src/styles')).map((f) => readFile(join('src/styles', f), 'utf8')));
    check(!src.some((c) => c.includes('--shelf-block')), 'Source: no CSS file references the removed --shelf-block token', 'src/styles/*.css scanned');
  }

  if (shots.length) lines.push(`5 shots (${shots.length}): ${OUT}/5-results-{1440x900,1280x600,390x844,375x667,844x390}-{light,dark}.png, 5-results-{1280x800,320x568}-light.png, 5-hover-tilt-1440-light.png, 5-focus-{first,seventh}-1440-light.png, 5-busy-dimmed-1440-light.png, 5-error-keeps-row-1440-light.png, 5-noimg-case-1440-light.png, 5-results-toggle-1440-dark.png`);
  info('Expected 404s of the broken mock image seen by the strict watcher', `${seen404.length} (all on /gf-missing-cover.jpg; anything else is reported as an error)`);
}

// ---------------- standalone ----------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const BASE = process.env.VERIFY_URL || 'http://localhost:5173';
  const errors = [], lines = [];
  const check = (ok, label, detail, errMsg) => { if (!ok) errors.push(`${errMsg ?? label}: ${detail}`); lines.push(`${label}: ${detail} ${ok ? 'OK' : 'FAIL'}`); };
  const info = (label, detail) => lines.push(`${label}: ${detail} (info)`);
  const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', args: ARGS }).catch(() => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ARGS }));
  try {
    await runResults({ browser, BASE, OUT: 'verify-shots', errors, lines, check, info, content: contentDefault });
  } finally { await browser.close(); }
  console.log(lines.join('\n'));
  if (errors.length) { console.error(`\n${errors.length} error(s):\n${errors.join('\n')}`); process.exit(1); }
  console.log('\nverify-results: OK, 0 errors');
}
