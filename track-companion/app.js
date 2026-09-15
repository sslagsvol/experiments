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
  lapCount: 1,
  tickHandle: null,
  recordedLaps: [],      // {timestamp, car, lapTimeSeconds}, newest first
};

const SLIDER_BIAS_STRENGTH = 0.4; // max +/-40% share shift at full slider deflection
const LAP_LOG_STORAGE_KEY = "trackCompanionRecordedLaps";

init();

function init() {
  state.track = TRACK_DATA;
  state.recordedLaps = loadRecordedLaps();

  renderCarOptions();
  wireSetupScreen();
  wireDriveScreen();
  wirePauseMenu();
  recomputeSchedule();
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
  const lapTimeInput = document.getElementById("lap-time-input");
  const errorEl = document.getElementById("setup-error");

  lapTimeInput.addEventListener("focus", () => lapTimeInput.select());

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
    const seconds = parseLapTime(lapTimeInput.value);
    if (seconds === null) {
      errorEl.textContent = "Enter a lap time like 1:54.0 or 114.0";
      return;
    }
    errorEl.textContent = "";
    state.targetLapSeconds = seconds;
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

function parseLapTime(raw) {
  const s = raw.trim();
  const mmss = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (mmss) {
    const minutes = Number(mmss[1]);
    const seconds = Number(mmss[2]);
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  const plain = /^\d+(\.\d+)?$/.exec(s);
  if (plain) return Number(s);
  return null;
}

/* ---------------------------------------------------------------------- */
/* Proportional schedule (sector sliders -> scaled complex timestamps)    */
/* ---------------------------------------------------------------------- */

function recomputeSchedule() {
  const { sectors, complexes } = state.track;
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

  state.scaledComplexes = complexes.map((c) => {
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
  document.getElementById("lap-btn").addEventListener("click", onLap);
  document.getElementById("stop-btn").addEventListener("click", goToSetupScreen);
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
    const input = document.getElementById("adjust-lap-input");
    input.value = formatTime(state.targetLapSeconds);
    document.getElementById("adjust-lap-error").textContent = "";
    document.getElementById("adjust-lap-section").hidden = false;
    input.focus();
    input.select();
  });

  document.getElementById("adjust-lap-apply").addEventListener("click", () => {
    const input = document.getElementById("adjust-lap-input");
    const errorEl = document.getElementById("adjust-lap-error");
    const seconds = parseLapTime(input.value);
    if (seconds === null) {
      errorEl.textContent = "Enter a lap time like 1:54.0 or 114.0";
      return;
    }
    state.targetLapSeconds = seconds;
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
      <span>${escapeHtml(lap.car)} · ${timeStr}</span>
      <span class="lap-time-value">${formatTime(lap.lapTimeSeconds)}</span>
    `;
    list.appendChild(row);
  });
}

function startTimer() {
  state.running = true;
  state.paused = false;
  state.lapCount = 1;
  state.lapStartMs = performance.now();
  state.pausedAtElapsed = 0;
  document.getElementById("lap-count").textContent = state.lapCount;
  updateElapsedReadout(0);
  tick();
}

function stopTimer() {
  state.running = false;
  state.paused = false;
  if (state.tickHandle) cancelAnimationFrame(state.tickHandle);
  document.getElementById("pause-overlay").hidden = true;
}

function onLap() {
  state.lapCount += 1;
  document.getElementById("lap-count").textContent = state.lapCount;
  resetLapClock();
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
    updateElapsedReadout(elapsed);
    updateSectorHighlight(elapsed);
    renderCardStack(elapsed);
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

function renderCardStack(elapsed) {
  const list = state.scaledComplexes;
  if (list.length === 0) return;
  const idx = currentIndex(elapsed);
  // Before the first complex of the lap, idx is -1: treat complex 0 as the
  // current/upcoming slot rather than wrapping back to the previous lap's
  // last complex.
  const base = idx === -1 ? 0 : idx;

  const order = [];
  const visibleCount = Math.min(list.length, 3);
  for (let i = 0; i < visibleCount; i++) {
    const wrapped = (base + i) % list.length;
    order.push({ complex: list[wrapped], slot: i });
  }

  const stack = document.getElementById("card-stack");
  stack.innerHTML = "";
  order.forEach(({ complex, slot }) => {
    stack.appendChild(renderCard(complex, slot));
  });
}

function renderCard(complex, slot) {
  const card = document.createElement("div");
  const slotClass = slot === 0 ? "current" : `next-${slot}`;
  card.className = `corner-card ${slotClass}`;

  const gearDigit = (complex.gear.match(/\d/) || ["-"])[0];

  const notes = [];
  if (complex.note) notes.push(`<li>${escapeHtml(complex.note)}</li>`);
  if (complex.curb_note) notes.push(`<li class="curb-note">${escapeHtml(complex.curb_note)}</li>`);

  card.innerHTML = `
    <div class="gear-number">${gearDigit}</div>
    <div class="card-body">
      <div class="corner-range">TURN ${escapeHtml(complex.corners.replace("T", ""))}</div>
      <div class="complex-name">${escapeHtml(complex.name)}</div>
      <ul class="notes">${notes.join("")}</ul>
    </div>
  `;
  return card;
}

function updateSectorHighlight(elapsed) {
  const idx = currentIndex(elapsed);
  const activeSector = idx >= 0 ? state.scaledComplexes[idx].sector : 1;
  document.querySelectorAll("#sector-strip .sector").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.sector) === activeSector);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
