// Crowd rendering: the player's swarm as a single THREE.Points draw call,
// plus the shared point-sprite material (also used by enemies.js). Units spring toward formation slots, which reads as
// organic movement at O(N) cost.

import * as THREE from 'three';
import { CFG, COLORS, ANIM } from './config.js';
import { FORMATIONS, UNIT_SPACING, packing } from './formations.js';

const HIDDEN = -100;   // y for unused point slots (drawn off-screen)

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
    a = exp(-d * 11.0) * 0.85 + smoothstep(1.0, 0.0, d) * 0.03;
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

// The player's swarm. Every dot is exactly one unit (N <= CFG.CAPACITY).
// Unit i owns formation slot i; slots are ordered center-out, so the crowd
// grows outward and losses come off the rim. Units that end up past a rail
// fall off; holes left behind are refilled from the rim when back in bounds.
export class Army {
  constructor(scene, scaleUniform) {
    this.cap = CFG.CAPACITY;
    this.mat = pointMaterial(COLORS.you, 0, scaleUniform, UNIT_SPACING * 1.3);
    Object.assign(this, dynamicPoints(scene, this.cap, this.mat));
    this.alive = new Uint8Array(this.cap);
    this.reset();
  }

  reset() {
    this.alive.fill(0);
    for (let i = 0; i < this.cap; i++) this.pos[i * 3 + 1] = HIDDEN;
    this.N = 0;
    this.L = 0;              // one past the highest occupied slot
    this.pat = 0;
    this.prev = 0;
    this.morphT0 = -99;
    this.clock = 0;          // drives the swirl
    this.shakeAmt = 0;
    this.ax = 0;
    this.pack = 1;
    this.cx = 0; this.halfW = 0; this.front = 0; this.back = 0; this.radius = 0;
    this.geo.setDrawRange(0, 0);
  }

  get formation() { return FORMATIONS[this.pat].name; }

  // Writes slot i's offset from the army center into this.tx / this.tz.
  slot(p, i) {
    const f = FORMATIONS[p];
    const a = f.A[i] + f.D[i] * f.spin * this.clock, r = f.R[i] * this.pack;
    this.tx = r * Math.cos(a);
    this.tz = r * Math.sin(a) * CFG.FORMATION_DEPTH;
  }

  inBounds(i) {
    this.slot(this.pat, i);
    return Math.abs(this.ax + this.tx) < CFG.TW - 0.05;
  }

  // Adds up to n units into open, on-track slots. Returns how many didn't fit.
  spawn(n, x = this.ax) {
    const p = this.pos;
    // Tighten to the new size first so units that will fit aren't counted as overflow.
    this.pack = Math.min(this.pack, packing(Math.min(this.cap, this.N + n)));
    let left = n;
    for (let i = 0; i < this.cap && left > 0; i++) {
      if (this.alive[i] || !this.inBounds(i)) continue;
      this.alive[i] = 1;
      p[i * 3] = x + (Math.random() - 0.5) * 0.2;
      p[i * 3 + 1] = 0.12;
      p[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      this.N++;
      left--;
      if (i >= this.L) this.L = i + 1;
    }
    return left;
  }

  // Removes up to n units from the rim. onLost(x, z) fires for each.
  kill(n, onLost) {
    const p = this.pos;
    let k = 0;
    for (let i = this.L - 1; i >= 0 && k < n; i--) {
      if (!this.alive[i]) continue;
      this.alive[i] = 0;
      if (onLost) onLost(p[i * 3], p[i * 3 + 2]);
      p[i * 3 + 1] = HIDDEN;
      this.N--;
      k++;
    }
    this.shrink();
    return k;
  }

  // Removes up to n units nearest to (x, z): where an enemy hit.
  killNear(x, z, n, onLost) {
    const p = this.pos;
    let k = 0;
    for (; k < n && this.N > 0; k++) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < this.L; i++) {
        if (!this.alive[i]) continue;
        const dx = p[i * 3] - x, dz = p[i * 3 + 2] - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      this.alive[best] = 0;
      if (onLost) onLost(p[best * 3], p[best * 3 + 2]);
      p[best * 3 + 1] = HIDDEN;
      this.N--;
    }
    this.shrink();
    return k;
  }

  // Units on each side of the track's center line: [left, right].
  countSides() {
    let left = 0;
    for (let i = 0; i < this.L; i++) if (this.alive[i] && this.pos[i * 3] < 0) left++;
    return [left, this.N - left];
  }

  // Units with x in [x0, x1] (a moving gate's span).
  countRange(x0, x1) {
    let n = 0;
    for (let i = 0; i < this.L; i++) if (this.alive[i] && this.pos[i * 3] >= x0 && this.pos[i * 3] <= x1) n++;
    return n;
  }

  // Removes up to n units from one side (sign -1 = left, +1 = right), rim first.
  killSide(sign, n, onLost) {
    return this.killRange(sign < 0 ? -Infinity : 0, sign < 0 ? 0 : Infinity, n, onLost);
  }

  // Removes up to n units with x in [x0, x1], rim first.
  killRange(x0, x1, n, onLost) {
    const p = this.pos;
    let k = 0;
    for (let i = this.L - 1; i >= 0 && k < n; i--) {
      if (!this.alive[i] || p[i * 3] < x0 || p[i * 3] > x1) continue;
      this.alive[i] = 0;
      if (onLost) onLost(p[i * 3], p[i * 3 + 2]);
      p[i * 3 + 1] = HIDDEN;
      this.N--;
      k++;
    }
    this.shrink();
    return k;
  }

  // Area damage around (x, z): each unit within r dies with a chance that
  // falls from `peak` at the center to 0 at the edge, up to `max` units.
  killArea(x, z, r, peak, max, onLost) {
    const p = this.pos, r2 = r * r;
    let k = 0;
    for (let i = 0; i < this.L && k < max; i++) {
      if (!this.alive[i]) continue;
      const dx = p[i * 3] - x, dz = p[i * 3 + 2] - z, d2 = dx * dx + dz * dz;
      if (d2 > r2 || Math.random() > peak * (1 - d2 / r2)) continue;
      this.alive[i] = 0;
      if (onLost) onLost(p[i * 3], p[i * 3 + 2]);
      p[i * 3 + 1] = HIDDEN;
      this.N--;
      k++;
    }
    this.shrink();
    return k;
  }

  nextFormation(time) {
    this.prev = this.pat;
    this.pat = (this.pat + 1) % FORMATIONS.length;
    this.morphT0 = time;
  }

  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }

  // An area attack at (x, z), radius r: throw nearby units outward (never off
  // the track) and slow the formation's recovery (ANIM.blast*).
  blast(x, z, r) {
    const p = this.pos, R = r * ANIM.blastReach, lim = CFG.TW - 0.08;
    for (let i = 0; i < this.L; i++) {
      if (!this.alive[i]) continue;
      const j = i * 3, dx = p[j] - x, dz = p[j + 2] - z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const f = (1 - d / R) * ANIM.blastPush, a = d > 1e-3 ? 0 : Math.random() * Math.PI * 2;
      p[j] = Math.max(-lim, Math.min(lim, p[j] + (d > 1e-3 ? dx / d : Math.cos(a)) * f));
      p[j + 2] += (d > 1e-3 ? dz / d : Math.sin(a)) * f;
    }
    this.recoverT = ANIM.blastRecover;
  }

  shrink() { while (this.L > 0 && !this.alive[this.L - 1]) this.L--; }

  // onFall(x, z) fires for each unit that crosses a rail.
  update(dt, ax, time, onFall) {
    this.ax = ax;
    // Big armies pack tighter; shrink the dots and dim them so a dense crowd
    // still shows its pattern instead of saturating to white.
    this.pack += (packing(this.N) - this.pack) * Math.min(1, dt * 3);
    this.mat.uniforms.uSize.value = UNIT_SPACING * 1.3 * this.pack;
    this.mat.uniforms.uColor.value.set(...COLORS.you).multiplyScalar(Math.pow(Math.min(1, this.pack), 0.8));   // dim only when packed tight
    const since = time - this.morphT0;
    this.clock += dt * (1 + ANIM.swirlBurst * Math.exp(-since * ANIM.swirlBurstDecay));
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * ANIM.shakeDecay);
    // After a blast the formation drifts back slowly, easing up to normal speed.
    this.recoverT = Math.max(0, (this.recoverT || 0) - dt);
    const recover = this.recoverT > 0 ? ANIM.blastRecoverRate + (1 - ANIM.blastRecoverRate) * Math.pow(1 - this.recoverT / ANIM.blastRecover, 2) : 1;

    const p = this.pos, alive = this.alive, cur = FORMATIONS[this.pat];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, sumX = 0;
    for (let i = 0; i < this.L; i++) {
      if (!alive[i]) continue;
      this.slot(since >= cur.delay[i] ? this.pat : this.prev, i);
      let tx = ax + this.tx, tz = this.tz;
      if (this.shakeAmt > 0) {
        tx += Math.sin(i * 12.9898 + time * 31) * this.shakeAmt;
        tz += Math.sin(i * 78.233 + time * 27) * this.shakeAmt;
      }
      const j = i * 3, k = Math.min(1, dt * (6 + (i % 5) * 1.5) * recover);
      p[j] += (tx - p[j]) * k;
      p[j + 1] = 0.12 + Math.abs(Math.sin(time * ANIM.bobFreq + i * 1.7)) * ANIM.bobHeight;
      p[j + 2] += (tz - p[j + 2]) * k;
      if (Math.abs(p[j]) > CFG.TW) {
        alive[i] = 0;
        p[j + 1] = HIDDEN;
        this.N--;
        if (onFall) onFall(p[j], p[j + 2]);
        continue;
      }
      if (p[j] < minX) minX = p[j];
      if (p[j] > maxX) maxX = p[j];
      if (p[j + 2] < minZ) minZ = p[j + 2];
      if (p[j + 2] > maxZ) maxZ = p[j + 2];
      sumX += p[j];
    }

    // Regroup: move rim units into inner holes that are back on the track.
    let h = 0, t = this.L - 1;
    for (let moves = 0; moves < (this.recoverT > 0 ? 0 : 6); moves++) {   // (holes stay open while recovering from a blast)
      while (h < t && (alive[h] || !this.inBounds(h))) h++;
      while (t > h && !alive[t]) t--;
      if (h >= t) break;
      p[h * 3] = p[t * 3]; p[h * 3 + 1] = p[t * 3 + 1]; p[h * 3 + 2] = p[t * 3 + 2];
      alive[h] = 1; alive[t] = 0; p[t * 3 + 1] = HIDDEN;
      h++; t--;
    }
    this.shrink();

    if (this.N > 0) {
      this.cx = sumX / this.N;
      this.halfW = (maxX - minX) / 2;
      this.front = minZ;
      this.back = maxZ;
      this.radius = Math.max(this.halfW, (maxZ - minZ) / 2);
    } else {
      this.halfW = this.front = this.back = this.radius = 0;
    }
    this.attr.needsUpdate = true;
    this.geo.setDrawRange(0, this.L);
  }
}
