// Fire, smoke, embers, lightning and firelight, drawn every frame in the
// language of the prints: licking, asymmetric flame tongues posterised in
// dark red, vermilion and a small broken cream core, with dark-red fold
// creases like the red cape of plate 2 and no heavy outline, animated on
// twos (12 fps) like hand-drawn anime fire; navy-black smoke as lobed
// billow masses with angular moonlit patches and red underlight near the
// fire; cream and red ember specks; a hard-edged two-tone lightning bolt;
// firelight as posterised bands (a warm multiply filter on stone and
// figures, opaque red-ramp bands on skies), never additive red over navy.
// distantFire keeps the first team's approved 'classic' flames and smoke
// for close views.
//
// Every function is a pure function of time (shot-local e.t, or o.time) and
// its seed, so scrubbing is exact. Conventions: x is the centre and y the
// base (bottom) of the effect, except distantFire, whose x is the left edge.
// Shapes are batched into one path per colour. flames() also accepts an
// array of specs: the cheap way to draw many fires in one call. Fires and
// smoke columns are cached as bitmaps per 12 fps step (see the step cache).

import { C } from './palette.js';
import { RNG, hashStr, clamp, lerp, smooth } from '../engine/rng.js';

const TAU = Math.PI * 2;
const INK = '#1a0402'; // dark red-black ink, as on the red cape of plate 2

// ---------------------------------------------------------------- helpers
const seedOf = (s, fb = 0) => (typeof s === 'number' ? s | 0 : typeof s === 'string' ? hashStr(s) : fb) >>> 0;

// integer hash -> [0, 1)
function h1(a, b = 0) {
  let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
// smooth 1-D value noise in [0, 1)
function vn(x, s) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h1(i, s), h1(i + 1, s), u);
}
const fract = (v) => v - Math.floor(v);

const memoMap = new Map();
function memo(key, make) {
  let v = memoMap.get(key);
  if (v === undefined) { if (memoMap.size > 4000) memoMap.clear(); v = make(); memoMap.set(key, v); }
  return v;
}

function rgbOf(c) {
  return memo(`rgb:${c}`, () => {
    const s = c.replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
}
// Mix two hex colours (memoised).
export function mixHex(a, b, t) {
  const q = Math.round(clamp(t) * 32) / 32;
  return memo(`mix:${a}:${b}:${q}`, () => {
    const A = rgbOf(a), B = rgbOf(b);
    const c = (i) => Math.round(A[i] + (B[i] - A[i]) * q).toString(16).padStart(2, '0');
    return `#${c(0)}${c(1)}${c(2)}`;
  });
}

// Time on twos: the frame index at 12 fps (6 fps and calmer when reduced).
function frameOf(e, o, fps = 12) {
  const t = o.time ?? e.t ?? 0;
  return Math.floor(t * (e.reduced ? fps / 2 : fps) + 1e-4);
}
const tq = (e, o, fps = 12) => frameOf(e, o, fps) / (e.reduced ? fps / 2 : fps);

// Typical flicker envelope for a lightning strike at t0: a bright stroke,
// a short dip, one re-stroke, then decay. At most two flashes per strike,
// so strikes 2 s apart stay under three flashes a second. With reduced
// motion: a single soft rise and fade, no flicker.
export function strike(t, t0, o = {}) {
  const d = t - t0;
  const len = o.len ?? 0.62;
  if (d < 0 || d > len) return 0;
  if (o.reduced) return 0.55 * Math.sin(Math.PI * d / len);
  if (d < 0.07) return 1;
  if (d < 0.13) return 0.25;
  if (d < 0.21) return 0.9;
  return 0.9 * Math.pow(1 - (d - 0.21) / (len - 0.21), 1.6);
}

// ---------------------------------------------------------------- step cache
// Fire and smoke change only on twos, so each fire (or cluster of touching
// fires) and each smoke column is rasterised once per 12 fps step into a
// small offscreen bitmap at device resolution, aligned with the device
// pixels when it is made, and blitted on the frames in between (production
// standard 17). Every effect steps at its own phase within the 1/12 s (from
// its seed), so the re-renders of many effects spread over the display
// frames instead of all landing on one. An effect whose bitmap would be
// huge, or that is drawn under a rotated or skewed transform, draws
// directly.
//
// Each bitmap belongs to the SHOT that draws it: it comes from the actor
// environment's `e.cache(key, w, h)` (engine/stage.js), which the stage
// frees with the shot's plates, so the fires of a shot that has left
// residency do not sit in iOS Safari's canvas budget (the module-level pool
// this replaces kept 10.5 Mpx alive at the end card). A canvas grows only,
// with slack, so a growing effect keeps one canvas, and every frame asks
// for the same allocated size, so the stage never resizes (and clears) it
// under us. An effect drawn with a stand-in environment that has no
// `e.cache` (a probe, a bake-time painter) keeps a canvas of its own, which
// the sweep below releases 2 s after its last use. Nothing is kept past
// SC_AGE unused in either case.
const SC_MAX = 2.5e6;     // device px: a bigger bitmap draws directly
const SC_AGE = 2000;      // ms unused before a bitmap's pixels are released
const SC_SWEEP = 400;     // ms between sweeps
const SC_NEW = 6;         // new bitmaps a frame
const SC_OWN = 12e6;      // px budget for bitmaps we own (no e.cache)
const scache = new Map();
let scSweep = 0, scFrame = -1e9, scNew = 0, scOwn = 0;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);

// Release an entry's pixels: its canvas is zeroed, which is what the stage
// itself does when it frees a shot's canvases, so this works for a canvas
// of our own and for one the shot owns (the stage keeps the 0x0 and lets go
// of it with the shot; the next e.cache call reports it as `fresh`).
function scFree(E) {
  const c = E.cv;
  if (c) { if (E.own) scOwn -= c.width * c.height; if (c.width) { c.width = 0; c.height = 0; } }
  E.cv = null; E.own = false; E.aW = 0; E.aH = 0; E.empty = true;
}
function scTrim(t, keep, age = SC_AGE) {
  for (const [k, E] of scache) {
    if (E === keep || t - E.use < age) continue;
    scFree(E); scache.delete(k);
  }
  if (scOwn <= SC_OWN) return;
  // over the budget for bitmaps we own, the least recently used go first
  // (never the ones drawn in the last few frames: memory gives way, not playback)
  const all = [...scache.entries()].filter(([, E]) => E !== keep && E.own && t - E.use > 150).sort((a, b) => a[1].use - b[1].use);
  for (const [k, E] of all) { if (scOwn <= SC_OWN * 0.8) break; scFree(E); scache.delete(k); }
}

// The bitmap of entry E at W x H device px, grown (with slack) only. A
// shot-owned bitmap is re-fetched through e.cache on every use, so a canvas
// the stage has freed under us is noticed (`fresh`) instead of drawn into.
function scCanvas(E, cacheFn, key, W, H) {
  if (E.aW >= W && E.aH >= H && E.cv) {
    if (E.own) return E.cv;
    const c = cacheFn(key, E.aW, E.aH);
    E.cv = c;
    if (c.fresh) E.empty = true;        // the stage freed or resized it: it is blank
    return c;
  }
  const aW = Math.max(E.aW, Math.ceil(W * 1.15) + 2), aH = Math.max(E.aH, Math.ceil(H * 1.15) + 2);
  scFree(E);
  E.aW = aW; E.aH = aH;
  if (cacheFn) { E.cv = cacheFn(key, aW, aH); return E.cv; }
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
  c.width = aW; c.height = aH;
  scOwn += aW * aH; E.own = true; E.cv = c;
  return c;
}

// Draw an effect from its bitmap for step F, rendering it first when the
// step (or the scale, by more than 3%) changed. render(sink) computes the
// effect, calls sink({ x, y, w, h }) with its world bounds, and draws into
// the context sink returns (it returns null when the effect must draw
// directly). Returns false when the caller must draw it directly.
function stepCached(ctx, e, key, F, render) {
  if (!ctx.getTransform) return false;
  const m = ctx.getTransform(), sc = m.a;
  if (!(sc > 0) || Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9 || Math.abs(m.d - sc) > sc * 1e-6 || ctx.canvas.width < 64) return false;
  // the shot owns its bitmaps, so one shot's keys never meet another's
  const cacheFn = typeof e.cache === 'function' ? e.cache : null;
  const ck = 'fx:' + key;                 // the shot's cache keys are its own: ours are all prefixed
  const mk = `${(e.shot && e.shot.id) || ''}|${key}`;
  let E = scache.get(mk);
  if (E && E.big && E.F === F) return false;
  const t = nowMs();
  // at most SC_NEW new bitmaps a frame (a cut brings dozens of effects at
  // once): the rest draw directly this frame and are cached on later ones
  if (t - scFrame > 6) { scFrame = t; scNew = 0; }
  if (!E && scNew >= SC_NEW) return false;
  let cv = null;
  if (!E || E.F !== F || Math.abs(E.sc - sc) > E.sc * 0.03) {
    if (!E) { E = { cv: null, own: false, aW: 0, aH: 0, uW: 0, uH: 0, F, sc, x0: 0, y0: 0, use: t, empty: true, big: false }; scache.set(mk, E); scNew++; }
    E.F = F; E.sc = sc; E.empty = true; E.big = false;
    render((bb) => {
      const dx0 = Math.floor(sc * bb.x + m.e) - 1, dy0 = Math.floor(sc * bb.y + m.f) - 1;
      const W = Math.ceil(sc * (bb.x + bb.w) + m.e) + 1 - dx0, H = Math.ceil(sc * (bb.y + bb.h) + m.f) + 1 - dy0;
      if (!(W > 0 && H > 0)) return null;
      if (W * H > SC_MAX) { E.big = true; return null; }
      cv = scCanvas(E, cacheFn, ck, W, H);
      if (!cv) { E.big = true; return null; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, Math.max(W, E.uW), Math.max(H, E.uH));   // and what the last render left
      g.setTransform(sc, 0, 0, sc, m.e - dx0, m.f - dy0);
      E.uW = W; E.uH = H; E.x0 = (dx0 - m.e) / sc; E.y0 = (dy0 - m.f) / sc; E.empty = false;
      return g;
    });
    if (E.big) { scFree(E); return false; }
    if (t - scSweep > SC_SWEEP) { scSweep = t; scTrim(t, E); }
  }
  E.use = t;
  if (E.empty) return true;
  if (!cv) {
    cv = scCanvas(E, cacheFn, ck, E.uW, E.uH);
    if (E.empty) { E.F = -1e9; return false; }   // the stage freed it: draw directly, re-render next frame
  }
  ctx.drawImage(cv, 0, 0, E.uW, E.uH, E.x0, E.y0, E.uW / E.sc, E.uH / E.sc);
  return true;
}

// Step-cache contents, for perf checks: { entries, ownMpx } (bitmaps owned
// by a shot are the stage's, so they are counted there, not here).
export function fxCacheInfo() {
  let own = 0, shot = 0;
  for (const E of scache.values()) { if (!E.cv) continue; if (E.own) own += E.cv.width * E.cv.height; else shot += E.aW * E.aH; }
  return { entries: scache.size, ownMpx: +(own / 1e6).toFixed(2), shotMpx: +(shot / 1e6).toFixed(2) };
}
// Release every step bitmap unused for `age` ms (0 = all of them). The sweep
// runs by itself while fire or smoke is on screen; a tool or a host that
// stops drawing (the end card) can call this to let go at once.
export function fxTrim(age = 0) { scTrim(nowMs(), null, age); }
// The 12 fps step of an effect at its own phase (6 fps when reduced), and
// the time it is drawn at during that step.
const stepOf = (e, o, seed) => Math.floor((o.time ?? e.t ?? 0) * (e.reduced ? 6 : 12) + h1(seed, 0x5eed) + 1e-4);
const stepTime = (e, F) => (F + 0.5) / (e.reduced ? 6 : 12);

// ---------------------------------------------------------------- flames
// Two styles share one batched entry point:
//   default ('lick'): anime / ukiyo-e city fire. A cluster of tall licking
//     tongues of irregular height, each with its own asymmetric sides, a
//     sway that travels up the tongue and a tip that often splits in two.
//     Dark red outside (an uneven margin, with some low tongues in dark red
//     only), a vermilion body, and a small cream core broken into 2-3
//     pieces. Each tongue grows for a few frames, then a piece pinches off
//     its tip and rises 0.1-0.3 H over 2-4 frames, shrinking until it
//     vanishes. The silhouette changes on every 12 fps frame.
//   'classic': the first-team flame (rounded tongues with a teardrop core
//     and a dark ink stroke). distantFire keeps it: its look is approved.

// ---- classic
function tongueSet(seed, n) {
  return memo(`tg${seed}:${n}`, () => {
    const r = new RNG(seed ^ 0x5bd1e995);
    const T = [{ bx: r.range(-0.05, 0.05), bw: r.range(0.25, 0.32), th: 1, lean: r.range(-0.12, 0.12), ph: r.range(0, TAU), P: r.int(7, 9), off: r.int(0, 8), main: true }];
    for (let i = 1; i < n; i++) {
      const side = i % 2 ? -1 : 1;
      const ad = r.range(0.1, 0.4), d = ad * side;
      T.push({ bx: d, bw: r.range(0.11, 0.2) * (1 - ad * 0.5), th: r.range(0.42, 0.82) * (1 - ad * 0.75), lean: side * r.range(0.06, 0.32), ph: r.range(0, TAU), P: r.int(5, 8), off: r.int(0, 8), main: false });
    }
    return T;
  });
}

function flameGeom(o, F, e, lod) {
  const I = clamp(o.intensity ?? 1, 0, 1.6);
  if (I <= 0.02 || !(o.w > 0) || !(o.h > 0)) return null;
  const seed = seedOf(o.seed, hashStr(`fl${o.x | 0},${o.y | 0}`));
  const W = o.w * (0.6 + 0.4 * Math.min(1, I));
  const H = o.h * Math.pow(Math.min(I, 1.6), 0.8);
  const nAll = clamp(Math.round((o.w / o.h) * 3) + 2, 3, 8);
  const n = lod === 'tiny' ? 2 : lod === 'small' ? Math.min(nAll, 4) : nAll;
  const T = tongueSet(seed, nAll);
  const amp = e.reduced ? 0.3 : 1;
  const wind = o.wind ?? 0;
  const tongues = [], licks = [];
  for (let i = 0; i < n; i++) {
    const t = T[i];
    const f = (F + t.off) % t.P, cyc = Math.floor((F + t.off) / t.P);
    const peak = 0.86 + 0.28 * h1(cyc * 17 + i, seed);
    const grow = t.P - 2;
    let hf = f < grow ? lerp(0.6, peak, f / Math.max(1, grow - 1)) : 0.56 + 0.08 * h1(F + i * 3, seed + 1);
    hf = lerp(0.8, hf, amp);
    const sway = (vn(F * 0.3 + t.ph * 5, seed + i) - 0.5) * 0.5 * amp;
    const T2 = {
      cx: o.x + t.bx * W, y: o.y, bw: t.bw * W, th: t.th * H * hf,
      lean: t.lean + wind + sway, ph: t.ph - F * 0.75 * amp, main: t.main,
    };
    tongues.push(T2);
    if (t.main && lod === 'full') for (let q = 0; q < 2; q++) { // forks off the flanks
      const side = q ? 1 : -1;
      const sh = 0.32 + 0.22 * h1(cyc * 3 + q, seed + 40);
      const s0 = sh, c0 = T2.cx + T2.lean * T2.th * s0 * s0 + T2.bw * 0.5 * Math.sin(s0 * 3.2 + T2.ph) * s0;
      const hw0 = T2.bw * Math.pow(1 - s0, 0.8) * (1 + 0.7 * s0 * (1 - s0));
      tongues.push({ cx: c0 + side * hw0 * 0.55, y: T2.y - T2.th * s0, bw: hw0 * 0.5, th: T2.th * (0.26 + 0.12 * h1(F + q, seed + 41)), lean: T2.lean + side * 0.45, ph: T2.ph + q, main: false, fork: true });
    }
    if (f >= grow && lod === 'full' && amp > 0.5) {
      const age = f - grow;
      const thp = t.th * H * peak;
      const tipX = T2.cx + T2.lean * thp + T2.bw * 0.5 * Math.sin(3.2 + T2.ph);
      const sz = H * (t.main ? 0.13 : 0.09) * (1 - 0.3 * age);
      licks.push([tipX + T2.lean * H * 0.08 * (age + 1), o.y - thp - H * 0.05 - age * H * 0.1, sz]);
    }
  }
  return { x: o.x, y: o.y, W, H, tongues, licks, I };
}

// Smooth polyline through pts with quadratic midpoints (endpoints exact).
function smoothTo(ctx, pts, first) {
  const n = pts.length;
  if (first) ctx.moveTo(pts[0][0], pts[0][1]); else ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
}

// One tongue, truncated at k of its height and narrowed by kw. Clockwise.
function tonguePath(ctx, T, k, kw, N) {
  const L = [], R = [];
  for (let j = 0; j <= N; j++) {
    const sp = j / N, s = sp * k;
    const c = T.cx + T.lean * T.th * s * s + T.bw * 0.5 * Math.sin(s * 3.2 + T.ph) * s;
    const hw = kw * T.bw * Math.pow(1 - sp, 0.8) * (1 + 0.7 * sp * (1 - sp));
    const yy = T.y - T.th * s;
    L.push([c - hw, yy]); R.push([c + hw, yy]);
  }
  smoothTo(ctx, L, true);
  R.reverse();
  smoothTo(ctx, R, false);
  ctx.quadraticCurveTo(T.cx, T.y + T.bw * 0.6 * kw, L[0][0], L[0][1]);
  ctx.closePath();
}

// Teardrop lick: round bottom at (x, y), tip above at height L.
function dropPath(ctx, x, y, r, L, lean) {
  const tx = x + lean, ty = y - L;
  ctx.moveTo(tx, ty);
  ctx.bezierCurveTo(x + r * 0.35 + lean * 0.4, y - L * 0.55, x + r * 1.15, y - r * 0.55, x, y + r * 0.35);
  ctx.bezierCurveTo(x - r * 1.15, y - r * 0.55, x - r * 0.35 + lean * 0.4, y - L * 0.55, tx, ty);
  ctx.closePath();
}

const LAYERS = [ // [k (height), kw (width), colour, min tongue height (fraction of H)]
  [1, 1, 'redDark', 0],
  [0.9, 0.8, 'red', 0],
  [0.64, 0.64, 'redHot', 0.5],
  [0.34, 0.36, 'cream', 0.9],
];

function buildClassic(G) {
  let maxH = 0;
  for (const g of G) if (g.lod !== 'tiny') maxH = Math.max(maxH, g.hpx);
  const paths = [];
  for (let li = 0; li < LAYERS.length; li++) {
    const [k, kw, , minTh] = LAYERS[li];
    const P = new Path2D();
    let any = false;
    for (const g of G) {
      if (g.lod === 'tiny' && (li === 0 || li === 2)) continue;
      const kk = g.lod === 'tiny' && li === 3 ? 0.42 : k;
      for (const T of g.tongues) {
        if (minTh && T.th < g.H * minTh * 0.75 && !T.main) continue;
        tonguePath(P, T, kk, kw, g.N); any = true;
      }
      if (li === 2 && g.lod !== 'tiny') { // a pool of heat along the base joins the cores
        const pw = g.W * 0.36, ph = g.H * 0.12;
        P.moveTo(g.x + pw, g.y); P.ellipse(g.x, g.y, pw, ph, 0, 0, TAU);
      }
      if (li < 2) for (const [lx, ly, sz] of g.licks) dropPath(P, lx, ly, sz * 0.42 * (li ? 0.7 : 1), sz * 1.5 * (li ? 0.8 : 1), sz * 0.3);
    }
    paths.push(any ? P : null);
  }
  return { paths, maxH };
}

function drawClassic(ctx, e, B) {
  const px = 1 / e.s;
  for (let li = 0; li < LAYERS.length; li++) {
    const P = B.paths[li];
    if (!P) continue;
    if (li === 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2 * clamp(B.maxH * 0.011, 0.9, 2.4) * px;
      ctx.stroke(P);
    }
    ctx.fillStyle = C[LAYERS[li][2]]; ctx.fill(P);
  }
}

// ---- lick (default)
// Static tongue set per seed: the main tongue near the centre, the others
// spread across the base with irregular heights (the inner pair close to
// the main one), mostly converging toward the top.
function lickSet(seed, n) {
  return memo(`lk${seed}:${n}`, () => {
    const r = new RNG(seed ^ 0x3c6ef372);
    const span = Math.max(1, n >> 1);
    const T = [];
    for (let i = 0; i < n; i++) {
      const main = i === 0;
      const side = i % 2 ? -1 : 1;
      const rank = (i + 1) >> 1;                     // 0 main, 1 inner pair, 2 next pair...
      const u = rank / span;                          // 0 centre .. 1 outermost
      const ad = main ? r.range(0, 0.06) : clamp(u * 0.4 + r.range(-0.07, 0.05), 0.08, 0.46);
      T.push({
        bx: (main ? r.sign() : side) * ad,
        bw: main ? r.range(0.2, 0.25) : r.range(0.13, 0.2) * (1 - u * 0.35),
        th: main ? r.range(0.95, 1.04) : rank === 1 ? r.range(0.7, 0.95) : rank === 2 ? r.range(0.45, 0.78) : r.range(0.28, 0.58),
        lean: main ? r.range(-0.1, 0.1) : side * (u > 0.8 ? r.range(-0.02, 0.16) : r.range(-0.2, 0.06)), // mostly converging
        ph: r.range(0, TAU), P: r.int(5, 9), off: r.int(0, 9),
        pL: r.range(1.3, 2.0), pR: r.range(1.3, 2.0),     // taper of each side (pointed tips)
        bL: r.range(0.3, 0.95), bR: r.range(0.3, 0.95),   // belly of each side (full lower body)
        wave: r.range(0.7, 1.25), kf: r.range(3.6, 5.6),  // sway: amplitude (x bw), wave number
        sd: r.int(1, 1 << 20), main,
      });
    }
    return T;
  });
}

// A cheap smooth wobble in ~[0, 1] for the tongue sides.
const wob = (x) => 0.5 + 0.28 * Math.sin(x * 2.3) + 0.2 * Math.sin(x * 3.9 + 1.3);

// Centre of a tongue's spine at height fraction s (0 base .. 1 tip).
const spineX = (T, s) => T.cx + T.lean * T.th * s * s + T.wave * T.bw * Math.sin(T.kf * s - T.ph) * s * (0.4 + s);

// Per-frame geometry of one fire.
function lickGeom(o, F, e, lod) {
  const I = clamp(o.intensity ?? 1, 0, 1.6);
  if (I <= 0.02 || !(o.w > 0) || !(o.h > 0)) return null;
  const seed = seedOf(o.seed, hashStr(`fl${o.x | 0},${o.y | 0}`));
  const W = o.w * (0.6 + 0.4 * Math.min(1, I));
  const H = o.h * Math.pow(Math.min(I, 1.6), 0.8);
  const nAll = clamp(Math.round((o.w / o.h) * 3.4) + 3, 4, 9);
  const full = lod === 'full', tiny = lod === 'tiny';
  const n = tiny ? 2 : lod === 'small' ? Math.min(nAll, 5) : nAll;
  const TS = lickSet(seed, nAll);
  const amp = e.reduced ? 0.35 : 1;
  const wind = o.wind ?? 0;
  const tongues = [], frags = [], cores = [];
  // tall, narrow fires: wider tongues and less lean, so no tongue becomes a blade
  const lm = Math.min(0.42, (0.55 * W) / H), bk = clamp(Math.sqrt(H / (W * 1.2)), 1, 1.7);
  for (let i = 0; i < n; i++) {
    const t = TS[i];
    const fl = F + t.off, cyc = Math.floor(fl / t.P), f = fl - cyc * t.P;
    const g = t.P - 2;                               // growth frames; the tip pinches off at f = g
    const peak = t.main ? 0.86 + 0.2 * h1(cyc * 17 + i, seed) : 0.8 + 0.36 * h1(cyc * 17 + i, seed);
    let hf = f < g ? lerp(t.main ? 0.68 : 0.6, peak, f / Math.max(1, g - 1)) : (t.main ? 0.62 : 0.52) + 0.12 * h1(fl * 3 + i, seed + 1);
    hf *= 0.92 + 0.16 * h1(fl * 7 + i, seed + 2);    // a different silhouette every frame
    hf = lerp(0.85, hf, amp);
    const th = t.th * H * hf;
    const T = {
      cx: o.x + t.bx * W * (full ? 1 : 0.72) + (h1(fl * 5 + i, t.sd) - 0.5) * W * 0.04 * amp, y: o.y,
      bw: t.bw * W * bk * (0.9 + 0.2 * h1(fl * 9 + 1, t.sd)), th,
      lean: clamp((full ? t.lean : t.lean * 0.4) + wind * (full ? 1 : 1.3) + (vn(fl * 0.4 + t.ph * 3, seed + i) - 0.5) * 0.45 * amp, -lm, lm),
      ph: t.ph - fl * 1.1 * amp, wave: t.wave * (0.3 + 0.7 * amp) * (t.main ? 0.75 : 1) * Math.min(1, (1.2 * W) / H), kf: t.kf,
      pL: t.pL, pR: t.pR, bL: t.bL, bR: t.bR,
      jL: (t.sd & 255) + fl * 0.87, jR: ((t.sd >> 8) & 255) + fl * 0.93,
      uL: 0.1 + 0.42 * h1(fl * 11 + 3, t.sd), uR: 0.1 + 0.42 * h1(fl * 13 + 7, t.sd),
      kb: 0.8 + 0.12 * h1(fl * 3 + 9, t.sd), kw: 0.74 + 0.1 * h1(fl * 17 + 2, t.sd),
      dark: !t.main && t.th < 0.42 && !tiny,          // low tongues stay dark red
      flat: true, main: t.main,
    };
    tongues.push(T);
    // a split tip: a prong peels off one flank near the top
    if ((full || (lod === 'small' && t.main)) && th > H * 0.32 && (t.main || th * e.s > 36) && h1(cyc * 7 + i, seed + 50) < 0.7) {
      const s0 = 0.48 + 0.24 * h1(cyc * 5 + i, seed + 51);
      const sd = h1(cyc * 3 + i * 7, seed + 52) < 0.5 ? -1 : 1;
      const hw = T.bw * Math.pow(1 - s0, (T.pL + T.pR) / 2) * (1 + (T.bL + T.bR) * 2 * s0 * (1 - s0));
      tongues.push({
        ...T, cx: spineX(T, s0) + sd * hw * 0.45, y: o.y - th * s0,
        bw: hw * 0.62, th: th * (1 - s0) * (0.55 + 0.4 * h1(fl * 3 + i, seed + 53)),
        lean: clamp(T.lean + sd * (0.35 + 0.3 * h1(cyc + i, seed + 54)), -lm - 0.3, lm + 0.3), wave: T.wave * 0.5,
        kb: 0.8, dark: false, flat: false, main: false,
      });
    }
    // a piece pinched off the tip rises, shrinks and vanishes (2-4 frames)
    if (!tiny && amp > 0.5 && (full || t.main)) for (let c = cyc; c >= cyc - 1; c--) {
      const age = fl - (c * t.P + g);
      const life = 2 + Math.floor(h1(c * 13 + i, seed + 60) * 3);
      if (age < 0 || age >= life) continue;
      if (!t.main && h1(c * 19 + i, seed + 61) < 0.3) continue;
      const pk = t.main ? 0.86 + 0.2 * h1(c * 17 + i, seed) : 0.8 + 0.36 * h1(c * 17 + i, seed);
      const thp = t.th * H * pk;
      const a = (age + 1) / life;
      const rise = H * (0.1 + 0.2 * h1(c * 23 + i, seed + 62)) * a;
      const sz = Math.min(thp, H) * (t.main ? 0.17 : 0.14) * (1 - 0.6 * a);
      const lean = T.lean * 0.6 + (h1(c * 29 + i, seed + 63) - 0.5) * 0.6;
      frags.push({
        ...T, cx: T.cx + T.lean * thp * 0.9 + (wind + lean * 0.5) * rise, y: o.y - thp * 0.84 - rise + sz * 0.35,
        bw: sz * 0.34, th: sz, lean, wave: 0.5, kf: 4, kb: 0.86, kw: 0.6, dark: age === life - 1 && life > 2, flat: false, lens: true, main: false,
      });
    }
  }
  // The cream core (production standard 6: SMALL and BROKEN). A torn ribbon
  // of 2-3 short islands up the axis of the tallest tongue, with a gap
  // between them, each about a tenth of the tongue's height and a quarter
  // of its local width, so no island covers more than about 8% of the
  // tongue and the cream never prints as one smooth teardrop with a clean
  // elliptical edge. The islands are jagged (high-frequency side noise, jf)
  // and shift every frame; the lowest sits on the base, the ones above
  // float with rounded bottoms. A second, shorter tongue carries one island.
  const A = tongues[0];
  const jag = (T, k) => ({ ...T, jL: T.jL * 1.7 + k * 3, jR: T.jR * 1.9 + k * 5, jg: 1, jf: 9.5, pL: 0.95 + 0.4 * h1(F + k, seed + 78), pR: 0.95 + 0.4 * h1(F + k, seed + 79), bL: 0.5, bR: 0.5 });
  if (tiny) cores.push({ ...A, bw: A.bw * 0.36, th: A.th * 0.34, wave: 0, flat: true });
  else {
    const SH = [1, 0.62, 0.4];                                  // each island above is much shorter
    const island = (T, i, s, k) => {
      const hf = (0.11 + 0.05 * h1(F * 3 + i * 7, seed + 70)) * SH[Math.min(2, i)];
      // never wider than it is tall: in a broad fire a core island of the
      // tongue's own width prints as a horizontal scrap, not as flame
      const hw = Math.min(T.bw * Math.pow(1 - s, (T.pL + T.pR) / 2) * (0.26 + 0.08 * h1(F * 5 + i, seed + 72)) * SH[Math.min(2, i)] ** 0.45,
        T.th * hf * 0.32);
      if (!(hw > 0) || !(hf > 0)) return 0;
      cores.push(jag({
        ...T, cx: spineX(T, s) + (h1(F * 7 + i, seed + 71) - 0.5) * hw * 1.5, y: T.y - T.th * s,
        bw: hw, th: T.th * hf, flat: true, wave: T.wave * 0.4,                 // flat-bottomed flakes, not a chain of drops
      }, k));
      return hf + 0.035 + 0.07 * h1(F * 13 + i, seed + 73);     // the island plus the gap above it
    };
    const nI = full && A.th > H * 0.52 ? (h1(F * 11, seed + 69) < 0.5 ? 3 : 2) : 2;
    let s = 0;
    for (let i = 0; i < nI && s < 0.5; i++) s += island(A, i, s, i + 1);
    let best = null;
    for (let i = 1; i < tongues.length; i++) { const T = tongues[i]; if (!T.dark && T.flat && (!best || T.th > best.th)) best = T; }
    if (best && best.th > H * 0.45 && h1(F * 13 + 4, seed + 77) < 0.85) island(best, 0, 0, 4);
  }
  // a ragged base (o.ragged): the side tongues root at staggered heights
  if (o.ragged && !tiny) for (let i = 1; i < tongues.length; i++) tongues[i].y += (h1(i * 5 + 1, seed + 90) - 0.35) * H * 0.07;
  return { x: o.x, y: o.y, W, H, tongues, frags, cores, I, lod, F, ragged: !!o.ragged && !tiny, seed };
}

// A tongue from its base to height fraction k, with asymmetric sides:
// each side has its own taper (pointed, concave tips), belly and a noise
// that slides along it every frame. Widened by kwL/kwR. A flat base sits
// on the roof line; a floating piece gets a rounded bottom.
function lickPath(ctx, T, k, kwL, kwR, N) {
  const L = [], R = [];
  for (let j = 0; j <= N; j++) {
    const sp = j / N, s = sp * k;
    const c = spineX(T, s);
    const yy = T.y - T.th * s;
    const q = 4 * sp * (1 - sp);
    const lens = T.lens ? Math.sqrt(Math.min(1, sp * 3)) : 1;
    const ja = T.jg ? 0.75 : 0.4, jf = T.jf || 3.5;   // jf: how fast the side noise runs along the piece (a core bites)
    const wl = kwL * T.bw * lens * Math.pow(1 - sp, T.pL) * (1 + T.bL * q) * (1 - ja / 2 + ja * wob(sp * jf + T.jL));
    const wr = kwR * T.bw * lens * Math.pow(1 - sp, T.pR) * (1 + T.bR * q) * (1 - ja / 2 + ja * wob(sp * jf + T.jR));
    L.push([c - wl, yy]); R.push([c + wr, yy]);
  }
  smoothTo(ctx, L, true);
  R.reverse();
  smoothTo(ctx, R, false);
  if (!T.flat && !T.lens) ctx.quadraticCurveTo(T.cx, T.y + T.bw * 0.7 * Math.max(kwL, kwR), L[0][0], L[0][1]);
  ctx.closePath();
}

// A fold crease: a dark sliver hugging one side of a tongue's body from
// s0 to s1, on the outside of the edge, so it shows inside the vermilion
// mass where the tongue overlaps its neighbour (like the folds of plate 2's
// red cape).
function creasePath(ctx, T, side, s0, s1, cw, N) {
  const A = [], B = [];
  const kw = T.kw;
  for (let j = 0; j <= N; j++) {
    const u = j / N, sp = s0 + (s1 - s0) * u, s = sp * T.kb;
    const c = spineX(T, s), yy = T.y - T.th * s;
    const q = 4 * sp * (1 - sp);
    const w = side < 0
      ? kw * T.bw * Math.pow(1 - sp, T.pL) * (1 + T.bL * q) * (0.8 + 0.4 * wob(sp * 3.5 + T.jL))
      : kw * T.bw * Math.pow(1 - sp, T.pR) * (1 + T.bR * q) * (0.8 + 0.4 * wob(sp * 3.5 + T.jR));
    const ex = c + side * w * 0.96;
    A.push([ex, yy]); B.push([ex + side * cw * Math.pow(Math.sin(Math.PI * u), 0.8), yy]);
  }
  smoothTo(ctx, A, true);
  B.reverse();
  smoothTo(ctx, B, false);
  ctx.closePath();
}

// The low mass the tongues rise from: a dome with a bumpy top, flat base.
function moundPath(ctx, x, y, rx, ry, F, k) {
  const M = 9;
  ctx.moveTo(x - rx, y);
  for (let m = 1; m < M; m++) {
    const a = Math.PI * (1 - m / M);
    const b = 0.75 + 0.35 * h1(F * 7 + m * 3, k * 31 + (x | 0));
    ctx.lineTo(x + Math.cos(a) * rx, y - Math.sin(a) * ry * b);
  }
  ctx.lineTo(x + rx, y);
  ctx.closePath();
}

// A ragged base for a fire on an open roof: the mound's dome on top, and a
// jagged bottom edge 0-7% of H below the roof line (charred, burning debris)
// instead of a ruler-straight cut. The teeth are stable per seed and shift
// slightly on twos.
function raggedBase(ctx, x, y, rx, ry, H, seed, F) {
  const M = 9;
  ctx.moveTo(x - rx, y);
  for (let m = 1; m < M; m++) {
    const a = Math.PI * (1 - m / M);
    const b = 0.75 + 0.35 * h1(F * 7 + m * 3, 31 + (x | 0));
    ctx.lineTo(x + Math.cos(a) * rx, y - Math.sin(a) * ry * b);
  }
  ctx.lineTo(x + rx, y);
  const T = 7 + (seed % 3);
  for (let k = T; k >= 0; k--) {
    const u = k / T, d = k % 2 ? 0.02 + 0.05 * h1(k, seed + 95) : -0.01 + 0.02 * h1(k + F, seed + 96);
    ctx.lineTo(x - rx + 2 * rx * u + (h1(k, seed + 97) - 0.5) * rx * 0.12, y + d * H);
  }
  ctx.closePath();
}

// Batch: one path per colour (dark red, vermilion, dark-red creases, cream).
function buildLick(G) {
  const out = new Path2D(), body = new Path2D(), core = new Path2D(), crease = new Path2D();
  let maxH = 0, anyCore = false, anyCrease = false;
  for (const g of G) {
    const N = g.N;
    if (g.lod !== 'tiny') maxH = Math.max(maxH, g.hpx);
    // the base mound joins the tongues along the roof line
    if (g.lod !== 'tiny') {
      const rx = g.W * 0.5, ry = g.H * 0.24;
      if (g.ragged) {   // a burning heap: jagged dark-red base below the roof line, embers in it
        raggedBase(out, g.x, g.y, rx * 1.12, ry, g.H, g.seed, g.F);
        moundPath(body, g.x + (h1(g.F, 3) - 0.5) * g.W * 0.06, g.y, rx * 0.84, ry * 0.78, g.F, 2);
        for (let k = 0, nE = 5 + (g.seed & 3); k < nE; k++) {
          const ex = g.x + (h1(k, g.seed + 91) - 0.5) * rx * 1.8, ey = g.y + h1(k, g.seed + 92) * g.H * 0.04;
          const es = Math.max(1.2 / g.S, g.H * (0.018 + 0.016 * h1(k + g.F, g.seed + 93)));
          (h1(k + g.F * 3, g.seed + 94) < 0.35 ? core : body).rect(ex - es, ey - es * 0.6, es * 2, es * 1.2);
        }
        anyCore = true;
      } else {
        moundPath(out, g.x, g.y, rx, ry, g.F, 1);
        moundPath(body, g.x + (h1(g.F, 3) - 0.5) * g.W * 0.06, g.y, rx * 0.84, ry * 0.78, g.F, 2);
      }
    }
    for (const T of g.tongues) {
      lickPath(out, T, 1, 1 + T.uL, 1 + T.uR, N);
      if (T.dark) continue;
      lickPath(body, T, T.kb, T.kw, T.kw, N);
      if (g.lod === 'full' && g.hpx >= 60 && T.flat && !T.main) { // a fold crease on the side facing the centre
        const side = T.cx > g.x ? -1 : 1;
        const s0 = 0.08 + 0.1 * h1(g.F * 3 + T.th, 5), s1 = 0.55 + 0.25 * h1(g.F * 7 + T.th, 6);
        creasePath(crease, T, side, s0, s1, T.bw * (0.1 + 0.1 * h1(g.F + T.bw, 8)), Math.max(3, N - 4));
        anyCrease = true;
      }
    }
    for (const T of g.frags) {
      lickPath(out, T, 1, 1 + T.uL * 0.5, 1 + T.uR * 0.5, Math.max(3, N - 3));
      if (!T.dark) lickPath(body, T, T.kb, T.kw, T.kw, Math.max(3, N - 3));
    }
    for (const T of g.cores) { lickPath(core, T, 1, 1, 1, Math.max(3, N - 2)); anyCore = true; }
  }
  return { out, body, core: anyCore ? core : null, crease: anyCrease ? crease : null, maxH };
}

function drawLick(ctx, e, B, ink) {
  ctx.fillStyle = C.redDark; ctx.fill(B.out);
  if (ink > 0 && B.maxH >= 34) { // optional hairline ink, never over 1 device px
    ctx.strokeStyle = INK; ctx.lineWidth = Math.min(1, ink) / e.s; ctx.stroke(B.out);
  }
  ctx.fillStyle = C.red; ctx.fill(B.body);
  if (B.crease) { ctx.fillStyle = C.redDark; ctx.fill(B.crease); }
  if (B.core) { ctx.fillStyle = C.cream; ctx.fill(B.core); }
}

// Flat posterised flames. o: { x, y (base), w, h, seed, intensity 0..1.6,
// wind (lean, ~-0.6..0.6), time, lod: 'auto'|'full'|'small'|'tiny',
// style: 'lick' (default) | 'classic', ragged (a jagged burning base with
// embers instead of a straight cut, for fires on open roofs; lick only), ink (hairline outline in device px,
// 0..1, default 0; batch-level, read from the first spec) }, or an array
// of such specs. Tiny fires (under 9 device px tall) are batched into one
// path per colour, cached per array and 12 fps frame. Bigger fires that
// touch merge into clusters (one path per colour each, so their tongues
// read as one fire), and each cluster is cached as a bitmap per 12 fps
// step at its own phase (see the step cache above).
const flameCache = new WeakMap();

// World bounds of built fire geometry (tongues, fragments, cores, licks).
function geomBounds(G, e) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (ax, ay, bx, by) => { if (ax < x0) x0 = ax; if (ay < y0) y0 = ay; if (bx > x1) x1 = bx; if (by > y1) y1 = by; };
  for (const g of G) {
    add(g.x - g.W * 0.62, g.y - g.H * 0.3, g.x + g.W * 0.62, g.y + g.H * (g.ragged ? 0.09 : 0.02));
    for (const A of [g.tongues, g.frags, g.cores]) if (A) for (const T of A) {
      const ext = Math.abs(T.lean) * T.th + (T.wave ?? 0.5) * T.bw * 1.5 + T.bw * 2.3;
      add(T.cx - ext, T.y - T.th * 1.03 - T.bw * 0.3, T.cx + ext, T.y + T.bw * 0.9);
    }
    if (g.licks) for (const [lx, ly, sz] of g.licks) add(lx - sz * 1.4, ly - sz * 1.7, lx + sz * 1.4, ly + sz * 0.6);
  }
  const pad = 3 / e.s;
  return x1 > x0 ? { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad } : null;
}
// Geometry and paths of a set of fires [[spec, lod], ...] at frame F.
function fireBuild(list, F, e) {
  const GC = [], GL = [];
  for (const [f, lod] of list) {
    const classic = f.style === 'classic';
    const g = classic ? flameGeom(f, F, e, lod) : lickGeom(f, F, e, lod);
    if (!g) continue;
    g.lod = lod; g.hpx = f.h * e.s; g.S = e.s;
    const hp = g.H * e.s;
    g.N = classic ? (lod === 'tiny' ? 3 : lod === 'small' ? 4 : clamp(Math.round(hp / 20), 5, 9))
      : (lod === 'tiny' ? 3 : lod === 'small' ? 4 : clamp(Math.round(hp / 30), 5, 8));
    (classic ? GC : GL).push(g);
  }
  return { GC, GL, classic: GC.length ? buildClassic(GC) : null, lick: GL.length ? buildLick(GL) : null };
}
function fireDraw(ctx, e, B, ink) {
  ctx.lineJoin = 'round';
  if (B.classic) drawClassic(ctx, e, B.classic);
  if (B.lick) drawLick(ctx, e, B.lick, ink);
}
// Fires whose drawn extents overlap, as clusters in list order.
function fireClusters(rest) {
  const n = rest.length;
  if (n === 1) return [rest];
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const bx = rest.map(([f]) => {
    const H = f.h * Math.pow(clamp(f.intensity ?? 1, 0, 1.6), 0.8), dx = f.w * 0.55 + H * (0.3 + Math.abs(f.wind ?? 0) * 0.5);
    return [f.x - dx, f.y - H * 1.3, f.x + dx, f.y + H * 0.1];
  });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = bx[i], b = bx[j];
    if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) { const ri = find(i), rj = find(j); if (ri !== rj) par[Math.max(ri, rj)] = Math.min(ri, rj); }
  }
  const out = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!out.has(r)) out.set(r, []); out.get(r).push(rest[i]); }
  return [...out.values()];
}

export function flames(ctx, e, o) {
  const list = Array.isArray(o) ? o : [o];
  if (!list.length) return;
  const ink = list[0].ink ?? 0;
  const tiny = [], rest = [];
  let sig = '';
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!(f.w > 0) || !(f.h > 0) || (f.intensity ?? 1) <= 0.02) continue;
    const hp = f.h * Math.pow(clamp(f.intensity ?? 1, 0, 1.6), 0.8) * e.s;
    const lod = f.lod && f.lod !== 'auto' ? f.lod : hp < 9 ? 'tiny' : hp < 34 ? 'small' : 'full';
    if (lod === 'tiny') { tiny.push([f, lod]); sig += `${i},`; } else rest.push([f, lod]);
  }
  ctx.save();
  if (tiny.length) { // far fires: one batch, synchronised on twos
    const F = frameOf(e, list[0]);
    const sg = `${F}:${e.reduced ? 1 : 0}:${sig}`;
    let B = Array.isArray(o) ? flameCache.get(o) : null;
    if (!B || B.sg !== sg) { B = fireBuild(tiny, F, e); B.sg = sg; if (Array.isArray(o)) flameCache.set(o, B); }
    fireDraw(ctx, e, B, ink);
  }
  if (rest.length) for (const cl of fireClusters(rest)) {
    const f0 = cl[0][0];
    const seed0 = seedOf(f0.seed, hashStr(`fl${f0.x | 0},${f0.y | 0}`));
    const F = stepOf(e, f0, seed0);
    let key = `fl|${e.reduced ? 1 : 0}|${ink}`;
    for (const [f, lod] of cl) key += `|${seedOf(f.seed, hashStr(`fl${f.x | 0},${f.y | 0}`))}:${lod[0]}${f.style === 'classic' ? 'c' : ''}${f.ragged ? 'r' : ''}:${Math.round(f.x / 4)}:${Math.round(f.y / 4)}`;
    const render = (sink) => {
      const B = fireBuild(cl, F, e);
      const bb = geomBounds([...B.GC, ...B.GL], e);
      const g = bb && sink(bb);
      if (g) fireDraw(g, e, B, ink);
    };
    if (!stepCached(ctx, e, key, F, render)) fireDraw(ctx, e, fireBuild(cl, F, e), ink);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- smoke
// Cauliflower billow outlines: lobes with cusped notches, unit radius.
const BLOBS = Array.from({ length: 8 }, (_, k) => {
  const r = new RNG(`blob${k}`);
  const n = 30, f = r.int(5, 7), a = r.range(0, TAU), f2 = r.int(9, 12), a2 = r.range(0, TAU);
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const rr = 0.9 + 0.12 * Math.abs(Math.sin(th * f / 2 + a)) + 0.03 * Math.sin(th * f2 + a2);
    pts[i * 2] = Math.cos(th) * rr; pts[i * 2 + 1] = Math.sin(th) * rr;
  }
  return pts;
});
function blobPath(ctx, x, y, r, k, sy = 1) {
  const b = BLOBS[k & 7], n = b.length;
  const X = (i) => x + b[i % n] * r, Y = (i) => y + b[(i + 1) % n] * r * sy;
  ctx.moveTo((X(0) + X(2)) / 2, (Y(0) + Y(2)) / 2);
  for (let i = 2; i <= n; i += 2) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2);
  ctx.closePath();
}

const SMOKE_PAL = {
  night: { base: '#020312', body: '#080d2e', rim: '#1d2a6e', under: ['#6a170f', '#350a07'], sky: C.skyNight },
  dust: { base: '#4e4f60', body: '#85848c', rim: '#cfcac3', under: ['#9a3326', '#6b1d15'], sky: C.skyNight },
  day: { base: '#1d1c24', body: '#33323b', rim: '#6d6b75', under: [C.redDark, '#4a0d09'], sky: C.skyDay },
};

// Classic smoke (first team; distantFire keeps it). Each billow is a flat dark body with
// a thin moonlit rim on the light side and, low in the column, a red rim
// underneath from the fire. o: { x, y (base), w (base width), h (column
// height), seed, drift (sideways travel per unit of rise), speed (units/s),
// count, lit (red underlight 0..1), grow (widening), palette: 'night'|
// 'dust'|'day'|{base, rim, under: [a, b], sky}, sky (colour the top fades
// toward), light: [lx, ly] (moon direction, default upper right), time }.
function smokeClassic(ctx, e, o, sink) {
  const { x, y, w, h } = o;
  if (!(w > 0) || !(h > 0)) return;
  const seed = seedOf(o.seed, hashStr(`sm${x | 0},${y | 0}`));
  const pal = typeof o.palette === 'object' ? o.palette : SMOKE_PAL[o.palette ?? 'night'];
  const skyC = o.sky ?? pal.sky;
  const speed = (o.speed ?? h / 7) * (e.reduced ? 0.5 : 1);
  const drift = o.drift ?? 0.25;
  const n = o.count ?? clamp(Math.round((h / w) * 7), 8, 44);
  const lit = o.lit ?? 1;
  const lx = o.light?.[0] ?? 0.6, ly = o.light?.[1] ?? -0.8;
  const grow = o.grow ?? 1.6;
  {
    const t = tq(e, o);
    const B = [];
    for (let k = 0; k < n; k++) {
      // billows advance uniformly in u; s = u^1.5 packs them densely low in
      // the column where they are small, so the column stays continuous
      const u = fract(k / n + h1(k, seed) * 0.7 / n + (t * speed) / (h * 1.5));
      const s = Math.pow(u, 1.5);
      if (s > 0.96) continue;
      const yy = y - s * h;
      const spread = w * (0.5 + grow * s);
      const xx = x + drift * s * s * h + (h1(k, seed + 1) - 0.5) * spread * 0.8 + (vn(s * 2.5 + k * 1.7, seed) - 0.5) * w * 0.3;
      const r = w * (0.3 + 0.28 * grow * s) * (0.75 + 0.5 * h1(k, seed + 2)) * (1 - 0.35 * clamp((s - 0.8) / 0.16));
      B.push({ s, x: xx, y: yy, r, k });
    }
    B.sort((a, b) => b.s - a.s);
    if (sink) {
      if (!B.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const b of B) { const r = b.r * 1.32; x0 = Math.min(x0, b.x - r); x1 = Math.max(x1, b.x + r); y0 = Math.min(y0, b.y - r); y1 = Math.max(y1, b.y + r); }
      ctx = sink({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      if (!ctx) return;
    }
    const G = o.group ?? 3; // billows per stratum: tones are batched inside a stratum
    for (let i = 0; i < B.length; i += G) {
      const i1 = Math.min(B.length, i + G);
      const sm = B[i].s;
      const fade = sm < 0.8 ? 0 : 0.3;
      const under = lit > 0 ? (sm < 0.28 * lit ? pal.under[0] : sm < 0.55 * lit ? pal.under[1] : null) : null;
      if (under) { ctx.beginPath(); for (let j = i; j < i1; j++) { const b = B[j]; blobPath(ctx, b.x - lx * b.r * 0.04, b.y + b.r * 0.13, b.r, b.k); } ctx.fillStyle = under; ctx.fill(); }
      ctx.beginPath(); for (let j = i; j < i1; j++) { const b = B[j]; blobPath(ctx, b.x + lx * b.r * 0.08, b.y + ly * b.r * 0.08, b.r, b.k); }
      ctx.fillStyle = fade ? mixHex(pal.rim, skyC, fade) : pal.rim; ctx.fill();
      ctx.beginPath(); for (let j = i; j < i1; j++) { const b = B[j]; blobPath(ctx, b.x - lx * b.r * 0.02, b.y - ly * b.r * 0.02, b.r * 0.97, b.k); }
      ctx.fillStyle = fade ? mixHex(pal.base, skyC, fade) : pal.base; ctx.fill();
      if (pal.body) {
        ctx.beginPath(); for (let j = i; j < i1; j++) { const b = B[j]; blobPath(ctx, b.x + lx * b.r * 0.2, b.y + ly * b.r * 0.2, b.r * 0.72, b.k + 3); }
        ctx.fillStyle = fade ? mixHex(pal.body, skyC, fade) : pal.body; ctx.fill();
      }
    }
  }
}

// Named palettes of the mass style: { base (the mass), half (half-lit),
// lit (moonlit), under: [lowest, higher] (red underlight), sky }. A custom
// object palette may give half/lit, or body + rim (half and lit are mixed
// from them), as the classic palettes do.
const MASS_PAL = {
  night: { base: '#030410', half: '#10142f', lit: '#283058', under: ['#8a2114', '#521009'], sky: C.skyNight },
  dust: { base: '#4d463e', half: '#7a7064', lit: '#a99d8e', under: ['#9a3326', '#6b1d15'], sky: C.skyNight }, // limestone dust: warm greys, no violet
  day: { base: '#1d1c24', half: '#33323b', lit: '#5b5a64', under: [C.redDark, '#4a0d09'], sky: C.skyDay },
};

// How far a point (qx, qy) lies outside the lobes from index b0 to b1 (an
// unsquashed distance in units of each lobe's radius; negative = inside).
// L holds LS numbers per lobe: x, y, r, asp, ...
function clearance(L, b0, b1, skip, qx, qy) {
  let best = 9;
  for (let c = b0; c < b1; c++) {
    if (c === skip) continue;
    const j = c * LS, r = L[j + 2];
    const dx = qx - L[j], dy = (qy - L[j + 1]) / L[j + 3];
    const d = Math.sqrt(dx * dx + dy * dy) / r - 1;
    if (d < best) best = d;
  }
  return best;
}

// A lit patch on a lobe (cx, cy, r; vertical aspect asp), facing angle phi:
// the outer edge follows the rim over phi +- span, the inner edge is a
// short polyline with jittered, angular facets (a posterised print patch,
// not a fingernail), up to o deep at the middle and meeting the rim at
// both ends. Never outside the lobe. sd seeds the facets.
function litPatch(P, cx, cy, r, phi, o, span, asp, sd, cap = 0) {
  if (!(o > 0) || !(r > 0)) return;
  if (asp !== 1) phi = Math.atan2(Math.sin(phi) / asp, Math.cos(phi));
  const a0 = phi - span, a1 = phi + span;
  P.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0) * asp);
  if (asp === 1) P.arc(cx, cy, r, a0, a1, false); else P.ellipse(cx, cy, r, r * asp, 0, a0, a1, false);
  // inner edge: a crescent (deepest in the middle) or, with cap = 1, a
  // faceted chord (a broad cap); each vertex jittered
  const K = cap ? 6 : 5, cs = Math.cos(Math.min(span, 1.4));
  for (let k = K - 1; k >= 1; k--) {
    const u = k / K, th = a0 + (a1 - a0) * (u + (h1(k, sd) - 0.5) * 0.12);
    const dc = Math.pow(Math.sin(Math.PI * u), 0.75);
    const dk = cap ? clamp((1 - cs / Math.max(cs + 1e-3, Math.cos((2 * u - 1) * Math.min(span, 1.4)))) / (1 - cs)) : dc;
    const d = o * lerp(dc, dk, cap) * (0.72 + 0.56 * h1(k + 9, sd));
    const rr = Math.max(0, r - d);
    P.lineTo(cx + rr * Math.cos(th), cy + rr * Math.sin(th) * asp);
  }
  P.closePath();
}

// Irregular billow outlines for smoke lobes (unit radius, NLO points): 4-6
// rounded bumps of uneven size and spacing meeting at cusps, so no lobe is
// a circle and the union of a puff's lobes reads as one lumpy billow.
const NLO = 24;
const LOBES = Array.from({ length: 8 }, (_, k) => {
  const r = new RNG(`lobe${k}`);
  const m = r.int(4, 6);
  const gaps = Array.from({ length: m }, () => r.range(0.7, 1.3));
  const gs = gaps.reduce((a, v) => a + v, 0);
  const th0 = r.range(0, TAU);
  const C0 = [], H0 = [], T0 = [];
  let a = th0;
  for (let j = 0; j < m; j++) { const g = (gaps[j] / gs) * TAU; C0.push(a); H0.push(r.range(0.06, 0.2)); T0.push(a + g * r.range(0.35, 0.65)); a += g; }
  const pts = new Float32Array(NLO * 2);
  for (let i = 0; i < NLO; i++) {
    const th = th0 + (i / NLO) * TAU;
    let j = 0;
    while (j < m - 1 && th >= C0[j + 1]) j++;
    const c0 = C0[j], c1 = j + 1 < m ? C0[j + 1] : th0 + TAU, cu = T0[j];
    const h0 = H0[j], hn = H0[(j + 1) % m];
    const rr = th < cu
      ? 0.9 + h0 * Math.pow(Math.max(0, Math.cos(((th - c0) / (cu - c0)) * Math.PI / 2)), 0.6)
      : 0.9 + hn * Math.pow(Math.max(0, Math.cos(((c1 - th) / (c1 - cu)) * Math.PI / 2)), 0.6);
    pts[i * 2] = Math.cos(th) * rr; pts[i * 2 + 1] = Math.sin(th) * rr;
  }
  return pts;
});
// Add one lobe outline (shape k, rotated by (rc, rs), squashed by asp) to
// path P; small lobes use fewer points, tiny ones are ellipses.
function lobeTo(P, x, y, r, asp, k, rc, rs, rpx) {
  if (!(r > 0)) return;
  if (k < 0 || rpx < 2.5) { P.moveTo(x + r, y); P.ellipse(x, y, r, r * asp, 0, 0, TAU); return; }
  const b = LOBES[k & 7], st = rpx < 16 ? 3 : rpx < 44 ? 2 : 1, m = NLO / st;
  const X = (i) => { const j = ((i % m) * st) * 2; return x + (b[j] * rc - b[j + 1] * rs) * r; };
  const Y = (i) => { const j = ((i % m) * st) * 2; return y + (b[j] * rs + b[j + 1] * rc) * r * asp; };
  P.moveTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
  for (let i = 1; i <= m; i++) P.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  P.closePath();
}

// Navy-black smoke rising from a fire, as billowing masses (the night
// cousin of kit/nature.js cumulus). Every puff has a stable identity: it is
// born at the base at its own time, rises on twos, widens and rolls slowly,
// and shrinks away at the top, so nothing re-forms between frames. A puff
// is a cluster of lobes with irregular, cusped outlines (no circles): a
// flattened main lobe, 3-4 bumps round its upper side and flanks (big bumps
// carry small florets), a flat base lobe, and a bridge to the puff above,
// so even a thin column is one lumpy ribbon. Puffs are drawn in groups of
// o.group (stable by identity), the oldest (highest) first, so lower groups
// overlap the ones above and cut crisp crevices into them.
// Shading, per group (production standard 6): the merged navy-black mass,
// then, inside a clip 1.2 px within its silhouette (so the silhouette's
// anti-aliased pixels only mix the mass with what is behind it): the red
// underlight from the fire below, as the undersides of the low lobes (the
// lobes minus copies of themselves shifted up: continuous bands on the
// overhangs, bright low in the column, dim higher up, a warm near-black gap
// above), and the moonlight, as faceted caps (or crescents) on the moon side
// of the lobes whose rim is exposed, their depth, span and angle varying per
// lobe (keyed by a stable lobe identity), a brighter piece inside some big
// ones, florets with small caps, some lobes dark; on a red lobe the cap
// stays above the lobe's sides, clear of its red band. So red never touches
// the blue tones, the navy mass or the sky (no plum). No outline rims. The
// top puffs fade toward the sky.
// o: { x, y (base), w (base width), h (column height), seed, drift
// (sideways travel per unit of rise), speed (units/s), count (density: about
// 0.85 x count puffs alive), group (puffs per group, default 3), lit (red
// underlight reach 0..1+, default 1), grow (widening, default 1.6),
// palette: 'night' (default) | 'dust' | 'day' | { base (mass), half, lit,
// under: [lowest, higher], sky } | { base, body, rim, under, sky } (half
// and lit are then mixed from body and rim, 0.4 and 0.85), sky (colour the
// top fades toward), light: [lx, ly] (moon direction, default [0.6, -0.8],
// upper right), moon (moonlight strength 0..1, default 1; 0 = no moonlight,
// red underlight only), time, style: 'mass' (default) | 'classic' (the
// first team's outlined blobs) }.
const UMAX = 0.975; // a puff dies when it reaches this fraction of its life
const LS = 7;       // lobe record: x, y, r, asp, shape, roll, stable key (puff id + lobe role)
const UNDERLAY = '#0b0405'; // warm near-black ring round each red patch
function smokeMass(ctx, e, o, sink) {
  const { x, y, w, h } = o;
  if (!(w > 0) || !(h > 0)) return;
  const seed = seedOf(o.seed, hashStr(`sm${x | 0},${y | 0}`));
  const pal = typeof o.palette === 'object' ? o.palette : MASS_PAL[o.palette ?? 'night'] ?? MASS_PAL.night;
  const skyC = o.sky ?? pal.sky ?? C.skyNight;
  const speed = Math.max(1e-3, (o.speed ?? h / 7) * (e.reduced ? 0.5 : 1));
  const drift = o.drift ?? 0.25;
  const n = Math.max(3, Math.round((o.count ?? clamp(Math.round((h / w) * 7), 8, 44)) * 0.85));
  const lit = o.lit ?? 1;
  const phiM = Math.atan2(o.light?.[1] ?? -0.8, o.light?.[0] ?? 0.6);
  const grow = o.grow ?? 1.6;
  const t = tq(e, o);
  const S = e.s, px = 1 / S;
  const moon = o.moon ?? 1;
  const body = pal.body ?? pal.base, rim = pal.rim ?? pal.lit ?? body;
  const mass = pal.base, half = pal.half ?? mixHex(body, rim, 0.4), lit1 = pal.lit ?? mixHex(body, rim, 0.85);
  const under = pal.under ?? MASS_PAL.night.under;
  // the gap round red patches: warm near-black on a navy mass (red and blue
  // never mix into plum); on a grey or warm mass the mass itself
  const [mr, mg, mb] = rgbOf(mass), gapC = mb > mr + 6 && mr + mg + mb < 120 ? UNDERLAY : mass;
  const G = Math.max(1, Math.round(o.group ?? 3));
  const life = (h * 1.5) / speed, D = life / n;     // a puff's life, the time between births
  const tD = t / D;
  const iA = Math.floor(tD - n * UMAX) - 1, iB = Math.floor(tD) + 1;
  // puffs, oldest (highest) first: [s, x, y, R, id]
  const puffs = [];
  for (let i = iA; i <= iB; i++) {
    const u = (tD - i - 0.7 * h1(i, seed + 3)) / n;
    if (u <= 0 || u >= UMAX) continue;
    const s = Math.pow(u, 1.5);
    const spread = w * (0.5 + grow * s);
    const pxx = x + drift * s * s * h + (h1(i, seed + 1) - 0.5) * spread * 0.5 + (vn(s * 2.5 + i * 1.7, seed) - 0.5) * w * 0.3;
    const R = w * (0.3 + 0.28 * grow * s) * (0.75 + 0.5 * h1(i, seed + 2))
      * (0.4 + 0.6 * clamp(s / 0.12)) * smooth(0, 0.035, s)   // born small at the base
      * (1 - 0.45 * smooth(0.78, 0.9, s)) * (1 - smooth(0.86, 0.94, s)); // and shrinking away at the top
    if (R * S < 0.4) continue;
    puffs.push(s, pxx, y - s * h, R, i);
  }
  const NP = puffs.length / 5;
  if (!NP) return;
  // lobes of each group: L = [x, y, r, asp, shape, roll, ...]; groups by identity (stable)
  const L = [];
  const gs = [];   // per group: [first lobe, end lobe, sum of s, puffs]
  let gi = NaN;    // (identities may be negative early in a shot)
  for (let p = 0; p < NP; p++) {
    const s = puffs[p * 5], ppx = puffs[p * 5 + 1], py = puffs[p * 5 + 2], R = puffs[p * 5 + 3], id = puffs[p * 5 + 4];
    const q = Math.floor(id / G);
    if (q !== gi) { if (gs.length) gs[gs.length - 1][1] = L.length / LS; gs.push([L.length / LS, 0, 0, 0]); gi = q; }
    gs[gs.length - 1][2] += s; gs[gs.length - 1][3]++;
    const ps = (seed ^ Math.imul(id + 7, 0x9e3779b1)) >>> 0;
    const Rs = R * S;
    const roll = (s - 0.5) * 0.7 + (h1(id, seed + 10) - 0.5) * 0.5;   // lobes roll slowly as the puff rises
    // (the main and base lobes, mostly inside the puff, are plain ellipses: shape -1)
    const add = (lx, ly, lr, asp, m) => L.push(lx, ly, lr, asp, m === 7 || m === 8 ? -1 : (ps >>> (m * 3)) & 7, h1(m, ps + 20) * TAU + roll * (m & 1 ? -1.4 : 1.4), (ps ^ Math.imul(m + 1, 0x85ebca6b)) >>> 0);
    // a bridge to the puff above, so a thin column is one ribbon, not beads
    if (p > 0 && puffs[(p - 1) * 5 + 4] === id - 1) {
      const qx = puffs[(p - 1) * 5 + 1], qy = puffs[(p - 1) * 5 + 2], QR = puffs[(p - 1) * 5 + 3];
      const gap = Math.hypot(qx - ppx, qy - py) / (QR + R);
      const rb = Math.min(R, QR) * 0.8 * smooth(0.42, 0.6, gap);
      if (rb * S > 0.5) add((ppx + qx) / 2, (py + qy) / 2, rb, 0.9, 9);
    }
    // bumps round the upper side and flanks
    if (Rs > 2.5) {
      const NB = 3 + (h1(id, seed + 9) < 0.5 ? 1 : 0);
      for (let m = 0; m < NB; m++) {
        const a = -Math.PI / 2 + (m / (NB - 1) - 0.5) * Math.PI * 1.3 + (h1(m, ps) - 0.5) * 0.45 + roll;
        const d = R * (0.5 + 0.22 * h1(m, ps + 1)), rb = R * (0.34 + 0.22 * h1(m, ps + 2));
        const bx = ppx + Math.cos(a) * d, by = py + Math.sin(a) * d * 0.86;
        add(bx, by, rb, 0.92, m);
        // florets break the outline of big bumps (not at the bottom)
        if (rb * S > 6 && Math.sin(a) < 0.35) for (let f = 0, NF = rb * S > 16 ? 3 : 2; f < NF; f++) {
          const af = a + (f - (NF - 1) / 2) * 1.15 + (h1(m * 3 + f, ps + 3) - 0.5) * 0.4;
          const rf = rb * (0.24 + 0.16 * h1(m * 3 + f, ps + 4));
          if (h1(m * 3 + f, ps + 5) < 0.8) add(bx + Math.cos(af) * rb * 0.84, by + Math.sin(af) * rb * 0.8, rf, 0.94, 5 + m * 3 + f);
        }
      }
    }
    // the main lobe (in front of its bumps) and a flat base lobe
    add(ppx, py + R * 0.06, R * (Rs > 2.5 ? 0.74 : 0.9), 0.86, 7);
    if (Rs > 2.5) add(ppx + (h1(id, seed + 11) - 0.5) * R * 0.3, py + R * 0.38, R * 0.62, 0.5, 8);
  }
  gs[gs.length - 1][1] = L.length / LS;
  const NL = L.length / LS;
  if (sink) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let j = 0; j < L.length; j += LS) {
      const r = L[j + 2] * 1.08, ry = r * L[j + 3];
      if (L[j] - r < x0) x0 = L[j] - r;
      if (L[j] + r > x1) x1 = L[j] + r;
      if (L[j + 1] - ry < y0) y0 = L[j + 1] - ry;
      if (L[j + 1] + ry > y1) y1 = L[j + 1] + ry;
    }
    const pad = 2 / S;
    ctx = sink({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad });
    if (!ctx) return;
  }
  // per lobe: roll (cos, sin) and size in device px
  const RC = new Float32Array(NL), RS = new Float32Array(NL), RP = new Float32Array(NL);
  const U1 = new Float32Array(NL), U2 = new Float32Array(NL), U3 = new Float32Array(NL), RED = new Uint8Array(NL), K = new Uint32Array(NL);
  for (let b = 0; b < NL; b++) {
    const j = b * LS;
    RC[b] = Math.cos(L[j + 5]); RS[b] = Math.sin(L[j + 5]); RP[b] = L[j + 2] * S; K[b] = L[j + 6];
  }
  // lobes b0..b1 into P (shrunk, shifted up by dyA[b], only red ones / only
  // the rest); el > 0: plain ellipses of el x the radius (internal band
  // edges and clips, where the cusped outline would only cost time)
  const lobes = (P, b0, b1, shrink = 0, dyA = null, only = -1, el = 0) => {
    for (let b = b0; b < b1; b++) {
      if (only >= 0 && RED[b] !== only) continue;
      const j = b * LS, r = L[j + 2] * (el || 1) - shrink;
      if (!(r > 0)) continue;
      const yy = L[j + 1] + (dyA ? dyA[b] : 0);
      if (el) { P.moveTo(L[j] + r, yy); P.ellipse(L[j], yy, r, r * L[j + 3], 0, 0, TAU); }
      else lobeTo(P, L[j], yy, r, L[j + 3], L[j + 4], RC[b], RS[b], RP[b]);
    }
  };
  const inset = 1.2 * px;   // the blue tones stay this far inside the silhouette
  const hP = [], lP = [];
  for (let gq = 0; gq < gs.length; gq++) {
    const [b0, b1, sS, nS] = gs[gq], sm = sS / nS;   // the group's mean height sets its fade and red reach
    const fade = 0.3 * smooth(0.7, 0.92, sm);
    const tone = (c) => (fade ? mixHex(c, skyC, fade) : c);
    // moonlit patches: half tone on most lobes whose moon-side rim is exposed
    // (depth, span and angle vary strongly per lobe; florets get small caps),
    // a lit tone inside some big ones, sometimes split in two
    hP.length = lP.length = 0;
    if (moon > 0) for (let b = b0; b < b1; b++) {
      const j = b * LS, r = L[j + 2], rp = RP[b], flo = L[j + 3] > 0.93;
      if (rp < (flo ? 3 : 4) || h1(K[b], seed + 14) < (flo ? 0.25 : L[j + 3] > 0.9 ? 0.28 : 0.15)) continue;
      const ph = phiM + (h1(K[b], seed + 5) - 0.5) * 1.2;   // +-35 deg
      const qx = L[j] + Math.cos(ph) * r * 0.9, qy = L[j + 1] + Math.sin(ph) * r * 0.9 * L[j + 3];
      const cl = smooth(0, 0.3, clearance(L, b + 1, b1, b, qx, qy));
      if (cl <= 0.02) continue;
      // most lobes take a broad cap, the rest a crescent; florets a small cap
      const cap = flo || h1(K[b], seed + 18) < 0.7 ? 1 : 0;
      const kd = flo ? 0.42 + 0.2 * h1(K[b], seed + 6)
        : (cap ? 0.4 + 0.45 * h1(K[b], seed + 6) : 0.18 + 0.24 * h1(K[b], seed + 6)) * (0.8 + 0.35 * sm) * clamp(Math.pow(36 / rp, 0.25), 0.65, 1.1);
      const sp = flo ? 0.9 + 0.4 * h1(K[b], seed + 8) : cap ? 0.7 + 0.55 * h1(K[b], seed + 8) : 0.8 + 0.6 * h1(K[b], seed + 8);
      hP.push(b, ph, r * kd * moon * cl, sp, cap);
      if (sm > 0.15 && rp >= 9 && h1(K[b], seed + 7) < 0.5) {
        const two = h1(K[b], seed + 17) < 0.3, k2 = kd * moon * cl * (0.35 + 0.25 * h1(K[b], seed + 15));
        const sp2 = sp * (two ? 0.22 : 0.3 + 0.25 * h1(K[b], seed + 16)), dph = (h1(K[b], seed + 12) - 0.5) * 0.6;
        if (two) lP.push(b, ph + dph - sp * 0.35, r * k2, sp2, cap, b, ph + dph + sp * 0.3, r * k2 * 0.8, sp2, cap);
        else lP.push(b, ph + dph, r * k2, sp2, cap);
      }
    }
    // red underlight from the fire below: the group's undersides (the mass
    // minus copies of its low lobes shifted up), bright over the lowest
    // quarter of the column and dim over the lowest half, each lobe's band
    // its own depth; a warm near-black gap under the blue tones
    let anyRed = false, anyHot = false;
    for (let b = b0; b < b1; b++) {
      RED[b] = 0; U1[b] = U2[b] = U3[b] = 0;
      if (!(lit > 0) || sm >= 0.62 * lit || RP[b] < 1.4) continue;   // (1.4 px, not 2.5: low in a column the lobes are small, and that is where the fire lights them)
      const j = b * LS, r = L[j + 2], rise = (y - L[j + 1]) / h;
      const dim = 1 - smooth(0.3 * lit, 0.46 * lit, rise), hot = 1 - smooth(0.14 * lit, 0.24 * lit, rise);
      if (dim <= 0.02) continue;
      const kv = 0.7 + 0.6 * h1(K[b], seed + 20);
      RED[b] = 1; anyRed = true;
      // the bands have a device-pixel floor: on a thin column (s08) the low
      // lobes are a few px across, so a band of 0.16 r was sub-pixel and the
      // fire's light never showed, whatever `lit` was set to
      const hb = hot > 0.02 ? Math.max(1.0 * px, r * 0.16 * hot * kv) : 0;
      if (hot > 0.02) anyHot = true;
      U1[b] = -hb;
      U2[b] = -Math.max(hb + 1.0 * px, r * 0.32 * dim * kv);
      U3[b] = U2[b] - Math.max(1.6 * px, r * 0.07);
    }
    const P0 = new Path2D(); lobes(P0, b0, b1);
    ctx.fillStyle = tone(mass); ctx.fill(P0);
    if (!hP.length && !anyRed) continue;
    // every other tone stays 1.2 px inside the silhouette, so the silhouette's
    // anti-aliased pixels only ever mix the mass with what lies behind it
    const PI_ = new Path2D(); lobes(PI_, b0, b1, inset);
    ctx.save(); ctx.clip(PI_);
    // red underlight over the low lobes (in front of the higher ones): hot,
    // dim, a near-black gap, then the mass again above it
    if (anyRed) {
      const R0 = new Path2D(), R1 = new Path2D(), R2 = new Path2D(), R3 = new Path2D();
      lobes(R0, b0, b1, 0, null, 1); if (anyHot) lobes(R1, b0, b1, 0, U1, 1, 1); lobes(R2, b0, b1, 0, U2, 1, 1); lobes(R3, b0, b1, 0, U3, 1);
      ctx.fillStyle = tone(under[anyHot ? 0 : 1]); ctx.fill(R0);
      if (anyHot) { ctx.fillStyle = tone(under[1]); ctx.fill(R1); }
      ctx.fillStyle = tone(gapC); ctx.fill(R2);
      ctx.fillStyle = tone(mass); ctx.fill(R3);
    }
    // moonlit patches; on a red lobe the arc stays above its sides, clear of
    // its red band
    if (hP.length) {
      const arc = (b, ph, sp) => {
        if (!RED[b]) return [ph, sp];
        const lo = Math.max(ph - sp, -Math.PI + 0.3), hi = Math.min(ph + sp, -0.3);
        return hi - lo > 0.2 ? [(lo + hi) / 2, (hi - lo) / 2] : null;
      };
      const PH = new Path2D();
      let any = false;
      for (let q = 0; q < hP.length; q += 5) { const b = hP[q], A = arc(b, hP[q + 1], hP[q + 3]); if (!A) continue; const j = b * LS; litPatch(PH, L[j], L[j + 1], L[j + 2] * 1.04, A[0], hP[q + 2], A[1], L[j + 3], (seed ^ K[b]) >>> 0, hP[q + 4]); any = true; }
      if (any) { ctx.fillStyle = tone(half); ctx.fill(PH); }
      if (lP.length) {
        const PL = new Path2D();
        any = false;
        for (let q = 0; q < lP.length; q += 5) { const b = lP[q], A = arc(b, lP[q + 1], lP[q + 3]); if (!A) continue; const j = b * LS; litPatch(PL, L[j], L[j + 1], L[j + 2] * 1.04, A[0], lP[q + 2], A[1], L[j + 3], (seed ^ K[b] ^ (q * 1597)) >>> 0, lP[q + 4]); any = true; }
        if (any) { ctx.fillStyle = tone(lit1); ctx.fill(PL); }
      }
    }
    ctx.restore();
  }
}

// distantFire's far plumes: the night mass with glow-ramp undersides
const FAR_PAL = { ...MASS_PAL.night, under: [C.redDark, '#4a0d09'] };

// Smoke entry point: each column is cached as a bitmap per 12 fps step at
// its own phase (see the step cache); style 'classic' draws the first
// team's outlined blobs (distantFire uses it).
export function smoke(ctx, e, o) {
  const { x, y, w, h } = o;
  if (!(w > 0) || !(h > 0)) return;
  const seed = seedOf(o.seed, hashStr(`sm${x | 0},${y | 0}`));
  const classic = o.style === 'classic';
  const F = stepOf(e, o, seed);
  const draw = classic ? smokeClassic : smokeMass;
  const at = () => ({ ...o, seed, time: stepTime(e, F) });
  const key = `sm|${classic ? 'c' : 'm'}|${e.reduced ? 1 : 0}|${seed}|${Math.round(x / 8)}|${Math.round(y / 8)}`;
  if (!stepCached(ctx, e, key, F, (sink) => draw(null, e, at(), sink))) draw(ctx, e, at());
}

// ---------------------------------------------------------------- embers
// Cream and red specks rising from a fire. o: { x, y (base), w, h, seed,
// count, wind, size (device-px multiplier), time }.
export function embers(ctx, e, o) {
  const { x, y, w, h } = o;
  const seed = seedOf(o.seed, hashStr(`em${x | 0},${y | 0}`));
  const n = o.count ?? 24;
  const F = frameOf(e, o);
  const t = tq(e, o);
  const px = 1 / e.s;
  const wind = o.wind ?? 0.25;
  const sz = o.size ?? 1;
  const cols = [C.cream, C.redHot, C.red];
  const paths = [[], [], []];
  for (let j = 0; j < n; j++) {
    const P = (1.5 + 1.7 * h1(j, seed)) * (e.reduced ? 1.8 : 1);
    const a = fract(t / P + h1(j, seed + 1));
    if (a > 0.93) continue;
    if (!e.reduced && h1(j * 31 + F, seed + 7) < 0.14) continue; // twinkle on twos
    const x0 = x + (h1(j, seed + 2) - 0.5) * w;
    const yy = y - a * h * (0.65 + 0.5 * h1(j, seed + 3));
    const xx = x0 + wind * a * h + Math.sin(a * 8 + j * 1.3) * w * 0.06;
    const s = (1.6 + 2.2 * h1(j, seed + 4)) * px * sz * (1 - a * 0.4);
    paths[a < 0.22 ? 0 : a < 0.55 ? 1 : 2].push(xx, yy, s);
  }
  for (let c = 0; c < 3; c++) {
    const P = paths[c];
    if (!P.length) continue;
    ctx.beginPath();
    for (let i = 0; i < P.length; i += 3) ctx.rect(P[i] - P[i + 2] / 2, P[i + 1] - P[i + 2] / 2, P[i + 2], P[i + 2] * 1.3);
    ctx.fillStyle = cols[c]; ctx.fill();
  }
}

// ---------------------------------------------------------------- lightning
function zig(rng, x0, y0, x1, y1, rough, depth) {
  let pts = [[x0, y0], [x1, y1]];
  let disp = Math.hypot(x1 - x0, y1 - y0) * rough;
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const off = rng.range(-1, 1) * disp;
      const m = rng.range(0.4, 0.6);
      np.push([a[0] + dx * m - (dy / L) * off, a[1] + dy * m + (dx / L) * off], b);
    }
    pts = np; disp *= 0.52;
  }
  return pts;
}

function buildBolt(seed, x0, y0, x1, y1, nb) {
  const rng = new RNG(seed);
  const main = zig(rng, x0, y0, x1, y1, 0.16, 6);
  const L = Math.hypot(x1 - x0, y1 - y0);
  const dir = Math.atan2(y1 - y0, x1 - x0);
  const branches = [], twigs = [];
  for (let b = 0; b < nb; b++) {
    const i = Math.floor(rng.range(0.08, 0.75) * (main.length - 1));
    const [bx, by] = main[i];
    const a = dir + rng.sign() * rng.range(0.35, 0.95);
    const len = L * rng.range(0.12, 0.32) * (1 - i / main.length * 0.5);
    const br = zig(rng, bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 0.22, 4);
    branches.push(br);
    if (rng.chance(0.6)) {
      const j = Math.floor(rng.range(0.2, 0.7) * (br.length - 1));
      const a2 = a + rng.sign() * rng.range(0.3, 0.8), l2 = len * rng.range(0.25, 0.5);
      twigs.push(zig(rng, br[j][0], br[j][1], br[j][0] + Math.cos(a2) * l2, br[j][1] + Math.sin(a2) * l2, 0.25, 3));
    }
  }
  return { main, branches, twigs };
}

function strokePts(ctx, pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }

// Ivory-white jagged bolt with branches, a hard-edged two-tone zigzag as
// in a print: a flat pale-cobalt halo (1.8x the core; 1.4x for a near-white
// halo) under a white core, butt ends and mitred corners, optionally inside
// a near-black ink contour. It is always opaque (a translucent bolt mixes
// blue into red smoke as plum): as the strike decays it thins, sheds its
// twigs (below strength 0.45) and then its halo (below 0.25), and is gone
// below 0.06. o: { x0, y0, x1, y1, seed, strength 0..1, branches (count),
// width (world), flash 0..1 (whitens the visible frame; ignored with
// reduced motion), halo ('r,g,b', default '150,176,240'), outline (false |
// true | k: an ink contour k x the core width outside the halo, default k
// 0.3, at least 1.2 device px), ink (outline colour, '#05060f'), alpha
// (1) }.
export function lightning(ctx, e, o) {
  const s = clamp(o.strength ?? 1);
  if (s <= 0.06) return;
  const seed = seedOf(o.seed, 1);
  const nb = o.branches ?? 5;
  const bolt = memo(`lt${seed}:${o.x0 | 0},${o.y0 | 0},${o.x1 | 0},${o.y1 | 0}:${nb}`, () => buildBolt(seed, o.x0, o.y0, o.x1, o.y1, nb));
  const px = 1 / e.s;
  const L = Math.hypot(o.x1 - o.x0, o.y1 - o.y0);
  const cw = Math.max(1.5 * px, (o.width ?? L * 0.006) * (0.45 + 0.55 * s));
  const wb = Math.max(1.1 * px, cw * 0.55), wt = Math.max(0.9 * px, cw * 0.32);
  const twigs = s > 0.45, haloOn = s > 0.25;
  ctx.save();
  if (o.flash && !e.reduced && e.view) {   // a near-neutral 'screen' lift (blue added to red reads plum)
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(196,204,222,${0.2 * o.flash * s})`;
    ctx.fillRect(e.view.ox - 10, e.view.oy - 10, e.view.vw + 20, e.view.vh + 20);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = clamp(o.alpha ?? 1);
  ctx.lineJoin = 'miter'; ctx.miterLimit = 3; ctx.lineCap = 'butt';
  const pass = (k, add, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = cw * k + add; ctx.beginPath(); strokePts(ctx, bolt.main); ctx.stroke();
    ctx.lineWidth = wb * k + add; ctx.beginPath(); for (const b of bolt.branches) strokePts(ctx, b); ctx.stroke();
    if (twigs) { ctx.lineWidth = wt * k + add; ctx.beginPath(); for (const b of bolt.twigs) strokePts(ctx, b); ctx.stroke(); }
  };
  // a halo nearly as light as the core would only fatten the bolt into one
  // white band, so a pale halo hugs the core more closely
  const hc = o.halo ?? '150,176,240', hl = hc.split(',').reduce((a, v, i) => a + Number(v) * [0.3, 0.59, 0.11][i], 0);
  const kh = haloOn ? (hl > 200 ? 1.4 : 1.8) : 1;
  if (o.outline) {
    const k = typeof o.outline === 'number' ? o.outline : 0.3;
    pass(kh, 2 * Math.max(1.2 * px, k * cw), o.ink ?? '#05060f');
  }
  if (haloOn) pass(kh, 0, `rgb(${hc})`);
  pass(1, 0, C.white);
  ctx.restore();
}

// Screen-space flash for shot.post(ctx, e) (device px). No-op when reduced.
// A near-neutral 'screen' lift at 0.35 a (an additive blue over red smoke
// reads plum, standard 15).
export function screenFlash(ctx, e, a, color = '196,204,222') {
  if (e.reduced || a <= 0.005) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(${color},${clamp(a) * 0.35})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// ---------------------------------------------------------------- glow
// Firelight, posterised (production standard 15): hard stepped bands with
// wobbly, non-concentric edges; inner bands sit higher because the light
// comes from flames above the base. It is never additive over navy by
// default, because red added to navy goes violet. Modes:
//   'warm' (the default for red colours; alias 'multiply'): multiply bands
//       of a warm filter, for stone, figures and dust. Ivory turns
//       vermilion-salmon, grey stone terracotta, navy only darkens and
//       black stays black. The filter keeps the red channel and pulls green
//       60% and blue 70% of the way toward o.color's (C.red: '#ff8062';
//       o.filter overrides it).
//       Production standard 21: the bands are never pale. They step from
//       0.75 of the filter (outer band: ivory turns salmon) to 1.15 (inner:
//       coral-vermilion). A weaker light is smaller and has fewer bands:
//       strength s < 1 scales the radius by sqrt(s) and draws round(bands
//       x s) bands (at least 1); s > 1 deepens every band (up to 1.6). The
//       flicker moves the band edges (+-4%), never the colours. Multiply
//       darkens navy: lay it on stone and figures, not over sky or smoke
//       (clip it, or draw it before them). o.op = 'darken' takes the darker
//       of the backdrop and the filter laid on ivory: lit stone turns the
//       same salmon as under multiply, and the sky, smoke and shadows are
//       left alone, but mid-grey stone turns a dull tan.
//   'tint': opaque source-over bands from a red ramp, for skies and for the
//       glow behind smoke and silhouettes. It covers what is under it, so
//       draw it before (behind) what it lights, or clip it. o.colors =
//       [inner .. outer] (default [C.red, C.redDark, '#4a0d09', '#2c0806',
//       '#170504']; no violet). The innermost band takes the ramp colour
//       at position strength (0 = the outer, darkest end, 1 = the inner,
//       brightest), and each band further out is one ramp step darker. The
//       flicker moves the band edges, not the colours.
//   'lighter': additive (the old default). It is still the default for
//       colours that are not red, such as a lightning strike's blue.
//   any other canvas composite op: passed through, with stepped alpha.
// o: { x, y, r, strength (1), color (hex, C.red), filter (hex, warm), op (warm),
//      colors (tint), alpha (tint, 1), bands (3; 0 = the old smooth radial
//      gradient), sy (vertical squash, 1), rise (0.14), flicker (0.14, on
//      twos; x0.3 reduced), facets (0 = wobbly round bands; 7-12 = angular
//      polygon bands, stable per seed), mode, seed, time }.
// The bands are annuli, so every pixel is painted once.
export const GLOW_RAMP = [C.red, C.redDark, '#4a0d09', '#2c0806', '#170504']; // inner .. outer
const GM = 32; // vertices per band outline
const GCOS = Float64Array.from({ length: GM }, (_, m) => Math.cos((m / GM) * TAU));
const GSIN = Float64Array.from({ length: GM }, (_, m) => Math.sin((m / GM) * TAU));

// A red-family colour: hue within about 40 degrees of red, clearly saturated.
function isWarm(c) {
  const [r, g, b] = rgbOf(c);
  const lo = Math.min(g, b);
  return r >= g && r >= b && r - lo > 0.4 * r && Math.abs(g - b) < 0.66 * (r - lo);
}
// The warm multiply filter F at strength v (0 = white, no change; 1 = F).
function warmAt(F, v) {
  const q = Math.round(clamp(v, 0, 1.6) * 40) / 40;
  return memo(`wf:${F}:${q}`, () => {
    const [r, g, b] = rgbOf(F);
    const c = (k) => Math.round(clamp(255 + (k - 255) * q, 0, 255));
    return `rgb(${c(r)},${c(g)},${c(b)})`;
  });
}
const hex2 = (v) => v.toString(16).padStart(2, '0');
function filterOf(o) {
  if (o.filter) return o.filter;
  const c = o.color ?? C.red;
  return memo(`wfc:${c}`, () => {
    const [, g, b] = rgbOf(c);
    return `#ff${hex2(Math.round(255 - (255 - g) * 0.6))}${hex2(Math.round(255 - (255 - b) * 0.7))}`;
  });
}

// A smooth band outline (radii along the GM rays) made angular: a polygon
// through about K of its rays, each vertex's radius jittered +-15%, stable
// per seed (the flicker scales it, the facets never boil).
function facetRadii(rad, K, sd) {
  const V = [];
  for (let k = 0; k < K; k++) {
    const m = Math.min(GM - 1, Math.round((k + 0.5 + (h1(k, sd) - 0.5) * 0.7) * GM / K));
    if (V.length && m <= V[V.length - 1][0]) continue;
    V.push([m, rad[m] * (1 + 0.3 * (h1(k, sd + 1) - 0.5))]);
  }
  if (V.length < 3) return rad;
  const out = new Float64Array(GM);
  for (let v = 0; v < V.length; v++) {
    const [mi, ri] = V[v], [mj, rj] = V[(v + 1) % V.length];
    const xi = GCOS[mi] * ri, yi = GSIN[mi] * ri, Dx = GCOS[mj] * rj - xi, Dy = GSIN[mj] * rj - yi;
    const span = (mj - mi + GM) % GM || GM;
    for (let q = 0; q < span; q++) {   // where ray m crosses the straight edge from vertex i to j
      const m = (mi + q) % GM, den = GCOS[m] * Dy - GSIN[m] * Dx;
      out[m] = q === 0 || Math.abs(den) < 1e-9 ? ri : Math.max(0, (xi * Dy - yi * Dx) / den);
    }
  }
  return out;
}

// The outlines of n nested bands, outer first, as radii along GM rays from
// the innermost band's centre (ox, oy). Each band is a wobbly circle (or,
// with facets, a polygon) shifted off the centre (inner bands higher), kept
// inside the band outside it, so the annuli never overlap. r: the outer
// radius (default o.r).
function glowRings(o, n, seed, F, fl, r = o.r, facets = 0) {
  const rise = o.rise ?? 0.14;
  const jit = fl ? Math.min(2, fl / 0.14) * 0.04 : 0;
  const off = (b) => [(h1(b, seed + 2) - 0.5) * r * 0.1, -r * rise * (b / n)];
  const [ix, iy] = off(n - 1);
  const rings = [];
  let prev = null;
  for (let b = 0; b < n; b++) {
    const rr = r * (1 - (b / n) * 0.8) * (1 + (jit ? jit * (h1(F * 3 + b, seed + 1) - 0.5) : 0));
    const [bx, by] = off(b), dx = bx - ix, dy = by - iy;
    const a1 = h1(b, seed + 4) * TAU, a2 = h1(b, seed + 5) * TAU;
    let rad = new Float64Array(GM);
    for (let m = 0; m < GM; m++) {
      const c = GCOS[m], s = GSIN[m], th = (m / GM) * TAU;
      const R0 = rr * (1 + 0.07 * Math.sin(3 * th + a1) + 0.045 * Math.sin(5 * th + a2));
      const pd = dx * c + dy * s, cr = dx * s - dy * c;
      rad[m] = Math.max(0, pd + Math.sqrt(Math.max(0, R0 * R0 - cr * cr)));
    }
    if (facets >= 5) rad = facetRadii(rad, facets, (seed + 31 + b * 7) >>> 0);
    if (prev) for (let m = 0; m < GM; m++) rad[m] = Math.min(rad[m], prev[m] * 0.97);
    rings.push(rad); prev = rad;
  }
  return { rings, ox: o.x + ix, oy: o.y + iy * (o.sy ?? 1) };
}
function ringPath(ctx, x, y, sy, rad) {
  ctx.moveTo(x + GCOS[0] * rad[0], y + GSIN[0] * rad[0] * sy);
  for (let m = 1; m < GM; m++) ctx.lineTo(x + GCOS[m] * rad[m], y + GSIN[m] * rad[m] * sy);
  ctx.closePath();
}

// bands: 0, the old smooth radial gradient (opt-in only)
function glowSmooth(ctx, o, mode, s, sy, col) {
  const { x, y, r } = o;
  ctx.translate(x, y); ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  if (mode === 'tint') {
    const cols = o.colors ?? GLOW_RAMP;
    const a = clamp(s * (o.alpha ?? 0.85));
    cols.forEach((c, i) => { const [cr, cg, cb] = rgbOf(c); g.addColorStop((i / cols.length) * 0.85, `rgba(${cr},${cg},${cb},${a * (1 - (i / cols.length) * 0.55)})`); });
    const [er, eg, eb] = rgbOf(cols[cols.length - 1]);
    g.addColorStop(1, `rgba(${er},${eg},${eb},0)`);
  } else if (mode === 'warm') {
    const Fw = filterOf(o);
    g.addColorStop(0, warmAt(Fw, s)); g.addColorStop(0.5, warmAt(Fw, s * 0.45)); g.addColorStop(1, '#ffffff');
  } else {
    const [cr, cg, cb] = rgbOf(col);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.55 * s})`);
    g.addColorStop(0.35, `rgba(${cr},${cg},${cb},${0.28 * s})`);
    g.addColorStop(0.7, `rgba(${cr},${cg},${cb},${0.08 * s})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  }
  ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
}

// 'warm' bands filter at WARM_LO .. WARM_HI of the filter, outer to inner
// (production standard 21): a weaker light is smaller and has fewer bands,
// never paler, because a pale warm filter turns ivory dusty pink.
const WARM_LO = 0.75, WARM_HI = 1.15;
// the colour 'darken' takes for filter strength q: the filter laid on ivory
// (so lit stone turns the same salmon as under multiply)
function warmOnIvory(F, q) {
  const k = Math.round(clamp(q, 0, 1.6) * 40) / 40;
  return memo(`wi:${F}:${k}`, () => {
    const f = rgbOf(F), iv = rgbOf(C.ivory);
    const c = (i) => Math.round((iv[i] * clamp(255 + (f[i] - 255) * k, 0, 255)) / 255);
    return `rgb(${c(0)},${c(1)},${c(2)})`;
  });
}

export function glow(ctx, e, o) {
  const { x, y, r } = o;
  if (!(r > 0)) return;
  const seed = seedOf(o.seed, hashStr(`gl${x | 0},${y | 0}`));
  const s0 = o.strength ?? 1;
  let s = s0;
  const fl = (o.flicker ?? 0.14) * (e.reduced ? 0.3 : 1);
  const F = frameOf(e, o);
  if (fl) s *= 1 + fl * (h1(F, seed) - 0.5) * 2;
  if (s <= 0.003) return;
  const sy = o.sy ?? 1;
  const col = o.color ?? C.red;
  let mode = o.mode ?? (isWarm(col) ? 'warm' : 'lighter');
  if (mode === 'multiply') mode = 'warm';
  const n0 = Math.max(0, Math.round(o.bands ?? 3));
  ctx.save();
  ctx.globalCompositeOperation = mode === 'warm' ? (o.op === 'darken' ? 'darken' : 'multiply') : mode === 'tint' ? 'source-over' : mode;
  if (n0 === 0) glowSmooth(ctx, o, mode, s, sy, col);
  else {
    // 'warm': strength below 1 shrinks the light (radius x sqrt(strength))
    // and drops its inner bands (round(bands x strength), at least one);
    // the flicker moves the band edges (+-4%), not the colours; strength
    // above 1 deepens every band past the filter (up to 1.6)
    let n = n0, R = r, wq = 1;
    if (mode === 'warm') {
      const w = clamp(s0, 0, 1);
      n = clamp(Math.round(n0 * w), 1, n0);
      R = r * Math.sqrt(w) * (1 + 0.3 * (s / Math.max(1e-3, s0) - 1));
      wq = Math.min(1.6, Math.max(1, s0));
      if (!(R * (e.s ?? 1) > 0.5)) { ctx.restore(); return; }
    }
    const { rings, ox, oy } = glowRings(o, n, seed, F, fl, R, Math.round(o.facets ?? 0));
    let ramp = null, Fw = null, rgb = null;
    if (mode === 'tint') { ramp = (o.colors ?? GLOW_RAMP).slice().reverse(); if (o.alpha != null && o.alpha < 1) ctx.globalAlpha = clamp(o.alpha); }
    else if (mode === 'warm') Fw = filterOf(o);
    else rgb = rgbOf(col);
    for (let b = 0; b < n; b++) {
      const v = (b + 1) / n;
      let fs;
      if (ramp) fs = ramp[clamp(Math.round(clamp(s0) * (ramp.length - 1)) - (n - 1 - b), 0, ramp.length - 1)];
      else if (Fw) {
        const q = wq * (n > 1 ? WARM_LO + (WARM_HI - WARM_LO) * (b / (n - 1)) : lerp(WARM_LO, WARM_HI, clamp(s0)));
        fs = o.op === 'darken' ? warmOnIvory(Fw, q) : warmAt(Fw, q);
      } else fs = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(1, 0.4 * s * v)})`;
      ctx.beginPath();
      ringPath(ctx, ox, oy, sy, rings[b]);
      if (b + 1 < n) ringPath(ctx, ox, oy, sy, rings[b + 1]);
      ctx.fillStyle = fs; ctx.fill('evenodd');
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- distant fire
// Layout of a far burning city, in local units (x 0..w right, y 0 at the
// base, negative up). Cached per seed and size.
function distantSpec(seed, w, h) {
  const r = new RNG(seed ^ 0x2c1b3c6d);
  const acro = r.range(0.42, 0.62);
  const hill = (u) => h * (0.16 + 0.36 * Math.exp(-Math.pow((u - acro) / 0.26, 2)));
  const rects = [], tris = [], fires = [], windows = [], smokes = [];
  // houses climbing the hill, in two rows
  for (let row = 0; row < 2; row++) {
    let u = r.range(0, 0.02);
    while (u < 0.99) {
      const bw = r.range(0.016, 0.045);
      const base = hill(u + bw / 2) * (row ? 1.05 : 0.6);
      const bh = h * r.range(0.09, 0.2) * (row ? 1 : 0.85);
      const x0 = u * w, x1 = Math.min(1, u + bw) * w;
      rects.push([x0, -(base + bh), x1 - x0, base + bh]);
      if (r.chance(0.25)) tris.push([x0, -(base + bh), x1, -(base + bh), (x0 + x1) / 2, -(base + bh) - bh * 0.35]);
      if (r.chance(0.3)) windows.push([x0 + (x1 - x0) * r.range(0.25, 0.65), -(base + bh * r.range(0.3, 0.7)), Math.max(0.6, (x1 - x0) * 0.16)]);
      u += bw * r.range(0.8, 1.05);
    }
  }
  // towers
  const nt = r.int(3, 5);
  for (let i = 0; i < nt; i++) {
    const u = (i + r.range(0.2, 0.8)) / nt;
    const tw = w * r.range(0.018, 0.03), th = h * r.range(0.45, 0.75) + hill(u) * 0.5;
    rects.push([u * w - tw / 2, -th, tw, th]);
    for (let m = 0; m < 3; m++) rects.push([u * w - tw / 2 + (m / 2.5) * tw * 0.85, -th - tw * 0.22, tw * 0.22, tw * 0.22 + 0.5]);
  }
  // temple of Athena on the acropolis
  const tx = acro * w, tw2 = w * 0.09, tb = hill(acro) + h * 0.12;
  rects.push([tx - tw2 / 2, -(tb + h * 0.12), tw2, tb + h * 0.12]);
  tris.push([tx - tw2 * 0.56, -(tb + h * 0.12), tx + tw2 * 0.56, -(tb + h * 0.12), tx, -(tb + h * 0.21)]);
  // the lower city wall with crenels
  rects.push([0, -h * 0.13, w, h * 0.13]);
  for (let u = 0.01; u < 0.99; u += 0.022) rects.push([u * w, -h * 0.13 - h * 0.035, w * 0.011, h * 0.036]);
  // fires: big conflagrations and many small roof fires
  const nf = Math.round(w / Math.max(5, h * 0.16));
  for (let i = 0; i < nf; i++) {
    const u = r.range(0.03, 0.97);
    const big = r.chance(0.25) || Math.abs(u - acro) < 0.12;
    const fh = h * (big ? r.range(0.4, 0.75) : r.range(0.14, 0.3));
    fires.push({ x: u * w, y: -hill(u) * r.range(0.7, 1.1) - h * 0.06, w: fh * r.range(1.0, 1.8), h: fh, seed: r.int(1, 1e9), front: r.chance(0.15) });
  }
  // smoke columns
  const ns = r.int(2, 4);
  for (let i = 0; i < ns; i++) {
    const u = r.range(0.15, 0.85);
    smokes.push({ x: u * w, y: -hill(u) - h * 0.2, w: h * r.range(0.4, 0.7), h: h * r.range(2.4, 3.6), seed: r.int(1, 1e9) });
  }
  return { rects, tris, fires, windows, smokes, acro };
}

// A burning city on a far headland: red sky glow, a smoke plume, a black
// skyline with flames behind and among the rooftops, embers, and an
// optional reflection on the water. o: { x (LEFT edge), y (base line), w,
// h (skyline height; glow and smoke rise above it), seed, intensity 0..1,
// glow: true, smoke: true, wind (smoke lean, default 0.35),
// reflect: { y (waterline), h (depth) } | null, silhouette (colour) }.
export function distantFire(ctx, e, o) {
  const { x, y, w, h } = o;
  if (!(w > 0) || !(h > 0)) return;
  const I = clamp(o.intensity ?? 1, 0, 1.5);
  const seed = seedOf(o.seed, hashStr('troy-far'));
  const sp = memo(`df${seed}:${w | 0}:${h | 0}`, () => distantSpec(seed, w, h));
  const F = frameOf(e, o);
  ctx.save();
  // crimson sky glow over the city: posterised bands of the red ramp (no
  // violet); its inner bands sit higher, where the old additive heat glow was
  // (only over the sky and the land: it stops at the waterline)
  if (o.glow !== false && I > 0) {
    const gx = x + w * sp.acro, R = Math.max(w * 0.6, h * 2.8) * 0.74; // the old soft glow's visible extent
    const wl = o.reflect ? o.reflect.y : y + h * 0.2;
    ctx.save();
    ctx.beginPath(); ctx.rect(gx - R * 1.3, wl - R, R * 2.6, R); ctx.clip();
    glow(ctx, e, { x: gx, y: y - h * 0.1, r: R, sy: 0.45, strength: Math.min(1, I), mode: 'tint', bands: 3, rise: 0.3, flicker: 0.05, colors: GLOW_RAMP, seed: seed + 1, time: o.time });
    ctx.restore();
  }
  // smoke behind the skyline
  // (columns under ~40 device px wide are drawn as billowing masses, as in
  // s08, so they read as plumes rather than strings of beads; bigger ones keep
  // the approved classic look)
  if (o.smoke !== false && I > 0) {
    for (const s of sp.smokes) {
      const sh = s.h * Math.min(1, 0.4 + I);
      // a far plume: 3-4 big billows from a wide base, widening toward the
      // top, the underside of its lowest third banded in the glow ramp
      if (s.w * e.s < 40) smoke(ctx, e, { x: x + s.x, y: y + s.y, w: s.w * 1.65, h: sh, seed: s.seed, drift: o.wind ?? 0.35, speed: s.h / 10, count: 5, grow: 1.9, lit: 0.68, palette: FAR_PAL, sky: o.sky, time: o.time, group: 1 });
      else smoke(ctx, e, { x: x + s.x, y: y + s.y, w: s.w, h: sh, seed: s.seed, drift: o.wind ?? 0.35, speed: s.h / 10, count: 16, grow: 2.4, lit: 0.9, sky: o.sky, time: o.time, group: 4, style: 'classic' });
    }
  }
  // flames behind the rooftops
  const back = [], front = [];
  if (I > 0) for (const f of sp.fires) {
    const spec = { x: x + f.x, y: y + f.y, w: f.w, h: f.h * I, seed: f.seed, intensity: Math.min(1, I), time: o.time, wind: (o.wind ?? 0.35) * 0.5, lod: o.lod ?? (f.h * e.s < 9 ? 'tiny' : 'small'), style: 'classic' };
    (f.front ? front : back).push(spec);
  }
  if (back.length) flames(ctx, e, back);
  // black skyline
  ctx.beginPath();
  for (const [rx, ry, rw, rh] of sp.rects) ctx.rect(x + rx, y + ry, rw, rh);
  for (const [ax, ay, bx, by, cx, cy] of sp.tris) { ctx.moveTo(x + ax, y + ay); ctx.lineTo(x + bx, y + by); ctx.lineTo(x + cx, y + cy); ctx.closePath(); }
  ctx.fillStyle = o.silhouette ?? '#020310';
  ctx.fill();
  // burning windows
  if (I > 0.05) {
    ctx.beginPath();
    for (let i = 0; i < sp.windows.length; i++) {
      if (h1(F * 3 + i, seed + 5) < 0.2) continue;
      const [wx, wy, ws] = sp.windows[i];
      ctx.rect(x + wx - ws / 2, y + wy - ws * 0.7, ws, ws * 1.4);
    }
    ctx.fillStyle = C.red; ctx.fill();
  }
  if (front.length) flames(ctx, e, front);
  if (I > 0) embers(ctx, e, { x: x + w * sp.acro, y: y - h * 0.3, w: w * 0.7, h: h * 2.2, count: Math.round(10 + w / 20), seed: seed + 9, wind: o.wind ?? 0.35, size: 0.8, time: o.time });
  // reflection on the water: broken horizontal strokes, flickering on twos
  if (o.reflect && I > 0) {
    const ry = o.reflect.y, rh = o.reflect.h ?? h * 1.5;
    const px = 1 / e.s;
    const cols = [C.red, C.redHot, C.cream];
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      const n = c === 2 ? 8 : c === 1 ? 14 : 26;
      for (let i = 0; i < n; i++) {
        const a = h1(i * 7 + c, seed + 11 + F * 13);
        const v = h1(i * 3 + c * 101, seed + 12 + F * 7);
        const d = Math.pow(v, 1.3);
        const cx = x + w * (sp.acro + (a - 0.5) * (0.75 - d * 0.55) * (c === 2 ? 0.4 : c === 1 ? 0.7 : 1));
        const len = w * (0.015 + 0.06 * (1 - d)) * (c === 2 ? 0.5 : 1);
        ctx.rect(cx - len / 2, ry + d * rh, len, Math.max(px * 1.2, rh * 0.012));
      }
      ctx.fillStyle = cols[c]; ctx.fill();
    }
  }
  ctx.restore();
}
