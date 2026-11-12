# REQ-018 — Aula de Señas: currículo, práctica y evaluación para estudiantes

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-018 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho (v0.10.0) |
| **Módulo** | Aula de Señas (nuevo) — reemplaza a MotivaSign como módulo principal de señas |
| **Depende de** | REQ-017 (motor y API, ✅) |

---

## Alcance propuesto

- **Ruta de aprendizaje** por unidades del catálogo (`units`), con desbloqueo progresivo.
- **Lección:** ver la seña (descripción, pista y, en el futuro, video del intérprete) → practicar con `verify()` y retroalimentación didáctica → mantener la seña para confirmar.
- **Evaluación:** cuestionario de señas aleatorias de la unidad. El resultado va a `/api/sessions/*` y, con REQ-019, al libro de calificaciones de Moodle.
- **Deletreo:** practicar palabras con el alfabeto dactilológico (secuencias de letras).
- **Repaso espaciado:** priorizar las señas con menor `mastery` (`GET /api/learners/{id}/progress`).
- **Perfil local** (nombre) hasta que LTI aporte la identidad.
- Accesibilidad: alto contraste, textos grandes, sin depender del audio.

## Implementación (v0.10.0)

- Página `/aula` (`aula.html`, `css/aula.css` con prefijo `.au-`, `js/aula.js`); ver [docs/modules/aula.md](../modules/aula.md).
- Lógica pedagógica pura y testeable en `app/static/js/ho-curriculum.js` (`HO.Curriculum`), con tests en `tests/js/ho-curriculum.test.cjs`.
- Backend: `GET /api/learners/{id}/sessions` (historial, filtros `module`, `finished`, `limit`); `SessionOut` incluye `details`.
- Catálogo: `spelling_words` (palabras para deletrear) y `media` opcional por seña (`{"video": URL}`), ambos validados.
- Una unidad se aprueba con ≥ 70% en su evaluación; las unidades sin señas reconocibles aparecen como *Próximamente* y no bloquean la ruta. `?unlock=all` abre todas (modo docente).

### Pendiente

- Videos de intérpretes (`media.video`) para cada seña.
- Identidad real del estudiante vía LTI (REQ-019); hoy es un perfil local por nombre.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
