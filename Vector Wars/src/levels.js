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
// Draft numbers, tuned by bot runs (see LEVELS.md section 3).
export const LEVEL_1 = {
  start: 20,
  beats: [
    { gap: 0,  squad: { kind: 'blob', n: 5, x: 0 } },                 // a couple of opponents
    { gap: 22, single: add(1), width: CFG.TW, slow: true },           // +1, half the road, dead center
    { gap: 24, squad: { kind: 'blob', n: 8, x: 0 } },                 // easy wave
    { gap: 24, pair: [add(-10), add(-1)], mirror: true },             // −10 / −1: take (or fix) the small one
    { gap: 22, squad: { kind: 'wall', threat: 0.3, x: 0 } },
    { gap: 24, pair: [add(5), add(12)], mirror: true },               // where you stand is what you pump
    { gap: 22, squad: { kind: 'skirmish', threat: 0.4, x: 0 } },
    { gap: 24, pair: [add(8), div(2)], mirror: true },                // first ÷ gate: shoot it down and it flips to ×
    { gap: 22, squad: { kind: 'wedge', threat: 0.5, x: 0 } },
    { gap: 24, pair: [mult(), add(10)], mirror: true },               // first × gate
    { gap: 22, squad: { kind: 'blob', threat: 0.55, x: 0 } },
    { gap: 24, pair: [add(15), add(-20)], mirror: true },
    { gap: 22, squad: { kind: 'waves', threat: 0.6, x: 0 } },        // not a breeze
    { gap: 26, levelGate: 2 },
  ],
};

// Levels 2+: generated from a short description (see LEVELS.md section 7).
//   kind: 'normal'   gates and squads (pattern below), `pieces` long
//         'gauntlet' back-to-back squads, few gates
//         'sprint'   gates only, the track runs at `speed`
//         'bonus'    a small strike team (`team` units; your army waits),
//                    a few squads, then a giant `boss` (the next enemy type to
//                    be unleashed), a bonus × gate, and back to your army
//   div / moving / split: gate types allowed (÷ gates, moving gates, pairs
//   where both sides are good). Enemy types join by level (UNLOCK_AT).
// After the last entry, levels repeat ENDLESS.
// A mini-boss every other level, so the big enemies arrive early and the
// battles are massive by levels 5–7.
export const LEVELS = {
  2: { kind: 'bonus', team: 30, boss: 'drone', squads: 3 },
  3: { kind: 'normal', pieces: 8, div: true, moving: true },
  4: { kind: 'bonus', team: 35, boss: 'bomber', squads: 3 },
  5: { kind: 'normal', pieces: 10, div: true, moving: true, split: true },
  6: { kind: 'bonus', team: 40, boss: 'brute', squads: 3 },
  7: { kind: 'gauntlet', pieces: 7, div: true, moving: true, split: true },
  8: { kind: 'sprint', pieces: 8, speed: 1.5, div: true, moving: true },
  9: { kind: 'normal', pieces: 12, div: true, moving: true, split: true },
};
export const WORLD_END = 10;   // reaching this level: "World 1 complete", then endless
export const ENDLESS = { kind: 'normal', pieces: 8, div: true, moving: true, split: true };
export const levelDef = (n) => LEVELS[n] || ENDLESS;

// Piece patterns: g = gate, e = enemy squad.
export const PATTERNS = { normal: 'gegeggee', gauntlet: 'eeegee', sprint: 'g' };
