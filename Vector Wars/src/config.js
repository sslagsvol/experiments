// Tunables and palette. Everything that affects feel lives here so it can be
// tweaked without touching game code.

export const CFG = {
  TW: 2.0,                 // track half-width (world units)
  SPEED: 6.5,              // forward speed (units/s)
  CONTACT_SLOW: 0.3,       // speed multiplier while fighting a squad
  FIRST: 16,               // distance to the first track element
  SEG: 12,                 // spacing between track elements
  VIEW_AHEAD: 70,          // how far ahead elements are spawned

  START_UNITS: 30,
  UNIT_CAP: 999999,
  MAX_UNITS_VISIBLE: 4000, // above this, each dot stands in for several units
  UNIT_SPACING: 0.075,
  MAX_PER_SQUAD: 900,
  MAX_ENEMY_VISIBLE: 3000,
  ENEMY_SPACING: 0.09,

  BULLET_SPEED: 26,
  BULLET_RANGE: 34,
  MAX_BULLETS: 600,
  FIRE_BASE: 3,            // shots/s = min(FIRE_MAX, FIRE_BASE + FIRE_K * sqrt(N))
  FIRE_K: 2,
  FIRE_MAX: 50,

  DRAG_SPAN: 0.6,          // fraction of screen width that sweeps the full track
  STEER_RESPONSE: 14,      // higher = snappier follow

  GATE_H: 1.25,
  MULT_CHARGE_PER_HIT: 0.05,

  SEED: 1337,
};

// Linear HDR colors (values > 1 feed the bloom pass).
export const COLORS = {
  bg: 0x04051a,
  you: [0.25, 0.75, 1.3],
  enemy: [1.6, 0.22, 0.75],
  add: [0.3, 1.6, 0.8],
  sub: [1.6, 0.22, 0.42],
  mult: [1.7, 1.25, 0.22],
  grid: [0.1, 0.13, 0.7],
  rail: [0.35, 0.95, 1.5],
  horizon: [1.0, 0.15, 0.7],
  bullet: [2.0, 1.45, 0.45],
  white: [1.6, 1.6, 1.6],
};

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
