// Stage: camera, plate residency and per-frame compositing.
//
// A shot is a stack of `items`, drawn in order:
//   { layer: 'id', depth, paint(p), frames?, fps?, res?, alpha?(e), span? }  baked once
//     (span: [t0, t1] shot-local seconds the layer is visible; it then bakes
//      only what the camera shows in that interval)
//   { actor: 'id', depth, draw(ctx, e) }                              drawn every frame
// `depth` is a multiplane-camera factor: 1 moves with the camera, 0 stays at
// the opening framing, >1 for foreground that slides past faster.
// Cameras are focus rectangles (centre x/y, w/h in world units) that must
// stay visible; the viewport extends past them on its long axis, so plates
// paint generously beyond the design frame.

import { Baker, MAX_ROWS } from './bake.js';
import { ease as EASE, clamp, RNG, lerp } from './rng.js';

// '#rgb' / '#rrggbb' / 'rgb(...)' / 'rgba(...)' -> [r, g, b] and its alpha
// (transition and fadeOut colours; see fadeTo).
function rgbOf(c) {
  const s = String(c).trim();
  const m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const h = m[1];
    if (h.length <= 4) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const n = s.match(/-?[\d.]+/g);
  return n ? n.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(Number(v))))) : [0, 0, 0];
}
function alphaOf(c) {
  const n = String(c).match(/^rgba?\(([^)]*)\)$/i);
  if (n) { const p = n[1].match(/-?[\d.]+/g); if (p && p.length > 3) return Math.max(0, Math.min(1, Number(p[3]))); return 1; }
  const m = String(c).trim().match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i);
  if (m) { const h = m[1]; return h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : parseInt(h.slice(6, 8), 16) / 255; }
  return 1;
}

const DPR_CAP = 2;
// The shot two ahead starts baking only this far into the current shot, so
// the first frames after a cut (the music drop at 35.87 s) carry no bake work.
// A shot whose own frames cost over BUSY_MS of JS (s08's crowds and fires) or
// composite over BUSY_PX device pixels of plates (s10's two full-frame plates
// and Zeus: cheap in JS, busy in the GPU process) waits PREFETCH2_BUSY
// instead: the shot after it is still prepared in time (the deadline rule),
// but its first unmeasured units do not land while the GPU process is
// already behind.
const PREFETCH2_AT = 0.6;
const PREFETCH2_BUSY = 1.2;
const BUSY_MS = 4;
const BUSY_PX = 18e6;
const QUIET = [0.15, 0.25];   // s before / after each cut with only small bake units (Stage.work)
// Deadline rule (Stage.work): when the next shot is due within RUSH_S and the
// background would not finish it in time at the frame's budget, the budget
// grows (up to RUSH_MS) and the baker packs units (Baker.work's rush).
const RUSH_S = 2.5;
const RUSH_MS = 12;
const PACE = 0.6;             // the deadline rule plans to finish within this share of the time left
const FREE_PER_FRAME = 2;     // canvases of a dropped shot freed per frame (after the quiet window)
// 'dip' dissolve: the floor under the outgoing frame's own luminance in the
// darkening pass (see darkFrame). Without it the dark middle multiplied three
// frames together and bottomed out at essentially black for about 0.19 s; the
// floor keeps the middle a deep tone. It stays a MULTIPLY of the two frames,
// so no navy is ever laid over red (standards 15 and 28): a plain mix toward
// navy measures 1.7% plum in the middle of the dissolve.
const DIP_FLOOR = '#3c3c3c';
// 'dip' easing: over 1 the dark middle is reached late and left early, so the
// darkest frames are a dip and not a hold (standard 28's "through darkness").
const DIP_EASE = 2.1;
// A coloured fade only takes on the fade colour's hue in its last stretch,
// once the frame is dark (see fadeTo).
const HUE_FROM = 0.7;

// The local time reduced motion holds the camera at: shot.reducedT, either a
// number (one framing for the shot) or a list of [tFrom, tHold] pairs (one
// framing per setup: from tFrom on, hold at tHold). Default mid-shot.
export function heldT(shot, t = 0) {
  const r = shot.reducedT;
  if (Array.isArray(r)) {
    let h = r.length ? r[0][1] : shot.dur * 0.5;
    for (const [from, at] of r) if (t >= from) h = at;
    return h;
  }
  return r ?? shot.dur * 0.5;
}

// Test override of every dissolve's blend (?diss= in the app and the lab):
// 'dip' | 'multiply' | 'darken' | 'linear' (see Stage.blendDissolve).
export function overrideDissolve(shots, spec) {
  if (!spec) return;
  for (const s of shots) {
    if (!s.transition || s.transition.type !== 'dissolve') continue;
    const tr = { type: 'dissolve', dur: s.transition.dur };
    if (spec !== 'linear') tr.mode = spec;
    s.transition = tr;
  }
}

export class Stage {
  constructor(canvas, story, illustrator, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.story = story;
    this.baker = new Baker(illustrator, { upload: opts.upload, flush: opts.flush, rbHold: opts.rbHold });   // opts.upload: 'whole' | 'band' | 'worker' (default: probed)
    this.reduced = !!opts.reduced;
    this.quality = opts.quality ?? 1;
    this.assets = new Map();     // shot index -> {jobs, layers, sprites, ready}
    this.state = new Map();      // shot index -> persistent actor state
    this.lastIdx = -1;
    this.lastT = 0;
    this.wall0 = performance.now();
    this.fixedWall = null;       // harness renders pin ambient time
    this.trash = [];             // canvases of dropped shots, freed a few per frame (work)
    this.freePerFrame = opts.freePerFrame ?? FREE_PER_FRAME;   // A/B: Infinity frees a dropped shot at once
    this.prerollOn = opts.preroll !== false;                    // A/B: false = no pre-roll
    this.reserveSpheres = opts.spheres !== false;               // A/B: false = the sphere FBO grows on demand
    this.frameWork = 0;          // ms of JS the frames themselves cost now (work's opts.work)
    this.framePx = 0;            // device px of plates a frame composites now, EMA (work's opts.gpu)
    this.pxDrawn = 0;            // ... and this frame's running total (compose)
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * this.quality;
    const W = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const H = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const key = `${W}x${H}@${dpr}`;
    if (key === this.sizeKey) return false;
    this.sizeKey = key;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    // Every bake depends on the viewport: drop them all.
    this.baker.cancel(() => true);
    for (const a of this.assets.values()) this.free(a);
    this.assets.clear();
    this.freeTrash(Infinity);
    this.reserve();
    return true;
  }

  // Size the illustrator's output canvas, the baker's band texture and the
  // sphere framebuffer for the widest layer or sprite of the film at this
  // viewport, so background bakes never resize them (each resize costs
  // several ms of GPU-process time inside a bake unit).
  reserve() {
    let wmax = 0;
    for (const shot of this.story.shots) {
      for (const item of shot.items || []) {
        if (!item.layer) continue;
        const cov = this.coverage(shot, item.depth ?? 1, item.margin ?? shot.margin ?? 0, item.span);
        let k = cov.smax * this.dpr * (item.res ?? 1);
        const px = cov.region.w * cov.region.h * k * k;
        if (px > 18e6) k *= Math.sqrt(18e6 / px);
        wmax = Math.max(wmax, Math.ceil(cov.region.w * k));
      }
      for (const sp of Object.values(shot.sprites || {})) {
        const cov = this.coverage(shot, sp.depth ?? 1, 0);
        wmax = Math.max(wmax, Math.ceil((sp.w || 0) * cov.smax * this.dpr * (sp.res ?? 1) * (sp.maxScale ?? 1)));
      }
    }
    wmax = Math.min(wmax, this.baker.ill.maxSize || wmax);
    this.baker.ill.reserve?.(wmax, MAX_ROWS);
    this.baker.reserve(wmax, this.reserveSpheres);
  }

  get portrait() { return this.W / this.H < 0.82; }

  keys(shot) { return (this.portrait && shot.camPortrait) ? shot.camPortrait : shot.cam; }

  // Focus rect at shot-local time t. Reduced motion holds one framing per
  // shot (shot.reducedT, default mid-shot), except while the title card is
  // up (render(T, { title: true })): the title always sits on s01's first
  // frame, the open sky.
  focus(shot, t, hold = this.reduced && !this.titleHold) {
    if (hold) t = heldT(shot, t);
    const kf = this.keys(shot);
    if (!kf || !kf.length) return { x: 800, y: 450, w: 1600, h: 900 };
    if (t <= kf[0].t) return kf[0];
    for (let i = 0; i < kf.length - 1; i++) {
      const a = kf[i], b = kf[i + 1];
      if (t <= b.t) {
        const u = (EASE[b.ease || 'inOutSine'] || EASE.inOutSine)(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
        return {
          x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u),
          w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), u)),
          h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), u)),
        };
      }
    }
    return kf[kf.length - 1];
  }

  // Depth-1 view: px-per-unit s (CSS px) and visible rect.
  view(shot, t, hold) {
    const f = this.focus(shot, t, hold);
    const A = this.W / this.H;
    let vw, vh;
    if (f.w / f.h > A) { vw = f.w; vh = f.w / A; } else { vh = f.h; vw = f.h * A; }
    return { s: this.W / vw, cx: f.x, cy: f.y, vw, vh };
  }

  depthView(shot, t, d, v = this.view(shot, t), v0 = this.view(shot, 0)) {
    const s = v0.s * Math.pow(v.s / v0.s, d);
    const cx = v0.cx + (v.cx - v0.cx) * d;
    const cy = v0.cy + (v.cy - v0.cy) * d;
    const vw = this.W / s, vh = this.H / s;
    return { s, cx, cy, ox: cx - vw / 2, oy: cy - vh / 2, vw, vh };
  }

  // World rect a depth plane shows over the whole shot (or over span =
  // [t0, t1], shot-local seconds: a layer only shown in part of the shot),
  // and the densest scale.
  coverage(shot, d, extra = 0, span = null) {
    const dur = shot.dur;
    const pairs = [];   // [view, view at t=0] for each sampled moment
    if (this.reduced) {
      // the held framing(s), plus the open-sky title framing for the first shot
      const holds = Array.isArray(shot.reducedT) ? shot.reducedT.map(([from]) => from) : [0];
      for (const from of holds) { const vh = this.view(shot, from, true); pairs.push([vh, vh]); }
      if (shot === this.story.shots[0]) { const vt = this.view(shot, 0, false); pairs.push([vt, vt]); }
    } else {
      const a = span ? clamp(span[0], 0, dur) : 0, b = span ? clamp(span[1], a, dur) : dur;
      const ts = [];
      for (let i = 0; i <= 24; i++) ts.push(a + ((b - a) * i) / 24);
      for (const k of this.keys(shot) || []) if (k.t > a && k.t < b) ts.push(k.t);
      const v0 = this.view(shot, 0, false);
      for (const t of ts) pairs.push([this.view(shot, t, false), v0]);
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, smax = 0;
    for (const [v, v0] of pairs) {
      const dv = this.depthView(shot, 0, d, v, v0);
      x0 = Math.min(x0, dv.ox); y0 = Math.min(y0, dv.oy);
      x1 = Math.max(x1, dv.ox + dv.vw); y1 = Math.max(y1, dv.oy + dv.vh);
      smax = Math.max(smax, dv.s);
    }
    const mx = (x1 - x0) * 0.02 + extra, my = (y1 - y0) * 0.02 + extra;
    return { region: { x: x0 - mx, y: y0 - my, w: x1 - x0 + 2 * mx, h: y1 - y0 + 2 * my }, smax };
  }

  free(a) {
    if (!a) return;
    const kill = (c) => { if (c && c.width) { c.width = 0; c.height = 0; } };
    for (const l of Object.values(a.layers)) l.canvases.forEach(kill);
    for (const s of Object.values(a.sprites)) kill(s.canvas);
    if (a.caches) { for (const c of a.caches.values()) kill(c); a.caches.clear(); }
  }

  // A canvas an actor keeps between frames (a flame step, a crowd atlas, a
  // figure drawn on twos), owned by the shot it is drawn in: `e.cache(key, w,
  // h)` in an actor's draw(). It is freed with the shot's plates when the shot
  // leaves residency, so the caches of shots that are gone do not sit in
  // memory (iOS Safari counts every live canvas). `c.fresh` is true when the
  // canvas was just created or resized (so it is blank and must be redrawn).
  // An actor drawn for a shot that is not resident (a probe) gets a plain
  // canvas of its own, which the garbage collector reclaims.
  cache(i, key, w, h) {
    const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
    const a = this.assets.get(i);
    if (!a) { const c = document.createElement('canvas'); c.width = W; c.height = H; c.fresh = true; return c; }
    a.caches = a.caches || new Map();
    let c = a.caches.get(key);
    if (!c) { c = document.createElement('canvas'); a.caches.set(key, c); }
    c.fresh = c.width !== W || c.height !== H;
    if (c.fresh) { c.width = W; c.height = H; }   // sizing a canvas also clears it
    return c;
  }

  // A dropped shot's canvases go to the trash and are freed FREE_PER_FRAME at
  // a time outside the quiet windows (releasing a whole shot's plates at once
  // can stall WebKit's GPU process right after a cut).
  discard(a) {
    for (const l of Object.values(a.layers)) for (const c of l.canvases) if (c) this.trash.push(c);
    for (const s of Object.values(a.sprites)) if (s.canvas) this.trash.push(s.canvas);
    if (a.caches) { for (const c of a.caches.values()) if (c) this.trash.push(c); a.caches.clear(); }
  }

  freeTrash(n) {
    while (n-- > 0 && this.trash.length) { const c = this.trash.pop(); c.width = 0; c.height = 0; }
  }

  // Shot i is completely baked (its plates exist).
  ready(i) { const a = this.assets.get(i); return !!a && a.jobs.every((j) => j.done); }

  // Queue (and with sync, finish) every bake job for shot i. Queued jobs are
  // lazy: nothing is painted or allocated until the baker reaches them, so
  // calling this is cheap. a.jobs holds the baker's queue entries.
  ensure(i, sync = false) {
    const shots = this.story.shots;
    if (i < 0 || i >= shots.length) return null;
    let a = this.assets.get(i);
    if (!a) {
      const shot = shots[i];
      a = { jobs: [], layers: {}, sprites: {}, ready: false, index: i };
      const dpr = this.dpr;
      const budget = 18e6; // pixels per baked canvas
      const prio = Math.abs(i - Math.max(0, this.lastIdx)) + 1;
      const needAt = shot.start ?? 0;
      const add = (spec, estPx) => a.jobs.push(this.baker.lazy(() => this.baker.job(spec), { tag: spec.tag, needAt, priority: prio, estPx }));
      for (const item of shot.items) {
        if (!item.layer) continue;
        const cov = this.coverage(shot, item.depth ?? 1, item.margin ?? shot.margin ?? 0, item.span);
        let k = cov.smax * dpr * (item.res ?? 1);
        const px = cov.region.w * cov.region.h * k * k;
        if (px > budget) k *= Math.sqrt(budget / px);
        const frames = item.frames || 1;
        // item.bounds (world rect in the layer's depth plane) crops the bake
        let region = cov.region;
        if (item.bounds) {
          const b = item.bounds, x0 = Math.max(region.x, b.x), y0 = Math.max(region.y, b.y);
          const x1 = Math.min(region.x + region.w, b.x + b.w), y1 = Math.min(region.y + region.h, b.y + b.h);
          if (x1 > x0 && y1 > y0) region = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        const entry = { canvases: new Array(frames), regions: new Array(frames), region, k, frames, fps: item.fps || 6 };
        a.layers[item.layer] = entry;
        for (let f = 0; f < frames; f++) {
          add({
            paint: item.paint, region, k, night: !!shot.night, frame: f, time: f * 1.618, crop: item.crop !== false, portrait: this.portrait,
            seed: `${shot.id}:${item.layer}`, shot, tag: `${shot.id}/${item.layer}#${f}`, priority: prio, needAt,
            onDone: (j) => { entry.canvases[f] = j.canvas; entry.regions[f] = j.region; },
          }, region.w * region.h * k * k);
        }
      }
      for (const [name, sp] of Object.entries(shot.sprites || {})) {
        const cov = this.coverage(shot, sp.depth ?? 1, 0);
        const k = cov.smax * dpr * (sp.res ?? 1) * (sp.maxScale ?? 1);
        const region = { x: sp.x ?? 0, y: sp.y ?? 0, w: sp.w, h: sp.h };
        const entry = { canvas: null, region, k, ax: sp.ax ?? 0.5, ay: sp.ay ?? 1 };
        a.sprites[name] = entry;
        add({
          paint: sp.paint, region, k, night: !!shot.night, seed: `${shot.id}:sprite:${name}`, portrait: this.portrait,
          shot, kind: 'sprite', tag: `${shot.id}/sprite:${name}`, priority: prio, needAt,
          onDone: (j) => { entry.canvas = j.canvas; },
        }, region.w * region.h * k * k);
      }
      a.jobs.forEach((j) => this.baker.enqueue(j));
      this.assets.set(i, a);
    }
    if (sync && !a.ready) a.jobs.forEach((j) => { if (!j.done) this.baker.finishEntry(j); });
    a.ready = a.jobs.every((j) => j.done);
    return a;
  }

  // Keep a window of shots around the playhead baked; drop the rest. The
  // previous shot stays only while the current one dissolves from it (its
  // unfinished jobs, needed in the past, would otherwise run first and as
  // urgent). The shot two ahead is queued later, from render() (PREFETCH2_AT).
  prefetch(i) {
    // a pre-roll still queued for the shot that is now on screen is moot
    const cur = this.assets.get(i);
    if (cur && cur.tasks) { this.baker.cancel((j) => cur.tasks.includes(j)); cur.rolled = true; }
    const keep = new Set([i, i + 1, i + 2]);
    if (this.story.shots[i]?.transition?.type === 'dissolve') keep.add(i - 1);
    for (const [idx, a] of this.assets) {
      if (!keep.has(idx)) {
        this.baker.cancel((j) => a.jobs.includes(j) || (a.tasks && a.tasks.includes(j)));
        this.discard(a); this.assets.delete(idx); this.state.delete(idx);
      }
    }
    this.ensure(i + 1);
  }

  // Pre-roll (WebKit cut frames): once a coming shot is baked, background
  // tasks touch each of its plates (a 1x1 draw, so WebKit's GPU process does
  // a plate's first-use work then, not in the cut frame) and draw each actor
  // visible at its first frame once at t = 0 into a 1x1 scratch canvas with
  // the real scale, so per-frame caches (flame steps, crowd atlases) exist
  // before the cut. The tasks sort with the shot (needAt).
  preroll(j, a) {
    const shot = this.story.shots[j];
    if (!shot) return;
    a.tasks = a.tasks || [];
    const needAt = shot.start ?? 0;
    const add = (tag, fn, cost) => { const tk = this.baker.task(fn, { tag: `${shot.id}/${tag}`, needAt, cost }); a.tasks.push(tk); this.baker.enqueue(tk); };
    const touch = (c) => { if (c && c.width) this.scratch().drawImage(c, 0, 0, 1, 1); };
    for (const [name, L] of Object.entries(a.layers)) L.canvases.forEach((c, f) => add(`touch:${name}#${f}`, () => touch(c), 0.5));
    for (const [name, S] of Object.entries(a.sprites)) add(`touch:sprite:${name}`, () => touch(S.canvas), 0.5);
    for (const item of shot.items) {
      if (!item.actor || (item.span && item.span[0] > 0)) continue;
      add(`warm:${item.actor}`, () => this.warm(j, item), 2);
    }
  }

  scratch() {
    if (!this.sx) { const c = document.createElement('canvas'); c.width = 1; c.height = 1; this.sx = c.getContext('2d'); }
    return this.sx;
  }

  // Draw actor `item` of shot j once at t = 0 into the scratch canvas, with
  // the scale and view of the shot's first frame (see preroll).
  warm(j, item) {
    const shot = this.story.shots[j];
    if (!this.assets.get(j)) return;
    const e = this.env(j, 0, shot.start);
    e.drawSprite = (c, name, x, y, o) => this.drawSprite(c, e, name, x, y, o);
    const v = this.view(shot, 0), dv = this.depthView(shot, 0, item.depth ?? 1, v, v);
    e.s = dv.s * this.dpr; e.view = dv;
    const g = this.scratch();
    g.save();
    g.setTransform(e.s, 0, 0, e.s, -dv.ox * e.s, -dv.oy * e.s);
    try { item.draw(g, e); } catch (err) { this.actorFailed(shot, item, err); }
    g.restore();
  }

  // Background baking for this frame (call after render). Adds the story
  // clock so the baker knows how soon each queued shot is needed. opts:
  // { frameEnd, idle, urgentS } (see Baker.work). Idle (title, paused) also
  // queues the shot two ahead at once.
  // Frames from QUIET[0] s before a cut to QUIET[1] s after it are quiet:
  // only small measured units run there (the cut frame composes a new shot,
  // and the 35.87 cut is the drop), unless a shot is needed soon.
  // The deadline rule: when the next shot is due within RUSH_S and the rate
  // that finishes it within PACE of the time left (Baker.pending's estimate)
  // exceeds the budget, the budget grows (up to RUSH_MS) and the baker packs
  // units ('rush'), so a cut that follows a seek is not baked synchronously.
  // Otherwise the background bakes as fast as the budget allows (a GPU-light
  // shot bakes the next ones early) and backs off after late frames (Baker
  // work's late), so it does not crowd a GPU-heavy one. stage.pace shows the
  // estimate (tools). Then: the pre-roll of coming baked shots, and the trash.
  work(budgetMs, opts = {}) {
    if (opts.idle && this.lastIdx >= 0) this.ensure(this.lastIdx + 2);
    const shot = this.story.shots[this.lastIdx];
    const quiet = !opts.idle && !!shot && (shot.end - this.lastT < QUIET[0] || this.lastT - shot.start < QUIET[1]);
    let rush = false;
    this.pace = null;
    if (!opts.idle && shot) {
      for (const j of [this.lastIdx + 1, this.lastIdx + 2]) {
        const nx = this.story.shots[j], na = this.assets.get(j);
        if (!nx || !na || na.jobs.every((e) => e.done)) continue;
        const due = Math.max(0, nx.start - this.lastT);
        const need = this.baker.pending((e) => na.jobs.includes(e)) / Math.max(1, due * 60 * PACE);
        if (j === this.lastIdx + 1 && due < RUSH_S && need > budgetMs * 0.75) { budgetMs = Math.min(RUSH_MS, Math.max(budgetMs, need * 1.25)); rush = true; }
        this.pace = { shot: nx.id, due: +due.toFixed(2), need: +need.toFixed(2), budget: +budgetMs.toFixed(2), rush };
        break;
      }
    }
    this.rush = rush;
    if (opts.work !== undefined) this.frameWork = opts.work;
    const left = this.baker.work(budgetMs, { T: this.lastT, quiet, rush, gpu: this.framePx, ...opts });
    for (const j of [this.lastIdx + 1, this.lastIdx + 2]) {
      const a = this.assets.get(j);
      if (a && !a.rolled && a.jobs.length && a.jobs.every((e) => e.done)) { a.rolled = true; a.ready = true; if (this.prerollOn) this.preroll(j, a); }
    }
    if (!quiet || this.freePerFrame === Infinity) this.freeTrash(this.freePerFrame);
    return left;
  }

  shotAt(T) {
    const shots = this.story.shots;
    for (let i = 0; i < shots.length; i++) if (T < shots[i].end) return i;
    return shots.length - 1;
  }

  env(i, t, T) {
    const shot = this.story.shots[i];
    let st = this.state.get(i);
    if (!st) { st = {}; this.state.set(i, st); shot.setup?.(st, shot); }
    const wall = this.fixedWall ?? (performance.now() - this.wall0) / 1000;
    return {
      shot, i, t, T, dur: shot.dur, u: clamp(t / shot.dur), night: !!shot.night, reduced: this.reduced,
      wall, st, W: this.W, H: this.H, dpr: this.dpr,
      rng: (tag) => new RNG(`${shot.id}:${tag}`),
      cache: (key, w, h) => this.cache(i, key, w, h),
      q: (fps = 12) => Math.floor(t * fps) / fps,           // time on twos/threes
      sprites: this.assets.get(i)?.sprites || {},
    };
  }

  drawSprite(ctx, e, name, x, y, o = {}) {
    const sp = e.sprites[name];
    if (!sp || !sp.canvas) return;
    const r = sp.region;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.sx || o.sy || o.s) ctx.scale(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    const ax = o.ax ?? sp.ax, ay = o.ay ?? sp.ay;
    ctx.drawImage(sp.canvas, -ax * r.w, -ay * r.h, r.w, r.h);
    ctx.restore();
  }

  actorFailed(shot, item, err) {
    const key = `${shot.id}/${item.actor}: ${err && err.message}`;
    this.failed = this.failed || new Set();
    if (this.failed.has(key)) return;
    this.failed.add(key);
    console.error(`[stage] actor ${shot.id}/${item.actor} threw:`, err);
  }

  // Composite shot i at its local time t into ctx (device pixels; the main
  // canvas unless given).
  compose(i, t, T, alpha = 1, ctx = this.ctx) {
    const shot = this.story.shots[i];
    const a = this.assets.get(i);
    const e = this.env(i, t, T);
    e.drawSprite = (ctx2, name, x, y, o) => this.drawSprite(ctx2, e, name, x, y, o);
    const v = this.view(shot, t), v0 = this.view(shot, 0);
    const dpr = this.dpr;
    let shx = 0, shy = 0;
    if (shot.shake && !this.reduced) { const s = shot.shake(t, e) || [0, 0]; shx = s[0] * dpr; shy = s[1] * dpr; }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (alpha >= 1) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = shot.bg || '#000'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    for (const item of shot.items) {
      if (item.span && (t < item.span[0] || t > item.span[1])) continue;   // outside its interval
      const d = item.depth ?? 1;
      const dv = this.depthView(shot, t, d, v, v0);
      const s = dv.s * dpr;
      e.s = s; e.view = dv;
      let ia = 1;
      if (item.alpha) { ia = clamp(item.alpha(e)); if (ia <= 0) continue; }
      ctx.globalAlpha = alpha * ia;
      if (item.layer) {
        const L = a?.layers[item.layer];
        if (!L) continue;
        let f = L.frames > 1 ? Math.floor((this.reduced ? 0 : e.wall) * L.fps) % L.frames : 0;
        if (!L.canvases[f]) f = L.canvases.findIndex(Boolean);
        const cv = L.canvases[f];
        if (!cv) continue;
        const R = (L.regions && L.regions[f]) || L.region;   // a cropped bake covers less
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';   // 'high' (bicubic) was the film's largest per-frame GPU cost
        const dw = R.w * s, dh = R.h * s;
        // device px of plate the GPU scales and composites in this frame (the
        // readback rules in Baker.work read it as opts.gpu: a shot that draws
        // two full-frame plates keeps the GPU process busy all frame although
        // its own JS is cheap). Clipped to the canvas, so a plate far wider
        // than the frame is not counted beyond what is drawn.
        this.pxDrawn += Math.max(0, Math.min(dw, this.canvas.width)) * Math.max(0, Math.min(dh, this.canvas.height));
        ctx.drawImage(cv, (R.x - dv.ox) * s + shx, (R.y - dv.oy) * s + shy, dw, dh);
      } else if (item.actor) {
        ctx.setTransform(s, 0, 0, s, -dv.ox * s + shx, -dv.oy * s + shy);
        ctx.save();
        // one broken actor (a kit mid-edit) is logged once and skipped; the
        // rest of the shot still draws
        try { item.draw(ctx, e); } catch (err) { this.actorFailed(shot, item, err); }
        ctx.restore();
      }
    }
    ctx.globalAlpha = alpha;
    if (shot.post) { ctx.setTransform(1, 0, 0, 1, 0, 0); shot.post(ctx, e); }
    ctx.restore();
    return e;
  }

  // Reusable full-frame canvases for dissolves (allocated just before one):
  // 'out' holds the outgoing shot's composite, 'dark' the 'dip' mode's
  // darkened copy of it (see darkFrame).
  dissolveCanvas(which = 'out') {
    const W = this.canvas.width, H = this.canvas.height;
    this.diss = this.diss || {};
    let d = this.diss[which];
    if (!d || d.canvas.width !== W || d.canvas.height !== H) {
      if (d) { d.canvas.width = 0; d.canvas.height = 0; }
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      d = this.diss[which] = { canvas: c, ctx: c.getContext('2d', { alpha: false }), key: '', stage: 0 };
      d.ctx.fillStyle = '#000'; d.ctx.fillRect(0, 0, W, H);   // allocate it now, not in the first dissolve frame
    }
    return d;
  }

  freeDissolve() {
    if (!this.diss) return;
    for (const d of Object.values(this.diss)) { d.canvas.width = 0; d.canvas.height = 0; }
    this.diss = null;
  }

  // The outgoing shot of a dissolve at its local time tOut, composed into the
  // 'out' canvas. Past its end the camera holds its last key, so when it has
  // no shake only its actors move (on twos): it is recomposed only when its
  // 12 fps step changes, and each dissolve frame composes just the incoming shot.
  outgoing(i, tOut, T) {
    const shot = this.story.shots[i];
    const d = this.dissolveCanvas('out');
    const kf = this.keys(shot);
    const still = !shot.shake && (!kf || !kf.length || tOut >= kf[kf.length - 1].t);
    const key = still ? `${i}:${Math.floor(tOut * 12)}:${this.sizeKey}:${this.reduced}` : '';
    if (!key || key !== d.key) { this.compose(i, tOut, T, 1, d.ctx); d.key = key; }
    return d;
  }

  // The 'dip' mode's darkened outgoing frame E = A x max(lum(A), DIP_FLOOR)
  // (each pixel of the outgoing frame A times its own luminance, lifted by
  // 1/0.93 so white stays exactly white, with a floor under it): mid-tones
  // such as a red burning city sink toward black, while a moon both shots
  // share stays white and the dark middle keeps a floor. Built once per
  // dissolve from the first outgoing frame in five full-frame draws (a copy,
  // a 'saturation' fill with grey = lum(A), a 'color-dodge' lift, a 'lighten'
  // floor, a multiply by A), spread over five frames while playing
  // (spread = true; until then the outgoing frame itself stands in, at weight
  // < 0.1) and all at once otherwise (a single render: the lab, a seek, a
  // paused frame).
  darkFrame(out, i, spread) {
    const d = this.dissolveCanvas('dark');
    const key = `${i}:${this.sizeKey}`;
    if (d.key !== key) { d.key = key; d.stage = 0; }
    const g = d.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    do {
      if (d.stage === 0) { g.globalCompositeOperation = 'source-over'; g.drawImage(out.canvas, 0, 0); }
      else if (d.stage === 1) { g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, d.canvas.width, d.canvas.height); }
      else if (d.stage === 2) { g.globalCompositeOperation = 'color-dodge'; g.fillStyle = '#121212'; g.fillRect(0, 0, d.canvas.width, d.canvas.height); }
      else if (d.stage === 3) { g.globalCompositeOperation = 'lighten'; g.fillStyle = DIP_FLOOR; g.fillRect(0, 0, d.canvas.width, d.canvas.height); }
      else if (d.stage === 4) { g.globalCompositeOperation = 'multiply'; g.drawImage(out.canvas, 0, 0); }
      if (d.stage < 5) d.stage++;
    } while (!spread && d.stage < 5);
    g.globalCompositeOperation = 'source-over';
    return d.stage >= 5 ? d.canvas : out.canvas;
  }

  // Lay the dissolve's outgoing frame A over the incoming frame B, which
  // compose() has just drawn opaque on ctx, at progress k (0..1). tr.mode
  // (production standard 28: a transition never blends through plum):
  //   'dip'      A -> B x A x max(lum(A), DIP_FLOOR) -> B: a dissolve through
  //              darkness with a floor, so the middle is a deep tone and not
  //              a blink of black. Red over navy or over white sand never
  //              mixes to plum or pink (every pass is a multiply), and a
  //              white moon both shots share stays white;
  //   'multiply' A -> A x B -> B;
  //   'darken'   A -> min(A, B) -> B (each channel takes the darker frame);
  //   default    the linear mix (1 - k) A + k B.
  // Each half of dip/multiply/darken is eased (smoothstep), so the dark middle
  // holds for a moment. With B on ctx: first half (1 - a) A + a op(A, B),
  // second half (1 - b) op(A, B) + b B; op is symmetric (B x E for 'dip').
  blendDissolve(ctx, out, tr, k, i, spread) {
    // Each half is eased: smoothstep, whose flat middle holds the blend for a
    // moment. 'dip' instead falls into the dark bottom late (x^DIP_EASE) and
    // climbs out of it at once (1 - (1 - x)^DIP_EASE), so the darkest frames
    // are a dip of about 0.08 s and not a 0.19 s hold near black.
    const dip = tr.mode === 'dip';
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
    const sm = dip ? (x) => Math.pow(clamp(x), DIP_EASE) : smooth;
    const sm2 = dip ? (x) => 1 - Math.pow(1 - clamp(x), DIP_EASE) : smooth;
    const A = out.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const mode = tr.mode;
    if (mode === 'dip' || mode === 'darken' || mode === 'multiply') {
      const E = mode === 'dip' ? this.darkFrame(out, i, spread) : A;
      const op = mode === 'darken' ? 'darken' : 'multiply';
      const a = sm(2 * k), b = sm2(2 * k - 1);
      if (b <= 0) {
        ctx.globalCompositeOperation = op; ctx.globalAlpha = 1; ctx.drawImage(E, 0, 0);
        if (a < 1) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - a; ctx.drawImage(A, 0, 0); }
      } else if (b < 1) {
        ctx.globalCompositeOperation = op; ctx.globalAlpha = 1 - b; ctx.drawImage(E, 0, 0);
      }
    } else {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - clamp(k); ctx.drawImage(A, 0, 0);
    }
    ctx.restore();
  }

  // Fade the frame toward `color` at strength u (0..1), the colour's own alpha
  // included. A coloured fade is NOT laid over the frame with plain alpha:
  // navy over the burning city mixed to plum (standards 15 and 28). Instead
  // the frame is multiplied by a grey of the fade's own luminance, so red goes
  // red-black, and only the last HUE_FROM of the fade pushes it toward the
  // fade's own hue ('color', as s08's post() does) - by then the frame is dark
  // enough that the mix passes under the plum range instead of through it
  // (any mix of a red frame with a navy one is plum at mid brightness).
  // A grey or black fade skips the hue pass, which would only desaturate the
  // frame on its way down.
  fadeTo(ctx, color, u) {
    const a = clamp(u) * alphaOf(color);
    if (a <= 0) return;
    const W = this.canvas.width, H = this.canvas.height;
    const rgb = rgbOf(color);
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const g = Math.round(255 * (1 - a + a * lum));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(0, 0, W, H);
    const hue = clamp((a - HUE_FROM) / (1 - HUE_FROM));
    if (hue > 0 && Math.max(...rgb) - Math.min(...rgb) > 8) {
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = hue;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Draw the story at global time T and return { i, t, shot }.
  //   opts.title: the title card is up (the reduced-motion hold is skipped, so
  //     it sits on s01's first frame).
  //   opts.wait: do not bake on the spot (the app while scrubbing): if shot
  //     T is not baked yet, queue it, leave the last frame up and return null.
  // stage.syncPrev = false (the app while playing or scrubbing): a dissolve
  // whose outgoing shot is not baked (a seek into it) shows the incoming shot
  // alone instead of baking the old one on the spot.
  render(T, opts = {}) {
    this.titleHold = !!opts.title;
    try { return this.draw(T, !!opts.wait); } finally { this.titleHold = false; }
  }

  draw(T, wait = false) {
    const shots = this.story.shots;
    const i = this.shotAt(T);
    const shot = shots[i];
    this.lastT = T;
    this.pxDrawn = 0;   // plate pixels this frame composites (see compose; folded into framePx below)
    if (i !== this.lastIdx) { this.lastIdx = i; this.prefetch(i); this.noDissolve = -1; }
    const cur = this.ensure(i, !wait);
    if (wait && !cur.ready) return null;
    const t = T - shot.start;
    const heavy = this.frameWork > BUSY_MS || this.framePx > BUSY_PX;
    if (t >= (heavy ? PREFETCH2_BUSY : PREFETCH2_AT)) this.ensure(i + 2);
    const tr = shot.transition;
    const ctx = this.ctx;
    const next = shots[i + 1];
    if (tr && tr.type === 'dissolve' && t < tr.dur && i > 0) {
      // Both shots are composed opaque (the outgoing one into its own canvas,
      // see outgoing()) and then blended (blendDissolve), so overlapping
      // actors and stacked layers never build up opacity.
      const sync = this.syncPrev !== false;
      if (sync) this.noDissolve = -1;
      const pa = this.noDissolve === i ? null : this.ensure(i - 1, sync);
      if (pa && pa.ready) {
        const out = this.outgoing(i - 1, shots[i - 1].dur - 1e-3 + t, T);
        this.compose(i, t, T);
        this.blendDissolve(ctx, out, tr, clamp(t / tr.dur), i - 1, !sync);
      } else {
        this.noDissolve = i;   // for the rest of this dissolve: the old shot never pops in halfway
        this.compose(i, t, T);
      }
    } else {
      this.compose(i, t, T);
      if (next && next.transition?.type === 'dissolve' && shot.dur - t < 1) {
        this.dissolveCanvas('out');
        if (next.transition.mode === 'dip') this.dissolveCanvas('dark');
      } else if (this.diss && !(tr && tr.type === 'dissolve' && t < tr.dur + 0.5)) this.freeDissolve();
    }
    // fades through a colour
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (tr && tr.type === 'fade' && t < tr.dur) this.fadeTo(ctx, tr.color || '#000', 1 - clamp(t / tr.dur));
    const fo = shot.fadeOut;
    if (fo && t > shot.dur - fo.dur) this.fadeTo(ctx, fo.color || '#000', clamp((t - (shot.dur - fo.dur)) / fo.dur));
    ctx.globalAlpha = 1;
    this.framePx = this.framePx * 0.8 + this.pxDrawn * 0.2;
    return { i, t, shot };
  }
}
