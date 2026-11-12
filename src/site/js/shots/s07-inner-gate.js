// VII · THE GATE OPENS FROM WITHIN — the inner face of the Scaean gate by
// moonlight (plate 4: bright ivory stone, navy-black shadows), at the film's
// one scale (production standard 10): the passage is 13 men tall, so the
// four Greeks are tiny under colossal tarred doors barred at their chest.
// The city wall beside the towers is s03's height (GATE.stone.sideLow), so the
// gatehouse stands up into the night sky (standard 20). The four heave the bar
// up out of its cradles in two heaves (beats 57 and 58), let it down end first
// onto the paving (it lands on beat 60), run to the ropes that lie slack from
// the rings to two coils, take them up and haul the leaves toward us; the
// leaves shove the fallen bar along the moonlit paving, scoring it, and on the
// music's drop (beat 64, local 4.52, global 35.87), framed tight on the
// opening, the doors stand wide on the black passage and the moonlit plain
// beyond: the army's torches streaming to the gate and the returned fleet on
// the glinting night sea. The foreground is calm moonlit paving with two
// unequal column shadows and a band of the stoa roof's navy-black shadow near
// the frame's foot (standards 19, 24), with moonlit flags again in front of it.
// The gatehouse stands left of the frame's centre early on, with plate 4's
// cumulus bank low in the open sky on the moon's side (rule 5: an asymmetric
// split), and the camera comes round onto the gate's axis for the drop.
//
// The wall is drawn in elevation (GATE.stone via temple.js gateInner, the one
// inner-face design). Things in front of it (the leaves, the bar, the men)
// and behind it (the passage, the plain) are projected toward the eye point
// (GX, HZ) with a viewing distance D, so the leaves grow as they swing at the
// camera and show their bronze outer faces once they pass edge-on. The eye
// is 6.7 men up (HZ 240 above the ground at the wall).

import { sky, sea, distantCoast, cumulus } from '../kit/nature.js';
import { GATE, gateInner, gateStoneMat, floorStone, gateLeafSprite, beamSprite, paving, nightStreaks } from '../kit/temple.js';
import { gateLeafSprite as bronzeLeafSprite } from '../kit/gate.js';
import { odysseus, hoplite, crowd, warmCrowd, stride } from '../kit/figures.js';
import { galley } from '../kit/fleet.js';
import { RNG, clamp, lerp, ease, span } from '../engine/rng.js';
import { L } from '../engine/bake.js';
import { beatAt, START } from '../story.js';

const TAU = Math.PI * 2;
const G = 880, GX = 800, HZ = 640, D = 700;   // ground at the wall, gate axis, eye level, viewing distance
const W = GATE.leafW, H = GATE.leafH;          // 166 x 470 leaves, hinged at GX -/+ W
const OX = GATE.open.x1;                        // passage half-width (180)
const PD = 170;                                 // passage depth behind the leaves
const MO = D / (D + PD);                        // scale of its outer mouth
const MOUTH = { x0: GX - OX * MO, x1: GX + OX * MO, y0: HZ + (G - H - HZ) * MO, y1: HZ + (G - HZ) * MO };
const FH = 36;                                  // a man at the wall plane: the passage is 470 / 36 = 13 men tall (s06b: 12.6)
const T_LEAF = 18;                              // leaf thickness
const BEAM = GATE.beam;                         // the bar: centre GATE.beam.y above the ground (a man's chest), w x h
const RING = { u: (W - GATE.ring.x) / W, y: G - GATE.ring.y };   // the ring pull on each leaf's inner face, at hand height
const THMAX = 0.58 * Math.PI;                  // the ropes haul the leaves a little past square (104°), so their bronze outer faces turn to us at the drop
// project a point in front of (z > 0) or behind (z < 0) the wall plane
const P3 = (x, y, z) => { const m = D / (D - z); return [GX + (x - GX) * m, HZ + (y - HZ) * m, m]; };
// one light (standard 11) at the night's one elevation (standard 33): the moon
// stands high at the upper right beyond the gate, about 55 degrees up as in
// s05 and s06b, off the frame, so cast shadows fall short to the lower left in
// s06b's direction (B1's factors, LANDED 09:43: a point 1 unit up falls at
// x - 0.7, y + 0.372). Through the opening the night sea carries only a few
// glints toward the moon's side (no disc: a moon that high cannot be seen there)
const SH = { x: -0.7, y: 0.372 };
const SHADOW_INK = 'rgba(3,5,26,0.95)';             // cast shadows land in the navy-black of the shadow fields (standard 19)
const PAVE_LIT = 0.84;                              // the moonlit paving's light
const SHADOW = { len: -SH.x, side: -1, drop: SH.y / -SH.x, w: 0.07, color: SHADOW_INK };
const GLINT_X = 935;                                // the sea's glints lie toward the moon, at the opening's right

// ---- timing: every beat-locked event comes from the beat grid (standard 12).
// s07 starts on beat 56 and ends on 64 (the drop): local beats 0, 0.565 ... 4.52.
const B = (n) => beatAt(n) - START.s07;
const T_LIFT = [B(57), B(59)];      // the bar rises out of its cradles on their hands: two heaves, on beats 57 and 58
const HEAVE = 0.25;                 // each heave takes three drawings on twos, then they hold it
// The two pairs heave OUT OF STEP (round 6: the shot's first beat has to read).
// The left pair takes most of its travel on beat 57 and the right pair most of
// its own on beat 58, so between the beats the bar see-saws about 1 degree —
// its ends moving in opposite directions — instead of inching up level.
const LIFT_K = { '-1': 0.78, 1: 0.24 };   // each pair's share of its travel on beat 57 (the rest on beat 58)
// the lift 0..1: up on beat 57, hold, the rest on beat 58, hold to beat 59 (from the drawing on twos).
// k = -1 / +1 is the pair; k = 0 (the default) is the bar as a whole, which comes out of its cradles once.
const liftAt = (tq, k = 0) => {
  const a = k ? LIFT_K[k] : (LIFT_K['-1'] + LIFT_K[1]) / 2;
  return a * ease.out(span(tq, B(57), B(57) + HEAVE)) + (1 - a) * ease.out(span(tq, B(58), B(58) + HEAVE));
};
// D1's 'lift' phase at each end of the lift. Round 5 pressed from phase 0 (hands
// at the shoulders, 0.971 h) to 1 (locked overhead, 1.292 h): 0.32 h = 12 units,
// of which the bar's own z travel took 2.8 back, so the first beat of the shot
// moved the beam 6-7 px on a 900-px frame. D1's pose also carries a chest-grip
// range (phase -1..0), and at -0.6 the hands are at 0.775 h — exactly the beam's
// lower edge at this projection (its underside is 0.779 h above their feet), so
// the four start with their hands UNDER the beam, in a crouch, and press it to a
// full overhead lock: 0.517 h = 19.5 units of travel for the same two heaves.
const LIFT_PH = [-0.6, 1];
const T_LOWER = B(59.25);           // the left pair has let its end down: it drops to the paving
const T_REL = B(59.5);              // the right pair lets go
const T_LAND = B(60);               // the bar's right end hits the paving on the beat
const T_GRIP = B(61);               // on the ropes: heaves on 61 and 62
const T_ARR = T_GRIP - 0.165;       // at the rope: one drawing stooping for it, one rising with it (on twos), then the heave
const T_TAUT = T_GRIP - 0.04;       // the rope is taut from the ring through both men's hands
const T_CRACK = B(62);              // the leaves give
const T_OPEN = B(64);               // fully open on the drop (= dur)
const BEATLEN = B(62) - B(61);

function doorAngle(t) { // 0 shut, THMAX (a little past square) wide open toward the camera on the drop, still moving
  const crack = 0.05 * ease.out(span(t, T_CRACK, T_CRACK + 0.22));
  const k = span(t, T_CRACK + 0.12, T_OPEN);
  return THMAX * clamp(crack + (1 - crack) * (0.35 * ease.inOutSine(k) + 0.65 * k * k));
}

// ---- the leaves: k = -1 left (hinge GX - W), +1 right; sg points from the hinge to the meeting edge
const LEAVES = [
  { k: -1, sg: 1, hinge: GX - W, inner: 'leafL', innerLeft: true, outer: 'bronzeR', outerU: (u) => W * (1 - u) },
  { k: 1, sg: -1, hinge: GX + W, inner: 'leafR', innerLeft: false, outer: 'bronzeL', outerU: (u) => W * u },
];
const MOONV = [0.5, 0.6];                        // the faces' light in plan (x, toward the camera): the stone convention
function leafGeom(lf, th) {
  const c = Math.cos(th), s = Math.sin(th), sg = lf.sg;
  const inner = (u) => [lf.hinge + sg * u * W * c, u * W * s];
  const off = [T_LEAF * sg * s, -T_LEAF * c];    // inner face -> outer face
  const outer = (u) => { const p = inner(u); return [p[0] + off[0], p[1] + off[1]]; };
  const nIn = [-sg * s, c];
  const vis = (pt, n) => (GX - pt[0]) * n[0] + (D - pt[1]) * n[1] > 0;
  return { c, s, inner, outer, nIn, innerVis: vis(inner(0.5), nIn), outerVis: vis(outer(0.5), [-nIn[0], -nIn[1]]) };
}
// screen column of a leaf point (x, z) between the leaf's top and bottom
function column([x, z]) { const a = P3(x, G - H, z), b = P3(x, G, z); return { x: a[0], yt: a[1], yb: b[1] }; }

// Texture one face of a leaf from a sprite in vertical strips. Each strip is
// two affine pieces (the upper anchored to the top edge, the lower to the
// bottom edge), so both edges follow the perspective exactly.
// CHEAP (one scrub frame, never a steady frame): coarse strips, so dragging the
// scrubber across the swing does not pay for a full-quality drawing per step.
let CHEAP = 0;
function leafFace(ctx, e, sp, srcX, sy0, sh, colAt, half) {
  if (!sp || !sp.canvas) return;
  const cv = sp.canvas, k = cv.width / sp.region.w, ky = cv.height / sp.region.h;
  const c0 = colAt(0), c1 = colAt(1);
  // strips: enough that each changes height by at most ~3 device px (half 0 / 1: the first / second half of them)
  const n = clamp(Math.ceil(Math.abs((c1.yb - c1.yt) - (c0.yb - c0.yt)) * e.s / (CHEAP ? 9 : 3)), 1, CHEAP ? 8 : 26);
  const SEAM = 0.68, eps = 0.6, mid = Math.ceil(n / 2);
  for (let i = half === 1 ? mid : 0, i1 = half === 0 ? mid : n; i < i1; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    let ca = colAt(u0), cb = colAt(u1), sa = srcX(u0), sb = srcX(u1);
    if (sb < sa) { [ca, cb] = [cb, ca]; [sa, sb] = [sb, sa]; }      // ca = column of the source's left edge
    const sw = sb - sa;
    if (sw <= 0) continue;
    const ha = ca.yb - ca.yt, hb = cb.yb - cb.yt;
    const hu = SEAM * sh, hl = sh - hu;
    const over = Math.abs(ha - hb) * 0.5 + 1 / e.s;
    ctx.save();                                                      // upper piece, top edge exact
    ctx.transform((cb.x - ca.x) / sw, (cb.yt - ca.yt) / sw, 0, (SEAM * (ha + hb) / 2 + over) / hu, ca.x, ca.yt);
    ctx.drawImage(cv, (sa - eps) * k, sy0 * ky, (sw + 2 * eps) * k, hu * ky, -eps, 0, sw + 2 * eps, hu);
    ctx.restore();
    const dl = (1 - SEAM) * (ha + hb) / 2;                           // lower piece, bottom edge exact
    ctx.save();
    ctx.transform((cb.x - ca.x) / sw, (cb.yb - ca.yb) / sw, 0, dl / hl, ca.x, ca.yb - dl);
    ctx.drawImage(cv, (sa - eps) * k, (sy0 + hu) * ky, (sw + 2 * eps) * k, hl * ky, -eps, 0, sw + 2 * eps, hl);
    ctx.restore();
  }
}
const quad = (ctx, a, b) => { ctx.moveTo(a.x, a.yt); ctx.lineTo(b.x, b.yt); ctx.lineTo(b.x, b.yb); ctx.lineTo(a.x, a.yb); ctx.closePath(); };

// half: undefined = the whole leaf; 0 = its free edge and the first half of the face's strips; 1 = the rest
function drawLeaf(ctx, e, lf, th, half) {
  const gm = leafGeom(lf, th), sg = lf.sg;
  if (th > 0.004 && half !== 1) {                // the free edge: end grain, lit when turned to the moon
    const a = column(gm.inner(1)), b = column(gm.outer(1));
    const lam = clamp(MOONV[0] * sg * gm.c + MOONV[1] * gm.s);
    ctx.fillStyle = lam > 0.45 ? '#4a4643' : lam > 0.2 ? '#1d2029' : '#07070c';   // end grain: warm grey, navy-black (no plum, standard 15)
    ctx.beginPath(); quad(ctx, a, b); ctx.fill();
    if (lam > 0.2) {                             // the edge's make-up: the bronze facing's rim, the iron straps round it
      const at = (c, f) => [c.x, lerp(c.yt, c.yb, f)], mid = { x: lerp(a.x, b.x, 0.72), yt: lerp(a.yt, b.yt, 0.72), yb: lerp(a.yb, b.yb, 0.72) };
      ctx.fillStyle = '#211e1c'; ctx.beginPath(); quad(ctx, mid, b); ctx.fill();
      ctx.fillStyle = '#100f14'; ctx.beginPath();
      for (const f of [0.14, 0.5, 0.86]) {
        const p = [at(a, f - 0.009), at(b, f - 0.009), at(b, f + 0.009), at(a, f + 0.009)];
        ctx.moveTo(p[0][0], p[0][1]); for (const q of p) ctx.lineTo(q[0], q[1]); ctx.closePath();
      }
      ctx.fill();
    }
    ctx.beginPath(); quad(ctx, a, b);
    ctx.strokeStyle = '#02030a'; ctx.lineWidth = 1.2 / e.s; ctx.stroke();
  }
  let lam, corners;
  if (gm.innerVis || th < 0.004) {
    const sp = e.sprites[lf.inner];
    if (sp && sp.canvas) {
      const pad = (sp.region.w - W) / 2;
      leafFace(ctx, e, sp, (u) => (lf.innerLeft ? pad + u * W : pad + W - u * W), pad, H, (u) => column(gm.inner(u)), half);
    }
    lam = MOONV[0] * gm.nIn[0] + MOONV[1] * gm.nIn[1];
    corners = [column(gm.inner(0)), column(gm.inner(1))];
  } else {
    leafFace(ctx, e, e.sprites[lf.outer], lf.outerU, 0, H, (u) => column(gm.outer(u)), half);
    lam = -(MOONV[0] * gm.nIn[0] + MOONV[1] * gm.nIn[1]);
    corners = [column(gm.outer(0)), column(gm.outer(1))];
  }
  if (half === 0) return;
  const dark = clamp((0.6 - lam) * 0.95, 0, 0.84);   // turned from the moon, the face sinks toward navy-black
  if (dark > 0.02) { ctx.fillStyle = `rgba(1,2,12,${dark.toFixed(3)})`; ctx.beginPath(); quad(ctx, corners[0], corners[1]); ctx.fill(); }
  // swung out toward us, the leaf's foot stands in the stoa roof's shadow
  if (Math.max(corners[0].yb, corners[1].yb) > ROOF_TOP) inRoofShadow(ctx, () => {
    ctx.beginPath(); quad(ctx, corners[0], corners[1]);
    if (th > 0.004) quad(ctx, column(gm.inner(1)), column(gm.outer(1)));
    ctx.fill();
  });
}

// ---- the men. Two pairs lift the bar at its ends, standing right at it,
// their hands on it at shoulder height (GATE.beam: centre 30, 18 deep), then each
// pair hauls its leaf by a rope on the ring, from beside the hinge: outside
// the leaf's sweep and the fallen bar's path, so they back off under two
// strides as the leaf swings ('haul': planted feet).
const LIFT_Z = 34;                               // 4 units in front of the lifted bar's front face (z 21 + 9): it drops clear of their feet
const MEN = [
  { x: 572, k: -1, lead: false, fn: hoplite, cloak: 'navy', seed: 3 },
  { x: 618, k: -1, lead: true, fn: odysseus, seed: 4 },
  // the right pair's red cloak is on the rear man, who lifts in front of the right tower's moon shadow (navy-black),
  // and the navy one on the lead, in front of the moonlit strip of the jamb: both read at 1x
  { x: 982, k: 1, lead: true, fn: hoplite, cloak: 'navy', seed: 5 },
  { x: 1028, k: 1, lead: false, fn: hoplite, cloak: 'red', seed: 6 },
];
// haul spots of the left pair (the right pair mirrors): [start, after the swing]
const SPOT = { lead: [[552, 68], [518, 80]], rear: [[518, 84], [484, 96]] };
const Q32 = (v) => Math.round(v * 32) / 32;
function menAt(t) {
  const tq = Math.floor(t * 12) / 12;            // on twos
  const f = doorAngle(tq) / THMAX;
  return MEN.map((m, i) => {
    const mir = (v) => (m.k < 0 ? v : 2 * GX - v);
    const sp = m.lead ? SPOT.lead : SPOT.rear;
    const s0 = [mir(sp[0][0]), sp[0][1]], s1 = [mir(sp[1][0]), sp[1][1]];
    const dirIn = -m.k;                          // facing the gate's axis / the leaf
    const tLet = m.k < 0 ? T_LOWER : T_REL;      // when this man lets go of the bar
    let x = m.x, z = LIFT_Z, pose = 'lift', phase = 0, dir = dirIn, hold = false;
    if (tq < tLet) {
      const up = liftAt(tq, m.k);                                               // this pair's own heave (LIFT_K: out of step)
      const down = m.k < 0 ? ease.inOutSine(span(tq, T_LIFT[1], T_LOWER)) : 0;   // the left pair lets its end down first
      phase = lerp(LIFT_PH[0], LIFT_PH[1], Q32(up * (1 - down))); hold = true;
    } else if (tq < tLet + 1 / 12) {
      pose = 'stand';                            // let go: the arms come down
    } else if (tq < T_ARR) {                     // run to the rope lying on the paving, clear of the falling bar
      const k = ease.inOutSine(span(tq, tLet + 1 / 12, T_ARR));
      x = lerp(m.x, s0[0], k); z = lerp(LIFT_Z, s0[1], k);
      pose = 'run'; dir = m.k;
      phase = Q32((Math.hypot(s0[0] - m.x, s0[1] - LIFT_Z) * k / stride(FH, 'run') + i * 0.31) % 1);
    } else if (tq < T_ARR + 1 / 12) {            // stoop for it
      [x, z] = s0; pose = 'crouch';
    } else if (tq < T_TAUT) {                    // rise with it: the rope comes up off the paving
      [x, z] = s0; pose = 'pull'; phase = m.lead ? 0.06 : 0.12;
    } else if (tq < T_CRACK) {                   // heave on the beats: the leaves hold
      [x, z] = s0; pose = 'pull';
      phase = Q32(((((tq - T_GRIP) / BEATLEN + 0.5 + (m.lead ? 0 : 0.1)) % 1) + 1) % 1);
    } else {                                     // the leaf gives: step back with it, feet planted
      x = lerp(s0[0], s1[0], f); z = lerp(s0[1], s1[1], f);
      pose = 'haul';
      phase = Q32((Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) * f / stride(FH, 'haul') + (m.lead ? 0 : 0.5)) % 1);
    }
    const [px, py, pm] = P3(x, G, z);
    return { m, i, x: px, y: py, h: FH * pm, gx: x, z, dir, pose, phase, hold };
  });
}
// 'lift' with D1's full overhead press (reach): from a grip under the beam (LIFT_PH) the arms lock straight
// overhead and the men rise on their toes, so the beam rises 19.5 units and each man grows 3.4 units
const figOpts = (f) => ({ x: f.x, y: f.y, h: f.h, dir: f.dir, pose: f.pose, phase: f.phase, seed: f.m.seed, shield: false, spear: false, cloak: f.m.cloak, hero: true, ...(f.pose === 'lift' ? { reach: true } : {}) });
// hand anchors from the rig, measured at a fixed scale (the same level of detail at any viewport size)
const handsOf = (e, f) => f.m.fn(null, { ...e, s: 1, dpr: 1 }, { ...figOpts(f), measure: true })?.hands ?? [[f.x, f.y - f.h * 0.6], [f.x, f.y - f.h * 0.6]];

// ---- the bar: raised on their hands out of its cradles (z 12 -> 17, clear
// of the brackets), let down end first, then shoved along the paving by the
// swinging leaves (it lies across their sweep).
// The z travel is 5 units, not round 5's 9: every unit the beam comes toward
// the eye projects it 0.31 units back DOWN the screen, which was taking a
// quarter of the lift away. It still lands 8 units clear of the men's toes
// (its front face at z 26 against LIFT_Z 34).
const BEAM_Z = [12, 17];
const HELD = new Map();                          // each end's lift (y offset from the cradles) at the moment it is let go
let HANDS0 = null;                               // the pairs' hand height with the bar in its cradles (lift phase LIFT_PH[0])
const pairHands = (k, men, hands) => {
  const ys = [];
  men.forEach((f, i) => { if (f.m.k === k && f.hold) ys.push(hands[i][0][1], hands[i][1][1]); });
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
};
function beamPose(e, t, men, hands, th = doorAngle(t)) {
  const zl = lerp(BEAM_Z[0], BEAM_Z[1], liftAt(Math.floor(t * 12) / 12));
  const z = Math.max(zl, W * Math.sin(Math.min(th, Math.PI / 2)) + BEAM.h / 2 + 0.5);   // the swinging leaves shove it along the paving (it stays where they leave it)
  const [, yc, m] = P3(GX, G - BEAM.y, z);       // centre in the cradles
  const yg = P3(GX, G - BEAM.h / 2, z)[1];       // centre lying on the paving
  const half = (BEAM.h / 2) * m;
  if (!HANDS0) { const ms = menAt(0); const hs = ms.map((f) => handsOf(e, f)); HANDS0 = { [-1]: pairHands(-1, ms, hs), [1]: pairHands(1, ms, hs) }; }
  // an end moves with its pair's hands (they grip it), never below the cradles
  const lift = (k, ms, hs) => { const y = pairHands(k, ms, hs); return y == null ? null : Math.min(0, y - HANDS0[k]); };
  const held = (k, ms, hs) => { const d = lift(k, ms, hs); return d == null ? null : yc + d; };
  const rel = (k, tLet) => {                     // the end's lift when it was let go (computed once, relative to the cradles)
    if (!HELD.has(k)) { const ms = menAt(tLet - 1e-3); HELD.set(k, lift(k, ms, ms.map((f) => handsOf(e, f))) ?? 0); }
    return yc + HELD.get(k);
  };
  let yL = held(-1, men, hands), yR = held(1, men, hands);
  if (yL == null) yL = lerp(rel(-1, T_LOWER), yg, span(t, T_LOWER, T_LOWER + 0.13) ** 2);
  if (yR == null) yR = lerp(rel(1, T_REL), yg, span(t, T_REL, T_LAND) ** 2);
  if (t > T_LAND) yR -= 2.6 * m * Math.sin(Math.PI * span(t, T_LAND, T_LAND + 0.14));   // a small bounce
  const xl = GX - (BEAM.w / 2) * m, xr = GX + (BEAM.w / 2) * m;
  return { x: GX, y: (yL + yR) / 2, yL, yR, xl, xr, rot: Math.atan2(yR - yL, xr - xl), s: m, z, ground: P3(GX, G, z)[1], half };
}
// its moon shadow on the paving (the bar's height above the ground, cast along SH)
function beamShadow(ctx, b) {
  const hl = Math.max(0, b.ground - (b.yL + b.half)), hr = Math.max(0, b.ground - (b.yR + b.half)), bh = BEAM.h * b.s * 0.92;
  ctx.fillStyle = SHADOW_INK; ctx.beginPath();
  ctx.moveTo(b.xl + SH.x * hl, b.ground + SH.y * hl); ctx.lineTo(b.xr + SH.x * hr, b.ground + SH.y * hr);
  ctx.lineTo(b.xr + SH.x * (hr + bh), b.ground + SH.y * (hr + bh)); ctx.lineTo(b.xl + SH.x * (hl + bh), b.ground + SH.y * (hl + bh));
  ctx.closePath(); ctx.fill();
}
// Dust where the bar's END strikes the paving (one burst per end, over about
// 80 units of it, not along the bar). A cluster of lumpy lobes that mushrooms
// to about two thirds of a man over 0.5 s on twos, drawn BEFORE the bar, so it
// rises from behind the beam. Two flat tones in the night stone's family (no
// smooth gradient, style rule 3): a warm-grey body, and a moonlit crescent on
// its upper right, toward the moon, drawn as the same lobes shrunk and offset.
// Round 6: every lobe is an ANGULAR polygon, not an ellipse (style rule 3: the
// plate's edges are crisp and broken, and a ring of circles inside a circular
// silhouette was the one soft geometric shape in the frame). Each lobe walks 8
// vertices with its own radius jitter and one vertex pulled in to half, so its
// rim is torn; the sizes spread 0.45-1.65 so the cluster is not a uniform row;
// the moonlit crescent is the SAME polygon shrunk and offset toward the moon
// (up and to the right, -SH), so the two tones posterise as one shape; and a
// few flecks of grit sit on the paving inside the burst's width.
const DUST_BODY = '#7a7367', DUST_LIT = '#b6aca0';
const DUST_V = 8;                                   // vertices per lobe
function dustPuffs(ctx, e, xe, dir, y, m, t0, seed) {
  const k = Math.floor((e.t - t0) * 12) / 12 / 0.5;
  if (k <= 0 || k >= 1) return;
  const rng = new RNG(seed), n = 6, P = [];
  // the lobes sit across the end, from 50 units in along the bar to 34 beyond it (where the ivory flags are behind them)
  for (let i = 0; i < n; i++) {
    const vr = [];
    for (let j = 0; j < DUST_V; j++) vr.push(rng.range(0.8, 1.22));
    vr[rng.int(0, DUST_V - 1)] = 0.5;               // one vertex pulled in: the rim tears
    P.push({ px: xe + dir * m * rng.range(-38, 20), sz: rng.range(0.45, 1.65), side: rng.chance(0.62) ? dir : -dir,
      hi: rng.range(0.05, 0.85), a0: rng.range(0, TAU / DUST_V), vr, jx: rng.range(-0.08, 0.08), jy: rng.range(-0.08, 0.08) });
  }
  // grit kicked up over the flags just beyond the end (the beam is drawn after the dust, so grit
  // inside its footprint would be hidden): a few angular chips a man's hand wide
  const grit = [];
  for (let i = 0; i < 5; i++) grit.push([xe + dir * m * rng.range(-4, 40), rng.range(-10, -1), rng.range(1.5, 3)]);
  const a = 1 - Math.max(0, (k - 0.3) / 0.7) ** 1.2;     // it holds for the first drawings, then thins out
  const up = Math.min(1, k * 1.8);                        // most of the mushroom's height by the third drawing
  const poly = (q, cx, cy, r, f) => {
    for (let j = 0; j < DUST_V; j++) {
      const ang = q.a0 + (j / DUST_V) * TAU, rr = r * f * q.vr[j];
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr * 0.86;
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  for (const [col, al, fr, dx, dy] of [[DUST_BODY, 0.94, 1, 0, 0], [DUST_LIT, 0.92, 0.72, -SH.x * 0.34, -SH.y * 0.5]]) {
    ctx.fillStyle = col; ctx.globalAlpha = al * a; ctx.beginPath();
    for (const q of P) {
      const r = m * lerp(8, 19, Math.sqrt(k)) * q.sz;
      const cx = q.px + q.side * r * 0.42 * k + (dx + (fr < 1 ? q.jx : 0)) * r;
      const cy = y - m * (10 + 44 * q.hi) * up - r * 0.4 + (dy + (fr < 1 ? q.jy : 0)) * r;
      poly(q, cx, cy, r, fr);
    }
    ctx.fill();
  }
  ctx.fillStyle = DUST_BODY; ctx.globalAlpha = 0.92 * a; ctx.beginPath();
  for (const [gx, gy, gr] of grit) poly(P[0], gx, y + gy * m, gr * m, 1);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---- the haul ropes. Each is tied to its leaf's ring from the start: it hangs
// down the leaf, runs along the wall's foot behind the bar (the bar lands in
// front of it), turns out past the jamb under both haul spots and ends in a
// coil behind the rear man's spot. The men run to it, stoop, rise with it and
// it comes taut through their near hands; the rope taken in lies on the
// paving between the rear man and the coil. Ground points are (x, z) of the
// left leaf's rope; the right one mirrors.
const ROPE_ROUTE = [[690, 3.7], [600, 4], [566, 6.5], [552, 16], [549, 34], [551, 52], [546, 66], [531, 77], [508, 85], [486, 91], [470, 94]];
const COIL = { x: 456, z: 95, r0: 2.6, r1: 8.2, turns: 2.1 };
const RING_GX = GX - W + RING.u * W;            // the left leaf's ring, ground x, doors shut (the right one mirrors)
const ROPE_COL = ['#08080b', '#a9a49a'];
const ropeW = (e) => Math.max((1.3 / e.s) * (e.dpr || 1), 1.2);
function strokeRope(ctx, e, pts, w) {           // ink under, hemp over; smoothed through the midpoints
  if (pts.length < 2) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, lw] of [[ROPE_COL[0], w + 2 / e.s], [ROPE_COL[1], w]]) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  }
}
const mirX = (k, x) => (k < 0 ? x : 2 * GX - x);
// the coil on the paving (ground spiral, so the perspective foreshortens it), from its outer end inward
function coilPts(k) {
  const out = [], n = 34;
  for (let i = 0; i <= n; i++) {                 // starts on the side facing the route (+x for the left rope)
    const u = i / n, a = Math.PI + u * COIL.turns * TAU, r = lerp(COIL.r1, COIL.r0, u);
    out.push(P3(mirX(k, COIL.x - r * Math.cos(a)), G, COIL.z + r * Math.sin(a)));
  }
  return out;
}
const coilEnd = (k) => P3(mirX(k, COIL.x + COIL.r1), G, COIL.z);
// the slack rope: from the ring down the leaf and along the paving to the coil (screen points)
function slackRope(k, ring) {
  const pts = [ring, [ring[0] - k * 0.3, ring[1] + 9], P3(mirX(k, RING_GX - 1.5), G - 4, 3), P3(mirX(k, RING_GX - 4), G, 3.2)];
  for (const [x, z] of ROPE_ROUTE) pts.push(P3(mirX(k, x), G, z));
  pts.push(coilEnd(k));
  return pts;
}
// a span hanging between two screen points: a parabola with the given sag (world units, downward)
function sagSpan(a, b, sag, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) { const u = i / n; out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u) + 4 * sag * u * (1 - u)]); }
  return out;
}
// the rope taken in, lying on the paving from the ground point behind the rear man to the coil:
// a loose S that fills out as more rope comes in
function groundTail(k, tail, slackIn) {
  const end = coilEnd(k);
  const pts = [], n = 10, amp = Math.min(7, 1.2 + slackIn * 0.06);
  const dx = end[0] - tail[0], dy = end[1] - tail[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= n; i++) {
    const u = i / n, w = amp * Math.sin(u * Math.PI * 2.2) * Math.sin(u * Math.PI);
    pts.push([tail[0] + dx * u + nx * w * 0.35, tail[1] + dy * u + ny * w]);
  }
  return pts;
}

// ---- the army on the plain, in ground coordinates (X, distance beyond the
// wall): a broad stream from the beach that narrows as it funnels to the gate
const ARMY_PATH = [[330, 2550], [1000, 1250], [800, 210]];   // quadratic: beach -> gate mouth
const bez = (u) => {
  const [a, b, c] = ARMY_PATH, v = 1 - u;
  return [v * v * a[0] + 2 * u * v * b[0] + u * u * c[0], v * v * a[1] + 2 * u * v * b[1] + u * u * c[1]];
};
const ARMY_LEN = (() => { let l = 0; for (let i = 0; i < 64; i++) { const a = bez(i / 64), b = bez((i + 1) / 64); l += Math.hypot(b[0] - a[0], b[1] - a[1]); } return l; })();
const ARMY_V = 46;                                // world units per second along the stream
const ARMY = (() => {
  const rng = new RNG('s07-army');
  const out = [];
  const N = 150;
  for (let i = 0; i < N; i++) {
    const u = Math.min(0.95, Math.pow((i + rng.range(0, 1)) / N, 0.85));   // a little denser toward the beach
    const wid = lerp(330, 120, u);                                         // stream width (ground units)
    out.push({ u, off: (rng.next() - 0.5) * wid + rng.gauss(0, 8), hk: rng.range(0.93, 1.06), kind: rng.chance(lerp(0.75, 0.55, u)) ? 'torch' : rng.chance(0.3) ? 'greekRed' : 'greek', ph: rng.next(), sp: rng.range(0.85, 1.1) });
  }
  return out;
})();
const ARMY_NOW = ARMY.map(() => ({ x: 0, y: 0, h: 1, dir: 1, phase: 0, kind: 'greek' }));
function armyAt(m, dt) {                          // screen position of member m, dt seconds after the doors give
  const u = Math.min(0.97, m.u + (ARMY_V * m.sp * dt) / ARMY_LEN);
  const [X, Z] = bez(u), [X2, Z2] = bez(Math.min(1, u + 0.01));
  const tl = Math.hypot(X2 - X, Z2 - Z) || 1, nx = -(Z2 - Z) / tl, nz = (X2 - X) / tl;
  const gx = X + nx * m.off, gz = Math.max(PD + 24, Z + nz * m.off);
  const k = D / (D + gz);
  const x = GX + (gx - GX) * k, y = HZ + (G - HZ) * k;
  const k2 = D / (D + Z2 + nz * m.off), x2 = GX + (X2 + nx * m.off - GX) * k2;
  return { x, y, h: FH * k * m.hk, dir: x2 >= x ? 1 : -1, phase: (m.ph + (u * ARMY_LEN) / stride(FH, 'walk')) % 1 };
}
// the returned fleet on and beside the moon's glitter path, inside the passage mouth
const FLEET = [
  { x: 676, y: HZ + 9, s: 0.24, dir: 1 }, { x: 726, y: HZ + 4, s: 0.15, dir: 1 }, { x: 772, y: HZ + 7, s: 0.2, dir: 1 },
  { x: 930, y: HZ + 12, s: 0.42, dir: -1 }, { x: 818, y: HZ + 15, s: 0.46, dir: 1 }, { x: 878, y: HZ + 22, s: 0.55, dir: -1 },
];

// camera scale of a depth plane at another time (mirrors Stage.view/depthView), for the crowd warm-up
function focusAt(kf, t) {
  if (t <= kf[0].t) return kf[0];
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (t <= b.t) {
      const u = (ease[b.ease || 'inOutSine'] || ease.inOutSine)(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
      return { w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), u)), h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), u)) };
    }
  }
  return kf[kf.length - 1];
}
// Reduced motion holds two framings (standard 8; the stage's heldT does the same with shot.reducedT = REDUCED):
// the wide gate under the night sky while the bar comes up and goes down, then the opening from 3.9, so the
// reveal still reads. The drop's tight frame alone would hold 3.4 s of shut doors with 4% sky.
const REDUCED = [[0, 1.2], [3.9, 4.5]];
const heldAt = (t) => { let h = REDUCED[0][1]; for (const [from, at] of REDUCED) if (t >= from) h = at; return h; };
function zoomTo(e, t) {
  const shot = e.shot, A = e.W / e.H;
  const kf = A < 0.82 && shot.camPortrait ? shot.camPortrait : shot.cam;
  const sAt = (tt) => { const f = focusAt(kf, e.reduced ? heldAt(tt) : tt); return e.W / (f.w / f.h > A ? f.w : f.h * A); };
  return sAt(t) / sAt(e.t);
}

// nightStreaks() inks without a bbox; give its draw one so a layer of boxed draws can still crop
const boxed = (p, bbox) => { const q = Object.create(p); q.ink = (draw, o = {}) => p.ink(draw, { ...o, bbox }); return q; };

// ---- the plaza: moonlit paving, the shadow of the stoa's roof across the near
// foreground and two unequal column shadows from the right.
// Standard 24 and rule 5: the roof's shadow is a bounded band (ROOF_D deep) that ENDS at ROOF_X1, short of the
// frame's right side, where its raking end edge runs down-left along the moonlight; so the band is never a
// full-width bed, the bottom right corner is moonlit paving at every aspect, and the dark foreground mass sits on
// one side of the frame as in plates 1 and 4. Below the band the nearest flags carry the two column shadows.
const ROOF_Y = 1095, ROOF_D = 76, ROOF_X1 = 1500;
const roofEdge = (x) => ROOF_Y - ((x + 700) * 20) / 3000;   // the roof shadow's edge on the paving (antefix bumps rise up to 16 above it)
const ROOF_TOP = roofEdge(ROOF_X1) - 26;                     // the shadow's highest point anywhere
const ROOF_RAKE = (SH.x / SH.y) * ROOF_D;                    // the end edge leans along the light as it comes near (-188 at ROOF_D 100)
function roofShadow() {
  const rng = new RNG('s07-roof');
  const pts = [[-1700, roofEdge(-1700)]];
  // The far edge: the eaves' antefix bumps. Round 6: the rhythm varies instead of repeating (round 5 stepped
  // every 46-70 units at a height of 9-16, so at 16:9 the band's edge read as a row of about 30 identical dark
  // teeth - a decorative border rather than an eaves shadow). The bumps keep an antefix's width (24-48) and
  // the GAPS between them run 6-96, about a third of the bays carry none at all, the heights spread 5-24, and
  // every third bump is flat-topped.
  let nb = 0;
  for (let x = -1700; x < ROOF_X1;) {
    const bw = rng.range(24, 48), gp = rng.range(6, 96), y = roofEdge(x);
    if (rng.chance(0.3)) { x += bw + gp; continue; }
    const hh = rng.range(5, 24);
    pts.push([x, y]);
    if (++nb % 3 === 0) pts.push([x + bw * 0.28, y - hh], [x + bw * 0.74, y - hh]);
    else pts.push([x + bw * 0.34, y - hh], [x + bw * 0.62, y - hh * rng.range(0.72, 1)]);
    pts.push([x + bw, y]);
    x += bw + gp;
  }
  pts.push([ROOF_X1, roofEdge(ROOF_X1)]);
  // the roof's end, raking down-left along the moonlight in three broken steps
  for (let i = 1; i <= 3; i++) {
    const u = i / 3, xx = ROOF_X1 + ROOF_RAKE * u + rng.range(-7, 7);
    pts.push([xx, roofEdge(xx) + ROOF_D * (u - 1 / 6)], [xx, roofEdge(xx) + ROOF_D * u]);
  }
  // the near edge (the back of the roof): long straight runs broken by small steps of 8-14 units
  for (let x = ROOF_X1 + ROOF_RAKE; x > -1700;) {
    const run = rng.range(150, 380), dy = rng.range(-1, 1) * rng.range(8, 14);
    const x1 = Math.max(-1700, x - run), y = (xx) => roofEdge(xx) + ROOF_D + dy;
    pts.push([x, y(x)], [x1, y(x1)]);
    x = x1;
  }
  return pts;
}
// paint(), clipped to the roof's shadow on the paving, in its navy-black (things standing in the shadow)
let ROOF_PATH = null;
function inRoofShadow(ctx, paint) {
  if (!ROOF_PATH) { ROOF_PATH = new Path2D(); const pts = roofShadow(); ROOF_PATH.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ROOF_PATH.lineTo(q[0], q[1]); ROOF_PATH.closePath(); }
  ctx.save(); ctx.clip(ROOF_PATH); ctx.fillStyle = 'rgba(3,5,26,0.96)'; paint(); ctx.restore();
}
const stripe = (x, w, y0, y1) => { const d = (y1 - y0) / SH.y; return [[x, y0], [x + w, y0], [x + w + SH.x * d, y1], [x + SH.x * d, y1]]; };
// A cast-shadow field on the paving (standard 19): the flags fall to the
// navy-black tone and only the joint cores and chips stay a little lighter.
// Inside the shadow the guide's light L becomes max(0, |lit - L| - d) * k: the
// lit flags (about `lit`) and the soft ramps beside each joint go to 0, the
// darker joint cores come out light (0.32-0.46 -> ~0.12-0.24, the second tone).
// One clip for every field (same winding, so overlaps are not shaded twice).
const shadowField = (g, polys, lit, d, k) => {
  g.save(); g.beginPath();
  for (const pts of polys) { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  g.clip();
  const op = (mode, style) => { g.globalCompositeOperation = mode; g.fillStyle = style; g.fillRect(-3000, -3000, 9000, 9000); };
  op('difference', L(lit));                     // |lit - L|
  op('lighten', L(d)); op('difference', L(d));  // max(0, . - d)
  op('source-atop', `rgba(0,0,0,${1 - k})`);    // x k
  g.restore();
};
// the passage behind the leaves: black reveals running back to the moonlit mouth (left open for the plain)
function passage(p, mat) {
  const x = GX, y = G, top = y - H, m = MOUTH;
  p.pass(mat, (g) => {
    const poly = (pts, l) => { g.fillStyle = l; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]); g.closePath(); g.fill(); };
    poly([[x - OX, top], [x + OX, top], [m.x1, m.y0], [m.x0, m.y0]], L(0.02));                  // ceiling
    poly([[x - OX, top], [m.x0, m.y0], [m.x0, m.y1], [x - OX, y]], L(0.03));                     // left wall
    poly([[x + OX, top], [m.x1, m.y0], [m.x1, m.y1], [x + OX, y]], L(0.02));                     // right wall
    const fg = g.createLinearGradient(0, m.y1, 0, y);                                              // floor, moonlit at the mouth
    fg.addColorStop(0, L(0.7)); fg.addColorStop(0.22, L(0.42)); fg.addColorStop(0.5, L(0.05)); fg.addColorStop(1, L(0.02));
    poly([[x - OX, y], [x + OX, y], [m.x1, m.y1], [m.x0, m.y1]], fg);
    poly([[m.x0 - 7, m.y0 + 10], [m.x0, m.y0], [m.x0, m.y1], [m.x0 - 7, m.y1 + 2]], L(0.6));      // moonlight on the left reveal at the mouth
  }, { bbox: { x: x - OX - 4, y: top - 4, w: 2 * OX + 8, h: H + 8 } });
}

// ---- the doors actor. Everything it draws, as a list of draw calls (ctx, x) run in order (x: the actor
// environment to draw with; a cached drawing passes its own scale and time). The leaves swing on twos with
// the men who haul them (the shot's 12 fps grid), so from the crack to the drop every display frame of a
// drawing shows the same picture.
function doorParts(e, t) {
  const tq = Math.floor(t * 12) / 12;
  const th = doorAngle(tq), open = th / THMAX;
  const men = menAt(t);
  const hands = men.map((f) => (f.hold || f.pose === 'pull' || f.pose === 'haul' ? handsOf(e, f) : null));
  const parts = [];
  // the lintel's shade on the top of the shut doors, then the leaves
  const shut = 1 - span(open, 0, 0.25);
  // (each part may carry a weight w, its rough cost: half a swinging leaf ~ one and a half figures)
  const LW = th > 0.004 ? 1.5 : 0.25;
  parts.push(Object.assign((ctx, x) => {
    if (shut > 0) { ctx.save(); ctx.globalAlpha *= 0.35 * shut; ctx.fillStyle = '#020309'; ctx.fillRect(GX - W, G - H, W * 2, 46); ctx.restore(); }
    drawLeaf(ctx, x, LEAVES[0], th, 0);
  }, { w: LW }));
  for (const [lf, hf] of [[LEAVES[0], 1], [LEAVES[1], 0], [LEAVES[1], 1]]) parts.push(Object.assign((ctx, x) => drawLeaf(ctx, x, lf, th, hf), { w: LW }));
  // ropes, tied to the rings from the start: slack on the paving to a coil, taken up as the men
  // arrive (a stooping drawing, a rising one in which it hangs between their hands), then taut
  // from the ring through the lead's and the rear's near hands, the rope taken in lying behind
  const ropes = new Map(), lines = [];
  for (const lf of LEAVES) {
    const gm = leafGeom(lf, th);
    const [rx, rz] = gm.inner(RING.u);
    const rp = P3(rx + gm.nIn[0] * 2, RING.y, rz + gm.nIn[1] * 2), ring = [rp[0], rp[1]];
    lines.push(coilPts(lf.k));
    const li = men.findIndex((f) => f.m.k === lf.k && f.m.lead), ri = men.findIndex((f) => f.m.k === lf.k && !f.m.lead);
    if (tq < T_ARR + 1 / 12 || !hands[li] || !hands[ri]) { lines.push(slackRope(lf.k, ring)); continue; }
    const lead = men[li], rear = men[ri];
    const tail = P3(rear.gx + lf.k * 0.42 * FH, G, rear.z + 2);
    lines.push(groundTail(lf.k, tail, Math.max(0, 232 - Math.hypot(rx - lead.gx, rz - lead.z))));
    if (tq < T_TAUT) lines.push([...sagSpan(ring, hands[li][0], 9), ...sagSpan(hands[li][0], hands[ri][0], 2.5, 3).slice(1), ...sagSpan(hands[ri][0], tail, 1.2, 3).slice(1)]);
    else { ropes.set(li, { to: ring, from: hands[ri][0] }); ropes.set(ri, { to: hands[li][0], from: tail }); }
  }
  parts.push(Object.assign((ctx, x) => { const rw = ropeW(x); for (const pts of lines) strokeRope(ctx, x, pts, rw); }, { w: 0.4 }));
  // the bar and the men, back to front
  const b = beamPose(e, t, men, hands, th);
  const shoved = b.z > BEAM_Z[1] + 2;
  // dust where the bar's ends strike the paving: BEHIND the bar and the men, so the puffs rise from each end
  // instead of lying along the beam (only the end that hit raises it: the left at T_LOWER, the right on beat 60)
  parts.push(Object.assign((ctx, x) => {
    dustPuffs(ctx, x, b.xl, -1, b.ground, b.s, T_LOWER + 0.13, 's07-dustL');
    dustPuffs(ctx, x, b.xr, 1, b.ground, b.s, T_LAND, 's07-dustR');
  }, { w: 0.2 }));
  const order = [{ z: b.z, beam: true }, ...men.map((f) => ({ z: f.z, f }))].sort((a, c) => a.z - c.z);
  for (const it of order) {
    if (it.beam) {
      parts.push(Object.assign((ctx, x) => {
        if (shoved) scrapeTrail(ctx, x, b, tq);   // the leaves shove the fallen bar along the paving: it scores the flags
        beamShadow(ctx, b);
        x.drawSprite(ctx, 'beam', b.x, b.y, { s: b.s, rot: b.rot });
        if (b.ground + b.half > ROOF_TOP) inRoofShadow(ctx, () => {   // in the stoa roof's shadow it sinks into its navy-black
          const hx = (BEAM.w / 2 + 4) * b.s, hy = b.half + 3 * b.s, c = Math.cos(b.rot), sn = Math.sin(b.rot);
          ctx.translate(b.x, b.y); ctx.transform(c, sn, -sn, c, 0, 0); ctx.fillRect(-hx, -hy, 2 * hx, 2 * hy);
        });
      }, { w: 0.5 }));
      continue;
    }
    const f = it.f, r = ropes.get(f.i);
    parts.push((ctx, x) => {
      const o = { ...figOpts(f), shadow: SHADOW };
      if (r) Object.assign(o, { ropeFrom: r.from, ropeTo: r.to, ropeW: ropeW(x) });
      f.m.fn(ctx, x, o);
    });
  }
  return parts;
}
// The bar's ends score two dark trails on the moonlit flags as the leaves shove it toward us, with a few chips
// kicked up at each end on every drawing. The trails start on the lit flags clear of the threshold's navy band
// (z0 = where it fell + 14), in the stone's dark tone and at least 3 device px wide, so they read at 1x.
function scrapeTrail(ctx, e, b, tq) {
  const z0 = BEAM_Z[1] + 14, z1 = b.z - BEAM.h / 2;
  if (z1 <= z0) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.strokeStyle = '#3b352e'; ctx.globalAlpha *= 0.8; ctx.lineWidth = Math.max(3, 1.6 / e.s);
  ctx.beginPath();
  for (const sx of [-1, 1]) for (const d of [0.84, 0.97]) {
    const a = P3(GX + sx * (BEAM.w / 2) * d, G, z0), c = P3(GX + sx * (BEAM.w / 2) * d, G, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
  }
  ctx.stroke();
  ctx.globalAlpha /= 0.8; ctx.globalAlpha *= 0.9; ctx.fillStyle = '#4e463e';
  const rng = new RNG(`s07-chips${Math.round(tq * 12)}`);
  ctx.beginPath();
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const p = P3(GX + sx * (BEAM.w / 2) * rng.range(0.8, 1.04), G - rng.range(0, 7), b.z + rng.range(4, 14)), r = rng.range(1.25, 2) * p[2];
    ctx.moveTo(p[0] + r, p[1]); ctx.ellipse(p[0], p[1], r, r * 0.6, 0, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}
// Draw the doors actor. Each drawing renders once into a cached canvas at the camera's scale and every display
// frame blits it; the next drawing renders ahead into a second canvas, a few parts a frame, on the frames in
// between (WebKit: up to 104 skewed sprite strips and four hero figures cost ~10 ms of GPU-process work a
// frame). Only the bar's fall, its bounce and its dust draw live: they are timed to the beat, between drawings.
const Q_LAST = Math.floor(T_OPEN * 12 - 1e-6);           // the last drawing before the drop
// drawings that are pictures of their own: all but the bar's fall, its bounce and its dust (timed to the beat)
const Q_FALL = [Math.floor(T_LOWER * 12), Math.ceil((T_LAND + 0.5) * 12 - 1e-6) - 1];
const cacheable = (q) => q >= 0 && q <= Q_LAST && (q < Q_FALL[0] || q > Q_FALL[1]);
const DREG = { x0: 345, x1: 1230, y1: 986 };             // the cached picture's rect (actor units: the coils and the men's shadows inside; its top follows the leaves)
function doorsTop(th) {
  let top = G - H;
  for (const lf of LEAVES) { const gm = leafGeom(lf, th); for (const u of [0, 1]) for (const c of [column(gm.inner(u)), column(gm.outer(u))]) top = Math.min(top, c.yt); }
  return top - 6;
}
// The three drawing canvases come from the SHOT-owned cache (e.cache, ENGINE.md
// 'Actor environment'), so the stage frees them with s07's plates instead of
// their living on in the actor's state to the end card (round 5: 3 canvases of
// about 1.9 x 1.5 kpx = 8 Mpx at 1440x900@2). st.dim keeps the size each one has
// grown to, so a canvas is asked for at its own high-water mark and e.cache
// hands back the same canvas (it resizes, and so clears, only when it grows -
// which is exactly when runParts() redraws from part 0 anyway).
function planDrawing(e, st, q, S, i) {
  const tq = q / 12, y0 = doorsTop(doorAngle(tq));
  const pw = Math.ceil((DREG.x1 - DREG.x0) * S), ph = Math.ceil((DREG.y1 - y0) * S);
  const w = Math.max(st.dim[i][0], pw), h = Math.max(st.dim[i][1], ph);
  st.dim[i] = [w, h];
  const buf = e.cache('doors' + i, w, h);
  const t = tq + 1e-4, x = Object.assign(Object.create(e), { s: S, t, wall: (e.wall ?? e.t) + (t - e.t), q: (fps = 12) => Math.floor(t * fps) / fps, drawSprite: e.drawSprite });
  return { q, S, y0, pw, ph, i, buf, x, parts: doorParts(e, t), next: 0 };
}
// run parts of a planned drawing until their weights (default 1) reach the budget (at least one part)
function runParts(d, budget) {
  const g = d.buf.getContext('2d');
  if (d.next === 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, d.pw + 2, d.ph + 2); }
  g.setTransform(d.S, 0, 0, d.S, -DREG.x0 * d.S, -d.y0 * d.S);
  let used = 0;
  while (d.next < d.parts.length) {
    const part = d.parts[d.next], w = part.w ?? 1;
    if (used > 0 && used + w > budget) break;
    g.save(); try { part(g, d.x); } finally { g.restore(); }
    d.next++; used += w;
  }
  return d.next >= d.parts.length;
}
const drawLive = (ctx, e, cheap) => {        // every part straight onto the frame (no cache canvas)
  CHEAP = cheap ? 1 : 0;
  try { for (const part of doorParts(e, e.t)) { ctx.save(); part(ctx, e); ctx.restore(); } } finally { CHEAP = 0; }
};
function drawDoors(ctx, e) {
  const q = Math.floor(e.t * 12);
  if (!e.cache) { drawLive(ctx, e, false); return; }       // an env without the shot-owned cache: draw live
  const st = (e.st ?? e).doors ??= { dim: [[4, 4], [4, 4], [4, 4]], cur: null, ahead: [], last: null, pt: null, pw: null };   // (an env without st: no cache across frames)
  const free = () => [0, 1, 2].find((i) => i !== st.cur?.i && !st.ahead.some((d) => d.i === i));
  // Scrubbing or seeking: shot time is not advancing at 1x with the wall clock, so the cache and the
  // render-ahead (which are built for playback) cannot hold the drawing this frame needs. Rendering it at
  // full quality costs up to 83 ms a step in WebKit, and the frame is replaced 0.04 s later, so draw that
  // one frame live with coarse leaf strips instead: the sawtooth they show in a steady frame is invisible
  // for one scrub frame, and the next still frame (or the next played frame) renders at full quality again.
  // (in the lab e.wall is the rendered time itself, so no lab render is ever treated as a drag: plates and
  // verify always get the full-quality drawing. globalThis.B3X.noCheap turns the cheap path off for an A/B.)
  // Round 6: the FIRST frame of a drag counts as a drag too. Three tests, any of which means
  // 'this time was handed to us, not played': the shot time moved differently from the wall
  // clock (round 5's test, no longer capped at 0.5 s, so a drag that starts after the page has
  // sat still is caught on its first step); the wall clock jumped while the shot time crept
  // (a drag or a seek after a pause - but never a re-render of the SAME time, which is what a
  // paused still frame is); or a jump of more than two drawings.
  const dw = st.pw != null ? e.wall - st.pw : 0, dt = st.pt != null ? e.t - st.pt : 0;
  const drag = !globalThis.B3X?.noCheap
    && ((dw > 0 && (dt < -1e-4 || dt > dw * 1.6 + 0.004))
      || (dw > 0.4 && Math.abs(dt) > 1e-4 && dt < dw * 0.9)
      || (st.last != null && (q < st.last || q > st.last + 2)));
  st.last = q; st.pt = e.t; st.pw = e.wall;
  if (!cacheable(q)) { st.cur = null; drawLive(ctx, e, false); }
  else {
    const fits = (d) => d && d.q === q && Math.abs(d.S / e.s - 1) < 0.12;
    let live = false;
    if (!fits(st.cur)) {
      const i = st.ahead.findIndex(fits);
      const cand = i >= 0 ? st.ahead[i] : null;                      // a drawing being rendered ahead, finished or not
      const done = cand && cand.next >= cand.parts.length;
      if (cand && (done || !drag)) { st.cur = cand; st.ahead.splice(i, 1); runParts(st.cur, Infinity); }
      else if (drag) { live = true; drawLive(ctx, e, true); }   // neither finishing a drawing nor planning one; st.cur is kept, in case the drag comes back to it
      else { st.cur = null; st.ahead = []; st.cur = planDrawing(e, st, q, e.s, free()); runParts(st.cur, Infinity); }
    }
    const d = st.cur;
    if (!live && d) {
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(d.buf, 0, 0, d.pw, d.ph, DREG.x0, d.y0, d.pw / d.S, d.ph / d.S);
      ctx.restore();
    }
  }
  // the next two drawings render ahead (each at the camera's scale in the middle of its time on screen), a
  // few parts a frame: half a swinging leaf, or two figures and the ropes
  st.ahead = st.ahead.filter((d) => d.q > q && d.q <= q + 2 && d !== st.cur);
  for (const qa of [q + 1, q + 2]) {
    if (!cacheable(qa) || st.ahead.some((d) => d.q === qa)) continue;
    const b = free();
    if (b != null) st.ahead.push(planDrawing(e, st, qa, e.s * zoomTo(e, (qa + 0.5) / 12), b));
  }
  st.ahead.sort((a, c) => a.q - c.q);
  let budget = 2;
  for (const d of st.ahead) {
    if (budget <= 0) break;
    const before = d.next; let w = 0;
    for (let k = before; k < d.parts.length; k++) { const pw = d.parts[k].w ?? 1; if (w > 0 && w + pw > budget) break; w += pw; }
    if (d.next < d.parts.length) { runParts(d, budget); budget -= w; }
  }
}

export default {
  id: 's07', dur: 4.52, night: true,
  caption: 'THE GATE OPENS FROM WITHIN',
  captionPos: 'bottom', captionPosPortrait: 'top',
  reducedT: REDUCED,          // two held framings (see REDUCED above): the wide gate, then the opening from 3.9
  // Production standards 20 and 24, rule 5. The city wall beside the towers is s03's height (GATE.stone.sideLow),
  // so the towers stand up into the night sky: ~25% of the frame is bright sky at the start, ~16% in the push to
  // the door base for the bar's fall and the haul. The gatehouse stands left of the frame's centre (an asymmetric
  // split: plate 4's bank in the open sky on the moon's side), and the camera comes round onto the gate's axis as
  // the leaves give, then tightens on the opening, so the moonlit plain carries the drop. The caption sits on the
  // moonlit paving with the caption wash; the stoa roof's shadow is a bounded band near the frame's foot (at most
  // ~12% of the frame at any aspect). The men are 3.3% of the frame high at the start, ~3.9% in the push and ~5%
  // at the drop.
  cam: [
    { t: 0, x: 965, y: 540, w: 2130, h: 1198 },
    { t: 1.2, x: 958, y: 544, w: 1960, h: 1102, ease: 'inOutSine' },     // the bar is high: a little tighter than round 5, so the lift reads (the men 3.3% -> 3.5% of the frame)
    { t: 2.5, x: 930, y: 600, w: 1860, h: 1046, ease: 'inOutSine' },     // the bar has landed (beat 60); the ropes
    { t: 3.6, x: 812, y: 604, w: 1840, h: 1035, ease: 'inOutSine' },     // the leaves have given (beat 62): round onto the axis, then the push
    { t: 4.52, x: 800, y: 692, w: 1351, h: 760, ease: 'inOutSine' },     // wide open on the drop: the leaves' tops stay in
  ],
  // phones (fitted by width: w sets the frame): the gate's full height, the men low in the frame on the moonlit
  // paving, the caption at the top on the night sky between the towers; push to the bar's landing, then widen so
  // the rear haulers stay inside as they run in, and both pairs, their ropes and coils at the drop. Tablets in
  // portrait (aspect 0.69-0.75, fitted by height: h sets the frame) keep the men's feet, the coils and the open
  // leaves' feet inside and the caption at least ~20 units above the curtain's merlons, with sky above the towers.
  camPortrait: [
    { t: 0, x: 842, y: 330, w: 725, h: 1215 },
    { t: 1.2, x: 838, y: 336, w: 712, h: 1205, ease: 'inOutSine' },
    { t: 2.26, x: 822, y: 362, w: 640, h: 1190, ease: 'inOutSine' },    // the bar lands (beat 60)
    { t: 2.62, x: 800, y: 364, w: 730, h: 1195, ease: 'inOutSine' },    // the rear haulers reach their spots
    { t: 3.2, x: 800, y: 358, w: 780, h: 1205, ease: 'inOutSine' },     // both pairs on the ropes
    { t: 4.52, x: 800, y: 352, w: 830, h: 1220, ease: 'inOutSine' },    // the rear haulers, the coils and the leaves' feet inside at the drop
  ],
  // sprites bake at the shot's densest depth-1 scale (the drop's frame) x maxScale: the leaves come up to
  // 1.31x nearer than the wall plane as they swing open at the drop, so they bake at 1.3
  sprites: {
    leafL: gateLeafSprite({ side: 'left', maxScale: 1.3 }),
    leafR: gateLeafSprite({ side: 'right', maxScale: 1.3 }),
    bronzeL: bronzeLeafSprite({ side: 'left', w: W, h: H, maxScale: 1.3, lift: 0.12 }),   // moonlit plates and bosses on the outer faces
    bronzeR: bronzeLeafSprite({ side: 'right', w: W, h: H, maxScale: 1.3, lift: 0.12 }),
    beam: beamSprite({ maxScale: 1 }),
  },
  shake: (t) => (t > T_LAND && t < T_LAND + 0.18 ? [0, Math.sin((t - T_LAND) * 80) * 3.5 * (1 - (t - T_LAND) / 0.18)] : [0, 0]),
  items: [
    // ---- the night beyond the walls. The flat night sky is a smooth gradient, so it bakes at a third of the
    // resolution; the streak clouds over the battlements are drawn in the gate layer, behind its walls.
    { layer: 'sky', depth: 1, res: 0.35, paint(p) { sky(p, { y0: -900, y1: HZ + 4 }); } },
    // through the passage: the moon, the bank, the fleet's sea and the plain (every draw boxed: the layer crops
    // to the opening and bakes at full resolution for the drop)
    { layer: 'plain', depth: 1, paint(p) {
      // plate 4's bank on the horizon, left of the sails, with the moon at its upper right (standard 7).
      // Round 6: it was 190 x 44, whose typical lobe (0.07 x sqrt(w x h) = 6.4 units) fell under the night
      // engraving's minimum radius, so the hero reveal's one cloud got no contour strokes, no crevice lace
      // and no white cap - a grey-white blob behind the sails. Now a low wide bank with lobes 2.4x bigger
      // (`lobe`), which still leaves two thirds of the mouth's 185-unit sky to the night.
      cumulus(p, { x: 720, y: HZ - 1, w: 240, h: 80, towers: 2, seed: 's07-bank', light: [0.5, -0.72], detail: 0.7, lobe: 1.6 });
      nightStreaks(boxed(p, { x: 470, y: HZ - 50, w: 680, h: 40 }), { x0: 630, x1: 990, y: HZ - 30, depth: 12, count: 6, seed: 's07-st', scale: 0.5 });
      // the night sea: a few glints toward the moon, which stands high off the frame at the upper right
      sea(p, { horizon: HZ, bottom: HZ + 52, x0: 560, x1: 1040, near: 0.25, far: 0.03, glints: [{ x: GLINT_X, y: HZ + 8, rx: 46, ry: 5, a: 0.75 }, { x: GLINT_X + 10, y: HZ + 30, rx: 80, ry: 12, a: 0.7 }] });
      distantCoast(p, { x0: 600, x1: 724, y: HZ + 1, h: 8, seed: 's07-ten' });
      p.pass(p.mat.sand, (g) => {
        const gr = g.createLinearGradient(0, HZ + 50, 0, 860);
        gr.addColorStop(0, L(0.5)); gr.addColorStop(0.3, L(0.62)); gr.addColorStop(1, L(0.74));
        g.fillStyle = gr; g.fillRect(560, HZ + 50, 480, 860 - HZ - 50);
        const rng = new RNG('s07-dunes');                                                   // low dunes, long moon shadows
        for (let i = 0; i < 9; i++) {
          const yy = HZ + 62 + i * i * 2.2 + rng.range(-3, 3), x0 = rng.range(560, 900), w = rng.range(160, 420);
          g.fillStyle = L(0.5); g.beginPath(); g.ellipse(x0 + w / 2, yy, w / 2, 1.2 + i * 0.45, 0, 0, TAU); g.fill();
        }
        g.fillStyle = L(0.96); g.fillRect(560, HZ + 50, 480, 2.5);                         // the moonlit beach line
      }, { bbox: { x: 556, y: HZ + 48, w: 488, h: 864 - HZ - 48 } });
    } },
    { actor: 'army', depth: 1, draw(ctx, e) {
      const t = e.t;
      if (doorAngle(t) < 0.004) {             // nothing shows through shut doors: build the crowd glyphs now
        if (!e.st.warm) e.st.warm = warmCrowd(e, { h: [FH * 0.2, FH * 0.82], zoom: zoomTo(e, e.dur), kinds: ['greek', 'greekRed', 'torch'], dirs: [1, -1], stand: false, night: true, budget: 0.8, ctx });
        return;
      }
      for (const f of FLEET) galley(ctx, e, { ...f, sail: 'white', oars: e.q(12) * 0.6, row: true, wake: 0.5 });
      const dt = e.reduced ? 0 : Math.max(0, e.q(12) - T_CRACK);
      for (let i = 0; i < ARMY.length; i++) Object.assign(ARMY_NOW[i], armyAt(ARMY[i], dt), { kind: ARMY[i].kind });
      ARMY_NOW.sort((a, b) => a.y - b.y);
      // torches (the storyboard's red dots): a small dark-red halo behind each near flame (crowd() draws the
      // flame itself), and a red dot with a cream core on the torch of each figure under ~14 css px
      const css = e.s / (e.dpr || 1), fl = e.reduced ? 0 : Math.floor(t * 12);
      const tx = (m) => m.x + 0.17 * m.h * m.dir, ty = (m) => m.y - 1.06 * m.h;
      ctx.fillStyle = '#791b14'; ctx.beginPath();
      for (const m of ARMY_NOW) if (m.kind === 'torch' && m.h * css >= 14) { const r = m.h * 0.085; ctx.moveTo(tx(m) + r, ty(m)); ctx.arc(tx(m), ty(m), r, 0, TAU); }
      ctx.fill();
      crowd(ctx, e, ARMY_NOW, { night: true });
      for (const [col, k] of [['#c62c1f', 1], ['#f3e2bf', 0.42]]) {
        ctx.fillStyle = col; ctx.beginPath();
        ARMY_NOW.forEach((m, i) => {
          if (m.kind !== 'torch' || m.h * css >= 14) return;
          const r = clamp(m.h * 0.16, 1.6, 3.2) * k * ((fl + i) % 3 ? 1 : 0.82);
          ctx.moveTo(tx(m) + r, ty(m)); ctx.arc(tx(m), ty(m), r, 0, TAU);
        });
        ctx.fill();
      }
    } },
    // ---- the gate, inner face, by moonlight from the upper right: GATE.stone (temple.js)
    { layer: 'gate', depth: 1, res: 0.8, paint(p) {
      // plate 4's sky on the moon's side: a cumulus bank over the right-hand wall (its base behind the wall-walk;
      // from s06b's view the stoa hides it), lit from the moon's own elevation (standard 33: 55 degrees up at the
      // right, so light [0.5, -0.72]), with a row of horizontal streak clouds above it; and s07's streaks over the
      // left-hand wall, which s06b maps into its frame ('s07-hl').
      // Round 6: plate 4's bank is a few big humps with white caps, not a long shallow strip of foam. The strip was
      // 980 x 176 with 3 towers, of which the frame showed a 7:1 slice above the merlons, so every billow was a
      // floret; it is now narrower and twice as tall (two towers in 780 x 250) and sits where the camera's pan keeps
      // it in frame, so each hump is a dome with a lit cap and a shaded flank the engraving can model.
      cumulus(p, { x: 1660, y: 614, w: 780, h: 215, towers: 2, seed: 's07-bankR', light: [0.5, -0.72], detail: 0.8 });
      nightStreaks(p, { x0: 1460, x1: 2300, y: 262, depth: 26, count: 5, seed: 's07-hi', scale: 0.85 });
      nightStreaks(p, { x0: -700, x1: 180, y: 490, depth: 22, count: 4, seed: 's07-hl', scale: 0.8 });
      // one stone for the gate and the paving: GATE.stone's material, which carries L1c's mark vocabulary (standard 18)
      const mat = gateStoneMat(p);
      // the paving in L1c's calm floor stone (standard 26: the marks go on the walls, not the floor)
      paving(p, { x0: -1600, x1: 3200, yFar: G - 6, yNear: 1500, hz: HZ, vx: GX, slab: 230, rowStep: 0.3, light: PAVE_LIT, joint: 0.46, nearShade: 0.2, farShade: 0.25, seed: 's07-pave', mat: floorStone(p),
        // irregular flagstones (B1), joints lighter than the ink, and plate 4's worn flags: each flag has its own
        // face light, so about a fifth of the field lands in night stone's tone 4 and only the odd flag reaches the
        // top tone (standard 31: a night floor keeps real mid-tones instead of printing as blank paper)
        // Round 6, after L1c's seventh night tone (standard 38): the worn flags now use the ramp's MIDDLE
        // register instead of crowding its top two bands. 0.62 lands in N.stone's new tone 4 (L 169), 0.72 in
        // tone 5 (L 200) and 0.80 / 0.90 in the top tone (L 232), so the floor reads as worn limestone with
        // real mid-tones and the frame stops being brighter than any plate (the continuity judge's item).
        flags: { split: 0.5, joints: [0.32, 0.46], face: [[0.64, 1.5], [0.74, 2.5], [0.82, 4], [0.92, 3]] },
        // the stoa roof's shadow near the frame's foot and two unequal column shadows from the right: a narrow one
        // left of the gate, a broad one from the right tower's foot toward the middle of the foreground
        // (the colonnade that casts them is open, so both stripes run on past the band over the nearest flags)
        guideExtra: (g) => shadowField(g, [roofShadow(), stripe(300, 40, G - 4, 1460), stripe(1250, 96, G - 4, 1460)], PAVE_LIT, 0.22, 0.85) });
      passage(p, mat);
      // the city wall at s03/s04's height (GATE.stone.sideLow: 0.58 passages; the wall-walk follows), so the towers
      // stand up into the night sky (standard 20); the walls run to x -690 / 2490, past a 21:9 opening frame
      gateInner(p, { x: GX, y: G, s: 1, mat, sides: { left: 900, right: 1100, h: GATE.stone.sideLow }, seed: 's07' });
    } },
    // ---- the doors, the bar and the men
    // ---- the doors, the bar and the men (on twos; cached per drawing while the leaves swing)
    { actor: 'doors', depth: 1, draw(ctx, e) { drawDoors(ctx, e); } },
  ],
};
