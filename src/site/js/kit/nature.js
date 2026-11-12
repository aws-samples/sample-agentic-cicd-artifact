// Natural elements of the prints: flat cobalt sky, towering cumulus with
// blue-shaded undersides, horizon streak clouds, a snow-capped mountain,
// distant pale coasts, the deep sea with broken light strokes and glints,
// limestone cliffs, beaches with lace surf, Japanese-style pines, cypress
// and maquis shrubs.

import { C, mat } from './palette.js';
import { L } from '../engine/bake.js';
import { poly, spline, densify, roughen, brush, circle, ellipse, bboxOf } from './geom.js';
import { RNG, makeNoise, clamp, lerp } from '../engine/rng.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- sky
export function sky(p, o = {}) {
  const r = p.region;
  p.ink((ctx) => {
    const n = p.night;
    const y0 = o.y0 ?? r.y, y1 = o.y1 ?? r.y + r.h;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, o.top ?? (n ? C.skyNightTop : C.skyDayTop));
    g.addColorStop(0.6, o.mid ?? (n ? C.skyNight : C.skyDay));
    g.addColorStop(1, o.low ?? (n ? C.skyNightLow : C.skyDayLow));
    ctx.fillStyle = g;
    ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  });
}

// Moon: a plain white disc, as in plate 4.
export function moon(p, { x, y, r }) {
  p.ink((ctx) => {
    ctx.fillStyle = C.moon; ctx.beginPath(); circle(ctx, x, y, r); ctx.fill();
  }, { bbox: { x: x - r - 2, y: y - r - 2, w: 2 * r + 4, h: 2 * r + 4 } });
}

// ---------------------------------------------------------------- cumulus
// Billows for a flat-based cumulus whose base sits at y, spanning w, rising h.
export function cumulusBillows(rng, { x, y, w, h, towers = 3, detail = 1, rowH: o_rowH }) {
  // 1. envelope: a low dome plus towers (gaussian bumps), flat base at y
  const peaks = [];
  for (let i = 0; i < towers; i++) {
    peaks.push({ x: x + (i === 0 ? rng.range(-0.12, 0.12) : rng.range(-0.34, 0.34)) * w,
      hgt: h * (i === 0 ? 1 : rng.range(0.42, 0.78)), wid: w * (i === 0 ? rng.range(0.2, 0.26) : rng.range(0.13, 0.22)) });
  }
  const H = (px) => {
    const u = (px - x) / (w / 2);
    let m = Math.abs(u) >= 1 ? 0 : h * 0.2 * (1 - Math.pow(Math.abs(u), 3));
    for (const pk of peaks) { const d = (px - pk.x) / pk.wid; m = Math.max(m, pk.hgt * Math.exp(-d * d * 1.1) * (1 - Math.pow(Math.min(1, Math.abs(u)), 6))); }
    return m;
  };
  const env = [];
  const N = 160;
  for (let i = 0; i <= N; i++) { const px = x - w / 2 + (w * i) / N; env.push([px, y - H(px)]); }
  const inside = (px, py) => py > y - H(px) && py < y && Math.abs(px - x) < w / 2;
  const out = [];
  // 2. interior bulges, back to front later by y
  const rowH = h * (o_rowH ?? 0.085);
  for (let ry = y - rowH * 0.5; ry > y - h; ry -= rowH * rng.range(0.75, 1.0)) {
    for (let rx = x - w / 2; rx < x + w / 2; rx += rowH * rng.range(1.0, 1.6)) {
      const cx = rx + rng.range(-0.35, 0.35) * rowH, cy = ry + rng.range(-0.3, 0.3) * rowH;
      const r = Math.min(h * 0.12, rowH * rng.range(0.6, 1.25) * (0.75 + 0.45 * (y - cy) / h));
      if (inside(cx, cy - r * 0.6) && inside(cx - r * 0.5, cy) && inside(cx + r * 0.5, cy)) out.push({ x: cx, y: cy, r, interior: true });
    }
  }
  // 3. outline bulges along the envelope (cauliflower edge)
  const acc = [0];
  for (let i = 1; i < env.length; i++) acc.push(acc[i - 1] + Math.hypot(env[i][0] - env[i - 1][0], env[i][1] - env[i - 1][1]));
  const total = acc[acc.length - 1];
  let d = 0, j = 1;
  while (d < total) {
    while (j < acc.length - 1 && acc[j] < d) j++;
    const f = (d - acc[j - 1]) / Math.max(1e-6, acc[j] - acc[j - 1]);
    const ex = env[j - 1][0] + (env[j][0] - env[j - 1][0]) * f, ey = env[j - 1][1] + (env[j][1] - env[j - 1][1]) * f;
    const hgt = (y - ey) / h;
    const r = h * rng.range(0.035, 0.08) * (0.6 + hgt * 0.8) * (0.8 + 0.4 * detail);
    let tx = env[j][0] - env[j - 1][0], ty = env[j][1] - env[j - 1][1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // inward normal points down into the cloud body
    let nx = -ty, ny = tx; if (ny < 0) { nx = -nx; ny = -ny; }
    if (ey < y - r * 0.5) out.push({ x: ex + nx * r * 0.7, y: ey + ny * r * 0.7, r, edge: true });
    d += r * rng.range(0.85, 1.25);
  }
  out.sort((a, b) => a.y - b.y); // upper first; lower bulges overlap them
  const res = [];
  for (const b of out) {
    b.rx = b.r * rng.range(1.05, 1.25); b.ry = b.r * rng.range(0.85, 0.98);
    res.push(b);
    if (!b.edge) continue;
    const nb = Math.round(rng.range(1, 3) * detail);
    for (let k = 0; k < nb; k++) {
      const a = -Math.PI * rng.range(0.15, 0.85);
      const rr = b.r * rng.range(0.22, 0.42);
      res.push({ x: b.x + Math.cos(a) * b.rx * 0.85, y: b.y + Math.sin(a) * b.ry * 0.85, r: rr, rx: rr * 1.1, ry: rr * 0.95, bump: true });
    }
  }
  return res;
}

// The previous sphere cumulus (uniform round billows), kept for comparison:
// cumulus(p, { ..., method: 'v2' }).
function cumulusV2(p, o) {
  const rng = new RNG(o.seed ?? 'cumulus');
  const billows = o.billows ?? cumulusBillows(rng, o);
  const lx = o.light?.[0] ?? -0.5, ly = o.light?.[1] ?? -0.62;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of billows) { const r = Math.max(b.rx ?? b.r, b.ry ?? b.r); x0 = Math.min(x0, b.x - r); y0 = Math.min(y0, b.y - r); x1 = Math.max(x1, b.x + r); y1 = Math.max(y1, b.y + r); }
  const baseY = o.y + (o.baseDrop ?? 0);
  const cx = o.x ?? (x0 + x1) / 2, hw = Math.max(1, (x1 - x0) / 2);
  const depth = o.depth ?? (o.h ?? (baseY - y0)) * 0.55;
  const spheres = billows.map((b) => {
    const r = ((b.rx ?? b.r) + (b.ry ?? b.r)) / 2;
    const u = Math.min(1, Math.abs(b.x - cx) / hw);
    const dome = Math.sqrt(Math.max(0, 1 - u * u));
    const low = (b.y - y0) / Math.max(1, baseY - y0);      // 0 top … 1 base
    const z = b.z ?? (depth * dome * (0.55 + 0.45 * low) + (b.interior ? r * 0.6 : 0) + (b.bump ? r * 0.8 : 0) + rng.range(0, r * 0.25));
    return { x: b.x, y: b.y, r, z, bias: b.bias ?? 0 };
  });
  p.spheres(o.mat ?? p.mat.cloud, spheres, {
    light: [lx, ly, o.lightZ ?? 0.8], ambient: o.ambient ?? 0.56, diffuse: o.diffuse ?? 0.52,
    baseY, topY: y0, baseDark: o.baseDark ?? 0.74, flatBase: o.flatBase !== false,
    global: [(x0 + x1) / 2, (y0 + baseY) / 2 + (baseY - y0) * 0.1, (x1 - x0) / 2 * 1.05, (baseY - y0) * 0.62],
    globalMix: o.globalMix ?? 0.5, flatness: o.flatness ?? 0.6,
  });
  return { bbox: { x: x0, y: y0, w: x1 - x0, h: baseY - y0 }, billows };
}

// The original 2D-guide cumulus (radial-gradient billows with contact shadows).
export function cumulus2d(p, o) {
  const rng = new RNG(o.seed ?? 'cumulus');
  const billows = o.billows ?? cumulusBillows(rng, o);
  const lx = o.light?.[0] ?? -0.5, ly = o.light?.[1] ?? -0.62;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of billows) { x0 = Math.min(x0, b.x - b.rx * 1.3); y0 = Math.min(y0, b.y - b.ry * 1.3); x1 = Math.max(x1, b.x + b.rx * 1.3); y1 = Math.max(y1, b.y + b.ry * 1.3); }
  const bbox = { x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 };
  const baseY = o.y + (o.baseDrop ?? 0);
  const ao = o.ao ?? 0.75;
  p.pass(o.mat ?? p.mat.cloud, (g) => {
    g.save();
    if (o.flatBase !== false) { g.beginPath(); g.rect(bbox.x, bbox.y, bbox.w, baseY - bbox.y); g.clip(); }
    for (const b of billows) {
      if (ao > 0 && !b.bump) {
        g.save(); g.globalCompositeOperation = 'source-atop';
        g.translate(b.x - lx * b.r * 0.25, b.y - ly * b.r * 0.25); g.scale(b.rx / b.r, b.ry / b.r);
        const sg = g.createRadialGradient(0, 0, b.r * 0.7, 0, 0, b.r * 1.35);
        sg.addColorStop(0, `rgba(70,0,0,${ao})`); sg.addColorStop(1, 'rgba(70,0,0,0)');
        g.fillStyle = sg; g.beginPath(); circle(g, 0, 0, b.r * 1.35); g.fill(); g.restore();
      }
      const hx = b.x + lx * b.rx * 0.8, hy = b.y + ly * b.ry * 0.8;
      const R = Math.max(b.rx, b.ry) * (1 + Math.hypot(lx, ly) * 0.8);
      const gr = g.createRadialGradient(hx, hy, 0, hx, hy, R);
      gr.addColorStop(0, L(1)); gr.addColorStop(0.6, L(0.97)); gr.addColorStop(0.8, L(0.86));
      gr.addColorStop(0.92, L(0.7)); gr.addColorStop(1, L(0.55));
      g.fillStyle = gr; g.beginPath(); g.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, TAU); g.fill();
    }
    g.restore();
  }, { bbox });
  return { bbox, billows };
}

// ---------------------------------------------------------------- cumulus (sphere impostors)
// Dense grid over sphere discs, for visibility queries while laying out.
// Cells are about the median billow diameter; the grid covers the billows'
// bounds padded by the largest radius (children land inside it).
const EMPTY = [];
function sphereGrid(sp) {
  const rs = sp.map((s) => s.r).sort((a, b) => a - b);
  const cell = Math.max(6, (rs[Math.floor(rs.length / 2)] ?? 10) * 2), pad = (rs[rs.length - 1] ?? 10) * 1.2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sp) { x0 = Math.min(x0, s.x - s.r); y0 = Math.min(y0, s.y - s.r); x1 = Math.max(x1, s.x + s.r); y1 = Math.max(y1, s.y + s.r); }
  x0 -= pad; y0 -= pad;
  const nx = Math.max(1, Math.ceil((x1 + pad - x0) / cell)), ny = Math.max(1, Math.ceil((y1 + pad - y0) / cell));
  const cells = new Array(nx * ny);
  const ci = (v) => Math.min(nx - 1, Math.max(0, Math.floor((v - x0) / cell)));
  const cj = (v) => Math.min(ny - 1, Math.max(0, Math.floor((v - y0) / cell)));
  return {
    add(s, n) {
      const i1 = ci(s.x + s.r), j1 = cj(s.y + s.r);
      for (let j = cj(s.y - s.r); j <= j1; j++) for (let i = ci(s.x - s.r); i <= i1; i++) {
        const k = j * nx + i; (cells[k] || (cells[k] = [])).push(n);
      }
    },
    at(x, y) {
      const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
      return i < 0 || j < 0 || i >= nx || j >= ny ? EMPTY : (cells[j * nx + i] || EMPTY);
    },
    // order every cell front to back (by the depth of each sphere's front), so
    // an occlusion scan can stop at the first sphere that lies behind the point
    sortByFront(all) {
      for (const c of cells) if (c && c.length > 1) c.sort((a, b) => (all[b].z + all[b].r) - (all[a].z + all[a].r));
    },
  };
}
// Depth of a sphere's front surface at (x, y); -Infinity outside its disc.
function surfZ(s, x, y) {
  const dx = x - s.x, dy = y - s.y, q = s.r * s.r - dx * dx - dy * dy;
  return q > 0 ? s.z + Math.sqrt(q) : -Infinity;
}

// Level-0 lobes of a towering cumulus: big lobes along the silhouette of a
// tower envelope and staggered rows of big face lobes, each row a little in
// front of the row above it. Every lobe belongs to a mass (a tower, or the
// base body, mass -1), which gets its own light and shade. The lobes are
// massed (production standard 22): mostly about R0, a few big caps, and no
// small fry; the florets come later and scale with the lobe they sit on.
// Returns [{ x, y, r, z, level: 0, mass, edge|interior|back }]; z is toward the viewer.
export function cumulusLobes(rng, { x, y, w, h, towers = 3, detail = 1, lobe = 1 }) {
  const peaks = [];
  for (let i = 0; i < towers; i++) {
    peaks.push({ x: x + (i === 0 ? rng.range(-0.12, 0.12) : rng.range(-0.34, 0.34)) * w,
      hgt: h * (i === 0 ? 1 : rng.range(0.42, 0.78)), wid: w * (i === 0 ? rng.range(0.2, 0.26) : rng.range(0.13, 0.22)) });
  }
  const nz = makeNoise(rng.int(1, 1e6));
  // a stepped silhouette: a flat base layer, a shoulder round each tower, and
  // the towers as domed columns with steep sides; the outline bulges irregularly
  for (const pk of peaks) pk.sh = { x: pk.x + rng.range(-0.25, 0.25) * pk.wid, hgt: pk.hgt * rng.range(0.38, 0.55), wid: pk.wid * rng.range(1.35, 1.6) };
  const tower = (pk, px) => {
    const d = Math.abs(px - pk.x) / pk.wid;
    return d < 1 ? pk.hgt * Math.pow(1 - Math.pow(d, 2.6), 0.5) : 0;
  };
  const baseH = (u) => h * 0.16 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 4)));
  const H = (px) => {
    const u = (px - x) / (w / 2);
    if (Math.abs(u) >= 1) return 0;
    const fall = 1 - Math.pow(Math.abs(u), 8);
    let m = baseH(u);
    for (const pk of peaks) m = Math.max(m, tower(pk, px) * fall, tower(pk.sh, px) * fall);
    return m * (1 + 0.12 * nz.fbm(px / (w * 0.18), 0.5, 3));
  };
  const massOf = (px, py) => {
    let best = -1, bh = baseH(Math.min(1, Math.abs((px - x) / (w / 2))));
    if (y - py < bh * 0.8) return -1;
    for (let i = 0; i < peaks.length; i++) { const t = Math.max(tower(peaks[i], px), tower(peaks[i].sh, px)); if (t > bh) { bh = t; best = i; } }
    return best;
  };
  const top = y - h, D = h * 0.55;
  // typical lobe radius: a fraction of the height for towers, of the area for flat banks
  const R0 = Math.min(h * 0.3, 0.07 * Math.sqrt(w * h)) * lobe;
  // a zero, negative or NaN lobe size would never advance the walks below
  if (!(R0 > 0)) return [];
  const zAt = (bx, by) => {
    const u = Math.min(1, Math.abs(bx - x) / (w / 2));
    const low = clamp((by - top) / h);
    return D * Math.sqrt(1 - u * u) * (0.3 + 0.7 * low);
  };
  // lobe sizes: mostly about R0, a few big caps, few small ones
  const size = () => { const k = rng.next(); return k < 0.16 ? rng.range(1.5, 2.0) : k < 0.34 ? rng.range(0.7, 0.88) : rng.range(0.9, 1.3); };
  const out = [];
  // 1. silhouette lobes along the envelope (arc-length walk); bigger toward the tops
  const env = [];
  const N = 220;
  for (let i = 0; i <= N; i++) { const px = x - w / 2 + (w * i) / N; env.push([px, y - H(px)]); }
  const acc = [0];
  for (let i = 1; i < env.length; i++) acc.push(acc[i - 1] + Math.hypot(env[i][0] - env[i - 1][0], env[i][1] - env[i - 1][1]));
  const total = acc[acc.length - 1];
  let d = 0, j = 1;
  while (d < total) {
    while (j < acc.length - 1 && acc[j] < d) j++;
    const f = (d - acc[j - 1]) / Math.max(1e-6, acc[j] - acc[j - 1]);
    const ex = env[j - 1][0] + (env[j][0] - env[j - 1][0]) * f, ey = env[j - 1][1] + (env[j][1] - env[j - 1][1]) * f;
    const hgt = (y - ey) / h;
    let tx = env[j][0] - env[j - 1][0], ty = env[j][1] - env[j - 1][1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = -ty, ny = tx; if (ny < 0) { nx = -nx; ny = -ny; }
    const R = Math.min((y - ey) * 0.75 + R0 * 0.2, R0 * size() * (0.72 + 0.5 * hgt));
    if (R > R0 * 0.25 && ey < y - R * 0.25) {
      const bx = ex + nx * R * 0.62, by = ey + ny * R * 0.62;
      out.push({ x: bx, y: by, r: R, z: zAt(bx, by) * 0.7, level: 0, edge: true, mass: massOf(bx, by) });
    }
    d += Math.max(R0 * 0.25, R * rng.range(0.72, 1.05));
  }
  // 2. face lobes: a few big billows in staggered rows from the base up; lower rows sit in front
  const rowStep = R0 * 1.6;
  for (let ry = y - rowStep * 0.3; ry > top + rowStep * 0.5; ry -= rowStep * rng.range(0.72, 0.95)) {
    for (let rx = x - w / 2 + rng.range(0, 1) * R0; rx < x + w / 2;) {
      const R = R0 * rng.range(0.95, 1.45) * (rng.chance(0.15) ? 1.3 : 1);
      const bx = rx + rng.range(-0.3, 0.3) * R, by = ry + rng.range(-0.25, 0.25) * R;
      rx += R * rng.range(1.45, 2.0);
      if (y - H(bx) > by - R * 0.9 || y - H(bx - R * 0.6) > by - R * 0.45 || y - H(bx + R * 0.6) > by - R * 0.45) continue;
      out.push({ x: bx, y: by, r: R, z: zAt(bx, by) + R * 0.3, level: 0, interior: true, mass: massOf(bx, by) });
    }
  }
  // 3. back fill: big lobes behind everything, so a gap between billows shows
  //    the shaded body of the cloud rather than the sky
  for (let px = x - w / 2 + R0; px < x + w / 2 - R0; px += R0 * 1.3) {
    const hh = H(px);
    for (let py = y - R0 * 0.4; py > y - hh * 0.82 + R0; py -= R0 * 1.3) {
      out.push({ x: px + rng.range(-0.2, 0.2) * R0, y: py, r: R0 * 1.3, z: zAt(px, py) * 0.2 - R0, level: 0, back: true, mass: massOf(px, py) });
    }
  }
  return out;
}

// Cauliflower detail: smaller billows along the exposed upper rims of every
// billow, `levels` deep, with irregular sizes and gaps. A child is kept only
// where it would show (nothing in front of its centre); deeper levels only
// where the floret faces the light or makes the silhouette. Florets scale
// with the lobe they sit on: a lobe under kidMin is a floret itself (no
// children), the second level grows only on lobes over deepMin, and only
// lobes over faceR carry florets on their faces (standard 22).
function* cauliflower(rng, sp, { levels = 2, minR = 3, ratio = [0.28, 0.55], light = [-0.5, -0.6, 0.6], faceR = Infinity, kidMin = 0, deepMin = 0 } = {}) {
  const grid = sphereGrid(sp);
  sp.forEach((s, n) => grid.add(s, n));
  let parents = sp.slice(), work = 0;
  for (let lv = 1; lv <= levels; lv++) {
    const kids = [];
    for (const s of parents) {
      if (++work % 48 === 0) yield;
      if (s.back || s.r * ratio[1] < minR) continue;
      if (lv === 1 && s.r < kidMin) continue;
      if (lv > 1 && (s.root ?? s).r < deepMin) continue;
      // the upper rim (the outer ring), and on a big lobe also its face (an
      // inner ring all round), so a large lit lobe is never one flat disc
      const face = lv === 1 && s.r > faceR;
      let a = -Math.PI - 1.1 + rng.range(0, 0.3), ring = 0, aEnd = 1.1 - rng.range(0, 0.3);
      for (;;) {
        if (a >= aEnd) {
          if (!face || ring) break;
          ring = 1; a = rng.range(0, TAU); aEnd = a + TAU;
        }
        const r = Math.max(minR, s.r * (ring ? rng.range(0.19, 0.4) : rng.range(ratio[0], ratio[1])));
        const rho = s.r * (ring ? rng.range(0.28, 0.5) : rng.range(0.6, 0.86));
        const cx = s.x + Math.cos(a) * rho, cy = s.y + Math.sin(a) * rho;
        const ux = Math.cos(a) * 0.8, uy = Math.sin(a) * 0.8;
        a += (r / s.r) * rng.range(1.5, 2.6) * (ring ? 1.6 : 1);
        if (rng.chance(0.2)) continue;
        const z = surfZ(s, cx, cy) - r * rng.range(0.55, 0.8);
        const front = z + r;
        let hidden = false, inside = false;
        for (const m of grid.at(cx, cy)) {
          const o = sp[m]; if (o === s) continue;
          const zo = surfZ(o, cx, cy);
          if (zo > -Infinity) inside = true;
          if (zo > front) { hidden = true; break; }
        }
        if (hidden) continue;
        const rl = (ux * light[0] + uy * light[1] + 0.45 * light[2]) / Math.hypot(ux, uy, 0.45);
        if (lv > 1 && inside && rl < 0.45) continue;
        kids.push({ x: cx, y: cy, r, z, level: lv, mass: s.mass, px: s.x, py: s.y, pr: s.r, par: s, root: s.root ?? s });
      }
    }
    for (const c of kids) { grid.add(c, sp.length); sp.push(c); }
    parents = kids;
  }
  return sp;
}

// Scalloped silhouette (production standard 32 / the plates' cauliflower edge):
// small florets along the parts of a billow's rim that make the cloud's own
// outline, so the silhouette tears into bumps of a few units instead of
// printing as one smooth blob. A floret sits inside its parent's rim (rho
// about 0.84 r), so the rim erosion can never detach it, and it is placed only
// where the rim is open to the sky above the flat base. Sizes follow the lobe
// (ratio of its radius, floored at minR), and nothing is added to a lobe that
// is a floret itself. Returns the spheres (sp is extended in place).
function* rimScallop(rng, sp, { ratio = [0.13, 0.26], minR = 3, rho = 0.84, step = 1.7, baseY = Infinity, minParent = 0, skip = 0.25 } = {}) {
  const grid = sphereGrid(sp);
  sp.forEach((q, i) => grid.add(q, i));
  const n0 = sp.length;
  const kids = [];
  const open = (x, y) => {
    if (y > baseY) return false;
    for (const m of grid.at(x, y)) { const o = sp[m], dx = x - o.x, dy = y - o.y; if (dx * dx + dy * dy < o.r * o.r * 0.9) return false; }
    return true;
  };
  for (let n = 0; n < n0; n++) {
    const s = sp[n];
    if (s.back || s.r < minParent) continue;
    if (n % 32 === 0) yield;
    const rr = rng.fork(n);
    const out = s.r * 1.08;
    let a = rr.range(0, TAU);
    const end = a + TAU;
    while (a < end) {
      const r = Math.max(minR, s.r * rr.range(ratio[0], ratio[1]));
      a += (r / s.r) * rr.range(step, step * 1.7);
      if (rr.chance(skip)) continue;
      const ca = Math.cos(a), sa = Math.sin(a);
      if (!open(s.x + ca * (s.r + Math.max(2, r * 0.9)), s.y + sa * (s.r + Math.max(2, r * 0.9)))) continue;   // this part of the rim is buried
      const cx = s.x + ca * s.r * rho, cy = s.y + sa * s.r * rho;
      if (cy > baseY) continue;
      // depth: the parent's surface at the floret's angle, sampled inside its
      // disc (a bump may sit on or past the rim, where surfZ has no value)
      const zp = s.z + Math.sqrt(Math.max(0, 1 - Math.min(0.92, rho) ** 2)) * s.r;
      kids.push({ x: cx, y: cy, r, z: zp - r * rr.range(0.3, 0.6), level: (s.level ?? 0) + 1,
        mass: s.mass, px: s.x, py: s.y, pr: s.r, par: s, root: s.root ?? s });
    }
  }
  for (const c of kids) sp.push(c);
  return sp;
}

// Back billows wherever the body of the cloud would show the sky. The layout
// (and the shader's rim erosion, which eats up to `edge` of every radius) can
// open gaps between lobes; production standard 22 says a cumulus has no
// holes. A coverage raster of the eroded discs finds every uncovered cell
// that is enclosed by cloud above, to both sides (within `reach`) and below
// (or the flat base); each gets a back billow of the mass around it, behind
// everything (a gap of the silhouette, open to the sky, is left alone).
function fillHoles(sp, { baseY, R0, edge = 0.12, reach = 2.5, flatBase = true }) {
  const kr = Math.max(0.3, 1 - edge);
  const step = Math.max(2, R0 * 0.25);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zMin = Infinity;
  for (const s of sp) { x0 = Math.min(x0, s.x - s.r); x1 = Math.max(x1, s.x + s.r); y0 = Math.min(y0, s.y - s.r); y1 = Math.max(y1, s.y + s.r); zMin = Math.min(zMin, s.z); }
  if (flatBase) y1 = Math.min(y1, baseY);
  const nx = Math.max(1, Math.ceil((x1 - x0) / step)), ny = Math.max(1, Math.ceil((y1 - y0) / step));
  if (nx * ny > 400000) return 0;
  const own = new Int32Array(nx * ny).fill(-1);
  // a cell counts as covered only if the whole cell lies inside an eroded disc,
  // so gaps smaller than a cell are found too
  sp.forEach((s, n) => {
    const r = s.r * kr - step * 0.71;
    if (r <= 0) return;
    const r2 = r * r;
    const i0 = Math.max(0, Math.floor((s.x - r - x0) / step)), i1 = Math.min(nx - 1, Math.floor((s.x + r - x0) / step));
    const j0 = Math.max(0, Math.floor((s.y - r - y0) / step)), j1 = Math.min(ny - 1, Math.floor((s.y + r - y0) / step));
    for (let j = j0; j <= j1; j++) {
      const cy = y0 + (j + 0.5) * step, dy = cy - s.y;
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (own[k] >= 0) continue;
        const dx = x0 + (i + 0.5) * step - s.x;
        if (dx * dx + dy * dy <= r2) own[k] = n;
      }
    }
  });
  const R = Math.ceil((R0 * reach) / step);
  const near = (i, j, di, dj, lim) => { for (let s = 1; s <= lim; s++) { const a = i + di * s, b = j + dj * s; if (a < 0 || b < 0 || a >= nx || b >= ny) return -2; const o = own[b * nx + a]; if (o >= 0) return o; } return -1; };
  const add = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (own[j * nx + i] >= 0) continue;
    const up = near(i, j, 0, -1, ny);
    if (up < 0) continue;
    const lf = near(i, j, -1, 0, R); if (lf < 0) continue;
    const rt = near(i, j, 1, 0, R); if (rt < 0) continue;
    const dn = near(i, j, 0, 1, R); if (dn === -1) continue;   // -2: it runs into the flat base
    const m = sp[up].mass ?? sp[lf].mass;
    const r = (step * 1.5) / kr;
    // the tone of the darkest billow round it, a step deeper (it shows as a crevice)
    const bias = Math.min(sp[up].bias ?? 0, sp[lf].bias ?? 0, sp[rt].bias ?? 0) - 0.06;
    add.push({ x: x0 + (i + 0.5) * step, y: y0 + (j + 0.5) * step, r, z: zMin - r - 1, bias, level: 0, back: true, hole: true, mass: m });
  }
  for (const s of add) sp.push(s);
  return add.length;
}

// Per-billow shading, as a brightness bias on each sphere. Every term is a
// smooth function of position, so neighbouring billows of one mass share
// their tone and edges appear only where the form turns: the silhouette,
// the lit florets of a front mass against the shaded body behind it, and
// the terminator, which follows the billows (crisp and lumpy).
//  - mass light: each tower and the base body is lit like one ellipsoid
//    (centred at massCy of its height, so its underside turns away into shade);
//  - florets: cauliflower billows are a little brighter on the side of their
//    parent that faces the light;
//  - shadow: optical depth of the lobes between the billow and the light
//    (gaussian blobs, integrated along the light ray);
//  - occlusion: lobes just in front of the billow darken it (crevices);
//  - base band: the lowest billows form a darker flat band (baseBand, over baseBandH).
// Drops billows that never show. light: normalised [lx, ly, lz] (y down,
// z toward the viewer).
function* shadeBillows(sp, light, masses, { baseY = Infinity, mass = 0.6, massMid = 0.4, massK = 0, rim = 0.2, lift = 0.04, crevice = 0.15, shadow = 0.2, R0 = 20, minBias = -0.26, jitter = 0, litJit = 0, ao = 0, aoLo = 0.25, aoSelf = 0, shadeFade = 0, baseBand = 0, baseBandH = 0, inherit = 0, inheritShade = 0, edgeAO = 1, shadeLift = 0 } = {}) {
  const grid = sphereGrid(sp);
  sp.forEach((s, n) => grid.add(s, n));
  grid.sortByFront(sp);
  const [lx, ly, lz] = light;
  const core = sp.filter((s) => s.level === 0 && !s.back);
  const nc = core.length, CX = new Float64Array(nc), CY = new Float64Array(nc), CZ = new Float64Array(nc), CS = new Float64Array(nc), CR = new Float64Array(nc);
  core.forEach((c, i) => { CX[i] = c.x; CY[i] = c.y; CZ[i] = c.z; CS[i] = c.r * 1.25; CR[i] = c.r; });
  // sample points on a billow's disc: the centre, an inner ring (the first four
  // of these are a floret's coverage samples) and an outer ring
  const ring = [[0, 0]];
  for (let k = 0; k < 6; k++) ring.push([Math.cos(k * TAU / 6) * 0.5, Math.sin(k * TAU / 6) * 0.5]);
  for (let k = 0; k < 6; k++) ring.push([Math.cos((k + 0.5) * TAU / 6) * 0.86, Math.sin((k + 0.5) * TAU / 6) * 0.86]);
  const keep = [];
  for (let n = 0; n < sp.length; n++) {
    if (n && n % 96 === 0) yield;
    const s = sp[n];
    const fine = s.level >= 1 && s.par && s.par.sh !== undefined; // florets: placed visible, share their parent's shade
    // visibility, and how much of the billow the billows in front of it hide:
    // a half-buried billow sits in a crevice between its neighbours (ao)
    // (back billows are never dropped: 13 samples miss the gaps between the lobes
    // in front, and a dropped back billow opened a hole to the sky there)
    let vis = fine || s.back ? 1 : 0, tested = 0, hidden = 0;
    const root = s.root ?? s;
    const nq = fine ? (ao > 0 ? 5 : 0) : ring.length;
    for (let q = 0; q < nq; q++) {
      const px = s.x + ring[q][0] * s.r, py = s.y + ring[q][1] * s.r;
      if (py > baseY) continue;
      const zs = surfZ(s, px, py);
      let hid = false, hidO = false;
      for (const m of grid.at(px, py)) {
        const o = sp[m];
        if (o.z + o.r <= zs + 0.01) break;   // this and every later sphere lie behind the point
        if (m === n || !(surfZ(o, px, py) > zs + 0.01)) continue;
        hid = true;
        // another lobe (or its florets) buries a billow; its own florets only a little
        if ((o.root ?? o) !== root) { hidO = true; break; }
      }
      tested++;
      if (hidO) hidden++; else if (hid) hidden += aoSelf;
      if (!hid) vis = 1;
      if (ao <= 0 && vis) break;
    }
    if (!vis) continue;
    const cov = tested ? hidden / tested : 0;
    // shadow and occlusion from the core lobes, as smooth gaussian blobs
    let sh, occ;
    if (fine) { sh = s.par.sh; occ = s.par.occ; } else {
      const fx = s.x, fy = s.y, fz = s.z + s.r * 0.5;
      let tau = 0;
      occ = 0;
      for (let i = 0; i < nc; i++) {
        if (core[i] === s) continue;
        const sg = CS[i], s2 = sg * sg;
        const vx = CX[i] - fx, vy = CY[i] - fy, vz = CZ[i] - fz;
        const t0 = vx * lx + vy * ly + vz * lz;
        const dxy = vx * vx + vy * vy, d2 = dxy + vz * vz - t0 * t0;
        if (d2 < s2 * 9) tau += sg * Math.exp(-d2 / s2) / (1 + Math.exp(-2.2 * (t0 / sg - 0.8)));
        if (vz > 0 && dxy < s2 * 12) occ += Math.exp(-dxy / (s2 * 1.4)) * Math.min(1, vz / CR[i]);
      }
      sh = 1 - Math.exp(-tau / (R0 * 1.6));
    }
    // mass light: normal of the mass ellipsoid at the billow
    const M = masses.get(s.mass) || masses.get('all');
    let qx = (s.x - M.cx) / M.rx, qy = (s.y - M.cy) / M.ry;
    const ql = Math.hypot(qx, qy); if (ql > 0.97) { qx *= 0.97 / ql; qy *= 0.97 / ql; }
    let ml = Math.max(0, qx * lx + qy * ly + Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy)) * lz);
    // massK > 0: a hard terminator, so the lit side of a mass prints as one white field
    // and its shade side as one blue field (plate 3), the step taken across a billow or two
    if (massK > 0) { const t = clamp(0.5 + (ml - massMid) * massK); ml = t * t * (3 - 2 * t); }
    let fb = 0;
    if (s.pr) {
      const ux = (s.x - s.px) / s.pr, uy = (s.y - s.py) / s.pr, ul = Math.hypot(ux, uy, 0.45) || 1;
      fb = lift + rim * (Math.max(0, (ux * lx + uy * ly + 0.45 * lz) / ul) - 0.5);
      // in the shade the florets keep their parent's tone (no pale discs: plate 3's shade is quiet)
      if (shadeFade) fb *= clamp(1.25 - shadeFade * sh);
      // on the shade side of its mass a floret lifts less (shadeLift): the shade
      // reads as one blue field, while lit-side florets make the lumpy terminator
      if (shadeLift) { const t = clamp((ml - massMid + 0.1) / 0.35); fb *= 1 - shadeLift * (1 - t * t * (3 - 2 * t)); }
      // neighbouring florets differ a little in tone, so the lit side breaks into florets
      if (jitter) fb += jitter * (hash2(s.x, s.y) - 0.5);
      // a few florets of a lit cap sit a step lower, so the cream field breaks
      // into a mosaic of cream and pale lobes as in plate 3 (downward only: a
      // lit cap is at the top of its ramp, so an upward offset is clipped away)
      if (litJit) { const q = hash2(s.y * 1.7 + 3.1, s.x * 0.9 + 7.3); fb -= litJit * q * q * clamp((ml - massMid - 0.05) / 0.3); }
    }
    s.sh = sh; s.occ = occ; s.ml = ml;
    // a silhouette lobe is not buried by the face lobes in front of it: what shows of
    // it is the outer rim of the cloud, which faces out (edgeAO scales its burial terms)
    const bury = s.edge && !s.level ? edgeAO : 1;
    let b = s.back ? mass * (ml - massMid) - 0.12 - shadow * sh * 0.5
      : (s.bias ?? 0) + mass * (ml - massMid) + fb - shadow * sh - bury * crevice * clamp(occ / 1.5);
    if (ao > 0 && !s.back) b -= bury * ao * clamp((cov - aoLo) / (1 - aoLo));
    // the flat base: the lowest billows sink into one darker band
    if (baseBand > 0 && baseBandH > 0) b -= baseBand * clamp((s.y - (baseY - baseBandH)) / (baseBandH * 0.6));
    // florets lean on their parent's tone, so the mass reads before its florets
    // (inheritShade: a floret on a shaded parent leans harder on it, so the shade side reads as one
    // body and only the lit-side florets print as florets)
    if (s.par && s.par.mb !== undefined) {
      let inh = inherit;
      if (inheritShade > inherit && s.par.ml !== undefined) { const t = clamp((s.par.ml - massMid + 0.08) / 0.24); inh = inheritShade + (inherit - inheritShade) * t * t * (3 - 2 * t); }
      if (inh > 0) b = (s.par.mb + fb) * inh + b * (1 - inh);
    }
    s.mb = b;
    s.bias = Math.max(minBias, b); // the deepest shade stays a cloud blue, never the sky's
    keep.push(s);
  }
  return keep;
}

const hash2 = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };

// Bounding ellipses of the masses (by mass id, plus 'all'). cyFrac places the
// centre down the mass's height: 1 = a dome standing on its lowest point
// (what shows faces up or out, never down); below 1 the underside of each
// mass turns away from a high light and falls into shade (plates 2, 3).
function massEllipses(sp, baseY, cyFrac = 1) {
  const acc = new Map();
  const put = (k, s) => {
    let a = acc.get(k); if (!a) { a = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; acc.set(k, a); }
    a.x0 = Math.min(a.x0, s.x - s.r); a.x1 = Math.max(a.x1, s.x + s.r); a.y0 = Math.min(a.y0, s.y - s.r); a.y1 = Math.max(a.y1, Math.min(baseY, s.y + s.r));
  };
  for (const s of sp) { put(s.mass ?? 'all', s); put('all', s); }
  const out = new Map();
  for (const [k, a] of acc) {
    const hgt = Math.max(1, a.y1 - a.y0), cy = a.y0 + hgt * cyFrac;
    out.set(k, { cx: (a.x0 + a.x1) / 2, cy, rx: Math.max(1, (a.x1 - a.x0) / 2) * 1.05, ry: Math.max(1, cy - a.y0, a.y1 - cy) * 1.02 });
  }
  return out;
}

// Towering cumulus (plates 2, 3 and 5) and moonlit banks (plate 4) as GPU
// sphere impostors. o: { x (centre), y (flat base), w, h, towers, seed,
//   light: [lx, ly] (direction toward the light on screen, y down; default
//   upper left; at night pass the direction of the moon), lightZ,
//   billows (supplied billows [{ x, y, r | rx, ry, z?, bias?, bump? }] instead
//   of the generator), lobe (lobe size factor), levels (cauliflower depth),
//   minR, baseDrop, flatBase, mat, method: '2d' | 'v2' (older looks) }.
// The shading options (ambient, diffuse, massLight, shadow, crevice, ...)
// exist for the lab; shots should not tune them (STYLE production standard 7).
// Returns { bbox, billows } (billows: the rendered spheres { x, y, r, z, bias }).
// Lab only: ?cl=key:value,key:value overrides the cloud look options of every
// cumulus in the page (A/B renders of real shots without editing them;
// numbers, or '/'-separated lists, e.g. ?cl=hatch:0.6,rampThr:0.2/0.4/0.6/0.75).
// Honored only on a local lab server, never on the deployed page: a crafted
// link (?cl=lobe:0) must not be able to hang a visitor's tab.
const LAB_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const CL_LAB = (() => {
  try {
    const lab = typeof location !== 'undefined' && LAB_HOSTS.includes(location.hostname);
    const v = lab && new URLSearchParams(location.search).get('cl');
    if (!v) return null;
    const out = {};
    for (const kv of v.split(',')) { const [k, x] = kv.split(':'); if (k && x !== undefined) out[k] = x.includes('/') ? x.split('/').map((q) => (/^[0-9.-]+$/.test(q) ? Number(q) : '#' + q)) : Number(x); }
    return out;
  } catch (err) { return null; }
})();

export function cumulus(p, o) {
  if (CL_LAB) o = { ...o, ...CL_LAB };
  if (o.method === '2d') return cumulus2d(p, o);
  if (o.method === 'v2') return cumulusV2(p, o);
  const n = p.night, F = cloudFrame(o, n);
  const hit = cloudCached(o, n);
  // the cloud's whole frame is declared by an ink on both paths, so a layer
  // that crops to its commands crops the same way with or without the cache
  const frame = { x: F.x0, y: F.y0, w: F.x1 - F.x0, h: F.y1 - F.y0 };
  let sp;
  if (hit) {
    sp = unpackSpheres(hit.data);
    p.ink(() => {}, { bbox: frame });
  } else {
    // the layout and shading run in the bake, in units of a few ms (standard
    // 23: no long JavaScript layout inside paint(p)): a generator ink fills the
    // sphere list in place before the spheres pass draws it. Until then the
    // list holds two specks inside the frame, so the pass plans for the cloud.
    sp = [{ x: F.x0 + 1, y: F.y0 + 1, r: 0.5, z: 1, bias: 0 }, { x: F.x1 - 1, y: F.baseY, r: 0.5, z: 1, bias: 0 }];
    const fill = sp;
    p.ink(function* () {
      const out = yield* cloudLayout(o, n);
      fill.length = 0;
      for (const q of out) fill.push(q);
    }, { bbox: frame });
  }
  // the shading frame comes from the options alone (the same on every bake)
  const M = o.mat ?? cloudMat(p, o, F.R0, F.light);
  const SH = {
    light: F.light, ambient: o.ambient ?? (n ? 0.6 : 0.51), diffuse: o.diffuse ?? (n ? 0.2 : 0.16),
    baseY: F.baseY, topY: F.top, baseDark: o.baseDark ?? 0.84, flatBase: o.flatBase !== false,
    global: [F.cx, (F.top + F.baseY) / 2 + (F.baseY - F.top) * 0.1, F.hw * 1.05, (F.baseY - F.top) * 0.62],
    globalMix: o.globalMix ?? 0.1, flatness: o.flatness ?? 0.45,
  };
  p.spheres(M, sp, SH);
  // the engraving (standard 32): contour strokes on the billows' shaded flanks,
  // laid out in the bake (a generator, a few ms a chunk) and cached with the layout
  const E = engraveOpts(o, n, F.R0, M);
  if (E) {
    const key = cloudKey(o, n);
    p.ink(function* (ctx) {
      const c = key && CLOUD_CACHE.get(key);
      let st = c && c.strokes;
      if (!st) { st = yield* cloudStrokes(sp, SH, E); if (c) c.strokes = st; }
      yield;
      yield* drawStrokes(ctx, st);
    }, { bbox: frame });
  }
  return { bbox: { x: F.x0, y: F.y0, w: F.x1 - F.x0, h: F.baseY - F.y0 }, billows: sp };
}

// The engraving options of a cumulus (look 5), or null when it has none.
// Two stroke families (standard 32):
//   'shade' - the engraving proper: curved contour strokes that follow each
//     billow's own outline on its shaded flank, in the two deepest shade tones;
//   'lace'  - pale crevice lace on the lit caps: a thin arc in the pale blue
//     along a cap's lower rim where another billow lies behind it, so cream
//     lobes separate as in plate 3 instead of fusing into one white field.
// Lab knobs (all world units unless noted): engrave (0 = off), engS (spacing),
// engW / engLW (stroke width, shade / lace), engT / engLT (weight floor),
// engLo / engHi (band offsets from thr[0] and thr[engHiI]), engC / engLC (ramp
// tone index or '#hex'), engMinR / engLMinR, engN (rings), engWin (half window,
// degrees), engWK (window step per ring), engHK (band step per ring), engIn
// (inner-ring weight), engCr (0 = rim strokes anywhere, not only in crevices),
// engD0/engD1 (dash lengths), engG0/engG1 (gaps), engLD0/engLD1, engLG0/engLG1.
function engraveOpts(o, night, R0, M) {
  const K = look(o, night, R0);
  if (!(o.engrave ?? K.eng)) return null;
  const thr = M.thr, ramp = M.ramp;
  if (!thr || !ramp) return null;
  const pick = (c) => (typeof c === 'string' ? c : ramp[Math.max(0, Math.min(ramp.length - 1, c))]);
  const v = (a, b) => o[a] ?? K[a] ?? b;
  const top = thr[thr.length - 1];
  const fams = [{
    tag: 's', lo: thr[0] + v('engLo', -0.1), hi: thr[Math.min(thr.length - 1, v('engHiI', 1))] + v('engHi', -0.02),
    w: v('engW', 5), tone: v('engT', 0.6), color: pick(v('engC', 0)), sign: 1, turn: 0, wob: 1,
    minR: v('engMinR', 7), rings: v('engN', 2), win: v('engWin', 115), winK: v('engWK', 45), hiK: v('engHK', 0.1), inner: v('engIn', 0.75),
    crevice: v('engCr', 1) > 0, s: v('engS', 12),
    dash: [v('engD0', 12), v('engD1', 36)], gap: [v('engG0', 4), v('engG1', 12)],
  }, {
    // the lace sits above the top band threshold (the cream tops), its weight
    // rising toward the brightest light, and only in a crevice (ring 0 only)
    tag: 'l', lo: top + v('engLLo', 0.004), hi: 1.01,
    w: v('engLW', 2.2), tone: v('engLT', 0.75), color: pick(v('engLC', ramp.length - 3)), sign: -1, turn: v('engLTurn', 0), wob: 0.5,
    minR: v('engLMinR', 5), rings: 1, win: v('engLWin', 150), winK: 0, hiK: 0, inner: 1,
    crevice: v('engLCr', 1) > 0, s: v('engS', 12),
    dash: [v('engLD0', 8), v('engLD1', 30)], gap: [v('engLG0', 3), v('engLG1', 9)],
  }];
  // the torn rim: a tuft takes the tone the rim is printed in at that point
  // (cream on a lit cap, the pale blue or the shade blue elsewhere), so it
  // reads as the paper tearing, not as a speck of another colour
  const rimN = v('rimN', 1);
  const rim = rimN > 0 ? {
    n: rimN, minR: v('rimMinR', 4), w: [v('rimW0', 2), v('rimW1', 5)], out: [v('rimO0', 0.8), v('rimO1', 3)],
    gap: [v('rimG0', 0.5), v('rimG1', 2)], skip: v('rimSkip', 0.06),
    long: v('rimLong', 0.18), longK: v('rimLK', 2.4), lean: v('rimLean', 1.2), sink: v('rimSink', 0.55),
    color: (L) => {
      let i = 0;
      while (i < thr.length && L > thr[i]) i++;
      return ramp[Math.max(0, Math.min(ramp.length - 1, i))];
    },
  } : null;
  return { fams, rim, edge: o.edge ?? K.edge, seed: String(o.seed ?? 'cumulus') + ':eng' };
}

// The frame of a cumulus, from its options alone: the light vector, the
// typical lobe radius R0, the flat base, the envelope's top and centre, and a
// conservative extent (x0, y0, x1, y1) that the florets never pass.
function cloudFrame(o, night) {
  const lx0 = o.light?.[0] ?? -0.5, ly0 = o.light?.[1] ?? -0.62, lz0 = o.lightZ ?? (night ? 0.35 : 0.55);
  const ln = Math.hypot(lx0, ly0, lz0);
  const light = [lx0 / ln, ly0 / ln, lz0 / ln];
  const baseY = o.y + (o.baseDrop ?? 0);
  if (o.billows) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, rMax = 1;
    const rs = [];
    for (const b of o.billows) {
      const r = Math.max(b.rx ?? b.r, b.ry ?? b.r);
      x0 = Math.min(x0, b.x - r); y0 = Math.min(y0, b.y - r); x1 = Math.max(x1, b.x + r); rMax = Math.max(rMax, r);
      if (!b.bump) rs.push(((b.rx ?? b.r) + (b.ry ?? b.r)) / 2);
    }
    rs.sort((a, b) => a - b);
    const R0 = rs[Math.floor(rs.length / 2)] ?? 20, pad = rMax * 1.2 + 2;
    return { light, baseY, R0, top: y0, cx: (x0 + x1) / 2, hw: Math.max(1, (x1 - x0) / 2), x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: baseY + pad };
  }
  // (measured on every cloud in the film: florets stay 0.3-2.4 R0 inside this frame,
  // and reach at most 1.3 R0 below the flat base)
  const R0 = Math.min(o.h * 0.3, 0.07 * Math.sqrt(o.w * o.h)) * (o.lobe ?? 1), pad = R0 * 2.6 + 4;
  const top = o.y - o.h;
  return { light, baseY, R0, top, cx: o.x, hw: o.w / 2, x0: o.x - o.w / 2 - pad, y0: top - pad, x1: o.x + o.w / 2 + pad, y1: baseY + R0 * 1.8 + 4 };
}

// Rim erosion of every cumulus billow (L1c's sphere edge), round 3's look: a
// fraction of each radius in small bites (about 0.09 of the lobe size).
const EDGE = 0.15;

// The cloud look. Round 4 (look 4, production standard 29): the shade side
// carries engraved blue line hatching by day and by night, running along the
// light's falloff; florets on shaded parents merge into the body, so only the
// lit-side florets read; the day ramp is plate 3's blue-greys, so the crevices
// and the hatching stay one family with the shade; each lit cap steps onto the
// shade with a narrow half-light band (a crisp terminator); rims tear in a few
// large bites (edge 0.1 of each radius at about 0.2 of the lobe size), not in
// speckle; by night the bank's caps are drawn round in moonlit blue (plate 4's
// line modelling, only where the light jumps hard) and its band edges are
// calm. Look 3 is round 3's (lab A/B: ?cl=look:3).
// Look 5 (round 5, production standard 32): the shader's ruled hatch is
// replaced by engraved contour strokes (cloudStrokes) that follow each
// billow's shaded flank, only in the two deepest shade tones, about 12 world
// units apart (10-18 frame px). Look 4 is round 4's (?cl=look:4).
const LOOK = 6;
const ENGRAVE = {
  day: { eng: 1, engS: 12, engW: 5, engT: 0.6, engLo: -0.1, engHiI: 1, engHi: 0.03, engC: 0, engMinR: 7, engN: 2, engLW: 3.4, engLT: 0.85, engLC: 2, engLMinR: 5 },
  night: { eng: 1, engS: 11, engW: 3.6, engT: 0.6, engLo: -0.14, engHiI: 1, engHi: 0.02, engC: 2, engMinR: 6, engN: 2, engLW: 3.4, engLT: 0.9, engLC: 2, engLMinR: 5 },
};
function look(o, night, R0) {
  const v = o.look ?? LOOK;
  if (v < 4) {
    return { rampV: night ? 2 : 5, edge: EDGE, edgeScale: clamp(R0 * 0.09, 3, 7), inheritShade: 0, shadeLift: 0,
      vScale: clamp(R0 * 0.1, 4, 7), vAmp: night ? 0.04 : 0.05,
      hatch: night ? 0 : 0.28, hatchA: 160, hatchS: 4, hatchW: 0.22, hatchWob: 1, hatchDL: 5, hatchLo: 0.02, hatchHiI: 2, hatchHi: -0.02, hatchD: 0.6, hatchC: 0,
      crease: night ? 0.35 : 0, creaseThr: night ? 0.12 : 0.11, creaseC: -1 };
  }
  const K = look4(night, R0);
  if (v < 5) return K;
  // look 5 also tears the band edges a little harder on bigger chips (the
  // plates' torn-paper tone edges), since the ruled hatch no longer carries
  // the interior's fine energy
  // at night the engraving replaces the shader's crease ink too: the crease
  // fired along every silhouette (an uncovered tap reads light 0), so it ringed
  // each lit cap against the sky and closed small florets into loops (the s05
  // bubbles). The contour strokes draw plate 4's line modelling instead.
  const K5 = { ...K, ...(night ? ENGRAVE.night : ENGRAVE.day), hatch: 0, crease: 0, scallop: 1,
    vScale: clamp(R0 * 0.16, 7, 11), vAmp: night ? 0.09 : 0.15, noiseAmp: night ? 0.045 : 0.05, litJit: night ? 0.1 : 0.15 };
  if (v < 6) return K5;
  // Look 6 (round 6): the lit caps get the plates' paper white back. Round 5's
  // litJit (.15 day) dropped florets of EVERY lit cap one tone, which cost the
  // cloud its top tone (white > 240 fell to .054-.174 against the plates'
  // .123-.356) and read as popcorn; it is now a touch (.05 / .03), so each cap
  // keeps an unbroken top-tone plane. The value structure the caps had been
  // leaning on comes from the ramp instead: the day thresholds move the deep
  // crevice tone up to the plates' share (dark 16-24% against plate 3's 18%
  // and plate 5's 16%) and widen the top band; the night ramp's top tone is
  // lifted off the palette's cap so a moonlit cap can print paper white; and
  // the Voronoi chips are flattened (vStretch 1.7), so a band edge tears in
  // horizontal bites like plate 3's lace instead of dotting the shade with
  // round islands.
  return { ...K5, vStretch: night ? 1.5 : 1.7, nTop: night ? '#f7f8fc' : undefined,
    rampThr: night ? [0.28, 0.46, 0.6, 0.72, 0.84] : [0.24, 0.38, 0.57, 0.7],
    litJit: night ? 0.03 : 0.05 };
}
function look4(night, R0) {
  return night
    ? { rampV: 2, edge: 0.07, edgeScale: clamp(R0 * 0.3, 6, 14), inheritShade: 0.8, shadeLift: 0.7,
      vScale: clamp(R0 * 0.2, 8, 14), vAmp: 0.025,
      hatch: 0.7, hatchA: null, hatchS: 5, hatchW: 0.4, hatchWob: 0.35, hatchDL: 7, hatchLo: 0.16, hatchHiI: 3, hatchHi: 0.02, hatchD: 0.4, hatchC: 2,
      crease: 0.8, creaseThr: 0.09, creaseC: 2, bumpParent: true }
    : { rampV: 6, edge: 0.1, edgeScale: clamp(R0 * 0.2, 6, 14), inheritShade: 0.8, shadeLift: 0.7,
      vScale: clamp(R0 * 0.1, 4, 7), vAmp: 0.05,
      hatch: 0.8, hatchA: null, hatchS: 5, hatchW: 0.4, hatchWob: 0.35, hatchDL: 7, hatchLo: -0.04, hatchHiI: 3, hatchHi: -0.03, hatchD: 0.4, hatchC: 0,
      crease: 0, creaseThr: 0.11, creaseC: -1, rim: 0.14, lift: 0.02, minRFloor: 6.5, smallR0: 32 };
}

// The cloud material. nature.js owns the whole cloud look (production
// standards 7, 22 and 29), so the print marks live here as overrides of the
// palette's cloud: the ramp (cloudRamp), band edges broken into angular
// Voronoi chips (warp 0.45: polygonal patches, plate 3's torn-paper edges
// rather than wobbly blobs), engraved strokes on the shade side, crease ink
// only where the light jumps hard (a mass against the body behind it, never
// round every floret), and the rim erosion (look() has the values).
function cloudMat(p, o, R0, light = [-0.5, -0.62, 0.6]) {
  const base = p.mat.cloud, night = p.night;
  const K = look(o, night, R0);
  // the engraved lines run along the light's falloff (perpendicular to the light on
  // screen): from lower left to upper right under an upper-left sun, mirrored under
  // an upper-right moon
  // (always a diagonal hatch, 22-68 degrees off the horizontal: a light from straight
  // above, as moonBank's, would rule the bank with level lines)
  const la = (Math.atan2(light[0], -light[1]) * 180) / Math.PI;
  const a0 = ((la % 180) + 180) % 180;
  const hAng = a0 < 90 ? clamp(a0, 22, 68) : clamp(a0, 112, 158);
  // the look's own ramp thresholds (look 6's day set) are defaults; a lab ?cl= or a caller's option still wins
  const rv = cloudRamp(base, night, o.rampV ?? K.rampV, { rampThr: K.rampThr, rampCols: K.rampCols, nTop: K.nTop, ...o });
  const thr = rv.thr ?? base.thr, ramp = rv.ramp ?? base.ramp;
  const hs = o.hatch ?? K.hatch;
  const hc = o.hatchC ?? K.hatchC, cc = o.creaseC ?? K.creaseC;
  const pick = (i) => ramp[Math.max(0, Math.min(ramp.length - 1, i))];
  // Look 6: short chiselled strokes on the cream caps themselves (the shader's
  // hatch.lit, which works in cloud mode since round 5). Plate 3's lit tops are
  // not blank paper - they carry a fine pale lace at floret scale, which is the
  // 4-12 px tone energy our caps were missing (coarse 10-12 against the plates'
  // 18-24, R5-s01). The band proper is left switched off (lo above 1, so nothing
  // prints in the shade: standard 32's engraving owns the shade side), and the
  // lit strokes turn by litV degrees per litVS-unit patch, so they are chisel
  // marks and not a ruled screen.
  const litS = o.litS ?? K.litS ?? 0;
  const litC = o.litC ?? K.litC ?? ramp.length - 2;
  const hatch = hs > 0 || litS > 0 ? {
    angle: o.hatchA ?? K.hatchA ?? hAng, jitter: 1, wobble: o.hatchWob ?? K.hatchWob,
    spacing: hs > 0 ? (o.hatchS ?? K.hatchS) : (o.litSp ?? K.litSp ?? 8),
    wfrac: hs > 0 ? (o.hatchW ?? K.hatchW) : (o.litW ?? K.litW ?? 0.26),
    dashLen: hs > 0 ? (o.hatchDL ?? K.hatchDL) : (o.litDL ?? K.litDL ?? 3),
    dash: hs > 0 ? (o.hatchD ?? K.hatchD) : (o.litD ?? K.litD ?? 0.5),
    strength: hs > 0 ? hs : 1,
    lit: hs > 0 ? 0 : litS,
    vary: hs > 0 ? 0 : (o.litV ?? K.litV ?? 70), varyScale: o.litVS ?? K.litVS ?? 34,
    lo: hs > 0 ? thr[0] + (o.hatchLo ?? K.hatchLo) : 1.4,
    hi: hs > 0 ? thr[Math.min(thr.length - 1, o.hatchHiI ?? K.hatchHiI)] + (o.hatchHi ?? K.hatchHi)
      : thr[thr.length - 1] + (o.litLo ?? K.litLo ?? -0.02),
    color: hs > 0 ? (typeof hc === 'string' ? hc : pick(hc)) : (typeof litC === 'string' ? litC : pick(litC)),
  } : null;
  return mat(base, { ...rv,
    noise: { scale: o.noiseScale ?? clamp(R0 * 0.2, 8, 14), amp: o.noiseAmp ?? K.noiseAmp ?? 0.035, vScale: o.vScale ?? K.vScale, vAmp: o.vAmp ?? K.vAmp, warp: o.warp ?? K.warp ?? 0.45, vStretch: o.vStretch ?? K.vStretch ?? 1 },
    // the shade side's engraving (look 4) or the lit caps' chisel lace (look 6)
    hatch,
    ink: o.creaseInk ?? (cc >= 0 ? pick(cc) : (night ? '#8d9fd0' : '#9fb0d8')), outline: { width: 0, sil: 0, crease: o.crease ?? K.crease, creaseThr: o.creaseThr ?? K.creaseThr },
    edge: o.edge ?? K.edge, edgeScale: o.edgeScale ?? K.edgeScale });
}

// The cumulus ramp: the palette's cloud ramp with a second lit tone (a warm
// pale grey between the pale-blue shade and the white tops, as in plates 2, 3
// and 5, or a pale blue by night as in plate 4), so the lit side is modelled
// rather than one flat white. v (lab): 0 = the palette ramp as it is; 4 (day
// default) greys the shade toward plate 3's blue-greys (#6d82a5, #869ac2) and
// warms the top toward its cream, with thresholds that give the deep shade
// about a sixth of the cloud; 2 (night default) lifts the shade toward plate
// 4's moonlit blues (#8499c1, #a5b8de, #cad8f0); 1 and 3 are round 2's.
function cloudRamp(base, night, v = night ? 2 : 5, o = {}) {
  const r = base.ramp, t = base.thr;
  if (!v || r.length !== 5) return {};
  if (v === 4 && !night) {
    const ramp = [mixHex(r[0], '#4a5d8e', 0.35), mixHex(r[1], '#6d82a5', 0.45), mixHex(r[2], '#869ac2', 0.55), mixHex(r[3], '#c9cdd7', 0.4), '#e6e2d9', mixHex(r[4], '#f6f0e6', 0.6)];
    return { ramp, thr: [0.28, 0.5, 0.66, 0.76, 0.85] };
  }
  // (the deepest tone is a cloud blue well above the sky's navy: the round-2
  // 'holes' in s06b's bank were crevices printed in a tone of the sky's colour)
  if (v === 5 && !night) {
    const ramp = [mixHex(r[1], '#4a5d8e', 0.5), mixHex(r[1], '#6d82a5', 0.45), mixHex(r[2], '#869ac2', 0.55), mixHex(r[3], '#c9cdd7', 0.4), mixHex(r[4], '#f6f0e6', 0.6)];
    return { ramp, thr: [0.28, 0.5, 0.68, 0.8] };
  }
  if (v === 6 && !night) {
    return { ramp: o.rampCols ?? ['#5f749c', '#7287b0', '#8fa1c8', '#cdd3e0', '#f8f4ec'], thr: o.rampThr ?? [0.16, 0.34, 0.56, 0.72] };
  }
  if (v === 2 && night) {
    // the top tone is the cloud's own (standard 22: nature.js owns the cloud
    // look, including the material overrides it needs), lifted off the
    // palette's cap: N.cloud.ramp[4] is L 239.6, so a moonlit cap could not
    // reach the plates' paper white (crop 5-cloud .146 and 4-moon-clouds .110
    // above L 240, s05 .073 and s11 .054 in round 5 - R5-s11). '#f7f8fc' is
    // L 246.6, the same blue-white, so a cap's interior can print white while
    // its crevice lace and the rest of the ramp are unchanged.
    const ramp = [mixHex(r[1], '#3a4f98', 0.6), mixHex(r[1], '#5a6fae', 0.5), mixHex(r[2], '#8499c1', 0.6), mixHex(r[3], '#a5b8de', 0.5), '#cad6ee', o.nTop ?? r[4]];
    return { ramp, thr: o.rampThr ?? [0.28, 0.46, 0.6, 0.72, 0.84] };
  }
  const lit2 = night ? mixHex(r[3], r[4], 0.52) : mixHex(mixHex(r[3], r[4], 0.55), '#ece4d6', 0.45);
  const ramp = [r[0], r[1], r[2], r[3], lit2, r[4]];
  const thr = v === 2 ? [t[0], t[1], t[2], t[3], 0.88] : v === 3 ? [t[0], t[1] + 0.02, t[2] + 0.05, t[3] - 0.02, 0.86] : [t[0], t[1], t[2], t[3] - 0.03, 0.85];
  return { ramp, thr };
}

// Engraved contour strokes (production standard 32): the engraving models the
// billows. Each billow's shaded flank carries a few curved strokes that follow
// its own outline (concentric with the billow, on the side away from the
// light), so the lines bend with every bulge and change angle from billow to
// billow: never a ruled screen. They print only where the sphere shading puts
// the two deepest shade tones (E.lo .. E.hi of the guide's light, the same
// formula as the sphere shader's), only where the billow is the front-most
// (the same depth test), above the flat base and inside the eroded rim; they
// thin out toward the lighter tone and taper at both ends, and the deepest
// crevices carry the heaviest lines. Spacing (E.s) and width (E.w) are world
// units; a frame shows them at about 10-18 px apart.
// sp: rendered spheres [{ x, y, r, z, bias }]; S: the spheres pass's shading
// options; E: engraving options (engraveOpts). Returns strokes [Float32Array
// of x, y, half-width triples].
function* cloudStrokes(sp, S, E) {
  const n0 = Math.hypot(S.light[0], S.light[1], S.light[2]) || 1;
  const lx = S.light[0] / n0, ly = S.light[1] / n0, lz = S.light[2] / n0;
  const amb = S.ambient, dif = S.diffuse, fl = S.flatness ?? 0.65, gm = S.globalMix ?? 0.45, bd = S.baseDark ?? 0.8;
  const [gcx, gcy, grx, gry] = S.global;
  const baseY = S.flatBase === false ? Infinity : S.baseY, topY = S.topY, bh = Math.max(1, S.baseY - S.topY);
  // the guide's light at (x, y) on sphere s (illustrate.js SFRAG, without the
  // material's noise, which moves a band edge by a few hundredths at most)
  const lightAt = (s, x, y) => {
    const vx = (x - s.x) / s.r, vy = (y - s.y) / s.r, r2 = vx * vx + vy * vy;
    if (r2 >= 1) return -1;
    const z = Math.sqrt(1 - r2), nx = vx * fl, ny = vy * fl, nl = Math.hypot(nx, ny, z);
    let lam = Math.max(0, (nx * lx + ny * ly + z * lz) / nl);
    const gx = (x - gcx) / Math.max(1, grx), gy = (y - gcy) / Math.max(1, gry), g2 = Math.min(1, gx * gx + gy * gy);
    const glam = Math.max(0, gx * lx + gy * ly + Math.sqrt(1 - g2) * lz);
    lam += (glam - lam) * gm;
    let L = amb + dif * lam + (s.bias ?? 0);
    const f = clamp((y - topY) / bh);
    L *= 1 + (bd - 1) * f * f;
    return clamp(L);
  };
  const grid = sphereGrid(sp);
  sp.forEach((s, i) => grid.add(s, i));
  yield;
  grid.sortByFront(sp);
  yield;
  const front = (n, s, x, y) => {
    const zs = surfZ(s, x, y);
    for (const m of grid.at(x, y)) {
      const o = sp[m];
      if (o.z + o.r <= zs + 0.01) return true;   // this and every later sphere lie behind the point
      if (m !== n && surfZ(o, x, y) > zs + 0.01) return false;
    }
    return true;
  };
  const ls = Math.hypot(lx, ly) || 1, tShade = Math.atan2(-ly / ls, -lx / ls);
  const out = [];
  let work = 0;
  // torn rim (plate 3's edge): tiny tufts of the cloud's own tones along the
  // parts of a rim that make the silhouette, so the outline tears at a 1-3 unit
  // scale instead of printing as a smooth arc. They are attached (their base
  // sits inside the billow), so no detached specks appear.
  const T = E.rim;
  if (T && T.n > 0) {
    const rng = new RNG(E.seed + 'rim');
    for (let n = 0; n < sp.length; n++) {
      const s = sp[n];
      if (s.back || s.r < T.minR) continue;
      if (++work % 16 === 0) yield;
      const rr = rng.fork(n);
      const probe = s.r + Math.max(1.6, s.r * 0.07);
      let a = rr.range(0, TAU);
      const end = a + TAU;
      while (a < end) {
        const long = rr.chance(T.long);
        const w = rr.range(T.w[0], T.w[1]) * (long ? 0.55 : 1);
        const len = rr.range(T.out[0], T.out[1]) * (long ? T.longK : 1);
        const step = (w + rr.range(T.gap[0], T.gap[1])) / s.r;
        a += step;
        const ca = Math.cos(a), sa = Math.sin(a);
        const qx = s.x + ca * probe, qy = s.y + sa * probe;
        if (qy > baseY) continue;
        let open = true;
        for (const m of grid.at(qx, qy)) { if (m === n) continue; const o = sp[m], dx = qx - o.x, dy = qy - o.y; if (dx * dx + dy * dy < o.r * o.r * 0.92) { open = false; break; } }
        if (!open || rr.chance(T.skip)) continue;
        const L = lightAt(s, s.x + ca * s.r * 0.86, s.y + sa * s.r * 0.86);
        if (L < 0) continue;
        const pts = new Float32Array(4 * 3);
        const lean = rr.range(-T.lean, T.lean) * (long ? 2.2 : 1);
        for (let j = 0; j < 4; j++) {
          const u = j / 3, rq = s.r - T.sink * (w + len) + (len + T.sink * w) * u;
          const t = a + lean * u * (w / Math.max(4, s.r));
          pts[j * 3] = s.x + Math.cos(t) * rq; pts[j * 3 + 1] = s.y + Math.sin(t) * rq;
          pts[j * 3 + 2] = (w / 2) * (1 - (long ? 0.6 : 0.82) * u * u);
        }
        out.push({ pts, color: T.color(L), sortKey: 1 });
      }
    }
    out.sort((p1, p2) => (p1.color < p2.color ? -1 : p1.color > p2.color ? 1 : 0));
  }
  for (const F of E.fams) {
    if (!(F.w > 0)) continue;
    const rng = new RNG(E.seed + F.tag);
    const span = Math.max(0.02, F.hi - F.lo);
    const rimK = 1 - (E.edge ?? 0) - 0.03;
    // the family's strokes sit on the side of each billow away from the light
    // (the shade engraving) or, for the pale lace, on the lit cap's lower rim
    for (let n = 0; n < sp.length; n++) {
      const s = sp[n];
      if (s.back || s.r < F.minR) continue;        // a back billow is hidden behind the mass
      if (++work % 16 === 0) yield;
      const rr = rng.fork(n);
      // ring 0 hugs the billow's rim: with F.crevice it prints only where the
      // cloud goes on past the rim (another billow lies behind it there), so it
      // marks the crevice between two billows and never outlines the cloud
      // against the sky; the inner rings keep to the deeper part of the band
      const rho0 = s.r * rimK - F.w * 0.55 - rr.range(0, 0.25) * F.s;
      const rOut = s.r + Math.max(2, s.r * 0.08);
      const behind = (t) => {
        const qx = s.x + Math.cos(t) * rOut, qy = s.y + Math.sin(t) * rOut;
        if (qy > baseY) return true;
        for (const m of grid.at(qx, qy)) {
          if (m === n) continue;
          const o = sp[m], dx = qx - o.x, dy = qy - o.y;
          if (dx * dx + dy * dy < o.r * o.r * 0.94) return true;
        }
        return false;
      };
      for (let k = 0; k < F.rings; k++) {
        const rho = rho0 - k * F.s * rr.range(0.9, 1.15);
        if (rho < Math.max(s.r * 0.3, F.w)) break;
        const half = ((F.win - k * F.winK) * Math.PI / 180) * rr.range(0.8, 1.15);
        if (half < 0.3) break;
        const hiK = F.hi - k * F.hiK, wK = k ? F.inner : 1;
        const mid = tShade + rr.range(-0.35, 0.35) + F.turn;
        const dT = Math.min(0.09, 1.6 / rho);
        const nT = Math.max(2, Math.ceil((2 * half) / dT));
        // walk the window: runs of samples that are in the band, visible and above the base
        let run = null;
        const flush = () => {
          if (run && run.length >= 4) {
            // a run breaks into dashes with gaps; each dash tapers at both ends
            let i = 0;
            while (i < run.length) {
              const len = Math.max(3, Math.round(rr.range(F.dash[0], F.dash[1]) / (dT * rho)));
              const seg = run.slice(i, i + len);
              i += len + Math.round(rr.range(F.gap[0], F.gap[1]) / (dT * rho));
              if (seg.length < 3 || seg.length * dT * rho < F.dash[0] * 0.5) continue;
              const pts = new Float32Array(seg.length * 3);
              const wob = rr.range(-0.6, 0.6) * F.wob, wf = rr.range(1.5, 3.5);
              seg.forEach(([t, L], j) => {
                const u = j / (seg.length - 1);
                const taper = Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * u)), 0.7);
                const tone = clamp(F.tone + (1 - F.tone) * 1.2 * (F.sign * (hiK - L)) / span) * wK;
                const rq = rho + wob * Math.sin(u * wf);
                pts[j * 3] = s.x + Math.cos(t) * rq; pts[j * 3 + 1] = s.y + Math.sin(t) * rq;
                pts[j * 3 + 2] = (F.w / 2) * taper * tone;
              });
              out.push({ pts, color: F.color });
            }
          }
          run = null;
        };
        for (let j = 0; j <= nT; j++) {
          const t = mid - half + (2 * half * j) / nT;
          const x = s.x + Math.cos(t) * rho, y = s.y + Math.sin(t) * rho;
          let ok = y < baseY - F.w;
          let L = 0;
          if (ok) { L = lightAt(s, x, y); ok = L >= F.lo && L <= hiK; }
          if (ok) ok = front(n, s, x, y);
          if (ok && k === 0 && F.crevice) ok = behind(t);
          if (ok) (run || (run = [])).push([t, L]);
          else flush();
        }
        flush();
      }
    }
  }
  return out;
}
// Draw strokes as tapered ribbons (one path and one fill per colour, in
// batches of `batch` with a yield between them, so a cloud with thousands of
// strokes never makes one long bake unit: production standards 17 and 23).
function* drawStrokes(ctx, strokes, batch = 500) {
  let col = null, n = 0;
  for (const st of strokes) {
    if (st.color !== col || ++n % batch === 0) {
      if (col !== null) { ctx.fill(); if (n % batch === 0) yield; }
      col = st.color; ctx.fillStyle = col; ctx.beginPath();
    }
    const pts = st.pts;
    const m = pts.length / 3;
    if (m < 2) continue;
    // left edge forward, right edge back (offsets along the stroke's normal)
    const side = (j, sg) => {
      const a = Math.max(0, j - 1), b = Math.min(m - 1, j + 1);
      let tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = pts[j * 3 + 2] * sg;
      return [pts[j * 3] - ty * w, pts[j * 3 + 1] + tx * w];
    };
    const p0 = side(0, 1);
    ctx.moveTo(p0[0], p0[1]);
    for (let j = 1; j < m; j++) { const q = side(j, 1); ctx.lineTo(q[0], q[1]); }
    for (let j = m - 1; j >= 0; j--) { const q = side(j, -1); ctx.lineTo(q[0], q[1]); }
    ctx.closePath();
  }
  if (col !== null) ctx.fill();
}

// Layout and per-billow shading of a cumulus, cached: a shot re-bakes the
// same clouds after a seek, a resize or a second viewing.
const CLOUD_CACHE = new Map();
function cloudKey(o, night) {
  const { mat: _m, ...key } = o;
  try { return JSON.stringify(key) + (night ? 'N' : 'D'); } catch (err) { return null; }
}
function cloudCached(o, night) { const k = cloudKey(o, night); return k ? CLOUD_CACHE.get(k) : undefined; }
// The layout as a generator (it yields every few ms of work); returns the shaded spheres.
function* cloudLayout(o, night) {
  const k = cloudKey(o, night);
  const hit = k && CLOUD_CACHE.get(k);
  if (hit) return unpackSpheres(hit.data);
  const F = cloudFrame(o, night), R0 = F.R0, light = F.light, baseY = F.baseY;
  const K = look(o, night, R0);
  const rng = new RNG(o.seed ?? 'cumulus');
  let sp;
  if (o.billows) {
    // supplied billows (e.g. bankBillows): dome depth as in v2, one mass
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity;
    for (const b of o.billows) { const r = Math.max(b.rx ?? b.r, b.ry ?? b.r); x0 = Math.min(x0, b.x - r); y0 = Math.min(y0, b.y - r); x1 = Math.max(x1, b.x + r); }
    const cx = o.x ?? (x0 + x1) / 2, hw = Math.max(1, (x1 - x0) / 2);
    const depth = o.depth ?? (o.h ?? (baseY - y0)) * 0.55;
    sp = o.billows.map((b) => {
      const r = ((b.rx ?? b.r) + (b.ry ?? b.r)) / 2;
      const u = Math.min(1, Math.abs(b.x - cx) / hw);
      const low = (b.y - y0) / Math.max(1, baseY - y0);
      const z = b.z ?? (depth * Math.sqrt(Math.max(0, 1 - u * u)) * (0.55 + 0.45 * low) + (b.interior ? r * 0.6 : 0) + (b.bump ? r * 0.8 : 0) + rng.range(0, r * 0.25));
      return { x: b.x, y: b.y, r, z, bias: b.bias, level: b.bump ? 1 : 0, mass: b.mass ?? 'all' };
    });
    // look 4: a bump floret belongs to the billow it sits on (the nearest, by
    // distance over radius), so it shares that billow's tone like any floret
    // and the crease ink does not ring it on a lit cap; parents shade first
    if (K.bumpParent) {
      const big = sp.filter((q) => !q.level), bumps = sp.filter((q) => q.level);
      for (const q of bumps) {
        let best = null, bd = Infinity;
        for (const c of big) { const d = Math.hypot(q.x - c.x, q.y - c.y) / c.r; if (d < bd) { bd = d; best = c; } }
        if (best && bd < 1.4) { q.par = best; q.root = best; q.px = best.x; q.py = best.y; q.pr = best.r; }
      }
      sp = [...big, ...bumps];
    }
  } else sp = cumulusLobes(rng, o);
  yield;
  // detail < 1 keeps only the coarser cauliflower (smallest floret grows); > 1 adds finer florets
  // (look 4: a small cloud keeps one level of bigger florets, so its cap is massed, not popcorn)
  const minR = o.minR ?? Math.max(K.minRFloor ?? 4, R0 * 0.16) / Math.max(0.3, o.detail ?? 1);
  if (o.cauliflower !== false) yield* cauliflower(rng.fork('cauli'), sp, { levels: o.levels ?? (K.smallR0 && R0 < K.smallR0 ? 1 : 2), minR, light, faceR: R0 * (o.faceR ?? 1.6), kidMin: R0 * (o.kidMin ?? 0.7), deepMin: R0 * (o.deepMin ?? 1.1) });
  // the scalloped outline (look 5): small florets where a rim makes the silhouette
  const sc = o.scallop ?? K.scallop;
  if (sc) {
    yield;
    yield* rimScallop(rng.fork('scallop'), sp, { ratio: [o.scR0 ?? 0.12, o.scR1 ?? 0.24], minR: o.scMinR ?? Math.max(2.6, R0 * 0.055),
      rho: o.scRho ?? 0.84, step: o.scStep ?? 1.7, skip: o.scSkip ?? 0.25, baseY: o.flatBase === false ? Infinity : baseY, minParent: R0 * (o.scMinP ?? 0.28) });
  }
  // every sphere in front of the depth origin, so each draws to its full radius
  // (the shader drops fragments at depth <= 0: back billows lost their rims and
  // opened holes between the lobes), with room behind them for the hole fillers
  const edge = o.edge ?? K.edge, holeR = (Math.max(2, R0 * 0.25) * 1.5) / Math.max(0.3, 1 - edge);
  let zMin = Infinity, yTop = Infinity;
  for (const s of sp) { if (!Number.isFinite(s.z)) s.z = 0; zMin = Math.min(zMin, s.z); yTop = Math.min(yTop, s.y - s.r); }
  if (zMin < holeR + 2) for (const s of sp) s.z += holeR + 2 - zMin;
  const masses = massEllipses(sp, baseY, o.massCy ?? (night ? 0.7 : 0.62));
  const H = Math.max(1, baseY - yTop);
  yield;
  sp = yield* shadeBillows(sp, light, masses, { baseY, R0, mass: o.massLight ?? (night ? 0.62 : 0.72), massMid: o.massMid ?? (night ? 0.36 : 0.37), massK: o.massK ?? 0, rim: o.rim ?? K.rim ?? 0.2, lift: o.lift ?? K.lift ?? 0.04,
    crevice: o.crevice ?? 0.24, shadow: o.shadow ?? 0.35, minBias: o.minBias ?? (night ? -0.22 : -0.3), jitter: o.jitter ?? 0, ao: o.ao ?? (night ? 0.18 : 0.4), aoLo: o.aoLo ?? 0.1, aoSelf: o.aoSelf ?? (night ? 0.2 : 0.45), shadeFade: o.shadeFade ?? 1.5,
    baseBand: o.baseBand ?? (night ? 0.08 : 0.1), baseBandH: (o.baseBandH ?? 0.12) * H, inherit: o.inherit ?? 0.5, inheritShade: o.inheritShade ?? K.inheritShade, edgeAO: o.edgeAO ?? 0.25, shadeLift: o.shadeLift ?? K.shadeLift,
    litJit: o.litJit ?? K.litJit ?? 0 });
  yield;
  // no holes (standard 22): back billows wherever the rendered spheres leave the body open to the sky
  if (o.fill !== false && o.fill !== 0) fillHoles(sp, { baseY, R0, edge, flatBase: o.flatBase !== false });
  // (the sixth field is the back-billow flag: the engraving skips back billows,
  // so a cached re-bake draws exactly the strokes the first bake drew)
  const data = new Float32Array(sp.length * 6);
  sp.forEach((q, i) => data.set([q.x, q.y, q.r, q.z, q.bias ?? 0, q.back ? 1 : 0], i * 6));
  if (k) {
    if (CLOUD_CACHE.size >= 32) CLOUD_CACHE.delete(CLOUD_CACHE.keys().next().value);
    CLOUD_CACHE.set(k, { data });
  }
  return unpackSpheres(data);
}
// The same, run through at once (lab tools).
function cloudSpheres(o, night) {
  const it = cloudLayout(o, night);
  let r = it.next();
  while (!r.done) r = it.next();
  const F = cloudFrame(o, night);
  return { sp: r.value, R0: F.R0, light: F.light, baseY: F.baseY };
}
// The cache keeps only what the render needs: x, y, r, z, bias per sphere.
function unpackSpheres(d) {
  const out = new Array(d.length / 6);
  for (let i = 0; i < out.length; i++) out[i] = { x: d[i * 6], y: d[i * 6 + 1], r: d[i * 6 + 2], z: d[i * 6 + 3], bias: d[i * 6 + 4], back: d[i * 6 + 5] > 0.5 };
  return out;
}

const hexRGB = (c) => { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
function mixHex(a, b, t) {
  const A = hexRGB(a), B = hexRGB(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Horizontal streak clouds near the horizon (plates 2 and 4): long flat bands
// stacked in tiers, each with a flat underside, a lumpy lit top (a row of
// little cumulus heads), a pale shaded body and tapered, wispy ends; fine
// hairline wisps run between the tiers. Lower tiers, nearer the horizon,
// are thinner and shorter. Colours come from the cloud material's ramp, so
// streaks match the cumulus tones by day and by night.
// o: { x0, x1, y (middle of the streak zone), depth (vertical spread, ±),
//      count, seed, scale (size), color (lit top), shadeColor (body), mat,
//      ends (true: x0..x1 bound the bands' ends; default: their centres),
//      len (band length factor, default 1), hairs (0: no hairline wisps) }
export function streaks(p, o) {
  const rng = new RNG(o.seed ?? 'streaks');
  const { x0, x1, y, count = 14 } = o;
  const depth = Math.max(0, o.depth ?? 60);
  const sc = o.scale ?? 1;
  // thickness and length follow the scale gently, so small scales stay bands, not hairlines
  const kt = 0.45 + 0.55 * sc, kl = (0.4 + 0.6 * sc) * (o.len ?? 1);   // o.len: band length factor
  const ramp = (o.mat ?? p.mat.cloud).ramp;
  const n = ramp.length;
  const white = o.color ?? ramp[n - 1];
  // the shaded body: pale blue under the lit tops (by day halfway between the two palest shade tones)
  const body = o.shadeColor ?? (p.night ? ramp[n - 2] : mixHex(ramp[n - 2], ramp[Math.max(0, n - 3)], 0.5));
  const under = ramp[Math.max(0, n - 3)];
  // tiers: a few levels across the zone, each holding overlapping bands
  const nT = Math.max(1, Math.min(6, Math.round(1 + depth / (9 * kt))));
  const tiers = [];
  for (let i = 0; i < nT; i++) tiers.push(nT === 1 ? y : y - depth + (2 * depth * (i + rng.range(-0.2, 0.2))) / (nT - 1));
  const bands = [], hairs = [];
  for (let i = 0; i < count; i++) {
    const ty = tiers[Math.min(nT - 1, Math.floor(rng.next() * nT))];
    const near = depth > 0 ? (ty - (y - depth)) / (2 * depth) : 0.5;   // 0 top tier … 1 nearest the horizon
    const persp = 1.25 - 0.6 * near;
    // o.ends: x0 and x1 bound the bands' ends (not their centres), so a band can
    // start exactly behind a figure; the same random numbers are drawn either way
    const place = (cx, len) => (o.ends ? Math.min(x1, Math.max(x0, x0 + len / 2 + (cx - x0) / Math.max(1e-6, x1 - x0) * (x1 - x0 - len))) : cx);
    if (rng.chance(0.18) && (o.hairs ?? 1) > 0) { // hairline wisp (o.hairs 0: none)
      const cx = rng.range(x0, x1), cy = ty + rng.range(-1, 1) * depth * 0.3, hl = rng.range(160, 520) * kl * persp, len = o.ends ? Math.min(hl, x1 - x0) : hl;
      hairs.push({ cx: place(cx, len), cy, len, th: rng.range(0.8, 1.7) * kt * persp });
      continue;
    }
    const len0 = rng.range(180, 560) * kl * persp, len = o.ends ? Math.min(len0, x1 - x0) : len0;
    const th = rng.range(3.6, 8.6) * kt * persp;
    const heads = [];
    for (let u = rng.range(0.05, 0.2); u < 0.95; u += (th * rng.range(2.0, 5.0)) / len) heads.push({ u, w: (th * rng.range(1.1, 2.8)) / len, a: rng.range(0.3, 1) });
    bands.push({ cx: place(rng.range(x0, x1), len), cy: ty + rng.range(-1, 1) * th * 0.7, len, th, heads, phase: rng.range(0, TAU) });
  }
  bands.sort((a, b) => a.cy - b.cy);
  const outline = (b) => {
    const n = Math.max(10, Math.min(160, Math.round(b.len / Math.max(1.5, b.th * 0.45))));
    const top = [], mid = [], bot = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const env = Math.pow(Math.sin(Math.PI * u), 0.55);
      let bump = 0;
      for (const hd of b.heads) { const d = (u - hd.u) / hd.w; if (d > -1 && d < 1) bump = Math.max(bump, hd.a * Math.sqrt(1 - d * d)); }
      const T = b.th * env * (0.68 + 0.62 * bump);
      const px = b.cx - b.len / 2 + u * b.len;
      const by = b.cy + b.th * 0.06 * Math.sin(u * 7 + b.phase) * env;
      top.push([px, by - T]); mid.push([px, by - T * 0.5]); bot.push([px, by]);
    }
    return { top, mid, bot };
  };
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const b of [...bands, ...hairs]) {
    bx0 = Math.min(bx0, b.cx - b.len / 2); bx1 = Math.max(bx1, b.cx + b.len / 2);
    by0 = Math.min(by0, b.cy - b.th * 1.4); by1 = Math.max(by1, b.cy + b.th * 0.2);
  }
  const sbox = bands.length + hairs.length ? { x: bx0 - 2, y: by0 - 2, w: bx1 - bx0 + 4, h: by1 - by0 + 4 } : { x: x0, y, w: 1, h: 1 };
  p.ink((ctx) => {
    // hairline wisps first (behind the bands)
    ctx.fillStyle = white;
    ctx.beginPath();
    for (const h of hairs) {
      const n = 24;
      for (let k = 0; k <= n; k++) { const u = k / n, px = h.cx - h.len / 2 + u * h.len, t = h.th * Math.pow(Math.sin(Math.PI * u), 0.8); k ? ctx.lineTo(px, h.cy - t) : ctx.moveTo(px, h.cy - t); }
      for (let k = n; k >= 0; k--) { const u = k / n, px = h.cx - h.len / 2 + u * h.len; ctx.lineTo(px, h.cy); }
      ctx.closePath();
    }
    ctx.fill();
    for (const b of bands) {
      const { top, mid, bot } = outline(b);
      // shaded body, the lit top half, then a pale line along the flat underside
      ctx.fillStyle = body;
      ctx.beginPath(); poly(ctx, [...top, ...bot.slice().reverse()]); ctx.fill();
      ctx.fillStyle = white;
      ctx.beginPath(); poly(ctx, [...top, ...mid.slice().reverse()]); ctx.fill();
      const k0 = Math.floor(bot.length * 0.18), k1 = Math.ceil(bot.length * 0.82);
      if (k1 - k0 > 2) {
        const lw = Math.max(p.px, b.th * 0.16);
        ctx.fillStyle = under;
        ctx.beginPath(); poly(ctx, [...bot.slice(k0, k1).map(([a, c]) => [a, c - lw]), ...bot.slice(k0, k1).reverse()]); ctx.fill();
      }
    }
  }, { bbox: sbox });
}

// ---------------------------------------------------------------- mountain
// A broad, Fuji-like cone (Mount Ida) with snow streaks down the ridges.
export function mountain(p, o) {
  const { x, y, w, h } = o; // x = peak x, y = base y, w = base width, h = height; o.lightSide: -1 lit from the left (default), +1 from the right; o.snow (0..1, default 1)
  const rng = new RNG(o.seed ?? 'ida');
  const nz = makeNoise(rng.int(1, 1e6));
  const pts = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const u = i / N * 2 - 1; // -1..1
    const au = Math.abs(u);
    const prof = Math.pow(1 - au, o.concave ?? 1.9);
    const ft = o.flatTop ?? 0.06;   // a truncated summit (Fuji's crater rim), as a fraction of the half-width
    const flat = au < ft ? 1 - (ft - au) * (o.flatTop ? 1.6 : 0.6) : 1;
    const px = x + u * w / 2;
    const py = y - h * prof * flat + nz.fbm(px * 0.02, 1.3, 3) * h * 0.025 * (1 - prof);
    pts.push([px, py]);
  }
  pts.push([x + w / 2, y + 2], [x - w / 2, y + 2]);
  const bbox = bboxOf(pts, 4);
  const ridges = [];
  const nr = o.ridges ?? 26;
  for (let i = 0; i < nr; i++) ridges.push(rng.range(-1, 1));
  // a quieter texture than the palette's on the broad slopes: the ridges carry the form
  const mm = o.mat ?? mat(p.mat.mountain, { noise: { amp: 0.035, vAmp: 0.02 } });
  p.pass(mm, (g) => {
    g.save();
    g.beginPath(); poly(g, pts); g.clip();
    // the bare slope in the middle of its tone band (0.6-0.8), so the band noise
    // never crosses a threshold in blotches: the ridges and the snow carry the form
    g.fillStyle = L(o.slope ?? 0.7, 0, 0); g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    // ridges and gullies running down from the peak: each follows the concave
    // slope (steep under the summit, flattening toward the foot) and widens as
    // it goes; lit on the side toward the light, shaded on the other
    const conc = o.concave ?? 1.9;
    for (let i = 0; i < nr; i++) {
      const u = ridges[i];
      const bx = x + u * w * 0.55;
      // (round 6, R5-s01: the lit ridges ran 0.62-0.9 against a 0.7 slope and
      // every one of them started at the summit, so 18 bright wedges fanned out
      // of the cap like sun rays instead of plate 2's horizontal banding. They
      // now sit in a narrower band just off the slope tone, and each starts a
      // quarter of the way down, so no wedge touches the summit. o.ridgeLit
      // restores a wider range.)
      const rl = o.ridgeLit ?? (o.slope === undefined ? [0.83, 0.9] : [0.66, 0.78]);
      // the gully side of a ridge: a full tone below the slope only on a bare
      // cone; with bedding it stays within a step, so the flank is banded and
      // not striped with dark columns (plate 2's flanks differ by 1.4 L)
      const rs2 = o.ridgeShade ?? (o.beds ? [0.46, 0.6] : [0.28, 0.52]);
      const lit = u * (o.lightSide ?? -1) > 0 ? rng.range(rl[0], rl[1]) : rng.range(rs2[0], rs2[1]);
      const sw = w * rng.range(o.ridgeW?.[0] ?? 0.01, o.ridgeW?.[1] ?? 0.03), bend = rng.range(-0.04, 0.04) * w;
      const t0 = o.ridgeTop ?? (o.beds ? 0.25 : 0);
      const left = [], right = [];
      for (let k = 0; k <= 10; k++) {
        const t = t0 + (1 - t0) * (k / 10);
        const cx = x + u * w * 0.02 + (bx - x - u * w * 0.02) * t + bend * Math.sin(Math.PI * t);
        const cy = y - h * 0.97 * Math.pow(1 - t, conc) + 4 * t;
        const hw = sw * (0.15 + 0.85 * Math.pow(t, 0.8));
        left.push([cx - hw, cy]); right.push([cx + hw, cy]);
      }
      g.fillStyle = L(lit, 0, 0);
      g.beginPath(); poly(g, [...left, ...right.reverse()]); g.fill();
    }
    // bedding: broken near-horizontal strokes one ramp step below the slope tone
    // across the lower two thirds, so the cone is modelled by hatching as in
    // plate 2 rather than by the wide ridge wedges alone (o.beds = 0 turns them off)
    const nb = o.beds ?? 0;
    // o.beds2: a second, deeper bedding tone (that many ramp steps below the
    // slope), interleaved with the first, so the banding reads at 1x as plate 2's
    // does instead of sitting one step off the slope and vanishing (R5-s01)
    const steps2 = nb > 0 ? [o.bedStep ?? 0.12, ...(o.beds2 ? [o.beds2] : [])] : [];
    for (const bstep of steps2) {
      const sl = o.slope ?? 0.7;
      g.fillStyle = L(Math.max(0.05, sl - bstep), 0, 0);
      g.beginPath();
      for (let i = 0; i < nb; i++) {
        const t = 0.24 + 0.74 * (i / Math.max(1, nb - 1)) + rng.range(-0.04, 0.04);   // altitude: 1 = base
        const cy = y - h * 0.97 * Math.pow(1 - t, conc) + 4 * t;
        const halfW = (w / 2) * (1 - Math.pow(1 - t, 1 / Math.max(0.3, conc))) * 0.98;
        let u = -halfW + rng.range(0, halfW * 0.3);
        while (u < halfW) {
          const len = halfW * rng.range(0.1, 0.42), th = h * rng.range(0.004, 0.011);
          if (rng.chance(0.28)) { u += len + halfW * rng.range(0.04, 0.18); continue; }
          const x0 = x + u, x1 = x + Math.min(halfW, u + len);
          const tilt = rng.range(-0.012, 0.012) * w;
          g.moveTo(x0, cy + rng.range(-2, 2)); g.lineTo(x1, cy + tilt);
          g.lineTo(x1, cy + tilt + th); g.lineTo(x0, cy + th * 0.6); g.closePath();
          u += len + halfW * rng.range(0.03, 0.14);
        }
      }
      g.fill();
    }
    // snow in B, painted crisp (the shader's own streaks only fray its edge):
    // a cap down to o.snow x 30% of the height, its lower edge jagged, with
    // tongues of snow running further down the ridges (plate 2's Fuji)
    const sn = clamp(o.snow ?? 1, 0, 1);
    if (sn > 0) {
      const capD = h * 0.3 * sn, edge = [];
      for (let k = 0; k <= 40; k++) {
        const px = x - w * 0.36 + (w * 0.72 * k) / 40;
        // the cap's lower edge: an altitude, jagged (lower on the ridges, higher in the gullies)
        edge.push([px, y - h + capD * (0.7 + 0.6 * Math.abs(nz.n2(px * 0.05, 5.3)))]);
      }
      g.globalCompositeOperation = 'lighter';   // B on top of the painted light
      g.fillStyle = 'rgb(0,0,255)';
      g.beginPath(); g.moveTo(x - w * 0.36, y - h * 1.2);
      for (const q of edge) g.lineTo(q[0], q[1]);
      g.lineTo(x + w * 0.36, y - h * 1.2); g.closePath(); g.fill();
      // tongues of snow down the gullies just under the cap. (round 6, R5-s01:
      // they used to run 0.07-0.2 h in the t parameter, which the concave
      // profile stretches over nearly half the flank, so they printed as pale
      // beams radiating from the summit - the thing the finding names. They are
      // now short, fewer and they start at scattered altitudes.)
      for (let i = 0; i < nr; i++) {
        const u = ridges[i];
        if (Math.abs(u) > 0.7 || !rng.chance(0.4)) continue;
        const len = rng.range(0.02, 0.055) * h * (0.5 + sn), sw = w * rng.range(0.003, 0.008);
        const bx = x + u * w * 0.55, t0 = 0.1 + 0.1 * Math.abs(u) + rng.range(0, 0.1);
        const left = [], right = [];
        for (let k = 0; k <= 8; k++) {
          const t = t0 + (len / h) * (k / 8);
          const cx = x + u * w * 0.02 + (bx - x - u * w * 0.02) * t;
          const cy = y - h * 0.97 * Math.pow(1 - t, conc) + 4 * t;
          const hw = sw * (1 - k / 8 * 0.85);
          left.push([cx - hw, cy]); right.push([cx + hw, cy]);
        }
        g.beginPath(); poly(g, [...left, ...right.reverse()]); g.fill();
      }
    }
    g.restore();
  }, { bbox });
  return { pts, bbox };
}

// Low distant coasts / islands, pale with atmospheric blue.
export function distantCoast(p, o) {
  const { x0, x1, y, h = 30, seed = 'coast' } = o;
  const rng = new RNG(seed);
  const nz = makeNoise(rng.int(1, 1e6));
  const pts = [[x0, y + 2]];
  for (let x = x0; x <= x1; x += 6) {
    const v = nz.fbm(x * (o.freq ?? 0.004), 0.5, 4);
    const bump = Math.max(0, v + (o.bias ?? 0.1)) * h * 2.4;
    pts.push([x, y - bump]);
  }
  pts.push([x1, y + 2]);
  const bbox = bboxOf(pts, 3);
  p.pass(o.mat ?? p.mat.distant, (g) => {
    g.save(); g.beginPath(); poly(g, pts); g.clip();
    const gr = g.createLinearGradient(0, bbox.y, 0, y);
    gr.addColorStop(0, L(o.top ?? 0.62)); gr.addColorStop(1, L(o.bottom ?? 0.42));
    g.fillStyle = gr; g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    if (o.lit !== false) { // light top edge
      g.globalCompositeOperation = 'source-atop';
      g.strokeStyle = L(0.95); g.lineWidth = Math.max(p.px * 1.5, h * 0.05);
      g.beginPath(); poly(g, pts.slice(1, -1), false); g.stroke();
    }
    g.restore();
  }, { bbox });
  return pts;
}

// ---------------------------------------------------------------- sea
// Sea from the horizon down to `bottom`. glints: [{x, y, rx, ry, a}] in world.
export function sea(p, o) {
  const { horizon, bottom, x0, x1 } = o;
  const bbox = { x: x0, y: horizon - 1, w: x1 - x0, h: bottom - horizon + 2 };
  const near = o.near ?? 1, far = o.far ?? 0.035;
  const Lh = o.lHorizon ?? 0.6, Lm = o.lMid ?? 0.46, Lb = o.lBottom ?? 0.38;
  p.pass(o.mat ?? p.mat.sea, (g) => {
    const lg = g.createLinearGradient(0, horizon, 0, bottom);
    const stops = [[0, Lh], [0.06, (Lh + Lm) / 2], [0.3, Lm], [1, Lb]];
    for (const [s, l] of stops) lg.addColorStop(s, L(l, far + (near - far) * s, 0));
    g.fillStyle = lg; g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    if (o.glints) {
      g.globalCompositeOperation = 'lighter';
      for (const gl of o.glints) {
        g.save(); g.translate(gl.x, gl.y); g.scale(1, gl.ry / gl.rx);
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, gl.rx);
        rg.addColorStop(0, `rgba(0,0,${Math.round(255 * (gl.a ?? 1))},1)`);
        rg.addColorStop(0.5, `rgba(0,0,${Math.round(150 * (gl.a ?? 1))},1)`);
        rg.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = rg; g.beginPath(); circle(g, 0, 0, gl.rx); g.fill(); g.restore();
      }
    }
    if (o.clip) { g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#fff'; g.beginPath(); poly(g, o.clip); g.fill(); }
  }, { bbox, time: p.time });
}

// White lace surf along a shoreline polyline. side = +1 / -1 picks the sea side.
// o.dash: { on: [6, 30], off: [3, 12], blob: 0.3 }: each line breaks into
// tapered segments (lengths in world units along the shore) with gaps, and a
// small foam blob at some segment ends (plate 3 / 5's broken lace), instead of
// the default chain of overlapping ellipses.
export function surf(p, pts, o = {}) {
  const rng = new RNG(o.seed ?? 'surf');
  const n = p.night;
  const col = o.color ?? (n ? '#cfd6ee' : '#f7f6f1');
  const shade = o.shade ?? (n ? '#3c52a0' : '#7f99d4');
  const side = o.side ?? 1;
  const lines = o.lines ?? 4;
  const dense = densify(pts, o.step ?? 6);
  if (o.dash) {
    const on = o.dash.on ?? [6, 30], off = o.dash.off ?? [3, 12], blob = o.dash.blob ?? 0.3;
    const pad = (o.gap ?? 5) * lines * (1 + lines * 0.35) + (o.width ?? 1.6) * 3 + 2;
    const fine = densify(pts, 2);
    const acc = [0];
    for (let i = 1; i < fine.length; i++) acc.push(acc[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
    const total = acc[acc.length - 1];
    const at = (d) => {   // point and unit tangent at arc length d
      let lo = 0, hi = acc.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] < d) lo = m; else hi = m; }
      const f = (d - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]);
      const a = fine[lo], b = fine[hi], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      return [a[0] + tx * f, a[1] + ty * f, tx / tl, ty / tl];
    };
    p.ink((ctx) => {
      for (let l = 0; l < lines; l++) {
        const off0 = (o.gap ?? 5) * l * side * (1 + l * 0.35);
        ctx.fillStyle = l === 0 ? col : (l % 2 ? shade : col);
        ctx.beginPath();
        for (let d = rng.range(0, off[1]); d < total;) {
          const len = rng.range(on[0], on[1]) * (1 - l * 0.2), d1 = Math.min(total, d + len);
          const w = (o.width ?? 1.6) * rng.range(0.7, 1.3) * (1 - l * 0.15);
          const top = [], bot = [];
          const k = Math.max(2, Math.ceil((d1 - d) / 3));
          for (let i = 0; i <= k; i++) {
            const [x, y, tx, ty] = at(d + ((d1 - d) * i) / k);
            const nx = -ty * side, ny = tx * side, hw = (w / 2) * Math.sin(Math.PI * (0.08 + 0.84 * (i / k)));
            top.push([x + nx * (off0 + hw), y + ny * (off0 + hw)]); bot.push([x + nx * (off0 - hw), y + ny * (off0 - hw)]);
          }
          poly(ctx, [...top, ...bot.reverse()]);
          if (l === 0 && rng.chance(blob)) { const [x, y, tx, ty] = at(d1); const r = w * rng.range(0.9, 1.6); ctx.moveTo(x - ty * side * off0 + r, y + tx * side * off0); ctx.ellipse(x - ty * side * off0, y + tx * side * off0, r, r * 0.7, Math.atan2(ty, tx), 0, TAU); }
          d = d1 + rng.range(off[0], off[1]) * (1 + l * 0.4);
        }
        ctx.fill();
      }
    }, { bbox: bboxOf(fine, pad) });
    return;
  }
  p.ink((ctx) => {
    for (let l = 0; l < lines; l++) {
      const off = (o.gap ?? 5) * l * side * (1 + l * 0.35);
      ctx.fillStyle = l === 0 ? col : (l % 2 ? shade : col);
      for (let i = 1; i < dense.length - 1; i++) {
        if (rng.chance(0.25 + l * 0.17)) continue;
        const a = dense[i - 1], b = dense[i + 1];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
        const nx = -ty * off, ny = tx * off;
        const w = (o.width ?? 1.6) * rng.range(0.5, 1.2) * (1 - l * 0.15);
        const sl = (o.step ?? 6) * rng.range(0.7, 2.2);
        const x = dense[i][0] + nx + rng.range(-1, 1), y = dense[i][1] + ny;
        ctx.beginPath(); ctx.ellipse(x, y, sl / 2, w / 2, Math.atan2(ty, tx), 0, TAU); ctx.fill();
      }
    }
  }, { bbox: bboxOf(dense, (o.gap ?? 5) * lines * (1 + lines * 0.35) + (o.width ?? 1.6) * 1.2 + (o.step ?? 6) * 1.2 + 2) });
}

// ---------------------------------------------------------------- rock
// A limestone mass: `outline` closed polygon. Painted as a few big
// buttresses, each with a sunlit plane and a shadow plane split by a jagged
// ridge, broken into smaller slabs and fractures. The rock material turns
// the guide into ivory planes with grey-brown angular patches and hatching.
export function rockMass(p, o) {
  const rng = new RNG(o.seed ?? 'rock');
  const nz = makeNoise(rng.int(1, 1e6));
  const outline = o.outline;
  const bbox = bboxOf(outline, 6);
  const lightSide = o.lightSide ?? -1; // -1: lit from the left
  const scale = o.scale ?? 1;
  const mw = o.massW ?? [0.14, 0.32];
  const lr = o.litRange ?? [0.8, 0.94];   // the sunlit planes' light
  const masses = [];
  let x = bbox.x - bbox.w * 0.02;
  while (x < bbox.x + bbox.w) {
    const w = bbox.w * rng.range(mw[0], mw[1]);
    // where the ridge sits; shadowFrac sets how much of each mass is in shade
    const sf = o.shadowFrac ? rng.range(o.shadowFrac[0], o.shadowFrac[1]) : null;
    const split = sf === null ? rng.range(0.45, 0.75) : (lightSide < 0 ? 1 - sf : sf);
    // o.ridgeLean: how far the ridge leans across the mass (fraction of its width;
    // 0.45 turns the shade planes into wedges instead of full-height columns);
    // o.litRange: the sunlit planes' light (default [0.8, 0.94])
    const lean = rng.range(-1, 1) * (o.ridgeLean ?? 0.18) * w;
    masses.push({ x, w, split, lean, lit: rng.range(lr[0], lr[1]), shade: rng.range(o.shadeLo ?? 0.3, o.shadeHi ?? 0.5) });
    x += w;
  }
  const jagLine = (pts, amp, f) => roughen(densify(pts, 5), nz, amp, f);
  const baseMat = o.mat ?? p.mat.rock;
  // relief lighting in the shader: strength, feature scale (world units), light direction on screen
  const relief = o.relief ?? 0.85;
  const mat = relief > 0 ? { ...baseMat, extra2: [relief, (o.reliefScale ?? 70) * scale, (lightSide < 0 ? -0.65 : 0.65), -0.55] } : baseMat;
  // a generator guide (standard 17/23): it yields between masses, about every
  // 40 slabs, so a big cliff bakes in several small units (same pixels)
  p.pass(mat, function* (g) {
    g.save();
    g.beginPath(); poly(g, outline); g.clip();
    g.fillStyle = L(o.base ?? 0.8); g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    const top = bbox.y - 10, bot = bbox.y + bbox.h + 10;
    let drawn = 0;
    for (const m of masses) {
      if (drawn >= 40) { drawn = 0; yield; }
      const rx = m.x + m.w * m.split;
      const ridge = jagLine([[rx + m.lean, top], [rx - m.lean * 0.5, (top + bot) / 2], [rx, bot]], 9 * scale, 0.035 / scale);
      const right = jagLine([[m.x + m.w, bot], [m.x + m.w + m.lean * 0.3, top]], 8 * scale, 0.04 / scale);
      const left = jagLine([[m.x, top], [m.x - m.lean * 0.3, bot]], 8 * scale, 0.04 / scale);
      const litFirst = lightSide < 0;
      // plane A (left of ridge) and plane B (right of ridge)
      const lA = litFirst ? m.lit : m.shade, lB = litFirst ? m.shade : m.lit;
      g.fillStyle = L(lA); g.beginPath(); poly(g, [...left, ...ridge.slice().reverse()]); g.fill();
      g.fillStyle = L(lB); g.beginPath(); poly(g, [...ridge, ...right]); g.fill();
      // o.litFacets (round 6): break the SUNLIT plane into that many leaning
      // facets instead of one flat value, so the plates' few precious white
      // planes happen between deeper half-lit ones (plate 3's cliff carries a
      // lit mask of 18.8% against s01's 38.8% in round 5, because rockMass gave
      // each buttress one lit value with small chips on top: R5-s01). One facet
      // takes the top of litRange; the rest sit in its lower two thirds.
      // Default 0 = exactly round 5's drawing, and every rng draw sits inside
      // the branch, so a caller that does not ask for facets is pixel-identical.
      if (o.litFacets) {
        const litPoly = litFirst ? [...left, ...ridge.slice().reverse()] : [...ridge, ...right];
        const px0 = litFirst ? m.x : rx, px1 = litFirst ? rx : m.x + m.w;
        const pw = Math.max(6, px1 - px0);
        g.save(); g.beginPath(); poly(g, litPoly); g.clip();
        const k = rng.int(Math.max(2, o.litFacets - 1), o.litFacets + 2);
        const bri = rng.int(0, k - 1);
        const cuts = [px0 - 8];
        for (let f = 1; f < k; f++) cuts.push(px0 + pw * (f / k + rng.range(-0.13, 0.13)));
        cuts.push(px1 + 8);
        for (let f = 0; f < k; f++) {
          const lean2 = rng.range(-1.15, 1.15) * pw;   // leaning, so a facet boundary is a bedding plane and not a vertical seam
          const a = jagLine([[cuts[f] + lean2, top], [cuts[f], bot]], 7 * scale, 0.04 / scale);
          const b = jagLine([[cuts[f + 1] + lean2, top], [cuts[f + 1], bot]], 7 * scale, 0.04 / scale);
          g.fillStyle = L(f === bri ? lr[1] : rng.range(lr[0], lr[0] + (lr[1] - lr[0]) * 0.62));
          g.beginPath(); poly(g, [...a, ...b.slice().reverse()]); g.fill();
        }
        g.restore();
        drawn += k * 2;
      }
      // secondary slabs: small blocks with slight variation on both planes
      const n = Math.round((m.w / (28 * scale)) * (bbox.h / (90 * scale)) * (o.detail ?? 1));
      drawn += n + 4;
      for (let i = 0; i < n; i++) {
        const sx = m.x + rng.range(0, m.w), sy = rng.range(bbox.y, bbox.y + bbox.h);
        const onA = sx < rx;
        const base = onA ? lA : lB;
        // o.slab: [[wLo, wHi], [hLo, hHi]] in world units (default [[8, 30], [14, 70]]).
        // Bigger, fewer slabs on a big cliff read as the plates' stacked blocks;
        // the round-5 sizes printed as a field of small chips (R5-s01).
        const sl = o.slab;
        const sw = rng.range(sl ? sl[0][0] : 8, sl ? sl[0][1] : 30) * scale, sh = rng.range(sl ? sl[1][0] : 14, sl ? sl[1][1] : 70) * scale;
        const dl = rng.range(-0.09, 0.07);
        const blk = roughen(densify([[sx, sy], [sx + sw, sy + rng.range(-4, 4)], [sx + sw + rng.range(-5, 5), sy + sh], [sx + rng.range(-4, 4), sy + sh]], 5, true), nz, 3 * scale, 0.08, true);
        g.fillStyle = L(clamp(base + dl)); g.beginPath(); poly(g, blk); g.fill();
        if (rng.chance(o.ledges ?? 0.05)) { // wedge of shadow under an overhang
          g.fillStyle = L(0.08);
          g.beginPath(); g.moveTo(sx - 2, sy + sh); g.lineTo(sx + sw + 3, sy + sh + rng.range(-2, 2));
          g.lineTo(sx + sw * rng.range(0.3, 0.8), sy + sh + rng.range(3, 8) * scale); g.closePath(); g.fill();
        }
      }
      // deep crevice along some ridges / mass borders
      if (rng.chance(o.crevices ?? 0.5)) {
        g.fillStyle = L(0.03);
        const cr = jagLine([[m.x + m.w, top], [m.x + m.w + rng.range(-12, 12), bot]], 6 * scale, 0.05);
        g.beginPath(); brush(g, cr, rng.range(3, 8) * scale, rng.range(1, 4) * scale, (t) => 0.35 + 0.65 * Math.abs(Math.sin(t * 6 + m.x))); g.fill();
      }
      // a few fractures
      const nf = rng.int(0, 3);
      for (let i = 0; i < nf; i++) {
        const fx = m.x + rng.range(0.1, 0.9) * m.w, fy = rng.range(bbox.y, bbox.y + bbox.h * 0.8);
        const len = rng.range(30, 120) * scale;
        const fr = jagLine([[fx, fy], [fx + rng.range(-0.4, 0.4) * len, fy + len]], 3 * scale, 0.1);
        g.fillStyle = L(0.12); g.beginPath(); brush(g, fr, rng.range(1.2, 2.6) * scale, 0.4 * scale); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-atop';
    // overall falloff: the side away from the light and the wet base
    const sg = g.createLinearGradient(bbox.x, 0, bbox.x + bbox.w, 0);
    const dark = `rgba(0,0,0,${o.sideShade ?? 0.28})`, clear = 'rgba(0,0,0,0)';
    if (lightSide < 0) { sg.addColorStop(0, clear); sg.addColorStop(0.6, clear); sg.addColorStop(1, dark); }
    else { sg.addColorStop(0, dark); sg.addColorStop(0.4, clear); sg.addColorStop(1, clear); }
    g.fillStyle = sg; g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    if (o.baseShade) {
      const bg = g.createLinearGradient(0, bbox.y + bbox.h * (1 - o.baseShade.h), 0, bbox.y + bbox.h);
      bg.addColorStop(0, clear); bg.addColorStop(1, `rgba(0,0,0,${o.baseShade.a ?? 0.4})`);
      g.fillStyle = bg; g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    }
    if (o.guideExtra) { yield; const it = o.guideExtra(g, p); if (it && typeof it.next === 'function') yield* it; }
    g.restore();
  }, { bbox });
  if (o.inkOutline !== false) {
    p.ink((ctx) => {
      ctx.strokeStyle = mat.ink || C.ink; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(p.px * 1.2, (o.inkW ?? 1.1) * scale);
      ctx.beginPath(); poly(ctx, o.inkPath ?? outline, !o.inkPath); ctx.stroke();
    }, { bbox: bboxOf(o.inkPath ?? outline, Math.max(2, (o.inkW ?? 1.1) * scale * 2)) });
  }
  return { bbox, masses };
}

// Jagged cliff silhouette between two base points rising to a top profile.
// profile: array of [x, y] for the top edge, left to right.
export function cliffOutline(nz, profile, baseY, amp = 10, f = 0.03) {
  const top = roughen(densify(spline(profile, 6), 5), nz, amp, f);
  return [[profile[0][0], baseY], ...top, [profile[profile.length - 1][0], baseY]];
}

// ---------------------------------------------------------------- beach
export function beach(p, o) {
  const { pts } = o;
  const bbox = bboxOf(pts, 2);
  p.pass(o.mat ?? p.mat.sand, (g) => {
    g.save(); g.beginPath(); poly(g, pts); g.clip();
    const lg = g.createLinearGradient(0, bbox.y, 0, bbox.y + bbox.h);
    lg.addColorStop(0, L(o.lTop ?? 0.74)); lg.addColorStop(1, L(o.lBottom ?? 0.66));
    g.fillStyle = lg; g.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    if (o.wet) { // darker wet band along the shoreline
      g.strokeStyle = L(0.45); g.lineWidth = o.wet.width ?? 10; g.lineJoin = 'round';
      g.beginPath(); poly(g, o.wet.line, false); g.stroke();
    }
    o.guideExtra?.(g, p);
    g.restore();
  }, { bbox });
}

// ---------------------------------------------------------------- vegetation
// Japanese / Huangshan pine: twisting trunk, horizontal needle pads.
// o: { x, y, h, lean, pads, padScale, trunkW, seed, mat, lightSide (-1 left, +1 right: the trunk's lit flank) }
export function pine(p, o) {
  const rng = new RNG(o.seed ?? `pine${o.x}`);
  const { x, y, h } = o;
  const lean = o.lean ?? rng.range(-0.25, 0.25);
  const trunk = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    trunk.push([x + lean * h * t + Math.sin(t * 5 + rng.range(0, 3)) * h * 0.04 * (1 - t * 0.5), y - h * t * 0.85]);
  }
  const tr = spline(trunk, 5);
  const pads = [];
  const nPads = o.pads ?? rng.int(3, 6);
  const branches = [];
  for (let i = 0; i < nPads; i++) {
    const t = 0.35 + 0.65 * (i / Math.max(1, nPads - 1));
    const base = tr[Math.min(tr.length - 1, Math.floor(t * (tr.length - 1)))];
    const dir = i === nPads - 1 ? rng.range(-0.3, 0.3) : (i % 2 ? 1 : -1) * rng.range(0.6, 1);
    const len = h * rng.range(0.16, 0.34) * (1 - t * 0.35);
    const end = [base[0] + dir * len, base[1] - len * rng.range(0.05, 0.3)];
    branches.push(spline([base, [(base[0] + end[0]) / 2, (base[1] + end[1]) / 2 - len * 0.12], end], 4));
    const pw = h * rng.range(0.22, 0.38) * (1 - t * 0.3) * (o.padScale ?? 1);
    pads.push({ x: end[0], y: end[1], w: pw, h: pw * rng.range(0.3, 0.42) });
  }
  const allPts = [...tr, ...pads.flatMap((q) => [[q.x - q.w, q.y - q.h], [q.x + q.w, q.y + q.h]])];
  const bbox = bboxOf(allPts, 4);
  const tw = o.trunkW ?? h * 0.08;
  const ls = o.lightSide ?? -1; // -1: lit from the left (default), +1: from the right (the moon at night)
  p.pass(p.mat.wood, (g) => {
    g.fillStyle = L(0.3, 0.5); g.beginPath(); brush(g, tr, tw, tw * 0.45); g.fill();
    for (const b of branches) { g.beginPath(); brush(g, b, tw * 0.5, tw * 0.18); g.fill(); }
    g.fillStyle = L(0.62, 0.5); // lit flank of the trunk
    const lit = tr.map(([a, c]) => [a + ls * tw * 0.22, c]);
    g.beginPath(); brush(g, lit, tw * 0.35, tw * 0.12); g.fill();
  }, { bbox });
  p.pass(o.mat ?? p.mat.foliage, (g) => {
    for (const q of pads) {
      // a pad is two stacked layers of flat tone with a hard dark underside
      // (round 4's single gradient collapsed to one flat tone at these sizes)
      const bumps = rng.int(4, 7);
      const row = [];
      for (let j = 0; j < bumps; j++) {
        const u = (j / (bumps - 1)) * 2 - 1;
        row.push({ u, bx: q.x + u * q.w * 0.8, by: q.y - (1 - u * u) * q.h * 0.5, r: q.h * rng.range(0.55, 0.85) * (1 - 0.3 * Math.abs(u)) });
      }
      for (const [dy, lv, sc] of [[q.h * 0.3, 0.26, 1.02], [0, 0.55, 0.96], [-q.h * 0.3, 0.95, 0.7]]) {
        g.fillStyle = L(lv, 0.05);
        g.beginPath();
        for (const b of row) { g.ellipse(b.bx, b.by + dy, b.r * 1.25 * sc, b.r * 0.8 * sc, 0, 0, TAU); }
        g.fill();
      }
      g.fillStyle = L(0.1, 0.05);
      g.beginPath(); g.ellipse(q.x, q.y + q.h * 0.25, q.w * 0.92, q.h * 0.28, 0, 0, Math.PI); g.fill();
    }
  }, { bbox });
  return { bbox, pads };
}

// Tall Italian cypress: a dark flame. o: { x, y, h, w, seed, mat, lightSide (-1 left, +1 right) }
export function cypress(p, o) {
  const { x, y, h } = o;
  const w = o.w ?? h * 0.12;
  const rng = new RNG(o.seed ?? `cy${x}`);
  const nz = makeNoise(rng.int(1, 1e6));
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N; const prof = Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - t * 0.35);
    pts.push([x - w * prof * (1 + nz.n2(i * 0.6, 1) * 0.12), y - h * t]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N; const prof = Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - t * 0.35);
    pts.push([x + w * prof * (1 + nz.n2(i * 0.6, 7) * 0.12), y - h * t]);
  }
  const bbox = bboxOf(pts, 3);
  p.pass(o.mat ?? p.mat.foliage, (g) => {
    g.beginPath(); poly(g, pts);
    const ls = o.lightSide ?? -1; // -1: lit from the left (default), +1: from the right
    const gr = g.createLinearGradient(x + ls * w, 0, x - ls * w, 0);
    gr.addColorStop(0, L(0.78, 0.5)); gr.addColorStop(0.45, L(0.5, 0.5)); gr.addColorStop(1, L(0.12, 0.5));
    g.fillStyle = gr; g.fill();
  }, { bbox });
}

// Maquis: scattered rounded shrubs. spots: [[x, y, size], ...]; o: { seed, mat, lightSide (-1 / +1) }
export function shrubs(p, spots, o = {}) {
  if (!spots.length) return;
  const rng = new RNG(o.seed ?? 'shrub');
  const ls = o.lightSide ?? -1; // -1: lit from the upper left (default), +1: from the upper right
  const pts = spots.flatMap(([x, y, s]) => [[x - s, y - s], [x + s, y + s]]);
  const bbox = bboxOf(pts, 2);
  // A clump is one massed body, not a row of flat discs (R4-s01): its tufts go
  // into one silhouette, filled with the foliage ramp's lit top, then clipped
  // and banded - a mid tone over the lower half and a crisp near-black
  // underside of about a quarter of its height - so it reads as plate 3's dark
  // maquis masses. The random numbers are drawn in the old order, so every
  // clump keeps its place and shape.
  p.pass(o.mat ?? p.mat.foliage, (g) => {
    for (const [x, y, s] of spots) {
      // (round 6, R5-s01: round 5's clump was 2-4 tufts of nearly the same
      // radius, so the union was a smooth bean with one pale top. Now it is a
      // dominant lobe with one or two clearly smaller ones (0.45-0.72x) pushed
      // well into it, and each lobe's outline carries two deeper notches, so the
      // silhouette is gnarled and layered like crop 1-pine's maquis.)
      const n = rng.int(2, 3);
      const tufts = [];
      for (let j = 0; j < n; j++) {
        const bx = x + rng.range(-0.52, 0.52) * s * (j ? 1 : 0.3), by = y + rng.range(-0.3, 0.2) * s * (j ? 1 : 0.4);
        const r = s * (j === 0 ? rng.range(0.85, 1.02) : rng.range(0.45, 0.72));
        const notch = rng.int(0, 11), notch2 = (notch + rng.int(3, 8)) % 12;
        // an irregular tuft (12 points pushed in and out by up to 34%, two of
        // them bitten deep), never a round button
        const pts = [];
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU + rng.range(-0.18, 0.18);
          let rr = r * (1 + rng.range(-0.34, 0.3));
          if (k === notch || k === notch2) rr *= rng.range(0.4, 0.62);
          pts.push([bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.78]);
        }
        tufts.push({ pts, by, r });
      }
      const path = (gg) => { gg.beginPath(); for (const t of tufts) poly(gg, t.pts); };
      let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      for (const t of tufts) for (const [px, py] of t.pts) { y0 = Math.min(y0, py); y1 = Math.max(y1, py); x0 = Math.min(x0, px); x1 = Math.max(x1, px); }
      const hgt = Math.max(1, y1 - y0);
      g.fillStyle = L(0.44); path(g); g.fill();
      g.save(); path(g); g.clip();
      // the underside: each tuft's own shadow crescent (its outline pushed down),
      // so the dark follows the lobes instead of ruling one line under the clump
      g.fillStyle = L(0.08);
      g.beginPath();
      for (const t of tufts) {
        const cx = t.pts.reduce((a2, q) => a2 + q[0], 0) / t.pts.length;
        g.moveTo(cx + (t.pts[0][0] - cx) * 0.98, t.by + (t.pts[0][1] - t.by) * 0.98 + t.r * 0.34);
        for (const [px, py] of t.pts) g.lineTo(cx + (px - cx) * 0.98, t.by + (py - t.by) * 0.98 + t.r * 0.34);
        g.closePath();
      }
      g.fill();
      // lit lobes: each tuft's crown, pulled up and in, so the light breaks over
      // the mass in lobes instead of splitting it with one horizontal step
      for (const [dy, sc, lv] of [[-0.1, 0.92, 0.5], [-0.24, 0.8, 0.7], [-0.44, 0.5, 0.9]]) {
        g.fillStyle = L(lv);
        g.beginPath();
        for (const t of tufts) {
          const cx = t.pts.reduce((a2, q) => a2 + q[0], 0) / t.pts.length;
          g.moveTo(cx + (t.pts[0][0] - cx) * sc + ls * t.r * 0.1, t.by + (t.pts[0][1] - t.by) * sc + dy * t.r);
          for (const [px, py] of t.pts) g.lineTo(cx + (px - cx) * sc + ls * t.r * 0.1, t.by + (py - t.by) * sc + dy * t.r);
          g.closePath();
        }
        g.fill();
      }
      g.restore();
    }
  }, { bbox });
}

// ---------------------------------------------------------------- birds (per-frame)
// flock: [{ x, y, rx, ry, s, phase, speed, vx, span }]. A bird with vx drifts
// across a span (default 400 units) and wraps, fading out and back in at the
// ends, so a frame looks the same however long the page has been open.
export function birds(ctx, e, flock) {
  const { wall } = e;
  ctx.strokeStyle = e.night ? '#d8def0' : '#f5f3ee';
  ctx.lineCap = 'round';
  const a0 = ctx.globalAlpha;
  for (const b of flock) {
    const t = wall * (b.speed ?? 1) + b.phase;
    let drift = 0, fade = 1;
    if (b.vx) {
      const span = b.span ?? 400, d = b.vx * wall + span / 2;
      drift = d - Math.floor(d / span) * span - span / 2;
      fade = clamp((span / 2 - Math.abs(drift)) / (span * 0.15));
      if (fade <= 0) continue;
    }
    ctx.globalAlpha = a0 * fade;
    const x = b.x + Math.cos(t * 0.13) * b.rx + drift;
    const y = b.y + Math.sin(t * 0.21) * b.ry;
    // the wings beat on twos (12 fps drawings, STYLE rule 11); the glide stays smooth
    const tw = Math.floor(wall * 12) / 12;
    const flap = Math.sin((tw * (b.speed ?? 1) + b.phase) * 7) * 0.6;
    const s = b.s;
    ctx.lineWidth = Math.max(1.2 / e.s, s * 0.18);
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * flap * 0.6); ctx.quadraticCurveTo(x - s * 0.4, y - s * (0.5 + flap * 0.4), x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * (0.5 + flap * 0.4), x + s, y - s * flap * 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = a0;
}
