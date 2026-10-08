// DOM HUD. Only a handful of elements, updated with textContent and class
// toggles so layout never thrashes during play. No three.js imports, so the
// style guide can render the real recap with renderRecap().

import { fmt, VERSION } from './config.js';
import { TYPE_LIST } from './enemyFormations.js';
import { drawEnemy } from './sprites.js';
import { CHARSET, INITIALS, ordinal, rankFor } from './scores.js';

const commas = (n) => Math.round(n).toLocaleString('en-US');

export class Hud {
  constructor() {
    this.dist = document.getElementById('dist');
    this.score = document.getElementById('score');
    this.badge = document.getElementById('rank-badge');
    this.best = document.getElementById('best');
    this.armyHud = document.getElementById('army-hud');
    this.count = document.getElementById('count');
    this.gainTag = new DeltaTag(document.getElementById('gain'), '+');
    this.lossTag = new DeltaTag(document.getElementById('loss'), '−');
    this.debugEl = document.getElementById('debug');
    this.title = document.getElementById('title');
    this.over = document.getElementById('over');
    this.recap = document.getElementById('recap');
    this.dangerEl = document.getElementById('danger');
    this.titleLogo = document.getElementById('title-logo');
    this.titleBoard = document.getElementById('title-board');
    this.entryEl = document.getElementById('entry');
    this.retry = document.getElementById('retry');
    this.pauseBtn = document.getElementById('pause-btn');
    this.pauseEl = document.getElementById('pause');
    this.pauseRecap = document.getElementById('pause-recap');
    this.pauseBoard = document.getElementById('pause-board');
    this.pacEl = document.getElementById('pause-pace');
    this.pauseBody = this.pauseEl.querySelector('.pause-body');
    this.pauseTabs = [...this.pauseEl.querySelectorAll('.pause-tabs button')];
    for (const b of this.pauseTabs) b.addEventListener('click', () => this.pauseTab(b.dataset.tab));
    this.stopPauseRecap = null;
    for (const el of document.querySelectorAll('.version')) el.textContent = `v${VERSION} beta`;
    this.gridBtn = document.getElementById('grid-btn');
    this.parallaxBtn = document.getElementById('parallax-btn');
    this.last = { score: -1, rank: -1, count: -1, danger: -1, live: null };
    this.stopRecap = null;
    this.entry = null;        // the initials entry while it's open
    this.attract = 0;         // title-screen timer alternating logo / high scores
  }

  get entering() { return !!this.entry; }

  // Live score, top left. rank = 0–2 while it's on pace for the top 3 of
  // the board: a medal badge shows and the score doubles in size.
  // Returns true when the rank just improved (for a sound).
  setScore(score, rank) {
    if (score !== this.last.score) { this.last.score = score; this.score.textContent = commas(score); }
    if (rank === this.last.rank) return false;
    const up = rank >= 0 && (this.last.rank < 0 || rank < this.last.rank);
    this.last.rank = rank;
    this.dist.classList.toggle('top', rank >= 0);
    for (let i = 0; i < 3; i++) this.dist.classList.toggle('m' + i, rank === i);
    this.badge.textContent = rank >= 0 ? ordinal(rank) : '';
    if (up) restart(this.dist, 'rank-up');
    return up;
  }

  setBest(b) { this.best.textContent = 'Hi ' + commas(b); }

  setCount(n, visible) {
    this.armyHud.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible || n === this.last.count) return;
    if (n > this.last.count && this.last.count >= 0) restart(this.count, 'pop');
    this.last.count = n;
    this.count.textContent = fmt(n);
  }

  // Running totals beside the count: gains left, losses right. 0 lets one fade.
  setDeltas(gain, loss) {
    this.gainTag.set(gain);
    this.lossTag.set(loss);
  }

  setDanger(level) {
    const v = Math.round(level * 100) / 100;
    if (v === this.last.danger) return;
    this.last.danger = v;
    this.dangerEl.style.opacity = v;
    this.count.classList.toggle('danger', v > 0.5);
  }

  // Title screen, arcade attract mode: alternates the logo and the board.
  showTitle(on, scores) {
    this.title.classList.toggle('hidden', !on);
    clearInterval(this.attract);
    this.title.classList.remove('show-board');
    if (!on) return;
    renderBoard(this.titleBoard, scores);
    this.attract = setInterval(() => this.title.classList.toggle('show-board'), 5000);
  }

  // Game over: the recap shows at once; retry stays locked until the board
  // check finishes (allowRetry) or initials are saved (showBoard).
  showOver(stats) {
    this.over.classList.toggle('hidden', !stats);
    if (this.stopRecap) { this.stopRecap(); this.stopRecap = null; }
    if (this.entry) { this.entry.close(); this.entry = null; }
    this.entryEl.classList.add('hidden');
    this.retry.classList.add('hidden');
    this.retryAt = Infinity;
    if (stats) this.stopRecap = renderRecap(this.recap, stats);
  }

  allowRetry() {
    this.retry.classList.remove('hidden');
    this.retryAt = performance.now();
  }

  canRetry() { return !this.entry && performance.now() - this.retryAt > 600; }

  // Made the board: entry = { rank, onStep(), onSubmit(initials) }.
  offerEntry(entry) {
    this.entryEl.classList.remove('hidden');
    this.entry = new InitialsEntry(this.entryEl, entry.rank, (initials) => {
      this.entry.close();
      this.entry = null;
      entry.onSubmit(initials);
    });
    this.entry.onStep = entry.onStep;
  }

  saving() {
    this.entryEl.innerHTML = '<div class="entry-title">Saving…</div>';
    this.retryAt = Infinity;
  }

  // Replaces the recap with the high score board (after entering initials).
  showBoard(scores, highlight) {
    if (this.stopRecap) { this.stopRecap(); this.stopRecap = null; }
    this.entryEl.classList.add('hidden');
    renderBoard(this.recap, scores, highlight);
    this.allowRetry();
  }

  // Pause-menu experiments: the grid pattern and background parallax.
  setLab(pattern, parallax) {
    this.gridBtn.textContent = `Grid: ${pattern}`;
    this.parallaxBtn.textContent = `Parallax: ${parallax ? 'deep' : 'classic'}`;
  }

  setPauseButton(on) { this.pauseBtn.classList.toggle('show', on); }

  // Pause menu: the run so far (same recap as game over) and the board, with
  // where this score would place. stats = null closes it.
  showPause(stats, scores) {
    this.pauseEl.classList.toggle('hidden', !stats);
    if (this.stopPauseRecap) { this.stopPauseRecap(); this.stopPauseRecap = null; }
    if (!stats) return;
    this.pauseTab('run');
    this.pauseScore = stats.score;
    this.stopPauseRecap = renderRecap(this.pauseRecap, stats, 'Score so far');
    this.pauseScores(scores);
  }

  pauseScores(scores) {
    const rank = rankFor(this.pauseScore, scores);
    renderBoard(this.pauseBoard, scores);
    this.pacEl.textContent = rank >= 0 ? `On pace for ${ordinal(rank)} place`
      : `${commas(scores[scores.length - 1].score - this.pauseScore + 1)} more to make the board`;
  }

  pauseTab(tab) {
    this.pauseBody.classList.toggle('show-board', tab === 'board');
    for (const b of this.pauseTabs) b.classList.toggle('on', b.dataset.tab === tab);
  }

  debug(text) {
    this.debugEl.style.display = 'block';
    this.debugEl.textContent = text;
  }
}

// One side of the count: shows a running total, bumps when it changes,
// fades when it's set back to 0.
class DeltaTag {
  constructor(el, sign) { this.el = el; this.sign = sign; this.n = 0; }
  set(n) {
    if (n === this.n) return;
    if (n > 0) {
      this.el.textContent = this.sign + fmt(n);
      this.el.classList.remove('fade');
      this.el.classList.add('live');
      restart(this.el, 'bump');
    } else {
      this.el.classList.remove('live', 'bump');
      this.el.classList.add('fade');
    }
    this.n = n;
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
export function renderRecap(el, stats, label = 'Score') {
  const rows = TYPE_LIST.map((t, i) => `
    <div class="kill${stats.kills[i] ? '' : ' none'}">
      <canvas data-type="${i}"></canvas>
      <span class="n" data-to="${stats.kills[i]}">×0</span>
      <span class="pts">+${commas(stats.killPts[i])}</span>
    </div>`).join('');
  const lost = [['squads', stats.lostEnemy], ['slipped past', stats.leaked], ['gates', stats.lostGate], ['fell', stats.fell]]
    .filter(([, v]) => v > 0).map(([k, v]) => `${fmt(v)} ${k}`).join(' · ') || 'none';
  el.innerHTML = `
    <div class="score"><span class="label">${label}</span><span class="big" data-to="${stats.score}">0</span>
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

// 80s high score board: rank, initials, dotted leader, score. The highlighted
// row (a fresh entry) blinks.
export function renderBoard(el, scores, highlight = -1) {
  el.innerHTML = `<div class="board-title">High scores</div><ol class="board">${scores.map((e, i) => `
    <li class="r${i}${i === highlight ? ' me' : ''}"><span class="rank">${ordinal(i)}</span><span class="ini">${escapeHtml(e.initials.padEnd(INITIALS, ' '))}</span><span class="lead"></span><span class="sc">${commas(e.score)}</span></li>`).join('')}</ol>`;
}

const escapeHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Arcade initials entry: three slots, ▲▼ cycle through CHARSET (hold to
// repeat), tap a slot to pick it, or type on a keyboard. ENTER submits.
export class InitialsEntry {
  constructor(el, rank, onSubmit) {
    this.el = el;
    this.onSubmit = onSubmit;
    this.chars = Array(INITIALS).fill(0);
    this.cur = 0;
    el.classList.add('entry-ui');
    el.innerHTML = `
      <div class="entry-title">New high score</div>
      <div class="entry-rank">${ordinal(rank)} place · enter your initials</div>
      <div class="slots">${this.chars.map((_, i) => `
        <div class="slot" data-i="${i}">
          <button type="button" class="up" aria-label="Next character">▲</button>
          <div class="ch"></div>
          <button type="button" class="down" aria-label="Previous character">▼</button>
        </div>`).join('')}</div>
      <button type="button" class="enter">Enter</button>`;
    // Buttons swallow their pointer events so they never steer or restart the game.
    const stop = (e) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    this.repeat = null;
    el.querySelectorAll('.slot').forEach((slot) => {
      const i = +slot.dataset.i;
      slot.querySelector('.ch').addEventListener('pointerdown', () => { this.cur = i; this.render(); });
      for (const [cls, dir] of [['.up', 1], ['.down', -1]]) {
        const b = slot.querySelector(cls);
        b.addEventListener('pointerdown', () => {
          this.cur = i; this.step(dir);
          clearTimeout(this.repeat);
          const go = () => { this.step(dir); this.repeat = setTimeout(go, 90); };
          this.repeat = setTimeout(go, 380);
        });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(this.repeat));
      }
    });
    el.querySelector('.enter').addEventListener('pointerdown', () => this.submit());
    this.onKey = (e) => {
      if (e.key === 'Enter') this.submit();
      else if (e.key === 'ArrowUp') this.step(1);
      else if (e.key === 'ArrowDown') this.step(-1);
      else if (e.key === 'ArrowLeft') { this.cur = Math.max(0, this.cur - 1); this.render(); }
      else if (e.key === 'ArrowRight') { this.cur = Math.min(INITIALS - 1, this.cur + 1); this.render(); }
      else if (e.key === 'Backspace') { this.chars[this.cur] = 0; this.cur = Math.max(0, this.cur - 1); this.render(); }
      else if (e.key.length === 1 && CHARSET.includes(e.key.toUpperCase())) {
        this.chars[this.cur] = CHARSET.indexOf(e.key.toUpperCase());
        this.cur = Math.min(INITIALS - 1, this.cur + 1);
        this.render();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this.onKey);
    this.render();
  }

  step(dir) {
    this.chars[this.cur] = (this.chars[this.cur] + dir + CHARSET.length) % CHARSET.length;
    if (this.onStep) this.onStep();
    this.render();
  }

  render() {
    this.el.querySelectorAll('.slot').forEach((slot, i) => {
      slot.querySelector('.ch').textContent = CHARSET[this.chars[i]] === ' ' ? '·' : CHARSET[this.chars[i]];
      slot.classList.toggle('cur', i === this.cur);
    });
  }

  get initials() { return this.chars.map((c) => CHARSET[c]).join(''); }

  submit() { this.onSubmit(this.initials); }

  close() {
    clearTimeout(this.repeat);
    window.removeEventListener('keydown', this.onKey);
  }
}
