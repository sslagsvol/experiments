// DOM HUD. Only a handful of elements, updated with textContent and class
// toggles so layout never thrashes during play. No three.js imports, so the
// style guide can render the real recap with renderRecap().

import { fmt } from './config.js';
import { TYPE_LIST } from './enemyFormations.js';
import { drawEnemy } from './sprites.js';

const commas = (n) => Math.round(n).toLocaleString('en-US');

export class Hud {
  constructor() {
    this.dist = document.getElementById('dist');
    this.best = document.getElementById('best');
    this.armyHud = document.getElementById('army-hud');
    this.count = document.getElementById('count');
    this.delta = document.getElementById('delta');
    this.debugEl = document.getElementById('debug');
    this.title = document.getElementById('title');
    this.over = document.getElementById('over');
    this.recap = document.getElementById('recap');
    this.dangerEl = document.getElementById('danger');
    this.last = { dist: -1, count: -1, danger: -1, live: null };
    this.stopRecap = null;
  }

  setDist(d) {
    if (d === this.last.dist) return;
    this.last.dist = d;
    this.dist.textContent = d;
  }

  setBest(b) { this.best.textContent = 'Best ' + commas(b); }

  setCount(n, visible) {
    this.armyHud.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible || n === this.last.count) return;
    if (n > this.last.count && this.last.count >= 0) restart(this.count, 'pop');
    this.last.count = n;
    this.count.textContent = fmt(n);
  }

  // A one-shot "+371" / "−45" that pops next to the count (gates).
  flashDelta(d) {
    if (!d) return;
    this.last.live = null;
    this.delta.textContent = (d > 0 ? '+' : '−') + fmt(Math.abs(d));
    this.delta.className = d > 0 ? 'gain' : 'loss';
    restart(this.delta, 'flash');
  }

  // A running loss total that stays up while losses keep coming (battles,
  // falls), then fades. Pass 0 to let it fade.
  liveLoss(n) {
    if (n > 0) {
      if (n === this.last.live) return;
      this.last.live = n;
      this.delta.textContent = '−' + fmt(n);
      this.delta.className = 'loss live';
    } else if (this.last.live) {
      this.last.live = null;
      this.delta.className = 'loss fade';
    }
  }

  setDanger(level) {
    const v = Math.round(level * 100) / 100;
    if (v === this.last.danger) return;
    this.last.danger = v;
    this.dangerEl.style.opacity = v;
    this.count.classList.toggle('danger', v > 0.5);
  }

  showTitle(on) { this.title.classList.toggle('hidden', !on); }

  showOver(stats) {
    this.over.classList.toggle('hidden', !stats);
    if (this.stopRecap) { this.stopRecap(); this.stopRecap = null; }
    if (stats) this.stopRecap = renderRecap(this.recap, stats);
  }

  debug(text) {
    this.debugEl.style.display = 'block';
    this.debugEl.textContent = text;
  }
}

function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// End-of-run recap: big score, each enemy type defeated (animated sprite and
// a count that ticks up), then the run's other stats. Returns a stop function
// for the sprite animation. stats: { score, distPts, kills[], killPts[],
// peak, lostEnemy, leaked, lostGate, fell, newBest }
export function renderRecap(el, stats) {
  const rows = TYPE_LIST.map((t, i) => `
    <div class="kill${stats.kills[i] ? '' : ' none'}">
      <canvas data-type="${i}"></canvas>
      <span class="n" data-to="${stats.kills[i]}">×0</span>
      <span class="pts">+${commas(stats.killPts[i])}</span>
    </div>`).join('');
  const lost = [['squads', stats.lostEnemy], ['slipped past', stats.leaked], ['gates', stats.lostGate], ['fell', stats.fell]]
    .filter(([, v]) => v > 0).map(([k, v]) => `${fmt(v)} ${k}`).join(' · ') || 'none';
  el.innerHTML = `
    <div class="score"><span class="label">Score</span><span class="big" data-to="${stats.score}">0</span>
      ${stats.newBest ? '<span class="new-best">New best</span>' : ''}</div>
    <div class="section">Enemies defeated</div>
    <div class="kills">${rows}</div>
    <div class="row"><span>Distance</span><span>+${commas(stats.distPts)}</span></div>
    <div class="row"><span>Peak swarm</span><span>${fmt(stats.peak)}</span></div>
    <div class="row small"><span>Lost</span><span>${lost}</span></div>`;

  // Count-ups (0.9s, ease-out) and idle sprites, until stopped.
  const counters = [...el.querySelectorAll('[data-to]')];
  const canvases = [...el.querySelectorAll('canvas[data-type]')];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of canvases) { c.width = c.height = 48 * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
  const t0 = performance.now();
  let raf = 0;
  const tick = (now) => {
    const t = (now - t0) / 1000, k = 1 - Math.pow(1 - Math.min(1, t / 0.9), 3);
    for (const c of counters) {
      const v = Math.round(+c.dataset.to * k);
      c.textContent = c.classList.contains('n') ? '×' + commas(v) : commas(v);
    }
    for (const c of canvases) {
      const ctx = c.getContext('2d'), type = TYPE_LIST[+c.dataset.type];
      ctx.clearRect(0, 0, 48, 48);
      drawEnemy(ctx, type, 24, 24, 30 * Math.min(1.25, Math.sqrt(type.size)), t + +c.dataset.type, { idle: true });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
