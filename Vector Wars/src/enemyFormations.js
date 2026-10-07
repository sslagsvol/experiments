// Enemy squad formations and unit types. Formations return offsets [x, z]
// where z = 0 is the row nearest the player and +z is further away. No
// three.js imports, so the style guide can load this directly.

import { CFG } from './config.js';

// How strongly each kind keeps its shape while charging (1 = holds its
// line, lower = converges on the army's center).
export const ENEMY_KINDS = {
  blob:     { spread: 0.7,  label: 'Blob',     note: 'Dense cluster. Dodgeable.' },
  wall:     { spread: 1.0,  label: 'Wall',     note: 'Spans the track. Shoot it or pay.' },
  wedge:    { spread: 0.85, label: 'Wedge',    note: 'Arrow tip first, then widens.' },
  skirmish: { spread: 0.5,  label: 'Skirmish', note: 'Loose and scattered; hits flanks.' },
  column:   { spread: 0.6,  label: 'Column',   note: 'Narrow and deep.' },
  waves:    { spread: 1.0,  label: 'Waves',    note: 'Three thin walls, one after another.' },
};

// Unit types. damage = player units taken out on contact. aoe = area damage
// instead: every unit within `radius` dies with a chance that falls from
// `peak` at the center to 0 at the edge, up to `max` units. Bigger areas get
// a lower peak (less damage per unit, more units caught). est = expected
// damage, used to size squads by strength rather than headcount.
export const ENEMY_TYPES = {
  grunt:  { id: 0, shape: 0, size: 1.0, hp: 1, damage: 1.5, est: 1.5, speed: 1.0, homing: 1.0, color: 'enemy',
            label: 'Grunt', note: 'Diamond. Marches in formation.' },
  drone:  { id: 1, shape: 1, size: 1.1, hp: 1, damage: 1, est: 1, speed: 1.2, homing: 2.5, strafe: 0.9, color: 'enemy',
            label: 'Drone', note: 'Triangle. Strafes side to side; hard to dodge.' },
  bomber: { id: 2, shape: 2, size: 1.4, hp: 2, damage: 0, aoe: { radius: 0.7, peak: 0.95, max: 45 }, est: 35, speed: 1.35, homing: 3.5, converge: true, color: 'enemyHot',
            label: 'Bomber', note: 'Pulsing ring. Homes in on the center and explodes: a tight, deadly blast.' },
  brute:  { id: 3, shape: 3, size: 2.3, hp: 8, damage: 0, aoe: { radius: 1.2, peak: 0.5, max: 60 }, est: 38, speed: 0.7, homing: 0.8, color: 'enemyHeavy',
            label: 'Brute', note: 'Big hexagon, 8 hit points. Stomps a wide area on contact: half the units near it, fewer at the edge.' },
};
export const TYPE_LIST = Object.values(ENEMY_TYPES);

// Which unit types make up a squad. Tougher types unlock as the run goes on
// (squadIndex = how many squads have spawned so far).
export function squadMix(kind, squadIndex) {
  const drones = squadIndex >= 2, bombers = squadIndex >= 3, brutes = squadIndex >= 4;
  switch (kind) {
    // Grunts are 80–90% of every squad; specials are the seasoning.
    case 'skirmish': return { back: [], mix: drones ? [['grunt', 0.82], ['drone', 0.18]] : [['grunt', 1]] };
    case 'column':   return { back: [], mix: bombers ? [['grunt', 0.85], ['bomber', 0.15]] : [['grunt', 1]] };
    case 'wall':     return { back: brutes ? ['brute', 0.1] : [], mix: [['grunt', 1]] };
    case 'wedge':    return { back: brutes ? ['brute', 0.08] : [], mix: [['grunt', 1]] };
    case 'waves':    return { back: [], mix: drones ? [['grunt', 0.85], ['drone', 0.15]] : [['grunt', 1]] };
    default:         return { back: [], mix: bombers ? [['grunt', 0.88], ['bomber', 0.12]] : [['grunt', 1]] };
  }
}

// Average expected damage per unit for a squad mix, for sizing.
export function mixEst({ back, mix }) {
  let e = 0;
  for (const [t, w] of mix) e += ENEMY_TYPES[t].est * w;
  if (back.length) e = e * (1 - back[1]) + ENEMY_TYPES[back[0]].est * back[1];
  return e;
}

// Type for unit i of n. Formation order runs front row first, so `back`
// types (brutes) take every 3rd slot counting from the rear: they stand
// behind the grunts, spread out, and the grunts take the first hits.
export function unitType({ back, mix }, i, n, rng) {
  if (back.length) {
    const m = Math.max(1, Math.round(n * back[1])), fromRear = n - 1 - i;
    if (fromRear % 3 === 0 && fromRear < m * 3) return back[0];
  }
  let r = rng();
  for (const [t, w] of mix) if ((r -= w) < 0) return t;
  return mix[0][0];
}

export function enemyFormation(kind, n, rng = Math.random) {
  const S = CFG.ENEMY_SPACING, W = CFG.TW - CFG.ENEMY_EDGE_MARGIN, pts = [];
  const perRow = Math.floor(2 * W / S) + 1;
  switch (kind) {
    case 'wall':
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / perRow), c = i % perRow;
        pts.push([-W + c * S + (r % 2) * S / 2, r * S * 1.3]);
      }
      break;
    case 'waves': {
      const perWave = Math.ceil(n / CFG.ENEMY_WAVES);
      for (let i = 0; i < n; i++) {
        const wave = Math.floor(i / perWave), k = i % perWave;
        const r = Math.floor(k / perRow), c = k % perRow;
        pts.push([-W + c * S + (r % 2) * S / 2, wave * CFG.ENEMY_WAVE_GAP + r * S * 1.3]);
      }
      break;
    }
    case 'wedge':
      for (let r = 0, i = 0; i < n; r++) {
        for (let j = 0; j <= 2 * r && i < n; j++, i++) pts.push([(j - r) * S, r * S * 1.1]);
      }
      break;
    case 'skirmish': {
      // Loose spacing: about 2.5× the normal gap between units.
      const depth = Math.min(CFG.ENEMY_MAX_DEPTH, Math.max(3, n * (S * 1.8) ** 2 / (2 * W)));
      for (let i = 0; i < n; i++) pts.push([(rng() * 2 - 1) * W, rng() * depth]);
      break;
    }
    case 'column':
      for (let i = 0; i < n; i++) pts.push([((i % 5) - 2) * S, Math.floor(i / 5) * S]);
      break;
    default: // blob
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(i + 0.5) * S * 0.62, a = i * 2.39996;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
  }
  // Squeeze anything wider than the track or deeper than ENEMY_MAX_DEPTH
  // (waves get room for their gaps), and put the front row at z = 0.
  let maxX = 0, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) { maxX = Math.max(maxX, Math.abs(p[0])); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
  const maxDepth = CFG.ENEMY_MAX_DEPTH + (kind === 'waves' ? (CFG.ENEMY_WAVES - 1) * CFG.ENEMY_WAVE_GAP : 0);
  const sx = maxX > W ? W / maxX : 1, sz = maxZ - minZ > maxDepth ? maxDepth / (maxZ - minZ) : 1;
  for (const p of pts) { p[0] *= sx; p[1] = (p[1] - minZ) * sz; }
  return { pts, halfW: Math.min(maxX, W) };
}
