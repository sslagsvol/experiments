"use strict";

/* ==========================================================================
   Track Companion — app logic
   Loads the Monza timing template, lets the driver bias it with sector
   sliders, then drives a proportional-scaling timer that fires on-screen +
   spoken callouts per complex. See docs/PROJECT_PLAN.md for the mechanic.
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
  announcedIndex: -1,    // index into scaledComplexes of last-announced complex
  tickHandle: null,
};

const SLIDER_BIAS_STRENGTH = 0.4; // max +/-40% share shift at full slider deflection

init();

async function init() {
  const res = await fetch("data/monza-corners.json");
  state.track = await res.json();

  renderCarOptions();
  wireSetupScreen();
  wireDriveScreen();
  recomputeSchedule();
}

/* ---------------------------------------------------------------------- */
/* Setup screen                                                           */
/* ---------------------------------------------------------------------- */

function renderCarOptions() {
  const row = document.getElementById("car-options");
  const carIds = Object.keys(state.track.cars);
  state.selectedCarId = carIds[0];

  row.innerHTML = "";
  carIds.forEach((id) => {
    const car = state.track.cars[id];
    const el = document.createElement("div");
    el.className = "option" + (id === state.selectedCarId ? " selected" : "");
    el.textContent = car.display_name;
    el.dataset.carId = id;
    row.appendChild(el);
  });

  row.addEventListener("click", (e) => {
    const opt = e.target.closest(".option");
    if (!opt) return;
    row.querySelectorAll(".option").forEach((o) => o.classList.remove("selected"));
    opt.classList.add("selected");
    state.selectedCarId = opt.dataset.carId;
  });
}

function wireSetupScreen() {
  const lapTimeInput = document.getElementById("lap-time-input");
  const errorEl = document.getElementById("setup-error");

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
  const readout = document.getElementById("drive-lap-time");
  if (readout) readout.textContent = formatTime(state.targetLapSeconds);
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
  document.getElementById("pause-btn").addEventListener("click", onPauseToggle);
  document.getElementById("exit-btn").addEventListener("click", goToSetupScreen);
}

function startTimer() {
  state.running = true;
  state.paused = false;
  state.lapCount = 1;
  state.lapStartMs = performance.now();
  state.pausedAtElapsed = 0;
  state.announcedIndex = -1;
  document.getElementById("lap-count").textContent = state.lapCount;
  document.getElementById("pause-btn").textContent = "Pause";
  tick();
}

function stopTimer() {
  state.running = false;
  if (state.tickHandle) cancelAnimationFrame(state.tickHandle);
  window.speechSynthesis.cancel();
}

function onLap() {
  state.lapCount += 1;
  document.getElementById("lap-count").textContent = state.lapCount;
  state.lapStartMs = performance.now();
  state.pausedAtElapsed = 0;
  state.announcedIndex = -1;
}

function onPauseToggle() {
  const btn = document.getElementById("pause-btn");
  if (!state.paused) {
    state.paused = true;
    state.pausedAtElapsed = elapsedSeconds();
    btn.textContent = "Resume";
  } else {
    state.paused = false;
    state.lapStartMs = performance.now() - state.pausedAtElapsed * 1000;
    btn.textContent = "Pause";
  }
}

function elapsedSeconds() {
  if (state.paused) return state.pausedAtElapsed;
  return (performance.now() - state.lapStartMs) / 1000;
}

function tick() {
  if (!state.running) return;
  if (!state.paused) {
    const elapsed = elapsedSeconds();
    updateSectorHighlight(elapsed);
    renderCardStack(elapsed);
    maybeAnnounce(elapsed);
  }
  state.tickHandle = requestAnimationFrame(tick);
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

function maybeAnnounce(elapsed) {
  const idx = currentIndex(elapsed);
  if (idx >= 0 && idx !== state.announcedIndex) {
    state.announcedIndex = idx;
    speakCallout(state.scaledComplexes[idx]);
  }
}

function speakCallout(complex) {
  if (!("speechSynthesis" in window)) return;
  const parts = [complex.name, complex.gear];
  if (complex.note) parts.push(complex.note);
  const utterance = new SpeechSynthesisUtterance(parts.join(". "));
  window.speechSynthesis.speak(utterance);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
