# REQ-002 — Feedback de Audio en GestiEdu y MotivaSign

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-002 |
| **Tipo** | Mejora |
| **Prioridad** | Media |
| **Estado** | 📋 Pendiente |
| **Módulo** | GestiEdu, MotivaSign |
| **Esfuerzo estimado** | S (1–2 horas) |

---

## Problema

La retroalimentación actual de GestiEdu y MotivaSign es **100% visual**: colores, animaciones, y texto en pantalla. Esto genera problemas en contextos reales de aula:

- Usuarios con **discapacidad visual parcial** no perciben los eventos de acierto/error.
- En **entornos con alta iluminación** (aulas con luz solar directa) las señales visuales se pierden.
- Los estudiantes deben mantener la vista en la cámara y en la pantalla simultáneamente; el audio libera la atención visual.
- Sin audio, la experiencia se siente "incompleta" comparada con otras herramientas educativas.

---

## Alcance propuesto

### GestiEdu

| Evento | Sonido | Descripción |
|--------|--------|-------------|
| Respuesta correcta | `ding` | Tono agudo corto y positivo (880 Hz, 150 ms) |
| Respuesta incorrecta | `buzz` | Tono grave corto (200 Hz, 200 ms, ligero vibrato) |
| Cuenta regresiva (cada segundo) | `tick` | Click suave (1000 Hz, 50 ms) |
| Fin de evaluación | `fanfare` | Secuencia ascendente de 3 notas (Do-Mi-Sol) |

### MotivaSign

| Evento | Sonido | Descripción |
|--------|--------|-------------|
| Gesto confirmado | `pop` | Burbuja suave (600 Hz, 80 ms, decay rápido) |
| Progreso de nivel | `chime` | Campanilla (1200 Hz, 300 ms, sustain) |
| Signo incorrecto | `beep suave` | Beep no intrusivo (400 Hz, 100 ms, volumen 30%) |

### Módulo compartido `audio.js`

Todos los sonidos se generarán **programáticamente** con la **Web Audio API** (sin archivos de audio externos, sin dependencias npm). Esto garantiza:

- Funcionamiento offline.
- Sin problemas de CORS o carga de assets.
- Tamaño 0 KB adicional en el bundle.

```javascript
// Ejemplo de API pública del módulo
import { AudioFeedback } from './audio.js';

const audio = new AudioFeedback();
audio.play('ding');       // GestiEdu correcto
audio.play('buzz');       // GestiEdu incorrecto
audio.setVolume(0.5);     // 0.0 a 1.0
audio.mute();
audio.unmute();
audio.isMuted();          // boolean
```

### Control de volumen

- **Slider o toggle mute** en el header de cada módulo (GestiEdu y MotivaSign).
- El estado de mute se persiste en `localStorage` bajo la clave `handsonedu_audio_muted`.
- Respetar la preferencia del sistema `prefers-reduced-motion` (si está activa, reducir volumen al 20% por defecto).
- Añadir opción de **silencio total** pensada para entornos de clase compartida.

---

## Archivos a crear / modificar

### Crear
```
app/static/js/audio.js       ← módulo AudioFeedback compartido
```

### Modificar
```
app/static/js/gestiedu.js    ← importar AudioFeedback, llamar play() en eventos
app/static/js/motivasign.js  ← importar AudioFeedback, llamar play() en eventos
app/templates/gestiedu.html  ← agregar botón/slider de mute en header
app/templates/motivasign.html ← agregar botón/slider de mute en header
```

---

## Criterio de aceptación

- ✅ Al confirmar respuesta **correcta** en GestiEdu se reproduce el tono `ding`.
- ✅ Al confirmar respuesta **incorrecta** en GestiEdu se reproduce el tono `buzz`.
- ✅ Al confirmar gesto en MotivaSign se reproduce el tono `pop`.
- ✅ Existe botón **mute/unmute** funcional en el header de cada módulo.
- ✅ El estado de mute persiste al recargar la página (localStorage).
- ✅ Con mute activo, **ningún sonido** se reproduce.
- ✅ La Web Audio API se inicializa sólo tras interacción del usuario (evitar error de `AudioContext` bloqueado por el navegador).

---

## Notas de implementación

> **⚠️ Importante:** Los navegadores modernos bloquean `AudioContext` hasta que haya una interacción del usuario (click, keydown). Inicializar `AudioFeedback` dentro del handler del primer click/gesture del módulo, no en el `DOMContentLoaded`.

```javascript
// audio.js — estructura base sugerida
class AudioFeedback {
  constructor() {
    this._ctx = null;
    this._volume = 1.0;
    this._muted = localStorage.getItem('handsonedu_audio_muted') === 'true';
  }

  _getContext() {
    if (!this._ctx) this._ctx = new AudioContext();
    return this._ctx;
  }

  _beep(freq, duration, type = 'sine', volume = 1.0) {
    if (this._muted) return;
    const ctx = this._getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(this._volume * volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  play(sound) { /* dispatch por nombre */ }
  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); }
  mute()   { this._muted = true;  localStorage.setItem('handsonedu_audio_muted', 'true'); }
  unmute() { this._muted = false; localStorage.setItem('handsonedu_audio_muted', 'false'); }
  isMuted() { return this._muted; }
}
```

---

## Dependencias

Ninguna (sin dependencias externas, solo Web Audio API nativa del navegador).

---

*Volver al [Índice de Requisitos](./INDEX.md)*
