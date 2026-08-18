# Plan: keep the Type Lab word clear of the mobile bottom bar

## Root cause

`typelab/typelab.html` renders in two independent layers that don't know about each other:

- The `<canvas>` is full-bleed: `position:absolute;inset:0;width:100%;height:100%`.
- The word ("LIQUID" or whatever's typed) is rasterized onto that canvas **centered on its full height** — `rasterize()` computes `fs = Math.round(H * 0.42)` and draws at `x.fillText(word, W / 2, H / 2 + ...)`, where `H` is the canvas's full pixel height ([typelab.html:459](typelab/typelab.html:459), [typelab.html:466](typelab/typelab.html:466)).
- The control bar (title, 7 mode buttons, 4 sliders, 5 palette swatches, word input, reset/PNG) is a separate DOM element pinned to the bottom: `position:absolute;bottom:0;left:0;right:0` with `flex-wrap:wrap` ([typelab.html:24](typelab/typelab.html:24)).

On desktop the bar is one slim row, so centering on the full canvas happens to look fine. On a narrow phone, all those controls wrap into several rows and the bar can eat a large fraction of the viewport's height — but the text doesn't know that, so it's centered as if the bar weren't there, and the bar's opaque background covers the bottom of the word.

## Fix

Make the rasterizer center (and size) the word within the space **above** the bar, not the full canvas. This means measuring the bar's actual rendered height and feeding it into `rasterize()`.

### 1. Get a handle on the bar element

Add a `ref` to the bar div, mirroring the existing `setCanvas`/`setInput` pattern:

```html
<div ref="{{ setBar }}" style="position:absolute;bottom:0;left:0;right:0;...">
```

```js
setBar = (el) => { this.barEl = el; };
```

Return `setBar: this.setBar` from `renderVals()`.

### 2. Measure it and store in device pixels

In `onResize()` (typelab.html:430), alongside the existing `dpr`/`w`/`h` computation, measure the bar's live CSS height and convert to the same pixel space as `W`/`H`:

```js
this.barPx = this.barEl ? Math.round(this.barEl.getBoundingClientRect().height * dpr) : 0;
```

### 3. Rasterize within the reduced height

In `rasterize()` (typelab.html:450), replace the two `H`-based calculations with an `availH` that subtracts the bar, clamped so a pathologically tall bar (e.g. a very short landscape phone) can't collapse the text to nothing:

```js
const availH = Math.max(H - (this.barPx || 0), H * 0.35);
let fs = Math.round(availH * 0.42);
// ...unchanged max-width shrink logic...
x.fillText(word, W / 2, availH / 2 + (asc - desc) / 2);
```

`W` and the max-width shrink logic (`maxW = W * 0.84`) stay as-is — this is purely a vertical fix, the bar spans the full width already.

### 4. Re-rasterize whenever the bar's height changes, not just on window resize

Window resize already triggers `onResize()` → `rasterize()`, which covers orientation changes and viewport width changes. But the bar can also change height for reasons that don't fire a `resize` event misleadingly reliably on mobile (e.g. font loading reflow, iOS Safari's dynamic toolbar affecting available width without a clean resize). Rather than chase individual triggers, observe the bar directly:

```js
componentDidMount(){
  if(this.cv && !this.gl) this.initGL();
  window.addEventListener('resize', this.onResize);
  window.addEventListener('keydown', this.onKey);
  if(this.barEl) this.barRO = new ResizeObserver(() => this.onBarResize());
  if(this.barRO && this.barEl) this.barRO.observe(this.barEl);
}
componentWillUnmount(){
  cancelAnimationFrame(this.raf);
  window.removeEventListener('resize', this.onResize);
  window.removeEventListener('keydown', this.onKey);
  if(this.barRO) this.barRO.disconnect();
}
onBarResize = () => {
  if(!this.gl || !this.cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const newBarPx = Math.round(this.barEl.getBoundingClientRect().height * dpr);
  if(newBarPx === this.barPx) return;
  this.barPx = newBarPx;
  this.rasterize();
};
```

This is a lightweight response (just re-draws the text texture) — it does **not** go through the full `onResize()` path, which recreates framebuffers and is only needed when the canvas itself resizes.

Note: `setBar`'s ref callback and `initGL()` can race on mount (both fire around first render). `onBarResize` already guards on `this.gl`, and the ResizeObserver's first callback (which fires once automatically on observe) will supersede whatever `barPx` value was available when `onResize()` first ran, so the ordering doesn't need to be exact.

## What this doesn't touch

- The fluid simulation itself already effectively ignores the bar for interaction — the bar is a normal DOM element stacked above the canvas, so pointer events over it go to its own buttons/inputs, not through to the canvas.
- `savePNG()` exports the raw canvas pixels, which never included the bar (that's a DOM overlay, not canvas content) — after this fix the exported image will simply show the word higher up with more empty simulation space below it, which is a minor, acceptable side effect.
- Not touching the bar's own mobile layout (e.g. collapsing controls behind a toggle, à la the Meridian GP mobile leaderboard). That would reduce *how much* space the bar needs in the first place, which is a reasonable follow-up but a bigger, separate change from "keep the word centered in whatever space is actually available" — this plan only does the latter, which is what was asked and is the more robust fix regardless of the bar's exact height.

## Verification

1. Load `typelab/typelab.html` at a narrow mobile width (~375px) where the control bar visibly wraps to multiple rows.
2. Confirm the word sits fully above the bar with even margin top and bottom of the *visible* (unobstructed) canvas area, for both a short word ("PLAY") and a long one ("EXPERIMENT", which already triggers the width-shrink path).
3. Resize the viewport across the tablet/desktop breakpoints and confirm nothing regresses where the bar is already a single row (the `availH` calc degrades gracefully to `H - smallBarHeight ≈ H`).
4. Toggle between portrait and landscape on a phone-sized viewport to confirm the `ResizeObserver` path re-centers without needing a manual reload.
5. Type a new word and switch modes/palettes to confirm `rasterize()` still fires correctly on those existing triggers (`onWordInput`, `setMode`) with the new centering applied.
6. Check the browser console for errors (in particular, confirm `ResizeObserver` is available — it is in all current evergreen browsers, and this page already requires WebGL2 so an old-browser fallback isn't a concern here).
7. Save a PNG and confirm it looks reasonable (word positioned in the upper portion, not cut off).
