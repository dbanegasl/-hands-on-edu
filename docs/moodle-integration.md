# Integración con Moodle — HandsOnEdu

## Prerrequisitos en Moodle

### 1. Activar Servicios Web

```
Administración del sitio
  → Plugins
    → Servicios web
      → Vista general → Activar servicios web ✅
      → Protocolos → Habilitar REST ✅
```

### 2. Crear usuario de servicio

Crea un usuario dedicado (ej: `handsoneau_service`) con rol de **Profesor** o **Gestor** en los cursos que necesita acceder.

### 3. Crear token de acceso

```
Administración del sitio
  → Plugins
    → Servicios web
      → Gestionar tokens
        → Agregar token (usuario: handsoneau_service)
```

Copia el token generado y agrégalo en tu `.env`:

```env
MOODLE_URL=https://moodle.unae.edu.ec
MOODLE_TOKEN=abc123...
```

## Funciones REST Usadas

| Función Moodle | Uso en HandsOnEdu |
|---------------|-------------------|
| `core_course_get_courses` | Listar cursos disponibles |
| `core_grades_update_grades` | Enviar calificación de evaluación gestual |
| `core_completion_update_activity_completion_status_manually` | Marcar actividad como completada |

## Habilitar funciones en Moodle

Cada función debe estar habilitada en el servicio web:

```
Administración del sitio → Plugins → Servicios web
  → Servicios externos → HandsOnEdu Service
    → Agregar funciones → (buscar y agregar las funciones listadas)
```

## Ejemplo de uso desde Python

```python
from app.integrations.moodle.rest_api import MoodleClient

client = MoodleClient()

# Enviar calificación de 9/10 al estudiante con ID 42
await client.submit_grade(
    course_id=5,
    item_name="GestiEdu - Evaluación de Conteo",
    user_id=42,
    grade=9.0
)
```
