// 80s-style top-10 high score table.
//
// Global when CFG.LEADERBOARD has a Supabase URL + key (see LEADERBOARD.md):
// scores live in the vector_wars_scores table, read and appended through
// Supabase's REST API (no SDK). Anyone can read or add a score; nobody can
// edit or delete one. Otherwise, and whenever the network is down, the board
// falls back to a copy in localStorage, and scores saved offline are queued
// and sent on the next successful fetch.
//
// Empty slots are filled with arcade "CPU" entries so the board is never bare.

import { CFG } from './config.js';

export const SIZE = 10;
export const INITIALS = 3;

// Characters for initials: cycle with ▲▼ or type them.
export const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.-*#@&$%+=<>/_ ';

const CACHE_KEY = 'vector-wars-highscores';      // last known board (local mode: the board itself)
const PENDING_KEY = 'vector-wars-pending-scores'; // global scores that failed to send
const TABLE = 'vector_wars_scores';
const TIMEOUT_MS = 3000;

const SEED = [
  ['VEC', 20000], ['TOR', 17500], ['WAR', 15000], ['NEO', 12500], ['GRD', 10000],
  ['ZAP', 8000], ['BIT', 6000], ['PXL', 4000], ['CRT', 2500], ['ACE', 1000],
].map(([initials, score]) => ({ initials, score, cpu: true }));

const remote = () => CFG.LEADERBOARD && CFG.LEADERBOARD.url && CFG.LEADERBOARD.key ? CFG.LEADERBOARD : null;
export const isGlobal = () => !!remote();

// ---- local storage helpers ----
function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v.filter((e) => e && typeof e.initials === 'string' && Number.isFinite(e.score)) : null;
  } catch { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

// Real scores first, CPU entries fill any gaps, best 10 by score.
function withSeed(list) {
  return [...list, ...SEED].sort((a, b) => b.score - a.score).slice(0, SIZE);
}

// The board as last seen on this device, plus any scores still waiting to
// send (instant; used for the title screen, the HUD and offline play).
export function cachedScores() {
  return withSeed([...(read(CACHE_KEY) || []).filter((e) => !e.cpu), ...(read(PENDING_KEY) || [])]);
}

// ---- Supabase REST ----
async function request(path, opts = {}) {
  const { url, key } = remote();
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...opts,
      signal: ctrl.signal,
      headers: { apikey: key, 'Content-Type': 'application/json', ...opts.headers },
    });
    if (!res.ok) throw new Error(`leaderboard ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function postScore(entry) {
  await request(TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ initials: entry.initials, score: entry.score }),
  });
}

async function flushPending() {
  const pending = read(PENDING_KEY) || [];
  const left = [];
  for (const e of pending) {
    try { await postScore(e); } catch { left.push(e); }
  }
  write(PENDING_KEY, left);
}

// Fresh board: global when configured and reachable, otherwise the cache.
export async function fetchScores() {
  if (!remote()) return cachedScores();
  try {
    await flushPending();
    const res = await request(`${TABLE}?select=initials,score&order=score.desc,created_at.asc&limit=${SIZE}`);
    write(CACHE_KEY, (await res.json()).map((r) => ({ initials: r.initials, score: r.score })));
    return cachedScores();
  } catch {
    return cachedScores();
  }
}

// Where a score would land (0 = top), or -1 if it doesn't make the board.
export function rankFor(score, list = cachedScores()) {
  if (score <= 0) return -1;
  const i = list.findIndex((e) => score > e.score);
  if (i >= 0) return i;
  return list.length < SIZE ? list.length : -1;
}

// Saves a score and returns the fresh board plus where the new entry sits.
export async function submitScore(initials, score) {
  const entry = { initials: initials.slice(0, INITIALS), score };
  if (remote()) {
    try { await postScore(entry); } catch { write(PENDING_KEY, [...(read(PENDING_KEY) || []), entry]); }
    const list = await fetchScores();
    return { list, index: list.findIndex((e) => !e.cpu && e.initials === entry.initials && e.score === score) };
  }
  const list = cachedScores().filter((e) => !e.cpu);
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  write(CACHE_KEY, list.slice(0, SIZE));
  const board = cachedScores();
  return { list: board, index: board.findIndex((e) => !e.cpu && e.initials === entry.initials && e.score === score) };
}

export const ordinal = (i) => ['1ST', '2ND', '3RD'][i] || `${i + 1}TH`;
