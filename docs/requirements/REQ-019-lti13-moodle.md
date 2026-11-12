# REQ-019 — Integración LTI 1.3 con Moodle (lanzamiento SSO + notas AGS)

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-019 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho (v0.11.0) — probado de punta a punta con Moodle 4.5.4 (`docker-compose.moodle.yml`); falta piloto en un Moodle institucional |
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

## Implementado (v0.11.0)

| Pieza | Dónde |
|---|---|
| Inicio de sesión OIDC (`GET`/`POST /lti/login`), validación del `id_token` (`POST /lti/launch`) | `app/integrations/lti/launch.py`, `app/api/lti.py` |
| Claves de la herramienta (RS256, creadas en la BD al primer uso) y `GET /lti/jwks` | `app/integrations/lti/keys.py` |
| Inicio de sesión único: `iss + sub` → `Learner.external_id = lti:<plataforma>:<sub>`; nombre desde el `id_token` | `app/api/lti.py` |
| Token de lanzamiento para el navegador (RS256, 8 h) en el fragmento `#lti=`; `Authorization: Bearer` en la API | `keys.issue_app_token`, `app/api/deps.py` |
| AGS: al terminar una evaluación (`quiz:<unidad>`) se publica `scoreGiven/100` en el *line item* del lanzamiento, en segundo plano; se conserva la **mejor** nota; cada envío queda auditado | `app/integrations/lti/services.py`, tabla `lti_score_submissions` |
| Deep Linking: el docente elige unidades (con o sin calificación) o el curso completo | `/lti/deeplink`, `POST /api/lti/deeplink` |
| Registro de plataformas y despliegues (admin) y página de configuración guiada | `/api/lti/platforms`, `/lti/setup` |
| Aula en modo LMS: sin pantalla de perfil, unidad asignada abierta y resaltada, docentes con todo abierto, estado del envío de la nota | `app/static/js/aula.js` |

Validaciones del lanzamiento: firma con el JWKS de la plataforma (caché de 1 h, se vuelve a pedir si aparece un `kid` nuevo), `iss`, `aud` (y `azp` si hay varias audiencias), `exp`/`iat` con 60 s de tolerancia, `nonce` ligado a un `state` de un solo uso (10 min), versión 1.3.0, tipo de mensaje, `deployment_id` registrado y `resource_link`.

Guía para administradores: [docs/moodle-integration.md](../moodle-integration.md).

## Pendiente

- [ ] Prueba con un Moodle 4.x real (hoy: 40 tests con plataforma simulada + E2E en navegador con un LMS simulado).
- [ ] *Dynamic Registration* (pegar una URL en Moodle en lugar de copiar datos a mano).
- [ ] NRPS (lista del curso) para el panel docente (REQ-007).
- [ ] Ligar el `state` a una cookie del navegador cuando el LMS abre en ventana nueva (hoy el `state` es de un solo uso en el servidor; aceptado en TD-013).

---

*Volver al [Índice de Requisitos](./INDEX.md)*
