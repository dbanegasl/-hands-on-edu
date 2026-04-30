/**
 * MotivaSign — Gesture / Sign Language Learning Module
 * HandsOnEdu | MediaPipe Hand Landmarker via WebSocket
 *
 * Two modes:
 *   APRENDER  – freeform practice; detect gesture, celebrate, stay on sign.
 *   DESAFÍO   – 10-sign challenge; 6 s timeout per sign; scored at the end.
 *
 * WebSocket pattern mirrors /static/js/webcam.js:
 *   • Webcam frame → mirrored onto canvas → base64 JPEG → WS backend
 *   • Backend replies with { hands: [...], timestamp }
 *   • Landmarks drawn directly (x maps to canvas width — no flip needed)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/analyze`;
const HOLD_TIME         = 1500;   // ms holding correct gesture → confirm
const READING_DELAY     = 2500;   // ms to display sign before detection starts
const CHALLENGE_TIMEOUT = 6000;   // ms of detecting phase before auto-fail (challenge)
const FEEDBACK_DURATION = 1200;   // ms to show feedback overlay
const RING_CIRC         = 314;    // stroke-dasharray ≈ 2π×50

const HAND_CONNECTIONS = [
  [0, 1],  [1, 2],   [2, 3],   [3, 4],    // thumb
  [0, 5],  [5, 6],   [6, 7],   [7, 8],    // index
  [0, 9],  [9, 10],  [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16],  // ring
  [0, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [5, 9],  [9, 13],  [13, 17],            // palm cross
];

const FINGERTIPS = [4, 8, 12, 16, 20];

const SIGNS = [
  { id: 'uno',    label: '1',           emoji: '☝️',  gesture: 'pointing',   hint: 'Levanta el dedo índice' },
  { id: 'dos',    label: '2',           emoji: '✌️',  gesture: 'peace',      hint: 'Índice y medio arriba' },
  { id: 'tres',   label: '3',           emoji: '🤟',  gesture: '3_fingers',  hint: 'Tres dedos arriba' },
  { id: 'cuatro', label: '4',           emoji: '🖖',  gesture: '4_fingers',  hint: 'Cuatro dedos arriba' },
  { id: 'cinco',  label: '5',           emoji: '🖐️', gesture: 'open_hand',  hint: 'Toda la mano abierta' },
  { id: 'stop',   label: 'STOP',        emoji: '✋',  gesture: 'open_hand',  hint: 'Mano abierta frente a ti' },
  { id: 'bien',   label: 'BIEN 👍',     emoji: '👍',  gesture: 'thumbs_up',  hint: 'Pulgar arriba' },
  { id: 'no',     label: 'NO ✊',       emoji: '✊',  gesture: 'fist',       hint: 'Cierra el puño' },
  { id: 'hola',   label: 'HOLA 👋',    emoji: '👋',  gesture: 'open_hand',  hint: 'Mano abierta y agita' },
  { id: 'amor',   label: 'TE AMO 🤟',  emoji: '🤟',  gesture: 'shaka',      hint: 'Pulgar y meñique arriba' },
  { id: 'paz',    label: 'PAZ ✌️',     emoji: '✌️',  gesture: 'peace',      hint: 'Índice y medio en V' },
  { id: 'apunta', label: 'APUNTA ☝️',  emoji: '☝️',  gesture: 'pointing',   hint: 'Señala con el índice' },
  { id: 'ok',     label: 'OK 👌',      emoji: '✊',  gesture: 'fist',       hint: 'Puño cerrado (OK)' },
  { id: 'adios',  label: 'ADIÓS 👋',   emoji: '👋',  gesture: 'open_hand',  hint: 'Abre la mano para despedirte' },
  { id: 'bravo',  label: 'BRAVO 🤙',   emoji: '🤙',  gesture: 'shaka',      hint: 'Pulgar y meñique' },
];

// ── Audio ─────────────────────────────────────────────────────────────────────

const audio = new AudioFeedback();

// ── State ─────────────────────────────────────────────────────────────────────

let ws           = null;
let stream       = null;
let animFrame    = null;
let processing   = false;
let lastHands    = [];

let mode           = null;       // 'learn' | 'challenge'
let currentSignIdx = 0;          // index into SIGNS (learn mode)
let challengeQueue = [];         // 10 shuffled signs (challenge mode)
let challengeStep  = 0;          // 0-9
let score          = 0;
let answers        = [];         // boolean per challenge step

let holdStart    = null;         // Date.now() when confirming started
let holdProgress = 0;            // 0–1

// phase drives the state machine
// idle → (startGame) → reading → detecting → confirming → feedback → (loop or results)
let phase = 'idle';

let readingTimer   = null;
let challengeTimer = null;
let feedbackTimer  = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────

let elVideo, elCanvas, ctx;
let elGestureBadge, elHoldRing, elRingFill;
let elFeedback;
let elSignEmoji, elSignLabel, elSignHint;
let elStatusMsg;
let elNavBtns, elScoreDisplay, elScoreVal;
let elProgressBar, elProgressFill, elProgressText;
let elModeBadge;

// ── Initialise ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  elVideo        = document.getElementById('ms-video');
  elCanvas       = document.getElementById('ms-canvas');
  ctx            = elCanvas.getContext('2d');
  elGestureBadge = document.getElementById('ms-gesture-badge');
  elHoldRing     = document.getElementById('ms-hold-ring');
  elRingFill     = document.getElementById('ms-ring-fill');
  elFeedback     = document.getElementById('ms-feedback');
  elSignEmoji    = document.getElementById('ms-sign-emoji');
  elSignLabel    = document.getElementById('ms-sign-label');
  elSignHint     = document.getElementById('ms-sign-hint');
  elStatusMsg    = document.getElementById('ms-status-msg');
  elNavBtns      = document.getElementById('ms-nav-btns');
  elScoreDisplay = document.getElementById('ms-score-display');
  elScoreVal     = document.getElementById('ms-score-val');
  elProgressBar  = document.getElementById('ms-progress-bar');
  elProgressFill = document.getElementById('ms-progress-fill');
  elProgressText = document.getElementById('ms-progress-text');
  elModeBadge    = document.getElementById('ms-mode-badge');

  document.getElementById('btn-aprender').addEventListener('click', () => startGame('learn'));
  document.getElementById('btn-desafio').addEventListener('click',  () => startGame('challenge'));
  document.getElementById('ms-btn-prev').addEventListener('click',  prevSign);
  document.getElementById('ms-btn-next').addEventListener('click',  nextSign);
  document.getElementById('ms-btn-exit').addEventListener('click',  exitGame);
  document.getElementById('ms-btn-replay').addEventListener('click', () => startGame('challenge'));
  document.getElementById('ms-btn-home').addEventListener('click',  goHome);

  // Mute button
  const btnMute = document.getElementById('btn-mute-audio');
  if (btnMute) {
    btnMute.textContent = audio.isMuted() ? '🔇' : '🔊';
    btnMute.addEventListener('click', () => {
      if (audio.isMuted()) { audio.unmute(); btnMute.textContent = '🔊'; }
      else                 { audio.mute();   btnMute.textContent = '🔇'; }
    });
  }
});

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.ms-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Game startup ──────────────────────────────────────────────────────────────

async function startGame(m) {
  stopWebcam();  // clean up any previous session

  mode           = m;
  currentSignIdx = 0;
  challengeStep  = 0;
  score          = 0;
  answers        = [];
  holdStart      = null;
  holdProgress   = 0;
  phase          = 'idle';
  lastHands      = [];

  if (mode === 'learn') {
    elModeBadge.textContent      = 'APRENDER';
    elNavBtns.style.display      = 'flex';
    elScoreDisplay.style.display = 'none';
    elProgressBar.style.display  = 'none';
  } else {
    elModeBadge.textContent      = 'DESAFÍO';
    elNavBtns.style.display      = 'none';
    elScoreDisplay.style.display = 'flex';
    elProgressBar.style.display  = 'block';
    elScoreVal.textContent       = '0';
    challengeQueue = [...SIGNS].sort(() => Math.random() - 0.5).slice(0, 10);
  }

  showScreen('screen-game');
  await initCamera();
  loadSign();
}

// ── Current sign accessor ─────────────────────────────────────────────────────

function currentSign() {
  return mode === 'learn' ? SIGNS[currentSignIdx] : challengeQueue[challengeStep];
}

// ── Sign loading / reading phase ──────────────────────────────────────────────

function loadSign(skipReading = false) {
  clearTimers();

  const sign = currentSign();

  // Animate the emoji on every sign change
  elSignEmoji.style.animation = 'none';
  void elSignEmoji.offsetWidth;              // force reflow to restart animation
  elSignEmoji.style.animation = 'pop 0.45s ease';

  elSignEmoji.textContent = sign.emoji;
  elSignLabel.textContent = sign.label;
  elSignHint.textContent  = sign.hint;

  // Reset hold state
  holdStart    = null;
  holdProgress = 0;
  setRingOffset(RING_CIRC);
  elHoldRing.style.display = 'none';
  hideFeedback();

  if (mode === 'challenge') updateProgress();

  if (skipReading) {
    enterDetecting();
    return;
  }

  // Reading phase: show sign, wait before detection activates
  phase = 'reading';
  elStatusMsg.textContent    = '👀 Observa la seña...';
  elGestureBadge.textContent = '—';

  readingTimer = setTimeout(enterDetecting, READING_DELAY);
}

function enterDetecting() {
  phase = 'detecting';
  elStatusMsg.textContent    = '🙌 ¡Muestra la seña!';
  elGestureBadge.textContent = 'Sin mano detectada';

  if (mode === 'challenge') {
    challengeTimer = setTimeout(() => showFeedback(false), CHALLENGE_TIMEOUT);
  }
}

// ── Gesture processing (called on every WS response) ─────────────────────────

function processGesture(hands) {
  if (phase !== 'detecting' && phase !== 'confirming') return;

  const sign = currentSign();

  if (hands.length === 0) {
    elGestureBadge.textContent = 'Sin mano detectada';
    if (phase === 'confirming') resetHold();
    return;
  }

  const gesture = hands[0].gesture ?? '';
  elGestureBadge.textContent = gesture.replace(/_/g, ' ') || '—';

  if (phase === 'detecting') {
    if (gesture === sign.gesture) {
      // Correct gesture detected — enter confirming phase
      phase     = 'confirming';
      holdStart = Date.now();
      elHoldRing.style.display = 'block';
      elStatusMsg.textContent  = '💪 ¡Mantén la seña!';
    }
  } else if (phase === 'confirming') {
    if (gesture !== sign.gesture) {
      // Gesture lost — reset hold, go back to detecting
      resetHold();
    }
    // Hold progress is time-driven in the RAF loop (tickHoldRing)
  }
}

function resetHold() {
  phase        = 'detecting';
  holdStart    = null;
  holdProgress = 0;
  setRingOffset(RING_CIRC);
  elHoldRing.style.display = 'none';
  elStatusMsg.textContent  = '🙌 ¡Muestra la seña!';
}

// ── Hold ring — driven by requestAnimationFrame ───────────────────────────────

function tickHoldRing() {
  if (phase !== 'confirming' || holdStart === null) return;

  holdProgress = Math.min(1, (Date.now() - holdStart) / HOLD_TIME);
  setRingOffset(RING_CIRC * (1 - holdProgress));

  if (holdProgress >= 1) showFeedback(true);
}

function setRingOffset(val) {
  elRingFill.setAttribute('stroke-dashoffset', val.toFixed(1));
}

// ── Feedback overlay ──────────────────────────────────────────────────────────

function showFeedback(correct) {
  // Guard: only valid in active detection phases
  if (phase !== 'detecting' && phase !== 'confirming') return;

  phase = 'feedback';
  clearTimers();

  holdStart    = null;
  holdProgress = 0;
  setRingOffset(RING_CIRC);
  elHoldRing.style.display = 'none';

  if (correct) {
    audio.play('pop');
    elFeedback.innerHTML = '<span class="ms-fb-emoji">✅</span><span class="ms-fb-text">¡Correcto!</span>';
    elFeedback.className = 'ms-feedback ms-feedback-correct ms-feedback-visible';
    if (mode === 'challenge') {
      score++;
      elScoreVal.textContent = score;
    }
  } else {
    audio.play('beep');
    elFeedback.innerHTML = '<span class="ms-fb-emoji">❌</span><span class="ms-fb-text">¡Inténtalo de nuevo!</span>';
    elFeedback.className = 'ms-feedback ms-feedback-wrong ms-feedback-visible';
  }

  feedbackTimer = setTimeout(() => {
    hideFeedback();

    if (mode === 'learn') {
      // Celebrate and stay on the same sign — skip reading delay
      elStatusMsg.textContent = correct ? '🌟 ¡Genial! Hazlo de nuevo' : '🙌 ¡Muestra la seña!';
      phase = 'detecting';
    } else {
      // Challenge: record result and advance
      answers.push(correct);
      challengeStep++;
      if (challengeStep >= 10) {
        showResults();
      } else {
        loadSign();
      }
    }
  }, FEEDBACK_DURATION);
}

function hideFeedback() {
  elFeedback.className   = 'ms-feedback';
  elFeedback.innerHTML   = '';
}

// ── Progress bar (challenge mode) ─────────────────────────────────────────────

function updateProgress() {
  elProgressFill.style.width = `${(challengeStep / 10) * 100}%`;
  elProgressText.textContent = `${challengeStep + 1} / 10`;
}

// ── Learn mode navigation ─────────────────────────────────────────────────────

function prevSign() {
  if (mode !== 'learn') return;
  currentSignIdx = (currentSignIdx - 1 + SIGNS.length) % SIGNS.length;
  loadSign();
}

function nextSign() {
  if (mode !== 'learn') return;
  currentSignIdx = (currentSignIdx + 1) % SIGNS.length;
  loadSign();
}

// ── Results screen (challenge mode) ──────────────────────────────────────────

function showResults() {
  stopWebcam();
  audio.play('chime');
  showScreen('screen-results');

  const GRADES = [
    { min: 9, grade: 'A', trophy: '🏆', title: '¡Increíble maestro/a de señas!' },
    { min: 7, grade: 'B', trophy: '⭐', title: '¡Muy bien!' },
    { min: 5, grade: 'C', trophy: '🌟', title: '¡Buen intento!' },
    { min: 0, grade: 'D', trophy: '💪', title: '¡Sigue practicando!' },
  ];

  const g = GRADES.find(x => score >= x.min);

  document.getElementById('ms-results-trophy').textContent = g.trophy;
  document.getElementById('ms-results-title').textContent  = g.title;
  document.getElementById('ms-results-score').textContent  = `${score} / 10`;

  const badge = document.getElementById('ms-grade-badge');
  badge.textContent   = g.grade;
  badge.dataset.grade = g.grade;

  const dotsGrid = document.getElementById('ms-dots-grid');
  dotsGrid.innerHTML = answers.map((ok, i) => {
    const label = (challengeQueue[i]?.label ?? '').replace(/</g, '&lt;');
    return `<div class="ms-dot ${ok ? 'ms-dot-correct' : 'ms-dot-wrong'}" title="${label}">${ok ? '✅' : '❌'}</div>`;
  }).join('');
}

// ── Exit helpers ──────────────────────────────────────────────────────────────

function exitGame() {
  stopWebcam();
  showScreen('screen-idle');
}

function goHome() {
  stopWebcam();
  showScreen('screen-idle');
}

// ── Camera initialisation ─────────────────────────────────────────────────────

async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    elVideo.srcObject = stream;

    await new Promise(resolve =>
      elVideo.addEventListener('loadedmetadata', resolve, { once: true })
    );

    const w = elVideo.videoWidth  || 640;
    const h = elVideo.videoHeight || 480;
    elCanvas.width  = w;
    elCanvas.height = h;

    connectWS();
    startLoop();
  } catch (err) {
    elStatusMsg.textContent = `⚠️ Cámara no disponible: ${err.message}`;
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    elStatusMsg.textContent = `⚠️ No se pudo crear WebSocket: ${err.message}`;
    return;
  }

  ws.onopen = () => { /* connection established */ };

  ws.onclose = () => { /* closed normally */ };

  ws.onerror = () => {
    elStatusMsg.textContent = '⚠️ Error WS — ¿está el servidor en el puerto 9876?';
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      lastHands = data.hands ?? [];
      processGesture(lastHands);
    } catch (_) {
      // Malformed JSON — ignore
    }
    processing = false;
  };
}

// ── Render loop ───────────────────────────────────────────────────────────────

function startLoop() {
  function loop() {
    animFrame = requestAnimationFrame(loop);

    if (!stream || elVideo.readyState < 2) return;

    // 1. Draw mirrored video frame onto canvas
    ctx.save();
    ctx.translate(elCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(elVideo, 0, 0, elCanvas.width, elCanvas.height);
    ctx.restore();

    // 2. Capture and send the clean video frame to the backend
    //    (done before landmarks are drawn so backend receives raw video)
    if (!processing && ws && ws.readyState === WebSocket.OPEN) {
      processing = true;
      const b64 = elCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      ws.send(JSON.stringify({ frame: b64 }));
    }

    // 3. Draw cached hand landmarks on top
    drawLandmarks(lastHands);

    // 4. Advance hold-ring animation (time-based)
    tickHoldRing();
  }

  loop();
}

// ── Landmark drawing ──────────────────────────────────────────────────────────

function drawLandmarks(hands) {
  const w  = elCanvas.width;
  const h  = elCanvas.height;
  const px = lm => lm.x * w;
  const py = lm => lm.y * h;

  for (const hand of hands) {
    const lm = hand.landmarks ?? [];
    if (lm.length < 21) continue;

    // Skeleton connections
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.7)';
    ctx.lineWidth   = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(px(lm[a]), py(lm[a]));
      ctx.lineTo(px(lm[b]), py(lm[b]));
      ctx.stroke();
    }

    // Landmark dots
    for (let i = 0; i < lm.length; i++) {
      ctx.beginPath();
      if (FINGERTIPS.includes(i)) {
        ctx.arc(px(lm[i]), py(lm[i]), 7, 0, Math.PI * 2);
        ctx.fillStyle = '#00cfff';
      } else {
        ctx.arc(px(lm[i]), py(lm[i]), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
      }
      ctx.fill();
    }
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function clearTimers() {
  if (readingTimer)   { clearTimeout(readingTimer);   readingTimer   = null; }
  if (challengeTimer) { clearTimeout(challengeTimer); challengeTimer = null; }
  if (feedbackTimer)  { clearTimeout(feedbackTimer);  feedbackTimer  = null; }
}

function stopWebcam() {
  clearTimers();

  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }

  if (ws) {
    ws.onclose = null;   // prevent any reconnect / error side-effects
    ws.close();
    ws = null;
  }

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  processing = false;
  lastHands  = [];
  phase      = 'idle';
}
