import { PROJECTS } from './data.js';
import { createHud, buildClassic } from './ui.js';

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
});
buildClassic(classic, { garage: () => setClassic(false) });

// How much of the width a side drawer covers (0 when it opens as a bottom sheet).
const drawerFraction = (r) => (r.height > innerHeight * 0.9 ? r.width / innerWidth : 0);

function select(i) {
  if (!world || !world.select(i)) return;
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
const rev = { shown: 0, goal: 0, timer: 0 };
function progress(p) {
  rev.goal = Math.max(rev.goal, p);
  if (rev.timer) return;
  rev.timer = setInterval(() => {
    rev.shown += (rev.goal - rev.shown) * 0.14;
    if (rev.goal - rev.shown < 0.004) rev.shown = rev.goal;
    gaugeFill.style.strokeDashoffset = 100 - rev.shown * 100;
    gaugeNeedle.style.transform = `rotate(${-120 + rev.shown * 240}deg)`;
    gaugeNum.textContent = Math.round(rev.shown * 100);
    if (rev.shown >= 1) { clearInterval(rev.timer); rev.timer = 0; }
  }, 16);
}
const revDone = async () => { for (let k = 0; k < 90 && rev.shown < 1; k++) await wait(20); };

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
    setTimeout(() => { pickLock = false; }, 500);
  } catch (err) {
    console.error('3D garage failed to start — showing the classic view.', err);
    body.classList.remove('booting', 'intro');
    body.classList.add('classic'); classic.hidden = false;
  }
}

addEventListener('keydown', (e) => {
  if (body.classList.contains('classic') || body.classList.contains('booting') || body.classList.contains('intro') || !world || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') select(world.index + 1);
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') select(world.index - 1);
  else if (k === 'Enter' && mode === 'row' && !e.target.closest('button,a')) inspect();
  else if (k === 'Escape') { body.classList.remove('menu-open'); back(); }
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

if (store.get('view') === 'classic') { body.classList.remove('booting'); body.classList.add('classic'); classic.hidden = false; } else boot();
