---
id: laboratorio-guardia-sigilo-arquitectura
titulo: Arquitectura del laboratorio Guardia de Sigilo
tipo: referencia
audiencia: estudiante
acceso: publico
version: 5
---

# Arquitectura propuesta

## Principio

El dominio no depende de Phaser. Phaser traduce entradas y presenta resultados.

```text
Phaser / navegador
      ↓ adaptadores
aplicación y simulación
      ↓
dominio puro TypeScript
```

## Estructura objetivo

```text
guardia-sigilo/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── public/
├── specs/
├── docs/
├── src/
│   ├── domain/
│   │   ├── navigation/
│   │   ├── perception/
│   │   ├── behavior/
│   │   ├── telemetry/
│   │   └── model/
│   ├── application/
│   │   └── simulation/
│   ├── game/
│   │   ├── scenes/
│   │   ├── adapters/
│   │   └── presentation/
│   └── main.ts
└── tests/
    ├── navigation/
    ├── perception/
    └── behavior/
```

## Reglas de dependencia

- `domain/` no importa Phaser, DOM ni APIs de navegador.
- `application/` coordina casos de uso y depende del dominio.
- `game/` depende de Phaser, aplicación y dominio.
- Presentación no decide comportamiento.
- Tiempo, aleatoriedad y entrada se inyectan o modelan explícitamente.
- Las pruebas de dominio no crean un juego Phaser.

## Contratos principales

### Navegación

La cuadrícula forma un grafo implícito de cuatro vecinos transitables. BFS utiliza una cola y sirve como referencia no informada. A* utiliza costo unitario y distancia Manhattan, admisible para este movimiento cardinal.

Entrada: mapa, inicio y objetivo.

Salida: algoritmo, estado, `path`, `totalCost`, `expandedNodes`, `maximumFrontier` y secuencia `explored`. Los estados de fracaso distinguen inicio inválido, objetivo inválido y objetivo inaccesible.

Un nodo se considera expandido al retirarlo de la frontera, incluido el objetivo. `maximumFrontier` registra la mayor cantidad de nodos pendientes en cualquier paso.

Implementación: `src/domain/navigation/`. La selección para la demostración ocurre en `src/application/simulation/navigationDemo.ts` y Phaser sólo representa el resultado.

### Percepción

Entrada visual: mapa, tamaño de celda, posición, dirección, objetivo, alcance y campo visual. La oclusión recorre todas las celdas atravesadas por la línea y adopta un criterio conservador al tocar esquinas.

Entrada sonora: posición del oyente y evento con origen, radio, instante y duración.

Salida: resultado y causa observable; no modifica directamente el estado de conducta. `src/domain/perception/memory.ts` conserva sólo observaciones finitas provistas por sensores validados y prioriza visión ante eventos simultáneos. `src/application/simulation/perceptionSimulation.ts` coordina sensores, vigencia del sonido y memoria; Phaser sólo adapta tiempo, entrada y representación.

La representación visual del cono (`GameScene.drawPerception`) consume la salida real de percepción y la memoria, sin segunda lógica de detección: `src/game/visual/visionFeedback.ts` expone la función pura `resolveVisionFeedback` (estado `normal`/`detection`/`grace` a partir de `VisionResult.visible`, la antigüedad de la última observación de visión y la constante real `VISION_LOST_GRACE_MS` de `guardState.ts`) y `visionSector(facing, fieldOfViewRadians)` para la geometría del sector con los mismos parámetros `VISION_RANGE` y `FIELD_OF_VIEW`. Durante la gracia (último avistamiento con menos de 200 ms) el cono se muestra ámbar; con detección válida, verde reforzado; en el resto, azul. La oclusión real se comunica por el color reactivo (un objetivo ocluido nunca produce `detection`); no se reimplementa line-of-sight para dibujar.

La cobertura (ruptura de línea de visión por oclusión) es otra capa presentacional derivada, no una fuente de verdad: `src/game/visual/coverState.ts` es una librería Phaser-free que interpreta el `VisibilityReason` real (`confirmsSight(reason)` devuelve `true` sólo para `"visible"`; `resolveCover(visible, reason)` produce `"visible" | "cubierto" | "expuesto"`) y genera el destello breve del marco (`coverFlash`, triángulo acotado de 350 ms, frame-driven). `GameScene` fija `coverStartMs` sólo en el flanco ascendente de `"cubierto"`, muestra la línea `cobertura` en el HUD a partir del mismo estado y dibuja el marco en `guardFxGraphics` (depth 4). No modifica la FSM, la percepción, la memoria ni la navegación: la cadena `PURSUE → INVESTIGATE → SEARCH` comprometida al LKP y la re-persecución sólo por visión real ya las garantiza `guardState.ts`/`guardSimulation.ts`.

El medidor de alerta (U8) también es representación derivada: `src/game/visual/alertMeter.ts` es una librería Phaser-free que reduce `{ state: GuardState, visionVisible }` y `timeMs` a un valor 0–100 con acercamiento lineal al objetivo por situación real (`pursue`/visión → 100, `search` → 80, `investigate` → 70, `return` → 40, `patrol` → 0; `RISE_RATE_PER_MS = 0.25`, `FALL_RATE_PER_MS = 0.08`), partición-independiente (independiente del número de fotogramas) y sin timers. `GameScene` alimenta el reducer sólo con `outcome.state` y `frame.vision.visible` (datos reales), acumula el último estado devuelto y dibuja por fotograma una barra centrada arriba (depth 10) con bandas `calma/sospecha/alerta/critico` y colores de la paleta existente. No es una segunda FSM: la cobertura/oclusión U6 influye en el valor sólo porque la FSM real transita a `investigate`/`search`; la IA permanece intacta.

### Movimiento

Entrada: posición, puntos de paso, índice siguiente y distancia máxima de avance.

Salida: nueva posición, índice siguiente, finalización y dirección del último tramo consumido. `src/domain/navigation/pathFollower.ts` puede consumir varios puntos en una actualización y no depende de Phaser ni del tiempo de cuadro.

### Comportamiento

Entrada: estado actual, observaciones, memoria de trabajo y contexto de transición.

Salida: transición y causa.

La decisión es una máquina de estados de dominio puro: `src/domain/behavior/guardState.ts` exporta `resolveTransition(state, perception, context)`, una función pura sin Phaser ni navegador. Estados reales: `patrol`, `investigate`, `pursue`, `search` y `return`. La prioridad visión > sonido se codifica por orden de evaluación (visión primero en cada estado). `src/application/simulation/guardSimulation.ts` coordina la FSM con la navegación A*, el plan de búsqueda finito (`SEARCH_RADIUS_CELLS`, `SEARCH_WAYPOINTS_MAX`, `SEARCH_DURATION_MS`), el intervalo de replanificación (`REPLAN_INTERVAL_MS`) y el retorno ordenado a puntos de patrulla; Phaser sólo presenta el resultado.

El ritmo de patrulla es una coordinación de presentación, no un estado de la FSM: tras llegar a un punto de patrulla el guardia se detiene durante `PATROL_PAUSE_MS` (700 ms, configurable mediante `createGuardSimulation(map, patrolPoints, start, { patrolPauseMs })`; default 0 conserva el comportamiento H4) antes de continuar el siguiente tramo. La pausa es temporal (`timeMs` acumulado, sin timers ni FPS) y la resolución de transiciones corre antes, por lo que una observación válida la interrumpe. La salida `GuardFrameOutput` expone `patrolPaused` y `patrolGazeCell` (siguiente punto de patrulla) y la escena hace barrer la mirada del guardia 360° durante la pausa (el cono de visión existente sigue la mirada y puede detectar durante el barrido), reanudando la marcha hacia ese punto.

La animación de presentación es una capa derivada, nunca fuente de verdad: `src/game/visual/guardPresentation.ts` es una librería de dominio-pura que mapea `GuardState` a un estilo visual (`guardStatePresentation`), `TransitionEvent.from/to` a un feedback breve (`transitionEffectOf`, 350 ms) y reduce el efecto transitorio con `updateGuardEffect` (uno solo, acotado, reemplazable y sin cola). `GameScene.updateGuardPresentation` consume la salida real (`outcome.state`, `outcome.events`, `guardFacing`, `movement.direction`) y redibuja por fotograma el anillo de acento, el notch de orientación, el anillo de escaneo en `search` y el streak de urgencia únicamente cuando hay movimiento real; durante la pausa U1 no hay streak (marcha nula) y el notch acompaña el barrido. No modifica la FSM, la percepción, la navegación ni los parámetros de gameplay.

### Telemetría

Eventos estructurados con tiempo, estado anterior, estado nuevo, causa y destino: `src/domain/telemetry/transitionLog.ts` define `TransitionEvent { timeMs, from, to, cause, target }` y conserva una cola de 10 eventos. Las causas cubren patrulla, investigación, persecución, búsqueda y retorno (por ejemplo, `vision-acquired`, `vision-lost`, `search-exhausted`, `return-started`, `returned-to-patrol`, `alternate-patrol-point`).

## Comandos objetivo

```text
npm run dev
npm run build
npm run typecheck
npm run test
npm run test:run
npm run validate
```

`validate` debe ejecutar tipos, pruebas y compilación sin requerir interacción.
