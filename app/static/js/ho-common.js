/**
 * HandsOnEdu — shared frontend library (REQ-014)
 *
 * Single source for the WebSocket plumbing, hand-skeleton drawing, mirrored
 * video draw, gesture labels and signal filters that every module used to
 * duplicate. Exposed as `window.HO`. Load before any module script:
 *   <script src="/static/js/ho-common.js"></script>
 */
(function (global) {
  'use strict';

  // ── Hand topology ───────────────────────────────────────────────────────────
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],          // index
    [0, 9], [9, 10], [10, 11], [11, 12],     // middle
    [0, 13], [13, 14], [14, 15], [15, 16],   // ring
    [0, 17], [17, 18], [18, 19], [19, 20],   // pinky
    [5, 9], [9, 13], [13, 17],               // palm cross
  ];
  const FINGERTIPS = [4, 8, 12, 16, 20];

  // ── Spanish gesture labels (badges / UI) ────────────────────────────────────
  const GESTURE_EMOJI = {
    fist: '✊', open_hand: '🖐️', pointing: '☝️', peace: '✌️',
    thumbs_up: '👍', shaka: '🤙', i_love_you: '🤟', ok: '👌',
  };
  const GESTURE_LABELS_ES = {
    fist: 'Puño ✊',
    open_hand: 'Mano abierta 🖐️',
    pointing: 'Señalando ☝️',
    peace: 'Paz ✌️',
    thumbs_up: 'Pulgar arriba 👍',
    shaka: 'Shaka 🤙',
    i_love_you: 'Te amo 🤟',
    ok: 'OK 👌',
  };

  /** Human-readable Spanish label for a gesture string. */
  function gestureLabel(gesture) {
    if (!gesture) return '—';
    if (GESTURE_LABELS_ES[gesture]) return GESTURE_LABELS_ES[gesture];
    // Fallthrough "N_fingers" → "N dedos".
    return gesture.replace(/_fingers$/, ' dedos').replace(/_/g, ' ');
  }

  // ── Drawing helpers ─────────────────────────────────────────────────────────

  /** Draw the mirrored (selfie) video frame onto a canvas context. */
  function drawMirroredVideo(ctx, video, w, h) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  }

  /**
   * Draw a hand skeleton. `landmarks` are normalized; coordinates already match
   * the mirrored canvas because the mirrored frame is what we send to the
   * backend, so x is not flipped again here.
   */
  function drawSkeleton(ctx, landmarks, w, h, opts) {
    if (!landmarks || landmarks.length < 21) return;
    const o = opts || {};
    const lineColor = o.lineColor || 'rgba(0, 255, 136, 0.7)';
    const lineWidth = o.lineWidth || 2;
    const tipColor = o.tipColor || '#00cfff';
    const tipRadius = o.tipRadius || 7;
    const dotColor = o.dotColor || '#ef4444';
    const dotRadius = o.dotRadius || 4;
    const px = (lm) => lm.x * w;
    const py = (lm) => lm.y * h;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const a = landmarks[HAND_CONNECTIONS[i][0]];
      const b = landmarks[HAND_CONNECTIONS[i][1]];
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.stroke();
    }
    for (let i = 0; i < landmarks.length; i++) {
      const isTip = FINGERTIPS.includes(i);
      ctx.beginPath();
      ctx.arc(px(landmarks[i]), py(landmarks[i]), isTip ? tipRadius : dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? tipColor : dotColor;
      ctx.fill();
      if (o.showIndices) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px system-ui';
        ctx.fillText(String(i), px(landmarks[i]) + 5, py(landmarks[i]) - 4);
      }
    }
  }

  // ── HandSocket: managed WebSocket to /ws/analyze ────────────────────────────
  //
  // Handles URL building, the ping-pong `processing` backpressure flag, JSON
  // shape validation, and uniform auto-reconnect with backoff. Replaces the
  // five hand-rolled connectWS() variants (only two of which reconnected).

  function HandSocket(options) {
    options = options || {};
    this._onResult = options.onResult || function () {};
    this._onStatus = options.onStatus || function () {};
    this._url = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws/analyze';
    this._ws = null;
    this._processing = false;
    this._closing = false;
    this._reconnectMs = 1000;
    this._reconnectTimer = null;
  }

  HandSocket.prototype.connect = function () {
    this._closing = false;
    this._open();
  };

  HandSocket.prototype._open = function () {
    this._onStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this._url);
    } catch (_) {
      this._scheduleReconnect();
      return;
    }
    const self = this;

    ws.onopen = function () {
      self._reconnectMs = 1000;
      self._processing = false;
      self._onStatus('connected');
    };
    ws.onclose = function () {
      self._processing = false;
      self._onStatus('disconnected');
      if (!self._closing) self._scheduleReconnect();
    };
    ws.onerror = function () {
      // onclose fires next and handles reconnect.
    };
    ws.onmessage = function (evt) {
      self._processing = false;
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch (_) {
        return;
      }
      if (!data || !Array.isArray(data.hands)) return;
      self._onResult(data);
    };

    this._ws = ws;
  };

  HandSocket.prototype._scheduleReconnect = function () {
    if (this._closing || this._reconnectTimer) return;
    const self = this;
    this._reconnectTimer = setTimeout(function () {
      self._reconnectTimer = null;
      if (!self._closing) self._open();
    }, this._reconnectMs);
    this._reconnectMs = Math.min(this._reconnectMs * 2, 5000);
  };

  HandSocket.prototype.isOpen = function () {
    return this._ws && this._ws.readyState === WebSocket.OPEN;
  };

  HandSocket.prototype.isBusy = function () {
    return this._processing;
  };

  /**
   * Encode the canvas as a JPEG and send it, unless a response is still pending
   * (backpressure) or the socket is not open. Returns true if a frame was sent.
   */
  HandSocket.prototype.sendFrame = function (canvas, quality) {
    if (this._processing || !this.isOpen()) return false;
    this._processing = true;
    const b64 = canvas.toDataURL('image/jpeg', quality == null ? 0.6 : quality).split(',')[1];
    try {
      this._ws.send(JSON.stringify({ frame: b64 }));
    } catch (_) {
      this._processing = false;
      return false;
    }
    return true;
  };

  HandSocket.prototype.close = function () {
    this._closing = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.onmessage = null;
      try { this._ws.close(); } catch (_) {}
      this._ws = null;
    }
    this._processing = false;
  };

  // ── GestureStabilizer: client-side majority vote over N frames ──────────────
  function GestureStabilizer(n, minVotes) {
    this._n = n || 4;
    this._minVotes = minVotes || 3;
    this._buf = [];
    this._last = null;
  }
  GestureStabilizer.prototype.push = function (gesture) {
    this._buf.push(gesture);
    if (this._buf.length > this._n) this._buf.shift();
    const counts = {};
    let top = this._buf[0], topN = 0;
    for (let i = 0; i < this._buf.length; i++) {
      const g = this._buf[i];
      counts[g] = (counts[g] || 0) + 1;
      if (counts[g] > topN) { topN = counts[g]; top = g; }
    }
    if (topN >= this._minVotes) this._last = top;
    return this._last == null ? top : this._last;
  };
  GestureStabilizer.prototype.reset = function () {
    this._buf = [];
    this._last = null;
  };

  // ── OneEuro: low-jitter, low-lag adaptive filter (for cursor smoothing) ─────
  function _LowPass() { this._init = false; this._y = 0; }
  _LowPass.prototype.filter = function (x, alpha) {
    if (!this._init) { this._y = x; this._init = true; }
    else { this._y = alpha * x + (1 - alpha) * this._y; }
    return this._y;
  };

  function OneEuro(opts) {
    opts = opts || {};
    this._minCutoff = opts.minCutoff == null ? 1.2 : opts.minCutoff;
    this._beta = opts.beta == null ? 0.01 : opts.beta;
    this._dCutoff = opts.dCutoff == null ? 1.0 : opts.dCutoff;
    this._x = new _LowPass();
    this._dx = new _LowPass();
    this._lastX = 0;
    this._hasLast = false;
  }
  OneEuro.prototype._alpha = function (cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  };
  OneEuro.prototype.filter = function (x, dt) {
    if (!dt || dt <= 0) dt = 1 / 30;
    const dx = this._hasLast ? (x - this._lastX) / dt : 0;
    this._hasLast = true;
    this._lastX = x;
    const edx = this._dx.filter(dx, this._alpha(this._dCutoff, dt));
    const cutoff = this._minCutoff + this._beta * Math.abs(edx);
    return this._x.filter(x, this._alpha(cutoff, dt));
  };
  OneEuro.prototype.reset = function () {
    this._x = new _LowPass();
    this._dx = new _LowPass();
    this._hasLast = false;
  };

  global.HO = {
    HAND_CONNECTIONS: HAND_CONNECTIONS,
    FINGERTIPS: FINGERTIPS,
    GESTURE_EMOJI: GESTURE_EMOJI,
    GESTURE_LABELS_ES: GESTURE_LABELS_ES,
    gestureLabel: gestureLabel,
    drawMirroredVideo: drawMirroredVideo,
    drawSkeleton: drawSkeleton,
    HandSocket: HandSocket,
    GestureStabilizer: GestureStabilizer,
    OneEuro: OneEuro,
  };
})(window);
