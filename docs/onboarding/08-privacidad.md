# 08 · Privacidad y datos de los estudiantes

> **Para quién:** la persona responsable de protección de datos de la institución, coordinación académica y TI.
> **Antes del piloto:** configura la sección 2 y entrega el aviso de la sección 5.
> **Requisito técnico:** [REQ-021](../requirements/REQ-021-privacidad-datos.md).

> ⚠ **Esta guía no es asesoría legal.** Describe qué hace HandsOnEdu con los datos para que la institución cumpla sus obligaciones, por ejemplo las de la Ley Orgánica de Protección de Datos Personales (LOPDP) del Ecuador. El aviso de la sección 5 es una **plantilla**: revísala con tu área jurídica o con el delegado de protección de datos antes de usarla.

## 1. Qué datos hay y dónde

La lista completa y actualizada está en la página **`/privacidad`** de tu instalación, escrita para estudiantes y familias. En resumen:

| Dato | Dónde | Quién lo ve |
|---|---|---|
| Nombre del estudiante: el que escribe, o el que envía Moodle con un identificador interno de su cuenta. **Sin correo electrónico** | Servidor de HandsOnEdu | El estudiante, sus docentes (panel) y la administración |
| Resultados: actividad, fecha, puntaje y, por cada seña, acierto, seguridad del reconocimiento y tiempo de respuesta | Servidor | Ídem |
| Con Moodle: curso, actividad, rol y notas enviadas | Servidor (las notas también en Moodle) | Ídem |
| Pase de lista de AttendEye: nombres que escribe el docente | Servidor | Docente y administración (`ADMIN_TOKEN`) |
| Grabaciones de referencia: puntos de la mano, sin imágenes, y nombre de quien grabó | Servidor | Equipo de contenido |
| Diagnóstico de equipos (`/diagnostico`): navegador, sistema, cámara, velocidad, sala y puesto. **Sin datos del estudiante** | Servidor | Docentes (panel) y administración |
| Revisión de señas (`/validacion`): resultado por seña y nombre del intérprete. **Sin datos del estudiante** | Servidor | Docentes y equipo de contenido (`ADMIN_TOKEN`) |
| Perfiles con su clave y la preferencia de sonido | Navegador del estudiante (`localStorage`) | Ese equipo |
| **Video e imágenes de la cámara** | **En ningún sitio**: se procesan dentro del navegador y no se envían | — |

HandsOnEdu no usa servicios de terceros para estos datos: el motor de manos y el modelo se sirven desde tu propio servidor.

## 2. Configuración (`.env` del servidor)

| Variable | Ejemplo | Para qué |
|---|---|---|
| `PRIVACY_CONTROLLER` | `Unidad Educativa San José` | Responsable de los datos, que se muestra en `/privacidad` |
| `PRIVACY_CONTACT` | `Secretaría — datos@sanjose.edu.ec` | A quién escribir para ejercer los derechos |
| `DATA_RETENTION_DAYS` | `365` | Plazo de conservación que se anuncia: los datos de quien pasa ese tiempo sin actividad se borran con `purge` (sección 4). `0` = no se anuncia |

Después de cambiar estas variables, reinicia el servicio (`docker compose up -d`). `check-install.py` avisa si faltan el responsable o el contacto.

## 3. Atender una solicitud (acceso, borrado, corrección)

**El propio estudiante** puede descargar y borrar sus datos en `/privacidad` (enlace en el Aula de Señas y en la página de inicio):

- Con un perfil local, desde el mismo navegador donde lo creó.
- Con Moodle, abriendo la actividad desde Moodle y pulsando **🔒 Privacidad** en el Aula.

**Si lo pide a la institución** (perdió el acceso, es menor de edad o lo pide su representante), TI lo hace en el servidor, en la carpeta de la instalación:

```bash
docker compose exec hands-on-edu python -m app.privacy find "Ana"            # buscar: id, origen, última actividad
docker compose exec -T hands-on-edu python -m app.privacy export <id> > ana.json   # entregarle sus datos
docker compose exec hands-on-edu python -m app.privacy delete <id>           # borrar (pide escribir «borrar»)
```

- **Comprueba la identidad** de quien lo pide antes de entregar o borrar datos. Un nombre puede repetirse, así que confirma con el docente cuál es: la columna «última actividad» ayuda.
- **Corregir el nombre:** con Moodle se corrige en Moodle y se actualiza en el siguiente acceso. Con un perfil local, lo más simple es borrarlo y crear uno nuevo.
- **Borrar no toca Moodle:** las notas que ya están en el libro de calificaciones se gestionan en Moodle. Y si el estudiante vuelve a abrir la actividad desde Moodle, empieza de cero.
- Guarda un registro de la solicitud y de la fecha en que la atendiste.

## 4. Al terminar el piloto o el curso

Para borrar los datos de quienes llevan tiempo sin actividad, ejecuta primero sin `--yes`, que solo lista lo que se borraría, y después con `--yes`:

```bash
docker compose exec -T hands-on-edu python -m app.privacy purge --days 365                 # estudiantes sin actividad en 365 días
docker compose exec -T hands-on-edu python -m app.privacy purge --attendance-days 180 --yes # pases de lista de hace más de 180 días
docker compose exec -T hands-on-edu python -m app.privacy purge --diagnostics-days 90 --yes # diagnósticos de equipos de hace más de 90 días (0 = todos)
```

- Sin `--days`, `purge` usa `DATA_RETENTION_DAYS`. Si anuncias un plazo, prográmalo, por ejemplo con un cron mensual en el servidor.
- **Las copias de seguridad también contienen datos.** `deploy.sh` guarda las últimas 14 en `data/backups/` (`KEEP_BACKUPS`), y lo borrado desaparece de ellas cuando rotan. Las copias diarias que hagas tú deben tener su propio plazo. Inclúyelo en el aviso.

## 5. Plantilla de aviso para estudiantes y familias

> Adáptala, revísala con tu área jurídica y entrégala antes del piloto (por la plataforma, por correo o impresa). Si los estudiantes son menores de edad, consulta con el área jurídica si necesitas el consentimiento de sus representantes y cómo recogerlo.

---

**Aviso de privacidad — HandsOnEdu (Aula de Señas)**

[Nombre de la institución], con domicilio en [dirección], es la responsable de los datos personales que se tratan al usar HandsOnEdu, la herramienta con la que [curso o grupo] practicará Lengua de Señas Ecuatoriana.

**Qué datos se tratan:**
- el nombre del estudiante en la plataforma;
- sus resultados de práctica y evaluación: actividad, fecha, puntaje y aciertos por seña;
- si entra desde [Moodle de la institución], el curso, su rol y las notas enviadas al libro de calificaciones.

**La cámara:** se usa para reconocer las manos **dentro del navegador**. No se graban ni se envían imágenes, video ni audio.

**Para qué:** acompañar el aprendizaje del estudiante, que su docente siga el progreso del curso y registrar las notas de las evaluaciones. No se usan para otros fines ni se comparten con terceros.

**Dónde y cuánto tiempo:** en el servidor de la institución, [mientras dure el curso / durante N días desde la última actividad]. Las copias de seguridad se conservan [N días].

**Derechos:** el estudiante o su representante pueden conocer, descargar, corregir o borrar sus datos:
- desde la página **Privacidad** de la plataforma ([https://<dirección>/privacidad]);
- o escribiendo a [contacto], que responderá en un plazo de [N días].

---

## 6. Lista de comprobación

- [ ] `PRIVACY_CONTROLLER` y `PRIVACY_CONTACT` configurados; `/privacidad` los muestra.
- [ ] Plazo de conservación decidido: `DATA_RETENTION_DAYS` y, si se anuncia, `purge` programado.
- [ ] Plazo de las copias de seguridad decidido y aplicado.
- [ ] Aviso revisado por el área jurídica y entregado a estudiantes y familias.
- [ ] Persona responsable de atender las solicitudes, que sabe usar la sección 3.
- [ ] En Moodle, la herramienta tiene **Compartir el correo: Nunca** ([03 §3](./03-moodle-institucional.md#3-crear-la-herramienta-en-moodle)).
