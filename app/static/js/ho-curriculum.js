/**
 * HandsOnEdu — curriculum logic for the Aula de Señas (REQ-018)
 *
 * Pure, DOM-free helpers (testable with `node --test`):
 *  - unit availability / unlocking from the catalog + recognizer + results
 *  - spaced-review selection from per-sign mastery
 *  - fingerspelling tokenization (CH, LL, RR, Ñ digraphs)
 *  - quiz building and grading
 *  - HoldVerifier: "hold the correct sign for N ms" state machine with a
 *    short grace period so one noisy frame does not reset the learner.
 *
 * Browser: window.HO.Curriculum · Node: module.exports
 */
(function (global) {
  'use strict';

  const PASS_RATIO = 0.7;          // quiz score needed to pass a unit
  const MASTERED = 0.8;            // mastery considered "dominada" (matches backend)
  const REVIEW_AFTER_MS = 3 * 24 * 3600 * 1000;
  const QUIZ_ACTIVITY_PREFIX = 'quiz:';

  // ── Fingerspelling ─────────────────────────────────────────────────────────

  const DIGRAPHS = { CH: 'ch', LL: 'll', RR: 'rr' };
  const SPECIAL = { 'Ñ': 'enie', 'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u', 'Ü': 'u' };

  /**
   * Split a word into catalog letter ids ("PERRO" → p, e, rr, o).
   * Returns null if a character has no sign in the catalog.
   */
  function tokenizeWord(word, catalog) {
    const ids = new Set((catalog.signs || []).map((s) => s.id));
    const w = String(word).toUpperCase().replace(/\s+/g, '');
    const out = [];
    for (let i = 0; i < w.length;) {
      const two = w.slice(i, i + 2);
      if (DIGRAPHS[two] && ids.has(DIGRAPHS[two])) { out.push(DIGRAPHS[two]); i += 2; continue; }
      const ch = w[i];
      const id = SPECIAL[ch] || ch.toLowerCase();
      if (!/^[a-z]+$/.test(id) || !ids.has(id)) return null;
      out.push(id);
      i += 1;
    }
    return out.length ? out : null;
  }

  /** Words whose every letter is currently recognizable. */
  function spellableWords(catalog, recognizer) {
    return (catalog.spelling_words || [])
      .map((w) => ({ word: w, letters: tokenizeWord(w, catalog) }))
      .filter((x) => x.letters && x.letters.every((id) => recognizer.isRecognizable(id)));
  }

  // ── Units ──────────────────────────────────────────────────────────────────

  /** Unit ids whose quiz was passed, from GET /api/learners/{id}/sessions. */
  function passedUnits(sessions, ratio) {
    const need = ratio == null ? PASS_RATIO : ratio;
    const out = new Set();
    for (const s of sessions || []) {
      if (!s.ended_at || !s.activity || s.activity.indexOf(QUIZ_ACTIVITY_PREFIX) !== 0) continue;
      if (s.max_score > 0 && s.score / s.max_score >= need) out.add(s.activity.slice(QUIZ_ACTIVITY_PREFIX.length));
    }
    return out;
  }

  /**
   * Status of every unit in catalog order.
   * @param masteryById {sign_id: mastery}
   * @param passed      Set of passed unit ids
   * @returns [{unit, available, pending, mastery, mastered, passed, playable, locked}]
   *
   * Units with no recognizable sign are "próximamente" (not playable) and do
   * not block the path. A playable unit unlocks when the previous playable
   * unit has been passed.
   */
  function unitStatus(catalog, recognizer, masteryById, passed, opts) {
    opts = opts || {};
    const out = [];
    let prevPassed = true;
    for (const unit of catalog.units || []) {
      const available = unit.signs.filter((id) => recognizer.isRecognizable(id));
      const pending = unit.signs.filter((id) => !recognizer.isRecognizable(id));
      const ms = available.map((id) => (masteryById && masteryById[id]) || 0);
      const mastery = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
      const playable = available.length > 0;
      const isPassed = passed ? passed.has(unit.id) : false;
      const locked = playable && !opts.unlockAll && !prevPassed;
      out.push({
        unit: unit, available: available, pending: pending, mastery: mastery,
        mastered: ms.filter((m) => m >= MASTERED).length,
        passed: isPassed, playable: playable, locked: locked,
      });
      if (playable) prevPassed = isPassed;
    }
    return out;
  }

  // ── Spaced review ──────────────────────────────────────────────────────────

  /**
   * Practised signs that need review: not yet mastered, or not seen for a
   * while. Lowest mastery first, then least recently practised.
   * @param progressSigns rows from GET /api/learners/{id}/progress (.signs)
   */
  function pickReview(progressSigns, recognizer, n, now) {
    const t = now == null ? Date.now() : now;
    return (progressSigns || [])
      .filter((s) => recognizer.isRecognizable(s.sign_id))
      .map((s) => ({ s: s, age: t - new Date(s.last_attempt_at).getTime() }))
      .filter((x) => x.s.mastery < MASTERED || x.age > REVIEW_AFTER_MS)
      .sort((a, b) => (a.s.mastery - b.s.mastery) || (b.age - a.age))
      .slice(0, n || 8)
      .map((x) => x.s.sign_id);
  }

  // ── Quiz ───────────────────────────────────────────────────────────────────

  function shuffle(arr, rng) {
    const a = arr.slice();
    const r = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Quiz items: every available sign once (shuffled); small units are padded
   * with repeats up to `minItems`, never the same sign twice in a row.
   */
  function buildQuiz(signIds, minItems, rng) {
    if (!signIds.length) return [];
    const items = shuffle(signIds, rng);
    const target = Math.max(items.length, Math.min(minItems || 5, signIds.length * 2));
    while (items.length < target) {
      const pool = shuffle(signIds, rng).filter((id) => id !== items[items.length - 1]);
      items.push(pool[0] || signIds[0]);
    }
    return items;
  }

  function grade(ratio) {
    if (ratio >= 0.9) return { letter: 'A', label: '¡Excelente!', passed: true };
    if (ratio >= PASS_RATIO) return { letter: 'B', label: '¡Aprobado!', passed: true };
    if (ratio >= 0.5) return { letter: 'C', label: 'Casi lo logras', passed: false };
    return { letter: 'D', label: 'Sigue practicando', passed: false };
  }

  // ── Reference video disclosure ─────────────────────────────────────────────

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /**
   * Whether and how to show a sign's reference video.
   * Learners only see videos validated by an interpreter; teachers also see
   * pending ones. AI-generated videos always carry a visible notice.
   * @returns null | {src, poster, show, validated, aiGenerated, notice}
   */
  function mediaInfo(sign, opts) {
    const m = sign && sign.media;
    if (!m || !m.video) return null;
    const teacher = !!(opts && opts.teacher);
    const validated = !!m.validated_by;
    const parts = [];
    if (m.ai_generated) parts.push('🤖 Video generado con IA');
    if (validated) {
      const when = formatDate(m.validated_at);
      parts.push('✔ Validado por intérprete de LSEC: ' + m.validated_by + (when ? ' (' + when + ')' : ''));
    } else {
      parts.push('⚠️ Pendiente de validación por un intérprete — solo visible para docentes');
    }
    return {
      src: m.video,
      poster: m.poster || '',
      show: validated || teacher,
      validated: validated,
      aiGenerated: !!m.ai_generated,
      notice: parts.join(' · '),
    };
  }

  // ── HoldVerifier ───────────────────────────────────────────────────────────

  /**
   * new HoldVerifier({recognizer, signId, holdMs, graceMs, dynamicEveryMs})
   * Call update(hands, tMs) every frame. Static signs must be held correctly
   * for `holdMs` (drops shorter than `graceMs` are forgiven); dynamic signs
   * complete as soon as DTW verification succeeds.
   */
  function HoldVerifier(opts) {
    this.rec = opts.recognizer;
    this.signId = opts.signId;
    this.sign = this.rec.signs[this.signId] || {};
    this.holdMs = opts.holdMs == null ? 1200 : opts.holdMs;
    this.graceMs = opts.graceMs == null ? 250 : opts.graceMs;
    this.dynamicEveryMs = opts.dynamicEveryMs == null ? 200 : opts.dynamicEveryMs;
    this.reset();
  }

  HoldVerifier.prototype.reset = function () {
    this.holdStart = null;
    this.lastOk = null;
    this.lastDynamic = -Infinity;
    this.done = false;
    this.bestScore = 0;
    this.score = 0;
    this.feedback = [];
    this.rec.clearHistory();
  };

  HoldVerifier.prototype.update = function (hands, t) {
    hands = hands || [];
    if (this.done) return this._state(t);
    this.rec.pushFrame(hands, t);

    if (this.sign.kind === 'dynamic') {
      if (t - this.lastDynamic < this.dynamicEveryMs) return this._state(t);
      this.lastDynamic = t;
    }
    const res = (hands.length || this.sign.kind === 'dynamic')
      ? this.rec.verify(hands, this.signId)
      : { ok: false, score: 0, feedback: [] };
    this.score = 0.6 * this.score + 0.4 * res.score;
    this.bestScore = Math.max(this.bestScore, res.score);
    if (res.feedback && res.feedback.length) this.feedback = res.feedback;
    if (res.ok) this.feedback = [];

    if (this.sign.kind === 'dynamic') {
      if (res.ok) this.done = true;
      return this._state(t);
    }
    if (res.ok) {
      if (this.holdStart == null) this.holdStart = t;
      this.lastOk = t;
      if (t - this.holdStart >= this.holdMs) this.done = true;
    } else if (this.holdStart != null && t - this.lastOk > this.graceMs) {
      this.holdStart = null;
    }
    return this._state(t);
  };

  HoldVerifier.prototype._state = function (t) {
    const progress = this.done ? 1 : this.holdStart == null ? 0 : Math.min(1, (t - this.holdStart) / this.holdMs);
    return {
      done: this.done,
      holding: this.holdStart != null && !this.done,
      progress: progress,
      score: this.score,
      bestScore: this.bestScore,
      feedback: this.feedback,
    };
  };

  const api = {
    PASS_RATIO: PASS_RATIO,
    MASTERED: MASTERED,
    QUIZ_ACTIVITY_PREFIX: QUIZ_ACTIVITY_PREFIX,
    tokenizeWord: tokenizeWord,
    spellableWords: spellableWords,
    passedUnits: passedUnits,
    unitStatus: unitStatus,
    pickReview: pickReview,
    shuffle: shuffle,
    buildQuiz: buildQuiz,
    grade: grade,
    mediaInfo: mediaInfo,
    HoldVerifier: HoldVerifier,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    global.HO = global.HO || {};
    global.HO.Curriculum = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
