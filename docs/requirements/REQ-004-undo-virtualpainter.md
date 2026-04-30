# REQ-004 — Deshacer / Rehacer (Ctrl+Z / Ctrl+Y) en VirtualPainter

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-004 |
| **Tipo** | Mejora |
| **Prioridad** | Media |
| **Estado** | ✅ Hecho |
| **Módulo** | VirtualPainter |
| **Esfuerzo estimado** | S (2–3 horas) |

---

## Problema

VirtualPainter no ofrece ningún mecanismo de **deshacer trazos**. Cuando un usuario comete un error de dibujo tiene dos opciones:

1. Usar el eraser manualmente (lento e impreciso con gestos).
2. Borrar todo el lienzo y empezar desde cero.

Esto es especialmente frustrante para el **público objetivo del módulo: niños en edad escolar**, que necesitan corregir errores frecuentemente durante el aprendizaje. La ausencia de undo es una de las fricciones más reportadas en herramientas de dibujo educativas.

---

## Alcance propuesto

### Stack de historial (undo/redo)

```
Estructura de datos: dos stacks — undoStack[] y redoStack[]
Tipo de snapshot: ImageData (snapshot del canvas completo)
Límite de memoria: máx. 30 snapshots en undoStack (evitar memory leak)
Momento de captura: al levantar el dedo (fin de trazo), NO durante el trazo
```

**Diagrama de flujo del historial:**

```
[Inicio trazo] → [dibujando...] → [Fin trazo]
                                       ↓
                               capturar canvas.getImageData()
                                       ↓
                               undoStack.push(snapshot)
                               redoStack = []   ← limpiar redo al hacer nueva acción
                               
[Ctrl+Z / click Deshacer]
    undoStack.pop()  → restaurar snapshot anterior
    redoStack.push(snapshot actual)

[Ctrl+Y / click Rehacer]
    redoStack.pop()  → restaurar snapshot
    undoStack.push(snapshot actual)
```

### Límite de memoria

```javascript
const MAX_HISTORY = 30;

function saveSnapshot() {
  const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift(); // eliminar el más antiguo
  }
  redoStack = [];
  updateButtons();
}
```

### Atajos de teclado

| Acción | Atajos |
|--------|--------|
| Deshacer | `Ctrl+Z` |
| Rehacer | `Ctrl+Y` o `Ctrl+Shift+Z` |

### Botones en toolbar

- Botón **"↩ Deshacer"** y **"↪ Rehacer"** en la barra de herramientas existente.
- Los botones se **deshabilitan visualmente** (`disabled`, opacidad reducida) cuando el stack correspondiente está vacío.
- Los botones se habilitan/deshabilitan dinámicamente después de cada operación.

### Gesto alternativo (para tablets / touchscreen sin teclado)

- **Palma abierta sostenida 2 segundos** = ejecutar deshacer.
- Mostrar indicador visual de cuenta regresiva (círculo de progreso) mientras se detecta el gesto de espera.
- Esto permite usar undo sin teclado físico en tabletas educativas.

---

## Archivos a modificar

```
app/static/js/virtualpainter.js    ← lógica de historial, event listeners teclado, gesto palma
app/templates/virtualpainter.html  ← botones "Deshacer" y "Rehacer" en toolbar
app/static/css/virtualpainter.css  ← estilos para botones en estado :disabled
```

### Cambios en `virtualpainter.js`

```javascript
// Variables de estado a agregar
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 30;

// Nuevas funciones a implementar
function saveSnapshot() { ... }
function undo() { ... }
function redo() { ... }
function updateButtons() { ... }  // habilitar/deshabilitar botones

// Event listeners a agregar
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'z') undo();
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) redo();
});
```

### Cambios en `virtualpainter.html`

```html
<!-- Agregar en la barra de herramientas existente -->
<button id="btn-undo" disabled title="Deshacer (Ctrl+Z)">↩ Deshacer</button>
<button id="btn-redo" disabled title="Rehacer (Ctrl+Y)">↪ Rehacer</button>
```

### Cambios en `virtualpainter.css`

```css
#btn-undo:disabled,
#btn-redo:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}
```

---

## Criterio de aceptación

- ✅ `Ctrl+Z` deshace el último trazo completo (no el último píxel).
- ✅ `Ctrl+Y` rehace el trazo deshecho.
- ✅ Los botones "Deshacer" y "Rehacer" realizan la misma acción que los atajos.
- ✅ Los botones se **deshabilitan** cuando no hay operaciones disponibles.
- ✅ El historial tiene un máximo de **30 snapshots** (verificable con DevTools Memory).
- ✅ Al hacer una nueva acción de dibujo, el stack de redo se vacía.
- ✅ El gesto de **palma abierta 2s** ejecuta deshacer (con indicador visual).
- ✅ Deshacer hasta el estado inicial deja el canvas en blanco.

---

## Notas de implementación

> **Rendimiento:** `ImageData` de un canvas 640×480 ocupa ~1.2 MB (RGBA). Con 30 snapshots = ~36 MB de RAM. Esto es aceptable en navegadores modernos pero debe monitorearse si se aumenta la resolución del canvas. Evaluar comprimir con `canvas.toDataURL('image/webp', 0.8)` si el impacto de memoria es inaceptable (con pérdida de calidad mínima).

---

## Dependencias

Ninguna. No depende de otros REQs.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
