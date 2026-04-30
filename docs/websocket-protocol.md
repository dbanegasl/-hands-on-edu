# WebSocket Protocol — HandsOnEdu

## Endpoint

```
ws://localhost:9876/ws/analyze
```

En producción con HTTPS/Nginx: `wss://tu-dominio.com/ws/analyze`

---

## Client → Server (Request)

JSON enviado por cada frame:

```json
{
  "frame": "<base64-encoded JPEG string>"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `frame` | string | Frame de video capturado del canvas del navegador, codificado en JPEG y luego en base64. **Sin prefijo** `data:image/jpeg;base64,` — solo los datos base64. |

**Recomendaciones de captura:**

| Parámetro | Valor recomendado | Notas |
|-----------|------------------|-------|
| Calidad JPEG | 0.6–0.7 | Balance entre precisión y ancho de banda |
| Resolución | 640×480 o 1280×720 | Mayor resolución mejora la detección pero aumenta latencia |
| Framerate | ≤ 30 fps | No enviar el siguiente frame hasta recibir respuesta |

---

## Server → Client (Response)

```json
{
  "hands_detected": 2,
  "hands": [
    {
      "handedness": "Right",
      "gesture": "pointing",
      "finger_count": 1,
      "landmarks": [
        {"x": 0.452, "y": 0.613, "z": -0.021},
        {"x": 0.461, "y": 0.589, "z": -0.019},
        ...
      ]
    }
  ]
}
```

### Campos de la respuesta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `hands_detected` | integer | Número de manos detectadas. Valores: 0, 1 o 2. |
| `hands` | array | Lista de objetos de mano (0, 1 o 2 elementos). |

### Campos por objeto de mano

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `handedness` | string | `"Right"` o `"Left"`, según MediaPipe. Relativo al frame **reflejado** (espacio selfie). |
| `gesture` | string | Gesto clasificado (ver tabla de gestos más abajo). |
| `finger_count` | integer | Número de dedos levantados (0–5). |
| `landmarks` | array[21] | Coordenadas normalizadas de los 21 landmarks de la mano. |

### Campos de cada landmark

| Campo | Tipo | Rango | Descripción |
|-------|------|-------|-------------|
| `x` | float | [0.0, 1.0] | Coordenada X normalizada al ancho del frame. |
| `y` | float | [0.0, 1.0] | Coordenada Y normalizada al alto del frame. Y=0 es la parte superior. |
| `z` | float | negativo–positivo | Profundidad relativa a la muñeca (landmark 0). Negativo = más cerca de la cámara. |

---

## Error Response

Devuelto cuando el frame no puede decodificarse o hay un error interno:

```json
{
  "error": "invalid_frame",
  "hands_detected": 0,
  "hands": []
}
```

Para errores de excepción del servidor:

```json
{
  "error": "descripción del error",
  "hands_detected": 0,
  "hands": []
}
```

---

## Referencia de Gestos

| Valor de `gesture` | Descripción | Condición de activación |
|--------------------|-------------|------------------------|
| `"fist"` | Puño cerrado | 0 dedos arriba, pulgar dentro |
| `"thumbs_up"` | Pulgar arriba | 0 dedos arriba, pulgar extendido lateralmente |
| `"pointing"` | Señalar con índice | Solo índice arriba, pulgar dentro |
| `"peace"` | Señal de paz / V | Índice + medio arriba; anular y meñique abajo |
| `"shaka"` | Shaka / aloha | Meñique arriba + pulgar extendido |
| `"open_hand"` | Mano abierta | 4 o más dedos levantados |
| `"1_fingers"` | 1 dedo (no índice) | 1 dedo arriba que no activa `pointing` |
| `"2_fingers"` | 2 dedos | 2 dedos arriba que no activa `peace` |
| `"3_fingers"` | 3 dedos | 3 dedos arriba |
| `"4_fingers"` | 4 dedos | 4 dedos arriba (pulgar dentro) |
| `"5_fingers"` | 5 dedos | 5 dedos arriba (capturado como `open_hand`) |

> **Nota**: El clasificador usa comparación geométrica de landmarks, no ML específico para gestos. Gestos ambiguos o transiciones rápidas pueden producir valores de `gesture` inestables durante unos frames.

---

## Referencia de Índices de Landmarks

21 landmarks por mano (MediaPipe Hand Landmarker):

| Índice | Nombre | Notas |
|--------|--------|-------|
| 0 | WRIST | Base de la mano |
| 1 | THUMB_CMC | |
| 2 | THUMB_MCP | |
| 3 | THUMB_IP | |
| 4 | THUMB_TIP | |
| 5 | INDEX_MCP | Nudillo del índice |
| 6 | INDEX_PIP | Articulación media del índice |
| 7 | INDEX_DIP | Articulación superior del índice |
| 8 | INDEX_TIP | ← Usado para dibujo/apuntado en VirtualPainter |
| 9 | MIDDLE_MCP | |
| 10 | MIDDLE_PIP | |
| 11 | MIDDLE_DIP | |
| 12 | MIDDLE_TIP | |
| 13 | RING_MCP | |
| 14 | RING_PIP | |
| 15 | RING_DIP | |
| 16 | RING_TIP | |
| 17 | PINKY_MCP | |
| 18 | PINKY_PIP | |
| 19 | PINKY_DIP | |
| 20 | PINKY_TIP | |

---

## Conexiones del Esqueleto (20 pares)

Usadas para dibujar el esqueleto de la mano sobre el canvas:

```js
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],         // pulgar
  [0,5],[5,6],[6,7],[7,8],         // índice
  [0,9],[9,10],[10,11],[11,12],    // medio
  [0,13],[13,14],[14,15],[15,16],  // anular
  [0,17],[17,18],[18,19],[19,20],  // meñique
  [5,9],[9,13],[13,17]             // cruz de la palma
];
```

---

## Ciclo de Vida de la Conexión

1. El cliente abre la conexión WebSocket a `ws://localhost:9876/ws/analyze`.
2. El servidor acepta inmediatamente (sin autenticación).
3. El cliente inicia el loop de captura dentro de `requestAnimationFrame`.
4. El servidor procesa cada frame de forma síncrona (uno a la vez por conexión).
5. Cuando el cliente desconecta (cierre de pestaña, navegación), el servidor captura `WebSocketDisconnect` silenciosamente.
6. Errores de procesamiento se devuelven como JSON de error; la conexión permanece abierta.

---

## Notas de Rendimiento

- El servidor procesa frames secuencialmente — no enviar el siguiente frame antes de recibir la respuesta.
- Usar un flag booleano `processing` en el cliente para evitar acumulación de frames en cola.
- Latencia típica: **30–80 ms** por frame dependiendo del hardware del servidor.
- Enviar a la velocidad del framerate de la webcam (máx 30 fps) pero omitir si la respuesta anterior aún no llegó.

```js
// Patrón recomendado en el cliente
let processing = false;

ws.onmessage = (evt) => {
  processing = false;
  const data = JSON.parse(evt.data);
  // procesar data.hands...
};

function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!processing && ws.readyState === WebSocket.OPEN) {
    processing = true;
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    const b64 = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
    ws.send(JSON.stringify({ frame: b64 }));
  }
}
```
