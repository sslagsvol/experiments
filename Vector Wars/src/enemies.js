// Enemy force: every enemy is an individual unit (one THREE.Points draw call
// for all of them). Squads hold formation until the army gets close, then
// charge. Each enemy that reaches the army dies and takes out the player
// units nearest to where it hit.

import * as THREE from 'three';
import { CFG, COLORS } from './config.js';
import { pointMaterial } from './crowd.js';
import { enemyFormation, ENEMY_KINDS } from './enemyFormations.js';

export class EnemyForce {
  constructor(scene, scaleUniform) {
    const max = CFG.MAX_ENEMIES;
    this.max = max;
    this.x = new Float32Array(max);
    this.w = new Float32Array(max);   // world distance along the track
    this.ox = new Float32Array(max);  // formation x offset
    this.alive = new Uint8Array(max);
    this.pos = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr);
    const pts = new THREE.Points(this.geo, pointMaterial(COLORS.enemy, 1, scaleUniform, 0.22));
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

  spawnSquad(kind, n, anchorX, anchorW, rng, label) {
    const { pts, halfW } = enemyFormation(kind, Math.min(n, CFG.MAX_PER_SQUAD), rng);
    const lim = Math.max(0, CFG.TW * 0.95 - halfW);
    anchorX = Math.max(-lim, Math.min(lim, anchorX));
    const s = { kind, spread: ENEMY_KINDS[kind].spread, units: [], n: 0, label, charging: false,
      minX: 0, maxX: 0, minW: anchorW, maxW: anchorW, cx: anchorX, cw: anchorW };
    for (const [px, pz] of pts) {
      if (!this.free.length) break;
      const i = this.free.pop();
      this.x[i] = anchorX + px;
      this.w[i] = anchorW + pz;
      this.ox[i] = px;
      this.alive[i] = 1;
      s.units.push(i);
      s.n++;
    }
    this.squads.push(s);
    this.bounds(s);
    return s;
  }

  kill(i, s) { this.alive[i] = 0; this.free.push(i); s.n--; }

  bounds(s) {
    let minX = 1e9, maxX = -1e9, minW = 1e9, maxW = -1e9, sx = 0, sw = 0;
    for (const i of s.units) {
      if (!this.alive[i]) continue;
      const x = this.x[i], w = this.w[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (w < minW) minW = w; if (w > maxW) maxW = w;
      sx += x; sw += w;
    }
    if (s.n > 0) Object.assign(s, { minX, maxX, minW, maxW, cx: sx / s.n, cw: sw / s.n });
  }

  // onContact(x, renderZ) fires once per enemy that reaches the army.
  update(dt, dist, army, time, onContact) {
    for (const s of this.squads) {
      if (s.n <= 0) continue;
      // Distance from the army's front row to the squad's nearest unit.
      if (!s.charging && army.N > 0 && s.minW - dist + army.front < CFG.ENEMY_TRIGGER) s.charging = true;
      if (s.charging) {
        for (const i of s.units) {
          if (!this.alive[i]) continue;
          // Stragglers far from the fight run faster so battles don't drag.
          const gap = this.w[i] - dist + army.front;
          this.w[i] -= (CFG.ENEMY_CHARGE_SPEED + Math.max(0, gap - 3) * 0.6) * dt;
          // Hold formation on the approach; once level with the army, turn
          // inward and hit its flank instead of running past.
          const close = -(this.w[i] - dist) > army.front - 1.2;
          const tx = close ? army.cx : army.cx + this.ox[i] * s.spread;
          const step = CFG.ENEMY_HOMING * (close ? 3 : 1) * dt;
          this.x[i] += Math.max(-step, Math.min(step, tx - this.x[i]));
          this.x[i] = Math.max(-CFG.TW + 0.05, Math.min(CFG.TW - 0.05, this.x[i]));
          const rz = -(this.w[i] - dist);
          if (army.N > 0 && rz >= army.front - 0.05 && rz <= army.back + 0.3 &&
              Math.abs(this.x[i] - army.cx) <= army.halfW + 0.12) {
            this.kill(i, s);
            onContact(this.x[i], rz);
          } else if (rz > army.back + 2) {
            this.kill(i, s);   // slipped past the army
          }
        }
      }
      this.bounds(s);
    }

    const p = this.pos;
    let c = 0;
    for (const s of this.squads) {
      for (const i of s.units) {
        if (!this.alive[i]) continue;
        p[c * 3] = this.x[i];
        p[c * 3 + 1] = 0.14 + (s.charging ? Math.abs(Math.sin(time * 13 + i)) * 0.05 : 0);
        p[c * 3 + 2] = -(this.w[i] - dist);
        c++;
      }
    }
    this.count = c;
    this.attr.needsUpdate = true;
    this.geo.setDrawRange(0, c);
  }

  // Bullet sweep from oldW to newW at x. Returns the squad hit, or null.
  hitTest(x, oldW, newW) {
    const r = 0.13;
    for (const s of this.squads) {
      if (s.n <= 0 || x < s.minX - r || x > s.maxX + r || newW < s.minW - r || oldW > s.maxW + r) continue;
      for (const i of s.units) {
        if (this.alive[i] && Math.abs(this.x[i] - x) < r && this.w[i] >= oldW - r && this.w[i] <= newW + r) {
          this.kill(i, s);
          this.bounds(s);
          return s;
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

  // Enemy units in charging squads whose front is within `range` of the army.
  threat(dist, army, range) {
    let t = 0;
    for (const s of this.squads) if (s.n > 0 && s.charging && s.minW - dist + army.front < range) t += s.n;
    return t;
  }

  prune(onRemove) {
    this.squads = this.squads.filter((s) => {
      if (s.n > 0) return true;
      onRemove(s);
      return false;
    });
  }
}
