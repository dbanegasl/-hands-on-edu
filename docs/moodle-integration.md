# Integración con Moodle — HandsOnEdu

HandsOnEdu se integra con Moodle (4.x) y con cualquier LMS compatible con **LTI 1.3 / LTI Advantage** (Canvas, Blackboard, Brightspace…). Ver [REQ-019](./requirements/REQ-019-lti13-moodle.md).

| Qué obtiene la institución | Cómo |
|---|---|
| El estudiante entra desde su curso con un clic, sin otra cuenta | Inicio de sesión LTI 1.3 (OIDC + `id_token` firmado) |
| La nota de cada evaluación llega sola al libro de calificaciones | Assignment and Grade Services (AGS) — se conserva la **mejor** nota |
| El docente elige qué unidad abre cada actividad | Deep Linking |

## Requisitos

- HandsOnEdu accesible por **HTTPS** desde el navegador de los estudiantes y desde el servidor Moodle.
- `PUBLIC_BASE_URL` con esa dirección pública (sin `/` final), p. ej. `PUBLIC_BASE_URL=https://senas.miescuela.edu.ec`.
- `ADMIN_TOKEN` definido en producción (protege el registro de plataformas y las plantillas de señas).

## Paso 1 · Crear la herramienta en Moodle

Abre **`/lti/setup`** en HandsOnEdu: muestra todas las URLs con botón *Copiar*.

```
Administración del sitio → Plugins → Actividades → Herramienta externa
  → Gestionar herramientas → configurar una herramienta manualmente
```

| Campo de Moodle | Valor |
|---|---|
| Nombre de la herramienta | HandsOnEdu — Aula de Señas |
| URL de la herramienta | `{PUBLIC_BASE_URL}/lti/launch` |
| Versión LTI | LTI 1.3 |
| Tipo de clave pública | URL del conjunto de claves (keyset) |
| URL del conjunto de claves públicas | `{PUBLIC_BASE_URL}/lti/jwks` |
| URL de inicio de sesión | `{PUBLIC_BASE_URL}/lti/login` |
| URI(s) de redirección | `{PUBLIC_BASE_URL}/lti/launch` |
| Soporta Deep Linking | ✅ (URL de selección de contenido: `{PUBLIC_BASE_URL}/lti/launch`) |
| Contenedor de lanzamiento predeterminado | **Nueva ventana** — la cámara no funciona dentro de un iframe sin permisos explícitos |
| Servicios → IMS LTI Assignment and Grade Services | Usar este servicio para la sincronización de calificaciones y la gestión de columnas |
| Privacidad → Compartir el nombre del usuario | Siempre |

## Paso 2 · Registrar el Moodle en HandsOnEdu

En Moodle, en la lista de herramientas, pulsa **Ver detalles de configuración** y copia los valores al formulario de `/lti/setup` (escribir la URL del Moodle rellena las direcciones):

| Dato de Moodle | Campo en HandsOnEdu |
|---|---|
| ID de la plataforma | issuer |
| ID de cliente | client ID |
| ID de despliegue | deployment ID |
| URL de la solicitud de autenticación (`/mod/lti/auth.php`) | URL de autenticación |
| URL del token de acceso (`/mod/lti/token.php`) | URL del token |
| URL del conjunto de claves públicas (`/mod/lti/certs.php`) | URL de claves |

Equivalente por API:

```bash
curl -X POST {PUBLIC_BASE_URL}/api/lti/platforms -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{
    "name": "Moodle de mi institución",
    "issuer": "https://moodle.miescuela.edu.ec",
    "client_id": "AbC123",
    "auth_login_url": "https://moodle.miescuela.edu.ec/mod/lti/auth.php",
    "auth_token_url": "https://moodle.miescuela.edu.ec/mod/lti/token.php",
    "jwks_url": "https://moodle.miescuela.edu.ec/mod/lti/certs.php",
    "deployment_ids": ["1"]
  }'
```

Otros despliegues de la misma herramienta: `POST /api/lti/platforms/{id}/deployments`.

## Paso 3 · Usarlo en un curso

1. En el curso: **Agregar una actividad o recurso** → HandsOnEdu → **Seleccionar contenido**.
2. HandsOnEdu muestra las unidades del Aula de Señas: elige una o varias (con calificación 0–100) o el curso completo (práctica libre, sin nota).
3. Moodle crea una actividad por unidad con su columna en el libro de calificaciones.

El estudiante abre la actividad y entra al Aula con su nombre de Moodle. La unidad asignada aparece abierta y resaltada. Al terminar la evaluación de esa unidad, el Aula muestra *✔ Nota enviada a la plataforma*. Si repite la evaluación, solo se envía cuando mejora su nota. Los docentes que abren la actividad ven todas las unidades abiertas.

## Cómo funciona

```
Moodle ──(1) GET/POST /lti/login: iss, login_hint, target_link_uri──▶ HandsOnEdu
HandsOnEdu guarda state + nonce (un solo uso, 10 min) ──(2) 302──▶ Moodle /mod/lti/auth.php
Moodle ──(3) POST /lti/launch: id_token (JWT RS256), state──▶ HandsOnEdu
HandsOnEdu valida firma (JWKS de Moodle), iss, aud/azp, exp, nonce, versión, deployment_id
          ──(4) 303 /aula#lti=<token de lanzamiento>──▶ navegador
Navegador ──(5) API con Authorization: Bearer <token>──▶ HandsOnEdu
Fin de la evaluación ──(6) token OAuth2 (client_credentials + JWT firmado por HandsOnEdu)
          ──(7) POST {lineitem}/scores──▶ Moodle
```

- El token de lanzamiento viaja en el **fragmento** de la URL (`#lti=`): no llega a los registros de acceso de ningún servidor. Dura 8 horas y vive en `sessionStorage` de esa pestaña.
- Las claves RSA de HandsOnEdu se crean solas en la base de datos al primer uso (`lti_keys`). **Haz copia de seguridad de la base**: si se pierden, Moodle debe volver a leer el keyset (lo hace solo, porque usa la URL).
- Cada envío de nota queda registrado en `lti_score_submissions` (`sent`, `skipped` o `failed` con el detalle del error).

## Solución de problemas

| Mensaje | Causa probable |
|---|---|
| *Esta plataforma no está registrada* | Falta el Paso 2 o el issuer no coincide exactamente (sin `/` final) |
| *Este despliegue de la herramienta no está registrado* | Añade el deployment ID (`POST /api/lti/platforms/{id}/deployments`) |
| *id_token inválido: …audience…* | El client ID registrado no es el de Moodle |
| *Sesión de inicio LTI desconocida o ya usada* | Se recargó la página del lanzamiento: vuelve a abrir la actividad |
| La cámara no se activa | La herramienta abre en iframe: usa *Nueva ventana* |
| *No se pudo enviar la nota* | Revisa que AGS esté activado en la herramienta y que HandsOnEdu alcance `/mod/lti/token.php`; el detalle está en `lti_score_submissions` |

---

## Anexo · Cliente REST de Moodle (anterior, sin uso en el Aula)

El cliente `app/integrations/moodle/rest_api.py` (tokens de servicios web) queda como utilidad para tareas administrativas. Para notas y acceso de estudiantes usa LTI 1.3.

#### Prerrequisitos en Moodle

#### 1. Activar Servicios Web

```
Administración del sitio
  → Plugins
    → Servicios web
      → Vista general → Activar servicios web ✅
      → Protocolos → Habilitar REST ✅
```

#### 2. Crear usuario de servicio

Crea un usuario dedicado (ej: `handsoneau_service`) con rol de **Profesor** o **Gestor** en los cursos que necesita acceder.

#### 3. Crear token de acceso

```
Administración del sitio
  → Plugins
    → Servicios web
      → Gestionar tokens
        → Agregar token (usuario: handsoneau_service)
```

Copia el token generado y agrégalo en tu `.env`:

```env
MOODLE_URL=https://tu-moodle.universidad.edu
MOODLE_TOKEN=abc123...
```

### Funciones REST Usadas

| Función Moodle | Uso en HandsOnEdu |
|---------------|-------------------|
| `core_course_get_courses` | Listar cursos disponibles |
| `core_grades_update_grades` | Enviar calificación de evaluación gestual |
| `core_completion_update_activity_completion_status_manually` | Marcar actividad como completada |

### Habilitar funciones en Moodle

Cada función debe estar habilitada en el servicio web:

```
Administración del sitio → Plugins → Servicios web
  → Servicios externos → HandsOnEdu Service
    → Agregar funciones → (buscar y agregar las funciones listadas)
```

### Ejemplo de uso desde Python

```python
from app.integrations.moodle.rest_api import MoodleClient

client = MoodleClient()

# Enviar calificación de 9/10 al estudiante con ID 42
await client.submit_grade(
    course_id=5,
    item_name="GestiEdu - Evaluación de Conteo",
    user_id=42,
    grade=9.0
)
```
