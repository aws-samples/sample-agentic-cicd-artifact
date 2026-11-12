// Coast kit (owner D2): pieces shared by s11 (the escape along the beach) and
// s12 (the finale on the cliff platform), so that neither shot imports the
// other.
//
//   statue(p, o)        the colossal carved Athena (assets/athena.js) standing
//                       in a cliff niche or a temple pronaos
//   bankBillows(...)    hand-built billows for a low moonlit cumulus bank
//   moonLight(moon, x, y) light direction for cumulus({ light }) from the moon
//   moonBank(p, o)      a cumulus bank lit from the moon (bankBillows + cumulus)
//   maquis(p, o)        a band of dark maquis scrub along an edge line (plate 5)
//   troyHeadland(p, o)  Troy's headland seen far across the water at night: a
//                       dark mass with a moonlit seaward cliff, towers and the
//                       temple on its crown (distantFire's city sits on top)
//   troyFire(o)         the distantFire box over that headland's lower town (pure)
//   distantLand(p, o)   distantCoast()'s far land as flat ink (no shader pass)
//
// Every function records passes on the painter `p`; nothing draws directly.

import { cumulus } from './nature.js';
import { paintAthena, ATHENA } from '../assets/athena.js';
import { L } from '../engine/bake.js';
import { RNG, makeNoise, clamp, lerp } from '../engine/rng.js';
import { poly, densify, roughen, bboxOf } from './geom.js';
import { mat } from './palette.js';

const TAU = Math.PI * 2;

// ----------------------------------------------------------------- statue
// The colossal Athena, carved in pitted stone and lit by the moon from the
// right (STYLE production standard 1: B's Athena is the bar for every carved
// colossus, so the cliff statue of s11 and the pronaos statue of s12 are the
// same figure).
// o: { x (centre line), y (the feet; or the plinth base when plinth: true),
//      s (1 = 800 units from the feet to the crest), lightSide (+1 moon at the
//      right, default by p.night), plinth (bool, default false), mat,
//      variant (passed to paintAthena: 'goddess' is B1's unarmed draped goddess) }
// Returns { bbox, feet, head, top } in world units.
export function statue(p, o) {
  const s = o.s ?? 1;
  const r = paintAthena(p, { x: o.x, y: o.y, s, part: o.plinth ? 'all' : 'figure', lightSide: o.lightSide ?? (p.night ? 1 : -1), mat: o.mat, variant: o.variant });
  return { ...r, top: r.bbox.y, h: (o.plinth ? ATHENA.h : ATHENA.figure.h) * s };
}

// ----------------------------------------------------------------- clouds
// Hand-built cumulus billows: fewer, bigger lobes read as a moonlit bank
// (plate 4) at small sizes where the generic generator turns to snow peaks.
// Each billow carries one to three big heads (0.42-0.6 of its radius) on its
// upper side, toward the moon when o.side says where it is, so a billow reads
// as one massed lobe with a head or two, never ringed with small florets
// (standard 22). A small billow keeps one head, a second head is smaller than
// the first, and a head that would fuse with one already placed (in any
// billow) is dropped, so no cap prints as two equal lobes (round 5: the heart
// in s12's tower). Returns billows for cumulus({ billows }).
// o: { tower (0..1, where the tower rises), side (+1 the moon to the right of
//      the bank, -1 to the left; default: heads on both upper quadrants) }
export function bankBillows(seed, x0, x1, y, h, o = {}) {
  const rng = new RNG(seed);
  const main = [];
  const w = x1 - x0;
  const n = Math.max(3, Math.round(w / (h * 0.55)));
  for (let i = 0; i < n; i++) { // base row
    const u = (i + 0.5) / n, edge = 1 - 0.55 * Math.pow(Math.abs(u - 0.5) * 2, 2);
    const r = h * rng.range(0.24, 0.34) * edge;
    main.push({ x: x0 + u * w + rng.range(-0.2, 0.2) * r, y: y - r * 0.6, r });
  }
  const tc = o.tower ?? rng.range(0.3, 0.6);
  for (let i = 0; i < Math.max(2, Math.round(n * 0.5)); i++) { // middle row
    const u = 0.18 + 0.64 * (i + 0.5) / Math.max(2, Math.round(n * 0.5));
    const r = h * rng.range(0.26, 0.36) * (1 - 0.6 * Math.abs(u - tc));
    main.push({ x: x0 + u * w, y: y - h * rng.range(0.4, 0.5), r });
  }
  main.push({ x: x0 + tc * w, y: y - h * 0.68, r: h * 0.3 }); // tower
  main.push({ x: x0 + (tc + 0.07) * w, y: y - h * 0.86, r: h * 0.2 });
  main.sort((a, b) => a.y - b.y);
  const out = [];
  // the heads' arc: the upper quadrant facing the moon (angles from +x, y down)
  const [a0, a1] = o.side > 0 ? [0.1, 0.5] : o.side < 0 ? [0.5, 0.9] : [0.15, 0.85];
  const heads = [];
  for (const b of main) {
    b.rx = b.r * rng.range(1.05, 1.25); b.ry = b.r * rng.range(0.85, 0.95);
    out.push(b);
    const nb = rng.int(1, 3), small = b.r <= h * 0.22;
    for (let j = 0; j < nb; j++) {
      // stratified along the arc (every draw is made, so the layout stays put)
      const a = -Math.PI * lerp(a0, a1, (j + rng.range(0.15, 0.85)) / nb), r0 = b.r * rng.range(0.5, 0.62);
      // round 5 (the s12 judge's heart): a small billow carries one head; a
      // second head is smaller than the first and is dropped when it would fuse
      // with it or with a neighbour's head, so no cap prints as two equal
      // lobes (a heart under the crisp cap terminator)
      if (small && j > 0) continue;
      const rr = j ? r0 * 0.62 : r0, hx = b.x + Math.cos(a) * b.rx * 0.74, hy = b.y + Math.sin(a) * b.ry * 0.74;
      if (heads.some((q) => Math.hypot(q.x - hx, q.y - hy) < 0.9 * (q.r + rr))) continue;
      const hd = { x: hx, y: hy, r: rr, rx: rr * 1.12, ry: rr * 0.94, bump: true };
      heads.push(hd); out.push(hd);
    }
    // ROUND 6 (the s12 judge's nice 10): a ring of slightly smaller, slightly
    // darker lobes (0.5-0.66 r, bias -0.22) around each big billow's front and
    // lower arc. They are masses, not florets, so the shader models them with
    // the parent and the crevice between the lobes takes a deeper tone: the
    // tower stops printing as a flat white ball of equal florets on a dead
    // shelf. Small billows take one, so the bank's foot stays flat-based.
    const nr = b.r > h * 0.2 ? rng.int(2, 3) : 1;
    for (let j = 0; j < nr; j++) {
      const a = Math.PI * lerp(-0.08, 0.72, (j + rng.range(0.2, 0.8)) / nr) * (o.side < 0 ? -1 : 1);
      const rr = b.r * rng.range(0.5, 0.66);
      out.push({ x: b.x + Math.cos(a) * b.rx * 0.66, y: b.y + Math.sin(a) * b.ry * 0.5, r: rr, rx: rr * 1.1, ry: rr * 0.9, bias: -0.22 });
    }
  }
  return out;
}

// Screen-plane light direction for a cloud at (x, y) lit by the moon at
// moon {x, y}: the unit vector toward the moon, scaled to the length of
// nature.js's default light (so only the direction changes). Light always
// comes from above (ly < 0).
export function moonLight(moon, x, y) {
  let dx = moon.x - x, dy = Math.min(-1, moon.y - y);
  const l = Math.hypot(dx, dy) || 1;
  return [(dx / l) * 0.78, (dy / l) * 0.78];
}

// A low cumulus bank between x0 and x1 with its flat base at y, rising h,
// lit from the moon (or o.light). Plate 4's bank is lit from high behind: the
// moon rides above and beyond it, so only its upper rims take the white and the
// billows facing us stay in three pale blues. So by default the light keeps the
// moon's side but is turned up toward the vertical (o.high, 0 = straight at the
// moon .. 1 = straight down from above) and lengthened (o.back: a longer
// screen-plane light leaves less of it on the front faces; 0.78 = nature.js's
// default length). o: { seed, x0, x1, y, h, tower, moon, light, high, back }
export function moonBank(p, o) {
  const cx = (o.x0 + o.x1) / 2;
  const billows = bankBillows(o.seed, o.x0, o.x1, o.y, o.h, { tower: o.tower, side: o.moon ? Math.sign(o.moon.x - cx) || 1 : 0 });
  let light = o.light;
  if (!light && o.moon) {
    const [mx, my] = moonLight(o.moon, cx, o.y - o.h * 0.55);
    const hi = o.high ?? 0.95, len = o.back ?? 2.0;
    const lx = (mx / 0.78) * (1 - hi), ly = -1 * hi + (my / 0.78) * (1 - hi), l = Math.hypot(lx, ly) || 1;
    light = [(lx / l) * len, (ly / l) * len];
  }
  return cumulus(p, { x: cx, y: o.y, billows, light: light ?? [0.5, -0.6] });
}

// ----------------------------------------------------------------- maquis
// A band of maquis scrub (plate 5's dark green bushes) along an upper edge
// line, filled solid down to `bottom`. Low, flattened clumps catch the light
// on the side of `lightSide` (+1 right: the moon at night) along the top edge;
// deeper rows sink into shade, so the band stays dark enough to carry a
// caption. Uses the foliage material (near-black greens at night).
// o: { edge: [[x, y], ...] left to right, bottom (y), seed, size ([min, max]
//      clump radius), density (clumps per 100 units of edge), rows (extra rows
//      below the edge), lightSide, peak (light of the lit tops, default 0.62),
//      tufts (stray clumps scattered above the edge: count), rough (edge
//      roughness, fraction of the clump size, default 0.22), mounds ([{ x, r }]
//      big bushes rising from the edge at x), rocks ([{ x, w, h, sink }]
//      limestone boulders on the edge at x, sunk `sink` of their height into
//      the scrub), mat, rockMat }
export function maquis(p, o) {
  const rng = new RNG(o.seed ?? 'maquis');
  const nz = makeNoise(rng.int(1, 1e6));
  const ls = o.lightSide ?? (p.night ? 1 : -1);
  const [r0, r1] = o.size ?? [16, 34];
  const peak = o.peak ?? 0.62;
  const edge = roughen(densify(o.edge, 6), nz, (r0 + r1) * (o.rough ?? 0.22), 0.03);
  const bottom = o.bottom;
  const outline = [...edge, [edge[edge.length - 1][0], bottom], [edge[0][0], bottom]];
  const clumps = [];
  const rows = o.rows ?? 2;
  const dens = o.density ?? 3.2;
  let len = 0;
  for (let i = 1; i < edge.length; i++) len += Math.hypot(edge[i][0] - edge[i - 1][0], edge[i][1] - edge[i - 1][1]);
  const n = Math.max(3, Math.round((len / 100) * dens));
  const at = (u) => { // point on the edge at fraction u of its x-extent
    const x = lerp(edge[0][0], edge[edge.length - 1][0], u);
    let j = 1; while (j < edge.length - 1 && edge[j][0] < x) j++;
    const a = edge[j - 1], b = edge[j], k = clamp((x - a[0]) / Math.max(1e-6, b[0] - a[0]));
    return [x, lerp(a[1], b[1], k)];
  };
  for (let row = 0; row <= rows; row++) {
    const m = Math.round(n * (1 + row * 0.2));
    for (let i = 0; i < m; i++) {
      const [x, y] = at((i + rng.range(0, 1)) / m);
      const r = rng.range(r0, r1) * (1 + row * 0.22);
      clumps.push({ x: x + rng.range(-0.4, 0.4) * r, y: y + r * 0.2 + row * r * 0.8 + rng.range(-0.25, 0.25) * r, r, ang: rng.range(0.3, 0.7), lit: peak * (1 - row * 0.16) * rng.range(0.8, 1.05) });
    }
  }
  for (let i = 0; i < (o.tufts ?? 0); i++) { // strays on the sand above the edge
    const [x, y] = at(rng.next());
    const r = rng.range(r0 * 0.35, r0 * 0.8);
    clumps.push({ x, y: y - rng.range(r * 1.2, r0 * 3.5), r, ang: rng.range(0.3, 0.7), lit: peak * rng.range(0.85, 1.05) });
  }
  const ex0 = edge[0][0], ex1 = edge[edge.length - 1][0];
  const mounds = (o.mounds ?? []).map((md) => { const [mx, my] = at(clamp((md.x - ex0) / (ex1 - ex0))); return { x: mx, y: my, r: md.r }; });
  for (const md of mounds) { // a dome of clumps rising above the edge
    const nn = 8 + rng.int(0, 4);
    for (let i = 0; i < nn; i++) {
      const a = Math.PI * (0.08 + 0.84 * rng.next()), d = rng.range(0.25, 0.8) * md.r;
      const r = md.r * rng.range(0.28, 0.46);
      clumps.push({ x: md.x - Math.cos(a) * d * 1.25, y: md.y - Math.sin(a) * d * 0.85 + r * 0.25, r, ang: rng.range(0.3, 0.7), lit: peak * rng.range(0.85, 1.08) });
    }
  }
  clumps.sort((a, b) => a.y - b.y);
  const bbox = bboxOf([...outline, ...clumps.flatMap((c) => [[c.x - c.r * 1.6, c.y - c.r], [c.x + c.r * 1.6, c.y + c.r]])], 4);
  // flattened, overlapping lobes per clump (the lit side on top), laid out now
  // so the guide can be drawn in chunks (a generator: about 200 lobes a bake unit)
  const lobes = [];
  for (const c of clumps) {
    const n2 = rng.int(3, 6);
    for (let j = 0; j < n2; j++) {
      const bx = c.x + rng.range(-0.8, 0.8) * c.r, by = c.y + rng.range(-0.3, 0.2) * c.r;
      lobes.push({ bx, by, rr: c.r * rng.range(0.4, 0.75), rot: rng.range(-0.12, 0.12), lit: c.lit, ang: c.ang });
    }
  }
  p.pass(o.mat ?? p.mat.foliage, function* (g) {
    g.fillStyle = L(0.08, 0.5); g.beginPath(); poly(g, outline);
    for (const md of mounds) g.ellipse(md.x, md.y + md.r * 0.1, md.r * 1.1, md.r * 0.62, 0, Math.PI, TAU);
    g.fill();
    for (let i = 0; i < lobes.length; i++) {
      const { bx, by, rr, rot, lit, ang } = lobes[i];
      const gr = g.createLinearGradient(bx + ls * rr * 0.7, by - rr * 0.6, bx - ls * rr * 0.3, by + rr * 0.6);
      gr.addColorStop(0, L(lit, ang)); gr.addColorStop(0.3, L(lit * 0.62, ang)); gr.addColorStop(0.7, L(0.14, ang)); gr.addColorStop(1, L(0.06, ang));
      g.fillStyle = gr; g.beginPath(); g.ellipse(bx, by, rr * 1.5, rr * 0.62, rot, 0, TAU); g.fill();
      if (i % 200 === 199) yield;
    }
  }, { bbox });
  // limestone boulders on the edge, their feet sunk in the scrub
  if (o.rocks?.length) {
    const rocks = o.rocks.map((r) => {
      const [x, y] = at(clamp((r.x - ex0) / (ex1 - ex0)));
      const w = r.w, h = r.h, base = y + h * (r.sink ?? 0.35);
      const pts = roughen(densify([[x - w * 0.5, base], [x - w * 0.46, base - h * 0.55], [x - w * 0.2, base - h], [x + w * 0.2, base - h * 0.94], [x + w * 0.5, base - h * 0.45], [x + w * 0.47, base]], 4, true), nz, h * 0.07, 0.09, true);
      return { x, base, w, h, pts };
    });
    const rb = bboxOf(rocks.flatMap((r) => r.pts), 4);
    p.pass(o.rockMat ?? p.mat.rock, (g) => {
      for (const r of rocks) {
        const gr = g.createLinearGradient(r.x + ls * r.w * 0.35, r.base - r.h, r.x - ls * r.w * 0.25, r.base);
        gr.addColorStop(0, L(0.95)); gr.addColorStop(0.4, L(0.78)); gr.addColorStop(0.62, L(0.4)); gr.addColorStop(0.85, L(0.12)); gr.addColorStop(1, L(0.04));
        g.fillStyle = gr; g.beginPath(); poly(g, r.pts); g.fill();
      }
    }, { bbox: rb });
  }
  return { bbox, edge };
}

// ----------------------------------------------------------------- far land
// nature.js's distantCoast() drawn as flat ink in the material's tones (the
// same silhouette from the same seed): far land is one posterised tone with a
// lit top edge, so it needs no shader pass (each pass is a guide readback in
// WebKit). o: as distantCoast { x0, x1, y, h, seed, freq, bias, top, bottom, lit, mat }
// plus strand: { pts, light } (a sand strip inked in the sand material's tone).
// Returns the silhouette points.
export function distantLand(p, o) {
  const { x0, x1, y, h = 30, seed = 'coast' } = o;
  const rng = new RNG(seed);
  const nz = makeNoise(rng.int(1, 1e6));
  const pts = [[x0, y + 2]];
  for (let x = x0; x <= x1; x += 6) {
    const v = nz.fbm(x * (o.freq ?? 0.004), 0.5, 4);
    pts.push([x, y - Math.max(0, v + (o.bias ?? 0.1)) * h * 2.4]);
  }
  pts.push([x1, y + 2]);
  const m = o.mat ?? p.mat.distant;
  const T = (v) => { let i = 0; while (i < m.thr.length && v > m.thr[i]) i++; return m.ramp[i]; };
  const bbox = bboxOf(pts, 3);
  p.ink((g) => {
    g.fillStyle = T(((o.top ?? 0.62) + (o.bottom ?? 0.42)) / 2); g.beginPath(); poly(g, pts); g.fill();
    if (o.lit !== false) { // light top edge
      g.save(); g.beginPath(); poly(g, pts); g.clip();
      g.strokeStyle = T(0.95); g.lineWidth = Math.max(p.px * 1.5, h * 0.05);
      g.beginPath(); poly(g, pts.slice(1, -1), false); g.stroke();
      g.restore();
    }
  }, { bbox });
  return pts;
}

// ----------------------------------------------------------------- Troy far off
// Troy's headland on the horizon at night, the same landform as s01's (a tall
// limestone headland whose sheer seaward cliff carries the citadel: walls,
// towers and the temple of Athena on its summit), seen from far across the
// water. It rises from the sea horizon `y`: the lower town climbs the landward
// slope to a plateau about half the height, then the citadel steps up to the
// summit `h` near the sea, and the cliff drops near-vertically to the water on
// `side` (+1: the right, toward the moon over the open sea). The cliff face is
// moonlit limestone (pale blue at this distance, broken by dark fissures). The
// lower town burns: troyFire() is the distantFire box over it, so the citadel's
// towers and the temple's pediment stand black against the glow behind it.
// o: { x0, x1, y (sea horizon), h (summit height, 36-48 units), side, seed, towers, mat,
//      glow: { x, y, r, sy, colors, ks } (a steady fire glow on the sky behind the city;
//      then pass distantFire glow: false, since its own tint glow would paint over this) }
// Returns { pts, bbox, crown(x) -> y, fire: { x, w, y }, cliffX, summit: { x, y } }.
// Profile in u (0 landward end .. 1 seaward foot), v = height / h.
const TROY_PROF = [[0, 0.0], [0.04, 0.12], [0.1, 0.3], [0.16, 0.42], [0.3, 0.48], [0.44, 0.53], [0.56, 0.58], [0.6, 0.7], [0.64, 0.86], [0.69, 0.97], [0.74, 1.0], [0.87, 1.0], [0.91, 0.98], [0.935, 0.97]];
const TROY_TOWN = [0.05, 0.6];       // the lower town (it burns), in u
// The box distantFire() should use on troyHeadland(o)'s lower town (pure: actors
// call it with the same o): { x (left edge), w, y (base line) }. Its base sits on
// the town's plateau, so distantFire's flames (h about 0.3 x the summit height)
// burn along the walls below the citadel.
export function troyFire(o) {
  const w = o.x1 - o.x0, h = o.h ?? 32, side = o.side ?? 1;
  const X = (u) => (side > 0 ? o.x0 + u * w : o.x1 - u * w);
  const a = X(TROY_TOWN[0]), b = X(TROY_TOWN[1]);
  return { x: Math.min(a, b), w: Math.abs(b - a), y: o.y - h * 0.4 };
}

export function troyHeadland(p, o) {
  const { x0, x1, y } = o;
  const h = o.h ?? 32;
  const side = o.side ?? 1;
  const w = x1 - x0;
  const rng = new RNG(o.seed ?? 'troy-headland');
  const nz = makeNoise(rng.int(1, 1e6));
  const prof = TROY_PROF;
  const X = (u) => (side > 0 ? x0 + u * w : x1 - u * w);
  const U = (x) => clamp(side > 0 ? (x - x0) / w : (x1 - x) / w);
  const top = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [u0, v0] = prof[i], [u1, v1] = prof[i + 1];
    const n = Math.max(2, Math.round(((u1 - u0) * w) / 5));
    for (let k = 0; k < n; k++) {
      const u = u0 + ((u1 - u0) * k) / n, t = k / n;
      const v = v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      top.push([X(u), y - h * v + nz.n2(u * 9, 2.3) * h * 0.03]);
    }
  }
  // the seaward cliff: sheer from the summit's lip to the sea, with a slight batter
  const cl = [[0.935, 0.97], [0.945, 0.9], [0.952, 0.74], [0.958, 0.56], [0.966, 0.4], [0.976, 0.24], [0.988, 0.1], [1.0, 0.0]];
  const cliff = cl.map(([u, v], i) => [X(u) + (i && i < cl.length - 1 ? side * nz.n2(v * 7, 5.1) * h * 0.03 : 0), y - h * v]);
  const pts = [[X(0), y + 1], ...top, ...cliff.slice(1), [X(1), y + 1]];
  const crown = (x) => { // the crown line under the city
    const u = U(x);
    let j = 1; while (j < prof.length - 1 && prof[j][0] < u) j++;
    const a = prof[j - 1], b = prof[j], k = clamp((u - a[0]) / Math.max(1e-6, b[0] - a[0]));
    return y - h * lerp(a[1], b[1], k);
  };
  // towers (the tallest beside the temple on the summit) and the temple, in u
  const towers = [[0.83, 0.03, 0.62], [0.63, 0.028, 0.5], [0.4, 0.026, 0.44], [0.2, 0.024, 0.36]].slice(0, o.towers ?? 4);
  const temple = { u: 0.765, w: 0.1 };
  const blocks = towers.map(([u, tw, th]) => { const cx = X(u), bw = tw * w, base = crown(cx) + 2; return { x: cx - bw / 2, y: base - th * h - 2, w: bw, h: th * h + 2 }; });
  const tcx = X(temple.u), tw = temple.w * w, tb = crown(tcx) + 1, colH = h * 0.36;
  const ent = tb - colH - h * 0.06;                       // the entablature's top
  const ped = { x0: tcx - tw * 0.56, x1: tcx + tw * 0.56, y: ent, apex: ent - h * 0.16 };
  const all = [...pts, ...blocks.flatMap((b) => [[b.x, b.y], [b.x + b.w, b.y]]), [ped.x0, ped.apex], [ped.x1, ped.y]];
  const bbox = bboxOf(all, 4);
  // the city's red glow on the sky behind the headland: steady posterised
  // bands of the fire ramp (production standards 15 and 17), above the sea
  // only; it rises behind the citadel, so its towers and the pediment stand
  // black against it, and it is brightest low over the burning lower town
  if (o.glow) {
    // lit smoke over the burning lower town: each band's top follows the town
    // a set height above its roofs (ragged), and the outer band rises behind
    // the citadel's landward flank, so its tower stands against the glow
    const gl = o.glow;
    const cols = gl.colors ?? ['#4a0d09', '#791b14', '#c62c1f'];
    const lift = gl.lift ?? [1.08, 0.86, 0.68];           // band tops, x h above the horizon, over the town
    const span = gl.span ?? [[0.0, 0.7], [0.08, 0.6], [0.16, 0.54]];
    const bands = cols.map((c, i) => {
      const [ua, ub] = span[i] ?? span[span.length - 1], top = [];
      for (let u = ua; u <= ub + 1e-6; u += 0.01) {
        const edge = Math.min(1, (u - ua) / 0.12, (ub - u) / 0.08);       // falls toward its ends
        const rag = nz.n2(u * 11 + i * 3.1, 1.7) * 0.14 + nz.n2(u * 29 + i, 4.2) * 0.06 + nz.n2(u * 67 + i * 7, 2.9) * 0.025;
        const v = Math.max(0, lift[i] * (0.45 + 0.55 * Math.sqrt(Math.max(0, edge))) + rag);
        top.push([X(u), y - h * v]);
      }
      return { c, pts: [...top, [X(ub), y + 2], [X(ua), y + 2]] };
    });
    const gb = bboxOf(bands.flatMap((b) => b.pts), 2);
    gb.h = y - gb.y;
    p.ink((ctx) => {
      ctx.save(); ctx.beginPath(); ctx.rect(gb.x, gb.y, gb.w, gb.h); ctx.clip();
      for (const b of bands) { ctx.fillStyle = b.c; ctx.beginPath(); poly(ctx, b.pts); ctx.fill(); }
      ctx.restore();
    }, { bbox: gb });
  }
  // Flat posterised colour at this distance, so the headland is inked straight
  // onto the layer in the material's own tones (no shader pass: its guide
  // readback alone cost 12-30 ms a unit in WebKit). T(light) = the ramp tone.
  const m = o.mat ?? mat(p.mat.distant, { ramp: ['#01030f', '#050b2a', '#0e1a4c', '#3c4d8d', '#aab6dc'], thr: [0.16, 0.34, 0.56, 0.8] });
  const T = (v) => { let i = 0; while (i < m.thr.length && v > m.thr[i]) i++; return m.ramp[i]; };
  const zig = (x0z, x1z, yz, amp, seed) => { const out = []; for (let x = x0z; x <= x1z + 1e-6; x += Math.max(1.5, (x1z - x0z) / 40)) out.push([x, yz + nz.n2(x * 0.35, seed) * amp]); return out; };
  p.ink((g) => {
    // the mass: navy-black, its landward foot a shade lighter in the night haze
    g.fillStyle = T(0.06); g.beginPath(); poly(g, pts); g.fill();
    g.save(); g.beginPath(); poly(g, pts); g.clip();
    const hx = X(0.26), hb = bboxOf(pts);
    g.fillStyle = T(0.3); g.beginPath();
    const edgeL = []; for (let yy = hb.y - 2; yy <= y + 2; yy += 2) edgeL.push([hx + nz.n2(yy * 0.3, 6.6) * w * 0.02, yy]);
    poly(g, side > 0 ? [[hb.x - 2, hb.y - 2], ...edgeL, [hb.x - 2, y + 2]] : [[hb.x + hb.w + 2, hb.y - 2], ...edgeL, [hb.x + hb.w + 2, y + 2]]); g.fill();
    g.restore();
    // the seaward cliff face catches the moon: sheer limestone, pale at this
    // distance, its foot in shadow, split by dark vertical fissures
    // (a broad pale wedge under the summit's lip, as s01's white cliff reads)
    const fw = Math.max(p.px * 3, w * 0.075);               // the face's width, seen at an angle
    const arete = cliff.map(([fx, fy], i) => [fx - side * fw * (0.62 + 0.38 * (1 - i / (cliff.length - 1))) + side * nz.n2(fy * 0.3, 8.8) * fw * 0.08, fy]);
    const face = [...cliff, ...arete.slice().reverse()];
    const fb = bboxOf(face, 2);
    g.save(); g.beginPath(); poly(g, face); g.clip();
    g.fillStyle = T(0.94); g.fillRect(fb.x, fb.y, fb.w, fb.h);
    const band = (t, v, sd) => { const yy = y - h + t * h; g.fillStyle = T(v); g.beginPath(); poly(g, [...zig(fb.x, fb.x + fb.w, yy, h * 0.025, sd), [fb.x + fb.w, y + 2], [fb.x, y + 2]]); g.fill(); };
    band(0.683, 0.7, 3.1); band(0.955, 0.5, 4.7);
    g.fillStyle = T(0.2);
    for (let i = 0; i < 4; i++) { // fissures and shaded flutes down the face, irregular
      const fu = 0.16 + 0.2 * i + rng.range(-0.07, 0.07), fy0 = y - h * rng.range(0.35, 0.95);
      const fx = X(0.97) - side * fw * fu, fwid = Math.max(p.px * 1.1, h * rng.range(0.008, 0.03));
      g.beginPath(); g.moveTo(fx - fwid, fy0); g.lineTo(fx + fwid * 0.4, fy0 - 2); g.lineTo(fx + fwid, y + 1); g.lineTo(fx - fwid * 1.4, y + 1); g.closePath(); g.fill();
    }
    g.restore();
    // walls along the crown, the towers and the temple (columns as dark slits)
    g.fillStyle = T(0.05);
    g.beginPath();
    for (let i = 0; i < top.length - 1; i++) {
      const [ax, ay] = top[i], [bx, by] = top[i + 1];
      const u = U(ax);
      if (u < 0.14 || u > 0.93) continue;
      const wh = h * (u > 0.6 ? 0.1 : 0.07);
      g.moveTo(ax, ay + 1); g.lineTo(ax, ay - wh); g.lineTo(bx, by - wh); g.lineTo(bx, by + 1); g.closePath();
    }
    for (const b of blocks) {
      g.rect(b.x, b.y, b.w, b.h);
      for (let c = 0; c < 3; c++) g.rect(b.x + (c / 2.5) * b.w * 0.85, b.y - b.w * 0.24, b.w * 0.24, b.w * 0.24 + 0.5); // crenels
    }
    g.rect(tcx - tw / 2, ent, tw, tb - ent);
    g.moveTo(ped.x0, ped.y); g.lineTo(tcx, ped.apex); g.lineTo(ped.x1, ped.y); g.closePath();
    g.fill();
    // the temple's colonnade: moonlit column shafts between dark slits
    const nCol = 6, cw = tw / (nCol * 2 - 1);
    g.fillStyle = T(0.5);
    g.beginPath();
    for (let c = 0; c < nCol; c++) g.rect(tcx - tw / 2 + c * 2 * cw, tb - colH, cw, colH - 0.5);
    g.fill();
    // moonlight on the seaward faces: the towers' and the temple's sea sides,
    // the summit's lip, the pediment's raking cornice
    g.fillStyle = T(0.92);
    g.beginPath();
    const lw = Math.max(p.px * 1.3, h * 0.06);
    for (const b of blocks) { const ex = side > 0 ? b.x + b.w : b.x; g.rect(ex - (side > 0 ? lw : 0), b.y, lw, b.h * 0.9); }
    const ex = side > 0 ? tcx + tw / 2 : tcx - tw / 2;
    g.rect(ex - (side > 0 ? lw : 0), tb - colH, lw, colH);
    g.fill();
    g.strokeStyle = T(0.7); g.lineWidth = lw * 0.8;
    g.beginPath(); g.moveTo(tcx, ped.apex); g.lineTo(side > 0 ? ped.x1 : ped.x0, ped.y); g.stroke();
    // the citadel's lit crown edge, faint, along its walls toward the cliff
    g.strokeStyle = T(0.45); g.lineWidth = lw * 0.6;
    g.beginPath(); let on = false;
    for (const [ax, ay] of top) { const u = U(ax); if (u < 0.62 || u > 0.94) { on = false; continue; } if (!on) { g.moveTo(ax, ay - h * 0.1); on = true; } else g.lineTo(ax, ay - h * 0.1); }
    g.stroke();
  }, { bbox });
  // the burning lower town sits on the plateau between the landward slope and the citadel
  return { pts, bbox, crown, fire: troyFire(o), cliffX: X(0.97), summit: { x: tcx, y: ped.apex } };
}
