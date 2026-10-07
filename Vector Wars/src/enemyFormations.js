// Enemy squad formations. Returns offsets [x, z] where z = 0 is the row
// nearest the player and +z is further away. No three.js imports, so the
// style guide can load this directly.

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

export function enemyFormation(kind, n, rng = Math.random) {
  const S = CFG.ENEMY_SPACING, W = CFG.TW * 0.92, pts = [];
  const perRow = Math.floor(2 * W / S) + 1;
  switch (kind) {
    case 'wall':
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / perRow), c = i % perRow;
        pts.push([-W + c * S + (r % 2) * S / 2, r * S * 1.2]);
      }
      break;
    case 'waves': {
      const perWave = Math.ceil(n / CFG.ENEMY_WAVES);
      for (let i = 0; i < n; i++) {
        const wave = Math.floor(i / perWave), k = i % perWave;
        const r = Math.floor(k / perRow), c = k % perRow;
        pts.push([-W + c * S + (r % 2) * S / 2, wave * CFG.ENEMY_WAVE_GAP + r * S * 1.2]);
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
      const depth = Math.min(6, Math.max(2, n * (S * 2.5) ** 2 / (2 * W)));
      for (let i = 0; i < n; i++) pts.push([(rng() * 2 - 1) * W, rng() * depth]);
      break;
    }
    case 'column':
      for (let i = 0; i < n; i++) pts.push([((i % 5) - 2) * S, Math.floor(i / 5) * S]);
      break;
    default: // blob
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(i + 0.5) * S * 0.6, a = i * 2.39996;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
  }
  // Squeeze anything wider than the track, and put the front row at z = 0.
  let maxX = 0, minZ = Infinity;
  for (const p of pts) { maxX = Math.max(maxX, Math.abs(p[0])); minZ = Math.min(minZ, p[1]); }
  const sx = maxX > W ? W / maxX : 1;
  for (const p of pts) { p[0] *= sx; p[1] -= minZ; }
  return { pts, halfW: Math.min(maxX, W) };
}
