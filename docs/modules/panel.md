# Panel docente — Progreso del curso (REQ-007)

## Propósito

Que el docente vea en una pantalla cómo avanza su grupo en el Aula de Señas, y que sepa **a quién ayudar** y **qué señas reforzar**. No reemplaza al libro de calificaciones de Moodle: lo complementa con el detalle por seña que Moodle no tiene.

## URL y acceso

`/panel` — dos formas de entrar, con alcance distinto:

| Cómo se entra | Qué se ve |
|---|---|
| Desde Moodle: el docente abre una actividad del Aula (modo docente) → botón **📊 Panel del curso** del banner. También como destino directo del lanzamiento (`target_link_uri` = `/panel`) | **Ese curso:** estudiantes del curso (lista NRPS de Moodle + quienes ya entraron) y solo la práctica hecha desde ese curso |
| Directo, con el token de administrador (`ADMIN_TOKEN`; abierto si no está definido) | **Toda la instalación:** todos los estudiantes con actividad (uso local sin LMS) |

Un estudiante con token LTI recibe 403. La práctica que hacen los docentes en modo docente **nunca** cuenta en las estadísticas.

## Contenido

| Sección | Qué muestra |
|---|---|
| Tarjetas | Estudiantes (y cuántos han practicado), activos en 7 días, mejor nota media, evaluaciones hechas, tiempo de práctica, **notas no enviadas** a la plataforma |
| Estudiantes activos por semana | Barras de las últimas 8 semanas (lunes a domingo, UTC); el tooltip añade actividades y nota media; *Ver como tabla* para lectores de pantalla |
| Estudiantes y unidades | Mapa de calor: mejor nota de la evaluación de cada unidad (escala azul de un solo tono; cada celda lleva su número y ✔ si está aprobada). Buscador, orden (nombre, última actividad, unidades, dominio, sin actividad primero). Pie: aprobados / con evaluación por unidad |
| Señas con más dificultad | Las 10 señas con menor % de aciertos del grupo (mín. 3 intentos), con nº de intentos y tiempo medio al acertar |
| Detalle del estudiante | Dominio por seña agrupado por unidad, lista de actividades con resultado y **estado de la nota en la plataforma**; las notas fallidas tienen botón *Reintentar* |
| Otros módulos (solo vista de instalación) | Acierto medio, partidas y estudiantes de **GestiEdu** y **MotivaSign** (desafíos; la práctica libre no cuenta) y asistencia media, listas, clases y participación de **AttendEye**. Quien solo usó esos juegos aparece en la tabla y su detalle lista esas partidas (REQ-005) |
| Equipos del laboratorio | Resultado de [`/diagnostico`](../requirements/REQ-022-diagnostico-equipos.md) en los últimos 7 días, con filtro por sala: equipos probados, listos, con avisos y no aptos, **cámara a la primera** y velocidad mediana; tabla con el último resultado de cada puesto (los problemas primero); enlace del diagnóstico con la sala para copiar |
| Exportar CSV | Una fila por estudiante: última actividad, sesiones, minutos, unidades aprobadas, señas dominadas, dominio medio, notas no enviadas y mejor % por unidad (UTF-8 con BOM para Excel) |

Las métricas reutilizan las del Aula: dominio = media móvil exponencial de aciertos (`compute_mastery`, dominada ≥ 0,8), unidad aprobada = mejor evaluación ≥ 70%, el tiempo de una sesión se limita a 1 h.

## Lista del curso (NRPS)

Si la herramienta de Moodle tiene activado **IMS LTI Names and Role Provisioning**, el lanzamiento trae `context_memberships_url`. HandsOnEdu la guarda en `lti_contexts` y el panel pide la lista con un token OAuth2 de alcance `contextmembership.readonly` (paginación por cabecera `Link`, caché de 5 min). Así aparecen también los estudiantes que **nunca abrieron** la actividad (*sin actividad*).

Sin NRPS, o si falla, el panel funciona igual con los estudiantes que ya entraron y muestra un aviso.

## API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/panel/overview?language=lsec` | Alcance, lista (estado NRPS), resumen, unidades, estudiantes, semanas y señas |
| `GET` | `/api/panel/learners/{id}?language=lsec` | Detalle de un estudiante del alcance (404 si no pertenece al curso) |
| `POST` | `/api/panel/sessions/{id}/grade/retry` | Reintenta un envío AGS cuyo último estado es `failed` (409 en otro caso) |
| `GET` | `/api/panel/export.csv?language=lsec&tz=-300` | CSV del curso (`tz`: minutos respecto de UTC para la fecha local) |
| `GET` | `/api/panel/devices?days=7&room=…` | Equipos probados con `/diagnostico` (`app/api/diagnostics.py`) |

Autorización: `Authorization: Bearer <token de lanzamiento de docente>` o `X-Admin-Token`.

## Archivos

| Archivo | Descripción |
|---|---|
| `app/api/panel.py` | Alcance (`panel_scope`), agregaciones y endpoints |
| `app/integrations/lti/services.py` | `fetch_roster` (NRPS) |
| `app/models.py` | `LtiContext` (curso + URL de NRPS) |
| `app/static/panel.html`, `css/panel.css` (`.pn-`), `js/panel.js` | Interfaz (sin librerías: gráficos en SVG) |
| `tests/test_panel.py` | Alcance, NRPS (paginación, error, ausencia), agregados, reintento, CSV |

## Pendiente

- Los módulos de gestos no se lanzan por LTI, así que no aparecen en la vista de un curso de Moodle.
- Filtro por rango de fechas y por actividad de Moodle.
