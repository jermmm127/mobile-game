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

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.0;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },

  ok() { return this.ctx && this.ctx.state === 'running' && this.voices < 28; },

  // Generic noise burst through a filter. Used for guns, landings, whooshes.
  burst(freq, q, dur, vol, pan, type) {
    if (!this.ok() || vol < 0.01) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g);
    let out = g;
    if (c.createStereoPanner && pan) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(this.master);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
    this.voices++;
    src.onended = () => { this.voices--; };
  },

  tone(f0, f1, dur, vol, type) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this.voices++;
    o.onended = () => { this.voices--; };
  },

  shot(id, dist, pan) {
    const near = 1 / (1 + dist / 18);
    const v = id === 'sniper' ? 0.9 : id === 'shotgun' ? 0.8 : id === 'rifle' ? 0.55 : id === 'smg' ? 0.38 : 0.45;
    const freq = (id === 'sniper' ? 2600 : id === 'shotgun' ? 1600 : id === 'smg' ? 4200 : 3200) * (0.4 + 0.6 * near);
    const dur = id === 'sniper' ? 0.45 : id === 'shotgun' ? 0.32 : 0.14;
    this.burst(freq, 0.8, dur, v * near, pan);
    if (dist < 8) this.tone(160, 45, dur * 0.8, v * 0.5 * near, 'sine');
  },

  hit(head) { this.tone(head ? 1650 : 980, head ? 1400 : 900, 0.06, head ? 0.22 : 0.14, 'square'); },
  kill() { this.tone(520, 1300, 0.18, 0.2, 'triangle'); },
  hurt() { this.burst(400, 1, 0.18, 0.35); this.tone(110, 60, 0.15, 0.25); },
  pickup() { this.tone(660, 990, 0.09, 0.12, 'sine'); },
  click() { this.tone(1800, 1700, 0.03, 0.08, 'square'); },
  jump() { this.burst(900, 0.7, 0.08, 0.06, 0, 'bandpass'); },
  land(speed) { this.burst(300, 0.9, 0.12, Math.min(0.35, speed * 0.02)); },
  slide() { this.burst(1800, 0.6, 0.35, 0.09, 0, 'bandpass'); },
  wallrun() { this.burst(1200, 0.5, 0.25, 0.06, 0, 'bandpass'); },
  zone() { this.tone(220, 180, 0.6, 0.18, 'sawtooth'); },
  tech() { this.tone(700, 1400, 0.12, 0.12, 'triangle'); this.tone(1050, 2100, 0.16, 0.08, 'sine'); },
  chest(dist) { const v = 1 / (1 + dist / 10); this.tone(520, 780, 0.12, 0.18 * v, 'triangle'); this.tone(780, 1170, 0.25, 0.14 * v, 'sine'); },
  reload() { this.tone(500, 300, 0.05, 0.08, 'square'); },
};
