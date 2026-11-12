# REQ-018 — Aula de Señas: currículo, práctica y evaluación para estudiantes

> **Última actualización:** 2026-11-11

| Campo | Valor |
|-------|-------|
| **ID** | REQ-018 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | 📋 Pendiente |
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

---

*Volver al [Índice de Requisitos](./INDEX.md)*
