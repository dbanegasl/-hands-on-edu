# Guía de Desarrollo — HandsOnEdu

## Requisitos de Desarrollo

- Python 3.11+
- Docker + Docker Compose
- Git
- Editor con soporte para Python y JavaScript (recomendado: VS Code)

---

## Estructura del Proyecto

```
-hands-on-edu/
├── app/
│   ├── main.py                    # FastAPI: monta routers de app/api/ (pages, ws, signs, learning)
│   ├── core/
│   │   └── hand_tracker.py        # Wrapper MediaPipe (compartido por todos los módulos)
│   ├── integrations/
│   │   └── moodle/
│   │       └── rest_api.py        # Cliente REST Moodle (httpx async)
│   ├── modules/                   # Lógica Python por módulo (actualmente stubs extensibles)
│   │   ├── gestiedu/
│   │   ├── motivasign/
│   │   ├── attendeye/
│   │   └── virtual_painter/
│   └── static/                    # Frontend (servido directamente por FastAPI)
│       ├── index.html             # Landing page
│       ├── testing.html           # Testing Lab
│       ├── gestiedu.html
│       ├── motivasign.html
│       ├── attendeye.html
│       ├── virtualpainter.html
│       ├── css/
│       │   ├── styles.css         # Landing + Testing Lab
│       │   ├── gestiedu.css
│       │   ├── motivasign.css
│       │   ├── attendeye.css
│       │   └── virtualpainter.css
│       └── js/
│           ├── webcam.js          # Testing Lab engine
│           ├── gestiedu.js
│           ├── motivasign.js
│           ├── attendeye.js
│           └── virtualpainter.js
├── models/                        # hand_landmarker.task (descargado en build)
├── docs/                          # Esta documentación
├── tests/                         # Tests (por desarrollar)
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## Levantar Entorno de Desarrollo

```bash
# Clonar
git clone https://github.com/dbanegasl/-hands-on-edu.git
cd -- -hands-on-edu

# Configurar variables de entorno
cp .env.example .env

# Construir imagen (solo necesario la primera vez o al cambiar Dockerfile/requirements.txt)
docker compose build

# Levantar con hot-reload
docker compose up
```

La plataforma queda disponible en `http://localhost:9876`.

> **Hot reload**: Los cambios en archivos Python (`app/`) y HTML/CSS/JS (`app/static/`) se reflejan **sin rebuild** gracias al volumen `./app:/app/app` en `docker-compose.yml`. Uvicorn detecta cambios Python y recarga automáticamente.

> **Excepción**: Cambios en `Dockerfile`, `requirements.txt` o `docker-compose.yml` sí requieren `docker compose build`.

---

## Cómo Crear un Nuevo Módulo

### 1. Crear archivos frontend

```
app/static/mi_modulo.html
app/static/css/mi_modulo.css
app/static/js/mi_modulo.js
```

**Patrón mínimo de JS** (copiar de cualquier módulo existente):

```html
<!-- Orden de carga: librería común → motor de manos → (motor de señas) → módulo -->
<script src="/static/js/ho-common.js"></script>
<script src="/static/js/ho-hands.js"></script>
<script src="/static/js/ho-signs.js"></script>  <!-- solo si el módulo reconoce señas -->
<script src="/static/js/mi_modulo.js"></script>
```

```js
let stream, source, animFrame, lastHands = [];

async function start() {
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  video.srcObject = stream;
  await video.play();
  // Motor en el navegador con respaldo automático al servidor (mismo JSON).
  source = HO.createHandSource({
    onResult: (data) => { lastHands = data.hands; /* gesture, landmarks, fingers_up… */ },
    onStatus: (status) => { /* 'connecting' | 'connected' | 'disconnected' */ },
  });
  source.connect();
  loop();
}

function loop() {
  animFrame = requestAnimationFrame(loop);
  if (video.readyState < 2) return;
  HO.drawMirroredVideo(ctx, video, canvas.width, canvas.height);
  source.sendFrame(canvas);                       // detecta sobre el canvas espejado
  for (const h of lastHands) HO.drawSkeleton(ctx, h.landmarks, canvas.width, canvas.height);
}

function stop() {                                 // siempre al salir de la pantalla
  cancelAnimationFrame(animFrame);
  source.close();
  stream.getTracks().forEach((t) => t.stop());
}
```

### 2. Registrar la página en `PAGES` (`app/api/pages.py`)

```python
PAGES = {
    # ...
    "/mi-modulo": "mi_modulo.html",
}
```

### 3. Actualizar la landing page

En `app/static/index.html`, añadir o actualizar la tarjeta del módulo con el badge "✅ Disponible" y un enlace `<a href="/mi-modulo">`.

### 4. (Opcional) Lógica Python en `app/modules/mi_modulo/`

Si el módulo necesita lógica de backend (base de datos, procesamiento especial):

```python
# app/modules/mi_modulo/__init__.py
# app/modules/mi_modulo/logic.py
```

### 5. Documentar en `docs/modules/mi_modulo.md`

Crear documentación siguiendo el mismo formato que los módulos existentes (propósito, URL, archivos, flujo, variables de configuración, known limitations).

---

## Convenciones de Código

### Python

- Estilo: PEP 8
- Funciones `async` para todos los endpoints FastAPI
- Docstrings en inglés en métodos del core
- Variables y comentarios pueden ser en español si son específicos del dominio educativo

### JavaScript

- Vanilla JS (sin frameworks ni jQuery)
- Constantes en `UPPER_SNAKE_CASE`
- Funciones `camelCase`
- Un bloque `DOMContentLoaded` por archivo para event wiring
- Siempre cancelar `requestAnimationFrame` y cerrar WebSocket al salir de pantalla
- Usar `const` por defecto, `let` para variables mutables, nunca `var`

### HTML / CSS

- Un archivo CSS por módulo
- Variables CSS en `:root` para colores y medidas clave
- Prefijo BEM-like por módulo (ej: `.ae-` para AttendEye, `.vp-` para VirtualPainter, `.ms-` para MotivaSign, `.ge-` para GestiEdu)
- Diseño responsive — al menos funcional en tablets (768 px+)

### Git

- Ramas: `feature/nombre-del-modulo` o `fix/descripcion`
- Commits en inglés con prefijo: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Incluir siempre el Co-authored-by trailer de Copilot al final del commit message

---

## WebSocket Pattern (Referencia Rápida)

```js
// 1. Abrir conexión
const ws = new WebSocket('ws://localhost:9876/ws/analyze');
let processing = false;

ws.onmessage = (evt) => {
  processing = false;
  const data = JSON.parse(evt.data);
  // data.hands[0].gesture, data.hands[0].landmarks, etc.
};

// 2. Loop de captura (en requestAnimationFrame)
function captureAndSend() {
  if (!processing && ws.readyState === WebSocket.OPEN) {
    processing = true;
    // Dibujar video reflejado en canvas
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    const b64 = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
    ws.send(JSON.stringify({ frame: b64 }));
  }
}

// 3. IMPORTANTE: coordenadas de landmarks
// px = lm.x * canvas.width   ← CORRECTO (video ya está reflejado)
// px = (1 - lm.x) * canvas.width  ← INCORRECTO (doble reflejo)
```

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `MOODLE_URL` | Solo si se usa Moodle | URL base de la instancia Moodle (ej: `https://tu-moodle.universidad.edu`) |
| `MOODLE_TOKEN` | Solo si se usa Moodle | Token de servicio web de Moodle |
| `MOODLE_COURSE_ID` | Solo si se usa Moodle | ID del curso en Moodle |
| `APP_ENV` | No | `development` o `production` |
| `APP_PORT` | No | Puerto interno (default `8000`; el externo lo define `docker-compose.yml`) |

Si `MOODLE_URL` y `MOODLE_TOKEN` no se configuran, los módulos funcionan normalmente sin integración Moodle.

---

## Cambiar el esquema de la base (migraciones)

El esquema lo gestiona Alembic (`app/migrations/versions/`), y la app migra sola al arrancar. Después de cambiar un modelo en `app/models.py`:

```bash
docker compose exec hands-on-edu alembic revision --autogenerate -m "añadir email a learners"
# revisar el archivo generado en app/migrations/versions/ (renombrados, datos, índices)
docker compose restart hands-on-edu        # aplica la migración
docker compose exec hands-on-edu python -m app.migrate check   # modelos ↔ migraciones
```

- **No importes `app.models` en una migración.** Una migración queda congelada; usa tipos de `sqlalchemy` (`UTCDateTime` se escribe `sa.DateTime()`, `env.py` ya lo hace).
- **SQLite no tiene `ALTER COLUMN`.** Alembic usa el modo *batch*, que reconstruye la tabla. Si una columna nueva es obligatoria en una tabla con datos, dale un `server_default`.
- **Una sola cabeza.** Si dos ramas añaden revisiones sobre la misma anterior, `test_migrations.py` falla: crea una revisión de fusión (`alembic merge heads`).
- La CI falla si un modelo cambió sin su migración.

## Ejecutar Tests

```bash
# Tests unitarios (en desarrollo)
docker compose exec hands-on-edu python -m pytest tests/ -v
```

---

## Debugging

```bash
# Ver logs del contenedor en tiempo real
docker compose logs -f

# Entrar al contenedor
docker compose exec hands-on-edu bash

# Verificar que MediaPipe cargó correctamente
docker compose exec hands-on-edu python -c "from app.core.hand_tracker import HandTracker; t = HandTracker(); print('OK')"

# Health check
curl http://localhost:9876/health
# → {"status": "ok", "version": "0.1.0"}
```
