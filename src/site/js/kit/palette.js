// Palette and materials, measured from the user's five reference prints
// (k-means over all plates, plus flat-sky / flat-sea patch statistics):
//   day sky  ≈ rgb(33,62,148)…rgb(32,71,154)   night sky ≈ rgb(8,22,104)
//   day sea  ≈ rgb(19,44,115)                   night sea ≈ rgb(4,7,64)
//   ivory #efe7dc · stone #d6cdc1 #bdb4a7 #a0978b #7c7568 · umber #343328
//   ink #060606 · pine #2d3728 #4e5d44 · vermilion #c62c1f / #791b14
//   plate-4 night stone #453f33 #71665b #93887d #b2a79d #d1c7bd #eee7e2
//   plate-1 pine/maquis #202c19 #344b2c #4e6a44 #718c64 (olive/sage, S ~.36)
// Everything a plate paints should come from here so the shots read as one
// series of prints.

export const C = {
  ink: '#08080b', inkBlue: '#0b1030',
  ivory: '#efe7dc', ivory2: '#e6ddd0', bone: '#f6f1e7', white: '#fbf8f1',
  stone1: '#d6cdc1', stone2: '#bdb4a7', stone3: '#a0978b', stone4: '#7c7568', stone5: '#515444', umber: '#343328',
  skyDayTop: '#1c3a92', skyDay: '#1f4199', skyDayLow: '#27499f',
  skyNightTop: '#040c4a', skyNight: '#081668', skyNightLow: '#0d2178',
  seaDay: '#132c76', seaDayDeep: '#0c2266', seaDayLight: '#3a63b6',
  seaNight: '#050a48', seaNightDeep: '#020428', seaNightLight: '#22388c',
  distant1: '#5a74c0', distant2: '#8198cf', distant3: '#b3c2e4',
  pine1: '#1d221e', pine2: '#2d3728', pine3: '#3f4f37', pine4: '#4e5d44',
  red: '#c62c1f', redHot: '#e0482a', redDark: '#791b14', redDeep: '#3d0905',
  cream: '#f3e2bf', flame: '#f6d9a0',
  navy: '#0c1440', navy2: '#18256a',
  flesh: '#c8876a', fleshDark: '#8c4f36',
  moon: '#f7f4ec',
};

const INK = C.ink;

// --- material presets (ramps go dark → light, thr are band thresholds) ---
export const M = {
  stone: {
    mode: 'stone', ink: INK,
    // tone 0 is the plates' near-black neutral (plate 3's terrace shadow, plate 1's stairs; standard 25)
    ramp: ['#10120f', '#5b574f', '#8d877c', '#b2aa9d', '#d0c8bb', '#ece5d9'],
    thr: [0.13, 0.3, 0.46, 0.62, 0.78],
    // plate limestone (standards 18, 26 and 31: the one stone vocabulary): small upright
    // polygonal chips (low Voronoi warp) over a little fbm blotching. The marks gather
    // in weathered patches (wScale world units, edge gain wSharp, share wCover): inside,
    // lit faces drop a step greyer (patch) and carry the facets (lit, capped at litCap),
    // pits and cracks. Engraving reaches every lit face (standard 31): the band's strokes
    // run up to hi 0.86 (lit faces are painted 0.82-0.92), and above it short strokes
    // (hatch.lit) sit on every lit face, sparse on clean dressed stone (litSparse) and
    // dense in the patches. Shade-side faces keep their facets and the vertical engraving.
    noise: { scale: 46, amp: 0.05, vScale: 7, vAmp: 0.11, warp: 0.45, vStretch: 0.75, lit: 1.4, weather: 1, wScale: 160, wSharp: 4, wCover: 0.55, patch: 0.85, litCap: 2.7 },
    // engraved strokes: width = wfrac x spacing (world units), each line its own weight;
    // weather 0.7: the upper band's strokes keep x0.3 on clean stone and thicken (up to x1.2) in patches.
    // The marks are CHISEL CHIPS, not lines: wide (0.54 x 5 = 2.7 units) and short (dashLen 2.1),
    // turning +-19 degrees per 34-unit patch, so a mark's height/width is about 1.3 as in the
    // plates (round 5's 0.3 x 5 at dashLen 5 measured 2.0-2.5 and read as vertical streaking).
    hatch: { angle: 90, spacing: 5.0, wfrac: 0.54, jitter: 1, strength: 0.6, lo: 0.3, hi: 0.86, dash: 0.7, dashLen: 2.1, lit: 0.85, litSparse: 0.12, weather: 0.7, vary: 38, varyScale: 34 },
    // pits: fine chips plus a few big four-sided pits, a share on lit faces, gathered in patches and darker facets
    speck: { dark: 0.08, size: 2.4, light: 0.0, lit: 0.35, cluster: 0.7, facet: 1, aspect: 1.4, big: 0.07, bigSize: 10 },
    // crease: inks the dark side of a step over about 2 x creaseW world units (one line per
    // joint at any DPR, see engine/illustrate.js); creaseW 2.0 + crease 0.95 keep the plates' weight
    outline: { width: 2.2, sil: 0.85, crease: 0.95, creaseThr: 0.14, creaseW: 2.0 },
    crack: { amp: 0.55, width: 0.14 },                    // Voronoi-cell units; broken strokes (crack.broken 0 = continuous)
  },
  rock: {
    mode: 'rock', ink: INK,
    ramp: ['#0b0c0a', '#46423a', '#7b7568', '#a69f91', '#cbc3b5', '#f8f4ec'],   // tone 0 near-black (plate 5's cliff shadow); top = sunlit paper white (plate 3's cliff)
    thr: [0.12, 0.28, 0.45, 0.6, 0.76],
    // cliff limestone (plates 3 and 5): small, faint upright facets on the shade planes
    // (no camouflage), pale grey chips mottling the lit planes in small, soft weathered
    // patches (the rock plates are evenly busy: wScale = the blotch scale, low edge gain),
    // engraving that reaches the lit planes (hi 0.86 + short chisel strokes on every lit
    // plane, hatch.lit, evenly: no litSparse), fine and big pits. The strokes turn by up
    // to +-32 degrees per 70-unit patch (hatch.vary), so a cliff face reads as chisel
    // marks following the bedding, not as vertical drips down the whole buttress. They are
    // bigger and fewer than a wall's (spacing 6.2, a ~2.1-unit stroke, dashLen 1.8), so a
    // cliff under a slow pan does not alias into twinkle (s11).
    noise: { scale: 60, amp: 0.05, vScale: 5, vAmp: 0.12, warp: 0.3, vStretch: 0.7, lit: 2.2, weather: 0.85, wScale: 60, wSharp: 2.5 },
    hatch: { angle: 92, spacing: 6.2, wfrac: 0.34, jitter: 1, strength: 0.65, lo: 0.24, hi: 0.86, dash: 0.5, dashLen: 1.8, lit: 0.9, vary: 64, varyScale: 70 },
    speck: { dark: 0.12, size: 2.2, light: 0.0, lit: 0.4, cluster: 0.7, facet: 1, aspect: 1.5, big: 0.22, bigSize: 9 },
    outline: { width: 1.6, sil: 0.7, crease: 0.0, creaseThr: 0.2 },
    crack: { amp: 0.0, width: 0.05 },
  },
  cloud: {
    mode: 'cloud', ink: '#2b3f8f',
    ramp: ['#33509f', '#5d78bf', '#97aad8', '#d3dcee', '#fbfaf6'],
    thr: [0.3, 0.48, 0.64, 0.79],
    noise: { scale: 17, amp: 0.055, vScale: 6, vAmp: 0.03 },
  },
  sea: {
    mode: 'sea', ink: INK,
    ramp: ['#0b2064', '#122b74', '#1a3888', '#3a63b6', '#eef2fa'],
    thr: [0.3, 0.5, 0.82, 0.995],
    noise: { scale: 9 },
    extra2: [0.5, 0.35, 0.93, 0.55], // stroke contrast, glint amount, light-stroke rarity, stroke lift
  },
  sand: {
    mode: 'sand', ink: INK,
    ramp: ['#3b3a33', '#9b968a', '#cdc1aa', '#ece6d8', '#f6f2e8'],
    thr: [0.2, 0.42, 0.62, 0.8],
    noise: { scale: 10, amp: 0.05, vScale: 5, vAmp: 0.06 },
    extra2: [0.5, 0, 0, 0],
    speck: { dark: 0.05, size: 1.1, light: 0 },
    // plate 5's beach: short dark strokes along the shore on the white sand
    // (Round 6 tried varied stroke angles here, through the square vary
    // patches; with the sand's long dashes every patch edge printed as a
    // straight seam - a checkerboard across s01's beach, the final review's
    // must-fix - so the sand keeps one angle until the patches can be warped.)
    hatch: { angle: 0, spacing: 4.5, width: 1.6, jitter: 0.8, wobble: 0.6, dashLen: 8, strength: 0.85, lo: 0.45, hi: 1.1, dash: 0.6, color: '#4d4a40' },
  },
  foliage: {
    mode: 'foliage', ink: '#060a06',
    ramp: ['#0f150e', '#202c19', '#344b2c', '#4e6a44', '#718c64'],
    thr: [0.2, 0.4, 0.6, 0.8],
    noise: { scale: 3.2 },
    extra2: [0.75, 0.25, 0, 0],
    erode: 0.25,
    outline: { width: 0.9, sil: 0.45 },
  },
  wood: {
    mode: 'wood', ink: '#050403',
    ramp: ['#0c0a08', '#1d1813', '#352c23', '#56493b', '#857560', '#bcae95'],
    thr: [0.14, 0.3, 0.47, 0.64, 0.82],
    noise: { scale: 6, amp: 0.03, vScale: 8, vAmp: 0.05 },
    extra2: [0.32, 0, 0, 0],
    speck: { dark: 0.05, size: 1.0 },
    outline: { width: 1.0, sil: 0.9, crease: 0.85, creaseThr: 0.12 },
  },
  metal: {
    mode: 'metal', ink: INK,
    ramp: ['#07080b', '#1b1d24', '#3c414f', '#7d879f', '#c8cfdf', '#ffffff'],
    thr: [0.15, 0.32, 0.55, 0.74, 0.9],
    noise: { scale: 10, amp: 0.025 },
    outline: { width: 0.9, sil: 0.9, crease: 0.5, creaseThr: 0.2 },
  },
  bronze: {
    mode: 'metal', ink: INK,
    ramp: ['#0a0806', '#2a2016', '#4f3f2a', '#7c6847', '#b49e72', '#efe2bd'],
    thr: [0.15, 0.32, 0.52, 0.72, 0.9],
    noise: { scale: 12, amp: 0.03, vScale: 6, vAmp: 0.03 },
    outline: { width: 0.9, sil: 0.9, crease: 0.6, creaseThr: 0.18 },
  },
  red: {
    mode: 'cloth', ink: '#1a0402',
    ramp: ['#2e0603', '#6e140c', '#a8231a', '#c62c1f', '#e2563c'],
    thr: [0.16, 0.36, 0.58, 0.82],
    noise: { scale: 18, amp: 0.04 },
    outline: { width: 0.9, sil: 0.8, crease: 0.4, creaseThr: 0.2 },
  },
  navyCloth: {
    mode: 'cloth', ink: '#02030a',
    ramp: ['#03050f', '#0a1036', '#16215c', '#26388a', '#4560b0'],
    thr: [0.18, 0.38, 0.6, 0.84],
    noise: { scale: 18, amp: 0.04 },
    outline: { width: 0.9, sil: 0.8, crease: 0.4, creaseThr: 0.2 },
  },
  linen: {
    mode: 'cloth', ink: INK,
    ramp: ['#4b4741', '#8d877d', '#bdb5a8', '#e1d9cc', '#f8f3ea'],
    thr: [0.18, 0.38, 0.6, 0.82],
    noise: { scale: 18, amp: 0.04 },
    hatch: { angle: 75, spacing: 1.6, width: 0.6, strength: 0.35, lo: 0.2, hi: 0.55, dash: 0.5 },
    outline: { width: 0.9, sil: 0.8, crease: 0.45, creaseThr: 0.18 },
  },
  skin: {
    mode: 'skin', ink: '#1a0b06',
    ramp: ['#3d1d12', '#7a4430', '#b06c52', '#cf9375', '#e8bea2'],
    thr: [0.18, 0.38, 0.6, 0.82],
    outline: { width: 0.8, sil: 0.8, crease: 0.3, creaseThr: 0.2 },
  },
  mountain: {
    mode: 'mountain', ink: '#2a3f8a',
    ramp: ['#2c4295', '#435ca9', '#5f79bd', '#8099cf', '#a9bce2'],
    thr: [0.22, 0.42, 0.6, 0.8],
    noise: { scale: 26, amp: 0.08, vScale: 10, vAmp: 0.05 },
    extra2: ['#a7b6df'], // shadowed snow colour
  },
  distant: {
    mode: 'flat', ink: '#2a3f8a',
    ramp: ['#3d5bad', '#5875bf', '#7f97cf', '#b3c2e4', '#e5eaf5'],
    thr: [0.22, 0.45, 0.66, 0.86],
    noise: { scale: 12, amp: 0.05, vScale: 5, vAmp: 0.05 },
  },
  ink: { mode: 'flat', ink: INK, ramp: ['#060608', '#14151b', '#2a2c36'], thr: [0.4, 0.8] },
};

// Presets of the one stone vocabulary (production standards 18 and 26). Kits and
// shots choose among M.stone / M.rock / M.floor / M.statue (N.* at night) and
// override only light-independent values (cracks, joints, markScale).
// - M.floor: calm horizontal stone (paving, stair treads, terraces): weak facets
//   (no grey camouflage at mid values) and few pits on the lit faces, rare big pits,
//   horizontal worn strokes in the mid-tones and short worn strokes on every lit
//   face (never vertical 'rain' on a floor). Risers and walls stay M.stone.
// - M.statue: carved figures (heads and bodies under ~600 units): no big pits,
//   finer and fainter facets and pits, finer weather patches, finer engraving that
//   reaches the lit drapery (standard 31), rare fine cracks, so a face never reads
//   as pitted or measled.
// - markScale (any stone material, default 1): scales the marks with depth or
//   size - mat(p.mat.stone, { markScale: 0.4 }) for a far house front; marks that
//   end up under a few pixels fade out (see engine/illustrate.js run()).
// - markOffset (any material, default [0, 0]): shifts the mark fields (blotching,
//   facets, weathered patches, pits, cracks) by a world offset, so two passes over
//   the same stone can carry different weathering - mat(p.mat.floor, { markOffset:
//   [370, 0] }) breaks a patch that would otherwise cross the slabs a pass draws.
M.floor = mat(M.stone, {
  noise: { vAmp: 0.07, lit: 0.45, weather: 0.8, wScale: 120, wSharp: 8, wCover: 0.4, patch: 0.25, litCap: 1.2 },
  // standard 39: the engraving runs ACROSS the tread (angle 90), with a wide angle spread
  // and a 45% share of the patches chiselled along the row instead (hatch.alt), so a floor
  // reads as plate 4's chiselled limestone rather than as a one-direction comb
  hatch: { ...M.stone.hatch, angle: 90, vary: 70, varyScale: 32, alt: { angle: 0, share: 0.45 }, spacing: 4.2, wfrac: 0.42, dash: 0.58, strength: 0.55, dashLen: 4.5, lit: 1.0 },
  speck: { ...M.stone.speck, lit: 0.1, cluster: 0.8, big: 0.02 },
  crack: { ...M.stone.crack, amp: 0.3 },
});
M.statue = mat(M.stone, {
  // carved marble takes a brighter top tone than a wall: plates 4 and 5 put a statue's
  // stone p90 at 235-236 against a wall's 229, so a lit limb reads as marble
  ramp: [...M.stone.ramp.slice(0, 5), '#f3ece4'],
  noise: { scale: 30, vScale: 4.5, vAmp: 0.08, lit: 1.0, weather: 0.9, wScale: 70, wCover: 0.45, patch: 0.5, litCap: 1.6 },
  hatch: { ...M.stone.hatch, spacing: 4, dashLen: 2.4, vary: 36, varyScale: 24, lit: 0.5 },
  speck: { ...M.stone.speck, size: 1.7, lit: 0.15, big: 0, bigSize: 6 },
  crack: { amp: 0.38, width: 0.04 },
  outline: { ...M.stone.outline, creaseW: 1.5 },   // narrower creases, so a carved figure is not darkened
});

// Night variants: same structure, moonlit (image 4 keeps the stone bright and
// drops the sky and sea to deep ultramarine). Night stone and rock follow the
// plate-4 k-means (warm ivory over warm grey, r > b). The two deepest tones are
// navy-black and a dark neutral-navy charcoal, so a big shadow field reads as
// moon shadow, not brown dirt. No ramp carries a violet/plum cast (standard 15).
export const N = {
  // standard 38: SEVEN tones, from plate 4's own k-means centres (#71665b L 104,
  // #93887d L 137, #b2a79d L 169, #d1c7bd L 200, #eee7e2 L 232), so moonlit stone has a
  // middle register instead of jumping 49 levels from grey to ivory. The top two bands
  // keep round 5's thresholds (0.67-0.78 and 0.78+), so a field painted at 0.72-0.80 is
  // exactly as bright as before and only the 0.44-0.67 range gains tones.
  stone: { ...M.stone, ramp: ['#03051a', '#25262e', '#71665b', '#93887d', '#b2a79d', '#d1c7bd', '#eee7e2'], thr: [0.13, 0.3, 0.44, 0.56, 0.67, 0.78] },
  // the cliff keeps its own (cooler) tones and gains the same middle register at L 178,
  // with its lower bands unmoved so a face painted at 0.45-0.58 is unchanged
  rock: { ...M.rock, ramp: ['#020414', '#232429', '#6a6157', '#9a9086', '#bbb1a7', '#c9c0b5', '#eee7e2'], thr: [0.12, 0.28, 0.45, 0.58, 0.67, 0.76] },
  floor: null, statue: null,   // filled below from M.floor / M.statue with N.stone's ramp
  cloud: { ...M.cloud, ramp: ['#0d1d72', '#253c92', '#5269ae', '#a2b1d7', '#eef0f6'] },
  sea: { ...M.sea, ramp: ['#01031f', '#040838', '#070f50', '#1d3283', '#d7def2'], extra2: [0.5, 0.45, 0.9, 0.55] },
  // moonlit sand (plate 5's beach): cream-white tops, warm greys, warm near-black
  // strokes (not khaki); tone 0 stays navy-black for night cast shadows (standard 25)
  // the moonlit plain's strokes gather in drifts (its own weathering noise) and open up,
  // so the largest calm field in s07 / s08 reads as plate 5's beach, not as graph paper
  sand: { ...M.sand, ramp: ['#161827', '#5d5a55', '#a39d93', '#d6d0c5', '#f0eadf'],
    noise: { ...M.sand.noise, weather: 1, wScale: 150, wSharp: 2.5, wCover: 0.4 },
    hatch: { ...M.sand.hatch, color: '#2b2924', spacing: 9, dashLen: 14, strength: 0.5, hi: 0.9, weather: 1 } },
  foliage: { ...M.foliage, ramp: ['#020302', '#0d120b', '#182114', '#253220', '#3a4a30'] },
  wood: { ...M.wood, ramp: ['#020205', '#0b0a0a', '#1a1714', '#332e29', '#5d5654', '#948a7e'] },
  metal: { ...M.metal },
  bronze: { ...M.bronze, ramp: ['#020205', '#141210', '#2c2826', '#544a3e', '#8c7e64', '#d6ccb0'] },
  red: { ...M.red, ramp: ['#1a0303', '#4a0d09', '#7f1a13', '#a5241a', '#c7402c'] },
  navyCloth: { ...M.navyCloth },
  linen: { ...M.linen, ramp: ['#1d1f2e', '#57524b', '#8e877f', '#b7b3b0', '#ddd8d0'] },
  skin: { ...M.skin, ramp: ['#1a0d10', '#4a2a28', '#7a4c42', '#a37262', '#c69a86'] },
  mountain: { ...M.mountain, ramp: ['#08155e', '#14257a', '#24398f', '#3d55a6', '#6077bd'], extra2: ['#6276b8'] },
  distant: { ...M.distant, ramp: ['#0a1a6c', '#14287e', '#203a92', '#3a54a8', '#7d92ca'] },
  ink: M.ink,
};
N.floor = { ...M.floor, ramp: N.stone.ramp, thr: N.stone.thr };
N.statue = { ...M.statue, ramp: [...N.stone.ramp.slice(0, 6), '#f3ece7'], thr: N.stone.thr };

// Small helper: derive a material with overrides.
export function mat(base, over = {}) {
  return { ...base, ...over, noise: { ...(base.noise || {}), ...(over.noise || {}) } };
}
