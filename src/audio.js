'use strict';
// =============================================================================
// AUDIO — every sound is synthesized with WebAudio (no files to load).
// Browsers only allow audio after a tap/click, so init() is called from input.
// =============================================================================
BR.Audio = {
  ctx: null,
  master: null,
  noise: null,
  volume: 0.6,
  voices: 0,

  // v1.23 SOUND ENGINE: everything still synthesized, but layered like real recordings: a dry bus through a soft
  // compressor plus a send into a generated convolution reverb (an outdoor slap + tail), distance delay (speed of sound)
  // and air absorption (far sounds lose their highs), noise filters that sweep instead of sitting still, and
  // saturation on the low punch so it reads as pressure, not a beep.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.volume;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
      this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(comp); comp.connect(this.master); this.master.connect(c.destination);
      const len = c.sampleRate * 1.0;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // reverb: early reflections + a decaying diffuse tail, slightly different per ear
      const rl = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, rl, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const o = ir.getChannelData(ch);
        for (let i = 0; i < rl; i++) { const t = i / c.sampleRate; o[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6) * (t < 0.012 ? 0 : 0.55); }
        for (const [tt, g] of [[0.017, 0.6], [0.031, 0.45], [0.052, 0.35], [0.083, 0.25], [0.12, 0.18]]) { const i = Math.floor((tt + ch * 0.003) * c.sampleRate); o[i] += g; o[i + 1] -= g * 0.5; } }
      this.verb = c.createConvolver(); this.verb.buffer = ir;
      const vlp = c.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 5200;
      this.verbIn = c.createGain(); this.verbIn.gain.value = 0.55; this.verbIn.connect(vlp); vlp.connect(this.verb); this.verb.connect(comp);
      // saturation curve for punch layers
      const n = 1024, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4); } this.curve = curve;
    } catch (e) { this.ctx = null; }
  },

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },

  ok() { return this.ctx && this.ctx.state === 'running' && this.voices < 56; },

  // routing helper: gain -> (pan) -> dry bus + reverb send
  _out(node, pan, rev) {
    const c = this.ctx; let out = node;
    if (c.createStereoPanner && pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); out = p; }
    out.connect(this.bus || this.master);
    if (rev && this.verbIn) { const s = c.createGain(); s.gain.value = rev; out.connect(s); s.connect(this.verbIn); }
  },
  _done(src) { this.voices++; src.onended = () => { this.voices--; }; },
  // noise layer: filter sweeps f0 -> f1 (exponential), attack then exponential decay
  nz(o) {
    if (this._k) o.vol *= this._k;
    if (!this.ok() || o.vol < 0.004) return;
    const c = this.ctx, t = c.currentTime + (o.at || 0), dur = o.dur;
    const src = c.createBufferSource(); src.buffer = this.noise; if (o.rate) src.playbackRate.value = o.rate;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0), t + dur * (o.sweep || 1));
    const g = c.createGain(), a = o.attack || 0.001;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + a); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); let last = f;
    if (o.hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = o.hp; last.connect(h); last = h; }
    last.connect(g); this._out(g, o.pan, o.rev);
    src.start(t, Math.random() * 0.7); src.stop(t + dur + 0.03); this._done(src);
  },
  // oscillator layer (optionally saturated): pitch sweeps f0 -> f1
  osc(o) {
    if (this._k) o.vol *= this._k;
    if (!this.ok() || o.vol < 0.004) return;
    const c = this.ctx, t = c.currentTime + (o.at || 0), dur = o.dur;
    const s = c.createOscillator(); s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f0, t); s.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 || o.f0), t + dur * (o.sweep || 1));
    const g = c.createGain(), a = o.attack || 0.002;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + a); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    let last = s;
    if (o.drive && this.curve) { const w = c.createWaveShaper(); w.curve = this.curve; const pre = c.createGain(); pre.gain.value = o.drive; s.connect(pre); pre.connect(w); last = w; }
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; last.connect(f); last = f; }
    last.connect(g); this._out(g, o.pan, o.rev);
    s.start(t); s.stop(t + dur + 0.03); this._done(s);
  },
  // a short metallic hit: a click of noise plus a few inharmonic ringing partials (brass, steel, mag springs)
  metal(f, vol, dur, at, pan, rev) {
    this.nz({ f0: f * 1.6, q: 2.2, type: 'bandpass', dur: 0.03, vol: vol, at, pan, rev: rev || 0.08 });
    for (const [k, v] of [[1, 1], [2.76, 0.55], [5.4, 0.3]]) this.osc({ f0: f * k, f1: f * k * 0.995, dur: dur * (1.2 - k * 0.12), vol: vol * 0.22 * v, at, pan, rev: rev || 0.08 });
  },

  // Old generic primitives (kept for the zombie / UI sounds), now through the new bus with a touch of room
  burst(freq, q, dur, vol, pan, type) { this.nz({ f0: freq, q, dur, vol, pan, type: type || 'lowpass', rev: 0.12 }); },
  tone(f0, f1, dur, vol, type) { this.osc({ f0, f1, dur, vol, type, attack: 0.003, rev: 0.06 }); },

  // ---- guns: per-gun recipe. crack = supersonic snap brightness, body = low punch Hz, boom = blast noise length,
  // tail = reverb amount, mech = action clack (bolt carrier / slide) and its pitch
  GUNS: {
    pistol:   { vol: 0.62, crack: 5200, body: 150, bodyDur: 0.09, boom: 0.16, lp0: 7000, lp1: 900, tail: 0.32, mech: 3400 },
    smg:      { vol: 0.5,  crack: 6000, body: 170, bodyDur: 0.06, boom: 0.1,  lp0: 7500, lp1: 1200, tail: 0.24, mech: 3800 },
    rifle:    { vol: 0.66, crack: 5600, body: 120, bodyDur: 0.1,  boom: 0.2,  lp0: 6500, lp1: 700, tail: 0.38, mech: 3000 },
    holoar:   { vol: 0.6,  crack: 6200, body: 130, bodyDur: 0.09, boom: 0.17, lp0: 7200, lp1: 800, tail: 0.34, mech: 3300 },
    lmg:      { vol: 0.7,  crack: 5000, body: 105, bodyDur: 0.12, boom: 0.24, lp0: 6000, lp1: 600, tail: 0.42, mech: 2600 },
    dmr:      { vol: 0.78, crack: 5400, body: 95,  bodyDur: 0.14, boom: 0.32, lp0: 6200, lp1: 520, tail: 0.5, mech: 2800 },
    revolver: { vol: 0.86, crack: 4400, body: 90,  bodyDur: 0.16, boom: 0.36, lp0: 5600, lp1: 480, tail: 0.55, mech: 2200 },
    shotgun:  { vol: 0.95, crack: 3600, body: 70,  bodyDur: 0.2,  boom: 0.42, lp0: 4800, lp1: 380, tail: 0.6, mech: 0 },
    sniper:   { vol: 1.0,  crack: 4800, body: 62,  bodyDur: 0.24, boom: 0.6,  lp0: 5200, lp1: 320, tail: 0.75, mech: 0 },
    hunter:   { vol: 0.92, crack: 5000, body: 75,  bodyDur: 0.2,  boom: 0.48, lp0: 5600, lp1: 420, tail: 0.65, mech: 0 },
  },
  shot(id, dist, pan, suppressed) {
    if (!this.ok()) return;
    dist = dist || 0;
    const near = 1 / (1 + dist / 22), far = Math.min(1, dist / 90), delay = Math.min(0.35, dist / 343);
    const air = 1 - 0.85 * far;                                         // distant shots lose their highs
    if (id === 'launcher') {                                           // hollow thump, compressed-gas hiss
      this.osc({ f0: 110, f1: 42, dur: 0.28, vol: 0.7 * near, drive: 2, at: delay, pan, rev: 0.3 });
      this.nz({ f0: 2600 * air, f1: 400, dur: 0.3, vol: 0.32 * near, at: delay, pan, rev: 0.35 });
      this.nz({ type: 'highpass', f0: 5000, dur: 0.18, vol: 0.08 * near, at: delay + 0.03, pan });
      return;
    }
    const G = this.GUNS[id] || this.GUNS.rifle, j = 0.93 + Math.random() * 0.14, v = G.vol * near * 1.3;
    if (suppressed) {                                                  // a suppressed "thup": low pop, cloth-like hiss, loud action
      this.osc({ f0: G.body * 1.5 * j, f1: G.body * 0.7, dur: 0.07, vol: v * 0.5, drive: 1.5, at: delay, pan, rev: 0.12 });
      this.nz({ f0: 2400 * air * j, f1: 500, dur: 0.09, vol: v * 0.42, q: 0.9, at: delay, pan, rev: 0.15 });
      if (dist < 12) this.metal(G.mech * j, 0.1 * near, 0.05, delay + 0.012, pan);
      return;
    }
    // 1) the crack: a very short bright transient
    if (dist < 60) this.nz({ type: 'highpass', f0: G.crack * j, dur: 0.018, vol: v * 0.55 * air, at: delay, pan, attack: 0.0005 });
    // 2) the punch: saturated low sine dropping in pitch (felt more than heard)
    this.osc({ f0: G.body * 2.2 * j, f1: G.body * 0.55, sweep: 0.5, dur: G.bodyDur * (1 + far), vol: v * (0.85 - far * 0.5), drive: 2.8, lp: 900, at: delay, pan, rev: 0.1 });
    // 3) the blast: wide-band noise whose lowpass sweeps down fast (the "boom")
    this.nz({ f0: G.lp0 * air * j, f1: G.lp1, sweep: 0.45, dur: G.boom * (1 + far * 0.8), vol: v * 0.8, q: 0.6, at: delay, pan, rev: G.tail * (0.6 + far) });
    // 4) mid-range body grit
    this.nz({ type: 'bandpass', f0: 1400 * j, f1: 600, dur: G.boom * 0.6, vol: v * 0.35, q: 1.1, at: delay, pan, rev: 0.1 });
    // 5) the action: bolt carrier / slide clack right behind the shot (close only)
    if (G.mech && dist < 10) this.metal(G.mech * j, 0.07 * near, 0.04, delay + 0.035, pan);
    // 6) far away: a delayed echo off the terrain
    if (dist > 25) this.nz({ f0: 1200 * air, f1: 300, dur: G.boom * 2.2, vol: v * 0.25, at: delay + 0.18 + Math.random() * 0.1, pan: -pan * 0.5, rev: 0.6 });
  },
  // weapon handling foley: mag out / in, charging handle, bolts, pump, revolver crane, shells, draw
  mech(kind) {
    const r = () => 0.94 + Math.random() * 0.12;
    this._k = 1.9; try { this._mech(kind, r); } finally { this._k = 1; }
  },
  _mech(kind, r) {
    switch (kind) {
      case 'magout': this.metal(1900 * r(), 0.12, 0.05); this.nz({ type: 'bandpass', f0: 900, f1: 500, dur: 0.12, vol: 0.06, at: 0.02, q: 1.4 }); break;
      case 'magin': this.metal(1500 * r(), 0.16, 0.06); this.osc({ f0: 300, f1: 140, dur: 0.06, vol: 0.12, drive: 1.5 }); this.metal(3200 * r(), 0.07, 0.03, 0.045); break;
      case 'rack': this.metal(2600 * r(), 0.12, 0.05); this.nz({ type: 'bandpass', f0: 3000, f1: 1800, dur: 0.07, vol: 0.06, q: 2 }); this.metal(2100 * r(), 0.16, 0.06, 0.09); this.osc({ f0: 220, f1: 110, dur: 0.05, vol: 0.1, at: 0.09, drive: 1.5 }); break;
      case 'boltup': this.metal(2300 * r(), 0.1, 0.04); this.nz({ type: 'bandpass', f0: 2600, f1: 1400, dur: 0.1, vol: 0.05, q: 2, at: 0.02 }); break;
      case 'boltback': this.metal(1800 * r(), 0.14, 0.06); this.nz({ type: 'bandpass', f0: 1900, f1: 3200, dur: 0.12, vol: 0.06, q: 1.6 }); this.metal(2400 * r(), 0.12, 0.05, 0.13); break;
      case 'pumpback': this.nz({ type: 'bandpass', f0: 1600, f1: 900, dur: 0.1, vol: 0.12, q: 1.2 }); this.metal(1300 * r(), 0.14, 0.06); break;
      case 'pumpfwd': this.nz({ type: 'bandpass', f0: 900, f1: 1700, dur: 0.08, vol: 0.1, q: 1.2 }); this.metal(1700 * r(), 0.18, 0.07, 0.05); this.osc({ f0: 180, f1: 90, dur: 0.06, vol: 0.12, at: 0.05, drive: 1.6 }); break;
      case 'shell': this.nz({ type: 'bandpass', f0: 1200, f1: 700, dur: 0.06, vol: 0.08, q: 1.4 }); this.metal(2200 * r(), 0.1, 0.05, 0.03); break;
      case 'crane': this.metal(2800 * r(), 0.11, 0.08); break;
      case 'eject': for (let i = 0; i < 4; i++) this.metal((3600 + Math.random() * 800) * r(), 0.05, 0.12, 0.25 + i * 0.05 + Math.random() * 0.03); this.nz({ type: 'bandpass', f0: 2400, dur: 0.08, vol: 0.06, q: 1.5 }); break;
      case 'load': this.metal(2000 * r(), 0.1, 0.05); this.nz({ type: 'bandpass', f0: 1500, f1: 900, dur: 0.08, vol: 0.05, q: 1.4, at: 0.02 }); break;
      case 'close': this.metal(2400 * r(), 0.18, 0.08); this.osc({ f0: 260, f1: 130, dur: 0.05, vol: 0.1, drive: 1.5 }); break;
      case 'grab': this.nz({ type: 'bandpass', f0: 700, f1: 1200, dur: 0.14, vol: 0.06, q: 0.8 }); this.metal(1600 * r(), 0.05, 0.04, 0.06); break;
      case 'draw': this.nz({ type: 'bandpass', f0: 600, f1: 1400, dur: 0.16, vol: 0.06, q: 0.7 }); this.metal(2000 * r(), 0.08, 0.05, 0.12); break;
      default: this.metal(2000 * r(), 0.1, 0.05);
    }
  },
  reload() { this.mech('magin'); },
  // footsteps: heel thud + gritty scuff, alternating feet, quieter crouched, rhythm from the game
  step(speed, crouch) { const v = Math.min(0.2, 0.06 + (speed || 5) * 0.018) * (crouch ? 0.45 : 1), r = 0.9 + Math.random() * 0.2;
    this._foot = -(this._foot || 0.25);
    this.osc({ f0: 110 * r, f1: 60, dur: 0.06, vol: v * 1.3, drive: 1.6, pan: this._foot * 0.2 });
    this.nz({ type: 'bandpass', f0: 1700 * r, f1: 900, dur: 0.07, vol: v * 0.7, q: 0.8, rate: 0.75, at: 0.01, pan: this._foot * 0.2 }); },
  // Hits: a tight, dry "tick" plus a meaty low thud (body); shields crack like a ceramic plate; headshots add a hard
  // helmet "tink". Short and clean so rapid fire doesn't smear.
  hit(head, shield) {
    this._k = 1.7; try { this._hit(head, shield); } finally { this._k = 1; }
  },
  _hit(head, shield) {
    this.nz({ type: 'bandpass', f0: 3400, f1: 2400, dur: 0.035, vol: 0.2, q: 1.6 });
    this.osc({ f0: 240, f1: 90, dur: 0.07, vol: 0.2, drive: 2 });
    if (shield) this.nz({ type: 'highpass', f0: 4500, dur: 0.06, vol: 0.1, at: 0.005 });
    if (head) this.metal(3100, 0.2, 0.18, 0.004);
  },
  // Kills: a deep body drop + a single bright confirm ping (higher on a streak, a doubled ping on a headshot)
  kill(head, streak) {
    const st = Math.pow(1.06, Math.min((streak || 1) - 1, 6));
    this.osc({ f0: 160, f1: 40, dur: 0.35, vol: 0.5, drive: 2.5, rev: 0.15 });
    this.nz({ f0: 1800, f1: 200, dur: 0.22, vol: 0.18, rev: 0.2 });
    this.osc({ f0: 1760 * st, f1: 1750 * st, dur: 0.22, vol: 0.09, type: 'triangle', at: 0.03, rev: 0.25 });
    this.osc({ f0: 3520 * st, f1: 3500 * st, dur: 0.14, vol: 0.03, at: 0.03, rev: 0.25 });
    if (head) this.osc({ f0: 2637 * st, f1: 2630 * st, dur: 0.2, vol: 0.07, type: 'triangle', at: 0.1, rev: 0.25 });
  },
  // victory fanfare: a rising arpeggio into a bright held chord with a shimmer on top
  victory() {
    const N = [523.25, 659.25, 783.99, 1046.5];
    N.forEach((f, i) => setTimeout(() => { this.tone(f, f, 0.22, 0.2, 'triangle'); this.tone(f * 2, f * 2, 0.14, 0.06, 'sine'); }, i * 110));
    setTimeout(() => { for (const f of [523.25, 659.25, 783.99, 1046.5]) this.tone(f, f * 1.003, 1.4, 0.11, 'triangle');
      this.tone(2093, 2100, 1.2, 0.05, 'sine'); this.tone(130.8, 65.4, 0.6, 0.35, 'sine'); this.burst(6000, 1.5, 0.8, 0.06, 0, 'bandpass'); }, 470);
    setTimeout(() => { this.tone(1568, 1568, 0.3, 0.08, 'sine'); this.tone(2093, 2093, 0.5, 0.07, 'sine'); }, 1150);
  },
  // freeze frame: a deep impact boom + a high suspended ring
  freeze() { this.tone(90, 30, 0.9, 0.5, 'sine'); this.burst(600, 0.7, 0.5, 0.3); this.tone(2637, 2637, 1.0, 0.07, 'sine'); this.tone(3951, 3950, 0.8, 0.04, 'sine'); },
  // ---- zombies
  zGroan(d) { const v = 0.12 / (1 + d / 6); this.tone(110 + Math.random() * 40, 70 + Math.random() * 20, 0.7, v, 'sawtooth'); this.burst(300, 2, 0.5, v * 0.6, 0, 'bandpass'); },
  zSwipe() { this.burst(1200, 1, 0.12, 0.2, 0, 'bandpass'); this.tone(160, 60, 0.12, 0.2, 'sine'); },
  zRound(start) { const N = start ? [196, 233, 196, 147] : [147, 175, 220, 294]; N.forEach((f, i) => setTimeout(() => { this.tone(f, f * 0.995, 0.9, 0.12, 'triangle'); this.tone(f / 2, f / 2, 1.1, 0.08, 'sine'); }, i * 260)); },
  zRoar() { this.tone(90, 40, 1.4, 0.45, 'sawtooth'); this.burst(200, 0.8, 1.2, 0.35); this.tone(140, 70, 1.2, 0.2, 'square'); },
  zScream() { this.tone(1400, 2200, 1.0, 0.18, 'sawtooth'); this.tone(1800, 900, 1.1, 0.12, 'sine'); this.burst(4000, 1.2, 0.9, 0.15, 0, 'bandpass'); },
  zBlink() { this.tone(900, 200, 0.35, 0.15, 'sine'); this.burst(2500, 1.5, 0.3, 0.1, 0, 'bandpass'); },
  zFire() { this.burst(800, 0.7, 0.4, 0.2); this.tone(220, 120, 0.3, 0.12, 'sawtooth'); },
  zBoom(d) { const v = 0.4 / (1 + (d || 0) / 10); this.burst(500, 0.8, 0.6, v); this.tone(80, 40, 0.5, v, 'sine'); },
  zCrows() { for (let i = 0; i < 6; i++) setTimeout(() => this.tone(1100 + Math.random() * 300, 700, 0.18, 0.1, 'sawtooth'), i * 120); },
  zThunder() { this.burst(120, 0.5, 2.2, 0.35); this.burst(60, 0.4, 2.8, 0.25); },
  zBuy() { this.tone(1046, 1046, 0.08, 0.14, 'square'); setTimeout(() => this.tone(1568, 1568, 0.16, 0.14, 'square'), 90); setTimeout(() => this.tone(2093, 2093, 0.2, 0.1, 'triangle'), 180); },
  zPower() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.14, 0.12, 'triangle'), i * 70)); },
  zDoor() { this.burst(300, 0.8, 0.6, 0.3); this.tone(120, 70, 0.5, 0.25, 'sawtooth'); },
  zBox() { [392, 523, 659, 523, 784].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.3, 0.1, 'triangle'), i * 180)); },
  zTeddy() { this.tone(330, 160, 0.9, 0.18, 'sine'); setTimeout(() => this.tone(160, 80, 0.9, 0.18, 'sine'), 500); },
  zPap() { this.tone(110, 440, 1.6, 0.25, 'sawtooth'); this.burst(3000, 1.2, 1.4, 0.12, 0, 'bandpass'); setTimeout(() => { this.tone(880, 880, 0.4, 0.15, 'triangle'); this.tone(1320, 1320, 0.6, 0.1, 'sine'); }, 1500); },
  zBell() { for (let i = 0; i < 3; i++) setTimeout(() => { this.tone(392, 390, 2.2, 0.25, 'sine'); this.tone(784, 780, 1.6, 0.1, 'sine'); this.tone(1176, 1170, 1.0, 0.05, 'sine'); }, i * 900); },
  // firework pop (louder close up)
  pop(v) { this.burst(1400 + Math.random() * 1200, 0.9, 0.25, (v || 0.3) * 0.6); this.tone(220 + Math.random() * 80, 60, 0.3, (v || 0.3) * 0.5, 'sine'); setTimeout(() => this.burst(7000, 1.5, 0.4, (v || 0.3) * 0.18, 0, 'bandpass'), 90); },
  hurt() { this.osc({ f0: 140, f1: 55, dur: 0.16, vol: 0.4, drive: 2.5 }); this.nz({ f0: 900, f1: 200, dur: 0.18, vol: 0.2 }); this.nz({ type: 'highpass', f0: 3000, dur: 0.05, vol: 0.06 });
  },
  pickup() { this.nz({ type: 'bandpass', f0: 700, f1: 1500, dur: 0.12, vol: 0.08, q: 0.8 }); this.metal(2400 + Math.random() * 400, 0.06, 0.05, 0.05);
  },
  click() { this.tone(1800, 1700, 0.03, 0.08, 'square'); },
  jump() { this.nz({ type: 'bandpass', f0: 500, f1: 900, dur: 0.1, vol: 0.06, q: 0.8 }); this.nz({ type: 'bandpass', f0: 2500, dur: 0.05, vol: 0.03, q: 1 });
  },
  land(speed) { const v = Math.min(0.5, (speed || 4) * 0.035); this.osc({ f0: 120, f1: 50, dur: 0.12, vol: v, drive: 2 }); this.nz({ f0: 1200, f1: 250, dur: 0.16, vol: v * 0.6 }); this.nz({ type: 'bandpass', f0: 2600, dur: 0.12, vol: v * 0.25, q: 0.7, rate: 0.7 });
  },
  slide() { this.nz({ type: 'bandpass', f0: 1800, f1: 700, dur: 0.5, vol: 0.12, q: 0.7, attack: 0.03, rate: 0.6 }); this.nz({ f0: 500, f1: 200, dur: 0.4, vol: 0.08, attack: 0.02 });
  },
  wallrun() { this.burst(1200, 0.5, 0.25, 0.06, 0, 'bandpass'); },
  zone() { this.tone(220, 180, 0.6, 0.18, 'sawtooth'); },
  tech() { this.tone(700, 1400, 0.12, 0.12, 'triangle'); this.tone(1050, 2100, 0.16, 0.08, 'sine'); },
  chest(dist) { const v = 1 / (1 + dist / 10); this.tone(520, 780, 0.12, 0.18 * v, 'triangle'); this.tone(780, 1170, 0.25, 0.14 * v, 'sine'); },
  grapple() { this.metal(1800, 0.12, 0.05); this.nz({ type: 'bandpass', f0: 1500, f1: 5000, dur: 0.22, vol: 0.08, q: 4 });
  },
  stim() { this.metal(3000, 0.06, 0.04); this.nz({ type: 'highpass', f0: 5000, dur: 0.2, vol: 0.08, at: 0.04 }); this.osc({ f0: 600, f1: 1200, dur: 0.25, vol: 0.05, at: 0.1, rev: 0.3 });
  },
  // Shockwave: deep whoomp + rising zap + airy shimmer
  shockwave(dist) {
    const v = Math.max(0.15, 1 - (dist || 0) / 60);
    this.tone(90, 30, 0.55, 0.6 * v, 'sine'); this.burst(600, 0.7, 0.45, 0.45 * v, 0, 'lowpass');
    this.tone(300, 1800, 0.35, 0.18 * v, 'sawtooth'); this.burst(5000, 2, 0.5, 0.12 * v, 0, 'highpass');
  },
  throwNade() { this.metal(3400, 0.06, 0.04); this.nz({ type: 'bandpass', f0: 600, f1: 2000, dur: 0.18, vol: 0.1, q: 1.2, at: 0.05 });
  },
  pad() { this.tone(200, 900, 0.3, 0.2, 'square'); },
  blast() { this.osc({ f0: 110, f1: 32, dur: 0.6, vol: 0.7, drive: 3, rev: 0.3 }); this.nz({ f0: 4000, f1: 200, sweep: 0.4, dur: 0.7, vol: 0.5, rev: 0.6 }); this.nz({ type: 'highpass', f0: 3000, dur: 0.4, vol: 0.08, at: 0.05, rate: 0.5 });
  },
  swish(hit) { this.nz({ type: 'bandpass', f0: 700, f1: 3200, sweep: 0.55, dur: 0.17, vol: 0.14, q: 1.4, attack: 0.04 }); if (hit) { this.osc({ f0: 200, f1: 70, dur: 0.1, vol: 0.32, drive: 2.5 }); this.nz({ f0: 2200, f1: 400, dur: 0.1, vol: 0.18 }); }
  },
  unsheathe() { this.nz({ type: 'bandpass', f0: 3000, f1: 6500, dur: 0.32, vol: 0.07, q: 3, attack: 0.05 }); this.metal(4200, 0.06, 0.3, 0.28);
  },
  coin() { this.tone(988, 988, 0.08, 0.12, 'square'); setTimeout(() => this.tone(1319, 1319, 0.2, 0.12, 'square'), 80); },
  chute() { this.nz({ f0: 900, f1: 300, dur: 0.7, vol: 0.4, attack: 0.04, rev: 0.15 }); this.nz({ type: 'bandpass', f0: 1600, dur: 0.3, vol: 0.12, q: 0.8, rate: 0.5 });
  },
  reload() { this.tone(500, 300, 0.05, 0.08, 'square'); },
};
