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

## [0.21.1] — 2026-11-12

### Añadido

- **[Kit del piloto](../onboarding/09-kit-piloto/README.md)** (onboarding 09):
  - calendario de 4 semanas y roles, con un seguimiento semanal de 15 minutos en el panel;
  - **guion de la clase guiada**: preparación el día anterior con `/diagnostico`, minuto a minuto y plan B;
  - **registro de incidencias** con categorías, gravedad y responsable, más la plantilla `incidencias.csv` para Excel;
  - **encuestas**: salida de la semana 1, estudiantes y entrevista a docentes;
  - **revisión del intérprete**: ¿acepta el sistema señas mal hechas?;
  - **informe final** con criterios de éxito acordados de antemano, la fuente de cada dato y la decisión.

### Corregido

- `python -m app.privacy purge --attendance-days 0` y `--diagnostics-days 0` no borraban nada (se trataba el 0 como «no indicado»). Ahora borran todos. Los días negativos se rechazan.

---

## [0.21.0] — 2026-11-12

> **Al actualizar:** trae la migración `0003` (tabla `device_checks`), que se aplica sola al arrancar. Para volver después a 0.20 hay que restaurar la copia anterior a la actualización: `RESTORE_BACKUP=1 ./deploy.sh 0.20.0`.

### Añadido

- **Diagnóstico de equipos antes de la clase (REQ-022).**
  - **Página `/diagnostico`:** en unos 30 segundos comprueba un equipo con el mismo motor que el Aula:
    - navegador y conexión segura;
    - servidor;
    - cámara (permiso, si existe, si está en uso por otro programa, resolución);
    - motor de manos (en el equipo o en el servidor, tiempo de carga);
    - velocidad, en cuadros por segundo con tarjeta gráfica o procesador, y si vio una mano.

    Da un veredicto (✔ listo, ⚠ con avisos, ✗ no apto), explica en lenguaje sencillo cómo resolver cada problema y deja una línea de resumen para copiar. La sala y el puesto son opcionales (`?sala=…&puesto=…`) y el equipo los recuerda.
  - **Panel docente, tarjeta «Equipos del laboratorio»:** resume los últimos 7 días, con filtro por sala:
    - equipos probados;
    - listos, con avisos y no aptos;
    - **cámara a la primera**;
    - velocidad mediana;
    - el último resultado de cada puesto, con los problemas primero.

    Incluye un botón para copiar el enlace del diagnóstico con la sala ya puesta.
  - **Datos:** el resultado técnico se envía sin datos del estudiante ni imágenes (`POST /api/diagnostics`, tabla `device_checks`, migración `0003`). Aparece en `/privacidad`, y `python -m app.privacy purge --diagnostics-days N` borra los antiguos.
- Guías: la semana 1 del piloto (03), la guía docente (05) y la de problemas frecuentes (06) empiezan por el diagnóstico.

### Corregido

- **`deploy.sh`: volver a una versión anterior a una migración.** Antes, la versión anterior no arrancaba porque no conocía el esquema nuevo, y `deploy.sh` volvía a la actual sin explicar por qué. Ahora lo detecta **antes de cambiar nada**: nombra la copia que habría que restaurar y explica que se pierde lo registrado desde la actualización. Con `RESTORE_BACKUP=1 ./deploy.sh <versión>`:
  - guarda una copia de la base actual;
  - restaura la copia anterior a la actualización;
  - despliega la versión.

  Si esa versión no arrancara, se vuelve atrás con la base actual. Probado en `scripts/test-deploy.sh` y con las imágenes publicadas: 0.20.0 → 0.21.0 → 0.20.0 → 0.21.0.

---

## [0.20.0] — 2026-11-12

### Añadido

- **Privacidad y derechos sobre los datos (REQ-021)**, requisito del piloto institucional.
  - **Página `/privacidad`**, enlazada desde el Aula de Señas y la página de inicio. Explica en lenguaje sencillo:
    - qué se guarda y qué no (video, imágenes, audio, correo);
    - quién lo ve y cuánto tiempo;
    - el responsable y el contacto de la institución.

    Además, cada estudiante puede **descargar** (JSON) o **borrar** sus datos: los perfiles de ese navegador y la cuenta de Moodle de la pestaña.
  - **API:** `GET /api/privacy`, `GET /api/learners/{id}/export` y `DELETE /api/learners/{id}`. Usan la misma credencial que el resto de datos del estudiante. El borrado es en cascada: sesiones, intentos, accesos y notas enviadas.
  - **CLI para la institución:** `python -m app.privacy find | export | delete | purge`. `purge` borra a los estudiantes sin actividad y los pases de lista antiguos; sin `--yes` solo lista lo que se borraría.
  - **Configuración:** `PRIVACY_CONTROLLER`, `PRIVACY_CONTACT` y `DATA_RETENTION_DAYS`.
  - **Guía [08 · Privacidad](../onboarding/08-privacidad.md):** atender solicitudes, cierre del piloto, copias de seguridad y una plantilla del aviso para familias.
- `check-install.py` avisa si falta el responsable o el contacto de privacidad.
- `scripts/test-deploy.sh` comprueba que las variables `PRIVACY_*` llegan a la app y que la CLI funciona en la imagen.

### Cambiado

- Barra del Aula de Señas: nuevo enlace **🔒 Privacidad**. En pantallas estrechas queda solo el icono y se oculta «← Inicio» (el logo ya lleva al inicio).
- Deuda técnica: TD-004 (persistencia) figura como resuelta y TD-003 (autenticación) como mitigada.

---

## [0.19.0] — 2026-11-12

### Añadido

- **`deploy/check-install.py`: comprobación previa al piloto.** Una sola orden que revisa lo que suele fallar en la puesta en marcha y dice cómo corregirlo:
  - HTTPS y certificado, `PUBLIC_BASE_URL` frente a la dirección real, `ADMIN_TOKEN` vacío o incorrecto, versión sin credenciales de estudiante;
  - claves LTI;
  - política de permisos de la cámara;
  - tipos MIME y tamaño del motor de manos (JS, WASM, modelo);
  - límite de subida del proxy (importar plantillas) y WebSocket;
  - diferencia de hora.

  Con `--moodle` comprueba también:
  - que se llega a las claves y al servicio de tokens de Moodle (también desde dentro del contenedor);
  - que la hora de los dos servidores coincide dentro de la tolerancia LTI de 60 s;
  - que ese Moodle está registrado.

  Solo usa la biblioteca estándar de Python 3.8 o superior y termina con código 1 si algo falla. `scripts/test-deploy.sh` la ejecuta en la CI contra una instalación real.
- Onboarding 03 y guía de despliegue: la comprobación automática como primer paso. Se descarga junto a `deploy.sh`.

---

## [0.18.0] — 2026-11-12

### Seguridad

- **La app ya no corre como root dentro del contenedor (TD-014).**
  - El nuevo `docker/entrypoint.sh` entrega el directorio de datos al usuario `app` (uid/gid 1000) y ejecuta la app con `setpriv`, sin capacidades y con `no_new_privs`.
  - Arrancado directamente sin root (Kubernetes `runAsUser`), no toca permisos.

### Cambiado

- Las instalaciones existentes (datos creados como root) se migran solas en el primer arranque: `./data` pasa a uid 1000 en el servidor. Volver a una versión anterior sigue funcionando.
- En desarrollo, `./data` deja de pertenecer a root y la app ya no genera archivos `__pycache__` en las carpetas montadas.
- `scripts/test-deploy.sh` comprueba que el proceso no es root y que los datos son del usuario de la app.

### Corregido

- matplotlib (dependencia de MediaPipe) intentaba escribir en `/root`: la app sin privilegios usa un `HOME` escribible.

---

## [0.17.0] — 2026-11-12

### Seguridad

- **TD-013** — **Los datos de cada estudiante ya no se leen ni se escriben solo con conocer su id.**
  - **Perfil local:** al crearlo, el servidor entrega un **token secreto** y guarda solo su SHA-256. El navegador lo guarda con el perfil y lo envía en `X-Learner-Token`.
  - **Moodle:** se exige el token de lanzamiento de ese mismo estudiante.
  - Sin credencial: 401; con una credencial ajena: 403. `ADMIN_TOKEN`, si está configurado, abre cualquier perfil.
  - Afecta a `GET /api/learners/{id}`, `/sessions` y `/progress`, y a crear, registrar intentos y cerrar sesiones.
- Los **perfiles creados antes de esta versión** reclaman su token automáticamente la primera vez que se abren (`POST /api/learners/{id}/claim`, una sola vez). Un navegador que ya no tiene acceso descarta ese perfil y crea uno nuevo. El Aula de Señas, GestiEdu y MotivaSign lo hacen solos.

### Añadido

- Migración `0002` (`learners.secret_hash`): la primera que se aplica sola al actualizar.

### Corregido

- Una prueba de migraciones simulaba una base antigua con el esquema actual. Ahora aplica solo la revisión de esa versión.

---

## [0.16.0] — 2026-11-12

### Añadido

- **TD-012** — **Migraciones de esquema con Alembic** (`app/migrations/`, `app/migrate.py`).
  - La app actualiza la base al arrancar.
  - Si arrancan varios workers a la vez, un bloqueo hace que solo uno migre.
  - Las bases creadas por versiones anteriores se adoptan **sin pérdida de datos**: la revisión base es el esquema de 0.15.0 y crea solo las tablas que falten.
  - `python -m app.migrate [current|head|check]`.
- `deploy.sh`: si una versión que ya había migrado el esquema falla al desplegar, la reversión **restaura la copia de la base** tomada antes de actualizar. Si el esquema no cambió, conserva la base.
- Pruebas:
  - `test_migrations.py`: base nueva, adopción de una base antigua con datos, idempotencia y reversibilidad, workers simultáneos, modelos ↔ migraciones (falla si un modelo cambia sin su revisión) e historial lineal.
  - `scripts/test-deploy.sh` prueba la restauración con una imagen que añade una migración.

### Cambiado

- Las pruebas de la API arrancan cada vez con una base vacía que la app migra, igual que en producción.
- Nueva dependencia: `alembic`.

---

## [0.15.0] — 2026-11-12

### Añadido

- **REQ-011** — **Entrega continua.** Al publicar una etiqueta `vX.Y.Z`:
  - se repite toda la CI;
  - se construye y prueba la imagen y se publica en GitHub Container Registry (`ghcr.io/dbanegasl/handsonedu`, etiquetas `X.Y.Z`, `X.Y` y `latest`);
  - se crea la *GitHub Release* con las notas de este CHANGELOG;
  - opcionalmente se actualiza el servidor por SSH (entorno `production`).
- `deploy/` (instalación desde la imagen publicada, **sin clonar el repositorio**) y `deploy/deploy.sh <versión>`:
  - descarga la imagen;
  - hace una copia de la base;
  - cambia de versión;
  - comprueba `/health` con la versión esperada y **vuelve sola a la anterior** si falla.

  También sirve para revertir a mano, y el workflow se puede ejecutar a mano para desplegar o revertir una versión ya publicada.
- `scripts/release.py` (coherencia entre etiqueta, `APP_VERSION` y CHANGELOG; notas de la versión) y `scripts/test-deploy.sh` (prueba de punta a punta de `deploy.sh`, también en CI).
- CI:
  - comprueba que la versión tenga entrada en el CHANGELOG;
  - pasa `shellcheck` a los scripts y valida los archivos compose;
  - verifica que la imagen no contenga `.env`, `data/` ni `.git`;
  - prueba `deploy.sh`.

### Cambiado

- La imagen arranca en modo producción por defecto (sin `--reload`, con `--proxy-headers`). El número de workers se fija con `WEB_CONCURRENCY` y los proxies de confianza con `FORWARDED_ALLOW_IPS`. El `docker-compose.yml` de desarrollo añade `--reload` y ahora también monta `scripts/` y `docs/`. Etiquetas OCI con versión y commit.
- `.dockerignore`: `COPY . .` ya no puede meter `.env`, la base de datos ni el historial de git en la imagen.

---

## [0.14.0] — 2026-11-12

### Añadido

- **REQ-010** — **Modelo entrenado** con las plantillas del Estudio de Señas, para las señas estáticas de una mano (alfabeto y números).
  - Red neuronal pequeña en JS puro (`js/ho-signs-model.js`, `HO.SignModel`): se entrena y se ejecuta en el navegador, con el mismo extractor de características para las dos cosas.
  - Se combina con descriptores y plantillas (mezcla geométrica `HO.Signs.blendModel`); dinámicas y de dos manos sin cambios.
  - **Evaluación antes de publicar:** validación cruzada que retiene grabaciones completas; compara la seña correcta aceptada, la seña equivocada aceptada y el acierto con y sin modelo, y solo recomienda publicar si mejora.
  - Estudio: tarjeta *🧠 Modelo entrenado* (entrenar y evaluar, informe por seña, publicar, desactivar, aviso de grabaciones nuevas). El Aula carga el modelo activo.
  - API: `GET /api/signs/{lang}/model` (204 si no hay), `GET/POST /api/signs/{lang}/models`, activar, desactivar, eliminar. Tabla nueva `sign_models`.
  - CLI `scripts/train-sign-model.cjs` (mismo código, sin navegador).

### Corregido

- Un `NaN` en el cuerpo de una petición convertía el error de validación (422) en un 500: el manejador de validación ya no devuelve números no finitos.
- Estudio de Señas en móvil: la barra superior desbordaba (selector de lengua) y el catálogo quedaba fijo tapando el contenido (las reglas móviles iban antes de las base).

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
