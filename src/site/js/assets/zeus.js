// Zeus Xenios as the storm: a towering night thunderhead whose billows are
// his hair and beard. A heavy brow throws the eyes into shadow; under the
// lowered lids the irises look down at the burning city.
//
// Everything is built from lit sphere impostors (p.spheres, the renderer
// behind kit/nature.js cumulus()), so the god is made of the same cloud as
// every other cumulus in the film: white tops toward the moon (upper right)
// carrying pale crevice lace, pale-blue shade engraved with blue strokes that
// model the billows, no contour round each billow. The face is
// modelled the way a relief is modelled in clay: one broad face mass, then
// the brow ridge, nose, cheekbones and moustache raised in front of it
// (higher z), and the sockets, nostrils and mouth darkened between them
// (negative bias). Billow sizes vary strongly: great lobes make the
// silhouette and small ones sit in the creases.
//
// A plate is five sphere passes:
//   1. deck: the storm's flat underside, lit crimson from below by the city;
//   2. tower: the column above the head (rising out of the landscape frame);
//   3. body: the shoulders (the moon side climbing toward the moon) and chest,
//            massed like the prints' cumulus (production standard 22: few
//            florets scaled to their lobe, no holes) and shaded like
//            kit/nature.js cumulus(): modelled by tone and engraved hatching,
//            with ink only where one mass jumps against another (standard 29);
//   4. hair: the crown and the locks past the temples, shaded as a few
//            masses (one light/shade split), behind the face;
//   5. face: the face, its relief (brow, nose, lids), moustache and beard.
// `lit: true` paints the god lit from within by lightning (ZEUS_LIT_MAT),
// which s10 flickers on twos on each strike. That light comes from below and in
// front, so it fills the undersides and pulls the eyes out of their shadow.

import { N, mat } from '../kit/palette.js';
import { RNG, clamp, lerp } from '../engine/rng.js';

// Night cloud with one extra near-black band (irises, nostrils, mouth). The
// white tops meet the pale-blue shade in one crisp step (a second lit tone
// between them made the storm milky: 8% white, no terminator; plates 3-4
// have 12-15% white cutting against blue), broken into angular chips (warp
// 0.45 in 10-unit cells, the torn-paper terminators of plate 3; round 3's
// blobby warp 1.4 in 6-unit cells stippled the white masses at vAmp 0.06). The billows are modelled by tone, not by a
// contour round each one (production standard 29): the crease ink marks only
// a mass jumping against the body behind it (0.8 / 0.06 drew a blue arc round
// every billow, fish scales at 2x).
//
// The engraving models the billows (production standard 32), it never rules
// the shade: the strokes sit in the two deepest visible shade tones
// (light 0.14-0.47 = ramp[1] and ramp[2]) at a period of 11 world units -
// about 15 frame px at the END framing, measured 10-18 - with a strong wobble
// so they follow the masses instead of ruling them (round 4: 5 units at one
// angle = a 5 px screen, the fidelity judge's "mechanical ruled screen").
// The white tops carry no stroke FIELD at all: their crevice lace is drawn
// from the sphere list as curved arcs along the rims where billows meet
// (`zeusLace` below, the same family kit/nature.js cumulus() draws on every
// other cloud in the film). Round 5 carried it on the shader's lit-stroke
// path (`hatch.lit` 1.3), which ruled every lit face edge to edge and broke
// 19% of the storm's white into enclosed dark specks, against the plates'
// 2.9-7.4%: the hero cloud printed as mottled fabric where plates 2/3/5 are
// clean cream lobes with crevices.
// The rims are eroded by world-space noise in a few large bites (no speckle).
// The white top is TWO near-white tones (a seventh ramp entry; the shader
// takes eight), 11 L apart, so the material's own tone noise - which inside
// one flat band is invisible, because the output is posterised - mottles the
// cream the way the plates' white does. Measured in the flattest 40x40 white
// window: plates 3/5/4 carry L std 18-24 after a 3x3 median with 51-58% of
// pixels over gradient 4; round 5's single white tone carried std 9.5 and
// 28%, which is why every attempt to reach the fidelity judge's
// soft_4_20 >= 0.40 ended in a stroke field over the whole cap.
export const ZEUS_MAT = mat(N.cloud, {
  ramp: ['#040a3a', '#0d1d72', '#253c92', '#5269ae', '#a2b1d7', '#e7ecf5', '#f7f8fc'],
  thr: [0.12, 0.3, 0.47, 0.63, 0.8, 0.88],
  noise: { scale: 9, amp: 0.055, vScale: 10, vAmp: 0.065, warp: 0.45, vStretch: 1.5 },
  ink: '#5f74b8', outline: { width: 0, sil: 0, crease: 0.55, creaseThr: 0.13 },
  hatch: { angle: 40, spacing: 11, wfrac: 0.3, jitter: 1, wobble: 1, dashLen: 5, strength: 0.5, lo: 0.14, hi: 0.47, dash: 0.46, color: '#5f6b99', lit: 0 },
  edge: 0.12, edgeScale: 20,
});
// the head erodes less and in larger bites, and keeps broader tone patches:
// its small features (irises, lids, mouth) keep their shape, and the dense
// sphere chains of the brow and moustache do not turn to fur
const HEAD_NOISE = { scale: 22, amp: 0.045, vScale: 8, vAmp: 0.03 };
// (and no crease ink: the face pass's silhouette meets the hair pass, so any
// crease would outline the face like a mask; the features read by tone).
// The face carries no lit stroke field either: the forehead, the cheeks and
// the brow are broad clean planes, as plate 4's statue face is, and only the
// big masses (the face mass and the beard lobes) take a drawn crevice arc
// where another mass lies behind them (`zeusLace`, LACE.headKinds). The brow,
// sockets, nose, moustache and mouth are chains of 3-20 unit spheres, where
// an arc per sphere would be noise.
const HEAD_MAT = mat(ZEUS_MAT, { edge: 0.12, edgeScale: 48, noise: HEAD_NOISE, hatch: { ...ZEUS_MAT.hatch, spacing: 16 }, outline: { width: 0, sil: 0, crease: 0, creaseThr: 0.2 } });
// Lit from within: the same bands raised toward blue-white, the white top
// band wider and its step to the pale blue lower (thr 0.82), so the god is
// brighter in the flash than by moonlight and keeps his white modelling
// (~41% white in the beard, 12% of the storm; round 3's flat periwinkle
// mosaic was 8%), and the crease ink is lighter and rarer than by moonlight:
// uplight makes every floret's rim a light step, and contours read as bubble
// wrap.
// The flash keeps its own hatch window: the engraving stays in the uplit mid
// tones (hi 0.6) and takes no lace on the lit faces (lit 0), so the pale band
// (#e1e6f7, light 0.72-0.82) prints whole. Inheriting the moonlit window cut
// that band into confetti (932 white islands, 20% of the white area in
// enclosed holes against the plates' 139-392 and 3-7%), so the climax landed
// on a mushier god than the moonlight two frames earlier. The trade-off is
// recorded: the lit frame's cloud-edge `soft` is lower than the moonlit
// frame's, and the fidelity target is measured on the moonlit frame.
export const ZEUS_LIT_MAT = mat(ZEUS_MAT, {
  ramp: ['#08104e', '#1f3290', '#4a62b8', '#93a6de', '#e1e6f7', '#ffffff'],
  thr: [0.14, 0.32, 0.52, 0.72, 0.82],
  hatch: { ...ZEUS_MAT.hatch, hi: 0.6, lit: 0 },
  outline: { width: 0, sil: 0, crease: 0.3, creaseThr: 0.15 },
});
// the lit face keeps quieter tone noise (broad patches read as blotches in the flash)
const HEAD_LIT_MAT = mat(ZEUS_LIT_MAT, { edge: 0.12, edgeScale: 48, noise: { scale: 22, amp: 0.02, vScale: 8, vAmp: 0.015 }, outline: { width: 0, sil: 0, crease: 0, creaseThr: 0.2 } });
// The hair is its own pass, painted behind the face: it shades as two or
// three masses with one light/shade split (a high whole-form mix, like plate
// 3's tower), never ball by ball, and it carries no crease ink, so its
// billows are modelled by tone rather than by a contour circle round each
// one (production standard 29); its rims tear in a few large bites.
const HAIR_INK = { width: 0, sil: 0, crease: 0, creaseThr: 0.2 };
const HAIR_MAT = mat(ZEUS_MAT, { edge: 0.12, edgeScale: 28, noise: HEAD_NOISE, hatch: { ...ZEUS_MAT.hatch, spacing: 14 }, outline: HAIR_INK });
const HAIR_LIT_MAT = mat(ZEUS_LIT_MAT, { edge: 0.12, edgeScale: 28, noise: { scale: 22, amp: 0.02, vScale: 8, vAmp: 0.015 }, outline: HAIR_INK });
// the hair's whole form: the crown and the locks falling past the temples
const G_HAIR = [0, -0.7, 1.5, 1.1];
// The underside of the storm, lit by the burning city: red-black to
// vermilion and a cream core (no navy or violet step: seen against the red
// glow, a navy shadow band reads as blue discs, and navy next to red reads
// plum, production standard 15).
export const FIRE_CLOUD_MAT = mat(N.cloud, {
  ramp: ['#0c0406', '#1c0607', '#4a0d10', '#8e1f16', '#c62c1f', '#f3e2bf'],
  thr: [0.22, 0.4, 0.56, 0.72, 0.9],
  edge: 0.12, edgeScale: 12,
});

// Moonlight from the upper right with kit/nature.js cumulus() shading, so
// the god is the same cloud as the rest of the film (STYLE rule 7). The
// moon is taken a little more raking than cumulus()'s lightZ 0.8: the storm
// is seen far closer than any other cloud and its billows need modelling.
const MOON = [0.5, -0.6, 0.66];
// the face takes the same moon a little more raking, so its relief reads
const MOON_FACE = [0.5, -0.6, 0.6];
const CUMULUS = { ambient: 0.56, diffuse: 0.52, baseDark: 0.74, globalMix: 0.5, flatness: 0.6 };
// The storm's body is a night thunderhead: its lower slopes fall deep into
// shade (its base is dark over the burning city), so the moonlit head is the
// light.
const STORM = { ...CUMULUS, ambient: 0.5, baseDark: 0.45 };
// Lightning inside the storm lights it from below and in front: undersides
// flare, tops fall back, the sockets under the brow open (the god's gaze is
// revealed on each strike), and the form survives the flash: each billow
// keeps a white underside over blue-white, and ~41% of the beard reaches
// the top band at full strength (it was a 98% white blob in round 1).
// Flattened normals and part of the big form keep the lower rims from
// beading the hairline and nose.
const LIT = { light: [0.12, 0.85, 0.5], ambient: 0.28, diffuse: 0.62, baseDark: 1, globalMix: 0.45, flatness: 0.5 };
// the whole-form ellipsoids of the storm's body and tower (face units)
const G_BODY = [0, 2.0, 4.4, 3.4], G_TOWER = [0.05, -2.6, 2.8, 3.0];

// ------------------------------------------------------------ helpers
// Walk a polyline (face units) every `step`, calling fn(u, v, t in 0..1).
function along(pts, step, fn) {
  const seg = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
  const n = Math.max(1, Math.round(tot / step));
  for (let q = 0; q <= n; q++) {
    let a = (q / n) * tot, i = 0;
    while (i < seg.length - 1 && a > seg[i]) { a -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, a / seg[i]) : 0;
    fn(lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f), q / n);
  }
}
// Value of a per-point list at t in 0..1.
const at = (arr, t) => { const x = clamp(t) * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(x)); return lerp(arr[i], arr[i + 1], x - i); };
const mirror = (pts, s) => pts.map(([u, v]) => [s * u, v]);

// The face's base relief in face units: a head ellipsoid, height toward the
// viewer. Features are raised from it; the face mass sphere sits below it.
const zF = (u, v) => 0.86 * Math.sqrt(Math.max(0, 1 - (u / 0.92) ** 2 - ((v - 0.12) / 1.12) ** 2));

// ------------------------------------------------------------ lobes
// A cloud mass is a set of great lobes, each edged with florets (smaller
// billows popping out of its rim) and sub-florets: strongly varied sizes,
// the cauliflower edge of the prints' cumulus. Florets are only placed
// where the lobe is exposed (not buried under a lobe in front of it).
// lobes: [{ u, v, R, f (front height), b (bias) }] in face units.
function lobeMass(rng, add, lobes, o = {}) {
  const surf = (L, u, v) => { const d2 = (u - L.u) ** 2 + (v - L.v) ** 2; return d2 < L.R * L.R ? L.f - L.R + Math.sqrt(L.R * L.R - d2) : -Infinity; };
  const hidden = (A, u, v, h) => lobes.some((B) => B !== A && surf(B, u, v) > h + 0.01);
  for (const L of lobes) {
    add(L.u, L.v, L.R, L.f, L.b ?? 0, o.kind);
    // florets at uneven gaps round the rim, mostly small with a few large
    // ones, and a third generation on the larger florets: a ragged,
    // many-scaled edge rather than a ring of equal beads
    const fMin = o.fMin ?? 0.13, fMax = o.fMax ?? 0.46;
    let a = rng.range(0, Math.PI * 2);
    const a1 = a + Math.PI * 2;
    while (true) {
      a += rng.range(0.3, 1.25) / (o.density ?? 1);
      if (a >= a1) break;
      if (o.arc && !o.arc(a, L)) continue;
      const r = L.R * lerp(fMin, fMax, Math.pow(rng.next(), 1.5));
      const d = L.R * rng.range(0.7, 0.97);
      const fu = L.u + Math.cos(a) * d, fv = L.v + Math.sin(a) * d;
      const ff = L.f - L.R + Math.sqrt(L.R * L.R - d * d) + r * rng.range(0.4, 0.7);
      if (hidden(L, fu, fv, ff)) continue;
      add(fu, fv, r, ff, L.b ?? 0, o.kind);
      const ns = r > L.R * 0.24 ? rng.int(1, 2) : (rng.chance(o.sub ?? 0.55) ? 1 : 0);
      const sR = o.subR ?? [0.25, 0.5];
      for (let j = 0; j < ns; j++) {
        const a2 = a + rng.range(-1.1, 1.1), r2 = r * rng.range(sR[0], sR[1]), d2 = r * rng.range(0.75, 0.95);
        const su = fu + Math.cos(a2) * d2, sv = fv + Math.sin(a2) * d2;
        const sf = ff - r + Math.sqrt(r * r - d2 * d2) + r2 * 0.6;
        if (!hidden(L, su, sv, sf)) add(su, sv, r2, sf, L.b ?? 0, o.kind);
      }
    }
    // billows on the lobe's own face (o.face per lobe of R 0.5; own RNG, so
    // the rim florets above are unchanged): a great lobe is never one flat
    // field, its face breaks into smaller billows like the prints' cumulus
    const fr = o.faceRng;
    if (fr && o.face) {
      const n = Math.round(o.face * (L.R / 0.5) ** 2 * fr.range(0.7, 1.3));
      for (let j = 0; j < n; j++) {
        const th = fr.range(0, Math.PI * 2), d = L.R * 0.74 * Math.sqrt(fr.next()), r = L.R * fr.range(...(o.faceR ?? [0.16, 0.34]));
        const fu = L.u + Math.cos(th) * d, fv = L.v + Math.sin(th) * d;
        const ff = L.f - L.R + Math.sqrt(L.R * L.R - d * d) + r * fr.range(0.22, 0.45);
        if (!hidden(L, fu, fv, ff)) add(fu, fv, r, ff, L.b ?? 0, o.kind);
      }
    }
  }
}
const jit = (rng, L, a = 0.06) => ({ ...L, u: L.u + rng.range(-a, a), v: L.v + rng.range(-a, a), R: L.R * rng.range(0.9, 1.1) });

// ------------------------------------------------------------ the head
// Returns spheres in face units { u, v, r, f (front height), b (bias), k (kind) }.
function headSpheres(rng) {
  const H = [];
  const add = (u, v, r, f, b = 0, k = 'face') => { H.push({ u, v, r, f, b, k }); };

  // the face mass: one broad sphere, so forehead and cheeks read as planes
  add(0, 0.16, 0.93, 0.84, 0, 'face');

  for (const s of [-1, 1]) {
    // the brow: a heavy shelf drawn down and in over the eyes; he glowers
    const brow = mirror([[0.05, 0.005], [0.16, -0.035], [0.3, -0.075], [0.45, -0.09], [0.6, -0.07], [0.74, -0.025], [0.86, 0.045]], s);
    const br = [0.09, 0.105, 0.12, 0.125, 0.12, 0.1, 0.08], bf = [0.16, 0.2, 0.24, 0.24, 0.22, 0.16, 0.1];
    // (densely spaced: at 0.03 the chain's domes banded into stripes at 2x)
    along(brow, 0.015, (u, v, t) => add(u, v, at(br, t), zF(u, v) + at(bf, t), 0, 'brow'));
    // (no cloud tufts on its upper edge any more: a row of them read as beads)
    // the socket in the brow's shadow: a long dark hollow, deepest inside
    add(s * 0.29, 0.1, 0.15, zF(s * 0.29, 0.1) + 0.02, -0.6, 'socket');
    add(s * 0.44, 0.11, 0.13, zF(s * 0.44, 0.11) + 0.02, -0.5, 'socket');
    add(s * 0.64, 0.14, 0.11, zF(s * 0.64, 0.14) + 0.05, 0, 'face'); // closes it at the temple
    // the eye, in shadow: the iris low, under a heavy lowered lid
    const z0 = zF(s * 0.37, 0.14);
    add(s * 0.37, 0.15, 0.09, z0 + 0.05, -0.2, 'eye');
    add(s * 0.35, 0.192, 0.062, z0 + 0.066, -0.95, 'iris');
    add(s * 0.375, -0.04, 0.18, z0 + 0.2, -0.3, 'lid');
    // the lower lid: a thin rim in shade (a thick pale one read as goggles)
    along(mirror([[0.27, 0.218], [0.37, 0.236], [0.47, 0.218]], s), 0.01, (u, v) => add(u, v, 0.026, z0 + 0.09, -0.4, 'lid'));
    // nose wing and nostril (the wing away from the moon takes a small bias,
    // so the ridge has a shaded flank and the nose reads as relief)
    add(s * 0.095, 0.505, 0.058, zF(s * 0.095, 0.505) + 0.11, s < 0 ? -0.08 : 0, 'nose');
    add(s * 0.052, 0.565, 0.03, zF(s * 0.052, 0.565) + 0.11, -0.6, 'nostril');
    // the moustache: a heavy drooping mass into the beard, ragged underneath
    const mus = mirror([[0.02, 0.615], [0.1, 0.62], [0.2, 0.645], [0.3, 0.695], [0.38, 0.77], [0.45, 0.86], [0.49, 0.97], [0.5, 1.08]], s);
    const mr = [0.07, 0.088, 0.1, 0.108, 0.108, 0.1, 0.088, 0.07];
    along(mus, 0.02, (u, v, t) => add(u, v, at(mr, t) * rng.range(0.94, 1.06), 0.94 + 0.02 * Math.sin(Math.PI * t), 0, 'mous'));
    along(mus.slice(1), 0.07, (u, v, t) => {
      const r = at(mr, t) * rng.range(0.42, 0.68), d = at(mr, t) * rng.range(0.55, 0.85);
      add(u + s * rng.range(-0.02, 0.03), v + d, r, 0.92 - r * 0.2, -0.04, 'mous');
    });
  }
  // the nose: a long straight ridge from under the brows to the tip. It
  // stands well clear of the face mass (0.12 to 0.34 of a face unit, raised
  // from 0.08-0.26): at the old height the moonlight from the upper right
  // barely broke over it and the mid-face printed as one flat white field
  along([[0, 0.0], [0, 0.24], [0, 0.47]], 0.025, (u, v, t) => add(u, v, lerp(0.068, 0.095, t), zF(u, v) + lerp(0.12, 0.34, Math.pow(t, 1.2)), 0, 'nose'));
  // the mouth: one continuous dark slit under the moustache, tapering to
  // its corners (spaced beads read as a chain); the lower lip under it
  along([[-0.12, 0.79], [0, 0.8], [0.12, 0.79]], 0.012, (u, v, t) => add(u, v, 0.025 + 0.015 * Math.sin(Math.PI * t), 0.84, -0.62, 'mouth'));
  add(0, 0.862, 0.06, 0.86, -0.1, 'lip');

  // ---- the hair: lobes rolling over the crown and falling past the temples
  // the crown: the anastole, two great locks rising from the middle of the
  // brow and parting, then lobes sweeping back, larger toward the moon
  const hair = [[-0.2, -1.06, 0.36], [0.22, -1.1, 0.39], [-0.6, -0.92, 0.33], [0.66, -0.94, 0.36],
    [-0.98, -0.6, 0.29], [1.02, -0.62, 0.32], [-0.42, -1.32, 0.28], [0.5, -1.34, 0.31], [0.02, -1.44, 0.3]]
    .map(([u, v, R]) => jit(rng, { u, v, R, f: 0.36 + R * 0.25 }, 0.04));
  for (const s of [-1, 1]) {
    hair.push(jit(rng, { u: s * 1.06, v: -0.28, R: 0.27, f: 0.4 }), jit(rng, { u: s * 1.13, v: 0.18, R: 0.25, f: 0.4 }),
      jit(rng, { u: s * 1.1, v: 0.62, R: 0.22, f: 0.42 }), jit(rng, { u: s * 1.2, v: 0.98, R: 0.17, f: 0.42 }),
      jit(rng, { u: s * 0.86, v: -0.42, R: 0.17, f: 0.58 }, 0.03), jit(rng, { u: s * 0.9, v: 0.0, R: 0.14, f: 0.56 }, 0.03));
  }
  // few florets, scaled to the lobe, and almost no smallest generation: at
  // 2x a rim of small sub-florets read as popcorn (production standard 22)
  lobeMass(rng, add, hair, { kind: 'hair', density: 0.6, fMin: 0.24, fMax: 0.52, sub: 0.15, subR: [0.4, 0.55] });
  // the hairline: a few large billows over the top of the forehead (nine
  // small ones read as a row of beads); painted with the hair, behind the face
  for (let i = 0; i < 5; i++) {
    const t = (i + rng.range(0.15, 0.85)) / 5, th = Math.PI * (1.12 + 0.76 * t);
    const r = Math.min(0.2, rng.range(0.12, 0.19) * (rng.chance(0.3) ? 1.2 : 1));
    const k = rng.range(0.82, 0.9) + (rng.chance(0.25) ? 0.06 : 0);
    add(Math.cos(th) * k, 0.12 + Math.sin(th) * 0.98 * k, r, 0.6 + r * 0.35, 0, 'hairline');
  }
  // the hair beside the face falls into shadow: a crease that keeps the
  // face's contour clear against the moonlit locks
  for (const h of H) if (h.k === 'hair') {
    const e = Math.hypot(h.u / 0.84, (h.v - 0.16) / 0.98);
    if (h.v > -0.55 && e < 1.32) h.b -= 0.2 * clamp((1.32 - e) / 0.3);
  }
  // ---- the beard: rows of hanging lobes (each tucked under the row above,
  // like the curls of a carved beard) narrowing to two points
  const rows = [
    [1.02, 0.22, [-0.8, -0.48, -0.16, 0.16, 0.48, 0.8]],
    [1.38, 0.26, [-0.74, -0.37, 0, 0.37, 0.74]],
    [1.74, 0.24, [-0.6, -0.2, 0.2, 0.6]],
    [2.08, 0.2, [-0.5, -0.18, 0.18, 0.5]],
    [2.38, 0.15, [-0.42, -0.24, 0.24, 0.42]],
    [2.6, 0.1, [-0.3, 0.3]],
  ];
  const beard = [];
  rows.forEach(([v, R, us], row) => {
    us.forEach((u, i) => {
      const outer = i === 0 || i === us.length - 1;
      const L = jit(rng, { u: u + (outer ? Math.sign(u) * rng.range(-0.06, 0.1) : 0), v: v - 0.05 * Math.abs(u), R: R * (outer ? rng.range(0.85, 1.2) : 1.08), f: 0.86 - 0.14 * row + 0.08 * (1 - Math.min(1, Math.abs(u) / 0.9)) }, outer ? 0.07 : 0.04);
      beard.push(L);
    });
  });
  lobeMass(rng, add, beard, { kind: 'beard', fMin: 0.2, fMax: 0.4, sub: 0.3, subR: [0.38, 0.55], arc: (a) => Math.sin(a) > -0.35 });
  // a lock at each temple closes the gap between the face and the hair
  // (a navy sliver there read as a hole through the cloud); in the hair's shade
  // and a second lock just below it, where the eroded rims of the face mass
  // and the side lobes met over the sky (navy slivers at 2x)
  for (const s of [-1, 1]) { add(s * 0.92, 0.02, 0.13, 0.5, -0.15, 'hair'); add(s * 0.94, 0.22, 0.12, 0.47, -0.15, 'hair'); }
  return H;
}

// ------------------------------------------------------------ the storm body
// Lobes of the thunderhead in face units: broad shoulders either side of
// the head (the far left one lower), the chest behind the beard, and a tower
// rising out of frame behind the head. Front heights follow the method of
// kit/nature.js cumulus(): the centre and the lower lobes come forward.
function stormLobes(rng) {
  const L = [];
  const push = (u, v, R) => {
    const dome = Math.sqrt(Math.max(0, 1 - (u / 4.2) ** 2)), low = clamp((v + 4.8) / 7.5);
    // neighbours at clearly different depths: the crease between two lobes is
    // then the front one's round edge, never a straight plane cut
    L.push(jit(rng, { u, v, R, f: 1.6 * dome * (0.55 + 0.45 * low) + R * 0.3 + rng.range(-0.16, 0.16) }, 0.07));
  };
  // shoulders: not a mirror-symmetric dome; the moon side (right) climbs
  // toward the moon as a towering mass (its top lobes ~0.3U higher than the
  // dome's), the far side (left) slumps lower; filler lobes close the gaps
  // between the climbing rows (no holes through the cloud)
  [[1.55, 0.3, 0.62], [2.15, 0.52, 0.6], [2.75, 0.82, 0.55], [3.25, 1.38, 0.48], [3.62, 1.95, 0.4],
    [1.4, 1.8, 0.62], [2.08, 1.9, 0.58], [2.78, 2.2, 0.5], [3.35, 2.48, 0.36], [2.45, 0.12, 0.42], [2.0, 1.15, 0.5],
    [1.85, -0.1, 0.5], [2.6, -0.02, 0.42], [3.1, 0.55, 0.42], [3.4, 1.0, 0.36],
    [2.6, 1.5, 0.5], [3.05, 1.8, 0.44], [2.35, 1.0, 0.45]].forEach(([u, v, R]) => push(u, v, R));
  // (the far side ends short of the frame's left edge: the left ~14% of the
  // landscape frame stays open navy over the burning skyline, so the mass
  // climbs from left to right toward the moon instead of filling the width)
  [[-1.5, 1.22, 0.6], [-2.1, 1.5, 0.57], [-1.4, 1.95, 0.6], [-2.05, 2.15, 0.55]].forEach(([u, v, R]) => push(u, v, R));
  // chest
  [[-0.75, 1.95, 0.62], [0, 2.05, 0.68], [0.75, 1.95, 0.62], [-0.6, 0.9, 0.6], [0.6, 0.9, 0.6]].forEach(([u, v, R]) => push(u, v, R));
  return L;
}
// The tower rising out of frame behind the head: lobes stepping in and out
// like a cumulonimbus column, painted as its own pass so it is shaded as a
// column (its far side in shade), not as the top of the shoulders' dome.
function towerLobes(rng) {
  const L = [];
  // narrow behind the crown, opening upward into an anvil above the frame
  [[-0.6, -0.6, 0.55], [0.6, -0.55, 0.58], [-0.85, -1.45, 0.6], [0.7, -1.35, 0.62], [-0.1, -1.75, 0.5],
    [-1.3, -2.2, 0.6], [1.2, -2.1, 0.62], [-0.3, -2.45, 0.66], [0.5, -2.6, 0.55], [0.45, -1.88, 0.48],
    [-1.9, -2.95, 0.55], [1.8, -2.85, 0.6], [-0.9, -3.1, 0.66], [0.7, -3.2, 0.7], [0, -3.5, 0.5],
    [-2.4, -3.6, 0.5], [2.2, -3.5, 0.55], [-1.4, -3.9, 0.66], [1.3, -3.95, 0.66], [-0.2, -4.2, 0.7],
    [-0.8, -4.7, 0.55], [0.9, -4.65, 0.6], [2.6, -4.2, 0.45], [-2.7, -4.3, 0.45]].forEach(([u, v, R]) => {
    const low = clamp((v + 4.8) / 7.5);
    L.push(jit(rng, { u, v, R, f: 1.55 * (0.55 + 0.45 * low) + R * 0.3 + rng.range(-0.16, 0.16) }, 0.06));
  });
  return L;
}

// ------------------------------------------------------------ no holes
// The rim erosion bites every sphere's edge, so where billows only just
// meet, the sky showed through the storm as navy specks (production
// standard 22: no holes). On a grid, the storm's coverage (each billow at
// its eroded radius) is grown by one cell and the outside is flood-filled
// from the border; an uncovered cell more than `rim` cells from the outside
// is an enclosed gap, backed by a small billow behind the rest (in the tone
// of the billow next to it) that shows only through the gap. The
// silhouette's notches belong to the outside, so the cauliflower outline is
// kept. list: { u, v, r, f, b } in face units, as lobeMass adds them.
// Returns the backing billows.
function fillHoles(list, o = {}) {
  const S = o.step ?? 0.05, keep = 1 - (o.edge ?? 0.12), RIM = o.rim ?? 3;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const b of list) { u0 = Math.min(u0, b.u - b.r); v0 = Math.min(v0, b.v - b.r); u1 = Math.max(u1, b.u + b.r); v1 = Math.max(v1, b.v + b.r); }
  u0 -= 2 * S; v0 -= 2 * S;
  const W = Math.ceil((u1 - u0) / S) + 4, H = Math.ceil((v1 - v0) / S) + 4, N = W * H;
  const who = new Int32Array(N).fill(-1);   // a billow covering the cell
  list.forEach((b, n) => {
    const r = b.r * keep, i0 = Math.max(0, Math.floor((b.u - r - u0) / S)), i1 = Math.min(W - 1, Math.ceil((b.u + r - u0) / S));
    const j0 = Math.max(0, Math.floor((b.v - r - v0) / S)), j1 = Math.min(H - 1, Math.ceil((b.v + r - v0) / S));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if ((u0 + i * S - b.u) ** 2 + (v0 + j * S - b.v) ** 2 < r * r) who[j * W + i] = n;
  });
  // dilate a mask by d cells (square), separably
  const grow = (m, d) => {
    const a = new Uint8Array(N), b = new Uint8Array(N);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (m[j * W + i]) for (let x = Math.max(0, i - d); x <= Math.min(W - 1, i + d); x++) a[j * W + x] = 1;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (a[j * W + i]) for (let y = Math.max(0, j - d); y <= Math.min(H - 1, j + d); y++) b[y * W + i] = 1;
    return b;
  };
  const D = grow(who.map((n) => (n >= 0 ? 1 : 0)), 1);
  const out = new Uint8Array(N), stack = [];
  for (let i = 0; i < W; i++) stack.push(i, (H - 1) * W + i);
  for (let j = 0; j < H; j++) stack.push(j * W, j * W + W - 1);
  while (stack.length) {
    const k = stack.pop();
    if (out[k] || D[k]) continue;
    out[k] = 1;
    const i = k % W;
    if (i > 0) stack.push(k - 1);
    if (i < W - 1) stack.push(k + 1);
    if (k >= W) stack.push(k - W);
    if (k < N - W) stack.push(k + W);
  }
  const O = grow(out, RIM);
  const R = o.r ?? 0.08, res = [], done = new Uint8Array(N), c = Math.ceil((R * keep) / S);
  let fmin = Infinity;
  for (const b of list) fmin = Math.min(fmin, b.f - b.r);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (who[k] >= 0 || O[k] || done[k]) continue;
    let nb = -1;   // the tone of a billow next to the gap
    for (let rr = 1; rr < 8 && nb < 0; rr++) for (let dj = -rr; dj <= rr && nb < 0; dj++) for (let di = -rr; di <= rr; di++) {
      const x = i + di, y = j + dj;
      if (x >= 0 && y >= 0 && x < W && y < H && who[y * W + x] >= 0) { nb = who[y * W + x]; break; }
    }
    res.push({ u: u0 + i * S, v: v0 + j * S, r: R, f: fmin - 0.3 + R, b: nb >= 0 ? list[nb].b : 0, back: true });
    for (let dj = -c; dj <= c; dj++) for (let di = -c; di <= c; di++) {
      const x = i + di, y = j + dj;
      if (x >= 0 && y >= 0 && x < W && y < H && (di * S) ** 2 + (dj * S) ** 2 < (R * keep) ** 2) done[y * W + x] = 1;
    }
  }
  return res;
}

// ------------------------------------------------------- crevices
// Crevices between billows (kit/nature.js shadeBillows' occlusion term, which
// Zeus had no equivalent of): a billow with another one in front of it sits
// in a crease, so it drops toward the next tone down. Without it the
// whole-form light (globalMix 0.5) printed every lit billow of a mass in the
// same top tone and the storm's white was one blank field, where plate 3's
// cap is a mosaic of cream lobes with blue crevices between them. The term is
// a smooth function of position, so neighbouring billows of one mass still
// share their tone and the mass reads before its florets (standard 22).
// list: world spheres { x, y, r, z, bias }; occluders are the lobes over minR.
// The crease only cuts the LIT masses, where plate 3 puts it; on a mass's
// shade side the billows keep one quiet tone (kit/nature.js shadeFade /
// inheritShade), or every unburied floret there prints as a pale disc on
// blue - the bubble wrap the s02 judge counts.
const CREVICE = 0.09;
function creviceBias(list, { crevice = CREVICE, minR = 0, global, light, mid = 0.38, k = 0.3 } = {}) {
  const big = list.filter((s) => s.r >= minR && !s.back);
  const n0 = Math.hypot(light[0], light[1], light[2]) || 1;
  const lx = light[0] / n0, ly = light[1] / n0, lz = light[2] / n0;
  const [gcx, gcy, grx, gry] = global;
  for (const s of list) {
    if (s.back) continue;   // a backing billow is already the crevice itself
    const gx = (s.x - gcx) / Math.max(1, grx), gy = (s.y - gcy) / Math.max(1, gry);
    const g2 = Math.min(1, gx * gx + gy * gy);
    const ml = Math.max(0, gx * lx + gy * ly + Math.sqrt(1 - g2) * lz);
    const w = clamp((ml - mid) / k);
    if (w <= 0) continue;
    let occ = 0;
    for (const o of big) {
      const vz = o.z - s.z;
      if (vz <= 0 || o === s) continue;
      const sg = o.r * 1.25, s2 = sg * sg;
      const dxy = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
      if (dxy < s2 * 12) occ += Math.exp(-dxy / (s2 * 1.4)) * Math.min(1, vz / o.r);
    }
    s.bias = (s.bias ?? 0) - crevice * clamp(occ / 1.5) * w;
  }
}

// ------------------------------------------------- pale crevice lace
// Production standard 32: the white tops carry PALE CREVICE LACE, and the
// engraving is never a ruled screen. kit/nature.js cumulus() draws that lace
// from its own sphere list - a thin arc of the pale blue along a lit cap's
// lower rim WHEREVER ANOTHER BILLOW LIES BEHIND IT, so cream lobes separate
// into crevices instead of fusing into one white field - and Zeus now draws
// the same family over his own lists, so the god and the sky's clouds are
// one hand (round 5's known issue). Every line follows the billow it belongs
// to, so it bends with each bulge and changes angle from billow to billow,
// and nothing is drawn over the open plane of a cap.
// Each line is drawn one ramp tone DEEPER than the tone it crosses (the
// plates' crevices: a blue-grey line in the cream, a mid blue in the pale
// blue), so a crevice reads wherever it falls instead of needing one colour
// to work on white and on navy at once - which is what forced round 5's
// single hatch colour to be too dark for the white.
const LACE = {
  minR: 8,             // the smallest storm billow that carries a line
  headMinR: 14,        // the head's masses only (see headKinds)
  // TWO arc families per billow, each a true arc segment and never a ring
  // round it (standard 29: the billows are modelled by tone, not by a contour
  // circle): one on the rim away from the moon, where the crevice falls in the
  // pale blue, and one on the moon-facing rim, where the crevice between a
  // billow and the higher one behind it falls in the cream. Round 5's single
  // away-from-the-moon family could only reach the cream by opening the window
  // past 270 degrees, which drew exactly the rings standard 29 bans.
  fams: [{ turn: 0, win: 150, w: 3.4 }, { turn: Math.PI, win: 110, w: 3.8 }],
  tone: 0.72,          // width floor as a share of w, rising toward the lighter tones
  lo: 3,               // the lowest ramp band a line prints in (the lit half)
  dash: [9, 26], gap: [2.5, 9],
  // a crevice line in the cream register is a NEUTRAL grey-blue, as plate 4's
  // are - (170, 174, 184) at chroma 15, against the ramp's own pale blue at
  // chroma 53, which is what made round 5's marks read as blue ruling
  white: '#a8adba',
  // on the head only the broad masses take an arc; the brow, sockets, nose,
  // moustache and mouth are chains of 3-20 unit spheres
  headKinds: new Set(['face', 'beard', 'hair', 'hairline']),
};
const surfZ = (s, x, y) => { const dx = x - s.x, dy = y - s.y, q = s.r * s.r - dx * dx - dy * dy; return q > 0 ? s.z + Math.sqrt(q) : -Infinity; };
// A bucket grid over a sphere list (world units), for the depth and crevice tests.
function laceGrid(list) {
  const rs = list.map((s) => s.r).sort((a, b) => a - b);
  const cell = Math.max(8, (rs[Math.floor(rs.length / 2)] ?? 20) * 2);
  const g = new Map();
  for (const s of list) {
    const i1 = Math.floor((s.x + s.r) / cell), j1 = Math.floor((s.y + s.r) / cell);
    for (let j = Math.floor((s.y - s.r) / cell); j <= j1; j++) for (let i = Math.floor((s.x - s.r) / cell); i <= i1; i++) {
      const k = `${i},${j}`; const a = g.get(k); if (a) a.push(s); else g.set(k, [s]);
    }
  }
  const EMPTY = [];
  return (x, y) => g.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) || EMPTY;
}
// The guide's light at (x, y) on sphere s, exactly as the sphere shader
// computes it (engine/illustrate.js SFRAG), without the material's tone
// noise, which moves a band edge by a few hundredths at most.
function lightOf(s, x, y, o) {
  const vx = (x - s.x) / s.r, vy = (y - s.y) / s.r, r2 = vx * vx + vy * vy;
  if (r2 >= 1) return -1;
  const z = Math.sqrt(1 - r2), nx = vx * o.fl, ny = vy * o.fl, nl = Math.hypot(nx, ny, z) || 1;
  let lam = Math.max(0, (nx * o.lx + ny * o.ly + z * o.lz) / nl);
  const gx = (x - o.gcx) / Math.max(1, o.grx), gy = (y - o.gcy) / Math.max(1, o.gry);
  const g2 = Math.min(1, gx * gx + gy * gy);
  const glam = Math.max(0, gx * o.lx + gy * o.ly + Math.sqrt(1 - g2) * o.lz);
  lam += (glam - lam) * o.gm;
  let L = o.amb + o.dif * lam + (s.bias ?? 0);
  const f = clamp((y - o.topY) / Math.max(1, o.baseY - o.topY));
  L *= 1 + (o.bd - 1) * f * f;
  return clamp(L);
}
// Shading frame of one sphere pass, in the form lightOf wants.
function laceFrame(light, sh, global, baseY, topY, flatBase) {
  const n0 = Math.hypot(light[0], light[1], light[2]) || 1;
  return {
    lx: light[0] / n0, ly: light[1] / n0, lz: light[2] / n0,
    amb: sh.ambient, dif: sh.diffuse, bd: sh.baseDark ?? 0.8, gm: sh.globalMix ?? 0.45, fl: sh.flatness ?? 0.65,
    gcx: global[0], gcy: global[1], grx: global[2], gry: global[3],
    baseY, topY, clip: flatBase === false ? Infinity : baseY,
  };
}
// groups: [{ list, frame, kinds }] in PAINT order, so a later pass covers an
// earlier one wherever it paints (the same rule as the five p.spheres calls).
// thr / ramp: the material's bands, so each line takes the tone one step
// below the band it crosses.
// Returns strokes [{ pts: Float32Array of x, y, half-width triples, color }].
function* zeusLace(groups, thr, ramp, seed) {
  const all = [];
  groups.forEach((G, pass) => { for (const s of G.list) all.push({ x: s.x, y: s.y, r: s.r, z: s.z, pass, clip: G.frame.clip }); });
  const at = laceGrid(all);
  yield;
  const out = [];
  const rng = new RNG(seed + ':lace');
  // band(L): which ramp tone the guide's light prints at (0 .. thr.length)
  const band = (L) => { let i = 0; while (i < thr.length && L > thr[i]) i++; return i; };
  const lo = thr[LACE.lo - 1];
  let work = 0;
  for (let pass = 0; pass < groups.length; pass++) {
    const G = groups[pass], F = G.frame;
    // the arc sits on the side of the billow away from the moon, where a cap
    // turns down into the crevice below it
    const ls = Math.hypot(F.lx, F.ly) || 1, tShade = Math.atan2(-F.ly / ls, -F.lx / ls);
    const rimK = 1 - ZEUS_MAT.edge - 0.03;
    for (const s of G.list) {
      const minR = G.kinds ? LACE.headMinR : LACE.minR;
      if (s.r < minR || (G.kinds && !G.kinds.has(s.k))) continue;
      if (++work % 12 === 0) yield;
      const rr0 = rng.fork(`${Math.round(s.x)}:${Math.round(s.y)}:${Math.round(s.r)}`);
      const rOut = s.r + Math.max(2, s.r * 0.08);
      // a crevice: the cloud goes on past this part of the rim, so the arc
      // marks where two billows meet and never outlines the storm against the sky
      const behind = (t) => {
        const qx = s.x + Math.cos(t) * rOut, qy = s.y + Math.sin(t) * rOut;
        if (qy > F.clip) return true;
        for (const o of at(qx, qy)) {
          if (o.x === s.x && o.y === s.y && o.r === s.r) continue;
          if (qy > o.clip) continue;
          const dx = qx - o.x, dy = qy - o.y;
          if (dx * dx + dy * dy < o.r * o.r * 0.94) return true;
        }
        return false;
      };
      const front = (x, y) => {
        const zs = surfZ(s, x, y);
        for (const o of at(x, y)) {
          if (o.pass < pass) continue;
          if (y > o.clip) continue;
          const dx = x - o.x, dy = y - o.y;
          if (dx * dx + dy * dy >= o.r * o.r * 0.94) continue;
          if (o.pass > pass) return false;
          if (o.x === s.x && o.y === s.y && o.r === s.r) continue;
          if (surfZ(o, x, y) > zs + 0.01) return false;
        }
        return true;
      };
      for (const FAM of LACE.fams) {
      const rr = rr0.fork(FAM.turn);
      const rho = s.r * rimK - FAM.w * 0.55 - rr.range(0, 0.25) * FAM.w * 3;
      if (rho < Math.max(s.r * 0.25, FAM.w * 0.75)) continue;
      const half = (FAM.win * Math.PI / 180) * rr.range(0.8, 1.15) * 0.5;
      const mid = tShade + FAM.turn + rr.range(-0.35, 0.35);
      const dT = Math.min(0.09, 2.6 / rho);   // ~2.6 world units between samples
      const nT = Math.max(2, Math.ceil((2 * half) / dT));
      let run = null, runB = 0;
      const flush = () => {
        if (run && run.length >= 4) {
          // the line is one tone deeper than the band it crosses: a blue-grey
          // crevice in the cream, a mid blue in the pale blue
          // (the two near-white tones count as one register: a crevice under
          // the cream is the neutral grey-blue, not the other cream)
          const ci = Math.max(1, Math.min(ramp.length - 3, runB - 1));
          const color = ci === ramp.length - 3 ? LACE.white : ramp[ci];
          let i = 0;
          while (i < run.length) {
            const len = Math.max(3, Math.round(rr.range(LACE.dash[0], LACE.dash[1]) / (dT * rho)));
            const seg = run.slice(i, i + len);
            i += len + Math.round(rr.range(LACE.gap[0], LACE.gap[1]) / (dT * rho));
            if (seg.length < 3 || seg.length * dT * rho < LACE.dash[0] * 0.5) continue;
            const pts = new Float32Array(seg.length * 3);
            const wob = rr.range(-0.3, 0.3), wf = rr.range(1.5, 3.5);
            seg.forEach(([t, b], j) => {
              const u = j / (seg.length - 1);
              const taper = Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * u)), 0.7);
              // a crevice under a white cap is the heaviest line, one in the
              // pale blue the lightest (the plates' weighting)
              const tone = clamp(LACE.tone + (1 - LACE.tone) * (b - LACE.lo) / Math.max(1, thr.length - LACE.lo + 1));
              const rq = rho + wob * Math.sin(u * wf);
              pts[j * 3] = s.x + Math.cos(t) * rq; pts[j * 3 + 1] = s.y + Math.sin(t) * rq;
              pts[j * 3 + 2] = (FAM.w / 2) * taper * tone;
            });
            out.push({ pts, color });
          }
        }
        run = null;
      };
      for (let j = 0; j <= nT; j++) {
        const t = mid - half + (2 * half * j) / nT;
        const x = s.x + Math.cos(t) * rho, y = s.y + Math.sin(t) * rho;
        let ok = y < F.clip - FAM.w;
        let b = 0;
        if (ok) { const L = lightOf(s, x, y, F); ok = L >= lo; b = band(L); }
        if (ok) ok = behind(t) && front(x, y);   // behind() is the cheaper test
        if (ok && run && b !== runB) flush();   // a line keeps one tone along its length
        if (ok) { runB = b; (run || (run = [])).push([t, b]); }
        else flush();
      }
      flush();
      }
    }
  }
  return out;
}
// Draw the lace as tapered ribbons: one path and one fill per batch, with a
// yield between them, so a plate's lace is never one long bake unit
// (production standards 17 and 23).
function* drawLace(ctx, strokes, batch = 400) {
  let col = null, n = 0;
  for (const st of strokes) {
    if (st.color !== col || ++n % batch === 0) {
      if (col !== null) { ctx.fill(); if (n % batch === 0) yield; }
      col = st.color; ctx.fillStyle = col; ctx.beginPath();
    }
    {
      const pts = st.pts;
      const m = pts.length / 3;
      if (m < 2) continue;
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
  }
  if (col !== null) ctx.fill();
}

// ------------------------------------------------------------ layout
const LAYOUTS = new Map();
// o: { x, y (nose bridge), U (bridge to chin), seed }. World-space sphere
// lists plus anchors for actors: eyes (irises), mouth, beardTip, browY,
// deckY, headBox, bodyBox, baseBox, bbox.
export function zeusLayout(o = {}) {
  const X = o.x ?? 800, Y = o.y ?? 220, U = o.U ?? 185, seed = o.seed ?? 'zeus';
  const key = `${X}:${Y}:${U}:${seed}`;
  if (LAYOUTS.has(key)) return LAYOUTS.get(key);
  const rng = new RNG(seed);
  const deckV = 2.74;
  const P = (u, v) => [X + u * U, Y + v * U];
  const box = (list) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of list) { x0 = Math.min(x0, b.x - b.r); y0 = Math.min(y0, b.y - b.r); x1 = Math.max(x1, b.x + b.r); y1 = Math.max(y1, b.y + b.r); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  // head: front heights become depth (z toward the viewer). The beard ends
  // at the storm's flat base: a beard lobe hanging below it reads as a lone
  // ball against the red skyline wherever the fire-lit underside is dark
  const baseY = Y + deckV * U;
  const toHead = (s) => ({ x: X + s.u * U, y: Y + s.v * U, r: s.r * U, z: (1.2 + s.f - s.r) * U, bias: s.b, k: s.k, u: s.u, v: s.v });
  const H = headSpheres(rng.fork('head')).filter((s) => s.k !== 'beard' || Y + (s.v + s.r) * U < baseY - 4);
  const head = H.map(toHead);
  // body: lobes and florets, shaded like kit/nature.js cumulus(). Massed
  // (production standard 22): few florets, scaled to their lobe, and a few
  // broad billows on each lobe's face; at the old density (1.1, face 4, sub
  // 0.55) every small floret's crease ink outlined a coin: popcorn at 1x
  const MASSED = { kind: 'body', density: 0.7, fMin: 0.2, fMax: 0.55, sub: 0.25, subR: [0.38, 0.55], face: 1.5, faceR: [0.25, 0.42] };
  const B = [];
  lobeMass(rng.fork('body'), (u, v, r, f, b) => B.push({ u, v, r, f, b }), stormLobes(rng.fork('lobes')), { ...MASSED, faceRng: new RNG(`${seed}:bodyFace`) });
  // the head stands in front of the storm: the moon throws its shadow onto
  // the billows to its lower left, which keeps the god's silhouette clear.
  // A coarse mask of the head's own spheres gives the shadow its lumpy edge.
  const MU0 = -1.8, MV0 = -1.8, MS = 0.04, MW = 92, MH = 118, mask = new Uint8Array(MW * MH);
  for (const h of head) {
    const i0 = Math.max(0, Math.floor((h.u - h.r / U - MU0) / MS)), i1 = Math.min(MW - 1, Math.ceil((h.u + h.r / U - MU0) / MS));
    const j0 = Math.max(0, Math.floor((h.v - h.r / U - MV0) / MS)), j1 = Math.min(MH - 1, Math.ceil((h.v + h.r / U - MV0) / MS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(MU0 + i * MS - h.u, MV0 + j * MS - h.v) < h.r / U) mask[j * MW + i] = 1;
  }
  const inHead = (u, v) => { const i = Math.round((u - MU0) / MS), j = Math.round((v - MV0) / MS); return i >= 0 && j >= 0 && i < MW && j < MH && mask[j * MW + i] === 1; };
  // graded with the distance to the silhouette, so neighbouring lobes (whose
  // creases can run nearly straight) never differ by a hard step
  const shade = (u, v) => { for (const d of [0.06, 0.12, 0.2, 0.3, 0.42, 0.56]) if (inHead(u + 0.62 * d, v - 0.75 * d)) return 1 - d / 0.62; return 0; };
  B.push(...fillHoles(B, { edge: ZEUS_MAT.edge }));
  const body = B.map((s) => ({ x: X + s.u * U, y: Y + s.v * U, r: s.r * U, z: (0.6 + s.f - s.r) * U, bias: s.b - 0.13 * shade(s.u, s.v), u: s.u, v: s.v, back: s.back }));
  const T = [];
  lobeMass(rng.fork('tower'), (u, v, r, f, b) => T.push({ u, v, r, f, b }), towerLobes(rng.fork('towerLobes')), { ...MASSED, faceRng: new RNG(`${seed}:towerFace`) });
  T.push(...fillHoles(T, { edge: ZEUS_MAT.edge }));
  const tower = T.map((s) => ({ x: X + s.u * U, y: Y + s.v * U, r: s.r * U, z: (0.6 + s.f - s.r) * U, bias: s.b, u: s.u, v: s.v, back: s.back }));
  // the storm's own crevices (see creviceBias): the lit masses break into
  // cream lobes with blue creases between them instead of one blank field
  const GM = (g) => [X + g[0] * U, Y + g[1] * U, g[2] * U, g[3] * U];
  creviceBias(body, { minR: 0.18 * U, global: GM(G_BODY), light: MOON });
  creviceBias(tower, { minR: 0.18 * U, global: GM(G_TOWER), light: MOON });
  // enclosed gaps in the head (the eroded rims of the face mass and the side
  // locks met over the sky at the temples) are backed from behind too, but
  // only where no storm billow lies behind them (a backing billow drawn in the
  // head pass would cover the storm as a froth of small discs)
  const behind = [...B, ...T];
  for (const g of fillHoles(H, { edge: HEAD_MAT.edge, step: 0.03, r: 0.06 })) {
    if (!behind.some((q) => (q.u - g.u) ** 2 + (q.v - g.v) ** 2 < (q.r * 0.9) ** 2)) head.push(toHead({ ...g, k: 'hair' }));
  }
  // deck: the storm's underside, lit from below. Painted behind the body:
  // each low billow gets a slightly larger twin hanging a little lower, so a
  // crimson crescent shows under it, and small bellies hang below the flat
  // base in a scalloped strip.
  const dr = rng.fork('deck');
  const deck = [];
  for (const b of body) {
    if (b.v < deckV - 0.9 || b.r < 0.06 * U) continue;
    deck.push({ x: b.x, y: b.y + 0.05 * U, r: b.r * 1.03, z: b.z, bias: 0, u: b.u, v: b.v + 0.05 });
  }
  // The scalloped strip of bellies hanging under the base: each one hangs
  // from the cloud's own underside (the lowest rim of the body at that u),
  // never from the flat base where the body stops short of it - a belly in
  // such a gap printed as an isolated flat-bottomed dome, a balloon over the
  // roofline. Irregular in gap and size, so the fire-lit fringe never reads
  // as a string of equal beads, and small enough that its rim stays inside
  // the base clip (0.06U) instead of being cut flat.
  const rimOf = (u) => {
    let v = -Infinity;
    for (const b of body) {
      const du = (b.x - X) / U - u, rr = (b.r / U) * 0.88;
      if (Math.abs(du) < rr) v = Math.max(v, (b.y - Y) / U + Math.sqrt(rr * rr - du * du));
    }
    return v;
  };
  for (let u = -2.7; u < 3.8; u += dr.range(0.1, 0.26)) {
    if (dr.chance(0.22)) continue;
    const rim = rimOf(u);
    if (!Number.isFinite(rim)) continue;
    const r = dr.range(0.035, 0.08) * (dr.chance(0.2) ? 1.25 : 1);
    const v = Math.min(deckV, Math.max(rim - 0.02, deckV - 0.5)) - r * dr.range(0.1, 0.4);
    deck.push({ x: X + u * U, y: Y + v * U, r: r * U, z: 2 * U + r * U, bias: 0, u, v });
  }
  const headBox = box(head), bodyBox = box(body), towerBox = box(tower), baseBox = box(deck);
  const all = box([...head, ...body, ...tower, ...deck]);
  const lay = {
    X, Y, U, deckY: baseY, head, body, tower, deck, headBox, bodyBox, towerBox, baseBox, bbox: all,
    hair: head.filter((s) => s.k === 'hair' || s.k === 'hairline'), face: head.filter((s) => s.k !== 'hair' && s.k !== 'hairline'),
    eyes: [P(-0.345, 0.182), P(0.345, 0.182)], mouth: P(0, 0.8), beardTip: P(0, 2.6), browY: Y - 0.15 * U,
  };
  if (LAYOUTS.size > 8) LAYOUTS.clear();
  LAYOUTS.set(key, lay);
  return lay;
}

// ------------------------------------------------------------ painting
// Paint Zeus into a layer. o: { x, y (nose bridge), U (bridge to chin),
// seed, lit (lightning from within), litUV [u, v] (strike centre in face
// units), base: false (skip the fire-lit underside), fireAt(x) -> 0..1
// (fire intensity under the storm at world x; the underside glows there),
// mat, fireMat }.
// Returns the layout (eyes, mouth, beardTip, deckY, boxes) for actors.
export function paintZeus(p, o = {}) {
  const lay = zeusLayout(o);
  const lit = !!o.lit;
  const { X, Y, U } = lay;
  const lu = o.litUV ?? [0, 1.2];
  // lightning inside the storm: billows near the strike glow a little more
  const near = (s) => clamp(1 - Math.hypot(s.u - lu[0], (s.v - lu[1]) * 0.7) / 2.6);
  const gm = (cx, cy, rx, ry) => [X + cx * U, Y + cy * U, rx * U, ry * U];
  const top = lay.bodyBox.y;

  // 1. the underside, lit crimson by the burning city (behind the body);
  //    o.fireAt(x) -> 0..1 makes it glow over the fires and darken between
  if (o.base !== false) {
    const deck = o.fireAt ? lay.deck.filter((s) => o.fireAt(s.x) > 0.3).map((s) => ({ ...s, bias: -0.32 + 0.48 * clamp(o.fireAt(s.x)) })) : lay.deck;
    p.spheres(o.fireMat ?? FIRE_CLOUD_MAT, deck, {
      light: [0.08, 0.9, 0.42], ambient: lit ? 0.26 : 0.14, diffuse: lit ? 0.72 : 0.64,
      baseY: lay.deckY + 0.06 * U, topY: lay.baseBox.y, baseDark: 1, flatBase: true, globalMix: 0, flatness: 0.7,
    });
  }

  // 2. the thunderhead: the tower behind, then the shoulders and chest
  // o.litShade / o.litHead override the lit shading (test plates only)
  const LS = { ...LIT, ...(o.litShade || {}) };
  const tower = lit ? lay.tower.map((s) => ({ ...s, bias: 0.12 * near(s) })) : lay.tower;
  const ttop = lay.towerBox.y;
  p.spheres(o.mat ?? (lit ? ZEUS_LIT_MAT : ZEUS_MAT), tower, lit
    ? { ...LS, baseY: lay.deckY, topY: ttop, flatBase: true, global: gm(...G_TOWER) }
    : { light: MOON, ...STORM, baseY: lay.deckY, topY: ttop, flatBase: true, global: gm(...G_TOWER) });
  const body = lit ? lay.body.map((s) => ({ ...s, bias: 0.14 * near(s) + s.bias * 0.3 })) : lay.body;
  p.spheres(o.mat ?? (lit ? ZEUS_LIT_MAT : ZEUS_MAT), body, lit
    ? { ...LS, baseY: lay.deckY, topY: top, flatBase: true, global: gm(0, 1.6, 4.4, 3.6) }
    : { light: MOON, ...STORM, baseY: lay.deckY, topY: top, flatBase: true, global: gm(...G_BODY) });

  // 3. the hair (behind the face, shaded as masses), then the face,
  //    moustache and beard: the same cloud; in the flash the eyes open
  // THE HEAD KEEPS THE MOON KEY IN THE FLASH. The storyboard asks strike 3 to
  // land on the full face and keep its form; a light from below and in front
  // inverted it instead - forehead 244 -> 150, beard 150 -> 234, the uplit
  // moustache a bright white horseshoe round the mouth and the storm's
  // white>240 falling .091 -> .045, for the four twos-frames the plate is on.
  // The flash's brightness now comes from HEAD_LIT_MAT / HAIR_LIT_MAT (the
  // raised ramp) and from a lighter base, not from a new light direction, so
  // the glowering brow, its cast shadow and the lit crown all hold; the
  // storm's body, tower and deck stay uplit, which is where the lightning is.
  const hair = lit ? lay.hair.map((s) => ({ ...s, bias: s.bias + 0.1 * near(s) })) : lay.hair;
  p.spheres(o.mat ?? (lit ? HAIR_LIT_MAT : HAIR_MAT), hair, lit
    ? { light: MOON_FACE, ...CUMULUS, globalMix: 0.7, flatness: 0.7, baseDark: 0.78, baseY: Y + 2.75 * U, topY: lay.headBox.y, flatBase: false, global: gm(...G_HAIR) }
    : { light: MOON_FACE, ...CUMULUS, globalMix: 0.7, flatness: 0.7, baseDark: 0.7, baseY: Y + 2.75 * U, topY: lay.headBox.y, flatBase: false, global: gm(...G_HAIR) });
  const face = lit ? lay.face.map((s) => ({ ...s, bias: s.k === 'socket' ? s.bias * 0.45 : s.k === 'eye' ? -0.12 : s.k === 'mous' ? s.bias + 0.16 : s.k === 'mouth' ? s.bias - 0.1 : s.bias + 0.1 * near(s) })) : lay.face;
  p.spheres(o.mat ?? (lit ? HEAD_LIT_MAT : HEAD_MAT), face, lit
    ? { light: MOON_FACE, ...CUMULUS, globalMix: 0.45, flatness: 0.6, baseDark: 0.78, ...(o.litHead || {}), baseY: Y + 2.75 * U, topY: lay.headBox.y, flatBase: false, global: gm(0, 1.0, 1.6, 2.2) }
    : { light: MOON_FACE, ...CUMULUS, globalMix: 0.45, flatness: 0.65, baseDark: 0.7, baseY: Y + 2.75 * U, topY: lay.headBox.y, flatBase: false, global: gm(0, 1.0, 1.6, 2.2) });

  // 4. the pale crevice lace on the moonlit white tops (production standard
  //    32; see LACE). Drawn after every pass, with the passes' own paint
  //    order as its depth test, so a line prints only where its billow is
  //    what the eye sees. The flash takes NO lace: any stroke in its pale
  //    band cuts it into islands (round 4's defect, ZEUS_LIT_MAT).
  if (!lit && !o.mat && o.lace !== false) {
    const hb = Y + 2.75 * U;
    const groups = [
      { list: lay.tower, frame: laceFrame(MOON, STORM, gm(...G_TOWER), lay.deckY, lay.towerBox.y, true) },
      { list: lay.body, frame: laceFrame(MOON, STORM, gm(...G_BODY), lay.deckY, lay.bodyBox.y, true) },
      { list: lay.hair, frame: laceFrame(MOON_FACE, { ...CUMULUS, globalMix: 0.7, flatness: 0.7, baseDark: 0.7 }, gm(...G_HAIR), hb, lay.headBox.y, false), kinds: LACE.headKinds },
      { list: lay.face, frame: laceFrame(MOON_FACE, { ...CUMULUS, globalMix: 0.45, flatness: 0.65, baseDark: 0.7 }, gm(0, 1.0, 1.6, 2.2), hb, lay.headBox.y, false), kinds: LACE.headKinds },
    ];
    const b = lay.bbox;
    p.ink(function* (ctx) {
      let st = lay.lace;
      if (!st) { st = yield* zeusLace(groups, ZEUS_MAT.thr, ZEUS_MAT.ramp, String(o.seed ?? 'zeus')); lay.lace = st; }
      yield;
      yield* drawLace(ctx, st);
      // (bbox = the layout's own bbox, i.e. the union of the five sphere
      // passes, so the lace never grows the layer canvas: a stroke sits at
      // rho < r inside its billow, and the silhouette carries none - the
      // crevice test needs cloud behind the rim)
    }, { bbox: { x: b.x, y: b.y, w: b.w, h: b.h } });
  }
  return lay;
}
