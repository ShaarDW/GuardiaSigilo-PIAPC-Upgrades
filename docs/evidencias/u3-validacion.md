---
id: laboratorio-evidencia-upgrade-3
titulo: Evidencia — Upgrade 3 Animaciones por estado y transición
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia — Upgrade 3

- Fecha: 27 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Base: H0–H6, U1 y U2 consolidados (working tree limpio, U1/U2 cerrados).

## 1. Baseline

FSM de 5 estados (`guardState.ts`), percepción + memoria/LKP, navegación A*/pathFollower, patrulla cíclica con pausa (`PATROL_PAUSE_MS`) y barrido de mirada (U1), cono de visión reactivo (U2), telemetría de transiciones, 121 tests en 12 archivos.

## 2. Implementación

| Archivo | Cambio |
|---|---|
| `src/game/visual/guardPresentation.ts` | Nuevo: `guardStatePresentation` (5 estilos), `transitionEffectOf` (todas las `from≠to` reales), `updateGuardEffect` (reducer de presentación), `effectProgress`, `pulsePhase`, `motionVisual`, `guardFacingAngle`; constantes `GUARD_TRANSITION_EFFECT_MS` (350) y `GUARD_SEARCH_SCAN_PERIOD_MS` (700) |
| `src/game/scenes/GameScene.ts` | `guardFxGraphics` (depth 4); `guardEffectState`; en `stepGuard` se trackea `moved` (movimiento real) y se llama `updateGuardPresentation(time, outcome, moving)`, que redibuja por fotograma anillo de acento, notch de orientación (`guardFacing`), scan-ring en `search`, streak en movimiento y onda de transición + pop de escala |
| `tests/game/visual/guardPresentation.test.ts` | Nuevo: 24 pruebas (A–E) |
| `docs/u3-animaciones-estados-espec.md` | Especificación del upgrade (nuevo) |
| `docs/evidencias/u3-validacion.md` | Este registro (nuevo) |
| `docs/hitos.md`, `README.md`, `docs/arquitectura.md` | Registro del hito U3, estado y nota del contrato de representación |

## 3. Tabla estado → representación

| Estado | Representación |
|---|---|
| `patrol` | Calmo, anillo slate `0x9eb4c2`, pulso lento |
| `investigate` | Atento, celeste `0x62d0e8`, pulso medio |
| `pursue` | Urgente, rojo `0xe16969`, pulso rápido + streak si se mueve |
| `search` | Escaneo, verde `0x73c991`, anillo de escaneo expansivo |
| `return` | Retorno, ámbar `0xe5a439`, pulso calmado |

## 4. Transiciones cubiertas

`PATROL→INVESTIGATE` (`investigate`), `PATROL→PURSUE` y `INVESTIGATE→PURSUE` (`acquire`), `PURSUE→INVESTIGATE` (`lost`), `INVESTIGATE→SEARCH` (`search`), `SEARCH→RETURN` (`exhaust`), `RETURN→PATROL` (`returned`). Plus reales: `SEARCH→PURSUE` y `RETURN→PURSUE` (`acquire`), `INVESTIGATE→PATROL` (`returned`). Eventos `from === to` no producen feedback.

## 5. Tests

145 pruebas aprobadas en 13 archivos (121 previas + 24 nuevas en `guardPresentation.test.ts`):

- A. estado→representación: 5 categorías/accentos distintos; `scanRadius` sólo en `search`.
- B. transición→feedback: los pares requeridos y reales devuelven el efecto esperado; `from===to` → null.
- C. prioridad: el reducer reemplaza/cancela un efecto activo, el último cambio del fotograma gana, nunca acumula cola y caduca por duración.
- D. tiempo: `effectProgress` acotado [0,1] y `pulsePhase` determinista y envolvente con el delta de tiempo.
- E. pausa U1: `motionVisual(false, *)` nunca produce streak; `guardFacingAngle` mapea la orientación (incl. barrido).

## 6. `npm run validate`

Typecheck sin errores · 145/145 tests · build OK. Única advertencia: la preexistente del chunk de Phaser (1510,40 → 1513,37 kB, +3 kB por el código de presentación).

## 7. Comprobación visual/manual

Checklist (no automatizada, según la arquitectura): en `npm run dev`, el guardia muestra anillo slate calmo al patrullar y se queda quieto (sin streak) durante la pausa de 700 ms mientras el notch gira 360° con el barrido; ring rojo + streak al perseguir; onda breve en `sound-heard`, avistamiento, pérdida de visión, entrada a búsqueda, fin de búsqueda y retorno a patrulla; anillo de escaneo verde en SEARCH; el cono de U2 permanece intacto y sigue al guardia.

## 8. Diff

`git diff --stat`/`git diff` (sección 9 del informe final) confirma: `src/` sólo `GameScene.ts` (presentación) + `game/visual/guardPresentation.ts` nuevo; sin cambios en `guardState.ts`, `transitionLog.ts`, percepción, memoria, navegación, `pathFollower`, mapa, patrulla, U1, U2, dependencias ni `package.json`.

## 9. Riesgos y deuda

- La rotación del notch y la onda en vivo no tienen prueba de navegador; se cubren por el contrato puro que alimenta la representación.
- El `breathing` de quietud y el `pop` de transición amplifican el cuerpo unos pocos puntos porcentuales; es puramente visual y acotado.
- El efecto de transición comparte el acento del estado actual (coherente con "la representación se adapta al estado actual").

## 10. Confirmación de gameplay intacto

No se modificaron: velocidades, rango de visión, FOV, LKP, rutas, A\*, `pathFollower`, puntos de patrulla, `PATROL_PAUSE_MS`, barrido U1, reglas FSM, causas, memoria, búsqueda ni retorno. Los 121 tests previos pasan sin cambios.