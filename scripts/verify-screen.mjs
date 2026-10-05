// Phase 4b checks: single screen + narrator state machine (DESIGN §14.10, SPEC §1.1).
// Called by scripts/verify.mjs (runScreen). Standalone (dev server on :5173, `npm run build` done):
//   node scripts/verify-screen.mjs            (VERIFY_URL overrides the base; VERIFY_ONLY=intro,flow,... picks sections)
import { chromium } from 'playwright-core';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { content as contentDefault } from '../src/content.ts';
import { isExpected404 } from './verify-results.mjs';

const fillT = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

// In-page instrumentation (init script). ?notl skips the 40 ms sampler (used by the latency probes).
const SCREEN_HELPERS = () => {
  window.__tl = []; window.__txt = []; window.__alog = []; window.__submits = []; window.__gaps = [];
  const q = (s) => document.querySelector(s);
  if (!location.search.includes('notl')) {
    setInterval(() => {
      const app = q('#app');
      if (!app) return;
      const form = q('form.feeling'), line = q('#narrator-line'), chao = q('.narrator .chao');
      window.__tl.push({
        t: performance.now(), state: app.dataset.state, layout: app.dataset.layout, mood: chao?.dataset.mood ?? null, bubble: line?.querySelector('.bubble__spoken')?.textContent ?? null,
        formVis: form ? getComputedStyle(form).visibility : null, focus: document.activeElement?.id || document.activeElement?.tagName,
        sw: document.documentElement.scrollWidth, iw: innerWidth,
      });
    }, 40);
  }
  new MutationObserver((ms) => {
    for (const m of ms) {
      const e = (m.target.nodeType === 3 ? m.target.parentElement : m.target)?.closest?.('.bubble__spoken'); // the text lives in span.bubble__text
      if (e) window.__txt.push({ t: performance.now(), text: e.textContent }) // one entry per line: the spoken copy changes once per line;
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener('submit', () => window.__submits.push(performance.now()), true);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (kf, opts) {
    const a = animate.call(this, kf, opts);
    const frames = Array.isArray(kf) ? kf : [];
    const rec = {
      t: performance.now(), anim: a, el: this, cls: String(this.className), id: this.id, n: frames.length, fin: null,
      props: [...new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => !['offset', 'easing', 'composite'].includes(k)))],
      dur: typeof opts === 'number' ? opts : opts?.duration,
    };
    window.__alog.push(rec);
    a.finished.then(() => { rec.fin = performance.now(); }, () => { rec.fin = -1; });
    return a;
  };
  let last = 0;
  const tick = (now) => { if (last && now - last > 100) window.__gaps.push({ t: now, gap: now - last }); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

const MOTION_PROPS = ['translate', 'scale', 'rotate', 'transform'];

export async function runScreen(env) {
  const { browser, BASE, PROD, OUT, VIEWPORTS, SCHEMES, errors, lines, watch, check, info } = env;
  const content = env.content ?? contentDefault;
  const n = content.narrator, inp = content.input;
  const only = process.env.VERIFY_ONLY ? process.env.VERIFY_ONLY.split(',') : null;
  const want = (s) => !only || only.includes(s);
  const shots = [];
  await mkdir(OUT, { recursive: true });

  // Console errors and page errors only: used where the test itself provokes 4xx/5xx or aborted requests.
  const watchLite = (page, tag) => {
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`[${tag}] console: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  };
  const open = async (opts, { url, tag, init = [SCREEN_HELPERS], watcher = watch }) => {
    const ctx = await browser.newContext(opts);
    for (const f of init) await ctx.addInitScript(f);
    const p = await ctx.newPage();
    watcher(p, tag);
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => document.fonts.ready);
    return { ctx, p };
  };
  const waitIntro = (p, timeout = 40000) => p.waitForFunction(() => {
    const a = document.querySelector('#app'), f = document.querySelector('form.feeling');
    return a?.dataset.state === 'intro' && document.querySelector('.narrator .chao')?.dataset.mood === 'idle' && f && !f.hasAttribute('data-hidden')
      && f.getAnimations().length === 0 && document.querySelector('#narrator-line .bubble__spoken').textContent !== '';
  }, null, { timeout });
  const waitText = (p, text, timeout = 15000) => p.waitForFunction((t) => document.querySelector('#narrator-line .bubble__spoken').textContent === t, text, { timeout }).then(() => true, () => false);
  const waitState = (p, st, timeout = 15000) => p.waitForFunction((s) => document.querySelector('#app').dataset.state === s, st, { timeout }).then(() => true, () => false);
  const settle = (p, timeout = 8000) => p.waitForFunction(() => document.getAnimations().filter((a) => a.constructor.name === 'Animation' && a.playState === 'running').length === 0, null, { timeout }).catch(() => undefined);
  const snap = (p) => p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const a = q('#app'), i = q('#feeling'), b = q('.feeling__submit'), f = q('form.feeling'), c = q('.narrator .chao');
    return {
      state: a.dataset.state, layout: a.dataset.layout, mood: c.dataset.mood, line: q('#narrator-line .bubble__spoken').textContent, invalid: i.getAttribute('aria-invalid'),
      ro: i.readOnly, dis: b.disabled, busy: f.getAttribute('aria-busy'), goVis: getComputedStyle(q('.feeling__go')).visibility, busyVis: getComputedStyle(q('.feeling__busy')).visibility,
      busyLabel: q('.feeling__busy').textContent, focus: document.activeElement.id || document.activeElement.tagName, selS: i.selectionStart, selE: i.selectionEnd, len: i.value.length,
      h1: document.querySelectorAll('h1').length, btnW: b.getBoundingClientRect().width, sw: document.documentElement.scrollWidth, iw: innerWidth,
    };
  });
  const alog = (p, from = 0, probe = false) => p.evaluate(([from, probe]) => window.__alog.slice(from).map((r) => { const o = {}; if (probe) { r.anim.pause(); r.anim.currentTime = 0; const cs = getComputedStyle(r.el); o.tr = cs.translate; o.sc = cs.scale; r.anim.cancel(); } return ({ ...o, t: r.t, cls: r.cls, id: r.id, n: r.n, props: r.props, dur: r.dur, fin: r.fin, tgt: r.el.matches('form.feeling') ? 'form' : r.el.matches('.narrator') ? 'narrator' : r.el.matches('.screen__title') ? 'title' : r.el.matches('.bubble__text') ? 'bubble-text' : r.el.matches('#narrator-line') ? 'bubble' : r.el.matches('.chao') ? 'chao' : r.el.closest('.chao') ? 'chao-part' : r.el.tagName }); }), [from, probe]);
  const moves = (r) => (r.tr && !/^(none|0px( 0px)?)$/.test(r.tr)) || (r.sc && !/^(none|1( 1)?)$/.test(r.sc)); // starts displaced / scaled
  const alogLen = (p) => p.evaluate(() => window.__alog.length);
  const shot = async (p, name, tag, opts = {}) => { await p.waitForFunction(() => document.querySelector('#narrator-line').getAnimations({ subtree: true }).length === 0, null, { timeout: 8000 }).catch(() => undefined); /* never capture the bubble mid-fade */ const f = `${OUT}/4b-${name}-${tag}.png`; await p.screenshot({ path: f, ...opts }); shots.push(f); };
  const px = (p, token) => p.evaluate((t) => { const e = document.body.appendChild(document.createElement('i')); e.style.cssText = `position:absolute;visibility:hidden;block-size:var(${t})`; const v = e.getBoundingClientRect().height; e.remove(); return v; }, token);
  const type = async (p, text) => { await p.focus('#feeling'); await p.keyboard.type(text); };

  // ================= 1. Intro: timeline, focus by pointer type =================
  if (want('intro')) {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500`, tag: '4b-intro' });
    await waitIntro(p);
    await p.waitForFunction(() => document.activeElement?.id === 'feeling', null, { timeout: 3000 }).catch(() => undefined); // focus() runs right after the form fade resolves
    const r = await p.evaluate(() => ({ tl: window.__tl, active: document.activeElement?.id || document.activeElement?.tagName, fine: matchMedia('(pointer: fine)').matches, hov: matchMedia('(hover: hover)').matches }));
    const tl = r.tl;
    const iBubble = tl.findIndex((x) => x.bubble === n.intro), iVis = tl.findIndex((x) => x.formVis === 'visible');
    const early = tl.slice(0, iBubble < 0 ? tl.length : iBubble);
    const enter = tl.filter((x) => x.mood === 'enter');
    check(enter.length >= 1 && enter.every((x) => x.bubble === '' && x.formVis === 'hidden' && x.state === 'intro'), 'Intro: while the Chao enters (mood=enter) the bubble is empty and the form hidden, state=intro',
      `${enter.length} samples with mood enter of ${tl.length}; bubble values [${[...new Set(enter.map((x) => JSON.stringify(x.bubble)))]}], form visibility [${[...new Set(enter.map((x) => x.formVis))]}]`);
    check(early.every((x) => x.formVis !== 'visible') && iBubble >= 0 && iVis >= iBubble, 'Intro: the bubble speaks first, the form appears after it', `first sample with intro line #${iBubble}, first with form visible #${iVis}, form never visible before the line: ${early.every((x) => x.formVis !== 'visible')}`);
    const last = { ...tl.at(-1), focus: r.active };
    check(last.state === 'intro' && last.mood === 'idle' && last.bubble === n.intro && last.formVis === 'visible' && last.layout === 'full', 'Intro: ends in data-state=intro, mood idle, bubble = intro line, form visible, layout full', JSON.stringify({ state: last.state, mood: last.mood, bubble: last.bubble, form: last.formVis, layout: last.layout }));
    check(r.fine && last.focus === 'feeling', 'Intro (fine pointer): focus lands on #feeling when the form appears', `pointer fine ${r.fine}, activeElement ${last.focus}`);
    check(tl.every((x) => x.sw <= x.iw), 'Intro: scrollWidth <= innerWidth during the whole entrance (1440)', `max scrollWidth ${Math.max(...tl.map((x) => x.sw))} / ${r.tl[0].iw} over ${tl.length} samples`);
    const at = (f) => { const x = tl.find(f); return x ? (x.t - tl[0].t).toFixed(0) : 'n/a'; };
    info('Intro milestones (1440, frozen bg ?t=9500; ms after the first sample)', `mood enter ${at((x) => x.mood === 'enter')}, intro line ${at((x) => x.bubble === n.intro)}, form visible ${at((x) => x.formVis === 'visible')}, mood idle ${at((x) => x.mood === 'idle')}; sampler first sample at ${tl[0].t.toFixed(0)} ms page time; ${tl.length} samples in ${(tl.at(-1).t - tl[0].t).toFixed(0)} ms (a 40 ms sampler => ${(((tl.at(-1).t - tl[0].t) / 40) / tl.length).toFixed(2)}x slower than ideal = main-thread stalls) (design total ~1.52 s)`);
    await ctx.close();

    // touch: never focus by script
    const t = await open({ viewport: VIEWPORTS[0], deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=slow`, tag: '4b-intro-touch' });
    await waitIntro(t.p);
    await t.p.waitForTimeout(500);
    const tt = await t.p.evaluate(() => ({ fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches, active: document.activeElement.tagName + '#' + document.activeElement.id, sw: document.documentElement.scrollWidth, iw: innerWidth, tl: window.__tl.every((x) => x.sw <= x.iw) }));
    check(!tt.fine && tt.active === 'BODY#' && tt.tl, 'Intro (touch, hasTouch+isMobile): the input is NOT focused by script (focus stays on body), no horizontal scroll', `pointer fine ${tt.fine} coarse ${tt.coarse}; activeElement ${tt.active}; scrollWidth ${tt.sw}/${tt.iw}; sw<=iw in all samples ${tt.tl}`);
    // touch submit: keyboard closed after sending (input blurred)
    await t.p.tap('#feeling');
    await t.p.keyboard.type('cozy');
    await t.p.keyboard.press('Enter');
    await t.p.waitForTimeout(150);
    const ts = await snap(t.p);
    check(ts.state === 'thinking' && ts.focus !== 'feeling', 'Touch: after sending, the input loses focus (keyboard closes) while thinking', `state ${ts.state}, activeElement ${ts.focus}`);
    await t.ctx.close();
  }

  // ================= 2. Full flow per viewport x theme: states, screenshots =================
  const flow = async (viewport, scheme) => {
    const tag = `${viewport.width}-${scheme}`;
    const { ctx, p } = await open({ viewport, colorScheme: scheme }, { url: `${BASE}/?t=9500&mock=results`, tag: `4b-flow-${tag}` });
    await waitIntro(p);
    let s = await snap(p);
    check(s.h1 === 1, `[${tag}] one h1 in intro`, `h1 count ${s.h1}`);
    await shot(p, 'intro', tag);

    // empty input (Enter with nothing)
    const a0 = await alogLen(p);
    await p.focus('#feeling');
    await p.keyboard.press('Enter');
    await waitText(p, n.emptyInput);
    s = await snap(p);
    check(s.state === 'empty-input' && s.invalid === 'true' && s.mood === 'listen' && s.line === n.emptyInput && s.focus === 'feeling' && s.layout === 'full' && s.h1 === 1,
      `[${tag}] empty input: state, aria-invalid=true, mood listen, emptyInput line, focus stays, layout full`, JSON.stringify({ state: s.state, invalid: s.invalid, mood: s.mood, line: s.line, focus: s.focus, layout: s.layout }));
    const shake = await p.evaluate(() => {
      const r = window.__alog.filter((x) => x.el.matches('form.feeling') && x.n === 7).at(-1);
      if (!r) return null;
      const out = { dur: r.dur };
      r.anim.pause();
      r.anim.currentTime = 120; out.at120 = getComputedStyle(r.el).translate;
      let max = 0; for (let t = 0; t <= 320; t += 20) { r.anim.currentTime = t; max = Math.max(max, Math.abs(parseFloat(getComputedStyle(r.el).translate) || 0)); }
      out.max = max; r.anim.cancel();
      return out;
    });
    check(!!shake && shake.dur === 320 && shake.at120 !== 'none' && Math.abs(parseFloat(shake.at120)) > 0 && shake.max >= 3, `[${tag}] empty input: form shakes (320 ms, translate != 0 at 120 ms)`,
      shake ? `duration ${shake.dur} ms, translate at 120 ms "${shake.at120}", max |x| over the cycle ${shake.max.toFixed(1)} px` : 'no 7-keyframe animation on the form');
    await shot(p, 'empty-input', tag);

    // typing clears aria-invalid
    await p.keyboard.type('cozy');
    await waitText(p, n.typing);
    s = await snap(p);
    check(s.state === 'typing' && s.invalid === null && s.mood === 'listen' && s.line === n.typing && s.layout === 'full', `[${tag}] typing: aria-invalid removed, state typing, mood listen, typing line, layout unchanged`, JSON.stringify({ state: s.state, invalid: s.invalid, mood: s.mood, line: s.line, layout: s.layout }));
    await shot(p, 'typing', tag);

    // thinking
    const wBefore = s.btnW;
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'thinking', null, { timeout: 5000 });
    s = await snap(p);
    await waitText(p, n.thinking, 8000);
    check(s.state === 'thinking' && s.ro === true && s.dis === true && s.busy === 'true' && s.busyLabel === inp.submitBusy && s.busyVis === 'visible' && s.goVis === 'hidden' && s.mood === 'think' && s.layout === 'full',
      `[${tag}] thinking: input readonly, button disabled "Thinking…", form aria-busy=true, mood think, layout full`, JSON.stringify({ ro: s.ro, dis: s.dis, busy: s.busy, label: s.busyLabel, busyVis: s.busyVis, goVis: s.goVis, mood: s.mood }));
    check(Math.abs(s.btnW - wBefore) < 0.6, `[${tag}] the submit button keeps its width when the label changes`, `${wBefore.toFixed(1)} -> ${s.btnW.toFixed(1)} px`);
    const found = await waitText(p, fillT(n.thinkingFound, { summary: 'cozy indie games' }), 8000);
    check(found, `[${tag}] thinking -> thinkingFound as soon as the summary arrives`, `line "${await p.evaluate(() => document.querySelector('#narrator-line .bubble__spoken').textContent)}" (want "${fillT(n.thinkingFound, { summary: 'cozy indie games' })}")`);

    // results
    await waitState(p, 'results', 10000);
    await waitText(p, fillT(n.results, { summary: 'cozy indie games' }), 8000);
    await settle(p);
    s = await snap(p);
    check(s.state === 'results' && s.layout === 'compact' && s.mood === 'happy' && s.line === fillT(n.results, { summary: 'cozy indie games' }) && s.h1 === 1, `[${tag}] results: state, layout compact, mood happy, "Feeling cozy? These games get it."`, JSON.stringify({ state: s.state, layout: s.layout, mood: s.mood, line: s.line, h1: s.h1 }));
    check(s.focus === 'feeling' && s.selS === s.len && s.selE === s.len && s.ro === false && s.dis === false && s.busy === 'false' && s.goVis === 'visible', `[${tag}] results: focus on the input with the cursor at the end (no selection), form idle again`, `focus ${s.focus}, selection ${s.selS}-${s.selE} of ${s.len}, readonly ${s.ro}, disabled ${s.dis}, aria-busy ${s.busy}`);
    const shelf = await p.evaluate(() => { const e = document.querySelector('.shelf'), cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { display: cs.display, h: r.height, aria: e.getAttribute('aria-hidden'), hidden: e.hidden, rows: e.querySelectorAll('.shelf__row li').length }; });
    check(shelf.display !== 'none' && !shelf.hidden && shelf.aria === null && shelf.rows === 20 && shelf.h > 0, `[${tag}] results: .shelf is shown (no aria-hidden, no fixed height) with its 20 cases (phase 5 replaced the --shelf-block placeholder)`, `display ${shelf.display}, height ${shelf.h.toFixed(1)} px, hidden ${shelf.hidden}, aria-hidden ${shelf.aria}, cases ${shelf.rows}`);
    await shot(p, 'results', tag);
    if (viewport.width === 390) await shot(p, 'results-fullpage', tag, { fullPage: true });

    // persistence: typing again keeps compact
    await p.focus('#feeling');
    await p.keyboard.type('x');
    await waitText(p, n.typing);
    s = await snap(p);
    check(s.state === 'typing' && s.layout === 'compact', `[${tag}] persistence: typing after results -> state typing, layout stays compact`, `state ${s.state}, layout ${s.layout}`);
    await shot(p, 'typing-compact', tag);
    await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace');
    await p.keyboard.press('Enter');
    await waitText(p, n.emptyInput);
    s = await snap(p);
    check(s.state === 'empty-input' && s.layout === 'compact' && s.invalid === 'true', `[${tag}] persistence: empty submit from a compact screen stays compact (aria-invalid=true)`, `state ${s.state}, layout ${s.layout}, invalid ${s.invalid}`);
    await p.keyboard.type('sleepy');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'thinking', null, { timeout: 5000 });
    s = await snap(p);
    check(s.state === 'thinking' && s.layout === 'compact' && s.mood === 'think' && s.ro && s.dis, `[${tag}] persistence: a second search from compact thinks in compact (mood think)`, `state ${s.state}, layout ${s.layout}, mood ${s.mood}`);
    await waitState(p, 'results', 10000);
    await settle(p);
    s = await snap(p);
    check(s.state === 'results' && s.mood === 'happy' && s.layout === 'compact', `[${tag}] persistence: second search ends in results, mood happy again`, `state ${s.state}, mood ${s.mood}, layout ${s.layout}`);

    // happy jump peak vs title (title bounce sampled at its worst phase)
    await settle(p);
    const jump = await p.evaluate(() => {
      const q = (x) => document.querySelector(x), chao = q('.narrator .chao'), title = q('.title');
      chao.removeAttribute('data-mood'); void chao.offsetWidth; chao.dataset.mood = 'happy';
      const anims = chao.getAnimations({ subtree: true });
      anims.forEach((a) => { a.pause(); a.currentTime = 377; });
      const heart = q('.chao__glyph--happy').getBoundingClientRect();
      const bounce = q('.title-wrap').getAnimations().find((a) => a.animationName === 'title-bounce');
      let worst = title.getBoundingClientRect().bottom, rest;
      if (bounce) {
        const d = bounce.effect.getComputedTiming().duration; bounce.pause();
        bounce.currentTime = 0; rest = title.getBoundingClientRect().bottom;
        for (let k = 0; k < 24; k++) { bounce.currentTime = (k * d) / 24; worst = Math.max(worst, title.getBoundingClientRect().bottom); }
      } else rest = worst;
      const out = { n: anims.length, heartTop: heart.top, titleBottomRest: rest, titleBottomWorst: worst, bounce: !!bounce };
      anims.forEach((a) => a.cancel()); bounce?.cancel();
      return out;
    });
    check(jump.n > 0 && jump.heartTop - jump.titleBottomWorst >= 16, `[${tag}] happy jump peak (377 ms): the heart glyph stays >= 16 px below the title (title bounce at its lowest)`,
      `${jump.n} Chao animations frozen at 377 ms; heart top ${jump.heartTop.toFixed(1)} px vs title bottom at rest ${jump.titleBottomRest.toFixed(1)} / worst bounce ${jump.titleBottomWorst.toFixed(1)} px => gap ${(jump.heartTop - jump.titleBottomWorst).toFixed(1)} px (DESIGN §14.1: 19-23 px at 1440, 96 px at 390)`);
    await ctx.close();
  };
  if (want('flow')) for (const viewport of VIEWPORTS) for (const scheme of SCHEMES) await flow(viewport, scheme);

  // ================= 3. thinkingLong (4 s) + full sequence, slow mock, shots of "thinking" =================
  const slow = async (viewport, scheme) => {
    const tag = `${viewport.width}-${scheme}`;
    const { ctx, p } = await open({ viewport, colorScheme: scheme }, { url: `${BASE}/?t=9500&mock=slow`, tag: `4b-slow-${tag}` });
    await waitIntro(p);
    await type(p, 'cozy');
    await p.keyboard.press('Enter');
    await waitText(p, n.thinking, 8000);
    await p.waitForTimeout(500);
    await shot(p, 'thinking', tag);
    const long = await waitText(p, n.thinkingLong, 9000);
    const tl = await p.evaluate(() => ({ submit: window.__submits.at(-1), txt: window.__txt.map((x) => ({ t: x.t, text: x.text })) }));
    const tLong = tl.txt.find((x) => x.text === n.thinkingLong)?.t;
    const dt = tLong ? tLong - tl.submit : null;
    check(long && dt > 3900 && dt < 5500, `[${tag}] thinking: "Still thinking…" appears ~4 s after sending (slow mock)`, `appeared ${dt ? dt.toFixed(0) : 'never'} ms after submit (4000 timer + 160 fade-out expected; window 3900-5500)`);
    await shot(p, 'thinking-long', tag);
    await waitState(p, 'results', 12000);
    await waitText(p, fillT(n.results, { summary: 'cozy indie games' }), 8000); // the state flips first, the line swaps after its fade-out
    const seq = (await p.evaluate(() => window.__txt.map((x) => x.text))).filter((t, i, a) => t && t !== a[i - 1]);
    const wantSeq = [n.intro, n.thinking, n.thinkingLong, fillT(n.thinkingFound, { summary: 'cozy indie games' }), fillT(n.results, { summary: 'cozy indie games' })];
    check(JSON.stringify(seq) === JSON.stringify(wantSeq), `[${tag}] narrator line sequence over a slow search`, `seen: ${JSON.stringify(seq)}`);
    await ctx.close();
  };
  if (want('slow')) for (const viewport of VIEWPORTS) for (const scheme of SCHEMES) await slow(viewport, scheme);

  // ================= 4. The 9 mock outcomes =================
  const OUTCOMES = {
    empty: { state: 'no-results', mood: 'sad', line: n.noResults, sel: true },
    offtopic: { state: 'no-results', mood: 'sad', line: n.offTopic, sel: true },
    error: { state: 'error', mood: 'error', line: n.error, sel: true },
    rate: { state: 'error', mood: 'error', line: fillT(n.errorRate, { seconds: 12 }), sel: true },
    busy: { state: 'error', mood: 'error', line: n.errorBusy, sel: true },
    network: { state: 'error', mood: 'error', line: n.errorNetwork, sel: true },
    timeout: { state: 'error', mood: 'error', line: n.errorSlow, sel: true },
  };
  const outcome = async (mock, o, viewport, scheme, shotIt) => {
    const tag = `${mock}-${viewport.width}-${scheme}`;
    const { ctx, p } = await open({ viewport, colorScheme: scheme }, { url: `${BASE}/?t=9500&mock=${mock}`, tag: `4b-out-${tag}` });
    await waitIntro(p);
    await type(p, 'a feeling');
    await p.keyboard.press('Enter');
    await waitState(p, o.state, 20000);
    await waitText(p, o.line, 8000);
    await settle(p);
    const s = await snap(p);
    check(s.state === o.state && s.mood === o.mood && s.line === o.line && s.layout === 'compact' && s.h1 === 1 && !s.ro && !s.dis, `[mock=${mock} ${viewport.width}-${scheme}] outcome: ${o.state}, mood ${o.mood}, line "${o.line}", compact, form idle`, JSON.stringify({ state: s.state, mood: s.mood, line: s.line, layout: s.layout }));
    check(s.focus === 'feeling' && s.selS === 0 && s.selE === s.len && s.len > 0, `[mock=${mock} ${viewport.width}-${scheme}] outcome: input focused with its text selected (rewrite quickly)`, `focus ${s.focus}, selection ${s.selS}-${s.selE} of ${s.len}`);
    if (shotIt) await shot(p, mock === 'empty' ? 'no-results' : mock === 'error' ? 'error' : `outcome-${mock}`, `${viewport.width}-${scheme}`);
    await ctx.close();
  };
  if (want('outcomes')) {
    for (const [mock, o] of Object.entries(OUTCOMES)) await outcome(mock, o, VIEWPORTS[1], 'light', true);
    // the two outcomes with a mandated screenshot, in the other 3 viewport x theme combinations
    for (const [viewport, scheme] of [[VIEWPORTS[1], 'dark'], [VIEWPORTS[0], 'light'], [VIEWPORTS[0], 'dark']]) for (const mock of ['empty', 'error']) await outcome(mock, OUTCOMES[mock], viewport, scheme, true);
  }
  // ================= 5. Real client (src/lib/api.ts) against routed /api responses =================
  if (want('api')) {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&notl`, tag: '4b-api', watcher: watchLite });
    await waitIntro(p);
    const calls = []; let cur = null;
    await p.route('**/api/**', async (route) => {
      const req = route.request();
      calls.push({ url: req.url(), method: req.method(), body: req.postData(), ct: req.headers()['content-type'] });
      if (!cur) return route.fulfill({ status: 500, body: 'unexpected' });
      return cur(route, new URL(req.url()).pathname);
    });
    const json = (status, body, headers = {}) => ({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    const interp = { ok: true, summary: 'cozy farming sim', genres: ['simulation'], tags: ['farming-sim'], platforms: ['nintendo-switch'], years: [2015, 2024], examples: ['Stardew Valley'] };
    const game = { id: 1, slug: 'a-game', name: 'A Game', released: null, image: 'https://example.invalid/x.jpg' };
    const run = async (name, handler, state, line, extra = () => true, text = 'a cozy farming sim for Switch') => {
      cur = handler;
      const k = await p.evaluate(() => window.__submits.length), c0 = calls.length;
      await p.fill('#feeling', text);
      await p.click('.feeling__submit');
      await p.waitForFunction((k) => window.__submits.length > k && !['typing', 'thinking', 'empty-input'].includes(document.querySelector('#app').dataset.state), k, { timeout: 20000 }).catch(() => undefined);
      await waitText(p, line, 6000);
      const s = await snap(p);
      const ex = extra(calls.slice(c0));
      check(s.state === state && s.line === line && s.layout === 'compact' && ex === true, `API client: ${name}`, `state ${s.state} (want ${state}), line "${s.line}" (want "${line}")${ex === true ? '' : '; ' + ex}`);
    };
    await run('interpret ok + games ok -> results with the API summary "cozy farming sim"', (r, path) => path.endsWith('interpret') ? r.fulfill(json(200, interp)) : r.fulfill(json(200, { games: [game] })), 'results', fillT(n.results, { summary: 'cozy farming sim' }),
      (cs) => { const a = cs.find((x) => x.url.includes('/api/interpret')), g = cs.find((x) => x.url.includes('/api/games')); return a?.method === 'POST' && /application\/json/.test(a.ct) && JSON.parse(a.body).text === 'a cozy farming sim for Switch' && g?.method === 'GET' && /genres=simulation/.test(g.url) && /tags=farming-sim/.test(g.url) && /platforms=nintendo-switch/.test(g.url) && /dates=2015-01-01(%2C|,)2024-12-31/.test(g.url) && /examples=Stardew(\+|%20)Valley/.test(g.url) ? true : `calls ${JSON.stringify(cs.map((x) => [x.method, x.url.replace(BASE, '')]))}`; });
    await run('interpret ok + games [] -> no-results', (r, path) => path.endsWith('interpret') ? r.fulfill(json(200, interp)) : r.fulfill(json(200, { games: [] })), 'no-results', n.noResults);
    await run('interpret off_topic -> offTopic line', (r) => r.fulfill(json(200, { ok: false, reason: 'off_topic' })), 'no-results', n.offTopic);
    await run('interpret 429 Retry-After: 7 -> "try again in 7s"', (r) => r.fulfill(json(429, { ok: false }, { 'Retry-After': '7' })), 'error', fillT(n.errorRate, { seconds: 7 }));
    await run('interpret 429 Retry-After: 99999 -> capped at 120s', (r) => r.fulfill(json(429, { ok: false }, { 'Retry-After': '99999' })), 'error', fillT(n.errorRate, { seconds: 120 }));
    await run('interpret 429 without Retry-After -> falls back to 10s', (r) => r.fulfill(json(429, { ok: false })), 'error', fillT(n.errorRate, { seconds: 10 }));
    await run('interpret 503 -> busy line', (r) => r.fulfill(json(503, { ok: false })), 'error', n.errorBusy);
    await run('interpret 200 with a non-JSON body (HTML) -> generic error, no crash', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>Bad gateway</html>' }), 'error', n.error);
    await run('interpret 500 -> generic error', (r) => r.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' }), 'error', n.error);
    await run('interpret 413 -> generic error (a bug, not the user)', (r) => r.fulfill(json(413, { ok: false })), 'error', n.error);
    await run('interpret 200 with wrong shape -> generic error', (r) => r.fulfill(json(200, { ok: true, summary: 5 })), 'error', n.error);
    await run('games 503 after a good interpretation -> busy line', (r, path) => path.endsWith('interpret') ? r.fulfill(json(200, interp)) : r.fulfill(json(503, {})), 'error', n.errorBusy);
    await run('network failure (request aborted) -> offline line', (r) => r.abort('internetdisconnected'), 'error', n.errorNetwork);
    check(calls.every((c) => !/key=|api_key|apikey/i.test(c.url + (c.body ?? ''))), 'API client: no key/credential travels in any request the client makes', `${calls.length} requests inspected`);
    await ctx.close();
  }

  // ================= 6. detail contract (phase 6 hooks) =================
  if (want('detail')) {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results`, tag: '4b-detail' });
    await waitIntro(p);
    await type(p, 'cozy'); await p.keyboard.press('Enter');
    await waitState(p, 'results', 12000); await settle(p);
    const has = await p.evaluate(() => typeof window.__screen?.detail);
    await p.evaluate(() => window.__screen.detail(true));
    const d = await p.evaluate(() => ({ state: document.querySelector('#app').dataset.state, layout: document.querySelector('#app').dataset.layout, paused: document.documentElement.hasAttribute('data-holo-paused'), mood: document.querySelector('.narrator .chao').dataset.mood }));
    check(has === 'function' && d.state === 'detail' && d.paused && d.layout === 'compact', 'detail(true): data-state=detail, <html data-holo-paused>, layout compact', `__screen.detail is ${has}; ${JSON.stringify(d)}`);
    await p.evaluate(() => window.__screen.detail(false));
    await waitText(p, n.detailBack, 8000);
    await p.waitForTimeout(400);
    const e = await p.evaluate(() => ({ state: document.querySelector('#app').dataset.state, paused: document.documentElement.hasAttribute('data-holo-paused'), mood: document.querySelector('.narrator .chao').dataset.mood, line: document.querySelector('#narrator-line .bubble__spoken').textContent }));
    check(e.state === 'results' && !e.paused && e.mood === 'idle' && e.line === n.detailBack, 'detail(false): data-holo-paused removed, previous state (results), mood idle, "Want to try another feeling?"', JSON.stringify(e));
    await ctx.close();
  }

  // ================= 7. Reduced motion =================
  if (want('reduce')) {
    for (const viewport of VIEWPORTS) {
      const tag = `${viewport.width}`;
      const { ctx, p } = await open({ viewport, colorScheme: 'light', reducedMotion: 'reduce' }, { url: `${BASE}/?t=9500&mock=results`, tag: `4b-rm-${tag}` });
      await waitIntro(p);
      const intro = await alog(p, 0, true);
      const tl = await p.evaluate(() => window.__tl);
      const ready = tl.find((x) => x.state === 'intro' && x.mood === 'idle' && x.formVis === 'visible');
      check(intro.length > 0 && !intro.some(moves) && !intro.some((r) => r.props.includes('transform') || r.props.includes('rotate')), `[rm ${tag}] intro: the bubble and form only fade (nothing starts displaced or scaled)`, `${intro.length} WAAPI animations, start-of-animation translate/scale: ${JSON.stringify(intro.map((r) => `${r.tgt}: translate ${r.tr}, scale ${r.sc}`))} (declared props ${JSON.stringify(intro.map((r) => r.props))}: reveal() names translate/scale only in its last keyframe, so they interpolate from none to 0 = no movement)`);
      info(`[rm ${tag}] time to a settled intro`, `${ready ? (ready.t - tl[0].t).toFixed(0) : 'n/a'} ms from first sample (enter fade 200 + bubble fade + form fade)`);
      const a0 = await alogLen(p);
      await p.focus('#feeling');
      const t0 = await p.evaluate(() => performance.now());
      await p.keyboard.press('Enter');
      await waitText(p, n.emptyInput);
      const emp = await alog(p, a0);
      const s1 = await snap(p);
      const lat = await p.evaluate((t0) => window.__txt.at(-1).t - t0, t0);
      check(s1.state === 'empty-input' && s1.invalid === 'true' && !emp.some((r) => r.tgt === 'form') && !emp.some((r) => r.tgt === 'bubble' || r.tgt === 'bubble-text'), `[rm ${tag}] empty input: aria-invalid + line, but no shake and no bubble animation (instant swap)`, `state ${s1.state}, invalid ${s1.invalid}; animations created: ${JSON.stringify(emp.map((r) => `${r.tgt}:${r.props}`))}; line changed ${lat.toFixed(0)} ms after Enter`);
      const a1 = await alogLen(p);
      await p.keyboard.type('cozy'); await p.keyboard.press('Enter');
      await waitState(p, 'results', 12000);
      await settle(p);
      const res = await alog(p, a1);
      const s2 = await snap(p);
      const flipLike = res.filter((r) => ['title', 'narrator', 'form', 'chao', 'bubble'].includes(r.tgt));
      check(s2.state === 'results' && s2.layout === 'compact' && s2.mood === 'happy' && flipLike.length === 0 && !res.some((r) => r.props.some((k) => MOTION_PROPS.includes(k))), `[rm ${tag}] results: compact layout applied in place, no FLIP and no motion animation`, `animations during the transition: ${JSON.stringify(res.map((r) => `${r.tgt}:${r.props}`))}`);
      const loops = await p.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).map((a) => a.animationName ?? 'waapi'));
      check(loops.length === 0, `[rm ${tag}] no infinite loop animations anywhere on the page`, `infinite animations: [${loops}]`);
      await shot(p, 'reduced-motion-results', `${tag}-light`);
      await ctx.close();
    }
    // with motion the same transitions DO animate (control: proves the reduced-motion checks can fail)
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results`, tag: '4b-motion-control' });
    await waitIntro(p);
    const ctlIntro = await alog(p, 0, true);
    check(ctlIntro.filter((r) => r.tgt === 'form' || r.tgt === 'bubble').filter(moves).length === 2, 'Control (motion on): the intro bubble starts scaled and the form starts 12 px lower (so the reduced-motion probe can fail)', JSON.stringify(ctlIntro.filter((r) => r.tgt === 'form' || r.tgt === 'bubble').map((r) => `${r.tgt}: translate ${r.tr}, scale ${r.sc}`)));
    const a0 = await alogLen(p);
    await type(p, 'cozy'); await p.keyboard.press('Enter');
    await waitState(p, 'results', 12000);
    const res = await alog(p, a0);
    const flip = res.filter((r) => ['title', 'narrator', 'form'].includes(r.tgt) && r.props.includes('translate'));
    check(flip.length === 3 && flip.every((r) => r.dur === 480), 'Control (motion on): the compact switch runs a 480 ms FLIP on title, narrator and form', `FLIP animations: ${JSON.stringify(flip.map((r) => `${r.tgt}:${r.props}:${r.dur}ms`))}`);
    await ctx.close();
  }

  // ================= 8. Accessibility and keyboard =================
  if (want('a11y')) {
    for (const viewport of VIEWPORTS) {
      const tag = `${viewport.width}`;
      const { ctx, p } = await open({ viewport, colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: `4b-a11y-${tag}` });
      await waitIntro(p);
      const a = await p.evaluate(() => {
        const q = (s) => document.querySelector(s), rect = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
        const line = q('#narrator-line'), input = q('#feeling'), lab = q('label[for=feeling]');
        return {
          h1: document.querySelectorAll('h1').length, live: line.getAttribute('aria-live'), atomic: line.getAttribute('aria-atomic'), desc: input.getAttribute('aria-describedby'), descOk: !!document.getElementById(input.getAttribute('aria-describedby')),
          label: lab?.textContent, sizes: { mute: rect(q('.sound-toggle')), toggle: rect(q('.theme-toggle')), submit: rect(q('.feeling__submit')), input: rect(q('#feeling')) }, role: q('form.feeling').getAttribute('role'), landmarks: [...document.querySelectorAll('main,header,footer,form[role=search]')].map((e) => e.tagName.toLowerCase()),
        };
      });
      check(a.h1 === 1 && a.live === 'polite' && a.atomic === 'true' && a.desc === 'narrator-line' && a.descOk && a.label === inp.label && a.role === 'search', `[a11y ${tag}] single h1, #narrator-line aria-live=polite + aria-atomic=true, input labelled and described by the narrator line, form role=search`, JSON.stringify({ h1: a.h1, live: a.live, atomic: a.atomic, describedby: a.desc, label: a.label, role: a.role }));
      check(Object.values(a.sizes).every(([w, h]) => w >= 44 && h >= 44), `[a11y ${tag}] toggle, submit and input are >= 44x44 px`, JSON.stringify(a.sizes));
      const snapTree = await p.locator('body').ariaSnapshot();
      check(/textbox "What kind of game\?"/.test(snapTree) && /button "Find games"/.test(snapTree) && /button "Switch to dark theme"/.test(snapTree) && /link "RAWG"/.test(snapTree) && /heading "Game Feelings" \[level=1\]/.test(snapTree), `[a11y ${tag}] accessibility tree: textbox, buttons, link and the level-1 heading have their accessible names`, snapTree.replace(/\n\s*/g, ' | ').slice(0, 260));
      if (viewport.width === 1440) {
        await p.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
        const order = [];
        for (let i = 0; i < 5; i++) {
          await p.keyboard.press('Tab');
          order.push(await p.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { id: e.id, cls: e.className, href: e.getAttribute('href'), visible: e.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, outline: `${cs.outlineStyle} ${cs.outlineWidth}` }; }));
          if (i === 2) await shot(p, 'focus-input', '1440-light'); if (i === 3) await shot(p, 'focus-submit', '1440-light');
        }
        const seq = order.map((o) => o.id ? '#' + o.id : o.href ? `a[${o.href}]` : '.' + o.cls.split(' ')[0]);
        check(JSON.stringify(seq) === JSON.stringify(['.sound-toggle', '.theme-toggle', '#feeling', '.feeling__submit', `a[${content.footer.rawgUrl}]`]), '[a11y] Tab order: mute toggle -> theme toggle -> input -> submit button -> RAWG link', `sequence: ${seq.join(' -> ')}`);
        check(order.every((o) => o.visible), '[a11y] every Tab stop shows a visible focus ring (:focus-visible, outline > 0)', order.map((o) => `${o.id || o.cls.split(' ')[0] || o.href}[${o.outline}]`).join(', '));
        await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab'); // back to the mute toggle (focus-visible is already checked)
        // keyboard submit from the button: Space on the focused submit sends, and focus returns to the (readonly) input
        await p.focus('#feeling'); await p.keyboard.type('cozy'); await p.keyboard.press('Tab');
        const onBtn = await p.evaluate(() => document.activeElement.className);
        await p.keyboard.press('Space');
        await p.waitForFunction(() => document.querySelector('#app').dataset.state === 'thinking', null, { timeout: 5000 }).catch(() => undefined);
        const sb = await snap(p);
        check(/feeling__submit/.test(onBtn) && sb.state === 'thinking' && sb.focus === 'feeling' && sb.ro && sb.dis, '[a11y] keyboard: Space on "Find games" sends; focus moves to the input before the button is disabled', `focus was on ${onBtn}; now state ${sb.state}, activeElement ${sb.focus}, readonly ${sb.ro}, button disabled ${sb.dis}`);
        // while thinking: a second Enter must not send twice
        const subs0 = await p.evaluate(() => window.__submits.length);
        await p.keyboard.press('Enter');
        const subs1 = await p.evaluate(() => ({ n: window.__submits.length, state: document.querySelector('#app').dataset.state }));
        check(subs1.state === 'thinking', '[a11y] pressing Enter while thinking changes nothing (no double send, still thinking)', `submit events ${subs0} -> ${subs1.n}, state ${subs1.state}`);
      }
      await ctx.close();
    }
  }

  // ================= 9. Vertical scroll in compact (frontend warning 1: 888 px document vs 844 viewport) =================
  if (want('scroll')) {
    const rows = [];
    const vps = [[390, 844], [390, 932], [390, 740], [390, 667], [360, 640], [412, 915], [768, 1024], [1280, 720], [1440, 900], [1920, 1080]];
    const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: '4b-scroll' });
    await waitIntro(p);
    const measure = () => p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(e.top + scrollY), bottom: Math.round(e.bottom + scrollY) }; };
      const fixed = [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).map((e) => e.className || e.tagName);
      return { doc: document.documentElement.scrollHeight, ih: innerHeight, title: r('.title'), narrator: r('.narrator'), form: r('form.feeling'), shelf: r('.shelf'), footer: r('footer.credit'), fixed, shelfH: Math.round(document.querySelector('.shelf').getBoundingClientRect().height), shelfDisp: getComputedStyle(document.querySelector('.shelf')).display };
    });
    for (const [w, h] of vps) {
      await p.setViewportSize({ width: w, height: h });
      await p.evaluate(() => { document.querySelector('#app').dataset.layout = 'full'; });
      await p.waitForTimeout(60);
      const full = await measure();
      await p.evaluate(() => { document.querySelector('#app').dataset.layout = 'compact'; });
      await p.waitForTimeout(60);
      const compact = await measure();
      rows.push({ w, h, full, compact });
    }
    for (const r of rows) {
      const c = r.compact, f = r.full;
      lines.push(`scroll ${r.w}x${r.h}: full doc ${f.doc} (${f.doc - f.ih > 0 ? '+' + (f.doc - f.ih) : 'fits'}) | compact doc ${c.doc} (${c.doc - c.ih > 0 ? '+' + (c.doc - c.ih) + ' px of vertical scroll' : 'fits'}); compact: form bottom ${c.form.bottom}, shelf ${c.shelf.top}-${c.shelf.bottom} (${c.shelfH} px), footer ${c.footer.top}-${c.footer.bottom}; footer ${c.footer.top >= c.ih ? 'fully below the fold' : c.footer.bottom > c.ih ? 'partly below the fold' : 'visible'}; fixed/sticky elements: [${c.fixed}] (info)`);
    }
    const r390 = rows.find((r) => r.w === 390 && r.h === 844);
    info('Frontend warning 1 (390x844 compact document height)', `document ${r390.compact.doc} px vs viewport ${r390.compact.ih} px => ${r390.compact.doc - r390.compact.ih} px of vertical scroll; this probe forces data-layout without a search, so the shelf is hidden here (${r390.compact.shelfH} px; the real shelf sizes are checked in verify-results); the footer is ${r390.compact.footer.top >= r390.compact.ih ? 'below the fold' : 'partly visible'}; the only fixed element is the .holo background behind the content (${r390.compact.fixed.join(',')}), so nothing is covered`);
    // smallest viewport height at which the compact layout at 390 wide needs no scroll
    let lo = 600, hi = 1200;
    await p.setViewportSize({ width: 390, height: 844 });
    while (hi - lo > 2) { const mid = (lo + hi) >> 1; await p.setViewportSize({ width: 390, height: mid }); await p.waitForTimeout(30); const m = await measure(); if (m.doc <= m.ih) hi = mid; else lo = mid; }
    info('Compact @390 wide: shortest viewport with no vertical scroll', `${hi} px high (the 844 phone needs ${hi - 844 > 0 ? hi - 844 : 0} px more)`);
    // does the page make the user scroll to reach anything interactive? input and button must be inside the first screen
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(60);
    const reach = await measure();
    check(reach.form.bottom <= reach.ih && reach.title.top >= 0, 'Compact @390x844: title, narrator and the whole form are inside the first screen (no scroll needed to reach the controls)', `form bottom ${reach.form.bottom} <= viewport ${reach.ih}; title top ${reach.title.top}`);
    await shot(p, 'scroll-compact-viewport', '390-light');
    await shot(p, 'scroll-compact-fullpage', '390-light', { fullPage: true });
    await ctx.close();
  }

  // ================= 10. Bubble swap latency (frontend warning 2) =================
  if (want('latency')) {
    const probe = async (label, url, opts = {}) => {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', ...opts }, { url, tag: `4b-lat-${label}` });
      await waitIntro(p);
      await p.waitForTimeout(800);
      const g0 = await p.evaluate(() => window.__gaps.length);
      await p.waitForTimeout(2500);
      const idleGaps = await p.evaluate((g0) => window.__gaps.slice(g0).map((g) => Math.round(g.gap)), g0);
      const res = await p.evaluate(async () => {
        const form = document.querySelector('form.feeling'), line = document.querySelector('#narrator-line'), out = [];
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 700));
          const n0 = window.__txt.length, a0 = window.__alog.length, g0 = window.__gaps.length, t0 = performance.now();
          form.requestSubmit();
          await new Promise((r) => { const iv = setInterval(() => { if (window.__txt.length > n0 || performance.now() - t0 > 12000) { clearInterval(iv); r(); } }, 4); });
          const txt = window.__txt[n0];
          out.push({
            latency: txt ? txt.t - t0 : null,
            anims: window.__alog.slice(a0).filter((x) => x.el.classList.contains('bubble__text')).map((x) => ({ start: Math.round(x.t - t0), fin: x.fin > 0 ? Math.round(x.fin - t0) : x.fin, dur: x.dur })),
            gaps: window.__gaps.slice(g0).map((g) => Math.round(g.gap)),
          });
        }
        return out;
      });
      await ctx.close();
      return { label, idleGaps, res };
    };
    const fmt = (r) => `${r.label}: idle rAF gaps >100 ms in 2.5 s: [${r.idleGaps}]; swap latency per try (ms) [${r.res.map((x) => x.latency === null ? 'never' : x.latency.toFixed(0))}]; fade-out animation start/finished (ms after the trigger): ${r.res.map((x) => x.anims[0] ? `${x.anims[0].start}/${x.anims[0].fin}` : 'none').join(' ')}; rAF gaps >100 ms during the swap: ${JSON.stringify(r.res.map((x) => x.gaps))}`;
    const frozen = await probe('frozen-bg(?t=9500)', `${BASE}/?t=9500&notl`);
    const live = await probe('live-bg', `${BASE}/?notl`);
    const rm = await probe('live-bg+reduced-motion', `${BASE}/?notl`, { reducedMotion: 'reduce' });
    lines.push(`latency ${fmt(frozen)}`, `latency ${fmt(live)}`, `latency ${fmt(rm)}`);
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const lf = frozen.res.map((x) => x.latency ?? 99999), ll = live.res.map((x) => x.latency ?? 99999);
    check(Math.max(...lf) < 1000, 'Bubble swap with the background frozen (?t=9500): every line change completes in < 1 s (fade-out 160 ms + swap)', `latencies ${lf.map((v) => v.toFixed(0))} ms, median ${med(lf).toFixed(0)}`);
    check(med(ll) < 1000, 'Bubble swap with the live WebGL background (SwiftShader): median < 1 s', `latencies ${ll.map((v) => v.toFixed(0))} ms, median ${med(ll).toFixed(0)}, max ${Math.max(...ll).toFixed(0)}; longest rAF gap during swaps ${Math.max(0, ...live.res.flatMap((x) => x.gaps))} ms`);
    info('Bubble swap with live background: max', `${Math.max(...ll).toFixed(0)} ms (frozen max ${Math.max(...lf).toFixed(0)} ms)`);
  }

  // ================= 10b. Revision 2 (DESIGN §14.10 / §14.12) =================
  if (want('rev2')) {
    const BUBBLE_SAMPLER = () => { // one sample per frame of the bubble box and of its text span
      window.__bub = [];
      document.addEventListener('input', () => { window.__inputT = performance.now(); }, true);
      const tick = () => {
        const b = document.querySelector('#narrator-line');
        if (b) {
          const cs = getComputedStyle(b), t = b.querySelector('.bubble__text'), ts = t && getComputedStyle(t);
          window.__bub.push({ t: performance.now(), op: Number(cs.opacity), sc: cs.scale, vis: cs.visibility, top: ts ? Number(ts.opacity) : null, txt: t?.textContent ?? '' });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const INIT2 = [SCREEN_HELPERS, BUBBLE_SAMPLER];
    const LAND = { width: 844, height: 390 };
    const metrics = (p) => p.evaluate(() => {
      const q = (s) => document.querySelector(s), r = (e) => e.getBoundingClientRect(), de = document.documentElement, b = q('#narrator-line');
      return { docH: de.scrollHeight, ih: innerHeight, docW: de.scrollWidth, iw: innerWidth, chaoH: q('.narrator .chao').offsetHeight, formBottom: r(q('form.feeling')).bottom + scrollY, bubbleH: r(b).height, bubbleMin: parseFloat(getComputedStyle(b).minBlockSize), layout: q('#app').dataset.layout };
    });
    const MOCK_STATE = { results: 'results', empty: 'no-results', offtopic: 'no-results', error: 'error', timeout: 'error' };
    const realState = async (viewport, scheme, mock, tag, shotName) => {
      const { ctx, p } = await open({ viewport, colorScheme: scheme }, { url: `${BASE}/?t=9500&mock=${mock}&notl`, tag: `4b-rev2-${mock}-${tag}`, init: INIT2 });
      await waitIntro(p);
      await type(p, 'a feeling');
      await p.keyboard.press('Enter');
      await waitState(p, MOCK_STATE[mock], 20000);
      await settle(p);
      const m = await metrics(p);
      if (shotName) await shot(p, shotName, tag);
      await ctx.close();
      return m;
    };

    // ---- A. intro pop: scale 0.92 -> 1 together with the opacity, from the Chao's corner; reduced motion: opacity only ----
    for (const reduced of [false, true]) {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', ...(reduced ? { reducedMotion: 'reduce' } : {}) }, { url: `${BASE}/?t=9500&notl`, tag: `4b-rev2-pop-${reduced ? 'rm' : 'motion'}`, init: INIT2 });
      await waitIntro(p);
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => {
        const b = document.querySelector('#narrator-line'), o = getComputedStyle(b).transformOrigin.split(' ').map(parseFloat);
        return { bub: window.__bub, t0: window.__bub[0].t, h: b.getBoundingClientRect().height, origin: o };
      });
      const shown = r.bub.filter((x) => x.vis === 'visible');
      const scales = shown.map((x) => (x.sc === 'none' ? 1 : parseFloat(x.sc)));
      const ops = shown.map((x) => x.op);
      const first = shown[0];
      const rise = ops.every((v, i) => i === 0 || v >= ops[i - 1] - 0.001);
      const tag = reduced ? 'reduced motion' : 'motion';
      if (!reduced) {
        const probe = (await alog(p, 0, true)).find((x) => x.tgt === 'bubble');
        check(!!probe && /^0\.92/.test(probe.sc) && probe.props.includes('scale'), `Intro pop (${tag}): the bubble box animation starts at scale 0.92 and animates scale + opacity`, probe ? `scale at t=0 "${probe.sc}", props ${JSON.stringify(probe.props)}, ${probe.dur} ms` : 'no animation on #narrator-line');
        check(shown.length > 3 && Math.min(...scales) < 1 && Math.min(...scales) >= 0.915 && scales.at(-1) === 1 && ops.at(-1) === 1 && first.op < 0.95 && rise,
          `Intro pop (${tag}): sampled per frame, scale grows within [0.92, 1] to exactly 1 while opacity rises monotonically 0 -> 1`, `${shown.length} visible samples; scale min ${Math.min(...scales).toFixed(3)} -> last ${scales.at(-1)}; opacity first ${first.op.toFixed(2)} -> last ${ops.at(-1)}; monotonic ${rise}`);
        check(Math.abs(r.origin[0]) < 1 && Math.abs(r.origin[1] - r.h) < 1.5, `Intro pop (${tag}): transform-origin is the bottom-left corner (the corner that points at the Chao)`, `computed origin ${r.origin.map((v) => v.toFixed(1)).join('px ')}px for a ${r.h.toFixed(1)} px tall box`);
      } else {
        const ms = first ? first.t - r.t0 : Infinity, full = shown.find((x) => x.op >= 0.99);
        check(shown.length > 0 && scales.every((v) => v === 1) && shown.every((x) => x.sc === 'none') && rise && ops.at(-1) === 1, `Intro pop (${tag}): scale is always 'none', only the opacity rises (no scaling at all)`, `${shown.length} visible samples; distinct scale values ${JSON.stringify([...new Set(shown.map((x) => x.sc))])}; opacity ${ops[0]?.toFixed(2)} -> ${ops.at(-1)}, monotonic ${rise}`);
        check(first && ms < 600, `Intro pop (${tag}): the bubble becomes visible within ~0.5 s of the first frame`, `first visible sample ${ms.toFixed(0)} ms after the first frame; fully opaque at ${full ? (full.t - r.t0).toFixed(0) : 'n/a'} ms`);
      }
      await ctx.close();
    }

    // ---- B. line change: the box stays at opacity 1, only span.bubble__text fades; timer-driven swap ----
    for (const reduced of [false, true]) {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', ...(reduced ? { reducedMotion: 'reduce' } : {}) }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: `4b-rev2-swap-${reduced ? 'rm' : 'motion'}`, init: INIT2 });
      await waitIntro(p);
      await settle(p);
      await p.waitForTimeout(400);
      await p.focus('#feeling');
      await p.keyboard.type('c');
      await waitText(p, n.typing);
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => {
        const t0 = window.__inputT, win = window.__bub.filter((x) => x.t >= t0 && x.t <= t0 + 700), sw = window.__txt.find((x) => x.text === document.querySelector('#narrator-line .bubble__spoken').textContent && x.t >= t0);
        return { win, latency: sw ? sw.t - t0 : null, spanAnims: window.__alog.filter((a) => a.t >= t0 && a.el.classList.contains('bubble__text')).map((a) => ({ props: a.props, dur: a.dur })), boxAnims: window.__alog.filter((a) => a.t >= t0 && a.el.id === 'narrator-line').length, final: document.querySelector('#narrator-line .bubble__spoken').textContent, finalTop: getComputedStyle(document.querySelector('.bubble__text')).opacity };
      });
      const boxOps = r.win.map((x) => x.op), topMin = Math.min(...r.win.map((x) => x.top));
      const tag = reduced ? 'reduced motion' : 'motion';
      check(r.win.length > 3 && boxOps.every((v) => v === 1) && r.boxAnims === 0, `Line change (${tag}): the bubble BOX stays at opacity 1 on every frame and gets no animation`, `${r.win.length} frames in 700 ms; box opacity set ${JSON.stringify([...new Set(boxOps)])}; animations on the box: ${r.boxAnims}`);
      if (!reduced) {
        const upAgain = r.win.some((x, i) => i > 0 && x.top > r.win[i - 1].top + 0.2);
        check(topMin <= 0.5 && upAgain && Number(r.finalTop) === 1 && r.final === n.typing && r.spanAnims.length >= 1, 'Line change (motion): only span.bubble__text fades (clearly below 1, then back to 1); final text = typing line. §17: no fade-in any more and the swap timer (160 ms) cuts the 160 ms fade-out, so the last frame sampled is not 0',
          `text-span opacity min ${topMin.toFixed(2)} across ${r.win.length} frames, rises again ${upAgain}, final opacity ${r.finalTop}, span animations ${JSON.stringify(r.spanAnims)}, final "${r.final}"`);
        check(r.latency !== null && r.latency < 300, 'Line change (motion): the text swaps by timer in < 300 ms after the input event (calm machine, frozen background)', `${r.latency === null ? 'never' : r.latency.toFixed(0)} ms from the input event to the new text`);
      } else {
        check(topMin === 1 && r.spanAnims.length === 0 && r.final === n.typing && r.latency !== null && r.latency < 100, 'Line change (reduced motion): instant swap, no fade at all', `text-span opacity min ${topMin}, span animations ${r.spanAnims.length}, latency ${r.latency === null ? 'never' : r.latency.toFixed(0)} ms`);
      }
      await ctx.close();
    }
    // background tab: timers still run when no frames are produced (animation.finished would not)
    {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: '4b-rev2-bgtab', init: INIT2 });
      await waitIntro(p);
      await p.waitForTimeout(600);
      const p2 = await ctx.newPage();
      await p2.goto('about:blank');
      await p2.bringToFront();
      await p.waitForTimeout(300);
      const vis = await p.evaluate(() => document.visibilityState);
      await p.evaluate(() => { const i = document.querySelector('#feeling'); i.value = 'c'; window.__inputT = performance.now(); i.dispatchEvent(new Event('input', { bubbles: true })); });
      const ok = await p.waitForFunction((t) => document.querySelector('#narrator-line .bubble__spoken').textContent === t, n.typing, { timeout: 6000, polling: 100 }).then(() => true, () => false);
      const lat = await p.evaluate(() => { const x = window.__txt.findLast((e) => e.t >= window.__inputT); return x ? x.t - window.__inputT : null; });
      info('Line change in a tab without frames', `document.visibilityState = "${vis}" (${vis === 'hidden' ? 'frames really stopped' : 'headless keeps painting: this only shows that the swap works, not that it survives hidden tabs'}); swap ${ok ? 'happened' : 'did NOT happen'} ${lat === null ? '' : lat.toFixed(0) + ' ms'} after the input`);
      check(ok, 'Line change with the tab in the background: the text still swaps (timer, not animation.finished)', `${ok ? 'swapped' : 'never swapped'}; visibilityState ${vis}; ${lat === null ? 'n/a' : lat.toFixed(0)} ms`);
      await ctx.close();
    }

    // ---- C. every phrase fits the lines reserved for it ----
    {
      const cases = [
        { vp: [390, 844], layout: 'compact', max: 2 }, { vp: [1440, 900], layout: 'compact', max: 2 }, { vp: [375, 667], layout: 'compact', max: 2 }, { vp: [374, 667], layout: 'compact', max: 3 }, { vp: [360, 640], layout: 'compact', max: 3 },
        { vp: [390, 844], layout: 'full', max: 3 }, { vp: [1440, 900], layout: 'full', max: 2 }, { vp: [768, 1024], layout: 'full', max: 2 },
        { vp: [844, 390], layout: 'full', max: 2 }, { vp: [844, 390], layout: 'compact', max: 2 }, { vp: [320, 568], layout: 'compact', max: 3, soft: true },
      ];
      // DESIGN 14.13: the five longest realistic summaries (<= 26 chars) the narrator may repeat, in every template
      const SUMMARIES = ['Mortal Kombat-like fighter', 'MMORPG for Mac and Windows', 'Mass Effect-like space RPG', 'Pokemon-like monster RPG', 'co-op adventure'];
      const phrases = SUMMARIES.flatMap((summary) => Object.entries(n).map(([k, v]) => [k + ' [' + summary + ']', fillT(v, { summary, seconds: '120' })])).filter(([, t], i, all) => all.findIndex(([, u]) => u === t) === i);
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', reducedMotion: 'reduce' }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: '4b-rev2-lines', init: INIT2 });
      await waitIntro(p);
      for (const c of cases) {
        await p.setViewportSize({ width: c.vp[0], height: c.vp[1] });
        await p.evaluate((l) => { document.querySelector('#app').dataset.layout = l; }, c.layout);
        await p.waitForTimeout(80);
        const res = await p.evaluate((ph) => {
          const b = document.querySelector('#narrator-line'), t = b.querySelector('.bubble__text'), out = [];
          const lh = parseFloat(getComputedStyle(b).lineHeight), min = parseFloat(getComputedStyle(b).minBlockSize);
          const ft = () => document.querySelector('form.feeling').getBoundingClientRect().top, f0 = ft();
          let moved = 0;
          for (const [k, v] of ph) { t.textContent = v; moved = Math.max(moved, Math.abs(ft() - f0)); out.push({ k, lines: Math.round(t.getBoundingClientRect().height / lh), grew: b.getBoundingClientRect().height > min + 1 }); }
          return { out, lh, min, moved };
        }, phrases);
        const bad = res.out.filter((x) => x.lines > c.max || x.grew);
        const label = `Phrases fit the reserved lines: ${c.vp.join('x')} ${c.layout} (max ${c.max})`;
        const detail = `${phrases.length} phrases; reserved box ${res.min.toFixed(0)} px (line ${res.lh.toFixed(1)} px); line counts ${res.out.map((x) => x.lines).join(',')}; over the limit: [${bad.map((x) => `${x.k}=${x.lines}${x.grew ? ' (box grew)' : ''}`)}]`;
        if (c.soft) info(label, detail); else check(bad.length === 0 && res.moved < 0.5, label, detail + `; input moved up to ${res.moved.toFixed(2)} px (want 0)`);
      }
      await ctx.close();
    }

    // ---- D. real states: sizes, no vertical scroll, landscape ----
    for (const vp of VIEWPORTS) {
      const exp = vp.width === 390 ? 77 : 120;
      for (const mock of ['results', 'empty', 'offtopic', 'error', 'timeout']) {
        const m = await realState(vp, 'light', mock, `${vp.width}-light`, null);
        check(m.layout === 'compact' && Math.abs(m.chaoH - exp) <= 1.5, `[${vp.width}] ${mock}: compact Chao is ~${exp} px tall`, `offsetHeight ${m.chaoH} px`);
        check(m.docH <= m.ih && m.docW <= m.iw, `[${vp.width}x${vp.height}] ${mock}: no vertical scroll in compact (scrollHeight == innerHeight) and no horizontal`, `scrollHeight ${m.docH} vs innerHeight ${m.ih}; scrollWidth ${m.docW} vs ${m.iw}; bubble ${m.bubbleH.toFixed(0)} px (reserved ${m.bubbleMin.toFixed(0)})`);
      }
    }
    for (const scheme of SCHEMES) {
      const tag = `${LAND.width}-${scheme}`;
      const { ctx, p } = await open({ viewport: LAND, colorScheme: scheme }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: `4b-rev2-land-${tag}`, init: INIT2 });
      await waitIntro(p);
      await settle(p);
      let m = await metrics(p);
      check(m.formBottom <= LAND.height, `[844x390 ${scheme}] intro: the whole form is above the fold`, `form bottom ${m.formBottom.toFixed(0)} <= 390; document ${m.docH}`);
      await shot(p, 'intro', tag);
      await p.focus('#feeling'); await p.keyboard.type('cozy');
      await waitText(p, n.typing); await shot(p, 'typing', tag);
      await p.keyboard.press('Enter');
      await waitText(p, n.thinking); await p.waitForTimeout(300); await shot(p, 'thinking', tag);
      await waitState(p, 'results', 12000); await settle(p);
      m = await metrics(p);
      check(m.formBottom <= LAND.height, `[844x390 ${scheme}] results: the whole form is above the fold`, `form bottom ${m.formBottom.toFixed(0)} <= 390; document ${m.docH} (the footer/shelf may sit below: design accepts it)`);
      await shot(p, 'results', tag);
      await ctx.close();
      for (const mock of ['empty', 'error']) {
        const mm = await realState(LAND, scheme, mock, tag, mock === 'empty' ? 'no-results' : 'error');
        check(mm.formBottom <= LAND.height, `[844x390 ${scheme}] ${mock}: the whole form is above the fold`, `form bottom ${mm.formBottom.toFixed(0)} <= 390; bubble ${mm.bubbleH.toFixed(0)} px`);
      }
    }

    // ---- E. empty-input: thick inset edge (also with reduced motion); touch never focuses by script ----
    for (const reduced of [false, true]) {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', ...(reduced ? { reducedMotion: 'reduce' } : {}) }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: `4b-rev2-invalid-${reduced ? 'rm' : 'motion'}`, init: INIT2 });
      await waitIntro(p);
      const before = await p.evaluate(() => getComputedStyle(document.querySelector('#feeling')).boxShadow);
      await p.focus('#feeling'); await p.keyboard.press('Enter');
      await waitText(p, n.emptyInput); await settle(p);
      const after = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('#feeling')); return { sh: cs.boxShadow, bc: cs.borderColor, inv: document.querySelector('#feeling').getAttribute('aria-invalid') }; });
      const bw = await px(p, '--border-control');
      const has = new RegExp(`0px 0px 0px ${bw}px inset`).test(after.sh);
      check(after.inv === 'true' && has && !/0px 0px 0px ${bw}px inset/.test(before), `empty-input (${reduced ? 'reduced motion' : 'motion'}): aria-invalid + an inset ${bw}px box-shadow (thicker edge) that the idle input does not have`, `idle shadow "${before.slice(0, 70)}"; invalid shadow "${after.sh.slice(0, 110)}"; border colour ${after.bc}`);
      await ctx.close();
    }
    {
      const { ctx, p } = await open({ viewport: VIEWPORTS[0], deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: '4b-rev2-touch', init: INIT2 });
      await waitIntro(p);
      await p.tap('.feeling__submit');
      await waitText(p, n.emptyInput);
      const a = await snap(p);
      check(a.state === 'empty-input' && a.focus !== 'feeling', 'Touch: an empty submit shows the emptyInput line without focusing the input by script', `state ${a.state}, activeElement ${a.focus} (the tapped button, not #feeling)`);
      await p.fill('#feeling', 'cozy');
      await p.tap('.feeling__submit');
      await waitState(p, 'results', 12000); await settle(p);
      const b = await snap(p);
      check(b.state === 'results' && b.focus !== 'feeling', 'Touch: after the results arrive the input is not focused by script (the keyboard does not pop back up)', `state ${b.state}, activeElement ${b.focus}`);
      await ctx.close();
    }

    // ---- F. invisible-only text is "nothing" (same rule as the server) ----
    {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results&notl`, tag: '4b-rev2-blank', init: INIT2 });
      await waitIntro(p);
      const rows = [];
      for (const [name, v] of [['U+200B', '​'], ['U+200B x3', '​​​'], ['NBSP', ' '], ['U+FEFF', '﻿'], ['U+2060', '⁠'], ['tab+spaces', ' \t  '], ['U+2028', ' ']]) {
        await p.fill('#feeling', v);
        await p.focus('#feeling');
        await p.keyboard.press('Enter');
        await waitText(p, n.emptyInput, 3000); // the line swaps after its 160 ms fade-out
        await p.waitForTimeout(100);
        const s = await snap(p);
        rows.push({ name, ok: s.state === 'empty-input' && s.line === n.emptyInput && s.invalid === 'true' && !s.ro && s.layout === 'full', state: s.state });
      }
      check(rows.every((r) => r.ok), 'Text made only of invisible characters is rejected locally (emptyInput, no request, layout full)', rows.map((r) => `${r.name}:${r.state}${r.ok ? '' : ' FAIL'}`).join(', '));
      await p.fill('#feeling', '​hi');
      await waitText(p, n.typing);
      const s2 = await snap(p);
      check(s2.state === 'typing', 'Control: an invisible character plus real text counts as text (state typing)', `state ${s2.state}`);
      await ctx.close();
    }

    // ---- G. a finder that throws must not leave the form locked (pending + try/finally) ----
    {
      const caught = [];
      const watcher = (pg) => { pg.on('pageerror', (e) => caught.push(e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && caught.push(m.text())); };
      const boom = () => { window.__boom = false; const g = Headers.prototype.get; Headers.prototype.get = function (k) { if (window.__boom && /retry-after/i.test(k)) throw new Error('boom from Headers.get'); return g.call(this, k); }; };
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&notl`, tag: '4b-rev2-throw', init: [SCREEN_HELPERS, boom], watcher });
      await waitIntro(p);
      const json = (status, body, headers = {}) => ({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
      let mode = 'throw';
      await p.route('**/api/**', (r) => {
        const path = new URL(r.request().url()).pathname;
        if (mode === 'throw') return r.fulfill(json(429, { ok: false }, { 'Retry-After': '5' }));
        return path.endsWith('interpret') ? r.fulfill(json(200, { ok: true, summary: 'co-op adventure', genres: ['adventure'], tags: ['co-op'], platforms: [], examples: [] })) : r.fulfill(json(200, { games: [{ id: 1, slug: 'a', name: 'A', released: null, image: 'https://example.invalid/x.jpg' }] }));
      });
      await p.evaluate(() => { window.__boom = true; });
      await p.fill('#feeling', 'cozy');
      await p.click('.feeling__submit');
      await p.waitForFunction(() => document.querySelector('form.feeling').getAttribute('aria-busy') === 'false' && !document.querySelector('#feeling').readOnly, null, { timeout: 8000 }).catch(() => undefined);
      const s = await snap(p);
      check(!s.ro && !s.dis && s.busy === 'false', 'Finder that throws: the form is unlocked again (input not readonly, button enabled, aria-busy=false)', `readonly ${s.ro}, disabled ${s.dis}, aria-busy ${s.busy}; state ${s.state}, mood ${s.mood}, line "${s.line}"; page errors seen: ${JSON.stringify(caught.map((c) => c.slice(0, 80)))}`);
      info('Finder that throws: what the narrator shows afterwards', `state ${s.state}, mood ${s.mood}, line "${s.line}"`);
      mode = 'ok'; await p.evaluate(() => { window.__boom = false; });
      await p.fill('#feeling', 'cozy again');
      await p.click('.feeling__submit');
      await waitState(p, 'results', 12000);
      await waitText(p, fillT(n.results, { summary: 'co-op adventure' }), 8000);
      const s3 = await snap(p);
      check(s3.state === 'results' && s3.focus === 'feeling', 'Finder that throws: a second search right afterwards works (pending was reset)', `state ${s3.state}, line "${s3.line}"`);
      await ctx.close();
    }

    // ---- H. static bits: no scrollbar-gutter, RAWG hit area ----
    for (const vp of VIEWPORTS) {
      const { ctx, p } = await open({ viewport: vp, colorScheme: 'light' }, { url: `${BASE}/?t=9500&notl`, tag: `4b-rev2-static-${vp.width}`, init: INIT2 });
      await waitIntro(p);
      const r = await p.evaluate(() => { const a = document.querySelector('footer a'), rs = [...a.getClientRects()].map((x) => Math.round(x.height * 10) / 10); const f = document.querySelector('footer'), fr = f.getBoundingClientRect(); return { gutter: getComputedStyle(document.documentElement).scrollbarGutter, rects: rs, text: a.textContent, cw: document.documentElement.clientWidth, iw: innerWidth, fh: Math.round(fr.height * 10) / 10, fb: Math.round(fr.bottom), ih: innerHeight, lineTop: Math.round(f.querySelector('a').getBoundingClientRect().top) }; });
      check(r.gutter === 'auto' && r.cw === r.iw, `[${vp.width}] no reserved scrollbar gutter (no empty strip at the right edge)`, `scrollbar-gutter "${r.gutter}", clientWidth ${r.cw} vs innerWidth ${r.iw}`);
      info(`[${vp.width}] footer geometry`, `footer height ${r.fh}, bottom ${r.fb}/${r.ih}, link top ${r.lineTop}`);
      check(r.rects.length > 0 && r.rects.every((h) => h >= 44), `[${vp.width}] RAWG link hit area is >= 44 px tall`, `client rect heights ${JSON.stringify(r.rects)} px for "${r.text}"`);
      await ctx.close();
    }
  }

  // ================= 10b. DESIGN 14.13 re-focus: "what kind of game", narrator and heading texts =================
  if (want('reframe')) {
    // literal strings on purpose: they pin the shipped copy, not whatever content.ts says today
    const send = async (p, text) => { await type(p, text); await p.keyboard.press('Enter'); };
    const seqOf = async (p) => (await p.evaluate(() => window.__txt.map((x) => x.text))).filter((t, i, a) => t && t !== a[i - 1]);
    {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=empty`, tag: '4b-reframe-empty' });
      await waitIntro(p);
      await send(p, 'single-player metroidvania for Switch');
      await waitState(p, 'no-results', 20000); await waitText(p, 'No games fit all of that. Try fewer details?', 8000);
      const seq = await seqOf(p);
      check(seq.includes('Got it! Looking for games…') && !seq.some((t) => t.includes('metroidvania')), 'Reframe ?mock=empty: a 36-char summary is not spoken; the narrator says "Got it! Looking for games…"', `line sequence ${JSON.stringify(seq)}`);
      await ctx.close();
    }
    {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=results`, tag: '4b-reframe-results' });
      await waitIntro(p);
      await send(p, 'a co-op adventure');
      await waitState(p, 'results', 20000); await waitText(p, 'Ooh, cozy indie games! Try these.', 8000);
      const seq = await seqOf(p), h2 = await p.evaluate(() => document.querySelector('#shelf-heading')?.textContent);
      check(seq.includes('Got it: cozy indie games. Looking…') && seq.at(-1) === 'Ooh, cozy indie games! Try these.' && seq.indexOf('Got it: cozy indie games. Looking…') < seq.indexOf('Ooh, cozy indie games! Try these.'), 'Reframe ?mock=results: "Got it: cozy indie games. Looking…" then "Ooh, cozy indie games! Try these."', `line sequence ${JSON.stringify(seq)}`);
      check(h2 === 'Games matching cozy indie games', 'Reframe ?mock=results: h2 is "Games matching cozy indie games"', `h2 "${h2}"`);
      await ctx.close();
    }
    {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500&noblink&mock=results`, tag: '4b-reframe-ph' });
      await waitIntro(p);
      for (const w of [320, 390, 480, 768, 1440]) {
        await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(150);
        const r = await p.evaluate(() => {
          const i = document.querySelector('#feeling'), cs = getComputedStyle(i), ph = getComputedStyle(i, '::placeholder');
          const c = document.createElement('canvas').getContext('2d');
          c.font = `${ph.fontStyle} ${ph.fontWeight} ${ph.fontSize} ${ph.fontFamily}`; c.letterSpacing = ph.letterSpacing === 'normal' ? '0px' : ph.letterSpacing;
          const textW = c.measureText(i.placeholder).width, box = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { ph: i.placeholder, textW, box };
        });
        check(r.ph === 'A co-op adventure for Switch' && r.textW <= r.box, `Reframe placeholder fully visible at ${w}`, `"${r.ph}" text ${r.textW.toFixed(0)} px vs content box ${r.box.toFixed(0)} px`);
      }
      await ctx.close();
    }
    {
      // "feeling" may only appear in the page title; scan the content object and the rendered intro (text + attributes)
      const strs = []; const walk = (o, path) => { for (const [k, v] of Object.entries(o)) typeof v === 'string' ? strs.push([`${path}.${k}`, v]) : walk(v, `${path}.${k}`); };
      walk(content, 'content');
      const bad = strs.filter(([k, v]) => k !== 'content.pageTitle' && !k.startsWith('content.styleTile') && /feeling/i.test(v)).map(([k]) => k);
      check(bad.length === 0, 'Reframe: the word "feeling" appears only in content.pageTitle', bad.length ? `found in ${bad}` : `${strs.length} strings scanned`);
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=9500`, tag: '4b-reframe-dom' });
      await waitIntro(p);
      const r = await p.evaluate(() => {
        const hits = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        for (let e = walker.currentNode; e; e = walker.nextNode()) {
          if (e.closest('h1') || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
          for (const a of e.attributes) if (/feeling/i.test(a.value) && !['class', 'id', 'name', 'for', 'aria-describedby'].includes(a.name)) hits.push(`${e.tagName}[${a.name}]`);
          for (const t of e.childNodes) if (t.nodeType === 3 && /feeling/i.test(t.textContent)) hits.push(`${e.tagName} text`);
        }
        return { hits, desc: document.querySelector('meta[name=description]')?.content ?? null, title: document.title, h1: document.querySelector('h1')?.textContent };
      });
      check(r.hits.length === 0 && r.title === 'Game Feelings' && r.h1 === 'Game Feelings', 'Reframe: rendered intro (text + attributes) has no "feeling" outside the title and h1', `hits [${r.hits}]; <title> "${r.title}"; h1 "${r.h1}"`);
      check(!!r.desc && r.desc.length >= 50 && !/feeling|emotion/i.test(r.desc), 'Reframe: <meta name="description"> exists, is real text and does not talk about feelings', `"${r.desc}"`);
      await ctx.close();
    }
    // every outcome line at 390 and 375 compact: 2 lines at most (real states, not injected text)
    for (const [w, h] of [[390, 844], [375, 667]]) for (const mock of ['results', 'empty', 'offtopic', 'error', 'rate', 'busy', 'network', 'timeout']) {
      const { ctx, p } = await open({ viewport: { width: w, height: h }, colorScheme: 'light' }, { url: `${BASE}/?t=9500&mock=${mock}&notl`, tag: `4b-reframe-lines-${mock}-${w}` });
      await waitIntro(p);
      await send(p, 'a co-op adventure');
      await waitState(p, mock === 'results' ? 'results' : mock === 'empty' || mock === 'offtopic' ? 'no-results' : 'error', 20000);
      await p.waitForTimeout(700); await settle(p);
      const r = await p.evaluate(() => { const b = document.querySelector('#narrator-line'), t = b.querySelector('.bubble__text'), lh = parseFloat(getComputedStyle(b).lineHeight); return { text: t.textContent, lines: Math.round(t.getBoundingClientRect().height / lh), layout: document.querySelector('#app').dataset.layout }; });
      check(r.layout === 'compact' && r.lines <= 2, `Reframe lines [${w}x${h} compact mock=${mock}]: at most 2 lines`, `${r.lines} line(s): "${r.text}"`);
      await ctx.close();
    }
  }

  // ================= 11. Production build: no mock, no lab, no dev hooks =================
  if (want('build')) {
    const dir = 'dist/assets';
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.js'));
    const js = (await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')))).join('\n');
    const hits = ['nostalgic', 'chao-lab', 'mockFinder', 'offtopic', '__screen', '__chao', '__holoSeek', 'noblink', '[api]', 'MOCKS', 'mock', 'single-player metroidvania'].filter((k) => js.includes(k));
    check(files.length > 0 && hits.length === 0, 'Build: the production JS has no mock finder, no lab and no dev hooks ("nostalgic", "chao-lab", "mockFinder", "offtopic", "__screen", "__chao", "__holoSeek", "noblink", "[api]": 0 hits)', `${files.length} JS file(s), ${(js.length / 1024).toFixed(1)} KB; hits: [${hits}]`);
    const css = (await Promise.all((await readdir(dir)).filter((f) => f.endsWith('.css')).map((f) => readFile(join(dir, f), 'utf8')))).join('\n');
    check(!css.includes('chao-lab') && !css.includes('tile-section'), 'Build: the production CSS has no lab/style-tile rules', `css ${(css.length / 1024).toFixed(1)} KB; chao-lab ${css.includes('chao-lab')}, tile-section ${css.includes('tile-section')}`);
    if (PROD) {
      const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${PROD}/?lab&mock=results&t=100`, tag: '4b-prod' });
      await waitIntro(p, 20000);
      const r = await p.evaluate(() => ({ screenHook: typeof window.__screen, tile: !!document.querySelector('.tile'), labBtns: document.querySelectorAll('.lab-btn').length, h1: document.querySelector('h1')?.textContent, focus: document.activeElement.id }));
      check(r.screenHook === 'undefined' && !r.tile && r.labBtns === 0 && r.h1 === content.pageTitle && r.focus === 'feeling', 'Prod page: ?lab, ?mock and ?t are ignored; the intro runs and focuses the input; no window.__screen', JSON.stringify(r));
      await ctx.close();
    }
  }

  if (shots.length) lines.push(`4b shots (${shots.length}): ${OUT}/4b-{intro,empty-input,typing,thinking,thinking-long,results,typing-compact,no-results,error}-{390,1440}-{light,dark}.png, 4b-outcome-*-1440-light.png, 4b-results-fullpage-390-*.png, 4b-reduced-motion-results-*.png, 4b-focus-*.png, 4b-scroll-*.png`);
}

// ---------------- standalone ----------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const BASE = process.env.VERIFY_URL || 'http://localhost:5173';
  const errors = [], lines = [];
  const watch = (page, tag) => {
    page.on('console', (m) => m.type() === 'error' && !(/status of 404/.test(m.text()) && isExpected404(m.location().url)) && errors.push(`[${tag}] console: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`[${tag}] request failed: ${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => r.status() >= 400 && !(r.status() === 404 && isExpected404(r.url())) && errors.push(`[${tag}] HTTP ${r.status()}: ${r.url()}`));
  };
  const check = (ok, label, detail, errMsg) => { if (!ok) errors.push(`${errMsg ?? label}: ${detail}`); lines.push(`${label}: ${detail} ${ok ? 'OK' : 'FAIL'}`); };
  const info = (label, detail) => lines.push(`${label}: ${detail} (info)`);
  const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', args: ARGS }).catch(() => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ARGS }));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replaceAll('\\', '/').replace(/^\/+/, '');
    const file = join('dist', path.endsWith('/') || !path ? path + 'index.html' : path);
    const body = await readFile(file).catch(() => null);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    await runScreen({ browser, BASE, PROD: `http://127.0.0.1:${server.address().port}`, OUT: 'verify-shots', VIEWPORTS: [{ width: 390, height: 844 }, { width: 1440, height: 900 }], SCHEMES: ['light', 'dark'], errors, lines, watch, check, info, content: contentDefault });
  } finally { server.close(); await browser.close(); }
  console.log(lines.join('\n'));
  if (errors.length) { console.error(`\n${errors.length} error(s):\n${errors.join('\n')}`); process.exit(1); }
  console.log('\nverify-screen: OK, 0 errors');
}
