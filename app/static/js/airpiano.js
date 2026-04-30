/**
 * AirPiano — Gesture-controlled virtual piano (REQ-012).
 * HandsOnEdu | shares the WebSocket /ws/analyze with the rest of the platform.
 *
 * Architecture:
 *   ap-cam-canvas   — mirrored video frame + hand skeleton overlay (z 1)
 *   ap-keys-canvas  — 8 piano keys, key highlights, finger tip dots (z 2)
 *   ap-wave-canvas  — live oscilogram from MusicSynth analyser (z 3)
 *   ap-note-labels  — floating note labels animated via CSS (z 6)
 *
 * Mirror note: the camera frame is drawn mirrored (ctx.scale(-1,1)). The
 * backend receives the mirrored frame, so landmark x is already in mirrored
 * (on-screen) space — use `lm.x` directly, NOT `1 - lm.x`.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/analyze`;

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

// Fingertip landmark indices: thumb, index, middle, ring, pinky
const FINGERTIPS = [4, 8, 12, 16, 20];
// Display labels per fingertip index
const FINGERTIP_LABEL = { 4: 'pulgar', 8: 'índice', 12: 'medio', 16: 'anular', 20: 'meñique' };
// Color per fingertip
const FINGERTIP_COLOR = {
  4:  '#3b82f6', // pulgar (azul)
  8:  '#22c55e', // índice (verde)
  12: '#facc15', // medio (amarillo)
  16: '#f97316', // anular (naranja)
  20: '#ef4444', // meñique (rojo)
};

// MIDI scales (8 keys)
const SCALES = {
  do_mayor:    [60, 62, 64, 65, 67, 69, 71, 72],
  la_menor:    [57, 59, 60, 62, 64, 65, 67, 69],
  pentatonica: [60, 62, 64, 67, 69, 72, 74, 76],
  blues:       [60, 63, 65, 66, 67, 70, 72, 75],
};

// Note names (display) — Spanish convention C=Do
const NOTE_NAMES = ['DO','DO#','RE','RE#','MI','FA','FA#','SOL','SOL#','LA','LA#','SI'];
function midiToName(m) {
  return NOTE_NAMES[((m % 12) + 12) % 12];
}

// Mode → assigned-mode finger→key mapping (key index 0..7).
// REQ spec: meñique=Do(0), anular=Re(1), medio=Mi(2), índice=Fa(3), pulgar=Sol(4).
const ASSIGNED_FINGER_TO_KEY = { 20: 0, 16: 1, 12: 2, 8: 3, 4: 4 };

// Y thresholds (normalized 0..1) — hysteresis to avoid jitter
const Y_PRESS   = 0.65;
const Y_RELEASE = 0.55;

// Piano keys area (normalized): vertically [0.50, 0.95] of canvas
const KEYS_Y_TOP    = 0.50;
const KEYS_Y_BOTTOM = 0.95;

// Wheel hand zones (X norm)
const WHEEL_LEFT_X_MAX  = 0.20;
const WHEEL_RIGHT_X_MIN = 0.80;
const DWELL_MS = 1500;

// Predefined songs (sequences of MIDI notes in C major)
const SONGS = {
  twinkle:    [60,60,67,67,69,69,67, 65,65,64,64,62,62,60],
  cumple:     [60,60,62,60,65,64, 60,60,62,60,67,65, 60,60,72,69,65,64,62, 71,71,69,65,67,65],
  estrellita: [60,60,67,67,69,69,67, 65,65,64,64,62,62,60],
};

const HIGHLIGHT_MS = 200;

// ── State ────────────────────────────────────────────────────────────────────

let synth;
let audioFx; // shared with /static/js/audio.js (for buzz on wrong-finger feedback)

let video, camCanvas, keysCanvas, waveCanvas;
let camCtx, keysCtx, waveCtx;
let stream, ws, animFrame;
let processing = false;
let started    = false;

let currentScale      = 'do_mayor';
let currentInstrument = 'piano';
let mode              = 'libre';

// Per-finger state: fingerIdx → { isDown, currentKey, lastY }
const fingerStates = new Map();

// Active keys → { key, midi, fingerIdx, highlightAt }
const activeKeys = new Map();

// Tutorial mode
let tutorialTargetKey = null; // 0..7
let score = 0;

// Cancion (song) mode
let songName     = 'twinkle';
let songIndex    = 0;
let songPlaying  = false;     // is the demo playing?
let songNextDeadline = 0;

// Wheel dwell tracking — { wheel: 'scales'|'instr', value, startMs }
let dwellState = null;

// Last known hand sides → for wheel routing (optional)
let leftHand  = null;
let rightHand = null;

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  audioFx = new AudioFeedback();
  synth   = new MusicSynth();

  document.getElementById('ap-btn-start').addEventListener('click', () => {
    start().catch((e) => alert(e.message));
  });

  document.getElementById('ap-btn-mute').addEventListener('click', toggleMute);
  refreshMuteButton();

  document.getElementById('ap-mode-select').addEventListener('change', (e) => {
    setMode(e.target.value);
  });
  document.getElementById('ap-song-select').addEventListener('change', (e) => {
    songName = e.target.value;
    songIndex = 0;
  });
  document.getElementById('ap-btn-song-play').addEventListener('click', playDemoSong);

  // Click-to-select fallback for wheels (keyboard / accessibility)
  document.querySelectorAll('#ap-wheel-scales .ap-wheel-item').forEach((el) => {
    el.addEventListener('click', () => setScale(el.dataset.scale));
  });
  document.querySelectorAll('#ap-wheel-instr .ap-wheel-item').forEach((el) => {
    el.addEventListener('click', () => setInstrument(el.dataset.instr));
  });

  // Release all notes if the user navigates away
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
});

// ── Start ────────────────────────────────────────────────────────────────────

async function start() {
  document.getElementById('ap-guide').style.display = 'none';
  started = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
    });
  } catch (err) {
    throw new Error('No se pudo acceder a la cámara: ' + err.message);
  }

  video = document.getElementById('ap-video');
  video.srcObject = stream;

  await new Promise((resolve) => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
  });
  video.play();

  camCanvas  = document.getElementById('ap-cam-canvas');
  keysCanvas = document.getElementById('ap-keys-canvas');
  waveCanvas = document.getElementById('ap-wave-canvas');
  const w = video.videoWidth  || 1280;
  const h = video.videoHeight || 720;
  [camCanvas, keysCanvas, waveCanvas].forEach((c) => { c.width = w; c.height = h; });
  camCtx  = camCanvas.getContext('2d');
  keysCtx = keysCanvas.getContext('2d');
  waveCtx = waveCanvas.getContext('2d');

  // Trigger lazy AudioContext creation now (we are in a user-gesture handler)
  synth.noteOn(60, 0); synth.noteOff(60);

  connectWS();
  renderLoop();
}

function cleanup() {
  if (synth) synth.allOff();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ws) try { ws.close(); } catch (_) {}
  if (animFrame) cancelAnimationFrame(animFrame);
}

// ── WebSocket ────────────────────────────────────────────────────────────────

function connectWS() {
  updateConnBadge('connecting');
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen    = () => updateConnBadge('connected');
    ws.onclose   = () => { updateConnBadge('disconnected'); if (started) setTimeout(connectWS, 2000); };
    ws.onerror   = () => updateConnBadge('disconnected');
    ws.onmessage = (evt) => {
      processing = false;
      try { handleWSMessage(JSON.parse(evt.data)); } catch (_) {}
    };
  } catch (_) {
    updateConnBadge('disconnected');
  }
}

function updateConnBadge(status) {
  const el = document.getElementById('ap-connection');
  el.className = `ap-conn-badge ap-conn-${status}`;
  el.textContent = {
    connecting:   '🟡 Conectando…',
    connected:    '🟢 Conectado',
    disconnected: '⚫ Desconectado',
  }[status] || '⚫';
}

// ── Render loop ──────────────────────────────────────────────────────────────

function renderLoop() {
  animFrame = requestAnimationFrame(renderLoop);
  if (!video || video.readyState < 2) return;

  const w = camCanvas.width;
  const h = camCanvas.height;

  // Mirrored camera feed
  camCtx.save();
  camCtx.translate(w, 0);
  camCtx.scale(-1, 1);
  camCtx.drawImage(video, 0, 0, w, h);
  camCtx.restore();

  // Send frame to backend
  if (!processing && ws && ws.readyState === WebSocket.OPEN) {
    processing = true;
    const frameData = camCanvas.toDataURL('image/jpeg', 0.55).split(',')[1];
    ws.send(JSON.stringify({ frame: frameData }));
  }

  drawKeys();
  drawWaveform();
  advanceSongDemo();
}

// ── WebSocket message handler ────────────────────────────────────────────────

function handleWSMessage(data) {
  // Clear keys overlay; will redraw with current state
  if (!data.hands || data.hands.length === 0) {
    leftHand = rightHand = null;
    releaseAllFingers();
    cancelDwell();
    return;
  }

  // Sort hands by handedness (mirror: backend "Right" = user's left side on screen, etc.)
  // We don't strictly trust handedness; we route by X position instead.
  leftHand = rightHand = null;
  data.hands.forEach((hand) => {
    const wrist = hand.landmarks?.[0];
    if (!wrist) return;
    if (wrist.x < 0.5) leftHand  = hand;
    else               rightHand = hand;
  });

  // Wheels: only allow dwell selection when one hand is in the wheel area
  // and the OTHER hand is the one tocando (or none).
  handleWheelDwell();

  // Detect key presses with all fingertips of all hands
  detectKeyPresses(data.hands);
}

// ── Finger / key detection ───────────────────────────────────────────────────

function detectKeyPresses(hands) {
  // Build set of currently visible fingertips identified by (handIdx, tipIdx)
  const seenIds = new Set();

  hands.forEach((hand, handIdx) => {
    const lms = hand.landmarks;
    if (!lms) return;

    FINGERTIPS.forEach((tipIdx) => {
      const lm = lms[tipIdx];
      if (!lm) return;
      const fingerKey = `${handIdx}-${tipIdx}`;
      seenIds.add(fingerKey);
      processFingertip(fingerKey, tipIdx, lm.x, lm.y);
    });

    drawHandSkeleton(lms);
  });

  // Release fingers that disappeared from view
  for (const fid of Array.from(fingerStates.keys())) {
    if (!seenIds.has(fid)) {
      const st = fingerStates.get(fid);
      if (st && st.isDown && st.currentKey != null) {
        const midi = SCALES[currentScale][st.currentKey];
        synth.noteOff(midi);
        activeKeys.delete(`${fid}`);
      }
      fingerStates.delete(fid);
    }
  }
}

function processFingertip(fingerKey, tipIdx, x, y) {
  const prev = fingerStates.get(fingerKey) || { isDown: false, currentKey: null, lastY: y };
  const wasDown = prev.isDown;

  // Skip the wheel zones — those are reserved for wheel selection, not playing keys
  const inWheelZone = x < WHEEL_LEFT_X_MAX || x > WHEEL_RIGHT_X_MIN;

  // Hysteresis: enter when y > Y_PRESS, leave when y < Y_RELEASE
  let isDown;
  if (!wasDown) isDown = (y > Y_PRESS) && !inWheelZone;
  else          isDown = (y > Y_RELEASE) && !inWheelZone;

  // Compute key based on x — only valid in the inner 60% of width
  let keyIdx = null;
  if (!inWheelZone) {
    const rel = (x - WHEEL_LEFT_X_MAX) / (WHEEL_RIGHT_X_MIN - WHEEL_LEFT_X_MAX);
    keyIdx = Math.max(0, Math.min(7, Math.floor(rel * 8)));
  }

  if (isDown && !wasDown && keyIdx !== null) {
    triggerKey(fingerKey, tipIdx, keyIdx);
  } else if (!isDown && wasDown && prev.currentKey !== null) {
    releaseKey(fingerKey, prev.currentKey);
  } else if (isDown && wasDown && keyIdx !== prev.currentKey && keyIdx !== null) {
    // Slid horizontally to a different key while still pressed:
    // release old, trigger new (legato behavior)
    releaseKey(fingerKey, prev.currentKey);
    triggerKey(fingerKey, tipIdx, keyIdx);
  }

  fingerStates.set(fingerKey, {
    isDown,
    currentKey: isDown ? keyIdx : null,
    lastY: y,
    tipIdx,
    x, y,
  });
}

function triggerKey(fingerKey, tipIdx, keyIdx) {
  // Mode "asignado": only the assigned finger may sound. Other fingers → buzz.
  if (mode === 'asignado') {
    const expected = ASSIGNED_FINGER_TO_KEY[tipIdx];
    if (expected !== keyIdx) {
      audioFx?.play('buzz');
      return;
    }
  }

  const midi = SCALES[currentScale][keyIdx];
  synth.noteOn(midi, 0.7);
  activeKeys.set(fingerKey, { keyIdx, midi, highlightAt: performance.now() });
  spawnNoteLabel(keyIdx, midi);

  // Tutorial: scoring
  if (mode === 'tutorial') {
    if (tutorialTargetKey === keyIdx) {
      score += 1;
      updateScore();
      pickTutorialTarget();
      audioFx?.play('ding');
    }
  }

  // Cancion: advance only if this matches the expected next note
  if (mode === 'cancion' && !songPlaying) {
    const seq = SONGS[songName];
    const expectedMidi = seq[songIndex];
    if (expectedMidi === midi) {
      songIndex += 1;
      score += 1;
      updateScore();
      if (songIndex >= seq.length) {
        audioFx?.play('fanfare');
        songIndex = 0;
      }
    }
  }
}

function releaseKey(fingerKey, keyIdx) {
  const midi = SCALES[currentScale][keyIdx];
  synth.noteOff(midi);
  activeKeys.delete(fingerKey);
}

function releaseAllFingers() {
  for (const [fid, st] of fingerStates.entries()) {
    if (st.isDown && st.currentKey != null) {
      const midi = SCALES[currentScale][st.currentKey];
      synth.noteOff(midi);
    }
  }
  fingerStates.clear();
  activeKeys.clear();
}

// ── Mode / scale / instrument handling ───────────────────────────────────────

function setMode(m) {
  releaseAllFingers();
  mode = m;
  document.getElementById('ap-cancion-group').style.display = (m === 'cancion') ? 'flex' : 'none';
  score = 0; updateScore();
  songIndex = 0; songPlaying = false;
  if (m === 'tutorial') pickTutorialTarget();
  else                   tutorialTargetKey = null;
}

function setScale(name) {
  if (!SCALES[name] || name === currentScale) return;
  releaseAllFingers();
  currentScale = name;
  document.querySelectorAll('#ap-wheel-scales .ap-wheel-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.scale === name);
  });
}

function setInstrument(name) {
  if (name === currentInstrument) return;
  currentInstrument = name;
  synth.setInstrument(name);
  document.querySelectorAll('#ap-wheel-instr .ap-wheel-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.instr === name);
  });
}

function pickTutorialTarget() {
  let next;
  do { next = Math.floor(Math.random() * 8); } while (next === tutorialTargetKey);
  tutorialTargetKey = next;
}

function updateScore() {
  document.getElementById('ap-score').textContent = String(score);
}

// ── Mute toggle (shared across audio.js + audio-synth.js) ────────────────────

function toggleMute() {
  if (synth.isMuted()) {
    synth.unmute();
    audioFx.unmute();
  } else {
    synth.mute();
    audioFx.mute();
  }
  refreshMuteButton();
}

function refreshMuteButton() {
  const btn = document.getElementById('ap-btn-mute');
  btn.textContent = synth.isMuted() ? '🔇' : '🔊';
}

// ── Wheel dwell handling ─────────────────────────────────────────────────────

function handleWheelDwell() {
  // Use the index fingertip (8) of each hand to point at wheel items.
  const candidates = [];
  if (leftHand?.landmarks?.[8]) {
    const tip = leftHand.landmarks[8];
    if (tip.x < WHEEL_LEFT_X_MAX) {
      candidates.push({ wheel: 'scales', x: tip.x, y: tip.y });
    }
  }
  if (rightHand?.landmarks?.[8]) {
    const tip = rightHand.landmarks[8];
    if (tip.x > WHEEL_RIGHT_X_MIN) {
      candidates.push({ wheel: 'instr', x: tip.x, y: tip.y });
    }
  }

  if (candidates.length === 0) { cancelDwell(); return; }

  // Identify which wheel item the cursor is over (in screen coords)
  const cand = candidates[0];
  const containerSel = cand.wheel === 'scales' ? '#ap-wheel-scales' : '#ap-wheel-instr';
  const items = document.querySelectorAll(`${containerSel} .ap-wheel-item`);
  const areaRect = document.getElementById('ap-canvas-area').getBoundingClientRect();
  const px = areaRect.left + cand.x * areaRect.width;
  const py = areaRect.top  + cand.y * areaRect.height;

  let targetEl = null;
  let targetValue = null;
  items.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
      targetEl = el;
      targetValue = cand.wheel === 'scales' ? el.dataset.scale : el.dataset.instr;
    }
  });

  if (!targetEl || !targetValue) { cancelDwell(); return; }

  const now = performance.now();
  if (!dwellState || dwellState.value !== targetValue || dwellState.wheel !== cand.wheel) {
    cancelDwell();
    dwellState = { wheel: cand.wheel, value: targetValue, startMs: now, el: targetEl };
    targetEl.classList.add('dwelling');
  }

  const elapsed = now - dwellState.startMs;
  const pct = Math.min(100, (elapsed / DWELL_MS) * 100);
  const fill = dwellState.el.querySelector('.ap-dwell-fill');
  if (fill) fill.style.width = pct + '%';

  if (elapsed >= DWELL_MS) {
    if (cand.wheel === 'scales') setScale(targetValue);
    else                          setInstrument(targetValue);
    audioFx?.play('chime');
    cancelDwell();
  }
}

function cancelDwell() {
  if (dwellState) {
    if (dwellState.el) {
      dwellState.el.classList.remove('dwelling');
      const f = dwellState.el.querySelector('.ap-dwell-fill');
      if (f) f.style.width = '0%';
    }
    dwellState = null;
  }
}

// ── Drawing: hand skeleton ───────────────────────────────────────────────────

function drawHandSkeleton(lms) {
  const w = camCanvas.width, h = camCanvas.height;
  // Draw skeleton onto cam canvas (over the video)
  camCtx.lineWidth = 2;
  camCtx.strokeStyle = 'rgba(99, 102, 241, 0.55)';
  HAND_CONNECTIONS.forEach(([a, b]) => {
    const la = lms[a], lb = lms[b];
    if (!la || !lb) return;
    camCtx.beginPath();
    camCtx.moveTo(la.x * w, la.y * h);
    camCtx.lineTo(lb.x * w, lb.y * h);
    camCtx.stroke();
  });

  // Fingertip dots, color-coded
  FINGERTIPS.forEach((idx) => {
    const lm = lms[idx];
    if (!lm) return;
    const px = lm.x * w, py = lm.y * h;
    camCtx.beginPath();
    camCtx.fillStyle = FINGERTIP_COLOR[idx];
    camCtx.arc(px, py, 9, 0, Math.PI * 2);
    camCtx.fill();
    camCtx.lineWidth = 2;
    camCtx.strokeStyle = '#0a0a0f';
    camCtx.stroke();
  });
}

// ── Drawing: piano keys ──────────────────────────────────────────────────────

function drawKeys() {
  if (!keysCtx) return;
  const w = keysCanvas.width;
  const h = keysCanvas.height;
  keysCtx.clearRect(0, 0, w, h);

  const xLeft  = WHEEL_LEFT_X_MAX  * w;
  const xRight = WHEEL_RIGHT_X_MIN * w;
  const yTop   = KEYS_Y_TOP    * h;
  const yBot   = KEYS_Y_BOTTOM * h;
  const keyW   = (xRight - xLeft) / 8;

  const now = performance.now();
  const pressedKeys = new Set();
  for (const v of activeKeys.values()) {
    if (now - v.highlightAt < HIGHLIGHT_MS * 4) pressedKeys.add(v.keyIdx);
  }

  for (let i = 0; i < 8; i += 1) {
    const x = xLeft + i * keyW;
    const isPressed = pressedKeys.has(i);
    const isTutorialTarget = (mode === 'tutorial' && tutorialTargetKey === i);
    const isSongTarget = (mode === 'cancion' && SONGS[songName][songIndex] === SCALES[currentScale][i]);

    let fill = 'rgba(255, 255, 255, 0.78)';
    if (isPressed)         fill = 'rgba(34, 197, 94, 0.85)';
    else if (isTutorialTarget) fill = 'rgba(59, 130, 246, ' + (0.55 + 0.25 * Math.sin(now / 200)) + ')';
    else if (isSongTarget)     fill = 'rgba(168, 85, 247, ' + (0.55 + 0.25 * Math.sin(now / 200)) + ')';

    keysCtx.fillStyle = fill;
    keysCtx.strokeStyle = '#0a0a0f';
    keysCtx.lineWidth = 2;
    roundRect(keysCtx, x + 2, yTop, keyW - 4, yBot - yTop, 6);
    keysCtx.fill();
    keysCtx.stroke();

    // Note name label on the key
    const midi = SCALES[currentScale][i];
    keysCtx.fillStyle = isPressed ? '#0a0a0f' : '#1e293b';
    keysCtx.font = '600 16px system-ui, sans-serif';
    keysCtx.textAlign = 'center';
    keysCtx.fillText(midiToName(midi), x + keyW / 2, yBot - 14);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Drawing: live waveform ───────────────────────────────────────────────────

let waveBuffer = null;
function drawWaveform() {
  const analyser = synth?.getAnalyser?.();
  if (!analyser) return;
  if (!waveBuffer || waveBuffer.length !== analyser.fftSize) {
    waveBuffer = new Float32Array(analyser.fftSize);
  }
  analyser.getFloatTimeDomainData(waveBuffer);

  const w = waveCanvas.width;
  const h = waveCanvas.height;
  waveCtx.clearRect(0, 0, w, h);

  // Bottom band, full width
  const bandH = Math.max(60, h * 0.10);
  const bandY = h - bandH - 8;

  waveCtx.fillStyle = 'rgba(10, 10, 20, 0.55)';
  waveCtx.fillRect(0, bandY, w, bandH);

  waveCtx.strokeStyle = '#22c55e';
  waveCtx.lineWidth = 2;
  waveCtx.beginPath();
  for (let i = 0; i < waveBuffer.length; i += 1) {
    const x = (i / waveBuffer.length) * w;
    const y = bandY + bandH / 2 + waveBuffer[i] * (bandH / 2);
    if (i === 0) waveCtx.moveTo(x, y);
    else         waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();
}

// ── Floating note labels ─────────────────────────────────────────────────────

function spawnNoteLabel(keyIdx, midi) {
  const area = document.getElementById('ap-canvas-area');
  if (!area) return;
  const rect = area.getBoundingClientRect();
  const xLeft = WHEEL_LEFT_X_MAX  * rect.width;
  const xRight = WHEEL_RIGHT_X_MIN * rect.width;
  const keyW   = (xRight - xLeft) / 8;
  const cx     = xLeft + keyW * (keyIdx + 0.5);
  const cy     = KEYS_Y_TOP * rect.height - 10;

  const el = document.createElement('div');
  el.className = 'ap-note-label';
  el.style.left = cx + 'px';
  el.style.top  = cy + 'px';
  el.textContent = midiToName(midi);
  document.getElementById('ap-note-labels').appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// ── Demo song playback (modo cancion) ────────────────────────────────────────

function playDemoSong() {
  if (mode !== 'cancion') {
    setMode('cancion');
    document.getElementById('ap-mode-select').value = 'cancion';
  }
  songPlaying = true;
  songIndex = 0;
  songNextDeadline = performance.now();
}

function advanceSongDemo() {
  if (!songPlaying) return;
  const now = performance.now();
  if (now < songNextDeadline) return;

  const seq = SONGS[songName];
  if (songIndex >= seq.length) {
    songPlaying = false;
    songIndex = 0;
    return;
  }
  const midi = seq[songIndex];
  synth.noteOn(midi, 0.6);
  setTimeout(() => synth.noteOff(midi), 350);
  songIndex += 1;
  songNextDeadline = now + 450;
}
