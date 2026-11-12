// I · THE OFFERING — the coast of Troy (plate 3 homage, mirrored so the film
// reads one way: the fleet leaves on the left, Troy stands on the right, as in
// s02-s04). The Greek fleet sails away in a long curve of white sails under a
// pale Mount Ida; Troy's walls crown the white limestone headland (overlapping
// masses that step down toward the beach) under a towering cumulus; the wooden
// horse stands alone on the open sand, facing the city. The camera tilts down from the cumulus to the shore. Sun at upper left
// (STYLE rule 6, production standard 11): every light in the plate is the
// kit's default.

import { sky, cumulus, streaks, mountain, distantCoast, sea, surf, rockMass, cliffOutline, beach, pine, cypress, shrubs, birds } from '../kit/nature.js';
import { ashlarWall, tower, templeFront } from '../kit/arch.js';
import { galley, fleetOnPlane } from '../kit/fleet.js';
import { smoke } from '../kit/fx.js';
import { paintHorse } from '../assets/horse.js';
import { makeNoise, RNG } from '../engine/rng.js';
import { densify, roughen, poly } from '../kit/geom.js';
import { L } from '../engine/bake.js';
import { mat } from '../kit/palette.js';

const HZ = 500;        // horizon
const WALL_Y = 446;    // the walls of Troy stand on the cliff top (base at WALL_Y + 8)
// ~79 units tall: the tiny horse on the open sand, a long way short of the cliff
// foot (s02 opens with Troy well behind it)
const HORSE_AT = { x: 980, y: 860, s: 0.09 };
// the camp's three ash heaps send up smoke that bends seaward on the breeze and
// widens into a veil: [x, y (base), w, h, seed, drift (seaward lean)]
const SMOKES = [[762, 822, 34, 100, 1, -1.1], [672, 861, 28, 88, 2, -1.0], [598, 898, 30, 80, 3, -1.2]];
// day smoke of cold ash: a warm grey mass, paler half light, sunlit caps (no red underlight)
const CAMP_SMOKE = { base: '#a6a9b3', half: '#cbccd2', lit: '#efeee8', under: ['#a6a9b3', '#a6a9b3'], sky: '#dcdde2' };

// The headland's top edge, from the sea end (left) up to the city's plateau:
// the sea end steps down in broken spurs to the surf.
// Along the city the rim rises in outcrops over the foot of the walls (the
// walls are painted first), so the city sits in the rock, not on a shelf.
const PROF = [[808, 668], [836, 646], [858, 606], [874, 566], [906, 540], [950, 530], [984, 494], [1024, 464], [1060, 452],
  ...(() => {
    const out = [];
    for (let x = 1100; x <= 2200; x += 24) {
      let hgt = 4 + 3 * Math.sin(x * 0.045);
      for (const [cx, w, hh] of [[1128, 64, 30], [1240, 40, 16], [1398, 80, 34], [1612, 60, 24], [1706, 36, 14], [1838, 84, 36], [2052, 66, 26]]) {
        const d = Math.abs(x - cx) / w; if (d < 1) hgt = Math.max(hgt, hh * Math.pow(1 - d * d, 0.6));
      }
      out.push([x, WALL_Y + 8 - hgt]);
    }
    return out;
  })()];
// Troy's headland is built from overlapping masses, back to front (plate 3's
// rugged, receding limestone): the back mass under the walls (on PROF), a
// middle mass standing in front of its lower half, and two front spurs on the
// beach. Each nearer mass is lower, stands a little further down the sand, and
// casts its shadow on the mass behind it, to its right (sun at upper left), so
// no buttress runs the full height of the cliff. Crest profiles, left to right:
const BACK_BASE = 694;
const MIDDLE = { prof: [[934, 640], [952, 600], [976, 572], [1010, 556], [1052, 546], [1096, 532], [1140, 538], [1184, 526], [1236, 534], [1290, 548],
  [1338, 540], [1392, 552], [1440, 548], [1494, 558], [1548, 572], [1598, 598], [1626, 634], [1642, 690]], base: 704, seed: 'hl-mid' };
const SPURS = [
  { prof: [[884, 714], [898, 680], [920, 646], [950, 620], [988, 604], [1030, 598], [1072, 604], [1108, 620], [1138, 648], [1160, 690]], base: 716, seed: 'hl-spur1' },
  { prof: [[1600, 712], [1618, 672], [1652, 638], [1706, 616], [1772, 604], [1846, 606], [1916, 622], [1970, 650], [2002, 696]], base: 716, seed: 'hl-spur2' },
];
// shadow wedges a nearer mass throws on the face behind it (world polygons):
// on the back mass from the middle mass and the right spur, on the middle mass from the left spur
const SHADOW_BACK = [[[1594, 594], [1672, 616], [1700, BACK_BASE + 4], [1640, BACK_BASE + 4]], [[1990, 652], [2060, 676], [2088, BACK_BASE + 4], [2008, BACK_BASE + 4]]];
const SHADOW_MID = [[[1112, 616], [1196, 640], [1222, MIDDLE.base + 4], [1160, MIDDLE.base + 4]]];
// the beach's back edge follows the masses' feet (it never drops below a base,
// so no sea shows through): [x0, x1, base] right to left
const FEET = [[2300, 2004, BACK_BASE], [2004, 1600, SPURS[1].base], [1600, 1160, MIDDLE.base], [1160, 884, SPURS[0].base], [884, 840, 690]];

// The face steps back at a ledge or two on each buttress: below a ledge the
// terminator jumps sideways (the shade plane widens or narrows), so the cliff
// reads as stacked blocks (plate 3), not full-height columns. Pure: the land
// layer reads the same steps to seed maquis on the ledges. y0..y1: the mass's
// face (ledges sit in its middle half).
function cliffSteps(masses, tag, y0, y1) {
  const rs = new RNG('headland-steps' + tag);
  const out = [];
  for (const m of masses) {
    if (m.x + m.w < 830 || m.x > 2200) continue;
    let ridge = m.x + m.w * m.split;
    for (let k = 0, nk = rs.int(1, 2); k < nk; k++) {
      const ys = rs.range(y0 + (y1 - y0) * 0.22, y0 + (y1 - y0) * 0.6) + k * (y1 - y0) * 0.18, shift = rs.range(0.12, 0.3) * m.w * (rs.chance(0.5) ? 1 : -1);
      const nr = Math.min(m.x + m.w * 0.94, Math.max(m.x + m.w * 0.06, ridge + shift));
      const lx0 = Math.max(m.x, Math.min(ridge, nr) - m.w * rs.range(0.1, 0.3)), lx1 = Math.min(m.x + m.w, Math.max(ridge, nr) + m.w * rs.range(0.05, 0.2));
      const tilt = rs.range(-0.06, 0.06), th = rs.range(2, 4.5);
      const pieces = rs.chance(0.5) ? [[0, rs.range(0.35, 0.55)], [rs.range(0.65, 0.75), 1]] : [[0, 1]];
      out.push({ ridge, nr, ys, lx0, lx1, tilt, th, pieces, y1 });
      ridge = nr;
    }
  }
  return out;
}

// The headland's marks, painted into the rock guide (source-atop, so only where
// the rock is): first the steps above, then plate-3 strata. The limestone breaks
// along its own form: each buttress has its own bedding tilt and only a few beds;
// a bed is an angular undercut that thickens toward one end and tapers away
// (never a symmetric lens), varied in length (0.4-1.6x) and weight (0.6-1.8x), a
// third of them broken in two, with a sunlit lip on the lit plane.
// masses: one mass's buttresses (rockMass); steps: cliffSteps(masses); y0..y1 its face.
function cliffBeds(g, masses, steps, tag, y0, y1) {
  const r = new RNG('headland-beds3' + tag);
  const nz = makeNoise(29);
  const lip = L(0.95), cut = L(0.05);
  for (const { ridge, nr, ys, lx0, lx1, tilt, th, pieces } of steps) {
    const jag = (x0, ya, yb) => { const pts = []; for (let i = 0; i <= 8; i++) { const yy = ya + (yb - ya) * (i / 8); pts.push([x0 + nz.n2(x0 * 0.05 + i, yy * 0.04) * 6, yy]); } return pts; };
    const a = jag(ridge, ys, y1 + 14), b = jag(nr, ys, y1 + 14);
    // the strip between the old and the new terminator changes plane
    g.fillStyle = nr > ridge ? L(0.86) : L(0.17);
    g.beginPath(); poly(g, [...a, ...b.reverse()]); g.fill();
    // the ledge: short broken pieces of black undercut (thick in the middle,
    // tapering out) round the step, a sunlit lip on the lit side; never a ruled
    // line across the buttress
    for (const [u0, u1] of pieces) {
      const top = [], bot = [];
      for (let i = 0; i <= 10; i++) {
        const v = i / 10, x = lx0 + (lx1 - lx0) * (u0 + (u1 - u0) * v), y = ys + nz.n2(x * 0.03, ys) * 3 + (x - lx0) * tilt;
        top.push([x, y]); bot.push([x, y + th * Math.pow(Math.sin(Math.PI * v), 0.6)]);
      }
      g.fillStyle = cut; g.beginPath(); poly(g, [...top, ...bot.reverse()]); g.fill();
      const lit = top.filter((q) => q[0] < Math.max(ridge, nr));
      if (lit.length > 2) { g.fillStyle = lip; g.beginPath(); poly(g, [...lit.map(([x, y]) => [x, y - 2]), ...lit.slice().reverse()]); g.fill(); }
    }
  }
  for (const m of masses) {
    if (m.x + m.w < 830 || m.x > 2200) continue;
    const tilt = r.range(-0.2, 0.2), ridge = m.x + m.w * m.split;
    for (let b = 0, nb = r.int(1, 3); b < nb; b++) {
      const y = r.range(y0 + 16, y1 - 12);
      const len = Math.min(m.w * 0.95, 58 * r.range(0.4, 1.6)), th = 2.6 * r.range(0.6, 1.8);
      let x = m.x + r.range(0, Math.max(1, m.w - len));
      const pieces = r.chance(0.35) ? [[0, r.range(0.3, 0.55)], [r.range(0.62, 0.72), 1]] : [[0, 1]];
      const thickLeft = r.chance(0.5);
      for (const [u0, u1] of pieces) {
        const top = [], bot = [];
        for (let i = 0; i <= 10; i++) {
          const u = u0 + (u1 - u0) * (i / 10), px = x + len * u;
          const py = y + tilt * len * u + nz.n2(px * 0.04, y * 0.05) * 2.5;
          const v = (i / 10), w = thickLeft ? 1 - v : v;     // thick at one end, tapering to a point
          top.push([px, py]); bot.push([px, py + th * Math.min(1, v * 6, (1 - v) * 6) * (0.25 + 0.75 * Math.pow(w, 0.7))]);
        }
        g.fillStyle = cut;
        g.beginPath(); g.moveTo(top[0][0], top[0][1]); for (const q of top) g.lineTo(q[0], q[1]); for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]); g.closePath(); g.fill();
        // the lit lip only where the bed crosses the sunlit plane (left of the ridge)
        const lit = top.filter((q) => q[0] < ridge);
        if (lit.length > 2) {
          g.fillStyle = lip;
          g.beginPath(); g.moveTo(lit[0][0], lit[0][1] - 1.8); for (const q of lit) g.lineTo(q[0], q[1] - 1.8); for (let i = lit.length - 1; i >= 0; i--) g.lineTo(lit[i][0], lit[i][1]); g.closePath(); g.fill();
        }
      }
    }
  }
}

// The fleet's wake-line on the sea plane (X across, Z away), plate 3's chain
// mirrored: a dense near run comes in at the lower left and swings toward the
// headland (the hulls overlap, as in the plate), then a thin far run turns away
// along the horizon to the left. Ships are spaced evenly along the whole line;
// the near run keeps every ship and the far run a hashed fifth of them, so the
// horizon breaks into clusters of small sails (no dotted line). One list, so no
// ship is doubled or pops where the runs meet.
// (round 6, production standard 40 - scale beats drama: round 5's enlargement
// (s0 3.0) put the nearest hull at 330 world units, 4.2 horse heights, so the
// 79-unit horse - the film's own measuring stick, standing NEARER the camera -
// read as a toy beside an 85 m ship, and three hulls merged into one dark mass
// across half the frame (R5-s01 must-fix). The fleet is scaled to the horse
// again: the nearest hull is 166 x 51 units = 2.1 horse heights (1 m ~ 3.9
// units), and the curve is denser instead of bigger - 90 ships on the line, 31
// drawn, against round 5's 20. The sails read by drawing, not by size: the
// nearest still carry their seams, yards, shields and rowing crew, and the near
// run overlaps into plate 3's chain.)
const FLEET_PATH = [[-0.95, 1.25], [-0.66, 1.8], [-0.62, 2.6], [-0.78, 3.6], [-1.15, 4.8],
  [-2.0, 6.4], [-3.6, 8.6], [-6.0, 11.6], [-9.4, 15.4], [-12.6, 18.6]];
const FLEET = { path: FLEET_PATH, n: 90, horizon: HZ, near: 380, cx: 780, spread: 760, s0: 1.6 };
const hashU = (i, k = 0) => ((((i + 11) * 2654435761) ^ (k * 40503)) >>> 0) / 2 ** 32;
// each ship keeps the heading it has at mid-shot, so none mirrors as it rounds the
// turn, and its run (by index: the near run is the ships short of Z 4.8 then)
const MID = fleetOnPlane({ ...FLEET, offset: 2.31 * 0.05 });
const HEADING = new Map(MID.map((f) => [f.i, f.dir]));
const NEAR_I = MID.filter((f) => f.Z < 4.8).length;

export default {
  id: 's01',
  dur: 4.62,
  night: false,
  caption: 'BEWARE GEEKS BEARING GIFTS',
  // the caption rides the open sky between Mount Ida and the great cumulus over
  // Troy: it never meets the horse, the fleet or the walls (checked in the app,
  // 1440x900 and 390x844@2, idle and with the controls showing)
  captionPos: 'top', captionPosPortrait: 'top',
  reducedT: 4.62,
  // one smooth tilt (and a little pan) from the cumulus down to the shore:
  // inOutSine starts and ends at rest
  cam: [
    { t: 0, x: 1160, y: -300, w: 1500, h: 844 },
    { t: 4.62, x: 800, y: 548, w: 1480, h: 832, ease: 'inOutSine' },
  ],
  camPortrait: [
    { t: 0, x: 1500, y: -520, w: 700, h: 1100 },
    // (round 5: wide enough for the temple-topped citadel as well as the horse,
//    so the city still reads as a city on a phone: R4-s01)
    { t: 4.62, x: 980, y: 470, w: 960, h: 1100, ease: 'inOutSine' },
  ],
  items: [
    // the flat sky is a smooth gradient: a quarter-resolution bake is enough (the
    // grain is the page's); the clouds bake at full resolution, cropped to themselves
    { layer: 'sky', depth: 1, res: 0.25, paint(p) {
      sky(p, { y0: -900, y1: HZ });
    } },
    { layer: 'clouds', depth: 1, paint(p) {
      // the towering cumulus over Troy, lit from the upper left; its left flank
      // stays right of the caption at the end of the tilt
      cumulus(p, { x: 1700, y: HZ - 2, w: 1000, h: 720, towers: 3, seed: 'great' });
      // smaller cumulus behind Mount Ida (plate 2)
      cumulus(p, { x: 170, y: HZ - 2, w: 380, h: 220, towers: 2, seed: 'ida-c' });
      cumulus(p, { x: 700, y: HZ - 2, w: 280, h: 150, towers: 1, seed: 'far-c' });
      // plate 3's lace along the cumulus base: a low tier of small torn bands
      // under the great cloud, so its flat base sits in a drift of small cloud
      // instead of ending on a ruled line
      streaks(p, { x0: 1180, x1: 2280, y: HZ - 16, depth: 14, count: 16, seed: 'great-lace', scale: 0.55, len: 0.5, hairs: 0, ends: true });
    } },
    { layer: 'far', depth: 1, paint(p) {
      // Mount Ida, pale over the sea, with a white tip (rule 9)
      // (round 5: the form comes from many narrow ridges and broken bedding
      // strokes, as plate 2's mountain does, not from 20 wide light wedges)
      // (round 6, R5-s01: 40 bedding strokes in two tones across the lower three
      // quarters, so the modelling is plate 2's horizontal hatching and not 18
      // bright wedges radiating from the cap)
      mountain(p, { x: 420, y: HZ + 2, w: 1120, h: 236, seed: 'ida', concave: 1.7, flatTop: 0.07, ridges: 36, ridgeW: [0.006, 0.016], beds: 40, bedStep: 0.08, beds2: 0.16, snow: 0.85 });
      distantCoast(p, { x0: -600, x1: 240, y: HZ + 1, h: 10, seed: 'tenedos', freq: 0.006 });
      distantCoast(p, { x0: 1340, x1: 2200, y: HZ + 1, h: 9, seed: 'troad', freq: 0.008 });
      // short streaks under the cloud bases and across Ida's foot (plate 2)
      // (in five or six separate tiers, all above the horizon: never one long white bar)
      streaks(p, { x0: -260, x1: 900, y: HZ - 46, depth: 40, count: 10, seed: 'streak', scale: 0.6, len: 0.55, hairs: 0 });
    } },
    { layer: 'sea', depth: 1, frames: 3, fps: 5, paint(p) {
      // the sun's sparkle on the open sea at the left, below the far fleet
      // (a flat band under the sun, not a field of confetti)
      sea(p, { horizon: HZ, bottom: 1820, x0: -900, x1: 2300, glints: [{ x: 330, y: HZ + 120, rx: 300, ry: 45, a: 0.45 }] });
    } },
    { actor: 'fleet', depth: 1, draw(ctx, e) {
      // the fleet rows away along its line, far ships drawn first
      const ships = fleetOnPlane({ ...FLEET, offset: e.t * 0.05 });
      // side views (fleet.js's stern view read as insects at these sizes). The
      // far run keeps a hashed fifth of its ships (by index, so none pops as it
      // shrinks), each a little larger or smaller and higher or lower than the
      // line, and drops the wakes: separate small sails, never one white bar
      for (const f of ships) {
        const far = f.i >= NEAR_I;
        if (far && hashU(f.i) > 0.2) continue;
        const s = far ? f.s * (0.85 + 0.3 * hashU(f.i, 1)) : f.s, y = far ? f.y + (hashU(f.i, 2) - 0.5) * 3 : f.y;
        galley(ctx, e, { x: f.x, y, s, dir: HEADING.get(f.i) ?? f.dir, light: -1, wake: far ? 0 : 1, row: true, oars: Math.floor(e.wall * 12) / 12 * 0.55 + f.i * 0.13, crew: true });   // the oars row on twos (rule 11)
      }
    } },
    // the land never rises above the temple's pediment: bake only below it
    { layer: 'land', depth: 1, bounds: { x: 80, y: 200, w: 2260, h: 1640 }, paint(p) {
      const nz = makeNoise(11);
      // the walls of Troy along the cliff top, with towers and the citadel (painted
      // first: the headland's rim is drawn over their foot)
      ashlarWall(p, { x: 1050, y: WALL_Y + 8, w: 1160, h: 60, top: 'crenel', course: 12, blockW: [16, 40], seed: 'w1', merlon: { w: 12, h: 9, gap: 8 }, shade: [0, 0.12] });
      for (const [tx, tw, th] of [[1036, 50, 128], [1262, 56, 154], [1514, 46, 125], [1738, 52, 140], [1974, 46, 120]]) {
        tower(p, { x: tx, y: WALL_Y + 8, w: tw, h: th, course: 12, blockW: [14, 30], windows: 2, seed: `tw${tx}`, merlon: { w: 10, h: 8, gap: 6 }, shade: [0, 0.3] });
      }
      // the citadel rise with the temple of Athena on the summit
      ashlarWall(p, { x: 1200, y: WALL_Y - 52, w: 330, h: 44, top: 'flat', course: 11, blockW: [16, 36], seed: 'cit', shade: [0, 0.18] });
      templeFront(p, { x: 1364, y: WALL_Y - 96, w: 170, colH: 62, columns: 6, steps: 2, stepH: 3.5 });
      cypress(p, { x: 1586, y: WALL_Y - 42, h: 64, seed: 'cy1' });
      cypress(p, { x: 1566, y: WALL_Y - 40, h: 46, seed: 'cy2' });
      // Troy's headland, back to front (BACK_BASE, MIDDLE, SPURS above): each mass
      // is limestone buttresses whose ridges lean across them (so the shade planes
      // are wedges, never full-height pillars), with its own ledges and strata and
      // the shadows of the masses in front of it; sunlit planes near the top tone
      // (round 6, R5-s01: the face read as a wide striped wall because there was
      // far too much lit area for the marks to model - the lit mask was 38.8% of
      // the headland box against plate 3's cliff at 18.8% - and because each
      // buttress had ONE lit value with small chips on it. Now the shade planes
      // take 30-55% of each mass and go a step deeper, the sunlit plane breaks
      // into 3-6 leaning facets (litFacets) of which one keeps the paper white,
      // and the secondary slabs are fewer and much bigger.)
      const HL = { massW: [0.07, 0.16], shadowFrac: [0.34, 0.58], shadeLo: 0.1, shadeHi: 0.4, crevices: 0.85, ledges: 0, sideShade: 0.1, detail: 1.1, relief: 1.0, reliefScale: 55, ridgeLean: 0.45, litRange: [0.86, 0.97], litFacets: 4, slab: [[18, 45], [30, 110]] };
      const steps = [], feet = [];
      // each mass: its ledges and strata, the shadows of the masses in front of
      // it, a black recess along the crest of each mass standing in front of it
      // (the face turns in behind it), and a sunlit lip along its own crest
      const rz = makeNoise(77);
      const mass = (outline, seed, y0, y1, shadows, fronts, extra) => {
        let ms = [], st = [];
        const crest = outline.slice(1, -1);
        ms = rockMass(p, { ...HL, ...extra, outline, seed, guideExtra: (g) => {
          g.globalCompositeOperation = 'source-atop'; cliffBeds(g, ms, st, seed, y0, y1);
          g.fillStyle = 'rgba(0,0,0,0.68)';
          for (const w of shadows) { g.beginPath(); poly(g, w); g.fill(); }
          // Where a nearer mass stands in front of this one, this face turns in
          // behind its crest. Round 4 painted that as an unbroken near-black
          // fill, which printed as a drawn cable with the scrub hanging from it
          // (R4-s01). Instead the overlap reads as plate 3's does: the face
          // behind steps into shade in a band of varying height above the near
          // crest (so the near mass's own sunlit lip stands against it), and the
          // contact itself is a thin broken undercut, only along the stretches
          // that turn away from the sun.
          for (const fc of fronts) {
            // (round 6, R5-s01: the band itself still ran unbroken across all 480
            // columns, so at 1x it read as one dark stripe drawn over the cliff
            // with the scrub along it. It is now 3-5 pieces of 16-34% of the
            // contact, separated by gaps of about a tenth of it (a coarser noise
            // than the undercut's, so the gaps are longer), and each surviving
            // piece tapers to nothing at both ends.)
            g.fillStyle = L(0.26);
            let bi = 0;
            while (bi < fc.length - 2) {
              const bn = Math.max(3, Math.round(fc.length * (0.16 + 0.18 * Math.abs(rz.n2(bi * 0.05 + 21.7, 5.1)))));
              const seg = fc.slice(bi, Math.min(fc.length, bi + bn + 1));
              const skip = rz.n2(bi * 0.028 + 4.4, 13.9) < -0.22;
              bi += bn;
              if (skip || seg.length < 3) continue;
              const bm = seg.length - 1;
              const band = seg.map(([x, y], k) => {
                const u = k / bm, taper = Math.pow(Math.sin(Math.PI * (0.03 + 0.94 * u)), 0.55);
                return [x, y - taper * (3 + 5 + 16 * Math.max(0, rz.fbm(x * 0.013, y * 0.01, 3) + 0.4))];
              });
              g.beginPath(); poly(g, [...band, ...seg.slice().reverse().map(([x, y], k) => [x, y + 1 + 2 * Math.pow(Math.sin(Math.PI * (0.03 + 0.94 * (bm - k) / bm)), 0.55)])]); g.fill();
            }
            let i = 0;
            while (i < fc.length - 2) {
              const n = Math.max(2, Math.round(fc.length * (0.04 + 0.07 * Math.abs(rz.n2(i * 0.7, 3.3)))));
              const seg = fc.slice(i, i + n + 1);
              i += n + Math.max(2, Math.round(fc.length * (0.08 + 0.12 * Math.abs(rz.n2(i * 0.9, 7.7)))));
              if (seg.length < 3) continue;
              const [ax, ay] = seg[0], [bx, by] = seg[seg.length - 1];
              if (by - ay <= (bx - ax) * 0.9 && rz.n2(ax * 0.04, 9.1) >= -0.25) continue;   // this stretch faces the sun
              const m = seg.length - 1;
              const up = seg.map(([x, y], k) => {
                const u = k / m, taper = Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * u)), 0.55);
                const swell = 0.3 + 2.2 * Math.max(0, rz.fbm(x * 0.03, y * 0.012, 3) + 0.35);
                return [x, y - 0.4 - 2.6 * taper * swell];
              });
              g.fillStyle = L(0.05);
              g.beginPath(); poly(g, [...up, ...seg.slice().reverse().map(([x, y]) => [x, y + 1.6])]); g.fill();
            }
          }
          // the crest catches the sun where it faces up and left
          g.fillStyle = L(0.97);
          g.beginPath();
          for (let i = 1; i < crest.length; i++) {
            const [ax, ay] = crest[i - 1], [bx, by] = crest[i];
            if (by - ay > (bx - ax) * 0.9 || rz.n2(ax * 0.04, 9.1) < -0.25) continue;
            const t = 2 + 2.5 * Math.max(0, rz.n2(ax * 0.05, 4.7) + 0.3);
            g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by + t); g.lineTo(ax, ay + t); g.closePath();
          }
          g.fill();
        } }).masses;
        st = cliffSteps(ms, seed, y0, y1);
        steps.push(...st);
        for (const m of ms) feet.push({ m, base: y1 });
      };
      const outBack = cliffOutline(nz, PROF, BACK_BASE, 8, 0.03);
      const outMid = cliffOutline(makeNoise(31), MIDDLE.prof, MIDDLE.base, 7, 0.035);
      const outSpur = SPURS.map((sp) => cliffOutline(makeNoise(sp.seed.length * 13), sp.prof, sp.base, 6, 0.04));
      const top = (o) => o.slice(1, -1);
      mass(outBack, 'headland', WALL_Y, BACK_BASE, SHADOW_BACK, [top(outMid), top(outSpur[1])], { baseShade: { h: 0.3, a: 0.3 } });
      mass(outMid, MIDDLE.seed, 528, MIDDLE.base, SHADOW_MID, [top(outSpur[0]), top(outSpur[1])], { massW: [0.1, 0.2], baseShade: { h: 0.32, a: 0.32 } });
      SPURS.forEach((sp, i) => mass(outSpur[i], sp.seed, 600, sp.base, [], [], { massW: [0.14, 0.26], base: 0.9, baseShade: { h: 0.36, a: 0.34 } }));
      // two sea stacks in the surf off the headland (plate 3): broken crags with a
      // cleft. The big one stands off the shore in the water (its foot 50 units
      // seaward of round 2's, 0.9x), still in front of the ships at the turn;
      // broad buttresses with deep shade, so neither reads as a striped grey tooth
      const STACK = [[672, 720], [676, 680], [684, 640], [694, 606], [704, 584], [716, 570], [728, 552], [740, 546], [752, 556], [760, 548], [772, 556], [782, 578], [790, 612], [796, 652], [802, 720]]
        .map(([x, y]) => [737 + (x - 737) * 0.9, 670 + (y - 720) * 0.9]);
      for (const [pts, seed] of [[STACK, 'stack'],
        [[[604, 726], [608, 696], [616, 672], [626, 660], [636, 664], [644, 680], [650, 704], [654, 726]], 'stack2']]) {
        const stack = roughen(densify(pts, 4), makeNoise(seed.length * 41), 6, 0.11);
        rockMass(p, { outline: stack, seed, massW: [0.6, 1.0], shadowFrac: [0.34, 0.44], shadeLo: 0.08, shadeHi: 0.22, crevices: 0.9, ledges: 0, baseShade: { h: 0.45, a: 0.45 }, reliefScale: 26, inkW: 1.2, ridgeLean: 0.35, litRange: [0.84, 0.95] });
      }
      // maquis on the ledges: a clump of dark scrub on the sunlit end of most
      // ledges, the widest ledges carrying plate 3's big dark masses
      const ledgeTufts = [], lr = new RNG('ledge-maquis');
      const wide = steps.map((st) => Math.min(st.lx1, Math.max(st.ridge, st.nr)) - st.lx0).sort((a, b) => b - a)[3] ?? Infinity;
      for (const st of steps) {
        if (!lr.chance(0.7)) continue;
        const x1 = Math.min(st.lx1, Math.max(st.ridge, st.nr)), x0 = st.lx0;
        if (x1 - x0 < 12) continue;
        const big = x1 - x0 >= wide;
        // (round 6, R5-s01: a third fewer tufts, each clearly bigger, so a ledge
        // carries one or two massed clumps instead of a row of small lozenges)
        for (let k = 0, nk = lr.int(1, 3); k < nk; k++) { const x = x0 + (x1 - x0) * lr.range(0.05, 0.6); ledgeTufts.push([x, st.ys + (x - st.lx0) * st.tilt - 1.5, big ? lr.range(18, 26) : lr.range(6, 12)]); }
      }
      shrubs(p, ledgeTufts, { seed: 'ledge-tufts' });
      // pines and maquis clinging to the crests of the masses and the sea end
      for (const [x, y, h, lean, seed] of [[1430, 562, 46, -0.2, 'pl1'], [990, 606, 38, -0.35, 'pl3'], [930, 540, 44, -0.4, 'pl4']]) pine(p, { x, y, h, lean, seed });
      // plate 3's dark maquis masses over the crests: big clumps on the sea end and
      // the near spur, smaller ones along the middle crest and the far spur
      // (the clumps along a mass's crest sit 6 units down on its own face, so none
      // of them is strung along the contact line with the mass behind it: R4-s01)
      const crestScrub = [[1000, 476, 12], [952, 528, 14], [898, 548, 13], [866, 600, 11], [1046, 462, 10], [1720, 446, 12], [742, 556, 7], [1580, 500, 7],
        [930, 638, 13], [956, 622, 16], [992, 610, 15], [1036, 603, 18], [1074, 608, 13], [1112, 626, 11], [1138, 650, 9],
        [988, 568, 12], [1024, 560, 15], [1058, 551, 16], [1100, 540, 12], [1150, 544, 13], [1196, 533, 10],
        [1250, 542, 11], [1346, 547, 14], [1400, 559, 10], [1452, 555, 12], [1508, 567, 9], [1660, 642, 12], [1716, 620, 15], [1790, 610, 11], [1856, 612, 14], [1924, 629, 10]];
      shrubs(p, crestScrub, { seed: 'maquis' });
      // the plain before the city and the beach, the shore curving away to the lower left
      // plate 5's beach: the sand's dark strokes hug the waterline and thin out
      // over the open sand (the palette's strokes print only where the guide's
      // aux2 mask says, strongest at the water, gone ~110 units inland)
      const SHORE = [[840, 668], [700, 706], [520, 786], [340, 906], [220, 1066], [120, 1500]];
      // (round 6: the shot used to clamp M.sand's hatch band to hi 0.5 against the
      // material's own lo 0.45 / hi 1.1, so plate 5's beach strokes could only print
      // in a 0.05-wide sliver of guide light and the open sand carried no marks at
      // all - the round-1 'flat beige' finding, R5-fidelity. The override is gone:
      // the sand material's own strokes print on every lit face (standard 31), and
      // the explicit wind lanes, crests and pebble bands sit on top. hatchByAux2
      // still adds the strokes along the waterline, where the wet sand is darker
      // than the band.)
      const sandMat = mat(p.mat.sand, { extra: { hatchByAux2: true } });
      // the sand's back edge follows the feet of the masses, a few units up their
      // bases (never below one), so the cliff foot is broken, not a ruled line
      const fnz = makeNoise(57), back = [];
      for (const [x0, x1, base] of FEET) for (let x = x0; x > x1; x -= 6) back.push([x, base - 2 - Math.abs(fnz.fbm(x * 0.03, 0.5, 3)) * 12 - Math.max(0, fnz.n2(x * 0.011, 3.3)) * 6]);
      const BEACH_POLY = [...back, [840, 664], [700, 702], [520, 782], [340, 902], [220, 1062], [120, 1800], [2300, 1800]];
      beach(p, { pts: BEACH_POLY,
        lTop: 0.8, lBottom: 0.74, mat: sandMat, wet: { line: SHORE, width: 6 },
        guideExtra: (g) => {
          g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
          for (const [w, b] of [[220, 60], [150, 70], [90, 70], [40, 55]]) {   // stacked strokes: B rises toward the water
            g.strokeStyle = `rgb(0,0,${b})`; g.lineWidth = w;
            g.beginPath(); poly(g, SHORE, false); g.stroke();
          }
          g.globalCompositeOperation = 'source-over';
        } });
      // broken lace along the shore and round the stacks (plates 3 and 5), never ruled lines
      const lace = { on: [6, 30], off: [3, 12], blob: 0.3 };
      surf(p, [[830, 662], [700, 700], [520, 780], [340, 900], [220, 1060], [130, 1400]], { seed: 'surf', side: 1, lines: 2, gap: 9, dash: lace });
      surf(p, [[674, 668], [696, 674], [737, 678], [778, 675], [802, 668]], { seed: 'stack-surf', side: 1, lines: 2, gap: 6, dash: { ...lace, on: [5, 16] } });
      surf(p, [[598, 724], [616, 730], [640, 731], [660, 724]], { seed: 'stack2-surf', side: 1, lines: 2, gap: 5, dash: { ...lace, on: [5, 14] } });
      // talus at the feet of the shade planes: fallen blocks on the sand, only
      // under the front-most mass at that x (a block at a hidden foot would sit
      // on the face of the mass in front)
      const tR = new RNG('talus'), tz = makeNoise(91), blocks = [];
      const frontBase = (x) => { for (const [x0, x1, b] of FEET) if (x <= x0 && x > x1) return b; return null; };
      for (const { m, base } of feet) {
        const sx = m.x + m.w * (m.split + (1 - m.split) * tR.range(0.15, 0.75));
        if (sx < 890 || sx > 2200 || !tR.chance(0.6) || frontBase(sx) !== base) continue;
        for (let k = 0, nk = tR.int(1, 3); k < nk; k++) blocks.push({ x: sx + tR.range(-16, 16), y: base + tR.range(-2, 5) + k * 2, r: tR.range(6, 20) * (k ? 0.55 : 1), h: tR.range(0.55, 0.95) });
      }
      const shapes = blocks.map((b) => {
        const pts = [];
        for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; pts.push([b.x + Math.cos(a) * b.r * 1.25, b.y + Math.sin(a) * b.r * b.h * (0.85 + 0.3 * tz.n2(b.x * 0.3 + i, b.y))]); }
        return roughen(densify(pts, 3), tz, 1.6, 0.2);
      });
      if (shapes.length) {
        const tb = { x: Math.min(...blocks.map((b) => b.x - b.r * 1.4)), y: Math.min(...blocks.map((b) => b.y - b.r * 1.3)), w: 0, h: 0 };
        tb.w = Math.max(...blocks.map((b) => b.x + b.r * 1.4)) - tb.x; tb.h = Math.max(...blocks.map((b) => b.y + 4)) - tb.y;
        p.pass(p.mat.rock, (g) => {
          shapes.forEach((pts, i) => {
            const b = blocks[i];
            g.fillStyle = L(0.88); g.beginPath(); poly(g, pts); g.fill();
            g.save(); g.beginPath(); poly(g, pts); g.clip();
            g.fillStyle = L(0.16); g.beginPath(); g.moveTo(b.x + b.r * 0.15, b.y - b.r * 1.3); g.lineTo(b.x + b.r * 1.5, b.y - b.r); g.lineTo(b.x + b.r * 1.5, b.y + 2); g.lineTo(b.x - b.r * 0.1, b.y + 2); g.closePath(); g.fill();
            g.restore();
          });
        }, { bbox: tb });
        p.ink((ctx) => {
          ctx.strokeStyle = p.mat.rock.ink || '#14110e'; ctx.lineWidth = 0.9; ctx.lineJoin = 'round';
          ctx.beginPath(); for (const pts of shapes) poly(ctx, pts, false); ctx.stroke();
        }, { bbox: tb });
      }
      // plate 5's beach: wind lanes that follow the water's curve, from the wet
      // sand at the shore right up the open sand to the cliff foot (plate 5's
      // beach is worked edge to edge; round 4's rows stopped 80 units inland and
      // the rest printed as blank paper: R4-s01). The lanes come in bundles of a
      // few adjacent rows with clean sand between the bundles.
      // (round 6, R5-s01: they used to be flat tapered wedges 34-120 units long,
      // all parallel to the shore, drawn in the ink pass in three tan tones - at
      // 2x a set of long soft parallel smears that never posterised. Now each
      // lane is at most 70 units and turns up to 15 degrees off the shore, so the
      // set is not ruled and it carries the plate's diagonal third; the two
      // lighter tones are painted into the SAND material, so they posterise into
      // its own tones (L .34 near the water, L .56 over the open sand), and only
      // the sparse near-black drift lines stay in p.ink.)
      const SAND_LANES = (() => {
        const r = new RNG('shore-strokes');
        const shore = densify([[840, 668], [700, 706], [520, 786], [340, 906], [220, 1066], [160, 1260]], 6);
        // arc length along the shore, so stroke lengths are world units
        const acc = [0];
        for (let i = 1; i < shore.length; i++) acc.push(acc[i - 1] + Math.hypot(shore[i][0] - shore[i - 1][0], shore[i][1] - shore[i - 1][1]));
        const total = acc[acc.length - 1];
        const at = (d) => {
          d = Math.max(0, Math.min(total, d));
          let j = 1; while (j < acc.length - 1 && acc[j] < d) j++;
          const f = (d - acc[j - 1]) / Math.max(1e-6, acc[j] - acc[j - 1]);
          const a = shore[j - 1], b = shore[j];
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, ty / tl, -tx / tl];   // x, y, inland normal
        };
        const lanes = [[], [], []];      // by tone: wet (sand L .34), open (sand L .56), drift (ink)
        for (let row = 0; row < 56; row++) {
          const off = 8 + row * 10.5 + r.range(-3, 3);
          // bundles: three to six rows of lanes, then one or two rows of clean sand
          const inBundle = (Math.floor(row / 2) + Math.floor(row / 7)) % 3 !== 2 || r.chance(0.3);
          if (!inBundle) continue;
          const tone = row < 7 ? 0 : 1;
          let d = r.range(0, 90);
          while (d < total) {
            const len = r.range(20, 70) * (row < 7 ? 0.7 : 1) * (row > 20 ? 0.8 : 1);
            const gap = r.range(12, 48) + row * 0.4;
            if (r.chance(row < 6 ? 0.08 : Math.min(0.4, 0.1 + row * 0.006))) { d += len + gap; continue; }
            // the marks grow toward the camera (the near beach is at the bottom
            // of the frame), so they read as wind streaks and not as scratches
            const persp = 1 + Math.max(0, (at(d)[1] - 700) / 420);
            const th = r.range(1.8, 4.2) * (1 - Math.min(0.3, row * 0.005)) * persp;
            const a = at(d), b = at(d + len);
            const ax = a[0] + a[2] * off, ay = a[1] + a[3] * off;
            // each lane turns off the shore's run (the wind works the sand in
            // sweeps, not in rails): rotated about its own start
            const rot = r.range(-0.26, 0.26), cr = Math.cos(rot), sr = Math.sin(rot);
            const dx0 = b[0] + b[2] * off - ax, dy0 = b[1] + b[3] * off - ay;
            const sx = dx0 * cr - dy0 * sr, sy = dx0 * sr + dy0 * cr;
            // the shore turns steeply at the bottom of the frame: a lane that
            // would run near-vertical there reads as grass, so it is dropped
            if (Math.abs(sy) > Math.abs(sx) * 1.4 || ay > 1180) { d += len + gap; continue; }
            const sl = Math.hypot(sx, sy) || 1;
            const dark = r.chance(0.12);
            lanes[dark ? 2 : tone].push([ax, ay, ax + sx, ay + sy, -sy / sl, sx / sl, dark ? th * 0.55 : th]);
            d += len + gap;
          }
        }
        return lanes;
      })();
      const laneSet = (g, set, th0 = 1) => {
        g.beginPath();
        for (const [ax, ay, bx, by, nx, ny, th] of set) {
          const t = th * th0;
          g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx - nx * t, by - ny * t); g.lineTo(ax - nx * t * 0.4, ay - ny * t * 0.4); g.closePath();
        }
        g.fill();
      };
      p.pass(sandMat, (g) => {
        g.save();
        g.beginPath(); poly(g, BEACH_POLY); g.clip();
        g.fillStyle = L(0.34); laneSet(g, SAND_LANES[0]);
        g.fillStyle = L(0.56); laneSet(g, SAND_LANES[1]);
        g.restore();
      }, { bbox: { x: 150, y: 640, w: 1500, h: 640 } });
      p.ink((ctx) => {
        ctx.save();
        ctx.beginPath(); poly(ctx, BEACH_POLY); ctx.clip();
        ctx.fillStyle = '#55503f'; laneSet(ctx, SAND_LANES[2]);
        ctx.restore();
      }, { bbox: { x: 150, y: 640, w: 1500, h: 640 } });
      // low dunes catching the sun on their left flanks (one pass for all four)
      const dunes = [[1340, 760, 520, 46], [780, 900, 640, 60], [1460, 980, 560, 70], [420, 980, 420, 40]].map(([dx, dy, dw, dh]) => {
        const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push([dx + u * dw, dy - Math.sin(u * Math.PI) ** 1.4 * dh]); }
        return { dx, dy, dw, dh, pts };
      });
      // long low crests across the open sand, following the shore's curve: a sunlit
      // lip over a lee band, tapered at both ends
      const CRESTS = [[[1150, 770], [1290, 752], [1430, 748], [1560, 756]], [[860, 940], [1020, 912], [1200, 894], [1380, 892], [1520, 902]],
        [[1060, 1052], [1260, 1010], [1460, 990], [1640, 994]], [[1560, 840], [1700, 826], [1860, 830]]].map((c) => densify(c, 8));
      p.pass(sandMat, (g) => {
        // the dunes: two flat light steps, the sunlit flank and the shaded lee (no gradient smudges)
        for (const { dx, dy, dw, dh, pts } of dunes) {
          g.save(); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [a, b] of pts) g.lineTo(a, b); g.closePath(); g.clip();
          g.fillStyle = L(0.9); g.fillRect(dx, dy - dh - 2, dw, dh + 4);
          g.fillStyle = L(0.66); g.beginPath(); g.moveTo(dx + dw * 0.5, dy - dh - 4); g.lineTo(dx + dw * 0.62, dy - dh * 0.5); g.lineTo(dx + dw * 0.66, dy + 2); g.lineTo(dx + dw + 2, dy + 2); g.lineTo(dx + dw + 2, dy - dh - 4); g.closePath(); g.fill();
          g.restore();
        }
        for (const c of CRESTS) {
          const n = c.length - 1;
          const lip = c.map(([x, y], i) => [x, y - (3 + 3 * Math.sin(Math.PI * i / n)) * Math.sin(Math.PI * i / n)]);
          const lee = c.map(([x, y], i) => [x, y + (2 + 3 * Math.sin(Math.PI * i / n)) * Math.sin(Math.PI * i / n)]);
          g.fillStyle = L(0.9); g.beginPath(); poly(g, [...lip, ...c.slice().reverse()]); g.fill();
          g.fillStyle = L(0.52); g.beginPath(); poly(g, [...c, ...lee.slice().reverse()]); g.fill();
        }
        // wind-worked sand between the crests (R4-s01: the open sand was the
        // biggest area of the end frame and empty). Broken dashes of 8-26 units
        // in the sand ramp's mid tone, in drifts that follow each crest's curve,
        // about a third of the shore band's density, so the sand posterises into
        // wind lanes instead of printing as blank paper (standard 31).
        const sr = new RNG('sand-lanes');
        for (const [lv, dens, wide] of [[0.5, 1, 1], [0.3, 0.55, 0.8], [0.15, 0.34, 0.6]]) {
          g.fillStyle = L(lv);
          g.beginPath();
          for (const c of CRESTS) for (let k = 0; k < 11; k++) {
            const off = -40 + k * sr.range(11, 22);
            let i = sr.int(0, 4);
            while (i < c.length - 2) {
              const n = sr.int(3, 9), a = c[i], b = c[Math.min(c.length - 1, i + n)];
              const dy = off + sr.range(-6, 6), th = sr.range(1.1, 2.8) * wide;
              if (sr.chance(1 - dens * 0.72)) { i += n + sr.int(1, 6); continue; }
              g.moveTo(a[0], a[1] + dy); g.lineTo(b[0], b[1] + dy);
              g.lineTo(b[0] - 1.5, b[1] + dy + th); g.lineTo(a[0] + 1.5, a[1] + dy + th * 0.5); g.closePath();
              i += n + sr.int(2, 8);
            }
          }
          g.fill();
        }
      }, { bbox: { x: 418, y: 660, w: 1604, h: 460 } });
      // wrack, driftwood and pebbles left by the tide (the wind ripples
      // themselves are painted in the sand material above, so they posterise
      // into the sand's own tones instead of printing as ink hairlines)
      p.ink((ctx) => {
        const w = new RNG('wrack');
        // wrack and driftwood left by the tide: short near-black pieces lying
        // along the sand's lanes, more of them toward the water, with a few
        // longer baulks of timber from the camp
        ctx.fillStyle = '#3a352c';
        ctx.beginPath();
        for (let k = 0; k < 46; k++) {
          const c = CRESTS[w.int(0, CRESTS.length - 1)];
          const q = c[w.int(0, c.length - 1)];
          const x = q[0] + w.range(-60, 60), y = q[1] + w.range(-10, 30);
          if (x < 700 || x > 2000 || y < 660 || y > 1120) continue;
          const long = w.chance(0.2);
          const len = long ? w.range(14, 30) : w.range(4, 10), th = long ? w.range(1.4, 2.4) : w.range(0.9, 1.6);
          const a = w.range(-0.22, 0.22) + (long ? w.range(-0.12, 0.12) : 0);
          const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
          ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + dx - Math.sin(a) * th, y + dy + Math.cos(a) * th); ctx.lineTo(x - Math.sin(a) * th * 0.7, y + Math.cos(a) * th * 0.7); ctx.closePath();
        }
        ctx.fill();
        // pebble bands: clusters of small angular stones along two drift lines
        // (plate 5's beach carries them between the lanes)
        ctx.fillStyle = '#4a443a';
        ctx.beginPath();
        for (const c of [CRESTS[1], CRESTS[2], CRESTS[0]]) {
          for (let k = 0, nk = w.int(5, 8); k < nk; k++) {
            const q = c[w.int(2, c.length - 3)];
            const cx = q[0] + w.range(-40, 40), cy = q[1] + w.range(6, 40);
            if (cx < 720 || cx > 1980 || cy < 680 || cy > 1100) continue;
            for (let j = 0, nj = w.int(6, 16); j < nj; j++) {
              const px = cx + w.range(-26, 26), py = cy + w.range(-7, 7), rr = w.range(1, 2.6);
              ctx.moveTo(px - rr, py); ctx.lineTo(px, py - rr * 0.7); ctx.lineTo(px + rr, py); ctx.lineTo(px + rr * 0.3, py + rr * 0.7); ctx.closePath();
            }
          }
        }
        ctx.fill();
      }, { bbox: { x: 690, y: 650, w: 1320, h: 480 } });
      // maquis along the foot of the cliff and on the dunes
      const tufts = [];
      const tr = new RNG('tuft-clumps');
      for (let x = 2140; x > 900;) {      // clumps of 3-6 tufts with bare gaps between them
        const n = tr.int(3, 6);
        for (let k = 0; k < n; k++) tufts.push([x - k * tr.range(8, 14), 704 + tr.range(0, 12), tr.range(4.5, 11)]);
        x -= n * 11 + tr.range(40, 120);
      }
      // clumps on the open sand too (R4-s01: the biggest area of the end frame
      // carried nothing between the camp and the horse)
      for (const [cx, cy] of [[1900, 742], [1660, 760], [1360, 892], [880, 975], [1760, 772], [1520, 806], [1860, 878], [1296, 946], [1640, 918], [860, 806], [1760, 1000], [1120, 1034]]) {
        for (let j = 0; j < 6; j++) tufts.push([cx - j * 16 + 40, cy + ((j * 7) % 6), 7 + ((j * 5) % 6)]);
      }
      shrubs(p, tufts, { seed: 'tufts' });
      // ash of the burnt Greek camp: low charred heaps with timber stubs
      p.ink((ctx) => {
        const r = new RNG('ash');
        for (const [x, y, s] of [[760, 830, 26], [670, 868, 20], [596, 905, 22]]) {
          // a crisp, irregular scorch on the sand (no soft pad)
          ctx.fillStyle = '#d2c9b6';
          ctx.beginPath();
          for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, rr = 1 + r.range(-0.28, 0.28); const px = x + s * 0.4 + Math.cos(a) * s * 1.9 * rr, py = y + 1 + Math.sin(a) * s * 0.36 * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.closePath(); ctx.fill();
          const pts = [];
          for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push([x - s + 2 * s * u, y - s * 0.34 * Math.sin(Math.PI * u) ** 0.7 * r.range(0.7, 1.2)]); }
          ctx.fillStyle = '#26221d';
          ctx.beginPath(); ctx.moveTo(x - s, y + 1); for (const [a, b] of pts) ctx.lineTo(a, b); ctx.lineTo(x + s, y + 1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#4a4036'; ctx.lineWidth = 1.1; ctx.beginPath();
          for (let i = 1; i < 6; i++) { const [a, b] = pts[i]; i === 1 ? ctx.moveTo(a, b + 0.6) : ctx.lineTo(a, b + 0.6); }
          ctx.stroke();
          ctx.strokeStyle = '#1b1814'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const bx = x - s * 0.6 + k * s * 0.4 + r.range(-3, 3), by = y - s * 0.12;
            const a = r.range(-1.1, 1.1), l = s * r.range(0.25, 0.45);
            ctx.moveTo(bx, by); ctx.lineTo(bx + Math.sin(a) * l, by - Math.cos(a) * l);
          }
          ctx.stroke();
        }
      }, { bbox: { x: 520, y: 790, w: 330, h: 140 } });
      // the platform's two ruts dragged up from the shore to the horse
      p.ink((ctx) => {
        ctx.strokeStyle = '#c9bfa9'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        for (const off of [-6, 6]) { ctx.moveTo(620 - off, 760 + off * 0.3); ctx.bezierCurveTo(740 - off, 800 + off * 0.5, 850 - off, 840 + off * 0.5, HORSE_AT.x - 24 - off, HORSE_AT.y + 2 + off * 0.3); }
        ctx.stroke();
      }, { bbox: { x: 600, y: 750, w: HORSE_AT.x - 590, h: HORSE_AT.y - 734 } });
      // the horse, alone on the sand facing the city, its afternoon shadow thrown
      // right: the day near-black family of s02 and s04 (production standard 25),
      // with a hard contact shadow under each of the platform's three wheels
      p.ink((ctx) => {
        const { x, y, s: hs } = HORSE_AT;
        ctx.fillStyle = 'rgba(16,18,15,0.9)';
        ctx.beginPath(); ctx.moveTo(x - 30, y - 1); ctx.lineTo(x + 34, y - 1); ctx.lineTo(x + 118, y + 16); ctx.lineTo(x + 58, y + 16); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(16,18,15,0.95)';
        for (const wx of [-234, 0, 234]) {
          const cx = x + wx * hs, r = 46 * hs;
          ctx.beginPath(); ctx.moveTo(cx - r * 0.9, y - 0.5); ctx.lineTo(cx + r * 0.9, y - 0.5); ctx.lineTo(cx + r * 2.2, y + 2.6); ctx.lineTo(cx - r * 0.3, y + 2.6); ctx.closePath(); ctx.fill();
        }
      }, { bbox: { x: HORSE_AT.x - 34, y: HORSE_AT.y - 4, w: 160, h: 24 } });
      paintHorse(p, { x: HORSE_AT.x, y: HORSE_AT.y, s: HORSE_AT.s });
    } },
    { actor: 'wisps', depth: 1, draw(ctx, e) {
      // smoke from the burnt camp's cold ash: ash-grey plumes of a few big
      // billows (fx.js smoke with a day palette, lit by the sun at upper left,
      // no fire under it) that bend seaward on the breeze and widen into a veil.
      // Each puff rises on twos and shrinks away at the top; with reduced motion
      // the plumes hold still
      const t = e.reduced ? 6 : e.wall;
      for (const [x, y, w, h, seed, drift] of SMOKES) {
        // (round 6, R5-s01: at 6 puffs in groups of 3 each plume printed as a
        // chain of 4-6 near-identical lozenges with its own crescent. More puffs
        // in smaller groups close the gaps, so fx.js's bridge between
        // consecutive puffs fires and the column is one widening ash veil.)
        smoke(ctx, e, { x, y, w, h, seed, drift, speed: h / 9, grow: 2.7, count: 12, group: 2, lit: 0, light: [-0.6, -0.8], palette: CAMP_SMOKE, time: t + seed * 3.7 });
      }
    } },
    { actor: 'birds', depth: 1, draw(ctx, e) {
      birds(ctx, e, [
        // gulls over the sea below Ida
        { x: 560, y: 330, rx: 30, ry: 10, s: 6, phase: 0 },
        { x: 595, y: 352, rx: 25, ry: 8, s: 5, phase: 1.3 },
        { x: 650, y: 320, rx: 28, ry: 12, s: 4.5, phase: 2.2 },
        { x: 500, y: 368, rx: 20, ry: 6, s: 4, phase: 0.7 },
        // a high flock that crosses the title sky (its drift wraps, so the title
        // looks the same however long it waits)
        // (above the phone caption at the end framing, still in the mid-tilt sky)
        { x: 250, y: -300, rx: 60, ry: 14, s: 10, phase: 0.2, vx: 4, span: 500 },
        { x: 300, y: -278, rx: 50, ry: 12, s: 9, phase: 1.1, vx: 4, span: 500 },
        { x: 345, y: -315, rx: 55, ry: 16, s: 9.5, phase: 2.4, vx: 4, span: 500 },
        { x: 205, y: -268, rx: 40, ry: 10, s: 8, phase: 3.0, vx: 4, span: 500 },
      ]);
    } },
  ],
};
