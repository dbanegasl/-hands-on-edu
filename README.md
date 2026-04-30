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

## 🧩 Módulos

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| 🖐️ **GestiEdu** | 🚧 En desarrollo | Evaluaciones interactivas respondidas con gestos de la mano |
| 🤟 **MotivaSign** | 📋 Planificado | Aprendizaje de lengua de señas con reconocimiento por IA |
| 👁️ **AttendEye** | 📋 Planificado | Monitoreo de atención en clases virtuales |
| ✏️ **VirtualPainter** | 📋 Planificado | Escritura y dibujo en el aire con el dedo índice |

---

## 🏗️ Arquitectura del Proyecto

```
-hands-on-edu/
├── app/
│   ├── core/                  # Motor de detección (MediaPipe wrapper)
│   │   └── hand_tracker.py
│   ├── modules/               # Módulos educativos independientes
│   │   ├── gestiedu/
│   │   ├── motivasign/
│   │   ├── attendeye/
│   │   └── virtual_painter/
│   ├── integrations/
│   │   └── moodle/            # Integración con Moodle REST API
│   └── static/                # Frontend web (HTML + JS)
├── models/                    # Modelos de MediaPipe (.task)
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
- Webcam conectada al sistema
- (Opcional) Instancia de Moodle para integración

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

La plataforma estará disponible en: **http://localhost:8000**
Documentación interactiva de la API: **http://localhost:8000/docs**

### Permisos de webcam en Linux

```bash
sudo usermod -aG video $USER
# Cerrar sesión y volver a iniciarla para aplicar el cambio
```

---

## 🔧 Stack Tecnológico

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Python | 3.11 | Lenguaje principal |
| MediaPipe | ≥ 0.10 | Detección de manos (21 landmarks por mano) |
| OpenCV Headless | ≥ 4.8 | Procesamiento de video en contenedor |
| FastAPI | ≥ 0.104 | API REST + streaming WebSockets |
| NumPy | ≥ 1.24 | Cálculos matemáticos de gestos |
| HTTPX | ≥ 0.25 | Cliente HTTP para Moodle REST API |
| python-dotenv | ≥ 1.0 | Gestión de variables de entorno |
| Docker | — | Contenedorización y despliegue |

---

## 🎓 Integración con Moodle

HandsOnEdu se conecta con Moodle mediante su **REST API** para:

- ✅ Registrar resultados de evaluaciones gestuales como calificaciones
- ✅ Marcar actividades como completadas automáticamente
- ✅ Obtener información de cursos y estudiantes
- ✅ Enviar reportes de atención al docente

**Configuración requerida en Moodle:**

1. Ir a `Administración del sitio > Plugins > Servicios web > Activar servicios web`
2. Habilitar protocolo REST
3. Crear un usuario de servicio y generar token
4. Configurar en `.env`:
   ```env
   MOODLE_URL=https://tu-moodle.unae.edu.ec
   MOODLE_TOKEN=tu_token_aqui
   ```

---

## 📚 Documentación

- [Arquitectura del Sistema](docs/architecture.md)
- [Integración con Moodle](docs/moodle-integration.md)
- [Módulo GestiEdu](docs/modules/gestiedu.md)
- [Módulo MotivaSign](docs/modules/motivasign.md)
- [Módulo AttendEye](docs/modules/attendeye.md)
- [API Reference](http://localhost:8000/docs) *(requiere servidor activo)*

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
