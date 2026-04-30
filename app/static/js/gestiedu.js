/**
 * GestiEdu — Game Logic
 * Gesture-based educational quiz: answer questions by showing hand gestures.
 * Backend: FastAPI WebSocket on ws://localhost:9876/ws/analyze
 */

// ── Constants ────────────────────────────────────────────────────────────────

const WS_URL          = 'ws://localhost:9876/ws/analyze';
const HOLD_DURATION   = 1800;  // ms to hold gesture to confirm answer
const READING_DELAY   = 2000;  // ms before gesture detection activates on new question
const FEEDBACK_DURATION = 1500; // ms to show correct/incorrect feedback
const CIRCUMFERENCE   = 2 * Math.PI * 44; // SVG arc circumference (r=44)

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const FINGERTIPS = [4, 8, 12, 16, 20];

const FINGER_EMOJI = { 1: '☝️', 2: '✌️', 3: '🤟', 4: '🖐️', 5: '✋' };

// ── Questions ────────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    type: 'counting', subject: 'Matemáticas', emoji: '📚',
    visual: '⭐⭐⭐', text: '¿Cuántas estrellas hay?',
    answer: 3, hint: 'Muestra 3 dedos ✋',
  },
  {
    type: 'truefalse', subject: 'Matemáticas', emoji: '🔢',
    text: '¿2 + 2 = 4?',
    answer: true, hint: '👍 Verdadero  ·  ✊ Falso',
  },
  {
    type: 'counting', subject: 'Ciencias', emoji: '🌿',
    visual: '🐶🐱🐭🐹', text: '¿Cuántos animales hay?',
    answer: 4, hint: 'Muestra 4 dedos ✋',
  },
  {
    type: 'choice', subject: 'Ciencias', emoji: '🌿',
    text: '¿Qué animal puede volar?',
    options: ['🐟 Pez', '🦅 Águila', '🐕 Perro'], answer: 2,
    hint: '☝️ Pez  ·  ✌️ Águila  ·  🤟 Perro',
  },
  {
    type: 'truefalse', subject: 'Ciencias', emoji: '🌿',
    text: '¿El sol sale por la noche?',
    answer: false, hint: '👍 Verdadero  ·  ✊ Falso',
  },
  {
    type: 'counting', subject: 'Matemáticas', emoji: '📚',
    visual: '🍎🍊🍋🍇🍓', text: '¿Cuántas frutas hay?',
    answer: 5, hint: 'Muestra 5 dedos ✋',
  },
  {
    type: 'choice', subject: 'Lengua', emoji: '📖',
    text: '¿Cuál es la fruta amarilla?',
    options: ['🍎 Manzana', '🍌 Banano', '🍇 Uvas'], answer: 2,
    hint: '☝️ Manzana  ·  ✌️ Banano  ·  🤟 Uvas',
  },
  {
    type: 'truefalse', subject: 'Matemáticas', emoji: '🔢',
    text: '¿3 + 3 = 6?',
    answer: true, hint: '👍 Verdadero  ·  ✊ Falso',
  },
  {
    type: 'counting', subject: 'Matemáticas', emoji: '📚',
    visual: '🌟🌟', text: '¿Cuántas estrellas ves?',
    answer: 2, hint: 'Muestra 2 dedos ✌️',
  },
  {
    type: 'choice', subject: 'Ciencias', emoji: '🌿',
    text: '¿Qué necesita una planta para crecer?',
    options: ['💧 Agua y sol', '🍕 Pizza', '📱 Celular'], answer: 1,
    hint: '☝️ Agua y sol  ·  ✌️ Pizza  ·  🤟 Celular',
  },
];

// ── Game state ────────────────────────────────────────────────────────────────

const GAME = {
  state: 'idle',        // idle | reading | detecting | confirming | feedback | results
  qIndex: 0,
  score: 0,
  correctCount: 0,
  results: [],          // [{correct, gestureUsed, expected}]
  holdStart: null,
  currentAnswer: null,
  readingTimer: null,
  feedbackTimer: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

let video, videoCanvas, overlayCanvas, videoCtx, overlayCtx;
let gestureEmoji, gestureName, progressFill, qNum, qTotal;
let scoreDisplay, questionCard, qSubject, qVisual, qText, qOptions, qHint;
let feedbackOverlay, feedbackIcon, feedbackText, feedbackDetail;
let arcFill;

// ── WebSocket + webcam ────────────────────────────────────────────────────────

let ws     = null;
let stream = null;
let animFrame = null;
let processing = false;

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM
  video          = document.getElementById('video');
  videoCanvas    = document.getElementById('video-canvas');
  overlayCanvas  = document.getElementById('overlay-canvas');
  videoCtx       = videoCanvas.getContext('2d');
  overlayCtx     = overlayCanvas.getContext('2d');
  gestureEmoji   = document.getElementById('gesture-emoji');
  gestureName    = document.getElementById('gesture-name');
  progressFill   = document.getElementById('progress-fill');
  qNum           = document.getElementById('q-num');
  qTotal         = document.getElementById('q-total');
  scoreDisplay   = document.getElementById('score-display');
  questionCard   = document.getElementById('question-card');
  qSubject       = document.getElementById('q-subject');
  qVisual        = document.getElementById('q-visual');
  qText          = document.getElementById('q-text');
  qOptions       = document.getElementById('q-options');
  qHint          = document.getElementById('q-hint');
  feedbackOverlay = document.getElementById('feedback-overlay');
  feedbackIcon   = document.getElementById('feedback-icon');
  feedbackText   = document.getElementById('feedback-text');
  feedbackDetail = document.getElementById('feedback-detail');
  arcFill        = document.getElementById('arc-fill');

  // Initialise SVG arc (empty ring at start)
  arcFill.style.strokeDasharray  = CIRCUMFERENCE;
  arcFill.style.strokeDashoffset = CIRCUMFERENCE;

  // Set dynamic total
  if (qTotal) qTotal.textContent = QUESTIONS.length;

  // Button listeners
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', restartGame);
  document.getElementById('btn-moodle').addEventListener('click', showMoodleModal);
});

// ── State management ──────────────────────────────────────────────────────────

function showState(id) {
  document.querySelectorAll('.game-state').forEach(el => el.classList.remove('active'));
  document.getElementById(`state-${id}`).classList.add('active');

  // Lock/unlock body scroll
  document.body.style.overflow = id === 'game' ? 'hidden' : '';
}

// ── Start / Restart ───────────────────────────────────────────────────────────

function startGame() {
  // Clear any pending timers
  if (GAME.feedbackTimer) { clearTimeout(GAME.feedbackTimer); GAME.feedbackTimer = null; }
  if (GAME.readingTimer)  { clearTimeout(GAME.readingTimer);  GAME.readingTimer  = null; }

  // Reset game state
  GAME.state         = 'idle';
  GAME.qIndex        = 0;
  GAME.score         = 0;
  GAME.correctCount  = 0;
  GAME.results       = [];
  GAME.holdStart     = null;
  GAME.currentAnswer = null;

  // Reset score display
  if (scoreDisplay) scoreDisplay.textContent = '0';

  // Reset arc
  updateHoldArc(0);

  // Reset gesture display
  updateGestureDisplay(null);

  // Hide feedback overlay
  hideFeedback();

  showState('game');
  startCamera();
  loadQuestion(0);
}

function restartGame() {
  stopCamera();
  startGame();
}

// ── Camera ────────────────────────────────────────────────────────────────────

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    video.srcObject = stream;

    await new Promise(resolve => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    });

    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;

    videoCanvas.width    = w;
    videoCanvas.height   = h;
    overlayCanvas.width  = w;
    overlayCanvas.height = h;

    connectWS();
    startLoop();
  } catch (err) {
    showCameraError(err.message);
  }
}

function stopCamera() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (stream)    { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (ws)        { ws.onclose = null; ws.close(); ws = null; }
  processing = false;

  // Clear canvases
  if (videoCtx)   videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function showCameraError(msg) {
  // Remove any existing overlay
  const existing = document.getElementById('camera-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'camera-overlay';
  overlay.className = 'camera-overlay';
  overlay.innerHTML = `
    <div class="camera-card">
      <span class="camera-icon">📷</span>
      <h3>Cámara no disponible</h3>
      <p>${msg || 'No se pudo acceder a la cámara. Por favor, permite el acceso en tu navegador e intenta de nuevo.'}</p>
      <button class="btn-cam-ok" id="btn-cam-dismiss">Volver al inicio</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('btn-cam-dismiss').addEventListener('click', () => {
    overlay.remove();
    showState('idle');
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => { /* ready */ };

    ws.onclose = () => {
      if (GAME.state === 'detecting' || GAME.state === 'confirming') {
        // Connection lost mid-game — reset hold
        resetHold();
        updateGestureDisplay(null);
      }
    };

    ws.onerror = () => {
      console.warn('GestiEdu: WebSocket error — is the backend running on port 9876?');
    };

    ws.onmessage = handleWSMessage;
  } catch (err) {
    console.error('GestiEdu: Could not create WebSocket:', err.message);
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────

function startLoop() {
  function loop() {
    animFrame = requestAnimationFrame(loop);

    if (!stream || video.readyState < 2) return;

    // Draw mirrored video to video-canvas
    videoCtx.save();
    videoCtx.translate(videoCanvas.width, 0);
    videoCtx.scale(-1, 1);
    videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
    videoCtx.restore();

    // Send frame to backend when active
    const shouldSend = (
      GAME.state === 'reading' ||
      GAME.state === 'detecting' ||
      GAME.state === 'confirming'
    );

    if (!processing && shouldSend && ws && ws.readyState === WebSocket.OPEN) {
      processing = true;
      const b64 = videoCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      ws.send(JSON.stringify({ frame: b64 }));
    }
  }

  loop();
}

// ── WebSocket message handler ─────────────────────────────────────────────────

function handleWSMessage(event) {
  processing = false;

  // Only act on messages during detecting / confirming phases
  if (GAME.state !== 'detecting' && GAME.state !== 'confirming') return;

  let data;
  try { data = JSON.parse(event.data); } catch (_) { return; }

  const hands = data.hands ?? [];

  // Draw skeleton overlay on every detected hand
  drawSkeletonOverlay(hands);

  if (hands.length === 0) {
    resetHold();
    updateGestureDisplay(null);
    if (GAME.state === 'confirming') GAME.state = 'detecting';
    return;
  }

  const hand   = hands[0];
  const answer = extractAnswer(hand.gesture, hand.finger_count);

  updateGestureDisplay(answer);

  const q     = QUESTIONS[GAME.qIndex];
  const valid = answer !== null && isAnswerValidForQuestion(answer, q);

  if (!valid) {
    resetHold();
    if (GAME.state === 'confirming') GAME.state = 'detecting';
    return;
  }

  // If the held answer changed, restart the hold
  if (GAME.currentAnswer !== null && GAME.currentAnswer.value !== answer.value) {
    resetHold();
  }

  // Start or continue hold
  if (GAME.holdStart === null) {
    GAME.holdStart     = Date.now();
    GAME.currentAnswer = answer;
    GAME.state         = 'confirming';
  }

  const elapsed  = Date.now() - GAME.holdStart;
  const progress = Math.min(elapsed / HOLD_DURATION, 1);
  updateHoldArc(progress);

  if (progress >= 1) {
    submitAnswer(answer);
  }
}

// ── Answer logic ──────────────────────────────────────────────────────────────

/**
 * Map a gesture + fingerCount to an answer object.
 * Returns { value, label, emoji } or null.
 */
function extractAnswer(gesture, fingerCount) {
  if (gesture === 'thumbs_up') {
    return { value: true,  label: 'VERDADERO', emoji: '👍' };
  }
  if (gesture === 'fist') {
    return { value: false, label: 'FALSO',     emoji: '✊' };
  }
  if (fingerCount >= 1 && fingerCount <= 5) {
    return {
      value: fingerCount,
      label: `${fingerCount} dedo${fingerCount > 1 ? 's' : ''}`,
      emoji: FINGER_EMOJI[fingerCount],
    };
  }
  return null;
}

/**
 * Check whether an extracted answer matches what the current question expects.
 */
function isAnswerValidForQuestion(answer, question) {
  switch (question.type) {
    case 'counting':
      return typeof answer.value === 'number' && answer.value === question.answer;
    case 'truefalse':
      return typeof answer.value === 'boolean' && answer.value === question.answer;
    case 'choice':
      return typeof answer.value === 'number' && answer.value === question.answer;
    default:
      return false;
  }
}

/** Return the emoji representing the correct answer for a question. */
function getExpectedEmoji(question) {
  switch (question.type) {
    case 'counting':  return FINGER_EMOJI[question.answer] ?? String(question.answer);
    case 'truefalse': return question.answer ? '👍' : '✊';
    case 'choice':    return FINGER_EMOJI[question.answer] ?? String(question.answer);
    default:          return '❓';
  }
}

// ── Question loading ──────────────────────────────────────────────────────────

function loadQuestion(index) {
  const q = QUESTIONS[index];

  // Progress bar
  const pct = (index / QUESTIONS.length) * 100;
  progressFill.style.width = `${pct}%`;
  qNum.textContent          = index + 1;

  // Subject tag
  qSubject.textContent = `${q.emoji} ${q.subject}`;

  // Visual (counting questions only)
  if (q.visual) {
    qVisual.textContent    = q.visual;
    qVisual.style.display  = 'block';
  } else {
    qVisual.textContent    = '';
    qVisual.style.display  = 'none';
  }

  // Question text
  qText.textContent = q.text;

  // Options (choice questions only)
  if (q.type === 'choice' && q.options) {
    let html = '<div class="choice-options">';
    q.options.forEach((opt, i) => {
      const num   = i + 1;
      const emoji = FINGER_EMOJI[num] ?? String(num);
      html += `
        <div class="choice-option">
          <span class="finger-num">${num}</span>
          <span>${emoji} ${opt}</span>
        </div>`;
    });
    html += '</div>';
    qOptions.innerHTML = html;
  } else {
    qOptions.innerHTML = '';
  }

  // Hint
  qHint.textContent = q.hint;

  // Slide-in animation
  questionCard.style.animation = 'none';
  questionCard.offsetHeight; // force reflow
  questionCard.style.animation = 'slideIn 0.4s ease';

  // Reading delay before gesture detection starts
  GAME.state = 'reading';
  if (GAME.readingTimer) clearTimeout(GAME.readingTimer);
  GAME.readingTimer = setTimeout(() => {
    if (GAME.state === 'reading') GAME.state = 'detecting';
  }, READING_DELAY);
}

// ── Submit + Feedback ─────────────────────────────────────────────────────────

function submitAnswer(answer) {
  // Guard: prevent double-submit
  if (GAME.state === 'feedback' || GAME.state === 'results') return;

  GAME.state = 'feedback';
  resetHold();

  const q       = QUESTIONS[GAME.qIndex];
  const correct = isAnswerValidForQuestion(answer, q);

  if (correct) {
    GAME.score++;
    GAME.correctCount++;
  }

  GAME.results.push({
    correct,
    gestureUsed: answer.emoji,
    expected:    getExpectedEmoji(q),
  });

  // Update live score
  scoreDisplay.textContent = GAME.score;

  showFeedback(correct, answer, q);

  if (GAME.feedbackTimer) clearTimeout(GAME.feedbackTimer);
  GAME.feedbackTimer = setTimeout(nextQuestion, FEEDBACK_DURATION);
}

function showFeedback(correct, answer, question) {
  feedbackOverlay.classList.remove('correct', 'incorrect', 'show');
  feedbackOverlay.classList.add(correct ? 'correct' : 'incorrect');

  feedbackIcon.textContent = correct ? '✅' : '❌';
  feedbackText.textContent = correct ? '¡Correcto! 🎉' : '¡Casi! 💪';

  if (!correct) {
    const expected = getExpectedEmoji(question);
    feedbackDetail.textContent = `La respuesta era: ${expected}`;
  } else {
    feedbackDetail.textContent = '';
  }

  // Force reflow so transition triggers
  feedbackOverlay.offsetHeight;
  feedbackOverlay.classList.add('show');
}

function hideFeedback() {
  feedbackOverlay.classList.remove('show', 'correct', 'incorrect');
}

function nextQuestion() {
  hideFeedback();
  resetHold();

  GAME.qIndex++;

  if (GAME.qIndex >= QUESTIONS.length) {
    showResults();
  } else {
    loadQuestion(GAME.qIndex);
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

function showResults() {
  stopCamera();
  showState('results');

  const total   = QUESTIONS.length;
  const correct = GAME.correctCount;

  document.getElementById('results-score').textContent = `${correct} / ${total}`;

  // Grade
  let grade, gradeClass, trophy;
  if (correct >= 9) {
    grade = 'A 🌟'; gradeClass = 'grade-a'; trophy = '🏆';
  } else if (correct >= 7) {
    grade = 'B 🎉'; gradeClass = 'grade-b'; trophy = '🎉';
  } else if (correct >= 5) {
    grade = 'C 👍'; gradeClass = 'grade-c'; trophy = '👍';
  } else {
    grade = 'D 💪'; gradeClass = 'grade-d'; trophy = '💪';
  }

  document.getElementById('results-trophy').textContent = trophy;
  const gradeBadge = document.getElementById('grade-badge');
  gradeBadge.textContent = grade;
  gradeBadge.className   = `grade-badge ${gradeClass}`;

  // Fill progress bar to 100 %
  progressFill.style.width = '100%';

  // Answers grid
  let gridHtml = '';
  GAME.results.forEach((r, i) => {
    const title = r.correct
      ? `Q${i + 1}: ✓`
      : `Q${i + 1}: mostraste ${r.gestureUsed}, esperado ${r.expected}`;
    gridHtml += `<div class="answer-dot ${r.correct ? 'ok' : 'fail'}" title="${title}">
      ${r.correct ? '✓' : '✗'}
    </div>`;
  });
  document.getElementById('answers-grid').innerHTML = gridHtml;
}

// ── Moodle (placeholder) ──────────────────────────────────────────────────────

function showMoodleModal() {
  const total   = QUESTIONS.length;
  const correct = GAME.correctCount;
  alert(`Integración con Moodle disponible próximamente.\nResultado: ${correct}/${total}`);
}

// ── Hold arc ──────────────────────────────────────────────────────────────────

function updateHoldArc(progress) {
  arcFill.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

function resetHold() {
  GAME.holdStart     = null;
  GAME.currentAnswer = null;
  updateHoldArc(0);
}

// ── Gesture display ───────────────────────────────────────────────────────────

function updateGestureDisplay(answer) {
  gestureEmoji.textContent = answer?.emoji  ?? '🤔';
  gestureName.textContent  = answer?.label  ?? 'Sin gesto detectado';
}

// ── Skeleton overlay ──────────────────────────────────────────────────────────

function drawSkeletonOverlay(hands) {
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  overlayCtx.clearRect(0, 0, w, h);

  for (const hand of hands) {
    const lm = hand.landmarks ?? [];
    if (lm.length < 21) continue;

    const px = p => p.x * w;
    const py = p => p.y * h;

    // Connections
    overlayCtx.strokeStyle = 'rgba(0, 255, 136, 0.7)';
    overlayCtx.lineWidth   = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(px(lm[a]), py(lm[a]));
      overlayCtx.lineTo(px(lm[b]), py(lm[b]));
      overlayCtx.stroke();
    }

    // Landmark dots
    for (let i = 0; i < lm.length; i++) {
      const x     = px(lm[i]);
      const y     = py(lm[i]);
      const isTip = FINGERTIPS.includes(i);

      overlayCtx.beginPath();
      overlayCtx.arc(x, y, isTip ? 7 : 4, 0, Math.PI * 2);
      overlayCtx.fillStyle = isTip ? '#00cfff' : '#ef4444';
      overlayCtx.fill();
    }
  }
}
