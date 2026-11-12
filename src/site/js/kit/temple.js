// The temple of Athena and the night city around it (s05–s07, and s09 for
// agent C): a tetrastyle Doric front on a high flight of steps with a wide
// central bay, the colossal statue standing in the black pronaos before the
// cella door, a sculpted pediment; plus plaza paving, houses with windows,
// a colonnade and the inner face of the city gate.
//
// Everything is painted in elevation as `stone` guides. At night the moon is
// upper right (lightSide +1): faces turned right are bright, the left sides
// of rounded forms and everything under a projection fall to navy-black.

import { L } from '../engine/bake.js';
import { RNG, makeNoise, clamp, lerp } from '../engine/rng.js';
import { poly, bboxOf, roughen, densify } from './geom.js';
import { C, mat as deriveMat } from './palette.js';
import { paintAthena } from '../assets/athena.js';

const TAU = Math.PI * 2;
const box = (x, y, w, h, pad = 3) => ({ x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad });
function fill(g, pts, style) { g.fillStyle = style; g.beginPath(); poly(g, pts); g.fill(); }
function shade(g, pts, a) { // multiply the light already painted under pts by (1 - a)
  g.save(); g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); poly(g, pts); g.fill(); g.restore();
}
function shadeRect(g, x, y, w, h, a) { shade(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], a); }
// horizontal gradient that brightens toward the light side
function hgrad(g, x0, x1, a, b, ls) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, L(ls > 0 ? a : b)); gr.addColorStop(1, L(ls > 0 ? b : a));
  return gr;
}

// ------------------------------------------------------------------ column
// Fluted Doric column guide (no pass): x = axis, y = base, h incl. capital,
// r = base radius. The light across the shaft is posterised by design: the
// flutes facing the light are ivory, one flute turns, the rest are navy-black
// (plate 4's crisp shadow side), so the stone's chips never turn the shaft
// into camouflage. Each concave flute darkens softly toward its shaded wall
// and meets the next at a sharp arris, so the crease ink draws one thin line
// per flute (plate 4's engraved fluting). Drum joints are broken, inked once
// on their lower edge; weather streaks run down the shaft.
export function columnGuide(g, o) {
  const { x, y, h, r } = o;
  const ls = o.ls ?? 1;
  const flutes = o.flutes ?? 20;
  const ent = o.entasis ?? 0.16;
  const amb = o.ambient ?? 0.1;
  const capH = r * 0.95;
  const top = y - h + capH;
  const N = Math.round(flutes / 2);
  const cw = o.cw ?? 1, kk = Math.min(1, (o.k ?? 1) * cw) / cw;   // the crease taps sit cw world units apart (L1c's outline.creaseW), at least a pixel
  const lsc = o.light ?? 1;                                       // o.light: scales the shaft's lit tones (standard 31: a shot can drop a colonnade a band); 1 = unchanged
  const xs = (a, k) => x + Math.sin(a) * r * k;
  const tone = (raw) => (raw >= 0.6 ? 0.86 + 0.11 * (raw - 0.6) / 0.4 : raw >= 0.3 ? 0.45 + 0.25 * (raw - 0.3) / 0.3 : 0.04 + raw * 0.1);
  for (let i = 0; i < N; i++) {
    const a0 = -Math.PI / 2 + (i / N) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / N) * Math.PI;
    const am = (a0 + a1) / 2;
    const lam = clamp(tone(clamp(Math.cos(am - ls * 0.95) * 0.9 + amb)) * lsc);
    const fwU = Math.abs(xs(a1, 1) - xs(a0, 1));                  // the flute's width on screen (world units)
    const drop = Math.min(lam < 0.2 ? 0.03 : 0.28, 0.06 * fwU * kk);
    // bright on the wall turned to the light, darker toward the shaded wall, a sharp arris at the next flute
    const xl = ls > 0 ? xs(a0, 1 - ent / 2) : xs(a1, 1 - ent / 2), xd = ls > 0 ? xs(a1, 1 - ent / 2) : xs(a0, 1 - ent / 2);
    const gr = g.createLinearGradient(xl, 0, xd, 0);
    gr.addColorStop(0, L(clamp(lam + 0.02))); gr.addColorStop(0.35, L(lam)); gr.addColorStop(1, L(clamp(lam - drop)));
    g.fillStyle = gr;
    g.beginPath(); poly(g, [[xs(a0, 1), y], [xs(a1, 1), y], [xs(a1, 1 - ent), top], [xs(a0, 1 - ent), top]]); g.fill();
  }
  // drum joints, broken (weathered), and weather streaks, multiplied over the flutes
  const rng = new RNG(o.seed ?? `col${x}`);
  g.save(); g.globalCompositeOperation = 'source-atop';
  const drums = o.drums ?? 7;
  const rw = r * 2.1;
  for (let i = 1; i < drums; i++) {
    const yy = y - ((h - capH) * i) / drums + rng.range(-3, 3);
    const lh = Math.max(1.2 / Math.max(0.5, o.k ?? 1), r * 0.03);
    const rh = Math.max(lh * 2, r * 0.16), ra = Math.min(0.32, 0.065 * rh * kk);
    for (let sx = x - r * 1.05; sx < x + r * 1.05;) {
      const run = rw * rng.range(0.22, 0.6), gap = rng.chance(0.55) ? rw * rng.range(0.04, 0.14) : 0;
      const sw = Math.min(run, x + r * 1.05 - sx);
      const sg = g.createLinearGradient(0, yy - rh, 0, yy);   // the soft shade above the joint (the upper drum's worn edge)
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, `rgba(0,0,0,${ra})`);
      g.fillStyle = sg; g.fillRect(sx, yy - rh, sw, rh);
      g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(sx, yy, sw, lh);
      sx += run + gap;
    }
  }
  for (let i = 0; i < 4; i++) {
    const sx = x + rng.range(-0.8, 0.8) * r, sw = r * rng.range(0.06, 0.16), sh = (h - capH) * rng.range(0.2, 0.6);
    const sg = g.createLinearGradient(0, top, 0, top + sh);
    sg.addColorStop(0, `rgba(0,0,0,${rng.range(0.12, 0.22)})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.fillRect(sx, top, sw, sh);
  }
  g.restore();
  // necking rings, echinus and abacus
  const rt = r * (1 - ent);
  g.fillStyle = L(0.25); g.fillRect(x - rt, top + capH * 0.08, rt * 2, capH * 0.07);
  const eg = g.createLinearGradient(x - r * 1.35, 0, x + r * 1.35, 0);
  eg.addColorStop(0, L(ls > 0 ? 0.35 : 0.95)); eg.addColorStop(0.55, L(0.8)); eg.addColorStop(1, L(ls > 0 ? 0.97 : 0.4));
  g.fillStyle = eg;
  g.beginPath();
  g.moveTo(x - rt, top); g.quadraticCurveTo(x - r * 1.35, top - capH * 0.3, x - r * 1.32, top - capH * 0.6);
  g.lineTo(x + r * 1.32, top - capH * 0.6); g.quadraticCurveTo(x + r * 1.35, top - capH * 0.3, x + rt, top);
  g.closePath(); g.fill();
  g.fillStyle = L(0.18); // shadowed underside of the echinus
  g.beginPath(); g.moveTo(x - rt, top); g.quadraticCurveTo(x - r * 1.25, top - capH * 0.18, x - r * 1.3, top - capH * 0.36);
  g.lineTo(x + r * 1.3, top - capH * 0.36); g.quadraticCurveTo(x + r * 1.25, top - capH * 0.18, x + rt, top); g.closePath();
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill(); g.restore();
  g.fillStyle = hgrad(g, x - r * 1.42, x + r * 1.42, 0.78, 0.95, ls); g.fillRect(x - r * 1.42, y - h, r * 2.84, capH * 0.4);
  g.fillStyle = L(0.3); g.fillRect(x - r * 1.42, y - h + capH * 0.36, r * 2.84, capH * 0.05);
}

// Dressed stone for the night city: M.stone / N.stone's marks as they are
// (standard 18: one stone vocabulary of chips, pits, engraving and ink), with
// finer, rarer cracks than a cliff's. o: { crack (amp, default 0.3), markScale
// (L1c's mark scale, standard 26: < 1 for far or small stone) }. The old
// o.amp / o.vAmp overrides are still honoured if a caller passes them, but
// standard 18 asks shots not to set their own noise.
// o: { crack (amp, default 0.3), markScale, amp, vAmp,
//      faint: true - the lighter-mark form (the s05 judge's finding 3): the engraved
//      strokes and pits on the LIT faces drop to about half, so a dressed flight or a
//      far terrace carries the plates' mark load (lit_marks .05-.10) instead of 2x it.
//      It touches only the lit band: the shade faces, the joints and the ink are the same. }
export function cityStone(p, o = {}) {
  const over = { crack: { amp: o.crack ?? 0.3, width: 0.05 } };
  if (o.markScale != null && o.markScale !== 1) {
    over.markScale = o.markScale;
    // The marks scale with depth (standard 26) but the ENGRAVING does not fall under
    // a pixel: below markScale ~0.6 the hatch spacing would land near 1 world unit, the
    // shader fades the strokes out at DPR 1 and keeps them at DPR 2, and the same plate
    // then has two mark languages by screen (the s05 and s06a judges' DPR findings).
    // markScale multiplies spacing, so the field is raised to hold the product at >= 3.
    const h = p.mat.stone.hatch;
    if (h && o.markScale < 0.6) over.hatch = { ...h, spacing: Math.max(h.spacing ?? 5, 3 / Math.max(0.05, o.markScale)) };
  }
  if (o.amp != null || o.vAmp != null) over.noise = { ...(o.amp != null ? { amp: o.amp } : {}), ...(o.vAmp != null ? { vAmp: o.vAmp } : {}) };
  if (o.faint) {
    const h = p.mat.stone.hatch, sp = p.mat.stone.speck;
    if (h) over.hatch = { ...h, strength: (h.strength ?? 0.6) * 0.55, lit: (h.lit ?? 0.7) * 0.5, litSparse: (h.litSparse ?? 0.2) * 0.6 };
    if (sp) over.speck = { ...sp, lit: (sp.lit ?? 0.35) * 0.5 };
  }
  return deriveMat(p.mat.stone, over);
}

// Calm horizontal stone (paving, terraces): L1c's floor preset of the one
// vocabulary (standard 26: weak facets and few pits on lit faces, worn
// horizontal strokes), with rare fine cracks. o: { crack (amp, default 0.12), markScale }.
export function floorStone(p, o = {}) {
  const base = p.mat.floor ?? p.mat.stone;
  return deriveMat(base, { crack: { amp: o.crack ?? 0.12, width: 0.05 }, ...(o.markScale != null ? { markScale: o.markScale } : {}) });
}

// Deep shadow (pronaos, doorways, passages): no texture, so it stays black
// with just a hint of the forms inside.
export function darkMat(p) {
  return { mode: 'flat', ink: C.ink, ramp: p.night ? ['#020309', '#0a0d22', '#191d3c', '#2c3150'] : ['#08080b', '#1b1a1d', '#2e2c2f', '#45423f'], thr: [0.12, 0.3, 0.5],
    noise: { scale: 30, amp: 0.02 }, outline: { width: 0, sil: 0 } };
}

// ------------------------------------------------------------------ temple
// o: { x (centre), y (ground at the foot of the steps), s, statue: true|false, lightSide, mat, seed, steps,
//      treadShare (lit share of each step, default 0.22), riserLight ([shade, lit], default [0.5, 0.58]),
//      stepJoints (block joints, varied risers and chipped nosings),
//      markScale (the stone's mark scale, standard 26: default clamp(s, 0.3, 1), so a smaller, farther
//      temple carries finer marks; the statue follows it), stepsMat (the flight's material, default mat),
//      bands (the lit values of the horizontal members, [shade side, light side] or a number: { crep, arch,
//      metope, trig, corn }; standard 31: the long horizontal faces sit in the stone's mid-tones (0.70-0.76,
//      N.stone tone 4), only their top arrises and the cornice go to 0.9+; round 4's values were crep and
//      arch [0.85, 0.92], metope [0.8, 0.86], trig 0.86, corn [0.86, 0.96]) }
// Returns { bbox, sty, statue: { x, y, s }, cols, colH, r, apex, entTop, yA, half }.
export function templeOfAthena(p, o) {
  const s = o.s ?? 1;
  const { x, y } = o;
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const ms = o.markScale ?? clamp(s, 0.3, 1);
  const mat = o.mat ?? cityStone(p, { crack: 0.45, markScale: ms });
  const rng = new RNG(o.seed ?? 'athena-temple');
  // proportions (world units at s = 1)
  const nSteps = o.steps ?? 9, rise = 10 * s, tread = 4 * s;
  const crep = 16 * s;                               // top course of the crepidoma
  const sty = y - nSteps * rise - crep;              // stylobate (floor of the porch)
  const colH = 430 * s, r = 36 * s;
  const bay = 272 * s, side = 172 * s;               // wide central bay for the statue
  const cols = [-bay / 2 - side, -bay / 2, bay / 2, bay / 2 + side].map((d) => x + d);
  const half = bay / 2 + side + r * 1.6;             // half width of the stylobate
  const archH = 46 * s, friezeH = 56 * s, cornH = 24 * s, proj = 13 * s;
  const yA = sty - colH;                             // architrave underside
  const yF = yA - archH, yC = yF - friezeH, entTop = yC - cornH;
  const ew = half - 8 * s;                            // half width of architrave and frieze
  const cw = ew + proj;                               // half width of the cornice
  const pedH = cw * 2 * 0.125;
  const apex = entTop - pedH;
  const bbox = box(x - half - nSteps * 6 * s, apex - 30 * s, (half + nSteps * 6 * s) * 2, y - apex + 30 * s, 6);
  const ss = (colH * 0.92) / 920;                     // statue scale: crest just under the capitals
  const BL = { crep: [0.7, 0.76], arch: [0.7, 0.76], metope: [0.62, 0.68], trig: 0.8, corn: [0.8, 0.9], ...(o.bands ?? {}) };
  const two = (v) => (Array.isArray(v) ? v : [v, v]);

  // 1 · the black pronaos: the cella door and the antae barely lift out of the dark
  p.pass(darkMat(p), (g) => {
    const ix0 = cols[0], ix1 = cols[3];
    g.fillStyle = L(0.02); g.fillRect(ix0, yA - 2 * s, ix1 - ix0, sty - yA + 2 * s);
    const dw = bay * 0.62, dh = colH * 0.86;
    g.fillStyle = L(0.2); g.fillRect(x - dw / 2 - 14 * s, sty - dh - 16 * s, dw + 28 * s, dh + 16 * s);
    g.fillStyle = L(0.04); g.fillRect(x - dw / 2, sty - dh, dw, dh);
    for (const k of [-1, 1]) {
      const ax = x + k * (bay / 2 + side * 0.55), aw = side * 0.42;
      g.fillStyle = L(k === ls ? 0.24 : 0.15); g.fillRect(ax - aw / 2, yA + colH * 0.2, aw, colH * 0.8);
    }
  }, { bbox: box(cols[0], yA - 4 * s, cols[3] - cols[0], sty - yA + 4 * s, 4) });

  // 2 · steps and crepidoma. o.treadShare: the lit tread's share of each
  // rise (default 0.22); o.stepJoints: staggered block joints in the risers.
  // o.riserLight: [shade side, light side] of the risers (default [0.5, 0.58]).
  const trd = rise * (o.treadShare ?? 0.22);
  const [r0, r1] = o.riserLight ?? [0.5, 0.58];
  const jr = new RNG(`${o.seed ?? 'athena-temple'}-steps`);
  const crw = mat.outline?.creaseW ?? 1;               // crease taps crw world units apart: soft ramps stay under that slope
  const sMat = o.stepsMat ?? mat;                      // o.stepsMat: the flight's own stone (e.g. finer marks), default the temple's
  p.pass(sMat, function* (g, pp) {
    const kk = Math.min(1, pp.k * crw) / crw;
    for (let i = 0; i < nSteps; i++) {
      if (i) yield;                                                 // one bake unit per step (WebKit: no chunk rasterises a whole flight)
      const yy = y - i * rise;
      const hw = half + (nSteps - i) * 6 * s;
      if (!o.stepJoints) {
        g.fillStyle = hgrad(g, x - hw, x + hw, r0, r1, ls); g.fillRect(x - hw, yy - rise, hw * 2, rise);
        g.fillStyle = L(0.94); g.fillRect(x - hw, yy - rise, hw * 2, trd);
        g.fillStyle = L(0.3); g.fillRect(x - hw, yy - rise + trd, hw * 2, Math.max(p.px * 1.5, s * 1.4));
        continue;
      }
      // o.stepJoints (plate 4's stairs): one ink line per step, at the nosing. The tread darkens softly toward
      // its back, where the riser above stands (no line there); the riser stands in the nosing's shadow at its top
      // and lightens softly toward its foot; staggered blocks, each riser a little lighter or darker, single-inked
      // joints (an arris on the light side, a ramp on the other) and chips bitten out under the nosing.
      const ty0 = yy - rise, ty1 = ty0 + trd, rh = rise - trd;
      const tg = g.createLinearGradient(0, ty0, 0, ty0 + trd * 0.9);
      tg.addColorStop(0, L(0.94 - Math.min(0.22, 0.06 * trd * 0.9 * kk))); tg.addColorStop(1, L(0.96));
      g.fillStyle = tg; g.fillRect(x - hw, ty0, hw * 2, trd);
      g.fillStyle = hgrad(g, x - hw, x + hw, r0, r1, ls); g.fillRect(x - hw, ty1, hw * 2, rh);
      const thin = rise * pp.k < 14;                 // a flight that prints under ~14 device px a step (s05, s09)
      const nr = Math.max(p.px * 2, rh * (thin ? 0.2 : 0.3)), na = 0.5 * (1 - 0.42 / Math.max(0.42, (r0 + r1) / 2)) * (thin ? 0.7 : 1);   // a short, light nosing shadow: even grey risers (plate 4)
      rampShade(g, x - hw, ty1, hw * 2, nr, 0, ty1, 0, ty1 + nr, na, 0);                  // the nosing's shadow on the riser
      const jw = Math.max(p.px * 1.2, 0.8 * s), aW = Math.max(p.px * 1.2, 0.9 * s), wh = Math.min(rh * 0.9, 9 * s);
      // a flight whose steps print thin keeps the nosing's shade and ONE light joint line
      // per block, and drops the block tone jumps and the chips: three dark marks on every
      // riser at 9 px a step was the densest stone in the frame (the s05 judge's finding 3)
      for (let bx = x - hw + jr.range(10, 70) * s; bx < x + hw;) {
        const bw = jr.range(130, 220) * s;                                                   // long blocks: a calm flight
        const dl = jr.range(-0.05, 0.05);
        if (!thin && Math.abs(dl) > 0.025) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = dl < 0 ? `rgba(0,0,0,${-dl * 1.6})` : `rgba(255,0,0,${dl})`; if (dl > 0) g.globalCompositeOperation = 'lighter'; g.fillRect(bx, ty1, Math.min(bw, x + hw - bx), rh); g.restore(); }
        // the joint: inked once, on the edge of the block turned to the light
        g.fillStyle = L(Math.min(1, (r0 + r1) / 2 + 0.14)); g.fillRect(ls > 0 ? bx - aW : bx + jw, ty1 + nr * 0.3, aW, rh - nr * 0.3);
        g.fillStyle = L(thin ? 0.58 : 0.42); g.fillRect(bx, ty1, jw, rh);     // a light-grey joint on a thin flight (plate 4's stairs), the old tone on a near one
        if (ls > 0) rampShade(g, bx + jw, ty1, wh, rh, bx + jw, 0, bx + jw + wh, 0, Math.min(0.26, 0.06 * wh * kk) / 0.66, 0);
        else rampShade(g, bx - wh, ty1, wh, rh, bx - wh, 0, bx, 0, 0, Math.min(0.26, 0.06 * wh * kk) / 0.66);
        if (!thin && jr.chance(0.08)) {                                                       // a chip bitten out under the nosing (rare)
          const cx = bx + jr.range(0.15, 0.85) * bw, cw = jr.range(4, 10) * s;
          g.fillStyle = L(0.3); g.beginPath(); g.moveTo(cx - cw, ty1); g.lineTo(cx + cw, ty1);
          g.lineTo(cx + cw * jr.range(0.3, 0.7), ty1 + rh * jr.range(0.4, 0.6)); g.lineTo(cx - cw * jr.range(0.3, 0.7), ty1 + rh * jr.range(0.25, 0.45)); g.closePath(); g.fill();
        }
        bx += bw;
      }
    }
    g.fillStyle = hgrad(g, x - half, x + half, ...two(BL.crep), ls); g.fillRect(x - half, sty, half * 2, crep);   // a mid-tone course under its lit arris (standard 31)
    g.fillStyle = L(0.95); g.fillRect(x - half, sty, half * 2, crep * 0.18);
    // block joints in the crepidoma
    for (let bx = x - half + 40 * s; bx < x + half; bx += rng.range(60, 110) * s) { g.fillStyle = L(0.4); g.fillRect(bx, sty + crep * 0.2, Math.max(p.px * 1.5, 1.4 * s), crep * 0.8); }
  }, { bbox: box(x - half - nSteps * 6 * s, sty - 2 * s, (half + nSteps * 6 * s) * 2, y - sty + 4 * s, 4) });

  // 3 · the statue in the porch, before the door
  if (o.statue !== false) paintAthena(p, { x: x - 6 * s, y: sty, s: ss, lightSide: ls, markScale: ms });

  // 4 · the four columns
  p.pass(mat, function* (g, pp) {
    for (const [i, cx] of cols.entries()) { if (i) yield; columnGuide(g, { x: cx, y: sty, h: colH, r, ls, seed: `ta${i}`, k: pp.k, cw: crw }); }
  }, { bbox: box(cols[0] - r * 1.5, yA, cols[3] - cols[0] + r * 3, colH, 4) });

  // 5 · entablature and pediment
  p.pass(mat, (g) => {
    // architrave with its taenia; regulae and guttae under each triglyph
    g.fillStyle = hgrad(g, x - ew, x + ew, ...two(BL.arch), ls); g.fillRect(x - ew, yF, ew * 2, archH);
    g.fillStyle = L(0.94); g.fillRect(x - ew, yF, ew * 2, archH * 0.12);
    g.fillStyle = L(0.3); g.fillRect(x - ew, yF + archH * 0.12, ew * 2, archH * 0.05);
    g.fillStyle = L(0.22); g.fillRect(x - ew, yA - archH * 0.08, ew * 2, archH * 0.08);   // shadow line at the capitals
    // frieze: metopes and triglyphs (over each column and each bay; two over the wide bay)
    g.fillStyle = hgrad(g, x - ew, x + ew, ...two(BL.metope), ls); g.fillRect(x - ew, yC, ew * 2, friezeH);   // metopes a tone under the triglyphs, crisp shadowed recesses
    const tw = friezeH * 0.62;
    const tx = [];
    const ax = [x - ew + tw / 2, ...cols, x + ew - tw / 2];
    for (let i = 0; i < ax.length - 1; i++) {
      const a = ax[i], b = ax[i + 1];
      const n = Math.max(1, Math.round((b - a) / (tw * 2.6)));
      for (let k = 0; k < n; k++) tx.push(a + ((b - a) * k) / n);
    }
    tx.push(ax[ax.length - 1]);
    const metopes = [];
    for (let i = 0; i < tx.length; i++) {
      const t0 = tx[i] - tw / 2;
      g.fillStyle = L(two(BL.trig)[1]); g.fillRect(t0, yC, tw, friezeH);
      g.fillStyle = L(0.2);
      for (const f of [0.18, 0.5, 0.82]) g.fillRect(t0 + tw * f - tw * 0.07, yC + friezeH * 0.1, tw * 0.14, friezeH * 0.9);
      g.fillStyle = L(ls > 0 ? 0.42 : 0.97); g.fillRect(t0, yC, tw * 0.06, friezeH);          // projecting sides
      g.fillStyle = L(ls > 0 ? 0.97 : 0.42); g.fillRect(t0 + tw * 0.94, yC, tw * 0.06, friezeH);
      g.fillStyle = L(0.9); g.fillRect(t0, yF + archH * 0.12, tw, archH * 0.07);                // regula
      for (let k = 0; k < 6; k++) { g.fillStyle = L(0.25); g.fillRect(t0 + tw * (0.1 + k * 0.15), yF + archH * 0.19, tw * 0.07, archH * 0.06); }
      if (i < tx.length - 1) metopes.push([tx[i] + tw / 2, tx[i + 1] - tw / 2]);
    }
    // metopes: recessed panels, shadowed along the top and the side away from the moon
    for (const [m0, m1] of metopes) {
      const mw = m1 - m0;
      shadeRect(g, m0, yC, mw, friezeH * 0.16, 0.4);
      shadeRect(g, ls > 0 ? m1 - mw * 0.1 : m0, yC, mw * 0.1, friezeH, 0.3);
    }
    // cornice: lit face, soffit with mutules in shadow, its shadow on the frieze
    shadeRect(g, x - ew, yC, ew * 2, friezeH * 0.24, 0.5);
    g.fillStyle = hgrad(g, x - cw, x + cw, ...two(BL.corn), ls); g.fillRect(x - cw, entTop, cw * 2, cornH);
    g.fillStyle = L(0.12); g.fillRect(x - cw, yC - cornH * 0.34, cw * 2, cornH * 0.34);
    for (const t of tx) { g.fillStyle = L(0.36); g.fillRect(t - tw * 0.5, yC - cornH * 0.3, tw, cornH * 0.18); }
    g.fillStyle = L(0.98); g.fillRect(x - cw, entTop, cw * 2, cornH * 0.16);
    // pediment: raking cornice, recessed tympanum with figures
    const pb = entTop;
    g.fillStyle = L(0.92);
    g.beginPath(); g.moveTo(x - cw, pb); g.lineTo(x, apex); g.lineTo(x + cw, pb); g.closePath(); g.fill();
    const ins = cornH * 1.15, slope = pedH / cw;
    const ty0 = pb - 1 * s, tH = pedH - ins / Math.cos(Math.atan(slope)) - 1 * s;
    const tx0 = tH / slope;
    const tymp = [[x - tx0, ty0], [x, ty0 - tH], [x + tx0, ty0]];
    g.fillStyle = L(0.5); g.beginPath(); poly(g, tymp); g.fill();
    // the raking cornice throws a shadow onto the top of the tympanum
    g.save(); g.beginPath(); poly(g, tymp); g.clip();
    g.fillStyle = L(0.16);
    g.beginPath(); g.moveTo(x - tx0, ty0); g.lineTo(x, ty0 - tH); g.lineTo(x + tx0, ty0); g.lineTo(x + tx0, ty0 - 2);
    g.lineTo(x, ty0 - tH + 14 * s); g.lineTo(x - tx0 + 30 * s, ty0 + 2); g.closePath(); g.fill();
    // pediment sculpture: Athena standing at the centre, figures kneeling and
    // reclining toward the corners — chunky lit masses with shadowed flanks
    const figs = [[0, 0.84, 0.2], [-0.2, 0.62, 0.24], [0.2, 0.62, 0.24], [-0.43, 0.42, 0.34], [0.43, 0.42, 0.34], [-0.68, 0.22, 0.6], [0.68, 0.22, 0.6]];
    for (const [u, hh, ww] of figs) {
      const fx = x + u * tx0, fb = ty0 - 1 * s, fh = tH * hh, fw = Math.max(tH * ww, 10 * s);
      const lean = -Math.sign(u) * Math.min(0.5, Math.abs(u) * 0.6);
      g.save(); g.translate(fx, fb);
      g.fillStyle = L(0.86);
      g.beginPath();
      g.moveTo(-fw / 2, 0); g.quadraticCurveTo(-fw * 0.55 + lean * fh * 0.3, -fh * 0.6, -fw * 0.18 + lean * fh * 0.4, -fh * 0.82);
      g.arc(lean * fh * 0.4, -fh * 0.86, Math.min(fw * 0.2, fh * 0.14), Math.PI, 0);
      g.quadraticCurveTo(fw * 0.55 + lean * fh * 0.3, -fh * 0.6, fw / 2, 0); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(ls > 0 ? -fw : fw * 0.12, -fh * 1.2, fw * 0.88, fh * 1.2);
      g.restore();
    }
    g.restore();
    // shadow under the raking cornice's soffit line
    g.strokeStyle = L(0.2); g.lineWidth = Math.max(p.px * 1.5, 2.2 * s);
    g.beginPath(); g.moveTo(x - tx0, ty0); g.lineTo(x, ty0 - tH); g.lineTo(x + tx0, ty0); g.stroke();
    // acroteria: palmettes at the apex and corners
    for (const [ax0, ay0, k] of [[x, apex, 1.25], [x - cw + 10 * s, pb, 0.85], [x + cw - 10 * s, pb, 0.85]]) {
      const ar = 22 * s * k;
      for (let i = -3; i <= 3; i++) {
        const a = -Math.PI / 2 + i * 0.32;
        g.fillStyle = L(i * ls > 0 ? 0.95 : 0.6);
        g.beginPath(); g.ellipse(ax0 + Math.cos(a) * ar * 0.55, ay0 - 4 * s + Math.sin(a) * ar * 0.55, ar * 0.16, ar * 0.5, a + Math.PI / 2, 0, TAU); g.fill();
      }
      g.fillStyle = L(0.85); g.beginPath(); g.arc(ax0, ay0 - 3 * s, ar * 0.2, 0, TAU); g.fill();
    }
  }, { bbox: box(x - cw - 30 * s, apex - 34 * s, (cw + 30 * s) * 2, yA - apex + 34 * s, 4) });

  return { bbox, sty, statue: { x: x - 6 * s, y: sty, s: ss }, cols, colH, r, apex, entTop, yA, half };
}

// ------------------------------------------------------------------ plaza
// Paving in perspective between yFar and yNear: rows of slabs whose joints
// converge on (vx, hz). Slab sizes are ground units at the nearest row.
// o: { x0, x1, yFar, yNear, hz, vx, slab, rowStep, light, joint, bright (share
//      of paler slabs, default 0.08), nearShade, farShade, near: { from, light } (a
//      crisp lower light for the nearest rows), seed, mat, guideExtra(g), lightSide,
//      flags (opt-in, off by default: irregular cracked flagstones, see below),
//      passRows (opt-in: one bboxed pass per this many rows, each row with its own
//      random numbers, so no bake unit waits on the whole plaza's raster in WebKit) }
// o.flags = true or { split 0.3, jitter 0.06, merge 0.15, joints [0.22, 0.42], chip 0.2,
//      crack 0.1, long [0.8, 1.7], rough 1, face (opt-in: [[light, weight], ...], each flag's own face light,
//      offset by the row's light; the spread fades toward the horizon) }: slab lengths vary (long), about `split` of the
//      slabs are cut across the row (straight or slanting) into two flags, every
//      corner is jittered by `jitter` of a slab so the transverse joints break,
//      `merge` of them run on as one long flag, each flag has its own joint tone,
//      chipped corners and the odd crack; each joint is inked once: a moonlit arris
//      on the flag's far edge (the moon is beyond) and on its light side, a soft
//      ramp on the others. The rows vary in depth too.
// With flags the default material is floorStone(p) (L1c's calm floor preset,
// standard 26: floors stay calm, the marks go on risers, walls and statues).
// The guide draw is a generator (one row per unit) so a big plaza never stalls
// a frame. Returns { sx, sy, rows, K }.
export function paving(p, o) {
  const { x0, x1, yFar, yNear, hz } = o;
  const vx = o.vx ?? (x0 + x1) / 2;
  const per = Math.max(0, Math.round(o.passRows ?? 0));
  let rng = new RNG(o.seed ?? 'paving');
  const F = o.flags ? { split: 0.3, jitter: 0.06, merge: 0.15, joints: [0.22, 0.42], chip: 0.2, crack: 0.1, long: [0.8, 1.7], ...(o.flags === true ? {} : o.flags), core: !!(o.flags !== true && o.flags?.joints) } : null;
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const K = yNear - hz;
  const zFar = K / Math.max(1, yFar - hz);
  const rows = [];
  const rr = new RNG(`${o.seed ?? 'paving'}-rows`);
  for (let z = 1; z < zFar * 1.05; z *= 1 + (o.rowStep ?? 0.16) * (F ? rr.range(0.75, 1.3) : 1)) rows.push(z);
  rows.push(zFar * 1.05);
  const sx = (X, z) => vx + (X - vx) / z, sy = (z) => hz + K / z;
  const bb = box(x0, yFar, x1 - x0, yNear - yFar + 10, 4);
  const lit = o.light ?? 0.78;
  const pcw = (o.mat ?? (F ? p.mat.floor ?? p.mat.stone : p.mat.stone)).outline?.creaseW ?? 1;   // crease tap distance (soft ramps stay under it)
  const quad = (g, q) => { g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) g.lineTo(q[i][0], q[i][1]); g.closePath(); };
  // one flag: R = its outline (screen), q = its corners [near-left, near-right, far-right, far-left],
  // E = its edges { near, far, left, right } (screen polylines), its face light l (jl, the old joint tone,
  // is unused). Flags meet edge to edge and each joint is ONE step of light, so the crease ink draws a
  // single line on it at any DPR (a thin dark joint between two lit faces prints as two lines once the
  // crease taps are wider than the joint): inside the flag, its far edge and its edge on the light's side
  // catch the moon (a sharp arris stroked along the edge), its near edge and the edge away from the light
  // fall a little into shade (nested strokes, each step under the crease threshold), so every joint pairs
  // an arris with a shade and follows the meandering edge exactly.
  const line = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); };
  const flag = (g, R, q, l, jl, gap, E) => {
    const hgt = (q[0][1] + q[1][1] - q[2][1] - q[3][1]) / 2, wid = (q[1][0] + q[2][0] - q[0][0] - q[3][0]) / 2;
    g.fillStyle = L(l); quad(g, R); g.fill();
    if (hgt < p.px * 6 || wid < p.px * 6) return;
    // far, thin rows: the joints fade (no ink at all on the farthest), so the field calms toward the horizon
    const fade = clamp((hgt / Math.max(p.px, 1e-6) - 6) / 18);
    const kk = Math.min(1, p.k * pcw) / pcw;
    g.save(); quad(g, R); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'round';
    // flags.joints given explicitly: a dark joint core (the round-3 look; a shot's cast-shadow transform can
    // turn it into the lighter joints of standard 19) along the near edge and the edge away from the light
    if (F.core) { g.strokeStyle = L(lerp(Math.max(jl, l - 0.12), jl, fade)); g.lineWidth = gap * 2; line(g, E.near); g.stroke(); line(g, ls > 0 ? E.left : E.right); g.stroke(); }
    // arrises (half of each stroke lies inside the flag)
    const aH = Math.max(p.px * 1.2, Math.min(hgt * 0.07, 3)), aW = Math.max(p.px * 1.2, Math.min(wid * 0.03, hgt * 0.1, 3));
    // with flags.face a flag a tone under the top catches the moon on its arris (up to 0.84: tone 5 at night, a guide
    // step of at most 0.12, under the crease threshold, so the joint still prints one ink line)
    g.strokeStyle = L(Math.min(1, l + (F.face ? Math.max(0.05, Math.min(0.12, 0.84 - l)) : 0.05) * fade));
    g.lineWidth = aH * 2; line(g, E.far); g.stroke();
    g.lineWidth = aW * 2; line(g, ls > 0 ? E.right : E.left); g.stroke();
    // shades: four nested strokes, each darkening a little more toward the edge (each step < the crease threshold)
    const shadeOf = (pts, wd, depth) => {
      const dpt = Math.min(depth, 0.06 * wd * kk) / Math.max(0.1, l);
      if (dpt <= 0.004) return;
      g.strokeStyle = `rgba(0,0,0,${(dpt / 4).toFixed(4)})`;
      for (let k = 4; k >= 1; k--) { g.lineWidth = (2 * wd * k) / 4; line(g, pts); g.stroke(); }
    };
    g.globalCompositeOperation = 'source-atop';
    // joint step ~0.18: a light-grey ink line (plate 4's joints); with joint cores the core carries the joint,
    // so the shade stays shallow and the faces stay above ~0.8 (s06's shadow remap relies on it)
    const stp = F.step ?? (F.core ? 0.07 : 0.13);
    shadeOf(E.near, hgt * 0.24, stp * fade);
    shadeOf(ls > 0 ? E.left : E.right, Math.min(wid * 0.2, hgt * 0.5), stp * 0.9 * fade);
    g.globalCompositeOperation = 'source-over';
    if (rng.chance(F.chip)) {                     // a chipped corner
      const c = rng.int(0, 3), a = q[c], b = q[(c + 1) % 4], e2 = q[(c + 3) % 4], u = rng.range(0.06, 0.14), v = rng.range(0.1, 0.22);
      g.fillStyle = L(0.14); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u); g.lineTo(a[0] + (e2[0] - a[0]) * v, a[1] + (e2[1] - a[1]) * v); g.closePath(); g.fill();
    }
    if (rng.chance(F.crack)) {                    // a hairline crack from the near edge into the flag (plate 4: thin, wavering, broken)
      const t0 = rng.range(0.2, 0.8), t1 = rng.range(0.2, 0.8), reach = rng.range(0.45, 0.9);
      const A = [q[0][0] + (q[1][0] - q[0][0]) * t0, q[0][1] + (q[1][1] - q[0][1]) * t0], B = [q[3][0] + (q[2][0] - q[3][0]) * t1, q[3][1] + (q[2][1] - q[3][1]) * t1];
      const lim = Math.min(Math.abs(B[1] - A[1]) * 1.6, hgt * 1.6);                 // never a long stick across a flag seen edge-on
      const dx = B[0] - A[0], dy = B[1] - A[1], dl = Math.hypot(dx, dy) || 1, sc = Math.min(reach, lim / dl);
      g.strokeStyle = L(0.4); g.lineWidth = Math.max(p.px * 0.9, gap * 0.22); g.lineJoin = 'round';
      g.beginPath(); g.moveTo(A[0], A[1]);
      for (let k = 1; k <= 6; k++) {
        const u2 = (k / 6) * sc, wob = rng.range(-1, 1) * Math.min(wid * 0.04, hgt * 0.25);
        const P2 = [A[0] + dx * u2 + wob, A[1] + dy * u2];
        if (k === 3 && rng.chance(0.5)) g.moveTo(P2[0], P2[1]); else g.lineTo(P2[0], P2[1]);   // broken once
      }
      g.stroke();
    }
    g.restore();
  };
  // one row of flags (or slabs) between rows[r] (near) and rows[r + 1] (far)
  const slab = o.slab ?? 150;
  const drawRow = (g, r) => {
    if (per) rng = new RNG(`${o.seed ?? 'paving'}-r${r}`);
    const za = rows[r], zb = rows[r + 1];
    const ya = sy(za), yb = sy(zb);
    const gap = Math.max(p.px * 1.6, 2.2 / za);            // at least 1.6 device px (the s07 finding: a flag joint keeps its weight at DPR 2)
    // o.near: { from (0..1 of yFar..yNear), to (default 1), light }: the rows in that
    // depth band take one flat lower light, slab by slab, so the step is crisp (no
    // blotchy band). A band (from..to) can sit behind a caption line without darkening
    // the rows in front of it (s05 on a phone, standard 30).
    const nf = o.near ? (ya - yFar) / (yNear - yFar) : 0;
    const rowLit = o.near && nf > o.near.from && nf <= (o.near.to ?? 1) ? o.near.light : lit;
    // ground-x range that covers the screen at this depth
    const Xa = vx + (x0 - vx) * zb - slab, Xb = vx + (x1 - vx) * zb + slab;
    let X = Xa - rng.range(0, slab);
    while (X < Xb) {
      if (!F) {
        const w = slab * rng.range(0.7, 1.35);
        const l = clamp(rowLit + rng.range(-0.035, 0.035) + (rng.chance(o.bright ?? 0.08) ? 0.09 : 0));
        g.fillStyle = L(l);
        g.beginPath();
        g.moveTo(sx(X, za) + gap / 2, ya - gap / 2); g.lineTo(sx(X + w, za) - gap / 2, ya - gap / 2);
        g.lineTo(sx(X + w, zb) - gap / 2, yb + gap / 2); g.lineTo(sx(X, zb) + gap / 2, yb + gap / 2); g.closePath(); g.fill();
        X += w;
        continue;
      }
      flagRow(g, r, rowLit, gap, Xa, Xb, X);
      break;
    }
  };
  // Flags (o.flags) meet in shared joints: each transverse joint is one meandering line in ground space (row
  // boundary b at depth rows[b] with a smooth fbm meander and a little roughness, the same for the rows on both
  // sides), and each long joint (the cut between two flags of a row) is shared by those two flags. So the flags
  // meet in one thin joint everywhere (no wedges of joint tone between them), and split passes match.
  const jn = makeNoise(`${o.seed ?? 'paving'}-joints`);
  const zAt = (b, X) => {
    if (b <= 0 || b >= rows.length - 1) return rows[clamp(b, 0, rows.length - 1)];
    const q = rows[b + 1] / rows[b] - 1;
    const m = jn.fbm(X / (slab * 1.7), b * 7.31, 3) * 1.6 + jn.n2(X / (slab * 0.15), b * 7.31 + 50) * 0.22 * (F.rough ?? 1);
    return rows[b] * (1 + clamp(m, -1.2, 1.2) * q * (F.meander ?? 0.12));
  };
  const edge = (b, Xa, Xb) => {                                   // ground points along boundary b from Xa to Xb
    const n = Math.max(2, Math.ceil(Math.abs(Xb - Xa) / (slab * 0.2)));
    const out = [];
    for (let k = 0; k <= n; k++) { const X = Xa + ((Xb - Xa) * k) / n; out.push([X, zAt(b, X)]); }
    return out;
  };
  const scr = ([X, z]) => [sx(X, z), sy(z)];
  // flags.face = [[light, weight], ...]: each flag picks its face light (worn flags a tone greyer, a few paler
  // ones; standard 31: night floors keep real mid-tones), offset by the row's own light (o.near), and the spread
  // fades toward the horizon (rows under ~8-32 device px tall), so the far field calms to `light`
  const faceW = F?.face ? F.face.reduce((a, [, w]) => a + w, 0) : 0;
  const faceOf = (fq) => { let u = fq.next() * faceW; for (const [v, w] of F.face) { if ((u -= w) <= 0) return v + fq.range(-0.02, 0.02); } return F.face[F.face.length - 1][0]; };
  let faceRng = null, rowFade = 1;
  const flagRow = (g, r, rowLit, gap, Xa, Xb, X) => {
    faceRng = F.face ? new RNG(`${o.seed ?? 'paving'}-face-r${r}`) : null;
    rowFade = clamp(((sy(rows[r]) - sy(rows[r + 1])) / Math.max(p.px, 1e-6) - 8) / 24);
    const J = () => rng.range(-1, 1) * F.jitter * slab;
    const cuts = [{ n: X + J(), f: X + J() }];
    while (X < Xb) {
      let w = slab * rng.range(F.long[0], F.long[1]);
      if (rng.chance(F.merge)) w *= rng.range(1.5, 2);          // one long flag over two
      X += w; cuts.push({ n: X + J(), f: X + J() });
    }
    // a point on a long joint (straight in the ground plane: X linear in depth) at a fraction u of its log depth
    const on = (c, u) => { const zN = zAt(r, c.n), zF = zAt(r + 1, c.f), z = zN * Math.pow(zF / zN, u); return [c.n + ((c.f - c.n) * (z - zN)) / (zF - zN || 1), z]; };
    for (let i = 0; i < cuts.length - 1; i++) {
      const A = cuts[i], B = cuts[i + 1];
      const near = edge(r, A.n, B.n), far = edge(r + 1, B.f, A.f);
      const nl = near[0], nr = near[near.length - 1], fr = far[0], fl = far[far.length - 1];
      const parts = [];
      if (rng.chance(F.split)) {                                  // cut across the row, straight or slanting
        const u0 = rng.range(0.3, 0.7), u1 = rng.chance(0.15) ? clamp(u0 + rng.range(-0.2, 0.2), 0.2, 0.8) : clamp(u0 + rng.range(-0.06, 0.06), 0.2, 0.8);
        const pL = on(A, u0), pR = on(B, u1);
        const mid = [(pL[0] + pR[0]) / 2 + J() * 0.3, Math.sqrt(pL[1] * pR[1]) * (1 + rng.range(-0.015, 0.015))];
        parts.push([[...near, pR, mid, pL], [nl, nr, pR, pL], { near, far: [pR, mid, pL], left: [pL, nl], right: [nr, pR] }],
          [[pL, mid, pR, ...far], [pL, pR, fr, fl], { near: [pL, mid, pR], far, left: [fl, pL], right: [pR, fr] }]);
      } else parts.push([[...near, ...far], [nl, nr, fr, fl], { near, far, left: [fl, nl], right: [nr, fr] }]);
      for (const [P, Q, E] of parts) {
        let l = clamp(rowLit + rng.range(-0.035, 0.035) + (rng.chance(o.bright ?? 0.08) ? 0.06 : 0));
        if (faceRng) l = clamp(lerp(l, faceOf(faceRng) + rowLit - lit, rowFade));   // flags.face: this flag's own tone (its own numbers: the layout is unchanged)
        flag(g, P.map(scr), Q.map(scr), l, rng.range(F.joints[0], F.joints[1]), gap, { near: E.near.map(scr), far: E.far.map(scr), left: E.left.map(scr), right: E.right.map(scr) });
      }
    }
  };
  // the far edge sinks into the shade of the buildings, the foreground darkens (world-space, so split passes
  // match); then o.guideExtra(g, p), in a bake unit of its own (it may be a generator: its yields split it further)
  const finish = function* (g) {
    g.globalCompositeOperation = 'source-atop';
    const vg = g.createLinearGradient(0, yFar, 0, yNear);
    const f0 = o.farShade ?? 0.3, n0 = o.nearShade ?? 0.35;
    vg.addColorStop(0, `rgba(0,0,0,${f0})`); vg.addColorStop(0.08, 'rgba(0,0,0,0)');
    vg.addColorStop(0.45, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${n0})`);
    g.fillStyle = vg; g.fillRect(x0, yFar, x1 - x0, yNear - yFar + 10);
    g.globalCompositeOperation = 'source-over';
    const gx = o.guideExtra?.(g, p);
    if (gx && typeof gx.next === 'function') yield* gx;
  };
  const mat = o.mat ?? (F ? floorStone(p) : cityStone(p));
  const nR = rows.length - 1;
  const bands = per ? [] : [[0, nR]];
  for (let r0 = 0; per && r0 < nR; r0 += per) bands.push([r0, Math.min(nR, r0 + per)]);
  for (const [r0, r1] of bands) {
    // a band of rows r0..r1-1 covers screen y sy(rows[r1]) (far) .. sy(rows[r0]) (near); its pass also
    // draws the neighbouring rows, so the shader sees the same guide across the seam (no seam ink)
    const yA = per ? Math.max(yFar, sy(rows[r1]) - 4) : yFar, yB = per ? Math.min(yNear + 10, sy(rows[r0]) + 4) : yNear + 10;
    p.pass(mat, function* (g) {
      g.save(); g.beginPath(); g.rect(x0, yFar, x1 - x0, yNear - yFar + 10); g.clip();
      g.fillStyle = L(o.joint ?? 0.4); g.fillRect(x0, yFar, x1 - x0, yNear - yFar + 10);        // joints
      for (let r = per ? Math.max(0, r0 - 1) : r0; r < (per ? Math.min(nR, r1 + 1) : r1); r++) { drawRow(g, r); yield; }
      yield* finish(g);
      g.restore();
    }, { bbox: per ? box(x0, yA, x1 - x0, yB - yA, 4) : bb });
  }
  return { sx, sy, rows, K };
}

// ------------------------------------------------------------------ houses
// A row of flat-roofed and gabled town houses in elevation, moonlit from the
// upper right. layoutHouses(o) is pure (no painting), so an actor can light
// the same windows that houses(p, o) paints dark.
// o: { x0, x1, y (ground), h: [min, max], w: [min, max], seed, win, roofs: 'mixed'|'flat', floors, winGap, winSkip,
//      lightSide, mat, faceLight (houses() only: light scale of the street fronts: a number (default 1),
//      a range [lo, hi] picked per house, or a function (house, index) => scale),
//      markScale (houses() only: the stone's mark scale, standard 26; default: a far town of small
//      windows (win <= 10) gets clamp(win / 24, 0.3, 1), anything else 1) }
// Each window carries its front's bounds (fx0, fx1, fy0, fy1), so litWindows keeps its halo on that front.
export function layoutHouses(o) {
  const rng = new RNG(o.seed ?? 'houses');
  const [h0, h1] = o.h ?? [90, 200];
  const [w0, w1] = o.w ?? [80, 170];
  const win = o.win ?? 9;
  const y = o.y;
  const list = [], windows = [];
  let x = o.x0;
  while (x < o.x1) {
    const w = rng.range(w0, w1), h = rng.range(h0, h1);
    const roof = (o.roofs ?? 'mixed') === 'flat' ? 'flat' : rng.chance(0.35) ? 'gable' : rng.chance(0.25) ? 'tower' : 'flat';
    const hs = { x, w, h, roof, l: rng.chance(0.35) ? rng.range(0.52, 0.56) : rng.range(0.68, 0.73), side: rng.range(0.1, 0.18) * w, wins: [], door: null, tower: null };
    const yt = y - h;
    if (roof === 'tower') {
      const tw = w * 0.36, tx = x + w * rng.range(0.15, 0.5);
      hs.tower = { x: tx, w: tw, h: tw * 0.8 };
      hs.wins.push({ x: tx + tw * 0.38, y: yt - tw * 0.55, w: tw * 0.24, h: tw * 0.32, fx0: tx, fx1: tx + tw, fy0: yt - tw * 0.8, fy1: yt });
    }
    const floors = Math.min(o.floors ?? 2, Math.max(1, Math.floor((h - 30) / (win * 3.6))));
    const nx = Math.max(1, Math.floor(w / (win * (o.winGap ?? 3.8))));
    for (let f = 0; f < floors; f++) {
      const wy = yt + 18 + f * win * 3.6;
      if (wy + win * 1.5 > y - win * 2.8) break;
      for (let i = 0; i < nx; i++) {
        if (rng.chance(o.winSkip ?? 0.4)) continue;
        hs.wins.push({ x: x + (w * (i + 0.5)) / nx - win / 2, y: wy, w: win, h: win * 1.45, sill: true, fx0: x, fx1: x + w, fy0: yt, fy1: y });
      }
    }
    if (rng.chance(0.7)) hs.door = { x: x + w * rng.range(0.2, 0.7), w: win * 1.6, h: win * 2.6 };
    list.push(hs);
    windows.push(...hs.wins);
    x += w * rng.range(0.85, 1.05);
  }
  let top = Infinity;
  for (const hs of list) top = Math.min(top, y - hs.h - Math.max(hs.w * 0.3, hs.tower ? hs.tower.h + 6 : 0));
  return { list, windows, bbox: box(o.x0 - 20, top, x - o.x0 + 40, y - top, 4) };
}

export function houses(p, o) {
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const lay = layoutHouses(o);
  const y = o.y;
  // light of the street fronts (the moonlit side walls and copings keep theirs): a number, a range per house, or a function
  const fr = new RNG(`${o.seed ?? 'houses'}-face`);
  const FL = lay.list.map((hs, i) => (typeof o.faceLight === 'function' ? o.faceLight(hs, i) : Array.isArray(o.faceLight) ? fr.range(o.faceLight[0], o.faceLight[1]) : (o.faceLight ?? 1)));
  const win = o.win ?? 9, ms = o.markScale ?? (win <= 10 ? clamp(win / 24, 0.3, 1) : 1);
  p.pass(o.mat ?? cityStone(p, { markScale: ms }), function* (g) {
    // taller houses first so lower ones overlap them (a generator: a few houses per bake unit)
    const order = lay.list.map((hs, i) => [hs, FL[i]]).sort((a, b) => b[0].h - a[0].h);
    let n = 0;
    for (const [hs, fl] of order) {
      if (n++ && n % 8 === 1) yield;
      const { x: hx, w, h } = hs;
      const yt = y - h;
      const sw = hs.side;
      const sxs = ls > 0 ? hx + w : hx - sw;          // the side wall facing the moon
      g.fillStyle = L(ls > 0 ? 0.9 : 0.3);
      g.beginPath(); g.moveTo(sxs, yt + (ls > 0 ? 0 : sw * 0.25)); g.lineTo(sxs + sw, yt + (ls > 0 ? sw * 0.25 : 0)); g.lineTo(sxs + sw, y); g.lineTo(sxs, y); g.closePath(); g.fill();
      g.fillStyle = hgrad(g, hx, hx + w, (hs.l - 0.03) * fl, (hs.l + 0.03) * fl, ls); g.fillRect(hx, yt, w, h);
      if (hs.roof === 'gable') {
        const rh = w * 0.28;
        g.fillStyle = L(0.84); g.beginPath(); g.moveTo(hx - 4, yt); g.lineTo(hx + w / 2, yt - rh); g.lineTo(hx + w + 4, yt); g.closePath(); g.fill();
        g.fillStyle = L(0.3); g.beginPath(); g.moveTo(hx + 6, yt); g.lineTo(hx + w / 2, yt - rh + 9); g.lineTo(hx + w - 6, yt); g.closePath(); g.fill();
        g.fillStyle = L(0.18); g.fillRect(hx - 4, yt, w + 8, 4);
      } else {
        g.fillStyle = L(0.93); g.fillRect(hx - 3, yt - 6, w + 6, 6);           // parapet coping
        g.fillStyle = L(0.25); g.fillRect(hx - 3, yt, w + 6, 3);
        if (hs.tower) {
          const t = hs.tower;
          g.fillStyle = L(hs.l * fl); g.fillRect(t.x, yt - t.h, t.w, t.h);
          g.fillStyle = L(0.93); g.fillRect(t.x - 2, yt - t.h - 4, t.w + 4, 4);
        }
      }
      shadeRect(g, hx, yt, w, 8, 0.35);
      shadeRect(g, ls > 0 ? hx : hx + w - w * 0.06, yt, w * 0.06, h, 0.3);
      const dark = fl < 0.4;                         // a front in the moon's shadow: its sills and lintels stay in it too
      for (const wn of hs.wins) {
        g.fillStyle = L(0.03); g.fillRect(wn.x, wn.y, wn.w, wn.h);
        if (wn.sill) { g.fillStyle = L(dark ? 0.2 : 0.6 + 0.35 * fl); g.fillRect(wn.x - 1.5, wn.y + wn.h, wn.w + 3, 2.4); }
      }
      if (hs.door) {
        const d = hs.door;
        g.fillStyle = L(0.02); g.fillRect(d.x, y - d.h, d.w, d.h);
        g.fillStyle = L(dark ? 0.24 : 0.92); g.fillRect(d.x - 3, y - d.h - 3, d.w + 6, 3);
      }
    }
  }, { bbox: lay.bbox });
  return lay;
}

// Lit windows (per frame): cream panes that go dark at their own time. Each
// lit pane throws a posterised halo of lamplight on the wall round it: two
// flat bands of warm cream shaped like the window (rounded rects that hug the
// pane, a little below it, as lamplight from inside falls), and a flat spill
// on the sill; laid over the wall (source-over, never additive, so it stays
// cream over stone and never turns lavender over navy) and kept on the
// window's own front (fx0..fx1, fy0..fy1 from layoutHouses), never across a
// coping or a neighbour. The halo goes out on the frame the lamp does. Two
// 12 fps frames before it goes out a lamp gutters (a dimmed pane, no halo),
// then flares once more and goes out exactly at its time; under reduced
// motion it simply goes out, with no flicker.
// wins: [{ x, y, w, h, off, exact?, gutter?, fx0?, fx1?, fy0?, fy1? }]; off = shot time the lamp is put out
//      (Infinity = stays lit). By default the lamp goes out on the 12 fps frame `off` falls in; with
//      exact: true it goes out at `off` itself (to a display frame: a beat). gutter = how many 12 fps
//      frames before that frame it gutters (default 2; 0 = never).
// o: { spill = 1 (halo scale, 0 = none), pane = '#f6e8c8', halo ('warm' (default): one opaque band of
//      haloColor '#71665b' round the pane and a sillColor '#a0968b' sill; or [outer alpha, inner alpha]: the
//      round-4 translucent cream bands, [0.24, 0.34]), minHalo = 5 (css px: the smallest half-width),
//      phone = 1.7 (halo scale on portrait screens) }
function rrect(ctx, x0, y0, x1, y1, r) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r); ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r);
  ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.closePath();
}
export function litWindows(ctx, e, wins, o = {}) {
  const t = e.q(12), fq = Math.round(t * 12);
  const lit = [], dim = [];
  for (const w of wins) {
    let k;                                            // whole 12 fps frames before the frame the lamp goes out in
    if (w.exact) { if (!(e.t < w.off)) continue; k = Math.floor(w.off * 12 + 1e-6) - fq; }   // out at its exact time
    else { k = Math.round((w.off - t) * 12); if (!(k > 0)) continue; }
    // it gutters (no halo), flares once more, and goes out on time; an exact lamp with gutter 1 stays dim from the
    // frame before through its exact time (no re-flash between its gutter and its beat)
    const gt = w.gutter ?? 2;
    if (!e.reduced && gt > 0 && (k === gt || (w.exact && gt === 1 && k === 0))) dim.push(w);
    else lit.push(w);
  }
  const sp = o.spill ?? 1;
  if (sp > 0 && lit.length) {
    const portrait = e.view && e.view.vw / e.view.vh < 0.82;
    const kk = sp * (portrait ? (o.phone ?? 1.7) : 1);
    const cssU = (e.dpr || 1) / (e.s || 1);           // world units per css px
    const minR = (o.minHalo ?? 5) * cssU * (portrait ? 1.3 : 1);
    // o.halo (default 'warm'): one opaque band of lamplit stone in N.stone's warm tone 2 round the pane and a
    // tone-3 sill (hard posterised steps, standard 21; never lavender over a navy front, standard 15);
    // o.halo = [outer alpha, inner alpha]: round 4's two translucent cream bands
    const warm = !Array.isArray(o.halo);
    const [a0, a1] = warm ? [0, 0] : o.halo;
    // [fill, half-width x w, half-height x h, min share]: the outer band 2.4w x 1.9h, the inner 1.6w x 1.35h
    const bands = warm ? [[o.haloColor ?? '#71665b', 0.8, 0.675, 0.68]] : [[`rgba(246,232,200,${a0})`, 1.2, 0.95, 1], [`rgba(246,232,200,${a1})`, 0.8, 0.675, 0.68]];
    for (const [fillc, kx, ky, mk] of bands) {
      ctx.fillStyle = fillc; ctx.beginPath();
      for (const w of lit) {
        const cx = w.x + w.w / 2, cy = w.y + w.h * 0.6;
        const hx = Math.max(w.w * kx * kk, minR * mk), hy = Math.max(w.h * ky * kk, minR * mk * 1.15);
        let x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy;
        if (w.fx0 != null) { x0 = Math.max(x0, w.fx0 + 1); x1 = Math.min(x1, w.fx1 - 1); y0 = Math.max(y0, w.fy0 + 4); y1 = Math.min(y1, w.fy1); }
        if (x1 - x0 < w.w || y1 - y0 < w.h) continue;
        rrect(ctx, x0, y0, x1, y1, Math.min(w.w * 0.4 * kk, hx * 0.6));
      }
      ctx.fill();
    }
    // the lamplight on the sill
    ctx.fillStyle = warm ? (o.sillColor ?? '#a0968b') : `rgba(246,232,200,${a1})`; ctx.beginPath();
    for (const w of lit) { const cx = w.x + w.w / 2, hw = w.w * 0.8 * Math.min(kk, 1.3); ctx.rect(cx - hw, w.y + w.h + 0.6, hw * 2, Math.max(w.h * 0.25, 1.2 * cssU)); }
    ctx.fill();
  }
  ctx.fillStyle = o.pane ?? '#f6e8c8'; ctx.beginPath();
  for (const w of lit) ctx.rect(w.x + 0.6, w.y + 0.6, w.w - 1.2, w.h - 1.2);
  ctx.fill();
  if (dim.length) {
    ctx.fillStyle = 'rgba(246,232,200,0.45)'; ctx.beginPath();
    for (const w of dim) ctx.rect(w.x + 0.6, w.y + 0.6, w.w - 1.2, w.h - 1.2);
    ctx.fill();
  }
}

// The inner face of the city wall in the distance: a crenellated curtain
// with square towers. o: { x0, x1, y (base), h, towers: [x...], tw, th, seed,
// light ([a, b]: the curtain's face, default [0.52, 0.58]), towerLight (default [0.66, 0.74]),
// markScale (the stone's mark scale, standard 26; default 1) }
// (a wall seen against the moon: light [0.08, 0.12], its merlon tops and the
// towers' moonward sides stay bright)
export function cityWall(p, o) {
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const { x0, x1, y, h } = o;
  const tw = o.tw ?? 70, th = o.th ?? h * 1.5;
  const mer = o.merlon ?? h * 0.12;
  const top = y - th - mer * 1.2;
  p.pass(o.mat ?? cityStone(p, { markScale: o.markScale ?? 1 }), (g) => {
    const rng = new RNG(o.seed ?? 'wall');
    const [wa, wb] = o.light ?? [0.52, 0.58], [ta, tb] = o.towerLight ?? [0.66, 0.74];
    g.fillStyle = hgrad(g, x0, x1, wa, wb, ls); g.fillRect(x0, y - h, x1 - x0, h);
    for (let mx = x0; mx < x1; mx += mer * 2) g.fillRect(mx, y - h - mer, mer, mer + 1);
    g.fillStyle = L(0.9); for (let mx = x0; mx < x1; mx += mer * 2) g.fillRect(mx, y - h - mer, mer, mer * 0.25);
    // courses
    for (let cy = y - mer; cy > y - h; cy -= mer * 0.8) { g.fillStyle = L(wa < 0.3 ? 0.2 : 0.42); g.fillRect(x0, cy, x1 - x0, Math.max(p.px, mer * 0.06)); }
    for (const tx of o.towers ?? []) {
      g.fillStyle = hgrad(g, tx, tx + tw, ta, tb, ls); g.fillRect(tx, y - th, tw, th);
      g.fillStyle = L(ls > 0 ? 0.92 : 0.3); g.fillRect(ls > 0 ? tx + tw : tx - tw * 0.16, y - th + 3, tw * 0.16, th - 3);
      for (let mx = tx; mx < tx + tw - 1; mx += tw / 4) { g.fillStyle = L(0.7); g.fillRect(mx, y - th - mer * 1.2, tw / 8, mer * 1.2 + 1); }
      g.fillStyle = L(0.03);
      for (let k = 0; k < 2; k++) g.fillRect(tx + tw * 0.44, y - th * (0.4 + 0.3 * k) + rng.range(-3, 3), tw * 0.12, th * 0.12);
      shadeRect(g, tx, y - th, tw, th * 0.04, 0.4);
    }
  }, { bbox: box(x0 - 20, top, x1 - x0 + 40, y - top, 4) });
}

// ------------------------------------------------------------------ cast shadows
// A painter proxy that records another asset's passes as a flat silhouette,
// sheared onto the ground away from the light: a point `hgt` above the
// ground line gy lands at (x - kx*hgt, gy - ky*hgt). Ink is skipped.
// Paint into its own layer and give the layer an alpha to tint the ground.
// o.passes: record only the first n passes (a flat silhouette needs only the
// passes that make the outline: the rest lie inside it). A generator draw
// stays a generator (its yields split the shadow's bake units too).
// o.merge: every recorded pass draws into ONE flat pass (one guide, one shading
// pass; a unit per draw), so small parts drawn in later passes (a horse's
// hooves in its bronze pass) join the silhouette at the cost of a single pass.
// Moon shadows (standard 33, one night): the moon stands at about 55 degrees in
// the plaza and gate shots, so a point 1 unit up lands 0.70 units sideways
// (kx = cot 55 deg); each shot keeps its own direction (ky / kx).
export function shadowPainter(p, { gy, kx = 0.8, ky = 0.06, color, bbox, passes = Infinity, merge = false }) {
  const m = { mode: 'flat', ink: '#000', ramp: [color ?? (p.night ? '#03041a' : '#1b1d33'), color ?? (p.night ? '#03041a' : '#1b1d33')], thr: [0.5], noise: { scale: 30, amp: 0 } };
  const xf = [1, 0, kx, ky, -kx * gy, gy - ky * gy];
  let sb = null;
  if (bbox) {
    const pts = [[bbox.x, bbox.y], [bbox.x + bbox.w, bbox.y], [bbox.x, bbox.y + bbox.h], [bbox.x + bbox.w, bbox.y + bbox.h]]
      .map(([x, y]) => [x + kx * (y - gy), gy + ky * (y - gy)]);
    sb = bboxOf(pts, 6);
  }
  let n = 0;
  const isGenFn = (f) => !!f && f.constructor && f.constructor.name === 'GeneratorFunction';
  const merged = [];                                   // o.merge: the draws of every recorded pass (run at bake time, after the record)
  return new Proxy(p, {
    get(t, k) {
      if (k === 'pass') return (mat, draw, opts = {}) => {
        if (n++ >= passes) return t;
        if (merge) {
          merged.push(draw);
          if (merged.length === 1) {
            t.pass(m, function* (g, pp) {
              for (let i = 0; i < merged.length; i++) {
                if (i) yield;                          // one bake unit per recorded pass (and its own yields)
                const d = merged[i];
                g.save(); g.transform(...xf);
                if (isGenFn(d)) yield* d(g, pp); else d(g, pp);
                g.restore();
              }
            }, { bbox: sb ?? undefined });
          }
          return t;
        }
        if (isGenFn(draw)) return t.pass(m, function* (g, pp) { g.save(); g.transform(...xf); yield* draw(g, pp); g.restore(); }, { ...opts, bbox: sb ?? undefined });
        return t.pass(m, (g, pp) => { g.save(); g.transform(...xf); draw(g, pp); g.restore(); }, { ...opts, bbox: sb ?? undefined });
      };
      if (k === 'ink' || k === 'raw') return () => t;
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

// ------------------------------------------------------------------ sky
// Horizontal streak clouds as in plate 4: long chains of overlapping,
// tapering blobs, white on top with a blue shaded underside, thinning out
// toward the ends. o: { x0, x1, y, depth (vertical spread), count, seed, scale }
export function nightStreaks(p, o) {
  const rng = new RNG(o.seed ?? 'nstreaks');
  const sc = o.scale ?? 1;
  const top = p.night ? '#e9ecf6' : '#f6f4ee', under = p.night ? '#5267ad' : '#9aaedd', deep = p.night ? '#2c4396' : '#6f89c9';
  const lines = [];
  for (let i = 0; i < (o.count ?? 10); i++) {
    const cy = o.y + rng.range(-1, 1) * (o.depth ?? 30);
    const len = rng.range(120, 520) * sc;
    const cx = rng.range(o.x0, o.x1);
    lines.push({ cx, cy, len, th: rng.range(2.2, 6) * sc * (1 - 0.35 * Math.abs(cy - o.y) / ((o.depth ?? 30) + 1)) });
  }
  // the bands' extent (B3's request: a boxed layer can crop to it)
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const s of lines) {
    const n = Math.max(3, Math.round(s.len / (14 * sc))), half = s.len / 2 + (1.3 * s.len) / n + 4 * sc + 2;
    bx0 = Math.min(bx0, s.cx - half); bx1 = Math.max(bx1, s.cx + half); by0 = Math.min(by0, s.cy - s.th * 2); by1 = Math.max(by1, s.cy + s.th * 2.5);
  }
  const sbb = lines.length ? box(bx0, by0, bx1 - bx0, by1 - by0, 8 * sc) : undefined;
  p.ink((ctx) => {
    for (const s of lines) {
      const n = Math.max(3, Math.round(s.len / (14 * sc)));
      const blobs = [];
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const env = Math.pow(Math.sin(Math.PI * u), 0.6);
        if (env < 0.12 || rng.chance(0.08)) continue;
        const x = s.cx - s.len / 2 + u * s.len + rng.range(-4, 4) * sc;
        const th = s.th * env * rng.range(0.7, 1.25);
        const l = (s.len / n) * rng.range(1.4, 2.6);
        blobs.push({ x, y: s.cy + rng.range(-0.6, 0.6) * th, l, th });
      }
      ctx.fillStyle = deep;
      ctx.beginPath(); for (const b of blobs) { ctx.moveTo(b.x + b.l / 2, b.y + b.th * 0.9); ctx.ellipse(b.x, b.y + b.th * 0.9, b.l / 2, b.th * 0.45, 0, 0, Math.PI * 2); } ctx.fill();
      ctx.fillStyle = under;
      ctx.beginPath(); for (const b of blobs) { ctx.moveTo(b.x + b.l / 2, b.y + b.th * 0.45); ctx.ellipse(b.x, b.y + b.th * 0.45, b.l / 2, b.th * 0.62, 0, 0, Math.PI * 2); } ctx.fill();
      ctx.fillStyle = top;
      ctx.beginPath(); for (const b of blobs) { ctx.moveTo(b.x + b.l * 0.46, b.y); ctx.ellipse(b.x, b.y, b.l * 0.46, b.th * 0.55, 0, 0, Math.PI * 2); } ctx.fill();
    }
  }, sbb ? { bbox: sbb } : {});
}

// ------------------------------------------------------------------ colonnade
// A stoa front in elevation: steps, a row of Doric columns before a black
// interior, a plain architrave, a cornice and the eaves of a tiled roof.
// o: { x0, x1, y (ground at the foot of the steps), h (column height), r,
//      gap (axis spacing), steps, rise, seed, lightSide, mat, inner (light of the
//      interior, default 0.02 = black; 0.2 = navy-black), guideExtra(g, p) (runs
//      at the end of the stone pass, in world units) }  Returns { cols, sty, top, yA, r }.
export function colonnade(p, o) {
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const { x0, x1, y } = o;
  const h = o.h ?? 300, r = o.r ?? h * 0.075, gap = o.gap ?? h * 0.42;
  const nSteps = o.steps ?? 3, rise = o.rise ?? h * 0.028;
  const sty = y - nSteps * rise;
  const archH = h * 0.1, cornH = h * 0.06, roofH = h * 0.1;
  const yA = sty - h, yC = yA - archH, top = yC - cornH - roofH;
  const cols = [];
  for (let cx = x0 + gap * 0.5; cx < x1; cx += gap) cols.push(cx);
  const mat = o.mat ?? cityStone(p, { crack: 0.4 });
  p.pass(darkMat(p), (g) => {
    g.fillStyle = L(o.inner ?? 0.02); g.fillRect(x0, yA, x1 - x0, h);   // o.inner 0.2: navy-black (darkMat tone 2) instead of black
    // doors in the back wall, barely there
    for (let i = 1; i < cols.length; i += 2) { g.fillStyle = L(0.16); g.fillRect(cols[i] - gap * 0.18, sty - h * 0.5, gap * 0.36, h * 0.5); }
  }, { bbox: box(x0, yA, x1 - x0, h, 3) });
  p.pass(mat, function* (g, pp) {
    for (let i = 0; i < nSteps; i++) {
      const yy = y - i * rise;
      g.fillStyle = hgrad(g, x0, x1, 0.5, 0.56, ls); g.fillRect(x0 - 20, yy - rise, x1 - x0 + 40, rise);
      g.fillStyle = L(0.93); g.fillRect(x0 - 20, yy - rise, x1 - x0 + 40, rise * 0.24);
    }
    for (const [i, cx] of cols.entries()) { if (i && i % 3 === 0) yield; columnGuide(g, { x: cx, y: sty, h, r, ls, flutes: 16, drums: 5, seed: `${o.seed ?? 'stoa'}${i}`, k: pp.k, cw: mat.outline?.creaseW ?? 1, light: o.shaftLight }); }
    yield;
    g.fillStyle = hgrad(g, x0, x1, 0.81, 0.9, ls); g.fillRect(x0 - 10, yC, x1 - x0 + 20, archH);
    g.fillStyle = L(0.2); g.fillRect(x0 - 10, yA - archH * 0.1, x1 - x0 + 20, archH * 0.1);
    g.fillStyle = L(0.95); g.fillRect(x0 - 16, yC - cornH, x1 - x0 + 32, cornH);
    g.fillStyle = L(0.12); g.fillRect(x0 - 16, yC - cornH * 0.3, x1 - x0 + 32, cornH * 0.3);
    shadeRect(g, x0 - 10, yC, x1 - x0 + 20, archH * 0.3, 0.45);
    // roof eaves: a dark tiled slope with small antefixes along the edge
    g.fillStyle = L(0.34); g.fillRect(x0 - 16, top, x1 - x0 + 32, roofH);
    for (let tx = x0 - 10; tx < x1 + 16; tx += roofH * 0.9) {
      g.fillStyle = L(0.2); g.fillRect(tx + roofH * 0.42, top, roofH * 0.1, roofH);           // cover-tile ridges
      g.fillStyle = L(0.84); g.beginPath(); g.ellipse(tx + roofH * 0.47, yC - cornH - roofH * 0.16, roofH * 0.12, roofH * 0.18, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = L(0.9); g.fillRect(x0 - 16, top, x1 - x0 + 32, roofH * 0.08);
    const gx = o.guideExtra?.(g, p);                                      // e.g. moon shadows across the steps (may be a generator)
    if (gx && typeof gx.next === 'function') yield* gx;
  }, { bbox: box(x0 - 30, top, x1 - x0 + 60, y - top, 4) });
  return { cols, sty, top, yA, r };
}

// ------------------------------------------------------------------ the gate, inner face
// The Scaean gate seen from inside the city (s06b, s07, s08): two projecting
// towers, a passage under a monolithic lintel with a black relieving
// triangle, monolith jambs, and a pair of tarred doors barred by a beam.
// Geometry at s = 1 relative to the centre x and the ground y; the passage
// opening is left transparent so a plate behind can show through when the
// doors open. The passage is 12-13 men tall (production standard 10): a man
// at the gate is about 470 / 12.5 = 37.6 units.
export const GATE = {
  open: { x0: -180, x1: 180, h: 470 },        // passage between the jambs
  leafW: 166, leafH: 470,                      // each door leaf; hinges at x = ±166
  beam: { y: 30, w: 470, h: 18 },              // the bar: centre height above the ground (a man's chest), length, depth
  ring: { x: 26, y: 26, r: 7 },                // the ring pull on each leaf's inner face: x in from the meeting edge, height, radius
  wallTop: 840, towerTop: 1060, towerX: [270, 590],
  // The one inner-face design (production standard 10), in gate units:
  // moonlit ivory ashlar in courses about 0.85 of a man, a black stepped
  // relieving triangle over the lintel, a dark return on the right tower
  // (the tower on the moon's side), and the feast's red festoons on the
  // lintel. gateInner() draws it; gateWall() draws more wall in the same
  // stone; gateStoneMat() is its material. With the light from the upper
  // left (lightSide -1) the design mirrors.
  stone: {
    course: 32,                                // side walls: one course ~0.85 of a man
    towerCourses: [38, 24],                    // towers and the curtain: pseudo-isodomic, tall and short courses alternating
    plinth: 2,                                 // plinth courses at the foot of the towers (a little darker, a moonlit string)
    light: [0.80, 0.78],                       // lit faces of the left and right towers: the mid register (standard 31; the arrises, jambs, lintel and threshold stay 0.88-0.95)
    curtainLight: 0.79,                        // the curtain over the lintel
    wallLight: 0.80,                           // side walls
    jambs: [0.88, 0.84], lintel: 0.9, threshold: 0.95,
    joint: 0.42,                               // joint tone: thin, lighter than the ink, inked once on the arris side (not black brickwork)
    shadowJoint: 0.2,                          // joints inside a cast shadow: a little lighter than the navy-black field (standard 19)
    merlon: { w: 56, h: 50, gap: 42 },
    triangle: { w: 140, h: 116, steps: 6, light: 0.02 },   // a black void with corbelled, stepped sides
    leftReturn: { w: 22, light: 0.97 },        // the left tower's inner return, turned to the moon
    rightReturn: { w: 24, light: 0.08 },       // the right tower's inner return, away from it
    shadow: { w: 64, a: 0.93 },                // each tower's moon shadow on the wall to its left (the right one over the right jamb)
    slits: [0.4, 0.62, 0.84],                  // slit windows in each tower (fractions of towerTop)
    sideH: 520, walk: 460,                     // side walls: height, and the wall-walk (a string course on the towers; with sides.h it follows, 60 under the top)
    sideLow: 275,                              // s03's city-wall height beside the gate (0.58 passages, standard 20): sides: { h: GATE.stone.sideLow }
    bold: { share: 0.33, th: [2.6, 3.6], light: [0.06, 0.18] },   // heavier bed joints (gate units): under each deeply shaded stone and a third of the others (bold: false = none)
    festoons: { nails: [-262, 0, 262], y: 548, sag: 44, tails: [54, 64] },
  },
};

// Moonlit limestone for the gate (plate 4): the one stone vocabulary of
// M.stone / N.stone (standard 18: its chips, pits, engraved hatching and ink),
// with the engraving also laid wherever aux2 asks for it (weathered blocks)
// and plate 4's broken cracks (the values B3 tested against plate 4 in s07).
// s06b, s07 and s08 all draw the gate with it.
export function gateStoneMat(p) {
  return deriveMat(p.mat.stone, {
    crack: { amp: 0.4, width: 0.1 },
    extra: { hatchByAux2: true },
  });
}

// Crenellated silhouette of a wall: [x, x + w] x [top, y], merlons above top.
function crenelRegion(g, x, y, w, top, mer) {
  g.rect(x, top, w, y - top);
  if (mer) for (let mx = x; mx < x + w - 2; mx += mer.w + mer.gap) g.rect(mx, top - mer.h, Math.min(mer.w, x + w - mx), mer.h + 0.5);
}
function crenelOutline(ctx, x, y, w, top, mer) {
  if (!mer) { ctx.rect(x, top, w, y - top); return; }
  ctx.moveTo(x, y); ctx.lineTo(x, top - mer.h);
  for (let mx = x; mx < x + w - 2; mx += mer.w + mer.gap) {
    const mw = Math.min(mer.w, x + w - mx);
    ctx.lineTo(mx, top - mer.h); ctx.lineTo(mx + mw, top - mer.h); ctx.lineTo(mx + mw, top);
    if (mx + mer.w + mer.gap < x + w - 2) { ctx.lineTo(mx + mer.w + mer.gap, top); ctx.lineTo(mx + mer.w + mer.gap, top - mer.h); }
  }
  ctx.lineTo(x + w, top); ctx.lineTo(x + w, y);
}

// Multiply the light under a rect by a linear ramp of (1 - a): a0 at (x0, y0),
// a1 at (x1, y1). A soft shade with no edge, so the shader inks nothing.
function rampShade(g, rx, ry, rw, rh, x0, y0, x1, y1, a0, a1) {
  if (rw <= 0 || rh <= 0) return;
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, `rgba(0,0,0,${clamp(a0)})`); gr.addColorStop(1, `rgba(0,0,0,${clamp(a1)})`);
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); g.restore();
}

// A cast shadow over ashlar (standard 19): the field drops to navy-black and
// the joints inside it are redrawn a little lighter than the field, so the
// masonry still reads in the shadow (never a flat slate tone). joints: the
// rects ashlarGuide returns (info.joints in its extra callback).
function shadeJoints(g, joints, rx, ry, rw, rh, a, light = 0.2, skip = null) {
  shadeRect(g, rx, ry, rw, rh, a);
  if (!joints || !joints.length) return;
  g.save(); g.beginPath();
  if (skip) { g.rect(rx, ry, rw, Math.max(0, skip[0] - ry)); g.rect(rx, skip[1], rw, Math.max(0, ry + rh - skip[1])); }   // not across a band (the wall-walk)
  else g.rect(rx, ry, rw, rh);
  g.clip();
  g.fillStyle = L(light);
  for (const [jx, jy, jw2, jh] of joints) if (jx < rx + rw && jx + jw2 > rx && jy < ry + rh && jy + jh > ry) g.fillRect(jx, jy, jw2, jh);
  g.restore();
}

// Monumental ashlar guide (inside a pass, world units): big blocks with thin,
// broken joints on textured faces (plates 1 and 4). Every joint is a sharp
// step on the side of the block turned to the light (a moonlit arris) and a
// soft ramp on the side away from it, so the shader's crease ink draws it
// once, as one thin line, never as a double outline round each block. About a
// quarter of the head joints are merged (one long stone, sometimes with a
// short stub of the old joint), each bed joint breaks two or three times, and
// a weathered block is hatched (aux2). The ramps are softer than the crease
// threshold at any scale, so they posterise into a shade band, not an ink line.
// o: { x, y (base), w, h, courses (world-unit heights, cycled from the bottom),
// light, joint (default GATE.stone.joint), ls (light side, default 1), merlon,
// plinth, seed, extra(g, info) (runs inside the clip; info.joints = the joint
// rects [x, y, w, h], for shadeJoints) }. Returns info.
function ashlarGuide(g, p, o) {
  const { x, y, w, h } = o;
  const rows = o.courses;
  const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
  const rng = new RNG(o.seed ?? `gash${x}`);
  const base = o.light ?? 0.86;
  const ls = (o.ls ?? 1) >= 0 ? 1 : -1;
  const mer = o.merlon ?? null;
  const top = y - h, yTop = top - (mer ? mer.h : 0);
  const jw = Math.max(p.px * 1.6, mean * 0.022);          // at least 1.6 device px: a bed joint keeps its weight at any DPR (the s07 finding)
  const jl = o.joint ?? GATE.stone.joint;
  const cw = o.cw ?? p.mat.stone?.outline?.creaseW ?? 1;
  const kk = Math.min(1, p.k * cw) / cw;               // the crease detector samples cw world units (at least one device px) apart
  const soft = (dl, width) => Math.min(dl, 0.06 * width * kk);   // the largest light drop a ramp of this width may make without ink
  const joints = [];
  const brng = new RNG(`${o.seed ?? `gash${x}`}-bold`);  // its own numbers, so the blocks stay where they were
  g.save();
  g.beginPath(); crenelRegion(g, x, y, w, top, mer); g.clip();
  g.fillStyle = L(jl); g.fillRect(x - 2, yTop - 2, w + 4, y - yTop + 4);   // the joints
  let below = null;                                     // the course under this one: its stones and the breaks in its bed joint
  for (let cy = y, row = 0, ch = rows[0]; cy > yTop - 1; cy -= ch, row++, ch = rows[row % rows.length]) {
    const yb = cy - ch;                                 // this course's bed joint (at its top)
    const plinth = row < (o.plinth ?? 0);
    const stones = [];
    let cx = x - rng.range(0, mean * 2.4);
    while (cx < x + w) {
      let bw = mean * rng.range(1.2, 4.2);
      let stub = null;
      if (rng.chance(0.25)) {                           // a merged head joint: one long stone, sometimes a stub of the old joint
        if (rng.chance(0.45)) stub = { at: bw, len: rng.range(0.25, 0.55), fromTop: rng.chance(0.6) };
        bw += mean * rng.range(1.2, 3.2);
      }
      const weather = rng.chance(0.24);
      const shadeU = rng.chance(0.4);                   // a deeper, hatched shade under the course
      const l = clamp(base + rng.range(-0.035, 0.035) - (weather ? rng.range(0.1, 0.16) : 0) - (plinth ? 0.04 : 0));
      const a2 = weather ? 1 : 0.45;
      const fx0 = cx + jw, fy0 = yb + jw, fx1 = cx + bw, fw = fx1 - fx0, fh = cy - fy0;
      stones.push({ x0: cx, x1: cx + bw, l, a2, plain: !weather && !shadeU, shade: shadeU });
      g.fillStyle = L(l, 0, a2); g.fillRect(fx0, fy0, fw, fh);
      // moonlit arrises: the top edge, and the edge on the light's side (sharp: the crease ink draws the joint there)
      const aH = Math.max(p.px * 1.2, ch * 0.05), aW = Math.max(p.px * 1.2, ch * 0.045);
      g.fillStyle = L(Math.min(1, l + 0.1)); g.fillRect(fx0, fy0, fw, aH);
      g.fillStyle = L(Math.min(1, l + 0.08)); g.fillRect(ls > 0 ? fx1 - aW : fx0, fy0, aW, fh);
      // the soft side: shade ramps toward the bed joint below and the head joint away from the light
      const wb = ch * (shadeU ? 0.42 : 0.3), db = soft(shadeU ? 0.34 : 0.22, wb);
      rampShade(g, fx0, cy - wb, fw, wb, 0, cy - wb, 0, cy, 0, db / Math.max(0.1, l));
      const wh = Math.min(fw * 0.3, ch * 0.32), dh = soft(0.26, wh);
      if (ls > 0) rampShade(g, fx0, fy0, wh, fh, fx0, 0, fx0 + wh, 0, dh / Math.max(0.1, l), 0);
      else rampShade(g, fx1 - wh, fy0, wh, fh, fx1 - wh, 0, fx1, 0, 0, dh / Math.max(0.1, l));
      if (stub) {                                       // the worn stub of a merged joint
        const sx = cx + stub.at, sh2 = fh * stub.len, sy = stub.fromTop ? fy0 : cy - sh2;
        g.fillStyle = L(jl); g.fillRect(sx, sy, jw, sh2);
        g.fillStyle = L(Math.min(1, l + 0.08)); g.fillRect(ls > 0 ? sx - aW : sx + jw, sy, aW, sh2);
        if (ls > 0) rampShade(g, sx + jw, sy, wh, sh2, sx + jw, 0, sx + jw + wh, 0, dh / Math.max(0.1, l), 0);
        else rampShade(g, sx - wh, sy, wh, sh2, sx - wh, 0, sx, 0, 0, dh / Math.max(0.1, l));
        joints.push([sx, sy, jw, sh2]);
      }
      if (rng.chance(0.3)) {                            // a chipped corner
        const cs = ch * rng.range(0.12, 0.28), right = rng.chance(0.5);
        g.fillStyle = L(0.1); g.beginPath();
        if (right) { g.moveTo(fx1, cy); g.lineTo(fx1 - cs * 1.4, cy); g.lineTo(fx1, cy - cs); }
        else { g.moveTo(fx0, fy0); g.lineTo(fx0 + cs * 1.4, fy0); g.lineTo(fx0, fy0 + cs); }
        g.closePath(); g.fill();
      }
      if (rng.chance(0.22)) {                           // a weather streak from the joint above, fading down
        const sx = fx0 + fw * rng.range(0.1, 0.85), sw = ch * rng.range(0.08, 0.2), sl = fh * rng.range(0.4, 1);
        rampShade(g, sx, fy0, sw, sl, 0, fy0, 0, fy0 + sl, 0.13 / Math.max(0.1, l), 0);
      }
      if (rng.chance(0.35)) { g.fillStyle = L(0.06); g.beginPath(); g.arc(fx0 + rng.range(0.1, 0.9) * fw, fy0 + rng.range(0.2, 0.75) * fh, ch * rng.range(0.012, 0.028), 0, TAU); g.fill(); }
      joints.push([cx, yb, jw, ch]);                    // its head joint
      cx += bw;
    }
    // the bed joint at the top of the course below breaks where its stone runs on into this one (2-3 times a course):
    // repaint the joint, the arris under it and this course's ramp over it in the lower stone's face, faded at the ends
    if (below) {
      for (const gp of below.gaps) {
        const st = below.stones.find((s2) => s2.x0 <= gp.x && s2.x1 >= gp.x + gp.w);
        const up = stones.find((s2) => s2.x0 <= gp.x && s2.x1 >= gp.x + gp.w);
        if (!st || !up || !st.plain || !up.plain) continue;
        const y0 = below.yb - ch * 0.44, y1 = below.yb + jw + Math.max(p.px * 1.2, below.ch * 0.05) + p.px;
        const fe = Math.min(gp.w * 0.3, Math.max(4, ch * 0.25)) / gp.w;
        const gr = g.createLinearGradient(gp.x, 0, gp.x + gp.w, 0);
        gr.addColorStop(0, L(st.l, 0, st.a2, 0)); gr.addColorStop(fe, L(st.l, 0, st.a2, 1));
        gr.addColorStop(1 - fe, L(st.l, 0, st.a2, 1)); gr.addColorStop(1, L(st.l, 0, st.a2, 0));
        g.fillStyle = gr; g.fillRect(gp.x, y0, gp.w, y1 - y0);
      }
      // the bed joint, without its breaks
      let jx = x - 2;
      const runs = [];
      for (const gp of below.gaps.slice().sort((a, b) => a.x - b.x)) { if (gp.x > jx) runs.push([jx, gp.x]); jx = Math.max(jx, gp.x + gp.w); }
      runs.push([jx, x + w + 2]);
      for (const [a, b] of runs) joints.push([a, below.yb, b - a, jw]);
      // o.bold (GATE.stone.bold): plate 4's heavier course lines - under every stone with a deep shade, and a
      // share of the others, the bed joint is a dark band (its own tone and weight, broken here and there) above
      // the lower stone's lit arris, so the crease ink prints one bold line there; head joints stay thin
      const B = o.bold;
      if (B) {
        for (const st of stones) {
          if (!st.shade && !brng.chance(B.share ?? 0.33)) continue;
          const th = Math.max(jw, Math.min(ch * 0.12, brng.range(B.th?.[0] ?? 1.8, B.th?.[1] ?? 2.6) * (o.boldScale ?? 1))), tone = brng.range(B.light?.[0] ?? 0.06, B.light?.[1] ?? 0.18);
          for (const [a, b] of runs) {
            let s0 = Math.max(a, st.x0 + jw + brng.range(0, ch * 0.4)), s1 = Math.min(b, st.x1 - brng.range(0, ch * 0.4));
            if (s1 - s0 < ch * 0.5) continue;
            if (brng.chance(0.4)) { const m = brng.range(s0 + (s1 - s0) * 0.3, s1 - (s1 - s0) * 0.3), gw2 = brng.range(0.15, 0.5) * ch; g.fillStyle = L(tone); g.fillRect(s0, below.yb + jw - th, m - gw2 / 2 - s0, th); g.fillRect(m + gw2 / 2, below.yb + jw - th, s1 - m - gw2 / 2, th); }
            else { g.fillStyle = L(tone); g.fillRect(s0, below.yb + jw - th, s1 - s0, th); }
          }
        }
      }
    }
    const gaps = [];
    for (let k = rng.int(2, 3); k > 0; k--) gaps.push({ x: x + rng.range(0.02, 0.92) * w, w: ch * rng.range(0.5, 1.2) });
    below = { yb, ch, stones, gaps };
    if (o.plinth && row === o.plinth - 1) { g.fillStyle = L(0.98); g.fillRect(x, cy - ch - mean * 0.08, w, mean * 0.18); g.fillStyle = L(0.1); g.fillRect(x, cy - ch - mean * 0.18, w, mean * 0.1); }
  }
  if (below) joints.push([x - 2, below.yb, w + 4, jw]);
  const info = { joints };
  o.extra?.(g, info);
  g.restore();
  return info;
}

// The wall-walk's slab on corbels and the hard moon shadow it throws on the
// face below (inside a wall's clip). wy = the slab's top; S scales gate units.
function wallWalkGuide(g, x0, x1, wy, S) {
  const slab = S(16), band = S(44), step = S(70), cw = S(22), ch = S(26);
  for (let sx = x0 + S(120); sx < x1 - S(40); sx += S(280)) {                    // spouts: rain streaks down the face
    const sg = g.createLinearGradient(0, wy + slab + band, 0, wy + slab + band + S(270));
    sg.addColorStop(0, L(0.58, 0, 1, 0.9)); sg.addColorStop(1, L(0.58, 0, 1, 0));
    g.fillStyle = sg; g.fillRect(sx, wy + slab + band, S(30), S(270));
  }
  g.fillStyle = L(0.06); g.fillRect(x0, wy + slab, x1 - x0, band);
  for (let cx = x0 + S(30); cx < x1 - cw; cx += step) {
    g.fillStyle = L(0.06);
    g.beginPath(); g.moveTo(cx, wy + slab + band); g.lineTo(cx + cw, wy + slab + band); g.lineTo(cx + cw - S(14), wy + slab + band + S(16)); g.lineTo(cx - S(14), wy + slab + band + S(16)); g.closePath(); g.fill();
    g.fillStyle = L(0.64); g.fillRect(cx, wy + slab, cw, ch);
    g.fillStyle = L(0.93); g.fillRect(cx + cw - S(5), wy + slab, S(5), ch);
    g.fillStyle = L(0.2); g.fillRect(cx, wy + slab + ch - S(3), cw, S(3));
  }
  g.fillStyle = L(0.9); g.fillRect(x0, wy, x1 - x0, slab);
  g.fillStyle = L(0.99); g.fillRect(x0, wy, x1 - x0, S(3));
  g.fillStyle = L(0.3); g.fillRect(x0, wy + slab - S(3), x1 - x0, S(3));
}

// More wall in the gate's stone (side walls, a curtain): one pass + one ink.
// o: { x, y (base), w, h (world units), s (scales the gate-unit courses and
// merlons), course | courses, light, merlon (false = none), plinth, walk (true
// = the wall-walk on corbels GATE.stone.sideH - walk below the top), seed,
// mat, guideExtra(g, p) }. Returns { bbox, top }.
export function gateWall(p, o) {
  const D = GATE.stone, s = o.s ?? 1, S = (v) => v * s;
  const { x, y, w, h } = o;
  const courses = (o.courses != null ? [].concat(o.courses) : [o.course ?? D.course]).map(S);
  const mer = o.merlon === false ? null : (o.merlon ? { ...o.merlon } : { w: S(D.merlon.w), h: S(D.merlon.h), gap: S(D.merlon.gap) });
  const top = y - h, yTop = top - (mer ? mer.h : 0);
  const bb = box(x, yTop, w, y - yTop, 4);
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  p.pass(o.mat ?? gateStoneMat(p), (g, pp) => {
    ashlarGuide(g, pp, { x, y, w, h, courses, light: o.light ?? D.wallLight, joint: D.joint, ls, merlon: mer, plinth: o.plinth ?? 0, seed: o.seed, bold: o.bold === false ? null : (o.bold ?? D.bold), boldScale: s,
      extra: (gg, info) => { if (o.walk) wallWalkGuide(gg, x, x + w, top + S(D.sideH - D.walk), S); o.guideExtra?.(gg, pp, info); } });
  }, { bbox: bb });
  p.ink((ctx) => {
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(p.px * 1.4, courses[0] * 0.03);
    ctx.beginPath(); crenelOutline(ctx, x, y, w, top, mer); ctx.stroke();
  }, { bbox: bb });
  return { bbox: bb, top };
}

// The feast's festoons on the lintel: vermilion swags between three nails,
// ribbon tails at each nail, and the right tower's shadow over the right end.
// o: { x, y, s, lightSide, nails, y0 (height above the ground), sag, tails }. One pass.
export function gateFestoons(p, o) {
  const D = GATE.stone.festoons, s = o.s ?? 1, S = (v) => v * s, { x, y } = o;
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const nails = (o.nails ?? D.nails).map((d) => x + S(d));
  const y0 = y - S(o.y0 ?? D.y), sag = S(o.sag ?? D.sag), tails = o.tails ?? D.tails;
  const xa = Math.min(...nails), xb = Math.max(...nails);
  const tl = S(Math.max(...tails));
  const bb = box(xa - S(20), y0 - S(12), xb - xa + S(40), Math.max(sag + S(16), tl + S(10)) + S(12), 3);
  p.pass(p.mat.red, (g) => {
    for (let i = 0; i < nails.length - 1; i++) {
      const a = nails[i], b = nails[i + 1], n = 24;
      const topE = [], botE = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n, xx = lerp(a, b, u), yy = y0 + S(6) + sag * Math.sin(Math.PI * u), th = S(5 + 9 * Math.sin(Math.PI * u));
        topE.push([xx, yy - th / 2]); botE.push([xx, yy + th / 2]);
      }
      g.fillStyle = L(0.48); g.beginPath(); g.moveTo(topE[0][0], topE[0][1]); for (const q of topE) g.lineTo(q[0], q[1]); for (const q of botE.reverse()) g.lineTo(q[0], q[1]); g.closePath(); g.fill();
      g.fillStyle = L(0.86); g.beginPath(); for (let k = 0; k < topE.length; k++) { const q = topE[k]; if (k) g.lineTo(q[0], q[1] + S(4)); else g.moveTo(q[0], q[1]); } for (let k = topE.length - 1; k >= 0; k--) g.lineTo(topE[k][0], topE[k][1]); g.closePath(); g.fill();
      for (let k = 1; k < 6; k++) { const u = k / 6, xx = lerp(a, b, u), yy = y0 + S(6) + sag * Math.sin(Math.PI * u); g.fillStyle = L(0.2); g.fillRect(xx - S(1.2), yy - S(6), S(2.4), S(12)); }   // the binding
    }
    for (const [i, nx] of nails.entries()) {                                                                    // knots and ribbon tails
      g.fillStyle = L(0.9); g.beginPath(); g.arc(nx, y0 + S(4), S(7), 0, TAU); g.fill();
      for (const d of [-1, 1]) {
        const len = S(tails[(i + (d > 0 ? 1 : 0)) % tails.length]);
        g.fillStyle = L(d * ls > 0 ? 0.42 : 0.82);
        g.beginPath(); g.moveTo(nx + d * S(2), y0 + S(8)); g.lineTo(nx + d * S(9), y0 + S(8)); g.quadraticCurveTo(nx + d * S(14), y0 + len * 0.6, nx + d * S(8), y0 + len); g.lineTo(nx + d * S(2), y0 + len - S(7)); g.quadraticCurveTo(nx + d * S(6), y0 + len * 0.55, nx + d * S(2), y0 + S(8)); g.closePath(); g.fill();
      }
    }
    if (o.shadow !== false) {                                                                                   // the tower's moon shadow
      const [t0] = GATE.towerX, sw = GATE.stone.shadow.w;
      const sx0 = ls > 0 ? x + S(t0 - sw) : x - S(t0 + 30), sx1 = ls > 0 ? x + S(t0 + 30) : x - S(t0 - sw);
      shadeRect(g, sx0, y0 - S(20), sx1 - sx0, S(110), 0.8);
    }
  }, { bbox: bb });
  return { bbox: bb, nails, y0 };
}

// The inner face. Uses GATE.stone; any field can be overridden:
// o: { x, y (ground), s, lightSide, mat, backlit,
//      course (one course for towers and curtain), towerCourses ([a, b] or a number), light (number or [left, right]),
//      curtainLight, triangle (false | { w, h, steps, light }), rightReturn (false | { w, light }), leftReturn,
//      festoons (false | { nails, y0, sag, tails }), slits (false | [fractions]),
//      sides ({ left, right, h } in gate units: side walls in the same stone, with the wall-walk) }.
// o.backlit: the moon is outside the walls, so the inner face stands in
// shadow with only its crenellations catching the light.
// Passes: 1 stone (+1 per side wall), 1 metal (the beam's brackets), 1 red (festoons), 1 ink.
export function gateInner(p, o) {
  const s = o.s ?? 1, { x, y } = o;
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const S = (v) => v * s;
  const bl = !!o.backlit;
  const V = (lit, dark) => (bl ? dark : lit);
  const D = GATE.stone;
  const mat = o.mat ?? gateStoneMat(p);
  const [t0, t1] = GATE.towerX;
  const courses = (o.towerCourses != null ? [].concat(o.towerCourses) : o.course != null ? [o.course] : D.towerCourses).map(S);
  const lt = o.light ?? D.light, [lL, lR] = Array.isArray(lt) ? lt : [lt, lt];
  const lc = o.curtainLight ?? D.curtainLight;
  const ov = (v, d) => (v === false ? null : { ...d, ...(v && typeof v === 'object' ? v : {}) });
  const tri = ov(o.triangle, D.triangle);
  const litRet = ov(o.leftReturn, D.leftReturn), darkRet = ov(o.rightReturn, D.rightReturn);
  const slits = o.slits === false ? [] : (o.slits ?? D.slits);
  const mer = { w: S(D.merlon.w), h: S(D.merlon.h), gap: S(D.merlon.gap) };
  const sides = o.sides ?? null;
  const bold = o.bold === false ? null : (o.bold ?? D.bold);   // GATE.stone.bold (o.bold: false = thin bed joints only)
  const sideH = S(sides?.h ?? D.sideH);
  const walkU = sides?.walk ?? (sides?.h ?? D.sideH) - (D.sideH - D.walk);    // the wall-walk stays just under the parapet (60 gate units) at any height
  const xL = x - S(t1) - (sides?.left ? S(sides.left) : 0), xR = x + S(t1) + (sides?.right ? S(sides.right) : 0);
  const towerY = y - S(GATE.towerTop), curtY = y - S(GATE.wallTop);
  const bb = box(xL - 10, towerY - mer.h - 10, xR - xL + 20, y - towerY + mer.h + 14, 4);
  const sh = D.shadow;
  // the tower on the light's side (k = ls) has its inner return in shade and
  // throws its shadow over the jamb and the curtain beside it
  p.pass(mat, function* (g, pp) {
    // side walls, each in the shadow of its tower on the side away from the light
    // (a generator: one bake unit per wall section, so the big stone guide never stalls a frame)
    for (const k of [-1, 1]) {
      const sw = k < 0 ? sides?.left : sides?.right;
      if (!sw) continue;
      yield;
      const wx0 = k < 0 ? xL : x + S(t1), wx1 = k < 0 ? x - S(t1) : xR;
      ashlarGuide(g, pp, { x: wx0, y, w: wx1 - wx0, h: sideH, courses: [S(sides.course ?? D.course)], light: V(D.wallLight, 0.5), joint: D.joint, ls, merlon: mer, plinth: 0, seed: `gw${k}${o.seed ?? ''}`, bold: bold, boldScale: s,
        extra: (gg, info) => {
          wallWalkGuide(gg, wx0, wx1, y - S(walkU), S);
          if (k === -ls) { const ex = k < 0 ? wx1 - S(sh.w + 6) : wx0; shadeJoints(gg, info.joints, ex, y - sideH - mer.h - 4, S(sh.w + 6), sideH + mer.h + 8, sh.a, D.shadowJoint, [y - S(walkU) - S(2), y - S(walkU) + S(80)]); }
        } });
    }
    // the curtain over the lintel, with the light-side tower's shadow at its end
    yield;
    ashlarGuide(g, pp, { x: x - S(t0), y: y - S(560), w: S(t0 * 2), h: S(GATE.wallTop - 560), courses, light: V(lc, 0.4), joint: D.joint, ls, merlon: mer, seed: `gc${o.seed ?? ''}`, bold: bold, boldScale: s,
      extra: (gg, info) => { if (!bl) { const ex = ls > 0 ? x + S(t0 - sh.w) : x - S(t0); shadeJoints(gg, info.joints, ex, curtY - mer.h - 4, S(sh.w), S(GATE.wallTop) + mer.h, sh.a, D.shadowJoint); } } });
    // the towers: returns, slit windows, string course
    for (const k of [-1, 1]) {
      yield;
      const tx0 = k < 0 ? x - S(t1) : x + S(t0), tx1 = k < 0 ? x - S(t0) : x + S(t1);
      const lit = k < 0 ? lL : lR;
      ashlarGuide(g, pp, { x: tx0, y, w: tx1 - tx0, h: S(GATE.towerTop), courses, light: V(lit, k === ls ? 0.54 : 0.52), joint: D.joint, ls, merlon: mer, plinth: D.plinth, seed: `gt${k}${o.seed ?? ''}`, bold: bold, boldScale: s,
        extra: (gg) => {
          // the inner return: lit on the tower away from the light, dark on the tower at its side
          const inner = k < 0 ? tx1 : tx0;
          if (k === ls) { if (darkRet) { gg.fillStyle = L(V(darkRet.light, 0.06)); gg.fillRect(k < 0 ? inner - S(darkRet.w) : inner, towerY - mer.h - 4, S(darkRet.w), S(GATE.towerTop) + mer.h + 8); } }
          else if (litRet) {
            gg.fillStyle = L(V(litRet.light, 0.5)); gg.fillRect(k < 0 ? inner - S(litRet.w) : inner, towerY - mer.h - 4, S(litRet.w), S(GATE.towerTop) + mer.h + 8);
            gg.fillStyle = L(0.5); gg.fillRect(k < 0 ? inner - S(litRet.w + 2) : inner + S(litRet.w), towerY - mer.h - 4, S(2), S(GATE.towerTop) + mer.h + 8);
          }
          const wx = (tx0 + tx1) / 2 - S(9);
          for (const hy of slits) {
            const wy = y - S(GATE.towerTop * hy);
            const sg = gg.createLinearGradient(0, wy + S(75), 0, wy + S(260));                 // rain has streaked the face below the sill
            sg.addColorStop(0, L(0.56, 0, 1, 0.95)); sg.addColorStop(1, L(0.56, 0, 1, 0));
            gg.fillStyle = sg; gg.fillRect(wx - S(4), wy + S(75), S(26), S(185));
            gg.fillStyle = L(0.02); gg.fillRect(wx, wy, S(18), S(66));
            gg.fillStyle = L(V(0.99, 0.7)); gg.fillRect(wx - S(7), wy + S(66), S(32), S(6));
            gg.fillStyle = L(0.1); gg.fillRect(wx - S(7), wy + S(72), S(32), S(3));
          }
          if (sides) {                                                                          // string course at the wall-walk
            const sy = y - S(walkU);
            gg.fillStyle = L(V(0.97, 0.7)); gg.fillRect(tx0, sy, tx1 - tx0, S(10));
            gg.fillStyle = L(0.12); gg.fillRect(tx0, sy + S(10), tx1 - tx0, S(12));
          }
          if (bl) { // moonlight from beyond the walls rims the battlements
            for (let mx = tx0; mx < tx1 - 2; mx += mer.w + mer.gap) { gg.fillStyle = L(0.95); gg.fillRect(mx, towerY - mer.h, Math.min(mer.w, tx1 - mx), S(5)); }
            for (let kk = 0; kk < 3; kk++) shadeRect(gg, tx0, towerY + S(GATE.towerTop) * (0.55 + kk * 0.15), tx1 - tx0, S(GATE.towerTop) * 0.15, 0.1);
          }
        } });
    }
    yield;
    const H = GATE.open.h, top = y - S(H);
    // jambs: monoliths, with joints against the towers
    g.fillStyle = L(0.08); g.fillRect(x - S(272), top - S(4), S(14), S(H + 4)); g.fillRect(x + S(258), top - S(4), S(14), S(H + 4));
    const [jL, jR] = ls > 0 ? D.jambs : [D.jambs[1], D.jambs[0]];
    g.fillStyle = L(V(jL, 0.56)); g.fillRect(x - S(262), top, S(82), S(H));
    g.fillStyle = L(V(jR, 0.52)); g.fillRect(x + S(180), top, S(82), S(H));
    // the rebates the leaves close against: the one turned to the light is bright
    g.fillStyle = L(V(ls > 0 ? 0.96 : 0.06, 0.62)); g.fillRect(x - S(180), top, S(14), S(H));
    g.fillStyle = L(V(ls > 0 ? 0.06 : 0.96, 0.5)); g.fillRect(x + S(166), top, S(14), S(H));
    g.fillStyle = L(0.3); g.fillRect(x - S(262), top, S(4), S(H)); g.fillRect(x + S(180), top, S(4), S(H));
    // lintel
    g.fillStyle = L(V(D.lintel, 0.64)); g.fillRect(x - S(270), y - S(560), S(540), S(90));
    g.fillStyle = L(V(0.99, 0.78)); g.fillRect(x - S(270), y - S(560), S(540), S(6));
    g.fillStyle = L(0.06); g.fillRect(x - S(270), y - S(476), S(540), S(6));
    // relieving triangle: a black void with corbelled, stepped sides
    if (tri) {
      const TH = tri.h, TW = tri.w, n = tri.steps;
      g.fillStyle = L(tri.light);
      g.beginPath(); g.moveTo(x - S(TW), y - S(560)); g.lineTo(x, y - S(560 + TH)); g.lineTo(x + S(TW), y - S(560)); g.closePath(); g.fill();
      for (let i = 0; i < n; i++) {
        const yy = y - S(560) - S((TH * i) / n), hw = S(TW * (1 - i / n));
        g.fillStyle = L(V(ls > 0 ? 0.95 : 0.1, 0.5)); g.fillRect(x - hw - S(10), yy - S(TH / n), S(12), S(TH / n));
        g.fillStyle = L(V(ls > 0 ? 0.1 : 0.95, 0.32)); g.fillRect(x + hw - S(2), yy - S(TH / n), S(12), S(TH / n));
      }
    }
    // threshold stone
    g.fillStyle = L(V(D.threshold, 0.62)); g.fillRect(x - S(200), y - S(12), S(400), S(12));
    g.fillStyle = L(0.4); g.fillRect(x - S(200), y - S(2), S(400), S(2));
    // the light-side tower's moon shadow over its jamb and the lintel's end
    if (!bl) { const ex0 = ls > 0 ? x + S(t0 - sh.w) : x - S(t0 + 20); shadeRect(g, ex0, y - S(700), S(sh.w + 20), S(720), sh.a); }
  }, { bbox: bb });
  // iron brackets on the jambs that cradle the beam (sized to the beam)
  const by = y - S(GATE.beam.y), bk = GATE.beam.h / 36, B = (v) => S(v * bk);
  p.pass(p.mat.metal, (g) => {
    for (const k of [-1, 1]) {
      const bx = x + k * S(206);
      g.fillStyle = L(0.3); g.fillRect(bx - B(20), by - B(30), B(40), B(60));                 // back plate
      g.fillStyle = L(0.75); g.fillRect(bx - B(20), by - B(30), B(40), B(4));
      g.fillStyle = L(0.55); g.fillRect(bx - B(24), by + B(18), B(48), B(12));                // cradle
      g.fillStyle = L(0.95); g.fillRect(bx - B(24), by + B(18), B(48), B(3));
      for (const dy of [-20, 8]) for (const dx of [-12, 12]) { g.fillStyle = L(0.95); g.beginPath(); g.arc(bx + B(dx), by + B(dy), B(3), 0, TAU); g.fill(); }
    }
  }, { bbox: box(x - S(240), by - B(36), S(480), B(72), 3) });
  const fest = o.festoons === false ? null : gateFestoons(p, { x, y, s, lightSide: ls, ...(o.festoons && typeof o.festoons === 'object' ? o.festoons : {}) });
  // ink: the silhouettes of the towers, the curtain and the side walls
  p.ink((ctx) => {
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(p.px * 1.4, courses[0] * 0.03); ctx.lineJoin = 'miter';
    ctx.beginPath();
    for (const k of [-1, 1]) crenelOutline(ctx, k < 0 ? x - S(t1) : x + S(t0), y, S(t1 - t0), towerY, mer);
    crenelOutline(ctx, x - S(t0), y - S(560), S(t0 * 2), curtY, mer);
    if (sides?.left) crenelOutline(ctx, xL, y, x - S(t1) - xL, y - sideH, mer);
    if (sides?.right) crenelOutline(ctx, x + S(t1), y, xR - x - S(t1), y - sideH, mer);
    ctx.rect(x - S(270), y - S(560), S(540), S(90));
    ctx.stroke();
  }, { bbox: bb });
  return { x, y, s, open: { x0: x - S(166), x1: x + S(166), y0: y - S(GATE.open.h), y1: y }, hinge: [x - S(166), x + S(166)], beamY: y - S(GATE.beam.y), bbox: bb, festoons: fest };
}

// One door leaf, inner face: tarred vertical planks, iron bands studded
// with bronze, a ring pull. Local frame: hinge at x = 0, bottom y = 0; the
// leaf runs toward +x (side 'left') or -x (side 'right').
function leafWood(g, side, ls) {
  const W = GATE.leafW, H = GATE.leafH, d = side === 'left' ? 1 : -1;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = d * (W * i) / n, b = d * (W * (i + 1)) / n, x0 = Math.min(a, b), w = Math.abs(b - a);
    const l = 0.5 + ((i * 7) % 5) * 0.025;
    g.fillStyle = L(l, 0.5); g.fillRect(x0, -H, w, H);
    g.fillStyle = L(ls > 0 ? 0.72 : 0.3, 0.5); g.fillRect(ls > 0 ? x0 + w - w * 0.12 : x0, -H, w * 0.12, H);   // lit plank edge
    g.fillStyle = L(0.06, 0.5); g.fillRect(ls > 0 ? x0 : x0 + w - 1.6, -H, 1.6, H);                           // joint
  }
  // cross battens and a diagonal brace (inner face)
  for (const yy of [-H * 0.86, -H * 0.5, -H * 0.14]) {
    g.fillStyle = L(0.62, 0); g.fillRect(d > 0 ? 0 : -W, yy - 16, W, 32);
    g.fillStyle = L(0.88, 0); g.fillRect(d > 0 ? 0 : -W, yy - 16, W, 5);
    g.fillStyle = L(0.12, 0); g.fillRect(d > 0 ? 0 : -W, yy + 13, W, 4);
  }
  // the brace's grain runs ALONG it on both leaves: aux1 0.25 = 45 deg follows
  // the left leaf's brace, 0.75 = 135 deg its mirror on the right one (with one
  // angle for both, the shader's grain lines crossed the right brace and printed
  // it as a ladder of rungs - the s06 judge's finding)
  g.fillStyle = L(0.56, d > 0 ? 0.25 : 0.75);
  g.beginPath(); g.moveTo(0, -H * 0.14 - 16); g.lineTo(d * W * 0.12, -H * 0.14 - 16); g.lineTo(d * W, -H * 0.5 + 16); g.lineTo(d * W * 0.88, -H * 0.5 + 16); g.closePath(); g.fill();
}
function leafIron(g, side, ls) {
  const W = GATE.leafW, H = GATE.leafH, d = side === 'left' ? 1 : -1;
  for (const yy of [-H * 0.86, -H * 0.5, -H * 0.14]) {
    g.fillStyle = L(0.35); g.fillRect(d > 0 ? 0 : -W, yy - 4, W, 8);
    for (let k = 0; k < 7; k++) {
      const sx = d * (W * (k + 0.5)) / 7;
      const gr = g.createRadialGradient(sx + 1.2 * ls, yy - 1.5, 0, sx, yy, 4.4);
      gr.addColorStop(0, L(1)); gr.addColorStop(1, L(0.25));
      g.fillStyle = gr; g.beginPath(); g.arc(sx, yy, 4.2, 0, Math.PI * 2); g.fill();
    }
  }
  // hinge straps and the ring pull near the meeting edge
  for (const yy of [-H * 0.86, -H * 0.14]) { g.fillStyle = L(0.5); g.fillRect(d > 0 ? 0 : -60, yy - 7, 60, 14); }
  // the ring pull at a man's hand height (GATE.ring: its centre), hung from a boss
  const R = GATE.ring, rx = d * (W - R.x), ry = -R.y;
  g.strokeStyle = L(0.85); g.lineWidth = R.r * 0.38; g.beginPath(); g.arc(rx, ry, R.r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = L(0.7); g.beginPath(); g.arc(rx, ry - R.r, R.r * 0.46, 0, Math.PI * 2); g.fill();
}

// Sprite of one leaf, anchor at the hinge foot. o: { side: 'left'|'right', maxScale, depth }
export function gateLeafSprite(o = {}) {
  const side = o.side ?? 'left', W = GATE.leafW, H = GATE.leafH, pad = 6;
  const w = W + pad * 2, h = H + pad * 2;
  const hx = side === 'left' ? pad : w - pad;
  return {
    w, h, ax: hx / w, ay: (h - pad) / h, depth: o.depth ?? 1, maxScale: o.maxScale ?? 1, res: o.res ?? 1,
    paint(p) {
      const ls = o.lightSide ?? (p.night ? 1 : -1);
      p.pass(p.mat.wood, (g) => { g.save(); g.translate(hx, h - pad); leafWood(g, side, ls); g.restore(); });
      p.pass(p.mat.metal, (g) => { g.save(); g.translate(hx, h - pad); leafIron(g, side, ls); g.restore(); });
    },
  };
}

// The bar: a squared timber with iron caps. Sprite anchor at its centre.
function beamGuide(g, ls) {
  const { w, h } = GATE.beam;
  g.fillStyle = L(0.6, 0); g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = L(0.9, 0); g.fillRect(-w / 2, -h / 2, w, h * 0.22);
  g.fillStyle = L(0.14, 0); g.fillRect(-w / 2, h / 2 - h * 0.16, w, h * 0.16);
}
function beamIron(g) {
  const { w, h } = GATE.beam;
  for (const k of [-1, 1]) {
    g.fillStyle = L(0.4); g.fillRect(k * w / 2 - (k > 0 ? 34 : 0), -h / 2 - 2, 34, h + 4);
    g.fillStyle = L(0.9); g.fillRect(k * w / 2 - (k > 0 ? 34 : 0), -h / 2 - 2, 34, 4);
  }
}
export function beamSprite(o = {}) {
  const { w, h } = GATE.beam, pad = 6;
  return {
    w: w + pad * 2, h: h + pad * 2, ax: 0.5, ay: 0.5, depth: o.depth ?? 1, maxScale: o.maxScale ?? 1, res: o.res ?? 1,
    paint(p) {
      const ls = o.lightSide ?? (p.night ? 1 : -1);
      p.pass(p.mat.wood, (g) => { g.save(); g.translate(w / 2 + pad, h / 2 + pad); beamGuide(g, ls); g.restore(); });
      p.pass(p.mat.metal, (g) => { g.save(); g.translate(w / 2 + pad, h / 2 + pad); beamIron(g); g.restore(); });
    },
  };
}

// Closed doors and the beam painted straight into a layer (for distant views).
export function paintGateDoors(p, o) {
  const s = o.s ?? 1, { x, y } = o;
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const bb = box(x - (GATE.leafW + 4) * s, y - (GATE.leafH + 4) * s, (GATE.leafW + 4) * 2 * s, (GATE.leafH + 8) * s, 4);
  const draw = (fn) => (g) => {
    for (const [side, hx] of [['left', -GATE.leafW], ['right', GATE.leafW]]) { g.save(); g.translate(x + hx * s, y); g.scale(s, s); fn(g, side, ls); g.restore(); }
  };
  p.pass(p.mat.wood, draw(leafWood), { bbox: bb });
  p.pass(p.mat.metal, draw(leafIron), { bbox: bb });
  if (o.beam !== false) {
    const by = y - GATE.beam.y * s;
    p.pass(p.mat.wood, (g) => { g.save(); g.translate(x, by); g.scale(s, s); beamGuide(g, ls); g.restore(); }, { bbox: box(x - 250 * s, by - 24 * s, 500 * s, 48 * s, 3) });
    p.pass(p.mat.metal, (g) => { g.save(); g.translate(x, by); g.scale(s, s); beamIron(g); g.restore(); }, { bbox: box(x - 250 * s, by - 24 * s, 500 * s, 48 * s, 3) });
  }
}

// Draw a leaf sprite swinging away from the viewer about its hinge, in
// vertical strips so the far edge shrinks in perspective.
// o: { x (hinge), y (ground), s, open 0..1 (0 shut, 1 = 90°), eye (horizon y), cx (vanishing x), dist }
export function drawGateLeaf(ctx, e, name, o) {
  const sp = e.sprites[name];
  if (!sp || !sp.canvas) return;
  const cv = sp.canvas, r = sp.region;
  const s = o.s ?? 1, th = (o.open ?? 0) * Math.PI / 2;
  const right = sp.ax > 0.5;                      // hinge on the sprite's right edge
  const pxPerUnit = cv.width / r.w;
  const hingeU = sp.ax * r.w;                     // hinge x inside the sprite (sprite units)
  const footV = sp.ay * r.h;
  const N = 24;
  const D = o.dist ?? 2000, eye = o.eye ?? o.y - 260 * s, cx = o.cx ?? o.x;
  const proj = (d) => { // d = distance from the hinge along the leaf (world units)
    const xw = o.x + (right ? -1 : 1) * d * Math.cos(th), z = d * Math.sin(th);
    const f = D / (D + z);
    return { x: cx + (xw - cx) * f, f };
  };
  for (let i = 0; i < N; i++) {
    const u0 = (right ? hingeU - (hingeU * i) / N : hingeU + ((r.w - hingeU) * i) / N);
    const u1 = (right ? hingeU - (hingeU * (i + 1)) / N : hingeU + ((r.w - hingeU) * (i + 1)) / N);
    const d0 = Math.abs(u0 - hingeU) * s, d1 = Math.abs(u1 - hingeU) * s;
    const a = proj(d0), b = proj(d1);
    const top = (fy) => eye + (o.y - footV * s - eye) * fy, bot = (fy) => eye + (o.y + (r.h - footV) * s - eye) * fy;
    const fm = (a.f + b.f) / 2;
    const sx0 = Math.min(u0, u1) * pxPerUnit, sw = Math.abs(u1 - u0) * pxPerUnit;
    const dx = Math.min(a.x, b.x), dw = Math.abs(b.x - a.x) + 0.6 / e.s;
    ctx.drawImage(cv, sx0, 0, sw, cv.height, dx, top(fm), dw, bot(fm) - top(fm));
  }
}
