// Browser check against an already-running server (npm run dev / preview).
// Usage: VERIFY_URL=http://localhost:5173 npm run verify
import { chromium } from 'playwright-core';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { content } from '../src/content.ts'; // Node 23.6+ strips TS types natively
import { runScreen } from './verify-screen.mjs';
import { runTyping } from './verify-typing.mjs';
import { runResults, isExpected404 } from './verify-results.mjs';

const BASE = process.env.VERIFY_URL || 'http://localhost:5173';
const OUT = 'verify-shots';
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
const SCHEMES = ['light', 'dark'];

const errors = [];
const lines = [];

function watch(page, tag) {
  // the one tolerated error: the deliberately broken mock cover (see isExpected404 in verify-results.mjs)
  page.on('console', (m) => m.type() === 'error' && !(/status of 404/.test(m.text()) && isExpected404(m.location().url)) && errors.push(`[${tag}] console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => !(r.url().includes("/api/game?id=") && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) && errors.push(`[${tag}] request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && !(r.status() === 404 && isExpected404(r.url())) && errors.push(`[${tag}] HTTP ${r.status()}: ${r.url()}`));
}

await mkdir(OUT, { recursive: true });
// Installed Chrome via channel; fall back to the Windows path if the channel lookup fails.
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']; // headless Windows may have no GPU
const browser = await chromium
  .launch({ channel: 'chrome', args: ARGS })
  .catch(() => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ARGS }));

try {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of SCHEMES) {
      const tag = `${viewport.width}-${colorScheme}`;
      const context = await browser.newContext({ viewport, colorScheme }); // fresh context = empty localStorage
      const page = await context.newPage();
      watch(page, tag);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (scrollWidth > innerWidth) errors.push(`[${tag}] horizontal overflow: scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`);

      await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
      lines.push(`shot ${OUT}/${tag}.png (scrollWidth ${scrollWidth}/${innerWidth})`);
      await context.close();
    }
  }

  // Toggle: light system -> click -> dark, persists after reload.
  const context = await browser.newContext({ viewport: VIEWPORTS[1], colorScheme: 'light' });
  const page = await context.newPage();
  watch(page, 'toggle');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const state = () =>
    page.evaluate(() => ({
      theme: document.documentElement.dataset.theme ?? null,
      bg: getComputedStyle(document.body).backgroundColor,
      label: document.querySelector('.theme-toggle').getAttribute('aria-label'),
    }));
  const theme = async () => (await state()).theme;
  const s0 = await state();
  await page.click('.theme-toggle');
  const s1 = await state();
  const before = s0.theme, after = s1.theme;
  await page.reload({ waitUntil: 'networkidle' });
  const reloaded = await theme();
  const ok = before === null && after === 'dark' && reloaded === 'dark';
  if (!ok) errors.push(`[toggle] expected null -> dark -> dark after reload, got ${before} -> ${after} -> ${reloaded}`);
  lines.push(`toggle: ${before} -> ${after} -> reload ${reloaded} ${ok ? 'OK' : 'FAIL'}`);
  const okBg = s0.bg !== s1.bg;
  if (!okBg) errors.push(`[toggle] body background did not change on click (${s0.bg})`);
  const okLabel = s0.label === content.theme.toDark && s1.label === content.theme.toLight;
  if (!okLabel) errors.push(`[toggle] aria-label expected "${content.theme.toDark}" -> "${content.theme.toLight}", got "${s0.label}" -> "${s1.label}"`);
  lines.push(`toggle bg: ${s0.bg} -> ${s1.bg} ${okBg ? 'OK' : 'FAIL'}; label: "${s0.label}" -> "${s1.label}" ${okLabel ? 'OK' : 'FAIL'}`);
  // Toggle back: dark -> light, persists.
  await page.click('.theme-toggle');
  await page.reload({ waitUntil: 'networkidle' });
  const back = await theme();
  if (back !== 'light') errors.push(`[toggle] expected light after second click + reload, got ${back}`);
  lines.push(`toggle back: -> reload ${back} ${back === 'light' ? 'OK' : 'FAIL'}`);
  await context.close();

  // System dark, no stored value: page must render dark (computed bg, not just data-theme).
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[1], colorScheme: 'dark' });
    const p = await ctx.newPage();
    watch(p, 'system-dark');
    await p.goto(BASE, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => {
      const [rr, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
      return { stored: localStorage.getItem('theme'), lum: (rr + g + b) / 3, label: document.querySelector('.theme-toggle').getAttribute('aria-label') };
    });
    const okDark = r.stored === null && r.lum < 80 && r.label === content.theme.toLight;
    if (!okDark) errors.push(`[system-dark] expected dark start, got ${JSON.stringify(r)}`);
    lines.push(`system dark start: bg lum ${r.lum.toFixed(0)}, aria-label "${r.label}" ${okDark ? 'OK' : 'FAIL'}`);

    // Chao halo (per outlined layer: body, wing, ball): opaque edge pixels (touching transparency) that are near-white = halo.
    for (const [layer, sel] of [['body', '.narrator .chao__torso'], ['wing', '.narrator .chao__wing img'], ['ball', '.narrator .chao__ball img']]) {
    const halo = await p.evaluate(async (sel) => {
      const img = document.querySelector(sel);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx2 = c.getContext('2d');
      ctx2.drawImage(img, 0, 0);
      const { data, width, height } = ctx2.getImageData(0, 0, c.width, c.height);
      const a = (x, y) => data[(y * width + x) * 4 + 3];
      let edge = 0, white = 0, transparent = 0;
      for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] === 0) { transparent++; continue; }
          if (a(x - 1, y) && a(x + 1, y) && a(x, y - 1) && a(x, y + 1)) continue;
          edge++;
          if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) white++;
        }
      return { edge, white, transparent, total: width * height };
    }, sel);
    const ratio = halo.edge ? halo.white / halo.edge : 1;
    const okHalo = halo.transparent > 0 && ratio < 0.05;
    if (!okHalo) errors.push(`[chao ${layer}] white halo: ${halo.white}/${halo.edge} edge px near-white, transparent px ${halo.transparent}`);
    lines.push(`chao ${layer} edges: ${halo.white}/${halo.edge} near-white (${(ratio * 100).toFixed(1)}%), transparent ${halo.transparent}/${halo.total} ${okHalo ? 'OK' : 'FAIL'}`);
    }
    await p.locator('.narrator').screenshot({ path: `${OUT}/chao-dark.png` });
    lines.push(`shot ${OUT}/chao-dark.png`);
    await ctx.close();
  }

  // ===== Phase 2: WebGL holographic background (DESIGN §12) + title bounce =====
  // In-page helpers (init script, runs before the app):
  //  - __draws / __viewports count drawArrays / viewport calls;
  //  - __first = canvas pixels right after each of the first 3 draws (the build() paints: size, colors, sync), i.e. the
  //    first paint at STILL_MS, grabbed in the same task because the drawing buffer is cleared after compositing;
  //  - __grab(t) seeks the dev-only loop to t ms and copies the canvas pixels; __mad = mean abs RGB diff (0..255).
  const PAGE_HELPERS = () => {
    window.__draws = 0; window.__viewports = 0; window.__first = [];
    const copy = (c) => {
      const o = document.createElement('canvas');
      o.width = c.width; o.height = c.height;
      const x = o.getContext('2d', { willReadFrequently: true });
      x.drawImage(c, 0, 0);
      return x.getImageData(0, 0, o.width, o.height).data;
    };
    const d = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...a) {
      const r = d.apply(this, a);
      if (window.__draws++ < 3) window.__first.push(copy(this.canvas));
      return r;
    };
    const v = WebGLRenderingContext.prototype.viewport;
    WebGLRenderingContext.prototype.viewport = function (...a) { window.__viewports++; return v.apply(this, a); };
    window.__grab = (t) => { window.__holoSeek(t); return copy(document.querySelector('.holo__canvas')); };
    window.__mad = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++, n++) s += Math.abs(a[i + k] - b[i + k]); return s / n; };
    window.__lumaSd = (a) => { let s = 0, q = 0, n = a.length / 4; for (let i = 0; i < a.length; i += 4) { const l = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; s += l; q += l * l; } const m = s / n; return Math.sqrt(Math.max(0, q / n - m * m)); };
    window.__black = (a) => { let k = 0; for (let i = 0; i < a.length; i += 4) if (Math.max(a[i], a[i + 1], a[i + 2]) < 6) k++; return k / (a.length / 4); };
  };
  const open = async (opts, { url = BASE, init = [PAGE_HELPERS], tag, wait = 'networkidle' }) => {
    const ctx = await browser.newContext(opts);
    for (const f of init) await ctx.addInitScript(f);
    const p = await ctx.newPage();
    watch(p, tag);
    await p.goto(url, { waitUntil: wait });
    if (opts.javaScriptEnabled !== false) await p.evaluate(() => document.fonts.ready);
    return { ctx, p };
  };
  const check = (ok, label, detail, errMsg) => {
    if (!ok) errors.push(`${errMsg ?? label}: ${detail}`);
    lines.push(`${label}: ${detail} ${ok ? 'OK' : 'FAIL'}`);
  };
  const info = (label, detail) => lines.push(`${label}: ${detail} (info)`);
  const count = async (p, ms) => { const a = await p.evaluate(() => window.__draws); await p.waitForTimeout(ms); return (await p.evaluate(() => window.__draws)) - a; };

  // 2. Title bounce is the only CSS animation; canvas/WebGL/fallback structure.
  const animInfo = (p, within) =>
    p.evaluate((within) => {
      const all = document.getAnimations().filter((a) => !within || a.effect?.target?.closest(within));
      const meta = ['offset', 'computedOffset', 'easing', 'composite'];
      return {
        count: all.length,
        names: [...new Set(all.map((a) => a.animationName))],
        props: [...new Set(all.flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !meta.includes(k))))],
        computed: [...document.querySelectorAll('.title-wrap')].map((e) => getComputedStyle(e).animationName),
      };
    }, within);
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { tag: 'motion' });
    await p.waitForSelector('.title-wrap');
    const m = await animInfo(p, '.title-wrap');
    check(m.count > 0 && m.names.length === 1 && m.names[0] === 'title-bounce' && m.props.length === 1 && m.props[0] === 'transform',
      'motion', `${m.count} CSS animation(s) [${m.names}], animated props [${m.props}] (want only title-bounce / transform)`);

    const s = await p.evaluate(() => {
      const c = document.querySelector('.holo__canvas'), h = document.querySelector('.holo'), cs = getComputedStyle(h);
      const gl = c?.getContext('webgl');
      return {
        exists: !!c, hidden: c?.hidden, display: c && getComputedStyle(c).display, gl: !!gl, lost: gl?.isContextLost(), size: c && `${c.width}x${c.height}`,
        z: cs.zIndex, zToken: getComputedStyle(document.documentElement).getPropertyValue('--z-bg').trim(), bg: cs.backgroundImage.slice(0, 40),
        parent: c?.parentElement === h, holoPos: cs.position, on: c?.classList.contains('holo__canvas--on'),
      };
    });
    check(s.exists && s.hidden === false && s.display !== 'none' && s.gl && !s.lost && s.parent && s.on,
      'canvas', `.holo__canvas exists, hidden=${s.hidden}, display=${s.display}, --on class=${s.on}, webgl ctx=${s.gl}, lost=${s.lost}, size ${s.size}`);
    check(s.z === s.zToken || Number(s.z) < 0, '.holo z-index', `computed ${s.z}, --z-bg ${s.zToken}, position ${s.holoPos}`);
    check(s.bg !== 'none' && s.bg !== '', '.holo CSS fallback background', s.bg + '...');

    // Live theme change: same seek, canvas pixels before/after the toggle must differ strongly.
    await p.evaluate(() => window.__holoSeek(3000));
    const light = await p.evaluate(() => { window.__A = window.__grab(3000); return window.__lumaSd(window.__A); });
    await p.click('.theme-toggle');
    await p.waitForTimeout(200); // MutationObserver -> colors() runs asynchronously
    const diff = await p.evaluate(() => { const B = window.__grab(3000); return { mad: window.__mad(window.__A, B), sd: window.__lumaSd(B) }; });
    check(diff.mad > 40, 'live theme change (canvas pixels, t=3000, no reload)', `mean abs diff light vs dark ${diff.mad.toFixed(1)}/255 (want > 40); luma sd light ${light.toFixed(1)}, dark ${diff.sd.toFixed(1)}`);
    await ctx.close();
  }

  // j. Chao outline: computed filter of the body layer == the --chao-outline token applied to a probe (both themes).
  for (const colorScheme of SCHEMES) {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme }, { tag: `chao-outline-${colorScheme}` });
    const r = await p.evaluate(() => {
      const probe = document.querySelector('.narrator .chao').appendChild(document.createElement('i')); // inside the Chao: em = its height (rev 3)
      probe.style.filter = 'var(--chao-outline)';
      const want = getComputedStyle(probe).filter, got = getComputedStyle(document.querySelector('.narrator .chao__torso')).filter; probe.remove();
      return { want: want.length, got: got.length, eq: want === got, none: got === 'none', n: (got.match(/drop-shadow/g) || []).length };
    });
    check(r.eq && !r.none && r.n === 6, `Chao outline filter (${colorScheme})`, `computed filter == --chao-outline: ${r.eq}, ${r.n} drop-shadows, ${r.got} chars`);
    const parts = await p.evaluate(() => {
      const f = (sel) => [...document.querySelectorAll(sel)].map((e) => getComputedStyle(e).filter);
      // each part against a probe inside its own Chao (em = that Chao's height)
      const parts = [...document.querySelectorAll('.chao__part')];
      const outlined = parts.every((e) => { const pr = e.closest('.chao').appendChild(document.createElement('i')); pr.style.filter = 'var(--chao-outline)'; const ok = getComputedStyle(pr).filter === getComputedStyle(e).filter; pr.remove(); return ok; });
      return { outlined: outlined && parts.length === 7, n: parts.length,
        bare: [...f('.chao__eyes'), ...f('.chao__mouth'), ...f('.chao__rig'), ...f('.chao__pose'), ...f('.chao__wing'), ...f('.chao__ball'), ...f('.chao')].every((x) => x === 'none') };
    });
    check(parts.outlined && parts.bare, `Chao outline only on the image layers (${colorScheme})`, `${parts.n} .chao__part (narrator Chao: wing, body, 5 ball glyphs) carry --chao-outline: ${parts.outlined}; eyes, mouth and every animated wrapper filter none: ${parts.bare}`);
    await ctx.close();
  }

  // First paint = the 9500 ms frame = the reduced-motion still (canvas pixels, grabbed in the same task as the draw).
  {
    const a = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { tag: 'first-paint' });
    const rm = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', reducedMotion: 'reduce' }, { tag: 'first-paint-rm' });
    const A = await a.p.evaluate(() => ({ n: window.__first.length, k: window.__first.length - 1 }));
    await a.p.evaluate(() => { window.__fp = window.__first[window.__first.length - 1]; });
    await rm.p.evaluate(() => { window.__fp = window.__first[window.__first.length - 1]; });
    const ref = await a.p.evaluate(() => window.__mad(window.__fp, window.__grab(9500)));
    const refRm = await rm.p.evaluate(() => window.__mad(window.__fp, window.__grab(9500)));
    const cross = await a.p.evaluate(async () => window.__lumaSd(window.__fp)); // sanity: not blank
    // normal vs reduced-motion first paint: copy the RM one over and diff in the normal page
    const rmPixels = await rm.p.evaluate(() => Array.from(window.__fp));
    const crossMad = await a.p.evaluate((px) => window.__mad(window.__fp, px), rmPixels);
    check(A.n === 3 && ref < 0.5 && refRm < 0.5 && crossMad < 0.5 && cross > 3, 'first paint == __holoSeek(9500) == reduced-motion still',
      `captured ${A.n} build draws; normal vs seek(9500) ${ref.toFixed(3)}/255, reduced-motion vs seek(9500) ${refRm.toFixed(3)}/255, normal vs reduced ${crossMad.toFixed(3)}/255 (want < 0.5); luma sd ${cross.toFixed(1)}`);
    await a.ctx.close(); await rm.ctx.close();
  }

  // h. Loop seam: the cycle boundary is as smooth as mid-cycle (t=0 vs t=15000 is `ms % PERIOD` in both, so not tested).
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=0`, tag: 'seam' });
    const r = await p.evaluate(() => {
      const g = window.__grab, m = window.__mad, z = g(0);
      return {
        seamStep: m(g(14990), z), seamStep2: m(g(14950), z), mid: m(g(7500), g(7510)), mid2: m(g(3000), g(3010)),
        far: m(z, g(3000)), far2: m(z, g(7500)), sd: window.__lumaSd(z),
      };
    });
    const ref = Math.max(r.mid, r.mid2);
    check(r.seamStep <= ref * 2 + 0.5, 'loop seam 14990 -> 0 (10 ms across the boundary)', `${r.seamStep.toFixed(2)}/255 vs mid-cycle 10 ms steps ${r.mid.toFixed(2)}, ${r.mid2.toFixed(2)} (14950 vs 0: ${r.seamStep2.toFixed(2)})`);
    check(r.far > 4 && r.far2 > 4, 'animation actually moves', `t=0 vs 3000 ${r.far.toFixed(1)}/255, t=0 vs 7500 ${r.far2.toFixed(1)}/255 (want > 4); frame 0 luma sd ${r.sd.toFixed(1)}`);
    await ctx.close();
  }

  // WebGL context lost/restored.
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: `${BASE}/?t=5000`, tag: 'ctx-lost' });
    const pre = await p.evaluate(() => { window.__pre = window.__grab(5000); return window.__lumaSd(window.__pre); });
    await p.evaluate(() => (window.__lose = document.querySelector('.holo__canvas').getContext('webgl').getExtension('WEBGL_lose_context')).loseContext());
    await p.waitForFunction(() => document.querySelector('.holo__canvas').hidden === true, null, { timeout: 5000 });
    const lostBg = await p.evaluate(() => getComputedStyle(document.querySelector('.holo')).backgroundImage !== 'none');
    await p.evaluate(() => window.__lose.restoreContext());
    await p.waitForFunction(() => document.querySelector('.holo__canvas').hidden === false, null, { timeout: 5000 });
    const post = await p.evaluate(() => { const B = window.__grab(5000); return { mad: window.__mad(window.__pre, B), sd: window.__lumaSd(B), lost: document.querySelector('.holo__canvas').getContext('webgl').isContextLost(), on: document.querySelector('.holo__canvas').classList.contains('holo__canvas--on') }; });
    check(lostBg && post.mad < 1 && post.sd > 3 && !post.lost && post.on, 'context lost -> hidden, restored -> shown + repainted',
      `fallback visible while lost: ${lostBg}; after restore frame@5000 diff vs before ${post.mad.toFixed(2)}/255, luma sd ${post.sd.toFixed(1)} (before ${pre.toFixed(1)}), lost=${post.lost}, --on=${post.on}`);
    await ctx.close();
  }

  // Fallbacks: every way the background can be unavailable leaves the canvas hidden, the CSS fallback visible, no errors.
  const FALLBACKS = {
    'no-webgl': () => {
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : g.call(this, t, ...a); };
    },
    'no-light-dark': () => {
      const s = CSS.supports.bind(CSS);
      CSS.supports = (...a) => (a.some((x) => /light-dark/.test(String(x))) ? false : s(...a));
    },
    'no-highp': () => {
      WebGLRenderingContext.prototype.getShaderPrecisionFormat = () => ({ rangeMin: 0, rangeMax: 0, precision: 0 });
    },
  };
  for (const [name, init] of Object.entries(FALLBACKS)) {
    for (const viewport of VIEWPORTS) for (const colorScheme of SCHEMES) {
      const tag = `${name}-${viewport.width}-${colorScheme}`;
      const { ctx, p } = await open({ viewport, colorScheme }, { init: [PAGE_HELPERS, init], tag });
      await p.waitForTimeout(150);
      const r = await p.evaluate(() => {
        const c = document.querySelector('.holo__canvas');
        return { hidden: c.hidden, display: getComputedStyle(c).display, on: c.classList.contains('holo__canvas--on'), bg: getComputedStyle(document.querySelector('.holo')).backgroundImage.slice(0, 30), app: !!document.querySelector('.title-wrap'), draws: window.__draws };
      });
      check(r.hidden && r.display === 'none' && !r.on && r.bg !== 'none' && r.app && r.draws === 0, `${name} fallback ${tag}`, `canvas hidden=${r.hidden} display=${r.display} --on=${r.on}, draws=${r.draws}, .holo bg ${r.bg}..., app rendered=${r.app}`);
      await p.screenshot({ path: `${OUT}/fallback-${name}-${viewport.width}-${colorScheme}.png` });
      await ctx.close();
    }
  }
  lines.push(`shots ${OUT}/fallback-{no-webgl,no-light-dark,no-highp}-{390,1440}-{light,dark}.png`);

  // f. startHolo throws (getContext throws): the app must still render and the canvas stay hidden.
  {
    const THROW = () => {
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(t)) throw new Error('boom: getContext'); return g.call(this, t, ...a); };
    };
    const pageErrors = [];
    const ctx = await browser.newContext({ viewport: VIEWPORTS[1], colorScheme: 'light' });
    await ctx.addInitScript(THROW);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(BASE, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => ({ hidden: document.querySelector('.holo__canvas').hidden, title: !!document.querySelector('#app .title'), bubble: !!document.querySelector('#app .bubble'), input: !!document.querySelector('#app #feeling') }));
    check(r.hidden && r.title && r.bubble && r.input && !pageErrors.length, 'startHolo throws -> app still renders',
      `canvas hidden=${r.hidden}; title=${r.title} bubble=${r.bubble} input=${r.input}; uncaught page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
    await p.screenshot({ path: `${OUT}/fallback-startholo-throws-1440-light.png` });
    await ctx.close();
  }

  // The dev server injects CSS through JS, so the no-JS check and the production smoke test run against the built dist/
  // (served by a tiny static server on an ephemeral port: no second dev server to manage).
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const prodServer = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replaceAll('\\', '/').replace(/^\/+/, '');
    const file = join('dist', path.endsWith('/') || !path ? path + 'index.html' : path);
    const body = await readFile(file).catch(() => null);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => prodServer.once('listening', r));
  const PROD = `http://127.0.0.1:${prodServer.address().port}`;

  // Production bundle: the background runs (no dev hooks).
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { url: PROD, tag: 'prod' });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => ({ hidden: document.querySelector('.holo__canvas').hidden, on: document.querySelector('.holo__canvas').classList.contains('holo__canvas--on'), draws: window.__draws, seek: typeof window.__holoSeek }));
    check(r.hidden === false && r.on && r.draws >= 3 && r.seek === 'undefined', 'production bundle (dist) runs the background without dev hooks', `canvas hidden=${r.hidden}, --on=${r.on}, draws in first ~1 s ${r.draws}, typeof __holoSeek=${r.seek}`);
    await ctx.close();
  }

  // d. JavaScript disabled: static CSS fallback only (built CSS comes from a <link>, so it works without JS).
  for (const colorScheme of SCHEMES) {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme, javaScriptEnabled: false }, { url: PROD, init: [], tag: `nojs-${colorScheme}`, wait: 'load' });
    const st = await p.locator('.holo__canvas').evaluate((c) => ({ hidden: c.hidden, display: getComputedStyle(c).display, bg: getComputedStyle(document.querySelector('.holo')).backgroundImage.slice(0, 30) })).catch(() => null);
    // locator.evaluate runs through CDP, so it works with JS disabled for the page.
    check(st && st.hidden && st.display === 'none' && st.bg !== 'none', `JavaScript disabled (${colorScheme})`, st ? `canvas hidden=${st.hidden} display=${st.display}, .holo bg ${st.bg}...` : 'could not inspect');
    await p.screenshot({ path: `${OUT}/fallback-nojs-1440-${colorScheme}.png` });
    await ctx.close();
  }

  // a. forced-colors and print: .holo is display:none and the loop never runs.
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', forcedColors: 'active' }, { tag: 'forced-colors' });
    await p.waitForTimeout(300);
    const r0 = await p.evaluate(() => ({ d: getComputedStyle(document.querySelector('.holo')).display, draws: window.__draws }));
    const n = await count(p, 1000);
    check(r0.d === 'none' && n === 0 && r0.draws <= 4, 'forced-colors: .holo display none, no draws after first frame', `.holo display=${r0.d}; draws at 300 ms ${r0.draws}, new draws in 1 s ${n}`);
    await ctx.close();
    const pr = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { tag: 'print' });
    await pr.p.emulateMedia({ media: 'print' });
    const d = await pr.p.evaluate(() => getComputedStyle(document.querySelector('.holo')).display);
    check(d === 'none', 'print media: .holo display none', `display=${d}`);
    await pr.ctx.close();
  }

  // b. html[data-holo-paused] stops the loop (detail panel open), removing it resumes.
  // Draw-rate numbers (30 fps throttle) are informational: SwiftShader is CPU rendering and can flake.
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { tag: 'paused' });
    const running = await count(p, 600);
    await p.evaluate(() => document.documentElement.setAttribute('data-holo-paused', ''));
    await p.waitForTimeout(150);
    const paused = await count(p, 600);
    await p.evaluate(() => document.documentElement.removeAttribute('data-holo-paused'));
    const resumed = await count(p, 600);
    check(paused === 0 && resumed >= 3 && running >= 3, 'data-holo-paused stops draws, removal resumes', `draws per 600 ms: running ${running}, paused ${paused}, resumed ${resumed}`);
    info('draw rate (30 fps throttle expects ~18 per 600 ms; want >= 10 on a real machine)', `running ${running}, resumed ${resumed}`);
    await ctx.close();
  }

  // Hidden tab: draws stop (simulated via document.hidden + visibilitychange) and resume.
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { tag: 'hidden-tab' });
    const visible = await count(p, 500);
    await p.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hid });
      window.__hid = true; document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(200);
    const hiddenN = await count(p, 500);
    await p.evaluate(() => { window.__hid = false; document.dispatchEvent(new Event('visibilitychange')); });
    const resumed = await count(p, 500);
    check(visible >= 3 && hiddenN === 0 && resumed >= 3, 'hidden tab stops draws',
      `drawArrays per 500 ms: visible ${visible}, hidden ${hiddenN}, visible again ${resumed} (simulated; real Chrome also stops rAF in background tabs; ~15 expected at 30 fps)`);
    await ctx.close();
  }

  // c. Resize: canvas pixel size follows the viewport (0.5x), and no realloc when the size does not change.
  {
    const { ctx, p } = await open({ viewport: { width: 1100, height: 800 }, colorScheme: 'light' }, { tag: 'resize' });
    const sz = () => p.evaluate(() => { const c = document.querySelector('.holo__canvas'); return `${c.width}x${c.height}`; });
    const s1 = await sz();
    await p.setViewportSize({ width: 700, height: 600 });
    await p.waitForTimeout(300);
    const s2 = await sz();
    await p.waitForTimeout(300);
    const v0 = await p.evaluate(() => window.__viewports);
    await p.evaluate(() => window.dispatchEvent(new Event('resize'))); // no real size change
    await p.waitForTimeout(500);
    const v1 = await p.evaluate(() => window.__viewports);
    check(s1 === '550x400' && s2 === '350x300' && v1 === v0, 'resize: canvas size follows, no realloc if unchanged',
      `1100x800 -> ${s1} (want 550x400), 700x600 -> ${s2} (want 350x300); gl.viewport calls after a no-op resize event: ${v1 - v0} (want 0)`);
    await ctx.close();
  }

  // g. Fade-in: canvas opacity 0 -> 1 over ~--dur-slow, sampled with rAF in the page; reduced motion has no transition.
  // The startup fade can happen while SwiftShader stalls the main thread, so it is replayed on an idle page:
  // drop the --on class, wait for it to settle, add it back and sample every animation frame.
  const FADE_REPLAY = () => new Promise((resolve) => {
    const c = document.querySelector('.holo__canvas');
    c.classList.remove('holo__canvas--on');
    setTimeout(() => {
      const s = [], t0 = performance.now();
      c.classList.add('holo__canvas--on');
      const k = () => { s.push([performance.now() - t0, +getComputedStyle(c).opacity]); if (performance.now() - t0 < 900) requestAnimationFrame(k); else resolve(s); };
      k();
    }, 800);
  });
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme: 'light' }, { tag: 'fade' });
    const f = await p.evaluate(FADE_REPLAY);
    const tok = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-slow')));
    const tr = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('.holo__canvas')); return { prop: cs.transitionProperty, dur: parseFloat(cs.transitionDuration) * 1000 }; });
    const up = f.filter((s) => s[1] > 0.02 && s[1] < 0.98);
    const t0 = f.find((s) => s[1] > 0.02)?.[0], t1 = f.find((s) => s[1] >= 0.98)?.[0];
    const dur = t0 !== undefined && t1 !== undefined ? t1 - t0 : NaN;
    const mono = f.every((s, i) => i === 0 || s[1] >= f[i - 1][1] - 0.001);
    check(f[0][1] < 0.1 && f.at(-1)[1] === 1 && up.length >= 3 && mono && dur > 150 && dur < 1000 && tr.prop.includes('opacity') && Math.abs(tr.dur - tok) < 1, 'canvas fade-in 0 -> 1 over --dur-slow',
      `${f.length} rAF samples, first opacity ${f[0][1]}, last ${f.at(-1)[1]}, ${up.length} intermediate, monotonic=${mono}, rise ${dur.toFixed(0)} ms; computed transition ${tr.prop} ${tr.dur} ms vs --dur-slow ${tok}`);
    await ctx.close();
    const rm = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', reducedMotion: 'reduce' }, { tag: 'fade-rm' });
    const g = await rm.p.evaluate(FADE_REPLAY);
    const tp = await rm.p.evaluate(() => getComputedStyle(document.querySelector('.holo__canvas')).transitionProperty);
    const mid = g.filter((s) => s[1] > 0.02 && s[1] < 0.98).length;
    check(tp === 'none' && mid === 0 && g[0][1] === 1, 'reduced motion: canvas has transition none (appears at once)', `transition-property ${tp}, intermediate opacity samples ${mid}, opacity right after adding the class ${g[0][1]}`);
    await rm.ctx.close();
  }

  // Reduced motion: no CSS animation, canvas shows ONE static frame and never redraws.
  {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], reducedMotion: 'reduce', colorScheme: 'light' }, { tag: 'reduced-motion' });
    await p.waitForSelector('.title-wrap');
    const m = await animInfo(p);
    // phase 4b adds WAAPI opacity fades (intro bubble/form, 200 ms): only CSS animations/transitions must be gone here; the WAAPI ones are checked in 4b (no translate/scale)
    const cssAnims = await p.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.effect.getComputedTiming().iterations === Infinity).length);
    check(cssAnims === 0 && m.computed.length === 1 && m.computed.every((n) => n === 'none'), 'reduced motion CSS',
      `${cssAnims} looping CSS animation(s) (${m.count} animation objects in total incl. one-shot WAAPI fades), .title-wrap animation-name [${m.computed}]`);
    const c = await p.evaluate(() => ({ hidden: document.querySelector('.holo__canvas').hidden, draws: window.__draws }));
    await p.screenshot(); // warm-up: the first capture settles text AA in the input (<=2/765 diff, outside the canvas)
    await p.waitForTimeout(500);
    const c1 = await p.evaluate(() => window.__draws);
    const shotA = await p.screenshot();
    await p.waitForTimeout(1000);
    const c2 = await p.evaluate(() => window.__draws);
    const shotB = await p.screenshot();
    const same = shotA.equals(shotB);
    check(c.hidden === false && c1 === c2 && same, 'reduced motion canvas: one static frame',
      `canvas hidden=${c.hidden}; draws total ${c.draws} -> ${c1} -> ${c2} (no new draws); screenshots 1 s apart identical=${same}`);
    await ctx.close();
  }

  // ===== Phase 4a: animated 2D Chao (DESIGN §13) =====
  // Deterministic: every sample freezes ALL document animations at an explicit currentTime (§13.11), so no timing flake.
  // Dev hooks used (dev server only): ?noblink, ?t=9500 (frozen background), window.__chao = { el, setMood, talk, voiceLevel }.
  const CHAO_HELPERS = () => {
    window.__blinks = [];
    new MutationObserver((ms) => ms.forEach((m) => m.target.hasAttribute?.('data-blink') && window.__blinks.push(Math.round(performance.now()))))
      .observe(document, { attributes: true, attributeFilter: ['data-blink'], subtree: true });
    window.__freeze = (t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; });
    window.__thaw = () => document.getAnimations().forEach((a) => a.cancel()); // NB: a cancelled CSS animation is NOT restarted by CSS until the style changes: always __reset() before the next scenario
    window.__play = () => document.getAnimations().forEach((a) => a.play());
    window.__reset = (c) => { document.getAnimations().forEach((a) => a.cancel()); ['data-mood', 'data-talking', 'data-blink'].forEach((n) => c.removeAttribute(n)); c.style.removeProperty('--voice-level'); void c.offsetWidth; };
    window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // percent of a box dimension from a computed translate component ("-21.9%" or "12px")
    window.__pct = (tok, dim) => (tok.endsWith('%') ? parseFloat(tok) : (parseFloat(tok) / dim) * 100);
    window.__tr = (el) => { // computed translate -> [x%, y%] of the element's own box
      const t = getComputedStyle(el).translate;
      if (t === 'none') return [0, 0];
      const [x, y = '0'] = t.split(' ');
      return [window.__pct(x, el.offsetWidth), window.__pct(y, el.offsetHeight)];
    };
    window.__sc = (el, pseudo) => { const [x, y = x] = getComputedStyle(el, pseudo).scale.split(' ').map((v) => (v === 'none' ? 1 : parseFloat(v))); return [x, y]; };
    window.__anims = (root) => root.getAnimations({ subtree: true }).map((a) => ({
      kind: a.constructor.name, name: a.animationName ?? a.transitionProperty ?? 'waapi', state: a.playState,
      target: a.effect.target, pseudo: a.effect.pseudoElement,
      props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))],
    }));
  };
  const CHAO_URL = `${BASE}/?lab&noblink&t=9500`; // the Chao lab lives in src/dev/lab.ts (?lab); the product page has the narrator Chao only
  const MOODS = ['enter', 'idle', 'listen', 'think', 'happy', 'sad', 'error'];
  const L = content.styleTile.chaoLab;
  const chaoPage = async (extra = {}, url = CHAO_URL, tag = 'chao') => { // the lab is a dynamic import(): wait for its hook instead of racing it
    const r = await open({ viewport: VIEWPORTS[1], colorScheme: 'light', ...extra }, { url, init: [CHAO_HELPERS], tag });
    if (/[?&]lab(&|$)/.test(url)) await r.p.waitForFunction(() => window.__chao, null, { timeout: 15000 });
    return r;
  };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // 4a-1. Structure, a11y, layers load with the expected natural sizes.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-structure');
    const r = await p.evaluate(async () => {
      const mouth = new Image(); mouth.src = '/character/chao-mouth.webp'; await mouth.decode();
      const whole = new Image(); whole.src = '/character/chao.webp'; await whole.decode();
      return {
        mouth: [mouth.naturalWidth, mouth.naturalHeight], whole: [whole.naturalWidth, whole.naturalHeight],
        chaos: [...document.querySelectorAll('.chao')].map((c) => ({
          role: c.getAttribute('role'), label: c.getAttribute('aria-label'),
          imgs: [...c.querySelectorAll('img')].map((i) => ({ part: i.src.match(/chao-([\w-]+)\.(?:webp|svg)/)[1], lazy: i.getAttribute('loading'), alt: i.getAttribute('alt'), ok: i.complete && i.naturalWidth > 0, nat: [i.naturalWidth, i.naturalHeight], attr: [+i.getAttribute('width'), +i.getAttribute('height')] })),
          mouthBg: getComputedStyle(c.querySelector('.chao__mouth'), '::before').backgroundImage.includes('chao-mouth.webp'),
          text: c.textContent.trim(),
        })),
      };
    });
    // DESIGN 13.2 (rev 3): layers at 0.6x of the 557x992 frame = 334x595; the emotion ball is 5 SVG files, plus the happy-eyes SVG.
    const want = { wing: [126, 97], body: [307, 572], eyes: [166, 95], 'eyes-happy': [166, 95], ball: [148, 150], 'ball-think': [148, 150], 'ball-happy': [148, 150], 'ball-sad': [148, 150], 'ball-error': [148, 150] };
    const layersOk = r.chaos.length === 1 && r.chaos.every((c) => c.imgs.length === 9 && c.mouthBg && c.imgs.every((i) => i.ok && want[i.part] && i.nat.join() === want[i.part].join() && i.attr.join() === want[i.part].join()));
    check(layersOk && r.mouth.join() === '45,29' && r.whole.join() === '557,992', 'Chao: 9 images load (3 webp layers + happy-eyes SVG + 5 ball SVGs) + mouth bg, natural sizes == documented (and width/height attrs match)',
      `chaos found ${r.chaos.length} (lab page); per chao ${JSON.stringify(r.chaos[0].imgs.map((i) => `${i.part} ${i.nat.join('x')}`))} + mouth ${r.mouth.join('x')} (CSS background), chao.webp ${r.whole.join('x')}`);
    check(r.chaos.every((c) => c.imgs.every((i) => i.lazy === null)), 'Chao: no image has loading="lazy"', `loading attrs: [${r.chaos[0].imgs.map((i) => i.lazy)}]`);
    check(r.chaos.every((c) => c.role === 'img' && c.label === content.character.alt && c.imgs.every((i) => i.alt === '') && c.text === ''), 'Chao a11y: role=img + aria-label on .chao, alt="" on every layer, no text content',
      `roles [${r.chaos.map((c) => c.role)}], labels [${r.chaos.map((c) => JSON.stringify(c.label))}] (want ${JSON.stringify(content.character.alt)}), alts [${r.chaos.flatMap((c) => c.imgs.map((i) => JSON.stringify(i.alt)))}]`);
    await ctx.close();
  }

  // 4a-2. Every mood exists and plays; animated properties; max simultaneously animated elements.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-moods');
    const EXPECT = {
      enter: ['chao-enter-x', 'chao-hop', 'chao-hop-counter', 'chao-flap', 'chao-ball-pop-enter'],
      idle: ['chao-float', 'chao-flutter', 'chao-ball-bob'],
      listen: ['chao-float', 'chao-flutter', 'chao-ball-bob'],
      think: ['chao-float', 'chao-sway', 'chao-flutter', 'chao-orbit'],
      happy: ['chao-jump', 'chao-jump-counter', 'chao-float', 'chao-flap', 'chao-flutter', 'chao-ball-pop-jump', 'chao-ball-bob'],
      sad: ['chao-shrug', 'chao-shrug-counter', 'chao-float'],
      error: ['chao-jitter', 'chao-droop', 'chao-droop-counter', 'chao-float', 'chao-daze', 'chao-orbit'],
    };
    const r = await p.evaluate(async ({ MOODS, EXPECT }) => {
      const c = window.__chao.el, out = {};
      const ids = new Map();
      const idOf = (e, ps) => { if (!ids.has(e)) ids.set(e, ids.size); return `${ids.get(e)}${ps || ''}`; };
      const snap = () => { const a = window.__anims(c); return { names: [...new Set(a.filter((x) => x.kind === 'CSSAnimation').map((x) => x.name))], targets: new Set(a.filter((x) => !x.target.classList?.contains('chao__glyph')).map((x) => idOf(x.target, x.pseudo))).size, glyphTargets: new Set(a.filter((x) => x.target.classList?.contains('chao__glyph')).map((x) => idOf(x.target))).size, props: a.flatMap((x) => x.props), kinds: [...new Set(a.map((x) => x.kind))], running: a.filter((x) => x.kind === 'CSSAnimation').every((x) => x.state === 'running') }; };
      for (const m of MOODS) {
        window.__reset(c);
        window.__chao.setMood(c, m === 'idle' ? 'error' : 'idle'); // a real change each time, with the previous mood's loops alive
        await window.__wait(400);
        window.__chao.setMood(c, m);
        const imm = snap(); // right after the switch: CSS animations + transitions + WAAPI blend
        c.dataset.talking = 'cycle'; c.setAttribute('data-blink', '');
        const worst = snap(); // + talk cycle + blink
        delete c.dataset.talking; c.removeAttribute('data-blink');
        await window.__wait(m === 'enter' ? 50 : 100);
        out[m] = { mood: c.dataset.mood, names: imm.names, expectOk: EXPECT[m].every((n) => imm.names.includes(n)), running: imm.running, targetsImm: imm.targets, targetsWorst: worst.targets, glyphs: Math.max(imm.glyphTargets, worst.glyphTargets), props: [...imm.props, ...worst.props], kinds: imm.kinds };
      }
      return out;
    }, { MOODS, EXPECT });
    for (const m of MOODS) check(r[m].mood === m && r[m].expectOk && r[m].running, `Chao mood "${m}" exists and plays`, `data-mood=${r[m].mood}; CSS animations [${r[m].names}] (want superset of [${EXPECT[m]}]); all running=${r[m].running}`);
    const allProps = [...new Set(MOODS.flatMap((m) => r[m].props))].sort();
    const ALLOWED = ['transform', 'translate', 'rotate', 'scale', 'opacity', '--voice-level'];
    const bad = allProps.filter((x) => !ALLOWED.includes(x));
    check(!bad.length, 'Chao animates only transform/translate/rotate/scale/opacity (+ the documented --voice-level driver)', `observed animated properties across all moods, talk and blink: [${allProps}]; offenders [${bad}]`);
    const maxT = Math.max(...MOODS.flatMap((m) => [r[m].targetsImm, r[m].targetsWorst]));
    const maxNoEnter = Math.max(...MOODS.filter((m) => m !== 'enter').flatMap((m) => [r[m].targetsImm, r[m].targetsWorst]));
    // Limit 8 (7 + the 260 ms happy-eyes fade, transient): this script's own guard (DESIGN 13 states none): enforced for the loop moods; enter (.chao travels + 2 poses + wing + ball + talk + blink) is reported.
    check(maxNoEnter <= 8, 'Chao: at most 8 simultaneously animated elements outside the entrance (own guard, not in DESIGN)', `max distinct animated targets per mood (incl. transitions, WAAPI blend, talk cycle, blink; the 5 ball glyph fade/pop transitions counted apart): ${MOODS.map((m) => `${m} ${r[m].targetsImm}/${r[m].targetsWorst} (+${r[m].glyphs} glyph)`).join(', ')} -> max ${maxT} (enter + talk + blink = ${Math.max(r.enter.targetsImm, r.enter.targetsWorst)}; the others max ${maxNoEnter})`);
    const tp = await p.evaluate(() => [...new Set([...document.querySelectorAll('.chao, .chao *')].flatMap((e) => { const cs = getComputedStyle(e), d = cs.transitionDuration.split(', '); return cs.transitionProperty.split(', ').filter((_, i) => parseFloat(d[i % d.length]) > 0); }))].sort());
    check(tp.length > 0 && tp.every((x) => ['translate', 'rotate', 'scale', 'opacity'].includes(x)), 'Chao CSS transitions (non-zero duration) only on translate/rotate/scale (+ the ball glyph opacity fade)', `transition properties with a non-zero duration on the Chao subtree: [${tp}]`);
    // rev 3: the CSS transition block is gone; only the ball glyphs (fade + pop) and the happy eyes (fade) may transition
    const tt = await p.evaluate(() => [...new Set([...document.querySelectorAll('.chao, .chao *')].filter((e) => { const cs = getComputedStyle(e); return cs.transitionDuration.split(', ').some((d) => parseFloat(d) > 0) && cs.transitionProperty !== 'none'; }).map((e) => e.className || e.tagName))].sort());
    check(tt.length > 0 && tt.every((c) => /chao__glyph|chao__eyes-happy/.test(c)), 'Chao CSS transitions only on the ball glyphs and the happy eyes (no transition on body parts: the WAAPI blend does that)', `elements with a non-zero transition: [${tt}]`);
    await ctx.close();
  }

  // 4a-3. Frozen-instant assertions (§13.11): enter, happy, blink, talk, voice-level, blend, repeat, pause.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-frozen');
    // enter (DESIGN 13.5/13.11): timing at the designer's instants, lab (--chao-enter-from is -100vw now)
    const en = await p.evaluate(async () => {
      const o = {};
      for (const [name, sel] of [['lab', '.chao-lab__stage .chao']]) { // the product-page Chao (hero) is covered by the 4b intro checks
        const c = document.querySelector(sel), pose = c.querySelector('.chao__pose'), ball = c.querySelector('.chao__ball');
        const before = c.getBoundingClientRect().left;
        c.dataset.mood = 'enter';
        const rows = [];
        for (const t of [0, 120, 200, 240, 280, 400, 520, 560, 660, 760, 870, 1000]) {
          window.__freeze(t);
          const r = c.getBoundingClientRect(), b = ball.getBoundingClientRect();
          rows.push({ t, right: r.right, left: r.left, y: window.__tr(pose)[1], ratio: b.width / b.height, sw: document.documentElement.scrollWidth });
        }
        o[name] = { rows, before, finalTranslate: getComputedStyle(c).translate, vw: innerWidth };
        window.__thaw(); c.dataset.mood = 'idle';
      }
      return o;
    });
    const row = (n, t) => en[n].rows.find((x) => x.t === t);
    for (const n of ['lab']) {
      const R = en[n].rows, xs = R.map((x) => x.left);
      const mono = xs.every((v, i) => i === 0 || v >= xs[i - 1] - 0.01);
      const settled = [760, 870, 1000].every((t) => Math.abs(row(n, t).left - en[n].before) < 0.6);
      check(row(n, 0).right <= 0 && mono && settled && en[n].finalTranslate.replace(/px/g, '').split(' ').every((v) => v === 'none' || parseFloat(v) === 0),
        `Chao enter timing (${n}): off-screen at 0 ms (right edge <= 0), x monotonic, arrives by 760 ms (x == rest position), still at 870/1000`,
        `${n} rest left ${en[n].before.toFixed(1)}; right edge at 0 ms ${row(n, 0).right.toFixed(1)}; left at 120/240/400/560/760/870/1000 = ${[120, 240, 400, 560, 760, 870, 1000].map((t) => (row(n, t).left - en[n].before).toFixed(1))} (offset from rest); translate at 1000: "${en[n].finalTranslate}"`);
      check(near(row(n, 120).y, -16, 1.5) && near(row(n, 400).y, -12.8, 1.5) && near(row(n, 660).y, -8.8, 1.5) && [0, 240, 520, 760, 1000].every((t) => Math.abs(row(n, t).y) < 1.5),
        `Chao enter (${n}): three hops (-16 / -12.8 / -8.8 %) peaking at 120/400/660 ms, grounded at 0/240/520/760/1000`,
        `pose translateY at 0/120/240/400/520/660/760/1000 = ${[0, 120, 240, 400, 520, 660, 760, 1000].map((t) => row(n, t).y.toFixed(1))} %`);
      check(R.every((x) => near(x.ratio, 148 / 150, 0.02 * 148 / 150)), `Chao enter (${n}): the ball box keeps 148:150 at every sampled instant (counter-scale)`, `ratios ${R.map((x) => x.ratio.toFixed(3))} (want ${(148 / 150).toFixed(3)} +-2 %)`);
    }
    check(en.lab.rows.every((x) => x.sw <= en.lab.vw), 'Chao enter: no horizontal scroll at any sampled instant', `max scrollWidth ${Math.max(...en.lab.rows.map((x) => x.sw))} <= innerWidth ${en.lab.vw}`);

    // lab Enter button: real-time flow ends in idle and aria-pressed follows
    const flow = await p.evaluate(async (L) => {
      const btn = (t) => [...document.querySelectorAll('.lab-btn')].find((b) => b.textContent === t);
      const c = window.__chao.el, t0 = performance.now();
      btn(L.enter).click(); // pick() is async: images are decoded first, then data-mood becomes "enter"
      while (c.dataset.mood !== 'enter' && performance.now() - t0 < 1000) await window.__wait(4);
      const tEnter = performance.now(), startLag = tEnter - t0;
      const mid = { mood: c.dataset.mood, enter: btn(L.enter).getAttribute('aria-pressed'), idle: btn(L.idle).getAttribute('aria-pressed'), startLag };
      while (c.dataset.mood !== 'idle' && performance.now() - tEnter < 3000) await window.__wait(8);
      return { mid, dt: performance.now() - tEnter, mood: c.dataset.mood, enter: btn(L.enter).getAttribute('aria-pressed'), idle: btn(L.idle).getAttribute('aria-pressed') };
    }, L);
    await p.waitForTimeout(100);
    const flow2 = await p.evaluate((L) => { const btn = (t) => [...document.querySelectorAll('.lab-btn')].find((b) => b.textContent === t); return { enter: btn(L.enter).getAttribute('aria-pressed'), idle: btn(L.idle).getAttribute('aria-pressed') }; }, L);
    check(flow.mid.mood === 'enter' && flow.mid.enter === 'true' && flow.mood === 'idle' && flow.dt > 800 && flow.dt < 1700 && flow2.idle === 'true' && flow2.enter === 'false',
      'Chao enter via lab button: enter -> (about 1 s) -> data-mood="idle", aria-pressed follows', `click -> data-mood=enter after ${flow.mid.startLag.toFixed(0)} ms (image decode), enter-pressed=${flow.mid.enter}; back to idle ${flow.dt.toFixed(0)} ms after enter started; 100 ms later idle-pressed=${flow2.idle}, enter-pressed=${flow2.enter}`);

    // happy @377 and replay
    const hp = await p.evaluate(async () => {
      const c = window.__chao.el, pose = c.querySelector('.chao__pose');
      window.__reset(c);
      window.__chao.setMood(c, 'idle'); await window.__wait(500);
      window.__chao.setMood(c, 'happy');
      const bl = c.querySelector('.chao__ball'), ratio = (t) => { window.__freeze(t); const b = bl.getBoundingClientRect(); return b.width / b.height; };
      window.__freeze(377); const first = window.__tr(pose)[1]; // before the ratio sweep: a finished animation (>= 820 ms) drops out of getAnimations() and could not be rewound
      const ratios = { 60: ratio(60), 130: ratio(130), 210: ratio(210), 380: ratio(380), 590: ratio(590), 640: ratio(640), 819: ratio(819) };
      window.__play(); await window.__wait(1700); // jump (820 ms) is over, float runs
      const settled = window.__tr(pose)[1]; // somewhere in the float (<= 2.5 %)
      window.__chao.setMood(c, 'happy'); // repeat: must replay the jump
      window.__freeze(377); const second = window.__tr(pose)[1]; window.__thaw();
      window.__chao.setMood(c, 'happy');
      const names = window.__anims(c).filter((a) => a.kind === 'CSSAnimation').map((a) => a.name);
      return { first, second, settled, replayed: names.includes('chao-jump'), ratios };
    });
    check(near(hp.first, -22, 1.5) && near(hp.second, -22, 1.5) && Math.abs(hp.settled) < 5 && hp.replayed, 'Chao happy: translateY ~ -22% at 377 ms, and repeating setMood("happy") replays the jump',
      `first run ${hp.first.toFixed(2)}%, settled (float) ${hp.settled.toFixed(2)}%, after second setMood("happy") ${hp.second.toFixed(2)}%, chao-jump present again: ${hp.replayed}`);

    check(Object.values(hp.ratios).every((v) => near(v, 148 / 150, 0.02 * 148 / 150)), 'Chao happy: the ball box keeps 148:150 (+-2 %) at 60/130/210/380/590/640/819 ms (does not squash with the body)',
      `ratios ${Object.entries(hp.ratios).map(([t, v]) => t + ':' + v.toFixed(3))} (want ${(148 / 150).toFixed(3)})`);

    // blink: settled vs blend-active
    const bl = await p.evaluate(async () => {
      const c = window.__chao.el, eyes = c.querySelector('.chao__eyes'), res = {};
      const sample = (t) => { window.__freeze(t); const v = window.__sc(eyes)[1]; return +v.toFixed(3); };
      for (const [label, wait] of [['settled', 700], ['blend-active', 0]]) {
        window.__chao.setMood(c, 'idle'); await window.__wait(wait);
        c.removeAttribute('data-blink'); void c.offsetWidth; c.setAttribute('data-blink', '');
        res[label] = [0, 40, 75, 110, 150].map(sample);
        res[label + 'Props'] = eyes.getAnimations().map((a) => a.constructor.name + ':' + (a.animationName ?? 'waapi'));
        window.__thaw(); c.removeAttribute('data-blink');
      }
      return res;
    });
    check(bl.settled[0] === 1 && near(bl.settled[2], 0.08, 0.005) && bl.settled[1] > 0.08 && bl.settled[1] < 1 && bl.settled[3] > 0.08 && bl.settled[4] === 1 && near(bl.settled[1], bl.settled[3], 0.001),
      'Chao blink: scale 1 -> 1 0.08 at 75 ms -> 1 at 150 ms (symmetric), when no mood blend is running', `eyes scaleY at 0/40/75/110/150 ms = [${bl.settled}] (want 1, ~0.49, 0.08, ~0.49, 1)`);
    info("blink scale at 75 ms measured while the 260 ms WAAPI mood blend is still alive (the engineer's 0.214)", `[${bl['blend-active']}] with animations on eyes: ${bl['blend-activeProps']}. Root cause: freezing "all animations" at currentTime=t also rewinds the setMood() blend (WAAPI animations stack above CSS animations); in real time the blend is done after 260 ms. Sampling artifact; the real overlap only affects a blink that starts <260 ms after a mood change.`);

    // talk cycle
    const tk = await p.evaluate(async () => {
      const c = window.__chao.el, rig = c.querySelector('.chao__rig'), mouth = c.querySelector('.chao__mouth');
      window.__chao.setMood(c, 'idle'); await window.__wait(500);
      c.dataset.talking = 'cycle';
      const rows = [];
      for (const t of [0, 90, 180, 288, 495, 600]) {
        window.__freeze(t); // --voice-level lives on .chao__mouth only (DESIGN 13.5), not on the rig
        rows.push({ t, v: +parseFloat(getComputedStyle(mouth).getPropertyValue('--voice-level')).toFixed(3), after: +getComputedStyle(mouth, '::after').opacity, before: +getComputedStyle(mouth, '::before').opacity, rig: window.__sc(rig) });
      }
      window.__thaw(); delete c.dataset.talking;
      return rows;
    });
    const want2 = { 0: 0, 90: 0.9, 180: 0, 288: 0.7, 495: 1, 600: 0 }; // rev 2: valleys reach 0, the mouth really closes between syllables
    check(tk.every((r) => near(r.v, want2[r.t], 0.06)) && tk[0].after === 0 && tk[1].after > 0.9 && tk[1].before < 0.1 && tk[2].after === 0 && tk[2].before === 1 && tk[5].after === 0 && tk[5].before === 1 && tk[4].rig[1] > 1.05 && tk[4].rig[0] < 0.97,
      'Chao talk cycle: --voice-level (on the mouth) follows the keyframes: ~0.9 at 90 ms, 0 at 180 and 600 ms with the open mouth at opacity 0 (mouth really closes), body stretches', tk.map((r) => `t${r.t}: level ${r.v}, open-mouth opacity ${r.after}, closed ${r.before}, rig scale ${r.rig.map((v) => v.toFixed(3))}`).join(' | '));

    // --voice-level drives mouth + body; voice wins over cycle; talk() times out
    const vl = await p.evaluate(async () => {
      const c = window.__chao.el, rig = c.querySelector('.chao__rig'), mouth = c.querySelector('.chao__mouth'), o = {};
      window.__chao.setMood(c, 'idle'); await window.__wait(500);
      const read = () => ({ talking: c.dataset.talking ?? null, after: +(+getComputedStyle(mouth, '::after').opacity).toFixed(3), before: +(+getComputedStyle(mouth, '::before').opacity).toFixed(3), rig: window.__sc(rig).map((v) => +v.toFixed(4)), afterScale: window.__sc(mouth, '::after').map((v) => +v.toFixed(3)), inline: mouth.style.getPropertyValue('--voice-level') });
      for (const lv of [0, 0.03, 0.1, 0.3, 0.5, 1]) { window.__chao.voiceLevel(c, lv); o[lv] = read(); }
      window.__chao.voiceLevel(c, 0.5);
      window.__chao.talk(c, 1500); /* talk(chao, ms): DESIGN §17.3 */ o.afterTalkCall = c.dataset.talking;
      window.__chao.voiceLevel(c, null); o.cleared = { talking: c.dataset.talking ?? null, inline: mouth.style.getPropertyValue('--voice-level') };
      window.__chao.talk(c, 600); o.t0 = c.dataset.talking; await window.__wait(300); o.t300 = c.dataset.talking; await window.__wait(700); o.t1000 = c.dataset.talking ?? null;
      window.__chao.talk(c, 3000); await window.__wait(2500); o.long2500 = c.dataset.talking ?? null; await window.__wait(500); o.long3000 = c.dataset.talking ?? null;
      return o;
    });
    check(vl[0].after === 0 && vl[0].before === 1 && vl[0.03].after === 0 && vl[0.1].after === 1 && near(vl[0.1].afterScale[0], 0.55 + 0.45 * 0.15, 0.01) && vl[0.5].after === 1 && vl[0.5].before === 0 &&
      near(vl[0.5].rig[0], 1 - 0.035 * 0.5, 0.001) && near(vl[0.5].rig[1], 1 + 0.06 * 0.5, 0.001) && near(vl[1].rig[1], 1.06, 0.001) && near(vl[0.3].afterScale[0], 0.685, 0.01) && near(vl[0.3].afterScale[1], 0.405, 0.01) &&
      vl[0.5].talking === 'voice' && vl[0.5].inline === '0.500',
      '--voice-level drives mouth opacity/scale and body stretch (data-talking="voice")', Object.entries(vl).filter(([k]) => !isNaN(k)).map(([k, v]) => `lv ${k}: open ${v.after}/closed ${v.before}, openScale ${v.afterScale}, rig ${v.rig}, inline "${v.inline}", talking ${v.talking}`).join(" | "));
    check(vl.afterTalkCall === 'voice' && vl.cleared.talking === null && vl.cleared.inline === '' && vl.t0 === 'cycle' && vl.t300 === 'cycle' && vl.t1000 === null && vl.long2500 === 'cycle' && vl.long3000 === null,
      'talk(ms): voice wins over cycle; voiceLevel(null) clears; the cycle lasts exactly the ms it is given (no clamp since §17.3)', `after talk() during voice "${vl.afterTalkCall}"; cleared ${JSON.stringify(vl.cleared)}; talk(600): 0/300/1000 ms ${vl.t0}/${vl.t300}/${vl.t1000}; talk(3000): 2500/3500 ms ${vl.long2500}/${vl.long3000}`);

    // think -> idle blend without jumps (deterministic: freeze at the sway extreme, switch, step 16 ms)
    const bd = await p.evaluate(async () => {
      const c = window.__chao.el, pose = c.querySelector('.chao__pose'), deg = () => parseFloat(getComputedStyle(pose).rotate);
      window.__chao.setMood(c, 'idle'); await window.__wait(500);
      window.__chao.setMood(c, 'think'); await window.__wait(450);
      window.__freeze(375); const pre = deg(); // sway extreme: tilt -2.5 + 4
      window.__chao.setMood(c, 'idle');
      const seq = [];
      for (let t = 0; t <= 320; t += 16) { window.__freeze(t); seq.push(deg()); }
      window.__thaw();
      // negative control: same switch with the blend removed -> the check must see the jump
      window.__chao.setMood(c, 'think'); await window.__wait(450); window.__freeze(375);
      const pre2 = deg(); c.dataset.mood = 'idle'; // no setMood() = no blend
      window.__freeze(0); const noBlend0 = deg(); window.__thaw();
      return { pre, seq, pre2, noBlend0 };
    });
    const steps = bd.seq.slice(1).map((v, i) => Math.abs(v - bd.seq[i]));
    check(Math.abs(bd.pre) > 1 && Math.abs(bd.seq[0] - bd.pre) < 0.15 && Math.max(...steps) <= 1 && Math.abs(bd.seq.at(-1)) < 0.02 && bd.seq.slice(0, 16).every((v, i, a) => i === 0 || Math.abs(v) <= Math.abs(a[i - 1]) + 0.01),
      'think -> idle: rotate decays gradually (no step > 1 deg between 16 ms samples, starts at the live value, ends at 0, monotone)', `rotate before ${bd.pre.toFixed(2)} deg; samples every 16 ms: ${bd.seq.slice(0, 18).map((v) => v.toFixed(2)).join(' ')}; max step ${Math.max(...steps).toFixed(3)} deg`);
    check(Math.abs(bd.pre2 - bd.noBlend0) > 1, 'blend test is sensitive (control: switching WITHOUT setMood() jumps)', `rotate ${bd.pre2.toFixed(2)} -> ${bd.noBlend0.toFixed(2)} in one frame without the blend (step ${Math.abs(bd.pre2 - bd.noBlend0).toFixed(2)} deg > 1)`);

    // data-holo-paused freezes the Chao
    const hz = await p.evaluate(async () => {
      const c = window.__chao.el;
      window.__reset(c);
      window.__chao.setMood(c, 'think'); c.dataset.talking = 'cycle'; await window.__wait(500);
      document.documentElement.setAttribute('data-holo-paused', ''); await window.__wait(50);
      const css = window.__anims(c).filter((a) => a.kind === 'CSSAnimation');
      const t0 = c.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).map((a) => a.currentTime);
      await window.__wait(300);
      const t1 = c.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).map((a) => a.currentTime);
      const pausedAll = css.every((a) => a.state === 'paused');
      document.documentElement.removeAttribute('data-holo-paused'); await window.__wait(150);
      const resumed = window.__anims(c).filter((a) => a.kind === 'CSSAnimation').every((a) => a.state === 'running');
      delete c.dataset.talking;
      return { n: css.length, pausedAll, same: t0.join() === t1.join(), resumed };
    });
    check(hz.n >= 5 && hz.pausedAll && hz.same && hz.resumed, 'data-holo-paused on <html> pauses every Chao CSS animation; removing resumes', `${hz.n} CSS animations (think + talk): all paused ${hz.pausedAll}, currentTime unchanged over 300 ms ${hz.same}, resumed after removal ${hz.resumed}`);
    await ctx.close();
  }

  // 4a-3b. Revision 2 behaviors (DESIGN 13.1, 13.4, 13.8, 13.11): hidden w/o mood, ball shapes, error daze vs blink,
  // double playEnter, voiceLevel clamps, soft stop of talking, blink cleanup.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-rev2');
    await p.waitForTimeout(1500); // first shader compile: WAAPI animations stay pending until the page paints

    const hid = await p.evaluate(async () => {
      const c = window.__chao.el;
      c.removeAttribute('data-mood');
      const hidden = getComputedStyle(c).visibility;
      window.__chao.setMood(c, 'idle');
      return { hidden, shown: getComputedStyle(c).visibility };
    });
    check(hid.hidden === 'hidden' && hid.shown === 'visible', 'Chao without data-mood is visibility:hidden; setMood shows it', `no mood -> ${hid.hidden}; after setMood("idle") -> ${hid.shown}`);

    const sh = await p.evaluate(async () => {
      const c = window.__chao.el, out = {};
      const WANT = { enter: 'ball', idle: 'ball', listen: 'ball', think: 'think', happy: 'happy', sad: 'sad', error: 'error' };
      for (const m of Object.keys(WANT)) {
        window.__reset(c);
        window.__chao.setMood(c, m === 'idle' ? 'error' : 'idle'); await window.__wait(30);
        window.__chao.setMood(c, m); await window.__wait(600); // glyph transitions (260 ms) settled
        const g = Object.fromEntries([...c.querySelectorAll('.chao__glyph')].map((e) => [e.className.match(/glyph--(\w+)/)[1], { op: +(+getComputedStyle(e).opacity).toFixed(2), sc: getComputedStyle(e).scale }]));
        out[m] = { want: WANT[m], g };
      }
      return out;
    });
    const shapeOk = Object.values(sh).every((r) => Object.entries(r.g).every(([k, v]) => (k === r.want ? v.op === 1 && (v.sc === 'none' || v.sc === '1') : v.op === 0 && v.sc === '0.6')));
    check(shapeOk, 'Ball shape per mood: only the mood glyph has opacity 1 (think ?, happy heart, sad drop, error !, others plain ball)',
      Object.entries(sh).map(([m, r]) => `${m}: ${Object.entries(r.g).filter(([, v]) => v.op > 0).map(([k]) => k)}`).join(' | '));

    // happy -> happy repeat: the glyph must not blink (opacity stays 1 for the frames after the repeat)
    const rep = await p.evaluate(async () => {
      const c = window.__chao.el, g = c.querySelector('.chao__glyph--happy'), ops = [];
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(30); window.__chao.setMood(c, 'happy'); await window.__wait(700);
      window.__chao.setMood(c, 'happy');
      for (let i = 0; i < 6; i++) { ops.push(+(+getComputedStyle(g).opacity).toFixed(2)); await new Promise((r) => requestAnimationFrame(r)); }
      return ops;
    });
    check(rep.every((v) => v === 1), 'Repeating setMood("happy") does not make the heart blink (opacity 1 on 6 consecutive frames)', `opacities ${rep}`);

    // error daze wins over a blink; blink() is a no-op in error; blink works elsewhere
    const dz = await p.evaluate(async () => {
      const c = window.__chao.el, eyes = c.querySelector('.chao__eyes'), o = {};
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(30); window.__chao.setMood(c, 'error');
      c.setAttribute('data-blink', ''); o.dazeWithAttr = getComputedStyle(eyes).animationName;
      c.removeAttribute('data-blink'); window.__chao.blink(c); o.blinkInError = c.hasAttribute('data-blink'); o.nameAfterBlinkCall = getComputedStyle(eyes).animationName;
      window.__chao.setMood(c, 'idle'); window.__chao.blink(c); o.blinkInIdle = c.hasAttribute('data-blink'); o.idleName = getComputedStyle(eyes).animationName;
      return o;
    });
    check(dz.dazeWithAttr === 'chao-daze' && dz.blinkInError === false && dz.nameAfterBlinkCall === 'chao-daze' && dz.blinkInIdle === true && dz.idleName === 'chao-blink',
      'Error: with data-blink present the eyes still run chao-daze; blink() is a no-op in error and works in idle', `error + data-blink -> "${dz.dazeWithAttr}"; blink() in error sets attribute: ${dz.blinkInError} (animation "${dz.nameAfterBlinkCall}"); blink() in idle sets attribute: ${dz.blinkInIdle} (animation "${dz.idleName}")`);

    // voiceLevel clamps
    const vc = await p.evaluate(async () => {
      const c = window.__chao.el, m = c.querySelector('.chao__mouth'), o = {};
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(30);
      for (const [k, v] of [['0.05', 0.05], ['0.099', 0.099], ['0.1', 0.1], ['0.12', 0.12], ['0.3', 0.3], ['NaN', NaN], ['2', 2], ['-1', -1], ['Infinity', Infinity]]) {
        window.__chao.voiceLevel(c, v);
        o[k] = { inline: m.style.getPropertyValue('--voice-level'), computed: +(+getComputedStyle(m).getPropertyValue('--voice-level')).toFixed(3), talking: c.dataset.talking };
      }
      window.__chao.voiceLevel(c, null);
      return o;
    });
    const exp = { '0.05': 0, '0.099': 0, '0.1': 0.15, '0.12': 0.15, '0.3': 0.3, NaN: 0, '2': 1, '-1': 0, Infinity: 0 };
    check(Object.entries(exp).every(([k, v]) => near(vc[k].computed, v, 0.001) && vc[k].talking === 'voice'), 'voiceLevel clamps: <0.1 -> 0, 0.1-0.15 -> 0.15, NaN/-1/Infinity -> 0, 2 -> 1, 0.3 stays',
      Object.entries(vc).map(([k, v]) => `${k} -> ${v.computed}`).join(', ') + ' (spec examples: 0.05->0, 0.12->0.15, NaN->0, 2->1)');

    // voiceLevel(null): soft stop, sampled by pausing the WAAPI easing animations
    const st = await p.evaluate(async () => {
      const c = window.__chao.el, rig = c.querySelector('.chao__rig'), m = c.querySelector('.chao__mouth'), o = {};
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(30);
      window.__chao.voiceLevel(c, 0.8);
      o.rigBefore = window.__sc(rig); o.levelBefore = +getComputedStyle(m).getPropertyValue('--voice-level');
      window.__chao.voiceLevel(c, null);
      o.talkingAfter = c.dataset.talking ?? null; o.inlineScale = rig.style.scale; o.inlineLevel = m.style.getPropertyValue('--voice-level');
      const ar = rig.getAnimations().filter((a) => a.constructor.name === 'Animation'), am = m.getAnimations().filter((a) => a.constructor.name === 'Animation');
      o.nWaapi = [ar.length, am.length]; o.dur = ar[0]?.effect.getTiming().duration;
      const at = (t) => { [...ar, ...am].forEach((a) => { a.pause(); a.currentTime = t; }); return { scale: window.__sc(rig), level: +getComputedStyle(m).getPropertyValue('--voice-level') }; };
      o.t0 = at(0); o.t80 = at(80); o.t160 = at(159.9);
      [...ar, ...am].forEach((a) => a.cancel());
      o.end = { scale: getComputedStyle(rig).scale, level: +getComputedStyle(m).getPropertyValue('--voice-level') };
      return o;
    });
    const mid = (v, a, b) => v > Math.min(a, b) + 0.0005 && v < Math.max(a, b) - 0.0005;
    check(st.talkingAfter === null && st.inlineScale === '' && st.inlineLevel === '' && st.nWaapi.join() === '1,1' && st.dur === 160 &&
      near(st.t0.scale[1], st.rigBefore[1], 0.002) && mid(st.t80.scale[1], st.rigBefore[1], 1) && mid(st.t80.level, st.levelBefore, 0) && near(st.t160.scale[1], 1, 0.002) && st.end.scale === 'none',
      'voiceLevel(null): body scale and mouth ease back over 160 ms (start == live value, 80 ms intermediate, end rest), no jump',
      `rig scaleY before ${st.rigBefore[1].toFixed(4)} -> WAAPI 0/80/160 ms ${st.t0.scale[1].toFixed(4)}/${st.t80.scale[1].toFixed(4)}/${st.t160.scale[1].toFixed(4)} -> "${st.end.scale}"; mouth level ${st.levelBefore} -> ${st.t0.level}/${st.t80.level.toFixed(3)}/${st.t160.level.toFixed(3)} -> ${st.end.level}; WAAPI animations rig/mouth ${st.nWaapi}, duration ${st.dur} ms; inline scale "${st.inlineScale}", inline level "${st.inlineLevel}"`);

    // talk() cycle ends softly too (stopTalking): a WAAPI easing animation exists at the instant data-talking is removed
    const tc = await p.evaluate(async () => {
      const c = window.__chao.el, rig = c.querySelector('.chao__rig');
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(30);
      window.__chao.talk(c, 700); const t0 = performance.now();
      while (c.dataset.talking === 'cycle' && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r));
      const n = rig.getAnimations().filter((a) => a.constructor.name === 'Animation').length;
      return { ms: performance.now() - t0, n, talking: c.dataset.talking ?? null };
    });
    check(tc.talking === null && tc.n === 1 && tc.ms > 650 && tc.ms < 1000, 'talk(700): ends after 0.7 s with a soft-stop easing animation on the rig', `data-talking cleared after ${tc.ms.toFixed(0)} ms; easing animations on rig at that moment: ${tc.n}`);

    // double playEnter (lab button clicked twice at once): one enter, one idle
    const de = await p.evaluate(async (L) => {
      const c = window.__chao.el, log = [];
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(60);
      const mo = new MutationObserver(() => { const v = c.getAttribute('data-mood'); if (v) log.push(v); }); mo.observe(c, { attributes: true, attributeFilter: ['data-mood'] });
      const b = [...document.querySelectorAll('.lab-btn')].find((x) => x.textContent === L.enter);
      b.click(); b.click();
      await window.__wait(2600); mo.disconnect();
      return { log, final: c.dataset.mood };
    }, L);
    check(de.log.filter((v) => v === 'enter').length === 1 && de.log.filter((v) => v === 'idle').length === 1 && de.final === 'idle', 'Two playEnter calls in a row: only the last one runs (one "enter", one "idle")', `data-mood sequence after 2 clicks on Enter: [${de.log}], final ${de.final}`);
    await ctx.close();

    // blink attribute is cleaned up on animationend (startBlink active: page WITHOUT ?noblink)
    const bp = await chaoPage({}, `${BASE}/?lab&t=9500`, 'chao-blink-cleanup');
    await bp.p.waitForTimeout(1500);
    const bc = await bp.p.evaluate(async () => {
      const c = window.__chao.el;
      window.__chao.setMood(c, 'idle'); await window.__wait(400);
      c.removeAttribute('data-blink'); window.__chao.blink(c);
      const set = c.hasAttribute('data-blink'); await window.__wait(260);
      return { set, after: c.hasAttribute('data-blink') };
    });
    check(bc.set && !bc.after, 'blink(): data-blink is set, then removed by animationend (<= 260 ms; startBlink active)', `set ${bc.set}, still present after 260 ms: ${bc.after}`);
    await bp.ctx.close();
  }

  // 4a-3c. Revision 3 (DESIGN 13.1, 13.9, 13.11): happy "^ ^" eyes + open smile, size-scaled outline, blink cleanup in error,
  // first setMood without blend, double playEnter through window.__chao, playEnter not waiting on late layers.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-rev3');
    await p.waitForTimeout(1500);

    // happy eyes vs the normal ones, per mood (opacity transitions of the happy eyes settled), at 12.5 rem
    const he = await p.evaluate(async () => {
      const c = window.__chao.el, out = {};
      c.style.setProperty('--chao-current', '12.5rem');
      for (const m of ['idle', 'listen', 'think', 'happy', 'sad', 'error', 'happy']) {
        window.__reset(c); window.__chao.setMood(c, m === 'idle' ? 'error' : 'idle'); await window.__wait(30);
        window.__chao.setMood(c, m); await window.__wait(700);
        const mouth = c.querySelector('.chao__mouth'), after = getComputedStyle(mouth, '::after'), before = getComputedStyle(mouth, '::before');
        out[m] = { eyes: +(+getComputedStyle(c.querySelector('.chao__eyes')).opacity).toFixed(2), happyEyes: +(+getComputedStyle(c.querySelector('.chao__eyes-happy')).opacity).toFixed(2),
          w: parseFloat(after.width), h: parseFloat(after.height), sc: after.scale, vw: parseFloat(after.width) * (after.scale === 'none' ? 1 : parseFloat(after.scale.split(' ')[0])), vh: parseFloat(after.height) * (after.scale === 'none' ? 1 : parseFloat(after.scale.split(' ')[1] ?? after.scale)), tr: after.transform, openOp: +after.opacity, closedOp: +before.opacity, tall: c.getBoundingClientRect().height };
      }
      c.style.removeProperty('--chao-current');
      return out;
    });
    check(he.happy.eyes === 0 && he.happy.happyEyes === 1, 'Chao happy: normal eyes opacity 0, "^ ^" eyes (chao__eyes-happy) opacity 1', `happy: eyes ${he.happy.eyes}, eyes-happy ${he.happy.happyEyes}`);
    check(['idle', 'listen', 'think', 'sad', 'error'].every((m) => he[m].happyEyes === 0 && he[m].eyes === 1), 'Chao other moods: "^ ^" eyes opacity 0, normal eyes opacity 1', ['idle', 'listen', 'think', 'sad', 'error'].map((m) => `${m}: eyes ${he[m].eyes}, eyes-happy ${he[m].happyEyes}`).join(' | '));
    const hm = he.happy;
    check(hm.openOp === 1 && hm.closedOp === 0 && hm.vw / hm.vh >= 2.5, 'Chao happy: open smile (::after) is shown, wider than tall (rendered ratio >= 2.5 at 12.5 rem)', `chao height ${hm.tall.toFixed(0)} px; ::after layout box ${hm.w.toFixed(1)} x ${hm.h.toFixed(1)} px, scale "${hm.sc}" -> rendered ${hm.vw.toFixed(1)} x ${hm.vh.toFixed(1)} px (ratio ${(hm.vw / hm.vh).toFixed(2)}; unscaled box ${(hm.w / hm.h).toFixed(2)}), opacity open ${hm.openOp} / closed v ${hm.closedOp}`);

    // outline scales with the Chao: filter blurs and shadow at 58 px and 200 px (lab rig, --chao-current set inline)
    const ol = await p.evaluate(async () => {
      const c = window.__chao.el, torso = c.querySelector('.chao__torso'), out = {};
      for (const [k, size] of [['58', '3.6rem'], ['200', '12.5rem']]) {
        c.style.setProperty('--chao-current', size);
        await window.__wait(50);
        const f = getComputedStyle(torso).filter;
        // computed form: drop-shadow(rgb(...) Xpx Ypx Bpx) ; the colour holds no px
        const sh = [...f.matchAll(/drop-shadow\(([^)]*\)[^)]*)\)/g)].map((m) => m[1].replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(parseFloat));
        out[k] = { h: c.getBoundingClientRect().height, sh };
      }
      c.style.removeProperty('--chao-current');
      return out;
    });
    const nearAll = (got, want) => got.length === want.length && got.every((r, i) => r.length === 3 && r.every((v, j) => near(v, want[i][j], 0.08)));
    const w58 = [[0, 0, 0.4], [0, 0, 0.4], [0, 0, 0.5], [0, 0, 0.5], [0, 0, 0.5], [0, 1.73, 2.3]];
    const w200 = [[0, 0, 0.8], [0, 0, 0.8], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 6, 8]];
    check(nearAll(ol['58'].sh, w58), 'Chao outline at 58 px: rim/contour blurs 0.4/0.5 px, shadow 0 ~1.7px ~2.3px', `height ${ol['58'].h.toFixed(1)} px; drop-shadows (x y blur) ${JSON.stringify(ol['58'].sh)}`);
    check(nearAll(ol['200'].sh, w200), 'Chao outline at 200 px: rim/contour blurs 0.8/1 px, shadow 0 6px 8px', `height ${ol['200'].h.toFixed(1)} px; drop-shadows (x y blur) ${JSON.stringify(ol['200'].sh)}`);

    // pending blink is dropped when entering error (setMood), and the daze plays
    const eb = await p.evaluate(async () => {
      const c = window.__chao.el;
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(30);
      c.setAttribute('data-blink', '');
      const before = c.hasAttribute('data-blink');
      window.__chao.setMood(c, 'error');
      return { before, after: c.hasAttribute('data-blink'), mood: c.dataset.mood };
    });
    check(eb.before && !eb.after && eb.mood === 'error', 'setMood("error") removes a pending data-blink', `data-blink before ${eb.before}, after ${eb.after}, mood ${eb.mood}`);

    // first setMood (no previous mood): no WAAPI blend animations; a later change does create them (control)
    const fm = await p.evaluate(async () => {
      const c = window.__chao.el, waapi = () => c.getAnimations({ subtree: true }).filter((a) => a.constructor.name === 'Animation').length;
      window.__reset(c);
      window.__chao.setMood(c, 'idle'); const first = waapi();
      await window.__wait(400); window.__chao.setMood(c, 'listen'); const change = waapi();
      return { first, change };
    });
    check(fm.first === 0 && fm.change > 0, 'First setMood creates no blend animations; a later mood change does', `WAAPI animations right after the first setMood: ${fm.first}; right after idle -> listen: ${fm.change}`);

    // double playEnter through the dev hook: [enter, idle], once each
    const dp = await p.evaluate(async () => {
      const c = window.__chao.el, log = [];
      window.__reset(c); window.__chao.setMood(c, 'idle'); await window.__wait(60);
      const mo = new MutationObserver(() => { const v = c.getAttribute('data-mood'); if (v) log.push(v); }); mo.observe(c, { attributes: true, attributeFilter: ['data-mood'] });
      const a = window.__chao.playEnter(c), b = window.__chao.playEnter(c);
      await Promise.all([a, b]); await window.__wait(100); mo.disconnect();
      return { log, final: c.dataset.mood };
    });
    check(dp.log.join() === 'enter,idle' && dp.final === 'idle', 'window.__chao.playEnter called twice: data-mood sequence [enter, idle], once', `sequence [${dp.log}], final ${dp.final}`);
    await ctx.close();

    // playEnter must not wait for the late layers (happy eyes, 4 ball glyphs): delay them 2.5 s, enter must still start well before the 1.5 s decode timeout
    {
      const lateCtx = await browser.newContext({ viewport: VIEWPORTS[1], colorScheme: 'light' });
      await lateCtx.addInitScript(CHAO_HELPERS);
      await lateCtx.route(/chao-(eyes-happy|ball-(think|happy|sad|error))\.svg/, async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue().catch(() => {}); });
      const lp = await lateCtx.newPage();
      watch(lp, 'chao-late-layers');
      await lp.goto(`${BASE}/?lab&noblink&t=9500`, { waitUntil: 'domcontentloaded' });
      await lp.waitForFunction(() => window.__chao, null, { timeout: 10000 });
      await lp.waitForTimeout(800); // the visible layers are in
      const le = await lp.evaluate(async () => {
        const c = window.__chao.el, t0 = performance.now();
        window.__chao.el.removeAttribute('data-mood');
        const done = window.__chao.playEnter(c);
        while (c.dataset.mood !== 'enter' && performance.now() - t0 < 3000) await window.__wait(4);
        const lag = performance.now() - t0;
        const pending = [...c.querySelectorAll('.chao__eyes-happy, .chao__glyph:not(.chao__glyph--ball)')].filter((i) => !i.complete).length;
        await done;
        return { lag, pending, mood: c.dataset.mood };
      });
      check(le.lag < 600 && le.pending > 0 && le.mood === 'idle', 'playEnter does not wait for the late layers (happy eyes + 4 ball glyphs held back 2.5 s)', `enter started ${le.lag.toFixed(0)} ms after the call (< 600; the decode timeout is 1500), ${le.pending} late images still loading at that moment, final mood ${le.mood}`);
      await lp.waitForLoadState('networkidle');
      await lateCtx.close();
    }
  }

  // 4a-4. Keyboard: Tab order, focus rings, Enter/Space, aria-pressed, hit size.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-keyboard');
    const order = [];
    for (let i = 0; i < 40; i++) {
      await p.keyboard.press('Tab');
      const f = await p.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { id: e.id, text: e.textContent.trim(), cls: e.className, visible: e.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, outline: `${cs.outlineStyle} ${cs.outlineWidth}`, h: e.getBoundingClientRect().height }; });
      order.push(f);
      if (f.id === 'chao-compact') break;
    }
    const labels = [L.enter, L.idle, L.listen, L.think, L.happy, L.sad, L.error, L.talk, L.blink];
    const seq = order.map((o) => (o.id ? '#' + o.id : o.text || o.cls));
    const start = seq.indexOf(L.enter);
    const expectSeq = [...labels, '#chao-compact'];
    const lab = order.slice(start, start + expectSeq.length);
    check(start >= 0 && expectSeq.every((s, i) => seq[start + i] === s), 'Keyboard: Tab reaches every lab control in visual order', `tab sequence: ${seq.join(' -> ')}`);
    check(lab.length === expectSeq.length && lab.every((o) => o.visible), 'Keyboard: every lab control shows a visible focus ring', lab.map((o) => `${o.text || '#' + o.id}[${o.outline}]`).join(', '));
    check(lab.filter((o) => labels.includes(o.text)).every((o) => o.h >= 44), 'Lab buttons are >= 44 px tall (DESIGN §13.12)', `heights [${lab.filter((o) => labels.includes(o.text)).map((o) => o.h.toFixed(0))}]`);
    await p.focus(`.lab-btn >> text="${L.idle}"`);
    await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); // real keyboard focus -> :focus-visible
    {
      const b = await p.locator('.chao-lab__stage').boundingBox(), r = await p.locator('.chao-lab__row').first().boundingBox();
      await p.screenshot({ path: `${OUT}/chao-focus-lab-1440-light.png`, clip: { x: Math.max(0, r.x - 20), y: b.y, width: Math.min(1200, r.width + 40), height: r.y + r.height - b.y + 20 } });
    }

    const pressed = () => p.evaluate((L) => ({ pressed: [L.enter, L.idle, L.listen, L.think, L.happy, L.sad, L.error].filter((t) => [...document.querySelectorAll('.lab-btn')].find((b) => b.textContent === t).getAttribute('aria-pressed') === 'true'), mood: window.__chao.el.dataset.mood }), L);
    const init = await pressed();
    const results = [];
    let key = 'Enter';
    for (const m of ['idle', 'listen', 'think', 'happy', 'sad', 'error']) {
      await p.focus(`.lab-btn >> text="${L[m]}"`);
      await p.keyboard.press(key === 'Space' ? ' ' : key);
      const s = await pressed();
      results.push(`${key} on ${L[m]} -> pressed [${s.pressed}] mood ${s.mood}`);
      if (!(s.pressed.length === 1 && s.pressed[0] === L[m] && s.mood === m)) errors.push(`[keyboard] ${key} on ${L[m]}: pressed [${s.pressed}], mood ${s.mood}`);
      key = key === 'Enter' ? 'Space' : 'Enter';
    }
    await p.focus(`.lab-btn >> text="${L.enter}"`);
    await p.keyboard.press(' ');
    await p.waitForFunction(() => window.__chao.el.dataset.mood === 'enter', null, { timeout: 2000 });
    const sEnter = await pressed();
    await p.waitForFunction(() => window.__chao.el.dataset.mood === 'idle', null, { timeout: 3000 });
    const sAfter = await pressed();
    results.push(`Space on ${L.enter} -> pressed [${sEnter.pressed}] mood ${sEnter.mood}, then [${sAfter.pressed}] ${sAfter.mood}`);
    check(init.pressed.join() === L.idle && init.mood === 'idle' && sEnter.pressed.join() === L.enter && sEnter.mood === 'enter' && sAfter.pressed.join() === L.idle && sAfter.mood === 'idle', 'Keyboard: Enter/Space operate the mood buttons; aria-pressed always marks exactly the active mood', `initial pressed [${init.pressed}] ${init.mood}; ${results.join('; ')}`);

    const tg = [];
    await p.focus(`.lab-btn >> text="${L.talk}"`);
    const t0 = await p.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
    await p.keyboard.press(' '); tg.push(await p.evaluate(() => [document.activeElement.getAttribute('aria-pressed'), window.__chao.el.dataset.talking ?? '']));
    await p.keyboard.press('Enter'); tg.push(await p.evaluate(() => [document.activeElement.getAttribute('aria-pressed'), window.__chao.el.dataset.talking ?? '']));
    check(t0 === 'false' && tg[0].join() === 'true,cycle' && tg[1].join() === 'false,', 'Keyboard: Talk toggle (Space on, Enter off) syncs aria-pressed and data-talking', `initial ${t0}; Space -> ${tg[0]}; Enter -> ${tg[1]}`);

    await p.focus(`.lab-btn >> text="${L.blink}"`);
    await p.evaluate(() => { window.__chao.el.removeAttribute('data-blink'); window.__blinks.length = 0; });
    await p.keyboard.press('Enter');
    const bk = await p.evaluate(() => ({ attr: window.__chao.el.hasAttribute('data-blink'), n: window.__blinks.length }));
    check(bk.attr && bk.n >= 1, 'Keyboard: Blink button triggers a blink', `data-blink present ${bk.attr}, mutations ${bk.n}`);

    // (the voice slider left the lab with phase 4c: no voice in the product, DESIGN §14)

    await p.focus('#chao-compact');
    const h0 = await p.evaluate(() => window.__chao.el.offsetHeight);
    await p.keyboard.press(' ');
    const h1 = await p.evaluate(() => ({ h: window.__chao.el.offsetHeight, cls: document.querySelector('.chao-lab__stage').classList.contains('chao-lab__stage--compact') }));
    check(h1.cls && near(h1.h / h0, 0.6, 0.02), 'Keyboard: Compact size checkbox (Space) shrinks the lab Chao to 0.6x', `height ${h0} -> ${h1.h} (ratio ${(h1.h / h0).toFixed(3)}), class ${h1.cls}`);
    await ctx.close();
  }

  // 4a-5. Reduced motion: no loops, no blink, fade-in only, poses still readable.
  {
    const { ctx, p } = await chaoPage({ reducedMotion: 'reduce' }, CHAO_URL, 'chao-rm');
    await p.waitForTimeout(300);
    const r = await p.evaluate(async (L) => {
      const c = window.__chao.el, o = {};
      const btn = (t) => [...document.querySelectorAll('.lab-btn')].find((b) => b.textContent === t);
      // enter = fade, in place
      const rect0 = c.getBoundingClientRect().left;
      btn(L.enter).click(); await window.__wait(30);
      const a = window.__anims(c);
      o.enter = { n: a.length, names: a.map((x) => x.name), props: [...new Set(a.flatMap((x) => x.props))], translate: getComputedStyle(c).translate, mood: c.dataset.mood };
      o.fade = []; for (const t of [0, 100, 200]) { window.__freeze(t); o.fade.push({ t, op: +getComputedStyle(c).opacity, left: c.getBoundingClientRect().left - rect0 }); }
      window.__thaw();
      await window.__wait(500);
      o.afterEnter = { mood: c.dataset.mood, n: c.getAnimations({ subtree: true }).length, running: c.getAnimations({ subtree: true }).filter((x) => x.playState === 'running').length };
      // static poses
      o.poses = {}; o.anims = {};
      const q = (s) => c.querySelector(s);
      for (const m of ['idle', 'listen', 'think', 'happy', 'sad', 'error']) {
        window.__chao.setMood(c, m); await window.__wait(50);
        o.anims[m] = c.getAnimations({ subtree: true }).length;
        const mouth = q('.chao__mouth');
        o.poses[m] = {
          tilt: parseFloat(getComputedStyle(q('.chao__pose')).rotate) || 0, poseScale: window.__sc(q('.chao__pose')), eyesScale: window.__sc(q('.chao__eyes')), eyesT: window.__tr(q('.chao__eyes')),
          wing: parseFloat(getComputedStyle(q('.chao__wing')).rotate) || 0, ballT: window.__tr(q('.chao__ball')), closedScale: window.__sc(mouth, '::before'),
          closedOp: +getComputedStyle(mouth, '::before').opacity, openOp: +getComputedStyle(mouth, '::after').opacity,
          eyesOp: +getComputedStyle(q('.chao__eyes')).opacity, happyEyesOp: +getComputedStyle(q('.chao__eyes-happy')).opacity,
        };
      }
      // talking under reduce: cycle does nothing, voice opens the mouth but does not stretch the body
      window.__chao.setMood(c, 'idle'); c.dataset.talking = 'cycle'; await window.__wait(300);
      o.cycle = { n: c.getAnimations({ subtree: true }).length, level: getComputedStyle(q('.chao__rig')).getPropertyValue('--voice-level') };
      delete c.dataset.talking; window.__chao.voiceLevel(c, 0.8);
      o.voice = { open: +getComputedStyle(q('.chao__mouth'), '::after').opacity, rig: window.__sc(q('.chao__rig')) };
      window.__chao.voiceLevel(c, null);
      return o;
    }, L);
    check(r.enter.n === 1 && r.enter.names[0] === 'chao-fade-in' && r.enter.props.join() === 'opacity' && r.enter.translate === 'none' && r.fade.every((f) => Math.abs(f.left) < 0.01) && r.fade[0].op < 0.05 && r.fade[1].op > 0.1 && r.fade[1].op <= 1 && r.fade[2].op === 1,
      'Reduced motion: playEnter is only a fade (opacity), in place, no slide', `animations during enter: ${r.enter.names} props [${r.enter.props}], translate "${r.enter.translate}"; opacity at 0/100/200 ms = ${r.fade.map((f) => f.op.toFixed(2))}; x shift ${r.fade.map((f) => f.left.toFixed(2))}`);
    check(r.afterEnter.mood === 'idle' && r.afterEnter.n === 0 && r.afterEnter.running === 0 && Object.values(r.anims).every((n) => n === 0), 'Reduced motion: zero animations after the enter fade, and none for any mood', `after enter: mood ${r.afterEnter.mood}, ${r.afterEnter.n} animations (${r.afterEnter.running} running); per mood [${Object.entries(r.anims).map(([k, v]) => `${k} ${v}`)}]`);
    const P = r.poses, f2 = (v) => v.map((x) => +x.toFixed(3));
    check(P.idle.openOp === 0 && P.idle.closedOp === 1 && P.idle.closedScale[1] === 1 &&
      P.happy.openOp === 1 && P.happy.closedOp === 0 && P.happy.eyesOp === 0 && P.happy.happyEyesOp === 1 && ['idle', 'listen', 'think', 'sad', 'error'].every((m) => P[m].eyesOp === 1 && P[m].happyEyesOp === 0) &&
      P.sad.closedScale[1] === -1 && P.sad.closedOp === 1 && P.sad.openOp === 0 && near(P.sad.poseScale[0], 1.04, 0.001) && near(P.sad.poseScale[1], 0.96, 0.001) && P.sad.wing === -12 && near(P.sad.ballT[1], 4, 0.5) &&
      P.error.openOp === 1 && P.error.closedOp === 0 && near(P.error.eyesScale[1], 1.08, 0.001) && P.error.tilt === 2.5 && near(P.error.ballT[0], 12, 0.5) && near(P.sad.tilt, -2.5, 0.01) && near(P.sad.eyesScale[1], 0.82, 0.001),
      'Reduced motion: moods stay readable via static poses (happy "^ ^" eyes + open mouth, sad frown + drooped body + wing -12, error wide eyes + small open mouth)', `happy: open-mouth opacity ${P.happy.openOp}, normal eyes opacity ${P.happy.eyesOp}, ^ ^ eyes opacity ${P.happy.happyEyesOp}; sad: closed-mouth scale ${f2(P.sad.closedScale)} (frown), body scale ${f2(P.sad.poseScale)}, wing ${P.sad.wing} deg, ball y ${P.sad.ballT[1].toFixed(1)}%, eyes scaleY ${P.sad.eyesScale[1]}; error: eyes scaleY ${P.error.eyesScale[1]}, open-mouth opacity ${P.error.openOp}, tilt ${P.error.tilt} deg (sad ${P.sad.tilt}), ball x ${P.error.ballT[0].toFixed(1)}%; idle: smile, mouth shut`);
    check(near(P.listen.tilt, 5, 0.01) && near(P.listen.eyesT[0], 4, 0.1) && near(P.listen.eyesT[1], 4, 0.1) && near(P.think.tilt, -2.5, 0.01) && near(P.think.eyesScale[1], 0.7, 0.001) && near(P.think.eyesT[0], -4, 0.1) && near(P.think.eyesT[1], -6, 0.1) && near(P.think.ballT[1], -12, 0.5),
      'Reduced motion: listen leans +5 deg and looks down-right; think -2.5 deg, half-lidded (eyes scaleY 0.7), looks up-left, ball up', `listen tilt ${P.listen.tilt}, gaze ${f2(P.listen.eyesT)}%; think tilt ${P.think.tilt}, gaze ${f2(P.think.eyesT)}%, ball y ${P.think.ballT[1].toFixed(1)}%`);
    check(r.cycle.n === 0 && parseFloat(r.cycle.level) === 0 && r.voice.open === 1 && r.voice.rig.join() === '1,1', 'Reduced motion talking: cycle is inert; real voice opens the mouth but never stretches the body (--motion-scale 0)', `cycle: ${r.cycle.n} animations, --voice-level ${r.cycle.level}; voice 0.8: open-mouth opacity ${r.voice.open}, rig scale ${r.voice.rig}`);

    // Layer geometry in the DOM at two sizes (lab, lab compact; the hero is checked on the product page in 4b) + eyes/mouth never displaced beyond the documented offsets.
    const geo = await p.evaluate(async () => {
      const DOC = { wing: [1.1976, 59.3277, 37.7246], body: [6.8862, 3.1933, 91.9162], eyes: [44.3114, 46.0504, 49.7006], mouth: [67.6647, 61.0084, 13.4731], ball: [38.4201, 0.7056, 26.5709] };
      const SEL = { wing: '.chao__wing', body: '.chao__torso', eyes: '.chao__eyes', mouth: '.chao__mouth', ball: '.chao__ball' };
      const out = [];
      const stage = document.querySelector('.chao-lab__stage');
      stage.classList.remove('chao-lab__stage--compact');
      for (const [name, c, compact] of [['lab', window.__chao.el, false], ['lab compact', window.__chao.el, true]]) {
        stage.classList.toggle('chao-lab__stage--compact', compact);
        window.__chao.setMood(c, 'idle'); await window.__wait(30);
        const cr = c.getBoundingClientRect(), worst = {};
        for (const k in DOC) {
          const r = c.querySelector(SEL[k]).getBoundingClientRect();
          const got = [(r.left - cr.left) / cr.width * 100, (r.top - cr.top) / cr.height * 100, r.width / cr.width * 100];
          worst[k] = Math.max(...got.map((g, i) => Math.abs(g - DOC[k][i])));
        }
        out.push({ name, h: cr.height, aspect: cr.width / cr.height, worst });
      }
      stage.classList.remove('chao-lab__stage--compact');
      // displacement per mood: layout box of eyes/mouth identical; computed offsets within documented bounds
      const c = window.__chao.el, boxes = {}, off = {};
      for (const m of ['idle', 'listen', 'think', 'happy', 'sad', 'error']) {
        window.__chao.setMood(c, m); await window.__wait(20);
        const e = c.querySelector('.chao__eyes'), mo = c.querySelector('.chao__mouth');
        boxes[m] = [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight, mo.offsetLeft, mo.offsetTop, mo.offsetWidth, mo.offsetHeight].join();
        off[m] = { eyesT: window.__tr(e), eyesRot: getComputedStyle(e).rotate, mouthT: getComputedStyle(mo).translate, mouthRot: getComputedStyle(mo).rotate, mouthScale: getComputedStyle(mo).scale };
      }
      return { out, boxes, off };
    });
    check(geo.out.every((g) => Object.values(g.worst).every((w) => w < 0.06) && Math.abs(g.aspect - 334 / 595) < 0.002), 'Layer placement: every layer sits at its documented % of the 334x595 frame (hero, lab, compact)',
      geo.out.map((g) => `${g.name} (${g.h.toFixed(0)} px tall): worst deviation ${Math.max(...Object.values(g.worst)).toFixed(3)} % of frame, aspect ${g.aspect.toFixed(4)} (want ${(334 / 595).toFixed(4)})`).join(' | '));
    const boxSet = new Set(Object.values(geo.boxes));
    const bound = Object.values(geo.off).every((o) => Math.abs(o.eyesT[0]) <= 6.01 && Math.abs(o.eyesT[1]) <= 6.01 && o.eyesRot === 'none' && o.mouthT === 'none' && o.mouthRot === 'none' && o.mouthScale === 'none');
    check(boxSet.size === 1 && bound, 'Static poses: eyes/mouth layout boxes never move; eyes shift <= 6 % (gaze x1.5), mouth has no translate/rotate/scale on its box', `layout boxes identical across 6 moods: ${boxSet.size === 1}; eyes translate per mood ${Object.entries(geo.off).map(([m, o]) => `${m} ${o.eyesT.map((v) => v.toFixed(1))}`).join(', ')}`);
    await ctx.close();

    // Blink never fires under reduced motion (scheduler on, no ?noblink)
    const rb = await chaoPage({ reducedMotion: 'reduce' }, `${BASE}/?t=9500`, 'chao-rm-blink');
    await rb.p.waitForTimeout(2600);
    const nb = await rb.p.evaluate(() => ({ blinks: window.__blinks.length, anims: document.querySelector('.narrator .chao').getAnimations({ subtree: true }).length }));
    check(nb.blinks === 0 && nb.anims === 0, 'Reduced motion: the blink scheduler never fires', `data-blink set ${nb.blinks} times in 2.6 s (first tick at 1.8 s), animations ${nb.anims}`);
    await rb.ctx.close();
    // ...and does fire with motion (so the check above can fail)
    const mb = await chaoPage({}, `${BASE}/?t=9500`, 'chao-blink-on');
    await mb.p.waitForTimeout(2600);
    const nb2 = await mb.p.evaluate(() => window.__blinks.length);
    check(nb2 >= 1, 'Blink scheduler fires with motion on (control for the reduced-motion check; product page)', `data-blink set ${nb2} times in 2.6 s (first tick at 1.8 s)`);
    await mb.ctx.close();
  }

  // 4a-6. Layer composite == chao.webp (mean abs diff per channel). Layers are 0.6x of the 557x992 original: compared at the shipped 334x595.
  // The emotion ball is a drawn SVG (not cut from the render): its box is masked out of the pixel diff and compared apart.
  {
    const { ctx, p } = await chaoPage({}, CHAO_URL, 'chao-composite');
    const r = await p.evaluate(async () => {
      const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
      const ref = await load('/character/chao.webp');
      const L = {}; for (const k of ['wing', 'body', 'eyes', 'mouth']) L[k] = await load(`/character/chao-${k}.webp`);
      const ballImg = await load('/character/chao-ball.svg');
      const W = 334, H = 595, k = 1; // the shipped frame: layers at their natural size, the 557x992 original scaled down to it
      const POS = { wing: [1.1976, 59.3277], body: [6.8862, 3.1933], eyes: [44.3114, 46.0504], mouth: [67.6647, 61.0084] };
      const BALL = { x: 38.4201 / 100 * W, y: 0.7056 / 100 * H, w: 26.5709 / 100 * W }; BALL.h = BALL.w * 150 / 148;
      const mk = (bg, draw) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); } draw(x); return x.getImageData(0, 0, W, H).data; };
      const res = {};
      for (const bg of ['#000000', '#ffffff', '#808080', null]) {
        const a = mk(bg, (x) => x.drawImage(ref, 0, 0, W, H));
        const b = mk(bg, (x) => { for (const n of ['wing', 'body', 'eyes', 'mouth']) x.drawImage(L[n], POS[n][0] / 100 * W, POS[n][1] / 100 * H, L[n].naturalWidth * k, L[n].naturalHeight * k); x.drawImage(ballImg, BALL.x, BALL.y, BALL.w, BALL.h); });
        let s = 0, n = 0, big = 0, ch = bg ? 3 : 4, minx = W, maxx = -1, miny = H, maxy = -1, bs = 0, bn = 0;
        for (let i = 0; i < a.length; i += 4) {
          const px = (i / 4) % W, py = Math.floor(i / 4 / W), inBall = px >= BALL.x - 2 && px <= BALL.x + BALL.w + 2 && py >= BALL.y - 2 && py <= BALL.y + BALL.h + 2;
          let m = 0;
          for (let c2 = 0; c2 < ch; c2++) {
            const d = Math.abs(a[i + c2] - b[i + c2]);
            if (inBall) { bs += d; bn++; continue; }
            s += d; n++; if (d > m) m = d;
          }
          if (m > 40) { big++; minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py); }
        }
        res[bg ?? 'transparent'] = { mad: s / n, big, bbox: big ? [minx, miny, maxx, maxy] : null, ball: bs / bn };
      }
      return res;
    });
    // "pixels off by > 40" is judged over opaque backgrounds (what the page shows); on a transparent canvas the alpha of overlapping soft edges unions (a + b(1-a)) by construction, so there it is only reported.
    const worst = Math.max(...Object.values(r).map((v) => v.mad)), bigMax = Math.max(...['#000000', '#ffffff', '#808080'].map((k) => r[k].big));
    check(worst < 1.5 && bigMax < 60, 'Layer composite at 334x595 (ball box excluded) vs chao.webp scaled to 334x595: mean abs diff per channel < 1.5/255 on all backgrounds, no seams (< 60 pixels off by > 40 over opaque backgrounds)', Object.entries(r).map(([bg, v]) => `${bg}: ${v.mad.toFixed(3)}/255, ${v.big} px > 40${v.bbox ? ' in bbox ' + v.bbox : ''}`).join(' | '));
    info('SVG ball vs the ball in the original render (inside the ball box; drawn, not cut: expected to differ a little)', Object.entries(r).map(([bg, v]) => `${bg}: ${v.ball.toFixed(2)}/255`).join(' | '));
    await ctx.close();
  }


  // 4a-7. Production bundle: dev hooks stripped, assets shipped, Chao works, blink runs.
  {
    const { ctx, p } = await chaoPage({}, PROD, 'chao-prod');
    await p.waitForTimeout(2600);
    const r = await p.evaluate(() => ({
      hook: typeof window.__chao, blinks: window.__blinks.length, labs: document.querySelectorAll('.chao').length,
      imgs: [...document.querySelectorAll('.chao img')].every((i) => i.complete && i.naturalWidth > 0), mood: document.querySelector('.narrator .chao').dataset.mood,
      sw: document.documentElement.scrollWidth <= innerWidth,
    }));
    check(r.hook === 'undefined' && r.labs === 1 && r.imgs && r.blinks >= 1 && r.sw, 'Production bundle: no window.__chao, the narrator Chao renders, all layers load, blink scheduler runs', `typeof __chao=${r.hook}, chaos ${r.labs}, images loaded ${r.imgs}, blinks in 2.6 s ${r.blinks}, mood ${r.mood}`);
    const q = await ctx.newPage(); watch(q, 'chao-prod-query');
    await q.goto(`${PROD}/?mood=sad`, { waitUntil: 'networkidle' });
    await q.waitForFunction(() => document.querySelector('.narrator .chao')?.dataset.mood === 'idle', null, { timeout: 8000 });
    const moodQ = await q.evaluate(() => [...document.querySelectorAll('.chao')].map((c) => c.dataset.mood));
    check(moodQ.every((m) => m === 'idle'), 'Production bundle ignores ?mood=', `moods with ?mood=sad: [${moodQ}]`);
    await ctx.close();
    const FILES = ['chao.webp', 'chao-body.webp', 'chao-wing.webp', 'chao-eyes.webp', 'chao-mouth.webp', 'chao-ball.svg', 'chao-ball-think.svg', 'chao-ball-happy.svg', 'chao-ball-sad.svg', 'chao-ball-error.svg'];
    const have = await Promise.all(FILES.map((n) => stat(`dist/character/${n}`).then((s) => `${n} ${(s.size / 1024).toFixed(1)}KB`, () => `${n} MISSING`)));
    check(!have.some((h) => h.includes('MISSING')), 'dist ships the 3 webp layers + mouth + 5 ball SVGs (+ chao.webp)', have.join(', '));
    const stale = await Promise.all(['public', 'dist'].map((d) => stat(`${d}/character/chao-ball.webp`).then(() => `${d}/character/chao-ball.webp EXISTS`, () => null)));
    check(!stale.some(Boolean), 'chao-ball.webp (replaced by the SVGs) is deleted from public/ and dist/', stale.filter(Boolean).join(', ') || 'absent in both');
    const html = await readFile('index.html', 'utf8');
    const pre = [...html.matchAll(/<link rel="preload" as="image" href="([^"]+)" fetchpriority="high"/g)].map((m) => m[1]);
    check(['chao-body.webp', 'chao-eyes.webp', 'chao-wing.webp', 'chao-ball.svg'].every((n) => pre.includes(`/character/${n}`)) && pre.length === 4, 'index.html preloads body, eyes, wing, ball.svg (fetchpriority high)', `preloads: ${pre.join(', ')}`);
  }

  // 1 + 6f. Security hygiene and production bundle. Secret VALUES are read at run time from process.env / .env.local,
  // compared, and NEVER printed or stored in this file: only variable names and file paths are reported.
  {
    const walk = async (dir) => (await readdir(dir, { recursive: true }).catch(() => [])).map((f) => `${dir}/${f.replaceAll('\\', '/')}`);
    const read = async (files) => Promise.all(files.map(async (f) => [f, await readFile(f, 'latin1').catch(() => '')]));
    const distFiles = (await walk('dist')).filter((f) => /\.[a-z0-9]+$/i.test(f));
    const srcFiles = [...(await walk('src')), ...(await walk('public')), ...(await walk('scripts')), 'index.html'].filter((f) => /\.(ts|js|mjs|css|html|json|svg|txt|md)$/i.test(f));
    if (!distFiles.length) errors.push('[dist] missing: run `npm run build` first');
    const [dist, src] = await Promise.all([read(distFiles), read(srcFiles)]);

    // Stale dist: any source newer than the built index.html fails.
    const mt = async (f) => (await stat(f).catch(() => null))?.mtimeMs ?? 0;
    const srcAll = [...(await walk('src')), ...(await walk('public')), 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json'];
    const newest = (await Promise.all(srcAll.map(async (f) => [f, await mt(f)]))).sort((a, b) => b[1] - a[1])[0];
    const built = await mt('dist/index.html');
    check(built > 0 && built >= newest[1], 'dist is fresh (built after the newest source file)', `newest source ${newest[0]} @ ${new Date(newest[1]).toISOString()}, dist/index.html @ ${built ? new Date(built).toISOString() : 'missing'}`);

    for (const [label, re] of [['__holoSeek', /__holoSeek/], ['dev query hooks (?t= ?mock= ?lab)', /\.(?:get|has)\("(?:t|mock|lab)"\)/], ['__chao', /__chao/], ['noblink', /noblink/], ['?mood= hook', /[?&]mood=|\.get\(["']mood["']\)/], ['mock fixtures (mock / MOCKS / mock phrase / [api] warn)', /mock|MOCKS|single-player metroidvania|\[api\]/]]) {
      const hits = dist.filter(([, t]) => re.test(t)).map(([f]) => f);
      check(distFiles.length > 0 && !hits.length, `dist grep ${label}`, hits.length ? `FOUND in ${hits}` : `absent in ${distFiles.length} files`);
    }

    // Generic key shapes + variable names in the bundle; generic shapes also in the sources.
    const shape = /AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}/;
    const names = /GEMINI_API_KEY|RAWG_API_KEY|GEMINI|RAWG_API/;
    const dHits = dist.filter(([, t]) => shape.test(t) || names.test(t)).map(([f]) => f);
    check(distFiles.length > 0 && !dHits.length, 'dist: no key-shaped strings or key variable names', dHits.length ? `FOUND in ${dHits}` : `none in ${distFiles.length} files`);
    const sHits = src.filter(([, t]) => shape.test(t)).map(([f]) => f);
    check(!sHits.length, 'src/public/scripts: no key-shaped strings', sHits.length ? `FOUND in ${sHits}` : `none in ${src.length} files`);

    // The real values, from the environment.
    const envText = await readFile('.env.local', 'utf8').catch(() => '');
    const secrets = [];
    for (const n of ['GEMINI_API_KEY', 'RAWG_API_KEY']) {
      const v = (process.env[n] || envText.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '');
      if (v.length >= 8) secrets.push([n, v]);
    }
    if (secrets.length < 2) lines.push(`key values: only ${secrets.length}/2 found in env/.env.local, value check is partial (info)`);
    const leaks = [];
    for (const [n, v] of secrets) for (const [f, t] of [...dist, ...src]) if (t.includes(v)) leaks.push(`${n} in ${f}`);
    check(!leaks.length && secrets.length > 0, 'full key values absent from dist/src/public/scripts', leaks.length ? `LEAK: ${leaks.join('; ')}` : `${secrets.map(([n]) => n).join(', ')} not found in ${dist.length + src.length} files`);
    // docs/ is outside the shipped bundle; report only (names, never values).
    const docs = await read((await walk('docs')).filter((f) => /\.(md|txt)$/i.test(f)));
    const docLeaks = docs.filter(([, t]) => secrets.some(([, v]) => t.includes(v))).map(([f]) => f);
    info('docs/ containing a key value (not shipped; gitignored files only?)', docLeaks.length ? docLeaks.join(', ') : 'none');
  }

  // 7. Frame time via rAF over 3 s on the live loop. rAF stays at 60 fps (the canvas draws at 30).
  // 'bg' = background only (informational unless VERIFY_STRICT_TIMING=1: SwiftShader is CPU rendering and can flake).
  // 'chao-hero' / 'chao-lab' = the worst Chao case (think + talk cycle + blink scheduler) over the live background: FAILS if the mean > 20 ms (phase 4a).
  for (const [viewport, dpr] of [[VIEWPORTS[1], 1], [VIEWPORTS[0], 3]]) {
    for (const colorScheme of SCHEMES) for (const variant of ['bg', 'chao-hero', 'chao-lab']) {
      const tag = `${viewport.width}@${dpr}x-${colorScheme}-${variant}`;
      const { ctx, p } = await open({ viewport, colorScheme, deviceScaleFactor: dpr }, { url: variant === 'chao-lab' ? `${BASE}/?lab` : BASE, tag: `frames-${tag}`, init: [PAGE_HELPERS, () => { window.__w = (ms) => new Promise((r) => setTimeout(r, ms)); }] });
      await p.waitForTimeout(1000); // let shader compile / image decode settle
      if (variant !== 'bg') {
        await p.evaluate(async (variant) => {
          const c = variant === 'chao-hero' ? document.querySelector('.narrator .chao') : window.__chao.el;
          if (variant === 'chao-lab') { window.__chao.setMood(c, 'think'); c.scrollIntoView({ block: 'center' }); } else c.dataset.mood = 'think';
          c.dataset.talking = 'cycle';
          await window.__w(600);
        }, variant);
      }
      // SwiftShader on a shared dev machine has transient multi-frame stalls: a Chao variant gets up to 3 samples and passes
      // when ANY has mean <= 20 ms (a real regression is slow in every sample). All attempts are printed.
      const sample = () => p.evaluate(
        () =>
          new Promise((res) => {
            const t = [];
            const end = performance.now() + 3000;
            const tick = (now) => (t.push(now), now < end ? requestAnimationFrame(tick) : res(t.slice(1).map((v, i) => v - t[i])));
            requestAnimationFrame(tick);
          }),
      );
      const strict = variant !== 'bg' || process.env.VERIFY_STRICT_TIMING === '1';
      const attempts = [];
      for (let k = 0; k < (strict ? 3 : 1); k++) {
        const d = await sample();
        const over33 = d.filter((v) => v > 33.5).length;
        d.sort((x, y) => x - y);
        attempts.push({ n: d.length, mean: d.reduce((x, y) => x + y, 0) / d.length, p95: d[Math.floor(d.length * 0.95)], max: d.at(-1), over33 });
        if (attempts.at(-1).mean <= 20) break;
      }
      const best = attempts.reduce((x, y) => (y.mean < x.mean ? y : x));
      if (strict && best.mean > 20) errors.push(`[frames ${tag}] mean frame time ${best.mean.toFixed(1)} ms > 20 ms in all ${attempts.length} samples`);
      lines.push(`frame time ${tag}: ${attempts.map((x) => `n=${x.n} mean ${x.mean.toFixed(1)} ms, p95 ${x.p95.toFixed(1)}, max ${x.max.toFixed(1)}, >33 ms: ${x.over33}`).join(' || ')} (${strict ? 'checked: some sample mean <= 20' : 'info'}; ${best.mean <= 20 ? 'under' : 'OVER'} 20 ms)`);
      await ctx.close();
    }
  }

  // First-paint shots (reduced motion = the deterministic 9500 ms frame) and Chao on cyan frames.
  for (const [viewport, dpr] of [[VIEWPORTS[1], 1], [VIEWPORTS[0], 3]]) {
    for (const colorScheme of SCHEMES) {
      const { ctx, p } = await open({ viewport, colorScheme, deviceScaleFactor: dpr, reducedMotion: 'reduce' }, { tag: `first-paint-shot-${viewport.width}-${colorScheme}` });
      await p.screenshot({ path: `${OUT}/first-paint-${viewport.width}-${colorScheme}.png` });
      await ctx.close();
    }
  }
  for (const [colorScheme, t] of [['light', 6500], ['dark', 8000]]) {
    const { ctx, p } = await open({ viewport: VIEWPORTS[1], colorScheme, deviceScaleFactor: 2 }, { url: `${BASE}/?t=${t}`, tag: `chao-${colorScheme}` });
    await p.waitForFunction(() => document.querySelector('#app')?.dataset.state === 'intro' && document.querySelector('.narrator .chao')?.dataset.mood === 'idle' && !document.querySelector('form.feeling').hasAttribute('data-hidden'), null, { timeout: 15000 });
    await p.evaluate(() => document.getAnimations().forEach((a) => (a.pause(), (a.currentTime = 0))));
    await p.evaluate((ms) => window.__holoSeek(ms), t);
    await p.waitForTimeout(80);
    const box = await p.locator('.narrator').boundingBox();
    await p.screenshot({ path: `${OUT}/chao-${colorScheme}-${t}.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 20), width: Math.min(900, box.width + 80), height: box.height + 60 } });
    await ctx.close();
  }
  lines.push(`shots ${OUT}/first-paint-{390,1440}-{light,dark}.png, ${OUT}/chao-light-6500.png, ${OUT}/chao-dark-8000.png`);

  // Frozen frames: seek the shader (and pin the title bounce) at 8 phases; shots + canvas sanity stats (blank / black pixels).
  const PHASES = [0, 2000, 3000, 6500, 8000, 9500, 12000, 14950];
  for (const [viewport, dpr] of [[VIEWPORTS[1], 1], [VIEWPORTS[0], 3]]) {
    for (const colorScheme of SCHEMES) {
      const tag = `${viewport.width}-${colorScheme}`;
      const { ctx, p } = await open({ viewport, colorScheme, deviceScaleFactor: dpr }, { url: `${BASE}/?t=0`, tag: `holo-shots-${tag}` });
      const stats = [];
      for (const t of PHASES) {
        await p.evaluate(() => document.getAnimations().forEach((a) => (a.pause(), (a.currentTime = 0))));
        const st = await p.evaluate((ms) => { const g = window.__grab(ms); return { sd: window.__lumaSd(g), black: window.__black(g) }; }, t); // canvas-only stats (also seeks)
        await p.evaluate((ms) => window.__holoSeek(ms), t); // re-seek so the buffer is fresh for the screenshot
        await p.waitForTimeout(80);
        await p.screenshot({ path: `${OUT}/holo-${tag}-${t}.png` });
        await p.locator('footer').screenshot({ path: `${OUT}/holo-footer-${tag}-${t}.png` });
        await p.evaluate(() => window.scrollTo(0, 0));
        stats.push(st.sd);
        if (!(st.sd > 3)) errors.push(`[holo ${tag} t=${t}] canvas looks blank/flat (luma sd ${st.sd.toFixed(1)})`);
        if (st.black > 0) errors.push(`[holo ${tag} t=${t}] ${(st.black * 100).toFixed(2)}% pure-black canvas pixels`);
      }
      lines.push(`frozen frames ${tag}: canvas luma sd per phase ${stats.map((v) => v.toFixed(0)).join('/')} (want > 3 each; 0 black pixels)`);
      await ctx.close();
    }
  }
  lines.push(`shots ${OUT}/holo-{390,1440}-{light,dark}-{${PHASES.join(',')}}.png and holo-footer-*`);

  // Chao contact sheets (frozen instants, both themes, 1440@2 and 390@3), reduced-motion static poses, and narrator normal vs compact.
  {
    const SHEET = [['enter', 560], ['idle', 800], ['listen', 1600], ['think', 375], ['happy', 377], ['sad', 1500], ['error', 1500], ['blink', 75], ['talk', 90]];
    const cell = async (p, name, t, rm) => {
      await p.evaluate(async ([name, t, rm]) => {
        const c = window.__chao.el;
        window.__reset(c);
        const mood = name === 'blink' || name === 'talk' ? 'idle' : name;
        window.__chao.setMood(c, mood === 'idle' ? 'error' : 'idle'); await window.__wait(30);
        window.__chao.setMood(c, mood);
        if (!rm) await window.__wait(mood === 'enter' ? 30 : 450);
        if (name === 'blink') { void c.offsetWidth; c.setAttribute('data-blink', ''); }
        if (name === 'talk') c.dataset.talking = 'cycle';
        if (!rm) window.__freeze(t);
        else if (name === 'talk') window.__chao.voiceLevel(c, 0.9);
      }, [name, t, rm]);
      const loc = p.locator('.chao-lab__stage .chao');
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      const pad = 36;
      return (await p.screenshot({ clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad } })).toString('base64');
    };
    const sheet = async (ctx, cells, file, bg) => {
      const sp = await ctx.newPage();
      await sp.setContent(`<body style="margin:0;background:${bg};font:14px sans-serif;color:#888"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px">${cells.map(([n, b]) => `<figure style="margin:0"><img src="data:image/png;base64,${b}" style="display:block;height:300px"><figcaption>${n}</figcaption></figure>`).join('')}</div></body>`);
      await sp.screenshot({ path: file, fullPage: true });
      await sp.close();
    };
    for (const [viewport, dpr] of [[VIEWPORTS[1], 2], [VIEWPORTS[0], 3]]) {
      for (const colorScheme of SCHEMES) {
        const tag = `${viewport.width}-${colorScheme}`;
        const { ctx, p } = await chaoPage({ viewport, colorScheme, deviceScaleFactor: dpr }, CHAO_URL, `chao-sheet-${tag}`);
        const cells = [];
        for (const [name, t] of SHEET) cells.push([`${name}${['blink', 'talk'].includes(name) ? '' : ''} @${t} ms`, await cell(p, name, t, false)]);
        await sheet(ctx, cells, `${OUT}/chao-sheet-${tag}.png`, colorScheme === 'dark' ? '#10142a' : '#e8f4ff');
        // Per-motion strips at the designer's instants (DESIGN 13.11); t starts at 16 ms (t = 0 can show two ball shapes mid-transition)
        const GROUPS = { enter: [200, 280, 400, 560, 760, 870, 1000], happy: [60, 130, 210, 380, 590, 640, 820], think: [16, 550, 1100, 1650], sad: [16, 300, 700, 1500], error: [100, 225, 350, 600, 1500], blink: [16, 40, 75, 110, 150], talk: [16, 90, 180, 290, 380, 500, 600, 700] };
        for (const [g, ts] of Object.entries(GROUPS)) {
          const gc = [];
          for (const t of ts) gc.push([`${g} @${t} ms`, await cell(p, g, t, false)]);
          await sheet(ctx, gc, `${OUT}/chao-moves-${g}-${tag}.png`, colorScheme === 'dark' ? '#10142a' : '#e8f4ff');
        }
        await ctx.close();
      }
    }
    for (const [viewport, dpr, colorScheme] of [[VIEWPORTS[1], 2, 'light'], [VIEWPORTS[0], 3, 'dark']]) {
      const tag = `${viewport.width}-${colorScheme}`;
      const { ctx, p } = await chaoPage({ viewport, colorScheme, deviceScaleFactor: dpr, reducedMotion: 'reduce' }, CHAO_URL, `chao-rmsheet-${tag}`);
      const cells = [];
      for (const name of ['idle', 'listen', 'think', 'happy', 'sad', 'error']) cells.push([`${name} (static, reduced motion)`, await cell(p, name, 0, true)]);
      cells.push(['talk voice 0.9 (reduced motion)', await cell(p, 'talk', 0, true)]);
      await sheet(ctx, cells, `${OUT}/chao-rmsheet-${tag}.png`, colorScheme === 'dark' ? '#10142a' : '#e8f4ff');
      await ctx.close();
    }
    for (const viewport of VIEWPORTS) for (const colorScheme of SCHEMES) {
      const tag = `${viewport.width}-${colorScheme}`;
      const { ctx, p } = await chaoPage({ viewport, colorScheme, deviceScaleFactor: 2 }, CHAO_URL, `chao-lab-page-${tag}`);
      const sec = p.locator('section', { has: p.locator('.chao-lab__stage') });
      await sec.scrollIntoViewIfNeeded();
      await sec.screenshot({ path: `${OUT}/chao-lab-${tag}.png` });
      await ctx.close();
    }
    lines.push(`shots ${OUT}/chao-moves-{enter,happy,think,sad,error,blink,talk}-{390,1440}-{light,dark}.png, ${OUT}/chao-sheet-{390,1440}-{light,dark}.png, ${OUT}/chao-rmsheet-{1440-light,390-dark}.png, ${OUT}/chao-lab-{390,1440}-{light,dark}.png, ${OUT}/chao-focus-lab-1440-light.png`);
  }

  // ===== Phase 4b: single screen + narrator state machine (DESIGN §14.10) =====
  await runScreen({ browser, BASE, PROD, OUT, VIEWPORTS, SCHEMES, errors, lines, watch, check, info, content });

  // ===== Polish: the Chao types its bubble with blips (DESIGN §17) =====
  await runTyping({ browser, BASE, OUT, errors, lines, watch, check, info, content });

  // ===== Phase 5: games row of PS2 cases (DESIGN §15.10) =====
  await runResults({ browser, BASE, OUT, errors, lines, check, info, content });
  prodServer.close();
} catch (e) {
  errors.push(`CRASH: ${String(e.message).slice(0, 300)}`); // keep every line gathered so far: a crash after 30 minutes must not lose the report
} finally {
  await browser.close();
}

console.log(lines.join('\n'));
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nverify: OK, 0 errors');
