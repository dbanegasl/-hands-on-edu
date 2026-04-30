# AttendEye — Control de Asistencia y Participación

## Propósito

Herramienta para docentes que permite tomar asistencia de clase mediante gestos de mano y monitorear la participación de estudiantes en tiempo real. Genera un reporte de texto exportable.

## URL

`http://localhost:9876/attendeye`

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/static/attendeye.html` | 4 pantallas: setup, roll call, participación, resultados |
| `app/static/css/attendeye.css` | Tema navy/sky-blue profesional, layout 3 columnas |
| `app/static/js/attendeye.js` | Motor con 2 instancias WebSocket independientes |

---

## Pantallas

```
setup → [Lista de Asistencia] → rollcall → results
setup → [Participación]       → participation (sesión libre)
```

---

## Modo 1: Lista de Asistencia (Roll Call)

### Flujo

1. El docente ingresa la lista de estudiantes (uno por línea en un textarea).
2. El sistema llama a cada estudiante secuencialmente.
3. El estudiante levanta la mano (gesto de "mano levantada") y lo mantiene 2 s.
4. El sistema marca **PRESENTE** con timestamp.
5. El docente puede también hacer clic manual: ✅ Presente / ❌ Ausente / ⏭ Omitir.
6. Al terminar la lista: pantalla de resultados con estadísticas y reporte exportable.

### Gestos que cuentan como "mano levantada"

```js
const RAISE_GESTURES = new Set(['open_hand', 'thumbs_up', '5_fingers', '4_fingers']);
```

### Formato del Reporte

```
REPORTE DE ASISTENCIA
Clase: {nombre de clase}
Fecha: {DD/MM/YYYY}  Hora: {HH:MM:SS}
─────────────────────────────
PRESENTES (N):
  ✅ Ana García — 08:32:15
  ...
AUSENTES (N):
  ❌ Carlos López
  ...
─────────────────────────────
Asistencia: N/Total (XX%)
```

El botón "Exportar" crea un archivo `.txt` descargable con el contenido del reporte.

---

## Modo 2: Participación

- Modo libre de duración indefinida con timer de sesión visible.
- MediaPipe detecta manos levantadas en tiempo real y muestra un flash de alerta visual.
- El docente hace clic en el nombre del estudiante que participó para registrarlo (+1 al contador).
- Tablero con conteo numérico y barras relativas — la barra más larga corresponde al estudiante con más participaciones.
- Las barras se recalculan en tiempo real con cada registro.

---

## Instancias WebSocket

AttendEye usa **dos instancias WebSocket separadas** (una por modo), con sus propios elementos `<video>` y `<canvas>`:

- `ws` + `videoEl` + `canvasEl` — Roll Call
- `wsP` + `videoElP` + `canvasElP` — Participación

Esto evita conflictos al cambiar de modo. Ambas se cierran limpiamente (`ws.close()`, `cancelAnimationFrame()`) al salir de cada pantalla.

---

## Lista de Estudiantes por Defecto

Si el docente no modifica el textarea en la pantalla de setup, se usa una lista demo de 10 estudiantes ficticios:

```
Ana García, Carlos López, María Torres, Pedro Jiménez, Lucía Rodríguez,
José Martínez, Sofía Herrera, David Morales, Isabella Flores, Miguel Ángel Reyes
```

---

## Variables de Configuración (`attendeye.js`)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `WS_URL` | `ws://localhost:9876/ws/analyze` | Endpoint WebSocket |
| `HOLD_TIME` | 2000 ms | Hold para confirmar presencia gestual |
| `READING_DELAY` | 1500 ms | Warmup antes de activar detección por estudiante |
| `RAISE_ALERT_DURATION` | 1500 ms | Duración del flash de alerta de mano levantada (modo participación) |

---

## Known Limitations

- Diseñado para uso con una sola cámara compartida — no soporta multi-cámara ni identificación de rostro por nombre.
- El reporte es texto plano — no genera PDF ni CSV automáticamente (puede copiarse manualmente).
- No hay persistencia de sesiones — al recargar la página se pierde el historial.
- Modo participación no tiene autenticación: cualquier clic del docente registra participación (no auto-detección por nombre).
