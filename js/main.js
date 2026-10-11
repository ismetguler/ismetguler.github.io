import { PROJECTS } from './data.js';
import { createHud, buildClassic } from './ui.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const body = document.body, classic = $('classic'), canvas = $('scene');
const loader = $('loader'), gaugeFill = $('gauge-fill'), gaugeNeedle = $('gauge-needle'), gaugeNum = $('gauge-num');
const introLine = $('intro-line'), swipeHint = $('swipe-hint');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let world = null, mode = 'row', booting = false, pickLock = true;
const audio = createAudio();
const PALETTE = ['#c20f1f', '#1a4fd6', '#ffb400', '#0f7a4a', '#f1f0ea', '#0d0f13', '#ff5a1f'];
const painted = {};   // car index -> chosen paint
const kind = () => PROJECTS[world.index].car, car = () => world.cars[world.index];
const fromHash = () => Math.max(0, PROJECTS.findIndex((p) => `#${p.id}` === location.hash));

const hud = createHud({
  select: (i) => select(i),
  prev: () => select(world.index - 1),
  next: () => select(world.index + 1),
  inspect: () => inspect(),
  back: () => back(),
  home: () => back(),
  panel: (name) => openPanel(name),
  classic: () => setClassic(true),
  sound: () => setSound(!audio.enabled),
  rev: () => rev(),
  horn: () => horn(),
  share: () => share(),
  paints: (i) => { const f = world.cars[i].factoryPaint; return { paints: [f, ...PALETTE.filter((c) => c !== f)].slice(0, 7), paint: painted[i] || f }; },
  paint: (hex) => { painted[world.index] = hex; car().setPaint(hex); audio.tick(); },
  drive: () => testDrive(),
  park: () => park(),
  reset: () => world?.resetDrive(),
});
buildClassic(classic, { garage: () => setClassic(false) });

// How much of the width a side drawer covers (0 when it opens as a bottom sheet).
const drawerFraction = (r) => (r.height > innerHeight * 0.9 ? r.width / innerWidth : 0);

function setSound(on) {
  audio.setEnabled(on); hud.setSound(on); store.set('sound', on ? 'on' : 'off');
  if (on && world) audio.engine(kind(), true);
}
function rev() { if (!world) return; car().rev(); audio.engine(kind()); }
function horn() { if (!world) return; car().flash(); audio.horn(kind()); }
function share() {
  const url = `${location.origin}${location.pathname}#${PROJECTS[world.index].id}`, done = () => { const s = document.getElementById('share-state'); if (s) s.textContent = 'Link copied ✓'; };
  if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: document.title, url }).catch(() => {});
  else (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(done, () => {
    // Clipboard API refused (older browser, no permission): fall back to a hidden field.
    const f = Object.assign(document.createElement('textarea'), { value: url }); f.style.cssText = 'position:fixed;opacity:0';
    document.body.append(f); f.select();
    try { if (document.execCommand('copy')) done(); } finally { f.remove(); }
  });
}

function select(i) {
  if (!world || mode === 'drive' || !world.select(i)) return;
  audio.whoosh(); audio.lights();
  swipeHint.classList.add('gone');
  hud.showCar(world.index);
  history.replaceState(null, '', `#${PROJECTS[world.index].id}`);
  if (mode === 'inspect') hud.openDrawer('project', world.index);
  else if (mode === 'panel') back();
}
function inspect() {
  if (!world) return;
  mode = 'inspect';
  world.setMode('inspect', drawerFraction(hud.openDrawer('project', world.index)));
  car().rev(); audio.engine(kind(), true);
}
function openPanel(name) {
  if (!world) return;
  mode = 'panel';
  world.setMode('wide', drawerFraction(hud.openDrawer(name)));
}
// --- test drive ---------------------------------------------------------------------------
const driveEl = { speed: $('drive-speed'), cones: $('drive-cones'), time: $('drive-time'), best: $('drive-best') };
const held = new Set(), pad = { left: false, right: false, gas: false, brake: false };
const shown = { speed: -1, cones: -1, time: -1, hits: 0, bump: 0, done: false };
function steerInput() {
  if (!world) return;
  const k = (...names) => names.some((n) => held.has(n));
  Object.assign(world.input, {
    throttle: k('w', 'arrowup') || pad.gas ? 1 : 0,
    brake: k('s', 'arrowdown') || pad.brake ? 1 : 0,
    steer: (k('a', 'arrowleft') || pad.left ? 1 : 0) - (k('d', 'arrowright') || pad.right ? 1 : 0),
    hand: k(' '),
  });
}
function testDrive() {
  if (!world || mode === 'drive') return;
  if (mode !== 'row') hud.closeDrawer();
  if (!world.setMode('drive')) return;
  mode = 'drive'; body.classList.add('driving'); held.clear(); steerInput();
  Object.assign(shown, { speed: -1, cones: -1, time: -1, hits: 0, done: false });
  const best = +store.get('cone-run') || 0;
  driveEl.best.textContent = best ? `Best ${best.toFixed(1)} s` : 'Knock every cone down';
  audio.engine(kind(), true);
}
function park() {
  if (mode !== 'drive') return;
  mode = 'row'; body.classList.remove('driving'); held.clear(); Object.assign(pad, { left: false, right: false, gas: false, brake: false });
  world.setMode('row'); audio.driveStop();
}
// Called every frame while driving: keeps the read-outs and the engine note in step.
function onDrive(d) {
  const kmh = Math.round(d.speed * 3.6), time = Math.round(d.time * 10);
  if (kmh !== shown.speed) driveEl.speed.textContent = shown.speed = kmh;
  if (d.cones !== shown.cones) { shown.cones = d.cones; driveEl.cones.textContent = `${d.cones} / ${d.coneTotal}`; }
  if (time !== shown.time) { shown.time = time; driveEl.time.textContent = `${d.time.toFixed(1)} s`; }
  if (d.hits > shown.hits) audio.tok();
  shown.hits = d.hits;
  if (d.bump > shown.bump + 0.25) audio.thump(d.bump);
  shown.bump = d.bump;
  if (d.done && !shown.done) {
    const best = +store.get('cone-run') || 0, record = !best || d.time < best;
    if (record) store.set('cone-run', d.time.toFixed(2));
    driveEl.best.textContent = record ? `New best — ${d.time.toFixed(1)} s` : `Cleared · best ${best.toFixed(1)} s`;
    audio.horn(kind());
  }
  shown.done = d.done;
  const top = world.drive.profile().top, sp = Math.abs(d.vf) / top;
  audio.driveUpdate(kind(), sp < 0.02 ? 0.04 : ((sp * 3.1) % 1) * 0.6 + 0.28 + sp * 0.1, d.throttle, d.skid);
}
document.querySelectorAll('[data-pad]').forEach((b) => {
  const set = (v) => (e) => { e.preventDefault(); pad[b.dataset.pad] = v; b.classList.toggle('on', v); steerInput(); };
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); set(true)(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});
addEventListener('keyup', (e) => { held.delete(e.key.toLowerCase()); if (mode === 'drive') steerInput(); });
addEventListener('blur', () => { held.clear(); steerInput(); });

function back() {
  if (mode === 'drive') return park();
  if (mode === 'row') return;
  mode = 'row'; hud.closeDrawer(); world?.setMode('row');
}

function setClassic(on) {
  store.set('view', on ? 'classic' : 'garage');
  body.classList.toggle('classic', on);
  classic.hidden = !on;
  if (on) { world?.stop(); scrollTo(0, 0); } else if (world) world.start(); else boot();
}

// Rev-counter loader: the needle eases towards the real load progress.
const dial = { shown: 0, goal: 0, timer: 0 };
function progress(p) {
  dial.goal = Math.max(dial.goal, p);
  if (dial.timer) return;
  dial.timer = setInterval(() => {
    dial.shown += (dial.goal - dial.shown) * 0.14;
    if (dial.goal - dial.shown < 0.004) dial.shown = dial.goal;
    gaugeFill.style.strokeDashoffset = 100 - dial.shown * 100;
    gaugeNeedle.style.transform = `rotate(${-120 + dial.shown * 240}deg)`;
    gaugeNum.textContent = Math.round(dial.shown * 100);
    if (dial.shown >= 1) { clearInterval(dial.timer); dial.timer = 0; }
  }, 16);
}
const revDone = async () => { for (let k = 0; k < 90 && dial.shown < 1; k++) await wait(20); };

// Resolves after `ms`, or as soon as the visitor taps or presses a key.
function skippable(ms) {
  return new Promise((resolve) => {
    const done = (skipped) => { removeEventListener('pointerdown', onSkip); removeEventListener('keydown', onSkip); clearTimeout(timer); resolve(skipped); };
    const onSkip = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    addEventListener('pointerdown', onSkip); addEventListener('keydown', onSkip);
  });
}

// A still composition for link previews: no HUD, one car, name and line.
function shareCard() {
  world.select(1, true);
  const x = world.bays[1].x;
  world.state.free = [x - 1.9, 1.22, 10.9, x - 2.55, 0.95, 0];
  body.classList.remove('booting'); body.classList.add('og'); loader.classList.add('done');
  body.insertAdjacentHTML('beforeend', '<div class="og-card"><span class="mark"><b>IG</b></span><h2>İsmet Güler</h2><p>Full-stack &amp; mobile developer</p><em>Apps people <i>actually use.</i></em><small>ismetguler.github.io</small></div>');
  window.__booted = true;
}

async function boot() {
  if (booting) return; booting = true;
  try {
    progress(0.1);
    await Promise.race([Promise.all(['800', 'italic 800', '600', '700'].map((f) => document.fonts.load(`${f} 40px "Barlow Condensed"`))), wait(2500)]);
    progress(0.22);
    const { createWorld } = await import('./world.js');
    world = await createWorld({
      canvas, projects: PROJECTS,
      onProgress: (p) => progress(0.26 + p * 0.7),
      onPick: (i) => { if (!pickLock) (i === world.index ? inspect() : select(i)); },
      onDrive,
    });
    if (location.search.includes('debug')) window.__garage = world;
    world.select(fromHash(), true);
    world.start();
    progress(1);
    await revDone();
    await wait(260);

    if (new URLSearchParams(location.search).has('og')) return shareCard();

    // Lights come on bay by bay while the camera rolls in.
    loader.classList.add('done');
    body.classList.replace('booting', 'intro');
    world.intro();
    introLine.classList.add('show');
    if (await skippable(3000)) world.skipIntro();
    introLine.classList.remove('show');
    body.classList.remove('intro');
    hud.showCar(world.index);
    window.__booted = true;
    setTimeout(() => { pickLock = false; }, 500);
  } catch (err) {
    console.error('3D garage failed to start — showing the classic view.', err);
    body.classList.remove('booting', 'intro');
    body.classList.add('classic'); classic.hidden = false; window.__booted = true;
    classic.insertAdjacentHTML('afterbegin', `<p class="notice">The 3D garage couldn’t start on this device, so here’s the classic view. <span>${String(err?.message || err).replace(/[<&]/g, '')}</span></p>`);
  }
}

addEventListener('keydown', (e) => {
  if (body.classList.contains('classic') || body.classList.contains('booting') || body.classList.contains('intro') || !world || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (mode === 'drive') {
    if (k === 'Escape') return park();
    if (k === 'r' || k === 'R') return world.resetDrive();
    if (k === 'h' || k === 'H') return horn();
    if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
    held.add(k.toLowerCase()); return steerInput();
  }
  if (k === 't' || k === 'T') return testDrive();
  if (k === 'ArrowRight' || k === 'd' || k === 'D') select(world.index + 1);
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') select(world.index - 1);
  else if (k === 'Enter' && mode === 'row' && !e.target.closest('button,a')) inspect();
  else if (k === 'Escape') { body.classList.remove('menu-open'); back(); }
  else if ((k === 'e' || k === 'E') && mode !== 'panel') rev();
  else if ((k === 'h' || k === 'H') && mode !== 'panel') horn();
  else if (k >= '1' && k <= String(PROJECTS.length)) select(+k - 1);
});

let wheelAt = 0, wheelSum = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!world) return;
  const now = performance.now(), d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (now - wheelAt < 520) return;
  wheelSum += d;
  if (Math.abs(wheelSum) > 40) { select(world.index + (wheelSum > 0 ? 1 : -1)); wheelSum = 0; wheelAt = now; }
}, { passive: false });

// UI ticks, and a remembered "sound on" comes back with the first gesture (browsers require one).
addEventListener('click', (e) => { if (e.target.closest('button, a')) audio.tick(); });
if (store.get('sound') === 'on') addEventListener('pointerdown', () => { audio.setEnabled(true); hud.setSound(true); }, { once: true });

// Showroom mode: left alone, the garage walks through the cars by itself.
let idleAt = performance.now(), autoAt = 0;
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { idleAt = performance.now(); }, { passive: true });
setInterval(() => {
  const now = performance.now(), c = body.classList;
  if (!world || mode !== 'row' || document.hidden || c.contains('classic') || c.contains('booting') || c.contains('intro') || c.contains('menu-open')) { idleAt = now; return; }
  if (now - idleAt > 24000 && now > autoAt) { autoAt = now + 7500; select((world.index + 1) % PROJECTS.length); }
}, 1000);

if (store.get('view') === 'classic') { body.classList.remove('booting'); body.classList.add('classic'); classic.hidden = false; window.__booted = true; } else boot();
