// The garage itself: floor, back wall, pillars, light fixtures, bay markings and props.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function tex(c, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Seeded so the garage looks the same on every visit.
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

function concrete(size, base, spread, seed) {
  return canvas(size, size, (g) => {
    const r = rng(seed);
    g.fillStyle = `rgb(${base},${base},${base + 2})`; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const x = r() * size, y = r() * size, rad = (0.04 + r() * 0.22) * size, d = r() > 0.5 ? 255 : 0;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(${d},${d},${d},${0.02 + r() * spread})`); gr.addColorStop(1, `rgba(${d},${d},${d},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, size, size);
      }
    }
    const img = g.getImageData(0, 0, size, size), px = img.data;
    for (let i = 0; i < px.length; i += 4) { const n = (r() - 0.5) * 16; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
    g.putImageData(img, 0, 0);
  });
}

// Studio-style reflections for the paint: overhead strip lights in a dark room.
export function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(44, 16, 44), new THREE.MeshBasicMaterial({ color: 0x0b0c0f, side: THREE.BackSide }));
  room.position.y = 7; s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshBasicMaterial({ color: 0x15161a }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9; s.add(floor);
  const panel = (w, h, d, x, y, z, k, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
    m.position.set(x, y, z); s.add(m);
  };
  panel(1.1, 0.1, 18, -5.5, 7.5, 0, 8); panel(1.4, 0.1, 18, 0, 7.5, 0, 11); panel(1.1, 0.1, 18, 5.5, 7.5, 0, 8);
  panel(20, 0.1, 1.2, 0, 7, 9, 5); panel(20, 0.1, 1.2, 0, 7, -9, 4);
  panel(0.1, 3, 10, -16, 3.5, 2, 2.2, 0xffd9b0); panel(0.1, 3, 10, 16, 3.5, -2, 1.8, 0xb9d2ff);
  panel(12, 2.2, 0.1, 0, 3, 18, 1.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const out = pm.fromScene(s, 0.025).texture;
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return out;
}

export function buildGarage({ scene, projects, spacing, reflect }) {
  const n = projects.length, span = n * spacing, WZ = -6.6;
  const bayX = (i) => (i - (n - 1) / 2) * spacing;
  const group = new THREE.Group(); scene.add(group);

  // Floor: polished concrete, slightly see-through over a mirror for the showroom reflection.
  const fc = concrete(512, 30, 0.07, 7);
  const fMap = tex(fc), fRough = tex(concrete(512, 120, 0.2, 11), false);
  for (const t of [fMap, fRough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((span + 40) / 7, 44 / 7); }
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x7c8088, map: fMap, roughnessMap: fRough, roughness: 0.78, metalness: 0.0, transparent: true, opacity: reflect ? 0.62 : 1, depthWrite: !reflect });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span + 40, 44), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.z = 8; floor.receiveShadow = true; floor.renderOrder = 1; group.add(floor);
  let mirror = null;
  if (reflect) {
    mirror = new Reflector(new THREE.PlaneGeometry(span + 40, 44), { textureWidth: 1024, textureHeight: 1024, color: 0x8f9296, clipBias: 0.003, multisample: 0 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -0.004, 8); group.add(mirror);
  }

  // Back wall
  const wallTex = tex(canvas(1024, 1024, (g, w, h) => {
    g.drawImage(concrete(1024, 46, 0.05, 23), 0, 0);
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, h * 0.8, w, h * 0.2);
    g.fillStyle = '#ff5a1f'; g.fillRect(0, h * 0.79, w, 7);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
    for (const y of [0.27, 0.54]) { g.beginPath(); g.moveTo(0, h * y); g.lineTo(w, h * y); g.stroke(); }
    for (const x of [0, 0.5]) { g.beginPath(); g.moveTo(w * x + 2, 0); g.lineTo(w * x + 2, h * 0.79); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (const x of [0.06, 0.44, 0.56, 0.94]) for (const y of [0.06, 0.21, 0.33, 0.48, 0.6, 0.74]) { g.beginPath(); g.arc(w * x, h * y, 5, 0, 7); g.fill(); }
  }));
  wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set((span + 40) / spacing, 1);
  wallTex.offset.x = -((20 / spacing) % 1);   // panel joints land on the bay boundaries
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(span + 40, 6), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, metalness: 0 }));
  wall.position.set(0, 3, WZ); group.add(wall);

  // Structure
  const steel = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.6, metalness: 0.7 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.9 });
  const hazard = new THREE.MeshStandardMaterial({ roughness: 0.7, map: (() => { const t = tex(canvas(128, 128, (g, w, h) => { g.fillStyle = '#e8b21c'; g.fillRect(0, 0, w, h); g.fillStyle = '#131313'; for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * 32, h); g.lineTo(k * 32 + 16, h); g.lineTo(k * 32 + 16 + h, 0); g.lineTo(k * 32 + h, 0); g.fill(); } })); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); return t; })() });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 40, 0.36, 0.3), steel); beam.position.set(0, 4.7, WZ + 0.45); group.add(beam);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(span + 40, 0.1, 0.14), steel); rail.position.set(0, 4.18, -0.4); group.add(rail);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xb0850f, roughness: 0.8, transparent: true, opacity: 0.6, depthWrite: false });
  for (let i = 0; i <= n; i++) {
    const x = bayX(i) - spacing / 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 5, 0.62), conc); p.position.set(x, 2.5, WZ + 0.45); group.add(p);
    const hz = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.1, 0.66), hazard); hz.position.set(x, 0.55, WZ + 0.45); group.add(hz);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 9.4), lineMat); line.rotation.x = -Math.PI / 2; line.position.set(x, 0.004, -1.2); line.renderOrder = 3; group.add(line);
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), steel); drop.position.set(x, 4.45, -0.4); group.add(drop);
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(span + 40, 0.12), lineMat); front.rotation.x = -Math.PI / 2; front.position.set(0, 0.004, 3.5); front.renderOrder = 3; group.add(front);

  // Shared decal textures
  const poolTex = tex(canvas(256, 256, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }));
  const tickTex = tex(canvas(1024, 1024, (g, w) => {
    g.translate(w / 2, w / 2); g.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < 120; k++) { const big = k % 10 === 0; g.lineWidth = big ? 5 : 2.5; g.beginPath(); g.moveTo(0, -w * (big ? 0.44 : 0.455)); g.lineTo(0, -w * 0.475); g.stroke(); g.rotate((Math.PI * 2) / 120); }
    g.lineWidth = 2; g.beginPath(); g.arc(0, 0, w * 0.432, 0, 7); g.stroke();
  }));

  const bays = projects.map((p, i) => {
    const x = bayX(i), no = String(i + 1).padStart(2, '0');
    const pivot = new THREE.Group(); pivot.position.set(x, 0, 0); group.add(pivot);

    // Light fixture above the bay
    const housing = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 0.5), steel); housing.position.set(x, 4.08, -0.4); group.add(housing);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    for (const z of [-0.54, -0.26]) { const tube = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.05, 0.07), tubeMat); tube.position.set(x, 4.0, z); group.add(tube); }

    // Glow on the wall and floor
    const add = (w, h, o) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: o }));
    const wallPool = add(8.5, 7, 0xffe9d0); wallPool.position.set(x, 2.5, WZ + 0.02); wallPool.renderOrder = 2; group.add(wallPool);
    const floorPool = add(8.4, 8.4, 0xfff1df); floorPool.rotation.x = -Math.PI / 2; floorPool.position.set(x, 0.006, 0); floorPool.renderOrder = 2; group.add(floorPool);

    // Turntable ring + ticks (ticks rotate with the car)
    const ringMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.72, 2.76, 128), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.008, 0); ring.renderOrder = 3; group.add(ring);
    const ticksMat = new THREE.MeshBasicMaterial({ map: tickTex, transparent: true, opacity: 0, depthWrite: false });
    const ticks = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 5.9), ticksMat); ticks.rotation.x = -Math.PI / 2; ticks.position.y = 0.007; ticks.renderOrder = 3; pivot.add(ticks);

    // Stencilled bay number on the wall and floor
    const stencil = tex(canvas(768, 512, (g, w, h) => {
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = `800 400px ${FONT}`; g.fillText(no, 20, 372);
      g.font = `600 58px ${FONT}`; g.fillText(p.model.toUpperCase(), 30, 458);
      g.fillStyle = p.color; g.fillRect(30, 480, 150, 12);
    }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.2), new THREE.MeshBasicMaterial({ map: stencil, transparent: true, opacity: 0.2, depthWrite: false }));
    sign.position.set(x - 0.9, 3.25, WZ + 0.03); sign.renderOrder = 3; group.add(sign);
    const floorNo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: stencil, transparent: true, opacity: 0.34, depthWrite: false }));
    floorNo.rotation.x = -Math.PI / 2; floorNo.position.set(x - 2.0, 0.005, 4.25); floorNo.renderOrder = 3; group.add(floorNo);

    return { x, pivot, tubeMat, wallPool: wallPool.material, floorPool: floorPool.material, ringMat, ticksMat, sign: sign.material };
  });

  // Props between the bays
  const tire = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.92, side: THREE.DoubleSide });
  const tireGeo = new THREE.LatheGeometry([[0.6, -0.5], [0.86, -0.5], [0.965, -0.42], [1, -0.28], [1, 0.28], [0.965, 0.42], [0.86, 0.5], [0.6, 0.5]].map(([a, b]) => new THREE.Vector2(a * 0.36, b * 0.25)), 32);
  const red = new THREE.MeshStandardMaterial({ color: 0xb01c1a, roughness: 0.45, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.5, metalness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.2, metalness: 1 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x1d4f8a, roughness: 0.5, metalness: 0.5 });
  const put = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
  const r = rng(99);
  const props = {
    tires(x, z) { const k = 3 + Math.floor(r() * 3); for (let j = 0; j < k; j++) put(new THREE.Mesh(tireGeo, tire), x + (r() - 0.5) * 0.05, 0.125 + j * 0.25, z + (r() - 0.5) * 0.05).rotation.y = r() * 6; },
    chest(x, z) {
      put(new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.95, 0.52, 2, 0.03), red), x, 0.57, z);
      put(new THREE.Mesh(new RoundedBoxGeometry(1.14, 0.04, 0.56, 2, 0.015), dark), x, 1.06, z);
      for (let j = 0; j < 5; j++) put(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.02), chrome), x, 0.26 + j * 0.17, z + 0.27);
      for (const sx of [-0.45, 0.45]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12).rotateZ(Math.PI / 2), dark), x + sx, 0.05, z);
    },
    cones(x, z) { for (let j = 0; j < 2; j++) { put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.15, 0.56, 18), coneMat), x + j * 0.5, 0.3, z + j * 0.2); put(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.36), coneMat), x + j * 0.5, 0.015, z + j * 0.2); } },
    drum(x, z) { put(new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24), drumMat), x, 0.44, z); for (const y of [0.3, 0.6]) put(new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.012, 6, 24).rotateX(Math.PI / 2), drumMat), x, y, z); },
  };
  const order = ['tires', 'chest', 'drum', 'cones', 'tires', 'chest', 'cones', 'drum', 'tires'];
  for (let i = 0; i <= n; i++) {
    const x = bayX(i) - spacing / 2;
    props[order[i % order.length]](x - 0.95, WZ + 0.75);
    props[order[(i + 3) % order.length]](x + 0.9, WZ + 0.7);
  }

  return {
    bays, bayX, mirror,
    setReflect(on) { if (mirror) mirror.visible = on; floorMat.opacity = on ? 0.62 : 1; floorMat.depthWrite = !on; floorMat.transparent = on; floorMat.needsUpdate = true; },
  };
}
