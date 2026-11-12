# GestiEdu — Evaluaciones Gestuales

## Propósito

Módulo de evaluación interactiva donde los estudiantes responden preguntas usando gestos de mano. Diseñado para educación inicial y primaria (5–10 años). Los resultados se guardan por estudiante y el docente los ve en el panel (REQ-005).

## URL

`http://localhost:9876/gestiedu`

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/static/gestiedu.html` | Estructura HTML (pantallas: idle, game, results) |
| `app/static/css/gestiedu.css` | Estilos (paleta violeta/verde, animaciones infantiles) |
| `app/static/js/gestiedu.js` | Motor del juego completo |
| `app/static/js/ho-learning.js`, `css/ho-learning.css` | Compartido con MotivaSign: «¿Quién juega?», guardado de la partida e historial |

---

## Flujo del Juego

```
idle → [clic Iniciar] → game (10 preguntas) → results
```

Para cada pregunta:

```
reading (2s) → detecting → confirming (hold 1.8s) → feedback (1.5s) → siguiente
```

- **reading**: muestra la pregunta, la detección de gestos está inactiva (warmup).
- **detecting**: el backend analiza frames; espera el gesto correcto.
- **confirming**: el gesto correcto fue detectado; el arco SVG comienza a llenarse.
- **feedback**: overlay verde (correcto) o rojo (incorrecto) durante 1.5 s.

---

## Tipos de Pregunta

| Tipo | Ejemplo | Gesto de respuesta |
|------|---------|-------------------|
| `counting` | "¿Cuántas estrellas hay?" | Dedos levantados = N |
| `truefalse` | "¿2 + 2 = 4? Verdadero o Falso" | 👍 `thumbs_up` = Verdadero, ✊ `fist` = Falso |
| `choice` | "¿Qué animal puede volar? A/B/C" | ☝️ `pointing` = A, ✌️ `peace` = B, 🤟 `3_fingers` = C |

### Preguntas incluidas (10 hardcoded)

| # | Tipo | Tema | Respuesta correcta |
|---|------|------|-------------------|
| 1 | counting | Matemáticas | 3 estrellas |
| 2 | truefalse | Matemáticas | Verdadero (2+2=4) |
| 3 | counting | Ciencias | 4 animales |
| 4 | choice | Ciencias | Opción 2 (Águila vuela) |
| 5 | truefalse | Ciencias | Falso (sol no sale de noche) |
| 6 | counting | Matemáticas | 5 frutas |
| 7 | choice | Lengua | Opción 2 (Banano es amarillo) |
| 8 | truefalse | Matemáticas | Verdadero (3+3=6) |
| 9 | counting | Matemáticas | 2 estrellas |
| 10 | choice | Ciencias | Opción 1 (planta necesita agua y sol) |

---

## Mecanismo Hold-to-Confirm

El gesto correcto debe mantenerse **1800 ms** continuos para confirmar. Un arco SVG (`stroke-dashoffset`) se anima progresivamente. Si el gesto cambia durante el hold, el progreso se reinicia (`holdStart = null`).

```
gesto correcto detectado → holdStart = Date.now()
cada frame con gesto correcto:
  progress = (Date.now() - holdStart) / HOLD_DURATION
  arc.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress)
  if progress >= 1 → confirmar respuesta
gesto incorrecto → holdStart = null, arc regresa al inicio
```

---

## Sistema de Calificaciones

| Aciertos | Nota | Trofeo |
|----------|------|--------|
| 9–10 | A | 🏆 |
| 7–8 | B | ⭐ |
| 5–6 | C | 🌟 |
| 0–4 | D | 💪 |

---

## Resultados guardados (REQ-005)

- En la pantalla de inicio, **¿Quién juega?**: nombre del estudiante (los perfiles se comparten con el Aula de Señas y aparecen como botones). Sin nombre se juega igual, pero no se guarda.
- Al terminar, la partida se guarda como `activity_sessions` (`module="gestiedu"`, `activity="quiz"`): aciertos / 10, nota, duración y cada respuesta en `details.answers`.
- **📜 Mis resultados** muestra las últimas 8 partidas. El docente las ve en el panel (`/panel`, vista de instalación).
- No se envía nota a Moodle: GestiEdu no se lanza por LTI (las notas a Moodle las envía el Aula de Señas, REQ-019).

---

## Variables de Configuración (`gestiedu.js`)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `WS_URL` | `ws://localhost:9876/ws/analyze` | Endpoint WebSocket |
| `HOLD_DURATION` | 1800 ms | Tiempo mínimo de hold para confirmar respuesta |
| `READING_DELAY` | 2000 ms | Warmup antes de activar detección por pregunta |
| `FEEDBACK_DURATION` | 1500 ms | Duración del overlay de feedback correcto/incorrecto |
| `CIRCUMFERENCE` | `2 * Math.PI * 44` | Circunferencia del arco SVG de progreso (radio=44) |

---

## Known Limitations

- Las preguntas están hardcoded en `gestiedu.js` — futuras versiones deberían cargarlas desde una API o desde Moodle.
- El estudiante se identifica solo por su nombre en el dispositivo (sin cuenta); no se lanza desde Moodle.
- Detección de gestos limitada a los clasificadores de `hand_tracker.py` (no ML específico para dígitos).
- Una sola sesión de cámara — no soporta múltiples estudiantes en paralelo en la misma instancia.
