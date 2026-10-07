// The Tweaks panel, built from a list of entries so a new experiment is one
// array entry in main.js, not new markup.
//
// An entry is { tab, section?, label, type, ... } with:
//   range      min, max, step | log, fmt(v), value(), apply(v), commit?()
//   select     options: ['a', 'b'] or [{ value, label }], value(), apply(v)
//   segmented  options as above, shown as a row of buttons
//   toggle     value(), apply(bool)
//   text       value(), apply(string)
//   buttons    buttons: [{ label, run(), when?() }]
//   info       text()  (a read-only line)
//   custom     render(container), sync()
// Any entry can have when() to show or hide itself, and help for a hint line.
// refresh() re-reads every value, so call it whenever state changes outside the panel.

const LOG_STEPS = 1000;

export class TweaksPanel {
  constructor(root, { tabs, entries, tab, onTab, footer }) {
    this.root = root;
    this.tabs = tabs;
    this.entries = entries;
    this.onTab = onTab;
    this.footer = footer;
    this.current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
    this.build();
    this.refresh();
  }

  build() {
    const head = el('div', 'panel-head');
    head.append(el('h2', '', 'Tweaks'));
    this.tabBar = el('div', 'tabs');
    this.tabBar.setAttribute('role', 'tablist');
    this.tabButtons = new Map();
    for (const t of this.tabs) {
      const b = el('button', 'tab', t.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => this.select(t.id));
      this.tabBar.append(b);
      this.tabButtons.set(t.id, b);
    }
    this.body = el('div', 'panel-body');
    this.panes = new Map();
    for (const t of this.tabs) {
      const pane = el('div', 'tabpane');
      pane.setAttribute('role', 'tabpanel');
      this.panes.set(t.id, pane);
      this.body.append(pane);
    }

    let lastSection = null, sectionEl = null;
    for (const entry of this.entries) {
      const pane = this.panes.get(entry.tab);
      if (!pane) continue;
      const key = `${entry.tab}/${entry.section || ''}`;
      if (key !== lastSection) {
        sectionEl = el('section', 'section');
        if (entry.section) sectionEl.append(el('h3', 'sec', entry.section));
        pane.append(sectionEl);
        lastSection = key;
        sectionEl._rows = [];
      }
      entry._row = this.control(entry);
      sectionEl.append(entry._row);
      sectionEl._rows.push(entry);
      entry._section = sectionEl;
    }

    const foot = el('div', 'panel-foot');
    const row = el('div', 'row');
    const copy = el('button', '', 'Copy settings');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      const text = this.footer.copy();
      navigator.clipboard?.writeText(text).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy settings'; }, 1500); })
        .catch(() => getSelection().selectAllChildren(this.pre));
    });
    const reset = el('button', '', 'Reset tweaks');
    reset.type = 'button';
    reset.addEventListener('click', () => { this.footer.reset(); this.refresh(); });
    row.append(copy, reset);
    const details = el('details');
    details.append(el('summary', '', 'Changed settings'));
    this.pre = el('pre');
    details.append(this.pre);
    foot.append(row, details);

    this.root.append(head, this.tabBar, this.body, foot);
  }

  select(id) {
    this.current = id;
    this.onTab?.(id);
    this.refresh();
  }

  control(entry) {
    const row = el('div', `ctl ${entry.type}`);
    const label = el('span', 'lab', entry.label || '');
    switch (entry.type) {
      case 'range': {
        const input = el('input');
        input.type = 'range';
        const log = !!entry.log;
        if (log) { input.min = 0; input.max = LOG_STEPS; input.step = 1; } else { input.min = entry.min; input.max = entry.max; input.step = entry.step; }
        const out = el('output');
        const toValue = (pos) => (log ? +(entry.min * (entry.max / entry.min) ** (pos / LOG_STEPS)).toPrecision(3) : +pos);
        const toPos = (v) => (log ? Math.round(LOG_STEPS * Math.log(v / entry.min) / Math.log(entry.max / entry.min)) : v);
        input.addEventListener('input', () => {
          const v = toValue(+input.value);
          entry.apply(v);
          out.textContent = entry.fmt(v);
        });
        input.addEventListener('change', () => entry.commit?.());
        // Re-syncing a slider mid-drag makes log sliders jitter, so leave it alone until release.
        let dragging = false;
        input.addEventListener('pointerdown', () => { dragging = true; });
        for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => { dragging = false; });
        entry._sync = () => { const v = entry.value(); out.textContent = entry.fmt(v); if (!dragging) input.value = toPos(v); };
        row.append(label, input, out);
        break;
      }
      case 'select': {
        const select = el('select');
        for (const o of entry.options) {
          const opt = el('option', '', typeof o === 'object' ? o.label : o);
          opt.value = typeof o === 'object' ? o.value : o;
          select.append(opt);
        }
        select.addEventListener('change', () => { entry.apply(select.value); entry.commit?.(); });
        entry._sync = () => { select.value = entry.value(); };
        row.append(label, select);
        break;
      }
      case 'segmented': {
        const group = el('div', 'seg');
        group.setAttribute('role', 'group');
        const buttons = entry.options.map((o) => {
          const b = el('button', '', o.label);
          b.type = 'button';
          b.addEventListener('click', () => { entry.apply(o.value); this.refresh(); entry.commit?.(); });
          group.append(b);
          return [o.value, b];
        });
        entry._sync = () => { for (const [v, b] of buttons) b.setAttribute('aria-pressed', String(String(v) === String(entry.value()))); };
        row.append(label, group);
        break;
      }
      case 'toggle': {
        const b = el('button', 'switch');
        b.type = 'button';
        b.setAttribute('role', 'switch');
        b.addEventListener('click', () => { entry.apply(!entry.value()); this.refresh(); entry.commit?.(); });
        entry._sync = () => { b.setAttribute('aria-checked', String(!!entry.value())); };
        row.append(label, b);
        break;
      }
      case 'text': {
        const input = el('input');
        input.type = 'text';
        input.maxLength = 24;
        input.autocomplete = 'off';
        input.addEventListener('input', () => entry.apply(input.value));
        input.addEventListener('change', () => entry.commit?.());
        entry._sync = () => { if (document.activeElement !== input) input.value = entry.value(); };
        row.append(label, input);
        break;
      }
      case 'buttons': {
        row.classList.add('row');
        const labelOf = (b) => (typeof b.label === 'function' ? b.label() : b.label);
        entry._buttons = entry.buttons.map((b) => {
          const btn = el('button', b.className || '', labelOf(b));
          btn.type = 'button';
          btn.addEventListener('click', () => { b.run(); this.refresh(); });
          row.append(btn);
          return [b, btn];
        });
        entry._sync = () => {
          for (const [b, btn] of entry._buttons) { btn.hidden = b.when ? !b.when() : false; btn.textContent = labelOf(b); }
        };
        break;
      }
      case 'info': {
        const p = el('p', 'info');
        entry._sync = () => { p.textContent = entry.text(); };
        row.append(p);
        break;
      }
      case 'custom': {
        entry.render(row);
        entry._sync = () => entry.sync?.();
        break;
      }
    }
    if (entry.help) row.append(el('small', 'help', entry.help));
    return row;
  }

  refresh() {
    // Tabs that don't apply right now (e.g. Build on a game sound) hide.
    const shown = this.tabs.filter((t) => !t.when || t.when());
    if (!shown.some((t) => t.id === this.current)) this.current = shown[0].id;
    for (const t of this.tabs) {
      const b = this.tabButtons.get(t.id), on = t.id === this.current;
      b.hidden = !shown.includes(t);
      b.setAttribute('aria-selected', String(on));
      this.panes.get(t.id).hidden = !on;
    }
    for (const entry of this.entries) {
      if (!entry._row) continue;
      const visible = !entry.when || entry.when();
      entry._row.hidden = !visible;
      if (visible) entry._sync?.();
    }
    for (const pane of this.panes.values()) {
      for (const section of pane.children) section.hidden = !section._rows.some((e) => !e._row.hidden);
    }
    this.pre.textContent = this.footer.copy();
  }
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
