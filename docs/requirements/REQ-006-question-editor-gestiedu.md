# REQ-006 — Editor de Preguntas para Docentes (GestiEdu)

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-006 |
| **Tipo** | Feature |
| **Prioridad** | Media |
| **Estado** | 📋 Pendiente |
| **Módulo** | GestiEdu |
| **Esfuerzo estimado** | L (8–12 horas) |

---

## Problema

Las 10 preguntas de GestiEdu están **hardcodeadas en `gestiedu.js`** como un array de objetos JavaScript. Esto significa que:

- El docente **no puede personalizar el contenido** sin editar código fuente.
- Cambiar una pregunta requiere acceso al servidor y conocimientos de JavaScript.
- Todas las clases y cursos usan exactamente las mismas preguntas, sin posibilidad de adaptar al nivel o materia.
- No se pueden agregar imágenes o ajustar los gestos asignados a cada respuesta sin intervención técnica.

Esto contradice uno de los principios pedagógicos centrales de UNAE: la adaptación del contenido al contexto educativo del docente.

---

## Alcance propuesto

### Ruta del editor

```
/gestiedu/editor
```

Accesible solo con **PIN de docente** configurable en `.env`:

```env
GESTIEDU_EDITOR_PIN=1234
```

El PIN se valida en el frontend (MVP) o mediante un endpoint `POST /api/gestiedu/auth` que retorna un token de sesión corta.

### Funcionalidades CRUD

| Operación | Descripción |
|-----------|-------------|
| **Listar** | Ver todas las preguntas existentes en forma de tabla/lista |
| **Crear** | Agregar nueva pregunta con formulario |
| **Editar** | Modificar cualquier campo de una pregunta existente |
| **Eliminar** | Borrar pregunta con confirmación |
| **Reordenar** | Arrastrar y soltar para cambiar el orden de presentación |

### Estructura de una pregunta

```json
{
  "id": "q01",
  "text": "¿Cuántos lados tiene un triángulo?",
  "options": {
    "A": "2",
    "B": "3",
    "C": "4",
    "D": "5"
  },
  "correct_option": "B",
  "correct_gesture": "peace",
  "image_url": null,
  "time_limit": 15,
  "points": 10
}
```

### Mapeo gesto → opción

```
Pulgar arriba  → Opción A
Dedo índice    → Opción B
Señal de paz   → Opción C
Puño cerrado   → Opción D
Mano abierta   → Opción E (si se implementa respuesta múltiple futura)
```

### Estrategia de almacenamiento (dos fases)

**MVP (sin REQ-005):** JSON file en volumen Docker.

```
/app/data/gestiedu_questions.json
```

El frontend lee `GET /api/gestiedu/questions` y escribe via `POST/PUT/DELETE /api/gestiedu/questions`.

**Versión completa (con REQ-005):** Tabla `gestiedu_questions` en SQLite.

### Carga dinámica en el módulo

```javascript
// gestiedu.js — reemplazar array hardcodeado por:
async function loadQuestions() {
  const res = await fetch('/api/gestiedu/questions');
  const data = await res.json();
  return data.questions;
}
```

---

## Archivos a crear / modificar

### Crear
```
app/templates/gestiedu_editor.html   ← UI del editor (formulario CRUD, lista de preguntas)
app/static/js/gestiedu_editor.js     ← lógica del editor, llamadas a API
app/api/gestiedu.py                  ← endpoints REST para preguntas
app/data/gestiedu_questions.json     ← archivo inicial con las 10 preguntas actuales
```

### Modificar
```
app/static/js/gestiedu.js            ← reemplazar array hardcodeado por loadQuestions()
app/main.py                          ← registrar router de gestiedu API y ruta /gestiedu/editor
```

### Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/gestiedu/questions` | Obtener todas las preguntas (orden de presentación) |
| `POST` | `/api/gestiedu/questions` | Crear nueva pregunta |
| `PUT` | `/api/gestiedu/questions/{id}` | Actualizar pregunta existente |
| `DELETE` | `/api/gestiedu/questions/{id}` | Eliminar pregunta |
| `PUT` | `/api/gestiedu/questions/reorder` | Actualizar orden de preguntas |

---

## Criterio de aceptación

- ✅ Acceder a `/gestiedu/editor` sin PIN muestra pantalla de autenticación.
- ✅ Con PIN correcto, el docente puede **ver**, **crear**, **editar** y **eliminar** preguntas.
- ✅ Los cambios se persisten (no se pierden al recargar la página del editor).
- ✅ El módulo GestiEdu **carga las preguntas dinámicamente** desde la API (no del array hardcodeado).
- ✅ Agregar una nueva pregunta en el editor → aparece en la siguiente sesión de GestiEdu sin modificar código.
- ✅ El editor valida campos obligatorios (texto de pregunta, opciones, gesto correcto).
- ✅ Al eliminar la última pregunta, se muestra advertencia (mínimo 1 pregunta requerida).

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-005 (SQLite) | Opcional — el MVP funciona con JSON file sin REQ-005 |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
