# VirtualPainter — Dibujo AR en el Aire

## Propósito

Módulo de expresión creativa y motricidad fina. El usuario dibuja sobre la imagen de la cámara en tiempo real usando el dedo índice. Útil para clases de arte, ejercicios de trazado para educación inicial, y demostraciones de realidad aumentada.

## URL

`http://localhost:9876/virtualpainter`

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/static/virtualpainter.html` | Layout AR con 3 canvas apilados + toolbar |
| `app/static/css/virtualpainter.css` | Tema studio oscuro, cursor adaptativo |
| `app/static/js/virtualpainter.js` | Motor de dibujo con 4 modos gestuales |

---

## Arquitectura de Canvas (3 capas)

```
<div id="vp-canvas-area">           ← posición fija, llena la pantalla
  <video> (hidden)                   ← fuente de video (invisible al usuario)
  <canvas id="vp-cam-canvas">        ← video reflejado + esqueleto de mano   (z-index: 1)
  <canvas id="vp-draw-canvas">       ← trazos del dibujo (transparente AR)   (z-index: 2)
  <div id="vp-ui-overlay">           ← cursor, badge de modo                 (z-index: 3)
</div>
```

- **`vp-cam-canvas`**: se repinta cada frame con el video reflejado y el esqueleto de la mano.
- **`vp-draw-canvas`**: solo recibe trazos y **preserva el dibujo entre frames** (no se borra en el loop).
- El borrado usa `globalCompositeOperation = 'destination-out'` para borrado real (no pintado blanco).

---

## Modos de Gesto

| Gesto detectado | Modo activo | Acción |
|----------------|-------------|--------|
| `pointing` / `1_fingers` | ✏️ **DRAW** | Dibuja línea continua desde la punta del índice (landmark 8) |
| `peace` / `2_fingers` | 🧹 **ERASE** | Borra en radio 30 px alrededor del índice |
| `fist` / `thumbs_up` / otros | ✋ **PAUSE** | Levanta el lápiz — no dibuja |
| `open_hand` / `5_fingers` | 🎨 **SELECT** | Apunta a un color en la toolbar para seleccionarlo por dwell |

---

## Algoritmo de Dibujo

Por cada frame recibido por WebSocket:

```
1. Dibujar video reflejado en vp-cam-canvas
2. Si hay mano detectada, dibujar esqueleto sobre vp-cam-canvas
3. Obtener landmark[8] (INDEX_TIP) → coordenadas normalizadas
4. Suavizar: smoothX = smoothX * 0.5 + raw.x * 0.5  (EMA, factor=0.5)
             smoothY = smoothY * 0.5 + raw.y * 0.5
5. Según drawMode:
   DRAW:   ctx.lineTo(prevPoint → currentPoint) en vp-draw-canvas
   ERASE:  ctx.arc(currentPoint, r=30) con destination-out
   SELECT: checkColorDwell(currentPoint)
   PAUSE:  prevPoint = null  ← rompe la línea (siguiente DRAW comenzará nueva)
6. Actualizar posición del cursor div y badge de modo
```

---

## Selección de Color por Gesto (Dwell)

En modo **SELECT** (`open_hand`), el sistema compara la posición del índice (convertida a coordenadas de pantalla) con los `getBoundingClientRect()` de cada swatch de color en la toolbar. Si el índice permanece sobre el mismo color por **1000 ms**, el color queda seleccionado automáticamente y el modo vuelve a DRAW.

---

## Paleta de Colores

| Nombre | Hex |
|--------|-----|
| Rojo | `#ef4444` |
| Naranja | `#f97316` |
| Amarillo | `#facc15` |
| Verde | `#22c55e` |
| Azul | `#3b82f6` |
| Violeta | `#a855f7` |
| Rosa | `#ec4899` |
| Blanco | `#ffffff` |
| Negro | `#1e293b` |

---

## Tamaños de Brocha

| Botón | Tamaño (px) | Uso |
|-------|-------------|-----|
| S | 3 | Trazo fino |
| M | 6 | Trazo medio (por defecto) |
| L | 12 | Trazo grueso |
| XL | 24 | Marcador |

---

## Modos de Fondo

| Modo | Comportamiento |
|------|---------------|
| **AR (por defecto)** | `vp-draw-canvas` es transparente — los trazos flotan sobre el video real |
| **Pizarrón blanco** | `vp-draw-canvas` tiene fondo blanco; el canvas de video se oculta |

---

## Guardar Dibujo

El botón 💾 crea un canvas temporal que combina `vp-cam-canvas` (frame actual de video) + `vp-draw-canvas` (trazos) y descarga el resultado como PNG con timestamp. En modo pizarrón, fondo blanco + trazos.

---

## Variables de Configuración (`virtualpainter.js`)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `WS_URL` | `ws://localhost:9876/ws/analyze` | Endpoint WebSocket |
| `DWELL_TIME` | 1000 ms | Tiempo de hover sobre swatch para selección de color |
| Smooth factor | 0.5 | Coeficiente EMA para suavizado de coordenadas del índice |
| Eraser radius | 30 px | Radio de borrado fijo |
| Default brush size | 6 px | Tamaño M seleccionado al iniciar |

---

## Known Limitations

- El suavizado EMA (factor 0.5) reduce jitter pero introduce un lag mínimo de ~1–2 frames en movimientos rápidos.
- En hardware lento, la latencia WebSocket puede causar trazos discontinuos.
- No hay función de deshacer (Ctrl+Z) — previsto para una próxima versión.
- La selección de color por gesto requiere que la toolbar sea visible (no funciona si está cubierta o en pantalla completa pura).
- El trazo no tiene presión variable — todos los puntos tienen el mismo grosor de brocha.
