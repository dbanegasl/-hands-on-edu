# Guía de despliegue — HandsOnEdu

> Para quién: el equipo de TI que instala HandsOnEdu en un servidor de la institución.
> Ruta completa de puesta en marcha (con Moodle, contenido y docentes): [docs/onboarding/README.md](./onboarding/README.md).

## 1. Desarrollo local

```bash
git clone <repo> && cd hands-on-edu
cp .env.example .env
docker compose up --build        # http://localhost:9876  ·  API: http://localhost:9876/docs
```

El código se monta en el contenedor y se recarga solo. Tests: ver `CLAUDE.md` / `docs/development-guide.md`.

## 2. Producción

### Requisitos

| Recurso | Mínimo | Notas |
|---|---|---|
| Servidor | Linux, 2 vCPU, 2 GB RAM, 10 GB disco | La detección de manos corre en el **navegador** de cada estudiante; el servidor solo sirve páginas y guarda datos |
| Software | Docker 24+ con Docker Compose v2.24+ | `!override` en `docker-compose.prod.yml` necesita Compose 2.24 o posterior |
| Dominio | p. ej. `senas.miescuela.edu.ec` | |
| HTTPS | **Obligatorio** | Sin HTTPS los navegadores no dan acceso a la cámara; LTI también lo exige |
| Salida a Internet | Para descargar la imagen (o construirla) | La imagen ya incluye el modelo y MediaPipe JS: el sistema funciona aunque la red de la institución bloquee CDNs |

Equipos de los estudiantes: Chrome, Edge o Firefox recientes, cámara web, y de preferencia GPU integrada o mejor. En equipos sin GPU el motor usa la CPU automáticamente.

### Variables de entorno (`.env`)

| Variable | Producción | Para qué |
|---|---|---|
| `APP_ENV` | `production` | Lo fija `docker-compose.prod.yml` |
| `PUBLIC_BASE_URL` | `https://senas.miescuela.edu.ec` | URL pública **exacta**, sin `/` final. Moodle la usa para LTI y no puede cambiar sin volver a configurar Moodle |
| `ADMIN_TOKEN` | Cadena larga aleatoria (`openssl rand -hex 32`) | Protege el registro de plataformas LTI y la escritura de plantillas de señas. **Vacío = abierto**: no lo dejes vacío en producción |
| `DATABASE_URL` | Por defecto SQLite en `./data` | Cualquier URL de SQLAlchemy (p. ej. PostgreSQL) si la institución lo prefiere |
| `HOST_PORT` | `9876` | Puerto local que escucha el proxy |

### Arranque

**Opción A: imagen publicada (recomendada).** No hace falta clonar el repositorio ni construir nada. Cada versión se publica en `ghcr.io/dbanegasl/handsonedu`.

```bash
sudo mkdir -p /opt/handsonedu && sudo chown "$USER" /opt/handsonedu && cd /opt/handsonedu
base=https://raw.githubusercontent.com/dbanegasl/-hands-on-edu/main/deploy
curl -fsSLO $base/docker-compose.yml
curl -fsSLO $base/deploy.sh
curl -fsSL $base/.env.example -o .env && chmod +x deploy.sh
nano .env                                  # PUBLIC_BASE_URL, ADMIN_TOKEN (ver tabla de arriba)
./deploy.sh 0.15.0                         # o la última versión publicada (Releases en GitHub)
```

`deploy.sh` descarga la imagen, la arranca y espera a que `/health` responda con esa versión. El servicio escucha solo en `127.0.0.1:9876`, para el proxy. Los datos quedan en `/opt/handsonedu/data`.

**Opción B: construir desde el código** (para modificar el código o si el servidor no alcanza `ghcr.io`):

```bash
git clone https://github.com/dbanegasl/-hands-on-edu.git handsonedu && cd handsonedu
cp .env.example .env && nano .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:9876/health      # {"status":"ok","version":"…"}
```

En los dos casos la imagen es inmutable: sin código montado y sin `--reload`. Arranca `WEB_CONCURRENCY` workers (2 por defecto) y persisten únicamente los datos (`./data`).

### Proxy HTTPS

**Opción A: Caddy** (obtiene y renueva el certificado solo):

```caddyfile
senas.miescuela.edu.ec {
    reverse_proxy 127.0.0.1:9876
    header Permissions-Policy "camera=(self)"
    request_body max_size 20MB
}
```

**Opción B: Nginx + Let's Encrypt:**

```nginx
server {
    listen 443 ssl http2;
    server_name senas.miescuela.edu.ec;
    ssl_certificate     /etc/letsencrypt/live/senas.miescuela.edu.ec/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/senas.miescuela.edu.ec/privkey.pem;

    client_max_body_size 20m;                       # importación de plantillas de señas
    add_header Permissions-Policy "camera=(self)" always;

    location /ws/ {                                 # motor de respaldo en el servidor (opcional)
        proxy_pass http://127.0.0.1:9876;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }
    location / {
        proxy_pass http://127.0.0.1:9876;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server { listen 80; server_name senas.miescuela.edu.ec; return 301 https://$host$request_uri; }
```

El frontend arma la URL del WebSocket a partir de la página (`wss://` en HTTPS): no hay nada que cambiar en el código.

### Comprobaciones después de instalar

- [ ] `https://<dominio>/health` responde con la versión esperada.
- [ ] `https://<dominio>/signstudio` pide la cámara y la insignia dice *Detección en el navegador*.
- [ ] `https://<dominio>/lti/jwks` devuelve una clave (`"kty": "RSA"`).
- [ ] `https://<dominio>/lti/setup` muestra URLs con tu dominio y `https://`. Si salen con `localhost`, revisa `PUBLIC_BASE_URL` y reinicia.
- [ ] Sin `X-Admin-Token`, `GET https://<dominio>/api/lti/platforms` responde 401.

## 3. Datos y copias de seguridad

Todo el estado vive en `./data/handsonedu.db` (SQLite):

- estudiantes, sesiones, intentos y dominio por seña;
- plantillas de señas grabadas por docentes;
- **las claves LTI de la herramienta** (`lti_keys`) y las plataformas registradas.

Si se pierde la base, Moodle sigue funcionando (vuelve a leer las claves desde `/lti/jwks`), pero se pierden el progreso y las plantillas.

Copia en caliente, segura con la aplicación en marcha:

```bash
docker compose exec -T hands-on-edu python -c "
import sqlite3, datetime
src = sqlite3.connect('/app/data/handsonedu.db')
dst = sqlite3.connect(f'/app/data/backup-{datetime.date.today()}.db')
src.backup(dst); dst.close(); print('ok')"
```

Programa esa copia a diario (cron) y lleva los archivos `data/backup-*.db` fuera del servidor. Además, `deploy.sh` hace una copia automática antes de cada actualización en `data/backups/` (conserva las 14 últimas; `KEEP_BACKUPS`). Para restaurar: detén el servicio, reemplaza `data/handsonedu.db` por la copia y arranca. Las plantillas también se pueden exportar a JSON desde el Estudio de Señas.

> **Migraciones automáticas.** Desde v0.16.0 cada versión actualiza el esquema de la base al arrancar (Alembic). Las bases creadas por versiones anteriores se adoptan sin pérdida de datos.
>
> Para ver la versión del esquema: `docker compose exec hands-on-edu python -m app.migrate current`.
>
> Una migración no se deshace sola. Para volver a una versión anterior **después** de que la nueva arrancó bien, restaura la copia `data/backups/handsonedu-…-before-<versión>.db` con el servicio detenido. `deploy.sh` ya lo hace solo cuando la nueva versión falla al desplegar.

## 4. Actualizar

Lee antes el CHANGELOG de la versión (en *Releases* de GitHub). Los cambios de esquema se aplican solos al arrancar, pero el CHANGELOG avisa cuando una versión los trae.

### A mano (opción A)

```bash
cd /opt/handsonedu
./deploy.sh 0.16.0        # actualizar
./deploy.sh 0.15.0        # volver a la versión anterior
```

`deploy.sh` hace, en orden:

1. Descarga la imagen. Si falla, no cambia nada.
2. Copia la base en `data/backups/handsonedu-<fecha>-before-<versión>.db`.
3. Cambia `HANDSONEDU_VERSION` en `.env` y reinicia.
4. Espera a que `/health` responda **con esa versión**. Al arrancar, la app aplica sus migraciones.
5. Si no responde en 120 s (`HEALTH_TIMEOUT`), **vuelve sola a la versión anterior**. Si la versión fallida ya había cambiado el esquema, antes **restaura la copia del paso 2**. Muestra los registros y termina con error.

Con la opción B: `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` (haz antes la copia del §3).

### Automática al publicar una versión (entrega continua, REQ-011)

Al publicar una etiqueta `vX.Y.Z` en GitHub, el workflow *Release*:

1. repite todas las pruebas;
2. publica la imagen y la *Release* con las notas;
3. **si está configurado**, entra por SSH al servidor y ejecuta `deploy.sh X.Y.Z`.

Configuración (una vez):

1. **En el servidor:** instala con la opción A. El usuario que despliega debe poder usar Docker (grupo `docker`). Crea una clave solo para desplegar y **restríngela a `deploy.sh`** en `~/.ssh/authorized_keys`:

   ```bash
   ssh-keygen -t ed25519 -N '' -C handsonedu-deploy -f deploy_key       # en tu equipo
   # en el servidor, una línea en ~/.ssh/authorized_keys:
   command="/opt/handsonedu/deploy.sh --from-ssh",restrict ssh-ed25519 AAAA… handsonedu-deploy
   ```

   Con `--from-ssh` la clave solo puede ejecutar `deploy.sh`, que valida la versión recibida (`X.Y.Z` o `latest`).
2. **En GitHub** (*Settings → Secrets and variables → Actions*):

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secreto | `DEPLOY_SSH_KEY` | Contenido de `deploy_key` (privada) |
   | Secreto | `DEPLOY_KNOWN_HOSTS` | Salida de `ssh-keyscan -H senas.miescuela.edu.ec` (comprueba la huella) |
   | Variable | `DEPLOY_HOST` | `senas.miescuela.edu.ec`. **Sin esta variable no se despliega nada** |
   | Variable | `DEPLOY_USER` | Usuario SSH del servidor |
   | Variable (opcional) | `DEPLOY_PORT`, `DEPLOY_PATH` | `22`, `/opt/handsonedu` |
   | Variable (opcional) | `PUBLIC_BASE_URL` | Para comprobar `/health` desde fuera al terminar |

3. **Aprobación (recomendado):** en *Settings → Environments → production*, activa *Required reviewers*. Cada despliegue esperará a que una persona lo apruebe.
4. **Imagen accesible:** tras la primera publicación, en *Packages → handsonedu → Package settings*, cambia la visibilidad a **Public**. Si prefieres mantenerla privada, en el servidor haz `docker login ghcr.io` con un token que tenga `read:packages`.

**Revertir desde GitHub:** *Actions → Release → Run workflow*, con la versión anterior. Despliega esa versión publicada sin construir nada.

### Publicar una versión (equipo de desarrollo)

1. En la rama de la funcionalidad, sube `APP_VERSION` en `app/main.py` y añade la sección `## [X.Y.Z] — fecha` al CHANGELOG. La CI comprueba que estén de acuerdo.
2. Fusiona en `main` con la CI en verde. Conviene proteger `main` en *Settings → Branches* para exigir los checks.
3. Publica la etiqueta: `git tag vX.Y.Z && git push origin vX.Y.Z`. Si no coincide con `APP_VERSION`, el workflow se detiene antes de publicar nada.

## 5. Operación

```bash
docker compose ps                         # estado (healthcheck cada 30 s)
docker compose logs -f --tail=200         # registros
grep HANDSONEDU_VERSION .env              # versión instalada (opción A)
```

Si las notas no llegan a Moodle, el detalle de cada intento está en la tabla `lti_score_submissions` (estado `failed` con el error). Ver la sección de problemas frecuentes de [moodle-integration.md](./moodle-integration.md).

## 6. Seguridad

| Aspecto | Qué hacer |
|---|---|
| HTTPS | Obligatorio (cámara y LTI) |
| `ADMIN_TOKEN` | Definido, largo y fuera del repositorio (`.env` está en `.gitignore`) |
| Puerto | Solo `127.0.0.1:9876`; el exterior entra por el proxy |
| Imagen | No contiene `.env`, datos ni el historial de git (`.dockerignore`, comprobado en CI) |
| Despliegue automático | Clave SSH exclusiva y restringida a `deploy.sh --from-ssh`; `known_hosts` obligatorio; entorno `production` con aprobación |
| Video | La detección corre en el navegador: el video de los estudiantes **no** viaja al servidor (salvo que se fuerce `?engine=server`) |
| Datos personales | Se guarda el nombre que envía Moodle y los resultados de práctica. Informa a las familias según la normativa de protección de datos (Ecuador: LOPDP) |
| Datos de estudiantes | Cada perfil local tiene un token secreto guardado en su navegador; con Moodle manda el token de lanzamiento de ese estudiante. Sin credencial: 401. Borrar los datos del navegador hace perder el acceso a sus perfiles locales (los datos quedan en el servidor y en el panel docente) |
