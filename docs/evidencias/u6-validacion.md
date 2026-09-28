---
id: laboratorio-evidencia-upgrade-6
titulo: Evidencia — Upgrade 6 Cobertura y ruptura de línea de visión
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia — Upgrade 6

- Fecha: 28 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Base: H0–H6, U1, U2 y U3 consolidados (145 tests en 13 archivos; U1/U2/U3 cerrados).

## 1. Requisito

> El jugador que rompe la visión por oclusión (`reason=occluded`) provoca que la percepción deje de confirmarlo, la memoria no se actualice y, al vencer `VISION_LOST_GRACE_MS`, la guardia transicione `PURSUE → INVESTIGATE (LKP) → SEARCH`; no lo persigue de nuevo hasta que vuelva a ser `visible`.

La cobertura se deriva únicamente de datos reales; sin segunda FSM ni estados de gameplay nuevos.

## 2. Comportamiento implementado

| Situación | Resultado |
|---|---|
| Jugador rompe LOS por oclusión durante la persecución | percepción deja de confirmar (`visible=false`, `reason=occluded`); memoria/LKP congelado |
| Dentro de la gracia (`< VISION_LOST_GRACE_MS`) | la guardia sigue `PURSUE` |
| Gracia vencida (`>= VISION_LOST_GRACE_MS`) | `PURSUE → INVESTIGATE` (`vision-lost`), destino = LKP |
| Llegada al LKP sin percepción | `INVESTIGATE → SEARCH` (`investigate-arrived` + `search-started`) |
| El jugador permanece ocluido | la guardia no vuelve a `PURSUE` |
| El jugador vuelve a ser `visible` | `vision-acquired` → `PURSUE` (LKP actualizado) |

Invariante: `confirmsSight(reason)` es `true` únicamente para `reason === "visible"`.

## 3. Archivos

| Archivo | Cambio |
|---|---|
| `src/game/visual/coverState.ts` | Nuevo: `confirmsSight`, `resolveCover` (`visible`/`cubierto`/`expuesto`), `coverFlash` (triángulo acotado 350 ms); Phaser-free |
| `src/game/scenes/GameScene.ts` | Aditivo/presentación: derivación de cobertura por fotograma (datos reales), línea HUD `cobertura`, marco de ruptura 350 ms en `guardFxGraphics` (gating por flanco ascendente `coverStartMs`) |
| `tests/game/visual/coverState.test.ts` | Nuevo: 15 pruebas (A–D) |
| `tests/application/guardSimulation.test.ts` | Aditivo: 1 test integrado del ciclo de cobertura (a-demo) |
| `docs/u6-cobertura-los-espec.md` | Especificación del upgrade (nuevo) |
| `docs/evidencias/u6-validacion.md` | Este registro (nuevo) |
| `docs/hitos.md`, `README.md`, `docs/arquitectura.md` | Registro del hito U6, estado y nota del contrato de representación |

## 4. Tests

161 pruebas aprobadas en 14 archivos (145 previas + 16 nuevas):

- A. estado de cobertura: `occluded → cubierto`; fuera de rango/cono → `expuesto`; `visible → visible`; visible gana ante cualquier `reason`.
- B. invariante: `confirmsSight` sólo `true` para `"visible"`.
- C. flash: inicio 0, pico 1 al 50 %, fin 0 a los 350 ms (y más allá), 0 antes del inicio, 0 si no está cubierto, triángulo simétrico acotado, rechaza duraciones no positivas.
- D. reaparición: vuelve a `visible` sin persistir el estado cubierto; el flash se limpia al re-adquirir.
- E (integración `guardSimulation.test.ts`): `PURSUE → ruptura por oclusión → gracia → vision-lost → INVESTIGATE(LKP) → llegada → SEARCH → sin re-persecución mientras cubierto → reavistamiento → PURSUE`, usando `updatePerceptionSimulation` real (primera vista visible, luego `reason=occluded` por un muro) y memoria real; verifica el respeto de la gracia (100 ms dentro / 200 ms fuera) y que la memoria no recibe posición nueva durante la oclusión.

## 5. `npm run validate`

Typecheck sin errores · 161/161 tests · build OK. Única advertencia: la preexistente del chunk de Phaser (1513,37 → 1514,61 kB, +1,2 kB por el código de cobertura).

## 6. Revisión del diff

`git status --short` y `git diff --stat` confirman:

- `M src/game/scenes/GameScene.ts` (sólo presentación aditiva).
- `M tests/application/guardSimulation.test.ts` (sólo aditivo: imports + describe nuevo).
- `?? src/game/visual/coverState.ts` (nuevo).
- `?? tests/game/visual/coverState.test.ts` (nuevo).
- Este registro de evidencia + `docs/u6-cobertura-los-espec.md` + actualizaciones de `docs/hitos.md`, `README.md` y `docs/arquitectura.md`.

Sin cambios en `guardState.ts`, `guardSimulation.ts`, `perception.ts`, `perceptionSimulation.ts`, `memory.ts`, `search.ts`, `pathFollower.ts`, mapa, patrulla, U1, U2, U3, dependencias, `package.json`, `tsconfig.json` ni `vite.config.ts`.

## 7. Riesgos

- La oclusión y el destello en vivo no tienen prueba de navegador; el contrato puro que los genera sí está cubierto por tests (misma convención que U2/U3).
- El marco de cobertura comparte `guardFxGraphics` (depth 4) con U3; la colisión visual es el objetivo (onda U3 + marco U6) y se resuelve sólo en presentación, sin gameplay.
- El test integrado usa una escena sintética de 6×5 (un muro en `(3,0)`) para controlar la oclusión; el comportamiento FSM demostrado es el mismo del mapa del laboratorio (no se modificó `LAB_MAP`).

## 8. Confirmación de gameplay intacto

No se modificaron: FSM/`resolveTransition`, causas, `VISION_LOST_GRACE_MS`, percepción/LOS, memoria/LKP, navegación/A\*, `pathFollower`, mapa, puntos de patrulla, `PATROL_PAUSE_MS`, U1, U2, U3, velocidades, rango de visión ni FOV. Los 145 tests previos pasan sin cambios.