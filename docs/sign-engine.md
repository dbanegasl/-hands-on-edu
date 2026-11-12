# Motor de reconocimiento de señas — HandsOnEdu

> **Última actualización:** 2026-11-11 · REQ-016, REQ-017 · v0.9.0

Este documento describe cómo HandsOnEdu detecta manos y reconoce señas de una lengua de señas (hoy **LSEC — Lengua de Señas Ecuatoriana**), cómo se define el contenido y cómo se calibró el motor.

---

## 1. Visión general

```
 Cámara ──► canvas espejado ──► MediaPipe HandLandmarker (WASM, en el navegador)
                                        │  21 landmarks/mano + lateralidad
                                        ▼
                       ho-hands.js  buildResponse()  ── mismo JSON que /ws/analyze
                                        │
             ┌──────────────────────────┼───────────────────────────┐
             ▼                          ▼                           ▼
   módulos existentes          ho-signs.js SignRecognizer     Estudio de Señas
   (gestos: fist, peace…)      descriptores + kNN + DTW       (grabar / probar)
                                        │
                                        ▼
                           /api/signs/* · /api/sessions/* (SQLite)
```

- **El video nunca sale del dispositivo.** La detección corre en el navegador (`app/static/js/ho-hands.js`). El servidor solo guarda catálogo, plantillas y progreso.
- **Respaldo en servidor:** si el navegador no puede cargar MediaPipe (sin WASM/WebGL, red que bloquea la descarga), `HO.createHandSource()` usa automáticamente `WS /ws/analyze`. `?engine=server` en la URL o `localStorage['ho.engine']='server'` lo fuerza.
- **Sin dependencia de CDN:** el bundle de MediaPipe Tasks JS y los WASM se descargan al construir la imagen Docker (`/vendor/mediapipe/`). El modelo se sirve en `/models/hand_landmarker.task`. El CDN solo se usa si faltan.

## 2. Motor de manos en el navegador (`ho-hands.js`)

| Pieza | Descripción |
|---|---|
| `fingerStates`, `detectGesture`, `GestureSmoother`, `buildResponse` | Port línea a línea de `app/core/hand_tracker.py` y `app/api/ws.py`. La paridad se verifica con `tests/fixtures/gesture_parity.json` desde **pytest y node** (90 manos, incluidas rotaciones y ruido). |
| `LocalHandEngine` | Misma interfaz que `HO.HandSocket` (`connect / sendFrame / close / isOpen / isBusy`, callbacks `onResult / onStatus`). Entrega resultados de forma asíncrona (microtask), igual que el WebSocket. |
| `createHandSource(opts)` | Fábrica que usan todos los módulos. |
| Selección de delegado | Si el renderizador WebGL es por software (SwiftShader/llvmpipe), usa **CPU**; si no, **GPU**, y cambia a CPU en caliente si la GPU promedia > 60 ms/cuadro. Medido en Chromium con GPU emulada: GPU 180 ms vs CPU 44 ms por cuadro. |

Cada mano del resultado incluye además `aspect` (ancho/alto del cuadro) y `world_landmarks`.

> **Lateralidad:** MediaPipe Tasks etiqueta las manos como se ven en una imagen **no espejada**. En el canvas espejado de la app, la mano derecha real llega como `"Left"`. Esto se verificó con fotos reales (§6). El motor de señas no depende de la etiqueta real: la usa solo para canonicalizar.

## 3. Catálogo de una lengua de señas

Ubicación: `app/content/<código>/catalog.json`. Se valida al cargar (`app/signs/catalog.py`) y se sirve en `GET /api/signs/<código>/catalog`.

```jsonc
{
  "language": { "code": "lsec", "name": "...", "status": "borrador", "validation_note": "...", "references": [...] },
  "categories": [{ "id": "dactilologia", "name": "Alfabeto dactilológico", "icon": "🔤", "order": 1 }],
  "units":      [{ "id": "u1", "title": "Vocales", "category": "dactilologia", "signs": ["a","e","i","o","u"] }],
  "signs": [{
    "id": "v", "gloss": "V", "category": "dactilologia",
    "kind": "static",            // "static" | "dynamic"
    "hands": 1,
    "description": "...", "hint": "...",
    "validated": false,          // true solo tras revisión de intérpretes/comunidad sorda
    "confusable": ["u", "num_2"],
    "handshape": { ... }          // opcional, solo para señas estáticas
  }]
}
```

### Vocabulario de `handshape`

| Clave | Valores | Significado |
|---|---|---|
| `index`, `middle`, `ring`, `pinky` | `extended` · `bent` (gancho) · `curled` (recogido) · `not_extended` · `any` | Estado de cada dedo |
| `thumb` | `extended` · `side` (al costado del índice, letra A) · `across` (sobre la palma, B/S) · `folded` (side o across) · `any` | Pulgar |
| `touch` | `[["thumb_tip","index_tip"], ...]` | Puntas que se tocan |
| `together` / `apart` | pares de puntos | Dedos juntos (U) o separados (V) |
| `crossed` | `["index","middle"]` | El medio cruza sobre el índice (R) |
| `palm` | `forward` (hacia la cámara) · `back` · `side` · `up` · `down` · `any` | Orientación de la palma |
| `fingers` | `up` · `down` · `side` · `forward` · `any` | Hacia dónde apuntan los dedos |

Los puntos válidos son `wrist`, `thumb_{mcp,ip,tip}` y `{index,middle,ring,pinky}_{mcp,pip,tip}`. Una clave o un valor desconocidos hacen fallar la carga del catálogo, así no se ignoran en silencio.

## 4. Reconocimiento (`ho-signs.js`)

### 4.1 Canonicalización
Landmarks de imagen → isotrópicos (x y z × `aspect`) → trasladados a la muñeca → escalados por la longitud muñeca→MCP medio → **espejo en x para manos `"Left"`**. Así, una plantilla sirve para diestros y zurdos. **La orientación no se normaliza**, porque en las lenguas de señas es fonológicamente relevante.

### 4.2 Tres puntuadores

| Puntuador | Cuándo | Cómo |
|---|---|---|
| **Descriptor** (`scoreSpec`) | Señas estáticas con `handshape` | Cada restricción da una puntuación difusa entre 0 y 1; el total es su media geométrica con piso de 0.02. Devuelve los *checks* ordenados de peor a mejor, cada uno con un mensaje en español (p. ej. "Extiende el dedo medio"), que se muestra como **retroalimentación didáctica**. |
| **Plantillas estáticas** (kNN) | Si hay grabaciones | Vector de 60 dimensiones (20 puntos canónicos, puntas ×2); distancia RMS; similitud `exp(-(d/0.32)²)`. Si también hay descriptor: `0.7·plantilla + 0.3·descriptor`. Señas a dos manos: concatena ambas manos más el desplazamiento relativo entre muñecas. |
| **Plantillas dinámicas** (DTW) | Señas con movimiento | Por cuadro: forma de mano (peso 0.5) + trayectoria de la muñeca relativa al inicio de la ventana + desplazamiento de la segunda mano. Ambas secuencias se re-muestrean a 20 cuadros; DTW con banda de 5; se prueban ventanas de 0.75×, 1× y 1.3× la duración de la plantilla. Similitud `exp(-(d/0.45)²)`. |

### 4.3 Verificación (`verify(hands, signId)`)
Compara contra un conjunto de candidatos: la misma categoría y tipo, más las señas `confusable`. Acepta si la puntuación es ≥ 0.6 y la seña es la primera del ranking (o está a menos de 0.05 de la mejor). Si falla, devuelve hasta 2 mensajes de corrección, o "Se parece a «X»". Una seña de una mano se evalúa sobre cada mano visible, para que una segunda mano en reposo no bloquee el reconocimiento.

Todas las constantes están en `HO.Signs.CFG`.

## 5. Plantillas de referencia

- Se graban en el **Estudio de Señas** (`/signstudio`): estáticas = 12 muestras en ~1,5 s; dinámicas = 1,2–4 s de secuencia.
- `POST /api/signs/<lang>/templates` guarda **landmarks crudos** (imagen + world + aspect), no features. Así el extractor puede evolucionar sin migrar datos y el dataset sirve para entrenar un modelo propio (REQ-010).
- Exportar/Importar JSON (`handsonedu.sign-templates/v1`) permite compartir datasets entre instituciones.
- La escritura se protege con `ADMIN_TOKEN` (cabecera `X-Admin-Token`) si está definido. Es una medida provisional hasta que lleguen los roles LTI/autenticación.

## 6. Validación con fotos reales

Las convenciones geométricas se calibraron con las fotos de muestra oficiales de MediaPipe (`thumbs_up`, `victory`, `pointing_up`, `thumbs_down`, `woman_hands`), procesadas con el modelo real y espejadas como en la app. Los landmarks están en `tests/fixtures/real_hands.json` y se usan como tests de regresión en `tests/js/ho-signs.test.cjs`.

Hallazgos que fijaron el diseño:

| Hallazgo | Consecuencia |
|---|---|
| Con imagen espejada, la mano derecha real se etiqueta `"Left"` | Canonicalización por etiqueta y no por mano anatómica; documentado |
| La normal `(pinky−wrist)×(index−wrist)` apuntaba hacia atrás | Se usa `(index−wrist)×(pinky−wrist)`: palma hacia la cámara ⇒ z < 0 (verificado) |
| En `world_landmarks`, los dedos extendidos aparecen doblados entre 55° y 95° | La geometría usa landmarks de imagen con corrección de aspecto |
| En vista frontal, el ángulo de la base del dedo se reduce por el escorzo (puño: 28–38°) | Estado del dedo = flexión total **y** "alcance" (punta→muñeca / MCP→muñeca: extendido ≥ 1,66; puño ≤ 0,92) |
| La distancia del pulgar no separaba "extendido" de "sobre los dedos" | Posición lateral del pulgar en el eje índice→meñique (pulgar arriba −0,80; sobre los dedos +0,85) |

Resultado actual con fotos reales: *victory* → V/2 con 1,00; *pointing_up* → 1 con 1,00, y al pedirle "V" responde "Extiende el dedo medio". La prueba de extremo a extremo en Chromium (cámara falsa con la foto) reconoce la seña en la interfaz del Estudio.

## 7. Limitaciones conocidas y siguientes pasos

1. **Contenido sin validar.** Las descripciones LSEC están marcadas `validated: false`. Hay que revisarlas con intérpretes y la comunidad sorda (p. ej. FENASEC; referencia: *Diccionario Oficial LSEC «Gabriel Román»*, CONADIS 2014). 30 de las 50 señas solo se reconocen con plantillas grabadas.
2. **Sin ubicación corporal.** Muchas señas léxicas se distinguen por el lugar donde se articulan (mentón, pecho) y por rasgos no manuales. El motor solo ve manos. Siguiente paso: MediaPipe Pose/Face (Holistic) para obtener la ubicación relativa al cuerpo.
3. **Umbral de detección 0.7** (heredado de REQ-013, contra falsos positivos con la cara). Con fotos desenfocadas la mano no se detecta con 0.7 y sí con 0.3. Conviene evaluarlo con cámaras de aula reales.
4. **Calibración con pocos datos.** Los umbrales salen de 6 manos reales. Con las plantillas que graben los docentes se puede medir la precisión por seña y entrenar un clasificador (REQ-010).
