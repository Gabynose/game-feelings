// Checks for "Start over" (the compact Chao restores the intro) and the game box without disc/spine (SPEC §16, DESIGN §18).
//   VERIFY_URL=http://localhost:5176 [VERIFY_OUT=dir] [VERIFY_ONLY=boxes,roles,keyboard,motion,touch,hit,cases,real] node scripts/verify-restart.mjs
// Needs the dev server (mock=... is DEV only; "real" uses /api with the keys from .env.local, never printed).
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { isExpected404 } from './verify-results.mjs';
import { content } from '../src/content.ts';

const BASE = process.env.VERIFY_URL || 'http://localhost:5176';
const OUT = process.env.VERIFY_OUT || 'verify-shots';
const only = process.env.VERIFY_ONLY ? process.env.VERIFY_ONLY.split(',') : null;
const want = (s) => !only || only.includes(s);
const n = content.narrator, LABEL = content.character.restart, ALT = content.character.alt;
const errors = [], lines = [], shots = [];
const watch = (page, tag) => {
  page.on('console', (m) => m.type() === 'error' && !(/status of 404/.test(m.text()) && isExpected404(m.location().url)) && errors.push(`[${tag}] console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${tag}] request failed: ${r.url().split('?')[0]} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && !(r.status() === 404 && isExpected404(r.url())) && !/rawg\.io|steamstatic/.test(r.url()) && errors.push(`[${tag}] HTTP ${r.status()}: ${new URL(r.url()).pathname}`));
};
const check = (ok, label, detail) => { if (!ok) errors.push(`${label}: ${detail}`); lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}: ${detail}`); };
const info = (label, detail) => lines.push(`INFO ${label}: ${detail}`);
await mkdir(OUT, { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ channel: 'chrome', args: ARGS }).catch(() => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ARGS }));

// ---------- helpers ----------
const open = async (opts, query, tag) => {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { // records the animations the page starts (props + duration + first keyframe)
    window.__anim = [];
    const a = Element.prototype.animate;
    Element.prototype.animate = function (kf, o) { window.__anim.push({ t: performance.now(), cls: String(this.className), props: Object.keys((Array.isArray(kf) ? kf[0] : kf) ?? {}), dur: typeof o === 'number' ? o : o?.duration, first: Array.isArray(kf) ? kf[0] : null }); return a.call(this, kf, o); };
  });
  const p = await ctx.newPage();
  watch(p, tag);
  await p.goto(`${BASE}/?t=9500${query}`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p };
};
// state/layout reached, line fully typed, no finite animation still running
const settled = (p, state, layout, timeout = 30000) => p.waitForFunction(([s, l]) => {
  const a = document.querySelector('#app'), f = document.querySelector('form.feeling');
  return a?.dataset.state === s && a.dataset.layout === l && !f.hasAttribute('data-hidden') && document.querySelector('.bubble__spoken').textContent
    && document.querySelector('.bubble__pending').textContent === '' && document.querySelector('.bubble__typed').textContent === document.querySelector('.bubble__spoken').textContent
    && !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity && !String(x.effect?.target?.className).includes('holo'));
}, [state, layout], { timeout });
const intro = async (p) => { await settled(p, 'intro', 'full', 40000); await p.waitForTimeout(250); };
const BOX = `(() => {
  const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; };
  return { title: r('.screen__title'), narrator: r('.narrator'), chao: r('.narrator .chao'), form: r('form.feeling'), bubble: r('#narrator-line') };
})()`;
const boxes = (p) => p.evaluate(BOX);
const diff = (a, b) => Object.entries(a).flatMap(([k, x]) => Object.entries(x).map(([d, v]) => [`${k}.${d}`, Math.abs(v - b[k][d])])).filter(([, d]) => d > 2);
const snap = (p) => p.evaluate(() => {
  const c = document.querySelector('.narrator .chao'), a = document.querySelector('#app');
  return { state: a.dataset.state, layout: a.dataset.layout, role: c.getAttribute('role'), tab: c.getAttribute('tabindex'), label: c.getAttribute('aria-label'), title: c.getAttribute('title'), dis: c.getAttribute('aria-disabled'), cursor: getComputedStyle(c).cursor };
});
const isBtn = (s) => s.layout === 'compact' && s.state !== 'detail';
const roleOk = (s) => isBtn(s)
  ? s.role === 'button' && s.tab === '0' && s.label === LABEL && s.title === LABEL && (s.state === 'thinking' ? s.dis === 'true' && s.cursor === 'progress' : s.dis === null && s.cursor === 'pointer')
  : s.role === 'img' && s.tab === null && s.label === ALT && s.title === null && s.dis === null;
const shot = async (p, name) => { const f = `${OUT}/restart-${name}.png`; await p.screenshot({ path: f }); shots.push(f); };
const center = (p) => p.evaluate(() => { const b = document.querySelector('.narrator .chao').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
const clickChao = async (p) => { const c = await center(p); await p.mouse.click(c.x, c.y); };
const search = async (p, text, state = 'results') => { await p.focus('#feeling'); await p.fill('#feeling', ''); await p.keyboard.type(text); await p.keyboard.press('Enter'); await settled(p, state, 'compact', 40000); await p.waitForTimeout(300); };
const VPS = [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 1280, height: 800 }];
const TEXT = 'co-op de aventura';

// ================= 1. Bounding boxes: intro vs after reset (+ input text, line, shelf, mood, focus), 3 sizes x 2 themes =================
if (want('boxes')) {
  for (const vp of VPS) for (const scheme of ['light', 'dark']) {
    const tag = `${vp.width}x${vp.height}-${scheme}`;
    const { ctx, p } = await open({ viewport: vp, colorScheme: scheme }, '&mock=results', `boxes-${tag}`);
    await intro(p);
    const ref = await boxes(p);
    await shot(p, `intro-${tag}`);
    await search(p, TEXT);
    await shot(p, `compact-${tag}`);
    const cmp = await boxes(p);
    check(diff(ref, cmp).length > 0 && (await p.evaluate(() => document.querySelectorAll('ul.shelf__row a.case').length)) >= 5, `[${tag}] precondition: results are compact (boxes differ from the intro, >= 5 cases)`, `moved: ${diff(ref, cmp).slice(0, 3).map(([k, d]) => `${k} ${d.toFixed(0)}`).join(', ')}`);
    await clickChao(p);
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const after = await boxes(p);
    const d = diff(ref, after);
    check(d.length === 0, `[${tag}] Click on the Chao: title/narrator/Chao/bubble/form boxes equal the intro (tolerance 2 px)`, d.length ? d.map(([k, v]) => `${k} off ${v.toFixed(1)}`).join(', ') : 'all 5 boxes within 2 px');
    const st = await p.evaluate(() => {
      const sh = document.querySelector('.shelf'), cs = sh ? getComputedStyle(sh) : null;
      const cases = [...document.querySelectorAll('.case')].filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(c).visibility !== 'hidden'; });
      return { value: document.querySelector('#feeling').value, line: document.querySelector('.bubble__spoken').textContent, mood: document.querySelector('.narrator .chao').dataset.mood,
        cases: cases.length, shelfHidden: !sh || sh.hidden || cs.display === 'none', invalid: document.querySelector('#feeling').getAttribute('aria-invalid'), active: document.activeElement?.id, sw: document.documentElement.scrollWidth, iw: innerWidth, game: location.search };
    });
    check(st.value === TEXT, `[${tag}] The input keeps its text`, `"${st.value}"`);
    check(st.line === n.intro && st.mood === 'idle', `[${tag}] The Chao says the intro line with mood idle`, `"${st.line}", mood ${st.mood}`);
    check(st.cases === 0, `[${tag}] The row is gone (0 visible cases)`, `${st.cases} visible cases, shelf hidden/absent: ${st.shelfHidden}`);
    check(st.active === 'feeling', `[${tag}] Mouse click with a fine pointer leaves the focus in the input`, `active: ${st.active}`);
    check(st.sw <= st.iw && st.invalid === null && st.game === '?t=9500&mock=results', `[${tag}] No horizontal overflow, no aria-invalid, URL untouched`, `scrollWidth ${st.sw}/${st.iw}, query ${st.game}`);
    await shot(p, `reset-${tag}`);
    // a new search after the reset compacts again, like the first time
    await p.keyboard.press('Enter');
    await settled(p, 'results', 'compact', 40000);
    const again = await p.evaluate(() => ({ cases: document.querySelectorAll('ul.shelf__row a.case').length, role: document.querySelector('.narrator .chao').getAttribute('role') }));
    const d2 = diff(cmp, await boxes(p));
    check(again.cases >= 5 && again.role === 'button' && d2.length === 0, `[${tag}] New search after the reset: compact again, same boxes as the first time, Chao is a button`, `${again.cases} cases, role ${again.role}, off: ${d2.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ') || 'none'}`);
    await ctx.close();
  }
}

// ================= 2. ARIA by state, thinking = nothing, detail = nothing =================
if (want('roles')) {
  const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, colorScheme: 'light' }, '&mock=results', 'roles');
  await intro(p);
  const rows = [];
  const probe = async (name) => { const s = await snap(p); rows.push(`${name}[${s.state}/${s.layout}] ${s.role}`); check(roleOk(s), `ARIA ${name} (${s.state}/${s.layout}): ${isBtn(s) ? 'button' : 'img'}`, JSON.stringify(s)); return s; };
  await probe('intro');
  await p.focus('#feeling'); await p.keyboard.type('c');
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'typing');
  await probe('typing full');
  await p.fill('#feeling', ''); await p.evaluate(() => document.querySelector('#feeling').dispatchEvent(new Event('input')));
  await p.focus('#feeling'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'empty-input');
  await probe('empty-input full');
  await p.keyboard.type(TEXT); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'thinking');
  await probe('thinking full');
  await settled(p, 'results', 'compact', 40000);
  await probe('results');
  // typing in compact: still a button
  await p.focus('#feeling'); await p.keyboard.press('End'); await p.keyboard.type('x');
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'typing');
  await probe('typing compact');
  // empty-input in compact
  await p.fill('#feeling', ''); await p.focus('#feeling'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'empty-input');
  await probe('empty-input compact');
  // thinking in compact: aria-disabled, progress, click does nothing
  await p.keyboard.type(TEXT); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'thinking');
  const th = await probe('thinking compact');
  await clickChao(p);
  await p.locator('.narrator .chao').focus();
  await p.keyboard.press('Enter'); await p.keyboard.press('Space');
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => ({ s: document.querySelector('#app').dataset.state, l: document.querySelector('#app').dataset.layout, v: document.querySelector('#feeling').value, line: document.querySelector('.bubble__spoken').textContent }));
  check(th.dis === 'true' && after.s === 'thinking' && after.l === 'compact' && after.v === TEXT, 'Thinking (compact): click, Enter and Space on the Chao do nothing (still thinking/compact, input unchanged)', JSON.stringify(after));
  await settled(p, 'results', 'compact', 40000);
  const back = await probe('results after thinking');
  check(back.dis === null && back.cursor === 'pointer', 'Thinking ended: aria-disabled removed, cursor pointer again', JSON.stringify(back));
  // detail
  await p.locator('ul.shelf__row a.case').first().click();
  await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'detail', null, { timeout: 8000 });
  await p.waitForTimeout(700);
  const dt = await probe('detail');
  await shot(p, 'detail-375-light');
  const before = await p.evaluate(() => document.querySelector('#app').dataset.state);
  await p.evaluate(() => { const c = document.querySelector('.narrator .chao'); c.click(); c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); c.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
  await p.waitForTimeout(250);
  const stillDetail = await p.evaluate(() => ({ s: document.querySelector('#app').dataset.state, l: document.querySelector('#app').dataset.layout, open: document.querySelector('dialog.detail')?.open, q: location.search }));
  check(before === 'detail' && stillDetail.s === 'detail' && stillDetail.l === 'compact' && stillDetail.open && /game=/.test(stillDetail.q) && dt.role === 'img', 'Detail: synthetic click/Enter/Space on the Chao do nothing (panel open, state detail, layout compact, ?game= kept)', JSON.stringify(stillDetail));
  await p.keyboard.press('Escape');
  await settled(p, 'results', 'compact', 10000);
  const closed = await probe('results after closing detail');
  const shelf = await p.evaluate(() => document.querySelectorAll('ul.shelf__row a.case').length);
  check(closed.role === 'button' && shelf >= 5, 'Closing the detail returns to results/compact (no reset), row intact, Chao a button again', `role ${closed.role}, ${shelf} cases`);
  info('ARIA sequence', rows.join(' | '));
  await ctx.close();
  // the other compact outcomes (no-results, off-topic, error) are buttons and reset
  for (const [mock, state] of [['empty', 'no-results'], ['offtopic', 'no-results'], ['error', 'error'], ['rate', 'error']]) {
    const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, colorScheme: 'dark' }, `&mock=${mock}`, `roles-${mock}`);
    await intro(p);
    const ref = await boxes(p);
    await search(p, TEXT, state);
    const s = await snap(p);
    check(roleOk(s) && s.role === 'button', `ARIA ${mock} (${s.state}/${s.layout}): button`, JSON.stringify(s));
    await shot(p, `${mock}-375-dark`);
    await clickChao(p);
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const d = diff(ref, await boxes(p));
    const v = await p.evaluate(() => document.querySelector('#feeling').value);
    check(d.length === 0 && v === TEXT, `Reset from ${mock}: boxes equal the intro, input keeps its text`, `${d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok'}; value "${v}"`);
    await ctx.close();
  }
  // reset from typing (compact)
  {
    const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, colorScheme: 'light' }, '&mock=results', 'roles-typing-reset');
    await intro(p);
    const ref = await boxes(p);
    await search(p, TEXT);
    await p.focus('#feeling'); await p.keyboard.press('End'); await p.keyboard.type('!');
    await settled(p, 'typing', 'compact');
    await clickChao(p);
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const d = diff(ref, await boxes(p)), v = await p.evaluate(() => document.querySelector('#feeling').value);
    check(d.length === 0 && v === `${TEXT}!`, 'Reset from typing (compact): intro boxes and the edited text is kept', `${d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok'}; value "${v}"`);
    // reset while the forward FLIP is still running
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, colorScheme: 'light' }, '&mock=results', 'roles-midflip');
    await intro(p);
    const ref = await boxes(p);
    await p.focus('#feeling'); await p.keyboard.type(TEXT); await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelector('#app').dataset.layout === 'compact', null, { timeout: 40000 });
    await p.waitForTimeout(120); // mid-FLIP (480 ms)
    const running = await p.evaluate(() => document.querySelector('.screen__title').getAnimations().length);
    // same task: boxes right before and right after the click (the reverse FLIP starts at t=0 from the visual pose)
    const pair = await p.evaluate((src) => { const box = () => eval(src); const before = box(); document.querySelector('.narrator .chao').click(); return [before, box()]; }, BOX);
    const { bubble: _b0, ...b0 } = pair[0], { bubble: _b1, ...b1 } = pair[1];
    // the title wraps differently and the narrator is anchored at its bottom (its top is headroom): compare title l/t/w, narrator bottom, Chao and form
    const jump = diff(b0, b1).filter(([k]) => !['title.h', 'narrator.t', 'narrator.h'].includes(k));
    if (Math.abs(b0.narrator.t + b0.narrator.h - b1.narrator.t - b1.narrator.h) > 2) jump.push(['narrator.bottom', 0]);
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const d = diff(ref, await boxes(p));
    check(d.length === 0 && jump.length === 0, 'Click during the forward FLIP: no jump on the click frame (<= 2 px) and lands on the intro boxes without leftover transform', `jump ${jump.map(([k, x]) => k + " " + x.toFixed(1)).join(', ') || 'none'}; ${running} animation(s) on the title when clicked; ${d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok'}`);
    await ctx.close();
  }
}

// ================= 3. Keyboard: Tab order, Enter/Space, focus ring, focus lands in the input =================
if (want('keyboard')) {
  for (const scheme of ['light', 'dark']) for (const key of ['Enter', 'Space']) {
    const tag = `${key}-${scheme}`;
    const { ctx, p } = await open({ viewport: { width: 1280, height: 800 }, colorScheme: scheme }, '&mock=results', `kbd-${tag}`);
    await intro(p);
    const ref = await boxes(p);
    const introTabs = [];
    await p.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
    for (let i = 0; i < 4; i++) { await p.keyboard.press('Tab'); introTabs.push(await p.evaluate(() => document.activeElement.className.split(' ')[0] || document.activeElement.tagName)); }
    if (key === 'Enter' && scheme === 'light') check(!introTabs.includes('chao'), 'Tab in the intro never stops on the Chao (it is an image)', introTabs.join(' > '));
    await search(p, TEXT);
    await p.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
    const seq = [];
    for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); const c = await p.evaluate(() => document.activeElement.className.split(' ')[0] || document.activeElement.tagName); seq.push(c); if (c === 'chao') break; }
    const ci = seq.indexOf('chao');
    check(ci >= 0 && seq.slice(0, ci).every((c) => /toggle/.test(c)), `[${tag}] Tab order in compact: toggles first, then the Chao (before the input)`, seq.join(' > '));
    const ring = await p.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { chao: e.classList.contains('chao'), fv: e.matches(':focus-visible'), style: cs.outlineStyle, w: parseFloat(cs.outlineWidth), color: cs.outlineColor }; });
    check(ring.chao && ring.fv && ring.style !== 'none' && ring.w >= 2, `[${tag}] Focus ring on the Chao is visible`, JSON.stringify(ring));
    if (key === 'Enter') await shot(p, `focus-chao-${scheme}`);
    if (key === 'Space') {
      const sy = await p.evaluate(() => scrollY);
      await p.keyboard.press('Space');
      await settled(p, 'intro', 'full');
      check(await p.evaluate((y) => scrollY === y, sy), `[${tag}] Space does not scroll the page`, `scrollY ${sy}`);
    } else await p.keyboard.press('Enter');
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({ active: document.activeElement?.id, role: document.querySelector('.narrator .chao').getAttribute('role'), tab: document.querySelector('.narrator .chao').getAttribute('tabindex'), v: document.querySelector('#feeling').value }));
    const d = diff(ref, await boxes(p));
    check(r.active === 'feeling' && r.role === 'img' && r.tab === null && r.v === TEXT && d.length === 0, `[${tag}] Reset by keyboard: focus in the input, Chao back to img without tabindex, text kept, boxes equal the intro`, `${JSON.stringify(r)}; ${d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok'}`);
    await ctx.close();
  }
  // key repeat: a held Enter fires one reset on keyup, not a reset + a new search or typed spaces
  {
    const { ctx, p } = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, '&mock=results', 'kbd-repeat');
    await intro(p);
    await search(p, TEXT);
    await p.locator('.narrator .chao').focus();
    let reqs = 0;
    p.on('request', (q) => { if (q.url().includes('/api/')) reqs++; });
    await p.keyboard.down('Enter');
    for (let i = 0; i < 5; i++) { await p.waitForTimeout(140); await p.keyboard.down('Enter'); } // auto-repeat keydowns, ~700 ms
    const held = await p.evaluate(() => document.querySelector('#app').dataset.state);
    await p.keyboard.up('Enter');
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({ state: document.querySelector('#app').dataset.state, layout: document.querySelector('#app').dataset.layout, v: document.querySelector('#feeling').value }));
    check(held === 'results' && r.state === 'intro' && r.layout === 'full' && r.v === TEXT && reqs === 0, 'Held Enter on the Chao: nothing while held, one reset on release, text untouched, 0 /api requests', JSON.stringify({ held, ...r, reqs }));
    await ctx.close();
  }
}

// ================= 4. Motion: FLIP in reverse with the same duration; reduced motion = instant =================
if (want('motion')) {
  for (const reduced of [false, true]) {
    const tag = reduced ? 'reduced' : 'motion';
    const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, colorScheme: 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' }, '&mock=results', tag);
    await intro(p);
    const ref = await boxes(p);
    await search(p, TEXT);
    await p.evaluate(() => { window.__anim.length = 0; });
    await clickChao(p);
    await p.waitForTimeout(30);
    const a = await p.evaluate(() => window.__anim.filter((x) => x.props.includes('scale') || x.props.includes('translate')));
    const quick = await boxes(p); // 30 ms after the click
    if (reduced) {
      check(a.length === 0, 'Reduced motion: the reset starts no translate/scale animation', `${a.length} animations: ${JSON.stringify(a.map((x) => x.cls))}`);
      const d = diff(ref, quick);
      const line = await p.evaluate(() => ({ s: document.querySelector('.bubble__spoken').textContent, t: document.querySelector('.bubble__typed').textContent, p: document.querySelector('.bubble__pending').textContent, layout: document.querySelector('#app').dataset.layout }));
      check(d.length === 0 && line.layout === 'full', 'Reduced motion: 30 ms after the click the boxes already equal the intro (instant change)', d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok');
      check(line.p === '' && line.t === n.intro, 'Reduced motion: the intro line appears whole at once', JSON.stringify(line));
      await shot(p, 'reduced-reset-375-light');
    } else {
      const byCls = (c) => a.find((x) => x.cls.includes(c));
      const four = ['screen__title', 'narrator', 'feeling', 'chao'].map(byCls);
      check(four.every(Boolean) && four.every((x) => x.dur >= 400 && x.dur <= 560), 'Motion: the reverse FLIP animates title, narrator, form and Chao with the same duration as the forward one (--dur-slow, 480 ms)', JSON.stringify(a.map((x) => ({ c: x.cls.split(' ')[0], d: x.dur }))));
      const off = (x) => Number(x.first?.scale ?? 1) !== 1 || String(x.first?.translate ?? '0').split(' ').some((v) => parseFloat(v) !== 0);
      check(four.every((x) => off(x)) && Number(four[0].first.scale) !== 1 && Number(four[3].first.scale) !== 1, 'Motion: each FLIP starts from the compact pose (title and Chao scaled, all four displaced) and ends at identity', JSON.stringify(four.map((x) => x.first)));
      await p.waitForTimeout(700);
      const d = diff(ref, await boxes(p));
      check(d.length === 0, 'Motion: after the animation the boxes equal the intro', d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok');
    }
    await ctx.close();
  }
}

// ================= 5. Touch: tap resets and does not pop the keyboard =================
if (want('touch')) {
  const { ctx, p } = await open({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, colorScheme: 'light' }, '&mock=results', 'touch');
  await intro(p);
  const ref = await boxes(p);
  const fine = await p.evaluate(() => matchMedia('(pointer: fine)').matches);
  await p.tap('#feeling'); await p.keyboard.type(TEXT); await p.keyboard.press('Enter');
  await settled(p, 'results', 'compact', 40000);
  await p.waitForTimeout(300);
  const c = await center(p);
  await p.touchscreen.tap(c.x, c.y);
  await settled(p, 'intro', 'full');
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => ({ active: document.activeElement?.tagName, v: document.querySelector('#feeling').value }));
  const d = diff(ref, await boxes(p));
  check(!fine && r.active !== 'INPUT' && r.v === TEXT && d.length === 0, 'Touch tap on the Chao: resets, text kept, input NOT focused (no keyboard), boxes equal the intro', `pointer fine ${fine}, active ${r.active}, ${d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok'}`);
  await ctx.close();
}

// ================= 6. Hit area: elementFromPoint 23 px either side of the Chao centre =================
if (want('hit')) {
  const sizes = [{ width: 667, height: 375 }, { width: 375, height: 667 }, { width: 320, height: 568 }, { width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 1280, height: 600 }];
  for (const vp of sizes) {
    const { ctx, p } = await open({ viewport: vp, colorScheme: 'light' }, '&mock=results', `hit-${vp.width}x${vp.height}`);
    await intro(p);
    await search(p, TEXT);
    const r = await p.evaluate(() => {
      const c = document.querySelector('.narrator .chao'), b = c.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === c || c.contains(e)); };
      const ca = getComputedStyle(c, '::after');
      return { w: b.width, h: b.height, l: hit(cx - 23, cy), r: hit(cx + 23, cy), c: hit(cx, cy), up: hit(cx, cy - 28), down: hit(cx, cy + 28), pos: ca.position, aw: parseFloat(ca.width), ah: parseFloat(ca.height) };
    });
    check(r.l && r.r && r.c, `[${vp.width}x${vp.height}] elementFromPoint at -23 / +23 px horizontally from the Chao centre hits .chao`, `box ${r.w.toFixed(0)}x${r.h.toFixed(0)}; ::after ${r.aw.toFixed(0)}x${r.ah.toFixed(0)} (${r.pos}); left ${r.l}, right ${r.r}, centre ${r.c}; +-28 vertical: up ${r.up}, down ${r.down}`);
    check(r.aw >= 47.5 && r.ah >= 57.5, `[${vp.width}x${vp.height}] hit area is at least 48 x 58 (DESIGN §18.1)`, `${r.aw.toFixed(1)} x ${r.ah.toFixed(1)}`);
    await ctx.close();
  }
}

// ================= 7. Game boxes: no spine, no disc, year on the right =================
if (want('cases')) {
  for (const vp of VPS) for (const scheme of ['light', 'dark']) {
    const tag = `${vp.width}x${vp.height}-${scheme}`;
    const { ctx, p } = await open({ viewport: vp, colorScheme: scheme }, '&mock=results', `cases-${tag}`);
    await intro(p);
    await search(p, TEXT);
    const r = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('ul.shelf__row a.case')];
      const rect = (e) => e.getBoundingClientRect();
      const per = cs.map((c) => {
        const band = c.querySelector('.case__band'), yr = c.querySelector('.case__year'), cover = c.querySelector('.case__cover');
        const bs = getComputedStyle(band), bf = getComputedStyle(band, '::before'), br = rect(band), yrr = rect(yr), cr = rect(c), cvr = rect(cover);
        const all = [c, ...c.querySelectorAll('*')];
        return {
          spine: c.querySelectorAll('.case__spine').length, bandKids: band.children.length, justify: bs.justifyContent,
          disc: bf.content !== 'none' && bf.content !== 'normal',
          yearLeftOfCentre: yrr.left < br.left + br.width / 2, yearGap: br.right - yrr.right, bandPad: parseFloat(bs.paddingRight), bandW: br.width,
          coverGap: cr.right - cvr.right, coverW: cvr.width, caseW: cr.width, over: all.some((e) => rect(e).right > cr.right + 1),
        };
      });
      return { n: cs.length, per, sw: document.documentElement.scrollWidth, iw: innerWidth, tokens: ['--case-spine-w', '--case-spine', '--case-spine-2', '--case-spine-3', '--case-spine-4'].map((t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim()).filter(Boolean) };
    });
    const bad = (f) => r.per.map((x, i) => (f(x) ? '' : `#${i}`)).filter(Boolean);
    check(r.n >= 5 && bad((x) => x.spine === 0).length === 0, `[${tag}] No .case__spine element in any of the ${r.n} cases`, `offenders: ${bad((x) => x.spine === 0).join(',') || 'none'}`);
    check(bad((x) => !x.disc).length === 0, `[${tag}] .case__band::before (disc) has no content / box`, `offenders: ${bad((x) => !x.disc).join(',') || 'none'}`);
    check(bad((x) => x.bandKids === 1 && x.justify === 'flex-end').length === 0, `[${tag}] Band holds only the year, justify-content flex-end`, `offenders: ${bad((x) => x.bandKids === 1 && x.justify === 'flex-end').join(',') || 'none'}; sample ${r.per[0].bandKids} child(ren), ${r.per[0].justify}`);
    check(bad((x) => !x.yearLeftOfCentre && Math.abs(x.yearGap - x.bandPad) <= 1.5).length === 0, `[${tag}] Year sits at the right edge (gap to the band edge = band padding)`, `gap ${r.per[0].yearGap.toFixed(1)} vs padding ${r.per[0].bandPad.toFixed(1)}; band ${r.per[0].bandW.toFixed(0)} px`);
    check(bad((x) => Math.abs(x.coverGap) <= 1 && !x.over).length === 0, `[${tag}] The cover reaches the right edge of the box (no strip) and nothing overflows the case`, `cover gap ${r.per[0].coverGap.toFixed(1)}, cover ${r.per[0].coverW.toFixed(0)} of ${r.per[0].caseW.toFixed(0)} px`);
    check(r.sw <= r.iw, `[${tag}] No horizontal overflow of the page`, `scrollWidth ${r.sw}/${r.iw}`);
    if (scheme === 'light' && vp.width === 320) check(r.tokens.length === 0, '--case-spine* tokens are gone from the computed :root', r.tokens.join(',') || 'none defined');
    await shot(p, `cases-${tag}`);
    await ctx.close();
  }
}

// ================= 8. Real API (3 calls max): search, reset, search again =================
if (want('real')) {
  for (const [vp, scheme, text] of [[{ width: 375, height: 667 }, 'light', 'co-op de aventura'], [{ width: 1280, height: 800 }, 'dark', 'a souls-like']]) {
    const tag = `real-${vp.width}-${scheme}`;
    const { ctx, p } = await open({ viewport: vp, colorScheme: scheme }, '', tag);
    await intro(p);
    const ref = await boxes(p);
    await p.focus('#feeling'); await p.keyboard.type(text); await p.keyboard.press('Enter');
    await p.waitForFunction(() => ['results', 'no-results', 'error'].includes(document.querySelector('#app').dataset.state), null, { timeout: 40000 });
    await settled(p, await p.evaluate(() => document.querySelector('#app').dataset.state), 'compact', 20000);
    await p.waitForTimeout(800);
    const o = await p.evaluate(() => ({ s: document.querySelector('#app').dataset.state, cases: document.querySelectorAll('ul.shelf__row a.case').length }));
    await shot(p, `${tag}-results`);
    check(o.s === 'results' && o.cases >= 5, `[${tag}] real API: "${text}" gives results`, `state ${o.s}, ${o.cases} cases`);
    const cardOk = await p.evaluate(() => [...document.querySelectorAll('ul.shelf__row a.case')].every((c) => !c.querySelector('.case__spine')));
    check(cardOk, `[${tag}] real cases have no spine`, String(cardOk));
    await clickChao(p);
    await settled(p, 'intro', 'full');
    await p.waitForTimeout(250);
    const d = diff(ref, await boxes(p)), v = await p.evaluate(() => document.querySelector('#feeling').value);
    check(d.length === 0 && v === text, `[${tag}] real API: reset restores the intro boxes and keeps "${text}"`, `${d.map(([k, x]) => `${k} ${x.toFixed(1)}`).join(', ') || 'boxes ok'}; value "${v}"`);
    await shot(p, `${tag}-reset`);
    if (vp.width === 375) { // search again after the reset, with the real API
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => ['results', 'no-results', 'error'].includes(document.querySelector('#app').dataset.state), null, { timeout: 40000 });
      await settled(p, await p.evaluate(() => document.querySelector('#app').dataset.state), 'compact', 20000);
      const o2 = await p.evaluate(() => ({ s: document.querySelector('#app').dataset.state, l: document.querySelector('#app').dataset.layout, cases: document.querySelectorAll('ul.shelf__row a.case').length, role: document.querySelector('.narrator .chao').getAttribute('role') }));
      check(o2.s === 'results' && o2.l === 'compact' && o2.cases >= 5 && o2.role === 'button', `[${tag}] real API: new search after the reset compacts again`, JSON.stringify(o2));
    }
    await ctx.close();
  }
}

await browser.close();
console.log(lines.join('\n'));
console.log(`\nscreenshots (${shots.length}) in ${OUT}:\n${shots.join('\n')}`);
const fails = lines.filter((l) => l.startsWith('FAIL')).length;
console.log(`\nchecks: ${lines.filter((l) => l.startsWith('PASS')).length} PASS, ${fails} FAIL`);
if (errors.length) { console.error(`\n${errors.length} error(s):\n${errors.join('\n')}`); process.exit(1); }
console.log('verify-restart: OK, 0 errors');
