// Game loop and rules. URL params: ?units=800 (start size), ?seed=42,
// ?debug (FPS / unit counts overlay).

import { CFG, COLORS, ANIM, mulberry32, multHitsForStep } from './config.js';
import { createWorld } from './world.js';
import { Army } from './crowd.js';
import { EnemyForce } from './enemies.js';
import { squadMix, mixEst, TYPE_LIST } from './enemyFormations.js';
import { GatePool, FONT, gateColor } from './gates.js';
import { Bullets, Sparks, Fallers, Fizzles } from './fx.js';
import { UNIT_SPACING } from './formations.js';
import { DragInput } from './input.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

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
const fizzles = new Fizzles(world.scene, world.pointScale, UNIT_SPACING * 1.3);
const input = new DragInput(window);
const hud = new Hud();
const sfx = new Sfx();
// Audio can only start from a user gesture.
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
const muteBtn = document.getElementById('mute');
const syncMute = () => { muteBtn.classList.toggle('off', sfx.muted); muteBtn.setAttribute('aria-pressed', String(sfx.muted)); };
muteBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.unlock(); sfx.setMuted(!sfx.muted); syncMute(); });
syncMute();

let best = 0;
// Score-based best (distance + enemies defeated); the old distance-only key is ignored.
try { best = parseInt(localStorage.getItem('vector-wars-best-score'), 10) || 0; } catch { /* storage unavailable */ }
hud.setBest(best);

let G;
function newRun() {
  gates.clear();
  enemies.reset();
  bullets.clear();
  sparks.clear();
  fallers.clear();
  fizzles.clear();
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
    stats: { peak: START_UNITS, lostEnemy: 0, leaked: 0, lostGate: 0, fell: 0, gateHits: 0, kills: [0, 0, 0, 0] },
    ui: 0,                       // real-time clock for HUD fades
    loss: { n: 0, t: -9 },       // running loss total shown next to the count
    leakFlash: 0,
  };
  hud.showOver(null);
  hud.showTitle(true);
}

// ---------- Track generation (seeded, so every run of a seed is identical) ----------

const PATTERN = 'gegeggee';

function makeGateSpec(rng, scale) {
  const { mult, add, sub } = CFG.GATE_MIX, r = rng();
  if (r < mult) return { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 };
  if (r < mult + add) return { op: '+', v: Math.round((4 + rng() * 14) * scale), ch: 0, f: 0 };
  if (r < mult + add + sub) return { op: '+', v: -Math.round((18 + rng() * 42) * scale), ch: 0, f: 0 };
  return { op: '/', d: 2 + Math.floor(rng() * 3) * 0.5, ch: 0, f: 0 };   // ÷2.0, ÷2.5 or ÷3.0
}

const isBad = (s) => s.op === '/' || (s.op === '+' && s.v < 0);

function spawnNext() {
  const kind = PATTERN[G.seg % PATTERN.length];
  const wz = G.nextW;
  if (kind === 'g') {
    let L, R;
    if (G.gateIdx === 0) {
      L = { op: '+', v: 10, ch: 0, f: 0 };
      R = { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 };
    } else {
      const scale = Math.pow(1.12, G.gateIdx);
      L = makeGateSpec(G.rng, scale);
      R = makeGateSpec(G.rng, scale);
      // Never two dead ends: if both sides hurt, make one a small add.
      if (isBad(L) && isBad(R)) R = { op: '+', v: Math.round(3 * scale), ch: 0, f: 0 };
    }
    if (G.rng() < 0.5) [L, R] = [R, L];
    gates.acquire(wz, L, R);
    G.gateIdx++;
  } else {
    G.pending.push(wz);   // sized later, when it comes out of the fog
  }
  G.seg++;
  G.nextW += kind === 'g' ? CFG.SEG_GATE : CFG.SEG_ENEMY;
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
  const gain = (s, n) => s.op === 'x' ? n * s.m : s.op === '/' ? n / s.d : Math.max(0, n + s.v);
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

// Every lost unit fizzles out where it stood: cyan → red → black.
const unitLost = (x, z) => { fizzles.add(x, 0.12, G.dist - z); sfx.play('death'); };

// Battle and fall losses add up into one running "−N" next to the count.
function noteLoss(n) {
  if (n <= 0) return;
  G.loss.n += n;
  G.loss.t = G.ui;
}

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
    if (s.op === 'x') {
      const add = Math.round(n * (s.m - 1));
      if (add > 0) { spill(army.spawn(add, x)); gained = true; }
    }
    else if (s.op === '/') army.killSide(sign, n - Math.round(n / s.d), unitLost);
    else if (s.v > 0) { spill(army.spawn(Math.max(1, Math.round(s.v * share)), x)); gained = true; }
    else if (s.v < 0) army.killSide(sign, Math.min(n, Math.round(-s.v * share)), unitLost);
    if (s !== (g.primary === 'L' ? g.L : g.R)) s.f = 1;   // secondary panel flashes
  }
  shatterSparks(g);
  const d = army.N - before;
  G.loss.n = 0;
  hud.flashDelta(d);
  if (gained && d >= 0) sfx.play('gateUp');
  else if (d < 0) sfx.play('gateDown');
  if (gained && d >= 0) {
    feedback(gateColor(g.primary === 'L' ? g.L : g.R), ANIM.rippleGate, 40);
    army.nextFormation(time);
    if (navigator.vibrate) navigator.vibrate(12);
  }
  if (d < 0) {
    G.stats.lostGate -= d;
    feedback(COLORS.sub, ANIM.rippleGate, 30);
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

// Returns true when the gate's value stepped (for the tick sound).
function hitGate(s) {
  G.stats.gateHits++;
  const before = s.op === 'x' ? s.m : s.op === '/' ? s.d : s.v;
  if (s.op === 'x') {
    if (s.m < CFG.MULT_MAX - 1e-6) {
      // Climbs in 0.1 steps; higher steps cost more hits.
      s.ch += 1 / multHitsForStep(s.m);
      if (s.ch >= 0.999) { s.ch = 0; s.m = Math.round((s.m + CFG.MULT_STEP) * 10) / 10; }
    }
  } else if (s.op === '/') {
    // ÷ gates walk down toward ÷1.0 (no effect); steps near ÷3 cost the most.
    s.ch += 1 / multHitsForStep(s.d - CFG.MULT_STEP);
    if (s.ch >= 0.999) { s.ch = 0; s.d = Math.round((s.d - CFG.MULT_STEP) * 10) / 10; }
    if (s.d <= 1 + 1e-6) {
      // Shot down to ÷1.0: it flips into a ×1.0 gate and keeps climbing.
      Object.assign(s, { op: 'x', m: 1, ch: 0 });
      delete s.d;
    }
  } else {
    // + / − gates fill a charge bar too: ADD_HITS_PER_STEP bullets per +1.
    s.ch += 1 / CFG.ADD_HITS_PER_STEP;
    if (s.ch >= 0.999) { s.ch = 0; s.v += 1; }
  }
  s.f = 1;
  return (s.op === 'x' ? s.m : s.op === '/' ? s.d : s.v) !== before;
}

function bulletTest(x, oldW, newW) {
  for (const g of gates.active) {
    if (!g.done && oldW < g.wz && newW >= g.wz && Math.abs(x) < CFG.TW) {
      const side = x < 0 ? g.L : g.R;
      if (hitGate(side)) sfx.play('gateTick', { pitch: 1 + Math.min(1, side.op === '+' ? Math.max(0, side.v) / 60 : side.op === 'x' ? side.m - 1 : 3 - side.d) * 0.6 });
      else sfx.play('hit');
      return true;
    }
  }
  const hit = enemies.hitTest(x, oldW, newW);
  if (hit) {
    sparks.emit(x, 0.2, newW, COLORS.enemy, hit.killed ? 3 : 1, 2);
    if (hit.killed) { G.stats.kills[hit.t.id]++; sfx.play('pop'); } else sfx.play('hit');
    if (hit.killed && hit.s.n === 0) squadWiped(hit.s);
    return true;
  }
  return false;
}

function squadWiped(s) {
  world.addRipple(s.cx, s.cw, ANIM.rippleWipe, time);
  sparks.emit(s.cx, 0.3, s.cw, COLORS.enemy, 40, 4);
}

// An enemy reached the army (or slipped past and hit the rear): it dies and
// takes out the units nearest it. Bombers and brutes deal area damage, with
// a shockwave ring showing its reach.
function onHit(t, x, z, leaked) {
  let killed;
  if (t.aoe) {
    // Dense (packed) armies get a slightly smaller radius so kills stay in range.
    const r = t.aoe.radius * Math.max(0.6, army.pack), w = G.dist - z, c = COLORS[t.color];
    killed = army.killArea(x, z, r, t.aoe.peak, t.aoe.max, unitLost);
    sparks.ring(x, 0.2, w, r, c, 40);
    sparks.emit(x, 0.3, w, c, 30, 5);
    world.addRipple(x, w, t.shape === 3 ? ANIM.rippleStomp : ANIM.rippleBlast, time);
    sfx.play(t.shape === 3 ? 'stomp' : 'blast');
    G.shake = Math.max(G.shake, t.shape === 3 ? 0.3 : 0.22);
  } else {
    const k = Math.floor(t.damage) + (Math.random() < t.damage % 1 ? 1 : 0);
    killed = army.killNear(x, z, k, unitLost);
    sparks.emit(x, 0.2, G.dist - z, COLORS[t.color], t.size > 2 ? 12 : 4, 3);
  }
  noteLoss(killed);
  if (leaked) { G.stats.leaked += killed; G.leakFlash = 1; }
  else { G.stats.lostEnemy += killed; G.stats.kills[t.id]++; }   // it died on the army: defeated
  G.lastContact = time;
  G.shake = Math.min(0.16, Math.max(G.shake, 0.05) + 0.008);
  if (time - G.lastRipple > 0.2) {
    world.addRipple(x, G.dist - z, ANIM.rippleHit, time);
    G.lastRipple = time;
  }
}

function endRun() {
  G.state = 'over';
  G.overAt = time;
  // Score = distance + enemies defeated, each worth its hit points.
  const distPts = Math.floor(G.dist * CFG.SCORE_PER_DIST);
  const killPts = TYPE_LIST.map((t, i) => G.stats.kills[i] * t.hp * CFG.SCORE_PER_HP);
  const score = distPts + killPts.reduce((a, b) => a + b, 0);
  const newBest = score > best;
  if (newBest) {
    best = score;
    try { localStorage.setItem('vector-wars-best-score', String(best)); } catch { /* storage unavailable */ }
    hud.setBest(best);
  }
  army.kill(army.N, unitLost);
  sfx.play('lose');
  world.addRipple(G.ax, G.dist, ANIM.rippleDeath, time);
  sparks.emit(G.ax, 0.3, G.dist, COLORS.you, 80, 5);
  hud.showOver({ ...G.stats, dist: distPts / CFG.SCORE_PER_DIST, distPts, killPts, score, newBest });
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
    if (G.engaged && !engaged && army.N > 0) {
      // Battle won: big ripple from the army as the track lurches forward.
      G.surge = 1;
      world.addRipple(army.cx, G.dist, ANIM.rippleWin, time);
      sfx.play('win');
    }
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
  sfx.rate = G.timeScale;

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
    noteLoss(1);
    sfx.play('death');
    fallers.drop(x, G.dist - z, Math.sign(x), CFG.SPEED);
  });
  fallers.update(dt, G.dist);
  fizzles.update(dt, G.dist);
  sparks.update(dt, G.dist);
  G.shake = Math.max(0, G.shake - dt * 0.6);
}

// ---------- HUD ----------

function syncHud(realDt) {
  hud.setDanger(Math.min(1, Math.max((G.danger - 0.4) / (ANIM.slowMoThreshold - 0.4), G.leakFlash * 0.7, 0)));
  hud.setCount(army.N, G.state !== 'over' && army.N > 0);
  hud.setDist(Math.floor(G.dist * CFG.SCORE_PER_DIST));
  // The running loss total stays up while losses keep coming, then fades.
  G.ui += realDt;
  if (G.loss.n > 0 && G.ui - G.loss.t > 1.2) G.loss.n = 0;
  hud.liveLoss(G.loss.n);
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
  syncHud(realDt);
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
    sfx,
    gates,
    steer(x) { G.tx = x; },
    morph() { army.nextFormation(time); return army.formation; },
    lose(n, side = 1) { return army.killSide(side, n, unitLost); },
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
