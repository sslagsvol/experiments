// Enemy force: every enemy is an individual unit (one THREE.Points draw call
// for all of them, with per-unit shape, size and color). Squads hold
// formation until the army gets close, then charge. Enemies that reach the
// army, or slip past it to the rear, die and take player units with them.

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';
import { enemyFormation, ENEMY_KINDS, ENEMY_TYPES, TYPE_LIST, squadMix, unitType } from './enemyFormations.js';

const enemyVS = /* glsl */ `
attribute float aShape;
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uTime;
varying float vShape;
varying vec3 vColor;
varying float vPulse;
void main() {
  vShape = aShape;
  vColor = aColor;
  vPulse = 0.5 + 0.5 * sin(uTime * 9.0 + position.x * 7.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Outlined shapes, Geometry Wars style: 0 diamond, 1 triangle (pointing at
// the player), 2 ring with a pulsing core, 3 heavy hexagon.
const enemyFS = /* glsl */ `
varying float vShape;
varying vec3 vColor;
varying float vPulse;
float outline(float d, float r, float w) { return smoothstep(r + w, r, d) * smoothstep(r - w * 2.5, r - w, d); }
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (vShape < 0.5) {
    float d = abs(p.x) + abs(p.y);
    a = outline(d, 0.7, 0.12) + smoothstep(1.0, 0.2, d) * 0.04;
  } else if (vShape < 1.5) {
    vec2 q = vec2(abs(p.x), p.y);
    float d = max(q.x * 0.866 - q.y * 0.5, q.y) * 1.25;
    a = outline(d, 0.6, 0.1) + smoothstep(1.0, 0.2, d) * 0.04;
  } else if (vShape < 2.5) {
    float d = length(p);
    a = outline(d, 0.68, 0.1) + exp(-d * d * 14.0) * (0.5 + vPulse * 0.8);
  } else {
    vec2 q = abs(p);
    float d = max(q.x * 0.866 + q.y * 0.5, q.y);
    a = outline(d, 0.72, 0.09) + outline(d, 0.42, 0.07) * 0.7 + smoothstep(1.0, 0.2, d) * 0.06;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

// Dimmed below the bloom threshold so dense formations keep readable shapes;
// hit flashes push them back over it.
const TYPE_COLORS = TYPE_LIST.map((t) => COLORS[t.color].map((v) => v * 0.55));

export class EnemyForce {
  constructor(scene, scaleUniform) {
    const max = CFG.MAX_ENEMIES;
    this.max = max;
    this.x = new Float32Array(max);
    this.w = new Float32Array(max);    // world distance along the track
    this.ox = new Float32Array(max);   // formation x offset
    this.hp = new Float32Array(max);
    this.flash = new Float32Array(max);
    this.type = new Uint8Array(max);
    this.alive = new Uint8Array(max);
    this.owner = new Int32Array(max);  // id of the squad a slot belongs to (slots get recycled)
    this.nextId = 1;

    this.pos = new Float32Array(max * 3);
    this.shapeArr = new Float32Array(max);
    this.sizeArr = new Float32Array(max);
    this.colArr = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [dyn(this.pos, 3), dyn(this.shapeArr, 1), dyn(this.sizeArr, 1), dyn(this.colArr, 3)];
    ['position', 'aShape', 'aSize', 'aColor'].forEach((k, i) => this.geo.setAttribute(k, this.attrs[i]));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: enemyVS, fragmentShader: enemyFS,
      uniforms: { uScale: scaleUniform, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(this.geo, this.mat);
    pts.frustumCulled = false;
    scene.add(pts);
    this.reset();
  }

  reset() {
    this.alive.fill(0);
    this.free = [];
    for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
    this.squads = [];
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  spawnSquad(kind, n, anchorX, anchorW, rng, squadIndex) {
    const { pts, halfW } = enemyFormation(kind, Math.min(n, CFG.MAX_PER_SQUAD), rng);
    const mix = squadMix(kind, squadIndex);
    const lim = Math.max(0, CFG.TW * 0.95 - halfW);
    anchorX = Math.max(-lim, Math.min(lim, anchorX));
    const s = { id: this.nextId++, kind, ax: anchorX, spread: ENEMY_KINDS[kind].spread, units: [], n: 0, charging: false,
      minX: 0, maxX: 0, minW: anchorW, maxW: anchorW, cx: anchorX, cw: anchorW };
    pts.forEach(([px, pz], k) => {
      if (!this.free.length) return;
      const i = this.free.pop(), t = ENEMY_TYPES[unitType(mix, k, pts.length, rng)];
      this.x[i] = anchorX + px;
      this.w[i] = anchorW + pz;
      this.ox[i] = px;
      this.type[i] = t.id;
      this.hp[i] = t.hp;
      this.flash[i] = 0;
      this.alive[i] = 1;
      this.owner[i] = s.id;
      s.units.push(i);
      s.n++;
    });
    this.squads.push(s);
    this.bounds(s);
    return s;
  }

  kill(i, s) { this.alive[i] = 0; this.free.push(i); s.n--; }

  bounds(s) {
    let minX = 1e9, maxX = -1e9, minW = 1e9, maxW = -1e9, sx = 0, sw = 0;
    for (const i of s.units) {
      if (!this.alive[i] || this.owner[i] !== s.id) continue;
      const x = this.x[i], w = this.w[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (w < minW) minW = w; if (w > maxW) maxW = w;
      sx += x; sw += w;
    }
    if (s.n > 0) Object.assign(s, { minX, maxX, minW, maxW, cx: sx / s.n, cw: sw / s.n });
  }

  // onHit(type, x, renderZ, leaked) fires once per enemy that reaches the
  // army (leaked = it got past and hit the rear).
  update(dt, dist, army, time, onHit) {
    this.mat.uniforms.uTime.value = time;
    this.armyFront = army.front;
    for (const s of this.squads) {
      if (s.n <= 0) continue;
      // Distance from the army's front row to the squad's nearest unit.
      if (!s.charging && army.N > 0 && s.minW - dist + army.front < CFG.ENEMY_TRIGGER) s.charging = true;
      for (const i of s.units) {
        if (!this.alive[i] || this.owner[i] !== s.id) continue;
        this.flash[i] = Math.max(0, this.flash[i] - dt * 6);
        const t = TYPE_LIST[this.type[i]];
        if (!s.charging) {
          // Drones hover side to side even while waiting.
          // (Around the squad's fixed anchor; using the live centroid fed back
          // into itself and let drones drift off the track.)
          if (t.strafe) this.x[i] = Math.max(-CFG.TW + 0.05, Math.min(CFG.TW - 0.05, s.ax + this.ox[i] + Math.sin(time * 2 + i) * 0.15));
          continue;
        }
        // Stragglers far from the fight run faster so battles don't drag.
        const gap = this.w[i] - dist + army.front;
        this.w[i] -= (CFG.ENEMY_CHARGE_SPEED * t.speed + Math.max(0, gap - 6) * CFG.ENEMY_CATCHUP) * dt;
        // Hold formation on the approach; once level with the army, turn
        // inward and hit its flank. Bombers always home on the center;
        // drones weave.
        const rz = -(this.w[i] - dist);
        const close = rz > army.front - 1.2;
        let tx = close || t.converge ? army.cx : army.cx + this.ox[i] * s.spread;
        if (t.strafe && !close) tx += Math.sin(time * 2.5 + i * 1.3) * t.strafe;
        const step = CFG.ENEMY_HOMING * t.homing * (close ? 3 : 1) * dt;
        this.x[i] += Math.max(-step, Math.min(step, tx - this.x[i]));
        this.x[i] = Math.max(-CFG.TW + 0.05, Math.min(CFG.TW - 0.05, this.x[i]));
        if (army.N <= 0) continue;
        if (rz >= army.front - 0.05 && rz <= army.back + 0.3 && Math.abs(this.x[i] - army.cx) <= army.halfW + 0.12) {
          this.kill(i, s);
          onHit(t, this.x[i], rz, false);
        } else if (rz > army.back + CFG.ENEMY_LEAK_MARGIN) {
          this.kill(i, s);
          onHit(t, this.x[i], army.back, true);
        }
      }
      this.bounds(s);
    }

    const p = this.pos, sh = this.shapeArr, sz = this.sizeArr, col = this.colArr;
    let c = 0;
    for (const s of this.squads) {
      for (const i of s.units) {
        if (!this.alive[i] || this.owner[i] !== s.id) continue;
        const t = TYPE_LIST[this.type[i]], k = TYPE_COLORS[t.id];
        let f = 1 + this.flash[i] * 2.5;
        // Area attackers telegraph: they throb brighter as they close in.
        if (t.aoe && s.charging) {
          const gap = this.w[i] - dist + this.armyFront;   // distance ahead of the army's front row
          const close = Math.min(1, Math.max(0, 1 - gap / 4));
          f += close * (0.8 + 0.8 * Math.sin(time * 14 + i));
        }
        p[c * 3] = this.x[i];
        p[c * 3 + 1] = 0.14 * t.size + (s.charging ? Math.abs(Math.sin(time * 13 + i)) * 0.05 : 0);
        p[c * 3 + 2] = -(this.w[i] - dist);
        sh[c] = t.shape;
        sz[c] = 0.18 * t.size;
        col[c * 3] = k[0] * f; col[c * 3 + 1] = k[1] * f; col[c * 3 + 2] = k[2] * f;
        c++;
      }
    }
    this.count = c;
    for (const a of this.attrs) a.needsUpdate = true;
    this.geo.setDrawRange(0, c);
  }

  // Bullet sweep from oldW to newW at x. Returns { s, killed } or null.
  hitTest(x, oldW, newW) {
    const r0 = 0.13;
    for (const s of this.squads) {
      const r = r0 * 2.3;
      if (s.n <= 0 || x < s.minX - r || x > s.maxX + r || newW < s.minW - r || oldW > s.maxW + r) continue;
      for (const i of s.units) {
        if (!this.alive[i] || this.owner[i] !== s.id) continue;
        const ri = r0 * TYPE_LIST[this.type[i]].size;
        if (Math.abs(this.x[i] - x) < ri && this.w[i] >= oldW - ri && this.w[i] <= newW + ri) {
          this.flash[i] = 1;
          const t = TYPE_LIST[this.type[i]];
          if (--this.hp[i] > 0) return { s, t, killed: false };
          this.kill(i, s);
          this.bounds(s);
          return { s, t, killed: true };
        }
      }
    }
    return null;
  }

  // True while any charging squad still has units left.
  battling() {
    for (const s of this.squads) if (s.n > 0 && s.charging) return true;
    return false;
  }

  // Expected damage from charging squads whose front is within `range`.
  threat(dist, army, range) {
    let t = 0;
    for (const s of this.squads) {
      if (s.n <= 0 || !s.charging || s.minW - dist + army.front >= range) continue;
      for (const i of s.units) if (this.alive[i] && this.owner[i] === s.id) t += TYPE_LIST[this.type[i]].est;
    }
    return t;
  }

  squadStrength(s) {
    let t = 0;
    for (const i of s.units) if (this.alive[i] && this.owner[i] === s.id) t += TYPE_LIST[this.type[i]].est;
    return t;
  }

  prune() { this.squads = this.squads.filter((s) => s.n > 0); }
}
