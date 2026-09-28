---
id: laboratorio-upgrade-2-cono-vision
titulo: Upgrade 2 — Cono de visión visible y reactivo
tipo: especificacion
audiencia: estudiante
acceso: publico
version: 1
---

# Upgrade 2 — Cono de visión visible y reactivo

## 1. Intención

Hacer que el cono de visión del guardia sea claramente visible y **reactivo al estado real de percepción**, sin introducir una segunda lógica de detección. Es un upgrade de representación/sería de percepción: no modifica la percepción, la memoria, la FSM ni la navegación.

## 2. Comportamiento antes

El cono ya se dibuja cada fotograma en `GameScene.drawPerception` con `guardFacing`, `VISION_RANGE` y `FIELD_OF_VIEW` (los mismos parámetros que recibe `updatePerceptionSimulation`), con un color binario: verde si `VisionResult.visible` es verdadero y azul en caso contrario. No existe un estado intermedio para el instante en que se pierde la visión (la "gracia" de `VISION_LOST_GRACE_MS`).

## 3. Comportamiento después

El cono conserva su geometría (sector con radio `VISION_RANGE` y apertura `FIELD_OF_VIEW`) y ahora se dibuja con contorno para legibilidad y con **tres estados visuales** derivados del estado real de percepción:

1. `detection` — `VisionResult.visible === true`: el jugador está visible. Relleno verde (0x73c991), borde reforzado (2 px) y opacidad ligeramente mayor (0,22).
2. `grace` — no visible, pero la última observación fue de **visión** y su antigüedad es menor que `VISION_LOST_GRACE_MS` (200 ms, la constante real de la FSM). Relleno ámbar (0xe5b454): "avistamiento reciente", justo antes de que la gracia se agote.
3. `normal` — cualquier otro caso (sin avistamiento, o fuera de la ventana de gracia). Azul (0x6b8afd) con borde fino, igual que antes.

La derivación del estado se calcula con la función pura `resolveVisionFeedback` de `src/game/visual/visionFeedback.ts`, alimentada en la escena por:

- `frame.vision.visible` (resultado real de `evaluateVision` para este fotograma);
- la memoria de percepción (`memory.source === "vision"` y `timeSinceLastPerception < VISION_LOST_GRACE_MS`).

No se reimplementa conteo de distancias, conos o line-of-sight para el dibujo: el sector muestra el alcance y el ángulo que ya usa el modelo, y la oclusión real se comunica por el color reactivo (un jugador ocluido jamás produce `detection`).

## 4. Fuente de datos (contrato consumido, sin modificar)

- `VisionResult.visible`: salida real de `evaluateVision`.
- `PerceptionMemory.source`/`lastPerceivedAtMs` y `timeSinceLastPerception(memory, timeMs)`: memoria real de percepción.
- `VISION_LOST_GRACE_MS` (200 ms): constante real de `src/domain/behavior/guardState.ts`, reutilizada (no duplicada).
- `VISION_RANGE`, `FIELD_OF_VIEW`: parámetros existentes de `GameScene`, ya usados por la percepción y por el dibujo. El sector se construye con la misma apertura mediante `visionSector(facing, fieldOfViewRadians)`.

El umbral de gracia visual coincide con el de la FSM: cuando la antigüedad alcanza `VISION_LOST_GRACE_MS` la FSM pierde la persecución (`pursue → investigate`) y el cono vuelve a `normal` en el mismo fotograma (límite exclusivo, `age < graceMs`).

## 5. Orientación y compatibilidad con U1

El sector se detecta de `guardFacing` en cada fotograma (`visionSector`). Como el barrido de mirada de U1 modifica `guardFacing`, el cono gira con la mirada y sus estados reaccionan igualmente durante la pausa. No hay listeners ni temporizadores nuevos; los estados se reevalúan por fotograma en `stepGuard` con los datos del propio fotograma.

## 6. Cómo se evita modificar la FSM y la percepción

- El estado visual es una **función pura** (`resolveVisionFeedback`) de datos ya existentes; no hay reglas de transición nuevas ni prioridades.
- No se tocan `guardState.ts`, `perception.ts`, `memory.ts`, `perceptionSimulation.ts`, la navegación, el mapa, los puntos de patrulla ni la simulación de guardia.
- La geometría del sector es la misma de antes (sólo se añade el contorno) para no sugerir un alcance distinto al del modelo.

## 7. Tests agregados

Ver `tests/game/visual/visionFeedback.test.ts`:

- A/B. `visionSector` centra el cono en la dirección del guardia y sigue cualquier rotación (el cono usa la orientación actual; en escena, el barrido U1 rota `guardFacing`).
- C. El sector usa la apertura pasada como parámetro (sin constantes duplicadas) y la gracia usa `VISION_LOST_GRACE_MS` (límite 200 probado explícitamente).
- D. `resolveVisionFeedback` → `detection` cuando hay visibilidad (incluso sostenida durante largo tiempo).
- E. `resolveVisionFeedback` → `normal` sin avistamiento previo y al alcanzar el umbral de gracia; → `grace` dentro de la ventana.
- F. Regresión: 112 pruebas previas intactas.

## 8. Resultado de `npm run validate`

Typecheck OK, 121 pruebas aprobadas en 12 archivos (112 previas + 9 nuevas), build OK. Única advertencia: la preexistente del tamaño del chunk de Phaser.

## 9. Riesgos o limitaciones

- El cono es una representación del alcance/ángulo del modelo, no un render de line-of-sight con oclusión pintada; la limitación se comunica con el color reactivo (sólo una detección real produce `detection`).
- La escena (rotación del cono en tiempo real) no tiene prueba de navegador; se cubre por tipos y por los tests del helper puro que alimenta la geometría y el estado.
- Los colores provienen de la paleta ya usada en el HUD (azul guardia, verde detección, ámbar sonido/atención) con justificación documentada; no se introducen colores arbitrarios.