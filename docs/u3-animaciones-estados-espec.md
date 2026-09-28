---
id: laboratorio-upgrade-3-animaciones-estados
titulo: Upgrade 3 — Animaciones por estado y transición
tipo: especificacion
audiencia: estudiante
acceso: publico
version: 1
---

# Upgrade 3 — Animaciones por estado y transición

## 1. Intención

Agregar una capa de presentación que haga distinguible el estado de la FSM (PATROL, INVESTIGATE, PURSUE, SEARCH y RETURN) y que dé una respuesta visual breve a las transiciones importantes. Es un upgrade de **representación**: la fuente de verdad del comportamiento sigue siendo la simulación (FSM, telemetría, orientación, movimiento y percepción). No existe una segunda máquina de estados.

## 2. Estados visuales

Cada estado tiene un estilo propio derivado de `GuardState` mediante `guardStatePresentation` (función pura en `src/game/visual/guardPresentation.ts`), con colores de la paleta ya usada en el HUD:

| Estado FSM | Representación | Acento | Anillo | Pulso | Extra |
|---|---|---|---|---|---|
| `patrol` | Calmo | azul-gris `0x9eb4c2` | 1.5 | 1200 ms | — |
| `investigate` | Atento | celeste `0x62d0e8` | 2 | 800 ms | — |
| `pursue` | Urgente | rojo alarma `0xe16969` | 2.5 | 400 ms | streak + ganancia de urgencia 2 |
| `search` | Escaneo | verde `0x73c991` | 2 | 700 ms | anillo de escaneo expansivo |
| `return` | Retorno | ámbar `0xe5a439` | 1.5 | 1100 ms | — |

Elementos de representación (en un único `guardFxGraphics` redibujado por fotograma, sin objetos por frame):

- **Anillo de acento**: círculo en el color del estado con una pulsación determinista (`pulsePhase(time, periodo)`).
- **Notch de orientación**: pequeño triángulo siempre alineado con `guardFacing` (`guardFacingAngle`), por lo que acompaña al movimiento real y al barrido de U1 sin sobrescribirlo.
- **Anillo de escaneo** (sólo `search`): círculo que se expande y reinicia con `GUARD_SEARCH_SCAN_PERIOD_MS` (700 ms).
- **Streak de urgencia** (principalmente `pursue`): trazo detrás del guardia **sólo si hay movimiento real** (`motionVisual(moving, state)` exige `moving=true`).

## 3. Eventos/transiciones visuales

`transitionEffectOf(from, to)` mapea **todas** las transiciones reales `from ≠ to` (se reutiliza `TransitionEvent` de la telemetría, sin duplicar reglas de la FSM; `from === to` como `route-replanned`/`arrived` no produce efecto):

| Transición | Efecto |
|---|---|
| `PATROL → INVESTIGATE` | `investigate` |
| `PATROL → PURSUE` | `acquire` |
| `INVESTIGATE → PURSUE` | `acquire` |
| `PURSUE → INVESTIGATE` | `lost` |
| `INVESTIGATE → SEARCH` | `search` |
| `SEARCH → RETURN` | `exhaust` |
| `RETURN → PATROL` / `INVESTIGATE → PATROL` | `returned` |
| `SEARCH → PURSUE`, `RETURN → PURSUE` | `acquire` (mismo efecto: avistamiento durante búsqueda/retorno) |

El efecto dura `GUARD_TRANSITION_EFFECT_MS` (350 ms): onda expansiva (anillo que crece y se disipa desde la posición del guardia) + un `pop` de escala del cuerpo. Es determinista (`effectProgress`), se cancela/reemplaza con el estado actual y **no bloquea ni retrasa la simulación**: sólo afecta al dibujo y a la escala.

## 4. Fuente de verdad

- Estado → `outcome.state` de `GuardFrameOutput` (FSM real).
- Transición → `outcome.events` (telemetría real `TransitionEvent { from, to, cause, timeMs }`).
- Orientación → `guardFacing` (dirección real del último tramo o del barrido U1).
- Movimiento → `movement.direction` de `advanceAlongPath` (sólo hay avance si la ruta tiene waypoints).
- Percepción → sin cambios; el cono de U2 sigue funcionando.

## 5. Relación con la FSM

- `guardState.ts`, `resolveTransition` y `transitionLog.ts` **no se modifican**.
- No existe una segunda FSM: `updateGuardEffect` es un reducer de **presentación** con un único efecto transitorio acotado (reemplaza o caduca; nunca acumula cola) y no decide ninguna regla de gameplay. Las prioridades de transición siguen siendo exclusivas de `resolveTransition`.

## 6. Compatibilidad con U1 y U2

- **U1 pausa**: durante `patrolPaused` no hay waypoints → `moving=false` → ningún streak/visual de caminar; el cuerpo sólo respira (espera/observación) y el notch rota con el barrido de U1 porque lee `guardFacing` (que la escena no sobrescribe).
- **U1/U2 movimiento**: un estado distinto de la FSM no cambia la velocidad, el alcance ni el FOV (parámetros intactos).
- **U2 cono**: `perceptionGraphics` (depth 1) y el cono reactivo quedan intactos; `guardFxGraphics` (depth 4) se dibuja encima del cono y por debajo del marcador LKP (depth 5).

## 7. Límites del sistema de animación

- Es animación **procedural ligera** sobre la forma existente (círculo del guardia): sin sprites, sin assets externos, sin paquetes.
- Sin timers globales: todos los efectos usan `time`/`delta` del fotograma (`pulsePhase`, `effectProgress`).
- El `breathing` de quietud amplifica el cuerpo ≤ ~5%: representa espera, no movimiento.
- La escena (rotación del notch, onda en tiempo real) no tiene prueba de navegador; el contrato de datos que la alimenta sí está cubierto por tests (ver sección siguiente).