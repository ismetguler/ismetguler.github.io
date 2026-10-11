// All sound is synthesised with Web Audio — no audio files. Off until the visitor turns it on.

const ENGINES = {
  truck: { idle: 38, peak: 96, dur: 2.2, vol: 0.34, grit: 5 },
  coupe: { idle: 58, peak: 205, dur: 1.9, vol: 0.3, grit: 4 },
  suv: { idle: 46, peak: 124, dur: 2.0, vol: 0.32, grit: 4 },
  police: { idle: 62, peak: 176, dur: 1.9, vol: 0.28, grit: 3, siren: true },
  hatch: { idle: 84, peak: 268, dur: 1.6, vol: 0.24, grit: 3 },
  rocket: { rocket: true, dur: 2.6, vol: 0.4 },
  van: { electric: true, dur: 1.8, vol: 0.2 },
};
const HORNS = {
  truck: [[311, 392], 0.55, 1], coupe: [[440, 554], 0.32, 1], suv: [[370, 466], 0.42, 1],
  hatch: [[523, 659], 0.13, 2], van: [[494, 622], 0.3, 1],
};

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, on = false, hum = null, loop = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  const noise = () => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n; };
  const gain = (v, to = master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
  const filter = (type, f, q, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(to); return b; };
  const osc = (type, f, to, t0, t1) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(t0); o.stop(t1); return o; };
  const shaper = (k, to) => { const w = ctx.createWaveShaper(), c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; c[i] = Math.tanh(x * k); } w.curve = c; w.connect(to); return w; };
  const env = (p, t0, pts) => { p.cancelScheduledValues(t0); p.setValueAtTime(pts[0][1], t0 + pts[0][0]); for (let i = 1; i < pts.length; i++) p.exponentialRampToValueAtTime(Math.max(pts[i][1], 1e-4), t0 + pts[i][0]); };

  // Quiet room tone: mains hum plus ventilation.
  function startHum() {
    if (hum) return;
    const g = gain(0.0001); const t = ctx.currentTime;
    osc('sine', 50, gain(0.028, g), t, t + 86400); osc('sine', 100, gain(0.012, g), t, t + 86400);
    const n = noise(); n.connect(filter('lowpass', 420, 0.4, gain(0.022, g))); n.start();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 2);
    hum = g;
  }

  const api = {
    get enabled() { return on; },
    setEnabled(v) {
      on = v;
      if (!v && !ctx) return;
      ensure(); startHum();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(v ? 0.7 : 0, ctx.currentTime, 0.08);
    },
    tick() {
      if (!on) return; const t = ctx.currentTime, g = gain(0);
      env(g.gain, t, [[0, 0.05], [0.04, 0.0001]]); osc('square', 1500, filter('highpass', 900, 0.5, g), t, t + 0.05);
    },
    // Relay clack of a fluorescent fixture striking.
    clack(delay = 0, vol = 1) {
      if (!on) return; const t = ctx.currentTime + delay, g = gain(0);
      env(g.gain, t, [[0, 0.22 * vol], [0.07, 0.0001]]);
      const n = noise(); n.connect(filter('bandpass', 2300, 1.2, g)); n.start(t); n.stop(t + 0.08);
      const o = osc('sine', 120, g, t, t + 0.09); env(o.frequency, t, [[0, 140], [0.08, 60]]);
    },
    lights() { api.clack(0.02); api.clack(0.15, 0.7); api.clack(0.32, 0.9); },
    whoosh() {
      if (!on) return; const t = ctx.currentTime, g = gain(0);
      env(g.gain, t, [[0, 0.0001], [0.16, 0.13], [0.6, 0.0001]]);
      const f = filter('bandpass', 300, 0.9, g); env(f.frequency, t, [[0, 260], [0.3, 1300], [0.6, 380]]);
      const n = noise(); n.connect(f); n.start(t); n.stop(t + 0.65);
    },
    engine(kind, short = false) {
      if (!on) return; const P = ENGINES[kind] || ENGINES.coupe, t = ctx.currentTime, dur = P.dur * (short ? 0.62 : 1), out = gain(0);
      if (P.rocket) {
        env(out.gain, t, [[0, 0.0001], [0.5, P.vol], [dur * 0.7, P.vol * 0.8], [dur, 0.0001]]);
        const f = filter('lowpass', 200, 0.7, out); env(f.frequency, t, [[0, 160], [0.6, 2600], [dur, 240]]);
        const n = noise(); n.connect(f); n.start(t); n.stop(t + dur);
        const sub = osc('sawtooth', 44, shaper(3, gain(0.5, out)), t, t + dur); env(sub.frequency, t, [[0, 36], [0.6, 62], [dur, 40]]);
        return;
      }
      if (P.electric) {
        env(out.gain, t, [[0, 0.0001], [0.12, P.vol], [dur * 0.7, P.vol * 0.7], [dur, 0.0001]]);
        for (const [type, m] of [['sine', 1], ['triangle', 2.01], ['sine', 3.02]]) { const o = osc(type, 200, gain(m === 1 ? 0.6 : 0.16, out), t, t + dur); env(o.frequency, t, [[0, 170 * m], [dur * 0.45, 640 * m], [dur, 260 * m]]); }
        for (const [d, f] of [[0.05, 1318], [0.2, 1760]]) { const g = gain(0, out); env(g.gain, t + d, [[0, 0.5], [0.5, 0.0001]]); osc('sine', f, g, t + d, t + d + 0.55); }   // notification chime
        return;
      }
      env(out.gain, t, [[0, 0.0001], [0.07, P.vol], [dur * 0.72, P.vol * 0.85], [dur, 0.0001]]);
      const lp = filter('lowpass', 400, 1.4, out); env(lp.frequency, t, [[0, P.idle * 7], [dur * 0.36, P.peak * 9], [dur, P.idle * 6]]);
      const sh = shaper(P.grit, lp);
      for (const [type, m, v] of [['sawtooth', 1, 0.5], ['sawtooth', 1.007, 0.45], ['square', 0.5, 0.4], ['sawtooth', 2.01, 0.16]]) {
        const o = osc(type, P.idle * m, gain(v, sh), t, t + dur);
        env(o.frequency, t, [[0, P.idle * m], [dur * 0.36, P.peak * m], [dur * 0.5, P.peak * 0.86 * m], [dur, P.idle * 1.1 * m]]);
      }
      const n = noise(); n.connect(filter('bandpass', 900, 0.6, gain(0.05, out))); n.start(t); n.stop(t + dur);
      if (P.siren && !short) api.siren(0.25);
    },
    siren(delay = 0) {
      if (!on) return; const t = ctx.currentTime + delay, g = gain(0);
      env(g.gain, t, [[0, 0.0001], [0.05, 0.1], [1.25, 0.1], [1.4, 0.0001]]);
      const o = osc('square', 650, filter('lowpass', 2400, 0.7, g), t, t + 1.4);
      env(o.frequency, t, [[0, 640], [0.35, 1380], [0.7, 640], [1.05, 1380], [1.4, 640]]);
    },
    // Continuous engine while driving. rpm, throttle and skid are all 0..1.
    driveUpdate(kind, rpm, throttle, skid) {
      if (!on) { if (loop) api.driveStop(); return; }
      if (!loop || loop.kind !== kind) {
        api.driveStop();
        const P = ENGINES[kind] || ENGINES.coupe, t = ctx.currentTime, out = gain(0), nodes = [], oscs = [];
        const lp = filter('lowpass', 500, 1.2, out);
        const voices = P.rocket ? [['sawtooth', 1, 0.5], ['square', 0.5, 0.4]] : P.electric ? [['sine', 1, 0.6], ['triangle', 2.01, 0.18]] : [['sawtooth', 1, 0.5], ['sawtooth', 1.007, 0.45], ['square', 0.5, 0.4]];
        const into = P.electric ? lp : shaper(P.grit || 3, lp);
        for (const [type, m, v] of voices) { const o = osc(type, 60, gain(v, into), t, t + 86400); oscs.push([o, m]); nodes.push(o); }
        const roar = gain(0, out), rn = noise(); rn.connect(filter('lowpass', 1500, 0.6, roar)); rn.start(); nodes.push(rn);
        const sk = gain(0), sn = noise(); sn.connect(filter('bandpass', 1900, 3.5, sk)); sn.start(); nodes.push(sn);
        loop = { kind, out, lp, oscs, roar, sk, nodes, idle: P.rocket ? 40 : P.electric ? 150 : P.idle, peak: P.rocket ? 96 : P.electric ? 900 : P.peak, vol: P.vol * (P.rocket ? 0.8 : 0.62), rocket: !!P.rocket };
      }
      const t = ctx.currentTime, f = loop.idle + (loop.peak - loop.idle) * rpm;
      for (const [o, m] of loop.oscs) o.frequency.setTargetAtTime(f * m, t, 0.06);
      loop.lp.frequency.setTargetAtTime(f * (4.5 + 5 * throttle), t, 0.08);
      loop.out.gain.setTargetAtTime(loop.vol * (0.4 + 0.45 * throttle + 0.15 * rpm), t, 0.09);
      loop.roar.gain.setTargetAtTime(loop.rocket ? 0.15 + 0.9 * throttle : 0.03 + 0.04 * rpm, t, 0.1);
      loop.sk.gain.setTargetAtTime(skid * 0.1, t, 0.05);
    },
    driveStop() {
      if (!loop) return; const l = loop; loop = null;
      l.out.gain.setTargetAtTime(0, ctx.currentTime, 0.12); l.sk.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => l.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 700);
    },
    thump(v = 1) {
      if (!on) return; const t = ctx.currentTime, g = gain(0);
      env(g.gain, t, [[0, 0.4 * v], [0.22, 0.0001]]);
      const o = osc('sine', 90, g, t, t + 0.24); env(o.frequency, t, [[0, 110], [0.2, 42]]);
      const n = noise(); n.connect(filter('lowpass', 700, 0.7, g)); n.start(t); n.stop(t + 0.12);
    },
    tok() {
      if (!on) return; const t = ctx.currentTime, g = gain(0);
      env(g.gain, t, [[0, 0.16], [0.09, 0.0001]]);
      const o = osc('triangle', 500, filter('bandpass', 700, 2, g), t, t + 0.1); env(o.frequency, t, [[0, 560 + Math.random() * 160], [0.09, 240]]);
    },
    horn(kind) {
      if (!on) return;
      if (kind === 'police') return api.siren();
      if (kind === 'rocket') return api.engine('rocket', true);
      const [freqs, len, reps] = HORNS[kind] || HORNS.coupe, t = ctx.currentTime;
      for (let r = 0; r < reps; r++) {
        const s = t + r * (len + 0.09), g = gain(0);
        env(g.gain, s, [[0, 0.0001], [0.02, 0.13], [len - 0.03, 0.13], [len, 0.0001]]);
        const f = filter('lowpass', 2200, 0.8, g);
        for (const hz of freqs) osc('square', hz, f, s, s + len);
      }
    },
  };

  document.addEventListener('visibilitychange', () => { if (ctx && on) master.gain.setTargetAtTime(document.hidden ? 0 : 0.7, ctx.currentTime, 0.1); });
  return api;
}
