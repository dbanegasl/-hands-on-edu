# Registro de Deuda Técnica — HandsOnEdu

> **Última actualización:** 2026-11-11

---

## 1. Resumen ejecutivo

HandsOnEdu es una plataforma educativa funcional que logra su propósito inicial: demostrar el potencial de MediaPipe Hand Landmarker en el aula. Sin embargo, al acercarse a un despliegue institucional real, el código base acumula deuda técnica que, de no gestionarse activamente, frenará el desarrollo futuro y expondrá riesgos operativos. La deuda más crítica se concentra en tres áreas: ausencia total de tests automatizados (que bloquea cualquier refactor seguro y la adopción de CI/CD), falta de persistencia de datos (que impide el seguimiento pedagógico longitudinal), y la ausencia de autenticación (inaceptable para un sistema que maneja datos de estudiantes en contexto institucional). Este registro existe para que el equipo tenga visibilidad completa de la deuda acumulada, priorice su resolución de forma informada, y evite acumular nueva deuda sin documentarla.

---

## 2. Deuda técnica confirmada

### TD-001 — Tests: directorio vacío → 0% cobertura

| Campo | Detalle |
|-------|---------|
| **ID** | TD-001 |
| **Estado** | ✅ Resuelto (REQ-001; 260+ tests Python y 20 JS, CI en REQ-011) |
| **Impacto** | Alto |
| **Esfuerzo de resolución** | M (2–4 horas) |
| **REQ relacionado** | [REQ-001](../requirements/REQ-001-unit-tests.md), [REQ-011](../requirements/REQ-011-cicd-github-actions.md) |

**Descripción:**  
El directorio `tests/` existe en el repositorio pero contiene únicamente un archivo `__init__.py` vacío. No existe ningún test unitario ni de integración. El coverage actual es **0%**.

**Impacto concreto:**
- Imposible hacer refactors con confianza (cualquier cambio en `hand_tracker.py` puede romper silenciosamente los módulos dependientes).
- CI/CD (REQ-011) no tiene valor sin tests que validar.
- Los bugs de regresión solo se detectan en producción.

---

### TD-002 — Preguntas de GestiEdu hardcodeadas en JS

| Campo | Detalle |
|-------|---------|
| **ID** | TD-002 |
| **Estado** | 🔴 Pendiente |
| **Impacto** | Medio |
| **Esfuerzo de resolución** | L (8–12 horas) |
| **REQ relacionado** | [REQ-006](../requirements/REQ-006-question-editor-gestiedu.md) |

**Descripción:**  
Las 10 preguntas de evaluación de GestiEdu están definidas como un array de objetos JavaScript directamente en `gestiedu.js`. No existe ningún mecanismo para que el docente personalice el contenido sin editar el código fuente y reiniciar el servidor.

**Impacto concreto:**
- El docente no puede adaptar las preguntas a su materia o nivel educativo.
- Personalizar el contenido requiere conocimientos de JavaScript y acceso al servidor.
- Viola el principio pedagógico de adaptación curricular.

---

### TD-003 — Sin autenticación: plataforma completamente pública

| Campo | Detalle |
|-------|---------|
| **ID** | TD-003 |
| **Estado** | 🔴 Pendiente |
| **Impacto** | Alto |
| **Esfuerzo de resolución** | L (8–12 horas) |
| **REQ relacionado** | [REQ-008](../requirements/REQ-008-basic-auth.md) |

**Descripción:**  
No existe ningún sistema de autenticación o autorización. Cualquier persona que conozca la URL del servidor (puerto 9876) tiene acceso sin restricciones a todos los endpoints, incluyendo el dashboard de resultados y el editor de preguntas.

**Impacto concreto:**
- Datos de estudiantes (notas, asistencia) expuestos sin control de acceso.
- Cualquier usuario puede modificar o eliminar preguntas de evaluaciones.
- Inaceptable para despliegue institucional según políticas de privacidad institucionales.
- Potencial incumplimiento de normativas de protección de datos personales.

---

### TD-004 — Sin persistencia: resultados solo en memoria

| Campo | Detalle |
|-------|---------|
| **ID** | TD-004 |
| **Estado** | 🟡 Parcial (REQ-005 base en v0.9.0: progreso de señas y plantillas persisten; GestiEdu/AttendEye aún no) |
| **Impacto** | Alto |
| **Esfuerzo de resolución** | L (6–10 horas) |
| **REQ relacionado** | [REQ-005](../requirements/REQ-005-sqlite-persistence.md) |

**Descripción:**  
Todos los resultados (notas GestiEdu, asistencia AttendEye, progreso MotivaSign) se almacenan únicamente en memoria del navegador o en variables de estado del servidor. Al cerrar la pestaña o reiniciar el contenedor Docker, todos los datos se pierden permanentemente.

**Impacto concreto:**
- Imposible hacer seguimiento del aprendizaje entre sesiones.
- No existen reportes históricos.
- Bloquea el desarrollo del dashboard (REQ-007) y la integración con Moodle (REQ-009).

---

### TD-005 — MoodleClient es un stub no funcional

| Campo | Detalle |
|-------|---------|
| **ID** | TD-005 |
| **Estado** | 🟡 Replanificado (las notas irán por LTI 1.3 + AGS, REQ-019) |
| **Impacto** | Medio |
| **Esfuerzo de resolución** | XL (10–20 horas) |
| **REQ relacionado** | [REQ-009](../requirements/REQ-009-moodle-integration.md) |

**Descripción:**  
El archivo `app/core/moodle_client.py` existe y parece implementar la integración con Moodle, pero sus métodos son stubs que solo muestran alertas o retornan datos ficticios. No realiza ninguna llamada real a la API REST de Moodle.

**Impacto concreto:**
- La integración con el LMS (Moodle) es completamente no funcional a pesar de estar listada como característica del sistema.
- Los docentes que confían en la sincronización automática de notas deben cargarlas manualmente.
- Genera expectativas incorrectas sobre las capacidades del sistema.

---

### TD-008 — Sin rate limiting en WebSocket

| Campo | Detalle |
|-------|---------|
| **ID** | TD-008 |
| **Estado** | ✅ Resuelto (REQ-013) |
| **Impacto** | Medio |
| **Esfuerzo de resolución** | S (2–3 horas) |
| **REQ relacionado** | [REQ-013](../requirements/REQ-013-detection-robustness.md) |

> **Resuelto en REQ-013:** guardia de tasa por conexión en `/ws/analyze` — si un frame llega < 25 ms tras el anterior, se reenvía el último resultado en vez de recomputar. El protocolo ping-pong del cliente nunca lo dispara en uso normal; solo limita a un cliente que satura el socket.

**Descripción:**  
El endpoint WebSocket `/ws/analyze` no implementa ningún tipo de rate limiting. Un cliente puede enviar frames a la máxima velocidad posible (potencialmente cientos por segundo), saturando la CPU del servidor con procesamiento de MediaPipe.

**Impacto concreto:**
- Un solo cliente malicioso o buggy puede degradar el rendimiento para todos los usuarios.
- En producción con múltiples sesiones simultáneas, puede causar timeouts y caídas del servicio.
- El backend no tiene mecanismo de defensa ante un cliente que envíe frames constantemente sin intervalos.

**Solución sugerida:**  
Implementar un token bucket o sliding window por conexión WebSocket. Limitar a ~30 frames/segundo por cliente (suficiente para detección fluida). Usar `asyncio.sleep` o un semáforo por conexión.

---

### TD-009 — Logging no estructurado (print statements)

| Campo | Detalle |
|-------|---------|
| **ID** | TD-009 |
| **Estado** | ✅ Resuelto (REQ-013) |
| **Impacto** | Bajo |
| **Esfuerzo de resolución** | S (1–2 horas) |
| **REQ relacionado** | [REQ-013](../requirements/REQ-013-detection-robustness.md) |

> **Resuelto en REQ-013:** `logging.basicConfig` con formato timestamp/nivel/logger y un logger `handsonedu`; el WS registra conexión/desconexión y las excepciones (antes tragadas en silencio) con `logger.exception`.

**Descripción:**  
El archivo `app/main.py` y otros módulos del backend usan `print()` para logging en lugar del módulo `logging` estándar de Python o un framework de structured logging.

**Impacto concreto:**
- En producción, es difícil filtrar logs por nivel (DEBUG/INFO/ERROR).
- Los logs no tienen timestamp, nivel, ni contexto estructurado.
- No es posible integrar con herramientas de observabilidad (ELK, CloudWatch, etc.) sin preprocessing.
- Los errores en producción son difíciles de rastrear.

**Solución sugerida:**  
Reemplazar `print()` por `logging.getLogger(__name__)` con configuración centralizada en `app/core/logging.py`. O usar `structlog` para JSON structured logging.

---

### TD-010 — Sin health check en docker-compose.yml

| Campo | Detalle |
|-------|---------|
| **ID** | TD-010 |
| **Estado** | ✅ Resuelto (REQ-013) |
| **Impacto** | Bajo |
| **Esfuerzo de resolución** | XS (< 30 minutos) |
| **REQ relacionado** | [REQ-013](../requirements/REQ-013-detection-robustness.md) |

> **Resuelto en REQ-013:** `healthcheck` en `docker-compose.yml` que consulta `http://localhost:8000/health` con Python (la imagen trae `wget`, no `curl`; el puerto interno es 8000 sin importar `HOST_PORT`).

**Descripción:**  
El `docker-compose.yml` no configura un `healthcheck` para el servicio de la aplicación. Docker no puede determinar si el contenedor está realmente disponible o solo en estado "starting".

**Impacto concreto:**
- En caso de crash silencioso, Docker no reinicia el contenedor automáticamente.
- No hay mecanismo de `restart: unless-stopped` + health check que garantice alta disponibilidad.
- En un despliegue con `docker-compose up -d`, el servicio puede estar listado como "running" pero en realidad colgado.

**Solución sugerida:**

```yaml
# docker-compose.yml
services:
  app:
    # ...configuración existente...
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9876/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

---

### TD-011 — Contenido LSEC sin validación lingüística

| Campo | Detalle |
|-------|---------|
| **ID** | TD-011 |
| **Estado** | 🔴 Pendiente |
| **Impacto** | Alto (pedagógico) |
| **Esfuerzo de resolución** | M (requiere intérpretes / comunidad sorda) |
| **REQ relacionado** | [REQ-017](../requirements/REQ-017-sign-recognition-engine.md) |

**Descripción:** las 50 señas de `app/content/lsec/catalog.json` están marcadas `validated: false`. Los descriptores siguen el alfabeto manual latinoamericano y 30 señas solo se reconocen con plantillas que todavía no existen. Hay que validarlas antes de usarlas en el aula.

---

### TD-012 — Sin migraciones de esquema (Alembic)

| Campo | Detalle |
|-------|---------|
| **ID** | TD-012 |
| **Estado** | ✅ Resuelto (v0.16.0) |
| **Impacto** | Medio |
| **Esfuerzo de resolución** | S |

**Descripción:** las tablas se creaban con `Base.metadata.create_all()` al arrancar. Cualquier cambio de columnas en una base existente requería una migración manual.

> **Resuelto en v0.16.0:**
> - El esquema lo gestiona **Alembic** (`app/migrations/`), y la app se migra sola al arrancar con `app/migrate.py`.
> - Si arrancan varios workers a la vez, un bloqueo (de archivo en SQLite, *advisory lock* en PostgreSQL) hace que solo uno migre.
> - La revisión base `0001` es el esquema de v0.15.0 y es **idempotente**: adopta las bases creadas con `create_all` sin perder datos (crea las tablas que falten y registra la versión).
> - Las pruebas de la API corren sobre el esquema migrado.
> - `test_migrations.py` falla si un modelo cambia sin su revisión.
> - Si una versión que ya migró el esquema falla al desplegar, `deploy.sh` restaura la copia previa.

---

### TD-013 — API de aprendizaje sin autenticación fuera de LTI

| Campo | Detalle |
|-------|---------|
| **ID** | TD-013 |
| **Estado** | ✅ Resuelto (v0.17.0); queda aceptado el `state` OIDC sin cookie (ver abajo) |
| **Impacto** | Medio (privacidad) |
| **Esfuerzo de resolución** | M |
| **REQ relacionado** | [REQ-008](../requirements/INDEX.md), [REQ-019](../requirements/REQ-019-lti13-moodle.md) |

**Descripción:** con perfiles locales, `/api/learners/{id}/*` y `/api/sessions/*` se autorizan solo por conocer el id aleatorio del estudiante. Con LTI, el token de lanzamiento ya liga la sesión al estudiante, pero los endpoints de lectura de progreso aún no lo exigen. El panel docente (`/api/panel/*`, v0.12.0) sí exige token de docente LTI o `ADMIN_TOKEN`. Además, el `state` de OIDC se valida en el servidor (un solo uso, 10 min) sin ligarlo a una cookie del navegador, porque las cookies de terceros se bloquean dentro del iframe del LMS.

> **Resuelto en v0.17.0.** Los datos de un estudiante (`GET /api/learners/{id}`, `/sessions`, `/progress`, y crear o completar sus sesiones) exigen una de estas credenciales:
>
> 1. **Perfil local:** `POST /api/learners` entrega una sola vez un **token secreto** del perfil. La base guarda solo su SHA-256, y el navegador lo guarda junto al perfil y lo envía en `X-Learner-Token`.
> 2. **LTI:** el token de lanzamiento de **ese** estudiante (`Authorization: Bearer`). El de otro estudiante, aunque sea docente, recibe 403.
> 3. **`ADMIN_TOKEN`:** solo si está configurado (soporte); sin configurar no abre nada.
>
> Sin credencial la respuesta es 401, y con una credencial ajena, 403.
>
> **Perfiles creados antes de v0.17:** no tienen token. El primer navegador que lo pide (`POST /api/learners/{id}/claim`, automático en el Aula y en los juegos) lo recibe. Después responde 409, y un navegador que ya no tiene acceso descarta ese perfil y crea uno nuevo. Es la misma exposición que había antes, pero solo hasta el primer uso tras actualizar.
>
> Pruebas: `tests/test_learner_auth.py`. El resto de pruebas usa un cliente que se comporta como el navegador dueño del perfil (`conftest.py`, `_Device`).
>
> **Aceptado:** el `state` de OIDC sigue sin ligarse a una cookie (un solo uso, 10 min en el servidor), por el bloqueo de cookies de terceros en el iframe del LMS.

---

## 3. Deuda ya resuelta

| ID | Descripción | Fecha de resolución | Commit SHA |
|----|-------------|---------------------|-----------|
| TD-006 | **WS URL hardcodeada a `localhost`** — La URL del WebSocket en el frontend estaba hardcodeada a `ws://localhost:9876/ws/analyze`, haciendo imposible el acceso desde dispositivos en la misma red o en producción. Reemplazada por una URL dinámica calculada en base a `window.location.hostname`. | 2026-04-30 | `ed62301` |
| TD-007 | **Condiciones duplicadas en `detect_gesture()`** — Existían dos bloques `if` con la misma condición para `open_hand` en `hand_tracker.py`, causando lógica incorrecta y confusión en el mantenimiento. Consolidado en una única condición. | 2026-04-30 | `ed62301` |

---

## 4. Plan de resolución sugerido

### Matriz impacto vs esfuerzo

```
IMPACTO
  Alto │ TD-003 (auth)    TD-001 (tests)
       │ TD-004 (SQLite)
───────┼──────────────────────────────────
 Medio │ TD-005 (Moodle)  TD-002 (preguntas)
       │ TD-008 (rate limit)
───────┼──────────────────────────────────
  Bajo │ TD-009 (logging)
       │ TD-010 (healthcheck)
       └─────────────────────────────────
         Bajo esfuerzo    Alto esfuerzo
```

### Orden de resolución recomendado

```
Sprint 1 (fundamentos):
  TD-001 → escribir tests (REQ-001)
  TD-010 → healthcheck docker (30 min, quick win)
  TD-009 → structured logging (1-2h, quick win)

Sprint 2 (infraestructura de datos):
  TD-004 → SQLite (REQ-005) — desbloquea TD-002, TD-003, TD-005

Sprint 3 (seguridad):
  TD-003 → autenticación (REQ-008)

Sprint 4 (funcionalidades):
  TD-002 → editor preguntas (REQ-006)
  TD-008 → rate limiting WS

Sprint 5 (integraciones avanzadas):
  TD-005 → Moodle real (REQ-009)
```

---

## 5. Criterios para clasificar nueva deuda

Un elemento debe registrarse como deuda técnica cuando cumple **al menos uno** de estos criterios:

| Criterio | Ejemplo |
|----------|---------|
| **Workaround conocido** | "Funciona pero sabemos que está mal hecho" |
| **Bloquea escalabilidad** | No puede soportar más de N usuarios/sesiones |
| **Riesgo de seguridad** | Datos expuestos, falta de validación de inputs |
| **Dificulta el mantenimiento** | Código duplicado, sin tests, sin documentación |
| **Contradice las mejores prácticas del stack** | Bloquear el event loop asyncio, print en producción |
| **Genera expectativas incorrectas** | Feature anunciada pero no implementada (como MoodleClient) |

### Plantilla para nueva entrada de deuda

```markdown
### TD-XXX — Título corto

| Campo | Detalle |
|-------|---------|
| **ID** | TD-XXX |
| **Estado** | 🔴 Pendiente |
| **Impacto** | Alto / Medio / Bajo |
| **Esfuerzo de resolución** | XS / S / M / L / XL |
| **REQ relacionado** | REQ-XXX o "Ninguno aún" |

**Descripción:** Qué es el problema y dónde está en el código.

**Impacto concreto:** Consecuencias reales de no resolverlo.

**Solución sugerida:** Enfoque técnico de resolución.
```

---

*Ver también: [Índice de Requisitos](../requirements/INDEX.md)*
