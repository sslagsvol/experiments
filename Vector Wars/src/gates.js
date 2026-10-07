// Gates (pairs of neon panels whose values can be shot up) and the floating
// count labels above enemy squads. Both are pooled; label textures only
// redraw when their text changes.

import * as THREE from 'three';
import { CFG, COLORS, fmt } from './config.js';

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
  return s.op === 'x' ? COLORS.mult : s.v >= 0 ? COLORS.add : COLORS.sub;
}

export function gateLabel(s) {
  return s.op === 'x' ? '×' + s.m : (s.v >= 0 ? '+' : '−') + fmt(Math.abs(s.v));
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
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    mesh.position.set(x, h / 2, 0);
    group.add(mesh);
    this.label = '';
  }

  sync(s, fade) {
    const label = gateLabel(s);
    if (label !== this.label) {
      this.label = label;
      const { ctx, canvas } = this;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(canvas.height * (label.length > 4 ? 0.5 : 0.62))}px ${FONT}`;
      ctx.fillText(label, canvas.width / 2, canvas.height * 0.52);
      this.tex.needsUpdate = true;
    }
    const u = this.mat.uniforms;
    u.uColor.value.set(...gateColor(s));
    u.uFlash.value = s.f;
    u.uCharge.value = s.op === 'x' ? s.ch : 0;
    u.uFade.value = fade;
  }
}

class Gate {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const w = CFG.TW - 0.1, h = CFG.GATE_H;
    this.left = new Panel(this.group, -(0.05 + w / 2), w, h);
    this.right = new Panel(this.group, 0.05 + w / 2, w, h);
    scene.add(this.group);
  }

  sync(dist) {
    const z = -(this.wz - dist);
    this.group.position.z = z;
    const fade = this.done ? 0.3 : Math.min(1, (CFG.VIEW_AHEAD + z) / 14);
    this.left.sync(this.L, fade);
    this.right.sync(this.R, fade);
  }
}

export class GatePool {
  constructor(scene) {
    this.scene = scene;
    this.free = [];
    this.active = [];
  }

  acquire(wz, L, R) {
    const g = this.free.pop() || new Gate(this.scene);
    Object.assign(g, { wz, L, R, done: false });
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
    for (const g of [...this.active, ...this.free]) { g.left.label = ''; g.right.label = ''; }
  }
}

export class CountLabel {
  constructor(scene, color) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshBasicMaterial({
        map: this.tex, color: new THREE.Color(...color),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.value = null;
  }

  set(n) {
    if (n === this.value) return;
    this.value = n;
    const { ctx, canvas } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `80px ${FONT}`;
    ctx.fillText(fmt(n), canvas.width / 2, canvas.height / 2);
    this.tex.needsUpdate = true;
  }
}

export class LabelPool {
  constructor(scene, color) { this.scene = scene; this.color = color; this.free = []; }
  acquire() {
    const l = this.free.pop() || new CountLabel(this.scene, this.color);
    l.mesh.visible = true;
    l.value = null;
    return l;
  }
  release(l) { l.mesh.visible = false; this.free.push(l); }
}
