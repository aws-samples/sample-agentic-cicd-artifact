// The cast, drawn per frame in palette colours (plates 1, 2, 4 and 5): crisp
// inked silhouettes, 2–4 flat tones per material, simple folds, cloaks that
// sway and walk cycles on twos. Level of detail follows the on-screen size:
//   tiny   (< ~12 css px)  crowd glyphs: dots and strokes, like the dot-army
//   small  (~12–150 px)    readable silhouettes: crest, shield, spear, cloak
//   medium (≥ ~150 px)     Corinthian helmet, cuirass lines, folds, ornament
//
// Everything is a pure function of its inputs plus `e`. Coordinates: x, y are
// the feet on the ground (the lowest foot point), h is the standing height to
// the top of the head, dir = +1 faces right. Each figure returns anchors in
// world units: { hands: [[x, y], [x, y]], head: [x, y], top, tip }.
//
// Shading: each part is filled with its base tone, then the side away from
// the light is uncovered by an offset copy (posterised crescent) and the lit
// edge gets a thin band (day: lighter tone; night: moonlit rim). Day light is
// upper left, the moon upper right; `o.light` (-1 | +1) overrides the side.

import { C } from './palette.js';

const TAU = Math.PI * 2;
const { sin, cos, abs, min, max, floor, hypot, PI } = Math;
const lerp = (a, b, t) => a + (b - a) * t;
const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const hash = (n) => { const s = sin(n * 127.1 + 311.7) * 43758.5453; return s - floor(s); };

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(lerp(ch(pa, s), ch(pb, s), t));
  return `#${((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1)}`;
}

// ------------------------------------------------------------------ tones
// d = shadow, b = base, l = lit, h = highlight / ornament
const tn = (d, b, l, h) => ({ d, b, l, h });
const DAY = {
  // Day cast shadows are near-black and neutral (standard 25), the family s02's
  // horse and figures already use; the old navy 0.34 printed at L ~150 on sand.
  ink: C.ink, rim: null, shadow: 'rgba(18,20,17,0.62)', shaft: '#2a2119',
  black: tn('#030305', '#121318', '#2c303c', '#b9c1d6'),
  bronze: tn('#2a1f12', '#6e5b3c', '#a89064', '#e6d6ad'),
  navy: tn('#03051a', '#0f1748', '#22337e', '#4560b0'),
  blue: tn('#1a2c78', '#2c48a8', '#4a68c0', '#8099d4'),
  red: tn('#4e0c07', '#a8231a', '#c62c1f', '#e2563c'),
  linen: tn('#8f887c', '#d6cec1', '#efe9de', '#fbf8f1'),
  skin: tn('#5e3020', '#a8705a', '#c99278', '#e2b59a'),
  hair: tn('#030304', '#0e0e12', '#2a2c36', '#5a5e70'),
  white: tn('#9a958c', '#ddd7cc', '#f5f1e8', '#ffffff'),
  leather: tn('#0e0a07', '#2a1f16', '#4d3d2c', '#7c6847'),
  steel: tn('#3c414f', '#7d879f', '#c8cfdf', '#ffffff'),
  flame: ['#c62c1f', '#e0482a', '#f6d9a0', '#fbf8f1'],
};
const NIGHT = {
  ink: '#02030a', rim: '#c3cdec', shadow: 'rgba(1,3,24,0.52)', shaft: '#15100c',
  black: tn('#010207', '#090b14', '#1a1f30', '#7f8bb3'),
  bronze: tn('#100f13', '#36322f', '#5a5246', '#b0a892'),
  navy: tn('#01020a', '#090f34', '#152058', '#3a54a6'),
  blue: tn('#0c1650', '#22399a', '#3c58ae', '#7088c8'),
  red: tn('#3e0906', '#a1221a', '#c02b1f', '#e2563c'),
  linen: tn('#3e3f50', '#a39c92', '#cdc6bb', '#ebe5db'),     // warm moonlit ivory, navy shade (standard 15)
  skin: tn('#2c181a', '#62403c', '#8a6256', '#b08676'),
  hair: tn('#010103', '#08080e', '#1c1e2a', '#3a3e52'),
  white: tn('#4f5164', '#bab4aa', '#ddd8cf', '#f3efe7'),
  leather: tn('#050404', '#17110d', '#2d241b', '#4f4335'),
  steel: tn('#1e2335', '#4c5672', '#8f9bc2', '#dfe5f6'),
  flame: ['#c62c1f', '#e0482a', '#f6d9a0', '#fbf8f1'],
};
// near-black core inside each shadow; far-side limbs sit one step darker
for (const P of [DAY, NIGHT]) {
  for (const k of Object.keys(P)) {
    const t = P[k];
    if (t && t.b && t.d) {
      t.k = mixHex(t.d, P === DAY ? '#050508' : '#010208', 0.55);
      P[k + 'F'] = { ...tn(t.d, mixHex(t.d, t.b, 0.5), t.b, t.l), k: t.k };
    }
  }
}

// Hero tones (o.hero): a bright vermilion cloak and gleaming bronze that
// still read at 30-60 px against a dark street or the night.
function withTones(P, over) {
  const R = { ...P };
  for (const [k, t] of Object.entries(over)) {
    const u = { ...t, k: mixHex(t.d, '#010208', 0.55) };
    R[k] = u;
    R[k + 'F'] = { ...tn(t.d, mixHex(t.d, t.b, 0.5), t.b, t.l), k: u.k };
  }
  return R;
}
const HERO_RED = tn(C.redDark, C.red, C.redHot, mixHex(C.redHot, C.cream, 0.3));
const HERO = {
  day: withTones(DAY, { red: HERO_RED }),
  night: withTones(NIGHT, { red: HERO_RED, bronze: DAY.bronze }),
};

// ------------------------------------------------------------------ style
function style(e, o) {
  const night = o.night ?? !!e.night;
  const T = o.hero ? HERO[night ? 'night' : 'day'] : night ? NIGHT : DAY;
  const h = o.h;
  const css = h * e.s / (e.dpr || 1);
  const lod = css < 12 ? 0 : css < 150 ? 1 : 2;
  const ls = o.light ?? (night ? 1 : -1);
  const lw = max(1 / e.s, h * (lod === 2 ? 0.0036 : 0.006)) * (o.inkScale ?? 1);
  const wall = e.reduced ? 0 : floor((e.wall ?? e.t ?? 0) * 12) / 12;
  return {
    T, night, h, lod, fine: css >= 230, css, ls, lx: ls * 0.62, ly: -0.78, lw, ink: T.ink,
    rim: o.rim ?? T.rim, px: 1 / e.s, wall, seed: o.seed ?? 0,
    hero: !!o.hero, rimMin: o.hero ? 1.3 / e.s : 0,     // heroes keep a visible shade and rim at small sizes
  };
}

// ------------------------------------------------------------------ rig
// Angles are radians from the downward vertical, positive = forward (+u).
// Leg: [thigh, knee flex, foot pitch]; arm: [upper arm, elbow flex].
const BODY = { thigh: 0.245, shin: 0.24, uarm: 0.165, farm: 0.15, hand: 0.05, torso: 0.29, neck: 0.33, head: 0.405 };

// eight keys per cycle, Catmull-Rom between them (contact, down, passing, up …)
const WALK = [[0.32, 0.04, 0.2], [0.24, 0.2, 0.02], [0.04, 0.08, 0], [-0.16, 0.06, -0.04], [-0.32, 0.26, -0.35], [-0.16, 0.75, -0.4], [0.1, 0.85, -0.2], [0.32, 0.36, 0.05]];
const RUN = [[0.5, 0.15, 0.1], [0.25, 0.45, 0], [-0.15, 0.25, -0.2], [-0.55, 0.3, -0.6], [-0.45, 1.2, -0.8], [-0.05, 1.9, -0.6], [0.45, 1.6, -0.3], [0.7, 0.7, 0]];
const CREEP = [[0.78, 0.8, 0.2], [0.66, 1.0, 0.05], [0.46, 0.9, 0], [0.2, 0.75, -0.1], [0.04, 0.9, -0.4], [0.32, 1.55, -0.4], [0.7, 1.65, -0.2], [0.88, 1.05, 0.1]];

function cyc(K, ph) {
  const n = K.length;
  const x = (((ph % 1) + 1) % 1) * n;
  const i = floor(x), u = x - i, u2 = u * u, u3 = u2 * u;
  const p0 = K[(i + n - 1) % n], p1 = K[i % n], p2 = K[(i + 1) % n], p3 = K[(i + 2) % n];
  const r = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    r[j] = 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3);
  }
  return r;
}

// Foot-path gaits ('haul', 'sneak'). The stance foot rests on a ground line
// G.g below the hip and slides through the hip frame at exactly G.S (the
// stride, in h) per cycle, so a figure moved G.S * h per cycle keeps that
// foot planted to the pixel. It touches down at pitch G.fl, rolls flat and
// leaves at G.fo (+ = toe up), pivoting about the ball when the toe is down
// and about the heel when it is up; the swing lifts it by G.lift. Two-bone
// IK turns the ankle path into the rig's [thigh, knee flex, foot pitch].
// G.back: the stance foot travels forward through the hip frame, i.e. the
// figure steps backward (hauling) and lands toe first behind itself.
const HEEL = [-0.036, -0.038], BALL = [0.07, -0.046], TOE = [0.108, -0.04];   // solve()'s foot points
const FLAT = Math.atan((BALL[1] - HEEL[1]) / (HEEL[0] - BALL[0])); // pitch with heel and ball both down
const FTOE = -Math.atan2(TOE[1] - BALL[1], TOE[0] - BALL[0]);     // pitch with ball and toe both down (-0.157)
const rotF = (p, f) => [p[0] * cos(f) - p[1] * sin(f), p[0] * sin(f) + p[1] * cos(f)];
const TB = rotF([TOE[0] - BALL[0], TOE[1] - BALL[1]], FTOE);       // toe from ball when both touch
const smooth01 = (x) => { const t = cl(x); return t * t * (3 - 2 * t); };
function legIK(au, av, f) {
  const l1 = BODY.thigh, l2 = BODY.shin;
  let d = hypot(au, av);
  const dm = (l1 + l2) * 0.999;
  if (d > dm) { au *= dm / d; av *= dm / d; d = dm; }
  const t = Math.atan2(au, -av) + Math.acos(cl((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const sa = Math.atan2(au - sin(t) * l1, -(av + cos(t) * l1));
  return [t, t - sa, f];
}
function gaitStance(q, G) { // ankle [u, v] and pitch at stance fraction q (0 = touch-down)
  const c = G.uc + (G.back ? 1 : -1) * G.S * G.beta * (q - 0.5);   // ankle u when the foot is flat
  const f = q < G.q1 ? lerp(G.fl, FLAT, smooth01(q / G.q1)) : q > G.q2 ? lerp(FLAT, G.fo, smooth01((q - G.q2) / (1 - G.q2))) : FLAT;
  if (f < FTOE) { // up on the toes (the planted walk's push-off): it pivots about the toe tip
    const pr = rotF(TOE, f);
    return [c + rotF(BALL, FLAT)[0] + TB[0] - pr[0], G.g - pr[1], f];
  }
  const piv = f < FLAT ? BALL : HEEL, pf = rotF(piv, FLAT), pr = rotF(piv, f);
  return [c + pf[0] - pr[0], G.g - pr[1], f];
}
function gaitLeg(ph, G) {
  const p = ((ph % 1) + 1) % 1;
  if (p < G.beta) { const [u, v, f] = gaitStance(p / G.beta, G); return legIK(u, v, f); }
  const s = (p - G.beta) / (1 - G.beta), k = smooth01(s);
  const [u1, v1, f1] = gaitStance(1, G), [u0, v0, f0] = gaitStance(0, G);
  return legIK(lerp(u1, u0, k), lerp(v1, v0, k) + G.lift * sin(PI * s), lerp(f1, f0, k) + (G.fs ?? 0) * sin(PI * s));
}
// hauling backward: short steps under the 'pull' lean, the braced front foot
// on its heel, the free foot reaching back to land on its toes
const HAUL = { S: 0.6, beta: 0.64, uc: 0.1, g: -0.44, back: true, fl: -0.13, fo: 0.42, q1: 0.22, q2: 0.48, lift: 0.055, fs: -0.1 };
// sneaking: the creep's crouch over a long gliding stride, heel first
const SNEAK = { S: 0.85, beta: 0.56, uc: 0.045, g: -0.415, back: false, fl: 0.3, fo: -0.13, q1: 0.2, q2: 0.62, lift: 0.07, fs: -0.15 };

// pushing forward on a load (s04's men at the platform; 'push' with o.planted):
// the push's lean and hands over short planted steps, driving off the rear toe
const PUSHG = { S: 0.6, beta: 0.62, uc: -0.1, g: -0.43, back: false, fl: 0.2, fo: -0.12, q1: 0.18, q2: 0.5, lift: 0.06, fs: -0.12 };

// The planted upright walk ('walk' with o.planted): heel strike, the foot
// rolls flat, then pushes off over the ball and the toe tip, all on the
// ground line (y 0 = the ground, in h), so phase = distance / stride plants
// the stance foot. An upright leg cannot keep a constant hip height over a
// planted foot, so the hip rises over the stance leg and sinks in double
// support (about 0.02 h): a per-phase table, the highest hip both legs can
// reach (stance and swing, 0.995 of the leg), eroded and smoothed so it never
// asks for more. The swing foot leaves on its toe, its heel kicked up behind,
// and reaches forward to land on its heel.
const WALKG = { S: 0.78, beta: 0.6, uc: -0.06, g: 0, back: false, fl: 0.3, fo: -0.6, q1: 0.15, q2: 0.42, lift: 0.03, skew: 0.7, fs: -0.15, cap: 0.524, kL: 0.995, win: 0.07 };
function walkFoot(p, G) { // one leg's ankle [u, y above the ground, pitch] at its own phase p
  p = ((p % 1) + 1) % 1;
  if (p < G.beta) return gaitStance(p / G.beta, G);
  const s = (p - G.beta) / (1 - G.beta), k = smooth01(s), b = sin(PI * Math.pow(s, G.skew));
  const a1 = gaitStance(1, G), a0 = gaitStance(0, G);
  return [lerp(a1[0], a0[0], k), lerp(a1[1], a0[1], k) + G.lift * b, lerp(a1[2], a0[2], k) + G.fs * b];
}
// The planted run ('run' / 'flee' with o.planted): the same foot path with a
// short stance (0.36 of the cycle) and a flight phase. Its hip follows a
// designed curve under the same reach limit: it sinks after touch-down,
// rises into the push-off and arcs through the flight.
const RUNG = { S: 1.25, beta: 0.36, uc: -0.06, g: 0, back: false, fl: 0.15, fo: -0.9, q1: 0.12, q2: 0.4, lift: 0.19, skew: 0.5, fs: 0.2, kL: 0.995, win: 0.02,
  Hs: 0.515, D: 0, qm: 0.4, Hto: 0.545, A: 0.015 };
function runCap(ph, G) { // per half cycle: stance (sink, then rise into the push-off), then flight
  const p = (((ph % 0.5) + 0.5) % 0.5);
  if (p < G.beta) { const q = p / G.beta; return q < G.qm ? lerp(G.Hs, G.Hs - G.D, smooth01(q / G.qm)) : lerp(G.Hs - G.D, G.Hto, smooth01((q - G.qm) / (1 - G.qm))); }
  const s = (p - G.beta) / (0.5 - G.beta);
  return lerp(G.Hto, G.Hs, s) + G.A * 4 * s * (1 - s);
}
function hipTable(G) {
  if (G.tab) return G.tab;
  const N = 240, L = (BODY.thigh + BODY.shin) * G.kL, env = new Float64Array(N), ero = new Float64Array(N), tab = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let hv = G.Hs ? runCap(i / N, G) : G.cap;
    for (const off of [0, 0.5]) { const a = walkFoot(i / N + off, G); hv = min(hv, a[1] + Math.sqrt(max(0, L * L - a[0] * a[0]))); }
    env[i] = hv;
  }
  const w = Math.round(G.win * N);
  for (let i = 0; i < N; i++) { let m = Infinity; for (let j = -w; j <= w; j++) m = min(m, env[(i + j + N) % N]); ero[i] = m; }
  for (let i = 0; i < N; i++) {
    let s = 0, n = 0;
    for (let j = -w; j <= w; j++) { const k = 0.5 + 0.5 * cos(PI * j / (w + 1)); s += ero[(i + j + N) % N] * k; n += k; }
    tab[i] = s / n;
  }
  return (G.tab = tab);
}
const WALKS = new Map();
function walkG(k) { // the planted walk at k x the stride (planted: true = 1)
  const kk = typeof k === 'number' && k > 0 ? Math.round(cl(k, 0.5, 1.2) * 100) / 100 : 1;
  let G = WALKS.get(kk);
  if (!G) { G = { ...WALKG, S: WALKG.S * kk, uc: WALKG.uc * kk }; WALKS.set(kk, G); }
  return G;
}
const RUNS = new Map();
function runG(k) { // the planted run at k x the stride (planted: true = 1)
  const kk = typeof k === 'number' && k > 0 ? Math.round(cl(k, 0.6, 1.2) * 100) / 100 : 1;
  let G = RUNS.get(kk);
  if (!G) { G = { ...RUNG, S: RUNG.S * kk, uc: RUNG.uc * kk }; RUNS.set(kk, G); }
  return G;
}
// the common tables are built at load (about 1-2 ms), not on a shot's first frame
// (s11 walks at 0.85; other factors build on first use, about 0.5 ms)
for (const k of [1, 0.85]) hipTable(walkG(k));
hipTable(runG(1));
function walkLegs(ph, G) {
  const T = hipTable(G), N = T.length, x = (((ph % 1) + 1) % 1) * N, i = floor(x);
  const hv = lerp(T[i % N], T[(i + 1) % N], x - i);
  return { hv, legs: [0, 0.5].map((off) => { const [u, y, f] = walkFoot(ph + off, G); return legIK(u, y - hv, f); }) };
}

// Distance covered by one full cycle (two steps), for phase = distance / stride.
// 'haul' is the distance stepped BACKWARD (away from the facing direction).
export function stride(h, pose = 'walk') {
  return h * (pose === 'run' || pose === 'flee' ? 1.25 : pose === 'creep' ? 0.55 : pose === 'haul' ? HAUL.S : pose === 'sneak' ? SNEAK.S : pose === 'push' ? PUSHG.S : 0.78);
}
// Phase on twos for a figure stepping `cps` cycles per second.
export function gaitPhase(e, cps = 0.9, offset = 0) {
  const t = e.q ? e.q(12) : e.t;
  return (((t * cps + offset) % 1) + 1) % 1;
}

const ARMS = { // equipment holds for the near (spear) and far (shield) arm
  rest: [0.3, 1.25], carry: [0.3, 1.25], level: [0.05, 1.45], ready: [0.62, 0.95], low: [0.5, 1.15], raise: [2.2, 0.15],
  torch: [1.95, 0.55], none: null,
};

function pose(o, cfg) {
  const name = o.pose || 'stand';
  const ph = o.phase || 0;
  const sw = cos(TAU * ph);
  const P = {
    name, ph, sw, lean: 0.03, head: 0, legs: [[0.07, 0.04, 0], [-0.06, 0.03, 0]], arms: [[0.06, 0.22], [-0.04, 0.22]],
    lift: 0, trail: 0.03, lf: 0, rot: 0, grounded: true, spear: 'rest', shield: 'front', move: 0,
  };
  switch (name) {
    case 'walk':
      if (o.planted) { const W = walkLegs(ph, walkG(o.planted)); P.legs = W.legs; P.hv = W.hv; P.ik = true; }   // phase = distance / (k x stride)
      else P.legs = [cyc(WALK, ph), cyc(WALK, ph + 0.5)];
      P.lean = 0.05;
      P.arms = [[-0.32 * sw, 0.32], [0.32 * sw, 0.32]]; P.trail = 0.07; P.move = 1; P.spear = 'carry';
      break;
    case 'run': case 'flee':
      if (o.planted) { const W = walkLegs(ph, runG(o.planted)); P.legs = W.legs; P.hv = W.hv; P.ik = true; }   // phase = distance / (k x stride(h, 'run'))
      else { P.legs = [cyc(RUN, ph), cyc(RUN, ph + 0.5)]; P.lift = 0.035 * max(0, cos(TAU * (ph * 2 - 0.88))); }
      P.lean = 0.24;
      P.arms = [[-0.7 * sw, 1.5], [0.7 * sw, 1.5]]; P.trail = 0.2; P.lf = 0.12; P.move = 2;
      P.spear = 'level';
      if (name === 'flee') { P.lean = 0.32; P.arms = [[2.2 + 0.5 * sw, 0.6], [1.6 - 0.5 * sw, 0.7]]; P.head = -0.12; P.spear = 'none'; P.shield = 'none'; }
      break;
    case 'push': { // phase = effort cycle (braced); with o.planted, phase = distance / stride(h, 'push') (0.6 h): stepping forward
      const k = 0.03 * sin(TAU * (o.planted ? 2 * ph : ph));
      if (o.planted) { P.legs = [gaitLeg(ph, PUSHG), gaitLeg(ph + 0.5, PUSHG)]; P.ik = true; P.move = 1; }
      else P.legs = [[0.62, 1.0, 0.15], [-0.52, 0.06, -0.35]];
      P.lean = 0.58 + k;
      P.arms = [[1.52 - k, 0.18], [1.45 - k, 0.22]]; P.trail = 0.05; P.spear = 'none'; P.shield = 'none';
      break;
    }
    case 'pull': { // hauling: braced front leg with the heel dug in, leaning far
      // back, both hands forward at chest height on the rope (phase = effort)
      const k = 0.5 - 0.5 * cos(TAU * ph);
      P.legs = [[0.6 + 0.06 * k, 0.05, 0.42], [-0.25 - 0.04 * k, 0.55 + 0.12 * k, 0.15]]; P.lean = -0.4 - 0.14 * k;
      P.arms = [[1.15 - 0.08 * k, 0.4 + 0.12 * k], [1.08 - 0.08 * k, 0.5 + 0.12 * k]]; P.head = 0.16; P.trail = 0.02;
      P.spear = 'none'; P.shield = 'none';
      break;
    }
    case 'haul': { // hauling while stepping BACKWARD: the 'pull' lean and the hands
      // forward at chest height on the rope, over short planted steps; phase =
      // distance stepped back / stride(h, 'haul'), so the feet do not slide
      const k = 0.5 - 0.5 * cos(TAU * 2 * (ph - 0.12));   // effort: one heave per step
      P.legs = [gaitLeg(ph, HAUL), gaitLeg(ph + 0.5, HAUL)]; P.lean = -0.5 - 0.1 * k;
      P.arms = [[1.15 - 0.08 * k, 0.4 + 0.12 * k], [1.08 - 0.08 * k, 0.5 + 0.12 * k]]; P.head = 0.16; P.trail = 0;
      P.move = 1; P.spear = 'none'; P.shield = 'none';
      break;
    }
    case 'crouch':
      P.legs = [[1.2, 1.25, 0], [0.12, 1.68, -1.35]]; P.lean = 0.42;
      P.arms = [[0.95, 0.5], [0.7, 0.95]]; P.spear = 'ready'; P.trail = 0;
      break;
    case 'creep':
      P.legs = [cyc(CREEP, ph), cyc(CREEP, ph + 0.5)]; P.lean = 0.5;
      P.arms = [[0.75 - 0.1 * sw, 0.7], [0.6, 1.0]]; P.trail = 0.06; P.move = 1; P.spear = 'low';
      break;
    case 'sneak': // the creep over a long planted stride (stride(h, 'sneak') = 0.85 h)
      P.legs = [gaitLeg(ph, SNEAK), gaitLeg(ph + 0.5, SNEAK)]; P.lean = 0.46 + 0.03 * cos(TAU * 2 * ph);
      P.arms = [[0.75 - 0.12 * sw, 0.7], [0.6 + 0.08 * sw, 1.0]]; P.trail = 0.07; P.move = 1; P.spear = 'low';
      break;
    case 'lift': { // phase 0..1: hands at the shoulders (0.97 h) -> overhead;
      // phase -1..0: from a chest grip (hands ~0.68 h, 0.25 h forward) up to phase 0
      const k = cl(ph);
      P.legs = [[0.1 + 0.3 * (1 - k), 0.08 + 0.55 * (1 - k), 0], [-0.12, 0.05 + 0.45 * (1 - k), 0]];
      P.lean = 0.12 * (1 - k);
      P.arms = [[lerp(1.65, 2.95, k), lerp(1.35, 0.12, k)], [lerp(1.6, 2.9, k), lerp(1.4, 0.15, k)]];
      const rc = o.reach === true ? 1 : cl(+o.reach || 0);
      if (rc > 0 && k > 0) {
        // o.reach: the full press. The arms lock straight overhead and, over
        // the last 60% of the lift, the shoulders shrug up, the arms reach
        // their full length and he rises on his toes: hands ~1.29 h at phase 1
        const r = rc * smooth01((k - 0.4) / 0.6);
        P.arms = [[lerp(1.65, lerp(2.95, 3.08, rc), k), lerp(1.35, lerp(0.12, 0, rc), k)], [lerp(1.6, lerp(2.9, 3.04, rc), k), lerp(1.4, lerp(0.15, 0.02, rc), k)]];
        P.legs = P.legs.map(([t, kn], i) => [lerp(t, i ? -0.06 : 0.04, r), lerp(kn, 0.02, r), -0.7 * r]);
        P.shrug = 0.045 * r; P.armK = 1 + 0.12 * r;
      }
      if (ph < 0) {
        const g = smooth01(1 + max(-1, ph));          // 0 at the chest grip, 1 at phase 0
        P.arms = [[lerp(0.55, 1.65, g), lerp(1.05, 1.35, g)], [lerp(0.5, 1.6, g), lerp(1.12, 1.4, g)]];
        P.lean = lerp(0.18, 0.12, g);
      }
      P.spear = 'none'; P.shield = 'none';
      break;
    }
    case 'fall': {
      const k = cl(ph);
      P.legs = [[0.15 + 0.9 * k, 0.2 + 0.7 * k, 0.2], [-0.08, 0.12 + 0.3 * k, 0]];
      P.arms = [[2.0 + 0.7 * k, 0.4], [2.4 + 0.5 * k, 0.3]]; P.lean = -0.1 * k; P.head = -0.3 * k;
      P.rot = 1.45 * k * k; P.spear = 'none'; P.shield = 'none'; P.trail = 0.1 * k; P.lf = 0.2 * k;
      break;
    }
    case 'sleep': { // asleep on the paving (s06's sentries): lying back along the ground,
      // the feet toward dir and the head behind, the shoulders a little raised
      // with the head resting on the far arm folded under it, the near hand on
      // the belly, the near knee drawn up (about 0.3 h tall in all);
      // phase = the breath (e.g. gaitPhase(e, 0.25)): the chest rises and falls
      const b = 0.5 - 0.5 * cos(TAU * ph);
      P.legs = [[1.0, 1.75, 0.45], [0.1, 0.12, 0.25]]; P.lean = 0.2 + 0.025 * b; P.head = 0.45;
      P.arms = [[0.3, 0.75], [2.95, 1.8]]; P.rot = 1.5; P.grounded = false;
      P.spear = 'none'; P.shield = 'none'; P.trail = 0; P.sleep = true;
      break;
    }
    case 'point': case 'lead':
      P.arms = [[2.15, 0.06], [-0.05, 0.25]]; P.head = 0.06; P.spear = 'raise';
      break;
    case 'climb': { // hand over hand: the hands swap heights each half cycle
      const s1 = 0.5 + 0.5 * sin(TAU * ph), s2 = 1 - s1;
      P.grounded = false; P.legs = [[0.75 + 0.35 * s1, 1.2 + 0.4 * s1, 0.35], [0.4 + 0.35 * s2, 0.9 + 0.4 * s2, -0.2]];
      P.lean = -0.04; P.arms = [[2.75, 0.5], [2.75, 0.5]];
      P.rope = { u: 0.112, v: [0.06 + 0.16 * s1, 0.06 + 0.16 * s2] };
      P.head = 0.12; P.spear = 'none'; P.shield = 'none'; P.trail = 0.02;
      break;
    }
    case 'slide': // gripping the rope one hand above the other, the near knee
      // raised and the shin hooked round the rope, the far foot under it;
      // the cloak streams up as he drops
      P.grounded = false; P.legs = [[1.0, 1.55, 0.35], [0.5, 1.05, -0.2]]; P.lean = -0.05;
      P.arms = [[2.9, 0.3], [2.6, 0.6]]; P.rope = { u: 0.112, v: [0.21, 0.07] };
      P.head = 0.22; P.trail = 0.08; P.lf = 0.46;
      P.spear = 'none'; P.shield = 'none';
      break;
    case 'land': { // touched down: deep crouch on the near foot and far knee,
      // the far arm thrown back for balance, head up, the cloak settling.
      // phase = progress 0..1 rising into the 'crouch' (absorb and settle)
      const k = smooth01(ph), L2 = (a, b) => a.map((v, i) => lerp(v, b[i], k));
      P.legs = [L2([1.25, 2.3, 0.05], [1.2, 1.25, 0]), L2([0.32, 2.3, -0.75], [0.12, 1.68, -1.35])]; P.lean = lerp(0.72, 0.42, k);
      P.arms = [L2([0.45, 0.55], [0.95, 0.5]), L2([-1.05, 0.45], [0.7, 0.95])];
      P.head = lerp(-0.62, 0, k); P.trail = lerp(0.16, 0, k); P.lf = lerp(0.34, 0, k);
      P.spear = 'none'; P.shield = 'none';
      break;
    }
    default: break;
  }
  // equipment: explicit options win over the pose defaults
  const sp = o.torch ? 'torch' : o.spear === false ? 'none' : typeof o.spear === 'string' ? o.spear : cfg.spear === false ? 'none' : P.spear;
  P.spear = sp;
  P.shield = o.shield === false ? 'none' : o.shield === true ? 'front' : cfg.shield === false ? 'none' : P.shield;
  if (cfg.civil && !o.spear && !o.torch) P.spear = 'none';
  if (cfg.civil && o.shield !== true) P.shield = 'none';
  if (P.spear !== 'none' && ARMS[P.spear]) {
    const a = ARMS[P.spear];
    P.arms[0] = [a[0] - (P.spear === 'carry' ? 0.06 * sw : 0), a[1]];
    if (P.spear === 'level' && P.move === 2) P.arms[0] = [0.05 - 0.08 * sw, 1.45];
  }
  if (P.shield === 'front') P.arms[1] = P.name === 'run' ? [0.85, 0.75] : P.name === 'crouch' || P.name === 'creep' || P.name === 'sneak' ? [0.75, 0.85] : [0.55, 1.05];
  return P;
}

function solve(P, legScale = 1) {
  if (P.ik) legScale = 1;                          // IK legs (planted gaits) keep their exact angles
  const legs = P.legs.map(([t0, k, f]) => {
    const t = t0 * legScale;
    const knee = [sin(t) * BODY.thigh, -cos(t) * BODY.thigh];
    const sa = t - k * (legScale < 1 ? 0.9 : 1);
    const ankle = [knee[0] + sin(sa) * BODY.shin, knee[1] - cos(sa) * BODY.shin];
    const cf = cos(f), sf = sin(f);
    const R = (u, v) => [ankle[0] + u * cf - v * sf, ankle[1] + u * sf + v * cf];
    return { t, k, f, sa, knee, ankle, heel: R(-0.036, -0.038), ball: R(0.07, -0.046), toe: R(0.108, -0.04), top: R(0.06, -0.008), back: R(-0.026, 0.006) };
  });
  let low = Infinity;
  for (const L of legs) low = min(low, L.heel[1], L.ball[1], L.toe[1], L.knee[1] - 0.028);
  const hv = P.hv ?? (-low + (P.lift || 0));      // P.hv: the gait sets the hip height (the stance foot is on y 0)
  for (const L of legs) for (const k of ['knee', 'ankle', 'heel', 'ball', 'toe', 'top', 'back']) L[k] = [L[k][0], L[k][1] + hv];
  const c = cos(P.lean), s = sin(P.lean);
  const H = [0, hv];
  const at = (u, v) => [H[0] + u * c + v * s, H[1] - u * s + v * c];
  const S = at(0, BODY.torso), N = at(0, BODY.neck);
  const hl = P.lean + (P.head || 0);
  const Hc = [N[0] + sin(hl) * (BODY.head - BODY.neck), N[1] + cos(hl) * (BODY.head - BODY.neck)];
  const ak = P.armK || 1, sv = P.shrug || 0;      // 'lift' with o.reach: full-length arms, shoulders shrugged
  const arms = P.arms.map(([a, e], i) => {
    const sh = i === 0 ? at(0.004, BODY.torso - 0.01 + sv) : at(-0.014, BODY.torso + sv);
    const el = [sh[0] + sin(a) * BODY.uarm * ak, sh[1] - cos(a) * BODY.uarm * ak];
    const fa = a + e;
    const wr = [el[0] + sin(fa) * BODY.farm * ak, el[1] - cos(fa) * BODY.farm * ak];
    const hd = [wr[0] + sin(fa) * BODY.hand, wr[1] - cos(fa) * BODY.hand];
    return { a, e, fa, sh, el, wr, hd, mid: [(wr[0] + hd[0]) / 2, (wr[1] + hd[1]) / 2] };
  });
  return { legs, H, S, N, Hc, at, lean: P.lean, hl, arms };
}

// Two-bone IK: bend arm A (from its shoulder) so its hand centre reaches M,
// elbow toward the front. Used by the rope grip and the landing hand.
function reachArm(A, M) {
  const S = A.sh, l1 = BODY.uarm, l2 = BODY.farm + BODY.hand * 0.5;
  let dx = M[0] - S[0], dy = M[1] - S[1];
  let dd = hypot(dx, dy) || 1e-6;
  const dm = (l1 + l2) * 0.995;
  if (dd > dm) { dx *= dm / dd; dy *= dm / dd; dd = dm; }
  const a = Math.atan2(dx, -dy) - Math.acos(cl((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1));
  const el = [S[0] + sin(a) * l1, S[1] - cos(a) * l1];
  const fa = Math.atan2(S[0] + dx - el[0], -(S[1] + dy - el[1]));
  const wr = [el[0] + sin(fa) * BODY.farm, el[1] - cos(fa) * BODY.farm];
  const hd = [wr[0] + sin(fa) * BODY.hand, wr[1] - cos(fa) * BODY.hand];
  Object.assign(A, { a, e: fa - a, fa, el, wr, hd, mid: [(wr[0] + hd[0]) / 2, (wr[1] + hd[1]) / 2] });
}
// Rope poses: both hands on one vertical line in front of the face, at
// heights above the head centre (P.rope.v = [near, far]).
function ropeGrip(J, P) {
  if (P.rope) J.arms.forEach((A, i) => reachArm(A, [P.rope.u, J.Hc[1] + P.rope.v[i]]));
  if (P.reach) reachArm(J.arms[P.reach.arm], P.reach.at);
}

// Local (u forward, v up, in units of h) → world, with the fall rotation.
function frame(o, P, J) {
  const h = o.h, d = o.dir ?? 1;
  let x0 = o.x;
  const y0 = o.y;
  let rc = 1, rs = 0, piv = 0, up = 0;
  if (P.rot) {
    rc = cos(P.rot); rs = sin(P.rot);
    piv = (J.legs[0].heel[0] + J.legs[1].heel[0]) / 2;
    const pts = [J.Hc, J.S, J.H, J.legs[0].knee, J.legs[1].knee, J.arms[0].hd, J.arms[1].hd, J.legs[0].toe, J.legs[1].toe];
    let lo = Infinity;
    for (const p of pts) lo = min(lo, (p[0] - piv) * rs + p[1] * rc);
    up = max(0, -lo + 0.035);
  }
  const F = {
    h, d,
    X: (u, v) => x0 + d * h * (P.rot ? piv + (u - piv) * rc - v * rs : u),
    Y: (u, v) => y0 - h * (P.rot ? (u - piv) * rs + v * rc + up : v),
    w: (p) => [F.X(p[0], p[1]), F.Y(p[0], p[1])],
  };
  if (o.ropeX != null && (P.name === 'climb' || P.name === 'slide')) {
    const hu = (J.arms[0].mid[0] + J.arms[1].mid[0]) / 2;
    x0 = o.ropeX - d * hu * h;
  }
  return F;
}

// ------------------------------------------------------------------ paths
function polyL(ctx, F, pts) {
  ctx.moveTo(F.X(pts[0][0], pts[0][1]), F.Y(pts[0][0], pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(F.X(pts[i][0], pts[i][1]), F.Y(pts[i][0], pts[i][1]));
  ctx.closePath();
}
// Closed smooth outline through the midpoints of the control points;
// repeat a point to keep a corner.
function blobL(ctx, F, pts) {
  const n = pts.length;
  const mx = (i) => (pts[i % n][0] + pts[(i + 1) % n][0]) / 2, my = (i) => (pts[i % n][1] + pts[(i + 1) % n][1]) / 2;
  ctx.moveTo(F.X(mx(n - 1), my(n - 1)), F.Y(mx(n - 1), my(n - 1)));
  for (let i = 0; i < n; i++) {
    const c = pts[i], qx = mx(i), qy = my(i);
    ctx.quadraticCurveTo(F.X(c[0], c[1]), F.Y(c[0], c[1]), F.X(qx, qy), F.Y(qx, qy));
  }
  ctx.closePath();
}
function lineL(ctx, F, pts) {
  ctx.moveTo(F.X(pts[0][0], pts[0][1]), F.Y(pts[0][0], pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(F.X(pts[i][0], pts[i][1]), F.Y(pts[i][0], pts[i][1]));
}
// Tapered limb with round ends from A to B (local points), widths in h.
function capL(ctx, F, A, B, wa, wb) {
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const L = hypot(dx, dy) || 1e-6; dx /= L; dy /= L;
  const nx = -dy, ny = dx, ra = wa / 2, rb = wb / 2;
  const pt = (u, v) => ctx.lineTo(F.X(u, v), F.Y(u, v));
  ctx.moveTo(F.X(A[0] + nx * ra, A[1] + ny * ra), F.Y(A[0] + nx * ra, A[1] + ny * ra));
  pt(B[0] + nx * rb, B[1] + ny * rb);
  for (let i = 1; i < 4; i++) { const c = cos(i * PI / 4), s = sin(i * PI / 4); pt(B[0] + (nx * c + dx * s) * rb, B[1] + (ny * c + dy * s) * rb); }
  pt(B[0] - nx * rb, B[1] - ny * rb);
  pt(A[0] - nx * ra, A[1] - ny * ra);
  for (let i = 1; i < 4; i++) { const c = cos(i * PI / 4), s = sin(i * PI / 4); pt(A[0] - (nx * c + dx * s) * ra, A[1] - (ny * c + dy * s) * ra); }
  ctx.closePath();
}
// Limb outline along a spine with a width profile: ws[i] = [front, back] offsets.
function limbL(ctx, F, spine, ws) {
  const n = spine.length, Lp = [], Rp = [];
  for (let i = 0; i < n; i++) {
    const a = spine[max(0, i - 1)], b = spine[min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = hypot(tx, ty) || 1; tx /= l; ty /= l;
    Lp.push([spine[i][0] - ty * ws[i][0], spine[i][1] + tx * ws[i][0]]);
    Rp.push([spine[i][0] + ty * ws[i][1], spine[i][1] - tx * ws[i][1]]);
  }
  blobL(ctx, F, [...Lp, ...Rp.reverse()]);
}
const P2 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
function alongL(pts, k) { // point at fraction k of a polyline's length
  let tot = 0;
  for (let i = 1; i < pts.length; i++) tot += hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let t = cl(k) * tot;
  for (let i = 1; i < pts.length; i++) {
    const l = hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (t <= l || i === pts.length - 1) return P2(pts[i - 1], pts[i], l ? min(1, t / l) : 0);
    t -= l;
  }
  return pts[pts.length - 1];
}

// Posterised fill: base, a shade crescent on the side away from the light
// (with a near-black core and, at medium size, engraved hatching), a lit
// crescent on the light side (night: a thin moonlit rim) and an ink contour.
//   sd: shade offset in h (0 = flat), o.inner(ctx) draws clipped details,
//   o.hatch: engrave the shade (cloth), o.core: false skips the dark core.
function paint(ctx, S, build, t, sd = 0.02, o = {}) {
  if (S.sil) { // bold outer contour: a thick ink stroke under the real parts
    if (o.ink === false || o.sil === false) return;
    ctx.beginPath(); build(); ctx.strokeStyle = S.ink; ctx.lineWidth = S.lw * S.sil; ctx.lineJoin = 'round'; ctx.stroke();
    return;
  }
  ctx.beginPath(); build();
  ctx.fillStyle = t.b; ctx.fill();
  const shade = S.lod > 0 && sd > 0;
  if (shade || o.inner) {
    ctx.save(); ctx.clip();
    if (shade) {
      const dd = max(sd * S.h, S.rimMin * 1.4), lx = S.lx, ly = S.ly;
      const core = S.lod === 2 && o.core !== false && t.k;
      ctx.fillStyle = core ? t.k : t.d; ctx.fill();
      if (core) { ctx.save(); ctx.translate(lx * dd * 0.3, ly * dd * 0.3); ctx.beginPath(); build(); ctx.fillStyle = t.d; ctx.fill(); ctx.restore(); }
      if (o.hatch && S.lod === 2 && S.hb) hatch(ctx, S);
      ctx.save(); ctx.translate(lx * dd, ly * dd);
      ctx.beginPath(); build(); ctx.fillStyle = t.b; ctx.fill();
      ctx.restore();
    }
    if (o.inner) o.inner(ctx);
    const hl = o.hl === false ? null : S.night ? (t.r ?? S.rim) : t.l;   // t.r: the tone's own moonlit band
    if (shade && hl) {
      const k = max(sd * S.h * (o.hk ?? t.hk ?? (S.night ? 0.32 : 0.5)), S.rimMin);
      ctx.beginPath(); build();
      ctx.save(); ctx.translate(-S.lx * k, -S.ly * k); build(); ctx.restore();
      ctx.fillStyle = hl; ctx.fill('evenodd');
    }
    ctx.restore();
  }
  if (o.ink !== false) { ctx.beginPath(); build(); ctx.strokeStyle = S.ink; ctx.lineWidth = S.lw * (o.lw ?? 1); ctx.lineJoin = 'round'; ctx.stroke(); }
}
// Engraved hatching across the figure's box (clipped by the caller).
function hatch(ctx, S) {
  const b = S.hb, sp = max(S.px * 3.2, S.h * 0.011);
  ctx.beginPath();
  const dx = (b.y1 - b.y0) * 0.45;
  for (let x = b.x0 - dx; x < b.x1; x += sp) { ctx.moveTo(x, b.y1); ctx.lineTo(x + dx, b.y0); }
  ctx.strokeStyle = S.ink; ctx.lineWidth = max(S.px * 0.8, S.lw * 0.55); ctx.stroke();
}
function strokeL(ctx, F, pts, col, w, S) {
  if (S && S.sil) { if (col !== S.ink) return; w += S.lw * (S.sil - 1); }
  ctx.beginPath(); lineL(ctx, F, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}

// ------------------------------------------------------------------ shadow
function castShadow(ctx, S, o) {
  const sh = o.shadow;
  if (!sh) return;
  const h = o.h;
  ctx.fillStyle = sh.color ?? S.T.shadow;
  if (sh === true || sh === 'contact') {
    ctx.beginPath(); ctx.ellipse(o.x, o.y + h * 0.004, h * 0.17, h * 0.024, 0, 0, TAU); ctx.fill();
    return;
  }
  // long shadow away from the light, on the ground plane
  const len = (sh.len ?? 1.6) * h, side = sh.side ?? -S.ls;
  const gx = side * len, gy = (sh.drop ?? 0.06) * len;
  const l = hypot(gx, gy), px = -gy / l, py = gx / l, w = h * (sh.w ?? 0.05);
  const at = (t, k) => [o.x + gx * t + px * w * k, o.y + gy * t + py * w * k];
  const pts = [at(0, -1.1), at(0.4, -0.95), at(0.82, -0.62), at(0.97, -0.3), at(1, 0), at(0.97, 0.3), at(0.82, 0.62), at(0.4, 0.95), at(0, 1.1)];
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------ parts
const CUIRASS = [[0.032, 0.315], [0.064, 0.29], [0.088, 0.236], [0.09, 0.2], [0.079, 0.162], [0.07, 0.11], [0.066, 0.05], [0.072, 0.004], [0.077, -0.024], [-0.075, -0.024], [-0.07, 0.03], [-0.074, 0.1], [-0.084, 0.19], [-0.082, 0.262], [-0.06, 0.302], [-0.03, 0.318]];
const CHITON_TOP = [[0.03, 0.315], [0.06, 0.286], [0.08, 0.228], [0.075, 0.165], [0.068, 0.1], [0.064, 0.04], [0.072, 0.0], [-0.072, 0.0], [-0.068, 0.06], [-0.073, 0.13], [-0.08, 0.2], [-0.076, 0.266], [-0.044, 0.31]];
const HELM0 = [[0, 0.073], [0.04, 0.062], [0.062, 0.035], [0.069, 0.017], [0.074, -0.02], [0.06, -0.027], [0.066, -0.06], [0.046, -0.079], [0.002, -0.07], [-0.012, -0.035], [-0.034, -0.058], [-0.074, -0.068], [-0.07, -0.02], [-0.062, 0.03], [-0.036, 0.064]];
const HELM = HELM0.map(([u, v]) => [u * 1.12, v * 1.12 - 0.004]);
const CREST_OUT = [[0.05, 0.075], [0.066, 0.115], [0.046, 0.16], [0.0, 0.187], [-0.056, 0.185], [-0.106, 0.157], [-0.141, 0.106], [-0.159, 0.046], [-0.161, -0.015], [-0.146, -0.062]];
const CREST_IN = [[-0.122, -0.032], [-0.118, 0.03], [-0.098, 0.075], [-0.06, 0.095], [-0.015, 0.098], [0.025, 0.09], [0.04, 0.08]];
const BEARD = [[0.05, -0.08], [0.058, -0.104], [0.04, -0.128], [0.016, -0.122], [0.004, -0.09]];

function headPt(J, u, v) { // head-frame point (relative to head centre, upright) → local
  const c = cos(J.hl), s = sin(J.hl);
  return [J.Hc[0] + u * c + v * s, J.Hc[1] - u * s + v * c];
}
function spiral(c, F, ctr, r0, dr, n, col, w, sg = 1) {
  c.strokeStyle = col; c.lineWidth = w; c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = i * 0.7 * sg, r = r0 + i * dr, u = ctr[0] + cos(a) * r, v = ctr[1] + sin(a) * r;
    if (i) c.lineTo(F.X(u, v), F.Y(u, v)); else c.moveTo(F.X(u, v), F.Y(u, v));
  }
  c.stroke();
}

function drawLeg(ctx, S, F, L, J, cfg, far) {
  const T = S.T;
  const skin = far ? T.skinF : T.skin;
  const H = J.H, K = L.knee, A = L.ankle;
  // one outline hip → knee → ankle; the calf bulges at the back
  const spine = [P2(H, K, -0.08), P2(H, K, 0.5), K, P2(K, A, 0.3), P2(K, A, 0.68), A];
  const ws = [[0.056, 0.06], [0.05, 0.054], [0.034, 0.034], [0.031, 0.046], [0.024, 0.03], [0.019, 0.02]];
  paint(ctx, S, () => limbL(ctx, F, spine, ws), skin, 0.016);
  if (cfg.greaves) {
    const g = far ? T[cfg.greaves + 'F'] : T[cfg.greaves];
    const gsp = [P2(K, A, -0.04), P2(K, A, 0.3), P2(K, A, 0.68), P2(K, A, 0.96)];
    const gws = [[0.038, 0.037], [0.034, 0.051], [0.028, 0.034], [0.023, 0.023]];
    paint(ctx, S, () => limbL(ctx, F, gsp, gws), g, 0.018, {
      inner: S.lod === 2 && !far ? (c) => {
        spiral(c, F, P2(K, A, 0.13), 0.003, 0.0012, 13, g.h, S.lw * 0.8);
        strokeL(c, F, [P2(K, A, 0.3), P2(K, A, 0.9)], g.l, S.lw * 0.8);
      } : null,
    });
  }
  // foot in a sandal
  const sole = far ? T.leatherF : T.leather;
  const foot = () => blobL(ctx, F, [L.back, L.heel, L.heel, L.ball, L.toe, L.toe, L.top, P2(L.top, A, 0.55)]);
  if (S.lod === 2 && !cfg.barefoot) {
    paint(ctx, S, foot, skin, 0.008);
    const dn = [sin(L.f), -cos(L.f)];
    const so = (p, k) => [p[0] + dn[0] * k, p[1] + dn[1] * k];
    paint(ctx, S, () => polyL(ctx, F, [so(L.heel, -0.006), so(L.toe, -0.006), so(L.toe, 0.006), so(L.heel, 0.006)]), sole, 0, { lw: 0.8 });
    for (const k of [0.45, 0.74]) strokeL(ctx, F, [P2(L.heel, L.toe, k), P2(L.back, L.top, k + 0.12)], sole.l, S.lw * 1.5);
    strokeL(ctx, F, [P2(L.back, A, 0.5), P2(L.top, A, 0.6)], sole.l, S.lw * 1.5);
  } else paint(ctx, S, foot, cfg.barefoot ? skin : sole, 0);
}

function drawArm(ctx, S, F, A, cfg, far) {
  const T = S.T;
  const skin = far ? T.skinF : T.skin;
  const spine = [A.sh, P2(A.sh, A.el, 0.5), A.el, P2(A.el, A.wr, 0.45), A.wr];
  const ws = [[0.034, 0.034], [0.028, 0.027], [0.021, 0.02], [0.022, 0.019], [0.016, 0.015]];
  paint(ctx, S, () => limbL(ctx, F, spine, ws), skin, 0.014);
  const sl = cfg.sleeve ? (far ? T[cfg.sleeve + 'F'] : T[cfg.sleeve]) : null;
  if (sl) paint(ctx, S, () => limbL(ctx, F, [P2(A.sh, A.el, -0.15), P2(A.sh, A.el, 0.3), P2(A.sh, A.el, 0.62)], [[0.043, 0.043], [0.038, 0.037], [0.032, 0.031]]), sl, 0.016);
  if (cfg.bracer && S.lod) {
    const b = far ? T[cfg.bracer + 'F'] : T[cfg.bracer];
    const nx = cos(A.fa), ny = sin(A.fa);
    paint(ctx, S, () => limbL(ctx, F, [P2(A.el, A.wr, 0.3), P2(A.el, A.wr, 0.65), P2(A.el, A.wr, 1.02)], [[0.029, 0.026], [0.027, 0.024], [0.022, 0.021]]), b, 0.012, {
      inner: S.lod === 2 && cfg.ornament ? (c) => {
        for (const k of [0.38, 0.62, 0.96]) { const p = P2(A.el, A.wr, k); strokeL(c, F, [[p[0] - nx * 0.03, p[1] - ny * 0.03], [p[0] + nx * 0.03, p[1] + ny * 0.03]], b.h, S.lw * 0.9); }
      } : null,
    });
  }
}
// A fist at the end of the forearm (it closes around spear shafts and ropes).
function drawHand(ctx, S, F, A, far) {
  const t = far ? S.T.skinF : S.T.skin;
  const dx = sin(A.fa), dy = -cos(A.fa), nx = cos(A.fa), ny = sin(A.fa), w = A.wr;
  const H = (x, y) => [w[0] + dx * x + nx * y, w[1] + dy * x + ny * y];
  const pts = [H(-0.005, -0.017), H(0.026, -0.021), H(0.046, -0.015), H(0.052, 0.0), H(0.046, 0.017), H(0.027, 0.023), H(0.01, 0.026), H(-0.005, 0.018)];
  paint(ctx, S, () => blobL(ctx, F, pts), t, S.lod === 2 ? 0.008 : 0);
}

// Agamemnon (hero) below ~40 device px (S.mass 0..1, full below 34 px): the
// cloak becomes one bright vermilion mass, wider, banded in its own hot red,
// without folds, and a cape covers his shoulders and back, so the king reads
// as 'led by Agamemnon in vermilion' at 1x, not as a small dark figure.
const massTone = (t, m) => ({ ...t, d: mixHex(t.d, t.b, 0.6 * m), b: mixHex(t.b, C.redHot, 0.6 * m), r: C.redHot, hk: 0.4 });
function drawCloak(ctx, S, F, J, P, cfg, o) {
  const T = S.T;
  let t = T[o.cloak];
  if (!t) return;
  const m = S.mass || 0;
  if (m > 0) t = massTone(t, m);
  const sh = J.S, len = 0.62 * (cfg.cloakLen ?? 1);
  const w = S.wall, sd = S.seed * 1.7;
  const wind = (o.wind ?? 1) * (0.014 * sin(w * 1.6 + sd) + 0.009 * sin(w * 2.9 + 1.3 + sd));
  const tr = P.trail + wind + (P.move ? 0.022 * sin(TAU * P.ph * 2) : 0);
  const lf = P.lf + (P.move === 2 ? 0.05 : 0);
  const hemV = (v) => max(0.01, v);
  const cw = (cfg.cloakW ?? 1) + 0.7 * m;
  const back = [sh[0] - 0.178 * cw - tr, hemV(sh[1] - len + lf)];
  const front = [sh[0] - 0.012 - tr * 0.4, hemV(sh[1] - len * 0.96 + lf * 0.55)];
  const hem = [];
  for (let i = 1; i < 5; i++) {
    const u = i / 5;
    const wave = 0.01 * sin(w * 2.2 + i * 1.9 + sd) * (1 + P.move);
    hem.push([lerp(back[0], front[0], u) + wave * 0.5, hemV(lerp(back[1], front[1], u) + (i % 2 ? 0.02 : -0.002) + wave)]);
  }
  const mid = [sh[0] - 0.145 * cw - tr * 0.45, sh[1] - len * 0.42 + lf * 0.25];
  const pts = [
    [sh[0] + 0.052, sh[1] + 0.024], [sh[0] + 0.01, sh[1] + 0.066], [sh[0] - 0.072, sh[1] + 0.05], [sh[0] - 0.12 - tr * 0.15, sh[1] - 0.06],
    mid, back, back, ...hem, front, front, [sh[0] + 0.012, sh[1] - len * 0.5], [sh[0] + 0.05, sh[1] - 0.12],
  ];
  const folds = [0.2, 0.47, 0.74].map((f, i) => [[sh[0] - 0.035 - i * 0.03, sh[1] - 0.03 - i * 0.03], [lerp(back[0], front[0], f), lerp(back[1], front[1], f)]]);
  paint(ctx, S, () => blobL(ctx, F, pts), t, lerp(0.04, 0.016, m), {
    hatch: true,
    inner: m > 0.5 ? null : (c) => {
      c.fillStyle = t.d;
      for (const [a, b] of folds) {
        const m = P2(a, b, 0.55);
        c.beginPath(); blobL(c, F, [a, [m[0] - 0.018, m[1]], [b[0] - 0.042, b[1] - 0.03], [b[0] + 0.012, b[1] - 0.03], [m[0] + 0.006, m[1]]]); c.fill();
      }
      c.fillStyle = S.night ? t.b : t.l;
      for (let i = 0; i < folds.length - 1; i++) {
        const a = P2(folds[i][0], folds[i + 1][0], 0.5), b = P2(folds[i][1], folds[i + 1][1], 0.45), m = P2(a, b, 0.6);
        c.beginPath(); blobL(c, F, [a, [m[0] - 0.006, m[1]], [b[0] - 0.012, b[1] - 0.03], [b[0] + 0.006, b[1] - 0.03], [m[0] + 0.004, m[1]]]); c.fill();
      }
      if (S.lod === 2) for (const [a, b] of folds) strokeL(c, F, [P2(a, b, 0.25), P2(a, b, 0.7), [b[0] - 0.012, b[1] - 0.02]], S.ink, S.lw * 0.8);
    },
  });
}

const COLLAR = [[-0.075, 0.035], [-0.01, 0.066], [0.058, 0.036], [0.062, -0.006], [0.022, 0.016], [-0.05, 0.006]];
// the small hero's mantle (torso frame): over both shoulders and the whole
// cuirass, falling over the skirt to mid-thigh at the back; the collar's
// points (the last edge split in three) blend into it
const COLLAR8 = [...COLLAR.slice(0, 5), [-0.002, 0.0127], [-0.026, 0.0093], COLLAR[5]];
const CAPE = [[-0.098, 0.322], [-0.004, 0.342], [0.072, 0.31], [0.094, 0.22], [0.086, 0.06], [0.03, -0.11], [-0.088, -0.2], [-0.096, 0.02]];
function drawCollar(ctx, S, F, J, o) {
  let t = S.T[o.cloak];
  if (!t || S.lod === 0) return;
  const sh = J.S, m = S.mass || 0;
  if (m > 0) t = massTone(t, m);
  const pts = m > 0 ? COLLAR8.map((p, i) => P2([sh[0] + p[0], sh[1] + p[1]], J.at(CAPE[i][0], CAPE[i][1]), m)) : COLLAR.map((p) => [sh[0] + p[0], sh[1] + p[1]]);
  paint(ctx, S, () => blobL(ctx, F, pts), t, 0.012);
}

function drawHelmet(ctx, S, F, J, cfg, P) {
  const T = S.T;
  const ht = T[cfg.helm];
  const hp = (u, v) => headPt(J, u, v);
  const cs = cfg.crest ?? 1;
  if (cfg.beard !== false) paint(ctx, S, () => blobL(ctx, F, BEARD.map((p) => hp(p[0], p[1]))), T[cfg.beard || 'hair'], 0.008);
  if (cs > 0) {
    const w = S.wall, sw = 0.01 * sin(w * 2.3 + S.seed) - P.trail * 0.25;
    const sc = (p, k) => [p[0] * (0.75 + 0.25 * cs) + (p[0] < -0.07 ? sw * k : 0), p[1] > 0.08 ? 0.08 + (p[1] - 0.08) * cs : p[1]];
    let out = CREST_OUT.map((p) => sc(p, 1));
    const inn = CREST_IN.map((p) => sc(p, 0.6));
    if (S.lod === 2) { // tufted outer edge
      const jag = [];
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i], b = out[i + 1], m = P2(a, b, 0.5);
        const dx = m[0] + 0.04, dy = m[1] - 0.06, l = hypot(dx, dy) || 1;
        const k = 0.011 * (0.6 + hash(i * 3.1 + S.seed));
        jag.push(a, [m[0] + (dx / l) * k, m[1] + (dy / l) * k]);
      }
      jag.push(out[out.length - 1]);
      out = jag;
    }
    const ct = cfg.crestTone ? T[cfg.crestTone] : T.hair;
    const pts = [...out, ...inn].map((p) => hp(p[0], p[1]));
    paint(ctx, S, () => blobL(ctx, F, pts), ct, 0.022, {
      inner: S.lod === 2 ? (c) => { // horsehair strands
        c.strokeStyle = ct.h; c.lineWidth = S.lw * 0.75; c.beginPath();
        for (let i = 1; i < 16; i++) {
          const k = i / 16;
          const a = alongL(out, k), b = alongL(inn, 1 - k);
          const pa = hp(...P2(a, b, 0.06)), pb = hp(...P2(a, b, 0.62 + 0.2 * hash(i + S.seed)));
          c.moveTo(F.X(pa[0], pa[1]), F.Y(pa[0], pa[1])); c.lineTo(F.X(pb[0], pb[1]), F.Y(pb[0], pb[1]));
        }
        c.stroke();
      } : null,
    });
    if (cfg.crestEdge && !S.sil) { // a lit edge along the top of the horsehair
      const edge = out.slice(1, Math.round(out.length * 0.78)).map((p) => hp(p[0], p[1]));
      ctx.lineCap = 'round';
      strokeL(ctx, F, edge, S.night ? S.rim : C.ivory, max(S.px * 1.2, S.h * 0.01), S);
    }
  }
  cfg.afterCrest?.(ctx, S, F, J, P);            // e.g. Anchises, between his son's crest and helmet
  const helm = HELM.map((p) => hp(p[0], p[1]));
  paint(ctx, S, () => blobL(ctx, F, helm), ht, 0.018, {
    inner: S.lod === 2 ? (c) => {
      const orn = ht.h, w = S.lw * (cfg.ornament ? 1.2 : 0.8);
      strokeL(c, F, [hp(-0.074, 0.01), hp(-0.02, 0.024), hp(0.034, 0.022), hp(0.076, 0.014)], orn, w);     // brow band
      strokeL(c, F, [hp(0.04, -0.004), hp(0.008, -0.036), hp(0.004, -0.074)], orn, S.lw * 0.8);           // cheek piece
      strokeL(c, F, [hp(-0.075, -0.06), hp(-0.04, -0.054), hp(-0.014, -0.04)], orn, S.lw * 0.8);          // neck guard
      if (cfg.ornament && S.fine) spiral(c, F, hp(-0.042, -0.026), 0.002, 0.0013, 12, orn, S.lw * 0.7, -1);
    } : null,
  });
  if (S.sil) return;
  // eye opening
  ctx.beginPath(); polyL(ctx, F, [hp(0.074, 0.003), hp(0.052, 0.01), hp(0.038, 0.0), hp(0.056, -0.01)]);
  ctx.fillStyle = S.ink; ctx.fill();
}

function drawHead(ctx, S, F, J, cfg) { // bare head (civilians): face, hair, beard
  const T = S.T;
  const hp = (u, v) => headPt(J, u, v);
  const face = [[0.0, 0.066], [0.04, 0.056], [0.056, 0.03], [0.058, 0.012], [0.068, -0.006], [0.058, -0.014], [0.06, -0.03], [0.05, -0.05], [0.034, -0.064], [0.004, -0.058], [-0.03, -0.04], [-0.05, -0.006], [-0.054, 0.03], [-0.034, 0.058]].map((p) => hp(p[0], p[1]));
  paint(ctx, S, () => blobL(ctx, F, face), T.skin, 0.012);
  const hair = T[cfg.hair || 'hair'];
  const style = cfg.hairStyle || 'short';
  const hairPts = (style === 'bun'
    ? [[0.036, 0.062], [0.0, 0.074], [-0.044, 0.064], [-0.07, 0.044], [-0.09, 0.036], [-0.094, 0.006], [-0.07, -0.004], [-0.052, -0.024], [-0.032, 0.0], [-0.01, 0.034], [0.034, 0.04], [0.05, 0.05]]
    : [[0.04, 0.058], [0.0, 0.074], [-0.044, 0.064], [-0.066, 0.034], [-0.068, -0.004], [-0.052, -0.03], [-0.036, -0.012], [-0.02, 0.02], [0.02, 0.036], [0.05, 0.044]]).map((p) => hp(p[0], p[1]));
  paint(ctx, S, () => blobL(ctx, F, hairPts), hair, 0.012);
  if (cfg.beard) {
    const bp = [[0.06, -0.022], [0.064, -0.05], [0.05, -0.09], [0.024, -0.11], [0.0, -0.09], [-0.014, -0.05], [0.014, -0.036], [0.036, -0.028]].map((p) => hp(p[0], p[1]));
    paint(ctx, S, () => blobL(ctx, F, bp), T[cfg.beard], 0.012);
  }
  if (S.lod === 2 && !S.sil) {
    const e1 = hp(0.04, 0.012), e2 = hp(0.054, 0.008);
    ctx.beginPath(); ctx.moveTo(F.X(...e1), F.Y(...e1)); ctx.lineTo(F.X(...e2), F.Y(...e2));
    ctx.strokeStyle = S.ink; ctx.lineWidth = S.lw * 1.3; ctx.stroke();
  }
}

function drawSkirt(ctx, S, F, J, cfg) {
  const T = S.T;
  const t0 = J.legs[0].t, t1 = J.legs[1].t;
  const fw = max(0, max(t0, t1)), bw = min(0, min(t0, t1));
  const at = (u, v) => J.at(u, v);
  const ct = T[cfg.chiton || 'linen'];
  if (cfg.longSkirt) { // long chiton: hem swings with the knees
    const L0 = J.legs[0], L1 = J.legs[1];
    const lo = cfg.longSkirt === 'ankle' ? 0.88 : 0.45;
    const [fr, bk] = L0.knee[0] > L1.knee[0] ? [L0, L1] : [L1, L0];
    const fh = P2(fr.knee, fr.ankle, lo), bh = P2(bk.knee, bk.ankle, lo);
    const sway = 0.008 * sin(S.wall * 2 + S.seed);
    const pts = [at(0.066, 0.02), [fr.knee[0] + 0.056, fr.knee[1]], [fh[0] + 0.062 + sway, fh[1] - 0.012], [fh[0] + 0.062 + sway, fh[1] - 0.012],
      [lerp(fh[0], bh[0], 0.5), min(fh[1], bh[1]) - 0.018], [bh[0] - 0.058 + sway, bh[1] - 0.012], [bh[0] - 0.058 + sway, bh[1] - 0.012],
      [bk.knee[0] - 0.066, bk.knee[1]], at(-0.074, 0.02)];
    paint(ctx, S, () => blobL(ctx, F, pts), ct, 0.028, {
      inner: (c) => {
        c.strokeStyle = ct.d; c.lineWidth = S.lw * 0.9; c.beginPath();
        for (let i = 1; i < 5; i++) { const p = at(-0.06 + i * 0.024, -0.02), q = [lerp(bh[0] - 0.05, fh[0] + 0.05, i / 5), lerp(bh[1], fh[1], i / 5) - 0.01]; c.moveTo(F.X(...p), F.Y(...p)); c.lineTo(F.X(...q), F.Y(...q)); }
        c.stroke();
      },
    });
    return;
  }
  const hem = -0.13;
  paint(ctx, S, () => blobL(ctx, F, [at(0.07, 0.02), at(0.075, -0.04), at(0.09 + 0.07 * fw, hem), at(0.09 + 0.07 * fw, hem), at(0.0, hem - 0.012), at(-0.088 + 0.07 * bw, hem), at(-0.088 + 0.07 * bw, hem), at(-0.078, -0.04), at(-0.07, 0.02)]), ct, 0.02);
  if (cfg.pteruges) {
    const pt = T[cfg.pteruges];
    const ph = -0.088;
    const tl = (k, v) => at(lerp(-0.074 + 0.04 * bw * (v < 0 ? 1 : 0), 0.076 + 0.04 * fw * (v < 0 ? 1 : 0), k), v);
    paint(ctx, S, () => polyL(ctx, F, [at(0.074, 0.0), at(0.084 + 0.05 * fw, ph), at(-0.082 + 0.05 * bw, ph), at(-0.074, 0.0)]), pt, 0.016, {
      inner: S.lod ? (c) => {
        const n = S.lod === 2 ? 7 : 5;
        c.fillStyle = pt.d;
        for (let i = 0; i < n; i += 2) { c.beginPath(); polyL(c, F, [tl(i / n, 0.0), tl((i + 1) / n, 0.0), tl((i + 1) / n, ph), tl(i / n, ph)]); c.fill(); }
        c.strokeStyle = S.ink; c.lineWidth = S.lw * 0.8; c.beginPath();
        for (let i = 1; i < n; i++) { const p = tl(i / n, 0.0), q = tl(i / n, ph); c.moveTo(F.X(...p), F.Y(...p)); c.lineTo(F.X(...q), F.Y(...q)); }
        c.stroke();
        if (S.lod === 2 && cfg.ornament) {
          c.fillStyle = pt.h;
          for (let i = 0; i < n; i++) for (const v of [-0.012, -0.07]) { const p = tl((i + 0.5) / n, v); c.beginPath(); c.arc(F.X(...p), F.Y(...p), S.h * 0.0045, 0, TAU); c.fill(); }
        }
      } : null,
    });
  }
}

// One-piece chiton for civilians: blouse over the belt, skirt swinging with the knees.
function drawGarment(ctx, S, F, J, cfg) {
  const T = S.T, ct = T[cfg.chiton || 'linen'];
  const at = (u, v) => J.at(u, v);
  const L0 = J.legs[0], L1 = J.legs[1];
  const [fr, bk] = L0.knee[0] > L1.knee[0] ? [L0, L1] : [L1, L0];
  const lo = cfg.longSkirt === 'ankle' ? 0.86 : 0.16;
  const fh = P2(fr.knee, fr.ankle, lo), bh = P2(bk.knee, bk.ankle, lo);
  const sway = 0.008 * sin(S.wall * 2 + S.seed);
  const hemMid = [lerp(fh[0], bh[0], 0.5), min(fh[1], bh[1]) - 0.014];
  const pts = [
    at(0.024, 0.318), at(0.058, 0.294), at(0.08, 0.236), at(0.08, 0.17), at(0.074, 0.1), at(0.088, 0.062), at(0.072, 0.04),
    [fr.knee[0] + 0.07, fr.knee[1] + 0.03], [fh[0] + 0.1 + sway, fh[1] - 0.014], [fh[0] + 0.1 + sway, fh[1] - 0.014], hemMid,
    [bh[0] - 0.094 + sway, bh[1] - 0.014], [bh[0] - 0.094 + sway, bh[1] - 0.014], [bk.knee[0] - 0.084, bk.knee[1] + 0.03],
    at(-0.096, -0.02), at(-0.082, 0.08), at(-0.084, 0.2), at(-0.076, 0.272), at(-0.044, 0.312),
  ];
  paint(ctx, S, () => blobL(ctx, F, pts), ct, 0.032, {
    hatch: true,
    inner: S.lod ? (c) => {
      c.fillStyle = ct.d; // shadow under the blouse
      c.beginPath(); polyL(c, F, [at(0.09, 0.062), at(-0.09, 0.062), at(-0.09, 0.036), at(0.09, 0.036)]); c.fill();
      strokeL(c, F, [at(0.072, 0.072), at(-0.084, 0.072)], T[cfg.belt || 'leather'].b, S.lw * 1.8);
      c.strokeStyle = ct.d; c.lineWidth = S.lw * 0.9; c.beginPath();
      const nf = S.lod === 2 ? 7 : 4;
      for (let i = 1; i < nf; i++) {
        const k = i / nf;
        const p = at(lerp(-0.08, 0.08, k), 0.034);
        const q = [lerp(bh[0] - 0.086, fh[0] + 0.09, k) + sway * 0.5, lerp(bh[1], fh[1], k) - 0.01];
        c.moveTo(F.X(...p), F.Y(...p)); c.quadraticCurveTo(F.X(lerp(p[0], q[0], 0.3), (p[1] + q[1]) / 2), F.Y(lerp(p[0], q[0], 0.3), (p[1] + q[1]) / 2), F.X(...q), F.Y(...q));
      }
      c.stroke();
      strokeL(c, F, [at(0.05, 0.27), at(0.022, 0.17), at(0.034, 0.08)], ct.d, S.lw * 0.9);
      strokeL(c, F, [at(-0.03, 0.28), at(-0.05, 0.16), at(-0.04, 0.08)], ct.d, S.lw * 0.8);
    } : null,
  });
}

function drawTorso(ctx, S, F, J, cfg) {
  const T = S.T;
  const at = (u, v) => J.at(u, v);
  if (cfg.cuirass) {
    const ct = T[cfg.cuirass];
    const pts = CUIRASS.map((p) => at(p[0], p[1]));
    paint(ctx, S, () => blobL(ctx, F, pts), ct, 0.03, {
      inner: S.lod ? (c) => {
        const orn = ct.h, w = S.lw * (cfg.ornament ? 1.1 : 0.85);
        const front = S.lx * F.d > 0; // light falls on the chest
        c.fillStyle = ct.l; c.beginPath();
        if (front) blobL(c, F, [at(0.086, 0.236), at(0.088, 0.2), at(0.062, 0.18), at(0.03, 0.205), at(0.04, 0.262), at(0.066, 0.282)]);
        else blobL(c, F, [at(-0.07, 0.29), at(-0.082, 0.24), at(-0.08, 0.17), at(-0.056, 0.2), at(-0.05, 0.27)]);
        c.fill();
        c.fillStyle = ct.d; c.beginPath(); blobL(c, F, [at(0.066, 0.15), at(0.07, 0.06), at(0.04, 0.05), at(0.046, 0.13)]); c.fill();
        strokeL(c, F, [at(0.07, 0.03), at(-0.07, 0.03)], cfg.ornament ? orn : ct.d, S.lw * 2.2);    // belt
        if (S.lod < 2) return;
        strokeL(c, F, [at(0.088, 0.21), at(0.04, 0.17), at(-0.02, 0.172), at(-0.05, 0.19)], orn, w); // pectoral
        strokeL(c, F, [at(0.07, 0.112), at(0.02, 0.1)], orn, w * 0.8);                                // abdomen
        strokeL(c, F, [at(0.072, 0.0), at(-0.074, 0.0)], orn, w * 0.8);                              // lower rim
        if (cfg.ornament) {
          c.fillStyle = orn;
          for (let i = 0; i < 6; i++) { const p = at(lerp(-0.06, 0.064, i / 5), 0.03); c.beginPath(); c.arc(F.X(...p), F.Y(...p), S.h * 0.005, 0, TAU); c.fill(); }
          strokeL(c, F, [at(0.064, 0.29), at(0.0, 0.252), at(-0.07, 0.262)], orn, w);                // collar band
          spiral(c, F, at(0.03, 0.235), 0.003, 0.0016, 13, orn, w * 0.8);
        }
      } : null,
    });
  } else {
    const ct = T[cfg.chiton || 'linen'];
    const pts = CHITON_TOP.map((p) => at(p[0], p[1]));
    paint(ctx, S, () => blobL(ctx, F, pts), ct, 0.024, {
      inner: S.lod ? (c) => {
        strokeL(c, F, [at(0.066, 0.04), at(-0.07, 0.04)], cfg.belt ? T[cfg.belt].b : ct.d, S.lw * 1.8);
        strokeL(c, F, [at(0.05, 0.27), at(0.012, 0.15), at(-0.01, 0.06)], ct.d, S.lw * 0.9);
        strokeL(c, F, [at(-0.03, 0.28), at(-0.05, 0.12)], ct.d, S.lw * 0.8);
      } : null,
    });
  }
}

function drawShield(ctx, S, F, J, P, cfg) {
  const A = J.arms[1];
  const c0 = P2(A.el, A.wr, 0.62);
  const c = [c0[0] + 0.03, c0[1] + 0.005];
  const T = S.T, st = T[cfg.shieldTone || 'bronze'];
  const cx = F.X(c[0], c[1]), cy = F.Y(c[0], c[1]);
  const rx = 0.115 * S.h, ry = 0.235 * S.h;
  const rot = F.d * (J.lean * 0.55 - (P.rot || 0));
  const ell = () => { ctx.moveTo(cx + cos(rot) * rx, cy + sin(rot) * rx); ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU); };
  paint(ctx, S, ell, st, 0.035, {
    inner: (g) => {
      g.strokeStyle = st.l; g.lineWidth = rx * 0.13; g.beginPath(); g.ellipse(cx, cy, rx * 0.91, ry * 0.95, rot, 0, TAU); g.stroke();
      g.strokeStyle = S.ink; g.lineWidth = S.lw * 0.8; g.beginPath(); g.ellipse(cx, cy, rx * 0.84, ry * 0.9, rot, 0, TAU); g.stroke();
      if (cfg.device && S.lod === 2) { g.fillStyle = T[cfg.device].b; g.beginPath(); g.ellipse(cx + F.d * rx * 0.05, cy, rx * 0.3, ry * 0.22, rot, 0, TAU); g.fill(); }
    },
  });
}

function drawSpear(ctx, S, F, J, P) {
  const A = J.arms[0];
  const g = A.mid;
  const mode = P.spear;
  let ang, back, fwd; // direction (radians from the up vertical, + forward), lengths behind / ahead of the hand
  if (mode === 'rest') { ang = 0.0; back = g[1]; fwd = 1.38 - g[1]; }
  else if (mode === 'carry') { ang = 0.04; back = 0.5; fwd = 0.82; }
  else if (mode === 'level') { ang = 1.42; back = 0.48; fwd = 0.88; }
  else if (mode === 'ready' || mode === 'low') { ang = mode === 'low' ? 1.25 : 0.95; back = 0.5; fwd = 0.85; }
  else if (mode === 'raise') { ang = 0.55; back = 0.45; fwd = 0.9; }
  else return null;
  ang -= P.rot || 0;
  const dx = sin(ang), dy = cos(ang);
  const b = [g[0] - dx * back, g[1] - dy * back], t = [g[0] + dx * fwd, g[1] + dy * fwd];
  const T = S.T;
  ctx.lineCap = 'round';
  strokeL(ctx, F, [b, t], S.ink, max(S.px * 1.2, S.h * 0.016) + S.lw, S);
  strokeL(ctx, F, [b, t], T.shaft, max(S.px, S.h * 0.011), S);
  const n = [dy, -dx];
  const tip = [t[0] + dx * 0.075, t[1] + dy * 0.075];
  const bl = [[t[0] - dx * 0.02, t[1] - dy * 0.02], [t[0] + n[0] * 0.015 + dx * 0.02, t[1] + n[1] * 0.015 + dy * 0.02], tip, [t[0] - n[0] * 0.015 + dx * 0.02, t[1] - n[1] * 0.015 + dy * 0.02]];
  paint(ctx, S, () => polyL(ctx, F, bl), { d: T.steel.d, b: T.steel.l, l: T.steel.h, h: T.steel.h }, 0, { lw: 0.8 });
  if (S.lod) strokeL(ctx, F, [b, [b[0] - dx * 0.04, b[1] - dy * 0.04]], T.bronze.b, max(S.px, S.h * 0.012), S);
  return F.w(tip);
}

function drawTorch(ctx, S, F, J, e) {
  const g = J.arms[0].mid;
  const top = [g[0] + 0.02, g[1] + 0.2];
  ctx.lineCap = 'round';
  strokeL(ctx, F, [[g[0] - 0.01, g[1] - 0.05], top], S.ink, max(S.px * 1.5, S.h * 0.022), S);
  if (S.sil) return null;
  const q = e.reduced ? 0 : floor((e.t ?? 0) * 12);
  const f = 0.85 + 0.3 * hash(q * 1.7 + S.seed);
  const [cx, cy] = F.w(top);
  const r = S.h * 0.05 * f;
  const fl = S.T.flame;
  ctx.fillStyle = fl[0]; ctx.beginPath(); flameShape(ctx, cx, cy, r * 1.25, r * 2.6 * f, hash(q + 3.1) - 0.5); ctx.fill();
  ctx.fillStyle = fl[2]; ctx.beginPath(); flameShape(ctx, cx, cy - r * 0.15, r * 0.6, r * 1.4, hash(q + 7.7) - 0.5); ctx.fill();
  return [cx, cy - r * 2];
}
function flameShape(ctx, x, y, w, hgt, lean) {
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.9, y - hgt * 0.55, x + lean * w, y - hgt);
  ctx.quadraticCurveTo(x + w * 0.9, y - hgt * 0.5, x + w, y);
  ctx.quadraticCurveTo(x, y + w * 0.9, x - w, y);
}

function drawSword(ctx, S, F, J, P, inHand) {
  const T = S.T;
  if (inHand) {
    const A = J.arms[0];
    const g = A.mid, a = A.fa - 0.25;
    const dx = sin(a), dy = -cos(a), n = [-dy, dx];
    const tip = [g[0] + dx * 0.26, g[1] + dy * 0.26];
    const blade = [[g[0] + n[0] * 0.013, g[1] + n[1] * 0.013], [g[0] + dx * 0.16 + n[0] * 0.017, g[1] + dy * 0.16 + n[1] * 0.017], tip, [g[0] + dx * 0.16 - n[0] * 0.017, g[1] + dy * 0.16 - n[1] * 0.017], [g[0] - n[0] * 0.013, g[1] - n[1] * 0.013]];
    paint(ctx, S, () => polyL(ctx, F, blade), T.steel, 0.006, { lw: 0.8 });
    ctx.lineCap = 'round';
    strokeL(ctx, F, [[g[0] + n[0] * 0.032, g[1] + n[1] * 0.032], [g[0] - n[0] * 0.032, g[1] - n[1] * 0.032]], S.ink, max(S.px * 1.5, S.h * 0.014), S);
    return F.w(tip);
  }
  // sheathed at the far hip, hilt forward
  const a = J.at(0.075, 0.035), b = J.at(-0.17, -0.17);
  ctx.lineCap = 'round';
  strokeL(ctx, F, [a, b], S.ink, max(S.px * 2, S.h * 0.032), S);
  strokeL(ctx, F, [a, b], T.leather.b, max(S.px, S.h * 0.021), S);
  strokeL(ctx, F, [a, [a[0] + 0.035, a[1] + 0.02]], T.steel.l, max(S.px, S.h * 0.014), S);
  return null;
}

// Rope segment drawn between the far and near limbs (rope poses).
// o.ropeW (world units), o.ropeColor and o.ropeLight let it match a rope the
// shot draws behind the figure, so the two line up seamlessly.
function drawRope(ctx, S, o) {
  if (S.sil || o.ropeX == null || o.ropeTop == null) return;
  const x = o.ropeX, y0 = o.ropeTop, y1 = o.ropeBottom ?? o.y + o.h * 0.3;
  const w = o.ropeW ?? max(S.px * 1.5, o.h * 0.018);
  const line = (dx, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x + dx, y0); ctx.lineTo(x + dx, y1); ctx.stroke(); };
  ctx.lineCap = 'butt';
  line(0, S.ink, w + 2 * max(S.lw, S.px));
  line(0, o.ropeColor ?? (S.night ? '#8f8a83' : '#d8cfbd'), w);
  if (w > 3 * S.px) {
    line(w * 0.18, o.ropeLight ?? (S.night ? '#d6d1c7' : '#f3ede1'), w * 0.38);
    ctx.strokeStyle = 'rgba(8,8,11,0.65)'; ctx.lineWidth = max(S.px, w * 0.15); ctx.beginPath(); // the twist of the lay
    for (let y = y0; y < y1; y += w) { ctx.moveTo(x - w * 0.45, y - w * 0.28); ctx.lineTo(x + w * 0.45, y + w * 0.28); }
    ctx.stroke();
  }
}

// A rope held in the near hand ('pull', 'lift' …): from o.ropeFrom to the
// hand to o.ropeTo (world points), over the body and the far hand, under the
// near arm. Chain pullers by passing each one the next one's hand.
function drawHaul(ctx, S, F, J, o) {
  if (S.sil) return;
  const hd = F.w(J.arms[0].mid);
  const pts = [o.ropeFrom, hd, o.ropeTo].filter(Boolean);
  const w = o.ropeW ?? max(S.px * 1.4, o.h * 0.03);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, lw] of [[S.ink, w + 2 * max(S.lw, S.px)], [o.ropeColor ?? (S.night ? '#a9a49a' : '#d8cfbd'), w]]) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  }
}

// ------------------------------------------------------------------ side figure
function drawSide(ctx, e, o, cfg) {
  if (!(o.h > 0)) return null;
  const S = style(e, o);
  if (S.lod === 0) { if (o.pose !== 'sleep') return glyphOne(ctx, e, o, cfg); S.lod = 1; }   // (no lying crowd glyph: a tiny sleeper stays vector)
  // hero Agamemnon's vermilion mass: by device px (1 below 34, 0 above 48), or
  // o.mass (0..1 | true | false) fixed by the shot, so it cannot morph mid-shot
  S.mass = !cfg.mass ? 0 : o.mass != null ? (o.mass === true ? 1 : cl(+o.mass || 0)) : smooth01((48 - o.h * e.s) / 14);
  if (S.mass) S.rimMin = lerp(S.rimMin, 0.5 / e.s, S.mass);   // thin shade and rim crescents: the mass stays vermilion
  const P = pose(o, cfg);
  if (cfg.lean) P.lean += cfg.lean;
  if (o.lean) P.lean += o.lean;                    // additive lean (rad, + forward): ease a pose into the next
  if (cfg.farArm && P.shield === 'none') P.arms[1] = cfg.farArm;
  const J = solve(P, cfg.legScale ?? 1);
  ropeGrip(J, P);
  const F = frame(o, P, J);
  const out = { hands: [F.w(J.arms[0].mid), F.w(J.arms[1].mid)], head: F.w(J.Hc), top: F.Y(...headPt(J, 0, cfg.crest ? 0.08 + 0.1 * cfg.crest : 0.07)), tip: null,
    feet: J.legs.map((L) => F.w([L.heel, L.ball, L.toe].reduce((a, b) => (b[1] < a[1] ? b : a)))) }; // lowest point of each foot [near, far]
  if (o.measure) {                                 // anchors only (e.g. to chain ropes), nothing drawn;
    out.soles = J.legs.map((L) => [F.w(L.heel), F.w(L.ball), F.w(L.toe)]);   // + each foot's heel, ball and toe (slip checks)
    return out;
  }
  const opt = { ...o, cloak: P.sleep ? 'none' : o.cloak ?? cfg.cloak ?? 'none' };
  const shield = P.shield === 'front';
  const body = () => {
    if (opt.cloak !== 'none') drawCloak(ctx, S, F, J, P, cfg, opt);
    cfg.behind?.(ctx, S, F, J, P);
    drawArm(ctx, S, F, J.arms[1], cfg, true);
    if (!shield && !cfg.farHandFront) drawHand(ctx, S, F, J.arms[1], true);
    if (cfg.sword && o.sword !== 'hand' && P.spear === 'none') drawSword(ctx, S, F, J, P, false);
    drawLeg(ctx, S, F, J.legs[1], J, cfg, true);
    if (P.name === 'climb' || P.name === 'slide') drawRope(ctx, S, o);
    drawLeg(ctx, S, F, J.legs[0], J, cfg, false);
    if (cfg.civil) drawGarment(ctx, S, F, J, cfg);
    else { drawSkirt(ctx, S, F, J, cfg); drawTorso(ctx, S, F, J, cfg); }
    if (opt.cloak !== 'none') drawCollar(ctx, S, F, J, opt);
    paint(ctx, S, () => capL(ctx, F, J.N, P2(J.N, J.Hc, 0.6), 0.052, 0.048), S.T.skin, 0.01);
    if (cfg.helm) drawHelmet(ctx, S, F, J, cfg, P); else drawHead(ctx, S, F, J, cfg);
    cfg.over?.(ctx, S, F, J, P);
    if (o.ropeTo || o.ropeFrom) drawHaul(ctx, S, F, J, o);
    if (shield) drawShield(ctx, S, F, J, P, cfg);
    drawArm(ctx, S, F, J.arms[0], cfg, false);
    if (P.spear === 'torch') out.tip = drawTorch(ctx, S, F, J, e);
    else if (cfg.sword && (o.sword === 'hand' || (o.sword !== 'hip' && /crouch|creep|sneak|land|run/.test(P.name)))) out.tip = drawSword(ctx, S, F, J, P, true);
    else if (P.spear !== 'none') out.tip = drawSpear(ctx, S, F, J, P);
    drawHand(ctx, S, F, J.arms[0], false);
    if (shield || cfg.farHandFront) drawHand(ctx, S, F, J.arms[1], true);
    cfg.front?.(ctx, S, F, J, P);
  };
  S.hb = { x0: o.x - o.h * 0.45, x1: o.x + o.h * 0.45, y0: o.y - o.h * 1.5, y1: o.y + o.h * 0.02 };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  castShadow(ctx, S, o);
  S.sil = S.lod === 2 ? 2.8 : 2.4 * (1 - S.mass);  // (the small vermilion mass keeps only its own ink)
  if ((S.lod === 2 || S.hero || cfg.bold1) && o.bold !== false && S.sil > 0.3) { body(); }
  S.sil = 0;
  body();
  ctx.restore();
  return out;
}

// ------------------------------------------------------------------ front / back view
// A figure walking toward the camera (o.view 'front') or away from it
// ('back'), for paths that run in depth (s03's Trojans coming out of the
// passage). The side rig's gait drives it: every joint's forward offset u
// becomes a small screen drop u * tilt (toward the camera = lower on screen),
// so the swing knee lifts and comes down-screen, the hem swings with it, and
// the planted foot holds its ground point while the body comes on.
//   o.tilt: the ground's foreshortening at the figure, screen y per unit of
//   depth in units of h (s03's forecourt 0.15; default 0.16).
//   phase = distance / stride(h, pose), exactly as for the side view.
// Poses: 'stand', 'walk', 'run', 'flee' (others stand). Same tones, ink and
// height conventions as the side view (x, y = the ground point under the
// hips, h = height to the top of the head).
function drawFront(ctx, e, o, cfg) {
  if (!(o.h > 0)) return null;
  const S = style(e, o);
  const back = o.view === 'back';
  const nm = /^(walk|run|flee)$/.test(o.pose || '') ? o.pose : 'stand';
  const P = pose({ ...o, pose: nm, planted: false }, cfg);   // (the planted gaits are side-view only)
  if (cfg.lean) P.lean += cfg.lean;
  if (o.lean) P.lean += o.lean;
  P.lean *= 0.6;                                    // a lean toward the camera reads smaller
  // the swing knee lifts higher than in profile: seen end-on, the lift is
  // what shows the step (the stride itself only foreshortens)
  if (P.move) P.legs = P.legs.map(([t, k, f]) => [t, k > 0.2 ? 0.2 + (k - 0.2) * 1.45 : k, f]);
  const J = solve(P, cfg.legScale ?? 1);
  const T = S.T, h = o.h;
  const tl = (o.tilt ?? 0.16) * (back ? -1 : 1);
  const F = { h, d: 1, X: (u) => o.x + u * h, Y: (u, v) => o.y - v * h };
  F.w = (p) => [F.X(p[0], p[1]), F.Y(p[0], p[1])];
  const pr = (lat, p) => [lat, p[1] - p[0] * tl];   // rig point [u forward, v] at lateral offset lat -> front-view coords
  const RS = back ? 1 : -1;                         // screen side of the figure's right (legs[0], arms[0])
  const sw0 = P.move ? sin(TAU * (P.ph || 0)) : 0;   // + while the figure's right leg carries the weight
  const shift = RS * 0.012 * sw0;                    // the upper body sways over the stance leg
  const tor = (lat, v) => { const q = pr(lat, J.at(0, v)); return [q[0] + shift * cl(v / 0.3, 0, 1), q[1]]; };   // torso point
  const out = {
    hands: null, head: F.w([pr(0, J.Hc)[0] + shift, pr(0, J.Hc)[1]]),
    top: F.Y(0, pr(0, J.Hc)[1] + 0.07), tip: null,
    feet: [0, 1].map((i) => { const L = J.legs[i]; const lo = [L.heel, L.ball, L.toe].map((q) => pr(0, q)).reduce((a, b) => (b[1] < a[1] ? b : a)); return F.w([(i ? -RS : RS) * 0.042, lo[1]]); }),
  };
  // lateral set of an arm: a hand swung toward us comes in a little across
  // the body (not the spear hand, which keeps the shaft at his side); the
  // spear arm clears the shield's rim
  const spearHeld = P.spear !== 'none' && P.spear !== 'torch' && !!ARMS[P.spear];
  const torchUp = P.spear === 'torch';             // a torch is raised out at his side, beside the head
  const armLat = (i) => ({ fw: i === 0 && (spearHeld || torchUp) ? 0 : max(0, J.arms[i].hd[0] * (back ? -1 : 1)) * 0.35, ox: i === 0 && torchUp ? 0.075 : i === 0 && P.shield === 'front' ? 0.036 : 0 });
  const handAt = (i) => { const { fw, ox } = armLat(i), sd = i ? -RS : RS, w = pr(sd * (0.114 + ox - fw) + shift, J.arms[i].wr), q = pr(sd * (0.11 + ox - fw) + shift, J.arms[i].hd); return P2(w, q, 0.45); };
  out.hands = [F.w(handAt(0)), F.w(handAt(1))];
  if (o.measure) return out;
  const opt = { cloak: o.cloak ?? cfg.cloak ?? 'none' };
  const ct = T[cfg.chiton || 'linen'];
  const nearer = (i) => (J.legs[i].knee[0] + J.legs[i].ankle[0]) * (back ? -1 : 1);
  const legOrder = nearer(0) < nearer(1) ? [0, 1] : [1, 0];
  const armFwd = (i) => J.arms[i].hd[0] * (back ? -1 : 1);       // > 0: the hand is nearer than the torso
  const sway = 0.006 * sin(S.wall * 2 + S.seed) + 0.018 * RS * sin(TAU * ((P.ph || 0) - 0.08)) * (P.move ? 1 : 0);   // the hem swings after the hips
  const kneeLift = (i) => cl((pr(0, J.legs[i].knee)[1] - (J.H[1] - 0.24)) / 0.12, 0, 1);
  const leg = (i) => {
    const L = J.legs[i], sd = i ? -RS : RS;
    const H = tor(sd * 0.05, 0), K = pr(sd * 0.046, L.knee), A = pr(sd * 0.04, L.ankle);
    const spine = [P2(H, K, -0.08), P2(H, K, 0.5), K, P2(K, A, 0.3), P2(K, A, 0.68), A];
    paint(ctx, S, () => limbL(ctx, F, spine, [[0.052, 0.052], [0.046, 0.046], [0.033, 0.033], [0.034, 0.034], [0.024, 0.024], [0.019, 0.019]]), T.skin, 0.014);
    if (cfg.greaves) {
      const g = T[cfg.greaves];
      paint(ctx, S, () => limbL(ctx, F, [P2(K, A, -0.04), P2(K, A, 0.3), P2(K, A, 0.68), P2(K, A, 0.96)], [[0.037, 0.037], [0.039, 0.039], [0.029, 0.029], [0.023, 0.023]]), g, 0.016);
    }
    // the foot, seen end-on: a short sandal that points at the camera (its
    // lowest point projected, so the forward foot sits lower)
    const lo = [L.heel, L.ball, L.toe].map((q) => pr(sd * 0.042, q)).reduce((a, b) => (b[1] < a[1] ? b : a));
    const fb = Math.min(lo[1], A[1] - 0.03);
    const foot = () => blobL(ctx, F, [[A[0] - 0.02, A[1] + 0.004], [A[0] + 0.02, A[1] + 0.004], [lo[0] + 0.028, fb + 0.012], [lo[0] + 0.026, fb], [lo[0] - 0.026, fb], [lo[0] - 0.028, fb + 0.012]]);
    paint(ctx, S, foot, cfg.barefoot ? T.skin : T.leather, 0);
  };
  const arm = (i, handOnly = false) => {
    const A = J.arms[i], sd = i ? -RS : RS;
    const { fw, ox } = armLat(i);
    const sh = tor(sd * 0.094, BODY.torso - 0.008), el = pr(sd * (0.112 + ox) + shift - sd * fw * 0.4, A.el), wr = pr(sd * (0.114 + ox - fw) + shift, A.wr), hd = pr(sd * (0.11 + ox - fw) + shift, A.hd);
    if (!handOnly) paint(ctx, S, () => limbL(ctx, F, [sh, P2(sh, el, 0.5), el, P2(el, wr, 0.45), wr], [[0.032, 0.032], [0.027, 0.027], [0.021, 0.021], [0.021, 0.021], [0.016, 0.016]]), T.skin, 0.012);
    const sl = cfg.sleeve && !handOnly ? T[cfg.sleeve] : null;
    if (sl) { // the chiton's sleeve: from the shoulder seam, flaring a little to a hem above the elbow
      const a0 = [sh[0] - sd * 0.034, sh[1] + 0.022], a1 = [sh[0] + sd * 0.03, sh[1] + 0.012], e1 = P2(sh, el, 0.62);
      paint(ctx, S, () => polyL(ctx, F, [a0, a1, [e1[0] + sd * 0.038, e1[1] - 0.004], [e1[0] - sd * 0.034, e1[1] + 0.004]]), sl, 0.014);
    }
    const m = P2(wr, hd, 0.4);
    paint(ctx, S, () => blobL(ctx, F, [[m[0] - 0.018, m[1] + 0.022], [m[0] + 0.018, m[1] + 0.022], [m[0] + 0.02, m[1] - 0.016], [m[0], m[1] - 0.03], [m[0] - 0.02, m[1] - 0.016]]), T.skin, S.lod === 2 ? 0.008 : 0);
  };
  const cloakT = T[opt.cloak];
  const cloakBack = () => {      // front view: the mantle hangs behind, showing at the sides
    if (!cloakT || back) return;
    const s0 = tor(-0.11, 0.3), s1 = tor(0.11, 0.3), len = 0.6 * (cfg.cloakLen ?? 1);
    const b0 = tor(-0.13 - sway * 0.5, 0.3 - len), b1 = tor(0.13 - sway * 0.5, 0.3 - len);
    paint(ctx, S, () => blobL(ctx, F, [s0, s1, [s1[0] + 0.02, s1[1] - 0.2], b1, [lerp(b0[0], b1[0], 0.5), b0[1] - 0.012], b0, [s0[0] - 0.02, s0[1] - 0.2]]), T[opt.cloak + 'F'] ?? cloakT, 0.02);
  };
  const garment = () => {
    const short = !(cfg.longSkirt === 'ankle');
    const base = short ? 0.31 : 0.06;              // hem height (front coords) when standing
    const hem = (i) => base + kneeLift(i) * (short ? 0.07 : 0.08);
    const hR = hem(0), hL = hem(1);                // the figure's right / left side
    const hl = RS < 0 ? hR : hL, hr = RS < 0 ? hL : hR;   // screen left / right
    const yb = J.H[1];                             // hips (front v)
    const fl = short ? 0.11 : 0.13;
    const pts = [
      tor(-0.028, 0.318), tor(-0.07, 0.31), tor(-0.088, 0.285), tor(-0.084, 0.21), tor(-0.07, 0.12), tor(-0.082, 0.074), tor(-0.066, 0.05),
      [-0.084 + sway * 0.6, yb - 0.08], [-fl + sway, hl + 0.012], [-fl + sway, hl], [sway * 1.3 - 0.03, min(hl, hr) - 0.012], [sway * 1.3 + 0.03, min(hl, hr) - 0.012], [fl + sway, hr], [fl + sway, hr + 0.012],
      [0.084 + sway * 0.6, yb - 0.08], tor(0.066, 0.05), tor(0.082, 0.074), tor(0.07, 0.12), tor(0.084, 0.21), tor(0.088, 0.285), tor(0.07, 0.31), tor(0.028, 0.318),
    ];
    if (cfg.civil) {
      paint(ctx, S, () => blobL(ctx, F, pts), ct, 0.03, {
        hatch: true,
        inner: S.lod ? (c) => {
          c.fillStyle = ct.d;                       // shadow under the blouse
          c.beginPath(); polyL(c, F, [tor(-0.1, 0.064), tor(0.1, 0.064), tor(0.1, 0.04), tor(-0.1, 0.04)]); c.fill();
          strokeL(c, F, [tor(-0.084, 0.072), tor(0.084, 0.072)], T[cfg.belt || 'leather'].b, S.lw * 1.8);
          c.strokeStyle = ct.d; c.lineWidth = S.lw * 0.9; c.beginPath();   // folds from the belt to the hem
          const nf = S.lod === 2 ? 6 : 3;
          for (let k = 1; k < nf; k++) {
            const f = k / nf, a = tor(lerp(-0.07, 0.07, f), 0.034), b = [lerp(-fl, fl, f) + sway * 1.2, lerp(hl, hr, f) + 0.006];
            c.moveTo(F.X(...a), F.Y(...a)); c.lineTo(F.X(...b), F.Y(...b));
          }
          c.stroke();
          strokeL(c, F, [tor(-0.03, 0.3), tor(-0.012, 0.2), tor(-0.024, 0.09)], ct.d, S.lw * 0.8);
          strokeL(c, F, [tor(0.034, 0.3), tor(0.02, 0.2), tor(0.03, 0.09)], ct.d, S.lw * 0.8);
        } : null,
      });
      return;
    }
    // armour: the chiton skirt, the leather strips, the cuirass
    const skirt = pts.slice(7, 15).concat([tor(0.08, 0.06), tor(-0.08, 0.06)]);
    paint(ctx, S, () => blobL(ctx, F, skirt), ct, 0.024);
    if (cfg.pteruges) {
      const pt = T[cfg.pteruges], pv = 0.088;
      paint(ctx, S, () => polyL(ctx, F, [tor(-0.08, 0.01), tor(0.08, 0.01), [0.092 + sway * 0.5, yb - pv], [-0.092 + sway * 0.5, yb - pv]]), pt, 0.014, {
        inner: (c) => {
          c.strokeStyle = S.ink; c.lineWidth = S.lw * 0.8; c.beginPath();
          const n = S.lod === 2 ? 7 : 5;
          for (let k = 1; k < n; k++) { const a = tor(lerp(-0.08, 0.08, k / n), 0.01), b = [lerp(-0.092, 0.092, k / n) + sway * 0.5, yb - pv]; c.moveTo(F.X(...a), F.Y(...a)); c.lineTo(F.X(...b), F.Y(...b)); }
          c.stroke();
        },
      });
    }
    const cu = T[cfg.cuirass];
    const cpts = [tor(-0.03, 0.318), tor(-0.07, 0.3), tor(-0.09, 0.25), tor(-0.084, 0.17), tor(-0.074, 0.08), tor(-0.08, -0.02), tor(0.08, -0.02), tor(0.074, 0.08), tor(0.084, 0.17), tor(0.09, 0.25), tor(0.07, 0.3), tor(0.03, 0.318)];
    paint(ctx, S, () => blobL(ctx, F, cpts), cu, 0.03, {
      inner: S.lod ? (c) => {
        strokeL(c, F, [tor(-0.074, 0.02), tor(0.074, 0.02)], cfg.ornament ? cu.h : cu.d, S.lw * 2);     // belt
        if (S.lod === 2) {
          strokeL(c, F, [tor(-0.07, 0.2), tor(-0.03, 0.17), tor(0, 0.185), tor(0.03, 0.17), tor(0.07, 0.2)], cu.h, S.lw);   // pectorals
          strokeL(c, F, [tor(0, 0.17), tor(0, 0.06)], cu.d, S.lw * 0.8);
        }
      } : null,
    });
  };
  const head = () => {
    const nk0 = tor(0, BODY.torso - 0.01), C0 = [pr(0, J.Hc)[0] + shift, pr(0, J.Hc)[1]];
    paint(ctx, S, () => capL(ctx, F, nk0, [C0[0], C0[1] - 0.04], 0.05, 0.046), T.skin, 0.01);
    const hx = 0.047, hy = 0.064, cx = C0[0], cy = C0[1];
    const ov = (k = 1, dy = 0) => [[cx, cy + hy * k + dy], [cx + hx * 0.8 * k, cy + hy * 0.75 * k + dy], [cx + hx * k, cy + dy], [cx + hx * 0.75 * k, cy - hy * 0.7 * k + dy], [cx, cy - hy * k + dy], [cx - hx * 0.75 * k, cy - hy * 0.7 * k + dy], [cx - hx * k, cy + dy], [cx - hx * 0.8 * k, cy + hy * 0.75 * k + dy]];
    if (cfg.helm) {                                 // Corinthian helmet from the front (or behind): dome, cheek pieces, crest end-on
      const ht = T[cfg.helm], cs = cfg.crest ?? 1;
      if (cs > 0) {
        const cw = 0.016, ch = 0.075 + 0.05 * cs;
        paint(ctx, S, () => blobL(ctx, F, [[cx - cw, cy + hy * 0.9], [cx - cw * 1.4, cy + hy + ch * 0.6], [cx, cy + hy + ch], [cx + cw * 1.4, cy + hy + ch * 0.6], [cx + cw, cy + hy * 0.9]]), cfg.crestTone ? T[cfg.crestTone] : T.hair, 0.012);
      }
      const hp = [[cx, cy + hy * 1.12], [cx + hx * 1.05, cy + hy * 0.75], [cx + hx * 1.12, cy], [cx + hx * 0.95, cy - hy * 1.0], [cx + hx * 0.35, cy - hy * 1.08], [cx, cy - hy * 0.55], [cx - hx * 0.35, cy - hy * 1.08], [cx - hx * 0.95, cy - hy * 1.0], [cx - hx * 1.12, cy], [cx - hx * 1.05, cy + hy * 0.75]];
      paint(ctx, S, () => blobL(ctx, F, back ? hp.map(([u, v]) => [u, v < cy - hy * 0.5 ? cy - hy * 1.0 : v]) : hp), ht, 0.016, {
        inner: !back && !S.sil ? (c) => {           // the T-shaped face opening
          c.fillStyle = S.ink; c.beginPath();
          polyL(c, F, [[cx - hx * 0.62, cy + hy * 0.12], [cx + hx * 0.62, cy + hy * 0.12], [cx + hx * 0.5, cy - hy * 0.08], [cx + hx * 0.14, cy - hy * 0.12], [cx + hx * 0.18, cy - hy * 0.9], [cx - hx * 0.18, cy - hy * 0.9], [cx - hx * 0.14, cy - hy * 0.12], [cx - hx * 0.5, cy - hy * 0.08]]);
          c.fill();
        } : null,
      });
      return;
    }
    if (!back) paint(ctx, S, () => blobL(ctx, F, ov()), T.skin, 0.012);
    const hair = T[cfg.hair || 'hair'];
    const bun = cfg.hairStyle === 'bun';
    if (back) {                                     // the back of the head: hair to the nape, ears at the sides
      paint(ctx, S, () => blobL(ctx, F, [[cx - hx * 1.08, cy + 0.004], [cx + hx * 1.08, cy + 0.004], [cx + hx * 0.98, cy - 0.024], [cx + hx * 0.8, cy - 0.022], [cx + hx * 0.8, cy - 0.006], [cx + hx * 0.5, cy - 0.006], [cx + hx * 0.5, cy - 0.022]]), T.skin, 0.008);
      paint(ctx, S, () => blobL(ctx, F, [[cx, cy + hy * 1.08], [cx + hx * 0.9, cy + hy * 0.8], [cx + hx * 1.02, cy + 0.006], [cx + hx * 0.7, cy - hy * (bun ? 0.85 : 0.62)], [cx, cy - hy * (bun ? 0.95 : 0.7)], [cx - hx * 0.7, cy - hy * (bun ? 0.85 : 0.62)], [cx - hx * 1.02, cy + 0.006], [cx - hx * 0.9, cy + hy * 0.8]]), hair, 0.014);
      if (bun) paint(ctx, S, () => blobL(ctx, F, ov(0.42, hy * 0.25).map(([u, v]) => [u, v + 0.012])), hair, 0.01);
    } else {
      // the hair: a cap over the crown down to the temples (and a bun on
      // top); old men keep it white, the beard frames the chin
      const cap = bun
        ? [[cx, cy + hy * 1.1], [cx + hx * 0.95, cy + hy * 0.85], [cx + hx * 1.12, cy + 0.004], [cx + hx * 1.02, cy - hy * 0.4], [cx + hx * 0.78, cy - 0.004], [cx + hx * 0.6, cy + hy * 0.5], [cx, cy + hy * 0.56], [cx - hx * 0.6, cy + hy * 0.5], [cx - hx * 0.78, cy - 0.004], [cx - hx * 1.02, cy - hy * 0.4], [cx - hx * 1.12, cy + 0.004], [cx - hx * 0.95, cy + hy * 0.85]]
        : [[cx, cy + hy * 1.08], [cx + hx * 0.92, cy + hy * 0.82], [cx + hx * 1.04, cy + 0.008], [cx + hx * 0.84, cy + hy * 0.28], [cx + hx * 0.5, cy + hy * 0.5], [cx, cy + hy * 0.58], [cx - hx * 0.5, cy + hy * 0.5], [cx - hx * 0.84, cy + hy * 0.28], [cx - hx * 1.04, cy + 0.008], [cx - hx * 0.92, cy + hy * 0.82]];
      paint(ctx, S, () => blobL(ctx, F, cap), hair, 0.012);
      if (bun) paint(ctx, S, () => blobL(ctx, F, ov(0.42).map(([u, v]) => [u, v + hy * 1.02])), hair, 0.01);
      if (cfg.beard) {
        const bt = T[cfg.beard];
        paint(ctx, S, () => blobL(ctx, F, [[cx - hx * 0.95, cy - 0.004], [cx - hx * 0.6, cy - hy * 0.42], [cx - hx * 0.25, cy - hy * 0.4], [cx, cy - hy * 0.5], [cx + hx * 0.25, cy - hy * 0.4], [cx + hx * 0.6, cy - hy * 0.42], [cx + hx * 0.95, cy - 0.004], [cx + hx * 0.8, cy - hy * 1.05], [cx, cy - hy * 1.5], [cx - hx * 0.8, cy - hy * 1.05]]), bt, 0.012);
      }
      if (!S.sil && S.css >= 36) {                 // eyes (and at medium size the nose and mouth)
        const er = max(S.px * 0.7, h * 0.006);
        ctx.fillStyle = S.ink; ctx.beginPath();
        for (const s2 of [-1, 1]) { ctx.moveTo(F.X(cx + s2 * hx * 0.42 + er), F.Y(0, cy + hy * 0.06)); ctx.arc(F.X(cx + s2 * hx * 0.42), F.Y(0, cy + hy * 0.06), er, 0, TAU); }
        ctx.fill();
        if (S.lod === 2) {
          strokeL(ctx, F, [[cx + hx * 0.06, cy + hy * 0.02], [cx + hx * 0.1, cy - hy * 0.3], [cx - hx * 0.04, cy - hy * 0.34]], T.skin.d, S.lw);
          if (!cfg.beard) strokeL(ctx, F, [[cx - hx * 0.24, cy - hy * 0.56], [cx + hx * 0.24, cy - hy * 0.56]], T.skin.d, S.lw * 1.2);
        }
      }
    }
  };
  const cloakOver = () => {      // back view: the mantle covers the back from the shoulders
    if (!cloakT || !back) return;
    const len = 0.6 * (cfg.cloakLen ?? 1);
    const pts = [tor(-0.085, 0.31), tor(0.085, 0.31), tor(0.112, 0.25), [0.13 + sway * 0.6, pr(0, J.at(0, 0.3 - len))[1] + 0.01], [0.02 + sway, pr(0, J.at(0, 0.3 - len))[1] - 0.008], [-0.13 + sway * 0.6, pr(0, J.at(0, 0.3 - len))[1] + 0.01], tor(-0.112, 0.25)];
    paint(ctx, S, () => blobL(ctx, F, pts), cloakT, 0.04, {
      hatch: true,
      inner: S.lod ? (c) => {
        c.strokeStyle = cloakT.d; c.lineWidth = S.lw * 1.1; c.beginPath();
        for (const k of [-0.05, 0.0, 0.055]) { const a = tor(k * 0.6, 0.27), b = [k * 1.6 + sway, pr(0, J.at(0, 0.3 - len))[1] + 0.03]; c.moveTo(F.X(...a), F.Y(...a)); c.lineTo(F.X(...b), F.Y(...b)); }
        c.stroke();
      } : null,
    });
  };
  // the aspis on the left forearm, face on (front view: it covers the
  // torso; from behind its rim shows past the body) and the spear upright
  // in the right hand
  const shieldOn = P.shield === 'front';
  const shield = () => {
    const st = T[cfg.shieldTone || 'bronze'], c0 = tor(-RS * 0.045, 0.1), r = 0.19;
    const ring = (k) => { const R2 = r * k * h; ctx.moveTo(F.X(c0[0]) + R2, F.Y(0, c0[1])); ctx.arc(F.X(c0[0]), F.Y(0, c0[1]), R2, 0, TAU); };
    paint(ctx, S, () => ring(1), back ? { ...st, b: st.d, l: st.b } : st, 0.035, {
      inner: back ? null : (g) => {
        g.strokeStyle = st.l; g.lineWidth = r * h * 0.12; g.beginPath(); ring(0.9); g.stroke();
        g.strokeStyle = S.ink; g.lineWidth = S.lw * 0.8; g.beginPath(); ring(0.82); g.stroke();
        if (cfg.device && S.lod === 2) { g.fillStyle = T[cfg.device].b; g.beginPath(); ring(0.3); g.fill(); }
      },
    });
  };
  const torch = () => {            // a torch raised in the right hand: shaft, flame on twos
    const hd = handAt(0), top = [hd[0] + RS * 0.01, hd[1] + 0.2];
    ctx.lineCap = 'round';
    strokeL(ctx, F, [[hd[0], hd[1] - 0.05], top], S.ink, max(S.px * 1.5, h * 0.022), S);
    if (S.sil) return;
    const q = e.reduced ? 0 : floor((e.t ?? 0) * 12), f = 0.85 + 0.3 * hash(q * 1.7 + S.seed);
    const [cx, cy] = F.w(top), r = h * 0.05 * f, fl = T.flame;
    ctx.fillStyle = fl[0]; ctx.beginPath(); flameShape(ctx, cx, cy, r * 1.25, r * 2.6 * f, hash(q + 3.1) - 0.5); ctx.fill();
    ctx.fillStyle = fl[2]; ctx.beginPath(); flameShape(ctx, cx, cy - r * 0.15, r * 0.6, r * 1.4, hash(q + 7.7) - 0.5); ctx.fill();
    out.tip = [cx, cy - r * 2];
  };
  const spear = () => {
    if (P.spear === 'torch') { torch(); return; }
    if (P.spear === 'none' || !ARMS[P.spear]) return;
    const hd = handAt(0), lean = RS * 0.012;
    const b = [hd[0] - lean * 0.4, P.spear === 'carry' ? hd[1] - 0.42 : 0.012], t = [hd[0] + lean, hd[1] + 0.78];
    ctx.lineCap = 'round';
    strokeL(ctx, F, [b, t], S.ink, max(S.px * 1.2, h * 0.016) + S.lw, S);
    strokeL(ctx, F, [b, t], T.shaft, max(S.px, h * 0.011), S);
    paint(ctx, S, () => polyL(ctx, F, [[t[0] - 0.012, t[1]], [t[0] + 0.012, t[1]], [t[0] + lean * 0.3, t[1] + 0.075]]), { d: T.steel.d, b: T.steel.l, l: T.steel.h, h: T.steel.h }, 0, { lw: 0.8 });
    out.tip = F.w([t[0] + lean * 0.3, t[1] + 0.075]);
  };
  const body = () => {
    cloakBack();
    if (shieldOn && back) shield();
    for (const i of [0, 1]) if (armFwd(i) <= 0 || (shieldOn && !back)) arm(i);
    for (const i of legOrder) leg(i);
    garment();
    const fist = spearHeld;                         // the fist closes over the shaft
    if (back) { for (const i of [0, 1]) if (armFwd(i) > 0) arm(i); cloakOver(); head(); spear(); }
    else { if (shieldOn) shield(); head(); for (const i of [0, 1]) if (armFwd(i) > 0 && !shieldOn) arm(i); spear(); if (fist) arm(0, true); }
    if (cloakT && !back) {                          // the mantle's edge over each shoulder
      for (const s2 of [-1, 1]) paint(ctx, S, () => blobL(ctx, F, [tor(s2 * 0.03, 0.32), tor(s2 * 0.1, 0.31), tor(s2 * 0.118, 0.24), tor(s2 * 0.09, 0.27), tor(s2 * 0.05, 0.3)]), cloakT, 0.012);
    }
  };
  S.hb = { x0: o.x - h * 0.3, x1: o.x + h * 0.3, y0: o.y - h * 1.2, y1: o.y + h * 0.06 };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  castShadow(ctx, S, o);
  if ((S.lod === 2 || S.hero) && o.bold !== false) { S.sil = S.lod === 2 ? 2.8 : 2.4; body(); S.sil = 0; }
  body();
  ctx.restore();
  return out;
}

// ------------------------------------------------------------------ cast
const FRONT = { front: true, back: true };
const HOPLITE ={ cuirass: 'black', helm: 'black', crest: 1.15, chiton: 'red', pteruges: 'leather', greaves: 'bronze', sleeve: 'red', cloak: 'red', spear: true, shield: true, shieldTone: 'bronze' };

export function hoplite(ctx, e, o) {
  const cfg = { ...HOPLITE };
  if (o.armour === 'bronze') { cfg.cuirass = 'bronze'; cfg.helm = 'bronze'; }
  if (o.cloak === 'navy') { cfg.chiton = 'navy'; cfg.sleeve = 'navy'; }
  return (FRONT[o.view] ? drawFront : drawSide)(ctx, e, { cloak: 'red', ...o }, cfg);
}

export function odysseus(ctx, e, o) {
  const cfg = {
    cuirass: 'black', helm: 'black', crest: 1.25, chiton: 'navy', pteruges: 'black', greaves: 'black', sleeve: 'navy', bracer: 'black',
    cloak: 'navy', cloakLen: 1.18, spear: false, shield: false, sword: true, ornament: 1,
  };
  return (FRONT[o.view] ? drawFront : drawSide)(ctx, e, { cloak: 'navy', ...o }, cfg);
}

// o.hero: legible at 30-60 px (s08's general at the head of the army): a
// bright vermilion cloak, wider and longer, gleaming bronze even at night,
// a taller crest with a lit edge, a bronze shield and a bolder contour.
export function agamemnon(ctx, e, o) {
  const cfg = {
    cuirass: 'bronze', helm: 'bronze', crest: 1.55, chiton: 'red', pteruges: 'leather', greaves: 'bronze', sleeve: 'red',
    cloak: 'red', cloakLen: 1.1, spear: true, shield: true, shieldTone: 'black', device: 'red', ornament: 1,
  };
  if (o.hero) Object.assign(cfg, { crest: 2.1, crestEdge: true, cloakLen: 1.3, cloakW: 1.3, shieldTone: 'bronze', mass: true });
  return (FRONT[o.view] ? drawFront : drawSide)(ctx, e, { cloak: 'red', ...o }, cfg);
}

// Civilian in an ivory chiton. o.seed varies the cut: long dress / short
// tunic, hair, beard, an occasional red himation; o.guard gives bronze arms.
export function trojan(ctx, e, o) {
  const draw = FRONT[o.view] ? drawFront : drawSide;   // o.view 'front' | 'back': walking toward / away from the camera
  if (o.guard) {
    return draw(ctx, e, { cloak: 'none', ...o }, { cuirass: 'bronze', helm: 'bronze', crest: 0.8, chiton: 'linen', pteruges: 'leather', greaves: 'bronze', sleeve: 'linen', spear: true, shield: o.shield ?? false });
  }
  const r = hash((o.seed ?? 0) * 3.7 + 1.3);
  const female = o.female ?? r < 0.45;
  const old = o.old ?? (r > 0.85);
  const cfg = {
    civil: true, chiton: 'linen', sleeve: 'linen', barefoot: false, cloakLen: 0.95,
    longSkirt: female || old ? 'ankle' : 'knee', hair: old ? 'white' : 'hair', hairStyle: female ? 'bun' : 'short',
    beard: !female && (old || r > 0.65) ? (old ? 'white' : 'hair') : null, belt: 'leather',
  };
  const cloak = o.cloak ?? (hash((o.seed ?? 0) + 9.1) > 0.82 ? 'red' : 'none');
  return draw(ctx, e, { ...o, cloak }, cfg);
}

// Aeneas carries his father Anchises on his left shoulder (Bernini's group):
// red cloak, bronze helmet with a low crest and a walking spear; Anchises in
// white with a white beard. o.view: 'side' (default) | 'back' (Rückenfigur).
export function aeneas(ctx, e, o) {
  if (o.view === 'back') return aeneasBack(ctx, e, o);
  const pz = o.pose === 'walk' ? 'walk' : 'stand';
  const cfg = {
    cuirass: null, helm: 'bronze', crest: 0.55, chiton: 'red', pteruges: null, greaves: 'bronze', sleeve: 'red', belt: 'leather',
    cloak: 'red', cloakLen: 1.12, spear: true, shield: false, legScale: 0.85, lean: 0.05, beard: false,
    farArm: [0.35, 2.1], farHandFront: true, bold1: true,   // the group keeps its outer contour at small sizes
    // at small sizes the old man is drawn over his son's crest (it would cut
    // his white robe into scraps) but under the helmet; at medium size the
    // crest sweeps in front of him
    behind: (c, S, F, J, P) => { anchisesSide(c, S, F, J, P, 'shin'); if (S.lod >= 2) anchisesSide(c, S, F, J, P, 'body'); },
    afterCrest: (c, S, F, J, P) => { if (S.lod < 2) anchisesSide(c, S, F, J, P, 'body'); },
    over: (c, S, F, J, P) => anchisesSide(c, S, F, J, P, 'front'),
  };
  return drawSide(ctx, e, { cloak: 'red', ...o, pose: pz, spear: o.spear ?? (pz === 'walk' ? 'carry' : 'rest') }, cfg);
}

// Anchises seated on Aeneas' far shoulder, in Aeneas' torso frame: robe
// down Aeneas' back, body, far leg and head ('body', behind Aeneas' head),
// near shin over Aeneas' chest held by Aeneas' far hand ('front').
function anchisesSide(ctx, S, F, J, P, part) {
  const T = S.T;
  // At small sizes (lod 1, s11's walker) the old man is drawn 1.15x about
  // his seat with a 1.3x head, the face pushed forward so the white hair and
  // beard stand clear of his son's black crest.
  const small = S.lod < 2, ks = small ? 1.15 : 1, kh = small ? 1.3 : 1;
  const at = (u, v) => J.at(-0.03 + (small ? -0.025 : 0) + (u + 0.03) * ks, 0.33 + (v - 0.33) * ks);
  const bob = P.move ? 0.005 * sin(TAU * P.ph * 2 + 0.6) : 0;
  const sway = 0.005 * sin(S.wall * 1.3 + 0.7) + bob;
  // small: the knee sits lower, below the helmet's cheek guard, so the robed
  // thigh shows crossing his son's shoulder and the leg reads bent over it,
  // the shin hanging to the belt where his son's hand holds the knee
  const seat = at(-0.03, 0.33), knee = small ? at(0.12, 0.278 + bob) : at(0.125, 0.345 + bob), foot = small ? at(0.15 + sway, 0.095) : at(0.14 + sway, 0.14);
  const sh = at(-0.004 + sway, 0.585), hc = at(0.03 + (small ? 0.02 : 0) + sway * 1.3, 0.668);
  const up = (t) => ({ d: t.b, b: t.l, l: t.h, h: t.h, k: t.d });
  // At small sizes his three pale shapes - the hair fringe, the beard and the
  // himation over his son's chest and back - sat in one tone and merged into
  // a pale bundle (and into moonlit sand behind them). The beard and hair
  // keep the top ivory; the robe drops about a tone, so it reads a step
  // darker than the beard, and the beard carries a heavier ink contour, so
  // the two whites are separated by a line as well as by a tone.
  const dn = (t) => ({ d: t.k ?? t.d, b: mixHex(t.d, t.b, 0.56), l: t.b, h: t.l, k: t.k });
  const robeT = small ? dn(T.white) : T.white, hairT = small ? up(T.white) : T.white, face = small ? up(T.skin) : T.skin;
  const hairLW = small ? 2.2 : 1;
  if (part === 'shin') { // far shin, hanging
    paint(ctx, S, () => capL(ctx, F, [knee[0] - 0.012, knee[1] + 0.01], [foot[0] - 0.03, foot[1] + 0.01], 0.04, 0.03), T.skinF, 0.01);
  } else if (part === 'body') {
    // torso and thighs wrapped in the himation
    const robe = [[seat[0] - 0.068, seat[1] - 0.01], at(-0.078, 0.45), [sh[0] - 0.062, sh[1] - 0.025], [sh[0] - 0.036, sh[1] + 0.03], [sh[0] + 0.03, sh[1] + 0.03], [sh[0] + 0.064, sh[1] - 0.03], at(0.085, 0.43),
      [knee[0] + 0.034, knee[1] + 0.028], [knee[0] + 0.044, knee[1] - 0.032], [knee[0] - 0.01, knee[1] - 0.044], [seat[0] + 0.03, seat[1] - 0.04]];
    paint(ctx, S, () => blobL(ctx, F, robe), robeT, 0.036, {
      hatch: true,
      inner: (c) => {
        strokeL(c, F, [[sh[0] + 0.046, sh[1] - 0.01], [seat[0] + 0.035, seat[1] + 0.05], [knee[0] - 0.02, knee[1] - 0.03]], robeT.d, S.lw * 1.3);
        strokeL(c, F, [[sh[0] - 0.035, sh[1] - 0.02], [seat[0] - 0.045, seat[1] + 0.02]], robeT.d, S.lw);
      },
    });
    // near arm: forearm on the knees, hands holding the household gods
    const el = at(0.06, 0.47), hd = at(0.115, 0.43);
    paint(ctx, S, () => limbL(ctx, F, [[sh[0] + 0.02, sh[1] - 0.012], P2([sh[0] + 0.02, sh[1] - 0.012], el, 0.5), el], [[0.028, 0.028], [0.026, 0.025], [0.022, 0.022]]), robeT, 0.016);
    paint(ctx, S, () => capL(ctx, F, el, hd, 0.032, 0.026), T.skin, 0.008);
    paint(ctx, S, () => blobL(ctx, F, [[hd[0] - 0.006, hd[1] - 0.004], [hd[0] + 0.018, hd[1] - 0.004], [hd[0] + 0.02, hd[1] + 0.05], [hd[0] + 0.007, hd[1] + 0.066], [hd[0] - 0.008, hd[1] + 0.05]]), T.bronze, 0.006);
    // head: profile with a long white beard and white hair
    const H = (u, v) => [hc[0] + u * kh, hc[1] + v * kh];
    paint(ctx, S, () => capL(ctx, F, [sh[0] + 0.01, sh[1]], H(-0.004, -0.03), small ? 0.05 : 0.04, small ? 0.044 : 0.036), small ? face : T.skin, 0.008);
    // small: a sharper profile (brow, eye notch, a nose that juts a few
    // pixels past the blob's smoothing, the lip and chin) so it is a face
    // and not a ball
    const facePts = small ? [[0.0, 0.058], [0.034, 0.05], [0.05, 0.032], [0.058, 0.02], [0.05, 0.01], [0.058, 0.002], [0.08, -0.014], [0.08, -0.014], [0.058, -0.018], [0.058, -0.03], [0.048, -0.044], [0.02, -0.054], [-0.02, -0.044], [-0.042, -0.01], [-0.046, 0.024], [-0.028, 0.052]]
      : [[0.005, 0.056], [0.036, 0.048], [0.05, 0.026], [0.054, 0.008], [0.066, -0.006], [0.054, -0.014], [0.054, -0.026], [0.044, -0.04], [0.02, -0.05], [-0.02, -0.04], [-0.04, -0.01], [-0.044, 0.024], [-0.026, 0.05]];
    paint(ctx, S, () => blobL(ctx, F, facePts.map((p) => H(...p))), face, 0.01);
    // white hair: over the crown at medium size. Small (s11's 10 px head):
    // the crown is bald skin, the white hair a fringe round the back of the
    // head below it, and the beard hangs from the jaw and chin, so the
    // brow, eye, nose and cheek keep the face tone and the profile reads
    const hairPts = small ? [[-0.02, 0.018], [-0.046, 0.014], [-0.06, -0.006], [-0.054, -0.036], [-0.036, -0.05], [-0.026, -0.018]]
      : [[0.02, 0.054], [-0.012, 0.062], [-0.046, 0.046], [-0.058, 0.01], [-0.054, -0.036], [-0.034, -0.05], [-0.026, -0.016], [-0.006, 0.02], [0.022, 0.036]];
    paint(ctx, S, () => blobL(ctx, F, hairPts.map((p) => H(...p))), hairT, 0.014, { lw: hairLW });
    const beardPts = small ? [[0.05, -0.036], [0.064, -0.058], [0.058, -0.09], [0.044, -0.116], [0.028, -0.1], [0.006, -0.074], [-0.002, -0.058], [0.012, -0.05], [0.036, -0.044]]
      : [[0.054, -0.016], [0.06, -0.046], [0.048, -0.098], [0.022, -0.126], [0.002, -0.094], [-0.008, -0.048], [0.014, -0.032], [0.04, -0.022]];
    paint(ctx, S, () => blobL(ctx, F, beardPts.map((p) => H(...p))), hairT, 0.012, { lw: hairLW });
    if (!S.sil) strokeL(ctx, F, small ? [H(0.03, 0.014), H(0.05, 0.01)] : [H(0.034, 0.012), H(0.05, 0.008)], S.ink, S.lw * (small ? 1.5 : 1.2));   // the eye, at every size
  } else if (S.lod >= 1) {
    // the near shin hangs over Aeneas' chest, the robe draped over the knee
    // (thicker at small sizes so the legs over the shoulder still read)
    const k2 = [knee[0] + 0.012, knee[1] - 0.012], f2 = [foot[0] + 0.012, foot[1] - 0.006];
    const kr = 1, R = (u, v) => [knee[0] + u * kr, knee[1] + v * kr];
    // his skin is the old man's paler tone (the face's), not his son's
    paint(ctx, S, () => capL(ctx, F, k2, f2, small ? 0.05 : 0.042, small ? 0.04 : 0.032), face, 0.012);
    paint(ctx, S, () => blobL(ctx, F, [[f2[0] - 0.022, f2[1] + 0.012], [f2[0] + 0.05, f2[1] - 0.004], [f2[0] + 0.052, f2[1] - 0.028], [f2[0] - 0.022, f2[1] - 0.026]]), T.leather, 0);
    // the robe's hem falls over the top of the shin (a pale cuff), so the
    // leg reads robe-then-bare and stands apart from his son's dark forearm
    const c0 = P2(k2, f2, 0.42), cn = [-(f2[1] - k2[1]), f2[0] - k2[0]], cl0 = hypot(cn[0], cn[1]) || 1, cw2 = (small ? 0.034 : 0.028) / cl0;
    const cf = [c0[0] + cn[0] * cw2, c0[1] + cn[1] * cw2], cb = [c0[0] - cn[0] * cw2 * 1.1, c0[1] - cn[1] * cw2 * 1.1];   // hem, front and back of the shin
    paint(ctx, S, () => blobL(ctx, F, small
      ? [R(-0.062, -0.026), R(-0.058, 0.03), R(0.03, 0.036), R(0.056, 0.0), cf, cf, [c0[0] + 0.004, c0[1] - 0.014], cb, cb, R(-0.03, -0.04)]   // (its top clears his son's cheek guard)
      : [R(-0.08, -0.02), R(-0.07, 0.046), R(0.044, 0.042), R(0.058, -0.03), cf, cf, [c0[0] + 0.004, c0[1] - 0.014], cb, cb, R(-0.05, -0.05)]), robeT, 0.024);
  }
}

// Back view (s12): Aeneas stands or walks away from us in his red cloak, the
// spear upright in his right hand. Old Anchises sits on his left shoulder:
// the thigh hooked over it, the bare shin hanging at his son's side where
// his son's left hand holds it, his right hand on the helmet, and his head
// turned back toward burning Troy, so the white beard and the nose profile
// stand against the sky. At night the group is seen against the moon: broad
// shade, moonlit rims on the light side, and a faint fire rim on the old
// man's profile (o.fireRim: colour | false).
function rimFrom(ctx, build, sx, sy, k, col) { // crescent lit from a second source (sx, sy) inside a shape
  ctx.save(); ctx.beginPath(); build(); ctx.clip();
  ctx.beginPath(); build(); ctx.save(); ctx.translate(-sx * k, -sy * k); build(); ctx.restore();
  ctx.fillStyle = col; ctx.fill('evenodd'); ctx.restore();
}
function aeneasBack(ctx, e, o) {
  const S = style(e, o);
  if (S.lod === 0) return glyphOne(ctx, e, o, { cloak: 'red' });
  const T = S.T;
  const h = o.h, d = o.dir ?? 1;
  const F = { h, d, X: (u) => o.x + d * u * h, Y: (u, v) => o.y - v * h };
  F.w = (p) => [F.X(p[0], p[1]), F.Y(p[0], p[1])];
  const walk = o.pose === 'walk';
  const ph = o.phase || 0;
  const w = S.wall;
  const wind = (o.wind ?? 1) * (0.012 * sin(w * 1.3) + 0.007 * sin(w * 2.7 + 1.1));
  const bob = walk ? 0.012 * abs(cos(TAU * ph)) : 0;
  const B = (u, v) => [u, v + bob];
  const kb = o.backlit ? 1.45 : 1;               // broader shade when seen against the moon
  const fine = S.lod === 2;
  const ln = (c, pts, col, k = 1) => strokeL(c, F, pts, col, S.lw * k);
  const up = (t) => ({ d: t.b, b: t.l, l: t.h, h: t.h, k: t.d });   // one tone lighter: moonlit metal (day)
  // At night the group stands against the moon, its back in shadow: skin and
  // bronze drop two steps down their ramps and keep only a narrow band of
  // their own lit tone on the moon side (t.r; no white sticker rim). The
  // vermilion cloak and Anchises' white robe stay the bright accents, banded
  // in their own lighter tone.
  const nt = S.night;
  const dn = (t) => ({ d: t.k ?? t.d, b: t.d, l: t.b, h: t.l, k: t.k ?? t.d, r: t.b, hk: 0.26 });
  const skin = nt ? dn(T.skin) : T.skin;
  const metal = nt ? { ...T.bronze, r: '#8e92a2', hk: 0.22 } : up(T.bronze);
  const red = nt ? { ...T.red, r: T.red.h, hk: 0.2 } : T.red;
  const robeT = nt ? { ...T.white, r: T.white.h, hk: 0.26 } : T.white, snow = up(T.white);
  const fire = o.fireRim === false ? null : o.fireRim ?? (S.night ? C.red : null);
  const spx = 0.222;                              // the spear, in the right hand
  const sw = 0.004 * sin(w * 1.1 + 0.4);          // Anchises sways a little on his seat
  const A = (u, v) => B(u + sw * max(0, v - 0.84) * 3, v);
  const hc = B(0.012, 0.935);                     // Aeneas' head (helmet centre)
  const hc2 = A(-0.142, 1.158);                   // Anchises' head
  const body = () => {
    // spear shaft and blade (the fist closes over it later)
    const sb = B(spx, walk ? 0.06 : 0.01), stp = B(spx + 0.01, 1.42);
    ctx.lineCap = 'round';
    strokeL(ctx, F, [sb, stp], S.ink, max(S.px * 1.2, h * 0.016) + S.lw, S);
    strokeL(ctx, F, [sb, stp], T.shaft, max(S.px, h * 0.011), S);
    paint(ctx, S, () => polyL(ctx, F, [B(spx + 0.01, 1.4), B(spx + 0.027, 1.445), B(spx + 0.011, 1.535), B(spx - 0.005, 1.445)]), { d: T.steel.d, b: T.steel.l, l: T.steel.h, h: T.steel.h }, 0, { lw: 0.8 });
    // legs: thighs below the tunic, bronze greaves over the calves, sandal
    // heels; the left leg takes his father's weight, the right knee is easy
    for (const sd of [-1, 1]) {
      const easy = !walk && sd > 0;
      const lf = walk ? max(0, sin(TAU * (ph + (sd > 0 ? 0.5 : 0)))) * 0.07 : easy ? 0.014 : 0;
      const hip = B(sd * 0.053, 0.47), knee = B(walk ? sd * 0.05 : easy ? 0.046 : -0.046, 0.272 + lf * 0.45), ank = B(walk ? sd * 0.056 : easy ? 0.07 : -0.04, 0.072 + lf);
      const K = (t) => P2(knee, ank, t);
      paint(ctx, S, () => limbL(ctx, F, [hip, P2(hip, knee, 0.55), knee, K(0.3), K(0.72), ank], [[0.047, 0.047], [0.04, 0.04], [0.031, 0.031], [0.036, 0.036], [0.025, 0.025], [0.019, 0.019]]), skin, 0.014 * kb);
      paint(ctx, S, () => limbL(ctx, F, [K(-0.07), K(0.28), K(0.7), K(0.98)], [[0.034, 0.034], [0.04, 0.04], [0.027, 0.027], [0.021, 0.021]]), metal, 0.022 * kb, {
        inner: fine ? (c) => { ln(c, [K(0.06), K(0.9)], metal.d, 0.9); spiral(c, F, K(0.15), 0.003, 0.0011, 11, metal.h, S.lw * 0.7); } : null,
      });
      const [hx, hy] = ank;                          // heel cup, strap and sole
      paint(ctx, S, () => blobL(ctx, F, [[hx - 0.02, hy + 0.01], [hx + 0.02, hy + 0.01], [hx + 0.025, hy - 0.048], [hx, hy - 0.058], [hx - 0.025, hy - 0.048]]), skin, 0.008 * kb);
      paint(ctx, S, () => polyL(ctx, F, [[hx - 0.024, hy - 0.05], [hx + 0.024, hy - 0.05], [hx + 0.021, hy - 0.068], [hx - 0.021, hy - 0.068]]), T.leather, 0, { lw: 0.8 });
      if (fine) ln(ctx, [[hx - 0.021, hy - 0.014], [hx + 0.021, hy - 0.014]], T.leather.l, 1.6);
    }
    // the dark red tunic hem under the cloak
    const tun = T.redF;
    paint(ctx, S, () => blobL(ctx, F, [B(-0.104, 0.54), B(-0.108, 0.41), B(-0.06, 0.383), B(0, 0.377), B(0.06, 0.383), B(0.108, 0.41), B(0.104, 0.54)]), tun, 0.024 * kb, {
      inner: fine ? (c) => { for (let i = -2; i <= 2; i++) ln(c, [B(i * 0.032, 0.5), B(i * 0.038, 0.386)], tun.d, 0.9); } : null,
    });
    // Anchises' bare shin hangs at his son's left side, the sandalled foot
    // dangling toward the city he looks back at; his son's hand holds it
    const aK = B(-0.216, 0.862), aA = B(-0.207, 0.706);   // the knee end is hidden in the robe
    paint(ctx, S, () => limbL(ctx, F, [aK, P2(aK, aA, 0.3), P2(aK, aA, 0.62), aA], [[0.021, 0.021], [0.022, 0.024], [0.017, 0.018], [0.013, 0.013]]), skin, 0.012 * kb);
    const foot = [[aA[0] + 0.02, aA[1] + 0.012], [aA[0] + 0.022, aA[1] - 0.02], [aA[0] + 0.006, aA[1] - 0.034], [aA[0] - 0.04, aA[1] - 0.04], [aA[0] - 0.054, aA[1] - 0.03], [aA[0] - 0.05, aA[1] - 0.018], [aA[0] - 0.014, aA[1] - 0.006], [aA[0] - 0.016, aA[1] + 0.014]];
    paint(ctx, S, () => blobL(ctx, F, foot), skin, 0.008 * kb);
    paint(ctx, S, () => polyL(ctx, F, [[aA[0] + 0.02, aA[1] - 0.024], [aA[0] + 0.006, aA[1] - 0.04], [aA[0] - 0.05, aA[1] - 0.042], [aA[0] - 0.054, aA[1] - 0.032], [aA[0] + 0.004, aA[1] - 0.03]]), T.leather, 0, { lw: 0.8 });
    if (fine) ln(ctx, [[aA[0] - 0.012, aA[1] - 0.004], [aA[0] - 0.028, aA[1] - 0.032]], T.leather.b, 1.4);
    const eL = B(-0.126, 0.652), hL = B(-0.198, 0.77);
    paint(ctx, S, () => limbL(ctx, F, [eL, P2(eL, hL, 0.5), hL], [[0.024, 0.024], [0.022, 0.022], [0.018, 0.018]]), nt ? skin : T.skinF, 0.012 * kb);
    paint(ctx, S, () => blobL(ctx, F, [[hL[0] - 0.03, hL[1] + 0.012], [hL[0] + 0.012, hL[1] + 0.02], [hL[0] + 0.022, hL[1] - 0.002], [hL[0] + 0.01, hL[1] - 0.022], [hL[0] - 0.028, hL[1] - 0.016]]), skin, 0.006);
    // right forearm angled down from under the cloak to the fist on the shaft
    // (drawn before the cloak, so the elbow end stays hidden under it)
    const eR = B(0.104, 0.676), hR = B(spx - 0.004, 0.59);
    paint(ctx, S, () => limbL(ctx, F, [eR, P2(eR, hR, 0.5), hR], [[0.026, 0.026], [0.023, 0.023], [0.02, 0.02]]), skin, 0.012 * kb);
    if (S.lod) paint(ctx, S, () => limbL(ctx, F, [P2(eR, hR, 0.42), P2(eR, hR, 0.68), P2(eR, hR, 0.93)], [[0.026, 0.026], [0.025, 0.025], [0.022, 0.022]]), T.leather, 0.01 * kb, {
      inner: fine ? (c) => {
        const L = hypot(hR[0] - eR[0], hR[1] - eR[1]) || 1, nx = -(hR[1] - eR[1]) / L * 0.026, ny = (hR[0] - eR[0]) / L * 0.026;
        for (const k of [0.55, 0.8]) { const m = P2(eR, hR, k); ln(c, [[m[0] - nx, m[1] - ny], [m[0] + nx, m[1] + ny]], T.leather.l, 1.2); }
      } : null,
    });                                               // a leather bracer
    // the red cloak: pinned at the shoulders, falling over the shoulder
    // blades and flaring a little to an uneven hem (higher on the spear side);
    // a few long folds, fewer at small sizes; open at the back so a slice of
    // the shadowed lining shows
    const hemY = 0.415, top = 0.835, halfT = 0.1, halfB = 0.146, nh = 12;
    const hemPts = [];
    for (let i = 0; i <= nh; i++) {
      const k = i / nh;
      hemPts.push(B(lerp(-halfB, halfB, k) + wind * (0.45 + k * 0.55), hemY + (i % 2 ? 0.008 : -0.003) + 0.005 * sin(w * 2 + i * 1.7) - 0.024 * sin(k * PI) + 0.014 * (k - 0.5)));
    }
    const cloak = [B(-0.05, top + 0.046), B(-0.104, top + 0.024), B(-0.12, top - 0.04), B(-0.128 + wind * 0.15, 0.71), B(-0.14 + wind * 0.2, 0.62), B(-0.145 + wind * 0.4, 0.52), B(-halfB + wind, hemY + 0.05), ...hemPts,
      B(halfB + wind, hemY + 0.05), B(0.141 + wind * 0.4, 0.53), B(0.138 + wind * 0.2, 0.63), B(0.125, 0.71), B(0.117, top - 0.04), B(0.104, top + 0.024), B(0.054, top + 0.046), B(0, top + 0.054)];
    const fk = fine ? [0.07, 0.22, 0.37, 0.53, 0.69, 0.86] : [0.13, 0.4, 0.72];   // folds, unevenly spaced
    const f0 = fine ? [0, 0.05, 0.12, 0, 0.07, 0.02] : [0.03, 0.1, 0.05];         // some start lower on the back
    paint(ctx, S, () => blobL(ctx, F, cloak), red, 0.05 * kb, {
      hatch: true,
      inner: (c) => {
        fk.forEach((fx, i) => {
          const a = B(lerp(-halfT, halfT, fx), top - 0.02 - f0[i]), b = hemPts[Math.round(fx * nh)];
          const m = P2(a, b, 0.6);
          c.fillStyle = T.red.d;
          c.beginPath(); blobL(c, F, [a, [m[0] - 0.005, m[1]], [b[0] - 0.011, b[1] + 0.012], [b[0] + 0.011, b[1] + 0.012], [m[0] + 0.006, m[1]]]); c.fill();
          if ((fx - 0.5) * S.ls * d > -0.05) { // lit ridges only on the moon side
            const a2 = [a[0] + 0.01, a[1] - 0.012], b2 = [b[0] + 0.014, b[1]];
            c.fillStyle = T.red.l;
            c.beginPath(); blobL(c, F, [a2, [b2[0] - 0.002, b2[1] + 0.05], [b2[0] + 0.006, b2[1] + 0.05]]); c.fill();
          }
        });
        const hm = hemPts[nh / 2];
        c.fillStyle = T.red.k || T.red.d;             // the open back
        c.beginPath(); blobL(c, F, [B(0.004, top - 0.04), B(-0.004, 0.62), [hm[0] - 0.006, hm[1] + 0.01], [hm[0] + 0.006, hm[1] + 0.01], B(0.012, 0.62)]); c.fill();
        if (fine) {
          c.strokeStyle = S.ink; c.lineWidth = S.lw * 0.9; c.beginPath();
          fk.forEach((fx, i) => {
            const a = B(lerp(-halfT, halfT, fx), top - 0.06 - f0[i]), b = hemPts[Math.round(fx * nh)];
            const m = P2(a, b, 0.25); c.moveTo(F.X(...m), F.Y(...m)); c.lineTo(F.X(b[0], b[1] + 0.014), F.Y(b[0], b[1] + 0.014));
          });
          c.stroke();
        }
      },
    });
    paint(ctx, S, () => blobL(ctx, F, [B(spx - 0.024, 0.572), B(spx + 0.019, 0.574), B(spx + 0.021, 0.61), B(spx - 0.024, 0.606)]), skin, 0.006);   // the fist on the shaft
    // Aeneas' head from behind: neck, the crest (a horsehair fan seen end-on
    // on a short holder, its tail down the back of the dome) and the bronze
    // helmet with its flared neck guard. Built in device coordinates so the
    // dome stays a true round cap at any size.
    paint(ctx, S, () => capL(ctx, F, B(0.012, 0.845), hc, 0.062, 0.06), skin, 0.01);
    const X0 = F.X(hc[0], hc[1]), Y0 = F.Y(hc[0], hc[1]);
    const rx = 0.076 * h, ry = 0.086 * h, L = S.ls;
    const cs = 0.005 * h * sin(w * 1.7), yb = Y0 - ry - 0.01 * h, yt = Y0 - ry - 0.135 * h, cb = 0.016 * h, ct = 0.052 * h;
    const fan = () => {
      ctx.moveTo(X0 - cb, yb);
      ctx.quadraticCurveTo(X0 - cb * 1.5 + cs * 0.3, yt + 0.06 * h, X0 - ct + cs, yt + 0.034 * h);
      ctx.quadraticCurveTo(X0 - ct * 0.7 + cs, yt - 0.008 * h, X0 + cs, yt - 0.012 * h);
      ctx.quadraticCurveTo(X0 + ct * 0.7 + cs, yt - 0.008 * h, X0 + ct + cs, yt + 0.034 * h);
      ctx.quadraticCurveTo(X0 + cb * 1.5 + cs * 0.3, yt + 0.06 * h, X0 + cb, yb);
      ctx.closePath();
    };
    paint(ctx, S, fan, T.hair, 0.016, {
      inner: S.lod ? (c) => {
        c.strokeStyle = S.night ? T.hair.h : T.hair.l; c.lineWidth = S.lw * (fine ? 0.8 : 1);
        c.beginPath();
        const n = fine ? 7 : 3;
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n - 0.5;
          c.moveTo(X0 + k * cb * 1.2, yb - 0.004 * h);
          c.quadraticCurveTo(X0 + k * ct * 0.9 + cs * 0.5, yt + 0.06 * h, X0 + k * ct * 1.7 + cs, yt + (0.006 + 0.03 * k * k * 4) * h);
        }
        c.stroke();
      } : null,
    });
    const helmT = metal;
    const gw = 0.096 * h, gh = 0.082 * h;
    paint(ctx, S, () => {              // dome + flared neck guard
      ctx.moveTo(X0 - rx, Y0);
      ctx.ellipse(X0, Y0, rx, ry, 0, PI, 0);
      ctx.lineTo(X0 + rx * 1.02, Y0 + gh * 0.2);
      ctx.quadraticCurveTo(X0 + gw, Y0 + gh * 0.55, X0 + gw * 0.62, Y0 + gh);
      ctx.quadraticCurveTo(X0, Y0 + gh * 1.12, X0 - gw * 0.62, Y0 + gh);
      ctx.quadraticCurveTo(X0 - gw, Y0 + gh * 0.55, X0 - rx * 1.02, Y0 + gh * 0.2);
      ctx.closePath();
    }, helmT, 0.03 * kb, {
      inner: fine ? (c) => {
        c.strokeStyle = T.bronze.h; c.lineWidth = S.lw * 1.7;
        c.beginPath(); c.moveTo(X0 - gw * 0.9, Y0 + gh * 0.5); c.quadraticCurveTo(X0, Y0 + gh * 0.96, X0 + gw * 0.9, Y0 + gh * 0.5); c.stroke();
        c.strokeStyle = T.bronze.d; c.lineWidth = S.lw * 1.2;
        c.beginPath(); c.moveTo(X0 - rx * 0.98, Y0 + gh * 0.08); c.lineTo(X0 + rx * 0.98, Y0 + gh * 0.08); c.stroke();
        c.fillStyle = helmT.l;                                    // moonlit flank of the dome
        c.beginPath(); c.moveTo(X0 + L * rx * 0.32, Y0 - ry * 0.9);
        c.quadraticCurveTo(X0 + L * rx * 0.92, Y0 - ry * 0.52, X0 + L * rx * 0.98, Y0 - ry * 0.02);
        c.lineTo(X0 + L * rx * 0.66, Y0 - ry * 0.06);
        c.quadraticCurveTo(X0 + L * rx * 0.6, Y0 - ry * 0.5, X0 + L * rx * 0.18, Y0 - ry * 0.82);
        c.closePath(); c.fill();
      } : null,
    });
    // the crest's tail falls down the back of the dome; a small holder
    paint(ctx, S, () => {
      ctx.moveTo(X0 - 0.009 * h, Y0 - ry * 0.98);
      ctx.quadraticCurveTo(X0 - 0.013 * h, Y0 - ry * 0.5, X0 - 0.016 * h + cs * 0.2, Y0 - 0.02 * h);
      for (let i = 1; i <= 4; i++) ctx.lineTo(X0 + (-0.016 + i * 0.008) * h + cs * 0.2, Y0 + (i % 2 ? -0.008 : -0.02) * h);
      ctx.quadraticCurveTo(X0 + 0.013 * h, Y0 - ry * 0.5, X0 + 0.009 * h, Y0 - ry * 0.98);
      ctx.closePath();
    }, T.hair, 0.008);
    paint(ctx, S, () => { ctx.rect(X0 - 0.009 * h, yb - 0.004 * h, 0.018 * h, Y0 - ry * 0.96 - yb + 0.004 * h); }, helmT, 0);
    // Anchises. His thigh comes forward over the shoulder (the robe covers
    // it to the knee), his hips sit on the shoulder, the hem falls a little
    // way down his son's back, and his hunched back turns with his head.
    const thigh = [A(-0.084, 0.852), A(-0.12, 0.89), A(-0.186, 0.902), A(-0.226, 0.892), A(-0.242, 0.866), A(-0.24, 0.826), A(-0.232, 0.806), A(-0.21, 0.8), A(-0.19, 0.812), A(-0.176, 0.826), A(-0.14, 0.826), A(-0.096, 0.832)];
    paint(ctx, S, () => blobL(ctx, F, thigh), robeT, 0.03 * kb, {
      inner: fine ? (c) => { ln(c, [A(-0.12, 0.852), A(-0.2, 0.862)], robeT.d, 1.1); ln(c, [A(-0.222, 0.872), A(-0.226, 0.812)], robeT.d, 1); } : null,
    });
    paint(ctx, S, () => blobL(ctx, F, [A(-0.058, 0.85), A(-0.068, 0.79), A(-0.086, 0.742), A(-0.104, 0.75), A(-0.12, 0.8), A(-0.13, 0.85)]), robeT, 0.03 * kb, {
      inner: fine ? (c) => { ln(c, [A(-0.07, 0.83), A(-0.088, 0.756)], robeT.d, 1.1); ln(c, [A(-0.102, 0.83), A(-0.104, 0.764)], robeT.d, 0.9); } : null,
    });
    const torso = [A(-0.06, 0.846), A(-0.056, 0.93), A(-0.062, 1.0), A(-0.072, 1.048), A(-0.1, 1.078), A(-0.136, 1.087), A(-0.166, 1.072), A(-0.183, 1.04), A(-0.181, 0.97), A(-0.173, 0.9), A(-0.165, 0.848), A(-0.112, 0.834)];
    paint(ctx, S, () => blobL(ctx, F, torso), robeT, 0.042 * kb, {
      hatch: true,
      inner: S.lod ? (c) => {
        ln(c, [A(-0.176, 1.03), A(-0.124, 0.95), A(-0.07, 0.872)], robeT.d, 1.4);   // the himation's diagonal swag
        ln(c, [A(-0.15, 1.066), A(-0.104, 0.99), A(-0.066, 0.95)], robeT.d, 1.1);
        if (fine) ln(c, [A(-0.168, 0.94), A(-0.14, 0.856)], robeT.d, 1);
      } : null,
    });
    // his left arm down his side, the elbow under the himation
    const s3 = A(-0.168, 1.046), e3 = A(-0.196, 0.952);
    paint(ctx, S, () => limbL(ctx, F, [s3, P2(s3, e3, 0.5), e3, A(-0.19, 0.918)], [[0.03, 0.03], [0.029, 0.029], [0.03, 0.03], [0.024, 0.024]]), robeT, 0.018 * kb);
    // his right arm reaches to the helmet, the hand on the dome
    const s2 = A(-0.072, 1.032), e2 = A(-0.056, 0.98), h2 = A(-0.028, 0.988);
    paint(ctx, S, () => limbL(ctx, F, [s2, P2(s2, e2, 0.5), e2], [[0.027, 0.027], [0.025, 0.025], [0.022, 0.022]]), robeT, 0.016 * kb);
    paint(ctx, S, () => limbL(ctx, F, [e2, P2(e2, h2, 0.5), h2], [[0.019, 0.019], [0.018, 0.018], [0.016, 0.016]]), T.skin, 0.01 * kb);
    paint(ctx, S, () => blobL(ctx, F, [[h2[0] - 0.008, h2[1] + 0.016], [h2[0] + 0.024, h2[1] + 0.012], [h2[0] + 0.03, h2[1] - 0.006], [h2[0] + 0.012, h2[1] - 0.02], [h2[0] - 0.008, h2[1] - 0.012]]), T.skin, 0.006);
    // neck, then the head turned back toward Troy: a bald crown, white hair
    // at the back, the nose profile and a long white beard against the sky
    const Hd = (a, b) => [hc2[0] - a, hc2[1] + b];  // +a toward his face (to our left)
    paint(ctx, S, () => capL(ctx, F, A(-0.13, 1.05), Hd(-0.006, -0.03), 0.042, 0.038), T.skin, 0.01 * kb);
    const face = [[0.0, 0.058], [0.03, 0.052], [0.046, 0.036], [0.052, 0.016], [0.05, 0.006], [0.058, -0.008], [0.07, -0.026], [0.07, -0.026], [0.056, -0.032], [0.05, -0.04], [0.036, -0.054], [0.0, -0.052], [-0.03, -0.036], [-0.05, 0.0], [-0.04, 0.038]].map((q) => Hd(...q));
    const faceB = () => blobL(ctx, F, face);
    paint(ctx, S, faceB, T.skin, 0.01);
    const hair = [[0.018, 0.05], [-0.01, 0.06], [-0.04, 0.05], [-0.06, 0.024], [-0.064, -0.008], [-0.056, -0.042], [-0.038, -0.066], [-0.022, -0.05], [-0.014, -0.016], [-0.002, 0.016], [0.012, 0.03]].map((q) => Hd(...q));
    paint(ctx, S, () => blobL(ctx, F, hair), snow, 0.018 * kb, {
      inner: fine ? (c) => { for (let i = 0; i < 3; i++) ln(c, [Hd(-0.012 - i * 0.014, 0.04 - i * 0.006), Hd(-0.03 - i * 0.012, -0.04 + i * 0.01)], snow.d, 0.8); } : null,
    });
    paint(ctx, S, () => blobL(ctx, F, [[0.006, 0.006], [-0.012, 0.012], [-0.018, -0.006], [-0.006, -0.02], [0.006, -0.012]].map((q) => Hd(...q))), T.skin, 0);   // ear
    const beard = [[0.058, -0.03], [0.066, -0.058], [0.06, -0.096], [0.044, -0.136], [0.036, -0.142], [0.036, -0.142], [0.022, -0.112], [0.006, -0.078], [-0.01, -0.044], [-0.012, -0.02], [0.006, -0.024], [0.03, -0.034], [0.048, -0.028]].map((q) => Hd(...q));
    paint(ctx, S, () => blobL(ctx, F, beard), snow, 0.016 * kb, {
      inner: fine ? (c) => { for (let i = 0; i < 3; i++) ln(c, [Hd(0.05 - i * 0.016, -0.04), Hd(0.042 - i * 0.012, -0.11 + i * 0.02)], snow.d, 0.8); } : null,
    });
    if (!S.sil) {
      if (fine) {
        ln(ctx, [Hd(0.03, 0.016), Hd(0.05, 0.02)], snow.h, 1.6);      // white brow
        ln(ctx, [Hd(0.036, 0.004), Hd(0.047, 0.003)], S.ink, 1.3);    // eye
      }
      if (fire && S.lod) { // firelight from the burning city on the profile
        const k = max(S.px * 1.5, 0.0045 * h);
        rimFrom(ctx, faceB, -d, 0.15, k, fire);
        rimFrom(ctx, () => blobL(ctx, F, beard), -d, 0.15, k * 0.8, fire);
      }
    }
  };
  const anchors = () => ({
    hands: [F.w(B(spx - 0.004, 0.59)), F.w(B(-0.198, 0.77))],
    head: F.w(hc), anchises: F.w(hc2), top: F.Y(0, hc2[1] + 0.062), tip: F.w(B(spx + 0.011, 1.535)),
    feet: [[o.x + d * 0.06 * h, o.y], [o.x - d * 0.045 * h, o.y]],
  });
  if (o.measure) return anchors();
  S.hb = { x0: o.x - h * 0.45, x1: o.x + h * 0.45, y0: o.y - h * 1.6, y1: o.y + h * 0.02 };
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  castShadow(ctx, S, o);
  if (fine && o.bold !== false) { S.sil = 1.8; body(); S.sil = 0; }   // outer contour ~1.2 lw outside: architecture weight
  body();
  ctx.restore();
  return anchors();
}

// ------------------------------------------------------------------ crowd
// Fast LOD for tiny figures (plates 2 and 5: the dot-army). Each glyph
// (kind, facing, walk frame) is drawn once per device-pixel size into an
// atlas, so a member costs one drawImage. Members taller than ~56 device px
// fall back to vector glyphs; below 3 px they are single dots.
//   members: [{ x, y, h, dir, phase (omit to stand still), kind, seed, sh }]
//   sh: optional vertical shear about the feet (y += sh * (x - m.x)), the
//   path's screen slope for a profile walking along a diagonal (s08), so the
//   stance foot holds in y as well as in x
//   kind: 'greek' (blue cloak) | 'greekRed' | 'trojan' | 'torch' | 'trojanGuard'
//   (an armed Trojan: bronze cuirass and helmet without a black crest, an
//   ivory cloak, a bronze shield and a spear; s11's survivors)
//   o: { shadow: true | { len, side }, night }
// Members draw in array order: sort far-to-near for depth. Greek shields
// are moonlit steel. warmCrowd() pre-builds the atlas (see below).
const KIND = { greek: 0, greekRed: 1, trojan: 2, torch: 3, trojanGuard: 4 };
const FROW = 5;                                    // the atlas row of the torch flames
const NPH = 8;
// One atlas per (night, size bucket). A shot's push-in touches 20 or so
// buckets, and two neighbouring shots share them, so the atlases are not
// owned by a shot (e.cache) but by the kit - and they are released a couple
// of seconds after their last use (trimAtlas, called from crowd() and
// warmCrowd()), so the crowds of shots that are gone do not sit in iOS
// Safari's canvas budget: 21 atlases (3.9 Mpx) were alive at the end card.
// A later crowd re-warms in 1-2 ms a frame (warmCrowd) or draws the cells it
// needs on demand (cellXY).
const ATLAS = new Map();
const WARMED = new Set();   // the warm-up keys warmCrowd() has already built
const ATLAS_AGE = 2000;     // ms unused before an atlas is dropped
const ATLAS_SWEEP = 400;    // ms between sweeps
let atSweep = 0;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);

function bucket(hp) { return hp < 16 ? max(3, Math.round(hp)) : hp < 32 ? Math.round(hp / 2) * 2 : Math.round(hp / 4) * 4; }

function atlasFor(night, b) {
  const key = (night ? 'n' : 'd') + b;
  let A = ATLAS.get(key);
  if (!A) {
    const cw = Math.ceil(b * 0.95) + 4, ch = Math.ceil(b * 1.55) + 4, cols = (NPH + 1) * 2, rows = FROW + 1;
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);   // (a worker has no DOM)
    cv.width = cols * cw; cv.height = rows * ch;
    A = { cv, g: cv.getContext('2d'), cw, ch, b, cols, night, done: new Uint8Array(cols * rows) };
    ATLAS.set(key, A);
  }
  A.use = nowMs();
  return A;
}
// Drop every atlas unused for `age` ms (0 = all of them) and free its
// canvas. Any warm-up key is forgotten with it, so the next warmCrowd()
// call rebuilds the cells it promised.
export function trimCrowdAtlas(age = 0) {
  const t = nowMs();
  let n = 0;
  for (const [k, A] of ATLAS) {
    if (t - A.use < age) continue;
    A.cv.width = 0; A.cv.height = 0;
    ATLAS.delete(k); n++;
  }
  if (n) WARMED.clear();
  return n;
}
function sweepAtlas() {
  const t = nowMs();
  if (t - atSweep < ATLAS_SWEEP) return;
  atSweep = t;
  trimCrowdAtlas(ATLAS_AGE);
}
function cellXY(A, row, col, draw) {
  const idx = row * A.cols + col;
  if (!A.done[idx]) {
    A.done[idx] = 1;
    const g = A.g;
    g.save(); g.beginPath(); g.rect(col * A.cw, row * A.ch, A.cw, A.ch); g.clip();
    draw(g, col * A.cw + A.cw / 2, row * A.ch + A.ch - 2);
    g.restore();
  }
  return idx;
}

// One crowd figure in vector form, feet at (x, y), height h, at scale px.
function glyphVec(g, T, x, y0, h, d, ph, kind, px) {
  const civ = kind === 2, torch = kind === 3, guard = kind === 4;
  const sw = ph == null ? 0 : sin(TAU * ph);
  const y = y0 - (ph == null ? 0 : (1 - abs(sw)) * 0.022 * h);
  const U = (u) => x + d * u * h, V = (v) => y - v * h;
  const quad = (pts, col) => { g.beginPath(); g.moveTo(U(pts[0][0]), V(pts[0][1])); for (let i = 1; i < pts.length; i++) g.lineTo(U(pts[i][0]), V(pts[i][1])); g.closePath(); g.fillStyle = col; g.fill(); };
  const ink = h > 22 * px;
  g.lineJoin = 'round';
  // legs: scissor
  for (const s of [-1, 1]) {
    const f = s * sw * 0.13, hx = s * 0.015;
    quad([[hx - 0.045, 0.52], [hx + 0.045, 0.52], [f + 0.035, 0.0], [f - 0.035, 0.0]], civ ? T.skin.d : guard ? (s > 0 ? T.bronze.b : T.bronze.d) : s > 0 ? T.black.l : T.black.b);
  }
  if (civ) { // chiton: shoulders, belted waist, a flared hem; arms at the sides
    const hem = ph == null ? 0.06 : 0.1, k = sw * 0.03;
    const dress = [[-0.082, 0.8], [0.084, 0.8], [0.08, 0.72], [0.062, 0.57], [0.076, 0.48], [0.118 + k, hem], [-0.118 + k, hem], [-0.076, 0.48], [-0.064, 0.57], [-0.08, 0.72]];
    quad(dress, T.linen.l);
    quad([[-0.082, 0.8], [-0.03, 0.8], [-0.026, 0.57], [-0.05 + k, hem], [-0.118 + k, hem], [-0.076, 0.48], [-0.064, 0.57], [-0.08, 0.72]], T.linen.d);
    quad([[-0.064, 0.582], [0.064, 0.582], [0.062, 0.552], [-0.062, 0.552]], T.linen.d);           // belt
    const a = sw * 0.05;                                                                             // the near arm swings
    quad([[0.05, 0.79], [0.092, 0.775], [0.1 + a, 0.52], [0.07 + a, 0.515]], T.linen.b);
    g.fillStyle = T.skin.b; g.beginPath(); g.ellipse(U(0.085 + a), V(0.5), h * 0.026, h * 0.03, 0, 0, TAU); g.fill();
    quad([[-0.024, 0.83], [0.03, 0.83], [0.026, 0.79], [-0.022, 0.79]], T.skin.d);                  // neck
    g.fillStyle = T.skin.b; g.beginPath(); g.ellipse(U(0.012), V(0.885), h * 0.062, h * 0.07, 0, 0, TAU); g.fill();
    g.fillStyle = T.hair.b; g.beginPath(); g.ellipse(U(-0.016), V(0.91), h * 0.06, h * 0.052, 0, 0, TAU); g.fill();
    if (ink) {
      g.strokeStyle = T.ink; g.lineWidth = px; g.beginPath();                                     // open at the shoulders
      g.moveTo(U(dress[0][0]), V(dress[0][1]));
      for (let i = dress.length - 1; i >= 1; i--) g.lineTo(U(dress[i][0]), V(dress[i][1]));
      g.stroke();
    }
    return;
  }
  // cloak trailing behind, cuirass, skirt
  const cl0 = kind === 1 ? T.red : guard ? { b: T.linen.l, d: T.linen.b } : T.blue;   // the guard's ivory cloak
  const brz = T.rim ? T.bronze.h : T.bronze.l;     // the guard's bronze, moonlit at night
  const tr = abs(sw) * 0.04;
  quad([[0.035, 0.86], [-0.085, 0.86], [-0.15 - tr, 0.42], [-0.165 - tr, 0.2], [-0.02, 0.24], [0.02, 0.52]], cl0.b);
  quad([[-0.04, 0.84], [-0.085, 0.86], [-0.15 - tr, 0.42], [-0.165 - tr, 0.2], [-0.1, 0.21]], cl0.d);
  quad([[-0.08, 0.53], [0.085, 0.53], [0.095, 0.4], [-0.09, 0.4]], guard ? T.linen.l : T.black.b);
  quad([[-0.07, 0.82], [0.06, 0.82], [0.085, 0.7], [0.07, 0.52], [-0.075, 0.52], [-0.08, 0.7]], guard ? brz : T.black.l);
  // below ~30 device px a trailing cloak is a sliver: the red cloak is
  // draped over the shoulders and back to the knee in the bright red, so a
  // red-cloaked column reads as plate 5's red dots, not as steel
  // (the blue cloaks likewise in cobalt, so the river reads red and blue)
  if ((kind <= 1 || guard) && h < 30 * px) quad([[-0.165 - tr, 0.3], [-0.13 - tr, 0.62], [-0.08, 0.86], [0.0, 0.89], [0.02, 0.8], [-0.02, 0.62], [-0.03, 0.32]], kind === 1 ? T.red.l : guard ? T.linen.l : T.blue.l);
  // helmet and crest (the Trojan guard's bronze helmet has none)
  g.fillStyle = guard ? brz : T.steel.l; g.beginPath(); g.ellipse(U(0.012), V(0.905), h * 0.074, h * 0.08, 0, 0, TAU); g.fill();
  if (!guard) {
    g.fillStyle = T.hair.b; g.beginPath();
    g.moveTo(U(0.045), V(0.97)); g.quadraticCurveTo(U(-0.01), V(1.1), U(-0.15), V(0.97));
    g.lineTo(U(-0.11), V(0.95)); g.quadraticCurveTo(U(-0.04), V(1.02), U(0.0), V(0.965)); g.closePath(); g.fill();
  }
  if (torch) { // raised torch arm
    g.strokeStyle = T.black.l; g.lineWidth = max(px, h * 0.05); g.lineCap = 'round';
    g.beginPath(); g.moveTo(U(0.02), V(0.78)); g.lineTo(U(0.13), V(0.86)); g.stroke();
    g.strokeStyle = T.ink; g.lineWidth = max(px, h * 0.03);
    g.beginPath(); g.moveTo(U(0.12), V(0.8)); g.lineTo(U(0.17), V(1.02)); g.stroke();
  } else {
    // shield on the far arm, spear in the near hand
    g.fillStyle = guard ? (T.rim ? T.bronze.l : T.bronze.b) : kind === 1 ? T.steel.b : T.steel.l; g.beginPath(); g.ellipse(U(0.11), V(0.63), h * 0.105, h * 0.2, 0, 0, TAU); g.fill();
    g.strokeStyle = guard ? T.bronze.d : T.steel.d; g.lineWidth = max(px * 0.8, h * 0.025); g.stroke();
    g.strokeStyle = T.ink; g.lineWidth = max(px, h * 0.024); g.lineCap = 'butt';
    g.beginPath(); g.moveTo(U(0.19), V(0.08)); g.lineTo(U(0.19), V(1.3)); g.stroke();
    g.fillStyle = T.steel.h; g.beginPath(); g.moveTo(U(0.19), V(1.42)); g.lineTo(U(0.205), V(1.3)); g.lineTo(U(0.175), V(1.3)); g.closePath(); g.fill();
  }
  if (ink) {
    g.strokeStyle = T.ink; g.lineWidth = px;
    g.beginPath(); g.moveTo(U(0.035), V(0.86)); g.lineTo(U(-0.085), V(0.86)); g.lineTo(U(-0.15 - tr), V(0.42)); g.lineTo(U(-0.165 - tr), V(0.2)); g.lineTo(U(-0.02), V(0.24)); g.stroke();
  }
}

// Atlas cells: a glyph for kind / facing / walk frame (f = NPH: standing),
// and the four torch-flame variants in row 4. Drawn once, on first use.
function glyphCell(A, T, kind, d, f) {
  const col = (d < 0 ? NPH + 1 : 0) + f;
  cellXY(A, kind, col, (g, x, y) => glyphVec(g, T, x, y, A.b, d, f === NPH ? null : f / NPH, kind, 1));
  return col;
}
function flameCell(A, T, v) { cellXY(A, FROW, v, (g, x, y) => flameGlyph(g, T, x, y - A.ch * 0.25, A.b, v)); }

// Pre-build crowd glyphs so the frame where a crowd first appears (or grows
// during a push-in) does not spike. Call it every frame, from the crowd's
// own actor (so e.s matches) before any early return, starting a few frames
// before the crowd shows: each call draws atlas cells for at most o.budget
// ms and returns true once everything asked for is ready (then it costs
// ~0.01 ms). Pass o.ctx (the actor's ctx) so the last call also uploads the
// atlas textures (a transparent 1-px draw each); without it the first frame
// that uses a fresh atlas still pays ~1 ms for the upload.
//   o: { h: [min, max]  member heights in world units at this actor's depth (uses e.s),
//        px: [min, max] or member heights in device px instead of h,
//        zoom: 1        extra scale the camera will reach (a push-in from w1600 to w1380: 1.16),
//        kinds: ['greek', 'greekRed', 'torch'], dirs: [1, -1],
//        walk: true (the 8 walk frames), stand: true (the standing frame),
//        night: e.night, budget: 2 (ms per call), ctx }
// Sizes outside 3-56 device px need no atlas (dots / vector glyphs).
export function warmCrowd(e, o = {}) {
  const night = o.night ?? !!e.night;
  const T = night ? NIGHT : DAY;
  const s = e.s ?? 1;
  let [lo, hi] = o.px ?? (o.h ?? [10, 40]).map((v) => v * s);
  hi *= o.zoom ?? 1;
  lo = max(3, lo); hi = min(56, hi);
  if (!(hi >= lo)) return true;
  const kinds = (o.kinds ?? ['greek', 'greekRed', 'torch']).map((k) => KIND[k] ?? 0);
  const dirs = (o.dirs ?? [1, -1]).map((v) => (v < 0 ? -1 : 1));
  const frames = [];
  if (o.walk !== false) for (let f = 0; f < NPH; f++) frames.push(f);
  if (o.stand !== false) frames.push(NPH);
  const key = `${night ? 'n' : 'd'}${bucket(lo)}-${bucket(hi)}:${kinds.join('')}:${dirs.join('')}:${frames.length}`;
  if (WARMED.has(key)) return true;
  const t0 = performance.now(), budget = o.budget ?? 2;
  const bs = new Set();
  for (let p = lo; p < hi + 0.5; p += 0.5) bs.add(bucket(min(p, hi)));
  for (const b of bs) {
    const A = atlasFor(night, b);
    for (const kind of kinds) {
      for (const d of dirs) {
        for (const f of frames) {
          if (A.done[kind * A.cols + (d < 0 ? NPH + 1 : 0) + f]) continue;
          glyphCell(A, T, kind, d, f);
          if (performance.now() - t0 > budget) return false;
        }
      }
      if (kind === 3) for (let v = 0; v < 4; v++) if (!A.done[FROW * A.cols + v]) { flameCell(A, T, v); if (performance.now() - t0 > budget) return false; }
    }
  }
  if (o.ctx) { // draw a transparent corner of each atlas once so its texture is uploaded now
    const g = o.ctx;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    for (const b of bs) { const A = atlasFor(night, b); g.drawImage(A.cv, 0, 0, 1, 1, 0, 0, 1, 1); }
    g.restore();
  }
  WARMED.add(key);
  sweepAtlas();
  return true;
}
// Atlas contents, for perf checks: { buckets: ['n12', ...], cells, mpx }.
export function crowdAtlasInfo() {
  let cells = 0, px = 0;
  for (const A of ATLAS.values()) { for (const v of A.done) cells += v; px += A.cv.width * A.cv.height; }
  return { buckets: [...ATLAS.keys()], cells, mpx: +(px / 1e6).toFixed(2) };
}

function flameGlyph(g, T, x, y, h, v) {
  const f = 0.8 + 0.12 * v;
  g.fillStyle = T.flame[0]; g.beginPath(); flameShape(g, x, y, h * 0.065, h * 0.19 * f, (v % 2 ? 0.3 : -0.3)); g.fill();
  g.fillStyle = T.flame[2]; g.beginPath(); flameShape(g, x, y - h * 0.01, h * 0.032, h * 0.1 * f, 0); g.fill();
}

export function crowd(ctx, e, members, o = {}) {
  if (!members || !members.length) return;
  const night = o.night ?? !!e.night;
  const T = night ? NIGHT : DAY;
  const s = e.s, px = 1 / s;
  const q = e.reduced ? 0 : floor((e.t ?? 0) * 12);
  const dots = new Path2D(), shad = o.shadow ? new Path2D() : null;
  let nd = 0;
  const sl = o.shadow?.len ?? 0.16, sside = o.shadow?.side ?? (night ? -1 : 1);
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const h = m.h, d = (m.dir ?? 1) < 0 ? -1 : 1;
    const kind = KIND[m.kind] ?? 0;
    const hp = h * s;
    if (shad) { const w = h * (sl + 0.12); shad.rect(sside > 0 ? m.x - h * 0.12 : m.x - w + h * 0.12, m.y - h * 0.018, w, h * 0.03); }
    if (hp < 3) { dots.rect(m.x - px * 0.6, m.y - h, px * 1.2, h); nd++; continue; }
    const f = m.phase == null ? NPH : floor((((m.phase % 1) + 1) % 1) * NPH) % NPH;
    if (hp > 56) {
      if (m.sh) { ctx.save(); ctx.transform(1, m.sh, 0, 1, 0, -m.sh * m.x); }
      glyphVec(ctx, T, m.x, m.y, h, d, m.phase == null ? null : f / NPH, kind, px);
      if (kind === 3) flameGlyph(ctx, T, m.x + d * 0.17 * h, m.y - 1.02 * h, h, floor(hash(q * 0.37 + i) * 4));
      if (m.sh) ctx.restore();
      continue;
    }
    const b = bucket(hp);
    const A = atlasFor(night, b);
    const col = glyphCell(A, T, kind, d, f);
    const k = h / b;
    if (m.sh) { ctx.save(); ctx.transform(1, m.sh, 0, 1, 0, -m.sh * m.x); }   // vertical shear about the feet
    ctx.drawImage(A.cv, col * A.cw, kind * A.ch, A.cw, A.ch, m.x - (A.cw / 2) * k, m.y - (A.ch - 2) * k, A.cw * k, A.ch * k);
    if (kind === 3) {
      const v = floor(hash(q * 0.37 + i) * 4);
      flameCell(A, T, v);
      ctx.drawImage(A.cv, v * A.cw, FROW * A.ch, A.cw, A.ch, m.x + d * 0.17 * h - (A.cw / 2) * k, m.y - 1.02 * h - (A.ch - 2 - A.ch * 0.25) * k, A.cw * k, A.ch * k);
    }
    if (m.sh) ctx.restore();
  }
  if (shad) { ctx.fillStyle = T.shadow; ctx.fill(shad); }
  if (nd) { ctx.fillStyle = night ? T.blue.l : T.blue.b; ctx.fill(dots); }
  sweepAtlas();   // (after drawing, so the atlases this frame used keep their stamp)
}

function glyphOne(ctx, e, o, cfg) {
  const kind = cfg.civil ? 'trojan' : o.torch ? 'torch' : (o.cloak ?? cfg.cloak) === 'navy' ? 'greek' : 'greekRed';
  if (!o.measure) crowd(ctx, e, [{ x: o.x, y: o.y, h: o.h, dir: o.dir, phase: /walk|run|flee|creep|sneak|haul/.test(o.pose || '') ? o.phase : undefined, kind, seed: o.seed }], { shadow: o.shadow ? {} : null });
  return { hands: [[o.x + (o.dir ?? 1) * o.h * 0.15, o.y - o.h * 0.6], [o.x, o.y - o.h * 0.6]], head: [o.x, o.y - o.h * 0.91], top: o.y - o.h * 1.05, tip: null, feet: [[o.x, o.y], [o.x, o.y]] };
}
