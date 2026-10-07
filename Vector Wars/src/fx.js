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

// Units falling off the track. They keep running sideways until they pass a
// rail, then drop into the void with gravity and fade out.
export class Fallers {
  constructor(scene, scaleUniform, size, max = 1500) {
    this.max = max;
    this.i = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.w = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vw = new Float32Array(max);
    this.life = new Float32Array(max);
    this.pos = new Float32Array(max * 3);
    this.lifeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) col.set(COLORS.you, i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aLife', this.lifeAttr);
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: sparkVS, fragmentShader: sparkFS,
      uniforms: { uSize: { value: size }, uScale: scaleUniform },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
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
    const L = this.lifeAttr.array, p = this.pos;
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
      // Flicker as they fall, like a dying vector beam.
      L[i] = this.life[i] * (this.y[i] < 0 ? 0.6 + 0.4 * Math.sin(i + this.y[i] * 9) : 1);
    }
    this.lifeAttr.needsUpdate = true;
    this.posAttr.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
