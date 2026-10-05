# Game Feelings

Web de una sola pantalla: el usuario escribe qué juego quiere ("co-op de aventura", "un souls-like"; español o inglés), Gemini interpreta el requisito y la página devuelve juegos reales de RAWG. Un Chao 2D animado hace de narrador. Es una pieza de portfolio, estética Y2K futurista (cromo, plástico translúcido, fondo holográfico). Re-enfoque del 2026-10-03: antes era por emoción.

## Dónde está todo (leer antes de actuar)
- `SPEC.md`: fuente de verdad (objetivo, historias de usuario, stack, estructura, límites, fases §12, agentes §13). Si algo cambia, se actualiza ahí primero.
- `DESIGN.md`: decisiones de diseño con su porqué (tokens, tipografía, fondo WebGL §12, estados del narrador). Dueño: ui-designer.
- `docs/`: brief original del usuario. **No se edita.** `docs/04-CONTENIDO.MD` contiene una key de RAWG (ignorado por git).
- `.claude/agents/`: 6 agentes del proyecto con sus skills: ui-designer, frontend-engineer, backend-engineer, tester, design-reviewer, code-reviewer.
- `tests/requests-sample.md`: tabla frase → filtros → juegos (con resultados reales de la API) para juzgar la coherencia del matching.

## Reglas del usuario (no negociables)
- Responder en español. Directo, sin rellenar.
- **Verificar yo en el navegador antes de decir "hecho"**; no pedirle al usuario que lo compruebe.
- Construir por fases y **parar al final de cada una** para que el usuario valide. No avanzar sin su OK.
- Sin emojis en la UI. Nada de estética genérica de IA. Si el brief y una skill chocan, manda el brief.
- Preguntar antes de: añadir dependencias, crear cuentas/servicios, hacer deploy, cambiar alcance, usar assets con copyright nuevos.
- Keys (`GEMINI_API_KEY`, `RAWG_API_KEY`) solo en `.env.local` y en servidor; nunca en el cliente, git, logs ni salidas. Regenerar ambas antes de publicar (quedaron escritas en el chat).
- No dejar servidores abiertos: parar el dev server y confirmar que el puerto queda libre.

## Flujo por fase
ui-designer define → frontend/backend-engineer construyen → tester verifica → design-reviewer + code-reviewer revisan → el engineer corrige → el orquestador (sesión principal) verifica en el navegador → el usuario valida.
Modelos fijados (no heredan de la sesión): ui-designer, design-reviewer y code-reviewer → opus; frontend-engineer, backend-engineer y tester → sonnet. No tienen `effort` propio.
Los agentes se cargan al iniciar la sesión. Si no aparecen como `subagent_type`, lanzar un agente genérico que lea su archivo de `.claude/agents/`.

## Comandos
`npm run dev` (5173) · `npm run build` · `npm test` · `npm run verify` (necesita `npm run build` hecho y el dev server en 5173) · `npm run verify:contrast` · `npm run verify:vocab`
Chrome headless para WebGL: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Windows + Git Bash; no hay Python ni ffmpeg.

## Estado (2026-10-02)
- Hecho y verificado: **Fase 1** (andamiaje, tokens, tema claro/oscuro), **Fase 2** (fondo WebGL holográfico, título Knox con rebote), **Fase 3** (backend `api/`, 560 tests).
- Fase 3 **validada por el usuario**. Fase 4a construida, verificada y **validada por el usuario** (3 rondas de revisión; tester 0 errores; DESIGN §13). Notas para 4b en DESIGN §13.15: headroom sobre el narrador (sin overflow:hidden) para el salto de happy, comprobar que el corazón no roce el título con data-state=results, cara ilegible en compacto (58 px: lo lleva la bola). Excepción documentada a "solo transform/opacity": chao-talk anima --voice-level (3-7 % del hilo principal).
- Fase 4b construida, verificada y **validada por el usuario** (610 tests; verify 0 errores; DESIGN §14). Para la fase 5: recalcular `--shelf-block` con la altura real de la caja PS2 (a 375x667, 320x568 y 1280x600 la fila quedaría cortada; recortar el grupo superior en pantallas bajas). Pendiente del ui-designer (Opus sin cuota hasta ~3:50): revisar la nota de rev. 3 al final de DESIGN.md (quitado scrollbar-gutter, frases acortadas, padding del enlace RAWG). Siguiente: 5 fila de juegos → 6 detalle → 7 pulido + deploy.
- **Fase 6 (panel de detalle) validada por el usuario (2026-10-05)**; título "Game Feelings" confirmado. Incluye ficha técnica (plataformas ordenadas por familia, géneros, nota de jugadores, Metacritic; DESIGN §16.14-16.15) y `/api/game` ampliado (platforms ≤12, genres ≤5, rating, metacritic; SPEC). 762 tests. Siguiente: **fase 7** (pulido + deploy): CSP (`media-src` para trailers RAWG/Steam, `img-src media.rawg.io`), recalcular `--shelf-block` en pantallas bajas, arreglo CSS de franja fuera del marco al hacer scroll (§16.15), separación de párrafos de la descripción, regenerar keys antes de publicar. Verify completo (~25 min) solo, nunca en paralelo. Sigue pendiente de cerrar un vite huérfano en 5173 (PID 31036) que el usuario debe parar.
- **Pulido final (2026-10-05): tipeo del globo + blips construido y verificado** (769 tests; verify 665 OK; DESIGN §17; `scripts/verify-typing.mjs`). **Validado por el usuario (2026-10-05)**, incluido el sonido. Deploy queda para otro momento por decisión del usuario.
- (Histórico, superado por la fase 6) **PUNTO DE RETOMA (2026-10-04, pausa pedida por el usuario):** re-enfoque y fase 5 terminados y verificados (tester: verify 541 OK, 0 FAIL; mi verificación en navegador con API real OK; 751 tests verdes, 4 pasadas en paralelo). Lo único pendiente es PRESENTAR al usuario la fase 5 + el re-enfoque para su validación (resumen: requisito en es/en, sentimiento = requisito implícito, relleno por filtro sin clones, "WET" 2009 es el único colado en cozy; fila PS2 clic = evento game:open sin efecto hasta fase 6) y, si valida, empezar la fase 6 (panel de detalle: trailer o capturas, ?game=<slug>, atrás). Pendiente del ui-designer (Opus): revisar notas de rev. 3 al final de DESIGN.md. Reanudar con SendMessage a los agentes ya creados en vez de lanzar nuevos.
- **Re-enfoque a requisitos de juego: hecho** (2026-10-04; backend 742 tests, copy en DESIGN §14.13). Fase 5 construida y verificada, **pendiente de validación del usuario junto con el re-enfoque** (611 tests; verify 510 OK; DESIGN §15). `game:open` en #app con {game, opener} es el contrato para la fase 6 (el clic hoy no abre nada). La fila es una sola parada de Tab (roving). Rendimiento medido con fondo vivo (no congelado). Pendiente del ui-designer: revisar la nota de rev. 3 al final de DESIGN.md (mask de .shelf::after). Siguiente: 6 detalle → 7 pulido + deploy.
- Pendiente del usuario: confirmar el título "Game Feelings".

## Decisiones que no deben re-litigarse
Vite + TypeScript sin framework · Vercel (funciones en `api/`) · Gemini con `flash-lite` primero (medido: `flash-latest` da 429) · matching híbrido por requisito (Gemini → filtros RAWG de lista cerrada + hasta 5 juegos de ejemplo verificados por slug/búsqueda; sentimientos → requisito implícito; sin tabla de emociones) · Chao 2D animado por código (sin 3D, sin three.js) · **voz = blips, sin TTS** (revertido por el usuario el 2026-10-05: el Chao tipea su globo letra a letra con un blip sintetizado con Web Audio, estilo Undertale; sin archivos de audio; intro muda hasta el primer gesto; botón de mute; DESIGN §17. Sigue sin haber TTS) · fondo con shader WebGL pequeño y fallback CSS.

## Cuidados conocidos
- El skill `ui-ux-pro-max` instalado solo trae su SKILL.md (sin base de datos). `Impeccable` no está instalada.
- Sin comprobar aún en un deploy real: `maxDuration` junto a handlers `GET/POST`, que `api/_lib` no se despliegue como función, respuesta a 405/HEAD/OPTIONS.
- El frontend debe tolerar respuestas no JSON y esperas de hasta ~12 s (interpretar ≤10 s, juegos ≤12 s).
- La animación de rebote del título va en `.title-wrap`, nunca en `.title`; la rotación del Chao, en un contenedor, no en la imagen (tiene `filter`).

## Contratos entre fases (están detallados en DESIGN.md §12; no romperlos)
- Fase 4b: `#app[data-state]` es el estado lógico (intro, typing, thinking, results, no-results, error, detail); el layout compacto se activa con `#app[data-layout="compact"]` (no con data-state) y **persiste** al volver a escribir (decidido, DESIGN §14). Rebote reducido del título y Chao pequeño cuelgan de ese layout.
- Panel de detalle (fase 6): al abrirse pone `data-holo-paused` en `<html>` para parar el fondo; al cerrarse lo quita.
- Fondo WebGL: fotograma inicial fijo a los 9500 ms (también el de reduced-motion). `window.__holoSeek(ms)` y `?t=` existen solo en dev y sirven para capturas deterministas. Los tokens con `light-dark()` no se leen con `getPropertyValue` (devuelve texto): usar un elemento sonda.
- API: `/api/interpret` devuelve `{ok, summary, genres, tags, platforms, years?, examples}` u `{ok:false, reason:'off_topic'}`; `/api/games` acepta genres, tags, platforms, dates y examples (repetido, ≤5; al menos uno de genres/tags/platforms/examples) y cobra 1 + examples unidades del limiter; `/api/game?id=` acepta id numérico o slug (para `?game=<slug>`). El cliente debe tolerar 429 (`Retry-After`), 413/415/403 (son bugs), 503 y cuerpos no JSON.

## Notas operativas
- La carpeta **no es un repo git**. No hacer `git init` ni commits salvo que el usuario lo pida.
- Puertos para no chocar entre agentes: 5173 principal/tester de fases visuales, 5174 design-reviewer, 5175 backend, 5176 tester de backend. Parar siempre el servidor y confirmar el puerto libre.
- Scripts desechables (capturas, mediciones, prototipos) van al scratchpad de la sesión, no al proyecto. `verify-shots/` está en `.gitignore`.
- `personaje.jpg` (raíz) es el original del Chao; el recorte final está en `public/character/chao.webp` (crédito obligatorio en el pie: "Chao © SEGA — fan project, not affiliated").
- El comando `/plugin` no está disponible, pero `claude plugin install/list/details` por CLI sí. **`claude-mem@thedotmack` v13.29.0 instalado el 2026-10-04 (scope user, enabled)**: 8 hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop...), 22 skills, MCP `mcp-search`, ~2.2k tokens siempre activos. Captura sesiones (puede incluir las keys de Gemini/RAWG que pasaron por el chat). Se activa al reiniciar la sesión; no se revisó su código antes de instalarlo.
- Vocabulario y tablas: `api/_lib/vocab.ts` (17 géneros, 83 tags, 8 plataformas con ids hijos de RAWG, verificados en vivo el 2026-10-03; `npm run verify:vocab`). El resumen se dice en voz del Chao solo si mide ≤26 caracteres (DESIGN §14.13).

## Despliegue (2026-10-05)
- Repo público: https://github.com/Gabynose/game-feelings (rama main). Deploy previsto: Vercel Hobby (variables `GEMINI_API_KEY` y `RAWG_API_KEY` en su panel). Las keys nunca están en el repo (`.env.local` y `docs/04-CONTENIDO.MD` ignorados). Key de Gemini renovada el 2026-10-05; la de RAWG sigue siendo la antigua por decisión del usuario.
- `vercel.json` lleva la CSP. Comprobada sin violaciones sobre el build (resultados + detalle). **Si se cambia el `<script>` inline de index.html hay que recalcular su hash sha256 en `script-src`.** `media-src https:` porque los trailers de RAWG pueden venir de varios hosts.
- Cambios de UI de 2026-10-05 (reset con el Chao, cajas sin disco/franja) validados por construcción; DESIGN §18. Sin comprobar hasta un deploy real: `maxDuration` junto a handlers GET/POST, 405/HEAD/OPTIONS. `api/_lib` no se despliega como función (Vercel ignora los prefijos `_`).
