// The story, in shot order, timed to the soundtrack (61.49 s), and the beat
// grid the film is cut and scored on.
//
// Shot boundaries sit on bar lines of the grid. The drop is the 35.87 cut
// (beat 64): the gate opens on that downbeat and the army pours in.
//
// Shots load in the background: `await ready` before reading `shots`. A shot
// whose module fails to import (for example mid-edit) is replaced by a
// placeholder, so one broken file never breaks the whole timeline.
//
// Shot and kit modules may import the beat grid and the timing table from
// here (BEATS, beatAt, beatOf, barAt, beatsIn, START, END). This module has no
// top-level await, so that import cannot deadlock. Never read `shots` at
// import time: it is empty until `ready` resolves.

export const DURATION = 61.49;

const FILES = [
  ['s01', 4.62, './shots/s01-coast.js'],
  ['s02', 4.46, './shots/s02-horse.js'],
  ['s03', 6.76, './shots/s03-gate.js'],
  ['s04', 4.49, './shots/s04-inside.js'],
  ['s05', 4.31, './shots/s05-night.js'],
  ['s06', 6.71, './shots/s06-descend.js'],
  ['s07', 4.52, './shots/s07-inner-gate.js'],
  ['s08', 4.49, './shots/s08-army.js'],
  ['s09', 4.50, './shots/s09-statue.js'],
  ['s10', 6.78, './shots/s10-zeus.js'],
  ['s11', 6.66, './shots/s11-escape.js'],
  ['s12', 3.19, './shots/s12-finale.js'],
];

// ------------------------------------------------------------------ timing
// Global start and end of every shot (seconds), known at import time.
const r9 = (x) => Math.round(x * 1e9) / 1e9;
export const START = {};
export const END = {};
{ let t = 0; for (const [id, dur] of FILES) { START[id] = r9(t); t += dur; END[id] = r9(t); } }

// ------------------------------------------------------------------ beat grid
// The canonical beat grid (production standard 12). The original score that
// replaces the soundtrack is composed exactly on it, so beat-locked action is
// scheduled from beatAt(n) - START[id], never from a formula or hard-coded
// seconds.
//
// Anchors are the shot boundaries that fall on beats, each with its beat
// number (bar lines: 4 beats a bar). The tempo is constant between anchors and
// steps by at most 2.4% at an anchor (106.2-109.1 BPM). Before the first
// anchor and after the last, the neighbouring tempo continues. The grid covers
// 0..61.49 s with beats 0..109 (beat 0 at 0.16 s, beat 109 at 61.075 s).
//
// Against the current soundtrack (librosa beat track,
// evidence/tmp/review/R-continuity/beats.json) the grid is within 16 ms at
// every anchor; RMS 41 ms over all beats. It drifts by more than 40 ms only
// where the soundtrack's own phase wanders: 0.7-1.8 s (free intro, up to
// 79 ms), 10.8-11.9 s (48), 18.6 s (44), 20.2-23.5 s (108: the soundtrack
// skips a third of a beat near 19.4 s, which no constant tempo between the
// 15.84 and 24.64 cuts can follow), 55.5-56.1 s (52) and 57.7-61.1 s (146:
// the 58.30 cut sits between the track's two competing beat phases, 58.20 and
// 58.38). The 20.33 cut (s05) is not on a beat: it falls 0.09 s after beat 36.
// notes/status-L1a.md has the full table.
export const BEAT_ANCHORS = Object.freeze([
  [8, 4.62], [16, 9.08], [28, 15.84], [44, 24.64], [56, 31.35], [64, 35.87],
  [72, 40.36], [80, 44.86], [92, 51.64], [104, 58.30],
].map((a) => Object.freeze(a)));

export const BAR = 4;   // beats per bar; bar m starts on beat BAR * m

function segment(n) {
  const A = BEAT_ANCHORS;
  let i = 0;
  while (i < A.length - 2 && n > A[i + 1][0]) i++;
  return [A[i], A[i + 1]];
}

// Global time (s) of beat n. Fractional n gives the time inside the beat
// (beatAt(n + 0.5) is the off-beat); n outside 0..109 extrapolates.
export function beatAt(n) {
  const [[n0, t0], [n1, t1]] = segment(n);
  return t0 + ((n - n0) * (t1 - t0)) / (n1 - n0);
}

// Beat number (fractional) at global time T: the inverse of beatAt.
export function beatOf(T) {
  const A = BEAT_ANCHORS;
  let i = 0;
  while (i < A.length - 2 && T > A[i + 1][1]) i++;
  const [n0, t0] = A[i], [n1, t1] = A[i + 1];
  return n0 + ((T - t0) * (n1 - n0)) / (t1 - t0);
}

// Global time of the downbeat of bar m (bar 0 starts on beat 0).
export function barAt(m) { return beatAt(m * BAR); }

// Every beat in 0..DURATION: BEATS[n] === beatAt(n).
export const BEATS = Object.freeze((() => {
  const out = [];
  for (let n = 0; beatAt(n) <= DURATION + 1e-9; n++) if (beatAt(n) >= 0) out[n] = beatAt(n);
  return out;
})());

// Downbeats (bar lines), global seconds: DOWNBEATS[m] === barAt(m).
export const DOWNBEATS = Object.freeze(BEATS.filter((_, n) => n % BAR === 0));

// The beats inside shot `id`, in order: [{ n, t (shot-local s), T (global s),
// down (true on a bar line) }]. A beat on the shot's first frame is included,
// one on its last boundary belongs to the next shot.
export function beatsIn(id) {
  const a = START[id], b = END[id];
  if (a === undefined) return [];
  const out = [];
  for (let n = 0; n < BEATS.length; n++) {
    const T = BEATS[n];
    if (T >= a - 1e-6 && T < b - 1e-6) out.push({ n, t: Math.max(0, T - a), T, down: n % BAR === 0 });
  }
  return out;
}

// ------------------------------------------------------------------ shots
function placeholder(id, dur, err) {
  return {
    id, dur, night: true, caption: '', broken: String(err),
    cam: [{ t: 0, x: 800, y: 450, w: 1600, h: 900 }],
    items: [{ actor: 'err', depth: 1, draw(ctx) {
      ctx.fillStyle = '#081668'; ctx.fillRect(-2000, -2000, 6000, 6000);
      ctx.fillStyle = '#efe7dc'; ctx.font = '28px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${id} failed to load`, 800, 430);
      ctx.font = '16px monospace'; ctx.fillText(String(err).slice(0, 120), 800, 470);
    } }],
  };
}

export const shots = [];   // filled in shot order when `ready` resolves

export const chapters = [
  { n: 'I', title: 'THE OFFERING', t: 0 },
  { n: 'II', title: 'THE GIFT', t: 9.08 },
  { n: 'III', title: 'THE DECEPTION', t: 20.33 },
  { n: 'IV', title: 'THE FALL', t: 35.87 },
  { n: 'V', title: 'THE ESCAPE', t: 51.64 },
];

export const story = { shots, chapters, duration: DURATION, beats: BEATS };

// Resolves to `story` once every shot module has loaded (or been replaced by
// a placeholder).
export const ready = (async () => {
  const loaded = await Promise.allSettled(FILES.map(([, , f]) => import(f)));
  loaded.forEach((r, i) => {
    const [id, dur, file] = FILES[i];
    let s;
    if (r.status === 'rejected') { console.error(`[story] ${id}:`, r.reason); s = { ...placeholder(id, dur, r.reason), file }; }
    else {
      const m = r.value.default;
      if (Math.abs(m.dur - dur) > 1e-6) console.warn(`[story] ${id} dur ${m.dur} != planned ${dur}; using planned`);
      s = { ...m, dur, file };
    }
    s.start = START[id]; s.end = END[id];
    shots.push(s);
  });
  return story;
})();

// ------------------------------------------------------------------ caption washes
// Strength of the ink wash behind each caption (0.3 night sky .. 1 sunlit
// stone), measured from the plate behind the words by `node tools/washes.mjs`
// (the real app at 1440x900 'l' and 390x844@2 'p'), so playback never reads
// the canvas back. Key `${shot}|${caption}|${pos}|${l|p}` -> [[local t, k], ...].
// The app interpolates in t; a caption missing here uses a default until it
// is measured while paused. Re-run the tool after changing a shot.
// BEGIN CAPTION_WASH (generated by tools/washes.mjs; do not edit by hand)
export const CAPTION_WASH = {
  's01|BEWARE GEEKS BEARING GIFTS|top|l': [[0.08,0.39],[4.54,0.44]],
  's01|BEWARE GEEKS BEARING GIFTS|top|p': [[0.08,0.38],[4.54,0.4]],
  's02|BEWARE GEEKS BEARING GIFTS|top|l': [[0.08,0.38],[4.38,0.38]],
  's02|BEWARE GEEKS BEARING GIFTS|top|p': [[0.08,0.38],[4.38,0.38]],
  's03|THE TROJANS OPEN THE GATE|top|l': [[0.08,0.7],[6.68,0.7]],
  's03|THE TROJANS OPEN THE GATE|top|p': [[0.08,0.7],[6.68,0.7]],
  's04|THE GIFT IS TAKEN INSIDE|bottom|l': [[0.08,0.7],[3.79,0.7],[4.41,0.3]],
  's04|THE GIFT IS TAKEN INSIDE|bottom|p': [[0.08,0.7],[3.79,0.7],[4.41,0.3]],
  's05|NIGHT FALLS WITHIN THE WALLS|bottom|l': [[0.08,0.3],[0.67,0.7],[4.23,0.7]],
  's05|NIGHT FALLS WITHIN THE WALLS|bottom|p': [[0.08,0.3],[0.67,0.7],[4.23,0.7]],
  's06|ODYSSEUS DESCENDS|top|l': [[0.08,0.52],[0.68,0.63],[1.27,0.49],[1.87,0.4],[2.46,0.67],[3.06,0.51],[3.65,0.58],[4.25,0.3],[6.63,0.32]],
  's06|ODYSSEUS DESCENDS|top|p': [[0.08,0.3],[6.63,0.3]],
  's07|THE GATE OPENS FROM WITHIN|bottom|l': [[0.08,0.7],[4.44,0.7]],
  's07|THE GATE OPENS FROM WITHIN|top|p': [[0.08,0.3],[4.44,0.3]],
  's08|TROY BURNS|bottom|l': [[0.08,0.3],[1.94,0.3],[2.55,0.7],[4.41,0.7]],
  's08|TROY BURNS|bottom|p': [[0.08,0.43],[0.7,0.7],[4.41,0.7]],
  's09|TROY BURNS|bottom|l': [[0.08,0.7],[4.42,0.7]],
  's09|TROY BURNS|bottom|p': [[0.08,0.7],[4.42,0.7]],
  's10|ZEUS SEES THE BROKEN GUEST-LAW|bottom|l': [[0.08,0.3],[6.7,0.3]],
  's10|ZEUS SEES THE BROKEN GUEST-LAW|bottom|p': [[0.08,0.3],[4.29,0.32],[4.89,0.39],[5.5,0.32],[6.7,0.32]],
  's11|AENEAS CARRIES HIS FATHER OUT|bottom|l': [[0.08,0.3],[0.67,0.7],[6.58,0.7]],
  's11|AENEAS CARRIES HIS FATHER OUT|bottom|p': [[0.08,0.31],[0.67,0.7],[6.58,0.7]],
};
// END CAPTION_WASH
