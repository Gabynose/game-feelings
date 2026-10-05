// Worst-frame contrast of the WebGL background. Needs the DEV server (window.__holoSeek).
// Usage: VERIFY_URL=http://localhost:5173 node scripts/holo-contrast.mjs   (N=45 phases, BLK=12 px blocks)
// Token colors are read from the page, so it follows tokens.css by itself. Exit code 1 if any pair fails.
import { chromium } from 'playwright-core';

const BASE = process.env.VERIFY_URL || 'http://localhost:5173';
const N = +(process.env.N || 45), BLK = +(process.env.BLK || 12);
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (bg, [rgb, a]) => bg.map((c, i) => c * (1 - a) + rgb[i] * a);

const browser = await chromium.launch({ channel: 'chrome', args: ARGS }).catch(() =>
  chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ARGS }));
const decoder = await browser.newPage();
// Worst (darkest and brightest) BLK x BLK block mean over the whole screen and over the bottom 60 px.
const blocks = (b64) => decoder.evaluate(async ([b64, BLK]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const W = c.width, H = c.height, d = x.getImageData(0, 0, W, H).data;
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  const scan = (y0) => {
    let min = 9, max = -1, minC = [], maxC = [];
    for (let by = y0; by + BLK <= H; by += BLK) for (let bx = 0; bx + BLK <= W; bx += BLK) {
      let r = 0, g = 0, bl = 0;
      for (let y = 0; y < BLK; y++) for (let xx = 0; xx < BLK; xx++) { const i = ((by + y) * W + bx + xx) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; }
      const m = [r / BLK / BLK, g / BLK / BLK, bl / BLK / BLK], l = L(...m);
      if (l < min) { min = l; minC = m; } if (l > max) { max = l; maxC = m; }
    }
    return { min, max, minC, maxC };
  };
  return { all: scan(0), strip: scan(H - 60) };
}, [b64, BLK]);

const rows = []; let failed = false;
for (const [vpName, vp] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '#app { visibility: hidden !important; }' }); // background only
    // Token colors, resolved by the browser (light-dark() included): [r, g, b, a]
    const tok = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement('i'));
      const get = (t) => { probe.style.color = `var(--${t})`; const c = getComputedStyle(probe).color; const n = (c.match(/[\d.]+/g) || []).map(Number); const k = c.startsWith('color(') ? 255 : 1; return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1]; };
      return Object.fromEntries(['color-text', 'color-text-muted', 'color-accent', 'color-border', 'color-focus', 'plastic-fill', 'plastic-fill-hover', 'plastic-tint', 'color-bg'].map((t) => [t, get(t)]));
    });
    let worst = { all: { l: scheme === 'light' ? 9 : -1 }, strip: { l: scheme === 'light' ? 9 : -1 } };
    for (let k = 0; k < N; k++) {
      await page.evaluate((t) => window.__holoSeek(t), (k * 15000) / N);
      await page.waitForTimeout(40);
      const s = await blocks((await page.screenshot()).toString('base64'));
      for (const key of ['all', 'strip']) {
        const c = scheme === 'light' ? s[key].minC : s[key].maxC;
        if (scheme === 'light' ? lum(c) < worst[key].l : lum(c) > worst[key].l) worst[key] = { l: lum(c), c };
      }
    }
    const bg = worst.all.c, strip = worst.strip.c;
    const rgb = (t) => tok[t].slice(0, 3);
    const plastic = (fill) => [[tok[fill].slice(0, 3), tok[fill][3]], [tok['plastic-tint'].slice(0, 3), tok['plastic-tint'][3]]].reduce(over, bg);
    const checks = [
      ['text / bg', rgb('color-text'), bg, 4.5], ['muted / bg', rgb('color-text-muted'), bg, 4.5], ['accent / bg', rgb('color-accent'), bg, 4.5],
      ['text / plastic', rgb('color-text'), plastic('plastic-fill'), 4.5], ['muted / plastic', rgb('color-text-muted'), plastic('plastic-fill'), 4.5], ['accent / plastic', rgb('color-accent'), plastic('plastic-fill'), 4.5],
      ['text / plastic hover', rgb('color-text'), plastic('plastic-fill-hover'), 4.5], ['muted / plastic hover', rgb('color-text-muted'), plastic('plastic-fill-hover'), 4.5], ['accent / plastic hover', rgb('color-accent'), plastic('plastic-fill-hover'), 4.5],
      ['border / bg (UI)', rgb('color-border'), bg, 3], ['focus / bg (UI)', rgb('color-focus'), bg, 3], ['footer muted / bottom strip (no halo)', rgb('color-text-muted'), strip, 4.5],
    ];
    for (const [name, fg, back, min] of checks) {
      const r = ratio(fg, back); if (r < min) failed = true;
      rows.push({ viewport: vpName, scheme, pair: name, ratio: r.toFixed(2), min, pass: r >= min });
    }
    await page.close();
  }
}
console.table(rows);
console.log(failed ? 'FAIL: at least one pair is below its minimum' : 'PASS: all pairs meet their minimum');
await browser.close();
process.exit(failed ? 1 : 0);
