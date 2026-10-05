# Spec: Game Feelings

> Estado: **APROBADO (2026-10-02)** con los cambios de la ronda 2: IA gratis (Gemini), personaje Chao con crédito, pantalla única con narrador, trending pospuesto, 6 agentes. En construcción: Fase 1.
> Fuentes: `docs/00`–`04`, `PROMPT.MD`, HTML/CSS real descargado de las 2 URLs y muestreo de píxeles de las 8 imágenes.

---

## 1. Objetivo

Una página interactiva donde escribes qué juego quieres ("quiero un juego cooperativo de aventura", "a souls-like", "metroidvania para Switch"; en español o inglés) y una IA interpreta el requisito y devuelve juegos reales que lo cumplen. Un texto que solo expresa un sentimiento ("estoy triste") se convierte en un requisito implícito ("comforting cozy games"). Re-enfoque del 2026-10-03: antes era por emoción.

- **Usuario final:** alguien que se siente de una manera concreta y busca un juego que le acompañe.
- **Usuario real (el que importa):** quien revisa tu portfolio. Tiene que pensar *"este tipo tuvo una idea y la ejecutó bien"*.
- **Qué demuestra:** (1) integración correcta de IA (input libre → output estructurado y útil), (2) diseño fuerte inspirado en publicidad de videojuegos de los 2000, estética Y2K futurista: plástico translúcido, cromo, vidrio espejado.

### Historias de usuario y criterios de aceptación

| # | Sección (doc 03) | Criterio de aceptación |
|---|---|---|
| US1 | Sección inicial | Al cargar, el personaje (Chao) entra animado de izquierda a derecha, dice *"Hey! What kind of game are you looking for?"* en un bocadillo y después aparece el campo de texto. Con `prefers-reduced-motion` aparece todo sin desplazamiento. |
| US2 | Campo de texto | Centrado en pantalla, bordes redondos. `Enter` lanza la búsqueda. Vacío → el narrador pide un tipo de juego (no se llama a la API). Máx. 200 caracteres. Durante la búsqueda el narrador lo indica. |
| US3 | Interpretación IA | Gemini devuelve filtros reales de RAWG de una lista cerrada (géneros, tags, plataformas, años) más un resumen corto en inglés (≤26 caracteres para decirlo en voz del Chao) y hasta 5 juegos de ejemplo que RAWG verifica por slug o búsqueda (los títulos inventados se descartan). Sentimientos → requisito implícito. Gibberish, ofensivo, inyección de prompt o temas que no son juegos → mensaje amable (off_topic), no error técnico. |
| US4 | Sección de juegos | Una fila horizontal; 5 portadas visibles en ≥1280px (menos en pantallas menores); scroll horizontal (con snap) para ver más, ~20 resultados. Cada juego es una **caja estilo PS2 hecha en CSS** con su imagen recortada a 3:4. Hover → inclinación 3D que sigue al ratón. Accesible por teclado (Tab + Enter). |
| US5 | Detalle de juego | Al hacer clic se revela: título, descripción, año de lanzamiento y trailer **si RAWG lo tiene; si no, solo galería de capturas**. Se puede volver atrás (botón, `Esc` y botón "atrás" del navegador). |
| US6 | Narrador | El personaje cuenta en todo momento qué está pasando (ver §1.1). Su bocadillo es `aria-live="polite"`. |
| US7 | Tema | Claro y oscuro. Respeta `prefers-color-scheme` y tiene un toggle manual que se recuerda. |

**Fuera de alcance por ahora (mañana):** "Best Feelings Today" (top de emociones del día). Necesita almacenamiento compartido; se especifica cuando se retome.

### 1.1 Experiencia: pantalla única con narrador

La web es **una sola pantalla**: el buscador y el personaje. No hay más secciones. El personaje hace de narrador y su bocadillo cambia según el estado. Todos los textos viven en `src/content.ts` (borrador; el ui-designer los pule).

| Estado | Layout | Bocadillo |
|---|---|---|
| `intro` | Chao entra de izquierda a derecha; bocadillo + input centrados | "Hey! What kind of game are you looking for?" → aparece el input |
| `typing` | Igual | "Take your time. Press Enter when you're ready." |
| `empty-input` | Igual, sacudida corta del input | "Type a kind of game first, like “souls-like”." |
| `thinking` | Chao se balancea, input en solo lectura | "Hmm… let me think about that." |
| `results` | Chao + input suben y se compactan arriba; la fila de cajas PS2 entra desde abajo | "Ooh, {summary}! Try these." |
| `no-results` | Igual que results, sin fila | "I couldn't find games for that one. Try saying it another way?" |
| `error` | Igual | "My brain is buffering… try again in a moment." |
| `detail` | Panel encima de todo; `Esc` / botón / "atrás" del navegador para salir | (al volver) "Want to look for something else?" |

Pie fijo y discreto: "Chao © SEGA — fan project, not affiliated · Game data by RAWG" (con enlace a RAWG, que lo exige).

### 1.2 El narrador: Chao 2D animado por código (sin voz: cancelada por el usuario)

- **Personaje:** el Chao actual (`chao.webp`), **2D**. No hay modelo 3D, así que no se añade three.js ni ninguna dependencia. Las animaciones son por código (transform/opacity): idle (flotar/respirar), hablar (estiramiento sincronizado con el volumen del audio), pensando (balanceo), contento (salto), triste/encogerse, error. Parpadeo y boca, si hacen falta, como capas superpuestas por CSS/SVG. Todo con `prefers-reduced-motion` respetado.
- **Voz: CANCELADA (2026-10-02).** Sin audio, sin TTS, sin botón de sonido. La boca se anima por ciclo al mostrar cada frase.
- **La interpretación es en vivo** (Gemini, lista cerrada de géneros/tags/plataformas + ejemplos verificados contra RAWG). Sin tabla de emociones.

---

## 2. Mapa de capacidades (Phase 0)

La petición agrupa capacidades que se pueden probar por separado, así que se divide en módulos con ids estables:

| Module id | Responsabilidad | Depende de |
|---|---|---|
| `shell` | Andamiaje: estructura, tokens de diseño, tema claro/oscuro, fondo holográfico, título, archivo de contenido | — |
| `interpret` | `POST /api/interpret`: texto → `{ summary, genres[], tags[], platforms[], years?, examples[] }` vía Gemini (free tier), validado contra lista cerrada | — |
| `games` | `GET /api/games` y `GET /api/games/:id`: proxy a RAWG (la key no llega al navegador) | — |
| `search-ui` | Personaje, bocadillo, input, fila de cajas PS2 con tilt 3D, estados carga/vacío/error | `shell`, `interpret`, `games` |
| `detail-ui` | Vista de detalle con trailer/fallback y navegación atrás | `search-ui`, `games` |
Orden de construcción: `shell` → `interpret`, `games` (en paralelo) → `search-ui` → `detail-ui` → pulido/deploy. (`trending` pospuesto.)

Por ser un proyecto pequeño, todo vive en **este único SPEC.md** (una sección por módulo cuando toque). Si algún módulo crece, se separa en `SPEC-<id>.md`.

---

## 3. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Front | **Vite + TypeScript, sin framework** | Lo más liviano; la app es una sola pantalla. |
| Estilos | CSS nativo (custom properties, `@layer`, `color-mix`, container queries) | Sin librerías. Tokens en un solo archivo. |
| Backend | **Funciones serverless de Vercel** en `/api` (handlers estándar `Request → Response`) | La key de Gemini y la de RAWG nunca llegan al cliente. |
| IA | **Google Gemini (free tier)** por REST con `fetch` (sin SDK). Salida JSON con `responseSchema` + `enum` → la whitelist la impone la propia API | Gratis. Key verificada el 2026-10-02. |
| Modelo | **Primero `gemini-flash-lite-latest`** (un reintento solo ante 5xx), luego `gemini-flash-latest` una vez; presupuesto total por petición (~10 s); si todo falla → estado `error` del narrador | Medido el 2026-10-02 con esta key: `flash-latest` dio 429 en 8 de 8 pruebas (cuota) y 503 alguna vez; `flash-lite` respondió 200 en 8 de 8, en 0,9–1,9 s |
| Datos de juegos | RAWG API (key en `docs/04`) | Dada por el brief. |
| Tests | Vitest (unit) + script propio con `playwright-core` sobre el Chrome instalado (verificación visual) | Mínimo necesario. |
| Criterio de diseño | Skill **ui-ux-pro-max** (Impeccable no está instalada; elegiste esta) | Si choca con el brief, manda el brief. |

Dependencias totales previstas: `vite`, `typescript`, `vitest`, `playwright-core` (dev). Ninguna de runtime. Cualquier otra → preguntar antes.

> Nota de privacidad: en el free tier de Gemini, Google puede usar los prompts para mejorar sus productos. Los textos que escriben los usuarios ("cómo me siento") pasan por ahí. Aceptable para un portfolio; se menciona en el pie si se quiere.

---

## 4. Comandos

```bash
npm install                 # instalar
npm run dev                 # Vite en http://localhost:5173 (+ /api montado en dev por un plugin mínimo en vite.config.ts)
npm run build               # tsc --noEmit && vite build  → dist/
npm run preview             # sirve dist/ para probar el build
npm test                    # vitest run
npm run verify              # node scripts/verify.mjs → capturas 390px y 1440px, tema claro y oscuro, falla si hay errores de consola
npx vercel deploy           # deploy (fase final; pide confirmación antes)
```

Variables de entorno (`.env.local`, nunca en git): `GEMINI_API_KEY`, `RAWG_API_KEY`. `.env.example` lista los nombres sin valores. Regenerar la key de Gemini antes del deploy (quedó escrita en el chat).

---

## 5. Estructura del proyecto

```
index.html                → única página
src/
  main.ts                 → arranque, router mínimo (detalle vía history.pushState)
  content.ts              → ARCHIVO ÚNICO DE CONTENIDO: todos los textos de UI, frases del narrador, créditos
  styles/
    tokens.css            → color, tipografía, espaciado, radios, sombras, motion — claro y oscuro (dueño: ui-designer)
    base.css              → reset, tipografía base, utilidades
    (los estilos viven en src/styles/: tokens, base, holo, chao, screen; style-tile.css solo para ?lab)
  sections/*.ts           → screen.ts (pantalla única + máquina de estados), chao.ts, chao-rig.ts; results.ts y detail.ts en fases 5 y 6
  dev/lab.ts              → Chao lab, solo con ?lab en dev
  sections/results.ts + styles/results.css → fila de juegos (cajas PS2, tilt 3D, teclado); evento `game:open` en #app con {game, opener} para la fase 6; dev/mock.ts + dev/mock-games.ts solo en dev (import() dinámico); la fila es una sola parada de Tab (roving tabindex)
  lib/{api,dom,tokens}.ts → cliente de /api (nunca lanza), helper el(), lector de tokens
api/
  interpret.ts            → POST /api/interpret
  games.ts                → GET /api/games?genres=&tags=
  game.ts                 → GET /api/game?id=  (detalle + trailers + screenshots) → { name, description, released, trailer|null, screenshots[], platforms[<=12], genres[<=5], rating 0-5 1 dec|null (null sin votos), metacritic 1-100|null }
  _lib/                   → whitelist de géneros/tags RAWG, validación, clientes Gemini y RAWG
public/
  fonts/                  → fuentes self-hosted (woff2)
  character/             → chao.webp (original sin fondo) + capas del rig: chao-body/wing/eyes/mouth.webp, chao-eyes-happy.svg, 5 bolas chao-ball*.svg
  (estilos: src/styles/chao.css y holo.css viven en src/styles/, no en styles/sections/)
.claude/agents/           → los 6 agentes del proyecto (§13)
scripts/verify.mjs        → verificación en navegador
tests/                    → *.test.ts (vitest)
docs/                     → brief (no se toca)
```

---

## 6. Estilo de código

```ts
// api/interpret.ts — handler estándar, validación en el borde, salida cerrada
import { GENRES, TAGS } from './_lib/rawg-vocab';

export async function POST(req: Request): Promise<Response> {
  const { text } = await req.json().catch(() => ({ text: '' }));
  if (typeof text !== 'string' || !text.trim() || text.length > 200) {
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  }
  const raw = await askGemini(text);
  return Response.json({
    emotion: raw.emotion,
    genres: raw.genres.filter((g) => GENRES.has(g)),
    tags: raw.tags.filter((t) => TAGS.has(t)),
  });
}
```

- TypeScript `strict`. `camelCase` funciones/variables, `PascalCase` tipos, `kebab-case` archivos y clases CSS.
- Sin clases ni abstracciones que no se necesiten; funciones pequeñas.
- Todo texto visible sale de `src/content.ts`, nunca hardcodeado en componentes.
- CSS: solo tokens (`var(--…)`), nada de valores mágicos sueltos. Animaciones solo con `transform`/`opacity`.
- Preferencias de diseño declaradas (de tu brief/referencias): sin emojis en la UI, sin estética genérica de IA (nada de gradientes violeta-genéricos, tarjetas redondeadas idénticas, glassmorphism por defecto sin intención).

---

## 7. Estrategia de testing

| Nivel | Qué | Dónde |
|---|---|---|
| Unit (Vitest) | Validación de input, saneado de la respuesta de Claude contra la whitelist, construcción de la query a RAWG, resolución de títulos de ejemplo, límites de coste de RAWG | `tests/*.test.ts` |
| Verificación en navegador | En **cada fase**: capturas a 390px y 1440px, en claro y oscuro, cero errores de consola. Las reviso yo antes de decirte "hecho". | `npm run verify` |
| Manual guiado | Matriz de ~19 frases es/en (lista y resultados reales en `tests/requests-sample.md`) para juzgar la calidad del matching | re-enfoque |

Sin framework E2E: el script de verificación cubre lo necesario.

---

## 8. Límites

- **Siempre:** leer este spec antes de cada fase; verificar en navegador antes de decir "hecho"; mantener keys solo en el servidor; respetar `prefers-reduced-motion`; contraste AA; navegable por teclado; parar al final de cada fase para tu validación.
- **Preguntar antes:** añadir cualquier dependencia no listada en §3; crear cuentas/servicios (Vercel); hacer deploy; cambiar el alcance de una sección; usar cualquier asset con copyright nuevo.
- **Nunca:** meter API keys en el bundle del cliente o en git; reusar el video de Shutterstock de la referencia 2 ni el logo de Knoxstation; usar logos de Sony/SEGA (el Chao sí, aprobado, siempre con el crédito del pie); avanzar a la siguiente fase sin tu OK; tocar `docs/`.

---

## 9. Referencias — valores extraídos (para que confirmes que miramos lo mismo)

### Referencia 1 — knoxstation.neocities.org → SOLO el estilo tipográfico del título del header

| Aspecto | Valor real extraído |
|---|---|
| Qué es | `<header id="box-header"><img src="images/logo1.gif" width="710" height="357">` — **es una imagen**, no una fuente. GIF 1920×965, 9 frames. |
| Forma de las letras | Lettering a mano: itálica fuerte (~20°), **extendida/ancha**, geométrica tipo techno con esquinas cortadas, mezcla de una mayúscula gigante ("K") con minúsculas. Sin contraste de trazo. |
| Relleno | `#ffffff` |
| Extrusión 1 (borde interior) | `#57a0ff` (variantes en paleta: `#59a2ff`, `#569fff`) |
| Extrusión 2 (sombra 3D, desplazada abajo-derecha) | `#1a7cff` (variantes: `#167aff`, `#187bff`) |
| Brillos | `#74beff`, `#dffdff` |
| Contorno | Exterior redondeado, suave, dos capas apiladas = efecto de letra "inflada/plástica". |
| Animación (CSS real) | `#box-header > img { animation: bounce 1.5s ease-in-out infinite }` · `@keyframes bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }` |
| Cómo lo traemos | Título "Game Feelings" como **texto real** (accesible, nítido) con fuente display itálica-extendida + extrusión en 2 capas con esos dos azules (`text-shadow` apilado / `paint-order`). La fuente exacta se elige en fase 1. |
| Descartado | Todo lo demás: fondo, palmera, cajas, marquee, nav, "MS UI Gothic", cursores. |

### Referencia 2 — digivalet-toffeenut.webflow.io → SOLO el fondo en movimiento

| Aspecto | Valor real extraído |
|---|---|
| Qué es | Un **video en loop**, no CSS: `.hero-section.landing-page > .background-video-wrapper` (`position:absolute; z-index:-99`) `> .w-background-video > <video autoplay loop muted playsinline>` |
| CSS del video | `position:absolute; top/right/bottom/left:-100%; margin:auto; width:100%; height:100%; object-fit:cover; z-index:-100` (truco para centrarlo y cubrir). Alto del wrapper: 1260px (todo el hero). |
| Archivo | MP4/WebM 1280×720, **15,03 s**, loop, mudo, poster JPG mientras carga. Es stock de Shutterstock (#1009352120) → **con licencia, no se puede reutilizar**. |
| Contenido visual | Líquido iridiscente/holográfico, ondas lentas y desenfocadas. |
| Colores dominantes (muestreo de 2 frames) | `#f0ffff` blanco-cian · `#f0f0ff` blanco-lila · `#d8d8f0` lavanda gris · `#f0d8f0` rosa lila · `#c0f0ff` cian · `#a8d8f0` azul cielo · `#d8c0f0` violeta suave |
| Cómo lo traemos | Fondo **propio** con el mismo efecto: gradiente holográfico animado (canvas/WebGL ligero o CSS con capas desenfocadas) en esa paleta, ~15 s por ciclo, fijo a pantalla completa. Cero peso de video. Con `prefers-reduced-motion` → estático. En tema oscuro, misma técnica sobre azules profundos. |
| Descartado | Todo lo demás: fuentes "Aktiv Grotesk"/"Addington CF", nav, texto animado, blob, secciones. |

### Imágenes de vibe (solo estética: material, color, tipografía, recursos gráficos)

Nota: `image-3 = image-4`, `image-5 = image-6`, `image-8 = image-9` son duplicados. El doc lista 8 imágenes; hay 7 distintas.

| Img | Qué tomo | Colores dominantes (muestreo) |
|---|---|---|
| 1 `image.png` (Sonic poster) | Barra superior **cromada/plateada con esquina cortada en diagonal**; tipografía extendida con contorno ("COMING SOON"); marcos finos translúcidos; texto con estela de velocidad ("FUTURE") | `#000020` `#202040` `#80a0c0` `#a0c0e0` |
| 2 `image-1.png` (PS1 poster) | Degradado **azul profundo → crema** con **grano** fuerte; formas con **glow** neón blanco; texto pequeño en mayúsculas muy espaciado | `#2040a0` `#204080` `#ffffe0` `#c0c0c0` |
| 3 `image-2.png` (blueprint) | Azul PlayStation con **retícula**; anotaciones técnicas ("FIG. 1", medidas) → idea para metadatos en el detalle | `#0040a0` `#2060a0` `#e0ffff` `#ffffff` |
| 4 `image-3.png` (collage PS2) | Grano de papel y recorte; es la menos alineada con "futurista limpio" → solo la textura de grano | `#e0e0e0` `#202020` `#e0e0c0` |
| 5 `image-5.png` (PS2 chica) | **Plástico translúcido azul hielo** (mandos), **estrella cromada**, halo/glow, pixelado como efecto; logotipo "PS2" de trazo fino extendido | `#ffffff` `#406080` `#e0ffff` |
| 6 `image-7.png` (PS2 halftone) | **Trama de puntos (halftone)** duotono navy sobre gris claro | `#e0e0e0` `#404080` `#202060` |
| 7 `image-8.png` (Ex Machine cover) | **Plantilla de la caja PS2**: lomo con degradado azul→cian, línea arcoíris fina, bloque tipo ESRB, código de barras, sans itálica bold, katakana decorativo | `#ffffff` `#4040c0` `#404080` |

**Dirección resultante:** azules PlayStation + blancos perla + iridiscencia pastel; materiales cromo / plástico translúcido / vidrio; grano y halftone como textura sutil; tipografía extendida-itálica para display.

---

## 10. Inventario de assets

| Tipo | Lo que hay | Lo que falta |
|---|---|---|
| Fuentes | Nada | Display itálica-extendida (estilo Knox) + sans de texto. Propongo fuentes libres (OFL) self-hosted, elegidas en fase 1. **No falta nada tuyo** salvo que tengas una fuente preferida. |
| Personaje | `personaje.jpg` — Chao (© SEGA), 3D, JPG con fondo blanco | Se le quita el fondo una vez → `public/character/chao.webp`. Se usa con crédito. |
| Logo / título | Nada | Se construye como texto CSS (no hace falta imagen). |
| Fondo animado | Nada (el de la ref. 2 tiene licencia) | Se genera por código. No falta nada. |
| Portadas de juegos | RAWG da screenshots horizontales, **no box art** (verificado) | Resuelto: caja PS2 en CSS con imagen recortada 3:4. |
| Trailers | RAWG `/games/{id}/movies` | Cobertura baja: en 5 juegos probados solo 1 tenía trailer. Sin trailer → solo capturas. |
| Favicon / OG image | Nada | Se crea en la fase de pulido. |
| Fotos / imágenes de proyecto | Solo las 8 referencias en `docs/` (no se usan en la web) | — |
| Keys | RAWG (en `docs/04`) + Gemini (verificada) | Nada. |

---

## 11. Decisiones de producto que relleno (puntos vacíos del brief)

1. **Idioma de la UI:** inglés (la frase del personaje está en inglés). El usuario puede escribir en cualquier idioma; Gemini lo entiende.
2. **"Una fila de 5, hasta 5 columnas":** 1 fila horizontal, 5 visibles en desktop, scroll horizontal con snap, ~20 resultados. *(Confirmado.)*
3. **Matching emoción → juegos (híbrido, decidido en la ronda 3):** una **tabla curada** de 30 emociones → géneros y tags base de RAWG, más tags extra que Gemini puede añadir **solo de la lista cerrada** (el `enum` del schema lo impone y el servidor vuelve a filtrar; una lista de tags prohibidos por familia de emoción evita, por ejemplo, terror para "anxious"). Gemini interpreta el texto libre y elige la emoción; la tabla garantiza coherencia y se puede probar. El servidor consulta RAWG por popularidad y reordena por tags coincidentes y rating, solo con juegos con imagen y sin contenido adulto. Neutraliza prompt injection: solo pueden salir slugs válidos.
4. **Trailer:** si RAWG lo tiene, se muestra; si no, **solo galería de capturas**. *(Confirmado.)*
5. **Detalle:** panel que se superpone a la página (no página nueva), con URL `?game=<slug>` para que "atrás" funcione y se pueda compartir. Descripción desde `description_raw` (texto plano) con `textContent` → no se inyecta HTML externo.
6. **Abuso/coste:** límite de peticiones por IP en `/api/interpret` (ej. 10/min, en memoria por instancia: `ponytail:` pasar a Redis si hace falta) y longitud máxima de input. Respuestas cacheadas por texto normalizado.
7. **Tema claro/oscuro:** claro = perla iridiscente (ref. 2); oscuro = azul PlayStation profundo con retícula/grano (imágenes 2–3). El título Knox funciona en ambos.

---

## 12. Orden de construcción por fases

Cada fase termina con verificación en navegador por mi parte + tu validación. **Ninguna fase es el diseño final hasta la 7.**

| Fase | Contenido | Agentes | Verificación |
|---|---|---|---|
| **1. Andamiaje** | Proyecto Vite+TS, estructura, `tokens.css`, `base.css`, tema claro/oscuro con toggle + `prefers-color-scheme`, fuentes, `content.ts`, Chao sin fondo. Página = "style tile". | ui-designer → frontend-engineer → tester → design-reviewer + code-reviewer | Capturas 390/1440 × claro/oscuro, 0 errores consola, `npm run build` OK |
| 2. Fondo + título | Fondo holográfico animado + título estilo Knox con bounce | ui-designer → frontend-engineer → tester → design-reviewer | Capturas + reduced-motion + FPS |
| 3. Backend *(en paralelo con 2)* | `/api/interpret` + `/api/games` + `/api/game`, whitelist, fallback de modelo, tests, prueba con 10 frases | backend-engineer → tester → code-reviewer | `npm test` verde + tabla frase→juegos para que la juzgues |
| 4a. Chao animado | Animaciones por código del Chao 2D (§1.2): idle, hablar, pensando, contento, triste, error | ui-designer → frontend-engineer → tester → design-reviewer | Capturas/secuencia por estado, reduced-motion |
| 4b. Pantalla única | Narrador (Chao + bocadillo) + input + máquina de estados (§1.1), con datos simulados | ui-designer → frontend-engineer → tester → reviewers | Capturas de cada estado |
| 4c. ~~Voz~~ | **Cancelada por el usuario** (sin audio) | — | — |
| 5. Fila de juegos | Cajas PS2, scroll horizontal, tilt 3D, conexión con la API | ídem | Capturas + prueba de teclado |
| 6. Detalle | Panel, trailer o capturas, atrás | ídem | Capturas con y sin trailer, `Esc` y back |
| 7. Pulido + deploy | A11y, performance (LCP < 2,5 s), auditorías (+ `agent-skills:web-performance-auditor`), favicon/OG, regenerar key, deploy a Vercel (lo hago yo, con tu confirmación) | todos | Auditorías + URL pública |
| Mañana | Best Feelings Today | — | — |

---

## 13. Agentes

Definidos en `.claude/agents/`. Las skills de cada uno están en su archivo (precargadas con `skills:` y además invocadas al empezar).

| Agente | Responsabilidad | Escribe en | Skills clave |
|---|---|---|---|
| **backend-engineer** | `/api/*`, Gemini, proxy RAWG, validación, rate limit, caché | `api/`, `vite.config.ts` | source-driven-development, api-and-interface-design, security-and-hardening, test-driven-development, incremental-implementation, debugging-and-error-recovery, ponytail, verification-before-completion |
| **frontend-engineer** | HTML/TS/CSS, máquina de estados del narrador, animaciones. Implementa lo que define el diseñador | `index.html`, `src/` (menos `tokens.css`) | ui-ux-pro-max, frontend-ui-engineering, modern-javascript-patterns, performance-optimization, incremental-implementation, run, receiving-code-review, ponytail |
| **ui-designer** | Decide y documenta el diseño (tipos, paleta, espaciado, jerarquía, movimiento, estados) respetando el brief | `src/styles/tokens.css`, `DESIGN.md` | **ui-ux-pro-max**, frontend-design, documentation-and-adrs, idea-refine |
| **tester** | Vitest + verificación en navegador | `tests/`, `scripts/verify.mjs` | test-driven-development, browser-testing-with-devtools, run, verification-before-completion, systematic-debugging, webperf |
| **design-reviewer** | Revisa fidelidad al diseño y al brief, a11y, responsive. No edita | — | ui-ux-pro-max, frontend-design, frontend-ui-engineering, browser-testing-with-devtools |
| **code-reviewer** | Revisa front y back: 5 ejes + seguridad. No edita | — | code-review-and-quality, security-and-hardening, ponytail-review, code-simplification |

**Flujo por fase:** ui-designer define → engineers construyen → tester verifica → design-reviewer + code-reviewer en paralelo → engineer corrige → orquestador verifica en navegador → validación del usuario.

---

## 14. Criterios de éxito

- [ ] Las 7 historias de §1 cumplen su criterio de aceptación, verificadas en navegador.
- [ ] De la frase al primer resultado visible: < 4 s (p50) en conexión normal.
- [ ] LCP < 2,5 s, CLS < 0,1 en móvil (Lighthouse).
- [ ] Ninguna API key en `dist/` (`grep` del build vacío).
- [ ] Contraste AA en ambos temas; todo operable con teclado; `prefers-reduced-motion` respetado.
- [ ] Funciona desde 360px de ancho sin scroll horizontal de página (salvo la fila de juegos).
- [ ] 10 frases de prueba devuelven juegos que tú consideras coherentes (≥ 8/10).

---

## 15. Preguntas abiertas

1. **Nombre en pantalla:** se usa "Game Feelings" como título provisional hasta que digas otro.

Resueltas en la ronda 2: personaje (Chao con crédito), IA (Gemini free, key verificada), trending (mañana), pantalla única con narrador, trailer (solo capturas si falta), fila (1 fila, 5 visibles).

## 16. Cambios de UI posteriores a la fase 6 (2026-10-05) — construido, verificado y confirmado (input se conserva; en detail el Chao no hace nada)

Alcance: dos ajustes pequeños. Sin dependencias nuevas. Modifica la decisión "el layout compacto persiste" (DESIGN §14), que pasa a tener una salida explícita.

### 16.1 Objetivo
- **A. Volver al inicio con el Chao.** En `data-layout="compact"`, un clic/tap/Enter sobre el Chao devuelve la pantalla al estado inicial: Chao y título a tamaño de intro, la fila de juegos desaparece, vuelve el formulario.
- **B. Caja de juego más limpia.** Quitar de `.case` (fila de resultados) el icono de disco (círculo cromado arriba a la izquierda) y la barra vertical degradada (`.case__spine`, derecha).

### 16.2 A — comportamiento y criterios de aceptación
Valores por defecto propuestos (confirmar):
- El Chao es un `<button>` (o tiene rol de botón, foco visible, Enter/Espacio) solo mientras `data-layout="compact"`; en `full` no es interactivo. Etiqueta accesible tipo "Empezar de nuevo".
- Estados desde los que funciona: results, no-results, error. En `detail` no (el panel cubre la pantalla; se cierra con su propio botón).
- Efecto: `app.dataset.layout = 'full'`, `data-state = 'intro'`; `shelf.clear()`; animación FLIP inversa a la existente (respeta reduced-motion); el Chao dice la línea de intro (`n.intro`) y vuelve a `idle`.
- El texto escrito en el input se conserva y recibe foco (puntero fino); así el usuario puede reeditar. Alternativa: vaciarlo.
- Si hay una petición en curso (`pending`), el clic se ignora.
- `?game=` no cambia; no hay entrada nueva en el historial.
Criterios: (1) tras buscar, clic en el Chao → sin cajas en el DOM visibles y tamaños idénticos al arranque (comparar bounding boxes con la intro, 375/1280); (2) teclado Tab+Enter lo activa; (3) con reduced-motion no hay animación; (4) una nueva búsqueda vuelve a compactar normalmente; (5) 0 errores de consola.
Archivos: `src/sections/screen.ts` (`go`, `COMPACT`, FLIP), `src/sections/chao-rig.ts` (rol/botón), `src/styles/screen.css`, `DESIGN.md` §14 (nota de cambio de decisión), `scripts/verify-*.mjs` y tests que asumen que compact persiste.

### 16.3 B — comportamiento y criterios de aceptación
- Eliminar `.case__band::before` (disco) y el `<span class="case__spine">` con sus reglas (`.case__spine`, `nth-child` ×3, tokens `--case-spine*` si quedan sin uso).
- La banda negra con el año y la línea iridiscente se quedan. Al desaparecer el disco, el año queda alineado a la derecha (`justify-content: flex-end`), como en la captura.
- Criterios: ninguna caja muestra disco ni barra a 375 y 1280, en claro y oscuro; el título y el resto no cambian de tamaño; contraste AA intacto (`npm run verify:contrast`); `npm test` y verify en verde (ajustar checks que busquen el spine).

### 16.4 Límites
- Siempre: verificar en navegador, ui-designer documenta en DESIGN.md antes de construir, parar al final para validación.
- Preguntar antes: cambiar el contrato `game:open`, tocar el panel de detalle.
- Nunca: añadir dependencias, tocar `docs/`, dejar servidores abiertos.

### 16.5 Estrategia de testing
Vitest para la lógica pura nueva (si la hay); verify de navegador: tamaños tras reset = intro, ausencia de `.case__spine` y del pseudo disco (computed style), teclado, reduced-motion.
