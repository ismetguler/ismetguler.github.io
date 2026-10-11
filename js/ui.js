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

const PANELS = {
  project(i) {
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
      <div class="car-actions">${linkBtn(p, 'primary')}</div>
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
      </dl>
      ${PROFILE.about.map((t) => `<p>${esc(t)}</p>`).join('')}
      <h3>By the numbers</h3>
      <dl class="sheet">${PROFILE.facts.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>
      <h3>What I do</h3>
      <ul class="rows">${PROFILE.services.map(([t, d]) => `<li><strong>${esc(t)}</strong><p>${esc(d)}</p></li>`).join('')}</ul>
      <div class="car-actions"><button class="btn primary" data-panel="contact"><span>Hire me</span></button></div>`;
  },
  logbook() {
    return `
      <p class="eyebrow">Logbook</p>
      <h2>Service history</h2>
      <ul class="rows">${EXPERIENCE.map(([t, org, when, d]) => `<li><strong>${esc(t)}</strong><em>${esc(org)} · <b>${esc(when)}</b></em><p>${esc(d)}</p></li>`).join('')}</ul>`;
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
        <button data-act="copy-email"><b>Copy email</b><span id="copy-state">to clipboard</span></button>
      </div>`;
  },
};

export function createHud(on) {
  const info = $('#car-info'), spec = $('#spec'), selector = $('#selector'), drawer = $('#drawer'), body = $('#drawer-body');
  const arrow = (dir) => `<button class="arrow" data-act="${dir}" aria-label="${dir === 'prev' ? 'Previous' : 'Next'} car"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir === 'prev' ? 'M14 5l-7 7 7 7' : 'M10 5l7 7-7 7'}"/></svg></button>`;
  selector.innerHTML = `${arrow('prev')}<ol>${PROJECTS.map((p, i) => `<li><button data-car="${i}" aria-label="Bay ${no(i)}: ${esc(p.name)}">${no(i)}<span${lang(p)}>${esc(p.name)}</span></button></li>`).join('')}</ol>${arrow('next')}`;

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-panel],[data-car]');
    if (!t) return;
    if (t.dataset.car !== undefined) return on.select(+t.dataset.car);
    if (t.dataset.panel) { document.body.classList.remove('menu-open'); return on.panel(t.dataset.panel); }
    const act = t.dataset.act;
    if (act === 'home') e.preventDefault();
    if (act === 'menu') return document.body.classList.toggle('menu-open');
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
        <div class="car-actions"><button class="btn primary" data-act="inspect"><span>Inspect <kbd>Enter</kbd></span></button>${linkBtn(p)}</div>`;
      replay(info);
      spec.innerHTML = `<h2>Spec sheet</h2><dl>${p.specs.map(([v, l], k) => `<div style="--i:${k}"><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>${chips(p.stack)}`;
      replay(spec);
      selector.querySelectorAll('[data-car]').forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
      selector.querySelector('[data-act=prev]').disabled = i === 0;
      selector.querySelector('[data-act=next]').disabled = i === PROJECTS.length - 1;
    },
    openDrawer(kind, i) {
      body.innerHTML = PANELS[kind](i);
      stagger(body); replay(body); body.scrollTop = 0;
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
      document.querySelectorAll('.nav [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === kind));
      return drawer.getBoundingClientRect();
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
      </div>
    </section>
    <footer>© ${esc(PROFILE.name)} · built remotely from Türkiye</footer>`;
  root.addEventListener('click', (e) => { if (e.target.closest('[data-act=garage]')) on.garage(); });
}
