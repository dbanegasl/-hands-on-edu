/**
 * HandsOnEdu — Testing Lab
 * WebSocket + webcam integration for MediaPipe hand landmark visualization.
 * Backend: FastAPI on ws://localhost:9876/ws/analyze
 */

// ── Constants ────────────────────────────────────────────────────────────────

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [0, 9], [9, 10], [10, 11], [11, 12],     // middle
  [0, 13], [13, 14], [14, 15], [15, 16],   // ring
  [0, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [5, 9], [9, 13], [13, 17],               // palm cross
];

const FINGERTIPS = [4, 8, 12, 16, 20];

const MODE_INFO = {
  detection: {
    title: 'Detección',
    description: 'Detecta si hay manos presentes en la imagen y muestra su posición general y lateralidad (izquierda/derecha).',
  },
  landmarks: {
    title: 'Landmarks',
    description: 'Muestra los 21 puntos de referencia de cada mano con sus coordenadas X, Y, Z normalizadas en tiempo real.',
  },
  counter: {
    title: 'Contador de dedos',
    description: 'Cuenta cuántos dedos están levantados en la mano detectada. Ideal para evaluar interacciones gestuales simples.',
  },
  gestures: {
    title: 'Gestos',
    description: 'Reconoce gestos predefinidos: puño, mano abierta, apuntando, paz, pulgar arriba y shaka. Basado en el clasificador de MediaPipe.',
  },
  tracker: {
    title: 'Rastreador',
    description: 'Dibuja el camino del dedo índice en la pantalla. Perfecto para probar el módulo VirtualPainter.',
  },
  twohands: {
    title: 'Dos Manos',
    description: 'Detecta y analiza ambas manos simultáneamente. Muestra conteo de dedos y gesto para cada mano por separado.',
  },
};

// ── State ────────────────────────────────────────────────────────────────────

const STATE = {
  ws: null,
  stream: null,
  animFrame: null,
  mode: 'detection',
  processing: false,
  trail: [],
  frameCount: 0,
  lastFpsUpdate: Date.now(),
  fps: 0,
  connected: false,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────

let video, videoCanvas, overlayCanvas, videoCtx, overlayCtx;
let btnCamera, btnClear;
let statusDot, statusText, fpsDisplay, handsCount;
let resultsPanel, modeDescription, errorToast;
let videoPlaceholder;

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM
  video          = document.getElementById('video');
  videoCanvas    = document.getElementById('video-canvas');
  overlayCanvas  = document.getElementById('overlay-canvas');
  videoCtx       = videoCanvas.getContext('2d');
  overlayCtx     = overlayCanvas.getContext('2d');
  btnCamera      = document.getElementById('btn-camera');
  btnClear       = document.getElementById('btn-clear');
  statusDot      = document.getElementById('status-dot');
  statusText     = document.getElementById('status-text');
  fpsDisplay     = document.getElementById('fps-display');
  handsCount     = document.getElementById('hands-count');
  resultsPanel   = document.getElementById('results-panel');
  modeDescription = document.getElementById('mode-description');
  errorToast     = document.getElementById('error-toast');
  videoPlaceholder = document.getElementById('video-placeholder');

  // Mode tabs
  document.getElementById('mode-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.mode-tab');
    if (!tab) return;
    const newMode = tab.dataset.mode;
    if (newMode === STATE.mode) return;

    // Update active class
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    STATE.mode = newMode;
    STATE.trail = [];

    // Show/hide clear button
    btnClear.style.display = newMode === 'tracker' ? 'inline-flex' : 'none';

    // Update description
    modeDescription.textContent = MODE_INFO[newMode]?.description ?? '';

    // Clear overlay for clean start
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Reset results panel if camera is running
    if (!STATE.stream) {
      setResultsPlaceholder();
    }
  });

  // Camera button
  btnCamera.addEventListener('click', () => toggleCamera());

  // Clear trail
  btnClear.addEventListener('click', () => {
    STATE.trail = [];
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  });
});

// ── Camera control ────────────────────────────────────────────────────────────

function toggleCamera() {
  if (!STATE.stream) {
    startCamera();
  } else {
    stopCamera();
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    STATE.stream = stream;
    video.srcObject = stream;

    await new Promise((resolve) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    });

    // Set canvas dimensions
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    videoCanvas.width  = w;
    videoCanvas.height = h;
    overlayCanvas.width  = w;
    overlayCanvas.height = h;

    // Hide placeholder
    if (videoPlaceholder) videoPlaceholder.style.display = 'none';

    btnCamera.textContent = '⏹ Detener Cámara';

    connectWS();
    startLoop();
  } catch (err) {
    showError(`No se pudo acceder a la cámara: ${err.message}`);
  }
}

function stopCamera() {
  // Stop tracks
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(t => t.stop());
    STATE.stream = null;
  }

  // Close WebSocket
  if (STATE.ws) {
    STATE.ws.onclose = null; // prevent reconnect logic
    STATE.ws.close();
    STATE.ws = null;
  }

  // Cancel animation
  if (STATE.animFrame) {
    cancelAnimationFrame(STATE.animFrame);
    STATE.animFrame = null;
  }

  // Reset state
  STATE.processing = false;
  STATE.connected  = false;
  STATE.trail      = [];
  STATE.fps        = 0;
  STATE.frameCount = 0;

  // Clear canvases
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Show placeholder
  if (videoPlaceholder) videoPlaceholder.style.display = 'flex';

  // Reset UI
  btnCamera.textContent = '📷 Iniciar Cámara';
  fpsDisplay.textContent = '-- fps';
  handsCount.textContent = '0 manos';
  setStatusDisconnected();
  setResultsPlaceholder();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  try {
    const ws = new WebSocket('ws://localhost:9876/ws/analyze');

    ws.onopen = () => {
      STATE.connected = true;
      statusDot.classList.add('connected');
      statusText.textContent = '🟢 Conectado';
    };

    ws.onclose = () => {
      STATE.connected = false;
      setStatusDisconnected();
    };

    ws.onerror = () => {
      showError('Error de conexión WebSocket — ¿Está el servidor corriendo en el puerto 9876?');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleResult(data);
      } catch (_) {
        // Malformed JSON — ignore
      }
      STATE.processing = false;
    };

    STATE.ws = ws;
  } catch (err) {
    showError(`No se pudo crear WebSocket: ${err.message}`);
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────

function startLoop() {
  function loop() {
    STATE.animFrame = requestAnimationFrame(loop);

    if (!STATE.stream || video.readyState < 2) return;

    // Draw mirrored video to video-canvas
    videoCtx.save();
    videoCtx.translate(videoCanvas.width, 0);
    videoCtx.scale(-1, 1);
    videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
    videoCtx.restore();

    // FPS counter
    STATE.frameCount++;
    const now = Date.now();
    const elapsed = now - STATE.lastFpsUpdate;
    if (elapsed >= 1000) {
      STATE.fps = Math.round((STATE.frameCount * 1000) / elapsed);
      fpsDisplay.textContent = `${STATE.fps} fps`;
      STATE.frameCount = 0;
      STATE.lastFpsUpdate = now;
    }

    // Send frame to backend
    if (!STATE.processing && STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
      STATE.processing = true;
      const b64 = videoCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      STATE.ws.send(JSON.stringify({ frame: b64 }));
    }
  }

  loop();
}

// ── Result handling ───────────────────────────────────────────────────────────

function handleResult(data) {
  const hands = data.hands ?? [];

  // Update hands count
  handsCount.textContent = `${hands.length} mano${hands.length !== 1 ? 's' : ''}`;

  // Draw overlay (tracker mode accumulates; others clear first)
  drawOverlay(hands);

  // Update results panel
  updateResults(data);
}

// ── Overlay drawing ───────────────────────────────────────────────────────────

function drawOverlay(hands) {
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;

  // Tracker mode accumulates trail; all others clear
  if (STATE.mode !== 'tracker') {
    overlayCtx.clearRect(0, 0, w, h);
  }

  for (const hand of hands) {
    const lm = hand.landmarks ?? [];
    if (lm.length < 21) continue;

    // Mirror x to match video-canvas (which is drawn mirrored)
    const px = (lm) => (1 - lm.x) * w;
    const py = (lm) => lm.y * h;

    // Draw connections
    overlayCtx.strokeStyle = 'rgba(0, 255, 136, 0.7)';
    overlayCtx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(px(lm[a]), py(lm[a]));
      overlayCtx.lineTo(px(lm[b]), py(lm[b]));
      overlayCtx.stroke();
    }

    // Draw landmark dots
    for (let i = 0; i < lm.length; i++) {
      const x = px(lm[i]);
      const y = py(lm[i]);
      const isTip = FINGERTIPS.includes(i);

      overlayCtx.beginPath();
      if (isTip) {
        overlayCtx.arc(x, y, 7, 0, Math.PI * 2);
        overlayCtx.fillStyle = '#00cfff';
      } else {
        overlayCtx.arc(x, y, 4, 0, Math.PI * 2);
        overlayCtx.fillStyle = '#ef4444';
      }
      overlayCtx.fill();

      // Landmark indices in landmarks mode
      if (STATE.mode === 'landmarks') {
        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.font = '9px system-ui';
        overlayCtx.fillText(String(i), x + 5, y - 4);
      }
    }

    // Tracker mode: draw trail & accumulate index-tip point
    if (STATE.mode === 'tracker') {
      const tip = lm[8]; // INDEX_TIP
      const tipX = px(tip);
      const tipY = py(tip);

      STATE.trail.push({ x: tipX, y: tipY });

      if (STATE.trail.length > 1) {
        overlayCtx.strokeStyle = '#00ff88';
        overlayCtx.lineWidth = 3;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';
        overlayCtx.beginPath();
        overlayCtx.moveTo(STATE.trail[0].x, STATE.trail[0].y);
        for (let i = 1; i < STATE.trail.length; i++) {
          overlayCtx.lineTo(STATE.trail[i].x, STATE.trail[i].y);
        }
        overlayCtx.stroke();
      }
    }
  }
}

// ── Results panel ─────────────────────────────────────────────────────────────

function updateResults(data) {
  const hands = data.hands ?? [];

  switch (STATE.mode) {
    case 'detection':   renderDetection(hands);   break;
    case 'landmarks':   renderLandmarks(hands);   break;
    case 'counter':     renderCounter(hands);     break;
    case 'gestures':    renderGestures(hands);     break;
    case 'tracker':     renderTracker(hands);     break;
    case 'twohands':    renderTwoHands(hands);    break;
    default: break;
  }
}

// detection mode
function renderDetection(hands) {
  let html = '';

  if (hands.length > 0) {
    html += `
      <div class="detection-indicator detected">
        <div class="di-emoji">✅</div>
        <div class="di-text">${hands.length} mano${hands.length > 1 ? 's' : ''} detectada${hands.length > 1 ? 's' : ''}</div>
      </div>
      <div class="handedness-row">`;
    for (const h of hands) {
      html += `<span class="handedness-pill">${h.handedness === 'Left' ? '🫲 Izquierda' : '🫱 Derecha'}</span>`;
    }
    html += `</div>`;
  } else {
    html += `
      <div class="detection-indicator not-detected">
        <div class="di-emoji">❌</div>
        <div class="di-text">Sin manos detectadas</div>
      </div>`;
  }

  resultsPanel.innerHTML = html;
}

// landmarks mode
function renderLandmarks(hands) {
  if (hands.length === 0) {
    resultsPanel.innerHTML = emptyHandsHtml('Apunta la cámara a tu mano');
    return;
  }
  const lm = hands[0].landmarks ?? [];
  const KEY_POINTS = [
    { label: 'Muñeca (0)',       idx: 0  },
    { label: 'Pulgar tip (4)',   idx: 4  },
    { label: 'Índice tip (8)',   idx: 8  },
    { label: 'Medio tip (12)',   idx: 12 },
    { label: 'Meñique tip (20)', idx: 20 },
  ];

  let rows = '';
  for (const kp of KEY_POINTS) {
    const p = lm[kp.idx];
    if (!p) continue;
    rows += `<tr>
      <td>${kp.label}</td>
      <td>${p.x.toFixed(3)}</td>
      <td>${p.y.toFixed(3)}</td>
      <td>${(p.z ?? 0).toFixed(3)}</td>
    </tr>`;
  }

  resultsPanel.innerHTML = `
    <div class="results-section-title">Puntos clave — 21 landmarks detectados</div>
    <table class="landmark-table">
      <thead><tr><th>Punto</th><th>X</th><th>Y</th><th>Z</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// counter mode
function renderCounter(hands) {
  if (hands.length === 0) {
    resultsPanel.innerHTML = emptyHandsHtml('Muestra tu mano a la cámara');
    return;
  }
  const count = hands[0].finger_count ?? 0;
  const colors = { 0: '#ef4444', 1: '#eab308', 2: '#eab308', 3: '#f97316', 4: '#f97316', 5: '#22c55e' };
  const color = colors[count] ?? '#ffffff';
  const fingerEmojis = ['☝️', '✌️', '🤟', '🖖', '✋'];
  let icons = '';
  for (let i = 0; i < count; i++) icons += `<span>${fingerEmojis[i] ?? '🖐️'}</span>`;

  resultsPanel.innerHTML = `
    <div class="results-section-title">Dedos levantados</div>
    <div class="big-number" style="color:${color};">${count}</div>
    <div class="finger-icons">${icons || '<span style="color:var(--dark-muted)">✊</span>'}</div>`;
}

// gestures mode
const GESTURE_EMOJI = {
  fist:       '✊',
  open_hand:  '✋',
  pointing:   '☝️',
  peace:      '✌️',
  thumbs_up:  '👍',
  shaka:      '🤙',
};

function renderGestures(hands) {
  if (hands.length === 0) {
    resultsPanel.innerHTML = emptyHandsHtml('Prueba un gesto frente a la cámara');
    return;
  }
  const gesture = hands[0].gesture ?? 'unknown';
  const emoji = GESTURE_EMOJI[gesture] ?? '🖐️';

  resultsPanel.innerHTML = `
    <div class="gesture-display">
      <div class="gesture-emoji">${emoji}</div>
      <div class="gesture-name">${gesture.replace(/_/g, ' ')}</div>
      <div class="gesture-confidence" style="color:var(--dark-muted);font-size:0.8rem;margin-top:6px;">
        Clasificado por MediaPipe Gesture Recognizer
      </div>
    </div>`;
}

// tracker mode
function renderTracker(hands) {
  if (hands.length === 0) {
    resultsPanel.innerHTML = emptyHandsHtml('Mueve el dedo índice para dibujar');
    return;
  }
  const lm = hands[0].landmarks ?? [];
  const tip = lm[8];
  const tipStr = tip ? `x: ${tip.x.toFixed(3)}, y: ${tip.y.toFixed(3)}` : '—';

  resultsPanel.innerHTML = `
    <div class="tracker-info">
      <div class="trail-count">${STATE.trail.length}</div>
      <div class="trail-label">puntos en el trail</div>
      <div class="tracker-tip-display">Índice → ${tipStr}</div>
      <div class="tracker-instruction">Mueve el dedo índice para dibujar</div>
    </div>`;
}

// twohands mode
function renderTwoHands(hands) {
  if (hands.length === 0) {
    resultsPanel.innerHTML = emptyHandsHtml('Muestra ambas manos a la cámara');
    return;
  }
  if (hands.length === 1) {
    const h = hands[0];
    resultsPanel.innerHTML = `
      <div style="text-align:center;color:var(--dark-muted);font-size:0.85rem;margin-bottom:12px;">
        Detectada 1 mano — muestra la otra también
      </div>
      ${handCardHtml(h)}`;
    return;
  }

  resultsPanel.innerHTML = `
    <div class="hand-info-grid">
      ${handCardHtml(hands[0])}
      ${handCardHtml(hands[1])}
    </div>`;
}

function handCardHtml(hand) {
  const label = hand.handedness === 'Left' ? '🫲 Izquierda' : '🫱 Derecha';
  const count = hand.finger_count ?? 0;
  const gesture = hand.gesture ?? '—';
  const emoji = GESTURE_EMOJI[gesture] ?? '🖐️';
  return `
    <div class="hand-card">
      <h4>${label}</h4>
      <div style="font-size:2rem;font-weight:900;text-align:center;line-height:1;">${count}</div>
      <div style="text-align:center;font-size:0.75rem;color:var(--dark-muted);margin:4px 0;">dedos</div>
      <div style="text-align:center;font-size:1.5rem;">${emoji}</div>
      <div style="text-align:center;font-size:0.75rem;color:var(--dark-muted);">${gesture.replace(/_/g, ' ')}</div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyHandsHtml(msg) {
  return `
    <div class="results-placeholder">
      <span>👐</span>
      <span>${msg}</span>
    </div>`;
}

function setResultsPlaceholder() {
  resultsPanel.innerHTML = `
    <div class="results-placeholder">
      <span>📷</span>
      <span>Inicia la cámara para comenzar</span>
    </div>`;
}

function setStatusDisconnected() {
  statusDot.classList.remove('connected');
  statusText.textContent = 'Desconectado';
}

let errorTimeout = null;
function showError(msg) {
  errorToast.textContent = msg;
  errorToast.style.display = 'block';
  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorToast.style.display = 'none';
  }, 3000);
}
