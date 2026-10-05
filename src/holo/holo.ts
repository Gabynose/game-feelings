import { FRAG } from './shader';

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const STILL_MS = 9500;     // first frame AND the reduced-motion still: smooth folds, no pinstripe ridges
const SCALE = 0.5;         // render at 0.5 CSS px: the image is soft, the browser upscales it
const MAX_PX = 900_000;    // pixel cap for huge screens
const FRAME_MS = 30;       // ~30 fps: the motion is slow, half the GPU work and battery
const TOKENS = ['holo-pearl', 'holo-pink', 'holo-lilac', 'holo-cyan', 'holo-shade', 'holo-ridge'];

/** Starts the background on `canvas` (initially `hidden`). Any failure leaves it hidden: the CSS fallback on `.holo` shows. */
export function startHolo(canvas: HTMLCanvasElement): void {
  if (!CSS.supports('color', 'light-dark(red, blue)')) return; // no light-dark(): tokens would not resolve
  // failIfMajorPerformanceCaveat is deliberately OFF: it would refuse SwiftShader (our tests) and software GL; the loop is cheap.
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) return;
  const dev = import.meta.env.DEV;
  const root = document.documentElement;
  const bail = (why: string) => { if (dev) console.warn('[holo]', why); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  if (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision === 0) return bail('no highp');

  const PERIOD = (parseFloat(getComputedStyle(root).getPropertyValue('--dur-holo')) || 15) * 1000; // token is in seconds
  const probe = canvas.parentElement!.appendChild(document.createElement('i'));
  probe.hidden = true; // display:none still resolves `color`, inheriting color-scheme
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)'); // .holo is display:none there
  let ms = STILL_MS, last = 0, drawn = 0, raf = 0, lost = false, u: Record<string, WebGLUniformLocation | null> = {};

  // getPropertyValue('--x') returns the text "light-dark(...)", not a color: resolve through `color`.
  const rgb = (t: string): number[] => {
    probe.style.color = `var(--${t})`;
    const c = getComputedStyle(probe).color, n = (c.match(/[\d.]+/g) ?? []).map(Number);
    return n.slice(0, 3).map((v) => (c.startsWith('color(') ? v : v / 255));
  };
  const paint = () => {
    gl.uniform1f(u.t, ((ms % PERIOD) / PERIOD) * 2 * Math.PI);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const colors = () => { gl.uniform3fv(u.c, TOKENS.flatMap(rgb)); paint(); };
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return; // display:none
    const k = Math.min(SCALE, Math.sqrt(MAX_PX / (w * h)));
    canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.res, canvas.width, canvas.height); paint();
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    ms += Math.min(now - last, 100); last = now;
    if (now - drawn >= FRAME_MS) { drawn = now; paint(); }
  };
  const sync = () => { // one place decides: loop or no loop
    cancelAnimationFrame(raf); raf = 0;
    if (lost) return;
    paint();
    if (!still.matches && !forced.matches && !document.hidden && !root.hasAttribute('data-holo-paused')) {
      last = drawn = performance.now(); raf = requestAnimationFrame(frame);
    }
  };
  const show = (on: boolean) => { // the CSS fades `.holo__canvas--on` in, hiding the pop from the fallback
    canvas.hidden = !on; void canvas.offsetWidth; canvas.classList.toggle('holo__canvas--on', on);
  };
  const build = (): boolean => {
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (dev && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[holo]', gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!, shaders = [mk(gl.VERTEX_SHADER, VERT), mk(gl.FRAGMENT_SHADER, FRAG)];
    shaders.forEach((s) => gl.attachShader(p, s));
    gl.bindAttribLocation(p, 0, 'a'); // before link: the attribute must live at 0
    gl.linkProgram(p);
    shaders.forEach((s) => gl.deleteShader(s));
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return false; }
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    u = { t: gl.getUniformLocation(p, 'uT'), res: gl.getUniformLocation(p, 'uRes'), c: gl.getUniformLocation(p, 'uC') };
    canvas.hidden = false; size(); colors(); show(true);
    return true;
  };

  if (!build()) return bail('compile/link failed');
  sync();
  new ResizeObserver(size).observe(canvas); // real size changes and display toggles; not every mobile URL-bar event
  document.addEventListener('visibilitychange', sync);
  still.addEventListener('change', sync);
  forced.addEventListener('change', sync);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', colors);
  // data-theme: re-read colors; data-holo-paused (set by the detail panel, DESIGN.md §12.12): start/stop the loop
  new MutationObserver(() => { colors(); sync(); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-holo-paused'] });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; show(false); sync(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = !build(); if (lost) show(false); sync(); });

  if (dev) { // deterministic frames for tests: ?t=<ms> freezes the loop; __holoSeek(ms) jumps
    const q = new URLSearchParams(location.search).get('t');
    const seek = (t: number) => { cancelAnimationFrame(raf); ms = t; paint(); gl.finish(); };
    (window as unknown as { __holoSeek: (t: number) => void }).__holoSeek = seek;
    if (q !== null) seek(Number(q) || 0);
  }
}
