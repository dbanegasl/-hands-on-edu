# 06 · Problemas frecuentes

> Cómo leer esta guía: busca el **síntoma** y sigue las comprobaciones en orden. Detalle técnico de LTI: [moodle-integration.md](../moodle-integration.md#solución-de-problemas).

## Cámara y reconocimiento

| Síntoma | Comprobaciones |
|---|---|
| El navegador no pide permiso de cámara | 1) La página debe estar en **HTTPS** (o `localhost`). 2) Si se abrió dentro de Moodle (iframe), configura la herramienta en *Nueva ventana*. 3) En pruebas locales con `http://`, activa la bandera de Chrome ([02 §3](./02-moodle-local.md#3-permitir-la-cámara-en-http-una-sola-vez)) |
| *Permiso denegado* | Candado de la barra de direcciones → Cámara → Permitir, y recargar |
| *Cámara en uso* / pantalla negra | Cerrar Zoom, Teams, Meet u otras pestañas que usen la cámara |
| Va muy lento | La insignia debe decir *🟢 Detección en tu equipo* (Aula) o *Detección en el navegador* (Estudio). Si dice *en servidor*, el navegador no pudo cargar el motor: probar en Chrome actualizado. En equipos sin GPU, cerrar otras pestañas |
| No reconoce una seña bien hecha | Luz frontal, mano entera en el cuadro, a 50–80 cm. Si persiste con varias personas: grabar más plantillas en el Estudio. Si tiene descriptor: reportarlo con una captura |
| Tras publicar el modelo entrenado, una seña empeoró | **Desactivar** en el Estudio (tarjeta 🧠) y revisar sus grabaciones ([07 §12](./07-entrenamiento-modelo.md#12-problemas-frecuentes)) |
| Unidad *Próximamente* | Ninguna seña de la unidad es reconocible todavía: hay que grabar plantillas ([04 §3](./04-contenido-lsec.md#3-grabar-plantillas-docente-o-intérprete-que-signa)) |

## Entrada desde Moodle

| Mensaje en HandsOnEdu | Causa y solución |
|---|---|
| *Esta plataforma no está registrada* | Moodle no está en `/lti/setup`, o el **issuer** no coincide exactamente (`https` vs `http`, `/` final) |
| *Este despliegue de la herramienta no está registrado* | Falta el **ID de despliegue** de Moodle en la plataforma |
| *id_token inválido: …audience…* | El **ID de cliente** registrado no es el de esa herramienta en Moodle |
| *id_token inválido: …signature…* o *…key…* | HandsOnEdu no alcanza `/mod/lti/certs.php` de Moodle, o la URL de claves está mal |
| *Sesión de inicio LTI desconocida o ya usada* | Se recargó la página o se abrió un enlace viejo: volver a abrir la actividad desde Moodle |
| El estudiante aparece sin nombre | En la herramienta de Moodle: *Compartir el nombre del usuario* → **Siempre** |
| Moodle muestra un error al pulsar *Seleccionar contenido* o al guardar | Moodle no alcanza `https://<handsonedu>/lti/jwks`. Probar con `curl` desde el servidor Moodle; revisar *Hosts bloqueados* y *Puertos permitidos* por cURL en la seguridad HTTP de Moodle |
| Las URLs de `/lti/setup` dicen `localhost` | Falta `PUBLIC_BASE_URL` en `.env`; reiniciar el servicio |

## Notas que no llegan a Moodle

1. El Aula muestra al final un mensaje que explica el caso:
   - *✔ Nota enviada a la plataforma* → revisar en Moodle la columna correcta (una por unidad).
   - *ℹ️ Se conserva la mejor nota enviada (N/100)* → es lo esperado: la nota nueva no era mejor.
   - *⚠️ No se pudo enviar la nota a la plataforma* → seguir con el paso 2.
   - Ningún mensaje → la actividad no lleva nota (ver el punto 2).
2. Solo envían nota las **evaluaciones** de la unidad de esa actividad, hechas por **estudiantes**. Las lecciones, los repasos, las evaluaciones de otras unidades y las que hace un docente no se envían.
3. Revisar en la herramienta de Moodle que **IMS LTI Assignment and Grade Services** esté en *Usar este servicio para la sincronización de calificaciones y la gestión de columnas*.
4. Revisar el registro de envíos en el servidor:

   ```bash
   docker compose exec hands-on-edu python -c "
   import sqlite3; c = sqlite3.connect('/app/data/handsonedu.db')
   for r in c.execute('SELECT created_at, status, http_status, score_given, detail FROM lti_score_submissions ORDER BY id DESC LIMIT 10'): print(r)"
   ```

   | `status` / detalle | Causa |
   |---|---|
   | `failed`, `invalid_client` / 401 en el token | Moodle no puede leer `/lti/jwks` de HandsOnEdu, o el ID de cliente no coincide |
   | `failed`, `invalid_scope` | AGS no está activado en la herramienta |
   | `failed`, error de conexión | HandsOnEdu no alcanza `/mod/lti/token.php` de Moodle (DNS, cortafuegos, certificado) |
   | `skipped` | La nota nueva era menor o igual que la anterior: se conserva la mejor |

## Servidor

| Síntoma | Comprobaciones |
|---|---|
| `docker compose ps` no muestra *healthy* | `docker compose logs --tail=100`. Suele ser un `.env` mal escrito o un permiso de la carpeta `data/` |
| Error de certificado en el navegador | Renovar el certificado (Caddy lo hace solo; con certbot: `certbot renew`) |
| Tras actualizar, error de base de datos | Revisar el CHANGELOG por cambios de tablas; restaurar la copia previa a la actualización ([Despliegue §4](../deployment.md#4-actualizar)) |

## Cómo reportar un problema

Incluye: fecha y hora, URL, usuario de Moodle (no la contraseña), navegador y sistema, qué esperabas y qué pasó, y una captura de pantalla. Para problemas de reconocimiento, indica la seña y si otras personas tienen el mismo problema.
