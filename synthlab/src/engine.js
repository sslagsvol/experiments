// Playback engine: plays a sample's AudioBuffer at a pitch set by the key.
//
//   voice:  BufferSource -> env (attack, velocity) -> rel (release) -> bus
//   master: bus -> master gain -> compressor -> speakers
//   echo:   bus -> send -> delay <-> feedback lowpass -> master
//
// Settings are read from `cfg` at note-on, so the Tweaks panel can change them
// live. The unlock pattern (compressor, master gain, suspend while the tab is
// hidden) follows Vector Wars' src/audio.js.
//
// Browsers only start audio after a user gesture: call unlock() from one.
// iOS only counts touchend/click, so a note pressed while the context is still
// suspended waits briefly for it to resume instead of being lost.

const WAIT_FOR_RESUME_MS = 600;

export class Engine {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.voices = new Map();   // id -> voice that is still held
    this.active = [];          // voices that are sounding, oldest first
    this.listeners = new Set();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  get state() { return this.ctx ? this.ctx.state : 'idle'; }

  onState(fn) { this.listeners.add(fn); fn(this.state); }
  emit() { for (const fn of this.listeners) fn(this.state); }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS: play through the media channel so the silent switch doesn't mute us.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    ctx.addEventListener('statechange', () => this.emit());

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.bus = ctx.createGain();
    this.bus.connect(this.master);

    this.echoSend = ctx.createGain();
    this.echoDelay = ctx.createDelay(1);
    this.echoFb = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 3500;
    this.bus.connect(this.echoSend).connect(this.echoDelay);
    this.echoDelay.connect(tone);
    tone.connect(this.echoFb).connect(this.echoDelay);
    tone.connect(this.master);

    this.applySettings(true);
    this.emit();
  }

  // Pushes master volume and echo settings into the graph.
  applySettings(immediate = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = immediate ? 0.001 : 0.02, c = this.cfg;
    this.master.gain.setTargetAtTime(c.volume, t, k);
    this.echoSend.gain.setTargetAtTime(c.echoMix, t, k);
    this.echoDelay.delayTime.setTargetAtTime(c.echoTime, t, k);
    this.echoFb.gain.setTargetAtTime(Math.min(0.9, c.echoFb), t, k);
  }

  // id names who is holding the note (a pointer, a computer key), so two
  // fingers on the same key are two voices. vel is 0-1.
  noteOn(id, note, { sample, vel = 0.85 } = {}) {
    if (!sample || !sample.buffer) return null;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return null;
    this.noteOff(id);
    const voice = { id, note, sample, vel, mode: this.cfg.mode, started: false, cancelled: false, t0: performance.now() };
    this.voices.set(id, voice);
    if (ctx.state === 'running') {
      this.start(voice);
    } else {
      ctx.resume().then(() => {
        if (ctx.state === 'running' && !voice.cancelled && performance.now() - voice.t0 < WAIT_FOR_RESUME_MS) this.start(voice);
      }).catch(() => {});
    }
    return voice;
  }

  noteOff(id) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    if (v.mode === 'oneshot') return;               // the sample plays out
    if (!v.started) { v.cancelled = true; return; }
    this.release(v, this.cfg.release);
  }

  releaseAll() {
    for (const id of [...this.voices.keys()]) this.noteOff(id);
  }

  start(voice) {
    const ctx = this.ctx, c = this.cfg, s = voice.sample;
    // Over the polyphony cap: fade out the oldest voices that are still held.
    const live = this.active.filter((v) => !v.released);
    for (let i = 0; live.length - i >= c.maxVoices; i++) this.release(live[i], 0.015);

    const buf = c.reverse ? reversedOf(s) : s.buffer;
    const t = ctx.currentTime;
    const cents = c.fine + (Math.random() * 2 - 1) * c.humanize;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 2 ** ((voice.note - s.root + cents / 100) / 12);
    if (voice.mode === 'loop') {
      const loopStart = c.loopStart * buf.duration, loopEnd = c.loopEnd * buf.duration;
      if (loopEnd - loopStart > 0.02) { src.loop = true; src.loopStart = loopStart; src.loopEnd = loopEnd; }
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(voice.vel * (s.gain ?? 1), t + Math.max(0.003, c.attack));
    const rel = ctx.createGain();
    src.connect(env).connect(rel).connect(this.bus);

    Object.assign(voice, { src, env, rel, started: true, released: false });
    this.active.push(voice);
    src.onended = () => {
      const i = this.active.indexOf(voice);
      if (i >= 0) this.active.splice(i, 1);
      src.disconnect(); env.disconnect(); rel.disconnect();
      if (this.voices.get(voice.id) === voice) this.voices.delete(voice.id);
    };
    src.start(t);
  }

  release(voice, seconds) {
    if (!voice.started || voice.released) return;
    voice.released = true;
    const t = this.ctx.currentTime;
    voice.rel.gain.setTargetAtTime(0, t, Math.max(0.005, seconds / 4));
    try { voice.src.stop(t + seconds * 1.5 + 0.03); } catch { /* already stopped */ }
  }
}

// The sample played backwards, built once per rendered buffer.
function reversedOf(sample) {
  if (sample._revFor !== sample.buffer) {
    const b = sample.buffer;
    const r = new AudioBuffer({ length: b.length, sampleRate: b.sampleRate, numberOfChannels: b.numberOfChannels });
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const from = b.getChannelData(ch), to = r.getChannelData(ch);
      for (let i = 0; i < from.length; i++) to[i] = from[from.length - 1 - i];
    }
    sample._rev = r;
    sample._revFor = b;
  }
  return sample._rev;
}
