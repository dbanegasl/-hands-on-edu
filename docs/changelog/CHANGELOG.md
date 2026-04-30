# Changelog — HandsOnEdu

> Todos los cambios notables de este proyecto serán documentados en este archivo.
>
> El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/),
> y este proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

---

## [Sin publicar]

### Añadido

- **REQ-001** — Suite completa de tests unitarios e integración (`pytest`, `pytest-asyncio`, `httpx`), con objetivo de cobertura ≥ 80% en `app/core/` y `app/main.py`.
- **REQ-002** — Feedback de audio en GestiEdu y MotivaSign usando Web Audio API (sin dependencias externas): tonos de acierto, error, cuenta regresiva, confirmación de gesto; control de mute global.
- **REQ-003** — Exportación PDF del reporte de asistencia en AttendEye con `jsPDF` + `jsPDF-AutoTable`: encabezado institucional UNAE, tabla de asistencia, resumen y campo de firma del docente.
- **REQ-004** — Deshacer/Rehacer (Ctrl+Z / Ctrl+Y) en VirtualPainter: stack de historial de hasta 30 snapshots `ImageData`, botones en toolbar con estado disabled dinámico, gesto alternativo (palma 2s).
- **REQ-005** — Persistencia de sesiones con SQLite + SQLAlchemy async: tablas `sessions`, `gestiedu_results`, `attendeye_records`, `motivasign_progress`; volumen Docker `./data:/app/data`.
- **REQ-006** — Editor de preguntas para docentes en GestiEdu: ruta `/gestiedu/editor` protegida con PIN, CRUD completo de preguntas, carga dinámica vía `GET /api/gestiedu/questions`.
- **REQ-007** — Dashboard del docente en `/dashboard`: cards de resumen por módulo, historial de sesiones con filtros, gráfica de progreso semanal con Chart.js, exportación CSV.
- **REQ-008** — Autenticación básica con JWT: roles `teacher` / `student`, contraseñas hasheadas con bcrypt, tokens con expiración de 8h, middleware en rutas protegidas.
- **REQ-009** — Integración real con Moodle LMS: implementación de `MoodleClient` con Moodle REST API, sincronización automática de notas y asistencia, variables de entorno `MOODLE_URL` / `MOODLE_TOKEN`.
- **REQ-010** — Clasificador ML de gestos personalizado: pipeline de recolección de datos, entrenamiento con `MLPClassifier` (scikit-learn), exportación `.pkl`, integración en `HandTracker` con fallback a heurísticas.
- **REQ-011** — Pipeline CI/CD con GitHub Actions: workflow `ci.yml` (tests + lint + docker build en cada push/PR), workflow `cd.yml` (deploy automático en tags `v*.*.*`), badge de CI en README.

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

[Sin publicar]: https://github.com/OWNER/handsonedu/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/handsonedu/releases/tag/v0.1.0
