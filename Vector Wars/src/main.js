// Game loop and rules. URL params: ?units=800 (start size), ?seed=42,
// ?debug (FPS / unit counts overlay).

import * as THREE from 'three';
import { CFG, COLORS, mulberry32 } from './config.js';
import { createWorld } from './world.js';
import { Army, EnemyView, squadGeometry } from './crowd.js';
import { GatePool, LabelPool, FONT } from './gates.js';
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
const enemyView = new EnemyView(world.scene, world.pointScale);
const gates = new GatePool(world.scene);
const labels = new LabelPool(world.scene, COLORS.enemy);
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
  if (G) for (const sq of G.squads) labels.release(sq.label);
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
    squads: [],
    rng: mulberry32(SEED),
    fireAcc: 0,
    shake: 0,
    overAt: 0,
    stats: { peak: START_UNITS, lostEnemy: 0, lostGate: 0, fell: 0, gateHits: 0 },
  };
  hud.showOver(null);
  hud.showTitle(true);
}

// ---------- Track generation (seeded, so every run of a seed is identical) ----------

const PATTERN = 'gegeggee';

function makeGateSpec(rng, scale) {
  const r = rng();
  if (r < 0.28) return { op: 'x', m: 2, ch: 0, f: 0 };
  if (r < 0.6) return { op: '+', v: Math.round((4 + rng() * 14) * scale), f: 0 };
  return { op: '+', v: -Math.round((6 + rng() * 20) * scale), f: 0 };
}

function spawnNext() {
  const kind = PATTERN[G.seg % PATTERN.length];
  const wz = G.nextW;
  if (kind === 'g') {
    let L, R;
    if (G.gateIdx === 0) {
      L = { op: '+', v: 10, f: 0 };
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
    const n = Math.round(12 * Math.pow(1.27, G.enemyIdx) * (0.8 + G.rng() * 0.4));
    const sq = { x: (G.rng() * 2 - 1) * 0.9, wz, n, label: labels.acquire() };
    squadGeometry(sq);
    G.squads.push(sq);
    G.enemyIdx++;
  }
  G.seg++;
  G.nextW += CFG.SEG;
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

function applyGate(s) {
  const before = army.N;
  if (s.op === 'x') spill(army.spawn(before * (s.m - 1)));
  else if (s.v >= 0) spill(army.spawn(s.v));
  else army.kill(-s.v, sparkLost);
  const d = army.N - before;
  if (s.op === 'x' || s.v > 0) {
    feedback(s.op === 'x' ? COLORS.mult : COLORS.add, 1, 40);
    army.nextFormation(time);
    if (navigator.vibrate) navigator.vibrate(12);
  } else if (d < 0) {
    G.stats.lostGate -= d;
    feedback(COLORS.sub, 0.8, 30);
    army.shake(0.12);
    G.shake = 0.12;
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
    s.v += 1;
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
  for (const sq of G.squads) {
    if (sq.n <= 0) continue;
    const r = sq.r + 0.05;
    if (Math.abs(x - sq.x) < r && newW >= sq.wz - r && oldW <= sq.wz + r) {
      sq.n--;
      squadGeometry(sq);
      sparks.emit(x, 0.2, newW, COLORS.enemy, 3, 2);
      if (sq.n === 0) {
        world.addRipple(sq.x, sq.wz, 0.7, time);
        sparks.emit(sq.x, 0.3, sq.wz, COLORS.enemy, 40, 4);
      }
      return true;
    }
  }
  return false;
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

function update(dt) {
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
    G.ax += (G.tx - G.ax) * Math.min(1, dt * CFG.STEER_RESPONSE);

    // Squad contact: trade units 1:1 along the contact line.
    let speedMul = 1;
    const ahead = -army.front, behind = army.back;
    for (const sq of G.squads) {
      if (sq.n <= 0 || army.N <= 0) continue;
      const ez = sq.wz - G.dist;
      if (ez - sq.r * 0.8 <= ahead && ez + sq.r > -behind && Math.abs(sq.x - army.cx) < sq.r + army.halfW * 0.9) {
        speedMul = CFG.CONTACT_SLOW;
        const k = Math.min(sq.n, army.N, Math.max(1, Math.round(dt * 90 + army.N * dt * 0.6)));
        sq.n -= k;
        army.kill(k);
        G.stats.lostEnemy += k;
        squadGeometry(sq);
        const mx = (sq.x + army.cx) / 2, mw = (sq.wz + G.dist + ahead) / 2;
        sparks.emit(mx, 0.2, mw, COLORS.enemy, Math.min(14, k * 2), 3);
        sparks.emit(mx, 0.2, mw, COLORS.you, Math.min(8, k), 3);
        G.shake = Math.max(G.shake, 0.05);
        if (sq.n === 0) world.addRipple(sq.x, sq.wz, 0.6, time);
      }
    }

    G.dist += CFG.SPEED * speedMul * dt;
    while (G.nextW < G.dist + CFG.VIEW_AHEAD) spawnNext();

    for (const g of gates.active) {
      if (!g.done && g.wz <= G.dist) {
        g.done = true;
        applyGate(G.ax < 0 ? g.L : g.R);
      }
    }

    G.fireAcc += dt * Math.min(CFG.FIRE_MAX, CFG.FIRE_BASE + CFG.FIRE_K * Math.sqrt(army.N));
    while (G.fireAcc >= 1) {
      G.fireAcc -= 1;
      bullets.fire(army.cx + (Math.random() * 2 - 1) * army.halfW * 0.8, G.dist - army.front);
    }

    G.stats.peak = Math.max(G.stats.peak, army.N);
    if (army.N <= 0) endRun();
  }

  // Housekeeping (runs in every state so the scene settles after a loss).
  bullets.update(dt, G.dist, G.state === 'play' ? bulletTest : () => false);
  for (const g of [...gates.active]) {
    g.L.f = Math.max(0, g.L.f - dt * 4);
    g.R.f = Math.max(0, g.R.f - dt * 4);
    if (g.wz - G.dist < -0.7) { gates.release(g); continue; }
    g.sync(G.dist);
  }
  G.squads = G.squads.filter((sq) => {
    const keep = sq.n > 0 && sq.wz - G.dist > -1.5;
    if (!keep) labels.release(sq.label);
    return keep;
  });

  army.update(dt, G.ax, time, (x, z) => {
    G.stats.fell++;
    fallers.drop(x, G.dist - z, Math.sign(x), CFG.SPEED);
  });
  fallers.update(dt, G.dist);
  enemyView.update(G.squads, G.dist, time);
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
  for (const sq of G.squads) {
    const l = sq.label;
    l.set(sq.n);
    l.mesh.position.set(sq.x, 0.55, -(sq.wz - G.dist) - sq.r - 0.35);
    l.mesh.quaternion.copy(world.camera.quaternion);
  }
  const [cx, cy] = toScreen(army.cx, 0.55, army.front - 0.45);
  hud.setCount(army.N, cx, cy, G.state !== 'over' && army.N > 0);
  hud.setDist(Math.floor(G.dist * 10));
}

// ---------- Loop ----------

let time = 0;
let last = performance.now();
let perfAcc = 0, perfFrames = 0, perfWindow = 0, fps = 60;

function step(dt) {
  update(dt);
  world.update(time, G.dist, G.ax, G.shake);
  syncLabels();
  world.renderer.info.reset();
  world.render();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(raw, 1 / 30);
  time += dt;

  step(dt);

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
    hud.debug(`${fps} fps · pr ${world.pixelRatio.toFixed(2)} · units ${army.N}/${CFG.CAPACITY} · ${army.formation} · fell ${G.stats.fell} · enemies ${enemyView.count} · bullets ${bullets.n} · calls ${info.calls}`);
  }
}

// Test hook: drive the sim without relying on requestAnimationFrame.
if (DEBUG) {
  window.vectorWars = {
    get state() { return G; },
    army,
    steer(x) { G.tx = x; },
    morph() { army.nextFormation(time); return army.formation; },
    step(frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) { time += dt; step(dt); }
      return { state: G.state, N: army.N, formation: army.formation, fell: G.stats.fell, dist: Math.round(G.dist), enemies: enemyView.count };
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
