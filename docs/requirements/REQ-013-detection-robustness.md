# REQ-013 — Robustez de detección (backend)

> **Última actualización:** 2026-06-10
> **Estado:** ✅ Hecho

| Campo | Valor |
|-------|-------|
| **ID** | REQ-013 |
| **Tipo** | Mejora / Tech-Debt |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho |
| **Módulo** | Global / Backend (`app/core/hand_tracker.py`, `app/main.py`) |
| **Esfuerzo estimado** | M (4–6 horas) |

---

## Problema

La detección de gestos fallaba de forma visible en uso real (evidencia en capturas de pantalla):

1. **Gestos mal clasificados al rotar la mano.** `count_raised_fingers` y `detect_gesture` decidían si un dedo estaba extendido comparando `tip.y < pip.y` (eje vertical de imagen) y el pulgar con `|tip.x − mcp.x| > 0.08` (eje horizontal). Ambos dependen de la orientación: un pulgar arriba inclinado se leía como "✌️ 2 dedos".
2. **Falsos positivos de mano.** `HandLandmarkerOptions` solo fijaba `num_hands`; con los umbrales de confianza por defecto (0.5) una cara o un antebrazo en cuadro se detectaban como "mano" y disparaban las teclas de AirPiano.
3. **Parpadeo gesto-a-gesto.** Sin suavizado temporal, un único frame ruidoso cambiaba el gesto reportado, causando "En pausa" intermitente mientras el usuario señalaba en VirtualPainter.
4. **Estado de tracking compartido.** Una única instancia global de `HandTracker` en modo VIDEO recibía timestamps intercalados de conexiones concurrentes, corrompiendo el tracking entre clientes.

Además, deuda técnica acumulada: `/health` devolvía una versión hardcodeada (`0.1.0`) desfasada de la app; logging por excepción silenciosa (TD-009); sin healthcheck en Docker (TD-010); sin protección de tasa en el WebSocket (TD-008).

---

## Solución implementada

### Heurística invariante a la orientación (`app/core/hand_tracker.py`)

- **`finger_states(landmarks)`** decide cada dedo por **razón de distancias**: extendido si `dist2d(tip, wrist) > 1.15 × dist2d(pip, wrist)`. Compara distancias a un ancla común (la muñeca), por lo que es invariante a rotación. Margen amplio (índice recto ≈ 1.48, doblado ≈ 0.69).
- **Pulgar** anclado al `PINKY_MCP`: extendido si `dist2d(THUMB_TIP, PINKY_MCP) > 1.10 × dist2d(THUMB_IP, PINKY_MCP)`. Anatómicamente fijo → sin ramas por lateralidad ni dependencia de frames espejados.
- **Vocabulario ampliado** para señas distinguibles: nuevos gestos `i_love_you` (pulgar + índice + meñique) y `ok` (pinza pulgar-índice con medio/anular/meñique extendidos). `open_hand` ahora exige los 5 dedos; con 4 dedos y pulgar recogido se reporta `4_fingers` (antes inalcanzable).

### Umbrales de confianza
`min_hand_detection_confidence=0.7`, `min_hand_presence_confidence=0.6`, `min_tracking_confidence=0.6`. El 0.7 de detección elimina los falsos positivos de cara/antebrazo.

### Tracker por conexión + suavizado (`app/main.py`)
- Se elimina la instancia global; cada conexión WebSocket crea su `HandTracker` (cerrado en `finally`) con timestamps monótonos propios.
- **`GestureSmoother`** por conexión: voto por mayoría (ventana 5, ≥3 votos) para el gesto y mediana para el conteo de dedos, por mano. Absorbe frames ruidosos sin retraso de arranque (emite la pluralidad actual hasta que un gesto se asienta).

### Respuesta WebSocket (aditiva, retrocompatible)
Cada mano añade `confidence` (score de lateralidad), `fingers_up` (dict de booleanos por dedo) y `gesture_raw` (gesto sin suavizar). El campo existente `gesture` pasa a ser el **suavizado** — los módulos frontend se benefician sin cambios.

### Housekeeping
- Constante `APP_VERSION = "0.6.0"` usada en `FastAPI(version=...)` y `/health` (TD resuelto: versión coherente).
- `logging` estructurado (logger `handsonedu`): conexión/desconexión y excepciones del WS (**TD-009**).
- Healthcheck en `docker-compose.yml` vía Python sobre `http://localhost:8000/health` (**TD-010**).
- Guardia de tasa en el WS: si llega un frame < 25 ms tras el anterior se reenvía el último resultado en vez de recomputar (**TD-008**).

---

## Criterios de aceptación

- ✅ Todos los gestos se reconocen correctamente a 0°, 45°, 90°, 180° y 270° (suite parametrizada por rotación en `tests/test_hand_tracker.py`).
- ✅ Una cara/antebrazo en cuadro reporta 0 manos.
- ✅ La respuesta WebSocket incluye `confidence`, `fingers_up`, `gesture_raw`.
- ✅ Dos conexiones concurrentes operan de forma independiente.
- ✅ `/health` reporta la versión real de la app.
- ✅ Suite de tests verde (111 tests; cobertura ≥ 90 % en `core` y `main`).

---

## Verificación

```bash
docker compose exec hands-on-edu pip install -r requirements-dev.txt
docker compose exec hands-on-edu pytest --cov=app --cov-report=term-missing
```

Manual: `/testing` (Testing Lab) — pulgar arriba inclinado 90°, paz de lado, puño hacia abajo, solo cara en cuadro (debe mostrar 0 manos), revisando el panel JSON con los nuevos campos.
