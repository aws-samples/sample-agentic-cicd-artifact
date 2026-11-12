// Print grain: the mottled, slightly blobby texture that covers every flat
// field in the reference prints. Built once as tiles and laid over the canvas
// with CSS blend modes, so it costs nothing per frame.
//
// One noise field n (0..1, mean 0.5) makes two tiles: its bright half on
// black, laid on with `screen` (#grain-hi), and its dark half on white, laid
// on with `multiply` (#grain-lo). (An `overlay` blend would scale each
// channel's change by that channel's value, which put the grain almost
// entirely into the blue of cobalt and navy fields.) The plates' grain sits
// more in green and blue than in red (flat-sky std about 0.65 : 0.95 : 1 in
// plates 3-5), so each tile is tinted: the screened half lifts red least (on a
// cobalt sky, screen moves the darkest channel, red, the most), the multiplied
// half darkens blue most.
function noise(size, seed, { blob = 150, fine = 60 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // coarse blobs: low-res noise scaled up with smoothing
  const lo = document.createElement('canvas');
  const ls = size / 2;
  lo.width = ls; lo.height = ls;
  const lctx = lo.getContext('2d');
  const id = lctx.createImageData(ls, ls);
  for (let i = 0; i < ls * ls; i++) { const v = 128 + (rnd() - 0.5) * blob; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  lctx.putImageData(id, 0, 0);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  // draw wrapped so the tile stays seamless
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) ctx.drawImage(lo, dx, dy, size, size);
  // fine speckle on top
  const fd = ctx.getImageData(0, 0, size, size);
  const n = new Uint8ClampedArray(size * size);
  for (let i = 0; i < size * size; i++) n[i] = fd.data[i * 4] + (rnd() - 0.5) * fine;
  return { n, c, ctx, fd };
}

// A tile: f(n) per pixel, the same in R, G and B, or per channel (f returns [r, g, b]).
function tile({ c, ctx, fd, n }, f) {
  for (let i = 0; i < n.length; i++) {
    const v = f(n[i]);
    if (typeof v === 'number') fd.data[i * 4] = fd.data[i * 4 + 1] = fd.data[i * 4 + 2] = v;
    else { fd.data[i * 4] = v[0]; fd.data[i * 4 + 1] = v[1]; fd.data[i * 4 + 2] = v[2]; }
    fd.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(fd, 0, 0);
  return c.toDataURL('image/png');
}

// Tints of the two halves, per channel (R, G, B), their common gain, and the
// amplitudes of the coarse blobs and of the fine speckle: measured on flat
// skies (R3-fidelity measure.py's flat_blue_blocks, 1600x900 lab frames) they
// give std (3.2, 4.6, 5.1) by day (s01) and (3.3, 4.8, 4.9) by night (s05),
// lag-1 autocorrelation 0.59 / 0.56, against the plates' (2.9-4.6, 4.3-7.0,
// 5.0-7.9) and .49-.67; round 3's neutral tiles gave (4.5, 4.3, 4.2) and .45-.48.
export const GRAIN = { hi: [0.65, 0.95, 1.0], lo: [0.75, 1.05, 1.15], gain: 1.1, blob: 165, fine: 45 };

// { hi, lo }: data-URL tiles for #grain-hi (screen) and #grain-lo (multiply).
// o overrides GRAIN (tests); o.neutral: round 3's untinted tiles (with
// blob 150, fine 60 they are round 3's grain exactly).
export function grainTiles(size = 256, seed = 7, o = {}) {
  const g = { ...GRAIN, ...o };
  const z = noise(size, seed, g);
  if (o.neutral) return { hi: tile(z, (v) => Math.max(0, v - 128) * 2), lo: tile(z, (v) => 255 - Math.max(0, 128 - v) * 2) };
  const k = (t) => t * g.gain;
  return {
    hi: tile(z, (v) => { const x = Math.max(0, v - 128) * 2; return g.hi.map((t) => Math.min(255, x * k(t))); }),
    lo: tile(z, (v) => { const x = Math.max(0, 128 - v) * 2; return g.lo.map((t) => Math.max(0, 255 - x * k(t))); }),
  };
}

// The old single tile (grey noise for an `overlay` blend). Kept for old pages.
export function grainTile(size = 256, seed = 7) {
  return tile(noise(size, seed), (v) => v);
}
