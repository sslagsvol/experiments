// Game loop and rules. URL params: ?units=800 (start size), ?seed=42,
// ?debug (FPS / unit counts overlay).

import { CFG, COLORS, ANIM, GRID_PATTERNS, mulberry32, multHitsForStep } from './config.js';
import { createWorld } from './world.js';
import { Army } from './crowd.js';
import { EnemyForce } from './enemies.js';
import { squadMix, mixEst, TYPE_LIST, ENEMY_TYPES, UNLOCK_AT } from './enemyFormations.js';
import { GatePool, FONT, gateColor } from './gates.js';
import { Bullets, Sparks, Fallers, Fizzles } from './fx.js';
import { UNIT_SPACING } from './formations.js';
import { DragInput, KeyInput } from './input.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { cachedScores, fetchScores, rankFor, submitScore } from './scores.js';
import { LEVEL_1, levelDef, PATTERNS, WORLD_END } from './levels.js';

const params = new URLSearchParams(location.search);
// Two modes, picked on the title screen: Story (the levels) and Challenge
// (the classic fast, fully random track with nearly every enemy unlocked, for
// high-score runs). ?classic preselects Challenge.
let mode = params.has('classic') ? 'challenge' : 'story';
const CLASSIC = () => G.mode === 'challenge';
const startUnits = (m) => Math.min(CFG.CAPACITY, Math.max(1, parseInt(params.get('units'), 10) || (m === 'challenge' ? CFG.START_UNITS : LEVEL_1.start)));
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

// Pause: the button, Esc / P, or leaving the tab mid-run.
const pauseBtn = document.getElementById('pause-btn');
const pauseEl = document.getElementById('pause');
pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); setPaused(true); });
// Taps on the menu never reach the game (no steering, no stray taps on resume).
pauseEl.addEventListener('pointerdown', (e) => e.stopPropagation());
document.getElementById('resume').addEventListener('click', () => setPaused(false));
document.getElementById('restart').addEventListener('click', () => restartRun());
function restartRun() { setPaused(false); newRun(); startPlay(); }
// Keyboard: steering is read each frame (keys); everything else is here.
// The initials entry handles its own keys while it's open.
const keys = new KeyInput(window);
window.addEventListener('keydown', (e) => {
  document.body.classList.add('kb');   // show keyboard hints
  if (hud.entering || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'Escape' || k === 'p') {
    if (G.state === 'play') setPaused(!G.paused);
  } else if (k === ' ' || k === 'Enter') {
    e.preventDefault();
    sfx.unlock();
    if (G.state === 'title') startPlay('story');
    else if (G.paused) setPaused(false);
    else if (G.state === 'over' && time - G.overAt > 0.6 && hud.canRetry()) newRun();
  } else if (k === 'c' && G.state === 'title') {
    sfx.unlock();
    startPlay('challenge');
  } else if (k === 'r') {
    if (G.paused) restartRun();
  } else if (k === 'm') {
    sfx.unlock(); sfx.setMuted(!sfx.muted); syncMute();
  } else if (k === 'g') {
    cyclePattern();
  }
});
// Title: pick a mode.
const titleModes = document.getElementById('title-modes');
titleModes.addEventListener('pointerdown', (e) => e.stopPropagation());
for (const b of titleModes.querySelectorAll('button')) b.addEventListener('click', () => { sfx.unlock(); if (G.state === 'title') startPlay(b.dataset.mode); });

// Touch hides the keyboard hints again.
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.remove('kb'); }, { capture: true });

// Experiments (beta): grid pattern and background parallax, remembered per
// device. ?grid=hex picks a pattern for one visit.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
let pattern = world.setPattern(params.get('grid') || store.get('vector-wars-grid') || CFG.GRID_PATTERN);
let parallax = store.get('vector-wars-parallax') !== 'off';
world.setParallax(parallax);
function cyclePattern() {
  pattern = world.setPattern(GRID_PATTERNS[(GRID_PATTERNS.indexOf(pattern) + 1) % GRID_PATTERNS.length]);
  store.set('vector-wars-grid', pattern);
  hud.setLab(pattern, parallax);
  if (G.paused) world.render();
}
document.getElementById('grid-btn').addEventListener('click', cyclePattern);
document.getElementById('parallax-btn').addEventListener('click', () => {
  parallax = !parallax;
  world.setParallax(parallax);
  store.set('vector-wars-parallax', parallax ? 'on' : 'off');
  hud.setLab(pattern, parallax);
  if (G.paused) world.render();
});
hud.setLab(pattern, parallax);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
window.addEventListener('blur', () => setPaused(true));

function setPaused(on) {
  if (!G || G.state !== 'play' || G.paused === on) return;
  G.paused = on;
  hud.setPauseButton(!on);
  input.consumeTap();
  input.consumeDx();
  if (sfx.ctx) { if (on) sfx.ctx.suspend(); else if (!document.hidden) sfx.ctx.resume(); }
  if (!on) { hud.showPause(null); return; }
  hud.showPause(runStats(), cachedScores());
  refreshBoard().then((list) => { if (G.paused) hud.pauseScores(list); });
}

// "Hi" in the HUD is the top of the high score table (refreshed from the
// global board when it's configured).
let best = cachedScores()[0]?.score || 0;
let board = cachedScores();   // latest board, for the in-run medal badge
hud.setBest(best);
const refreshBoard = () => fetchScores().then((list) => {
  board = list;
  best = list[0]?.score || 0;
  hud.setBest(best);
  if (G && G.state === 'title') hud.showTitle(true, list);
  return list;
});

let G;
function newRun() {
  gates.clear();
  enemies.reset();
  bullets.clear();
  sparks.clear();
  fallers.clear();
  fizzles.clear();
  army.reset();
  army.spawn(startUnits(mode), 0);
  G = {
    state: 'title',
    mode,            // 'story' or 'challenge'
    paused: false,
    keyHold: 0,      // s the steer key has been held
    record: -1,      // s into the breaking-a-top-3-score slow motion (-1 = not running)
    recordPass: -1,  // when in that moment the score passed it
    recordNext: 2,   // board place whose score is next to break: 3rd, then 2nd, then 1st (-1 = all done)
    ax: 0, tx: 0,
    dist: 0, nextW: 0,
    seg: 0, gateIdx: 0, enemyIdx: 0,
    pending: [],     // squads waiting to come out of the fog: { wz, spec? }
    level: 1,
    beat: mode === 'challenge' ? -1 : 0,    // next authored beat of LEVEL_1 (-1 = random track)
    rampFrom: mode === 'challenge' ? 0 : -1, // gateIdx where the random track (and its linear ramp) began
    rampArmy: 0,     // army at the level gate: the base of the linear ramp
    genLevel: 0,     // level the generator is building (it runs ahead of the player)
    queue: [],       // pieces left to place for genLevel
    levelSpeed: 1,   // track speed for this level (sprint levels are faster)
    bonus: null,     // during a bonus level: { parked, killed, failed }
    killcam: 0,      // 0..1, eased: how far the camera has moved in on the army
    killcamT: 0,     // s left of a first-blast / first-stomp killcam
    seenAoe: {},     // enemy type ids whose area attack has already had its killcam
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
    stats: { peak: startUnits(mode), lostEnemy: 0, leaked: 0, lostGate: 0, fell: 0, gateHits: 0, kills: [0, 0, 0, 0], bossPts: 0 },
    ui: 0,                       // real-time clock for HUD fades
    gain: { n: 0, t: -9 },       // running gain total shown left of the count
    loss: { n: 0, t: -9 },       // running loss total shown right of the count
    leakFlash: 0,
  };
  hud.showOver(null);
  hud.showPause(null);
  hud.setPauseButton(false);
  hud.showTitle(true, cachedScores());
}

function startPlay(m = mode) {
  if (m !== G.mode) {
    // The title showed the other mode's army: rebuild the run for this one.
    mode = m;
    newRun();
  }
  G.state = 'play';
  if (CLASSIC()) G.levelSpeed = CFG.CHALLENGE_SPEED;
  G.nextW = G.dist + CFG.FIRST;
  hud.showTitle(false);
  hud.setPauseButton(true);
  if (!CLASSIC()) hud.toast(`Level ${G.level}`, 'Shoot the enemies · shoot the gates up');
}

// Score = distance + enemies defeated, each worth its hit points.
function runStats() {
  const distPts = Math.floor(G.dist * CFG.SCORE_PER_DIST);
  const killPts = TYPE_LIST.map((t, i) => G.stats.kills[i] * t.hp * CFG.SCORE_PER_HP);
  const score = distPts + killPts.reduce((a, b) => a + b, 0) + G.stats.bossPts;
  return { ...G.stats, distPts, killPts, score, newBest: false };
}

// ---------- Track generation (seeded, so every run of a seed is identical) ----------

const PATTERN = 'gegeggee';

function makeGateSpec(rng, scale, div = true) {
  const { mult, add, sub } = CFG.GATE_MIX, r = rng();
  if (!div && r >= mult + add + sub) return { op: '+', v: -Math.round((18 + rng() * 42) * scale), ch: 0, f: 0 };   // no ÷ yet
  if (r < mult) return { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 };
  if (r < mult + add) return { op: '+', v: Math.round((4 + rng() * 14) * scale), ch: 0, f: 0 };
  if (r < mult + add + sub) return { op: '+', v: -Math.round((18 + rng() * 42) * scale), ch: 0, f: 0 };
  return { op: '/', d: 2 + Math.floor(rng() * 3) * 0.5, ch: 0, f: 0 };   // ÷2.0, ÷2.5 or ÷3.0
}

const isBad = (s) => s.op === '/' || (s.op === '+' && s.v < 0);

// One authored beat (levels.js), placed `gap` after the previous one.
function spawnBeat() {
  const b = LEVEL_1.beats[G.beat++];
  const wz = G.nextW + b.gap;
  if (b.squad) G.pending.push({ wz, spec: b.squad });
  else if (b.pair) {
    let [L, R] = b.pair.map((s) => ({ ...s }));
    if (b.mirror && G.rng() < 0.5) [L, R] = [R, L];
    gates.acquire(wz, L, R);
    G.gateIdx++;
  } else if (b.single) {
    gates.acquire(wz, null, null, { ...b.single }, 0, { x: 0, width: b.width, slow: b.slow });
    G.gateIdx++;
  } else if (b.levelGate) {
    gates.acquire(wz, null, null, { op: 'level', n: b.levelGate, ch: 0, f: 0 }, 0, { x: 0, width: 2 * CFG.TW - 0.1 });
  }
  G.nextW = wz;
  if (G.beat >= LEVEL_1.beats.length) {
    // Script done: random track from here, ramping up linearly.
    G.beat = -1;
    G.rampFrom = G.gateIdx;
    G.enemyIdx = 2;
    G.genLevel = 2;   // levels 2+ are generated from levels.js
    G.nextW = wz + CFG.LEVEL_QUIET;
  }
}

// Which enemy types squads may use (squadMix / UNLOCK_AT): by level, each
// unleashed by the bonus-level mini-boss before it.
const unlockIdx = () => CLASSIC() ? (G.enemyIdx >= 1 ? 99 : 0) : G.level;   // Challenge: everything after the first squad

// Fire rate for the current level (it grows at each level gate).
const fireMul = () => CLASSIC() ? 1 : CFG.FIRE_LEVELS[Math.min(CFG.FIRE_LEVELS.length - 1, G.level - 1)];

// Gate values and squad par: the original exponential curve for the classic
// track, or a linear ramp from the end of the authored level.
const rampK = () => G.gateIdx - G.rampFrom;
const gateScale = () => CLASSIC() ? Math.pow(1.12, G.gateIdx) : 1 + CFG.RAMP_GATE * rampK();

// Levels 2+ (levels.js): each level becomes a queue of pieces, ending in the
// next level gate. Built when the generator (which runs ahead of the player)
// reaches it.
function buildLevel(n) {
  const def = levelDef(n), q = [];
  if (def.kind === 'bonus') {
    // A small + pair to warm up, squads between gates, the mini-boss, the
    // bonus × gate that multiplies the survivors, and back.
    q.push('g');
    for (let k = 0; k < def.squads; k++) q.push('e', 'g');   // a gate after each squad, including before the boss
    q.push('boss', 'bonusX');
  } else {
    const pat = PATTERNS[def.kind];
    for (let k = 0; k < def.pieces; k++) q.push(pat[k % pat.length]);
  }
  q.push('level');
  G.queue = q.filter(Boolean).map((kind) => ({ kind, n, def }));
}

const fullWidth = { x: 0, width: 2 * CFG.TW - 0.1 };

function spawnLevelPiece() {
  if (!G.queue.length) buildLevel(G.genLevel);
  const { kind, n, def } = G.queue.shift(), wz = G.nextW, bonus = def.kind === 'bonus';
  let gap = CFG.SEG_GATE;
  if (kind === 'g') {
    const scale = gateScale();
    let g;
    if (def.moving && !bonus && G.rng() < CFG.MOVING_GATE_CHANCE) {
      const good = G.rng() < CFG.MOVING_GATE_GOOD;
      const S = good ? (G.rng() < 0.3 ? { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 } : { op: '+', v: Math.round((10 + G.rng() * 20) * scale), ch: 0, f: 0 })
        : (def.div && G.rng() < 0.5 ? { op: '/', d: 2, ch: 0, f: 0 } : { op: '+', v: -Math.round((20 + G.rng() * 40) * scale), ch: 0, f: 0 });
      g = gates.acquire(wz, null, null, S, G.rng() * Math.PI * 2);
    } else {
      let L, R;
      if (bonus) {
        // The strike team's gates are small and kind: it's a fight, not a math test.
        L = { op: '+', v: Math.round(4 + G.rng() * 6), ch: 0, f: 0 };
        R = { op: '+', v: Math.round(2 + G.rng() * 4), ch: 0, f: 0 };
      } else if (def.split && G.rng() < 0.3) {
        // Both sides good and close in value: straddle the middle to take both.
        const v = Math.round((8 + G.rng() * 10) * scale);
        L = { op: '+', v, ch: 0, f: 0 };
        R = G.rng() < 0.4 ? { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 } : { op: '+', v: Math.round(v * (0.8 + G.rng() * 0.4)), ch: 0, f: 0 };
      } else {
        L = makeGateSpec(G.rng, scale, def.div);
        R = makeGateSpec(G.rng, scale, def.div);
        if (isBad(L) && isBad(R)) R = { op: '+', v: Math.round(3 * scale), ch: 0, f: 0 };
      }
      if (G.rng() < 0.5) [L, R] = [R, L];
      g = gates.acquire(wz, L, R);
    }
    g.bonus = bonus;
    G.gateIdx++;
    if (def.kind === 'sprint') gap = CFG.LEVEL_SPACING_SPRINT;
  } else if (kind === 'e') {
    G.pending.push({ wz, bonus });
    if (bonus) G.pending.push({ wz: wz + 3, bonus, cluster: def.boss });
    gap = def.kind === 'gauntlet' ? CFG.SEG_GATE + 4 : CFG.SEG_ENEMY;
  } else if (kind === 'boss') {
    G.pending.push({ wz, bonus, boss: def.boss });
    gap = CFG.SEG_ENEMY + 14;
  } else if (kind === 'bonusX') {
    // Shoot it up to multiply the survivors before they rejoin your army.
    gates.acquire(wz, null, null, { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 }, 0, fullWidth).bonus = true;
  } else if (kind === 'level') {
    gates.acquire(wz, null, null, { op: 'level', n: n + 1, ch: 0, f: 0 }, 0, fullWidth);
    G.genLevel = n + 1;
    gap = CFG.LEVEL_QUIET;
  }
  G.nextW = wz + gap;
}

function spawnNext() {
  if (G.beat >= 0) { spawnBeat(); return; }
  if (!CLASSIC()) { spawnLevelPiece(); return; }
  const kind = PATTERN[G.seg % PATTERN.length];
  const wz = G.nextW;
  if (kind === 'g' && G.gateIdx > 0 && G.rng() < CFG.MOVING_GATE_CHANCE) {
    // Uncommon: a single gate swaying side to side. Mostly worth chasing.
    const scale = gateScale();
    let S;
    if (G.rng() < CFG.MOVING_GATE_GOOD) {
      S = G.rng() < 0.3 ? { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 } : { op: '+', v: Math.round((10 + G.rng() * 20) * scale), ch: 0, f: 0 };
    } else {
      S = G.rng() < 0.5 ? { op: '/', d: 2, ch: 0, f: 0 } : { op: '+', v: -Math.round((20 + G.rng() * 40) * scale), ch: 0, f: 0 };
    }
    gates.acquire(wz, null, null, S, G.rng() * Math.PI * 2);
    G.gateIdx++;
  } else if (kind === 'g') {
    let L, R;
    if (G.gateIdx === 0) {
      L = { op: '+', v: 10, ch: 0, f: 0 };
      R = { op: 'x', m: CFG.MULT_START, ch: 0, f: 0 };
    } else {
      const scale = gateScale();
      L = makeGateSpec(G.rng, scale);
      R = makeGateSpec(G.rng, scale);
      // Never two dead ends: if both sides hurt, make one a small add.
      if (isBad(L) && isBad(R)) R = { op: '+', v: Math.round(3 * scale), ch: 0, f: 0 };
    }
    if (G.rng() < 0.5) [L, R] = [R, L];
    gates.acquire(wz, L, R);
    G.gateIdx++;
  } else {
    G.pending.push({ wz });   // sized later, when it comes out of the fog
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
  const gain = (s, n) => s.op === 'level' ? n : s.op === 'x' ? n * s.m : s.op === '/' ? n / s.d : Math.max(0, n + s.v);
  const events = [
    ...gates.active.filter((g) => !g.done && g.wz < wz).map((g) => [g.wz, (n) => g.S ? Math.max(n, gain(g.S, n)) : Math.max(gain(g.L, n), gain(g.R, n))]),
    ...enemies.squads.filter((s) => s.n > 0 && s.cw < wz).map((s) => [s.cw, (n) => n - enemies.squadStrength(s) * 0.7]),
  ].sort((a, b) => a[0] - b[0]);
  let n = army.N;
  for (const [, apply] of events) n = Math.max(10, Math.min(CFG.CAPACITY, apply(n)));
  return n;
}

// Squad size tracks the projected army plus a "par" curve from gates
// passed, so battles stay a real threat. Tuned in batch E.
// n units of one type: a share of the team's headcount (× difficulty).
const typeCount = (share, lo, hi) => Math.max(lo, Math.min(hi, Math.round(army.N * share * CFG.DIFFICULTY)));
const only = (key) => ({ back: [], mix: [[key, 1]] });

function spawnSquad({ wz, spec, boss, cluster, bonus }) {
  if (boss) {
    // A mini-boss behind an escort of small units of its own type. It hangs
    // back, shielded, until the escort is gone; then it advances slowly with
    // the track stopped: a team in good shape shoots it down before it arrives.
    const shots = Math.min(CFG.FIRE_MAX, CFG.FIRE_BASE + CFG.FIRE_K * Math.sqrt(Math.max(1, army.N))) * fireMul();
    enemies.spawnSquad('wall', typeCount(CFG.SCREEN_SHARE, 6, 45), 0, wz - 9, G.rng, G.level, only('grunt'));   // grunts in front take the first shots
    const escort = enemies.spawnSquad('wall', typeCount(CFG.ESCORT_SHARE[boss], 3, 18), 0, wz - 4, G.rng, G.level, only(boss));
    const s = enemies.spawnBoss(boss, Math.max(12, Math.round(shots * CFG.BOSS_HP_SECONDS * CFG.BOSS_HP_MUL[boss] * CFG.DIFFICULTY)), 0, wz + 2);
    s.escort = escort;
    return;
  }
  if (cluster) {
    // A small cluster of the coming boss's type riding with a bonus squad,
    // to show what it does before the boss arrives.
    const x = (G.rng() < 0.5 ? -1 : 1) * CFG.TW * 0.5;
    enemies.spawnSquad('wall', typeCount(CFG.SCREEN_SHARE * 0.6, 5, 30), x, wz - 2.5, G.rng, G.level, only('grunt'));   // a grunt screen in front
    enemies.spawnSquad('blob', typeCount(CFG.CLUSTER_SHARE[cluster], 2, 9), x, wz, G.rng, G.level, only(cluster));
    return;
  }
  if (spec) {
    // Authored: grunts only, at a set position; an exact size, or a share of
    // the best-case army (like the random track, by expected damage).
    const n = Math.round(CFG.DIFFICULTY * (spec.threat ? Math.max(8, projectedArmy(wz) * spec.threat / mixEst(squadMix(spec.kind, 0))) : spec.n));
    enemies.spawnSquad(spec.kind, n, spec.x || 0, wz, G.rng, 0);
    return;
  }
  let kind = 'blob', n = 10;
  if (G.enemyIdx > 0) {
    kind = pickKind();
    // Classic: exponential par. After an authored level: the army it ended
    // with, ramping up linearly.
    const par = Math.min(CFG.CAPACITY, CLASSIC() ? 30 * Math.pow(1.3, G.gateIdx) : (G.rampArmy || projectedArmy(wz)) * (1 + CFG.RAMP_PAR * rampK()));
    const ref = 0.8 * projectedArmy(wz) + 0.2 * par;
    const threat = CFG.ENEMY_THREAT_MIN + G.rng() * (CFG.ENEMY_THREAT_MAX - CFG.ENEMY_THREAT_MIN);
    // Size by strength, not headcount: a squad with brutes or bombers has fewer units.
    n = Math.round(Math.max(8, ref * threat / mixEst(squadMix(kind, unlockIdx()))) * (CLASSIC() ? 1 : CFG.DIFFICULTY) * (bonus ? CFG.BONUS_SQUAD_SCALE : 1));
  }
  enemies.spawnSquad(kind, n, (G.rng() * 2 - 1) * CFG.TW, wz, G.rng, unlockIdx());
  G.enemyIdx++;
}

// ---------- Rules ----------

function feedback(color, amp, count) {
  world.addRipple(G.ax, G.dist, amp, time);
  sparks.emit(G.ax, 0.3, G.dist - army.front, color, count, 4);
}

// Every lost unit fizzles out where it stood: cyan → red → black.
const unitLost = (x, z) => { fizzles.add(x, 0.12, G.dist - z); sfx.play('death'); };

// Gains and losses add up into running totals beside the count ("+N" left,
// "−N" right) while they keep coming: a split gate can show both at once.
function noteGain(n) {
  if (n <= 0) return;
  G.gain.n += n;
  G.gain.t = G.ui;
}

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
// A moving gate works the same way over just its span: only the units that
// pass through it are affected, and it only shatters if someone did.
function crossGate(g) {
  if (g.S && g.S.op === 'level') { levelUp(g); return; }
  const total = army.N, before = army.N;
  const half = g.sw / 2;
  const regions = g.S
    ? [[g.S, g.sx - half, g.sx + half, 'S']]
    : [[g.L, -Infinity, 0, 'L'], [g.R, 0, Infinity, 'R']];
  g.done = true;
  g.doneAt = time;
  g.primary = g.S ? null : army.cx < 0 ? 'L' : 'R';
  let gained = false, gainSum = 0, lossSum = 0;
  for (const [s, x0, x1, key] of regions) {
    const n = army.countRange(x0, x1);
    if (n <= 0) continue;
    const n0 = army.N;
    if (g.S) g.primary = 'S';
    // New units appear where this panel's units are.
    const share = n / total, x = g.S ? g.sx : (key === 'L' ? -1 : 1) * Math.min(1, army.halfW * 0.5);
    if (s.op === 'x') {
      const add = Math.round(n * (s.m - 1));
      if (add > 0) { spill(army.spawn(add, x)); gained = true; }
    }
    else if (s.op === '/') army.killRange(x0, x1, n - Math.round(n / s.d), unitLost);
    else if (s.v > 0) { spill(army.spawn(Math.max(1, Math.round(s.v * share)), x)); gained = true; }
    else if (s.v < 0) army.killRange(x0, x1, Math.min(n, Math.round(-s.v * share)), unitLost);
    if (key !== g.primary) s.f = 1;   // secondary panel flashes
    if (army.N > n0) gainSum += army.N - n0; else lossSum += n0 - army.N;
  }
  if (!g.primary) return;   // a moving gate nobody touched just slides past
  shatterSparks(g);
  const d = army.N - before;
  noteGain(gainSum);
  noteLoss(lossSum);
  if (gained && d >= 0) sfx.play('gateUp');
  else if (d < 0) sfx.play('gateDown');
  if (gained && d >= 0) {
    feedback(gateColor(primarySpec(g)), ANIM.rippleGate, 40);
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

// Crossing a level gate: the biggest ripple, a burst along the line, and a
// banner. The random track (with its linear ramp) starts from this army.
function levelUp(g) {
  g.done = true;
  g.doneAt = time;
  g.primary = 'S';
  shatterSparks(g);
  world.addRipple(army.cx, G.dist, ANIM.rippleLevel, time);
  sparks.ring(army.cx, 0.3, G.dist - army.front, 1.6, COLORS.white, 50);
  sfx.play('levelUp', { gain: 0.8 + 0.4 * g.S.ch });
  setTimeout(() => sfx.play('win'), 380);   // the win blast lands on the crescendo's hit
  if (!G.rampArmy) G.rampArmy = Math.max(30, army.N);   // the ramp starts from the army at the end of level 1
  if (G.bonus) leaveBonus();
  const fireBefore = fireMul();
  G.level = g.S.n;
  const def = levelDef(G.level);
  G.levelSpeed = def.speed || 1;
  const fireUp = fireMul() > fireBefore;
  if (def.kind === 'bonus') {
    // Bonus level: your army waits; a small strike team goes in. The banner
    // shows the mini-boss to come (no words).
    G.bonus = { parked: army.N, killed: false, failed: false };
    army.reset();
    army.spawn(def.team, 0);
    hud.levelBanner('Bonus level', ENEMY_TYPES[def.boss]);
    return;
  }
  // Minimal and direct: what you got, then (no words) the enemy this level adds.
  const key = Object.keys(UNLOCK_AT).find((k) => UNLOCK_AT[k] === G.level);
  const title = G.level === WORLD_END ? 'World 1 complete' : fireUp ? 'Attack speed increased' : `Level ${G.level}`;
  hud.levelBanner(title, key ? ENEMY_TYPES[key] : null);
}

// Leaving a bonus level: your army comes back. If the mini-boss died, the
// surviving strike team joins it (after the bonus × gate), capped at
// BONUS_RETURN_CAP of your army.
function leaveBonus() {
  const { parked, killed, failed } = G.bonus;
  const add = killed && !failed ? Math.min(army.N, Math.max(CFG.BONUS_RETURN_MIN, Math.round(parked * CFG.BONUS_RETURN_CAP))) : 0;
  G.bonus = null;
  army.reset();
  spill(army.spawn(parked + add, 0));
  noteGain(add);
}

// The strike team was wiped out: the bonus is lost (no reward), but the run
// isn't. Your army comes straight back and the rest of the bonus is cleared.
function bonusLost() {
  const parked = G.bonus.parked;
  G.bonus.failed = true;
  enemies.reset();
  G.pending = G.pending.filter((p) => !p.bonus);
  G.queue = G.queue.filter((p) => p.kind === 'level' || p.n !== G.level);   // drop bonus pieces not placed yet
  for (const g of [...gates.active]) if (g.bonus) gates.release(g);
  army.spawn(parked, 0);
  hud.toast('Strike team lost');
}

// A mini-boss destroyed: a big burst, a short killcam, and its points.
function bossDown(s, x, w) {
  if (G.bonus) G.bonus.killed = true;
  G.stats.bossPts += s.hpMax * CFG.SCORE_PER_HP;
  sparks.ring(x, 0.6, w, 2.2, COLORS.white, 60);
  sparks.emit(x, 0.8, w, COLORS.enemyHot, 120, 7);
  world.addRipple(x, w, ANIM.rippleWin, time);
  sfx.play('win');
  G.killcamT = Math.max(G.killcamT, 1.0);
  G.shake = Math.max(G.shake, 0.25);
}

const primarySpec = (g) => g.primary === 'S' ? g.S : g.primary === 'L' ? g.L : g.R;

// Burst of sparks along the primary panel's outline.
function shatterSparks(g) {
  const s = primarySpec(g), c = gateColor(s);
  const x0 = g.primary === 'S' ? g.sx - g.sw / 2 : g.primary === 'L' ? -CFG.TW + 0.05 : 0.05;
  const x1 = x0 + (g.primary === 'S' ? g.sw : CFG.TW - 0.1);
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
      s.ch += 1 / (multHitsForStep(s.m) * CFG.GATE_DURABILITY);
      if (s.ch >= 0.999) {
        s.ch = 0;
        s.m = Math.round((s.m + CFG.MULT_STEP) * 10) / 10;
        if (s.m >= CFG.MULT_MAX - 1e-6) s.maxed = true;   // the caller celebrates
      }
    }
  } else if (s.op === '/') {
    // ÷ gates walk down toward ÷1.0 (no effect); steps near ÷3 cost the most.
    s.ch += 1 / (multHitsForStep(s.d - CFG.MULT_STEP) * CFG.GATE_DURABILITY);
    if (s.ch >= 0.999) { s.ch = 0; s.d = Math.round((s.d - CFG.MULT_STEP) * 10) / 10; }
    if (s.d <= 1 + 1e-6) {
      // Shot down to ÷1.0: it flips into a ×1.0 gate and keeps climbing.
      Object.assign(s, { op: 'x', m: 1, ch: 0 });
      delete s.d;
    }
  } else {
    // + / − gates fill a charge bar too: ADD_HITS_PER_STEP bullets per +1.
    s.ch += 1 / (CFG.ADD_HITS_PER_STEP * CFG.GATE_DURABILITY);
    if (s.ch >= 0.999) { s.ch = 0; s.v += 1; }
  }
  s.f = 1;
  return (s.op === 'x' ? s.m : s.op === '/' ? s.d : s.v) !== before;
}

function bulletTest(x, oldW, newW) {
  for (const g of gates.active) {
    if (g.done || oldW >= g.wz || newW < g.wz || Math.abs(x) >= CFG.TW) continue;
    if (g.S && g.S.op === 'level') {
      // Level gates soak up bullets quietly, a soft blip that grows louder and
      // higher as the gate nears; crossing it is the crescendo.
      const s = g.S, near = 1 - Math.min(1, (g.wz - G.dist) / CFG.VIEW_AHEAD);
      s.ch = Math.min(1, s.ch + 1 / CFG.LEVEL_CHARGE_HITS);
      s.f = Math.max(s.f, 0.35);
      sfx.play('levelCharge', { pitch: 1 + near * 1.2, gain: 0.3 + near * 0.7 });
      return true;
    }
    if (g.S && Math.abs(x - g.sx) > g.sw / 2) continue;   // missed the single gate
    const side = g.S || (x < 0 ? g.L : g.R);
    if (hitGate(side)) {
      if (side.maxed) { side.maxed = false; maxedOut(g, side); }
      else sfx.play('gateTick', { pitch: 1 + Math.min(1, side.op === '+' ? Math.max(0, side.v) / 60 : side.op === 'x' ? side.m - 1 : 3 - side.d) * 0.6 });
    } else sfx.play('hit');
    return true;
  }
  const hit = enemies.hitTest(x, oldW, newW);
  if (hit) {
    sparks.emit(x, 0.2, newW, COLORS.enemy, hit.killed ? 3 : 1, 2);
    if (hit.killed) { G.stats.kills[hit.t.id]++; sfx.play('pop'); } else if (!hit.shielded) sfx.play('hit');
    if (hit.shielded) sfx.play('hit', { pitch: 0.45 });   // dull tick: bounced off the shield
    if (hit.killed && hit.boss) bossDown(hit.s, x, newW);
    else if (hit.killed && hit.s.n === 0) squadWiped(hit.s);
    return true;
  }
  return false;
}

// A × gate hit its ×3.0 cap: the data-stream sound, a gold burst and a ripple.
function maxedOut(g, s) {
  sfx.play('maxMult');
  const x = g.S ? g.sx : s === g.L ? -CFG.TW / 2 : CFG.TW / 2;   // (fixed singles sit at sx too)
  sparks.emit(x, CFG.GATE_H * 0.6, g.wz, COLORS.mult, 60, 5);
  sparks.ring(x, CFG.GATE_H * 0.5, g.wz, 0.9, COLORS.mult, 30);
  world.addRipple(x, g.wz, ANIM.rippleGate, time);
}

function squadWiped(s) {
  world.addRipple(s.cx, s.cw, ANIM.rippleWipe, time);
  sparks.emit(s.cx, 0.3, s.cw, COLORS.enemy, 40, 4);
}

// An enemy reached the army (or slipped past and hit the rear): it dies and
// takes out the units nearest it. Bombers and brutes deal area damage, with
// a shockwave ring showing its reach.
function onHit(t, x, z, leaked, boss = false) {
  let killed;
  if (boss) {
    // The mini-boss reached the team: one huge area hit, then it's gone.
    const w = G.dist - z, h = CFG.BOSS_HIT;
    killed = army.killArea(x, z, h.radius, h.peak, Math.ceil(army.N * h.share), unitLost);
    sparks.ring(x, 0.3, w, h.radius * 1.3, COLORS[t.color], 60);
    world.addRipple(x, w, ANIM.rippleDeath, time);
    sfx.play('stomp');
    G.shake = 0.35;
    G.killcamT = Math.max(G.killcamT, ANIM.killcamHold);
  } else if (t.aoe) {
    // Dense (packed) armies get a slightly smaller radius so kills stay in range.
    const r = t.aoe.radius * Math.max(0.6, Math.min(1, army.pack)), w = G.dist - z, c = COLORS[t.color];
    killed = army.killArea(x, z, r, t.aoe.peak, t.aoe.max, unitLost);
    sparks.ring(x, 0.2, w, r, c, 40);
    sparks.emit(x, 0.3, w, c, 30, 5);
    world.addRipple(x, w, t.shape === 3 ? ANIM.rippleStomp : ANIM.rippleBlast, time);
    sfx.play(t.shape === 3 ? 'stomp' : 'blast');
    // The first blast and first stomp of a run get a killcam: slow motion,
    // camera in close.
    if (!G.seenAoe[t.id]) { G.seenAoe[t.id] = true; G.killcamT = ANIM.killcamHold; }
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
  const stats = runStats(), { score } = stats;
  G.state = 'over';
  G.overAt = time;
  hud.setPauseButton(false);
  army.kill(army.N, unitLost);
  sfx.play('lose');
  world.addRipple(G.ax, G.dist, ANIM.rippleDeath, time);
  sparks.emit(G.ax, 0.3, G.dist, COLORS.you, 80, 5);
  // Recap first; then check the (global) board. Made the top 10? Enter
  // initials, then the board replaces the recap.
  const run = G;
  hud.showOver(stats);
  refreshBoard().then((list) => {
    if (G !== run) return;   // already restarted
    const rank = rankFor(score, list);
    if (rank < 0) { hud.allowRetry(); return; }
    hud.offerEntry({
      rank,
      onStep: () => sfx.play('gateTick'),
      onSubmit: async (initials) => {
        sfx.play('maxMult');
        hud.saving();
        const saved = await submitScore(initials, score);
        board = saved.list;
        best = board[0]?.score || 0;
        hud.setBest(best);
        if (G === run) hud.showBoard(board, saved.index);
      },
    });
  });
}

// dt is simulation time (slowed during slow motion); realDt drives anything
// the player feels directly, like steering and the slow-motion easing itself.
function update(dt, realDt) {
  const tapped = input.consumeTap();
  const dx = input.consumeDx();

  if (G.state === 'title') {
    G.dist += CFG.SPEED * 0.35 * dt;
    // Title: the Story / Challenge buttons start a run (taps elsewhere don't).
  } else if (G.state === 'over') {
    // No restart while typing initials, or in the instant after the board appears.
    if (tapped && time - G.overAt > 0.6 && hud.canRetry()) newRun();
  }

  if (G.state === 'play') {
    G.tx += dx / window.innerWidth * (2 * CFG.TW) / CFG.DRAG_SPAN;
    // Keyboard: a tap nudges, a hold ramps up to a steady sweep.
    const kd = keys.dir;
    G.keyHold = kd ? G.keyHold + realDt : 0;
    if (kd) {
      const ramp = Math.min(1, CFG.KEY_STEER_START + (1 - CFG.KEY_STEER_START) * G.keyHold / CFG.KEY_STEER_RAMP);
      G.tx += kd * CFG.KEY_STEER_SPEED * ramp * (keys.fast ? CFG.KEY_STEER_FAST : 1) * realDt;
    }
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
      // Squad beaten: a small ripple as the track lurches forward. (The big
      // win ripple and sound are kept for level gates and mini-bosses.)
      G.surge = 1;
      world.addRipple(army.cx, G.dist, ANIM.rippleBattle, time);
    }
    G.engaged = engaged;
    G.surge = Math.max(0, G.surge - dt * ANIM.surgeDecay);
    // A mini-boss on the move stops the track: it comes to you, slowly.
    const bossComing = enemies.boss && enemies.boss.charging && !(enemies.boss.escort && enemies.boss.escort.n > 0);
    let targetSpeed = close || bossComing ? 0 : engaged ? ANIM.approachSpeed : 1 + ANIM.surgeBoost * G.surge;
    // Authored "slow" gates: crawl up to them so the value visibly climbs.
    for (const g of gates.active) {
      const ahead = g.wz - G.dist;
      if (g.slow && !g.done && ahead < ANIM.gateSlowFrom && ahead > ANIM.gateSlowTo) targetSpeed = Math.min(targetSpeed, ANIM.gateSlowSpeed);
    }
    G.speedMul += (targetSpeed - G.speedMul) * Math.min(1, dt * ANIM.battleBrake);
    G.battle += ((close ? 1 : engaged ? 0.4 : 0) - G.battle) * Math.min(1, dt * 3);

    // Danger: how much enemy strength is about to hit, relative to the army.
    const incoming = enemies.threat(G.dist, army, 6);
    const danger = incoming > 0 ? incoming / Math.max(1, army.N) : 0;
    G.danger += (danger - G.danger) * Math.min(1, realDt * 4);

    G.dist += CFG.SPEED * G.speedMul * G.levelSpeed * dt;
    while (G.nextW < G.dist + CFG.VIEW_AHEAD) spawnNext();
    while (G.pending.length && G.pending[0].wz < G.dist + CFG.ENEMY_SPAWN_AHEAD) spawnSquad(G.pending.shift());

    for (const g of gates.active) {
      if (!g.done && g.wz <= G.dist) {
        crossGate(g);
      }
    }

    G.fireAcc += dt * Math.min(CFG.FIRE_MAX, CFG.FIRE_BASE + CFG.FIRE_K * Math.sqrt(army.N)) * fireMul();
    while (G.fireAcc >= 1) {
      G.fireAcc -= 1;
      bullets.fire(army.cx + (Math.random() * 2 - 1) * army.halfW * 0.8, G.dist - army.front);
    }

    G.stats.peak = Math.max(G.stats.peak, army.N);
    if (army.N <= 0) { if (G.bonus && !G.bonus.failed) bonusLost(); else endRun(); }
  } else {
    G.danger = Math.max(0, G.danger - realDt * 2);
    G.battle = Math.max(0, G.battle - realDt * 2);
  }

  // Slow motion: ease in when the army is about to be overwhelmed.
  const slow = G.state === 'play' && G.danger >= ANIM.slowMoThreshold;
  const recordMoment = G.state === 'play' && recordSlowMo(realDt);
  G.killcamT = Math.max(0, G.killcamT - realDt);
  const cam = G.state === 'play' && G.killcamT > 0;
  const targetScale = Math.min(slow ? ANIM.slowMoScale : 1, recordMoment ? ANIM.recordScale : 1, cam ? ANIM.killcamScale : 1);
  const ease = targetScale < G.timeScale ? (cam ? ANIM.killcamIn : recordMoment && !slow ? ANIM.recordIn : ANIM.slowMoIn) : ANIM.slowMoOut;
  G.timeScale += (targetScale - G.timeScale) * Math.min(1, realDt / ease);
  sfx.rate = G.timeScale;
  // Killcam: the camera follows danger slow motion in, and the first-blast /
  // first-stomp moments. (The record-breaking slow motion keeps the wide view.)
  const camTarget = G.state === 'play' ? Math.max(cam ? 1 : 0, slow ? Math.min(1, (1 - G.timeScale) / (1 - ANIM.slowMoScale)) : 0) : 0;
  G.killcam += (camTarget - G.killcam) * Math.min(1, realDt / (camTarget > G.killcam ? ANIM.killcamIn : ANIM.killcamOut));

  // Housekeeping (runs in every state so the scene settles after a loss).
  bullets.update(dt, G.dist, G.state === 'play' ? bulletTest : () => false);
  for (const g of [...gates.active]) {
    g.moveTo(time);
    for (const s of g.panels) s.f = Math.max(0, s.f - dt * ANIM.gateFlashDecay);
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

// Breaking a top-3 score: slow motion starts as the score closes in on 3rd,
// 2nd, then 1st place and ends shortly after it passes (once each per run).
// True while running.
function recordSlowMo(realDt) {
  if (G.recordNext < 0 || board.length <= G.recordNext) return false;
  const top = board[G.recordNext].score, score = runStats().score;
  if (G.record < 0) {
    if (top - score > ANIM.recordLead * CFG.SPEED * CFG.SCORE_PER_DIST) return false;
    G.record = 0;
  }
  G.record += realDt;
  if (G.recordPass < 0 && score > top) G.recordPass = G.record;
  if ((G.recordPass >= 0 && G.record - G.recordPass > ANIM.recordHold) || G.record > ANIM.recordMax) {
    G.recordNext--;
    G.record = G.recordPass = -1;
    return false;
  }
  return true;
}

// ---------- HUD ----------

function syncHud(realDt) {
  hud.setDanger(Math.min(1, Math.max((G.danger - 0.4) / (ANIM.slowMoThreshold - 0.4), G.leakFlash * 0.7, 0)));
  hud.setCount(army.N, G.state === 'play' && army.N > 0);   // hidden on the title and game-over screens
  // Live score; a medal badge while it's on pace for the top 3 of the board.
  const score = G.state === 'title' ? 0 : runStats().score;
  const rank = G.state === 'play' ? rankFor(score, board) : -1;
  if (hud.setScore(score, rank <= 2 ? rank : -1)) sfx.play('maxMult');
  // Gain / loss totals stay up while changes keep coming, then fade.
  G.ui += realDt;
  for (const tally of [G.gain, G.loss]) if (tally.n > 0 && G.ui - tally.t > 1.2) tally.n = 0;
  hud.setDeltas(G.gain.n, G.loss.n);
  // Bonus levels: the mini-boss's health bar, and your waiting army.
  const boss = G.state === 'play' ? enemies.boss : null;
  hud.setBoss(boss ? enemies.bossHp(boss) : -1);
  hud.setParked(G.bonus && !G.bonus.failed ? G.bonus.parked : 0);
}

// ---------- Loop ----------

let time = 0;
let last = performance.now();
let perfAcc = 0, perfFrames = 0, perfWindow = 0, fps = 60;

function step(realDt) {
  if (G.paused) return;
  const dt = realDt * G.timeScale;
  time += dt;
  update(dt, realDt);
  world.update(time, G.dist, G.ax, G.shake, G.battle, G.killcam);
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
    cfg: CFG,
    steer(x) { G.tx = x; },
    pause(on = true) { setPaused(on); return G.paused; },
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

// The paused frame has to be redrawn after a resize clears the canvas.
window.addEventListener('resize', () => { world.resize(); if (G.paused) world.render(); });
world.resize();
newRun();
refreshBoard();

// Wait (briefly) for the HUD font so gate labels render in it from the start.
Promise.race([
  document.fonts.load(`64px ${FONT}`),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {}).finally(() => {
  gates.invalidate();
  requestAnimationFrame((t) => { last = t; frame(t); });
});
