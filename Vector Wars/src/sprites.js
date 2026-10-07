// 2D canvas versions of the game's sprites, for the HUD (end-of-run score)
// and the style guide. They mirror the WebGL shapes in enemies.js / crowd.js.
// No three.js imports.

import { COLORS } from './config.js';

// Linear HDR color → CSS rgba (clamped, sRGB-encoded).
const toSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
export const cssColor = (c, a = 1) => `rgba(${c.map((v) => Math.round(toSrgb(v) * 255)).join(',')},${a})`;

// Draws one enemy of type t (an ENEMY_TYPES entry) centered at (x, y).
// idle = true adds the type's idle motion: grunts bob, drones sway, bombers
// pulse, brutes slowly turn.
export function drawEnemy(ctx, t, x, y, size, time, { flash = 0, idle = false } = {}) {
  const c = COLORS[t.color].map((v) => v * 0.55 * (1 + flash * 2.5) * (idle ? 1.6 : 1)), r = size / 2;
  ctx.save();
  if (idle) {
    if (t.shape === 0) y += Math.sin(time * 4) * size * 0.06;
    if (t.shape === 1) x += Math.sin(time * 2.5) * size * 0.15;
  }
  ctx.translate(x, y);
  if (idle && t.shape === 3) ctx.rotate(time * 0.6);
  ctx.strokeStyle = cssColor(c);
  ctx.lineWidth = Math.max(1.2, size * 0.09);
  ctx.shadowColor = cssColor(c);
  ctx.shadowBlur = size * 0.4;
  ctx.beginPath();
  if (t.shape === 0) {
    ctx.moveTo(0, -r * 0.7); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(-r * 0.7, 0); ctx.closePath();
  } else if (t.shape === 1) {
    ctx.moveTo(-r * 0.6, -r * 0.4); ctx.lineTo(r * 0.6, -r * 0.4); ctx.lineTo(0, r * 0.6); ctx.closePath();
  } else if (t.shape === 2) {
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  } else {
    for (const k of [0.78, 0.45]) {
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3 + Math.PI / 6;
        ctx[j ? 'lineTo' : 'moveTo'](Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
      ctx.closePath();
    }
  }
  ctx.stroke();
  if (t.shape === 2) {
    // Bomber core pulses.
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
    g.addColorStop(0, cssColor(c, 0.4 + pulse * 0.6));
    g.addColorStop(1, cssColor(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
