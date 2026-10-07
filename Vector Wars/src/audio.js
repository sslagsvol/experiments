// Sound effects, synthesized with WebAudio (no audio files): little vector-
// arcade blips, fizzles and chimes. Volumes and rate limits live in SFX in
// config.js. No three.js imports, so the style guide can play them too.
//
// Browsers only allow audio after a user gesture: call unlock() from one.

import { SFX } from './config.js';

const STORE_KEY = 'vector-wars-muted';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.rate = 1;          // < 1 in slow motion: everything plays lower and longer
    this.last = {};
    try { this.muted = localStorage.getItem(STORE_KEY) === '1'; } catch { this.muted = false; }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : SFX.master;
    this.master.connect(comp);
    // One second of white noise, reused for every noisy sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(STORE_KEY, m ? '1' : '0'); } catch { /* storage unavailable */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : SFX.master, this.ctx.currentTime, 0.02);
  }

  // name: a key of SFX. opts.pitch scales frequency (e.g. gate ticks rise).
  play(name, opts = {}) {
    const ctx = this.ctx, cfg = SFX[name];
    if (!ctx || this.muted || !cfg || !RECIPES[name]) return;
    const now = ctx.currentTime;
    if (cfg.maxRate && now - (this.last[name] || -1) < 1 / cfg.maxRate) return;
    this.last[name] = now;
    const out = ctx.createGain();
    out.gain.value = cfg.volume;
    out.connect(this.master);
    RECIPES[name](this, out, now, Math.max(0.3, this.rate) * (opts.pitch || 1), 1 / Math.max(0.3, this.rate));
    setTimeout(() => out.disconnect(), 3000);
  }

  // ---- building blocks ----
  tone(out, t, { type = 'sine', f0, f1 = f0, dur, vol = 1, attack = 0.004 }) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hiss(out, t, { type = 'bandpass', f0, f1 = f0, q = 1, dur, vol = 1, attack = 0.004 }) {
    const src = this.ctx.createBufferSource(), flt = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
}

// p = pitch multiplier, s = time stretch (both follow slow motion).
const RECIPES = {
  // A unit fizzling out: a crackle of noise sweeping down, with a little falling zap.
  death(a, out, t, p, s) {
    a.hiss(out, t, { f0: 2600 * p, f1: 300 * p, q: 3, dur: 0.22 * s, vol: 0.9 });
    a.tone(out, t, { type: 'square', f0: (700 + Math.random() * 300) * p, f1: 90 * p, dur: 0.16 * s, vol: 0.12 });
  },
  // Bullet chipping something: a tiny glassy tick.
  hit(a, out, t, p, s) {
    a.tone(out, t, { type: 'triangle', f0: (1500 + Math.random() * 700) * p, f1: 900 * p, dur: 0.045 * s, vol: 0.8 });
  },
  // Enemy destroyed: a bright chirp plus a click.
  pop(a, out, t, p, s) {
    a.tone(out, t, { type: 'square', f0: 480 * p, f1: 1500 * p, dur: 0.07 * s, vol: 0.35 });
    a.hiss(out, t, { type: 'highpass', f0: 3000 * p, dur: 0.04 * s, vol: 0.5 });
  },
  // Good gate: a shimmering rising arpeggio and an airy swoosh.
  gateUp(a, out, t, p, s) {
    [523, 659, 784, 1047].forEach((f, i) => a.tone(out, t + i * 0.055 * s, { type: 'triangle', f0: f * p, dur: 0.3 * s, vol: 0.5 }));
    a.hiss(out, t, { type: 'highpass', f0: 1500 * p, f1: 6000 * p, dur: 0.35 * s, vol: 0.25, attack: 0.05 });
  },
  // Bad gate: a falling buzz and a low thud.
  gateDown(a, out, t, p, s) {
    a.tone(out, t, { type: 'sawtooth', f0: 440 * p, f1: 110 * p, dur: 0.4 * s, vol: 0.3 });
    a.tone(out, t, { type: 'sine', f0: 120 * p, f1: 45 * p, dur: 0.3 * s, vol: 0.9 });
  },
  // A gate's value ticking up from fire; pitch rises with the value.
  gateTick(a, out, t, p, s) {
    a.tone(out, t, { type: 'sine', f0: 880 * p, f1: 1320 * p, dur: 0.06 * s, vol: 0.7 });
  },
  // Bomber blast: low boom and a burst of noise.
  blast(a, out, t, p, s) {
    a.tone(out, t, { type: 'sine', f0: 110 * p, f1: 35 * p, dur: 0.5 * s, vol: 1 });
    a.hiss(out, t, { type: 'lowpass', f0: 2500 * p, f1: 150 * p, dur: 0.45 * s, vol: 0.8 });
  },
  // Battle won: a two-note chime.
  win(a, out, t, p, s) {
    a.tone(out, t, { type: 'triangle', f0: 784 * p, dur: 0.25 * s, vol: 0.6 });
    a.tone(out, t + 0.09 * s, { type: 'triangle', f0: 1175 * p, dur: 0.45 * s, vol: 0.6 });
  },
  // Army wiped out: a long dive and a rumble.
  lose(a, out, t, p, s) {
    a.tone(out, t, { type: 'sawtooth', f0: 330 * p, f1: 40 * p, dur: 1.3 * s, vol: 0.35 });
    a.hiss(out, t, { type: 'lowpass', f0: 1200 * p, f1: 80 * p, dur: 1.1 * s, vol: 0.6 });
  },
};

export const SOUND_NAMES = Object.keys(RECIPES);
