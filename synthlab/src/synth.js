// The synth builder: a small JSON "patch" is rendered offline into a mono
// AudioBuffer at middle C (root note 60). The keyboard then plays that buffer
// back at different rates, like a sampler. Only patches are ever saved.
//
// PATCH_SCHEMA describes every knob once; the Build tab, Randomize and Mutate
// all read it, so adding a parameter is one entry here plus a line in the
// renderer.

const C4 = 261.6256;
export const ROOT_NOTE = 60;
export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
export const FILTERS = ['lowpass', 'bandpass', 'highpass'];

export const DEFAULT_PATCH = {
  oscA: { wave: 'sawtooth', octave: 0, level: 0.8 },
  oscB: { wave: 'square', octave: 0, level: 0, detune: 7 },
  noise: { level: 0, type: 'bandpass', freq: 2000 },
  sweep: { amount: 0, time: 0.15 },
  filter: { type: 'lowpass', cutoff: 5000, q: 1, env: 0 },
  amp: { a: 0.005, d: 0.3, s: 0, hold: 0.4, r: 0.2 },
  echo: { mix: 0, time: 0.2, fb: 0.35 },
};

// Fills in anything a saved or hand-written patch is missing.
export function makePatch(over = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULT_PATCH)) out[k] = { ...DEFAULT_PATCH[k], ...(over[k] || {}) };
  return out;
}
export const clonePatch = (p) => makePatch(JSON.parse(JSON.stringify(p)));

export const PRESETS = [
  { id: 'zap', name: 'Zap', patch: makePatch({
    oscA: { wave: 'sawtooth', level: 0.8 }, oscB: { wave: 'square', level: 0.3, detune: 12 },
    sweep: { amount: 2, time: 0.12 }, filter: { cutoff: 5000, q: 2 },
    amp: { a: 0.002, d: 0.25, s: 0, hold: 0.3, r: 0.15 }, echo: { mix: 0.15, time: 0.12, fb: 0.3 },
  }) },
  { id: 'pluck', name: 'Pluck', patch: makePatch({
    oscA: { wave: 'triangle', level: 0.8 }, oscB: { wave: 'square', level: 0.25, detune: 5 },
    filter: { cutoff: 3200, q: 3, env: 2.5 },
    amp: { a: 0.002, d: 0.45, s: 0, hold: 0.6, r: 0.2 },
  }) },
  { id: 'pad', name: 'Pad', patch: makePatch({
    oscA: { wave: 'sawtooth', level: 0.6 }, oscB: { wave: 'sawtooth', level: 0.6, detune: 9 },
    filter: { cutoff: 1400, q: 0.7 },
    amp: { a: 0.35, d: 0.5, s: 0.8, hold: 1.4, r: 1.0 }, echo: { mix: 0.25, time: 0.3, fb: 0.45 },
  }) },
  { id: 'chime', name: 'Chime', patch: makePatch({
    oscA: { wave: 'sine', level: 0.7 }, oscB: { wave: 'sine', octave: 1, level: 0.35, detune: 8 },
    filter: { cutoff: 9000 },
    amp: { a: 0.001, d: 1.2, s: 0, hold: 1.2, r: 0.6 }, echo: { mix: 0.35, time: 0.21, fb: 0.5 },
  }) },
  { id: 'thump', name: 'Thump', patch: makePatch({
    oscA: { wave: 'sine', octave: -1, level: 1 }, noise: { level: 0.15, type: 'lowpass', freq: 500 },
    sweep: { amount: 2.5, time: 0.09 }, filter: { cutoff: 2500 },
    amp: { a: 0.001, d: 0.35, s: 0, hold: 0.4, r: 0.1 },
  }) },
  { id: 'static', name: 'Static', patch: makePatch({
    oscA: { level: 0 }, noise: { level: 1, type: 'highpass', freq: 6000 }, filter: { type: 'highpass', cutoff: 3000 },
    amp: { a: 0.001, d: 0.08, s: 0, hold: 0.1, r: 0.05 },
  }) },
];

// ---- parameter schema ----
const pct = (v) => `${Math.round(v * 100)}%`;
const oct = (v) => `${v > 0 ? '+' : ''}${(+v.toFixed(2))} oct`;
const cents = (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`;
const sec = (v) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);
const hz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);
const num = (v) => `${+v.toFixed(1)}`;

export const PATCH_SCHEMA = [
  { path: 'oscA.wave', section: 'Oscillator A', label: 'Wave', type: 'select', options: WAVES },
  { path: 'oscA.octave', section: 'Oscillator A', label: 'Octave', type: 'range', min: -2, max: 2, step: 1, fmt: oct },
  { path: 'oscA.level', section: 'Oscillator A', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
  { path: 'oscB.wave', section: 'Oscillator B', label: 'Wave', type: 'select', options: WAVES },
  { path: 'oscB.octave', section: 'Oscillator B', label: 'Octave', type: 'range', min: -2, max: 2, step: 1, fmt: oct },
  { path: 'oscB.level', section: 'Oscillator B', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
  { path: 'oscB.detune', section: 'Oscillator B', label: 'Detune', type: 'range', min: -100, max: 100, step: 1, fmt: cents },
  { path: 'noise.level', section: 'Noise', label: 'Level', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
  { path: 'noise.type', section: 'Noise', label: 'Color', type: 'select', options: FILTERS },
  { path: 'noise.freq', section: 'Noise', label: 'Color freq', type: 'range', min: 100, max: 12000, log: true, fmt: hz },
  { path: 'sweep.amount', section: 'Pitch sweep', label: 'Amount', type: 'range', min: -3, max: 3, step: 0.05, fmt: oct },
  { path: 'sweep.time', section: 'Pitch sweep', label: 'Time', type: 'range', min: 0.01, max: 1, log: true, fmt: sec },
  { path: 'filter.type', section: 'Filter', label: 'Type', type: 'select', options: FILTERS },
  { path: 'filter.cutoff', section: 'Filter', label: 'Cutoff', type: 'range', min: 60, max: 16000, log: true, fmt: hz },
  { path: 'filter.q', section: 'Filter', label: 'Resonance', type: 'range', min: 0.1, max: 20, step: 0.1, fmt: num },
  { path: 'filter.env', section: 'Filter', label: 'Sweep', type: 'range', min: -4, max: 4, step: 0.05, fmt: oct },
  { path: 'amp.a', section: 'Envelope', label: 'Attack', type: 'range', min: 0.001, max: 1.5, log: true, fmt: sec },
  { path: 'amp.d', section: 'Envelope', label: 'Decay', type: 'range', min: 0.01, max: 3, log: true, fmt: sec },
  { path: 'amp.s', section: 'Envelope', label: 'Sustain', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
  { path: 'amp.hold', section: 'Envelope', label: 'Hold', type: 'range', min: 0.05, max: 3, step: 0.01, fmt: sec },
  { path: 'amp.r', section: 'Envelope', label: 'Release', type: 'range', min: 0.01, max: 3, log: true, fmt: sec },
  { path: 'echo.mix', section: 'Echo', label: 'Mix', type: 'range', min: 0, max: 0.8, step: 0.01, fmt: pct },
  { path: 'echo.time', section: 'Echo', label: 'Time', type: 'range', min: 0.03, max: 0.6, step: 0.01, fmt: sec },
  { path: 'echo.fb', section: 'Echo', label: 'Feedback', type: 'range', min: 0, max: 0.85, step: 0.01, fmt: pct },
];

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function quantize(def, v) {
  v = clamp(v, def.min, def.max);
  if (def.step) v = Math.round((v - def.min) / def.step) * def.step + def.min;
  return +v.toPrecision(4);
}
function randomIn(def, rand) {
  if (def.log) return quantize(def, def.min * (def.max / def.min) ** rand());
  return quantize(def, def.min + rand() * (def.max - def.min));
}

// A fresh sound from the schema's ranges, nudged toward things that sound like
// notes rather than silence or a wall of noise.
export function randomPatch(rand = Math.random) {
  const p = makePatch();
  for (const def of PATCH_SCHEMA) {
    setPath(p, def.path, def.type === 'select' ? def.options[Math.floor(rand() * def.options.length)] : randomIn(def, rand));
  }
  p.oscA.level = clamp(p.oscA.level, 0.5, 1);
  p.oscB.level = rand() < 0.5 ? 0 : p.oscB.level;
  p.noise.level = rand() < 0.7 ? 0 : p.noise.level * 0.5;
  p.echo.mix = rand() < 0.5 ? 0 : p.echo.mix * 0.7;
  p.amp.s = rand() < 0.5 ? 0 : clamp(p.amp.s, 0.3, 0.9);
  p.amp.hold = clamp(p.amp.hold, 0.15, 1.4);
  p.amp.a = Math.min(p.amp.a, 0.4);
  p.amp.r = Math.min(p.amp.r, 1.2);
  p.filter.cutoff = Math.max(p.filter.cutoff, 400);
  p.filter.q = Math.min(p.filter.q, 8);
  p.sweep.amount = rand() < 0.5 ? 0 : p.sweep.amount;
  return p;
}

// Small random nudges to every knob; the sound stays recognisably itself.
export function mutatePatch(patch, amount = 0.18, rand = Math.random) {
  const p = clonePatch(patch);
  for (const def of PATCH_SCHEMA) {
    const cur = getPath(p, def.path);
    if (def.type === 'select') {
      if (rand() < 0.12) setPath(p, def.path, def.options[Math.floor(rand() * def.options.length)]);
    } else if (def.log) {
      setPath(p, def.path, quantize(def, cur * (def.max / def.min) ** ((rand() - 0.5) * 2 * amount)));
    } else {
      setPath(p, def.path, quantize(def, cur + (rand() - 0.5) * 2 * amount * (def.max - def.min)));
    }
  }
  return p;
}

// ---- rendering ----
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seconds of audio to render: the note, its release, and the echo tail.
export function patchLength(p) {
  const e = p.echo;
  let tail = 0;
  if (e.mix > 0.01) {
    const repeats = e.fb < 0.05 ? 1 : Math.ceil(Math.log(0.01) / Math.log(e.fb));
    tail = Math.min(2.5, e.time * repeats);
  }
  const hold = Math.max(p.amp.hold, p.amp.a + 0.02);
  return clamp(hold + p.amp.r * 1.6 + tail + 0.05, 0.12, 5);
}

export async function renderPatch(patch, sampleRate = 44100) {
  const p = makePatch(patch);
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const dur = patchLength(p);
  const ctx = new AC(1, Math.ceil(dur * sampleRate), sampleRate);
  const nyquist = sampleRate * 0.45;

  const filter = ctx.createBiquadFilter();
  filter.type = p.filter.type;
  filter.Q.value = p.filter.q;
  const cutoff = clamp(p.filter.cutoff, 20, nyquist);
  if (Math.abs(p.filter.env) > 0.01) {
    filter.frequency.setValueAtTime(clamp(cutoff * 2 ** p.filter.env, 20, nyquist), 0);
    filter.frequency.exponentialRampToValueAtTime(cutoff, Math.max(0.01, p.amp.a + p.amp.d));
  } else {
    filter.frequency.value = cutoff;
  }

  const { a, d, s, r } = p.amp;
  const hold = Math.max(p.amp.hold, a + 0.02);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, 0);
  amp.gain.linearRampToValueAtTime(1, Math.max(0.001, a));
  amp.gain.setTargetAtTime(s, Math.max(0.001, a), Math.max(0.005, d / 3));
  amp.gain.setTargetAtTime(0, hold, Math.max(0.005, r / 4));

  const mix = ctx.createGain();
  mix.connect(filter).connect(amp);

  const osc = (o, detune) => {
    if (o.level <= 0.001) return;
    const node = ctx.createOscillator(), level = ctx.createGain();
    node.type = o.wave;
    node.detune.value = detune;
    const f = C4 * 2 ** o.octave;
    if (Math.abs(p.sweep.amount) > 0.01) {
      node.frequency.setValueAtTime(f * 2 ** p.sweep.amount, 0);
      node.frequency.exponentialRampToValueAtTime(f, Math.max(0.005, p.sweep.time));
    } else {
      node.frequency.value = f;
    }
    level.gain.value = o.level;
    node.connect(level).connect(mix);
    node.start(0);
    node.stop(dur);
  };
  osc(p.oscA, 0);
  osc(p.oscB, p.oscB.detune);

  if (p.noise.level > 0.001) {
    // Seeded so a noisy patch renders identically each time while you tweak it.
    const rand = mulberry32(0x5eed);
    const buf = ctx.createBuffer(1, sampleRate, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
    const src = ctx.createBufferSource(), color = ctx.createBiquadFilter(), level = ctx.createGain();
    src.buffer = buf; src.loop = true;
    color.type = p.noise.type; color.frequency.value = clamp(p.noise.freq, 20, nyquist); color.Q.value = 1;
    level.gain.value = p.noise.level;
    src.connect(color).connect(level).connect(mix);
    src.start(0); src.stop(dur);
  }

  amp.connect(ctx.destination);
  if (p.echo.mix > 0.01) {
    const delay = ctx.createDelay(1), fb = ctx.createGain(), tone = ctx.createBiquadFilter(), wet = ctx.createGain();
    delay.delayTime.value = p.echo.time;
    fb.gain.value = clamp(p.echo.fb, 0, 0.9);
    tone.type = 'lowpass'; tone.frequency.value = 3500;
    wet.gain.value = p.echo.mix;
    amp.connect(delay);
    delay.connect(tone);
    tone.connect(fb).connect(delay);
    tone.connect(wet).connect(ctx.destination);
  }

  return ctx.startRendering();
}
