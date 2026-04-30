# REQ-012 — Módulo AirPiano (Piano virtual gestual)

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-012 |
| **Tipo** | Feature |
| **Prioridad** | Media |
| **Estado** | 📋 Pendiente |
| **Módulo** | AirPiano (nuevo) |
| **Esfuerzo estimado** | L (10–14 horas) |

---

## Problema

HandsOnEdu actualmente cubre 4 áreas educativas (evaluación, lenguaje de señas, asistencia, dibujo) pero **no tiene contenido para educación musical ni para entrenamiento explícito de motricidad fina**. La motricidad fina es uno de los ejes de desarrollo más importantes en niños de 5–10 años y un área clave en terapia ocupacional para personas con dificultades motoras (parálisis cerebral, post-ACV, TEA con perfil sensorial particular).

MediaPipe Hand Landmarker permite distinguir los 5 dedos individualmente con precisión sub-pixel, lo que abre la posibilidad de usar **cada dedo como un controlador independiente** — una capacidad que ningún módulo actual aprovecha. La combinación con la **Web Audio API** (ya validada en REQ-002 con `audio.js`) permite generar sonido sintético sin dependencias externas, sin licencias y con latencia < 30 ms.

Un módulo de **piano virtual gestual** es la puerta de entrada natural a este territorio: tiene un mapping mental obvio (dedo → nota), una curva de aprendizaje suave, y produce gratificación inmediata (cada gesto suena), lo que mantiene el engagement de niños mientras entrenan independencia digital.

---

## Alcance propuesto

### Mecánica principal

```
┌──────────────────────────────────────────────────────────────────┐
│  WHEEL ESCALAS  │       8 TECLAS PIANO       │  WHEEL INSTRUMENTOS│
│   (izquierda)   │   DO  RE  MI  FA  SOL ...  │     (derecha)      │
│                 │   ─────────────────────    │                    │
│   Do mayor    ◀ │   ┃   ┃   ┃   ┃   ┃   ┃    │ ▶  Piano           │
│   Re menor      │   ┃   ┃   ┃   ┃   ┃   ┃    │    Marimba         │
│   Pentatónica   │   ┃   ┃   ┃   ┃   ┃   ┃    │    Sintetizador    │
│   Blues         │   ─────────────────────    │    Cuerdas         │
└──────────────────────────────────────────────────────────────────┘
                       Cámara con feed espejado
                  Dedos detectados → notas reproducidas
```

### Detección de "tecla presionada"

```
Para cada dedo (5 puntas: 4, 8, 12, 16, 20):
  1. Calcular zona horizontal (X) sobre la cual está la punta del dedo
  2. Si X cae dentro del rectángulo de una tecla:
     a. Verificar si el dedo está "abajo" (Y > umbral inferior del piano)
     b. Si transiciona de NO-tocando a TOCANDO → disparar nota (note-on)
     c. Si transiciona de TOCANDO a NO-tocando → liberar nota (note-off)
```

**Anti-rebote:** la transición usa histéresis (umbral entrar = Y > 0.65, umbral salir = Y < 0.55) para evitar disparos múltiples por jitter.

### Modos de juego

| Modo | Descripción |
|------|-------------|
| **🎹 Libre** | Cualquier dedo puede tocar cualquier tecla. Sin objetivos, exploración pura. |
| **👆 Asignado** | Cada dedo = una nota fija (meñique=Do, anular=Re, medio=Mi, índice=Fa, pulgar=Sol). Entrena independencia digital. |
| **🎯 Tutorial** | El sistema ilumina una tecla → niño debe tocarla. Acumula puntos por precisión + velocidad. 10 niveles de dificultad. |
| **🎵 Canción** | El sistema reproduce una melodía simple (Twinkle Twinkle, Cumpleaños, Estrellita) y el niño debe replicarla. Indica qué tecla toca a continuación con un highlight. |

### Wheel de escalas (mano izquierda)

```
- Selector circular en columna izquierda con 4 opciones:
  • Do mayor (C, D, E, F, G, A, B, C)         — alegre, default
  • La menor (A, B, C, D, E, F, G, A)         — melancólico
  • Pentatónica (C, D, E, G, A, C, D, E)      — orientalista, "no falla"
  • Blues (C, Eb, F, F#, G, Bb, C, Eb)        — bluesy
- Selección por dwell de 1.5 segundos sobre el ítem (mismo patrón que VirtualPainter)
```

### Wheel de instrumentos (mano derecha)

```
- 4 timbres sintetizados con Web Audio API:
  • 🎹 Piano        — sine + harmonics, ataque rápido, decay 1.5s
  • 🪵 Marimba      — triangle, ataque instantáneo, decay 0.8s
  • 🎛️ Sintetizador — sawtooth + lowpass filter, sustain
  • 🎻 Cuerdas       — sine + lfo vibrato, ataque lento, sustain larga
- Mismo patrón de dwell que el wheel de escalas
```

### Visualización en tiempo real

- **Teclas iluminadas** cuando se tocan (highlight verde 200ms).
- **Onda visual** en la parte inferior: oscilograma del audio en vivo (analyser node).
- **Etiquetas de notas** flotando 600ms al disparar cada tecla (ej: "DO", "MI").
- **Indicador del dedo activo** sobre cada landmark con color del modo.

---

## Arquitectura

### Backend (sin cambios)

Se reutiliza el endpoint WebSocket `/ws/analyze` existente. **No se requieren rutas nuevas en `app/main.py`** salvo el serving del HTML estático (que ya cubre `app/static/`).

### Frontend (nuevos archivos)

```
app/static/airpiano.html              ← HTML del módulo (toolbar + canvas + UI)
app/static/css/airpiano.css           ← Estilos del piano, wheels, animaciones
app/static/js/airpiano.js             ← Lógica de detección de dedos + state machine
app/static/js/audio-synth.js          ← Síntesis de los 4 timbres (extiende AudioFeedback)
```

### Integración con landing page

```
app/static/index.html                 ← Agregar card del 5to módulo
app/static/css/index.css              ← (si necesita ajustes de grilla)
```

---

## Archivos a crear / modificar

### `app/static/js/audio-synth.js` (nuevo)

Módulo de síntesis musical, separado de `audio.js` (que se queda solo con SFX cortos).

```javascript
class MusicSynth {
  constructor() {
    this.ctx = null;
    this.activeNotes = new Map(); // noteId → { osc, gain }
    this.instrument = 'piano';
  }

  _getContext() { ... } // lazy init para autoplay policy

  noteOn(midiNote, velocity = 0.7) {
    const ctx = this._getContext();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    // Crear OscillatorNode + GainNode según this.instrument
    // Aplicar envelope ADSR específico del instrumento
    // Almacenar en activeNotes
  }

  noteOff(midiNote) {
    // Aplicar release del envelope, desconectar al terminar
  }

  setInstrument(name) { this.instrument = name; }
}
```

### `app/static/js/airpiano.js` (nuevo, ~600 líneas)

Estructura inspirada en `virtualpainter.js`:

```javascript
const SCALES = {
  'do_mayor':    [60, 62, 64, 65, 67, 69, 71, 72],   // MIDI notes
  'la_menor':    [57, 59, 60, 62, 64, 65, 67, 69],
  'pentatonica': [60, 62, 64, 67, 69, 72, 74, 76],
  'blues':       [60, 63, 65, 66, 67, 70, 72, 75],
};

const FINGERTIPS = [4, 8, 12, 16, 20]; // pulgar, índice, medio, anular, meñique

let synth;
let currentScale       = 'do_mayor';
let currentInstrument  = 'piano';
let mode               = 'libre'; // 'libre' | 'asignado' | 'tutorial' | 'cancion'
let activeKeys         = new Set();
let fingerStates       = new Map(); // fingerIdx → { lastY, isDown, currentKey }

function detectKeyPress(landmarks) {
  for (const tipIdx of FINGERTIPS) {
    const lm = landmarks[tipIdx];
    const x = lm.x;
    const y = lm.y;
    const keyIdx = Math.floor(x * 8); // 8 teclas en eje X
    const wasDown = fingerStates.get(tipIdx)?.isDown ?? false;
    const isDown  = y > 0.65; // umbral de "tecla presionada"

    if (isDown && !wasDown) {
      const note = SCALES[currentScale][keyIdx];
      synth.noteOn(note);
      activeKeys.add(keyIdx);
    } else if (!isDown && wasDown) {
      const prevKey = fingerStates.get(tipIdx)?.currentKey;
      synth.noteOff(SCALES[currentScale][prevKey]);
      activeKeys.delete(prevKey);
    }
    fingerStates.set(tipIdx, { lastY: y, isDown, currentKey: keyIdx });
  }
}

function handleWSMessage(data) { ... }
function renderLoop() { ... }
function start() { ... }
```

### `app/static/airpiano.html` (nuevo)

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>AirPiano | HandsOnEdu</title>
  <link rel="stylesheet" href="/static/css/airpiano.css"/>
</head>
<body>
  <nav class="ap-nav">
    <a href="/" class="ap-logo">🖐️ HandsOnEdu</a>
    <span class="ap-module-name">🎹 AirPiano</span>
    <button id="ap-btn-mute" title="Silenciar">🔊</button>
    <a href="/" class="ap-back">← Inicio</a>
  </nav>

  <div id="ap-toolbar">
    <select id="ap-mode-select">
      <option value="libre">🎹 Libre</option>
      <option value="asignado">👆 Asignado</option>
      <option value="tutorial">🎯 Tutorial</option>
      <option value="cancion">🎵 Canción</option>
    </select>
  </div>

  <div id="ap-canvas-area">
    <video id="ap-video" autoplay playsinline muted></video>
    <canvas id="ap-cam-canvas"></canvas>
    <canvas id="ap-keys-canvas"></canvas>      <!-- piano keys overlay -->
    <canvas id="ap-wave-canvas"></canvas>      <!-- live oscilograma -->

    <!-- Wheel escalas (izquierda) -->
    <div id="ap-wheel-scales" class="ap-wheel">
      <div class="ap-wheel-item active" data-scale="do_mayor">Do Mayor</div>
      <div class="ap-wheel-item" data-scale="la_menor">La menor</div>
      <div class="ap-wheel-item" data-scale="pentatonica">Pentatónica</div>
      <div class="ap-wheel-item" data-scale="blues">Blues</div>
    </div>

    <!-- Wheel instrumentos (derecha) -->
    <div id="ap-wheel-instr" class="ap-wheel">
      <div class="ap-wheel-item active" data-instr="piano">🎹 Piano</div>
      <div class="ap-wheel-item" data-instr="marimba">🪵 Marimba</div>
      <div class="ap-wheel-item" data-instr="synth">🎛️ Synth</div>
      <div class="ap-wheel-item" data-instr="strings">🎻 Cuerdas</div>
    </div>

    <!-- Cursor / dedos activos -->
    <div id="ap-fingers"></div>

    <!-- Guía inicial -->
    <div id="ap-guide">
      <div class="ap-guide-card">
        <h3>🎹 Cómo usar AirPiano</h3>
        <p>Mueve tus dedos sobre las teclas para tocar notas.</p>
        <button id="ap-btn-start" class="ap-start-btn">▶ Comenzar a tocar</button>
      </div>
    </div>
  </div>

  <script src="/static/js/audio.js"></script>
  <script src="/static/js/audio-synth.js"></script>
  <script src="/static/js/airpiano.js"></script>
</body>
</html>
```

### `app/static/css/airpiano.css` (nuevo)

Estilos para:
- `#ap-toolbar` (igual estilo que VirtualPainter para coherencia visual)
- `.ap-key` con animación de press (background-color → verde 200ms)
- `.ap-wheel` con disposición vertical y dwell highlight
- `#ap-wave-canvas` con altura fija inferior, fondo translúcido oscuro
- `.ap-finger-tip` (12px, color por dedo: meñique=rojo, anular=naranja, medio=amarillo, índice=verde, pulgar=azul)
- Animación `apNoteFloat` (label de nota subiendo 60px y fading-out en 600ms)

### `app/main.py` (modificar)

Agregar ruta GET `/airpiano` que sirva `app/static/airpiano.html`.

```python
@app.get("/airpiano", response_class=HTMLResponse)
def airpiano():
    return FileResponse("app/static/airpiano.html")
```

### `app/static/index.html` (modificar)

Agregar card del 5to módulo en la grilla de la landing:

```html
<a class="module-card" href="/airpiano">
  <div class="module-icon">🎹</div>
  <h3>AirPiano</h3>
  <p>Piano virtual gestual: cada dedo toca una nota distinta. Entrena motricidad fina mientras compones música.</p>
</a>
```

### `tests/test_main.py` (modificar)

Agregar test que valide la ruta `/airpiano`:

```python
def test_airpiano_route_returns_html():
    response = client.get("/airpiano")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
```

### `docs/development.md` o similar (modificar)

Agregar sección "Módulo AirPiano" con descripción técnica, mapping de dedos→notas, cómo extender escalas/instrumentos.

---

## Criterio de aceptación

- ✅ La ruta `/airpiano` carga la UI con cámara, toolbar y wheels visibles.
- ✅ Al detectar una mano, las puntas de los 5 dedos se renderizan como puntos de color sobre el feed.
- ✅ Cuando un dedo cruza el umbral Y > 0.65 sobre una zona de tecla, se reproduce la nota correspondiente con latencia perceptible < 80 ms.
- ✅ Al levantar el dedo (Y < 0.55) la nota se libera (sin clicks ni cortes abruptos).
- ✅ Las 4 escalas funcionan correctamente: cada una produce las notas MIDI esperadas.
- ✅ Los 4 instrumentos suenan distintos entre sí (envelope, timbre, harmonics).
- ✅ El wheel de escalas se selecciona con dwell de 1.5s con la mano izquierda (X < 0.2).
- ✅ El wheel de instrumentos se selecciona con dwell de 1.5s con la mano derecha (X > 0.8).
- ✅ Modo "asignado" obliga a usar el dedo correcto: si toca con otro dedo, no suena (o suena un buzz suave de error).
- ✅ Modo "tutorial" ilumina la tecla objetivo en azul; al tocarla correctamente acumula 1 punto.
- ✅ Modo "canción" reproduce 3 melodías predefinidas (Twinkle, Cumpleaños, Estrellita) e indica la siguiente nota con highlight pulsante.
- ✅ El oscilograma en vivo muestra la onda del audio reproducido.
- ✅ El botón mute (compartido con `audio.js`) silencia inmediatamente todas las notas activas.
- ✅ Al cerrar/recargar la página, todas las notas activas se liberan limpiamente (sin notas "colgadas").
- ✅ Test unitario de la ruta `/airpiano` pasa.
- ✅ Compatible con la latencia actual del WebSocket (~30 ms backend + ~30 ms síntesis = ~60 ms total, dentro del umbral perceptible).

---

## Notas de implementación

> **MIDI a frecuencia:** la fórmula `freq = 440 * 2^((midi - 69) / 12)` da la frecuencia en Hz. MIDI 60 = Do central (C4) = 261.63 Hz.

> **Polifonía:** la implementación debe soportar mínimo **5 notas simultáneas** (una por dedo). Cada `noteOn` crea su propio `OscillatorNode` + `GainNode` y se desconecta al terminar el release del envelope para evitar memory leaks.

> **Envelope ADSR sugerido por instrumento:**
> - Piano: A=10ms, D=200ms, S=0.6, R=800ms
> - Marimba: A=2ms, D=400ms, S=0, R=400ms (no sustain)
> - Synth: A=50ms, D=100ms, S=0.8, R=300ms
> - Cuerdas: A=300ms, D=100ms, S=0.9, R=1500ms

> **Histéresis de Y:** el doble umbral (0.65 entrar / 0.55 salir) es crítico. Sin esto, el jitter natural de MediaPipe (~2-3 px) causa disparos múltiples ("trémolo no deseado") cuando el dedo está justo en el límite.

> **Rendimiento:** con 5 dedos × 60 fps = 300 evaluaciones/seg, mantener `detectKeyPress()` < 0.5 ms para no impactar el render loop. Usar `Map` (no `Object`) para `fingerStates` por su mejor performance en lookups.

> **Calibración del piano:** las 8 teclas deben estar en el rango Y = [0.50, 0.95] para ser cómodas (zona inferior de la pantalla). Permitir al usuario ajustar la altura del piano con un slider en una iteración futura.

> **Accesibilidad:** todas las notas tienen visualización (highlight + label), por lo que usuarios sordos pueden ver lo que tocan. Considerar añadir vibración táctil en dispositivos móviles compatibles (`navigator.vibrate`) en una iteración futura.

---

## Dependencias

- **REQ-002** (Audio Feedback) — ✅ Hecho. Reutiliza la infraestructura de `audio.js` y patrones de Web Audio API (lazy AudioContext, mute persistente).
- **MediaPipe Hand Landmarker** — ya integrado en el backend.

---

## Iteraciones futuras (fuera de alcance de este REQ)

- 🎼 Modo grabación: capturar lo que toca el niño y exportar como MIDI o WAV.
- 🤝 Modo dúo: dos manos = dos pianos lado a lado, ideal para clases con 2 alumnos.
- 📊 Métricas de motricidad: tracking de qué dedos usa más, precisión por dedo, tiempo entre notas → reporte clínico (puente con REQ-005 SQLite).
- 🎤 Conexión a MIDI físico: enviar notas a sintetizadores externos vía Web MIDI API.
- 🌍 Más escalas: árabe, japonesa, modos griegos (dórico, frigio, lidio).

---

*Volver al [Índice de Requisitos](./INDEX.md)*
