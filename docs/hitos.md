---
id: laboratorio-guardia-sigilo-hitos
titulo: Hitos del laboratorio Guardia de Sigilo
tipo: referencia
audiencia: estudiante
acceso: publico
version: 4
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

Cada hito debe poder validarse de forma independiente. No se avanza ocultando fallos del anterior.
