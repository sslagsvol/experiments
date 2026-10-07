// Crowd rendering: the player's swarm and all enemy squads. Each is a single
// THREE.Points draw call. Units sit in sunflower-spiral formation slots and
// spring toward them, which reads as organic movement at O(N) cost.

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';

const SLOTS = Math.max(CFG.MAX_UNITS_VISIBLE, CFG.MAX_PER_SQUAD);
export const OX = new Float32Array(SLOTS);
export const OZ = new Float32Array(SLOTS);
for (let i = 0; i < SLOTS; i++) {
  const r = Math.sqrt(i + 0.5), a = i * 2.39996;
  // Jitter breaks up the spiral moiré that a perfect sunflower shows at high density.
  OX[i] = r * Math.cos(a) + (Math.random() - 0.5) * 0.7;
  OZ[i] = (r * Math.sin(a) + (Math.random() - 0.5) * 0.7) * 0.75;
}

const pointVS = /* glsl */ `
uniform float uSize;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// uShape 0 = soft glowing dot, 1 = outlined diamond (Geometry Wars style)
const pointFS = /* glsl */ `
uniform vec3 uColor;
uniform float uShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (uShape < 0.5) {
    float d = dot(p, p);
    a = exp(-d * 8.0) + smoothstep(1.0, 0.0, d) * 0.06;
  } else {
    float d = abs(p.x) + abs(p.y);
    a = smoothstep(0.95, 0.8, d) * smoothstep(0.45, 0.6, d) + smoothstep(1.0, 0.2, d) * 0.12;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

export function pointMaterial(color, shape, scaleUniform, size) {
  return new THREE.ShaderMaterial({
    vertexShader: pointVS,
    fragmentShader: pointFS,
    uniforms: {
      uColor: { value: new THREE.Vector3(...color) },
      uShape: { value: shape },
      uSize: { value: size },
      uScale: scaleUniform,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function dynamicPoints(scene, max, material) {
  const pos = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);
  return { pos, geo, attr };
}

export class Army {
  constructor(scene, scaleUniform) {
    this.max = CFG.MAX_UNITS_VISIBLE;
    this.mat = pointMaterial(COLORS.you, 0, scaleUniform, 0.2);
    Object.assign(this, dynamicPoints(scene, this.max, this.mat));
    this.V = 0;
    this.radius = 0;
  }

  // Positions are in render space: the army is centered on z = 0.
  update(dt, N, ax, time, onLost) {
    const p = this.pos;
    const Vt = Math.min(N, this.max);
    if (Vt > this.V) {
      for (let i = this.V; i < Vt; i++) { p[i * 3] = ax; p[i * 3 + 1] = 0.12; p[i * 3 + 2] = 0; }
    } else if (Vt < this.V && onLost) {
      for (let i = Vt; i < this.V; i += 2) onLost(p[i * 3], p[i * 3 + 2]);
    }
    this.V = Vt;

    // Dense crowds pack tighter so the army never outgrows the track.
    const sp = Math.min(CFG.UNIT_SPACING, CFG.TW * 0.85 / Math.sqrt(Math.max(Vt, 1)));
    this.radius = sp * Math.sqrt(Vt);
    for (let i = 0; i < Vt; i++) {
      const j = i * 3;
      const k = Math.min(1, dt * (5 + (i % 5) * 1.6));
      p[j] += (ax + OX[i] * sp - p[j]) * k;
      p[j + 1] = 0.12 + Math.abs(Math.sin(time * 11 + i * 1.7)) * 0.05;
      p[j + 2] += (OZ[i] * sp - p[j + 2]) * k;
    }
    this.mat.uniforms.uSize.value = Math.max(sp * 2.0, 0.07);
    this.attr.needsUpdate = true;
    this.geo.setDrawRange(0, Vt);
  }
}

export function squadGeometry(sq) {
  const vn = Math.min(sq.n, CFG.MAX_PER_SQUAD);
  sq.sp = Math.min(CFG.ENEMY_SPACING, CFG.TW * 0.75 / Math.sqrt(Math.max(vn, 1)));
  sq.r = sq.sp * Math.sqrt(vn);
}

export class EnemyView {
  constructor(scene, scaleUniform) {
    this.max = CFG.MAX_ENEMY_VISIBLE;
    this.mat = pointMaterial(COLORS.enemy, 1, scaleUniform, 0.24);
    Object.assign(this, dynamicPoints(scene, this.max, this.mat));
    this.count = 0;
  }

  update(squads, dist, time) {
    const p = this.pos;
    let c = 0;
    for (const sq of squads) {
      const vn = Math.min(sq.n, CFG.MAX_PER_SQUAD);
      const zc = -(sq.wz - dist);
      for (let i = 0; i < vn && c < this.max; i++, c++) {
        p[c * 3] = sq.x + OX[i] * sq.sp + Math.sin(time * 3 + i) * 0.012;
        p[c * 3 + 1] = 0.14;
        p[c * 3 + 2] = zc + OZ[i] * sq.sp;
      }
    }
    this.count = c;
    this.attr.needsUpdate = true;
    this.geo.setDrawRange(0, c);
  }
}
