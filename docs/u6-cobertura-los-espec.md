---
id: laboratorio-upgrade-6-cobertura-los
titulo: Upgrade 6 — Cobertura y ruptura de línea de visión
tipo: especificacion
audiencia: estudiante
acceso: publico
version: 1
---

# Upgrade 6 — Cobertura y ruptura de línea de visión

## 1. Intención

Convertir la ruptura de línea de visión por oclusión en una **decisión activa de sigilo**, construida sobre la cadena causal que la FSM ya implementa: el jugador rompe LOS por oclusión (un obstáculo lo cubre), la percepción deja de confirmarlo, la memoria no recibe una nueva posición visual, y al vencer la gracia la guardia se compromete al LKP (`PURSUE → INVESTIGATE → SEARCH`), no volviendo a perseguir hasta que el jugador vuelve a ser visible.

La cobertura se deriva **únicamente de datos reales** (`{ visible, reason }` de percepción), sin modificar FSM, percepción, memoria ni navegación.

## 2. Requisito (frase verificable)

> El jugador que rompe la visión por oclusión (`reason=occluded`) provoca que la percepción deje de confirmarlo, la memoria no se actualice y, al vencer `VISION_LOST_GRACE_MS`, la guardia transicione `PURSUE → INVESTIGATE (LKP) → SEARCH`; no lo persigue de nuevo hasta que vuelva a ser `visible`.

## 3. Comportamiento

| Situación | Estado FSM | Percepción | Memoria/LKP | Resultado |
|---|---|---|---|---|
| Jugador visible en rango y cono | PATROL/INVESTIGATE/SEARCH/RETURN | `visible=true`, `reason=visible` | se actualiza a la posición actual | `vision-acquired` → `PURSUE` |
| Jugador se cubre (LOS rota por oclusión) | PURSUE | `visible=false`, `reason=occluded` | **no** se actualiza; LKP congelado | se respeta la gracia de 200 ms |
| Gracia vencida sin confirmación | PURSUE | `visible=false` | LKP intacto | `vision-lost` → `INVESTIGATE` hacia el LKP |
| Guardia llega al LKP sin percepción | INVESTIGATE | `visible=false` | LKP intacto | `investigate-arrived` → `SEARCH` alrededor del LKP |
| El jugador permanece cubierto | SEARCH | `visible=false` | LKP intacto | la búsqueda continúa; no hay re-persecución |
| El jugador vuelve a ser visible | INVESTIGATE/SEARCH/RETURN | `visible=true` | se actualiza de nuevo | `vision-acquired` → `PURSUE` |

El invariante de la mecánica queda codificado por `confirmsSight(reason)`: sólo `reason === "visible"` confirma visión. Una posición ocluida jamás confirma ni actualiza el LKP.

## 4. Fuente de verdad

- Cobertura → `VisionResult.visible` y `VisionResult.reason` (percepción real, `perceptionSimulation.ts`).
- LKP → `PerceptionMemory` real (`memory.ts`), que sólo se actualiza con observaciones válidas.
- Transiciones → FSM real (`guardState.ts`/`guardSimulation.ts`) y telemetría; **no se modifica ninguna regla**.
- Feedback → derivado por una función pura Phaser-free (`src/game/visual/coverState.ts`) e interpretado por `GameScene`.

## 5. Representación (mínima)

`src/game/visual/coverState.ts` (Phaser-free):

- `confirmsSight(reason)`: invariante; `true` únicamente para `"visible"`.
- `resolveCover(visible, reason)`: `"visible" | "cubierto" | "expuesto"` (cubierto = oclusión; expuesto = fuera de rango/cono; visible gana).
- `coverFlash(state, sinceMs, elapsedMs, durationMs=350)`: intensidad determinista del destello (0 → pico 1 → 0, triángulo acotado), frame-driven, sin timers ni listeners.

`GameScene`:
- HUD: línea `cobertura` con `VISIBLE | CUBIERTO | EXPUESTO` derivada del mismo estado calculado en cada fotograma.
- Destello: al **entrar real a `cubierto`** (`coverStartMs` se fija sólo en el flanco ascendente) se dibuja un marco breve de 350 ms en `guardFxGraphics` (depth 4, U3) con `COVER_FRAME_COLOR`; se cancela naturalmente al salir de cobertura (intensidad 0). No bloquea movimiento, no modifica `guardFacing`, no toca la FSM, la percepción ni la memoria.

## 6. Alcance

- **Incluido**: módulo puro de cobertura, indicador HUD, destello de ruptura, tests del contrato puro y test integrado del ciclo real de cobertura.
- **Excluido**: estados FSM nuevos, reglas de transición nuevas, cambios de percepción/LOS, cambios de memoria/LKP, cambios de navegación/A*/pathFollower, mapa, patrulla, dependencias, configuración, U1, U2, U3.
- Si un requisito exigiera modificar FSM/percepción/memoria/navegación, se reporta la contradicción en lugar de ampliar el alcance.

## 7. Compatibilidad

- **FSM/guardState.ts**: sin cambios (`resolveTransition` y `VISION_LOST_GRACE_MS` intactos).
- **Percepción/LOS**: sin cambios; la oclusión real ya produce `reason=occluded`.
- **Memoria**: sin cambios; la no-actualización durante oclusión queda demostrada por el test integrado.
- **Navegación/A*/patrulla/U1**: sin cambios.
- **U2 cono**: intacto; la gracia ya se muestra ámbar y una oclusión nunca produce `detection`.
- **U3 guardia**: intacto; el marco de cobertura comparte `guardFxGraphics` pero es un dibujo adicional acotado (esquinas violeta `0xb9a7ff`, alfa = intensidad), sin interferir con el anillo/notch/scan/streak/onda.

## 8. Validación

```bash
npm run validate
```

Debe quedar `typecheck OK`, `tests OK` y `build OK`; la advertencia preexistente del chunk de Phaser no cuenta como fallo.