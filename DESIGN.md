# DESIGN — Game Feelings

Fuente única de valores: `src/styles/tokens.css`. Aquí va el **porqué** y las **recetas** (cómo combinar tokens). Precedencia: brief (`docs/`) y `SPEC.md` > sugerencias de skills.

## 1. Idea en una frase

Un anuncio de PS2 del 2001 que te habla: un fondo de líquido perla iridiscente, un título de plástico inflado al estilo Knoxstation y un Chao que narra. La valentía va en **un solo sitio**: el título y el fondo. Todo lo demás (bocadillo, input, pie) se mantiene sobrio para no competir.

## 2. Paleta

| Rol | Claro (perla) | Oscuro (azul PS profundo) | Por qué |
|---|---|---|---|
| `--color-bg` (fallback bajo el holo) | `#eef4ff` | `#020f38` | Claro = ref. 2; oscuro = imágenes 2–3 (azul PS1/blueprint), más profundo para que el blanco respire. |
| `--holo-1…7` | `#f0ffff #f0f0ff #d8d8f0 #f0d8f0 #c0f0ff #a8d8f0 #d8c0f0` (muestreo exacto de la ref. 2) | `#020f38 #061b55 #0a2a78 #0f3590 #183f9c #22307e #1a2366` | Paradas del respaldo CSS estático del fondo y de los swatches del style tile. El fondo vivo (WebGL) usa `--holo-pearl`, `-pink`, `-lilac`, `-cyan`, `-shade`, `-ridge` (§12.1). |
| `--color-text` | `#0b1d55` | `#f2f8ff` | Navy PlayStation en vez de negro (el negro mataría el aire Y2K). |
| `--color-text-muted` | `#2f4378` | `#d4e3f8` | Pie, metadatos. En oscuro sube a `#d4e3f8` para pasar AA sobre plástico encima de la parada más clara (`#183f9c`); la jerarquía con `--color-text` se apoya también en tamaño. |
| `--color-accent` | `#0745b0` | `#c2e3ff` | El azul Knox `#1a7cff` no llega a 4.5:1 sobre perla (2.4–3.8), así que el acento de **texto** es una versión más profunda. En oscuro, celeste que pasa sobre plástico (incluso en hover). |
| `--color-border` / `--color-border-hover` | `#3a5cad` / `#0745b0` | `#74beff` / `#c2e3ff` | Bordes que identifican un control (input, botones): ≥3:1 (WCAG 1.4.11). En hover el borde gana contraste. |
| `--color-focus` | `#0745b0` | `#74beff` | Anillo de foco visible sobre cualquier parada del fondo. |
| `--knox-*` | `#ffffff` / `#57a0ff` / `#1a7cff` / `#74beff` / `#dffdff` | iguales | Valores reales del GIF de Knoxstation. **Solo decorativos** (título, glows, brillos), nunca texto sobre fondo. |
| `--knox-contour` | `#0b1d55` | `transparent` | Contorno exterior fino del título: en claro, el blanco y el `#57a0ff` se pierden sobre perla (1.6:1); el navy da el borde legible. En oscuro el relleno blanco ya contrasta. |

Sin violetas genéricos de IA: los lilas que aparecen son los de la ref. 2, siempre mezclados con cian y perla. La línea iridiscente usa solo colores de la ref. 2 en ambos temas.

## 3. Tipografía

| Rol | Fuente | Uso | Fuente / licencia |
|---|---|---|---|
| Display (`--font-display`) | **Anybody** Italic, variable (`wdth` 50–150, `wght` 100–900), usada a `font-stretch: 150%`, peso 800–900 | Título "Game Feelings", nombres de juego, barras cromadas | Etcetera Type Co. (Tyler Finck). SIL OFL 1.1. https://fonts.google.com/specimen/Anybody · repo: https://github.com/Etcetera-Type-Co/Anybody |
| Texto (`--font-text`) | **Atkinson Hyperlegible Next**, variable (`wght` 200–800), usada a 400 y 700 | Bocadillo, input, descripciones, pie | Braille Institute / Applied Design Works. SIL OFL 1.1. https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next |

Por qué:
- **Anybody** es la única libre que da a la vez itálica real + extendida al 150% + forma deportiva-techno sin contraste de trazo: lo más cercano al lettering de Knoxstation y al "COMING SOON" del póster de Sonic. Orbitron, Michroma, Krona o Bruno Ace son anchas pero no tienen itálica; Exo 2 o Chakra Petch tienen itálica pero no son anchas.
- **Atkinson Hyperlegible Next**: legibilidad máxima (letras que no se confunden) y un punto humanista que suaviza al narrador. Contrasta claramente con la display.
- **Sin pesos finos** (preferencia del usuario): los `@font-face` declaran `font-weight: 700 900` (Anybody) y `400 700` (Atkinson); el navegador no puede pedir pesos finos.
- Archivos: woff2 subset latin desde Google Fonts, en `public/fonts/` (Anybody 62 KB, Atkinson 34 KB). Precargar solo Anybody (pinta el título, LCP probable).
- **Sin monoespaciada**: no hace falta.

**Escala** (`--text-*`), modular de verdad: ratio **1.2 sobre 16 px a 360 px → ratio 1.333 sobre 18 px a 1440 px**, interpolada linealmente.

| Token | 360 px | 1440 px | Uso |
|---|---|---|---|
| `--text-sm` | 13 | 14 | pie, metadatos, etiquetas |
| `--text-base` | 16 | 18 | texto, input |
| `--text-lg` | 19.2 | 24 | bocadillo |
| `--text-xl` | 23 | 32 | título del detalle |
| `--text-2xl` | 27.6 | 42.7 | título compacto (results) |
| `--text-display` | 40 | 96 | "Game Feelings" (logotipo, fuera de la escala) |

`--text-xs` se eliminó: era casi igual a `sm`. Un solo tamaño pequeño. Interlineado: 0.95 título, 1.3 bocadillo, 1.55 texto. Medida máxima `--measure: 60ch`. A 360 px el título cabe en 2 líneas a 150% (comprobado en render).

Sin etiquetas en mayúsculas espaciadas encima de cada bloque (cliché de IA). `--tracking-meta` solo para metadatos del detalle (año, plataforma), en tipo oración.

### 3.1 Receta del título Knox

Tres capas del mismo texto. El orden de apilado importa: el fondo de un elemento se pinta **debajo** de sus hijos con `z-index` negativo, así que el relleno brillante va en `::after`, no en el propio elemento.

| Capa | Qué hace | Tokens |
|---|---|---|
| `::before` (abajo) | Anillo redondeado `#57a0ff` (16 `text-shadow` en círculo = trazo con uniones redondas; `-webkit-text-stroke` hace esquinas en inglete y se descarta) + extrusión `#1a7cff` de **16 pasos de 0.01em = 0.16em** de profundidad (≤1 px por paso hasta 100 px de cuerpo, sin escalones; 4 `drop-shadow` con desfases de 1, 2, 4 y 8 pasos) + contorno exterior fino y suave (revisada en fase 2, ver §12.7) | `--knox-ring`, `--knox-extrusion` |
| Elemento | Texto real, accesible y seleccionable, con `color: transparent` | — |
| `::after` (arriba) | Relleno blanco con brillo especular (`--knox-shine`) y volumen abajo (`--knox-highlight`), una banda por línea | `--knox-gloss` |

```css
.title {
  position: relative; isolation: isolate;
  font-family: var(--font-display); font-style: italic;
  font-weight: var(--weight-display-heavy); font-stretch: var(--font-stretch-display);
  font-size: var(--text-display); line-height: var(--leading-display);
  letter-spacing: var(--tracking-display);
  color: transparent;
  transform: skewX(var(--knox-skew));
}
.title::before,
.title::after {
  content: attr(data-text) / "";   /* "/ ''" lo oculta a lectores de pantalla */
  position: absolute; inset: 0;
}
.title::before {
  z-index: -1;
  color: var(--knox-extrude-1);
  text-shadow: var(--knox-ring);
  filter: var(--knox-extrusion);
}
.title::after {
  color: transparent;
  background: var(--knox-gloss);
  background-size: 100% 1lh;
  -webkit-background-clip: text; background-clip: text;
}
```
HTML: `<h1 class="title" data-text="Game Feelings">Game Feelings</h1>` (el texto sale de `content.ts`, `data-text` igual). El bounce (`--title-bounce-distance`, `--dur-bob`, ver §12.7) va en un **contenedor** del título, no en `.title`, para que el filtro no se recalcule en cada frame. `--knox-skew` (-6°) suma inclinación a los ~12° de Anybody para acercarse a los ~20° de Knox; solo en el título.

## 4. Espaciado, anchos, radios, tamaños

- Espaciado base 4 px: `--space-1` (4) … `--space-9` (96). `--gutter`: 16 px en móvil → 48 px en desktop. Sin scroll horizontal de página.
- Anchos: input 36 rem, bocadillo 30 rem, panel 60 rem.
- Bordes: `--border-hairline` (1 px, materiales) y `--border-control` (2 px, input y controles con borde).
- Chao: `--chao-size` = 6 rem en <768 px, `clamp(8rem, 14vw, 12.5rem)` desde 768 px (el token cambia solo con el media query). `--chao-size-compact` = 60% para `results` / `no-results` / `error`. Se aplica como `block-size`.
- Radios con jerarquía (no un radio para todo):
  - `--radius-pill` → input (SPEC US2), toggle de tema, botones.
  - `--radius-bubble` (28 px) con la esquina que apunta a Chao en `--radius-bubble-tail` (6 px): el bocadillo "sale" del personaje sin dibujar una cola.
  - `--radius-case` (6 px) → caja PS2, casi recta como la real.
  - `--radius-panel` (20 px) → panel de detalle.
  - `--cut-corner` (20 px) → esquina cortada en diagonal del cromo (`--chrome-clip`).

## 5. Materiales (recetas con tokens)

### Plástico translúcido (mando PS2 azul hielo) — bocadillo, toggle, botones
```css
background: linear-gradient(var(--plastic-tint), transparent 60%), var(--plastic-fill);
border: var(--border-hairline) solid var(--plastic-rim);
box-shadow: var(--shadow-plastic);   /* sin backdrop-filter: eso sería vidrio */
```
`--shadow-plastic` lleva cuatro capas: línea de brillo arriba (1 px), **banda de brillo superior** de ~10 px, tinte azul abajo y sombra exterior. En oscuro la línea y la banda son mucho más fuertes (0.75 / 0.4) que antes (0.35), que es lo que distingue el plástico de un vidrio oscuro genérico. Desde la fase 2 el relleno oscuro tiene una **base navy** (`rgb(8 32 95 / .38)`, hover `rgb(30 80 175 / .42)`) en vez de aclarar con celeste: el fondo WebGL oscuro tiene cintas más claras y era la única forma de mantener AA del texto sobre el plástico (§12.8). El texto dentro debe quedar a ≥ `--space-3` del borde superior (fuera de la banda de brillo); el bocadillo usa `--space-4`.

**Estados de controles de plástico** (toggle y futuros botones; el bocadillo no es interactivo):

| Estado | Receta | Movimiento |
|---|---|---|
| hover | `background: linear-gradient(var(--plastic-tint), transparent 60%), var(--plastic-fill-hover); border-color: var(--plastic-rim-hover);` + glow en un `::after` (`inset: 0; border-radius: inherit; box-shadow: var(--glow-accent); opacity: 0 → 1`) | solo `opacity` del `::after`, `--dur-fast` `--ease-out` |
| active (press) | `transform: scale(var(--press-scale)); box-shadow: var(--shadow-plastic-pressed);` | `transform`, `--dur-fast` `--ease-out`. `--press-scale` vale 0.96, o 1 con reduced motion (no hay que escribir nada extra) |
| focus-visible | `outline: var(--focus-width) solid var(--color-focus); outline-offset: var(--focus-offset);` | ninguno |

Hover solo dentro de `@media (hover: hover)` para que en táctil no se quede pegado.

### Input
```css
background: var(--color-surface);
border: var(--border-control) solid var(--color-border);
border-radius: var(--radius-pill);
box-shadow: var(--shadow-plastic);
```
Hover: `border-color: var(--color-border-hover)` (cambio de color, sin transición o `--dur-fast`). Focus: anillo `--color-focus` como arriba. Relleno opaco: máxima legibilidad al escribir.

### Cromo (barra superior del póster de Sonic) — barra de título del detalle, banda de la caja PS2
`clip-path` se come el borde en la diagonal, así que el borde es una capa de fondo y el degradado va encima, ambos recortados con la misma forma:
```css
.chrome {
  position: relative; isolation: isolate;
  background: var(--chrome-edge);      /* este fondo ES el borde de 1 px */
  clip-path: var(--chrome-clip);
  color: var(--chrome-text);
}
.chrome::before {
  content: ""; position: absolute; z-index: -1;
  inset: var(--border-hairline);
  background: var(--chrome-gradient);
  clip-path: var(--chrome-clip);
}
```
El borde queda de 1 px en los lados rectos y ~1.4 px en la diagonal de 45°. Uso escaso: si todo es cromo, nada lo es. Igual en ambos temas.

### Vidrio espejado — **solo** el panel de detalle
```css
background: var(--glass-fill);
backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
border: var(--border-hairline) solid var(--color-border-soft);
box-shadow: var(--shadow-panel);
```
Es lo único que se superpone a contenido; ahí el desenfoque tiene razón de ser.

### Otros
- **Línea iridiscente** `--iridescent-line`: fondo de 2 px en el lomo de la caja PS2 (línea arcoíris de la imagen 8).
- **Glow neón** `--glow-accent`: hover de controles y cajas, Chao en `thinking` (opcional). Viene de las formas con glow de la imagen 2 (PS1).
- Grano y halftone (imágenes 2, 4 y 6): textura del fondo, definida en fase 2 (§12.6).

## 6. Movimiento

| Token | Valor | Uso |
|---|---|---|
| `--dur-fast` | 160 ms | hover, press |
| `--dur-base` | 260 ms | cambio de texto del bocadillo, aparición de input |
| `--dur-slow` | 480 ms | paso intro → results, apertura del panel |
| `--dur-enter` | 1000 ms | entrada de Chao (viaje + 3 saltos, §13) |
| `--dur-bob` | 1.5 s | bounce del título (valor real de Knoxstation: `translateY(-8px)`, ease-in-out). El balanceo de Chao tiene su propio periodo (`--chao-sway-dur`, §13) |
| `--dur-holo` | 15 s | ciclo del fondo (duración real del vídeo de la ref. 2): la fase del shader es 2π·t/15 s con armónicos enteros, loop sin salto |
| `--stagger` | 60 ms | entrada escalonada de las cajas |

Curvas: `--ease-out` para entradas, `--ease-in` para salidas (más cortas que las entradas), `--ease-spring` (pequeño rebote) para el aterrizaje de Chao y de las cajas, `--ease-in-out` para bucles (`cubic-bezier(.42, 0, .58, 1)`, el `ease-in-out` estándar de CSS, igual que el rebote original de Knox).

Solo `transform` y `opacity` animados. **Reduced motion**: `--motion-scale` pasa a 0; todo desplazamiento se escribe como `calc(var(--motion-scale) * …)` y `--press-scale` ya lo incorpora, así que las cosas aparecen con un fundido corto en su sitio (SPEC US1) y nada escala. Los bucles CSS (bounce, balanceo) se apagan con `animation: none` bajo `prefers-reduced-motion: reduce`; el fondo WebGL pinta un solo frame estático y no arranca el bucle (§12.4).

## 7. Temas

- Claro por defecto. Los selectores solo cambian `color-scheme`: oscuro con `@media (prefers-color-scheme: dark)` sobre `:root:not([data-theme="light"])` y con `:root[data-theme="dark"]` (toggle manual, recordado en `localStorage`).
- Cada token de color está escrito **una sola vez** como `light-dark(claro, oscuro)` (Baseline 2024). Antes había dos bloques oscuros idénticos de ~42 líneas: frágiles. `light-dark()` solo acepta colores (ni números, como opacidades, ni imágenes), así que en sombras y filtros solo van temados los colores de cada capa; los degradados del cromo y la línea iridiscente son iguales en ambos temas.
- **Ojo** (fase 2, aplicado en el fondo WebGL, §12.4): `getComputedStyle(root).getPropertyValue('--holo-cyan')` devuelve el texto `light-dark(...)`, no un color. El shader necesita el color resuelto: `holo.ts` aplica `color: var(--holo-cyan)` a un elemento sonda y lee su `color` computado, y vuelve a leer cuando cambia el tema. `light-dark()` tampoco acepta números ni imágenes (la opacidad del grano es un número plano; el grano usa dos imágenes).
- El cromo y los colores Knox no cambian entre temas. Las sombras en oscuro son negras y más densas (una sombra navy sobre navy no se ve).

## 8. Contraste (WCAG 2.x, calculado con script)

"Peor" = contra el peor bloque de 12×12 px de 45 fases del **fondo WebGL real** (grano y halftone incluidos), en 1440 y 390 px (§12.8). Las filas de plástico componen relleno (`--plastic-fill` o `-hover`) + `--plastic-tint` a opacidad completa (el máximo del degradado) sobre ese peor fondo. La banda de brillo superior no se cuenta porque el texto queda fuera de ella (§5). Las filas "surface", cromo y on-accent no dependen del fondo.

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| text / fondo | 8.97 | 6.10 | 4.5 |
| text-muted / fondo | 5.40 | 5.01 | 4.5 |
| accent / fondo | 4.76 | 4.88 | 4.5 |
| text / surface | 15.32 | 14.21 | 4.5 |
| text-muted / surface | 9.22 | 11.68 | 4.5 |
| accent / surface | 8.14 | 11.38 | 4.5 |
| text / plástico (relleno + tinte) | 12.84 | 7.67 | 4.5 |
| text-muted / plástico | 7.73 | 6.30 | 4.5 |
| accent / plástico | 6.82 | 6.14 | 4.5 |
| text / plástico hover | 13.79 | 6.01 | 4.5 |
| text-muted / plástico hover | 8.30 | 4.94 | 4.5 |
| accent / plástico hover | 7.33 | 4.81 | 4.5 |
| text / vidrio | 13.70 | 11.44 | 4.5 |
| on-accent / accent | 8.44 | 13.94 | 4.5 |
| chrome-text / cromo (parada más oscura) | 7.82 | 7.82 | 4.5 |
| border / fondo | 3.58 | 3.27 | 3 (UI) |
| border-hover / fondo | 4.76 | 4.88 | 3 (UI) |
| focus / fondo | 4.76 | 3.27 | 3 (UI) |
| focus / surface | 8.14 | 7.63 | 3 (UI) |
| contorno del título / fondo | 8.97 | 3.0 | logotipo |

Para que esto se cumpla con el fondo WebGL oscuro, el cian del fondo se limitó en luminosidad y el plástico oscuro pasó a base navy (§5, §12.8). El título es un **logotipo** (WCAG 1.4.3 lo exime), pero lleva contorno navy en ambos temas.

## 9. Textos del narrador (para `src/content.ts`)

Inglés, cortos, cálidos, sin emojis. **Re-enfoque del 2026-10-03**: el usuario ya no escribe cómo se siente sino **qué juego busca** (un requisito: "co-op adventure", "un souls-like", "metroidvania para Switch"), en español o inglés; la UI sigue en inglés. **La tabla completa y vigente está en §14.6; el `content.ts` verbatim y la regla del `{summary}`, en §14.13.** Desde el pulido (2026-10-05) el Chao tipea cada frase con un blip por cada 2 letras (§17); sigue sin TTS.

| Estado | Bocadillo |
|---|---|
| `intro` | Hey! What kind of game are you looking for? |
| `typing` | Take your time. Hit Enter when you're ready. |
| `empty-input` | Type a kind of game first, like "souls-like". |
| `thinking` | Hmm… let me think about that. |
| `results` | Ooh, {summary}! Try these. (`{summary}` = resumen corto de la API; si pasa de 26 caracteres, "Ooh, I found some! Try these.") |
| `no-results` | No games fit all of that. Try fewer details? |
| `error` | My brain is buffering. Give it a moment and try again. |
| `detail` (al volver) | Want to look for something else? |
| fuera de tema: solo un sentimiento, sin sentido u ofensivo (US3, layout de `no-results`) | I only know games. Try "cozy farming sim". |

Otros textos:
- Label del input (visualmente oculto, el bocadillo hace de enunciado visible): "What kind of game?"
- Placeholder: "A co-op adventure for Switch"
- Toggle de tema: `aria-label` "Switch to dark theme" / "Switch to light theme".
- Pie: "Chao © SEGA — fan project, not affiliated · Game data by RAWG" (RAWG enlazado).
- El nombre "Game Feelings" se mantiene (decisión del usuario): ahora se lee como "lo que te apetece jugar".

## 10. Layout y movimiento por estado (pantalla única, SPEC §1.1)

Estructura fija: fondo holo a pantalla completa (`--z-bg`); título arriba centrado; grupo narrador (Chao + bocadillo) e input centrados como una sola columna; pie fijo abajo en `--text-sm` / `--color-text-muted` sin material (texto sobre fondo); toggle de tema arriba a la derecha (plástico, pill, 44×44 mínimo). Todo centrado; el texto del bocadillo alineado a la izquierda.

- **Desktop (≥768 px)**: Chao (`block-size: var(--chao-size)`) a la izquierda del bocadillo, con la esquina inferior izquierda del bocadillo en `--radius-bubble-tail` apuntando a Chao. Input debajo, ancho `min(100%, --width-input)`. El conjunto título + narrador + input centrado verticalmente, ópticamente un poco arriba (centro al ~45%).
- **Móvil (<768 px)**: mismo token (`--chao-size` vale 6 rem ahí), disposición lado a lado (el bocadillo se estrecha y crece en alto); input a ancho completo menos `--gutter`. Título en 2 líneas.

| Estado | Layout | Movimiento |
|---|---|---|
| `intro` | Base. Input oculto hasta que termina el bocadillo. | Chao entra desde fuera por la izquierda dando tres saltos (`enter`, §13) en `--dur-enter`. Al aterrizar, el bocadillo aparece con `scale(.92)` → 1 + opacidad en `--dur-base`, origen en la esquina que apunta a Chao. Luego el input sube 12 px + opacidad en `--dur-base`. Total ≤ 1.6 s. Foco al input al aparecer solo con `pointer: fine` (en móvil no abrir el teclado solo). |
| `typing` | Igual. | Al primer carácter, el texto del bocadillo cambia con fundido (salida `--dur-fast`, entrada `--dur-base`). Sin movimiento de layout. |
| `empty-input` | Igual. | Sacudida del input: `translateX(±--shake-distance)` 3 veces en ~300 ms; el foco se queda en el input. Cambio de texto del bocadillo. |
| `thinking` | Igual; input `readonly` + `aria-busy="true"`. | Chao en mood `think` (§13): se balancea ±4° en bucle `--chao-sway-dur` y la bola, convertida en `?`, gira. Un brillo (pseudo-elemento) cruza el input en bucle. Reduced motion: sin bucles, solo el texto. |
| `results` | Título baja a `--text-2xl`; Chao pasa a `--chao-size-compact`; Chao + bocadillo + input suben y se compactan arriba. La fila de cajas PS2 ocupa el resto, scroll horizontal con snap, 5 visibles a ≥1280 px. | El grupo superior se mueve con FLIP (transform) en `--dur-slow` `--ease-out`. Las cajas entran desde abajo (`translateY(40px)` → 0 + opacidad) con `--stagger` entre cada una y `--ease-spring`. |
| `no-results` | Igual que `results` sin fila. | Igual que `results` sin la fila. El input recupera el foco con su texto seleccionado para reescribir. |
| `error` | Igual que `no-results`. | Igual que `no-results`. |
| `detail` | **Sustituido por §16** (fase 6). Original: scrim (`--color-scrim`) + panel de vidrio (ancho `--width-panel`, en móvil a pantalla casi completa) con barra cromada de título. | Scrim por opacidad en `--dur-base`; panel sube 24 px + opacidad en `--dur-slow` `--ease-out`. Cierre más rápido (`--dur-base`, `--ease-in`). Foco al título del panel al abrir; al cerrar, foco a la caja que lo abrió y el bocadillo dice la línea de vuelta. |

## 11. Conflictos y notas

- La skill `ui-ux-pro-max` en esta máquina solo trae `SKILL.md` (sin datos ni scripts, y no hay Python), así que no hubo búsqueda en su base de datos. Se aplicaron sus reglas integradas de prioridad (contraste 4.5:1, foco visible, objetivos de 44 px, tokens semánticos, reduced motion, una duración por tipo de transición). No hubo conflicto con el brief.
- `frontend-design` desaconseja etiquetas en mayúsculas espaciadas; el póster PS1 (imagen 2) las usa. Se toma solo el tracking amplio, en tipo oración y solo para metadatos.
- Revisión de la fase 1 aplicada: acento/muted oscuros con el tinte incluido, receta del título sin escalones y con uniones redondas, estados de plástico, borde del cromo en la diagonal, brillo del plástico oscuro, tokens de Chao y de borde, escala tipográfica real, cromo y línea iridiscente únicos, un solo bloque de tema con `light-dark()`.

## 12. Fase 2: fondo líquido holográfico (WebGL) y movimiento del título

Cierra lo que SPEC §9 (ref. 2) dejaba abierto. Valores en `src/styles/tokens.css` (bloques "Phase 2" y "Motion"). Este apartado reemplaza a la primera versión de la fase 2 (ver §12.7).

### 12.1 Técnica del fondo: un fragment shader WebGL pequeño

**Decisión: WebGL1, un solo triángulo a pantalla completa, un fragment shader (~35 líneas de GLSL) y ~100 líneas de TS. Sin dependencias.**

Por qué cambió la técnica: la ref. 2 (Digivalet) son **cintas cian definidas con flecos rosa/lila y crestas perla**, como una superficie líquida plegada. Las capas de degradado CSS que solo se trasladan y giran no pueden crear pliegues: daban nubes pastel borrosas (claro) y una tela plana (oscuro). Un campo de altura con warp de dominio sí: la pendiente de la superficie decide el color, así que en las zonas llanas hay amplios blancos perla y en las pendientes aparecen cintas estrechas con flecos, que es exactamente lo que se ve en la ref.

**Cómo funciona el shader** (GLSL verbatim en §12.3):
1. `S(p)` es una coordenada de flujo: las cintas corren a lo largo de x y un warp 2D (senos con armónicos enteros de la fase) las pliega y curva.
2. Se calcula la pendiente `g` de `S` por diferencias finitas (3 evaluaciones por píxel).
3. La posición en la banda `w` (onda triangular suavizada con un seno, elevada a 1.5 para que domine el perla y el cian quede estrecho) recorre una rampa **perla → rosa → lila → cian → crease**.
4. Flecos iridiscentes de película delgada: la rampa se evalúa con un desfase distinto por canal (R `w+.05`, G `w`, B `w-.05`).
5. Crestas especulares finas (color `--holo-ridge`) donde la normal apunta a la luz, y sombra suave en los pliegues.

**Movimiento**: una **única fase monótona** `uT = 2π·t/15 s`. Todos los usos de `uT` llevan coeficiente **entero** (1, 2, 3): la imagen en t = 15 s es idéntica a la de t = 0 y cada término viaja siempre hacia delante (sin ida y vuelta, sin frames espejo). Comprobado: la diferencia media entre frames separados 20 ms cruzando el ciclo (14 980 → 0 ms) es 0.24/255, igual que en mitad del ciclo (0.33–0.50). Más lento no es posible sin salirse de los 15 s: a 1 s de distancia la diferencia media es ~8/255 por canal.

**Fase inicial y frame estático: `STILL_MS = 9500` para los dos.** El frame t = 0 cae en el tramo de pliegues apretados (franjas paralelas finas arriba a la izquierda). Se midió el gradiente local de la imagen (percentil 99 de |∇luminancia| cada 500 ms, `grad.mjs` del scratchpad): en t = 0 vale 4.3 (claro) y 9.0 (oscuro); el mínimo está en t = 9500–10000, con 1.9 y 3.6, y se ve como pliegues suaves en ambos temas. **Decisión sobre el inicio: la página arranca siempre en 9500 ms, sin offset aleatorio.** Razones: (1) lo primero que ve la persona es el frame más limpio; (2) es idéntico al still de reduced motion, así que activar o desactivar la preferencia no da salto (comprobado: el hash del frame inicial en reduced motion es el de `seek(9500)`); (3) las capturas sin `?t=` son deterministas para los tests. Un offset aleatorio no aporta nada en una página de una sola pantalla y rompería los tests. El tramo de franjas apretadas llega ~5.5 s después de cargar y dura unos 3 s: es parte del ciclo; si el revisor lo pide, bajar las amplitudes `.13` y `.05` del cálculo de `u` en el shader.

**Colores** (seis tokens, mismos nombres en claro y oscuro; `light-dark()` ya los resuelve):

| Token | Claro | Oscuro | Papel |
|---|---|---|---|
| `--holo-pearl` | `#f4fcff` | `#0a2579` | zonas llanas amplias |
| `--holo-pink` | `#efd0f3` | `#2335a8` | fleco a ambos lados de la cinta |
| `--holo-lilac` | `#d9c6f5` | `#101c68` | transición |
| `--holo-cyan` | `#a6e6fa` | `#0e55ad` | núcleo de la cinta |
| `--holo-shade` | `#94c4f0` | `#04134a` | pliegue dentro del núcleo |
| `--holo-ridge` | `#ffffff` | `#9fe0ff` | línea especular fina |

Claro: muestreados de un frame real de la ref. 2 (cian de cinta `#aae6fb`, perla `#eef1fb`, lila `#e9d2fc`); `--holo-cyan` es más profundo que el `#c0f0ff` del promedio de 7 paradas de SPEC §9 porque el promedio mezcla cinta y perla. Oscuro: seda azul PlayStation con rango tonal real: cintas cian-azul `#0e55ad` y flecos índigo sobre fondo profundo. **El núcleo oscuro está limitado en luminosidad** (bloque medio ≤ L 0.10) para que el texto claro pase AA (§12.5); lo que da vida son las cintas, los flecos y las crestas finas, no un cian eléctrico.

**Comparación con la ref. (lado a lado a 1440×900, honesta)**: el claro se lee ya como la misma familia (perla dominante, cintas cian con fleco rosa/lila, pliegues que se cruzan y se curvan, fondo con rango tonal). **Aún no iguala** a Digivalet en: (a) el rosa es algo más lila y menos saturado en las zonas bajas de la ref.; (b) la ref. tiene pliegues más complejos (lazos cerrados, ondulaciones finas en el borde de la cinta) que un solo campo de seno con warp no da; (c) las crestas perla finas son más visibles en la ref. En oscuro no hay referencia (SPEC pide "misma técnica sobre azules"): se lee como seda azul con cintas y flecos, sin el "tela plana" de la versión CSS. Si el revisor pide más complejidad, la palanca barata es un segundo warp de frecuencia ~2.5× con amplitud .05 (otra evaluación de seno por llamada a `S`).

**Rendimiento** (medido AQUÍ, en Chrome headless con SwiftShader, que es **rasterización por CPU**; no es una GPU ni un portátil medio): el bucle rAF va clavado a **16.67 ms (60 fps)** a 1440×900 (DPR 1 y 2) y a 390×844 con DPR 3, con el canvas renderizado a 0.5× (720×450 y 195×422 px); p95 16.8 ms. El coste de un draw sincronizado (draw + `readPixels`) en software es 6.4 ms (720×450), 2.4 ms (195×422) y ~25 ms a 4K (1265×712, tope de 900 000 px); en una GPU real es del orden de 50–100 veces menos, es decir, muy por debajo de los 4 ms objetivo, pero **eso es una estimación, no una medida**. Tope de píxeles `MAX_PX = 900 000` para pantallas enormes. Esas cifras de 60 fps son de la primera versión del bucle; **ahora el bucle dibuja a ~30 fps** (`FRAME_MS = 30`: con rAF a 60 Hz se dibuja un frame de cada dos), la mitad de trabajo y batería, sin pérdida visible porque el movimiento es lento. Comprobado: 31 draws en 1.0 s.

**Descartado**: seguir con capas CSS (no pueden plegar), `filter: blur`, un `<video>` (peso, licencia), `OffscreenCanvas`/worker (complejidad innecesaria), `fbm`/ruido (más coste y no da crestas definidas).

### 12.2 Estructura de archivos (para el frontend-engineer)

```
src/holo/shader.ts   export const FRAG = `...`   (GLSL, §12.3)
src/holo/holo.ts     export function startHolo(canvas)   (§12.4)
src/styles/holo.css  .holo / .holo__canvas, halftone, grain, @media, title-wrap
```
`index.html` (estático, hijo directo de `<body>`, hermano **anterior** de `#app`; ningún ancestro con `transform`, `filter`, `isolation` ni `z-index`):
```html
<div class="holo" aria-hidden="true"><canvas class="holo__canvas" hidden></canvas></div>
```
`src/main.ts`: **después** de `render(app)` (el contenido y la narración no esperan al fondo) y dentro de `try/catch` (el fondo es decorativo y nunca debe tumbar la app):
```ts
import { startHolo } from './holo/holo';
// ...after render(app):
try {
  startHolo(document.querySelector<HTMLCanvasElement>('.holo__canvas')!);
} catch (e) {
  if (import.meta.env.DEV) console.warn('[holo]', e); // CSS fallback stays
}
```
`body` conserva `background: var(--color-bg)`. **Se borra** todo lo de la versión CSS: los 5 `<span class="holo__layer …">`, `.holo__layer`, `.holo__sweep`, `.holo__blob*`, `.holo__sheen`, los `@keyframes holo-sway/holo-drift/holo-slide` y el `will-change` de capas.

### 12.3 GLSL verbatim (`src/holo/shader.ts`)

Uniforms: `uRes` (vec2, tamaño del canvas en px), `uT` (float, fase en radianes 0..2π) y `uC[6]` (vec3, `pearl, pink, lilac, cyan, shade, ridge`, RGB 0..1 leídos de los tokens).

```ts
// Fragment shader for the holographic background. Phase uT = 2π·t/15 s; every use of uT has an
// INTEGER coefficient, so the image at t = 15 s equals the image at t = 0 (seamless loop) and
// every term travels forward (monotonic, no ping-pong).
export const FRAG = `
precision highp float; // required: startHolo bails out if the GPU has no highp in fragment shaders
uniform vec2 uRes;     // canvas size in px
uniform float uT;      // phase, radians, 0..2π
uniform vec3 uC[6];    // pearl, pink, lilac, cyan, shade, ridge (from tokens)

// Flow coordinate: ribbons run along x; the 2D warp makes them fold and curl.
float S(vec2 p){
  p += .65*vec2(sin(.7*p.y+uT), sin(.6*p.x-uT+1.));
  p += .16*vec2(sin(1.9*p.y-2.*uT), sin(1.7*p.x+2.*uT+2.));
  float u = p.y + .36*sin(.9*p.x+uT) + .13*sin(1.7*p.x-2.*uT+2.) + .05*sin(3.1*p.x+3.*uT);
  return u + .28*sin(1.9*u + .7*p.x - uT);
}

// Band position 0..1 -> pearl, pink fringe, lilac, cyan core, shade crease.
vec3 ramp(float w){
  vec3 c = mix(uC[0], uC[1], clamp(w/.38, 0., 1.));
  c = mix(c, uC[2], clamp((w-.30)/.22, 0., 1.));
  c = mix(c, uC[3], clamp((w-.56)/.16, 0., 1.));
  return mix(c, uC[4], clamp((w-.86)/.14, 0., 1.));
}

void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes) / uRes.y * 3.2;
  float e = .02, s = S(p);
  vec2 g = vec2(S(p+vec2(e,0.))-s, S(p+vec2(0.,e))-s) / e;   // slope of the surface
  float a = 3.1*s + 1.3*sin(1.3*s + .5*p.x + uT);
  float w = mix(asin(clamp(sin(a), -1., 1.))/3.14159 + .5, .5 + .5*sin(a), .4); // clamp: asin(>1) is NaN on some mobile GPUs
  w = pow(clamp(w, 0., 1.), 1.5);                                            // pearl dominates, cyan is narrow
  vec3 c = vec3(ramp(w+.05).r, ramp(w).g, ramp(w-.05).b);     // per-channel offset = thin-film hue fringe
  float l = dot(normalize(vec3(-g*.9, 1.)), normalize(vec3(-.3,.6,.75)));
  c = mix(c, uC[5], pow(max(l,0.), 12.)*.85);                 // specular ridges
  c = mix(c, uC[4], clamp(.55-l,0.,1.)*.3);                   // soft fold shade
  gl_FragColor = vec4(c, 1.);
}`;
```

### 12.4 TS verbatim (`src/holo/holo.ts`, 102 líneas)

Pasa `tsc --strict` con los tipos de `vite/client` del proyecto. Son ~20 líneas más que la primera versión (que tenía 74): son las protecciones pedidas por la revisión de código (soporte, highp, ResizeObserver, pausa, fade, limpieza de shaders).

```ts
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
```

Comportamiento (todo probado en Chrome real con una página de prueba que usa los tokens reales):

| Caso | Qué pasa | Comprobado |
|---|---|---|
| Soporte | Al principio: si `!CSS.supports('color', 'light-dark(red, blue)')` vuelve sin hacer nada (los tokens no se resolverían); si no hay contexto `webgl`, o `gl.getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT).precision === 0` (sin highp: el shader lo exige), libera el contexto y vuelve. El canvas queda `hidden` y se ve el respaldo CSS. | los tres casos simulados: canvas `hidden` |
| Lectura de colores | Elemento sonda `<i hidden>` dentro de `.holo`: se le pone `color: var(--holo-x)` y se lee su `color` computado (`rgb(...)`, o `color(srgb ...)` ya en 0..1). `getPropertyValue('--holo-x')` devolvería el texto `light-dark(...)`. Se leen los 6 en cada cambio de tema. | sí |
| Cambio de tema | `matchMedia('(prefers-color-scheme: dark)')` `change` + `MutationObserver` sobre `data-theme` de `<html>`: releer colores y repintar. Sin transición. | el frame cambia con el esquema del sistema |
| Resolución | Canvas a 0.5× píxeles CSS (`SCALE`), nunca por DPR, con tope `MAX_PX`. Un `ResizeObserver` sobre el canvas la recalcula: solo en cambios reales de tamaño y al volver de `display:none` (no en cada evento de la barra de URL de iOS, que sí dispara `resize`). La altura CSS es `100lvh`. | 1440×900 → 1100×800 → 800×700: 720×450 → 550×400 → 400×350 |
| Bucle | rAF con tiempo acumulado (`ms += min(dt, 100)`): al volver de segundo plano no hay salto. Dibuja como mucho cada `FRAME_MS` = 30 ms (~30 fps); el siguiente rAF se agenda siempre. | 31 draws en 1.0 s |
| Quién decide | `sync()` es el único sitio: arranca el bucle solo si `!reduced-motion && !forced-colors && !document.hidden && !html[data-holo-paused]`. Se llama en `visibilitychange`, en los `change` de las dos `matchMedia` y en el `MutationObserver` (atributo `data-holo-paused`, §12.12). | ver filas siguientes |
| Pestaña oculta | cancela rAF; al volver, reanuda. | 0 draws en 0.5 s oculto |
| `prefers-reduced-motion` | Un solo frame (`STILL_MS`), sin bucle; solo se repinta en resize y cambio de tema. Si la preferencia cambia en vivo, `sync()` arranca o para el bucle. El fade-in del canvas se anula (§12.5). | 4 draws iniciales y ninguno después; el frame es el de `seek(9500)` |
| `forced-colors: active` | `.holo` es `display:none`; `sync()` no arranca el bucle (no se calcula un fondo invisible). | 2 draws y ninguno más |
| `data-holo-paused` | Atributo en `<html>`: para el bucle y deja el último frame. Quitarlo lo reanuda. | 0 draws en 0.6 s pausado; 19 al quitarlo |
| Contexto perdido | `webglcontextlost` → `preventDefault()`, canvas `hidden` y sin la clase de fade, se para el bucle. `webglcontextrestored` → se reconstruye el programa y se vuelve a mostrar (con fade). | `WEBGL_lose_context`: oculto y, al restaurar, vuelve a pintar |
| Fallo de shader | Compila y enlaza; `bindAttribLocation(p, 0, 'a')` antes de `linkProgram`; `deleteShader` tras enlazar. Si falla: `deleteProgram`, libera el contexto y deja el canvas `hidden`. El log (`getShaderInfoLog`) solo sale con `import.meta.env.DEV`. | shader roto: canvas oculto y log en dev |
| `?t=` (solo DEV) | `Number(q) || 0`: un valor no numérico cae a 0 en vez de NaN. | `?t=abc`: bucle congelado |

**Decisiones que quedan fijadas**
- `failIfMajorPerformanceCaveat` **se deja desactivado** (valor por defecto `false`). Activarlo haría que Chrome rechazara el contexto en GPUs en lista negra y en rasterización por software, es decir, en SwiftShader, que es lo que usan todos los tests headless de este proyecto, y el fondo no se vería en ellos. Coste asumido: en un equipo sin GPU el shader corre en CPU. Es barato (canvas de ≤ 900 000 px a 30 fps; en software medimos 2–10 ms por draw a 195×422–720×450) y, además, el `display:none` por `forced-colors` y la pausa por `data-holo-paused` evitan trabajo inútil.
- **`PERIOD` tiene una sola fuente: el token `--dur-holo`.** `holo.ts` lo lee una vez (`getComputedStyle(html).getPropertyValue('--dur-holo')`, unidad: segundos, con `15` de respaldo) en vez de duplicar 15000. Si alguien cambia el token a milisegundos hay que cambiar la lectura.
- `STILL_MS` (9500) es un número de tiempo propio del shader (elegido a ojo y medido), no un token.

**Respaldo CSS** (único, estático, sin animación ni capas): `.holo { background: var(--holo-sweep), var(--holo-base) }`. Es un abanico cónico perla con bandas cian/rosa/lila: se ve más plano que el shader, pero la página nunca queda en blanco y los contrastes siguen cumpliendo (usa `--holo-1…7`). El canvas va `hidden` hasta el primer pintado correcto.

### 12.5 CSS (`src/styles/holo.css`) y reglas

```css
.holo {
  position: fixed; inset: 0 0 auto 0;
  block-size: 100vh; block-size: 100lvh;        /* lvh: iOS URL bar */
  z-index: var(--z-bg); overflow: hidden; pointer-events: none; contain: strict;
  background: var(--holo-sweep), var(--holo-base);   /* static fallback, under the canvas */
}
.holo__canvas { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; /* no display: it must keep [hidden] */
  opacity: 0; transition: opacity var(--dur-slow) var(--ease-out); }  /* fade in over the CSS fallback */
.holo__canvas--on { opacity: 1; }                                       /* holo.ts adds it after the first paint */
@media (prefers-reduced-motion: reduce) { .holo__canvas { transition: none; } }

/* halftone: one patch, top-right corner (behind the theme toggle), above the canvas */
.holo::before { content: ""; position: absolute; inset: 0 0 auto auto; z-index: 1;
  inline-size: var(--halftone-patch); block-size: var(--halftone-patch);
  background: var(--halftone-image); mask-image: var(--halftone-mask); }
/* grain: whole screen, topmost, static */
.holo::after { content: ""; position: absolute; inset: 0; z-index: 2;
  background: var(--grain-image) 0 0 / var(--grain-size); opacity: var(--grain-opacity); }

@media (forced-colors: active) { .holo { display: none; } }          /* system colors win */
@media (prefers-contrast: more) { .holo::after { display: none; } }  /* no grain */
@media print { .holo { display: none; } }

.credit { text-shadow: var(--text-halo); }  /* footer: text directly on the background */
```
- Orden de apilado en `.holo`: canvas (z auto) < halftone `::before` (z 1) < grano `::after` (z 2). Sin `z-index` el `::before` queda bajo el canvas (error de la primera versión).
- `contain: strict` exige tamaño definido: lo da `inset` + `block-size`.
- No poner `mix-blend-mode` ni `backdrop-filter` sobre el fondo; el único `backdrop-filter` de la app sigue siendo el panel de detalle.
- `forced-colors`: se oculta el fondo entero (canvas, halftone y grano); el texto usa colores de sistema sobre el color de lienzo.

### 12.6 Grano, halftone y pie (revisión)

- **Grano** (imágenes 2 y 6): ruido fractal SVG (`feTurbulence`, `baseFrequency 1.1`, 2 octavas): **más fino, más denso y de baja alpha** que antes (las motas dispersas se leían como rayitas). Matriz de color: alpha = 2.6·R − 0.95 (claro) / 2.2·R − 0.85 (oscuro); capa a `--grain-opacity: 0.22`. Tinte **claro en ambos temas**: blanco en el claro (nunca navy) y celeste pálido (`rgb(158 209 255)`) en el oscuro. `color-interpolation-filters='sRGB'` en el filtro para que el color indicado sea el pintado. Dos imágenes porque `light-dark()` no admite imágenes; los selectores de tema cambian `--grain-image`. `--grain-opacity` es un número plano (`light-dark()` solo admite colores).
- **Halftone** (imagen 6): rejilla al tresbolillo de 8 px en un **solo parche en la esquina superior derecha**, `--halftone-patch` = `min(40vmin, 24rem)` en móvil y `min(48vmin, 30rem)` desde 768 px, con máscara radial que llega a transparente al 60 %. Alpha del punto: 0.20 en claro y **0.28 en oscuro**. Está detrás del interruptor de tema y el título (logotipo) y se desvanece antes del bocadillo; **se movió desde la esquina inferior derecha** para sacarlo del pie (el pie centrado y, en móvil, a todo el ancho, quedaba bajo el parche).
- **Pie** (`.credit`): texto directamente sobre el fondo con `text-shadow: var(--text-halo)`, una placa suave del tono del fondo (`rgb(244 252 255 / .95)` en claro, `rgb(2 15 56 / .95)` en oscuro). Con el halo, el contraste junto al glifo es 9.21 (claro) / 14.31 (oscuro); sin él, sobre el peor fondo medido es 5.5 / 5.0 (§12.8).
- Grano y halftone **solo dentro de `.holo`**, nunca en plástico, vidrio, cajas ni cromo.

### 12.7 Título: bounce y profundidad

- **Bounce Knox** en el contenedor `.title-wrap`, nunca en `.title`: `translateY(0) → --title-bounce-distance (-8px) → 0`, `--dur-bob` (1.5 s), `--ease-in-out`, infinito. `--ease-in-out` pasa a ser **`cubic-bezier(0.42, 0, 0.58, 1)`** (el `ease-in-out` estándar de CSS, el mismo del Knox original; antes era `(.65,0,.35,1)`, más brusco). Sin escalonado por letra: el logo es una pieza. Reduced motion: `animation: none`.
- **Profundidad**: extrusión de 16 pasos de 0.01em (0.16em) con 4 `drop-shadow` encadenados de desfase 1, 2, 4 y 8 pasos (los colores Knox no cambian).
- **Contorno**: ya no son 4 pasadas duras (escalones en diagonal a DPR 2 con el contorno navy). Ahora **3 sombras sin desplazamiento y con un desenfoque de 0.6 del grosor** (`--knox-contour-width` = `max(1px, 0.015em)`): el contorno es redondo en todas las direcciones. Comprobado con capturas a DPR 2.
- **Contorno en oscuro**: `--knox-contour` pasa de `transparent` a `#020f38`. Las cintas del fondo oscuro son azules cercanos a la extrusión `#1a7cff`; sin contorno el título se funde con ellas. Comprobado sobre una cinta.

**Contrato del estado (para la fase 4, máquina de estados del narrador)**: `#app` lleva `data-state` con uno de `intro | typing | empty-input | thinking | results | no-results | error | detail`. Un único bloque pone el modo compacto: título, rebote y Chao.
```css
#app:is([data-state="results"], [data-state="no-results"], [data-state="error"], [data-state="detail"]) {
  --title-size: var(--text-2xl);
  --title-bounce-distance: var(--title-bounce-distance-compact);
  --chao-current: var(--chao-size-compact);
}
.title { font-size: var(--title-size); }          /* was var(--text-display) */
.narrator__chao { block-size: var(--chao-current); } /* was var(--chao-size) */
```
**Actualizado en la fase 4b (§14.3)**: el bloque compacto pasa a `#app[data-layout="compact"]` (en `screen.css`) y el layout compacto se queda una vez activado; `data-state` sigue siendo el estado lógico. El texto que sigue es el razonamiento original. `detail` entra porque el panel se abre sobre `results` y el título no debe saltar detrás del scrim. Los estados `typing`, `empty-input` y `thinking` salen de `intro` o de un estado compacto: **el atributo debe conservar la maquetación del estado previo** (si vienen de `results`, la máquina mantiene el modo compacto añadiendo `data-state` solo cuando cambia de maquetación y usando otro atributo, p. ej. `data-phase`, para el resto). Esto último lo cierra la fase 4; aquí solo se fija que **el selector compacto es uno solo** y cubre `results`, `no-results` y `error`.

```css
.title-wrap { display: grid; justify-items: center; will-change: transform;
  animation: title-bounce var(--dur-bob) var(--ease-in-out) infinite; }
@keyframes title-bounce { 0%, 100% { transform: translateY(0); }
                          50% { transform: translateY(var(--title-bounce-distance)); } }
@media (prefers-reduced-motion: reduce) { .title-wrap { animation: none; will-change: auto; } }
```
Si el FLIP del paso intro → results necesita transformar el título, hacerlo en un ancestro del `.title-wrap`.

### 12.8 Contraste sobre los peores frames del nuevo fondo

Medido con un script en Chrome real sobre el fondo WebGL **con grano y halftone**: 45 fases cada 333 ms (los 15 s) por tema, a 1440×900 y 390×844. Se toma el bloque 12×12 px (promedio, lo que ve un trazo de glifo) de peor luminosidad en toda la pantalla (y por separado en la franja de los 60 px inferiores, para el pie). Peor fondo: claro `#9ac8f2` (cian/cielo con pliegue), oscuro `#175db0`. Plástico = relleno + tinte compuestos sobre ese fondo. Se muestra el peor de escritorio y móvil.

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| text / fondo | 8.97 | 6.10 | 4.5 |
| text-muted / fondo | 5.40 | 5.01 | 4.5 |
| accent / fondo | 4.76 | 4.88 | 4.5 |
| text / plástico | 12.84 | 7.67 | 4.5 |
| text-muted / plástico | 7.73 | 6.30 | 4.5 |
| accent / plástico | 6.82 | 6.14 | 4.5 |
| text / plástico hover | 13.79 | 6.01 | 4.5 |
| text-muted / plástico hover | 8.30 | 4.94 | 4.5 |
| accent / plástico hover | 7.33 | 4.81 | 4.5 |
| text / vidrio (calculado) | 13.70 | 11.44 | 4.5 |
| border / fondo | 3.58 | 3.27 | 3 (UI) |
| focus / fondo | 4.76 | 3.27 | 3 (UI) |
| pie (muted) / franja inferior sin halo | 5.52 | 5.03 | 4.5 |
| pie (muted) / halo | 9.21 | 14.31 | 4.5 |

Todo pasa AA. Para lograrlo en oscuro hubo que **cambiar dos cosas**: (1) el cian oscuro del fondo bajó de `#1169c4` (peor fondo `#196fc6`, texto sobre plástico 3.2–4.2: no pasaba) a `#0e55ad`; (2) **el plástico oscuro pasa a tener una base navy**: `--plastic-fill` de `rgb(116 190 255 / .10)` a `rgb(8 32 95 / .38)` y `--plastic-fill-hover` de `rgb(116 190 255 / .16)` a `rgb(30 80 175 / .42)`. El plástico sigue siendo translúcido y conserva su brillo superior y su borde claro, pero ya no aclara el fondo: con las cintas más claras de la nueva técnica era la única forma de garantizar AA sin apagar el fondo. El claro no cambia. Límite conocido: en un único píxel de grano la luminosidad puntual sube un poco más que el promedio del bloque; un trazo de glifo promedia varios píxeles.

**Guarda (para no romper esto sin darse cuenta).** Los márgenes en oscuro son finos: accent / fondo 4.76–4.88, muted 5.01, accent / plástico hover 4.81 (mínimo 4.5). Reglas:
- El **núcleo oscuro del fondo se mantiene con luminosidad L ≤ 0.10** en el peor bloque (hoy el peor bloque es `#175db0`, L ≈ 0.11 en promedio con grano; `--holo-cyan` oscuro es `#0e55ad`). No aclarar `--holo-cyan`, `--holo-pearl`, `--holo-pink`, `--holo-ridge` oscuros ni subir `--grain-opacity`.
- **Cualquier cambio** en `--holo-pearl`, `-pink`, `-lilac`, `-cyan`, `-shade`, `-ridge`, `--grain-opacity` o el grano, el halftone, `--plastic-fill`/`-hover`/`-tint`, `--color-text*`, `--color-accent`, `--color-border` o `--color-focus`, **o en el shader**, obliga a repetir la medida del peor frame y a que pase.
- El script es `holo-contrast.mjs` (en esta sesión se llamó `worst2.mjs`); como el scratchpad no se conserva, va entero aquí: guardarlo como `scripts/holo-contrast.mjs` y ejecutarlo contra el servidor de desarrollo (`VERIFY_URL=http://localhost:5173 node scripts/holo-contrast.mjs`). Lee los colores de los tokens desde la página, así que se actualiza solo con `tokens.css`; sale con código 1 si algún par baja de su mínimo. Tarda unos minutos (45 fases × 4 combinaciones).

```js
// Worst-frame contrast of the WebGL background. Needs the DEV server (window.__holoSeek).
// Usage: VERIFY_URL=http://localhost:5173 node scripts/holo-contrast.mjs   (N=45 phases, BLK=12 px blocks)
// Token colors are read from the page, so it follows tokens.css by itself. Exit code 1 if any pair fails.
import { chromium } from 'playwright-core';

const URL = process.env.VERIFY_URL || 'http://localhost:5173';
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
    await page.goto(URL, { waitUntil: 'networkidle' });
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
```

### 12.9 Receta de verificación (determinista)

El fondo ya **no** se congela con `document.getAnimations()` (no es CSS). En **desarrollo** (`import.meta.env.DEV`, desaparece en producción):
- `?t=<ms>` en la URL pinta ese instante y **no arranca el bucle** (p. ej. `http://localhost:5173/?t=2500`).
- `window.__holoSeek(ms)` salta a un instante, pinta y sincroniza (`gl.finish()`), para capturar varios frames en la misma página.
- Los frames se deben capturar contra el **servidor de desarrollo** (`npm run dev`), no contra `npm run preview`: ahí no existen ni `?t=` ni `__holoSeek`.
- Instantes recomendados: 0, 2500, 5000, 7500, 9500, 10000, 12500 ms (sin `?t=` la página arranca en 9500, §12.1), en claro y oscuro, a 390 y 1440 px. Para las pruebas de contraste, 45 fases.
- Headless Chrome en Windows puede no tener GPU: lanzar con `args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']` (se usó para todas las medidas de este documento).
- El rebote del título **sí** se congela con `document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0 })`.
- Contraste del fondo: `scripts/holo-contrast.mjs` (§12.8).
- Confirmar que el canvas existe y no está `hidden` (`document.querySelector('canvas').hidden === false`) y que `getContext` no devolvió `null`.

### 12.10 Qué se reemplazó y por qué (honestidad)

La primera versión de la fase 2 usaba 5 capas CSS (cónico + 3 blobs radiales + una banda) animadas con `transform`. Se descartó porque (a) no puede formar pliegues: el revisor de diseño vio nubes pastel (claro) y tela plana (oscuro) frente a las cintas definidas de la ref.; (b) el revisor de código señaló ~240 MB de memoria de GPU estimada en escritorio con DPR 2 por las capas sobredimensionadas, `will-change` redundante, un `animation-direction: reverse` sin efecto en `blob-2` por simetría, y la frase errónea "frame 0 = composición estática". **Tokens eliminados**: `--holo-blob-1…3`, `--holo-sheen`, `--holo-sheen-opacity`, `--holo-bleed`, `--holo-drift`, `--holo-sway`, `--holo-zoom`, `--holo-extra-display`, `--dur-holo-fast`. **Tokens añadidos**: `--holo-pearl`, `--holo-pink`, `--holo-lilac`, `--holo-cyan`, `--holo-shade`, `--holo-ridge`, `--text-halo`, `--chao-current`, `--title-size`, `--chao-rim`, `--chao-contour`, `--chao-shadow`, `--chao-outline`. **Cambiados**: `--holo-sweep` (queda solo como respaldo), `--grain-image-light/-dark`, `--grain-opacity` (0.3 → 0.22), `--halftone-dot` (alpha), `--halftone-patch` (móvil 40vmin, escritorio 48vmin), `--halftone-mask` (esquina superior derecha), `--knox-contour` (oscuro) y `--knox-extrusion` (contorno suave), `--knox-contour-width` (0.015em), `--ease-in-out`, `--plastic-fill` y `--plastic-fill-hover` (oscuro). **Conservados**: `--holo-1…7`, `--holo-base` (el style tile y el respaldo los usan) y `--dur-holo` (la fase del shader).

### 12.11 Contorno de Chao (`--chao-outline`)

**Problema**: Chao es azul cian; cuando una cinta cian pasa por detrás pierde la separación figura/fondo (con una cinta cian detrás la silueta se funde). **Receta**: un único valor de `filter` en `tokens.css`, `--chao-outline`, que apila (de dentro a fuera) un **borde claro** de ~2 px (2 × `drop-shadow(0 0 .8px var(--chao-rim))`, blanco en claro y `#dffdff` en oscuro), un **contorno navy fino** (3 × `drop-shadow(0 0 1px var(--chao-contour))`, navy al 85 % en claro y navy profundo en oscuro) y una **sombra suave** (`drop-shadow(0 6px 8px var(--chao-shadow))`). El borde claro se lee sobre la seda oscura; el contorno navy, sobre cintas cian y perla; la sombra lo despega de ambas. Son sombras desenfocadas sin desplazamiento, así que el contorno es redondo en todas las direcciones.

**Desde la fase 4a (§13.3) el Chao son capas: el filtro va en cada `.chao__part` (ala, cuerpo y las 5 formas de la bola), no en ojos ni boca, y nunca en un envoltorio animado.** **Dónde se aplica: en TODA imagen de Chao**, con `filter: var(--chao-outline)` sobre el propio `<img>` (hoy `.narrator__chao`; igual en cualquier uso futuro: estados compactos, `thinking`, el detalle). El balanceo de `thinking` (`rotate`) debe ir en un **contenedor** del `<img>`, no en el `<img>`: igual que con el título, el filtro no se recalcula en cada frame. `--chao-current` ya cambia el tamaño; desde la fase 4a (rev. 3) el contorno y la sombra escalan con el alto del Chao (longitudes en `em`, §13.13).

**Verificación** (página de prueba con los tokens reales y `chao.webp`, a DPR 2; sin y con el filtro). Se buscó el peor caso midiendo, cada 500 ms, el color medio del fondo bajo la caja de Chao y su distancia al azul de Chao: peor en claro t ≈ 6500 ms (fondo medio `#a0d7f8`), y los de la revisión t = 5000 y t = 10000; en oscuro, t = 8000 (cinta azul). Frames revisados: **claro t = 5000, 6500 y 10000; oscuro t = 0 y 8000**. En todos se ve el borde claro junto al cuerpo y el contorno navy fuera; sobre la cinta cian (t = 6500) la silueta se separa claramente (sin filtro se fundía) y sobre la seda oscura el borde claro la dibuja. Alas rosas y pies amarillos conservan su borde.

### 12.12 Fase 4: el panel de detalle y el `backdrop-filter`

El panel de detalle usa `backdrop-filter: blur(var(--glass-blur))` sobre un canvas que cambia a ~30 fps: el desenfoque de 18 px del tamaño del panel se recalcularía en cada frame (caro, sobre todo en móvil). **Decisión: se pausa el fondo mientras el panel está abierto.** El gancho es el atributo `data-holo-paused` en `<html>` (ya implementado en `holo.ts`: `sync()` lo comprueba y el `MutationObserver` lo escucha). Lo pone y quita la fase 4 en el mismo sitio que abre y cierra el panel:
```ts
document.documentElement.toggleAttribute('data-holo-paused', open); // open: boolean
```
Por qué pausar y no aceptar el coste: detrás del panel hay un scrim (`--color-scrim`, 45–60 % opaco) y la pausa congela el último frame, que ya queda tapado por el scrim y el desenfoque; el coste real (blur por frame) se evita por completo. Al cerrar, el bucle reanuda sin salto (tiempo acumulado). Con reduced motion no hay bucle, así que el atributo no cambia nada.

## 13. Fase 4a: Chao animado por código

**Voz: decisión revertida (2026-10-05).** El 2026-10-03 la fase 4c se canceló ("sin voz"); el usuario la cambia en el pulido: el Chao **tipea** cada frase letra a letra con un blip sintetizado estilo Undertale (§17). No es TTS ni audio grabado. La boca sigue siendo el ciclo (`talk()`, `data-talking="cycle"`), ahora con la duración del tipeo. `voiceLevel()` y `data-talking="voice"` siguen **inactivos** (el blip no mueve la boca); donde abajo se habla de "voz" o "4c", es historia. Valores en `src/styles/tokens.css` (bloque "Phase 4a" y `@property --voice-level`). Todo se probó en un prototipo con los tokens reales, el fondo WebGL real y los assets finales (Chrome headless con SwiftShader). Esta sección sustituye a la línea "Chao entra… `--ease-spring`" de §10 (`intro`) y amplía §12.11. **Revisión 2** (tras design-reviewer y code-reviewer): bola de emociones en SVG, capas a 0.6×, poses estáticas distintas para cada mood, habla que cierra la boca, y las correcciones de código de §13.8. **Revisión 3**: `happy` con ojos cerrados "^ ^" y sonrisa abierta propia; contorno y sombra que escalan con el tamaño del Chao; sin el bloque de transiciones CSS (lo hace la mezcla WAAPI); arreglos de código a–h (§13.8, §13.14); nota de headroom para 4b (§13.15).

### 13.1 Decisión: capas cortadas + bola de emociones dibujada

Una sola imagen solo puede flotar, girar y estirarse entera: se lee como una pegatina que se mueve. Con capas el Chao **parpadea, mira, abre la boca, frunce el ceño**, y la bola y el ala tienen movimiento propio.

| Capa | Por qué | Cómo se sacó | Riesgo y resultado |
|---|---|---|---|
| Cuerpo | El resto | imagen menos bola y ala, con ojos y boca reconstruidos | — |
| Ala | Movimiento secundario | píxeles ni cian ni amarillos en la zona izquierda; solo el trozo principal | la parte tapada por la cabeza **no existe en el render**: al bajar el ala, su borde superior (antes oculto) queda a la vista. A −12° se ve limpio; a −18° aparecía un fragmento rayado (corregido el relleno, y la caída queda en **−12°**). Rosa del ala +25 % de saturación |
| Ojos (una capa) | Parpadeo y mirada | pupila + aro blanco, dilatado 6 px | piel reconstruida debajo (relleno armónico): sin costura al parpadear |
| Boca "v" | Abrir/cerrar, ceño | rojo oscuro, dilatado 5 px; hueco de 8 px | en la primera versión quedaban dos marcas en las comisuras al fundirse la "v"; ahora el hueco es 3 px más ancho y no queda nada (comprobado en `happy`, `sad`, `error` y al hablar) |
| **Bola de emociones** | Dice el mood de un vistazo, también sin movimiento | **dibujada en SVG** (no se corta del render), 5 formas | ver abajo |
| **Ojos de `happy`** (rev. 3) | Con la boca abierta pequeña y los ojos entornados al 82 %, `happy` parecía sorpresa o habla y se confundía con `error` | **dibujados en SVG**: dos arcos "^" del color de la pupila (`#0a3b51`) en el marco de la capa de ojos; en `happy` sustituyen a los ojos (opacidad) | al ocultar los ojos se ve la piel reconstruida, sin costura. Ojos cerrados sonrientes + sonrisa ancha = alegría sin ambigüedad, también a 58 px y sin la bola |

**Bola de emociones** (aprobada por el usuario). La bola amarilla se **transforma en el signo**, como las bolas de emoción de los Chao: la silueta entera es el mensaje, que es lo que se lee a 25–57 px. Forma por mood: `?` en `think`, corazón en `happy`, gota en `sad`, `!` en `error`, bola lisa en `idle`, `listen` y `enter` (para `listen` no se añade nota: con la inclinación y la mirada basta y una sexta forma no se distinguiría de la bola a 6 rem). Es dibujo propio derivado del personaje, sin assets de SEGA; el crédito del pie no cambia.
- Material: degradado radial amarillo con los colores medidos en la bola original (luz `#fffbe0` → `#fff64a` → `#fbeb0a` → sombra oliva `#c9b805`/`#8c8404`) y brillo especular desenfocado arriba a la izquierda, con la luz en el mismo punto para las 5 formas. El contorno es el mismo `--chao-outline` de las demás capas. **Honesto**: la bola lisa casa con el render; el `?` y el `!` son trazos con degradado y se ven algo más planos que el cuerpo 3D. Es lo más cercano sin modelar en 3D.
- Se lee en claro y oscuro, sobre la cinta cian (fondo congelado en el peor momento: claro t = 6500, oscuro t = 8000) y a 6 rem en 390@3 (§13.10).
- Cada forma es un archivo propio (`<img>`), no un SVG en línea: hay dos rigs en la página (héroe y lab) y los `id` de los degradados se duplicarían. Las 5 se cargan al principio (720 B de media cada una) y se apilan; el mood muestra una.
- Cambio de forma: la saliente se funde en `--dur-fast`; la entrante aparece de `scale(.6)` a 1 con `--ease-spring` en `--dur-base` (un pequeño "pop" con rebote, medido: llega a 1.03). Con reduce: cambio instantáneo.

Comprobación del corte: recompuestas, las capas difieren del original 1.04/255 por canal (compresión webp).

### 13.2 Assets (`public/character/`, marco 334×595)

**Tamaño: las capas se reducen a 0.6×** (marco 557×992 → 334×595). Medido a 12.5 rem (alto en pantalla 200 px): a DPR 2 el resultado es idéntico (percentil 99 del gradiente de borde 194.5 frente a 195.3; diferencia media de luminancia 3.7/255); a DPR 3 (600 px de alto, más que los 595 del marco) es apenas más suave (162 frente a 176) y no se distingue a 1:1 en la ampliación de la cara. Ventaja: −30 % de bytes (42 → 29.5 KB en las capas raster) y −64 % de memoria al decodificar. **No** abarata el rasterizado de los filtros (se hace al tamaño en pantalla, no al del archivo). Para 4× DPR no compensa servir el doble.

| Archivo | Tamaño | Peso | Posición dentro de `.chao` (% del marco 334×595) |
|---|---|---|---|
| `chao-body.webp` | 307×572 | 18.6 KB | left 6.8862 %, top 3.1933 %, ancho 91.9162 % |
| `chao-wing.webp` | 126×97 | 3.8 KB | left 1.1976 %, top 59.3277 %, ancho 37.7246 %; pivote `91% 59%` (raíz) |
| `chao-eyes.webp` | 166×95 | 5.3 KB | left 44.3114 %, top 46.0504 %, ancho 49.7006 % |
| `chao-mouth.webp` | 45×29 | 1.8 KB | left 67.6647 %, top 61.0084 %, ancho 13.4731 %, alto 4.8739 % (fondo CSS de `.chao__mouth::before`) |
| `chao-ball.svg` | 148×150 (viewBox) | 0.7 KB | caja `.chao__ball`: left 38.4201 %, top 0.7056 %, ancho 26.5709 % (la misma que la bola cortada: el layout no cambia) |
| `chao-ball-think.svg`, `-happy.svg`, `-sad.svg`, `-error.svg` | 148×150 | 0.7–0.8 KB | apiladas en la misma caja |
| `chao-eyes-happy.svg` (rev. 3) | 166×95 (viewBox) | 0.2 KB | misma caja que `chao-eyes.webp`: left 44.3114 %, top 46.0504 %, ancho 49.7006 % |

`chao-ball.webp` ya está borrado. `chao.webp` se conserva (respaldo y candidata a imagen OG). Scripts desechables en el scratchpad (playwright-core + canvas); no están en el proyecto.

### 13.3 Estructura y por qué

```html
<div class="chao" role="img" aria-label="{content.character.alt}">   <!-- no data-mood: hidden until playEnter()/setMood() -->
  <div class="chao__rig">                          <!-- talk: body stretch -->
    <div class="chao__pose">                       <!-- mood motion of the body; pivot at the feet -->
      <div class="chao__wing"><img class="chao__part" src="/character/chao-wing.webp" alt="" width="126" height="97"></div>
      <img class="chao__part chao__torso" src="/character/chao-body.webp" alt="" width="307" height="572">
      <img class="chao__eyes" src="/character/chao-eyes.webp" alt="" width="166" height="95">
      <img class="chao__eyes-happy" src="/character/chao-eyes-happy.svg" alt="" width="166" height="95">  <!-- closed "^ ^" eyes, shown in happy -->
      <span class="chao__mouth"></span>            <!-- ::before closed "v", ::after open mouth -->
    </div>
    <div class="chao__pose chao__pose--trail">     <!-- a copy of the body motion that carries the ball -->
      <div class="chao__ball">
        <img class="chao__part chao__glyph chao__glyph--ball"  src="/character/chao-ball.svg"       alt="" width="148" height="150">
        <img class="chao__part chao__glyph chao__glyph--think" src="/character/chao-ball-think.svg" alt="" width="148" height="150">
        <img class="chao__part chao__glyph chao__glyph--happy" src="/character/chao-ball-happy.svg" alt="" width="148" height="150">
        <img class="chao__part chao__glyph chao__glyph--sad"   src="/character/chao-ball-sad.svg"   alt="" width="148" height="150">
        <img class="chao__part chao__glyph chao__glyph--error" src="/character/chao-ball-error.svg" alt="" width="148" height="150">
      </div>
    </div>
  </div>
</div>
```
- `.chao` lleva `block-size: var(--chao-current)` (sustituye a `.narrator__chao` de §12.7) y el texto alternativo (`role="img"`); las capas, `alt=""`. Ninguna imagen lleva `loading="lazy"`.
- **Se crea sin `data-mood`** (`.chao:not([data-mood])` está oculto): así `playEnter()` no provoca una doble entrada, y el dueño decide si entra (`playEnter`) o aparece quieto (`setMood(chao, 'idle')`).
- **Propiedades individuales** (`translate`, `rotate`, `scale`): varias animaciones a la vez sobre el mismo elemento sin pisarse.
- **El contorno `--chao-outline` va en cada `.chao__part`** (ala, cuerpo, las 5 formas de la bola) y lo que se anima es el padre. Ojos y boca sin filtro.
- **La bola viaja en una copia del movimiento del cuerpo** (`.chao__pose--trail`): en moods lentos va `--chao-lag` (160 ms) detrás; en `enter` y `happy` va sincronizada y sube en cada aterrizaje (con retraso chocaba con la cabeza).
- **La bola ya no se aplasta**: `.chao__ball` aplica la escala inversa del cuerpo (estática `1 / --pose-sx`, y animaciones `chao-*-counter` con las mismas paradas y curvas que `chao-hop`, `chao-jump`, `chao-shrug`, `chao-droop`). Comprobado: el corazón sigue redondo en la anticipación y en el aterrizaje. Límite: el respirar del flotado (1.2 %) no se compensa, es invisible.

### 13.4 Contrato de estados (para la fase 4b)

JS pone `data-mood` en `.chao` (con `setMood`, nunca a mano) y, mientras habla, `data-talking`.

| Estado (SPEC §1.1) | `data-mood` | Bola | `data-talking` |
|---|---|---|---|
| `intro` | `enter` → al terminar, `idle` (`playEnter()`) | lisa | `cycle` mientras aparece "Hey! What kind of game are you looking for?" |
| `typing` | `listen` (se inclina hacia el input y lo mira) | lisa | `cycle` al cambiar el texto |
| `empty-input` | `listen` (sin cambio; la sacudida es del input) | lisa | `cycle` |
| `thinking` | `think` (párpados a medias, mirada arriba, balanceo) | `?` girando | `cycle` durante "Hmm…" |
| `results` | `happy` (salto, ojos cerrados "^ ^", sonrisa ancha) | corazón | `cycle` |
| `no-results` y fuera de tema | `sad` (encogerse, ceño) | gota | `cycle` |
| `error` | `error` (sacudida, ojos muy abiertos, boquita) | `!` mareado | `cycle` |
| `detail` | sin cambio; se congela con `data-holo-paused` | — | — |
| vuelta de `detail` | `idle` | lisa | `cycle` con "Want to look for something else?" |

`data-talking`: `cycle` = ciclo de boca mientras aparece cada frase (CSS); `voice` = inactivo (era para la fase 4c, cancelada). Sin atributo = boca cerrada.

**Transiciones entre moods (medido).** Chrome no hace transición al quitar una animación en bucle (el giro saltaba de 1.2° a 0). `setMood()` mezcla con WAAPI desde la pose actual durante `--chao-blend-dur` (260 ms; medido: 1.06° → 0.54° → 0.10° → 0). El flotado no se reinicia entre `idle`, `listen` y `think`.

**Repetir un mood** (segunda búsqueda con resultados): `getAnimations()` no devuelve animaciones terminadas, así que `setMood()` quita el atributo, fuerza un reflow y lo vuelve a poner. Medido: el salto se repite y la bola no parpadea (opacidad del glifo estable en los 5 frames siguientes).

### 13.5 Animaciones

Desplazamientos en % de la caja de cada parte. Pivote del cuerpo: los pies.

| Nombre | Elemento | Duración / curva | Qué hace |
|---|---|---|---|
| `chao-enter-x` | `.chao` | `--dur-enter` (1 s) | desde `--chao-enter-from` (−100vw: fuera de pantalla esté donde esté el rig) hasta 0 al 76 % |
| `chao-hop` (+ `chao-hop-counter` en la bola) | `.chao__pose` ×2 | `--dur-enter`; `--ease-rise` / `--ease-fall` | 3 saltos (16 %, 12.8 %, 8.8 % del alto), estirón al despegar, aplastado al tocar suelo, rebote final |
| `chao-ball-pop-enter` / `-jump` | `.chao__ball` | igual que el salto | la bola sube `--chao-ball-pop` en cada aterrizaje |
| `chao-float` | `.chao__pose` ×2 | `--chao-float-dur` 3.2 s, bucle | sube 2.5 % y respira 1.2 %; ×1.4 más lento en `sad`/`error` |
| `chao-flutter` / `chao-flap` | `.chao__wing` | 3.2 s bucle / 180 ms | dos aleteos y reposo / aleteo continuo |
| `chao-ball-bob` | `.chao__ball` | `--chao-ball-dur` 2.3 s | la bola flota a su ritmo |
| `chao-sway` | `.chao__pose` ×2 | `--chao-sway-dur` 2.2 s (dos paradas + `alternate`, `--ease-sway`) | ±4°. Periodo propio, a propósito distinto del rebote del título (1.5 s) y del flotado (3.2 s). La versión de 2 paradas difiere de la de 4 como mucho 0.32° (calculado sobre la curva entera) |
| `chao-orbit` | `.chao__ball` | 1.2 s lineal | elipse de radio 28 %: el `?` gira como un "cargando" |
| `chao-jump` (+ counter) | `.chao__pose` ×2 | `--chao-jump-dur` 820 ms | anticipación, estirón, salto de 22 %, aplastado, rebote |
| `chao-shrug` (+ counter) | `.chao__pose` ×2 | `--chao-shrug-dur` 700 ms | encoge y se hunde en la pose triste |
| `chao-jitter` + `chao-droop` (+ counter) | `.chao__pose` ×2 | 600 ms / 1 s | sacude la cabeza ±7° y después se hunde |
| `chao-daze` | `.chao__eyes` | 600 ms | mirada aturdida (siempre gana a un parpadeo) |
| `chao-orbit` (mareo) | `.chao__ball` | 450 ms ×2 | el `!` da dos vueltas anchas (40 %) |
| `chao-blink` | `.chao__eyes` | 150 ms | `scaleY(0.08)` y vuelve |
| `chao-talk` | `.chao__mouth` | `--chao-talk-dur` 900 ms | anima `--voice-level` (solo en la boca); los valles llegan a **0 o 0.15**: la boca se cierra de verdad entre sílabas |
| `chao-talk-body` | `.chao__rig` | 900 ms, en fase con `chao-talk` | el mismo patrón aplicado al cuerpo (`scale`) |

**Poses estáticas** (se distinguen sin movimiento y sin la bola): `idle` neutro; `listen` +5° y mirada abajo-derecha; `think` **párpados a medias** (`--chao-lid-half` 0.7), mirada arriba-izquierda, −2.5°; `happy` **ojos cerrados "^ ^"** y **sonrisa abierta ancha** (una "D" tumbada: más ancha que alta, borde inferior curvo, distinta de la boca de hablar; al hablar encima se abre un poco más, `scale` Y de 0.8 a 1.1); `sad` ancho y bajo, ojos entornados, **ceño**, bola un poco más baja (`--chao-ball-sink` 4 %: sigue flotando separada), ala caída −12°; `error` **ojos muy abiertos** (`--chao-eyes-wide` 1.08) y **boquita abierta** (`--chao-gasp`), inclinado al otro lado. `listen` sigue siendo el más cercano a `idle` (§13.10).

**Hablar.** `--voice-level` (0..1, registrado con `@property`) vive **solo en `.chao__mouth`**: por encima de 0.06 la "v" se cambia por la boca abierta en un fundido casi de corte (`× 40`: completo a 0.085, sin "v" fantasma). La boca usa `max(var(--voice-level, 0), --mouth-base)`; el `0` de respaldo hace que en navegadores sin `@property` (Firefox 120–127, Safari < 16.4) la boca quede cerrada. El cuerpo se estira con `chao-talk-body` (sin audio) o con un `scale` en línea que pone `voiceLevel()` (con audio). **Medido**: animar la propiedad heredada en `.chao__rig` volvía a calcular el estilo de todo el rig en cada frame (recálculo de estilo 16–19 % del hilo principal); en la boca sola baja a 3–7 %.

### 13.6 Reduced motion

- Todas las animaciones y transiciones del Chao están dentro de `@media (prefers-reduced-motion: no-preference)`. Con `reduce`: sin bucles, sin parpadeo, sin ciclo de habla, sin mezcla WAAPI, sin "pop" de la bola.
- La entrada es solo un fundido (`chao-fade-in`, 200 ms).
- **El mood se lee por la pose estática y la forma de la bola** (hojas de poses, §13.10).
- (Inactivo: con voz y `reduce`, `voiceLevel()` dejaba el cuerpo quieto y solo abría la boca. Sin voz en el producto.)

### 13.7 CSS verbatim (`src/styles/chao.css`, importado después de `tokens.css`)

Los números sueltos (0.06, 40, 0.55, 0.15, los % de posición y de los fotogramas) son geometría de la imagen y forma de las curvas, no tokens.

```css
/* ===== Chao rig: layers, poses, motion (DESIGN.md §13). Tokens only. ===== */

/* ---- Structure: one frame of 334 x 595; every part is placed in % of that frame ---- */
.chao {
  position: relative;
  flex: none;
  block-size: var(--chao-current);
  aspect-ratio: 334 / 595;
  font-size: var(--chao-current); /* 1em = the Chao's height: the drop shadow in --chao-outline scales with it */
  /* pose = idle; moods override these (static, also under reduced motion) */
  --pose-tilt: 0deg;
  --pose-sx: 1;
  --pose-sy: 1;
  --gaze-x: 0%;
  --gaze-y: 0%;
  --eye-open: 1;
  --ball-x: 0%;
  --ball-y: 0%;
  --wing-rot: 0deg;
  --mouth-base: 0;
  --mouth-flip: 1;
  --lag: 0ms;
}
.chao:not([data-mood]) { visibility: hidden; } /* created without a mood: hidden until playEnter() or setMood() */

.chao__rig,
.chao__pose {
  position: absolute;
  inset: 0;
  transform-origin: 50% 100%; /* feet: squash, stretch and lean pivot on the ground */
}

/* talking stretch: chao-talk-body (no audio) or an inline scale set by voiceLevel() (audio). --voice-level lives
   on .chao__mouth only: animating an inherited property on the rig re-styled the whole rig every frame (measured). */
.chao__rig { will-change: transform; } /* measured: "transform" (not "scale") keeps Chrome from re-rastering the filtered parts at every talk frame */

.chao__pose {
  rotate: var(--pose-tilt);
  scale: var(--pose-sx) var(--pose-sy);
}

.chao__pose--trail { --lag: var(--chao-lag); } /* the ball's copy of the body motion, a beat late (slow moods) */

.chao__part { display: block; inline-size: 100%; block-size: auto; filter: var(--chao-outline); }

.chao__wing { position: absolute; left: 1.1976%; top: 59.3277%; inline-size: 37.7246%; transform-origin: 91% 59%; rotate: var(--wing-rot); }
.chao__torso { position: absolute; left: 6.8862%; top: 3.1933%; inline-size: 91.9162%; }
.chao__eyes { position: absolute; left: 44.3114%; top: 46.0504%; inline-size: 49.7006%; block-size: auto;
  translate: var(--gaze-x) var(--gaze-y); scale: 1 var(--eye-open); }
.chao__eyes-happy { position: absolute; left: 44.3114%; top: 46.0504%; inline-size: 49.7006%; block-size: auto; opacity: 0; } /* closed "^ ^" eyes */

/* emotion ball: 5 glyph images stacked; the mood shows one. The ball counter-scales the body's squash so it stays round. */
.chao__ball {
  position: absolute; left: 38.4201%; top: 0.7056%; inline-size: 26.5709%; aspect-ratio: 148 / 150;
  translate: var(--ball-x) var(--ball-y);
  scale: calc(1 / var(--pose-sx)) calc(1 / var(--pose-sy));
}
.chao__glyph { position: absolute; inset: 0; block-size: 100%; opacity: 0; scale: 0.6; }
.chao:not([data-mood="think"], [data-mood="happy"], [data-mood="sad"], [data-mood="error"]) .chao__glyph--ball,
.chao[data-mood="think"] .chao__glyph--think,
.chao[data-mood="happy"] .chao__glyph--happy,
.chao[data-mood="sad"] .chao__glyph--sad,
.chao[data-mood="error"] .chao__glyph--error { opacity: 1; scale: 1; }

.chao__mouth {
  position: absolute; left: 67.6647%; top: 61.0084%; inline-size: 13.4731%; block-size: 4.8739%;
  --open: max(var(--voice-level, 0), var(--mouth-base));
  --open-alpha: clamp(0, (var(--open) - 0.06) * 40, 1); /* nearly a cut: no ghost "v" */
}
.chao__mouth::before { /* the closed "v" smile, cut from the render */
  content: ""; position: absolute; inset: 0;
  background: url("/character/chao-mouth.webp") 0 0 / 100% 100%;
  scale: 1 var(--mouth-flip); /* -1 turns the smile into a frown */
  opacity: calc(1 - var(--open-alpha));
}
.chao__mouth::before,
.chao__mouth::after { will-change: opacity, scale; } /* measured: without it the talk cycle drops frames at 1440 */
.chao__mouth::after { /* open mouth: flat top, round bottom, tongue */
  content: ""; position: absolute; left: 9.8%; top: 16.2%; inline-size: 80%; block-size: 92.8%;
  border-radius: 35% 35% 50% 50% / 20% 20% 80% 80%;
  background: radial-gradient(60% 45% at 50% 88%, var(--chao-tongue) 0 60%, transparent 64%), var(--chao-mouth-fill);
  transform-origin: 50% 20%;
  scale: calc(0.55 + 0.45 * var(--open)) calc(0.15 + 0.85 * var(--open));
  opacity: var(--open-alpha);
}

/* ---- Moods: static poses (each one readable without motion and without the ball) ---- */
.chao[data-mood="listen"] { --pose-tilt: var(--chao-lean); --gaze-x: var(--chao-gaze); --gaze-y: var(--chao-gaze); }
.chao[data-mood="think"] {
  --pose-tilt: calc(var(--chao-lean) * -0.5);
  --gaze-x: calc(var(--chao-gaze) * -1); --gaze-y: calc(var(--chao-gaze) * -1.5);
  --eye-open: var(--chao-lid-half);
  --ball-y: calc(var(--chao-ball-lift) * -1);
}
.chao[data-mood="happy"] {
  --mouth-base: var(--chao-grin);
  --ball-y: calc(var(--chao-ball-lift) * -1); --wing-rot: calc(var(--chao-wing-droop) * -0.5);
}
.chao[data-mood="happy"] .chao__eyes { opacity: 0; }       /* happy = closed, smiling eyes ... */
.chao[data-mood="happy"] .chao__eyes-happy { opacity: 1; }
.chao[data-mood="happy"] .chao__mouth::after {            /* ... and a wide open smile: a "D" on its back, wider than the talking mouth */
  left: -8%; top: 18%; inline-size: 116%; block-size: 76%;
  border-radius: 8% 8% 50% 50% / 12% 12% 88% 88%;
  scale: 1 calc(0.8 + 0.3 * var(--voice-level, 0));        /* talking over the smile opens it a little more */
}
.chao:is([data-mood="sad"], [data-mood="error"]) {
  --pose-sx: calc(1 + var(--chao-droop)); --pose-sy: calc(1 - var(--chao-droop));
  --pose-tilt: calc(var(--chao-lean) * -0.5);
  --gaze-y: calc(var(--chao-gaze) * 1.5); --eye-open: var(--chao-squint);
  --ball-y: var(--chao-ball-sink); --wing-rot: var(--chao-wing-droop);
  --mouth-flip: -1;
}
.chao[data-mood="error"] { /* startled, not sad: eyes wide, small open mouth */
  --pose-tilt: calc(var(--chao-lean) * 0.5);
  --eye-open: var(--chao-eyes-wide); --mouth-base: var(--chao-gasp); --mouth-flip: 1;
  --ball-x: var(--chao-ball-lift); --ball-y: 0%;
}

/* ---- Motion: only when the user has not asked for less ---- */
@media (prefers-reduced-motion: no-preference) {
  /* pose changes are blended by setMood() (WAAPI); a CSS transition on the same properties measured identical and added a 0.1deg wobble */
  .chao__glyph { transition: opacity var(--dur-fast) var(--ease-out), scale var(--dur-base) var(--ease-spring); } /* glyph pop */
  .chao__eyes-happy { transition: opacity var(--dur-fast) var(--ease-out); }

  /* enter: travel on .chao, three hops on the body, ball pops up on each landing, wings flapping */
  .chao[data-mood="enter"] { animation: chao-enter-x var(--dur-enter) linear both; }
  .chao[data-mood="enter"] .chao__pose { animation: chao-hop var(--dur-enter) linear var(--lag) both; }
  .chao[data-mood="enter"] .chao__wing { animation: chao-flap var(--chao-flap-dur) var(--ease-in-out) infinite; }
  .chao[data-mood="enter"] .chao__ball {
    animation:
      chao-ball-pop-enter var(--dur-enter) linear both,
      chao-hop-counter var(--dur-enter) linear var(--lag) both;
  }
  /* fast one-shots: the ball rides in sync (a late ball would hit the head on the way up) and pops up on each landing instead */
  .chao:is([data-mood="enter"], [data-mood="happy"]) .chao__pose--trail { --lag: 0ms; }

  /* idle / listen: float + breathe; wing flutters now and then; ball bobs on its own beat */
  .chao:is([data-mood="idle"], [data-mood="listen"]) .chao__pose {
    animation: chao-float var(--chao-float-dur) var(--ease-in-out) var(--lag) infinite;
  }
  .chao:is([data-mood="idle"], [data-mood="listen"], [data-mood="think"]) .chao__wing {
    animation: chao-flutter var(--chao-float-dur) linear infinite;
  }
  .chao:is([data-mood="idle"], [data-mood="listen"]) .chao__ball {
    animation: chao-ball-bob var(--chao-ball-dur) var(--ease-in-out) infinite;
  }

  /* think: float + sway (own period, not the title's); the "?" circles like a loading dot */
  .chao[data-mood="think"] .chao__pose {
    animation:
      chao-float var(--chao-float-dur) var(--ease-in-out) var(--lag) infinite,
      chao-sway calc(var(--chao-sway-dur) / 2) var(--ease-sway) calc(var(--lag) - var(--chao-sway-dur) / 4) infinite alternate;
  }
  .chao[data-mood="think"] .chao__ball { animation: chao-orbit var(--chao-orbit-dur) linear infinite; }

  /* happy: anticipation, jump, land, then float; wings beat during the jump */
  .chao[data-mood="happy"] .chao__pose {
    animation:
      chao-jump var(--chao-jump-dur) linear var(--lag) backwards,
      chao-float var(--chao-float-dur) var(--ease-in-out) calc(var(--lag) + var(--chao-jump-dur)) infinite;
  }
  .chao[data-mood="happy"] .chao__wing {
    animation:
      chao-flap var(--chao-flap-dur) var(--ease-in-out) 4,
      chao-flutter var(--chao-float-dur) linear var(--chao-jump-dur) infinite;
  }
  .chao[data-mood="happy"] .chao__ball {
    animation:
      chao-ball-pop-jump var(--chao-jump-dur) linear backwards,
      chao-jump-counter var(--chao-jump-dur) linear var(--lag) backwards,
      chao-ball-bob var(--chao-ball-dur) var(--ease-in-out) var(--chao-jump-dur) infinite;
  }

  /* sad (no-results, off-topic): shrug, sink, slow float */
  .chao[data-mood="sad"] .chao__pose {
    animation:
      chao-shrug var(--chao-shrug-dur) linear var(--lag) backwards,
      chao-float calc(var(--chao-float-dur) * 1.4) var(--ease-in-out) calc(var(--lag) + var(--chao-shrug-dur)) infinite;
  }
  .chao[data-mood="sad"] .chao__ball { animation: chao-shrug-counter var(--chao-shrug-dur) linear var(--lag) backwards; }

  /* error: head shake + dazed eyes + dizzy "!", then droop, slow float */
  .chao[data-mood="error"] .chao__pose {
    animation:
      chao-jitter var(--chao-jitter-dur) linear var(--lag),
      chao-droop var(--chao-error-dur) var(--ease-out) var(--lag) backwards,
      chao-float calc(var(--chao-float-dur) * 1.4) var(--ease-in-out) calc(var(--lag) + var(--chao-error-dur)) infinite;
  }
  .chao[data-mood="error"] .chao__ball {
    --chao-orbit-r: var(--chao-dizzy-r);
    animation:
      chao-orbit var(--chao-dizzy-dur) linear 2,
      chao-droop-counter var(--chao-error-dur) var(--ease-out) var(--lag) backwards;
  }

  /* blink: blink() toggles [data-blink]; startBlink() removes it on animationend */
  .chao[data-blink] .chao__eyes { animation: chao-blink var(--chao-blink-dur) var(--ease-in-out); }
  /* the error daze always wins over a blink (same or higher specificity, declared later) */
  .chao[data-mood="error"] .chao__eyes,
  .chao[data-mood="error"][data-blink] .chao__eyes { animation: chao-daze var(--chao-jitter-dur) linear; }

  /* talking without audio: the body stretch and the mouth run the same syllable pattern, in sync */
  .chao[data-talking="cycle"] .chao__rig { animation: chao-talk-body var(--chao-talk-dur) linear infinite; }
  .chao[data-talking="cycle"] .chao__mouth { animation: chao-talk var(--chao-talk-dur) linear infinite; }
}

@media (prefers-reduced-motion: reduce) {
  .chao[data-mood="enter"] { animation: chao-fade-in var(--dur-enter) var(--ease-out) both; }
}

/* detail panel open: freeze the Chao with the background */
:root[data-holo-paused] .chao,
:root[data-holo-paused] .chao * { animation-play-state: paused; }

/* ---- Keyframes ---- */
@keyframes chao-enter-x {
  0% { translate: var(--chao-enter-from) 0; animation-timing-function: cubic-bezier(0.3, 0.5, 0.5, 1); }
  76%, 100% { translate: 0 0; }
}

@keyframes chao-hop {
  0% { translate: 0 0; scale: calc(1 - var(--chao-squash) * 0.6) calc(1 + var(--chao-squash) * 0.8); animation-timing-function: var(--ease-rise); }
  12% { translate: 0 var(--chao-hop-y); scale: 1 1; animation-timing-function: var(--ease-fall); }
  24% { translate: 0 0; scale: calc(1 + var(--chao-squash) * 0.7) calc(1 - var(--chao-squash) * 0.7); animation-timing-function: var(--ease-out); }
  28% { translate: 0 0; scale: calc(1 - var(--chao-squash) * 0.6) calc(1 + var(--chao-squash) * 0.8); animation-timing-function: var(--ease-rise); }
  40% { translate: 0 calc(var(--chao-hop-y) * 0.8); scale: 1 1; animation-timing-function: var(--ease-fall); }
  52% { translate: 0 0; scale: calc(1 + var(--chao-squash) * 0.7) calc(1 - var(--chao-squash) * 0.7); animation-timing-function: var(--ease-out); }
  56% { translate: 0 0; scale: calc(1 - var(--chao-squash) * 0.5) calc(1 + var(--chao-squash) * 0.6); animation-timing-function: var(--ease-rise); }
  66% { translate: 0 calc(var(--chao-hop-y) * 0.55); scale: 1 1; animation-timing-function: var(--ease-fall); }
  76% { translate: 0 0; scale: calc(1 + var(--chao-squash)) calc(1 - var(--chao-squash)); animation-timing-function: var(--ease-out); }
  87% { translate: 0 0; scale: calc(1 - var(--chao-squash) * 0.35) calc(1 + var(--chao-squash) * 0.4); animation-timing-function: var(--ease-in-out); }
  100% { translate: 0 0; scale: var(--pose-sx) var(--pose-sy); }
}

@keyframes chao-float {
  0%, 100% { translate: 0 0; scale: var(--pose-sx) var(--pose-sy); }
  50% {
    translate: 0 var(--chao-float-y);
    scale: calc(var(--pose-sx) * (1 - var(--chao-breathe))) calc(var(--pose-sy) * (1 + var(--chao-breathe)));
  }
}

@keyframes chao-sway { /* 2 stops + alternate; --ease-sway fits the old 4-stop curve within 0.32° */
  from { rotate: calc(var(--pose-tilt) - var(--chao-sway)); }
  to { rotate: calc(var(--pose-tilt) + var(--chao-sway)); }
}

@keyframes chao-jump {
  0% { translate: 0 0; scale: var(--pose-sx) var(--pose-sy); animation-timing-function: var(--ease-out); }
  16% { translate: 0 0; scale: calc(1 + var(--chao-squash)) calc(1 - var(--chao-squash)); animation-timing-function: var(--ease-in); }
  26% { translate: 0 calc(var(--chao-jump-y) * 0.35); scale: calc(1 - var(--chao-squash) * 0.8) calc(1 + var(--chao-squash)); animation-timing-function: var(--ease-rise); }
  46% { translate: 0 var(--chao-jump-y); scale: 1 1; animation-timing-function: var(--ease-fall); }
  64% { translate: 0 0; scale: calc(1 - var(--chao-squash) * 0.4) calc(1 + var(--chao-squash) * 0.5); animation-timing-function: var(--ease-out); }
  72% { translate: 0 0; scale: calc(1 + var(--chao-squash)) calc(1 - var(--chao-squash)); animation-timing-function: var(--ease-in-out); }
  86% { translate: 0 0; scale: calc(1 - var(--chao-squash) * 0.3) calc(1 + var(--chao-squash) * 0.3); animation-timing-function: var(--ease-in-out); }
  100% { translate: 0 0; scale: var(--pose-sx) var(--pose-sy); }
}

@keyframes chao-shrug {
  0% { translate: 0 0; scale: 1 1; animation-timing-function: var(--ease-out); }
  28% { translate: 0 var(--chao-shrug-y); scale: calc(1 - var(--chao-droop)) calc(1 + var(--chao-droop) * 1.5); animation-timing-function: linear; }
  42% { translate: 0 var(--chao-shrug-y); scale: calc(1 - var(--chao-droop)) calc(1 + var(--chao-droop) * 1.5); animation-timing-function: var(--ease-in-out); }
  100% { translate: 0 0; scale: var(--pose-sx) var(--pose-sy); }
}

@keyframes chao-jitter {
  0% { rotate: var(--pose-tilt); }
  10% { rotate: var(--chao-jitter); }
  22% { rotate: calc(var(--chao-jitter) * -0.85); }
  34% { rotate: calc(var(--chao-jitter) * 0.7); }
  46% { rotate: calc(var(--chao-jitter) * -0.55); }
  58% { rotate: calc(var(--chao-jitter) * 0.35); }
  70% { rotate: calc(var(--chao-jitter) * -0.2); }
  100% { rotate: var(--pose-tilt); }
}

@keyframes chao-droop { /* hold upright while the head shakes, then sink into the pose */
  0%, 60% { scale: 1 1; }
  100% { scale: var(--pose-sx) var(--pose-sy); }
}

/* Counter-scales for the ball: the inverse of each body squash, same stops and curves, so the ball stays round */
@keyframes chao-hop-counter {
  0% { scale: calc(1 / (1 - var(--chao-squash) * 0.6)) calc(1 / (1 + var(--chao-squash) * 0.8)); animation-timing-function: var(--ease-rise); }
  12% { scale: 1 1; animation-timing-function: var(--ease-fall); }
  24% { scale: calc(1 / (1 + var(--chao-squash) * 0.7)) calc(1 / (1 - var(--chao-squash) * 0.7)); animation-timing-function: var(--ease-out); }
  28% { scale: calc(1 / (1 - var(--chao-squash) * 0.6)) calc(1 / (1 + var(--chao-squash) * 0.8)); animation-timing-function: var(--ease-rise); }
  40% { scale: 1 1; animation-timing-function: var(--ease-fall); }
  52% { scale: calc(1 / (1 + var(--chao-squash) * 0.7)) calc(1 / (1 - var(--chao-squash) * 0.7)); animation-timing-function: var(--ease-out); }
  56% { scale: calc(1 / (1 - var(--chao-squash) * 0.5)) calc(1 / (1 + var(--chao-squash) * 0.6)); animation-timing-function: var(--ease-rise); }
  66% { scale: 1 1; animation-timing-function: var(--ease-fall); }
  76% { scale: calc(1 / (1 + var(--chao-squash))) calc(1 / (1 - var(--chao-squash))); animation-timing-function: var(--ease-out); }
  87% { scale: calc(1 / (1 - var(--chao-squash) * 0.35)) calc(1 / (1 + var(--chao-squash) * 0.4)); animation-timing-function: var(--ease-in-out); }
  100% { scale: calc(1 / var(--pose-sx)) calc(1 / var(--pose-sy)); }
}

@keyframes chao-jump-counter {
  0% { scale: calc(1 / var(--pose-sx)) calc(1 / var(--pose-sy)); animation-timing-function: var(--ease-out); }
  16% { scale: calc(1 / (1 + var(--chao-squash))) calc(1 / (1 - var(--chao-squash))); animation-timing-function: var(--ease-in); }
  26% { scale: calc(1 / (1 - var(--chao-squash) * 0.8)) calc(1 / (1 + var(--chao-squash))); animation-timing-function: var(--ease-rise); }
  46% { scale: 1 1; animation-timing-function: var(--ease-fall); }
  64% { scale: calc(1 / (1 - var(--chao-squash) * 0.4)) calc(1 / (1 + var(--chao-squash) * 0.5)); animation-timing-function: var(--ease-out); }
  72% { scale: calc(1 / (1 + var(--chao-squash))) calc(1 / (1 - var(--chao-squash))); animation-timing-function: var(--ease-in-out); }
  86% { scale: calc(1 / (1 - var(--chao-squash) * 0.3)) calc(1 / (1 + var(--chao-squash) * 0.3)); animation-timing-function: var(--ease-in-out); }
  100% { scale: calc(1 / var(--pose-sx)) calc(1 / var(--pose-sy)); }
}

@keyframes chao-shrug-counter {
  0% { scale: 1 1; animation-timing-function: var(--ease-out); }
  28% { scale: calc(1 / (1 - var(--chao-droop))) calc(1 / (1 + var(--chao-droop) * 1.5)); animation-timing-function: linear; }
  42% { scale: calc(1 / (1 - var(--chao-droop))) calc(1 / (1 + var(--chao-droop) * 1.5)); animation-timing-function: var(--ease-in-out); }
  100% { scale: calc(1 / var(--pose-sx)) calc(1 / var(--pose-sy)); }
}

@keyframes chao-droop-counter {
  0%, 60% { scale: 1 1; }
  100% { scale: calc(1 / var(--pose-sx)) calc(1 / var(--pose-sy)); }
}

@keyframes chao-daze {
  0%, 100% { translate: var(--gaze-x) var(--gaze-y); }
  15% { translate: calc(var(--chao-gaze) * -1.5) 0; }
  35% { translate: calc(var(--chao-gaze) * 1.5) 0; }
  55% { translate: calc(var(--chao-gaze) * -1) 0; }
  75% { translate: var(--chao-gaze) 0; }
}

@keyframes chao-blink { 50% { scale: 1 var(--chao-blink-closed); } }

@keyframes chao-flap {
  0%, 100% { rotate: var(--wing-rot); }
  50% { rotate: calc(var(--wing-rot) + var(--chao-flap)); }
}

@keyframes chao-flutter { /* two quick beats, then rest */
  0%, 22%, 100% { rotate: var(--wing-rot); }
  5% { rotate: calc(var(--wing-rot) + var(--chao-flap)); }
  10% { rotate: calc(var(--wing-rot) - var(--chao-flap) * 0.3); }
  15% { rotate: calc(var(--wing-rot) + var(--chao-flap) * 0.7); }
}

@keyframes chao-ball-bob {
  0%, 100% { translate: var(--ball-x) var(--ball-y); }
  50% { translate: var(--ball-x) calc(var(--ball-y) + var(--chao-ball-bob)); }
}

@keyframes chao-ball-pop-enter { /* landings at 24 %, 52 %, 76 % of chao-hop */
  0%, 22%, 36%, 50%, 64%, 74%, 100% { translate: var(--ball-x) var(--ball-y); }
  29% { translate: var(--ball-x) calc(var(--ball-y) + var(--chao-ball-pop)); }
  57% { translate: var(--ball-x) calc(var(--ball-y) + var(--chao-ball-pop)); }
  82% { translate: var(--ball-x) calc(var(--ball-y) + var(--chao-ball-pop) * 1.3); }
  92% { translate: var(--ball-x) calc(var(--ball-y) - var(--chao-ball-pop) * 0.2); }
}

@keyframes chao-ball-pop-jump { /* landing at 64-72 % of chao-jump */
  0%, 64%, 100% { translate: var(--ball-x) var(--ball-y); }
  76% { translate: var(--ball-x) calc(var(--ball-y) + var(--chao-ball-pop) * 1.3); }
  88% { translate: var(--ball-x) calc(var(--ball-y) - var(--chao-ball-pop) * 0.2); }
}

@keyframes chao-orbit { /* 8 points on an ellipse (1 : 0.5) around the ball's pose */
  0%, 100% { translate: calc(var(--ball-x) + var(--chao-orbit-r)) var(--ball-y); }
  12.5% { translate: calc(var(--ball-x) + var(--chao-orbit-r) * 0.707) calc(var(--ball-y) + var(--chao-orbit-r) * 0.354); }
  25% { translate: var(--ball-x) calc(var(--ball-y) + var(--chao-orbit-r) * 0.5); }
  37.5% { translate: calc(var(--ball-x) - var(--chao-orbit-r) * 0.707) calc(var(--ball-y) + var(--chao-orbit-r) * 0.354); }
  50% { translate: calc(var(--ball-x) - var(--chao-orbit-r)) var(--ball-y); }
  62.5% { translate: calc(var(--ball-x) - var(--chao-orbit-r) * 0.707) calc(var(--ball-y) - var(--chao-orbit-r) * 0.354); }
  75% { translate: var(--ball-x) calc(var(--ball-y) - var(--chao-orbit-r) * 0.5); }
  87.5% { translate: calc(var(--ball-x) + var(--chao-orbit-r) * 0.707) calc(var(--ball-y) - var(--chao-orbit-r) * 0.354); }
}

@keyframes chao-talk { /* valleys reach 0 or 0.15: the mouth really closes between syllables */
  0%, 100% { --voice-level: 0; }
  10% { --voice-level: 0.9; }
  20% { --voice-level: 0; }
  32% { --voice-level: 0.7; }
  42% { --voice-level: 0.15; }
  55% { --voice-level: 1; }
  66% { --voice-level: 0; }
  78% { --voice-level: 0.8; }
  90% { --voice-level: 0; }
}

@keyframes chao-talk-body { /* = chao-talk applied to the body: scale (1 - squash * L, 1 + stretch * L) */
  0%, 20%, 66%, 90%, 100% { scale: 1 1; }
  10% { scale: calc(1 - var(--chao-talk-squash) * 0.9) calc(1 + var(--chao-talk-stretch) * 0.9); }
  32% { scale: calc(1 - var(--chao-talk-squash) * 0.7) calc(1 + var(--chao-talk-stretch) * 0.7); }
  42% { scale: calc(1 - var(--chao-talk-squash) * 0.15) calc(1 + var(--chao-talk-stretch) * 0.15); }
  55% { scale: calc(1 - var(--chao-talk-squash)) calc(1 + var(--chao-talk-stretch)); }
  78% { scale: calc(1 - var(--chao-talk-squash) * 0.8) calc(1 + var(--chao-talk-stretch) * 0.8); }
}

@keyframes chao-fade-in { from { opacity: 0; } }
```

### 13.8 JS verbatim (`src/sections/chao.ts`)

Cambios frente a la versión 1 (code-reviewer): `MOODS` exportado; `blink()` exportado y `data-blink` retirado en `animationend`; el parpadeo nunca anula el mareo de `error` (también en CSS); `playEnter()` con carrera de 1.5 s contra `decode()`, solo la última llamada cambia a `idle` y solo si sigue en `enter`; temporizador de habla por rig (`WeakMap`) y final suave; `time()` entiende `s` y `ms`; `voiceLevel()` recorta a 0..1, trata `NaN` como 0 y salta la banda de fundido; `startBlink()` se para solo si el rig sale del DOM; constantes con nombre; curva de las mezclas = token `--ease-out`; `window.__chao` tipado. **Rev. 3**: `playEnter()` solo espera a las imágenes visibles al entrar (las precargadas: cuerpo, ala, ojos, bola lisa) y limpia el temporizador de la carrera; `setMood()` no mezcla si no había mood previo y retira `data-blink` al entrar en `error`; `stopTalking()` cancela el temporizador de `talk()`; `playEnter` está en `window.__chao`. **Fase 4b (rev. 2)**: `time()` y `easeOut()` locales se sustituyen por `time` y `ease` de `src/lib/tokens.ts` (un solo lector de tokens para todo el cliente, §14.8).

```ts
// Chao rig hooks (DESIGN.md §13). The markup is chaoRig() in chao-rig.ts (§13.3).
import { ease, time } from '../lib/tokens';

export const MOODS = ['enter', 'idle', 'listen', 'think', 'happy', 'sad', 'error'] as const;
export type Mood = (typeof MOODS)[number];

const PARTS = '.chao__pose, .chao__wing, .chao__eyes, .chao__ball';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const DECODE_TIMEOUT_MS = 1500; // a stalled image must never block the intro
const ENTER_SAFETY_MS = 300; // after --dur-enter, force the end (background tab, no animation)
const BLINK_FIRST_MS = 1800;
const BLINK_DOUBLE_MS = 260; // 20 % of blinks come in pairs
const BLINK_DOUBLE_ODDS = 0.2;
const BLINK_MIN_MS = 2200;
const BLINK_SPREAD_MS = 3800;
const TALK_MS_PER_CHAR = 55;
const TALK_MIN_MS = 700;
const TALK_MAX_MS = 2800;
const VOICE_FLOOR = 0.1; // below: mouth shut; the v/open cross-fade band (0.06-0.085) is never held
const VOICE_MIN_OPEN = 0.15;

/** Runs `change`, then blends every part from where it was to where the new state puts it
 *  (Chrome does not transition out of a removed CSS loop: without this, poses jump). */
function blendAround(chao: HTMLElement, change: () => void): void {
  const parts = [...chao.querySelectorAll<HTMLElement>(PARTS)];
  const from = parts.map((p) => {
    const cs = getComputedStyle(p);
    return { translate: cs.translate, rotate: cs.rotate, scale: cs.scale };
  });
  change();
  if (reduce.matches) return;
  const options = { duration: time('--chao-blend-dur', 260, chao), easing: ease('--ease-out', 'ease-out', chao) };
  parts.forEach((p, i) => p.animate([from[i], {}], options));
}

/** Switches mood; the same mood again replays its one-shots (finished animations are not in getAnimations()). */
export function setMood(chao: HTMLElement, mood: Mood): void {
  const prev = chao.dataset.mood;
  const change = () => {
    if (mood === 'error') chao.removeAttribute('data-blink'); // a pending blink would replay when leaving error
    if (prev === mood) {
      chao.removeAttribute('data-mood');
      void chao.offsetWidth;
    }
    chao.dataset.mood = mood;
  };
  if (prev) blendAround(chao, change);
  else change(); // first mood: nothing to blend from
}

const enterCalls = new WeakMap<HTMLElement, number>();

/** Entrance (intro). Resolves when Chao has landed (or faded in); only the latest call switches to idle. */
export async function playEnter(chao: HTMLElement): Promise<void> {
  const call = (enterCalls.get(chao) ?? 0) + 1;
  enterCalls.set(chao, call);
  // only what is visible on entry (the preloaded layers); the other ball glyphs and the happy eyes load later
  const visible = chao.querySelectorAll<HTMLImageElement>('img:not(.chao__glyph, .chao__eyes-happy), .chao__glyph--ball');
  let timeout = 0;
  await Promise.race([
    Promise.all([...visible].map((i) => i.decode().catch(() => undefined))),
    new Promise((r) => { timeout = window.setTimeout(r, DECODE_TIMEOUT_MS); }),
  ]);
  clearTimeout(timeout);
  if (enterCalls.get(chao) !== call) return; // a newer call took over
  return new Promise((done) => {
    let timer = 0;
    const finish = () => {
      chao.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
      if (enterCalls.get(chao) === call && chao.dataset.mood === 'enter') setMood(chao, 'idle');
      done();
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === chao) finish(); // chao-enter-x, or chao-fade-in under reduced motion
    };
    chao.addEventListener('animationend', onEnd);
    timer = window.setTimeout(finish, time('--dur-enter', 1000, chao) + ENTER_SAFETY_MS);
    setMood(chao, 'enter');
  });
}

/** One blink now (no-op under reduced motion or while the error daze plays). */
export function blink(chao: HTMLElement): void {
  if (reduce.matches || chao.dataset.mood === 'error') return;
  chao.removeAttribute('data-blink');
  void chao.offsetWidth;
  chao.setAttribute('data-blink', '');
}

/** Random blinks. Call ONCE per rig, from its owner, and keep the stop function. Stops by itself when the rig leaves the DOM. */
export function startBlink(chao: HTMLElement): () => void {
  let id = 0;
  const onEnd = (e: AnimationEvent) => {
    if (e.animationName === 'chao-blink') chao.removeAttribute('data-blink');
  };
  const stop = () => {
    clearTimeout(id);
    chao.removeEventListener('animationend', onEnd);
  };
  const tick = () => {
    if (!chao.isConnected) return stop();
    const paused = document.hidden || document.documentElement.hasAttribute('data-holo-paused');
    if (!paused && chao.dataset.mood !== 'enter') blink(chao);
    const wait = Math.random() < BLINK_DOUBLE_ODDS ? BLINK_DOUBLE_MS : BLINK_MIN_MS + Math.random() * BLINK_SPREAD_MS;
    id = window.setTimeout(tick, wait);
  };
  chao.addEventListener('animationend', onEnd);
  id = window.setTimeout(tick, BLINK_FIRST_MS);
  return stop;
}

const talkTimers = new WeakMap<HTMLElement, number>();
const rigOf = (chao: HTMLElement) => chao.querySelector<HTMLElement>('.chao__rig')!;
const mouthOf = (chao: HTMLElement) => chao.querySelector<HTMLElement>('.chao__mouth')!;

/** Ends talking without a jump: body scale and mouth ease back (otherwise the body shrinks ~6 % in one frame). */
function stopTalking(chao: HTMLElement): void {
  clearTimeout(talkTimers.get(chao));
  const rig = rigOf(chao), mouth = mouthOf(chao);
  const scale = getComputedStyle(rig).scale;
  const level = getComputedStyle(mouth).getPropertyValue('--voice-level').trim() || '0';
  delete chao.dataset.talking;
  rig.style.removeProperty('scale');
  mouth.style.removeProperty('--voice-level');
  if (reduce.matches) return;
  const options = { duration: time('--dur-fast', 160, chao), easing: ease('--ease-out', 'ease-out', chao) };
  rig.animate([{ scale }, {}], options);
  mouth.animate([{ '--voice-level': level }, { '--voice-level': '0' }], options);
}

/** No-audio talking while the bubble shows `text` (55 ms per character, 0.7-2.8 s). */
export function talk(chao: HTMLElement, text: string): void {
  if (chao.dataset.talking === 'voice') return; // real audio drives the mouth (phase 4c)
  clearTimeout(talkTimers.get(chao));
  chao.dataset.talking = 'cycle';
  const ms = Math.min(TALK_MAX_MS, Math.max(TALK_MIN_MS, text.length * TALK_MS_PER_CHAR));
  talkTimers.set(chao, window.setTimeout(() => {
    if (chao.dataset.talking === 'cycle') stopTalking(chao);
  }, ms));
}

/** Phase 4c: call every animation frame with the smoothed audio level; null when the clip ends. */
export function voiceLevel(chao: HTMLElement, level: number | null): void {
  if (level === null) return stopTalking(chao);
  clearTimeout(talkTimers.get(chao));
  let v = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  if (v < VOICE_FLOOR) v = 0;
  else if (v < VOICE_MIN_OPEN) v = VOICE_MIN_OPEN;
  chao.dataset.talking = 'voice';
  const rig = rigOf(chao), cs = getComputedStyle(rig);
  const k = v * (parseFloat(cs.getPropertyValue('--motion-scale')) || 0); // 0 under reduced motion: only the mouth moves
  const squash = parseFloat(cs.getPropertyValue('--chao-talk-squash')) || 0;
  const stretch = parseFloat(cs.getPropertyValue('--chao-talk-stretch')) || 0;
  rig.style.scale = `${1 - squash * k} ${1 + stretch * k}`; // inline scale: no inherited property re-styling the whole rig
  mouthOf(chao).style.setProperty('--voice-level', v.toFixed(3));
}

declare global {
  interface Window {
    /** DEV only (set by main.ts): drive the lab rig from tests. */
    __chao?: { el: HTMLElement; setMood: typeof setMood; playEnter: typeof playEnter; talk: typeof talk; voiceLevel: typeof voiceLevel; blink: typeof blink };
  }
}
```

(Fase 4c cancelada: `voiceLevel()` no se usa en el producto. Los comentarios del código que mencionan la fase 4c son históricos.)

### 13.9 Rendimiento (medido)

Chrome headless con SwiftShader (rasterizado por CPU), fondo WebGL vivo, 4 s de `requestAnimationFrame`, hilo principal por CDP. **Medida final (rev. 3, CSS de §13.7)**, con la máquina de nuevo a 60 fps en la línea base:

| Caso | 1440×900 DPR 1 | 390×844 DPR 3 |
|---|---|---|
| Sin Chao (base) | p50 16.7, p95 16.8, 0 frames > 33 ms; hilo principal 2.8 % | p50 16.7, p95 16.8, 0; 2.4 % |
| `think` + hablar | p50 16.7, p95 16.7, **0 frames > 33 ms**; 12.7 % (estilo 5.6 %) | p50 16.7, p95 16.8, 0; 14.6 % (estilo 7.3 %) |
| `happy` + hablar | p50 16.7, p95 16.7, 0; 11.0 % | p50 16.7, p95 16.8, 0; 16.6 % |

Hallazgos que fijan la receta (medidos en la tanda 2, con la máquina lenta, comparando contra su propia línea base):
1. **`will-change: transform` (no `scale`) en `.chao__rig`.** Con `will-change: scale`, cada frame de habla Chrome volvía a rasterizar las capas con filtro a la nueva escala (27–58 frames en 4 s, picos de 300–600 ms); con `transform`, igual que la base. Quitar los filtros también lo arreglaba: era eso.
2. **`--voice-level` solo en la boca**: recálculo de estilo de 16–19 % a 3–7 % del hilo principal.
3. **Sin transiciones CSS en las partes** (rev. 3): la curva de `idle → listen` (giro y mirada) y de `happy → sad` (escala de la bola) es la misma con y sin el bloque `transition`, porque la mezcla WAAPI de `setMood()` ya hace el trabajo; con las dos juntas aparecía un vaivén de 0.1° (4.999° → 4.91° → 5°). Se borra. Quedan solo las transiciones de opacidad de las formas de la bola y de los ojos de `happy` (la mezcla no las cubre).
- `will-change: opacity, scale` en las pseudo de la boca se mantiene (tanda 1: sin él, 8–13 frames perdidos).
- Las 5 formas SVG no influyen (probado ocultándolas o cambiándolas por raster).
- Hilo principal 11–17 % con `think`/`happy` + hablar frente a 2–3 % de la base, sin perder frames. En una GPU real los filtros cuestan mucho menos; confirmarlo en la fase 7 con un portátil real.

### 13.10 Revisión de las hojas de contacto (honesta)

Hojas: poses estáticas con `reduce` a 12.5 rem (1440@2, claro sobre la cinta cian t = 6500 y oscuro t = 8000) y a 6 rem (390@3, claro t = 6500); salto, habla y error animados.

Se lee bien:
- **Bola de emociones**: `?`, corazón, gota y `!` se reconocen en claro, en oscuro, sobre la cinta cian y a 6 rem. Es la mejora más grande para leer el mood.
- **Poses sin bola**: `think` (párpados a medias) y `error` (ojos muy abiertos y boquita) ya no se confunden con `idle` y `sad`; `sad` (ceño) sigue claro. **Rev. 3**: `happy` (ojos "^ ^" + sonrisa ancha) se lee como alegría a 200, 96 y 58 px, en claro y oscuro, y no se parece a `error` (ojos redondos muy abiertos + boquita). Hablando encima sigue siendo una sonrisa (hoja `talkhappy`).
- **Contorno a tamaño pequeño** (rev. 3): a 96 y 58 px el halo azul marino ancho desapareció (comparado lado a lado con la versión anterior); el borde sigue separando la figura de la cinta cian.
- **Salto**: la bola-corazón sigue redonda durante la anticipación y el aterrizaje.
- **Habla**: la boca se cierra del todo a 180 y 600 ms (la "v" limpia, sin marcas en las comisuras) y se abre en las sílabas.
- **Cambio de forma**: "pop" con rebote, sin parpadeo al repetir mood.

Sigue flojo:
1. `listen` frente a `idle`: solo cambian la inclinación y la mirada; a 6 rem casi iguales. El bocadillo lo dice.
2. El `?` y el `!` son algo más planos que el cuerpo 3D (trazos con degradado) y algo más finos que la bola lisa.
3. A −12° el borde superior del ala (antes tapado por la cabeza) muestra un hilo azulado de 1 px a tamaño natural; en pantalla (≤ 0.36×) no se ve.
4. La boca sigue siendo diminuta en móvil; el habla se nota sobre todo por el estiramiento.
5. Sin brazos: no hay saludo.

### 13.11 Verificación (para el tester)

- **Ganchos solo en DEV** (`main.ts`, bajo `import.meta.env.DEV`): `?mood=<mood>` (lab), `?noblink`, `window.__chao = { el, setMood, playEnter, talk, voiceLevel, blink }`. Fondo congelado con `?t=9500`.
- **Esperar a que la página pinte** (~1.5 s tras `networkidle` con SwiftShader: el primer shader tarda en compilar y, mientras, las animaciones WAAPI quedan `pending`) antes de medir tiempos.
- **Congelar un instante**: para un one-shot, primero `__chao.setMood(el, mood)` (lo reinicia aunque ya estuviera), después `document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; })`. A `t = 0` pueden verse dos formas de bola a la vez: son las transiciones del glifo congeladas en su arranque (en tiempo real no ocurre, medido); capturar desde `t ≥ 16`.
- **Instantes**: `enter` 200, 280, 400, 560, 760, 870, 1000; `happy` 60, 130, 210, 380, 590, 640, 820; `think` 0, 550, 1100, 1650; `sad` 0, 300, 700, 1500; `error` 100, 225, 350, 600, 1500; parpadeo 0, 40, 75, 110, 150; habla 0, 90, 180, 290, 380, 500, 600, 700.
- **Qué afirmar**:
  - Sin `data-mood`, `.chao` tiene `visibility: hidden`.
  - Entrada: a 0 ms el borde derecho de `.chao` ≤ 0; al terminar, `data-mood="idle"`; con dos llamadas seguidas a `playEnter`, solo la última pasa a `idle` (una vez).
  - `happy` a 377 ms: `translate` de `.chao__pose` ≈ `0px -22%`; la caja de `.chao__ball` mantiene la proporción 148:150 (±2 %) a 130 y 590 ms.
  - `happy`: opacidad de `.chao__eyes` 0 y de `.chao__eyes-happy` 1; el `::after` de la boca es más ancho que alto (ancho:alto ≥ 2.5 a 12.5 rem). En los demás moods, `.chao__eyes-happy` a opacidad 0.
  - Contorno: a 58 px (`--chao-current: 3.6rem`) el `filter` de `.chao__part` lleva sombra `0 ~1.7px ~2.3px` y desenfoques de 0.4/0.5 px; a 200 px, 0.8/1/6/8 px.
  - Al pasar a `error` con un parpadeo pendiente, `data-blink` se retira.
  - Primer `setMood` (sin mood previo): no crea animaciones WAAPI de mezcla.
  - Formas: la opacidad del glifo del mood es 1 y la del resto 0 (`think` → `--think`, `happy` → `--happy`, `sad` → `--sad`, `error` → `--error`, el resto → `--ball`).
  - Parpadeo a 75 ms: `scale` de `.chao__eyes` ≈ `1 0.08`; tras 200 ms, `data-blink` ya no está (con `startBlink` activo).
  - Error y parpadeo: con `data-blink` presente y `data-mood="error"`, la animación de `.chao__eyes` es `chao-daze`.
  - Habla: con `data-talking="cycle"`, `--voice-level` de `.chao__mouth` es 0 a 180 y 600 ms (y la opacidad de `::after` es 0), ≈ 0.9 a 90 ms.
  - `voiceLevel`: 0.05 → 0, 0.12 → 0.15, `NaN` → 0, 2 → 1 (leer `--voice-level` en `.chao__mouth`); `voiceLevel(el, null)` devuelve el `scale` de `.chao__rig` a `none` en ~160 ms sin salto (a 80 ms, valor intermedio).
  - Mezcla: en `think`, `setMood('idle')` baja el `rotate` de `.chao__pose` de forma gradual en ~260 ms.
  - Reduced motion: en la entrada solo `chao-fade-in`; después, ninguna animación en el subárbol; `sad` → `scale` de `.chao__mouth::before` = `1 -1`; `error` → `scale` de `.chao__eyes` = `1 1.08`; `think` → `1 0.7`.
  - Con `data-holo-paused` en `<html>`, todas las animaciones del Chao en `paused`.
  - Rendimiento: `think` + hablar a 1440 y 390@3: p95 de frame igual a la línea base sin Chao de la misma tanda (SwiftShader).
  - Las 9 imágenes cargan (sin 404); ninguna con `loading="lazy"`.

### 13.12 Chao lab (sección del style tile, andamiaje)

Para revisar y capturar cada mood. Desde la fase 4b vive en `src/dev/lab.ts` y se abre con `?lab` (solo DEV, §14.8). Es andamiaje: lo que sigue solo aplica al lab.
- Encabezado "Chao lab". El escenario del lab (`.chao-lab__stage`) lleva `aria-hidden="true"`: el rig del héroe ya anuncia al Chao y un segundo `role="img"` sería ruido.
- Fila "Mood" (`role="group"`, `aria-label` = `lab.moods`): Enter, Idle, Listen, Think, Happy, Sad, Error (botones de plástico, §5, ≥ 44 px). Enter → `playEnter`; los demás → `setMood`. El activo lleva `aria-pressed="true"`.
- Otra fila, **fuera del grupo Mood**: toggle "Talk" (`aria-pressed`; encendido → `data-talking="cycle"`, apagado → `voiceLevel(chao, null)` para el final suave) y botón "Blink" → `blink(chao)`.
- (Deslizador "Voice level": retirado en la fase 4b, sin voz.)
- Casilla "Compact size": pone `--chao-current: var(--chao-size-compact)` en el escenario.
- El lab llama a `setMood(chao, 'idle')` al crearse y a `startBlink(chao)` una vez (salvo `?noblink`).

### 13.13 Tokens nuevos y cambiados

- **Nuevos (rev. 1)**: `@property --voice-level`; `--chao-lag`, `--chao-float-dur`, `--chao-float-y`, `--chao-breathe`, `--chao-ball-dur`, `--chao-ball-bob`, `--chao-ball-pop`, `--chao-ball-lift`, `--chao-orbit-dur`, `--chao-orbit-r`, `--chao-dizzy-dur`, `--chao-dizzy-r`, `--chao-sway`, `--chao-lean`, `--chao-gaze`, `--chao-squint`, `--chao-grin`, `--chao-droop`, `--chao-wing-droop`, `--chao-flap`, `--chao-flap-dur`, `--chao-hop-y`, `--chao-jump-y`, `--chao-jump-dur`, `--chao-squash`, `--chao-shrug-dur`, `--chao-shrug-y`, `--chao-jitter`, `--chao-jitter-dur`, `--chao-error-dur`, `--chao-blink-dur`, `--chao-blink-closed`, `--chao-talk-dur`, `--chao-talk-stretch`, `--chao-talk-squash`, `--chao-blend-dur`, `--chao-enter-from`, `--chao-mouth-fill`, `--chao-tongue`, `--ease-rise`, `--ease-fall`.
- **Nuevos (rev. 2)**: `--chao-sway-dur` (2.2 s), `--ease-sway` (`cubic-bezier(0.84, 0, 0.16, 1)`), `--chao-lid-half` (0.7), `--chao-eyes-wide` (1.08), `--chao-gasp` (0.35), `--chao-ball-sink` (4 %).
- **Cambiados (rev. 2)**: `--chao-wing-droop` −18° → −12°; `--chao-enter-from` `calc(-50vw - 100%)` → `-100vw`. Eliminado del CSS: `--pose-y` (siempre 0).
- **Rev. 3**: `--chao-outline` pasa a longitudes en `em` (1em = alto del Chao; `.chao` pone `font-size: var(--chao-current)`): sombra `0 0.03em 0.04em` (6/8 px a 200 px, 2.9/3.8 a 96, 1.7/2.3 a 58) y desenfoques nuevos `--chao-rim-blur: max(0.4px, 0.004em)` y `--chao-contour-blur: max(0.5px, 0.005em)` (iguales que antes a 200 px; más finos en pequeño, con un mínimo para no perder el borde). `--chao-squint` ya solo lo usa `sad`. Como la escala va por `em` y `--chao-current` cambia con `#app[data-state=…]`, el modo compacto escala el contorno solo.
- **Cambiado (rev. 1)**: `--dur-enter` 900 → 1000 ms (intro 1000 + 260 + 260 = 1.52 s ≤ 1.6 s).
- `--chao-mouth-fill`, `--chao-tongue` y los amarillos de la bola (dentro de los SVG) son colores del personaje: no son texto, no aplica contraste. Ningún token de texto o fondo cambia: §8 sigue valiendo.

### 13.14 Ediciones para el frontend-engineer (fuera de `chao.css`/`chao.ts`)

`index.html` (en `<head>`, después del preload de la fuente):
```html
<link rel="preload" as="image" href="/character/chao-body.webp" fetchpriority="high" />
<link rel="preload" as="image" href="/character/chao-eyes.webp" fetchpriority="high" />
<link rel="preload" as="image" href="/character/chao-wing.webp" fetchpriority="high" />
<link rel="preload" as="image" href="/character/chao-ball.svg" fetchpriority="high" />
```
(La boca es fondo CSS y carga con la hoja; las otras 4 formas, sin preload: no se ven al entrar.)

`src/main.ts`:
1. Importar `import { MOODS, blink, playEnter, setMood, startBlink, talk, voiceLevel, type Mood } from './sections/chao';` (sin alias `talkTo`: el botón local del lab se llama `talkBtn`) y borrar la lista local `moods` (usar `MOODS`; comprobar el `?mood=` con `(MOODS as readonly string[]).includes(q)`).
2. `chaoRig()`: sin parámetro, **sin `data-mood`**, **sin `startBlink`**; tamaños nuevos de §13.3 (`body 307×572`, `wing 126×97`, `eyes 166×95`); **añadir `<img class="chao__eyes-happy" src="/character/chao-eyes-happy.svg" alt="" width="166" height="95">` justo después de los ojos**; la bola son los 5 `<img class="chao__part chao__glyph chao__glyph--X">` de §13.3 (148×150).
3. Rig del héroe (style tile): `const hero = chaoRig(); setMood(hero, 'idle'); startBlink(hero);` (en 4b lo sustituye `playEnter` dentro del módulo del narrador, que guarda la función de parada).
4. Lab: rig con `setMood(chao, 'idle')` y `startBlink(chao)` (salvo `?noblink`); botón Blink → `blink(chao)`; botón Talk renombrado `talkBtn`, apagado → `voiceLevel(chao, null)`; Talk y Blink en una fila propia fuera del `role="group"`; `aria-hidden="true"` en `.chao-lab__stage`; tras `await playEnter(chao)` en `pick('enter')`, marcar con `press(chao.dataset.mood as Mood)` (no `press('idle')`: si otro mood llegó durante la entrada, el botón mentiría); `window.__chao = { el: chao, setMood, playEnter, talk, voiceLevel, blink }` sin cast (el tipo está en `chao.ts`).
5. (`chao-ball.webp` ya está borrado.)
6. `index.html`: sin cambios en los preloads (los ojos de `happy` no se ven al entrar y `playEnter()` no los espera).

### 13.15 Notas para la fase 4b (headroom)

- **El salto de `happy` necesita espacio arriba.** El salto sube el 22 % del alto del Chao y la bola-corazón va encima: a 1440 px, en el pico del salto, el corazón roza el título (le faltan ~8 px). En 4b, con `data-state="results"` (layout compacto: Chao a `--chao-size-compact`, título a `--text-2xl`), comprobar en el pico del salto (`currentTime` = 377 ms) que queda hueco entre el corazón y el título, a 1440 y a 390.
- Regla para el layout del narrador: reservar encima del Chao un margen libre de **≥ 0.25 × `--chao-current`** (salto del 22 % + rebote de la bola), sin `overflow: hidden` en el narrador ni en sus ancestros (recortaría el salto y la bola).
- La entrada (`-100vw`) llega desde fuera de la pantalla por la izquierda: ningún ancestro del Chao debe recortarla con `overflow` (el `body` puede usar `overflow-x: clip` para no crear scroll horizontal).

## 14. Fase 4b: pantalla única con narrador y máquina de estados

Cierra SPEC §1.1 y US1–US3, US6, US7 (sin la fila de juegos, que es la fase 5, ni el panel, que es la fase 6). Tokens nuevos en `tokens.css` (bloque "Phase 4b"). Todo el código de esta sección se probó en un prototipo con los archivos reales del proyecto (tokens, `chao.css`, `chao.ts`, fondo WebGL), en Chrome headless a 1440, 390@3 y 844×390@3 (móvil apaisado), claro y oscuro, con y sin reduced motion: los 8 estados, 9 desenlaces simulados, 0 errores de consola, sin scroll horizontal. `tsc` sin errores y `vite build` limpio (el modo simulado, el lab y los avisos de desarrollo no llegan al bundle de producción). **Revisión 2** (tras tester, design-reviewer y code-reviewer): Chao compacto mayor en teléfonos, solo el texto del bocadillo se funde, cambio de frase por temporizador, arreglo del "pop" de la intro, apaisado, `scrollbar-gutter`, hueco de la fila mínimo, cola del bocadillo, pulido y correcciones de código (§14.12).

~~**Sin voz** (decisión del usuario, 2026-10-03)~~: **revertido el 2026-10-05**. Ahora cada frase se tipea con blips y hay un botón de silencio junto al de tema: ver §17, que sustituye a este párrafo y al cambio de texto con fundido de entrada de §14.4.

### 14.1 Estructura de la página

```
#app  (data-state = estado lógico · data-layout = full | compact)
├─ header.top-bar ............ solo el interruptor de tema, arriba a la derecha
├─ main.screen ............... grid de 3 filas
│   ├─ .screen__stage ........ fila 2: el grupo que sube
│   │   ├─ .screen__title > .title-wrap > h1.title   (el único h1)
│   │   ├─ .narrator ......... Chao + p.bubble#narrator-line (aria-live="polite", aria-atomic) > span.bubble__text
│   │   └─ form.feeling[role=search] ... label oculto + input#feeling + button[type=submit]
│   └─ .shelf ................ fila 3: sitio reservado para la fila de juegos (fase 5); vacío y aria-hidden
└─ footer.credit ............. crédito obligatorio (Chao © SEGA… · RAWG)
```

```
INTRO / TYPING / THINKING (layout full)          RESULTS / NO-RESULTS / ERROR (layout compact)
┌──────────────────────────────────── [◐] ┐      ┌──────────────────────────────── [◐] ┐
│                                          │      │          Game Feelings (2xl)         │
│        GAME  FEELINGS  (display)         │      │   (o)  ╭ Ooh, co-op adv... ╮         │
│                                          │      │   /█\ ◤╰───────────────────╯         │
│     (o)    ╭ Hey! What kind of ... ╮     │      │   [ co-op adventure...] [Find games] │
│     /█\   ◤╰──────────────────────╯     │      │ ┌──────────────────────────────────┐ │
│   [ A co-op adventure for ] [Find games] │      │ │  shelf: fila de juegos (fase 5)  │ │
│                                          │      │ └──────────────────────────────────┘ │
│        Chao © SEGA … · Game data by RAWG │      │  Chao © SEGA … · Game data by RAWG   │
└──────────────────────────────────────────┘      └──────────────────────────────────────┘
```
- **Centrado óptico**: filas `1fr auto 1.22fr` ponen el centro del grupo al ~45 % del alto (DESIGN §10). En compacto, `0 auto 1fr`: el grupo arriba y la fila de juegos debajo.
- **Todo centrado**, el texto del bocadillo alineado a la izquierda. El bocadillo reserva líneas (`min-block-size` en `lh`) y centra una línea sola, así que los mensajes cambian de largo sin mover el input ni el grupo: **2 líneas** en escritorio, en compacto y en pantallas bajas; **3** en teléfono en layout full y en teléfonos estrechos (< 375 px) en compacto. Medido con las 15 frases: a 390 y 1440 ninguna pasa de lo reservado; a 360 cinco frases necesitan 3 líneas en compacto (de ahí la regla de < 375 px) y a 320 "error" llega a 4 (crece; ver §14.11).
- **Cola del bocadillo** (rev. 2): una cuña en el borde izquierdo, abajo, que apunta abajo-izquierda hacia el Chao. Son dos capas recortadas con `clip-path` **fuera de la caja** (borde claro y, 1 px dentro, el relleno de plástico): el plástico es translúcido y una cola superpuesta a la caja se vería más opaca donde se solapan. La caja conserva su esquina de 6 px hacia el Chao. Funciona igual en full, compacto y apaisado (la cola vive en el hueco entre Chao y bocadillo). Límite honesto: no lleva el brillo interior ni el degradado del plástico (es un triángulo plano de `--plastic-fill`); a su tamaño (14 px) no se nota.
- **Formulario**: input + botón "Find games" en fila; en teléfonos (`< 30rem`) en columna: el input usa todo el ancho (el placeholder cabe entero) y el botón es un objetivo a todo el ancho. Ambos de 48 px de alto (≥ 44).
- **Botón principal**: pastilla de acento (`--color-accent` con brillo superior `--accent-gloss` que termina en `--accent-gloss-stop`, por encima de la etiqueta; texto `--color-on-accent`; `--shadow-plastic`); hover = glow en `::after`; press = `--press-scale`; ocupado = `--disabled-opacity`. Lleva las dos etiquetas ("Find games" / "Thinking…") en la misma celda de grid: no cambia de ancho al cambiar de texto.
- **Pie**: en el flujo, al final (no `position: fixed`, que taparía la fila de juegos en móvil), con `text-wrap: balance`. El enlace RAWG tiene 44 px de alto de zona táctil (padding vertical en línea, compensado con margen negativo: la línea no se mueve).
- **Headroom** (§13.15): `.narrator` reserva arriba `--chao-headroom` (0.25) × `--chao-current`. Medido en el pico del salto de `happy` (377 ms), en compacto: el corazón queda **22 px** (1440) y **49 px** (390, con el Chao de 77 px) por debajo del título. Ningún ancestro lleva `overflow: hidden`.
- **Chao compacto en teléfonos** (rev. 2): `--chao-size-compact` = 0.8 × `--chao-size` por debajo de 30rem (77 px en vez de 58): en `sad`/`error` ya no pierde la cara. En escritorio sigue a 0.6.
- **Pantallas bajas** (`max-height: 30rem`, p. ej. móvil apaisado 844×390): título a `--text-2xl`, Chao a su tamaño compacto, huecos menores. Medido a 844×390: el formulario termina a 294 px (cabe todo sin scroll) en intro y en resultados.
- **Scroll** (rev. 3): sin `scrollbar-gutter` (dejaba una franja sin fondo y rompía el tamaño del canvas; no hay scroll en compacto a 390×844 ni 1440×900, así que no hace falta). `--shelf-block` se eliminó en la fase 5 (§15.2): la fila de juegos tiene altura propia.
- **Entrada sin scroll horizontal**: `body { overflow-x: clip }` (no crea contenedor de scroll); `scrollWidth ≤ innerWidth` durante la entrada en 1440 y 390.

### 14.2 Estados, mood y foco

| Estado | Cuándo | Layout | Mood (§13.4) | Bocadillo | Formulario | Foco (puntero fino) |
|---|---|---|---|---|---|---|
| `intro` | al cargar | full | `enter` → `idle` | intro | oculto hasta que aparece el bocadillo | al input cuando aparece |
| `typing` | primer carácter imprimible desde cualquier estado que no sea `typing`/`thinking` | se mantiene | `listen` | typing | — | se queda |
| `empty-input` | Enter / botón sin nada imprimible (misma regla que el servidor: `/[^\p{Cc}\p{Cf}\p{Z}]/u`) | se mantiene | `listen` | emptyInput | sacudida corta + `aria-invalid="true"` (borde el doble de grueso; se quita al escribir) | al input |
| `thinking` | envío con texto | se mantiene | `think` | thinking → thinkingFound (en cuanto llega la interpretación; thinkingFoundPlain si el resumen no cabe, §14.13) / thinkingLong (a los 4 s si aún no llegó) | input `readonly`, botón `disabled` con "Thinking…", `form[aria-busy="true"]` | al input si el foco estaba en el botón (que se desactiva) |
| `results` | hay juegos | **compact** | `happy` | results con `{summary}` (o resultsPlain, §14.13) | normal | input, cursor al final |
| `no-results` | sin juegos, o `off_topic` | **compact** | `sad` | noResults / offTopic | normal | input con el texto seleccionado (reescribir rápido) |
| `error` | 429, 503, red, tiempo agotado, respuesta rara | **compact** | `error` | según la causa (§14.6) | normal | input con el texto seleccionado |
| `detail` | fase 6 abre el panel | se mantiene (compact) | `idle` | — | — | lo gestiona el panel (fase 6) |
| vuelta de `detail` | fase 6 cierra el panel | compact | `idle` | detailBack | — | a la caja que lo abrió (fase 6) |

- **Puntero grueso (táctil)**: nunca se enfoca por script (no se abre el teclado solo, tampoco en `empty-input`); al enviar se quita el foco del elemento activo (input o botón) para cerrar el teclado y que se vea la respuesta. El bocadillo `aria-live` anuncia el resultado.
- El input lleva `aria-describedby="narrator-line"`: al volver al campo, el lector lee también lo que dijo el narrador.
- **Una petición a la vez**: un booleano local `pending` (además del `readonly` y el `disabled`) descarta un segundo envío en el mismo frame; `try/finally` garantiza que el formulario se libera aunque el Finder fallara.
- Un mood solo se cambia si es distinto del actual (`typing` → `empty-input` no reinicia nada); `results` → nueva búsqueda pasa por `think`, así que el salto se repite.
- **`detail` (contrato para la fase 6)**: `screen.detail(true)` pone `data-holo-paused` en `<html>` y `data-state="detail"`; `screen.detail(false)` lo quita, vuelve al estado anterior con el mood `idle` y dice detailBack. El panel es de la fase 6.

### 14.3 Decisión: el layout compacto se queda (cierra el punto abierto de §12.7)

> **Revisión 2026-10-05 (SPEC §16, decisión del usuario):** el compacto **ya no persiste hasta recargar**. Sigue sin volver a full por escribir o buscar (los cuatro porqués de abajo valen), pero tiene una salida explícita: **clic / tap / Enter / Espacio en el Chao** devuelve la intro. Reglas, etiqueta y medidas en **§18.1**. Lo de abajo queda como historia.

**Una vez que la pantalla pasa a compacto, no vuelve a full** hasta recargar. Volver a escribir desde `results`, `no-results` o `error` (estados `typing`, `empty-input`, `thinking`) mantiene el grupo arriba.
- **Por qué**: (1) el input no se mueve bajo el cursor ni bajo el dedo mientras se escribe (en móvil, moverlo con el teclado abierto desplaza la vista); (2) los juegos de la búsqueda anterior siguen visibles como contexto hasta que llegan los nuevos (fase 5); (3) la fila de juegos no aparece y desaparece en cada búsqueda (sin CLS); (4) un solo sentido de transición: hay un FLIP (full → compact) y nunca el inverso.
- **Cómo**: dos atributos en `#app`. `data-state` es siempre el estado lógico real (para tests y lectores); **`data-layout="full|compact"`** es el único interruptor del CSS compacto. **Esto cambia el contrato de §12.7**: el bloque compacto pasa de `#app:is([data-state=…])` a `#app[data-layout="compact"]` y vive en `screen.css`. SPEC/CLAUDE deben reflejarlo.

### 14.4 Movimiento

| Momento | Qué | Tiempos medidos |
|---|---|---|
| Intro | el Chao entra con 3 saltos (`playEnter`, §13); al aterrizar, el texto del saludo se pone en el bocadillo (el Chao habla) y la **caja** aparece de `scale(.92)` + opacidad desde la esquina que apunta al Chao (`--dur-base`, `--ease-out`); `--dur-base` después, el formulario sube `--reveal-rise` (12 px) + opacidad | bocadillo de .92 a 1 entre ~1.14 y ~1.4 s; formulario completo ≈ 1.66 s |
| Intro con reduced motion | el Chao aparece con un fundido de 200 ms; bocadillo y formulario se funden **a la vez** (solo opacidad, `--dur-base`), sin espera entre ellos | bocadillo visible a ~0.44 s; todo listo a ≈ 0.46 s |
| Cambio de frase | **solo el texto** (`span.bubble__text`) se funde: sale en `--dur-fast` (`--ease-in`), un temporizador de esa misma duración cambia el texto y lo hace entrar subiendo 4 px (`--dur-base`, `--ease-out`); la caja no se mueve ni se funde. Si llega otra frase durante la salida, se muestra la más nueva al terminar (no se apilan). El Chao habla al entrar el texto | caja a opacidad 1 en todo momento (medido) |
| Paso a compacto | **FLIP** (posiciones medidas antes y después): el título se traslada y escala desde su esquina superior; el narrador se traslada anclado a su borde inferior; el Chao escala desde su esquina inferior izquierda; el formulario se traslada. Los `transform-origin` están en `screen.css` y los keyframes solo llevan `translate`/`scale`. `--dur-slow`, `--ease-out` | 480 ms |
| Input vacío | sacudida `±--shake-distance`, 3 vaivenes amortiguados en `--dur-shake` | 320 ms |
| Pensando | el Chao en `think` y el `?` girando; sin brillo cruzando el input (DESIGN §10 lo proponía): el `?` ya dice "cargando" y el brillo pedía animar `background-position` | — |

**Por qué un temporizador y no `animation.finished`**: sin fotogramas (pestaña en segundo plano, equipo lento) `finished` puede no resolverse a tiempo y se perdían frases; el temporizador siempre dispara. **Reduced motion**: sin FLIP (el layout cambia en su sitio), sin sacudida (queda el mensaje, `aria-invalid` y el borde grueso), sin subir ni escalar (solo fundidos), cambio de frase instantáneo; el Chao según §13.6.

### 14.5 Conexión con `/api` y modo simulado

`src/lib/api.ts` convierte cualquier respuesta en un `Outcome` que el narrador sabe decir; nunca lanza.
- `POST /api/interpret {text}` (tiempo máximo en cliente 12 s) → `{ok, summary, genres, tags, platforms, years?, examples}` u `{ok:false, reason:'off_topic'}` (contrato del re-enfoque, 2026-10-03). En cuanto llega la interpretación se llama a `onInterpreted(summary)` (el narrador dice "Got it: {summary}. Looking…", §14.13).
- `GET /api/games?genres=…&tags=…` (máximo 14 s) → `{games:[…]}`; vacío → `no-results`.
- **429** → `rate` con `Retry-After` en segundos (si falta o no es un número, 10; tope 120); **503** → `busy`; fallo de red → `network`; `AbortSignal.timeout` → `slow`; 400/403/413/415/500, cuerpo no JSON o forma inesperada → `bad` (son bugs: mensaje genérico y, solo en DEV, `console.warn('[api]', url, status)`).
- **Modo simulado (solo DEV)**: `?mock=results|empty|offtopic|error|rate|busy|network|slow|timeout`. Espera 1.2 s (5.2 s en `slow`, para ver thinkingLong; 6 s en `timeout`), simula la emoción (`cozy` / `nostalgic`) y el desenlace. `results` devuelve `games: []` (la fase 5 los pintará). En producción no se lee `?mock` y el simulador desaparece del bundle (comprobado).

### 14.6 Textos del narrador (inglés; sustituyen a la tabla de §9)

| Clave (`content.narrator`) | Texto | Cuándo |
|---|---|---|
**Re-enfoque del 2026-10-03** (el usuario escribe un requisito de juego, no un sentimiento). Mood del Chao por estado sin cambios (§14.2).

| Clave (`content.narrator`) | Texto | Cuándo |
|---|---|---|
| `intro` | Hey! What kind of game are you looking for? | al cargar |
| `typing` | Take your time. Hit Enter when you're ready. | primer carácter |
| `emptyInput` | Type a kind of game first, like "souls-like". | envío vacío |
| `thinking` | Hmm… let me think about that. | al enviar |
| `thinkingLong` | Still thinking. Good picks take a moment. | 4 s sin interpretación todavía |
| `thinkingFound` | Got it: {summary}. Looking… | llegó la interpretación, faltan los juegos; `{summary}` ≤ 26 caracteres |
| `thinkingFoundPlain` | Got it! Looking for games… | igual, con `summary` vacío o de más de 26 caracteres |
| `results` | Ooh, {summary}! Try these. | hay juegos; `{summary}` ≤ 26 caracteres (p. ej. "co-op adventure") |
| `resultsPlain` | Ooh, I found some! Try these. | hay juegos, `summary` vacío o de más de 26 caracteres |
| `noResults` | No games fit all of that. Try fewer details? | sin juegos |
| `offTopic` | I only know games. Try "cozy farming sim". | `off_topic`: solo un sentimiento, sin sentido u ofensivo (layout de `no-results`, mood `sad`) |
| `error` | My brain is buffering. Give it a moment and try again. | respuesta rara o 4xx/500 |
| `errorRate` | Too many searches in a row. Try again in {seconds}s. | 429 (`Retry-After`, 1–120) |
| `errorBusy` | The game library is busy. Try again in a minute. | 503 |
| `errorNetwork` | Can't reach the internet. Check your connection. | sin red |
| `errorSlow` | That took too long. Try again in a moment. | tiempo agotado en cliente |
| `detailBack` | Want to look for something else? | al cerrar el detalle |

`content.input`: `label` "What kind of game?" (visualmente oculto; el bocadillo es el enunciado visible), `placeholder` "A co-op adventure for Switch", `submit` "Find games", `submitBusy` "Thinking…" (sin cambios). Los errores dicen qué pasó y qué hacer, en la voz del Chao, sin pedir perdón. Sin emojis. Por qué de cada frase y medidas: §14.13.

### 14.7 Contraste de lo nuevo

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| Etiqueta del botón / acento (peor punto, con el brillo superior) | 7.3 | ≥ 13.9 | 4.5 |
| "Thinking…" sobre el botón ocupado (`--disabled-opacity` 0.85 sobre el fondo) | 6.0 | 10.7 | 4.5 (WCAG exime los controles inactivos; aun así pasa) |
| Texto del input en `readonly` (`--color-text-muted` / `--color-surface`) | 9.22 | 11.68 | 4.5 |
| Borde del input en `aria-invalid` (`--color-border-hover`, 4 px aparentes) / fondo | 4.76 | 4.88 | 3 (UI) |
| Resto (bocadillo, input, pie, foco) | §8 | §8 | — |

### 14.8 Archivos verbatim

`src/styles/screen.css` (nuevo; recoge del style tile el interruptor, el título, el narrador, el bocadillo, el input y el pie, y el bloque compacto de `holo.css`):
```css
/* ===== Single screen: title, narrator, feeling form, shelf slot (DESIGN.md §14). Tokens only. ===== */

body { overflow-x: clip; } /* the Chao enters from -100vw: never a horizontal scrollbar (clip, not hidden: no scroll container) */

#app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-block-size: 100dvh;
}

/* ---------- Top bar: theme toggle only ---------- */
.top-bar {
  position: relative;
  z-index: var(--z-chrome);
  display: flex;
  justify-content: flex-end;
  padding: var(--space-4) var(--gutter) 0;
}

/* Plastic material (DESIGN §5) */
.theme-toggle,
.bubble {
  background: var(--plastic-bg);
  border: var(--border-hairline) solid var(--plastic-rim);
  box-shadow: var(--shadow-plastic);
}

.theme-toggle {
  position: relative;
  display: grid;
  place-items: center;
  min-inline-size: var(--space-7);
  min-block-size: var(--space-7);
  padding: var(--space-3);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  transition: transform var(--dur-fast) var(--ease-out);
}
.theme-toggle__icon { /* half-filled disc: "contrast / theme" without an icon set */
  inline-size: var(--space-5);
  block-size: var(--space-5);
  border-radius: var(--radius-pill);
  border: var(--border-control) solid currentColor;
  background: linear-gradient(90deg, currentColor 50%, transparent 50%);
}

/* Hover glow on ::after so only its opacity animates (toggle and submit) */
.theme-toggle::after,
.feeling__submit::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--glow-accent);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
  pointer-events: none;
}
.theme-toggle:active,
.feeling__submit:not(:disabled):active {
  transform: scale(var(--press-scale));
  box-shadow: var(--shadow-plastic-pressed);
}

/* ---------- Screen grid: intro = stage centred a little above the middle; compact = stage on top + shelf ---------- */
.screen {
  display: grid;
  grid-template-rows: 1fr auto 1.22fr; /* 1 : 1.22 puts the stage's centre at ~45 % (DESIGN §10) */
  justify-items: center;
  min-inline-size: 0;
  padding: 0 var(--gutter) var(--space-6);
}

.screen__stage {
  grid-row: 2;
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  inline-size: 100%;
}

/* FLIP targets: origins live here so the JS keyframes carry only translate/scale (compositor-friendly) */
.screen__title { display: grid; justify-items: center; transform-origin: 0 0; } /* an ancestor of .title-wrap, which bounces */
.feeling { transform-origin: 0 0; }

/* Knox lettering, 3 layers (DESIGN §3.1) */
.title {
  position: relative;
  isolation: isolate;
  font-family: var(--font-display);
  font-style: italic;
  font-weight: var(--weight-display-heavy);
  font-stretch: var(--font-stretch-display);
  font-size: var(--title-size);
  line-height: var(--leading-display);
  letter-spacing: var(--tracking-display);
  text-align: center;
  color: transparent;
  transform: skewX(var(--knox-skew));
}
.title::before,
.title::after {
  content: attr(data-text) / "";
  position: absolute;
  inset: 0;
}
.title::before {
  z-index: -1;
  color: var(--knox-extrude-1);
  text-shadow: var(--knox-ring);
  filter: var(--knox-extrusion);
}
.title::after {
  color: transparent;
  background: var(--knox-gloss);
  background-size: 100% 1lh;
  -webkit-background-clip: text;
  background-clip: text;
}

/* ---------- Narrator: Chao + bubble with a tail ---------- */
.narrator {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--space-3) + var(--bubble-tail)); /* the tail lives in the gap */
  max-inline-size: 100%;
  padding-block-start: calc(var(--chao-current) * var(--chao-headroom)); /* room for the happy jump + ball (DESIGN §13.15) */
  transform-origin: 0 100%; /* FLIP: anchored at its bottom edge */
}
.narrator .chao { transform-origin: 0 100%; } /* FLIP scale; chao.css sets no origin on .chao itself */

.bubble {
  --bubble-min-lines: 3;
  position: relative;
  display: flex;
  align-items: center; /* a one-line message sits in the middle of the reserved height */
  min-inline-size: 0;
  max-inline-size: var(--width-bubble);
  min-block-size: calc(var(--bubble-min-lines) * 1lh + 2 * var(--space-4) + 2 * var(--border-hairline)); /* lines change, the layout does not */
  margin-block-end: var(--space-5);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) var(--radius-bubble-tail);
  font-size: var(--text-lg);
  line-height: var(--leading-snug);
  color: var(--color-text);
  transform-origin: 0 100%; /* the corner that points at the Chao: the intro pop grows from here */
}
/* Tail: a wedge on the bubble's left edge, low, pointing down-left at the Chao. Two clipped layers outside the box
   (rim, then fill 1 px inside it), so the translucent plastic never doubles up over the box. */
.bubble::before,
.bubble::after {
  content: "";
  position: absolute;
  inset-inline-start: calc(-1 * var(--bubble-tail));
  inset-block-end: var(--space-3);
  inline-size: calc(var(--bubble-tail) + var(--border-hairline));
  block-size: calc(var(--bubble-tail) * 1.5);
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}
.bubble::before { background: var(--plastic-rim); }
.bubble::after {
  inset-block-end: calc(var(--space-3) + var(--border-hairline));
  inset-inline-start: calc(-1 * var(--bubble-tail) + 1.6 * var(--border-hairline));
  background: var(--plastic-fill);
}

[data-hidden] { visibility: hidden; } /* bubble and form before the intro reveals them (not reachable by keyboard or screen reader) */

/* ---------- Feeling form ---------- */
.feeling {
  display: flex;
  gap: var(--space-2);
  inline-size: min(100%, var(--width-input));
}

.feeling__input {
  flex: 1;
  min-inline-size: 0;
  min-block-size: var(--space-7);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border: var(--border-control) solid var(--color-border);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-plastic);
  color: var(--color-text);
}
.feeling__input::placeholder { color: var(--color-text-muted); }
.feeling__input[readonly] { color: var(--color-text-muted); cursor: progress; }
.feeling__input[aria-invalid="true"] { /* empty submit: the edge turns twice as thick (a shape cue, not only a colour one; also with reduced motion) */
  border-color: var(--color-border-hover);
  box-shadow: inset 0 0 0 var(--border-control) var(--color-border-hover), var(--shadow-plastic);
}

.feeling__submit {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  min-block-size: var(--space-7);
  padding: 0 var(--space-5);
  border: var(--border-control) solid transparent;
  border-radius: var(--radius-pill);
  background: linear-gradient(var(--accent-gloss), transparent var(--accent-gloss-stop)), var(--color-accent); /* gloss stays above the label */
  box-shadow: var(--shadow-plastic);
  color: var(--color-on-accent);
  font-weight: var(--weight-bold);
  transition: transform var(--dur-fast) var(--ease-out);
}
.feeling__go,
.feeling__busy { grid-area: 1 / 1; } /* both labels in one cell: the button keeps the width of the longer one */
.feeling__busy,
.feeling[aria-busy="true"] .feeling__go { visibility: hidden; }
.feeling[aria-busy="true"] .feeling__busy { visibility: visible; }
.feeling__submit:disabled { cursor: progress; opacity: var(--disabled-opacity); }

@media (hover: hover) {
  .theme-toggle:hover {
    background: var(--plastic-bg-hover);
    border-color: var(--plastic-rim-hover);
  }
  .theme-toggle:hover::after,
  .feeling__submit:not(:disabled):hover::after { opacity: 1; }
  .feeling__input:not([readonly]):hover { border-color: var(--color-border-hover); }
}

/* ---------- Shelf: reserved for the games row (phase 5); empty in 4b ---------- */
.shelf { grid-row: 3; display: none; }

/* ---------- Compact layout: results / no-results / error / detail, and it stays (DESIGN §14.3) ---------- */
#app[data-layout="compact"] {
  --title-size: var(--text-2xl);
  --title-bounce-distance: var(--title-bounce-distance-compact);
  --chao-current: var(--chao-size-compact);
}
#app[data-layout="compact"] .screen { grid-template-rows: 0 auto 1fr; padding-block-start: var(--space-4); } /* clear of the theme toggle, title bounce included */
#app[data-layout="compact"] .bubble { --bubble-min-lines: 2; } /* every compact line fits in 2 lines, also at 390 px */
#app[data-layout="compact"] .shelf {
  display: block;
  inline-size: 100%;
  max-inline-size: var(--width-page);
  min-block-size: var(--shelf-block);
  margin-block-start: var(--space-5);
}

/* ---------- Footer credit (text on background; halo in holo.css) ---------- */
.credit {
  padding: var(--space-4) var(--gutter) var(--space-5);
  text-align: center;
  text-wrap: balance;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.credit a { /* 44 px tall hit area without changing the line (inline padding does not move the text) */
  padding: var(--space-4) var(--space-2);
  margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-2));
}

@media (max-width: 29.99rem) { /* phones: the input gets the full width (the placeholder fits) and the button a full-width tap target */
  .feeling { flex-direction: column; }
}

@media (max-width: 23.4rem) { /* narrow phones (< 375 px): several compact lines need 3 lines */
  #app[data-layout="compact"] .bubble { --bubble-min-lines: 3; }
}

@media (min-width: 768px) {
  .bubble { --bubble-min-lines: 2; }
}

@media (max-height: 30rem) { /* short screens (phones in landscape): the whole intro fits above the fold */
  #app {
    --title-size: var(--text-2xl);
    --chao-current: var(--chao-size-compact);
  }
  .top-bar { padding-block-start: var(--space-2); }
  .screen { grid-template-rows: 0.3fr auto 1fr; padding-block-end: var(--space-3); }
  .screen__stage { gap: var(--space-2); }
  .bubble { --bubble-min-lines: 2; margin-block-end: var(--space-3); }
  .credit { padding-block: var(--space-2) var(--space-3); }
}
```

`src/sections/screen.ts` (nuevo):
```ts
// Single screen + narrator state machine (SPEC §1.1, DESIGN.md §14).
import { content } from '../content';
import type { Finder, Outcome } from '../lib/api';
import { el, fill } from '../lib/dom';
import { ease, px, time } from '../lib/tokens';
import { playEnter, setMood, startBlink, talk, type Mood } from './chao';
import { chaoRig } from './chao-rig';

export type State = 'intro' | 'typing' | 'empty-input' | 'thinking' | 'results' | 'no-results' | 'error' | 'detail';

/** States that switch the layout to compact. Once compact, the layout stays compact (§14.3). */
const COMPACT: ReadonlySet<State> = new Set<State>(['results', 'no-results', 'error', 'detail']);
const MOOD: Record<State, Mood> = {
  intro: 'idle', typing: 'listen', 'empty-input': 'listen', thinking: 'think',
  results: 'happy', 'no-results': 'sad', error: 'error', detail: 'idle',
};
const LONG_WAIT_MS = 4000; // then the narrator says it is still thinking
const DEFAULT_RETRY_S = 10;
const HAS_TEXT = /[^\p{Cc}\p{Cf}\p{Z}]/u; // same rule as the server (api/_lib/validate.ts): blank = nothing printable

const n = content.narrator;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)'); // touch: never pop the keyboard by script

/** What the narrator says for an outcome, and the state it leads to. */
export function lineFor(o: Outcome): [State, string] {
  switch (o.kind) {
    case 'results': return ['results', fill(n.results, { label: o.label })];
    case 'no-results': return ['no-results', n.noResults];
    case 'off-topic': return ['no-results', n.offTopic];
    case 'error': {
      const line = o.reason === 'rate' ? fill(n.errorRate, { seconds: o.retryAfter ?? DEFAULT_RETRY_S })
        : o.reason === 'busy' ? n.errorBusy
        : o.reason === 'network' ? n.errorNetwork
        : o.reason === 'slow' ? n.errorSlow
        : n.error;
      return ['error', line];
    }
  }
}

export interface Screen {
  main: HTMLElement;
  /** Intro: Chao enters, the bubble says hello, then the form appears. */
  start(): Promise<void>;
  /** Phase 6 hook: the detail panel calls detail(true) when it opens and detail(false) when it closes. */
  detail(open: boolean): void;
}

export function createScreen(app: HTMLElement, find: Finder): Screen {
  const chao = chaoRig();
  const text = el('span', { class: 'bubble__text' }); // only the text fades between lines; the box stays put
  const bubble = el('p', { class: 'bubble', id: 'narrator-line', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-hidden': '' }, text);
  const input = el('input', {
    class: 'feeling__input', id: 'feeling', name: 'feeling', type: 'text', maxlength: '200', autocomplete: 'off',
    enterkeyhint: 'search', placeholder: content.input.placeholder, 'aria-describedby': 'narrator-line',
  });
  const submit = el('button', { class: 'feeling__submit', type: 'submit' },
    el('span', { class: 'feeling__go' }, content.input.submit), el('span', { class: 'feeling__busy' }, content.input.submitBusy));
  const form = el('form', { class: 'feeling', role: 'search', novalidate: '', 'aria-busy': 'false', 'data-hidden': '' },
    el('label', { class: 'visually-hidden', for: 'feeling' }, content.input.label), input, submit);
  const title = el('div', { class: 'screen__title' },
    el('div', { class: 'title-wrap' }, el('h1', { class: 'title', 'data-text': content.pageTitle }, content.pageTitle)));
  const narrator = el('div', { class: 'narrator' }, chao, bubble);
  const shelf = el('div', { class: 'shelf', 'aria-hidden': 'true' }); // phase 5 puts the games row here
  const main = el('main', { class: 'screen' }, el('div', { class: 'screen__stage' }, title, narrator, form), shelf);
  app.dataset.state = 'intro';
  app.dataset.layout = 'full';

  // ---- the bubble: the text fades out, swaps on a timer, fades in; the Chao "talks" as the new line appears ----
  // A timer (not animation.finished) drives the swap: it still fires in a background tab or on a slow machine.
  let swapTimer = 0;
  let nextLine = '';
  const show = (line: string) => {
    text.getAnimations().forEach((a) => a.cancel());
    text.textContent = line;
    talk(chao, line);
  };
  const say = (line: string) => {
    nextLine = line;
    if (swapTimer) return; // a fade-out is running: it will show the newest line
    if (!text.textContent || reduce.matches) return show(line);
    const out = time('--dur-fast', 160);
    text.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: ease('--ease-in', 'ease-in'), fill: 'forwards' });
    swapTimer = window.setTimeout(() => {
      swapTimer = 0;
      show(nextLine);
      text.animate([{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }], { duration: time('--dur-base', 260), easing: ease('--ease-out') });
    }, out);
  };

  // ---- FLIP of the stage when the layout turns compact (transform-origin is set in screen.css) ----
  const measure = () => ({ title: title.getBoundingClientRect(), narrator: narrator.getBoundingClientRect(), form: form.getBoundingClientRect(), chaoH: chao.offsetHeight });
  const flip = (first: ReturnType<typeof measure>) => {
    const opts: KeyframeAnimationOptions = { duration: time('--dur-slow', 480), easing: ease('--ease-out') };
    // the narrator is anchored at its bottom edge: the Chao and the bubble sit there, its top is only headroom
    const move = (node: HTMLElement, a: DOMRect, scaled: boolean, anchor: 'top' | 'bottom' = 'top') => {
      const b = node.getBoundingClientRect();
      const s = scaled && b.width ? a.width / b.width : 1;
      const dy = anchor === 'top' ? a.top - b.top : a.bottom - b.bottom;
      node.animate([{ translate: `${a.left - b.left}px ${dy}px`, scale: String(s) }, { translate: '0 0', scale: '1' }], opts);
    };
    move(title, first.title, true);
    move(narrator, first.narrator, false, 'bottom');
    move(form, first.form, false);
    if (chao.offsetHeight) chao.animate([{ scale: String(first.chaoH / chao.offsetHeight) }, { scale: '1' }], opts);
  };

  const go = (state: State, line?: string, mood: Mood = MOOD[state]) => {
    const wasCompact = app.dataset.layout === 'compact';
    const compact = wasCompact || COMPACT.has(state);
    const first = compact !== wasCompact && !reduce.matches ? measure() : null;
    app.dataset.state = state;
    app.dataset.layout = compact ? 'compact' : 'full';
    if (first) flip(first);
    if (chao.dataset.mood !== mood) setMood(chao, mood);
    if (line) say(line);
  };

  const busy = (on: boolean) => {
    input.readOnly = on;
    submit.disabled = on;
    form.setAttribute('aria-busy', String(on));
  };

  const shake = () => {
    if (reduce.matches) return;
    const d = px('--shake-distance', 6);
    form.animate([0, -d, d, -d, d, -d / 2, 0].map((x) => ({ translate: `${x}px 0` })), { duration: time('--dur-shake', 320), easing: ease('--ease-out') });
  };

  const reveal = (node: HTMLElement, from: Keyframe) => {
    node.removeAttribute('data-hidden');
    const frames: Keyframe[] = reduce.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, ...from }, { opacity: 1, translate: '0 0', scale: '1' }];
    return node.animate(frames, { duration: time('--dur-base', 260), easing: ease('--ease-out') }).finished.catch(() => undefined);
  };

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    const s = app.dataset.state;
    if (s !== 'typing' && s !== 'thinking' && HAS_TEXT.test(input.value)) go('typing', n.typing);
  });

  let pending = false; // one request at a time (also guards against a double submit in the same frame)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pending) return;
    if (!HAS_TEXT.test(input.value)) {
      go('empty-input', n.emptyInput);
      input.setAttribute('aria-invalid', 'true');
      shake();
      if (finePointer.matches) input.focus();
      return;
    }
    pending = true;
    if (!finePointer.matches) (document.activeElement as HTMLElement | null)?.blur(); // touch: close the keyboard so the answer is visible
    else if (document.activeElement === submit) input.focus({ preventScroll: true }); // the button is about to be disabled
    busy(true);
    go('thinking', n.thinking);
    let found = false;
    const long = window.setTimeout(() => { if (!found) say(n.thinkingLong); }, LONG_WAIT_MS);
    let outcome: Outcome;
    try {
      outcome = await find(input.value.trim(), (label) => { found = true; say(fill(n.thinkingFound, { label })); });
    } finally {
      clearTimeout(long);
      busy(false);
      pending = false;
    }
    const [state, line] = lineFor(outcome);
    go(state, line);
    if (finePointer.matches) {
      input.focus({ preventScroll: true });
      if (state !== 'results') input.select(); // rewrite quickly after a miss
    }
  });

  let beforeDetail: State = 'results';
  return {
    main,
    async start() {
      if (!(import.meta.env.DEV && new URLSearchParams(location.search).has('noblink'))) startBlink(chao);
      await playEnter(chao);
      say(n.intro); // the bubble is empty: the text is set at once, then the box pops in from the Chao's corner
      const bubbleIn = reveal(bubble, { scale: '0.92' });
      if (!reduce.matches) await new Promise((r) => setTimeout(r, time('--dur-base', 260))); // reduced motion: both fade in together
      await Promise.all([bubbleIn, reveal(form, { translate: `0 ${px('--reveal-rise', 12)}px` })]);
      if (finePointer.matches) input.focus({ preventScroll: true });
    },
    detail(open) {
      document.documentElement.toggleAttribute('data-holo-paused', open);
      if (open) {
        beforeDetail = app.dataset.state as State;
        go('detail');
      } else {
        go(beforeDetail === 'detail' ? 'results' : beforeDetail, n.detailBack, 'idle');
      }
    },
  };
}
```

`src/lib/api.ts` (nuevo):
```ts
// Client for /api (SPEC §3, DESIGN §14.5). Every failure becomes an Outcome the narrator can say; nothing throws.
export interface Game { id: number; slug: string; name: string; released: string | null; image: string }

export type ErrorReason = 'rate' | 'busy' | 'network' | 'slow' | 'bad';
export type Outcome =
  | { kind: 'results'; label: string; games: Game[] }
  | { kind: 'no-results'; label: string }
  | { kind: 'off-topic' }
  | { kind: 'error'; reason: ErrorReason; retryAfter?: number };

/** text -> outcome. `onInterpreted` fires as soon as the emotion is known (games still loading). */
export type Finder = (text: string, onInterpreted: (label: string) => void) => Promise<Outcome>;

const INTERPRET_TIMEOUT_MS = 12_000; // server budget is ~10 s
const GAMES_TIMEOUT_MS = 14_000; // server budget is ~12 s (RAWG 0.5-7 s)
const RETRY_AFTER_FALLBACK_S = 10;
const RETRY_AFTER_MAX_S = 120; // a broken header must not tell the user to wait an hour
const BAD: Outcome = { kind: 'error', reason: 'bad' }; // 400/403/413/415/500, non-JSON or wrong shape

type Call = { ok: true; data: Record<string, unknown> } | { ok: false; outcome: Outcome };

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<Call> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const slow = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, outcome: { kind: 'error', reason: slow ? 'slow' : 'network' } };
  }
  if (res.status === 429) {
    const retryAfter = Math.min(RETRY_AFTER_MAX_S, Math.max(1, Math.ceil(Number(res.headers.get('Retry-After'))) || RETRY_AFTER_FALLBACK_S));
    return { ok: false, outcome: { kind: 'error', reason: 'rate', retryAfter } };
  }
  if (res.status === 503) return { ok: false, outcome: { kind: 'error', reason: 'busy' } };
  if (!res.ok) {
    if (import.meta.env.DEV) console.warn('[api]', url, res.status); // 400/403/413/415/500: a bug on our side
    return { ok: false, outcome: BAD };
  }
  try {
    const data: unknown = await res.json(); // the timeout signal also covers reading the body
    return data && typeof data === 'object' ? { ok: true, data: data as Record<string, unknown> } : { ok: false, outcome: BAD };
  } catch (e) {
    const slow = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, outcome: slow ? { kind: 'error', reason: 'slow' } : BAD };
  }
}

const isGame = (g: unknown): g is Game => {
  const o = g as Partial<Game> | null;
  return !!o && typeof o.id === 'number' && typeof o.slug === 'string' && typeof o.name === 'string' && typeof o.image === 'string';
};
const isStrings = (a: unknown): a is string[] => Array.isArray(a) && a.every((s) => typeof s === 'string');

export const findGames: Finder = async (text, onInterpreted) => {
  const a = await call('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, INTERPRET_TIMEOUT_MS);
  if (!a.ok) return a.outcome;
  const i = a.data;
  if (i.ok === false) return i.reason === 'off_topic' ? { kind: 'off-topic' } : BAD;
  if (typeof i.label !== 'string' || !isStrings(i.genres) || !isStrings(i.tags)) return BAD;
  const label = i.label;
  onInterpreted(label);
  const q = new URLSearchParams({ genres: i.genres.join(','), tags: i.tags.join(',') });
  const g = await call(`/api/games?${q}`, {}, GAMES_TIMEOUT_MS);
  if (!g.ok) return g.outcome;
  if (!Array.isArray(g.data.games)) return BAD;
  const games = g.data.games.filter(isGame);
  return games.length ? { kind: 'results', label, games } : { kind: 'no-results', label };
};

/** DEV only (?mock=…): exercises every narrator state without the network. */
export const MOCKS = ['results', 'empty', 'offtopic', 'error', 'rate', 'busy', 'network', 'slow', 'timeout'] as const;
export function mockFinder(kind: (typeof MOCKS)[number]): Finder {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return async (_text, onInterpreted) => {
    await wait(kind === 'slow' ? 5200 : kind === 'timeout' ? 6000 : 1200);
    if (kind === 'offtopic') return { kind: 'off-topic' };
    if (kind === 'error') return BAD;
    if (kind === 'rate') return { kind: 'error', reason: 'rate', retryAfter: 12 };
    if (kind === 'busy') return { kind: 'error', reason: 'busy' };
    if (kind === 'network') return { kind: 'error', reason: 'network' };
    if (kind === 'timeout') return { kind: 'error', reason: 'slow' };
    const label = kind === 'empty' ? 'nostalgic' : 'cozy';
    onInterpreted(label);
    await wait(900);
    return kind === 'empty' ? { kind: 'no-results', label } : { kind: 'results', label, games: [] };
  };
}
```

`src/lib/tokens.ts` (nuevo, rev. 2: un solo lector de tokens para `screen.ts` y `chao.ts`):
```ts
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
```

`src/lib/dom.ts` (nuevo: `el()` sale de `main.ts`):
```ts
// Tiny DOM builder: text always goes through text nodes, never innerHTML.
export type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Fills {name} slots in a content string. */
export const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
```

`src/sections/chao-rig.ts` (nuevo: `chaoRig()` sale de `main.ts`, sin cambios salvo el import de `el`):
```ts
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
```

`src/dev/lab.ts` (nuevo, solo DEV con `?lab`: el style tile y el Chao lab salen de `main.ts`; sin el deslizador de voz):
```ts
// DEV only (?lab): the phase-1 style tile + the Chao lab (DESIGN §13.12). Loaded with import() from main.ts.
import '../styles/style-tile.css';
import { content } from '../content';
import { el, type Child } from '../lib/dom';
import { MOODS, blink, playEnter, setMood, startBlink, talk, voiceLevel, type Mood } from '../sections/chao';
import { chaoRig } from '../sections/chao-rig';

const st = content.styleTile;
const swatches = [
  '--color-bg', '--color-surface', '--color-text', '--color-text-muted', '--color-accent',
  '--color-border', '--color-focus', '--knox-fill', '--knox-extrude-1', '--knox-extrude-2',
  '--knox-highlight', '--knox-shine', '--holo-1', '--holo-2', '--holo-3', '--holo-4',
  '--holo-5', '--holo-6', '--holo-7',
];
const typeSteps = ['sm', 'base', 'lg', 'xl', '2xl'];
const radii = ['--radius-sm', '--radius-case', '--radius-panel', '--radius-bubble', '--radius-pill'];
const spaces = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `--space-${n}`);

const section = (heading: string, ...children: Child[]) =>
  el('section', { class: 'tile-section' }, el('h2', { class: 'tile-section__title' }, heading), ...children);

function chaoLab() {
  const lab = st.chaoLab;
  const chao = chaoRig();
  setMood(chao, 'idle');
  if (!location.search.includes('noblink')) startBlink(chao);
  const btn = (label: string, onClick: () => void) => {
    const b = el('button', { type: 'button', class: 'lab-btn' }, label);
    b.addEventListener('click', onClick);
    return b;
  };
  const moodBtns = new Map<Mood, HTMLButtonElement>();
  const press = (mood: Mood | null) => moodBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === mood)));
  const pick = async (mood: Mood) => {
    press(mood);
    if (mood === 'enter') {
      await playEnter(chao);
      press(chao.dataset.mood as Mood);
    } else setMood(chao, mood);
  };
  for (const m of MOODS) moodBtns.set(m, btn(lab[m], () => void pick(m)));
  press('idle');

  const talkBtn = btn(lab.talk, () => {
    const on = talkBtn.getAttribute('aria-pressed') !== 'true';
    talkBtn.setAttribute('aria-pressed', String(on));
    if (on) chao.dataset.talking = 'cycle';
    else voiceLevel(chao, null); // smooth stop (voiceLevel is otherwise inactive: no voice in the product)
  });
  talkBtn.setAttribute('aria-pressed', 'false');
  const blinkBtn = btn(lab.blink, () => blink(chao));

  const stage = el('div', { class: 'chao-lab__stage', 'aria-hidden': 'true' }, chao);
  const compact = el('input', { id: 'chao-compact', type: 'checkbox' });
  compact.addEventListener('change', () => stage.classList.toggle('chao-lab__stage--compact', compact.checked));

  window.__chao = { el: chao, setMood, playEnter, talk, voiceLevel, blink };
  const q = new URLSearchParams(location.search).get('mood');
  if (q && (MOODS as readonly string[]).includes(q)) void pick(q as Mood);

  return section(
    lab.heading,
    stage,
    el('div', { class: 'chao-lab__row', role: 'group', 'aria-label': lab.moods }, ...moodBtns.values()),
    el('div', { class: 'chao-lab__row' }, talkBtn, blinkBtn),
    el('div', { class: 'chao-lab__row' }, compact, el('label', { for: 'chao-compact' }, lab.compact)),
  );
}

export function renderLab(): HTMLElement {
  return el(
    'main',
    { class: 'page' },
    el('h1', { class: 'tile-section__title' }, st.badge),
    el(
      'div',
      { class: 'tile' },
      section(st.chromeSample, el('div', { class: 'chrome-strip' }, content.pageTitle)),
      section(
        st.typeHeading,
        el('p', { class: 'type-row type-row--display' }, el('code', {}, '--text-display'), el('span', {}, st.typeSample)),
        ...typeSteps.map((s) => el('p', { class: 'type-row', style: `font-size: var(--text-${s})` }, el('code', {}, `--text-${s}`), el('span', {}, st.typeSample))),
      ),
      section(
        st.colorHeading,
        el('ul', { class: 'swatches', role: 'list' },
          ...swatches.map((t) => el('li', { class: 'swatch' }, el('span', { class: 'swatch__chip', style: `background: var(${t})` }), el('code', {}, t)))),
      ),
      chaoLab(),
      section(
        st.shapeHeading,
        el('ul', { class: 'radii', role: 'list' }, ...radii.map((r) => el('li', { class: 'radius', style: `border-radius: var(${r})` }, el('code', {}, r)))),
        el('ul', { class: 'spaces', role: 'list' },
          ...spaces.map((s) => el('li', { class: 'space' }, el('span', { class: 'space__bar', style: `inline-size: var(${s})` }), el('code', {}, s)))),
      ),
    ),
  );
}
```

`src/main.ts` (sustituye entero al actual):
```ts
import { startHolo } from './holo/holo';
import './styles/tokens.css';
import './styles/base.css';
import './styles/holo.css';
import './styles/chao.css';
import './styles/screen.css';
import { content } from './content';
import { findGames, mockFinder, MOCKS, type Finder } from './lib/api';
import { el } from './lib/dom';
import { createScreen, type Screen } from './sections/screen';

type Theme = 'light' | 'dark';

declare global {
  interface Window {
    /** DEV only: lets tests open/close the (phase 6) detail state. */
    __screen?: Pick<Screen, 'detail'>;
  }
}

// ---------- Theme ----------
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function currentTheme(): Theme {
  const set = root.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return systemDark.matches ? 'dark' : 'light';
}

function themeToggle(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'theme-toggle' }, el('span', { class: 'theme-toggle__icon', 'aria-hidden': 'true' }));
  const sync = () => {
    const dark = currentTheme() === 'dark';
    button.setAttribute('aria-label', dark ? content.theme.toLight : content.theme.toDark);
  };
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next); // key must match the inline script in index.html
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
    sync();
  });
  systemDark.addEventListener('change', sync);
  sync();
  return button;
}

// ---------- Page ----------
const app = document.getElementById('app')!;
const q = new URLSearchParams(location.search);
const header = el('header', { class: 'top-bar' }, themeToggle());
const footer = el('footer', { class: 'credit' }, el('p', {}, content.footer.credit, el('a', { href: content.footer.rawgUrl }, content.footer.rawgLabel)));

if (import.meta.env.DEV && q.has('lab')) {
  // DEV only: style tile + Chao lab (src/dev/lab.ts). Dead code in production builds.
  void import('./dev/lab').then(({ renderLab }) => app.append(header, renderLab(), footer));
} else {
  const mock = import.meta.env.DEV ? q.get('mock') : null; // production never reads ?mock
  const find: Finder = import.meta.env.DEV && mock && (MOCKS as readonly string[]).includes(mock) ? mockFinder(mock as (typeof MOCKS)[number]) : findGames;
  const screen = createScreen(app, find);
  app.append(header, screen.main, footer);
  if (import.meta.env.DEV) window.__screen = { detail: screen.detail };
  void screen.start();
}

// The background is decorative: content renders first and a failure here leaves the CSS fallback.
try {
  startHolo(document.querySelector<HTMLCanvasElement>('.holo__canvas')!);
} catch (e) {
  if (import.meta.env.DEV) console.warn('[holo]', e);
}
```

`src/content.ts` (sustituye entero al actual) — **obsoleto: lo sustituye §14.13 (re-enfoque)**:
```ts
// Single source for every visible string (SPEC §1.1, DESIGN §9 and §14.6).
export const content = {
  pageTitle: 'Game Feelings',
  narrator: {
    intro: 'Hey! How are you feeling today?',
    typing: "Take your time. Hit Enter when you're ready.",
    emptyInput: 'Tell me a feeling first, like "tired but hopeful".',
    thinking: 'Hmm… let me think about that.',
    thinkingLong: 'Still thinking. Big feelings take a moment.',
    thinkingFound: 'Got it, {label}. Finding games…',
    results: 'Feeling {label}? These games get it.',
    noResults: 'Nothing fits that one yet. Try saying it another way?',
    offTopic: "Let's talk feelings. How are you, really?",
    error: 'My brain is buffering. Give it a moment and try again.',
    errorRate: 'Too many feelings in a row. Try again in {seconds}s.',
    errorBusy: 'The game library is busy. Try again in a minute.',
    errorNetwork: "Can't reach the internet. Check your connection.",
    errorSlow: 'That took too long. Try again in a moment.',
    detailBack: 'Want to try another feeling?',
  },
  input: {
    label: 'How are you feeling?',
    placeholder: 'I feel lonely but cozy tonight',
    submit: 'Find games',
    submitBusy: 'Thinking…',
  },
  theme: {
    toDark: 'Switch to dark theme',
    toLight: 'Switch to light theme',
  },
  footer: {
    credit: 'Chao © SEGA — fan project, not affiliated · Game data by ',
    rawgLabel: 'RAWG',
    rawgUrl: 'https://rawg.io',
  },
  character: {
    alt: 'Chao, a small blue creature with a yellow ball floating above its head',
  },
  // DEV-only scaffolding (?lab).
  styleTile: {
    badge: 'Phase 1 · style tile',
    chromeSample: 'Chrome strip',
    typeHeading: 'Type scale',
    colorHeading: 'Color',
    shapeHeading: 'Radii and spacing',
    typeSample: 'Feeling cozy tonight',
    chaoLab: {
      heading: 'Chao lab',
      moods: 'Mood',
      talk: 'Talk',
      blink: 'Blink',
      compact: 'Compact size',
      enter: 'Enter',
      idle: 'Idle',
      listen: 'Listen',
      think: 'Think',
      happy: 'Happy',
      sad: 'Sad',
      error: 'Error',
    },
  },
} as const;
```

`src/sections/chao.ts`: el de §13.8 (rev. 2 de la 4b: importa `time` y `ease` de `src/lib/tokens.ts` en vez de definir los suyos; nada más cambia).

### 14.9 Ediciones para el frontend-engineer

1. Sustituir enteros, con el contenido de §14.8: `src/styles/screen.css`, `src/sections/screen.ts`, `src/lib/api.ts`, `src/main.ts`, `src/content.ts`. Crear `src/lib/tokens.ts`. `src/lib/dom.ts`, `src/sections/chao-rig.ts` y `src/dev/lab.ts` no cambian respecto a la revisión 1.
2. `src/sections/chao.ts`: sustituir por el de §13.8 (solo cambian el import de `../lib/tokens` y las tres llamadas a `time`/`ease`; se borran sus `time()` y `easeOut()` locales).
3. `src/styles/holo.css`: el bloque "Compact layout hook" ya no debe estar (vive en `screen.css` como `#app[data-layout="compact"]`).
4. `src/styles/style-tile.css`: solo para `?lab` (lo importa `src/dev/lab.ts`), sin los bloques que pasaron a `screen.css`, con el plástico de `.lab-btn` (puede usar `background: var(--plastic-bg)`).
5. `src/styles/chao.css` e `index.html`: sin cambios. `voiceLevel()` y `data-talking="voice"` siguen inactivos (sin uso en el producto; no borrar todavía).
6. `tokens.css` ya tiene `--dur-shake`, `--reveal-rise`, `--chao-headroom`, `--shelf-block` (ahora 10rem, mínimo), `--bubble-tail`, `--accent-gloss`, `--accent-gloss-stop`, `--disabled-opacity`, `--plastic-bg`, `--plastic-bg-hover` y el `--chao-size-compact` de teléfonos.
7. Tests existentes que comparen las tres frases acortadas (`emptyInput`, `errorBusy`, `errorNetwork`) o `--shelf-block` deben leer los valores nuevos de `content.ts`/`tokens.css`.
8. Fase 5 pinta la fila dentro de `.shelf` (quitar su `aria-hidden`, darle el `aria-label`/encabezado que defina su diseño, recalcular `--shelf-block`). Fase 6 llama a `screen.detail(true|false)`.

### 14.10 Verificación (para el tester)

Servidor de desarrollo; fondo congelado con `?t=9500`; parpadeo apagado con `?noblink`; estados con `?mock=…` (§14.5). Esperar ~1.5 s tras `networkidle` (SwiftShader).
- **Intro**: a ~250 ms `data-mood="enter"`, bocadillo vacío y formulario con `visibility: hidden`; a ~2.6 s, `data-state="intro"`, mood `idle`, bocadillo con intro, formulario visible; con puntero fino el foco está en `#feeling`; con táctil (`hasTouch`, `isMobile`), en `body`. Muestreando `getComputedStyle(.bubble)` cada frame tras aterrizar: `scale` pasa por ~0.92 y llega a 1 con la opacidad (sin reduced motion); con reduce, `scale` siempre `none` y solo sube la opacidad, y el bocadillo es visible antes de ~0.5 s.
- **Cambio de frase**: al escribir, durante ~400 ms la opacidad de `.bubble` es siempre 1 y la de `.bubble__text` baja a ~0 y vuelve a 1; el texto final es typing.
- **typing / empty-input / thinking / results / persistencia / desenlaces / detail**: como en la revisión 1 (estados, moods, frases de §14.6, `readOnly`, `disabled`, `aria-busy`, "Thinking…", thinkingFound, thinkingLong con `?mock=slow` a 4.4 s, `data-layout` compacto que se mantiene al volver a escribir, texto seleccionado tras `no-results`/`error` con puntero fino, `__screen.detail(true|false)`).
- **empty-input**: `aria-invalid="true"` y el `box-shadow` del input empieza por `inset 0 0 0 2px` (también con reduced motion); con táctil el foco **no** se mueve por script.
- **Ajuste de líneas**: con `data-layout="compact"`, cada frase de `content.narrator` (con `{summary}` = los resúmenes de prueba de §14.13, todos de 22–26 caracteres, y `{seconds}`="120") ocupa ≤ 2 líneas a 375, 390 y 1440 (altura del `span` / `line-height`) y ≤ 3 por debajo de 375; en full a 390, ≤ 3.
- **Tamaños**: a 390, `.chao` mide 77 px de alto en compacto; a 1440, 120.
- **Pico del salto** (animaciones del Chao a 377 ms): `top` del corazón − `bottom` del título ≥ 16 px a 1440 y 390.
- **Scroll**: en compacto, `scrollHeight == innerHeight` a 390×844 y 1440×900; `scrollWidth ≤ innerWidth` siempre.
- **Apaisado 844×390**: en intro y en resultados, `bottom` del formulario ≤ 390.
- **Accesibilidad**: un solo `h1`; `#narrator-line` con `aria-live="polite"` y `aria-atomic="true"`; input con `<label>` y `aria-describedby`; botón y toggle ≥ 44×44; el enlace RAWG con zona táctil ≥ 44 px de alto (`getBoundingClientRect` de sus `getClientRects`); foco visible; orden de Tab: toggle → input → botón → RAWG.
- Capturas 390, 1440 y 844×390 × claro/oscuro de: intro, typing, empty-input, thinking, results, no-results, error; 0 errores de consola.
- Build: el bundle de producción no contiene `nostalgic`, `chao-lab` ni `[api]`.

### 14.11 Puntos flojos (honesto)

1. Durante el FLIP en teléfono, el título de dos líneas pasa a una: el primer frame lo dibuja ya en una línea escalada (la escala se calcula por anchura). Dura 480 ms y no se percibe como salto, pero no es una interpolación fiel.
2. La cola del bocadillo es un triángulo plano (sin el brillo interior del plástico) y la línea del borde de la caja atraviesa su base: se lee como una junta de plástico, no como una sola pieza.
3. A 320 px la frase "error" ocupa 4 líneas en compacto (el bocadillo crece ~1 línea y empuja el input). A 360, cinco frases usan 3 líneas (reservadas por debajo de 375 px).
4. En apaisado, en compacto, el pie queda bajo el pliegue (la fila de juegos tiene prioridad).
5. `detail` vuelve al estado anterior aunque fuera `typing` (si el panel se abriera desde un estado de escritura, cosa que la fase 6 no debería permitir).
6. Sin contador de caracteres: `maxlength="200"` corta en silencio.
7. Las cadenas del lab viajan en el bundle de producción (~0.6 KB).

### 14.12 Cambios de la revisión 2 (resumen)

Diseño: Chao compacto 0.8 en teléfonos y bocadillo de 2 líneas en compacto (3 frases acortadas); solo el texto se funde; temporizador en el cambio de frase; arreglo del "pop" de la intro (antes `say()` cancelaba la animación de la caja: ahora el texto se pone primero y la caja aparece después, y el fundido es solo del texto); `max-height: 30rem`; `scrollbar-gutter: stable`; `--shelf-block` mínimo; cola del bocadillo; `text-wrap: balance` en el pie; zona táctil del enlace RAWG; borde grueso en `aria-invalid`; tiempos reales de reduced motion (sin espera de 260 ms). Código: foco táctil en `empty-input` y en el envío; `pending` + `try/finally`; `transform-origin` en CSS; `console.warn` en DEV para respuestas que son bugs; `Retry-After` con tope 120; validación de texto vacío con la regex del servidor; `?mock` y `?noblink` solo en DEV; sin `STATES` ni el `??` sobrante; un solo lector de tokens (`src/lib/tokens.ts`); tokens `--accent-gloss`, `--accent-gloss-stop`, `--disabled-opacity`, `--plastic-bg(-hover)`, `--bubble-tail`; `reveal()` con reduced motion solo anima la opacidad.

> Rev. 3 (aplicada por el orquestador porque el ui-designer estaba sin cuota; revisar cuando vuelva): se quita `scrollbar-gutter: stable` (dejaba una franja sin fondo holo y rompía el tamaño del canvas; ya no hay scroll en compacto a 390x844 ni 1440x900), `offTopic` y `errorSlow` acortadas a 2 líneas, y `.credit a` con padding `--space-4` (zona táctil ≥44 px). Las menciones a scrollbar-gutter más arriba quedan obsoletas.
>
> **Confirmado por el ui-designer (fase 5)**: la rev. 3 es correcta y coincide con lo que había probado (quitar el gutter es lo correcto: el fondo `fixed` no cubre el hueco y no hay scroll que estabilizar; las dos frases nuevas caben en 2 líneas a 390 en compacto; `--space-4` da ≥ 44 px de zona táctil sin mover la línea). Corregidas arriba la línea de §14.1 y las dos filas de §14.6. Los bloques de §14.8 (`screen.css`, `content.ts`) los sustituye §15.8.

### 14.13 Re-enfoque: el usuario pide un tipo de juego (textos, 2026-10-03)

El usuario ya no escribe cómo se siente sino **qué quiere jugar** ("co-op adventure", "un souls-like", "metroidvania para Switch"), en español o inglés. La UI, el narrador y el pie siguen en inglés. **No hay diseño visual nuevo**: mismo nombre, Chao, layout, tokens y fondo. Solo cambian textos y una regla para mostrar el `{summary}` de la API. El bloque `content.ts` de abajo **sustituye** a los de §14.8 y §15.8.

**Por qué cada frase**
- `intro` "Hey! What kind of game are you looking for?": hace la pregunta nueva sin explicar nada. Se mantiene "Hey!" para que el Chao suene igual.
- `typing`, `thinking`, `submit`, `submitBusy`: sin cambios. Ya eran neutros.
- `emptyInput`, `offTopic` y el placeholder enseñan **tres formas distintas** de pedir: un subgénero ("souls-like"), un tipo con ambiente ("cozy farming sim") y un tipo con plataforma ("A co-op adventure for Switch"). Repetir el mismo ejemplo en los tres sitios enseñaría solo una.
- `offTopic` "I only know games. Try "cozy farming sim".": dice por qué no sirve (el Chao solo sabe de juegos) y qué hacer. El ejemplo "cozy" deja ver que se puede pedir un juego por cómo te sientes, sin decirlo. Termina en punto y no en exclamación porque el Chao está en `sad`. La frase sugerida ("Tell me what you want to play, like 'co-op adventure'") ocupaba **3 líneas a 375 px en compacto** (medido), y por eso se descartó.
- `thinkingFound` "Got it: {summary}. Looking…": repite lo entendido mientras llegan los juegos. "Finding games…" no cabía con resúmenes de 22–26 caracteres a 375/390 (medido).
- `results` "Ooh, {summary}! Try these.": es la frase alegre (mood `happy`, corazón) y empieza con el resumen para confirmar que lo entendió. Se descartaron "Looking for {summary}? These should fit." (3 líneas a 390 a partir de unos 25 caracteres), "Ooh, {summary}! I found these." (3 líneas a 375 a partir de 22) y empezar la frase por el resumen (obliga a poner la primera letra en mayúscula por código).
- `noResults` "No games fit all of that. Try fewer details?": ahora "sin juegos" casi siempre quiere decir que se pidieron demasiadas cosas a la vez (el backend ya relaja filtros), así que la frase dice cómo arreglarlo.
- `thinkingLong` "Still thinking. Good picks take a moment." y `errorRate` "Too many searches in a row…": cambian la palabra "feelings".
- `detailBack` "Want to look for something else?": invita a otra búsqueda.
- `input.label` "What kind of game?": va visualmente oculto. Es más corto que `intro` porque el input lleva `aria-describedby="narrator-line"`: con el mismo texto, el lector de pantalla diría la pregunta dos veces.
- `shelf.heading` "Games matching {summary}" (`h2` oculto): usa el resumen **completo** porque no tiene límite de líneas. Si el resumen viene vacío, se usa `headingPlain` "Games we found".
- Moods: sin cambios y siguen teniendo sentido. `happy` con el corazón y el salto va con "Ooh, …!", `sad` con la gota va con "No games fit…" y con "I only know games.", `think` con el `?` va con "Got it: … Looking…", y `error` con el `!` va con los errores.

**Regla del `{summary}` (medida; restricción dura)**
- El bocadillo reserva **2 líneas** en compacto a ≥ 375 px (3 por debajo de 23.4rem, §14.1). Medí resúmenes realistas en el prototipo (Vite en 5177, Chrome headless, fuentes reales, `?t=9500&mock=results`, cambiando el texto del `span` como hace `verify-screen.mjs`). **Ninguna plantilla cabe en 2 líneas con resúmenes de 36–40 caracteres a 390 px** ("single-player metroidvania for Switch" da 3 líneas con todas las plantillas). A 375 px, `results` falla desde 28 caracteres cuando el resumen tiene letras anchas ("MMORPG with crafting for PS5", "WWE wrestling games for Xbox").
- **Decisión: el narrador solo repite el resumen si mide entre 1 y 26 caracteres.** Con más, o si viene vacío, dice la variante `…Plain`. Por qué no recortarlo con "…" ni con `text-overflow`: un resumen cortado en mitad de una frase ("Ooh, single-player metroid…! Try these.") se lee como un fallo, y `text-overflow` no corta en mitad de un texto que ocupa varias líneas. Una frase completa sin el resumen es mejor que una frase rota.
- **Para el backend** (prompt y schema de `gemini.ts`): pedir `summary` en inglés, de 2 a 4 palabras y **como máximo 26 caracteres**, en minúsculas salvo nombres propios (Switch, PC, Zelda), sin punto final y sin comillas. Ejemplos: "co-op adventure", "souls-like", "metroidvania for Switch", "relaxing 2010s indie games". En `sanitize`: colapsar espacios, quitar la puntuación final y aplicar un tope duro de 40 caracteres (el `h2` usa el resumen entero). Si Gemini se pasa de 26, el cliente usa la frase sin resumen y no se rompe nada.
- **Para el frontend** (`screen.ts`; el texto exacto sí importa):
```ts
const SPOKEN_SUMMARY_MAX = 26; // DESIGN §14.13: longer summaries do not fit 2 lines at 375 px compact
/** The narrator repeats short summaries only; an empty or long one gets the plain line. */
const withSummary = (line: string, plain: string, summary: string) =>
  summary && summary.length <= SPOKEN_SUMMARY_MAX ? fill(line, { summary }) : plain;
// lineFor:        case 'results': return ['results', withSummary(n.results, n.resultsPlain, o.summary)];
// onInterpreted:  (summary) => { found = true; say(withSummary(n.thinkingFound, n.thinkingFoundPlain, summary)); }
```
  En `results.ts`: `heading.textContent = summary ? fill(content.shelf.heading, { summary }) : content.shelf.headingPlain;`. En `api.ts`, `summary` debe ser string (si no lo es → `bad`, como pasaba con `label`) y se guarda con `.trim()`.

**Medidas finales** (frases exactas de abajo; `{summary}` = "Mortal Kombat-like fighter", "MMORPG for Mac and Windows", "Mass Effect-like space RPG" (los tres de 26), "Pokemon-like monster RPG" y "co-op adventure"; `{seconds}` = 120):

| Viewport | Layout | Máx. permitido | Máx. medido | ¿Se mueve el input? |
|---|---|---|---|---|
| 375×667 | compacto | 2 | 2 | 0 px |
| 390×844 | compacto | 2 | 2 | 0 px |
| 1440×900 | compacto | 2 | 2 | 0 px |
| 360×640 / 374×667 | compacto | 3 | 3 / 2 | 0 px |
| 390×844 | full | 3 | 2 | 0 px |
| 1440×900 · 768×1024 · 844×390 | full | 2 | 2 | 0 px |
| 844×390 | compacto | 2 | 2 | 0 px |
| 320×568 | compacto | 3 (orientativo) | 4 ("error", sin cambios; §14.11.3) | 25 px |

Placeholder "A co-op adventure for Switch" (ancho del texto contra la caja de contenido del input): 203/236 px a 320 (columna), 204/306 a 390 (columna), 206/241 a 480 (fila, el caso más justo), 228/366 a 1440 (fila). Se ve entero en todos los anchos.

**`src/content.ts` verbatim (completo)**
```ts
// Single source for every visible string (SPEC §1.1, DESIGN §9, §14.6 and §14.13).
export const content = {
  pageTitle: 'Game Feelings',
  narrator: {
    intro: 'Hey! What kind of game are you looking for?',
    typing: "Take your time. Hit Enter when you're ready.",
    emptyInput: 'Type a kind of game first, like "souls-like".',
    thinking: 'Hmm… let me think about that.',
    thinkingLong: 'Still thinking. Good picks take a moment.',
    thinkingFound: 'Got it: {summary}. Looking…', // only with a summary of 1–26 chars (DESIGN §14.13)
    thinkingFoundPlain: 'Got it! Looking for games…',
    results: 'Ooh, {summary}! Try these.', // only with a summary of 1–26 chars (DESIGN §14.13)
    resultsPlain: 'Ooh, I found some! Try these.',
    noResults: 'No games fit all of that. Try fewer details?',
    offTopic: 'I only know games. Try "cozy farming sim".',
    error: 'My brain is buffering. Give it a moment and try again.',
    errorRate: 'Too many searches in a row. Try again in {seconds}s.',
    errorBusy: 'The game library is busy. Try again in a minute.',
    errorNetwork: "Can't reach the internet. Check your connection.",
    errorSlow: 'That took too long. Try again in a moment.',
    detailBack: 'Want to look for something else?',
  },
  input: {
    label: 'What kind of game?',
    placeholder: 'A co-op adventure for Switch',
    submit: 'Find games',
    submitBusy: 'Thinking…',
  },
  shelf: {
    heading: 'Games matching {summary}', // visually hidden h2 of the row; the full summary (no line limit)
    headingPlain: 'Games we found', // when the summary is empty
    name: '{name}, {year}', // accessible name of a case: "Cozy Grove, 2021"
  },
  theme: {
    toDark: 'Switch to dark theme',
    toLight: 'Switch to light theme',
  },
  footer: {
    credit: 'Chao © SEGA — fan project, not affiliated · Game data by ',
    rawgLabel: 'RAWG',
    rawgUrl: 'https://rawg.io',
  },
  character: {
    alt: 'Chao, a small blue creature with a yellow ball floating above its head',
  },
  // DEV-only scaffolding (?lab).
  styleTile: {
    badge: 'Phase 1 · style tile',
    chromeSample: 'Chrome strip',
    typeHeading: 'Type scale',
    colorHeading: 'Color',
    shapeHeading: 'Radii and spacing',
    typeSample: 'Cozy co-op tonight',
    chaoLab: {
      heading: 'Chao lab',
      moods: 'Mood',
      talk: 'Talk',
      blink: 'Blink',
      compact: 'Compact size',
      enter: 'Enter',
      idle: 'Idle',
      listen: 'Listen',
      think: 'Think',
      happy: 'Happy',
      sad: 'Sad',
      error: 'Error',
    },
  },
} as const;
```

**Otros textos y límites**
- `index.html`: añadir debajo del `<title>` (hoy no hay descripción): `<meta name="description" content="Tell a little Chao what kind of game you want, in English or Spanish, and get a shelf of real games that fit." />` (109 caracteres; los buscadores muestran unos 155). El `<title>` no cambia.
- `src/dev/mock.ts`: `?mock=results` → `summary` "co-op adventure" (se repite en el bocadillo). `?mock=empty` → "single-player metroidvania for Switch" (37 caracteres), para ver `thinkingFoundPlain` sin esperar a que Gemini se pase de largo. La comprobación del bundle que buscaba `nostalgic` (§14.10) pasa a buscar `single-player metroidvania`.
- `maxlength="200"` del input: **sin cambios**. Un requisito es más corto que un sentimiento y el servidor valida igual. No cambia ningún otro límite.
- Pie, toggle de tema, `alt` del Chao y nombres accesibles de las cajas: sin cambios.

**Verificación (para el tester)**
- `scripts/verify-screen.mjs`, sección "C. every phrase fits": cambiar `{ label: 'overwhelmed' }` por los cinco resúmenes de arriba (cada frase con `{summary}` se prueba con los cinco) y **añadir el caso `[375, 667] compact, max 2`**. Las frases `…Plain` entran solas porque no tienen marcador. Esperado: la tabla de medidas.
- Regla del resumen: con un resumen de 27 o más caracteres (`?mock=empty`), el bocadillo dice exactamente `thinkingFoundPlain`. Con "co-op adventure" (`?mock=results`) dice "Got it: co-op adventure. Looking…" y después "Ooh, co-op adventure! Try these.", y el `h2#shelf-heading` dice "Games matching co-op adventure".
- Placeholder: el ancho del texto (canvas con la fuente calculada del input) es ≤ `clientWidth − padding` a 320, 390, 480, 768 y 1440.
- `index.html` lleva `meta[name=description]` con el texto de arriba. Ninguna frase visible contiene "feeling" salvo el título "Game Feelings": `grep -i feeling src/content.ts` solo encuentra `pageTitle`.

**Puntos flojos (honesto)**
1. Un resumen de 27–40 caracteres no se repite en el bocadillo (sale la frase genérica), así que el usuario pierde la confirmación de "te he entendido". Depende de que Gemini respete el máximo de 26. Si a menudo no lo hace, la alternativa es pasar a 3 líneas en compacto también a 375–389 px, que quita unos 26 px de alto a la fila de juegos en un iPhone SE.
2. El margen es de unos 2 caracteres: a 375 px, `results` ya falla con 28 caracteres anchos. Medí en Chrome. Safari dibuja Atkinson casi igual, pero sin comprobar.
3. El resumen sale en inglés aunque el usuario escriba en español ("Ooh, co-op adventure!"). Encaja con la UI en inglés, pero se nota.
4. Ni el placeholder ni la intro dicen que se puede escribir en español: no hay sitio y la UI es inglesa. Solo lo dice la meta description.
5. Para alguien que escribe solo un sentimiento ("estoy triste"), el Chao triste diciendo "I only know games." puede sonar seco. El ejemplo "cozy farming sim" lo suaviza. Si se prefiere recomendar a partir del sentimiento, se cambia en el prompt (riesgo ya anotado en el plan).
6. "Game Feelings" ya no describe la acción tal cual. Es una decisión del usuario y se mantiene.
7. A 320 px, "error" sigue en 4 líneas (no cambia, §14.11.3).

## 15. Fase 5: fila de juegos (cajas PS2)

Cierra US4 (y la parte de US3 que pinta los juegos). Tokens en `tokens.css` (bloque "Phase 5"; `--shelf-block` se elimina). El código de esta sección se probó en un prototipo con los archivos reales del proyecto y **20 resultados reales de RAWG** (sacados una vez de `/api/games` en desarrollo y guardados como datos de prueba; solo URLs públicas de imágenes, ninguna key), en Chrome headless a 1920×1080, 1440×900, 1280×800, 1280×600, 1024×768, 768×1024@2, 390×844@3, 375×667@2, 320×568@2 y 844×390@3, claro y oscuro, con y sin reduced motion: 0 errores de consola, sin scroll horizontal de página, `tsc` sin errores y `vite build` limpio (ni el simulador ni los datos de prueba llegan al bundle). **Revisión 2** (tester, code-reviewer y design-reviewer): hover y medida en el `li`, nombre accesible en un solo texto, sombras y relleno de animación más baratos (60 fps con el fondo vivo), contraste medido de verdad, divisor por tamaño de pantalla con asomo, roving tabindex, velo más corto, banda y franja que varían, fila inerte mientras piensa, simulador en `src/dev/mock.ts` (§15.12).

### 15.1 La caja

```
┌──────────────────────────┐  ← borde --case-rim (1 px) + labio duro --case-shadow-rest; radio --radius-case
│ ◉                  2021  │  ← banda negra (12 %): disco cromado genérico + año (≥ 11 px)
├▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┤  ← línea arcoíris saturada de 2 px (--case-iridescent)
│                     ▐▌   │  ← portada: imagen de RAWG recortada al centro (object-fit: cover)
│      (portada)      ▐▌   │  ← franja vertical (4 combinaciones de color, alternan caja a caja)
│                     ▐▌   │
│░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← placa oscura: empieza justo encima del texto
│ Cozy Grove               │  ← título: display itálica bold, blanco, hasta 3 líneas con elipsis
└──────────────────────────┘
```
> **Revisión 2026-10-05 (SPEC §16 B, decisión del usuario):** la caja pierde el **disco** de la banda y la **franja vertical**. La banda negra (año a la derecha) y la línea arcoíris se quedan. Detalle y tokens retirados en **§18.2**; el dibujo de arriba y los puntos "Referencia" y "Franja vertical" quedan como historia.

- **Proporción 135:190** (`--case-aspect`, caja de DVD tipo PS2). Con la banda del 12 % la portada queda en 3:4 (SPEC US4).
- **Referencia**: plantilla de caja de la imagen 8 del brief (banda negra arriba con línea arcoíris, franja vertical azul-cian, título en sans itálica bold). **Sin marcas**: en vez de repetir "Game Feelings" en 20 cajas, la banda lleva un disco cromado genérico (CSS, no un logo) y el año; la franja vertical alterna 4 combinaciones (azul-cian, violeta-rosa, turquesa-menta, marino-celeste) para que las cajas vecinas se distingan. El contrato de la API no trae género por juego, así que no se usa.
- **Plástico**: funda transparente con un filo claro (`::after`, `--case-sleeve`) y un brillo diagonal que sigue al puntero, **solo sobre la imagen** (bajo la placa del título: sobre el texto bajaba el contraste). Objeto impreso: mismos colores en los dos temas; solo cambia el borde que la separa del fondo.
- **Título**: placa oscura que **empieza `--case-title-fade` (1.6em) por encima del texto** y llega al borde inferior (antes el velo empezaba al 30 % de la portada y la oscurecía media caja). La elipsis vive en un `span` interior, así el relleno de la placa no deja asomar una 4.ª línea. Tamaño por ancho de caja (`--case-title-size`: 13 px a 144 px de ancho, 20 px a 250).
- **Franja vertical**: `--case-spine-w` = `clamp(4px, 5cqi, 14px)`; en cajas pequeñas es fina (antes parecía una barra de scroll).
- **Sin imagen** (falla la carga): la portada queda en el degradado azul `--case-fallback` y el título crece (`--case-title-size-noimg`). Es la entrada 5 de los datos de prueba (URL rota a propósito).

### 15.2 La fila

- **Una fila** (`ul.shelf__row`) con scroll horizontal y snap (`x mandatory`, cada caja `start`), bajo un `h2` visualmente oculto ("Games matching co-op adventure", §14.13) dentro de `section.shelf[aria-labelledby]`.
- **Ancho de caja**: `--case-per-row` cajas a lo ancho del estante — **5.3** en escritorio, **3.4** hasta 48rem (tablet en vertical, 768 incluido), **2.3** por debajo de 30rem; la fracción hace que la siguiente asome. Entre `--case-min-w` (9rem) y `--case-max-w` (16rem; 20rem desde 100rem de ancho), y **nunca más alta de lo que deja la pantalla** (`(100dvh − --shelf-reserve) × --case-aspect`). El estante puede crecer hasta `--shelf-max-w` (120rem): a 1920 las cajas ya no se ven pequeñas.
- **A sangre**: la fila entra en el gutter de la página (margen negativo y padding de `--gutter`, sin `vw`: no se mete bajo la barra de scroll de Windows); `scroll-padding` igual.
- **Asomo garantizado**: además del divisor fraccionario, mientras queden cajas a la derecha (`scrollLeft < max`), `results.ts` pone `data-more` en la fila y aparece una **sombra suave en el borde derecho** (`.shelf::after`, `--shelf-edge`, `--shelf-fade`). Es un pseudo estático, no un `mask-image`: la máscara sobre el scroller se recompone en cada frame sobre el fondo vivo (medido: frames perdidos).
- El padding vertical del scroller (`--shelf-pad-top` 24 px, `--shelf-pad-bottom` 48 px) deja sitio a la elevación, la inclinación, el anillo de foco y la sombra de hover (con `overflow-x: auto` el eje vertical también recorta: antes una línea tenue cortaba las sombras).

Medido ("asomo" = píxeles visibles de la caja cortada a la derecha; "sombra" = `data-more` activo al cargar):

| Pantalla | Caja | Enteras | Asomo | Sombra borde | Portada visible sin scroll | Scroll vertical |
|---|---|---|---|---|---|---|
| 1920×1080 | 320×450 | 5 | 152 px | sí | 100 % | no |
| 1440×900 | 234×329 | 5 | 101 px | sí | 100 % | no |
| 1280×800 | 205×288 | 5 | 93 px | sí | 100 % | 19 px (pie) |
| 1280×600 | 153×216 | 7 | 0 | **sí** | 100 % | sí (pie) |
| 1024×768 | 163×229 | 5 | 77 px | sí | 100 % | no |
| 768×1024 | 197×277 | 3 | 100 px | sí | 100 % | no |
| 390×844 | 147×206 | 2 | 49 px | sí | 100 % | no |
| 375×667 | 144×203 | 2 | 39 px | sí | 100 % | sí (pie) |
| 320×568 | 144×203 | 2 | 0 | **sí** | 85 % | sí |
| 844×390 | 144×203 | 5 | 10 px | sí | 66 % | sí |

Donde el tope por altura o el suelo de 9rem mandan (1280×600, 320×568) no asoma ninguna caja; ahí la sombra del borde es la pista.

**`--shelf-block` desaparece**: la fila tiene altura propia y la fila 3 del grid (`1fr`) se adapta. Para que las pantallas bajas cumplan (al menos la mitad superior de las portadas sin scroll), el grupo superior se recorta:
- **`max-height: 42rem` en compacto**: título a `--text-xl` y huecos menores. **El formulario sigue en columna en teléfonos** (rev. 2): en fila, el input quedaba estrechísimo a 320/375; en columna caben igual (375×667: portada entera; 320×568: 85 %).
- **Apaisado** (`max-height: 30rem` y `min-width: 40rem`, en compacto): narrador y formulario lado a lado bajo el título (66 % de las portadas a 844×390).
- `.screen` y `.screen__stage` llevan `grid-template-columns: minmax(0, 1fr)` (el ancho intrínseco del input ensanchaba la columna en pantallas estrechas).

### 15.3 Movimiento e interacción

| Momento | Qué | Tokens |
|---|---|---|
| Llegan resultados | la fila aparece; cada caja sube `--case-rise` (40 px) con fundido, `--ease-spring`, escalonada `--stagger` (60 ms); a partir de la 8.ª entran juntas. `animation-fill-mode: backwards` (no `both`): al terminar no queda ninguna animación viva que mantenga 20 capas promovidas | `--dur-slow`, `--stagger` |
| Nueva búsqueda | mientras piensa, la fila anterior queda atenuada (`--shelf-busy-opacity` 0.45) e **`inert`** (ni clic ni foco); al llegar los nuevos, se funde en `--dur-fast` y entra la nueva con el scroll al principio (cambio por temporizador) | `--dur-fast` |
| `no-results` / `off_topic` | la fila desaparece (`section[hidden]`) | — |
| `error` | la fila anterior se queda (el fallo es pasajero) y deja de estar atenuada | — |
| Ratón / lápiz encima | **el hover y la medida son del `li`** (que no se mueve): la caja se eleva `--case-lift` y se inclina hacia el puntero (`rotateX`/`rotateY` hasta `--tilt-max`, perspectiva `--case-perspective`); el brillo se desplaza; la sombra grande (`li::before`, `--case-shadow-lift`) aparece por opacidad. Una escritura por frame (rAF), solo en esa caja. Antes, con el puntero en los últimos píxeles, la caja subía, perdía el hover, bajaba y temblaba: medido ahora con el puntero a 4 px del borde inferior, hover estable durante 720 ms | `--tilt-max`, `--case-lift` |
| Foco de teclado | elevación + `--case-focus-tilt` (4°) + anillo a `--case-focus-offset` + sombra grande | — |
| Táctil | sin inclinación (el dedo hace scroll de la fila); `:active` la devuelve a su sitio | — |
| Reduced motion | sin inclinación, sin elevación, sin brillo móvil; entrada con fundido corto, todas a la vez | — |

**Teclado (roving tabindex)**: cada caja es un `<a href="?game=<slug>">`, pero la fila es **una sola parada de Tab**: solo la caja activa lleva `tabindex="0"` (al principio la 1.ª; después, la última enfocada, también por clic) y las demás `-1`. Dentro: ← / → caja anterior / siguiente, Inicio / Fin primera / última (siempre con `preventDefault`, también en los extremos; con Alt/Ctrl/⌘/Mayús no se toca nada). Otro Tab sale al pie; Mayús+Tab vuelve a la última caja enfocada. El foco desplaza la caja a la vista.

**Nombre accesible**: `aria-label` en el enlace con un solo texto, "Cozy Grove, 2021" (`content.shelf.name`); banda, portada y título son `aria-hidden` (el texto visible duplicaría el nombre). Antes el nombre se componía de dos `span` y salía "… , 2019".

**Clic / Enter (contrato con la fase 6)**: un clic normal o Enter llama a `preventDefault()` y lanza **`game:open`** en `#app` con `detail = { game, opener }`. En esta fase nadie lo escucha: el clic no hace nada visible (a propósito; sin nada provisional). La fase 6 lo escucha, hace `pushState` con `?game=<slug>`, abre el panel, llama a `screen.detail(true)` y devuelve el foco a `opener`. Ctrl/⌘/Mayús/clic central dejan actuar al enlace.

### 15.4 Imágenes

- RAWG devuelve `background_image` a tamaño completo (~140 KB). El cliente pide la copia reducida de `/media/resize/<ancho>/-/<ruta>`: **640 px (~25–65 KB) para 1×, 1280 px para 2×** (`srcset` con descriptores `x`). Comprobado con URLs reales de juegos y de capturas. Otras URLs se usan tal cual.
- `loading="lazy"`, `decoding="async"`, `width`/`height` en la etiqueta y tamaño fijado por CSS: sin saltos de layout.
- Error de carga → `case--noimg` (§15.1).

### 15.5 Rendimiento (medido, fondo vivo)

20 cajas con imágenes reales, **fondo WebGL vivo** (sin `?t=`), ratón barriendo la fila (80 movimientos en 4 s) y scroll de 600 px a mitad, SwiftShader, 3 tomas:

| | p50 | p95 | frames > 33 ms | hilo principal |
|---|---|---|---|---|
| 1440×900 | 16.7 ms | 16.7–16.8 ms | 0 / 1 / 2 | 15–28 % |
| 390×844@3 | 16.7 ms | 16.7–16.8 ms | 0 / 0 / 0 | 18–33 % |

**Corrección de la revisión 1**: allí se midió con el fondo congelado (`?t=9500`) y la cifra (p95 16.8) no valía; con el fondo vivo había 15–35 frames > 33 ms a 1440. A/B intercalados (3 rondas) para encontrar la causa:
- `animation-fill-mode: both` en la entrada: la animación quedaba viva y mantenía 20 capas promovidas → **`backwards`** (de ~25 a ~4 frames perdidos).
- Sombra difuminada en reposo en las 20 cajas → **labio duro sin desenfoque** (`--case-shadow-rest`) y la sombra grande solo en la caja con hover/foco (pseudo por opacidad) → 0.
- `mask-image` para el fundido del borde → **pseudo estático** (§15.2).
- Lo que no cambió nada (y se queda): la inclinación en sí, las imágenes, el brillo. Quitar el `transform` en reposo empeoraba.

### 15.6 Contraste

Medido en Chrome con **portadas blancas** (el peor caso): texto del título transparente, captura del rectángulo del texto y su píxel más claro.

| Par | Valor | Mínimo |
|---|---|---|
| Título blanco sobre la placa (1440, 390 y 1280×600; 1, 2 y 3 líneas) | **15.9 : 1** | 4.5 |
| Año (`--knox-shine`) sobre la banda | > 18 : 1 | 4.5 |
| Borde de la caja (`--case-rim`) / fondo claro (perla … peor cian `#9ac8f2`) | 4.4 … 3.75 | 3 (UI) |
| Borde de la caja / fondo oscuro (peor `#175db0`) | ≥ 3.25 | 3 (UI) |
| Anillo de foco | §8 | 3 (UI) |

**Corrección de la revisión 1**: el tester midió 5.8:1 (390) y 6.0:1 (1440), no "≥ 15". La causa era el **brillo diagonal pintado encima del texto** (blanco al 20 %); ahora va debajo de la placa. Lo que sostiene el 15.9 está en tokens con comentario (§15.6): `--case-scrim`, `--case-title-fade`, `--case-title-inset`, `--case-title-size`. Límite: la caja que asoma bajo la sombra del borde derecho se lee peor (está a medio salir de pantalla).

### 15.7 Narrador

Sin cambios (§14): `results` dice "Ooh, {summary}! Try these." (re-enfoque, §14.13) con el Chao contento; la fila aparece justo después del FLIP a compacto.

### 15.8 Archivos verbatim

`src/sections/results.ts` (sustituye entero):
```ts
// Games row: one horizontal shelf of PS2-style cases (SPEC US4, DESIGN.md §15).
import { content } from '../content';
import type { Game } from '../lib/api';
import { el, fill } from '../lib/dom';
import { ease, time, token } from '../lib/tokens';

/** Phase 6 hook: a case was activated (click / Enter). `opener` gets the focus back when the detail closes. */
export type OpenGame = (game: Game, opener: HTMLAnchorElement) => void;

export interface Shelf {
  el: HTMLElement;
  /** Replaces the row (the old one fades out first). */
  show(games: Game[], label: string): void;
  /** No row (no-results / off-topic). */
  clear(): void;
  /** While a new search runs: the current row dims and is inert. */
  busy(on: boolean): void;
}

const STAGGER_CAP = 7; // cases after the 8th enter together (they start off-screen anyway)
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/** RAWG serves resized copies at /media/resize/<width>/-/<path> (640 px wide is ~25-65 KB vs ~140 KB). Other URLs are used as they are. */
export function rawgImage(url: string, width: number): string {
  const m = /^https:\/\/media\.rawg\.io\/media\/(?!resize\/|crop\/)(.+)$/.exec(url);
  return m ? `https://media.rawg.io/media/resize/${width}/-/${m[1]}` : url;
}

function gameCase(game: Game, index: number, onOpen: OpenGame): HTMLLIElement {
  const year = game.released?.slice(0, 4) ?? '';
  const art = el('img', {
    class: 'case__art', alt: '', width: '640', height: '360', loading: 'lazy', decoding: 'async',
    src: rawgImage(game.image, 640), srcset: `${rawgImage(game.image, 640)} 1x, ${rawgImage(game.image, 1280)} 2x`,
  });
  const link = el('a', {
    class: 'case', href: `?game=${encodeURIComponent(game.slug)}`, tabindex: index === 0 ? '0' : '-1', // roving tabindex: one stop for the whole row
    'aria-label': year ? fill(content.shelf.name, { name: game.name, year }) : game.name, // one run: "Cozy Grove, 2021"
  },
    el('span', { class: 'case__band', 'aria-hidden': 'true' }, el('span', { class: 'case__year' }, year)),
    el('span', { class: 'case__cover', 'aria-hidden': 'true' }, art, el('span', { class: 'case__spine' })),
    el('span', { class: 'case__title', 'aria-hidden': 'true' }, el('span', { class: 'case__name' }, game.name)), // textContent only: RAWG data never becomes markup
  );
  art.addEventListener('error', () => link.classList.add('case--noimg'), { once: true });
  link.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab / window: the ?game= link works on its own (phase 6)
    e.preventDefault();
    onOpen(game, link);
  });
  const item = el('li', { class: 'shelf__item' }, link);
  item.style.setProperty('--i', String(Math.min(index, STAGGER_CAP)));
  return item;
}

/** Tilt (mouse/pen), roving tabindex + arrow keys, and the "more to the right" fade. */
function wire(row: HTMLUListElement): void {
  const tiltMax = parseFloat(token('--tilt-max')) || 12;
  let item: HTMLElement | null = null; // the li under the pointer: it never moves, so hover and the measurement stay put
  let last: PointerEvent | null = null;
  let raf = 0;
  const caseOf = (li: HTMLElement | null) => li?.firstElementChild as HTMLElement | null | undefined;
  const reset = (li: HTMLElement | null) => { const c = caseOf(li); c?.style.removeProperty('--rx'); c?.style.removeProperty('--ry'); c?.style.removeProperty('--sheen'); };
  const apply = () => {
    raf = 0;
    const c = caseOf(item);
    if (!item || !c || !last) return;
    const r = item.getBoundingClientRect();
    const x = (last.clientX - r.left) / r.width - 0.5;
    const y = (last.clientY - r.top) / r.height - 0.5;
    c.style.setProperty('--rx', `${(-y * 2 * tiltMax).toFixed(2)}deg`);
    c.style.setProperty('--ry', `${(x * 2 * tiltMax).toFixed(2)}deg`);
    c.style.setProperty('--sheen', (x * 2).toFixed(3));
  };
  row.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || reduce.matches) return; // touch scrolls the row; no tilt fighting the finger
    const li = (e.target as Element).closest<HTMLElement>('.shelf__item');
    if (li !== item) { reset(item); item = li; }
    last = e;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  row.addEventListener('pointerleave', () => { reset(item); item = null; });

  const cases = () => [...row.querySelectorAll<HTMLAnchorElement>('.case')];
  row.addEventListener('focusin', (e) => { // the last focused case is the row's single Tab stop
    const target = e.target as HTMLElement;
    if (!target.classList.contains('case')) return;
    for (const c of cases()) c.tabIndex = c === target ? 0 : -1;
  });
  row.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const all = cases();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault(); // also at the ends: the row never scrolls on its own under the focus
    const j = e.key === 'ArrowRight' ? Math.min(i + 1, all.length - 1) : e.key === 'ArrowLeft' ? Math.max(i - 1, 0) : e.key === 'Home' ? 0 : all.length - 1;
    all[j].focus(); // focus scrolls it into view (scroll-padding keeps it clear of the edge)
  });

  const more = () => row.toggleAttribute('data-more', row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  row.addEventListener('scroll', more, { passive: true });
  new ResizeObserver(more).observe(row);
}

export function createShelf(onOpen: OpenGame): Shelf {
  const heading = el('h2', { class: 'visually-hidden', id: 'shelf-heading' });
  const section = el('section', { class: 'shelf', 'aria-labelledby': 'shelf-heading', 'aria-busy': 'false', hidden: '' }, heading);
  let row: HTMLUListElement | null = null;
  let swapTimer = 0;
  const build = (games: Game[], label: string) => {
    swapTimer = 0;
    row?.remove();
    heading.textContent = fill(content.shelf.heading, { label });
    row = el('ul', { class: 'shelf__row', role: 'list' }, ...games.map((g, i) => gameCase(g, i, onOpen)));
    wire(row);
    section.append(row);
    section.hidden = false;
  };
  return {
    el: section,
    show(games, label) {
      clearTimeout(swapTimer);
      if (!row || reduce.matches) return build(games, label);
      const out = time('--dur-fast', 160);
      row.animate([{ opacity: 0 }], { duration: out, easing: ease('--ease-in', 'ease-in'), fill: 'forwards' });
      swapTimer = window.setTimeout(() => build(games, label), out); // a timer, not .finished: it fires without frames too
    },
    clear() {
      clearTimeout(swapTimer);
      row?.remove();
      row = null;
      section.hidden = true;
    },
    busy(on) {
      section.setAttribute('aria-busy', String(on));
      if (row) row.inert = on; // dimmed = not clickable, not focusable
    },
  };
}
```

`src/styles/results.css` (sustituye entero):
```css
/* ===== Games row: PS2-style cases (DESIGN.md §15). Tokens only. ===== */

.shelf {
  position: relative;
  grid-row: 3;
  inline-size: 100%;
  max-inline-size: var(--shelf-max-w);
  margin-block-start: var(--space-3);
  container-type: inline-size; /* the cases size themselves from the shelf width (cqi) */
}
.shelf[hidden] { display: none; }

.shelf__row {
  /* --case-per-row across the shelf (a fraction, so the next case peeks), between a floor and a ceiling,
     and never taller than the screen allows */
  --case-w: max(var(--case-min-w), min(
    calc((100cqi - (var(--case-per-row) - 1) * var(--case-gap)) / var(--case-per-row)),
    var(--case-max-w),
    calc((100dvh - var(--shelf-reserve)) * var(--case-aspect))));
  display: flex;
  gap: var(--case-gap);
  margin: 0 calc(-1 * var(--gutter)); /* bleeds into the page gutters: the row runs to the screen edges */
  padding: var(--shelf-pad-top) var(--gutter) var(--shelf-pad-bottom);
  list-style: none;
  overflow-x: auto;
  overflow-y: hidden; /* the vertical padding gives room for the lift, the tilt, the focus ring and the shadow */
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: var(--gutter);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  transition: opacity var(--dur-base) var(--ease-out);
}
.shelf::after { /* more cases to the right: a soft shade on the right edge (results.ts sets data-more on the row while scrollLeft < max).
  A static overlay, not a mask: a mask on the scroller is re-composited every frame over the live background (measured: dropped frames) */
  content: "";
  position: absolute;
  inset-block: var(--shelf-pad-top) var(--shelf-pad-bottom);
  inset-inline-end: calc(-1 * var(--gutter));
  inline-size: var(--shelf-fade);
  background: linear-gradient(to left, var(--shelf-edge), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 80%, transparent); /* static pseudo: its ends fade, no hard edge below the cases */
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
  pointer-events: none;
}
.shelf:has(.shelf__row[data-more])::after { opacity: 1; }
.shelf[aria-busy="true"] .shelf__row { opacity: var(--shelf-busy-opacity); } /* a new search is running (the row is inert too) */

.shelf__item {
  position: relative;
  flex: none;
  scroll-snap-align: start;
  animation: case-in var(--dur-slow) var(--ease-spring) calc(var(--i) * var(--stagger)) backwards; /* not "both": a filled animation keeps 20 layers promoted (measured: dropped frames over the live background) */
}
.shelf__item::before { /* the big shadow: drawn only for the hovered / focused case (opacity), a light one stays on every case */
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius-case);
  box-shadow: var(--case-shadow-lift);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
  pointer-events: none;
}
@keyframes case-in {
  from { opacity: 0; translate: 0 calc(var(--case-rise) * var(--motion-scale)); }
}

/* ---------- The case ---------- */
.case {
  --rx: 0deg;
  --ry: 0deg;
  --lift: 0px;
  --sheen: 0;
  position: relative;
  display: grid;
  grid-template-rows: var(--case-band) 1fr;
  inline-size: var(--case-w);
  aspect-ratio: var(--case-aspect); /* a DVD-style PS2 case */
  overflow: hidden;
  container-type: inline-size; /* text sizes follow the case width */
  border-radius: var(--radius-case);
  background: var(--case-plastic);
  box-shadow: 0 0 0 var(--border-hairline) var(--case-rim), var(--case-shadow-rest);
  color: var(--case-text);
  text-decoration: none;
  transform: perspective(var(--case-perspective)) translateY(var(--lift)) rotateX(var(--rx)) rotateY(var(--ry));
  transition: transform var(--dur-fast) var(--ease-out);
}
.case::after { /* clear plastic sleeve: hairline highlight on the edge and the hinge side */
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: inherit;
  box-shadow: inset 0 0 0 var(--border-hairline) var(--case-sleeve), inset 3px 0 0 var(--case-sleeve);
  pointer-events: none;
}

.case__band { /* the black top band of a game case: a generic disc mark, the year, and a rainbow hairline under it */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 7%;
  background: var(--case-band-bg);
  border-block-end: var(--case-line-w) solid transparent;
  border-image: var(--case-iridescent) 1;
  font-family: var(--font-display);
  font-style: italic;
  font-weight: var(--weight-display);
  font-stretch: var(--font-stretch-display-compact);
  font-size: var(--case-band-size);
  line-height: 1;
}
.case__band::before { /* disc mark: a small chrome ring (no trademark) */
  content: "";
  inline-size: 1.1em;
  block-size: 1.1em;
  border-radius: var(--radius-pill);
  background: radial-gradient(circle, var(--case-band-bg) 0 22%, transparent 24%), var(--chrome-gradient);
}
.case__year { color: var(--knox-shine); }

.case__cover { position: relative; overflow: hidden; background: var(--case-fallback); }
.case__cover::before { /* moving sheen over the art only (below the title's dark plate): follows the pointer through --sheen (-1..1) */
  content: "";
  position: absolute;
  inset: 0 -40%;
  z-index: 1;
  background: var(--case-sheen);
  translate: calc(var(--sheen) * 18%) 0;
  transition: translate var(--dur-fast) var(--ease-out);
}
.case__art {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover; /* RAWG gives landscape screenshots: the centre is cropped to the cover's 3:4 */
}
.case__spine { /* side strip of the vibe-image-8 template; four colourways so neighbouring cases differ */
  position: absolute;
  inset-block: 0 30%;
  inset-inline-end: 7%;
  inline-size: var(--case-spine-w);
  background: var(--case-spine);
  box-shadow: inset 1px 0 0 var(--case-sleeve);
}
.shelf__item:nth-child(4n + 2) .case__spine { background: var(--case-spine-2); }
.shelf__item:nth-child(4n + 3) .case__spine { background: var(--case-spine-3); }
.shelf__item:nth-child(4n + 4) .case__spine { background: var(--case-spine-4); }

.case__title { /* the dark plate starts just above the text and runs to the bottom edge: AA on any art (§15.6) */
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 2;
  padding: var(--case-title-fade) 8% var(--case-title-inset);
  background: linear-gradient(transparent, var(--case-scrim) var(--case-title-fade));
  font-family: var(--font-display);
  font-style: italic;
  font-weight: var(--weight-display);
  font-stretch: var(--font-stretch-display-compact);
  font-size: var(--case-title-size);
  line-height: var(--leading-tight);
}
.case__name { /* the clamp lives on the inner span: the plate's padding never shows a 4th line */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  overflow-wrap: break-word;
}

/* No image (RAWG failed): the cover keeps its colour block and the title grows */
.case--noimg .case__art { display: none; }
.case--noimg .case__title { font-size: var(--case-title-size-noimg); }

/* ---------- Interaction: hover is read on the li (it never moves), so a lifted case does not lose it ---------- */
@media (hover: hover) {
  .shelf__item:hover .case { --lift: var(--case-lift); }
  .shelf__item:hover::before { opacity: 1; }
}
.case:focus-visible { --lift: var(--case-lift); --rx: var(--case-focus-tilt); outline-offset: var(--case-focus-offset); }
.shelf__item:has(.case:focus-visible)::before { opacity: 1; }
.case:active { --lift: 0px; }

@media (prefers-reduced-motion: reduce) {
  .case,
  .shelf__item:hover .case,
  .case:focus-visible { transform: none; transition: none; }
  .case__cover::before { translate: none; transition: none; }
}
```

`src/styles/screen.css` (sustituye entero):
```css
/* ===== Single screen: title, narrator, feeling form, shelf slot (DESIGN.md §14). Tokens only. ===== */

body { overflow-x: clip; } /* the Chao enters from -100vw: never a horizontal scrollbar (clip, not hidden: no scroll container) */

#app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-block-size: 100dvh;
}

/* ---------- Top bar: theme toggle only ---------- */
.top-bar {
  position: relative;
  z-index: var(--z-chrome);
  display: flex;
  justify-content: flex-end;
  padding: var(--space-4) var(--gutter) 0;
}

/* Plastic material (DESIGN §5) */
.theme-toggle,
.bubble {
  background: var(--plastic-bg);
  border: var(--border-hairline) solid var(--plastic-rim);
  box-shadow: var(--shadow-plastic);
}

.theme-toggle {
  position: relative;
  display: grid;
  place-items: center;
  min-inline-size: var(--space-7);
  min-block-size: var(--space-7);
  padding: var(--space-3);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  transition: transform var(--dur-fast) var(--ease-out);
}
.theme-toggle__icon { /* half-filled disc: "contrast / theme" without an icon set */
  inline-size: var(--space-5);
  block-size: var(--space-5);
  border-radius: var(--radius-pill);
  border: var(--border-control) solid currentColor;
  background: linear-gradient(90deg, currentColor 50%, transparent 50%);
}

/* Hover glow on ::after so only its opacity animates (toggle and submit) */
.theme-toggle::after,
.feeling__submit::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--glow-accent);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
  pointer-events: none;
}
.theme-toggle:active,
.feeling__submit:not(:disabled):active {
  transform: scale(var(--press-scale));
  box-shadow: var(--shadow-plastic-pressed);
}

/* ---------- Screen grid: intro = stage centred a little above the middle; compact = stage on top + shelf ---------- */
.screen {
  display: grid;
  grid-template-rows: 1fr auto 1.22fr; /* 1 : 1.22 puts the stage's centre at ~45 % (DESIGN §10) */
  grid-template-columns: minmax(0, 1fr); /* the column never grows past the screen: an input's intrinsic width (size=20) used to push it to 363 px at 320 */
  justify-items: center;
  min-inline-size: 0;
  padding: 0 var(--gutter) var(--space-6);
}

.screen__stage {
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr); /* same: children shrink to the screen instead of widening it */
  justify-items: center;
  gap: var(--space-4);
  inline-size: 100%;
}

/* FLIP targets: origins live here so the JS keyframes carry only translate/scale (compositor-friendly) */
.screen__title { display: grid; justify-items: center; transform-origin: 0 0; } /* an ancestor of .title-wrap, which bounces */
.feeling { transform-origin: 0 0; }

/* Knox lettering, 3 layers (DESIGN §3.1) */
.title {
  position: relative;
  isolation: isolate;
  font-family: var(--font-display);
  font-style: italic;
  font-weight: var(--weight-display-heavy);
  font-stretch: var(--font-stretch-display);
  font-size: var(--title-size);
  line-height: var(--leading-display);
  letter-spacing: var(--tracking-display);
  text-align: center;
  color: transparent;
  transform: skewX(var(--knox-skew));
}
.title::before,
.title::after {
  content: attr(data-text) / "";
  position: absolute;
  inset: 0;
}
.title::before {
  z-index: -1;
  color: var(--knox-extrude-1);
  text-shadow: var(--knox-ring);
  filter: var(--knox-extrusion);
}
.title::after {
  color: transparent;
  background: var(--knox-gloss);
  background-size: 100% 1lh;
  -webkit-background-clip: text;
  background-clip: text;
}

/* ---------- Narrator: Chao + bubble with a tail ---------- */
.narrator {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--space-3) + var(--bubble-tail)); /* the tail lives in the gap */
  max-inline-size: 100%;
  padding-block-start: calc(var(--chao-current) * var(--chao-headroom)); /* room for the happy jump + ball (DESIGN §13.15) */
  transform-origin: 0 100%; /* FLIP: anchored at its bottom edge */
}
.narrator .chao { transform-origin: 0 100%; } /* FLIP scale; chao.css sets no origin on .chao itself */

.bubble {
  --bubble-min-lines: 3;
  position: relative;
  display: flex;
  align-items: center; /* a one-line message sits in the middle of the reserved height */
  min-inline-size: 0;
  max-inline-size: var(--width-bubble);
  min-block-size: calc(var(--bubble-min-lines) * 1lh + 2 * var(--space-4) + 2 * var(--border-hairline)); /* lines change, the layout does not */
  margin-block-end: var(--space-5);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) var(--radius-bubble-tail);
  font-size: var(--text-lg);
  line-height: var(--leading-snug);
  color: var(--color-text);
  transform-origin: 0 100%; /* the corner that points at the Chao: the intro pop grows from here */
}
/* Tail: a wedge on the bubble's left edge, low, pointing down-left at the Chao. Two clipped layers outside the box
   (rim, then fill 1 px inside it), so the translucent plastic never doubles up over the box. */
.bubble::before,
.bubble::after {
  content: "";
  position: absolute;
  inset-inline-start: calc(-1 * var(--bubble-tail));
  inset-block-end: var(--space-3);
  inline-size: calc(var(--bubble-tail) + var(--border-hairline));
  block-size: calc(var(--bubble-tail) * 1.5);
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}
.bubble::before { background: var(--plastic-rim); }
.bubble::after {
  inset-block-end: calc(var(--space-3) + var(--border-hairline));
  inset-inline-start: calc(-1 * var(--bubble-tail) + 1.6 * var(--border-hairline));
  background: var(--plastic-fill);
}

[data-hidden] { visibility: hidden; } /* bubble and form before the intro reveals them (not reachable by keyboard or screen reader) */

/* ---------- Feeling form ---------- */
.feeling {
  display: flex;
  gap: var(--space-2);
  inline-size: min(100%, var(--width-input));
}

.feeling__input {
  flex: 1;
  min-inline-size: 0;
  min-block-size: var(--space-7);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border: var(--border-control) solid var(--color-border);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-plastic);
  color: var(--color-text);
}
.feeling__input::placeholder { color: var(--color-text-muted); }
.feeling__input[readonly] { color: var(--color-text-muted); cursor: progress; }
.feeling__input[aria-invalid="true"] { /* empty submit: the edge turns twice as thick (a shape cue, not only a colour one; also with reduced motion) */
  border-color: var(--color-border-hover);
  box-shadow: inset 0 0 0 var(--border-control) var(--color-border-hover), var(--shadow-plastic);
}

.feeling__submit {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  min-block-size: var(--space-7);
  padding: 0 var(--space-5);
  border: var(--border-control) solid transparent;
  border-radius: var(--radius-pill);
  background: linear-gradient(var(--accent-gloss), transparent var(--accent-gloss-stop)), var(--color-accent); /* gloss stays above the label */
  box-shadow: var(--shadow-plastic);
  color: var(--color-on-accent);
  font-weight: var(--weight-bold);
  transition: transform var(--dur-fast) var(--ease-out);
}
.feeling__go,
.feeling__busy { grid-area: 1 / 1; } /* both labels in one cell: the button keeps the width of the longer one */
.feeling__busy,
.feeling[aria-busy="true"] .feeling__go { visibility: hidden; }
.feeling[aria-busy="true"] .feeling__busy { visibility: visible; }
.feeling__submit:disabled { cursor: progress; opacity: var(--disabled-opacity); }

@media (hover: hover) {
  .theme-toggle:hover {
    background: var(--plastic-bg-hover);
    border-color: var(--plastic-rim-hover);
  }
  .theme-toggle:hover::after,
  .feeling__submit:not(:disabled):hover::after { opacity: 1; }
  .feeling__input:not([readonly]):hover { border-color: var(--color-border-hover); }
}

/* ---------- Compact layout: results / no-results / error / detail, and it stays (DESIGN §14.3). The games row: results.css ---------- */
#app[data-layout="compact"] {
  --title-size: var(--text-2xl);
  --title-bounce-distance: var(--title-bounce-distance-compact);
  --chao-current: var(--chao-size-compact);
}
#app[data-layout="compact"] .screen { grid-template-rows: 0 auto 1fr; padding-block-start: var(--space-4); } /* clear of the theme toggle, title bounce included */
#app[data-layout="compact"] .bubble { --bubble-min-lines: 2; } /* every compact line fits in 2 lines, also at 390 px */

/* ---------- Footer credit (text on background; halo in holo.css) ---------- */
.credit {
  padding: var(--space-4) var(--gutter) var(--space-5);
  text-align: center;
  text-wrap: balance;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.credit a { /* 44 px tall hit area without changing the line (inline padding does not move the text) */
  padding: var(--space-4) var(--space-2);
  margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-2));
}

@media (max-width: 29.99rem) { /* phones: the input gets the full width (the placeholder fits) and the button a full-width tap target */
  .feeling { flex-direction: column; }
}

@media (max-width: 23.4rem) { /* narrow phones (< 375 px): several compact lines need 3 lines */
  #app[data-layout="compact"] .bubble { --bubble-min-lines: 3; }
}

@media (min-width: 768px) {
  .bubble { --bubble-min-lines: 2; }
}

@media (max-height: 30rem) { /* short screens (phones in landscape): the whole intro fits above the fold */
  #app {
    --title-size: var(--text-2xl);
    --chao-current: var(--chao-size-compact);
  }
  .top-bar { padding-block-start: var(--space-2); }
  .screen { grid-template-rows: 0.3fr auto 1fr; padding-block-end: var(--space-3); }
  .screen__stage { gap: var(--space-2); }
  .bubble { --bubble-min-lines: 2; margin-block-end: var(--space-3); }
  .credit { padding-block: var(--space-2) var(--space-3); }
}

@media (max-height: 42rem) { /* short screens in compact (375x667, 320x568, 1280x600): the stage gives height to the games row */
  #app[data-layout="compact"] { --title-size: var(--text-xl); }
  #app[data-layout="compact"] .screen { padding-block-start: var(--space-2); }
  #app[data-layout="compact"] .screen__stage { gap: var(--space-2); }
  #app[data-layout="compact"] .bubble { margin-block-end: var(--space-3); }
}

@media (max-height: 30rem) and (min-width: 40rem) { /* phones in landscape, compact: narrator and form side by side, so half of the cases show */
  #app[data-layout="compact"] .screen__stage {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: "title title" "narrator form";
    align-items: end;
    column-gap: var(--space-5);
    max-inline-size: var(--width-page);
  }
  #app[data-layout="compact"] .screen__title { grid-area: title; }
  #app[data-layout="compact"] .narrator { grid-area: narrator; }
  #app[data-layout="compact"] .feeling { grid-area: form; margin-block-end: var(--space-3); }
}
```

`src/sections/screen.ts` (sin cambios respecto a la revisión 1 de la fase 5; se repite para que esta sección sea la fuente completa):
```ts
// Single screen + narrator state machine (SPEC §1.1, DESIGN.md §14).
import { content } from '../content';
import type { Finder, Outcome } from '../lib/api';
import { el, fill } from '../lib/dom';
import { ease, px, time } from '../lib/tokens';
import { playEnter, setMood, startBlink, talk, type Mood } from './chao';
import { chaoRig } from './chao-rig';
import { createShelf, type OpenGame } from './results';

export type State = 'intro' | 'typing' | 'empty-input' | 'thinking' | 'results' | 'no-results' | 'error' | 'detail';

/** States that switch the layout to compact. Once compact, the layout stays compact (§14.3). */
const COMPACT: ReadonlySet<State> = new Set<State>(['results', 'no-results', 'error', 'detail']);
const MOOD: Record<State, Mood> = {
  intro: 'idle', typing: 'listen', 'empty-input': 'listen', thinking: 'think',
  results: 'happy', 'no-results': 'sad', error: 'error', detail: 'idle',
};
const LONG_WAIT_MS = 4000; // then the narrator says it is still thinking
const DEFAULT_RETRY_S = 10;
const HAS_TEXT = /[^\p{Cc}\p{Cf}\p{Z}]/u; // same rule as the server (api/_lib/validate.ts): blank = nothing printable

const n = content.narrator;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)'); // touch: never pop the keyboard by script

/** What the narrator says for an outcome, and the state it leads to. */
export function lineFor(o: Outcome): [State, string] {
  switch (o.kind) {
    case 'results': return ['results', fill(n.results, { label: o.label })];
    case 'no-results': return ['no-results', n.noResults];
    case 'off-topic': return ['no-results', n.offTopic];
    case 'error': {
      const line = o.reason === 'rate' ? fill(n.errorRate, { seconds: o.retryAfter ?? DEFAULT_RETRY_S })
        : o.reason === 'busy' ? n.errorBusy
        : o.reason === 'network' ? n.errorNetwork
        : o.reason === 'slow' ? n.errorSlow
        : n.error;
      return ['error', line];
    }
  }
}

export interface Screen {
  main: HTMLElement;
  /** Intro: Chao enters, the bubble says hello, then the form appears. */
  start(): Promise<void>;
  /** Phase 6 hook: the detail panel calls detail(true) when it opens and detail(false) when it closes. */
  detail(open: boolean): void;
}

export function createScreen(app: HTMLElement, find: Finder): Screen {
  const chao = chaoRig();
  const text = el('span', { class: 'bubble__text' }); // only the text fades between lines; the box stays put
  const bubble = el('p', { class: 'bubble', id: 'narrator-line', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-hidden': '' }, text);
  const input = el('input', {
    class: 'feeling__input', id: 'feeling', name: 'feeling', type: 'text', maxlength: '200', autocomplete: 'off',
    enterkeyhint: 'search', placeholder: content.input.placeholder, 'aria-describedby': 'narrator-line',
  });
  const submit = el('button', { class: 'feeling__submit', type: 'submit' },
    el('span', { class: 'feeling__go' }, content.input.submit), el('span', { class: 'feeling__busy' }, content.input.submitBusy));
  const form = el('form', { class: 'feeling', role: 'search', novalidate: '', 'aria-busy': 'false', 'data-hidden': '' },
    el('label', { class: 'visually-hidden', for: 'feeling' }, content.input.label), input, submit);
  const title = el('div', { class: 'screen__title' },
    el('div', { class: 'title-wrap' }, el('h1', { class: 'title', 'data-text': content.pageTitle }, content.pageTitle)));
  const narrator = el('div', { class: 'narrator' }, chao, bubble);
  // Phase 6 listens for 'game:open' on #app ({ game, opener }) and opens the detail panel (it also owns ?game=<slug>).
  const openGame: OpenGame = (game, opener) => app.dispatchEvent(new CustomEvent('game:open', { detail: { game, opener } }));
  const shelf = createShelf(openGame);
  const main = el('main', { class: 'screen' }, el('div', { class: 'screen__stage' }, title, narrator, form), shelf.el);
  app.dataset.state = 'intro';
  app.dataset.layout = 'full';

  // ---- the bubble: the text fades out, swaps on a timer, fades in; the Chao "talks" as the new line appears ----
  // A timer (not animation.finished) drives the swap: it still fires in a background tab or on a slow machine.
  let swapTimer = 0;
  let nextLine = '';
  const show = (line: string) => {
    text.getAnimations().forEach((a) => a.cancel());
    text.textContent = line;
    talk(chao, line);
  };
  const say = (line: string) => {
    nextLine = line;
    if (swapTimer) return; // a fade-out is running: it will show the newest line
    if (!text.textContent || reduce.matches) return show(line);
    const out = time('--dur-fast', 160);
    text.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: ease('--ease-in', 'ease-in'), fill: 'forwards' });
    swapTimer = window.setTimeout(() => {
      swapTimer = 0;
      show(nextLine);
      text.animate([{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }], { duration: time('--dur-base', 260), easing: ease('--ease-out') });
    }, out);
  };

  // ---- FLIP of the stage when the layout turns compact (transform-origin is set in screen.css) ----
  const measure = () => ({ title: title.getBoundingClientRect(), narrator: narrator.getBoundingClientRect(), form: form.getBoundingClientRect(), chaoH: chao.offsetHeight });
  const flip = (first: ReturnType<typeof measure>) => {
    const opts: KeyframeAnimationOptions = { duration: time('--dur-slow', 480), easing: ease('--ease-out') };
    // the narrator is anchored at its bottom edge: the Chao and the bubble sit there, its top is only headroom
    const move = (node: HTMLElement, a: DOMRect, scaled: boolean, anchor: 'top' | 'bottom' = 'top') => {
      const b = node.getBoundingClientRect();
      const s = scaled && b.width ? a.width / b.width : 1;
      const dy = anchor === 'top' ? a.top - b.top : a.bottom - b.bottom;
      node.animate([{ translate: `${a.left - b.left}px ${dy}px`, scale: String(s) }, { translate: '0 0', scale: '1' }], opts);
    };
    move(title, first.title, true);
    move(narrator, first.narrator, false, 'bottom');
    move(form, first.form, false);
    if (chao.offsetHeight) chao.animate([{ scale: String(first.chaoH / chao.offsetHeight) }, { scale: '1' }], opts);
  };

  const go = (state: State, line?: string, mood: Mood = MOOD[state]) => {
    const wasCompact = app.dataset.layout === 'compact';
    const compact = wasCompact || COMPACT.has(state);
    const first = compact !== wasCompact && !reduce.matches ? measure() : null;
    app.dataset.state = state;
    app.dataset.layout = compact ? 'compact' : 'full';
    if (first) flip(first);
    if (chao.dataset.mood !== mood) setMood(chao, mood);
    if (line) say(line);
  };

  const busy = (on: boolean) => {
    input.readOnly = on;
    submit.disabled = on;
    form.setAttribute('aria-busy', String(on));
  };

  const shake = () => {
    if (reduce.matches) return;
    const d = px('--shake-distance', 6);
    form.animate([0, -d, d, -d, d, -d / 2, 0].map((x) => ({ translate: `${x}px 0` })), { duration: time('--dur-shake', 320), easing: ease('--ease-out') });
  };

  const reveal = (node: HTMLElement, from: Keyframe) => {
    node.removeAttribute('data-hidden');
    const frames: Keyframe[] = reduce.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, ...from }, { opacity: 1, translate: '0 0', scale: '1' }];
    return node.animate(frames, { duration: time('--dur-base', 260), easing: ease('--ease-out') }).finished.catch(() => undefined);
  };

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    const s = app.dataset.state;
    if (s !== 'typing' && s !== 'thinking' && HAS_TEXT.test(input.value)) go('typing', n.typing);
  });

  let pending = false; // one request at a time (also guards against a double submit in the same frame)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pending) return;
    if (!HAS_TEXT.test(input.value)) {
      go('empty-input', n.emptyInput);
      input.setAttribute('aria-invalid', 'true');
      shake();
      if (finePointer.matches) input.focus();
      return;
    }
    pending = true;
    if (!finePointer.matches) (document.activeElement as HTMLElement | null)?.blur(); // touch: close the keyboard so the answer is visible
    else if (document.activeElement === submit) input.focus({ preventScroll: true }); // the button is about to be disabled
    busy(true);
    shelf.busy(true);
    go('thinking', n.thinking);
    let found = false;
    const long = window.setTimeout(() => { if (!found) say(n.thinkingLong); }, LONG_WAIT_MS);
    let outcome: Outcome;
    try {
      outcome = await find(input.value.trim(), (label) => { found = true; say(fill(n.thinkingFound, { label })); });
    } finally {
      clearTimeout(long);
      busy(false);
      shelf.busy(false);
      pending = false;
    }
    const [state, line] = lineFor(outcome);
    go(state, line);
    if (outcome.kind === 'results') shelf.show(outcome.games, outcome.label);
    else if (state === 'no-results') shelf.clear(); // an error keeps the previous row: the failure is temporary, the games are still good
    if (finePointer.matches) {
      input.focus({ preventScroll: true });
      if (state !== 'results') input.select(); // rewrite quickly after a miss
    }
  });

  let beforeDetail: State = 'results';
  return {
    main,
    async start() {
      if (!(import.meta.env.DEV && new URLSearchParams(location.search).has('noblink'))) startBlink(chao);
      await playEnter(chao);
      say(n.intro); // the bubble is empty: the text is set at once, then the box pops in from the Chao's corner
      const bubbleIn = reveal(bubble, { scale: '0.92' });
      if (!reduce.matches) await new Promise((r) => setTimeout(r, time('--dur-base', 260))); // reduced motion: both fade in together
      await Promise.all([bubbleIn, reveal(form, { translate: `0 ${px('--reveal-rise', 12)}px` })]);
      if (finePointer.matches) input.focus({ preventScroll: true });
    },
    detail(open) {
      document.documentElement.toggleAttribute('data-holo-paused', open);
      if (open) {
        beforeDetail = app.dataset.state as State;
        go('detail');
      } else {
        go(beforeDetail === 'detail' ? 'results' : beforeDetail, n.detailBack, 'idle');
      }
    },
  };
}
```

`src/lib/api.ts` (sustituye entero: ya no tiene simulador ni importa datos de prueba):
```ts
// Client for /api (SPEC §3, DESIGN §14.5). Every failure becomes an Outcome the narrator can say; nothing throws.
export interface Game { id: number; slug: string; name: string; released: string | null; image: string }

export type ErrorReason = 'rate' | 'busy' | 'network' | 'slow' | 'bad';
export type Outcome =
  | { kind: 'results'; label: string; games: Game[] }
  | { kind: 'no-results'; label: string }
  | { kind: 'off-topic' }
  | { kind: 'error'; reason: ErrorReason; retryAfter?: number };

/** text -> outcome. `onInterpreted` fires as soon as the emotion is known (games still loading). */
export type Finder = (text: string, onInterpreted: (label: string) => void) => Promise<Outcome>;

const INTERPRET_TIMEOUT_MS = 12_000; // server budget is ~10 s
const GAMES_TIMEOUT_MS = 14_000; // server budget is ~12 s (RAWG 0.5-7 s)
const RETRY_AFTER_FALLBACK_S = 10;
const RETRY_AFTER_MAX_S = 120; // a broken header must not tell the user to wait an hour
const BAD: Outcome = { kind: 'error', reason: 'bad' }; // 400/403/413/415/500, non-JSON or wrong shape

type Call = { ok: true; data: Record<string, unknown> } | { ok: false; outcome: Outcome };

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<Call> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const slow = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, outcome: { kind: 'error', reason: slow ? 'slow' : 'network' } };
  }
  if (res.status === 429) {
    const retryAfter = Math.min(RETRY_AFTER_MAX_S, Math.max(1, Math.ceil(Number(res.headers.get('Retry-After'))) || RETRY_AFTER_FALLBACK_S));
    return { ok: false, outcome: { kind: 'error', reason: 'rate', retryAfter } };
  }
  if (res.status === 503) return { ok: false, outcome: { kind: 'error', reason: 'busy' } };
  if (!res.ok) {
    if (import.meta.env.DEV) console.warn('[api]', url, res.status); // 400/403/413/415/500: a bug on our side
    return { ok: false, outcome: BAD };
  }
  try {
    const data: unknown = await res.json(); // the timeout signal also covers reading the body
    return data && typeof data === 'object' ? { ok: true, data: data as Record<string, unknown> } : { ok: false, outcome: BAD };
  } catch (e) {
    const slow = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, outcome: slow ? { kind: 'error', reason: 'slow' } : BAD };
  }
}

const isGame = (g: unknown): g is Game => {
  const o = g as Partial<Game> | null;
  return !!o && typeof o.id === 'number' && typeof o.slug === 'string' && typeof o.name === 'string' && typeof o.image === 'string';
};
const isStrings = (a: unknown): a is string[] => Array.isArray(a) && a.every((s) => typeof s === 'string');

export const findGames: Finder = async (text, onInterpreted) => {
  const a = await call('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, INTERPRET_TIMEOUT_MS);
  if (!a.ok) return a.outcome;
  const i = a.data;
  if (i.ok === false) return i.reason === 'off_topic' ? { kind: 'off-topic' } : BAD;
  if (typeof i.label !== 'string' || !isStrings(i.genres) || !isStrings(i.tags)) return BAD;
  const label = i.label;
  onInterpreted(label);
  const q = new URLSearchParams({ genres: i.genres.join(','), tags: i.tags.join(',') });
  const g = await call(`/api/games?${q}`, {}, GAMES_TIMEOUT_MS);
  if (!g.ok) return g.outcome;
  if (!Array.isArray(g.data.games)) return BAD;
  const games = g.data.games.filter(isGame);
  return games.length ? { kind: 'results', label, games } : { kind: 'no-results', label };
};
```

`src/dev/mock.ts` (nuevo, solo DEV: `MOCKS` y `mockFinder` salen de `api.ts`):
```ts
// DEV only (?mock=…): exercises every narrator state without the network. main.ts loads it with import()
// under import.meta.env.DEV, so neither this file nor the game fixture reaches production builds.
import type { Finder, Outcome } from '../lib/api';
import { MOCK_GAMES } from './mock-games';

export const MOCKS = ['results', 'empty', 'offtopic', 'error', 'rate', 'busy', 'network', 'slow', 'timeout'] as const;
export type Mock = (typeof MOCKS)[number];

const BAD: Outcome = { kind: 'error', reason: 'bad' };

export function mockFinder(kind: Mock): Finder {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return async (_text, onInterpreted) => {
    await wait(kind === 'slow' ? 5200 : kind === 'timeout' ? 6000 : 1200);
    if (kind === 'offtopic') return { kind: 'off-topic' };
    if (kind === 'error') return BAD;
    if (kind === 'rate') return { kind: 'error', reason: 'rate', retryAfter: 12 };
    if (kind === 'busy') return { kind: 'error', reason: 'busy' };
    if (kind === 'network') return { kind: 'error', reason: 'network' };
    if (kind === 'timeout') return { kind: 'error', reason: 'slow' };
    const label = kind === 'empty' ? 'nostalgic' : 'cozy';
    onInterpreted(label);
    await wait(900);
    return kind === 'empty' ? { kind: 'no-results', label } : { kind: 'results', label, games: MOCK_GAMES };
  };
}
```

`src/dev/mock-games.ts` (sin cambios; solo lo importa `mock.ts`):
```ts
// DEV only: 20 real RAWG results (public image URLs, no keys) for ?mock=results. Entry 5 has a broken image on purpose
// (it exercises the no-image fallback). Imported only by mockFinder, so production builds drop it.
import type { Game } from '../lib/api';

export const MOCK_GAMES: Game[] = [
  { id: 244698, slug: 'sky-light-awaits', name: 'Sky: Children of the Light', released: '2019-07-18', image: 'https://media.rawg.io/media/games/cb1/cb14d42b58bdb6cf5948d0eed778c2f0.jpg' },
  { id: 959920, slug: 'snufkin-melody-of-moominvalley', name: 'Snufkin: Melody of Moominvalley', released: '2024-03-07', image: 'https://media.rawg.io/media/games/b39/b3981eb418efc2472847660e34a6517f.jpg' },
  { id: 799381, slug: 'beacon-pines', name: 'Beacon Pines', released: '2022-09-22', image: 'https://media.rawg.io/media/games/384/3840fdbb91612c81db98176a4c1e7a8d.jpg' },
  { id: 967340, slug: 'station-to-station-2', name: 'Station to Station', released: '2023-10-03', image: 'https://media.rawg.io/media/games/fab/fabb514d218bc2d3d8b3a554790bc722.jpg' },
  { id: 672464, slug: 'doors-paradox', name: 'Doors: Paradox', released: '2021-09-27', image: 'https://media.rawg.io/media/games/000/gf-missing-cover.jpg' },
  { id: 963626, slug: 'sticky-business', name: 'Sticky Business', released: '2023-07-16', image: 'https://media.rawg.io/media/screenshots/5b4/5b442617d235d909cd8071cb812e98f9.jpg' },
  { id: 58745, slug: 'lieve-oma', name: 'Lieve Oma', released: '2016-03-23', image: 'https://media.rawg.io/media/games/8b8/8b8f75b0b2e5b813d5495a7e750d2c37.jpg' },
  { id: 877997, slug: 'a-castle-full-of-cats', name: 'A Castle Full of Cats', released: '2022-11-08', image: 'https://media.rawg.io/media/games/5c1/5c11eced9590e1c36c3aefc27a34b132.jpg' },
  { id: 894438, slug: 'lil-gator-game', name: 'Lil Gator Game', released: '2022-12-14', image: 'https://media.rawg.io/media/games/376/37628262db021ad21f81ec8d4b0ded03.jpg' },
  { id: 972362, slug: 'loddlenaut', name: 'Loddlenaut', released: '2023-11-16', image: 'https://media.rawg.io/media/screenshots/98c/98c36f2e52831d3020b2243761d5cf92.jpg' },
  { id: 973086, slug: '100-christmas-cats', name: '100 Christmas Cats', released: '2023-12-01', image: 'https://media.rawg.io/media/screenshots/044/04432650b73e79bfb7fbb44994dc0074.jpg' },
  { id: 962381, slug: 'little-kitty-big-city', name: 'Little Kitty, Big City', released: '2024-05-09', image: 'https://media.rawg.io/media/games/c11/c119d11961d785498ccb8e1ed9b006ca.jpg' },
  { id: 471717, slug: 'a-little-to-the-left', name: 'A Little to the Left', released: '2022-11-08', image: 'https://media.rawg.io/media/games/5fb/5fb6cab48577b617b5129dca622e061d.jpg' },
  { id: 973793, slug: '100-asian-cats', name: '100 Asian Cats', released: '2023-12-17', image: 'https://media.rawg.io/media/screenshots/5cc/5cce7cdf7a7436f3baa8c8d01d2bb7b7.jpg' },
  { id: 963612, slug: 'cats-hidden-in-paris', name: 'Cats Hidden in Paris', released: '2023-07-16', image: 'https://media.rawg.io/media/screenshots/6bc/6bcdbc6fea063c4a9521a1fa8dc04f78.jpg' },
  { id: 1008572, slug: 'lego-voyagers', name: 'LEGO Voyagers', released: '2025-09-15', image: 'https://media.rawg.io/media/games/094/094854b45dedba074587020c94ff9e61.jpg' },
  { id: 972167, slug: 'an-arcade-full-of-cats', name: 'An Arcade Full of Cats', released: '2023-11-16', image: 'https://media.rawg.io/media/screenshots/cec/cecb470cf89dfe78e8a1ded91298671a.jpg' },
  { id: 576532, slug: 'cozy-grove', name: 'Cozy Grove', released: '2021-04-08', image: 'https://media.rawg.io/media/screenshots/ea5/ea586b50b2cfe7ffa946488a91275dd1.jpg' },
  { id: 989225, slug: 'tiny-glade', name: 'Tiny Glade', released: '2024-09-23', image: 'https://media.rawg.io/media/games/2b8/2b83bcf74366f52296427c559803f6a6.jpeg' },
  { id: 1010950, slug: 'winter-burrow', name: 'Winter Burrow', released: '2025-11-12', image: 'https://media.rawg.io/media/games/8f7/8f7df68072959a0454789a7ec5cf8332.jpg' },
];
```

`src/content.ts` (sustituye entero; `shelf.name` en vez de `shelf.year`) — **obsoleto: lo sustituye §14.13 (re-enfoque)**:
```ts
// Single source for every visible string (SPEC §1.1, DESIGN §9 and §14.6).
export const content = {
  pageTitle: 'Game Feelings',
  narrator: {
    intro: 'Hey! How are you feeling today?',
    typing: "Take your time. Hit Enter when you're ready.",
    emptyInput: 'Tell me a feeling first, like "tired but hopeful".',
    thinking: 'Hmm… let me think about that.',
    thinkingLong: 'Still thinking. Big feelings take a moment.',
    thinkingFound: 'Got it, {label}. Finding games…',
    results: 'Feeling {label}? These games get it.',
    noResults: 'Nothing fits that one yet. Try saying it another way?',
    offTopic: "Let's talk feelings. How are you, really?",
    error: 'My brain is buffering. Give it a moment and try again.',
    errorRate: 'Too many feelings in a row. Try again in {seconds}s.',
    errorBusy: 'The game library is busy. Try again in a minute.',
    errorNetwork: "Can't reach the internet. Check your connection.",
    errorSlow: 'That took too long. Try again in a moment.',
    detailBack: 'Want to try another feeling?',
  },
  input: {
    label: 'How are you feeling?',
    placeholder: 'I feel lonely but cozy tonight',
    submit: 'Find games',
    submitBusy: 'Thinking…',
  },
  shelf: {
    heading: 'Games for feeling {label}', // visually hidden h2 of the row
    name: '{name}, {year}', // accessible name of a case: "Cozy Grove, 2021"
  },
  theme: {
    toDark: 'Switch to dark theme',
    toLight: 'Switch to light theme',
  },
  footer: {
    credit: 'Chao © SEGA — fan project, not affiliated · Game data by ',
    rawgLabel: 'RAWG',
    rawgUrl: 'https://rawg.io',
  },
  character: {
    alt: 'Chao, a small blue creature with a yellow ball floating above its head',
  },
  // DEV-only scaffolding (?lab).
  styleTile: {
    badge: 'Phase 1 · style tile',
    chromeSample: 'Chrome strip',
    typeHeading: 'Type scale',
    colorHeading: 'Color',
    shapeHeading: 'Radii and spacing',
    typeSample: 'Feeling cozy tonight',
    chaoLab: {
      heading: 'Chao lab',
      moods: 'Mood',
      talk: 'Talk',
      blink: 'Blink',
      compact: 'Compact size',
      enter: 'Enter',
      idle: 'Idle',
      listen: 'Listen',
      think: 'Think',
      happy: 'Happy',
      sad: 'Sad',
      error: 'Error',
    },
  },
} as const;
```

`src/main.ts` (sustituye entero; carga el simulador con `import()` solo en DEV):
```ts
import { startHolo } from './holo/holo';
import './styles/tokens.css';
import './styles/base.css';
import './styles/holo.css';
import './styles/chao.css';
import './styles/screen.css';
import './styles/results.css';
import { content } from './content';
import { findGames, type Finder } from './lib/api';
import { el } from './lib/dom';
import { createScreen, type Screen } from './sections/screen';

type Theme = 'light' | 'dark';

declare global {
  interface Window {
    /** DEV only: lets tests open/close the (phase 6) detail state. */
    __screen?: Pick<Screen, 'detail'>;
  }
}

// ---------- Theme ----------
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function currentTheme(): Theme {
  const set = root.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return systemDark.matches ? 'dark' : 'light';
}

function themeToggle(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'theme-toggle' }, el('span', { class: 'theme-toggle__icon', 'aria-hidden': 'true' }));
  const sync = () => {
    const dark = currentTheme() === 'dark';
    button.setAttribute('aria-label', dark ? content.theme.toLight : content.theme.toDark);
  };
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next); // key must match the inline script in index.html
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
    sync();
  });
  systemDark.addEventListener('change', sync);
  sync();
  return button;
}

// ---------- Page ----------
const app = document.getElementById('app')!;
const q = new URLSearchParams(location.search);
const header = el('header', { class: 'top-bar' }, themeToggle());
const footer = el('footer', { class: 'credit' }, el('p', {}, content.footer.credit, el('a', { href: content.footer.rawgUrl }, content.footer.rawgLabel)));

if (import.meta.env.DEV && q.has('lab')) {
  // DEV only: style tile + Chao lab (src/dev/lab.ts). Dead code in production builds.
  void import('./dev/lab').then(({ renderLab }) => app.append(header, renderLab(), footer));
} else {
  void finder().then((find) => {
    const screen = createScreen(app, find);
    app.append(header, screen.main, footer);
    if (import.meta.env.DEV) window.__screen = { detail: screen.detail };
    void screen.start();
  });
}

/** The real API, or in DEV with ?mock=<kind> the simulator (src/dev/mock.ts, loaded only then). */
async function finder(): Promise<Finder> {
  const mock = import.meta.env.DEV ? q.get('mock') : null; // production never reads ?mock
  if (!mock) return findGames;
  const { MOCKS, mockFinder } = await import('./dev/mock');
  return (MOCKS as readonly string[]).includes(mock) ? mockFinder(mock as (typeof MOCKS)[number]) : findGames;
}

// The background is decorative: content renders first and a failure here leaves the CSS fallback.
try {
  startHolo(document.querySelector<HTMLCanvasElement>('.holo__canvas')!);
} catch (e) {
  if (import.meta.env.DEV) console.warn('[holo]', e);
}
```

### 15.9 Ediciones para el frontend-engineer

1. Sustituir enteros, con §15.8: `src/sections/results.ts`, `src/styles/results.css`, `src/styles/screen.css`, `src/lib/api.ts`, `src/content.ts`, `src/main.ts`. Crear `src/dev/mock.ts`. `src/sections/screen.ts` y `src/dev/mock-games.ts` no cambian.
2. `tokens.css` ya está actualizado (bloque "Phase 5" reescrito: `--case-aspect`, `--case-per-row` con sus dos media queries, `--shelf-max-w`, `--case-max-w` de 100rem, `--shelf-fade`, `--shelf-edge`, `--case-band-size`, `--case-line-w`, `--case-spine-w`, `--case-title-*`, `--case-iridescent`, `--case-spine-2..4`, `--case-shadow-rest` (duro) y `--case-shadow-lift`; sin `--case-sheen` encima del texto).
3. Tests: `tests/client-api.test.ts` debe importar `mockFinder` y `MOCKS` de `../src/dev/mock` (ya no están en `api.ts`).
4. Sin cambios: `chao.*`, `chao-rig.ts`, `dom.ts`, `tokens.ts`, `holo.*`, `index.html`.
5. Fase 6: escuchar `game:open` en `#app`, `pushState(?game=<slug>)`, abrir el panel con `screen.detail(true)`, devolver el foco a `opener` al cerrar y atender `?game=` al cargar.

### 15.10 Verificación (para el tester)

Servidor de desarrollo; `?t=9500&noblink&mock=results` (20 juegos reales; el 5.º sin imagen), salvo en rendimiento (sin `?t=`). Esperar ~2.7 s a la intro y ~1.7 s tras los resultados.
- **Estructura**: `section.shelf[aria-labelledby="shelf-heading"]` con `h2#shelf-heading` = "Games matching {summary}" (re-enfoque, §14.13); un solo `h1` y un solo `h2`; `ul.shelf__row[role=list]` con 20 `li > a.case`; `href` = `?game=<slug>`; todos los hijos del enlace `aria-hidden="true"`; `img[alt=""][loading=lazy]` con `/media/resize/640/-/` (o `1280` a DPR 2).
- **Nombre accesible**: `ariaSnapshot` del primer enlace = `link "Sky: Children of the Light, 2019"`.
- **Tamaños por divisor** (tabla de §15.2): ancho de caja ±2 px en cada resolución (a 768×1024, ~197 px; a 1920, 320 px), cajas enteras, asomo y `data-more`; fracción visible de la primera portada ≥ 0.5 en todas; `scrollWidth ≤ innerWidth` en todas; `scrollHeight == innerHeight` a 1920×1080, 1440×900, 1024×768, 768×1024 y 390×844.
- **Asomo**: con la fila al principio, `data-more` presente y la opacidad de `.shelf::after` es 1; con `scrollLeft` al máximo, sin `data-more`.
- **Roving tabindex**: exactamente una caja con `tabIndex 0`; Tab desde el botón → caja 1; 3 × → → caja 4; Tab → enlace RAWG; Mayús+Tab → caja 4; Fin → 20; → en la 20 sigue en la 20; Inicio → 1; Mayús+→ no mueve. Tras una nueva búsqueda vuelve a haber una sola parada (la 1.ª).
- **Hover estable**: con el puntero a 4 px del borde inferior de una caja, el `li` sigue en `:hover` y `--lift` = `-6px` en 12 muestras seguidas (720 ms).
- **Inclinación**: cerca de la esquina superior derecha de una caja, `--rx` y `--ry` ≈ +8–10° y `transform` es `matrix3d`; al salir, `--rx` vacío. Con táctil o reduce, sin inclinación.
- **Ocupado**: durante `thinking`, `section[aria-busy="true"]`, `row.inert === true` y opacidad 0.45 (a partir de ~300 ms); después, una sola fila, `inert` false.
- **no-results** (`?mock=empty`): `section.shelf[hidden]` y ninguna fila. **error** después de resultados: la fila sigue.
- **Contraste**: con portadas blancas (sustituir `src`/`srcset` por un SVG blanco), el píxel más claro tras el texto del título da ≥ 4.5:1 con el blanco (medido 15.9) en las cajas enteras.
- **Rendimiento** (fondo vivo): barrido de ratón + scroll durante 4 s a 1440 y 390@3, 3 tomas: p95 ≤ 17 ms.
- Capturas en las 10 resoluciones con resultados, claro y oscuro en 1440 y 390; hover y foco. 0 errores de consola (salvo el 404 esperado de la imagen rota de prueba).
- **Ajustar `scripts/verify-results.mjs`**: tamaños por `--case-per-row` (ya no "5 visibles" en todas partes), asomo/`data-more`, roving tabindex (una parada), nombre accesible con `aria-label`, `mockFinder` desde `src/dev/mock.ts`, y rendimiento con el fondo vivo.

### 15.11 Puntos flojos (honesto)

1. A 1280×600 caben 7 cajas pequeñas (153 px) y no asoma ninguna: la pista es la sombra del borde. A 320×568, igual (y la portada se ve al 85 %).
2. En apaisado (844×390) solo se ve el 66 % de las portadas sin scroll.
3. Las portadas son capturas horizontales recortadas al centro: algunas pierden al protagonista.
4. Sin botones anterior/siguiente: con ratón sin rueda horizontal, la barra de scroll (fina) o Mayús + rueda.
5. El evento `game:open` no tiene oyente hasta la fase 6: hoy un clic en una caja no hace nada visible. Se deja así a propósito (sin nada provisional).
6. La sombra de hover no sigue la inclinación (está en el `li`, quieto): se lee como "la caja se separa de su sombra", que es lo que pasa al levantarla.
7. La caja que asoma bajo la sombra del borde derecho tiene el texto más apagado.
8. La placa del título es más corta, pero sigue tapando el tercio inferior de la portada con títulos de 3 líneas.

### 15.12 Cambios de la revisión 2 (resumen)

Bugs: hover y medida en el `li` (sin temblor); `aria-label` con el nombre en un solo texto; sombras (labio duro en reposo, grande solo en hover/foco por opacidad), `animation-fill-mode: backwards` y fundido del borde sin `mask-image` → 60 fps con el fondo vivo; padding inferior de 48 px (sin línea que corte las sombras); contraste medido de verdad (el brillo iba sobre el texto) y tokens para todo lo que lo sostiene (`--case-title-size`, `--case-title-size-noimg`, `--case-band-size`, `--case-title-fade`, `--case-title-inset`, `--case-aspect`). Diseño: `--case-per-row` 5.3 / 3.4 / 2.3; asomo + sombra en el borde derecho; roving tabindex; placa del título corta; disco genérico + año en la banda y 4 colores de franja; línea arcoíris saturada de 2 px; franja fina en cajas pequeñas; año ≥ 11 px; `--case-max-w` 20rem desde 100rem y estante hasta 120rem; formulario en columna en teléfonos también en pantallas bajas; fila `inert` mientras piensa. Nits: `ease()`; Inicio/Fin con `preventDefault`; flechas con modificadores ignoradas; `style.setProperty('--i')`; sangrado sin `50vw`; simulador en `src/dev/mock.ts` con `import()` solo en DEV.

> Rev. 3 de la fase 5 (orquestador): `.shelf::after` lleva `mask-image` vertical para que la sombra del borde derecho no acabe en una arista recta (hallazgo del tester). El ui-designer debe revisar la sombra del borde.

> **Cerrado por el ui-designer (fase 6): se acepta.** La regla de §15.2/§15.5 prohibía la máscara **en el scroller** (se recompone en cada frame con el contenido que se mueve encima del fondo vivo). Esta máscara va en un **pseudo estático** que no contiene nada que se desplace: se rasteriza una vez y solo cambia su `opacity`, así que no reabre aquel coste. Los extremos que se desvanecen (0 → 12 % y 80 → 100 %) quitan la arista recta bajo las cajas sin tocar la zona de las portadas. Único ajuste para el frontend-engineer: el comentario de `results.css` (líneas 34-35) dice "not a mask"; cambiarlo a "a static overlay with a vertical mask, not a mask on the scroller". No lo medí yo: el tester ya pasó la verificación de la fase 5 con este CSS (rendimiento con fondo vivo incluido en §15.10); si en la fase 6 aparecen frames perdidos al hacer scroll de la fila, es lo primero que hay que quitar.

## 16. Fase 6: panel de detalle

Cierra US5 y el estado `detail` de SPEC §1.1. Sustituye la fila `detail` de §10. Tokens en `tokens.css` (bloque "Phase 6"; `--width-panel` pasa de 60 a 64rem; se borran `--z-scrim` y `--z-panel`, que nadie usaba). Contrato de datos: `GET /api/game?id=<slug|id>` → `{ name, description, released, trailer: string|null, screenshots: string[], platforms: string[], genres: string[], rating: number|null, metacritic: number|null }` (`api/game.ts`). Plataformas (≤ 8), géneros (≤ 5), nota de jugadores (0-5, 1 decimal) y Metacritic se añadieron por cambio de alcance aprobado (2026-10-04): van en la ficha técnica de §16.14. Desarrollador no. Mientras carga se usa lo que ya trae la caja (`Game`: `slug`, `name`, `released`, `image`).

### 16.1 Idea

**Una hoja técnica dentro de una funda de vidrio.** La imagen 3 del brief (el blueprint de PlayStation) da la pieza entera: retícula, figuras con rótulo "Fig. n" sobre una línea de cota, texto descriptivo en el mismo papel, "Source: …" y la fecha de lanzamiento enorme abajo a la derecha. La hoja es lo memorable del panel; todo lo demás (vidrio, cromo, botones) se queda sobrio.

- **Claro = whiteprint** (tinta azul sobre papel perla), **oscuro = blueprint** (tinta blanca sobre azul PlayStation `#0b3a91`, entre los `#0040a0` y `#2060a0` muestreados de la ref.). Las dos copias heliográficas existen de verdad, así que cada tema tiene su versión sin inventar un tercer material.
- **La hoja es opaca**: su contraste no depende del fondo vivo ni del scrim (en §8 el texto sobre vidrio dependía del peor frame).
- **Vidrio espejado = el marco** (`--panel-rim`, 8 px) alrededor de barra + hoja: borde exterior redondeado (`--radius-panel`), esquinas interiores rectas, como una caja de CD que sujeta una lámina. Sigue siendo el único `backdrop-filter` de la app (§5, §12.12).
- **Barra cromada** arriba con el nombre del juego y el botón de cerrar (decisión de §5 y §10; el cromo no cambia entre temas).

### 16.2 Layout

Un `<dialog class="detail">` abierto con `showModal()`. Tamaño fijo (no salta de alto cuando llegan los datos):
- ancho `min(var(--width-panel), 100% - 2 * var(--panel-margin))`, alto `min(100dvh - 2 * var(--panel-margin), 52rem)`;
- `--panel-margin`: 8 px en teléfono → 32 px en escritorio.

**Escritorio (contenedor del panel ≥ 48rem; a 1280×800 el panel mide 1024×736)**:
```
╭──────────────────────────────────────────────────────────────╮  ← vidrio (rim 8 px, radio 20 px)
│┌────────────────────────────────────────────────────────────┐│
││ Hollow Knight                                         (×)  ││  ← barra cromada, esquina inferior derecha cortada
│├────────────────────────────────────────────────────────────┤│
││┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐││  ← línea de marco interior (outline a -10 px)
││ Fig. 1           Trailer, 1:42  Released  2017            ││  ← cota de la figura | bloque de fecha
││ ├──────────────────────────────┤ 24 February 2017           ││
││ ┌──────────────────────────────┐                            ││
││ │                              │ Hollow Knight is a 2D...   ││  ← descripción, ≤ 60ch
││ │   vídeo o portada  16:9      │ ...                        ││
││ └──────────────────────────────┘ Source: RAWG               ││
││ Fig. 2          Fig. 3                                      ││
││ ├────────────┤  ├────────────┤                              ││
││ [  captura  ]   [  captura  ]                               ││  ← 2 columnas, hasta Fig. 7
││  ...                                                        ││     (la hoja hace scroll; la barra no)
│└────────────────────────────────────────────────────────────┘│
╰──────────────────────────────────────────────────────────────╯
```
Columnas `minmax(0, 5fr) minmax(0, 4fr)`, hueco `--space-6`; áreas `"fig info" "figs info"`, filas `auto 1fr`, `info` alineada arriba. A 1280 la columna de texto mide ~405 px (≈ 45ch a 18 px): por eso `--width-panel` sube a 64rem (con 60 quedaba en ~40ch).

**Móvil (390×844: panel 374×828)**: una columna, áreas `"fig" "info" "figs"`. Así la fecha y la descripción quedan justo debajo de la figura principal y las capturas al final (con dos columnas el texto acababa debajo de 6 capturas).
```
┌ Hollow Knight      (×) ┐  ← barra (el título puede ocupar 2-3 líneas)
│ Fig. 1  Trailer, 1:42  │
│ ├────────────────────┤ │
│ [  vídeo 16:9       ]  │
│ Released 2017          │
│ 24 February 2017       │
│ Hollow Knight is a...  │
│ Source: RAWG           │
│ Fig. 2       Fig. 3    │
│ [cap]        [cap]     │
└────────────────────────┘
```

Estructura (el contenedor de la consulta es el propio `dialog`, `container-type: inline-size`):
```
dialog.detail[aria-labelledby="detail-title"]
  header.detail__bar.chrome
    h2#detail-title.detail__title[tabindex=-1][autofocus]
    button.detail__close[type=button][aria-label="Close"] > svg (aspa, aria-hidden)
  div.detail__sheet[aria-busy]
    figure.detail__fig.detail__fig--main  (área fig)
      figcaption.detail__dim > span "Fig. 1" + span "Trailer, 1:42" | "Cover" | "Screenshot" | "No pictures yet"
      video.detail__media | img.detail__media | div.detail__media (vacío)
    div.detail__info  (área info)
      div.detail__release > span.detail__label "Released" + span.detail__year "2017" + span.detail__date "24 February 2017"
      dl.detail__specs > div.detail__spec > dt + dd   (ficha técnica, §16.14; solo filas con dato; sin filas, no se pinta)
      p.detail__status[role=status]          (carga / error; vacío si todo fue bien)
      button.detail__retry                   (solo en error recuperable)
      div.detail__desc > p…
      p.detail__source > "Source: " + a "RAWG" (+ span.visually-hidden " (opens in a new tab)")
    ol.detail__figs[role=list] > li > figure.detail__fig > figcaption.detail__dim "Fig. n" + img.detail__media   (área figs)
```

### 16.3 Materiales y recetas

```css
.detail {                                     /* cerrado: display none del UA, no tocar */
  padding: var(--panel-rim); margin: auto; border: var(--border-hairline) solid var(--color-border-soft);
  border-radius: var(--radius-panel); background: var(--glass-fill);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-panel); color: var(--sheet-ink); overflow: hidden;
  inline-size: min(var(--width-panel), 100% - 2 * var(--panel-margin)); max-inline-size: none;
  block-size: min(100dvh - 2 * var(--panel-margin), 52rem); max-block-size: none;
  container-type: inline-size;
}
.detail[open] { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.detail[data-anim] { backdrop-filter: none; }   /* sin desenfoque mientras escala (480 ms): el rim es fino y no se nota */
.detail::backdrop { background: rgb(11 29 85 / 0.45); background: var(--color-scrim); /* literal antes: ::backdrop hereda variables solo en navegadores recientes */
  transition: opacity var(--dur-base) var(--ease-out); }
@starting-style { .detail[open]::backdrop { opacity: 0; } }
.detail[data-closing]::backdrop { opacity: 0; transition-timing-function: var(--ease-in); }

.detail__sheet {
  overflow-y: auto; overscroll-behavior: contain;
  background: var(--sheet-grid); background-attachment: local;      /* la retícula se mueve con el papel */
  outline: var(--border-hairline) solid var(--sheet-line); outline-offset: calc(-1 * var(--sheet-frame-inset)); /* marco interior fijo */
  padding: var(--sheet-pad); display: grid; gap: var(--space-5) var(--space-6);
  grid-template-columns: minmax(0, 1fr); grid-template-areas: "fig" "info" "figs"; align-content: start;
}
@container (min-width: 48rem) {
  .detail__sheet { grid-template-columns: minmax(0, 5fr) minmax(0, 4fr); grid-template-areas: "fig info" "figs info"; grid-template-rows: auto 1fr; }
}
```
- **Barra**: receta `.chrome` de §5 tal cual (`--chrome-clip`, borde en el fondo). `grid-template-columns: minmax(0, 1fr) auto`, `align-items: center`, `gap: var(--space-4)`, padding `var(--space-3) var(--space-5)`; el padding derecho (24 px) es ≥ `--cut-corner` (20 px), así el botón nunca entra en la diagonal.
- **Título** (`h2`): `--font-display` itálica, `--weight-display` (800), `--font-stretch-display-compact` (125 %), `--text-xl`, `--leading-tight`, `--chrome-text`, `text-wrap: balance`, `overflow-wrap: anywhere`. Sin recorte: es el nombre del diálogo. `outline: none` **solo** en `.detail__title:focus` (recibe el foco por programa al abrir, no es un control).
- **Cerrar**: 48×48 (`--space-7`), redondo (`--radius-pill`), fondo transparente, borde `--border-control` en `--chrome-text`, aspa SVG de 20 px con trazo `currentColor` 2.5 px y extremos redondeados. Hover (`@media (hover: hover)`): fondo `--chrome-press`. Active: `scale(var(--press-scale))`. `:focus-visible`: `outline: var(--focus-width) solid var(--chrome-focus); outline-offset: var(--focus-offset)`. Sin texto visible, `aria-label` "Close".
- **Cota de figura** (`figcaption.detail__dim`, encima de la imagen, como en la ref.): flex `space-between`, `--text-sm`, `--weight-bold`, `--tracking-meta`, `--sheet-ink-muted`, `padding-block-end: var(--space-1)`, `border-block-end: 1px solid var(--sheet-line)`; `::before`/`::after` = marcas de los extremos (1 px × `--dim-tick`, centradas en la línea, a izquierda y derecha). En tipo oración ("Fig. 2"), no en mayúsculas (§11).
- **Medios** (`.detail__media`): `display: block; inline-size: 100%; aspect-ratio: 16 / 9; object-fit: cover; border: 1px solid var(--sheet-line); background: var(--sheet-empty);` Esquinas rectas: son láminas, no tarjetas (las cajas tienen 6 px, el panel 20 px; jerarquía de radios de §4). El aspa de `--sheet-empty` se ve mientras carga la imagen o si no hay ninguna.
- **Capturas**: `ol.detail__figs`, sin viñetas, `grid-template-columns: repeat(2, minmax(0, 1fr))`, `gap: var(--space-5) var(--space-4)`. Máximo 6 (Fig. 2–7).
- **Fecha** (`.detail__release`): grid `auto 1fr`, `align-items: last baseline`, `column-gap: var(--space-3)`. Etiqueta "Released" en `--text-sm` muted con `--tracking-meta`; año en `--font-display` itálica 900, `--font-stretch-display`, `--text-year`, `line-height: 0.9`, `--sheet-ink`; la fecha completa debajo en `--text-base`, ocupa las dos columnas. Sin fecha: etiqueta + "Not announced" en `--text-lg`, sin año grande.
- **Descripción**: `--font-text`, `--text-base`, `--leading-normal`, `max-inline-size: var(--measure)`, `white-space: pre-line`, párrafos separados `--space-3`.
- **Fuente** (`.detail__source`): `--text-sm` muted; el enlace "RAWG" en `--sheet-link`, subrayado siempre, `padding-block: var(--space-3)` y `margin-block: calc(-1 * var(--space-3))` (zona de 44 px sin mover la línea, igual que `.credit a`); `:focus-visible` con `--sheet-focus`.
- **Reintentar**: pill de plástico (receta §5: `--plastic-bg`, `--shadow-plastic`, hover `--plastic-bg-hover`) con **borde `--border-control` en `--color-border`** (sobre la hoja el filo blanco del plástico no llega a 3:1), `min-block-size: 44px`, `padding-inline: var(--space-5)`, `--font-text` 700, `--color-text`; foco con `--sheet-focus`.
- **Todos los anillos de foco dentro de la hoja** usan `--sheet-focus` (en oscuro, `--color-focus` `#74beff` sobre `#0b3a91` se confunde).
- `@media (prefers-contrast: more) { .detail__sheet { background: var(--sheet-bg); } }` (sin retícula). `@media (forced-colors: active) { .detail__sheet { background: Canvas; outline-color: CanvasText; } .detail { border-color: CanvasText; } }`.

### 16.4 Qué se muestra en cada caso (medios)

`cover` = `game.image` de la caja (solo si se abrió desde la fila); `shots` = `screenshots` sin la URL de `cover` (RAWG suele repetir la portada como primera captura).

| Hay | Fig. 1 (rótulo derecho) | Fig. 2–7 |
|---|---|---|
| trailer | `<video controls preload="metadata" playsinline poster={cover ?? shots[0]}>`, `aria-label` "{name} trailer"; rótulo "Trailer" y, al llegar `loadedmetadata` con duración finita, "Trailer, 1:42" (m:ss). **Sin autoplay** | `shots` |
| sin trailer, con `cover` | la portada (la misma imagen ya cargada por la caja: aparece al instante), "Cover" | `shots` |
| sin trailer ni `cover` (enlace directo) | `shots[0]`, "Screenshot" | el resto de `shots` |
| nada | marco vacío con aspa, "No pictures yet" | — |

- Imágenes por `rawgImage()` de `results.ts`: Fig. 1 a 1280 (`srcset` 640 1x / 1280 2x, sin `lazy`); capturas a 640, `loading="lazy"`, `decoding="async"`, `width="640" height="360"`. `alt`: portada "{name} cover", capturas "{name}, screenshot {n}" (n desde 1).
- Al abrir desde la fila, Fig. 1 muestra la portada **antes** de que llegue `/api/game`; si luego hay trailer, el `<img>` se sustituye por el `<video>` en la misma caja 16:9 (sin salto). Las capturas entran con un fundido de `--dur-base` (sin desplazamiento).

### 16.5 Estados de datos

| Estado | Barra | Hoja |
|---|---|---|
| **cargando** (desde la fila) | nombre de la caja | Fig. 1 = portada; fecha completa (la trae `Game.released`); `.detail__sheet[aria-busy=true]`; a los **300 ms** sin respuesta, `status` = "Loading details…" (si llega antes no parpadea nada) |
| **cargando** (enlace directo `?game=`) | título provisional sacado del slug ("hollow-knight" → "Hollow Knight") | Fig. 1 vacía con aspa, sin bloque de fecha hasta que lleguen los datos, mismo `status` |
| **listo** | `name` de la API (sustituye al provisional) | medios de §16.4, fecha, descripción, fuente; `status` vacío; `aria-busy=false` |
| **sin descripción** | — | `status` vacío; en lugar de la descripción, "RAWG has no description for this game yet." en muted |
| **error recuperable** (red, lento, 503, respuesta rara) | igual que cargando | `status` = "Couldn't load this game's details." + botón "Try again" (vuelve a pedir y a "cargando"). La portada y el enlace a RAWG siguen: el panel sigue siendo útil |
| **429** | igual | "Too many requests in a row. Try again in {seconds}s." + "Try again" |
| **404** | si no había nombre, "Game not found" | `status` = "RAWG doesn't have this game." Sin botón, sin enlace a RAWG (el slug no existe) |

- Descripción: `description` (texto plano) por `textContent`, nunca HTML. Partir en párrafos por líneas en blanco; quitar `#` al principio de línea; **cortar desde una línea "Español"** (RAWG pega a menudo la traducción al final: `/\n\s*#{0,3}\s*Español\b[\s\S]*$/i`).
- Fecha: `released` "YYYY-MM-DD" → `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })` = "24 February 2017" (el formato de la ref.: "3 December 1994"). Año = los 4 primeros caracteres.
- El cliente usa el `call()` de `api.ts` (timeout de 14 s, 429 con `Retry-After`, cuerpos no JSON) y añade el **404 como resultado propio** (hoy cae en `bad`). La petición se cancela (`AbortController`) al cerrar.

### 16.6 Abrir, cerrar, historial y foco

Un solo módulo (`src/sections/detail.ts`) es dueño del `<dialog>`, de `?game=` y del foco. Funciones: `open(slug, game?, opener?)`, `requestClose()`, `animateClose()`.

**Abrir** (`game:open` desde la fila, `?game=` al cargar, o `popstate` hacia una entrada con `?game=`):
1. Si ya está abierto o cerrándose, no hace nada.
2. Desde la fila: `history.pushState({ gameDetail: true }, '', url con ?game=<slug>)` (conserva los demás parámetros, p. ej. `?mock=` en dev). Al cargar o desde `popstate`, no se toca el historial.
3. `screen.detail(true)` **antes** de `showModal()`: pone `data-state="detail"` y `data-holo-paused` en `<html>` (el fondo se congela antes de que empiece el desenfoque, §12.12).
4. Rellenar con lo que haya (§16.5), `sheet.scrollTop = 0`, `showModal()`. El foco va al `h2` (`autofocus`, `tabindex=-1`): el lector anuncia el nombre del diálogo y el primer Tab llega al botón de cerrar.
5. Animación (§16.7) y petición a `/api/game?id=<slug>`.

**Pedir cierre** (botón, `Esc`, clic en el scrim = clic cuyo `target` es el propio `dialog`):
- `Esc` llega como evento `cancel`: `preventDefault()` y `requestClose()` (para que se anime y el historial cuadre).
- `requestClose()`: si `history.state?.gameDetail` (la entrada la puso la app) → `history.back()` y el cierre lo hace `popstate`; si no (enlace directo) → `history.replaceState(null, '', url sin game)` y `animateClose()`.

**`popstate`**: si la URL ya no tiene `game` y el diálogo está abierto → `animateClose()`. Si tiene `game` y está cerrado (botón "adelante") → `open(slug, undefined, caja con ese slug en la fila o null)`.

**`close` del diálogo** (único punto de sincronía; también salta si el navegador cierra sin dejar animar, p. ej. un segundo `Esc` sin activación de usuario): quitar `data-closing`/`data-anim`, abortar la petición, vaciar el contenido (el vídeo deja de sonar), y si la URL aún tiene `game`, arreglar el historial igual que `requestClose()`. Después `screen.detail(false)` (el Chao dice la línea de vuelta, §16.9, y se quita `data-holo-paused`) y **devolver el foco**: `opener` si sigue en el documento; si no, la caja `a.case[href="?game=<slug>"]` de la fila; si no, el input `#feeling`. Con `focus()` normal (que la caja vuelva a la vista).

**Atrapar el foco**: lo da `showModal()` (todo lo demás queda `inert`; el Tab circula por el diálogo y la barra del navegador, que es lo correcto). No se escribe un focus trap a mano. No se bloquea el scroll de la página: la hoja tiene `overscroll-behavior: contain` (§16.11).

Ctrl/⌘/Mayús/clic central sobre una caja abren `?game=<slug>` en otra pestaña (ya lo deja `results.ts`): esa pestaña entra por el caso "enlace directo".

**Enlace directo con la intro**: el panel se abre en seguida y la intro del Chao corre detrás, tapada e inerte. `screen.detail(true)` pone el layout compacto (persistente, §14.3), así que al cerrar se ve la pantalla compacta sin fila, con la línea de vuelta. Si se cierra antes de que termine la intro, la intro dice su frase después; se acepta (es la pregunta correcta igualmente).

### 16.7 Movimiento

| Momento | Qué | Tokens |
|---|---|---|
| Abrir desde una caja | el panel **sale de la caja**: empieza centrado sobre ella, a escala uniforme `s = clamp(anchoCaja / anchoPanel, --detail-scale-min, 1)` (≈ 0.2 a 1280) y opacidad 0; llega a opacidad 1 al 30 % y a su sitio al 100 % | `--dur-slow`, `--ease-out` |
| Abrir sin caja visible (enlace directo, adelante) | sube `--detail-drop` (24 px) + opacidad | `--dur-slow`, `--ease-out` |
| Scrim | opacidad 0 → 1 por CSS (`@starting-style`) | `--dur-base` |
| Cerrar | camino inverso hacia la caja si sigue en pantalla (opacidad 1 hasta el 60 %, luego 0); si no, baja `--detail-drop` con fundido. Más corto que la apertura. `data-closing` funde el scrim a la vez. `dialog.close()` por **temporizador** de esa duración (no `.finished`, como en §14/§15: debe cerrar también sin frames) | `--dur-base`, `--ease-in` |
| Llegan las capturas | fundido | `--dur-base` |

- Solo `transform` (`translate` + `scale`, propiedades sueltas como en `screen.ts`) y `opacity`, con WAAPI sobre el `dialog`, `transform-origin: center`. Desplazamiento desde el centro de la caja al centro del panel medido con `getBoundingClientRect()` justo después de `showModal()`.
- `data-anim` en el diálogo mientras dura cualquiera de las dos animaciones: sin `backdrop-filter` (§16.3). Escalar un desenfoque de 18 px cada frame es lo caro; el rim de 8 px sin desenfoque durante medio segundo no se nota.
- **Reduced motion**: las distancias y la escala se multiplican por `--motion-scale` (0): `s = 1 − (1 − s0) · m`, `dx·m`, `dy·m`. Queda un fundido de 200 ms (`--dur-slow` ya vale 200 ms ahí) al abrir y de `--dur-base` al cerrar. No hace falta otra rama de código.
- Si la caja es la que se mueve debajo (tilt), da igual: se mide su rectángulo actual. La caja no se oculta durante la animación (queda bajo el scrim).

### 16.8 Contraste (calculado con script; colores en sRGB, peor punto = cruce de líneas mayor + menor de la retícula)

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| `--sheet-ink` / hoja (sin línea / peor cruce) | 15.29 / 11.05 | 10.35 / 6.42 | 4.5 |
| `--sheet-ink-muted` / hoja | 9.20 / 6.65 | 8.59 / 5.33 | 4.5 |
| `--sheet-link` / hoja | 8.12 / 5.87 | 10.35 / 6.42 | 4.5 |
| `--sheet-focus` / hoja (UI) | 8.12 / 5.87 | 10.35 / 6.42 | 3 |
| `--color-border` (botón reintentar) / hoja | 4.40 (peor) | 5.20 | 3 |
| texto del botón / plástico sobre hoja (reposo · hover) | 14.65 | 7.05 · 5.56 | 4.5 |
| `--chrome-text` (título, aspa, borde del botón) / cromo, parada más oscura `#aab7ca` | 7.82 | 7.82 | 4.5 |
| `--chrome-focus` / cromo | 7.82 | 7.82 | 3 |
| `--sheet-line` / hoja (decorativa, no cuenta) | 2.85 | 4.57 | — |

- En oscuro la primera retícula (0.09 / 0.16) dejaba el texto muted en **4.46** en los cruces: se bajó a 0.07 / 0.12 y el muted pasó a `#d6edff`.
- La hoja es opaca: estas cifras no dependen del fondo WebGL ni del scrim, y no hace falta repetir `holo-contrast.mjs` por esta fase.
- Los controles nativos del `<video>` son del navegador.

### 16.9 Textos (añadir a `src/content.ts`, bloque `detail`; inglés, sin emojis)

```ts
detail: {
  close: 'Close',                         // aria-label del botón
  released: 'Released',
  notAnnounced: 'Not announced',
  fig: 'Fig. {n}',
  trailer: 'Trailer',
  trailerTime: 'Trailer, {time}',         // "Trailer, 1:42"
  cover: 'Cover',
  screenshot: 'Screenshot',
  noPictures: 'No pictures yet',
  trailerLabel: '{name} trailer',         // aria-label del <video>
  coverAlt: '{name} cover',
  shotAlt: '{name}, screenshot {n}',
  source: 'Source: ',
  rawg: 'RAWG',                           // enlace a https://rawg.io/games/<slug>
  newTab: ' (opens in a new tab)',        // visualmente oculto, dentro del enlace
  loading: 'Loading details…',
  noDescription: 'RAWG has no description for this game yet.',
  error: "Couldn't load this game's details.",
  errorRate: 'Too many requests in a row. Try again in {seconds}s.',
  notFound: "RAWG doesn't have this game.",
  notFoundTitle: 'Game not found',
  retry: 'Try again',
  // ficha técnica (§16.14)
  platform: 'Platform',                   // etiqueta con 1 plataforma
  platforms: 'Platforms',                 // con 2 o más
  genre: 'Genre',
  genres: 'Genres',
  rating: 'Player rating',                // nota media de los usuarios de RAWG ("Rating" a secas se confunde con la edad PEGI/ESRB)
  ratingValue: '{value} / 5',             // visible: "4.4 / 5"
  ratingSpoken: '{value} out of 5',       // visualmente oculto: lo que oye el lector
  metacritic: 'Metacritic',
  metacriticValue: '{value} / 100',
  metacriticSpoken: '{value} out of 100',
},
```
**Chao al volver** (ya existe: `narrator.detailBack`): **"Want to look for something else?"**, mood `idle`. Se dice en cada cierre; no hay más frases del Chao en esta fase (detrás del scrim no se le ve).

### 16.10 Conflictos y por qué

- **"Fig. n" numerado** (frontend-design desaconseja numerar lo que no es secuencia): manda el brief; la numeración de figuras es la convención del dibujo técnico de la imagen 3, y aquí sirve para referir cada imagen. En tipo oración, no en mayúsculas.
- **Número grande con etiqueta pequeña** (otro tópico según la skill): es literalmente el "Release Date 1994" de la ref. Uno solo, sin cifras de apoyo.
- **Vidrio**: §5 lo reservaba al panel con todo el cuerpo translúcido; ahora es solo el marco. Motivo: con el cuerpo translúcido el contraste dependía del peor frame del fondo y la hoja técnica es la referencia del brief para "metadatos en el detalle".
- ~~Sin plataformas, géneros ni nota~~: el usuario aprobó el cambio de alcance; ahora van en la ficha técnica (§16.14).
- **Barras de escala junto a la nota** (la skill avisa de no transmitir un dato solo con lo visual): la barra es decorativa (`aria-hidden`) y repite lo que dice el texto "4.4 / 5", que es el dato. Sin colores de semáforo de Metacritic: serían marca ajena y significado solo por color.

### 16.11 Puntos flojos (honesto)

1. La rueda sobre el scrim puede mover la página de debajo en pantallas bajas (no se bloquea el scroll; bloquearlo hace saltar el ancho por la barra de Windows).
2. Con descripciones muy largas la columna derecha crece mucho; la hoja entera hace scroll (no hay "leer más").
3. A 320 px la caja es tan estrecha que la apertura empieza en el suelo `--detail-scale-min` y no exactamente del tamaño de la caja.
4. Cobertura de trailers baja en RAWG (SPEC §10): la mayoría de juegos mostrará "Cover".
5. Sin `@starting-style` (navegadores viejos) el scrim aparece sin fundido; todo lo demás funciona.
6. El vídeo de RAWG viene de su CDN tal cual (sin tamaños): con `preload="metadata"` solo baja la cabecera hasta que se pulsa play.

### 16.12 Para el frontend-engineer

1. **Crear** `src/sections/detail.ts` (§16.2, §16.4–16.7) y `src/styles/detail.css` (§16.3); importarlo en `main.ts` después de `results.css`.
2. **`main.ts`**: crear el detalle con `screen`; escuchar `game:open` en `#app` (`{ game, opener }`); al arrancar, si hay `?game=`, abrirlo (enlace directo); un oyente de `popstate`. Quitar `window.__screen` si deja de hacer falta (los tests pueden usar el panel real).
3. **`api.ts`**: `getGame(slug, signal)` sobre `call()`, con el 404 como resultado propio. **`content.ts`**: bloque `detail` de §16.9.
4. `results.css` líneas 34-35: corregir el comentario (cierre de la rev. 3, arriba).
5. `tokens.css` ya está actualizado (bloque "Phase 6"). No usar `z-index` en el diálogo (top layer).
6. Sin dependencias nuevas. Todo texto por `textContent`; URLs de RAWG solo `https` (ya lo filtra el servidor).

### 16.13 Verificación (para el tester)

Servidor de desarrollo, `?t=9500&noblink&mock=results`; para trailer/sin trailer, dos juegos reales conocidos (uno con trailer: comprobarlo antes con `/api/game`), o ampliar `src/dev/mock.ts` con dos detalles de prueba.
- **Estructura**: `dialog.detail[open]` con `aria-labelledby` → `h2#detail-title`; `document.activeElement` = el `h2` al abrir; Tab → botón Close; todo fuera del diálogo `inert` (un clic fuera no enfoca nada de la fila).
- **URL e historial**: clic en caja → `?game=<slug>` y `history.state.gameDetail`; Atrás → cierra, URL sin `game`, foco en esa caja; Adelante → reabre; `Esc` y botón → cierran con la URL limpia y una entrada menos; cargar `/?game=hollow-knight` → abre sin caja, cerrar → URL `/` por `replaceState` (Atrás no reabre).
- **Estado**: abierto, `#app[data-state="detail"]` y `html[data-holo-paused]`; cerrado, sin el atributo y el bocadillo dice "Want to look for something else?".
- **Medios**: con trailer, `video[controls][preload=metadata]` sin `autoplay`, rótulo "Trailer, m:ss"; sin trailer, Fig. 1 = portada (misma URL que la caja) y capturas sin repetirla; ≤ 6 capturas; caja 16:9 sin CLS al llegar los datos.
- **Estados**: forzar 500 → mensaje + "Try again" que recupera; 429 → segundos; 404 (`?game=no-existe-xyz`) → "Game not found", sin botón ni enlace; el texto de carga no aparece si la respuesta llega en < 300 ms.
- **Layout**: 1280×800, 1440×900 (dos columnas, ~45ch), 390×844 y 320×568 (una columna, fecha y descripción antes de las capturas), 844×390; sin scroll horizontal; el título largo ("The Legend of Zelda: Breath of the Wild") cabe en la barra sin tocar el botón.
- **Movimiento**: con una caja a la vista, el primer frame de la apertura tiene el centro del panel sobre el de la caja y `scale` ≈ ancho caja / ancho panel; durante la animación `data-anim` y `backdrop-filter: none`; con reduce, solo opacidad (sin `translate`/`scale` ≠ identidad).
- **Contraste**: tabla de §16.8 en los dos temas (el script de §15.6 sirve para el texto sobre la hoja); anillos de foco visibles en barra y hoja en ambos temas.
- Capturas: claro y oscuro a 1280 y 390, con y sin trailer, cargando, error. 0 errores de consola.

### 16.14 Ficha técnica: plataformas, géneros, nota y Metacritic (cambio de alcance, 2026-10-04)

**Idea: el cajetín del plano.** Todo plano técnico lleva un cuadro de datos con filas rayadas (etiqueta a la izquierda, valor a la derecha). Es la misma hoja de §16.1 con otra pieza del mismo dibujo: líneas `--sheet-line`, etiquetas como las cotas, sin cajas, sin chips, sin color nuevo. Va **justo debajo del bloque de fecha** en la columna de texto (escritorio) y debajo de la fecha en móvil; antes de `status`, descripción y fuente.

**Jerarquía** (de más a menos peso): año grande (sigue siendo el único número grande) → valores de la ficha (`--text-base`, tinta) → etiquetas (`--text-sm` muted, como "Released") → barras de escala (decorativas). Orden de filas: **Platforms, Genres, Player rating, Metacritic** (primero dónde se juega y qué es; las notas al final, con sus barras alineadas en columna).

```
Released  2017                       ← bloque de fecha (§16.3), sin cambios
24 February 2017
────────────────────────────────────  ← línea --sheet-line (borde superior de cada fila)
Platforms      PC, PlayStation 4,
               Xbox One, Nintendo Switch
────────────────────────────────────
Genres         Action, Platformer, Indie
────────────────────────────────────
Player rating  [▮▮▮▮▮▮▮▮▮▮▮··] 4.4 / 5
────────────────────────────────────
Metacritic     [▮▮▮▮▮▮▮▮▮▮▮▮·] 87 / 100
────────────────────────────────────  ← cierre (borde inferior de la última fila)
Hollow Knight is a 2D...             ← descripción
```
En contenedor ≤ 24rem (teléfonos: el panel de 390 px mide 374 px = 23.4rem) cada fila se apila: etiqueta arriba, valor debajo. A 320 px con dos columnas el valor quedaba en ~150 px y 8 plataformas ocupaban 6 líneas.

**Reglas de datos** (cliente; todo por `textContent`):
- Fila **Platforms**: `platforms` no vacío. Valor = nombres de RAWG sin abreviar, unidos con `", "` (sin middle dots, sin iconos de marca), en **orden fijo por familia**: PC → PlayStation (`/^(PlayStation|PS )/`) → Xbox (`/^Xbox/`) → Nintendo (`/^(Nintendo|Wii|Game ?Boy|GameCube)/`) → macOS → Linux → iOS → Android → el resto. Ordenación **estable**: dentro de una familia y en "el resto" se respeta el orden de RAWG. Motivo: RAWG los da en orden variable, y con un orden fijo el ojo encuentra "su" plataforma siempre en el mismo sitio al pasar de un juego a otro (casi siempre PC o una consola va primero). Helper puro `sortPlatforms(names)` en `detail.ts`, con test. Etiqueta `platform` con 1, `platforms` con 2+.
- Fila **Genres**: igual con `genres` (`genre` / `genres`).
- Fila **Player rating**: `typeof rating === 'number' && rating > 0` (RAWG da `0` cuando nadie ha votado: es "sin dato", no "cero"). Valor = `rating.toFixed(1)` acotado a 0-5 ("4.0", no "4"). Fill de la barra = `rating / 5`.
- Fila **Metacritic**: `typeof metacritic === 'number' && metacritic > 0`, entero acotado a 1-100. Fill = `metacritic / 100`.
- Fila sin dato = no se crea (ni `dt` vacío ni guion). Ninguna fila = la `dl` queda vacía y `:empty` la oculta: no queda hueco ni líneas sueltas.
- **Cargando**: la ficha no existe hasta que llegan los datos (la caja no los trae). No hay esqueleto: unas líneas vacías parecerían datos que faltan. Error / 404: sin ficha. "Try again" la vacía al volver a cargar.

**Estructura de una fila de nota** (la barra va primero para que las dos queden alineadas sin medir el texto):
```
div.detail__spec
  dt "Player rating"
  dd.detail__score
    span.detail__scale[aria-hidden=true][style="--fill: 88%"]   (style.setProperty('--fill', …): por CSSOM, no por atributo, pensando en la CSP de la fase 7)
    span[aria-hidden=true] "4.4 / 5"
    span.visually-hidden "4.4 out of 5"
```
El lector oye "Player rating, 4.4 out of 5" (la `dl` da el par término-definición); la vista ve "4.4 / 5", que es la forma corta de un cajetín.

```css
.detail__specs { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); }
.detail__specs:empty { display: none; }
.detail__spec {
  grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: first baseline;
  column-gap: var(--space-4); padding-block: var(--space-2);
  border-block-start: var(--border-hairline) solid var(--sheet-line);
}
.detail__spec:last-child { border-block-end: var(--border-hairline) solid var(--sheet-line); }
.detail__spec dt { font-size: var(--text-sm); font-weight: var(--weight-bold); letter-spacing: var(--tracking-meta); color: var(--sheet-ink-muted); }
.detail__spec dd { margin: 0; min-inline-size: 0; font-size: var(--text-base); line-height: var(--leading-snug); color: var(--sheet-ink); text-wrap: pretty; }
.detail__score { display: flex; align-items: center; gap: var(--space-3); font-variant-numeric: tabular-nums; font-weight: var(--weight-bold); }
.detail__scale {                                 /* regla de escala del plano: 5 celdas; las llenas en tinta, cortadas por huecos de papel */
  --cell: calc(var(--spec-scale) / 5);
  flex: none; box-sizing: content-box; inline-size: var(--spec-scale); block-size: var(--dim-tick);
  border: var(--border-hairline) solid var(--sheet-line);
  background:
    /* 1. huecos de 2 px color papel, solo sobre la parte llena (capa del ancho del relleno; longitudes absolutas, no %) */
    repeating-linear-gradient(90deg, transparent 0 calc(var(--cell) - 2px), var(--sheet-bg) calc(var(--cell) - 2px) var(--cell)) 0 0 / var(--fill, 0%) 100% no-repeat,
    /* 2. relleno en tinta */
    linear-gradient(var(--sheet-ink), var(--sheet-ink)) 0 0 / var(--fill, 0%) 100% no-repeat,
    /* 3. divisiones de 1 px en la parte vacía (la capa 1 las tapa donde hay relleno) */
    repeating-linear-gradient(90deg, transparent 0 calc(var(--cell) - 1px), var(--sheet-line) calc(var(--cell) - 1px) var(--cell)),
    /* 4. fondo de papel opaco: la retícula no se mezcla con las divisiones */
    var(--sheet-bg);
}
@container (max-width: 24rem) {
  .detail__specs { grid-template-columns: minmax(0, 1fr); }
  .detail__spec { row-gap: var(--space-1); }
}
@media (forced-colors: active) { .detail__scale { display: none; } }  /* el texto ya dice el valor */
```
- Hueco con el bloque de fecha: el `gap: var(--space-4)` que ya tiene `.detail__info`; no hace falta margen propio.
- `subgrid` alinea la columna de etiquetas de todas las filas (la más ancha, "Player rating", ~95 px a 14 px). Navegadores sin `subgrid` (anteriores a 2023): cada fila mide su etiqueta por separado y los valores no quedan alineados; se lee igual. Se acepta.
- **Sin movimiento**: la ficha aparece con los demás datos (sin fundido propio, sin barras que crecen). Nada que reducir con `prefers-reduced-motion`.
- `prefers-contrast: more`: sin cambios (las filas ya son tinta sobre papel; la retícula se quita por §16.3).
- Claro y oscuro: solo tokens `--sheet-*`, que ya cambian con el tema (tinta azul en whiteprint, blanca en blueprint). En oscuro la barra rellena es blanca sobre azul.

**Contraste** (mismos pares de §16.8, mismo papel; no hay color nuevo):

| Par | Claro (sin línea / peor cruce) | Oscuro | Mínimo |
|---|---|---|---|
| valor (`--sheet-ink`) / hoja | 15.29 / 11.05 | 10.35 / 6.42 | 4.5 |
| etiqueta (`--sheet-ink-muted`) / hoja | 9.20 / 6.65 | 8.59 / 5.33 | 4.5 |
| relleno de la barra (`--sheet-ink`) / papel, y huecos de papel que lo cortan en celdas (decorativo, el texto lleva el dato) | 15.29 | 10.35 | — |
| líneas de fila, borde y divisiones de la parte vacía (`--sheet-line` / papel opaco, decorativas) | 2.85 | 4.57 | — |

Revisión (2026-10-05): la primera receta pintaba las marcas con `--sheet-line` **encima** del relleno (≈ 1.5:1 claro, ≈ 1.05:1 oscuro): invisibles, y la barra parecía una barra de progreso genérica. Ahora las celdas llenas se separan con huecos de papel (mismo contraste que tinta/papel) y las vacías con divisiones de `--sheet-line`: se lee como una regla de escala del plano. Se descartaron marcas que sobresalgan tipo `--dim-tick`: en una fila de 8 px de alto rozarían el texto y añadirían ruido junto a las cotas de las figuras.

**Para el frontend-engineer**: `GameDetail` en `api.ts` gana los cuatro campos (validar tipos: arrays de strings, números finitos o `null`; cualquier otra cosa = vacío); `renderSpecs(g)` en `detail.ts` llamado desde `renderData`, y `specs.replaceChildren()` en `renderBase`; la `dl` se inserta en `info` entre `release` y `status`; CSS de arriba en `detail.css`; copy de §16.9. Token nuevo: `--spec-scale` (ya en `tokens.css`). Sin dependencias.

**Para el tester**: con los cuatro campos → 4 filas en ese orden, `dt`/`dd` dentro de `dl`, barras `aria-hidden`, texto oculto "… out of 5/100"; `rating: 0` y `metacritic: null` → esas filas no existen; los cuatro vacíos → `dl` sin hijos y `display: none` (sin líneas); 1 plataforma → "Platform"; `["Linux", "Xbox One", "PC", "PlayStation 4", "Nintendo Switch"]` → "PC, PlayStation 4, Xbox One, Nintendo Switch, Linux"; en la barra de 4.4, 4 huecos de papel visibles sobre la tinta y la 5.ª celda llena al 40 %; 8 plataformas a 320×568 sin scroll horizontal, filas apiladas; a 1280 dos columnas con las etiquetas alineadas; claro y oscuro; `forced-colors` emulado → sin barras, texto visible.

### 16.15 Notas que quedaron fuera a propósito (revisión de la fase 6)

1. **Franja de contenido fuera del marco interior al hacer scroll.** El marco es un `outline` con `outline-offset` negativo sobre `.detail__sheet`: no se mueve, pero el contenido sí y se recorta en el borde de la hoja, no en la línea. Al hacer scroll el texto y las figuras pasan por los ~10 px que hay entre la línea y el borde. En reposo no se ve (el padding ≥ 16 px deja el contenido dentro). Se aceptó para la fase 6. **Arreglo propuesto para la fase 7 (pulido)**, solo CSS: un borde del color del papel hace de margen y el recorte cae justo en la línea:
   ```css
   .detail__sheet {
     border: var(--sheet-frame-inset) solid var(--sheet-bg);          /* overflow recorta en el padding box = la línea */
     padding: calc(var(--sheet-pad) - var(--sheet-frame-inset));      /* el contenido no se mueve */
   }
   @media (forced-colors: active) { .detail__sheet { border-color: Canvas; } } /* si no, sería un marco CanvasText de 10 px */
   ```
   El `outline-offset` de §16.3 se queda igual (la línea cae en el último píxel del borde). La barra de scroll pasa a quedar dentro del marco.
2. **`?noblink=` en la URL.** Al abrir (`pushState` con `?game=`) y al cerrar (`replaceState` sin `game`), `URLSearchParams` vuelve a escribir la URL entera y los parámetros sin valor salen con `=`: `?t=9500&noblink&mock=results` pasa a `?t=9500&noblink=&mock=results&game=hollow-knight`. Solo afecta a ganchos de desarrollo (`noblink`, `lab`), que se leen con `has()` y siguen funcionando; en producción no existen. No se toca. Los tests no deben comparar la URL como texto: comparar `searchParams`.
3. **Capturas repetidas de RAWG.** RAWG a veces guarda la misma imagen dos veces con nombres de archivo distintos, o la portada como captura con otro archivo. El filtro de §16.4 compara URLs exactas, así que esas repeticiones se cuelan (p. ej. Fig. 1 = portada y Fig. 2 = la misma imagen). Detectarlas exigiría descargar y comparar píxeles (canvas, CORS, coste en móvil) para un fallo esporádico de los datos. Se acepta; no es un error del cliente.

## 17. Pulido: el Chao tipea su globo con blips (2026-10-05)

Pedido por el usuario (plan `dejemos-el-deploy-para-immutable-stardust.md`). **Revierte "sin voz"** (§13, §14.1): no hay TTS ni audio grabado, solo un blip sintetizado por Web Audio mientras las letras aparecen, como los diálogos de Undertale. Sustituye al fundido de entrada del texto de §14.4 (el fundido de salida se queda). Sin dependencias ni assets.

### 17.1 Ritmo del tipeo

Tokens en `tokens.css` (bloque "Polish"), leídos con `time()`:

| Token | Valor | Para qué |
|---|---|---|
| `--type-char` | 32 ms | una letra (≈ 31/s: legible, rápido; Undertale va a ~1 letra por fotograma a 30 fps) |
| `--type-pause-sentence` | +200 ms | tras `.` `?` `!` `…` **si sigue un espacio** ("Hey! What", "Hmm… let") |
| `--type-pause-comma` | +100 ms | tras `,` `;` `:` si sigue un espacio ("Ooh, I", "Got it: ") |
| `--type-max` | 2200 ms | tope de la frase entera; si se pasa, **todos** los retardos se escalan por `max / total` (acelera parejo, conserva el ritmo de las pausas) |

- La pausa se suma al espacio que sigue a la puntuación, nunca al final de la frase ni dentro de "3.5" o "S/X" (sin espacio detrás).
- Las letras son **puntos de código** (`Array.from(line)`), no unidades UTF-16: comillas tipográficas y "…" cuentan como una.
- La primera letra sale en t = 0 (sin espera). `total` = instante en que aparece la última.
- Duraciones reales de las frases de `content.ts`: intro 1544 ms, `detailBack` 992, `thinking` 1096, `resultsPlain` 1196, `thinkingFound` con resumen de 26 caracteres 1676, `error` (la más larga, 54 letras) 1896. Ninguna llega al tope: hoy solo actuaría con resúmenes o frases futuras de más de ~68 caracteres.

**Función pura** (en `screen.ts` o `src/lib/type.ts`, con test): `typeSchedule(line, t) → { chars: string[], at: number[], total: number }` con `at[0] = 0`, `at[i] = at[i-1] + char + pausa(chars[i-1], chars[i])`, y el escalado por el tope.

**Reloj**: un único `setTimeout` encadenado que en cada vuelta mira `performance.now() - inicio` y muestra **todas** las letras ya vencidas (alcanza solo si el navegador retrasa los temporizadores: pestaña en segundo plano, máquina lenta; en ese caso salta varias letras de golpe y suena como mucho **un** blip por vuelta, nunca una ráfaga). No `requestAnimationFrame` (se para en segundo plano y la frase se quedaría a medias).

### 17.2 Estructura del globo (sin reflujo, un solo anuncio)

```
p.bubble#narrator-line[aria-live=polite][aria-atomic=true]     (igual que hoy)
  span.visually-hidden.bubble__spoken   "Hey! What kind of game are you looking for?"   ← lo que oye el lector, una vez
  span.bubble__text[aria-hidden=true]                                                  ← lo que se ve (se funde al salir, como hoy)
    span.bubble__typed    "Hey! What k"
    span.bubble__pending  "ind of game are you looking for?"    ← ocupa su sitio, invisible
```
```css
.bubble__pending { visibility: hidden; }
```
- **`visibility: hidden`, no `color: transparent`** (el plan proponía lo segundo): con `forced-colors` el navegador fuerza el color del texto y la parte pendiente se vería entera. `visibility` conserva el hueco igual y no se fuerza.
- Desde el primer instante el globo tiene su tamaño y sus saltos de línea finales: el texto no se recoloca mientras se escribe. Cada paso solo mueve la frontera: `typed.textContent = chars.slice(0, k).join('')`, `pending.textContent = chars.slice(k).join('')`.
- `.bubble__spoken` y `.bubble__text` tienen la frase **entera** desde el principio (el `textContent` de `.bubble__text` = typed + pending). El `textContent` de `#narrator-line` pasa a contener la frase **dos veces**: los scripts deben leer `.bubble__spoken`.
- `aria-describedby="narrator-line"` del input sigue bien: el cálculo de la descripción salta lo `aria-hidden` y lee solo la copia oculta.
- Sin cursor parpadeante: Undertale no lo tiene y sería otra animación en bucle.

### 17.3 Flujo de `say()` / `show()`, boca e interrupción

1. `say(line)` **para el tipeo en curso en el acto** (temporizador cancelado) y **pinta el resto de la frase de golpe** (`paint(chars.length)`, sin blips); después se funde (`--dur-fast`, como hoy). Revisión: dejarla tal cual cortaba palabras a la mitad durante el fundido ("Got it: cozy indie ga"), que se lee como un fallo; completa y fundida se lee como "ya lo dijo".
2. `show(line)`: rellena la estructura de §17.2 con `k = 0`, arranca el reloj y llama a `talk(chao, total + --type-char)`.
3. **Sin fundido de entrada** del texto nuevo (antes: opacidad + 4 px en `--dur-base`): las letras que aparecen ya son la entrada; los dos a la vez se veían blandos.
4. **Boca**: `talk()` recibe una **duración en ms** en vez del texto (fuera `clamp(len·55, 700, 2800)`). El ciclo de 900 ms corre mientras se tipea y para con el final suave de siempre (`stopTalking`) cuando acaba. Si llega otra frase, `talk()` se reinicia con la nueva duración. Los blips **no** mueven la boca: un blip cada ~64 ms abriría y cerraría la boca a 15 Hz, que parece un temblor; el ciclo a ~4.5 sílabas/s se lee como habla.
5. Intro: `say(n.intro)` sigue antes de que el globo aparezca; el tipeo arranca a la vez que el "pop" del globo (las 4-5 primeras letras salen mientras crece). Se acepta: retrasarlo dejaba un globo vacío 260 ms.
6. Abrir el detalle no dice nada; al cerrar se tipea `detailBack` normal.

### 17.4 Reduced motion

`prefers-reduced-motion: reduce` → la frase aparece **entera de golpe** (`k = chars.length`, sin reloj) y **sin blips**, exactamente como hoy (`show` directo, sin fundidos). La boca recibe la misma duración que habría durado el tipeo (`total`), así que se comporta igual que antes (§13.6). Por eso el botón de silencio **no se muestra** con reduce (§17.6): no habría nada que silenciar.

### 17.5 Sonido (`src/lib/blip.ts`, Web Audio, sin assets)

**Cuándo suena**
- Un blip por cada **2 letras** de cada palabra: suena la 1.ª, 3.ª, 5.ª… letra (`/[\p{L}\p{N}]/u`), y el contador vuelve a 0 al empezar cada palabra, así toda palabra arranca con blip ("I" incluido). Espacios, puntuación, comillas y "…": nunca.
- Separación mínima entre blips: **50 ms** (si el tope acelera la frase, se saltan los que caerían más cerca). Nunca dos blips solapados.
- No suena si: el usuario silenció, `document.hidden`, reduced motion, o todavía no hubo gesto.

**Primer gesto**: el `AudioContext` se crea **perezoso** en el primer `pointerdown` o `keydown` del documento (oyentes en captura, se quitan al crearlo), dentro del propio gesto, y se llama a `resume()` si viene `suspended`. Si está silenciado, no se crea: se creará cuando el usuario desactive el silencio (ese clic ya es un gesto). Sin `AudioContext` en el navegador: mudo sin errores. Consecuencia buscada: **la intro se tipea muda** (aún no hubo gesto; los navegadores no dejan sonar antes y un sonido sin pedirlo al abrir una web molesta). Si el gesto llega a mitad de una frase, suena desde ahí.

**Cómo suena** (constantes en `blip.ts`; no son CSS):

| Parámetro | Valor | Por qué |
|---|---|---|
| Forma de onda | `square` → `BiquadFilterNode` `lowpass` a 3200 Hz, Q 0.7 | el cuadrado es la voz de 8 bits de Undertale; el paso bajo le quita el filo que cansa en altavoces de portátil |
| Tono base | 784 Hz (sol 5) | agudo de criatura pequeña sin llegar a pitido |
| Variación por letra | `semitonos = (codePoint · 7) mod 5 − 2` (−2…+2), `f = base · 2^(st/12)` | determinista: la misma frase suena igual cada vez (y se puede testear); da entonación sin azar |
| Ajuste por mood | idle/listen 0, think −1, happy +3, sad −4, error −5 semitonos (lee `chao.dataset.mood` al sonar) | el mismo carácter que la pose, gratis |
| Duración | 45 ms (oscilador `stop` a 50 ms) | más corto que el hueco entre blips (≥ 50 ms): no se pisan |
| Envolvente | ganancia 0 → pico en 4 ms (`linearRampToValueAtTime`), caída exponencial a 0.0001 a los 45 ms | ataque rápido = "tic" claro; sin chasquido al cortar |
| Volumen | pico **0.05** | bajo: acompaña, no tapa música ni una llamada; un cuadrado a 0.05 tras el paso bajo ya se oye claro |

Cada blip crea su `OscillatorNode` + `GainNode` (son baratos y desechables); el filtro es uno compartido conectado a `destination`. Silencio = no crear osciladores (no un volumen a 0): así el tester puede espiar `createOscillator`.

### 17.6 Botón de silencio

- **Dónde**: en `.top-bar`, **a la izquierda** del botón de tema, `gap: var(--space-2)` (8 px entre zonas táctiles). Orden del DOM = orden visual: silencio, tema.
- **Separación con el título a < 375 px**: con dos botones a la derecha (50 + 8 + 50 px) la barra ocupa la franja donde cae el título centrado, y a 320 px el rebote compacto (4 px) lo dejaba a −1 px del botón de silencio. Solo en pantallas estrechas se aparta la barra 8 px:
  ```css
  @media (max-width: 23.4rem) { .top-bar { padding-block-end: var(--space-2); } } /* mismo corte que el globo de 3 líneas en compacto */
  ```
  Queda a ~7 px en el punto más alto del rebote. Por encima de 23.4rem no hace falta (el título no llega bajo los botones) y no se gasta altura.
- **Material y tamaño**: la receta del botón de tema tal cual (plástico, pill, `min-inline-size`/`min-block-size: var(--space-7)` = 48 px de contenido + 1 px de borde por lado = **50×50 px** ≥ 44, padding `--space-3`, hover con `--plastic-bg-hover` + brillo `::after`, `:active` con `--press-scale` y sombra presionada, foco global). Se añade `.sound-toggle` a los selectores de `.theme-toggle` en `screen.css` en vez de copiar reglas.
- **Semántica**: `<button type="button" class="sound-toggle" aria-pressed="false" aria-label="Mute Chao's voice">`. Nombre **fijo** y el estado lo da `aria-pressed` (`true` = silenciado): el lector dice "Mute Chao's voice, toggle button, not pressed". Sin `title` (el de tema tampoco lo tiene; el altavoz es universal).
- **Icono** SVG 24×24 (`viewBox="0 0 24 24"`, tamaño `var(--space-5)`, `aria-hidden="true"`, `focusable="false"`, trazo `currentColor` 2 px, extremos y uniones redondeados). Los dos estados están en el SVG y el CSS elige por `aria-pressed` (sin JS para el icono):
  ```html
  <path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <g class="sound-toggle__waves" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></g>
  <g class="sound-toggle__off" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15.5 9l6 6M21.5 9l-6 6"/></g>  <!-- aspa 6×6, del alto de las ondas (la de 5×5 pesaba poco frente al altavoz) -->
  ```
  ```css
  .sound-toggle svg { inline-size: var(--space-5); block-size: var(--space-5); }
  .sound-toggle[aria-pressed="true"] .sound-toggle__waves,
  .sound-toggle[aria-pressed="false"] .sound-toggle__off { display: none; }
  @media (prefers-reduced-motion: reduce) { .sound-toggle { display: none; } } /* sin tipeo no hay blips (§17.4) */
  ```
  Sonido activo = altavoz con ondas; silenciado = altavoz con aspa (muestra el estado actual, como cualquier reproductor). Sin otro cambio visual en "pulsado": una sombra hundida permanente parecería un botón atascado.
- **Contraste** (mismos pares de §8, el icono es `--color-text` sobre plástico como el de tema): reposo 12.84 claro / 7.67 oscuro; hover 13.79 / 6.01 (mínimo 3:1 para un icono de control). Foco: el anillo global, `--color-focus` sobre fondo 4.76 / 3.27.
- **Preferencia**: `localStorage` clave **`muted`**: `'1'` al silenciar, `removeItem` al reactivar; leer y escribir siempre en `try/catch` (almacenamiento bloqueado = sonido activo y el botón funciona igual durante la visita). **Por defecto, sonido activado**.
- Al silenciar con un tipeo en marcha: los blips paran en la letra siguiente; el tipeo sigue.

**Copy** (`content.ts`, inglés, sin emojis):
```ts
sound: {
  mute: "Mute Chao's voice",   // aria-label fijo; el estado lo lleva aria-pressed
},
```

### 17.7 Para el frontend-engineer

1. `screen.ts`: estructura de §17.2, `typeSchedule` + reloj de §17.1, `say`/`show` de §17.3 (parar el tipeo en `say`, sin fundido de entrada), reduce de §17.4.
2. `chao.ts`: `talk(chao, ms: number)`; borrar `TALK_MS_PER_CHAR` / `TALK_MIN_MS` / `TALK_MAX_MS` si quedan sin uso.
3. `src/lib/blip.ts`: `blip(char, mood)` + desbloqueo en el primer gesto + `setMuted(bool)` / `isMuted()`, §17.5.
4. `main.ts`: botón de §17.6 en `.top-bar` antes del de tema; `screen.css`: `.sound-toggle` junto a `.theme-toggle` y el CSS de §17.6. `content.ts`: bloque `sound`.
5. `tokens.css` ya tiene el bloque "Polish". Sin dependencias. Tests puros: `typeSchedule` (pausas, sin pausa sin espacio, tope que escala, puntos de código), la regla "1.ª, 3.ª… letra de cada palabra" y la fórmula del tono.

### 17.8 Verificación (para el tester)

- **Texto**: al llamar a `say`, `.bubble__spoken` y `.bubble__text` tienen la frase entera en el mismo frame (la latencia < 1 s de `verify-screen.mjs` se mide sobre `.bubble__spoken`); `.bubble__typed` crece hasta la frase entera y `.bubble__pending` queda vacío; tiempo hasta el final ≈ `typeSchedule().total` (intro ≈ 1.54 s ± 1 fotograma de temporizador).
- **Sin reflujo**: el `getBoundingClientRect()` del globo y el número de líneas no cambian entre la primera y la última letra (1280 y 375, claro y oscuro).
- **Pausas**: en la intro, el hueco entre la "!" y la "W" es ≈ 264 ms (el espacio llega a 32 + 200, la "W" 32 después); entre dos letras normales, 32 ms.
- **Accesibilidad**: `.bubble__text[aria-hidden=true]`; `#narrator-line` con `aria-live=polite`; la región cambia **una** vez por frase (MutationObserver sobre `.bubble__spoken`), no por letra. Con `forced-colors` emulado, la parte pendiente no se ve.
- **Boca**: `data-talking="cycle"` mientras `.bubble__pending` no está vacío y se quita ≈ `total + 32 ms` después del inicio.
- **Interrupción**: escribir y enviar durante la intro → el tipeo anterior se para en el acto y se completa de golpe (`.bubble__pending` vacío en el mismo frame, ningún oscilador más de esa frase), se funde y la nueva frase se tipea desde 0; nunca dos relojes a la vez.
- **Reduced motion**: frase entera al instante, `createOscillator` nunca llamado, `.sound-toggle` con `display: none`.
- **Audio** (espiar `AudioContext.prototype.createOscillator` y el constructor): antes de cualquier gesto, la intro no crea `AudioContext` ni osciladores; tras un `pointerdown`, `state === 'running'` y una frase como "Want to look for something else?" crea 1 oscilador por cada letra impar de cada palabra (Want: 2, to: 1, look: 2, for: 2, something: 5, else: 2 → **14**); con silencio, 0; con `document.hidden`, 0. Frecuencias entre `784·2^(−7/12)` y `784·2^(5/12)` Hz; ganancia pico ≤ 0.05.
- **Botón**: 50×50 (48 + borde), a la izquierda del de tema con 8 px de hueco; a 320×568 en compacto, ≥ 4 px entre el botón y el título en el punto más alto del rebote; mismo orden en el Tab; `aria-pressed` alterna `false`↔`true`; nombre "Mute Chao's voice" fijo; icono con ondas ↔ aspa; `localStorage.muted === '1'` tras silenciar y la preferencia sobrevive a recargar; sin `localStorage` (bloqueado) no hay errores de consola y el botón funciona; anillo de foco visible en los dos temas.
- Nota honesta: el sonido no se oye en headless; se comprueba que se dispara con los parámetros correctos y **el usuario lo valida de oído**.

### 17.9 Conflictos y puntos flojos (honesto)

- **Brief / CLAUDE.md "sin voz"**: revertido por petición explícita del usuario el 2026-10-05; CLAUDE.md y SPEC los actualiza el orquestador.
- **`visibility` en vez de `color: transparent`** (cambio sobre el plan): por `forced-colors` (§17.2).
- **Sin fundido de entrada del texto**: cambio sobre §14.4, motivo en §17.3.
- Safari en iOS con el interruptor de silencio físico activado no reproduce Web Audio: el botón dirá "no silenciado" y no sonará. No se puede detectar; se acepta.
- Un lector de pantalla oye la frase al empezar el tipeo, antes de que termine de verse; es lo correcto (no tiene que esperar a la animación).
- Los blips con la máxima aceleración por tope pueden saltarse algunas letras impares (regla de los 50 ms): suena un poco menos denso, que es lo que se busca.

## 18. Cambios posteriores a la fase 6: volver al inicio con el Chao y caja sin disco (SPEC §16, 2026-10-05)

Dos ajustes pedidos por el usuario. Sin tokens nuevos (todo sale de los existentes), sin dependencias. Revierte en parte §14.3.

### 18.1 A: el Chao compacto es "Start over"

**Cuándo es botón**: `#app[data-layout="compact"]` y `data-state` distinto de `detail`. Eso incluye `typing` / `empty-input` en compacto (el usuario reescribe tras unos resultados).
- **Por qué no solo results / no-results / error**: si el rol dependiera del estado, el Chao pasaría de botón a imagen con la primera tecla y volvería al buscar; el rol no debe cambiar mientras se escribe. Reiniciar desde `typing` no pierde nada (el input conserva el texto).
- **`thinking`** (hay `pending`): sigue siendo botón, con `aria-disabled="true"` y `cursor: progress` (como el input en `readonly`); el clic no hace nada. Se quita al terminar la búsqueda.
- **`detail`**: `role="img"`, sin `tabindex`, `aria-label` original (`content.character.alt`). El `<dialog>` modal ya deja la página inerte; esto es por coherencia. `detail(false)` vuelve a `beforeDetail` (compacto) sin pasar por el reinicio.
- **Layout full**: `role="img"`, como hasta ahora.

**Etiqueta (cadena exacta)**: `content.character.restart = 'Start over'`. La UI está en inglés y `content.ts` no tiene bloque en español, así que va solo en inglés (equivale a "Empezar de nuevo"). Se usa como `aria-label` y como `title` (el `title` es la única pista para quien usa ratón: tooltip nativo, sin chrome nuevo; con el mismo texto el lector no lo repite como descripción). En modo `img` se quita el `title`.

**Retorno (orden)**:
1. Si `pending`, `data-state="detail"` o layout ≠ compact: nada.
2. `finish()` (la frase a medias se completa sin blips), `shelf.clear()` (la fila desaparece al instante, sin fundido: la fila 3 del grid es `1fr`, quitarla no mueve el grupo ni afecta a la FLIP), quitar `aria-invalid` del input.
3. `go('intro', n.intro, 'idle')` forzando `layout = full`: estado `intro`, mood `idle` (no `enter`: el Chao ya está en pantalla, no vuelve a entrar saltando); el globo tipea "Hey! What kind of game are you looking for?" con blips normales (§17).
4. **FLIP inversa**: la misma función de §14.4 medida al revés (antes = compacto, después = full), `--dur-slow` y `--ease-out`, los mismos `transform-origin`. Si se pulsa durante la FLIP de ida, `measure()` lee las cajas en su posición visual de ese instante (`getBoundingClientRect` incluye el transform): la vuelta arranca donde está, sin salto. El rebote del título recupera `--title-bounce-distance` (como en la ida, al revés).
5. **Input**: conserva su texto (decisión del usuario), sin seleccionar. **Foco**: al input (`preventScroll`) si el puntero es fino **o** si se activó con teclado (en full el Chao deja de ser enfocable: sin esto el foco caería en `body`); con tap en táctil, `blur()` (no abrir el teclado solo, §14.2).
6. `?game=` no cambia; sin entrada de historial.
- **Reduced motion**: sin FLIP (cambio en su sitio) y frase entera al instante (§17.4).
- Una búsqueda nueva tras reiniciar vuelve a compactar con la FLIP de ida, como la primera vez.

**Teclado**: `keydown` Enter o Espacio (`preventDefault` en Espacio para no hacer scroll; ignorar `e.repeat`). `tabindex="0"`. Orden de Tab: tema, silencio, Chao, input, botón, fila, RAWG (el Chao va antes del input por orden del DOM).

**Affordance (CSS, en `screen.css`)**:
```css
/* Chao = "Start over" (DESIGN §18.1): compact only, never in detail */
#app[data-layout="compact"]:not([data-state="detail"]) .chao {
  cursor: pointer;
  border-radius: var(--radius-sm); /* only so the focus ring gets soft corners; no overflow: the ball and the jump stay visible */
}
#app[data-layout="compact"]:not([data-state="detail"]) .chao::after { /* hit area at least --space-7 (48 px) wide, layout untouched */
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline: min(0px, (100% - var(--space-7)) / 2);
}
#app[data-layout="compact"][data-state="thinking"] .chao { cursor: progress; }
```
- **Foco**: el anillo global de `base.css` (`--focus-width` 3 px, `--color-focus`, `--focus-offset`), sin regla nueva. Cae sobre el fondo holográfico: **4.76:1 claro / 3.27:1 oscuro** en el peor fotograma (§8, §12.8), ≥ 3 (UI).
- **Sin hover decorativo**: el Chao ya se mueve (parpadeo, saltos, boca); un brillo o halo encima competiría con el título y el globo, y sería el único hover que no está en un control de plástico. La FLIP que arranca en el mismo clic es la respuesta visual. Sin `:active` con `scale`: la FLIP ya anima `scale` en `.chao` y §13 pide no transformar las piezas con `filter`.
- El `::after` tapa las imágenes: de paso evita arrastrar la imagen con el ratón y el menú "guardar imagen" del toque largo.

**Objetivo táctil (pregunta de pantallas bajas)**: la caja de `.chao` mide `--chao-current` de alto × 0.561 (334/595) de ancho. Sin el `::after`:

| Pantalla | Chao compacto (alto × ancho, px) |
|---|---|
| 1440×900 | 120 × 67 |
| 1280×800 y 1280×600 (`max-height: 42rem`) | 108 × 60 |
| 768×1024, 844×390 (`max-height: 30rem`), 390×844, 375×667, 320×568 | 77 × 43 |
| 480–767 de ancho, p. ej. 667×375 apaisado | **58 × 32** |

- Todas pasan WCAG 2.5.8 AA (24 × 24). El objetivo de 44 px fallaba por 1 px en teléfonos y por 12 px entre 480 y 767 de ancho.
- **Respuesta**: no hace falta ninguna regla en `max-height: 42rem` ni en `30rem`; el `::after` resuelve todos los casos: mínimo **48 × 58** en todas las pantallas. Crece como mucho 8 px por lado; hacia el globo hay 12 px libres antes de la cola (`gap` = `--space-3` + `--bubble-tail`; la cola ocupa la parte pegada al globo), así que no lo pisa; en el apaisado compacto (narrador | formulario) el lado izquierdo da al margen.
- No se cuenta la bola como zona extra: ya está dentro de la caja (arriba, `top: 0.7%`); lo que faltaba era ancho, no alto.

**Para el tester** (además de SPEC §16.2): `role`, `tabindex`, `aria-label`, `title` y `aria-disabled` en intro, typing (full y compacto), thinking, results, no-results, error y detail; `elementFromPoint` a 23 px del centro del Chao en horizontal devuelve `.chao` a 667×375 y a 375×667; anillo visible con Tab en claro y oscuro; tras reiniciar con Enter, `document.activeElement === input`.

### 18.2 B: caja sin disco ni franja

```
┌──────────────────────────┐
│                    2021  │  ← banda negra --case-band-bg (12 %): solo el año, a la derecha
├▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┤  ← línea arcoíris --case-iridescent, sin cambios
│        (portada)         │  ← la portada entera, sin franja
│░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ Cozy Grove               │
└──────────────────────────┘
```
- Se borran `.case__band::before` (disco), el `<span class="case__spine">` y sus reglas (`.case__spine` y las tres `nth-child`). `.case__band` pasa a `justify-content: flex-end`; padding (`0 7%`), tipografía y tamaño del año sin cambios. En el comentario de `.case__band`, quitar "a generic disc mark".
- **Tokens retirados** (los borra el frontend-engineer tras un `grep` con 0 usos, según el plan): `--case-spine-w`, `--case-spine`, `--case-spine-2`, `--case-spine-3`, `--case-spine-4`. **Se queda** `--chrome-gradient` (barra del detalle y otros cromos).
- **Por qué la banda no se ve hueca**: es la franja impresa de una caja real (marca a la izquierda, dato a la derecha); sin marca, el año a la derecha y la línea arcoíris a todo el ancho bastan para leerla como caja PS2. Poner algo a la izquierda volvería a ser un adorno sin dato. Las cajas vecinas ya no se distinguen por la franja, sino por la portada, que ahora se ve entera.
- **Contraste**: no cambia (año `--knox-shine` sobre la banda > 18:1, §15.6). La placa del título no se toca.
