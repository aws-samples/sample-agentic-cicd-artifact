// THE FALL OF TROY — illustrated edition. App shell: title, playback clock
// locked to the soundtrack, captions, chapters, transport and end card.

import { Illustrator } from './engine/illustrate.js';
import { Stage, overrideDissolve } from './engine/stage.js';
import { grainTiles } from './engine/grain.js';
import { story, ready, CAPTION_WASH } from './story.js';

await ready;   // every shot module loaded (or replaced by a placeholder)

const $ = (id) => document.getElementById(id);
const body = document.body;
const q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || q.get('reduced') === '1';
const DUR = story.duration;
overrideDissolve(story.shots, q.get('diss'));   // ?diss=dip|multiply|darken|linear (A/B tests only)

{ const g = grainTiles(); $('grain-hi').style.backgroundImage = `url(${g.hi})`; $('grain-lo').style.backgroundImage = `url(${g.lo})`; }

let ill;
try { ill = new Illustrator(); } catch (err) { $('error').hidden = false; $('loading').hidden = true; throw err; }
// ?upload=whole|band|worker forces the guide upload path (A/B tests; default:
// probed, with the readback worker on standby)
// ?preroll=0, ?free=all, ?fbo=0: A/B switches for the pre-roll, the trickled
// frees and the sphere framebuffer reservation (Stage)
const stage = new Stage($('c'), story, ill, { reduced, upload: q.get('upload'), flush: q.has('flush') ? q.get('flush') === '1' : undefined,
  preroll: q.get('preroll') !== '0', spheres: q.get('fbo') !== '0', freePerFrame: q.get('free') === 'all' ? Infinity : undefined,
  rbHold: q.has('rbhold') ? Number(q.get('rbhold')) : undefined });
const audioEl = $('music');

// ------------------------------------------------------------------ music
// The soundtrack plays through Web Audio when it can: the file the <audio>
// element names is fetched and decoded once (during the title card, with an
// OfflineAudioContext, so nothing asks to autoplay), and an
// AudioBufferSourceNode plays it from the story time. The clock is then the
// audio device's own sample clock (AudioContext output timestamp, so output
// latency is compensated), and a seek is instant: a new source at the new
// offset. The AudioContext is created (and resumed) by the first play, which
// is normally the PRESS START gesture. The <audio> element is the fallback:
// no Web Audio, a failed decode, a context that cannot start, or ?audio=element.
// Nothing here depends on the file's name or length: the score plays from
// whatever src index.html gives the element, and the story clock keeps
// running if the file is shorter than the film.
const LEAD = 0.05;          // s: a new source is scheduled this far ahead (the picture holds meanwhile)
const wa = {
  want: !!(window.AudioContext || window.webkitAudioContext) && q.get('audio') !== 'element',
  buf: null, ctx: null, gain: null, src: null,
  t0: 0, when: 0,           // the current source plays story time t0 at context time `when`
  on: false,                // a source is scheduled or playing
  failed: false,
  decided: null,            // 'webaudio' | 'element', latched by the first play (never switched mid-film)
};
const decoded = !wa.want ? Promise.resolve(null) : (async () => {
  try {
    const r = await fetch(audioEl.currentSrc || audioEl.getAttribute('src'));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ab = await r.arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(2, 1, 48000);
    wa.buf = await new Promise((res, rej) => { const pr = oc.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(rej); });
    return wa.buf;
  } catch (err) {
    console.warn('[music] Web Audio unavailable, playing the <audio> element:', err);
    wa.failed = true;
    return null;
  }
})();
// Web Audio plays the music once the buffer is decoded (else the element).
const useWA = () => !wa.failed && (wa.decided ? wa.decided === 'webaudio' : !!wa.buf);

function waContext() {
  if (wa.ctx) return wa.ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    wa.ctx = new AC({ latencyHint: 'playback' });
    wa.gain = wa.ctx.createGain();
    wa.gain.gain.value = userMuted ? 0 : 1;
    wa.gain.connect(wa.ctx.destination);
    // a context that starts late (autoplay without a gesture) or comes back
    // from an interruption joins the picture where it is
    wa.ctx.addEventListener('statechange', () => {
      if (wa.ctx.state === 'running' && clock.mode === 'play' && wa.on) waStart(currentT());
      if (wa.ctx.state === 'closed' && !wa.failed) {
        // the context died: the element takes over where the picture is
        wa.failed = true; wa.on = false;
        if (clock.mode === 'play') { try { audioEl.currentTime = currentT(); } catch { /* not ready */ } audioEl.play().catch(() => {}); }
      }
    });
  } catch (err) { console.warn('[music] no AudioContext:', err); wa.failed = true; }
  return wa.ctx;
}

// (Re)start the music at story time T: a new source, LEAD from now. Each
// source has its own gain that fades in over FADE (and out on stop), so a
// seek, a pause or a scrub never clicks.
const FADE = 0.008;
function waStart(T) {
  const ctx = waContext();
  if (!ctx) return;
  waStop();
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = wa.buf;
  src.connect(g); g.connect(wa.gain);
  const when = ctx.currentTime + LEAD;
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + FADE);
  if (T < wa.buf.duration) src.start(when, Math.max(0, T));
  wa.src = src; wa.srcGain = g; wa.t0 = T; wa.when = when; wa.on = true;
}
function waStop() {
  const src = wa.src, g = wa.srcGain;
  if (src) {
    const ctx = wa.ctx, t = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + FADE);
      src.stop(t + FADE + 0.002);
    } catch { try { src.stop(); } catch { /* not started */ } }
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }
  wa.src = null; wa.srcGain = null; wa.on = false;
}

// Context time of the sample the listener hears now: the output timestamp
// (Chromium, Safari 14.1+) extrapolated to this moment, else currentTime less
// the output and base latency.
function waHeard() {
  const ctx = wa.ctx;
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + Math.min(0.1, Math.max(0, performance.now() - ts.performanceTime) / 1000);
  return ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
}

// The story time the music is at (heard), or null when no music is running.
function musicTime(p) {
  if (!clock.audioOK) return null;
  if (useWA()) {
    if (!wa.on || !wa.ctx || wa.ctx.state !== 'running') return null;
    return wa.t0 + Math.max(0, waHeard() - wa.when);
  }
  if (audioEl.paused || audioEl.ended || audioEl.seeking || audioEl.readyState < 3) return null;
  const a = audioEl.currentTime;
  if (a !== clock.aT) { clock.aT = a; clock.aPerf = p; }
  return clock.aT + Math.min(EXTRAP, p - clock.aPerf);   // smooth the element's coarse updates
}

// ------------------------------------------------------------------ clock
// The music is the master clock while it plays; the picture runs on the
// performance clock and is slewed toward it (at most 5% faster or slower), so
// it never jumps or freezes for a small error and never runs backward. After
// a seek or play the picture holds on the target until the music has really
// moved past it (WebKit's <audio> restarts 65-190 ms after a seek; a Web Audio
// source starts LEAD later). A picture far behind jumps to the music; a little
// ahead, it waits for it; far ahead (a stalled track) it follows the music.
const HOLD_MAX = 0.8;   // s: give up waiting for the music after a seek
const BAND = 0.04;      // s: errors inside this band are slewed away
const SLEW = 1.25;      // rate change per second of error (0.04 s -> 5%)
const EXTRAP = 0.05;    // s: at most this much extrapolation past the element's last update
const clock = {
  mode: 'title',       // title | play | pause | end
  base: 0,             // the story time while not playing (and the seek target)
  aT: -1, aPerf: 0,    // last distinct <audio> time and when we saw it
  audioOK: true,
  hold: false, holdAt: 0,
  prep: false,         // the seek target is not baked: bake it in the next frame, then start the music
  last: 0, lastP: 0,   // the last story time handed out while playing, and when
};
const nowS = () => performance.now() / 1000;

function currentT() {
  if (clock.mode !== 'play') return clock.base;
  const p = nowS();
  const m = musicTime(p);
  if (clock.hold) {
    // release only once the music itself has moved past the target: the
    // element's own currentTime, not its extrapolation, and past its first
    // 30 ms (Chromium's element time crawls for ~45 ms after a seek); a Web
    // Audio source runs at full speed from its first sample
    // (and no further than it could have played since the seek: a larger
    // value is the element's stale pre-seek position)
    const raw = m === null ? null : useWA() ? m : audioEl.currentTime;
    if (raw !== null && raw > clock.base + (useWA() ? 0.005 : 0.03) && raw < clock.base + (p - clock.holdAt) + 0.15) {
      clock.hold = false; clock.last = Math.max(clock.base, raw); clock.lastP = p;
      return clock.last;
    }
    if (!clock.audioOK || p - clock.holdAt > HOLD_MAX) { clock.hold = false; clock.last = clock.base; clock.lastP = p; }   // no music: run on the performance clock
    else return clock.base;
  }
  const dt = Math.max(0, p - clock.lastP);
  let T = clock.last + dt, back = false;
  if (m !== null) {
    const err = m - T;                                     // > 0: the music is ahead
    if (err > BAND) T = m;                                 // well behind: catch up at once
    else if (err < -0.3) { T = m; back = true; }           // far ahead (a stalled track): follow the music
    else if (err < -BAND) T = clock.last;                  // a little ahead: wait for the music, never rewind
    else T = clock.last + dt * (1 + Math.max(-BAND, Math.min(BAND, err)) * SLEW);
  }
  T = Math.max(0, Math.min(DUR, T));
  if (!back) T = Math.max(clock.last, T);
  clock.last = T; clock.lastP = p;
  return T;
}

// Move the story clock (and the music) to T. While playing (or about to
// play) the picture then holds on T until the music runs from it.
function setT(T, hold = clock.mode === 'play') {
  T = Math.max(0, Math.min(DUR - 0.01, T));
  clock.base = T; clock.aT = -1; clock.last = T; clock.lastP = nowS();
  clock.hold = hold && clock.audioOK; clock.holdAt = nowS();
  if (useWA()) { if (wa.on) waStart(T); }
  else { try { if (Math.abs(audioEl.currentTime - T) > 0.03) audioEl.currentTime = T; } catch { /* metadata not ready */ } }
  return T;
}

function playAudio() {
  if (!clock.audioOK) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* Safari 16.4+ only */ }
  wa.decided ??= useWA() ? 'webaudio' : 'element';
  if (useWA()) {
    audioEl.pause();
    const ctx = waContext();
    if (ctx) {
      waStart(clock.base);
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        // without a gesture (?auto=1, tools) the context may stay suspended:
        // the picture runs on, and the first touch starts the music there
        const unlock = () => { removeEventListener('pointerdown', unlock); ctx.resume().catch(() => {}); };
        addEventListener('pointerdown', unlock);
      }
      return;
    }
  }
  const pr = audioEl.play();
  if (pr && pr.catch) pr.catch(() => {
    // Autoplay without a gesture (?auto=1): play muted, unmute on first touch.
    audioEl.muted = true;
    audioEl.play().catch(() => { clock.audioOK = false; });
    const unlock = () => { if (!userMuted) audioEl.muted = false; audioEl.play().catch(() => {}); removeEventListener('pointerdown', unlock); };
    addEventListener('pointerdown', unlock, { once: true });
  });
}
// Stop the music. A stopped context is also suspended (after the fade), so a
// paused or finished film keeps no audio stream open; play() resumes it (the
// page keeps its user activation, so no new gesture is needed).
function stopAudio() {
  waStop(); audioEl.pause();
  if (wa.ctx) setTimeout(() => { if (!wa.on && wa.ctx.state === 'running') wa.ctx.suspend().catch(() => {}); }, 60);
}
function setMuted(m) { audioEl.muted = m; if (wa.gain) wa.gain.gain.value = m ? 0 : 1; }

// What tools see as the music (tools/verify.mjs and the review probes read
// troy.audio like the element: currentTime, paused, readyState, seeking...).
const audio = {
  get path() { return useWA() ? 'webaudio' : 'element'; },
  get currentTime() { if (useWA()) return wa.on && wa.ctx ? Math.max(0, wa.t0 + Math.max(0, waHeard() - wa.when)) : clock.base; return audioEl.currentTime; },
  get paused() { return useWA() ? !(wa.on && wa.ctx && wa.ctx.state === 'running') : audioEl.paused; },
  get muted() { return userMuted || (!useWA() && audioEl.muted); },
  get readyState() { return useWA() ? 4 : audioEl.readyState; },
  get seeking() { return useWA() ? false : audioEl.seeking; },
  get ended() { return useWA() ? false : audioEl.ended; },
  get duration() { return useWA() ? wa.buf.duration : audioEl.duration; },
  get state() { return wa.ctx ? wa.ctx.state : 'none'; },
  element: audioEl,
  // tools: the RMS level of the Web Audio output now (0..1; null on the
  // element path), from an analyser tapped after the mute gain
  level() {
    if (!useWA() || !wa.ctx) return null;
    if (!wa.an) { wa.an = wa.ctx.createAnalyser(); wa.an.fftSize = 2048; wa.gain.connect(wa.an); wa.anBuf = new Float32Array(wa.an.fftSize); }
    wa.an.getFloatTimeDomainData(wa.anBuf);
    let e = 0; for (const v of wa.anBuf) e += v * v;
    return Math.sqrt(e / wa.anBuf.length);
  },
};

let userMuted = false;

// A seek into a shot that is not baked yet (a chapter, the scrubber, a key,
// WATCH AGAIN) bakes it before the music starts: the picture holds on the
// target frame, then picture and music start together. (WebKit bakes a shot
// in 150-460 ms; with the music already running, the picture froze and then
// jumped ahead to it.) The outgoing shot of a dissolve the target lies in is
// baked too, and the next shot when its cut is within PREP_SYNC s, so the cut
// does not bake on the spot either.
// Only a cut this close is baked synchronously with the target shot: the
// background queue bakes a whole shot comfortably in 0.6 s (0 synchronous
// bakes in five full films), so a cut further away is only QUEUED, and the
// music starts with the picture instead of after it. In WebKit a seek to
// 34.4 used to spend 184 of its 289 ms baking s08, whose cut was 1.47 s away.
const PREP_SYNC = 0.6;
function unprepared(T) {
  const i = stage.shotAt(T), shot = story.shots[i], t = T - shot.start, tr = shot.transition;
  if (!stage.ready(i)) return true;
  if (tr && tr.type === 'dissolve' && t < tr.dur && i > 0 && !stage.ready(i - 1)) return true;
  const nx = story.shots[i + 1];
  return !!(nx && nx.start - T < PREP_SYNC && !stage.ready(i + 1));
}
function prepare(T) {
  const i = stage.shotAt(T), shot = story.shots[i], t = T - shot.start, tr = shot.transition;
  stage.ensure(i, true);
  if (tr && tr.type === 'dissolve' && t < tr.dur && i > 0) stage.ensure(i - 1, true);
  const nx = story.shots[i + 1];
  if (nx) stage.ensure(i + 1, nx.start - T < PREP_SYNC);   // queued in the background unless its cut is upon us
}
// Start the music now, or (target not baked) after the next frame has baked it.
function startMusic(T) {
  if (unprepared(T)) { clock.prep = true; waStop(); audioEl.pause(); }
  else { clock.prep = false; playAudio(); }
}

function play(fromT) {
  const T = setT(fromT !== undefined ? fromT : clock.base, true);
  clock.mode = 'play';
  body.classList.add('playing'); body.classList.remove('ended', 'paused');
  $('end').hidden = true; unwarmEnd(); $('controls').hidden = false;
  $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Pause');
  washes();
  startMusic(T);
  poke();
}

function pause() {
  if (clock.mode !== 'play') return;
  clock.base = currentT(); clock.mode = 'pause'; clock.hold = false; clock.prep = false;
  stopAudio();
  body.classList.add('paused'); body.classList.remove('idle');
  $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play');
  followCaption();
}

// The end card's first frame used to cost 28-30 ms in WebKit: the card's
// layout, its radial gradient and the focus all landed in the frame that also
// drew the film's last picture. Show the card a few frames early, transparent
// and inert (`#end.warm`), so that work is done before the last frame, and
// then only drop the class (which starts the 1.4 s fade-in).
function warmEnd() {
  const el = $('end');
  if (!el.hidden) return;
  el.classList.add('warm');
  // invisible AND out of the way: no focus stop and nothing for a screen
  // reader until the card is really up
  el.setAttribute('aria-hidden', 'true');
  try { el.inert = true; } catch { /* older engines: aria-hidden only */ }
  el.hidden = false;
}
function unwarmEnd() {
  const el = $('end');
  el.classList.remove('warm');
  el.removeAttribute('aria-hidden');
  try { el.inert = false; } catch { /* as above */ }
}
const END_WARM = 3.0;    // s before the end the card is laid out behind opacity 0 (s12's cut:
                         // early in the shot, where the frames have slack, not next to its fade)

function end() {
  clock.base = DUR; clock.mode = 'end'; clock.hold = false;
  stopAudio();
  body.classList.remove('playing', 'paused', 'idle'); body.classList.add('ended');
  $('end').hidden = false; unwarmEnd(); $('controls').hidden = true;
  setCaption('', '', '');
  washes();
  $('again').focus({ preventScroll: true });
}

function toggle() { if (clock.mode === 'play') pause(); else if (clock.mode === 'end' || clock.mode === 'title') play(0); else play(); }

// Leave the title or end card for a paused frame (scrubber, deep links,
// tools): the same UI as a user pause, so the frame never shows half a title.
function enterPause() {
  clock.mode = 'pause'; clock.hold = false;
  stopAudio();
  body.classList.add('playing', 'paused'); body.classList.remove('ended', 'idle');
  $('end').hidden = true; unwarmEnd(); $('controls').hidden = false;
  $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play');
  followCaption();
}

// ------------------------------------------------------------------ captions
// A new caption (or the same caption moving between bottom and top) fades the
// old one out quickly, swaps text and position while it is invisible, then
// fades in: a crossfade, never a slide across the frame. When only the
// subcaption changes (s01 -> s02 keeps 'BEWARE GEEKS BEARING GIFTS'), the
// caption stays and only the subcaption crossfades.
const capBox = $('caption-box'), capEl = $('caption'), subEl = $('subcap'), chapEl = $('chapter');
// The chapter kicker is two elements: the numeral keeps the salmon accent and
// the title is ivory, both with the caption's ink contour (style.css #chapter),
// because at 10.5 px a pale salmon line with a 0.8 px contour disappeared on
// lit plates (measured 1.2-1.6:1 against the plate in 5 of 12 shots).
const chapNum = document.createElement('b'), chapTitle = document.createElement('span');
chapEl.append(chapNum, chapTitle);
let chapShown = '\u0000';
function setKicker(text) {
  if (text === chapShown) return;   // called every frame while the caption holds
  chapShown = text;
  const i = text.indexOf(' \u00b7 ');
  chapNum.textContent = i > 0 ? text.slice(0, i) : text;
  chapTitle.textContent = i > 0 ? text.slice(i) : '';
  chapEl.classList.toggle('off', !text);   // no kicker: out of the layout (style.css), as :empty did
}
const shade = { bottom: $('shade'), top: $('shade-top') };
let capKey = '', capTimer = 0, subTimer = 0, capPos = 'bottom';
let shown = { text: '', sub: '', pos: 'bottom' };   // what the DOM shows (or is fading in)
let shadeK = -1;                                      // wash strength (0.3 night sky .. WASH_MAX sunlit stone); -1 = not set yet
// Production standard 30: the wash never veils the plate. Its strength is
// capped (CAPTION_WASH, the live measure and the default alike); the bed
// behind the words (--ck) reaches its full strength at the cap.
const WASH_MIN = 0.3, WASH_MAX = 0.7, BED_MAX = 0.62;
const washCap = (k) => Math.max(WASH_MIN, Math.min(WASH_MAX, k));
// a line may end on a separator dot but never start with one
const keep = (x) => (x || '').replace(/ · /g, '\u00a0· ');

function setCaption(text, chapter, sub, pos = capPos) {
  const key = `${text}|${sub}|${pos}`;
  if (key === capKey) { setKicker(text ? chapter : ''); return; }
  capKey = key;
  clearTimeout(capTimer); clearTimeout(subTimer);
  if (text) $('narration').textContent = (sub ? `${text}. ${sub}` : text).toLowerCase();
  const same = text && text === shown.text && pos === shown.pos && capBox.classList.contains('show');
  // A top caption grows downward, so a new subcaption never moves it; at the
  // bottom it would push the caption up, so that only swaps between two subs.
  if (same && (pos === 'top' || (sub && shown.sub))) {
    setKicker(chapter);
    subEl.classList.add('swap');
    subTimer = setTimeout(() => {
      subEl.textContent = keep(sub); shown.sub = sub;
      void subEl.offsetWidth;                   // start the fade from opacity 0 (it may have been display:none)
      requestAnimationFrame(() => { subEl.classList.remove('swap'); haloSize(); });
    }, shown.sub ? 240 : 0);   // fade the old subcaption out first
    return;
  }
  capBox.classList.remove('show');
  subEl.classList.remove('swap');
  capTimer = setTimeout(() => {
    capEl.textContent = keep(text); subEl.textContent = keep(sub); setKicker(text ? chapter : '');
    shown = { text, sub, pos };
    capPos = pos;
    body.classList.toggle('cap-top', pos === 'top');
    if (text) { capBox.classList.add('show'); haloSize(); followCaption(); }
    washes();
  }, text ? 260 : 0);
}

// Wash opacity: on behind a showing caption, at its position only; off on
// the title screen and on the end card (the card carries its own ink pass,
// and the wash now hugs the line of words, which the card has none of).
function washes() {
  const on = (clock.mode === 'play' || clock.mode === 'pause') && !!capEl.textContent;
  const k = on ? washCap(shadeK) : 0;
  shade.bottom.style.opacity = String(capPos === 'bottom' ? k : 0);
  shade.top.style.opacity = String(capPos === 'top' ? k : 0);
}

// The halo behind the words and the horizontal extent of the wash, sized to
// the text block (a layout read, no canvas read).
const capRange = document.createRange();
// The extent of the words themselves (chapter, caption and subcaption lines),
// not of the full-width boxes that hold them.
function capRect() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of [chapEl, capEl, subEl]) {
    if (!el.textContent) continue;
    capRange.selectNodeContents(el);
    const r = capRange.getBoundingClientRect();
    if (!r.width) continue;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  return x1 > x0 ? { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 } : { width: 0, height: 0 };
}
function haloSize() {
  if (!capEl.textContent) return null;
  const r = capRect();
  if (!r.width || !r.height) return null;
  const root = document.documentElement.style;
  // --capw: the width of the words (the wash's mask hugs them, standard 30).
  // --cap0 / --cap1: the near and far edge of the line of words, as distances
  // from the frame edge the wash is anchored to, so its darkest stop sits on
  // the words themselves instead of on the frame edge (which the plates keep
  // bright). The wash fades to nothing within ~7vh past --cap1.
  const H = window.innerHeight || stage.H;
  const near = capPos === 'top' ? r.top : H - r.bottom;
  const far = capPos === 'top' ? r.bottom : H - r.top;
  root.setProperty('--capw', `${Math.round(r.width)}px`);
  root.setProperty('--cap0', `${Math.max(0, Math.round(near))}px`);
  root.setProperty('--cap1', `${Math.max(0, Math.round(far))}px`);
  return r;
}

// The caption box slides 0.5 s when the transport appears or hides (and when
// a shot moves its caption), and the wash hugs the line of words, so it has to
// follow: keep updating --cap0 / --cap1 while the box is moving (at most
// FOLLOW s, and only while it moves - a layout read every frame otherwise).
const FOLLOW = 0.75;
let followUntil = 0, followAt = -1, following = false;
function followCaption() {
  followUntil = performance.now() + FOLLOW * 1000;
  if (following) return;
  following = true;
  const step = () => {
    if (!capEl.textContent || !capBox.classList.contains('show')) { following = false; followAt = -1; return; }
    const top = capBox.getBoundingClientRect().top;
    if (top !== followAt) { followAt = top; haloSize(); }
    if (performance.now() < followUntil) requestAnimationFrame(step);
    else following = false;
  };
  requestAnimationFrame(step);
}

// The wash strength above which the plate behind the words counts as bright,
// so the letters take the heavier ink keyline (style.css .on-light).
const LIGHT_K = 0.66;
function applyWash(k) {
  k = washCap(k);
  capBox.classList.toggle('on-light', k >= LIGHT_K);
  if (Math.abs(k - shadeK) < 0.03) return;
  shadeK = k;
  capBox.style.setProperty('--ck', ((Math.max(0, k - WASH_MIN) / (WASH_MAX - WASH_MIN)) * BED_MAX).toFixed(3));
  haloSize();
  washes();
}

// Wash strength for a caption at shot-local time t. Playback never reads the
// canvas back (a readback waits for the GPU: up to 350 ms frames under load):
// it uses CAPTION_WASH (story.js, measured offline by tools/washes.mjs). While
// paused, the plate behind the words is measured live once per position.
let live = { key: '', t: -1, k: 0 };   // the last live measurement
let capNow = { key: '', t: 0, night: false };
const washKey = (shot, text, pos) => `${shot.id}|${text}|${pos}|${stage.portrait ? 'p' : 'l'}`;
function washFor(key, t, night) {
  if (live.key === key && Math.abs(live.t - t) < 0.05) return live.k;
  const tab = CAPTION_WASH[key];
  if (tab && tab.length) {
    if (t <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      const [t1, k1] = tab[i];
      if (t <= t1) { const [t0, k0] = tab[i - 1]; return k0 + ((k1 - k0) * (t - t0)) / Math.max(1e-6, t1 - t0); }
    }
    return tab[tab.length - 1][1];
  }
  if (live.key === key) return live.k;
  return night ? 0.45 : 0.8;
}

// Measure the plate behind the caption: a tiny readback of the canvas. Only
// while paused (and by tools/washes.mjs), never during playback.
// The plate behind the words is measured in CELLS equal columns and the
// brightest column sets the strength: a sunlit pier under a few letters
// (s03) needs the wash as much as a plate that is bright all the way across,
// and a dark majority beside it must not average it away.
const CELLS = 5;
const probe = document.createElement('canvas');
probe.width = 60; probe.height = 12;
const pctx = probe.getContext('2d', { willReadFrequently: true });
function measurePlate() {
  if (!capEl.textContent) return null;
  const r = capRect();
  if (!r.width || !r.height) return null;
  const cv = stage.canvas, sc = cv.width / Math.max(1, cv.clientWidth);
  const x0 = Math.max(0, (r.left - 20) * sc), y0 = Math.max(0, (r.top - 8) * sc);
  const x1 = Math.min(cv.width, (r.right + 20) * sc), y1 = Math.min(cv.height, (r.bottom + 8) * sc);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  pctx.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, probe.width, probe.height);
  const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
  // relative luminance (gamma-encoded): cobalt sky ~0.3, night sky ~0.07, ivory stone ~0.8
  const brightness = (lum) => {
    lum.sort((a, b) => a - b);
    return 0.6 * lum[Math.floor(lum.length * 0.85)] + 0.4 * lum[Math.floor(lum.length * 0.5)];
  };
  const cells = Array.from({ length: CELLS }, () => []), cw = probe.width / CELLS;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % probe.width;
    cells[Math.min(CELLS - 1, Math.floor(x / cw))].push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
  }
  const b = Math.max(...cells.map(brightness));
  return { b, k: washCap(0.3 + (b - 0.18) * 1.6) };
}

function chapterAt(T) { let c = story.chapters[0]; for (const ch of story.chapters) if (T >= ch.t - 1e-3) c = ch; return c; }

// ------------------------------------------------------------------ chapters + transport
const chapNav = $('chapters');
for (const ch of story.chapters) {
  const b = document.createElement('button');
  // Built with DOM nodes and textContent, never innerHTML, so the chapter
  // data cannot become markup even if it stops being a static list.
  b.type = 'button';
  const num = document.createElement('b'); num.textContent = String(ch.n);
  const name = document.createElement('span'); name.textContent = ch.title;
  b.append(num, name);
  b.setAttribute('aria-label', `Chapter ${ch.n}: ${ch.title.toLowerCase()}`);
  b.addEventListener('click', () => { play(ch.t + 0.001); });
  chapNav.appendChild(b);
}
const seek = $('seek');
seek.max = String(DUR);
let scrubbing = false;
seek.addEventListener('input', () => { scrubbing = true; const T = setT(Number(seek.value)); if (clock.mode === 'title' || clock.mode === 'end') enterPause(); render(T); });
seek.addEventListener('change', () => { scrubbing = false; if (clock.mode === 'play') startMusic(setT(Number(seek.value), true)); });
$('play').addEventListener('click', toggle);
$('restart').addEventListener('click', () => play(0));
$('again').addEventListener('click', () => play(0));
$('start').addEventListener('click', () => play(0));
$('sound').addEventListener('click', () => {
  userMuted = !userMuted; setMuted(userMuted);
  $('sound').textContent = userMuted ? 'SOUND OFF' : 'SOUND ON';
  $('sound').setAttribute('aria-pressed', String(userMuted));
  $('sound').setAttribute('aria-label', userMuted ? 'Unmute' : 'Mute');
});
$('fs').addEventListener('click', () => {
  const el = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
});

addEventListener('keydown', (ev) => {
  if (ev.target.closest && ev.target.closest('input')) return;
  const k = ev.key;
  if (k === ' ' || k === 'k') { ev.preventDefault(); toggle(); }
  else if (k === 'ArrowRight' || k === 'ArrowLeft') {
    ev.preventDefault();
    const T = currentT(); const cs = story.chapters;
    let i = cs.findIndex((c) => c === chapterAt(T));
    i = k === 'ArrowRight' ? Math.min(cs.length - 1, i + 1) : (T - cs[i].t > 1.5 ? i : Math.max(0, i - 1));
    play(cs[i].t + 0.001);
  } else if (k === 'm') $('sound').click();
  else if (k === 'f') $('fs').click();
  else if (k === 'Home') play(0);
  poke();
});

// auto-hide chrome while playing
let idleTimer = 0;
function poke() {
  body.classList.remove('idle');
  followCaption();   // the transport appearing slides the caption (and its wash)
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (clock.mode === 'play') { body.classList.add('idle'); followCaption(); } }, 2600);
}
addEventListener('pointermove', poke, { passive: true });
addEventListener('pointerdown', poke, { passive: true });

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
audioEl.addEventListener('error', () => { if (!useWA()) clock.audioOK = false; });

let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (stage.resize()) { render(currentT()); haloSize(); followCaption(); } }, 160); });

// ------------------------------------------------------------------ frame loop
let lastShot = -1;
function ui(T, r) {
  if (clock.mode === 'play' || clock.mode === 'pause') {
    const shot = r.shot;
    let text = shot.caption || '', sub = shot.subcaption || '';
    if (shot.captions) for (const c of shot.captions) if (r.t >= c.t) { text = c.text ?? text; sub = c.sub ?? sub; }
    const ch = chapterAt(T);
    const pos = captionPos(shot);
    setCaption(text, `${ch.n} · ${ch.title}`, sub, pos);
    if (text) {
      capNow = { key: washKey(shot, text, pos), t: r.t, night: !!shot.night };
      applyWash(washFor(capNow.key, r.t, capNow.night));
    }
    if (!scrubbing) { seek.value = String(T.toFixed(2)); }
    seek.style.setProperty('--p', `${(T / DUR) * 100}%`);
    const f = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    $('clock').textContent = `${f(T)} / ${f(DUR)}`;
    const cur = chapterAt(T);
    [...chapNav.children].forEach((b, i) => b.setAttribute('aria-current', String(story.chapters[i] === cur)));
  }
  if (r.i !== lastShot) { lastShot = r.i; body.dataset.shot = r.shot.id; }
}

function captionPos(shot) {
  const p = (stage.portrait && shot.captionPosPortrait) ? shot.captionPosPortrait : shot.captionPos;
  return p === 'top' ? 'top' : 'bottom';
}

function render(T) {
  const title = clock.mode === 'title';
  // a dissolve's outgoing shot is baked on the spot only while nothing moves
  stage.syncPrev = clock.mode !== 'play' && !scrubbing;
  // the title card always sits on s01's first frame (open sky), also under
  // reduced motion, whose held framing (reducedT) is for playback
  // while scrubbing, a shot that is not baked yet bakes in the background
  // (the last frame stays up) instead of stalling the drag
  const r = stage.render(title ? 0 : Math.min(T, DUR - 0.001), { title, wait: scrubbing && !title });
  if (r) ui(T, r);
  return r;
}

// perf: per frame, the JS work (ms), the story time, the interval between
// frame() starts (performance.now(), ms) and the rAF-timestamp interval (ms).
// The callback-start interval is the one that shows a late frame: Chromium
// does not re-stamp a frame that starts late, so rAF timestamps hide it.
const perf = { last: 0, lastW: 0, d: [], err: '', frameMs: 16.7, work: 0 };   // frameMs: the display's frame interval (EMA); work: render ms (EMA)
let idleT = -1, idleAt = 0, measured = false;
// The band upload path with main-thread readbacks bakes before it draws: a
// guide band's readback waits for everything already queued in the GPU
// process, so after render() it would wait for this frame's own drawing.
// Otherwise (Chromium; WebKit's worker readback) the frame draws first, so its
// GPU work is queued ahead of the bake's.
// (On WebKit the readbacks run in a worker by default, so this applies only
// until the worker has started, or with ?upload=band.)
const bakeFirst = () => (q.has('bakefirst') ? q.get('bakefirst') === '1' : stage.baker.upload === 'band' && stage.baker.readback === 'main');
// After a late frame (the GPU is behind) only urgent background work runs, so
// the GPU (WebKit's GPU process) can catch up (?late=0 turns this off).
const lateRule = q.get('late') !== '0';
const LATE_GAP = 22;   // ms between frame starts that counts as a late frame (at 60 Hz; it scales with the display)
const PX_RATE = Number(q.get('pxrate')) || 0.35e6;   // band path: bake pixels per frame on average (?pxrate= for A/B)
function bakeWork(w0, playing, gap) {
  // background baking: up to 4 ms while playing (the stage paces it over the
  // time until each coming shot is needed, and raises it near a deadline; one
  // larger unit may use the frame's slack up to 12 ms), more while nothing
  // moves; while playing, also cap the pixels the GPU draws and shades for
  // bakes per frame
  // (the budget and the frame's deadline scale with the display's frame
  // interval: 4 and 12 ms at 60 Hz, 2.75 and 6 ms at 120 Hz)
  const fm = perf.frameMs;
  const bake = measured ? 0.5 : playing ? Math.min(4, 0.24 * fm) : 12;
  // (fewer on the band path, WebKit, where the GPU process draws canvases on
  // the CPU: at most PX_RATE a frame on average, see Baker.work's pxRate)
  const band = stage.baker.upload === 'band';
  const maxPx = playing ? (band ? 2e6 : 3e6) * Math.min(1, fm / 16.7) : 0;
  stage.work(bake, { frameEnd: w0 + (playing ? Math.min(12, 0.72 * fm) : scrubbing ? 24 : 40), idle: !playing, maxPx, work: perf.work,
    pxRate: playing && band ? PX_RATE * Math.min(1, fm / 16.7) : 0, late: lateRule && playing && gap > (LATE_GAP * fm) / 16.7 });
}
function frame(now) {
  requestAnimationFrame(frame);   // first, so one bad frame cannot stop the loop
  const w0 = performance.now();
  const gap = perf.lastW ? w0 - perf.lastW : 0, gapTs = perf.last ? now - perf.last : 0;
  perf.lastW = w0; perf.last = now;
  if (gapTs > 5 && gapTs < 30) perf.frameMs = perf.frameMs * 0.98 + gapTs * 0.02;
  try {
    const T = currentT();
    if (clock.mode === 'play' && T >= DUR - END_WARM) warmEnd();   // lay the end card out before the last frame
    if (clock.mode === 'play' && T >= DUR - 0.03) end();
    const shownT = clock.mode === 'end' ? DUR : T;
    const playing = clock.mode === 'play' && !scrubbing;
    // a seek into a shot that is not baked: bake it now, then start the music (startMusic)
    if (clock.prep && clock.mode === 'play') {
      clock.prep = false;
      prepare(clock.base);
      clock.holdAt = nowS(); clock.last = clock.base; clock.lastP = nowS();
      playAudio();
    }
    const bf = bakeFirst();
    if (bf) bakeWork(w0, playing, gap);
    const r0 = performance.now();
    render(shownT);
    // the shot's own cost per frame (EMA): the stage holds back the shot two
    // ahead and the band readbacks while it is high (engine/stage.js BUSY_MS)
    perf.work = perf.work * 0.9 + (performance.now() - r0) * 0.1;
    // paused on a caption: measure the plate behind it once the frame holds still
    measured = false;
    if (clock.mode === 'pause' && capBox.classList.contains('show') && capNow.key) {
      if (shownT !== idleT) { idleT = shownT; idleAt = now + 250; }
      else if (idleAt && now >= idleAt) {
        idleAt = 0;
        const m = measurePlate();
        if (m) { live = { key: capNow.key, t: capNow.t, k: m.k, b: m.b }; applyWash(m.k); measured = true; }
      }
    } else idleT = -1;
    if (!bf) bakeWork(w0, playing, gap);
    perf.d.push([performance.now() - w0, shownT, gap, gapTs]); if (perf.d.length > 20000) perf.d.shift();
  } catch (err) {
    const m = String(err && err.stack || err);
    if (m !== perf.err) { perf.err = m; console.error(err); }
  }
}

// ------------------------------------------------------------------ boot
await Promise.all([document.fonts.load('40px Cormorant'), document.fonts.load('12px "DM Sans"')]).catch(() => {});
stage.ensure(0, true);
render(0);
requestAnimationFrame(frame);   // background baking runs while the music decodes
// PRESS START waits for the decoded soundtrack (Web Audio), at most 5 s: after
// that the first play uses the <audio> element for the whole film
await Promise.race([decoded, new Promise((r) => setTimeout(r, 5000))]);
body.classList.add('ready');
$('start').disabled = false;
$('loading').textContent = '';

const pct = (a, p) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(2) : 0);
const label = (x, v) => `${v.toFixed(0)}ms@T${x[1].toFixed(2)}`;
window.troy = {
  stage, story, audio,
  state: () => ({ mode: clock.mode, T: currentT(), shot: stage.story.shots[stage.shotAt(currentT())].id, audio: { paused: audio.paused, muted: audio.muted, t: audio.currentTime, ready: audio.readyState, path: audio.path, ctx: audio.state }, queue: stage.baker.queue.length }),
  // Frame stats since resetPerf(). work = JS per frame (render + bake), the
  // old top-level fields; interval = time between frame() starts
  // (performance.now()), which shows late and dropped frames; rafTs = the same
  // from rAF timestamps (Chromium does not re-stamp a late frame, so it hides
  // long main-thread frames). long lists use 16.7 ms; over20 counts dropped frames.
  perf: () => {
    const rows = perf.d.slice(3);
    const W = rows.map((x) => x[0]).sort((a, b) => a - b);
    const iv = (k) => {
      const G = rows.filter((x) => x[k] > 0).map((x) => x[k]).sort((a, b) => a - b);
      return {
        p50: pct(G, 0.5), p90: pct(G, 0.9), p99: pct(G, 0.99), max: pct(G, 1),
        over20: G.filter((g) => g > 20).length, over25: G.filter((g) => g > 25).length,
        long: rows.filter((x) => x[k] > 20).map((x) => label(x, x[k])).slice(0, 500),
      };
    };
    return {
      frames: rows.length, p50: pct(W, 0.5), p90: pct(W, 0.9), p99: pct(W, 0.99), max: pct(W, 1),
      long: rows.filter((x) => x[0] > 16.7).map((x) => label(x, x[0])).slice(0, 500),
      interval: iv(2), rafTs: iv(3),
    };
  },
  resetPerf: () => { perf.d.length = 0; perf.last = 0; perf.lastW = 0; },
  play, pause, seek: (T) => { const t = setT(T); if (clock.mode === 'title' || clock.mode === 'end') enterPause(); render(t); return t; },
  // Tools: show the chrome of a playback state on the current (frozen) frame.
  //   'idle' = playing with the chrome hidden, 'controls' = playing with the
  //   pointer moved, 'paused' = a user pause.
  ui: (state = 'idle') => {
    if (clock.mode === 'title' || clock.mode === 'end') enterPause();
    if (clock.mode === 'play') pause();
    $('controls').hidden = false;
    body.classList.toggle('paused', state === 'paused');
    body.classList.toggle('idle', state === 'idle');
    $('play').textContent = state === 'paused' ? '▶' : '❚❚';
    followCaption();
    return state;
  },
  bakeLog: () => stage.baker.log.slice(),
  // tools/washes.mjs: the caption on screen, its wash key and a live
  // measurement of the plate behind it ({ key, t, b, k }); also what playback
  // would use now (table).
  washProbe: () => {
    haloSize();
    const m = measurePlate();
    return { key: capNow.key, t: +capNow.t.toFixed(3), table: +washFor(capNow.key, capNow.t, capNow.night).toFixed(3), ...(m ? { b: +m.b.toFixed(3), k: +m.k.toFixed(3) } : {}) };
  },
};

if (q.has('T')) { window.troy.seek(Number(q.get('T'))); pause(); }
if (q.get('auto') === '1') setTimeout(() => play(0), 700);
