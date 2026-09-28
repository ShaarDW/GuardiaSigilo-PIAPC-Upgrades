---
id: laboratorio-upgrade-8-medidor-alerta
titulo: Upgrade 8 — Medidor de alerta y estados del nivel
tipo: especificacion
audiencia: estudiante
acceso: publico
version: 1
---

# Upgrade 8 — Medidor de alerta y estados del nivel

## 1. Intención

Convertir el peligro que la IA ya implementa en una **consecuencia visible y continua** para el jugador: un nivel de alerta 0–100 que sube mientras la guardia confirma, persigue, investiga o busca, y baja cuando la amenaza se disuelve (retorno, patrulla). El medidor es una **representación derivada** de la conducta real; no es una segunda FSM y no modifica ninguna regla.

## 2. Requisito (frase verificable)

> El jugador puede observar en todo momento un nivel de alerta (0–100) derivado exclusivamente del estado real de la FSM y de la visión, que aumenta durante situaciones de peligro (persecución, investigación, búsqueda) y disminuye al disolverse la amenaza (retorno, patrulla), sin alterar las reglas de la IA.

## 3. Modelo

`src/game/visual/alertMeter.ts` (Phaser-free):

- Rango: `value ∈ [0, 100]` (float interno; el HUD muestra `Math.round`).
- Entrada por fotograma: `{ state: GuardState, visionVisible: boolean }` + `timeMs`.
- Estado del medidor: `{ value, updatedAtMs }` (mismo contrato acotado que `updateGuardEffect`).

Objetivo por situación real y velocidad de aproximación lineal:

| Situación FSM (real) | Objetivo | Movimiento |
|---|---|---|
| `patrol` | 0 | desciende `FALL_RATE_PER_MS` |
| `return` | 40 | asciende/desciende `FALL_RATE_PER_MS` |
| `investigate` (incl. ruptura/cobertura U6) | 70 | asciende/desciende `RISE_RATE_PER_MS` |
| `search` | 80 | asciende `RISE_RATE_PER_MS` |
| `pursue` (incl. gracia `VISION_LOST_GRACE_MS`) | 100 | asciende `RISE_RATE_PER_MS` |
| `visionVisible === true` (defensivo, coherente con la FSM) | 100 | asciende `RISE_RATE_PER_MS` |

- `RISE_RATE_PER_MS = 0.25` → 0→100 en 400 ms de peligro activo.
- `FALL_RATE_PER_MS = 0.08` → 100→0 en 1250 ms de calma.
- Aproximación lineal con clamp al objetivo, medido desde el último fotograma aplicado (`updatedAtMs` avanza a `timeMs`): **partición-independiente** (mismo tiempo total → mismo valor, sin importar el número de frames) y tolerante a rebobinar el reloj.
- Determinista, frame-driven, sin timers ni listeners globales.

## 4. Fuente de verdad

- **Primaria**: `outcome.state` (FSM real de `guardState.ts`/`guardSimulation.ts`) y `frame.vision.visible` (percepción real). La gracia de 200 ms ya vive dentro de `pursue`; la ruptura→`investigate`→`search` ya modela el peligro post-cobertura.
- **Auxiliar (no usada en el cálculo)**: edad de memoria, cobertura U6 y telemetría describen la *naturaleza* del peligro; el cálculo sólo lee estado + visión.
- `GameScene` guarda únicamente el último estado devuelto por el reducer puro; no calcula reglas.

## 5. Representación (HUD)

Barra dedicada superpuesta, centrada arriba de la pantalla (profundidad 10):

- Fondo oscuro 120×8 px + relleno proporcional `alert/100` del color de la banda.
- Etiqueta `ALERT <banda> <n>` a la derecha con el color de la banda.
- Bandas derivadas del valor (no son estados FSM):

| Nivel | Condición | Feedback (paleta existente) |
|---|---|---|
| `calma` | `value < 25` | slate `0x9eb4c2` (accento patrol) |
| `sospecha` | `25 ≤ value < 50` | celeste `0x62d0e8` (accento investigate) |
| `alerta` | `50 ≤ value < 80` | ámbar `0xe5b454` (gracia U2 / return) |
| `critico` | `value ≥ 80` | rojo `0xe16969` (accento pursue) + pulso `pulsePhase(time, 400)` |

- Escalada slate → celeste → ámbar → rojo, coherente con U2/U3; verde (escaneo U3) y violeta (marco U6) no se reutilizan.
- Máximo: clamp en 100, barra totalmente roja con pulso suave.
- Bajada: `FALL_RATE_PER_MS` al pasar a retorno/patrulla.
- El medidor es siempre visible (no depende de la línea de telemetría `T`).

## 6. Alcance

- **Incluido**: módulo puro de alerta, barra + etiqueta HUD, tests del contrato puro.
- **Excluido**: estados FSM nuevos, reglas de transición nuevas, cambios de percepción/LOS, memoria/LKP, navegación/A*/pathFollower, mapa, patrulla, U1, U2, U3, U6, `coverState.ts`, `guardFxGraphics`, dependencias, configuración.
- Si un requisito exigiera modificar FSM/percepción/memoria/navegación, se reporta la contradicción en lugar de ampliar el alcance.

## 7. Compatibilidad

- **FSM/guardState.ts**: sin cambios; el medidor lee el estado real.
- **U6 cobertura**: sin cambios. La oclusión influye *porque la FSM lo dice*: mientras la guardia pasa a `investigate`/`search` tras una ruptura, el medidor se mantiene en 70/80; al disolver (return→patrol) decae. `coverState.ts` no se modifica ni se lee en el cálculo.
- **U3 presentación**: sin cambios. Se reutilizan paleta y `pulsePhase`; el medidor es un `Graphics` propio (como `perceptionGraphics`/`guardFxGraphics`), sin segunda infraestructura de animación.
- **U2 cono / U1 patrulla**: intactos.

## 8. Validación

```bash
npm run validate
```

Debe quedar `typecheck OK`, `tests OK` y `build OK`; la advertencia preexistente del chunk de Phaser no cuenta como fallo.