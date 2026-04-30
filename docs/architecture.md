# Arquitectura del Sistema — HandsOnEdu

## Visión General

HandsOnEdu sigue una arquitectura modular en capas:

```
┌─────────────────────────────────────────┐
│              Frontend Web               │
│         (HTML + JS + WebSocket)         │
└─────────────┬───────────────────────────┘
              │ WebSocket / HTTP
┌─────────────▼───────────────────────────┐
│           FastAPI (app/main.py)         │
│         API REST + Stream Endpoints     │
└──────┬──────────────────────┬───────────┘
       │                      │
┌──────▼──────┐     ┌─────────▼──────────┐
│   Módulos   │     │   Integrations     │
│  Educativos │     │   Moodle REST API  │
│  (modules/) │     │  (integrations/)   │
└──────┬──────┘     └────────────────────┘
       │
┌──────▼──────────────────────────────────┐
│            Core — HandTracker           │
│     MediaPipe Hand Landmarker Wrapper   │
└──────┬──────────────────────────────────┘
       │
┌──────▼──────────────────────────────────┐
│         MediaPipe Tasks API             │
│    hand_landmarker.task (modelo ~8MB)   │
└─────────────────────────────────────────┘
```

## Flujo de Datos

1. **Captura**: El navegador del usuario accede a la webcam via `getUserMedia()`.
2. **Streaming**: Los frames se envían al backend via WebSocket como bytes JPEG.
3. **Detección**: `HandTracker` procesa cada frame con MediaPipe y retorna los 21 landmarks de cada mano.
4. **Lógica**: El módulo activo interpreta los landmarks como gestos específicos.
5. **Respuesta**: El resultado se envía de vuelta al frontend (coordenadas, gesto detectado, score).
6. **Moodle**: Si hay un evento de evaluación, `MoodleClient` lo registra via REST API.

## Decisiones de Diseño

| Decisión | Razón |
|----------|-------|
| `opencv-python-headless` | Sin dependencias de display en contenedor |
| WebSocket para video | Evita X11 forwarding, funciona en cualquier OS |
| Módulos independientes | Cada demo puede desarrollarse y desplegarse por separado |
| Modelo descargado en build | No sube 8MB al repositorio git |
| FastAPI | Async nativo, OpenAPI automático, WebSockets integrados |
