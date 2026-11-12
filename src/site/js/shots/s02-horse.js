// II · THE OFFERING — a low angle on the wooden horse left on the shore.
// It towers against the flat cobalt sky and a cumulus bank (production
// standard 34: no distant Troy, whose scale could not match s01's across the
// 4.62 cut); the sea and the last of the departing fleet lie on the left
// horizon. Tiny Trojans come in from off-frame right (from the city s01 left
// behind the horse) to look, and the dedication board on the platform is
// legible. The shot holds on the whole horse, ears to wheels, with open sky
// above it for the top caption, then pushes in and up the neck to the head.
//
// The sky carries its own incidents (production standard 37): the bank runs
// off the top-right corner, three tiers of torn streaks sit at different
// heights instead of one band on the horizon, and a flock of gulls crosses
// the open cobalt in near-black silhouette. The sand is worked edge to edge,
// as plate 5's beach: posterised steps (never a gradient), bundles of broken
// wind lanes, a pebble band, wrack, and the onlookers' footprints trailing
// back to the city.

import { sky, cumulus, streaks, sea, surf } from '../kit/nature.js';
import { L } from '../engine/bake.js';
import { RNG, lerp, ease, clamp } from '../engine/rng.js';
import { poly } from '../kit/geom.js';
import { trojan, stride } from '../kit/figures.js';
import { galley } from '../kit/fleet.js';
import { horseSprite } from '../assets/horse.js';
import { beatAt, START } from '../story.js';

const HZ = 805;               // horizon = eye level of a standing onlooker
const GY = 870;               // ground line under the horse
const HS = 0.98;              // horse scale
const HX = 600;               // horse centre

// Onlooker height from where its feet stand (eye level sits on the horizon).
const hAt = (y) => (y - HZ) * 1.08;
// the beat grid (standard 12): the hold ends on beat 10, two beats into the shot
const BT = (n) => beatAt(n) - START.s02;
const HOLD = BT(10);

// Sandy plain from the horizon down. The sand takes M.sand as L1c tuned it
// (standard 18): round 5 clamped the material's hatch band to a 0.05-wide
// sliver and gated it to the guide's B channel, so the open sand could not
// carry a single stroke (the round-5 fidelity SHOULD). Now the whole lit band
// is live, so the material engraves the beach edge to edge as in plate 5, and
// the shot adds only light, wind lanes and litter on top.
const sandMat = (p) => p.mat.sand;
// Posterised steps instead of a gradient (STYLE rule 3). The two-stop ramps
// were the whole of the portrait frame's smooth-ramp count, so each step is a
// flat fill whose edge is broken into angular bites: dry crests over damp
// hollows, never a ramp. `bands` = [[world y of the step, light], ...] from
// far to near; each step fills from its own broken edge down to the bottom.
function sandSteps(g, p, bb, bands, seed) {
  const rng = new RNG(seed);
  const bot = bb.y + bb.h + 4;
  for (const [y, l] of bands) {
    const pts = [];
    for (let x = bb.x - 8; x <= bb.x + bb.w + 8; x += 34) pts.push([x, y + rng.range(-11, 11) + (rng.chance(0.25) ? rng.range(-16, 16) : 0)]);
    pts.push([bb.x + bb.w + 8, bot], [bb.x - 8, bot]);
    g.fillStyle = L(l); g.beginPath(); poly(g, pts); g.fill();
  }
}
// Far plain at the horizon (moves with the far layer so the horizon never
// opens onto sky when the camera tilts).
function farPlain(p) {
  const r = p.region;
  const bb = { x: r.x - 4, y: HZ - 1, w: r.w + 8, h: 420 };
  p.pass(sandMat(p), (g) => {
    g.fillStyle = L(0.62); g.fillRect(bb.x, bb.y, bb.w, bb.h);
    sandSteps(g, p, bb, [[HZ + 9, 0.66], [HZ + 26, 0.7], [HZ + 52, 0.74]], 's02-far');
    g.fillStyle = L(0.4); g.fillRect(bb.x, HZ, bb.w, 4);       // scrub along the horizon
    g.fillStyle = L(0.5); g.fillRect(bb.x, HZ + 4, bb.w, 3);
  }, { bbox: bb });
}

const NEAR = GY - 36; // where the near ground plane takes over
// Plate 5's beach: bundles of broken wind lanes parallel to the shore with
// clean sand between them, in three tones (the drift lines the darkest and
// sparsest), each stroke 30-120 world units long and thickening toward the
// camera, with a spread of angles so the field is not one ruled comb. A
// pebble band and two or three pieces of wrack lie in the right-hand third
// where the onlookers come down, and footprint pairs trail back behind the
// walkers to the city off-frame right.
const LANE_TONES = ['#8a8170', '#a89e8b', '#55503f'];
function sandMarks(ctx, p, bb) {
  const r = new RNG('s02-lanes');
  const lanes = [[], [], []];
  // rows from just under the horizon down past the bottom of the frame; the
  // spacing and the stroke weight grow toward the camera
  for (let row = 0, y = NEAR + 10; y < bb.y + bb.h + 30; row++) {
    const persp = 1 + (y - NEAR) / 230;
    // bundles of three to six rows, then one or two rows of clean sand
    const inBundle = (Math.floor(row / 2) + Math.floor(row / 7)) % 3 !== 2 || r.chance(0.3);
    if (inBundle) {
      const ang = r.range(-0.2, 0.2) + (r.chance(0.3) ? r.range(-0.22, 0.22) : 0);   // a wide spread, mean level
      let x = bb.x + r.range(-60, 40);
      while (x < bb.x + bb.w) {
        const len = r.range(30, 120) * (row < 4 ? 0.5 : 1);
        const gap = r.range(14, 70) + persp * 9;
        if (r.chance(0.22)) { x += len + gap; continue; }
        const th = r.range(1.1, 2.6) * persp;
        const dark = r.chance(0.07);
        const a = ang + r.range(-0.06, 0.06);
        lanes[dark ? 2 : r.chance(0.3) ? 0 : 1].push([x, y + r.range(-3, 3), x + len, y + r.range(-3, 3) + len * a, dark ? th * 0.6 : th]);
        x += len + gap;
      }
    }
    y += 7 + persp * 4.5;
  }
  lanes.forEach((set, i) => {
    ctx.fillStyle = LANE_TONES[i];
    ctx.beginPath();
    for (const [ax, ay, bx, by, th] of set) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + th); ctx.lineTo(ax, ay + th * 0.5); ctx.closePath(); }
    ctx.fill();
  });
  // a pebble band and small shell grit, loosest where the onlookers walk
  const pr = new RNG('s02-pebbles');
  ctx.fillStyle = '#6f685a'; ctx.beginPath();
  for (let i = 0; i < 230; i++) {
    const t = pr.range(0, 1), x = lerp(980, 1860, t) + pr.range(-60, 60);
    const y = lerp(858, 1010, Math.pow(pr.range(0, 1), 0.6)) + pr.range(-8, 8);
    const rx = pr.range(1.2, 3.4) * (1 + (y - 858) / 220), ry = rx * pr.range(0.4, 0.7);
    ctx.moveTo(x - rx, y); ctx.lineTo(x - rx * 0.3, y - ry); ctx.lineTo(x + rx, y - ry * 0.4); ctx.lineTo(x + rx * 0.4, y + ry); ctx.closePath();
  }
  ctx.fill();
  // wrack and a piece of driftwood left by the tide
  const wr = new RNG('s02-wrack');
  for (const [wx, wy, wl, wa] of [[1130, 930, 86, 0.1], [1620, 884, 54, -0.08], [1392, 1028, 118, 0.06]]) {
    const pts = [];
    for (let i = 0; i <= 7; i++) { const u = i / 7; pts.push([wx + wl * u, wy + wl * wa * u + wr.range(-3.5, 3.5)]); }
    const th = 4 + wl * 0.035;
    ctx.fillStyle = '#4a463a'; ctx.beginPath();
    poly(ctx, [...pts, ...pts.slice().reverse().map(([x, y]) => [x, y + th])]); ctx.fill();
    ctx.fillStyle = '#9c9484'; ctx.beginPath();
    poly(ctx, [...pts.map(([x, y]) => [x, y - 1.2]), ...pts.slice().reverse().map(([x, y]) => [x, y + 0.6])]); ctx.fill();
  }
  // footprint pairs trailing back to the right edge behind the walkers
  const fr = new RNG('s02-prints');
  ctx.fillStyle = '#7b7465'; ctx.beginPath();
  for (const [x0, y0, step, n] of [[1216, 893, 31, 20], [1270, 888, 29, 19], [1420, 849, 22, 18], [1500, 851, 21, 16]]) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step + fr.range(-3, 3), y = y0 + fr.range(-2.5, 2.5) - i * 0.25;
      if (x > 1900) break;
      const s = 1 + (y - 840) / 160, side = i % 2 ? 1 : -1;
      const px = x, py = y + side * 3.4 * s;
      ctx.moveTo(px - 3.6 * s, py); ctx.lineTo(px + 0.4 * s, py - 2.2 * s); ctx.lineTo(px + 4 * s, py - 0.6 * s); ctx.lineTo(px + 2.4 * s, py + 2 * s); ctx.lineTo(px - 2.6 * s, py + 1.9 * s); ctx.closePath();
    }
  }
  ctx.fill();
}
function plain(p) {
  const r = p.region;
  const bb = { x: r.x - 4, y: NEAR, w: r.w + 8, h: r.y + r.h - NEAR + 6 };
  p.pass(sandMat(p), (g) => {
    g.fillStyle = L(0.75, 0, 0, 0); g.fillRect(bb.x, bb.y, bb.w, 2);       // a soft top row: the far plain shows through
    g.fillStyle = L(0.76); g.fillRect(bb.x, bb.y + 2, bb.w, bb.h);
    sandSteps(g, p, bb, [[NEAR + 28, 0.81], [NEAR + 96, 0.86], [NEAR + 210, 0.8]], 's02-near');
    // damp hollows the tide left behind (the sand ramp's mid grey, plate 5)
    const dr = new RNG('s02-damp');
    g.fillStyle = L(0.56); g.beginPath();
    for (let i = 0; i < 7; i++) {
      const cx = dr.range(bb.x + 60, bb.x + bb.w - 60), cy = dr.range(GY + 6, GY + 190), rx = dr.range(40, 130), ry = rx * dr.range(0.12, 0.22);
      const pts = [];
      for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx * dr.range(0.82, 1.12), cy + Math.sin(a) * ry * dr.range(0.78, 1.2)]); }
      poly(g, pts);
    }
    g.fill();
    // wheel ruts from the shore
    g.fillStyle = L(0.5);
    for (const dy of [3, 7]) g.fillRect(bb.x, GY + dy, HX - 300 * HS - bb.x, 1.6);
  }, { bbox: bb });
  p.ink((ctx) => sandMarks(ctx, p, bb), { bbox: bb });
}
// ONE SUN for the whole frame (standard 11 and standard 25's one shadow
// family). A point h above the sand throws its shadow SX x h to the right and
// SY x h toward the camera. Round 5 threw the horse's shadow AWAY from the
// camera while figures.js threw the onlookers' toward it, so one frame carried
// two suns; and at this low angle (the sand plane is almost edge-on: the whole
// ground from the horizon to the horse is 65 units of screen) a receding
// shadow has no area at all, which is why it printed as a 980 x 9 px ruler.
// So the horse now takes the figures' own direction, which is also s01's
// across the 4.62 cut (its horse throws its shadow right and forward): the
// shadow sweeps out over the open sand where its form can read.
// SX and SY are s01's own values for this same horse on this same beach
// (s01-coast.js throws it 1.49 x its height right and 0.20 x its height
// forward), so the two shots either side of the 4.62 cut share one sun.
// figures.js throws gx = len x h sideways and gy = drop x len x h in depth, so
// len = SX and drop = SY / SX.
const SX = 1.5, SY = 0.17;
const FIG_SHADOW = { len: SX, side: 1, drop: SY / SX, color: 'rgba(18,20,17,0.62)' };
// The horse's own silhouette, in sprite-local units (x toward the head, h =
// height above the sand). Round 5 projected the whole animal as two flat
// polygons, which printed as a dead-straight 980 x 9 px ruler; these are the
// parts, so the band's top edge steps up from the platform (h 176) to the legs
// (506), the barrel (601) and the head (846), and no run holds one thickness.
const SH_LEGS = [
  [-320, -182, 506], [-288, -150, 506],               // hind legs, near and far
  [150, 220, 470], [114, 184, 470],                   // forelegs, near and far
];
// the barrel's own outline (assets/horse.js BODY, h = -y)
const SH_BODY = [[-236, 601], [-120, 592], [0, 590], [90, 602], [200, 562], [238, 510], [228, 462],
  [172, 430], [60, 418], [-60, 421], [-170, 442], [-262, 472], [-312, 508], [-320, 556], [-292, 594]];
// the neck, head and jaw: crest up, forelock, forehead to the muzzle, back
// along the jaw and down the throat (the spur that breaks the run)
const SH_HEAD = [[56, 604], [160, 786], [264, 818], [302, 848], [330, 834], [344, 766], [384, 704],
  [410, 652], [412, 636], [404, 600], [392, 604], [354, 628], [324, 650], [304, 672], [298, 706], [254, 628], [228, 520]];
// The hard shadow of the horse on the sand, projected from the horse's own
// parts (standard 40: read a shape by drawing it better) - the three wheels as
// round lumps with lit sand notched between them, the beam and the deck as a
// block, each of the four legs its own tapering shadow, the barrel's own
// outline, and the neck and head a spur with the mane comb's teeth along it -
// so the run never holds one thickness. It is drawn AFTER the onlookers, as a
// neutral multiply (standard 25, s04's gate shadow): the four Trojans standing
// in it are unlit, and the sand's wind lanes still read inside the field
// (standard 19's texture in a shadow), which a flat near-black fill killed.
// Clipped to the ground, so the platform and the wheels keep their own light.
function horseShadow(ctx, e) {
  const k = HS, ox = HX, oy = GY;
  const px = (x, h) => [ox + (x + SX * h) * k, oy + SY * h * k];   // the shadow of local (x, h)
  ctx.save();
  ctx.beginPath(); ctx.rect(-3000, oy - 1, 9000, 400); ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(28,30,25)';
  ctx.beginPath();
  // the three wheels: round lumps with a notch of lit sand between them
  for (const w of [-234, 0, 234]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI * (1 + i / 7); pts.push(px(w + Math.cos(a) * 46, 46 + Math.sin(a) * 46)); }
    poly(ctx, pts);
  }
  ctx.fill();
  // the side beam and the deck over them (the deck juts forward to the tow ring)
  ctx.beginPath(); poly(ctx, [px(-296, 94), px(300, 94), px(300, 164), px(-296, 164)]); ctx.fill();
  ctx.beginPath(); poly(ctx, [px(-300, 164), px(338, 164), px(338, 176), px(-300, 176)]); ctx.fill();
  // each leg its own tapering shadow: four pieces at four x offsets
  for (const [x0, x1, h] of SH_LEGS) {
    ctx.beginPath(); poly(ctx, [px(x0 + 22, 176), px(x1 - 18, 176), px(x1, h), px(x0, h)]); ctx.fill();
  }
  ctx.beginPath(); poly(ctx, SH_BODY.map(([x, h]) => px(x, h))); ctx.fill();
  ctx.beginPath(); poly(ctx, SH_HEAD.map(([x, h]) => px(x, h))); ctx.fill();
  // the mane comb's teeth break the top edge of the spur
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const u = 0.06 + (i / 9) * 0.9, v = 1 - u;
    const cx = v * v * 56 + 2 * v * u * 160 + u * u * 264, ch = v * v * 604 + 2 * v * u * 786 + u * u * 818;
    const hgt = 20 + 46 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.12)), 0.7);
    poly(ctx, [px(cx - 7, ch), px(cx + 7, ch), px(cx + 4, ch + hgt), px(cx - 9, ch + hgt)]);
  }
  ctx.fill();
  // hard contact patches where the wheels touch (the only edges that do)
  ctx.fillStyle = 'rgb(24,26,21)';
  ctx.beginPath();
  for (const w of [-234, 0, 234]) poly(ctx, [[ox + (w - 40) * k, oy], [ox + (w + 40) * k, oy], [ox + (w + 50) * k, oy + 5 * k], [ox + (w - 46) * k, oy + 5 * k]]);
  ctx.fill();
  ctx.restore();
}

// The onlookers: [x, feetY, dir, pose, seed, walk speed (units/s), distance
// to their stop, pose once stopped, own shadow]. Walkers come in from the city (off-frame right) at
// about 0.7 body heights a second (0.9 gait cycles/s, the cadence of s03's
// walkers) and stop when they reach the crowd: the first two on beat 10, as
// the push begins, one pointing up at the horse. All in white: the horse's
// garland is the red.
// The four right-hand BACK figures stand on the lip of the horse's own cast
// shadow, so a shadow of their own would read as a second light: they get
// none (their contact is the shadow's edge).
const BACK = [
  [1180, 846, -1, 'stand', 3, 0, 0, 'stand', false], [1212, 850, -1, 'point', 7, 0, 0, 'stand', false],
  [1420, 852, -1, 'walk', 11, 36, 150, 'stand', false], [1500, 849, -1, 'walk', 13, 34, 140, 'stand', false],
  [180, 852, 1, 'stand', 17, 0],
];
const FRONT = [
  [1010, 884, -1, 'point', 2, 0], [1046, 880, -1, 'stand', 5, 0], [1088, 886, -1, 'stand', 9, 0],
  // (the first two stop on beat 10: their distance is speed x HOLD)
  [1290, 892, -1, 'walk', 4, 66, 66 * HOLD, 'point'], [1340, 888, -1, 'walk', 6, 63, 63 * HOLD], [1600, 896, -1, 'walk', 8, 69, 330],
  [118, 890, 1, 'point', 12, 0], [62, 888, 1, 'stand', 15, 0],
  // a few in front of the platform, inside the phone framing as well
  [462, 904, 1, 'point', 21, 0], [506, 899, -1, 'stand', 22, 0], [744, 908, -1, 'stand', 23, 0],
];
// On a phone the landscape walkers never reach the frame: two more come in
// from the right edge of the phone framing and stop on beat 11 under the
// board, their feet above the transport bar.
const PORTRAIT_FRONT = [[1040, 906, -1, 'walk', 31, 66, 66 * BT(11)], [1085, 912, -1, 'walk', 32, 69, 69 * BT(11), 'point']];
// Position and gait both on twos (12 fps, STYLE rule 11), so the planted
// foot stays put: phase = distance walked / stride.
function onlookers(ctx, e, list) {
  const tq = e.q(12);
  for (const [x0, y, dir, pose0, seed, v, stop = 0, stopPose = 'stand', shadow = true] of list) {
    const h = hAt(y);
    const d = v ? Math.min(stop, v * tq) : 0;
    const walking = v && d < stop;
    const phase = walking ? (d / stride(h) + seed * 0.13) % 1 : 0;
    trojan(ctx, e, { x: x0 + dir * d, y, h, dir, pose: v ? (walking ? 'walk' : stopPose) : pose0, phase, seed, cloak: 'none', shadow: shadow ? FIG_SHADOW : null });
  }
}

// The shore: s01 leaves the horse on the beach with the fleet sailing off
// to the left; here the sea is a thin cobalt band on the left horizon, behind
// the horse's tail, the last sails on it.
function farSea(p) {
  const x0 = -900, x1 = 760, y = HZ;
  // the strand is not a ruled line: the clip's lower edge wanders, and s01's
  // own broken surf lace runs along it (style rule 10, the round-5 NICE)
  const sr = new RNG('s02-strand'), strand = [];
  for (let x = x1 - 20; x > x0; x -= 46) {
    const u = clamp((x1 - x) / (x1 - x0));
    strand.push([x, y + 3 + 12 * Math.pow(u, 0.55) + sr.range(-2.2, 2.2)]);
  }
  sea(p, { horizon: y - 0.5, bottom: y + 15, x0, x1, near: 0.07, far: 0.03, lHorizon: 0.5, lMid: 0.42, lBottom: 0.36,
    clip: [[x0, y - 0.5], [x1, y - 0.5], [x1 - 6, y + 2], ...strand, [x0, y + 16]] });
  surf(p, strand.slice().reverse(), { seed: 's02-surf', side: 1, lines: 2, gap: 7, dash: { on: [6, 30], off: [3, 12], blob: 0.3 } });
}

// Gulls crossing the open cobalt in silhouette (production standard 37).
// Drawn here rather than with kit/nature.js's birds(), whose ivory stroke
// disappears against sky and cloud alike: a small bird prints near-black in
// every plate. [x, y, size, phase]; they drift left, off the sea.
const GULLS = [[70, 96, 5.2, 0], [148, 132, 4.2, 1.7], [214, 72, 3.7, 3.1], [-38, 156, 3.3, 2.2], [292, 118, 3, 4.4]];
// Portrait sees none of those (its opening framing starts at world x ~207),
// so the phone gets its own flock over the horse's back, left of the neck.
const GULLS_P = [[436, 120, 5.2, 0], [508, 86, 4.3, 1.9], [566, 150, 3.5, 3.3], [370, 168, 3, 4.1]];
function gulls(ctx, e, list) {
  const tq = e.q(12);                       // the wings beat on twos (STYLE rule 11)
  ctx.strokeStyle = '#141712'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [x0, y0, s, ph] of list) {
    const x = x0 - 7 * e.t + Math.cos(e.t * 0.5 + ph) * 5;
    const y = y0 + Math.sin(e.t * 0.8 + ph) * 3;
    const flap = Math.sin((tq * 6 + ph) * 1.9);
    ctx.lineWidth = Math.max(2.2 / e.s, s * 0.3);
    ctx.beginPath();
    ctx.moveTo(x - s * 1.3, y - s * (0.3 + 0.44 * flap));
    ctx.quadraticCurveTo(x - s * 0.5, y - s * (0.04 + 0.2 * flap), x, y);
    ctx.quadraticCurveTo(x + s * 0.52, y - s * (0.08 + 0.22 * flap), x + s * 1.2, y - s * (0.34 + 0.4 * flap));
    ctx.stroke();
  }
}

// Camera keys for the push-in: a hold on the opening (hold s), then one
// smooth inOutSine move from the whole horse to the head, sampled into
// short linear segments. The zoom is geometric (as
// the stage interpolates w) and the focus y is solved so the ear tip sits at
// screen y e (px of a frameW x frameH frame), easing from e0 to e1.
const EAR = [HX + 286 * HS, GY - 874 * HS];
function pushKeys({ x0, x1, w0, w1, aspect, frameW, frameH, e0, e1, hold = 0, n = 16, dur = 4.46 }) {
  const keys = [];
  for (let i = 0; i <= n; i++) {
    const t = (dur * i) / n, u = ease.inOutSine(clamp((t - hold) / (dur - hold)));
    const w = Math.exp(lerp(Math.log(w0), Math.log(w1), u)), s = frameW / w;
    const y = EAR[1] + (frameH / 2 - lerp(e0, e1, u)) / s;
    keys.push({ t: +t.toFixed(4), x: +lerp(x0, x1, u).toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +(w / aspect).toFixed(2), ease: 'linear' });
  }
  return keys;
}

export default {
  id: 's02', dur: 4.46, night: false,
  caption: 'BEWARE GEEKS BEARING GIFTS',
  subcaption: 'TO ATHENA · FOR RE:INVENT 2026 · THE GREEKS DEDICATE THIS OFFERING',
  // the caption sits on the open sky above the ears; the board and the
  // onlookers at the base stay clear (STYLE production standard 3)
  captionPos: 'top', captionPosPortrait: 'top',
  reducedT: 0.3,   // reduced motion holds the whole-horse opening: board, onlookers, head
  // Low angle on the whole horse (ears clear of the caption, onlookers'
  // feet in frame), held to beat 10 while the walkers approach, then a slow
  // push in and up the neck to the head. The
  // zoom is anchored on the ear tip's screen height, so the ears stay under
  // the top caption block for the whole shot. Measured block bottoms (with
  // the two-line subcaption): 201/900 px at 1600x900, 199/900 at 1440x900,
  // 175/720 at 1280x720 (24%), 163/844 on a 390x844 phone. The ear sits at
  // 26.5% of a 16:9 frame (238-244 px at 1600x900) and 25.5% on the phone.
  // (a key every 0.056 s: the push's speed rises smoothly, not in steps)
  cam: pushKeys({ x0: 700, x1: 880, w0: 2240, w1: 1060, aspect: 16 / 9, frameW: 1600, frameH: 900, e0: 238, e1: 244, hold: HOLD, n: 80 }),
  // Phone: the whole horse (tail to muzzle) with the full board and the
  // onlookers at its base, sky above for the caption, held to beat 10; then
  // up the neck to the head, the ear easing down to 34% of the frame.
  // (w0 822: ~12 px of margin at the tail and the muzzle at t = 0)
  camPortrait: pushKeys({ x0: 618, x1: 880, w0: 822, w1: 400, aspect: 390 / 844, frameW: 390, frameH: 844, e0: 300, e1: 285, hold: HOLD, n: 80 }),
  sprites: { horse: horseSprite({ maxScale: HS }) },
  items: [
    // sky and far share one depth so the cumulus bases stay on the horizon in the tilt
    { layer: 'sky', depth: 0.45, paint(p) {
      sky(p, { y0: -200, y1: HZ });
      // A flat sky needs a secondary incident (production standard 37). The
      // bank is taller and narrower and runs off the frame's top right instead
      // of ending in open blue; its towers still clear the top caption block
      // for the whole push-in. In portrait only its left skirt would show, so
      // the phone gets the same bank shifted left and narrower again, which
      // puts a real tower above the horse's back inside an 822-unit view.
      if (p.portrait) cumulus(p, { x: 1180, y: HZ - 2, w: 900, h: 690, towers: 4, seed: 's02-big' });
      else cumulus(p, { x: 1480, y: HZ - 2, w: 1340, h: 980, towers: 5, seed: 's02-big' });
      // a second tower on the left (plate 2 sets a bank against its figure)
      // and a low bank behind the horse's legs, so the blue is broken on both
      // sides of the horse and not only behind its head. In portrait the left
      // tower stands where the flat field was - above the horse's back - and
      // the phone's narrower view needs it nearer the horse.
      if (p.portrait) {
        cumulus(p, { x: 330, y: HZ - 2, w: 640, h: 820, towers: 3, seed: 's02-left' });
        cumulus(p, { x: 760, y: HZ - 2, w: 430, h: 270, towers: 2, seed: 's02-mid' });
      } else {
        cumulus(p, { x: 150, y: HZ - 2, w: 740, h: 760, towers: 3, seed: 's02-left' });
        cumulus(p, { x: 640, y: HZ - 2, w: 600, h: 330, towers: 2, seed: 's02-mid' });
      }
      // tiers of torn streaks spread through the sky (standard 37), not one
      // 26-unit band massed on the horizon - but the plates keep their upper
      // sky clean, so three tiers, not a ruled screen of them. They stay clear
      // of the top caption block (its bottom is world y ~ -38 at 1600x900, and
      // ~ -275 on a phone, whose frame is 2.2x as tall in world units).
      streaks(p, { x0: -100, x1: 1700, y: HZ - 18, depth: 14, count: 9, seed: 's02-st' });
      streaks(p, { x0: -160, x1: 1480, y: HZ - 74, depth: 32, count: 7, seed: 's02-st3' });
      streaks(p, { x0: -420, x1: 980, y: 330, depth: 70, count: 8, seed: 's02-st5' });
      streaks(p, { x0: -250, x1: 1420, y: 110, depth: 90, count: 9, seed: 's02-st2' });
      if (p.portrait) streaks(p, { x0: 150, x1: 1180, y: -60, depth: 70, count: 8, seed: 's02-st6' });
    } },
    // the far plain and the sea band on the horizon (every pass bboxed, so
    // the layer crops itself to that strip)
    { layer: 'far', depth: 0.45, paint(p) {
      farPlain(p);
      farSea(p);
    } },
    // the last of the fleet on the far sea, sailing away to the left: two
    // readable sails instead of four white cups (the round-5 NICE), and still
    // well inside standard 40's scale ceiling beside a 12-man horse
    { actor: 'fleet', depth: 0.45, draw(ctx, e) {
      for (const [x, s, dy] of [[-120, 0.3, 7], [250, 0.27, 3], [-400, 0.22, 9]]) galley(ctx, e, { x: x - e.t * 3, y: HZ + dy, s, dir: -1, sail: 'white' });
    } },
    { actor: 'gulls', depth: 0.45, draw(ctx, e) { gulls(ctx, e, e.W / e.H < 0.82 ? GULLS_P : GULLS); } },
    // the sand is only on screen early in the push (t < ~2.5), so it bakes at 0.7 of the end-of-shot density
    { layer: 'plain', depth: 1, res: 0.7, paint(p) { plain(p); } },
    { actor: 'back', depth: 1, draw(ctx, e) { onlookers(ctx, e, BACK); } },
    // the horse is a baked sprite (840 x 880 units), not a full-region layer: sharp at the end of the push, ~1/3 the memory
    { actor: 'horse', depth: 1, draw(ctx, e) { e.drawSprite(ctx, 'horse', HX, GY, { s: HS }); } },
    { actor: 'front', depth: 1.04, draw(ctx, e) { onlookers(ctx, e, FRONT); if (e.W / e.H < 0.82) onlookers(ctx, e, PORTRAIT_FRONT); } },
    // the horse's own cast shadow, over the sand and over the Trojans standing in it
    { actor: 'shadow', depth: 1, draw(ctx, e) { horseShadow(ctx, e); } },
  ],
};
