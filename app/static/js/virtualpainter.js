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

const WS_URL = 'ws://localhost:9876/ws/analyze';

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

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
let drawMode  = 'pause'; // 'draw' | 'erase' | 'pause' | 'select'
let prevPoint = null;    // {x, y} last drawn point
let smoothX   = 0;
let smoothY   = 0;
let smoothInit = false;

// Color dwell selection state
let dwellColor = null;
let dwellStart = null;
const DWELL_TIME = 1000; // ms

// Webcam / WebSocket
let video, camCanvas, drawCanvas, camCtx, drawCtx;
let ws, animFrame, stream;
let processing = false;
let started    = false;

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

  connectWS();
  renderLoop();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  updateConnBadge('connecting');
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => updateConnBadge('connected');

    ws.onclose = () => {
      updateConnBadge('disconnected');
      if (started) setTimeout(connectWS, 2000);
    };

    ws.onerror = () => updateConnBadge('disconnected');

    ws.onmessage = (evt) => {
      processing = false;
      try {
        handleWSMessage(JSON.parse(evt.data));
      } catch (_) {
        // Malformed JSON — ignore
      }
    };
  } catch (err) {
    updateConnBadge('disconnected');
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────

function renderLoop() {
  animFrame = requestAnimationFrame(renderLoop);

  if (!video || video.readyState < 2) return;

  const w = camCanvas.width;
  const h = camCanvas.height;

  // Draw mirrored video to cam canvas
  camCtx.save();
  camCtx.translate(w, 0);
  camCtx.scale(-1, 1);
  camCtx.drawImage(video, 0, 0, w, h);
  camCtx.restore();

  // Send frame to backend when not waiting for a response
  if (!processing && ws && ws.readyState === WebSocket.OPEN) {
    processing = true;
    const frameData = camCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    ws.send(JSON.stringify({ frame: frameData }));
  }
}

// ── WebSocket message handler ─────────────────────────────────────────────────

function handleWSMessage(data) {
  if (!data.hands || data.hands.length === 0) {
    drawMode   = 'pause';
    prevPoint  = null;
    smoothInit = false;
    updateModeBadge();
    moveCursor(-9999, -9999); // move off-screen to hide
    return;
  }

  const hand = data.hands[0];
  const lms  = hand.landmarks;

  if (!lms || lms.length < 21) return;

  const w = camCanvas.width;
  const h = camCanvas.height;

  // Draw skeleton on cam canvas after video frame
  drawSkeleton(camCtx, lms, w, h);

  // Index tip = landmark 8
  // Landmarks are already in mirrored space — use lm.x * w directly
  const rawX = lms[8].x * w;
  const rawY = lms[8].y * h;

  // Exponential moving average smoothing (reduces jitter)
  if (!smoothInit) {
    smoothX    = rawX;
    smoothY    = rawY;
    smoothInit = true;
  }
  smoothX = smoothX * 0.5 + rawX * 0.5;
  smoothY = smoothY * 0.5 + rawY * 0.5;

  const x = smoothX;
  const y = smoothY;

  // Determine drawing mode from gesture
  const gesture = hand.gesture;
  let newMode;
  if      (isEraserMode)                    newMode = 'erase';
  else if (DRAW_GESTURES.has(gesture))      newMode = 'draw';
  else if (ERASE_GESTURES.has(gesture))     newMode = 'erase';
  else if (SELECT_GESTURES.has(gesture))    newMode = 'select';
  else                                       newMode = 'pause';

  if (newMode !== drawMode) {
    // Lift pen when transitioning to non-drawing mode
    if (newMode === 'pause' || newMode === 'select') prevPoint = null;
    drawMode = newMode;
  }
  updateModeBadge();

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
  } else {
    prevPoint  = null;
    dwellColor = null;
    dwellStart = null;
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawSkeleton(ctx, lms, w, h) {
  // Connections — light cyan
  ctx.strokeStyle = 'rgba(0, 220, 255, 0.65)';
  ctx.lineWidth   = 1.5;
  ctx.lineCap     = 'round';
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(lms[a].x * w, lms[a].y * h);
    ctx.lineTo(lms[b].x * w, lms[b].y * h);
    ctx.stroke();
  }

  // Landmark dots — white base, cyan for fingertips
  const FINGERTIPS = [4, 8, 12, 16, 20];
  for (let i = 0; i < lms.length; i++) {
    const px = lms[i].x * w;
    const py = lms[i].y * h;
    ctx.beginPath();
    if (FINGERTIPS.includes(i)) {
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00d4ff';
    } else {
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
    }
    ctx.fill();
  }
}

function performDraw(x, y) {
  drawCtx.globalCompositeOperation = 'source-over';
  drawCtx.strokeStyle = currentColor;
  drawCtx.lineWidth   = brushSize;
  drawCtx.lineCap     = 'round';
  drawCtx.lineJoin    = 'round';

  if (prevPoint) {
    drawCtx.beginPath();
    drawCtx.moveTo(prevPoint.x, prevPoint.y);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
  }
  prevPoint = { x, y };
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
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if (bgMode === 'whiteboard') {
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  }
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
  if (ws)     ws.close();
  if (stream) stream.getTracks().forEach(t => t.stop());
});

// ── DOMContentLoaded wiring ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildColorSwatches();

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
