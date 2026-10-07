// Bullets (one LineSegments draw call) and spark particles (one Points draw
// call). Both use preallocated typed arrays — nothing is allocated per frame.

import * as THREE from 'three';
import { CFG, COLORS, ANIM } from './config.js';

export class Bullets {
  constructor(scene) {
    const max = CFG.MAX_BULLETS;
    this.max = max;
    this.x = new Float32Array(max);
    this.w = new Float32Array(max);  // world distance along the track
    this.n = 0;
    this.pos = new Float32Array(max * 6);
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr);
    const lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({
      color: new THREE.Color(...COLORS.bullet),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    lines.frustumCulled = false;
    scene.add(lines);
  }

  fire(x, w) {
    if (this.n >= this.max) return;
    this.x[this.n] = x;
    this.w[this.n] = w;
    this.n++;
  }

  // test(x, oldW, newW) returns true when the bullet hit something.
  update(dt, dist, test) {
    const { x, w } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      const o = w[i], nw = o + CFG.BULLET_SPEED * dt;
      if (nw - dist > CFG.BULLET_RANGE || test(x[i], o, nw)) {
        this.n--;
        x[i] = x[this.n];
        w[i] = w[this.n];
      } else {
        w[i] = nw;
      }
    }
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const z = -(w[i] - dist), j = i * 6;
      p[j] = x[i]; p[j + 1] = 0.25; p[j + 2] = z;
      p[j + 3] = x[i]; p[j + 4] = 0.25; p[j + 5] = z + 0.5;
    }
    this.attr.needsUpdate = true;
    this.geo.setDrawRange(0, this.n * 2);
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

const sparkVS = /* glsl */ `
attribute vec3 aColor;
attribute float aLife;
uniform float uSize;
uniform float uScale;
varying vec3 vC;
void main() {
  vC = aColor * aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aLife > 0.0 ? uSize * uScale / -mv.z * (0.4 + 0.6 * aLife) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;

const sparkFS = /* glsl */ `
varying vec3 vC;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(p, p) * 6.0);
  gl_FragColor = vec4(vC * a, a);
}`;

export class Sparks {
  constructor(scene, scaleUniform, max = 2500) {
    this.max = max;
    this.i = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.w = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vw = new Float32Array(max);
    this.life = new Float32Array(max); this.span = new Float32Array(max).fill(1);
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.lifeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLife', this.lifeAttr);
    this.colAttr = geo.attributes.aColor;
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: sparkVS, fragmentShader: sparkFS,
      uniforms: { uSize: { value: 0.16 }, uScale: scaleUniform },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
  }

  emit(x, y, w, color, count, speed = 3) {
    for (let k = 0; k < count; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.max;
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.x[i] = x; this.y[i] = y; this.w[i] = w;
      this.vx[i] = Math.cos(a) * s; this.vw[i] = Math.sin(a) * s;
      this.vy[i] = 1 + Math.random() * speed;
      this.span[i] = this.life[i] = ANIM.sparkLifeMin + Math.random() * (ANIM.sparkLifeMax - ANIM.sparkLifeMin);
      this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    }
    this.colAttr.needsUpdate = true;
  }

  // A ring of sparks on a circle of radius r, drifting outward: shows an
  // area attack's reach.
  ring(x, y, w, r, color, count) {
    for (let k = 0; k < count; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.max;
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.1;
      this.x[i] = x + Math.cos(a) * r; this.y[i] = y; this.w[i] = w + Math.sin(a) * r;
      this.vx[i] = Math.cos(a) * 2.2; this.vw[i] = Math.sin(a) * 2.2; this.vy[i] = 0.6 + Math.random();
      this.span[i] = this.life[i] = 0.5 + Math.random() * 0.2;
      this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    }
    this.colAttr.needsUpdate = true;
  }

  update(dt, dist) {
    const L = this.lifeAttr.array, p = this.pos;
    const drag = Math.pow(0.05, dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { L[i] = 0; continue; }
      this.life[i] -= dt;
      this.vy[i] -= ANIM.sparkGravity * dt;
      this.vx[i] *= drag; this.vw[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] = Math.max(0.02, this.y[i] + this.vy[i] * dt);
      this.w[i] += this.vw[i] * dt;
      p[i * 3] = this.x[i]; p[i * 3 + 1] = this.y[i]; p[i * 3 + 2] = -(this.w[i] - dist);
      L[i] = Math.max(0, this.life[i] / this.span[i]);
    }
    this.lifeAttr.needsUpdate = true;
    this.posAttr.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// Lost player units burn out: cyan → red → black. aBurn is progress (0..1),
// aLife is brightness (used for flicker and for fallers fading as they drop).
const fizzleVS = /* glsl */ `
attribute float aLife;
attribute float aBurn;
uniform float uSize;
uniform float uScale;
uniform vec3 uYou;
uniform vec3 uRed;
uniform float uRedAt;
varying vec3 vC;
void main() {
  float t = aBurn;
  vec3 c = mix(uYou, uRed, smoothstep(0.0, uRedAt, t)) * (1.0 - smoothstep(uRedAt, 1.0, t));
  vC = c * aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aLife > 0.0 ? uSize * uScale / -mv.z * (1.0 - 0.35 * t) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;

function fizzleMaterial(scaleUniform, size) {
  return new THREE.ShaderMaterial({
    vertexShader: fizzleVS, fragmentShader: sparkFS,
    uniforms: {
      uSize: { value: size }, uScale: scaleUniform,
      uYou: { value: new THREE.Vector3(...COLORS.you) },
      uRed: { value: new THREE.Vector3(...COLORS.dying) },
      uRedAt: { value: ANIM.fizzleRedAt },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function fizzlePoints(scene, max, material) {
  const pos = new Float32Array(max * 3);
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const lifeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
  const burnAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aLife', lifeAttr);
  geo.setAttribute('aBurn', burnAttr);
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pos, posAttr, lifeAttr, burnAttr };
}

// Units lost in place (gates, enemy hits, blasts, the final wipe). They stay
// where they died, so the track carries them away behind the army.
export class Fizzles {
  constructor(scene, scaleUniform, size, max = 3000) {
    this.max = max;
    this.i = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.w = new Float32Array(max);
    this.t = new Float32Array(max).fill(1);
    Object.assign(this, fizzlePoints(scene, max, fizzleMaterial(scaleUniform, size)));
  }

  add(x, y, w) {
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    this.x[i] = x; this.y[i] = y; this.w[i] = w;
    this.t[i] = 0;
  }

  update(dt, dist) {
    const L = this.lifeAttr.array, B = this.burnAttr.array, p = this.pos;
    const rate = 1 / ANIM.fizzleTime;
    for (let i = 0; i < this.max; i++) {
      if (this.t[i] >= 1) { L[i] = 0; continue; }
      this.t[i] = Math.min(1, this.t[i] + dt * rate);
      p[i * 3] = this.x[i]; p[i * 3 + 1] = this.y[i]; p[i * 3 + 2] = -(this.w[i] - dist);
      B[i] = this.t[i];
      L[i] = 0.75 + 0.25 * Math.sin(i * 3.7 + this.t[i] * 40);   // fizzle flicker
    }
    this.lifeAttr.needsUpdate = this.burnAttr.needsUpdate = this.posAttr.needsUpdate = true;
  }

  clear() { this.t.fill(1); }
}

// Units falling off the track. They keep running sideways until they pass a
// rail, then drop into the void with gravity and fade out.
export class Fallers {
  constructor(scene, scaleUniform, size, max = 1500) {
    this.max = max;
    this.i = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.w = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vw = new Float32Array(max);
    this.life = new Float32Array(max);
    Object.assign(this, fizzlePoints(scene, max, fizzleMaterial(scaleUniform, size)));
  }

  // dir = -1 runs off the left rail, +1 the right. vw carries forward motion.
  drop(x, w, dir, vw) {
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    this.x[i] = x; this.y[i] = 0.12; this.w[i] = w;
    this.vx[i] = dir * (ANIM.fallRunMin + Math.random() * (ANIM.fallRunMax - ANIM.fallRunMin));
    this.vy[i] = 0;
    this.vw[i] = vw * (0.6 + Math.random() * 0.4);
    this.life[i] = 1;
  }

  update(dt, dist) {
    const L = this.lifeAttr.array, B = this.burnAttr.array, p = this.pos;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { L[i] = 0; continue; }
      this.x[i] += this.vx[i] * dt;
      this.w[i] += this.vw[i] * dt;
      this.vw[i] *= Math.pow(0.3, dt);
      if (Math.abs(this.x[i]) > CFG.TW) {
        this.vy[i] -= ANIM.fallGravity * dt;
        this.y[i] += this.vy[i] * dt;
        this.vx[i] *= Math.pow(0.5, dt);
        this.life[i] = Math.max(0, 1 + this.y[i] / 5);
      }
      p[i * 3] = this.x[i]; p[i * 3 + 1] = this.y[i]; p[i * 3 + 2] = -(this.w[i] - dist);
      // Burn out as they fall: cyan → red → black over the first ~3 units of drop.
      B[i] = Math.min(1, Math.max(0, -this.y[i] / 3));
      L[i] = this.y[i] < 0 ? 0.75 + 0.25 * Math.sin(i + this.y[i] * 9) : 1;
      if (B[i] >= 1) this.life[i] = 0;
    }
    this.lifeAttr.needsUpdate = this.burnAttr.needsUpdate = this.posAttr.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
