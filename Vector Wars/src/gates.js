// Gates: pairs of neon panels whose values can be shot up. Pooled; label
// textures only redraw when their text changes. When the army crosses, the
// primary panel (the one its center went through) shatters.

import * as THREE from 'three';
import { CFG, COLORS, ANIM, fmt } from './config.js';

export const FONT = '"Share Tech Mono", ui-monospace, monospace';

const panelVS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const panelFS = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uFlash;
uniform float uCharge;
uniform float uFade;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vec2 q = vUv * uSize;
  float e = min(min(q.x, uSize.x - q.x), min(q.y, uSize.y - q.y));
  float border = smoothstep(0.06, 0.03, e);
  float halo = smoothstep(0.2, 0.0, e) * 0.12;
  float fill = 0.05 + uFlash * 0.25;
  float txt = texture2D(uTex, vUv).r;
  float bar = (vUv.y > 0.04 && vUv.y < 0.1 && vUv.x < uCharge) ? 1.0 : 0.0;
  vec3 ink = mix(uColor * 0.55, vec3(0.9), 0.35);
  vec3 c = uColor * (border * 0.9 + halo + fill) * (1.0 - txt) + ink * txt + vec3(1.2) * bar;
  gl_FragColor = vec4(c * uFade, 1.0);
}`;

export function gateColor(s) {
  if (s.op === 'level') return COLORS.white;
  return s.op === 'x' ? COLORS.mult : s.op === '/' ? COLORS.div : s.v >= 0 ? COLORS.add : COLORS.sub;
}

export function gateLabel(s) {
  if (s.op === 'level') return 'LEVEL ' + s.n;
  if (s.op === 'x') return '×' + s.m.toFixed(1);
  if (s.op === '/') return '÷' + s.d.toFixed(1);
  return (s.v >= 0 ? '+' : '−') + fmt(Math.abs(s.v));
}

class Panel {
  constructor(group, x, w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = Math.round(512 * h / w);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: panelVS,
      fragmentShader: panelFS,
      uniforms: {
        uTex: { value: this.tex },
        uColor: { value: new THREE.Vector3() },
        uFlash: { value: 0 },
        uCharge: { value: 0 },
        uFade: { value: 1 },
        uSize: { value: new THREE.Vector2(w, h) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.position.set(x, h / 2, 0);
    group.add(this.mesh);
    this.x = x; this.w = w; this.h = h;
    this.label = '';
  }

  // shatter: 0 = intact, 0..1 = breaking apart after the army went through.
  sync(s, fade, shatter = 0) {
    const label = gateLabel(s);
    if (label !== this.label) {
      this.label = label;
      const { ctx, canvas } = this;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(canvas.height * (label.length > 4 ? CFG.GATE_TEXT.long : CFG.GATE_TEXT.short))}px ${FONT}`;
      ctx.fillText(label, canvas.width / 2, canvas.height * 0.52);
      this.tex.needsUpdate = true;
    }
    const u = this.mat.uniforms;
    u.uColor.value.set(...gateColor(s));
    u.uFlash.value = Math.max(s.f, shatter > 0 ? 1 - shatter : 0);
    u.uCharge.value = s.ch || 0;
    u.uFade.value = fade * (1 - shatter);
    const k = 1 + shatter * 0.5;
    this.mesh.scale.set(k, k, 1);
  }
}

// A gate is either a pair (L / R panels splitting the track) or a single
// panel (S): moving (sways side to side) or fixed (authored levels). sx is
// its current center, sw its width.
class Gate {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const w = CFG.TW - 0.1, h = CFG.GATE_H;
    this.left = new Panel(this.group, -(0.05 + w / 2), w, h);
    this.right = new Panel(this.group, 0.05 + w / 2, w, h);
    this.singles = new Map();   // one panel per single-gate width, made on first use
    scene.add(this.group);
  }

  get panels() { return this.S ? [this.S] : [this.L, this.R]; }

  get single() {
    let p = this.singles.get(this.sw);
    if (!p) { p = new Panel(this.group, 0, this.sw, CFG.GATE_H); this.singles.set(this.sw, p); }
    return p;
  }

  // Current center of a moving gate (it keeps swaying until crossed).
  moveTo(time) {
    if (!this.S || this.done || this.fixed) return;
    const amp = CFG.TW - CFG.MOVING_GATE_WIDTH / 2 - 0.05;
    this.sx = amp * Math.sin(time * CFG.MOVING_GATE_SPEED + this.phase);
  }

  sync(dist, time) {
    const z = -(this.wz - dist);
    this.group.position.z = z;
    const fade = this.done ? 0.3 : Math.min(1, (CFG.VIEW_AHEAD + z) / 14);
    const shatter = this.primary ? Math.min(1, (time - this.doneAt) / ANIM.gateShatter) : 0;
    this.left.mesh.visible = this.right.mesh.visible = !this.S;
    for (const p of this.singles.values()) p.mesh.visible = false;
    if (this.S) {
      this.single.mesh.visible = true;
      this.single.mesh.position.x = this.sx;
      this.single.sync(this.S, fade, this.primary === 'S' ? shatter : 0);
    } else {
      this.left.sync(this.L, fade, this.primary === 'L' ? shatter : 0);
      this.right.sync(this.R, fade, this.primary === 'R' ? shatter : 0);
    }
  }
}

export class GatePool {
  constructor(scene) {
    this.scene = scene;
    this.free = [];
    this.active = [];
  }

  // A pair (L, R), or a single gate when S is given: moving by default, or
  // fixed at opts.x with opts.width (authored levels). opts.slow slows the
  // track on its approach.
  acquire(wz, L, R, S = null, phase = 0, opts = {}) {
    const g = this.free.pop() || new Gate(this.scene);
    Object.assign(g, {
      wz, L, R, S, phase, sx: opts.x || 0, sw: opts.width || CFG.MOVING_GATE_WIDTH,
      fixed: opts.width !== undefined, slow: !!opts.slow, done: false, primary: null, doneAt: 0,
      rush: 0, bonus: false,   // pooled: clear what the last user set (a boss-fight gift's rush, a bonus flag)
    });
    g.group.visible = true;
    this.active.push(g);
    return g;
  }

  release(g) {
    g.group.visible = false;
    this.active.splice(this.active.indexOf(g), 1);
    this.free.push(g);
  }

  clear() { while (this.active.length) this.release(this.active[0]); }

  invalidate() {
    for (const g of [...this.active, ...this.free]) { g.left.label = ''; g.right.label = ''; for (const p of g.singles.values()) p.label = ''; }
  }
}
