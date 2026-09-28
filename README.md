---
id: laboratorio-guardia-sigilo
titulo: Laboratorio Guardia de Sigilo
tipo: indice
audiencia: estudiante
acceso: publico
version: 6
---

# Laboratorio Guardia de Sigilo

Proyecto canónico de PIAPC 2026 para aplicar desarrollo agéntico e inteligencia artificial de videojuegos.

## Estado

H0 a H6 implementados: escenario base, repositorio preparado para agentes, navegación BFS/A*, percepción con memoria, máquina de estados del guardia (PATROL, INVESTIGATE, PURSUE, SEARCH y RETURN), comparación de arquitecturas y cierre de la integración final. Upgrade 1 implementado: la patrulla se detiene brevemente (`PATROL_PAUSE_MS`) en cada punto, barre la mirada 360° a su alrededor y continúa, sin alterar la FSM ni la navegación. Upgrade 2 implementado: el cono de visión es visible con contorno y reacciona al estado real de percepción en tres estados (detección, gracia de 200 ms y normal), sin segunda lógica de detección. Upgrade 3 implementado: cada estado de la FSM tiene una representación visual propia (anillo de acento, notch de orientación, escaneo en búsqueda, streak de urgencia) y las transiciones reales emiten una onda breve de 350 ms; todo como capa de presentación pura, sin tocar la FSM ni el gameplay.

## Ejecución

Requiere Node.js 22 o superior.

```bash
npm ci
npm run dev
```

Validación completa:

```bash
npm run validate
```

En la escena:

- WASD o flechas: mover al jugador.
- Clic: elegir un destino para el guardia.
- Espacio: alternar BFS y A*.
- Q: emitir un sonido desde el jugador.
- R: reiniciar el escenario.

## Propósito

Construir un juego 2D cenital mínimo donde un guardia:

- patrulla puntos definidos;
- percibe al jugador mediante visión y sonido;
- conserva una última posición conocida;
- navega mediante A*;
- sigue caminos sin mezclar búsqueda y locomoción;
- decide mediante una máquina de estados;
- expone telemetría suficiente para comprender y probar su conducta.

El proyecto no busca producir un videojuego comercial. Es un entorno de experimentación controlado, reproducible y apto para personas y agentes de desarrollo.

## Documentos

- [Especificación del producto](specs/01-producto.md)
- [Especificación pedagógica](specs/02-pedagogica.md)
- [Arquitectura](docs/arquitectura.md)
- [Hitos](docs/hitos.md)
- [Contrato para proyectos alternativos](docs/contrato-proyecto-alternativo.md)
- [Decisiones técnicas](docs/decisiones-tecnicas.md)
- [Auditoría H1](docs/auditoria-h1.md)
- [Permisos recomendados](docs/permisos-recomendados.md)
- [Registro de intervención](docs/plantillas/registro-intervencion.md)
- [Evidencia de pruebas](docs/plantillas/evidencia-pruebas.md)
- [H3: percepción y movimiento](docs/h3-percepcion-movimiento.md)
- [H5: comparación de arquitecturas de decisión](docs/h5-comparacion-maquina-estados.md)
- [Intervención H3](docs/evidencias/h3-intervencion.md)
- [Validación H3](docs/evidencias/h3-validacion.md)
- [Validación H5](docs/evidencias/h5-validacion.md)
- [Integración final H6](docs/evidencias/h6-integracion.md)
- [U1: patrulla con pausas y mirada direccional](docs/u1-patrulla-pausas-espec.md)
- [Validación U1](docs/evidencias/u1-validacion.md)
- [U2: cono de visión visible y reactivo](docs/u2-cono-vision-espec.md)
- [Validación U2](docs/evidencias/u2-validacion.md)
- [U3: animaciones por estado y transición](docs/u3-animaciones-estados-espec.md)
- [Validación U3](docs/evidencias/u3-validacion.md)

## Tecnología de referencia

- Phaser con TypeScript.
- Vite para desarrollo y compilación.
- Vitest para pruebas de dominio.
- Node.js 22 o superior.
- npm y archivo de bloqueo para instalaciones reproducibles.

El estudiante puede adoptar Unity u otro entorno si cumple el contrato de equivalencia.

## Restricción principal

La lógica de navegación, percepción y decisión no dependerá de Phaser. El motor será un adaptador de entrada, tiempo, colisiones y representación visual.
