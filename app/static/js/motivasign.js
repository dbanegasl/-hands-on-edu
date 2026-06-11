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

const HOLD_TIME         = 1500;   // ms holding correct gesture → confirm
const READING_DELAY     = 2500;   // ms to display sign before detection starts
const CHALLENGE_TIMEOUT = 6000;   // ms of detecting phase before auto-fail (challenge)
const FEEDBACK_DURATION = 1200;   // ms to show feedback overlay
const RING_CIRC         = 314;    // stroke-dasharray ≈ 2π×50
const MIN_CONFIDENCE    = 0.6;    // ignore low-confidence hands

// Waving detection (distinguishes HOLA/ADIÓS from a static open hand).
const WAVE_WINDOW_MS    = 1000;   // wrist-x history kept for this long
const WAVE_MIN_REVERSALS = 2;     // ≥ 2 direction reversals = a wave
const WAVE_MIN_AMPLITUDE = 0.04;  // normalized horizontal travel per swing

const SIGNS = [
  { id: 'uno',    label: '1',           emoji: '☝️',  gesture: 'pointing',    hint: 'Levanta el dedo índice' },
  { id: 'dos',    label: '2',           emoji: '✌️',  gesture: 'peace',       hint: 'Índice y medio arriba' },
  { id: 'tres',   label: '3',           emoji: '3️⃣',  gesture: '3_fingers',   hint: 'Índice, medio y anular arriba' },
  { id: 'cuatro', label: '4',           emoji: '4️⃣',  gesture: '4_fingers',   hint: 'Cuatro dedos arriba, pulgar recogido' },
  { id: 'cinco',  label: '5',           emoji: '🖐️', gesture: 'open_hand',   hint: 'Toda la mano abierta (5 dedos)' },
  { id: 'stop',   label: 'STOP',        emoji: '✋',  gesture: 'open_hand',   hint: 'Mano abierta y quieta frente a ti' },
  { id: 'bien',   label: 'BIEN 👍',     emoji: '👍',  gesture: 'thumbs_up',   hint: 'Pulgar arriba' },
  { id: 'no',     label: 'NO ✊',       emoji: '✊',  gesture: 'fist',        hint: 'Cierra el puño' },
  { id: 'hola',   label: 'HOLA 👋',    emoji: '👋',  gesture: 'open_hand',   motion: 'wave', hint: 'Mano abierta y agita de lado a lado' },
  { id: 'amor',   label: 'TE AMO 🤟',  emoji: '🤟',  gesture: 'i_love_you',  hint: 'Pulgar, índice y meñique arriba' },
  { id: 'paz',    label: 'PAZ ✌️',     emoji: '✌️',  gesture: 'peace',       hint: 'Índice y medio en V' },
  { id: 'apunta', label: 'APUNTA ☝️',  emoji: '☝️',  gesture: 'pointing',    hint: 'Señala con el índice' },
  { id: 'ok',     label: 'OK 👌',      emoji: '👌',  gesture: 'ok',          hint: 'Pulgar e índice formando un círculo' },
  { id: 'adios',  label: 'ADIÓS 👋',   emoji: '👋',  gesture: 'open_hand',   motion: 'wave', hint: 'Abre la mano y agita para despedirte' },
  { id: 'bravo',  label: 'BRAVO 🤙',   emoji: '🤙',  gesture: 'shaka',       hint: 'Pulgar y meñique arriba (cuernitos)' },
];

// ── Audio ─────────────────────────────────────────────────────────────────────

const audio = new AudioFeedback();

// ── State ─────────────────────────────────────────────────────────────────────

let socket       = null;
let stream       = null;
let animFrame    = null;
let lastHands    = [];
let wristHistory = [];   // [{t, x}] recent wrist-x samples for wave detection

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
    wristHistory = [];
    if (phase === 'confirming') resetHold();
    return;
  }

  const hand = hands[0];
  const gesture = hand.gesture ?? '';
  elGestureBadge.textContent = HO.gestureLabel(gesture);

  // Track wrist horizontal motion for wave-based signs (HOLA / ADIÓS).
  trackWrist(hand);

  const matches = gestureMatches(sign, hand);

  if (phase === 'detecting') {
    if (matches) {
      // Correct sign detected — enter confirming phase
      phase     = 'confirming';
      holdStart = Date.now();
      elHoldRing.style.display = 'block';
      elStatusMsg.textContent  = '💪 ¡Mantén la seña!';
    }
  } else if (phase === 'confirming') {
    // Wave signs keep their handshape during the wave, so only break the hold
    // when the static handshape itself is lost.
    if (gesture !== sign.gesture) {
      resetHold();
    }
    // Hold progress is time-driven in the RAF loop (tickHoldRing)
  }
}

/** Whether the detected hand satisfies the target sign (handshape + motion). */
function gestureMatches(sign, hand) {
  if ((hand.gesture ?? '') !== sign.gesture) return false;
  if (sign.motion === 'wave') return isWaving();
  return true;
}

function trackWrist(hand) {
  const lm = hand.landmarks;
  if (!lm || lm.length < 1) return;
  const now = Date.now();
  wristHistory.push({ t: now, x: lm[0].x });
  while (wristHistory.length && now - wristHistory[0].t > WAVE_WINDOW_MS) {
    wristHistory.shift();
  }
}

/** Detect a side-to-side wave: enough direction reversals with real amplitude. */
function isWaving() {
  if (wristHistory.length < 4) return false;
  let reversals = 0;
  let dir = 0;           // last movement direction (+1/-1)
  let pivotX = wristHistory[0].x;
  for (let i = 1; i < wristHistory.length; i++) {
    const dx = wristHistory[i].x - wristHistory[i - 1].x;
    const newDir = dx > 0 ? 1 : (dx < 0 ? -1 : dir);
    if (dir !== 0 && newDir !== dir &&
        Math.abs(wristHistory[i - 1].x - pivotX) >= WAVE_MIN_AMPLITUDE) {
      reversals++;
      pivotX = wristHistory[i - 1].x;
    }
    if (newDir !== dir && newDir !== 0) dir = newDir;
  }
  return reversals >= WAVE_MIN_REVERSALS;
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
  socket = new HO.HandSocket({
    onResult: (data) => {
      lastHands = (data.hands ?? []).filter(
        (h) => typeof h.confidence !== 'number' || h.confidence >= MIN_CONFIDENCE
      );
      processGesture(lastHands);
    },
  });
  socket.connect();
}

// ── Render loop ───────────────────────────────────────────────────────────────

function startLoop() {
  function loop() {
    animFrame = requestAnimationFrame(loop);

    if (!stream || elVideo.readyState < 2) return;

    // 1. Draw mirrored video frame onto canvas
    HO.drawMirroredVideo(ctx, elVideo, elCanvas.width, elCanvas.height);

    // 2. Capture and send the clean video frame to the backend
    //    (done before landmarks are drawn so backend receives raw video)
    if (socket) socket.sendFrame(elCanvas, 0.6);

    // 3. Draw cached hand landmarks on top
    drawLandmarks(lastHands);

    // 4. Advance hold-ring animation (time-based)
    tickHoldRing();
  }

  loop();
}

// ── Landmark drawing ──────────────────────────────────────────────────────────

function drawLandmarks(hands) {
  for (const hand of hands) {
    HO.drawSkeleton(ctx, hand.landmarks, elCanvas.width, elCanvas.height);
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

  if (socket) {
    socket.close();
    socket = null;
  }

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  lastHands    = [];
  wristHistory = [];
  phase        = 'idle';
}
