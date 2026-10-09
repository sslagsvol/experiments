// Tunables, palette, and animation timings. Everything that affects feel or
// look lives here so it can be tweaked without touching game code.
//
// STYLE GUIDE: style-guide.html reads COLORS, ANIM, BLOOM and the formation
// settings from this file. If you add or rename a visual value, or change how
// something animates, update style-guide.html in the same change (or flag it
// under "Style guide debt" in CHANGELOG.md).

// The game's version: 0.MINOR.PATCH while in beta. Bump it on the release
// branch (vw/vX.Y.Z) and add a matching heading in CHANGELOG.md. See PLAN.md.
export const VERSION = '0.11.0';

export const CFG = {
  TW: 2.0,                 // track half-width (world units)
  SPEED: 7.0,              // forward speed (units/s)
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
  ENEMY_EDGE_MARGIN: 0.45, // enemies stay this far in from the rails (hard to hit at the edge)
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
  FIRE_BASE: 3,            // shots/s = min(FIRE_MAX, FIRE_BASE + FIRE_K * sqrt(N)) × the level's FIRE_LEVELS
  FIRE_K: 2,
  FIRE_MAX: 50,
  // Fire rate grows with progression: level 1 fires at FIRE_LEVELS[0] of the
  // full rate, and each level gate moves one step up (?classic always 1).
  FIRE_LEVELS: [0.3, 0.45, 0.65, 0.78, 0.90, 1],
  CHALLENGE_SPEED: 1.25,   // Challenge mode: track speed × at the start…
  CHALLENGE_SPEED_STEP: 0.04, // …+ this per gate passed…
  CHALLENGE_SPEED_MAX: 3.0, // …up to this
  CHALLENGE_GATE_SCALE_MAX: 10, // Challenge: gate values stop growing here (no more +7,000 gates)
  CHALLENGE_SQUAD_GROWTH: 0.04, // Challenge: squads × (1 + this × gates past the 15th)
  LEVEL_GUARD_THREAT: 0.8, // story: the squad guarding each level gate, × the best-case army (not Challenge mode)
  OVERFLOW_SQUADS: 3,      // a squad bigger than MAX_PER_SQUAD comes as up to this many waves
  // Past World 1 (story): each level's squads are ENDLESS_GROWTH× bigger than
  // the last, and the track speeds up ENDLESS_SPEED per level (up to
  // ENDLESS_SPEED_MAX). Nobody should be able to go on forever.
  ENDLESS_GROWTH: 1.3,
  ENDLESS_SPEED: 0.05,
  ENDLESS_SPEED_MAX: 1.4,
  // Difficulty: squad sizes (random and authored) and mini-boss hp × this.
  DIFFICULTY: 1.6,
  DIFFICULTY_LEVEL_1: 1.35, // level 1's authored squads: still a skill check, but most people should pass
  // Small armies: below SMALL_ARMY_FROM units the dots (and their spacing)
  // grow, reaching SMALL_ARMY_SCALE× at SMALL_ARMY_FULL units or fewer.
  SMALL_ARMY_FROM: 80,
  SMALL_ARMY_FULL: 20,
  SMALL_ARMY_SCALE: 2.5,
  // Every gate takes this many times its listed hits to step (+ / − per +1,
  // × and ÷ per 0.1).
  GATE_DURABILITY: 1.25,
  // …and it climbs with progress: × (1 + GATE_DURABILITY_STEP per level past
  // the 1st), up to GATE_DURABILITY_MAX. Challenge counts every 8 gates as a level.
  GATE_DURABILITY_STEP: 0.12,
  GATE_DURABILITY_MAX: 2.0,

  DRAG_SPAN: 0.6,          // fraction of screen width that sweeps the full track
  STEER_RESPONSE: 14,      // higher = snappier follow

  GATE_H: 1.25,
  ADD_HITS_PER_STEP: 4,    // bullets to raise a + / − gate by one
  MULT_START: 1.0,         // × gates start doing nothing…
  MULT_STEP: 0.1,          // …and climb in steps of 0.1…
  MULT_MAX: 3,             // …up to ×3
  MULT_HITS_BASE: 4,       // bullets per step at ×1.0, +1 more every ×0.5 (≈110 hits for ×1→×3)
  // Gate mix (must sum to 1). × gates are rare; ÷ gates start at ÷2–÷3 and
  // shooting walks them down toward ÷1.0 (no effect), mirroring ×.
  GATE_MIX: { mult: 0.08, add: 0.32, sub: 0.35, div: 0.25 },
  // Moving gates: an uncommon single gate that slides side to side.
  MOVING_GATE_CHANCE: 0.15,  // chance a gate spot is a moving gate instead of a pair
  MOVING_GATE_WIDTH: 1.5,    // panel width (a pair's panels are 1.9)
  MOVING_GATE_SPEED: 1.1,    // sway speed (rad/s)
  MOVING_GATE_GOOD: 0.65,    // share that are worth chasing (+ or ×); the rest are bad (− or ÷)

  SEED: 1337,

  // Global high scores (Supabase). Leave blank for a per-device board.
  // The key is the project's public anon / publishable key: safe to ship,
  // row-level security only allows reading and adding scores (setup notes in git history: LEADERBOARD.md at d02685f).
  LEADERBOARD: { url: 'https://uxwcslorwepzrmpbqmjd.supabase.co', key: 'sb_publishable_Hhx4UfgA2LvnRncQ8d1Nvw_iI_WJeKc' },

  CAMERA_LIFT: 0.12,       // shifts the view so the army sits higher, leaving thumb room
  // Background (the void grid below the track). Deeper, slower and following
  // the camera all push it further away, so the road reads as raised.
  VOID_DEPTH: 9,           // units below the track (was 4)
  VOID_SCROLL: 0.45,       // its forward scroll speed relative to the track
  VOID_FOLLOW: 0.6,        // how much its pattern follows the camera sideways
  // Grid pattern on the track and background (GRID_PATTERNS). Try others with
  // ?grid=hex, the G key, or the pause menu; later, one per level.
  GRID_PATTERN: 'grid',
  // After the authored levels the track goes back to random, ramping up
  // linearly per gate: gate values ×(1 + RAMP_GATE·k), squad "par" ×(1 + RAMP_PAR·k).
  RAMP_GATE: 0.7,
  RAMP_PAR: 0.4,
  LEVEL_SPACING_SPRINT: 14, // gap between gates in a sprint level
  // New-enemy levels (internally "bonus"): the army condenses ("Army level up")
  // to a small team for a fight against a mini-boss, one giant unit of the
  // next enemy type.
  BOSS_SIZE: 4,            // × its type's size
  BOSS_SPEED: 0.3,         // × ENEMY_CHARGE_SPEED: it advances slowly
  BOSS_HP_SECONDS: 4,      // hp = the strike team's shots per second × this
  BOSS_SWAY: 0.45,         // × its type's side-to-side sway and turning
  BOSS_HP_MUL: { drone: 0.8, bomber: 1.25, brute: 1.15 },
  BOSS_HIT: { radius: 1.5, peak: 0.75, share: 0.5 },   // if it reaches the team: area hit, up to half of it
  BOSS_HOLD: 12,           // the boss hangs back this far ahead of the team while its escort lives
  // Once its escort is gone, each mini-boss moves its own way (a little like
  // its small version) and keeps spewing small units of its type plus grunts,
  // so the fight is a real skill gate. Its average advance stays BOSS_SPEED.
  BOSS_MOVES: {
    drone:  { orbit: 0.8, orbitSpeed: 1.2, dartEvery: 3.2, dartTime: 0.45, dartSpeed: 3.5 },   // wide circles, then a dart at the team
    bomber: { hopEvery: 1.5, air: 0.7, hopHeight: 1.0, shock: { radius: 0.8, peak: 0.45, max: 10 }, shockRange: 2.2 },   // hops; each landing sends a shockwave
    brute:  { stepEvery: 1.2, stepTime: 0.35, sway: 0.55, swaySpeed: 0.8 },   // sways and stomps forward in steps
  },
  // Spew: every `every` s, `own` small units of its type plus `grunts` × the
  // team in grunts, in front. (The drone boss is the first one: gentler.)
  BOSS_SPAWN: { drone: { every: 3.2, own: 4, grunts: 0.15 }, bomber: { every: 3.0, own: 3, grunts: 0.3 }, brute: { every: 3.2, own: 3, grunts: 0.3 } },
  // Reinforcements during a boss fight: a skinny green + gate rushes at the
  // team each time the boss loses another BOSS_GIFT_STEP of its hp, and when a
  // spew wave is shot down. Worth a share of the team as the boss arrived
  // (so gifts don't compound), at least BOSS_GIFT_MIN.
  BOSS_GIFT_STEP: 0.25,
  BOSS_GIFT_SHARE: 0.3,    // for damage dealt…
  BOSS_GIFT_WAVE: 0.12,    // …for a spew wave shot down
  BOSS_GIFT_MIN: 6,
  BOSS_GIFT_WIDTH: 0.7,
  BOSS_GIFT_SPEED: 7,      // units/s toward the team (the track is stopped)
  BOSS_GIFT_AHEAD: 18,     // spawns this far ahead
  // Escort of small boss-type units in front of the boss (it's shielded until
  // they're gone), and clusters of that type riding with each bonus squad:
  // this share of the team's headcount, by type.
  ESCORT_SHARE: { drone: 0.3, bomber: 0.15, brute: 0.1 },
  CLUSTER_SHARE: { drone: 0.25, bomber: 0.08, brute: 0.06 },
  SCREEN_SHARE: 0.2,
  BONUS_SQUAD_SCALE: 0.45, // bonus levels' regular grunt squads × this: the fight is about the new type and the boss       // a wall of grunts in front of each cluster and escort, soaking up shots so the new type gets close
  BONUS_RETURN_CAP: 0.25,  // survivors rejoin your army, at most this share of it (only if the boss died)…
  BONUS_RETURN_MIN: 20,    // …or this many, whichever is more (a good bonus can rescue a small army)
  // Shields (v0.11.0): a line of steel chevrons that rushes to the front of
  // a squad and holds there, soaking shots. They don't attack.
  SHIELD_SPACING: 0.75,    // between shields in a line
  SHIELD_LEAD: 0.9,        // how far in front of their squad they hold
  SHIELD_ROWS: 2,          // staggered rows in front…
  SHIELD_MID_DEPTH: 1.5,   // …plus a row through the middle of squads at least this deep
  SHIELD_RUSH: 5,          // units/s while rushing to the front
  SHIELD_CHANCE: 0.35,     // a regular squad brings a shield line (level guards always do)
  COMBO_CHANCE: 0.25,      // a regular squad is a set piece instead: shields guarding bombers, or grunts screening brutes
  // Bullet enemies (v0.11.0): immune to fire. A warning line marks the lane,
  // then it crosses at player-bullet speed and cuts through a small group.
  BOLT_WARN: 1.1,          // s of warning line before it flies
  BOLT_AHEAD: 24,          // it waits this far ahead of the army
  BOLT_EVERY: [5, 9],      // s between volleys (random in this range)
  BOLT_VOLLEY_MAX: 3,      // up to this many per volley (more at higher levels)
  CHALLENGE_UNLOCK: { shield: 8, bolt: 14 },   // Challenge: gates passed before these join
  LEVEL_QUIET: 52,         // empty track after a level gate, so the banner shows with no enemies on screen
  LEVEL_CHARGE_HITS: 60,   // bullets to fill a level gate's charge bar (it soaks them up; the crossing is the crescendo)
  // Keyboard steering: units/s across the track at full hold (after a short
  // ramp from KEY_STEER_START of that), ×KEY_STEER_FAST with Shift.
  KEY_STEER_SPEED: 5,
  KEY_STEER_START: 0.35,
  KEY_STEER_RAMP: 0.25,
  KEY_STEER_FAST: 1.8,
  SCORE_PER_DIST: 10,      // points per unit of distance
  SCORE_PER_HP: 5,         // points per hit point of each enemy defeated (grunt 5, brute 40)
};

// Sound effects (src/audio.js), synthesized with WebAudio. Volumes 0–1;
// maxRate = most plays per second (big battles would otherwise be a wall of noise).
// tune = detune in semitones (negative = deeper) at the same speed; stretch =
// longer at the same pitch. Both work globally (here) and per sound. Try
// values in sound-lab.html.
// Track / background grid patterns, in shader order (world.js).
export const GRID_PATTERNS = ['grid', 'hex', 'oblique', 'triangles', 'dots', 'rings'];

export const SFX = {
  master: 0.55,
  tune: 0,
  stretch: 1,
  death:   { volume: 0.22, maxRate: 18 },  // a unit fizzling out
  hit:     { volume: 0.12, maxRate: 24 },  // bullet chipping an enemy or a gate
  pop:     { volume: 0.2,  maxRate: 16 },  // enemy destroyed
  gateUp:   { volume: 0.5 },               // passing a good gate
  gateDown: { volume: 0.5 },               // passing a bad gate
  gateTick: { volume: 0.18, maxRate: 10 }, // a gate's value ticking up from shooting
  maxMult: { volume: 0.8 },                // a × gate reaching its ×3.0 cap
  levelCharge: { volume: 0.08, maxRate: 14 }, // a bullet soaked up by a level gate (louder and higher as it nears)
  levelUp: { volume: 1.0 },                // crossing a level gate: the crescendo
  blast:   { volume: 0.55, maxRate: 5 },   // bomber explosion
  stomp:   { volume: 0.65, maxRate: 4 },   // brute stomp
  win:     { volume: 0.55 },               // battle won: the blast plus an echoing crackle
  lose:    { volume: 0.6 },                // army wiped out
  warn:    { volume: 0.35, maxRate: 4 },   // a bullet enemy's warning line appears
  zap:     { volume: 0.4,  maxRate: 8 },   // a bullet enemy flies (and the drone boss darts)
};

// Animation timings. The style guide (style-guide.html) renders these live,
// so change them here rather than inline in the code.
export const ANIM = {
  // Authored levels: the track slows on the approach to a "slow" gate so its
  // value visibly climbs, and a level gate gets the biggest ripple.
  gateSlowSpeed: 0.35,     // track speed while approaching (×)
  gateSlowFrom: 20,        // starts slowing this far before the gate (units)
  gateSlowTo: 4,           // back to full speed this close to it
  rippleLevel: 2.8,
  rippleBattle: 0.7,       // a squad beaten: a small ripple (the big win ripple and sound are kept for level gates and mini-bosses)
  // Killcam: in slow motion, and for a moment at the first bomber blast and
  // first brute stomp of a run, the camera moves in close on the army.
  // Blast scatter: an area attack (bomber, brute, mini-boss) throws nearby
  // units outward, and the formation pulls back together slowly so the gap
  // where units died stays visible.
  blastPush: 0.35,         // max push (world units) at the blast center
  blastReach: 2.5,         // × the attack radius that gets pushed
  blastRecover: 1.6,       // s of slow recovery (no regrouping meanwhile)
  blastRecoverRate: 0.12,  // × the normal follow speed at the start of recovery
  bossGateBreak: 1.0,      // s after a mini-boss appears: the gates between it and you shatter
  spawnFlash: 0.6,         // s new units flash white before settling to cyan
  gruntConverge: 8.5,      // grunts start closing ranks this far out (units), screening what's behind them
  killcamHold: 1.4,        // s (real time) of the first-blast / first-stomp killcam
  killcamScale: 0.45,      // time scale during it
  killcamIn: 0.25,         // s to ease the camera in
  killcamOut: 0.6,         // s to ease it back out
  toastLife: 2.4,          // s a "LEVEL 1" / "LEVEL 1 COMPLETE" banner stays up
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
  rippleBlast: 1.6,        // … bomber blast
  rippleStomp: 2.0,        // … brute stomp
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
  slowMoScale: 0.4,        // time scale at the most dangerous moment
  slowMoThreshold: 0.8,    // danger ratio (incoming strength ÷ army) that triggers it
  slowMoIn: 1.2,           // s to ease into slow motion
  slowMoOut: 0.4,          // s to ease back to normal speed
  // Breaking a top-3 score (3rd, 2nd, then 1st on the board): a short
  // slow-motion moment for each, once per run, as the score closes in and passes it.
  recordLead: 0.8,         // starts when the gap is ≤ this many seconds of full-speed distance points
  recordScale: 0.3,        // time scale during the moment
  recordIn: 0.3,           // s to ease in (faster than danger slow motion)
  recordHold: 0.9,         // s of slow motion after the score passes it
  recordMax: 3.5,          // s cap, in case the score stalls (e.g. mid-battle)
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
  steel: [0.75, 0.85, 1.25],  // shield enemies: a cool steel, bluer-grey than any red enemy, dimmer than your cyan
  bolt: [2.0, 1.1, 1.9],      // bullet enemies and their warning line: a hot white-violet
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
