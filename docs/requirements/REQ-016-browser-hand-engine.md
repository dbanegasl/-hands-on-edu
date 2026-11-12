# REQ-016 — Detección de manos en el navegador (MediaPipe Tasks JS)

> **Última actualización:** 2026-11-11

| Campo | Valor |
|-------|-------|
| **ID** | REQ-016 |
| **Tipo** | Tech-Debt / Arquitectura |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho (v0.9.0) |
| **Módulo** | Global / Frontend |

---

## Problema

Cada estudiante enviaba todos los cuadros de su cámara al servidor (JPEG base64 por WebSocket) y el servidor ejecutaba MediaPipe por conexión:

- **Privacidad:** el video de menores salía de su dispositivo.
- **Escalabilidad:** un aula de 30 alumnos equivale a 30 inferencias simultáneas en un solo contenedor.
- **Latencia:** cada cuadro hacía un viaje de ida y vuelta por la red.

## Solución implementada

- `app/static/js/ho-hands.js`: `LocalHandEngine` ejecuta MediaPipe Hand Landmarker 0.10.35 (WASM) en el navegador. Expone la **misma interfaz y el mismo JSON** que `HO.HandSocket`.
- `HO.createHandSource()` reemplaza `new HO.HandSocket()` en los 6 frontends. Si el motor no carga, recurre de forma transparente a `WS /ws/analyze`. `?engine=server` lo fuerza.
- Bundle JS + WASM vendorizados en la imagen Docker (`/vendor/mediapipe/`) y modelo servido en `/models/`, para redes escolares que bloquean CDNs.
- Delegado adaptativo: CPU si el renderizador WebGL es por software; si no, GPU, con cambio a CPU en caliente si promedia > 60 ms/cuadro.
- Paridad Python↔JS de la heurística de gestos verificada con un fixture compartido (`tests/fixtures/gesture_parity.json`) desde pytest y `node --test`.
- `WS /ws/analyze` se mantiene como respaldo y gana validación de payload (JSON inválido o > 2 MB → `invalid_payload` sin cerrar la conexión), además de `engine`, `aspect` y `world_landmarks` en la respuesta.

## Criterios de aceptación

- ✅ Los 6 frontends funcionan con el motor del navegador. Verificado con Chromium y cámara falsa: todos reciben resultados con `engine=browser` y detectan la mano.
- ✅ El respaldo por servidor sigue funcionando (`?engine=server`).
- ✅ ~24 resultados/s incluso con GPU emulada por software.
- ✅ Tests de paridad en verde en ambos lenguajes.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
