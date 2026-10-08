// Relative drag: the army moves by how far the finger travels, not to where it
// is, so the thumb can rest anywhere and never covers the action.

export class DragInput {
  constructor(target) {
    this.dx = 0;
    this.active = false;
    this.lastX = 0;
    this.taps = 0;
    target.addEventListener('pointerdown', (e) => {
      this.active = true;
      this.lastX = e.clientX;
      this.taps++;
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.dx += e.clientX - this.lastX;
      this.lastX = e.clientX;
    });
    const end = () => { this.active = false; };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    // Block page scroll / pull-to-refresh / long-press menus on mobile.
    target.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  consumeDx() { const d = this.dx; this.dx = 0; return d; }
  consumeTap() { const t = this.taps > 0; this.taps = 0; return t; }
}

// Keyboard steering: which steer keys are held (← → or A / D), and Shift.
export class KeyInput {
  constructor(target) {
    this.held = new Set();
    this.fast = false;
    const STEER = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
    target.addEventListener('keydown', (e) => {
      this.fast = e.shiftKey;
      if (STEER[e.key]) { this.held.add(STEER[e.key] < 0 ? 'L' : 'R'); e.preventDefault(); }
    });
    target.addEventListener('keyup', (e) => {
      this.fast = e.shiftKey;
      if (STEER[e.key]) this.held.delete(STEER[e.key] < 0 ? 'L' : 'R');
    });
    target.addEventListener('blur', () => this.held.clear());
  }

  // -1 left, 1 right, 0 none (or both).
  get dir() { return (this.held.has('R') ? 1 : 0) - (this.held.has('L') ? 1 : 0); }
}
