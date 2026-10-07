// Game loop and rules. URL params: ?units=800 (start size), ?seed=42,
// ?debug (FPS / unit counts overlay).

import * as THREE from 'three';
import { CFG, COLORS, ANIM, mulberry32 } from './config.js';
import { createWorld } from './world.js';
import { Army } from './crowd.js';
import { EnemyForce } from './enemies.js';
import { squadMix, mixEst } from './enemyFormations.js';
import { GatePool, FONT, gateColor } from './gates.js';
import { Bullets, Sparks, Fallers } from './fx.js';
import { UNIT_SPACING } from './formations.js';
import { DragInput } from './input.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const START_UNITS = Math.min(CFG.CAPACITY, Math.max(1, parseInt(params.get('units'), 10) || CFG.START_UNITS));
const SEED = parseInt(params.get('seed'), 10) || CFG.SEED;
const DEBUG = params.has('debug');

const canvas = document.getElementById('game');
const world = createWorld(canvas);
const army = new Army(world.scene, world.pointScale);
const enemies = new EnemyForce(world.scene, world.pointScale);
const gates = new GatePool(world.scene);
const bullets = new Bullets(world.scene);
const sparks = new Sparks(world.scene, world.pointScale);
const fallers = new Fallers(world.scene, world.pointScale, UNIT_SPACING * 1.3);
const input = new DragInput(window);
const hud = new Hud();

let best = 0;
try { best = parseInt(localStorage.getItem('vector-wars-best'), 10) || 0; } catch { /* storage unavailable */ }
hud.setBest(best);

let G;
function newRun() {
  gates.clear();
  enemies.reset();
  bullets.clear();
  sparks.clear();
  fallers.clear();
  army.reset();
  army.spawn(START_UNITS, 0);
  G = {
    state: 'title',
    ax: 0, tx: 0,
    dist: 0, nextW: 0,
    seg: 0, gateIdx: 0, enemyIdx: 0,
    pending: [],
    rng: mulberry32(SEED),
    fireAcc: 0,
    shake: 0,
    speedMul: 1,     // track speed (0 during battles, >1 in the post-battle surge)
    surge: 0,
    battle: 0,       // 0..1, eased; drives the camera push-in
    engaged: false,
    lastContact: -9,
    lastRipple: -9,
    danger: 0,       // incoming enemy strength ÷ army size, smoothed
    timeScale: 1,    // slow motion when the danger is high
    overAt: 0,
    stats: { peak: START_UNITS, lostEnemy: 0, leaked: 0, lostGate: 0, fell: 0, gateHits: 0 },
    leakFlash: 0,
  };
  hud.showOver(null);
  hud.showTitle(true);
}

// ---------- Track generation (seeded, so every run of a seed is identical) ----------

const PATTERN = 'gegeggee';

function makeGateSpec(rng, scale) {
  const r = rng();
  if (r < 0.28) return { op: 'x', m: 2, ch: 0, f: 0 };
  if (r < 0.6) return { op: '+', v: Math.round((4 + rng() * 14) * scale), ch: 0, f: 0 };
  return { op: '+', v: -Math.round((6 + rng() * 20) * scale), ch: 0, f: 0 };
}

function spawnNext() {
  const kind = PATTERN[G.seg % PATTERN.length];
  const wz = G.nextW;
  if (kind === 'g') {
    let L, R;
    if (G.gateIdx === 0) {
      L = { op: '+', v: 10, ch: 0, f: 0 };
      R = { op: 'x', m: 2, ch: 0, f: 0 };
    } else {
      const scale = Math.pow(1.12, G.gateIdx);
      L = makeGateSpec(G.rng, scale);
      R = makeGateSpec(G.rng, scale);
      // Never two dead ends: if both sides subtract, make one a small add.
      if (L.op === '+' && R.op === '+' && L.v < 0 && R.v < 0) R.v = Math.round(3 * scale);
    }
    if (G.rng() < 0.5) [L, R] = [R, L];
    gates.acquire(wz, L, R);
    G.gateIdx++;
  } else {
    G.pending.push(wz);   // sized later, when it comes out of the fog
  }
  G.seg++;
  G.nextW += CFG.SEG;
}

const KIND_WEIGHTS = [['blob', 2], ['wall', 2], ['wedge', 2], ['skirmish', 1.5], ['column', 1], ['waves', 1.5]];

function pickKind() {
  let r = G.rng() * KIND_WEIGHTS.reduce((t, k) => t + k[1], 0);
  for (const [kind, wgt] of KIND_WEIGHTS) if ((r -= wgt) < 0) return kind;
  return 'blob';
}

// The army a player would have on reaching wz if they took the better side
// of every gate before it, minus what the squads already ahead will cost.
// Squads are sized against this, so taking the weaker gate makes the next
// fight harder, and back-to-back squads don't stack into a wall of death.
function projectedArmy(wz) {
  const gain = (s, n) => s.op === 'x' ? n * s.m : Math.max(0, n + s.v);
  const events = [
    ...gates.active.filter((g) => !g.done && g.wz < wz).map((g) => [g.wz, (n) => Math.max(gain(g.L, n), gain(g.R, n))]),
    ...enemies.squads.filter((s) => s.n > 0 && s.cw < wz).map((s) => [s.cw, (n) => n - enemies.squadStrength(s) * 0.7]),
  ].sort((a, b) => a[0] - b[0]);
  let n = army.N;
  for (const [, apply] of events) n = Math.max(10, Math.min(CFG.CAPACITY, apply(n)));
  return n;
}

// Squad size tracks the projected army plus a "par" curve from gates
// passed, so battles stay a real threat. Tuned in batch E.
function spawnSquad(wz) {
  let kind = 'blob', n = 10;
  if (G.enemyIdx > 0) {
    kind = pickKind();
    const par = Math.min(CFG.CAPACITY, 30 * Math.pow(1.3, G.gateIdx));
    const ref = 0.8 * projectedArmy(wz) + 0.2 * par;
    const threat = CFG.ENEMY_THREAT_MIN + G.rng() * (CFG.ENEMY_THREAT_MAX - CFG.ENEMY_THREAT_MIN);
    // Size by strength, not headcount: a squad with brutes or bombers has fewer units.
    n = Math.round(Math.max(8, ref * threat / mixEst(squadMix(kind, G.enemyIdx))));
  }
  enemies.spawnSquad(kind, n, (G.rng() * 2 - 1) * CFG.TW, wz, G.rng, G.enemyIdx);
  G.enemyIdx++;
}

// ---------- Rules ----------

function feedback(color, amp, count) {
  world.addRipple(G.ax, G.dist, amp, time);
  sparks.emit(G.ax, 0.3, G.dist - army.front, color, count, 4);
}

const sparkLost = (x, z) => sparks.emit(x, 0.15, G.dist - z, COLORS.you, 1, 2);

// Units that don't fit on the track run off the nearest edge.
function spill(n) {
  if (n <= 0) return;
  G.stats.fell += n;
  const depth = army.back - army.front;
  for (let k = 0, shown = Math.min(n, 250); k < shown; k++) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const x = army.cx + dir * army.halfW * (0.6 + Math.random() * 0.4);
    fallers.drop(x, G.dist - (army.front + Math.random() * depth), dir, CFG.SPEED);
  }
}

// The army crosses a gate pair. Each panel applies only to the units that
// went through it: × multiplies them, + / − is scaled by their share of the
// army. The primary panel (where the army's center went) shatters. A wide
// army that straddles the middle gets both gates, good or bad.
function crossGate(g) {
  const [nL, nR] = army.countSides(), total = army.N, before = army.N;
  g.done = true;
  g.doneAt = time;
  g.primary = army.cx < 0 ? 'L' : 'R';
  let gained = false;
  for (const [s, n, sign] of [[g.L, nL, -1], [g.R, nR, 1]]) {
    if (n <= 0) continue;
    const share = n / total, x = sign * Math.min(1, army.halfW * 0.5);
    if (s.op === 'x') { spill(army.spawn(n * (s.m - 1), x)); gained = true; }
    else if (s.v > 0) { spill(army.spawn(Math.max(1, Math.round(s.v * share)), x)); gained = true; }
    else if (s.v < 0) army.killSide(sign, Math.min(n, Math.round(-s.v * share)), sparkLost);
    if (s !== (g.primary === 'L' ? g.L : g.R)) s.f = 1;   // secondary panel flashes
  }
  shatterSparks(g);
  const d = army.N - before;
  if (gained && d >= 0) {
    feedback(gateColor(g.primary === 'L' ? g.L : g.R), 1, 40);
    army.nextFormation(time);
    if (navigator.vibrate) navigator.vibrate(12);
  }
  if (d < 0) {
    G.stats.lostGate -= d;
    feedback(COLORS.sub, 0.8, 30);
    army.shake(ANIM.shakeNegGate);
    G.shake = 0.12;
  }
}

// Burst of sparks along the primary panel's outline.
function shatterSparks(g) {
  const s = g.primary === 'L' ? g.L : g.R, c = gateColor(s);
  const x0 = g.primary === 'L' ? -CFG.TW + 0.05 : 0.05, x1 = x0 + CFG.TW - 0.1;
  for (let k = 0; k < 28; k++) {
    const t = k / 28, onTop = k % 2;
    sparks.emit(x0 + (x1 - x0) * t, onTop ? CFG.GATE_H : 0.1 + Math.random() * CFG.GATE_H, g.wz, c, 1, 3);
  }
}

function hitGate(s) {
  G.stats.gateHits++;
  if (s.op === 'x') {
    if (s.m < CFG.MULT_MAX) {
      // Each step costs more hits than the last.
      s.ch += CFG.MULT_CHARGE_PER_HIT / (s.m - 1);
      if (s.ch >= 1) { s.ch = 0; s.m++; }
    }
  } else {
    // + / − gates fill a charge bar too: ADD_HITS_PER_STEP bullets per +1.
    s.ch += 1 / CFG.ADD_HITS_PER_STEP;
    if (s.ch >= 0.999) { s.ch = 0; s.v += 1; }
  }
  s.f = 1;
}

function bulletTest(x, oldW, newW) {
  for (const g of gates.active) {
    if (!g.done && oldW < g.wz && newW >= g.wz && Math.abs(x) < CFG.TW) {
      hitGate(x < 0 ? g.L : g.R);
      return true;
    }
  }
  const hit = enemies.hitTest(x, oldW, newW);
  if (hit) {
    sparks.emit(x, 0.2, newW, COLORS.enemy, hit.killed ? 3 : 1, 2);
    if (hit.killed && hit.s.n === 0) squadWiped(hit.s);
    return true;
  }
  return false;
}

function squadWiped(s) {
  world.addRipple(s.cx, s.cw, 0.7, time);
  sparks.emit(s.cx, 0.3, s.cw, COLORS.enemy, 40, 4);
}

// An enemy reached the army (or slipped past and hit the rear): it dies and
// takes out the units nearest it. Bombers blow up everything around them.
function onHit(t, x, z, leaked) {
  let killed;
  if (t.blast) {
    killed = army.killRadius(x, z, t.blast * Math.max(0.6, army.pack), t.blastMax, sparkLost);
    sparks.emit(x, 0.3, G.dist - z, COLORS.enemyHot, 24, 5);
    world.addRipple(x, G.dist - z, 0.6, time);
  } else {
    const k = Math.floor(t.damage) + (Math.random() < t.damage % 1 ? 1 : 0);
    killed = army.killNear(x, z, k, sparkLost);
    sparks.emit(x, 0.2, G.dist - z, COLORS[t.color], t.size > 2 ? 12 : 4, 3);
  }
  if (leaked) { G.stats.leaked += killed; G.leakFlash = 1; }
  else G.stats.lostEnemy += killed;
  G.lastContact = time;
  G.shake = Math.min(0.16, Math.max(G.shake, 0.05) + 0.008);
  if (time - G.lastRipple > 0.2) {
    world.addRipple(x, G.dist - z, 0.35, time);
    G.lastRipple = time;
  }
}

function endRun() {
  G.state = 'over';
  G.overAt = time;
  const score = Math.floor(G.dist * 10);
  const newBest = score > best;
  if (newBest) {
    best = score;
    try { localStorage.setItem('vector-wars-best', String(best)); } catch { /* storage unavailable */ }
    hud.setBest(best);
  }
  army.kill(army.N, sparkLost);
  world.addRipple(G.ax, G.dist, 1.4, time);
  sparks.emit(G.ax, 0.3, G.dist, COLORS.you, 80, 5);
  hud.showOver({ ...G.stats, score, newBest });
}

// dt is simulation time (slowed during slow motion); realDt drives anything
// the player feels directly, like steering and the slow-motion easing itself.
function update(dt, realDt) {
  const tapped = input.consumeTap();
  const dx = input.consumeDx();

  if (G.state === 'title') {
    G.dist += CFG.SPEED * 0.35 * dt;
    if (tapped) {
      G.state = 'play';
      G.nextW = G.dist + CFG.FIRST;
      hud.showTitle(false);
    }
  } else if (G.state === 'over') {
    if (tapped && time - G.overAt > 0.6) newRun();
  }

  if (G.state === 'play') {
    G.tx += dx / window.innerWidth * (2 * CFG.TW) / CFG.DRAG_SPAN;
    // Only the army's center is kept on the track: a wide crowd hugging an
    // edge loses its outer units over the rail.
    const lim = CFG.TW - CFG.EDGE_MARGIN;
    G.tx = Math.max(-lim, Math.min(lim, G.tx));
    G.ax += (G.tx - G.ax) * Math.min(1, realDt * CFG.STEER_RESPONSE);

    enemies.update(dt, G.dist, army, time, onHit);

    // Battles: the track rolls forward at reduced speed to meet a charging
    // squad, stops dead once it's close, and surges when it's beaten.
    const close = enemies.threat(G.dist, army, 3) > 0 || time - G.lastContact < 0.4;
    const engaged = close || enemies.battling();
    if (G.engaged && !engaged) G.surge = 1;
    G.engaged = engaged;
    G.surge = Math.max(0, G.surge - dt * ANIM.surgeDecay);
    const targetSpeed = close ? 0 : engaged ? ANIM.approachSpeed : 1 + ANIM.surgeBoost * G.surge;
    G.speedMul += (targetSpeed - G.speedMul) * Math.min(1, dt * ANIM.battleBrake);
    G.battle += ((close ? 1 : engaged ? 0.4 : 0) - G.battle) * Math.min(1, dt * 3);

    // Danger: how much enemy strength is about to hit, relative to the army.
    const incoming = enemies.threat(G.dist, army, 6);
    const danger = incoming > 0 ? incoming / Math.max(1, army.N) : 0;
    G.danger += (danger - G.danger) * Math.min(1, realDt * 4);

    G.dist += CFG.SPEED * G.speedMul * dt;
    while (G.nextW < G.dist + CFG.VIEW_AHEAD) spawnNext();
    while (G.pending.length && G.pending[0] < G.dist + CFG.ENEMY_SPAWN_AHEAD) spawnSquad(G.pending.shift());

    for (const g of gates.active) {
      if (!g.done && g.wz <= G.dist) {
        crossGate(g);
      }
    }

    G.fireAcc += dt * Math.min(CFG.FIRE_MAX, CFG.FIRE_BASE + CFG.FIRE_K * Math.sqrt(army.N));
    while (G.fireAcc >= 1) {
      G.fireAcc -= 1;
      bullets.fire(army.cx + (Math.random() * 2 - 1) * army.halfW * 0.8, G.dist - army.front);
    }

    G.stats.peak = Math.max(G.stats.peak, army.N);
    if (army.N <= 0) endRun();
  } else {
    G.danger = Math.max(0, G.danger - realDt * 2);
    G.battle = Math.max(0, G.battle - realDt * 2);
  }

  // Slow motion: ease in when the army is about to be overwhelmed.
  const slow = G.state === 'play' && G.danger >= ANIM.slowMoThreshold;
  const targetScale = slow ? ANIM.slowMoScale : 1;
  const ease = targetScale < G.timeScale ? ANIM.slowMoIn : ANIM.slowMoOut;
  G.timeScale += (targetScale - G.timeScale) * Math.min(1, realDt / ease);

  // Housekeeping (runs in every state so the scene settles after a loss).
  bullets.update(dt, G.dist, G.state === 'play' ? bulletTest : () => false);
  for (const g of [...gates.active]) {
    g.L.f = Math.max(0, g.L.f - dt * ANIM.gateFlashDecay);
    g.R.f = Math.max(0, g.R.f - dt * ANIM.gateFlashDecay);
    if (g.wz - G.dist < -0.7) { gates.release(g); continue; }
    g.sync(G.dist, time);
  }
  enemies.prune();
  G.leakFlash = Math.max(0, G.leakFlash - realDt * 2.5);
  if (G.state !== 'play') enemies.update(dt, G.dist, army, time, () => {});

  army.update(dt, G.ax, time, (x, z) => {
    G.stats.fell++;
    fallers.drop(x, G.dist - z, Math.sign(x), CFG.SPEED);
  });
  fallers.update(dt, G.dist);
  sparks.update(dt, G.dist);
  G.shake = Math.max(0, G.shake - dt * 0.6);
}

// ---------- Rendering helpers ----------

const tmp = new THREE.Vector3();
function toScreen(x, y, z) {
  tmp.set(x, y, z).project(world.camera);
  return [(tmp.x * 0.5 + 0.5) * window.innerWidth, (-tmp.y * 0.5 + 0.5) * window.innerHeight];
}

function syncLabels() {
  hud.setDanger(Math.min(1, Math.max((G.danger - 0.4) / (ANIM.slowMoThreshold - 0.4), G.leakFlash * 0.7, 0)));
  // The count floats ahead of the army, and drops behind it during battles
  // so it doesn't sit where the enemies hit.
  const cz = (army.front - 0.45) * (1 - G.battle) + (army.back + 0.7) * G.battle;
  const [cx, cy] = toScreen(army.cx, 0.55, cz);
  hud.setCount(army.N, cx, cy, G.state !== 'over' && army.N > 0);
  hud.setDist(Math.floor(G.dist * 10));
}

// ---------- Loop ----------

let time = 0;
let last = performance.now();
let perfAcc = 0, perfFrames = 0, perfWindow = 0, fps = 60;

function step(realDt) {
  const dt = realDt * G.timeScale;
  time += dt;
  update(dt, realDt);
  world.update(time, G.dist, G.ax, G.shake, G.battle);
  syncLabels();
  world.renderer.info.reset();
  world.render();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const raw = (now - last) / 1000;
  last = now;
  step(Math.min(raw, 1 / 30));

  // Adaptive quality: drop render resolution if frames run long.
  // Ignore long gaps (tab switches, throttled background frames).
  if (raw < 0.1) { perfAcc += raw; perfFrames++; perfWindow += raw; }
  if (perfWindow > 2) {
    const avg = perfAcc / perfFrames;
    fps = Math.round(1 / avg);
    if (avg > 0.019 && world.pixelRatio > 1) world.setPixelRatio(Math.max(1, world.pixelRatio - 0.25));
    perfAcc = perfFrames = perfWindow = 0;
  }
  if (DEBUG) {
    const info = world.renderer.info.render;
    hud.debug(`${fps} fps · pr ${world.pixelRatio.toFixed(2)} · units ${army.N}/${CFG.CAPACITY} · ${army.formation} · fell ${G.stats.fell} · enemies ${enemies.count} · danger ${G.danger.toFixed(2)} · time ×${G.timeScale.toFixed(2)} · bullets ${bullets.n} · calls ${info.calls}`);
  }
}

// Test hook: drive the sim without relying on requestAnimationFrame.
if (DEBUG) {
  window.vectorWars = {
    get state() { return G; },
    army,
    enemies,
    steer(x) { G.tx = x; },
    morph() { army.nextFormation(time); return army.formation; },
    step(frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) step(dt);
      return { state: G.state, N: army.N, formation: army.formation, dist: Math.round(G.dist), enemies: enemies.count,
        squads: enemies.squads.map((s) => `${s.kind}:${s.n}${s.charging ? '!' : ''}`).join(' '),
        speed: +G.speedMul.toFixed(2), danger: +G.danger.toFixed(2), timeScale: +G.timeScale.toFixed(2), lostEnemy: G.stats.lostEnemy };
    },
  };
}

window.addEventListener('resize', world.resize);
world.resize();
newRun();

// Wait (briefly) for the HUD font so gate labels render in it from the start.
Promise.race([
  document.fonts.load(`64px ${FONT}`),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {}).finally(() => {
  gates.invalidate();
  requestAnimationFrame((t) => { last = t; frame(t); });
});
