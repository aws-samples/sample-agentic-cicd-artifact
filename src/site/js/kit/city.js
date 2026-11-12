// The night city of Troy, for baked layers. Houses are plain ashlar boxes
// with flat terraces or low gables, seen front-on and a little from above:
// a front face, the side turned to the moon, and a sliver of roof. Rows
// climb the hill toward the acropolis; towers and the temple of Athena
// break the skyline. Everything is one `stone` pass (painter's order:
// back rows first), so ink creases come from the light changes between
// faces. Fire is drawn per frame by the shot: cityOfTroy() returns the
// burning spots (roofs and windows) so actors can light them.

import { L } from '../engine/bake.js';
import { RNG, makeNoise, clamp, lerp } from '../engine/rng.js';
import { C, M, mat } from './palette.js';
import { GATE } from './temple.js';

// Elevation skyline. o: { x0, x1, y (base of the front row), depth (how far
// the rows climb above y, default 170), rows (4), seed, scale (house size,
// 1 ≈ 46 units wide), dark (0 moonlit .. 1 silhouette against fire),
// lightSide (+1 moon on the right), acropolis (0..1 across, or null),
// fireRate (share of roofs that burn), bottom (paint walls down to here) }.
// cityLayout(o) is pure (no painter), so actors can find the burning spots
// without waiting for a bake; cityOfTroy(p, o) paints the same layout.
// Both return { bbox, fires: [{ x, y, w, h, seed, kind, r }], windows:
// [{ x, y, w, h, r }], roofs: [{ x0, x1, y, r }], skyline: [[x, y], ...] }
// (r is the row: 0 = front).
export function cityLayout(o) {
  const { x0, x1, y } = o;
  const depth = o.depth ?? 170;
  const rows = Math.max(1, o.rows ?? 4);
  const sc = o.scale ?? 1;
  const dark = clamp(o.dark ?? 0);
  const ls = o.lightSide ?? 1;
  const rng = new RNG(o.seed ?? 'troy');
  const nz = makeNoise(rng.int(1, 1e6));
  const W = x1 - x0;
  const acro = o.acropolis === null ? null : (o.acropolis ?? 0.6);
  const bottom = o.bottom ?? y + 40 * sc;
  // the hill: rows rise toward the acropolis
  const hill = (x) => {
    const u = (x - x0) / W;
    const a = acro === null ? 0.5 : Math.exp(-Math.pow((u - acro) / 0.32, 2));
    return 0.55 + 0.45 * a + nz.fbm(x * 0.004, 3.3, 3) * 0.25;
  };
  const B = []; // buildings, back to front
  for (let r = rows - 1; r >= 0; r--) {
    const f = rows > 1 ? r / (rows - 1) : 0;
    const rs = sc * (1 - f * 0.28);                 // farther rows a little smaller
    let x = x0 - rng.range(0, 30) * rs;
    while (x < x1) {
      const w = rng.range(30, 62) * rs;
      const base = y - depth * f * hill(x + w / 2);
      const kind = rng.chance(0.07) ? 'tower' : rng.chance(0.3) ? 'gable' : 'flat';
      const h = kind === 'tower' ? rng.range(90, 140) * rs : rng.range(26, 52) * rs * (r === 0 ? 1.1 : 1);
      B.push({ x, w, base, h, kind, r, rs, side: rng.range(0.14, 0.24) * w, roofD: rng.range(5, 9) * rs, jl: rng.range(-0.06, 0.06), win: rng.int(0, 3), seed: rng.int(1, 1e9) });
      x += w * rng.range(0.82, 1.02);
    }
  }
  // the temple of Athena on the acropolis, on the second row from the back
  let temple = null;
  if (acro !== null && rows > 1) {
    const tw = 150 * sc, tx = x0 + W * acro - tw / 2;
    const f = (rows - 1.6) / (rows - 1);
    temple = { x: tx, w: tw, base: y - depth * f * hill(tx + tw / 2), h: 62 * sc, kind: 'temple', r: rows - 1.6, rs: sc * 0.8, side: 20 * sc, roofD: 7 * sc, jl: 0, win: 0, seed: 7 };
    // insert after the back rows so nearer rows overlap it
    const idx = B.findIndex((b) => b.r < rows - 1.6);
    B.splice(idx < 0 ? B.length : idx, 0, temple);
  }
  const fires = [], windows = [], roofs = [], tops = [];
  for (const b of B) {
    const top = b.base - b.h;
    b.wins = [];
    if (b.kind === 'flat' || b.kind === 'gable') { // windows: black slits; some burn
      const ww = Math.max(3, b.w * 0.09), wh = Math.max(5, b.h * 0.2);
      for (let i = 0; i < b.win; i++) {
        const wx = b.x + b.w * (0.2 + 0.6 * ((i + 0.5) / b.win)) - ww / 2, wy = top + b.h * 0.3;
        b.wins.push([wx, wy, ww, wh]);
        if (((b.seed >> (i * 3)) & 7) === 0) windows.push({ x: wx, y: wy, w: ww, h: wh, r: b.r });
      }
    }
    roofs.push({ x0: b.x, x1: b.x + b.w, y: top, r: b.r });
    tops.push([b.x, top], [b.x + b.w, top]);
    if (b.kind !== 'temple' && rng.chance(o.fireRate ?? 0.18)) {
      const fw = b.w * rng.range(0.5, 0.95);
      fires.push({ x: b.x + b.w * rng.range(0.35, 0.65), y: top + b.roofD * 0.4, w: fw, h: fw * rng.range(0.8, 1.6), seed: b.seed, kind: 'roof', r: b.r });
    }
  }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity;
  for (const b of B) { bx0 = Math.min(bx0, b.x); bx1 = Math.max(bx1, b.x + b.w + b.side); by0 = Math.min(by0, b.base - b.h - b.roofD - (b.kind === 'gable' ? b.w * 0.3 : 0) - 30); }
  const bbox = { x: bx0 - 4, y: by0 - 4, w: bx1 - bx0 + 8, h: bottom - by0 + 8 };
  tops.sort((a, b) => a[0] - b[0]);
  return { B, bbox, fires, windows, roofs, skyline: tops, temple, bottom, sc, dark, ls, x0, x1, y };
}

export function cityOfTroy(p, o) {
  const lay = cityLayout(o);
  const { B, bbox, bottom, sc, dark, ls } = lay;
  const K = (l) => clamp(lerp(l, 0.02 + l * 0.16, dark));   // darken toward silhouette
  // a generator draw: the background baker resumes it at each yield, so a
  // long skyline never makes one long bake unit (the pixels are the same).
  // It yields every 6 buildings, and sooner after big walls (about 0.4 Mpx
  // of fills at the bake scale: WebKit fills ~0.05-0.1 Mpx a millisecond
  // under load), so no step runs long in a slow 2D canvas.
  p.pass(o.mat ?? cityMat(p, sc), function* (g) {
    let n = 0, area = 0;
    const k2 = p.k * p.k;
    for (const b of B) {
      if (++n % 6 === 0 || area > 0.4e6) { yield; area = 0; }
      const top = b.base - b.h;
      area += (b.w + Math.abs(b.side)) * ((b.r === 0 ? bottom : b.base + 30) - top + b.roofD) * k2;
      const front = K(0.5 + b.jl - b.r * 0.02), sideL = K(0.8 + b.jl), roofL = K(0.92);
      const bot = b.r === 0 ? bottom : b.base + 30;    // walls run down behind nearer rows
      // side face toward the moon
      const sx = ls > 0 ? b.x + b.w : b.x;
      const sd = ls > 0 ? b.side : -b.side;
      g.fillStyle = L(sideL);
      g.beginPath(); g.moveTo(sx, bot); g.lineTo(sx, top); g.lineTo(sx + sd, top - b.roofD); g.lineTo(sx + sd, bot); g.closePath(); g.fill();
      // front face
      g.fillStyle = L(front); g.fillRect(b.x, top, b.w, bot - top);
      if (b.kind === 'flat' || b.kind === 'tower') {
        // terrace: the roof seen from a little above, with a parapet lip
        g.fillStyle = L(roofL);
        g.beginPath(); g.moveTo(b.x, top); g.lineTo(b.x + b.w, top); g.lineTo(b.x + b.w + sd, top - b.roofD); g.lineTo(b.x + sd, top - b.roofD); g.closePath(); g.fill();
        g.fillStyle = L(K(0.3)); g.fillRect(b.x, top, b.w, Math.max(p.px * 1.5, 2.2 * b.rs));
      }
      if (b.kind === 'tower') { // crenels
        const mw = b.w / 7;
        g.fillStyle = L(front);
        for (let m = 0; m < 4; m++) g.fillRect(b.x + mw * (m * 2), top - b.roofD - mw * 0.9, mw, mw * 0.9 + b.roofD);
        g.fillStyle = L(K(0.02));
        for (let m = 0; m < 2; m++) g.fillRect(b.x + b.w * (0.3 + m * 0.3), top + b.h * 0.2, b.w * 0.06, b.h * 0.12);
      }
      if (b.kind === 'gable') { // low pediment roof facing us
        const gh = b.w * 0.28;
        g.fillStyle = L(K(0.62));
        g.beginPath(); g.moveTo(b.x - 2 * b.rs, top); g.lineTo(b.x + b.w / 2, top - gh); g.lineTo(b.x + b.w + 2 * b.rs, top); g.closePath(); g.fill();
        g.fillStyle = L(K(0.88)); // roof slope toward the moon
        g.beginPath(); g.moveTo(b.x + b.w / 2, top - gh); g.lineTo(b.x + b.w + 2 * b.rs, top); g.lineTo(b.x + b.w + b.side, top - b.roofD); g.lineTo(b.x + b.w / 2 + b.side, top - gh - b.roofD); g.closePath(); g.fill();
      }
      if (b.kind === 'temple') {
        const n = 8, cw = b.w / (n * 1.7);
        g.fillStyle = L(K(0.03)); g.fillRect(b.x + cw, top + b.h * 0.22, b.w - cw * 2, b.h * 0.78); // dark cella
        for (let i = 0; i < n; i++) {
          const cx = b.x + cw * 0.6 + (b.w - cw * 2.2) * (i / (n - 1));
          g.fillStyle = L(K(0.55)); g.fillRect(cx, top + b.h * 0.22, cw, b.h * 0.78);
          g.fillStyle = L(K(0.85)); g.fillRect(cx + cw * 0.55, top + b.h * 0.22, cw * 0.45, b.h * 0.78);
        }
        g.fillStyle = L(K(0.8)); g.fillRect(b.x - 3 * b.rs, top, b.w + 6 * b.rs, b.h * 0.22);
        g.fillStyle = L(K(0.66));
        g.beginPath(); g.moveTo(b.x - 5 * b.rs, top); g.lineTo(b.x + b.w / 2, top - b.h * 0.3); g.lineTo(b.x + b.w + 5 * b.rs, top); g.closePath(); g.fill();
      }
      // windows and doors: black slits
      g.fillStyle = L(K(0.02));
      for (const [wx, wy, ww, wh] of b.wins) g.fillRect(wx, wy, ww, wh);
      if (b.r === 0 && b.wins.length && (b.seed & 3) === 0) g.fillRect(b.x + b.w * 0.42, b.base - b.h * 0.42, b.w * 0.16, b.h * 0.42);
    }
    o.guideExtra?.(g, p);
  }, { bbox });
  return lay;
}

// Silhouette stone for a city seen against fire: navy-black, flat, with
// only the faintest break-up, so rooftops read black against the glow.
export const silhouetteMat = (p) => mat(p.mat.stone, {
  ramp: ['#02030e', '#060a20', '#0d1234', '#181f4a', '#2a3263', '#444c80'],
  noise: { scale: 30, amp: 0.02, vScale: 8, vAmp: 0.0 }, hatch: null, speck: null, crack: null,
});

// Stone for the street view. It carries the film's one stone vocabulary
// (standard 18): the chips, pits, engraved hatching and ink of p.mat.stone
// (L1c), unchanged. Only light values are its own: at night a ramp from
// navy-black shadows through two navy tones (a large shadow field and the
// smoke-shadowed foreground stay navy, never slate: standard 19) to warm
// grey and moonlit ivory (plate 4), with the navy tones wide enough that the
// stone's marks never flip a shadowed face to grey; the hatch band follows
// that ramp. Cracks are off (at 7-20 px a metre they read as scribble);
// joints are the kit's own (ashlar ink lines). o overrides any field.
// Standard 38: the night stone carries plate 4's own mid-tones, so moonlit
// stone has a middle register instead of jumping 56 levels from #a0968b (L 151)
// to #d6cdc2 (L 207). The three navy tones and the TOP TWO bands keep round 5's
// thresholds, so a wall or a coping is exactly as bright as before; the old
// single 0.52-0.65 band splits into plate 4's #93887d (L 137) and #b2a79d
// (L 169). (L1c made the same change to N.stone; the street view carries its
// own ramp because its three navy tones are standard 19's shadow fields.)
//   The two new bands are WIDE (0.50-0.58 and 0.58-0.71), because the biggest
// field in the shot - the paving - has to sit in the middle of one: a field
// painted within 0.02 of a threshold has every facet and pit flip a patch to
// the tone above, which prints as confetti instead of calm stone (standard 26).
// The top band (> 0.79) is round 5's, so the moonlit walls, the copings and the
// gate's side walls print exactly as bright as before, and the 0.42 boundary is
// round 5's, so the obliquely lit faces are unchanged.
const STREET_NIGHT = {
  ramp: ['#02031a', '#0a1134', '#141c50', '#71665b', '#93887d', '#b2a79d', '#d6cdc2', '#eee7e2'],
  thr: [0.07, 0.17, 0.42, 0.5, 0.58, 0.71, 0.79],
};
// The smoke-shadowed foreground of the street view (paintStreet o.dim): four
// flat navy tones with a wide band and a margin on both sides of every
// threshold, so the stone's marks never cross a tone (no camouflage) and the
// foreground is modelled rather than a slab (standards 19 and 24). Faces in
// shadow, lanes, windows and moon shadows are navy-black (#02031a); the
// oblique faces a dark navy (#0d153e); the faces the moon would light, the
// terraces and the paving one step up (#19255c, L 38, so the band is not a
// dark bed); only the planes the moon catches most (copings, the parapets'
// lips and the ridges, painted at 0.93 and above) print as lines of a lighter
// navy (#2b3c78, L 55). With s08's o.dim 0.72 the dimmed lights land at 0.12
// (shadow), 0.36-0.49 (oblique), 0.58-0.66 (moonward) and 0.95-0.975
// (arrises): every value at least 0.045 from a threshold. Light values only
// (standard 18).
export const STREET_DIM = {
  ramp: ['#02031a', '#02031a', '#0d153e', '#19255c', '#19255c', '#2b3c78'],
  thr: [0.18, 0.3, 0.533, 0.8, 0.9],
};
export const streetMat = (p, o = {}) => {
  const st = p.mat.stone;
  return mat(st, {
    ...(p.night ? STREET_NIGHT : {}),
    hatch: st.hatch && (p.night ? { ...st.hatch, lo: 0.44, hi: 0.66 } : st.hatch),
    crack: null,
    ...o,
  });
};

// The street view's paving (paintStreet's ground): L1c's floor stone (calm
// horizontal stone, standard 26) with the street's night ramp; light values
// only (standard 18). Falls back to streetMat where p.mat.floor is missing.
export const streetFloorMat = (p, o = {}) => {
  const fl = p.mat.floor;
  if (!fl) return streetMat(p, o);
  // the night band stops below the paving's own tone, so the paving carries the
  // floor's SHORT lit strokes (as in round 5, when it was painted at 0.76 above
  // the band) rather than the denser band strokes now that it sits a band lower
  return mat(fl, { ...(p.night ? STREET_NIGHT : {}), hatch: fl.hatch && (p.night ? { ...fl.hatch, lo: 0.44, hi: 0.58 } : fl.hatch), crack: null, markScale: 0.75, ...o });
};

// City stone for a moonlit skyline (cityOfTroy's default; s09 and s10 pass
// silhouetteMat): the film's one stone vocabulary, p.mat.stone's marks at
// world size (standard 18), with no cracks at house size. sc is kept for
// old callers and no longer scales the marks.
export const cityMat = (p, sc = 1) => mat(p.mat.stone, { crack: null });

// ---------------------------------------------------------------- street view
// A high oblique view over the city (s08): a pinhole camera above the roofs,
// with no pitch so verticals stay vertical as in the prints, yawed so that
// the main street runs diagonally from the gate toward the viewer. World
// metres: x across the street, y up, z along it (the gate wall at z 0..wallD,
// the city at z < 0). Houses are boxes; each shows its roof and the walls
// that face the camera. cam.L is the unit vector toward the moon; moonAz is
// measured from the view direction (0.55: beyond the scene, to the right;
// about 2.1: from behind the camera's right shoulder, the prints' night
// cheat that keeps the faces turned to us moonlit ivory).
export function streetCam(o = {}) {
  const c = { x: o.x ?? -22, z: o.z ?? -110, H: o.H ?? 30, yaw: o.yaw ?? 0.33, f: o.f ?? 1000, cx: o.cx ?? 800, hy: o.hy ?? 120 };
  const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
  c.sn = sn; c.cs = cs;
  c.view = (x, z) => { const dx = x - c.x, dz = z - c.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  c.P = (x, y, z) => { const [xc, zc] = c.view(x, z); return [c.cx + (c.f * xc) / zc, c.hy + (c.f * (c.H - y)) / zc]; };
  c.k = (x, z) => c.f / c.view(x, z)[1];                    // screen px per metre there
  // ground point under a screen position
  c.ground = (sx, sy) => { const zc = (c.f * c.H) / (sy - c.hy), xc = ((sx - c.cx) * zc) / c.f; return [c.x + xc * cs + zc * sn, c.z - xc * sn + zc * cs]; };
  const az = c.yaw + (o.moonAz ?? 0.55), el = o.moonEl ?? 0.62;
  c.L = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  return c;
}

// Layout of the city around the main street. o: { cam, seed, street (half
// width, m), gateW (half width of the gate opening, 3.5), gateH (height of
// the opening, 9.5), wallH (14), curtainH (the curtain between the gate
// towers, wallH), towerH (the gate towers, 25), towerX ([inner, outer] x of
// the gate towers, [gateW + 0.4, gateW + 7.5]), towerD (how far they stand
// into the city, 2), wallD (thickness of the wall and depth of the passage,
// 6), fireRate (0.12), temple ({ x0, x1, z0, z1, h, base } | null), zEnd
// (how far the city runs from the wall, 130), blocksR / blocksL (blocks of
// houses beside the street on each side, 4), lowSide (-1 | 1 | 0: the
// street row on that side is a row of low shops, 3.5-6.5 m, so a camera
// beyond it sees over it into the street; default 0), setback ([0.5, 2] m:
// how far the street fronts stand back from the street), courts (0.2: the
// share of block houses that are low courtyard houses, 3-4 m walls round an
// open yard, house.court; false = none), palace ({ x0, x1, z0, z1, h } | null:
// a tall palace block, house.palace, put in after the town and its fires),
// frontLen ([6, 11] m: the street fronts' lengths), houseLen ([6, 11] m: the
// block houses' lengths), trees (0.15: the chance a block slot is a court
// with cypresses), light (overrides STREET_LIGHT for this layout: boxPlanes,
// roofFire, streetTone's callers and paintStreet all light it the same way;
// kept as cam.LT), landmarks ([{ kind: 'palace' | 'stoa' | 'towerHouse', x0,
// x1, z0, z1, h }]: big single buildings put in like the palace: a stoa is a
// long colonnaded hall with a gable roof, its colonnade on the face turned to
// the main street; a tower house a tall blind tower with slit windows; a
// square an open paved place: no box, the houses on it go, paintStreet paves
// it with the street, lay.squares) }.
// The street fronts vary in height (5-12 m), with a tower house (13-16 m)
// about one in five; the blocks behind them have jittered origins, and
// about one house in seven is left out as a courtyard with a cypress (kind
// 'tree'). Courts never burn.
// Returns { cam, boxes (far to near), fires, SW, GW, WH, GH, TH, CH, TX, TD, WD }.
export function streetLayout(o = {}) {
  const cam = streetCam(o.cam);
  cam.LT = { ...STREET_LIGHT, ...(o.light || {}) };
  const rng = new RNG(o.seed ?? 'street');
  const FL = o.frontLen ?? [6, 11], HL = o.houseLen ?? [6, 11], TR = o.trees ?? 0.15;
  const SW = o.street ?? 5, GW = o.gateW ?? 3.5, WH = o.wallH ?? 14;
  const GH = o.gateH ?? 9.5, TH = o.towerH ?? 25, CH = o.curtainH ?? WH;
  const TX = o.towerX ?? [GW + 0.4, GW + 7.5], TD = o.towerD ?? 2, WD = o.wallD ?? 6, ZE = o.zEnd ?? 130;
  const boxes = [];
  // stepped footprints and roof huts draw from their own generator, so the
  // town's layout and its fires stay where they were
  const rf = new RNG(`${o.seed ?? 'street'}:form`);
  const hutOf = (b) => (b.roof === 'flat' && b.x1 - b.x0 > 6 && b.z1 - b.z0 > 6 && rf.chance(o.huts ?? 0.33) ? { u: rf.range(0.5, 0.66), v: rf.range(0.55, 0.7), w: rf.range(2.2, 3.2), d: rf.range(2.2, 3), h: rf.range(2.1, 2.7) } : null);
  // about one block house in five is a low courtyard house: walls of 3-4 m
  // round an open yard (o.courts, the share; false = none), from a generator
  // of its own as well
  const rc = new RNG(`${o.seed ?? 'street'}:court`);
  const house = (x0, x1, z0, z1, h, extra = {}) => {
    const b = { x0, x1, z0, z1, h, roof: rng.chance(0.35) ? 'gable' : 'flat', kind: 'house', seed: rng.int(1, 1e9), win: rng.int(1, 3), ...extra };
    const dx = x1 - x0, dz = z1 - z0;
    if (o.courts !== false && !b.street && dx > 5 && dz > 5 && rc.chance(o.courts ?? 0.2)) { b.court = true; b.h = rc.range(3, 4); b.roof = 'flat'; b.tall = false; b.hut = null; boxes.push(b); return; }
    if (o.steps !== false && dx > 6.5 && dz > 6.5 && rf.chance(o.steps ?? 0.25)) { // a stepped house: a lower wing shares a wall
      const f = rf.range(0.55, 0.7), w = { ...b, seed: rf.int(1, 1e9), h: Math.max(3.2, h * rf.range(0.5, 0.72)), roof: rf.chance(0.8) ? 'flat' : 'gable', tall: false, wing: true };
      if (dz >= dx) { const zm = rf.chance(0.5) ? z0 + dz * f : z1 - dz * f; if (zm - z0 > z1 - zm) { b.z1 = zm; w.z0 = zm; } else { b.z0 = zm; w.z1 = zm; } }
      else { // across: the lower part toward the main street (a shop front), else either way
        const hi = b.side ? b.side < 0 : rf.chance(0.5), xm = hi ? x1 - dx * (1 - f) : x0 + dx * (1 - f);   // hi: the wing at the x1 end
        if (hi) { b.x1 = xm; w.x0 = xm; } else { b.x0 = xm; w.x1 = xm; }
        if (b.street) { b.street = false; w.street = true; }                                               // the shop front faces the street
      }
      w.hut = hutOf(w);
      boxes.push(w);
    }
    b.hut = hutOf(b);
    boxes.push(b);
  };
  const height = () => { const tall = rng.chance(0.2); return [tall ? rng.range(13, 16) : rng.range(5, 12), tall]; };
  // the wall in segments (so the near ones can be culled); the curtain over
  // the gate between the two great towers is taller
  const walls = [];
  for (let x = -320; x < 320; x += 16) {
    const seg = { x0: x, x1: x + 16, z0: 0, z1: WD, h: Math.abs(x + 8) < TX[0] + 3 ? CH : WH, kind: 'wall', seed: 7001 + x };
    if (x < GW && x + 16 > -GW) seg.gate = [Math.max(x, -GW), Math.min(x + 16, GW), GH];
    walls.push(seg);
  }
  const towers = [{ x0: -TX[1], x1: -TX[0], z0: -TD, z1: WD + 2, h: TH, kind: 'tower', gateTower: -1, seed: 811 }, { x0: TX[0], x1: TX[1], z0: -TD, z1: WD + 2, h: TH, kind: 'tower', gateTower: 1, seed: 812 }];
  for (let x = -300; x <= 300; x += 42) if (Math.abs(x) > TX[1] + 8) towers.push({ x0: x - 4, x1: x + 4, z0: -1.5, z1: WD + 1.5, h: WH + 7 + rng.range(-2, 2), kind: 'tower', seed: 9001 + x });
  // the two door leaves, swung wide into the city against the jambs
  const doors = [{ x0: -GW - 0.35, x1: -GW, z0: -GW * 0.95, z1: 0, h: GH - 0.3, kind: 'door', roof: 'flat', side: -1 }, { x0: GW, x1: GW + 0.35, z0: -GW * 0.95, z1: 0, h: GH - 0.3, kind: 'door', roof: 'flat', side: 1 }];
  // the street fronts start clear of the gate towers and of the swung leaves
  const z0s = Math.min(-1.5, TX[0] < SW + 13 ? -TD - 1.5 : -1.5, SW < GW + 0.6 ? -GW * 0.95 - 1.5 : -1.5);
  // rows of houses along the main street, then blocks behind with lanes
  for (const side of [-1, 1]) {
    let z = z0s;
    while (z > -ZE) {
      const len = rng.range(...FL), d = rng.range(8, 12), sb = rng.range(...(o.setback ?? [0.5, 2]));
      let [h, tall] = height();
      if (side === o.lowSide) { h = 3.5 + (h - 5) * (3 / 11); tall = false; }
      const [x0, x1] = side < 0 ? [-SW - sb - d, -SW - sb] : [SW + sb, SW + sb + d];
      house(x0, x1, z - len, z, h, { side, street: true, tall });
      z -= len + (rng.chance(0.2) ? rng.range(2, 3.5) : 0.15);
    }
    const nb = side < 0 ? (o.blocksL ?? 4) : (o.blocksR ?? 4);
    for (let bx = 0; bx < nb; bx++) {
      const jx = rng.range(-1.6, 1.6);
      const xa = SW + 15 + bx * 24 + jx, xb = xa + 20;
      const [x0, x1] = side < 0 ? [-xb, -xa] : [xa, xb];
      for (let bz = 0; bz * 27 < ZE - 20; bz++) {
        const jz = rng.range(-1.8, 1.8);
        const za = Math.min(-2, -3 - bz * 27 + jz) - (bz === 0 && Math.min(Math.abs(x0), Math.abs(x1)) < TX[1] + 2 ? TD : 0), zb = za - 23;
        // a block: houses in two rows with a light well between; now and
        // then a house is missing and a cypress stands in the courtyard
        for (let r = 0; r < 2; r++) {
          let z = za;
          while (z > zb) {
            const len0 = rng.range(...HL), len = z - zb - len0 < 4 ? z - zb : Math.min(z - zb, len0);   // no sliver at the block's end
            const xm = (x0 + x1) / 2;
            const [hx0, hx1] = r === 0 ? [x0, xm - 0.6] : [xm + 0.6, x1];
            if (len > 4 && rng.chance(TR)) {
              const n = rng.chance(0.4) ? 2 : 1;
              for (let i = 0; i < n; i++) boxes.push({ kind: 'tree', x: lerp(hx0, hx1, rng.range(0.3, 0.7)), z: z - len * rng.range(0.3, 0.7), h: rng.range(9, 14), r: rng.range(1.1, 1.7), seed: rng.int(1, 1e9), get x0() { return this.x - this.r; }, get x1() { return this.x + this.r; }, get z0() { return this.z - this.r; }, get z1() { return this.z + this.r; } });
            } else {
              const [h, tall] = height();
              house(hx0, hx1, z - len, z, h, { tall });
            }
            z -= len + 0.3;
          }
        }
      }
    }
  }
  // the temple of Athena on a terrace to the right, above the roofs
  const temple = o.temple === null ? null : { x0: 66, x1: 92, z0: -78, z1: -40, h: 17, base: 4, ...(o.temple || {}), kind: 'temple' };
  if (temple) {
    for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i]; if (b.x1 > temple.x0 - 2 && b.x0 < temple.x1 + 2 && b.z1 > temple.z0 - 2 && b.z0 < temple.z1 + 2) boxes.splice(i, 1); }
    boxes.push(temple);
  }
  boxes.push(...walls, ...towers, ...doors);
  // depth: distance from the camera to the box centre (far first)
  for (const b of boxes) { const [, zc] = cam.view((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); b.zc = zc; }
  boxes.sort((a, b) => b.zc - a.zc);
  // roofs that will burn (never a courtyard house: its yard is open)
  let fires = [];
  for (const b of boxes) {
    if (b.kind !== 'house' || b.wing || b.zc < 30) continue;
    if (rng.chance(o.fireRate ?? 0.12) || (b.street && rng.chance(0.18))) {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const f = { X: cx, Z: cz, Y: b.h + (b.roof === 'gable' ? 1.5 : 0), w: Math.min(b.x1 - b.x0, b.z1 - b.z0) * rng.range(0.6, 1.0), seed: b.seed, zc: b.zc, street: !!b.street, side: Math.sign(cx), at: rng.range(0, 1), box: b };
      if (!b.court) fires.push(f);
    }
  }
  // landmarks (o.palace: { x0, x1, z0, z1, h }, and o.landmarks): big
  // single buildings put in after the town and its fires are drawn up, so
  // those stay where they were (the houses and fires on their ground go): a
  // palace with a loggia under its cornice and a pavilion on its terrace; a
  // stoa (a long hall, its gable roof along its length, a colonnade on the
  // face turned to the main street); a tower house (a tall blind tower with
  // slit windows and a moonlit coping)
  const marks = [...(o.palace ? [{ kind: 'palace', ...o.palace }] : []), ...(o.landmarks || [])], squares = [];
  for (const M0 of marks) {
    const { kind, ...geo } = M0;
    if (kind === 'square') { // an open place: the houses and fires on it go
      const on = (b) => (b.kind === 'house' || b.kind === 'tree') && !b.palace && !b.stoa && !b.towerHouse && b.x1 > geo.x0 && b.x0 < geo.x1 && b.z1 > geo.z0 && b.z0 < geo.z1;
      for (let i = boxes.length - 1; i >= 0; i--) if (on(boxes[i])) boxes.splice(i, 1);
      fires = fires.filter((f) => !on(f.box));
      squares.push(geo);
      continue;
    }
    const Pb = { roof: kind === 'stoa' ? 'gable' : 'flat', kind: 'house', seed: 4242 + Math.round(geo.x0 * 31 + geo.z0 * 17), win: 0, ...geo, [kind]: true };
    if (kind === 'towerHouse') Pb.tall = true;
    const inside = (b) => b.kind !== 'wall' && b.kind !== 'tower' && b.kind !== 'door' && b.kind !== 'temple' && b !== Pb && b.x1 > Pb.x0 - 1.5 && b.x0 < Pb.x1 + 1.5 && b.z1 > Pb.z0 - 1.5 && b.z0 < Pb.z1 + 1.5;
    for (let i = boxes.length - 1; i >= 0; i--) if (inside(boxes[i])) boxes.splice(i, 1);
    fires = fires.filter((f) => !inside(f.box));
    if (kind === 'palace') Pb.hut = { u: 0.5, v: 0.5, w: Math.min(9, (Pb.x1 - Pb.x0) * 0.38), d: Math.min(9, (Pb.z1 - Pb.z0) * 0.38), h: 4.2 };
    if (kind === 'stoa') Pb.street = Pb.street ?? true;
    Pb.zc = cam.view((Pb.x0 + Pb.x1) / 2, (Pb.z0 + Pb.z1) / 2)[1];
    boxes.push(Pb);
  }
  if (marks.length) boxes.sort((a, b) => b.zc - a.zc);
  return { cam, boxes, fires, squares, SW, GW, WH, GH, TH, CH, TX, TD, WD };
}

// A ground polygon (world x, z) clipped against the camera's near plane
// before projection, so floors reaching behind the camera stay valid.
function groundQuad(g, cam, pts, l, near = 8) {
  const V = pts.map(([x, z]) => [x, z, cam.view(x, z)[1]]);
  const out = [];
  for (let i = 0; i < V.length; i++) {
    const a = V[i], b = V[(i + 1) % V.length];
    if (a[2] >= near) out.push(a);
    if ((a[2] >= near) !== (b[2] >= near)) { const t = (near - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]); }
  }
  if (out.length < 3) return;
  g.fillStyle = L(l); g.beginPath();
  out.forEach(([x, z], i) => { const q = cam.P(x, 0, z); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
  g.closePath(); g.fill();
}

// The gate passage seen through the opening: its floor and the inner wall
// that faces the camera (painted under the army that walks through it).
// The moon, beyond the wall, throws a wedge of light along the floor.
export function paintPassage(p, lay) {
  const { cam, GW } = lay, P = cam.P, GH = lay.GH ?? 9.5, WD = lay.WD ?? 6;
  const side = cam.x < 0 ? GW : -GW;          // the passage wall the camera can see
  p.pass(streetMat(p), (g) => {
    const q = (pts, l) => { g.fillStyle = L(l); g.beginPath(); pts.forEach(([x, y, z], i) => { const r = P(x, y, z); if (i) g.lineTo(r[0], r[1]); else g.moveTo(r[0], r[1]); }); g.closePath(); g.fill(); };
    q([[-GW, 0, 0], [GW, 0, 0], [GW, 0, WD], [-GW, 0, WD]], 0.07);
    q([[-GW, 0, 0], [-GW * 0.26, 0, 0], [GW, 0, WD], [-GW, 0, WD]], 0.5);          // moonlight through the outer arch
    q([[side, 0, 0], [side, 0, WD], [side, GH, WD], [side, GH, 0]], 0.13);
    const n = Math.round(GH / 1.35);
    for (let i = 1; i < n; i++) { const y = (GH * i) / n; q([[side, y, 0], [side, y, WD], [side, y + 0.12, WD], [side, y + 0.12, 0]], 0.03); }
  }, { bbox: (() => { const a = P(-GW - 1, GH + 0.5, 0), b = P(GW + 1, 0, 0), c = P(GW + 1, 0, WD); return { x: Math.min(a[0], c[0]) - 20, y: a[1] - 20, w: Math.max(b[0], c[0]) - Math.min(a[0], c[0]) + 40, h: Math.max(b[1], c[1]) - a[1] + 40 }; })() });
}

// Convex hull of [x, z] points (monotone chain), counter-clockwise.
function hull(pts) {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of s) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Windows of one house wall (world metres): [[x0, z0, x1, z1, y0, y1], ...],
// plus a door onto the street. One to three small windows a face, set
// irregularly (a seeded place and height each), some walls blind; tower
// houses get a second row lower down. Shared by paintStreet() and
// streetWindows().
function wallWindows(b, ax, az, bx2, bz2, nx) {
  const out = [], len = Math.hypot(bx2 - ax, bz2 - az), n = Math.max(1, Math.min(3, Math.round(len / 5)));
  const v = (i, k) => ((Math.imul((b.seed | 0) ^ (i * 977 + k * 131 + nx * 7919), 0x9e3779b1) >>> 8) & 1023) / 1023;   // per window, 0..1
  for (let i = 0; i < n; i++) {
    if (((b.seed >> ((i * 2 + nx + 2) & 15)) & 3) === 0) continue;
    const c = (i + 0.5 + (v(i, 1) - 0.5) * 0.45) / n, hw = (0.09 + 0.05 * v(i, 2)) / n, f0 = c - hw, f1 = c + hw;
    const y0 = b.h * (0.5 + 0.12 * v(i, 3)), y1 = y0 + b.h * (0.16 + 0.06 * v(i, 4));
    out.push([ax + (bx2 - ax) * f0, az + (bz2 - az) * f0, ax + (bx2 - ax) * f1, az + (bz2 - az) * f1, y0, Math.min(y1, b.h * 0.86)]);
    if (b.h > 11 && ((b.seed >> ((i * 3 + 5) & 15)) & 1)) out.push([ax + (bx2 - ax) * f0, az + (bz2 - az) * f0, ax + (bx2 - ax) * f1, az + (bz2 - az) * f1, b.h * 0.24, b.h * 0.36]);
  }
  if (b.street && ((b.seed & 7) < 3) && Math.abs(nx) > 0.5) { // a door onto the street
    out.push([ax + (bx2 - ax) * 0.4, az + (bz2 - az) * 0.4, ax + (bx2 - ax) * 0.56, az + (bz2 - az) * 0.56, 0, 2.4, true]);
  }
  return out;
}
const WALLS = (b) => [ // [nx, nz, ax, az, bx, bz]
  [0, -1, b.x0, b.z0, b.x1, b.z0], [1, 0, b.x1, b.z0, b.x1, b.z1],
  [0, 1, b.x1, b.z1, b.x0, b.z1], [-1, 0, b.x0, b.z1, b.x0, b.z0],
];

// Screen quads of the windows (and street doors) of a house that face the
// camera, for actors that light them (fire inside). o: { street: true }
// keeps only the walls facing the main street (never hidden by neighbours).
// Returns [{ q: [[x, y] x4], door, nx }].
export function streetWindows(lay, b, o = {}) {
  const { cam } = lay, out = [];
  if (b.kind !== 'house') return out;
  for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
    if (nx * (cam.x - (ax + bx2) / 2) + nz * (cam.z - (az + bz2) / 2) <= 0) continue;
    if (o.street && !(b.street && Math.abs(nx) > 0.5)) continue;
    for (const [x0, z0, x1, z1, y0, y1, door] of wallWindows(b, ax, az, bx2, bz2, nx)) {
      out.push({ q: [cam.P(x0, y0, z0), cam.P(x1, y0, z1), cam.P(x1, y1, z1), cam.P(x0, y1, z0)], door: !!door, nx });
    }
  }
  return out;
}

// Screen polygon of a burn scar on a roof: a broken black patch about
// k w across (f.scarK when set), centred on (X, Y, Z). For fires that catch
// during a shot. On a terrace (f.box) the patch is kept on its floor, inside
// the parapets; a fire on a gable burns on the far slope (roofFire), so it
// leaves no scar the camera sees ([]).
export function scarQuad(lay, f, k = 0.8) {
  const b = f.box;
  if (b && b.kind === 'house' && b.roof === 'gable') return [];
  const r = new RNG(`scar${f.seed}`), out = [], n = 9, R = (f.w * (f.scarK ?? k)) / 2;
  const fx = b ? (x) => clamp(x, b.x0 + 0.35, b.x1 - 0.35) : (x) => x, fz = b ? (z) => clamp(z, b.z0 + 0.35, b.z1 - 0.9) : (z) => z;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = R * r.range(0.55, 1.1);
    out.push(lay.cam.P(fx(f.X + Math.cos(a) * rr), f.Y + 0.02, fz(f.Z + Math.sin(a) * rr * 1.1)));
  }
  return out;
}

// Default light levels of the street view (guide light units): faces turned
// from the moon drop to navy, lit walls and roofs scale with the moon's
// incidence, the paved street is moonlit pale grey (so the dark column of
// the army reads on it), lanes and moon shadows are near black. Only houses,
// trees and the temple throw moon shadows: the wall's would bury the gate
// road. gate: the inner face of the gate (GATE.stone in kit/temple.js:
// moonlit ivory faces, a black relieving triangle, thin dark joints).
// `arris` (optional): the light of the copings, the parapets' lips and the ridges - the
// planes the moon catches most. Standard 31 keeps those at 0.9+ while the large horizontal
// fields drop a band, so a shot can lower `roof` without losing the moonlit arrises. Unset
// = the old roof + 0.1.
export const STREET_LIGHT = { shadow: 0.12, wall: 1.06, roof: 1.15, street: 0.82, lane: 0.05, cast: 0.1, gate: 0.86, joint: 0.22, arris: null };

// Height of the parapet round a flat roof: the terrace is at b.h, the
// coping at b.h + PARAPET.
export const PARAPET = 0.75;
const hutBox = (b) => { // a roof hut's box (world metres; its floor is the terrace)
  const H = b.hut, cx = lerp(b.x0, b.x1, H.u), cz = lerp(b.z0, b.z1, H.v), w = Math.min(H.w, (b.x1 - b.x0) * 0.4), d = Math.min(H.d, (b.z1 - b.z0) * 0.4);
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: H.h };
};
// The street view's light on a face (as paintStreet lights it, without the
// per-house jitter): l for a face of normal (nx, ny, nz).
const streetLight = (cam, nx, ny, nz) => { const L3 = cam.L, T = cam.LT ?? STREET_LIGHT, i = Math.max(0, nx * L3[0] + ny * L3[1] + nz * L3[2]); return clamp(T.shadow + (ny ? T.roof : T.wall) * i); };

// The flat tone the street stone posterises to at guide light l (night:
// STREET_NIGHT, or STREET_DIM for o.dim; day: M.stone's ramp), for actors
// that redraw a plane over a flame (roofFire covers).
export function streetTone(l, o = {}) {
  const R = o.night === false ? { ramp: M.stone.ramp, thr: M.stone.thr } : o.dim ? STREET_DIM : STREET_NIGHT;
  let i = 0;
  while (i < R.thr.length && l > R.thr[i]) i++;
  return R.ramp[i];
}

// Screen polygons of the planes of a box the camera sees (its walls, up to
// the coping, and its roof or terrace), e.g. to clip a fire's light to the
// planes near it. [[[x, y], ...], ...]
export function boxFaces(lay, b) {
  const { cam } = lay, P = cam.P, out = [];
  if (b.kind !== 'house' && b.kind !== 'temple') return out;
  const flat = b.kind === 'house' && b.roof !== 'gable', top = flat && !b.court ? b.h + PARAPET : b.h;
  for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
    if (nx * (cam.x - (ax + bx2) / 2) + nz * (cam.z - (az + bz2) / 2) <= 0) continue;
    out.push([P(ax, 0, az), P(bx2, 0, bz2), P(bx2, top, bz2), P(ax, top, az)]);
  }
  if (b.court) { out.push([P(b.x0, 0, b.z0), P(b.x1, 0, b.z0), P(b.x1, 0, b.z1), P(b.x0, 0, b.z1)]); return out; }   // the open yard
  if (b.roof === 'gable') {
    const rh = 2.2;
    if (b.z1 - b.z0 > b.x1 - b.x0) { const xm = (b.x0 + b.x1) / 2; out.push([P(b.x0, b.h, b.z0), P(xm, b.h + rh, b.z0), P(b.x1, b.h, b.z0), P(b.x1, b.h, b.z1), P(xm, b.h + rh, b.z1), P(b.x0, b.h, b.z1)]); }
    else { const zm = (b.z0 + b.z1) / 2; out.push([P(b.x0, b.h, b.z0), P(b.x1, b.h, b.z0), P(b.x1, b.h + rh, zm), P(b.x1, b.h, b.z1), P(b.x0, b.h, b.z1), P(b.x0, b.h + rh, zm)]); }
  } else out.push([P(b.x0, top, b.z0), P(b.x1, top, b.z0), P(b.x1, top, b.z1), P(b.x0, top, b.z1)]);
  return out;
}

// The same planes as boxFaces(lay, b), each with the light the street view
// gives it (as paintStreet lights it, without the per-house jitter):
// [{ q: [[x, y], ...], l, roof }], e.g. to light the moonlit planes near a
// fire with a multiply and the shaded ones with an opaque dark red.
export function boxPlanes(lay, b) {
  const { cam } = lay, qs = boxFaces(lay, b), out = [];
  if (!qs.length) return out;
  let i = 0;
  for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
    if (nx * (cam.x - (ax + bx2) / 2) + nz * (cam.z - (az + bz2) / 2) <= 0) continue;
    out.push({ q: qs[i++], l: streetLight(cam, nx, 0, nz), roof: false });
  }
  out.push({ q: qs[i], l: streetLight(cam, 0, 1, 0), roof: true });
  return out;
}

// Where a fire on house b's roof burns, and what hides its flat base: on a
// terrace, just behind the parapet turned to the camera (the parapet's band
// and coping are redrawn over the flames); on a gable, behind the ridge (the
// near slope's top is redrawn). x: where along the roof (default its middle).
// Returns { X, Y, Z, cover: [{ q: [[x, y] x4], l, roof }], lines: [{ a, b, l, w }],
// ink: [[x0, y0, x1, y1], ...] } in screen units; l = guide light (paint it
// with streetTone(l, { dim })); lines are tile courses (width w).
export function roofFire(lay, b, o = {}) {
  const { cam } = lay, P = cam.P;
  const dx = b.x1 - b.x0, dz = b.z1 - b.z0, cover = [], lines = [], ink = [];
  const sees = (nx, nz, fx, fz) => nx * (cam.x - fx) + nz * (cam.z - fz) > 0;
  if (b.roof !== 'gable') {
    const top = b.h + PARAPET, X = clamp(o.x ?? (b.x0 + b.x1) / 2, b.x0 + 1.2, b.x1 - 1.2), cw = 0.3;
    const jit = ((((b.seed | 0) >>> 3) & 1023) / 1023 - 0.5) * 0.08;          // paintStreet's per-house light jitter
    for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
      if (!sees(nx, nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      const l = clamp(streetLight(cam, nx, 0, nz) + jit), ix = -nx * cw, iz = -nz * cw;
      cover.push({ q: [P(ax, b.h - 0.06, az), P(bx2, b.h - 0.06, bz2), P(bx2, top - 0.14, bz2), P(ax, top - 0.14, az)], l });
      cover.push({ q: [P(ax, top - 0.14, az), P(bx2, top - 0.14, bz2), P(bx2, top, bz2), P(ax, top, az)], l: clamp(l + 0.06) });
      cover.push({ q: [P(ax, top, az), P(bx2, top, bz2), P(bx2 + ix, top, bz2 + iz), P(ax + ix, top, az + iz)], l: (cam.LT ?? STREET_LIGHT).arris ?? clamp(streetLight(cam, 0, 1, 0) + 0.1), roof: true });
      const p0 = P(ax + ix, top, az + iz), p1 = P(bx2 + ix, top, bz2 + iz);
      ink.push([p0[0], p0[1], p1[0], p1[1]]);
    }
    return { X, Y: b.h, Z: b.z0 + Math.min(0.6, dz * 0.2), cover, lines, ink };
  }
  const rh = 2.2, d = 1.0, k = (len) => Math.max(3, Math.round(len / 0.9));
  if (dz > dx) { // ridge along z: the near slope faces -x (camera on the left) or +x
    const xm = (b.x0 + b.x1) / 2, s = cam.x < xm ? -1 : 1, hw = dx / 2, yd = b.h + rh * (1 - d / hw);
    const l = streetLight(cam, s * 0.4, 0.91, 0), xa = xm + s * d;
    cover.push({ q: [P(xa, yd, b.z0), P(xm, b.h + rh, b.z0), P(xm, b.h + rh, b.z1), P(xa, yd, b.z1)], l, roof: true });
    const n = k(dz);
    for (let i = 1; i < n; i++) { const z = b.z0 + (dz * i) / n; lines.push({ a: P(xa, yd, z), b: P(xm, b.h + rh, z), l: Math.max(0.03, l - 0.22), w: 0.05 * 3 }); }
    const r0 = P(xm, b.h + rh, b.z0), r1 = P(xm, b.h + rh, b.z1); ink.push([r0[0], r0[1], r1[0], r1[1]]);
    return { X: xm - s * 0.7, Y: b.h + rh * (1 - 0.7 / hw), Z: (b.z0 + b.z1) / 2, cover, lines, ink };
  }
  const zm = (b.z0 + b.z1) / 2, hw = dz / 2, yd = b.h + rh * (1 - d / hw), za = zm - d;   // ridge along x: the near slope faces -z
  const l = streetLight(cam, 0, 0.91, -0.4);
  cover.push({ q: [P(b.x0, yd, za), P(b.x0, b.h + rh, zm), P(b.x1, b.h + rh, zm), P(b.x1, yd, za)], l, roof: true });
  const n = k(dx);
  for (let i = 1; i < n; i++) { const x = b.x0 + (dx * i) / n; lines.push({ a: P(x, yd, za), b: P(x, b.h + rh, zm), l: Math.max(0.03, l - 0.22), w: 0.05 * 3 }); }
  const r0 = P(b.x0, b.h + rh, zm), r1 = P(b.x1, b.h + rh, zm); ink.push([r0[0], r0[1], r1[0], r1[1]]);
  return { X: clamp(o.x ?? (b.x0 + b.x1) / 2, b.x0 + 1.2, b.x1 - 1.2), Y: b.h + rh * (1 - 0.7 / hw), Z: zm + 0.7, cover, lines, ink };
}

// Paint boxes of a street layout into the current layer. sel(b) picks which
// boxes (e.g. by side of the street, for a near layer). o: { ground: [x0,
// x1, z0, z1] (also paints the city floor, the paved street in staggered
// slabs and the moon shadows of every house, tree and the temple), mat
// (default streetMat), light (overrides STREET_LIGHT), doors: false (skip
// the bronze and wood passes for the gate leaves), festoons: false (skip
// the red swags on the lintel), scars: [{ X, Y, Z, w, seed }] (burnt roof
// patches, baked), gate: { course, triangle, lintel } overrides, dim(b)
// courseLift (0: light added to a seeded 45% of the paving's rows, so the street is
// laid in two tones of limestone as plate 4's treads and terraces are), dim(b)
// (0..1 per house: 1 = moonlit, < 1 = a navy foreground in the shadow of
// the smoke, drawn in a pass of its own through STREET_DIM: its faces
// compressed by dim(b) (s08: 0.58), its copings, lips and ridges at fixed
// lights as navy lines), dimMat (false = the old one-pass dimming), gateMat
// (default: the street stone, engraved where weathered), markScale(b) (the
// mark scale of a house, default clamp(k / 12, 0.3, 1) for k screen units a
// metre, in bands 1 / 0.78 / 0.6) }.
// The gate's inner face follows GATE.stone (kit/temple.js): its light
// levels, courses, jambs, lintel, black relieving triangle and festoons,
// scaled from gate units (the opening = GATE.open.h) to the layout's gateH;
// the wall-walk follows a side wall lower than GATE.stone.walk.
// Passes: the wall and its towers (when selected), the ground (floor stone,
// streetFloorMat) and its joints' ink, the moonlit houses in depth bands
// (one pass a band, far to near), the dimmed houses, the leaves (bronze +
// wood) and the festoons (red). Guide draws are generators.
export function paintStreet(p, lay, sel = () => true, o = {}) {
  const { cam } = lay;
  const P = cam.P, L3 = cam.L;
  const LT = { ...(cam.LT ?? STREET_LIGHT), ...(o.light || {}) };
  const zmin = (b) => Math.min(...[[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(([x, z]) => cam.view(x, z)[1]));
  // cull boxes that reach behind (or right under) the camera
  const list = lay.boxes.filter((b) => sel(b) && zmin(b) > 6);
  const inc = (nx, ny, nz) => Math.max(0, nx * L3[0] + ny * L3[1] + nz * L3[2]);
  const lam = (nx, nz) => clamp(LT.shadow + LT.wall * inc(nx, 0, nz));
  // dimL: a house in the foreground's shadow keeps its structure a few bands down (DK is the current house's factor);
  // EDGE: in the navy pass (o.dim) its faces sink into the navy-black tone and only the copings, the
  // parapets' moonlit lips and the ridges print, at fixed lights, as STREET_DIM's two navy lines
  let DK = 1, EDGE = false;
  const dimL = (l) => (DK >= 1 || l <= LT.shadow ? l : LT.shadow + (l - LT.shadow) * DK);
  const roofL = (nx, ny, nz) => dimL(clamp(LT.shadow + LT.roof * inc(nx, ny, nz)));
  const R = p.region;
  const bboxOf = (bs, top = 4) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of bs) {
      const c = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
      for (const [x, z] of c) for (const y of [0, b.h + top]) {
        if (cam.view(x, z)[1] <= 1) continue;
        const q = P(x, y, z); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
    }
    const bx = Math.max(R.x, x0 - 20), by = Math.max(R.y, y0 - 20);
    return { x: bx, y: by, w: Math.max(1, Math.min(R.x + R.w, x1 + 20) - bx), h: Math.max(1, Math.min(R.y + R.h, y1 + 20) - by) };
  };
  const quad = (g, pts, l, a2 = 0) => { g.fillStyle = L(l, 0, a2); g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill(); };
  const face = (g, b, ax, az, bx2, bz2, l, y0f = 0, y1f = b.h, a2 = 0) => quad(g, [P(ax, y0f, az), P(bx2, y0f, bz2), P(bx2, y1f, bz2), P(ax, y1f, az)], l, a2);
  const sees = (nx, nz, fx, fz) => nx * (cam.x - fx) + nz * (cam.z - fz) > 0;
  const hs = (s, i) => ((s >>> (i & 31)) & 1023) / 1023;                    // per-box variation from its seed
  const hh = (a, b = 0) => (Math.imul((a | 0) ^ Math.imul((b | 0) + 0x632be5ab, 0x9e3779b1), 0x85ebca6b) >>> 8) / 16777216;   // hash of small integers, 0..1
  const smat = o.mat ?? streetMat(p);
  // Marks scale with depth (standard 26): a facet or a pit stays about the
  // same size in metres near and far (L1c's markScale, k / 12 for k screen
  // units a metre), so a far house front does not carry wall-sized facets.
  // The gate gets the band of its depth; the houses go in depth bands, one pass each, far to near (the painter's
  // order holds across bands). o.markScale(b) overrides; o.mat turns it off.
  const markOf = o.markScale ?? ((b) => clamp(cam.f / Math.max(1, b.zc) / 12, 0.3, 1));
  const bandOf = (v) => (o.mat ? 1 : v > 0.85 ? 1 : v > 0.66 ? 0.78 : 0.6);
  const isGate = (b) => b.kind === 'wall' || b.kind === 'tower';
  const gateList = list.filter(isGate), cityList = list.filter((b) => !isGate(b) && b.kind !== 'door');
  // ashlar courses: pseudo-isodomic (tall and short courses alternating, as
  // GATE.stone), long blocks (2.4-4 courses) with the vertical joints
  // staggered course to course. The guide carries only the blocks' light (a
  // weathered block a band down, engraved by aux2). The joints are thin ink
  // lines drawn after each pass (jointInk), GD.joint (0.16 m) wide, about
  // 1-1.2 px at the gate's ~7 px/m at 1x: a joint painted in the guide either
  // vanishes under the stone's marks or, dark enough to read, turns into a
  // crease band three units wide.
  const D = GATE.stone, gu = (lay.GH ?? 9.5) / GATE.open.h;              // metres per gate unit
  const GD = { course: D.course * gu, tall: D.towerCourses.map((c) => c * gu), joint: 0.16, ...(o.gate || {}) };
  const coursesOf = (b) => {
    const ys = [0];
    if (b.h > 20) { let i = 0; while (ys[ys.length - 1] < b.h - 0.6) ys.push(ys[ys.length - 1] + GD.tall[i++ % 2]); }
    else { const n = Math.max(2, Math.round(b.h / GD.course)); for (let i = 1; i <= n; i++) ys.push((b.h * i) / n); }
    ys[ys.length - 1] = b.h;
    return ys;
  };
  // the blocks of course i on a face (fractions along it): fn(f0, f1, weathered, last)
  const blocksOf = (b, ax, az, len, i, fn) => {
    const sd = (b.seed | 0) + Math.round(ax * 7 + az * 13);
    let f = hh(i, sd) * 0.12, f0 = 0;
    for (let j = 0; j < 40; j++) {
      f += (GD.course * (2.4 + 1.6 * hh(i * 64 + j, sd + 1))) / Math.max(1e-3, len);
      const last = f >= 0.97;
      fn(f0, Math.min(f, 1), hh(i * 64 + j, sd + 2) < 0.12, last);   // about one block in eight weathered (the stone's own patches do the rest, standard 26)
      if (last) break;
      f0 = f;
    }
  };
  const ashlar = (g, b, ax, az, bx2, bz2, l, len) => {
    const ys = coursesOf(b);
    if (l <= 0.5) return ys;
    const W = (f) => [ax + (bx2 - ax) * f, az + (bz2 - az) * f];
    for (let i = 0; i < ys.length - 1; i++) blocksOf(b, ax, az, len, i, (f0, f1, weathered) => {
      if (!weathered) return;
      const [x0, z0] = W(f0), [x1, z1] = W(f1);
      quad(g, [P(x0, ys[i], z0), P(x1, ys[i], z1), P(x1, ys[i + 1], z1), P(x0, ys[i + 1], z0)], l - 0.09, 0.75);   // one band down on the night ramp (standard 38): a weathered block reads a step darker
    });
    return ys;
  };
  // Joint lines of faces [{ b, ax, az, bx2, bz2, l }] as an ink draw: the bed
  // joints of every course and the staggered vertical joints. cut(y) gives
  // the half width (world x) the curtain's monoliths hide at height y (the
  // jambs, the lintel, the relieving triangle). Joints are dark warm grey on
  // moonlit faces and a lighter navy on faces in shadow (standard 19: the
  // texture of a shadow field comes from lighter joints). shade: screen
  // polygons of cast shadows on lit faces (their joints turn navy too).
  const jointInk = (faces, cut, shade = []) => (ctx, pp) => {
    const groups = new Map();                 // width bucket + lit -> [x0, y0, x1, y1, ...]
    const add = (lit, w, a, c) => { const key = `${lit ? 1 : 0}|${Math.round(w * 8)}`; let s = groups.get(key); if (!s) groups.set(key, (s = [])); s.push(a[0], a[1], c[0], c[1]); };
    const minW = 0.8 / pp.k;
    for (const F of faces) {
      const { b, ax, az, bx2, bz2, l } = F, len = Math.hypot(bx2 - ax, bz2 - az), ys = coursesOf(b);
      const w = Math.max(minW, GD.joint * cam.k((ax + bx2) / 2, (az + bz2) / 2)), lit = l > 0.5;
      const W = (f) => [ax + (bx2 - ax) * f, az + (bz2 - az) * f];
      const onCurtain = cut && az === 0 && bz2 === 0;
      for (let i = 1; i < ys.length - 1; i++) {
        const y = ys[i], c = onCurtain ? cut(y) : 0;
        const xa = Math.min(ax, bx2), xb = Math.max(ax, bx2);
        if (c > 0 && xa < c && xb > -c) { // around the monoliths
          if (xa < -c) add(lit, w, P(xa, y, az), P(-c, y, az));
          if (xb > c) add(lit, w, P(c, y, az), P(xb, y, az));
        } else add(lit, w, P(ax, y, az), P(bx2, y, bz2));
      }
      for (let i = 0; i < ys.length - 1; i++) blocksOf(b, ax, az, len, i, (f0, f1, wt, last) => {
        if (last) return;
        const [x, z] = W(f1);
        if (onCurtain && Math.abs(x) < cut((ys[i] + ys[i + 1]) / 2)) return;
        add(lit, w, P(x, ys[i], z), P(x, ys[i + 1], z));
      });
    }
    const stroke = (lit) => { for (const [key, s] of groups) { if (key[0] !== (lit ? '1' : '0')) continue; ctx.lineWidth = Number(key.slice(2)) / 8; ctx.beginPath(); for (let i = 0; i < s.length; i += 4) { ctx.moveTo(s[i], s[i + 1]); ctx.lineTo(s[i + 2], s[i + 3]); } ctx.stroke(); } };
    const shadePath = () => { ctx.beginPath(); for (const q of shade) q.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); };
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(28,36,84,0.95)'; stroke(false);   // in shadow: lighter navy than the face
    ctx.save();
    if (shade.length) { ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); for (const q of shade) q.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.clip('evenodd'); }
    ctx.strokeStyle = 'rgba(52,48,44,0.82)'; stroke(true);    // moonlit: dark warm grey
    ctx.restore();
    if (shade.length) { ctx.save(); shadePath(); ctx.clip(); ctx.strokeStyle = 'rgba(28,36,84,0.95)'; stroke(true); ctx.restore(); }
  };
  // ---- the wall and its towers (the gate's inner face, GATE.stone): the
  // wall in one pass, its joints, then the towers in front of it in a pass of
  // their own (their contours ink against the wall) and their joints
  if (gateList.length) {
    const segs = gateList.filter((b) => b.kind === 'wall'), tows = gateList.filter((b) => b.kind === 'tower');
    const lintel = { h: 90 * gu, ...(o.gate?.lintel || {}) };
    // the gate's stone: the street stone (L1c's marks), engraved where aux2
    // marks a weathered block; a light engraving over the whole lit face
    const gk = bandOf(markOf({ zc: cam.view(0, 0)[1] })), gmat = o.gateMat ?? mat(smat, { extra: { hatchByAux2: true }, ...(gk < 1 ? { markScale: gk } : {}) });
    const G = segs.filter((b) => b.gate);
    const GW = lay.GW, GHt = G.length ? G[0].gate[2] : 0, TX0 = lay.TX ? lay.TX[0] : GW + 0.4;
    const jw = Math.min(TX0 - GW, 82 * gu), lx = Math.min(TX0, 300 * gu);
    const T = { w: D.triangle.w * gu, h: D.triangle.h * gu, steps: D.triangle.steps, ...(o.gate?.triangle || {}) };
    const ty = GHt + lintel.h;
    // what the curtain's monoliths hide at height y (half width in x)
    const cut = (y) => (!G.length ? 0 : y < GHt ? GW + jw : y < ty ? lx : y < ty + T.h ? T.w * (1 - Math.floor(((y - ty) / T.h) * T.steps) / T.steps) : 0);
    // each gate tower's moon shadow on the curtain beside it
    const shadows = [];
    if (L3[2] < 0) for (const b of tows) {
      if (!b.gateTower) continue;
      const dx = -L3[0] / -L3[2];                                   // shadow drift in x per metre in z
      const ex = dx < 0 ? b.x0 : b.x1, sx = ex + dx * (0 - b.z0);
      const hw = Math.min(b.h, Math.abs(sx) < TX0 + 2.6 ? (lay.CH ?? b.h) : (lay.WH ?? b.h));
      if ((dx < 0 && sx < ex) || (dx > 0 && sx > ex)) shadows.push([P(Math.min(ex, sx), 0, 0), P(Math.max(ex, sx), 0, 0), P(Math.max(ex, sx), hw, 0), P(Math.min(ex, sx), hw, 0)]);
    }
    const wallFaces = [], towerFaces = [];
    for (const b of segs) for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
      if (!sees(nx, nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      if (nx && segs.some((c) => c !== b && (nx > 0 ? c.x0 === b.x1 : c.x1 === b.x0) && c.h >= b.h)) continue;  // abuts the next segment
      const l0 = lam(nx, nz), l = l0 > 0.5 ? Math.max(l0, b.gate || b.h > (lay.WH ?? 0) + 1 ? D.curtainLight : D.wallLight) : l0 * 0.92;
      wallFaces.push({ b, nx, nz, ax, az, bx2, bz2, l });
    }
    for (const b of tows) for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
      if (!sees(nx, nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      const l0 = lam(nx, nz), lit = l0 > 0.5;
      const l = lit ? Math.max(l0, b.gateTower ? D.light[b.gateTower < 0 ? 0 : 1] : D.wallLight - 0.04) : b.gateTower && nx < 0 ? D.rightReturn.light : l0;
      towerFaces.push({ b, nx, nz, ax, az, bx2, bz2, l, lit });
    }
    p.pass(gmat, function* (g) {
      let n = 0;
      for (const b of segs) {
        for (const F of wallFaces) {
          if (F.b !== b) continue;
          face(g, b, F.ax, F.az, F.bx2, F.bz2, F.l, 0, b.h);
          if (b.h > 6) ashlar(g, b, F.ax, F.az, F.bx2, F.bz2, F.l, Math.hypot(F.bx2 - F.ax, F.bz2 - F.az));
        }
        const r0 = roofL(0, 1, 0) * 0.95;
        quad(g, [P(b.x0, b.h, b.z0), P(b.x1, b.h, b.z0), P(b.x1, b.h, b.z1), P(b.x0, b.h, b.z1)], r0);
        crenels(g, b, r0);
        if (++n % (b.gate || b.h > (lay.WH ?? 0) + 1 ? 1 : 4) === 0) yield;
      }
      for (const q of shadows) quad(g, q, 0.1);
      // the gate on the curtain: monolith jambs, the lintel, the black
      // stepped relieving triangle over it; then the opening is cut out so
      // whatever the earlier layer drew (the passage, the plain, the army)
      // shows through
      if (G.length) {
        const GH = GHt;
        const lF = Math.max(lam(0, -1), D.curtainLight);
        const on = (pts, l, a2) => quad(g, pts.map(([x, y]) => P(x, y, 0)), l, a2);
        on([[-GW - jw, 0], [-GW, 0], [-GW, GH], [-GW - jw, GH]], D.jambs[0]);              // monolith jambs
        on([[GW, 0], [GW + jw, 0], [GW + jw, GH], [GW, GH]], D.jambs[1]);
        on([[GW + jw * 0.55, 0], [GW + jw, 0], [GW + jw, GH], [GW + jw * 0.55, GH]], D.jambs[1] - 0.05, 0.7);   // weathered, engraved
        const lh = lintel.h;
        on([[-lx, GH], [lx, GH], [lx, GH + lh], [-lx, GH + lh]], D.lintel);                  // the lintel
        on([[-lx, GH + lh - 8 * gu], [lx, GH + lh - 8 * gu], [lx, GH + lh], [-lx, GH + lh]], 0.97);
        on([[-lx, GH], [lx, GH], [lx, GH + 8 * gu], [-lx, GH + 8 * gu]], 0.2);
        on([[-T.w, ty], [0, ty + T.h], [T.w, ty]], D.triangle.light);                       // the black void
        on([[-T.w, ty], [T.w, ty], [T.w, ty + 0.3], [-T.w, ty + 0.3]], 0.02);
        for (let i = 0; i < T.steps; i++) {                                                   // corbelled steps
          const y0 = ty + (T.h * i) / T.steps, y1 = ty + (T.h * (i + 1)) / T.steps, hw = T.w * (1 - i / T.steps), sw = T.w / T.steps;
          on([[-hw, y0], [-hw + sw, y0], [-hw + sw, y1], [-hw, y1]], clamp(lF - 0.02));
          on([[-hw + sw - 0.12, y0], [-hw + sw, y0], [-hw + sw, y1], [-hw + sw - 0.12, y1]], 0.86);
          on([[hw - sw, y0], [hw, y0], [hw, y1], [hw - sw, y1]], clamp(lF - 0.06));
          on([[hw - sw, y0], [hw - sw + 0.16, y0], [hw - sw + 0.16, y1], [hw - sw, y1]], 0.24);
        }
        on([[-GW - jw, 0], [GW + jw, 0], [GW + jw, 10 * gu], [-GW - jw, 10 * gu]], D.threshold);   // threshold
        g.save(); g.globalCompositeOperation = 'destination-out';
        on([[-GW, 0], [GW, 0], [GW, GH], [-GW, GH]], 1);
        g.restore();
      }
    }, { bbox: bboxOf(segs, 3), cost: 3 });
    p.ink(jointInk(wallFaces.filter((F) => F.b.h > 6), cut, shadows), { bbox: bboxOf(segs, 3) });
    if (tows.length) {
      p.pass(gmat, function* (g) {
        let n = 0;
        for (const b of tows) {
          for (const F of towerFaces) {
            if (F.b !== b) continue;
            const { ax, az, bx2, bz2, l, lit, nz } = F;
            face(g, b, ax, az, bx2, bz2, l, 0, b.h);
            const ys = ashlar(g, b, ax, az, bx2, bz2, l, Math.hypot(bx2 - ax, bz2 - az));
            if (lit && ys.length > D.plinth + 1) { // the plinth: courses a step darker, with a moonlit string course
              const yp = ys[D.plinth];
              face(g, b, ax, az, bx2, bz2, clamp(l - 0.1), 0, yp);
              face(g, b, ax, az, bx2, bz2, clamp(l + 0.1), yp, yp + 0.3);
              if (b.gateTower) { const wk = Math.min(D.walk * gu, (lay.WH ?? 1e9) - 60 * gu); face(g, b, ax, az, bx2, bz2, clamp(l + 0.08), wk, wk + 0.35); }   // the wall-walk's string course (it follows a lowered side wall, 60 gate units under its top)
            }
            if (b.gateTower && lit && nz < 0) { // slit windows with a lit sill
              for (const fy of D.slits) for (const fx of [0.35, 0.65]) {
                const xa = lerp(ax, bx2, fx - 0.03), xb = lerp(ax, bx2, fx + 0.03), y = b.h * fy;
                quad(g, [P(xa, y, az), P(xb, y, az), P(xb, y + 2.4, az), P(xa, y + 2.4, az)], 0.01);
                quad(g, [P(xa - 0.25, y - 0.3, az), P(xb + 0.25, y - 0.3, az), P(xb + 0.25, y, az), P(xa - 0.25, y, az)], 0.95);
              }
            } else if (!b.gateTower && lit) {
              for (let i = 0; i < 2; i++) {
                const f = 0.35 + i * 0.3, wx = ax + (bx2 - ax) * f, wz = az + (bz2 - az) * f, wx1 = ax + (bx2 - ax) * (f + 0.05), wz1 = az + (bz2 - az) * (f + 0.05);
                quad(g, [P(wx, b.h * 0.55, wz), P(wx1, b.h * 0.55, wz1), P(wx1, b.h * 0.72, wz1), P(wx, b.h * 0.72, wz)], 0.01);
              }
            }
          }
          const r0 = roofL(0, 1, 0);
          quad(g, [P(b.x0, b.h, b.z0), P(b.x1, b.h, b.z0), P(b.x1, b.h, b.z1), P(b.x0, b.h, b.z1)], r0);
          crenels(g, b, r0, b.gateTower ? 2.8 : 2.4);
          if (b.gateTower || ++n % 3 === 0) yield;
        }
      }, { bbox: bboxOf(tows, 3), cost: 3 });
      p.ink(jointInk(towerFaces), { bbox: bboxOf(tows, 3) });
    }
  }
  function crenels(g, b, r0, mw = 2.4) { // merlons along the edge facing us
    const n = Math.max(2, Math.round((b.x1 - b.x0) / mw));
    const mh = mw > 2.5 ? 2.5 : 1.4;
    for (let i = 0; i < n; i += 2) {
      const xa = b.x0 + ((b.x1 - b.x0) * i) / n, xb = b.x0 + ((b.x1 - b.x0) * (i + 1)) / n;
      face(g, b, xa, b.z0, xb, b.z0, Math.max(lam(0, -1), lam(0, -1) > 0.5 ? LT.gate : 0), b.h, b.h + mh);
      if (sees(1, 0, xb, b.z0 + 0.4)) face(g, b, xb, b.z0, xb, b.z0 + 0.8, lam(1, 0), b.h, b.h + mh);
      if (sees(-1, 0, xa, b.z0 + 0.4)) face(g, b, xa, b.z0 + 0.8, xa, b.z0, lam(-1, 0), b.h, b.h + mh);
      quad(g, [P(xa, b.h + mh, b.z0), P(xb, b.h + mh, b.z0), P(xb, b.h + mh, b.z0 + 0.8), P(xa, b.h + mh, b.z0 + 0.8)], clamp(r0 + 0.08));
    }
  }
  // ---- the houses, trees and the temple (and the ground under them)
  const scars = new Map((o.scars || []).map((f) => [f.box ? f.box.seed : f.seed, f]));
  // A box's walls, windows, roof, burnt patch (and the temple's front).
  // Flat roofs are terraces inside parapets (PARAPET m): the floor, the inner
  // faces of the far parapets and their moon shadows go down first, then the
  // walls rise to the coping, then the copings and a roof hut.
  function drawBox(g, b) {
    if (b.kind === 'tree') { tree(g, b); return; }
    const flat = b.kind === 'house' && b.roof !== 'gable';
    const top = flat && !b.court ? b.h + PARAPET : b.h;
    if (b.court) yard(g, b);
    else if (flat) terrace(g, b);
    if (scars.has(b.seed)) { // a burnt patch under a fire that burns from the start
      g.fillStyle = L(0.03); g.beginPath();
      scarQuad(lay, scars.get(b.seed)).forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.closePath(); g.fill();
    }
    const walls = WALLS(b);
    const jit = b.kind === 'house' ? (hs(b.seed, 3) - 0.5) * 0.08 : 0;
    for (const [nx, nz, ax, az, bx2, bz2] of walls) {
      if (!sees(nx, nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      const l0 = lam(nx, nz);
      const l = dimL(clamp(l0 + jit));
      face(g, b, ax, az, bx2, bz2, l, 0, top);
      if (b.kind === 'house') { // windows and doors: black slits; the eaves (or the parapet's string course) throw a band of shadow along the top of lit walls
        if (l > 0.5 && !EDGE && hh(b.seed, nx * 3 + nz + 7) < 0.22) face(g, b, ax, az, bx2, bz2, l - 0.04, 0, b.h * (0.25 + 0.2 * hh(b.seed, 11)), 0.65);  // a weathered, engraved foot
        if (b.palace) palaceFace(g, b, ax, az, bx2, bz2, l);
        else if (b.stoa) stoaFace(g, b, ax, az, bx2, bz2, nx, l);
        else if (b.towerHouse) towerFace(g, b, ax, az, bx2, bz2, l);
        else if (b.court) { if (hh(b.seed, nx * 5 + nz + 3) < 0.5) quad(g, [P(lerp(ax, bx2, 0.42), 0, lerp(az, bz2, 0.42)), P(lerp(ax, bx2, 0.56), 0, lerp(az, bz2, 0.56)), P(lerp(ax, bx2, 0.56), Math.min(2.3, b.h * 0.7), lerp(az, bz2, 0.56)), P(lerp(ax, bx2, 0.42), Math.min(2.3, b.h * 0.7), lerp(az, bz2, 0.42))], 0.01); }   // the yard's gate
        else for (const [x0, z0, x1, z1, y0, y1] of wallWindows(b, ax, az, bx2, bz2, nx)) quad(g, [P(x0, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z0)], 0.01);
        if (b.court) { /* the wall's top is its coping (drawn with the roofs) */ } else if (flat) { // the parapet: a shadow line under its string course, a moonlit coping lip on top
          if (l > 0.3) quad(g, [P(ax, b.h - 0.28, az), P(bx2, b.h - 0.28, bz2), P(bx2, b.h - 0.06, bz2), P(ax, b.h - 0.06, az)], Math.max(0.05, l - 0.3));
          quad(g, [P(ax, top - 0.14, az), P(bx2, top - 0.14, bz2), P(bx2, top, bz2), P(ax, top, az)], EDGE ? (l0 > 0.5 ? 0.95 : l) : clamp(l + 0.06));
        } else if (l > 0.3) quad(g, [P(ax, b.h - 0.55, az), P(bx2, b.h - 0.55, bz2), P(bx2, b.h, bz2), P(ax, b.h, az)], Math.max(0.05, l - 0.3));
        if (b.tall && !b.towerHouse && l > 0.3) quad(g, [P(ax, b.h * 0.47, az), P(bx2, b.h * 0.47, bz2), P(bx2, b.h * 0.47 + 0.25, bz2), P(ax, b.h * 0.47 + 0.25, az)], Math.max(0.05, l - 0.25)); // a string course between storeys
        // now and then an outside stair climbs a moonlit wall to the terrace
        // (the island houses' stair): a lit flight with its shadowed side,
        // the steps notched along its top and a dark door at the landing
        if (flat && !b.court && !b.palace && !EDGE && l > 0.5 && b.h > 4 && b.h < 11 && hh(b.seed, nx * 7 + nz * 3 + 41) < 0.22) {
          const len = Math.hypot(bx2 - ax, bz2 - az), W = (f) => [lerp(ax, bx2, f), lerp(az, bz2, f)];
          const f0 = 0.08 + 0.2 * hh(b.seed, 43), f1 = Math.min(0.92, f0 + Math.min(0.62, (b.h * 1.15) / Math.max(1, len))), yT = b.h - 0.05, th = 0.55;
          const [x0, z0] = W(f0), [x1, z1] = W(f1);
          quad(g, [P(x0, 0, z0), P(x1, yT, z1), P(x1, yT - th, z1), P(x0, 0, z0)], clamp(l + 0.05));                       // the flight
          quad(g, [P(x0, 0, z0), P(x1, yT - th, z1), P(x1, yT - th - 0.22, z1), P(x0, 0, z0)], Math.max(0.05, l - 0.42));  // its shadowed side
          const n = Math.max(4, Math.round(b.h / 0.45));
          for (let i = 1; i < n; i++) { const u = i / n, [sx, sz] = W(lerp(f0, f1, u)), y = yT * u; quad(g, [P(sx, y, sz), P(sx, y + 0.07, sz), P(lerp(sx, x1, 0.02), y + 0.07, lerp(sz, z1, 0.02)), P(lerp(sx, x1, 0.02), y, lerp(sz, z1, 0.02))], Math.max(0.05, l - 0.3)); }
          const [dx0, dz0] = W(Math.min(0.97, f1 + 0.02)), [dx1, dz1] = W(Math.min(0.99, f1 + 0.02 + 0.9 / Math.max(1, len)));
          quad(g, [P(dx0, yT - 2.1, dz0), P(dx1, yT - 2.1, dz1), P(dx1, yT, dz1), P(dx0, yT, dz0)], 0.01);
        }
      }
    }
    // roofs
    if (b.roof === 'gable') { // tiled slopes: the slope toward the moon lit, tile courses inked
      const along = (b.z1 - b.z0) > (b.x1 - b.x0);
      const rh = 2.2;
      const tiles = (pts, l, k) => { // pts: eave, ridge, ridge, eave (the two ends of the slope)
        quad(g, pts.map((q) => P(...q)), l);
        for (let i = 1; i < k; i++) {
          const f = i / k, w = 0.05 / k * 3;
          const A = (u) => pts[0].map((v, j) => v + (pts[3][j] - v) * u), B = (u) => pts[1].map((v, j) => v + (pts[2][j] - v) * u);
          const a0 = A(f), a1 = A(f + w), b0 = B(f), b1 = B(f + w);
          quad(g, [P(...a0), P(...b0), P(...b1), P(...a1)], EDGE ? 0.2 : Math.max(0.03, l - 0.22));
        }
      };
      if (along) { const xm = (b.x0 + b.x1) / 2, k = Math.max(3, Math.round((b.z1 - b.z0) / 0.9));
        const nl = 0.91, ns = 0.4;
        tiles([[b.x0, b.h, b.z0], [xm, b.h + rh, b.z0], [xm, b.h + rh, b.z1], [b.x0, b.h, b.z1]], roofL(-ns, nl, 0), k);
        tiles([[b.x1, b.h, b.z0], [xm, b.h + rh, b.z0], [xm, b.h + rh, b.z1], [b.x1, b.h, b.z1]], roofL(ns, nl, 0), k);
        if (sees(0, -1, xm, b.z0)) quad(g, [P(b.x0, b.h, b.z0), P(b.x1, b.h, b.z0), P(xm, b.h + rh, b.z0)], dimL(lam(0, -1)));
        if (EDGE) quad(g, [P(xm, b.h + rh - 0.16, b.z0), P(xm, b.h + rh - 0.16, b.z1), P(xm, b.h + rh, b.z1), P(xm, b.h + rh, b.z0)], 0.95);   // the ridge catches the moon
      } else { const zm = (b.z0 + b.z1) / 2, k = Math.max(3, Math.round((b.x1 - b.x0) / 0.9));
        tiles([[b.x0, b.h, b.z0], [b.x0, b.h + rh, zm], [b.x1, b.h + rh, zm], [b.x1, b.h, b.z0]], roofL(0, 0.91, -0.4), k);
        tiles([[b.x0, b.h, b.z1], [b.x0, b.h + rh, zm], [b.x1, b.h + rh, zm], [b.x1, b.h, b.z1]], roofL(0, 0.91, 0.4), k);
        if (sees(-1, 0, b.x0, zm)) quad(g, [P(b.x0, b.h, b.z0), P(b.x0, b.h + rh, zm), P(b.x0, b.h, b.z1)], dimL(lam(-1, 0)));
        if (sees(1, 0, b.x1, zm)) quad(g, [P(b.x1, b.h, b.z0), P(b.x1, b.h + rh, zm), P(b.x1, b.h, b.z1)], dimL(lam(1, 0)));
        if (EDGE) quad(g, [P(b.x0, b.h + rh - 0.16, zm), P(b.x1, b.h + rh - 0.16, zm), P(b.x1, b.h + rh, zm), P(b.x0, b.h + rh, zm)], 0.95);
      }
    } else if (flat) {
      const cl = EDGE ? 0.975 : dimL(LT.arris ?? clamp(LT.shadow + LT.roof * inc(0, 1, 0) + 0.1)), cw = b.court ? 0.4 : 0.3;  // copings catch the moon (a court's wall tops)
      for (const [nx, nz, ax, az, bx2, bz2] of walls) { // the coping along each edge, inset
        const ix = -nx * cw, iz = -nz * cw;
        quad(g, [P(ax, top, az), P(bx2, top, bz2), P(bx2 + ix, top, bz2 + iz), P(ax + ix, top, az + iz)], cl);
      }
      if (b.hut) hut(g, b);
    }
    if (b.kind === 'temple') temple(g, b);
  }
  // A terrace (inside drawBox, before the walls): the floor, the inner faces
  // of the parapets turned to the camera, their moon shadows on the floor, a
  // weathered patch, a stair hatch (on the terraces without a hut), the hut's
  // moon shadow.
  function terrace(g, b) {
    const y = b.h, dx = b.x1 - b.x0, dz = b.z1 - b.z0;
    // In the navy pass (o.dim) the terrace takes a FIXED dim-space light, so a shot
    // that lowers LT.roof for standard 31's mid-tones does not darken the foreground
    // out of standard 24's band: STREET_DIM's third tone, varying inside it.
    const tl = EDGE ? clamp(0.655 + (hs(b.seed, 7) - 0.5) * 0.18) : dimL(clamp(LT.shadow + LT.roof * inc(0, 1, 0) - 0.03 + (hs(b.seed, 7) - 0.5) * 0.2));  // weathered terraces vary a band up or down
    quad(g, [P(b.x0, y, b.z0), P(b.x1, y, b.z0), P(b.x1, y, b.z1), P(b.x0, y, b.z1)], tl);
    if (tl > 0.5 && hh(b.seed, 23) < 0.15) { // a weathered patch on the terrace, engraved
      const u0 = 0.15 + 0.4 * hh(b.seed, 29), v0 = 0.15 + 0.4 * hh(b.seed, 31);
      quad(g, [P(b.x0 + dx * u0, y, b.z0 + dz * v0), P(b.x0 + dx * (u0 + 0.4), y, b.z0 + dz * v0), P(b.x0 + dx * (u0 + 0.4), y, b.z0 + dz * (v0 + 0.35)), P(b.x0 + dx * u0, y, b.z0 + dz * (v0 + 0.35))], tl - 0.03, 0.5);
    }
    if (!b.hut && hs(b.seed, 11) < 0.2) { // a stair hatch or light well in the terrace
      const fx = 0.25 + 0.4 * hs(b.seed, 13), fz = 0.25 + 0.4 * hs(b.seed, 17);
      const hx = Math.min(1.1, dx * 0.16), hz = Math.min(1.4, dz * 0.18);
      const cx = b.x0 + dx * fx, cz = b.z0 + dz * fz;
      quad(g, [P(cx, y, cz), P(cx + hx, y, cz), P(cx + hx, y, cz + hz), P(cx, y, cz + hz)], 0.02);
    }
    // moon shadows: each parapet on the moon's side shades a strip of floor behind it
    const sx = -L3[0] / L3[1], sz = -L3[2] / L3[1], cs = LT.cast + 0.08;
    const wz = Math.min(dz * 0.4, Math.abs(sz) * PARAPET), wx = Math.min(dx * 0.4, Math.abs(sx) * PARAPET);
    if (sz > 0) quad(g, [P(b.x0, y, b.z0), P(b.x1, y, b.z0), P(b.x1, y, b.z0 + wz), P(b.x0, y, b.z0 + wz)], cs);
    else if (sz < 0) quad(g, [P(b.x0, y, b.z1 - wz), P(b.x1, y, b.z1 - wz), P(b.x1, y, b.z1), P(b.x0, y, b.z1)], cs);
    if (sx < 0) quad(g, [P(b.x1 - wx, y, b.z0), P(b.x1, y, b.z0), P(b.x1, y, b.z1), P(b.x1 - wx, y, b.z1)], cs);
    else if (sx > 0) quad(g, [P(b.x0, y, b.z0), P(b.x0 + wx, y, b.z0), P(b.x0 + wx, y, b.z1), P(b.x0, y, b.z1)], cs);
    if (b.hut) { // the hut's shadow on the floor, kept inside the parapets
      const H = hutBox(b), c = [[H.x0, H.z0], [H.x1, H.z0], [H.x1, H.z1], [H.x0, H.z1]];
      const sh = hull(c.concat(c.map(([x, z]) => [x + sx * H.h, z + sz * H.h]))).map(([x, z]) => P(clamp(x, b.x0 + 0.3, b.x1 - 0.3), y, clamp(z, b.z0 + 0.3, b.z1 - 0.3)));
      quad(g, sh, cs);
    }
    // the inner faces of the parapets that face the camera
    for (const [nx, nz, ax, az, bx2, bz2] of WALLS(b)) {
      if (!sees(-nx, -nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      const ix = -nx * 0.3, iz = -nz * 0.3;
      face(g, b, ax + ix, az + iz, bx2 + ix, bz2 + iz, dimL(lam(-nx, -nz)), y, y + PARAPET);
    }
  }
  // A courtyard house's open yard (inside drawBox, before the walls): the
  // moonlit floor, the walls' moon shadows across it and the inner faces of
  // the walls turned to the camera (walls 0.4 m thick).
  function yard(g, b) {
    const t = 0.4, X0 = b.x0 + t, X1 = b.x1 - t, Z0 = b.z0 + t, Z1 = b.z1 - t;
    quad(g, [P(X0, 0, Z0), P(X1, 0, Z0), P(X1, 0, Z1), P(X0, 0, Z1)], EDGE ? clamp(0.63 + (hs(b.seed, 7) - 0.5) * 0.1) : dimL(clamp(LT.street - 0.04 + (hs(b.seed, 7) - 0.5) * 0.08)));
    const sx = -L3[0] / L3[1], sz = -L3[2] / L3[1], cs = LT.cast;
    const wz = Math.min((Z1 - Z0) * 0.75, Math.abs(sz) * b.h), wx = Math.min((X1 - X0) * 0.75, Math.abs(sx) * b.h);
    if (sz > 0) quad(g, [P(X0, 0, Z0), P(X1, 0, Z0), P(X1, 0, Z0 + wz), P(X0, 0, Z0 + wz)], cs);
    else if (sz < 0) quad(g, [P(X0, 0, Z1 - wz), P(X1, 0, Z1 - wz), P(X1, 0, Z1), P(X0, 0, Z1)], cs);
    if (sx < 0) quad(g, [P(X1 - wx, 0, Z0), P(X1, 0, Z0), P(X1, 0, Z1), P(X1 - wx, 0, Z1)], cs);
    else if (sx > 0) quad(g, [P(X0, 0, Z0), P(X0 + wx, 0, Z0), P(X0 + wx, 0, Z1), P(X0, 0, Z1)], cs);
    for (const [nx, nz, ax, az, bx2, bz2] of WALLS({ x0: X0, x1: X1, z0: Z0, z1: Z1 })) {
      if (!sees(-nx, -nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      face(g, b, ax, az, bx2, bz2, dimL(lam(-nx, -nz)), 0, b.h);
    }
  }
  // The palace's front (inside drawBox, on each wall it shows): a plinth a
  // band down, a moonlit string course, a loggia of dark openings between
  // piers under the cornice, a regular row of windows on the lower storey.
  function palaceFace(g, b, ax, az, bx2, bz2, l) {
    const len = Math.hypot(bx2 - ax, bz2 - az), W = (f) => [lerp(ax, bx2, f), lerp(az, bz2, f)];
    const band = (f0, f1, y0, y1, v) => { const [x0, z0] = W(f0), [x1, z1] = W(f1); quad(g, [P(x0, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z0)], v); };
    if (l > 0.3) band(0, 1, 0, b.h * 0.13, Math.max(0.05, l - 0.08));
    if (l > 0.3) band(0, 1, b.h * 0.56, b.h * 0.56 + 0.35, clamp(l + 0.07));
    const n = Math.max(3, Math.round(len / 2.6));
    for (let i = 0; i < n; i++) band((i + 0.2) / n, (i + 0.8) / n, b.h * 0.62, b.h * 0.86, 0.02);
    if (l > 0.3) band(0, 1, b.h * 0.9, b.h * 0.9 + 0.45, clamp(l + 0.06));
    const m = Math.max(3, Math.round(len / 3.4));
    for (let i = 0; i < m; i++) band((i + 0.4) / m, (i + 0.6) / m, b.h * 0.24, b.h * 0.4, 0.01);
  }
  // A stoa's face (inside drawBox, on each wall it shows): the face turned to
  // the main street is a colonnade - a few WIDE shafts on a pure-black hall,
  // each on its own base block, under a deep architrave and a moonlit cornice,
  // with one or two intercolumniations blacked out as doorways. Plate 4's
  // colonnade reads from wide shafts on black under a heavy entablature; round
  // 5 drew 17 shafts of 0.92 m on a 3.2 m pitch, which printed as about 6 px
  // of ivory in every 33 - a railing or a barcode across the lower right third.
  // Its other faces are plain walls.
  function stoaFace(g, b, ax, az, bx2, bz2, nx, l) {
    if (Math.abs(nx) < 0.5 || nx * (b.x0 + b.x1) > 0) return;
    const len = Math.hypot(bx2 - ax, bz2 - az), W = (f) => [lerp(ax, bx2, f), lerp(az, bz2, f)];
    const band = (f0, f1, y0, y1, v) => { const [x0, z0] = W(f0), [x1, z1] = W(f1); quad(g, [P(x0, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z0)], v); };
    const yS = 0.6, yA = b.h - 2.5, ex = (bx2 - ax) / len, ez = (bz2 - az) / len;
    const toward = ex * L3[0] + ez * L3[2] > 0;                        // the moon side of each shaft lies toward the face's far end
    const lit = dimL(clamp(LT.shadow + LT.wall * Math.max(inc(ex, 0, ez), inc(-ex, 0, -ez))));
    band(0, 1, yS, yA, 0.0);                                            // the hall: pure black (style rule 4)
    band(0, 1, yS - 0.14, yS, dimL(clamp(LT.shadow + LT.roof * inc(0, 1, 0))));   // the top step's tread
    const n = Math.max(4, Math.round(len / 4.6)), hw = 0.9 / len;        // 1.8 m shafts on a 4.6 m pitch
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / n;
      const [d0, d1, l0, l1] = toward ? [c - hw, c - 0.25 * hw, c - 0.25 * hw, c + hw] : [c + 0.25 * hw, c + hw, c - hw, c + 0.25 * hw];
      band(d0, d1, yS, yA, Math.max(0.1, l + 0.04));                     // the shaft's shaded side
      band(l0, l1, yS, yA, lit);                                        // its moonlit flank
      band(Math.min(d0, l0) - 0.2 * hw, Math.max(d1, l1) + 0.2 * hw, yS, yS + 0.55, Math.max(0.1, lit - 0.04));   // its base block
      if (i < n - 1 && hh(b.seed, i * 13 + 5) < 0.18) band(c + hw, c + 1 / n - hw, yS, yS + 2.6, 0.0);            // a doorway into the black hall
    }
    band(0, 1, yA, yA + 0.9, Math.max(0.05, lit - 0.12));               // the architrave
    band(0, 1, yA - 0.26, yA, Math.max(0.05, l - 0.1));                 // the capitals' shadow line under it
    band(0, 1, b.h - 0.22, b.h, clamp(lit + 0.05));                     // the cornice catches the moon
  }
  // A tower house's face: a tall blind wall, slit windows in three storeys,
  // two string courses and a corbel band under the parapet.
  function towerFace(g, b, ax, az, bx2, bz2, l) {
    const len = Math.hypot(bx2 - ax, bz2 - az), W = (f) => [lerp(ax, bx2, f), lerp(az, bz2, f)];
    const band = (f0, f1, y0, y1, v) => { const [x0, z0] = W(f0), [x1, z1] = W(f1); quad(g, [P(x0, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z0)], v); };
    const n = len > 10 ? 2 : 1, sw = 0.3 / len;
    for (const [k, fy] of [[1, 0.3], [2, 0.57], [3, 0.82]]) for (let i = 0; i < n; i++) {
      if (hh(b.seed, k * 7 + i + Math.round(ax + az)) < 0.25) continue;        // now and then a blind bay
      const c = (i + 0.5) / n + (hh(b.seed, k * 3 + i) - 0.5) * 0.12;
      band(c - sw, c + sw, b.h * fy, b.h * fy + 1.6, 0.01);
      if (l > 0.5) band(c - sw * 1.6, c + sw * 1.6, b.h * fy - 0.18, b.h * fy, clamp(l + 0.06));   // a moonlit sill
    }
    if (l > 0.3) for (const fy of [0.37, 0.7]) band(0, 1, b.h * fy, b.h * fy + 0.3, Math.max(0.05, l - 0.25));
    if (l > 0.3) band(0, 1, b.h - 1.0, b.h - 0.6, Math.max(0.05, l - 0.3));
  }
  // A stair hut or roof pavilion on a terrace: a small box with a door.
  function hut(g, b) {
    const H = hutBox(b), y0 = b.h, y1 = b.h + H.h;
    for (const [nx, nz, ax, az, bx2, bz2] of WALLS(H)) {
      if (!sees(nx, nz, (ax + bx2) / 2, (az + bz2) / 2)) continue;
      const l = dimL(clamp(lam(nx, nz) + (hs(b.seed, 19) - 0.5) * 0.06));
      quad(g, [P(ax, y0, az), P(bx2, y0, bz2), P(bx2, y1, bz2), P(ax, y1, az)], l);
      if (nz < 0) { const d0 = 0.35, d1 = 0.6; quad(g, [P(lerp(ax, bx2, d0), y0, az), P(lerp(ax, bx2, d1), y0, az), P(lerp(ax, bx2, d1), y0 + H.h * 0.72, az), P(lerp(ax, bx2, d0), y0 + H.h * 0.72, az)], 0.01); }
    }
    quad(g, [P(H.x0, y1, H.z0), P(H.x1, y1, H.z0), P(H.x1, y1, H.z1), P(H.x0, y1, H.z1)], EDGE ? 0.69 : dimL(clamp(LT.shadow + LT.roof * inc(0, 1, 0) + 0.04)));
  }
  // Houses that o.dim() puts in the smoke's shadow (dim < 1; they must be
  // the nearest boxes) are drawn after the others in a pass of their own,
  // through an all-navy ramp (STREET_DIM, light values only: standard 18),
  // so they keep their full structure (lit and shaded faces, eaves, windows,
  // contours) as navy tones and the stone's marks never flip them to grey.
  // o.dimMat: false = the old way (one pass, lights compressed by dim).
  // The paved street's slabs and the moon shadows on the ground (world x, z),
  // computed once at bake time for the ground pass and the joints' ink:
  // staggered slabs (rows of seeded length, each split into slabs, the
  // joints offset on alternate rows), and each house's, tree's and the
  // temple's shadow as a convex polygon.
  let GG = null;
  const groundGeom = () => GG ??= (() => {
    const SW = lay.SW, Z1 = o.ground[2], joints = [], casts = [], rows = [];
    const rs = new RNG('slabs');
    let z = -0.6, row = 0;
    while (z > Z1) {
      const len = rs.range(1.6, 2.6), z2 = Math.max(Z1, z - len);
      // the row's cross joints, staggered row to row, about three in ten
      // left out (long slabs); then each slab's bed joint on its own, a
      // little off the row's line, so the paving is laid, not ruled
      const xs = [];
      let x = -SW + (row % 2 ? rs.range(0.8, 1.2) : rs.range(0, 0.3));
      while (x < SW - 0.8) {
        x += rs.range(1.6, 2.4);
        if (x < SW - 0.4 && !rs.chance(0.3)) xs.push(x);
      }
      const ends = [-SW + 0.45, ...xs, SW - 0.45], zj = [];
      for (let i = 0; i < ends.length - 1; i++) { const zz = z + rs.range(-0.12, 0.12); zj.push(zz); joints.push([ends[i], zz, ends[i + 1], zz]); }
      for (let i = 0; i < xs.length; i++) joints.push([xs[i], (zj[i] + zj[i + 1]) / 2, xs[i], z2]);
      // a share of the rows are laid in paler stone (plate 4's stairs and
      // terraces mix two tones of limestone course by course), so the paving is
      // not one flat field whatever band its light sits in
      if (rs.chance(0.45)) rows.push([z, z2]);
      z -= len; row++;
    }
    const sx = -L3[0] / L3[1], sz = -L3[2] / L3[1];
    for (const b of lay.boxes) {
      if ((b.kind !== 'house' && b.kind !== 'temple' && b.kind !== 'tree') || (zmin(b) < 2 && Math.max(b.z0, b.z1) < cam.z)) continue;
      if (b.kind === 'tree') { // a spindle shadow
        const tx = b.x + sx * b.h, tz = b.z + sz * b.h;
        casts.push(hull([[b.x - b.r, b.z], [b.x + b.r, b.z], [b.x, b.z - b.r], [b.x, b.z + b.r], [tx, tz], [lerp(b.x, tx, 0.4) + b.r * 0.8, lerp(b.z, tz, 0.4)], [lerp(b.x, tx, 0.4) - b.r * 0.8, lerp(b.z, tz, 0.4)]]));
        continue;
      }
      const h = b.h + (b.roof === 'gable' ? 1.1 : b.kind === 'house' ? PARAPET : 0);
      const c = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
      casts.push(hull(c.concat(c.map(([x, z]) => [x + sx * h, z + sz * h]))));
    }
    return { joints, casts, rows };
  })();
  // The slab joints as thin ink lines (they would be lost under the stone's
  // marks as guide quads): dark warm grey in the moonlight, a lighter navy
  // inside the houses' moon shadows (standard 19). Each joint is split where
  // it enters a shadow (convex clipping in world x, z).
  const jointsInk = function* (ctx, pp) {     // a generator: it yields every 150 joints (WebKit's 2D canvas is slow)
    const { joints, casts } = groundGeom();
    const boxes = casts.map((q) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; });
    const sgn = casts.map((q) => { let ar = 0; for (let k = 0; k < q.length; k++) { const u = q[k], v = q[(k + 1) % q.length]; ar += u[0] * v[1] - v[0] * u[1]; } return ar > 0 ? 1 : -1; });
    const minW = 0.75 / pp.k, groups = new Map();           // colour | width bucket -> [x0, y0, x1, y1, ...]
    const put = (lit, j, t0, t1) => {
      const [ax, az, bx, bz] = j, xa = ax + (bx - ax) * t0, za = az + (bz - az) * t0, xb = ax + (bx - ax) * t1, zb = az + (bz - az) * t1;
      if (cam.view(xa, za)[1] < 8 || cam.view(xb, zb)[1] < 8) return;
      const w = Math.max(minW, 0.07 * cam.k((xa + xb) / 2, (za + zb) / 2)), key = `${lit ? 1 : 0}|${Math.round(w * 6)}`;
      let g = groups.get(key); if (!g) groups.set(key, (g = []));
      const A = P(xa, 0, za), B = P(xb, 0, zb); g.push(A[0], A[1], B[0], B[1]);
    };
    let n = 0;
    for (const j of joints) {
      const [ax, az, bx, bz] = j, ins = [];
      for (let i = 0; i < casts.length; i++) {
        const B = boxes[i];
        if (Math.max(ax, bx) < B[0] || Math.min(ax, bx) > B[2] || Math.max(az, bz) < B[1] || Math.min(az, bz) > B[3]) continue;
        const q = casts[i], sg = sgn[i];
        let t0 = 0, t1 = 1, ok = true;
        for (let k = 0; k < q.length && ok; k++) { // Cyrus-Beck: inside = left of each edge (counter-clockwise)
          const u = q[k], v = q[(k + 1) % q.length], ex = v[0] - u[0], ez = v[1] - u[1];
          const num = sg * (ex * (az - u[1]) - ez * (ax - u[0])), den = sg * (ex * (bz - az) - ez * (bx - ax));
          if (Math.abs(den) < 1e-9) { if (num < 0) ok = false; continue; }
          const t = -num / den;
          if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
          if (t0 >= t1) ok = false;
        }
        if (ok) ins.push([t0, t1]);
      }
      ins.sort((a, b) => a[0] - b[0]);
      let t = 0;
      for (const [s0, s1] of ins) { if (s1 <= t) continue; if (s0 > t) put(true, j, t, s0); put(false, j, Math.max(t, s0), s1); t = s1; }
      if (t < 1) put(true, j, t, 1);
      if (++n % 150 === 0) yield;
    }
    yield;
    ctx.lineCap = 'butt';
    for (const [key, g] of groups) {
      ctx.strokeStyle = key[0] === '1' ? 'rgba(120,110,100,0.45)' : 'rgba(30,40,94,0.9)';   // engraved on the moonlit paving, lighter navy in the shadows
      ctx.lineWidth = Number(key.slice(2)) / 6;
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i], g[i + 1]); ctx.lineTo(g[i + 2], g[i + 3]); }
      ctx.stroke();
    }
  };
  const dimOf = (b) => (o.dim ? o.dim(b) : 1);
  const navy = !!o.dim && o.dimMat !== false && !!p.night;
  const dimList = navy ? cityList.filter((b) => dimOf(b) < 1) : [];
  const litList = navy ? cityList.filter((b) => dimOf(b) >= 1) : cityList;
  const hmat = o.mat ? smat : mat(smat, { extra: { hatchByAux2: true } });
  if (o.ground) {
    // the city floor, the paved street, then the moon shadows of every box:
    // floor stone (L1c's p.mat.floor: calm, few pits), the street's night ramp
    p.pass(o.mat ?? streetFloorMat(p), function* (g) {
      const G = o.ground, SW = lay.SW, Z1 = G[2];
      groundQuad(g, cam, [[G[0], G[2]], [G[1], G[2]], [G[1], G[3]], [G[0], G[3]]], LT.lane);
      yield;
      groundQuad(g, cam, [[-SW - 2.6, 0], [SW + 2.6, 0], [SW + 2.6, Z1], [-SW - 2.6, Z1]], LT.street);   // the paving reaches the set-back fronts
      for (const s of [-1, 1]) groundQuad(g, cam, [[s * SW, 0], [s * (SW - 0.45), 0], [s * (SW - 0.45), Z1], [s * SW, Z1]], LT.street + 0.2);
      for (const q of lay.squares || []) groundQuad(g, cam, [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]], LT.street);   // the open places, paved
      for (const [za, zb] of groundGeom().rows) groundQuad(g, cam, [[-SW - 2.6, za], [SW + 2.6, za], [SW + 2.6, zb], [-SW - 2.6, zb]], clamp(LT.street + (o.courseLift ?? 0)));
      yield;
      let n = 0;
      for (const q of groundGeom().casts) { groundQuad(g, cam, q, LT.cast); if (++n % 40 === 0) yield; }
    }, { bbox: { ...R }, cost: 3 });
    p.ink(jointsInk, { bbox: (() => { const SW = lay.SW, Z1 = o.ground[2]; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, z] of [[-SW, -0.3], [SW, -0.3], [SW, Z1], [-SW, Z1]]) { if (cam.view(x, z)[1] < 8) continue; const q = P(x, 0, z); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } const bx = Math.max(R.x, x0 - 10), by = Math.max(R.y, y0 - 10); return { x: bx, y: by, w: Math.max(1, Math.min(R.x + R.w, x1 + 10) - bx), h: Math.max(1, Math.min(R.y + R.h, y1 + 10) - by) }; })() });
  }
  // the moonlit houses, trees and the temple, far to near, a pass per depth band
  const bands = [];
  for (const b of litList) { const k = bandOf(markOf(b)); if (!bands.length || bands[bands.length - 1].k !== k) bands.push({ k, list: [] }); bands[bands.length - 1].list.push(b); }
  for (const { k, list: bl } of bands) {
    p.pass(k === 1 ? hmat : mat(hmat, { markScale: k }), function* (g) {
      let n = 0;
      for (const b of bl) {
        DK = navy ? 1 : dimOf(b);
        drawBox(g, b);
        if (++n % 7 === 0) yield;
      }
      DK = 1;
    }, { bbox: bboxOf(bl, 6), cost: 3 });
  }
  if (dimList.length) {
    p.pass(o.dimMat ?? mat(streetMat(p, STREET_DIM), { extra: { hatchByAux2: true } }), function* (g) {
      let n = 0;
      for (const b of dimList) {
        DK = dimOf(b); EDGE = true;
        drawBox(g, b);
        if (++n % 6 === 0) yield;
      }
      DK = 1; EDGE = false;
    }, { bbox: bboxOf(dimList, 6), cost: 3 });
  }
  function tree(g, b) { // a cypress: a dark spindle, its edge toward the moon catching a little light
    const base = P(b.x, 0, b.z), top = P(b.x, b.h, b.z), k = cam.k(b.x, b.z), w = b.r * k;
    const r = new RNG(b.seed), N = 14, L0 = [], R0 = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, prof = Math.sin(Math.PI * Math.pow(t, 0.72)) * (1 - t * 0.3) * (1 + r.range(-0.12, 0.12));
      const y = lerp(base[1], top[1], t), x = lerp(base[0], top[0], t);
      L0.push([x - w * prof, y]); R0.push([x + w * prof, y]);
    }
    const lit = L3[0] > 0 ? R0 : L0, mid = L0.map((q, i) => [(q[0] + R0[i][0]) / 2 + (L3[0] > 0 ? 1 : -1) * w * 0.25, q[1]]);
    g.fillStyle = L(0.06); g.beginPath(); L0.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); for (let i = N; i >= 0; i--) g.lineTo(R0[i][0], R0[i][1]); g.closePath(); g.fill();
    g.fillStyle = L(0.26); g.beginPath(); lit.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); for (let i = N; i >= 0; i--) g.lineTo(mid[i][0], mid[i][1]); g.closePath(); g.fill();
  }
  function temple(g, b) { // stylobate, a colonnade before the dark cella, entablature and pediment
    const fz = sees(0, -1, (b.x0 + b.x1) / 2, b.z0) ? b.z0 : b.z1;
    const lF = Math.max(lam(0, -1), 0.6), base = b.base ?? 4, xm = (b.x0 + b.x1) / 2;
    const n = 8, cw = (b.x1 - b.x0) / (n * 2.1), top = b.h - 3.2;
    quad(g, [P(b.x0 + cw, base, fz), P(b.x1 - cw, base, fz), P(b.x1 - cw, top, fz), P(b.x0 + cw, top, fz)], 0.03); // the dark pronaos
    for (let i = 0; i < 3; i++) quad(g, [P(b.x0 - 0.6 + i * 0.4, base - (i + 1) * 0.8, fz - 0.4 * i), P(b.x1 + 0.6 - i * 0.4, base - (i + 1) * 0.8, fz - 0.4 * i), P(b.x1 + 0.6 - i * 0.4, base - i * 0.8, fz - 0.4 * i), P(b.x0 - 0.6 + i * 0.4, base - i * 0.8, fz - 0.4 * i)], i % 2 ? clamp(lF + 0.12) : clamp(lF - 0.04));
    for (let i = 0; i < n; i++) {
      const xc = b.x0 + cw * 1.1 + ((b.x1 - b.x0 - cw * 2.2) * i) / (n - 1);
      quad(g, [P(xc - cw / 2, base, fz), P(xc + cw / 2, base, fz), P(xc + cw / 2, top, fz), P(xc - cw / 2, top, fz)], clamp(lF - 0.1));
      quad(g, [P(xc, base, fz), P(xc + cw / 2, base, fz), P(xc + cw / 2, top, fz), P(xc, top, fz)], clamp(lF + 0.1));
    }
    quad(g, [P(b.x0 - 0.5, top, fz), P(b.x1 + 0.5, top, fz), P(b.x1 + 0.5, b.h, fz), P(b.x0 - 0.5, b.h, fz)], clamp(lF + 0.08));
    quad(g, [P(b.x0 - 0.5, top, fz), P(b.x1 + 0.5, top, fz), P(b.x1 + 0.5, top + 0.35, fz), P(b.x0 - 0.5, top + 0.35, fz)], 0.12);
    const zb = fz === b.z0 ? b.z1 : b.z0, rl = roofL(L3[0] > 0 ? 0.6 : -0.6, 0.8, 0);       // the roof, its moonward slope lit
    quad(g, [P(L3[0] > 0 ? b.x1 + 0.8 : b.x0 - 0.8, b.h, fz), P(xm, b.h + 4.5, fz), P(xm, b.h + 4.5, zb), P(L3[0] > 0 ? b.x1 + 0.8 : b.x0 - 0.8, b.h, zb)], rl);
    quad(g, [P(b.x0 - 0.8, b.h, fz), P(b.x1 + 0.8, b.h, fz), P(xm, b.h + 4.5, fz)], clamp(lF - 0.02));
    quad(g, [P(b.x0 + 1.4, b.h + 0.4, fz), P(b.x1 - 1.4, b.h + 0.4, fz), P(xm, b.h + 3.7, fz)], clamp(lF - 0.3));
  }
  // ---- the gate leaves, swung wide into the city: the bronze face of the
  // right leaf turned to the passage, the tarred wooden inner face of the left
  const doors = list.filter((b) => b.kind === 'door');
  if (doors.length && o.doors !== false) {
    let dx0 = Infinity, dy0 = Infinity, dx1 = -Infinity, dy1 = -Infinity;
    for (const b of doors) for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z1], [b.x0, b.z1], [b.x1, b.z0]]) for (const y of [0, b.h]) { const q = P(x, y, z); dx0 = Math.min(dx0, q[0]); dy0 = Math.min(dy0, q[1]); dx1 = Math.max(dx1, q[0]); dy1 = Math.max(dy1, q[1]); }
    const bb = { x: dx0 - 6, y: dy0 - 6, w: dx1 - dx0 + 12, h: dy1 - dy0 + 12 };
    const leaf = (b) => { const nx = Math.sign(cam.x - (b.x0 + b.x1) / 2) || 1; return { nx, xf: nx > 0 ? b.x1 : b.x0, bronze: (b.side ?? Math.sign(b.x0)) === -nx }; };
    p.pass(mat(p.mat.bronze, { noise: { scale: 30, amp: 0.02, vScale: 10, vAmp: 0 } }), (g) => {
      for (const b of doors) {
        const { nx, xf, bronze } = leaf(b);
        if (!bronze) continue;
        const l = clamp(0.62 + 0.3 * inc(nx, 0, 0));         // the bronze keeps a gleam even turned from the moon
        quad(g, [P(xf, 0, b.z0), P(xf, 0, b.z1), P(xf, b.h, b.z1), P(xf, b.h, b.z0)], l);
        for (let i = 1; i < 5; i++) { const y = (b.h * i) / 5; quad(g, [P(xf, y, b.z0), P(xf, y, b.z1), P(xf, y + 0.3, b.z1), P(xf, y + 0.3, b.z0)], Math.max(0.05, l - 0.35)); }
        for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { // studs
          const y = (b.h * (i + 0.5)) / 5, z = b.z0 + (b.z1 - b.z0) * (j + 0.5) / 3, r = 0.22;
          quad(g, [P(xf, y - r, z - r), P(xf, y - r, z + r), P(xf, y + r, z + r), P(xf, y + r, z - r)], clamp(l + 0.25));
        }
        quad(g, [P(b.x0, b.h, b.z0), P(b.x1, b.h, b.z0), P(b.x1, b.h, b.z1), P(b.x0, b.h, b.z1)], clamp(l + 0.1));
        quad(g, [P(b.x0, 0, b.z0), P(b.x1, 0, b.z0), P(b.x1, b.h, b.z0), P(b.x0, b.h, b.z0)], clamp(l - 0.2));  // the leaf's edge
      }
    }, { bbox: bb });
    p.pass(p.mat.wood, (g) => {
      for (const b of doors) {
        const { xf, bronze } = leaf(b);
        if (bronze) continue;
        quad(g, [P(xf, 0, b.z0), P(xf, 0, b.z1), P(xf, b.h, b.z1), P(xf, b.h, b.z0)], 0.25);  // tarred planks
        for (let j = 1; j < 6; j++) { const z = lerp(b.z0, b.z1, j / 6); quad(g, [P(xf, 0, z), P(xf, 0, z + 0.12), P(xf, b.h, z + 0.12), P(xf, b.h, z)], 0.12); }
        for (const fy of [0.18, 0.5, 0.82]) { const y = b.h * fy; quad(g, [P(xf, y, b.z0), P(xf, y, b.z1), P(xf, y + 0.45, b.z1), P(xf, y + 0.45, b.z0)], 0.4); } // iron bands
        quad(g, [P(b.x0, b.h, b.z0), P(b.x1, b.h, b.z0), P(b.x1, b.h, b.z1), P(b.x0, b.h, b.z1)], 0.5);
      }
    }, { bbox: bb });
  }
  // ---- the feast's festoons on the lintel (GATE.stone): vermilion swags
  // between three nails, ribbon tails at each nail, the right tower's
  // shadow over the right end
  const gateSeg = list.find((b) => b.kind === 'wall' && b.gate);
  if (gateSeg && o.festoons !== false && lay.GH > 15) {
    const F = GATE.stone.festoons, y0 = F.y * gu, sag = F.sag * gu, xs = F.nails.map((v) => v * gu);
    const tails = F.tails.map((v) => v * gu);
    const cs = [P(xs[0] - 1, y0 + 1, 0), P(xs[2] + 1, y0 + 1, 0), P(xs[0] - 1, y0 - sag - tails[1] - 1, 0), P(xs[2] + 1, y0 - sag - tails[1] - 1, 0)];
    const a0 = [Math.min(...cs.map((q) => q[0])), Math.min(...cs.map((q) => q[1]))], a1 = [Math.max(...cs.map((q) => q[0])), Math.max(...cs.map((q) => q[1]))];
    p.pass(p.mat.red, (g) => {
      const W = (x, y) => P(x, y, -0.05);
      for (let i = 0; i < xs.length - 1; i++) {
        const top = [], bot = [];
        for (let k = 0; k <= 16; k++) {
          const u = k / 16, x = lerp(xs[i], xs[i + 1], u), y = y0 - 0.3 - sag * Math.sin(Math.PI * u), th = 0.25 + 0.45 * Math.sin(Math.PI * u);
          top.push(W(x, y + th / 2)); bot.push(W(x, y - th / 2));
        }
        g.fillStyle = L(0.48); g.beginPath(); top.forEach((q, j) => (j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); for (let j = bot.length - 1; j >= 0; j--) g.lineTo(bot[j][0], bot[j][1]); g.closePath(); g.fill();
        g.fillStyle = L(0.86); g.beginPath(); top.forEach((q, j) => (j ? g.lineTo(q[0], q[1] + 0.9) : g.moveTo(q[0], q[1]))); for (let j = top.length - 1; j >= 0; j--) g.lineTo(top[j][0], top[j][1]); g.closePath(); g.fill();
      }
      xs.forEach((x, i) => {
        const c = W(x, y0 - 0.2), k = cam.k(x, 0);
        g.fillStyle = L(0.9); g.beginPath(); g.arc(c[0], c[1], 0.35 * k, 0, Math.PI * 2); g.fill();
        for (const d of [-1, 1]) {
          const len = tails[(i + (d > 0 ? 1 : 0)) % 2], q0 = W(x + d * 0.1, y0 - 0.4), q1 = W(x + d * 0.45, y0 - 0.4), q2 = W(x + d * 0.4, y0 - len), q3 = W(x + d * 0.1, y0 - len + 0.35);
          g.fillStyle = L(d * (L3[0] > 0 ? 1 : -1) > 0 ? 0.42 : 0.82); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.lineTo(q3[0], q3[1]); g.closePath(); g.fill();
        }
      });
    }, { bbox: { x: a0[0] - 8, y: a0[1] - 8, w: a1[0] - a0[0] + 16, h: a1[1] - a0[1] + 16 } });
  }
}
