// Seeded randomness and CPU noise used while painting plates.
// Everything a plate draws must come from these so a plate is identical on
// every bake (resize, seek, re-bake after eviction).

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) { this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1; }
  next() { // mulberry32
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss(m = 0, sd = 1) { // Box-Muller
    const u = 1 - this.next(), v = this.next();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  fork(tag) { return new RNG((this.s ^ hashStr(String(tag))) >>> 0); }
}

// 2D gradient noise (Perlin-style) in [-1, 1].
export function makeNoise(seed = 1) {
  const r = new RNG(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r.next() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const g = (ix, iy, dx, dy) => { const h = perm[ix + perm[iy]]; return gx[h] * dx + gy[h] * dy; };
    const u = fade(xf), v = fade(yf);
    const n00 = g(X, Y, xf, yf), n10 = g(X + 1, Y, xf - 1, yf);
    const n01 = g(X, Y + 1, xf, yf - 1), n11 = g(X + 1, Y + 1, xf - 1, yf - 1);
    const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.414;
  }
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
    return s / norm;
  }
  function ridge(x, y, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * (1 - Math.abs(n2(x * f, y * f))); norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  }
  return { n2, fbm, ridge };
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
// Normalised position of v inside [a, b], clamped.
export const span = (v, a, b) => clamp((v - a) / (b - a));
