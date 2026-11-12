// X · ZEUS SEES THE BROKEN GUEST-LAW. The Greeks broke the law of the
// guest, and the god of guests sees it. We open on the burning skyline,
// rooftops black against the red glow, and crane up to the thunderhead
// that is Zeus: billows for hair and beard, a heavy brow, eyes cast down at
// the city. Lightning strikes on the downbeats of bars 20-22 (beatAt(80),
// beatAt(84), beatAt(88)) and lights him from within; the last strike is
// his own bolt, two inked forks falling steeply from his lower beard onto
// the burning skyline.
//
// Layout (world units, the landscape design frame is 1600x900): the
// storm's flat base hangs at DECK; the far skyline, the only part of the
// city that burns in landscape, stands from just above DECK down to ~805,
// its towers in front of the storm's fire-lit underside. Below it the near
// city is black roofs against bands of red smoke, so the caption (bottom
// ~16% of every frame) always sits on dark, quiet ground: no fire, glow or
// lit window ever enters it (checked with evidence/tmp/C3/band.mjs; the
// near row's smoke band burns only through the landscape opening, before
// the caption band rises to it: evidence/tmp/C3/r3/nearglow.mjs). The tall
// phone frame sees more of the near city: its back row burns there.
//
// Colour: every red is an opaque posterised band (C.redDeep -> C.red), never
// a translucent red over navy (that mixes to plum, production standard 15).
//
// Perf: the big plates bake at reduced resolution (the grain hides it); Zeus
// is GPU sphere passes covering only their spheres; every ink and pass
// declares its bbox. Flames spend detail by row and only the fires in view
// are drawn (actor budget, see notes/status-C3.md).

import { sky } from '../kit/nature.js';
import { C, mat } from '../kit/palette.js';
import { cityOfTroy, cityLayout, silhouetteMat } from '../kit/city.js';
import { flames, smoke, embers, lightning, strike } from '../kit/fx.js';
import { paintZeus, zeusLayout } from '../assets/zeus.js';
import { RNG, clamp } from '../engine/rng.js';
import { beatAt, START } from '../story.js';

const DUR = 6.78;
const PX0 = -600, PX1 = 2200, PDX = 6;   // the glow profiles' sampling (see profileOf)
const T0 = START.s10;
const local = (n) => Math.max(0, Math.round((beatAt(n) - T0) * 1e6) / 1e6);

// The moon keeps its screen position in the last frame, where s11 dissolves
// in (s11's moon {1441, 64, r 14} through its first focus (760, 452, 1600
// wide)): in focus units it sits at (+0.4257, -0.4315) of the frame.
const END = { x: 800, y: 510, w: 1600, h: 900 };
const MOON = { x: Math.round(END.x + 0.42568 * END.w), y: Math.round(END.y - 0.43149 * END.h), r: 14 };
// the god stands a little left of centre, his moon-side shoulder climbing
// toward the moon (upper right): a towering thunderhead, not a centred mound
const ZEUS0 = { x: 760, y: 190, U: 190, seed: 'zeus' };
const LAY = zeusLayout(ZEUS0);
const DECK = LAY.deckY;                          // flat underside of the storm (~711)

// The city is drawn back to front as rows of black houses, each standing in
// a band of smoke lit red from the streets below it (C.redDeep -> C.red,
// brightest in lobes over the burning districts): rooftops black against red
// glow, row after row. The far rows are the skyline under the storm (their
// towers rise in front of its fire-lit base); the near rows are the black
// foreground that carries the caption. `glow` is the band drawn just before
// the row: [top y, base colour, [[colour, height above the roofline], ...]]
// (see halo()); `glowP` replaces it in the tall phone frame.
const ROWS = [
  { y: 794, rows: 2, depth: 22, scale: 0.74, acropolis: 0.52, fireRate: 0.34, bottom: 830, seed: 'troy-s10-a' },
  { y: 824, scale: 0.88, fireRate: 0.32, bottom: 870, seed: 'troy-s10-c', glow: [784, C.redDeep, [['#5c1412', 22], [C.redDark, 12], [C.red, 5]]] },
  { y: 912, scale: 1.5, fireRate: 0.3, bottom: 1010, seed: 'troy-s10-n1', dark: 0.98, near: true, glow: [810, '#250806', [[C.redDeep, 16]]],
    glowP: [810, C.redDeep, [['#5c1412', 16], [C.redDark, 9], [C.red, 4]]] },
  // the tall phone frame sees further down the street, where the caption
  // band of its last framing (y > ~955) still leaves room: one more row
  // burns there, in a band of its own (portrait only)
  { y: 975, scale: 1.7, fireRate: 0.34, bottom: 1080, seed: 'troy-s10-p', dark: 0.97, near: true, only: 'portrait',
    glow: [862, '#2c0906', [['#5c1412', 18], [C.redDark, 10], [C.red, 4]]] },
  { y: 1100, scale: 2.1, fireRate: 0, bottom: 1340, seed: 'troy-s10-n2', dark: 0.98, near: true, glow: [960, '#120504', [['#220806', 12]]] },
].map((o) => ({ x0: -320, x1: 1920, rows: 1, dark: 0.82, acropolis: null, ...o }));
const PROW = ROWS.findIndex((o) => o.only === 'portrait');
const RL = ROWS.map((o) => cityLayout(o));
const NFAR = 2;   // rows 0..1 are the far skyline, the rest the near city
const CL = { fires: RL.slice(0, NFAR).flatMap((l) => l.fires), roofs: RL.slice(0, NFAR).flatMap((l) => l.roofs), windows: [] };
// a row's lit windows and fires must stand clear of the band in front of it
RL.forEach((l, i) => {
  const next = ROWS[i + 1]?.glow?.[0] ?? Infinity;
  l.windowsShown = l.windows.filter((w) => w.y + w.h < next - 2);
  l.firesShown = l.fires.filter((f) => f.y < next - 2);
});
CL.windows = RL.slice(0, NFAR).flatMap((l) => l.windowsShown);
const PROF = RL.map(profileOf);

// ---- lightning on the downbeats
const STRIKE_T = [local(80), local(84), local(88)];
// the roof nearest x that stands clear below the storm's base
const roofOf = (lay, x, minY = DECK + 30) => lay.roofs.filter((q) => q.y > minY).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - x) - Math.abs((b.x0 + b.x1) / 2 - x))[0];
const boltTo = (x0, y0, q, seed, branches, width) => ({ x0, y0, x1: (q.x0 + q.x1) / 2, y1: q.y + 2, seed, branches, width });
const STRIKES = [
  // strike 1 opens the shot: out from under the base, down onto a near roof
  { t0: STRIKE_T[0], w: 0.55, len: 0.62, clip: true, bolts: [boltTo(620, DECK - 8, roofOf(RL[NFAR], 800), 11, 8, 5)] },
  // strike 2 lights him from within: the bolt leaves the storm's lower body
  // inside the moon-side shoulder, as strike 3 does, and falls ~200 units
  // steeply onto a far roof (out of the base it read as a small spark; the
  // far row keeps its end above the controls' chapter line as the crane rises)
  { t0: STRIKE_T[1], w: 0.8, len: 0.62, clip: false, bolts: [boltTo(1040, DECK - 120, roofOf(RL[0], 940, 760), 23, 8, 5)] },
  // strike 3, the strongest, is the god's own bolt: two forks leave his lower
  // beard and fall steeply (~40-50 degrees, ~200 units) onto the burning
  // skyline, inked so they read over the lit cloud
  { t0: STRIKE_T[2], w: 1, len: 1.0, clip: false, bolts: [
    // (fork A ends on a far-row roof above the controls' chapter line at 16:9)
    boltTo(LAY.beardTip[0] + 10, LAY.beardTip[1] - 130, roofOf(RL[0], 1040, 765), 37, 10, 6),
    { ...boltTo(LAY.beardTip[0] - 10, LAY.beardTip[1] - 80, roofOf(RL[1], 580, 770), 41, 7, 5.5), t1: 0.07 },
  ] },
];
// every bolt is inked: a dark contour outside its pale halo, as a print
// draws it, so it reads over the lit cloud as well as over the red glow.
// One lightning() call draws all three rings (ink at 2 x the core, pale halo
// at 1.4 x, white core), so the ink can never be laid over the halo: two
// calls, an inked one and a haloed one, put the dark ring at 1.8 x the core
// and the pale one at 1.4 x, which on a tall frame left a 3 CSS px core
// between two dark edges and the fork read as a twig over the white beard.
const BOLT_HALO = '226,222,214', BOLT_INK_K = 0.2;
// and on a tall frame the whole bolt is drawn wider, since the frame shows
// the same world units in half the pixels
const BOLT_W_PORTRAIT = 1.3;
// flash strength at t (the lit layer takes every strike short; the screen
// flash lets the last one ring for a second)
const flashAt = (t, reduced, long = true) => Math.max(...STRIKES.map((s) => strike(t, s.t0, { reduced, len: long ? s.len : 0.62 }) * s.w));
// the lit plate on twos (counted from each strike, so it lands with the
// bolt), on or off: a hard flicker, never two plates laid over each other
// (the old 0.55 / 0.25 steps ghosted the sphere outlines of both). The
// strike's weight sets how long it flickers: strike 1 two frames of twos,
// strike 2 three, strike 3 four (on, off, on, on, on).
const litAt = (t) => {
  let a = 0;
  for (const s of STRIKES) { const d = t - s.t0; if (d >= 0 && d < 0.7) a = Math.max(a, strike(s.t0 + Math.floor(d * 12 + 1e-6) / 12, s.t0, { len: 0.62 }) * s.w); }
  return a > 0.45 ? 1 : 0;
};

// ---- fire. The caption band is the bottom ~16% of the frame; the camera
// only ever moves up, so a fire stays out of it for the whole shot when it
// is above the band of the final framing: y < ~806 in landscape (END), and
// y < ~950 in the tall phone frame, which also burns the first near row.
const PORTRAIT_FIRE_Y = 930;
const LAND_FIRE_Y = 800;
const front = RL[NFAR - 1].firesShown;
const BIG = new Set([...front].sort((a, b) => b.h - a.h).slice(0, 3));
const LOD = ['tiny', 'small', 'small'];
const allFires = RL.slice(0, NFAR + 1).flatMap((l, i) => l.firesShown.map((f) => ({ ...f, row: i, h: f.h * (i === NFAR ? 1.1 : 1.15), w: f.w * 1.08, seed: f.seed, wind: 0.15, lod: BIG.has(f) ? 'auto' : LOD[i] })));
const FIRES_L = allFires.filter((f) => f.row < NFAR && f.y < LAND_FIRE_Y);
const prowFires = RL[PROW].firesShown.map((f) => ({ ...f, row: PROW, h: f.h * 1.1, w: f.w * 1.05, seed: f.seed, wind: 0.15, lod: 'small' }));
// (and the portrait-only row keeps no fire below y 860: with the controls
// showing, the caption box of the last framing rises to ~y 860, and a flame
// tongue stood beside the chapter line)
const PORTRAIT_CTL_Y = 860;
const FIRES_P = [...allFires, ...prowFires].filter((f) => f.y < PORTRAIT_FIRE_Y && !(f.row === PROW && f.y > PORTRAIT_CTL_Y));
const WINDOWS_L = CL.windows.filter((w) => w.y + w.h < LAND_FIRE_Y);
const WINDOWS_P = [...CL.windows, ...RL[NFAR].windowsShown, ...RL[PROW].windowsShown].filter((w) => w.y + w.h < PORTRAIT_FIRE_Y);
const portrait = (e) => e.W / e.H < 0.82;
// only the fires in view are drawn; the list is kept while the view moves
// less than ~40 units, so flames() can reuse its batched paths between frames
const inView = (e) => {
  const v = e.view, P = portrait(e), k = `${P}:${Math.round(v.ox / 40)}:${Math.round(v.oy / 40)}:${Math.round(v.vw / 40)}`;
  if (e.st.fireKey !== k) {
    e.st.fireKey = k;
    e.st.fires = (P ? FIRES_P : FIRES_L).filter((f) => f.x + f.w * 2 > v.ox - 40 && f.x - f.w * 2 < v.ox + v.vw + 40 && f.y - f.h * 2.5 < v.oy + v.vh + 40 && f.y > v.oy - 40);
  }
  return e.st.fires;
};

// where the skyline burns hardest (bins of fire width along x): the storm's
// underside glows crimson only over these districts
const LOBES = (() => {
  const bins = new Map();
  for (const f of CL.fires) { const k = Math.round(f.x / 260); bins.set(k, (bins.get(k) || 0) + f.w); }
  const mx = Math.max(...bins.values());
  const r = new RNG('s10-lobes');
  return [...bins.entries()].map(([k, m]) => {
    const q = m / mx;
    return { x: k * 260 + r.range(-50, 50), y: DECK + 62 + r.range(-6, 6), rx: 150 + 170 * q, ry: 26 + 26 * q, a: 0.32 + 0.56 * q };
  });
})();
// fire under the storm at world x (0..1): the underside glows over the
// burning districts and goes dark between them
const fireAt = (x) => clamp((Math.max(...LOBES.map((L) => L.a * Math.exp(-(((x - L.x) / (L.rx * 0.4)) ** 2)))) - 0.15) / 0.75);
const ZEUS = { ...ZEUS0, fireAt };

// smoke climbing from the worst fires into the storm, drawn behind it, so
// the storm swallows the columns; no moonlight reaches under it
const rs = new RNG('s10-smoke');
// (slim columns: at 44-64 units wide against h 83-109 they were as wide as
// they were tall and read as navy bushes standing on the roofline)
const SMOKES = [[250, 32], [520, 25], [1000, 34], [1290, 28]].map(([x, w]) => {
  const f = [...RL[0].fires].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  // (only the stretch under the storm's base shows: the column ends a little
  // inside it, so no hidden smoke is rendered; WebKit pays ~10 ms a column)
  return { x: f.x, y: f.y - 4, w: w * rs.range(0.9, 1.1), h: f.y - DECK + 45, seed: rs.int(1, 1e9), drift: rs.range(0.12, 0.3) };
});
const SMOKE_PAL = { base: '#030410', half: '#141a3c', lit: '#323a6c', under: ['#8a2114', '#521009'], sky: '#120c2e' };

// internals for test plates (tests/C3-*.js); the story only uses the default
export const S10 = { MOON, ZEUS, LAY, DECK, ROWS, RL, CL, FIRES_L, FIRES_P, WINDOWS_L, WINDOWS_P, LOBES, SMOKES, STRIKES, STRIKE_T, flashAt, litAt, END, get nearGlowAt() { return nearGlowAt; } };

// The glow behind a row of houses: the silhouette's top edge, run over the
// gaps and smoothed, plus how hard the row burns at x (0..1). The glow is
// drawn as stepped hard-edged bands following that edge, brightest right
// behind the roofs and taller over the burning districts.
function profileOf(lay) {
  const n = Math.ceil((PX1 - PX0) / PDX) + 1, top = new Float32Array(n).fill(Infinity), den = new Float32Array(n);
  for (const b of lay.B) {
    if (b.kind === 'tower') continue;   // the glow rides over the roofs, the towers stand out of it
    const t = b.base - b.h - (b.kind === 'gable' ? b.w * 0.2 : b.roofD);
    for (let i = Math.max(0, Math.floor((b.x - PX0) / PDX)); i <= Math.min(n - 1, Math.ceil((b.x + b.w - PX0) / PDX)); i++) top[i] = Math.min(top[i], t);
  }
  const R = 8, M = 6, run = new Float32Array(n), sm = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) m = Math.min(m, top[j]); run[i] = Number.isFinite(m) ? m : lay.y; }
  for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let j = Math.max(0, i - M); j <= Math.min(n - 1, i + M); j++) { a += run[j]; c++; } sm[i] = a / c; }
  for (const f of lay.fires) for (let i = 0; i < n; i++) { const d = (PX0 + i * PDX - f.x) / 90; if (d * d < 9) den[i] += f.w * Math.exp(-d * d); }
  const mx = Math.max(1e-6, ...den);
  for (let i = 0; i < n; i++) den[i] = Math.min(1, den[i] / (mx * 0.6));
  return { n, top: sm, den };
}
// steps: [[colour, height above the edge], ...] from the outermost (darkest)
// in; each is a hard-edged polygon filled down to y1
function halo(ctx, prof, steps, y1) {
  for (const [col, d] of steps) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(PX0, y1);
    for (let i = 0; i < prof.n; i++) ctx.lineTo(PX0 + i * PDX, prof.top[i] - d * (0.3 + prof.den[i]));
    ctx.lineTo(PX1, y1); ctx.closePath(); ctx.fill();
  }
}

// a wavy hard-edged band (smoke lying in the streets), filled opaque
function band(ctx, x0, x1, y0, y1, wave, seed) {
  const r = new RNG(seed);
  const a1 = r.range(0, 6.28), a2 = r.range(0, 6.28), k1 = r.range(0.006, 0.01), k2 = r.range(0.017, 0.026);
  ctx.beginPath(); ctx.moveTo(x0, y1);
  for (let x = x0; x <= x1; x += 12) ctx.lineTo(x, y0 + wave * (Math.sin(x * k1 + a1) + 0.5 * Math.sin(x * k2 + a2)));
  ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();
}

// the smoke band a row stands in, lit red from the streets behind it
function glowBand(p, i, glow, y1) {
  const [top, base, steps] = glow;
  p.ink((ctx) => { ctx.fillStyle = base; band(ctx, -600, 2200, top, y1, 4, `glow${i}`); halo(ctx, PROF[i], steps, y1); },
    { bbox: { x: -600, y: top - 12, w: 2800, h: y1 - top + 12 } });
}
// which: 'far' (rows 0..NFAR-1, then row NFAR's band: dark in landscape,
// burning in the tall phone frame), 'glow' (row NFAR's burning band, for the
// landscape opening) or 'near' (the houses of rows NFAR.. and their bands)
function cityRows(p, which) {
  // black houses (ink black: a navy black would mix plum with the red at
  // every edge), and the roof terraces catch the red of the smoke above
  // them; the near rows are darker still, pure silhouettes
  const sil = mat(silhouetteMat(p), { ramp: ['#030304', '#080809', '#0e0e10', '#2e0b08', '#5a150e', '#8a2116'], thr: [0.12, 0.24, 0.285, 0.6, 0.78] });
  // the tall phone frame: its coverage is taller than wide (the stage
  // re-bakes every layer when the viewport changes)
  const P = p.region.w < p.region.h;
  if (which === 'glow') {
    // the portrait bakes nothing here (cityFar already burns that band)
    if (P) { p.ink(() => {}, { bbox: { x: 800, y: 800, w: 2, h: 2 } }); return; }
    glowBand(p, NFAR, ROWS[NFAR].glowP, ROWS[NFAR].bottom);
    return;
  }
  ROWS.forEach((o, i) => {
    if (o.only && (o.only === 'portrait') !== P) return;
    if (which === 'far' ? i > NFAR : i < NFAR) return;
    const glow = (P && o.glowP) || o.glow;
    if (glow && (which === 'far' || i > NFAR)) glowBand(p, i, glow, o.bottom);
    if (which === 'near' || i < NFAR) cityOfTroy(p, { ...o, mat: sil });
  });
}
// the near band burns through the opening and dies down on twos from t 0.8
// to 1.6, before the idle caption box (its top 16% above the frame bottom)
// rises to its roofline (~t 1.8 with the 3.6 key)
const NEAR_GLOW = [0.8, 1.6];
const nearGlowAt = (t) => clamp(1 - (Math.floor(t * 12) / 12 - NEAR_GLOW[0]) / (NEAR_GLOW[1] - NEAR_GLOW[0]));

export default {
  id: 's10', dur: DUR, night: true,
  caption: 'ZEUS SEES THE BROKEN GUEST-LAW',
  // Zeus fills the top of the frame; the caption sits over the dark near city
  captionPos: 'bottom', captionPosPortrait: 'bottom',
  // reduced motion holds the last framing (t 6.7 is the END framing to
  // within 0.03 units; DUR itself would sample s11's first frame): the face
  // over the burning city
  reducedT: 6.7,
  // the crane reaches the face by 3.6, so strike 2 (local 2.26) lights a god
  // whose eyes are in frame (iris ~6% inside the top edge), while the opening
  // still holds on the burning skyline (its centre has drifted ~16 units by
  // t 0.6, 11 with the old 4.35 key) and the full face settles ~0.9 s before
  // strike 3
  cam: [
    { t: 0, x: 800, y: 742, w: 1060, h: 596 },
    { t: 3.6, x: 800, y: 500, w: 1600, h: 900, ease: 'inOutSine' },
    { t: DUR, ...END, ease: 'inOutSine' },
  ],
  camPortrait: [
    { t: 0, x: 800, y: 780, w: 470, h: 1017 },   // the burning city, the storm's underside above
    { t: 4.35, x: 800, y: 430, w: 740, h: 1601, ease: 'inOutSine' },
    // (y 440: with the controls showing the caption box top sits at ~y 860,
    // under the portrait row's smoke band rather than in it)
    { t: DUR, x: 800, y: 440, w: 700, h: 1515, ease: 'inOutSine' },
  ],
  items: [
    { layer: 'sky', depth: 1, res: 0.5, paint(p) {
      sky(p, { y0: -1500, y1: 1700, top: '#030a3e', mid: '#071460', low: '#0a1a70' });
      p.ink((ctx) => {
        // under the storm the low sky is smoke lit from below: hard bands
        // stepping from red-black to red, brightest right behind the roofs
        ctx.fillStyle = '#170606'; band(ctx, -600, 2200, DECK - 40, 1300, 3, 'sky0');
        halo(ctx, PROF[0], [[C.redDeep, 46], ['#5c1412', 30], [C.redDark, 17], [C.red, 7]], 1300);
      }, { bbox: { x: -600, y: DECK - 50, w: 2800, h: 1400 } });
    } },
    // the moon (s11 matches its position for the dissolve): drawn per frame,
    // so the small white disc stays crisp over the half-resolution sky
    { actor: 'moon', depth: 1, draw(ctx) { ctx.fillStyle = C.moon; ctx.beginPath(); ctx.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2); ctx.fill(); } },
    // smoke rising behind the storm (its tops vanish into the base). A faint
    // crescent of moonlight from the upper left reaches each billow (moon
    // 0.22: at 0 every column was one untextured navy mass) and the red
    // underlight of the streets catches their bases (standard 6).
    { actor: 'smoke', depth: 1, draw(ctx, e) {
      for (const s of SMOKES) smoke(ctx, e, { ...s, palette: SMOKE_PAL, moon: 0.22, light: [-0.35, -0.95], lit: 1.6, speed: 18, grow: 1.2, count: 11 });
    } },
    { layer: 'zeus', depth: 1, res: 0.75, paint(p) { paintZeus(p, ZEUS); } },
    // (reduced motion never cross-fades the two plates: at 0.2-0.55 alpha the
    // moonlit and lit sphere outlines ghost through each other, the white tops
    // vanish into a pale double exposure and the terminators go soft - the
    // whole plate turns into the flat mosaic the normal path avoids by
    // flickering 0 or 1. Under reduced motion the god keeps his one moonlit
    // plate and the strike reads from the bolt plus the soft neutral screen
    // lift in post(), so there is no strobe either, production standard 8.)
    { layer: 'zeusLit', depth: 1, res: 0.75, alpha: (e) => (e.reduced ? 0 : litAt(e.t)), paint(p) { paintZeus(p, { ...ZEUS, lit: true, litUV: [0, 2.0] }); } },
    // the city in three layers: the far rows (the burning skyline) with the
    // smoke band of the first near row, that band burning (landscape only,
    // faded out on twos as the crane lifts the caption band up to it), and the
    // near city in front. The opening is then black near rooftops against red
    // glow too, and the END caption still sits on dark, quiet ground.
    { layer: 'cityFar', depth: 1, res: 0.75, paint(p) { cityRows(p, 'far'); } },
    // (flat bands and black silhouettes: these two bake at lower resolution)
    { layer: 'nearGlow', depth: 1, res: 0.5, alpha: (e) => (portrait(e) || e.reduced ? 0 : nearGlowAt(e.t)), paint(p) { cityRows(p, 'glow'); } },
    { layer: 'cityNear', depth: 1, res: 0.6, paint(p) { cityRows(p, 'near'); } },
    { actor: 'fires', depth: 1, draw(ctx, e) {
      const P = portrait(e);
      // burning windows, flickering on twos (one path per colour)
      const F = Math.floor(e.t * 12);
      for (const hot of [false, true]) {
        ctx.beginPath();
        for (const w of (P ? WINDOWS_P : WINDOWS_L)) if ((((F + w.x) | 0) % 7 < 1) === hot) ctx.rect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = hot ? '#e0482a' : '#c62c1f'; ctx.fill();
      }
      flames(ctx, e, inView(e));
      embers(ctx, e, { x: 800, y: 790, w: 1700, h: 380, count: 60, seed: 'e10', wind: 0.12 });
      for (const S of STRIKES) {
        for (const b of S.bolts) {
          const a = strike(e.t, S.t0 + (b.t1 ?? 0), { reduced: e.reduced, len: 0.62 });
          if (a <= 0) continue;
          ctx.save();
          // strike 1 comes out from under the storm's flat base (clip); with
          // reduced motion the camera holds the last framing, where strike
          // 1's roof lies under the caption: the bolt stops above it
          const v = e.view, y1 = e.reduced ? v.oy + v.vh * 0.83 : DECK + 1400;
          if (S.clip || e.reduced) { ctx.beginPath(); ctx.rect(-600, S.clip ? DECK - 6 : -1000, 2800, y1 - (S.clip ? DECK - 6 : -1000)); ctx.clip(); }
          lightning(ctx, e, { ...b, strength: a * (0.6 + 0.4 * S.w),
            width: b.width * (P ? BOLT_W_PORTRAIT : 1), halo: BOLT_HALO, outline: BOLT_INK_K });
          ctx.restore();
        }
      }
    } },
  ],
  // a near-neutral flash ('screen', so it lifts the night and never burns
  // the lit cloud to white; a blue one over the red smoke reads plum),
  // stepped on twos with the lit plate and short, so the print's blacks are
  // never a translucent grey veil for long (black lifts to ~15 at most).
  // Under reduced motion this lift is the whole flash: one soft half-sine
  // pulse per strike (strike()'s reduced envelope, peak 0.55) at a smaller
  // gain, so the frame brightens and settles without a step.
  post(ctx, e) {
    const a = e.reduced ? flashAt(e.t, true, false) * 0.06 : litAt(e.t) * 0.08;
    if (a <= 0.004) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(186,183,178,${a})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
  },
};
