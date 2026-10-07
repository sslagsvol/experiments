// Game loop and rules. URL params: ?units=3000 (start size), ?seed=42,
// ?debug (FPS / unit counts overlay).

import * as THREE from 'three';
import { CFG, COLORS, mulberry32 } from './config.js';
import { createWorld } from './world.js';
import { Army, EnemyView, squadGeometry } from './crowd.js';
import { GatePool, LabelPool, FONT } from './gates.js';
import { Bullets, Sparks } from './fx.js';
import { DragInput } from './input.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const START_UNITS = Math.max(1, parseInt(params.get('units'), 10) || CFG.START_UNITS);
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
  G = {
    state: 'title',
    N: START_UNITS,
    ax: 0, tx: 0,
    dist: 0, nextW: 0,
    seg: 0, gateIdx: 0, enemyIdx: 0,
    squads: [],
    rng: mulberry32(SEED),
    fireAcc: 0,
    shake: 0,
    overAt: 0,
    stats: { peak: START_UNITS, lostEnemy: 0, lostGate: 0, gateHits: 0 },
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
  sparks.emit(G.ax, 0.3, G.dist + army.radius, color, count, 4);
}

function applyGate(s) {
  const before = G.N;
  if (s.op === 'x') G.N = Math.min(CFG.UNIT_CAP, G.N * s.m);
  else G.N = Math.max(0, Math.min(CFG.UNIT_CAP, G.N + s.v));
  const d = G.N - before;
  if (d >= 0) {
    feedback(s.op === 'x' ? COLORS.mult : COLORS.add, 1, 40);
    if (navigator.vibrate) navigator.vibrate(12);
  } else {
    G.stats.lostGate -= d;
    feedback(COLORS.sub, 0.8, 30);
    G.shake = 0.12;
  }
}

function hitGate(s) {
  G.stats.gateHits++;
  if (s.op === 'x') {
    s.ch += CFG.MULT_CHARGE_PER_HIT;
    if (s.ch >= 1) { s.ch = 0; s.m++; }
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
    const lim = Math.max(0.1, CFG.TW - army.radius * 0.6);
    G.tx = Math.max(-lim, Math.min(lim, G.tx));
    G.ax += (G.tx - G.ax) * Math.min(1, dt * CFG.STEER_RESPONSE);

    // Squad contact: trade units 1:1 along the contact line.
    let speedMul = 1;
    const ar = army.radius;
    for (const sq of G.squads) {
      if (sq.n <= 0) continue;
      const ez = sq.wz - G.dist;
      if (ez - sq.r * 0.8 <= ar * 0.8 && ez + sq.r > -ar && Math.abs(sq.x - G.ax) < sq.r + ar * 0.9) {
        speedMul = CFG.CONTACT_SLOW;
        const k = Math.min(sq.n, G.N, Math.max(1, Math.round(dt * 90 + G.N * dt * 0.6)));
        sq.n -= k;
        G.N -= k;
        G.stats.lostEnemy += k;
        squadGeometry(sq);
        const mx = (sq.x + G.ax) / 2, mw = (sq.wz + G.dist + ar) / 2;
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

    G.fireAcc += dt * Math.min(CFG.FIRE_MAX, CFG.FIRE_BASE + CFG.FIRE_K * Math.sqrt(G.N));
    while (G.fireAcc >= 1) {
      G.fireAcc -= 1;
      bullets.fire(G.ax + (Math.random() * 2 - 1) * army.radius * 0.8, G.dist + army.radius * 0.6);
    }

    G.stats.peak = Math.max(G.stats.peak, G.N);
    if (G.N <= 0) endRun();
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

  army.update(dt, G.state === 'over' ? 0 : G.N, G.ax, time, (x, z) => {
    sparks.emit(x, 0.15, G.dist - z, COLORS.you, 1, 2);
  });
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
  const [cx, cy] = toScreen(G.ax, 0.55, -army.radius * 0.75 - 0.45);
  hud.setCount(G.N, cx, cy, G.state !== 'over' && G.N > 0);
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
    hud.debug(`${fps} fps · pr ${world.pixelRatio.toFixed(2)} · units ${G.N} (${army.V} drawn) · enemies ${enemyView.count} · bullets ${bullets.n} · calls ${info.calls}`);
  }
}

// Test hook: drive the sim without relying on requestAnimationFrame.
if (DEBUG) {
  window.vectorWars = {
    get state() { return G; },
    steer(x) { G.tx = x; },
    step(frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) { time += dt; step(dt); }
      return { state: G.state, N: G.N, dist: Math.round(G.dist), drawn: army.V, enemies: enemyView.count };
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
