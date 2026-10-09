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
  line:     { spread: 1.0,  label: 'Shield line', note: 'Stiff, staggered rows of shields (up to CFG.SHIELD_PER_ROW a row), held in front of the squad they guard, or through its middle.' },
};

// Unit types. damage = player units taken out on contact. aoe = area damage
// instead: every unit within `radius` dies with a chance that falls from
// `peak` at the center to 0 at the edge, up to `max` units. Bigger areas get
// a lower peak (less damage per unit, more units caught). est = expected
// damage, used to size squads by strength rather than headcount.
export const ENEMY_TYPES = {
  grunt:  { id: 0, shape: 0, size: 1.0, hp: 1, damage: 1.5, est: 1.5, speed: 1.0, homing: 1.0, color: 'enemy',
            label: 'Grunt', note: 'Diamond. Marches in formation, then closes ranks from about 7 units out (ANIM.gruntConverge), screening the stronger units behind it.' },
  drone:  { id: 1, shape: 1, size: 1.1, hp: 1, damage: 1, est: 1, speed: 1.2, homing: 2.5, strafe: 0.9, color: 'enemy',
            label: 'Drone', note: 'Triangle. Strafes side to side; hard to dodge.' },
  bomber: { id: 2, shape: 2, size: 1.4, hp: 2, damage: 0, aoe: { radius: 0.7, peak: 0.95, max: 45 }, est: 35, speed: 1.35, homing: 3.5, converge: true, color: 'enemyHot',
            label: 'Bomber', note: 'Pulsing ring. Homes in on the center and explodes: a tight, deadly blast.' },
  brute:  { id: 3, shape: 3, size: 2.3, hp: 14, damage: 0, aoe: { radius: 1.2, peak: 0.5, max: 60 }, est: 45, speed: 0.7, homing: 0.8, burns: true, color: 'enemyHeavy',
            label: 'Brute', note: 'Big double hexagon, 14 hit points. Close to the army it burns (orange flicker), setting fire to units around it (CFG.BURN). Shot down to half, it loses its outer hexagon and stops burning. Stomps a wide area on contact: half the units near it, fewer at the edge.' },
  // Placed by main.js, never mixed into squads (squadMix):
  shield: { id: 4, shape: 4, size: 2.0, hp: 30, damage: 0, est: 0.4, speed: 1.0, homing: 0.6, hitW: 1.0, color: 'steel',
            label: 'Shield', note: 'Wide steel chevron, 30 hit points, a wide hitbox. Rushes to the front of the squad it guards (in front of its grunt screen too) and holds a stiff line there; near the army it hovers just in front of it instead of charging, still blocking shots (CFG.SHIELD_HOVER), and breaks off a few seconds after its squad is gone. Never attacks.' },
  bolt:   { id: 5, shape: 5, size: 2.0, hp: 3, damage: 0, lane: { radius: 0.3, peak: 0.85, max: 10 }, est: 6, speed: 1.0, homing: 0, immune: true, color: 'bolt',
            label: 'Bullet', note: 'A white-violet streak, immune to fire. A blinking warning line marks its lane for a second, then it crosses the track at bullet speed and cuts through a small group. Dodge it (a dodge scores like a kill).' },
};
export const TYPE_LIST = Object.values(ENEMY_TYPES);

// Which unit types make up a squad. Tougher types unlock as the run goes on
// (squadIndex = how many squads have spawned so far).
// When each special type joins squads: the squad index on the classic track,
// or the level number (each one unleashed by the bonus-level mini-boss before it).
export const UNLOCK_AT = { drone: 3, shield: 3, bomber: 5, brute: 7, bolt: 9 };

export function squadMix(kind, squadIndex) {
  const drones = squadIndex >= UNLOCK_AT.drone, bombers = squadIndex >= UNLOCK_AT.bomber, brutes = squadIndex >= UNLOCK_AT.brute;
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
    case 'line': {
      const L = CFG.SHIELD_SPACING, per = Math.min(n, CFG.SHIELD_PER_ROW);
      // Rows staggered by half a gap, so the second row covers the first's holes.
      for (let i = 0; i < n; i++) { const r = Math.floor(i / per); pts.push([((i % per) - (per - 1) / 2 + (r % 2) * 0.5) * L, r * L * 0.8]); }
      break;
    }
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
