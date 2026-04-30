# Changelog — HandsOnEdu

> Todos los cambios notables de este proyecto serán documentados en este archivo.
>
> El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/),
> y este proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

---

## [Sin publicar]

### Añadido

- **REQ-005** — Persistencia de sesiones con SQLite + SQLAlchemy async: tablas `sessions`, `gestiedu_results`, `attendeye_records`, `motivasign_progress`; volumen Docker `./data:/app/data`.
- **REQ-006** — Editor de preguntas para docentes en GestiEdu: ruta `/gestiedu/editor` protegida con PIN, CRUD completo de preguntas, carga dinámica vía `GET /api/gestiedu/questions`.
- **REQ-007** — Dashboard del docente en `/dashboard`: cards de resumen por módulo, historial de sesiones con filtros, gráfica de progreso semanal con Chart.js, exportación CSV.
- **REQ-008** — Autenticación básica con JWT: roles `teacher` / `student`, contraseñas hasheadas con bcrypt, tokens con expiración de 8h, middleware en rutas protegidas.
- **REQ-009** — Integración real con Moodle LMS: implementación de `MoodleClient` con Moodle REST API, sincronización automática de notas y asistencia, variables de entorno `MOODLE_URL` / `MOODLE_TOKEN`.
- **REQ-010** — Clasificador ML de gestos personalizado: pipeline de recolección de datos, entrenamiento con `MLPClassifier` (scikit-learn), exportación `.pkl`, integración en `HandTracker` con fallback a heurísticas.
- **REQ-011** — Pipeline CI/CD con GitHub Actions: workflow `ci.yml` (tests + lint + docker build en cada push/PR), workflow `cd.yml` (deploy automático en tags `v*.*.*`), badge de CI en README.

---

## [0.5.0] — 2026-04-30

### Añadido

- **Deshacer / Rehacer en VirtualPainter** (`REQ-004`) — historial completo de trazos con Ctrl+Z / Ctrl+Y:
  - **Botones ↩ Deshacer / ↪ Rehacer** en la barra de herramientas; se deshabilitan automáticamente cuando el stack correspondiente está vacío (`disabled` + `opacity: 0.35`).
  - **Atajos de teclado**: `Ctrl+Z` (deshacer), `Ctrl+Y` y `Ctrl+Shift+Z` (rehacer).
  - **Stack de historial con límite de 30 snapshots** (`ImageData` del canvas completo, ~1.2 MB c/u → máx ~36 MB): usa `undoStack[]` y `redoStack[]`; el stack redo se vacía automáticamente al iniciar un nuevo trazo.
  - **Captura de snapshot al inicio del trazo** (transición de modo `pause`/`select` → `draw`/`erase`), garantizando que cada undo revierte exactamente un trazo completo.
  - **Estado inicial guardado**: al arrancar la sesión se empuja el canvas en blanco a `undoStack`, permitiendo deshacer hasta canvas vacío.
  - **Gesto de palma alternativo** (para tabletas sin teclado): palma abierta sostenida 2 segundos sin hover sobre color → ejecuta undo; anillo de progreso SVG animado (`#vp-palm-ring`) con cuenta regresiva visual centrado en la parte inferior del canvas.
  - **`clearCanvas()` guarda snapshot** antes de borrar, permitiendo deshacer una limpieza accidental con Ctrl+Z.
  - Guía de gestos actualizada con el nuevo gesto de deshacer.

---

## [0.4.0] — 2026-04-30

### Añadido

- **Exportación PDF del reporte de asistencia** (`REQ-003`) — generación 100% frontend, sin peticiones al backend:
  - **jsPDF 2.5.1** + **jsPDF-AutoTable 3.8.2** cargados desde CDN de Cloudflare.
  - Botón **"📄 Exportar PDF"** en la pantalla de resultados de AttendEye (habilitado solo cuando hay ≥ 1 estudiante registrado).
  - **Modal** con campo de nombre del docente: validación de campo requerido, soporte Enter/Escape, cierre al hacer click fuera del card.
  - Contenido del PDF generado:
    1. Encabezado institucional UNAE con franja azul.
    2. Box de metadatos: docente, nombre de clase, fecha y hora completa.
    3. Cards de resumen: Presentes (verde) / Ausentes (rojo) / % Asistencia (azul).
    4. Tabla de asistencia con colores por estado (`Presente` verde / `Ausente` rojo / `Omitido`), filas alternadas, encabezado azul.
    5. Campo de firma del docente + timestamp de generación.
  - Nombre del archivo: `asistencia-YYYY-MM-DD.pdf`.
  - Estilos `.ae-modal-*` añadidos a `attendeye.css`.

### Cambiado

- `docs/requirements/INDEX.md`: REQ-003 → ✅ Hecho.
- `docs/requirements/REQ-003-pdf-export-attendeye.md`: estado → ✅ Hecho.

---

## [0.3.0] — 2026-04-30

### Añadido

- **Feedback de audio en GestiEdu y MotivaSign** (`REQ-002`) — sonidos programáticos con Web Audio API (0 assets externos, funciona offline):
  - `app/static/js/audio.js`: clase `AudioFeedback` con 7 sonidos nombrados (`ding`, `buzz`, `tick`, `fanfare`, `pop`, `chime`, `beep`), lazy `AudioContext` (cumple autoplay policy), soporte `prefers-reduced-motion` (volumen 20% por defecto).
  - **GestiEdu**: `ding` (respuesta correcta), `buzz` (incorrecta), `tick` cada 600 ms durante el hold-arc de confirmación, `fanfare` (Do-Mi-Sol) al mostrar resultados finales.
  - **MotivaSign**: `pop` (gesto confirmado), `beep` suave (gesto incorrecto), `chime` al terminar el desafío.
  - Botón 🔊/🔇 en el header de GestiEdu y MotivaSign; estado persiste en `localStorage['handsonedu_audio_muted']`.
  - Estilos `.ge-btn-mute` / `.ms-btn-mute` añadidos a `gestiedu.css` y `motivasign.css`.

### Cambiado

- `docs/requirements/INDEX.md`: REQ-002 → ✅ Hecho.
- `docs/requirements/REQ-002-audio-feedback.md`: estado → ✅ Hecho.

---

### Añadido

- **Suite de tests unitarios e integración** (`REQ-001`) — 41 tests, todos pasando en < 0.25 s:
  - `tests/conftest.py`: fixtures compartidas (`tracker`, `client`, `black_frame_b64`), clase `Lm` mock de landmark, 6 helpers de landmarks por gesto (`fist`, `thumbs_up`, `pointing`, `peace`, `shaka`, `open_hand`).
  - `tests/test_hand_tracker.py` (20 tests): cobertura completa de `count_raised_fingers()`, `detect_gesture()` (7 gestos + fallthrough cases) y `get_finger_tip()`.
  - `tests/test_main.py` (21 tests): endpoint `/health`, 6 rutas HTML, WebSocket `/ws/analyze` (sin manos, una mano con estructura completa, dos manos, frame inválido, múltiples frames en una conexión).
  - Cobertura final: **93% en `app/core/hand_tracker.py`** y **93% en `app/main.py`** (objetivo era ≥ 80%).
  - Sin cámara, sin modelo MediaPipe real, sin red — `HandLandmarker` mockeado en `conftest.py`.
- `requirements-dev.txt`: dependencias de desarrollo (`pytest>=8.0`, `pytest-asyncio>=0.23`, `pytest-cov>=5.0`).
- `pytest.ini`: configuración mínima (`testpaths = tests`).
- `docker-compose.yml`: volúmenes `./tests:/app/tests` y `./pytest.ini:/app/pytest.ini` para desarrollo en caliente sin rebuild.

### Cambiado

- Versión de la API actualizada a `0.2.0` (`app/main.py`, endpoint `/health`).
- `docs/requirements/INDEX.md`: REQ-001 marcado como ✅ Hecho.
- `docs/requirements/REQ-001-unit-tests.md`: estado actualizado a ✅ Hecho.

---

## [0.1.0] — 2026-04-30

### Añadido

- **Landing page** principal (`index.html`) con navegación a los 4 módulos educativos y acceso al Testing Lab.
- **Testing Lab** con 6 modos de prueba interactiva: detección de gestos en tiempo real, conteo de dedos, tracking de punta de dedo, visualización de landmarks, modo espejo, modo depuración de landmarks.
- **Módulo GestiEdu** — evaluaciones gamificadas por gestos de mano: 10 preguntas con 4 opciones, respuesta mediante gesto (pulgar arriba, paz, señalando, puño), contador de puntos, tiempo límite por pregunta, pantalla de resultados con calificación 0–10.
- **Módulo MotivaSign** — aprendizaje de lenguaje de señas: reconocimiento de signos básicos, sistema de niveles progresivos, retroalimentación visual instantánea, modo de práctica libre.
- **Módulo AttendEye** — registro de asistencia por reconocimiento gestual: check-in con gesto de mano, lista de asistencia en tiempo real, reporte de sesión con conteo de presentes/ausentes.
- **Módulo VirtualPainter** — dibujo en realidad aumentada: trazado con punta del dedo índice sobre feed de cámara, selección de color por zona de pantalla, modo eraser, botón de limpiar lienzo.
- **Documentación técnica** (9 archivos en `docs/`): arquitectura del sistema, guía de desarrollo, protocolo WebSocket, integración Moodle, guía de despliegue, documentación por módulo.
- **Integración MediaPipe Hand Landmarker** (`hand_tracker.py`): detección de 21 landmarks por mano, clasificación de 7 gestos base (`fist`, `open_hand`, `pointing`, `peace`, `thumbs_up`, `ok`, `none`), conteo de dedos levantados, cálculo de coordenadas de punta de dedo.
- **Backend WebSocket en tiempo real** (`/ws/analyze`): recepción de frames JPEG desde el navegador, procesamiento con MediaPipe, respuesta JSON con gesture + fingers + landmarks + coordinates en < 100ms.
- **Backend FastAPI** con endpoints: `GET /health`, `GET /` (sirve landing), rutas estáticas para templates y assets.
- **Configuración Docker**: `Dockerfile` con Python 3.11-slim, `docker-compose.yml` expuesto en puerto **9876**, variables de entorno configurables.
- **Captura de webcam** (`webcam.js`): inicialización `getUserMedia`, captura de frames a intervalo configurable, envío por WebSocket, visualización del feed con overlay de landmarks.
- **Documentación de requisitos**: `docs/requirements/INDEX.md` + 11 REQs numerados con criterios de aceptación y esfuerzo estimado.
- **Registro de deuda técnica**: `docs/technical-debt/TECHNICAL-DEBT.md` con 10 items identificados (2 ya resueltos).
- **Changelog**: este archivo (`docs/changelog/CHANGELOG.md`) y notas de release `docs/changelog/v0.1.0.md`.

### Corregido

- **Bug de coordenadas espejadas** (`webcam.js`): el feed de cámara se mostraba sin efecto espejo pero las coordenadas de landmarks se calculaban como si estuviera espejado, causando que los gestos de mano izquierda se detectaran como mano derecha. Aplicada transformación `scaleX(-1)` consistente.
- **Condiciones duplicadas en `detect_gesture()`** (`hand_tracker.py`, commit `ed62301`): existían dos bloques `if` con idéntica condición para el gesto `open_hand`, causando que el segundo bloque nunca se ejecutara. Consolidados en una única condición correcta.
- **URL de WebSocket hardcodeada** (`webcam.js` / módulos JS, commit `ed62301`): la URL `ws://localhost:9876/ws/analyze` estaba hardcodeada, haciendo imposible acceder desde otros dispositivos en la misma red. Reemplazada por URL dinámica: `` `ws://${window.location.hostname}:9876/ws/analyze` ``.
- **Dependencia de Docker incorrecta** (`Dockerfile`): `libgl1-mesa-glx` no está disponible en Debian Bookworm (Python 3.11-slim base). Reemplazado por `libgl1` + `libgles2` + `libegl1` para soporte OpenCV correcto.

### Seguridad

- ⚠️ **Sin autenticación implementada** en esta versión: todos los endpoints son accesibles públicamente. No desplegar en producción institucional sin implementar REQ-008 (autenticación básica). Ver `docs/technical-debt/TECHNICAL-DEBT.md#td-003` para detalles.

---

[Sin publicar]: https://github.com/dbanegasl/-hands-on-edu/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/dbanegasl/-hands-on-edu/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/dbanegasl/-hands-on-edu/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/dbanegasl/-hands-on-edu/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dbanegasl/-hands-on-edu/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dbanegasl/-hands-on-edu/releases/tag/v0.1.0
