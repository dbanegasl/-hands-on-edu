# REQ-017 — Motor de reconocimiento de señas + Estudio de Señas (LSEC)

> **Última actualización:** 2026-11-11

| Campo | Valor |
|-------|-------|
| **ID** | REQ-017 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho (v0.9.0) — contenido LSEC pendiente de validación lingüística |
| **Módulo** | Global / Señas |

---

## Problema

MotivaSign reconocía 8 gestos universales (👍 ✌️ 🤙) con reglas fijas. No había lengua de señas real: ni alfabeto dactilológico, ni señas con movimiento, ni análisis a dos manos, ni forma de que un docente enseñara señas nuevas al sistema.

## Solución implementada

- **Catálogo como datos:** `app/content/lsec/catalog.json`, con 50 señas (30 letras, 10 números, 10 saludos), 3 categorías y 8 unidades. Validación estricta del esquema en `app/signs/catalog.py`.
- **Motor** `app/static/js/ho-signs.js` (detalle en [docs/sign-engine.md](../sign-engine.md)):
  - descriptores de forma de mano con **retroalimentación didáctica** en español;
  - kNN sobre plantillas grabadas, también a dos manos;
  - DTW para señas con movimiento;
  - canonicalización diestro/zurdo.
- **API:** `GET /api/languages`, `GET /api/signs/{lang}/catalog`, `GET|POST /api/signs/{lang}/templates`, `POST …/templates/import`, `DELETE …/templates/{id}`. Escritura protegida por `ADMIN_TOKEN`.
- **Persistencia de aprendizaje (base de REQ-005):** `POST /api/learners`, `POST /api/sessions`, `POST /api/sessions/{id}/attempts`, `POST /api/sessions/{id}/finish`, `GET /api/learners/{id}/progress?language=` (dominio por seña con EWMA).
- **Estudio de Señas** (`/signstudio`): explorar, probar en vivo, grabar, exportar e importar.
- **Calibración con fotos reales** de MediaPipe (`tests/fixtures/real_hands.json`) y prueba de extremo a extremo en Chromium.

## Pendiente

- Validación del contenido LSEC con intérpretes y la comunidad sorda (`validated: true` por seña).
- Grabar plantillas de las 30 señas que no tienen descriptor.
- Ubicación corporal (Pose/Face) para el vocabulario léxico.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
