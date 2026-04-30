# REQ-005 — Persistencia de Sesiones con SQLite

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-005 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | 📋 Pendiente |
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
- Reportes para coordinación académica de UNAE.
- Implementar cualquier dashboard o análisis de datos.

Este requisito es un **prerrequisito bloqueante** para REQ-006, REQ-007, REQ-008 y REQ-009 (ver también TD-004 en `docs/technical-debt/TECHNICAL-DEBT.md`).

---

## Alcance propuesto

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
