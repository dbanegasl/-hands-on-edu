# Aula de Señas — Curso para estudiantes

## Propósito

El curso de lengua de señas (hoy LSEC) para estudiantes: aprender cada seña frente a la cámara con corrección en vivo, demostrar lo aprendido en una evaluación y repasar lo que más cuesta. Todo el reconocimiento ocurre en el navegador; el servidor solo guarda los intentos y resultados.

## URL

`http://localhost:9876/aula` · parámetros opcionales: `?lang=<código>` (catálogo, por defecto `lsec`) y `?unlock=all` (modo docente: todas las unidades abiertas).

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/static/aula.html` | Pantallas: perfil · ruta · actividad · resultados |
| `app/static/css/aula.css` | Prefijo `.au-`; alto contraste, textos grandes, respeta `prefers-reduced-motion` |
| `app/static/js/aula.js` | Interfaz, cámara, llamadas a la API |
| `app/static/js/ho-curriculum.js` | Lógica pedagógica sin DOM (`HO.Curriculum`), probada con `node --test` |
| `app/static/js/ho-signs.js` | Motor de reconocimiento (ver `docs/sign-engine.md`) |

## Flujo

1. **Perfil:** el estudiante escribe su nombre (`POST /api/learners`). Los perfiles del equipo se recuerdan en `localStorage` para continuar con un clic. Con LTI (REQ-019) la identidad vendrá de Moodle.
2. **Ruta:** las unidades del catálogo (`units`) en orden. Cada tarjeta muestra el estado, las señas (verde = dominada, tachada = sin grabación) y el dominio promedio.
3. **Actividades:**

| Actividad | Qué hace | Confirmación | Tiempo |
|-----------|----------|--------------|--------|
| Lección | Muestra descripción, pista, plantilla de referencia y video (si existe) | Mantener la seña 1,2 s | Sin límite; *Saltar* tras 6 s |
| Evaluación | Solo la glosa; todas las señas de la unidad en orden aleatorio (mín. 5 ítems si la unidad es pequeña) | Mantener 1,2 s | 12 s por seña |
| Repaso | Hasta 8 señas practicadas con dominio < 0,8 o sin práctica en 3 días; pista a los 6 s | Mantener 1 s | 15 s por seña |
| Deletreo | Una palabra de `spelling_words` cuyas letras sean todas reconocibles; letra por letra | Mantener 0,7 s | *Saltar* tras 5 s |

Las señas con movimiento se confirman cuando la verificación DTW acierta, sin necesidad de mantenerlas.

4. **Resultados:** nota (A–D en evaluaciones, % en el resto) y detalle por seña.

## Reglas de progreso

- Una unidad se **aprueba** con ≥ 70% en su evaluación (`activity = "quiz:<unit_id>"`, leída de `GET /api/learners/{id}/sessions`).
- La primera unidad *jugable* está abierta; cada unidad jugable se abre al aprobar la anterior jugable.
- Una unidad sin señas reconocibles (sin descriptor ni plantillas) aparece como **Próximamente** y no bloquea la ruta. Al grabar plantillas en el [Estudio de Señas](./signstudio.md) se vuelve jugable.
- Dentro de una unidad, las señas sin grabación se omiten y se indica cuántas faltan.

## Datos que guarda

| Endpoint | Cuándo |
|----------|--------|
| `POST /api/sessions` | Al empezar una actividad (`module = "aula_senas"`, `activity = lesson:u1 / quiz:u1 / review / spell:OSO`) |
| `POST /api/sessions/{id}/attempts` | Tras cada seña: `correct`, `confidence` (mejor puntaje), `response_ms` |
| `POST /api/sessions/{id}/finish` | Al terminar o salir: `score`, `max_score`, `details` (ítems, unidad, palabra, si se completó) |

Si un envío de intento falla se reintenta al cerrar la sesión.

## Contenido

En `app/content/<lang>/catalog.json`:

- `spelling_words`: lista de palabras para el deletreo (se tokenizan con los dígrafos CH, LL, RR y la Ñ).
- `media` opcional por seña: `{"video": "https://…"}` se muestra en la lección.

El contenido LSEC actual es un **borrador sin validar**; el aula lo indica con un aviso.
