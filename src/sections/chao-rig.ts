// Chao rig markup (DESIGN.md §13.3). Created WITHOUT data-mood (hidden) — the owner calls playEnter() or setMood().
import { content } from '../content';
import { el } from '../lib/dom';

export function chaoRig(): HTMLElement {
  const img = (cls: string, file: string, w: number, h: number) =>
    el('img', { class: cls, src: `/character/chao-${file}`, alt: '', width: String(w), height: String(h) });
  const glyph = (name: string, file: string) => img(`chao__part chao__glyph chao__glyph--${name}`, file, 148, 150);
  return el(
    'div',
    { class: 'chao', role: 'img', 'aria-label': content.character.alt },
    el(
      'div',
      { class: 'chao__rig' },
      el(
        'div',
        { class: 'chao__pose' },
        el('div', { class: 'chao__wing' }, img('chao__part', 'wing.webp', 126, 97)),
        img('chao__part chao__torso', 'body.webp', 307, 572),
        img('chao__eyes', 'eyes.webp', 166, 95),
        img('chao__eyes-happy', 'eyes-happy.svg', 166, 95),
        el('span', { class: 'chao__mouth' }),
      ),
      el(
        'div',
        { class: 'chao__pose chao__pose--trail' },
        el(
          'div',
          { class: 'chao__ball' },
          glyph('ball', 'ball.svg'),
          glyph('think', 'ball-think.svg'),
          glyph('happy', 'ball-happy.svg'),
          glyph('sad', 'ball-sad.svg'),
          glyph('error', 'ball-error.svg'),
        ),
      ),
    ),
  );
}
