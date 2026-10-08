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

// Level 1: the first four lessons, fast. Shooting kills enemies; shooting
// raises gates; red gates hurt (and the small one can be shot green);
// battles; then where you stand is what you pump, choices, and a first ×.
// Draft numbers, tuned by bot runs (see LEVELS.md section 3).
export const LEVEL_1 = {
  start: 20,
  beats: [
    { gap: 0,  squad: { kind: 'blob', n: 5, x: 0 } },                 // a couple of opponents
    { gap: 22, single: add(1), width: CFG.TW, slow: true },           // +1, half the road, dead center
    { gap: 24, squad: { kind: 'blob', n: 8, x: 0 } },                 // easy wave
    { gap: 24, pair: [add(-10), add(-1)], mirror: true },             // −10 / −1: take (or fix) the small one
    { gap: 22, squad: { kind: 'wall', threat: 0.7, x: 0 } },
    { gap: 24, pair: [add(5), add(12)], mirror: true },               // where you stand is what you pump
    { gap: 22, squad: { kind: 'skirmish', threat: 1.0, x: 0 } },
    { gap: 24, pair: [add(8), add(-6)], mirror: true },               // a real choice
    { gap: 22, squad: { kind: 'wedge', threat: 1.2, x: 0 } },
    { gap: 24, pair: [mult(), add(10)], mirror: true },               // first × gate
    { gap: 22, squad: { kind: 'blob', threat: 1.3, x: 0 } },
    { gap: 24, pair: [add(15), add(-20)], mirror: true },
    { gap: 22, squad: { kind: 'waves', threat: 1.4, x: 0 } },        // not a breeze
    { gap: 26, levelGate: 2 },
  ],
};
