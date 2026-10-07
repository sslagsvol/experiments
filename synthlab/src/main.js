// Synthlab: pick or build a sample, play it across a keyboard, tweak anything.
// This file wires the modules together and defines every Tweaks entry.
// ?debug exposes window.synthlab for driving the app from the console.

import { Engine } from './engine.js';
import { Keyboard, noteName } from './keyboard.js';
import { Library } from './samples.js';
import { TweaksPanel } from './tweaks.js';
import * as synth from './synth.js';
import { load, save } from './store.js';

const { PATCH_SCHEMA, ROOT_NOTE, getPath, setPath, randomPatch, mutatePatch, DEFAULT_PATCH } = synth;
const SETTINGS_KEY = 'synthlab-settings';

// Every global tweak and its default. Anything saved with another type is dropped.
const DEFAULTS = {
  count: 18, octave: 0, fine: 0, labels: 'note', gliss: true, velocity: 'fixed',
  volume: 0.8, mode: 'oneshot', attack: 0.005, release: 0.25, loopStart: 0.3, loopEnd: 0.8, maxVoices: 12,
  echoMix: 0, echoTime: 0.25, echoFb: 0.4,
  reverse: false, humanize: 0,
  tab: 'keys', sample: 'synth:zap', panel: true,
};
const NOT_TWEAKS = new Set(['tab', 'sample', 'panel']);   // remembered, but not "settings to keep"
const saved = load(SETTINGS_KEY, {}) || {};
const cfg = { ...DEFAULTS };
for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) cfg[k] = saved[k];
const persist = () => save(SETTINGS_KEY, cfg);

const $ = (id) => document.getElementById(id);
const make = (tag, className = '', text = '') => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text) n.textContent = text;
  return n;
};
const pct = (v) => `${Math.round(v * 100)}%`;
const sec = (v) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);
const cents = (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`;

const engine = new Engine(cfg);
const lib = new Library();
let current = null;
let panel = null;
let keyboard = null;

// ---- audition: play the sample once at its natural pitch ----
function audition() {
  if (!current?.buffer) return;
  engine.noteOn('audition', ROOT_NOTE, { sample: current, vel: 0.85 });
  setTimeout(() => engine.noteOff('audition'), 350);
}

// ---- samples ----
async function selectSample(id) {
  const s = lib.get(id);
  if (!s) return;
  await lib.ensure(s);
  current = s;
  cfg.sample = id;
  persist();
  renderStrip();
  panel?.refresh();
}

const sampleIndex = () => lib.samples.indexOf(current);
const step = (dir) => selectSample(lib.samples[(sampleIndex() + dir + lib.samples.length) % lib.samples.length].id);

async function duplicate() {
  const fromSynth = current.kind === 'synth';
  const s = lib.addUser(fromSynth ? current.patch : DEFAULT_PATCH, fromSynth ? `${current.name} copy`.slice(0, 24) : 'New sound');
  await selectSample(s.id);
  panel.select('build');
}

async function removeCurrent() {
  const i = sampleIndex();
  lib.removeUser(current);
  await selectSample(lib.samples[Math.max(0, i - 1)].id);
}

// Rendering a patch/tune/stretch edit: re-render soon, redraw when it lands.
const edited = () => { lib.touch(current); lib.persist(); };
const committed = () => lib.touch(current, 0).then(audition);

// ---- sample strip ----
function renderStrip() {
  const strip = $('strip');
  strip.replaceChildren();
  for (const s of lib.samples.filter((x) => x.kind === 'synth')) {
    const b = make('button', 'chip', s.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s === current));
    b.addEventListener('click', () => selectSample(s.id));
    strip.append(b);
  }
  const add = make('button', 'chip add', '+ New');
  add.type = 'button';
  add.title = 'Copy the current sound into a new sample you can edit';
  add.addEventListener('click', duplicate);
  strip.append(add);

  if (lib.vw) {
    const wrap = make('label', 'chip vw');
    wrap.setAttribute('aria-pressed', String(current.kind === 'vw'));
    const select = make('select');
    select.setAttribute('aria-label', 'Vector Wars sounds');
    select.append(Object.assign(make('option', '', 'Vector Wars'), { value: '' }));
    for (const s of lib.samples.filter((x) => x.kind === 'vw')) select.append(Object.assign(make('option', '', s.name), { value: s.id }));
    select.value = current.kind === 'vw' ? current.id : '';
    select.addEventListener('change', () => { if (select.value) selectSample(select.value); });
    wrap.append(select);
    strip.append(wrap);
  }
  const on = strip.querySelector('[aria-pressed=true]');
  if (on) strip.scrollTo({ left: on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2, behavior: 'smooth' });
}

// ---- keyboard ----
function applyKeyboard() {
  keyboard.set({ start: ROOT_NOTE + 12 * cfg.octave, count: cfg.count, labels: cfg.labels, gliss: cfg.gliss, velocity: cfg.velocity });
}

// ---- waveform preview ----
const waves = [];
function drawWave(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h || !current?.buffer) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  if (cfg.mode === 'loop') {
    g.fillStyle = css.getPropertyValue('--loop').trim() || 'rgba(255,210,61,.18)';
    g.fillRect(cfg.loopStart * w, 0, (cfg.loopEnd - cfg.loopStart) * w, h);
  }
  const data = current.buffer.getChannelData(0), per = data.length / w;
  g.fillStyle = css.getPropertyValue('--accent').trim() || '#46d2ff';
  for (let x = 0; x < w; x++) {
    const i0 = Math.floor(x * per), i1 = Math.min(data.length, Math.floor((x + 1) * per) + 1), stride = Math.max(1, Math.floor((i1 - i0) / 24));
    let lo = 0, hi = 0;
    for (let i = i0; i < i1; i += stride) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const y0 = h / 2 - hi * (h / 2), y1 = h / 2 - lo * (h / 2);
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}
const waveformEntry = (tab) => ({
  tab, type: 'custom',
  render(row) {
    const canvas = make('canvas', 'wave');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Waveform of the current sample');
    row.append(canvas);
    waves.push(canvas);
    new ResizeObserver(() => drawWave(canvas)).observe(canvas);
  },
  sync() { for (const c of waves) drawWave(c); },
});

// ---- tweak entries ----
// A global setting: reads/writes cfg, saves, then runs an optional side effect.
const setting = (key, side) => ({
  value: () => cfg[key],
  apply: (v) => { cfg[key] = v; persist(); side?.(v); },
});
const opts = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const looping = () => cfg.mode === 'loop';
const gated = () => cfg.mode !== 'oneshot';
let confirmDelete = false;

const entries = [
  // -- Keys --
  { tab: 'keys', section: 'Keyboard', label: 'Keys', type: 'range', min: 12, max: 18, step: 1, fmt: (v) => `${v} keys`, ...setting('count', applyKeyboard) },
  { tab: 'keys', section: 'Keyboard', label: 'Octave', type: 'range', min: -2, max: 2, step: 1, fmt: (v) => `from ${noteName(ROOT_NOTE + 12 * v)}`, ...setting('octave', applyKeyboard) },
  { tab: 'keys', section: 'Keyboard', label: 'Fine tune', type: 'range', min: -100, max: 100, step: 1, fmt: cents, ...setting('fine') },
  { tab: 'keys', section: 'Keyboard', label: 'Labels', type: 'segmented', options: opts(['note', 'Notes'], ['keys', 'Computer keys'], ['none', 'None']), ...setting('labels', applyKeyboard) },
  { tab: 'keys', section: 'Touch', label: 'Slide between keys', type: 'toggle', ...setting('gliss', applyKeyboard), help: 'Drag a finger across the keys to play them in turn.' },
  { tab: 'keys', section: 'Touch', label: 'Strength', type: 'segmented', options: opts(['fixed', 'Fixed'], ['position', 'By tap position']), ...setting('velocity', applyKeyboard), help: 'By tap position: tapping lower on a key plays louder.' },

  // -- Sound --
  { tab: 'sound', section: 'Play', label: 'Mode', type: 'segmented', options: opts(['oneshot', 'One-shot'], ['gate', 'Gate'], ['loop', 'Loop']), ...setting('mode'),
    help: 'One-shot plays the whole sample. Gate stops it when you let go. Loop repeats a slice while the key is held.' },
  { tab: 'sound', section: 'Play', label: 'Attack', type: 'range', min: 0.003, max: 0.5, log: true, fmt: sec, ...setting('attack') },
  { tab: 'sound', section: 'Play', label: 'Release', type: 'range', min: 0.02, max: 2, log: true, fmt: sec, when: gated, ...setting('release') },
  { tab: 'sound', section: 'Play', label: 'Loop start', type: 'range', min: 0, max: 0.95, step: 0.01, fmt: pct, when: looping,
    value: () => cfg.loopStart, apply: (v) => { cfg.loopStart = v; if (cfg.loopEnd < v + 0.05) cfg.loopEnd = Math.min(1, v + 0.05); persist(); panel?.refresh(); } },
  { tab: 'sound', section: 'Play', label: 'Loop end', type: 'range', min: 0.05, max: 1, step: 0.01, fmt: pct, when: looping,
    value: () => cfg.loopEnd, apply: (v) => { cfg.loopEnd = v; if (cfg.loopStart > v - 0.05) cfg.loopStart = Math.max(0, v - 0.05); persist(); panel?.refresh(); } },
  { tab: 'sound', section: 'Output', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct, ...setting('volume', () => engine.applySettings()) },
  { tab: 'sound', section: 'Output', label: 'Voices', type: 'range', min: 4, max: 24, step: 1, fmt: (v) => `${v}`, ...setting('maxVoices'), help: 'Most notes that can sound at once. The oldest fade out first.' },
  { tab: 'sound', section: 'Echo', label: 'Mix', type: 'range', min: 0, max: 0.8, step: 0.01, fmt: pct, ...setting('echoMix', () => engine.applySettings()) },
  { tab: 'sound', section: 'Echo', label: 'Time', type: 'range', min: 0.05, max: 0.8, step: 0.01, fmt: sec, ...setting('echoTime', () => engine.applySettings()) },
  { tab: 'sound', section: 'Echo', label: 'Feedback', type: 'range', min: 0, max: 0.85, step: 0.01, fmt: pct, ...setting('echoFb', () => engine.applySettings()) },

  // -- Sample --
  waveformEntry('sample'),
  { tab: 'sample', type: 'info', text: () => `${current.kind === 'vw' ? 'Vector Wars sound' : 'Synth sample'} · ${current.duration.toFixed(2)} s · plays at ${noteName(ROOT_NOTE)}` },
  {
    tab: 'sample', section: 'Sample', label: 'Sample', type: 'custom',
    render(row) {
      row.append(make('span', 'lab', 'Sample'));
      this.select = make('select');
      this.select.setAttribute('aria-label', 'Sample');
      this.select.addEventListener('change', () => selectSample(this.select.value));
      row.append(this.select);
    },
    sync() {
      const groups = { preset: 'Presets', user: 'Yours', vw: 'Vector Wars' };
      this.select.replaceChildren();
      for (const g of Object.keys(groups)) {
        const list = lib.samples.filter((s) => s.group === g);
        if (!list.length) continue;
        const og = make('optgroup');
        og.label = groups[g];
        for (const s of list) og.append(Object.assign(make('option', '', s.name), { value: s.id }));
        this.select.append(og);
      }
      this.select.value = current.id;
    },
  },
  { tab: 'sample', section: 'Game sound', label: 'Detune', type: 'range', min: -24, max: 12, step: 0.5, fmt: (v) => `${v > 0 ? '+' : ''}${v} st`, when: () => current.kind === 'vw',
    value: () => current.vw.tune, apply: (v) => { current.vw.tune = v; edited(); }, commit: committed },
  { tab: 'sample', section: 'Game sound', label: 'Stretch', type: 'range', min: 0.5, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}`, when: () => current.kind === 'vw',
    value: () => current.vw.stretch, apply: (v) => { current.vw.stretch = v; edited(); }, commit: committed },
  { tab: 'sample', section: 'Game sound', label: 'Gain', type: 'range', min: 0.2, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}`, when: () => current.kind === 'vw',
    value: () => current.vw.gain, apply: (v) => { current.vw.gain = current.gain = v; lib.persist(); }, commit: audition },
  { tab: 'sample', section: 'Game sound', type: 'buttons', when: () => current.kind === 'vw',
    buttons: [
      { label: 'Play', className: 'play', run: audition },
      { label: 'Re-roll', run: () => committed() },
      { label: 'Reset sound', when: () => lib.isEdited(current), run: () => lib.resetSample(current).then(audition) },
    ],
    help: 'Game sounds add a little random flavor each time they play. Re-roll draws a new one.' },
  { tab: 'sample', section: 'Synth sample', type: 'buttons', when: () => current.kind === 'synth',
    buttons: [{ label: 'Play', className: 'play', run: audition }, { label: 'Edit in Build →', run: () => panel.select('build') }] },

  // -- Build (synth samples only) --
  waveformEntry('build'),
  { tab: 'build', section: 'Sample', label: 'Name', type: 'text', when: () => current.group === 'user',
    value: () => current.name, apply: (v) => { current.name = v.trim() || 'Untitled'; lib.persist(); renderStrip(); } },
  { tab: 'build', section: 'Sample', type: 'buttons',
    buttons: [
      { label: 'Play', className: 'play', run: audition },
      { label: 'Randomize', run: () => { current.patch = randomPatch(); edited(); committed(); } },
      { label: 'Mutate', run: () => { current.patch = mutatePatch(current.patch); edited(); committed(); } },
    ] },
  { tab: 'build', section: 'Sample', type: 'buttons',
    buttons: [
      { label: 'Save as new', run: duplicate },
      { label: 'Reset to preset', when: () => lib.isEdited(current), run: () => lib.resetSample(current).then(audition) },
      { label: () => (confirmDelete ? 'Tap again to delete' : 'Delete'), className: 'danger', when: () => current.group === 'user',
        run: () => {
          if (!confirmDelete) { confirmDelete = true; setTimeout(() => { confirmDelete = false; panel.refresh(); }, 3000); return; }
          confirmDelete = false;
          removeCurrent();
        } },
    ],
    help: 'Edits to a preset are kept on this device. Save as new to branch it into your own sample.' },
  ...PATCH_SCHEMA.map((def) => ({
    tab: 'build', section: def.section, label: def.label, type: def.type,
    ...(def.type === 'range' ? { min: def.min, max: def.max, step: def.step, log: def.log, fmt: def.fmt } : { options: def.options }),
    when: () => current.kind === 'synth',
    value: () => getPath(current.patch, def.path),
    apply: (v) => { setPath(current.patch, def.path, v); edited(); },
    commit: committed,
  })),

  // -- Lab: experiments that may or may not make it --
  { tab: 'lab', section: 'Experiments', label: 'Reverse', type: 'toggle', ...setting('reverse'), help: 'Plays the sample backwards.' },
  { tab: 'lab', section: 'Experiments', label: 'Humanize', type: 'range', min: 0, max: 50, step: 1, fmt: cents, ...setting('humanize'), help: 'Each note lands a little out of tune, at random.' },
  { tab: 'lab', type: 'info', text: () => 'New experimental knobs get parked here while we work out what the instrument should do.' },
];

const tabs = [
  { id: 'keys', label: 'Keys' },
  { id: 'sound', label: 'Sound' },
  { id: 'sample', label: 'Sample' },
  { id: 'build', label: 'Build', when: () => current.kind === 'synth' },
  { id: 'lab', label: 'Lab' },
];

// What "Copy settings" puts on the clipboard: only what differs from the defaults.
function changedSettings() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (!NOT_TWEAKS.has(k) && cfg[k] !== DEFAULTS[k]) out[k] = cfg[k];
  if (current.kind === 'synth' && (current.group === 'user' || lib.isEdited(current))) out.sample = { name: current.name, patch: current.patch };
  if (current.kind === 'vw' && lib.isEdited(current)) out.sample = { gameSound: current.vw.sound, tune: current.vw.tune, stretch: current.vw.stretch, gain: current.vw.gain };
  return Object.keys(out).length ? JSON.stringify(out, null, 2) : '(nothing changed yet)';
}

function resetTweaks() {
  for (const k of Object.keys(DEFAULTS)) if (!NOT_TWEAKS.has(k)) cfg[k] = DEFAULTS[k];
  persist();
  applyKeyboard();
  engine.applySettings();
}

// ---- start ----
async function start() {
  await lib.init();
  current = lib.get(cfg.sample) || lib.samples[0];
  await lib.ensure(current);

  keyboard = new Keyboard($('kb'), {
    onDown: (note, vel, id) => engine.noteOn(id, note, { sample: current, vel }),
    onUp: (id) => engine.noteOff(id),
  });

  panel = new TweaksPanel($('panel'), {
    tabs, entries, tab: cfg.tab,
    onTab: (id) => { cfg.tab = id; persist(); },
    footer: { copy: changedSettings, reset: resetTweaks },
  });
  lib.onRender((s) => { if (s === current) panel.refresh(); });

  applyKeyboard();
  renderStrip();

  // Tweaks on/off.
  const toggle = $('tweaks-toggle');
  const showPanel = (on) => {
    document.body.classList.toggle('tweaks-off', !on);
    toggle.setAttribute('aria-pressed', String(on));
    cfg.panel = on; persist();
  };
  toggle.addEventListener('click', () => showPanel(!cfg.panel));
  showPanel(cfg.panel);

  // "Tap to enable sound" until the audio context is running.
  const pill = $('audio-state');
  engine.onState((state) => { pill.hidden = state === 'running'; });
  // iOS only unlocks audio on touchend/click, so try on every kind of release.
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, () => { if (engine.state !== 'running') engine.unlock(); }, { passive: true });
  }

  // ←/→ switch sample, Z/X shift the octave (the piano row is A-L, so these are free).
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); step(e.code === 'ArrowRight' ? 1 : -1); }
    else if (e.code === 'KeyZ' || e.code === 'KeyX') {
      const octave = Math.max(-2, Math.min(2, cfg.octave + (e.code === 'KeyX' ? 1 : -1)));
      if (octave !== cfg.octave) { cfg.octave = octave; persist(); applyKeyboard(); panel.refresh(); }
    }
  });

  if (new URLSearchParams(location.search).has('debug')) {
    window.synthlab = { engine, keyboard, lib, cfg, synth, panel, select: selectSample, audition, get current() { return current; } };
  }
}

start();
