# Guía de Despliegue — HandsOnEdu

## Despliegue Local (Desarrollo)

### Requisitos

- Docker Engine 20.10+
- Docker Compose v2+
- Navegador moderno con acceso a cámara (Chrome / Firefox / Edge)
- Puerto 9876 disponible

### Pasos

```bash
git clone https://github.com/dbanegasl/-hands-on-edu.git
cd -- -hands-on-edu
cp .env.example .env
docker compose up --build
```

Abrir `http://localhost:9876` en el navegador.

> **Primer build**: descarga el modelo `hand_landmarker.task` (~7.8 MB) de Google Storage. Requiere internet. Builds posteriores usan la imagen en caché de Docker.

> **Webcam**: la cámara es capturada por el navegador vía `getUserMedia()`. No se necesita pasar dispositivos al contenedor Docker (`/dev/video*` no es necesario).

---

## Despliegue en Servidor (Producción)

### Requisitos

- Servidor Linux con Docker y Docker Compose
- Dominio con **HTTPS obligatorio** para que `getUserMedia()` funcione en navegadores fuera de localhost
- Certificado SSL (Let's Encrypt recomendado)
- Nginx como reverse proxy

### `docker-compose.yml` para producción

```yaml
services:
  app:
    build: .
    restart: always
    ports:
      - "8000:8000"   # Solo exponer al proxy Nginx; no al exterior directamente
    env_file:
      - .env
    # Opcional: quitar el volumen en producción para imagen inmutable
    # volumes:
    #   - ./app:/app/app
```

### Nginx como reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name handsoneau.unae.edu.ec;

    ssl_certificate     /etc/letsencrypt/live/handsoneau.unae.edu.ec/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/handsoneau.unae.edu.ec/privkey.pem;

    # WebSocket upgrade (requerido para /ws/analyze)
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # Tráfico HTTP normal
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirigir HTTP a HTTPS
server {
    listen 80;
    server_name handsoneau.unae.edu.ec;
    return 301 https://$host$request_uri;
}
```

> **Importante**: El WebSocket **requiere `wss://`** (WebSocket Secure) en producción con HTTPS. Los archivos JS usan `ws://localhost:9876/...` — debe cambiarse a `wss://tu-dominio.com/ws/analyze` para producción. Se recomienda inyectar esta URL como variable de entorno en el HTML o via un archivo de configuración JS.

### Variables de entorno en producción (`.env`)

```env
MOODLE_URL=https://moodle.unae.edu.ec
MOODLE_TOKEN=tu_token_de_produccion
MOODLE_COURSE_ID=5
APP_ENV=production
```

---

## Consideraciones de Seguridad

| Aspecto | Recomendación |
|---------|---------------|
| HTTPS | **Obligatorio** para `getUserMedia()` fuera de localhost |
| WebSocket | Usar `wss://` en producción |
| Token Moodle | Nunca incluir en el repositorio git; usar `.env` (está en `.gitignore`) |
| Puerto | No exponer el puerto 8000 directamente; usar Nginx como proxy |
| CORS | FastAPI no tiene `CORSMiddleware` configurado — añadirlo si se expone la API a otros dominios |
| Actualizaciones | Mantener las dependencias de Python actualizadas (`mediapipe`, `fastapi`, etc.) |

---

## Actualizar la Plataforma

```bash
git pull origin main
docker compose up --build -d
```

- `--build` reconstruye la imagen si hay cambios en `Dockerfile` o `requirements.txt`.
- `-d` corre el contenedor en segundo plano (detached).

---

## Monitoreo

```bash
# Estado del contenedor
docker compose ps

# Logs en tiempo real
docker compose logs -f

# Health check
curl http://localhost:9876/health
# → {"status": "ok", "version": "0.1.0"}
```

---

## Backup

No hay base de datos que respaldar en la versión actual. Los datos de sesión (asistencia, calificaciones) solo persisten mientras el módulo está abierto en el navegador.

Para añadir persistencia se recomienda:

- **PostgreSQL** + SQLAlchemy (async) para datos de sesión y calificaciones
- **Redis** para cache de sesiones activas
- Endpoints REST dedicados en `app/main.py` por módulo para guardar/recuperar datos
