/**
 * AttendEye — Module Logic
 * Gesture-based classroom attendance and participation tracking.
 * Backend: FastAPI WebSocket on ws://localhost:9876/ws/analyze
 *
 * Two modes:
 *   - Roll Call:     calls each student by name; open_hand held for 2s → PRESENTE
 *   - Participation: free-running; detects raised hands, teacher clicks +1 per student
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/analyze`;
const HOLD_TIME            = 2000;  // ms hold to confirm present
const READING_DELAY        = 1500;  // ms before detection starts for each student
const RAISE_ALERT_DURATION = 1500;  // ms to show hand-raise alert in participation mode

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

// Gestures that count as "hand raised" for presence and participation
const RAISE_GESTURES = new Set(['open_hand', 'thumbs_up', '5_fingers', '4_fingers']);

// ── Roll Call State ───────────────────────────────────────────────────────────

let mode             = null;   // 'rollcall' | 'participation'
let students         = [];     // [{name, initials, status, time}]
let className        = '';
let currentStudentIdx = 0;
let phase            = 'idle'; // idle | reading | detecting | confirming | feedback

let holdStart        = null;
let readingTimer     = null;

// Roll call webcam/WS
let videoEl, canvasEl, ctx, stream, ws, animFrame, processing;

// ── Participation State ───────────────────────────────────────────────────────

let participationCounts = {};  // name → number
let sessionStart        = null;
let timerInterval       = null;
let raiseAlertTimer     = null;
let lastRaiseGesture    = null;

// Participation webcam/WS (separate elements)
let videoElP, canvasElP, ctxP, streamP, wsP, animFrameP, processingP;

// ── Student helpers ───────────────────────────────────────────────────────────

/**
 * Parse roster textarea and initialise the students array.
 * Also resets participationCounts.
 */
function initStudents(rosterText, classNameVal) {
  className = classNameVal.trim() || 'Mi Clase';

  students = rosterText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(name => {
      const parts = name.split(' ');
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
      return { name, initials, status: 'pending', time: null };
    });

  participationCounts = {};
  students.forEach(s => { participationCounts[s.name] = 0; });
}

/** Return initials for a given student name. */
function getInitials(name) {
  const parts = name.split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ── Screen routing ────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.ae-screen').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// ── Webcam helpers ────────────────────────────────────────────────────────────

/**
 * Start webcam and return {video, canvas, ctx, stream}.
 * Mirrors the pattern from webcam.js.
 */
async function startWebcam(videoId, canvasId) {
  const video  = document.getElementById(videoId);
  const canvas = document.getElementById(canvasId);

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
  });
  video.srcObject = mediaStream;

  await new Promise(resolve => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
  });

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;

  return { video, canvas, ctx: canvas.getContext('2d'), stream: mediaStream };
}

/** Open a WebSocket connection and return the socket. */
function openWS(onMessage, onError) {
  const socket = new WebSocket(WS_URL);

  socket.onopen  = () => {};
  socket.onclose = () => {};
  socket.onerror = () => {
    if (onError) onError('No se pudo conectar al servidor. ¿Está corriendo en el puerto 9876?');
  };
  socket.onmessage = onMessage;

  return socket;
}

/** Show an error message in a cam wrapper. */
function showCamError(wrapperId, msg) {
  const wrapper = document.querySelector(`#${wrapperId} .ae-cam-wrapper`) ||
                  document.getElementById(wrapperId);
  if (!wrapper) return;

  const div = document.createElement('div');
  div.style.cssText = `
    position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;
    align-items:center;justify-content:center;text-align:center;
    background:rgba(7,13,26,0.92);color:#ef4444;font-size:0.85rem;padding:16px;gap:8px;
  `;
  div.innerHTML = `<div style="font-size:2rem">📷</div><div>${msg}</div>`;
  wrapper.appendChild(div);
}

// ── Draw landmarks ────────────────────────────────────────────────────────────

/**
 * Draw hand skeleton (connections + dots) from MediaPipe landmarks.
 * IMPORTANT: px = lm.x * w (NO flip — video is drawn mirrored, landmarks are in mirrored space).
 */
function drawHands(drawCtx, hands, w, h) {
  hands.forEach(hand => {
    const lms = hand.landmarks;
    if (!lms || lms.length < 21) return;

    // Draw connections
    drawCtx.strokeStyle = '#38bdf8';
    drawCtx.lineWidth   = 2;
    HAND_CONNECTIONS.forEach(([a, b]) => {
      drawCtx.beginPath();
      drawCtx.moveTo(lms[a].x * w, lms[a].y * h);
      drawCtx.lineTo(lms[b].x * w, lms[b].y * h);
      drawCtx.stroke();
    });

    // Draw dots
    lms.forEach(lm => {
      drawCtx.beginPath();
      drawCtx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
      drawCtx.fillStyle = '#f0f6ff';
      drawCtx.fill();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROLL CALL MODE
// ═══════════════════════════════════════════════════════════════════════════════

async function startRollCall() {
  const rosterText = document.getElementById('ae-roster-input').value;
  const classNameVal = document.getElementById('ae-class-name').value;

  initStudents(rosterText, classNameVal);

  if (students.length === 0) {
    alert('Por favor, ingresa al menos un estudiante en la lista.');
    return;
  }

  mode = 'rollcall';
  phase = 'idle';
  currentStudentIdx = 0;
  holdStart = null;
  processing = false;

  showScreen('rollcall');
  document.getElementById('ae-class-header').textContent = className;

  populateRosterSidebar();

  // Start webcam
  try {
    const cam = await startWebcam('ae-video', 'ae-canvas');
    videoEl = cam.video;
    canvasEl = cam.canvas;
    ctx = cam.ctx;
    stream = cam.stream;
  } catch (err) {
    showCamError('screen-rollcall', `Cámara no disponible: ${err.message}`);
    return;
  }

  // Connect WebSocket
  ws = openWS(handleRCMessage, msg => {
    document.getElementById('ae-gesture-badge').textContent = '⚠️ Sin servidor';
  });

  startRCLoop();
  showStudent(0);
}

/** Populate the roster sidebar with all students as pending. */
function populateRosterSidebar() {
  const list = document.getElementById('ae-roster-list');
  list.innerHTML = students.map((s, i) => `
    <div class="ae-roster-row" id="ae-roster-row-${i}">
      <span class="ae-roster-row-name">${s.name}</span>
      <span class="ae-badge ae-badge-pending" id="ae-roster-badge-${i}">—</span>
    </div>
  `).join('');
}

/** Update the spotlight and start the reading → detecting cycle for a student. */
function showStudent(idx) {
  // Clear any pending timers / hold state from previous student
  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  holdStart = null;
  setHoldRing(0, false);

  // Hide feedback
  hideFeedback();

  if (idx >= students.length) {
    finishRollCall();
    return;
  }

  currentStudentIdx = idx;
  const s = students[idx];

  // Spotlight
  document.getElementById('ae-student-avatar').textContent = s.initials;
  document.getElementById('ae-student-name').textContent   = s.name;
  document.getElementById('ae-student-status-msg').textContent = '¿Estás presente? Levanta la mano 🖐️';

  // Progress
  const pct = (idx / students.length) * 100;
  document.getElementById('ae-rc-progress-fill').style.width = `${pct}%`;
  document.getElementById('ae-rc-progress-text').textContent = `${idx + 1} / ${students.length}`;

  // Highlight in sidebar
  document.querySelectorAll('.ae-roster-row').forEach(r => r.classList.remove('active-student'));
  const row = document.getElementById(`ae-roster-row-${idx}`);
  if (row) { row.classList.add('active-student'); row.scrollIntoView({ block: 'nearest' }); }

  // READING phase
  phase = 'reading';
  document.getElementById('ae-cam-instruction').textContent = `Preparando… ${s.name}`;
  document.getElementById('ae-gesture-badge').textContent = 'Sin mano detectada';

  readingTimer = setTimeout(() => {
    if (phase === 'reading') {
      phase = 'detecting';
      document.getElementById('ae-cam-instruction').textContent = `🖐️ Levanta la mano, ${s.name}`;
    }
  }, READING_DELAY);
}

/** Mark a student present / absent / skipped and advance. */
function markStudent(idx, status) {
  if (idx >= students.length) return;

  // Guard: prevent double-mark from button + gesture race
  if (students[idx].status !== 'pending') return;

  phase = 'feedback';

  students[idx].status = status;
  students[idx].time   = new Date().toLocaleTimeString();

  // Update sidebar badge
  const badgeEl = document.getElementById(`ae-roster-badge-${idx}`);
  if (badgeEl) {
    if (status === 'present') {
      badgeEl.className = 'ae-badge ae-badge-present';
      badgeEl.textContent = '✅';
    } else if (status === 'absent') {
      badgeEl.className = 'ae-badge ae-badge-absent';
      badgeEl.textContent = '❌';
    } else {
      badgeEl.className = 'ae-badge ae-badge-skipped';
      badgeEl.textContent = '⏭';
    }
  }

  // Stop hold ring immediately
  holdStart = null;
  setHoldRing(0, false);

  // Show feedback overlay on cam
  if (status === 'present') {
    showFeedback('✅ ¡Presente!', 'present');
  } else if (status === 'absent') {
    showFeedback('❌ Ausente', 'absent');
  }
  // skipped: no overlay

  setTimeout(() => showStudent(idx + 1), 800);
}

// ── Roll Call render loop ─────────────────────────────────────────────────────

function startRCLoop() {
  function loop() {
    animFrame = requestAnimationFrame(loop);

    if (!stream || videoEl.readyState < 2) return;

    const w = canvasEl.width;
    const h = canvasEl.height;

    // Draw mirrored video
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, w, h);
    ctx.restore();

    // Send frame to backend during active phases
    const shouldSend = phase === 'reading' || phase === 'detecting' || phase === 'confirming';
    if (!processing && shouldSend && ws && ws.readyState === WebSocket.OPEN) {
      processing = true;
      const b64 = canvasEl.toDataURL('image/jpeg', 0.6).split(',')[1];
      ws.send(JSON.stringify({ frame: b64 }));
    }

    // Animate hold ring in confirming phase
    if (phase === 'confirming' && holdStart !== null) {
      const progress = Math.min((Date.now() - holdStart) / HOLD_TIME, 1);
      setHoldRing(progress, true);
      if (progress >= 1) {
        markStudent(currentStudentIdx, 'present');
      }
    }
  }
  loop();
}

// ── Roll Call WS handler ──────────────────────────────────────────────────────

function handleRCMessage(event) {
  processing = false;

  if (phase !== 'detecting' && phase !== 'confirming') return;

  let data;
  try { data = JSON.parse(event.data); } catch (_) { return; }

  const hands = data.hands ?? [];

  // Draw skeleton
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  // Redraw video (overlay-style: draw on same canvas)
  ctx.save();
  ctx.translate(canvasEl.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
  ctx.restore();
  drawHands(ctx, hands, canvasEl.width, canvasEl.height);

  const badge = document.getElementById('ae-gesture-badge');

  if (hands.length === 0) {
    badge.textContent = 'Sin mano detectada';
    // Drop out of confirming if hand disappears
    if (phase === 'confirming') {
      phase = 'detecting';
      holdStart = null;
      setHoldRing(0, false);
    }
    return;
  }

  const hand    = hands[0];
  const gesture = hand.gesture ?? '';
  badge.textContent = gesture.replace(/_/g, ' ') || 'mano detectada';

  const isRaised = RAISE_GESTURES.has(gesture);

  if (!isRaised) {
    if (phase === 'confirming') {
      phase = 'detecting';
      holdStart = null;
      setHoldRing(0, false);
    }
    return;
  }

  // Start or continue hold
  if (phase === 'detecting') {
    phase     = 'confirming';
    holdStart = Date.now();
  }
  // Continued hold is handled in the render loop (time-based)
}

// ── Hold ring helpers ─────────────────────────────────────────────────────────

function setHoldRing(progress, visible) {
  const ring     = document.getElementById('ae-hold-ring');
  const ringFill = document.getElementById('ae-ring-fill');
  if (!ring || !ringFill) return;

  ring.style.display = visible ? 'block' : 'none';
  const offset = 314 * (1 - Math.min(progress, 1));
  ringFill.style.strokeDashoffset = offset;
}

// ── Feedback overlay helpers ──────────────────────────────────────────────────

function showFeedback(text, type) {
  const el = document.getElementById('ae-feedback');
  if (!el) return;
  el.textContent = text;
  el.className   = `ae-feedback ${type} show`;
}

function hideFeedback() {
  const el = document.getElementById('ae-feedback');
  if (!el) return;
  el.className = 'ae-feedback';
  el.textContent = '';
}

// ── Finish roll call ──────────────────────────────────────────────────────────

function finishRollCall() {
  stopRollCall();

  const presentList  = students.filter(s => s.status === 'present');
  const absentList   = students.filter(s => s.status !== 'present');
  const presentCount = presentList.length;
  const totalCount   = students.length;
  const pct          = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  // Stats
  document.getElementById('ae-stat-present').textContent = presentCount;
  document.getElementById('ae-stat-absent').textContent  = totalCount - presentCount;
  document.getElementById('ae-stat-rate').textContent    = `${pct}%`;
  document.getElementById('ae-results-title').textContent = 'Asistencia Completada';
  document.getElementById('ae-results-class').textContent = className;

  // Full list
  const listEl = document.getElementById('ae-results-list');
  listEl.innerHTML = students.map(s => {
    const isPresent = s.status === 'present';
    const badge = isPresent
      ? `<span class="ae-badge ae-badge-present">✅ Presente</span>`
      : `<span class="ae-badge ae-badge-absent">❌ ${s.status === 'absent' ? 'Ausente' : 'Omitido'}</span>`;
    const timeStr = s.time ? `<span class="ae-results-row-time">${s.time}</span>` : '';
    return `
      <div class="ae-results-row ${isPresent ? 'present-row' : 'absent-row'}">
        ${badge}
        <span>${s.name}</span>
        ${timeStr}
      </div>`;
  }).join('');

  // Text report
  const now       = new Date();
  const dateStr   = now.toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const timeStr   = now.toLocaleTimeString();
  const separator = '─'.repeat(33);

  const presentLines = presentList.length > 0
    ? presentList.map(s => `  ✅ ${s.name}${s.time ? ` — ${s.time}` : ''}`).join('\n')
    : '  (ninguno)';

  const absentLines = absentList.length > 0
    ? absentList.map(s => `  ❌ ${s.name}`).join('\n')
    : '  (ninguno)';

  const report = [
    'REPORTE DE ASISTENCIA',
    `Clase: ${className}`,
    `Fecha: ${dateStr}`,
    `Hora:  ${timeStr}`,
    separator,
    `PRESENTES (${presentList.length}):`,
    presentLines,
    `AUSENTES (${absentList.length}):`,
    absentLines,
    separator,
    `Asistencia: ${presentCount}/${totalCount} (${pct}%)`,
  ].join('\n');

  document.getElementById('ae-export-text').value = report;

  showScreen('results');
}

/** Stop roll call: cancel animation, close WS, stop media. */
function stopRollCall() {
  if (animFrame)    { cancelAnimationFrame(animFrame); animFrame = null; }
  if (readingTimer) { clearTimeout(readingTimer);      readingTimer = null; }
  if (stream)       { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (ws)           { ws.onclose = null; ws.close(); ws = null; }
  processing = false;
  phase      = 'idle';
  holdStart  = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PARTICIPATION MODE
// ═══════════════════════════════════════════════════════════════════════════════

async function startParticipation() {
  const rosterText   = document.getElementById('ae-roster-input').value;
  const classNameVal = document.getElementById('ae-class-name').value;

  initStudents(rosterText, classNameVal);

  if (students.length === 0) {
    alert('Por favor, ingresa al menos un estudiante en la lista.');
    return;
  }

  mode = 'participation';
  processingP      = false;
  lastRaiseGesture = null;

  showScreen('participation');
  document.getElementById('ae-part-class-header').textContent = className;

  populateParticipationBoard();

  // Start webcam
  try {
    const cam = await startWebcam('ae-video-p', 'ae-canvas-p');
    videoElP = cam.video;
    canvasElP = cam.canvas;
    ctxP = cam.ctx;
    streamP = cam.stream;
  } catch (err) {
    showCamError('screen-participation', `Cámara no disponible: ${err.message}`);
    return;
  }

  // Connect WebSocket
  wsP = openWS(handlePartMessage, () => {
    document.getElementById('ae-gesture-badge-p').textContent = '⚠️ Sin servidor';
  });

  startPartLoop();
  startSessionTimer();
}

/** Build the participation board rows. */
function populateParticipationBoard() {
  const list = document.getElementById('ae-part-list');
  list.innerHTML = students.map(s => `
    <div class="ae-part-row" id="ae-part-row-${safeDomId(s.name)}">
      <div class="ae-part-avatar">${s.initials}</div>
      <div class="ae-part-name">${s.name}</div>
      <div class="ae-part-count" id="ae-part-count-${safeDomId(s.name)}">0</div>
      <div class="ae-part-bar-wrap">
        <div class="ae-part-bar" id="ae-part-bar-${safeDomId(s.name)}"></div>
      </div>
      <button class="ae-part-plus" data-name="${s.name}">+1</button>
    </div>
  `).join('');

  // Wire +1 buttons
  list.querySelectorAll('.ae-part-plus').forEach(btn => {
    btn.addEventListener('click', () => logParticipation(btn.dataset.name));
  });
}

/** Convert a student name to a safe DOM id fragment. */
function safeDomId(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/** Increment participation count for one student and refresh bar widths. */
function logParticipation(name) {
  if (!(name in participationCounts)) return;

  participationCounts[name]++;

  // Find max to scale bars relatively
  const maxCount = Math.max(1, ...Object.values(participationCounts));

  students.forEach(s => {
    const domId = safeDomId(s.name);
    const countEl = document.getElementById(`ae-part-count-${domId}`);
    const barEl   = document.getElementById(`ae-part-bar-${domId}`);
    if (countEl) countEl.textContent = participationCounts[s.name];
    if (barEl)   barEl.style.width   = `${(participationCounts[s.name] / maxCount) * 100}%`;
  });

  // Bump animation on the updated row
  const rowEl = document.getElementById(`ae-part-row-${safeDomId(name)}`);
  if (rowEl) {
    rowEl.classList.remove('bumped');
    void rowEl.offsetWidth; // force reflow
    rowEl.classList.add('bumped');
    rowEl.addEventListener('animationend', () => rowEl.classList.remove('bumped'), { once: true });
  }
}

// ── Participation render loop ─────────────────────────────────────────────────

function startPartLoop() {
  function loop() {
    animFrameP = requestAnimationFrame(loop);

    if (!streamP || videoElP.readyState < 2) return;

    const w = canvasElP.width;
    const h = canvasElP.height;

    // Draw mirrored video
    ctxP.save();
    ctxP.translate(w, 0);
    ctxP.scale(-1, 1);
    ctxP.drawImage(videoElP, 0, 0, w, h);
    ctxP.restore();

    // Send frame
    if (!processingP && wsP && wsP.readyState === WebSocket.OPEN) {
      processingP = true;
      const b64 = canvasElP.toDataURL('image/jpeg', 0.6).split(',')[1];
      wsP.send(JSON.stringify({ frame: b64 }));
    }
  }
  loop();
}

// ── Participation WS handler ──────────────────────────────────────────────────

function handlePartMessage(event) {
  processingP = false;

  let data;
  try { data = JSON.parse(event.data); } catch (_) { return; }

  const hands = data.hands ?? [];

  // Draw skeleton overlay
  ctxP.save();
  ctxP.translate(canvasElP.width, 0);
  ctxP.scale(-1, 1);
  ctxP.drawImage(videoElP, 0, 0, canvasElP.width, canvasElP.height);
  ctxP.restore();
  drawHands(ctxP, hands, canvasElP.width, canvasElP.height);

  const badge = document.getElementById('ae-gesture-badge-p');

  if (hands.length === 0) {
    badge.textContent = 'Sin mano detectada';
    lastRaiseGesture  = null;
    return;
  }

  const gesture = hands[0].gesture ?? '';
  badge.textContent = gesture.replace(/_/g, ' ') || 'mano detectada';

  // Flash raise alert only on a new raise gesture (not every frame)
  const isRaised = RAISE_GESTURES.has(gesture);
  if (isRaised && gesture !== lastRaiseGesture) {
    showRaiseAlert();
  }
  lastRaiseGesture = isRaised ? gesture : null;
}

function showRaiseAlert() {
  const el = document.getElementById('ae-raise-alert');
  if (!el) return;

  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');

  if (raiseAlertTimer) clearTimeout(raiseAlertTimer);
  raiseAlertTimer = setTimeout(() => {
    el.classList.remove('show');
    raiseAlertTimer = null;
  }, RAISE_ALERT_DURATION);
}

// ── Session timer ─────────────────────────────────────────────────────────────

function startSessionTimer() {
  sessionStart = Date.now();
  const timerEl = document.getElementById('ae-timer');

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mm}:${ss}`;
  }, 1000);
}

/** Stop participation: cancel frames, close WS, stop media, clear timer. */
function stopParticipation() {
  if (animFrameP)    { cancelAnimationFrame(animFrameP); animFrameP = null; }
  if (timerInterval) { clearInterval(timerInterval);      timerInterval = null; }
  if (raiseAlertTimer) { clearTimeout(raiseAlertTimer);   raiseAlertTimer = null; }
  if (streamP)       { streamP.getTracks().forEach(t => t.stop()); streamP = null; }
  if (wsP)           { wsP.onclose = null; wsP.close(); wsP = null; }
  processingP      = false;
  lastRaiseGesture = null;
}

// ── Reset to setup ────────────────────────────────────────────────────────────

function resetToSetup() {
  stopRollCall();
  stopParticipation();
  mode = null;
  students = [];
  participationCounts = {};
  showScreen('setup');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── Setup screen ────────────────────────────────────────────────────────────
  document.getElementById('btn-roll-call').addEventListener('click', startRollCall);
  document.getElementById('btn-participation').addEventListener('click', startParticipation);

  // ── Roll call controls ───────────────────────────────────────────────────────
  document.getElementById('ae-btn-present').addEventListener('click', () => {
    markStudent(currentStudentIdx, 'present');
  });
  document.getElementById('ae-btn-absent').addEventListener('click', () => {
    markStudent(currentStudentIdx, 'absent');
  });
  document.getElementById('ae-btn-skip').addEventListener('click', () => {
    markStudent(currentStudentIdx, 'skipped');
  });
  document.getElementById('ae-btn-exit-rc').addEventListener('click', () => {
    stopRollCall();
    showScreen('setup');
  });

  // ── Participation controls ───────────────────────────────────────────────────
  document.getElementById('ae-btn-exit-part').addEventListener('click', () => {
    stopParticipation();
    showScreen('setup');
  });

  // ── Results screen ───────────────────────────────────────────────────────────
  document.getElementById('ae-btn-copy').addEventListener('click', () => {
    const ta = document.getElementById('ae-export-text');
    navigator.clipboard.writeText(ta.value).then(() => {
      const btn = document.getElementById('ae-btn-copy');
      const orig = btn.textContent;
      btn.textContent = '✅ Copiado';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {
      ta.select();
      document.execCommand('copy');
    });
  });
  document.getElementById('ae-btn-new-session').addEventListener('click', resetToSetup);
  document.getElementById('ae-btn-home').addEventListener('click', () => {
    window.location.href = '/';
  });
});
