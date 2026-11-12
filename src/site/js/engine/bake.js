// Plate baking.
//
// A layer's paint(p) function does not draw immediately: it *records* a list
// of commands on the Painter (`p.pass(material, drawGuide)`, `p.ink(draw)`,
// `p.spheres(...)`). The Baker then executes those commands in order, either
// all at once (finish(): first frame, seeks) or in small units inside a frame
// budget (work()) so later shots are prepared while the current one plays.
//
// Background units are kept small so playback never stalls on a bake:
// - a job can be queued lazily (enqueueLazy): its paint() is recorded in a unit;
// - a large pass draws its guide in one unit, then uploads, shades and
//   composites it in horizontal bands, one unit each. The pixels are identical
//   to a single run (the shader works in pass pixels);
// - guide uploads take one of two paths, chosen once (probeUpload): Chromium
//   copies a 2D canvas into a texture on the GPU (0.0-0.2 ms/Mpx), so the
//   'whole' path uploads a pass's guide canvas at once; WebKit reads the canvas
//   back and un-premultiplies it on the CPU (3-5 ms/Mpx, all in that one call),
//   so the 'band' path reads the guide back band by band (getImageData) into
//   one pooled band texture (texSubImage2D), each band in its own unit;
// - a large spheres pass renders and shades band by band;
// - a guide or ink draw written as a generator (function*) is resumed at its
//   yield points, one unit per frame;
// - each unit's cost is predicted (measured history of the same command, else
//   a pixel-area model). work() packs units into the budget; a unit that does
//   not fit waits for a fresh frame, and one that cannot fit any frame waits
//   until its shot is needed soon (opts.T vs job.needAt) or playback is idle.

import { RNG, makeNoise } from './rng.js';
import { M, N } from '../kit/palette.js';

const now = () => performance.now();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Guide colour for light l (0..1) with two aux channels and coverage.
export function L(l, a1 = 0, a2 = 0, alpha = 1) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgba(${c(l)},${c(a1)},${c(a2)},${alpha})`;
}

export class Painter {
  constructor({ region, k, night = false, frame = 0, time = 0, seed = 'plate', shot = null, kind = 'layer', portrait = false }) {
    this.region = region;   // world rect painted {x, y, w, h}
    this.k = k;             // pixels per world unit in the baked canvas
    this.night = night;
    this.portrait = portrait; // baked for a portrait viewport (camPortrait framing); the stage re-bakes on resize
    this.mat = night ? N : M;
    this.frame = frame;
    this.time = time;
    this.shot = shot;
    this.kind = kind;
    this.rng = new RNG(seed);
    this.noise = makeNoise(this.rng.int(1, 1e9));
    this.cmds = [];
    this.L = L;
  }
  // Record a material pass. drawGuide(g, p) paints the guide in world units.
  // opts.bbox (world rect) limits the pass to a sub-rectangle — much cheaper
  // for small elements. opts.time sets the shader clock (sea shimmer).
  // drawGuide may be a generator function (function*): the baker resumes it
  // at each `yield` on a later frame, so very long guide paints do not stall
  // playback. opts.cost (ms) is an optional hint for a known-heavy draw.
  pass(material, drawGuide, opts = {}) { this.cmds.push({ type: 'pass', material, draw: drawGuide, opts }); return this; }
  // Record direct colour drawing (ink lines, flat details) in world units.
  // draw may be a generator function too (see pass).
  ink(draw, opts = {}) { this.cmds.push({ type: 'ink', draw, opts }); return this; }
  // Record a pass built from lit sphere impostors (clouds, smoke, billowing
  // forms). spheres: [{ x, y, r, z (toward viewer, world units), bias }].
  // opts: { light: [lx, ly, lz], ambient, diffuse, baseY, topY, baseDark, flatBase, bbox, time }
  spheres(material, spheres, opts = {}) { this.cmds.push({ type: 'spheres', material, spheres, opts }); return this; }
  // Arbitrary step with access to the target context in pixel space.
  raw(fn) { this.cmds.push({ type: 'raw', fn }); return this; }
  // World units per device pixel: the thinnest line that still shows.
  get px() { return 1 / this.k; }
}

export const MAX_ROWS = 512;   // band height cap (px)
const isGen = (f) => !!f && f.constructor && f.constructor.name === 'GeneratorFunction';
const drain = (it) => { if (it && typeof it.next === 'function') while (!it.next().done); };

// Horizontal bands for an h-row pass, `rows` rows each (even). Interior band
// edges keep the parity of h, so 2x2 derivative quads match a single run.
function bandRows(h, rows) {
  rows = Math.max(2, rows & ~1);
  const out = [];
  for (let e = h; e > 0;) { const s = Math.max(0, e - rows); out.unshift([s, e]); e = s; }
  return out;
}

// Guide pixels the shader reads around a pass pixel: the silhouette rings
// (outline width, world units x k, floor 0.75 px), the crease taps (one world
// unit) and one texel of bilinear filtering, plus a margin. A band must upload
// this many rows above and below itself to shade exactly like a single run.
function padFor(mat, k) {
  const ow = (mat && mat.outline && mat.outline.width) || 0;
  const olPx = ow > 0 ? Math.max(ow * k, Math.min(ow, 0.75)) : 0;
  return Math.ceil(Math.max(olPx, k, 1)) + 3;
}

// How this browser uploads a 2D canvas into a texture: texImage2D(canvas) of
// a fresh 1024x1024 canvas, best of three, in ms per Mpx: `js` is the call
// itself, `whole` includes the GPU (synced with a 1x1 readPixels). WebKit
// reads the canvas back and un-premultiplies it on the CPU inside the call
// (js ~3-5); Chromium only queues a GPU copy (js ~0.0-0.1), so `js` tells the
// engines apart even when a busy GPU inflates `whole`. The probe never reads
// its canvases back before uploading them: in Chromium a canvas that is read
// back turns into a CPU canvas, whose uploads are slow. On the band path it
// also times getImageData + texSubImage2D bands (`band`, ms per Mpx).
const PROBE = 1024;
function probeUpload(ill, wantBand) {
  const gl = ill.gl;
  const res = { js: 0, whole: 0, band: 0 };
  let tex = null;
  const cvs = [];
  try {
    const paint = (seed) => {
      const c = makeCanvas(PROBE, PROBE), g = c.getContext('2d');
      cvs.push(c);
      const rng = new RNG(`upload-probe-${seed}`);
      for (let i = 0; i < 24; i++) {
        g.fillStyle = `rgba(${rng.int(0, 255)},${rng.int(0, 255)},${rng.int(0, 255)},${(0.2 + 0.8 * rng.next()).toFixed(3)})`;
        g.fillRect(rng.next() * PROBE, rng.next() * PROBE, 30 + rng.next() * 500, 30 + rng.next() * 500);
      }
      return c;
    };
    const px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const mpx = (PROBE * PROBE) / 1e6;
    let js = Infinity, whole = Infinity;
    for (let i = 0; i < 3; i++) {
      const c = paint(i);
      sync();
      const t0 = now();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      const t1 = now();
      sync();
      js = Math.min(js, t1 - t0); whole = Math.min(whole, now() - t0);
    }
    res.js = js / mpx; res.whole = whole / mpx;
    if (wantBand(res.js)) {
      // band path: two half-height bands into the (already allocated) texture
      const c = paint(9), g = c.getContext('2d');
      g.getImageData(0, 0, 1, 1);   // its raster is not part of the band cost
      const half = PROBE / 2, t1 = now();
      for (let y = 0; y < PROBE; y += half) {
        const d = g.getImageData(0, y, PROBE, half);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PROBE, half, gl.RGBA, gl.UNSIGNED_BYTE, d.data);
      }
      sync();
      res.band = (now() - t1) / mpx;
    }
  } catch (err) {
    console.warn('[bake] upload probe failed:', err);
  } finally {
    if (tex) gl.deleteTexture(tex);
    for (const c of cvs) { c.width = 0; c.height = 0; }
  }
  return res;
}
// Above this many ms per Mpx inside texImage2D(canvas), use the band path.
const BAND_ABOVE = 1.0;
const RB0 = 0.6;        // fixed ms of a read-back band unit (getImageData, GL calls, composite)
const RB_PX = 0.6e6;    // pixels per read-back band (band path): its readback and upload grow with it
// While readbacks are being held (a slow one just happened, or the measured
// wait is high) a pass's bands are planned at HALF that, so the readback that
// does go long - the first one after a quiet stretch, which nothing holds -
// can only cost about half as much (round 5: 0-3 units per WebKit film at
// 9-15 ms, every one of them a band readback).
const RB_TIGHT = 0.3e6;
const RB_BIG = 0.3e6;   // a readback this large waits while the shot's own frames are heavy
const WAIT_MAX = 30;    // frames a unit too big for any frame may wait (see Baker.work)
const QUIET_MS = 3;     // the biggest unit allowed in a quiet frame (near a cut)
const LATE_S = 3;       // after a late frame, readbacks wait unless their shot is needed within this (s)
// A late frame means WebKit's GPU process is behind, and it stays behind for
// longer than the one frame the `late` flag covers: a readback that waits for
// it then costs its whole backlog (round 5's worst unit: 23 ms for a 0.6 Mpx
// band two frames after two late frames in s04, with rbWait still at 1 ms,
// so nothing held it). Readbacks for shots further than LATE_S away wait this
// many frames after any late frame.
const LATE_FRAMES = 20;
const FAR_S = 3;        // a unit measured over FAR_MS waits until its shot is needed within this (s)
const FAR_MS = 8;
const RBW_HOLD = 4;     // main-thread readbacks wait while getImageData waits this long (ms) for the GPU ...
const RBW_SOON = 1.5;   // ... unless their shot is needed within this (s)
// One readback that waited RBW_BAD ms for the GPU process means the process is
// busy drawing this shot: hold the non-urgent ones for RBW_FRAMES frames
// (rbWait is an EMA and decays within ~20 frames, which let a burst of 11-18 ms
// readbacks through one at a time)
const RBW_BAD = 6, RBW_FRAMES = 40;
// The standby worker takes the readbacks over only while the main thread keeps
// waiting for WebKit's GPU process: rbHot counts the waiting (a readback that
// waited RBW_BAD ms counts RB_HOT_BAD, a frame whose EMA is over RBW_HOLD
// counts 1, and a frame with a quick readback counts -1), and at RB_HOT the
// worker takes over; it hands back after RB_COOL quiet frames. Round 5's rule
// reset rbHot to 0 on the first good frame, so a burst of slow readbacks could
// never reach RB_HOT and the worker never engaged in a whole film; three slow
// readbacks inside ~30 readback frames now switch it. (Round 4 made the worker
// the default; measured over whole films it queues more GPU work than it
// saves, so the main-thread band path is the default and the worker is the
// safety valve for a GPU process that keeps the main thread waiting.)
const RB_HOT = 30, RB_COOL = 120, RBW_COOL = 2, RB_HOT_BAD = 10;
const WORK_BUSY = 4;    // ms of JS per frame above which a shot counts as heavy (work's opts.work)
// Device pixels of plates a shot composites per frame above which it counts as
// heavy even though its own JS is cheap (s10 draws two full-frame plates plus
// Zeus: 1-2 ms of JS, but its GPU process is busy for most of the frame, and
// round 5 lost 13 frames inside s10's window to s11/s12 band readbacks).
// Measured per shot (framepx.mjs, 1440x900@2, canvas 5.2 Mpx): p50 7.4-19.4
// Mpx, p90 14.8-19.5 in s01, s03, s04, s05, s08, s09, s10 and s11, so this
// catches the heavier half of the film while it is at its heaviest.
const GPU_BUSY = 14e6;
// While a shot is heavy, a LARGE readback for a shot further away than this
// (s) waits: the next shot still bakes on its deadline, the shot two ahead
// does not steal a frame from the shot on screen.
const RB_FAR = 2.5;
const AHEAD = 1;        // worker readback: guides a job may have drawn ahead of its compositing
const GEN_PX = 0.15;    // GPU pixels a generator guide chunk draws, as a share of its pass (pacing)
const HELD_MAX = 16e6;  // guide pixels the worker path may hold for passes drawn ahead (memory)
const SKIP_MAX = 6;     // entries waiting for the worker that one frame steps over

// The readback worker (band path, readback 'worker'): it draws each guide
// ImageBitmap into an OffscreenCanvas of its own and reads the pixels back
// there, so the wait for WebKit's GPU process (1-3 ms when it is idle, 5-30 ms
// while it draws a heavy frame) falls on the worker, not on the main thread.
// The bytes are exactly those of a main-thread getImageData of the guide.
const WORKER_SRC = `
let cv = null, g = null;
onmessage = (ev) => {
  const { id, bm } = ev.data;
  try {
    if (!cv) { cv = new OffscreenCanvas(bm.width, bm.height); g = cv.getContext('2d'); }
    else if (cv.width !== bm.width || cv.height !== bm.height) { cv.width = bm.width; cv.height = bm.height; }
    else g.clearRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(bm, 0, 0);
    bm.close();
    const d = g.getImageData(0, 0, cv.width, cv.height);
    postMessage({ id, buf: d.data.buffer }, [d.data.buffer]);
  } catch (err) { postMessage({ id, err: String((err && err.message) || err) }); }
};`;

export class Baker {
  // opts.upload: 'whole' | 'band' | 'worker' forces a guide upload path
  // (tools, A/B tests; 'band' = round 3's main-thread readback, 'worker' = the
  // band path with its readbacks in a worker); by default it is probed, and
  // the band path reads back in a worker when one starts.
  constructor(illustrator, opts = {}) {
    this.ill = illustrator;
    this.guide = makeCanvas(2, 2);
    this.gctx = this.guide.getContext('2d');
    this.queue = [];      // pending jobs (and lazy entries, tasks), soonest needed first
    this.stats = { passes: 0, ms: 0 };
    this.mode = 'fg';     // 'fg': whole commands (finish); 'bg': small units (work)
    this.hist = new Map();            // measured unit costs: key -> ms (bands: ms per Mpx)
    this.bandPx = 1.2e6;  // target pixels per band (shading only; read-back bands: RB_PX)
    this.log = [];        // slow units (> 8 ms): 'ms tag cmd part' (and 'ms tag rec' for records)
    this.seq = 0;
    // guide upload path and the per-Mpx cost model measured for it
    const want = ['band', 'whole', 'worker'].includes(opts.upload) ? opts.upload : null;
    const probe = illustrator.gl ? probeUpload(illustrator, (js) => want ? want !== 'whole' : js > BAND_ABOVE) : { js: 0, whole: 0, band: 0 };
    this.probe = { js: +probe.js.toFixed(2), whole: +probe.whole.toFixed(2), band: +probe.band.toFixed(2) };
    this.upload = want === 'worker' ? 'band' : want || (probe.js > BAND_ABOVE ? 'band' : 'whole');
    const banded = this.upload === 'band';
    // area model, ms per Mpx: guide = guide unit (draw, plus the whole upload
    // on the whole path; learned), up = a whole-canvas upload, band = shading
    // + composite of a band (never below 0.8), rb = a band read back on the
    // main thread (its getImageData + texSubImage2D + shading + composite;
    // RB0 ms + rbWait + rb x Mpx, learned from large bands only: WebKit's clock
    // has 1 ms steps, so a small band says little about its cost per Mpx), wb =
    // a band whose pixels the worker returned (upload + shading + composite),
    // job = a whole layer job per Mpx of its canvas (the deadline estimate)
    const up = Math.min(12, probe.js || 0.2);   // JS time of a whole upload (the GPU's share is paced by maxPx)
    this.rate = {
      up, guide: 0.5 + (banded ? 0 : up), band: 1.2,
      rb: Math.min(6, Math.max(1.5, probe.band || 2.5)), wb: 2, job: banded ? 10 : 4,
    };
    this.rbWait = 0;      // main-thread readback: EMA of getImageData's wait beyond its own CPU share (ms)
    this.rbSeen = false;
    this.rbHold = 0;      // frames left in which non-urgent readbacks wait (a bad readback sets it)
    this.lateHold = 0;    // ... and in which readbacks for far shots wait (a late frame sets it)
    this.rbFrames = opts.rbHold === undefined ? RBW_FRAMES : Math.max(0, opts.rbHold);   // A/B: ?rbhold=N
    this.waited = 0;      // consecutive frames the queue head waited for a fresh frame (see work)
    this.tokens = 0;      // GPU pixels the background may still draw (work's pxRate bucket)
    this.btex = null; this.bsize = [0, 0];   // the pooled band texture (band path)
    // band path: end each background guide unit with a 1x1 readback, so the
    // guide's raster is waited for there and not in its first band
    this.flush = opts.flush ?? false;
    // band path: where guides are read back. 'main' (getImageData here) is the
    // default; the worker is started as a STANDBY and work() switches to
    // 'worker' only while the main thread keeps waiting for the GPU process
    // (see RB_HOT). opts.upload 'worker' forces it from the start.
    this.readback = 'main';
    this.workerOK = false;        // the worker answered the test guide exactly
    this.workerForced = want === 'worker';
    this.rbHot = 0; this.rbCool = 0;
    this.worker = null;
    this.inflight = new Map();   // readback id -> prepared pass (or the test)
    this.rid = 0;
    this.heldPx = 0;             // guide pixels held by prepared passes (canvases, then bytes) until their bands end
    if (banded && want !== 'band') this.startWorker();
    this.readbackLog = [];        // [T or frame, mode] when the readback path switched (tools)
  }

  // ---- the readback worker
  startWorker() {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined' || typeof Blob === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
    let w;
    try { w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); } catch { return; }
    this.worker = w;
    w.onmessage = (ev) => this.landed(ev.data);
    w.onerror = (ev) => this.stopWorker(`worker error ${ev && ev.message}`);
    // a test guide at partial and near-zero alpha: the worker path starts once
    // its bytes come back exact (an engine whose bitmaps re-premultiply loses
    // the colour of faint pixels and keeps the main-thread readback)
    const c = makeCanvas(64, 24), g = c.getContext('2d');
    const A = [0.5, 0.8, 0.02, 0.05, 0.007, 0.3, 0.12, 1];
    A.forEach((a, i) => { g.fillStyle = `rgba(${(37 * i + 200) % 256},${(91 * i + 61) % 256},${(53 * i + 113) % 256},${a})`; g.fillRect(i * 8, 0, 8, 8); });
    const gr = g.createLinearGradient(0, 8, 64, 24);
    gr.addColorStop(0, 'rgba(230,40,10,0.9)'); gr.addColorStop(1, 'rgba(60,200,250,0.004)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 16, 30.3, 7.7, 0.2, 0, Math.PI * 2); g.fill();
    const ref = g.getImageData(0, 0, 64, 24).data;
    const id = ++this.rid;
    this.inflight.set(id, { test: ref });
    createImageBitmap(c).then((bm) => w.postMessage({ id, bm }, [bm])).catch(() => this.stopWorker('createImageBitmap failed'));
  }

  stopWorker(why) {
    if (why) console.warn('[bake] readback worker off:', why);
    this.readback = 'main';
    this.workerOK = false;
    if (this.worker) { try { this.worker.terminate(); } catch { /* gone */ } }
    this.worker = null;
    // passes waiting for the worker read their guide back here instead
    for (const pre of this.inflight.values()) if (!pre.test) pre.pend = false;
    this.inflight.clear();
  }

  landed(m) {
    const pre = this.inflight.get(m.id);
    if (!pre) return;   // cancelled, or finished synchronously meanwhile
    this.inflight.delete(m.id);
    if (pre.test) {
      const got = m.buf ? new Uint8Array(m.buf) : null;
      const ok = got && got.length === pre.test.length && pre.test.every((v, i) => v === got[i]);
      if (!ok) { this.stopWorker(m.err || 'test guide mismatch'); return; }
      this.workerOK = true;
      if (this.workerForced) this.readback = 'worker';   // ?upload=worker
      return;
    }
    if (m.err || !m.buf) { pre.pend = false; this.stopWorker(m.err || 'no pixels'); return; }   // its bands read gc back here
    pre.pixels = new Uint8Array(m.buf);
    pre.pend = false;
    if (pre.gc) { pre.gc.width = 0; pre.gc.height = 0; pre.gc = null; }
  }

  // Hand a pass's finished guide canvas to the worker.
  handoff(pre) {
    const w = this.worker;
    if (!w) return;
    const id = ++this.rid;
    pre.id = id; pre.pend = true; pre.t0 = now();
    this.inflight.set(id, pre);
    createImageBitmap(pre.gc).then(
      (bm) => { if (this.inflight.get(id) === pre && this.worker === w) w.postMessage({ id, bm }, [bm]); else bm.close(); },
      () => { if (this.inflight.get(id) === pre) { this.inflight.delete(id); pre.pend = false; } });
  }

  // Allocate the band texture for passes up to w px wide (band path only), so
  // background units never pay its allocation: WebKit allocates a texture on
  // first touch (~1.3 ms per Mpx). It only grows.
  // Also allocate the sphere framebuffer (colour texture + DEPTH_COMPONENT24)
  // for the whole film, through the Illustrator's own render path: it renders
  // at 2x and only grows, so without this it grew twice per film INSIDE
  // background bake units (s03/sky#0 and s10/zeus#0's first unit, about 7 ms
  // of GPU-process time and the late frame at 36.52). A sphere pass is at
  // most as wide as the widest layer and at most MAX_ROWS + pads tall, both
  // doubled. spheres: false skips it (?fbo=0).
  reserve(w, spheres = true) {
    if (this.upload === 'band') this.bandTex(Math.min(this.ill.maxSize, w), MAX_ROWS + 2 * 24);
    if (!spheres || !this.ill.gl || !this.ill.renderSpheres) return;
    // renderSpheres renders at 2x, so halve the width and pass the band's full
    // height: the framebuffer lands at min(maxSize, w + 256) x min(maxSize, 1280).
    // The 256 px of slack (one allocation step, ~2.6 MB) cover a sphere pass a
    // little wider than half the widest layer: s10's Zeus strip on a phone is
    // 958 px (1916 at 2x) against 1792 for a 390x844@2 film, and it grew the
    // framebuffer inside a bake unit during s08.
    const half = Math.max(2, Math.ceil(Math.min(this.ill.maxSize, w) / 2) + 128);
    const rows = MAX_ROWS + 2 * 64;
    try {
      // count 0: this allocates the framebuffer and clears it, and draws nothing
      this.ill.renderSpheres(new Float32Array(0), 0, half, rows, {});
      this.ill.drawSpheres([0, 0], 1, {});
    } catch (err) { console.warn('[bake] sphere framebuffer reserve failed:', err); }
  }

  bandTex(w, h) {
    const gl = this.ill.gl;
    if (!this.btex || this.bsize[0] < w || this.bsize[1] < h) {
      const up = (v, have) => Math.min(this.ill.maxSize, Math.max(have, Math.ceil(v / 256) * 256));
      const W = up(w, this.bsize[0]), H = Math.min(this.ill.maxSize, Math.max(this.bsize[1], h));
      if (this.btex) gl.deleteTexture(this.btex);
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(W * 4));   // touch it now (allocates it)
      this.btex = tex; this.bsize = [W, H];
    }
    return this.btex;
  }

  // Create a job that bakes paint(p) into a new canvas covering `region`.
  // needAt (global seconds) is when its shot must be ready; the queue runs
  // the soonest first (priority is the fallback order). With crop, a layer
  // whose every command declares its extent (pass bbox, sphere extents,
  // ink opts.bbox) is baked only over that area: p.region shrinks to it.
  job({ paint, region, k, night, frame = 0, time = 0, seed, shot, kind = 'layer', onDone, priority = 1, tag = '', needAt, crop = false, portrait = false }) {
    const maxS = this.ill.maxSize;
    const w = Math.min(maxS, Math.max(1, Math.ceil(region.w * k)));
    const h = Math.min(maxS, Math.max(1, Math.ceil(region.h * k)));
    const kx = w / region.w, ky = h / region.h;
    const kk = Math.min(kx, ky);
    let canvas = makeCanvas(w, h);
    let ctx = canvas.getContext('2d');
    const p = new Painter({ region, k: kk, night, frame, time, seed: seed ?? tag, shot, kind, portrait });
    p.canvas = canvas; p.ctx = ctx;
    paint(p);
    const c = crop ? this.cropRect(p, w, h, kx, ky) : null;
    if (c) {
      canvas.width = 0; canvas.height = 0;
      canvas = makeCanvas(c.pw, c.ph); ctx = canvas.getContext('2d');
      p.region = c.region; p.canvas = canvas; p.ctx = ctx;
    }
    // region: where to show the canvas (the uncropped bake maps w px to region.w)
    const job = { p, canvas, ctx, region: c ? c.disp : region, i: 0, sub: null, pipe: null, ms: 0, onDone, priority, needAt, tag, done: false, cancelled: false, seq: this.seq++ };
    // every command declares an extent and none of them reaches this framing
    // (s03's onlookers and s11's shore band on a phone): the layer paints
    // nothing here, so it is a 1x1 canvas and its commands are skipped
    if (c && c.empty) job.empty = true;
    return job;
  }

  // The part of a w x h layer canvas its commands can paint, when every
  // command says (null otherwise, or when it would save under 15%). When
  // every command says and none of them reaches the canvas, the crop is EMPTY
  // ({ empty: true }, a 1x1 canvas): "no extent declared" (null, the whole
  // canvas) and "declared, but off this framing" are not the same thing.
  cropRect(p, w, h, kx, ky) {
    const r = p.region, k = p.k;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (b) => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); };
    for (const c of p.cmds) {
      if ((c.type === 'pass' || c.type === 'ink') && c.opts && c.opts.bbox) add(c.opts.bbox);
      else if (c.type === 'spheres') { for (const b of c.spheres) add({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }); }
      else return null;
    }
    const empty = () => ({ empty: true, pw: 1, ph: 1, region: { x: r.x, y: r.y, w: 1 / k, h: 1 / k }, disp: { x: r.x, y: r.y, w: 1 / kx, h: 1 / ky } });
    if (!p.cmds.length) return empty();          // a layer that records nothing in this framing
    if (!(x1 > x0 && y1 > y0)) return null;      // degenerate extents: keep the whole canvas (as before)
    const pad = 10;   // covers the pass and sphere pixel pads and the outline kernels
    const px0 = Math.max(0, Math.floor((x0 - r.x) * k) - pad), py0 = Math.max(0, Math.floor((y0 - r.y) * k) - pad);
    const px1 = Math.min(w, Math.ceil((x1 - r.x) * k) + pad), py1 = Math.min(h, Math.ceil((y1 - r.y) * k) + pad);
    const pw = px1 - px0, ph = py1 - py0;
    if (pw <= 0 || ph <= 0) return empty();   // declared, but none of it reaches this framing
    if (pw * ph > 0.85 * w * h) return null;
    // paint in the same pixels as the full canvas (integer shift), and show
    // the crop exactly where those pixels of the full canvas would be shown
    return { pw, ph, region: { x: r.x + px0 / k, y: r.y + py0 / k, w: pw / k, h: ph / k },
      disp: { x: r.x + px0 / kx, y: r.y + py0 / ky, w: pw / kx, h: ph / ky } };
  }

  // Queue a job whose paint() is recorded later, in a background unit (or by
  // finishEntry). make() must return the job (normally via this.job()).
  // (p and canvas pass through to the job once it is recorded, for tools.)
  // estPx: the pixels its canvas will have at most (the deadline estimate).
  lazy(make, { tag = '', needAt, priority = 1, estPx } = {}) {
    return {
      lazy: true, make, job: null, tag, needAt, priority, estPx, done: false, cancelled: false, seq: this.seq++,
      get p() { return this.job ? this.job.p : null; }, get canvas() { return this.job ? this.job.canvas : null; },
    };
  }

  // A one-unit task (the stage's pre-roll: touch a finished plate, warm an
  // actor's caches): fn() runs in a background unit, or at once in
  // finishEntry. cost: its predicted ms until it has been measured.
  task(fn, { tag = '', needAt, priority = 1, cost = 1 } = {}) {
    return { task: fn, tag, needAt, priority, cost, done: false, cancelled: false, seq: this.seq++ };
  }

  // Record a readback-path switch for the tools (troy.bakeLog shows them too).
  noteReadback(T) {
    const at = T === undefined ? '' : `T${T.toFixed(2)} `;
    this.readbackLog.push(`${at}readback -> ${this.readback}`);
    if (this.log.length < 300) this.log.push(`0.0ms engine ${at}readback -> ${this.readback}`);
  }

  order(a, b) { return ((a.needAt ?? a.priority) - (b.needAt ?? b.priority)) || (a.seq - b.seq); }
  enqueue(job) { this.queue.push(job); this.queue.sort((a, b) => this.order(a, b)); return job; }
  enqueueLazy(entry) { return this.enqueue(entry); }

  cancel(pred) {
    for (const j of this.queue) {
      if (!pred(j)) continue;
      j.cancelled = true;
      const job = j.lazy ? j.job : j.task ? null : j;
      if (job) { this.dropAll(job); if (!job.done && job.canvas) { job.canvas.width = 0; job.canvas.height = 0; } }
    }
    this.queue = this.queue.filter((j) => !j.cancelled);
  }

  // Estimated ms of background work left in the queued entries pred() picks
  // (the stage's deadline rule): a recorded job by the share of its commands
  // left, an unrecorded one from its canvas size (rate.job ms per Mpx).
  pending(pred) {
    let ms = 0;
    for (const e of this.queue) {
      if (e.cancelled || e.done || !pred(e)) continue;
      if (e.task) { ms += this.hist.get(`task|${e.tag}`) ?? e.cost; continue; }
      const job = e.lazy ? e.job : e;
      if (!job) { ms += (this.hist.get(`rec|${e.tag}`) ?? 1.5) + ((e.estPx ?? 2e6) / 1e6) * this.rate.job; continue; }
      const n = Math.max(1, job.p.cmds.length);
      ms += ((job.canvas.width * job.canvas.height) / 1e6) * this.rate.job * Math.max(0.05, 1 - job.i / n);
    }
    return ms;
  }

  // Learn the per-Mpx cost of whole jobs (pending()'s model).
  jobDone(job) {
    const mpx = (job.canvas.width * job.canvas.height) / 1e6;
    if (mpx > 0.3 && job.ms > 0 && job.canvas.width) this.rate.job = Math.min(40, Math.max(0.5, this.rate.job * 0.8 + (0.2 * job.ms) / mpx));
  }

  // A lazy entry's job, recorded now if needed.
  made(entry) {
    if (!entry.lazy) return entry;
    if (!entry.job) {
      const t0 = now();
      entry.job = entry.make();
      entry.job.needAt ??= entry.needAt;
      const ms = now() - t0;
      entry.job.ms = (entry.job.ms || 0) + ms;
      this.learn(`rec|${entry.tag}`, ms);
      // a record runs the layer's paint(p) (JS layout) and allocates its canvas
      if (ms > 8 && this.log.length < 300) this.log.push(`${ms.toFixed(1)}ms ${entry.tag} rec${this.mode === 'bg' ? '' : ' (fg)'}`);
    }
    return entry.job;
  }

  // Release the command in progress (job.sub): its whole-guide texture and
  // its own guide canvas.
  dropSub(job) {
    const s = job.sub;
    if (!s) return;
    if (s.tex) this.ill.release(s.tex);
    if (s.gc && !s.shared) { s.gc.width = 0; s.gc.height = 0; }
    if (s.id) this.inflight.delete(s.id);
    if (s.held) { this.heldPx -= s.held; s.held = 0; }
    s.pixels = null;
    job.sub = null;
  }

  // ... and every pass prepared ahead of it (a cancelled or failed job).
  dropAll(job) {
    this.dropSub(job);
    if (job.pipe) {
      for (const pre of job.pipe.values()) {
        if (pre.id) this.inflight.delete(pre.id);
        if (pre.gc) { pre.gc.width = 0; pre.gc.height = 0; }
        if (pre.held) { this.heldPx -= pre.held; pre.held = 0; }
      }
      job.pipe = null;
    }
  }

  learn(key, ms) {
    const old = this.hist.get(key);
    this.hist.set(key, old === undefined ? ms : old * 0.5 + ms * 0.5);
  }

  // Pixel rect of a pass on the job canvas (null when it is empty).
  passRect(job, cmd) {
    const r = job.p.region, k = job.p.k;
    let bx = 0, by = 0, bw = job.canvas.width, bh = job.canvas.height;
    if (cmd.opts.bbox) {
      const b = cmd.opts.bbox;
      bx = Math.max(0, Math.floor((b.x - r.x) * k) - 4);
      by = Math.max(0, Math.floor((b.y - r.y) * k) - 4);
      const ex = Math.min(job.canvas.width, Math.ceil((b.x + b.w - r.x) * k) + 4);
      const ey = Math.min(job.canvas.height, Math.ceil((b.y + b.h - r.y) * k) + 4);
      bw = ex - bx; bh = ey - by;
      if (bw <= 0 || bh <= 0) return null;
    }
    return { bx, by, bw, bh, ox: r.x + bx / k, oy: r.y + by / k };
  }

  sphereRect(job, cmd) {
    const r = job.p.region, k = job.p.k, sp = cmd.spheres;
    if (!sp.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of sp) { x0 = Math.min(x0, b.x - b.r); y0 = Math.min(y0, b.y - b.r); x1 = Math.max(x1, b.x + b.r); y1 = Math.max(y1, b.y + b.r); }
    const pad = 4;
    const bx = Math.max(0, Math.floor((x0 - r.x) * k) - pad), by = Math.max(0, Math.floor((y0 - r.y) * k) - pad);
    const ex = Math.min(job.canvas.width, Math.ceil((x1 - r.x) * k) + pad), ey = Math.min(job.canvas.height, Math.ceil((y1 - r.y) * k) + pad);
    const bw = ex - bx, bh = ey - by;
    if (bw <= 0 || bh <= 0) return null;
    return { bx, by, bw, bh, ox: r.x + bx / k, oy: r.y + by / k };
  }

  // Worker readback is on for background passes now.
  get viaWorker() { return this.mode === 'bg' && this.upload === 'band' && this.readback === 'worker'; }

  // The next unit of a job (plan() and step() agree on it):
  //   'sub'  continue the command in progress (job.sub)
  //   'cmd'  start cmds[job.i]
  //   'prep' draw the guide of pass ci into a canvas of its own (a generator:
  //          one chunk) and hand it to the worker: cmds[job.i] itself, or a
  //          later pass prepared while cmds[job.i] waits for its pixels
  //   'land' cmds[job.i] is a prepared pass whose pixels are back (or that
  //          reads its guide back here): its bands
  //   'wait' nothing can run until a readback lands; 'end' the job is done
  next(job) {
    if (job.empty) return { act: 'end' };   // an empty crop (see cropRect): nothing of it reaches this framing
    if (job.sub) return { act: 'sub' };
    const cmds = job.p.cmds;
    if (job.i >= cmds.length) return { act: 'end' };
    const pre = job.pipe && job.pipe.get(job.i);
    if (!pre) {
      const cmd = cmds[job.i];
      if (this.viaWorker && cmd.type === 'pass' && this.passRect(job, cmd)) return { act: 'prep', ci: job.i, pre: null };
      return { act: 'cmd' };
    }
    if (pre.kind === 'gen') return { act: 'prep', ci: job.i, pre };
    // a readback the worker has not answered in 3 s is read back here instead
    if (pre.pend && now() - pre.t0 > 3000) { this.inflight.delete(pre.id); pre.pend = false; }
    if (!pre.pend) return { act: 'land', pre };
    if (this.mode !== 'bg') return { act: 'land', pre };   // a synchronous bake reads it back here (finish())
    const ci = this.aheadIndex(job);
    if (ci >= 0) return { act: 'prep', ci, pre: job.pipe.get(ci) || null };
    return { act: 'wait' };
  }

  // A later pass to prepare while cmds[job.i] waits for its readback, or -1.
  aheadIndex(job) {
    if (!this.viaWorker) return -1;
    let open = 0;
    for (const [ci, pre] of job.pipe) {
      if (ci > job.i && pre.kind === 'gen') return ci;   // finish a guide already started
      if (pre.pend) open++;
    }
    if (open >= AHEAD || this.heldPx > HELD_MAX) return -1;
    const cmds = job.p.cmds;
    for (let ci = job.i + 1; ci < cmds.length && ci <= job.i + 24; ci++) {
      if (cmds[ci].type === 'pass' && !job.pipe.has(ci) && this.passRect(job, cmds[ci])) return ci;
    }
    return -1;
  }

  // The bands of a pass whose guide is in a canvas of its own (gc), read
  // back RB_PX at a time.
  bandsOf(job, cmd, R, gc) {
    return { kind: 'bands', cmd, R, bw: R.bw, rows: bandRows(R.bh, this.rowsFor(R.bw, true)), next: 0, gc, pad: padFor(cmd.material, job.p.k) };
  }

  // What the next unit of `entry` is and what it is predicted to cost (ms).
  // blocked: it waits for a worker readback (other entries may run).
  plan(entry) {
    if (entry.task) { const h = this.hist.get(`task|${entry.tag}`); return { part: 'task', ms: h ?? entry.cost, known: h !== undefined, hinted: true, px: 0 }; }
    if (entry.lazy && !entry.job) { const h = this.hist.get(`rec|${entry.tag}`); return { part: 'rec', ms: h ?? 1.5, known: h !== undefined, px: 0 }; }
    const job = entry.lazy ? entry.job : entry;
    const nx = this.next(job);
    const key = (ci, part) => `${job.tag}|${ci}|${part}`;
    if (nx.act === 'end') return { part: 'end', ms: 0, known: true };
    if (nx.act === 'wait') return { part: 'wait', ms: 0, known: true, blocked: true };
    if (nx.act === 'prep') {
      const cmd = job.p.cmds[nx.ci], hint = cmd.opts && cmd.opts.cost;
      if (nx.pre || isGen(cmd.draw)) {
        const h = this.hist.get(key(nx.ci, 'gen')), R = nx.pre ? nx.pre.R : this.passRect(job, cmd);
        return { part: 'gen', ms: h ?? hint ?? 2, known: h !== undefined, hinted: h === undefined && hint !== undefined, px: R ? R.bw * R.bh * GEN_PX : 0 };
      }
      const R = this.passRect(job, cmd), px = R.bw * R.bh;
      const h = this.hist.get(key(nx.ci, 'guide'));
      return { part: 'guide', ms: h ?? hint ?? 0.9 + this.rate.guide * px / 1e6, known: h !== undefined, hinted: h === undefined && hint !== undefined, px: px * 0.5 };
    }
    if (nx.act === 'land') return this.bandPlan(job, nx.pre);
    const s = job.sub;
    if (s) {
      if (s.kind === 'gen') { const h = this.hist.get(key(job.i, 'gen')); return { part: 'gen', ms: h ?? 2, known: h !== undefined, px: s.R ? s.R.bw * s.R.bh * GEN_PX : 0 }; }
      if (s.kind === 'up') { const px = s.R.bw * s.R.bh; return { part: 'up', ms: 0.3 + this.rate.up * px / 1e6, known: true, px }; }
      return this.bandPlan(job, s);
    }
    const cmd = job.p.cmds[job.i];
    const hint = cmd.opts && cmd.opts.cost;
    if (cmd.type === 'ink' || cmd.type === 'raw') {
      const part = isGen(cmd.draw) ? 'gen' : 'ink';
      const h = this.hist.get(key(job.i, part));
      return { part, ms: h ?? hint ?? 1, known: h !== undefined };
    }
    const R = cmd.type === 'pass' ? this.passRect(job, cmd) : this.sphereRect(job, cmd);
    if (!R) return { part: 'skip', ms: 0, known: true };
    const px = R.bw * R.bh;
    const banded = this.upload === 'band';
    const rows = this.rowsFor(R.bw, banded);
    const got = (part, model, gpx) => { const h = this.hist.get(key(job.i, part)); return { part, ms: h ?? hint ?? model, known: h !== undefined, hinted: h === undefined && hint !== undefined, px: gpx }; };
    if (cmd.type === 'pass') {
      if (isGen(cmd.draw)) return got('gen', 2, px * GEN_PX);
      // rate.guide holds the whole upload on the whole path. On the band path
      // every pass draws its guide in a unit of its own and reads it back in
      // later ones, however short it is (one unit did the draw, the readback,
      // the shading and the composite: 11-17 ms for s02/far#0 cmd2).
      if (!banded && R.bh <= rows) return got('all', 0.8 + (this.rate.guide + this.rate.band) * px / 1e6, px * 1.5);
      return got('guide', 0.6 + this.rate.guide * px / 1e6, px * 0.5);
    }
    // spheres (rendered at 2x before shading; bands half as tall)
    const srows = this.rowsFor(R.bw * 2);
    const ow = (cmd.material.outline && cmd.material.outline.width) || 0;
    const spad = Math.max(Math.ceil(ow) + 4, padFor(cmd.material, job.p.k));
    if (R.bh <= srows) {
      const g = this.growPx(R, 0, R.bh, spad);
      const o = got('all', 0.8 + 2 * this.rate.band * px / 1e6, this.sphereGpu(job, cmd, R, 0, R.bh) + g);
      return g ? { ...o, ms: o.ms + 7, known: false, grow: true } : o;
    }
    const h = this.hist.get(key(job.i, 'band'));
    const g = this.growPx(R, 0, srows, spad);
    return { part: 'band', ms: (0.3 + Math.max(0.8, h ?? 0, this.rate.band) * srows * R.bw / 1e6) * 2 + (g ? 7 : 0), known: !g, grow: !!g,
      px: this.sphereGpu(job, cmd, R, 0, srows) + g };
  }

  bandPlan(job, s) {
    const [y0, y1] = s.rows[s.next], px = (y1 - y0) * s.bw;
    if (s.data) {
      const h = this.hist.get(`${job.tag}|${job.i}|band`);
      const g = this.growPx(s.R, y0, y1, s.pad || 4);
      return { part: 'band', ms: (0.3 + Math.max(0.8, h ?? 0, this.rate.band) * px / 1e6) * 2 + (g ? 7 : 0), known: !g, grow: !!g,
        px: (s.gpu ? s.gpu[s.next] : px * 5) + g };
    }
    if (s.pixels) return { part: 'band', ms: 0.3 + Math.max(0.8, this.rate.wb) * px / 1e6, known: true, px };
    if (s.gc) return { part: 'band', ms: RB0 + this.rbWait + this.rate.rb * px / 1e6, known: true, px, readback: true };
    const h = this.hist.get(`${job.tag}|${job.i}|band`);
    return { part: 'band', ms: 0.3 + Math.max(0.8, h ?? 0, this.rate.band) * px / 1e6, known: true, px };
  }

  // Pixels a spheres unit would REALLOCATE: the sphere framebuffer (colour
  // texture plus its depth renderbuffer) only grows, and growing it inside a
  // bake unit costs about 7 ms of GPU-process time (s10/zeus#0's first unit).
  // Stage.reserve() allocates it for the whole film, so this is only a
  // fallback - but when it does happen the unit must not share a frame.
  growPx(R, y0, y1, pad) {
    const ill = this.ill, fs = ill.fsize;
    if (!fs) return 0;
    const W = Math.min(ill.maxSize, R.bw * 2);
    const H = Math.min(ill.maxSize, Math.max(1, Math.round((Math.min(R.bh, y1 + pad) - Math.max(0, y0 - pad)) * 2)));
    if (fs[0] >= W && fs[1] >= H) return 0;
    return 2 * Math.max(fs[0], W) * Math.max(fs[1], H);
  }

  // GPU pixels a spheres band renders (pacing, maxPx): the sphere area inside
  // rows y0..y1 at 2x, not the band's own area (billows overdraw).
  sphereGpu(job, cmd, R, y0, y1) {
    const k = job.p.k;
    let a = 0;
    for (const b of cmd.spheres) {
      const cy = (b.y - R.oy) * k, r = b.r * k;
      const t = Math.min(y1, cy + r) - Math.max(y0, cy - r);
      if (t > 0) a += Math.PI * r * r * Math.min(1, t / (2 * r));
    }
    return Math.max((y1 - y0) * R.bw, a) * 4;
  }

  // Execute one unit of a job (a whole command in 'fg' mode). Returns true
  // when the job is complete.
  step(job) {
    const { p, ctx } = job;
    const nx = this.next(job);
    if (nx.act === 'end') return true;
    if (nx.act === 'wait') return false;
    const t0 = now();
    const bg = this.mode === 'bg';
    let ci = job.i;
    let part = 'all', px = 0, bandRate = null;
    if (nx.act === 'prep') { ci = nx.ci; const o = this.prep(job, nx.ci, nx.pre); part = o.part; px = o.px; }
    else if (nx.act === 'land') {
      const s = nx.pre;
      if (s.id) this.inflight.delete(s.id);   // a synchronous bake does not wait for the worker
      s.pend = false;
      job.pipe.delete(job.i);
      job.sub = s;
      part = 'band'; bandRate = s.pixels ? 'wb' : 'rb';
      px = this.resume(job, bg);
    } else if (job.sub) {
      const s = job.sub;
      part = s.kind === 'gen' ? 'gen' : s.kind === 'up' ? 'up' : 'band';
      if (part === 'band' && !s.data) bandRate = s.pixels ? 'wb' : s.gc ? 'rb' : 'band';
      px = this.resume(job, bg);
    } else {
      const cmd = p.cmds[job.i];
      if (cmd.type === 'pass') { const o = this.pass(job, cmd, bg); part = o.part; px = o.px; }
      else if (cmd.type === 'spheres') { const o = this.spheresCmd(job, cmd, bg); part = o.part; px = o.px; }
      else if (cmd.type === 'ink') {
        if (isGen(cmd.draw) && bg) {
          ctx.save();
          ctx.setTransform(p.k, 0, 0, p.k, -p.region.x * p.k, -p.region.y * p.k);
          const it = cmd.draw(ctx, p);
          job.sub = { kind: 'gen', it, ink: true, cmd };
          part = 'gen';
          this.resume(job, bg);
        } else {
          ctx.save();
          ctx.setTransform(p.k, 0, 0, p.k, -p.region.x * p.k, -p.region.y * p.k);
          drain(cmd.draw(ctx, p));
          ctx.restore();
          job.i++; part = isGen(cmd.draw) ? 'gen' : 'ink';
        }
      } else if (cmd.type === 'raw') {
        ctx.save(); cmd.fn(ctx, p); ctx.restore();
        job.i++; part = 'ink';
      } else job.i++;
    }
    const ms = now() - t0;
    this.stats.ms += ms;
    job.ms = (job.ms || 0) + ms;
    if (bg && part !== 'skip') {
      const key = `${job.tag}|${ci}|${part}`;
      if (part === 'band') {
        if (bandRate === 'rb') {
          if (px >= 3e5) this.rate.rb = Math.min(10, Math.max(0.8, this.rate.rb * 0.9 + 0.1 * Math.max(0, ms - RB0 - this.rbWait) / (px / 1e6)));
        } else if (bandRate === 'wb') {
          if (px >= 2e5) this.rate.wb = Math.min(8, Math.max(0.5, this.rate.wb * 0.9 + 0.1 * Math.max(0, ms - 0.3) / (px / 1e6)));
        } else if (px > 2e5) {
          const r = Math.max(0, ms - 0.3) / (px / 1e6);
          this.learn(key, r);
          if (bandRate) this.rate.band = Math.min(4, Math.max(0.8, this.rate.band * 0.9 + 0.1 * r));
        }
      } else {
        this.learn(key, ms);
        // the area model of a guide unit (draw, plus the whole upload on that path)
        if (part === 'guide' && px > 2e5) this.rate.guide = Math.min(8, Math.max(0.2, this.rate.guide * 0.9 + 0.1 * Math.max(0, ms - 0.6) / (px / 1e6)));
      }
    }
    if (ms > 8 && this.log.length < 300) this.log.push(`${ms.toFixed(1)}ms ${job.tag} cmd${ci} ${part}${bg ? '' : ' (fg)'}`);
    return !job.sub && job.i >= p.cmds.length;
  }

  // Readbacks are being held back (one just waited over RBW_BAD ms for the
  // GPU process, or the measured wait is high): a pass that starts now plans
  // half-size read-back bands (RB_TIGHT), so the one readback that does get
  // through costs about half as much. The band partition is fixed when a
  // pass starts and the pixels are identical either way (the shader clamps
  // its taps to the rows uploaded).
  get rbTight() { return this.rbHold > 0 || this.rbWait > RBW_HOLD; }

  // Rows per band for a pass bw pixels wide (even; at most MAX_ROWS so the
  // GL output canvas stays small and never needs resizing). Bands read back
  // from a guide canvas (band path) hold at most RB_PX pixels (RB_TIGHT while
  // readbacks are held).
  rowsFor(bw, readback = false) {
    const px = readback ? (this.rbTight ? RB_TIGHT : RB_PX) : this.bandPx;
    return Math.max(16, Math.min(MAX_ROWS, Math.floor(px / Math.max(1, bw)))) & ~1;
  }

  // ---- pass: a short pass is one unit; a tall one draws its guide in one
  // unit, then uploads (whole path: the whole guide in that unit; band path:
  // band by band), shades and composites it in bands (one unit each in bg,
  // all at once in fg). With the worker readback (bg), every pass goes
  // through prep() instead.
  pass(job, cmd, bg) {
    const R = this.passRect(job, cmd);
    if (!R) { job.i++; return { part: 'skip', px: 0 }; }
    const { bx, by, bw, bh } = R;
    const banded = this.upload === 'band';
    const rows = this.rowsFor(bw, banded);
    if (isGen(cmd.draw) && bg) {
      // a resumable guide paints into a canvas of its own across frames
      const gc = makeCanvas(bw, bh), gx = gc.getContext('2d');
      gx.setTransform(job.p.k, 0, 0, job.p.k, -job.p.region.x * job.p.k - bx, -job.p.region.y * job.p.k - by);
      job.sub = { kind: 'gen', it: cmd.draw(gx, job.p), gc, R, cmd };
      this.resume(job, bg);
      return { part: 'gen', px: 0 };
    }
    if (!banded && bh <= rows) {
      this.drawGuide(job, cmd, R);
      const out = this.ill.run(this.guide, bw, bh, cmd.material, [R.ox, R.oy], job.p.k, cmd.opts.time ?? job.p.time);
      this.composite(job, cmd, out, R, 0, bh);
      job.i++; this.stats.passes++;
      return { part: 'all', px: bw * bh };
    }
    const sub = { kind: 'bands', cmd, R, bw, rows: bandRows(bh, rows), next: 0 };
    if (banded) {
      // the bands read the guide back one at a time (over several units in
      // bg), so the pass keeps it in a canvas of its own (in fg too, so both
      // modes draw it on a fresh context and give the same pixels)
      sub.gc = makeCanvas(bw, bh);
      sub.pad = padFor(cmd.material, job.p.k);
      this.drawGuide(job, cmd, R, sub.gc);
      if (bg && this.flush) sub.gc.getContext('2d').getImageData(0, 0, 1, 1);
    } else {
      this.drawGuide(job, cmd, R);
      sub.tex = this.ill.upload(this.guide);
    }
    job.sub = sub;
    if (!bg) return { part: 'all', px: this.resume(job, bg) };
    return { part: 'guide', px: bw * bh };
  }

  // Worker readback: draw pass ci's guide into a canvas of its own (a
  // generator: one chunk per unit) and, once complete, hand it to the worker.
  // Its bands run when cmds[job.i] reaches it and the pixels are back.
  prep(job, ci, pre) {
    const bg = this.mode === 'bg';
    const cmd = job.p.cmds[ci];
    job.pipe ??= new Map();
    if (!pre) {
      const R = this.passRect(job, cmd);
      const gc = makeCanvas(R.bw, R.bh);
      const held = R.bw * R.bh;
      this.heldPx += held;
      if (!isGen(cmd.draw)) {
        this.drawGuide(job, cmd, R, gc);
        const b = this.bandsOf(job, cmd, R, gc);
        b.held = held;
        job.pipe.set(ci, b);
        if (bg && this.readback === 'worker') this.handoff(b);
        return { part: 'guide', px: R.bw * R.bh };
      }
      const gx = gc.getContext('2d');
      gx.setTransform(job.p.k, 0, 0, job.p.k, -job.p.region.x * job.p.k - R.bx, -job.p.region.y * job.p.k - R.by);
      pre = { kind: 'gen', it: cmd.draw(gx, job.p), gc, R, cmd, held };
      job.pipe.set(ci, pre);
    }
    let r = pre.it.next();
    if (!bg) while (!r.done) r = pre.it.next();
    if (r.done) {
      const b = this.bandsOf(job, cmd, pre.R, pre.gc);
      b.held = pre.held; pre.held = 0;
      job.pipe.set(ci, b);
      if (bg && this.readback === 'worker') this.handoff(b);
    }
    return { part: 'gen', px: 0 };
  }

  // Paint a pass's guide: into the shared guide canvas (resized to the pass),
  // or into `target`, a fresh canvas of the pass's size.
  drawGuide(job, cmd, R, target = null) {
    const { bx, by, bw, bh } = R, r = job.p.region, k = job.p.k;
    let g;
    if (target) g = target.getContext('2d');
    else {
      if (this.guide.width !== bw || this.guide.height !== bh) { this.guide.width = bw; this.guide.height = bh; }
      g = this.gctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, bw, bh);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // save/restore: no state (a clip, lineCap, font...) leaks from one pass's
    // draw into the next on the shared canvas, so every guide starts from the
    // same default state in any unit order (background = synchronous bakes)
    g.save();
    g.setTransform(k, 0, 0, k, -r.x * k - bx, -r.y * k - by);
    try { drain(cmd.draw(g, job.p)); } finally { g.restore(); }
  }

  // Band path: read pass rows y0..y1 of the guide canvas gc back (with `pad`
  // rows around them, the shader's reach) into the pooled band texture, then
  // shade and composite those rows. The shader maps pass pixels onto the band
  // texture (gRect) and clamps its taps to the rows read (gClamp), so a pass
  // shaded band by band matches one run. A background readback also measures
  // how long getImageData waited for the GPU process (rbWait).
  readBand(job, cmd, R, gc, y0, y1, pad) {
    const { bw, bh } = R;
    const gy0 = Math.max(0, y0 - pad), gy1 = Math.min(bh, y1 + pad), n = gy1 - gy0;
    const t0 = now();
    const d = gc.getContext('2d').getImageData(0, gy0, bw, n);
    if (this.mode === 'bg') {
      const wait = Math.max(0, now() - t0 - (1.2 * bw * n) / 1e6);
      this.rbWait = this.rbWait * 0.7 + 0.3 * wait; this.rbSeen = true;
      // a readback that waited this long for the GPU process holds the others
      // back AND counts toward the switch to the standby worker: the rbWait
      // EMA alone decays within ~20 frames, so a burst never reached RB_HOT
      if (wait > RBW_BAD) { this.rbHold = this.rbFrames; this.rbHot += RB_HOT_BAD; }
    }
    this.shadeRows(job, cmd, R, d.data, gy0, gy1, y0, y1);
  }

  // Shade and composite pass rows y0..y1 from guide rows gy0..gy1 (RGBA bytes,
  // un-premultiplied as getImageData gives them) uploaded into the band texture.
  shadeRows(job, cmd, R, data, gy0, gy1, y0, y1) {
    const bw = R.bw, n = gy1 - gy0;
    const tex = this.bandTex(bw, n);
    const gl = this.ill.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, bw, n, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const out = this.ill.run(tex, bw, R.bh, cmd.material, [R.ox, R.oy], job.p.k, cmd.opts.time ?? job.p.time,
      { band: { y: y0, h: y1 - y0 }, gRect: [0, gy0, this.bsize[0], this.bsize[1]], gClamp: [0, gy0, bw, gy1] });
    this.composite(job, cmd, out, R, y0, y1);
  }

  // Copy pass rows y0..y1 from the GL output (ill.out) onto the job canvas.
  composite(job, cmd, out, R, y0, y1) {
    const ctx = job.ctx, o = this.ill.out;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = cmd.opts.composite || 'source-over';
    ctx.drawImage(out, o.x, o.y, R.bw, y1 - y0, R.bx, R.by + y0, R.bw, y1 - y0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Continue an in-progress command (generator draw, a whole upload, or
  // bands). In fg mode it runs to the end of the command. Returns the pixels
  // shaded (an upload: the pixels uploaded).
  resume(job, bg) {
    const s = job.sub;
    if (s.kind === 'gen') {
      let r = s.it.next();
      if (!bg) while (!r.done) r = s.it.next();
      if (bg && this.flush && s.gc) s.gc.getContext('2d').getImageData(0, 0, 1, 1);
      if (!r.done) return 0;
      if (s.ink) { job.ctx.restore(); job.sub = null; job.i++; return 0; }
      // the guide is complete. Band path: the bands read it back one at a
      // time. Whole path: it is uploaded in the next unit (not with this chunk)
      const { R } = s;
      if (this.upload === 'band') job.sub = this.bandsOf(job, s.cmd, R, s.gc);
      else job.sub = { kind: 'up', cmd: s.cmd, R, gc: s.gc };
      if (bg) return 0;
      return this.resume(job, bg);
    }
    if (s.kind === 'up') {
      const { R } = s;
      const tex = this.ill.upload(s.gc);
      s.gc.width = 0; s.gc.height = 0;
      job.sub = { kind: 'bands', cmd: s.cmd, R, bw: R.bw, rows: bandRows(R.bh, this.rowsFor(R.bw)), next: 0, tex };
      if (bg) return R.bw * R.bh;
      return this.resume(job, bg);
    }
    // bands of a pass (s.tex = the whole guide, s.pixels = the guide's bytes
    // from the worker, s.gc = the guide canvas read back band by band) or of a
    // spheres pass (s.data)
    let px = 0;
    do {
      const [y0, y1] = s.rows[s.next++];
      px += (y1 - y0) * s.bw;
      if (s.data) this.sphereBand(job, s, y0, y1);
      else if (s.pixels) {
        const gy0 = Math.max(0, y0 - s.pad), gy1 = Math.min(s.R.bh, y1 + s.pad);
        this.shadeRows(job, s.cmd, s.R, s.pixels.subarray(gy0 * s.bw * 4, gy1 * s.bw * 4), gy0, gy1, y0, y1);
      } else if (s.gc) this.readBand(job, s.cmd, s.R, s.gc, y0, y1, s.pad);
      else {
        const { R, cmd } = s;
        const out = this.ill.run(s.tex, R.bw, R.bh, cmd.material, [R.ox, R.oy], job.p.k, cmd.opts.time ?? job.p.time, { band: { y: y0, h: y1 - y0 } });
        this.composite(job, cmd, out, R, y0, y1);
      }
    } while (!bg && s.next < s.rows.length);
    if (s.next >= s.rows.length) { this.dropSub(job); job.i++; this.stats.passes++; }
    return px;
  }

  // ---- spheres: a short pass is one unit; a tall one renders band by band
  spheresCmd(job, cmd, bg) {
    const R = this.sphereRect(job, cmd);
    if (!R) { job.i++; return { part: 'skip', px: 0 }; }
    const { bw, bh } = R, k = job.p.k;
    const sp = cmd.spheres;
    const data = new Float32Array(sp.length * 5);
    sp.forEach((b, i) => { data.set([(b.x - R.ox) * k, (b.y - R.oy) * k, b.r * k, (b.z ?? 0) * k, b.bias ?? 0], i * 5); });
    const ow = (cmd.material.outline && cmd.material.outline.width) || 0;
    // sphere bands are half as tall: they render at 2x into the reused FBO
    const s = { kind: 'bands', cmd, R, bw, data, n: sp.length, pad: Math.max(Math.ceil(ow) + 4, padFor(cmd.material, k)), rows: bandRows(bh, this.rowsFor(bw * 2)), next: 0 };
    if (s.rows.length > 1) {
      // each band's GPU pixels (the sphere area it renders), for pacing
      s.gpu = s.rows.map(([y0, y1]) => this.sphereGpu(job, cmd, R, y0, y1));
      job.sub = s;
      const px = this.resume(job, bg);
      return { part: bg ? 'band' : 'all', px };
    }
    this.sphereBand(job, s, 0, bh);
    job.i++; this.stats.passes++;
    return { part: 'all', px: bw * bh };
  }

  sphereBand(job, s, y0, y1) {
    const { R, cmd } = s, k = job.p.k, o = cmd.opts;
    const full = y0 === 0 && y1 === R.bh;
    const gy0 = full ? 0 : Math.max(0, y0 - s.pad), gy1 = full ? R.bh : Math.min(R.bh, y1 + s.pad);
    const tex = this.ill.renderSpheres(s.data, s.n, R.bw, R.bh, {
      light: o.light, ambient: o.ambient, diffuse: o.diffuse, baseDark: o.baseDark, flatBase: o.flatBase,
      baseY: o.baseY !== undefined ? (o.baseY - R.oy) * k : undefined, topY: o.topY !== undefined ? (o.topY - R.oy) * k : undefined,
      global: o.global ? [(o.global[0] - R.ox) * k, (o.global[1] - R.oy) * k, o.global[2] * k, o.global[3] * k] : undefined,
      globalMix: o.globalMix, flatness: o.flatness, rows: full ? undefined : [gy0, gy1],
      edge: o.edge, edgeScale: o.edgeScale, edgeSeed: o.edgeSeed,   // rim erosion (world units; opts win over the material)
    });
    const fv = this.ill.fview;
    const out = this.ill.run(tex, R.bw, R.bh, cmd.material, [R.ox, R.oy], k, o.time ?? job.p.time,
      { band: { y: y0, h: y1 - y0 }, gRect: [0, gy0, fv[0], fv[1]], gClamp: [0, gy0, R.bw, gy1], gTexel: R.bw / Math.min(this.ill.maxSize, R.bw * 2) });
    this.composite(job, cmd, out, R, y0, y1);
  }

  finish(job) {
    if (job.done) return job;
    const mode = this.mode;
    this.mode = 'fg';
    try { while (!this.step(job)); } finally { this.mode = mode; }
    job.done = true;
    this.jobDone(job);
    job.onDone?.(job);
    this.queue = this.queue.filter((j) => j !== job && j.job !== job);
    return job;
  }

  // finish() for a queue entry that may still be lazy (or a task). A paint
  // that throws is reported once and its layer left out, so one broken layer
  // never stops the film (the error still reaches the console for its owner).
  finishEntry(entry) {
    if (entry.task) {
      if (!entry.done) { entry.done = true; try { entry.task(); } catch (err) { console.error(`[bake] ${entry.tag}:`, err); } }
      this.queue = this.queue.filter((j) => j !== entry);
      return null;
    }
    try {
      const job = this.made(entry);
      this.finish(job);
      entry.done = true;
      return job;
    } catch (err) {
      console.error(`[bake] ${entry.tag}:`, err);
      entry.done = true; entry.error = err; entry.cancelled = true;
      const job = entry.lazy ? entry.job : entry;
      if (job) { this.dropAll(job); job.done = true; }
      this.queue = this.queue.filter((j) => j !== entry && j !== job);
      return null;
    }
  }

  // Background work inside a frame budget. Without options this behaves as
  // before (always at least one unit). opts:
  //   T         global story time now (enables the urgency rules)
  //   frameEnd  performance.now() by which this frame's work must end; one unit
  //             bigger than the budget may run on a fresh frame if it fits
  //   idle      nothing is moving (title, paused): any unit may run
  //   urgentS   a shot needed within this many seconds may run any unit (1)
  //   maxPx     GPU pacing: stop once this many pixels were drawn or shaded
  //             this frame (JS time does not show the GPU's share); after a
  //             late frame even the first unit waits for it, unless urgent
  //   maxUnits  stop after this many units (probes)
  //   work      ms of JS the frames themselves take now (the stage's render):
  //             while a shot costs over WORK_BUSY ms a frame, at most one
  //             read-back unit runs per frame (two in one frame were 27-42 ms
  //             in WebKit, where the readback also waits for the GPU process)
  //             and no read-back unit over RB_BIG pixels runs at all
  //   gpu       device pixels of plates the frames composite now (the stage's
  //             framePx): over GPU_BUSY the shot counts as heavy for the
  //             readback rules above even when its own JS is cheap (s10)
  //   quiet     a frame near a cut (see Stage.work): only measured units of
  //             at most QUIET_MS run, unless their shot is needed soon
  //   late      the last frame was late (the GPU is behind): nothing runs that
  //             is not needed within urgentS (or rush); on the band path no
  //             main-thread readback runs unless its shot is needed within
  //             LATE_S (a readback waits for all the GPU's queued work)
  //   rush      a shot is due before the background would finish it (the
  //             stage's deadline rule): unmeasured units may share a frame,
  //             and a unit too big for the frame does not wait
  //   pxRate    GPU pacing over time (WebKit, where the GPU process draws the
  //             bake's guides, uploads and composites in the frame's queue):
  //             a token bucket that fills by pxRate pixels a frame up to
  //             pxBurst (default 2.5 x pxRate); a unit that is not urgent runs
  //             only when the bucket holds its pixels (one bigger than the
  //             bucket: when it is full) and spends them
  // A unit measured over FAR_MS waits until its shot is needed within FAR_S;
  // main-thread readbacks wait while rbWait (how long getImageData waits for
  // the GPU process) is over RBW_HOLD, unless needed within RBW_SOON.
  // An entry waiting for a worker readback is skipped, so later ones run.
  work(budgetMs = 6, opts = {}) {
    const t0 = now();
    const legacy = opts.T === undefined && opts.frameEnd === undefined && !opts.idle;
    const end = t0 + budgetMs;
    const frameEnd = opts.frameEnd ?? end;
    const urgentS = opts.urgentS ?? 1;
    const mode = this.mode;
    this.mode = 'bg';
    if (!this.rbSeen) this.rbWait *= 0.9;   // no readback last frame: the GPU wait estimate decays
    // Readback path (band path): the main thread by default; the standby
    // worker takes over while getImageData keeps waiting for the GPU process,
    // and hands back once the waits are gone (see RB_HOT / RB_COOL).
    if (this.workerOK && !this.workerForced && this.upload === 'band' && !opts.idle) {
      if (this.readback === 'main') {
        // a frame with a slow readback counts up (readBand adds RB_HOT_BAD for
        // one that really waited), a frame with a quick one counts back down
        if (this.rbSeen) this.rbHot = this.rbWait > RBW_HOLD ? this.rbHot + 1 : Math.max(0, this.rbHot - 1);
        if (this.rbHot >= RB_HOT) { this.readback = 'worker'; this.rbHot = 0; this.rbCool = 0; this.noteReadback(opts.T); }
      } else {
        this.rbWait < RBW_COOL ? this.rbCool++ : (this.rbCool = 0);
        if (this.rbCool >= RB_COOL) { this.readback = 'main'; this.rbCool = 0; this.rbHot = 0; this.noteReadback(opts.T); }
      }
    }
    this.rbSeen = false;
    if (this.rbHold > 0 && !opts.idle) this.rbHold--;
    if (opts.idle) this.lateHold = 0;
    else if (opts.late) this.lateHold = this.rbFrames ? LATE_FRAMES : 0;   // ?rbhold=0 turns both holds off
    else if (this.lateHold > 0) this.lateHold--;
    const bucket = opts.pxRate > 0 && !opts.idle;
    const burst = opts.pxBurst ?? (opts.pxRate || 0) * 2.5;
    if (bucket) this.tokens = Math.min(burst, this.tokens + opts.pxRate);
    let ran = 0, gpx = 0, skipped = 0, rbRan = 0;
    // A heavy shot: its own frames cost over WORK_BUSY ms of JS, or they
    // composite over GPU_BUSY device pixels of plates (s10's two full-frame
    // plates: cheap in JS, but the GPU process is busy all frame, which is
    // what a main-thread readback waits for).
    const busy = (opts.work || 0) > WORK_BUSY || (opts.gpu || 0) > GPU_BUSY;
    try {
      for (let qi = 0; qi < this.queue.length;) {
        const el = this.queue[qi];
        if (el.cancelled) { this.queue.splice(qi, 1); continue; }
        const tn = now();
        if (tn - t0 >= budgetMs || ran >= (opts.maxUnits ?? Infinity)) break;
        const pl = this.plan(el);
        if (pl.blocked) { if (++skipped > SKIP_MAX) break; qi++; continue; }
        if (!legacy || ran > 0) {
          const due = opts.T !== undefined && el.needAt !== undefined ? el.needAt - opts.T : Infinity;
          const soon = opts.idle || due < urgentS;
          // near a cut only small, measured units run (the cut frame and the drop stay clean)
          if (opts.quiet && !soon && (!pl.known || pl.ms > QUIET_MS)) break;
          // after a late frame only urgent work runs: WebKit's GPU process draws the bake's
          // guides, uploads and composites in the same queue as the frame, so it gets a frame
          // to catch up (the stage paces the rest over the time until the shot is needed)
          if (opts.late && !soon && !opts.rush) break;
          // a unit measured too heavy for standard 17 waits until its shot is needed within FAR_S
          if (!opts.idle && opts.T !== undefined && due > FAR_S && pl.known && pl.ms > FAR_MS) break;
          if (pl.readback && !opts.idle) {
            // after a late frame the GPU process is behind for several frames
            if ((opts.late || this.lateHold > 0) && due > LATE_S) break;
            if ((this.rbWait > RBW_HOLD || this.rbHold > 0) && due > RBW_SOON) break;
            // one read-back unit a frame (it waits for the GPU process, which
            // is already drawing this shot's own frames: two readbacks in one
            // frame measured 27-42 ms in WebKit). The film has 520 of them
            // over 61 s, so one a frame is six times what it needs.
            if (rbRan >= 1 && !soon && !opts.rush) break;
            // ... and while the shot on screen is heavy (its own JS, or the
            // plate pixels it composites), a LARGE readback for a shot that
            // is not the next one waits: round 5 lost 13 frames inside s10's
            // window to s11 and s12 band readbacks.
            if (busy && (pl.px || 0) > RB_BIG && due > RB_FAR && !opts.rush) break;
          }
          // an unmeasured unit may be heavier than predicted: give it a fresh
          // frame, unless it is predicted small and the frame has barely started
          if (ran > 0 && !pl.known && !(pl.ms <= 2 && tn - t0 < 1.5) && !(opts.rush && tn + pl.ms <= end)) break;
          if (opts.maxPx && gpx + (pl.px || 0) > opts.maxPx && (ran > 0 || (opts.late && !soon && !opts.rush))) break;
          if (bucket && !soon && !opts.rush && (pl.px || 0) > 0 && this.tokens < Math.min(pl.px, burst)) break;
          gpx += pl.px || 0;
          if (tn + pl.ms > end) {
            if (ran > 0) break;
            // a unit known (measured, or hinted with opts.cost) to be too big
            // for any frame waits until its shot is needed soon or nothing
            // moves; an unmeasured one just gets this fresh frame. A head that
            // has waited WAIT_MAX frames runs anyway, so a pessimistic
            // prediction can never starve the queue until the deadline.
            const urgent = soon || opts.rush || this.waited >= WAIT_MAX;
            if (tn + pl.ms > frameEnd && !urgent && (pl.known || pl.hinted)) { this.waited++; break; }
          }
        }
        ran++;
        if (pl.readback) rbRan++;
        this.waited = 0;
        if (bucket) this.tokens -= pl.px || 0;
        try {
          if (el.task) {
            this.queue.splice(qi, 1);
            el.done = true;
            const t1 = now();
            try { el.task(); } catch (err) { console.error(`[bake] ${el.tag}:`, err); }
            const ms = now() - t1;
            this.learn(`task|${el.tag}`, ms);
            if (ms > 8 && this.log.length < 300) this.log.push(`${ms.toFixed(1)}ms ${el.tag} task`);
            continue;
          }
          if (el.lazy && !el.job) { this.made(el); continue; }
          const job = el.lazy ? el.job : el;
          if (this.step(job)) {
            job.done = true; el.done = true; this.queue.splice(qi, 1); this.jobDone(job); job.onDone?.(job);
          }
        } catch (err) {
          // a broken paint must not stop the film: report it once, drop the job
          console.error(`[bake] ${el.tag}:`, err);
          el.cancelled = true; el.done = true; el.error = err;
          const job = el.lazy ? el.job : el.task ? null : el;
          if (job) { this.dropAll(job); job.done = true; }
          this.queue.splice(qi, 1);
        }
      }
    } finally { this.mode = mode; }
    return this.queue.length;
  }
}
