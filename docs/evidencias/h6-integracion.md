---
id: laboratorio-evidencia-integracion-h6
titulo: Evidencia de integración final H6
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia de integración final H6

- Fecha: 27 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Versión evaluada: trabajo acumulado sobre los commits H4 y los cambios documentales H5/H6 (sin commits nuevos).

## 1. Línea de reconstrucción

| Etapa | Estado de referencia | Qué se implementó | Cómo se validó |
|---|---|---|---|
| Baseline (H0–H3) | `adc5d17` | Escenario Phaser, navegación BFS/A*, percepción con oclusión y sonido, memoria/LKP, PathFollower | 39 pruebas (6 archivos) en la validación H3 |
| H4.1–H4.2 | `d44ac9a` | PATROL cíclico con salto de puntos inaccesibles; INVESTIGATE hacia el LKP con retarget por sonido | Pruebas H4.1/H4.2 en `tests/application/guardSimulation.test.ts` y `tests/behavior/guardState.test.ts` |
| H4.3 | `3d04ca9` | PURSUE con gracia de visión (200 ms) y replanificación acotada (250 ms) | Pruebas H4.3 |
| H4.4 | `8a7ed25` | SEARCH con plan finito (radio 3, máximo 16, presupuesto 5000 ms) | Pruebas H4.4 y `tests/behavior/searchPlan.test.ts` |
| H4.5 | `1c4eb18` | RETURN comprometido con orden Manhattan y alternancia ante inaccesible | Pruebas H4.5 |
| H5 | Working tree | Comparación FSM vs BT vs Utility vs GOAP, diagrama y trace | `docs/h5-comparacion-maquina-estados.md`, `docs/evidencias/h5-validacion.md`, test de traza |
| H6 | Este documento | Integración, auditoría y cierre de evidencia | `npm run validate` + tabla de escenarios |

## 2. Validación funcional final

| Criterio | Método | Resultado |
|---|---|---|
| Validación completa | `npm run validate` | Aprobado |
| Suite de pruebas | `npm run test:run` | 106 pruebas aprobadas en 11 archivos |
| Typecheck | `npm run typecheck` | Sin errores |
| Build | `npm run build` | 24 módulos en `dist/` |

Warnings: persiste únicamente la advertencia preexistente del tamaño del chunk de Phaser (1 508 kB minificados, hash `index-CcEDTCsC.js`). No apareció ningún warning nuevo; el hash del chunk es idéntico a la corrida H5.

## 3. Escenarios integrados (evidencia en tests)

| Escenario | Cobertura |
|---|---|
| PATROL → punto siguiente → ciclo continuo | `patrol.test.ts` ("reaches every consecutive pair of the cycle"), `guardSimulation.test.ts` H4.1 ("advances", "wraps the cycle back") |
| PATROL → INVESTIGATE → LKP | H4.2 ("moves to the remembered sound cell when a sound is heard") |
| PATROL/INVESTIGATE → PURSUE | `guardState.test.ts` H4.3 ("beating sound", "leaves investigate toward pursue") |
| PURSUE → INVESTIGATE conservando LKP | H4.3 ("moves to investigate after the grace period, preserving the last known cell") |
| INVESTIGATE → SEARCH (radio ≤ 3, max 16 waypoints, max 5000 ms) | `searchPlan.test.ts` ("within the radius of 3", "never exceeds the 16 waypoint cap"), H4.4 ("ends the search when the time budget is exceeded") |
| SEARCH → RETURN → punto de patrulla → PATROL | H4.5 ("resumes the patrol cycle after returning to the nearest patrol point") |
| Visión interrumpe SEARCH | H4.4 ("leaves search toward pursue as soon as the player becomes visible") |
| Visión interrumpe RETURN | H4.5 ("breaks out of the return toward pursue when the player becomes visible") |
| Sonido no interrumpe RETURN | `guardState.test.ts` H4.5 ("commits to return: sound does not interrupt it") |
| Visión tiene prioridad sobre sonido | `guardState.test.ts` H4.3 ("...beating sound"), `memory.test.ts`/`perceptionSimulation.test.ts` (priorización de visión) |
| Secuencia representativa completa | H5 trace: PATROL→INVESTIGATE→PURSUE→INVESTIGATE→SEARCH→RETURN→PATROL |

## 4. Métricas y telemetría

- `routeComputations`: expuesta en `GuardFrameOutput` y en el HUD ("rutas calculadas"); auditada por H4.3 ("does not recompute on every frame", "recomputes only when the replan interval elapses", "re-plans immediately when the player moves to a new cell").
- Transiciones `from`/`to`/`cause`/`target` con `timeMs`: `src/domain/telemetry/transitionLog.ts`; cola de 10 (`LOG_TAIL_LIMIT`); verificada por `tests/domain/telemetry/transitionLog.test.ts`.
- Eventos de SEARCH: `search-started`, `search-waypoint`, `search-exhausted`, `search-unfeasible` (H4.4).
- Eventos de RETURN: `return-started`, `returned-to-patrol`, `alternate-patrol-point` (H4.5).
- Ausencia de replanning por frame: `routeComputations` permanece en 1 durante 10 frames consecutivos hacia un objetivo estático (H4.3).
- Persistencia: la telemetría vive en memoria (array en `TransitionLog`); no hay `localStorage`, archivos ni servicios externos. La memoria perceptual es pura y sin limpieza (`src/domain/perception/memory.ts`).

## 5. Revisión de riesgos

| Riesgo | Evidencia | Estado |
|---|---|---|
| Rutas inaccesibles | H4.1 "skips an unreachable patrol point explicitly"; H4.2 "abandons an unreachable investigation target"; `search.test.ts` "reports an unreachable goal explicitly" | Mitigado (salto explícito o recuperación) |
| Objetivos bloqueados | `searchPlan.test.ts` "empty plan"; H4.4 "unfeasible"; `guardState.ts` `invalid-goal`/`invalid-start` | Mitigado |
| Replanning excesivo | H4.3 intervalos/centro de celda; `routeComputations` constante | Mitigado |
| Loops de comportamiento | Patrulla y búsqueda acotadas por lista/presupuesto; RETURN por lista de candidatos + `stalledGoalKey` | Mitigado por construcción; no existe prueba de fuzzing de frames infinitos (riesgo residual) |
| Pérdida del LKP | H4.3 "preserving the last known cell"; H4.4 "keeps the LKP" | Mitigado (memoria no se borra) |
| Llegada prematura | H4.1 "does not double-advance"; gate de RETURN `arrived && route !== null` | Mitigado |
| Estados sin salida | Ninguno del grafo real: todo estado sale por visión, llegada, agotamiento o inaccesible. Caso límite aceptado: si todos los candidatos de retorno fueran inaccesibles, el guardia queda detenido en RETURN (freno por `stalledGoalKey`); imposible en el mapa del laboratorio (todos los puntos de patrulla son alcanzables, ver `patrol.test.ts`) | Mitigado en el mapa real; caso límite documentado |
| Candidatos de retorno inaccesibles | H4.5 "skips an unreachable patrol point and alternates" | Mitigado |
| Inconsistencias documentación ↔ código | Tabla de la sección 6 | Sin discrepancias mayores; una menor documentada |

## 6. Auditoría documentación ↔ código

| Ítem | Código (fuente de verdad) | Documentación | Consistente |
|---|---|---|---|
| Estados | `patrol`, `investigate`, `pursue`, `search`, `return` (`guardState.ts`) | `arquitectura.md`, `h5-comparacion-maquina-estados.md` | Sí |
| Causas | Union `GuardCause` (19; 18 emitidas) | Documentadas; `investigate-target` declarada sin uso | Sí (reportada explícitamente) |
| `PATROL_POINTS` | `(27,17),(2,17),(2,4),(27,4)` (`labLevel.ts`) | H5 | Sí |
| `SEARCH_RADIUS_CELLS` | 3 | H5 | Sí |
| `SEARCH_WAYPOINTS_MAX` | 16 | H5 | Sí |
| `SEARCH_DURATION_MS` | 5000 | H5 | Sí |
| `REPLAN_INTERVAL_MS` | 250 | H5 | Sí |
| `VISION_LOST_GRACE_MS` | 200 | H5 | Sí |
| Comportamiento LKP | Memoria nunca se borra; visión prioriza en empate | H3, H4, H5 | Sí |
| Comportamiento RETURN | Candidatos por Manhattan; alternancia; `stalledGoalKey` | H5 | Sí |
| Métricas | `routeComputations` en output/HUD | H3 (métricas A*), H4.3 (frecuencia de replan) | Sí |
| Telemetría | `TransitionEvent {timeMs, from, to, cause, target}`, cola 10 | `arquitectura.md`, H5 | Sí |

Discrepancia menor documentada: el test `guardState.test.ts` "keeps the not-yet-implemented states inert" conserva un título de H4.2 obsoleto (RETURN ya está implementado). La aserción (sin percepción y sin llegada, RETURN no transita) sigue siendo correcta y la suite es verde. Se documenta sin modificar código, dejando una corrección de nomenclatura como posible intervención futura.

## 7. Diff y control de alcance

- Cambios H6: `docs/hitos.md` (H6 → Completado), `README.md` (estado y enlace), nuevo `docs/evidencias/h6-integracion.md`.
- Cambios presentes en el working tree desde el último commit: documentación H5/H6 y el test de traza H5 en `tests/application/guardSimulation.test.ts`.
- No se modificó `src/`. No hay dependencias nuevas, ni red, ni persistencia, ni commits, ni push, ni funcionalidades ajenas a H6.
- El comportamiento H4.1–H4.5 no fue tocado por H6.

## 8. Pendientes y cierre

- Pendiente (fuera de H6): commiteo de los cambios H5/H6 y la corrección opcional del título del test obsoleto.
- Las upgrades comienzan después del cierre de H6, como intervenciones independientes con su propio spec, plan, build, tests y evidencia.

Confirmación explícita: H6 NO implementó upgrades. No se agregaron mecánicas, IA, capacidades, mejoras visuales, comportamientos, balances ni optimizaciones.