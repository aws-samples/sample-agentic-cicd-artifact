// XII · FINALE — plate 4's night. The temple on the cliff top, its goddess
// standing in the black pronaos between fluted columns; a flight of steps
// comes down from the stylobate to a moonlit terrace that runs out to a
// promontory over the sea. At its very tip, tiny under the colossal stone,
// Aeneas stands with Anchises on his shoulder, seen from behind, looking out to
// the moon and the ships; the horizon crosses at his shoulders and both heads
// stand against the low streak band (reference/crops/4-figure.png). Below the
// promontory's lip its moonlit side face drops out of the frame. Troy burns on
// its dark headland on the left horizon. Nearly still: a slow push, then the
// fade to the title card.
//
// Geometry (one imaginary camera, eye 1.47 m above the terrace, optical
// centre CX): the horizon is HZ; at the hero's depth 100 units = 1.75 m, so
// the terrace under his feet lies 84 units below the horizon. The terrace's
// far lip is the horizontal line LIP; its right edge runs from the tip toward
// the viewer and vanishes at VPX on the horizon, and the side face below it
// shows because we look from out over the water, a little right of the
// promontory. The temple front stands nearer (scale 1.35x the hero's depth):
// its podium is 2 m tall (base TB, stylobate STY above the eye), and the
// statue is ~4 people tall. Everything at the horizon (sky, sea, Troy, ships)
// shares depth 0.3, and the push zooms about the horizon line (its fixed point
// sits on the hero), so the horizon stays at his shoulders through the push.

import { sky, moon, streaks, sea, rockMass, shrubs, birds } from '../kit/nature.js';
import { column, ashlarWall } from '../kit/arch.js';
import { galley } from '../kit/fleet.js';
import { distantFire } from '../kit/fx.js';
import { aeneas } from '../kit/figures.js';
import { statue, moonBank, troyHeadland, troyFire } from '../kit/coast.js';
import { RNG, lerp, clamp, makeNoise } from '../engine/rng.js';
import { L } from '../engine/bake.js';
import { mat } from '../kit/palette.js';
import { poly, densify, roughen, brush, bboxOf } from '../kit/geom.js';
import { beatAt, START } from '../story.js';

const DUR = 3.19;
const HZ = 615;                                   // horizon: at the hero's shoulders
const HERO = { x: 994, y: 699, h: 100 };          // feet on the terrace, a step from the drop
const E = 1.47;                                   // eye height above the terrace (m)
const UPM = 100 / 1.75;                           // units per metre at the hero's depth
const ZH = 24;                                    // the hero's distance (m)
const CX = 900;                                   // optical centre (x)
const sAt = (z) => (UPM * ZH) / z;                // units per metre at distance z
const LIP = 695;                                  // the terrace's far lip, over the sea
const TIP = 1064;                                 // its right corner: the arête over the drop
const VPX = 1700;                                 // vanishing point of the terrace's right edge
const K = (LIP - HZ) / (VPX - TIP);
const edgeY = (x) => LIP + (TIP - x) * K;         // the terrace's right edge, toward the viewer
const ZT = 17.8;                                  // the temple front's distance (m)
const TB = HZ + sAt(ZT) * E;                      // the temple front's base on the terrace (728)
const PODIUM = 2.0;                               // podium height (m)
const STY = HZ + sAt(ZT) * (E - PODIUM);          // the stylobate's front edge (574)
const MOON = { x: 1255, y: 150, r: 15 };
const TROY = { x0: 592, x1: 922, h: 36 };         // s11's headland (same height-to-length), further off
// On a phone (whose horizon view is about x 780-1280) the headland stands
// nearer the hero, so Troy's glow still lingers on the horizon at his left;
// its seaward cliff ends ~25 units left of Anchises
const TROY_P = { x0: 770, x1: 945, h: 28 };

// screen point of a terrace-relative 3D point (X right of the optical axis,
// height above the terrace, distance z), all in metres
const P = (X, hgt, z) => [CX + X * sAt(z), HZ + (E - hgt) * sAt(z)];
const P2 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];

// The stair flight, coming down from the stylobate toward the viewer (plate 4):
// 9 monumental steps, 2.0 m wide, 0.34 m treads; its right flank is a lit side wall.
const FLIGHT = (() => {
  const n = 9, rise = PODIUM / n, run = 0.34, X0 = -5.95, X1 = -3.9;
  const steps = [];
  for (let k = 0; k <= n; k++) steps.push({ k, z: ZT - k * run, h: PODIUM - k * rise });
  return { n, rise, run, X0, X1, steps };
})();

// The terrace: dressed stone in perspective (joints run to the vanishing
// point, cross joints crowd toward the lip), the temple's moon shadow, the
// lit lips; below the right edge the moonlit face of the promontory.
// The left edge of what the scene layer's camera region can show (quantized, so
// the layout is stable per viewport shape: -100 at 16:9 and 16:10, -400 at 21:9).
const leftEdge = (p) => clamp(Math.floor((p.region.x - 60) / 100) * 100, -700, -100);

function platform(p) {
  const nz = makeNoise(1212);
  const XL = leftEdge(p);
  const near = [XL, edgeY(XL)];
  const top = [[XL, LIP], [TIP, LIP], near];
  // the calm floor preset (standard 26: floors and treads stay calm; the marks
  // go on the podium, the pier and the face), with quieter cracks
  const fl = p.mat.floor ?? p.mat.stone;
  const pave = mat(fl, { crack: { ...(fl.crack || {}), amp: 0.2, width: 0.04 } });
  p.pass(pave, (g) => {
    g.save(); g.beginPath(); poly(g, top); g.clip();
    g.fillStyle = L(0.97); g.fillRect(XL, LIP, TIP - XL, near[1] - LIP);
    const rng = new RNG('s12-pave');
    // slab-to-slab tone shifts, in perspective rows
    const zs = [];
    for (let z = (UPM * ZH * E) / (LIP - HZ); z > 4; z -= 1.1) zs.push(z);   // from the lip toward us
    for (let i = 0; i < zs.length - 1; i++) {
      const y0 = HZ + E * sAt(zs[i]), y1 = HZ + E * sAt(zs[i + 1]);
      for (let x = XL; x < TIP; x += rng.range(60, 160) * (y1 - HZ) / 90) {
        const w = rng.range(40, 140) * (y1 - HZ) / 90;
        g.fillStyle = L(rng.range(0.9, 1.0)); g.fillRect(x, y0, w, y1 - y0);
      }
    }
    // cross joints (equal steps in depth) and joints toward the vanishing point
    // of the right edge, as one list (drawn again, lighter, inside the shadow)
    const joints = [];
    for (let i = 0; i < zs.length; i++) {
      const y = HZ + E * sAt(zs[i]);
      joints.push({ w: Math.max(p.px, 1.3 + (y - LIP) * 0.018), a: [XL, y + rng.range(-0.6, 0.6)], b: [TIP, y + rng.range(-0.6, 0.6)] });
    }
    for (let i = -22; i <= 1; i++) {
      const xb = TIP + i * 70 + rng.range(-10, 10);
      joints.push({ w: 1.4, a: [xb, LIP], b: [xb + (xb - VPX) * 3, LIP + (LIP - HZ) * 3] });
    }
    const drawJoints = () => { for (const j of joints) { g.lineWidth = j.w; g.beginPath(); g.moveTo(...j.a); g.lineTo(...j.b); g.stroke(); } };
    g.strokeStyle = L(0.5); drawJoints();
    // the temple's moon shadow: the moon is ahead and to the right, so the
    // podium and the stair flight throw their shadows toward the viewer-left.
    // A navy-black field (standard 19); inside it only the joints show, lighter
    const sh = [[XL, TB - 1], P(FLIGHT.X1, 0, ZT), P(FLIGHT.X1 - 1.75, 0, ZT - 6.1), [XL, P(FLIGHT.X1 - 1.75, 0, ZT - 6.1)[1]]];
    g.fillStyle = L(0.05); g.beginPath(); poly(g, sh); g.fill();
    g.beginPath(); poly(g, sh); g.clip();
    g.strokeStyle = L(0.22); drawJoints();
    g.restore();
    // lit lips: the far edge and the right edge (the arête's top)
    g.fillStyle = L(0.98); g.fillRect(XL, LIP - 1, TIP - XL, 2.4);
    g.strokeStyle = L(0.99); g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(TIP, LIP); g.lineTo(near[0], near[1]); g.stroke();
  }, { bbox: { x: XL - 4, y: LIP - 4, w: TIP - XL + 12, h: near[1] - LIP + 8 } });
  // the side face below the right edge, down out of the frame. Nothing below
  // y 1180 is on screen in landscape (a phone frame reaches lower), so the face
  // stops there unless the camera's region needs more (stable per orientation)
  const BOT = p.region.y + p.region.h > 1180 ? 1720 : 1180;
  const fy = (x) => edgeY(x) + 2;
  const lipLine = roughen(densify([[TIP, LIP + 2], [380, fy(380)], [XL, fy(XL)]], 8), nz, 2.2, 0.05);
  // the arete: broken living rock down the far corner (not a ruled pillar
  // edge), with jutting ledges where scrub clings
  const arPts = [[TIP + 2, LIP + 2], [TIP + 12, 790], [TIP - 6, 900], [TIP + 18, 1010], [TIP + 4, 1160], [TIP + 14, 1320], [TIP - 2, 1500], [TIP + 10, 1720]].filter(([, y], i, a) => y <= BOT || (i > 0 && a[i - 1][1] < BOT));
  // two scales of break-up: big buttress bulges and small chips
  const arete0 = roughen(roughen(densify(arPts, 3), nz, 9, 0.018), nz, 3.5, 0.09);
  // notches: bites out of the corner, dark inside, where scrub clings
  const LEDGES = [{ y: 772, d: 9, t: 16 }, { y: 870, d: 7, t: 12 }, { y: 966, d: 10, t: 18 }];
  const xAt = (yy) => { for (let i = 1; i < arete0.length; i++) if (arete0[i][1] >= yy) { const [ax, ay] = arete0[i - 1], [bx, by] = arete0[i]; return lerp(ax, bx, clamp((yy - ay) / Math.max(1e-6, by - ay))); } return arete0[arete0.length - 1][0]; };
  const arete = [];
  for (let i = 0; i < arete0.length; i++) {
    const [x, y] = arete0[i];
    if (y > BOT) continue;
    let dx = 0;
    for (const l of LEDGES) { const u = (y - l.y) / l.t; if (u > 0 && u < 1) dx = Math.max(dx, l.d * Math.sin(Math.PI * Math.pow(u, 0.6))); }
    arete.push([x - dx, y]);
  }
  for (const l of LEDGES) l.x = xAt(l.y);
  arete.push([arete[arete.length - 1][0], BOT]);
  const face = [...lipLine, [XL, BOT], ...arete.slice().reverse()];
  const strata = [0.22, 0.55, 1.0, 1.6].map((r) => {
    const pts = [];
    for (let x = TIP; x >= 200; x -= 8) pts.push([x, HZ + (edgeY(x) - HZ) * (1 + r) + nz.n2(x * 0.05, r * 9) * 2.5]);
    return { r, line: roughen(pts, nz, 1.8, 0.08) };
  }).filter((st) => st.line.some(([, y]) => y < BOT));
  // (ledges 0: the batched bedding-plane undercuts and the arete's LEDGES
  // notches carry every overhang, and rockMass's wedges printed as isolated
  // black arrowheads on the lit face)
  rockMass(p, { outline: face, seed: 's12-face', lightSide: 1, massW: [0.05, 0.11], shadowFrac: [0.18, 0.34], shadeLo: 0.64, shadeHi: 0.76, sideShade: 0.04,
    detail: 1.0, ledges: 0, relief: 0.6, reliefScale: 34, crevices: 0.9, inkW: 2.8, inkPath: [...lipLine.slice().reverse(), ...arete.slice(1)],
    guideExtra(g) {
      const rng = new RNG('s12-fissures');
      g.fillStyle = L(0.04);
      g.beginPath();
      for (let i = 0; i < 45; i++) { // plate 4's fractured rock: short angular crevices, each broken into two or three dashes
        const x = rng.range(300, TIP - 8), y0 = edgeY(x) + rng.range(6, 60), len = rng.range(40, 150);
        const pts = roughen(densify([[x, y0], [x + rng.range(-10, 10), y0 + len]], 5), nz, 3, 0.09);
        const n = rng.int(2, 3), w = rng.range(0.9, 2.4);
        let k0 = 0;
        for (let j = 0; j < n && k0 < pts.length - 1; j++) {
          const gap = Math.round(rng.range(6, 14) / 5), k1 = Math.min(pts.length, k0 + Math.max(2, Math.round((pts.length - (n - 1) * gap) / n)));
          brush(g, pts.slice(k0, k1), w, 0.4, (t) => 0.5 + 0.5 * Math.sin(t * Math.PI));
          k0 = k1 + gap;
        }
      }
      g.fill();
      // bedding planes: a lit ledge over a black undercut, running (like the
      // terrace edge) to the vanishing point, so they read as level strata
      // (every undercut in one path, every lip in another: two fills)
      const under = new Path2D(), lips = new Path2D();
      for (const { r, line } of strata) {
        for (let k = 0; k < line.length - 1; k += 1) {
          if (nz.n2(k * 0.13, r * 31) < 0.1) continue;        // short ledges, mostly broken
          const [x0, y0] = line[k], [x1, y1] = line[k + 1];
          if (y0 > BOT) continue;
          const t = (1.4 + 1.4 * nz.n2(k * 0.4, r * 5)) * (1 + r * 0.4);
          under.moveTo(x0, y0); under.lineTo(x1, y1); under.lineTo(x1, y1 + t); under.lineTo(x0, y0 + t); under.closePath();
          lips.moveTo(x0, y0 - 1.1); lips.lineTo(x1, y1 - 1.1); lips.lineTo(x1, y1); lips.lineTo(x0, y0); lips.closePath();
        }
      }
      g.fillStyle = L(0.05); g.fill(under);
      g.fillStyle = L(0.97); g.fill(lips);
      // the arete catches the moon: a broken lit edge just inside the corner,
      // a shade strip beside it; the ledges' lit tops and black undercuts
      const inside = (d) => arete.filter(([, y]) => y > LIP + 1).map(([x, y]) => [x - d, y]);
      g.fillStyle = L(0.56); g.beginPath(); brush(g, inside(7), 6, 5); g.fill();
      g.fillStyle = L(0.99); g.beginPath(); brush(g, inside(1.8), 3.4, 2.6); g.fill();
      for (const l of LEDGES) { // inside each notch: the overhang's shadow, a lit sill below
        if (l.x == null || l.y > BOT) continue;
        g.fillStyle = L(0.05); g.beginPath(); poly(g, [[l.x - l.d - 14, l.y + 1], [l.x + 2, l.y], [l.x - l.d * 0.6, l.y + l.t * 0.7], [l.x - l.d - 10, l.y + l.t * 0.55]]); g.fill();
        g.fillStyle = L(0.95); g.beginPath(); poly(g, [[l.x - l.d - 12, l.y + l.t * 0.62], [l.x - l.d * 0.4, l.y + l.t * 0.78], [l.x + 1, l.y + l.t + 1], [l.x - l.d - 10, l.y + l.t * 0.8]]); g.fill();
      }
      // the face sinks a little into the night haze far below (it stays
      // bright stone, production standard 5)
      const hz = g.createLinearGradient(0, LIP + 200, 0, Math.min(1400, BOT + 220));
      hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = hz; g.fillRect(XL, LIP, TIP - XL + 40, BOT - LIP + 4);
      g.globalCompositeOperation = 'source-over';
    } });
  // scrub clinging to the ledges of the face, in clusters (plate 4), lit from the moon
  const rng = new RNG('s12-tufts');
  const spots = [];
  for (const r of [0.22, 0.55, 1.0]) {
    for (let c = 0; c < 3; c++) {
      const x = rng.range(420, TIP - 40), y = HZ + (edgeY(x) - HZ) * (1 + r) + 3;
      for (let j = 0; j < rng.int(2, 3); j++) spots.push([x + rng.range(-14, 14), y + rng.range(-2, 3), rng.range(4, 8) * (1 + r * 0.3)]);
    }
  }
  // and on the arete's jutting ledges
  for (const ly of [772 + 16, 966 + 18]) for (let j = 0; j < 3; j++) spots.push([TIP - 6 + j * 4 + rng.range(-2, 2), ly - 2 + rng.range(-1, 1), rng.range(4, 6.5)]);
  shrubs(p, spots, { seed: 's12-tufts', lightSide: 1 });
}

// The temple corner on the left: the podium with a doorway arch, the black
// pronaos with the goddess on her plinth between two colossal fluted columns,
// and the stair flight coming down toward the viewer with its lit side wall.
const GX = 240;                                    // the goddess's centre line (and the arch under her)
const ANTA = 105;                                 // the anta pier's right face
function temple(p) {
  const XR = P(FLIGHT.X1, 0, ZT)[0];                       // the podium's right end (600)
  const XL = leftEdge(p);
  // nothing above y -180 is on screen in landscape: the pronaos and the
  // columns stop just above what the camera's region shows (a phone reaches higher)
  const TOPY = Math.min(-220, Math.floor((p.region.y - 60) / 100) * 100);
  ashlarWall(p, { x: XL, y: TB, w: XR - XL, h: TB - STY, course: 15, light: 0.8, shade: [0.02, 0.14], seed: 's12-podium' });
  // the black pronaos: flat navy-black (the stone's darkest tone), so it is
  // inked straight onto the layer instead of shaded (the largest area in s12)
  const pron = { x: XL, y: TOPY, w: XR - 112 - XL, h: STY - 10 - TOPY };
  p.ink((ctx) => { ctx.fillStyle = p.mat.stone.ramp[0]; ctx.fillRect(pron.x, pron.y, pron.w, pron.h); }, { bbox: pron });
  // the moonlit anta pier at the frame's left edge: plate 4's temple side is
  // lit stone with black only in narrow gaps, so the black pronaos is the
  // recess between this pier and the column, the goddess standing in it
  ashlarWall(p, { x: XL, y: STY - 10, w: ANTA - XL, h: STY - 10 - TOPY, course: 22, light: 0.84, shade: [0.02, 0.14], seed: 's12-anta' });
  p.pass(p.mat.stone, (g) => {
    g.fillStyle = L(0.95); g.fillRect(XL, STY - 10, XR - XL, 10);                       // stylobate front, lit top
    g.fillStyle = L(0.55); g.fillRect(XL, STY, XR - XL, 6);                             // its moulding in shade
    // a doorway arch through the podium (plate 4)
    const ax = GX, aw = 50, spring = TB - 62;                // under the goddess
    g.fillStyle = L(0.02);
    g.beginPath(); g.moveTo(ax - aw, TB); g.lineTo(ax - aw, spring); g.arc(ax, spring, aw, Math.PI, 0); g.lineTo(ax + aw, TB); g.closePath(); g.fill();
    g.fillStyle = L(0.6);                                                                 // the lit left reveal
    g.beginPath(); g.moveTo(ax - aw, TB); g.lineTo(ax - aw, spring); g.arc(ax, spring, aw, Math.PI, Math.PI * 1.2); g.lineTo(ax - aw + 8, spring + 6); g.lineTo(ax - aw + 8, TB); g.closePath(); g.fill();
    // voussoirs over the arch: a ring of blocks (plate 4). The radial joints
    // are one step of 0.1 under the 0.8 podium, below the crease threshold, so
    // they print as grey joints instead of a sunburst of black rays
    g.strokeStyle = L(0.7); g.lineWidth = 1.2;
    for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; g.beginPath(); g.moveTo(ax + Math.cos(a) * aw, spring + Math.sin(a) * aw); g.lineTo(ax + Math.cos(a) * (aw + 13), spring + Math.sin(a) * (aw + 13)); g.stroke(); }
    g.strokeStyle = L(0.72); g.lineWidth = 1.4;
    g.beginPath(); g.arc(ax, spring, aw + 13, Math.PI, 0); g.stroke();
    // the podium's right flank (faces the moon), receding toward the optical centre
    const a = [XR, STY - 10], b = [XR, TB], q = 0.09;
    const rec = ([x, y]) => [x + (CX - x) * q, y + (HZ - y) * q];
    g.fillStyle = L(0.86); g.beginPath(); poly(g, [a, rec(a), rec(b), b]); g.fill();
    // the flight's moon shadow on the podium face, left of the steps: navy-black
    // and stepped like the flight, so its left edge reads as a staircase (plate
    // 4's steps against the black crevice); the podium's courses lighter inside
    const prof = flightEdge(), shp = [...prof, ...prof.slice().reverse().map(([x, y]) => [x - 46, y + 12])];
    g.save(); g.beginPath(); g.rect(XL, STY, XR - XL, TB - STY); g.clip();
    g.fillStyle = L(0.05); g.beginPath(); poly(g, shp); g.fill();
    g.beginPath(); poly(g, shp); g.clip();
    g.strokeStyle = L(0.22); g.lineWidth = 1;
    for (let yy = TB - 15; yy > STY; yy -= 15) { g.beginPath(); g.moveTo(XL, yy); g.lineTo(XR, yy); g.stroke(); }
    g.restore();
  }, { bbox: { x: XL - 4, y: STY - 14, w: XR - XL + 60, h: TB - STY + 20 } });
  // plate 4's temple side is lit stone with black only in narrow gaps, so the
  // cella wall behind the pronaos is moonlit ashlar and the goddess stands in a
  // black niche cut into it (the whole left third was flat black)
  ashlarWall(p, { x: ANTA, y: STY - 10, w: 470 - ANTA, h: STY - 10 - TOPY, course: 22, light: 0.86, shade: [0.02, 0.14], seed: 's12-cella' });
  // the doorway she stands in: it hugs her, and its head is low enough that a
  // lit lintel course shows above it inside the 16:9 frame
  const nw = 108, ny = 22;
  p.ink((ctx) => { ctx.fillStyle = p.mat.stone.ramp[0]; ctx.fillRect(GX - nw, ny, nw * 2, STY - 10 - ny); }, { bbox: { x: GX - nw, y: ny, w: nw * 2, h: STY - 10 - ny } });
  p.pass(p.mat.stone, (g) => {   // its lit lintel and the jambs' arrises
    g.fillStyle = L(0.95); g.fillRect(GX - nw - 7, ny - 7, nw * 2 + 14, 7);
    g.fillStyle = L(0.6); g.fillRect(GX - nw - 7, ny, 7, STY - 10 - ny);
    g.fillStyle = L(0.88); g.fillRect(GX + nw, ny, 7, STY - 10 - ny);
  }, { bbox: { x: GX - nw - 9, y: ny - 9, w: nw * 2 + 18, h: STY - ny } });
  // the goddess clear of the pier through the push (her raised hand and mantle)
  statue(p, { x: GX, y: STY - 10, s: 0.62, plinth: true, lightSide: 1, variant: 'goddess' });
  const colH = STY - 10 - TOPY + 20;
  const entasis = 0.18 * colH / 1500;                      // the same taper as a 1500-tall shaft
  // ambient 0.45: plate 4's columns keep their far flutes in mid-tones with
  // only a thin dark sliver at the edge (the default 0.22 clamped three flutes
  // to L 0, so the column merged into the black pronaos)
  column(p, { x: -150, y: STY - 10, h: colH, r: 66, flutes: 22, lightSide: 1, capital: false, entasis, ambient: 0.45 });
  column(p, { x: 470, y: STY - 10, h: colH, r: 66, flutes: 22, lightSide: 1, capital: false, entasis, ambient: 0.45 });
  flight(p);
}

// The flight in perspective (plate 4's chunky ivory steps). Per step, top to
// bottom on screen: the riser hanging under the nosing of the step above
// (facing the viewer, away from the moon: tone 4 under the nosing, darkening
// to tone 3 and a darker foot, plate 4's 200 -> 150 -> 105), then the lit
// tread. The guide steps down from the tread to the next riser in jumps under
// the material's crease threshold, so no ink line runs along the nosing; the
// only line is the inside corner (the jump from a riser's dark foot to the
// tread below), as in plate 4. The true treads close up near the eye, so each
// step's screen height is split 55/45 between riser and tread instead (plate
// 4 shows treads all the way up). Staggered joints cut the risers into blocks.
// The flank under the steps is the lit side wall, coursed.
// The flight's left edge on screen, top to bottom: each riser's end, then
// each tread's end (from the inside corner to the nosing).
function flightEdge() {
  const { steps, X0 } = FLIGHT, out = [P(X0, steps[0].h, steps[0].z)];
  for (let k = 1; k < steps.length; k++) {
    const up = steps[k - 1], s = steps[k], a = P(X0, up.h, up.z), c = P(X0, s.h, s.z);
    out.push([lerp(a[0], c[0], 0.22), lerp(a[1], c[1], 0.55)], c);
  }
  return out;
}

function flight(p) {
  const { steps, X0, X1, rise } = FLIGHT;
  const rows = [];
  for (let k = 1; k < steps.length; k++) {
    const up = steps[k - 1], s = steps[k];
    const a0 = P(X0, up.h, up.z), a1 = P(X1, up.h, up.z);          // top of riser k (nosing k-1)
    const c0 = P(X0, s.h, s.z), c1 = P(X1, s.h, s.z);              // nosing k
    const m = 0.55;
    const b0 = [lerp(a0[0], c0[0], m * 0.4), lerp(a0[1], c0[1], m)], b1 = [lerp(a1[0], c1[0], m * 0.4), lerp(a1[1], c1[1], m)];
    rows.push({ k, riser: [a0, a1, b1, b0], tread: [b0, b1, c1, c0] });
  }
  const top = P(X1, PODIUM, ZT), foot = P(X1, 0, steps[steps.length - 1].z), base = P(X1, 0, ZT);
  const flank = [top, ...steps.map((s) => P(X1, s.h, s.z)), foot, base];
  const bb = bboxOf([...rows.flatMap((r) => [...r.riser, ...r.tread]), ...flank, [top[0], top[1] - 12]], 4);
  const rng = new RNG('s12-steps');
  // one pass for the whole flight (two would ink every nosing along the passes'
  // edges), in the floor preset: clean treads, the floor's horizontal worn
  // strokes in the risers' mid-tones (plate 4's steps)
  p.pass(p.mat.floor ?? p.mat.stone, (g) => {
    for (const r of rows) {
      const [a0, a1, b1, b0] = r.riser, [, , c1, c0] = r.tread;
      // the riser: light under the nosing, darkening to its foot (a vertical gradient: no crease inside)
      // (standard 31: the riser stays in N.floor's tone 4-5 with real
      // mid-tones; at 0.43 its foot printed in tone 2 and the flight read 58%
      // dark against plate 4's stairs at 32%)
      const rg = g.createLinearGradient(0, a0[1], 0, b0[1]);
      rg.addColorStop(0, L(0.84)); rg.addColorStop(0.45, L(0.73)); rg.addColorStop(1, L(0.6));
      g.fillStyle = rg; g.beginPath(); poly(g, r.riser); g.fill();
      // the tread, lit; its front 2 units a step lower, so the next riser's top
      // (0.75) follows in two jumps under the crease threshold (0.14)
      g.fillStyle = L(0.95); g.beginPath(); poly(g, r.tread); g.fill();
      const nd = Math.min(2.2, (c0[1] - b0[1]) * 0.3);
      g.fillStyle = L(0.85); g.beginPath(); poly(g, [[c0[0], c0[1] - nd], [c1[0], c1[1] - nd], c1, c0]); g.fill();
      // (the steps' left ends stand against their own moon shadow on the podium: see temple())
      // block joints in the riser only, staggered from step to step
      g.strokeStyle = L(0.3); g.lineWidth = 1.5;
      g.beginPath();
      const n = 1 + rng.int(0, 1), off = (r.k % 2) * 0.5;
      for (let j = 0; j < n; j++) {
        const u = (j + off + rng.range(0.25, 0.75)) / (n + 0.5);
        g.moveTo(lerp(a0[0], a1[0], u), a0[1] + 0.5); g.lineTo(lerp(b0[0], b1[0], u), b0[1]);
      }
      g.stroke();
    }
    // the side wall: the stair's lit right flank, coursed ashlar
    g.save(); g.beginPath(); poly(g, flank); g.clip();
    g.fillStyle = L(0.86); g.fillRect(bb.x, bb.y, bb.w, bb.h);
    g.strokeStyle = L(0.5); g.lineWidth = 1.5;
    for (let hh = 0.3; hh < PODIUM; hh += 0.36) { // courses run with the flight's depth
      const a = P(X1, hh, ZT), b = P(X1, hh, ZT - 4);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.restore();
  }, { bbox: bb });
  return { bbox: bb, rise };
}

// Gulls wheeling high over the bay, right of the moon. Round 6 (the s12
// judge's nice 11): over the sea they were drawn at the size and value of the
// glint flecks they flew through, so at 1x they read as more glints. They now
// fly in the clear navy between the high wisps and the bank, at twice the size,
// where nothing else is white - the same defect and the same cure as s11's
// round-4 footprints.
const GULLS = (() => {
  const rng = new RNG('s12-gulls');
  return Array.from({ length: 3 }, () => ({ x: rng.range(1340, 1540), y: rng.range(345, 405), rx: rng.range(10, 24), ry: rng.range(3, 7), s: rng.range(15, 18), speed: rng.range(0.7, 1.0), phase: rng.range(0, 6.28) }));
})();

// The push zooms 1600 -> 1500 wide about the horizon line, centred on the
// hero: depth 1 and depth 0.3 keep the horizon at his shoulders (see header).
const pushTo = (c0x, c0y, fx, z) => ({ x: (fx * (z - 1) + c0x) / z, y: c0y + (HZ - c0y) * (z - Math.pow(z, 0.3)) / (z - 0.3 * Math.pow(z, 0.3)) });
const END = pushTo(800, 440, HERO.x, 1600 / 1500);
// phone: plate 4's figure crop (the hero at the cliff edge with the horizon at
// his shoulders, the moon and the ships, Troy's temple-crowned citadel burning
// on the left horizon; the temple corner would need a 5%-tall hero or a pan)
const P0 = { x: 1030, y: 600, w: 500, h: 1083 }, PZ = 500 / 476, PEND = pushTo(P0.x, P0.y, HERO.x, PZ);

export default {
  id: 's12', dur: DUR, night: true,
  caption: '',                                        // the title card follows the fade
  captionPos: 'bottom', captionPosPortrait: 'bottom',
  reducedT: 1.6,
  cam: [
    { t: 0, x: 800, y: 440, w: 1600, h: 900 },
    { t: DUR, x: END.x, y: END.y, w: 1500, h: 844, ease: 'inOutSine' },
  ],
  // phone: the hero about a tenth of the frame, the moon and the first galley
  // inside, Troy's citadel at the left, the face (rock, with its broken arete) dropping below
  camPortrait: [
    { t: 0, ...P0 },
    { t: DUR, x: PEND.x, y: PEND.y, w: P0.w / PZ, h: P0.h / PZ, ease: 'inOutSine' },   // fixed point on the hero at the horizon
  ],
  // the fade to the end card begins on bar 27's downbeat (beat 108), the score's last bar line
  fadeOut: { dur: DUR - (beatAt(108) - START.s12), color: 'rgba(2,4,26,0.72)' },
  items: [
    { layer: 'sky', depth: 0.3, paint(p) {
      sky(p, { y0: -800, y1: HZ });
      moon(p, MOON);
      // plate 4's tiers: thin wisps high up, a middle tier right of the spear
      // and above the sails, the low band behind both heads, and the bank with
      // its own low streaks right of the ships (the sails stand on clear sky)
      streaks(p, { x0: 980, x1: 2300, y: HZ - 168, depth: 30, count: 10, seed: 's12-st1', scale: 0.75 });
      streaks(p, { x0: 560, x1: 900, y: HZ - 140, depth: 10, count: 4, seed: 's12-st0', scale: 0.7 });
      streaks(p, { x0: 1075, x1: 2300, y: HZ - 74, depth: 16, count: 26, seed: 's12-st3', scale: 1.7, ends: true });
      // plate 4's bank: low and flat-based, massed lobes climbing to a tower
      // inside the frame, right of the ships
      moonBank(p, { seed: 's12-bank', x0: 1300, x1: 1780, y: HZ - 4, h: 120, tower: 0.3, moon: MOON });
      streaks(p, { x0: 1300, x1: 2300, y: HZ - 20, depth: 12, count: 24, seed: 's12-st2', scale: 1.7, ends: true });   // (its ends right of the ships: no band behind Anchises)
      // the low band behind Aeneas's dark helmet and crest: its bands END at
      // x 997 (L1b's ends: true bounds the band ends, not their centres), so
      // Anchises's white head stands on the navy sky left of it (plate 4: a
      // dark head on the white band)
      streaks(p, { x0: 997, x1: 1240, y: HZ - 20, depth: 7, count: 11, seed: 's12-st4', scale: 1.5, ends: true });
      // plate 4's horizon carries a layered band, not single ruled lines: a
      // second tier just above it, its ends right of Anchises's white head
      streaks(p, { x0: 1030, x1: 2300, y: HZ - 48, depth: 12, count: 20, seed: 's12-st5', scale: 1.6, ends: true });
    } },
    { layer: 'far', depth: 0.3, paint(p) {
      // Troy's headland, its seaward cliff toward the moon (the same landform
      // as s01's, seen from the coast north of it: see notes/status-D2.md)
      const tr = p.portrait ? TROY_P : TROY;
      troyHeadland(p, { x0: tr.x0, x1: tr.x1, y: HZ + 1, h: tr.h, side: 1, seed: 's12-troy', glow: {} });
    } },
    { layer: 'sea', depth: 0.3, frames: 3, fps: 5, paint(p) {
      // `near` stays small: even at the foot of the frame the sea is far below
      // plate 4's sea is flat: the calm sea (L1c's knob: rarer, fainter light
      // strokes), so the open sea carries no white specks
      const calm = mat(p.mat.sea, { calm: 1 });
      // plate 4's water is calm, but not glintless: a broad faint mask over the
      // moonlit open sea below the ships (s11's bay carries a 0.55 mask; this
      // one is weaker by design)
      sea(p, { mat: calm, horizon: HZ, bottom: 1720, x0: leftEdge(p), x1: 2700, lHorizon: 0.48, lMid: 0.36, lBottom: 0.24, near: 0.3,
        glints: [{ x: MOON.x, y: HZ + 10, rx: 60, ry: 8, a: 1 }, { x: MOON.x - 40, y: HZ + 30, rx: 90, ry: 22, a: 0.55 }, { x: 1320, y: HZ + 230, rx: 620, ry: 260, a: 0.15 }] });
    } },
    // after the sea, so the red reflection and the glow on the water show
    { actor: 'troy', depth: 0.3, draw(ctx, e) {
      const portrait = e.W / e.H < 0.82, tr = portrait ? TROY_P : TROY;   // (the far layer's headland: p.portrait)
      const f = troyFire({ x0: tr.x0, x1: tr.x1, y: HZ + 1, h: tr.h, side: 1 });
      distantFire(ctx, e, { x: f.x, y: f.y + 3, w: f.w, h: portrait ? 12 : 15, seed: 's12-troy', intensity: 1.0, reflect: { y: HZ + 3, h: 60 }, wind: 0.5, lod: 'tiny', silhouette: 'rgba(0,0,0,0)', glow: false });
    } },
    { actor: 'ships', depth: 0.3, draw(ctx, e) {
      const bob = (k) => (e.reduced ? 0 : Math.sin(e.wall * 0.7 + k) * 0.4);
      // far out in the moon's glint (plate 4's ships are slivers on the
      // horizon), white sails against the night sky
      galley(ctx, e, { x: 1150, y: HZ + 24 + bob(0), s: 0.5, dir: 1, sail: 'white', crew: true, wake: 0.5 });
      galley(ctx, e, { x: 1228, y: HZ + 16 + bob(1), s: 0.38, dir: 1, sail: 'white', crew: true });
      galley(ctx, e, { x: 1280, y: HZ + 10 + bob(2), s: 0.28, dir: 1, sail: 'white' });
    } },
    { actor: 'gulls', depth: 0.3, draw(ctx, e) { birds(ctx, e.reduced ? { ...e, wall: 1.3 } : e, GULLS); } },
    // the terrace and face first, then the temple and the flight standing on it
    { layer: 'scene', depth: 1, paint(p) { platform(p); temple(p); } },
    { actor: 'aeneas', depth: 1, draw(ctx, e) {
      // his moon shadow falls toward the viewer-left, on the terrace only
      // (it is clipped at the lip: it never runs down the face)
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-700, LIP); ctx.lineTo(TIP, LIP); ctx.lineTo(-700, edgeY(-700)); ctx.closePath(); ctx.clip();
      const [fx, fy] = [HERO.x, HERO.y], ex = fx - 82, ey = fy + 24;
      ctx.fillStyle = 'rgba(3,5,26,0.5)';
      ctx.beginPath(); ctx.moveTo(fx + 9, fy + 1); ctx.lineTo(ex + 2, ey + 1.5); ctx.lineTo(ex - 1, ey - 1); ctx.lineTo(fx - 10, fy - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx, fy + 0.5, 12, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      aeneas(ctx, e, { ...HERO, view: 'back', dir: 1, backlit: true, shadow: false });
    } },
  ],
};
