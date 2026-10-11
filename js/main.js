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
  if (!world || !world.select(i)) return;
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
function back() {
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
    });
    if (location.search.includes('debug')) window.__garage = world;
    world.select(fromHash(), true);
    world.start();
    progress(1);
    await revDone();
    await wait(260);

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
  }
}

addEventListener('keydown', (e) => {
  if (body.classList.contains('classic') || body.classList.contains('booting') || body.classList.contains('intro') || !world || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
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
