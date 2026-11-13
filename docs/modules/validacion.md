# Validación con intérprete (`/validacion`)

> Requisito: [REQ-023](../requirements/REQ-023-validacion-interprete.md) · Guía de uso: [04 · Contenido LSEC §2](../onboarding/04-contenido-lsec.md#2-validar-las-descripciones-intérprete--editor-del-catálogo)

Un intérprete de LSEC revisa cada seña:
- ¿el contenido es correcto?
- ¿el sistema la acepta bien hecha?
- ¿la rechaza mal hecha?

Las pruebas usan la misma regla que la Evaluación del Aula. El resultado sirve para dos cosas: los criterios R1/R2 del piloto y el catálogo (`scripts/apply-sign-reviews.py`).

## Archivos

| Archivo | Contenido |
|---|---|
| `app/static/validacion.html` | Tres pantallas: preparación, revisión de una seña e informe |
| `app/static/css/validacion.css` | Prefijo `.vl-`, modo claro y oscuro, informe imprimible |
| `app/static/js/validacion.js` | Lógica sin DOM: `decide`, `complete`, `summarize`, `planSigns`, `toCSV`, `Trial`. Se exporta para node y como `HO.Review`; la página se monta solo si existe `#vl-app` |
| `app/api/reviews.py` | `POST`/`GET /api/signs/{lang}/reviews` (admin) |
| `app/models.py` → `SignReview` | Tabla `sign_reviews` (migración 0004) |
| `scripts/apply-sign-reviews.py` | JSON del informe → `validated`/`validated_by`/`validated_at`/`assess` en el catálogo |

## Cómo funciona un intento

`Trial` es una máquina de estados:
1. **Cuenta atrás** de 3 s.
2. **En curso:** se reinicia `HoldVerifier`, lo que limpia el historial de las señas con movimiento. Aplica `HO.Curriculum.QUIZ`: mantener 1,2 s dentro de 12 s.
3. **Hecho:** termina con `accepted` verdadero o falso.

El reconocedor se construye como en el Aula: catálogo, plantillas y modelo activo.

## Decisión sugerida (`decide`)

1. `content_ok === false` → **corregir**.
2. Algún intento con error aceptado → **retirar**.
3. Sin plantillas, o bien hecha aceptada menos de 3 de 3 → **regrabar**.
4. Si no se cumple nada de lo anterior → **ok**.

Se muestran todos los motivos; la decisión es la de más prioridad. El intérprete puede cambiarla.

## Pruebas

- `tests/js/validacion.test.cjs`
- `tests/js/ho-curriculum.test.cjs`: `quizSigns` y `QUIZ`
- `tests/test_reviews.py`
