// Authored levels (see LEVELS.md). A level is a list of beats, each placed
// `gap` units after the previous one:
//   { squad: { kind, n, x } }        enemy squad of exactly n (grunts only in level 1)
//   { squad: { kind, threat, x } }   sized as threat × the army you'd have from
//                                    the best side of every gate before it (like
//                                    the random track), so pumping gates pays off
//                                    and wrong choices make the next fight harder
//   { pair: [L, R] }                 a gate pair (L / R gate specs)
//   { single: S, width, slow }       one fixed panel at the center; slow = the
//                                    track slows on the approach so the value
//                                    visibly climbs as you shoot it
//   { levelGate: n }                 full-width "LEVEL n" finish line
// Gate specs use the same shape as random gates: { op: '+', v } or { op: 'x', m }.
// After the last beat the track goes back to random, ramping up linearly
// (CFG.RAMP_*). No three.js imports.

import { CFG } from './config.js';

const add = (v) => ({ op: '+', v, ch: 0, f: 0 });
const mult = () => ({ op: 'x', m: CFG.MULT_START, ch: 0, f: 0 });
const div = (d) => ({ op: '/', d, ch: 0, f: 0 });

// Level 1: the first lessons, fast. Shooting kills enemies; shooting raises
// gates; red gates hurt (and the small one can be shot green); battles; where
// you stand is what you pump; a first ÷ (shoot it down) and a first ×.
// Round 42 halved its length: a gate sits just behind each squad (5), but a
// squad stays 14 past the gate before it, so the gate is passed before the
// squad charges (gates soak up bullets).
// Draft numbers, tuned by bot runs (see LEVELS.md section 3).
export const LEVEL_1 = {
  start: 20,
  beats: [
    { gap: 0,  squad: { kind: 'blob', n: 5, x: 0 } },                 // a couple of opponents
    { gap: 5, single: add(1), width: CFG.TW },                       // +1, half the road, dead center
    { gap: 14, squad: { kind: 'blob', n: 8, x: 0 } },                 // easy wave
    { gap: 5, pair: [add(-10), add(-1)], mirror: true },             // −10 / −1: take (or fix) the small one
    { gap: 14, squad: { kind: 'wall', threat: 0.35, x: 0 } },
    { gap: 5, pair: [add(5), add(12)], mirror: true },               // where you stand is what you pump
    { gap: 14, squad: { kind: 'skirmish', threat: 0.45, x: 0 } },
    { gap: 5, pair: [add(8), div(2)], mirror: true },                // first ÷ gate: shoot it down and it flips to ×
    { gap: 14, squad: { kind: 'wedge', threat: 0.55, x: 0 } },
    { gap: 5, pair: [mult(), add(10)], mirror: true },               // first × gate
    { gap: 14, squad: { kind: 'waves', threat: 0.8, x: 0 } },         // end-of-level challenge: a real skill check
    { gap: 6, levelGate: 2 },
  ],
};

// Levels 2+: generated from a short description (see LEVELS.md section 7).
//   kind: 'normal'   gates and squads (pattern below), `pieces` long
//         'gauntlet' back-to-back squads, few gates (also ends with a challenge)
//         'sprint'   gates only, the track runs at `speed`
//         'bonus'    a small strike team (`team` units; your army waits),
//                    a few squads, then a giant `boss` (the next enemy type to
//                    be unleashed), a bonus × gate, and back to your army
//   finale: (sprint) back-to-back waves after the gates, each { kind, mix,
//         threat, shields? } sized as threat × the army you'd have from the
//         best side of every gate in the level: get the gates wrong and you
//         won't make it through. The track drops to normal speed for them.
//   div / moving / split: gate types allowed (÷ gates, moving gates, pairs
//   where both sides are good). Enemy types join by level (UNLOCK_AT).
// After the last entry, levels repeat ENDLESS.
// A mini-boss every other level, so the big enemies arrive early and the
// battles are massive by levels 5–7.
// Level 5: sprint into gauntlet. A huge grunt wall, then specialists.
const RUSH_FINALE = [
  { kind: 'wall', mix: [['grunt', 1]], threat: 0.56 },                         // a huge wall of grunts
  { kind: 'skirmish', mix: [['grunt', 0.6], ['drone', 0.4]], threat: 0.4 },    // drone skirmishers
  { kind: 'blob', mix: [['bomber', 1]], threat: 0.34, shields: true },          // bombers behind shields
  { kind: 'waves', mix: [['grunt', 0.8], ['drone', 0.2]], threat: 0.52 },      // the last stand
];

export const LEVELS = {
  2: { kind: 'bonus', team: 30, boss: 'drone', squads: 2 },
  3: { kind: 'normal', pieces: 6, div: true, moving: true },
  4: { kind: 'bonus', team: 35, boss: 'bomber', squads: 2 },
  5: { kind: 'sprint', pieces: 8, speed: 1.5, div: true, moving: true, split: true, finale: RUSH_FINALE },
  6: { kind: 'bonus', team: 40, boss: 'brute', squads: 2 },
  7: { kind: 'gauntlet', pieces: 6, div: true, moving: true, split: true },
  8: { kind: 'sprint', pieces: 8, speed: 1.5, div: true, moving: true },
  9: { kind: 'normal', pieces: 8, div: true, moving: true, split: true },
};
export const WORLD_END = 10;   // reaching this level: "World 1 complete", then endless
// Past World 1 the levels keep coming, and get much harder each time
// (CFG.ENDLESS_*): every third one is a gauntlet.
export const ENDLESS = { kind: 'normal', pieces: 6, div: true, moving: true, split: true };
export const ENDLESS_GAUNTLET = { kind: 'gauntlet', pieces: 6, div: true, moving: true, split: true };
export const levelDef = (n) => LEVELS[n] || (n >= 10 && (n - 10) % 3 === 2 ? ENDLESS_GAUNTLET : ENDLESS);

// Piece patterns: g = gate, e = enemy squad.
export const PATTERNS = { normal: 'gegeggee', gauntlet: 'eeegee', sprint: 'g' };
