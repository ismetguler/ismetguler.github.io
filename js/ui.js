// HUD, drawer panels and the classic (plain) view — all rendered from data.js.
import { PROFILE, PROJECTS, EXPERIENCE, SKILLS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const no = (i) => String(i + 1).padStart(2, '0');
const lang = (p) => (p.lang ? ` lang="${p.lang}"` : '');
const replay = (el) => { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); };
const stagger = (el) => [...el.children].forEach((c, i) => c.style.setProperty('--i', i));

function titleHTML(name) {
  let i = 0;
  return name.split(' ').map((w) => `<span class="w">${[...w].map((c) => `<span class="c" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
}

const chips = (list) => `<ul class="chips">${list.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
const linkBtn = (p, cls = '') => `<a class="btn ${cls}" href="${esc(p.link[1])}" target="_blank" rel="noopener"><span>${esc(p.link[0])} ↗</span></a>`;

// Live GitHub numbers. Public API, no key; cached for the session and dropped silently if it fails.
let gh = null;
function loadGitHub() {
  if (gh) return gh;
  try { const c = sessionStorage.getItem('gh2'); if (c) return (gh = Promise.resolve(JSON.parse(c))); } catch { /* storage blocked */ }
  const get = (path) => fetch(`https://api.github.com/users/IsmetGuler${path}`, { headers: { accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
  gh = Promise.all([get(''), get('/repos?sort=pushed&per_page=12')]).then(([u, repos]) => {
    const skip = ['ismetguler', 'ismetguler.github.io'];   // profile README and this site itself
    const data = { repos: u.public_repos, last: repos[0]?.pushed_at, list: repos.filter((r) => !r.fork && !skip.includes(r.name.toLowerCase())).slice(0, 5).map((r) => ({ name: r.name, url: r.html_url, lang: r.language, pushed: r.pushed_at, desc: r.description })) };
    try { sessionStorage.setItem('gh2', JSON.stringify(data)); } catch { /* fine */ }
    return data;
  });
  gh.catch(() => { gh = null; });
  return gh;
}
function ago(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`;
}
const GH_SLOT = '<section class="gh" data-gh hidden></section>';
function fillGitHub(root) {
  const el = root.querySelector('[data-gh]');
  if (!el) return;
  loadGitHub().then((d) => {
    el.innerHTML = `
      <h3>Live from GitHub</h3>
      <dl class="sheet"><div><dt>${esc(d.repos)}</dt><dd>public repositories</dd></div><div><dt>${esc(d.last ? ago(d.last) : '—')}</dt><dd>last push</dd></div></dl>
      <ul class="rows">${d.list.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener"><strong>${esc(r.name)} ↗</strong></a><em>${r.lang ? `${esc(r.lang)} · ` : ''}<b>pushed ${ago(r.pushed)}</b></em>${r.desc ? `<p>${esc(r.desc)}</p>` : ''}</li>`).join('')}</ul>`;
    el.hidden = false;
  }, () => el.remove());
}

let soundOn = false;
const soundBtn = () => `<button class="sound" data-act="sound" aria-pressed="${soundOn}" aria-label="Sound"><i class="eq"><b></b><b></b><b></b><b></b></i><span>Sound ${soundOn ? 'on' : 'off'}</span></button>`;

const PANELS = {
  project(i, x) {
    const p = PROJECTS[i];
    return `
      <p class="eyebrow">Bay ${no(i)} · ${esc(p.model)} · ${esc(p.plate)}</p>
      <h2${lang(p)}>${esc(p.name)}</h2>
      <p class="car-status">${esc(p.status)}</p>
      <p>${esc(p.desc)}</p>
      <h3>Build sheet</h3>
      <dl class="sheet">${p.specs.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>
      <h3>Under the hood</h3>
      ${chips(p.stack)}
      <h3>Try it</h3>
      <div class="try">
        <button class="btn primary" data-act="drive"><span>Test drive <kbd>T</kbd></span></button>
        <button class="btn" data-act="rev"><span>${esc(p.rev || 'Rev engine')} <kbd>E</kbd></span></button>
        <button class="btn" data-act="horn"><span>${esc(p.horn || 'Horn')} <kbd>H</kbd></span></button>
        ${soundBtn()}
      </div>
      <div class="paint" role="group" aria-label="Paint"><span>Paint</span>${x.paints.map((c, k) => `<button data-paint="${c}" style="--c:${c}" aria-pressed="${c === x.paint}" aria-label="${k ? `Repaint ${c}` : 'Factory paint'}"></button>`).join('')}</div>
      <div class="car-actions">${linkBtn(p, 'primary')}<button class="btn" data-act="share"><span id="share-state">Copy link</span></button></div>
      <p class="tip">Drag the car to spin it · ← → for the next bay</p>`;
  },
  driver() {
    return `
      <p class="eyebrow">Driver</p>
      <h2>${esc(PROFILE.name)}</h2>
      <dl class="id-card">
        <dt>Role</dt><dd>${esc(PROFILE.role)}</dd>
        <dt>Base</dt><dd>${esc(PROFILE.location)} · remote, worldwide</dd>
        <dt>School</dt><dd>Erciyes University · Computer Engineering</dd>
        <dt>English</dt><dd>B2</dd>
        <dt>Status</dt><dd>Available for remote work</dd>
      </dl>
      ${PROFILE.about.map((t) => `<p>${esc(t)}</p>`).join('')}
      <h3>By the numbers</h3>
      <dl class="sheet">${PROFILE.facts.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>
      <h3>What I do</h3>
      <ul class="rows">${PROFILE.services.map(([t, d]) => `<li><strong>${esc(t)}</strong><p>${esc(d)}</p></li>`).join('')}</ul>
      <div class="car-actions"><button class="btn primary" data-panel="contact"><span>Hire me</span></button><a class="btn" href="${esc(PROFILE.cv.en)}" download><span>Download CV ↓</span></a></div>
      <p class="tip"><a href="${esc(PROFILE.cv.tr)}" download>CV in Turkish ↓</a></p>`;
  },
  logbook() {
    return `
      <p class="eyebrow">Logbook</p>
      <h2>Service history</h2>
      <ul class="rows">${EXPERIENCE.map(([t, org, when, d]) => `<li><strong>${esc(t)}</strong><em>${esc(org)} · <b>${esc(when)}</b></em><p>${esc(d)}</p></li>`).join('')}</ul>
      ${GH_SLOT}`;
  },
  toolbox() {
    return `
      <p class="eyebrow">Toolbox</p>
      <h2>How I get it done</h2>
      ${SKILLS.map(([t, list]) => `<h3>${esc(t)}</h3>${chips(list)}`).join('')}`;
  },
  contact() {
    return `
      <p class="eyebrow">Hire me</p>
      <h2>Got a project in mind?</h2>
      <p>Tell me what you want to build. I’ll come back with a clear scope, timeline, and price — usually within a day. Remote, worldwide.</p>
      <h3>Reach me</h3>
      <div class="links">
        <a href="mailto:${esc(PROFILE.email)}"><b>Email</b><span>${esc(PROFILE.email)}</span></a>
        <a href="${esc(PROFILE.linkedin)}" target="_blank" rel="noopener"><b>LinkedIn</b><span>in/ismet-güler ↗</span></a>
        <a href="${esc(PROFILE.github)}" target="_blank" rel="noopener"><b>GitHub</b><span>IsmetGuler ↗</span></a>
        <a href="${esc(PROFILE.cv.en)}" download><b>CV</b><span>PDF · English ↓</span></a>
        <a href="${esc(PROFILE.cv.tr)}" download><b lang="tr">Özgeçmiş</b><span>PDF · Türkçe ↓</span></a>
        <button data-act="copy-email"><b>Copy email</b><span id="copy-state">to clipboard</span></button>
      </div>`;
  },
};

export function createHud(on) {
  const info = $('#car-info'), spec = $('#spec'), selector = $('#selector'), drawer = $('#drawer'), body = $('#drawer-body');
  const arrow = (dir) => `<button class="arrow" data-act="${dir}" aria-label="${dir === 'prev' ? 'Previous' : 'Next'} car"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir === 'prev' ? 'M14 5l-7 7 7 7' : 'M10 5l7 7-7 7'}"/></svg></button>`;
  selector.innerHTML = `${arrow('prev')}<ol>${PROJECTS.map((p, i) => `<li><button data-car="${i}" aria-label="Bay ${no(i)}: ${esc(p.name)}">${no(i)}<span${lang(p)}>${esc(p.name)}</span></button></li>`).join('')}</ol>${arrow('next')}`;

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-panel],[data-car],[data-paint]');
    if (!t) return;
    if (t.dataset.car !== undefined) return on.select(+t.dataset.car);
    if (t.dataset.panel) { document.body.classList.remove('menu-open'); return on.panel(t.dataset.panel); }
    if (t.dataset.paint) { body.querySelectorAll('[data-paint]').forEach((b) => b.setAttribute('aria-pressed', b === t)); return on.paint(t.dataset.paint); }
    const act = t.dataset.act;
    if (act === 'home') e.preventDefault();
    if (act === 'menu') return document.body.classList.toggle('menu-open');
    if (act === 'sound' || act === 'rev' || act === 'horn' || act === 'share') return on[act]();
    if (act === 'copy-email') return navigator.clipboard?.writeText(PROFILE.email).then(() => { const s = $('#copy-state'); if (s) s.textContent = 'copied ✓'; });
    document.body.classList.remove('menu-open');
    on[act]?.();
  });

  return {
    showCar(i) {
      const p = PROJECTS[i];
      document.documentElement.style.setProperty('--car', p.color);
      info.innerHTML = `
        <p class="bay"><b>${no(i)}</b><span>/ ${no(PROJECTS.length - 1)}</span><i></i><span>${esc(p.model)}</span></p>
        <h2 class="car-name"${lang(p)}>${titleHTML(p.name)}</h2>
        <p class="car-status">${esc(p.status)}</p>
        <p class="car-tag">${esc(p.tag)}</p>
        <div class="car-actions"><button class="btn primary" data-act="inspect"><span>Inspect <kbd>Enter</kbd></span></button><button class="btn" data-act="drive"><span>Test drive <kbd>T</kbd></span></button>${linkBtn(p)}</div>`;
      replay(info);
      spec.innerHTML = `<h2>Spec sheet</h2><dl>${p.specs.map(([v, l], k) => `<div style="--i:${k}"><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>${chips(p.stack)}`;
      replay(spec);
      selector.querySelectorAll('[data-car]').forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
      selector.querySelector('[data-act=prev]').disabled = i === 0;
      selector.querySelector('[data-act=next]').disabled = i === PROJECTS.length - 1;
    },
    openDrawer(kind, i) {
      body.innerHTML = PANELS[kind](i, kind === 'project' ? on.paints(i) : null);
      stagger(body); replay(body); body.scrollTop = 0; fillGitHub(body);
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
      document.querySelectorAll('.nav [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === kind));
      return drawer.getBoundingClientRect();
    },
    setSound(v) {
      soundOn = v;
      document.querySelectorAll('.sound').forEach((b) => { b.setAttribute('aria-pressed', v); b.querySelector('span').textContent = `Sound ${v ? 'on' : 'off'}`; });
    },
    closeDrawer() {
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('drawer-open');
      document.querySelectorAll('.nav [data-panel]').forEach((b) => b.classList.remove('on'));
    },
  };
}

export function buildClassic(root, on) {
  root.innerHTML = `
    <header>
      <span class="brand"><span class="mark"><b>IG</b></span><span class="brand-txt"><strong>${esc(PROFILE.name)}</strong></span></span>
      <button class="btn" data-act="garage"><span>Enter the garage →</span></button>
    </header>
    <section>
      <p class="eyebrow">${esc(PROFILE.role)} · ${esc(PROFILE.location)}</p>
      <h1>${esc(PROFILE.name)}<br><em>builds apps people actually use.</em></h1>
      <p class="lead">${esc(PROFILE.about[0])}</p>
      <dl class="sheet facts">${PROFILE.facts.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>
    </section>
    <section>
      <h2>Selected work</h2>
      ${PROJECTS.map((p) => `<article><h3${lang(p)}>${esc(p.name)}</h3><p class="car-status" style="--car:${p.color}">${esc(p.status)}</p><p>${esc(p.desc)}</p>${chips(p.stack)}<a class="more" href="${esc(p.link[1])}" target="_blank" rel="noopener">${esc(p.link[0])} ↗</a></article>`).join('')}
    </section>
    <section>
      <h2>About</h2>
      ${PROFILE.about.slice(1).map((t) => `<p class="lead">${esc(t)}</p>`).join('')}
      <ul class="rows" style="margin-top:28px">${PROFILE.services.map(([t, d]) => `<li><strong>${esc(t)}</strong><p>${esc(d)}</p></li>`).join('')}</ul>
    </section>
    <section>
      <h2>Experience</h2>
      <ul class="rows">${EXPERIENCE.map(([t, org, when, d]) => `<li><strong>${esc(t)}</strong><em>${esc(org)} · <b>${esc(when)}</b></em><p>${esc(d)}</p></li>`).join('')}</ul>
    </section>
    ${GH_SLOT}
    <section>
      <h2>Toolbox</h2>
      <div class="skills">${SKILLS.map(([t, list]) => `<div><h4>${esc(t)}</h4>${chips(list)}</div>`).join('')}</div>
    </section>
    <section>
      <h2>Contact</h2>
      <p class="lead">Tell me what you want to build. I’ll come back with a clear scope, timeline, and price — usually within a day.</p>
      <div class="links" style="margin-top:24px">
        <a href="mailto:${esc(PROFILE.email)}"><b>Email</b><span>${esc(PROFILE.email)}</span></a>
        <a href="${esc(PROFILE.linkedin)}" target="_blank" rel="noopener"><b>LinkedIn</b><span>in/ismet-güler ↗</span></a>
        <a href="${esc(PROFILE.github)}" target="_blank" rel="noopener"><b>GitHub</b><span>IsmetGuler ↗</span></a>
        <a href="${esc(PROFILE.cv.en)}" download><b>CV</b><span>PDF · English ↓</span></a>
        <a href="${esc(PROFILE.cv.tr)}" download><b lang="tr">Özgeçmiş</b><span>PDF · Türkçe ↓</span></a>
      </div>
    </section>
    <footer>© ${esc(PROFILE.name)} · built remotely from Türkiye</footer>`;
  fillGitHub(root);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-act=garage]')) on.garage(); });
}
