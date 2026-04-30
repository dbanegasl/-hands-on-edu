# MotivaSign — Aprendizaje de Lengua de Señas

## Propósito

Módulo de aprendizaje interactivo de señas básicas. El estudiante ve la seña, la imita frente a la cámara, y MediaPipe valida si la realizó correctamente. Diseñado para educación inclusiva y bilingüismo (señas básicas universales / aproximación LSE — Lengua de Señas Ecuatoriana).

## URL

`http://localhost:9876/motivasign`

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/static/motivasign.html` | 3 pantallas: idle, game, results |
| `app/static/css/motivasign.css` | Tema espacio púrpura/dorado, animaciones |
| `app/static/js/motivasign.js` | Motor con 2 modos de juego |

---

## Modos

### 📖 Aprender

- Navega el catálogo de 15 señas con botones Anterior / Siguiente.
- Detección continua: al mantener el gesto correcto 1500 ms → celebración visual (animación de feedback).
- Sin límite de tiempo ni puntuación — el estudiante avanza a su ritmo.

### ⚡ Desafío

- 10 señas aleatorias del catálogo (barajadas sin repetición).
- 2500 ms de lectura → detección activa.
- Timeout de 6000 ms por seña — si no detecta el gesto, avanza automáticamente como fallido.
- Calificación final A/B/C/D con grilla de resultados.

---

## Catálogo de Señas (15)

| ID | Seña | Emoji | Gesto detectado | Pista |
|----|------|-------|----------------|-------|
| `uno` | 1 | ☝️ | `pointing` | Levanta el dedo índice |
| `dos` | 2 | ✌️ | `peace` | Índice y medio arriba |
| `tres` | 3 | 🤟 | `3_fingers` | Tres dedos arriba |
| `cuatro` | 4 | 🖖 | `4_fingers` | Cuatro dedos arriba |
| `cinco` | 5 | 🖐️ | `open_hand` | Toda la mano abierta |
| `stop` | STOP | ✋ | `open_hand` | Mano abierta frente a ti |
| `bien` | BIEN 👍 | 👍 | `thumbs_up` | Pulgar arriba |
| `no` | NO ✊ | ✊ | `fist` | Cierra el puño |
| `hola` | HOLA 👋 | 👋 | `open_hand` | Mano abierta y agita |
| `amor` | TE AMO 🤟 | 🤟 | `shaka` | Pulgar y meñique arriba |
| `paz` | PAZ ✌️ | ✌️ | `peace` | Índice y medio en V |
| `apunta` | APUNTA ☝️ | ☝️ | `pointing` | Señala con el índice |
| `ok` | OK 👌 | ✊ | `fist` | Puño cerrado |
| `adios` | ADIÓS 👋 | 👋 | `open_hand` | Abre la mano para despedirte |
| `bravo` | BRAVO 🤙 | 🤙 | `shaka` | Pulgar y meñique |

---

## Mecanismo Hold-to-Confirm

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `HOLD_TIME` | 1500 ms | Tiempo de hold del gesto correcto para confirmar |
| `READING_DELAY` | 2500 ms | Tiempo de visualización de la seña antes de activar detección |
| `CHALLENGE_TIMEOUT` | 6000 ms | Tiempo máximo por seña en modo Desafío |
| `FEEDBACK_DURATION` | 1200 ms | Duración del overlay de feedback |

Un anillo SVG (`stroke-dashoffset`) muestra el progreso del hold. Si el gesto cambia, `holdStart` se resetea y el anillo vuelve a 0.

---

## Máquina de Estados

```
idle
  │
  ├─ [btn Aprender] ──► mode='learn'
  │                      reading → detecting → confirming → feedback → detecting (bucle)
  │
  └─ [btn Desafío] ───► mode='challenge', challengeQueue = shuffle(SIGNS).slice(0,10)
                         reading → detecting → confirming → feedback → siguiente seña
                                                         ↑
                                              timeout (6s) → feedback (fallo) → siguiente
                                                                      │
                                                              (10 señas) → results
```

---

## Sistema de Calificaciones (modo Desafío)

| Aciertos | Nota |
|----------|------|
| 9–10 | A |
| 7–8 | B |
| 5–6 | C |
| 0–4 | D |

La pantalla de resultados muestra una grilla con cada seña del desafío y si fue acertada (✅) o fallida (❌).

---

## Known Limitations

- Varias señas comparten el mismo gesto detectado (ej: `stop`, `hola`, `adios` → todas `open_hand`). En modo Desafío solo una de ellas aparece por vez, pero el clasificador no distingue entre señas del mismo gesto.
- El catálogo es una aproximación de señas básicas universales / LSE, no un estándar certificado.
- No hay síntesis de voz para pronunciar el nombre de la seña.
- No hay persistencia de progreso — al recargar la página se pierde el historial de aprendizaje.
