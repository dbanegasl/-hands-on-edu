# REQ-023 — Validación de señas con intérprete

> **Última actualización:** 2026-11-13

| Campo | Valor |
|-------|-------|
| **ID** | REQ-023 |
| **Tipo** | Feature |
| **Prioridad** | Alta (antes y durante el piloto) |
| **Estado** | ✅ Hecho (v0.22.0) |
| **Módulo** | Contenido / Aula de Señas |

---

## Problema

Todo el contenido LSEC es borrador (`validated: false`). Lo único que puede validarlo es un intérprete, y su tiempo es el recurso más escaso del piloto.

Además de si la descripción es correcta, el intérprete es el único que puede responder la pregunta más grave para el aprendizaje: **¿el sistema acepta la seña mal hecha?** Si la acepta, enseña una seña incorrecta.

Con una hoja en papel ([kit 09, 3 §4](../onboarding/09-kit-piloto/3-encuestas.md#4-revisión-del-intérprete-semana-4-3045-minutos)) la revisión es lenta y depende de cómo se cuente cada intento. Además, el resultado hay que pasarlo a mano al catálogo.

## Solución

### `/validacion`

Página para el intérprete y un docente (requiere `ADMIN_TOKEN` si está configurado):

1. **Preparación:** nombre del intérprete y unidades a revisar (opción *Solo las señas que aún no tienen revisión*). Se estiman unos 2 minutos por seña.
2. **Por cada seña:**
   - **Contenido:** descripción, pista y video, incluidos los pendientes de validación. ¿Son correctos? Si no, qué corregir.
   - **Bien hecha 3 veces:** el sistema debe aceptarla.
   - **Con errores típicos 3 veces:** el sistema debe rechazarla. Se anotan los errores probados.
   - **Decisión sugerida** (se puede cambiar, con nota): *Correcta*, *Corregir el contenido*, *Retirar de la evaluación* o *Grabar más plantillas*.
3. **Informe:** la última revisión de cada seña. Incluye las tarjetas **R1** (porcentaje aceptado bien hecho 3 de 3) y **R2** (señas aceptadas mal hechas), que son los criterios del [informe del piloto](../onboarding/09-kit-piloto/4-informe-final.md#2-criterios-de-éxito). Se puede descargar en CSV, en JSON para el catálogo o imprimir.

**Misma regla que la Evaluación.** Cada intento usa `HO.Curriculum.QUIZ` (mantener 1,2 s dentro de 12 s) con `HoldVerifier`, las mismas plantillas y el modelo entrenado activo. El Aula toma los mismos valores de `QUIZ`, así que no pueden separarse. Antes de cada intento hay una cuenta atrás de 3 s. La barra espaciadora inicia el intento siguiente y *Deshacer el último* descarta un intento fallido por algo ajeno.

**Nada se pierde.** Cada seña se guarda en el servidor al pulsar *Guardar y seguir*.

### Del informe al catálogo

`scripts/apply-sign-reviews.py <json> [--write]` (solo stdlib) toma la última revisión de cada seña:

| Revisión | Catálogo |
|---|---|
| Contenido correcto (y la decisión no es *corregir*) | `validated: true`, `validated_by`, `validated_at` |
| Contenido incorrecto | `validated: false` (sin `validated_by`/`validated_at`) |
| *Retirar*, o aceptada mal hecha sin que el intérprete decida *Correcta* | `assess: false` |
| Una revisión posterior correcta | Se quita `assess` y la seña vuelve a la evaluación |

Sin `--write` solo muestra los cambios. El catálogo cambia por pull request, como cualquier contenido.

### `assess: false` en el Aula

`unitStatus` devuelve `quizSigns`: las señas disponibles menos las retiradas.
- La **Evaluación** usa solo `quizSigns`. La **Lección** las mantiene.
- La tarjeta de la unidad dice cuántas están «en revisión».
- Una unidad sin señas evaluables no bloquea la siguiente.

### Catálogo

`app/signs/catalog.py` valida estos campos:
- `validated` y `assess` son booleanos;
- `validated_by` y `validated_at` (AAAA-MM-DD) van juntos y solo en señas validadas.

El test que exigía `validated: false` en todas las señas ahora exige nombre y fecha en las validadas.

## Datos

Tabla `sign_reviews` (migración 0004):
- `language`, `sign_id`, `reviewer`, `sitting`;
- `content_ok`, `content_note`, `recognizable`;
- `good_ok/good_trials`, `bad_ok/bad_trials`, `bad_note`;
- `decision`, `note`;
- `engine`: plantillas de la seña, modelo activo, motor y versión de la app;
- `created_at`.

No guarda datos de estudiantes ni imágenes. El nombre del intérprete aparece en `/privacidad` y en la guía [08](../onboarding/08-privacidad.md).

API (`X-Admin-Token`):

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/signs/{lang}/reviews` | Guarda la revisión de una seña. Valida que la seña exista y que los aceptados no superen los intentos |
| GET | `/api/signs/{lang}/reviews` | Última revisión de cada seña |
| GET | `/api/signs/{lang}/reviews?history=true` | Todas las revisiones |

## Criterios de aceptación

- [x] El intento usa exactamente la regla, las plantillas y el modelo de la Evaluación.
- [x] La decisión sugerida prioriza: corregir contenido > retirar (acepta mal hecha) > regrabar.
- [x] No se puede guardar sin responder el contenido y hacer 3 + 3 intentos (salvo contenido incorrecto o seña sin plantillas).
- [x] El informe muestra R1 y R2 y exporta CSV (Excel en español) y JSON.
- [x] El script aplica el JSON al catálogo y el catálogo resultante pasa la validación.
- [x] Las señas con `assess: false` no entran en la Evaluación y siguen en la Lección.
- [x] Pruebas:
  - API, campos del catálogo y script en `tests/test_reviews.py`;
  - lógica en `tests/js/validacion.test.cjs` y `ho-curriculum.test.cjs`;
  - E2E en Chromium con cámara simulada (seña «1»).

## Fuera de alcance

- Revisión simultánea de varios intérpretes con acuerdo entre ellos (se guarda el historial; el informe usa la última).
- Grabar la sesión en video: no se guardan imágenes.
