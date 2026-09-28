---
id: laboratorio-evidencia-upgrade-2
titulo: Evidencia — Upgrade 2 Cono de visión visible y reactivo
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia — Upgrade 2

- Fecha: 27 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Base: H0–H6 y U1 consolidados en `b1d7e96`.

## Alcance de los cambios U2

| Archivo | Cambio |
|---|---|
| `src/game/visual/visionFeedback.ts` | Nuevo: `VisionFeedbackState` (`normal`/`detection`/`grace`), `resolveVisionFeedback({ visible, lastVisionAgeMs, graceMs })` y `visionSector(facing, fieldOfViewRadians)`; módulo Phaser-libre y testeable en Node |
| `src/game/scenes/GameScene.ts` | Importa `VISION_LOST_GRACE_MS` y los helpers; `resolveVisionFeedbackState` deriva el estado de la memoria real; `drawPerception` usa `visionSector`, relleno reactivo con color por estado y contorno (borde reforzado en detección); sin listeners ni temporizadores nuevos |
| `tests/game/visual/visionFeedback.test.ts` | Nuevo: 9 pruebas (geometría/orientación del sector y estados del feedback) |
| `docs/u2-cono-vision-espec.md` | Especificación del upgrade (nuevo) |
| `docs/evidencias/u2-validacion.md` | Este registro (nuevo) |
| `docs/hitos.md`, `README.md`, `docs/arquitectura.md` | Registro del hito U2, estado y nota del contrato de Percepción |

## Validación

| Criterio | Método | Resultado |
|---|---|---|
| Tipos estrictos | `npm run typecheck` | Sin errores |
| Pruebas | `npm run test:run` | 121 aprobadas en 12 archivos (112 previas + 9 nuevas) |
| Producto web | `npm run build` | Build OK; sólo la advertencia preexistente del paquete Phaser (chunk 1510,40 kB, sin jugada adicional relevante) |
| Integración completa | `npm run validate` | Tipo, pruebas y build aprobados |

## Confirmación de alcance

`git diff --stat`/`git diff` (ver más abajo) confirma que sólo se tocaron los archivos justificados. No hubo: cambios de FSM (`guardState.ts` intacto), percepción (`perception.ts`, `memory.ts`, `perceptionSimulation.ts` intactos), memoria, búsqueda, retorno, navegación, mapa, puntos de patrulla, simulación de guardia, dependencias ni `package.json`. El contenido de `drawPerception` cambió sólo en representación (sector vía `visionSector`, color por estado y contorno); la geometría del cono es la misma.

## Límites

- El cono muestra el alcance y el ángulo del modelo; la oclusión real se comunica por el color reactivo (sólo una detección válida produce `detection`), no por un render de LOS pintado.
- La rotación del cono en la escena no tiene prueba de navegador; la cubren los tests del helper puro (`visionSector` sigue cualquier `guardFacing`, incluido el barrido U1).
- La coincidencia del límite de gracia visual con la FSM se prueba con `age === graceMs → normal`; el render del fotograma exacto de transición es una propiedad de la escena.