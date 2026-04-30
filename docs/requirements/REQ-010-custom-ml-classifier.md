# REQ-010 — Clasificador ML de Gestos Personalizado

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-010 |
| **Tipo** | Feature |
| **Prioridad** | Baja |
| **Estado** | 📋 Pendiente |
| **Módulo** | Global / Backend |
| **Esfuerzo estimado** | XL (15–25 horas + recolección de datos de entrenamiento) |

---

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
