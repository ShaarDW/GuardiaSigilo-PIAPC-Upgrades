---
id: laboratorio-evidencia-upgrade-8
titulo: Evidencia — Upgrade 8 Medidor de alerta y estados del nivel
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia — Upgrade 8

- Fecha: 28 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Base: H0–H6, U1, U2, U3, U6 consolidados (161 tests en 14 archivos; U6 cerrado con gate UPGRADE 6 — COMPLETADO).

## 1. Requisito

> El jugador puede observar en todo momento un nivel de alerta (0–100) derivado exclusivamente del estado real de la FSM y de la visión, que aumenta durante situaciones de peligro (persecución, investigación, búsqueda) y disminuye al disolverse la amenaza (retorno, patrulla), sin alterar las reglas de la IA.

El medidor es representación derivada; no es una segunda FSM y no se modifica ninguna regla de decisión.

## 2. Comportamiento implementado

| Situación (real) | Alerta |
|---|---|
| `patrol` | desciende hacia 0 (`FALL_RATE_PER_MS`) |
| `return` | se asienta en 40 (disolución) |
| `investigate` (incl. ruptura/cobertura U6) | asciende/desciende hacia 70 |
| `search` (post-oclusión) | asciende hacia 80 → banda `critico` |
| `pursue` (incl. gracia 200 ms) | asciende hacia 100 (`RISE_RATE_PER_MS`) |
| `visionVisible` | fuerza 100 (defensivo, coherente con la FSM) |
| Vuelta a `patrol` | 100→0 en 1250 ms; bandas `<25` `calma` · `<50` `sospecha` · `<80` `alerta` · `≥80` `critico` |

## 3. Archivos

| Archivo | Cambio |
|---|---|
| `src/game/visual/alertMeter.ts` | Nuevo: `alertTarget`, `resolveAlert` (lineal con clamp, partición-independiente, tolerante a rebobinar), `alertBand`, `ALERT_MAX`, `RISE_RATE_PER_MS`, `FALL_RATE_PER_MS`; Phaser-free |
| `src/game/scenes/GameScene.ts` | Aditivo/presentación: `alertMeterState` (reducer puro por fotograma con `outcome.state` + `frame.vision.visible`), `alertMeterGraphics` (profundidad 10), `alertMeterLabel`, `drawAlertMeter(time)` (relleno proporcional, bandas de color, pulso en `critico`); reset en `create()` |
| `tests/game/visual/alertMeter.test.ts` | Nuevo: 26 pruebas (A–F + bandas) |
| `docs/u8-alerta-espec.md` | Especificación del upgrade (nuevo) |
| `docs/evidencias/u8-validacion.md` | Este registro (nuevo) |
| `docs/hitos.md`, `README.md`, `docs/arquitectura.md` | Registro del hito U8, estado y nota del contrato de representación |

## 4. Tests

187 pruebas aprobadas en 15 archivos (161 previas + 26 nuevas en `alertMeter.test.ts`):

- base: objetivos por estado (patrol 0, return 40, investigate 70, search 80, pursue 100) y override por visión.
- A. calma: inicia en 0, se mantiene en 0 patrullando, decae a 0 con amenaza disuelta.
- B. peligro: `pursue` 200 ms → 50 y 400 ms → 100; investigación → 70; búsqueda → 80; visión activa mantiene el ascenso.
- C. máximo: clamp a 100 ante dt arbitrario, persecución sostenida y persistencia tras alcanzarlo.
- D. recuperación: 100→0 en 1250 ms (250 ms → 80), asentamiento en `return` 40 y sostenimiento, sin caer bajo 0.
- E. determinismo: mismos inputs/`timeMs` → mismo resultado; partición-independiente (4×100 = 1×400; 5×20 = 1×100); tolerancia a rebobinar el reloj.
- F. U6: `investigate` post-ruptura mantiene banda `alerta`; `search` alcanza `critico`; el cálculo ignora la cobertura directamente (sólo estado + visión).
- bandas: límites exactos `calma/sospecha/alerta/critico` (25, 50, 80).

## 5. `npm run validate`

Typecheck sin errores · 187/187 tests · build OK. Única advertencia: la preexistente del chunk de Phaser (1514,61 → 1516,33 kB, +1,7 kB por el módulo de alerta).

## 6. Revisión del diff

`git status --short` y `git diff --stat` confirman:

- `M src/game/scenes/GameScene.ts` (+76, sólo presentación aditiva).
- `?? src/game/visual/alertMeter.ts` (nuevo).
- `?? tests/game/visual/alertMeter.test.ts` (nuevo).
- Este registro de evidencia + `docs/u8-alerta-espec.md` + actualizaciones de `docs/hitos.md`, `README.md` y `docs/arquitectura.md`.

Sin cambios en `guardState.ts`, `guardSimulation.ts`, `perception.ts`, `perceptionSimulation.ts`, `memory.ts`, `search.ts`, `pathFollower.ts`, `labLevel.ts` (mapa/patrulla), `coverState.ts`, `visionFeedback.ts`, `guardPresentation.ts`, `guardFxGraphics`, U1, U2, U3, U6, dependencias, `package.json`, `tsconfig.json` ni `vite.config.ts`.

## 7. Riesgos

- La barra en vivo no tiene prueba de navegador; el contrato puro que la genera sí está cubierto por tests (misma convención que U2/U3/U6).
- Confusión de bandas con estados FSM: mitiga el vocabulario de peligro (`calma/sospecha/alerta/critico`, no `PATRULLANDO/BUSCANDO`) y la barra es un elemento visual distinto de los anillos U3.
- La barra comparte profundidad 10 con los HUD existentes; se ubica centrada arriba sin solapar `navigationHud` ni `telemetryHud`.

## 8. Confirmación de gameplay intacto

No se modificaron: FSM/`resolveTransition`, causas, `VISION_LOST_GRACE_MS`, percepción/LOS, memoria/LKP, navegación/A\*, `pathFollower`, mapa, puntos de patrulla, `PATROL_PAUSE_MS`, U1, U2, U3, U6, velocidades, rango de visión, FOV, dependencias ni configuración. Los 161 tests previos pasan sin cambios.