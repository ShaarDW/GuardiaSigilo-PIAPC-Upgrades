---
id: laboratorio-guardia-sigilo-hitos
titulo: Hitos del laboratorio Guardia de Sigilo
tipo: referencia
audiencia: estudiante
acceso: publico
version: 8
---

# Hitos del laboratorio

| Hito | Estado |
|---|---|
| H0. Base reproducible | Completado |
| H1. Repositorio preparado para agentes | Completado |
| H2. Navegación | Completado |
| H3. Percepción y movimiento | Completado |
| H4. Máquina de estados | Completado |
| H5. Comparación | Completado |
| H6. Integración final | Completado |
| U1. Patrulla con pausas y mirada direccional | Completado |
| U2. Cono de visión visible y reactivo | Completado |
| U3. Animaciones por estado y transición | Completado |
| U6. Cobertura y ruptura de línea de visión | Completado |
| U8. Medidor de alerta y estados del nivel | Completado |

## H0. Base reproducible

- Proyecto Phaser/TypeScript ejecutable.
- Mapa, jugador y obstáculos.
- Formas generadas por código.
- Comandos documentados.
- Validación inicial.

## H1. Repositorio preparado para agentes

- AGENTS.md conciso.
- Especificaciones y arquitectura.
- Permisos recomendados.
- Plantillas de evidencia.
- Estado limpio y reproducible.

## H2. Navegación

- Grafo de cuadrícula.
- BFS como referencia comparativa.
- A* con métricas.
- Casos de éxito y fracaso.
- Visualización de ruta y nodos explorados.

## H3. Percepción y movimiento

- Visión con oclusión.
- Sonido.
- Última posición conocida.
- Seguimiento de caminos.
- Pruebas de geometría y memoria.

## H4. Máquina de estados

- Patrullar, Investigar, Perseguir, Buscar y Regresar.
- Guardas e invariantes.
- Prioridades explícitas.
- Registro de transiciones.
- Pruebas de secuencias.

### H4.1. Patrullar

- Recorrer puntos de patrulla cíclicos mediante rutas válidas.
- Registrar llegada y selección del siguiente punto.

### H4.2. Investigar

- Responder a un sonido o última posición conocida sin usar información no percibida.
- Registrar origen, destino y resultado de navegación.

### H4.3. Perseguir

- Priorizar una percepción visual válida y actualizar memoria.
- Replanificar sólo cuando cambia el objetivo de forma relevante o vence el intervalo definido.

### H4.4. Buscar

- Al perder visión, recorrer una búsqueda limitada alrededor de la última posición conocida.
- Conservar memoria y registrar inicio, vencimiento o recuperación de percepción.

### H4.5. Regresar

- Tras agotar la búsqueda, volver a un punto de patrulla válido.
- Recuperarse explícitamente ante un destino inaccesible y registrar la transición.

## H5. Comparación

- Representación equivalente mediante árbol de comportamiento, utilidad y GOAP en diagramas o trazas.
- Decisión justificada sobre la técnica implementada.
- Prueba de juego centrada en legibilidad y justicia.

Evidencia H5: `docs/h5-comparacion-maquina-estados.md` (diagrama de la FSM real, trace representativo sobre el mapa del laboratorio, tabla comparativa y justificación que distingue hechos de inferencias) y `docs/evidencias/h5-validacion.md`.

## H6. Integración final

- Validación completa.
- Métricas.
- Trazabilidad del uso de agentes.
- Revisión de seguridad y licencias.
- Producto ejecutable e informe.

Evidencia H6: `docs/evidencias/h6-integracion.md` (línea de reconstrucción, validación final, escenarios integrados, auditoría documentación ↔ código y revisión de riesgos).

## U1. Patrulla con pausas y mirada direccional

- Pausa determinista de `PATROL_PAUSE_MS` (700 ms) tras llegar a un punto de patrulla.
- Barrido de mirada de 360° durante la pausa (comienza y termina mirando al siguiente punto); el cono de visión sigue la mirada.
- Una observación válida de la IA interrumpe la pausa según las reglas FSM existentes.
- Sin cambios de FSM, percepción, memoria, navegación, mapa ni puntos de patrulla.

Evidencia U1: `docs/u1-patrulla-pausas-espec.md` (especificación) y `docs/evidencias/u1-validacion.md` (validación y revisión del diff).

## U2. Cono de visión visible y reactivo

- Cono visible con contorno que sigue la orientación del guardia (incluido el barrido U1).
- Tres estados reactivos derivados del estado real de percepción: `detection` (verde), `grace` (ámbar, dentro de `VISION_LOST_GRACE_MS`) y `normal` (azul).
- Lógica de estado como función pura (`src/game/visual/visionFeedback.ts`), sin segunda detección.
- Sin cambios de FSM, percepción, memoria, navegación, mapa, patrulla ni simulación de guardia.

Evidencia U2: `docs/u2-cono-vision-espec.md` (especificación) y `docs/evidencias/u2-validacion.md` (validación y revisión del diff).

## U3. Animaciones por estado y transición

- Representación distinguible por estado (patrol calmo, investigate atento, pursue urgente, search con escaneo, return calmado) con anillo de acento, notch de orientación y streak sólo con movimiento real.
- Feedback breve (350 ms, determinista y cancelable) para todas las transiciones reales `from≠to` (reutilizando la telemetría), sin duplicar reglas de la FSM.
- Sin segunda FSM: el reducer `updateGuardEffect` es presentación pura acotada.
- Compatible con U1 (pausa sin movimiento visual; notch acompaña el barrido) y U2 (cono intacto).
- Sin cambios de FSM, percepción, memoria, navegación, mapa, patrulla, velocidades ni parámetros de gameplay.

Evidencia U3: `docs/u3-animaciones-estados-espec.md` (especificación) y `docs/evidencias/u3-validacion.md` (validación y revisión del diff).

## U6. Cobertura y ruptura de línea de visión

- La ruptura de línea de visión por oclusión se construye sobre la transición existente: percepción deja de confirmar (`reason=occluded`), memoria/LKP congelado, gracia de 200 ms, `PURSUE → INVESTIGATE (LKP) → SEARCH` y re-persecución sólo al volver a ser visible — sin reglas FSM nuevas.
- El invariante `confirmsSight(reason)` (sólo `visible` confirma) queda en una función pura Phaser-free (`src/game/visual/coverState.ts`) con `resolveCover` y `coverFlash` (350 ms).
- Feedback mínimo derivado de datos reales: línea HUD `cobertura` (`VISIBLE | CUBIERTO | EXPUESTO`) y marco breve en `guardFxGraphics` al entrar en cobertura.
- Sin cambios de FSM, percepción, memoria, navegación, mapa, patrulla, U1, U2 ni U3.

Evidencia U6: `docs/u6-cobertura-los-espec.md` (especificación) y `docs/evidencias/u6-validacion.md` (validación y revisión del diff).

## U8. Medidor de alerta y estados del nivel

- Nivel de alerta 0–100 derivado sólo de la FSM real y la visión: `pursue`/visión → 100, `search` → 80, `investigate` → 70, `return` → 40, `patrol` → 0; ascenso 0.25/ms (0→100 en 400 ms) y descenso 0.08/ms (100→0 en 1250 ms).
- Reducer puro Phaser-free (`src/game/visual/alertMeter.ts`) con clamp, partición-independiente y sin timers; el HUD sólo redibuja por fotograma.
- Barra dedicada centrada arriba con 4 bandas de peligro (`calma/sospecha/alerta/critico`) usando la paleta existente (slate → celeste → ámbar → rojo) y pulso en `critico`.
- No es una segunda FSM: se leen `outcome.state` y `frame.vision.visible`; cobertura/oclusión influye porque la FSM la expresa (investigate/search → alerta alta), sin modificar U6.
- Sin cambios de FSM, percepción, memoria, navegación, mapa, patrulla, U1, U2, U3 ni U6.

Evidencia U8: `docs/u8-alerta-espec.md` (especificación) y `docs/evidencias/u8-validacion.md` (validación y revisión del diff).

Cada hito debe poder validarse de forma independiente. No se avanza ocultando fallos del anterior.
