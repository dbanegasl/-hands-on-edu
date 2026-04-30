# REQ-001 — Suite de Tests Unitarios e Integración

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-001 |
| **Tipo** | Tech-Debt |
| **Prioridad** | Alta |
| **Estado** | 📋 Pendiente |
| **Módulo** | Global / Backend |
| **Esfuerzo estimado** | M (2–4 horas) |

---

## Problema

El directorio `tests/` existe en el repositorio pero está **completamente vacío**. Sin cobertura de tests es imposible:

- Refactorizar `hand_tracker.py` o cualquier otra clase central con confianza.
- Implementar CI/CD (REQ-011) con garantías reales de calidad.
- Detectar regresiones al agregar nuevos gestos o endpoints.
- Incorporar colaboradores externos al proyecto sin riesgo.

La ausencia de tests es la deuda técnica de mayor impacto inmediato del proyecto (ver también TD-001 en `docs/technical-debt/TECHNICAL-DEBT.md`).

---

## Alcance propuesto

### 1. Tests unitarios de `hand_tracker.py`

Archivo: `tests/test_hand_tracker.py`

- **Mock de MediaPipe:** Reemplazar `mp.solutions.hands` con un mock que devuelva landmarks sintéticos reproducibles.
- `detect_gesture()`:
  - Verificar que retorna los 7+ valores correctos para cada gesto conocido (`fist`, `open_hand`, `pointing`, `peace`, `thumbs_up`, `ok`, `none`).
  - Probar con landmarks de mano izquierda y derecha.
  - Verificar que retorna `"none"` cuando no hay landmarks.
- `count_raised_fingers()`:
  - Caso 0 dedos levantados (puño cerrado).
  - Caso 5 dedos levantados (mano abierta).
  - Casos intermedios (1, 2, 3, 4 dedos).
- `get_finger_tip()`:
  - Verificar que escala coordenadas de landmarks normalizados (0.0–1.0) a píxeles de frame correctamente.
  - Verificar manejo de índice de dedo fuera de rango.

### 2. Tests de integración de FastAPI

Archivo: `tests/test_main.py`

- **Endpoint `/health`:**
  - `GET /health` retorna `200 OK` con body `{"status": "ok"}`.
- **WebSocket `/ws/analyze`:**
  - Conectar con `httpx.AsyncClient` + `pytest-asyncio`.
  - Enviar frame JPEG sintético (imagen negra 640×480 generada con `numpy`/`Pillow`).
  - Verificar que la respuesta es JSON válido con las claves esperadas (`gesture`, `fingers`, `landmarks`).
  - Verificar comportamiento con mensaje vacío o binario inválido.

### 3. Fixtures compartidas

Archivo: `tests/conftest.py`

- Fixture `app_client` → instancia de `AsyncClient` con la app FastAPI.
- Fixture `fake_landmarks` → lista de 21 `NormalizedLandmark` mockeados.
- Fixture `black_frame_bytes` → frame JPEG 640×480 negro en bytes (para tests de WS).

---

## Stack sugerido

```
pytest
pytest-asyncio
httpx[asyncio]
unittest.mock  (stdlib)
numpy          (ya en dependencias del proyecto)
Pillow         (si no está, agregar a requirements-dev.txt)
pytest-cov
```

Agregar a `requirements-dev.txt` (crear si no existe):

```
pytest>=8.0
pytest-asyncio>=0.23
httpx>=0.27
pytest-cov>=5.0
Pillow>=10.0
```

---

## Archivos a crear

```
tests/
├── conftest.py
├── test_hand_tracker.py
└── test_main.py
```

---

## Criterio de aceptación

```bash
pytest --cov=app --cov-report=term-missing
```

- ✅ Todos los tests pasan sin errores ni warnings críticos.
- ✅ Cobertura reportada: **≥ 80%** en `app/core/` y `app/main.py`.
- ✅ Tests corren en aislamiento (sin cámara, sin MediaPipe real, sin red).
- ✅ Tiempo de ejecución total < 30 segundos.

---

## Notas de implementación

- Usar `@pytest.mark.asyncio` para todos los tests de WebSocket.
- El mock de MediaPipe debe parchear `mediapipe.solutions.hands.Hands` antes de importar `HandTracker`.
- Para los landmarks sintéticos, definir posiciones de píxeles que correspondan claramente a un gesto conocido (e.g., todos los dedos extendidos para `open_hand`).

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-011 (CI/CD) | Este REQ es prerrequisito de REQ-011 |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
