// The illustration pass.
//
// Plates are painted as *guides*: a 2D canvas whose channels mean
//   R = light (0 = crevice/black shadow, 1 = full sun)
//   G = aux1  (material specific: grain/needle angle, sea perspective scale…)
//   B = aux2  (material specific: snow, glint mask, hatch boost…)
//   A = coverage
// This WebGL2 shader turns a guide into finished, print-like colour:
// posterised palette ramps whose band edges are broken up by world-space
// noise and angular Voronoi patches, engraved hatching in the mid tones,
// specks, cracks, and ink outlines found from coverage/light edges.

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uGuide;
uniform vec2 uSize;       // size of the output (the whole pass, or one band of it)
uniform vec2 uOff;        // pass pixel at the output's top-left (band offset)
uniform vec4 uGRect;      // guide texture rect in pass pixels: x, y, w, h
uniform vec4 uGClamp;     // valid guide area (edge texel centres) in pass pixels: x0, y0, x1, y1
uniform vec2 uOrigin;
uniform float uK;
uniform int uMode;
uniform vec3 uRamp[8];
uniform float uThr[8];
uniform int uN;
uniform float uSeed;
uniform float uTime;
uniform vec4 uNoise;      // nScale, nAmp, vScale, vAmp
uniform vec4 uNoise2;     // Voronoi warp (1.4 = blobby cells, ~0.45 = polygonal chips), crack breakup, Voronoi y-stretch (<1 = tall cells), facet strength on lit faces (stone/rock)
uniform vec4 uNoise3;     // weathering: amount 0..1, patch scale (world), patch edge gain, coverage bias
uniform vec4 uNoise4;     // weathered patches: pull of lit faces toward the top threshold (0..1), lit facet cap, shade-face share; sea: glint size (x the calibrated fleck size)
uniform vec2 uMarkOff;    // world offset of the mark fields only (blotch, facets, patches, pits, cracks, hatch jitter)
uniform vec4 uHatch;      // angle, spacing(world), width(world), strength
uniform vec4 uHatch2;     // lo, hi, dash, crossBelow
uniform vec4 uHatch3;     // width jitter per line (0..1), line wobble (x the default), dash length (x spacing), angle variation (radians, peak to peak)
uniform vec4 uHatch4;     // engraving on lit faces (x strength), hatch follows the weathering 0..1, lit strokes' sparsity on clean stone, unused
uniform vec4 uHatch5;     // angle variation patch size (world units), share of patches chiselled at the second angle, second angle minus angle (radians), unused
uniform vec3 uHatchCol;
uniform vec4 uSpeck;      // density, size(world), lightDensity, shape (0 = angular chip, 1 = round dot)
uniform vec4 uSpeck2;     // lit-face share of the pit density (0 = pits only in shade), clustering 0..1, pit aspect (x stretch), facet gathering 0..1
uniform vec4 uSpeck3;     // big pits: density, cell size (world), unused x2
uniform vec3 uSpeckCol;
uniform vec3 uSpeckLight;
uniform vec4 uOutline;    // width(world), silStrength, creaseStrength, creaseThreshold
uniform vec4 uOutline2;   // crease tap distance (world units: the crease line is about twice as wide), unused x3
uniform vec3 uInk;
uniform vec4 uExtra;      // erode, crackAmp, crackWidth, special
uniform vec4 uExtra2;     // mode specific
out vec4 frag;

uvec2 pcg2d(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}
vec2 h22(vec2 p){ uvec2 u = pcg2d(uvec2(ivec2(floor(p)) + 262144)); return vec2(u) * (1.0 / 4294967295.0); }
float h21(vec2 p){ return h22(p).x; }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 ga = h22(i)*2.0-1.0, gb = h22(i+vec2(1,0))*2.0-1.0, gc = h22(i+vec2(0,1))*2.0-1.0, gd = h22(i+vec2(1,1))*2.0-1.0;
  float va = dot(ga, f), vb = dot(gb, f-vec2(1,0)), vc = dot(gc, f-vec2(0,1)), vd = dot(gd, f-vec2(1,1));
  return mix(mix(va,vb,u.x), mix(vc,vd,u.x), u.y) * 1.25 + 0.5;
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 13.7; a *= 0.5; }
  return s / 0.96875;
}
float fbm3(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; }
  return s / 0.875;
}
// Voronoi: x = random value of nearest cell, y = distance to cell edge.
vec2 vor(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = h22(i + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h21(i + g + 17.31); }
    else if (d < d2) { d2 = d; }
  }
  return vec2(id, sqrt(d2) - sqrt(d1));
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// Limestone relief: vertical fluting, rounded lumps and faint bedding planes.
float ridgedN(vec2 p){ return 1.0 - abs(gnoise(p) * 2.0 - 1.0); }
float reliefH(vec2 w, float sc, float seed){
  vec2 p = w / sc;
  float h = 0.0, a = 0.55;
  vec2 q = vec2(p.x * 1.0, p.y * 0.28);              // tall, vertical forms
  for (int i = 0; i < 4; i++) { h += a * ridgedN(q + seed); q = mat2(1.7, 0.9, -0.9, 1.7) * q + 5.3; a *= 0.5; }
  h += 0.35 * fbm3(p * 1.3 + seed * 2.0);               // lumps
  h += 0.06 * sin(p.y * 9.0 + gnoise(p * 0.7) * 6.0);   // bedding
  return h;
}

vec4 G(vec2 px){ return texture(uGuide, (clamp(px, uGClamp.xy, uGClamp.zw) - uGRect.xy) / uGRect.zw); }

void main(){
  // px is in pass pixels, so a pass shaded band by band matches one big run
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) + uOff;
  vec4 g = G(px);
  vec2 w = uOrigin + px / uK;          // world position
  vec2 wm = w + uMarkOff;              // the same, offset for the mark fields (mat.markOffset)
  float A = g.a;
  float L = g.r, a1 = g.g, a2 = g.b;
  float seed = uSeed;

  // ---------- coverage edges (silhouette outline) ----------
  // Ink widths are in world units (x uK pass px), so contours keep their weight
  // at any DPR or bake scale. Floor: 0.75 px (or the width itself if smaller,
  // so a layer baked at k = 1 is unchanged).
  float ow = uOutline.x > 0.0 ? max(uOutline.x * uK, min(uOutline.x, 0.75)) : 0.0;
  float maxA = A, minA = A;
  if (ow > 0.0 && (uOutline.y > 0.0)) {
    for (int i = 0; i < 8; i++) {
      float an = float(i) * 0.785398;
      vec2 d = vec2(cos(an), sin(an)) * ow;
      float s = G(px + d).a;
      maxA = max(maxA, s); minA = min(minA, s);
    }
    if (ow > 1.6) { // wide ink: an inner ring, so a thin feature is never jumped over
      for (int i = 0; i < 8; i++) {
        float an = float(i) * 0.785398 + 0.392699;
        vec2 d = vec2(cos(an), sin(an)) * (ow * 0.55);
        float s = G(px + d).a;
        maxA = max(maxA, s); minA = min(minA, s);
      }
    }
  }
  float sil = smoothstep(0.25, 0.75, maxA - minA) * uOutline.y;

  // ---------- light perturbation ----------
  float nScale = uNoise.x, nAmp = uNoise.y, vScale = uNoise.z, vAmp = uNoise.w;
  float Lp = L;
  // texture fades out in the deepest shadows so black interiors stay black
  float tex = mix(0.2, 1.0, smoothstep(0.03, 0.28, L));
  float nf = 0.5;
  if (nAmp > 0.0) { nf = fbm(wm / nScale + seed); Lp += tex * nAmp * (nf - 0.5) * 2.0; }
  // weathering (standard 26): marks gather into weathered patches with clean
  // dressed stone between. The patches come from their own large noise (about
  // 3.5x the blotch scale): W = 1 inside a patch, 0 on clean stone, with an
  // irregular, fairly hard edge. Inside, lit faces drop a step greyer (crisp
  // grey patches) and carry the facets, pits and engraving; outside they stay
  // clean ivory. wth (0..2) is the mark multiplier.
  float wth = 1.0, W = 0.5;
  if (uNoise3.x > 0.0) {
    float nw = fbm(wm / uNoise3.y + seed * 1.3 + 23.0);
    W = clamp((0.5 - nw) * uNoise3.z + 0.5 + uNoise3.w, 0.0, 1.0);
    wth = mix(1.0, 2.0 * W, uNoise3.x);
    // inside a patch, a lit face is pulled down to just above the top band
    // threshold, whatever light it was painted at: its facets then split it
    // into ivory and grey chips (a face painted at 0.82 or at 0.97 weathers alike)
    float top = uThr[uN - 2] + 0.015;
    Lp -= uNoise4.x * uNoise3.x * W * max(0.0, Lp - top);
  }
  vec2 V = vec2(0.5, 1.0);
  if (vAmp > 0.0) {
    vec2 wq = vec2(wm.x, wm.y * uNoise2.z) / vScale + seed * 1.7;
    wq += (vec2(fbm3(wq * 0.5 + 3.1), fbm3(wq * 0.5 + 9.7)) - 0.5) * uNoise2.x; // warp: irregular cells
    V = vor(wq);
    // stone and rock: the facets' strength on lit faces is its own (noise.lit):
    // the plates' sunlit limestone is mottled with pale grey chips, while the
    // shade planes keep fainter facets so they never posterise into camouflage
    float hiK = (uMode == 1 || uMode == 2) ? mix(mix(1.0, wth, uNoise4.z), min(uNoise2.w * wth, uNoise4.y), smoothstep(0.66, 0.9, L)) : 1.0;
    Lp += tex * hiK * vAmp * (V.x - 0.5) * 2.0;
  }

  int mode = uMode;
  vec3 extraCol = vec3(0.0); float extraMix = 0.0;
  float alpha = A;

  if (mode == 4) { // SEA: a1 = perspective scale, a2 = glint mask
    float ps = max(a1, 0.02);
    // the light strokes' noise is scaled by ps read as a bilinear blend of 8-px
    // block samples: canvas gradients are dithered at DPR 2, and a noise scaled
    // by the per-pixel ps (+-1/255) would shred the strokes into 1-px stripes
    vec2 bp = px / 8.0 - 0.5, b0 = floor(bp), bf = bp - b0;
    float psS = max(mix(mix(G((b0 + 0.5) * 8.0).g, G((b0 + vec2(1.5, 0.5)) * 8.0).g, bf.x),
                        mix(G((b0 + vec2(0.5, 1.5)) * 8.0).g, G((b0 + 1.5) * 8.0).g, bf.x), bf.y), 0.02);
    vec2 q = vec2(w.x * 0.11, w.y) / (nScale * psS);
    q.x += uTime * 0.12; q.y += uTime * 0.02;   // a slow drift: consecutive frames keep most strokes
    float s = fbm3(q + seed);
    float s2 = gnoise(q * vec2(1.9, 2.7) + 41.0);
    Lp = L + (s - 0.5) * uExtra2.x;
    // glints: flecks of light on the wave crests (plate 5's bay). Rows of cells in
    // world units, each row offset at random; a lit cell holds one fleck, a lens
    // about 2.5x wider than tall with a slight crest curve, some broken in two.
    // Sizes follow the perspective scale but stop shrinking at psG 0.45, so the
    // middle distance keeps flecks of about 2 x 5 units at any DPR. Two size
    // levels an octave apart trade whole flecks as the perspective scale grows.
    // Flecks hold their place between animation frames; a few near the density
    // threshold twinkle on or off (the sea shimmers, it never re-forms).
    float psG = max(ps * 0.85, 0.45);
    float l0 = floor(log2(psG / 0.45));
    // mat.glintSize (default 1) scales every fleck at the same perspective scale, so a shot
    // whose open sea reads as scattered snow can ask for plate-4-sized flecks (D2's s12)
    float gsz = max(uNoise4.w, 0.05);
    // the rows undulate like wave crests, and the glints gather in wave groups
    // (fixed world scales: anything scaled by the per-pixel ps would pick up the
    // guide's gradient dithering and shred the flecks at DPR 2)
    vec2 wg = w + (vec2(gnoise(w / 34.0 + 3.0), gnoise(w / 23.0 + 11.0)) - 0.5) * vec2(6.0, 5.3);
    float glint = 0.0;
    for (int k = 0; k < 2; k++) {
      float lk = l0 + float(k);
      float hR = 3.8 * gsz * exp2(lk), cLen = hR * 3.0;
      float rowI = floor(wg.y / hR), rowO = h21(vec2(rowI, lk * 7.0 + seed)) * 17.0;
      float gx = wg.x / cLen + rowO;
      vec2 gid = vec2(floor(gx), rowI);
      // everything that decides whether a fleck is lit is read at its cell centre,
      // so a dithered guide (gradients at DPR 2) never breaks a fleck into specks
      vec2 cw = vec2((gid.x + 0.5 - rowO) * cLen, (rowI + 0.5) * hR);
      vec4 gc = G((cw - uOrigin) * uK);
      float lvc = log2(max(max(gc.g, 0.02) * 0.85, 0.45) / 0.45), fl = floor(lvc), fr = lvc - fl;
      float P = uExtra2.y * gc.b * 1.4 * mix(0.35, 1.65, smoothstep(0.25, 0.75, gnoise(cw / (hR * vec2(14.0, 7.0)) + seed + 29.0)));
      vec2 gf = vec2(fract(gx), fract(wg.y / hR)) - 0.5;
      vec2 ga = h22(gid + seed * 2.0 + 11.0 + lk * 31.0), gb = h22(gid + seed * 2.0 + 47.0 + lk * 31.0);
      float hz = h21(gid + 23.0 + lk);
      float sz = 0.62 + 0.85 * hz * hz;                         // mostly small flecks, a few long ones
      float ox = (ga.x - 0.5) * 0.25;                          // fleck centre offset in the cell
      float HL = min(mix(0.17, 0.36, ga.y) * sz, 0.48 - abs(ox)) * cLen, H0 = mix(0.2, 0.33, gb.y) * hR * mix(0.8, 1.0, sz);
      float fx = (gf.x - ox) * cLen;
      float fy = (gf.y - (gb.x - 0.5) * 0.16) * hR;
      // a jagged edge: the height steps at random every ~1.2 units along the fleck
      float jag = 0.78 + 0.44 * h21(vec2(floor(fx / 1.2 + 40.0), gid.x * 1.7 + gid.y * 7.3 + lk));
      float uu = clamp(fx / HL, -1.0, 1.0);
      float HH = H0 * jag * sqrt(max(0.0, 1.0 - uu * uu));
      float fyc = fy - (uu * uu - 0.3) * H0 * 0.8 * (ga.x * 2.0 - 1.0);           // a crest curve
      float lens = smoothstep(-0.5, 0.5, (HH - abs(fyc)) * uK) * step(abs(fx), HL);
      // a second, smaller lobe beside half of them (chunky, irregular flecks)
      float sx = (ga.x - 0.5) * 1.0 * HL, sy = (gb.y > 0.5 ? 1.0 : -1.0) * H0 * 1.25;
      float u2 = clamp((fx - sx) / (0.55 * HL), -1.0, 1.0);
      float H2 = 0.6 * H0 * sqrt(max(0.0, 1.0 - u2 * u2));
      lens = max(lens, step(0.45, gb.x) * smoothstep(-0.5, 0.5, (H2 - abs(fy - sy)) * uK) * step(abs(fx - sx), 0.55 * HL));
      lens *= 1.0 - step(0.75, fract(hz * 7.13)) * step(abs(fx - (gb.y - 0.5) * HL), 0.06 * cLen); // some broken in two
      float tw = h21(gid + floor(uTime * 7.0) * 3.7 + 91.0 + lk * 13.0);
      float on = step(1.0 - P, h21(gid + seed * 3.0 + 5.0 + lk * 17.0) + (tw - 0.5) * 1.0 * P);
      float sel = h21(gid + 61.0 + lk * 5.0);              // the next level takes over as the scale grows
      float keep = lk == fl ? step(fr, sel) : (lk == fl + 1.0 ? step(sel, fr) : 0.0);
      glint = max(glint, on * lens * keep);
      // a few long thin crests between the rows (plate 5's longer glints)
      float r2i = floor(wg.y / hR + 0.5), r2o = h21(vec2(r2i, lk * 5.0 + seed + 3.0)) * 23.0, cL2 = hR * 8.0;
      float g2x = wg.x / cL2 + r2o;
      vec2 id2 = vec2(floor(g2x), r2i);
      vec2 cw2 = vec2((id2.x + 0.5 - r2o) * cL2, r2i * hR);
      vec4 gc2 = G((cw2 - uOrigin) * uK);
      float lv2 = log2(max(max(gc2.g, 0.02) * 0.85, 0.45) / 0.45), fl2 = floor(lv2), fr2 = lv2 - fl2;
      vec2 gc3 = h22(id2 + seed * 2.0 + 71.0 + lk * 19.0);
      float HL2 = mix(0.22, 0.42, gc3.y) * cL2, fx2 = (fract(g2x) - 0.5 - (gc3.x - 0.5) * 0.12) * cL2;
      float u3 = clamp(fx2 / HL2, -1.0, 1.0);
      float jag2 = 0.7 + 0.6 * h21(vec2(floor(fx2 / 1.6 + 80.0), id2.x * 2.3 + id2.y * 5.1 + lk));
      float HH2 = mix(0.13, 0.2, gc3.x) * hR * jag2 * sqrt(max(0.0, 1.0 - u3 * u3));
      float fy2 = (fract(wg.y / hR + 0.5) - 0.5) * hR - (u3 * u3 - 0.3) * hR * 0.25 * (gc3.y * 2.0 - 1.0);
      float lens2 = smoothstep(-0.5, 0.5, (HH2 - abs(fy2)) * uK) * step(abs(fx2), HL2);
      float P2 = uExtra2.y * gc2.b * 0.3;
      float tw2 = h21(id2 + floor(uTime * 7.0) * 5.3 + 37.0 + lk * 11.0);
      float on2 = step(1.0 - P2, h21(id2 + seed * 3.0 + 9.0 + lk * 13.0) + (tw2 - 0.5) * 1.0 * P2);
      float sel2 = h21(id2 + 67.0 + lk * 3.0);
      float keep2 = lk == fl2 ? step(fr2, sel2) : (lk == fl2 + 1.0 ? step(sel2, fr2) : 0.0);
      glint = max(glint, on2 * lens2 * keep2);
    }
    glint *= smoothstep(0.0, 0.02, a2);
    float stroke = step(uExtra2.z, s2) * (1.0 - glint);
    extraCol = uRamp[uN - 1]; extraMix = glint;
    // light strokes lift the sea to its light blue, never to the glint white
    // (white is for the glints; a hairline of white reads as a scratch)
    Lp = mix(Lp, min(Lp + uExtra2.w, uThr[uN - 2] - 0.05), stroke);
  } else if (mode == 5) { // FOLIAGE: a1 = needle angle
    vec2 q = rot(a1 * 3.14159) * w / nScale;
    float nd = gnoise(q * vec2(0.35, 4.0) + seed);
    float clump = fbm3(w / (nScale * 3.0) + seed * 2.1);
    Lp = L + (nd - 0.5) * uExtra2.x + (clump - 0.5) * uExtra2.y;
    alpha = A * smoothstep(0.35, 0.65, A + (fbm3(w / (nScale * 0.7) + 5.0) - 0.5) * uExtra.x * 2.0);
  } else if (mode == 2 && uExtra2.x > 0.0) { // ROCK with relief lighting
    float sc = uExtra2.y;
    float e = sc * 0.04;
    float h0 = reliefH(w, sc, seed);
    float hx = reliefH(w + vec2(e, 0.0), sc, seed), hy = reliefH(w + vec2(0.0, e), sc, seed);
    vec3 n = normalize(vec3(-(hx - h0) / e * sc * 0.18, -(hy - h0) / e * sc * 0.18, 1.0));
    vec3 l = normalize(vec3(uExtra2.z, uExtra2.w, 0.75));
    float lam = clamp(dot(n, l), 0.0, 1.0);
    float rel = mix(1.0, lam * 1.45, uExtra2.x);
    Lp = clamp(Lp * rel, 0.0, 1.0) + (Lp - L) * 0.0;
  } else if (mode == 6) { // WOOD: a1 = grain angle
    vec2 q = rot(a1 * 3.14159) * w / nScale;
    float gr = gnoise(q * vec2(0.06, 1.6) + seed) + 0.35 * gnoise(q * vec2(0.2, 6.0) + seed + 3.0);
    Lp = L + (gr - 0.68) * uExtra2.x;
  } else if (mode == 8) { // SAND: streaks along x
    float st = gnoise(w * vec2(0.035, 0.9) / nScale + seed);
    Lp = L + (st - 0.5) * uExtra2.x;
  } else if (mode == 10) { // MOUNTAIN: a2 = snow amount (altitude)
    float streak = gnoise(vec2(w.x / (nScale * 0.18), w.y / (nScale * 2.4)) + seed);
    float rid = 1.0 - abs(gnoise(w / (nScale * 0.6) + seed * 3.0) * 2.0 - 1.0);
    float snow = a2 + (streak - 0.5) * 0.9 + (rid - 0.5) * 0.35;
    // snow prints only where the guide paints snow (B > 0): no stray ticks on bare slopes
    float sn = smoothstep(0.48, 0.52, snow) * smoothstep(0.015, 0.03, a2);
    extraCol = mix(uExtra2.rgb, vec3(1.0), smoothstep(0.35, 0.7, L));
    extraMix = sn;
  }

  // ---------- posterise ----------
  vec3 col = uRamp[0];
  float fw = max(fwidth(Lp), 0.0008) * 0.75;
  if (mode == 4) fw = min(fw, 0.03);   // a stroke's edge is a step: its fwidth must not smear it into the top tone
  for (int i = 0; i < 7; i++) {
    if (i >= uN - 1) break;
    float s = smoothstep(uThr[i] - fw, uThr[i] + fw, Lp);
    col = mix(col, uRamp[i + 1], s);
  }
  col = mix(col, extraCol, extraMix);

  // ---------- engraved hatching ----------
  if (uHatch.w > 0.0) {
    float spacing = max(uHatch.y * uK, 2.2);          // px
    float ang = uHatch.x;
    // chisel marks, not a ruled screen (standards 31 and 32): hatch.vary turns the
    // strokes by up to +-vary/2 degrees per patch of hatch.varyScale world units, so
    // the engraving follows the local bedding instead of one machine angle
    if (uHatch3.w > 0.0 || uHatch5.y > 0.0) {
      vec2 ac = floor(wm / max(uHatch5.x, 1.0) + seed * 3.3);
      ang += (h21(ac + 57.0) - 0.5) * uHatch3.w;   // one angle per patch: facets of parallel strokes
      // hatch.alt (standard 39): a share of the patches is chiselled at a SECOND angle, so a
      // floor's marks run across the tread with some along it, as plate 4's stairs do. One
      // angle per patch either way, so each patch still reads as parallel chisel strokes.
      if (uHatch5.y > 0.0 && h21(ac + 91.0) < uHatch5.y) ang += uHatch5.z;
    }
    vec2 hd = vec2(cos(ang), sin(ang));
    vec2 hn = vec2(-hd.y, hd.x);
    float jit = (fbm3(wm / (nScale * 0.6) + 11.0) - 0.5) * 0.9 * uHatch3.y;
    float hc = dot(px, hn) / spacing + jit;
    float lineIdx = floor(hc);
    float d = abs(fract(hc) - 0.5) * spacing;
    // width in world units; jitter gives each engraved line its own weight
    float lw = uHatch.z * uK * mix(1.0 - 0.35 * uHatch3.x, 1.0 + 0.8 * uHatch3.x, h21(vec2(lineIdx, floor(seed * 7.0) + 3.0)));
    float line = 1.0 - smoothstep(lw * 0.5 - 0.6, lw * 0.5 + 0.6, d);
    float along = dot(px, hd) / (spacing * uHatch3.z);
    float dash = smoothstep(uHatch2.z - 0.05, uHatch2.z + 0.05, gnoise(vec2(along, lineIdx * 1.37) + seed));
    float band = smoothstep(uHatch2.x - 0.04, uHatch2.x + 0.04, Lp) * (1.0 - smoothstep(uHatch2.y - 0.04, uHatch2.y + 0.04, Lp));
    band = max(band, a2 * step(0.5, uExtra.w));
    band *= mix(1.0, min(wth, 1.2), uHatch4.y * step(0.62, Lp));   // the upper band's strokes follow the weathering (never doubled to black)
    // engraving reaches every lit face (standard 31): plate 4's lit limestone carries
    // its mid-tones as short engraved strokes - sparse on clean dressed stone
    // (hatch.litSparse raises their dash threshold there), dense inside the patches
    float Wg = smoothstep(0.35, 0.75, W);
    float litB = uHatch4.x * smoothstep(uHatch2.y - 0.04, uHatch2.y + 0.04, Lp) * mix(0.7, 1.0, Wg);
    float thL = uHatch2.z + mix(uHatch4.z, -0.4 * uHatch4.z, Wg);
    float dashL = smoothstep(thL - 0.04, thL + 0.04, gnoise(vec2(along * 2.2, lineIdx * 1.37) + seed + 5.0)); // shorter strokes on lit faces
    float h = line * max(dash * band, dashL * litB) * uHatch.w;
    if (uHatch2.w > 0.0 && Lp < uHatch2.w) { // cross hatch in the deepest tones
      float hc2 = dot(px, hd) / spacing + jit;
      float d2 = abs(fract(hc2) - 0.5) * spacing;
      h = max(h, (1.0 - smoothstep(lw * 0.5 - 0.6, lw * 0.5 + 0.6, d2)) * band * uHatch.w * 0.8);
    }
    col = mix(col, uHatchCol, clamp(h, 0.0, 1.0));
  }

  // ---------- specks ----------
  if (uSpeck.x > 0.0 || uSpeck.z > 0.0 || uSpeck3.x > 0.0) {
    float asp = max(uSpeck2.z, 0.25);
    // pit density follows the shade; uSpeck2.x keeps a share of it on lit faces,
    // uSpeck2.y gathers the pits into weathered patches and uSpeck2.w into the
    // darker facets, so pits sit in the grey patches (mean density unchanged)
    float shadeK = mix(1.0 - Lp, 1.0, uSpeck2.x) * mix(1.0, 2.0 * (1.0 - V.x), uSpeck2.w);
    float cl = mix(1.0, 2.0 * smoothstep(0.3, 0.7, gnoise(wm / max(uSpeck.y * 6.0, uSpeck3.y * 2.5) + seed * 1.7 + 5.0)), uSpeck2.y) * wth;
    vec2 sq = wm / max(uSpeck.y, 0.05);
    sq.x /= asp;                         // aspect > 1: pits wider than tall
    vec2 cid = floor(sq);
    float sp = h21(cid + seed * 3.0);
    vec2 cell = fract(sq) - 0.5;
    float dot1;
    if (uSpeck.w > 0.5) dot1 = 1.0 - smoothstep(0.18, 0.32, length(cell));
    else { // an angular chip: a random triangle (three jittered half-planes) per cell
      vec2 hr = h22(cid + seed * 3.0 + 41.0);
      vec2 c0 = (hr - 0.5) * 0.22;
      float a0 = hr.x * 6.2832, dm = -1.0;
      for (int k = 0; k < 3; k++) {
        float a = a0 + float(k) * 2.0944 + (h21(cid + vec2(float(k) * 7.1, 13.0)) - 0.5) * 1.1;
        dm = max(dm, dot(cell - c0, vec2(cos(a), sin(a))));
      }
      float ir = 0.09 + 0.07 * hr.y;  // inradius in cells (the chip spans ~2-3x that)
      dot1 = 1.0 - smoothstep(ir - 0.03, ir + 0.03, dm);
    }
    float dark = step(1.0 - uSpeck.x * shadeK * cl, sp) * dot1;
    if (uSpeck3.x > 0.0) { // big pits: a coarser grid of larger four-sided chips (plate 5's weathered holes)
      vec2 bq = wm / max(uSpeck3.y, 0.5); bq.x /= asp;
      vec2 bid = floor(bq), bc = fract(bq) - 0.5;
      vec2 br = h22(bid + seed * 5.0 + 23.0);
      vec2 b0 = (br - 0.5) * 0.3;
      float ba = br.x * 6.2832, bm = -1.0;
      for (int k = 0; k < 4; k++) {
        float a = ba + float(k) * 1.5708 + (h21(bid + vec2(float(k) * 5.3, 29.0)) - 0.5) * 1.0;
        bm = max(bm, dot(bc - b0, vec2(cos(a), sin(a))));
      }
      float bir = 0.08 + 0.12 * br.y;
      float bon = step(1.0 - uSpeck3.x * shadeK * cl, h21(bid + seed * 7.0 + 51.0));
      dark = max(dark, bon * (1.0 - smoothstep(bir - 0.025, bir + 0.025, bm)));
    }
    float light = step(1.0 - uSpeck.z * Lp, h21(floor(sq) + seed * 5.0 + 9.0)) * dot1;
    col = mix(col, uSpeckCol, dark);
    col = mix(col, uSpeckLight, light * (1.0 - dark));
  }

  // ---------- cracks (along Voronoi edges and ridged noise) ----------
  if (uExtra.y > 0.0) {
    // engraved, broken strokes: the weight varies along the crack and it
    // breaks off where the variation is low (uNoise2.y = how much)
    float var = gnoise(wm / (vScale * 0.35) + seed * 5.0 + 2.7);
    float cw = uExtra.z * mix(1.0, mix(0.35, 1.75, var), uNoise2.y);
    float crk = (1.0 - smoothstep(cw * 0.5, cw, V.y)) * step(0.55, h21(floor(wm / (vScale * 2.0)) + seed));
    // broken: only some cells are cracked (their outline, in short pieces)
    crk *= mix(1.0, smoothstep(0.32, 0.4, var) * step(0.7, fract(V.x * 7.31)), uNoise2.y);
    crk *= mix(1.0, smoothstep(0.3, 0.7, W) * 1.6, uNoise3.x);   // cracks gather in the weathered patches too
    col = mix(col, uInk, clamp(crk * uExtra.y, 0.0, 1.0) * smoothstep(0.15, 0.4, A));
  }

  // ---------- creases (light discontinuities inside the shape) ----------
  if (uOutline.z > 0.0) {
    // The crease inks the DARK side of a light step, and the dark core of a thin
    // feature (standard 31). A central difference cancelled in the middle of a thin
    // arris or joint, so at DPR 2 one joint printed as two dark lines with a light
    // core and at DPR 1 as one line. Taps sit 2 x creaseW world units out, so the
    // line is still about 2 x creaseW wide and a ramp still inks at the same slope.
    float e = max(2.0, uK * uOutline2.x * 2.0);
    float l1 = G(px + vec2(e, 0)).r, l2 = G(px - vec2(e, 0)).r;
    float l3 = G(px + vec2(0, e)).r, l4 = G(px - vec2(0, e)).r;
    float dk = max(max(l1, l2), max(l3, l4)) - g.r;
    float cr = smoothstep(uOutline.w, uOutline.w * 1.6, dk) * uOutline.z;
    col = mix(col, uInk, cr * step(0.5, A));
  }

  // ---------- silhouette ink ----------
  col = mix(col, uInk, sil);
  alpha = max(alpha, sil);
  if (alpha < 0.004) { frag = vec4(0.0); return; }
  frag = vec4(col * alpha, alpha);
}`;

// Sphere impostors: clouds and smoke are built from overlapping lit spheres.
// The frontmost sphere wins per pixel (depth test), so bulges intersect in
// real creases. The result is a light guide fed to the illustration pass.
const SVERT = `#version 300 es
in vec2 aCorner;
in vec4 aS;        // centre x, y (px, y down), radius px, depth offset px
in float aB;       // brightness bias
uniform vec2 uSize;
out vec2 vLocal; out vec2 vPx; out float vZc; out float vR; out float vB;
void main(){
  vec2 px = aS.xy + aCorner * aS.z * 1.02;
  vLocal = aCorner * 1.02; vPx = px; vZc = aS.w; vR = aS.z; vB = aB;
  // y maps so that texture row 0 is the TOP of the image, like canvas uploads
  gl_Position = vec4(px.x / uSize.x * 2.0 - 1.0, px.y / uSize.y * 2.0 - 1.0, 0.0, 1.0);
}`;
const SFRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vLocal; in vec2 vPx; in float vZc; in float vR; in float vB;
uniform vec3 uLight;
uniform vec4 uShade;   // ambient, diffuse, base y px, top y px
uniform vec2 uBase;    // base darkening, flat-base clip (1 = on)
uniform float uZmax;
uniform vec4 uGlobal;  // whole-form ellipsoid: centre x, y, radii x, y (px)
uniform vec2 uMix;     // weight of the whole-form shading, normal flatness
uniform vec4 uWorld;   // world x, y of FBO px (0, 0); world units per FBO px (x, y)
uniform vec4 uEdge;    // edge erosion: amount (fraction of the radius), noise scale (world), seed, unused
out vec4 frag;
uvec2 pcg2d(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}
vec2 h22(vec2 p){ uvec2 u = pcg2d(uvec2(ivec2(floor(p)) + 262144)); return vec2(u) * (1.0 / 4294967295.0); }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 ga = h22(i)*2.0-1.0, gb = h22(i+vec2(1,0))*2.0-1.0, gc = h22(i+vec2(0,1))*2.0-1.0, gd = h22(i+vec2(1,1))*2.0-1.0;
  float va = dot(ga, f), vb = dot(gb, f-vec2(1,0)), vc = dot(gc, f-vec2(0,1)), vd = dot(gd, f-vec2(1,1));
  return mix(mix(va,vb,u.x), mix(vc,vd,u.x), u.y) * 1.25 + 0.5;
}
float fbm2(vec2 p){ return (gnoise(p) * 0.65 + gnoise(mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3) * 0.35); }
void main(){
  float r2 = dot(vLocal, vLocal);
  if (r2 > 1.0) discard;
  if (uBase.y > 0.5 && vPx.y > uShade.z) discard;
  // edge erosion: a world-space noise bites the rim of every sphere, so
  // silhouettes and the creases between billows break into small lobes
  if (uEdge.x > 0.0) {
    float r0 = 1.0 - uEdge.x;
    if (r2 > r0 * r0) {
      vec2 wp = uWorld.xy + vPx * uWorld.zw;
      float n = smoothstep(0.3, 0.7, fbm2(wp / uEdge.y + uEdge.z)); // round bites, cauliflower-sized
      float rr = 1.0 - uEdge.x * n;
      if (r2 > rr * rr) discard;
    }
  }
  float z = sqrt(1.0 - r2);
  vec3 n = normalize(vec3(vLocal.x * uMix.y, vLocal.y * uMix.y, z));
  float lam = max(0.0, dot(n, uLight));
  vec2 gq = (vPx - uGlobal.xy) / max(vec2(1.0), uGlobal.zw);
  float gr2 = min(1.0, dot(gq, gq));
  vec3 gn = vec3(gq, sqrt(1.0 - gr2));
  float glam = max(0.0, dot(gn, uLight));
  lam = mix(lam, glam, uMix.x);
  float L = uShade.x + uShade.y * lam + vB;
  float f = clamp((vPx.y - uShade.w) / max(1.0, uShade.z - uShade.w), 0.0, 1.0);
  L *= mix(1.0, uBase.x, f * f);
  gl_FragDepth = 1.0 - clamp((vZc + z * vR) / uZmax, 0.0, 1.0);
  frag = vec4(clamp(L, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const MODES = { flat: 0, stone: 1, rock: 2, cloud: 3, sea: 4, foliage: 5, wood: 6, metal: 7, sand: 8, cloth: 9, mountain: 10, skin: 11 };

function hex(c) {
  if (Array.isArray(c)) return c;
  const s = c.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Illustrator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2; this.canvas.height = 2;
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    this.qbuf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.u[name] = gl.getUniformLocation(prog, info.name);
    }
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    // sphere program
    const sp = gl.createProgram();
    gl.attachShader(sp, sh(gl.VERTEX_SHADER, SVERT));
    gl.attachShader(sp, sh(gl.FRAGMENT_SHADER, SFRAG));
    gl.bindAttribLocation(sp, 1, 'aCorner'); gl.bindAttribLocation(sp, 2, 'aS'); gl.bindAttribLocation(sp, 3, 'aB');
    gl.linkProgram(sp);
    if (!gl.getProgramParameter(sp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(sp));
    this.sprog = sp;
    this.su = {};
    for (const nm of ['uSize', 'uLight', 'uShade', 'uBase', 'uZmax', 'uGlobal', 'uMix', 'uWorld', 'uEdge']) this.su[nm] = gl.getUniformLocation(sp, nm);
    this.svao = gl.createVertexArray();
    gl.bindVertexArray(this.svao);
    const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    this.sbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    this.fbo = gl.createFramebuffer();
    this.ftex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.ftex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.depth = gl.createRenderbuffer();
    this.fsize = [0, 0];
  }

  // Render lit sphere impostors (2x supersampled) into the FBO texture.
  // spheres: Float32Array of [x, y, r, z, bias] in target px (1x).
  // o.rows = [y0, y1]: render only pass rows y0..y1 (same pixels as those
  // rows of a full render; see Baker bands). The FBO only grows, so bands and
  // passes never reallocate it; the render sits at its bottom-left and
  // this.fview is the pass-pixel extent of the whole texture (for gRect).
  // The draw itself is deferred to the run() that shades this texture, which
  // knows the pass's world origin and scale (edge erosion needs them):
  //   o.edge (0..~0.3, fraction of each sphere's radius) / o.edgeScale (world
  //   units, default 14) / o.edgeSeed, or the same fields on the material
  //   (mat.edge, mat.edgeScale; opts win). edge 0 = the plain spheres.
  renderSpheres(data, count, w, h, o) {
    const gl = this.gl;
    const W = Math.min(this.maxSize, w * 2), HF = Math.min(this.maxSize, h * 2);
    const sx = W / w, sy = HF / h;
    const r0 = o.rows ? Math.round(o.rows[0] * sy) : 0;
    const H = o.rows ? Math.max(1, Math.round(o.rows[1] * sy) - r0) : HF;
    if (this.fsize[0] < W || this.fsize[1] < H) {
      const up = (v, have) => Math.min(this.maxSize, Math.max(have, Math.ceil(v / 256) * 256));
      const FW = up(W, this.fsize[0]), FH = up(H, this.fsize[1]);
      gl.bindTexture(gl.TEXTURE_2D, this.ftex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, FW, FH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.ftex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fsize = [FW, FH];
    }
    this.fview = [this.fsize[0] / sx, this.fsize[1] / sy];
    const d = new Float32Array(count * 5);
    let zmax = 1;
    for (let i = 0; i < count; i++) {
      d[i * 5] = data[i * 5] * sx; d[i * 5 + 1] = data[i * 5 + 1] * sy; d[i * 5 + 2] = data[i * 5 + 2] * sx;
      d[i * 5 + 3] = data[i * 5 + 3] * sx; d[i * 5 + 4] = data[i * 5 + 4];
      zmax = Math.max(zmax, d[i * 5 + 3] + d[i * 5 + 2]);
    }
    this.pendingSpheres = { d, count, W, HF, H, r0, sx, sy, zmax, o };
    return this.ftex;
  }

  // Draw the deferred sphere render (see renderSpheres). origin/k map pass
  // px to world units; mat may carry edge/edgeScale.
  drawSpheres(origin = [0, 0], k = 1, mat = {}) {
    const P = this.pendingSpheres;
    if (!P) return;
    this.pendingSpheres = null;
    const gl = this.gl, { d, count, W, HF, H, r0, sx, sy, zmax, o } = P;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    // a band keeps the full render's projection and shifts the viewport
    gl.viewport(0, -r0, W, HF);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.useProgram(this.sprog);
    const l = o.light || [-0.5, -0.6, 0.62];
    const ln = Math.hypot(l[0], l[1], l[2]);
    gl.uniform2f(this.su.uSize, W, HF);
    gl.uniform3f(this.su.uLight, l[0] / ln, l[1] / ln, l[2] / ln);
    gl.uniform4f(this.su.uShade, o.ambient ?? 0.52, o.diffuse ?? 0.6, (o.baseY ?? 1e9) * sy, (o.topY ?? 0) * sy);
    gl.uniform2f(this.su.uBase, o.baseDark ?? 0.8, o.flatBase === false ? 0 : 1);
    gl.uniform1f(this.su.uZmax, zmax * 1.01);
    const gb = o.global || [W / 2 / sx, HF / 2 / sy, W / 2 / sx, HF / 2 / sy];
    gl.uniform4f(this.su.uGlobal, gb[0] * sx, gb[1] * sy, gb[2] * sx, gb[3] * sy);
    gl.uniform2f(this.su.uMix, o.globalMix ?? 0.45, o.flatness ?? 0.65);
    const edge = Math.max(0, Math.min(0.6, o.edge ?? mat.edge ?? 0));
    const eScale = Math.max(0.5, o.edgeScale ?? mat.edgeScale ?? 14);
    const eSeed = ((o.edgeSeed ?? mat.edgeSeed ?? mat.seed ?? 0) * 7.13) % 1000 + 3.1;
    gl.uniform4f(this.su.uWorld, origin[0], origin[1], 1 / (sx * k), 1 / (sy * k));
    gl.uniform4f(this.su.uEdge, edge, eScale, eSeed, 0);
    gl.bindVertexArray(this.svao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STREAM_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Grow the GL output canvas now (it only grows; growing costs several ms),
  // so background bake units never have to.
  reserve(w, h) {
    const cv = this.canvas;
    const up = (v, have) => Math.min(this.maxSize, Math.max(have, Math.ceil(v / 256) * 256));
    if (cv.width < w || cv.height < h) { const nw = up(w, cv.width), nh = up(h, cv.height); cv.width = nw; cv.height = nh; }
  }

  // Copy a guide canvas into a texture of its own, so a big pass can be
  // shaded band by band over several frames (see Baker). release() frees it.
  upload(guide) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, guide);
    return tex;
  }
  release(tex) { if (tex) this.gl.deleteTexture(tex); }

  // Runs one material over `guide` (a canvas or texture) for a w x h pass and
  // returns the GL canvas holding premultiplied colour.
  // o.band = { y, h }: shade only rows y .. y+h of the pass (the GL canvas is
  //   then w x band.h; pixels are identical to the same rows of a full run).
  // o.gRect = [x, y, w, h]: where the guide texture sits in pass pixels
  //   (default: the whole pass), for guides that cover only part of it.
  // The GL canvas only grows (resizing it costs several ms): the output is
  // drawn at its bottom-left, and this.out = { x, y, w, h } is the source
  // rect to copy from the returned canvas.
  run(guide, w, h, mat, origin, k, time = 0, o = {}) {
    const gl = this.gl, u = this.u;
    if (guide === this.ftex) this.drawSpheres(origin, k, mat);
    const by = o.band ? o.band.y : 0, oh = o.band ? o.band.h : h;
    const cv = this.canvas;
    if (cv.width < w || cv.height < oh) {
      const up = (v, have) => Math.min(this.maxSize, Math.max(have, Math.ceil(v / 256) * 256));
      const nw = up(w, cv.width), nh = up(oh, cv.height);
      cv.width = nw; cv.height = nh;
    }
    this.out = { x: 0, y: cv.height - oh, w, h: oh };
    gl.viewport(0, 0, w, oh);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    if (guide instanceof WebGLTexture) gl.bindTexture(gl.TEXTURE_2D, guide);
    else { gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, guide); }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.qbuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(u.uGuide, 0);
    gl.uniform2f(u.uSize, w, oh);
    gl.uniform2f(u.uOff, 0, by);
    const gr = o.gRect || [0, 0, w, h];
    gl.uniform4f(u.uGRect, gr[0], gr[1], gr[2], gr[3]);
    // taps outside the valid guide area read its edge (as CLAMP_TO_EDGE would
    // on an exact-size texture), so a larger reused texture never leaks in
    const gc = o.gClamp || [0, 0, w, h], half = (o.gTexel ?? 1) / 2;
    gl.uniform4f(u.uGClamp, gc[0] + half, gc[1] + half, gc[2] - half, gc[3] - half);
    gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform1f(u.uK, k);
    gl.uniform1i(u.uMode, MODES[mat.mode] ?? 0);
    const ramp = mat.ramp.map(hex);
    const flat = new Float32Array(24);
    ramp.slice(0, 8).forEach((c, i) => flat.set(c, i * 3));
    gl.uniform3fv(u.uRamp, flat);
    const thr = new Float32Array(8);
    const t = mat.thr || ramp.slice(1).map((_, i) => (i + 1) / ramp.length);
    t.slice(0, 8).forEach((v, i) => { thr[i] = v; });
    gl.uniform1fv(u.uThr, thr);
    gl.uniform1i(u.uN, Math.min(8, ramp.length));
    gl.uniform1f(u.uSeed, mat.seed ?? 0);
    gl.uniform1f(u.uTime, time);
    const nz = mat.noise || {};
    // Mark scale (standard 26): mat.markScale (default 1) scales the whole stone
    // vocabulary - blotch fbm, facets, weather patches, pits, hatch and cracks -
    // for far or small stone. Below 1, marks that land under a few pass pixels
    // fade out instead of aliasing into speckle: facets (and cracks) under ~6 px
    // a cell, pits under ~2.4 px, hatch spaced under ~4.5 px. markScale 1 = as before.
    const ms = Math.max(0.05, mat.markScale ?? 1), fine = ms < 1;
    const fade = (v, a, b) => (fine ? Math.min(1, Math.max(0, (v - a) / (b - a))) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (v - a) / (b - a)))) : 1);
    const vS = (nz.vScale ?? 20) * ms, fK = fade(vS * k, 3, 6);
    gl.uniform4f(u.uNoise, (nz.scale ?? 40) * ms, nz.amp ?? 0, vS, (nz.vAmp ?? 0) * fK);
    gl.uniform4f(u.uNoise2, nz.warp ?? 1.4, mat.crack?.broken ?? 1, nz.vStretch ?? 1, nz.lit ?? 0.9);
    // weathered patches: noise.wScale (world, default 3.5 x noise.scale), wSharp (edge gain, 4),
    // wCover (share of the stone in patches, 0.5), patch (tone drop on lit faces, 0), litCap (lit facet cap)
    const wSc = (nz.wScale ?? (nz.scale ?? 40) * 3.5) * ms, wG = nz.wSharp ?? 4, wc = Math.min(0.95, Math.max(0.05, nz.wCover ?? 0.5));
    const zc = Math.sign(wc - 0.5) * Math.sqrt(-2 * Math.log(1 - Math.abs(2 * wc - 1) * 0.999)) * 0.8;  // ~inverse normal
    gl.uniform4f(u.uNoise3, nz.weather ?? 0, wSc, wG, wG * 0.11 * zc);
    // uNoise4.w: sea glint size (mat.glintSize, default 1); unused by every other mode
    gl.uniform4f(u.uNoise4, nz.patch ?? 0, nz.litCap ?? 9, nz.shadeW ?? 0, mat.mode === 'sea' ? Math.max(0.25, Math.min(3, mat.glintSize ?? 1)) : 0);
    const mo = mat.markOffset || [0, 0];
    gl.uniform2f(u.uMarkOff, mo[0], mo[1]);
    const ht = mat.hatch;
    if (ht) {
      // width (world units) defaults to wfrac x spacing when only wfrac is given
      const hs = (ht.spacing ?? 3) * ms, hw = ht.width != null ? ht.width * ms : (ht.wfrac ? ht.wfrac * hs : 0.8);
      gl.uniform4f(u.uHatch, ((ht.angle ?? 90) * Math.PI) / 180, hs, hw, (ht.strength ?? 0.6) * fade(hs * k, 2.6, 4.5));
      gl.uniform4f(u.uHatch2, ht.lo ?? 0.2, ht.hi ?? 0.7, ht.dash ?? 0.35, ht.cross ?? 0);
      gl.uniform4f(u.uHatch3, ht.jitter ?? 0, ht.wobble ?? 1, ht.dashLen ?? 5, ((ht.vary ?? 0) * Math.PI) / 180);
      gl.uniform4f(u.uHatch4, ht.lit ?? 0, ht.weather ?? 0, ht.litSparse ?? 0, 0);
      // hatch.alt = { angle (degrees), share 0..1 }: that share of the vary patches is
      // chiselled at a second angle instead (standard 39). Unset = one mean angle as before.
      const alt = ht.alt;
      gl.uniform4f(u.uHatch5, ht.varyScale != null ? ht.varyScale * ms : hs * 6,   // hs already carries markScale
        alt ? Math.min(1, Math.max(0, alt.share ?? 0.5)) : 0,
        alt ? (((alt.angle ?? 0) - (ht.angle ?? 90)) * Math.PI) / 180 : 0, 0);
      gl.uniform3fv(u.uHatchCol, hex(ht.color || mat.ink || '#0b0b10'));
    } else gl.uniform4f(u.uHatch, 0, 1, 0, 0);
    const sp = mat.speck;
    if (sp) {
      const ss = (sp.size ?? 1.2) * ms, bs = (sp.bigSize ?? 12) * ms;
      gl.uniform4f(u.uSpeck, (sp.dark ?? 0) * fade(ss * k, 1.2, 2.4), ss, sp.light ?? 0, sp.shape === 'dot' ? 1 : 0);
      gl.uniform4f(u.uSpeck2, sp.lit ?? 0, sp.cluster ?? 0, sp.aspect ?? 1, sp.facet ?? 0);
      gl.uniform4f(u.uSpeck3, (sp.big ?? 0) * fade(bs * k * 0.3, 1.2, 2.4), bs, 0, 0);
      gl.uniform3fv(u.uSpeckCol, hex(sp.color || mat.ink || '#0b0b10'));
      gl.uniform3fv(u.uSpeckLight, hex(sp.lightColor || ramp[ramp.length - 1]));
    } else { gl.uniform4f(u.uSpeck, 0, 1, 0, 0); gl.uniform4f(u.uSpeck3, 0, 12, 0, 0); }
    const ol = mat.outline || {};
    gl.uniform4f(u.uOutline, ol.width ?? 0, ol.sil ?? 0, ol.crease ?? 0, ol.creaseThr ?? 0.2);
    gl.uniform4f(u.uOutline2, ol.creaseW ?? 1, 0, 0, 0);
    gl.uniform3fv(u.uInk, hex(mat.ink || '#0b0b10'));
    const ex = mat.extra || {};
    gl.uniform4f(u.uExtra, mat.erode ?? 0, (mat.crack?.amp ?? 0) * fK, mat.crack?.width ?? 0.06, ex.hatchByAux2 ? 1 : 0);
    let e2 = mat.extra2 || [0, 0, 0, 0];
    if (mat.mode === 'sea' && mat.calm > 0) { // calm sea (plate 4's flat night sea): rarer, fainter light strokes
      const c = Math.min(1, mat.calm), mx = (a, b) => a + (b - a) * c;
      e2 = [mx(e2[0], 0.3), e2[1], mx(e2[2], 0.975), mx(e2[3], 0.25)];
    }
    gl.uniform4f(u.uExtra2, ...(typeof e2[0] === 'string' ? [...hex(e2[0]), 0] : e2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}
