// The sample library. A sample is an AudioBuffer rendered at the root note:
//
//   { id, name, kind: 'synth' | 'vw', group, patch | vw, buffer, root, gain }
//
// 'synth' samples come from a patch (synth.js). 'vw' samples are Vector Wars
// game sounds rendered offline through the game's own Sfx recipes; they only
// expose tune / stretch / gain. Only patches and tune/stretch/gain values are
// saved, buffers are re-rendered on load.

import { PRESETS, ROOT_NOTE, clonePatch, makePatch, renderPatch } from './synth.js';
import { load, save } from './store.js';

const STORE_KEY = 'synthlab-library';
const TARGET_PEAK = 0.7;          // about -3 dBFS, so samples are about as loud as each other
const SILENCE = 0.001;            // trim the tail once it falls 60 dB below the peak
const VW_DEFAULTS = { tune: 0, stretch: 1, gain: 1 };
const VW_RENDER_SECONDS = 5;

const defer = () => { const d = {}; d.promise = new Promise((res) => { d.resolve = res; }); return d; };

export class Library {
  constructor() {
    this.samples = [];
    this.vw = null;                 // { Sfx, SFX, SOUND_NAMES } once the game's audio loads
    this.vwSfx = null;
    this.saved = load(STORE_KEY, {}) || {};
    this.listeners = new Set();     // called with a sample after each render
  }

  async init() {
    for (const p of PRESETS) {
      const edit = this.saved.edits?.[`synth:${p.id}`];
      this.samples.push(this.make({ id: `synth:${p.id}`, name: p.name, kind: 'synth', group: 'preset', builtin: p.patch, patch: edit ? makePatch(edit) : clonePatch(p.patch) }));
    }
    for (const u of this.saved.user || []) {
      this.samples.push(this.make({ id: u.id, name: u.name, kind: 'synth', group: 'user', patch: makePatch(u.patch) }));
    }
    // The game's sounds are a bonus: if the Vector Wars folder isn't next to
    // this one, the lab still works without them.
    try {
      const [audio, config] = await Promise.all([
        import('../../Vector%20Wars/src/audio.js'),
        import('../../Vector%20Wars/src/config.js'),
      ]);
      this.vw = { Sfx: audio.Sfx, SOUND_NAMES: audio.SOUND_NAMES, SFX: config.SFX };
      for (const name of audio.SOUND_NAMES) {
        const saved = this.saved.vw?.[name];
        this.samples.push(this.make({ id: `vw:${name}`, name, kind: 'vw', group: 'vw', vw: { sound: name, ...VW_DEFAULTS, ...saved } }));
      }
    } catch { this.vw = null; }
  }

  make(s) {
    return { root: ROOT_NOTE, gain: s.vw ? s.vw.gain : 1, buffer: null, token: 0, peak: 0, duration: 0, _render: null, _timer: 0, _wait: null, ...s };
  }

  get(id) { return this.samples.find((s) => s.id === id) || null; }
  onRender(fn) { this.listeners.add(fn); }

  // Renders once and caches; resolves with the sample.
  ensure(sample) {
    if (sample.buffer) return Promise.resolve(sample);
    if (!sample._render) sample._render = this.render(sample);
    return sample._render;
  }

  async render(sample) {
    const token = ++sample.token;
    const raw = sample.kind === 'vw' ? await this.renderVW(sample) : await renderPatch(sample.patch);
    if (token !== sample.token) return sample;     // a newer render has been asked for
    const fin = finalize(raw);
    sample.buffer = fin.buffer;
    sample.peak = fin.peak;
    sample.duration = fin.buffer.duration;
    sample._render = null;
    for (const fn of this.listeners) fn(sample);
    return sample;
  }

  // Re-renders after a short pause (so dragging a slider doesn't render per
  // pixel). The returned promise resolves when the new buffer is in.
  touch(sample, delay = 60) {
    const wait = sample._wait || (sample._wait = defer());
    clearTimeout(sample._timer);
    sample._timer = setTimeout(() => {
      sample._wait = null;
      sample._render = this.render(sample);
      sample._render.then(() => wait.resolve(sample));
    }, delay);
    return wait.promise;
  }

  async renderVW(sample) {
    const { Sfx, SFX } = this.vw, { sound, tune, stretch } = sample.vw;
    const sr = 44100;
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new AC(1, sr * VW_RENDER_SECONDS, sr);
    const sfx = this.vwSfx || (this.vwSfx = new Sfx());
    sfx.muted = false; sfx.rate = 1; sfx.last = {};
    sfx.attach(ctx);
    // Same trick as the game's sound-lab: set tune/stretch for this one play,
    // then put the game's values back. All synchronous, nothing else sees them.
    const keep = { gt: SFX.tune, gs: SFX.stretch, t: SFX[sound].tune, s: SFX[sound].stretch };
    SFX.tune = 0; SFX.stretch = 1; SFX[sound].tune = tune; SFX[sound].stretch = stretch;
    try { sfx.play(sound, { pitch: 1 }); } finally {
      SFX.tune = keep.gt; SFX.stretch = keep.gs; SFX[sound].tune = keep.t; SFX[sound].stretch = keep.s;
    }
    const buffer = await ctx.startRendering();
    sfx.ctx = null;                  // the game's visibility handler must not touch a finished offline context
    return buffer;
  }

  // ---- editing and saving ----
  persist() {
    const edits = {};
    for (const s of this.samples) {
      if (s.group === 'preset' && JSON.stringify(s.patch) !== JSON.stringify(s.builtin)) edits[s.id] = s.patch;
    }
    const user = this.samples.filter((s) => s.group === 'user').map((s) => ({ id: s.id, name: s.name, patch: s.patch }));
    const vw = {};
    for (const s of this.samples) {
      if (s.kind === 'vw' && ['tune', 'stretch', 'gain'].some((k) => s.vw[k] !== VW_DEFAULTS[k])) vw[s.vw.sound] = { tune: s.vw.tune, stretch: s.vw.stretch, gain: s.vw.gain };
    }
    this.saved = { ...this.saved, edits, user, vw };
    save(STORE_KEY, this.saved);
  }

  addUser(patch, name) {
    const s = this.make({ id: `user:${Date.now().toString(36)}`, name, kind: 'synth', group: 'user', patch: clonePatch(patch) });
    const lastUser = this.samples.map((x) => x.group).lastIndexOf('user');
    const at = lastUser >= 0 ? lastUser + 1 : this.samples.filter((x) => x.group === 'preset').length;
    this.samples.splice(at, 0, s);
    this.persist();
    return s;
  }

  removeUser(sample) {
    if (sample.group !== 'user') return;
    this.samples.splice(this.samples.indexOf(sample), 1);
    this.persist();
  }

  resetSample(sample) {
    if (sample.kind === 'vw') Object.assign(sample.vw, VW_DEFAULTS), sample.gain = 1;
    else if (sample.builtin) sample.patch = clonePatch(sample.builtin);
    this.persist();
    return this.touch(sample, 0);
  }

  isEdited(sample) {
    if (sample.kind === 'vw') return ['tune', 'stretch', 'gain'].some((k) => sample.vw[k] !== VW_DEFAULTS[k]);
    return !!sample.builtin && JSON.stringify(sample.patch) !== JSON.stringify(sample.builtin);
  }
}

// Trims the silent tail, fades the last few ms, and peak-normalizes. Returns a
// new buffer (an AudioBuffer can't be shortened in place).
export function finalize(raw) {
  const data = raw.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  if (peak < 1e-5) {
    return { buffer: new AudioBuffer({ length: 64, sampleRate: raw.sampleRate, numberOfChannels: 1 }), peak: 0 };
  }
  const floor = peak * SILENCE;
  let end = data.length - 1;
  while (end > 64 && Math.abs(data[end]) < floor) end--;
  const length = Math.min(data.length, end + 1 + Math.round(raw.sampleRate * 0.01));
  const out = new AudioBuffer({ length, sampleRate: raw.sampleRate, numberOfChannels: 1 });
  const to = out.getChannelData(0), scale = TARGET_PEAK / peak;
  for (let i = 0; i < length; i++) to[i] = data[i] * scale;
  const fade = Math.min(length, Math.round(raw.sampleRate * 0.008));
  for (let i = 0; i < fade; i++) to[length - 1 - i] *= i / fade;
  return { buffer: out, peak };
}
