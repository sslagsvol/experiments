// The piano keyboard: 12-18 chromatic keys from a start note.
//
// Wide screens get one row. When white keys would be narrower than MIN_KEY px
// the keys are split into stacked octave rows (higher octave on top) so every
// key stays a comfortable tap target. All key geometry is in percentages of
// the row, so only the row count depends on measured width.
//
// Input is Pointer Events tracked per pointerId (multi-touch, glissando), plus
// the QWERTY "piano row" and Enter/Space on a focused key.

const MIN_KEY = 44;                       // px, smallest comfortable white key
const BLACK_W = 0.6;                      // black key width, in white-key widths
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
// A W S E D F T G Y H U J K O L P ; ' -> C4 ... F5 (event.code, so any layout works)
export const QWERTY_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote'];
const QWERTY_LABELS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];

export const isBlack = (note) => BLACK_PCS.has(((note % 12) + 12) % 12);
export const noteName = (note) => `${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;

export class Keyboard {
  // el: the container. onDown(note, vel, id) / onUp(id) report playing.
  constructor(el, { onDown, onUp }) {
    this.el = el;
    this.onDown = onDown;
    this.onUp = onUp;
    this.opts = { start: 60, count: 18, labels: 'note', gliss: true, velocity: 'fixed' };
    this.stacked = false;
    this.rows = 1;
    this.pointers = new Map();   // pointerId -> { note, keyEl }
    this.holders = new Map();    // note -> Set of ids holding it (for the pressed look)
    this.keyEls = new Map();     // note -> element
    this.keyIds = new Map();     // QWERTY / focus key id -> note

    el.addEventListener('pointerdown', (e) => this.pointerDown(e));
    el.addEventListener('pointermove', (e) => this.pointerMove(e));
    for (const type of ['pointerup', 'pointercancel']) el.addEventListener(type, (e) => this.pointerUp(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    new ResizeObserver(() => this.build(false)).observe(el);
  }

  set(opts) {
    Object.assign(this.opts, opts);
    this.build(true);
  }

  get notes() {
    return Array.from({ length: this.opts.count }, (_, i) => this.opts.start + i);
  }

  // ---- layout ----
  // Rebuilds the DOM when forced, or when the width crosses the row-split line.
  build(force) {
    const notes = this.notes;
    const whites = notes.filter((n) => !isBlack(n)).length;
    const width = this.el.clientWidth;
    const stacked = width > 0 && width / whites < MIN_KEY;
    if (!force && stacked === this.stacked && this.el.firstChild) return;
    this.releaseAll();
    this.stacked = stacked;

    const groups = stacked ? chunkByOctave(notes) : [notes];
    const maxWhites = Math.max(...groups.map((g) => g.filter((n) => !isBlack(n)).length));
    // A row ending on a black key overhangs its last white key a little.
    const overhang = groups.some((g) => isBlack(g[g.length - 1])) ? BLACK_W / 2 : 0;
    const unit = 100 / (maxWhites + overhang);

    this.rows = groups.length;
    this.el.className = `kb ${stacked ? 'stacked' : 'single'}`;
    this.el.replaceChildren();
    this.keyEls.clear();
    // Higher octave on top: build rows in reverse so the first group is lowest at the bottom.
    for (const group of [...groups].reverse()) {
      const row = document.createElement('div');
      row.className = 'row';
      let white = 0;
      for (const note of group) {
        const key = document.createElement('div');
        key.className = isBlack(note) ? 'key black' : 'key white';
        key.dataset.note = note;
        key.setAttribute('role', 'button');
        key.tabIndex = 0;
        key.setAttribute('aria-label', noteName(note));
        if (isBlack(note)) {
          key.style.width = `${unit * BLACK_W}%`;
          key.style.left = `${white * unit - (unit * BLACK_W) / 2}%`;
        } else {
          key.style.width = `${unit}%`;
          key.style.left = `${white * unit}%`;
          white++;
        }
        const label = document.createElement('span');
        label.className = 'lab';
        key.append(label);
        row.append(key);
        this.keyEls.set(note, key);
      }
      this.el.append(row);
    }
    this.setLabels(this.opts.labels);
  }

  setLabels(mode) {
    this.opts.labels = mode;
    this.notes.forEach((note, i) => {
      const lab = this.keyEls.get(note)?.firstChild;
      if (!lab) return;
      lab.textContent = mode === 'note' ? noteName(note) : mode === 'keys' ? (QWERTY_LABELS[i] || '') : '';
    });
  }

  // ---- playing ----
  press(note, id, vel = 0.85) {
    const key = this.keyEls.get(note);
    if (!key) return;
    let set = this.holders.get(note);
    if (!set) this.holders.set(note, (set = new Set()));
    set.add(id);
    key.classList.add('down');
    this.onDown(note, vel, id);
  }

  release(note, id) {
    const set = this.holders.get(note);
    if (!set || !set.delete(id)) return;
    if (!set.size) { this.holders.delete(note); this.keyEls.get(note)?.classList.remove('down'); }
    this.onUp(id);
  }

  releaseAll() {
    for (const [note, set] of [...this.holders]) for (const id of [...set]) this.release(note, id);
    this.pointers.clear();
    this.keyIds.clear();
  }

  velocityAt(e, keyEl) {
    if (this.opts.velocity !== 'position') return 0.85;
    const r = keyEl.getBoundingClientRect();
    return 0.3 + 0.7 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  }

  keyUnder(x, y) {
    const hit = document.elementFromPoint(x, y)?.closest('.key');
    return hit && this.el.contains(hit) ? hit : null;
  }

  pointerDown(e) {
    const key = e.target.closest('.key');
    if (!key || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }   // so the release always arrives, even off the keyboard
    const note = +key.dataset.note;
    this.pointers.set(e.pointerId, { note, key });
    this.press(note, `p${e.pointerId}`, this.velocityAt(e, key));
  }

  pointerMove(e) {
    const cur = this.pointers.get(e.pointerId);
    if (!cur || !this.opts.gliss) return;
    const key = this.keyUnder(e.clientX, e.clientY);
    if (!key || key === cur.key) return;
    const id = `p${e.pointerId}`;
    this.release(cur.note, id);
    const note = +key.dataset.note;
    this.pointers.set(e.pointerId, { note, key });
    this.press(note, id, this.velocityAt(e, key));
  }

  pointerUp(e) {
    const cur = this.pointers.get(e.pointerId);
    if (!cur) return;
    this.pointers.delete(e.pointerId);
    this.release(cur.note, `p${e.pointerId}`);
  }

  // Computer keyboard. Letters play unless you're typing in a text field.
  keyDown(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input[type=text], textarea, select, [contenteditable]')) return;
    const i = QWERTY_CODES.indexOf(e.code);
    if (i >= 0 && i < this.opts.count) {
      e.preventDefault();
      this.keyIds.set(e.code, this.opts.start + i);
      this.press(this.opts.start + i, `k${e.code}`);
      return;
    }
    // Enter / Space on a focused key.
    const focused = e.target.closest?.('.key');
    if (focused && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      const note = +focused.dataset.note;
      this.keyIds.set(e.code, note);
      this.press(note, `k${e.code}`);
    }
  }

  keyUp(e) {
    const note = this.keyIds.get(e.code);
    if (note === undefined) return;
    this.keyIds.delete(e.code);
    this.release(note, `k${e.code}`);
  }
}

// Splits notes into groups that share an octave (C to B).
function chunkByOctave(notes) {
  const groups = [];
  for (const n of notes) {
    const oct = Math.floor(n / 12);
    const last = groups[groups.length - 1];
    if (last && Math.floor(last[0] / 12) === oct) last.push(n); else groups.push([n]);
  }
  return groups;
}
