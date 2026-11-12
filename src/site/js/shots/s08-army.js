// VIII · TROY BURNS: the army enters. The cut lands on the drop (35.87):
// the Scaean gate stands open and the fires near the gate road flare in one
// red burst. High over the city, the main street runs diagonally from the
// colossal gate (12.5 men tall, its inner face as in s07: moonlit ivory, a
// black relieving triangle, red festoons, the leaves swung in) toward us; a
// river of tiny red- and blue-cloaked Greeks pours through it and down the
// street, led by Agamemnon in vermilion with a torch. Beyond the wall their
// torches stream up from the ships on the moonlit beach (plate 5's red
// dots); the moon stands just right of the gate. More roofs catch fire on
// the beats and navy-black smoke rises over the city.

import { sky, moon, streaks, sea, cumulus } from '../kit/nature.js';
import { streetLayout, paintStreet, paintPassage, streetWindows, scarQuad, roofFire, boxFaces, boxPlanes, streetTone, PARAPET } from '../kit/city.js';
import { flames, smoke, embers, glow } from '../kit/fx.js';
import { crowd, agamemnon, warmCrowd } from '../kit/figures.js';
import { galley } from '../kit/fleet.js';
import { C } from '../kit/palette.js';
import { L } from '../engine/bake.js';
import { RNG, clamp, lerp, ease } from '../engine/rng.js';
import { beatsIn } from '../story.js';

const DUR = 4.49;
// the houses nearer than this (camera depth, m) lie in the smoke's shadow: a navy foreground
// that frames the moonlit street (standard 19), small enough that the bottom of the frame keeps
// moonlit roofs among the navy ones (standard 24)
const DIM_ZC = 140;   // TUNE.dimZc overrides it in the test plate
// knobs for the C4 test plate (tests/C4-s08.js) to A/B costs and shapes (pools: 'none' = no firelight,
// ships: false = no galleys, cache: false = every actor draws every frame, dots: the css-px height under
// which a member of the army is drawn as a dot, 0 = never); the film uses the defaults. Smoke: C2's
// massed plumes, tall and leaning (sh 6.2 of the fire's width, 10 puffs of 3 big lobes each, so a
// column is 2.3-5.4 times as tall as it is wide and reads as rising smoke, not a bush on the roof).
// Flames: fw is the flame's width as a fraction of the roof's burning width and fh / fhBig its height
// as a multiple of that width, so a fire is a tall mass of licking tongues (round 5's were as wide as
// they were tall and printed as eight near-identical cones). The firelight pools, the smoke and the
// embers keep round 5's size: they are measured from w0, the width round 5 drew.
export const TUNE = { pools: 'warm', smoke: true, ships: true, fw: 0.3, fh: 3.0, fhBig: 3.7, sw: 1.4, sh: 6.2, grow: 1.4, count: 10, group: 3, lit: 0.5, cache: true, dots: 9, dimZc: DIM_ZC,
  // the drop's hit: how much of C2's warm firelight filter the city is multiplied by, and the hue pass over its navy (see post())
  hitQ: 0.95, hitMode: 'color',
  // the moonlit plain's light: inside N.sand's hatch band and straddling its top threshold (see the far layer)
  plain: 0.83 };
// the hit's timing: three drawings on twos, the last faded toward white; and the reduced-motion bloom
const HIT = { dur: 0.25, fade: 0.92, redDur: 0.38, redA: 0.12 };

// The shot's geometry and timing (metres, m/s, world px); makeS08(over)
// merges overrides, so test plates can try cameras and gates.
export const S08 = {
  // high over the city, left of the main street and yawed toward it, so the
  // street (and the column, in right-facing profile) runs diagonally across
  // the frame; the moon lights the faces turned to us (the prints' cheat)
  // the moon at 55 degrees, as in the plaza and gate shots (standard 33: one night), keeping s08's azimuth
  cam: { x: -100, z: -185, H: 62, yaw: 0.58, f: 1500, hy: 100, moonAz: 2.14, moonEl: 0.96 },
  // The light on the stone (kit/city.js STREET_LIGHT; standards 31 and 38). The walls turned to
  // the moon print in the top tone (L 232), the copings, parapet lips and ridges stay there
  // through `arris`, and the two biggest horizontal fields - the terraces and the paving - drop
  // one band into the night ramp's new middle register (L 169, straddling L 137 and L 207 with
  // their per-house variation), which is what gives the moonlit town plate 4's mid-tones instead
  // of one even light grey.
  light: { wall: 1.41, roof: 0.7, street: 0.75, arris: 0.93 },
  // bigger houses (fewer, larger masses: rule 5) and two landmarks near us beside the palace: a stoa
  // along the street on the right (a long colonnade in shadow, its shafts moonlit) and a tower house
  // on the left (one tall moonlit wall, a navy-black side)
  frontLen: [9, 17], houseLen: [11, 23], trees: 0.1,
  // (the square in front of the tower house keeps its moonlit front whole, down to the paving)
  landmarks: [{ kind: 'stoa', x0: 13.5, x1: 25.5, z0: -122, z1: -68, h: 10 }, { kind: 'towerHouse', x0: -67, x1: -52, z0: -52, z1: -38, h: 30 }, { kind: 'square', x0: -76, x1: -47, z0: -78, z1: -53.5 }],
  street: 12,
  // the Scaean gate in GATE units of kit/temple.js (opening 470 = 23.4 m, 12.6 men); the
  // city wall beside the towers at s03's height, as s06 and s07 show it (GATE.stone.sideLow
  // 275 = 13.7 m, 0.58 passages; was sideH 520 = 25.9 m)
  gate: { w: 9, h: 23.4, wall: 13.7, curtain: 41.8, tower: 52.8, towerX: [13.4, 29.4], towerD: 3, wallD: 8 },
  shore: 330, moon: { x: 1000, y: 58, r: 12 },
  head0: -22, v: 5.5, lead: 9, hm: 1.85, colW: 8.5, stride: 0.62,
  temple: { x0: 44, x1: 70, z0: -78, z1: -40, h: 17, base: 4 },
  palace: { x0: 100, x1: 124, z0: -60, z1: -36, h: 19 },   // the second landmark, right of the temple
  // wide on the cut (the moon just right of the gate), then in with the river,
  // keeping the bay, the beach and the moon in frame to the end (the round-4
  // NICE: the disc is the film's night anchor, plates 4 and 5; sky and sea stay
  // >= 15.5% of the frame all shot, evidence/tmp/C4/r3/seashare.mjs).
  // Agamemnon ends above the caption band (feet <= 74% of the height).
  // Portrait: tight on the gate, the river and the king, the moon in frame.
  cam0: { x: 800, y: 450, w: 1600, h: 900 }, cam1: { x: 860, y: 442, w: 1420, h: 799 },
  camP0: { x: 780, y: 350, w: 530, h: 1147 }, camP1: { x: 850, y: 383, w: 470, h: 1017 },
};
const merge = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]; return o; };

// the beat grid inside the shot (story.js; local seconds): the drop is beat
// 64 at local 0, then 0.56, 1.12, 1.68, 2.245 (a downbeat), 2.81, 3.37, 3.93
const GRID = beatsIn('s08');
const BEATS = GRID.map((b) => b.t).filter((t) => t > 0.05);
const DOWN = GRID.filter((b) => b.down && b.t > 0.05).map((b) => b.t);

function routeOf(ctrl) { // Catmull-Rom through the control points, with arc lengths
  const pts = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const a = ctrl[Math.max(0, i - 1)], b = ctrl[i], c = ctrl[i + 1], d = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < 12; k++) {
      const u = k / 12, u2 = u * u, u3 = u2 * u;
      const f = (j) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * u + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * u2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * u3);
      pts.push([f(0), f(1)]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, S, len: S[S.length - 1] };
}

let scratch = null;

export function makeS08(over = {}) {
  const O = merge(S08, over);
  const Gt = O.gate;
  const LAY = streetLayout({ seed: 'troy-s08', street: O.street, gateW: Gt.w, gateH: Gt.h, wallH: Gt.wall, curtainH: Gt.curtain, towerH: Gt.tower, towerX: Gt.towerX, towerD: Gt.towerD, wallD: Gt.wallD, cam: O.cam, fireRate: 0.26, temple: O.temple, palace: O.palace, blocksR: 6, zEnd: 140, lowSide: -1, light: O.light, frontLen: O.frontLen, houseLen: O.houseLen, trees: O.trees, landmarks: O.landmarks });
  const CAM = LAY.cam, P = CAM.P, WD = LAY.WD, HM = O.hm, V = O.v;
  const LEFT = (b) => (b.kind === 'house' || b.kind === 'tree') && b.x0 + b.x1 < 0;     // houses between us and the street
  const SHORE = (x) => O.shore + 40 * Math.sin(x / 90) + 0.12 * x;
  // The routes from the ships to the gate share a trunk: from the gate out
  // across the plain they run along the camera's sightline through the
  // opening (x = -2.3 + 0.53 z: the middle of what the passage's far arch
  // and the near opening both show), so the river is seen pouring through
  // the gate, receding into the plain, until the lintel hides it (~110 m
  // out). Beyond, three files branch behind the curtain and the gate towers
  // and come out over the side walls to the ships drawn up on the beach,
  // left and right of the gate.
  const TRUNK = [[0, 0], [0, 4], [6, 16], [17, 38], [34, 70], [54, 106]];
  const ROUTES = [
    routeOf([...TRUNK, [110, 190], [200, 290], [300, SHORE(300) - 25], [335, SHORE(335) - 5]]),   // right: over the right wall
    routeOf([...TRUNK, [50, 150], [10, 215], [-20, SHORE(-20) - 10]]),                              // left: over the left wall
    routeOf([...TRUNK, [62, 200], [80, 300], [90, SHORE(90) - 10]]),                               // left of the gate towers
  ];
  const TRUNK_S = 118;          // arc length of the trunk (the stretch seen through the opening)
  // half width of the column: the river fills the street and the passage,
  // keeps to the width the opening shows out to the end of the trunk, then
  // narrows to a file two or three abreast
  const halfW = (s) => (s < 8 ? O.colW : s < 20 ? lerp(O.colW, 6, (s - 8) / 12) : s < TRUNK_S ? 6 : s < TRUNK_S + 25 ? lerp(6, 1.6, (s - TRUNK_S) / 25) : 1.6);

  // ---- planted feet. The figures are right-facing profiles; they hold
  // their feet if the gait phase follows their travel across the screen:
  // d(phase) = d(screen x) / (stride in screen px). For a figure walking
  // straight along -z at world x = X, that integrates exactly to
  // -(X - cam.x) * ln(zc) / (cos(yaw) * G * h), with G * h the stride.
  const gaitAt = (X, Z, G, h) => (-(X - CAM.x) * Math.log(Math.max(1, CAM.view(X, Z)[1]))) / (CAM.cs * G * h);
  const army = [];
  {
    const r = new RNG('s08-army');
    // the dense column: the street and the passage 10 abreast, rank on rank;
    // out in the trunk (seen end-on, where ranks overlap several deep on
    // screen) 6 abreast and every other rank. The front ranks are mostly
    // blue-cloaked, so the red king reads against a blue column head.
    for (let s0 = O.head0; s0 < TRUNK_S + 12; s0 += s0 > 14 ? 2.1 : 1.15) {
      const n = s0 > 14 ? 6 : 10;
      for (let i = 0; i < n; i++) {
        const front = s0 < O.head0 + 6;
        const red = front ? r.chance(0.25) : r.chance(0.46);
        army.push({ s0: s0 + r.range(-0.35, 0.35), lane: ((i + 0.5 + r.range(-0.28, 0.28)) / n) * 2 - 1, v: V * r.range(0.97, 1.03), kind: r.chance(front ? 0.22 : 0.16) ? 'torch' : red ? 'greekRed' : 'greek', ph: r.next(), route: 0 });
      }
    }
    for (const [ri, len, gap] of [[0, ROUTES[0].len + 30, 1.5], [1, ROUTES[1].len + 30, 2.1], [2, ROUTES[2].len + 30, 2.4]]) { // the streams from the ships
      for (let s0 = TRUNK_S + 12; s0 < len; s0 += gap * r.range(0.6, 1.4)) {
        if (r.chance(0.12)) s0 += gap * 3;                   // knots and gaps along the file
        const n = r.chance(0.5) ? 2 : 3;
        for (let i = 0; i < n; i++) army.push({ s0, lane: ((i + 0.5) / n) * 2 - 1 + r.range(-0.2, 0.2), v: V * r.range(0.95, 1.02), kind: r.chance(0.46) ? 'torch' : r.chance(0.35) ? 'greekRed' : 'greek', ph: r.next(), route: ri, far: true });
      }
    }
  }
  // the top of the wall projects to a line; members out on the plain whose
  // heads are below it are hidden (skip them), except those seen through the
  // gate: beyond the passage, only what its far arch frames (the passage's
  // side wall, painted under them, hides the rest)
  const WA = P(-200, Gt.wall, 0), WB = P(200, Gt.wall, 0);
  const wallTop = (sx) => WA[1] + ((sx - WA[0]) * (WB[1] - WA[1])) / (WB[0] - WA[0]);
  const ARCH = [P(-Gt.w, 0, WD), P(Gt.w, 0, WD), P(Gt.w, Gt.h, WD), P(-Gt.w, Gt.h, WD)];
  const inQuad = (Q, x, y) => { for (let i = 0; i < 4; i++) { const a = Q[i], b = Q[(i + 1) % 4]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) > 0) return false; } return true; };
  // the curtain and the gate towers hide the plain up to their tops
  const occ = [[P(-Gt.towerX[1], 0, -Gt.towerD)[0], P(-Gt.towerX[0], 0, -Gt.towerD)[0], P(-(Gt.towerX[0] + Gt.towerX[1]) / 2, Gt.tower, -Gt.towerD)[1]],
    [P(-Gt.towerX[0], 0, 0)[0], P(Gt.towerX[0], 0, 0)[0], P(0, Gt.curtain, 0)[1]],
    [P(Gt.towerX[0], 0, -Gt.towerD)[0], P(Gt.towerX[1], 0, -Gt.towerD)[0], P((Gt.towerX[0] + Gt.towerX[1]) / 2, Gt.tower, -Gt.towerD)[1]]];
  const hiddenTop = (sx) => { let y = wallTop(sx); for (const [x0, x1, ty] of occ) if (sx > x0 && sx < x1) y = Math.min(y, ty); return y; };
  const zcGate = CAM.view(0, 0)[1];
  // every member is a pure function of t (quantised on twos by the caller);
  // membersAt(t) -> [outside the wall (Z > 0.5), inside], each sorted far to near
  // (allocation-free: once a step for about 1500 members; the camera math
  // of streetCam inlined; atInto: the position on a route (x, z) and its
  // unit normal, the street is s < 0)
  const A4 = new Float64Array(4), B4 = new Float64Array(4);
  const atInto = (R, s, o) => {
    if (s <= 0) { o[0] = 0; o[1] = s; o[2] = 1; o[3] = 0; return o; }
    const { pts, S } = R;
    let lo = 0, hi = S.length - 1;
    if (s >= S[hi]) { const a = pts[hi - 1], b = pts[hi], d = Math.hypot(b[0] - a[0], b[1] - a[1]); o[0] = b[0]; o[1] = b[1]; o[2] = (b[1] - a[1]) / d; o[3] = -(b[0] - a[0]) / d; return o; }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], u = (s - S[lo]) / (S[hi] - S[lo]), d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    o[0] = a[0] + (b[0] - a[0]) * u; o[1] = a[1] + (b[1] - a[1]) * u; o[2] = (b[1] - a[1]) / d; o[3] = -(b[0] - a[0]) / d;
    return o;
  };
  const cX = CAM.x, cZ = CAM.z, cS = CAM.sn, cC = CAM.cs, cF = CAM.f, cH = CAM.H, cCX = CAM.cx, cHY = CAM.hy;
  function membersAt(t) {
    const outs = [], ins = [];
    for (const m of army) {
      const s = m.s0 - m.v * t;
      const R = ROUTES[m.route];
      if (s > R.len) continue;                              // still at the ships
      atInto(R, s, A4);
      const nx = A4[2], nz = A4[3], w = halfW(s) * m.lane;
      const X = A4[0] + nx * w, Z = A4[1] + nz * w;
      const inside = Z <= 0.5, out = inside ? ins : outs;
      const dx = X - cX, dz = Z - cZ, zc = dx * cS + dz * cC;
      if (zc < 4) continue;
      const sx = cCX + (cF * (dx * cC - dz * cS)) / zc, sy = cHY + (cF * cH) / zc;
      const k = cF / zc;
      if (!inside && Z > WD && sy - HM * k * 1.2 > hiddenTop(sx) && !inQuad(ARCH, sx, sy)) continue; // behind the wall
      let ph, dir = 1;
      if (s <= 6) ph = m.ph + (-dx * Math.log(Math.max(1, zc))) / (cC * O.stride * HM);       // gaitAt(X, Z)
      else { // out on the plain the files bend toward the ships: step at the walk's rate, facing the way they go
        if (s >= TRUNK_S) { // through the gate they face the way the column goes
          atInto(R, s - 2, B4);
          const ex = B4[0] + nx * w - cX, ez = B4[1] + nz * w - cZ, zc1 = ex * cS + ez * cC;
          dir = cCX + (cF * (ex * cC - ez * cS)) / zc1 >= sx - 0.2 ? 1 : -1;
        }
        const z6 = dx * cS + (6 - cZ) * cC;                                                        // gaitAt(X, 6)
        ph = m.ph + (-dx * Math.log(Math.max(1, z6))) / (cC * O.stride * HM) - ((s - 6) * 0.45) / (O.stride * HM);
      }
      out.push({ x: sx, y: sy, h: HM * k, dir, phase: ((ph % 1) + 1) % 1, kind: m.kind, zc, far: !!m.far });
    }
    outs.sort((a, b) => b.zc - a.zc); ins.sort((a, b) => b.zc - a.zc);
    return [outs, ins];
  }
  const AGA_H = 2.75;         // heroic size (1.5 men): the king, alone at the head, ~26 px at 1x
  const agaAt = (t) => { const z = O.head0 - O.lead - V * t, x = 0.6; const [sx, sy] = P(x, 0, z); return { x: sx, y: sy, k: CAM.f / CAM.view(x, z)[1], ph: gaitAt(x, z, 1.25, AGA_H) }; };

  // positions only change on twos, so each 12 fps frame is computed once;
  // with reduced motion the army and the fires hold the reducedT moment
  const REDUCED_T = 2.4;
  const tOf = (e) => (e.reduced ? REDUCED_T : e.q(12));
  // (two steps kept: a lagged step cache asks for the previous step while the others ask for the current one)
  const onTwos = (fn) => { const K = [null, null], V = [null, null]; let j = 0; return (e) => { const f = e.reduced ? -1 : Math.floor(e.t * 12 + 1e-4); const i = K[0] === f ? 0 : K[1] === f ? 1 : -1; if (i >= 0) return V[i]; j ^= 1; K[j] = f; V[j] = fn(e); return V[j]; }; };
  // Planted feet in y too: a profile walking down the street's screen
  // diagonal holds its stance foot in x (the gait follows screen x), and a
  // vertical shear about its anchor along its path (slope m: the line to the
  // street's vanishing point) holds it in y: foot y = y0 + m (foot x - x0).
  // The street crowd is drawn under one shear (the column's slope) with its
  // positions compensated, so each glyph is sheared about its own feet.
  const VPX = CAM.cx - (CAM.f * CAM.sn) / CAM.cs, VPY = CAM.hy;         // the vanishing point of the street (+z)
  const slopeAt = (x, y) => (y - VPY) / (x - VPX);
  const members = onTwos((e) => {
    const t = tOf(e), [out, ins] = membersAt(t);
    let sx = 0, sy = 0;
    for (const m of ins) { sx += m.x; sy += m.y; }
    const xr = ins.length ? sx / ins.length : 0, sh = ins.length ? slopeAt(xr, sy / ins.length) : 0;
    return [out, ins, ins.map((m) => ({ ...m, y: m.y - sh * (m.x - xr) })), sh, xr];
  });

  // torch flames read from far away as red dots with a cream core (as in
  // s07); the files out on the plain get bigger dots (plate 5's red dots)
  function torchDots(ctx, e, mem) {
    const fl = e.reduced ? 0 : Math.floor(e.t * 12);
    const px = 1 / e.s;
    const big = (m) => (m.far ? 2.1 : lerp(1, 2.1, clamp((m.zc - zcGate - 20) / 150)));
    // the flame sits CLEAR of the helmet (round 5 centred it at 1.05 h with a
    // radius up to 0.23 h, so its lower edge landed below the top of the head
    // and half the column read as red-capped figures), and a one-device-pixel
    // staff carries it for the members big enough to show one
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = Math.max(px, 0.035 * HM); ctx.beginPath();
    const lim = (8 * (e.dpr || 1)) / e.s;
    for (const m of mem) if (m.kind === 'torch' && m.h > lim) { ctx.moveTo(m.x + m.dir * m.h * 0.12, m.y - m.h * 0.55); ctx.lineTo(m.x, m.y - m.h * 1.3); }
    ctx.stroke();
    ctx.fillStyle = C.red; ctx.beginPath();
    for (const m of mem) if (m.kind === 'torch') { const r = Math.max(1.9 * px, m.h * 0.085 * big(m)) * (((fl + m.phase * 7) | 0) % 2 ? 1 : 0.82); const y = m.y - m.h * 1.32; ctx.moveTo(m.x + r, y); ctx.arc(m.x, y, r, 0, Math.PI * 2); }
    ctx.fill();
    ctx.fillStyle = C.flame; ctx.beginPath();
    for (const m of mem) if (m.kind === 'torch') { const r = Math.max(0.9 * px, m.h * 0.038 * big(m)); const y = m.y - m.h * 1.35; ctx.moveTo(m.x + r, y); ctx.arc(m.x, y, r, 0, Math.PI * 2); }
    ctx.fill();
  }

  // ---- the army beyond the wall and in the street (cached per step).
  // Members drawn under TUNE.dots css px tall (the files out on the plain,
  // the far end of the trunk) are plate 5's dot army: a red or cobalt cloak,
  // a pale helmet and dark legs, batched in four paths, so the far files
  // cost four fills instead of a glyph each; the rest are crowd() glyphs.
  const DOT = { red: '#c02b1f', blue: '#3c58ae', head: '#8f9bc2', legs: '#0a0d1c' };
  function dotArmy(ctx, e, mem) {
    const lim = TUNE.dots ? (TUNE.dots * (e.dpr || 1)) / e.s : 0;
    if (!lim) return mem;
    const px = 1 / e.s, rest = [];
    const red = new Path2D(), blue = new Path2D(), head = new Path2D(), legs = new Path2D();
    let n = 0;
    for (const m of mem) {
      if (m.h >= lim) { rest.push(m); continue; }
      const h = m.h, w = Math.max(2 * px, h * 0.26), x = m.x - w / 2;
      (m.kind === 'greekRed' ? red : blue).rect(x, m.y - h * 0.84, w, Math.max(2 * px, h * 0.6));
      legs.rect(m.x - w * 0.32, m.y - h * 0.26, w * 0.64, h * 0.26);
      const hw = Math.max(1.4 * px, h * 0.13);
      head.rect(m.x - hw / 2, m.y - h * 0.98, hw, hw);
      n++;
    }
    if (n) { ctx.fillStyle = DOT.legs; ctx.fill(legs); ctx.fillStyle = DOT.blue; ctx.fill(blue); ctx.fillStyle = DOT.red; ctx.fill(red); ctx.fillStyle = DOT.head; ctx.fill(head); }
    return rest;
  }
  const shipsIn = (e) => {
    const v = e.view, out = [];
    for (const [x, z, s] of TUNE.ships ? SHIPS : []) {
      const [sx, sy] = P(x, 0, SHORE(x) + (z - 420) * 0.35);
      if (sx < v.ox - 160 || sx > v.ox + v.vw + 160 || sy < v.oy - 60) continue;
      out.push([sx, sy, s * 0.9]);
    }
    return out;
  };
  // the ships drawn up on the beach (masts and furled yards, as plate 5's
  // ships read by their masts); the torch streams from them to the gate
  function drawOutside(ctx, e) {
    const gun = shipsIn(e);
    for (const [x, y, s] of gun) galley(ctx, e, { x, y, s, dir: -1, sail: 'white', furl: 0.9, crew: true, oars: 0 });
    // a moonlit gunwale on each hull and a torch at the stern, so the
    // returned fleet reads against the dark bay
    const px = 1 / e.s;
    ctx.fillStyle = C.ivory;
    for (const [x, y, s] of gun) ctx.fillRect(x - 55 * s, y - 9.9 * s - px, 110 * s, Math.max(px, 0.7 * s));
    ctx.fillStyle = C.red; ctx.beginPath();
    for (const [x, y, s] of gun) { const r = Math.max(1.6 * px, 2.2 * s); ctx.moveTo(x + 58 * s + r, y - 16 * s); ctx.arc(x + 58 * s, y - 16 * s, r, 0, Math.PI * 2); }
    ctx.fill();
    ctx.fillStyle = C.flame; ctx.beginPath();
    for (const [x, y, s] of gun) { const r = Math.max(0.8 * px, 0.9 * s); ctx.moveTo(x + 58 * s + r, y - 16.5 * s); ctx.arc(x + 58 * s, y - 16.5 * s, r, 0, Math.PI * 2); }
    ctx.fill();
    const mem = members(e)[0];
    crowd(ctx, e, dotArmy(ctx, e, mem));
    torchDots(ctx, e, mem);
  }
  function outsideExtent(e) {
    const R = box();
    for (const m of members(e)[0]) R.add(m.x - m.h * 0.7, m.y - m.h * 1.6, m.x + m.h * 0.7, m.y + m.h * 0.2);
    for (const [x, y, s] of shipsIn(e)) R.add(x - 66 * s, y - 82 * s, x + 66 * s, y + 10 * s);
    R.x0 -= 3; R.y0 -= 3; R.x1 += 3; R.y1 += 3;
    return R;
  }
  // the column in the street (each glyph sheared about its own feet, see
  // members()) and Agamemnon at its head
  function drawArmy(ctx, e) {
    const [, , mem, sh, xr] = members(e);
    const A = agaAt(tOf(e)), h = AGA_H * A.k;
    ctx.save(); ctx.transform(1, sh, 0, 1, 0, -sh * xr);
    crowd(ctx, e, mem, { shadow: true });
    torchDots(ctx, e, mem);
    ctx.restore();
    const mA = slopeAt(A.x, A.y);
    ctx.save(); ctx.transform(1, mA, 0, 1, 0, -mA * A.x);
    agamemnon(ctx, e, { x: A.x, y: A.y, h, dir: 1, pose: 'run', planted: true, phase: ((A.ph % 1) + 1) % 1, torch: true, hero: true, shadow: true });
    ctx.restore();
  }
  function armyExtent(e) {
    const [, ins, , sh] = members(e), R = box(), k = Math.abs(sh) * 0.8;
    for (const m of ins) R.add(m.x - m.h * 0.75, m.y - m.h * (1.6 + k), m.x + m.h * 0.75, m.y + m.h * (0.25 + k));
    const A = agaAt(tOf(e)), h = AGA_H * A.k, kA = Math.abs(slopeAt(A.x, A.y)) * 1.1;
    R.add(A.x - h * 1.1, A.y - h * (1.7 + kA), A.x + h * 1.3, A.y + h * (0.35 + kA));
    R.x0 -= 3; R.y0 -= 3; R.x1 += 3; R.y1 += 3;
    return R;
  }

  // ---- fires: the fires near the street burn on the drop and flare (the
  // hit); the rest catch on the beats of the music, a few at a time. Those
  // on the near side of the street (drawn over the column) stay small. Every
  // roof fire burns where kit/city.js roofFire() puts it: on a terrace just
  // behind the parapet turned to us, on a gable behind the ridge, so its
  // tongues rise from behind an edge (the edge is redrawn over the flames).
  const inFrame = (f) => { const [sx, sy] = P(f.X, f.Y, f.Z); return sx > -60 && sx < 1660 && sy > 60 && sy < 960; };
  // no fire burns behind the caption (bottom centre) on the way in, at
  // 1440x900 / 1600x900 and on phones: the box is where the caption block
  // sits with the controls showing or idle, with a margin
  const ios = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
  const capBox = (q, k0, k1, A, bx, by) => {
    for (let i = 0; i <= 12; i++) {
      const u = ios(i / 12), f = {}; for (const c of ['x', 'y', 'w', 'h']) f[c] = k0[c] + (k1[c] - k0[c]) * u;
      const vw = f.w / f.h > A ? f.w : f.h * A, vh = vw / A;
      const rx = (q[0] - (f.x - vw / 2)) / vw, ry = (q[1] - (f.y - vh / 2)) / vh;
      if (rx > bx[0] && rx < bx[1] && ry > by && ry < 1.05) return true;
    }
    return false;
  };
  const clearOfCaption = (f) => { const q = P(f.X, f.Y, f.Z); return !capBox(q, O.cam0, O.cam1, 1.6, [0.28, 0.72], 0.7) && !capBox(q, O.cam0, O.cam1, 16 / 9, [0.28, 0.72], 0.7) && !capBox(q, O.camP0, O.camP1, 390 / 844, [0.1, 0.9], 0.72); };
  const anchored = (f, b, x) => { const a = roofFire(LAY, b, { x }); return { ...f, X: a.X, Y: a.Y, Z: a.Z, cover: a, box: b }; };
  // A fire on a roof that a NEARER house hides would print on top of that
  // house, because the fire actors draw after the baked layers (the final
  // review's must-fix: 17 of 22 fires drew over a nearer box). So a fire is
  // kept only where its base is in view. A near-side fire draws after both
  // layers, so any nearer box hides it; a far-side fire draws after the far
  // layer only and the near layer already covers it, so only nearer far-side
  // boxes count.
  const cvx = (pts) => {
    const s2 = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of s2) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = s2.length - 1; i >= 0; i--) { const q = s2[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  };
  const inCvx = (h, q) => {
    if (h.length < 3) return false;
    for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 0) return false; }
    return true;
  };
  const OCC = LAY.boxes.filter((b) => b.x0 !== undefined && Number.isFinite(b.zc)).map((b) => {
    const y1 = b.kind === 'house' && b.roof === 'gable' ? b.h + 2.2 : b.kind === 'house' && !b.court ? b.h + PARAPET : b.h, pts = [];
    for (const x of [b.x0, b.x1]) for (const y of [0, y1]) for (const z of [b.z0, b.z1]) pts.push(P(x, y, z));
    return { b, hull: cvx(pts) };
  });
  const hiddenAt = (f) => { const q = P(f.X, f.Y, f.Z); return OCC.some((o) => o.b !== f.box && o.b.zc < f.box.zc - 0.5 && (LEFT(f.box) || !LEFT(o.b)) && inCvx(o.hull, q)); };
  const FIRES = LAY.fires.map((f) => anchored(f, f.box, f.X)).filter((f) => inFrame(f) && clearOfCaption(f) && !hiddenAt(f)).map((f, i) => ({ ...f, near: LEFT(f.box), t0: f.street && f.Z > -95 && f.Z < -6 ? -1 : BEATS[Math.floor(f.at * BEATS.length) % BEATS.length] + 0.04 * (i % 3) }));
  // A beat-locked fire catches on the DRAWING that is on screen when the beat
  // sounds, not on the next one: the actors move on twos, so fireI() sees the
  // step time floor(t * 12) / 12, and a raw beat inside a step was only shown
  // from the following step (+22 to +66 ms, always late: the round-5
  // continuity finding). Snapped to the NEAREST drawing the error is -40 to
  // +22 ms, inside the 42 ms a 12 fps drawing can resolve. The epsilon keeps
  // the comparison on the right side of the step when t lands exactly on it.
  const onStep = (t) => Math.round(t * 12) / 12 - 1e-4;
  // three great roof fires beside the gate road, on the far side of the
  // street so their smoke rises clear of the gate and the column
  const onRoof = (X, Z) => LAY.boxes.find((b) => b.kind === 'house' && b.x0 < X && b.x1 > X && b.z0 < Z && b.z1 > Z);
  for (const [X, Z, w, seed, t0] of [[24, -34, 7, 991, -1], [33, -66, 8, 992, -1], [-42, -30, 6.5, 993, onStep(BEATS[1])]]) {
    const b = onRoof(X, Z) ?? LAY.boxes.filter((c) => c.kind === 'house').sort((a, c) => Math.hypot((a.x0 + a.x1) / 2 - X, (a.z0 + a.z1) / 2 - Z) - Math.hypot((c.x0 + c.x1) / 2 - X, (c.z0 + c.z1) / 2 - Z))[0];
    for (let i = FIRES.length - 1; i >= 0; i--) if (FIRES[i].box === b) FIRES.splice(i, 1);
    const f = anchored({ w, seed, zc: b.zc, t0, big: true, near: LEFT(b) }, b, X);
    if (clearOfCaption(f) && !hiddenAt(f)) FIRES.push(f);
  }
  // Every beat after the drop shows a clear bloom: beats 65, 66 and 67 each
  // light two roofs, one of them inside the PHONE window and the two of a
  // beat far apart in the landscape frame.
  //   The layout's own fires are nearly all in the right-hand third (the left
  // third is the gate, the wall and the plain), so three roofs are seeded by
  // hand - one per beat, each inside both the landscape and the portrait
  // window (evidence/tmp/C4/r6/cand.mjs lists the candidates) - and the
  // picker then adds one more per beat as far from its partner as it can.
  {
    const inCam = (f, r) => { const q = P(f.X, f.Y, f.Z); return Math.abs(q[0] - r.x) < r.w * 0.45 && q[1] > r.y - r.h * 0.45 && q[1] < r.y + r.h * 0.3; };
    // blooms burn on moonlit roofs (not on the houses dimmed by the smoke, DIM below)
    const ok = (f) => f.t0 >= 0 && !f.big && f.w >= 3.6 && f.box.zc >= 100 && inCam(f, O.cam0) && inCam(f, O.cam1);
    const sx = (f) => P(f.X, f.Y, f.Z)[0];
    // the seeded three: [X, Z, w, seed, beat index]. The first is on the near
    // side of the street (left of the frame's middle in landscape, far left on
    // a phone), the other two on the far side right of the gate road.
    const seeded = [];
    for (const [X, Z, w, seed, bi] of [[-20, -25, 6.0, 994, 0], [17, -12, 6.4, 995, 1], [32, -17, 6.4, 996, 2]]) {
      const b = onRoof(X, Z);
      if (!b) continue;
      for (let i = FIRES.length - 1; i >= 0; i--) if (FIRES[i].box === b) FIRES.splice(i, 1);
      const f = anchored({ w, seed, zc: b.zc, t0: onStep(BEATS[bi]), bloom: true, near: LEFT(b) }, b, X);
      if (!clearOfCaption(f) || hiddenAt(f) || !inCam(f, O.cam0) || !inCam(f, O.cam1)) continue;
      FIRES.push(f); seeded[bi] = f;
    }
    const cand = [...FIRES.filter((f) => ok(f) && !f.near).sort((a, b) => b.w - a.w), ...FIRES.filter((f) => ok(f) && f.near).sort((a, b) => b.w - a.w)];
    // farthest-point sampling in x from the seeded roofs (or the widest fire
    // when none of them took), so the blooms cover the frame
    const pick = [];
    const anchors = seeded.filter(Boolean).map(sx);
    if (!anchors.length && cand.length) pick.push(cand[0]);
    while (pick.length < 3 && pick.length < cand.length) {
      let best = null, bd = -1;
      for (const f of cand) {
        if (pick.includes(f)) continue;
        const d = Math.min(...[...anchors, ...pick.map(sx)].map((x) => Math.abs(x - sx(f)))) + f.w * 4;   // the wider fire wins a tie
        if (d > bd) { bd = d; best = f; }
      }
      pick.push(best);
    }
    // one beat each, chosen so the SMALLEST of the three pairs' gaps is as
    // wide as it can be (at most six orders to try, so it is brute-forced:
    // greedy picks 376 px where the best order gives 546)
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((v, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [v, ...r])));
    const gapOf = (f, bi) => (seeded[bi] ? Math.abs(sx(seeded[bi]) - sx(f)) : 1e9);
    let bestOrder = null, bestMin = -1;
    for (const order of perms([0, 1, 2].slice(0, pick.length))) {
      const m2 = Math.min(...pick.map((f, j) => gapOf(f, order[j])));
      if (m2 > bestMin) { bestMin = m2; bestOrder = order; }
    }
    pick.forEach((f, j) => { f.t0 = onStep(BEATS[bestOrder[j]]); f.bloom = true; });
  }
  // smoke: massed plumes from the big fires beyond the street (and on the
  // near side far to the left of it: the wind takes their smoke away from
  // the column); the small fires burn without a column of their own
  // a column only where it can read as one mass rising (the plates carry two or three big masses,
  // not a row of plumes): the three great fires, the beat blooms of 6.2 m or more and any fire of
  // 8 m; the rest burn without a column of their own
  for (const f of FIRES) f.smoky = (!f.near || P(f.X, f.Y, f.Z)[0] < 600) && (f.big || f.w >= 8 || (f.bloom && f.w >= 6.2));
  // the street fronts near each fire: their windows and doors glow once it
  // has caught (the fire is inside); the burn scar is wide (1.1-1.5 w), so
  // the terrace round the flames is charred, not clean
  for (const f of FIRES) {
    f.win = [[], []];
    for (const b of LAY.boxes) {
      if (!b.street || Math.hypot((b.x0 + b.x1) / 2 - f.X, (b.z0 + b.z1) / 2 - f.Z) > 13) continue;
      for (const w of streetWindows(LAY, b, { street: true })) f.win[LEFT(b) ? 1 : 0].push(w);
    }
    f.scarK = f.big ? 1.5 : 1.1;
    f.scar = scarQuad(LAY, f);
  }
  const SCARS = FIRES.filter((f) => f.t0 < 0);
  // Where a fire's light falls: the planes within 9 m of it (walls and roofs
  // of the houses round it; of its own house only the roof, since its walls
  // face away from a fire on the roof), and for a street-front fire the
  // street in front. Two Path2Ds per fire, built on first use, every polygon
  // wound the same way so each union clips as one: the moonlit planes (the
  // warm multiply turns them salmon, drawn on the frame) and the planes in
  // shadow or in the smoke's shadow (DIM: an opaque dark red, small, cached).
  const HOUSES = LAY.boxes.filter((b) => b.kind === 'house' || b.kind === 'temple');
  const addPoly = (p2, q) => {
    let a = 0; for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; a += u[0] * v[1] - v[0] * u[1]; }
    const Q = a < 0 ? [...q].reverse() : q;
    p2.moveTo(Q[0][0], Q[0][1]); for (let i = 1; i < Q.length; i++) p2.lineTo(Q[i][0], Q[i][1]); p2.closePath();
  };
  const lightPaths = (f) => f.lp ??= (() => {
    const lit = new Path2D(), dark = new Path2D();
    let nl = 0, nd = 0;
    for (const b of HOUSES) {
      if (Math.hypot(clamp(f.X, b.x0, b.x1) - f.X, clamp(f.Z, b.z0, b.z1) - f.Z) > 9) continue;
      const ps = boxPlanes(LAY, b), dim = DIM(b) < 1;
      for (const { q, l } of b === f.box ? ps.slice(-1) : ps) { if (l > 0.5 && !dim) { addPoly(lit, q); nl++; } else { addPoly(dark, q); nd++; } }
    }
    if (f.street) { const S = LAY.SW, z0 = Math.max(-150, f.Z - 9), z1 = Math.min(-0.5, f.Z + 9); if (z1 > z0) { addPoly(lit, [P(-S, 0, z0), P(S, 0, z0), P(S, 0, z1), P(-S, 0, z1)]); nl++; } }
    return { lit: nl ? lit : null, dark: nd ? dark : null };
  })();
  // the city under its roofs, as one polygon (the hit's third drawing): the
  // highest roof over each 10-unit column, and everything below it
  let CITY = null;
  const cityPath = () => CITY ??= (() => {
    const X0 = -300, X1 = 1900, N = 220, top = new Float64Array(N + 1).fill(Infinity);
    for (const b of HOUSES) for (const q of boxFaces(LAY, b)) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
      for (const [x, y] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
      for (let i = Math.max(0, Math.ceil(((x0 - X0) / (X1 - X0)) * N)); i <= Math.min(N, Math.floor(((x1 - X0) / (X1 - X0)) * N)); i++) top[i] = Math.min(top[i], y0);
    }
    const p2 = new Path2D(); p2.moveTo(X0, 3000);
    for (let i = 0; i <= N; i++) p2.lineTo(X0 + ((X1 - X0) * i) / N, top[i] === Infinity ? 3000 : top[i]);
    p2.lineTo(X1, 3000); p2.closePath();
    return p2;
  })();
  // The drop's hit (post) reddens the city and nothing else (standard 35:
  // the sky, the sea, the plain, the walls and the moon keep their colours on
  // every frame): the houses under their roofline, the street with the column
  // on it (the paving and the 3 m above it) and the gate's inner opening, so
  // the column in the passage stays inside the flash with the street it walks
  // on. One Path2D, every polygon wound the same way (addPoly), so the union
  // fills as one. (The walls and the gate towers stay moonlit: with them the
  // red would be a quarter of the frame and the cobalt under a fifth.)
  const hull2 = (pts) => {
    const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of s) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  // The projected SILHOUETTE of a box (a box is convex, so the hull of its eight
  // corners is exactly its outline): everything the box itself draws - faces,
  // terrace floor, parapets, a courtyard's inner walls - is inside it.
  const boxHull = (b, y0, y1) => {
    const pts = [];
    for (const x of [b.x0, b.x1]) for (const y of [y0, y1]) for (const z of [b.z0, b.z1]) pts.push(P(x, y, z));
    return hull2(pts);
  };
  const topOf = (b) => (b.kind === 'house' && b.roof === 'gable' ? b.h + 2.2 : b.kind === 'house' && !b.court ? b.h + PARAPET : b.h);
  let HITP = null;
  const hitPath = () => HITP ??= (() => {
    const p2 = new Path2D(), S = LAY.SW + 0.5, Z = -150;
    p2.addPath(cityPath());
    addPoly(p2, [P(-LAY.GW, 0, 0), P(LAY.GW, 0, 0), P(LAY.GW, LAY.GH, 0), P(-LAY.GW, LAY.GH, 0)]);
    addPoly(p2, hull2([P(-S, 0, Z), P(S, 0, Z), P(S, 0, 0), P(-S, 0, 0), P(-S, 3, Z), P(S, 3, Z), P(S, 3, 0), P(-S, 3, 0)]));
    // and the two leaves, swung wide INTO the city: the fire's light reaches
    // everything around them, so a warm grey slab left out of the flash read
    // as a hole in the middle of it (the round-5 NICE). The towers and the
    // curtain stay out: they are outside the city mass and read as moonlit.
    for (const b of LAY.boxes) if (b.kind === 'door') addPoly(p2, boxHull(b, 0, b.h));
    return p2;
  })();
  // The navy masses inside the hit (the houses the smoke's shadow dims): the
  // hue pass runs over THESE, not over the whole city, because a warm multiply
  // leaves navy at hue 252-276 - 6.2% of the frame measured plum, which
  // standard 15 forbids - while it leaves moonlit ivory at vermilion-salmon
  // (hue 12-19) with its own three-channel modelling intact. So the lit town
  // keeps the drawing the flash used to crush and the navy foreground goes
  // red-black.
  let DIMP = null;
  const dimPath = () => DIMP ??= (() => {
    const p2 = new Path2D();
    for (const b of HOUSES) {
      if (DIM(b) < 1) { addPoly(p2, boxHull(b, 0, topOf(b))); continue; }   // the whole navy house, terrace floor and courtyard included
      for (const { q, l } of boxPlanes(LAY, b)) if (l <= 0.5) addPoly(p2, q);     // and the shade faces of the moonlit town
    }
    for (const b of LAY.boxes) if (b.kind === 'tree') addPoly(p2, [P(b.x - b.r, 0, b.z), P(b.x + b.r, 0, b.z), P(b.x + b.r, b.h, b.z), P(b.x - b.r, b.h, b.z)]);
    addPoly(p2, [P(-LAY.GW, 0, 0), P(LAY.GW, 0, 0), P(LAY.GW, LAY.GH, 0), P(-LAY.GW, LAY.GH, 0)]);   // the gate's black opening, with the river in it
    for (const b of LAY.boxes) if (b.kind === 'door') addPoly(p2, boxHull(b, 0, b.h));                // the leaves, swung into it
    return p2;
  })();
  let STREET = null;               // the paved street (Agamemnon's torchlight falls on it)
  const streetPath = () => STREET ??= (() => { const p2 = new Path2D(), S = LAY.SW; addPoly(p2, [P(-S, 0, -150), P(S, 0, -150), P(S, 0, -0.3), P(-S, 0, -0.3)]); return p2; })();
  // intensity: burning fires flare on the drop and settle; new ones catch
  // with an overshoot; flare is a short extra burst used for the light
  const hit = (t) => Math.exp(-t / 0.2);
  function fireI(t, t0, reduced) {
    if (t0 < 0) return 0.95 + (reduced ? 0.2 : 0.65) * hit(t);
    if (t < t0) return 0;
    return clamp(0.55 + 0.45 * ease.outBack(clamp((t - t0) / 0.42)), 0, 1.25);   // catches at once (the first drawing on the beat blooms), then grows
  }
  const beatFlare = (t, t0) => { let v = 0; for (const d of DOWN) if (t >= d && d > t0 + 0.3) v = Math.max(v, 0.45 * Math.exp(-(t - d) / 0.18)); return v; };
  const flareOf = (t, t0, reduced) => (reduced ? 0 : t0 < 0 ? Math.max(hit(t), beatFlare(t, t0)) : t < t0 ? 0 : Math.max(Math.exp(-(t - t0) / 0.16), beatFlare(t, t0)));
  // the wind blows to the left of frame: smoke from the roofs beyond the
  // street leans away from the column; the near side's fires are smokeless
  const WIND = -0.34;
  // per side: all the burning fires, the small ones (one batched flames()
  // call, stable per drawing so its cache holds) and all of them far to near
  // (depth: each one's smoke, then its flames and the edge that hides its base)
  function fireSpecsAt(t, reduced) {
    const sides = [[], []];
    for (const f of FIRES) {
      const I = fireI(t, f.t0, reduced);
      if (I <= 0.02) continue;
      const zc = CAM.view(f.X, f.Z)[1], k = CAM.f / zc;
      const [sx, sy] = P(f.X, f.Y, f.Z);
      // Licking tongues, not tents: the base is narrow and the mass is 2.1-2.6
      // times as tall as it is wide (round 5 drew every roof fire as wide as it
      // was tall, so eight near-identical vermilion cones sat on the roofs).
      // fx.js's lickGeom widens its tongues and drops their lean as W/H falls,
      // so a narrow fire reads as a few tall tongues with a broken cream core.
      const kind = (f.big ? 1.4 : f.bloom ? 1.7 : 1) * (f.near ? 0.8 : 1);
      const fl = flareOf(t, f.t0, reduced);
      const W = Math.min(f.w * TUNE.fw, 3.4) * kind * k;
      const H = W * (f.big ? TUNE.fhBig : TUNE.fh) * (1 + (f.bloom ? 1 : 0.7) * fl);
      // the firelight pool keeps round 5's reach: it is sized from the flame
      // width round 5 drew (f.w x 0.55), not from the narrower one, so
      // reshaping the flames moved no light on the stone
      const W0 = Math.min(f.w * 0.55, 4.5) * kind * k;
      // The reach of its light (only the great fires, the beat blooms and the
      // far side's fires at least 26 units wide light the stone; the rest light
      // their windows); after the impact the light floods wider and recedes
      // over ~0.5 s.
      const wash = f.t0 < 0 && !reduced ? Math.exp(-t / 0.28) : 0;
      const pr = TUNE.pools !== 'none' && ((W0 >= 26 && !f.near) || f.big || f.bloom) ? W0 * (f.near ? 1.0 : 1.3) * Math.sqrt(clamp(I, 0, 1.25)) * (1 + 0.35 * fl + wash) : 0;
      // lod by the flame's height (the thresholds are the old W > 40 / W > 16 at the old h = 1.3 W)
      sides[f.near ? 1 : 0].push({ x: sx, y: sy, py: sy + W0 * 0.3, w: W, h: H, w0: W0, seed: f.seed, intensity: I, wind: WIND * 0.6, k, zc, f, fl, pr, lod: f.big ? 'auto' : H > 52 ? 'auto' : H > 21 ? 'small' : 'tiny', age: f.t0 < 0 ? t + 2.5 : t - f.t0 });
    }
    return sides.map((all) => {
      const small = all.filter((s) => s.lod === 'tiny'), depth = [...all].sort((a, b) => b.zc - a.zc);
      return { all, small, depth };
    });
  }
  const fireSpecs = onTwos((e) => fireSpecsAt(tOf(e), e.reduced));
  // cull to what the frame can show (the view of this plane, plus the smoke above)
  const inView = (e, f) => { const v = e.view, m = f.w0 * 2; return f.x > v.ox - m && f.x < v.ox + v.vw + m && f.y > v.oy - m && f.y - f.w0 * 5 < v.oy + v.vh + m; };
  const SMOKE = { base: '#030410', half: '#141a3c', lit: '#323a6c', under: ['#8a2114', '#521009'] };
  // C2's warm filter (kit/fx.js glow 'warm' for C.red: band strengths 0.75
  // and 1.15 of the filter, times the fire's flare), applied here to a flat
  // tone, so a plane redrawn over the flames takes the same light as the
  // stone round it without a blend
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const WARM_F = (() => { const [, g, b] = hexRGB(C.red); return [255, Math.round(255 - (255 - g) * 0.6), Math.round(255 - (255 - b) * 0.7)]; })();
  // the hit's own filter: C2's warm firelight filter at strength q, so the drop
  // lights the city's stone the same way every other fire in the film does
  // (ivory -> vermilion-salmon at hue 12; a lighter filter drifts to orange)
  const warmHit = (q) => `rgb(255,${Math.round(255 - (255 - WARM_F[1]) * q)},${Math.round(255 - (255 - WARM_F[2]) * q)})`;
  const warmMul = (hex, q) => { const k = Math.round(clamp(q, 0, 1.6) * 40) / 40, c = hexRGB(hex); return `rgb(${c.map((v, i) => Math.round((v * Math.round(clamp(255 + (WARM_F[i] - 255) * k, 0, 255))) / 255)).join(',')})`; };
  const quadPath = (g, qs) => { g.beginPath(); for (const q of qs) { g.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) g.lineTo(q[i][0], q[i][1]); g.closePath(); } };
  const DARK_LIGHT = ['#4a0d09', '#2a0806'];   // firelight on navy: two opaque dark reds (inner, outer)
  // the edge in front of a big fire's base (its parapet and coping, or the
  // near slope under the ridge), redrawn in the tone the stone bakes to; a
  // lit fire's light falls on it as on the stone round it: the strip is cut
  // into short pieces, each in the pool's band at its middle (the warm
  // filter applied to its tone, or the dark reds on a house in the smoke's
  // shadow), so it takes the same salmon bands as the terrace behind it
  // without a clip or a blend
  function drawCover(ctx, e, f) {
    // built once a step (the fire's spec is the step's): the strip's pieces
    // grouped by tone, then the tile courses and the ink
    const K = f._cov ??= (() => {
      const c = f.f.cover, dim = DIM(f.f.box) < 1, groups = new Map();
      // on a house in the smoke's shadow the strip keeps its navy except right at the flames'
      // foot (a flat maroon band across a navy parapet reads as a tarpaulin)
      const R = f.pr ? (dim ? f.pr * 0.3 : f.pr) : 0, wq = Math.min(1.6, 1 + 0.3 * f.fl), cy0 = f.py;
      const add = (style, pts) => { let P2 = groups.get(style); if (!P2) groups.set(style, (P2 = new Path2D())); P2.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) P2.lineTo(pts[i][0], pts[i][1]); P2.closePath(); };
      for (const { q, l } of c.cover) {
        const base = streetTone(l, { dim });
        const len = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), n = R ? Math.max(1, Math.min(12, Math.ceil(len / Math.max(4, R * 0.2)))) : 1;
        for (let i = 0; i < n; i++) {
          const u0 = i / n, u1 = (i + 1) / n, L2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
          const pts = [L2(q[0], q[1], u0), L2(q[0], q[1], u1), L2(q[3], q[2], u1), L2(q[3], q[2], u0)];
          const d = R ? Math.hypot((pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4 - f.x, ((pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4 - cy0) / 0.72) / R : 9;
          add(d >= 1 ? base : dim ? DARK_LIGHT[d < 0.55 ? 0 : 1] : warmMul(base, (d < 0.6 ? 1.15 : 0.75) * wq), pts);
        }
      }
      let lines = null;
      if (c.lines.length) { lines = { style: streetTone(c.lines[0].l, { dim }), w: c.lines[0].w * f.k * 0.5, P: new Path2D() }; for (const L2 of c.lines) { lines.P.moveTo(L2.a[0], L2.a[1]); lines.P.lineTo(L2.b[0], L2.b[1]); } }
      const ink = new Path2D();
      for (const s2 of c.ink) { ink.moveTo(s2[0], s2[1]); ink.lineTo(s2[2], s2[3]); }
      return { groups, lines, ink };
    })();
    for (const [style, P2] of K.groups) { ctx.fillStyle = style; ctx.fill(P2); }
    if (K.lines) { ctx.strokeStyle = K.lines.style; ctx.lineWidth = Math.max(1 / e.s, K.lines.w); ctx.stroke(K.lines.P); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1 / e.s, 0.07 * f.k); ctx.stroke(K.ink);
  }

  // Firelight on the moonlit planes near each lit fire (standard 21): C2's
  // warm filter in two hard faceted bands turns ivory salmon, then coral-
  // vermilion near the fire; stone away from the fire stays ivory, and the
  // light grows as a fire catches. It is a multiply, so it is drawn on every
  // frame (one clip and two fills a fire), never cached.
  // All the lit fires of a side share one clip (the union of their planes,
  // built once a step): a clip is costly in WebKit's GPU process, a fill is
  // not. A fire's light may then fall on the planes round a neighbouring
  // fire within its reach, never on the sky, a shaded face or the street
  // away from a street fire.
  const unionOf = (side, key) => side[key] ??= (() => { let P2 = null; for (const f of side.all) { if (!f.pr) continue; const q = lightPaths(f.f)[key === 'litU' ? 'lit' : 'dark']; if (!q) continue; (P2 ??= new Path2D()).addPath(q); } return P2; })();
  const SKIP = (c) => TUNE.skip && TUNE.skip.includes(c);   // test plates only: parts left out to A/B their cost
  function firePools(ctx, e, side) {
    if (SKIP('p')) return;
    const U = unionOf(side, 'litU');
    if (!U) return;
    ctx.save(); ctx.clip(U);
    for (const f of side.all) {
      if (!f.pr || !inView(e, f) || !lightPaths(f.f).lit) continue;
      glow(ctx, e, { x: f.x, y: f.py, r: f.pr, sy: 0.72, mode: 'warm', strength: 1 + 0.3 * f.fl, bands: 2, facets: 9, seed: f.seed, flicker: 0 });
    }
    ctx.restore();
  }
  // Everything else a side's fires draw (cached per 12 fps step): the
  // shaded planes and the houses in the smoke's shadow near a lit fire take
  // a small opaque dark red in two faceted bands (half the light's reach,
  // then 0.3 of it: a navy face shows a little two-tone firelight by the
  // flame and stays navy beyond it, never plum, never a flat maroon sheet);
  // the burnt patches, the windows lit by the fire inside, the smoke, the
  // flames and the edges that hide their bases.
  function fireBody(ctx, e, side, nearSet) {
    const fs = side.all.filter((f) => inView(e, f));
    const U = SKIP('d') ? null : unionOf(side, 'darkU');
    if (U) {
      ctx.save(); ctx.clip(U);
      for (const f of fs) if (f.pr && lightPaths(f.f).dark) glow(ctx, e, { x: f.x, y: f.py, r: f.pr * 0.32, sy: 0.72, mode: 'tint', colors: DARK_LIGHT, strength: 1, bands: 2, facets: 9, seed: f.seed, flicker: 0 });
      ctx.restore();
    }
    // the burnt patches under the fires that catch during the shot and the
    // windows lit by the fire inside (red, with a flickering cream heart):
    // their paths are built once a step (the side's spec is the step's)
    const W = side._w ??= (() => {
      const scar = new Path2D(), red = new Path2D(), hot = new Path2D(), cream = new Path2D();
      const F = e.reduced ? 0 : Math.floor(e.t * 12 + 1e-4);
      let nw = 0;
      for (const f of side.all) {
        if (f.f.t0 >= 0 && f.intensity > 0.3 && f.f.scar.length) { f.f.scar.forEach((q, i) => (i ? scar.lineTo(q[0], q[1]) : scar.moveTo(q[0], q[1]))); scar.closePath(); }
        if (f.intensity < 0.35) continue;
        const ws = f.f.win[nearSet ? 1 : 0];
        for (let i = 0; i < ws.length; i++) {
          const { q } = ws[i], v = ((F + i * 7 + (f.seed & 15)) * 2654435761 >>> 0) % 5;
          const P2 = v === 0 ? hot : red;
          P2.moveTo(q[0][0], q[0][1]); P2.lineTo(q[1][0], q[1][1]); P2.lineTo(q[2][0], q[2][1]); P2.lineTo(q[3][0], q[3][1]); P2.closePath();
          if (v < 2) { // the heart of the fire seen through the opening
            const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, k = 0.42;
            cream.moveTo(cx + (q[0][0] - cx) * k, cy + (q[0][1] - cy) * k * 0.6 + (q[0][1] - cy) * 0.35);
            for (let j = 1; j < 4; j++) cream.lineTo(cx + (q[j][0] - cx) * k, cy + (q[j][1] - cy) * k * 0.6 + (q[j][1] - cy) * 0.35);
            cream.closePath();
          }
          nw++;
        }
      }
      return { scar, red, hot, cream, nw };
    })();
    if (!SKIP('x')) { ctx.fillStyle = '#05060f'; ctx.fill(W.scar); }
    if (W.nw && !SKIP('w')) { ctx.fillStyle = C.red; ctx.fill(W.red); ctx.fillStyle = C.redHot; ctx.fill(W.hot); ctx.fillStyle = C.flame; ctx.fill(W.cream); }
    // the small far fires in one batched call; then far to near, each fire's
    // smoke column (it rises as the fire takes hold), its flames and the edge
    // that hides their base, so a nearer fire's smoke passes in front of a
    // farther fire's flames
    if (side.small.length && !SKIP('f')) flames(ctx, e, side.small);
    for (const f of side.depth) {
      if (!inView(e, f)) continue;
      if (TUNE.smoke && !SKIP('s') && f.age >= 0.25 && f.f.smoky) smoke(ctx, e, { ...smokeOf(f), seed: f.seed, drift: WIND * (0.75 + 0.5 * (((f.seed * 2654435761) >>> 9) & 255) / 255), speed: f.w0 * 1.1, grow: TUNE.grow, count: TUNE.count, group: TUNE.group, lit: TUNE.lit, palette: SMOKE, time: smokeTime(e, f.seed) });
      if (f.lod === 'tiny') continue;
      if (!SKIP('f')) flames(ctx, e, f);
      if (!SKIP('c')) drawCover(ctx, e, f);
    }
  }
  // smoke on twos (TUNE.smokeFps 6: on fours, each column at its own phase;
  // measured: no cheaper in WebKit, the cost is the frame's blits, not the re-renders)
  const smokeTime = (e, seed) => { const fps = TUNE.smokeFps ?? 12, t = e.t + 40; if (fps >= 12 || e.reduced) return t; const ph = ((seed * 2654435761) >>> 0) / 4294967296; return (Math.floor(t * fps + ph) - ph) / fps + 1e-4; };
  // a column rises at once and keeps growing (a young one is not a bush)
  const smokeOf = (f) => ({ x: f.x + f.w0 * 0.15, y: f.y - f.w0 * 0.59, w: f.w0 * TUNE.sw, h: f.w0 * TUNE.sh * (f.f.big ? 1 : 0.8) * clamp(0.45 + f.age / 3, 0.45, 1) });

  // ---- step caches (WebKit: production standard 17). The actors move on
  // twos, so each draws once per 12 fps step into an offscreen canvas at
  // device resolution, aligned with the device pixels of the frame that
  // makes it and covering what it draws (within the view and a margin), and
  // the frames in between only blit it: in WebKit every draw command is
  // work for the GPU process, and s08 drew about a thousand glyphs, the
  // smoke and the fires on every frame (12-16 ms a frame). The step's
  // drawing is made at the step's own time (t = F / 12), so it is the same
  // whichever frame of the step makes it, and identical to drawing it
  // directly. Blend-mode draws (the firelight pools, the torch's light)
  // stay on the frame. Each cache's canvas comes from e.cache(), so the stage
  // frees it with the shot's plates when the shot leaves residency; the
  // bookkeeping (step, scale, view, used size) lives in the shot's state.
  const box = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, add(a, b, c, d) { if (a < this.x0) this.x0 = a; if (b < this.y0) this.y0 = b; if (c > this.x1) this.x1 = c; if (d > this.y1) this.y1 = d; } });
  const stepOf = (e, lag = 0) => (e.reduced ? -1 : Math.max(0, Math.floor((e.t - lag) * 12 + 1e-4)));
  const stepEnv = (e, F) => { if (F < 0 || TUNE.stepT === false) return { ...e }; const t = F / 12; return { ...e, t, T: e.T - e.t + t, u: clamp(t / DUR), q: (fps = 12) => Math.floor(t * fps + 1e-6) / fps }; };
  // lag (s): the cache shows each step that much later (its re-render lands
  // on another frame of the step than the other caches'; its content is
  // still the step's own)
  function cached(ctx, e, key, extent, paint, lag = 0) {
    const m = TUNE.cache && e.st && e.cache && ctx.getTransform ? ctx.getTransform() : null;
    if (!m || !(m.a > 0) || Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9 || Math.abs(m.d - m.a) > m.a * 1e-6) { paint(ctx, stepEnv(e, stepOf(e, lag))); return; }
    const s = m.a, v = e.view, F = stepOf(e, lag);
    const K = e.st[key] ??= { cv: null, g: null, F: null, uW: 0, uH: 0, cw: 0, ch: 0 };
    const fits = K.F === F && K.red === e.reduced && Math.abs(K.s - s) <= K.s * 0.02 && K.v0 <= v.ox && K.v1 <= v.oy && K.v2 >= v.ox + v.vw && K.v3 >= v.oy + v.vh;
    if (!fits) {
      const mx = v.vw * 0.03 + 4 / s, my = v.vh * 0.03 + 4 / s;
      const V = [v.ox - mx, v.oy - my, v.ox + v.vw + mx, v.oy + v.vh + my];
      const e2 = stepEnv(e, F);
      e2.view = { ...v, ox: V[0], oy: V[1], vw: V[2] - V[0], vh: V[3] - V[1] };
      const R = extent(e2);
      const x0 = Math.max(V[0], R.x0), y0 = Math.max(V[1], R.y0), x1 = Math.min(V[2], R.x1), y1 = Math.min(V[3], R.y1);
      K.F = F; K.red = e.reduced; K.s = s; [K.v0, K.v1, K.v2, K.v3] = V;
      K.empty = !(x1 > x0 && y1 > y0);
      if (!K.empty) {
        const dx0 = Math.floor(s * x0 + m.e), dy0 = Math.floor(s * y0 + m.f);
        const W = Math.ceil(s * x1 + m.e) - dx0, H = Math.ceil(s * y1 + m.f) - dy0;
        // The canvas comes from e.cache (stage.js), so the stage frees it with
        // the shot's plates: round 5 kept it in e.st, and about 4.9 Mpx (20 MB)
        // of crowds stayed alive after s08 left residency, which is what iOS
        // Safari's canvas budget counts. It still grows only, with slack, so a
        // growing extent does not reallocate (allocating is slow in WebKit):
        // the size asked for is the running maximum.
        const cw = Math.max(K.cw || 0, Math.max(W, Math.ceil(W * 1.15) + 8)), chh = Math.max(K.ch || 0, Math.max(H, Math.ceil(H * 1.15) + 8));
        const cv = e.cache('s08:' + key, cw, chh);
        if (cv !== K.cv || cv.fresh) { K.cv = cv; K.g = cv.getContext('2d'); K.cw = cv.width; K.ch = cv.height; }
        const g = K.g;
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        if (!cv.fresh) g.clearRect(0, 0, Math.max(W, K.uW), Math.max(H, K.uH));   // a fresh canvas is already blank
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = ctx.imageSmoothingQuality || 'medium';
        g.setTransform(s, 0, 0, s, m.e - dx0, m.f - dy0);
        g.save(); paint(g, e2); g.restore();
        K.uW = W; K.uH = H; K.x0 = (dx0 - m.e) / s; K.y0 = (dy0 - m.f) / s;
      }
    }
    if (!K.empty) ctx.drawImage(K.cv, 0, 0, K.uW, K.uH, K.x0, K.y0, K.uW / K.s, K.uH / K.s);
  }


  // ---- crowd glyph warm-up. crowd() draws each glyph size into an atlas
  // the first time it is used, which made the first frame of the shot
  // spike. The heights this shot draws are known from the camera, so the
  // atlas is built during the bake with figures.js warmCrowd(): a few raw
  // steps of ~2.5 ms, spread over the frames of s06/s07. The same goes for
  // the other first-use caches of the opening frame: the flame shapes of
  // every fire, Agamemnon and the galleys, drawn once onto a scratch canvas.
  // The height range is computed once, here (no layer's record does layout):
  // the nearest glyphs only grow as the river nears the camera, and the
  // farthest stand at the ships' end of the routes, so three moments bound
  // them (warmSteps' margins, lo x 0.8 and hi x 1.06, cover the rest).
  let HR = null;
  const heightRange = () => HR ??= (() => {
    let lo = Infinity, hi = 0;
    for (const t of [0, DUR / 2, DUR]) for (const list of membersAt(t)) for (const m of list) { lo = Math.min(lo, m.h); hi = Math.max(hi, m.h); }
    return [lo, hi];
  })();
  heightRange();
  function warmSteps(p) {
    // p.k is the bake scale of a depth-1 layer: the densest device px per
    // unit of the shot (the end of the push-in); the opening frame is ~0.82 of it
    const [lo, hi] = heightRange();
    const o = { px: [lo * p.k * 0.8, hi * p.k * 1.06], night: true, kinds: ['greek', 'greekRed', 'torch'], dirs: [1, -1], stand: false, budget: 2.5 };
    for (let i = 0; i < 14; i++) p.raw(() => { warmCrowd({}, o); });
    p.raw((ctx) => { warmCrowd({}, { ...o, budget: 50, ctx }); });   // and upload the atlas textures
    const fake = (t) => ({ s: p.k * 0.84, t, T: t, u: 0, dur: DUR, night: true, reduced: false, wall: t, dpr: 1, q: (fps = 12) => Math.floor(t * fps) / fps, view: { ox: -1e4, oy: -1e4, vw: 3e4, vh: 3e4, s: p.k * 0.84 } });
    // the flame shapes of every fire at three moments, one side a step (each
    // step stays well under 8 ms in WebKit)
    for (const t of [0, 0.5, 1.6]) for (const side of [0, 1]) p.raw(() => {
      scratch ??= Object.assign(document.createElement('canvas'), { width: 2, height: 2 }).getContext('2d');
      flames(scratch, fake(t), fireSpecsAt(t, false)[side].all);
    });
    p.raw(() => {
      const e = fake(0), A = agaAt(0);
      agamemnon(scratch, e, { x: A.x, y: A.y, h: AGA_H * A.k, dir: 1, pose: 'run', planted: true, phase: 0, torch: true, hero: true, shadow: true });
      for (const s of SHIPS) galley(scratch, e, { x: 0, y: 0, s: s[2] * 0.9, dir: -1, sail: 'white', furl: 0.9, crew: true, oars: 0 });
    });
    // the light paths of every fire (six fires a step), the street and the
    // houses (the hit's third drawing), so no frame builds a Path2D
    for (let i = 0; i < FIRES.length; i += 6) p.raw(() => { for (const f of FIRES.slice(i, i + 6)) lightPaths(f); });
    p.raw(() => { streetPath(); });
    p.raw(() => { cityPath(); hitPath(); dimPath(); });
    // finally every actor once at t = 0: compiles their code paths and
    // leaves the opening frame's army and fire specs in the on-twos caches
    for (const it of SHOT.items) if (it.actor) p.raw(() => { it.draw(scratch, fake(0)); });
  }

  const SKY = { top: '#030a3e', mid: '#071460', low: '#0c1d74' };
  // the near city lies in the shadow of the smoke: a navy foreground that
  // frames the moonlit street (and sits under the caption)
  // the dimmed lights land at 0.36-0.49 (oblique faces, STREET_DIM's dark navy), 0.58-0.66
  // (the faces the moon would light, its lighter navy) and 0.95+ (copings, lips, ridges);
  // shadows and windows stay navy-black (standard 19), and the band is modelled, not a bed
  // (standard 24)
  const DIM = (b) => (b.zc < (TUNE.dimZc ?? DIM_ZC) ? 0.72 : 1);
  const SHIPS = [[-120, 520, 0.9], [-20, 560, 0.85], [90, 600, 0.8], [210, 630, 0.75], [330, 650, 0.7], [460, 670, 0.66], [600, 690, 0.62]];
  const k1 = (r) => ({ ...r, ease: 'inOutSine' });

  const SHOT = {
    id: 's08', dur: DUR, night: true,
    caption: 'TROY BURNS',
    captionPos: 'bottom', captionPosPortrait: 'bottom',
    reducedT: 1.0,            // the camera holds the wide framing (moon, sky, gate, street); the army and fires hold REDUCED_T
    cam: [{ t: 0, ...O.cam0 }, { t: DUR, ...k1(O.cam1) }],
    camPortrait: [{ t: 0, ...O.camP0 }, { t: DUR, ...k1(O.camP1) }],
    items: [
      { layer: 'far', depth: 1, paint(p) {
        sky(p, { y0: -700, y1: CAM.hy + 2, ...SKY });
        moon(p, { x: O.moon.x, y: O.moon.y, r: O.moon.r });
        streaks(p, { x0: 200, x1: 1800, y: CAM.hy - 12, depth: 14, count: 22, seed: 's08st', scale: 0.7 });
        // the cloud bank on the horizon that s07's open gate showed, lit by the
        // moon (at x 1000): from the upper right for the bank left of it, from
        // the upper left for the one right of it (standard 7)
        cumulus(p, { x: 430, y: CAM.hy - 1, w: 270, h: 50, towers: 2, seed: 's08-bank', light: [0.5, -0.6], detail: 0.7 });
        cumulus(p, { x: 1390, y: CAM.hy - 1, w: 190, h: 36, towers: 1, seed: 's08-bank2', light: [-0.9, -0.4], detail: 0.7 });
        // the sea to the beach, then the moonlit plain down to the wall
        const shore = [];
        for (let x = -900; x <= 1400; x += 15) {
          if (CAM.view(x, SHORE(x))[1] < 60) continue;
          const q = P(x, 0, SHORE(x));
          if (q[0] > -500 && q[0] < 2100) shore.push(q);
        }
        shore.unshift([-500, shore[0][1]]); shore.push([2100, shore[shore.length - 1][1]]);
        const yS = Math.max(...shore.map((q) => q[1]));
        // passes cover only what the camera sees (a wide guide is the slow
        // unit in WebKit): the views span about x -60..1660 over the shot
        const X0 = Math.max(-500, p.region.x - 10), X1 = Math.min(2100, p.region.x + p.region.w + 10);
        sea(p, { horizon: CAM.hy, bottom: yS + 20, x0: X0, x1: X1, lHorizon: 0.62, lMid: 0.44, lBottom: 0.36, glints: [{ x: O.moon.x, y: CAM.hy + 16, rx: 240, ry: 28, a: 0.9 }] });
        p.pass(p.mat.sand, (g) => {
          g.beginPath(); g.moveTo(-400, 2200);
          for (const [x, y] of shore) g.lineTo(x, y);
          g.lineTo(2100, 2200); g.closePath();
          const y0 = Math.min(...shore.map((q) => q[1]));
          // The moonlit plain, as plate 5's beach. Two things have to be true at
          // once, and round 5 had neither: the field must be INSIDE N.sand's
          // hatch band (lo 0.45, hi 0.90), which carries the beach's drift
          // strokes, and it must STRADDLE N.sand's top threshold (0.8), so the
          // sand's own break-up leaves mid-tone drifts in the paper-white
          // instead of one flat field. Round 5 painted it at 0.93-0.95 - above
          // the band and well over the threshold - and the largest calm field
          // in the shot read as blank paper (hp_std 9.6 and 1% dark in the
          // judge's box, against plate 5's beach 30.7 and 14%). TUNE.plain is
          // the inland value; the 40 units nearest the water sit a little
          // higher, so the drift gathers along the shore.
          const lg = g.createLinearGradient(0, y0, 0, y0 + 260);
          const pl = TUNE.plain;
          lg.addColorStop(0, L(pl + 0.03)); lg.addColorStop(0.1, L(pl + 0.01)); lg.addColorStop(0.19, L(pl - 0.01)); lg.addColorStop(1, L(pl));
          g.fillStyle = lg; g.fill();
          // Wind drifts right across the plain: broad bands of sand a little
          // under and over the field's own light, following the shore's curve
          // inland, so N.sand's strokes gather in drifts over the whole plain
          // instead of only along the water, and the field carries mid-tone
          // patches as plate 5's beach does. Light values only (standard 18).
          {
            const rd = new RNG('s08-drift');
            for (const [d0, d1, dl] of [[16, 62, -0.035], [78, 128, 0.02], [150, 214, -0.028], [240, 300, 0.016]]) {
              const w0 = rd.range(0.8, 1.25), w1 = rd.range(0.8, 1.25), ph = rd.range(0, 6.3);
              const zOf = (x, d, w, ph2, a2) => SHORE(x) - d * w * (1 + a2 * Math.sin(x / (a2 > 0.2 ? 140 : 110) + ph2));
              const top = [], bot = [];
              // only the x where BOTH edges of the band are in front of the camera
              // (the same near-plane guard as the shore: a point behind it projects
              // through the frame and would wrap the band over the sea)
              for (let x = -900; x <= 1400; x += 25) {
                const za = zOf(x, d0, w0, ph, 0.22), zb = zOf(x, d1, w1, -ph, 0.18);
                if (CAM.view(x, za)[1] < 60 || CAM.view(x, zb)[1] < 60) continue;
                top.push(P(x, 0, za)); bot.push(P(x, 0, zb));
              }
              if (top.length < 2) continue;
              g.fillStyle = L(clamp(pl + dl, 0.05, 1));
              g.beginPath();
              top.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
              for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
              g.closePath(); g.fill();
            }
          }
          // the trampled road out of the gate, and the wet line of the beach
          g.fillStyle = L(0.5);
          for (const R of ROUTES) {
            g.beginPath();
            const n = R.pts.length;
            for (let i = 0; i < n; i++) { const [x, z] = R.pts[i]; const q = P(x - 3.2, 0, z); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
            for (let i = n - 1; i >= 0; i--) { const [x, z] = R.pts[i]; const q = P(x + 3.2, 0, z); g.lineTo(q[0], q[1]); }
            g.closePath(); g.fill();
          }
          g.fillStyle = L(0.97);
          g.beginPath(); shore.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          for (let i = shore.length - 1; i >= 0; i--) g.lineTo(shore[i][0], shore[i][1] + 2.2);
          g.closePath(); g.fill();
        }, { bbox: { x: X0, y: Math.min(...shore.map((q) => q[1])) - 4, w: X1 - X0, h: Math.max(...[[-60, 0], [60, 0], [0, WD]].map(([x, z]) => P(x, 0, z)[1])) + 40 - Math.min(...shore.map((q) => q[1])) } });
        paintPassage(p, LAY);
      } },
      { actor: 'outside', depth: 1, draw(ctx, e) { cached(ctx, e, 'outside', outsideExtent, drawOutside, 2 / 60); } },
      { layer: 'back', depth: 1, paint(p) {
        paintStreet(p, LAY, (b) => !LEFT(b), { ground: [-340, 340, -150, 0], scars: SCARS.filter((f) => !f.near), dim: DIM, courseLift: -0.105 });
      } },
      { actor: 'fires', depth: 1, draw(ctx, e) {
        // drawn on every frame: kit/fx.js caches each flame cluster and smoke
        // column at its own phase of the step, so their re-renders spread
        // over the frames (in one cache of their own they would all land on
        // the step's first frame: 15-20 ms in WebKit)
        const S = fireSpecs(e)[0];
        firePools(ctx, e, S);
        fireBody(ctx, e, S, false);
        const b = e.reduced || SKIP('e') ? 0 : hit(e.t * 0.6);
        if (!SKIP('e')) embers(ctx, e, { x: 900, y: 600, w: 1100, h: 520, count: 40, seed: 's08em', wind: WIND * 0.8 });
        if (b > 0.02) for (const f of S.all) if (f.f.big) embers(ctx, e, { x: f.x, y: f.y, w: f.w0 * 2.2, h: f.w0 * 5, count: Math.round(34 * b), seed: f.seed, wind: WIND, size: 1.3 });
      } },
      { actor: 'army', depth: 1, draw(ctx, e) {
        // Agamemnon runs out in front of his men, his torch held high; its
        // light falls on the paving just ahead of him in two hard warm bands
        // (brick-vermilion on the pale street), under the column and the king,
        // so his vermilion cloak stays on moonlit ivory. A multiply: drawn on
        // the frame; the column and the king are cached per step.
        const A = agaAt(tOf(e)), h = AGA_H * A.k;
        ctx.save(); ctx.clip(streetPath());
        glow(ctx, e, { x: A.x + h * 0.8, y: A.y + h * 0.02, r: h * 0.8, sy: 0.62, mode: 'warm', strength: 1, bands: 2, facets: 9, seed: 77, flicker: 0.12 });
        ctx.restore();
        cached(ctx, e, 'army', armyExtent, drawArmy);
      } },
      { layer: 'near', depth: 1, paint(p) {
        paintStreet(p, LAY, LEFT, { scars: SCARS.filter((f) => f.near), dim: DIM, courseLift: -0.105 });
        warmSteps(p); // build the crowd glyphs for this shot's sizes during the bake
      } },
      { actor: 'nearFires', depth: 1, draw(ctx, e) { const S = fireSpecs(e)[1]; firePools(ctx, e, S); fireBody(ctx, e, S, true); } },
    ],
    // The hit on the drop: the city flushed with red firelight under the
    // moonlit sky (standard 35: the sky, the sea, the plain and the moon keep
    // their colours on every frame; hitPath).
    //   ONE multiply of a warm filter per drawing (two drawings at full
    // strength, then one faded toward white as the flash sinks into the fires,
    // whose light floods wide and recedes over the next half second), then the
    // hue pass. Round 5 multiplied by a deep vermilion TWICE, which took the
    // city from 454 to 195 of its 16-level tone bins and its p90 from 219 to
    // 68 for 0.23 s: the ivory copings and walls that carry the town's
    // modelling went to red-black and the frame that opens chapter IV was a
    // flat field, which style rule 3 forbids. The lighter single multiply
    // keeps ivory at vermilion-salmon and navy at red-black, which is what
    // standard 21 asks firelight on stone to do.
    //   The hue pass runs at full alpha (a PARTIAL red over navy mixes to
    // plum, standard 15), so the city's drawing survives as luminance: the
    // multiply is what has to leave the register intact.
    post(ctx, e) {
      const v = e.view, s = e.s;
      if (e.reduced) {
        // Reduced motion: no flash, no 12 fps stepping and no hue swap, but the
        // film's loudest beat is not silent either (round 5 returned here and
        // the drop passed with the frame unchanged, while s10 keeps a soft
        // pulse on its beats). One eased NEUTRAL dip over the city - the same
        // kind of accent as s10's - held for 0.38 s and gone: a grey multiply
        // changes no hue at all, where the warm filter at this strength leaves
        // the ivory stone in the dusty-pink band standard 21 forbids (measured
        // 12.3% rose at 0.42 of the filter). Every 60 fps step is under 0.4 L.
        if (e.t >= HIT.redDur) return;
        const q = 255 * (1 - HIT.redA * Math.pow(1 - e.t / HIT.redDur, 1.5));
        ctx.save();
        ctx.setTransform(s, 0, 0, s, -v.ox * s, -v.oy * s);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${q},${q},${q})`;
        ctx.fill(hitPath());
        ctx.restore();
        return;
      }
      if (e.t >= HIT.dur) return;
      const f = Math.floor(e.t * 12), path = hitPath();
      ctx.save();
      ctx.setTransform(s, 0, 0, s, -v.ox * s, -v.oy * s);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = warmHit(TUNE.hitQ * (f < 2 ? 1 : HIT.fade));   // the last drawing a little weaker
      ctx.fill(path);
      // then pull every pixel onto vermilion's HUE, keeping its own
      // saturation and luminosity: the navy houses go red-black (nothing is
      // left to mix to plum, standard 15) while the ivory copings and walls
      // keep the town's modelling as salmon of their own value. ('color'
      // replaces the saturation too, which is what collapsed the city to a
      // single hue-and-value ramp: 195 of its 16-level tone bins.)
      if (TUNE.hitMode !== 'off') { ctx.globalCompositeOperation = TUNE.hitMode; ctx.fillStyle = C.red; ctx.fill(TUNE.hitMode === 'color' ? dimPath() : path); }
      ctx.restore();
    },
  };
  SHOT.layout = LAY;     // for probes and test plates
  SHOT.fires = FIRES;
  return SHOT;
}

export default makeS08();
