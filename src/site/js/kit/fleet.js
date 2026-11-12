// Greek galleys, drawn per frame (plates 1 and 3): long low dark hulls with a
// ram and a curling stern, a billowed linen sail quilted with seams, banks of
// oars, shields along the rail and white wakes. Level of detail follows the
// on-screen size so a fleet of 30 costs little; the far LOD keeps the near
// LOD's sail and mast geometry, so ships never jump in size at the switch.
// o.stern draws the ship seen from astern (plate 1): broad stern, aplustre in
// the middle, oars fanned out on both sides, the sail square to the viewer.
// Every alpha change is relative to the incoming ctx.globalAlpha, so ships
// fade with the stage's dissolves.

const TAU = Math.PI * 2;

function cols(e) {
  return e.night
    // shields: dark bronze tones that sit with the hull (plate 1's galleys carry no
    // colour dots); one in five is vermilion
    ? { hull: '#020208', hullHi: '#3a3a4c', sail: '#d4d8e6', sailShade: '#8f97b4', seam: '#6e7898', oar: '#050510', wake: '#c5cde8', shield: ['#2c2826', '#544a3e', '#7f1a13', '#3e362d', '#1f1c1a'], crew: '#0a0a14', eye: '#d4d8e6' }
    : { hull: '#15120f', hullHi: '#6b5c49', sail: '#f5f1e7', sailShade: '#c4bdae', seam: '#8f887a', oar: '#1a1612', wake: '#f7f6f1', shield: ['#2a2016', '#4f3f2a', '#a8231a', '#3b2f20', '#5e4c33'], crew: '#191512', eye: '#f2ece0' };
}

const bez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * c;

// Which half of a sail is in shade: away from the light (o.light: -1 light from
// the left, +1 from the right; default: the day sun at upper left, the night
// moon at upper right - production standard 11).
const shadeSide = (e, o) => (o.light ? -Math.sign(o.light) : (e.night ? -1 : 1));

// Sail hung from the yard at `top`: half-width sw, height sh, both side edges
// bowed sideways by `belly` (signed), the foot sagging; the half on shadeDir
// (+1 right, -1 left) is in shade; seams quilt it into billowed panels.
function sail(ctx, e, c, px, s, mx, top, sw, sh, belly, shadeDir) {
  ctx.fillStyle = c.sail;
  ctx.beginPath();
  ctx.moveTo(mx - sw, top); ctx.lineTo(mx + sw, top);
  ctx.quadraticCurveTo(mx + sw + belly, top + sh * 0.55, mx + sw * 0.94, top + sh);
  ctx.quadraticCurveTo(mx + belly * 0.3, top + sh + 6 * s, mx - sw * 0.94, top + sh);
  ctx.quadraticCurveTo(mx - sw + belly, top + sh * 0.55, mx - sw, top);
  ctx.fill();
  const k = shadeDir;
  ctx.fillStyle = c.sailShade;
  ctx.beginPath();
  ctx.moveTo(mx + k * sw * 0.35, top); ctx.lineTo(mx + k * sw, top);
  ctx.quadraticCurveTo(mx + k * sw + belly, top + sh * 0.55, mx + k * sw * 0.94, top + sh);
  ctx.quadraticCurveTo(mx + k * sw * 0.62 + belly * 0.1, top + sh + 2.2 * s, mx + k * sw * 0.3, top + sh + 2.7 * s);
  ctx.closePath(); ctx.fill();
  if (px > 45) { // seams: a NET of thin lines on flat cloth, as plate 3's near sails carry
    // (round 5 filled a crescent of shadow under each panel, which printed as fish scales:
    // the sail interior measured flat+soft 0.70 / mid+crisp 0.30 against the plate's 0.14 / 0.86)
    // plate 3's sails read as PANEL seams (the verticals) with a few cross seams, at a
    // roughly constant SCREEN pitch (the plate's 80-px sail carries about 10 verticals),
    // so a near sail is finely panelled cloth instead of a few wide fields
    const cells = Math.max(4, Math.min(22, Math.round(px / 13)));
    const rows = Math.max(2, Math.min(8, Math.round(px / 42)));
    const xAt = (v, u) => { // a point on the cloth: v down the sail, u across it
      const x0 = bez(mx - sw, mx - sw + belly, mx - sw * 0.94, v) * 0.97 + mx * 0.03;
      const x1 = bez(mx + sw, mx + sw + belly, mx + sw * 0.94, v) * 0.97 + mx * 0.03;
      return x0 + (x1 - x0) * u;
    };
    const yAt = (v, u) => bez(top, top + sh * 0.55, top + sh, v) + v * 2 * s + 5 * s * Math.sin(Math.PI * u) + 5 * s * v * (1 - v) * 2;
    ctx.beginPath();
    for (let i = 1; i < rows; i++) {   // the bowed cross seams
      const v = i / rows;
      ctx.moveTo(xAt(v, 0), yAt(v, 0));
      for (let k = 1; k <= 8; k++) { const u = k / 8; ctx.lineTo(xAt(v, u), yAt(v, u)); }
    }
    for (let j = 1; j < cells; j++) {  // the panel seams, following the cloth's bow
      const u = j / cells;
      ctx.moveTo(xAt(0, u), yAt(0, u));
      for (let k = 1; k <= 5; k++) { const v = k / 5; ctx.lineTo(xAt(v, u), yAt(v, u)); }
    }
    ctx.strokeStyle = c.seam; ctx.lineWidth = Math.max(0.8 / e.s, s * 0.34); ctx.stroke();
  }
}

// o: { x, y (waterline), s (hull length ≈ 120*s), dir (+1 right), sail: 'white'|'none', furl 0..1,
//      oars: phase 0..1 (rowing), row: bool, wake: 0..1, crew: bool, stern: bool (seen from astern),
//      light: -1|+1 (side the light comes from; default: day sun left, night moon right) }
export function galley(ctx, e, o) {
  if (o.stern) { sternGalley(ctx, e, o); return; }
  const s = o.s ?? 1, x = o.x, y = o.y, d = o.dir ?? 1;
  const px = 120 * s * e.s;            // hull length in device pixels
  const c = cols(e);
  const len = 120 * s, hh = 9 * s;
  const X = (u) => x + d * u * len / 2; // u in [-1, 1] along the hull (bow = +1)
  const furl = o.furl ?? 0;
  const shade = shadeSide(e, o);
  if (px < 26) { // ---- far: the near LOD's mast, sail and hull as flat blocks
    if (o.sail !== 'none') {
      const mx = X(0.05), top = y - hh * 1.2 - 62 * s, sw = 30 * s, sh = 40 * s * (1 - furl * 0.8);
      const mw = Math.max(1 / e.s, 1.6 * s);
      ctx.fillStyle = c.hull; ctx.fillRect(mx - mw / 2, top - 4 * s, mw, y - hh - top + 4 * s);
      ctx.fillStyle = c.sail; ctx.fillRect(mx - sw, top, 2 * sw, sh);
      ctx.fillStyle = c.sailShade; ctx.fillRect(shade > 0 ? mx + sw * 0.35 : mx - sw, top, sw * 0.65, sh);
    }
    ctx.fillStyle = c.hull; ctx.fillRect(x - len * 0.46, y - hh * 1.1, len * 0.92, hh * 1.1);
    if (o.wake) { // a short trail astern, so the wakes of a line of ships stay apart
      const wl = len * 0.45 * Math.min(1, o.wake);
      ctx.fillStyle = c.wake; ctx.fillRect(d > 0 ? x - len * 0.25 - wl : x + len * 0.25, y, wl, Math.max(1 / e.s, 1.5 * s));
    }
    return;
  }
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lw = Math.max(1 / e.s, s * 0.9);
  // ---- wake
  if (o.wake) {
    ctx.fillStyle = c.wake;
    const n = px > 80 ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const u = 1 - (i / n) * 2.4;
      const wx = X(u) - d * 6 * s * i, wy = y + 1.5 * s + (i % 3) * 1.6 * s;
      const wl = (6 + (i * 7) % 11) * s * (o.wake ?? 1);
      ctx.beginPath(); ctx.ellipse(wx, wy, wl, 0.55 * s, 0, 0, TAU); ctx.fill();
    }
    // bow wave
    ctx.beginPath(); ctx.ellipse(X(0.98), y + 0.5 * s, 9 * s, 2 * s, 0, 0, TAU); ctx.fill();
  }
  // ---- oars (behind the hull for the far bank, in front for the near bank)
  const nOars = px > 160 ? 18 : px > 70 ? 11 : 7;
  const ph = (o.oars ?? 0) * TAU;
  const oarLine = (front) => {
    ctx.strokeStyle = c.oar; ctx.lineWidth = Math.max(1 / e.s, s * (front ? 0.85 : 0.6));
    ctx.beginPath();
    for (let i = 0; i < nOars; i++) {
      const u = -0.62 + (i / (nOars - 1)) * 1.22;
      const sweep = o.row ? Math.sin(ph + i * 0.12) * 0.32 : 0.1;
      const bx = X(u), by = y - hh * 0.55;
      const ex = bx - d * (sweep * 22 * s) - d * (front ? 9 : 2) * s, ey = y + (front ? 9 : 1.6) * s;
      ctx.moveTo(bx, by); ctx.lineTo(ex, ey);
    }
    ctx.stroke();
    if (front && o.row && px > 60) { // white splashes where the blades bite: broken flat dashes, not a row of beads
      ctx.fillStyle = c.wake;
      ctx.beginPath();
      for (let i = 0; i < nOars; i += 2) {
        const u = -0.62 + (i / (nOars - 1)) * 1.22;
        const sweep = Math.sin(ph + i * 0.12) * 0.32;
        if (sweep < 0.05) continue;
        const ex = X(u) - d * (sweep * 22 * s) - d * 9 * s, hv = ((i * 7919) % 13) / 13;
        const l = (1.4 + 1.8 * hv) * s * Math.min(1, sweep * 4), yy = y + (8.8 + hv * 0.9) * s;
        ctx.moveTo(ex + l, yy); ctx.ellipse(ex, yy, l, 0.5 * s, 0, 0, TAU);
        ctx.moveTo(ex - d * l * 1.5 + 0.9 * l, yy + 0.7 * s); ctx.ellipse(ex - d * l * 1.5, yy + 0.7 * s, l * 0.9 * (0.5 + hv * 0.5), 0.4 * s, 0, 0, TAU);
      }
      ctx.fill();
    }
  };
  // dark reflection of the hull on the water
  ctx.fillStyle = e.night ? 'rgba(0,0,10,0.55)' : 'rgba(5,14,50,0.45)';
  ctx.beginPath(); ctx.ellipse(x + d * len * 0.05, y + hh * 0.9, len * 0.5, hh * 0.7, 0, 0, TAU); ctx.fill();
  oarLine(false);
  if (o.crew !== false && px > 60) { // the packed crew behind the rail (plate 1): a dark mass of
    // shoulders with heads of uneven height, a few helmets catching the light; one path
    ctx.fillStyle = c.crew;
    const nc = px > 160 ? 22 : 12;
    ctx.fillRect(Math.min(X(-0.62), X(0.64)), y - hh * 1.5, Math.abs(X(0.64) - X(-0.62)), hh * 0.4); // shoulders (own fill: no winding holes when dir = -1)
    ctx.beginPath();
    for (let i = 0; i < nc; i++) {
      const j = (i * 7919) % 11 / 11;
      const u = -0.58 + ((i + (j - 0.5) * 0.5) / (nc - 1)) * 1.2, cx = X(u), cy = y - hh * (1.62 + (i % 2) * 0.16 + j * 0.12), r = hh * (0.22 + j * 0.08);
      ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU);
    }
    ctx.fill();
    if (px > 110) { // helmet glints on every third head
      ctx.strokeStyle = c.hullHi; ctx.lineWidth = Math.max(0.6 / e.s, s * 0.35);
      ctx.beginPath();
      for (let i = 1; i < nc; i += 3) {
        const j = (i * 7919) % 11 / 11;
        const u = -0.58 + ((i + (j - 0.5) * 0.5) / (nc - 1)) * 1.2, cx = X(u), cy = y - hh * (1.62 + (i % 2) * 0.16 + j * 0.12), r = hh * (0.22 + j * 0.08);
        ctx.moveTo(cx - r * 0.7, cy - r * 0.3); ctx.quadraticCurveTo(cx, cy - r * 1.05, cx + r * 0.7, cy - r * 0.3);
      }
      ctx.stroke();
    }
  }
  if (px > 70) { // shields hung along the rail, behind the gunwale (their lower third hidden)
    // one dark bronze for all but every fifth (vermilion), a thin rim of light on top:
    // texture along the rail, not a row of coloured dots
    const ns = px > 160 ? 14 : 8, r = hh * 0.3, cy = y - hh * 1.12 - r / 3;
    const at = (i) => X(-0.6 + (i / (ns - 1)) * 1.25);
    for (const red of [false, true]) {
      ctx.fillStyle = red ? c.shield[2] : c.shield[0];
      ctx.beginPath();
      for (let i = 0; i < ns; i++) { if ((i % 5 === 2) !== red) continue; const cx = at(i); ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); }
      ctx.fill();
    }
    if (px > 110) {
      const a0 = ctx.globalAlpha;
      ctx.strokeStyle = c.shield[1]; ctx.lineWidth = Math.max(0.6 / e.s, r * 0.28); ctx.globalAlpha = a0 * 0.8;
      ctx.beginPath();
      for (let i = 0; i < ns; i++) { const cx = at(i); ctx.moveTo(cx - r * 0.8, cy - r * 0.35); ctx.quadraticCurveTo(cx, cy - r * 1.15, cx + r * 0.8, cy - r * 0.35); }
      ctx.stroke(); ctx.globalAlpha = a0;
    }
  }
  // ---- hull
  ctx.fillStyle = c.hull;
  ctx.beginPath();
  ctx.moveTo(X(-0.86), y - hh * 0.9);
  ctx.quadraticCurveTo(X(-1.02), y - hh * 2.2, X(-0.92), y - hh * 3.6);         // stern rising
  ctx.quadraticCurveTo(X(-0.86), y - hh * 3.9, X(-0.84), y - hh * 3.3);         // aplustre curl
  ctx.quadraticCurveTo(X(-0.86), y - hh * 2.0, X(-0.74), y - hh * 1.1);
  ctx.lineTo(X(0.82), y - hh * 1.15);
  ctx.quadraticCurveTo(X(0.92), y - hh * 1.6, X(0.9), y - hh * 2.4);            // bow post
  ctx.lineTo(X(0.96), y - hh * 2.3);
  ctx.quadraticCurveTo(X(0.98), y - hh * 1.2, X(1.0), y - hh * 0.35);
  ctx.lineTo(X(1.12), y - hh * 0.15);                                             // ram
  ctx.lineTo(X(0.98), y + hh * 0.05);
  ctx.quadraticCurveTo(X(0.2), y + hh * 0.45, X(-0.82), y);
  ctx.closePath(); ctx.fill();
  // rail highlight
  ctx.strokeStyle = c.hullHi; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(X(-0.74), y - hh * 1.1); ctx.lineTo(X(0.82), y - hh * 1.15); ctx.stroke();
  if (px > 110) { // plank seams and vertical hatching in the hull
    const a0 = ctx.globalAlpha; // the stage's dissolve alpha: scale it, never reset it
    ctx.strokeStyle = c.hullHi; ctx.globalAlpha = a0 * 0.55; ctx.lineWidth = Math.max(0.6 / e.s, s * 0.35);
    ctx.beginPath();
    ctx.moveTo(X(-0.76), y - hh * 0.55); ctx.quadraticCurveTo(X(0.1), y - hh * 0.35, X(0.95), y - hh * 0.6);
    for (let i = 0; i < 40; i++) { const u = -0.74 + i * 0.042; ctx.moveTo(X(u), y - hh * 1.0); ctx.lineTo(X(u), y - hh * (0.62 + (i % 3) * 0.08)); }
    ctx.stroke(); ctx.globalAlpha = a0;
  }
  if (px > 70) {
    // eye on the bow
    ctx.fillStyle = c.eye; ctx.beginPath(); ctx.ellipse(X(0.86), y - hh * 0.6, hh * 0.32, hh * 0.18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.hull; ctx.beginPath(); ctx.arc(X(0.87), y - hh * 0.6, hh * 0.11, 0, TAU); ctx.fill();
  }
  oarLine(true);
  // ---- mast, yard and sail
  if (o.sail !== 'none') {
    const mx = X(0.05), top = y - hh * 1.2 - 62 * s;
    if (px > 90) { // fore- and backstay, behind the sail
      ctx.strokeStyle = c.hull; ctx.lineWidth = Math.max(0.6 / e.s, s * 0.35);
      ctx.beginPath();
      ctx.moveTo(mx, top - 4 * s); ctx.lineTo(X(0.92), y - hh * 2.2);
      ctx.moveTo(mx, top - 4 * s); ctx.lineTo(X(-0.86), y - hh * 3.2);
      ctx.stroke();
    }
    ctx.strokeStyle = c.hull; ctx.lineWidth = Math.max(1 / e.s, s * 1.6);
    ctx.beginPath(); ctx.moveTo(mx, y - hh); ctx.lineTo(mx, top - 4 * s); ctx.stroke();
    const sw = 30 * s, sh = 40 * s * (1 - furl * 0.8);
    sail(ctx, e, c, px, s, mx, top, sw, sh, 10 * s * d, shade);
    // yard
    ctx.strokeStyle = c.hull; ctx.lineWidth = Math.max(1 / e.s, s * 1.3);
    ctx.beginPath(); ctx.moveTo(mx - sw * 1.08, top); ctx.lineTo(mx + sw * 1.08, top); ctx.stroke();
  }
  ctx.restore();
}


// The galley seen from astern (plate 1's ships pulling away): the broad dark
// stern with the aplustre curling up in the middle, the crew packed on deck,
// oars fanned out on both sides, the sail square to the viewer above.
function sternGalley(ctx, e, o) {
  const s = o.s ?? 1, x = o.x, y = o.y;
  const px = 120 * s * e.s;
  const c = cols(e);
  const hh = 9 * s, bw = 17 * s;       // bw: half beam at the rail
  const furl = o.furl ?? 0, sw = 30 * s, sh = 40 * s * (1 - furl * 0.8), top = y - hh * 1.2 - 62 * s;
  const shade = shadeSide(e, o);
  if (px < 26) {
    if (o.sail !== 'none') {
      const mw = Math.max(1 / e.s, 1.6 * s);
      ctx.fillStyle = c.hull; ctx.fillRect(x - mw / 2, top - 4 * s, mw, y - hh - top + 4 * s);
      ctx.fillStyle = c.sail; ctx.fillRect(x - sw, top, 2 * sw, sh);
      ctx.fillStyle = c.sailShade; ctx.fillRect(shade > 0 ? x + sw * 0.35 : x - sw, top, sw * 0.65, sh);
    }
    ctx.fillStyle = c.hull; ctx.fillRect(x - bw, y - hh * 1.5, 2 * bw, hh * 1.5);
    if (o.wake) { ctx.fillStyle = c.wake; ctx.fillRect(x - bw * 0.7, y, bw * 1.4, Math.max(1 / e.s, 1.5 * s)); }
    return;
  }
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.wake) { // the wash astern and two trails spreading toward the viewer
    ctx.fillStyle = c.wake;
    ctx.beginPath(); ctx.ellipse(x, y + 1.4 * s, bw * 0.9, 1.4 * s, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, k = i >> 1;
      ctx.beginPath();
      ctx.ellipse(x + side * (bw * 0.7 + k * 4.5 * s), y + 3 * s + k * 3.4 * s, (4 + k * 2.4) * s * Math.min(1, o.wake), 0.6 * s, side * 0.22, 0, TAU);
      ctx.fill();
    }
  }
  ctx.fillStyle = e.night ? 'rgba(0,0,10,0.55)' : 'rgba(5,14,50,0.45)';
  ctx.beginPath(); ctx.ellipse(x, y + hh * 0.8, bw * 1.2, hh * 0.6, 0, 0, TAU); ctx.fill();
  // oars fanned out from both sides, blades in the water
  const nOars = px > 160 ? 9 : px > 70 ? 6 : 4;
  const ph = (o.oars ?? 0) * TAU;
  ctx.strokeStyle = c.oar; ctx.lineWidth = Math.max(1 / e.s, s * 0.6);
  ctx.beginPath();
  for (const side of [-1, 1]) for (let i = 0; i < nOars; i++) {
    const f = i / Math.max(1, nOars - 1);              // 0 = astern (nearest), 1 = toward the bow
    const sweep = o.row ? Math.sin(ph + i * 0.3) * 0.25 : 0;
    const bx = x + side * bw * (0.95 - f * 0.18), by = y - hh * (0.8 + f * 0.7);
    const reach = (34 - f * 16) * s;   // forward oars dip farther away: higher and shorter, so they fan out
    ctx.moveTo(bx, by); ctx.lineTo(bx + side * reach * (1 + sweep * 0.3), y + (5 - f * 18 + sweep * 2) * s);
  }
  ctx.stroke();
  if (o.row && px > 60) { // splashes where the blades bite
    ctx.fillStyle = c.wake;
    for (const side of [-1, 1]) for (let i = 0; i < nOars; i += 2) {
      const f = i / Math.max(1, nOars - 1), sweep = Math.sin(ph + i * 0.3) * 0.25;
      if (sweep < 0.05) continue;
      const bx = x + side * bw * (0.95 - f * 0.18), reach = (34 - f * 16) * s;
      ctx.beginPath(); ctx.ellipse(bx + side * reach * (1 + sweep * 0.3), y + (5.3 - f * 18 + sweep * 2) * s, 2.4 * s, 0.7 * s, 0, 0, TAU); ctx.fill();
    }
  }
  // mast, sail and yard (amidships, behind the stern)
  if (o.sail !== 'none') {
    ctx.strokeStyle = c.hull; ctx.lineWidth = Math.max(1 / e.s, s * 1.6);
    ctx.beginPath(); ctx.moveTo(x, y - hh * 1.5); ctx.lineTo(x, top - 4 * s); ctx.stroke();
    sail(ctx, e, c, px, s, x, top, sw, sh, 0, shade);
    ctx.strokeStyle = c.hull; ctx.lineWidth = Math.max(1 / e.s, s * 1.3);
    ctx.beginPath(); ctx.moveTo(x - sw * 1.08, top); ctx.lineTo(x + sw * 1.08, top); ctx.stroke();
  }
  // the broad stern (a U seen from behind)
  ctx.fillStyle = c.hull;
  ctx.beginPath();
  ctx.moveTo(x - bw, y - hh * 1.5);
  ctx.quadraticCurveTo(x - bw * 1.06, y - hh * 0.25, x - bw * 0.45, y + hh * 0.3);
  ctx.quadraticCurveTo(x, y + hh * 0.48, x + bw * 0.45, y + hh * 0.3);
  ctx.quadraticCurveTo(x + bw * 1.06, y - hh * 0.25, x + bw, y - hh * 1.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = c.hullHi; ctx.lineWidth = Math.max(1 / e.s, s * 0.9);
  ctx.beginPath(); ctx.moveTo(x - bw, y - hh * 1.5); ctx.lineTo(x + bw, y - hh * 1.5);
  if (px > 110) { // planking of the stern
    for (let i = 1; i < 4; i++) { const v = i / 4; ctx.moveTo(x - bw * (1 - v * 0.45), y - hh * (1.5 - v * 1.6)); ctx.quadraticCurveTo(x, y - hh * (1.35 - v * 1.6), x + bw * (1 - v * 0.45), y - hh * (1.5 - v * 1.6)); }
  }
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * 0.7; ctx.stroke(); ctx.globalAlpha = a0;
  if (o.crew !== false && px > 50) { // the packed crew, rows rising toward the bow
    ctx.fillStyle = c.crew;
    const nr = px > 160 ? 3 : 2, nc = px > 160 ? 9 : 6;
    ctx.beginPath();
    for (let r = 0; r < nr; r++) for (let i = 0; i < nc; i++) {
      const u = ((i + 0.5) / nc) * 2 - 1, cx = x + u * bw * (0.86 - r * 0.14), cy = y - hh * (1.75 + r * 0.42);
      ctx.moveTo(cx + hh * 0.3, cy); ctx.arc(cx, cy, hh * 0.3, 0, TAU);
    }
    ctx.fill();
  }
  // aplustre: the stern post rising in the middle and curling back toward us
  ctx.fillStyle = c.hull;
  ctx.beginPath();
  ctx.moveTo(x - 2.4 * s, y - hh * 1.4);
  ctx.quadraticCurveTo(x - 2.8 * s, y - hh * 3.0, x - 0.4 * s, y - hh * 3.95);
  ctx.quadraticCurveTo(x + 3.8 * s, y - hh * 4.25, x + 2.8 * s, y - hh * 3.45);
  ctx.quadraticCurveTo(x + 1.4 * s, y - hh * 3.15, x + 1.7 * s, y - hh * 3.5);
  ctx.quadraticCurveTo(x + 2.1 * s, y - hh * 2.6, x + 2.4 * s, y - hh * 1.4);
  ctx.closePath(); ctx.fill();
  if (px > 70) { // shields hung at the quarters, dark bronze
    for (const side of [-1, 1]) {
      ctx.fillStyle = c.shield[side > 0 ? 1 : 0];
      ctx.beginPath(); ctx.arc(x + side * bw * 0.78, y - hh * 1.55, hh * 0.3, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// Baked close-up ship sprite (for very large ships). The sprite is the same
// drawing rendered once at high resolution; anchor at the waterline centre.
export function galleySprite(o = {}) {
  const s = o.s ?? 2;
  return {
    w: 300 * s, h: 170 * s, ax: 0.5, ay: 0.8, depth: o.depth ?? 1, maxScale: o.maxScale ?? 1,
    paint(p) {
      p.ink((ctx) => {
        const e = { s: p.k, night: p.night };
        galley(ctx, e, { x: 150 * s, y: 136 * s, s, dir: o.dir ?? 1, sail: o.sail ?? 'white', wake: o.wake ?? 0.6, crew: true, row: false });
      });
    },
  };
}

// A curving line of ships (plate 3). Returns positions for frame drawing.
export function fleetLine({ x0, y0, x1, y1, bend = 0.3, n = 20, s0 = 1, s1 = 0.08 }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const k = Math.pow(u, 0.7);
    const x = x0 + (x1 - x0) * k + Math.sin(k * Math.PI) * bend * (y0 - y1);
    const y = y0 + (y1 - y0) * Math.pow(u, 0.55);
    const s = s0 * Math.pow(s1 / s0, Math.pow(u, 0.6));
    out.push({ x, y, s, u });
  }
  return out;
}

// Ships on the sea plane in perspective. path: [[X, Z], ...] in "map" units
// (X lateral, Z distance; Z = 1 sits `near` units below the horizon). Ships
// are spaced evenly along the path in map space, so they bunch up toward the
// horizon the way a real line of ships does. offset slides them along.
export function fleetOnPlane({ path, n, horizon, near = 400, cx = 800, spread = 800, s0 = 1.4, offset = 0 }) {
  const dense = [];
  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[Math.max(0, i - 1)], p1 = path[i], p2 = path[i + 1], p3 = path[Math.min(path.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(path[path.length - 1]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = acc[acc.length - 1];
  const at = (d) => {
    d = Math.max(0, Math.min(total, d));
    let j = 1; while (j < acc.length - 1 && acc[j] < d) j++;
    const f = (d - acc[j - 1]) / Math.max(1e-9, acc[j] - acc[j - 1]);
    return [dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * total * 0.98 + offset;
    if (d > total) continue;
    const [X, Z] = at(d);
    const a = at(d - 0.05), b = at(d + 0.05);
    const dirX = (b[0] / b[1]) - (a[0] / a[1]); // screen-space heading sign
    out.push({ x: cx + (spread * X) / Z, y: horizon + near / Z, s: s0 / Z, Z, dir: dirX >= 0 ? 1 : -1, i });
  }
  return out.sort((a, b) => b.Z - a.Z); // far first
}
