# REQ-005 — Persistencia de Sesiones con SQLite

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-005 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho — base en v0.9.0 (SQLAlchemy 2.0, `learners`, `activity_sessions`, `sign_attempts`, `sign_templates`); GestiEdu, MotivaSign y AttendEye guardan sus resultados desde v0.13.0 |
| **Módulo** | Global / Backend |
| **Esfuerzo estimado** | L (6–10 horas) |

---

## Problema

**Todos los resultados del sistema existen únicamente en memoria RAM del navegador o del servidor.** Al cerrar la pestaña o reiniciar el contenedor Docker, se pierde:

- Notas y respuestas de evaluaciones GestiEdu.
- Registros de asistencia de AttendEye.
- Progreso de nivel y signos aprendidos en MotivaSign.

Esto hace **imposible**:
- Seguimiento longitudinal del aprendizaje de los estudiantes.
- Comparar resultados entre sesiones.
- Reportes para coordinación académica institucional.
- Implementar cualquier dashboard o análisis de datos.

Este requisito es un **prerrequisito bloqueante** para REQ-006, REQ-007, REQ-008 y REQ-009 (ver también TD-004 en `docs/technical-debt/TECHNICAL-DEBT.md`).

---

## Implementación (v0.9.0 + v0.13.0)

La propuesta original (más abajo, conservada como referencia histórica) se simplificó: en lugar de una tabla por módulo, **los juegos por estudiante reutilizan las tablas genéricas** del Aula y solo la asistencia, que es por clase, tiene tablas propias. SQLAlchemy 2.0 síncrono (no hizo falta async), base en `./data/` montada como volumen, tablas creadas al arrancar con `create_all` (desde v0.16.0, migraciones Alembic: TD-012).

| Módulo | Dónde se guarda | Qué se guarda |
|---|---|---|
| **GestiEdu** | `activity_sessions` (`module="gestiedu"`, `activity="quiz"`) | Aciertos / 10, nota A–D, duración y cada respuesta (`details.answers`: pregunta, materia, esperada, dada, acierto) |
| **MotivaSign — Desafío** | `activity_sessions` (`motivasign`, `challenge`, `language="gestos"`) + `sign_attempts` | Aciertos / 10, nota, y un intento por seña con su tiempo de respuesta |
| **MotivaSign — Aprender** | igual, `activity="learn"` | Sesión de práctica: señas logradas al menos una vez / 15 y cada acierto. Se crea con el primer acierto y se cierra al salir del modo (también al cerrar la pestaña, con `fetch keepalive`). No cuenta en las medias |
| **AttendEye** | `attendance_sessions` + `attendance_records` (nuevas) | Lista de asistencia (estado, hora y si se marcó **por gesto o a mano**) o sesión de participación (intervenciones por estudiante), clase, inicio y fin |

**Estudiantes.** GestiEdu y MotivaSign muestran «¿Quién juega?» en la pantalla de inicio. Los perfiles se comparten con el Aula de Señas (mismas claves de `localStorage`, `ho.aula.profiles` / `ho.aula.current`), así que quien ya practica en el Aula aparece como botón. Sin nombre se puede jugar igual; no se guarda nada. Guardar nunca interrumpe el juego: si falla, se avisa en la pantalla de resultados.

**AttendEye** trabaja con nombres escritos por el docente (no perfiles), así que su historial es por **clase**. Es un dato personal: todos sus endpoints piden el token de administrador (`X-Admin-Token`, abierto si `ADMIN_TOKEN` no está definido); la página lo pide una vez y lo recuerda.

### API nueva

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/attendance` | Guarda una lista (`mode="rollcall"`) o una sesión de participación (`"participation"`) con sus registros |
| `GET` | `/api/attendance?class_name=&mode=&limit=` | Historial, más reciente primero, con totales y % de asistencia (presentes / marcados; los no marcados no cuentan) |
| `GET` | `/api/attendance/classes` | Clases con nº de sesiones y la lista de nombres de la última (para reutilizarla) |
| `GET` | `/api/attendance/{id}` | Detalle |
| `GET` | `/api/attendance/{id}/export.csv?tz=-300` | CSV (UTF-8 con BOM); `tz` = minutos respecto de UTC para fechas y horas locales |
| `DELETE` | `/api/attendance/{id}` | Elimina una sesión |

GestiEdu y MotivaSign usan los endpoints que ya existían (`POST /api/learners`, `/api/sessions`, `/attempts`, `/finish`, `GET /api/learners/{id}/sessions`). Desde v0.17 (TD-013) envían el token del perfil en `X-Learner-Token`.

### Interfaz

- **GestiEdu**: el botón falso «Enviar a Moodle» se sustituyó por **📜 Mis resultados** (últimas 8 partidas). Las notas a Moodle van por LTI (REQ-019) y hoy solo las envía el Aula.
- **MotivaSign**: «¿Quién juega?» + estado del guardado y **📜 Mis resultados** (desafíos) en la pantalla final.
- **AttendEye**: la lista se guarda sola al terminar (con *Reintentar* si falla) y añade descarga **CSV**; la participación tiene **💾 Guardar y terminar** (y «Salir sin guardar» pide confirmación si hay intervenciones). En la configuración: sugerencias con las clases guardadas, **Usar la lista guardada de esta clase** e **📚 Historial de asistencia** con CSV y borrado por sesión.
- **Panel docente** (vista de instalación, `/panel` con token de administrador): tarjeta **Otros módulos** con el acierto medio de GestiEdu y MotivaSign y la asistencia media de AttendEye; los estudiantes que solo usaron los juegos aparecen en la tabla y su detalle lista esas partidas. En la vista de un curso de Moodle no se muestran: esos juegos no se lanzan por LTI.

### Pruebas

`tests/test_attendance.py` (API de asistencia, permisos, CSV con zona horaria y resumen del panel) y `tests/js/ho-learning.test.cjs` (perfiles compartidos, notas, `Recorder` contra un `fetch` simulado). Verificado en navegador (Playwright): GestiEdu y MotivaSign guardan e historian, AttendEye guarda lista y participación, reutiliza la lista y descarga CSV, y el panel muestra los tres módulos; sin desbordamiento horizontal en móvil.

---

## Alcance propuesto (original, 2026-04-30 — referencia histórica)

### Base de datos

- **Motor:** SQLite 3 (sin servidor externo, incluido en Python stdlib).
- **Ubicación:** `/app/data/handsonedu.db` dentro del contenedor.
- **Volumen Docker:** montar `./data:/app/data` en `docker-compose.yml` para persistencia entre reinicios.

### Esquema de tablas

```sql
-- Sesión de clase (una por módulo y docente)
CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,          -- UUID v4
    module      TEXT NOT NULL,             -- 'gestiedu' | 'motivasign' | 'attendeye'
    teacher_id  TEXT,                      -- referencia a users.id (REQ-008) o nombre libre
    started_at  TEXT NOT NULL,             -- ISO 8601
    ended_at    TEXT,                      -- NULL mientras activa
    metadata    TEXT                       -- JSON libre para datos extra del módulo
);

-- Resultados de evaluaciones GestiEdu
CREATE TABLE gestiedu_results (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    student_name TEXT NOT NULL,
    score        INTEGER NOT NULL,         -- puntos obtenidos
    grade        REAL NOT NULL,            -- calificación 0-10
    answers_json TEXT NOT NULL,            -- JSON: [{question_id, selected, correct}]
    created_at   TEXT NOT NULL
);

-- Registros de asistencia AttendEye
CREATE TABLE attendeye_records (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    student_name TEXT NOT NULL,
    status       TEXT NOT NULL,            -- 'presente' | 'ausente' | 'tardanza'
    registered_at TEXT NOT NULL
);

-- Progreso en MotivaSign
CREATE TABLE motivasign_progress (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    student_name  TEXT NOT NULL,
    signs_learned INTEGER NOT NULL DEFAULT 0,
    level_reached INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL
);
```

### ORM: SQLAlchemy async

Usar **SQLAlchemy 2.x async** (compatible con FastAPI) para evitar bloquear el event loop:

```python
# app/db/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite+aiosqlite:////app/data/handsonedu.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

### Endpoints nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/sessions` | Crear nueva sesión de clase |
| `PATCH` | `/api/sessions/{id}/close` | Cerrar sesión (registrar ended_at) |
| `POST` | `/api/results/gestiedu` | Guardar resultado de evaluación |
| `POST` | `/api/results/attendeye` | Guardar registro de asistencia |
| `POST` | `/api/results/motivasign` | Guardar progreso MotivaSign |
| `GET` | `/api/reports/{session_id}` | Obtener todos los resultados de una sesión |

### Cambios en `docker-compose.yml`

```yaml
services:
  app:
    # ... configuración existente ...
    volumes:
      - ./data:/app/data   # ← agregar esta línea
```

```
# Agregar al .gitignore
data/
```

---

## Archivos a crear

```
app/db/
├── __init__.py
├── database.py      ← engine, session factory, get_db()
└── models.py        ← SQLAlchemy declarative models

app/api/
├── __init__.py
├── sessions.py      ← CRUD de sesiones
└── results.py       ← endpoints de resultados por módulo
```

## Dependencias de Python a agregar

```
# requirements.txt
sqlalchemy>=2.0
aiosqlite>=0.20
```

---

## Criterio de aceptación

- ✅ `docker-compose restart` no pierde ningún dato (datos en volumen `./data/`).
- ✅ `GET /api/reports/{session_id}` retorna JSON con estructura correcta para cada módulo.
- ✅ Crear una sesión, guardar resultados, reiniciar contenedor, y los datos siguen disponibles.
- ✅ Las migraciones de esquema se aplican automáticamente al iniciar la app (usando `create_all` o Alembic).
- ✅ Tests de integración cubren los nuevos endpoints (actualizar REQ-001).

---

## Notas de implementación

- Inicializar la base de datos en el startup event de FastAPI (`@app.on_event("startup")`).
- Crear directorio `/app/data/` si no existe antes de inicializar SQLite.
- Para producción futura: los modelos SQLAlchemy deben ser compatibles con migración a PostgreSQL (usar tipos genéricos, no específicos de SQLite).

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-006 (editor preguntas) | Este REQ es prerrequisito |
| REQ-007 (dashboard) | Este REQ es prerrequisito |
| REQ-008 (autenticación) | Este REQ es prerrequisito |
| REQ-009 (Moodle) | Este REQ es prerrequisito |
| REQ-010 (ML classifier) | Este REQ es prerrequisito |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
