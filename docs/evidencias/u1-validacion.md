---
id: laboratorio-evidencia-upgrade-1
titulo: Evidencia — Upgrade 1 Patrulla con pausas y mirada direccional
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia — Upgrade 1

- Fecha: 27 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Base: H4–H6 consolidados sobre `1c4eb18` más H5/H6 documentales sin commitear.

## Alcance de los cambios U1

| Archivo | Cambio |
|---|---|
| `src/application/simulation/guardSimulation.ts` | Constante `PATROL_PAUSE_MS` (700); `createGuardSimulation(..., options?: { patrolPauseMs })` (default 0); campos `patrolPauseMs` y `patrolPauseStartedAtMs`; pausa en `routePatrol` (difiere `attemptPatrolRoute` hasta vencer la duración); limpieza del temporizador en el bloque de transición; output `patrolPaused` + `patrolGazeCell` |
| `src/game/scenes/GameScene.ts` | Sim creada con `{ patrolPauseMs: PATROL_PAUSE_MS }`; durante la pausa `guardFacing` barre 360° (comenzando y terminando hacia `patrolGazeCell`) con el cono de visión siguiente la mirada |
| `tests/application/guardSimulation.test.ts` | Bloque nuevo "guard patrol pause during Upgrade 1" con 6 pruebas |
| `docs/u1-patrulla-pausas-espec.md` | Especificación del upgrade (nuevo) |
| `docs/evidencias/u1-validacion.md` | Este registro (nuevo) |
| `docs/hitos.md`, `README.md`, `docs/arquitectura.md` | Registro del hito U1, estado y nota del contrato de Comportamiento |

## Validación

| Criterio | Método | Resultado |
|---|---|---|
| Tipos estrictos | `npm run typecheck` | Sin errores |
| Pruebas | `npm run test:run` | 112 aprobadas en 11 archivos (106 previas + 6 nuevas) |
| Producto web | `npm run build` | 24 módulos en `dist/`; sólo la advertencia preexistente del paquete Phaser (chunk 1508,08 → 1508,69 kB, +0,6 kB por el código nuevo) |
| Integración completa | `npm run validate` | Tipo, pruebas y build aprobados |

## Confirmación de alcance

`git diff --stat` (ver más abajo) confirma que sólo se tocaron los archivos justificados. No hubo: cambios de FSM, percepción, memoria, búsqueda, retorno, navegación, mapa, puntos de patrulla, dependencias, `package.json` ni archivos generados fuera de `dist/`.

El tamaño extra del chunk es la única variación observable respecto del baseline y corresponde al código del upgrade (unos 40 tokens de lógica de coordinación y una constante), no a un cambio de Phaser.

## Límites

- La pausa se valida en la simulación Node (tiempo acumulado determinista); la escena la activa con la misma constante y el barrido de mirada descansa en el contrato de output (`patrolPaused`, `patrolGazeCell`) y en `PATROL_PAUSE_MS`; no tiene prueba de navegador.
- El barrido gira el cono de visión durante la pausa (presentación): el guardia puede detectarte desde cualquier dirección alrededor del punto durante esos 700 ms. Es la consecuencia aceptada de "mirar alrededor", decidida en consulta (cono barre con la mirada).