# 📋 Índice de Requisitos — HandsOnEdu

> **Última actualización:** 2026-11-12

Este documento es el **backlog maestro** del proyecto HandsOnEdu. Registra todos los requisitos funcionales, mejoras y deuda técnica pendientes, con su prioridad, estado y módulo asociado.

## ¿Cómo usar este backlog?

- Cada requisito tiene su propio archivo detallado en `docs/requirements/REQ-XXX-*.md`.
- Para agregar un nuevo requisito: crea el archivo `REQ-NNN-titulo-corto.md` siguiendo la plantilla de cualquier REQ existente, y añade una fila a la tabla de abajo.
- Actualiza el **Estado** de un requisito cuando pase de fase (Pendiente → En progreso → Hecho).
- Los requisitos de prioridad **Alta** deben resolverse antes de cualquier despliegue a producción institucional.

---

## Tabla maestra de requisitos

| ID | Título | Tipo | Prioridad | Estado | Módulo relacionado |
|----|--------|------|-----------|--------|--------------------|
| [REQ-001](./REQ-001-unit-tests.md) | Suite de Tests Unitarios e Integración | Tech-Debt | Alta | ✅ Hecho | Global / Backend |
| [REQ-002](./REQ-002-audio-feedback.md) | Feedback de Audio en GestiEdu y MotivaSign | Mejora | Media | ✅ Hecho | GestiEdu, MotivaSign |
| [REQ-003](./REQ-003-pdf-export-attendeye.md) | Exportación PDF del Reporte de Asistencia | Mejora | Media | ✅ Hecho | AttendEye |
| [REQ-004](./REQ-004-undo-virtualpainter.md) | Deshacer / Rehacer en VirtualPainter | Mejora | Media | ✅ Hecho | VirtualPainter |
| [REQ-005](./REQ-005-sqlite-persistence.md) | Persistencia de Sesiones con SQLite | Feature | Alta | ✅ Hecho (v0.13.0: GestiEdu, MotivaSign y AttendEye guardan resultados) | Global / Backend |
| [REQ-006](./REQ-006-question-editor-gestiedu.md) | Editor de Preguntas para Docentes (GestiEdu) | Feature | Media | 📋 Pendiente | GestiEdu |
| [REQ-007](./REQ-007-teacher-dashboard.md) | Panel docente (progreso del curso, lista NRPS, CSV) | Feature | Alta | ✅ Hecho (v0.12.0, Aula de Señas) | Aula / Global |
| [REQ-008](./REQ-008-basic-auth.md) | Autenticación Básica (Roles Docente / Estudiante) | Feature | Alta | 📋 Pendiente | Global |
| [REQ-009](./REQ-009-moodle-integration.md) | Integración Real con Moodle LMS (REST) — notas reemplazadas por REQ-019 | Feature | Baja | 📋 Pendiente | Global / Backend |
| [REQ-010](./REQ-010-custom-ml-classifier.md) | Clasificador entrenado con las plantillas de señas | Feature | Media | ✅ Hecho (v0.14.0, señas estáticas de una mano) | Motor de señas / Estudio |
| [REQ-011](./REQ-011-cicd-github-actions.md) | Pipeline CI/CD con GitHub Actions | Tech-Debt | Alta | ✅ Hecho (CI v0.9.0; entrega continua v0.15.0) | Global / DevOps |
| [REQ-012](./REQ-012-airpiano-module.md) | Módulo AirPiano (Piano virtual gestual) | Feature | Media | ✅ Hecho | AirPiano (nuevo) |
| [REQ-013](./REQ-013-detection-robustness.md) | Robustez de detección (heurística invariante + suavizado) | Tech-Debt | Alta | ✅ Hecho | Global / Backend |
| [REQ-014](./REQ-014-shared-frontend-lib.md) | Librería frontend compartida `ho-common.js` | Tech-Debt | Alta | ✅ Hecho | Global / Frontend |
| [REQ-015](./REQ-015-module-fixes-ux-polish.md) | Correcciones de detección y pulido UX por módulo | Mejora | Alta | ✅ Hecho | Todos los módulos |
| [REQ-016](./REQ-016-browser-hand-engine.md) | Detección de manos en el navegador (MediaPipe Tasks JS) | Tech-Debt | Alta | ✅ Hecho | Global / Frontend |
| [REQ-017](./REQ-017-sign-recognition-engine.md) | Motor de reconocimiento de señas + Estudio de Señas (LSEC) | Feature | Alta | ✅ Hecho (contenido por validar) | Global / Señas |
| [REQ-018](./REQ-018-aula-de-senas.md) | Aula de Señas: currículo, práctica y evaluación | Feature | Alta | ✅ Hecho | Aula de Señas (nuevo) |
| [REQ-019](./REQ-019-lti13-moodle.md) | Integración LTI 1.3 con Moodle (SSO + notas AGS) | Feature | Alta | ✅ Hecho (probado con Moodle 4.5.4; falta piloto institucional) | Global / Integraciones |
| [REQ-020](./REQ-020-videos-ia-validados.md) | Videos de referencia generados con IA y validados por intérprete | Feature | Alta | 🔄 En progreso (falta producir y validar) | Aula / Contenido LSEC |
| [REQ-021](./REQ-021-privacidad-datos.md) | Privacidad: aviso, descarga y borrado de los datos del estudiante, plazo de conservación | Feature | Alta | ✅ Hecho (v0.20.0) | Global / Aula |
| [REQ-022](./REQ-022-diagnostico-equipos.md) | Diagnóstico de equipos antes de la clase (`/diagnostico` + resumen en el panel) | Feature | Alta | ✅ Hecho (v0.21.0) | Global / Panel |
| [REQ-023](./REQ-023-validacion-interprete.md) | Validación de señas con intérprete (`/validacion`: contenido, acepta bien hecha, rechaza mal hecha → catálogo) | Feature | Alta | ✅ Hecho (v0.22.0) | Contenido / Aula |

---

## Leyenda

| Campo | Valores posibles |
|-------|-----------------|
| **Tipo** | `Feature` — nueva funcionalidad · `Mejora` — mejora sobre algo existente · `Tech-Debt` — deuda técnica a saldar |
| **Prioridad** | `Alta` — bloquea producción o seguridad · `Media` — importante pero no urgente · `Baja` — nice-to-have |
| **Estado** | 📋 Pendiente · 🔄 En progreso · ✅ Hecho |

---

## Orden de implementación recomendado

Dirección de producto (2026-11-11): plataforma de referencia para la **enseñanza de lengua de señas (LSEC)** integrada con LMS.

```
✅ REQ-016 (detección en navegador) → ✅ REQ-017 (motor de señas + Estudio)
    → ✅ REQ-018 (Aula de Señas) → ✅ REQ-019 (LTI 1.3 + notas en Moodle)
    → ✅ REQ-007 (panel docente) → ✅ REQ-005 (persistencia de GestiEdu/MotivaSign/AttendEye)
    → ✅ REQ-010 (clasificador entrenado con las plantillas grabadas) → ✅ REQ-011 (entrega continua)
    → ✅ REQ-021 (privacidad y derechos sobre los datos) → ✅ REQ-022 (diagnóstico de equipos)
    → ✅ REQ-023 (validación con intérprete) → piloto institucional
```

REQ-008 (autenticación) queda cubierto mayormente por los roles de LTI 1.3. Para el uso sin LMS, `ADMIN_TOKEN` protege provisionalmente la escritura de plantillas.
