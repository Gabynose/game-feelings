// Reading design tokens from JS (one helper for chao.ts and screen.ts). Custom properties inherit,
// so pass the element whose value matters (e.g. the Chao for --chao-* overridden on it).
const rootEl = () => document.documentElement;

/** Raw token text, trimmed ('' if unset). */
export const token = (name: string, el: Element = rootEl()): string => getComputedStyle(el).getPropertyValue(name).trim();

/** A time token ('260ms' or '1.5s') in ms; `fallback` if unset or not a number. */
export function time(name: string, fallback: number, el: Element = rootEl()): number {
  const v = token(name, el);
  const n = parseFloat(v);
  if (Number.isNaN(n)) return fallback;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}

/** A length token in px ('6px'). */
export const px = (name: string, fallback: number, el: Element = rootEl()): number => parseFloat(token(name, el)) || fallback;

/** An easing token, with a CSS keyword as fallback. */
export const ease = (name: string, fallback = 'ease-out', el: Element = rootEl()): string => token(name, el) || fallback;
