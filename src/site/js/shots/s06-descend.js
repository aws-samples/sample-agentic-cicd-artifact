// VI · ODYSSEUS DESCENDS — two setups in one shot, cut on a beat.
// (a) Under the horse's belly: the hatch drops open, a rope uncoils, and
//     Odysseus (black armour, navy cloak) slides down and lands crouching on
//     the deck, the temple of Athena pale in the distance between the legs.
//     The camera cranes down with him. He stands 1/12 of the horse.
// (b) Wide, looking back across the plaza at the Scaean Gate. The horse came
//     through it heading right (s04), so the gate lies behind the horse, to
//     the left. Four tiny Greeks creep from the horse along the colonnade
//     toward the gate. The moon stands beyond the stoa at upper right, so the
//     columns, the gate and the horse throw long shadows toward us and to the
//     left across the paving, and the men creep through the stripes.
// Both setups share one world rect; each layer shows only in its half.

import { sky, moon, streaks, cypress } from '../kit/nature.js';
import { templeOfAthena, paving, houses, layoutHouses, litWindows, colonnade, nightStreaks, gateInner, gateStoneMat, paintGateDoors, GATE } from '../kit/temple.js';
import { paintHorse, HORSE, hatchDoorSprite, drawHatchDoor } from '../assets/horse.js';
import { odysseus, hoplite, trojan, stride, gaitPhase } from '../kit/figures.js';
import { RNG, lerp, ease, span } from '../engine/rng.js';
import { C, mat } from '../kit/palette.js';
import { L } from '../engine/bake.js';
import { beatAt, START } from '../story.js';

// Beat-locked times come from the canonical grid (production standard 12):
// BT(n) is beat n in shot-local seconds. s06 runs from beat 44 to beat 56.
const BT = (n) => beatAt(n) - START.s06;
const CUT = BT(51);                                // the cut between the setups (local 3.914, global 28.55)
const A = (e) => (e.t < CUT ? 1 : 0);
const B = (e) => (e.t >= CUT ? 1 : 0);

// ---------------------------------------------------------------- (a) the belly
const HA = { x: 830, y: 1200, s: 2.0 };
const ROPE_X = HA.x + (HORSE.hatch.rope.x - HORSE.w / 2) * HA.s;
const SILL = HA.y + (HORSE.hatch.rope.y - HORSE.h) * HA.s;
const DECK = HA.y + (HORSE.deck - HORSE.h) * HA.s;
const OH = (HORSE.h * HA.s) / 12;                  // the horse stands 12 men tall (STYLE, production standard 2)
const HOLE = {                                     // the hatch opening in the flank, world units
  x: HA.x + (HORSE.hatch.x - HORSE.w / 2) * HA.s, y: HA.y + (HORSE.hatch.y - HORSE.h) * HA.s,
  w: HORSE.hatch.w * HA.s, h: HORSE.hatch.h * HA.s,
};
const ROPE_TOP = HOLE.y + 8;                       // tied to a beam inside, it hangs out over the sill
const ROPE_W = 2.25 * HA.s;                        // ~4.5 units: a hawser about 1/32 of a man
// T_DOOR: unbarred from inside, the leaf tips and falls about its bottom hinge
// (beat 45 -> beat 46), slams against the hull and bounces twice
// The rope drops on beat 46-47, he climbs out just after beat 47, lands on
// beat 50 (with the shake) and rises into the crouch on its off-beat.
const T_DOOR = [BT(45), BT(46)], T_ROPE = [BT(46) + 0.03, BT(47) - 0.02], T_SLIDE = [BT(47) + 0.1, BT(50)], T_LAND = BT(50), T_CROUCH = BT(50.5);
const RISE = [-0.17, 0.08];                        // from the landing into the crouch, around T_CROUCH
const HERO = { hero: true, light: 1 };            // keep the moonlit rim on his right-hand edges at any size
const ODIR = -1;                                   // he faces the temple and the gate, the way the four will creep in (b)
const CYPRESS_A = [[905, 122], [948, 92], [1236, 132], [1452, 104]];   // [x, height] in the far layer
const TEMPLE_A = { x: 560 };                       // the temple between the hind leg and the rope (its tail side, as in s05)
// the town beyond the plaza: fewer, sparser windows (white terraces, not a grid
// of black panes), and a few lamps still burning, as s05's last lamps do
// across the cut
const HOUSES_A = { x0: -300, x1: 1900, y: 770, h: [70, 150], w: [90, 160], win: 8, winSkip: 0.58, winGap: 4.6, seed: 's06-ah' };
const PAVE_LIT_A = 0.86;                           // (a)'s strip of plaza paving: s05's plaza light, across the 24.64 cut
const LAMPS_A = [9, 27, 30, 38];                    // indices into layoutHouses(HOUSES_A).windows: in view for the whole setup, clear of the temple, the cypresses and the rope (evidence/tmp/B2/r3/lampprobe.mjs); 4 in landscape, 2 on phones
const LAY_A = layoutHouses(HOUSES_A);
const lampsA = LAMPS_A.filter((i) => LAY_A.windows[i]).map((i) => ({ ...LAY_A.windows[i], off: Infinity }));
// s05's street light across the 24.64 cut: this is the same row of houses, so
// it takes s05's own recipe for its near town (its `faceOf(..., 0.6)`): a front
// with a burning lamp stands in the moon's shadow, navy-black under its moonlit
// coping and side wall; of the rest, three in five turn to the moon and print
// bright ivory (1.18-1.3) and two in five stand in shadow, so neighbouring
// houses differ and the block is no row of identical grey boxes.
const FACE_A = (() => {
  const r = new RNG('s06-aface');
  return LAY_A.list.map((hs) => {
    const lamp = hs.wins.some((w) => lampsA.some((l) => l.x === w.x && l.y === w.y));
    const dark = lamp || !r.chance(0.6);
    return dark ? r.range(0.1, 0.16) : r.range(1.18, 1.3);
  });
})();
const faceA = (hs, i) => FACE_A[i] ?? 1.2;

// ---------------------------------------------------------------- (b) the plaza
const HZB = 500;                                   // horizon of the plaza paving
const KB = 0.125;                                  // a man's height per unit of depth below the horizon (eye ~8 men up)
const manAt = (y) => (y - HZB) * KB;               // standing height of a man whose feet are at y
const GATE_B = { x: 500, y: 640, s: 0.47 };       // inner face of the gate: its passage stands 12.6 men tall
// marks scale with depth (standard 26): the gate and the stoa stand where a man
// is GATE_B.s of s07's (where the gate is drawn at s 1), so their stone takes
// L1c's mark scale GATE_B.s: the same marks per block as s07's gate across the
// 31.35 cut (tower faces p50 198/195 here against s07's 196/191; at world size
// they printed 186/158, grey camouflage on the small towers)
const GATE_MS = GATE_B.s;
// The stoa's own mark scale. Its lit shafts are only 5 device px wide at DPR 1,
// and at GATE_MS the vocabulary put 3.4-px marks on them - 0.68 of the shaft's
// width, where plate 1's and plate 3's columns carry marks at 0.19 of theirs
// (review 5). The shafts are therefore marked at the scale their own width can
// carry: at 0.24 the engraving and the pits fall under illustrate.js's few-pixel
// floor and fade out instead of aliasing (standard 26), so a 5-px shaft reads as
// clean dressed stone under its ink, as plate 1's small colonnade does. The
// gate's own face keeps GATE_MS, so s06b and s07 stay one design across 31.35.
const STOA_MS = 0.24;
// the stoa starts just inside the gate's right tower, which overlaps its end (no sky seam between them)
const STOA = { x0: GATE_B.x + GATE.towerX[1] * GATE_B.s - 8, x1: 2500, y: 644, h: 360, gap: 140, steps: 3 };
const HB_Y = 774;
const HB = { x: 1230, y: HB_Y, s: (manAt(HB_Y) * 12) / HORSE.h };
// the moon throws a point 1 unit up to (x + SH.x, y + SH.y). It stands at the
// right, beyond the plaza, so the shadows fall toward us and to the left, at
// s07's azimuth on its paving across the 31.35 cut, and at the one night's
// elevation (standard 33: 55 degrees in s05, s06b and s07, so a shadow is
// cot 55 = 0.7 of its caster's height sideways; B1's LANDED values 09:43:
// s05 (-0.7, 0.309), s06b (-0.7, 0.336), s07 (-0.7, 0.372)): a band under the
// gate and the stoa, with moonlit paving in front of it (standard 24: no black
// bed across the bottom of the frame)
const SH = { x: -0.7, y: 0.336 };
// The lit paving: this is s05's plaza seen from the other side, so it takes
// s05's own recipe (B1's flags.face, standard 31: a moonlit night floor keeps
// real mid-tones and is never one flat tone). `PAVE_LIT` is the calm light the
// far, thin rows settle to; every flag nearer than that takes its own face
// light: two in five a worn tone 4 (#d1c7bd), nearly half moonlit tone 5, and
// the rest the most worn. s05's own most worn flag is 0.55; in (b) it is 0.62,
// because the shadow step map below has to tell a flag face (with its soft edge
// ramps, which reach 0.55) from a joint (0.34-0.46). s05's `near` step starts
// at half the yFar..yNear span, which in both of s06's setups lies below the
// frame, so it is left out here.
const PAVE_LIT = 0.86;
const PAVE_FACE_A = [[0.78, 0.42], [0.92, 0.50], [0.70, 0.08]];      // s05's round-6 set exactly (no shadow map on (a)'s strip; s05's caption-row `near` step falls below the frame in both of s06's setups)
// (b) keeps its own weights, and they are s05's near rows: s05 applies a `near`
// step to the rows the caption sits on, and paving() computes
// l = face + near.light - light, so s05's VISIBLE near flags land at
// 0.78+0.74-0.86 = 0.66, 0.92+0.74-0.86 = 0.80 and 0.70+0.74-0.86 = 0.58. s06b
// shows that same near plaza with no step of its own (s05's `from` lies below
// both of s06's frames), so 0.68 / 0.92 / 0.62 is s05's near floor to within
// 0.02-0.12 - and it is what keeps standard 31's mid-tone share (s05's far-row
// set measures tones 3+4 24% here against 29-30% with these, because 0.78 and
// 0.92 both land in the top band).
const PAVE_FACE = [[0.68, 0.46], [0.92, 0.46], [0.62, 0.08]];
// the plaza's stone: L1c's calm floor preset (standard 26: floors stay calm,
// the marks go on risers, walls and statues) with fine rare cracks, as s05's
// and s09's plazas (B1's floorStone(p, { crack: 0.12 }))
const floorMat = (p) => mat(p.mat.floor ?? p.mat.stone, { crack: { amp: 0.12, width: 0.05 } });
// the plaza's irregular cracked flagstones (B1's paving flags) as s05's plaza
// on the other side of the 24.64 cut: pale joints, few chips and cracks (a calm floor)
// (a) is s05's own flag design: no joint cores (each joint is one light step),
// so a worn 0.55 flag never gets a joint brighter than its own face. (b) keeps
// cores, darker than every face, because its shadow step map reads them.
const PAVE_FLAGS = { split: 0.22, jitter: 0.045, merge: 0.15, chip: 0.08, crack: 0.04, face: PAVE_FACE_A };
const PAVE_FLAGS_B = { ...PAVE_FLAGS, joints: [0.34, 0.46], face: PAVE_FACE };
// the city wall left of the gate: its far end, and its height: s03/s04's city
// wall beside the gate (GATE.stone.sideLow, 0.58 passages), as s07 shows it
// across the 31.35 cut, so the towers stand up into the sky (standard 20)
const WALL_SIDE = GATE.stone.sideLow ?? GATE.stone.sideH;
const WALL_X0 = -400, WALL_H = WALL_SIDE * GATE_B.s;
// the plaza paving of (b): no far shade (the buildings' real shadow lies there)
const PAVE_B = { x0: -600, x1: 2400, yFar: 600, yNear: 1500, hz: HZB, vx: 700, slab: 260, rowStep: 0.3, light: PAVE_LIT, joint: 0.5, nearShade: 0.4, farShade: 0, bright: 0, seed: 's06-bpave', flags: PAVE_FLAGS_B };
// Inside a moon shadow (standard 19) the paving's guide light L is remapped by
// a step at SHADE_MAP.edge: everything the paving paints as a lit flag face
// (0.55 and up in this frame: faces 0.62-0.90, their soft edge ramps 0.07 of
// their own light deep) falls to `floor` 0.08, the stone's
// darkest tone, navy-black (under its 0.13 band edge even with the
// material's noise, which fades to 0.28 of its strength this deep); what it
// paints darker, its joints (0.34-0.46, and 0.46-0.50 where a thin joint is
// anti-aliased into a pixel of face), chips and cracks, lands at `top` 0.178,
// in the next tone (0.13-0.3), so the joints print as lighter broken arrises
// in the field (the facet noise breaks them into dashes). The step between
// the two is 0.098, under the stone's crease threshold (0.14) even across a
// diagonal joint (x 1.41), so the crease ink does not black the joints out
// again; the shadow's edge against the lit flags is inked. A pure value map
// of the guide (canvas compositing), so it follows whatever paving() draws.
const SHADE_MAP = { edge: 0.50, slope: 50, top: 0.178, floor: 0.08 };
const shadeOf = (l) => SHADE_MAP.floor + (SHADE_MAP.top - SHADE_MAP.floor) * Math.min(1, Math.max(0, (SHADE_MAP.edge - l) * SHADE_MAP.slope));
// the step shadows on the stoa's risers, in the same values: a flag face, and a joint as the nosing's arris
const STEP_SHADE = { face: shadeOf(PAVE_LIT), arris: shadeOf(0.4) };
const SHADOW_INK = 'rgba(3,5,26,0.93)';            // the same navy-black shadow, drawn per frame under a creeping man
// (a) stands under the same moon as (b) (standard 33: one night, 55 degrees at
// upper right), so the hero of the shot throws a shadow too. The deck is seen
// nearly edge-on - 28 world units from the plank line he stands on (DECK) to
// the dedication board's top - so his shadow is not the figures kit's wedge on
// a ground plane but a hard-edged angular patch foreshortened across the
// planks, running left and toward us from his boots (the moon is at upper
// right) and stopping at the platform's front edge. Plate 4's shadows, never a
// soft puddle. He is in the air during the slide, so that pose casts nothing.
const SH_A = SH;                                   // (a) stands under (b)'s moon: one night (standard 33)
const DECK_SHADOW = [[16, 0], [-4, 0], [-38, 3], [-66, 7], [-82, 14], [-72, 22], [-44, 27], [-14, 28], [8, 21], [19, 9]];
const MOON_B = { x: 1420, y: 70, r: 16 };         // high over the stoa, right of the caption and clear of the temple's pediment
// the temple of Athena on the citadel beyond the stoa, behind the horse's back
// (where (a) shows it between the legs): only its pediment and cornice rise
// over the stoa roof (y 160), its apex at y TEMPLE_B.apex
const TEMPLE_B = { x: 1170, apex: 104, s: 0.4, above: 166 };
// the streak clouds over the city wall left of the gate: s07's own ('s07-hl'
// in s07-inner-gate.js), mapped into this frame through the gate (s07 draws
// the gate at x 800, ground 880, s 1; here at GATE_B), so they stay put
// across the 31.35 cut. s07 shows the sky over that wall from x ~0 here, so
// nothing else is drawn there (round 3's cumulus bank vanished at the cut).
const S07 = { x: 800, y: 880 };
const toB = (x, y) => [GATE_B.x + (x - S07.x) * GATE_B.s, GATE_B.y + (y - S07.y) * GATE_B.s];
const STREAKS_L = (() => {
  const [x0, y] = toB(-700, 490), [x1] = toB(180, 490);
  return { x0, x1, y, depth: 22 * GATE_B.s, count: 4, seed: 's07-hl', scale: 0.8 * GATE_B.s };
})();
// the creepers: the lead's path, and each man's distance behind him. They
// come out from beside the horse's platform (its left end is x 1034) and cross
// the moonlit paving toward the gate, just in front of the stoa's shadow band,
// so the four dark figures read against the flags
const LEAD = { x0: 1010, y0: 800, x1: 830, y1: 772 };
const TEAM = [
  { gap: 0, cloak: 'navy', who: 'odysseus', ph0: 0 },
  { gap: 46, cloak: 'navy', dy: 5, ph0: 0.37 },
  { gap: 94, cloak: 'red', dy: -2, ph0: 0.71 },
  { gap: 140, cloak: 'navy', dy: 4, ph0: 0.18 },
];
// Two Trojan guards asleep on the moonlit flags after the feast (D1's 'sleep'
// pose, bronze-armoured guards): one at the foot of the near pier with his
// spear propped against it, one in front of the gate with his spear leaning on
// his shield. The four creep past them toward the gate.
// A sleeper is a horizontal dash about 0.3 h high, which at the end key is 13
// screen px: too low to read as a man at 1x (review 5). Each one is therefore
// given ONE VERTICAL MARK beside him - his aspis standing on its rim, 26-28
// screen px tall - so the pair reads the way plate 4's lone tiny figure does,
// by its vertical silhouette. `aspis` is the centre of the standing shield;
// spear is [foot, top] in world units.
const SENTRIES = [
  { x: 215, y: 872, dir: 1, seed: 7, ph0: 0, spear: [[178, 871], [116, 806]], aspis: [158, 854], lean: -0.11 },
  { x: 575, y: 850, dir: -1, seed: 12, ph0: 0.45, spear: [[516, 874], [644, 850]], aspis: [651, 838], lean: 0.13 },
];
// The framing vertical (rule 5: strong verticals, an asymmetric split): plate
// 5's giant square pillar, cut by the frame's left edge and running off its top
// and bottom. Round 5 put a round fluted column here and the frame cut away
// most of its shade half, so five of its seven visible flutes printed in one
// top tone and it read as a flat pale pilaster with ruled scratches. A square
// pier reads by its faces instead: a broad front face in the stone's mid-tone
// (standard 31: a large field is 0.72-0.80 and only the arrises go above), a
// narrow moonlit return at its right (the moon is at upper right, so the face
// turned to it is the brightest thing in the frame), a near-black arris between
// them, and plate 5's big irregular ashlar with pale bed and head joints.
// x1 is kept at the round column's right edge (55 + 120), so the silhouette,
// the sky share and the mirror metric are unchanged.
const PIER = {
  x0: -130, x1: 175, ret: 26,                      // the front face, and the moonlit return at its right
  y0: -260, y1: 1180,                              // off the frame's top and bottom in both orientations
  course: 34, block: [34, 58],                     // the ashlar: course height, block length
  face: 0.76, side: 0.94, vary: 0.015,             // the two faces, and the per-block tone spread
  seed: 's06-pier',
};

// The rope is thrown down as a coil: the coil falls (gravity) from the hatch
// and pays the line out behind it, so a nearly straight line hangs from the
// sill to the coil, with one slow pendulum bow; the coil is spent as the end
// reaches the deck, the slack lies along the deck, and the line swings a
// little and settles. Returns { pts, coil } (coil: the unpaid bundle at the
// free end, or null), or null before the throw.
const COIL = { rx: 3.6, ry: 2.1 };                 // the full coil's radii, in rope widths
// The hatch leaf and the rope move on twos (rule 11): one 12 fps drawing grid
// locked to the slam (beat 46), so the slam still lands on its beat. Odysseus
// keeps his own grid, locked to the touchdown (beat 50); the leaf and the line
// are still by the time he climbs out, so the two grids never animate together.
const doorT = (t) => T_DOOR[1] + Math.floor((t - T_DOOR[1]) * 12 + 1e-6) / 12;
// t: the drawing's time (doorT); taut: he has hold of the line (it hangs straight)
function ropeAt(t, taut) {
  const u = ease.inQuad(span(t, T_ROPE[0], T_ROPE[1]));
  if (u <= 0) return null;
  // the line is tied inside and paid out from the sill, so the coil's first
  // drawing sits on the sill and falls from there
  const len = (SILL - ROPE_TOP) + (DECK - SILL + 70) * u;
  const settle = span(t, T_ROPE[1], T_ROPE[1] + 1.2);
  const pts = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    let y = ROPE_TOP + len * k, x = ROPE_X;
    if (!taut && y > SILL) {
      const kb = (y - SILL) / Math.max(1, ROPE_TOP + len - SILL);                   // 0 at the sill, 1 at the free end
      x += (1 - u) * Math.min(14, len * 0.12) * Math.sin(t * 7) * kb * kb;           // one pendulum bow as it pays out
      x += (1 - settle) * 18 * Math.sin(t * 9) * kb * kb * (u >= 1 ? 1 : 0);         // sway after the drop
    }
    if (y > DECK) { x += (y - DECK) * 0.9; y = DECK; }                                // slack lies on the deck
    pts.push([x, y]);
  }
  // the unpaid coil at the free end: it shrinks as it pays out and is gone as the end lands
  const left = 1 - u, c = left > 0.004 ? Math.sqrt(left) : 0;
  const end = pts[n];
  const F = Math.round((t - T_DOOR[1]) * 12);       // it tumbles a few degrees per drawing
  const coil = c > 0 ? { x: end[0], y: end[1], rx: Math.max(1.2, COIL.rx * c) * ROPE_W, ry: Math.max(0.9, COIL.ry * c) * ROPE_W, a: 0.22 * Math.sin(F * 2.3) - 0.1 } : null;
  return { pts, coil };
}

function drawRope(ctx, rope, s) {
  if (!rope) return;
  const { pts, coil } = rope;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = (dx = 0) => { ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1]); for (const q of pts) ctx.lineTo(q[0] + dx, q[1]); };
  const w = ROPE_W;
  path(); ctx.strokeStyle = C.ink; ctx.lineWidth = w + 2.4 / s; ctx.stroke();
  path(); ctx.strokeStyle = '#8f8a83'; ctx.lineWidth = w; ctx.stroke();
  path(w * 0.18); ctx.strokeStyle = '#d6d1c7'; ctx.lineWidth = w * 0.38; ctx.stroke();
  // twist of the lay
  ctx.strokeStyle = 'rgba(8,8,11,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k < d; k += w * 1.15) {
      const f = k / d, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      ctx.moveTo(x - w * 0.45, y - w * 0.28); ctx.lineTo(x + w * 0.45, y + w * 0.28);
    }
  }
  ctx.stroke();
  if (!coil) return;
  // the unpaid rope: two or three bights (hanging U-turns of the lay) of
  // decreasing size, side by side under the line's end, so it reads as a hank
  // of rope paying out and never as a washer of concentric rings. Each is inked
  // and carries the moonlit highlight along its right-hand leg.
  ctx.save();
  ctx.translate(coil.x, coil.y); ctx.rotate(coil.a * 0.5);
  const R = coil.rx, D = coil.ry * 2.6;
  const n = R * s > 7 ? 3 : 2;
  const bight = (i) => {
    const xl = -R * (0.85 - 0.22 * i), xr = R * (0.5 - 0.16 * i), d = D * (1 - 0.2 * i);
    ctx.beginPath(); ctx.moveTo(xl, 0);
    ctx.bezierCurveTo(xl - R * 0.12, d * 0.85, xr + R * 0.12, d * 0.85, xr, 0);
    return [xl, xr, d];
  };
  for (let i = n - 1; i >= 0; i--) {                 // the smallest (nearest the line) last, over the others
    bight(i); ctx.strokeStyle = C.ink; ctx.lineWidth = w + 2.4 / s; ctx.stroke();
    bight(i); ctx.strokeStyle = '#8f8a83'; ctx.lineWidth = w; ctx.stroke();
    const [, xr, d] = bight(i); ctx.beginPath();
    ctx.moveTo(xr - R * 0.06, d * 0.5); ctx.quadraticCurveTo(xr + R * 0.06, d * 0.4, xr, 0);
    ctx.strokeStyle = '#d6d1c7'; ctx.lineWidth = w * 0.38; ctx.stroke();
  }
  ctx.restore();
}

// The hatch leaf: 0 shut, 1 hanging down against the hull (drawHatchDoor turns
// it through 180 degrees). It is nudged open, falls under gravity (slow, then
// faster and faster), hits the hull and bounces out twice before it settles.
// bounces: [duration, height] of each half-sine away from the hull, shorter and lower than the last
const BOUNCES = [[0.2, 0.17], [0.13, 0.06], [0.09, 0.02]];
function hatchOpen(t) {
  const [t0, t1] = T_DOOR;
  if (t <= t0 - 0.12) return 0;
  if (t < t0) return 0.035 * ease.outQuad(span(t, t0 - 0.12, t0));   // the bar comes off: the leaf cracks open
  if (t < t1) { const u = (t - t0) / (t1 - t0); return 0.035 + 0.965 * u * u; }
  const d = t - t1;
  let a = 0;
  for (const [len, amp] of BOUNCES) { if (d < a + len) return 1 - amp * Math.sin(Math.PI * (d - a) / len); a += len; }
  return 1;
}

// The dim interior seen through the open hatch: the far flank's ribs and a
// wedge of moonlight falling in from the upper right onto the lower left, so
// his black helmet and cuirass read as he climbs out.
function hatchInterior(ctx, e) {
  const { x, y, w, h } = HOLE, s = HA.s;
  ctx.fillStyle = '#05060b'; ctx.fillRect(x, y, w, h);
  // moonlight through the opening: the lintel shades the top, the light lands low on the left
  ctx.fillStyle = '#161a28';
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.3); ctx.lineTo(x + w * 0.62, SILL); ctx.lineTo(x, SILL); ctx.closePath(); ctx.fill();
  // ribs of the far flank (they catch the light where the wedge crosses them)
  for (const f of [0.17, 0.5, 0.81]) {
    const rx = x + w * f, rw = 3.2 * s;
    ctx.fillStyle = '#0d101a'; ctx.fillRect(rx, y, rw, h);
    const yl = y + h * 0.3 + ((SILL - y - h * 0.3) * (rx - x)) / (w * 0.62);
    if (yl < SILL) { ctx.fillStyle = '#262b3c'; ctx.fillRect(rx, yl, rw, SILL - yl); }
  }
  // the hull's thickness: the left return faces the moon, the right one and the lintel's underside do not
  ctx.fillStyle = '#3a3f52'; ctx.fillRect(x, y + 1.5 * s, 2.6 * s, SILL - y - 1.5 * s);
  ctx.fillStyle = '#020306'; ctx.fillRect(x, y, w, 2.2 * s); ctx.fillRect(x + w - 2.4 * s, y, 2.4 * s, SILL - y);
  // the worn sill
  ctx.fillStyle = '#4a4f62'; ctx.fillRect(x, SILL - 1.6 * s, w, 1.6 * s);
}

// An actor environment whose clocks (t, the ambient wall, q(12)) all read one
// drawing time t, so a figure's pose, cloth and ambient motion change together
// on twos. The object is reused (no per-frame garbage).
const GRID_E = {};
function onGrid(e, t) {
  Object.assign(GRID_E, e);
  GRID_E.t = t; GRID_E.wall = t; GRID_E.q = (fps = 12) => (fps === 12 ? t : Math.floor(t * fps + 1e-6) / fps);
  return GRID_E;
}

// his shadow on the lit deck (DECK_SHADOW, world units from his boots), clipped
// to the deck's visible depth so it never climbs the hull or crosses the board
const BOARD_TOP = HA.y + ((HORSE.board?.y ?? 722) - HORSE.h) * HA.s;
function deckShadow(ctx, x) {
  const d = BOARD_TOP - DECK;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 260, DECK, 520, d); ctx.clip();
  ctx.fillStyle = SHADOW_INK;
  ctx.beginPath();
  for (let i = 0; i < DECK_SHADOW.length; i++) {
    const [dx, dy] = DECK_SHADOW[i];                // the wedge runs away from the moon's azimuth (SH_A)
    const px = x + (SH_A.x < 0 ? dx : -dx), py = DECK + (dy / 28) * d;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function descent(ctx, e) {
  // his drawings: on twos (12 fps), the grid locked to the touchdown beat, so
  // the first landing drawing and the shake both fall exactly on beat 50
  const t = T_LAND + Math.floor((e.t - T_LAND) * 12 + 1e-6) / 12;
  const tq = doorT(e.t), climbing = t >= T_SLIDE[0] - 0.05;
  const open = hatchOpen(tq);
  if (open > 0) hatchInterior(ctx, e);
  drawHatchDoor(ctx, e, { x: HA.x, y: HA.y, s: HA.s, open });
  drawRope(ctx, ropeAt(tq, climbing), e.s);
  if (!climbing) return;
  // his cloak's flutter and every other drawing clock of the figures kit run on
  // the same grid as his pose (the kit's ambient clock is e.wall), so each
  // drawing changes all at once, on twos
  e = onGrid(e, t);
  ctx.save();
  // he is seen in the dark opening, then below the sill as he lowers himself out
  ctx.beginPath(); ctx.rect(HOLE.x, HOLE.y, HOLE.w, SILL - HOLE.y); ctx.rect(-4000, SILL - 2, 9000, 6000); ctx.clip();
  if (t < T_LAND) {
    // lower himself out, then slide fast and brake above the deck
    const u = span(t, T_SLIDE[0], T_SLIDE[1]);
    const k = u < 0.18 ? (u / 0.18) * 0.12 : 0.12 + 0.88 * ease.inOutSine((u - 0.18) / 0.82);
    const feet = lerp(SILL + OH * 0.05, DECK - OH * 0.04, k);
    // the figure redraws the taut rope between its far and near limbs, so his legs wrap it
    odysseus(ctx, e, { x: ROPE_X, y: feet, h: OH, dir: ODIR, pose: 'slide', ropeX: ROPE_X, ropeTop: ROPE_TOP, ropeBottom: DECK - 1,
      ropeW: ROPE_W, ropeColor: '#8f8a83', ropeLight: '#d6d1c7', seed: 1, ...HERO });
  } else if (t < T_CROUCH + RISE[1]) {
    // touched down: the landing absorbs, then he rises into the crouch through
    // the kit's land phase (0 = deep landing, 1 = the crouch), three drawings on twos
    const k = span(t, T_CROUCH + RISE[0], T_CROUCH + RISE[1]);
    const x = ROPE_X - ODIR * OH * lerp(0.06, 0.04, k);
    deckShadow(ctx, x);
    odysseus(ctx, e, { x, y: DECK, h: OH, dir: ODIR, pose: 'land', phase: k, sword: 'hand', seed: 1, ...HERO });
  } else {
    const x = ROPE_X - ODIR * OH * 0.04;
    deckShadow(ctx, x);
    odysseus(ctx, e, { x, y: DECK, h: OH, dir: ODIR, pose: 'crouch', sword: 'hand', seed: 1, ...HERO });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- (b) shadows
// Everything on the plaza is lit from beyond the stoa: a point `t` above the
// ground at (x, gy) falls at (x + SH.x * t, gy + SH.y * t). The shadows are
// a remap of the paving's own guide (SHADE_MAP), so the stone material renders
// them in its darkest tone with lighter joints (navy-black flags; no extra layer).
const P = (x, gy, t) => [x + SH.x * t, gy + SH.y * t];
// every polygon is added with the same winding, so overlapping shadows union under the nonzero rule (fill and clip)
function polyPts(ctx, pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p0 = pts[i], p1 = pts[(i + 1) % pts.length]; a += p0[0] * p1[1] - p1[0] * p0[1]; }
  const q = a < 0 ? pts.slice().reverse() : pts;
  ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
}

// the columns (shaft with entasis, echinus, abacus), the entablature and the
// eaves, and the gate's towers, curtain and city wall, sheared onto the
// ground as one path. `stoa` is what colonnade() returned.
function architectureShadowPath(ctx, stoa) {
  if (stoa?.cols && stoa.sty != null) {
    const { cols, r = STOA.h * 0.075, sty } = stoa;
    // column height and entablature depth from the kit's geometry (fallback: its proportions)
    const h = stoa.yA != null ? sty - stoa.yA : STOA.h, ent = stoa.top != null && stoa.yA != null ? stoa.yA - stoa.top : STOA.h * 0.26;
    const cap = r * 0.95;
    const sil = [[-1, 0], [-0.84, h - cap], [-1.35, h - cap * 0.6], [-1.42, h - cap * 0.4], [-1.42, h], [1.42, h], [1.42, h - cap * 0.4], [1.35, h - cap * 0.6], [0.84, h - cap], [1, 0]];
    for (const cx of cols) polyPts(ctx, sil.map(([k, t]) => P(cx + k * r, sty, t)));
    polyPts(ctx, [P(STOA.x0 - 16, sty, h), P(STOA.x1 + 16, sty, h), P(STOA.x1 + 16, sty, h + ent), P(STOA.x0 - 16, sty, h + ent)]);
  }
  const { x, y, s } = GATE_B;
  const [t0, t1] = GATE.towerX;
  const tower = GATE.towerTop * s, curtain = GATE.wallTop * s, wall = WALL_H, right = x + t1 * s, far = -2000;
  const top = [[right, tower], [x + t0 * s, tower], [x + t0 * s, curtain], [x - t0 * s, curtain],
    [x - t0 * s, tower], [x - t1 * s, tower], [x - t1 * s, wall], [far, wall]];
  polyPts(ctx, [P(far, y, 0), P(right, y, 0), ...top.map(([px, t]) => P(px, y, t))]);
}

// The stoa's roof eaves seen from the plaza: the slope faces away from the
// moon (which stands beyond the stoa), so it is one navy-black tone with
// lighter cover-tile ridges, under a moonlit ridge line, with its lit
// antefixes (the kit paints it at 0.34, where the stone's facets print a
// grey camouflage band). Light values only, over the kit's own geometry:
// colonnade() puts the roof (h 0.1) between its returned top and the
// cornice; if those proportions ever change, the kit's roof is left alone.
function eaves(p, stoa) {
  if (!stoa || stoa.top == null || stoa.yA == null) return;
  const h = STOA.h, roofH = h * 0.1, x0 = STOA.x0, x1 = STOA.x1;
  if (Math.abs(stoa.yA - h * 0.16 - roofH - stoa.top) > 1) return;
  const top = stoa.top, yE = top + roofH;
  p.pass(mat(p.mat.stone, { markScale: GATE_MS }), (g) => {
    g.fillStyle = L(0.06); g.fillRect(x0 - 16, top, x1 - x0 + 32, roofH);
    for (let tx = x0 - 10; tx < x1 + 16; tx += roofH * 0.9) {
      g.fillStyle = L(0.19); g.fillRect(tx + roofH * 0.42, top, roofH * 0.1, roofH);                      // cover-tile ridges
      g.fillStyle = L(0.84); g.beginPath(); g.ellipse(tx + roofH * 0.47, yE - roofH * 0.16, roofH * 0.12, roofH * 0.18, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = L(0.9); g.fillRect(x0 - 16, top, x1 - x0 + 32, roofH * 0.08);                             // the moonlit ridge
  }, { bbox: { x: x0 - 18, y: top - 1, w: x1 - x0 + 36, h: roofH + 2 } });
}

// The columns' shadows on the stoa's own steps. colonnade() paints the steps
// on top of the paving, so the stripes on the paving would start below them,
// detached from their columns. Each riser is a vertical face: a column's
// shadow on it is a vertical band, shifted left by the depth of the steps
// above it, so the stripe steps down the risers from the column's foot and
// meets its paving stripe at the bottom step. It is drawn in the paving's
// material, so each stepped band has the same navy-black tone as the stripe
// it meets, with the same lighter arris along each step's nosing.
function stepShadows(p, stoa, mat) {
  if (!stoa?.cols || stoa.sty == null) return;
  const { cols, sty } = stoa, r = stoa.r ?? STOA.h * 0.075;
  const n = STOA.steps, rise = (STOA.y - sty) / n;
  const x0 = STOA.x0 - 30, x1 = Math.min(STOA.x1 + 30, 2600);
  p.pass(mat, (g) => {
    for (let i = 0; i < n; i++) {                 // i = 0: the top riser, under the stylobate
      const y0 = sty + i * rise, dx = (SH.x * (y0 + rise - sty)) / SH.y;
      for (const cx of cols) {
        const xl = cx - r * 1.02 + dx, w = r * 2.04;
        if (xl > x1 || xl + w < x0) continue;
        g.fillStyle = L(STEP_SHADE.face); g.fillRect(xl, y0, w, rise);
        g.fillStyle = L(STEP_SHADE.arris); g.fillRect(xl, y0, w, Math.max(p.px * 1.2, rise * 0.14));
        g.fillStyle = L(0.02); g.fillRect(xl, y0 + rise * 0.9, w, rise * 0.1);
      }
    }
  }, { bbox: { x: x0, y: sty - 2, w: x1 - x0, h: STOA.y - sty + 4 } });
}

// The near pier (PIER): two flat fields, a near-black arris and plate 5's
// ashlar. The light is at upper right, so a bed joint's recess is dark along
// its upper wall and lit along its lower one, and a head joint's is lit on its
// left jamb and dark on its right - each joint is one pale line and one dark
// line, which L1c's one-sided crease inks on the dark side only, so it prints
// as a single line at any DPR. Everything else (chips, pits, weathered patches
// and the engraving) comes from the stone material (standard 18).
function nearPier(p) {
  const o = PIER, xa = o.x1 - o.ret, hh = o.y1 - o.y0;
  // the nearest stone in the frame, so its marks are the largest (standard 26's
  // depth scaling, read the other way) and its cracks are the dressed-stone
  // hairlines of a pier, not a cliff's: markScale 1.2 keeps the engraving's
  // spacing at 6.1 device px at DPR 1 and 12.2 at DPR 2, so the strokes never
  // fade at one DPR and not the other (illustrate.js fades them out under
  // 2.6-4.5 px), and crack 0.22 keeps the dark load off a dressed face, as
  // B1's steps do.
  const pm = mat(p.mat.stone, { crack: { amp: 0.22, width: 0.08 }, markScale: 1.2 });
  p.pass(pm, (g, pp) => {
    const rng = new RNG(o.seed);
    const jw = Math.max(3.0, pp.px * 2.4);                     // the joints keep a device-pixel floor
    g.fillStyle = L(o.side); g.fillRect(xa, o.y0, o.ret, hh);  // the moonlit return
    g.fillStyle = L(o.face); g.fillRect(o.x0, o.y0, xa - o.x0, hh);
    // Plate 5's ashlar: four or five blocks across the visible face, each joint
    // broken into the length of its own block (so the courses never rule a line
    // across the pier) and each course a different height. A joint is usually
    // just its moonlit worn arris: PALE_UP keeps that step under the stone's
    // crease threshold (0.14), so it carries no ink, as plate 5's pale joint
    // grid does. One joint in three is also recessed - a step the crease DOES
    // ink, on its dark side only - so dark joints come a few at a time instead
    // of as a ladder. Each block is worn a little differently and one in seven
    // is a darker stone: with L1c's seventh night tone (standard 38) those blocks
    // land at L 169 and L 137, so the pier carries the middle register plate 4
    // and plate 5 give their stone instead of one ivory field.
    const PALE_UP = 0.12, RECESS = 0.22;
    for (let y0 = o.y0; y0 < o.y1;) {
      const ch = o.course * rng.range(0.82, 1.2);
      const y1 = Math.min(o.y1, y0 + ch);
      let x = o.x0 - rng.range(0, o.block[1]);                 // the courses break at different places
      while (x < xa) {
        const w = rng.range(o.block[0], o.block[1]);
        const xl = Math.max(o.x0, x), xr = Math.min(xa, x + w);
        let fl = o.face;
        if (xr > xl) {
          const d = rng.chance(0.26) ? rng.range(0.11, 0.17) : 0;    // one block in four is a darker stone (L1c's new middle register, 13:56)
          fl = o.face + rng.range(-o.vary, o.vary) - d;
          g.fillStyle = L(fl);
          g.fillRect(xl, y0, xr - xl, y1 - y0);
          // the bed joint under this block, in its own length, its ends worn away
          const bl = xl + (xl > o.x0 ? rng.range(-2, 4) : 0), br = xr - rng.range(0, 5);
          if (y1 < o.y1 && br > bl) {
            if (rng.chance(0.34)) { g.fillStyle = L(fl - RECESS); g.fillRect(bl, y1 - jw * 0.5, br - bl, jw * 0.5); }
            g.fillStyle = L(fl + PALE_UP); g.fillRect(bl, y1, br - bl, jw * rng.range(0.8, 1.15));
          }
        }
        // the head joint at this block's right edge: its left jamb takes the moon, its right is a recess
        if (x + w < xa - jw * 2 && x + w > o.x0 + jw) {
          const hx = x + w, hy = y0 + rng.range(0, 3), hb = y1 - rng.range(0, 4);
          g.fillStyle = L(fl + PALE_UP); g.fillRect(hx - jw, hy, jw, hb - hy);
          if (rng.chance(0.34)) { g.fillStyle = L(fl - RECESS); g.fillRect(hx, hy, jw * 0.6, hb - hy); }
        }
        x += w;
      }
      // the courses carry across the return, in its own light
      if (y1 < o.y1) { g.fillStyle = L(o.side - PALE_UP * 0.85); g.fillRect(xa, y1 - jw * 0.5, o.ret, jw); }
      y0 = y1;
    }
    // the arris: the near-black corner between the two faces
    g.fillStyle = L(0.04); g.fillRect(xa - jw * 0.6, o.y0, jw * 1.2, hh);
  }, { bbox: { x: o.x0 - 2, y: o.y0 - 2, w: o.x1 - o.x0 + 4, h: hh + 4 } });
}

function horseShadowBox() {
  const s = HB.s, x0 = HB.x - (HORSE.w / 2) * s, x1 = HB.x + (HORSE.w / 2) * s, hh = HORSE.h * s;
  const a = P(x0, HB.y, hh), b = P(x1, HB.y, 0);
  return { x: Math.min(a[0], x0) - 8, y: HB.y - 8, w: Math.max(b[0], x1) - Math.min(a[0], x0) + 16, h: SH.y * hh + 16 };
}

// A painter for layout only: it records nothing (a kit's returned geometry, before painting it)
function dryPainter(p) {
  const d = { k: p.k, px: p.px, mat: p.mat, night: p.night, L: p.L, frame: p.frame, time: p.time, shot: p.shot, region: p.region,
    pass() { return d; }, ink() { return d; }, spheres() { return d; }, raw() { return d; } };
  return d;
}
// The painter for what rises above y = yMax only: it forwards the passes and
// inks whose bbox starts above it and drops the rest (hidden behind what is
// painted next), so a building behind the stoa costs one pass, not five
function abovePainter(p, yMax) {
  const ok = (o) => o?.bbox && o.bbox.y < yMax;
  const a = Object.create(p);
  a.pass = (m, draw, o) => { if (ok(o)) p.pass(m, draw, o); return a; };
  a.ink = (draw, o) => { if (ok(o)) p.ink(draw, o); return a; };
  a.spheres = (m, sp, o) => { if (ok(o)) p.spheres(m, sp, o); return a; };
  a.raw = () => a;
  return a;
}

// Scratch canvases for the bake-time masks: a DOM canvas on the page, an
// OffscreenCanvas where there is no document (a baker in a worker)
const CAN_SCRATCH = typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined';
function scratch(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

// A painter stand-in that runs another kit's guide draws straight into `ctx`
// (optionally through a transform), for masks and repaints at bake time.
function proxyPainter(p, ctx, xf = null) {
  const sp = {
    k: p.k, px: p.px, mat: p.mat, night: p.night, L: p.L, frame: p.frame, time: p.time, shot: p.shot, region: p.region,
    pass(mat, draw) { ctx.save(); if (xf) ctx.transform(...xf); run(draw(ctx, sp)); ctx.restore(); return sp; },
    ink() { return sp; }, raw() { return sp; }, spheres() { return sp; },
  };
  return sp;
}
// Remap the guide light L inside the current clip (or the whole canvas) by
// shadeOf(), with red-only fills (the stone guide has no aux channels):
// R -> 1 - R ('difference'), max(R, 1 - edge) ('lighten'), minus (1 - edge)
// ('difference' again) = max(0, edge - L), times `slope`, clamped at 1
// ('color-dodge' with 1 - 1/slope), times (top - floor) ('multiply'), plus
// floor ('lighter'). Coverage (alpha) is kept.
function shadeMap(ctx, x, y, w, h) {
  const { edge, slope, top, floor } = SHADE_MAP, v = (u) => `rgb(${Math.round(u * 255)},0,0)`;
  ctx.save();
  for (const [op, u] of [['difference', 1], ['lighten', 1 - edge], ['difference', 1 - edge], ['color-dodge', 1 - 1 / slope], ['multiply', top - floor], ['lighter', floor]]) {
    ctx.globalCompositeOperation = op; ctx.fillStyle = v(u); ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

// guideExtra for the plaza paving (runs inside its clip, in world units, at
// bake time, at the end of its guide draw)
// The joints of the far rows are a pixel or two wide, too thin to read as
// lighter lines in a navy-black field, so inside a shadow they are first
// widened: the guide is laid back over itself with 'darken', shifted
// JOINT_GROW world units up and down (a min filter: the darker joints, chips
// and cracks spread, the faces do not; the far rows' joints run across the
// frame or slant, so two vertical shifts catch them), then the step map
// lifts them.
const JOINT_GROW = 0.5;
function growJoints(ctx, src, x, y, d) {
  if (!(JOINT_GROW > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'darken';
  for (const dy of [d, -d]) ctx.drawImage(src, x, y + dy);   // vertically: the far rows' joints run across the frame or slant
  ctx.restore();
}
function plazaShadows(g, p, stoa) {
  const T = g.getTransform();
  const d = Math.max(1, Math.round(JOINT_GROW * T.a));
  // the horse: run its own painting into a mask, sheared onto the ground, and
  // remap the paving under it (where the stoa's shadow does not already lie)
  const bw = horseShadowBox();
  const px0 = Math.floor(bw.x * T.a + T.e), py0 = Math.floor(bw.y * T.d + T.f);
  const pw = Math.ceil(bw.w * T.a) + 2, ph = Math.ceil(bw.h * T.d) + 2;
  if (pw > 0 && ph > 0 && g.canvas && CAN_SCRATCH) {
    const canvas = () => scratch(pw, ph);
    const cv = canvas(), m = cv.getContext('2d');
    m.setTransform(T.a, 0, 0, T.d, T.e - px0, T.f - py0);
    const xf = [1, 0, -SH.x, -SH.y, SH.x * HB.y, HB.y + SH.y * HB.y];   // (x, gy - t) -> P(x, gy, t)
    paintHorse(proxyPainter(p, m, xf), { ...HB, lod: 'mid' });
    m.setTransform(T.a, 0, 0, T.d, T.e - px0, T.f - py0);
    m.globalCompositeOperation = 'destination-out'; m.fillStyle = '#000';
    m.beginPath(); architectureShadowPath(m, stoa); m.fill();
    const qc = canvas(), q = qc.getContext('2d');
    q.drawImage(g.canvas, px0, py0, pw, ph, 0, 0, pw, ph);              // the paving under the shadow
    const oc = canvas(); oc.getContext('2d').drawImage(qc, 0, 0);
    growJoints(q, oc, 0, 0, d);
    oc.width = 0; oc.height = 0;
    shadeMap(q, 0, 0, pw, ph);
    q.globalCompositeOperation = 'destination-in'; q.drawImage(cv, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(qc, px0, py0);
    g.restore();
    cv.width = 0; cv.height = 0; qc.width = 0; qc.height = 0;
  }
  // the stoa, the gate and the city wall: their shadow is a band under them
  // (the tallest, a tower, reaches SH.y x its height), so the joints are grown
  // only in that band of rows
  g.save();
  g.beginPath(); architectureShadowPath(g, stoa); g.clip();
  const cvs = g.canvas, yb0 = GATE_B.y - 6, yb1 = GATE_B.y + SH.y * GATE.towerTop * GATE_B.s + 6;
  const r0 = Math.max(0, Math.floor(yb0 * T.d + T.f)), r1 = Math.min(cvs?.height ?? 0, Math.ceil(yb1 * T.d + T.f));
  if (cvs && CAN_SCRATCH && r1 > r0) {
    const bc = scratch(cvs.width, r1 - r0);
    bc.getContext('2d').drawImage(cvs, 0, r0, cvs.width, r1 - r0, 0, 0, cvs.width, r1 - r0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    growJoints(g, bc, 0, r0, d);
    g.setTransform(T);
    bc.width = 0; bc.height = 0;
  }
  shadeMap(g, PAVE_B.x0, PAVE_B.yFar, PAVE_B.x1 - PAVE_B.x0, PAVE_B.yNear - PAVE_B.yFar + 10);
  g.restore();
}

// runs a guide draw that may be a generator straight through (masks and repaints at bake time)
const run = (it) => { if (it && typeof it.next === 'function') while (!it.next().done); };

// four creeping figures, receding a little as they close on the gate, each
// with his long shadow streaking ahead of him toward the gate. They are
// heroes for the figures kit (a moonlit #c3cdec rim of at least 1.3 device
// px on the moon side), so the navy and black men still read inside the navy
// shadow stripes. The option objects persist (no per-frame garbage).
const CREEP_SHADOW = { len: -SH.x, side: -1, drop: SH.y / -SH.x, w: 0.07, color: SHADOW_INK };
const FIGS = TEAM.map((m) => ({
  m, y: 0,
  o: { x: 0, y: 0, h: 0, dir: -1, pose: 'sneak', phase: 0, seed: m.gap + 1, shadow: CREEP_SHADOW, hero: true, light: 1, inkScale: 0.8,
    ...(m.who === 'odysseus' ? {} : { cloak: m.cloak, spear: false }) },
}));
const FIG_ORDER = FIGS.slice();
const SNEAK_C = stride(1, 'sneak');                 // the sneak's stride per unit of height (0.85)
const byDepth = (a, b) => a.y - b.y;
function creepers(ctx, e) {
  e = onGrid(e, e.q(12));                           // the men, their cloaks and the sleepers' breath: one 12 fps grid
  const t = Math.max(0, e.t - CUT), T = 6.71 - CUT;
  const k = t / T;
  const lx = lerp(LEAD.x0, LEAD.x1, k), ly = lerp(LEAD.y0, LEAD.y1, k);
  const dirx = LEAD.x1 - LEAD.x0, diry = LEAD.y1 - LEAD.y0, dl = Math.hypot(dirx, diry);
  const ux = dirx / dl, uy = diry / dl;
  for (let i = 0; i < FIGS.length; i++) {
    const f = FIGS[i], m = f.m, o = f.o;
    o.x = lx - ux * m.gap; o.y = ly - uy * m.gap + (m.dy ?? 0);
    o.h = manAt(o.y); f.y = o.y;
    // the kit's long sneak with planted feet: phase = distance / stride(h). He
    // shrinks as he recedes, so integrate dx / (c h(x)) along his line (about
    // 1.8 cycles a second); feet stay put on screen.
    const h0 = manAt(LEAD.y0 - uy * m.gap + (m.dy ?? 0));
    const ph = Math.abs(diry) > 1e-6 ? (Math.abs(dirx) * Math.log(o.h / h0)) / (SNEAK_C * KB * diry) : (k * Math.abs(dirx)) / (SNEAK_C * h0);
    o.phase = ((ph + m.ph0) % 1 + 1) % 1;
  }
  // far to near, so the nearer men overlap the farther
  FIG_ORDER.sort(byDepth);
  for (const f of FIG_ORDER) {
    if (f.m.who === 'odysseus') odysseus(ctx, e, f.o);
    else hoplite(ctx, e, f.o);
  }
  sentries(ctx, e);
}

// the sleeping guards (nearer than the creepers' path, so drawn after them):
// each lies in his own short moon shadow (the body is about 0.3 h high, so it
// falls a little to the left and toward us), his spear and shield beside him;
// he breathes on twos (gaitPhase reads e.q(12))
const SLEEP_O = SENTRIES.map((m) => ({ x: m.x, y: m.y, h: manAt(m.y), dir: m.dir, pose: 'sleep', phase: 0, seed: m.seed, guard: true, light: 1 }));
function sentries(ctx, e) {
  const px = 1 / e.s;
  for (let i = 0; i < SENTRIES.length; i++) {
    const m = SENTRIES[i], o = SLEEP_O[i], h = o.h;
    // his shadow: the body's low mass (about 0.3 h high) sheared along SH, an
    // angular hard-edged patch as in plate 4, never a soft puddle
    const cx = m.x - m.dir * h * 0.45, cy = m.y, lg = h * 0.52, dp = h * 0.3;
    ctx.fillStyle = SHADOW_INK;
    ctx.beginPath();
    for (const [u, v, t] of [[-1, -0.5, 0], [-0.55, -1, 0.5], [0.5, -0.95, 0.9], [1, -0.3, 1], [0.95, 0.45, 0.7], [0.1, 1, 0.3], [-0.7, 0.8, 0.1]]) {
      const x = cx + u * lg + SH.x * dp * t, y = cy + v * h * 0.1 + SH.y * dp * t;
      if (u === -1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    if (m.aspis) {
      // His aspis stands on its rim beside him, leaning on the pier or on his
      // own propped spear: the vertical mark that makes the sleeper read at 1x.
      // Dark bronze with the moon's rim arc on its upper right, a near-black
      // ink contour, and its own angular shadow sheared along SH on the flags.
      const [sx, sy] = m.aspis, rx = h * 0.095, ry = h * 0.30, a = m.lean ?? 0;
      const foot = sy + ry * Math.cos(a);
      ctx.fillStyle = SHADOW_INK;                   // the shadow of a disc standing on edge: a wedge to the left
      ctx.beginPath();
      ctx.moveTo(sx - rx * 1.1, foot - ry * 0.06); ctx.lineTo(sx + rx * 1.0, foot - ry * 0.04);
      ctx.lineTo(sx + rx * 1.0 + SH.x * ry * 0.5, foot + SH.y * ry * 0.5);
      ctx.lineTo(sx - rx * 1.4 + SH.x * ry * 0.95, foot + SH.y * ry * 0.95);
      ctx.lineTo(sx - rx * 2.0 + SH.x * ry * 0.4, foot + SH.y * ry * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(a);
      ctx.fillStyle = '#2a2723';
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(px * 1.1, h * 0.022); ctx.stroke();
      ctx.strokeStyle = '#d6cfc4'; ctx.lineWidth = Math.max(px, h * 0.02);   // the moonlit rim, upper right
      ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.82, ry * 0.9, 0, -Math.PI * 0.62, Math.PI * 0.1); ctx.stroke();
      ctx.restore();
    }
    o.phase = gaitPhase(e, 0.25, m.ph0);
    trojan(ctx, e, o);
    // the spear: an ash shaft with a bronze head, inked; moonlit along its upper side
    const [[x0, y0], [x1, y1]] = m.spear, w = Math.max(px * 1.2, h * 0.032);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink; ctx.lineWidth = w + px * 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#8f8a83'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const dl = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / dl, uy = (y1 - y0) / dl;
    ctx.fillStyle = C.ink;                          // the leaf-shaped head at the top end
    ctx.beginPath(); ctx.moveTo(x1 + ux * h * 0.16, y1 + uy * h * 0.16);
    ctx.lineTo(x1 - uy * h * 0.035, y1 + ux * h * 0.035); ctx.lineTo(x1 - ux * h * 0.02, y1 - uy * h * 0.02);
    ctx.lineTo(x1 + uy * h * 0.035, y1 - ux * h * 0.035); ctx.closePath(); ctx.fill();
  }
}

export default {
  id: 's06', dur: 6.71, night: true,
  caption: 'ODYSSEUS DESCENDS',
  captionPos: 'top', captionPosPortrait: 'top',
  // reduced motion: one held framing per setup. (a) holds the end of its
  // crane (the hatch below the caption band, the rope, the deck he lands on,
  // and the whole board in landscape; on phones the board stays just below
  // the frame, so its lettering is never cut); (b) holds its opening.
  reducedT: [[0, 3.2], [CUT, CUT]],
  cam: [
    // (a) opens close on the hatch, then pulls back as it cranes down with
    // him: at the end the hatch still clears the caption band and the whole
    // dedication board lies under his feet
    { t: 0, x: 800, y: 441, w: 1400, h: 788 },
    { t: 1.7, x: 802, y: 452, w: 1440, h: 810, ease: 'inOutSine' },
    { t: 3.2, x: 826, y: 538, w: 1640, h: 923, ease: 'inOutSine' },
    { t: CUT - 0.001, x: 830, y: 545, w: 1671, h: 940, ease: 'outQuad' },
    // (b) opens wide enough that the tower tops clear the caption band
    // the camera pushes in 8% and drifts a little the other way from the men, so
    // their creep is not cancelled: the lead crosses 191 px (12% of the frame
    // width) and the near column slides in from the left edge
    { t: CUT, x: 760, y: 428, w: 1707, h: 960, ease: 'linear' },
    { t: 6.71, x: 788, y: 440, w: 1570, h: 883, ease: 'inOutSine' },
  ],
  camPortrait: [
    // phones: the belly mass on top, the board just below the frame
    { t: 0, x: 760, y: 364, w: 500, h: 1082 },
    { t: 1.7, x: 760, y: 362, w: 496, h: 1074, ease: 'inOutSine' },
    { t: 3.2, x: 762, y: 361, w: 491, h: 1063, ease: 'inOutSine' },
    { t: CUT - 0.001, x: 762, y: 360, w: 490, h: 1061, ease: 'outQuad' },
    // (b): the four come out beside the horse's platform (its hind half, the
    // hatch and the rope at the right edge) and creep left across the lit
    // paving; the camera pans with them a little faster than they creep, so the
    // doorway comes into frame at the end; the merlons stay well under the
    // caption, the guard asleep by the gate in front
    { t: CUT, x: 930, y: 470, w: 560, h: 1213, ease: 'linear' },
    { t: 6.71, x: 720, y: 440, w: 520, h: 1126, ease: 'inOutSine' },
  ],
  sprites: {
    hatchOuter: hatchDoorSprite({ face: 'outer', maxScale: HA.s }),
    hatchInner: hatchDoorSprite({ face: 'inner', maxScale: HA.s }),
  },
  shake: (t) => (t > T_LAND && t < T_LAND + 0.2 ? [0, Math.sin((t - T_LAND) * 70) * 2.5 * (1 - (t - T_LAND) / 0.2)] : [0, 0]),
  items: [
    // ---------------- (a)
    // each setup's items carry span, so a layer bakes only what its own camera shows
    { layer: 'farA', depth: 0.5, alpha: A, span: [0, CUT], paint(p) {
      sky(p, { y0: -900, y1: 760 });
      nightStreaks(p, { x0: -200, x1: 1800, y: 600, depth: 30, count: 10, seed: 's06-st' });
      // the town, and dark cypresses among the houses, right of the rope so the slide stays on sky
      houses(p, { ...HOUSES_A, faceLight: faceA });
      for (const [x, h] of CYPRESS_A) cypress(p, { x, y: 772, h, seed: `s06-cy${x}`, lightSide: 1 });
      paving(p, { x0: -400, x1: 2000, yFar: 760, yNear: 1400, hz: 700, vx: 700, slab: 200, rowStep: 0.3, light: PAVE_LIT_A, joint: 0.5, bright: 0, seed: 's06-apave', flags: PAVE_FLAGS, mat: floorMat(p) });
      // the temple of Athena on the horse's tail side, as in s05, left of the rope so the slide reads on sky
      templeOfAthena(p, { x: TEMPLE_A.x, y: 790, s: 0.42, statue: true });
    } },
    { actor: 'lampsA', depth: 0.5, span: [0, CUT], draw(ctx, e) { if (e.t < CUT && lampsA.length) litWindows(ctx, e, lampsA); } },
    { layer: 'horseA', depth: 1, alpha: A, span: [0, CUT], paint(p) {
      paintHorse(p, { ...HA, hatch: 'hole', garlands: true });
    } },
    { actor: 'descent', depth: 1, span: [0, CUT], draw(ctx, e) { if (e.t < CUT) descent(ctx, e); } },
    // ---------------- (b)
    { layer: 'plazaB', depth: 1, alpha: B, span: [CUT, 6.71], paint(p) {
      sky(p, { y0: -900, y1: 700 });
      moon(p, MOON_B);
      // over the plain beyond the walls: plate 4's streak clouds, s07's over the
      // city wall (STREAKS_L, painted before the wall hides their feet)
      nightStreaks(p, STREAKS_L);
      // and a long thin line of streaks high over the stoa, under the moon
      streaks(p, { x0: 840, x1: 1760, y: 124, depth: 7, count: 4, seed: 's06-bst2', scale: 0.85 });
      let stoa = null;                              // filled in below, read when the paving bakes
      const pmat = floorMat(p);
      paving(p, { ...PAVE_B, mat: pmat, guideExtra: (g, pp) => plazaShadows(g, pp, stoa) });
      // the temple's pediment over the stoa roof (the stoa, painted next, hides the rest)
      const tb = templeOfAthena(dryPainter(p), { x: TEMPLE_B.x, y: 0, s: TEMPLE_B.s, statue: false });
      templeOfAthena(abovePainter(p, TEMPLE_B.above), { x: TEMPLE_B.x, y: TEMPLE_B.apex - tb.apex, s: TEMPLE_B.s, statue: false, seed: 's06-tb' });
      // the stoa first, so the gate's right tower overlaps its end
      // in the kit's own stone (standard 18: the marks come from the palette's stone vocabulary)
      stoa = colonnade(p, { x0: STOA.x0, x1: STOA.x1, y: STOA.y, h: STOA.h, gap: STOA.gap, steps: STOA.steps, seed: 's06-stoa', mat: mat(p.mat.stone, { crack: { amp: 0.4, width: 0.05 }, markScale: STOA_MS }) });
      eaves(p, stoa);
      stepShadows(p, stoa, pmat);
      // the gate's inner face in GATE.stone, the one design s07 and s08 share
      // (standard 10), with the city wall running off to the left in the same
      // stone, as tall as the side walls s07 and s08 show
      gateInner(p, { ...GATE_B, mat: mat(gateStoneMat(p), { markScale: GATE_MS }), sides: { left: (GATE_B.x - GATE.towerX[1] * GATE_B.s - WALL_X0) / GATE_B.s, h: WALL_SIDE }, seed: 's06-gate' });
      paintGateDoors(p, GATE_B);
      // the moon at upper right rims his back, mane, head and forelegs against the
      // stoa's black interior: A1's rim, the same drawing and ivory as s05's horse
      paintHorse(p, { ...HB, hatch: 'open', garlands: true, rim: true });
      // the rope left hanging from the hatch, its slack on the deck
      const s = HB.s;
      p.ink((ctx) => {
        const rx = HB.x + (HORSE.hatch.rope.x - HORSE.w / 2) * s, ry = HB.y + (HORSE.hatch.rope.y - HORSE.h) * s, dy = HB.y + (HORSE.deck - HORSE.h) * s;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + 1.5, dy); ctx.lineTo(rx + 20, dy + 1); ctx.stroke();
        ctx.strokeStyle = '#bdb7ae'; ctx.lineWidth = 1.6; ctx.stroke();
      });
      // the near pier, in front of everything (its foot and its top lie off the frame)
      nearPier(p);
    } },
    { actor: 'creep', depth: 1, span: [CUT, 6.71], draw(ctx, e) { if (e.t >= CUT) creepers(ctx, e); } },
  ],
};
