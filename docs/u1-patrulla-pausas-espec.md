---
id: laboratorio-upgrade-1-patrulla-pausas
titulo: Upgrade 1 — Patrulla con pausas y mirada direccional
tipo: especificacion
audiencia: estudiante
acceso: publico
version: 1
---

# Upgrade 1 — Patrulla con pausas y mirada direccional

## 1. Intención

Dar ritmo perceptible a la patrulla: cuando el guardia llega a un punto de patrulla se detiene durante un instante breve y orienta la mirada hacia el siguiente punto del recorrido antes de continuar. Es un upgrade de presentación/ritmo: no modifica la lógica de decisión de la IA ni la navegación.

## 2. Comportamiento antes

Al llegar a un punto de patrulla, `routePatrol` registra `arrived`, avanza `patrolIndex`, emite `patrol-point-selected` y calcula de inmediato la ruta al siguiente punto (`route-replanned`). El guardia no se detiene: enlaza un tramo con el siguiente sin pausa.

## 3. Comportamiento después

Al llegar a un punto de patrulla (misma señal `arrived` de H4):

1. se emiten `arrived` y `patrol-point-selected` (el ciclo avanza igual que H4);
2. si la pausa está configurada, no se calcula la ruta: `route` queda en `null`, por lo que la escena no tiene waypoints y el guardia permanece quieto en el punto;
3. transcurridos `PATROL_PAUSE_MS` desde la llegada, se calcula la ruta al punto seleccionado (`route-replanned`) y continúa el recorrido;
4. durante la pausa `GuardFrameOutput` expone `patrolPaused = true` y `patrolGazeCell` = siguiente punto de patrulla; la escena hace **barrer la mirada** del guardia (`guardFacing`) en un giro completo de 360° durante la duración de la pausa, comenzando y terminando apuntando al siguiente punto. Como el cono de visión existente sigue a `guardFacing`, el barrido mira de verdad alrededor: el guardia puede detectar al jugador mientras barre.

## 4. Duración de la pausa

`export const PATROL_PAUSE_MS = 700` en `src/application/simulation/guardSimulation.ts`, junto a las demás constantes de timing (`REPLAN_INTERVAL_MS`, `SEARCH_DURATION_MS`). Determinista, sin aleatoriedad, breve (0,7 s) para no frenar el recorrido. La simulación pura acepta `createGuardSimulation(map, patrolPoints, start, { patrolPauseMs })`; el default es `0` (comportamiento H4 exacto) y la escena la activa con la constante.

## 5. Regla de orientación

Durante la pausa la mirada realiza un **barrido de 360°** que comienza y termina apuntando al **siguiente punto de patrulla del ciclo** (el goal ya seleccionado al llegar). La escena calcula el ángulo de barrido con `elapsed / PATROL_PAUSE_MS` sobre el tiempo acumulado de la pausa (determinista y sin depender de FPS) y fija en `guardFacing` la dirección resultante: `ángulo base → 360° → vuelta al siguiente punto`, justo cuando se reanuda la marcha. Se reutiliza la noción de orientación existente (`guardFacing`, que ya alimenta percepción y dibujo del cono); no se introduce un sistema de orientación paralelo.

## 6. Cómo se evita modificar la FSM

- La pausa vive en la capa de coordinación (`routePatrol` en `guardSimulation.ts`), como ya ocurre con el plan de búsqueda o el retorno ordenado. No hay un sexto estado.
- La resolución de transiciones (`resolveTransition`) se mantiene intacta y corre **antes** del rutado, por lo que una observación válida durante la pausa dispara `PURSUE`/`INVESTIGATE` y la limpieza del temporizador en el bloque de transición aborta la pausa. No se agregan reglas de prioridad.
- No cambia percepción, memoria, `SEARCH_*`, `RETURN`, A*, `pathFollower`, mapa ni `PATROL_POINTS`.

## 7. Tests agregados

Ver `tests/application/guardSimulation.test.ts`, bloque "guard patrol pause during Upgrade 1":

- llegada inicia la pausa sin avanzar al siguiente tramo;
- espera menor a la duración mantiene la pausa (sin ruta, sin eventos);
- fin de la duración reanuda el tramo y conserva el ciclo (P1 → pausa → P2, P2 → pausa → P3);
- reanudación por tiempo acumulado independiente de la cadencia de frames;
- una transición de visión válida interrumpe la pausa (PATROL + visión → PURSUE);
- sin configuración, se conserva exactamente el comportamiento H4 (regresión).

## 8. Resultado de `npm run validate`

Typecheck OK, 112 pruebas aprobadas en 11 archivos, build OK. Única advertencia: la ya documentada del chunk de Phaser (creció ~0,6 kB por el código nuevo; no sustancial).

## 9. Revisión del diff

Ver `docs/evidencias/u1-validacion.md`.

## 10. Riesgos o limitaciones

- El barrido de la mirada rota el cono de visión existente durante la pausa (presentación): durante esos 700 ms el guardia puede detectar al jugador desde cualquier dirección alrededor del punto. Es la consecuencia aceptada de "mirar alrededor" sin un sistema de orientación paralelo; no cambia reglas ni parámetros. Decidido en consulta: cono barre con la mirada.
- La simulación pura no valida visualmente la escena; el barrido se cubre por tipos y por contrato del output (`patrolPaused`, `patrolGazeCell`), no por una prueba de navegador.
- No hay HUD nuevo para la pausa (respetando "no agregar funcionalidades de debug no solicitadas"); el ritmo se percibe por la detención, el barrido y la reanudación.