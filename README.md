# 🖐️ HandsOnEdu

> **Plataforma Educativa con Control Gestual** — Desarrollado para la [UNAE](https://www.unae.edu.ec/) (Universidad Nacional de Educación del Ecuador)

[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10+-green.svg)](https://mediapipe.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🎯 Visión del Proyecto

**HandsOnEdu** es una plataforma educativa de código abierto que utiliza **visión por computadora** e **inteligencia artificial** para crear experiencias de aprendizaje accesibles e inclusivas. Diseñada especialmente para la interacción con niños en educación inicial y primaria, con integración nativa a plataformas **Moodle** vía REST API.

> *"Aprendizaje activo a través del movimiento de las manos"*

---

## 🧩 Módulos Disponibles

| Módulo | URL | Descripción | Estado |
|--------|-----|-------------|--------|
| 🖐️ **GestiEdu** | `/gestiedu` | Quiz interactivo donde los estudiantes responden preguntas mostrando gestos de mano (conteo de dedos, Verdadero/Falso, opciones A/B/C). Integración con Moodle para registrar calificaciones. | ✅ Disponible |
| 🤟 **MotivaSign** | `/motivasign` | Aprendizaje de señas básicas con reconocimiento por IA. Catálogo de 15 señas con modo Aprender (libre) y modo Desafío (10 señas aleatorias con puntuación). | ✅ Disponible |
| 👁️ **AttendEye** | `/attendeye` | Herramienta docente para tomar asistencia gestual (mano levantada = presente) y monitorear participación en tiempo real con reporte exportable. | ✅ Disponible |
| ✏️ **VirtualPainter** | `/virtualpainter` | Dibujo AR en el aire: el usuario dibuja sobre la imagen de la cámara con el dedo índice. Soporta borrador, selección de color por gesto y modo pizarrón. | ✅ Disponible |

---

## 🏗️ Arquitectura del Proyecto

```
-hands-on-edu/
├── app/
│   ├── main.py                # FastAPI: rutas HTTP + WebSocket /ws/analyze
│   ├── core/                  # Motor de detección (MediaPipe wrapper)
│   │   └── hand_tracker.py
│   ├── modules/               # Lógica Python por módulo (stubs extensibles)
│   │   ├── gestiedu/
│   │   ├── motivasign/
│   │   ├── attendeye/
│   │   └── virtual_painter/
│   ├── integrations/
│   │   └── moodle/            # Cliente REST Moodle
│   │       └── rest_api.py
│   └── static/                # Frontend web (HTML + CSS + JS, sin build step)
│       ├── index.html
│       ├── testing.html
│       ├── gestiedu.html
│       ├── motivasign.html
│       ├── attendeye.html
│       ├── virtualpainter.html
│       ├── css/
│       └── js/
├── models/                    # hand_landmarker.task (descargado al hacer build)
├── docs/                      # Documentación técnica
├── tests/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Inicio Rápido

### Prerrequisitos
- Docker + Docker Compose
- Navegador moderno con acceso a cámara (Chrome, Firefox, Edge)
- (Opcional) Instancia de Moodle para integración

> **Webcam**: la cámara es capturada por el navegador via `getUserMedia()` — no se necesita pasar dispositivos al contenedor Docker.

### Levantar con Docker

```bash
# Clonar el repositorio
git clone https://github.com/dbanegasl/-hands-on-edu.git
cd -- -hands-on-edu

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Moodle si deseas integración

# Construir y levantar
docker compose up --build
```

| URL | Descripción |
|-----|-------------|
| **http://localhost:9876** | Landing page + módulos |
| **http://localhost:9876/docs** | Documentación interactiva de la API (Swagger) |
| **http://localhost:9876/testing** | Testing Lab (prueba MediaPipe antes de usar los módulos) |

> **Primer build**: descarga el modelo `hand_landmarker.task` (~7.8 MB) de Google Storage. Requiere conexión a internet. Builds posteriores usan la imagen en caché.

---

## 🔧 Stack Tecnológico

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Python | 3.11 | Lenguaje principal del backend |
| MediaPipe | ≥ 0.10 | Detección de manos (21 landmarks por mano, hasta 2 manos) |
| OpenCV Headless | ≥ 4.8 | Decodificación de frames JPEG en contenedor (sin display) |
| FastAPI | ≥ 0.104 | API REST + WebSocket `/ws/analyze` |
| NumPy | ≥ 1.24 | Cálculos matemáticos de gestos |
| HTTPX | ≥ 0.25 | Cliente HTTP async para Moodle REST API |
| python-dotenv | ≥ 1.0 | Gestión de variables de entorno |
| Docker | — | Contenedorización y despliegue reproducible |

---

## 🎓 Integración con Moodle

HandsOnEdu se conecta con Moodle mediante su **REST API** para:

- ✅ Registrar resultados de evaluaciones gestuales como calificaciones
- ✅ Marcar actividades como completadas automáticamente
- ✅ Obtener información de cursos y estudiantes

**Configuración requerida en Moodle:**

1. Ir a `Administración del sitio > Plugins > Servicios web > Activar servicios web`
2. Habilitar protocolo REST
3. Crear un usuario de servicio y generar token
4. Configurar en `.env`:
   ```env
   MOODLE_URL=https://tu-moodle.unae.edu.ec
   MOODLE_TOKEN=tu_token_aqui
   ```

Ver [docs/moodle-integration.md](docs/moodle-integration.md) para instrucciones detalladas.

---

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [Arquitectura del Sistema](docs/architecture.md) | Diagrama de capas, flujo WebSocket, decisiones de diseño |
| [Protocolo WebSocket](docs/websocket-protocol.md) | Referencia completa del endpoint `/ws/analyze` |
| [Integración con Moodle](docs/moodle-integration.md) | Configuración y funciones REST usadas |
| [GestiEdu](docs/modules/gestiedu.md) | Evaluaciones gestuales: flujo, tipos de pregunta, hold-to-confirm |
| [MotivaSign](docs/modules/motivasign.md) | Aprendizaje de señas: catálogo, modos, máquina de estados |
| [AttendEye](docs/modules/attendeye.md) | Asistencia y participación: roll call, reporte, doble WebSocket |
| [VirtualPainter](docs/modules/virtualpainter.md) | Dibujo AR: capas canvas, modos de gesto, algoritmo de trazo |
| [Guía de Desarrollo](docs/development-guide.md) | Cómo crear módulos, convenciones, hot-reload |
| [Guía de Despliegue](docs/deployment.md) | Local, producción, Nginx, HTTPS/WSS |
| [API Reference](http://localhost:9876/docs) | Swagger UI *(requiere servidor activo)* |

---

## 🏛️ Contexto Institucional

Desarrollado en el **Área de Entornos Virtuales** de la [UNAE](https://www.unae.edu.ec/) como parte de iniciativas de innovación educativa con tecnología accesible e inclusiva para docentes y estudiantes del Ecuador.

---

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama: `git checkout -b feature/nombre-del-modulo`
3. Commit: `git commit -m 'feat: descripción del cambio'`
4. Push: `git push origin feature/nombre-del-modulo`
5. Abrir Pull Request

---

## 📄 Licencia

MIT License — ver [LICENSE](LICENSE) para detalles.

---

<p align="center">
  Desarrollado con ❤️ para la educación ecuatoriana 🇪🇨<br/>
  <a href="https://www.unae.edu.ec/">UNAE — Universidad Nacional de Educación</a>
</p>
