/**
 * VirtualPainter — AR Gesture Drawing Module
 * HandsOnEdu | FastAPI WebSocket on ws://localhost:9876/ws/analyze
 *
 * Architecture:
 *   vp-cam-canvas  — mirrored video frame + hand skeleton overlay (z-index 1)
 *   vp-draw-canvas — transparent persistent drawing layer (z-index 2)
 *   vp-ui-overlay  — toolbar + mode badge + cursor dot (z-index 3+)
 *
 * Mirror note: video is drawn mirrored (ctx.scale(-1,1)). Backend receives the
 * mirrored frame, so landmarks are already in mirrored space.
 * Use px = lm.x * w  (NOT 1 - lm.x).
 */

// ── Constants ────────────────────────────────────────────────────────────────

// A candidate mode must persist this long before it takes effect — absorbs
// gesture flicker so the pen doesn't drop to "En pausa" mid-stroke. Brief hand
// dropouts (a missed frame or two) stay under this window, so strokes survive.
const MODE_DEBOUNCE_MS = 150;
const MIN_CONFIDENCE   = 0.7; // ignore low-confidence hands (stray marks)

const COLORS = [
  { name: 'Rojo',     hex: '#ef4444' },
  { name: 'Naranja',  hex: '#f97316' },
  { name: 'Amarillo', hex: '#facc15' },
  { name: 'Verde',    hex: '#22c55e' },
  { name: 'Azul',     hex: '#3b82f6' },
  { name: 'Violeta',  hex: '#a855f7' },
  { name: 'Rosa',     hex: '#ec4899' },
  { name: 'Blanco',   hex: '#ffffff' },
  { name: 'Negro',    hex: '#1e293b' },
];

// Gesture → mode mapping
const DRAW_GESTURES   = new Set(['pointing', '1_fingers']);
const ERASE_GESTURES  = new Set(['peace', '2_fingers']);
const SELECT_GESTURES = new Set(['open_hand', '5_fingers']);

// ── State ────────────────────────────────────────────────────────────────────

// Drawing state
let currentColor = '#ef4444';
let brushSize    = 6;
let isEraserMode = false;
let bgMode       = 'ar'; // 'ar' | 'whiteboard'

// Gesture/mode state
let drawMode    = 'pause'; // 'draw' | 'erase' | 'pause' | 'select'
let pendingMode = null;    // candidate mode awaiting debounce
let pendingSince = 0;
let prevPoint   = null;    // {x, y} last raw point (quadratic control point)
let prevMid     = null;    // {x, y} last midpoint (quadratic start)
let euroX = null, euroY = null; // One-Euro filters for the index tip
let lastMsgTime = 0;

// Color dwell selection state
let dwellColor = null;
let dwellStart = null;
const DWELL_TIME = 1000; // ms

// Webcam / WebSocket
let video, camCanvas, drawCanvas, camCtx, drawCtx;
let socket, animFrame, stream;
let started    = false;

// Undo / redo history
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 30;

// Palm-gesture undo state
let palmUndoStart  = null;
const PALM_UNDO_HOLD = 2000; // ms

// ── DOM helpers ───────────────────────────────────────────────────────────────

function buildColorSwatches() {
  const container = document.getElementById('vp-colors');
  COLORS.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className    = 'vp-color-btn' + (i === 0 ? ' active' : '');
    btn.title        = c.name;
    btn.dataset.color = c.hex;
    btn.dataset.name  = c.name;
    btn.style.background = c.hex;
    // Dark outline for light colors so they're visible on dark toolbar
    if (c.hex === '#ffffff' || c.hex === '#facc15') {
      btn.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.25)';
    }
    btn.addEventListener('click', () => setColor(c.hex));
    container.appendChild(btn);
  });
}

function setColor(hex) {
  currentColor = hex;
  document.querySelectorAll('.vp-color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === hex);
  });
  // Deactivate manual eraser when selecting a color
  if (isEraserMode) setEraserMode(false);
}

function setBrushSize(size) {
  brushSize = size;
  if (drawCtx) {
    drawCtx.lineWidth = size;
  }
}

function setEraserMode(on) {
  isEraserMode = on;
  document.getElementById('vp-btn-eraser').classList.toggle('active', on);
}

function setBgMode(mode) {
  bgMode = mode;
  if (mode === 'whiteboard') {
    camCanvas.style.visibility = 'hidden';
    drawCanvas.style.background = '#ffffff';
  } else {
    camCanvas.style.visibility = 'visible';
    drawCanvas.style.background = 'transparent';
  }
  document.getElementById('vp-btn-bg').classList.toggle('active', mode === 'whiteboard');
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  document.getElementById('vp-guide').style.display = 'none';
  started = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
    });
  } catch (err) {
    throw new Error('No se pudo acceder a la cámara: ' + err.message);
  }

  video = document.getElementById('vp-video');
  video.srcObject = stream;

  await new Promise(resolve => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
  });

  video.play();

  // Size canvases to native video resolution
  camCanvas  = document.getElementById('vp-cam-canvas');
  drawCanvas = document.getElementById('vp-draw-canvas');
  const w    = video.videoWidth  || 1280;
  const h    = video.videoHeight || 720;
  camCanvas.width  = drawCanvas.width  = w;
  camCanvas.height = drawCanvas.height = h;

  camCtx  = camCanvas.getContext('2d');
  drawCtx = drawCanvas.getContext('2d');
  drawCtx.lineCap   = 'round';
  drawCtx.lineJoin  = 'round';
  drawCtx.lineWidth = brushSize;

  euroX = new HO.OneEuro();
  euroY = new HO.OneEuro();

  // Initialize undo history with blank canvas state
  undoStack = [];
  redoStack = [];
  undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  updateUndoRedoButtons();

  connectWS();
  renderLoop();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  socket = new HO.HandSocket({
    onResult: handleWSMessage,
    onStatus: updateConnBadge,
  });
  socket.connect();
}

// ── Render loop ───────────────────────────────────────────────────────────────

function renderLoop() {
  animFrame = requestAnimationFrame(renderLoop);

  if (!video || video.readyState < 2) return;

  // Draw mirrored video to cam canvas
  HO.drawMirroredVideo(camCtx, video, camCanvas.width, camCanvas.height);

  // Send frame to backend when not waiting for a response
  if (socket) socket.sendFrame(camCanvas, 0.6);
}

// ── WebSocket message handler ─────────────────────────────────────────────────

function handleWSMessage(data) {
  // Drop low-confidence hands so a face/forearm can't leave stray marks.
  const hands = (data.hands || []).filter(
    (h) => typeof h.confidence !== 'number' || h.confidence >= MIN_CONFIDENCE
  );
  const hand = hands[0];
  const lms  = hand && hand.landmarks;
  const hasHand = !!(lms && lms.length >= 21);

  // Candidate mode: pause when no usable hand, else derived from the gesture.
  let candidate;
  if      (!hasHand)                       candidate = 'pause';
  else if (isEraserMode)                   candidate = 'erase';
  else if (DRAW_GESTURES.has(hand.gesture))   candidate = 'draw';
  else if (ERASE_GESTURES.has(hand.gesture))  candidate = 'erase';
  else if (SELECT_GESTURES.has(hand.gesture)) candidate = 'select';
  else                                     candidate = 'pause';

  resolveMode(candidate);
  updateModeBadge();

  if (!hasHand) {
    // Keep the committed mode through brief dropouts; only hide cursor / palm
    // ring once we've actually settled into pause.
    if (drawMode === 'pause' || drawMode === 'select') {
      palmUndoStart = null;
      hidePalmUndoRing();
      moveCursor(-9999, -9999);
    }
    return;
  }

  const w = camCanvas.width;
  const h = camCanvas.height;

  // Draw skeleton on cam canvas after video frame
  HO.drawSkeleton(camCtx, lms, w, h, {
    lineColor: 'rgba(0, 220, 255, 0.65)', lineWidth: 1.5,
    tipColor: '#00d4ff', tipRadius: 5,
    dotColor: 'rgba(255,255,255,0.8)', dotRadius: 3,
  });

  // Index tip = landmark 8. Landmarks are already in mirrored space.
  const now = performance.now() / 1000;
  const dt  = lastMsgTime ? now - lastMsgTime : 1 / 30;
  lastMsgTime = now;
  const x = euroX.filter(lms[8].x * w, dt);
  const y = euroY.filter(lms[8].y * h, dt);

  // Position cursor div at index tip
  moveCursor(x, y);

  // Execute mode action on draw canvas
  if (drawMode === 'draw') {
    performDraw(x, y);
  } else if (drawMode === 'erase') {
    performErase(x, y);
    prevPoint = null;
  } else if (drawMode === 'select') {
    checkColorDwell(x, y);
    // Palm-gesture undo: open hand held 2s without hovering a color swatch
    if (dwellColor === null) {
      if (!palmUndoStart) palmUndoStart = Date.now();
      const progress = (Date.now() - palmUndoStart) / PALM_UNDO_HOLD;
      showPalmUndoRing(progress);
      if (progress >= 1) {
        palmUndoStart = null;
        hidePalmUndoRing();
        undo();
      }
    } else {
      palmUndoStart = null;
      hidePalmUndoRing();
    }
  } else {
    prevPoint     = null;
    dwellColor    = null;
    dwellStart    = null;
    palmUndoStart = null;
    hidePalmUndoRing();
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

/**
 * Commit `candidate` as the active mode only once it has persisted for
 * MODE_DEBOUNCE_MS, so single-frame gesture flicker never switches the pen.
 */
function resolveMode(candidate) {
  if (candidate === drawMode) {
    pendingMode = null;
    return;
  }
  const now = Date.now();
  if (pendingMode !== candidate) {
    pendingMode = candidate;
    pendingSince = now;
    return;
  }
  if (now - pendingSince < MODE_DEBOUNCE_MS) return;

  // Commit the transition.
  const wasIdle   = drawMode === 'pause' || drawMode === 'select';
  const nowActive = candidate === 'draw' || candidate === 'erase';
  if (wasIdle && nowActive) {
    saveSnapshot();
    if (euroX) { euroX.reset(); euroY.reset(); } // fresh stroke, no stale lag
  }
  if (candidate === 'pause' || candidate === 'select') {
    prevPoint = null;
    prevMid = null;
  }
  drawMode = candidate;
  pendingMode = null;
}

function performDraw(x, y) {
  drawCtx.globalCompositeOperation = 'source-over';
  drawCtx.strokeStyle = currentColor;
  drawCtx.lineWidth   = brushSize;
  drawCtx.lineCap     = 'round';
  drawCtx.lineJoin    = 'round';

  const pt = { x, y };
  if (!prevPoint) {
    // Stroke start — drop a dot so a single tap is visible.
    drawCtx.beginPath();
    drawCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    drawCtx.fillStyle = currentColor;
    drawCtx.fill();
    prevPoint = pt;
    prevMid = pt;
    return;
  }
  // Quadratic through the midpoint of the last two raw points: smooth curves
  // with no gaps even when frames arrive unevenly.
  const mid = { x: (prevPoint.x + x) / 2, y: (prevPoint.y + y) / 2 };
  drawCtx.beginPath();
  drawCtx.moveTo(prevMid.x, prevMid.y);
  drawCtx.quadraticCurveTo(prevPoint.x, prevPoint.y, mid.x, mid.y);
  drawCtx.stroke();
  prevPoint = pt;
  prevMid = mid;
}

function performErase(x, y) {
  drawCtx.globalCompositeOperation = 'destination-out';
  drawCtx.beginPath();
  drawCtx.arc(x, y, 30, 0, Math.PI * 2);
  drawCtx.fill();
  drawCtx.globalCompositeOperation = 'source-over';
}

function checkColorDwell(x, y) {
  const swatches   = document.querySelectorAll('.vp-color-btn');
  const canvasRect = camCanvas.getBoundingClientRect();
  const scaleX     = canvasRect.width  / camCanvas.width;
  const scaleY     = canvasRect.height / camCanvas.height;
  const screenX    = x * scaleX + canvasRect.left;
  const screenY    = y * scaleY + canvasRect.top;

  let hoveredColor = null;

  swatches.forEach(swatch => {
    const rect = swatch.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;
    const dist = Math.hypot(screenX - cx, screenY - cy);

    if (dist < 32) {
      hoveredColor = swatch.dataset.color;
      swatch.classList.add('vp-color-hover');
    } else {
      swatch.classList.remove('vp-color-hover');
    }
  });

  if (hoveredColor) {
    if (dwellColor === hoveredColor) {
      // Same color — check if dwell threshold reached
      if (Date.now() - dwellStart >= DWELL_TIME) {
        setColor(hoveredColor);
        drawMode   = 'draw'; // auto-return to draw
        prevPoint  = null;
        dwellColor = null;
        dwellStart = null;
        swatches.forEach(s => s.classList.remove('vp-color-hover'));
      }
    } else {
      // New color hovered — start dwell timer
      dwellColor = hoveredColor;
      dwellStart = Date.now();
    }
  } else {
    dwellColor = null;
    dwellStart = null;
  }
}

// ── Cursor ────────────────────────────────────────────────────────────────────

function moveCursor(x, y) {
  const cursor     = document.getElementById('vp-cursor');
  const canvasRect = camCanvas.getBoundingClientRect();
  const scaleX     = canvasRect.width  / camCanvas.width;
  const scaleY     = canvasRect.height / camCanvas.height;
  const screenX    = x * scaleX + canvasRect.left;
  const screenY    = y * scaleY + canvasRect.top;

  cursor.style.left = screenX + 'px';
  cursor.style.top  = screenY + 'px';

  // Reset classes then apply mode-specific style
  cursor.className = '';

  if (drawMode === 'draw') {
    const size = Math.max(12, brushSize * 2 + 8);
    cursor.style.width      = size + 'px';
    cursor.style.height     = size + 'px';
    cursor.style.background = currentColor;
    cursor.style.border     = '2px solid rgba(255,255,255,0.8)';
    cursor.style.boxShadow  = '0 0 6px rgba(0,0,0,0.5)';
    cursor.classList.add('vp-cursor-draw');
  } else if (drawMode === 'erase') {
    cursor.style.width      = '64px';
    cursor.style.height     = '64px';
    cursor.style.background = 'rgba(255,255,255,0.15)';
    cursor.style.border     = '2px solid rgba(255,255,255,0.7)';
    cursor.style.boxShadow  = '0 0 12px rgba(255,255,255,0.2)';
    cursor.classList.add('vp-cursor-erase');
  } else if (drawMode === 'select') {
    cursor.style.width      = '20px';
    cursor.style.height     = '20px';
    cursor.style.background = currentColor;
    cursor.style.border     = '3px solid #6366f1';
    cursor.style.boxShadow  = 'none';
    cursor.classList.add('vp-cursor-select');
  } else {
    // Pause / default — small neutral dot
    cursor.style.width      = '12px';
    cursor.style.height     = '12px';
    cursor.style.background = 'rgba(148, 163, 184, 0.7)';
    cursor.style.border     = 'none';
    cursor.style.boxShadow  = 'none';
  }
}

// ── Badge / Status ────────────────────────────────────────────────────────────

function updateModeBadge() {
  const badge = document.getElementById('vp-mode-badge');
  const modes = {
    draw:   ['✏️ Dibujando',        'vp-badge-draw'],
    erase:  ['🧹 Borrando',         'vp-badge-erase'],
    pause:  ['✋ En pausa',          'vp-badge-pause'],
    select: ['🎨 Seleccionar color', 'vp-badge-select'],
  };
  const [text, cls] = modes[drawMode] || modes.pause;
  badge.textContent = text;
  badge.className   = 'vp-mode-badge ' + cls;
}

function updateConnBadge(state) {
  const el  = document.getElementById('vp-connection');
  const map = {
    disconnected: ['⚫ Desconectado', 'vp-conn-disconnected'],
    connecting:   ['🟡 Conectando…',  'vp-conn-connecting'],
    connected:    ['🟢 Conectado',    'vp-conn-connected'],
  };
  const [text, cls] = map[state] || map.disconnected;
  el.textContent = text;
  el.className   = 'vp-conn-badge ' + cls;
}

// ── Clear & Save ──────────────────────────────────────────────────────────────

function clearCanvas() {
  saveSnapshot();
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if (bgMode === 'whiteboard') {
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  }
}

// ── Undo / Redo ───────────────────────────────────────────────────────────────

function saveSnapshot() {
  if (!drawCtx) return;
  const snapshot = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  if (!drawCtx || undoStack.length === 0) return;
  const current = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  redoStack.push(current);
  const prev = undoStack.pop();
  drawCtx.putImageData(prev, 0, 0);
  updateUndoRedoButtons();
}

function redo() {
  if (!drawCtx || redoStack.length === 0) return;
  const current = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  undoStack.push(current);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  const next = redoStack.pop();
  drawCtx.putImageData(next, 0, 0);
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function showPalmUndoRing(progress) {
  const ring = document.getElementById('vp-palm-ring');
  if (!ring) return;
  ring.classList.remove('hidden');
  const circumference = 2 * Math.PI * 18;
  const offset = circumference * (1 - Math.min(progress, 1));
  const circle = document.getElementById('vp-palm-progress');
  if (circle) circle.style.strokeDashoffset = offset;
}

function hidePalmUndoRing() {
  const ring = document.getElementById('vp-palm-ring');
  if (ring) ring.classList.add('hidden');
}

function saveImage() {
  const merged = document.createElement('canvas');
  merged.width  = drawCanvas.width;
  merged.height = drawCanvas.height;
  const mCtx = merged.getContext('2d');

  if (bgMode === 'ar') {
    mCtx.drawImage(camCanvas, 0, 0); // current video frame
  } else {
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(0, 0, merged.width, merged.height);
  }
  mCtx.drawImage(drawCanvas, 0, 0); // drawing layer on top

  const link    = document.createElement('a');
  link.download = 'virtualpainter-' + Date.now() + '.png';
  link.href     = merged.toDataURL('image/png');
  link.click();
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(animFrame);
  if (socket) socket.close();
  if (stream) stream.getTracks().forEach(t => t.stop());
});

// ── DOMContentLoaded wiring ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildColorSwatches();

  // Undo / Redo buttons
  document.getElementById('btn-undo').addEventListener('click', () => {
    if (!started) return;
    undo();
  });
  document.getElementById('btn-redo').addEventListener('click', () => {
    if (!started) return;
    redo();
  });

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  document.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
  });

  // Brush size buttons
  document.querySelectorAll('.vp-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vp-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setBrushSize(parseInt(btn.dataset.size, 10));
      // Selecting a size deactivates manual eraser mode
      setEraserMode(false);
    });
  });

  // Eraser toggle
  document.getElementById('vp-btn-eraser').addEventListener('click', () => {
    setEraserMode(!isEraserMode);
  });

  // Background toggle
  document.getElementById('vp-btn-bg').addEventListener('click', () => {
    if (!started) return;
    setBgMode(bgMode === 'ar' ? 'whiteboard' : 'ar');
  });

  // Clear button → show modal
  document.getElementById('vp-btn-clear').addEventListener('click', () => {
    if (!started) return;
    document.getElementById('vp-clear-modal').classList.remove('hidden');
  });

  // Clear confirm
  document.getElementById('vp-btn-clear-confirm').addEventListener('click', () => {
    clearCanvas();
    document.getElementById('vp-clear-modal').classList.add('hidden');
  });

  // Clear cancel
  document.getElementById('vp-btn-clear-cancel').addEventListener('click', () => {
    document.getElementById('vp-clear-modal').classList.add('hidden');
  });

  // Save
  document.getElementById('vp-btn-save').addEventListener('click', () => {
    if (!started) return;
    saveImage();
  });

  // Start button (guide overlay)
  document.getElementById('vp-btn-start').addEventListener('click', () => {
    start().catch(err => {
      // Re-show guide with error if camera fails
      document.getElementById('vp-guide').style.display = 'flex';
      alert('❌ ' + err.message);
    });
  });

  // Help / guide toggle
  document.getElementById('vp-help-btn').addEventListener('click', () => {
    const guide = document.getElementById('vp-guide');
    guide.style.display = guide.style.display === 'none' ? 'flex' : 'none';
  });

  // Close modal on backdrop click
  document.getElementById('vp-clear-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('vp-clear-modal')) {
      document.getElementById('vp-clear-modal').classList.add('hidden');
    }
  });
});
