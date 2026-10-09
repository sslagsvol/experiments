// Enemy force: every enemy is an individual unit (one THREE.Points draw call
// for all of them, with per-unit shape, size and color). Squads hold
// formation until the army gets close, then charge. Enemies that reach the
// army, or slip past it to the rear, die and take player units with them.

import * as THREE from 'three';
import { CFG, COLORS, ANIM } from './config.js';
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
// the player), 2 ring with a pulsing core, 3 heavy hexagon, 4 wide flat
// chevron (shield), 5 streak with a hot core (bullet enemy), 6 soft dot (the
// bullet's warning line), 7 a brute's inner hexagon once its shell is shot off.
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
  } else if (vShape < 3.5) {
    vec2 q = abs(p);
    float d = max(q.x * 0.866 + q.y * 0.5, q.y);
    a = outline(d, 0.72, 0.09) + outline(d, 0.42, 0.07) * 0.7 + smoothstep(1.0, 0.2, d) * 0.06;
  } else if (vShape < 4.5) {
    // A flat bar bent into a chevron, its point toward the player.
    vec2 q = vec2(abs(p.x), p.y + abs(p.x) * 0.35 - 0.15);
    vec2 e = abs(q) - vec2(0.78, 0.13);
    float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) + 0.6;
    a = outline(d, 0.6, 0.07) + smoothstep(0.62, 0.45, d) * 0.12;
  } else if (vShape < 5.5) {
    vec2 e = abs(p) - vec2(0.12, 0.85);
    float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) + 0.6;
    a = outline(d, 0.6, 0.06) + exp(-p.x * p.x * 90.0) * smoothstep(0.95, 0.1, abs(p.y)) * 1.2;
  } else if (vShape < 6.5) {
    a = exp(-dot(p, p) * 5.0);
  } else {
    // A brute that lost its outer shell: the inner hexagon alone.
    vec2 q = abs(p);
    float d = max(q.x * 0.866 + q.y * 0.5, q.y);
    a = outline(d, 0.42, 0.08) + smoothstep(0.6, 0.1, d) * 0.06;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

// Dimmed below the bloom threshold so dense formations keep readable shapes;
// hit flashes push them back over it.
// Enemies keep clear of the rails, where they'd be hard to hit.
const EDGE = CFG.TW - CFG.ENEMY_EDGE_MARGIN;
const clampX = (x) => Math.max(-EDGE, Math.min(EDGE, x));

const TYPE_COLORS = TYPE_LIST.map((t) => COLORS[t.color].map((v) => v * 0.55));
const BURN_COLOR = COLORS.burn.map((v) => v * 0.7);

export class EnemyForce {
  constructor(scene, scaleUniform) {
    const max = CFG.MAX_ENEMIES;
    this.max = max;
    this.x = new Float32Array(max);
    this.w = new Float32Array(max);    // world distance along the track
    this.ox = new Float32Array(max);   // formation x offset
    this.hp = new Float32Array(max);
    this.big = new Float32Array(max);  // size multiplier: 1, or CFG.BOSS_SIZE for a mini-boss
    this.flash = new Float32Array(max);
    this.lift = new Float32Array(max); // height above the floor (a hopping or stomping mini-boss)
    this.oz = new Float32Array(max);   // formation z offset (shield rows)
    this.burning = new Uint8Array(max); // on fire this frame (a brute or mini-boss close to the army)
    this.burnT = new Float32Array(max); // s to its next burn tick
    this.type = new Uint8Array(max);
    this.alive = new Uint8Array(max);
    this.owner = new Int32Array(max);  // id of the squad a slot belongs to (slots get recycled)
    this.nextId = 1;
    this.events = [];   // boss moves and bullet dodges for main.js to play out: { kind, s, x, w }

    // Draw buffers have room for the bullets' warning-line dots too.
    const draw = max + 600;
    this.drawMax = draw;
    this.pos = new Float32Array(draw * 3);
    this.shapeArr = new Float32Array(draw);
    this.sizeArr = new Float32Array(draw);
    this.colArr = new Float32Array(draw * 3);
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
    this.events = [];
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  // mixOverride: { back, mix } to force the types (e.g. a cluster of drones).
  spawnSquad(kind, n, anchorX, anchorW, rng, squadIndex, mixOverride = null) {
    const { pts, halfW } = enemyFormation(kind, Math.min(n, CFG.MAX_PER_SQUAD), rng);
    const mix = mixOverride || squadMix(kind, squadIndex);
    const lim = Math.max(0, CFG.TW - CFG.ENEMY_EDGE_MARGIN - halfW);
    anchorX = Math.max(-lim, Math.min(lim, anchorX));
    const s = { id: this.nextId++, kind, ax: anchorX, spread: ENEMY_KINDS[kind].spread, units: [], n: 0, charging: false,
      minX: 0, maxX: 0, minW: anchorW, maxW: anchorW, cx: anchorX, cw: anchorW, depth: 0 };
    pts.forEach(([px, pz], k) => {
      if (!this.free.length) return;
      const i = this.free.pop(), t = ENEMY_TYPES[unitType(mix, k, pts.length, rng)];
      this.x[i] = anchorX + px;
      this.w[i] = anchorW + pz;
      this.ox[i] = px;
      this.oz[i] = pz;
      s.depth = Math.max(s.depth, pz);
      this.lift[i] = 0;
      this.burning[i] = 0; this.burnT[i] = 0;
      this.type[i] = t.id;
      this.hp[i] = t.hp;
      this.big[i] = 1;
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

  // A mini-boss: one giant unit of the given type with `hp`, alone in its own
  // squad. It advances slowly and hits hard on contact (main.js onHit).
  spawnBoss(typeKey, hp, anchorX, anchorW) {
    const s = this.single(typeKey, anchorX, anchorW, hp, CFG.BOSS_SIZE, { kind: 'boss', boss: true, bossType: typeKey, bt: 0 });
    if (s) s.hpMax = hp;
    return s;
  }

  // A line of shields guarding squad `guard`: they start at its back and rush
  // to its front (CFG.SHIELD_RUSH), then hold there, CFG.SHIELD_LEAD ahead.
  // mid = true: they hold in the middle of the squad instead, among its units.
  spawnShields(guard, n, rng, mid = false) {
    const s = this.spawnSquad('line', n, guard.cx, guard.maxW, rng, 0, { back: [], mix: [['shield', 1]] });
    s.guards = guard;
    s.mid = mid;
    return s;
  }

  // A bullet enemy aimed down lane x: it waits CFG.BOLT_AHEAD in front of the
  // army behind a warning line for `warn` s, then flies.
  spawnBolt(x, w, warn) {
    return this.single('bolt', clampX(x), w, 1, 1, { kind: 'bolt', bolt: { warn, warn0: warn } });
  }

  single(typeKey, x, w, hp, big, extra) {
    if (!this.free.length) return null;
    const t = ENEMY_TYPES[typeKey], i = this.free.pop();
    const s = { id: this.nextId++, ax: x, spread: 0, units: [i], n: 1, charging: false, depth: 0,
      minX: x, maxX: x, minW: w, maxW: w, cx: x, cw: w, ...extra };
    this.x[i] = x; this.w[i] = w; this.ox[i] = 0; this.oz[i] = 0; this.lift[i] = 0; this.burning[i] = 0; this.burnT[i] = 0;
    this.type[i] = t.id; this.hp[i] = hp; this.big[i] = big; this.flash[i] = 0;
    this.alive[i] = 1; this.owner[i] = s.id;
    this.squads.push(s);
    return s;
  }

  // A mini-boss's own way of moving once its escort is gone (CFG.BOSS_MOVES).
  // Its average advance stays CFG.BOSS_SPEED; the moves are events for
  // main.js (a dart, a landing shockwave, a stomp).
  moveBoss(s, i, dt, army) {
    const m = CFG.BOSS_MOVES[s.bossType], base = CFG.ENEMY_CHARGE_SPEED * CFG.BOSS_SPEED;
    const prev = s.bt, bt = s.bt = prev + dt;
    const follow = (tx, k) => { this.x[i] = clampX(this.x[i] + (tx - this.x[i]) * Math.min(1, dt * k)); };
    const event = (kind) => this.events.push({ kind, s, x: this.x[i], w: this.w[i] });
    if (s.bossType === 'drone') {
      // Wide circles across the track at half speed, then a dart at the team.
      const orbit = (m.dartEvery - m.dartTime) / m.dartEvery, u = bt % m.dartEvery, pu = prev % m.dartEvery;
      const darting = u > m.dartEvery - m.dartTime;
      if (darting) {
        if (!(pu > m.dartEvery - m.dartTime) || pu > u) event('dart');
        this.w[i] -= base * (1 - 0.5 * orbit) / (1 - orbit) * dt;
        follow(army.cx, 6);
      } else {
        this.w[i] -= base * 0.5 * dt;
        follow(army.cx * 0.3 + Math.sin(bt * m.orbitSpeed) * EDGE * m.orbit, 2.5);
      }
      this.lift[i] = 0.2 + 0.2 * Math.sin(bt * m.orbitSpeed * 2);
    } else if (s.bossType === 'bomber') {
      // Hops: airborne for `air` of each cycle (it picks where to land as it
      // takes off), then a landing shockwave.
      const u = (bt % m.hopEvery) / m.hopEvery, pu = (prev % m.hopEvery) / m.hopEvery;
      if (u < pu || s.hopX === undefined) s.hopX = clampX(army.cx + (Math.random() * 2 - 1) * 0.7);
      if (u < m.air) {
        this.lift[i] = Math.sin(Math.PI * u / m.air) * m.hopHeight;
        this.w[i] -= base / m.air * dt;
        follow(s.hopX, 3);
      } else {
        if (pu < m.air && pu <= u) event('land');
        this.lift[i] = 0;
      }
    } else {
      // Sways, and stomps forward a step at a time.
      const u = bt % m.stepEvery, pu = prev % m.stepEvery;
      if (u < m.stepTime) {
        this.w[i] -= base * m.stepEvery / m.stepTime * dt;
        this.lift[i] = Math.sin(Math.PI * u / m.stepTime) * 0.35;
      } else {
        if (pu < m.stepTime && pu <= u) event('stomp');
        this.lift[i] = 0;
      }
      follow(army.cx * 0.4 + Math.sin(bt * m.swaySpeed) * EDGE * m.sway, 1.2);
    }
  }

  // Removes every unit except mini-bosses (an extra life: the fight goes on,
  // its minions are gone). A boss's escort goes too, so it's exposed.
  clearMinions() {
    for (const s of this.squads) {
      if (s.boss) continue;
      for (const i of s.units) if (this.alive[i] && this.owner[i] === s.id) this.kill(i, s);
    }
    this.prune();
  }

  // The live mini-boss squad, if any.
  get boss() { return this.squads.find((s) => s.boss && s.n > 0) || null; }
  bossHp(s) { return s && s.n > 0 ? this.hp[s.units[0]] / s.hpMax : 0; }

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
      if (s.bolt) { this.flyBolt(s, dt, dist, army, onHit); continue; }
      if (!s.charging && army.N > 0 && s.minW - dist + army.front < CFG.ENEMY_TRIGGER) s.charging = true;
      // Shields hold a stiff line in front of the squad they guard, but never
      // closer than CFG.SHIELD_HOVER in front of the army: there they hover,
      // still blocking. Once their squad is gone they hover for
      // CFG.SHIELD_LINGER s, then break off and charge (harmlessly).
      const guard = s.guards && s.guards.n > 0 ? s.guards : null;
      if (s.guards && !guard) s.linger = (s.linger ?? CFG.SHIELD_LINGER) - dt;
      const shielding = !!guard || (!!s.guards && s.linger > 0);
      const hoverW = dist - army.front + CFG.SHIELD_HOVER;
      // A mini-boss hangs back, BOSS_HOLD ahead of the team, while its escort
      // still has units; then it advances (slowly) like any charge.
      const holding = s.boss && s.escort && s.escort.n > 0 && army.N > 0;
      for (const i of s.units) {
        if (!this.alive[i] || this.owner[i] !== s.id) continue;
        this.flash[i] = Math.max(0, this.flash[i] - dt * 6);
        const t = TYPE_LIST[this.type[i]];
        if (holding) {
          const hold = dist - army.front + CFG.BOSS_HOLD;
          if (this.w[i] < hold) this.w[i] = hold;
          if (t.strafe || t.converge) this.x[i] = clampX(this.x[i] + (army.cx + Math.sin(time * 1.2) * 0.4 - this.x[i]) * Math.min(1, dt * 1.5));
          continue;
        }
        if (shielding) {
          const hold = hoverW + this.oz[i];
          let target = !guard ? hold : s.mid ? (guard.minW + guard.maxW) / 2 - s.depth / 2 + this.oz[i] : guard.minW - CFG.SHIELD_LEAD - s.depth + this.oz[i];
          target = Math.max(target, hold);
          this.w[i] = this.w[i] > target ? Math.max(target, this.w[i] - CFG.SHIELD_RUSH * dt) : target;
          const step = CFG.ENEMY_HOMING * 1.5 * dt, cx = guard ? guard.cx : army.cx;
          this.x[i] = clampX(this.x[i] + Math.max(-step, Math.min(step, cx + this.ox[i] - this.x[i])));
          if (!s.charging) continue;
        } else if (!s.charging) {
          // Drones hover side to side even while waiting.
          // (Around the squad's fixed anchor; using the live centroid fed back
          // into itself and let drones drift off the track.)
          if (t.strafe) this.x[i] = clampX(s.ax + this.ox[i] + Math.sin(time * 2 + i) * 0.15);
          continue;
        }
        // Stragglers far from the fight run faster so battles don't drag.
        // A mini-boss advances slowly and never hurries.
        const gap = this.w[i] - dist + army.front;
        if (!shielding && !s.boss) this.w[i] -= (CFG.ENEMY_CHARGE_SPEED * t.speed + Math.max(0, gap - 6) * CFG.ENEMY_CATCHUP) * dt;
        if (s.boss) this.moveBoss(s, i, dt, army);
        // Burning (brutes with their outer shell, and mini-bosses): close to
        // the army, a fire event every `every` s for main.js to play out.
        const burn = s.boss ? CFG.BOSS_BURN : t.burns && this.hp[i] > t.hp * CFG.BURN.shell ? CFG.BURN : null;
        this.burning[i] = burn && army.N > 0 && gap < burn.range ? 1 : 0;
        if (this.burning[i] && (this.burnT[i] -= dt) <= 0) {
          this.burnT[i] = burn.every;
          this.events.push({ kind: 'burn', s, x: this.x[i], w: this.w[i], burn });
        }
        // Hold formation on the approach; once level with the army, turn
        // inward and hit its flank. Bombers always home on the center;
        // drones weave.
        const rz = -(this.w[i] - dist);
        const close = rz > army.front - 1.2;
        // Grunts close ranks as they near (ANIM.gruntConverge): the holes in
        // their formation shut, screening the stronger units behind them.
        const closeRanks = t.id === 0 ? Math.min(1, Math.max(0, 1 - gap / ANIM.gruntConverge)) : 0;
        if (!shielding && !s.boss) {
          let tx = close || t.converge ? army.cx : army.cx + this.ox[i] * s.spread * (1 - 0.8 * closeRanks);
          if (t.strafe && !close) tx += Math.sin(time * 2.5 + i * 1.3) * t.strafe;
          const step = CFG.ENEMY_HOMING * t.homing * (close ? 3 : 1) * dt;
          this.x[i] += Math.max(-step, Math.min(step, tx - this.x[i]));
          this.x[i] = clampX(this.x[i]);
        }
        if (army.N <= 0) continue;
        if (rz >= army.front - 0.05 && rz <= army.back + 0.3 && Math.abs(this.x[i] - army.cx) <= army.halfW + 0.12) {
          this.kill(i, s);
          onHit(t, this.x[i], rz, false, s.boss);
        } else if (rz > army.back + CFG.ENEMY_LEAK_MARGIN) {
          this.kill(i, s);
          onHit(t, this.x[i], army.back, true, s.boss);
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
        const size = t.size * this.big[i];
        // A mini-boss glows and pulses; shielded (escort alive) it sits dimmer
        // and pulses slowly.
        if (s.boss) f = s.escort && s.escort.n > 0 ? 0.55 + 0.25 * Math.sin(time * 2) + this.flash[i] : f + 0.4 + 0.3 * Math.sin(time * 5);
        if (s.bolt) f = s.bolt.warn > 0 ? 1.8 : 3;   // flying: blazing
        // On fire: flickers in COLORS.burn, kept below white so the orange reads.
        const fire = this.burning[i] ? 0.8 + 0.2 * Math.sin(time * 23 + i * 3.1) : 0;
        if (fire) f = Math.min(f, 1.1 + 0.5 * fire);
        p[c * 3 + 1] = 0.14 * size + this.lift[i] + (s.charging && !s.boss ? Math.abs(Math.sin(time * 13 + i)) * 0.05 * this.big[i] : 0);
        p[c * 3 + 2] = -(this.w[i] - dist);
        // A brute shot down to half loses its outer hexagon (shape 7).
        sh[c] = t.burns && this.hp[i] <= t.hp * CFG.BURN.shell && !s.boss ? 7 : t.shape;
        sz[c] = 0.18 * size;
        col[c * 3] = (k[0] + (BURN_COLOR[0] - k[0]) * fire) * f; col[c * 3 + 1] = (k[1] + (BURN_COLOR[1] - k[1]) * fire) * f; col[c * 3 + 2] = (k[2] + (BURN_COLOR[2] - k[2]) * fire) * f;
        c++;
        // A waiting bullet's warning line: dots down its lane to the army,
        // blinking faster as it's about to fly.
        if (s.bolt && s.bolt.warn > 0) {
          const z0 = -(this.w[i] - dist), z1 = this.armyFront, left = s.bolt.warn / s.bolt.warn0;
          const on = Math.sin(time * (12 + 26 * (1 - left))) > -0.2 ? 1 : 0.25, bk = TYPE_COLORS[t.id];
          for (let d = 1; d <= 22 && c < this.drawMax; d++) {
            p[c * 3] = this.x[i]; p[c * 3 + 1] = 0.05; p[c * 3 + 2] = z0 + (z1 - z0) * d / 23;
            sh[c] = 6; sz[c] = 0.2;
            const g = on * (1.6 + 1.4 * (1 - left));
            col[c * 3] = bk[0] * g; col[c * 3 + 1] = bk[1] * g; col[c * 3 + 2] = bk[2] * g;
            c++;
          }
        }
      }
    }
    this.count = c;
    for (const a of this.attrs) a.needsUpdate = true;
    this.geo.setDrawRange(0, c);
  }

  // A bullet enemy: it rides CFG.BOLT_AHEAD in front of the army while its
  // warning line blinks, then flies down its lane at player-bullet speed.
  // Crossing the army's front row inside its width is a hit (checked as a
  // sweep: it moves about half a unit a frame); past the army it's a dodge.
  flyBolt(s, dt, dist, army, onHit) {
    const i = s.units[0], b = s.bolt, t = ENEMY_TYPES.bolt;
    if (!this.alive[i] || this.owner[i] !== s.id) return;
    if (b.warn > 0) {
      b.warn -= dt;
      this.w[i] = dist - army.front + CFG.BOLT_AHEAD;
      if (b.warn <= 0) this.events.push({ kind: 'boltFly', s, x: this.x[i], w: this.w[i] });
    } else {
      const rz0 = dist - this.w[i];
      this.w[i] -= CFG.BULLET_SPEED * dt;
      const rz = dist - this.w[i];
      if (army.N > 0 && rz >= army.front - 0.05 && rz0 <= army.back + 0.3 && Math.abs(this.x[i] - army.cx) <= army.halfW + 0.12) {
        this.kill(i, s);
        onHit(t, this.x[i], army.front, false, false);
      } else if (rz > army.back + CFG.ENEMY_LEAK_MARGIN) {
        this.kill(i, s);
        this.events.push({ kind: 'dodged', s, x: this.x[i], w: this.w[i] });
      }
    }
    this.bounds(s);
  }

  // Bullet sweep from oldW to newW at x. Returns { s, killed } or null.
  hitTest(x, oldW, newW) {
    const r0 = 0.13;
    for (const s of this.squads) {
      const r = r0 * 2.3 * (s.boss ? CFG.BOSS_SIZE : 1);
      if (s.bolt) continue;   // bullet enemies are immune: shots pass through
      const rx = s.kind === 'line' ? r * 2 : r;
      if (s.n <= 0 || x < s.minX - rx || x > s.maxX + rx || newW < s.minW - r || oldW > s.maxW + r) continue;
      for (const i of s.units) {
        if (!this.alive[i] || this.owner[i] !== s.id) continue;
        const ri = r0 * TYPE_LIST[this.type[i]].size * this.big[i] * (this.big[i] > 1 ? 1.3 : 1);   // bosses: a generous hitbox
        const t = TYPE_LIST[this.type[i]];
        if (Math.abs(this.x[i] - x) < ri * (t.hitW || 1) && this.w[i] >= oldW - ri && this.w[i] <= newW + ri) {
          // A mini-boss is shielded while its escort lives: the bullet is
          // stopped, but does nothing.
          if (s.boss && s.escort && s.escort.n > 0) { this.flash[i] = 0.3; return { s, t, killed: false, boss: true, shielded: true }; }
          this.flash[i] = 1;
          if (--this.hp[i] > 0) return { s, t, killed: false, boss: !!s.boss };
          this.kill(i, s);
          this.bounds(s);
          return { s, t, killed: true, boss: !!s.boss };
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
      // A mini-boss closing in counts as near-defeat danger (slow motion, killcam).
      if (s.boss) { t += army.N * 0.9; continue; }
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
