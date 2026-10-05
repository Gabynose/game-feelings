// Polish checks: the Chao types its bubble with blips (DESIGN §17, cases in §17.8).
// Called by scripts/verify.mjs (runTyping). Standalone (dev server up):
//   VERIFY_URL=http://localhost:5176 node scripts/verify-typing.mjs     (VERIFY_ONLY=intro,reflow,interrupt,audio,mute,storage,reduced,forced,button,shots)
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { content as contentDefault } from '../src/content.ts';
import { blipMask, typeSchedule } from '../src/lib/type.ts';
import { pitch } from '../src/lib/blip.ts';
import { isExpected404 } from './verify-results.mjs';

const T = { char: 32, pauseSentence: 200, pauseComma: 100, max: 2200 };

// In-page instrumentation: bubble sampler (every 8 ms), live-region mutation counters, Web Audio spy, controllable document.hidden.
const INSTRUMENT = () => {
  window.__s = []; window.__anim = []; window.__mo = { spoken: 0, typed: 0 }; window.__hid = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hid });
  const q = (s) => document.querySelector(s);
  setInterval(() => {
    const b = q('#narrator-line'); if (!b) return;
    const sp = b.querySelector('.bubble__spoken'), tx = b.querySelector('.bubble__text');
    const ty = tx?.querySelector('.bubble__typed'), pe = tx?.querySelector('.bubble__pending');
    if (!sp || !ty || !pe) return;
    const rs = [...tx.getClientRects()], last = rs.at(-1);
    window.__s.push({
      t: performance.now(), sp: sp.textContent, ty: ty.textContent, pe: pe.textContent, w: b.offsetWidth, h: b.offsetHeight, th: tx.offsetHeight, lines: rs.length,
      lr: last ? Math.round(last.right * 2) / 2 : null, lb: last ? Math.round(last.bottom * 2) / 2 : null,
      talk: q('.narrator .chao')?.dataset.talking ?? '', st: q('#app')?.dataset.state, lay: q('#app')?.dataset.layout, op: Number(getComputedStyle(tx).opacity), pv: getComputedStyle(pe).visibility,
    });
  }, 8);
  new MutationObserver((ms) => {
    for (const m of ms) {
      const e = (m.target.nodeType === 3 ? m.target.parentElement : m.target);
      if (e?.closest?.('.bubble__spoken')) window.__mo.spoken++;
      else if (e?.closest?.('.bubble__text')) window.__mo.typed++;
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (kf, o) { window.__anim.push({ t: performance.now(), cls: String(this.className), id: this.id, dur: typeof o === 'number' ? o : o?.duration, props: Object.keys((Array.isArray(kf) ? kf[0] : kf) ?? {}) }); return animate.call(this, kf, o); };
  // audio spy
  const au = (window.__au = { ctors: 0, ctxs: [], oscs: [], peaks: [] });
  const AC = window.AudioContext;
  if (AC) window.AudioContext = class extends AC { constructor(...a) { super(...a); au.ctors++; au.ctxs.push(this); } };
  const BP = window.BaseAudioContext?.prototype;
  if (BP) {
    const co = BP.createOscillator, cg = BP.createGain;
    BP.createOscillator = function () { const o = co.call(this); au.oscs.push({ o, t: performance.now() }); return o; };
    BP.createGain = function () {
      const g = cg.call(this), orig = g.gain.linearRampToValueAtTime;
      g.gain.linearRampToValueAtTime = function (v, t) { au.peaks.push(v); return orig.call(this, v, t); };
      return g;
    };
  }
};

const gaps = (arr) => arr.slice(1).map((v, i) => v - arr[i]);

export async function runTyping(env) {
  const { browser, BASE, OUT, errors, lines, watch, check, info } = env;
  const content = env.content ?? contentDefault;
  const n = content.narrator;
  const only = process.env.VERIFY_ONLY ? process.env.VERIFY_ONLY.split(',') : null;
  const want = (s) => !only || only.includes(s);
  const shots = [];
  await mkdir(OUT, { recursive: true });

  const open = async (opts, url, tag, init = [INSTRUMENT]) => {
    const ctx = await browser.newContext(opts);
    for (const f of init) await ctx.addInitScript(f);
    const p = await ctx.newPage();
    watch(p, tag);
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => document.fonts.ready);
    return { ctx, p };
  };
  const waitIntro = (p) => p.waitForFunction(() => {
    const a = document.querySelector('#app'), f = document.querySelector('form.feeling'), s = document.querySelector('.bubble__spoken');
    return a?.dataset.state === 'intro' && document.querySelector('.narrator .chao')?.dataset.mood === 'idle' && f && !f.hasAttribute('data-hidden') && f.getAnimations().length === 0 && s?.textContent
      && document.querySelector('.bubble__pending').textContent === '';
  }, null, { timeout: 40000 });
  const typedAll = (p, text, timeout = 15000) => p.waitForFunction((t) => document.querySelector('.bubble__spoken').textContent === t && document.querySelector('.bubble__pending').textContent === '' && document.querySelector('.bubble__typed').textContent === t, text, { timeout }).then(() => true, () => false);
  const samples = (p) => p.evaluate(() => window.__s);
  const au = (p) => p.evaluate(() => ({ ctors: window.__au.ctors, state: window.__au.ctxs[0]?.state ?? null, n: window.__au.oscs.length, freq: window.__au.oscs.map((x) => x.o.frequency.value), type: [...new Set(window.__au.oscs.map((x) => x.o.type))], t: window.__au.oscs.map((x) => x.t), peaks: window.__au.peaks }));
  const shot = async (p, name) => { const f = `${OUT}/typing-${name}.png`; await p.screenshot({ path: f }); shots.push(f); };
  const slow = (p) => p.addStyleTag({ content: ':root{--type-char:110ms;--type-max:30000ms}' }); // deterministic mid-typing screenshots
  const firstAt = (s, pred) => s.find(pred)?.t ?? null;

  // ================= 1. Intro: text model, timing, pauses, mouth, aria-live, silence before the first gesture =================
  if (want('intro')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500`, 'typing-intro');
    await waitIntro(p);
    await p.waitForTimeout(300);
    const s = await samples(p);
    const live = await p.evaluate(() => {
      const b = document.querySelector('#narrator-line'), tx = b.querySelector('.bubble__text'), sp = b.querySelector('.bubble__spoken');
      return { all: b.textContent, live: sp.getAttribute('aria-live'), atomic: sp.getAttribute('aria-atomic'), boxLive: b.getAttribute('aria-live'), hidden: tx.getAttribute('aria-hidden'), spokenHidden: sp.getAttribute('aria-hidden'), spokenCls: sp.className, mo: window.__mo, kids: [...b.children].map((c) => c.className) };
    });
    const intro = s.filter((x) => x.sp === n.intro);
    check(intro.length > 20 && intro.every((x) => x.ty + x.pe === n.intro), 'Typing intro: from the first frame .bubble__typed + .bubble__pending is the whole line (the box has its final text from the start)', `${intro.length} samples with the intro line; all typed+pending == line: ${intro.every((x) => x.ty + x.pe === n.intro)}`);
    check(live.all === n.intro + n.intro && live.kids.join('|') === 'visually-hidden bubble__spoken|bubble__text', '#narrator-line textContent is the line twice (spoken copy + visible copy), in that DOM order', `textContent length ${live.all.length} (line ${n.intro.length}); children ${JSON.stringify(live.kids)}`);
    check(live.live === 'polite' && live.atomic === 'true' && live.boxLive === null && live.hidden === 'true' && live.spokenHidden === null && /visually-hidden/.test(live.spokenCls), 'A11y: .bubble__spoken aria-live=polite aria-atomic=true (not on the box); .bubble__text aria-hidden=true; .bubble__spoken is the visually-hidden copy, not aria-hidden', JSON.stringify({ live: live.live, atomic: live.atomic, textHidden: live.hidden, spokenHidden: live.spokenHidden, cls: live.spokenCls }));
    check(live.mo.spoken === 1 && live.mo.typed > 20, 'A11y: the live region changes ONCE per line (1 mutation on .bubble__spoken for the intro) while the visible copy changes per letter', `mutations on .bubble__spoken: ${live.mo.spoken}; on the aria-hidden copy: ${live.mo.typed}`);
    const grow = intro.every((x, i) => i === 0 || (x.ty.length >= intro[i - 1].ty.length && n.intro.startsWith(x.ty)));
    check(grow && intro.at(-1).ty === n.intro && intro.at(-1).pe === '', 'Typing intro: .bubble__typed only grows, is always a prefix of the line and ends as the whole line with .bubble__pending empty', `last sample typed "${intro.at(-1).ty}" pending "${intro.at(-1).pe}"`);
    const sched = typeSchedule(n.intro, T);
    const tStart = firstAt(intro, (x) => x.ty.length >= 1), tEnd = firstAt(intro, (x) => x.ty === n.intro);
    check(tStart !== null && tEnd !== null && Math.abs((tEnd - tStart) - sched.total) <= 120, `Typing intro: time from first to last letter ~ typeSchedule().total (${sched.total} ms, +/- 120 ms of timer jitter)`, `${(tEnd - tStart).toFixed(0)} ms measured`);
    const t = (k) => firstAt(intro, (x) => x.ty.length >= k);
    const gapSent = t(6) - t(4), gapNorm = t(4) - t(1);
    check(Math.abs(gapSent - 264) <= 60, 'Typing intro: the gap from "!" to "W" is ~264 ms (32 + 200 pause + 32)', `${gapSent.toFixed(0)} ms (letters "Hey!" -> "Hey! W")`);
    check(Math.abs(gapNorm - 96) <= 40, 'Typing intro: three normal letters ("Hey" -> "Hey!") take ~96 ms (32 ms each)', `${gapNorm.toFixed(0)} ms`);
    info('Typing intro: ms of the first letters', `len>=1 at +0, >=4 at +${(t(4) - t(1)).toFixed(0)}, >=5 at +${(t(5) - t(1)).toFixed(0)}, >=6 at +${(t(6) - t(1)).toFixed(0)}`);
    // mouth
    const during = intro.filter((x) => x.ty.length > 0 && x.pe.length > 0);
    check(during.length > 20 && during.every((x) => x.talk === 'cycle'), 'Mouth: data-talking="cycle" on every sample while .bubble__pending is not empty', `${during.length} samples while typing; cycle on ${during.filter((x) => x.talk === 'cycle').length}`);
    const tOff = firstAt(intro, (x) => x.t > tStart + 300 && x.talk === '');
    check(tOff !== null && Math.abs((tOff - tStart) - (sched.total + T.char)) <= 160, `Mouth: data-talking is removed ~ total + 32 ms (${sched.total + T.char} ms) after the first letter`, `${tOff === null ? 'never' : (tOff - tStart).toFixed(0)} ms`);
    // silence before the first gesture
    const a0 = await au(p);
    check(a0.ctors === 0 && a0.n === 0, 'Audio: before any gesture the intro creates no AudioContext and no oscillator', `AudioContext constructed ${a0.ctors}x, oscillators ${a0.n}`);
    await ctx.close();
  }

  // ================= 2. No reflow while typing; interruption =================
  const REFLOW_VPS = [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 1280, height: 800 }];
  if (want('reflow')) {
    for (const vp of REFLOW_VPS) for (const scheme of ['light', 'dark']) {
      const tag = `${vp.width}-${scheme}`;
      const { ctx, p } = await open({ viewport: vp, colorScheme: scheme }, `${BASE}/?t=9500&mock=error`, `typing-reflow-${tag}`);
      await waitIntro(p);
      await p.focus('#feeling');
      await p.keyboard.type('c');
      await typedAll(p, n.typing);
      await p.keyboard.press('Enter');
      await typedAll(p, n.thinking);
      await typedAll(p, n.error, 12000);
      await p.waitForTimeout(250);
      const s = await samples(p);
      const groups = [...new Set(s.map((x) => x.sp))].filter(Boolean);
      const bad = [], rows = [];
      for (const g of groups) {
        const st0 = s.find((x) => x.sp === g).st;
        const gs = s.filter((x) => x.sp === g && x.ty + x.pe === g && x.op >= 0.999 && x.st === st0); // same state only: the mock error arrives while the thinking line is still typing and the state change itself resizes the box // op < 1 = the fade-out of an interrupted line, while the state change (compact layout) may resize the box
        const typing = gs.filter((x) => x.pe.length > 0 || x.ty.length === g.length);
        if (gs.length < 3) continue;
        const dims = ['w', 'h', 'th', 'lines'].filter((k) => new Set(gs.map((x) => x[k])).size > 1);
        // client rects move with the intro pop / FLIP transforms: compared only for the line typed in place
        const rectKeys = g === n.typing ? ['lr', 'lb'].filter((k) => new Set(gs.map((x) => x[k])).size > 1) : [];
        if (dims.length || rectKeys.length) { const ch = gs.filter((x, i) => i && (x.w !== gs[i - 1].w || x.h !== gs[i - 1].h)).slice(0, 2).map((x) => `at typed ${x.ty.length}: ${x.w}x${x.h} state ${x.st} layout ${x.lay} +${(x.t - gs[0].t).toFixed(0)}ms`); info(`[${tag}] reflow detail`, ch.join(' / ')); }
        if (dims.length || rectKeys.length) bad.push(`"${g.slice(0, 24)}": ${[...dims, ...rectKeys].map((k) => `${k} ${[...new Set(gs.map((x) => x[k]))]}`).join(', ')}`);
        rows.push(`"${g.slice(0, 18)}" ${gs[0].lines}L ${gs[0].w}x${gs[0].h}`);
        void typing;
      }
      check(groups.length >= 4 && !bad.length, `[${tag}] No reflow: the bubble size and line count stay constant while each line is typed (intro, typing, thinking, error)`, bad.length ? bad.join(' | ') : `${groups.length} lines, constant: ${rows.join('; ')}`);
      const fit = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, r: document.querySelector('#narrator-line').getBoundingClientRect().right, l: document.querySelector('#narrator-line').getBoundingClientRect().left }));
      check(fit.sw <= fit.iw && fit.l >= 0 && fit.r <= fit.iw + 0.5, `[${tag}] No horizontal overflow with the typed bubble inside the viewport`, `scrollWidth ${fit.sw}/${fit.iw}, bubble ${fit.l.toFixed(0)}..${fit.r.toFixed(0)}`);
      await ctx.close();
    }
  }

  if (want('interrupt')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500&mock=slow`, 'typing-interrupt');
    await waitIntro(p);
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await p.waitForFunction(() => document.querySelector('.bubble__typed').textContent.length >= 12 && document.querySelector('.bubble__pending').textContent.length > 0, null, { timeout: 8000 });
    const tE = await p.evaluate(() => performance.now());
    await p.keyboard.press('Enter');
    await typedAll(p, n.thinking);
    await p.waitForTimeout(150);
    const s = await samples(p);
    const after = s.filter((x) => x.t >= tE - 40);
    const iNew = after.findIndex((x) => x.sp === n.thinking);
    const fa = await p.evaluate((t) => window.__anim.filter((a) => a.t >= t && a.cls.includes('bubble__text')), tE);
    const mid = after.slice(0, iNew).filter((x) => x.t > (fa[0]?.t ?? Infinity) + 10); // from say() (the fade-out animation is created in the same call that stops the clock) until the swap
    const lens = new Set(mid.map((x) => x.ty.length));
    const fade = mid.length ? Math.min(...mid.map((x) => x.op)) : 1;
    check(iNew > 0 && mid.length >= 3 && lens.size === 1 && mid.every((x) => x.ty === n.typing), 'Interrupt: pressing Enter mid-line stops the old typing at once and paints the rest in one go (typed = whole line during the fade-out)', `${mid.length} samples between Enter and the swap, typed length values ${JSON.stringify([...lens])} of ${n.typing.length}`);
    check(mid.length > 0 && mid.every((x) => x.pe.length === 0) && fa.length >= 1 && fa[0].dur >= 100 && fa[0].dur <= 200 , 'Interrupt: the interrupted line is complete (pending empty, same frame) and fades out (one opacity animation of --dur-fast on .bubble__text)', `pending empty on all ${mid.length} fade samples; opacity min ${fade.toFixed(2)} (a loaded main thread starves the 8 ms sampler); animations ${JSON.stringify(fa.map((a) => ({ dur: a.dur, props: a.props })))}`);
    const newG = after.slice(iNew).filter((x) => x.sp === n.thinking);
    check(newG[0].ty.length <= 2 && newG.every((x, i) => i === 0 || (x.ty.length >= newG[i - 1].ty.length && n.thinking.startsWith(x.ty))) && newG.at(-1).ty === n.thinking, 'Interrupt: the new line is typed from 0, growing as a prefix (a single clock)', `first sample typed "${newG[0].ty}" (len ${newG[0].ty.length}); ends "${newG.at(-1).ty}"`);
    const tN0 = firstAt(newG, (x) => x.ty.length >= 1), tN1 = firstAt(newG, (x) => x.ty === n.thinking), exp = typeSchedule(n.thinking, T).total;
    check(Math.abs((tN1 - tN0) - exp) <= 120, `Interrupt: the new line takes its own schedule (${exp} ms), not a sum of two clocks`, `${(tN1 - tN0).toFixed(0)} ms`);
    const inv = s.filter((x) => x.sp && x.ty + x.pe !== x.sp && x.ty !== '' && x.pe !== '');
    check(inv.length === 0, 'Interrupt/text model: typed + pending == spoken line on every sample of the whole run (no mixed lines)', `${inv.length} inconsistent samples of ${s.length}`);
    await ctx.close();
  }

  // ================= 3. Audio =================
  const expectedTyping = blipMask(Array.from(n.typing)).filter(Boolean).length;
  if (want('audio')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500&mock=slow`, 'typing-audio');
    await waitIntro(p);
    await p.mouse.click(8, 8); // pointerdown on empty page: the first gesture
    await p.waitForFunction(() => window.__au.ctors === 1 && window.__au.ctxs[0].state === 'running', null, { timeout: 4000 }).catch(() => undefined);
    const a1 = await au(p);
    check(a1.ctors === 1 && a1.state === 'running' && a1.n === 0, 'Audio: after a pointerdown the AudioContext exists (1) and is running; no oscillator until a letter sounds', `ctors ${a1.ctors}, state ${a1.state}, oscillators ${a1.n}`);
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await typedAll(p, n.typing);
    await p.waitForTimeout(150);
    const a2 = await au(p);
    const lo = 784 * 2 ** (-7 / 12) - 0.01, hi = 784 * 2 ** (5 / 12) + 0.01;
    check(a2.n === expectedTyping, `Audio: the line "${n.typing}" creates one oscillator per odd letter of each word (${expectedTyping})`, `${a2.n} oscillators`);
    check(a2.freq.length > 0 && a2.freq.every((f) => f >= lo && f <= hi) && a2.type.join() === 'square', 'Audio: oscillators are square and their frequencies stay within 784*2^(-7/12) .. 784*2^(5/12) Hz', `min ${Math.min(...a2.freq).toFixed(1)}, max ${Math.max(...a2.freq).toFixed(1)} Hz (allowed ${lo.toFixed(1)}..${hi.toFixed(1)}); types ${a2.type}`);
    check(a2.peaks.length > 0 && Math.max(...a2.peaks) <= 0.05 + 1e-9 && Math.max(...a2.peaks) > 0.04, 'Audio: peak gain <= 0.05 (and actually set to it)', `max ramp target ${Math.max(...a2.peaks)}`);
    const minGap = Math.min(...gaps(a2.t));
    check(minGap >= 50 - 2, 'Audio: blips are at least 50 ms apart (never overlapping)', `min gap ${minGap.toFixed(0)} ms over ${a2.n} blips`);
    const mask = blipMask(Array.from(n.typing)), want0 = Array.from(n.typing).filter((_, i) => mask[i]).map((c) => pitch(c, 'listen'));
    const same = want0.length === a2.freq.length && want0.every((f, i) => Math.abs(f - a2.freq[i]) < 0.5);
    const off = a2.freq.map((f, i) => Math.round(12 * Math.log2(f / want0[i]))).filter((d) => Number.isFinite(d));
    check(same, 'Audio: the pitch of each blip is the deterministic pitch(letter, mood) (mood listen while the user types)', same ? 'all match' : `${a2.n} blips vs ${want0.length} expected; semitone offsets vs "listen" per blip: ${JSON.stringify(off)}; letters sounded: ${a2.freq.map((f) => Array.from(n.typing).filter((_, i) => mask[i]).find((c) => Math.abs(pitch(c, 'listen') - f) < 0.5) ?? '?').join('')}`);
    // second line (thinking -> results), still unmuted
    const before = a2.n;
    await p.keyboard.press('Enter');
    await typedAll(p, n.thinking);
    const a3 = await au(p);
    const expTh = blipMask(Array.from(n.thinking)).filter(Boolean).length;
    check(a3.n - before === expTh, `Audio: "${n.thinking}" (mood think) sounds ${expTh} blips`, `${a3.n - before} blips`);
    await ctx.close();

    // keydown also unlocks (no mouse), hidden tab, no AudioContext at all
    {
      const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500&mock=results`, 'typing-audio-keydown');
      await waitIntro(p);
      await p.evaluate(() => { window.__hid = true; });
      await p.keyboard.press('Shift'); // keydown gesture
      await p.focus('#feeling');
      await p.keyboard.type('c');
      await typedAll(p, n.typing);
      const h = await au(p);
      check(h.ctors === 1 && h.n === 0, 'Audio: with document.hidden = true no oscillator is created (the AudioContext exists after the keydown)', `ctors ${h.ctors}, oscillators ${h.n}`);
      await ctx.close();
    }
    {
      const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500&mock=results`, 'typing-audio-noac', [() => { delete window.AudioContext; delete window.webkitAudioContext; }, INSTRUMENT]);
      await waitIntro(p);
      await p.mouse.click(8, 8);
      await p.focus('#feeling');
      await p.keyboard.type('c');
      const ok = await typedAll(p, n.typing);
      check(ok, 'Audio: without Web Audio (AudioContext deleted) the line still types and there are no console errors', `line typed: ${ok}`);
      await ctx.close();
    }
  }

  // ================= 4. Mute: button behaviour, persistence, silence =================
  if (want('mute')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500&mock=slow`, 'typing-mute');
    await waitIntro(p);
    const st0 = await p.evaluate(() => ({ p: document.querySelector('.sound-toggle').getAttribute('aria-pressed'), l: document.querySelector('.sound-toggle').getAttribute('aria-label'), stored: localStorage.getItem('muted') }));
    await p.click('.sound-toggle');
    const st1 = await p.evaluate(() => ({ p: document.querySelector('.sound-toggle').getAttribute('aria-pressed'), l: document.querySelector('.sound-toggle').getAttribute('aria-label'), stored: localStorage.getItem('muted'), ctors: window.__au.ctors, waves: getComputedStyle(document.querySelector('.sound-toggle__waves')).display, off: getComputedStyle(document.querySelector('.sound-toggle__off')).display }));
    check(st0.p === 'false' && st0.l === content.sound.mute && st1.p === 'true' && st1.l === content.sound.mute && st1.stored === '1', 'Mute button: aria-pressed false -> true, fixed name "Mute Chao\'s voice", localStorage.muted = "1"', JSON.stringify({ before: st0, after: st1 }));
    check(st1.waves === 'none' && st1.off !== 'none', 'Mute button: muted shows the cross icon (waves hidden)', `waves display ${st1.waves}, cross display ${st1.off}`);
    info('Audio: first gesture is the click on the mute button', `AudioContext constructed ${st1.ctors}x (pointerdown unlocks BEFORE the click mutes; harmless, a muted context creates no oscillators)`);
    await shot(p, 'mute-pressed-1440-light');
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await typedAll(p, n.typing);
    await p.keyboard.press('Enter');
    await typedAll(p, n.thinking);
    const am = await au(p);
    check(am.n === 0, 'Audio: muted, two lines (typing, thinking) create 0 oscillators', `${am.n} oscillators; ctors ${am.ctors}`);
    // reload keeps the preference
    await p.reload({ waitUntil: 'domcontentloaded' });
    await waitIntro(p);
    const rl = await p.evaluate(() => ({ p: document.querySelector('.sound-toggle').getAttribute('aria-pressed'), stored: localStorage.getItem('muted') }));
    await p.mouse.click(8, 8);
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await typedAll(p, n.typing);
    const ar = await au(p);
    check(rl.p === 'true' && rl.stored === '1' && ar.n === 0 && ar.ctors === 0, 'Mute persists across a reload: aria-pressed=true on load, a gesture and a typed line create 0 oscillators and no AudioContext', JSON.stringify({ pressed: rl.p, stored: rl.stored, oscillators: ar.n, ctors: ar.ctors }));
    // unmute: sound comes back
    await p.click('.sound-toggle');
    await p.waitForFunction(() => window.__au.ctors === 1 && window.__au.ctxs[0].state === 'running', null, { timeout: 4000 }).catch(() => undefined);
    const un = await p.evaluate(() => ({ p: document.querySelector('.sound-toggle').getAttribute('aria-pressed'), stored: localStorage.getItem('muted'), ctors: window.__au.ctors, state: window.__au.ctxs[0]?.state }));
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await typedAll(p, n.typing);
    const au0 = (await au(p)).n;
    await p.keyboard.press('Enter');
    await typedAll(p, n.thinking);
    const au2 = await au(p);
    check(un.p === 'false' && un.stored === null && un.ctors === 1 && au2.n - au0 > 0 && au2.n - au0 <= blipMask(Array.from(n.thinking)).filter(Boolean).length, 'Unmute: aria-pressed=false, localStorage.muted removed, AudioContext created by that click and the next line sounds again (count <= max: main-thread stalls batch letters and a batch sounds one blip, DESIGN §17.1; the exact count is checked in the audio case)', JSON.stringify({ ...un, sounded: au2.freq.slice(au0).map((f) => Math.round(12 * Math.log2(f / 784))).join(','), oscillators: au2.n - au0, expected: blipMask(Array.from(n.thinking)).filter(Boolean).length }));
    await ctx.close();
  }

  // blocked localStorage: no console errors, the button still works for the visit
  if (want('storage')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' }, `${BASE}/?t=9500&mock=results`, 'typing-nostorage', [() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); }, INSTRUMENT]);
    await waitIntro(p);
    await p.click('.sound-toggle');
    const a = await p.evaluate(() => document.querySelector('.sound-toggle').getAttribute('aria-pressed'));
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await typedAll(p, n.typing);
    const m = await au(p);
    await p.click('.sound-toggle');
    const b = await p.evaluate(() => document.querySelector('.sound-toggle').getAttribute('aria-pressed'));
    check(a === 'true' && b === 'false' && m.n === 0, 'Blocked localStorage: the page runs (console clean, see errors), the mute button toggles and mutes for the visit', `pressed after click 1: ${a}, after click 2: ${b}, oscillators while muted ${m.n}`);
    await ctx.close();
  }

  // ================= 5. Reduced motion =================
  if (want('reduced')) {
    const { ctx, p } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' }, `${BASE}/?t=9500&mock=results`, 'typing-reduced');
    await waitIntro(p);
    await p.mouse.click(8, 8);
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await typedAll(p, n.typing, 3000);
    await p.keyboard.press('Enter');
    await typedAll(p, n.thinking, 3000);
    await p.waitForTimeout(200);
    const s = await samples(p);
    const partial = s.filter((x) => x.sp && x.ty !== '' && x.pe !== '');
    const firstSp = s.filter((x) => x.sp === n.intro);
    check(partial.length === 0 && firstSp.length > 0 && firstSp[0].ty === n.intro && firstSp[0].pe === '', 'Reduced motion: every line appears whole at once (no sample ever has both typed and pending text; the first sample of the intro is complete)', `${partial.length} partial samples of ${s.length}; first intro sample typed "${firstSp[0]?.ty}"`);
    const a = await au(p);
    check(a.n === 0, 'Reduced motion: createOscillator is never called (even after a gesture)', `${a.n} oscillators, ctors ${a.ctors}`);
    const btn = await p.evaluate(() => { const b = document.querySelector('.sound-toggle'); return { display: getComputedStyle(b).display, box: b.getBoundingClientRect().width }; });
    check(btn.display === 'none' && btn.box === 0, 'Reduced motion: the mute button is display:none (no box, out of the Tab order)', JSON.stringify(btn));
    await p.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
    await p.keyboard.press('Tab');
    const f1 = await p.evaluate(() => document.activeElement.className);
    check(/theme-toggle/.test(f1), 'Reduced motion: the first Tab stop is the theme toggle (no mute button)', `first focus: ${f1}`);
    const talk = s.filter((x) => x.sp === n.intro && x.talk === 'cycle').length;
    info('Reduced motion: mouth', `data-talking="cycle" on ${talk} intro samples (the mouth keeps the duration the typing would have had, §17.4)`);
    await shot(p, 'reduced-1440-light');
    await ctx.close();
  }

  // ================= 6. forced-colors =================
  if (want('forced')) {
    const { ctx, p } = await open({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', forcedColors: 'active' }, `${BASE}/?t=9500`, 'typing-forced');
    await waitIntro(p);
    await slow(p);
    await p.focus('#feeling');
    await p.keyboard.type('c');
    await p.waitForFunction(() => document.querySelector('.bubble__spoken').textContent.startsWith('Take') && document.querySelector('.bubble__typed').textContent.length >= 14, null, { timeout: 12000 });
    const v = await p.evaluate(() => ({ fc: matchMedia('(forced-colors: active)').matches, pv: getComputedStyle(document.querySelector('.bubble__pending')).visibility, pe: document.querySelector('.bubble__pending').textContent.length, ty: document.querySelector('.bubble__typed').textContent, tv: getComputedStyle(document.querySelector('.bubble__typed')).visibility, col: getComputedStyle(document.querySelector('.bubble__typed')).color }));
    check(v.fc && v.pv === 'hidden' && v.pe > 0 && v.tv === 'visible', 'Forced colors: matchMedia(forced-colors) is active, the pending part is visibility:hidden (not shown) and the typed part is visible', JSON.stringify({ forced: v.fc, pending: v.pv, pendingChars: v.pe, typed: v.tv, typedColor: v.col }));
    await shot(p, 'forced-mid-1280');
    await ctx.close();
  }

  // ================= 7. Button geometry, order, focus ring, screenshots in the three widths x two themes =================
  if (want('button') || want('shots')) {
    for (const vp of REFLOW_VPS) for (const scheme of ['light', 'dark']) {
      const tag = `${vp.width}-${scheme}`;
      const { ctx, p } = await open({ viewport: vp, colorScheme: scheme }, `${BASE}/?t=9500`, `typing-shots-${tag}`);
      await slow(p);
      // mid-typing screenshot of the intro: the bubble must exist, hold the whole box size and show only the typed part
      await p.waitForFunction(() => document.querySelector('.bubble__typed')?.textContent.length >= 16, null, { timeout: 40000 });
      await shot(p, `intro-mid-${tag}`);
      const mid = await p.evaluate(() => ({ ty: document.querySelector('.bubble__typed').textContent, pe: document.querySelector('.bubble__pending').textContent.length, pv: getComputedStyle(document.querySelector('.bubble__pending')).visibility }));
      await waitIntro(p);
      await shot(p, `intro-end-${tag}`);
      const g = await p.evaluate(() => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, h: b.height }; };
        const s = document.querySelector('.sound-toggle'), t = document.querySelector('.theme-toggle');
        return { s: r(s), t: r(t), sw: document.documentElement.scrollWidth, iw: innerWidth, label: s.getAttribute('aria-label'), pressed: s.getAttribute('aria-pressed'), svg: !!s.querySelector('svg[aria-hidden="true"]'), icon: r(s.querySelector('svg')) };
      });
      check(mid.pv === 'hidden' && mid.pe > 0 && mid.ty.length >= 16, `[${tag}] Mid-typing: the pending letters are hidden, the typed ones shown (screenshot typing-intro-mid-${tag}.png)`, `typed "${mid.ty}" + ${mid.pe} pending (visibility ${mid.pv})`);
      check(g.s.w >= 44 && Math.abs(g.s.w - g.t.w) < 0.6 && Math.abs(g.s.h - g.t.h) < 0.6 && g.s.r <= g.t.l && Math.abs((g.t.l - g.s.r) - 8) < 0.6 && g.sw <= g.iw, `[${tag}] Mute button: same size as the theme toggle (>= 44), left of it with an 8 px gap, no horizontal overflow`, `sound ${g.s.w.toFixed(0)}x${g.s.h.toFixed(0)}, theme ${g.t.w.toFixed(0)}x${g.t.h.toFixed(0)}, gap ${(g.t.l - g.s.r).toFixed(1)} px, icon ${g.icon.w.toFixed(0)}px, scrollWidth ${g.sw}/${g.iw}`);
      // keyboard: first Tab stop is the mute button, with a visible focus ring; Space toggles it
      await p.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
      await p.keyboard.press('Tab');
      const f = await p.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { cls: e.className, vis: e.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` }; });
      check(/sound-toggle/.test(f.cls) && f.vis, `[${tag}] Tab: the first stop is the mute button, with a visible focus ring`, `${f.cls} ${f.outline}`);
      if (vp.width === 1280) await shot(p, `focus-mute-${tag}`);
      await p.keyboard.press('Space');
      const sp1 = await p.evaluate(() => document.querySelector('.sound-toggle').getAttribute('aria-pressed'));
      await p.keyboard.press('Enter');
      const sp2 = await p.evaluate(() => document.querySelector('.sound-toggle').getAttribute('aria-pressed'));
      check(sp1 === 'true' && sp2 === 'false', `[${tag}] Mute button: Space then Enter toggle aria-pressed true then false`, `${sp1} -> ${sp2}`);
      await p.keyboard.press('Tab');
      const f2 = await p.evaluate(() => document.activeElement.className);
      check(/theme-toggle/.test(f2), `[${tag}] Tab order: mute button -> theme toggle`, f2);
      // slow-typed typing line, to see it mid-way and finished
      await p.focus('#feeling');
      await p.keyboard.type('c');
      await p.waitForFunction(() => document.querySelector('.bubble__spoken').textContent.startsWith('Take') && document.querySelector('.bubble__typed').textContent.length >= 20, null, { timeout: 10000 });
      await shot(p, `typing-mid-${tag}`);
      await typedAll(p, n.typing, 20000);
      await shot(p, `typing-end-${tag}`);
      await ctx.close();
    }
  }

  if (shots.length) lines.push(`typing shots (${shots.length}): ${OUT}/typing-*.png`);
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
  try { await runTyping({ browser, BASE, OUT: 'verify-shots', errors, lines, watch, check, info, content: contentDefault }); } finally { await browser.close(); }
  console.log(lines.join('\n'));
  if (errors.length) { console.error(`\n${errors.length} error(s):\n${errors.join('\n')}`); process.exit(1); }
  console.log('\nverify-typing: OK, 0 errors');
}
