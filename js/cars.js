// Procedural cars. Every body is a loft: rounded-rectangle cross-sections swept along the
// car's length, with paint / glass / lamps assigned per quad. No model files.
import * as THREE from './three.js';
import { RoundedBoxGeometry } from './addons.js';

// Cross-section topology (per half): bottom, bottom corner, side, top corner, top.
const NB = 2, NC = 4, NS = 8, NT = 5, NE = 5;
const HALF = NB + NC + NS + NT + NE;
const RING = HALF * 2;

// Material slots shared by the body and cabin lofts.
const P = 0, P2 = 1, K = 2, H = 3, T = 4, A = 5, G = 6;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const inR = (v, r) => v >= r[0] && v <= r[1];

// Piecewise-linear profile with a small box filter so corners come out rounded.
function poly(pts, sm = 0.05) {
  const n = pts.length - 1;
  const lin = (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n][0]) return pts[n][1];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x <= b[0]) return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0] || 1e-6));
    }
    return pts[n][1];
  };
  return (x) => { let s = 0; for (let k = -3; k <= 3; k++) s += lin(x + (k / 3) * sm); return s / 7; };
}

function stations(x0, x1, n, breaks = []) {
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(x0 + (x1 - x0) * (i / n));
  for (const d of [0.012, 0.028, 0.048, 0.075, 0.105, 0.14, 0.18]) xs.push(x0 + d, x1 - d);
  for (const b of breaks) if (b > x0 && b < x1) xs.push(b);
  xs.sort((a, b) => a - b);
  const out = [xs[0]];
  for (const x of xs) if (x - out[out.length - 1] > 0.007) out.push(x);
  out[out.length - 1] = x1;
  return out;
}

function sectionHalf(hw, yb, yt, o) {
  const hh = yt - yb;
  let rb = Math.min(o.rb, hw * 0.95), rt = Math.min(o.rt, hw * 0.95);
  if (rb + rt > hh * 0.98) { const k = (hh * 0.98) / (rb + rt); rb *= k; rt *= k; }
  const pts = [];
  for (let k = 0; k <= NB; k++) pts.push([(hw - rb) * (k / NB), yb]);
  for (let k = 1; k <= NC; k++) { const a = -Math.PI / 2 + (Math.PI / 2) * (k / NC); pts.push([hw - rb + rb * Math.cos(a), yb + rb + rb * Math.sin(a)]); }
  for (let k = 1; k <= NS; k++) pts.push([hw, yb + rb + (hh - rb - rt) * (k / NS)]);
  for (let k = 1; k <= NT; k++) { const a = (Math.PI / 2) * (k / NT); pts.push([hw - rt + rt * Math.cos(a), yt - rt + rt * Math.sin(a)]); }
  for (let k = 1; k <= NE; k++) pts.push([(hw - rt) * (1 - k / NE), yt]);
  for (const p of pts) {
    const v = hh > 1e-5 ? (p[1] - yb) / hh : 0, u = hw > 1e-5 ? p[0] / hw : 0;
    p[0] = p[0] * (1 - o.tumble * Math.pow(v, o.tumblePow)) + o.bulge * Math.sin(Math.PI * v) * u;
    p[1] += o.crown * (1 - u * u) * smooth(0.55, 1, v);
  }
  return pts;
}

function zoneOf(j) {
  const side = j < HALF ? 1 : -1;
  let h = j < HALF ? j : RING - 1 - j;
  if (h < NB) return { zone: 'B', row: h, side }; h -= NB;
  if (h < NC) return { zone: 'BC', row: h, side }; h -= NC;
  if (h < NS) return { zone: 'S', row: h, side }; h -= NS;
  if (h < NT) return { zone: 'TC', row: h, side }; h -= NT;
  return { zone: 'T', row: h, side };
}
const ZONES = Array.from({ length: RING }, (_, j) => zoneOf(j));

function loft(o) {
  const { xs } = o, n = xs.length, pos = [];
  for (const x of xs) {
    const yb = o.bottom(x);
    const half = sectionHalf(Math.max(o.half(x), 0.004), yb, Math.max(o.top(x), yb + 0.004), o);
    for (let j = 0; j <= HALF; j++) pos.push(x, half[j][1], half[j][0]);
    for (let j = HALF + 1; j < RING; j++) pos.push(x, half[RING - j][1], -half[RING - j][0]);
  }
  const buckets = Array.from({ length: o.slots }, () => []);
  const q = { x: 0, zone: '', row: 0, side: 1 };
  for (let i = 0; i < n - 1; i++) {
    q.x = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < RING; j++) {
      const z = ZONES[j]; q.zone = z.zone; q.row = z.row; q.side = z.side;
      const a = i * RING + j, b = i * RING + ((j + 1) % RING), c = (i + 1) * RING + ((j + 1) % RING), d = (i + 1) * RING + j;
      buckets[o.mat(q)].push(a, d, b, b, d, c);
    }
  }
  // End caps
  for (const [i, front] of [[0, false], [n - 1, true]]) {
    const x = xs[i], ci = pos.length / 3;
    pos.push(x, (o.bottom(x) + o.top(x)) / 2, 0);
    for (let j = 0; j < RING; j++) {
      const a = i * RING + j, b = i * RING + ((j + 1) % RING);
      if (front) buckets[o.cap].push(ci, b, a); else buckets[o.cap].push(ci, a, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const index = [];
  buckets.forEach((b, m) => { if (b.length) { geo.addGroup(index.length, b.length, m); for (const v of b) index.push(v); } });
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// --- materials -------------------------------------------------------------------------

// Cuts the wheel arches out of anything painted with this material (object-space discard).
function patchArches(mat, arch) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uArch = { value: arch };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArchPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvArchPos = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vArchPos;\nuniform vec4 uArch;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nvec2 aF = vArchPos.xy - uArch.xz; vec2 aR = vArchPos.xy - uArch.yz; float aQ = uArch.w * uArch.w; if (dot(aF, aF) < aQ || dot(aR, aR) < aQ) discard;');
  };
  return mat;
}

function patchFloorClip(mat, minY) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uMinY = { value: minY };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTubY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTubY = position.y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTubY;\nuniform float uMinY;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vTubY < uMinY) discard;');
  };
  return mat;
}

let LITE = false;
const paint = (color, o = {}) => (LITE
  ? new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.42 })
  : new THREE.MeshPhysicalMaterial({ color, metalness: o.metal ?? 0.5, roughness: o.rough ?? 0.42, clearcoat: o.coat ?? 1, clearcoatRoughness: 0.07 }));

let SHARED;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    tire: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.55, metalness: 0.7, side: THREE.DoubleSide }),
    alloy: new THREE.MeshStandardMaterial({ color: 0xd4d7dc, roughness: 0.28, metalness: 1 }),
    blackAlloy: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.35, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.4, metalness: 1 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.7, metalness: 0.1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.12, metalness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x04070a, roughness: 0.1, metalness: 0.2 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xd61f26, roughness: 0.5, metalness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    shadowTex: shadowTexture(),
    spillTex: spillTexture(),
    beamGeo: beamGeometry(),
  };
  return SHARED;
}

// Rounded-rectangle path. ctx.roundRect is missing on older mobile browsers, so draw it by hand.
// `r` is one radius or [top-left, top-right, bottom-right, bottom-left].
function roundRect(g, x, y, w, h, r) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  g.beginPath();
  g.moveTo(x + a, y); g.lineTo(x + w - b, y); g.quadraticCurveTo(x + w, y, x + w, y + b);
  g.lineTo(x + w, y + h - c); g.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  g.lineTo(x + d, y + h); g.quadraticCurveTo(x, y + h, x, y + h - d);
  g.lineTo(x, y + a); g.quadraticCurveTo(x, y, x + a, y);
  g.closePath();
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 26; g.shadowOffsetX = 600;
  g.fillStyle = '#000';
  roundRect(g, 46 - 600, 34, 164, 60, 26); g.fill();
  roundRect(g, 60 - 600, 44, 136, 40, 18); g.fill();
  return new THREE.CanvasTexture(c);
}

function spillTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// A headlight beam: a cone that starts bright at the lamp and fades to nothing.
function beamGeometry() {
  const len = 5.2, geo = new THREE.ConeGeometry(1.0, len, 24, 8, true).rotateZ(Math.PI / 2).translate(len / 2, 0, 0);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = Math.pow(Math.max(0, 1 - pos.getX(i) / len), 2.2); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

function plateTexture(text) {
  return canvasTex(416, 92, (g, w, h) => {
    g.fillStyle = '#f4f4f1'; roundRect(g, 2, 2, w - 4, h - 4, 10); g.fill();
    g.lineWidth = 4; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = '#1a3fa8'; roundRect(g, 4, 4, 44, h - 8, [8, 0, 0, 8]); g.fill();
    g.fillStyle = '#fff'; g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.fillText('TR', 26, h - 14);
    g.fillStyle = '#111'; g.font = `700 68px ${FONT}`; g.textBaseline = 'middle';
    g.fillText(text, 48 + (w - 52) / 2, h / 2 + 4);
  });
}

// --- wheels ----------------------------------------------------------------------------

function makeWheel(r, w, style = 'alloy') {
  const S = shared(), g = new THREE.Group();
  const prof = [[0.6, -0.5], [0.86, -0.5], [0.965, -0.42], [1, -0.28], [1, 0.28], [0.965, 0.42], [0.86, 0.5], [0.6, 0.5]]
    .map(([a, b]) => new THREE.Vector2(a * r, b * w));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 44).rotateX(Math.PI / 2), S.tire));
  const rr = r * 0.615;
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, w * 0.94, 36, 1, true).rotateX(Math.PI / 2), S.rimDark));
  const back = new THREE.Mesh(new THREE.CircleGeometry(rr, 36), S.rimDark); back.position.z = -w * 0.2; g.add(back);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.47, r * 0.47, 0.02, 32).rotateX(Math.PI / 2), S.steel); disc.position.z = w * 0.16; g.add(disc);
  if (style !== 'steel') { const cal = new THREE.Mesh(new RoundedBoxGeometry(r * 0.2, r * 0.42, 0.05, 2, 0.012), S.caliper); cal.position.set(-r * 0.38, r * 0.1, w * 0.2); g.add(cal); }
  const face = style === 'black' ? S.blackAlloy : style === 'steel' ? S.steel : S.alloy;
  const fz = w * 0.5 - 0.035;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rr - 0.004, 0.013, 8, 44), face); lip.position.z = w * 0.5 - 0.014; g.add(lip);
  const spokes = style === 'steel' ? 6 : style === 'black' ? 10 : 5;
  const sw = style === 'steel' ? r * 0.2 : style === 'black' ? r * 0.065 : r * 0.14;
  for (let k = 0; k < spokes; k++) {
    const sp = new THREE.Mesh(new RoundedBoxGeometry(rr * 0.98, sw, 0.03, 2, 0.008).translate(rr * 0.5, 0, 0), face);
    sp.rotation.z = (k / spokes) * Math.PI * 2 + 0.3; sp.position.z = fz; g.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.13, r * 0.17, 0.05, 20).rotateX(Math.PI / 2), face); hub.position.z = fz + 0.01; g.add(hub);
  return g;
}

// --- car assembly ----------------------------------------------------------------------

function assemble(spec, info) {
  const S = shared(), g = new THREE.Group();
  const { x0, x1, wheel: W, body: B, cab: C } = spec;
  const bottom = poly(B.bottom), deck = poly(B.deck), half = poly(B.half);
  const sec = { rb: B.rb ?? 0.05, rt: B.rt ?? 0.11, tumble: B.tumble ?? 0.035, tumblePow: 2, bulge: B.bulge ?? 0.018, crown: B.crown ?? 0.022 };
  const sideZ = (x, y) => {
    const yb = bottom(x), v = clamp((y - yb) / (deck(x) - yb), 0, 1);
    return half(x) * (1 - sec.tumble * v * v) + sec.bulge * Math.sin(Math.PI * v);
  };

  const R = W.r + (W.gap ?? 0.065);
  const arch = new THREE.Vector4(W.xF, W.xR, W.r, R);
  const col = spec.colors;
  const m = {
    paint: patchArches(paint(col.paint, col.paintOpt), arch),
    paint2: patchArches(paint(col.paint2 ?? 0xf1f1ee, col.paint2Opt), arch),
    plastic: patchArches(S.plastic.clone(), arch),
    head: patchArches(new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.18, metalness: 0.7, emissive: col.head ?? 0xf3f7ff, emissiveIntensity: 0 }), arch),
    tail: patchArches(new THREE.MeshStandardMaterial({ color: 0x4a0607, roughness: 0.25, metalness: 0.3, emissive: 0xff1418, emissiveIntensity: 0 }), arch),
    amber: patchArches(new THREE.MeshStandardMaterial({ color: 0x7a3a05, roughness: 0.3, emissive: 0xff8a12, emissiveIntensity: 0 }), arch),
  };
  const mats = [m.paint, m.paint2, m.plastic, m.head, m.tail, m.amber, S.glass];

  // Lower body
  const L = spec.lamps || {};
  const lamp = (q, l) => l && inR(q.x, l.x) && ((q.zone === 'S' && l.s && inR(q.row, l.s)) || (q.zone === 'TC' && l.tc && inR(q.row, l.tc)) || (q.zone === 'T' && l.t && inR(q.row, l.t)));
  const lampBreaks = [L.head, L.tail, L.amber].filter(Boolean).flatMap((l) => l.x);
  const bodyGeo = loft({
    xs: stations(x0, x1, spec.stations ?? 84, [...lampBreaks, ...(spec.breaks || [])]),
    bottom, top: deck, half, ...sec, slots: 7, cap: spec.capMat ?? P,
    mat: (q) => {
      if (lamp(q, L.head)) return H;
      if (lamp(q, L.tail)) return T;
      if (lamp(q, L.amber)) return A;
      return spec.paintRule?.(q) ?? P;
    },
  });
  g.add(new THREE.Mesh(bodyGeo, mats));

  // Cabin / greenhouse
  let cabZ = sideZ;
  if (C) {
    const roof = poly(C.roof, C.sm ?? 0.05), cHalf = C.half ? poly(C.half) : (x) => half(x) * (C.scale ?? 0.88);
    cabZ = (x, y) => { const yb = deck(x) - 0.07, v = clamp((y - yb) / (roof(x) - yb), 0, 1); return cHalf(x) * (1 - (C.tumble ?? 0.18) * v) + 0.012 * Math.sin(Math.PI * v); };
    const pillar = C.pillar ?? P, roofMat = C.roofMat ?? P;
    const cabGeo = loft({
      xs: stations(C.x0, C.x1, C.stations ?? 46, [...C.glass.flat(), ...C.roofX]),
      bottom: (x) => deck(x) - 0.07, top: roof, half: cHalf,
      rb: 0.02, rt: C.rt ?? 0.12, tumble: C.tumble ?? 0.18, tumblePow: 1, bulge: 0.012, crown: C.crown ?? 0.03, slots: 7, cap: P,
      mat: (q) => {
        const r = C.rule?.(q); if (r !== undefined) return r;
        if (q.zone === 'T') return inR(q.x, C.roofX) ? roofMat : (q.x > C.roofX[1] || C.rearGlass !== false) ? G : roofMat;
        if (q.zone === 'TC') return pillar;
        if (q.zone === 'S') return C.glass.some((r2) => inR(q.x, r2)) ? G : (C.sideMat ?? P);
        return P;
      },
    });
    g.add(new THREE.Mesh(cabGeo, mats));
  }

  // Wheels, wells and arch trim
  const tubMat = patchFloorClip(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }), Math.min(bottom(W.xF), bottom(W.xR)) + 0.02);
  const wheels = [];
  for (const wx of [W.xF, W.xR]) {
    const hw = half(wx), yb = bottom(wx);
    const tubLen = 2 * (hw - 0.03);
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.012, R + 0.012, tubLen, 36, 1, true).rotateX(Math.PI / 2).translate(wx, W.r, 0), tubMat);
    g.add(tub);
    const a = Math.asin(clamp((W.r - yb - 0.012) / R, -0.9, 0.9));
    for (const s of [1, -1]) {
      const zOut = (W.track ?? hw) - 0.006;
      const wall = new THREE.Mesh(new THREE.CircleGeometry(R + 0.012, 30).translate(wx, W.r, 0), tubMat);
      wall.position.z = s * (zOut - W.w - 0.07); g.add(wall);
      const wh = makeWheel(W.r, W.w, W.style);
      wh.position.set(wx, W.r, s * (zOut - W.w / 2)); if (s < 0) wh.rotation.y = Math.PI;
      g.add(wh); wheels.push(wh);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R, W.lip ?? 0.024, 8, 40, Math.PI + 2 * a), W.lipBlack ? S.plastic : m.paint.userData.lip || (m.paint.userData.lip = paint(col.paint, col.paintOpt)));
      lip.rotation.z = -a; lip.position.set(wx, W.r, s * (sideZ(wx, W.r + R * 0.75) - (W.lipInset ?? 0.012)));
      g.add(lip);
    }
  }

  // Contact shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 1.5, half(0) * 2 + 1.5), new THREE.MeshBasicMaterial({ map: S.shadowTex, transparent: true, opacity: 0.92, depthWrite: false, color: 0x000000 }));
  sh.rotation.x = -Math.PI / 2; sh.position.set((x0 + x1) / 2, 0.012, 0); sh.renderOrder = 4; sh.userData.fx = true; g.add(sh);

  // Headlight beams and their spill on the floor
  // Soft volumetric look: the cone fades along its length and towards its silhouette.
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(col.head ?? 0xeaf2ff) }, uOpacity: { value: 0 } },
    vertexShader: 'attribute vec3 color; varying float vK; varying vec3 vN; varying vec3 vV; void main() { vK = color.r; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vK; varying vec3 vN; varying vec3 vV; void main() { float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor, vK * edge * uOpacity); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const spillMat = new THREE.MeshBasicMaterial({ color: col.head ?? 0xeaf2ff, map: S.spillTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  if (spec.beam) {
    const [by, bz] = spec.beam;
    for (const s of [1, -1]) {
      const beam = new THREE.Mesh(S.beamGeo, beamMat);
      beam.position.set(x1 - 0.02, by, s * bz); beam.rotation.set(0, s * -0.05, -by / 6.5); beam.scale.set(1, 1, 0.9);
      beam.userData.fx = true; beam.renderOrder = 9; g.add(beam);
    }
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), spillMat);
    spill.rotation.x = -Math.PI / 2; spill.position.set(x1 + 2.5, 0.013, 0); spill.renderOrder = 5; spill.userData.fx = true; g.add(spill);
  }

  // Helpers for per-car details
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const box = (sx, sy, sz, mat, x, y, z, r = 0.015) => add(new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)), mat), x, y, z);
  const cyl = (r1, r2, h, mat, x, y, z, axis = 'y', seg = 22) => {
    const geo = new THREE.CylinderGeometry(r1, r2, h, seg);
    if (axis === 'x') geo.rotateZ(-Math.PI / 2); else if (axis === 'z') geo.rotateX(Math.PI / 2);
    return add(new THREE.Mesh(geo, mat), x, y, z);
  };
  const both = (fn) => { fn(1); fn(-1); };
  const glow = (color, base = 0x111111) => new THREE.MeshStandardMaterial({ color: base, roughness: 0.3, emissive: color, emissiveIntensity: 0 });
  const decal = (w, h, draw, res = 256) => {
    const tex = canvasTex(Math.round(res * (w / h)), res, draw);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.userData.fx = true; return mesh;
  };
  const sideDecal = (w, h, x, y, draw, onCab = false) => both((s) => { const d = decal(w, h, draw); if (s < 0) d.rotation.y = Math.PI; add(d, x, y, s * ((onCab ? cabZ(x, y) : sideZ(x, y)) + 0.006)); });
  // Panel gaps: thin dark seams that follow the curve of the body side.
  const doorLines = (xs, y0, y1) => both((s) => xs.forEach((x) => { for (let k = 0; k < 6; k++) { const ym = y0 + (y1 - y0) * ((k + 0.5) / 6); box(0.012, (y1 - y0) / 6 + 0.004, 0.012, S.plastic, x, ym, s * (sideZ(x, ym) - 0.001), 0.002); } }));
  const mirrors = (x, y, z, mat = m.paint) => both((s) => { box(0.11, 0.1, 0.17, mat, x, y, s * (z + 0.1), 0.035); box(0.05, 0.03, 0.1, S.plastic, x + 0.01, y - 0.04, s * (z + 0.03), 0.01); });
  const handles = (xs, y) => both((s) => xs.forEach((x) => box(0.15, 0.028, 0.03, S.plastic, x, y, s * sideZ(x, y), 0.01)));
  // Lamps mounted on the flat nose / tail of the boxier cars.
  const faceLamps = (front, y, z, w, h, r = 0.03) => both((s) => box(0.06, h, w, front ? m.head : m.tail, front ? x1 + 0.004 : x0 - 0.004, y, s * z, r));
  const plates = (yF, yR, dF = 0, dR = 0) => {
    const tex = plateTexture(info.plate), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
    const f = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), mat), x1 + 0.012 + dF, yF, 0); f.rotation.y = Math.PI / 2;
    const r = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), mat), x0 - 0.012 - dR, yR, 0); r.rotation.y = -Math.PI / 2;
  };

  const ctx = { g, m, S, spec, info, x0, x1, W, bottom, deck, half, sideZ, add, box, cyl, both, glow, decal, sideDecal, doorLines, mirrors, handles, plates, faceLamps, makeWheel, paint, FONT };
  const tick = spec.extras?.(ctx);

  g.traverse((o) => { if (o.isMesh && !o.userData.fx) o.castShadow = true; });

  const REV = 1.8, drive = { roll: 0, pitch: 0, throttle: 0, brake: 0 };
  let power = 0, revT = 0, flashT = 0;
  wheels.forEach((w) => { w.rotation.order = 'YXZ'; });
  return {
    group: g,
    size: { length: x1 - x0, x0, x1, width: half(0) * 2, height: C ? Math.max(...C.roof.map((p) => p[1])) : Math.max(...B.deck.map((p) => p[1])) },
    factoryPaint: `#${new THREE.Color(col.paint).getHexString()}`,
    setPower(p) { power = p; },
    setPaint(hex) { m.paint.color.set(hex); m.paint.userData.lip?.color.set(hex); },
    wheelbase: W.xF - W.xR, wheelRadius: W.r,
    // Wheels are stored front-right, front-left, rear-right, rear-left.
    setDrive(spin, steer, roll, pitch, throttle, brake) {
      wheels.forEach((w, k) => { const s = k % 2 ? -1 : 1; w.rotation.y = (s < 0 ? Math.PI : 0) + (k < 2 ? steer : 0); w.rotation.z = -s * spin; });
      drive.roll = roll; drive.pitch = pitch; drive.throttle = throttle; drive.brake = brake;
    },
    rev() { revT = REV; },
    flash() { flashT = 0.56; },
    update(t, dt = 0.016) {
      revT = Math.max(0, revT - dt); flashT = Math.max(0, flashT - dt);
      // Rev envelope: quick rise, hold, fall away.
      const rv = revT > 0 ? Math.min(1, (REV - revT) / 0.3) * Math.min(1, revT / 0.7) : 0;
      const fl = flashT > 0 && flashT % 0.28 > 0.1 ? 1 : 0;
      m.head.emissiveIntensity = 0.05 + 5 * power + 3 * rv * power + 7 * fl;
      m.tail.emissiveIntensity = 0.25 + 3.2 * power + 3 * rv * power + 7 * drive.brake;
      m.amber.emissiveIntensity = 0.1 + 1.6 * power + 6 * fl;
      beamMat.uniforms.uOpacity.value = 0.3 * power + 0.2 * rv * power + 0.3 * fl;
      spillMat.opacity = 0.16 * power + 0.1 * rv * power + 0.2 * fl;
      g.position.y = rv * 0.011 * Math.sin(t * 74);
      g.rotation.x = drive.roll + rv * 0.007 * Math.sin(t * 57);
      g.rotation.z = drive.pitch;
      tick?.(t, power * (1 + 0.9 * rv + 0.6 * drive.throttle));
    },
  };
}

// --- the seven cars --------------------------------------------------------------------

const txt = (g, text, x, y, size, color, weight = 700, align = 'center', italic = false) => {
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
};

const SPECS = {
  // 01 — service pickup for the auto repair shop ERP
  truck() {
    const x0 = -2.66, x1 = 2.66;
    return {
      x0, x1,
      wheel: { r: 0.415, w: 0.29, xF: 1.7, xR: -1.5, gap: 0.085, style: 'steel', lipBlack: true, lip: 0.04 },
      beam: [0.9, 0.7],
      body: {
        bottom: [[x0, 0.7], [x0 + 0.1, 0.5], [x0 + 0.32, 0.42], [x1 - 0.42, 0.42], [x1 - 0.1, 0.5], [x1, 0.68]],
        deck: [[x0, 1.04], [x0 + 0.06, 1.12], [-0.52, 1.12], [-0.42, 1.15], [1.0, 1.15], [1.2, 1.17], [2.3, 1.12], [x1 - 0.1, 1.06], [x1, 0.98]],
        half: [[x0, 0.9], [x0 + 0.14, 0.985], [2.2, 0.985], [x1 - 0.16, 0.95], [x1, 0.86]],
        rb: 0.07, rt: 0.1, tumble: 0.025, crown: 0.02,
      },
      cab: { x0: -0.5, x1: 1.34, roof: [[-0.52, 1.1], [-0.44, 1.84], [0.52, 1.86], [0.7, 1.82], [1.34, 1.14]], scale: 0.93, tumble: 0.11, rt: 0.14, glass: [[-0.28, 1.02]], roofX: [-0.4, 0.64], rearGlass: false },
      lamps: { amber: { x: [x1 - 0.3, x1 - 0.06], s: [6, 7] } },
      breaks: [x1 - 0.2, x0 + 0.2, -0.46],
      paintRule: (q) => ((q.zone === 'B' || q.zone === 'BC' || (q.zone === 'S' && q.row < 2 && (q.x > x1 - 0.2 || q.x < x0 + 0.2))) ? K : (q.zone === 'S' && q.row === 3 && q.x < x1 - 0.3 && q.x > x0 + 0.13) ? P2 : undefined),
      colors: { paint: 0x1a4fd6, paint2: 0xf2f1ec },
      extras(c) {
        const { box, cyl, both, S, m, add } = c;
        box(2.04, 0.05, 1.7, S.plastic, -1.58, 1.14, 0, 0.02);                       // bed cover
        both((s) => box(0.07, 0.74, 0.07, S.plastic, -0.6, 1.5, s * 0.78));          // headache rack
        box(0.07, 0.07, 1.63, S.plastic, -0.6, 1.88, 0);
        box(0.03, 0.05, 1.5, S.plastic, -0.6, 1.62, 0); box(0.03, 0.05, 1.5, S.plastic, -0.6, 1.4, 0);
        const red = new THREE.MeshStandardMaterial({ color: 0xc9211e, roughness: 0.45, metalness: 0.5 });
        box(0.52, 0.4, 1.36, red, -1.0, 1.37, 0, 0.03); box(0.54, 0.03, 1.38, S.steel, -1.0, 1.585, 0, 0.01);   // tool chest
        both((s) => box(0.02, 0.05, 0.2, S.chrome, -0.735, 1.44, s * 0.36, 0.008));
        const spare = c.makeWheel(0.4, 0.27, 'steel'); spare.rotation.x = -Math.PI / 2; add(spare, -1.86, 1.31, 0.33);
        const cone = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 });
        for (let k = 0; k < 3; k++) cyl(0.03, 0.13, 0.42, cone, -1.9, 1.38 + k * 0.07, -0.5, 'y', 18);
        box(0.3, 0.03, 0.3, cone, -1.9, 1.18, -0.5, 0.01);
        const beacon = c.glow(0xff9a1a, 0x8a4a08);
        box(0.6, 0.035, 0.22, S.plastic, 0.12, 1.905, 0, 0.012);
        both((s) => cyl(0.062, 0.07, 0.1, beacon, 0.12, 1.965, s * 0.19, 'y', 16));
        box(0.07, 0.07, 1.86, S.plastic, x1 + 0.1, 0.72, 0, 0.03);                    // bull bar
        both((s) => { box(0.07, 0.5, 0.07, S.plastic, x1 + 0.1, 0.95, s * 0.5, 0.03); box(0.16, 0.06, 0.06, S.plastic, x1 + 0.03, 0.74, s * 0.5, 0.02); });
        box(0.07, 0.07, 1.07, S.plastic, x1 + 0.1, 1.2, 0, 0.03);
        box(0.05, 0.3, 1.04, S.plastic, x1 + 0.005, 0.88, 0, 0.02);                   // grille
        for (let k = 0; k < 4; k++) box(0.06, 0.02, 0.96, S.chrome, x1 + 0.012, 0.78 + k * 0.066, 0, 0.008);
        c.faceLamps(true, 0.9, 0.7, 0.28, 0.22, 0.04); c.faceLamps(false, 0.9, 0.86, 0.12, 0.3, 0.03);
        both((s) => box(1.9, 0.05, 0.2, S.plastic, 0.1, 0.44, s * 1.0, 0.02));       // side steps
        box(0.1, 0.14, 1.9, S.plastic, x0 - 0.04, 0.62, 0, 0.03);                     // rear bumper
        c.mirrors(0.95, 1.33, 0.93, S.plastic); c.handles([0.02], 1.02); c.doorLines([-0.44, 1.0], 0.52, 1.13);
        c.sideDecal(1.25, 0.34, 0.12, 0.83, (g, w, h) => {
          txt(g, 'OTO SERVİS', w / 2, h * 0.4, h * 0.6, '#ffffff', 800, 'center', true);
          txt(g, 'ERP ·  WORK ORDERS  ·  INVENTORY  ·  INVOICING', w / 2, h * 0.84, h * 0.17, '#ffd23a', 600);
        });
        c.plates(0.56, 0.86);
        return (t, p) => { beacon.emissiveIntensity = p * (2.2 + 4.5 * Math.max(0, Math.sin(t * 7))); };
      },
    };
  },

  // 02 — the grand tourer that was sold and delivered
  coupe() {
    const x0 = -2.26, x1 = 2.3;
    return {
      x0, x1,
      wheel: { r: 0.35, w: 0.28, xF: 1.4, xR: -1.3, gap: 0.05, style: 'black' },
      beam: [0.6, 0.66],
      body: {
        bottom: [[x0, 0.52], [x0 + 0.1, 0.27], [x0 + 0.36, 0.2], [1.95, 0.17], [x1 - 0.1, 0.2], [x1, 0.34]],
        deck: [[x0, 0.82], [x0 + 0.06, 0.93], [-1.7, 0.97], [-0.6, 0.98], [0.5, 0.95], [1.35, 0.85], [2.0, 0.68], [x1 - 0.06, 0.56], [x1, 0.47]],
        half: [[x0, 0.76], [x0 + 0.14, 0.9], [-1.35, 0.97], [1.3, 0.96], [1.95, 0.88], [x1 - 0.1, 0.74], [x1, 0.6]],
        rb: 0.05, rt: 0.16, tumble: 0.06, bulge: 0.028, crown: 0.035,
      },
      cab: { x0: -1.82, x1: 1.02, roof: [[-1.84, 0.9], [-1.0, 1.19], [-0.36, 1.275], [0.08, 1.26], [1.02, 0.9]], scale: 0.86, tumble: 0.2, rt: 0.17, glass: [[-0.86, 0.62]], roofX: [-0.62, 0.16], pillar: K, sm: 0.12 },
      lamps: { head: { x: [x1 - 0.56, x1 - 0.26], tc: [1, 3] }, tail: { x: [x0 + 0.015, x0 + 0.1], s: [5, 7], tc: [0, 1] } },
      breaks: [x1 - 0.14],
      paintRule: (q) => {
        if (q.zone === 'B' || q.zone === 'BC') return K;
        if (q.zone === 'S' && q.row < 2 && q.x > x1 - 0.14) return K;
        if (q.zone === 'T' && (q.row === 2 || q.row === 3)) return P2;
        return undefined;
      },
      colors: { paint: 0xc20f1f, paint2: 0xf3f1ea, paintOpt: { metal: 0.6, rough: 0.34 } },
      extras(c) {
        const { box, cyl, both, S, m, add } = c;
        box(0.34, 0.035, 1.84, S.plastic, x1 - 0.14, 0.185, 0, 0.012);               // splitter
        both((s) => box(2.3, 0.07, 0.07, S.plastic, 0.06, 0.2, s * 0.94, 0.02));     // side skirts
        box(0.05, 0.14, 0.9, S.plastic, x1 + 0.0, 0.36, 0, 0.02);                     // intake
        both((s) => box(0.06, 0.2, 0.06, S.plastic, -1.98, 1.02, s * 0.56, 0.02));    // wing
        box(0.3, 0.028, 1.66, m.paint, -2.03, 1.13, 0, 0.012);
        both((s) => box(0.32, 0.1, 0.03, m.paint, -2.03, 1.11, s * 0.83, 0.012));
        box(0.08, 0.2, 1.3, S.plastic, x0 - 0.0, 0.42, 0, 0.03);                      // diffuser
        both((s) => cyl(0.055, 0.055, 0.12, S.chrome, x0 - 0.03, 0.4, s * 0.34, 'x', 18));
        c.mirrors(0.72, 0.99, 0.84, m.paint); c.handles([-0.1], 0.82); c.doorLines([-0.84, 0.64], 0.26, 0.93);
        const tag = c.decal(0.36, 0.2, (g, w, h) => {
          g.fillStyle = '#f6f2e6'; roundRect(g, 4, 4, w - 8, h - 8, 14); g.fill();
          g.lineWidth = 8; g.strokeStyle = '#d0142a'; g.stroke();
          txt(g, 'SOLD', w / 2, h * 0.43, h * 0.56, '#d0142a', 800);
          txt(g, 'DELIVERED · 5.0★', w / 2, h * 0.8, h * 0.17, '#22201c', 700);
        });
        tag.rotation.set(0, Math.PI / 2, 0); tag.rotation.order = 'YXZ'; tag.rotation.x = -0.93; add(tag, 0.55, 1.105, 0.24);
        c.sideDecal(0.5, 0.2, -0.2, 0.42, (g, w, h) => { txt(g, 'TC-02', w / 2, h / 2, h * 0.8, '#f3f1ea', 800, 'center', true); });
        c.plates(0.48, 0.66);
      },
    };
  },

  // 03 — the overlander for the geography game
  suv() {
    const x0 = -2.26, x1 = 2.26;
    return {
      x0, x1,
      wheel: { r: 0.43, w: 0.3, xF: 1.4, xR: -1.34, gap: 0.09, style: 'steel', lipBlack: true, lip: 0.05, lipInset: 0.0 },
      beam: [0.97, 0.7],
      body: {
        bottom: [[x0, 0.74], [x0 + 0.1, 0.52], [x0 + 0.3, 0.46], [x1 - 0.3, 0.46], [x1 - 0.1, 0.52], [x1, 0.72]],
        deck: [[x0, 1.1], [x0 + 0.05, 1.16], [1.02, 1.18], [1.15, 1.2], [2.08, 1.17], [x1 - 0.06, 1.12], [x1, 1.04]],
        half: [[x0, 0.9], [x0 + 0.1, 0.975], [2.06, 0.975], [x1 - 0.08, 0.94], [x1, 0.88]],
        rb: 0.07, rt: 0.08, tumble: 0.015, crown: 0.015, bulge: 0.012,
      },
      cab: { x0: -2.22, x1: 1.2, roof: [[-2.24, 1.14], [-2.17, 1.95], [0.6, 1.97], [0.74, 1.93], [1.2, 1.18]], scale: 0.95, tumble: 0.075, rt: 0.11, glass: [[-1.98, -1.3], [-1.12, -0.2], [-0.06, 0.92]], roofX: [-2.2, 0.68], roofMat: P2, rearGlass: false, crown: 0.02 },
      lamps: { amber: { x: [x1 - 0.2, x1 - 0.06], s: [6, 7] } },
      paintRule: (q) => ((q.zone === 'B' || q.zone === 'BC' || (q.zone === 'S' && q.row < 2)) ? K : undefined),
      colors: { paint: 0x5f7335, paint2: 0xece8dc, paintOpt: { metal: 0.25, rough: 0.5 } },
      extras(c) {
        const { box, cyl, both, S, m, add } = c;
        both((s) => { box(2.5, 0.04, 0.04, S.plastic, -0.8, 2.09, s * 0.74, 0.012); for (const x of [-1.9, -0.8, 0.3]) box(0.04, 0.12, 0.04, S.plastic, x, 2.03, s * 0.74, 0.01); });  // roof rack
        for (const x of [-2.0, -1.4, -0.8, -0.2, 0.4]) box(0.04, 0.03, 1.5, S.plastic, x, 2.09, 0, 0.01);
        const canvas = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.9 });
        box(1.1, 0.3, 1.1, canvas, -1.3, 2.26, 0, 0.08);                              // tent / duffel
        const jerry = new THREE.MeshStandardMaterial({ color: 0x9c2b22, roughness: 0.6, metalness: 0.3 });
        for (const z of [-0.36, 0.0, 0.36]) box(0.2, 0.42, 0.3, jerry, -0.36, 2.32, z, 0.04);
        const aux = c.glow(0xfff2d2, 0x9aa0a6);
        box(0.05, 0.05, 1.3, S.plastic, 0.56, 2.12, 0, 0.012);
        for (const z of [-0.5, -0.17, 0.17, 0.5]) { cyl(0.085, 0.085, 0.07, S.plastic, 0.58, 2.21, z, 'x', 18); cyl(0.07, 0.07, 0.02, aux, 0.625, 2.21, z, 'x', 18); }
        const spare = c.makeWheel(0.42, 0.28, 'steel'); spare.rotation.y = -Math.PI / 2; add(spare, x0 - 0.16, 1.22, 0);
        cyl(0.045, 0.045, 1.0, S.plastic, 1.12, 1.62, 0.95, 'y', 14); box(0.16, 0.12, 0.12, S.plastic, 1.14, 2.14, 0.95, 0.03); // snorkel
        box(0.1, 0.16, 1.98, S.plastic, x1 + 0.03, 0.66, 0, 0.03);                    // bumper + bull bar
        box(0.06, 0.06, 1.2, S.plastic, x1 + 0.13, 0.9, 0, 0.025); both((s) => box(0.06, 0.34, 0.06, S.plastic, x1 + 0.13, 0.78, s * 0.56, 0.025));
        both((s) => { cyl(0.125, 0.125, 0.05, S.plastic, x1 + 0.0, 0.97, s * 0.7, 'x', 24); cyl(0.1, 0.1, 0.06, m.head, x1 + 0.004, 0.97, s * 0.7, 'x', 24); });
        c.faceLamps(false, 0.98, 0.84, 0.12, 0.34, 0.03);
        box(0.04, 0.26, 0.98, S.plastic, x1 + 0.005, 0.96, 0, 0.015);                 // grille
        for (let k = 0; k < 5; k++) box(0.05, 0.2, 0.03, m.paint, x1 + 0.012, 0.96, -0.4 + k * 0.2, 0.008);
        box(0.1, 0.16, 1.98, S.plastic, x0 - 0.03, 0.66, 0, 0.03);
        c.mirrors(1.0, 1.36, 0.93, S.plastic); c.handles([0.0, -1.06], 1.06); c.doorLines([-1.17, -0.12, 0.94], 0.62, 1.15);
        c.sideDecal(0.6, 0.6, 0.42, 0.86, (g, w, h) => {                              // compass rose
          g.translate(w / 2, h / 2); g.strokeStyle = '#ece8dc'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, w * 0.4, 0, 7); g.stroke();
          for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = k % 2 ? '#ece8dc' : '#e9b949'; g.beginPath(); const L = k % 2 ? w * 0.36 : w * 0.2; g.moveTo(0, -L); g.lineTo(w * 0.045, 0); g.lineTo(-w * 0.045, 0); g.fill(); }
        });
        c.sideDecal(0.9, 0.14, -0.72, 0.9, (g, w, h) => { txt(g, 'ŞEHİR USTASI  ·  TÜRKİYE', w / 2, h / 2, h * 0.7, '#ece8dc', 700); });
        c.plates(0.66, 0.66, 0.08, 0.08);
        return (t, p) => { aux.emissiveIntensity = p * 6; };
      },
    };
  },

  // 04 — the interceptor for the lie detector
  police() {
    const x0 = -2.46, x1 = 2.46;
    return {
      x0, x1,
      wheel: { r: 0.355, w: 0.26, xF: 1.52, xR: -1.42, gap: 0.06, style: 'steel' },
      beam: [0.56, 0.5],
      body: {
        bottom: [[x0, 0.54], [x0 + 0.1, 0.31], [x0 + 0.34, 0.24], [2.1, 0.22], [x1 - 0.08, 0.27], [x1, 0.42]],
        deck: [[x0, 0.88], [x0 + 0.05, 0.96], [-1.5, 1.0], [-0.9, 1.01], [0.8, 1.0], [1.45, 0.94], [2.2, 0.83], [x1 - 0.05, 0.74], [x1, 0.64]],
        half: [[x0, 0.8], [x0 + 0.15, 0.925], [-1.5, 0.955], [1.6, 0.955], [2.2, 0.89], [x1 - 0.06, 0.8], [x1, 0.68]],
        rb: 0.05, rt: 0.13, tumble: 0.045, crown: 0.03, bulge: 0.022,
      },
      cab: { x0: -1.62, x1: 1.22, roof: [[-1.64, 0.96], [-0.98, 1.4], [-0.6, 1.455], [0.3, 1.455], [0.5, 1.42], [1.22, 0.98]], scale: 0.88, tumble: 0.19, rt: 0.14, glass: [[-0.9, -0.1], [0.0, 0.8]], roofX: [-0.7, 0.4], roofMat: P2, pillar: P2, sideMat: P2, sm: 0.09 },
      lamps: { tail: { x: [x0 + 0.015, x0 + 0.16], s: [6, 7], tc: [0, 1] }, amber: { x: [x1 - 0.3, x1 - 0.1], s: [7, 7] } },
      breaks: [-0.98, 0.9, x1 - 0.18],
      paintRule: (q) => {
        if (q.zone === 'B' || q.zone === 'BC') return K;
        if (q.zone === 'S' && q.row < 2 && q.x > x1 - 0.18) return K;
        if ((q.zone === 'S' || q.zone === 'TC') && inR(q.x, [-0.98, 0.9])) return P2;
        return undefined;
      },
      colors: { paint: 0x0d0f13, paint2: 0xf2f3f5, paintOpt: { metal: 0.6, rough: 0.3 } },
      extras(c) {
        const { box, cyl, both, S, m } = c;
        const red = c.glow(0xff1522, 0x4a0508), blue = c.glow(0x1f5bff, 0x05124a), white = c.glow(0xffffff, 0x777777);
        box(0.3, 0.03, 1.12, S.plastic, -0.1, 1.49, 0, 0.01);                         // light bar
        box(0.22, 0.075, 0.48, red, -0.1, 1.54, 0.3, 0.03); box(0.22, 0.075, 0.48, blue, -0.1, 1.54, -0.3, 0.03);
        box(0.2, 0.065, 0.1, white, -0.1, 1.535, 0, 0.02);
        both((s) => box(0.07, 0.42, 0.07, S.plastic, x1 + 0.09, 0.56, s * 0.34, 0.03));   // push bar
        box(0.07, 0.07, 0.9, S.plastic, x1 + 0.09, 0.74, 0, 0.03); box(0.07, 0.07, 0.9, S.plastic, x1 + 0.09, 0.5, 0, 0.03);
        box(0.05, 0.13, 0.62, S.plastic, x1 + 0.0, 0.56, 0, 0.02);
        c.faceLamps(true, 0.56, 0.5, 0.3, 0.1, 0.03);
        both((s) => cyl(0.012, 0.012, 0.5, S.plastic, -1.5, 1.24, s * 0.5, 'y', 8));    // antennas
        box(0.14, 0.03, 1.5, m.paint, x0 + 0.1, 1.0, 0, 0.012);                       // lip spoiler
        c.mirrors(0.92, 1.05, 0.86, m.paint2); c.handles([0.55, -0.4], 0.86); c.doorLines([-0.07], 0.3, 1.0);
        c.sideDecal(1.56, 0.4, -0.04, 0.63, (g, w, h) => {
          g.fillStyle = '#1f5bff'; g.fillRect(0, h * 0.86, w, h * 0.08);
          txt(g, 'LIE DETECTOR', w / 2, h * 0.36, h * 0.52, '#0d0f13', 800, 'center', true);
          txt(g, 'TRUTH PATROL  ·  UNIT 04  ·  ML KIT ON BOARD', w / 2, h * 0.72, h * 0.14, '#1f5bff', 700);
        });
        c.plates(0.4, 0.72);
        return (t, p) => {
          const k = Math.floor(t * 5.5) % 4, f = Math.sin(t * 44) > 0 ? 1 : 0.25;
          red.emissiveIntensity = p * (k < 2 ? 9 * f : 0.3); blue.emissiveIntensity = p * (k >= 2 ? 11 * f : 0.3);
          white.emissiveIntensity = p * 1.5;
        };
      },
    };
  },

  // 05 — the pocket hatch for the zero-install messenger
  hatch() {
    const x0 = -1.98, x1 = 2.0;
    return {
      x0, x1,
      wheel: { r: 0.335, w: 0.24, xF: 1.24, xR: -1.18, gap: 0.055, style: 'black' },
      beam: [0.55, 0.44],
      body: {
        bottom: [[x0, 0.52], [x0 + 0.1, 0.28], [x0 + 0.32, 0.21], [1.7, 0.2], [x1 - 0.08, 0.25], [x1, 0.42]],
        deck: [[x0, 0.94], [x0 + 0.05, 1.02], [-1.0, 1.03], [0.6, 1.01], [1.12, 0.96], [1.75, 0.85], [x1 - 0.05, 0.75], [x1, 0.64]],
        half: [[x0, 0.78], [x0 + 0.13, 0.885], [1.4, 0.9], [1.8, 0.85], [x1 - 0.06, 0.76], [x1, 0.64]],
        rb: 0.05, rt: 0.13, tumble: 0.045, crown: 0.03, bulge: 0.024,
      },
      cab: { x0: -1.94, x1: 1.04, roof: [[-1.96, 1.0], [-1.6, 1.43], [-1.2, 1.475], [0.04, 1.47], [0.24, 1.44], [1.04, 0.99]], scale: 0.89, tumble: 0.17, rt: 0.14, glass: [[-1.52, -0.74], [-0.63, 0.6]], roofX: [-1.5, 0.16], roofMat: K, pillar: K, sm: 0.07 },
      lamps: { tail: { x: [x0 + 0.015, x0 + 0.12], s: [5, 7], tc: [0, 1] }, amber: { x: [x1 - 0.28, x1 - 0.1], s: [7, 7] } },
      breaks: [x1 - 0.16],
      paintRule: (q) => {
        if (q.zone === 'B' || q.zone === 'BC') return K;
        if (q.zone === 'S' && q.row < 2 && (q.x > x1 - 0.16 || q.x < x0 + 0.14)) return K;
        if (q.zone === 'S' && q.row === 2 && q.x < x1 - 0.16 && q.x > x0 + 0.14) return K;
        return undefined;
      },
      colors: { paint: 0xffb400, paintOpt: { metal: 0.3, rough: 0.36 } },
      extras(c) {
        const { box, cyl, both, S, m } = c;
        box(0.3, 0.03, 1.36, S.plastic, -1.7, 1.47, 0, 0.012);                        // roof spoiler
        box(0.05, 0.11, 0.5, S.plastic, x1 + 0.0, 0.55, 0, 0.02);                     // grille
        c.faceLamps(true, 0.55, 0.44, 0.3, 0.1, 0.045);
        cyl(0.05, 0.05, 0.1, S.chrome, x0 - 0.03, 0.34, 0.1, 'x', 16); cyl(0.05, 0.05, 0.1, S.chrome, x0 - 0.03, 0.34, -0.1, 'x', 16);
        c.mirrors(0.74, 1.08, 0.8, S.plastic); c.handles([0.36, -0.86], 0.9); c.doorLines([-0.7, 0.6], 0.42, 1.01);
        c.sideDecal(1.3, 0.2, 0.02, 0.6, (g, w, h) => {
          txt(g, 'DIRECTO', w * 0.04, h / 2, h * 0.95, '#0e0f11', 800, 'left', true);
          txt(g, 'ZERO-INSTALL · REAL-TIME', w * 0.98, h / 2, h * 0.32, '#0e0f11', 700, 'right');
        });
        c.plates(0.47, 0.72);
      },
    };
  },

  // 06 — the streamliner for the rocket avionics
  rocket() {
    const x0 = -3.1, x1 = 3.4;
    return {
      x0, x1, stations: 110,
      wheel: { r: 0.3, w: 0.17, xF: 1.95, xR: -1.9, gap: 0.045, style: 'steel' },
      beam: [0.56, 0.14],
      body: {
        bottom: [[x0, 0.4], [x0 + 0.3, 0.24], [x0 + 0.8, 0.17], [2.2, 0.15], [2.9, 0.24], [x1, 0.42]],
        deck: [[x0, 1.02], [x0 + 0.2, 1.06], [-1.4, 1.06], [0.2, 0.98], [1.7, 0.84], [2.6, 0.7], [3.2, 0.58], [x1, 0.5]],
        half: [[x0, 0.52], [x0 + 0.4, 0.64], [-1.0, 0.7], [1.2, 0.68], [2.3, 0.56], [3.0, 0.3], [x1 - 0.1, 0.14], [x1, 0.06]],
        rb: 0.26, rt: 0.4, tumble: 0.0, crown: 0.0, bulge: 0.0,
      },
      cab: { x0: -0.5, x1: 1.9, roof: [[-0.5, 0.98], [0.3, 1.3], [0.85, 1.32], [1.9, 0.8]], scale: 0.56, tumble: 0.2, rt: 0.36, glass: [[-0.5, 1.9]], roofX: [9, 9.1], pillar: G, sm: 0.3, crown: 0.0, rule: (q) => (q.x < 0.25 ? P : G) },
      lamps: { head: { x: [2.7, 2.95], tc: [1, 3] }, tail: { x: [x0 + 0.02, x0 + 0.1], tc: [0, 1] } },
      breaks: [2.2, 0.25, -1.9],
      paintRule: (q) => {
        if (q.x > 2.2) return P2;
        if (q.zone === 'S' && q.row >= 3 && q.row <= 4 && q.x < 2.2) return P2;
        return undefined;
      },
      capMat: K,
      colors: { paint: 0xf1f0ea, paint2: 0xdb2318, paintOpt: { metal: 0.35, rough: 0.34 } },
      extras(c) {
        const { box, cyl, both, S, m, add } = c;
        const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(1.5, 0); fin.lineTo(0.42, 1.1); fin.lineTo(0, 1.1); fin.closePath();
        const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }).translate(0, 0, -0.03);
        add(new THREE.Mesh(finGeo, m.paint2), -3.0, 1.0, 0);
        both((s) => { const st = new THREE.Mesh(finGeo.clone().scale(0.62, 0.5, 1), m.paint2); st.rotation.x = s * 1.15; add(st, -2.95, 0.72, s * 0.5); });
        const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.32, metalness: 1 });
        cyl(0.4, 0.33, 0.5, metal, x0 - 0.2, 0.7, 0, 'x', 30);                         // nozzle
        const core = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
        const coreMesh = cyl(0.3, 0.3, 0.02, core, x0 - 0.2, 0.7, 0, 'x', 30); coreMesh.userData.fx = true;
        const flameMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        const mk = (r, len, color) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 24, 1, true).rotateZ(Math.PI / 2).translate(-len / 2, 0, 0), flameMat(color)); f.userData.fx = true; f.renderOrder = 10; add(f, x0 - 0.42, 0.7, 0); return f; };
        const f1 = mk(0.3, 2.6, 0xff4a0c), f2 = mk(0.19, 1.7, 0xffc24a), f3 = mk(0.1, 0.95, 0xcfe4ff);
        both((s) => { box(0.9, 0.2, 0.14, S.plastic, -1.0, 0.86, s * 0.7, 0.06); });          // intakes
        cyl(0.012, 0.03, 0.7, S.chrome, x1 + 0.3, 0.46, 0, 'x', 10);                  // pitot
        cyl(0.12, 0.12, 0.36, S.steel, -2.4, 1.12, 0, 'x', 18);                       // drag-chute canister
        c.sideDecal(1.5, 0.3, -0.5, 0.42, (g, w, h) => {
          txt(g, 'ARFESA', w * 0.02, h * 0.5, h * 0.9, '#16171a', 800, 'left', true);
          txt(g, 'AVIONICS · STM32 · KALMAN', w * 0.98, h * 0.5, h * 0.3, '#db2318', 700, 'right');
        });
        c.sideDecal(0.5, 0.24, 1.3, 0.42, (g, w, h) => { txt(g, '06', w / 2, h / 2, h * 1.0, '#16171a', 800, 'center', true); });
        return (t, p) => {
          const fl = 0.9 + 0.1 * Math.sin(t * 37) + 0.06 * Math.sin(t * 91);
          f1.scale.set(p * fl, p, p); f2.scale.set(p * (2 - fl), p, p); f3.scale.set(p * fl, p, p);
          f1.visible = f2.visible = f3.visible = p > 0.02;
          core.color.setRGB(0.25 + 9 * p, 0.08 + 3.2 * p, 0.03 + 0.8 * p);
        };
      },
    };
  },

  // 07 — the signal van for the notification API
  van() {
    const x0 = -2.5, x1 = 2.52;
    return {
      x0, x1,
      wheel: { r: 0.365, w: 0.26, xF: 1.56, xR: -1.46, gap: 0.065, style: 'steel', lipBlack: true },
      beam: [0.75, 0.62],
      body: {
        bottom: [[x0, 0.62], [x0 + 0.08, 0.36], [x0 + 0.3, 0.3], [2.15, 0.3], [x1 - 0.08, 0.36], [x1, 0.56]],
        deck: [[x0, 1.06], [x0 + 0.04, 1.13], [1.5, 1.13], [1.66, 1.11], [2.3, 1.02], [x1 - 0.05, 0.94], [x1, 0.84]],
        half: [[x0, 0.93], [x0 + 0.08, 0.995], [2.2, 0.995], [x1 - 0.08, 0.94], [x1, 0.84]],
        rb: 0.06, rt: 0.07, tumble: 0.01, crown: 0.015, bulge: 0.012,
      },
      cab: { x0: -2.47, x1: 2.1, roof: [[-2.49, 1.1], [-2.43, 2.04], [1.0, 2.06], [1.26, 2.0], [2.1, 1.08]], scale: 0.975, tumble: 0.05, rt: 0.13, glass: [[0.62, 1.62]], roofX: [-2.44, 1.12], rearGlass: false, crown: 0.02,
        rule: (q) => (q.zone === 'S' && q.x < 0.5 && (q.row === 5) ? P2 : undefined) },
      lamps: { amber: { x: [x1 - 0.3, x1 - 0.1], s: [7, 7] } },
      breaks: [0.5, x1 - 0.18],
      paintRule: (q) => ((q.zone === 'B' || q.zone === 'BC' || (q.zone === 'S' && q.row < 2 && (q.x > x1 - 0.18 || q.x < x0 + 0.12))) ? K : undefined),
      colors: { paint: 0xe9ebee, paint2: 0x10b8a6, paintOpt: { metal: 0.3, rough: 0.4 } },
      extras(c) {
        const { box, cyl, both, S, m, add } = c;
        const teal = new THREE.MeshStandardMaterial({ color: 0x10b8a6, roughness: 0.45, metalness: 0.3 });
        both((s) => box(2.6, 0.04, 0.04, S.plastic, -0.9, 2.14, s * 0.8, 0.012));    // roof rails
        box(0.5, 0.1, 0.5, S.plastic, -1.3, 2.13, 0, 0.03);                           // dish base
        cyl(0.04, 0.04, 0.4, S.steel, -1.3, 2.36, 0, 'y', 12);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 10, 0, Math.PI * 2, 0, 0.72), new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide }));
        dish.rotation.z = Math.PI - 0.55; add(dish, -1.5, 2.9, 0);
        cyl(0.02, 0.02, 0.8, S.steel, 0.4, 2.46, 0.5, 'y', 10);                        // mast
        const tip = c.glow(0x2bffe0, 0x0a4a42); const tipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), tip); add(tipMesh, 0.4, 2.88, 0.5);
        const rings = [0, 1, 2].map(() => {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: 0x2bffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
          r.userData.fx = true; r.rotation.x = Math.PI / 2; r.renderOrder = 10; add(r, 0.4, 2.88, 0.5); return r;
        });
        box(0.05, 0.14, 0.86, S.plastic, x1 + 0.0, 0.75, 0, 0.02);                     // grille
        c.faceLamps(true, 0.75, 0.62, 0.3, 0.12, 0.04);
        c.faceLamps(false, 1.0, 0.9, 0.1, 0.5, 0.03);
        box(0.1, 0.16, 2.0, S.plastic, x1 - 0.02, 0.44, 0, 0.04); box(0.1, 0.16, 2.0, S.plastic, x0 + 0.02, 0.46, 0, 0.04);
        c.mirrors(1.72, 1.36, 0.95, S.plastic); c.handles([0.86, -0.36], 1.0); c.doorLines([0.58, 1.66, -0.9], 0.4, 1.12);
        both((s) => box(0.02, 0.86, 0.012, S.plastic, 0.5, 1.58, s * (c.half(0.5) * 0.975 * 0.985 + 0.0), 0.004));
        c.sideDecal(1.9, 0.62, -1.0, 1.62, (g, w, h) => {
          const b = h * 0.3, cx = h * 0.42, cy = h * 0.46;                             // bell
          g.fillStyle = '#10b8a6'; g.beginPath(); g.moveTo(cx - b, cy + b * 0.8); g.quadraticCurveTo(cx - b * 0.75, cy + b * 0.3, cx - b * 0.72, cy - b * 0.2);
          g.quadraticCurveTo(cx - b * 0.7, cy - b * 1.05, cx, cy - b * 1.08); g.quadraticCurveTo(cx + b * 0.7, cy - b * 1.05, cx + b * 0.72, cy - b * 0.2);
          g.quadraticCurveTo(cx + b * 0.75, cy + b * 0.3, cx + b, cy + b * 0.8); g.closePath(); g.fill();
          g.beginPath(); g.arc(cx, cy + b * 1.05, b * 0.24, 0, 7); g.fill();
          g.fillStyle = '#e0352b'; g.beginPath(); g.arc(cx + b * 0.75, cy - b * 0.8, b * 0.36, 0, 7); g.fill();
          txt(g, '1', cx + b * 0.75, cy - b * 0.78, b * 0.5, '#fff', 800);
          txt(g, 'NOTIFICATION API', h * 0.92, h * 0.36, h * 0.3, '#15171a', 800, 'left', true);
          txt(g, 'BAUM  ·  BACKEND → MOBILE  ·  DELIVERED', h * 0.94, h * 0.72, h * 0.13, '#0c8f81', 700, 'left');
        }, true);
        c.plates(0.63, 0.8);
        return (t, p) => {
          tip.emissiveIntensity = p * (3 + 5 * Math.max(0, Math.sin(t * 5)));
          rings.forEach((r, i) => { const k = (t * 0.55 + i / 3) % 1; r.scale.setScalar(0.3 + k * 2.6); r.material.opacity = p * (1 - k) * 0.9; });
        };
      },
    };
  },
};

// Lite tier: plain painted materials instead of clear-coated ones.
export function setCarLite(on) { LITE = on; }

// Glass gets its own, dimmer copy of the environment so it reads as dark tint, not chrome.
export function setCarEnvironment(env) { const S = shared(); S.glass.envMap = env; S.glass.envMapIntensity = 0.11; }

export function buildCar(project) {
  return assemble(SPECS[project.car](), project);
}
