// The wooden horse: a giant archaic-Greek horse built of tarred ship planks,
// side view facing right (+x). Rigid stance on a wheeled platform, a comb
// mane of upright boards, a carved ship's eye, ivory rope lashings, bronze
// hooves and fittings, a hatch in the belly and a pale dedication board on
// the platform. Red Trojan garlands are the accent.
//
// Everything is painted as guides for the shared materials (`wood`, a rope
// variant of `linen`, `bronze`, `red`) so it follows p.mat into the night
// ramps. Geometry lives in a local frame: origin on the ground under the
// middle of the platform, x toward the head, y down (the horse is at y < 0).
// Detail drops with on-screen size (LOD) so it still reads ~60 units tall.

import { L } from '../engine/bake.js';
import { RNG, clamp, lerp } from '../engine/rng.js';
import { poly, spline, brush, circle } from '../kit/geom.js';
import { C, mat } from '../kit/palette.js';

const W = 840, H = 880, OX = W / 2;     // sprite box; local origin at (OX, H)

// ------------------------------------------------------------- local layout
const DECK = -172;                      // top of the platform deck (hooves stand here)
const BEAM = [-164, -94];               // platform side beam
const BOARD = { x0: -292, x1: 292, y0: -158, y1: -110 };
const WHEEL_R = 46;
const WHEELS = [-234, 0, 234];
const HATCH = { x0: -74, x1: 18, y0: -478, y1: -430 };   // hatch in the lower flank (opening); the door drops open on a bottom hinge
const EYE = [324, -758];

export const HORSE = {
  w: W, h: H,
  hatch: {
    x: OX + HATCH.x0, y: H + HATCH.y0, w: HATCH.x1 - HATCH.x0, h: HATCH.y1 - HATCH.y0,
    hinge: { x: OX + (HATCH.x0 + HATCH.x1) / 2, y: H + HATCH.y1 }, // centre of the bottom hinge line
    rope: { x: OX + (HATCH.x0 + HATCH.x1) / 2, y: H + HATCH.y1 - 4 }, // where a rope drops from (the sill)
  },
  deck: H + DECK,                                                // y of the platform deck top
  board: { x: OX + BOARD.x0, y: H + BOARD.y0, w: BOARD.x1 - BOARD.x0, h: BOARD.y1 - BOARD.y0 },
  wheels: WHEELS.map((x) => ({ x: OX + x, y: H - WHEEL_R, r: WHEEL_R })),
  tow: { x: OX + 338, y: H - 128 },                              // tow ring at the front of the platform
  eye: { x: OX + EYE[0], y: H + EYE[1] },
  head: { x: OX + 360, y: H - 720 },
  text: 'TO ATHENA · SEE YOU AT DVT345',
};

// ------------------------------------------------------------- helpers
const qb = (a, b, c, n = 18) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
  }
  return out;
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const fill = (g, pts, l, a1 = 0) => { g.fillStyle = L(clamp(l), a1); g.beginPath(); poly(g, pts); g.fill(); };
const band = (a, b) => [...a, ...b.slice().reverse()];   // area between two polylines
function at(curve, t) {
  const f = clamp(t) * (curve.length - 1), i = Math.min(curve.length - 2, Math.floor(f));
  return mix(curve[i], curve[i + 1], f - i);
}
function tangent(curve, t) {
  const a = at(curve, Math.max(0, t - 0.02)), b = at(curve, Math.min(1, t + 0.02));
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}
// Left or right edge x of a leg at height y.
function edgeX(edge, y) {
  for (let i = 0; i < edge.length - 1; i++) {
    const [x0, y0] = edge[i], [x1, y1] = edge[i + 1];
    if (y >= y0 && y <= y1) return lerp(x0, x1, (y - y0) / (y1 - y0 || 1));
  }
  return y < edge[0][1] ? edge[0][0] : edge[edge.length - 1][0];
}

// Body barrel: back and belly lines (the strakes follow both) and outline.
const backY = (x) => -592 - 8 * Math.pow((x + 70) / 165, 2);
const bellyY = (x) => -418 - 0.0005 * Math.pow(x - 40, 2);
const BODY = spline([
  [-236, -601], [-120, -592], [0, -590], [90, -602], [200, -562], [238, -510], [228, -462],
  [172, -430], [60, -418], [-60, -421], [-170, -442], [-262, -472], [-312, -508], [-320, -556], [-292, -594],
], 6, true);

// Neck: crest (back edge) and throat (front edge), both from the base up.
const CREST = qb([56, -604], [160, -786], [264, -818]);
const THROAT = qb([228, -520], [254, -628], [298, -708]);
// Head: forehead/nose line and jaw line, both from the poll end toward the muzzle.
const FORE = spline([[262, -816], [300, -810], [344, -766], [384, -704], [410, -652]], 5);
const JAW = spline([[298, -706], [304, -672], [324, -650], [354, -628], [392, -604]], 5);
const MUZZLE = [[412, -636], [412, -614], [404, -600]];   // squared end; stays inside the sprite box (x <= OX - 8) with its ink

// Legs as left/right edge polylines (top → bottom). Far legs are shifted copies.
const FORELEG = {
  l: [[150, -470], [157, -392], [162, -334], [165, -314], [168, -294], [168, -214]],
  r: [[220, -470], [208, -392], [201, -336], [206, -314], [199, -294], [199, -214]],
  knee: -316, fet: -232,
};
const HINDLEG = {
  l: [[-320, -506], [-306, -432], [-282, -374], [-260, -342], [-247, -320], [-246, -214]],
  r: [[-182, -452], [-190, -402], [-204, -362], [-213, -338], [-212, -292], [-212, -214]],
  knee: -340, fet: -232,
};
const shiftLeg = (leg, dx) => ({ ...leg, l: leg.l.map(([x, y]) => [x + dx, y]), r: leg.r.map(([x, y]) => [x + dx, y]) });
const FAR_FORE = shiftLeg(FORELEG, -36), FAR_HIND = shiftLeg(HINDLEG, 32);

// Mane: a comb of upright boards along the crest, set in a slot below it.
function maneBoards() {
  const rng = new RNG('mane');
  const n = 13, out = [];
  for (let i = 0; i < n; i++) {
    const t0 = 0.05 + (0.93 * i) / n, t1 = t0 + (0.93 / n) * 0.82;
    const tm = (t0 + t1) / 2;
    const [tx, ty] = tangent(CREST, tm);
    const nx = ty, ny = -tx; // outward normal (up / back)
    const hgt = 18 + 50 * Math.pow(Math.sin(Math.PI * Math.min(1, tm * 1.12)), 0.7) + rng.range(-4, 4);
    const lean = rng.range(-0.08, 0.06);
    const a = at(CREST, t0), b = at(CREST, t1);
    const ux = nx + tx * lean, uy = ny + ty * lean;
    const inset = 10;
    out.push({
      pts: [
        [a[0] - nx * inset, a[1] - ny * inset], [b[0] - nx * inset, b[1] - ny * inset],
        [b[0] + ux * hgt, b[1] + uy * hgt], [a[0] + ux * (hgt + 4), a[1] + uy * (hgt + 4)],
      ],
      i,
    });
  }
  // forelock: two short boards between the ears, pointing forward
  out.push({ pts: [[268, -812], [286, -816], [306, -842], [292, -846]], i: 1 });
  out.push({ pts: [[284, -814], [300, -812], [322, -834], [310, -842]], i: 0 });
  return out;
}
const MANE = maneBoards();

// --------------------------------------------------------------- materials
function lodOf(p, s, o) {
  if (o.lod && o.lod !== 'auto') return o.lod;
  const ppu = s * p.k; // device px per horse unit
  return ppu < 0.22 ? 'tiny' : ppu < 0.55 ? 'mid' : 'full';
}
function mats(p, s, lod) {
  const M = p.mat;
  const ns = (v) => Math.max(v * s, 2.2 * p.px);
  const wood = mat(M.wood, {
    noise: { scale: ns(6), vScale: ns(8) },
    extra2: [lod === 'tiny' ? 0.1 : lod === 'mid' ? 0.22 : 0.3, 0, 0, 0],
    speck: { dark: 0.015, size: 1.0 },
    outline: { ...M.wood.outline, crease: lod === 'tiny' ? 0 : M.wood.outline.crease },
  });
  const rope = mat(M.linen, {
    hatch: undefined, noise: { scale: ns(10), amp: 0.02 },
    outline: { width: 0.9, sil: 0.9, crease: lod === 'full' ? 0.6 : 0, creaseThr: 0.22 },
  });
  const bronze = mat(M.bronze, { noise: { scale: ns(12), vScale: ns(6) } });
  const red = mat(M.red, { noise: { scale: ns(18) } });
  return { wood, rope, bronze, red };
}

// ------------------------------------------------------------ the painting
// Records the horse's passes on p. ox, oy: ground under the platform centre
// in p's world units; s: scale (1 = sprite units).
function paint(p, ox, oy, s, o = {}) {
  const lod = lodOf(p, s, o);
  const full = lod === 'full', tiny = lod === 'tiny';
  // a big horse (over ~1.6 device px per horse unit: the sprites, s06's
  // close-up) paints as several small bboxed passes per material, so no
  // single guide is a whole-horse canvas; smaller ones keep one pass each
  const split = full && s * p.k > 1.6;
  const m = mats(p, s, lod);
  const hatch = o.hatch ?? 'closed';
  const garlands = o.garlands ?? true;
  const wheels = o.wheels ?? true;
  const u = p.px / s; // one device pixel in local units
  const rng = new RNG(o.seed ?? 'horse');
  const joints = []; // plank butt joints, filled by the body guide, nailed by the bronze pass
  const box = (x0, y0, x1, y1) => ({ x: ox + x0 * s, y: oy + y0 * s, w: (x1 - x0) * s, h: (y1 - y0) * s });
  const local = (g) => { g.save(); g.translate(ox, oy); g.scale(s, s); };
  const gap = (g, pts, w = 1.6, l = 0.03) => {
    g.strokeStyle = L(l, 0); g.lineWidth = Math.max(u * 1.1, w); g.lineCap = 'butt';
    g.beginPath(); poly(g, pts, false); g.stroke();
  };

  // ---------------- platform and wheels (wood)
  p.pass(m.wood, (g) => {
    local(g);
    g.fillStyle = L(0.02); g.fillRect(-318, -6, 650, 6);                                     // contact shadow
    fill(g, [[-312, BEAM[1]], [312, BEAM[1]], [300, BEAM[1] + 16], [-300, BEAM[1] + 16]], 0.06); // axle beds
    if (wheels) for (const wx of WHEELS) wheel(g, wx, -WHEEL_R, WHEEL_R, 0, tiny, u);
    fill(g, [[-326, BEAM[0]], [326, BEAM[0]], [326, -129], [-326, -129]], 0.4);             // two timbers
    fill(g, [[-326, -129], [326, -129], [326, BEAM[1]], [-326, BEAM[1]]], 0.3);
    fill(g, [[-332, DECK], [332, DECK], [328, BEAM[0]], [-328, BEAM[0]]], 0.88);             // sunlit deck lip
    fill(g, [[-326, BEAM[0]], [326, BEAM[0]], [326, BEAM[0] + 4], [-326, BEAM[0] + 4]], 0.12); // its shadow
    fill(g, [[-332, BEAM[0]], [-310, BEAM[0]], [-310, BEAM[1]], [-332, BEAM[1]]], 0.56, 0.5); // beam ends
    fill(g, [[310, BEAM[0]], [332, BEAM[0]], [332, BEAM[1]], [310, BEAM[1]]], 0.34, 0.5);
    if (!tiny) {
      gap(g, [[-326, -129], [326, -129]], 1.4);
      for (const x of [-310, 310]) gap(g, [[x, BEAM[0]], [x, BEAM[1]]], 1.4);
    }
    if (o.board !== false) { // the dedication board: pale wood, dark frame, lit top edge
      const b = BOARD;
      fill(g, [[b.x0 - 3, b.y0 - 3], [b.x1 + 3, b.y0 - 3], [b.x1 + 3, b.y1 + 4], [b.x0 - 3, b.y1 + 4]], 0.05);
      fill(g, [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], 0.93, 0.02);
      if (!tiny) fill(g, [[b.x0, b.y1 - 4], [b.x1, b.y1 - 4], [b.x1, b.y1], [b.x0, b.y1]], 0.74, 0.02);
    }
    g.restore();
  }, { bbox: box(-336, DECK - 4, 350, 2) });

  // ---------------- the horse (wood): far legs, tail, mane, body, neck, head, near legs
  // At full detail as four bboxed passes in drawing order (far legs and tail;
  // far ear and mane; barrel, near legs and hatch; neck, head and near ear),
  // so no single guide is a whole-horse canvas. For the baked sprite each is
  // a generator resumed between parts; for paintHorse the draws run straight
  // through (its painters may be proxies that do not drain generators).
  const parts = {
    back(g) { leg(g, FAR_FORE, -0.2, tiny, u); leg(g, FAR_HIND, -0.2, tiny, u); tail(g, tiny); },
    mane(g) {
      fill(g, [[248, -806], [270, -812], [258, -866]], 0.28, 0.5);                          // far ear
      for (const mb of MANE) {                                                             // mane boards
        fill(g, mb.pts, mb.i % 2 ? 0.34 : 0.46, 0.5);
        if (!tiny) {
          const [a, b, c, d] = mb.pts;
          fill(g, [a, mix(a, b, 0.24), mix(d, c, 0.24), d], 0.86, 0.5);                     // lit left edge
          gap(g, [c, d], 1.6, 0.92);                                                         // lit top
        }
      }
    },
    *body(g) {
      yield* body(g, tiny, u, rng, joints);
      leg(g, FORELEG, 0, tiny, u);
      leg(g, HINDLEG, 0, tiny, u);
      const { x0: hx0, x1: hx1, y0: hy0, y1: hy1 } = HATCH;
      if (hatch === 'open' || hatch === 'hole') {
        fill(g, [[hx0 - 3, hy0 - 3], [hx1 + 3, hy0 - 3], [hx1 + 3, hy1 + 2], [hx0 - 3, hy1 + 2]], 0.04);
        fill(g, [[hx0, hy0], [hx1, hy0], [hx1, hy1], [hx0, hy1]], 0.0);                     // the hole
        if (!tiny) {
          fill(g, [[hx0, hy1 - 5], [hx1, hy1 - 5], [hx1, hy1], [hx0, hy1]], 0.8);           // lit sill (hull thickness)
          fill(g, [[hx1 - 5, hy0], [hx1, hy0], [hx1, hy1 - 5], [hx1 - 5, hy1 - 5]], 0.42); // far jamb
        }
        if (hatch === 'open') hatchDoor(g, 'inner', tiny, u);
      } else if (!tiny) {                                                                   // closed: a hidden seam
        gap(g, [[hx0, hy1], [hx0, hy0], [hx1, hy0], [hx1, hy1]], 2.2, 0.02);
        fill(g, [[hx0 + 2, hy0 + 2], [hx1 - 2, hy0 + 2], [hx1 - 2, hy0 + 5], [hx0 + 2, hy0 + 5]], 0.66);
      }
    },
    head(g) {
      neck(g, tiny, u);
      head(g, tiny, u);
      fill(g, [[264, -810], [292, -816], [286, -874]], 0.56, 0.5);                          // near ear
      if (!tiny) fill(g, [[270, -812], [282, -815], [284, -862]], 0.2, 0.5);
    },
  };
  const woodPass = (fns, bb) => {
    function* draw(g) {
      local(g);
      for (const f of fns) { const it = f(g); if (it && typeof it.next === 'function') yield* it; yield; }
      g.restore();
    }
    p.pass(m.wood, o.gen ? draw : (g) => { const it = draw(g); while (!it.next().done); }, { bbox: bb });
  };
  if (split) {
    woodPass([parts.back], box(-374, -610, 194, -204));
    woodPass([parts.mane], box(36, -886, 336, -584));
    woodPass([parts.body], box(-328, -610, 246, -204));
    woodPass([parts.head], box(50, -880, 420, -514));
  } else {
    woodPass([parts.back, parts.mane, parts.body, parts.head], box(-372, -882, 424, DECK + 2));
  }

  // ---------------- ivory rope lashings: at full detail each lashing is laid
  // in turns of rope, and each group is its own small bboxed pass (one rope
  // pass over the whole horse was a 5 Mpx guide in a 1440x900@2 sprite)
  const R = (g, p0, p1, w, l, bow) => rope(g, p0, p1, w, l, full, bow);
  const legRopes = (g, leg) => {
    for (const [y, w] of [[leg.knee, 11], [leg.fet, 9], ...(tiny ? [] : [[leg === FORELEG ? -446 : -470, 12]])]) {
      R(g, [edgeX(leg.l, y) - 4, y], [edgeX(leg.r, y) + 4, y], w, 0.9, 0.08);
    }
  };
  const girth = (g, gx) => R(g, [gx, backY(gx) + 2], [gx + 3, bellyY(gx) - 1], 12, 0.8, 0);
  const neckRopes = (g) => { for (const t of (tiny ? [0.5] : [0.36, 0.68])) R(g, at(CREST, t), at(THROAT, t), 11, 0.86, 0.04); };
  const tailRope = (g) => R(g, [-316, -572], [-284, -592], 11, 0.8, 0.05);
  const ropePass = (draw, bb) => p.pass(m.rope, (g) => { local(g); draw(g); g.restore(); }, { bbox: bb });
  if (split) {
    ropePass((g) => legRopes(g, FORELEG), box(138, -462, 232, -218));
    ropePass((g) => legRopes(g, HINDLEG), box(-332, -488, -170, -218));
    ropePass((g) => girth(g, 104), box(94, -608, 118, -414));
    ropePass((g) => girth(g, -166), box(-176, -604, -152, -430));
    ropePass(neckRopes, box(96, -808, 304, -556));
    ropePass(tailRope, box(-328, -606, -272, -558));
  } else {
    ropePass((g) => {
      legRopes(g, FORELEG); legRopes(g, HINDLEG);
      if (!tiny) { girth(g, 104); girth(g, -166); tailRope(g); }
      neckRopes(g);
    }, box(-340, -820, 330, -200));
  }

  // ---------------- bronze: hooves, bridle, studs, hubs, corner plates, tow ring
  // (at full detail as three bboxed passes: the bridle, the nails on the
  // barrel and the hatch, and the hooves, platform plates and hubs)
  const disc = (g, x, y, r, l0 = 0.95, l1 = 0.3) => {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x, y, r * 1.1);
    gr.addColorStop(0, L(l0)); gr.addColorStop(0.55, L((l0 + l1) / 2 + 0.05)); gr.addColorStop(1, L(l1));
    g.fillStyle = gr; g.beginPath(); circle(g, x, y, r); g.fill();
  };
  const bridle = (g) => {
    disc(g, 306, -700, 14);                                                                // cheek disc
    g.fillStyle = L(0.22); g.beginPath(); circle(g, 306, -700, 6.5); g.fill();
    disc(g, 306, -700, 3.6, 0.95, 0.6);
    const nb0 = at(FORE, 0.8), nb1 = at(JAW, 0.84);                                        // noseband
    fill(g, [nb0, at(FORE, 0.86), at(JAW, 0.9), nb1], 0.7);
    g.strokeStyle = L(0.6); g.lineWidth = 4.5; g.lineCap = 'round';                        // cheek straps
    g.beginPath(); g.moveTo(276, -806); g.lineTo(302, -714); g.moveTo(314, -688); g.lineTo(at(FORE, 0.82)[0] - 8, at(FORE, 0.82)[1] + 12); g.stroke();
  };
  const nails = (g) => {
    g.save(); g.beginPath(); poly(g, BODY); g.clip();                                        // plank nails
    for (const [x, y0, y1] of joints) {
      if (x > 200) continue; // the neck covers the chest
      for (const y of [y0 + (y1 - y0) * 0.32, y0 + (y1 - y0) * 0.7]) { disc(g, x - 4, y, 2.1, 0.9, 0.4); disc(g, x + 4, y, 2.1, 0.9, 0.4); }
    }
    g.restore();
    if (hatch === 'closed') {                                                                // hatch ring and hinge knuckles
      disc(g, (HATCH.x0 + HATCH.x1) / 2, HATCH.y0 + 12, 4, 0.9, 0.35);
      for (const x of [HATCH.x0 + 16, HATCH.x1 - 22]) fill(g, [[x, HATCH.y1 - 3], [x + 8, HATCH.y1 - 3], [x + 8, HATCH.y1 + 2], [x, HATCH.y1 + 2]], 0.7);
    } else if (hatch === 'open') hingeStraps(g, 'inner');
  };
  const low = (g) => {
    for (const [leg, k] of [[FAR_FORE, 0.6], [FAR_HIND, 0.6], [FORELEG, 1], [HINDLEG, 1]]) {     // hooves
      const x0 = edgeX(leg.l, -214), x1 = edgeX(leg.r, -214);
      fill(g, [[x0 - 2, -214], [x1 + 2, -214], [x1 + 7, DECK], [x0 - 7, DECK]], 0.36 * k);
      fill(g, [[x0 - 2, -214], [x1 + 2, -214], [x1 + 3, -207], [x0 - 3, -207]], 0.9 * k);     // lit rim
      if (!tiny) fill(g, [[x0 - 4, -200], [x0 + 5, -200], [x0 + 1, DECK], [x0 - 7, DECK]], 0.7 * k);
    }
    if (!tiny) {
      for (const x of [-320, 320]) for (const y of [-152, -104]) disc(g, x, y, 4.2, 0.95, 0.35);  // corner plates
      for (let x = -282; x <= 282; x += 24) disc(g, x, -101, 2.6, 0.9, 0.35);                     // beam studs
      for (const [x, y] of [[BOARD.x0 + 8, BOARD.y0 + 8], [BOARD.x1 - 8, BOARD.y0 + 8], [BOARD.x0 + 8, BOARD.y1 - 8], [BOARD.x1 - 8, BOARD.y1 - 8]]) disc(g, x, y, 3.4, 0.95, 0.4);
      g.strokeStyle = L(0.75); g.lineWidth = 3.5;                                             // tow ring
      g.beginPath(); g.arc(HORSE.tow.x - OX, HORSE.tow.y - H, 8, 0, Math.PI * 2); g.stroke();
    }
    if (wheels) for (const wx of WHEELS) {                                                    // hub caps
      disc(g, wx, -WHEEL_R, tiny ? 9 : 11, 0.95, 0.3);
      if (!tiny) { g.fillStyle = L(0.18); g.beginPath(); circle(g, wx, -WHEEL_R, 3.5); g.fill(); }
    }
  };
  const bronzePass = (draw, bb) => p.pass(m.bronze, (g) => { local(g); draw(g); g.restore(); }, { bbox: bb });
  if (split) {
    bronzePass(bridle, box(262, -816, 422, -596));
    bronzePass(nails, box(-334, -606, 204, -414));
    bronzePass(low, box(-340, -218, 360, 2));
  } else {
    bronzePass((g) => { low(g); if (!tiny) { bridle(g); nails(g); } }, box(-340, -820, 360, 2));
  }

  // ---------------- red ribbons left by the Trojans
  if (garlands) p.pass(m.red, (g) => {
    local(g);
    const t = 0.16;
    const a = at(CREST, t), b = at(THROAT, t);
    const [tx, ty] = tangent(THROAT, t);
    // a broad fillet round the neck base, lit along its upper edge
    const w = tiny ? 18 : 15;
    const q = (pt, d) => [pt[0] + tx * d, pt[1] + ty * d];
    fill(g, [q(a, -w / 2), q(b, -w / 2), q(b, w / 2), q(a, w / 2)], 0.62);
    if (!tiny) {
      fill(g, [q(a, -w / 2), q(b, -w / 2), q(b, -w / 2 + 4), q(a, -w / 2 + 4)], 0.92);
      fill(g, [q(a, w / 2 - 4), q(b, w / 2 - 4), q(b, w / 2), q(a, w / 2)], 0.3);
      // knot at the throat and two long streamers falling down the chest
      const k = q(b, 0);
      g.fillStyle = L(0.74); g.beginPath(); g.ellipse(k[0] + 6, k[1], 10, 8, 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = L(0.3); g.beginPath(); g.ellipse(k[0] + 9, k[1] + 3, 5, 4, 0.6, 0, Math.PI * 2); g.fill();
      for (const [dx, len, ph, wd] of [[2, 150, 0, 9], [14, 118, 1.9, 8]]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const v = i / 16;
          pts.push([k[0] + dx + 6 + Math.sin(v * 4.6 + ph) * 6 + v * 16, k[1] + 6 + v * len]);
        }
        g.fillStyle = L(0.7); g.beginPath(); brush(g, pts, wd, wd * 0.8); g.fill();
        g.fillStyle = L(0.32); g.beginPath(); brush(g, pts.map(([x, y], i) => [x + wd * 0.28 * Math.cos(i * 0.9 + ph), y]), wd * 0.34, wd * 0.3); g.fill();
        const e = pts[pts.length - 1];               // swallow-tail end
        g.fillStyle = L(0.7); g.beginPath(); poly(g, [[e[0] - wd * 0.4, e[1]], [e[0] + wd * 0.4, e[1]], [e[0] + wd * 0.5, e[1] + 10], [e[0], e[1] + 5], [e[0] - wd * 0.5, e[1] + 10]]); g.fill();
      }
    }
    g.restore();
  }, { bbox: box(30, -660, 330, -330) });

  // ---------------- ink: the carved eye and the dedication
  p.ink((ctx) => {
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    const night = p.night;
    const dark = night ? '#050408' : '#120e0a';
    // the carved eye: an almond socket cut into the planks (a dark groove all
    // round, the upper lid deepest), the eyeball a pale-wood bulge catching
    // the light on its upper front, and a dark pupil glancing down and
    // forward, at the onlookers below. No white sclera: it is carved, not
    // painted.
    ctx.save(); ctx.translate(EYE[0], EYE[1]); ctx.rotate(0.92);
    const er = tiny ? 17 : 13;
    const almond = (rx, ry, dx = 0, dy = 0) => {
      ctx.beginPath(); ctx.moveTo(dx - rx, dy);
      ctx.quadraticCurveTo(dx - rx * 0.1, dy - ry * 1.55, dx + rx, dy);
      ctx.quadraticCurveTo(dx - rx * 0.1, dy + ry * 1.25, dx - rx, dy);
    };
    ctx.fillStyle = dark; almond(er * 1.3, er * 0.62); ctx.fill();
    if (tiny) { ctx.fillStyle = night ? '#4a443d' : '#6e604e'; almond(er * 0.85, er * 0.36); ctx.fill(); }
    else {
      ctx.fillStyle = night ? '#5a544b' : '#7a6a54'; almond(er * 0.98, er * 0.42, 0, er * 0.04); ctx.fill();        // the eyeball
      ctx.fillStyle = night ? '#9a9286' : '#b4a487'; almond(er * 0.62, er * 0.16, -er * 0.12, -er * 0.16); ctx.fill(); // lit upper front
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(er * 0.32, er * 0.12, er * 0.32, 0, Math.PI * 2); ctx.fill(); // the pupil, looking down
      ctx.fillStyle = night ? '#b9b1a4' : '#d8cbb0'; ctx.beginPath(); ctx.arc(er * 0.2, er * 0.02, er * 0.07, 0, Math.PI * 2); ctx.fill(); // a glint in it
      // the upper lid: a heavy carved line running past the corners
      ctx.strokeStyle = dark; ctx.lineWidth = er * 0.16; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-er * 1.45, er * 0.08); ctx.quadraticCurveTo(-er * 0.1, -er * 1.05, er * 1.35, -er * 0.06); ctx.stroke();
    }
    ctx.restore();
    if (o.board !== false) {
      if (tiny) { // a few dark marks for the letters
        ctx.fillStyle = dark;
        for (let x = BOARD.x0 + 26; x < BOARD.x1 - 26; x += 36) ctx.fillRect(x, -140, 22, 12);
      } else carve(ctx, HORSE.text, BOARD, night);
    }
    ctx.restore();
  });

  // ---------------- rim light (opt-in, o.rim): for a horse lit from behind
  // by the moon at upper right (s05), a thin ivory line on the silhouette
  // edges that face the light: the back, the mane tips, the near ear, the
  // forehead and muzzle, and the fronts of the forelegs. o.rim: true, or
  // { width (world units, default 1.3), color (default N.stone's moonlit
  // ivory) }. In the ink pass, after everything else.
  if (o.rim) {
    const rw = (o.rim.width ?? 1.3) / s, rc = o.rim.color ?? '#eee7e2';
    p.ink((ctx) => {
      ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
      ctx.strokeStyle = rc; ctx.lineWidth = Math.max(rw, u * 0.9); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      const run = (pts) => { if (pts.length > 1) poly(ctx, pts, false); };
      // the back: the barrel's top edge, from the rump to the withers
      const top = BODY.filter(([x, y]) => y < -586 && x > -300 && x < 96).sort((a, b) => a[0] - b[0]);
      run(top);
      for (const mb of MANE) run([mb.pts[3], mb.pts[2]]);                 // mane tips
      run([[286, -874], [292, -816]]);                                     // the near ear's front edge
      run([...FORE, MUZZLE[0], MUZZLE[1]]);                                // forehead, nose and muzzle
      for (const lg of [FORELEG, FAR_FORE]) run(lg.r);                     // the fronts of the forelegs
      ctx.stroke();
      ctx.restore();
    }, { bbox: box(-332, -880, 420, -210) });
  }
}

// A leg of three vertical planks, lit from the left. dl darkens far legs.
function leg(g, lg, dl, tiny, u) {
  const n = tiny ? 1 : 3;
  const lights = tiny ? [0.34] : [0.54, 0.34, 0.17];
  for (let k = 0; k < n; k++) {
    const a = lg.l.map((pl, i) => mix(pl, lg.r[i], k / n));
    const b = lg.l.map((pl, i) => mix(pl, lg.r[i], (k + 1) / n));
    fill(g, band(a, b), lights[k] + dl, 0.5);
  }
  if (!tiny) {
    // the belly's shadow over the top of the leg
    const y0 = lg.l[0][1], y1 = y0 + 50;
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); poly(g, [[lg.l[0][0] - 2, y0], [lg.r[0][0] + 2, y0], [edgeX(lg.r, y1) + 2, y1], [edgeX(lg.l, y1) - 2, y1]]); g.fill();
    g.restore();
    // joint seam under the knee / hock
    g.strokeStyle = L(0.04); g.lineWidth = Math.max(u, 1.4);
    g.beginPath(); g.moveTo(edgeX(lg.l, lg.knee + 16), lg.knee + 16); g.lineTo(edgeX(lg.r, lg.knee + 16), lg.knee + 16); g.stroke();
  }
}

// Tail: a heavy fall of tarred slats from the croup, flaring a little and
// squared off at the hocks.
function tail(g, tiny) {
  const c = spline([[-298, -588], [-330, -566], [-346, -510], [-350, -430], [-346, -340]], 6);
  const n = tiny ? 1 : 5;
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2);
    const l = tiny ? 0.3 : [0.5, 0.38, 0.3, 0.22, 0.14][k];
    g.fillStyle = L(l, 0.47);
    g.beginPath();
    const pts = c.map(([x, y], i) => { const v = i / (c.length - 1); return [x + off * (5 + 5 * v), y + (k % 2) * 8 * v]; });
    brush(g, pts, tiny ? 30 : 10, tiny ? 40 : 11);
    g.fill();
  }
}

function* body(g, tiny, u, rng, joints) {
  const gapLine = (pts, w, l) => { g.strokeStyle = L(l, 0); g.lineWidth = Math.max(u * 1.1, w); g.beginPath(); poly(g, pts, false); g.stroke(); };
  g.save();
  g.beginPath(); poly(g, BODY); g.clip();
  fill(g, BODY, 0.3);
  const N = tiny ? 3 : 9, X0 = -330, X1 = 246, DX = 6;
  const xs = [];
  for (let x = X0; x <= X1; x += DX) xs.push(x);
  const edge = (k) => xs.map((x) => [x, lerp(backY(x) - 8, bellyY(x) + 8, k / N)]);
  for (let k = 0; k < N; k++) {
    const top = edge(k), bot = edge(k + 1);
    const v = (k + 0.5) / N;
    const base = 0.5 - 0.4 * Math.pow(v, 1.1);
    let x = X0 - rng.range(0, 140);
    while (x < X1) {                                    // planks, butt joints staggered
      const len = rng.range(120, 230);
      const x0 = Math.max(X0, x), x1 = Math.min(X1, x + len);
      const i0 = Math.round((x0 - X0) / DX), i1 = Math.round((x1 - X0) / DX);
      if (i1 > i0) {
        const xm = (x0 + x1) / 2;   // the rump faces the sun, the chest turns away
        const l = base + rng.range(-0.05, 0.04) + (xm < -230 ? 0.07 : 0) - (xm > 160 ? 0.08 : 0);
        fill(g, band(top.slice(i0, i1 + 1), bot.slice(i0, i1 + 1)), l, 0);
        if (!tiny) {
          const hl = top.slice(i0, i1 + 1), hl2 = hl.map(([px, py]) => [px, py + 3.8]);
          fill(g, band(hl, hl2), l + 0.42 - v * 0.26, 0);                   // bevel catching the light
          gapLine([[x1, top[i1][1]], [x1, bot[i1][1]]], 1.5, 0.03);         // butt joint
          if (x1 < X1 - 4) joints.push([x1, top[i1][1], bot[i1][1]]);
        }
      }
      x += len;
    }
    if (!tiny) gapLine(bot, 1.5, 0.03);
    if (k % 3 === 2) yield;
  }
  // shaded underside of the barrel
  g.globalCompositeOperation = 'source-atop';
  const sg = g.createLinearGradient(0, -500, 0, -416);
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = sg; g.fillRect(X0, -500, X1 - X0, 100);
  g.restore();
}

function neck(g, tiny, u) {
  const outline = [...CREST, ...THROAT.slice().reverse(), [150, -520], [60, -590]];
  g.save();
  g.beginPath(); poly(g, outline); g.clip();
  fill(g, outline, 0.4, 0.3);
  const N = tiny ? 2 : 5;
  const sample = (k) => CREST.map((c, i) => mix(c, THROAT[i], k / N));
  for (let k = 0; k < N; k++) {
    const a = sample(k), b = sample(k + 1);
    const l = 0.52 - 0.4 * ((k + 0.5) / N);
    fill(g, band(a, b), l, 0.3);
    if (!tiny) {
      fill(g, band(a, a.map((pt, i) => mix(pt, b[i], 0.14))), l + 0.36, 0.3);
      g.strokeStyle = L(0.03); g.lineWidth = Math.max(u * 1.1, 1.5); g.beginPath(); poly(g, b, false); g.stroke();
    }
  }
  // the head throws a shadow down the throat
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); poly(g, [[300, -720], [320, -700], [300, -640], [280, -660]]); g.fill();
  g.restore();
}

function head(g, tiny, u) {
  const outline = [...FORE, ...MUZZLE, ...JAW.slice().reverse()];
  g.save();
  g.beginPath(); poly(g, outline); g.clip();
  fill(g, outline, 0.4, 0.7);
  // planes from the face down to the jaw: lit forehead and nose, cheek, jaw in shadow
  const cuts = tiny ? [0, 0.4, 1] : [0, 0.3, 0.62, 1];
  const lights = tiny ? [0.5, 0.22] : [0.58, 0.34, 0.14];
  const sample = (k) => FORE.map((c, i) => mix(c, JAW[i], k));
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = sample(cuts[k]), b = sample(cuts[k + 1]);
    fill(g, band(a, b), lights[k], 0.7);
    if (!tiny && k > 0) { g.strokeStyle = L(0.03); g.lineWidth = Math.max(u * 1.1, 1.6); g.beginPath(); poly(g, a, false); g.stroke(); }
  }
  if (!tiny) {
    fill(g, band(FORE, sample(0.07)), 0.9, 0.7);                                  // sunlit ridge of the nose
    g.strokeStyle = L(0.05); g.lineWidth = 1.4; g.beginPath(); poly(g, sample(0.46).slice(4), false); g.stroke(); // cheek plank seam
    g.strokeStyle = L(0.58); g.lineWidth = 3; g.beginPath(); g.arc(314, -672, 30, 3.5, 4.6); g.stroke();      // round of the jowl
    // squared muzzle in end grain, nostril and mouth
    fill(g, [at(FORE, 0.92), [414, -640], [414, -606], [404, -596], at(JAW, 0.94)], 0.36, 0.2);
    g.fillStyle = L(0.02); g.beginPath(); g.ellipse(398, -640, 7, 4.5, 0.95, 0, Math.PI * 2); g.fill();
    g.strokeStyle = L(0.02); g.lineWidth = 2.4; g.beginPath(); g.moveTo(408, -612); g.lineTo(380, -620); g.stroke();
    // brow ridge over the eye, jowl seam
    g.strokeStyle = L(0.92); g.lineWidth = 3.2; g.beginPath(); g.arc(EYE[0], EYE[1], 20, -2.7, -0.95); g.stroke();
    g.strokeStyle = L(0.04); g.lineWidth = 1.8; g.beginPath(); g.arc(312, -676, 26, 1.0, 3.0); g.stroke();
  }
  g.restore();
}

// A lashing of rope from p0 to p1 across a member, w wide (the turns stack
// along the member). At full detail it is laid in turns: each turn an ivory
// band bowed to the member's round (bow: the bulge as a fraction of the
// lashing's length), a lit upper edge, a dark gap to the next turn, the ends
// darkening where the rope rounds away, and sparse ink ticks for the lay of
// the twist. Smaller sizes keep a plain pale band with a shaded underside.
function rope(g, p0, p1, w, l = 0.88, full = true, bow = 0) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
  const tx = dx / len, ty = dy / len, nx = -ty, ny = tx, hw = w / 2;
  if (!full) {
    const P = (s, n) => [p0[0] + tx * s + nx * n, p0[1] + ty * s + ny * n];
    fill(g, [P(0, -hw), P(len, -hw), P(len, hw), P(0, hw)], l);
    fill(g, [P(0, hw - w * 0.25), P(len, hw - w * 0.25), P(len, hw), P(0, hw)], l - 0.3);
    return;
  }
  const b = bow * len;
  // a point along the lashing (s, 0..len) at offset n across it, bowed
  const P = (s, n) => { const v = 2 * s / len - 1, d = n + b * (1 - v * v); return [p0[0] + tx * s + nx * d, p0[1] + ty * s + ny * d]; };
  const N = Math.max(3, Math.min(6, Math.round(w / 2.8))), tw = w / N, K = 10;
  const strip = (n0, n1, s0 = 0, s1 = len) => {
    const a = [], c = [];
    for (let i = 0; i <= K; i++) { const s = s0 + (s1 - s0) * i / K; a.push(P(s, n0)); c.push(P(s, n1)); }
    return [...a, ...c.reverse()];
  };
  const end = Math.min(len * 0.14, tw * 2.2);
  for (let k = 0; k < N; k++) {
    const n0 = -hw + k * tw, n1 = n0 + tw;
    fill(g, strip(n0, n1), l - 0.1);                                           // the turn: ivory
    fill(g, strip(n0, n0 + tw * 0.32), 0.93);                                  // its lit upper edge
    fill(g, strip(n0, n1, 0, end), l - 0.34);                                  // rounding away at each end
    fill(g, strip(n0, n1, len - end, len), l - 0.38);
    fill(g, strip(n1 - tw * 0.15, n1), 0.3);                                   // the dark gap to the next turn
    // the lay of the twist: a few soft slanted ticks, staggered turn by turn
    g.strokeStyle = L(0.44); g.lineWidth = Math.max(0.5, tw * 0.16); g.lineCap = 'butt';
    g.beginPath();
    for (let s = end + tw * (1.4 + (k % 2) * 2.4); s < len - end - tw; s += tw * 4.8) {
      const a = P(s, n0 + tw * 0.3), c = P(s + tw * 0.8, n1 - tw * 0.3);
      g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]);
    }
    g.stroke();
  }
}

// The hatch door. 'outer' is the closed position (above the hinge, hull
// planking outside); 'inner' hangs below the hinge showing its battened
// inner face. Drawn about the hinge line at HATCH.y1.
function hatchDoor(g, face, tiny, u) {
  const { x0, x1, y0, y1 } = HATCH, hh = y1 - y0;
  if (face === 'outer') {
    fill(g, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 0.24, 0);
    fill(g, [[x0, y0 + hh / 2], [x1, y0 + hh / 2], [x1, y1], [x0, y1]], 0.18, 0);
    if (!tiny) {
      fill(g, [[x0, y0], [x1, y0], [x1, y0 + 3.6], [x0, y0 + 3.6]], 0.6, 0);
      fill(g, [[x0, y0 + hh / 2], [x1, y0 + hh / 2], [x1, y0 + hh / 2 + 3.4], [x0, y0 + hh / 2 + 3.4]], 0.48, 0);
      g.strokeStyle = L(0.02); g.lineWidth = Math.max(u * 1.1, 2); g.strokeRect(x0, y0, x1 - x0, hh);
    }
    return;
  }
  const yb = y1 + hh;
  fill(g, [[x0 - 2, y1], [x1 + 2, y1], [x1 + 2, yb], [x0 - 2, yb]], 0.58, 0.5);           // boards
  if (tiny) return;
  for (let k = 1; k < 4; k++) { const x = lerp(x0, x1, k / 4); g.strokeStyle = L(0.08); g.lineWidth = Math.max(u, 1.3); g.beginPath(); g.moveTo(x, y1); g.lineTo(x, yb); g.stroke(); }
  for (const y of [y1 + 9, yb - 12]) fill(g, [[x0 - 2, y], [x1 + 2, y], [x1 + 2, y + 7], [x0 - 2, y + 7]], 0.32, 0); // battens
  fill(g, [[x0 - 2, yb - 4], [x1 + 2, yb - 4], [x1 + 2, yb], [x0 - 2, yb]], 0.22, 0);    // bottom edge
  g.strokeStyle = L(0.02); g.lineWidth = Math.max(u * 1.1, 1.8); g.strokeRect(x0 - 2, y1, x1 - x0 + 4, hh);
}
function hingeStraps(g, face) {
  const { x0, x1, y1 } = HATCH;
  for (const x of [x0 + 12, x1 - 24]) {
    if (face === 'inner') fill(g, [[x, y1 - 2], [x + 12, y1 - 2], [x + 12, y1 + 22], [x, y1 + 22]], 0.66);
    else fill(g, [[x, y1 - 22], [x + 12, y1 - 22], [x + 12, y1 + 2], [x, y1 + 2]], 0.66);
  }
}

// Wheel of four spokes with a heavy felloe, lit from the upper left. rot in radians.
function wheel(g, x, y, r, rot, tiny, u) {
  const ri = r * 0.76;
  g.fillStyle = L(0.04); g.beginPath(); circle(g, x, y, r + 1.5); g.fill();
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gr.addColorStop(0, L(0.66, 0.25)); gr.addColorStop(0.5, L(0.42, 0.25)); gr.addColorStop(1, L(0.2, 0.25));
  g.fillStyle = gr; g.beginPath(); circle(g, x, y, r); circle(g, x, y, ri); g.fill('evenodd');
  if (tiny) { g.fillStyle = L(0.3); g.fillRect(x - r * 0.8, y - 3, r * 1.6, 6); g.fillRect(x - 3, y - r * 0.8, 6, r * 1.6); return; }
  g.fillStyle = L(0.06); g.beginPath(); circle(g, x, y, ri); g.fill(); // dark between the spokes
  for (let k = 0; k < 4; k++) {
    const a = rot + (k * Math.PI) / 2;
    const ca = Math.cos(a), sa = Math.sin(a), w = 4.8;
    const l = 0.48 - 0.16 * Math.sin(a + 0.8);
    g.fillStyle = L(l, ((a / Math.PI) % 1 + 1) % 1);
    g.beginPath(); poly(g, [[x - sa * w, y + ca * w], [x + sa * w, y - ca * w], [x + ca * ri + sa * w, y + sa * ri - ca * w], [x + ca * ri - sa * w, y + sa * ri + ca * w]]); g.fill();
  }
  g.strokeStyle = L(0.04); g.lineWidth = Math.max(u, 1.3);                  // felloe joints
  g.beginPath();
  for (let k = 0; k < 4; k++) { const a = rot + Math.PI / 4 + (k * Math.PI) / 2; g.moveTo(x + Math.cos(a) * ri, y + Math.sin(a) * ri); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.stroke();
}

// Carved capitals, letterspaced and fitted to the board: dark grooves with a
// lit lower-right lip (incised, lit from the upper left).
function carve(ctx, text, b, night) {
  const w = b.x1 - b.x0 - 36, hgt = b.y1 - b.y0;
  const ref = 100, face = 'Cormorant, "Cormorant Garamond", Georgia, serif';
  ctx.font = `600 ${ref}px ${face}`;
  const sp = 0.2 * ref;
  const chars = [...text];
  const adv = chars.map((ch) => ctx.measureText(ch).width);
  const total = adv.reduce((s, a) => s + a, 0) + sp * (chars.length - 1);
  const fs = Math.min((ref * w) / total, hgt * 1.02);
  const k = fs / ref;
  ctx.font = `600 ${fs}px ${face}`;
  ctx.textBaseline = 'alphabetic';
  const x0 = (b.x0 + b.x1) / 2 - (total * k) / 2;
  const base = (b.y0 + b.y1) / 2 + fs * 0.31;
  const lip = night ? '#b7ad9d' : '#efe6d2';
  const groove = night ? '#0a090d' : '#1d1610';
  for (const [col, d] of [[lip, fs * 0.045], [groove, 0]]) {
    ctx.fillStyle = col;
    let x = x0;
    chars.forEach((ch, i) => { ctx.fillText(ch, x + d, base + d); x += (adv[i] + sp) * k; });
  }
}

// ------------------------------------------------------------- public API
export function horseSprite(o = {}) {
  return {
    w: W, h: H, ax: 0.5, ay: 1, depth: o.depth ?? 1, maxScale: o.maxScale ?? 1, res: o.res ?? 1,
    paint(p) { paint(p, OX, H, 1, { ...o, gen: true }); },
  };
}

export function paintHorse(p, o) {
  paint(p, o.x, o.y, o.s ?? 1, o);
}

// A loose wheel for rolling wheels drawn per frame with
// e.drawSprite(ctx, name, x, y, { rot, s }). Anchor is the hub. Bake the
// horse with { wheels: false } and draw these at HORSE.wheels.
export function wheelSprite(o = {}) {
  const r = WHEEL_R, pad = 4, sz = 2 * (r + pad), c = sz / 2;
  return {
    w: sz, h: sz, ax: 0.5, ay: 0.5, depth: o.depth ?? 1, maxScale: o.maxScale ?? 1, res: o.res ?? 1,
    paint(p) {
      const m = mats(p, 1, 'full');
      p.pass(m.wood, (g) => wheel(g, c, c, r, 0, false, p.px));
      p.pass(m.bronze, (g) => {
        const gr = g.createRadialGradient(c - 4, c - 5, 0, c, c, 12);
        gr.addColorStop(0, L(0.95)); gr.addColorStop(1, L(0.3));
        g.fillStyle = gr; g.beginPath(); circle(g, c, c, 11); g.fill();
        g.fillStyle = L(0.18); g.beginPath(); circle(g, c, c, 3.5); g.fill();
      }, { bbox: { x: c - 14, y: c - 14, w: 28, h: 28 } });
    },
  };
}

// The hatch door on its own, for an animated opening. Bake the horse with
// { hatch: 'hole' }, then call drawHatchDoor each frame (see below).
// face: 'outer' (closed side) or 'inner'. Anchor: centre of the hinge line.
export function hatchDoorSprite(o = {}) {
  const face = o.face ?? 'outer';
  const { x0, x1, y0, y1 } = HATCH, hh = y1 - y0, pad = 4;
  const w = x1 - x0 + 2 * pad + 4, h = hh + 2 * pad + 24;
  const cx = w / 2, hy = face === 'outer' ? hh + pad : pad;   // hinge line inside the sprite
  return {
    w, h, ax: 0.5, ay: hy / h, depth: o.depth ?? 1, maxScale: o.maxScale ?? 1, res: o.res ?? 1,
    paint(p) {
      const m = mats(p, 1, 'full');
      const dx = cx - (x0 + x1) / 2, dy = hy - y1;
      p.pass(m.wood, (g) => { g.save(); g.translate(dx, dy); hatchDoor(g, face, false, p.px); g.restore(); });
      p.pass(m.bronze, (g) => { g.save(); g.translate(dx, dy); hingeStraps(g, face); g.restore(); });
    },
  };
}

// Draws the hatch door swinging open (open 0 = shut, 1 = hanging down) for a
// horse drawn at ground (x, y) with scale s. Needs the two door sprites
// registered in the shot, by default as 'hatchOuter' and 'hatchInner'.
export function drawHatchDoor(ctx, e, o) {
  const s = o.s ?? 1;
  const hx = o.x + (HORSE.hatch.hinge.x - W / 2) * s, hy = o.y + (HORSE.hatch.hinge.y - H) * s;
  const c = Math.cos(clamp(o.open ?? 0) * Math.PI);
  if (c >= 0) e.drawSprite(ctx, o.outer ?? 'hatchOuter', hx, hy, { sx: s, sy: s * Math.max(0.02, c) });
  else e.drawSprite(ctx, o.inner ?? 'hatchInner', hx, hy, { sx: s, sy: s * Math.max(0.02, -c) });
}
