// Test drive: take the selected car out of its bay and around the garage floor.
// Arcade physics on a flat plane — a bicycle model with lateral grip, plus cones, drums and
// tyres that get knocked about.
import * as THREE from './three.js';
import { mergeGeometries } from './addons.js';

const PROFILES = {
  truck: { acc: 6.5, top: 13, grip: 7.5, steer: 0.5 },
  coupe: { acc: 11, top: 21, grip: 6.5, steer: 0.55 },
  suv: { acc: 7.5, top: 15, grip: 7.5, steer: 0.52 },
  police: { acc: 10, top: 19, grip: 7, steer: 0.55 },
  hatch: { acc: 9, top: 17, grip: 8.5, steer: 0.6 },
  rocket: { acc: 15, top: 27, grip: 5, steer: 0.42 },
  van: { acc: 7, top: 14, grip: 7, steer: 0.5 },
};
const BOUNDS = { x0: -25.6, x1: 25.6, z0: -4.3, z1: 22.4 };   // where the car may go
const LOOSE = { x0: -27.4, x1: 27.4, z0: -5.9, z1: 24.3 };    // where knocked props may slide
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export function createDrive({ scene, bays, cars, holders, projects, yaw }) {
  // --- knockable props -------------------------------------------------------------------
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.92, side: THREE.DoubleSide });
  const coneGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.035, 0.16, 0.58, 18).translate(0, 0.31, 0), 0xff5a1f),
    colored(new THREE.CylinderGeometry(0.083, 0.113, 0.14, 18).translate(0, 0.36, 0), 0xf4f1ea),
    colored(new THREE.BoxGeometry(0.4, 0.03, 0.4).translate(0, 0.015, 0), 0xff5a1f),
  ]);
  const drumGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 22).translate(0, 0.44, 0), 0x1d4f8a),
    colored(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 22).translate(0, 0.3, 0), 0xe8b21c),
    colored(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 22).translate(0, 0.6, 0), 0xe8b21c),
  ]);
  const tyreGeo = new THREE.LatheGeometry([[0.6, -0.5], [0.86, -0.5], [0.965, -0.42], [1, -0.28], [1, 0.28], [0.965, 0.42], [0.86, 0.5], [0.6, 0.5]].map(([a, b]) => new THREE.Vector2(a * 0.36, b * 0.25)), 26).translate(0, 0.125, 0);

  const bodies = [];
  const add = (type, x, z, o = {}) => {
    const mesh = new THREE.Mesh(type === 'cone' ? coneGeo : type === 'drum' ? drumGeo : tyreGeo, type === 'cone' ? matte : type === 'drum' ? metal : rubber);
    mesh.castShadow = true; group.add(mesh);
    bodies.push({ type, mesh, x0: x, z0: z, y0: o.y || 0, r: type === 'cone' ? 0.2 : type === 'drum' ? 0.3 : 0.36, m: type === 'cone' ? 0.25 : type === 'drum' ? 2.2 : 1, fr: type === 'tyre' ? 1.1 : type === 'drum' ? 2.4 : 1.7, lay: type === 'cone' ? 1.33 : Math.PI / 2, lift: type === 'cone' ? 0.15 : 0.29 });
  };
  for (let k = 0; k < 13; k++) add('cone', -21 + k * 3.5, 9 + (k % 2 ? 1.1 : -1.1));              // slalom
  for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) add('cone', 13 + row * 0.62, 17.2 + (k - row / 2) * 0.7);   // pins
  for (const [x, z] of [[-17, 18.5], [-15.2, 19.6], [-13.4, 18.5], [-15.2, 17.4]]) add('drum', x, z);
  for (const [x, z] of [[-2, 19.5], [2.4, 16.5], [22, 13]]) for (let j = 0; j < 3; j++) add('tyre', x, z, { y: j * 0.25 });
  const coneTotal = bodies.filter((b) => b.type === 'cone').length;

  function resetBodies() {
    for (const b of bodies) Object.assign(b, { x: b.x0, z: b.z0, y: b.y0, vx: 0, vz: 0, tip: 0, tipTo: 0, axis: 0, turn: 0, spin: 0, hit: false });
  }
  resetBodies();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function placeBodies() {
    for (const b of bodies) {
      b.mesh.position.set(b.x, b.y + b.tip * (b.type === 'tyre' ? 0 : b.lift), b.z);
      ax.set(Math.cos(b.axis), 0, Math.sin(b.axis));
      b.mesh.quaternion.copy(q1.setFromAxisAngle(ax, b.tip * b.lay)).multiply(q2.setFromAxisAngle(up, b.turn));
    }
  }

  // --- the car ---------------------------------------------------------------------------
  const S = {
    active: false, returning: 0, index: -1, x: 0, z: 0, th: 0, vx: 0, vz: 0, vf: 0, steer: 0, spin: 0, roll: 0, pitch: 0,
    throttle: 0, skid: 0, speed: 0, cones: 0, coneTotal, time: 0, running: false, done: false, best: 0, bump: 0, hits: 0,
  };
  let car = null, holder = null, P = PROFILES.coupe, wheelbase = 2.7, radius = 1, offsets = [0];
  const fromX = new THREE.Vector3();

  const obstacles = () => bays.filter((_, i) => i !== S.index).map((b) => ({ x: b.x, z: 0, r: 2.45 }));
  let parked = [];

  function start() { S.x = bays[S.index].x; S.z = 0; S.vx = S.vz = S.vf = S.steer = S.roll = S.pitch = 0; }

  function enter(i, theta) {
    S.index = i; car = cars[i]; holder = holders[i];
    P = PROFILES[projects[i].car] || PROFILES.coupe;
    wheelbase = car.wheelbase; radius = car.size.width / 2 + 0.08;
    offsets = [car.size.length * 0.3, 0, -car.size.length * 0.3];
    parked = obstacles();
    scene.add(holder);
    start(); S.th = theta;
    holder.position.set(S.x, 0, S.z); holder.rotation.set(0, S.th, 0);
    resetBodies(); placeBodies(); group.visible = true;
    Object.assign(S, { active: true, returning: 0, cones: 0, time: 0, running: false, done: false, hits: 0 });
  }

  function exit() {
    if (!S.active) return;
    S.active = false; S.returning = 1; S.vx = S.vz = 0; S.speed = 0;
    fromX.set(S.x, S.th, S.z);
  }

  function reset() {
    if (!S.active) return;
    start(); S.th = yaw();
    resetBodies();
    Object.assign(S, { cones: 0, time: 0, running: false, done: false, hits: 0 });
  }

  function hitBody(b, nx, nz, speed) {
    if (!b.hit && speed > 0.6) {
      b.hit = true; S.hits++;
      if (b.type === 'cone') { S.cones++; if (S.cones === coneTotal && !S.done) { S.done = true; S.running = false; } }
    }
    if (speed > (b.type === 'drum' ? 5 : 0.6) && b.type !== 'tyre') { b.tipTo = 1; b.axis = Math.atan2(-nx, nz); }
  }

  function step(dt, input) {
    const cos = Math.cos(S.th), sin = Math.sin(S.th);
    // forward = (cos, -sin), right = (sin, cos) on the x/z plane
    let vf = S.vx * cos - S.vz * sin, vr = S.vx * sin + S.vz * cos;
    const gas = input.throttle, brake = input.brake, hand = input.hand;
    if (gas > 0 && vf < P.top) vf += P.acc * gas * dt * (1 - Math.max(0, vf) / P.top * 0.55);
    if (brake > 0) vf -= (vf > 0.4 ? 17 : vf > -5 ? 5.5 : 0) * brake * dt;
    vf *= Math.exp(-(gas || brake ? 0.22 : 0.85) * dt);
    if (hand) vf *= Math.exp(-1.3 * dt);
    const grip = hand ? 1.3 : P.grip;
    S.skid = damp(S.skid, clamp((Math.abs(vr) - 1.6) / 5, 0, 1), 8, dt);
    vr *= Math.exp(-grip * dt);
    S.steer = damp(S.steer, input.steer * P.steer / (1 + Math.abs(vf) * 0.075), 9, dt);
    S.th += (vf / wheelbase) * Math.tan(S.steer) * dt * (hand ? 1.4 : 1);
    S.vx = vf * cos + vr * sin; S.vz = -vf * sin + vr * cos;
    S.x += S.vx * dt; S.z += S.vz * dt;
    S.throttle = gas; S.vf = vf; S.speed = Math.hypot(S.vx, S.vz);
    if (!S.running && !S.done && S.speed > 0.5) S.running = true;
    if (S.running) S.time += dt;

    // walls
    const pad = radius + 0.9; let bumped = 0;
    if (S.x < BOUNDS.x0 + pad) { S.x = BOUNDS.x0 + pad; bumped = Math.abs(S.vx); S.vx = Math.abs(S.vx) * 0.3; }
    if (S.x > BOUNDS.x1 - pad) { S.x = BOUNDS.x1 - pad; bumped = Math.abs(S.vx); S.vx = -Math.abs(S.vx) * 0.3; }
    if (S.z < BOUNDS.z0 + pad) { S.z = BOUNDS.z0 + pad; bumped = Math.abs(S.vz); S.vz = Math.abs(S.vz) * 0.3; }
    if (S.z > BOUNDS.z1 - pad) { S.z = BOUNDS.z1 - pad; bumped = Math.abs(S.vz); S.vz = -Math.abs(S.vz) * 0.3; }

    // the car as three circles along its length
    for (const off of offsets) {
      const cx = S.x + cos * off, cz = S.z - sin * off;
      for (const o of parked) {
        const dx = cx - o.x, dz = cz - o.z, d = Math.hypot(dx, dz), min = radius + o.r;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d, vn = S.vx * nx + S.vz * nz;
          S.x += nx * (min - d); S.z += nz * (min - d);
          if (vn < 0) { S.vx -= vn * nx * 1.25; S.vz -= vn * nz * 1.25; bumped = Math.max(bumped, -vn); }
        }
      }
      for (const b of bodies) {
        if (b.y > 0.3) continue;
        const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz), min = radius + b.r;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d, rel = (S.vx - b.vx) * nx + (S.vz - b.vz) * nz;
          b.x += nx * (min - d); b.z += nz * (min - d);
          if (rel > 0) {
            const j = rel * 1.3;
            b.vx += nx * j + S.vx * 0.12; b.vz += nz * j + S.vz * 0.12; b.spin = (Math.random() - 0.5) * rel * 1.5;
            S.vx -= nx * rel * b.m * 0.035; S.vz -= nz * rel * b.m * 0.035;
            hitBody(b, nx, nz, rel); S.bump = Math.max(S.bump, Math.min(1, rel / 12) * (b.type === 'cone' ? 0.35 : 0.8));
          }
        }
      }
    }
    if (bumped > 1.2) S.bump = Math.max(S.bump, Math.min(1, bumped / 9));
  }

  function stepBodies(dt) {
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.x += b.vx * dt; b.z += b.vz * dt;
      const k = Math.exp(-b.fr * dt); b.vx *= k; b.vz *= k;
      b.turn += b.spin * dt; b.spin *= Math.exp(-2 * dt);
      b.tip = damp(b.tip, b.tipTo, 9, dt);
      // stacked tyres drop once the one below has gone
      if (b.y > 0) { const below = bodies[i - 1], onTop = Math.hypot(below.x - b.x, below.z - b.z) < 0.45; b.y = Math.max(onTop ? below.y + 0.25 : 0, b.y - 3.2 * dt); }
      if (b.x < LOOSE.x0) { b.x = LOOSE.x0; b.vx = Math.abs(b.vx) * 0.5; }
      if (b.x > LOOSE.x1) { b.x = LOOSE.x1; b.vx = -Math.abs(b.vx) * 0.5; }
      if (b.z < LOOSE.z0) { b.z = LOOSE.z0; b.vz = Math.abs(b.vz) * 0.5; }
      if (b.z > LOOSE.z1) { b.z = LOOSE.z1; b.vz = -Math.abs(b.vz) * 0.5; }
      for (const o of parked) {
        const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz), min = b.r + o.r - 0.5;
        if (d < min && d > 1e-4) { const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz; b.x += nx * (min - d); b.z += nz * (min - d); if (vn < 0) { b.vx -= vn * nx * 1.5; b.vz -= vn * nz * 1.5; } }
      }
    }
    // prop against prop, so a hit carries through the pack
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (Math.abs(a.vx) + Math.abs(a.vz) < 0.05) continue;
      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const b = bodies[j];
        if (Math.abs(a.y - b.y) > 0.2) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d, rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz, push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        if (rel <= 0) continue;
        const j2 = rel * 1.6 / (a.m + b.m);
        a.vx -= nx * j2 * b.m; a.vz -= nz * j2 * b.m; b.vx += nx * j2 * a.m; b.vz += nz * j2 * a.m;
        hitBody(b, nx, nz, rel);
      }
    }
  }

  function update(dt, t, input) {
    if (S.active) {
      // two sub-steps keep fast cars from tunnelling through cones
      for (let k = 0; k < 2; k++) { step(dt / 2, input); stepBodies(dt / 2); }
      placeBodies();
      S.spin += (S.vf / car.wheelRadius) * dt;
      S.roll = damp(S.roll, S.steer * Math.min(1, Math.abs(S.vf) / 9) * 0.085, 6, dt);
      S.pitch = damp(S.pitch, (input.brake && S.vf > 1 ? -0.022 : input.throttle && S.vf < P.top * 0.8 ? 0.012 : 0), 6, dt);
      holder.position.set(S.x, 0, S.z); holder.rotation.y = S.th;
      car.setDrive(S.spin, S.steer * 0.75, S.roll, S.pitch, input.throttle, input.brake && S.vf > 0.5 ? 1 : 0);
      S.bump = Math.max(0, S.bump - dt * 3);
    } else if (S.returning > 0) {
      // glide back into the bay
      S.returning = Math.max(0, S.returning - dt / 0.9);
      const k = 1 - S.returning, e = k * k * (3 - 2 * k), home = bays[S.index];
      holder.position.set(fromX.x + (home.x - fromX.x) * e, 0, fromX.z * (1 - e));
      holder.rotation.y = fromX.y + angDiff(fromX.y, yaw()) * e;
      car.setDrive(S.spin, 0, 0, 0, 0, 0);
      if (S.returning === 0) {
        home.pivot.add(holder); holder.position.set(0, 0, 0); holder.rotation.set(0, yaw(), 0);
        group.visible = false; S.index = -1;
      }
    }
  }

  return { state: S, enter, exit, reset, update, profile: () => P, busy: () => S.active || S.returning > 0 };
}
