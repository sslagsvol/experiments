// Debug panel (?debug only): game speed, level skip, low graphics, army
// size, and live sliders for the difficulty values in CFG / ANIM. Tweaks
// apply at once (most to squads and gates spawned from then on), are kept in
// this browser (localStorage) until reset, and "Copy values" puts a config.js
// snippet on the clipboard. No three.js imports.

const STORE_KEY = 'vector-wars-debug';

// [object key, key, min, max, step, note]. obj: 'cfg' = CFG, 'anim' = ANIM.
const TWEAKS = [
  ['Pace'],
  ['cfg', 'SPEED', 4, 10, 0.1, 'forward speed (units/s)'],
  ['cfg', 'CHALLENGE_SPEED', 0.8, 2, 0.05, 'Challenge: track speed × at the start'],
  ['cfg', 'CHALLENGE_SPEED_STEP', 0, 0.1, 0.005, 'Challenge: + per gate'],
  ['Enemies'],
  ['cfg', 'DIFFICULTY', 0.5, 3, 0.05, '× every squad, screen and boss hp (after level 1)'],
  ['cfg', 'DIFFICULTY_LEVEL_1', 0.5, 3, 0.05, '× level 1\'s squads'],
  ['cfg', 'ENEMY_THREAT_MIN', 0.1, 1.2, 0.05, 'squad strength vs best-case army, min'],
  ['cfg', 'ENEMY_THREAT_MAX', 0.1, 1.5, 0.05, '…max'],
  ['cfg', 'LEVEL_GUARD_THREAT', 0.2, 1.5, 0.05, 'the squad guarding each story level gate'],
  ['cfg', 'SCREEN_SHARE', 0, 0.5, 0.01, 'grunt walls in front of guards and bosses'],
  ['anim', 'gruntConverge', 0, 15, 0.5, 'grunts close ranks this far out'],
  ['cfg', 'ENDLESS_GROWTH', 1, 1.6, 0.02, 'past World 1: squads × this per level'],
  ['New enemies'],
  ['cfg', 'SHIELD_CHANCE', 0, 1, 0.05, 'a squad brings a shield line'],
  ['cfg', 'COMBO_CHANCE', 0, 1, 0.05, 'a squad is a set piece instead'],
  ['cfg', 'BOLT_WARN', 0.3, 2.5, 0.1, 'bullet warning line (s)'],
  ['Bosses'],
  ['cfg', 'BOSS_HP_SECONDS', 1, 10, 0.5, 'boss hp = team shots/s × this'],
  ['cfg', 'BOSS_SPEED', 0.1, 1.5, 0.05, 'boss average advance (× charge speed)'],
  ['Gates'],
  ['cfg', 'GATE_DURABILITY', 0.5, 3, 0.05, 'bullets per gate step ×'],
  ['cfg', 'GATE_DURABILITY_STEP', 0, 0.4, 0.01, '+ per level past the 1st'],
  ['cfg', 'GATE_DURABILITY_MAX', 1, 4, 0.1, 'cap on that climb'],
];

const fmt = (v, step) => (step < 1 ? v.toFixed(Math.max(0, -Math.floor(Math.log10(step)))) : String(v));

// objs: { cfg, anim }. actions: { getState(): { level, timeScale, N, mode },
// setSpeed(x), gotoLevel(n), nextLevel(), addUnits(n), setLowGfx(on),
// setSlowMo(on) }.
export function createDebugPanel(objs, actions) {
  const defaults = {};
  for (const [o, k] of TWEAKS) if (k) defaults[`${o}.${k}`] = objs[o][k];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { saved = {}; }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } };
  for (const [id, v] of Object.entries(saved.tweaks || {})) {
    const [o, k] = id.split('.');
    if (objs[o] && k in objs[o]) objs[o][k] = v;
  }
  saved.tweaks = saved.tweaks || {};

  const root = document.createElement('div');
  root.id = 'dbg';
  root.innerHTML = `
    <button type="button" class="dbg-toggle" title="Debug panel (\`)">⚙</button>
    <div class="dbg-body">
      <div class="dbg-head"><b>Debug</b><span class="dbg-live"></span></div>
      <div class="dbg-sec">Run</div>
      <label class="dbg-row"><span>Game speed <i class="dbg-v" data-v="speed">1.00×</i></span>
        <input type="range" data-act="speed" min="0.1" max="3" step="0.05" value="1"></label>
      <div class="dbg-btns">
        <button type="button" data-act="speed1">1×</button><button type="button" data-act="speedHalf">0.25×</button>
        <button type="button" data-act="speed2">2×</button>
      </div>
      <label class="dbg-check"><input type="checkbox" data-act="slowmo" checked> Slow motion / killcam</label>
      <div class="dbg-btns">
        <button type="button" data-act="next">Next level ▸</button>
        <select data-act="goto">${Array.from({ length: 14 }, (_, i) => `<option value="${i + 1}">Level ${i + 1}</option>`).join('')}</select>
        <button type="button" data-act="go">Go</button>
      </div>
      <div class="dbg-btns">
        <button type="button" data-act="add100">+100 units</button><button type="button" data-act="add1000">+1,000</button>
      </div>
      <div class="dbg-sec">Graphics</div>
      <label class="dbg-check"><input type="checkbox" data-act="low"> Low graphics (no bloom, lower resolution)</label>
      <div class="dbg-tweaks"></div>
      <div class="dbg-btns dbg-foot">
        <button type="button" data-act="copy">Copy values</button><button type="button" data-act="reset">Reset tweaks</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  // Keep the game from seeing panel input: no steering from drags, no
  // steering or shortcuts from keys typed into the controls.
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchmove', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => { if (e.key !== '`') e.stopPropagation(); });

  const tweaksEl = root.querySelector('.dbg-tweaks');
  const inputs = [];
  for (const [o, k, min, max, step, note] of TWEAKS) {
    if (!k) { tweaksEl.insertAdjacentHTML('beforeend', `<div class="dbg-sec">${o}</div>`); continue; }
    const id = `${o}.${k}`;
    const row = document.createElement('label');
    row.className = 'dbg-row';
    row.title = note;
    row.innerHTML = `<span>${k}<i class="dbg-v"></i></span><input type="range" min="${min}" max="${max}" step="${step}">`;
    const input = row.querySelector('input'), out = row.querySelector('i');
    const show = () => {
      const v = objs[o][k];
      input.value = v;
      out.textContent = fmt(v, step);
      row.classList.toggle('changed', Math.abs(v - defaults[id]) > step / 2);
    };
    input.addEventListener('input', () => {
      objs[o][k] = parseFloat(input.value);
      saved.tweaks[id] = objs[o][k];
      if (Math.abs(objs[o][k] - defaults[id]) <= step / 2) delete saved.tweaks[id];
      save();
      show();
    });
    inputs.push(show);
    show();
    tweaksEl.appendChild(row);
  }

  const $ = (act) => root.querySelector(`[data-act="${act}"]`);
  const speedOut = root.querySelector('[data-v="speed"]');
  const setSpeed = (x) => { $('speed').value = x; speedOut.textContent = `${(+x).toFixed(2)}×`; actions.setSpeed(+x); };
  $('speed').addEventListener('input', (e) => setSpeed(e.target.value));
  $('speed1').onclick = () => setSpeed(1);
  $('speedHalf').onclick = () => setSpeed(0.25);
  $('speed2').onclick = () => setSpeed(2);
  $('slowmo').onchange = (e) => actions.setSlowMo(e.target.checked);
  $('next').onclick = () => actions.nextLevel();
  $('go').onclick = () => actions.gotoLevel(parseInt($('goto').value, 10));
  $('add100').onclick = () => actions.addUnits(100);
  $('add1000').onclick = () => actions.addUnits(1000);
  const low = $('low');
  low.checked = !!saved.low;
  low.onchange = () => { saved.low = low.checked; save(); actions.setLowGfx(low.checked); };
  if (saved.low) actions.setLowGfx(true);
  $('reset').onclick = () => {
    for (const [id, v] of Object.entries(defaults)) { const [o, k] = id.split('.'); objs[o][k] = v; }
    saved.tweaks = {};
    save();
    inputs.forEach((f) => f());
  };
  $('copy').onclick = async () => {
    const lines = Object.keys(saved.tweaks).map((id) => `  ${id.split('.')[1]}: ${saved.tweaks[id]},   // ${id.startsWith('anim') ? 'ANIM' : 'CFG'} (was ${defaults[id]})`);
    const text = lines.length ? lines.join('\n') : '// no tweaks: everything matches config.js';
    try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied'; } catch { prompt('Copy these values:', text); }
    setTimeout(() => { $('copy').textContent = 'Copy values'; }, 1200);
  };

  const toggle = () => { root.classList.toggle('open'); saved.open = root.classList.contains('open'); save(); };
  root.querySelector('.dbg-toggle').onclick = toggle;
  window.addEventListener('keydown', (e) => { if (e.key === '`') toggle(); });
  if (saved.open) root.classList.add('open');

  // Live readout: level, time scale, army.
  const live = root.querySelector('.dbg-live');
  return {
    update() {
      if (!root.classList.contains('open')) return;
      const s = actions.getState();
      live.textContent = `${s.mode === 'challenge' ? 'Challenge' : `L${s.level}`} · time ×${s.timeScale.toFixed(2)} · ${s.N} units`;
    },
  };
}
