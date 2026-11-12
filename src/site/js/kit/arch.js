// Architecture primitives in elevation (front-on) view, painted as guides
// for the `stone` material: ashlar walls, towers, fluted Doric columns,
// temple fronts with pediments, stairs and plain blocks. Light comes from
// the left by default (lightSide -1), as in the day prints.
//
// Every function records passes on the painter `p`; nothing draws directly.
// Coordinates are world units; y grows downward; `y` is the ground/base line.

import { L } from '../engine/bake.js';
import { RNG, makeNoise, clamp } from '../engine/rng.js';
import { poly, roughen, densify, bboxOf } from './geom.js';
import { C } from './palette.js';

const box = (x, y, w, h, pad = 3) => ({ x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad });

// Ashlar (squared block) wall. top: 'flat' | 'crenel' | 'ragged'.
export function ashlarWall(p, o) {
  const { x, y, w, h } = o; // y = base line, wall occupies [y - h, y]
  const rng = new RNG(o.seed ?? `wall${x},${y}`);
  const nz = makeNoise(rng.int(1, 1e6));
  const course = o.course ?? 16;
  const bw = o.blockW ?? [course * 1.4, course * 3.2];
  const base = o.light ?? 0.84;
  const top = y - h;
  const mer = o.top === 'crenel' ? (o.merlon ?? { w: course * 1.6, h: course * 1.4, gap: course * 1.1 }) : null;
  const yTop = top - (mer ? mer.h : 0);
  const bb = box(x, yTop, w, h + (mer ? mer.h : 0), 4);
  p.pass(o.mat ?? p.mat.stone, (g) => {
    g.save();
    // silhouette
    g.beginPath();
    if (o.top === 'ragged') {
      const edge = roughen(densify([[x, top], [x + w, top]], 6), nz, course * 0.6, 0.03);
      poly(g, [[x, y], ...edge, [x + w, y]]);
    } else g.rect(x, top, w, h);
    if (mer) for (let mx = x; mx < x + w - 2; mx += mer.w + mer.gap) g.rect(mx, top - mer.h, Math.min(mer.w, x + w - mx), mer.h + 0.5);
    g.clip();
    g.fillStyle = L(base); g.fillRect(bb.x, bb.y, bb.w, bb.h);
    // courses of blocks
    const joint = Math.max(p.px * 1.6, course * 0.07);
    for (let cy = y, row = 0; cy > yTop - course; cy -= course, row++) {
      let cx = x - (row % 2 ? rng.range(0, bw[0]) : 0);
      while (cx < x + w) {
        const bwid = rng.range(bw[0], bw[1]);
        const l = clamp(base + rng.range(-0.07, 0.05) + (o.weather ?? 0) * rng.range(-0.2, 0));
        g.fillStyle = L(l);
        g.fillRect(cx, cy - course, bwid, course);
        g.fillStyle = L(Math.max(0, l - 0.24)); // bed joint shadow under the block above
        g.fillRect(cx, cy - course, bwid, joint);
        g.fillStyle = L(Math.max(0, l - 0.2));
        g.fillRect(cx, cy - course, joint * 0.8, course);
        cx += bwid;
      }
    }
    if (o.shade) { // vertical falloff / side shadow
      g.globalCompositeOperation = 'source-atop';
      const sg = g.createLinearGradient(x, 0, x + w, 0);
      sg.addColorStop(0, `rgba(0,0,0,${o.shade[0]})`); sg.addColorStop(1, `rgba(0,0,0,${o.shade[1]})`);
      g.fillStyle = sg; g.fillRect(bb.x, bb.y, bb.w, bb.h);
    }
    o.guideExtra?.(g, p);
    g.restore();
  }, { bbox: bb });
  if (o.ink !== false) p.ink((ctx) => {
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(p.px * 1.2, course * 0.06);
    ctx.beginPath();
    if (mer) {
      ctx.moveTo(x, y); ctx.lineTo(x, top - mer.h);
      for (let mx = x; mx < x + w - 2; mx += mer.w + mer.gap) {
        const mw = Math.min(mer.w, x + w - mx);
        ctx.lineTo(mx, top - mer.h); ctx.lineTo(mx + mw, top - mer.h); ctx.lineTo(mx + mw, top);
        if (mx + mer.w + mer.gap < x + w - 2) { ctx.lineTo(mx + mer.w + mer.gap, top); ctx.lineTo(mx + mer.w + mer.gap, top - mer.h); }
      }
      ctx.lineTo(x + w, top); ctx.lineTo(x + w, y);
    } else if (o.top !== 'ragged') { ctx.rect(x, top, w, h); }
    ctx.stroke();
  }, { bbox: bb });   // inside the pass's padded box, so a layer of these can crop itself
  return { bbox: bb, top };
}

// A plain stone block / slab with an optional lit top face (seen from above).
export function block(p, o) {
  const { x, y, w, h } = o;
  const topFace = o.topFace ?? 0;
  const bb = box(x, y - h - topFace, w, h + topFace, 3);
  p.pass(o.mat ?? p.mat.stone, (g) => {
    g.fillStyle = L(o.light ?? 0.78); g.fillRect(x, y - h, w, h);
    if (topFace) { g.fillStyle = L(o.topLight ?? 0.95); g.fillRect(x, y - h - topFace, w, topFace); }
    if (o.sideShadow) { g.fillStyle = L(o.sideShadow); g.fillRect(x + w * (o.sideAt ?? 0.8), y - h, w * (1 - (o.sideAt ?? 0.8)), h); }
  }, { bbox: bb });
  return bb;
}

// Fluted Doric column. x = centre, y = base, h = height incl. capital, r = base radius.
export function column(p, o) {
  const { x, y, h, r } = o;
  const flutes = o.flutes ?? 20;
  const ent = o.entasis ?? 0.18;     // top radius shrink (fraction)
  const lightSide = o.lightSide ?? -1;
  const capH = o.capital === false ? 0 : r * 0.9;
  const shaftTop = y - h + capH;
  const bb = box(x - r * 1.5, y - h, r * 3, h, 3);
  const amb = o.ambient ?? 0.22;
  p.pass(o.mat ?? p.mat.stone, (g) => {
    // shaft built as vertical flute strips across the visible half
    const N = Math.round(flutes / 2);
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + (i / N) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / N) * Math.PI;
      const am = (a0 + a1) / 2;
      // light from the side: lambert on the cylinder normal
      const lam = clamp(Math.cos(am - lightSide * 0.9) * 0.85 + amb);
      const xs = (a) => Math.sin(a);
      const pts = [
        [x + xs(a0) * r, y], [x + xs(a1) * r, y],
        [x + xs(a1) * r * (1 - ent), shaftTop], [x + xs(a0) * r * (1 - ent), shaftTop],
      ];
      g.fillStyle = L(lam); g.beginPath(); poly(g, pts); g.fill();
      // concave flute: darker edge strip on the side away from the light
      const fe = lightSide < 0 ? a1 : a0;
      const fw = (a1 - a0) * 0.32 * (lightSide < 0 ? -1 : 1);
      const ptsE = [
        [x + xs(fe) * r, y], [x + xs(fe + fw) * r, y],
        [x + xs(fe + fw) * r * (1 - ent), shaftTop], [x + xs(fe) * r * (1 - ent), shaftTop],
      ];
      g.fillStyle = L(clamp(lam - 0.28)); g.beginPath(); poly(g, ptsE); g.fill();
    }
    if (capH) {
      const rt = r * (1 - ent);
      // echinus (cushion) and abacus (slab)
      g.fillStyle = L(0.86);
      g.beginPath();
      g.moveTo(x - rt, shaftTop); g.quadraticCurveTo(x - r * 1.35, shaftTop - capH * 0.35, x - r * 1.3, shaftTop - capH * 0.62);
      g.lineTo(x + r * 1.3, shaftTop - capH * 0.62); g.quadraticCurveTo(x + r * 1.35, shaftTop - capH * 0.35, x + rt, shaftTop);
      g.closePath(); g.fill();
      g.fillStyle = L(0.42); // underside shade of the echinus
      g.beginPath(); g.moveTo(x - rt, shaftTop); g.quadraticCurveTo(x - r * 1.2, shaftTop - capH * 0.2, x - r * 1.28, shaftTop - capH * 0.4);
      g.lineTo(x - r * 0.4, shaftTop - capH * 0.22); g.closePath(); g.fill();
      g.fillStyle = L(0.9); g.fillRect(x - r * 1.38, y - h, r * 2.76, capH * 0.38);
      g.fillStyle = L(0.5); g.fillRect(x - r * 1.38, y - h + capH * 0.34, r * 2.76, capH * 0.06);
    }
  }, { bbox: bb });
  if (o.ink !== false) p.ink((ctx) => {
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(p.px * 1.1, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x - r * (1 - ent), shaftTop);
    ctx.moveTo(x + r, y); ctx.lineTo(x + r * (1 - ent), shaftTop);
    ctx.stroke();
  }, { bbox: bb });
  return bb;
}

// Doric temple front: steps, columns, entablature with triglyphs, pediment.
// x = centre, y = ground line, w = stylobate width, colH = column height.
export function templeFront(p, o) {
  const { x, y, w, colH } = o;
  const n = o.columns ?? 6;
  const steps = o.steps ?? 3;
  const stepH = o.stepH ?? colH * 0.045;
  const stepIn = o.stepIn ?? stepH * 0.9;
  const sty = y - steps * stepH;               // stylobate top
  const innerW = w - 2 * steps * stepIn;
  const r = o.r ?? innerW / (n * 4.4);
  const span = innerW - 2 * r * 1.4;
  const archH = colH * 0.11, friezeH = colH * 0.13, cornH = colH * 0.05;
  const entTop = sty - colH - archH - friezeH - cornH;
  const pedH = o.pediment === false ? 0 : (innerW + r * 1.2) * (o.pedSlope ?? 0.12);
  const bb = box(x - w / 2, entTop - pedH, w, y - entTop + pedH, 6);
  const mat = o.mat ?? p.mat.stone;
  // dark interior (cella wall in shadow) between the columns
  p.pass(mat, (g) => {
    g.fillStyle = L(o.interior ?? 0.04);
    g.fillRect(x - innerW / 2 + r, sty - colH, innerW - 2 * r, colH);
    if (o.door) { g.fillStyle = L(0.0); g.fillRect(x - o.door.w / 2, sty - o.door.h, o.door.w, o.door.h); }
  }, { bbox: bb });
  o.inside?.(p, { x, sty, colH, innerW, r });
  // steps (crepidoma): top faces lit, risers in half shade
  p.pass(mat, (g) => {
    for (let i = 0; i < steps; i++) {
      const sw = w - 2 * i * stepIn;
      const yy = y - i * stepH;
      g.fillStyle = L(0.62 + i * 0.03); g.fillRect(x - sw / 2, yy - stepH, sw, stepH);
      g.fillStyle = L(0.95); g.fillRect(x - sw / 2, yy - stepH, sw, stepH * 0.18);
    }
  }, { bbox: bb });
  for (let i = 0; i < n; i++) {
    const cx = x - span / 2 + (span * i) / (n - 1);
    column(p, { x: cx, y: sty, h: colH, r, flutes: o.flutes ?? 20, lightSide: o.lightSide ?? -1, mat, ink: o.ink });
  }
  // entablature
  p.pass(mat, (g) => {
    const ew = innerW + r * 1.2, ex = x - ew / 2;
    const yA = sty - colH;
    g.fillStyle = L(0.8); g.fillRect(ex, yA - archH, ew, archH);                 // architrave
    g.fillStyle = L(0.35); g.fillRect(ex, yA - archH * 0.16, ew, archH * 0.16);   // its soffit shadow
    const yF = yA - archH;
    g.fillStyle = L(0.88); g.fillRect(ex, yF - friezeH, ew, friezeH);            // frieze
    const nt = (n - 1) * 2 + 1;
    const tw = friezeH * 0.62;
    for (let i = 0; i <= nt; i++) {                                              // triglyphs
      const tx = ex + (ew - tw) * (i / nt);
      g.fillStyle = L(0.6); g.fillRect(tx, yF - friezeH, tw, friezeH);
      g.fillStyle = L(0.25);
      g.fillRect(tx + tw * 0.22, yF - friezeH * 0.92, tw * 0.13, friezeH * 0.86);
      g.fillRect(tx + tw * 0.62, yF - friezeH * 0.92, tw * 0.13, friezeH * 0.86);
    }
    const yC = yF - friezeH;
    g.fillStyle = L(0.95); g.fillRect(ex - r * 0.35, yC - cornH, ew + r * 0.7, cornH);  // cornice
    g.fillStyle = L(0.2); g.fillRect(ex - r * 0.35, yC - cornH * 0.25, ew + r * 0.7, cornH * 0.25);
    if (pedH) {
      const pw = ew + r * 0.7, px0 = x - pw / 2, yb = yC - cornH;
      g.fillStyle = L(0.9);
      g.beginPath(); g.moveTo(px0, yb); g.lineTo(x, yb - pedH); g.lineTo(px0 + pw, yb); g.closePath(); g.fill();
      g.fillStyle = L(0.55); // recessed tympanum
      const inset = cornH * 1.2;
      g.beginPath(); g.moveTo(px0 + inset * 2.4, yb - inset * 0.25); g.lineTo(x, yb - pedH + inset * 1.1); g.lineTo(px0 + pw - inset * 2.4, yb - inset * 0.25); g.closePath(); g.fill();
      o.tympanum?.(g, { x, yb, pedH, pw, inset });
    }
  }, { bbox: bb });
  if (o.ink !== false) p.ink((ctx) => {
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(p.px * 1.2, colH * 0.006);
    const ew = innerW + r * 1.2;
    const yC = sty - colH - archH - friezeH;
    ctx.beginPath();
    ctx.rect(x - ew / 2, yC, ew, archH + friezeH);
    if (pedH) { const pw = ew + r * 0.7; ctx.moveTo(x - pw / 2, yC - cornH); ctx.lineTo(x, yC - cornH - pedH); ctx.lineTo(x + pw / 2, yC - cornH); }
    ctx.stroke();
  }, { bbox: bb });
  return { bbox: bb, sty, entTop, pedTop: entTop - pedH, r, innerW };
}

// Frontal flight of stairs seen from slightly above: lit treads, shaded risers.
export function stairsFront(p, o) {
  const { x, y, w, steps } = o; // x = left, y = bottom
  const rise = o.rise ?? 8, tread = o.tread ?? rise * 0.55;
  const taper = o.taper ?? 0; // each step narrower by 2*taper
  const bb = box(x - 2, y - steps * (rise + tread), w + 4, steps * (rise + tread), 4);
  p.pass(o.mat ?? p.mat.stone, (g) => {
    for (let i = 0; i < steps; i++) {
      const yy = y - i * (rise + tread);
      const xi = x + i * taper, wi = w - 2 * i * taper;
      g.fillStyle = L(o.riser ?? 0.55); g.fillRect(xi, yy - rise, wi, rise);
      g.fillStyle = L(o.treadL ?? 0.93); g.fillRect(xi, yy - rise - tread, wi, tread);
    }
  }, { bbox: bb });
  return bb;
}

// Stair flight climbing in side view, from (x0, y0) bottom to (x1, y1) top.
// Shows lit treads and risers in shade, plus the stringer face below.
export function stairsSide(p, o) {
  const { x0, y0, x1, y1, steps } = o;
  const dx = (x1 - x0) / steps, dy = (y1 - y0) / steps;
  const thick = o.thick ?? Math.abs(dy) * 1.5;
  const pts = [[x0, y0]];
  for (let i = 0; i < steps; i++) {
    pts.push([x0 + dx * i, y0 + dy * (i + 1)]);
    pts.push([x0 + dx * (i + 1), y0 + dy * (i + 1)]);
  }
  const under = [[x1, y1 + thick], [x0, y0 + thick]];
  const all = [...pts, ...under];
  const bb = bboxOf(all, 4);
  p.pass(o.mat ?? p.mat.stone, (g) => {
    g.fillStyle = L(o.face ?? 0.62); g.beginPath(); poly(g, all); g.fill();
    for (let i = 0; i < steps; i++) {
      const xa = x0 + dx * i, ya = y0 + dy * (i + 1);
      g.fillStyle = L(o.treadL ?? 0.95);
      g.fillRect(Math.min(xa, xa + dx), ya, Math.abs(dx), Math.abs(dy) * 0.22);
      g.fillStyle = L(o.riser ?? 0.38);
      g.fillRect(dx > 0 ? xa - Math.abs(dx) * 0.06 : xa, ya, Math.abs(dx) * 0.06, -dy);
    }
  }, { bbox: bb });
  return bb;
}

// Square tower with batter, slit windows and crenellation.
export function tower(p, o) {
  const { x, y, w, h } = o; // x = left, y = base
  const r = ashlarWall(p, { ...o, x, y, w, h, top: o.top ?? 'crenel', course: o.course ?? 14, shade: o.shade ?? [0, 0.18] });
  if (o.windows) {
    const rng = new RNG(o.seed ?? `tw${x}`);
    const bb = r.bbox;
    p.pass(o.mat ?? p.mat.stone, (g) => {
      for (let i = 0; i < o.windows; i++) {
        const wx = x + w * (0.25 + 0.5 * ((i % 2) ? 0.75 : 0.25)), wy = y - h * (0.3 + 0.55 * (i / o.windows)) + rng.range(-4, 4);
        g.fillStyle = L(0.02); g.fillRect(wx - w * 0.035, wy - w * 0.18, w * 0.07, w * 0.18);
      }
    }, { bbox: bb });
  }
  return r;
}
