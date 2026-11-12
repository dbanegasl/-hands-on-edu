# Changelog — HandsOnEdu

> Todos los cambios notables de este proyecto serán documentados en este archivo.
>
> El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/),
> y este proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

---

## [Sin publicar]

### Añadido

- **REQ-012** — Módulo **AirPiano** (piano virtual gestual): nueva ruta `/airpiano`, frontend completo con `airpiano.html`, `css/airpiano.css` y `js/airpiano.js`; sintetizador polifónico `js/audio-synth.js` (4 timbres: piano, marimba, synth, cuerdas) con envelopes ADSR por instrumento y vibrato LFO en cuerdas; detección de 5 dedos × 2 manos como controladores independientes con histéresis Y (0.65 entrar / 0.55 salir) anti-jitter; 4 escalas (Do mayor, La menor, pentatónica, blues) y 4 modos (libre, asignado, tutorial, canción) con scoring; wheels laterales con dwell de 1.5s para selección gestual de escala (mano izq.) e instrumento (mano der.); oscilograma en vivo vía `AnalyserNode`, etiquetas de notas flotantes, highlight de tecla presionada; mute compartido con `audio.js`; liberación limpia de notas activas en `beforeunload`/`pagehide`; nueva card en la landing y tests de la ruta `/airpiano` añadidos a `test_main.py`.

---

## [0.13.0] — 2026-11-12

### Añadido

- **REQ-005** — Los módulos de gestos **guardan sus resultados**.
  - **GestiEdu** y **MotivaSign**: «¿Quién juega?» en la pantalla de inicio (perfiles compartidos con el Aula de Señas), partida guardada al terminar y **📜 Mis resultados**. MotivaSign guarda cada seña del desafío y la práctica libre.
  - **AttendEye**: historial por clase (tablas nuevas `attendance_sessions` y `attendance_records`, se crean solas al arrancar). La lista se guarda al terminar (registra si cada estudiante se marcó por gesto o a mano), la participación con *Guardar y terminar*; reutilizar la última lista de la clase, historial con CSV y borrado. API `/api/attendance` protegida con el token de administrador.
  - **Panel docente** (vista de instalación): tarjeta *Otros módulos* y partidas de los juegos en el detalle del estudiante.
- Helper compartido `js/ho-learning.js` (`HO.Learning`) + `css/ho-learning.css`, con pruebas en `tests/js/ho-learning.test.cjs`.

### Cambiado

- GestiEdu: el botón «Enviar a Moodle» (era un aviso sin efecto) pasa a ser *Mis resultados*.
- Los CSV del panel y de asistencia usan la zona horaria del navegador (`tz`) en lugar de UTC.

### Corregido

- AttendEye: la pantalla de resultados se veía debajo de la de configuración (la regla `display: flex` anulaba la ocultación).

---

## [0.12.0] — 2026-11-12

### Añadido

- **REQ-007** — **Panel docente** (`/panel`): progreso del curso en el Aula de Señas.
  - Desde Moodle (docente → *📊 Panel del curso* en el Aula) muestra solo ese curso; con el token de administrador, toda la instalación.
  - Tarjetas de resumen, estudiantes activos por semana, mapa de calor estudiante × unidad (mejor nota), señas con más dificultad, detalle por estudiante con dominio por seña y exportación CSV.
  - **Lista del curso por LTI NRPS** (Names and Role Provisioning): aparecen también quienes nunca abrieron la actividad. Nueva tabla `lti_contexts` (se crea sola al arrancar).
  - Estado de cada nota en la plataforma y **reintento** de envíos fallidos (`POST /api/panel/sessions/{id}/grade/retry`).
- **Guías de puesta en marcha** en `docs/onboarding/`: prueba local con Moodle, conexión del Moodle institucional y piloto, producción de contenido LSEC con intérprete, guía para docentes y problemas frecuentes.
- **Moodle 4.5 local para pruebas**: `docker-compose.moodle.yml` + `scripts/moodle-dev-setup.sh` (herramienta LTI, curso y usuarios listos). La integración LTI se probó de punta a punta contra Moodle 4.5.4.
- `docker-compose.prod.yml` (imagen inmutable, 2 workers, puerto solo en localhost) y `docs/deployment.md` reescrita (HTTPS con Caddy o Nginx, variables, copias de seguridad).

### Corregido

- Las evaluaciones que hace un docente en modo docente ya no se envían al libro de calificaciones.

---

## [0.11.0] — 2026-11-12

### Añadido

- **REQ-019** — Integración **LTI 1.3 / LTI Advantage** con Moodle (y cualquier LMS compatible):
  - Inicio de sesión único: `/lti/login` (OIDC) y `/lti/launch` validan el `id_token` firmado por la plataforma; el estudiante entra al Aula sin crear otra cuenta.
  - **Notas automáticas (AGS):** la mejor nota de la evaluación de la unidad llega sola al libro de calificaciones (0–100); el Aula muestra si se envió.
  - **Deep Linking:** el docente elige en `/lti/deeplink` qué unidades agrega al curso, cada una con su columna de calificación.
  - Claves de la herramienta en la BD y `GET /lti/jwks`; registro de plataformas (`/api/lti/platforms`, protegido con `ADMIN_TOKEN`) y página guiada `/lti/setup`.
  - Nueva variable `PUBLIC_BASE_URL`; dependencias `PyJWT[crypto]` y `python-multipart` (requiere `docker compose up --build`).
- El Aula abre siempre la unidad que asigna la actividad de la plataforma, aunque la ruta no haya llegado a ella.

---

## [0.10.0] — 2026-11-12

### Añadido

- **REQ-018** — **Aula de Señas** (`/aula`), el curso para estudiantes: ruta por unidades con desbloqueo progresivo, lecciones con retroalimentación en vivo (mantener la seña correcta 1,2 s), evaluaciones que aprueban la unidad con ≥ 70%, repaso espaciado de las señas con menor dominio o más tiempo sin practicar, y deletreo de palabras con el alfabeto manual (dígrafos CH, LL, RR y Ñ). Perfiles locales por nombre; todos los intentos se guardan en `/api/sessions/*`. Modo docente `?unlock=all`. Tarjeta en la landing.
- `app/static/js/ho-curriculum.js` (`HO.Curriculum`): lógica pedagógica pura (desbloqueo, repaso, cuestionarios, `HoldVerifier`) con tests en `node --test`.
- `GET /api/learners/{id}/sessions`: historial de sesiones con filtros `module`, `finished` y `limit`; las sesiones devuelven `details`.
- Catálogo: lista `spelling_words` y campo opcional `media` por seña, validados por `app/signs/catalog.py`.
- **REQ-020** — Videos de referencia generados con IA: documento de producción `docs/content/videos-ia-lsec.md` (4 avatares ficticios ecuatorianos, prompts de Nano Banana Pro y Omni para las 50 señas, lista de verificación del intérprete), generado por `scripts/gen_video_prompts.py` y comprobado en el CI. `media` exige `ai_generated` y admite `validated_by`/`validated_at`; el Aula y el Estudio muestran el aviso *🤖 Video generado con IA · ✔ Validado por intérprete* y los estudiantes solo ven videos validados.

### Corregido

- Borrar un estudiante desde el ORM intentaba dejar sus sesiones sin dueño (`NOT NULL constraint failed`); ahora se borran en cascada sesiones e intentos.

---

## [0.9.0] — 2026-11-11

Inicio de la nueva dirección del producto: **plataforma de enseñanza de lengua de señas (LSEC)** integrada con LMS.

### Añadido

- **REQ-016** — Detección de manos **en el navegador** con MediaPipe Tasks JS 0.10.35 (`app/static/js/ho-hands.js`): el video ya no sale del dispositivo. `HO.createHandSource()` en todos los módulos, con respaldo automático a `WS /ws/analyze` (`?engine=server` lo fuerza). Delegado adaptativo GPU/CPU (CPU con renderizador por software; cambio en caliente si la GPU es lenta). Bundle y WASM vendorizados en la imagen Docker (`/vendor/mediapipe/`) y modelo servido en `/models/`.
- **REQ-017** — Motor de reconocimiento de señas `app/static/js/ho-signs.js`: descriptores de forma de mano con retroalimentación didáctica en español, kNN sobre plantillas (también a dos manos), DTW para señas con movimiento y canonicalización diestro/zurdo. Calibrado con fotos reales de MediaPipe (`tests/fixtures/real_hands.json`). Ver `docs/sign-engine.md`.
- **REQ-017** — Catálogo **LSEC** (`app/content/lsec/catalog.json`): 50 señas (alfabeto dactilológico, números 1–10, saludos), 8 unidades, marcado como *borrador pendiente de validación* por intérpretes y la comunidad sorda.
- **REQ-017** — **Estudio de Señas** (`/signstudio`): catálogo, prueba en vivo con medidor y retroalimentación, grabación de plantillas estáticas y dinámicas, exportar e importar dataset. Tarjeta en la landing.
- **REQ-005 (base)** — Persistencia con SQLAlchemy 2.0 + SQLite (`DATABASE_URL`, volumen `./data`): estudiantes, sesiones, intentos por seña y plantillas. API `/api/learners`, `/api/sessions/*`, `/api/learners/{id}/progress` (dominio por seña con EWMA).
- **REQ-011 (CI)** — `.github/workflows/ci.yml`: pytest con cobertura ≥ 80%, `node --test` (paridad Python↔JS + motor de señas) y build de la imagen Docker.
- `ADMIN_TOKEN` (cabecera `X-Admin-Token`) protege la escritura de plantillas.

### Cambiado

- `app/main.py` dividido en routers (`app/api/pages.py`, `ws.py`, `signs.py`, `learning.py`); configuración centralizada en `app/config.py`.
- `WS /ws/analyze`: un JSON inválido o un cuadro > 2 MB responden `invalid_payload` sin cerrar la conexión; los errores internos ya no exponen el mensaje de la excepción. La respuesta incluye `engine`, `aspect` y `world_landmarks`.
- `mediapipe` fijado a `==0.10.35` (paridad con el bundle JS).
- Versión `0.9.0`.

### Corregido

- Las fechas de la API se devuelven siempre con zona horaria UTC (SQLite las perdía y el navegador las mostraba como hora local).
- CHANGELOG: retirada la lista anticipada de REQ-005…011 como "Añadido" cuando seguían pendientes.

---

## [0.8.0] — 2026-06-11

### Añadido

- **REQ-015** — Insignia de conexión (🟢/🟡/⚫) añadida a **GestiEdu** y **MotivaSign** (como ya tenían VirtualPainter y AirPiano), conectada al `onStatus` de `HO.HandSocket`.
- **REQ-015** — AirPiano: animación de fade-out de 120 ms al soltar una tecla, renderizada en el canvas de teclas.

### Cambiado

- **REQ-015** — GestiEdu: `.q-visual` usa `clamp(2rem, 6vw, 4rem)` para evitar desbordamiento en pantallas pequeñas; `.question-card` con `min-height: 220px` para evitar saltos de layout entre tipos de pregunta.
- **REQ-015** — MotivaSign: badge de gesto detectado con `transition: opacity 0.15s, color 0.15s` para suavizar el parpadeo por fotograma.
- **REQ-014** — Completada la migración de **todos los módulos** a `ho-common.js`: webcam, gestiedu, motivasign, virtualpainter, airpiano y attendeye. Eliminados ~450 líneas duplicadas de skeleton draw, mirror draw y boilerplate WS.
- Versión `0.8.0` en `APP_VERSION`.

---

## [0.7.0] — 2026-06-11

### Añadido

- **REQ-014** — Nueva librería compartida `app/static/js/ho-common.js` (namespace `window.HO`): `HO.drawSkeleton`, `HO.drawMirroredVideo`, `HO.HandSocket` (auto-reconexión exponencial, ping-pong, validación de forma JSON), `HO.GestureStabilizer`, `HO.OneEuro`, `HO.GESTURE_LABELS_ES`, `HO.gestureLabel`.
- **REQ-015** — VirtualPainter: debounce de modo 150 ms, filtro **One-Euro** en x/y para cursor suave, renderizado por puntos medios cuadráticos (sin gaps), snapshot de undo solo en transición idle→draw.
- **REQ-015** — AirPiano: filtro por confianza ≥ 0.7 y span de mano ≥ 0.09 normalizado contra falsos positivos; solo los dedos extendidos (`fingers_up`) pueden presionar teclas.
- **REQ-015** — MotivaSign: catálogo corregido (`tres→3_fingers`, `cuatro→4_fingers`, `amor→i_love_you`, `ok→ok`, `hola/adios→open_hand+wave`); detector de movimiento de muñeca para `hola`/`adios`; badges en español vía `HO.gestureLabel`.
- **REQ-015** — GestiEdu: emojis de dedo corregidos (`FINGER_EMOJI[3]=3️⃣`, `[4]=4️⃣`); filtro confianza ≥ 0.6.
- **REQ-015** — AttendEye: migrado a `HO.HandSocket` y `HO.gestureLabel` en modos lista de asistencia y participación.

---

## [0.6.0] — 2026-06-10

### Cambiado

- **REQ-013** — Robustez de detección (backend). Reescritura de la heurística de gestos en `app/core/hand_tracker.py` para que sea **invariante a la orientación**: cada dedo se decide por razón de distancias al wrist (`dist(tip,wrist) > 1.15·dist(pip,wrist)`) en lugar de `tip.y < pip.y`; el pulgar se ancla al `PINKY_MCP` (sin ramas por lateralidad). Corrige los gestos mal leídos al rotar la mano (p. ej. pulgar-arriba reportado como "2 dedos").

### Añadido

- **REQ-013** — Nuevos gestos `i_love_you` (pulgar+índice+meñique) y `ok` (pinza pulgar-índice); `open_hand` ahora exige 5 dedos y aparece `4_fingers` (antes inalcanzable).
- **REQ-013** — Umbrales de confianza en `HandLandmarkerOptions` (`detection=0.7`, `presence=0.6`, `tracking=0.6`) que eliminan falsos positivos de cara/antebrazo.
- **REQ-013** — `HandTracker` **por conexión** (timestamps monótonos propios; cierre en `finally`) y `GestureSmoother` por conexión (voto mayoritario ventana 5 / mediana de conteo) que elimina el parpadeo gesto-a-gesto.
- **REQ-013** — Campos aditivos en la respuesta WebSocket: `confidence`, `fingers_up` (dict por dedo) y `gesture_raw`; `gesture` pasa a ser el valor suavizado.
- **REQ-013** — Healthcheck en `docker-compose.yml` (**TD-010**), logging estructurado con logger `handsonedu` (**TD-009**), guardia de tasa en el WS (**TD-008**) y `APP_VERSION` único usado por `/health` y `FastAPI(version=...)`.
- **REQ-013** — Suite de tests reescrita: fixtures geométricas (`make_hand`) con rotación y tests parametrizados a 0/45/90/180/270°; tests de `GestureSmoother` y de los nuevos campos del WebSocket (111 tests).

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
    1. Encabezado institucional con franja azul.
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
