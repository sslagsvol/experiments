"use strict";

/* ==========================================================================
   Track Companion — app logic
   Loads the Monza timing template, lets the driver bias it with sector
   sliders, then drives a proportional-scaling timer that swaps the on-screen
   corner cards as each complex's scaled timestamp is crossed. See
   docs/PROJECT_PLAN.md for the mechanic.
   ========================================================================== */

const state = {
  track: null,           // parsed monza-corners.json
  selectedCarId: null,
  targetLapSeconds: 0,
  sliderBias: [0, 0, 0], // -1..1 per sector, derived from slider 0-100
  scaledComplexes: [],   // complexes with .scaledTime (seconds) attached
  sectorBoundaries: [],  // [s1End, s2End, s3End] in seconds

  running: false,
  paused: false,
  lapStartMs: 0,
  pausedAtElapsed: 0,
  tickHandle: null,
  recordedLaps: [],      // {timestamp, car, lapTimeSeconds}, newest first

  lapTimeSelector: null,       // setup screen's time-selector instance
  adjustLapTimeSelector: null, // pause menu's time-selector instance
};

const SLIDER_BIAS_STRENGTH = 0.4; // max +/-40% share shift at full slider deflection
const LAP_LOG_STORAGE_KEY = "trackCompanionRecordedLaps";
const DEFAULT_LAP_TARGET_SECONDS = 115; // 1:55.00
const MIN_LAP_TARGET_SECONDS = 1; // guards against a degenerate 0:00.00 target
const START_FINISH_LINGER_SECONDS = 2; // how long the finish line stays "current" at lap start

// Bounds per time-selector digit — secondsTens is capped at 5 so seconds can
// never read past 59; every other digit is a free 0-9.
const TIME_DIGIT_BOUNDS = {
  minutes: 9,
  secondsTens: 5,
  secondsOnes: 9,
  hundredthsTens: 9,
  hundredthsOnes: 9,
};

// Synthetic complex marking the start/finish line, appended after the real
// track corners so it shows up in the card stack as the lap winds down.
// Placed just short of 1.0 so it gets its own moment as "current" before the
// lap actually auto-resets at scaledTime === targetLapSeconds.
const FINISH_LINE_COMPLEX = {
  id: "finish",
  name: "Start / Finish",
  corners: "FINISH",
  position_pct: 0.97,
  sector: 3,
  gear: "",
  note: "Lap resets here.",
  curb_note: "",
};

const DEFAULT_TURN_ICON = "design/svg/arrows/Straight/Continue.svg";

// One or two icons per complex, in the order the corners are actually
// driven — two for a chicane's direction change, one for a single corner.
// Based on the real Monza layout (not inferrable from the note text alone),
// so hand-mapped by complex id. Anything not listed here (and the synthetic
// finish line) falls back to DEFAULT_TURN_ICON per complex's request.
const TURN_ICONS = {
  rettifilo: ["design/svg/arrows/Right/Sharp.svg", "design/svg/arrows/Left/Sharp.svg"],
  "curva-grande": ["design/svg/arrows/Right/Slight.svg"],
  "della-roggia": ["design/svg/arrows/Left/Sharp.svg", "design/svg/arrows/Right/Sharp.svg"],
  "lesmo-1": ["design/svg/arrows/Right/90.svg"],
  "lesmo-2": ["design/svg/arrows/Right/Sharp.svg"],
  ascari: ["design/svg/arrows/Left/Sharp.svg", "design/svg/arrows/Right/Sharp.svg"],
  parabolica: ["design/svg/arrows/Right/Slight.svg"],
};

init();

function init() {
  state.track = TRACK_DATA;
  state.recordedLaps = loadRecordedLaps();
  state.targetLapSeconds = DEFAULT_LAP_TARGET_SECONDS;

  state.lapTimeSelector = createTimeSelector(
    document.getElementById("lap-time-selector"),
    DEFAULT_LAP_TARGET_SECONDS
  );
  state.adjustLapTimeSelector = createTimeSelector(
    document.getElementById("adjust-lap-time-selector"),
    DEFAULT_LAP_TARGET_SECONDS
  );

  renderCarOptions();
  wireSetupScreen();
  wireDriveScreen();
  wirePauseMenu();
  recomputeSchedule();
}

/* ---------------------------------------------------------------------- */
/* Time selector — every digit gets its own independent up/down stepper   */
/* (minutes, then the two digits of seconds, then the two digits of       */
/* hundredths), replacing free-text lap-time entry with digit-exact       */
/* control. Digits are stored and read as integer hundredths internally   */
/* to avoid float-rounding drift.                                         */
/* ---------------------------------------------------------------------- */

function createTimeSelector(container, initialSeconds) {
  const parts = secondsToParts(initialSeconds);

  container.innerHTML = [
    timeSegmentHtml("minutes"),
    '<div class="time-separator type-heading-large">:</div>',
    '<div class="digit-pair">',
    timeSegmentHtml("secondsTens"),
    timeSegmentHtml("secondsOnes"),
    "</div>",
    '<div class="time-separator type-heading-large">.</div>',
    '<div class="digit-pair">',
    timeSegmentHtml("hundredthsTens"),
    timeSegmentHtml("hundredthsOnes"),
    "</div>",
  ].join("");

  container.querySelectorAll(".segment-up").forEach((btn) => {
    btn.addEventListener("click", () => step(btn.closest(".time-segment").dataset.unit, 1));
  });
  container.querySelectorAll(".segment-down").forEach((btn) => {
    btn.addEventListener("click", () => step(btn.closest(".time-segment").dataset.unit, -1));
  });

  render();

  function step(unit, direction) {
    const max = TIME_DIGIT_BOUNDS[unit];
    parts[unit] = (parts[unit] + direction + (max + 1)) % (max + 1);
    render();
  }

  function render() {
    Object.keys(TIME_DIGIT_BOUNDS).forEach((unit) => {
      container.querySelector(`[data-unit="${unit}"] .segment-value`).textContent = parts[unit];
    });
  }

  return {
    getSeconds: () => {
      const seconds = parts.secondsTens * 10 + parts.secondsOnes;
      const hundredths = parts.hundredthsTens * 10 + parts.hundredthsOnes;
      return parts.minutes * 60 + seconds + hundredths / 100;
    },
    setSeconds: (totalSeconds) => {
      Object.assign(parts, secondsToParts(totalSeconds));
      render();
    },
  };
}

function timeSegmentHtml(unit) {
  return `
    <div class="time-segment" data-unit="${unit}">
      <button type="button" class="segment-btn segment-up" aria-label="Increase ${unit}">▲</button>
      <div class="segment-value type-heading-large">0</div>
      <button type="button" class="segment-btn segment-down" aria-label="Decrease ${unit}">▼</button>
    </div>
  `;
}

function secondsToParts(totalSeconds) {
  // Work in integer hundredths throughout so digit math never hits
  // floating-point rounding edge cases (e.g. 0.1 + 0.2 !== 0.3).
  const totalHundredths = Math.max(0, Math.round((totalSeconds || 0) * 100));
  const minutes = Math.floor(totalHundredths / 6000) % 10;
  const secondsAndHundredths = totalHundredths % 6000;
  const seconds = Math.floor(secondsAndHundredths / 100);
  const hundredths = secondsAndHundredths % 100;
  return {
    minutes,
    secondsTens: Math.floor(seconds / 10),
    secondsOnes: seconds % 10,
    hundredthsTens: Math.floor(hundredths / 10),
    hundredthsOnes: hundredths % 10,
  };
}

function loadRecordedLaps() {
  try {
    const raw = localStorage.getItem(LAP_LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveRecordedLaps() {
  try {
    localStorage.setItem(LAP_LOG_STORAGE_KEY, JSON.stringify(state.recordedLaps));
  } catch (e) {
    // localStorage unavailable (private browsing, etc.) — recorded laps
    // just won't persist across reloads.
  }
}

/* ---------------------------------------------------------------------- */
/* Setup screen                                                           */
/* ---------------------------------------------------------------------- */

function renderCarOptions() {
  const select = document.getElementById("car-select");
  const carIds = Object.keys(state.track.cars);
  state.selectedCarId = carIds[0];

  select.innerHTML = "";
  carIds.forEach((id) => {
    const car = state.track.cars[id];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = car.display_name;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    state.selectedCarId = select.value;
  });
}

function wireSetupScreen() {
  [1, 2, 3].forEach((n) => {
    const slider = document.getElementById(`slider-${n}`);
    const readout = document.getElementById(`bias-${n}`);
    slider.addEventListener("input", () => {
      const val = Number(slider.value);
      state.sliderBias[n - 1] = (val - 50) / 50;
      readout.textContent = biasLabel(val);
    });
  });

  document.getElementById("start-btn").addEventListener("click", () => {
    state.targetLapSeconds = Math.max(MIN_LAP_TARGET_SECONDS, state.lapTimeSelector.getSeconds());
    recomputeSchedule();
    goToDriveScreen();
  });
}

function biasLabel(sliderValue) {
  const delta = sliderValue - 50;
  if (delta === 0) return "even";
  const pct = Math.round(Math.abs(delta) / 50 * (SLIDER_BIAS_STRENGTH * 100));
  return delta > 0 ? `+${pct}%` : `-${pct}%`;
}

/* ---------------------------------------------------------------------- */
/* Proportional schedule (sector sliders -> scaled complex timestamps)    */
/* ---------------------------------------------------------------------- */

function recomputeSchedule() {
  const { sectors, complexes } = state.track;
  const allComplexes = complexes.concat([FINISH_LINE_COMPLEX]);
  const baseWidths = sectors.map((s) => s.range[1] - s.range[0]);

  const weighted = baseWidths.map(
    (w, i) => w * (1 + SLIDER_BIAS_STRENGTH * state.sliderBias[i])
  );
  const totalWeight = weighted.reduce((a, b) => a + b, 0);
  const newWidths = weighted.map((w) => w / totalWeight);

  const newStart = [];
  let acc = 0;
  newWidths.forEach((w) => {
    newStart.push(acc);
    acc += w;
  });

  state.scaledComplexes = allComplexes.map((c) => {
    const sector = sectors.find((s) => s.id === c.sector);
    const origWidth = sector.range[1] - sector.range[0];
    const frac = origWidth > 0 ? (c.position_pct - sector.range[0]) / origWidth : 0;
    const newPositionPct = newStart[c.sector - 1] + frac * newWidths[c.sector - 1];
    return Object.assign({}, c, {
      scaledPositionPct: newPositionPct,
      scaledTime: newPositionPct * (state.targetLapSeconds || 0),
    });
  });

  state.sectorBoundaries = newStart
    .slice(1)
    .concat([1])
    .map((pct) => pct * (state.targetLapSeconds || 0));

  updateSectorStripTargets();
}

function updateSectorStripTargets() {
  [1, 2, 3].forEach((n) => {
    const el = document.getElementById(`sector-target-${n}`);
    if (el) el.textContent = formatTime(state.sectorBoundaries[n - 1] || 0);
  });
}

function formatTime(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped - minutes * 60;
  const secStr = seconds.toFixed(2).padStart(5, "0");
  return minutes > 0 ? `${minutes}:${secStr}` : secStr;
}

/* ---------------------------------------------------------------------- */
/* Drive screen                                                           */
/* ---------------------------------------------------------------------- */

function goToDriveScreen() {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById("drive").classList.add("active");
  startTimer();
}

function goToSetupScreen() {
  stopTimer();
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById("setup").classList.add("active");
}

function wireDriveScreen() {
  document.getElementById("pause-btn").addEventListener("click", openPauseMenu);
  document.getElementById("exit-btn").addEventListener("click", goToSetupScreen);
}

/* ---------------------------------------------------------------------- */
/* Pause menu                                                             */
/* ---------------------------------------------------------------------- */

function wirePauseMenu() {
  const overlay = document.getElementById("pause-overlay");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePauseMenu();
  });

  document.getElementById("menu-resume").addEventListener("click", closePauseMenu);

  document.getElementById("menu-adjust-lap").addEventListener("click", () => {
    state.adjustLapTimeSelector.setSeconds(state.targetLapSeconds);
    document.getElementById("adjust-lap-section").hidden = false;
  });

  document.getElementById("adjust-lap-apply").addEventListener("click", () => {
    state.targetLapSeconds = Math.max(
      MIN_LAP_TARGET_SECONDS,
      state.adjustLapTimeSelector.getSeconds()
    );
    recomputeSchedule();
    document.getElementById("adjust-lap-section").hidden = true;
    closePauseMenu();
  });

  document.getElementById("menu-reset-lap").addEventListener("click", () => {
    resetLapClock();
    renderCardStack(0);
    updateSectorHighlight(0);
    closePauseMenu();
  });

  document.getElementById("menu-record-lap").addEventListener("click", () => {
    const lapTimeSeconds = state.pausedAtElapsed;
    state.recordedLaps.unshift({
      timestamp: new Date().toISOString(),
      car: state.track.cars[state.selectedCarId]
        ? state.track.cars[state.selectedCarId].display_name
        : state.selectedCarId,
      lapTimeSeconds,
    });
    state.recordedLaps = state.recordedLaps.slice(0, 20);
    saveRecordedLaps();
    renderRecordedLaps();
  });
}

function openPauseMenu() {
  // Compute elapsed while still unpaused — elapsedSeconds() short-circuits
  // to the (stale) pausedAtElapsed once state.paused is true.
  state.pausedAtElapsed = elapsedSeconds();
  state.paused = true;
  document.getElementById("pause-elapsed").textContent = formatTime(state.pausedAtElapsed);
  document.getElementById("adjust-lap-section").hidden = true;
  renderRecordedLaps();
  document.getElementById("pause-overlay").hidden = false;
}

function closePauseMenu() {
  document.getElementById("pause-overlay").hidden = true;
  if (!state.running) return;
  state.paused = false;
  state.lapStartMs = performance.now() - state.pausedAtElapsed * 1000;
}

function renderRecordedLaps() {
  const list = document.getElementById("recorded-laps-list");
  list.innerHTML = "";
  state.recordedLaps.slice(0, 5).forEach((lap) => {
    const row = document.createElement("div");
    row.className = "recorded-lap-row";
    const time = new Date(lap.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    row.innerHTML = `
      <span class="type-body-default">${escapeHtml(lap.car)} · ${timeStr}</span>
      <span class="lap-time-value type-label-distance">${formatTime(lap.lapTimeSeconds)}</span>
    `;
    list.appendChild(row);
  });
}

function startTimer() {
  state.running = true;
  state.paused = false;
  state.lapStartMs = performance.now();
  state.pausedAtElapsed = 0;
  updateElapsedReadout(0);
  tick();
}

function stopTimer() {
  state.running = false;
  state.paused = false;
  if (state.tickHandle) cancelAnimationFrame(state.tickHandle);
  document.getElementById("pause-overlay").hidden = true;
}

function resetLapClock() {
  state.lapStartMs = performance.now();
  state.pausedAtElapsed = 0;
  updateElapsedReadout(0);
}

function elapsedSeconds() {
  if (state.paused) return state.pausedAtElapsed;
  return (performance.now() - state.lapStartMs) / 1000;
}

function tick() {
  if (!state.running) return;
  if (!state.paused) {
    const elapsed = elapsedSeconds();
    if (state.targetLapSeconds > 0 && elapsed >= state.targetLapSeconds) {
      // Crossed the finish line — re-zero and keep going, lap after lap,
      // with no button press needed.
      resetLapClock();
      updateSectorHighlight(0);
      renderCardStack(0);
    } else {
      updateElapsedReadout(elapsed);
      updateSectorHighlight(elapsed);
      renderCardStack(elapsed);
    }
  }
  state.tickHandle = requestAnimationFrame(tick);
}

function updateElapsedReadout(elapsed) {
  const el = document.getElementById("drive-elapsed-time");
  if (el) el.textContent = formatTime(elapsed);
}

function currentIndex(elapsed) {
  const list = state.scaledComplexes;
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].scaledTime <= elapsed) idx = i;
  }
  return idx;
}

// The card-stack's notion of "current" differs from currentIndex() (used for
// sector highlighting) right at lap start: for a couple of seconds after
// crossing the line, the finish-line card itself is shown as current — it's
// literally where the driver just was — before quickly handing off to the
// first real corner. Sector highlighting stays on the real position (S1)
// throughout; this only affects which card is drawn as current/next.
function currentCardIndex(elapsed) {
  const list = state.scaledComplexes;
  if (list.length === 0) return -1;
  const lingerWindow = Math.min(START_FINISH_LINGER_SECONDS, list[0].scaledTime);
  if (elapsed < lingerWindow) return list.length - 1; // finish line, appended last
  return currentIndex(elapsed);
}

function renderCardStack(elapsed) {
  const list = state.scaledComplexes;
  if (list.length === 0) return;
  const idx = currentCardIndex(elapsed);
  // Before the first complex of the lap, idx is -1: treat complex 0 as the
  // current/upcoming slot rather than wrapping back to the previous lap's
  // last complex.
  const base = idx === -1 ? 0 : idx;

  const stack = document.getElementById("card-stack");
  stack.innerHTML = "";
  // Show every complex for the lap, ordered starting from current — only
  // the current and next (slot 0/1) get the full expanded treatment, the
  // rest render compact so as many turns as possible fit on screen.
  for (let i = 0; i < list.length; i++) {
    const wrapped = (base + i) % list.length;
    stack.appendChild(renderCard(list[wrapped], i));
  }
}

function cornerRangeLabel(complex) {
  return complex.id === "finish" ? "FINISH LINE" : `TURN ${complex.corners.replace("T", "")}`;
}

function gearDigit(complex) {
  if (complex.id === "finish") return "🏁";
  return (complex.gear.match(/\d/) || ["-"])[0];
}

function turnIconsHtml(complex) {
  const icons = TURN_ICONS[complex.id] || [DEFAULT_TURN_ICON];
  const iconsHtml = icons
    .map((src) => `<img class="turn-icon" src="${src}" alt="" width="20" height="20">`)
    .join("");
  // Braking distance is an estimate the driver will tune after real
  // sessions (see data/monza-corners.js) — not every complex has one (the
  // finish line doesn't), so this chip is skipped when it's absent.
  const brakeChip =
    complex.brake_point_m != null
      ? `<span class="brake-distance type-label-turn">${complex.brake_point_m}M</span>`
      : "";
  return iconsHtml + brakeChip;
}

// Jump the lap clock straight to a complex's own position in the timeline —
// tapping any card (current, next, or a compact upcoming one) re-syncs to
// it, e.g. if the driver got out of step with the estimate.
function jumpToComplex(complex) {
  if (!state.running) return;
  const targetElapsed = complex.scaledTime;
  if (state.paused) {
    state.pausedAtElapsed = targetElapsed;
  } else {
    state.lapStartMs = performance.now() - targetElapsed * 1000;
  }
  updateElapsedReadout(targetElapsed);
  updateSectorHighlight(targetElapsed);
  renderCardStack(targetElapsed);
}

function renderCard(complex, slot) {
  const card = document.createElement("div");
  card.addEventListener("click", () => jumpToComplex(complex));
  const expanded = slot < 2;

  if (!expanded) {
    card.className = "corner-card upcoming";
    card.innerHTML = `
      <div class="gear-number-mini">${gearDigit(complex)}</div>
      <div class="card-body-mini">
        <div class="turn-icons">${turnIconsHtml(complex)}</div>
        <div class="complex-name-mini type-title-small">${escapeHtml(complex.name)}</div>
      </div>
    `;
    return card;
  }

  const isCurrent = slot === 0;
  card.className = `corner-card ${isCurrent ? "current" : "next"}`;

  const gearType = isCurrent ? "type-display-gear" : "type-display-turn";
  const nameType = isCurrent ? "type-title-card" : "type-title-small";

  const notes = [];
  if (complex.note) notes.push(`<li class="type-body-default">${escapeHtml(complex.note)}</li>`);
  if (complex.curb_note) notes.push(`<li class="curb-note type-caption-italic">${escapeHtml(complex.curb_note)}</li>`);

  card.innerHTML = `
    <div class="gear-column">
      <div class="gear-number ${gearType}">${gearDigit(complex)}</div>
      <div class="corner-range type-label-turn">${cornerRangeLabel(complex)}</div>
    </div>
    <div class="card-body">
      <div class="turn-icons">${turnIconsHtml(complex)}</div>
      <div class="complex-name ${nameType}">${escapeHtml(complex.name)}</div>
      <ul class="notes">${notes.join("")}</ul>
    </div>
  `;
  return card;
}

function updateSectorHighlight(elapsed) {
  const idx = currentIndex(elapsed);
  const activeSector = idx >= 0 ? state.scaledComplexes[idx].sector : 1;
  document.querySelectorAll("#sector-strip .sector").forEach((el) => {
    const n = Number(el.dataset.sector);
    el.classList.toggle("active", n === activeSector);

    // Sector boundaries are fixed for the whole lap (computed once from the
    // sector sliders at Start / when the target lap time is adjusted), so
    // this is just where elapsed sits within that fixed [start, end] window
    // — a completed sector reads 100%, an unreached one reads 0%.
    let fraction;
    if (n < activeSector) {
      fraction = 1;
    } else if (n > activeSector) {
      fraction = 0;
    } else {
      const sectorStart = n === 1 ? 0 : state.sectorBoundaries[n - 2] || 0;
      const sectorEnd = state.sectorBoundaries[n - 1] || 0;
      const duration = sectorEnd - sectorStart;
      fraction = duration > 0 ? Math.min(1, Math.max(0, (elapsed - sectorStart) / duration)) : 0;
    }

    const bar = document.getElementById(`sector-progress-${n}`);
    if (bar) bar.style.width = `${fraction * 100}%`;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
