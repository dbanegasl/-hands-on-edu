# REQ-019 — Integración LTI 1.3 con Moodle (lanzamiento SSO + notas AGS)

> **Última actualización:** 2026-11-11

| Campo | Valor |
|-------|-------|
| **ID** | REQ-019 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | 📋 Pendiente |
| **Módulo** | Global / Integraciones |
| **Reemplaza** | El enfoque de tokens REST de [REQ-009](./REQ-009-moodle-integration.md) para notas |

---

## Por qué LTI 1.3 y no solo REST

Con LTI 1.3 (estándar IMS), el docente agrega HandsOnEdu en Moodle como **Herramienta externa**. El estudiante entra con un clic desde su curso, sin crear otra cuenta, y la nota vuelve **sola** al libro de calificaciones mediante *Assignment and Grade Services* (AGS). Así funcionan las herramientas educativas de referencia, y funciona igual con Canvas, Blackboard y Brightspace.

## Alcance propuesto

- Endpoints `/lti/login` (OIDC login initiation), `/lti/launch` (validación de `id_token` JWT contra el JWKS de la plataforma) y `/lti/jwks` (clave pública de la herramienta).
- Registro de plataformas (issuer, client_id, deployment_id, URLs de auth/token/JWKS) en BD; opcionalmente *Dynamic Registration*.
- Mapeo `iss + sub` → `Learner.external_id` (columna ya existente); roles Instructor/Learner → acceso al Estudio y al panel docente.
- **Deep Linking:** el docente elige la unidad o evaluación del Aula de Señas al crear la actividad.
- **AGS:** al terminar una sesión, publicar `scoreGiven/scoreMaximum` en el *line item* del lanzamiento.
- **NRPS** (opcional): lista del curso para el panel docente.
- Pruebas con un Moodle 4.x en Docker (`docker-compose.moodle.yml`).

---

*Volver al [Índice de Requisitos](./INDEX.md)*
