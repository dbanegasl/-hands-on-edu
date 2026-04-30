# Arquitectura del Sistema — HandsOnEdu

## Visión General

HandsOnEdu sigue una arquitectura modular en capas:

```
┌──────────────────────────────────────────────────────────────────┐
│                        CAPA BROWSER                              │
│                                                                  │
│  getUserMedia() ──► <video>                                      │
│       │                                                          │
│       ▼                                                          │
│  drawImage(video) mirrored ──► <canvas> (video-canvas)          │
│       │                              │                           │
│       │                         toDataURL('image/jpeg', 0.7)    │
│       │                              │                           │
│       ▼                              ▼                           │
│  overlay canvas ◄── render landmarks  JSON {frame: base64}      │
│  (skeleton + UI state)               │ WebSocket                 │
└──────────────────────────────────────┼───────────────────────────┘
                                       │ ws://localhost:9876/ws/analyze
┌──────────────────────────────────────┼───────────────────────────┐
│                    CAPA FASTAPI       │                           │
│                                       ▼                          │
│  GET /gestiedu, /motivasign, ...   WebSocket handler             │
│  GET /health                        (app/main.py)                │
│  StaticFiles /static                  │                          │
│                                       │ base64_decode → JPEG     │
│                                       │ cv2.imdecode → BGR array │
└───────────────────────────────────────┼──────────────────────────┘
                                        │
┌───────────────────────────────────────┼──────────────────────────┐
│                    CAPA CORE          │                           │
│                                       ▼                          │
│                              HandTracker.detect(frame, ts_ms)    │
│                                       │                          │
│                              MediaPipe Tasks API                 │
│                              hand_landmarker.task (~7.8 MB)      │
│                                       │                          │
│                              21 landmarks × N manos              │
│                              detect_gesture() + count_fingers()  │
└───────────────────────────────────────┼──────────────────────────┘
                                        │ JSON response
┌───────────────────────────────────────┼──────────────────────────┐
│               CAPA INTEGRACIÓN        │                           │
│                                       │                           │
│   MoodleClient (httpx async)          │ (opcional, por módulo)   │
│   core_grades_update_grades           │                           │
│   core_completion_update_activity...  │                           │
└───────────────────────────────────────┴──────────────────────────┘
```

## Descripción de Capas

### Capa Browser (Frontend)

Cada módulo implementa el mismo patrón de captura y envío:

1. **`getUserMedia()`** — solicita acceso a la webcam con resolución preferida 640×480 o 1280×720.
2. **Canvas pipeline** — el frame del video se dibuja *reflejado* (efecto selfie) sobre `<canvas>`:
   ```js
   ctx.translate(w, 0);
   ctx.scale(-1, 1);
   ctx.drawImage(video, 0, 0, w, h);
   ```
3. **WebSocket client** — el canvas codificado como JPEG base64 se envía por WebSocket.
4. **Overlay rendering** — al recibir la respuesta, los landmarks se dibujan sobre un segundo canvas superpuesto (mismo tamaño).

### Capa FastAPI (`app/main.py`)

- Sirve archivos estáticos desde `app/static/` vía `StaticFiles`.
- Expone una ruta GET por módulo (`/gestiedu`, `/motivasign`, etc.) que devuelve el HTML.
- El endpoint `GET /health` retorna `{"status": "ok", "version": "0.1.0"}`.
- El endpoint `WebSocket /ws/analyze` es **compartido por todos los módulos**. Acepta frames, los pasa a `HandTracker`, y devuelve el JSON de resultados.
- Una sola instancia global `_tracker = HandTracker(num_hands=2)` es reutilizada por todas las conexiones para evitar el costo de inicialización de MediaPipe.

### Capa Core (`app/core/hand_tracker.py`)

Wrapper delgado sobre la MediaPipe Tasks API:

- Inicializa `HandLandmarker` en modo `VIDEO` (requiere timestamps monótonos crecientes).
- El timestamp se calcula como `int((time.time() - _start_time) * 1000)` desde el inicio del servidor.
- Expone tres métodos públicos: `detect()`, `count_raised_fingers()`, `detect_gesture()`.

### Capa de Integración (`app/integrations/moodle/rest_api.py`)

- `MoodleClient` es un cliente HTTP async (httpx) para la REST API de Moodle.
- Lee `MOODLE_URL` y `MOODLE_TOKEN` desde variables de entorno.
- Actualmente es invocado manualmente desde módulos; en futuras versiones puede ser llamado desde endpoints REST dedicados.

---

## Flujo WebSocket Detallado

```
Browser                                  FastAPI Backend
  |                                            |
  | getUserMedia() → video element             |
  | draw mirrored frame on canvas              |
  | canvas.toDataURL('image/jpeg', 0.7)        |
  | ──── JSON { "frame": "<base64>" } ────────>|
  |                                            | base64.b64decode() → bytes
  |                                            | np.frombuffer() → uint8 array
  |                                            | cv2.imdecode() → BGR numpy array
  |                                            | HandTracker.detect(frame, timestamp_ms)
  |                                            | MediaPipe → 21 landmarks × N hands
  |                                            | detect_gesture() + count_raised_fingers()
  |                                            | _build_response() → dict
  |<─── JSON { hands_detected, hands: [...] } ─|
  | draw skeleton on overlay canvas            |
  | update game/module state machine           |
  | (set processing = false)                   |
  | next requestAnimationFrame iteration...    |
```

**Control de flujo**: cada cliente usa un flag booleano `processing`. El siguiente frame no se envía hasta recibir la respuesta del anterior. Esto evita que la cola del WebSocket se sature en hardware lento.

---

## Sistema de Coordenadas — Efecto Espejo

El video se dibuja en el canvas con reflejo horizontal (efecto selfie) para que el usuario vea su propia imagen como en un espejo. Esto tiene una implicación importante en cómo se usan las coordenadas de los landmarks:

| Situación | Fórmula correcta |
|-----------|-----------------|
| Dibujar landmark en canvas | `px = lm.x * canvas.width` |
| Dibujar landmark en canvas | `py = lm.y * canvas.height` |
| **NO usar** | ~~`px = (1 - lm.x) * canvas.width`~~ |

**¿Por qué?**

1. El canvas que se envía al backend **ya contiene el frame reflejado**.
2. MediaPipe calcula los landmarks sobre ese frame reflejado.
3. Por lo tanto, las coordenadas `lm.x` ya están en el espacio del frame reflejado.
4. Al renderizar sobre el mismo canvas (que también está reflejado), se usa `lm.x` directamente.
5. Usar `1 - lm.x` causaría un doble reflejo → los landmarks aparecerían en el lado opuesto.

---

## API de HandTracker

### `HandTracker(num_hands=2, mode="video")`

Inicializa el landmarker de MediaPipe.

- `num_hands`: máximo de manos a detectar (1 o 2).
- `mode`: `"video"` (requiere timestamps monótonos) o `"image"` (sin estado temporal).

### `detect(frame_bgr, timestamp_ms) → HandLandmarkerResult`

Ejecuta la detección sobre un frame BGR de NumPy.

- Convierte BGR → RGB internamente antes de pasar a MediaPipe.
- Retorna un `HandLandmarkerResult` con `.hand_landmarks` (lista de listas de 21 `NormalizedLandmark`) y `.handedness` (lista de clasificaciones Left/Right).

### `get_finger_tip(landmarks, finger=INDEX_TIP, width=640, height=480) → (int, int)`

Convierte el landmark de una punta de dedo de coordenadas normalizadas a píxeles.

### `count_raised_fingers(landmarks) → int`

Cuenta dedos levantados usando comparación de coordenada Y entre TIP y PIP:

- Para los 4 dedos largos (índice, medio, anular, meñique): `tip.y < pip.y` → dedo arriba (en coordenadas normalizadas, Y crece hacia abajo).
- Para el pulgar: `abs(THUMB_TIP.x - THUMB_MCP.x) > 0.08` → pulgar extendido lateralmente.

Retorna un entero 0–5.

### `detect_gesture(landmarks) → str`

Clasifica la mano en un gesto nombrado basándose en qué dedos están levantados:

| Condición | Gesto retornado |
|-----------|----------------|
| 0 dedos + pulgar dentro | `"fist"` |
| 0 dedos + pulgar fuera | `"thumbs_up"` |
| Solo índice arriba + pulgar dentro | `"pointing"` |
| Índice + medio arriba (no anular, no meñique) | `"peace"` |
| Solo meñique + pulgar fuera | `"shaka"` |
| 4 dedos arriba (cualquier combinación) | `"open_hand"` |
| Cualquier otro conteo N | `"N_fingers"` (ej: `"3_fingers"`) |

**Nota**: Las condiciones de `open_hand` tienen redundancia en el código actual (se evalúan múltiples ramas con la misma condición). El comportamiento observable es correcto: cualquier postura con 4+ dedos devuelve `"open_hand"`.

### `close()`

Libera el `HandLandmarker` de MediaPipe. Llamar al apagar la aplicación.

---

## Decisiones de Diseño

| Decisión | Alternativa considerada | Razón |
|----------|------------------------|-------|
| WebSocket para video | HTTP polling | Menor latencia, bidireccional, sin overhead de polling ni cabeceras HTTP repetidas |
| Browser captura webcam | Docker device passthrough (`/dev/video*`) | Funciona en cualquier OS (Linux, macOS, Windows) sin configuración extra |
| `opencv-python-headless` | `opencv-python` | La versión headless no tiene dependencias de display (X11/Qt), esencial en contenedores |
| Modelo descargado en `docker build` | Montado como volumen | Un volumen vacío en el primer run sobreescribiría el modelo; baked-in garantiza disponibilidad |
| `libgl1` | `libgl1-mesa-glx` | `libgl1-mesa-glx` fue eliminado en Debian Trixie (base de `python:3.11-slim`); `libgl1` es el reemplazo correcto |
| Una instancia global de `HandTracker` | Instancia por conexión WebSocket | MediaPipe es costoso de inicializar (~1–2 s); además el modo VIDEO requiere timestamps monótonos continuos |
| Vanilla JS (sin framework) | React, Vue, Svelte | Zero build step, carga instantánea, fácil de mantener por docentes con conocimiento básico de JS |
| FastAPI | Flask, Django | Async nativo (ideal para WebSockets), OpenAPI automático, tipado con Pydantic |
