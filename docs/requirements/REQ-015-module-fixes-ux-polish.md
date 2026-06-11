# REQ-015 — Correcciones de detección y pulido UX por módulo

> **Última actualización:** 2026-06-11
> **Estado:** ✅ Hecho

| Campo | Valor |
|-------|-------|
| **ID** | REQ-015 |
| **Tipo** | Mejora |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho |
| **Módulo** | Todos los módulos |
| **Versión** | 0.7.0 – 0.8.0 |
| **Esfuerzo estimado** | L (8–12 horas) |

---

## Descripción

Correcciones de comportamiento y pulido visual para cada módulo, construidas sobre la base de detección de REQ-013 y la librería compartida de REQ-014.

---

## Síntomas corregidos

| Módulo | Síntoma | Causa raíz | Solución |
|--------|---------|------------|----------|
| GestiEdu | "✌️ 2 dedos" al mostrar pulgar-arriba girado | Heurística `tip.y < pip.y` rota-dependiente | Reescritura en REQ-013 (invariante por razón de distancias) |
| MotivaSign | Emoji 🤟 para "tres dedos"; `amor` detectaba `shaka` | Catálogo erróneo + gestión inexistente de `i_love_you` | Catálogo corregido + nuevo gesto backend `i_love_you` |
| VirtualPainter | Trazos entrecortados; "En pausa" mientras se señala | Sin debounce de modo; EMA débil; `lineTo` recto | Debounce 150 ms, One-Euro, midpoints cuadráticos |
| AirPiano | Teclas se activan con cara/antebrazo | Sin filtro de confianza ni span de mano; todos los tips activan | `isPlausibleHand` + `fingers_up` check |

---

## Cambios implementados

### VirtualPainter (`app/static/js/virtualpainter.js`)

- **Mode debounce 150 ms**: `pendingMode`/`pendingSince` — solo se confirma el cambio de modo si persiste ≥ 150 ms. Elimina el parpadeo "idle→draw→idle" por fotograma.
- **One-Euro filter**: sustituye EMA(0.5) con dos instancias `HO.OneEuro` (x, y) para cursor estable y sin lag visible.
- **Midpoint smoothing**: `moveTo(prevMid)` + `quadraticCurveTo(prevPoint, mid)` en lugar de `lineTo` — trazos curvos sin huecos.
- **Snapshot de undo solo en transición idle→draw**: un único snapshot por trazo real, no por cada fotograma de pausa.
- Filtro `confidence ≥ 0.7`.

### AirPiano (`app/static/js/airpiano.js`)

- `isPlausibleHand(hand)`: rechaza "manos" con `confidence < 0.7` o span de muñeca→MCP medio < 0.09 (elimina caras/antebrazos).
- Solo activan teclas los dedos extendidos (`fingers_up[fingerName] === true`).
- Fade-out de tecla ~120 ms via `releasedKeys` Map (canvas draw loop).

### MotivaSign (`app/static/js/motivasign.js`)

| Seña | Antes | Ahora |
|------|-------|-------|
| `tres` | emoji 🤟, gesto `open_hand` | emoji 3️⃣, gesto `3_fingers` |
| `cuatro` | emoji 🖐️, gesto `open_hand` | emoji 4️⃣, gesto `4_fingers` |
| `amor` (TE AMO) | gesto `shaka` | gesto `i_love_you` (el signo ILY real) |
| `ok` | gesto `fist` | gesto `ok` (pinza pulgar-índice) |
| `hola` / `adios` | gesto estático `open_hand` | `open_hand` + detección de movimiento de muñeca (≥2 reversals, amplitud > 0.04) |

- Badges en español via `HO.gestureLabel`.
- Transición CSS `opacity 0.15s, color 0.15s` en `.ms-gesture-badge` — elimina parpadeo por fotograma.
- Filtro `confidence ≥ 0.6`.

### GestiEdu (`app/static/js/gestiedu.js`)

- `FINGER_EMOJI[3] = '3️⃣'`, `FINGER_EMOJI[4] = '4️⃣'` (corrección de emojis 🤟/🖖 que eran erróneos).
- Filtro `confidence ≥ 0.6`.
- Insignia de conexión (🟢/🟡/⚫) en la nav, conectada a `HO.HandSocket.onStatus`.
- `.q-visual` usa `clamp(2rem, 6vw, 4rem)` — sin desbordamiento en pantallas pequeñas.
- `.question-card` con `min-height: 220px` — sin saltos de layout entre tipos de pregunta.

### AttendEye (`app/static/js/attendeye.js`)

- Migrado a `HO.HandSocket` en ambos modos (lista de asistencia y participación).
- Badges de gesto en español via `HO.gestureLabel`.
- `confidentHands(data)` filtra manos con `confidence < 0.6`.

### MotivaSign nav

- Insignia de conexión (🟢/🟡/⚫) añadida, conectada a `HO.HandSocket.onStatus`.

---

## Archivos modificados

- `app/static/js/virtualpainter.js`
- `app/static/js/airpiano.js`
- `app/static/js/motivasign.js`
- `app/static/js/gestiedu.js`
- `app/static/js/attendeye.js`
- `app/static/css/gestiedu.css`
- `app/static/css/motivasign.css`
- `app/static/gestiedu.html`
- `app/static/motivasign.html`
