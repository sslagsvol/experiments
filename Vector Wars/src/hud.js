// DOM HUD. Only a handful of elements, updated with textContent/transform so
// layout never thrashes during play.

import { fmt } from './config.js';

export class Hud {
  constructor() {
    this.dist = document.getElementById('dist');
    this.best = document.getElementById('best');
    this.count = document.getElementById('count');
    this.debugEl = document.getElementById('debug');
    this.title = document.getElementById('title');
    this.over = document.getElementById('over');
    this.recap = document.getElementById('recap');
    this.dangerEl = document.getElementById('danger');
    this.last = { dist: -1, count: -1, danger: -1 };
  }

  setDist(d) {
    if (d === this.last.dist) return;
    this.last.dist = d;
    this.dist.textContent = d;
  }

  setBest(b) { this.best.textContent = 'Best ' + b; }

  setCount(n, x, y, visible) {
    this.count.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    if (n !== this.last.count) {
      if (n > this.last.count && this.last.count >= 0) {
        this.count.classList.remove('pop');
        void this.count.offsetWidth;
        this.count.classList.add('pop');
      }
      this.last.count = n;
      this.count.textContent = fmt(n);
    }
    this.count.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
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
    if (!stats) return;
    const rows = [
      ['Distance', stats.score],
      ['Peak swarm', fmt(stats.peak)],
      ['Lost to squads', fmt(stats.lostEnemy)],
      ['Slipped past', fmt(stats.leaked)],
      ['Lost to gates', fmt(stats.lostGate)],
      ['Fell off', fmt(stats.fell)],
      ['Gate hits', fmt(stats.gateHits)],
    ];
    this.recap.innerHTML = rows
      .map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`)
      .join('') + (stats.newBest ? '<div class="new-best">New best</div>' : '');
  }

  debug(text) {
    this.debugEl.style.display = 'block';
    this.debugEl.textContent = text;
  }
}
