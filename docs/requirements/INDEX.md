# 📋 Índice de Requisitos — HandsOnEdu

> **Última actualización:** 2026-04-30

Este documento es el **backlog maestro** del proyecto HandsOnEdu. Registra todos los requisitos funcionales, mejoras y deuda técnica pendientes, con su prioridad, estado y módulo asociado.

## ¿Cómo usar este backlog?

- Cada requisito tiene su propio archivo detallado en `docs/requirements/REQ-XXX-*.md`.
- Para agregar un nuevo requisito: crea el archivo `REQ-NNN-titulo-corto.md` siguiendo la plantilla de cualquier REQ existente, y añade una fila a la tabla de abajo.
- Actualiza el **Estado** de un requisito cuando pase de fase (Pendiente → En progreso → Hecho).
- Los requisitos de prioridad **Alta** deben resolverse antes de cualquier despliegue a producción institucional en UNAE.

---

## Tabla maestra de requisitos

| ID | Título | Tipo | Prioridad | Estado | Módulo relacionado |
|----|--------|------|-----------|--------|--------------------|
| [REQ-001](./REQ-001-unit-tests.md) | Suite de Tests Unitarios e Integración | Tech-Debt | Alta | 📋 Pendiente | Global / Backend |
| [REQ-002](./REQ-002-audio-feedback.md) | Feedback de Audio en GestiEdu y MotivaSign | Mejora | Media | 📋 Pendiente | GestiEdu, MotivaSign |
| [REQ-003](./REQ-003-pdf-export-attendeye.md) | Exportación PDF del Reporte de Asistencia | Mejora | Media | 📋 Pendiente | AttendEye |
| [REQ-004](./REQ-004-undo-virtualpainter.md) | Deshacer / Rehacer en VirtualPainter | Mejora | Media | 📋 Pendiente | VirtualPainter |
| [REQ-005](./REQ-005-sqlite-persistence.md) | Persistencia de Sesiones con SQLite | Feature | Alta | 📋 Pendiente | Global / Backend |
| [REQ-006](./REQ-006-question-editor-gestiedu.md) | Editor de Preguntas para Docentes (GestiEdu) | Feature | Media | 📋 Pendiente | GestiEdu |
| [REQ-007](./REQ-007-teacher-dashboard.md) | Dashboard del Docente | Feature | Alta | 📋 Pendiente | Global |
| [REQ-008](./REQ-008-basic-auth.md) | Autenticación Básica (Roles Docente / Estudiante) | Feature | Alta | 📋 Pendiente | Global |
| [REQ-009](./REQ-009-moodle-integration.md) | Integración Real con Moodle LMS | Feature | Baja | 📋 Pendiente | Global / Backend |
| [REQ-010](./REQ-010-custom-ml-classifier.md) | Clasificador ML de Gestos Personalizado | Feature | Baja | 📋 Pendiente | Global / Backend |
| [REQ-011](./REQ-011-cicd-github-actions.md) | Pipeline CI/CD con GitHub Actions | Tech-Debt | Alta | 📋 Pendiente | Global / DevOps |

---

## Leyenda

| Campo | Valores posibles |
|-------|-----------------|
| **Tipo** | `Feature` — nueva funcionalidad · `Mejora` — mejora sobre algo existente · `Tech-Debt` — deuda técnica a saldar |
| **Prioridad** | `Alta` — bloquea producción o seguridad · `Media` — importante pero no urgente · `Baja` — nice-to-have |
| **Estado** | 📋 Pendiente · 🔄 En progreso · ✅ Hecho |

---

## Orden de implementación recomendado

```
REQ-001 (tests) → REQ-011 (CI/CD) → REQ-005 (SQLite) → REQ-008 (auth)
    → REQ-007 (dashboard) → REQ-006 (editor preguntas)
    → REQ-002, REQ-003, REQ-004 (mejoras UX, paralelo)
    → REQ-009, REQ-010 (integraciones avanzadas)
```

Los requisitos de infraestructura (REQ-001, REQ-005, REQ-008) son prerrequisitos implícitos de la mayoría de los demás.
