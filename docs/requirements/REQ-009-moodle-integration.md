# REQ-009 — Integración Real con Moodle LMS

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-009 |
| **Tipo** | Feature |
| **Prioridad** | Baja |
| **Estado** | 📋 Pendiente |
| **Módulo** | Global / Backend |
| **Esfuerzo estimado** | XL (10–20 horas, depende de acceso a instancia Moodle) |

---

## Problema

El archivo `app/core/moodle_client.py` existe en el repositorio pero su implementación es **completamente un stub**: las funciones no realizan llamadas reales, solo muestran alertas o retornan datos ficticios.

**UNAE utiliza Moodle como su LMS (Learning Management System) principal**. Los docentes esperan que los resultados de HandsOnEdu (notas de GestiEdu, asistencia de AttendEye) se sincronicen automáticamente con el gradebook y el módulo de asistencia de Moodle, eliminando la doble carga de trabajo administrativo.

Actualmente, el docente debe:
1. Completar la sesión en HandsOnEdu.
2. Anotar los resultados manualmente.
3. Ingresar a Moodle y cargar los datos a mano.

---

## Alcance propuesto

### Autenticación con Moodle

Usar la **API REST de Moodle Web Services** con token de usuario:

```
https://{MOODLE_URL}/webservice/rest/server.php
  ?wstoken={MOODLE_TOKEN}
  &wsfunction={function_name}
  &moodlewsrestformat=json
```

Referencia oficial: https://docs.moodle.org/dev/Web_services

### Funciones a implementar en `MoodleClient`

```python
class MoodleClient:
    def __init__(self, base_url: str, token: str, course_id: int): ...

    async def get_students(self, course_id: int) -> list[dict]:
        """
        Obtener lista de estudiantes inscritos en un curso.
        Función Moodle: core_enrol_get_enrolled_users
        Retorna: [{id, username, fullname, email}]
        """

    async def post_grade(self, user_id: int, item_id: int, grade: float) -> bool:
        """
        Publicar calificación en el gradebook de Moodle.
        Función Moodle: gradereport_user_get_grades_table o core_grades_update_grades
        Retorna: True si exitoso
        """

    async def post_attendance(self, user_id: int, session_id: int, status: str) -> bool:
        """
        Registrar asistencia en el módulo Attendance de Moodle.
        Función Moodle: mod_attendance_add_attendance (plugin)
        Status: 'P' (presente) | 'A' (ausente) | 'L' (tardanza)
        Retorna: True si exitoso
        """

    async def get_course_info(self, course_id: int) -> dict:
        """
        Obtener información básica del curso.
        Función Moodle: core_course_get_courses
        """
```

### Flujo de sincronización automática

**GestiEdu → Moodle Gradebook:**
```
[Fin de evaluación GestiEdu]
        ↓
[Guardar en SQLite (REQ-005)]
        ↓
[Si MOODLE_URL configurado] → POST /api/sync/moodle/grades
        ↓
[MoodleClient.post_grade() para cada estudiante]
        ↓
[Actualizar estado en DB: synced=True/False]
```

**AttendEye → Moodle Attendance:**
```
[Fin de sesión AttendEye]
        ↓
[Guardar en SQLite (REQ-005)]
        ↓
[Si MOODLE_URL configurado] → POST /api/sync/moodle/attendance
        ↓
[MoodleClient.post_attendance() para cada registro]
```

### Endpoint de sincronización manual

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/sync/moodle/grades` | Sincronizar notas de una sesión GestiEdu |
| `POST` | `/api/sync/moodle/attendance` | Sincronizar asistencia de una sesión AttendEye |
| `GET` | `/api/sync/moodle/status` | Estado de sincronización de la última sesión |

### Manejo de errores y resiliencia

- Si Moodle no está disponible, los datos quedan en SQLite y se reintenta en el siguiente inicio de la app.
- Agregar campo `moodle_synced` (boolean) a las tablas de SQLite para rastrear estado de sincronización.
- Log de errores de sincronización en tabla `sync_errors(id, session_id, error_message, attempted_at)`.

---

## Nuevas variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `MOODLE_URL` | URL base de la instancia Moodle | `https://campus.unae.edu.ec` |
| `MOODLE_TOKEN` | Token de Web Services de Moodle | `abc123def456...` |
| `MOODLE_COURSE_ID` | ID del curso por defecto | `42` |

Actualizar `.env.example` con estas variables.

La integración **solo se activa** si `MOODLE_URL` está definido. Si no está definido, la app funciona exactamente igual que ahora (sin intentar sincronizar).

---

## Archivos a modificar / crear

```
app/core/moodle_client.py     ← reemplazar stub con implementación real
app/api/sync.py               ← nuevo: endpoints de sincronización
.env.example                  ← agregar nuevas variables
```

---

## Configuración de Moodle necesaria (prerequisitos en el servidor Moodle)

1. Habilitar Web Services en Moodle: `Administración del sitio → Plugins → Servicios web`.
2. Crear un token de Web Services con permisos: `core_enrol_get_enrolled_users`, `core_grades_update_grades`, `mod_attendance_*`.
3. El módulo "Attendance" de Moodle debe estar instalado para la sincronización de asistencia.

---

## Criterio de aceptación

- ✅ Con una instancia Moodle sandbox configurada, `POST /api/sync/moodle/grades` publica las notas correctamente en el gradebook.
- ✅ `POST /api/sync/moodle/attendance` registra la asistencia en el módulo Attendance de Moodle.
- ✅ Si `MOODLE_URL` no está configurado, la app funciona sin errores (integración desactivada silenciosamente).
- ✅ Errores de red/timeout con Moodle no rompen el flujo principal de HandsOnEdu.
- ✅ El campo `moodle_synced` se actualiza correctamente tras sincronización exitosa.

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-005 (SQLite) | **Bloqueante** — necesario para rastrear estado de sincronización |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
