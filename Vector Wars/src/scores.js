// 80s-style top-10 high score table, kept in localStorage (per device, no
// security). Seeded with arcade "CPU" entries so the board is never empty.

const KEY = 'vector-wars-highscores';
export const SIZE = 10;
export const INITIALS = 3;

// Characters for initials: cycle with ▲▼ or type them.
export const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.-*#@&$%+=<>/_ ';

const SEED = [
  ['VEC', 20000], ['TOR', 17500], ['WAR', 15000], ['NEO', 12500], ['GRD', 10000],
  ['ZAP', 8000], ['BIT', 6000], ['PXL', 4000], ['CRT', 2500], ['ACE', 1000],
].map(([initials, score]) => ({ initials, score, cpu: true }));

export function loadScores() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(list) && list.every((e) => typeof e.initials === 'string' && Number.isFinite(e.score))) {
      return list.slice(0, SIZE);
    }
  } catch { /* storage unavailable or corrupt: fall back to the seed */ }
  return SEED.map((e) => ({ ...e }));
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

// Where a score would land (0 = top), or -1 if it doesn't make the board.
export function rankFor(score, list = loadScores()) {
  if (score <= 0) return -1;
  const i = list.findIndex((e) => score > e.score);
  if (i >= 0) return i;
  return list.length < SIZE ? list.length : -1;
}

// Inserts a score and returns its index on the board.
export function addScore(initials, score) {
  const list = loadScores(), i = rankFor(score, list);
  if (i < 0) return -1;
  list.splice(i, 0, { initials: initials.slice(0, INITIALS), score, date: new Date().toISOString().slice(0, 10) });
  save(list.slice(0, SIZE));
  return i;
}

export const ordinal = (i) => ['1ST', '2ND', '3RD'][i] || `${i + 1}TH`;
