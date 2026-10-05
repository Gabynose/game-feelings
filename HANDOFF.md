# Handoff

> Generated: 2026-10-05
> Project: Game Feelings (carpeta no es repo git)
> Session summary: Se cerró la fase 6 (detalle + ficha técnica) y el pulido final (Chao tipea el globo con blips); todo validado por el usuario. El proyecto está terminado salvo el deploy, que el usuario dejó para otro momento.

## Goal

No hay tarea abierta. Estado final: fases 1-6 y pulido de tipeo+blips **validados por el usuario**. Lo único que queda (cuando el usuario lo pida) es la fase 7: deploy a Vercel y pulidos menores. Antes de actuar leer `CLAUDE.md` (reglas: español, directo, verificar yo en el navegador antes de decir "hecho", parar al final de cada fase, preguntar antes de dependencias/cuentas/deploy/cambio de alcance).

## Current State

**Working (verificado):**
- Fases 1-6: andamiaje, fondo WebGL, backend `api/`, narrador Chao, fila de juegos, panel de detalle con `?game=<slug>`, historial y trailer.
- `/api/game` devuelve name, description, released, trailer, screenshots, `platforms` (≤12), `genres` (≤5), `rating` (0-5 o null), `metacritic` (1-100 o null). Ficha técnica en el panel (DESIGN §16.14); plataformas ordenadas por familia.
- Pulido: el Chao tipea su globo (32 ms/letra, pausas en `. ? ! …` y `, ; :`, tope 2200 ms) con blips Web Audio (cuadrada 784 Hz base, 45 ms, vol. 0.05); intro muda hasta el primer gesto; botón de mute junto al de tema (`localStorage 'muted'`); reduced-motion = texto instantáneo, sin blips, botón oculto. DESIGN §17.
- Último estado: build limpio, 769 tests verdes, verify completo 665 OK (los únicos FAIL fueron un flake de red de RAWG y un check mal calibrado ya corregido).
- `CLAUDE.md` ya refleja todo (decisión "sin voz" revertida a "voz = blips, sin TTS").

**Broken / pendiente:** nada roto. Un proceso vite huérfano (PID 31036) escucha en `[::1]:5173`; no es de esta sesión y el sistema bloqueó mi `taskkill`. **El usuario debe cerrarlo** (o pedirlo explícitamente).

## Files in Play

| File | Why It Matters |
|------|---------------|
| `CLAUDE.md` | Reglas del proyecto y bloque "Estado" (actualizado) |
| `DESIGN.md` §16, §17 | Diseño del detalle/ficha y del tipeo+blips+mute |
| `src/sections/screen.ts` | Globo: tipeo, `finish()`, `say()`, `aria-live` en `.bubble__spoken` |
| `src/lib/type.ts`, `src/lib/blip.ts` | Calendario de tipeo puro; audio Web Audio, unlock en pointerdown/pointerup/keydown |
| `src/sections/detail.ts`, `src/lib/api.ts` | Panel y `getGame`; `specRows`, `sortPlatforms`, `score` |
| `api/game.ts`, `api/_lib/rawg.ts` | Contrato ampliado de `/api/game` |
| `scripts/verify-typing.mjs`, `verify.mjs`, `verify-screen.mjs`, `verify-results.mjs` | Verify; `npm run verify` completo ~25 min, SOLO |

## What Has Been Tried (and Why It Failed)

### `taskkill` del vite huérfano (PID 31036)
- **What:** intenté pararlo para dejar libre 5173.
- **Why it failed:** el clasificador de permisos lo denegó (interferir con procesos). No reintentar por otra vía; lo decide el usuario.

### Lanzar verify en paralelo (sesión previa)
- **Why it failed:** se cuelga; verify siempre solo. Los agentes usan puertos 5174-5176, nunca 5173.

### Bugs reales encontrados y ya corregidos
- `detail.ts`: `mainMedia` no se reasignaba al cerrar, la Fig. 1 desaparecía desde la 2.ª apertura.
- `blip.ts`: en táctil `pointerdown` no activa el AudioContext; ahora escucha pointerup y quita oyentes solo con `ctx.state==='running'`.

## Current Best Theory

El proyecto está completo para el alcance acordado. Si el usuario pide seguir, el camino es la fase 7 en este orden: (1) pulidos sin decisión suya, (2) preguntarle por deploy/cuentas/keys, (3) deploy.

## Next Steps

1. Leer `CLAUDE.md`. No hacer nada hasta que el usuario pida algo.
2. Si pide la fase 7: pulidos menores: recalcular `--shelf-block` para pantallas bajas (375x667, 320x568, 1280x600 cortan la fila PS2), arreglo CSS de franja de contenido fuera del marco al hacer scroll (DESIGN §16.15), separación de párrafos en la descripción del detalle (RAWG usa saltos simples, `pre-line` no aplica `--space-3`), borrar código muerto `voiceLevel`/`VOICE_*` en `chao.ts` (+ checks en `verify.mjs` ~722-865, 1112, 1395 y "Talk off" del lab).
3. Deploy (PREGUNTAR antes): CSP con `media-src` para trailers (Steam/RAWG) e `img-src media.rawg.io`; regenerar `GEMINI_API_KEY` y `RAWG_API_KEY` (quedaron escritas en el chat); verificar en deploy real `maxDuration` junto a handlers GET/POST, que `api/_lib` no se despliegue como función, y 405/HEAD/OPTIONS.
4. Cada vez: parar servidores y confirmar puertos libres.

## Key Constraints

- Usuario: Gabriel; español, directo. Sin emojis en la UI. Preguntar antes de dependencias, cuentas, deploy, cambio de alcance, assets con copyright nuevos.
- Keys solo en `.env.local`, nunca impresas. Carpeta no es repo git: no `git init`.
- Flujo por fase: ui-designer -> engineers -> tester -> design-reviewer + code-reviewer -> engineer corrige -> yo verifico en navegador -> usuario valida. Modelos fijados: ui-designer/reviewers Opus, engineers/tester Sonnet. Agentes ya creados reanudables con SendMessage; si no, lanzar nuevos con `subagent_type`.
- El audio no se puede oír en headless: se verifica espiando `AudioContext`/`createOscillator`; el sonido lo valida el usuario de oído (ya lo hizo).
- Plan archivado: `C:\Users\GabrielBoggia\.claude\plans\dejemos-el-deploy-para-immutable-stardust.md`.

## Memory Pointers

No se consultó claude-mem. Búsquedas útiles: `search` "Game Feelings fase 6 detalle ficha", "Game Feelings tipeo blips".
