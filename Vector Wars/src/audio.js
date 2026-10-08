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
    this.attach(new AC());
  }

  // Builds the master chain (compressor, master gain, shared noise) on a
  // context. unlock() uses a live one; the synth lab (../synthlab) hands in an
  // OfflineAudioContext to render a sound into a buffer.
  attach(ctx, dest = ctx.destination) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(dest);
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
  // SFX.tune / SFX[name].tune detune in semitones without changing speed;
  // SFX.stretch / SFX[name].stretch lengthen without changing pitch.
  // Slow motion does both (rate 0.3 = about −21 semitones and ×3.3 longer).
  play(name, opts = {}) {
    const ctx = this.ctx, cfg = SFX[name];
    if (!ctx || this.muted || !cfg || !RECIPES[name]) return;
    const now = ctx.currentTime;
    if (cfg.maxRate && now - (this.last[name] || -1) < 1 / cfg.maxRate) return;
    this.last[name] = now;
    const out = ctx.createGain();
    out.gain.value = cfg.volume * (opts.gain ?? 1);
    out.connect(this.master);
    const rate = Math.max(0.3, this.rate);
    const p = rate * (opts.pitch || 1) * 2 ** (((SFX.tune || 0) + (cfg.tune || 0)) / 12);
    const s = (SFX.stretch || 1) * (cfg.stretch || 1) / rate;
    RECIPES[name](this, out, now, p, s);
    setTimeout(() => out.disconnect(), 3000 * Math.max(1, s));
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

  // A feedback echo that darkens each repeat; returns its input node.
  echo(out, s, { time = 0.14, feedback = 0.45, cutoff = 3500 } = {}) {
    const ctx = this.ctx, delay = ctx.createDelay(1), fb = ctx.createGain(), tone = ctx.createBiquadFilter();
    delay.delayTime.value = time * s;
    fb.gain.value = feedback;
    tone.type = 'lowpass'; tone.frequency.value = cutoff;
    delay.connect(tone).connect(fb).connect(delay);
    delay.connect(out);
    setTimeout(() => { fb.gain.value = 0; delay.disconnect(); }, 3000 * s);
    return delay;
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
  // Good gate ("whoomp and sparkle"): noise and a low tone swell in and cut
  // off hard, then a thump and a spray of bright sparkles.
  gateUp(a, out, t, p, s) {
    a.hiss(out, t, { type: 'lowpass', f0: 300 * p, f1: 2400 * p, q: 3, dur: 0.2 * s, vol: 0.6, attack: 0.18 * s });
    a.tone(out, t, { f0: 70 * p, f1: 140 * p, dur: 0.2 * s, vol: 0.6, attack: 0.17 * s });
    const at = t + 0.19 * s;
    a.tone(out, at, { f0: 160 * p, f1: 60 * p, dur: 0.25 * s, vol: 0.8 });
    for (let i = 0; i < 10; i++) {
      a.tone(out, at + (i * 0.025 + Math.random() * 0.02) * s, { f0: (2200 + Math.random() * 3000 + i * 180) * p, dur: 0.07 * s, vol: 0.18, attack: 0.002 });
    }
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
  // × gate maxed out at ×3.0 ("data stream"): a very fast run of sine blips
  // rising through a pentatonic scale into an echo. Also plays when a score
  // moves up a place on the board and when initials are saved.
  maxMult(a, out, t, p, s) {
    const wet = a.echo(out, s, { time: 0.09, feedback: 0.35, cutoff: 5000 * p });
    [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760].forEach((f, i) => {
      const at = t + i * 0.022 * s;
      a.tone(out, at, { f0: f * p, dur: 0.08 * s, vol: 0.3, attack: 0.002 });
      a.tone(wet, at, { f0: f * p, dur: 0.06 * s, vol: 0.2, attack: 0.002 });
    });
    a.hiss(out, t, { type: 'highpass', f0: 4000 * p, f1: 9000 * p, dur: 0.25 * s, vol: 0.12, attack: 0.04 });
  },
  // A bullet soaked up by a level gate: a soft, airy blip (the caller raises
  // its pitch and volume as the gate nears).
  levelCharge(a, out, t, p, s) {
    a.tone(out, t, { f0: 660 * p, f1: 990 * p, dur: 0.05 * s, vol: 0.4, attack: 0.003 });
    a.hiss(out, t, { type: 'highpass', f0: 6000 * p, dur: 0.03 * s, vol: 0.12 });
  },
  // Crossing a level gate, the crescendo: a long swell, then a thump, a bright
  // chord that echoes, and a spray of sparkles.
  levelUp(a, out, t, p, s) {
    a.hiss(out, t, { type: 'bandpass', f0: 300 * p, f1: 5000 * p, q: 2, dur: 0.4 * s, vol: 0.6, attack: 0.35 * s });
    a.tone(out, t, { f0: 110 * p, f1: 440 * p, dur: 0.4 * s, vol: 0.5, attack: 0.35 * s });
    const at = t + 0.38 * s, wet = a.echo(out, s, { time: 0.12, feedback: 0.4, cutoff: 5000 * p });
    a.tone(out, at, { f0: 160 * p, f1: 50 * p, dur: 0.4 * s, vol: 0.9 });
    [523, 659, 784, 1047, 1319].forEach((f) => {
      a.tone(out, at, { f0: f * p, dur: 0.9 * s, vol: 0.14, attack: 0.004 });
      a.tone(wet, at, { f0: f * p, dur: 0.5 * s, vol: 0.08, attack: 0.004 });
    });
    for (let i = 0; i < 14; i++) a.tone(out, at + (i * 0.03 + Math.random() * 0.02) * s, { f0: (2500 + Math.random() * 3500) * p, dur: 0.08 * s, vol: 0.15, attack: 0.002 });
  },
  // Bomber blast: low boom and a burst of noise.
  blast(a, out, t, p, s) {
    a.tone(out, t, { type: 'sine', f0: 110 * p, f1: 35 * p, dur: 0.5 * s, vol: 1 });
    a.hiss(out, t, { type: 'lowpass', f0: 2500 * p, f1: 150 * p, dur: 0.45 * s, vol: 0.8 });
  },
  // Brute stomp: a heavy sub thud, a crunch, and a short ground rumble.
  stomp(a, out, t, p, s) {
    a.tone(out, t, { type: 'sine', f0: 75 * p, f1: 30 * p, dur: 0.6 * s, vol: 1, attack: 0.005 });
    a.tone(out, t, { type: 'square', f0: 140 * p, f1: 50 * p, dur: 0.18 * s, vol: 0.35 });
    a.hiss(out, t, { type: 'lowpass', f0: 600 * p, f1: 80 * p, q: 1.2, dur: 0.7 * s, vol: 0.9 });
    a.hiss(out, t, { type: 'bandpass', f0: 1800 * p, f1: 700 * p, q: 1.5, dur: 0.12 * s, vol: 0.5 });
  },
  // Battle won: the bomber blast, plus a crackly fizzle that echoes away.
  win(a, out, t, p, s) {
    RECIPES.blast(a, out, t, p, s);
    // Echo: a feedback delay with a lowpass in the loop, so each repeat is darker.
    const ctx = a.ctx, delay = ctx.createDelay(1), fb = ctx.createGain(), tone = ctx.createBiquadFilter();
    delay.delayTime.value = 0.16 * s;
    fb.gain.value = 0.5;
    tone.type = 'lowpass'; tone.frequency.value = 3200 * p;
    delay.connect(tone).connect(fb).connect(delay);
    delay.connect(out);
    for (let i = 0; i < 9; i++) {
      const at = t + (0.08 + i * 0.045 + Math.random() * 0.03) * s;
      a.hiss(delay, at, { type: 'highpass', f0: (2200 + Math.random() * 1800) * p, dur: 0.03 * s, vol: 0.5 });
      a.hiss(out, at, { type: 'highpass', f0: (2200 + Math.random() * 1800) * p, dur: 0.03 * s, vol: 0.3 });
    }
    a.hiss(delay, t + 0.05 * s, { f0: 3000 * p, f1: 400 * p, q: 2, dur: 0.4 * s, vol: 0.5 });
    setTimeout(() => { fb.gain.value = 0; delay.disconnect(); }, 3000 * s);
  },
  // Army wiped out: a long dive and a rumble.
  lose(a, out, t, p, s) {
    a.tone(out, t, { type: 'sawtooth', f0: 330 * p, f1: 40 * p, dur: 1.3 * s, vol: 0.35 });
    a.hiss(out, t, { type: 'lowpass', f0: 1200 * p, f1: 80 * p, dur: 1.1 * s, vol: 0.6 });
  },
};

export const SOUND_NAMES = Object.keys(RECIPES);
