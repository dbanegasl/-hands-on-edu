# REQ-010 — Clasificador entrenado con las plantillas de señas

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-010 |
| **Tipo** | Feature |
| **Prioridad** | Media |
| **Estado** | ✅ Hecho (v0.14.0) — reformulado: clasificador de señas estáticas de una mano, entrenado y ejecutado en el navegador con las plantillas del Estudio |
| **Módulo** | Motor de señas / Estudio de Señas / Aula |
| **Esfuerzo estimado** | XL (15–25 horas + recolección de datos de entrenamiento) |

---

## Implementación (v0.14.0)

La propuesta original (más abajo, como referencia histórica) apuntaba a los gestos genéricos de `hand_tracker.py` (puño, paz…), con scikit-learn en el servidor y una página `/collect`. Con la dirección de producto de 2026-11 (plataforma de enseñanza de **LSEC**, detección en el navegador) se reformuló:

| Original | Implementado | Por qué |
|---|---|---|
| Gestos genéricos (`fist`, `peace`…) | **Señas estáticas de una mano del catálogo** (33 de 50 en LSEC: alfabeto y números) | Es donde están los pares que se confunden (M/N, U/V/2, A/S/E) |
| Página `/collect` + tabla `gesture_samples` | Las **plantillas del Estudio de Señas** (ya guardan landmarks crudos, REQ-017) | Ya existían y los docentes ya graban ahí |
| scikit-learn en el servidor, `.pkl` | **Red neuronal pequeña en JS puro** (`ho-signs-model.js`), entrenada y ejecutada en el navegador | Un solo extractor de características para entrenar e inferir, sin dependencias nuevas en la imagen, el video nunca sale del equipo; el servidor solo guarda el JSON |
| Reemplaza las heurísticas con umbral 0,85 | **Se combina** con descriptores y kNN (mezcla geométrica) | Un clasificador no tiene clase «ninguna»: sin la parte geométrica aceptaría cualquier mano. Los descriptores siguen dando la retroalimentación didáctica |
| Meta fija «accuracy ≥ 95 %» | **Evaluación honesta antes de publicar** y publicación solo si mejora | Con pocas grabaciones la cifra depende de los datos; lo que importa es si mejora lo que ya hay |

### Modelo

- **Características (87):** 20 puntos canónicos (muñeca en el origen, escala de palma, espejo para la mano izquierda), flexión y alcance de cada dedo, posición lateral del pulgar, normal de la palma, dirección de los dedos y distancias entre las puntas. La orientación **no** se normaliza (es fonológica).
- **Red:** 87 → 24 ReLU → softmax por seña. Adam, entropía cruzada con suavizado de etiquetas 0,05, pesos balanceados por clase, L2. Aumento de datos: rotación en el plano ±10° y ruido en los puntos. Semilla fija (reproducible). ~3 000 parámetros; el JSON pesa ~20–60 KB.
- **Combinación:** `puntuación = motor^(1−w) · p^w` (`HO.Signs.blendModel`), donde *motor* es la puntuación actual (descriptor y/o kNN) y *p* la probabilidad del modelo. Si la mano está lejos de toda plantilla y descriptor, la puntuación sigue baja aunque la red esté segura. Solo afecta a las señas del modelo; las dinámicas (DTW) y las de dos manos no cambian.

### Evaluación (antes de publicar)

Validación cruzada **agrupada por grabación** (estratificada, hasta 5 particiones): cada grabación se prueba con un modelo que no la vio. Si se separaran cuadros sueltos, los 12 cuadros casi idénticos de una grabación estarían a ambos lados y la cifra saldría inflada. Para cada cuadro se compara el motor actual con el motor + modelo entrenado en las mismas particiones, con lo que vive el estudiante:

| Métrica | Qué mide |
|---|---|
| **Seña correcta aceptada** | `verify()` acepta la seña que se está haciendo, compitiendo con su conjunto real de candidatas (incluidas las señas solo con descriptor de la misma categoría) |
| **Seña equivocada aceptada** | `verify()` aceptaría *otra* seña del modelo con ese cuadro |
| **Acierto (1.ª opción)** | La seña correcta es la primera entre las del modelo |

Se prueban los pesos 0,35 / 0,5 / 0,65 / 0,8 y se elige el que maximiza *aceptadas − equivocadas aceptadas*. El modelo se **recomienda** solo si eso supera al motor actual sin perder acierto; si no, el Estudio no ofrece publicarlo. Las señas con una sola grabación quedan fuera y se listan. Limitación: si todas las grabaciones son de la misma persona, la cifra es optimista para otras personas (el informe lo avisa).

### Flujo

1. **Estudio de Señas → 🧠 Modelo entrenado → Entrenar y evaluar** (unos segundos; barra de progreso). Informe: las tres métricas con y sin modelo, tabla por seña (peor primero), confusiones más frecuentes y señas con una sola grabación.
2. **Publicar modelo** (token de administrador): queda activo; el Aula y el Estudio lo cargan al abrir. Se puede **desactivar** o volver a uno anterior (API).
3. El Estudio avisa cuando hay grabaciones nuevas o eliminadas desde el entrenamiento.
4. Sin navegador: `node scripts/train-sign-model.cjs [--out model.json] [--publish]` ejecuta el mismo código (`--templates dataset.json` evalúa un dataset exportado).

Manual operativo para el equipo de contenido (plan de grabación, cómo leer el informe, cuándo publicar): [onboarding 07](../onboarding/07-entrenamiento-modelo.md).

### API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/signs/{lang}/model` | Pesos del modelo activo; **204** si no hay ninguno (el motor funciona sin él) |
| `GET` | `/api/signs/{lang}/models` | Modelos publicados (sin pesos), con su informe |
| `POST` | `/api/signs/{lang}/models` | Publicar `{model, metrics, author, activate}` (admin). Valida formato, versión de características, tamaños, números finitos y que las clases sean señas estáticas de una mano del catálogo |
| `POST` | `/api/signs/{lang}/models/{id}/activate` | Activar uno anterior (admin) |
| `DELETE` | `/api/signs/{lang}/model` | Desactivar (admin) |
| `DELETE` | `/api/signs/{lang}/models/{id}` | Eliminar (admin) |

Tabla nueva `sign_models` (se crea sola al arrancar).

### Pruebas

`tests/js/ho-signs-model.test.cjs` (características invariantes, la red aprende y es reproducible, validación del JSON, validación cruzada que retiene grabaciones enteras, señas con pocas grabaciones, mezcla en el reconocedor sin aceptar una «mano» aleatoria) y `tests/test_sign_models.py` (publicar un modelo entrenado por el código JS —`tests/fixtures/sign_model_small.json`, regenerable con `node tests/fixtures/gen_sign_model.cjs`—, activar/desactivar, validaciones, token). E2E en Chromium: entrenar, informe, publicar, reconocimiento en vivo con el modelo (`template+spec+model`), el Aula lo carga, diálogo sin desbordamiento en móvil.

**Pendiente:** precisión con grabaciones reales de docentes y estudiantes (las pruebas usan grabaciones sintéticas a partir de fotos reales); señas dinámicas (hoy DTW) y de dos manos; varias personas por partición (validación por persona) cuando haya grabaciones de suficientes personas.

---

## Propuesta original (2026-04-30 — referencia histórica)

## Problema

La detección de gestos actual en `hand_tracker.py` utiliza **reglas heurísticas** basadas en ángulos y distancias entre landmarks:

```python
# Ejemplo de la heurística actual (simplificado)
def detect_gesture(landmarks):
    fingers_up = count_raised_fingers(landmarks)
    if fingers_up == 0:
        return "fist"
    elif fingers_up == 5:
        return "open_hand"
    # ... más reglas basadas en ángulos
```

**Limitaciones de este enfoque:**

1. **Fallos con ángulos no estándar:** Una mano inclinada 45° puede clasificarse incorrectamente porque las reglas asumen orientación frontal.
2. **Gestos similares se confunden:** `peace` vs `pointing`, `thumbs_up` vs `fist` parcial, etc.
3. **No extensible sin escribir código:** Añadir un nuevo gesto requiere analizar manualmente las geometrías y escribir nuevas reglas.
4. **Variabilidad entre usuarios:** Las reglas calibradas para manos adultas fallan con manos pequeñas (niños).
5. **Sin métricas de confianza:** Las reglas retornan un resultado binario sin probabilidad.

---

## Alcance propuesto

### Fase 1: Recolección de datos

**Página `/collect`** (solo accesible con PIN de docente):

- Interfaz para capturar landmarks en tiempo real mientras el usuario realiza gestos.
- El usuario selecciona la etiqueta del gesto de un dropdown.
- Al hacer click en "Capturar", se guardan los 21 landmarks (x, y, z) + etiqueta en SQLite.
- Indicador de cuántas muestras hay por gesto (objetivo: ≥ 200 muestras por clase).
- Visualización de los landmarks en 2D en tiempo real.

**Estructura del dataset:**

```sql
CREATE TABLE gesture_samples (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,      -- 'fist', 'open_hand', 'pointing', ...
    landmarks   TEXT NOT NULL,      -- JSON: [[x,y,z] x 21]
    hand_side   TEXT,               -- 'left' | 'right'
    collected_at TEXT NOT NULL,
    user_id     TEXT                -- para diversidad de muestras
);
```

### Fase 2: Entrenamiento

**Notebook:** `notebooks/train_gesture_classifier.ipynb`

```python
# Pipeline de entrenamiento sugerido
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import pickle

# Preprocesamiento: normalizar landmarks relativo a la muñeca (punto 0)
# para invariancia de posición y escala
def normalize_landmarks(landmarks):
    wrist = landmarks[0]
    normalized = [(lm[0] - wrist[0], lm[1] - wrist[1], lm[2] - wrist[2])
                  for lm in landmarks]
    # Normalizar por distancia máxima
    max_dist = max(abs(c) for lm in normalized for c in lm)
    return [[c / max_dist for c in lm] for lm in normalized]

# Gestos objetivo
GESTURES = ['fist', 'open_hand', 'pointing', 'peace', 'thumbs_up', 'ok', 'none']
```

**Clasificadores a evaluar:**
1. `sklearn.neural_network.MLPClassifier` (recomendado — ligero, exportable como .pkl)
2. TFLite (si MLPClassifier no alcanza el accuracy objetivo)

### Fase 3: Integración

```python
# app/ml/classifier.py
class GestureClassifier:
    def __init__(self, model_path: str):
        with open(model_path, 'rb') as f:
            self.model, self.scaler = pickle.load(f)

    def predict(self, landmarks) -> tuple[str, float]:
        """
        Retorna (gesto_predicho, confianza)
        confianza: 0.0 a 1.0
        """
        features = self._preprocess(landmarks)
        proba = self.model.predict_proba([features])[0]
        idx = proba.argmax()
        return self.model.classes_[idx], proba[idx]

    def _preprocess(self, landmarks) -> list[float]:
        normalized = normalize_landmarks(landmarks)
        flat = [c for lm in normalized for c in lm]
        return self.scaler.transform([flat])[0]
```

**Modificación de `HandTracker`:**

```python
# hand_tracker.py — agregar soporte para clasificador ML (con fallback a heurísticas)
class HandTracker:
    def __init__(self, use_ml_classifier: bool = False):
        self._classifier = None
        if use_ml_classifier:
            model_path = Path("/app/data/gesture_classifier.pkl")
            if model_path.exists():
                self._classifier = GestureClassifier(str(model_path))

    def detect_gesture(self, landmarks):
        if self._classifier:
            gesture, confidence = self._classifier.predict(landmarks)
            if confidence >= 0.85:  # umbral de confianza
                return gesture
        # fallback a heurísticas si sin modelo o baja confianza
        return self._detect_gesture_heuristic(landmarks)
```

---

## Archivos a crear

```
app/ml/
├── __init__.py
├── classifier.py      ← clase GestureClassifier
└── trainer.py         ← script de entrenamiento ejecutable (no solo notebook)

app/api/
└── collect.py         ← endpoint para recolección de datos: POST /api/collect/sample

app/templates/
└── collect.html       ← UI de recolección de datos

notebooks/
└── train_gesture_classifier.ipynb
```

### Comando de entrenamiento

```bash
python -m app.ml.trainer \
  --db /app/data/handsonedu.db \
  --output /app/data/gesture_classifier.pkl \
  --test-size 0.2 \
  --min-samples 100
```

---

## Criterio de aceptación

- ✅ Clasificador custom reemplaza las heurísticas en `HandTracker` (con fallback activado).
- ✅ **Accuracy ≥ 95%** en el test set para los 5+ gestos base.
- ✅ El notebook de entrenamiento ejecuta sin errores con un dataset de ≥ 200 muestras/gesto.
- ✅ El modelo exportado (`.pkl`) carga correctamente al iniciar la app.
- ✅ Con baja confianza (< 0.85), el sistema usa las heurísticas como fallback.
- ✅ La página `/collect` permite capturar y etiquetar muestras de forma intuitiva.

---

## Gestos base requeridos en el dataset

| Gesto | Label | Descripción |
|-------|-------|-------------|
| Puño cerrado | `fist` | Todos los dedos doblados |
| Mano abierta | `open_hand` | Todos los dedos extendidos |
| Señalando | `pointing` | Solo índice extendido |
| Paz/Victoria | `peace` | Índice y medio extendidos |
| Pulgar arriba | `thumbs_up` | Solo pulgar extendido hacia arriba |
| OK | `ok` | Pulgar e índice formando círculo |
| Sin gesto | `none` | Sin mano visible o posición ambigua |

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-005 (SQLite) | **Bloqueante** — los samples se guardan en SQLite |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
