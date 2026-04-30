/**
 * AudioFeedback — Web Audio API feedback module for HandsOnEdu
 *
 * Generates all sounds programmatically (zero external assets, works offline).
 * AudioContext is lazily created on first play() call to comply with browser
 * autoplay policy (requires a prior user gesture).
 *
 * Supported sounds:
 *   GestiEdu : 'ding' | 'buzz' | 'tick' | 'fanfare'
 *   MotivaSign: 'pop'  | 'chime' | 'beep'
 *
 * Usage:
 *   const audio = new AudioFeedback();
 *   audio.play('ding');
 *   audio.setVolume(0.5);  // 0.0 – 1.0
 *   audio.mute();
 *   audio.unmute();
 *   audio.isMuted();       // boolean
 *
 * Mute state is persisted in localStorage under 'handsonedu_audio_muted'.
 * If the user has prefers-reduced-motion enabled, volume defaults to 20%.
 */

class AudioFeedback {
  constructor() {
    this._ctx     = null;
    this._volume  = 1.0;
    this._muted   = localStorage.getItem('handsonedu_audio_muted') === 'true';

    // Respect reduced-motion preference: lower default volume
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this._volume = 0.2;
    }
  }

  // ── Context (lazy, created only after user gesture) ───────────────────────

  _getContext() {
    if (!this._ctx) this._ctx = new AudioContext();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // ── Primitive oscillator beep ─────────────────────────────────────────────

  /**
   * @param {number} freq      - Frequency in Hz
   * @param {number} duration  - Duration in seconds
   * @param {string} type      - OscillatorType (sine|square|sawtooth|triangle)
   * @param {number} vol       - Relative volume multiplier (0.0 – 1.0)
   * @param {number} delay     - Start delay in seconds (default 0)
   */
  _beep(freq, duration, type = 'sine', vol = 1.0, delay = 0) {
    if (this._muted) return;
    const ctx  = this._getContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = freq;
    osc.type = type;

    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(this._volume * vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.start(t0);
    osc.stop(t0 + duration);
  }

  // ── Sound definitions ─────────────────────────────────────────────────────

  /** Correct answer — short bright ping (880 Hz, 150 ms) */
  _ding() {
    this._beep(880, 0.15, 'sine', 1.0);
  }

  /** Wrong answer — low buzz (200 Hz sawtooth, 200 ms) */
  _buzz() {
    this._beep(200, 0.20, 'sawtooth', 0.7);
  }

  /** Hold-progress tick — soft click (1000 Hz square, 50 ms) */
  _tick() {
    this._beep(1000, 0.05, 'square', 0.3);
  }

  /** End-of-quiz fanfare — ascending triad Do-Mi-Sol (C5-E5-G5) */
  _fanfare() {
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      this._beep(freq, 0.22, 'sine', 0.8, i * 0.16);
    });
  }

  /** Gesture confirmed — soft bubble pop (600 Hz, 80 ms) */
  _pop() {
    this._beep(600, 0.08, 'sine', 0.8);
  }

  /** Level / challenge complete — bright chime (1200 Hz, 300 ms) */
  _chime() {
    this._beep(1200, 0.30, 'sine', 0.7);
  }

  /** Wrong sign — non-intrusive beep (400 Hz, 100 ms, 30% volume) */
  _beepSoft() {
    this._beep(400, 0.10, 'sine', 0.3);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Play a named sound.
   * Safe to call before user gesture — will silently skip if context
   * creation is blocked (e.g. called in DOMContentLoaded without a click).
   * @param {'ding'|'buzz'|'tick'|'fanfare'|'pop'|'chime'|'beep'} sound
   */
  play(sound) {
    try {
      switch (sound) {
        case 'ding':    this._ding();     break;
        case 'buzz':    this._buzz();     break;
        case 'tick':    this._tick();     break;
        case 'fanfare': this._fanfare();  break;
        case 'pop':     this._pop();      break;
        case 'chime':   this._chime();    break;
        case 'beep':    this._beepSoft(); break;
        default: console.warn(`AudioFeedback: unknown sound "${sound}"`);
      }
    } catch (err) {
      // Never crash the game over audio issues
      console.warn('AudioFeedback: could not play sound:', err.message);
    }
  }

  /** Set master volume (0.0 – 1.0). Applies to all future sounds. */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
  }

  /** Mute all audio and persist choice in localStorage. */
  mute() {
    this._muted = true;
    localStorage.setItem('handsonedu_audio_muted', 'true');
  }

  /** Unmute and persist choice in localStorage. */
  unmute() {
    this._muted = false;
    localStorage.setItem('handsonedu_audio_muted', 'false');
  }

  /** @returns {boolean} True if currently muted. */
  isMuted() {
    return this._muted;
  }
}
