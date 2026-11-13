# REQ-021 — Privacidad y derechos sobre los datos de los estudiantes

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-021 |
| **Tipo** | Feature |
| **Prioridad** | Alta (requisito del piloto institucional) |
| **Estado** | ✅ Hecho (v0.20.0) |
| **Módulo** | Global / Aula de Señas |

---

## Problema

El piloto con estudiantes reales, posiblemente menores de edad, necesita tres cosas que la plataforma no ofrecía:

- **Un aviso de privacidad** que explique qué se guarda. La lista para producción de [03 §7](../onboarding/03-moodle-institucional.md#7-lista-para-salir-a-producción) lo exigía y no existía.
- **Una forma de ejercer los derechos de acceso y eliminación.** No había manera de descargar ni borrar los datos de un estudiante.
- **Un plazo de conservación** y una forma de aplicarlo al terminar el piloto.

## Solución

### Para el estudiante: `/privacidad`

- Explica en lenguaje sencillo qué se guarda, qué no (video, imágenes, audio, correo), quién lo ve y cuánto tiempo.
- Muestra el **responsable** y el **contacto** de la institución (`PRIVACY_CONTROLLER`, `PRIVACY_CONTACT`) y el plazo (`DATA_RETENTION_DAYS`), que lee de `GET /api/privacy`.
- **Tus datos en este equipo:** lista los perfiles locales del navegador (`ho.aula.profiles`) y la cuenta de Moodle de la pestaña (`ho.lti.token`), cada uno con **Descargar** y **Borrar**. Borrar pide confirmación y después olvida el perfil o el token en el navegador.
- Enlazada desde el Aula de Señas (barra superior y pantalla de perfil) y desde la página de inicio. Es imprimible y tiene modo oscuro.

### API (misma credencial que el resto de datos del estudiante, TD-013)

| Método y ruta | Qué hace |
|---|---|
| `GET /api/privacy` | Responsable, contacto, plazo de conservación (público) |
| `GET /api/learners/{id}/export` | JSON con todo lo guardado (perfil, sesiones con intentos, accesos desde el LMS, notas enviadas), sin secretos |
| `DELETE /api/learners/{id}` | Borra el estudiante y, en cascada, sesiones, intentos, lanzamientos LTI, vínculos y envíos de notas. 204 |

La credencial puede ser el `X-Learner-Token` del perfil, el token de lanzamiento LTI del propio estudiante o `ADMIN_TOKEN`. Borrar no modifica Moodle.

### Para la institución: `python -m app.privacy`

- `find <nombre>`: buscar un estudiante.
- `export <id> [-o archivo]`: entregarle sus datos.
- `delete <id> [--yes]`: borrarlo.
- `purge [--days N] [--attendance-days N] [--yes]`: borrar a los estudiantes sin actividad y los pases de lista antiguos. Sin `--yes` solo lista lo que se borraría.

Guía: [08 · Privacidad](../onboarding/08-privacidad.md), con una plantilla del aviso para familias.

### Comprobación

`deploy/check-install.py` avisa si faltan `PRIVACY_CONTROLLER` o `PRIVACY_CONTACT`.

## Pruebas

- `tests/test_privacy.py`:
  - exportación completa sin secretos;
  - credenciales: 401, 403, admin y LTI;
  - el borrado en cascada no toca a otros estudiantes y deja de valer el token LTI;
  - `purge` respeta la actividad reciente y la confirmación;
  - la CLI;
  - la validación de `DATA_RETENTION_DAYS`.
- `tests/js/privacidad.test.cjs`: lectura y limpieza de los perfiles del navegador.
- `scripts/test-deploy.sh`: las variables `PRIVACY_*` llegan a la app desde `.env`, y la CLI funciona en la imagen publicada.
- E2E en Chromium (manual):
  - un perfil creado en el Aula se descarga y se borra desde `/privacidad`;
  - cancelar la confirmación no borra;
  - una cuenta de Moodle se borra y su token se olvida;
  - sin desplazamiento horizontal en un móvil de 390 px.

## Fuera de alcance

- Registro de consentimientos dentro de la plataforma: lo gestiona la institución (ver la guía 08).
- Borrado automático programado: `purge` se ejecuta a mano o con cron, para que nadie borre datos sin querer al cambiar una variable.
