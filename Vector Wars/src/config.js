// Tunables, palette, and animation timings. Everything that affects feel or
// look lives here so it can be tweaked without touching game code.
//
// STYLE GUIDE: style-guide.html reads COLORS, ANIM, BLOOM and the formation
// settings from this file. If you add or rename a visual value, or change how
// something animates, update style-guide.html in the same change (or flag it
// under "Style guide debt" in EDITS.md).

export const CFG = {
  TW: 2.0,                 // track half-width (world units)
  SPEED: 6.5,              // forward speed (units/s)
  FIRST: 22,               // distance to the first track element
  SEG_GATE: 18,            // gap after a gate before the next element
  SEG_ENEMY: 28,           // gap after a squad (room to breathe after a battle)
  VIEW_AHEAD: 70,          // how far ahead elements are spawned

  START_UNITS: 30,
  CAPACITY: 5000,          // hard cap; a 5,000 army spans the whole track, the rest fall off
  FORMATION_REF: 1200,     // up to this size the crowd keeps full spacing…
  FORMATION_FILL: 0.8,     // …and spans this fraction of the track width; above it, units pack tighter
  FORMATION_DEPTH: 0.85,   // z squash of formation patterns
  EDGE_MARGIN: 0.2,        // how close the army's center may get to a rail
  MAX_PER_SQUAD: 1500,
  MAX_ENEMIES: 4000,
  ENEMY_SPACING: 0.27,
  ENEMY_MAX_DEPTH: 9,      // squads deeper than this compress (big squads become dense mobs)
  ENEMY_LEAK_MARGIN: 0.8,  // enemies this far behind the army have slipped past and hit the rear
  ENEMY_TRIGGER: 18,       // squads start charging when this close to the army's front
  ENEMY_SPAWN_AHEAD: 38,   // squads are sized and placed when this far ahead (out of the fog)
  ENEMY_THREAT_MIN: 0.35,  // squad strength vs the projected army, min…
  ENEMY_THREAT_MAX: 0.85,  // …and max (above 1.0 is unwinnable: enemies home in)
  ENEMY_CHARGE_SPEED: 2.2, // units/s toward the army
  ENEMY_CATCHUP: 0.25,     // extra speed per unit of distance for stragglers more than 6 behind
  ENEMY_HOMING: 1.5,       // sideways steering toward the army (units/s)
  ENEMY_WAVES: 3,
  ENEMY_WAVE_GAP: 4.5,     // distance between waves

  BULLET_SPEED: 26,
  BULLET_RANGE: 34,
  MAX_BULLETS: 600,
  FIRE_BASE: 3,            // shots/s = min(FIRE_MAX, FIRE_BASE + FIRE_K * sqrt(N))
  FIRE_K: 2,
  FIRE_MAX: 50,

  DRAG_SPAN: 0.6,          // fraction of screen width that sweeps the full track
  STEER_RESPONSE: 14,      // higher = snappier follow

  GATE_H: 1.25,
  ADD_HITS_PER_STEP: 4,    // bullets to raise a + / − gate by one
  MULT_START: 1.0,         // × gates start doing nothing…
  MULT_STEP: 0.1,          // …and climb in steps of 0.1…
  MULT_MAX: 3,             // …up to ×3
  MULT_HITS_BASE: 2,       // bullets per step at ×1.0, +1 more every ×0.5 (≈70 hits for ×1→×3)
  // Gate mix (must sum to 1). × gates are rare; ÷ gates start at ÷2–÷3 and
  // shooting walks them down toward ÷1.0 (no effect), mirroring ×.
  GATE_MIX: { mult: 0.08, add: 0.32, sub: 0.35, div: 0.25 },

  SEED: 1337,

  CAMERA_LIFT: 0.12,       // shifts the view so the army sits higher, leaving thumb room
  SCORE_PER_DIST: 10,      // points per unit of distance
  SCORE_PER_HP: 5,         // points per hit point of each enemy defeated (grunt 5, brute 40)
};

// Sound effects (src/audio.js), synthesized with WebAudio. Volumes 0–1;
// maxRate = most plays per second (big battles would otherwise be a wall of noise).
export const SFX = {
  master: 0.55,
  death:   { volume: 0.22, maxRate: 18 },  // a unit fizzling out
  hit:     { volume: 0.12, maxRate: 24 },  // bullet chipping an enemy or a gate
  pop:     { volume: 0.2,  maxRate: 16 },  // enemy destroyed
  gateUp:   { volume: 0.5 },               // passing a good gate
  gateDown: { volume: 0.5 },               // passing a bad gate
  gateTick: { volume: 0.18, maxRate: 10 }, // a gate's value ticking up from shooting
  blast:   { volume: 0.5,  maxRate: 4 },   // bomber explosion
  win:     { volume: 0.55 },               // battle won: the blast plus an echoing crackle
  lose:    { volume: 0.6 },                // army wiped out
};

// Animation timings. The style guide (style-guide.html) renders these live,
// so change them here rather than inline in the code.
export const ANIM = {
  bobFreq: 11,             // unit march bob speed (rad/s)
  bobHeight: 0.04,         // unit march bob height (world units)
  morphRipple: 0.35,       // s for a formation morph to ripple from center to rim
  swirlBurst: 5,           // extra swirl speed right after a morph (×)
  swirlBurstDecay: 1.5,    // how fast the swirl burst fades (1/s)
  shakeNegGate: 0.12,      // formation shake amplitude on a bad gate
  shakeDecay: 0.4,         // shake fade (amplitude/s)
  gateFlashDecay: 4,       // gate hit flash fade (1/s)
  gateShatter: 0.35,       // s for the primary gate to burst apart after the army passes
  rippleSpeed: 9,          // grid ripple ring speed (units/s)
  rippleDecay: 1.2,        // grid ripple fade (1/s)
  rippleLife: 3.5,         // s before a ripple slot is reused
  rippleDepth: 1.0,        // how far the grid dips under a ripple (× its strength)
  rippleWidth: 1.0,        // ring thickness (units)
  rippleGate: 1.6,         // ripple strength when passing a gate
  rippleWipe: 1.5,         // … wiping out a squad
  rippleWin: 2.2,          // … winning a battle (track starts moving again)
  rippleHit: 0.5,          // … enemy contact (rate-limited)
  rippleBlast: 1.2,        // … bomber blast
  rippleDeath: 2.4,        // … losing the whole army
  fallGravity: 14,         // units falling off the track (units/s²)
  fallRunMin: 1.5,         // sideways run speed of spilled units (units/s)
  fallRunMax: 3.5,
  fizzleTime: 0.7,          // s for a lost unit to burn out (cyan → red → black)
  fizzleRedAt: 0.3,        // fraction of the fizzle spent turning red before fading to black
  sparkGravity: 9,
  sparkLifeMin: 0.35,      // s
  sparkLifeMax: 0.8,
  battleBrake: 4,          // how fast the track eases to a stop in a battle (1/s)
  approachSpeed: 0.5,      // track speed while a charging squad is still closing in (×)
  surgeBoost: 0.6,         // extra speed right after winning a battle (×)
  surgeDecay: 1.2,         // surge fade (1/s)
  battleCamPush: 0.8,      // camera dolly toward the army during battles (units)
  slowMoScale: 0.3,        // time scale at the most dangerous moment
  slowMoThreshold: 0.8,    // danger ratio (incoming strength ÷ army) that triggers it
  slowMoIn: 1.2,           // s to ease into slow motion
  slowMoOut: 0.4,          // s to ease back to normal speed
};

// Bloom post-process (UnrealBloomPass). Threshold keeps gate text readable.
export const BLOOM = { strength: 0.85, radius: 0.35, threshold: 0.55 };

// Linear HDR colors (values > 1 feed the bloom pass). Shown in style-guide.html.
export const COLORS = {
  bg: 0x04051a,
  you: [0.25, 0.75, 1.3],
  enemy: [1.6, 0.22, 0.75],
  enemyHot: [1.9, 0.5, 0.15],
  enemyHeavy: [1.2, 0.12, 1.4],
  add: [0.3, 1.6, 0.8],
  sub: [1.6, 0.22, 0.42],
  mult: [1.7, 1.25, 0.22],
  grid: [0.1, 0.13, 0.7],
  rail: [0.35, 0.95, 1.5],
  horizon: [1.0, 0.15, 0.7],
  bullet: [2.0, 1.45, 0.45],
  dying: [1.8, 0.1, 0.06],   // lost units burn from cyan to this, then to black
  div: [1.5, 0.12, 0.3],     // ÷ gates (a deeper red than − gates)
  white: [1.6, 1.6, 1.6],
};

// Bullets needed for a × gate's next 0.1 step at multiplier m.
export function multHitsForStep(m) {
  return CFG.MULT_HITS_BASE + Math.floor((m - 1) / 0.5 + 1e-6);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmt(n) {
  if (n >= 100000) return Math.round(n / 1000) + 'k';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
