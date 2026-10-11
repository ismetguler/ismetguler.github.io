// Scene, camera rig, lighting and the render loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildGarage, makeEnvironment } from './garage.js';
import { buildCar, setCarEnvironment } from './cars.js';

const BG = 0x050608, SPACING = 6, FOV = 30, INTRO = 3.8;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// rAF stalls in background tabs, so never wait on it alone while loading.
const nextFrame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });

// Fluorescent start-up: a couple of stutters before the light settles.
const flicker = (s) => (s < 0.07 ? 0.15 : s < 0.13 ? 0.9 : s < 0.2 ? 0.2 : s < 0.31 ? 1 : s < 0.35 ? 0.45 : 1);

export async function createWorld({ canvas, projects, onProgress, onSelect, onPick, onHover }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lowEnd = coarse || Math.min(innerWidth, innerHeight) < 560;
  const n = projects.length;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 14, 60);
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 0.5;
  setCarEnvironment(scene.environment);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 200);

  const garage = buildGarage({ scene, projects, spacing: SPACING, reflect: !lowEnd });
  const { bays } = garage;

  scene.add(new THREE.HemisphereLight(0xc4d3ff, 0x20160e, 0.28));
  const fill = new THREE.DirectionalLight(0x9fb6ff, 0.3); fill.position.set(5, 7, 12); scene.add(fill);
  const spot = new THREE.SpotLight(0xfff0dc, 0, 22, 0.54, 0.9, 1.6);
  spot.castShadow = true; spot.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  spot.shadow.bias = -0.0004; spot.shadow.radius = 5; spot.shadow.camera.near = 1; spot.shadow.camera.far = 14;
  scene.add(spot, spot.target);
  const rim = new THREE.SpotLight(0xa8c4ff, 0, 20, 0.7, 0.9, 1.5); scene.add(rim, rim.target);

  // Cars — built one per frame so the loader can report progress.
  const cars = [], holders = [], pick = [];
  for (let i = 0; i < n; i++) {
    const car = buildCar(projects[i]);
    const holder = new THREE.Group();
    car.group.position.x = -(car.size.x0 + car.size.x1) / 2;
    holder.add(car.group); bays[i].pivot.add(holder);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(car.size.length, car.size.height + 0.3, car.size.width + 0.1));
    hit.position.y = car.size.height / 2; hit.visible = false; hit.userData.index = i; holder.add(hit); pick.push(hit);
    car.setPower(0); cars.push(car); holders.push(holder);
    onProgress?.((i + 1) / n);
    await nextFrame();
  }

  // Post-processing
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lowEnd ? 2 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.5, 1.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const S = {
    sel: 0, mode: 'row', selAt: -10, levels: new Float32Array(n), spin: 0, spinHold: 0, dragging: false,
    px: 0, py: 0, W: 1, H: 1, running: false, t: 0, now: 0, panel: 0,
  };
  const rig = { pos: new THREE.Vector3(bays[0].x, 1.6, 30), look: new THREE.Vector3(bays[0].x, 0.9, 0), ox: 0, oy: 0, yaw: -1 };

  function resize() {
    S.W = canvas.clientWidth || innerWidth; S.H = canvas.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, S.pixelCap ?? (lowEnd ? 1.5 : 2));
    renderer.setPixelRatio(pr); renderer.setSize(S.W, S.H, false);
    composer.setPixelRatio(pr); composer.setSize(S.W, S.H);
    camera.aspect = S.W / S.H;
  }

  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ox: 0, oy: 0, yaw: -1 };
  function aim() {
    if (S.free) { want.pos.fromArray(S.free, 0); want.look.fromArray(S.free, 3); want.ox = want.oy = 0; rig.pos.copy(want.pos); rig.look.copy(want.look); return; }
    const aspect = S.W / S.H, portrait = aspect < 0.9, bx = bays[S.sel].x;
    const fit = portrait ? 4.3 : aspect < 1.45 ? 7.6 : 10.4;
    const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect);
    want.yaw = portrait ? -1.27 : -0.98;
    if (S.mode === 'inspect') {
      want.pos.set(bx + S.px * 0.25, 1.32 + S.py * 0.12, dist * (portrait ? 0.86 : 0.74));
      want.look.set(bx, 0.82, 0);
      want.ox = portrait ? 0 : S.panel * 0.5; want.oy = portrait ? 0.2 : 0.02;
    } else if (S.mode === 'wide') {
      want.pos.set(bx * 0.7 + S.px * 0.4, 3.3, dist * 1.5);
      want.look.set(bx * 0.7, 1.0, 0);
      want.ox = portrait ? 0 : S.panel * 0.5; want.oy = portrait ? 0.16 : 0;
    } else {
      want.pos.set(bx + S.px * 0.55, 1.3 + S.py * 0.2, dist);
      want.look.set(bx, 0.84, 0);
      want.ox = S.H < 520 && !portrait ? -0.17 : 0;   // sideways phone: car steps right of the copy
      want.oy = portrait ? 0.13 : 0.09;
    }
    scene.fog.near = dist + 5; scene.fog.far = dist + 46;
  }

  function frame(dt, t) {
    aim();
    // Opening shot: a slow roll-in from the dark end of the garage.
    const cine = S.intro ? S.now - S.intro.t0 : -1;   // wall-clock, so a slow device can't stretch it
    if (S.intro && cine >= INTRO) S.intro = null;
    if (S.intro) {
      const p = smooth(0, 1, smooth(0, INTRO, cine));
      rig.pos.lerpVectors(S.intro.pos, want.pos, p); rig.look.lerpVectors(S.intro.look, want.look, p);
      rig.ox = want.ox * p; rig.oy = want.oy * p; rig.yaw = want.yaw;
    } else {
      const k = S.mode === 'row' ? 3.4 : 2.8;
      rig.pos.x = damp(rig.pos.x, want.pos.x, k, dt); rig.pos.y = damp(rig.pos.y, want.pos.y, k, dt); rig.pos.z = damp(rig.pos.z, want.pos.z, k * 0.8, dt);
      rig.look.x = damp(rig.look.x, want.look.x, k * 1.25, dt); rig.look.y = damp(rig.look.y, want.look.y, k, dt);
      rig.ox = damp(rig.ox, want.ox, 4, dt); rig.oy = damp(rig.oy, want.oy, 4, dt); rig.yaw = damp(rig.yaw, want.yaw, 4, dt);
    }
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
    camera.rotateZ((rig.look.x - rig.pos.x) * -0.012);      // lean into the move
    camera.setViewOffset(S.W, S.H, rig.ox * S.W, rig.oy * S.H, S.W, S.H);

    // Turntable
    if (S.mode === 'inspect') {
      if (!S.dragging) { S.spinHold += dt; if (S.spinHold > 0.9) S.spin += dt * 0.28 * Math.min(1, S.spinHold - 0.9); }
    } else {
      S.spin = Math.atan2(Math.sin(S.spin), Math.cos(S.spin));
      S.spin = damp(S.spin, 0, 5, dt);
    }

    const since = t - S.selAt, fl = flicker(since);
    for (let i = 0; i < n; i++) {
      const on = i === S.sel ? 1 : 0, b = bays[i];
      S.levels[i] = damp(S.levels[i], on, on ? 6 : 3, dt);
      let lv = S.levels[i] * (on ? fl : 1), idle = 1;
      if (S.intro) {
        // Bays strike up one after another, farthest first, then all but the chosen one settle back.
        const tau = cine - 0.45 - (S.intro.far - Math.abs(i - S.sel)) * 0.17, show = tau < 0 ? 0 : flicker(tau);
        idle = tau < 0 ? 0 : 1;
        lv = on ? show : show * (1 - smooth(INTRO - 1.5, INTRO - 0.2, cine));
        S.levels[i] = on ? show : 0;
      }
      cars[i].setPower(lv); cars[i].update(t);
      holders[i].rotation.y = rig.yaw;
      b.pivot.rotation.y = i === S.sel ? S.spin : damp(b.pivot.rotation.y, 0, 5, dt);
      const tube = 0.35 * idle + 3.4 * lv; b.tubeMat.color.setRGB(tube, tube * 0.96, tube * 0.88);
      b.wallPool.opacity = 0.02 + 0.13 * lv; b.floorPool.opacity = 0.03 * lv;
      b.ringMat.opacity = 0.05 + 0.95 * lv; b.ringMat.color.set(projects[i].color).multiplyScalar(0.6 + 2.2 * lv);
      b.ticksMat.opacity = (0.05 + 0.4 * S.levels[i]) * idle; b.sign.opacity = (0.05 + 0.2 * S.levels[i]) * idle;
    }
    const sx = damp(spot.position.x, bays[S.sel].x, 6, dt);
    spot.position.set(sx + 0.4, 5.6, 2.6); spot.target.position.set(sx, 0.2, 0);
    spot.intensity = 125 * S.levels[S.sel] * fl;
    rim.position.set(sx - 3.5, 3.6, -5.2); rim.target.position.set(sx, 0.9, 0); rim.intensity = 60 * S.levels[S.sel] * fl;

    composer.render(dt);
  }

  // Adaptive quality: drop the mirror and resolution if the first seconds run slow.
  let probe = { frames: 0, time: 0, done: lowEnd };
  let last = 0, raf = 0;
  function loop(ms) {
    raf = requestAnimationFrame(loop);
    const now = ms / 1000, dt = Math.min(0.05, now - last || 0.016); last = now; S.t += dt; S.now = now;
    if (!probe.done && S.t > 1.5) {
      probe.frames++; probe.time += dt;
      if (probe.time > 2.5) {
        probe.done = true;
        if (probe.time / probe.frames > 0.03) { garage.setReflect(false); S.pixelCap = 1.25; resize(); }
      }
    }
    frame(dt, S.t);
  }

  // Pointer: parallax, picking, swipe and turntable drag
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hitAt = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pick, false)[0];
    return h ? h.object.userData.index : -1;
  };
  let down = null, hover = -1;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, moved: 0 }; canvas.setPointerCapture(e.pointerId); if (S.mode === 'inspect') { S.dragging = true; canvas.classList.add('grabbing'); } });
  canvas.addEventListener('pointermove', (e) => {
    S.px = (e.clientX / S.W) * 2 - 1; S.py = -((e.clientY / S.H) * 2 - 1);
    if (coarse) { S.px = S.py = 0; }
    if (down) {
      down.moved = Math.max(down.moved, Math.abs(e.clientX - down.x), Math.abs(e.clientY - down.y));
      if (S.mode === 'inspect') { S.spin += (e.clientX - down.lx) * 0.008; S.spinHold = 0; }
      down.lx = e.clientX;
    } else if (!coarse) {
      const h = hitAt(e);
      if (h !== hover) { hover = h; canvas.style.cursor = S.mode === 'inspect' ? '' : h >= 0 ? 'pointer' : ''; onHover?.(h); }
    }
  });
  const up = (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, moved = down.moved; down = null; S.dragging = false; canvas.classList.remove('grabbing');
    if (S.mode !== 'row') return;
    if (moved < 7) { const h = hitAt(e); if (h >= 0) onPick?.(h); }
    else if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.2) api.select(S.sel + (dx < 0 ? 1 : -1));
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { down = null; S.dragging = false; canvas.classList.remove('grabbing'); });
  addEventListener('resize', resize);

  const api = {
    get index() { return S.sel; },
    get mode() { return S.mode; },
    select(i, silent) {
      i = Math.max(0, Math.min(n - 1, i));
      if (i === S.sel && S.picked) return false;
      S.picked = true; S.sel = i; S.selAt = S.t; S.spinHold = 0;
      if (!silent) onSelect?.(i);
      return true;
    },
    setMode(mode, panelFraction = 0) { S.mode = mode; S.panel = panelFraction; S.spinHold = 0; canvas.classList.toggle('inspecting', mode === 'inspect'); },
    start() { if (S.running) return; S.running = true; resize(); last = performance.now() / 1000; raf = requestAnimationFrame(loop); },
    stop() { S.running = false; cancelAnimationFrame(raf); },
    intro() {
      aim();
      const x = want.pos.x * 0.45;
      S.intro = { t0: performance.now() / 1000, far: Math.max(S.sel, n - 1 - S.sel), pos: new THREE.Vector3(x, 2.7, want.pos.z * 2.1), look: new THREE.Vector3(x, 1.2, 0) };
      S.selAt = -10; S.levels.fill(0);
      rig.pos.copy(S.intro.pos); rig.look.copy(S.intro.look);
    },
    skipIntro() { if (S.intro) S.intro.t0 = performance.now() / 1000 - INTRO; },
    renderer, scene, camera, cars, rig, state: S, bays,
  };
  return api;
}
