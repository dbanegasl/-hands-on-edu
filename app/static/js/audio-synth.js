/**
 * MusicSynth — polyphonic Web Audio synthesizer for AirPiano (REQ-012).
 *
 * Generates 4 timbres via OscillatorNode + GainNode + (optional) BiquadFilter.
 * Each noteOn() spawns its own oscillator+gain so up to N notes can sound
 * simultaneously (polyphony bounded only by the AudioContext).
 *
 * Envelopes (ADSR) per instrument are tuned in INSTRUMENTS below.
 *
 * Usage:
 *   const synth = new MusicSynth();
 *   synth.setInstrument('piano');
 *   synth.noteOn(60);   // C4
 *   synth.noteOff(60);
 *   synth.allOff();
 *   synth.mute() / unmute() / isMuted();
 *   synth.getAnalyser();   // AnalyserNode for waveform visualization
 *
 * Mute state is persisted in the SAME localStorage key as audio.js
 * ('handsonedu_audio_muted') so the global mute button works for both.
 */

const INSTRUMENTS = {
  piano: {
    oscType: 'sine',
    harmonics: [
      { ratio: 1.0, gain: 0.7 },
      { ratio: 2.0, gain: 0.18, type: 'sine' },
      { ratio: 3.0, gain: 0.08, type: 'triangle' },
    ],
    adsr: { a: 0.010, d: 0.200, s: 0.60, r: 0.800 },
    filter: null,
  },
  marimba: {
    oscType: 'triangle',
    harmonics: [
      { ratio: 1.0, gain: 0.85 },
      { ratio: 4.0, gain: 0.10, type: 'sine' },
    ],
    adsr: { a: 0.002, d: 0.400, s: 0.0, r: 0.400 },
    filter: null,
  },
  synth: {
    oscType: 'sawtooth',
    harmonics: [
      { ratio: 1.0, gain: 0.55 },
      { ratio: 1.005, gain: 0.30, type: 'sawtooth' }, // detuned for fatness
    ],
    adsr: { a: 0.050, d: 0.100, s: 0.80, r: 0.300 },
    filter: { type: 'lowpass', frequency: 1800, q: 4 },
  },
  strings: {
    oscType: 'sine',
    harmonics: [
      { ratio: 1.0, gain: 0.55 },
      { ratio: 2.0, gain: 0.20, type: 'sine' },
      { ratio: 3.0, gain: 0.10, type: 'triangle' },
    ],
    adsr: { a: 0.300, d: 0.100, s: 0.90, r: 1.500 },
    filter: null,
    lfo: { frequency: 5.0, depth: 4.0 }, // vibrato in Hz of pitch deviation
  },
};

class MusicSynth {
  constructor() {
    this._ctx        = null;
    this._master     = null;
    this._analyser   = null;
    this._activeNotes = new Map(); // midiNote → { nodes:[], stopAt }
    this._instrument = 'piano';
    this._volume     = 0.6;
    this._muted      = localStorage.getItem('handsonedu_audio_muted') === 'true';

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this._volume = 0.3;
    }
  }

  // ── Context (lazy, autoplay policy) ─────────────────────────────────────────

  _getContext() {
    if (!this._ctx) {
      this._ctx     = new (window.AudioContext || window.webkitAudioContext)();
      this._master  = this._ctx.createGain();
      this._master.gain.value = this._muted ? 0 : this._volume;
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 1024;
      this._master.connect(this._analyser);
      this._analyser.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // ── Pitch math ──────────────────────────────────────────────────────────────

  static midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ── noteOn ──────────────────────────────────────────────────────────────────

  noteOn(midiNote, velocity = 0.7) {
    if (this._muted) return;
    const ctx = this._getContext();
    if (!ctx) return;

    // If the same note is already on, release the previous voice cleanly first
    if (this._activeNotes.has(midiNote)) {
      this.noteOff(midiNote);
    }

    const cfg = INSTRUMENTS[this._instrument] || INSTRUMENTS.piano;
    const freq = MusicSynth.midiToFreq(midiNote);
    const now = ctx.currentTime;
    const { a, d, s, r } = cfg.adsr;

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(velocity, now + a);
    voiceGain.gain.linearRampToValueAtTime(velocity * s, now + a + d);

    let downstream = voiceGain;
    if (cfg.filter) {
      const filt = ctx.createBiquadFilter();
      filt.type = cfg.filter.type;
      filt.frequency.value = cfg.filter.frequency;
      filt.Q.value = cfg.filter.q;
      voiceGain.connect(filt);
      downstream = filt;
    }
    downstream.connect(this._master);

    const oscillators = [];
    cfg.harmonics.forEach((h) => {
      const osc = ctx.createOscillator();
      osc.type = h.type || cfg.oscType;
      osc.frequency.value = freq * h.ratio;

      const harmGain = ctx.createGain();
      harmGain.gain.value = h.gain;

      osc.connect(harmGain);
      harmGain.connect(voiceGain);

      // Attach LFO vibrato for strings
      if (cfg.lfo) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = cfg.lfo.frequency;
        lfoGain.gain.value = cfg.lfo.depth;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        oscillators.push(lfo);
      }

      osc.start(now);
      oscillators.push(osc);
    });

    this._activeNotes.set(midiNote, {
      oscillators,
      voiceGain,
      sustainLevel: velocity * s,
      releaseTime: r,
    });
  }

  // ── noteOff ─────────────────────────────────────────────────────────────────

  noteOff(midiNote) {
    const voice = this._activeNotes.get(midiNote);
    if (!voice || !this._ctx) return;

    const ctx = this._ctx;
    const now = ctx.currentTime;
    const { voiceGain, oscillators, releaseTime } = voice;

    // Cancel any scheduled values, then release exponentially-ish
    voiceGain.gain.cancelScheduledValues(now);
    const current = voiceGain.gain.value;
    voiceGain.gain.setValueAtTime(Math.max(current, 0.0001), now);
    voiceGain.gain.linearRampToValueAtTime(0, now + releaseTime);

    const stopAt = now + releaseTime + 0.05;
    oscillators.forEach((osc) => {
      try { osc.stop(stopAt); } catch (_) {}
    });

    this._activeNotes.delete(midiNote);

    // Clean up node references after release ends
    setTimeout(() => {
      try { voiceGain.disconnect(); } catch (_) {}
      oscillators.forEach((o) => { try { o.disconnect(); } catch (_) {} });
    }, (releaseTime + 0.1) * 1000);
  }

  // ── Bulk ────────────────────────────────────────────────────────────────────

  allOff() {
    Array.from(this._activeNotes.keys()).forEach((n) => this.noteOff(n));
  }

  // ── Instrument selection ────────────────────────────────────────────────────

  setInstrument(name) {
    if (INSTRUMENTS[name]) this._instrument = name;
  }

  getInstrument() { return this._instrument; }

  // ── Volume / mute ───────────────────────────────────────────────────────────

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._master && !this._muted) {
      this._master.gain.value = this._volume;
    }
  }

  mute() {
    this._muted = true;
    localStorage.setItem('handsonedu_audio_muted', 'true');
    if (this._master) this._master.gain.value = 0;
    this.allOff();
  }

  unmute() {
    this._muted = false;
    localStorage.setItem('handsonedu_audio_muted', 'false');
    if (this._master) this._master.gain.value = this._volume;
  }

  isMuted() { return this._muted; }

  // ── Analyser (for live waveform visualization) ──────────────────────────────

  getAnalyser() {
    this._getContext(); // ensure analyser exists
    return this._analyser;
  }
}
