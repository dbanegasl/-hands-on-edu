# REQ-014 — Librería frontend compartida `ho-common.js`

> **Última actualización:** 2026-06-10
> **Estado:** 🔄 En progreso

| Campo | Valor |
|-------|-------|
| **ID** | REQ-014 |
| **Tipo** | Tech-Debt |
| **Prioridad** | Alta |
| **Estado** | 🔄 En progreso |
| **Módulo** | Global / Frontend (`app/static/js/`) |
| **Esfuerzo estimado** | M (4–6 horas) |

---

## Problema

Los 6 scripts de frontend (`webcam.js`, `gestiedu.js`, `motivasign.js`, `attendeye.js`, `virtualpainter.js`, `airpiano.js`) duplicaban ~340 líneas casi idénticas:

- La tabla `HAND_CONNECTIONS` y `FINGERTIPS` (×5).
- El dibujo del esqueleto de la mano (~35 líneas ×5).
- El volcado de video reflejado (`translate/scale(-1,1)/drawImage`).
- La construcción de la URL del WebSocket y el ciclo `connectWS()` con el flag `processing` de ping-pong.

Además, la **reconexión era inconsistente**: solo VirtualPainter y AirPiano reintentaban al caerse el socket; GestiEdu, MotivaSign, AttendEye y el Testing Lab no. Las etiquetas de gesto se mostraban con el string crudo del backend en inglés (`"2 fingers"`).

---

## Solución implementada

Nueva librería `app/static/js/ho-common.js` (namespace `window.HO`), cargada antes de cada script de módulo:

| API | Reemplaza |
|-----|-----------|
| `HO.HAND_CONNECTIONS`, `HO.FINGERTIPS` | Constantes duplicadas en 5 archivos |
| `HO.drawSkeleton(ctx, landmarks, w, h, opts)` | El dibujo de esqueleto + puntos (3 variantes de color vía `opts`) |
| `HO.drawMirroredVideo(ctx, video, w, h)` | El bloque de video reflejado |
| `HO.HandSocket({onResult, onStatus})` | `connectWS()` — incluye validación de forma del JSON y **reconexión uniforme** con backoff 1s→2s→4s (tope 5s) |
| `HO.GestureStabilizer(n, minVotes)` | Voto mayoritario en cliente (debounce de VirtualPainter) |
| `HO.OneEuro({minCutoff, beta, dCutoff})` | Filtro de bajo jitter / baja latencia para el cursor de VirtualPainter |
| `HO.gestureLabel(g)`, `HO.GESTURE_LABELS_ES`, `HO.GESTURE_EMOJI` | Etiquetas de gesto en español (incluye `i_love_you`, `ok`) |

`HandSocket` encapsula el flag de backpressure: `sendFrame(canvas, quality)` solo envía si el socket está abierto y no hay respuesta pendiente.

### Migración

Un commit por módulo, del más simple al más complejo:

1. ✅ **Testing Lab** (`webcam.js`) — además expone `confidence`, `gesture_raw` y `fingers_up` en el panel, convirtiéndolo en la herramienta de verificación manual del resto.
2. ⬜ `gestiedu.js`
3. ⬜ `motivasign.js`
4. ⬜ `virtualpainter.js`
5. ⬜ `airpiano.js`
6. ⬜ `attendeye.js` (solo el WS de cámara; su segundo WS es específico del módulo)

Cada HTML añade `<script src="/static/js/ho-common.js">` antes del script del módulo.

---

## Criterios de aceptación

- ⬜ Los 6 módulos usan `HO.*`; ~340 líneas duplicadas eliminadas.
- ⬜ Todos los módulos reconectan automáticamente tras reiniciar el servidor.
- ⬜ El render del esqueleto es idéntico al previo en cada módulo.
- ⬜ Sin errores en consola.

---

## Verificación

Por módulo: abrir la página, reiniciar el servidor a mitad de sesión → reconexión en < 5 s; el esqueleto se dibuja igual. El Testing Lab (`/testing`) muestra los campos nuevos para validar la detección.
