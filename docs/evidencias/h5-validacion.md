---
id: laboratorio-evidencia-validacion-h5
titulo: Evidencia de validación H5
tipo: referencia
audiencia: estudiante
acceso: publico
version: 1
---

# Evidencia de validación H5

- Fecha: 27 de septiembre de 2026.
- Entorno: Windows, Node.js 22.6.0, npm 10.8.2.
- Versión evaluada: cambios H5 sobre `1c4eb18` (H4.5 consolidado).

## Alcance de los cambios H5

H5 es documentación/evidencia y agrega una única prueba de traza. El diff contra `HEAD` modifica:

| Archivo | Cambio |
|---|---|
| `docs/h5-comparacion-maquina-estados.md` | Nuevo: diagrama de la FSM real, trace representativo, tabla comparativa FSM/BT/Utility/GOAP y justificación que distingue hechos de inferencias |
| `docs/evidencias/h5-validacion.md` | Nuevo: este registro |
| `docs/hitos.md` | H4 y H5 marcados como Completados |
| `README.md` | Estado H0–H5 y enlaces de documentos |
| `docs/arquitectura.md` | Contratos de Comportamiento y Telemetría con los nombres y parámetros reales |
| `tests/application/guardSimulation.test.ts` | Una prueba nueva que ejecuta la secuencia PATROL→INVESTIGATE→PURSUE→INVESTIGATE→SEARCH→RETURN→PATROL y valida sus 16 causas |

No se modificó código funcional de H4: `git diff --stat` no muestra cambios en `src/`.

## Validación

| Criterio | Método | Resultado |
|---|---|---|
| Tipos estrictos | `npm run typecheck` | Sin errores |
| Dominio y aplicación | `npm run test:run` | 106 pruebas aprobadas en 11 archivos |
| Prueba de traza H5 | ejecución enfocada de la secuencia de 8 frames | Causa la lista esperada de 16 causas |
| Producto web | `npm run build` | 24 módulos en `dist/`; sólo la advertencia preexistente del paquete Phaser |
| Integración completa | `npm run validate` | Tipos, pruebas y build aprobados |

## Confirmación de integridad

- La FSM no fue reemplazada ni se implementó Behavior Tree, Utility AI ni GOAP.
- No se agregaron parámetros de H4 ni se cambió percepción, memoria, navegación ni PathFollower.
- No se agregaron dependencias, servicios de red ni persistencia; no hubo commits ni push.

## Límites

- El trace proviene de la simulación Node probada, no de una sesión de navegador; la interacción visual sigue fuera de la cobertura automatizada.
- La causa `investigate-target` está declarada en `GuardCause` pero ninguna transición la emite; el documento H5 la reporta explícitamente.