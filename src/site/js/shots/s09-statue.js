// IX · TROY BURNS — the sacred statue falls. Night and fire before the temple
// of Athena: the city burns on both flanks, black against its own red glow,
// and smoke climbs past the moon. Tiny Greeks haul on ropes looped round the
// colossal Athena, who stands forward on the stylobate before the black
// pronaos. The ropes snap taut (0-0.4 s), she rocks, then topples slowly to
// the right across the porch while the haulers step back, and hits the floor
// on the grid beat 76 (global 42.61, local 2.25): navy-black dust bursts up
// all along her length, chips of stone fly, embers spray, the fires flare,
// the camera shakes and the haulers tumble or cheer. The dust behind her
// thins, the low skirt in front settles, and she lies moonlit on the porch.
// On phones the temple roof burns behind the pediment.
//
// Light (STYLE rule 6, standards 5 and 15): moonlight on ivory stone; the
// fires' light is baked into the stone layers as posterised warm multiply
// bands (C2's glow 'warm'); the low sky steps from navy through a navy-black
// haze into opaque bands of the red ramp; nothing additive over navy.
//
// The temple is B's front elevation (kit/temple.js, statue:false); the figure
// is B's Athena sprite (athenaSprite part 'figure', anchor at the feet), the
// plinth is painted separately. A 2D rotation about the front edge of her
// feet clears the columns because she stands in front of them; the steps are
// repainted as an occluder so the parts of the fallen figure that would sink
// below the porch floor (the shield) hide behind the stylobate's edge.

import { sky, moon } from '../kit/nature.js';
import { templeOfAthena, houses, layoutHouses, paving, floorStone, cityStone, nightStreaks, shadowPainter } from '../kit/temple.js';
import { cityOfTroy, cityLayout, silhouetteMat } from '../kit/city.js';
import { ATHENA, athenaSprite, paintAthena } from '../assets/athena.js';
import { flames, smoke, embers, glow } from '../kit/fx.js';
import { hoplite, stride } from '../kit/figures.js';
import { N, mat } from '../kit/palette.js';
import { L, makeCanvas } from '../engine/bake.js';
import { RNG, clamp, ease, span } from '../engine/rng.js';
import { beatAt, START } from '../story.js';

const DUR = 4.5;
const T_TIGHT = 0.4;           // ropes snap taut
// impact on the grid beat nearest the old 42.63: beat 76, a downbeat (global 42.61, local 2.25)
const T_HIT = beatAt(76) - START.s09;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ layout
// centre, ground at the foot of the steps; the steps are s05's (the same
// temple): broad moonlit treads over lit risers, one ink line per step
const TEMPLE = { x: 640, y: 812, s: 1.2, treadShare: 0.5, riserLight: [0.72, 0.76], stepJoints: true };
// the flight's own stone, as s05's: finer marks, so the stairs read calm and bright
const stepsMat = (p) => cityStone(p, { crack: 0.45, markScale: 0.6 });
const GROUND = TEMPLE.y;

// Measure the temple without painting (a dry painter records nothing), so
// actors know the statue anchor and the stylobate before any bake runs.
const DRY = new Proxy({ night: true, mat: N, px: 1, k: 1, L, frame: 0, time: 0, shot: null, kind: 'layer', region: { x: -4000, y: -4000, w: 8000, h: 8000 }, rng: new RNG('s09-dry') }, {
  get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? () => DRY : undefined),   // any recording method is a no-op
});
const TL = templeOfAthena(DRY, { ...TEMPLE, statue: false });
const STY = TL.sty;                              // porch floor
const SS = TL.statue.s;                          // statue scale (world units per sprite unit)
const PLH = ATHENA.plinth.h * SS;                // plinth height in world units
const FEET = { x: TL.statue.x, y: STY - PLH };   // the figure stands on the plinth
// the fall pivots on the front (right) edge of the hem
const PV = [78, 0];                              // pivot in figure units (origin at the feet, y up negative)
const PIV = { x: FEET.x + PV[0] * SS, y: FEET.y };
const ROT_END = 1.77;                            // rest angle: helmet and arm on the floor, feet on the plinth (~101°)

// statue angle over shot time
function statueRot(t) {
  let r = 0;
  // the ropes snap taut and she rocks on her base
  if (t > 0.12 && t < 1.0) r += 0.016 * Math.sin((t - 0.12) * TAU * 2.2) * Math.exp(-(t - 0.12) * 3.2);
  if (t > T_TIGHT) r += ROT_END * Math.pow(clamp((t - T_TIGHT) / (T_HIT - T_TIGHT)), 2.15);
  if (t > T_HIT) {            // a hard rebound off the floor, then still
    const k = t - T_HIT;
    if (k < 0.2) r -= 0.045 * Math.sin((k / 0.2) * Math.PI);
    else if (k < 0.33) r -= 0.012 * Math.sin(((k - 0.2) / 0.13) * Math.PI);
  }
  return r;
}

// the firelight surge at the impact: up fast, then rings out over ~0.4 s
// (kept small under reduced motion)
const surge = (e) => (e.t > T_HIT ? Math.exp(-(e.t - T_HIT) / 0.38) * (e.reduced ? 0.35 : 1) : 0);

// figure-local point (feet origin, y up negative) -> world, at angle rot
function figPt(lx, ly, rot) {
  const dx = (lx - PV[0]) * SS, dy = (ly - PV[1]) * SS;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [PIV.x + dx * c - dy * s, PIV.y + dx * s + dy * c];
}

// ------------------------------------------------------------------ city and fire
const HOUSES_L = { x0: -620, x1: 230, y: 790, h: [130, 230], w: [120, 190], win: 12, seed: 's09-hL', roofs: 'flat' };
const HOUSES_R = { x0: 1130, x1: 2300, y: 790, h: [100, 210], w: [120, 210], win: 12, seed: 's09-hR' };
const HL = layoutHouses(HOUSES_L), HR = layoutHouses(HOUSES_R);
// (x0..x1 spans what a 2.5:1 screen can show; wider only costs bake time)
const CITY = { x0: -360, x1: 1960, y: 760, depth: 190, rows: 3, seed: 's09-city', dark: 1, fireRate: 0.34, bottom: 800, scale: 1.5, acropolis: null };
const CL = cityLayout(CITY);

const R = new RNG('s09-fires');
// far roofs burning on the black skyline (depth 0.7)
// (only the ones that show: not behind the temple, and rising above the near
// houses; the rest would cost a flame build every frame for nothing)
const houseTop = (x) => {
  let top = Infinity;
  for (const [lay, y] of [[HL, HOUSES_L.y], [HR, HOUSES_R.y]]) for (const hs of lay.list) if (x > hs.x && x < hs.x + hs.w + hs.side) top = Math.min(top, y - hs.h);
  return top;
};
const FAR_FIRES = CL.fires
  .map((f) => ({ x: f.x, y: f.y, w: f.w * 1.1, h: f.h * 1.3, seed: f.seed, wind: 0.22, intensity: 0.9, lod: 'small' }))
  .filter((f) => (f.x + f.w / 2 < TL.bbox.x + 70 || f.x - f.w / 2 > TL.bbox.x + TL.bbox.w - 70) && f.x > -420 && f.x < 2050 && f.y - f.h * 0.8 < houseTop(f.x) - 4);
// The flanks: the roofs beside the temple burn, and most of the OUTER ones are
// still intact (standard 21 and 1: the fire is local to the temple and the
// vermilion stays an accent, so there is moonlit ivory house front in frame on
// both sides; round 5 lit both flanks end to end, 93-95% red).
function roofFires(lay, y, side) {
  const out = [];
  for (const hs of lay.list) {
    const far = Math.abs(hs.x + hs.w / 2 - TEMPLE.x) > 620;
    if (R.chance(0.6) && far) continue;
    const top = y - hs.h - (hs.roof === 'gable' ? hs.w * 0.2 : 0);
    const near = side < 0 ? clamp((hs.x + hs.w + 200) / 400) : clamp(1 - (hs.x - 1130) / 700);
    const n = 1 + (R.chance(0.5) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const w = hs.w * R.range(0.35, 0.7);
      out.push({ x: hs.x + hs.w * R.range(0.25, 0.75), y: top + 2, w, h: w * R.range(1.1, 1.9) * (0.8 + 0.6 * near), seed: R.int(1, 1e9), wind: 0.25, intensity: 0.85 + 0.25 * near });
    }
  }
  return out;
}
const FIRES_L = roofFires(HL, HOUSES_L.y, -1).filter((f) => f.x + f.w * 0.6 < TL.bbox.x + 40);
const FIRES_R = roofFires(HR, HOUSES_R.y, 1).filter((f) => f.x < 2000);
const FLANK_FIRES = [...FIRES_L, ...FIRES_R];
// broad merged columns (as in s08), not single-file chains of billows
const SMOKES = [
  { x: 60, y: 600, w: 160, h: 700, seed: 11, drift: 0.3, ph: 0 },
  { x: 985, y: 640, w: 140, h: 720, seed: 13, drift: 0.3, ph: 0.0283 },   // rises behind the temple's corner: the sky by the moon stays open
  { x: 1720, y: 620, w: 180, h: 760, seed: 14, drift: 0.26, ph: 0.0566 },  // at the right edge (wide screens see all of it)
];

// The temple roof burns behind the pediment. It is drawn only when the view
// reaches above the cornice: the tall phone framing (and 4:3 screens) show
// it, 16:9 never sees above y ~62. So on phones the shot still says 'Troy
// burns': flames along the raking cornice, one at the corner, a smoke column
// climbing into the clear sky and a red glow behind them.
const PED_H = TL.entTop - TL.apex;
const cornY = (x) => TL.entTop - PED_H * (1 - Math.abs(x - TEMPLE.x) / (TL.half + 5)) - 2;
const ROOF_FIRES = [
  { x: 548, w: 60, h: 120, seed: 9001 },
  { x: 760, w: 84, h: 196, seed: 9002 },
  { x: 880, w: 90, h: 172, seed: 9003 },
  { x: 1010, w: 72, h: 140, seed: 9004 },
].map((f) => ({ ...f, y: cornY(f.x), wind: 0.25, intensity: 1 }))
  .concat([{ x: TEMPLE.x + TL.half - 30, y: TL.entTop, w: 70, h: 150, seed: 9005, wind: 0.25, intensity: 0.95 }]);
const ROOF_SMOKE = { x: 1000, y: cornY(1000) - 24, w: 120, h: 560, seed: 17, drift: 0.28 };   // from the roof's right corner: the sky over the apex stays open

// The burning cella seen through the door (B1's doorway: 0.62 of the central
// bay wide, 0.86 of the column height tall): five ragged-based flames on its
// floor, the middle three behind the plinth (they show above it and above her
// once she has fallen), one each side of it, licking up to about 3/4 of the door.
const CELLA = (() => {
  const dw = (TL.cols[2] - TL.cols[1]) * 0.62, dh = TL.colH * 0.86;
  return { x0: TEMPLE.x - dw / 2, x1: TEMPLE.x + dw / 2, y0: STY - dh, dw, dh };
})();
const CELLA_FIRES = [[552, 40, 210], [594, 62, 300], [642, 70, 330], [690, 60, 280], [729, 38, 200]]
  .map(([x, w, h], i) => ({ x, y: STY - 2, w, h, seed: 9100 + i, wind: 0.1 * (i % 2 ? 1 : -1), intensity: 0.95, ragged: true }));

// ------------------------------------------------------------------ the crew
// Ropes looped round the statue (figure units) and the teams hauling them.
// Each team stands on the plaza in a line that recedes toward the camera.
// team: landscape positions [x, y (feet), h]; teamP: the tall phone framing,
// where the teams stand closer so they share the frame with the statue.
const ROPES = [
  { at: [14, -528], cloak: ['red', 'navy', 'red'],
    team: [[1046, 848, 49], [1098, 864, 50], [1150, 880, 51]], teamP: [[880, 912, 56], [934, 924, 57], [988, 936, 58]] },
  { at: [2, -530], cloak: ['navy', 'red', 'navy'],
    team: [[1200, 838, 47], [1250, 846, 48], [1300, 854, 48]], teamP: [[960, 890, 52], [1010, 897, 53], [1060, 904, 53]] },
  { at: [62, -470], cloak: ['navy', 'red'],
    team: [[1346, 852, 48], [1396, 862, 49]], teamP: [[790, 930, 58], [846, 944, 59]] },
  { at: [6, -330], cloak: ['red', 'navy'],
    team: [[1444, 842, 47], [1492, 848, 47]], teamP: [[1040, 942, 59], [1094, 954, 60]] },
];
// the loops drawn on her (figure units): [x, y, half width] at the neck
// (ropes 0 and 1 share it), the chest and the waist. `map` takes a point of the
// standing figure's frame into the frame the ctx is in, so the same three bands
// lie round the fallen carving after the swap.
const LOOPS = [[8, -528, 36], [62, -470, 50], [6, -330, 54]];
function statueLoops(ctx, map) {
  ctx.lineCap = 'round';
  for (const [lx, ly, hw] of LOOPS) {
    for (const [col, lw, d] of [['#140d0a', 8.4, 0], ['#b9ab92', 3, -1]]) {
      const a = map(lx - hw, ly + 4 + d), b = map(lx, ly + 26 + d), c = map(lx + hw, ly - 6 + d);
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke();
    }
  }
}
// rest length of each rope's first span, measured when the ropes snap taut
const restLen = (r, m) => { const a = figPt(r.at[0], r.at[1] + 8, 0); return Math.hypot(m[0] - a[0], m[1] - 0.6 * m[2] - a[1]) - 4; };
for (const r of ROPES) { r.len = restLen(r, r.team[0]); r.lenP = restLen(r, r.teamP[0]); }
const isPortrait = (e) => e.W / e.H < 0.82;      // the stage's own test for camPortrait

// Where a hauler stands and what he does at time t. They haul stepping
// backward on D1's 'haul' gait: the phase is the distance stepped back over
// stride(h, 'haul'), so the planted feet never slide. Each stretch is a
// whole number of steps, so a hauler stops in double support (both feet
// down) before he changes pose; every step phase is chosen so that this
// last haul step ends with the NEAR foot forward (phase 0.5), as in the
// poses that follow, and each new pose is shifted under him so his planted
// feet stay where they are (FOOT). No drawing pops.
const PULL_STEPS = 2;          // steps back while hauling (0.2-1.6 s)
const T_SLACK = 1.45;          // the ropes go slack as she goes over
const STAGGER = 0.42;          // seconds per stagger step (eased out: a lurch back, then a stop)
const T_REC = 0.3;             // the standers straighten up from the haul lean (3-4 drawings, D1's o.lean)
const FALL0 = 0.5;             // the fallers' first 'fall' drawing is already tilted back about 0.36 rad (fall k)
// Foot positions (x per unit of height, dir -1, hip at x 0; [near, far]) of
// the poses the haulers pass through, measured once from figures.js.
const FOOT = (() => {
  const E = { t: 0, T: 0, wall: 0, s: 1, dpr: 1, reduced: false, night: true, q: () => 0 };
  const fig = (pose, phase) => hoplite(null, E, { x: 0, y: 0, h: 100, dir: -1, pose, phase, cloak: 'red', shield: false, spear: false, measure: true });
  const at = (pose, phase) => { const o = fig(pose, phase); return o && o.feet ? o.feet.map((f) => f[0] / 100) : [0, 0]; };
  const hand = (pose, phase, d) => { const o = fig(pose, phase); return o && o.hands ? [o.hands[0][0] / 100, o.hands[0][1] / 100] : d; };
  return { haul: at('haul', 0.5), walk: at('walk', 0), lift: at('lift', 0), lift1: at('lift', 1), fall: at('fall', FALL0),
    grip: hand('lift', -1, [-0.25, -0.68]),        // the chest grip (near hand at 'lift' -1)
    side: hand('walk', 0, [-0.05, -0.45]) };       // the hand at his side (walk contact pose)
})();
// Once the standers have straightened up they let go of the slack rope (the
// cheerers as their arms start up): it falls from the hand to the plaza.
const T_DROP = 0.32;
// the torso lean of the last haul drawing (phase 0.5) and of the poses that follow (figures.js 'haul', 'walk', 'lift' -1)
const LEAN = { haul: -0.5 - 0.1 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * (0.5 - 0.12))), walk: 0.05, grip: 0.18 };
const mid = (f) => (f[0] + f[1]) / 2;
function hauler(t, ri, j, m) {
  const [x0, y, h] = m;
  const lead = j === 0;
  const seed = ri * 7 + j;
  const faller = lead && (ri === 0 || ri === 2);
  const S = stride(h, 'haul');
  const off = faller ? 0.5 : ((ri + j) % 2) * 0.5;
  // whole steps of stagger when the rope goes slack, so the last one ends at
  // phase 0.5: the leads 2, the rest of the crew 1 or none
  const nSlack = faller ? 0 : lead ? 2 : off ? 0 : 1;
  const tStop = nSlack ? T_SLACK + STAGGER * nSlack : 1.6;   // standing still again (the pull itself ends at 1.6)
  const dPull = 0.5 * S * PULL_STEPS * ease.inOut(span(t, 0.2, 1.6));
  const dSlack = nSlack ? 0.5 * S * nSlack * ease.outQuad(span(t, T_SLACK, tStop)) : 0;
  const x = x0 + j * 2 + dPull + dSlack;
  if (faller && t > T_SLACK) {
    // he loses the rope and goes straight over backward from his haul lean,
    // faster and faster
    const u = span(t, T_SLACK, 1.92);
    return { x: x + (mid(FOOT.haul) - mid(FOOT.fall)) * h, y, h, pose: 'fall', phase: FALL0 + (1 - FALL0) * Math.pow(u, 1.35) };
  }
  if (t < tStop || t < T_SLACK) return { x, y, h, pose: 'haul', phase: (off + (dPull + dSlack) / S) % 1 };
  // The rope gone, he straightens up from the haul lean over 3-4 drawings
  // (an additive lean that eases to 0), his feet where they were. Most of
  // them keep their grip on the slack rope at the chest ('lift' phase -1,
  // crouched) and fling their arms up cheering after the hit; the rest drop it
  // and stand feet apart (the walk's contact pose, unmoving).
  const cheer = seed % 3 !== 1;
  const F = cheer ? FOOT.lift : FOOT.walk;
  const xs = x + (mid(FOOT.haul) - mid(F)) * h;
  const rec = 1 - ease.inOutSine(span(t, tStop, tStop + T_REC));
  const drop = (t0, hd) => ({ x: xs + hd[0] * h, y: y + hd[1] * h, k: t > t0 ? span(t, t0, t0 + T_DROP) : -1 });
  if (!cheer) return { x: xs, y, h, pose: 'walk', phase: 0, lean: (LEAN.haul - LEAN.walk) * rec, rel: drop(tStop + T_REC + 0.08, FOOT.side) };
  const tc = Math.max(tStop + T_REC, T_HIT + 0.18 + (seed % 4) * 0.05);
  const k = ease.out(span(t, tc, tc + 0.5));                 // phase -1 (chest grip) -> 1 (arms overhead)
  // standing up, the front foot stays planted and the rear foot (heel up in
  // the crouch) steps in beside it; he lets go of the rope as his arms start
  // up (it falls from his chest grip to the plaza)
  return { x: xs + (FOOT.lift[0] - FOOT.lift1[0]) * clamp(2 * k - 1) * h, y, h, pose: 'lift', phase: 2 * k - 1, lean: (LEAN.haul - LEAN.grip) * rec,
    rel: drop(tc, FOOT.grip) };
}
// A rope from a to b with rest length len: it sags when slack, and where it
// sinks to the ground it lies on the plaza, on a line that runs in
// perspective from g0 (at a) to g1 (at b). A rope that would sink well into
// the plaza drapes instead: each raised end hangs nearly straight down to the
// ground (a quadratic with its control point on the ground under that end)
// and the rope lies along the plaza between; in between the two shapes blend
// by how deep it would sink, so a span never jumps from one to the other.
// Elsewhere the floor is soft (it bends onto the plaza without a corner).
// Where it lies on the ground it snakes a little (wob: amplitude, seed: phase).
const softplus = (z) => (z > 30 ? z : Math.log1p(Math.exp(z)));
function ropePath(ctx, a, b, len, g0, g1 = g0, wob = 0, seed = 0) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const sag = d < len ? Math.sqrt((3 * d * (len - d)) / 8) : 0;
  ctx.moveTo(a[0], a[1]);
  if (sag <= 0.5) { ctx.lineTo(b[0], b[1]); return; }
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + 2 * sag;
  const gAt = (u) => g0 + (g1 - g0) * u;
  const n = wob ? 28 : 18;
  // the drape, weighted by how far the sagging curve's lowest point would sink below the plaza
  const f = clamp((0.25 * a[1] + 0.5 * my + 0.25 * b[1] - gAt(0.5) + 2) / 16);
  let drape = null;
  if (f > 0) {
    const dir = Math.sign(b[0] - a[0]) || 1;
    const ha = Math.max(0, g0 - a[1]), hb = Math.max(0, g1 - b[1]);
    const ra = Math.min(ha * 0.5, d * 0.3), rb = Math.min(hb * 0.5, d * 0.3);
    const A = [a[0] + dir * ra, g0], B = [b[0] - dir * rb, g1];
    const la = Math.hypot(ra, ha), lb = Math.hypot(rb, hb), lg = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const tot = la + lg + lb || 1, ua = la / tot, ub = lb / tot;
    drape = (u) => {
      if (u < ua) { const v = u / ua, w = 1 - v; return [(w * w + 2 * w * v) * a[0] + v * v * A[0], w * w * a[1] + (2 * w * v + v * v) * g0]; }
      if (u > 1 - ub) { const v = (u - 1 + ub) / ub, w = 1 - v; return [w * w * B[0] + (2 * w * v + v * v) * b[0], (w * w + 2 * w * v) * g1 + v * v * b[1]]; }
      const v = (u - ua) / Math.max(1e-6, 1 - ua - ub);
      return [A[0] + (B[0] - A[0]) * v, A[1] + (B[1] - A[1]) * v];
    };
  }
  for (let i = 1; i <= n; i++) {
    const u = i / n, v = 1 - u, g = gAt(u);
    let x = v * v * a[0] + 2 * v * u * mx + u * u * b[0];
    let y = v * v * a[1] + 2 * v * u * my + u * u * b[1];
    y = g - 4 * softplus((g - y) / 4);                   // the soft floor
    if (drape) { const [dx, dy] = drape(u); x += (dx - x) * f; y += (dy - y) * f; }
    const w = wob * clamp((y - g + 6) / 6) * Math.sin(u * 17 + seed) * (0.6 + 0.4 * Math.sin(u * 7.3 + seed * 1.7));
    ctx.lineTo(x + w * 0.8, y + w);
  }
}

// ------------------------------------------------------------------ the break
// From the impact she is a BROKEN statue lying along the stone, not the
// standing carving turned on its side (which printed as a wheeled machine: a
// cartwheel, a fluted barrel and a handlebar). B1's 'fallen' variant of
// assets/athena.js re-cuts her for the floor in the same school of carving -
// the shield edge-on with its rim toward us, the drapery modelled by marks
// that cross the body, the head and crest resting on the stone with the crest
// opening as a fan, and the spear snapped to a stub in her fist. The swap is ON
// the impact frame (beat 76), where the shake, the flare, the stone chips and
// the first frame of the dust all land: she breaks as she hits, which is what
// the beat says, and the front dust closes over her two frames later. (A swap a
// few frames later, as the finding suggested, printed as a pop: the skirt is
// only a quarter grown by then.)
const FALLEN = ATHENA.fallen || null;
const broken = (t) => !!FALLEN && t >= T_HIT;
// her feet stay up on the plinth: the toppling figure's feet at the rest angle.
// B1 sized the variant so the floor lands at FALLEN.floor below them = STY.
const FEET_REST = (() => { const [x, y] = figPt(0, 0, ROT_END); return { x, y }; })();
// a point of the STANDING figure's frame (feet at 0, y up negative) in the
// fallen carving's own frame (u along the body from the feet, h above its axis)
const fallenLocal = (lx, ly) => { const q = FALLEN.at(-ly, -lx); return [q.x, q.y]; };
// the fallen carving's frame at time t: the rebound off the floor (statueRot's
// residual over the rest angle) about the hem pivot, then her feet and scale
function restFrame(ctx, t) {
  const d = statueRot(t) - ROT_END;
  if (d) { ctx.translate(PIV.x, PIV.y); ctx.rotate(d); ctx.translate(-PIV.x, -PIV.y); }
  ctx.translate(FEET_REST.x, FEET_REST.y); ctx.scale(SS, SS);
}

// The upper shaft of the spear, snapped off at her fist and thrown onto the top
// treads (B1's variant leaves the jagged stub in her hand). It is the only
// piece the shot draws, in the 'dust' actor, which runs after the steps
// occluder so the rubble lies ON the flight.
const SHAFT = { a: [994, 567], b: [1101, 588], c: [917, 713], d: [1014, 722] };   // was / lands (clear of the right fire pool, so a moonlit piece never lies on firelit stone)
function brokenShaft(ctx, k) {
  const u = ease.out(span(k, 0.04, 0.34)), hop = 24 * Math.sin(Math.PI * u) * (1 - u * 0.45);
  const x0 = SHAFT.a[0] + (SHAFT.c[0] - SHAFT.a[0]) * u, y0 = SHAFT.a[1] + (SHAFT.c[1] - SHAFT.a[1]) * u - hop;
  const x1 = SHAFT.b[0] + (SHAFT.d[0] - SHAFT.b[0]) * u, y1 = SHAFT.b[1] + (SHAFT.d[1] - SHAFT.b[1]) * u - hop;
  const a = Math.atan2(y1 - y0, x1 - x0), c = Math.cos(a), sn = Math.sin(a);
  const pt = (dl, dn) => [x1 + c * dl - sn * dn, y1 + sn * dl + c * dn];
  ctx.save();
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  if (u > 0.98) {                                  // its shadow on the tread, once it lies still
    ctx.strokeStyle = '#03051a'; ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(x0 - 5, y0 + 3); ctx.lineTo(x1 - 5, y1 + 3); ctx.stroke();
  }
  // the leaf blade on the end that was the tip, then the shaft in two tones
  ctx.beginPath();
  ctx.moveTo(...pt(17, 0)); ctx.lineTo(...pt(9, -8.5)); ctx.lineTo(...pt(-2, -6)); ctx.lineTo(...pt(-2, 6)); ctx.lineTo(...pt(9, 8.5));
  ctx.closePath();
  ctx.fillStyle = '#a0968b'; ctx.fill();
  ctx.strokeStyle = '#140d0a'; ctx.lineWidth = 2; ctx.stroke();
  for (const [col, lw] of [['#140d0a', 7.4], ['#d1c7bd', 3.4]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
}

// where the dust sprites are first drawn (see the 'dust' actor): black pronaos
// between the right columns, under the architrave, in both framings
const WARM_AT = { x: (TL.cols[2] + TL.cols[3]) / 2, y: TL.yA + 40 };
const DUST_SPRITES = ['puffA', 'puffB', 'puffC', 'skirt'];

// fast-out growth of a dust burst started kk seconds ago
const burst = (kk, tau) => (kk > 0 ? 1 - Math.exp(-kk / tau) : 0);

// chips of stone thrown up at the impact (ballistic, deterministic)
const CHIPS = (() => {
  const r = new RNG('s09-chips');
  return Array.from({ length: 22 }, () => {
    const u = r.range(0.15, 1);
    return { u, vx: r.range(-160, 260), vy: r.range(160, 420), s: r.range(2.5, 6.5), spin: r.range(-14, 14), light: r.chance(0.55) };
  });
})();

// The dust burst: small baked puffs of dust (sphere-impostor billows, like
// the smoke and the clouds), thrown up all along her length where she hits.
// Each puff bursts out fast, then keeps swelling and climbing slowly in the
// hot air; behind her they rise and thin out, in front one low skirt hides
// where her body meets the floor, then settles.
const PUFFS = {
  puffA: { w: 230, h: 160, cloud: { w: 200, h: 120, seed: 's09-puff-a' } },
  puffB: { w: 260, h: 150, cloud: { w: 230, h: 104, seed: 's09-puff-b' } },
  puffC: { w: 210, h: 170, cloud: { w: 180, h: 132, seed: 's09-puff-c' } },
  skirt: { w: 540, h: 120, skirt: true, cloud: { w: 490, h: 78, seed: 's09-skirt' } },    // one long low bank along her length
};
// Billows for a round puff of dust: a dome-shaped envelope (no towers) with
// a cauliflower edge of bulges and a few interior bulges.
function puffBillows(seed, { x, y, w, h }) {
  const rng = new RNG(seed);
  const H = (px) => { const u = (px - x) / (w / 2); return Math.abs(u) >= 1 ? 0 : h * Math.pow(1 - u * u, 0.62); };
  const out = [];
  // the cauliflower edge along the dome
  const NS = 64, env = [];
  for (let i = 0; i <= NS; i++) { const px = x - w / 2 + (w * i) / NS; env.push([px, y - H(px)]); }
  let acc = 0;
  for (let i = 1; i < env.length; i++) {
    const [x0, y0] = env[i - 1], [x1, y1] = env[i];
    acc += Math.hypot(x1 - x0, y1 - y0);
    const r = h * rng.range(0.13, 0.2);
    if (acc < r * 0.9) continue;
    acc = 0;
    const tx = x1 - x0, ty = y1 - y0, tl = Math.hypot(tx, ty) || 1;
    let nx = -ty / tl, ny = tx / tl; if (ny < 0) { nx = -nx; ny = -ny; }
    if (y1 < y - r * 0.4) out.push({ x: x1 + nx * r * 0.62, y: y1 + ny * r * 0.62, r, rx: r * rng.range(1.0, 1.18), ry: r * rng.range(0.88, 1.0), edge: true });
  }
  // interior bulges fill the body
  for (let i = 0; i < 9; i++) {
    const px = x + rng.range(-0.34, 0.34) * w, top = y - H(px);
    const r = h * rng.range(0.2, 0.3);
    const py = top + r * rng.range(0.9, 1.6);
    if (py < y - r * 0.3) out.push({ x: px, y: py, r, rx: r * 1.1, ry: r * 0.95, interior: true });
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}
// The dust is navy-black like the smoke (production standard 6), with thin
// moonlit crescents on its upper-right billows and 3-4 flat tones per billow;
// no lilac (standard 15). The ivory statue reads against it.
const DUST_RAMP = ['#0b0a1c', '#1d1f40', '#383d60', '#7b7e95', '#ddd5c8'];
// the plume of the kit's smoke that climbs over the head end, in the same tones
// (navy under-tones, not red: red crescents fringed into navy-grey would turn plum)
const DUST_SMOKE = { base: '#0b0a1c', half: '#1d1f40', lit: '#7b7e95', under: ['#1d1f40', '#141633'] };
// The puffs are lit sphere impostors (the engine's billowing-mass
// primitive), shaded for dust rather than cloud: a low ambient and a strong
// moon from the upper right, so each billow is navy-black with a thin pale
// crescent on its moon side, and the whole puff is darker low and to the left.
const DUST_LIGHT = (() => { const l = [0.5, -0.6, 0.3], n = Math.hypot(...l); return l.map((v) => v / n); })();
// Billows for the low skirt in front of her: one long bank of overlapping
// billows of uneven size along a low dome, with a few riding on top.
function skirtBillows(seed, { x, y, w, h }) {
  const rng = new RNG(seed), out = [];
  let px = x - w / 2 + h * 0.3;
  while (px < x + w / 2 - h * 0.2) {
    const u = (px - x) / (w / 2), dome = 1 - u * u;
    const r = h * rng.range(0.3, 0.56) * (0.62 + 0.38 * dome);
    out.push({ x: px, y: y - r * rng.range(0.5, 0.85), rx: r, ry: r, interior: false });
    if (rng.chance(0.55 * dome + 0.15)) {
      const r2 = r * rng.range(0.45, 0.72);
      out.push({ x: px + rng.range(-0.35, 0.35) * r, y: y - r * rng.range(1.05, 1.35) - r2 * 0.3, rx: r2, ry: r2, interior: false });
    }
    px += r * rng.range(0.62, 1.0);
  }
  return out.sort((a, b) => a.y - b.y);
}
function puffSprite(d) {
  return {
    w: d.w, h: d.h, ax: 0.5, ay: 1, depth: 1, maxScale: 1.3,
    paint(p) {
      // edge: L1c's rim erosion breaks each billow's edge into small lobes (smoke range 0.15-0.25)
      const m = mat(p.mat.cloud, { ramp: DUST_RAMP, thr: [0.42, 0.6, 0.78, 0.9], noise: { scale: 14, amp: 0.02, vScale: 5, vAmp: 0.01 }, ink: '#0c0a14', outline: { width: 0, sil: 0, crease: 0, creaseThr: 0.1 }, edge: 0.2, edgeScale: 9, edgeSeed: d.cloud.seed.length * 7 });
      const c = { x: d.w / 2, y: d.h - 6, w: d.cloud.w, h: d.cloud.h };
      const bl = (d.skirt ? skirtBillows : puffBillows)(d.cloud.seed, c), rng = new RNG(`${d.cloud.seed}-z`);
      let y0 = Infinity;
      const sp = bl.map((b) => {
        const r = (b.rx + b.ry) / 2, u = Math.min(1, Math.abs(b.x - c.x) / (c.w / 2));
        y0 = Math.min(y0, b.y - r);
        return { x: b.x, y: b.y, r, z: c.h * 0.55 * Math.sqrt(1 - u * u) + (b.interior ? r * 0.5 : 0) + rng.range(0, r * 0.3), bias: b.interior ? -0.06 : rng.range(-0.04, 0.03) };
      });
      p.spheres(m, sp, { light: DUST_LIGHT, ambient: 0.22, diffuse: 0.8, baseY: c.y, topY: y0, baseDark: 0.7, flatBase: true,
        global: [c.x, (y0 + c.y) / 2, c.w / 2, (c.y - y0) * 0.6], globalMix: 0.35, flatness: 1 });
    },
  };
}
// u: place along her (0 feet .. 1 head, >1 beyond), dx/rise: where it ends up,
// s: size, sy: extra vertical squash, d: delay after the hit, flip: mirror.
// Behind her the puffs climb and thin out; in front, one low skirt hides
// where she meets the floor, then settles so she shows again by t ~ 4.2.
// keep: puffs in front of the burning doorway or the right flank's fires
// stay opaque and thin out by shrinking instead (thin navy over red would
// turn violet); the middle ones, over the black pronaos, fade.
const DUST_BACK = [
  { sp: 'puffB', u: 0.12, dx: -16, rise: 30, s: 0.85, d: 0.04, keep: true },
  { sp: 'puffA', u: 0.34, dx: -4, rise: 64, s: 0.95, d: 0.03, flip: true, keep: true },
  { sp: 'puffC', u: 0.56, dx: 8, rise: 92, s: 1.0, d: 0.02 },
  { sp: 'puffB', u: 0.76, dx: 20, rise: 110, s: 1.0, d: 0.0, flip: true },
  { sp: 'puffA', u: 0.95, dx: 30, rise: 130, s: 1.1, d: 0.0, keep: true },
  { sp: 'puffC', u: 1.08, dx: 40, rise: 90, s: 0.95, d: 0.03, flip: true, keep: true },
];
// The second front puff sits over the SHIELD end (u 0.14 is where the shield
// lands on screen), so the broken rim and the hip are behind dust while the
// eye is still reading the fall; by k ~2 it has settled and she is clear.
// (a negative delay = a head start, so the bank is already low over the contact
// line on the impact frame itself, where the carving swaps)
const DUST_FRONT = [
  { sp: 'skirt', u: 0.6, dx: 10, rise: -10, s: 1.0, sy: 0.9, d: -0.03 },
  { sp: 'puffC', u: 0.14, dx: -22, rise: -4, s: 0.78, sy: 0.72, d: -0.035, flip: true },
];
// o: { s0 (start size), fade (fade-in s), thin (alpha lost from k 0.9 to
// 2.2), settle (the skirt flattens, sinks and thins from k 1.0 to 2.1) }
function drawPuffs(ctx, e, list, k, o = {}) {
  const s0 = o.s0 ?? 0.3, tau = o.tau ?? 0.3;
  const st = o.settle ? span(k, 1.0, 2.1) : 0;
  const thin = 1 - (o.thin ?? 0) * span(k, 0.9, 2.2);
  for (const q of list) {
    const f = burst(k - q.d, tau);
    if (f <= 0) continue;
    const [x0] = figPt(-10 + 40 * Math.min(q.u, 1), -760 * q.u, ROT_END);
    // settling: the skirt collapses onto the floor (flatter and lower), and
    // only its last thin sliver fades, so it is never a see-through veil
    const sc = q.s * (s0 + (1 - s0) * f) * (1 + 0.08 * k) * (1 - 0.1 * st) * (q.keep && o.thin ? 1 - 0.28 * span(k, 1.0, 2.2) : 1);
    const sy = (q.sy ?? 1) * (0.8 + 0.2 * f) * (1 - 0.82 * st);
    const a = (o.fade ? clamp((k - q.d) / o.fade) : 1) * (q.keep ? 1 : thin) * (1 - span(st, 0.8, 1));
    if (a <= 0.01) continue;
    const y = STY + 12 - q.rise * f - (o.settle ? 0 : 9 * k) + 10 * st;
    e.drawSprite(ctx, q.sp, x0 + q.dx * f + 14 * k, y, { sx: sc * (q.flip ? -1 : 1), sy: sc * sy, alpha: a });
  }
}

// The haulers only change on twos, so they are drawn into world-space
// canvases once per 12 fps frame (and again if the zoom has changed by more
// than 4%) and blitted in between; the ropes are drawn live on top. The two
// halves of the crew rebuild a quarter and three quarters of a frame out of
// step with the flames (which rebuild on the 12 fps beat), so no frame pays
// for all of them at once.
const CREW_BB = { x: 980, y: 752, w: 640, h: 160 };
const CREW_BB_P = { x: 720, y: 786, w: 590, h: 200 };
const HALVES = [{ ropes: [0, 1], off: 0.25 }, { ropes: [2, 3], off: 0.75 }];
// The haulers' moon shadows: the moon about 55 deg up (standard 33, B1's model: a point 1 unit up casts its
// tip 0.7 units sideways), from the upper right as in s05 (the same plaza: SH (-0.70, +0.31)), navy-black as s06's
const MOON_SHADOW = { len: 0.7, side: -1, drop: 0.44, w: 0.07, color: 'rgba(3,5,26,0.93)' };
function crewFrame(e, tall, half) {
  const H2 = HALVES[half];
  const F = Math.floor(e.t * 12 + H2.off);
  const key = `crew${half}`;
  let C = e.st[key];
  if (C && C.F === F && C.tall === tall && Math.abs(Math.log(e.s / C.s)) < 0.04) return C;
  const ef = { ...e, wall: F / 12 };                       // cloth flutter follows shot time: scrubbing stays exact
  const bb = tall ? CREW_BB_P : CREW_BB;
  const W = Math.ceil(bb.w * e.s), H = Math.ceil(bb.h * e.s);
  // the canvas belongs to the shot (L1a's e.cache): the stage frees it with
  // s09's plates, so it does not outlive the shot in WebKit's canvas budget
  const cv = e.cache ? e.cache(key, W, H) : (() => { const c = C?.cv ?? document.createElement('canvas'); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c; })();
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.setTransform(e.s, 0, 0, e.s, -bb.x * e.s, -bb.y * e.s);
  const tq = (F - H2.off) / 12;                            // haulers move on twos
  const ropes = [];
  for (const ri of H2.ropes) {
    const r = ROPES[ri];
    const team = tall ? r.teamP : r.team;
    const pts = [], gnd = [], fy = [];                     // rope points (hands), the ground under a man who let go, every man's feet
    for (let j = 0; j < team.length; j++) {
      const m = hauler(tq, ri, j, team[j]);
      fy.push(m.y);
      g.save();
      // the moon's shadow (standard 33: one night, the moon about 55 deg up), shorter as a man goes over backward
      const sh = m.pose === 'fall' ? { ...MOON_SHADOW, len: MOON_SHADOW.len * Math.max(0.2, 1 - (m.phase - FALL0) / (1 - FALL0)) } : MOON_SHADOW;
      const out = hoplite(g, ef, { x: m.x, y: m.y, h: m.h, dir: -1, pose: m.pose, phase: m.phase, lean: m.lean || 0, cloak: r.cloak[j], shield: false, spear: false, shadow: sh, rim: '#e0482a', seed: ri * 5 + j });
      g.restore();
      if (m.rel && m.rel.k >= 0) {
        // let go: the rope falls from where his hand held it to the plaza at his feet
        pts.push([m.rel.x, m.rel.y + (m.y - 1 - m.rel.y) * m.rel.k * m.rel.k]);
        gnd.push(m.y);
      } else {
        pts.push(out ? out.hands[0] : [m.x - m.h * 0.15, m.y - m.h * 0.6]);
        gnd.push(null);
      }
    }
    ropes.push({ r, pts, gnd, fy, feet: team[0][1] });
  }
  C = e.st[key] = { cv, F, tall, s: e.s, bb, ropes };
  return C;
}

// ------------------------------------------------------------------ firelight
// The fires on both flanks light the stone (STYLE rule 6: red light from
// below; standard 15: posterised, never additive over navy). The steady
// light is baked: C2's posterised warm glow bands (multiply) go onto each
// stone layer as its last step, masked to what that layer painted, so the
// sky, the smoke, the dust and the figures never take it and no navy turns
// violet. Each step of the generator is one small bake unit.
// Standard 21: two or three hard bands near each fire, at (or past) the
// full warm filter (C2's glow: every band filters at 0.75-1.15 of it, x
// strength above 1), so firelit ivory steps to salmon, coral and vermilion;
// the radii are tight, so the stone away from the fires stays moonlit ivory.
// The stone of the temple layer (steps, paving, plinth) takes flat pools along
// the house bases (the plaza in perspective) that climb the steps' ends;
// the temple front above the stylobate (columns, pronaos, entablature) never
// takes the light (NO_LIGHT), so no column turns two-tone.
// (the two outer pools are gone with the outer roofs' fires: the far house
// bases keep the moon, so the frame's edges are ivory, not vermilion)
const FIRE_LIGHTS = [
  { x: 70, y: GROUND - 40, r: 300, sy: 0.2, strength: 1.07, bands: 2, facets: 9, seed: 21 },             // the left flank, by the temple: the steps' left end and the house base
  { x: 1280, y: GROUND - 40, r: 285, sy: 0.2, strength: 1.07, bands: 2, facets: 9, seed: 22 },           // the right flank: a flat pool along the house base and on the steps' end (not a kite on the plaza)
];
// The burning houses take broader lights, so their fronts are lit whole (the
// outer band ends off the walls, in the sky or on the plaza, where the houses
// layer has nothing to light) and only the inner band edge crosses a wall.
const HOUSE_LIGHTS = [
  { x: 110, y: GROUND - 162, r: 260, sy: 0.85, strength: 1.07, bands: 2, facets: 9, seed: 25 },
  { x: 1248, y: GROUND - 122, r: 252, sy: 0.75, strength: 1.07, bands: 2, facets: 9, seed: 26 },   // tight enough that the house fronts past x ~1500 keep the moon
];
// The round pools never touch the temple front above the stylobate (columns,
// antae, pronaos, entablature: no column turns two-tone) nor the flight's
// front: one polygon, the staircase outline of the steps (templeOfAthena's
// layout: 9 steps of rise 10 s, each 6 s wider than the one above) joined to
// the front above the crepidoma.
const STEP_N = 9, STEP_RISE = 10 * TEMPLE.s, STEP_TRD = STEP_RISE * TEMPLE.treadShare;
const stepHW = (i) => TL.half + (STEP_N - i) * 6 * TEMPLE.s;          // half width of step i (0 = the bottom one)
const NO_LIGHT = (() => {
  const x = TEMPLE.x, L = [], R = [];
  for (let i = 0; i < STEP_N; i++) {
    const y1 = GROUND - i * STEP_RISE, y0 = y1 - STEP_RISE;
    L.push([x - stepHW(i), y1], [x - stepHW(i), y0]);
    R.unshift([x + stepHW(i), y0], [x + stepHW(i), y1]);
  }
  const yc = GROUND - STEP_N * STEP_RISE;                               // the top of the flight (the crepidoma's foot)
  return [...L, [x - TL.half - 2, yc], [x - TL.half - 2, -4000], [x + TL.half + 2, -4000], [x + TL.half + 2, yc], ...R];
})();
// Light on a flight breaks at every tread and riser: each step's end takes the
// fire's light in two flat bands of C2's warm filter (the pools' own colours),
// cut square at its own vertical edge, so the boundary climbs the flight as a
// staircase. The treads (facing up, toward the burning roofs) carry it farther
// in than the risers (which the light only grazes); it reaches less far up the
// flight. band 1 = the inner band (C2's inner warm step), 0 = the outer one.
const STEP_LIGHT = (() => {
  const jr = new RNG('s09-steplight'), out = [];
  for (const side of [-1, 1]) {
    const rects = [];
    for (let i = 0; i < STEP_N; i++) {
      const y1 = GROUND - i * STEP_RISE, y0 = y1 - STEP_RISE, xe = TEMPLE.x + side * stepHW(i);
      const lo = (side < 0 ? 124 : 110) - (side < 0 ? 11.5 : 10.5) * i;   // the outer band's reach on the tread
      const k = jr.range(0.8, 1.2);
      for (const [ya, yb, f] of [[y0, y0 + STEP_TRD, 1], [y0 + STEP_TRD, y1, 0.7]]) {
        const Lo = lo * k * f, Li = Lo * jr.range(0.36, 0.46);
        const r = (a, b, band) => rects.push({ x: side < 0 ? xe + a : xe - b, y: ya, w: b - a, h: yb - ya, band });
        r(0, Li, 1); r(Li, Lo, 0);
      }
    }
    out.push(rects);
  }
  return out;
})();
// The plaza is moonlit flagstones down to the frame's edge (standard 24: no
// black caption bed; the bottom caption takes its contrast from the caption
// wash, as in s05). Plate 4's floor, as in s05 (the same plaza): irregular
// flagstones with jagged joints (B1's paving flags), kept calm (standard 26:
// floors stay quiet; the marks go on the risers, walls and the statue).
// s05's flags exactly (no joint cores: each joint is one light step, so it
// prints as one line at any DPR), s05's flag size, and s05's flag faces: night
// stone with real mid-tones (standard 31), so the plaza - the largest field in
// the frame - is worn moonlit limestone, not paper.
const PAVE = { x0: -360, x1: 1960, yFar: 790, yNear: 1400, hz: 700, vx: 860, slab: 260, rowStep: 0.34, seed: 's09-pave',
  // light = the calm far field; face = each flag's own tone, s05's recipe (B1,
  // round 6): 45% at 0.76, 45% at 0.90, a worn tenth at 0.70, so the two shots
  // print one floor and nothing lands in a shade tone. (B1 later nudged s05 to
  // 0.78 / 0.92 / 0.70 at 42 / 50 / 8; s09 keeps these values because the 0.02
  // takes 45% of the flags from tone 5 to tone 6, and that costs standard 31 a
  // point of mid-tone - measured s09 0.78: k-means tones 3+4 24-25% against
  // 25-27% here, L 120-200 0.38-0.39 against 0.40-0.41. The two whole frames
  // measure the same either way, and this way is the closer of the two to s05's
  // own numbers: s05 p90 231.9 / above L 215 0.308 / tones 3+4 28% / >230 0.13
  // against s09 231.9 / 0.303 / 26% / 0.13.)
  light: 0.86, face: [[0.76, 0.45], [0.90, 0.45], [0.70, 0.10]],
  flags: { split: 0.22, jitter: 0.045, merge: 0.15, chip: 0.08, crack: 0.07 } };
PAVE.flags.face = PAVE.face;
const BAKE_E = { t: 0, wall: 0, reduced: false, q: () => 0 };
function lightClip(c, lights, exclude) {
  c.beginPath();
  for (const o of lights) { c.moveTo(o.x + o.r * 1.25, o.y); c.ellipse(o.x, o.y, o.r * 1.25, o.r * o.sy * 1.25, 0, 0, TAU); }
  c.clip();
  if (exclude) {
    c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5);
    exclude.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.clip('evenodd');
  }
}
const rectsPath = (c, rects, band) => { c.beginPath(); for (const r of rects) if (band == null || r.band === band) c.rect(r.x, r.y, r.w, r.h); };
// o: { lights (default FIRE_LIGHTS; null = none), exclude: polygon (world) the round lights must not touch,
//      rects: lists of flat lit rects [{ x, y, w, h, band }] (the steps' ends; one stage per list) }
// Each stage works on the device rect its light covers (not the whole layer), in four small units.
const fireLight = (o = {}) => function* bakeFireLight(ctx) {
  const cv = ctx.canvas, W = cv.width, H = cv.height;
  if (!(W > 0 && H > 0)) return;
  const M = ctx.getTransform();
  const lights = o.lights === undefined ? FIRE_LIGHTS : o.lights;
  const stages = [];
  if (lights && lights.length) {
    stages.push({ box: lights.map((L) => [L.x - L.r * 1.25, L.y - L.r * L.sy * 1.25, L.x + L.r * 1.25, L.y + L.r * L.sy * 1.25]),
      clip: (c) => lightClip(c, lights, o.exclude),
      paint: (g) => { for (const L of lights) glow(g, BAKE_E, { ...L, flicker: 0, mode: 'warm' }); } });
  }
  for (const rects of o.rects ?? []) {
    stages.push({ box: rects.map((r) => [r.x, r.y, r.x + r.w, r.y + r.h]),
      clip: (c) => { rectsPath(c, rects); c.clip(); },
      // one flat band each: C2's warm filter at the pools' outer and inner steps (a single-band glow
      // far larger than the rects: strength 0.125 = the outer step's filter, 1.07 the inner one's)
      paint: (g) => {
        for (const band of [0, 1]) {
          g.save(); rectsPath(g, rects, band); g.clip();
          glow(g, BAKE_E, { x: rects[0].x, y: rects[0].y, r: 6000, bands: 1, strength: band ? 1.07 : 0.125, mode: 'warm', flicker: 0, seed: 29 });
          g.restore();
        }
      } });
  }
  for (const S of stages) {
    // the stage's world box -> a device rect of the layer canvas (2 px of slack for the clip's antialiasing)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [a, b, c, d] of S.box) for (const [wx, wy] of [[a, b], [c, b], [a, d], [c, d]]) {
      const dx = M.a * wx + M.c * wy + M.e, dy = M.b * wx + M.d * wy + M.f;
      x0 = Math.min(x0, dx); x1 = Math.max(x1, dx); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy);
    }
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
    x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
    if (!(x1 > x0 && y1 > y0)) continue;
    const w = x1 - x0, h = y1 - y0;
    const tmp = makeCanvas(w, h), g = tmp.getContext('2d');
    const world = (c) => c.setTransform(M.a, M.b, M.c, M.d, M.e - (c === ctx ? 0 : x0), M.f - (c === ctx ? 0 : y0));
    // the layer over black, inside the light only: edge pixels then darken
    // under the multiply instead of turning pink over the navy sky
    g.save(); world(g); S.clip(g);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.drawImage(cv, -x0, -y0);
    g.restore();
    yield;
    g.save(); world(g); S.clip(g); S.paint(g); g.restore();
    yield;
    g.save(); g.globalCompositeOperation = 'destination-in'; g.drawImage(cv, -x0, -y0); g.restore();
    yield;
    ctx.save(); world(ctx); S.clip(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(x0, y0, w, h); ctx.drawImage(tmp, x0, y0);
    ctx.restore();
    tmp.width = 0; tmp.height = 0;
    yield;
  }
};
// ------------------------------------------------------------------ her shadow
// Nothing in the shot cast a shadow but the ten haulers, so the colossus
// floated on the brightest field in the frame and the bottom third had no dark
// anchor (plates 4 and 5 both build on a big black shadow mass). The moon is
// the one night's moon (standard 33: about 55 degrees up, to the right and
// behind the city), so her shadow is thrown LEFT across the stylobate and down
// the top treads: s05's shear exactly, the same as the haulers' MOON_SHADOW.
// The shear flips and squashes her own silhouette onto the floor plane, so
// every shadow pixel lands at or below the porch floor line and the shadow can
// never darken the figure itself. Navy-black, standard 19.
const SHADOW = { kx: 0.7, ky: -0.31 };
const SHADE_INK = '#03051a';                                     // N.stone tone 0
const SHADE_MAT = { mode: 'flat', ink: SHADE_INK, ramp: [SHADE_INK, SHADE_INK], thr: [0.5], noise: { scale: 30, amp: 0 } };
// (x, y) -> the floor plane, about gy: x + kx (y - gy), gy + ky (y - gy)
const shearXf = (gy) => [1, 0, SHADOW.kx, SHADOW.ky, -SHADOW.kx * gy, gy - SHADOW.ky * gy];

// the low sky glows over the burning city: opaque posterised bands, a
// navy-black smoke haze first, then the red ramp (no violet in between:
// the navy steps straight into the haze and the haze into red-black)
const SKY_RED = ['#070816', '#2c0806', '#4a0d09', '#791b14'];   // outer .. inner

// for C1's measuring scripts (evidence/tmp/C1/r3): nothing in the film imports it
export const _probe = { hauler, FOOT, LEAN, ROPES, T_HIT, figPt, statueRot, SS, PIV, PV, STY, GROUND, TL, ROT_END, FEET };

// ------------------------------------------------------------------ shot
export default {
  id: 's09', dur: DUR, night: true,
  caption: 'TROY BURNS',
  captionPos: 'bottom', captionPosPortrait: 'bottom',   // TROY BURNS stays at the bottom on phones through s08-s10
  reducedT: 3.4,
  margin: 18,
  cam: [
    { t: 0, x: 800, y: 512, w: 1600, h: 900 },
    { t: DUR, x: 824, y: 524, w: 1440, h: 810, ease: 'inOutSine' },
  ],
  // phones: navy sky over the pediment and its burning roof (13% of the frame,
  // standard 20), the haulers above 75% of the height, so the bottom caption
  // (even raised over the controls) stays below them, on the moonlit plaza
  camPortrait: [
    { t: 0, x: 800, y: 500, w: 758, h: 1640 },
    { t: DUR, x: 838, y: 510, w: 740, h: 1600, ease: 'inOutSine' },
  ],
  sprites: {
    athena: athenaSprite({ part: 'figure', maxScale: SS * 1.02 }),
    athenaL: athenaSprite({ part: 'figure', maxScale: SS * 1.02, lightSide: -1 }),   // lit from her left, for after the fall
    // her silhouette in one flat navy-black tone, for the cast shadow: the
    // shear squashes it to about a third, so half the bake resolution is plenty
    shade: athenaSprite({ part: 'figure', maxScale: SS * 1.02, mat: SHADE_MAT, res: 0.5 }),
    ...(FALLEN ? {
      fallen: athenaSprite({ variant: 'fallen', maxScale: SS * 1.02 }),
      fallenShade: athenaSprite({ variant: 'fallen', maxScale: SS * 1.02, mat: SHADE_MAT, res: 0.5 }),
    } : {}),
    puffA: puffSprite(PUFFS.puffA), puffB: puffSprite(PUFFS.puffB), puffC: puffSprite(PUFFS.puffC), skirt: puffSprite(PUFFS.skirt),
  },
  items: [
    { layer: 'sky', depth: 0.4, paint(p) {
      sky(p, { y0: -600, y1: 800 });
      p.ink((ctx) => {                               // the burning city's glow on the low sky
        for (const [x, y, r, sy, seed] of [[-60, 800, 980, 0.42, 41], [1700, 820, 760, 0.36, 42], [640, 860, 900, 0.3, 43]]) {
          glow(ctx, BAKE_E, { x, y, r, sy, mode: 'tint', colors: [...SKY_RED].reverse(), strength: 1, bands: 4, rise: 0.1, flicker: 0, seed });
        }
      });
      moon(p, { x: 1348, y: 160, r: 15 });            // low enough that the reducedT framing keeps it
      nightStreaks(p, { x0: 1140, x1: 2000, y: 236, depth: 24, count: 6, seed: 's09-st', scale: 0.9 });
    } },
    { layer: 'city', depth: 0.7, paint(p) { cityOfTroy(p, { ...CITY, mat: silhouetteMat(p) }); } },
    { actor: 'farFire', depth: 0.7, draw(ctx, e) {
      // each column's step cache rebuilds on its own display frame (`ph`), so the
      // three never land together (fx.js keys the step on o.time; the content is
      // still quantised to the 12 fps grid)
      for (const s of SMOKES) smoke(ctx, e, { ...s, lit: 0.8, speed: 26, grow: 2.0, count: 16, time: e.t + s.ph });
      // The far roofs are drawn as ONE batched 'tiny' cluster, and fx.js steps a
      // batch on the 12 fps beat itself (the per-cluster step phase comes from a
      // seed, which a batch has none of). Half a step of offset moves its rebuild
      // off the display frame the smoke columns and the flanks rebuild on, so no
      // one frame pays for two caches (the tech finding). The flicker shifts by
      // 25 ms and nothing else changes.
      flames(ctx, { ...e, t: e.t + 0.0255 }, FAR_FIRES);
    } },
    { layer: 'houses', depth: 0.92, paint(p) {
      houses(p, HOUSES_L);
      houses(p, HOUSES_R);
      p.ink(fireLight({ lights: HOUSE_LIGHTS }), { bbox: { x: HOUSES_L.x0, y: 500, w: HOUSES_R.x1 - HOUSES_L.x0, h: 320 } });
    } },
    { actor: 'flankFire', depth: 0.92, draw(ctx, e) {
      // the fires flare as the statue hits (the blast of her fall fans them)
      const f = surge(e);
      flames(ctx, e, f > 0.02 ? FLANK_FIRES.map((q) => ({ ...q, h: q.h * (1 + 0.3 * f), intensity: q.intensity * (1 + 0.25 * f) })) : FLANK_FIRES);
    } },
    { actor: 'roofFire', depth: 1, draw(ctx, e) {
      if (!(e.view ? e.view.oy < TL.entTop - 4 : isPortrait(e))) return;   // only when the roof is in view
      // no glow behind them (a red dome there read as a setting sun): the roof
      // flames and the smoke stand against the navy sky, plate 4's contrast
      smoke(ctx, e, { ...ROOF_SMOKE, lit: 0.8, speed: 26, grow: 1.8, count: 14 });
      flames(ctx, e, ROOF_FIRES);
    } },
    { layer: 'temple', depth: 1, paint(p) {
      // the nearest courses take the moon (standard 31); the tall framing shows
      // much more plaza, so its bright band starts closer to the camera
      // The plaza is s05's exactly (PAVE.face at light 0.86), so the two shots
      // print one floor. There is no near-row offset, as in s05: s09's framing
      // shows only the first 0.28 of the paving's depth in landscape and 0.87 on
      // a phone, and a darker near band (light 0.74, which is what deepens the
      // rows s05's own caption sits on) took the share above L 215 to 0.275 on
      // phones, under standard 31's 30%.
      paving(p, { ...PAVE, joint: 0.5, bright: 0, nearShade: 0.15, farShade: 0, passRows: 3, mat: floorStone(p, { crack: 0.12 }) });   // B1's floor stone = L1c's calm M.floor (standard 26); a pass per 3 rows (WebKit)
      templeOfAthena(p, { ...TEMPLE, statue: false, stepsMat: stepsMat(p) });
      paintAthena(p, { x: TL.statue.x, y: STY, s: SS, part: 'plinth' });
      p.ink(fireLight({ exclude: NO_LIGHT, rects: STEP_LIGHT }), { bbox: TL.bbox });   // round pools on the plaza, a stepped light on the flight's ends
    } },
    { actor: 'cella', depth: 1, draw(ctx, e) {
      // the cella beyond the door is burning: flames lick up from its floor
      // inside the black doorway, beside and above the plinth that stands in
      // front (no glow: a red dome there read as a sunset, not as fire)
      const f = surge(e);
      ctx.save();
      ctx.beginPath(); ctx.rect(CELLA.x0, CELLA.y0, CELLA.x1 - CELLA.x0, STY - CELLA.y0);
      ctx.rect(TL.statue.x - 150 * SS, STY - 124 * SS, 300 * SS, 124 * SS + 2);     // the plinth stands in front
      ctx.clip('evenodd');
      flames(ctx, e, f > 0.02 ? CELLA_FIRES.map((q) => ({ ...q, h: q.h * (1 + 0.3 * f) })) : CELLA_FIRES);
      ctx.restore();
    } },
    { actor: 'dustBack', depth: 1, draw(ctx, e) {
      // the dust that rises from the porch floor behind her: a plume of the
      // kit's dust smoke climbing over the head end, then the baked puffs
      if (e.t <= T_HIT) return;
      const k = e.t - T_HIT, g = ease.out(clamp(k / 1.6));
      const hp = figPt(0, -640, ROT_END);
      smoke(ctx, e, { x: hp[0] - 30, y: STY - 30, w: 54 + 46 * g, h: 90 + 300 * g, seed: 96, palette: DUST_SMOKE, drift: 0.3, speed: 26, grow: 1.6, count: 14, lit: 0.7, time: k });
      drawPuffs(ctx, e, DUST_BACK, k, { thin: 0.6 });
    } },
    { actor: 'statue', depth: 1, draw(ctx, e) {
      ctx.save();
      if (broken(e.t)) {
        // the fallen carving, drawn unrotated with her feet still up on the
        // plinth (B1's variant: the floor lands exactly on the stylobate). The
        // rest angle is the carving's own, so only the rebound off the floor is
        // applied, about the same hem pivot the topple turned on.
        restFrame(ctx, e.t);
        e.drawSprite(ctx, 'fallen', 0, 0, {});
        statueLoops(ctx, fallenLocal);
      } else {
        const rot = statueRot(e.t);
        ctx.translate(PIV.x, PIV.y); ctx.rotate(rot); ctx.scale(SS, SS); ctx.translate(-PV[0], -PV[1]);
        e.drawSprite(ctx, 'athena', 0, 0, {});
        // as she goes over, the moonlit side turns from her right to her left
        // (which faces the upper-right moon once she lies on the floor): a near
        // swap while she moves fastest (~4 display frames around t 1.82), so the
        // two posterised lightings never average into grey on her drapery
        const w = ease.inOut(clamp((rot - 0.95) / 0.1));
        if (w > 0.01) e.drawSprite(ctx, 'athenaL', 0, 0, { alpha: w });
        statueLoops(ctx, (lx, ly) => [lx, ly]);
      }
      ctx.restore();
    } },
    { layer: 'steps', depth: 1, paint(p) {
      // repaint only the temple's steps: they hide what sinks below the porch floor
      const only = new Proxy(p, {
        get(tg, k) {
          if (k === 'pass') return (m, draw, o = {}) => { const b = o.bbox; if (b && Math.abs(b.y - STY) < 12 * TEMPLE.s && b.y + b.h > GROUND - 4) tg.pass(m, draw, o); return only; };
          if (k === 'ink' || k === 'raw' || k === 'spheres') return () => only;
          const v = tg[k]; return typeof v === 'function' ? v.bind(tg) : v;
        },
      });
      templeOfAthena(only, { ...TEMPLE, statue: false, stepsMat: stepsMat(p) });
      // the plinth's own moon shadow on the stylobate and the top tread: it
      // never moves, so it is baked here, over the steps (the figure's moves
      // with her, so it is an actor)
      const pw = ATHENA.plinth.w * SS, ph = PLH;
      paintAthena(shadowPainter(p, { gy: STY, kx: SHADOW.kx, ky: SHADOW.ky, color: SHADE_INK,
        bbox: { x: TL.statue.x - pw / 2 - 4, y: STY - ph - 4, w: pw + 8, h: ph + 8 } }), { x: TL.statue.x, y: STY, s: SS, part: 'plinth' });
      // the same stepped firelight on the steps' ends as the temple layer under it (the pools never reach the flight)
      p.ink(fireLight({ lights: null, rects: STEP_LIGHT }), { bbox: { x: TEMPLE.x - stepHW(0) - 4, y: STY - 4, w: 2 * stepHW(0) + 8, h: GROUND - STY + 8 } });
    } },
    { actor: 'shade', depth: 1, draw(ctx, e) {
      // her cast shadow, after the steps occluder so it lies on the flight
      ctx.save();
      ctx.globalAlpha = 0.93;                                   // the joints and arrises show faintly through, as s05's
      ctx.transform(...shearXf(STY));
      if (broken(e.t)) {
        restFrame(ctx, e.t);
        e.drawSprite(ctx, 'fallenShade', 0, 0, {});
      } else {
        ctx.translate(PIV.x, PIV.y); ctx.rotate(statueRot(e.t)); ctx.scale(SS, SS); ctx.translate(-PV[0], -PV[1]);
        e.drawSprite(ctx, 'shade', 0, 0, {});
      }
      ctx.restore();
    } },
    { actor: 'crew', depth: 1, draw(ctx, e) {
      const t = e.t;
      const rot = statueRot(t);
      const tight = ease.out(span(t, 0, T_TIGHT));
      const wob = t < 0.9 ? Math.sin(t * TAU * 3.1) * Math.exp(-t * 4) : 0;
      const tall = isPortrait(e);
      const C0 = crewFrame(e, tall, 0), C1 = crewFrame(e, tall, 1);
      const ropes = [...C0.ropes, ...C1.ropes];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // a two-tone rope: a dark cord with a pale twist
      const strokeRope = () => {
        ctx.strokeStyle = '#120a08'; ctx.lineWidth = 5.0; ctx.stroke();      // dark edges 1.75 units (plate ink weight)
        ctx.strokeStyle = '#cdbfa6'; ctx.lineWidth = 1.5; ctx.stroke();
      };
      // first span, from the statue to the first hauler's hands: slack before
      // the ropes snap taut and once she goes over, when it sinks onto the
      // plaza and lies there in perspective up to that hauler's feet. It is
      // drawn before the haulers, so the figures stand in front of it.
      ctx.beginPath();
      for (const { r, pts, feet } of ropes) {
        const a = figPt(r.at[0], r.at[1] + 8, rot);
        const len = (tall ? r.lenP : r.len) + (1 - tight) * 34 + wob * 6;
        ropePath(ctx, a, pts[0], len, GROUND + 8, feet + 1, 2.6, r.at[1] * 0.37);
      }
      strokeRope();
      ctx.drawImage(C0.cv, C0.bb.x, C0.bb.y, C0.bb.w, C0.bb.h);
      ctx.drawImage(C1.cv, C1.bb.x, C1.bb.y, C1.bb.w, C1.bb.h);
      // then from hand to hand (taut while they haul, slackening as she goes
      // over), and a tail to the ground behind the last man
      const give = t < T_SLACK ? 0.4 : 3 + 8 * span(t, T_SLACK, T_SLACK + 0.45);
      ctx.beginPath();
      for (const { pts, gnd, fy } of ropes) {
        for (let j = 1; j < pts.length; j++) {
          // where it sinks to the plaza (a man has let go, or it hangs slack) it lies on the ground between the two men's feet
          ropePath(ctx, pts[j - 1], pts[j], Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]) + give, fy[j - 1] + 1, fy[j] + 1, 1.6, j * 2.3);
        }
        const last = pts[pts.length - 1], lg = gnd[gnd.length - 1], fl = fy[fy.length - 1];
        // The tail behind the last man: down to the ground, then lying along the plaza
        // toward the camera (in the tall framing it runs on into the near paving, so the
        // phone's foreground carries the ropes' ends and not bare flagstones).
        const tl = tall && last[0] > 1000 ? 190 : 44;     // only the two teams on the right, so no tail crosses the caption
        const ty = lg != null ? Math.min(last[1] + 28, fl + 1) : last[1] + 28;
        ctx.moveTo(last[0], last[1]); ctx.quadraticCurveTo(last[0] + 18, Math.min(last[1] + 6, ty), last[0] + 32, ty);
        if (tl > 44) {           // on the plaza, in perspective: right and toward the camera
          const dz = tl * 0.9;
          ctx.quadraticCurveTo(last[0] + 32 + tl * 0.42, ty + dz * 0.3, last[0] + 32 + tl * 0.8, ty + dz * 0.72);
          ctx.quadraticCurveTo(last[0] + 32 + tl * 1.02, ty + dz * 0.95, last[0] + 26 + tl * 1.24, ty + dz * 1.22);
        }
      }
      strokeRope();
    } },
    { actor: 'dust', depth: 1, draw(ctx, e) {
      const t = e.t;
      embers(ctx, e, { x: 820, y: GROUND - 40, w: 1800, h: 800, count: 50, seed: 's09-amb', wind: 0.28 });
      // WebKit uploads a canvas to the GPU on its first draw: draw each dust
      // sprite once, as an invisible speck in the black pronaos, half a second
      // before the hit, so the beat frame does not pay for ~1.2 Mpx of uploads
      if (t > T_HIT - 0.5 && t < T_HIT - 0.3) for (const sp of DUST_SPRITES) e.drawSprite(ctx, sp, WARM_AT.x, WARM_AT.y, { s: 0.01, alpha: 0.02 });
      if (t < T_HIT) return;
      const k = t - T_HIT;
      const g = ease.out(clamp(k / 1.6));
      if (broken(t)) brokenShaft(ctx, k);      // the snapped-off upper shaft of her spear, on the tread
      // chips of stone
      ctx.save();
      for (const light of [true, false]) {
        ctx.beginPath();
        for (const c of CHIPS) {
          if (c.light !== light || k < 1 / 24) continue;
          // they break off where she meets the floor, along her length
          const x0 = figPt(-20 + 20 * c.u, -760 * c.u, ROT_END)[0], y0 = STY - 3 - c.s;
          const tt = Math.min(k, (c.vy + Math.sqrt(c.vy * c.vy + 2 * 1100 * Math.max(0, STY + 6 - y0))) / 1100);
          const x = x0 + c.vx * tt, y = y0 - c.vy * tt + 550 * tt * tt;
          const a = c.spin * tt, s = c.s;
          const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
          ctx.moveTo(x + ca, y + sa); ctx.lineTo(x - sa * 0.7, y + ca * 0.7); ctx.lineTo(x - ca, y - sa); ctx.lineTo(x + sa * 0.5, y - ca * 0.5); ctx.closePath();
        }
        ctx.fillStyle = light ? '#d1c7bd' : '#3b3a4f'; ctx.fill();
      }
      ctx.restore();
      // the burst in front: low puffs along her lower edge
      const hp = figPt(0, -700, ROT_END);
      // (it bursts up from the floor line by growth, opaque from its first frame: never a see-through veil)
      drawPuffs(ctx, e, DUST_FRONT, k, { s0: 0.42, fade: 0.02, settle: true, tau: 0.13 });   // the air is punched out: the front bank is up in 2-3 frames, over the swap
      // an ember burst from the impact
      embers(ctx, e, { x: hp[0] - 80, y: STY, w: 300 + 160 * g, h: 140 + 420 * g, count: Math.round(44 * (1 - g * 0.6)), seed: 's09-burst', wind: 0.2, size: 1.3, time: k });
    } },
  ],
  // the impact: a hard jolt that rings out over half a second
  shake(t) {
    if (t < T_HIT || t > T_HIT + 0.7) return [0, 0];
    const k = t - T_HIT;
    const a = 7.5 * Math.exp(-k * 6.5);
    return [a * Math.sin(k * 71), a * 0.9 * Math.cos(k * 57 + 0.6)];
  },
};
