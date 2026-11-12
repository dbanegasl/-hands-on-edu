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
| Salida a Internet | Solo para construir la imagen | Descarga el modelo y MediaPipe JS; después el sistema funciona aunque la red bloquee CDNs |

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

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:9876/health      # {"status":"ok","version":"…"}
```

`docker-compose.prod.yml` usa la imagen inmutable (sin montar el código ni `--reload`), arranca 2 workers y publica el puerto solo en `127.0.0.1`, para el proxy. Persisten únicamente los datos (`./data`).

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

Programa esa copia a diario (cron) y lleva los archivos `data/backup-*.db` fuera del servidor. Para restaurar: detén el servicio, reemplaza `data/handsonedu.db` por la copia y arranca. Las plantillas también se pueden exportar a JSON desde el Estudio de Señas.

> Sin migraciones automáticas (TD-012): las tablas nuevas se crean al arrancar, pero un cambio de columnas en tablas existentes necesitaría una migración manual. Lee el CHANGELOG antes de actualizar.

## 4. Actualizar

```bash
cp data/handsonedu.db data/pre-update-$(date +%F).db     # copia antes de actualizar
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:9876/health
```

## 5. Operación

```bash
docker compose ps                         # estado (healthcheck cada 30 s)
docker compose logs -f --tail=200         # registros
```

Si las notas no llegan a Moodle, el detalle de cada intento está en la tabla `lti_score_submissions` (estado `failed` con el error). Ver la sección de problemas frecuentes de [moodle-integration.md](./moodle-integration.md).

## 6. Seguridad

| Aspecto | Qué hacer |
|---|---|
| HTTPS | Obligatorio (cámara y LTI) |
| `ADMIN_TOKEN` | Definido, largo y fuera del repositorio (`.env` está en `.gitignore`) |
| Puerto | Solo `127.0.0.1:9876`; el exterior entra por el proxy |
| Video | La detección corre en el navegador: el video de los estudiantes **no** viaja al servidor (salvo que se fuerce `?engine=server`) |
| Datos personales | Se guarda el nombre que envía Moodle y los resultados de práctica. Informa a las familias según la normativa de protección de datos (Ecuador: LOPDP) |
| Pendiente conocido | Los endpoints de progreso aún se autorizan por el id del estudiante (TD-013) |
