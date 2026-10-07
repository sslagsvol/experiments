// Formation library. Each pattern is a list of CAPACITY slots, ordered from
// the center outward, stored in polar form (R, A) so the whole pattern can
// swirl cheaply. D is the spin direction per slot (rings alternate).
//
// Every pattern is normalized so that a full army spans the same width
// (CFG.FORMATION_FILL of the track), which keeps capacity identical across
// patterns: formations are cosmetic, not a stat.

import { CFG } from './config.js';

const CAP = CFG.CAPACITY;
const GOLDEN = 2.39996;
const JITTER = 0.15;

function sunflower() {
  const pts = [];
  for (let i = 0; i < CAP; i++) {
    const r = Math.sqrt(i + 0.5), a = i * GOLDEN;
    pts.push([r * Math.cos(a), r * Math.sin(a), 1]);
  }
  return pts;
}

function rings() {
  const pts = [[0, 0, 1]];
  for (let k = 1; pts.length < CAP; k++) {
    const n = Math.round(2 * Math.PI * k), off = k * 0.37, dir = k % 2 ? 1 : -1;
    for (let j = 0; j < n && pts.length < CAP; j++) {
      const a = off + j / n * Math.PI * 2;
      pts.push([k * Math.cos(a), k * Math.sin(a), dir]);
    }
  }
  return pts;
}

// Lattice patterns: generate a big grid, keep the CAP points with the lowest
// shape metric, so the crowd grows outward in that shape.
function lattice(pointAt, metric) {
  const n = Math.ceil(Math.sqrt(CAP * 4)), pts = [];
  for (let u = -n; u <= n; u++) {
    for (let v = -n; v <= n; v++) {
      const [x, z] = pointAt(u, v);
      pts.push([x, z, 1, metric(x, z, u, v), Math.atan2(z, x)]);
    }
  }
  pts.sort((a, b) => a[3] - b[3] || a[4] - b[4]);
  return pts.slice(0, CAP);
}

const square = (u, v) => [u, v];

const PATTERNS = [
  { name: 'sunflower', spin: 0.18, build: sunflower },
  {
    name: 'hex', spin: 0.06,
    build: () => lattice((u, v) => [u + v / 2, v * 0.866],
      (x, z, u, v) => (Math.abs(u) + Math.abs(v) + Math.abs(u + v)) / 2),
  },
  { name: 'rings', spin: 0.35, build: rings },
  // Triangle pointing forward (render -z is ahead of the army).
  { name: 'wedge', spin: 0, build: () => lattice(square, (x, z) => Math.max(2 * z, Math.abs(x) * 1.7 - z)) },
  { name: 'diamond', spin: 0, build: () => lattice(square, (x, z) => Math.abs(x) + Math.abs(z)) },
  { name: 'phalanx', spin: 0, build: () => lattice(square, (x, z) => Math.max(Math.abs(x), Math.abs(z))) },
];

export const FORMATIONS = PATTERNS.map(({ name, spin, build }) => {
  const pts = build();
  let maxX = 0;
  for (const p of pts) maxX = Math.max(maxX, Math.abs(p[0]));
  const scale = CFG.TW * CFG.FORMATION_FILL / maxX;
  const R = new Float32Array(CAP), A = new Float32Array(CAP);
  const D = new Float32Array(CAP), delay = new Float32Array(CAP);
  let maxR = 0;
  for (let i = 0; i < CAP; i++) {
    const x = (pts[i][0] + (Math.random() - 0.5) * JITTER) * scale;
    const z = (pts[i][1] + (Math.random() - 0.5) * JITTER) * scale;
    R[i] = Math.hypot(x, z);
    A[i] = Math.atan2(z, x);
    D[i] = pts[i][2];
    maxR = Math.max(maxR, R[i]);
  }
  // Morphs ripple outward from the center.
  for (let i = 0; i < CAP; i++) delay[i] = R[i] / maxR * 0.35;
  return { name, spin, R, A, D, delay };
});

// Approximate distance between neighboring units, used to size the dots.
export const UNIT_SPACING = 2 * CFG.TW * CFG.FORMATION_FILL / Math.sqrt(CAP);
