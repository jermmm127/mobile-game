'use strict';
// =============================================================================
// MODELS — placeholder weapon models built from primitives, plus cosmetic
// skins, charms and tracer colours. Every model faces -Z (barrel forward) with
// the origin at the grip, and exposes userData anchors:
//   muzzle (Object3D), charm (Object3D), flash (Mesh), sight (Object3D, holo only)
// Replace build functions with real assets later; keep the anchors.
// =============================================================================
BR.Models = (function () {
  const cache = { tex: {}, mat: {}, geo: {} };

  // ---------------------------------------------------------------- textures
  function canvasTex(key, draw, size) {
    if (cache.tex[key]) return cache.tex[key];
    const s = size || 256, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    draw(cv.getContext('2d'), s);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return (cache.tex[key] = t);
  }
  const rnd = BR.util.rng(77);
  // Animated textures: fn(tex, t) runs every frame from BR.Models.tick (scrolling lava, shimmering prism...)
  const ANIM_TEX = [];
  const animTex = (tex, fn) => { if (!tex._anim) { tex._anim = fn; ANIM_TEX.push(tex); } return tex; };
  const TEX = {
    jungle: () => canvasTex('jungle', (c, s) => {
      const cols = ['#2f4a1c', '#4f6b2a', '#1d2a12', '#7a8a3a'];
      for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) { c.fillStyle = cols[Math.floor(rnd() * 4)]; c.fillRect(x, y, 8, 8); }
    }),
    holo: () => animTex(canvasTex('holo', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, 0); ['#7af7ff', '#c8a2ff', '#ff9ef0', '#9effc8', '#7af7ff'].forEach((col, i) => g.addColorStop(i / 4, col));
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 4) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(0, y, s, 1); }
    }, 256), (tx, t) => { tx.offset.set(t * 0.08, t * 0.4); }),
    diamond: () => canvasTex('diamond', (c, s) => {
      c.fillStyle = '#cfefff'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) { c.beginPath(); const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 18;
        c.moveTo(x, y - r); c.lineTo(x + r * 0.7, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.7, y); c.closePath();
        const l = 70 + rnd() * 30; c.fillStyle = `hsl(${190 + rnd() * 60},80%,${l}%)`; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke(); }
    }, 256),
    nebula: () => animTex(canvasTex('nebula', (c, s) => {
      c.fillStyle = '#05020f'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) { const x = rnd() * s, y = rnd() * s, r = 20 + rnd() * 60, g = c.createRadialGradient(x, y, 0, x, y, r);
        const hue = [280, 320, 200, 250][i % 4]; g.addColorStop(0, `hsla(${hue},100%,65%,0.55)`); g.addColorStop(1, `hsla(${hue},100%,40%,0)`); c.fillStyle = g; c.fillRect(0, 0, s, s); }
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${rnd()})`; c.fillRect(rnd() * s, rnd() * s, rnd() < 0.1 ? 2 : 1, 1); }
    }, 256), (tx, t) => { tx.offset.set(Math.sin(t * 0.2) * 0.15, t * 0.02); tx.rotation = Math.sin(t * 0.1) * 0.2; }),
    inferno: () => animTex(canvasTex('inferno', (c, s) => {
      const g = c.createLinearGradient(0, s, 0, 0); g.addColorStop(0, '#ffe14d'); g.addColorStop(0.35, '#ff7a00'); g.addColorStop(0.7, '#c4001a'); g.addColorStop(1, '#2a0003');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,${120 + rnd() * 120},0,${0.25 + rnd() * 0.4})`; c.beginPath(); const x = rnd() * s, y = rnd() * s;
        c.moveTo(x, y + 30); c.quadraticCurveTo(x - 12, y + 6, x, y - 20); c.quadraticCurveTo(x + 12, y + 6, x, y + 30); c.fill(); }
    }, 256), (tx, t) => { tx.offset.y = -t * 0.35; tx.offset.x = Math.sin(t * 2) * 0.02; }),
    aurora: () => animTex(canvasTex('aurora', (c, s) => {
      c.fillStyle = '#020a14'; c.fillRect(0, 0, s, s);
      for (let k = 0; k < 6; k++) { c.beginPath(); for (let x = 0; x <= s; x += 4) { const y = s * (0.2 + k * 0.13) + Math.sin(x * 0.04 + k) * 18; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.strokeStyle = k % 2 ? 'rgba(0,255,166,0.8)' : 'rgba(155,92,255,0.75)'; c.lineWidth = 6 + rnd() * 6; c.shadowColor = c.strokeStyle; c.shadowBlur = 14; c.stroke(); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(t * 0.06, Math.sin(t * 0.6) * 0.08); }),
    liquidgold: () => animTex(canvasTex('liquidgold', (c, s) => {
      for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
        const v = Math.sin(x * 0.05 + Math.sin(y * 0.04) * 2) * Math.cos(y * 0.05 + Math.sin(x * 0.03) * 2) * 0.5 + 0.5;
        c.fillStyle = `rgb(${200 + v * 55},${150 + v * 80},${30 + v * 70})`; c.fillRect(x, y, 2, 2); }
    }, 256), (tx, t) => { tx.offset.set(t * 0.05, Math.sin(t * 0.7) * 0.06); }),
    molten: () => animTex(canvasTex('molten', (c, s) => {
      c.fillStyle = '#120806'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) {                         // glowing cracks
        let x = rnd() * s, y = rnd() * s; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; c.lineTo(x, y); }
        c.strokeStyle = rnd() < 0.5 ? '#ff5a00' : '#ffb000'; c.lineWidth = 1.5 + rnd() * 3; c.shadowColor = '#ff3a00'; c.shadowBlur = 8; c.stroke();
      }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(t * 0.02, t * 0.035); }),
    // ---- Season 2 animated textures
    hyperspace: () => animTex(canvasTex('hyperspace', (c, s) => {
      c.fillStyle = '#03030c'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 160; i++) { const y = Math.random() * s, x = Math.random() * s, l = 10 + Math.random() * 60, hue = Math.random() < 0.5 ? 190 : 300;
        const g = c.createLinearGradient(x, 0, x + l, 0); g.addColorStop(0, `hsla(${hue},100%,70%,0)`); g.addColorStop(1, `hsla(${hue},100%,75%,${0.4 + Math.random() * 0.6})`);
        c.fillStyle = g; c.fillRect(x, y, l, 1 + Math.random() * 1.5); }
    }, 256), (tx, t) => { tx.offset.set(-t * 0.45, 0); }),
    acid: () => animTex(canvasTex('acid', (c, s) => {
      c.fillStyle = '#041a06'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) { const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 16;
        const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(200,255,90,0.95)'); g.addColorStop(0.6, 'rgba(60,255,60,0.5)'); g.addColorStop(1, 'rgba(0,80,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    }, 256), (tx, t) => { tx.offset.set(Math.sin(t * 0.5) * 0.05, -t * 0.12); }),
    opal: () => animTex(canvasTex('opal', (c, s) => {
      for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
        const v = Math.sin(x * 0.045 + Math.sin(y * 0.03) * 3) + Math.cos(y * 0.04 + Math.sin(x * 0.02) * 2);
        c.fillStyle = `hsl(${(v * 60 + 200) % 360},70%,${78 + v * 6}%)`; c.fillRect(x, y, 2, 2); }
    }, 256), (tx, t) => { tx.offset.set(t * 0.03, Math.sin(t * 0.4) * 0.05); }),
    voidrift: () => animTex(canvasTex('voidrift', (c, s) => {
      c.fillStyle = '#07020f'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 22; i++) { let x = Math.random() * s, y = Math.random() * s; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 7; k++) { x += (Math.random() - 0.5) * 44; y += (Math.random() - 0.5) * 44; c.lineTo(x, y); }
        c.strokeStyle = Math.random() < 0.5 ? '#b04bff' : '#ff3df2'; c.lineWidth = 1 + Math.random() * 2.5; c.shadowColor = '#9b2cff'; c.shadowBlur = 10; c.stroke(); }
      c.shadowBlur = 0;
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(230,200,255,${Math.random()})`; c.fillRect(Math.random() * s, Math.random() * s, 1.3, 1.3); }
    }, 256), (tx, t) => { tx.offset.set(t * 0.03, -t * 0.02); }),
    prism: () => animTex(canvasTex('prism', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, s);
      ['#ff3df2', '#ffd84a', '#39ff88', '#1de9ff', '#7b2cff', '#ff3df2'].forEach((col, i) => g.addColorStop(i / 5, col));
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * 0.35})`; c.fillRect(rnd() * s, rnd() * s, 3 + rnd() * 20, 1 + rnd() * 2); }
    }, 256), (tx, t) => { tx.offset.set(t * 0.12, t * 0.05); }),
    electric: () => animTex(canvasTex('electric', (c, s) => {
      c.fillStyle = '#060a1a'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 14; i++) {
        let x = rnd() * s, y = 0; c.beginPath(); c.moveTo(x, y);
        while (y < s) { x += (rnd() - 0.5) * 30; y += 8 + rnd() * 14; c.lineTo(x, y); }
        c.strokeStyle = i % 3 ? '#6fc8ff' : '#ffffff'; c.lineWidth = i % 3 ? 1.5 : 1; c.shadowColor = '#3aa0ff'; c.shadowBlur = 10; c.stroke();
      }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.y = Math.floor(t * 12) * 0.137; }),
    hyper: () => canvasTex('hyper', (c, s) => {
      c.fillStyle = '#ff2fa8'; c.fillRect(0, 0, s, s);
      const cols = ['#1de9ff', '#ffe14d', '#7b2cff', '#111111'];
      for (let i = 0; i < 34; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); const x = rnd() * s, y = rnd() * s, r = 4 + rnd() * 16;
        for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, rr = r * (0.6 + rnd() * 0.6); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill();
        c.strokeStyle = '#111'; c.lineWidth = 2; c.stroke(); }
    }, 256),
    scales: () => canvasTex('scales', (c, s) => {
      c.fillStyle = '#0b1f1a'; c.fillRect(0, 0, s, s);
      for (let y = 0; y < s + 16; y += 14) for (let x = (y / 14) % 2 ? 8 : 0; x < s + 16; x += 16) {
        const g = c.createRadialGradient(x, y - 4, 1, x, y, 11); g.addColorStop(0, '#9dffcf'); g.addColorStop(0.5, '#1fa37a'); g.addColorStop(1, '#3b1a7a');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, 9, 0, Math.PI); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke(); }
    }, 256),
    // Pack-a-Punch camo (zombies): swirling violet / teal moon-energy over black, always moving
    pap: () => animTex(canvasTex('pap', (c, s) => {
      c.fillStyle = '#07030f'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 46; i++) { let x = Math.random() * s, y = Math.random() * s; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += Math.cos(k * 0.8 + i) * 18; y += Math.sin(k * 0.6 + i) * 18; c.lineTo(x, y); }
        c.strokeStyle = i % 3 ? 'rgba(178,107,255,0.85)' : 'rgba(80,240,220,0.8)'; c.lineWidth = 1.5 + Math.random() * 2; c.shadowColor = c.strokeStyle; c.shadowBlur = 8; c.stroke(); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(t * 0.12, Math.sin(t * 0.7) * 0.08); }),
    // knife-collection camos (v1.7.5)
    sabertooth: () => canvasTex('sabertooth', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#ffb000'); g.addColorStop(0.5, '#ff7a00'); g.addColorStop(1, '#ffcc33'); c.fillStyle = g; c.fillRect(0, 0, s, s);
      c.fillStyle = '#140a02';
      for (let i = 0; i < 9; i++) { const y = i * s / 9 + 4; c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= s; x += 8) c.lineTo(x, y + Math.sin(x * 0.09 + i * 1.7) * 5 + (x % 16 ? 3 : -3));
        for (let x = s; x >= 0; x -= 8) c.lineTo(x, y + 4 + Math.sin(x * 0.07 + i) * 2);
        c.closePath(); c.fill(); }
    }, 256),
    ultraviolet: () => canvasTex('ultraviolet', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#1a0630'); g.addColorStop(0.5, '#4a1a7a'); g.addColorStop(1, '#12041f'); c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) { c.fillStyle = `rgba(190,140,255,${0.04 + 0.05 * Math.sin(y * 0.3)})`; c.fillRect(0, y, s, 1); }
    }, 256),
    emerald: () => animTex(canvasTex('emerald', (c, s) => {
      for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
        const v = Math.sin(x * 0.08 + Math.sin(y * 0.06) * 2.5) * 0.5 + Math.cos(y * 0.05 + x * 0.02) * 0.5;
        c.fillStyle = `hsl(${148 + v * 18},${85 + v * 10}%,${22 + (v + 1) * 18}%)`; c.fillRect(x, y, 2, 2); }
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(200,255,225,${Math.random() * 0.9})`; c.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); }
    }, 256), (tx, t) => { tx.offset.set(Math.sin(t * 0.35) * 0.06, t * 0.04); }),
    tidewater: () => animTex(canvasTex('tidewater', (c, s) => {
      c.fillStyle = '#04122a'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 14; i++) { c.beginPath(); for (let x = 0; x <= s; x += 4) { const y = i * s / 14 + Math.sin(x * 0.07 + i) * 6; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.strokeStyle = i % 3 ? 'rgba(80,190,255,0.75)' : 'rgba(220,250,255,0.95)'; c.lineWidth = i % 3 ? 2.5 : 1.2; c.stroke(); }
    }, 256), (tx, t) => { tx.offset.set(t * 0.08, Math.sin(t * 0.6) * 0.03); }),
    damascus: () => canvasTex('damascus', (c, s) => {
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x += 2) {
        const v = Math.sin((x * 0.09) + Math.sin(y * 0.05) * 3 + Math.sin(x * 0.03 + y * 0.02) * 2) * 0.5 + 0.5;
        const l = 70 + v * 120; c.fillStyle = `rgb(${l},${l + 4},${l + 10})`; c.fillRect(x, y, 2, 1); }
    }, 256),
    circuit: () => animTex(canvasTex('circuit', (c, s) => {
      c.fillStyle = '#05140f'; c.fillRect(0, 0, s, s);
      c.strokeStyle = '#2bffb0'; c.lineWidth = 2; c.shadowColor = '#2bffb0'; c.shadowBlur = 6;
      for (let i = 0; i < 30; i++) { let x = Math.round(rnd() * 16) * 16, y = Math.round(rnd() * 16) * 16; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 4; k++) { if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * 32; else y += (rnd() < 0.5 ? -1 : 1) * 32; c.lineTo(x, y); } c.stroke();
        c.fillStyle = '#b6ffe6'; c.fillRect(x - 3, y - 3, 6, 6); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.x = t * 0.05; }),
    candy: () => canvasTex('candy', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#ff9ad5'); g.addColorStop(0.5, '#c8b6ff'); g.addColorStop(1, '#8fe3ff');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.3})`; c.beginPath(); c.arc(rnd() * s, rnd() * s, 6 + rnd() * 18, 0, 7); c.fill(); }
    }, 256),
    bloodmoon: () => canvasTex('bloodmoon', (c, s) => {
      c.fillStyle = '#2a0005'; c.fillRect(0, 0, s, s);
      c.strokeStyle = '#ff1f3d'; c.lineWidth = 1.4; c.shadowColor = '#ff1f3d'; c.shadowBlur = 6;
      for (let r = 12; r < s; r += 18) { c.beginPath(); c.arc(s / 2, s / 2, r, 0, 7); c.stroke(); }
      for (let a = 0; a < 12; a++) { c.beginPath(); c.moveTo(s / 2, s / 2); c.lineTo(s / 2 + Math.cos(a / 12 * 6.28) * s, s / 2 + Math.sin(a / 12 * 6.28) * s); c.stroke(); }
      c.shadowBlur = 0;
    }, 256),
    carbon: () => canvasTex('carbon', (c, s) => {
      c.fillStyle = '#1b1d21'; c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) {
        c.fillStyle = ((x + y) / 8) % 2 ? '#2a2d33' : '#14161a'; c.fillRect(x, y, 8, 4);
        c.fillStyle = ((x + y) / 8) % 2 ? '#14161a' : '#2a2d33'; c.fillRect(x, y + 4, 8, 4);
      }
    }),
    tiger: () => canvasTex('tiger', (c, s) => {
      c.fillStyle = '#e07a1f'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#1a1209';
      for (let i = 0; i < 9; i++) {
        c.beginPath(); const y = rnd() * s, w = 6 + rnd() * 10;
        c.moveTo(0, y); c.bezierCurveTo(s * 0.3, y - 20, s * 0.6, y + 25, s, y + rnd() * 10 - 5);
        c.lineTo(s, y + w); c.bezierCurveTo(s * 0.6, y + 25 + w * 0.4, s * 0.3, y - 20 + w, 0, y + w); c.fill();
      }
    }),
    arctic: () => canvasTex('arctic', (c, s) => {
      c.fillStyle = '#e9eef2'; c.fillRect(0, 0, s, s);
      const cols = ['#b7c3cc', '#8d9aa5', '#d3dce2'];
      for (let i = 0; i < 40; i++) { c.fillStyle = cols[i % 3]; c.fillRect(rnd() * s, rnd() * s, 8 + rnd() * 26, 6 + rnd() * 18); }
    }),
    neon: () => canvasTex('neon', (c, s) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
      c.strokeStyle = '#2ff3ff'; c.lineWidth = 3;
      for (let i = 0; i <= s; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(s, i); c.stroke(); }
    }),
    crimson: () => canvasTex('crimson', (c, s) => {
      c.fillStyle = '#8f1020'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(20,0,4,${0.2 + rnd() * 0.5})`; c.beginPath(); c.arc(rnd() * s, rnd() * s, 1 + rnd() * 7, 0, 7); c.fill(); }
    }),
    galaxy: () => canvasTex('galaxy', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#1d0b3a'); g.addColorStop(0.5, '#3b1a7a'); g.addColorStop(1, '#0b2a5c');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(255,255,255,${rnd()})`; c.fillRect(rnd() * s, rnd() * s, rnd() < 0.1 ? 2 : 1, 1); }
    }),
    pixel: () => canvasTex('pixel', (c, s) => {
      const cols = ['#ff3d7f', '#ffd23f', '#3fd2ff', '#7a3fff', '#2b2b2b'];
      for (let y = 0; y < s; y += 16) for (let x = 0; x < s; x += 16) { c.fillStyle = cols[Math.floor(rnd() * cols.length)]; c.fillRect(x, y, 16, 16); }
    }),
  };

  // ---- v1.10 GRIND camos: unlocked only by challenges, every one animated
  Object.assign(TEX, {
    // cracked black glass with molten seams that pulse and flow
    g_ember: () => animTex(canvasTex('g_ember', (c, s) => {
      c.fillStyle = '#0a0503'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) { let x = Math.random() * s, y = Math.random() * s; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; c.lineTo(x, y); }
        c.strokeStyle = i % 3 ? '#ff6a00' : '#ffd24a'; c.lineWidth = 1 + Math.random() * 2.5; c.shadowColor = '#ff3a00'; c.shadowBlur = 12; c.stroke(); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(Math.sin(t * 0.4) * 0.05, t * 0.04); }),
    // storm clouds with forks of lightning, rolling sideways
    g_tempest: () => animTex(canvasTex('g_tempest', (c, s) => {
      const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#0a1030'); g.addColorStop(0.5, '#1a2a5a'); g.addColorStop(1, '#070a1a'); c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { const gr = c.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(120,150,220,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.translate(Math.random() * s, Math.random() * s); c.fillStyle = gr; c.fillRect(-30, -30, 60, 60); c.restore(); }
      for (let i = 0; i < 6; i++) { let x = Math.random() * s, y = 0; c.beginPath(); c.moveTo(x, y); while (y < s) { x += (Math.random() - 0.5) * 30; y += 10 + Math.random() * 18; c.lineTo(x, y); }
        c.strokeStyle = '#dff4ff'; c.lineWidth = 1.6; c.shadowColor = '#6fc8ff'; c.shadowBlur = 14; c.stroke(); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(t * 0.07, 0); }),
    // deep-sea bioluminescence: dark water, glowing jellies and drifting particles
    g_abyss: () => animTex(canvasTex('g_abyss', (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.75); g.addColorStop(0, '#04304a'); g.addColorStop(1, '#010810'); c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 18; i++) { const x = Math.random() * s, y = Math.random() * s, r = 4 + Math.random() * 10; c.fillStyle = i % 2 ? 'rgba(80,240,220,0.7)' : 'rgba(160,107,255,0.7)'; c.shadowColor = c.fillStyle; c.shadowBlur = 16; c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.fill();
        c.strokeStyle = c.fillStyle; c.lineWidth = 1; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * r * 0.35, y); c.quadraticCurveTo(x + k * r * 0.5 + 4, y + r * 1.5, x + k * r * 0.3, y + r * 2.6); c.stroke(); } }
      c.shadowBlur = 0; for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(160,255,240,${Math.random() * 0.8})`; c.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2); }
    }, 256), (tx, t) => { tx.offset.set(Math.sin(t * 0.5) * 0.04, -t * 0.05); }),
    // a forge of stars: swirling galaxy arms in gold and violet with bright points
    g_starforge: () => animTex(canvasTex('g_starforge', (c, s) => {
      c.fillStyle = '#05020c'; c.fillRect(0, 0, s, s);
      for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 260; i++) { const k = i / 260, a = arm * 2.09 + k * 5.5, r = k * s * 0.55, x = s / 2 + Math.cos(a) * r + (Math.random() - 0.5) * 14, y = s / 2 + Math.sin(a) * r + (Math.random() - 0.5) * 14;
        c.fillStyle = Math.random() < 0.5 ? `rgba(255,210,74,${0.3 + Math.random() * 0.6})` : `rgba(176,107,255,${0.3 + Math.random() * 0.6})`; c.fillRect(x, y, 1.6, 1.6); }
      for (let i = 0; i < 40; i++) { const x = Math.random() * s, y = Math.random() * s; c.fillStyle = '#fff'; c.shadowColor = '#ffd24a'; c.shadowBlur = 8; c.fillRect(x, y, 2, 2); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.center.set(0.5, 0.5); tx.rotation = t * 0.12; }),
    // afterburner: hot-pink and cyan exhaust streaks racing along the gun
    g_afterburn: () => animTex(canvasTex('g_afterburn', (c, s) => {
      c.fillStyle = '#0a0414'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) { const y = Math.random() * s, l = 30 + Math.random() * 120, x = Math.random() * s, g = c.createLinearGradient(x, 0, x + l, 0);
        const col = i % 3 === 0 ? '69,224,255' : i % 3 === 1 ? '255,94,196' : '255,210,74'; g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},0.9)`); c.fillStyle = g; c.fillRect(x, y, l, 1 + Math.random() * 2.5); }
    }, 256), (tx, t) => { tx.offset.set(-t * 0.45, 0); }),
    // lumen: a crisp neon reticle grid that scans with a sweeping light bar
    g_lumen: () => animTex(canvasTex('g_lumen', (c, s) => {
      c.fillStyle = '#03080c'; c.fillRect(0, 0, s, s);
      c.strokeStyle = 'rgba(69,224,255,0.55)'; c.lineWidth = 1; for (let i = 0; i <= s; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(s, i); c.stroke(); }
      for (let i = 0; i < 10; i++) { const x = Math.random() * s, y = Math.random() * s; c.strokeStyle = '#ff5ec4'; c.lineWidth = 1.5; c.shadowColor = '#ff5ec4'; c.shadowBlur = 8; c.beginPath(); c.arc(x, y, 7, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x + 11, y); c.moveTo(x, y - 11); c.lineTo(x, y + 11); c.stroke(); }
      c.shadowBlur = 0; const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(200,250,255,0.85)'); g.addColorStop(0.58, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
    }, 256), (tx, t) => { tx.offset.set(t * 0.18, 0); }),
    // ascendant: liquid prism chrome; the colours flow and the whole thing shimmers
    g_ascendant: () => animTex(canvasTex('g_ascendant', (c, s) => {
      for (let y = 0; y < s; y++) { const h = (y / s * 360 + Math.sin(y * 0.06) * 40) % 360; c.fillStyle = `hsl(${h},95%,${55 + 15 * Math.sin(y * 0.11)}%)`; c.fillRect(0, y, s, 1); }
      for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(255,255,255,0.7)'; const x = Math.random() * s, y = Math.random() * s; c.fillRect(x, y, 1.5, 1.5); }
      c.globalCompositeOperation = 'overlay'; for (let i = 0; i < 14; i++) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3; c.beginPath(); const y = Math.random() * s; c.moveTo(0, y); c.bezierCurveTo(s * 0.3, y - 40, s * 0.7, y + 40, s, y); c.stroke(); } c.globalCompositeOperation = 'source-over';
    }, 256), (tx, t) => { tx.offset.set(Math.sin(t * 0.3) * 0.2, t * 0.2); }),
    // soul fire for the Reaper's Edge blade
    g_soul: () => animTex(canvasTex('g_soul', (c, s) => {
      c.fillStyle = '#020a06'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 50; i++) { let x = Math.random() * s, y = s; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 8; k++) { x += Math.sin(k + i) * 10; y -= 20 + Math.random() * 14; c.lineTo(x, y); }
        c.strokeStyle = i % 2 ? 'rgba(57,255,136,0.75)' : 'rgba(176,75,255,0.6)'; c.lineWidth = 2 + Math.random() * 3; c.shadowColor = c.strokeStyle; c.shadowBlur = 12; c.stroke(); }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(0, -t * 0.3); }),
  });
  const GRIND_GLOW = { g_ember: 0.95, g_tempest: 0.8, g_abyss: 0.9, g_starforge: 1, g_afterburn: 1, g_lumen: 1, g_ascendant: 0.55, g_soul: 1 };

  // ------------------------------------------------------------------ skins
  const SKINS = {
    default: { name: 'Factory', price: 0, swatch: '#7c838c' },
    carbon:  { name: 'Carbon Weave', price: 150, swatch: '#22252a' },
    arctic:  { name: 'Arctic Camo', price: 200, swatch: '#dfe6eb' },
    tiger:   { name: 'Tiger Stripe', price: 250, swatch: '#e07a1f' },
    crimson: { name: 'Crimson Splatter', price: 300, swatch: '#8f1020' },
    neon:    { name: 'Neon Grid', price: 400, swatch: '#2ff3ff' },
    pixel:   { name: 'Arcade Pixels', price: 450, swatch: '#ff3d7f' },
    galaxy:  { name: 'Galaxy', price: 550, swatch: '#3b1a7a' },
    gold:    { name: 'Solid Gold', price: 800, swatch: '#e8b830' },
    chrome:  { name: 'Chrome', price: 900, swatch: '#e8eef4' },
    damascus:{ name: 'Damascus Steel', price: 700, swatch: 'repeating-linear-gradient(115deg,#6e737a 0 4px,#c4cad2 4px 7px,#8a9098 7px 11px)', rarity: 'Epic' },
    candy:   { name: 'Cotton Candy', price: 700, swatch: 'linear-gradient(135deg,#ff9ad5,#c8b6ff,#8fe3ff)', rarity: 'Epic' },
    scales:  { name: 'Dragonscale', price: 900, swatch: 'radial-gradient(circle at 40% 35%,#9dffcf,#1fa37a 45%,#3b1a7a)', rarity: 'Legendary' },
    hyper:   { name: 'Hyper Beast', price: 950, swatch: 'linear-gradient(135deg,#ff2fa8 0 40%,#1de9ff 40% 60%,#ffe14d 60%)', rarity: 'Legendary' },
    bloodmoon:{ name: 'Blood Moon', price: 1000, swatch: 'radial-gradient(circle,#ff1f3d 0 12%,#2a0005 13% 30%,#ff1f3d 31% 33%,#2a0005 34%)', rarity: 'Legendary' },
    circuit: { name: 'Overclock', price: 1100, swatch: 'linear-gradient(90deg,#05140f 0 30%,#2bffb0 30% 34%,#05140f 34% 70%,#2bffb0 70% 74%,#05140f 74%)', rarity: 'Mythic' },
    electric:{ name: 'Electric Storm', price: 1200, swatch: 'linear-gradient(160deg,#060a1a,#3aa0ff 50%,#060a1a)', rarity: 'Mythic' },
    molten:  { name: 'Molten Core', price: 1300, swatch: 'radial-gradient(circle at 30% 40%,#ffb000,#ff3a00 30%,#120806 70%)', rarity: 'Mythic' },
    prism:   { name: 'Prism', price: 1500, swatch: 'linear-gradient(135deg,#ff3df2,#ffd84a,#39ff88,#1de9ff,#7b2cff)', rarity: 'Mythic' },
    // ---- Release Case exclusives
    jungle:  { name: 'Jungle Pixel', caseOnly: true, rarity: 'Rare', swatch: 'repeating-linear-gradient(90deg,#2f4a1c 0 6px,#4f6b2a 6px 12px,#1d2a12 12px 16px)' },
    holo:    { name: 'Hologram', caseOnly: true, rarity: 'Epic', swatch: 'linear-gradient(90deg,#7af7ff,#c8a2ff,#ff9ef0,#9effc8)' },
    diamond: { name: 'Diamond', caseOnly: true, rarity: 'Legendary', swatch: 'conic-gradient(#cfefff,#9fd8ff,#e6f6ff,#b8c8ff,#cfefff)' },
    nebula:  { name: 'Nebula', caseOnly: true, rarity: 'Legendary', swatch: 'radial-gradient(circle at 30% 40%,#ff6af0,#7b2cff 35%,#05020f 75%)' },
    inferno: { name: 'Inferno', caseOnly: true, rarity: 'Mythic', swatch: 'linear-gradient(0deg,#ffe14d,#ff7a00,#c4001a,#2a0003)' },
    aurora:  { name: 'Aurora Borealis', caseOnly: true, rarity: 'Mythic', swatch: 'linear-gradient(170deg,#020a14,#00ffa6 40%,#9b5cff 70%,#020a14)' },
    liquidgold:{ name: 'Liquid Gold', caseOnly: true, rarity: 'Exotic', swatch: 'radial-gradient(circle at 35% 35%,#fff3b0,#ffcf40 35%,#b8860b 80%)' },
    // Season 2 camos (animated)
    hyperspace: { name: 'Hyperspace', price: 1500, rarity: 'Mythic', swatch: 'linear-gradient(90deg,#03030c,#1de9ff 40%,#03030c 45%,#ff3df2 80%,#03030c)' },
    opal:       { name: 'Opaline', price: 1300, rarity: 'Legendary', swatch: 'linear-gradient(135deg,#d6f0ff,#ffd6f6,#e8ffd6,#d6e0ff)' },
    acid:       { name: 'Acid Bath', caseOnly: true, case: 'nova', rarity: 'Mythic', swatch: 'radial-gradient(circle at 40% 40%,#c8ff5a,#1fdc3c 40%,#041a06 75%)' },
    voidrift:   { name: 'Rift Walker', caseOnly: true, case: 'nova', rarity: 'Exotic', swatch: 'linear-gradient(135deg,#07020f,#b04bff 45%,#07020f 55%,#ff3df2 90%)' },
    // knife collection (v1.7.5): look best on the bayonet blade, work on every gun
    ultraviolet:{ name: 'Ultraviolet', price: 650, rarity: 'Epic', swatch: 'linear-gradient(135deg,#12041f,#4a1a7a 50%,#1a0630)' },
    sabertooth: { name: 'Sabertooth', price: 1100, rarity: 'Legendary', swatch: 'repeating-linear-gradient(170deg,#ff9a00 0 7px,#140a02 7px 10px)' },
    emerald:    { name: 'Emerald Ripple', caseOnly: true, rarity: 'Mythic', swatch: 'linear-gradient(135deg,#043a1e,#1fdc7a 45%,#bfffe0 55%,#043a1e)' },
    tidewater:  { name: 'Riptide', caseOnly: true, case: 'nova', rarity: 'Legendary', swatch: 'repeating-linear-gradient(170deg,#04122a 0 5px,#50beff 5px 7px,#dffaff 7px 8px)' },
    // weapon mastery (kills with any one weapon)
    m_copper:      { name: 'Mastery: Copper', mastery: 10, rarity: 'Rare', swatch: 'linear-gradient(135deg,#6a3418,#e08a4a,#6a3418)' },
    m_chrome:      { name: 'Mastery: Chrome', mastery: 25, rarity: 'Epic', swatch: 'linear-gradient(135deg,#8a96a2,#ffffff,#8a96a2)' },
    m_volt:        { name: 'Mastery: Volt', mastery: 50, rarity: 'Legendary', swatch: 'linear-gradient(135deg,#060a1a,#6fc8ff 45%,#060a1a 55%,#dff4ff)' },
    m_singularity: { name: 'Mastery: Singularity', mastery: 100, rarity: 'Mythic', swatch: 'radial-gradient(circle,#ff3df2,#b04bff 30%,#07020f 70%)' },
    // ---- v1.10 GRIND camos (challenges only, all animated). grind: { stat, n, label } (see Profile.addGrind)
    g_ember:     { name: 'Emberglass', rarity: 'Epic', grind: { stat: 'heads', n: 150, label: '150 headshot kills' }, swatch: 'linear-gradient(135deg,#0a0503 0 30%,#ff6a00 31% 34%,#0a0503 35% 62%,#ffd24a 63% 65%,#0a0503 66%)' },
    g_tempest:   { name: 'Tempest', rarity: 'Legendary', grind: { stat: 'kills', n: 400, label: '400 kills in any mode' }, swatch: 'linear-gradient(160deg,#0a1030,#1a2a5a 45%,#dff4ff 50%,#1a2a5a 55%,#070a1a)' },
    g_abyss:     { name: 'Abyssal', rarity: 'Legendary', grind: { stat: 'zround', n: 20, label: 'Reach round 20 in Zombies' }, swatch: 'radial-gradient(circle at 40% 40%,#50f0dc,#04304a 40%,#a06bff 70%,#010810)' },
    g_starforge: { name: 'Starforge', rarity: 'Mythic', grind: { stat: 'wins', n: 10, label: 'Win 10 Battle Royale / Resurgence matches' }, swatch: 'conic-gradient(from 30deg,#05020c,#ffd24a,#05020c,#b06bff,#05020c)' },
    g_afterburn: { name: 'Afterburn', rarity: 'Mythic', grind: { stat: 'odwin', n: 1, label: 'Defeat the Overlord in Overdrive' }, swatch: 'linear-gradient(90deg,#0a0414,#45e0ff 30%,#0a0414 40%,#ff5ec4 70%,#ffd24a)' },
    g_lumen:     { name: 'Lumen', rarity: 'Legendary', grind: { stat: 'aimtotal', n: 50000, label: 'Score 50,000 total in the Aim Trainer' }, swatch: 'repeating-linear-gradient(90deg,#03080c 0 7px,#45e0ff 7px 8px),#03080c' },
    g_ascendant: { name: 'Ascendant', rarity: 'Exotic', grind: { stat: 'meta', n: 6, label: 'Unlock all 6 other grind camos' }, swatch: 'linear-gradient(135deg,#ff3df2,#ffd84a,#39ff88,#1de9ff,#7b2cff,#ff3df2)' },
  };
  const TRACERS = {
    signature: { name: 'Blueprint Signature', price: 0, color: 0xffe9a8, signature: true },
    default: { name: 'Standard', price: 0, color: 0xffe9a8 },
    red:     { name: 'Hot Red', price: 100, color: 0xff1f3d },
    green:   { name: 'Toxic Green', price: 120, color: 0x39ff14 },
    cyan:    { name: 'Ion Blue', price: 150, color: 0x00e5ff },
    orange:  { name: 'Blaze', price: 150, color: 0xff7b00 },
    pink:    { name: 'Hyper Pink', price: 200, color: 0xff2bd6 },
    purple:  { name: 'Void Purple', price: 200, color: 0xb026ff },
    gold:    { name: 'Gold', price: 300, color: 0xffcc00 },
    rainbow: { name: 'Rainbow', price: 500, color: -1 },
    // Styled tracers: helix (twin spiral strands), spark (sparkler trail), lightning (jagged bolt), dual (two-tone glow)
    solar:   { name: 'Solar Flare', price: 600, color: 0xffd24a, color2: 0xff4a00, style: 'dual', rarity: 'Epic' },
    venom:   { name: 'Toxic Venom', price: 600, color: 0x39ff14, color2: 0xb026ff, style: 'dual', rarity: 'Epic' },
    plasma:  { name: 'Plasma Helix', price: 750, color: 0x00e5ff, color2: 0xff2bd6, style: 'helix', rarity: 'Legendary' },
    dragon:  { name: "Dragon's Breath", price: 800, color: 0xffd24a, color2: 0xff3a1f, style: 'spark', rarity: 'Legendary' },
    stardust:{ name: 'Stardust', price: 800, color: 0xc9a8ff, color2: 0xffffff, style: 'spark', rarity: 'Legendary' },
    thunder: { name: 'Thunderstrike', price: 900, color: 0xdff4ff, color2: 0x5a8bff, style: 'lightning', rarity: 'Legendary' },
    voidbolt:{ name: 'Void Bolt', price: 950, color: 0xff5cf0, color2: 0x7b2cff, style: 'lightning', rarity: 'Mythic' },
    prism:   { name: 'Prism Helix', price: 1200, color: -1, color2: -1, style: 'helix', rarity: 'Mythic' },
    // ---- Release Case exclusives (comet: blazing head + ember tail, rings: energy plates along the shot)
    icecomet:  { name: 'Ice Comet', caseOnly: true, rarity: 'Rare', color: 0xdff8ff, color2: 0x6fc8ff, style: 'comet' },
    neonrings: { name: 'Neon Rings', caseOnly: true, rarity: 'Epic', color: 0xff2fa8, color2: 0x1de9ff, style: 'rings' },
    supernova: { name: 'Supernova', caseOnly: true, rarity: 'Legendary', color: 0xffffff, color2: 0xffc93a, style: 'comet' },
    blackhole: { name: 'Event Horizon', caseOnly: true, rarity: 'Legendary', color: 0xb48cff, color2: 0x2a0a4a, style: 'rings' },
    rbcomet:   { name: 'Rainbow Comet', caseOnly: true, rarity: 'Mythic', color: -1, color2: -1, style: 'comet' },
    // Season 2 (Nova Case)
    novaflare: { name: 'Nova Flare', caseOnly: true, case: 'nova', rarity: 'Legendary', color: 0xffffff, color2: 0xff3df2, style: 'comet' },
    acidhelix: { name: 'Acid Helix', caseOnly: true, case: 'nova', rarity: 'Legendary', color: 0xc8ff5a, color2: 0x1fdc3c, style: 'helix' },
    phoenix:   { name: 'Phoenix', caseOnly: true, rarity: 'Exotic', color: 0xffe14d, color2: 0xff3a00, style: 'phoenix' },
    // v1.32 Common / Uncommon
    white:     { name: 'Clean White', price: 80, rarity: 'Common', color: 0xf2f4f6 },
    lime:      { name: 'Lime', price: 80, rarity: 'Common', color: 0xb6ff3a },
    amber:     { name: 'Amber', price: 90, rarity: 'Common', color: 0xffb02e },
    mint:      { name: 'Mint Duo', price: 180, rarity: 'Uncommon', color: 0x7dffcf, color2: 0xffffff, style: 'dual' },
    sunset:    { name: 'Sunset Duo', price: 200, rarity: 'Uncommon', color: 0xff7a3a, color2: 0xff3df2, style: 'dual' },
    smoke:     { name: 'Gunsmoke', caseOnly: true, case: 'street', rarity: 'Common', color: 0xb0b6be },
    cherry:    { name: 'Cherry Cola', caseOnly: true, case: 'street', rarity: 'Uncommon', color: 0xff2f55, color2: 0x5a0a14, style: 'dual' },
    graffiti:  { name: 'Graffiti Rings', caseOnly: true, case: 'street', rarity: 'Epic', color: 0xffe14d, color2: 0xff3d7f, style: 'rings' },
  };
  const CHARMS = {
    none:    { name: 'None', price: 0 },
    dice:    { name: 'Lucky Die', price: 120 },
    coin:    { name: 'Gold Coin', price: 150 },
    skull:   { name: 'Skull', price: 220 },
    star:    { name: 'Star', price: 260 },
    crystal: { name: 'Power Crystal', price: 350 },
    cube:    { name: 'Puzzle Cube', price: 400 },
  };

  // [reflectivity, shininess] per camo: metals mirror-like, glossy finishes clear-coated, matte camos satin
  const SKIN_FINISH = {
    gold: [0.5, 110], chrome: [0.7, 160], m_chrome: [0.7, 170], m_copper: [0.45, 100], liquidgold: [0.45, 160], diamond: [0.55, 200], damascus: [0.4, 130],
    holo: [0.3, 150], candy: [0.22, 110], opal: [0.3, 170], prism: [0.28, 150], scales: [0.25, 120], hyper: [0.15, 90], galaxy: [0.18, 100], nebula: [0.18, 100],
    pap: [0.3, 150], sabertooth: [0.25, 120], ultraviolet: [0.2, 110], emerald: [0.3, 160], tidewater: [0.25, 140], hyperspace: [0.2, 90], voidrift: [0.2, 100], acid: [0.15, 80],
    g_ember: [0.2, 120], g_tempest: [0.18, 100], g_abyss: [0.22, 130], g_starforge: [0.25, 140], g_afterburn: [0.15, 90], g_lumen: [0.15, 90], g_ascendant: [0.55, 200],
    bloodmoon: [0.12, 70], circuit: [0.12, 70], electric: [0.12, 70], molten: [0.1, 60], inferno: [0.1, 60], aurora: [0.15, 80], m_volt: [0.15, 80], m_singularity: [0.25, 120],
    carbon: [0.12, 70], arctic: [0.05, 30], tiger: [0.06, 34], crimson: [0.08, 40], pixel: [0.06, 34], jungle: [0.04, 26], neon: [0.1, 60],
  };
  // ---- v1.32 COMMON / UNCOMMON paint camos: simple, honest finishes (solid paint, two-tone, stripes, woodland, digital,
  // splatter, fade, tiger) drawn procedurally with light wear. [id, name, rarity, pattern, colours, price | 'street']
  const hexc = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
  function paintTex(id, pat, cols) {
    return canvasTex('paint-' + id, (c, S) => {
      const R = BR.util.rng(hsh2(id)), C = cols.map(hexc);
      c.fillStyle = C[0]; c.fillRect(0, 0, S, S);
      const blob = (x, y, r, fill) => { const n = 11, pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = r * (0.55 + R() * 0.6); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * (0.6 + R() * 0.5)]); }
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { c.save(); c.translate(x + ox, y + oy); c.beginPath();
          for (let i = 0; i <= n; i++) { const a = pts[i % n], b = pts[(i + 1) % n]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; i ? c.quadraticCurveTo(a[0], a[1], mx, my) : c.moveTo(mx, my); }
          c.closePath(); c.fillStyle = fill; c.fill(); c.restore(); } };
      if (pat === 'woodland') { for (let k = 1; k < C.length; k++) for (let i = 0; i < 14; i++) blob(R() * S, R() * S, 22 + R() * 34 - k * 4, C[k]); }
      else if (pat === 'splatter') { for (let k = 1; k < C.length; k++) for (let i = 0; i < 26; i++) { blob(R() * S, R() * S, 4 + R() * 16, C[k]); } }
      else if (pat === 'digital') { const q = 8; for (let k = 1; k < C.length; k++) for (let i = 0; i < 70; i++) { const x = Math.floor(R() * S / q) * q, y = Math.floor(R() * S / q) * q, w = (1 + Math.floor(R() * 3)) * q, h = (1 + Math.floor(R() * 2)) * q; c.fillStyle = C[k]; c.fillRect(x, y, w, h); if (x + w > S) c.fillRect(x - S, y, w, h); if (y + h > S) c.fillRect(x, y - S, w, h); } }
      else if (pat === 'stripe') { c.fillStyle = C[1]; c.fillRect(0, S * 0.42, S, S * 0.16); if (C[2]) { c.fillStyle = C[2]; c.fillRect(0, S * 0.46, S, S * 0.04); } }
      else if (pat === 'twotone') { c.fillStyle = C[1]; c.fillRect(0, S / 2, S, S / 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, S / 2 - 2, S, 3); }
      else if (pat === 'fade') { const g = c.createLinearGradient(0, 0, S, S); g.addColorStop(0, C[0]); g.addColorStop(0.5, C[1]); g.addColorStop(1, C[0]); c.fillStyle = g; c.fillRect(0, 0, S, S); }
      else if (pat === 'tiger') { c.fillStyle = C[1]; for (let i = 0; i < 9; i++) { const x = (i + R() * 0.4) / 9 * S; c.beginPath(); c.moveTo(x, 0); for (let y = 0; y <= S; y += 16) c.lineTo(x + Math.sin(y * 0.05 + i) * 10 + (R() - 0.5) * 6, y); for (let y = S; y >= 0; y -= 16) c.lineTo(x + 6 + Math.sin(y * 0.05 + i) * 10 + (R() - 0.5) * 6, y); c.closePath(); c.fill(); } }
      else if (pat === 'rust') { for (let i = 0; i < 60; i++) { const x = R() * S, y = R() * S, r = 6 + R() * 26, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, R() < 0.5 ? C[1] : C[2] || C[1]); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); } }
      // wear: grain, a few scuffs and chipped edges (lighter than the base colour)
      for (let i = 0; i < 1400; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; c.fillRect(R() * S, R() * S, 1, 1); }
      c.lineCap = 'round'; for (let i = 0; i < 26; i++) { const x = R() * S, y = R() * S, a = R() * Math.PI, l = 3 + R() * 10; c.strokeStyle = 'rgba(255,255,255,' + (0.06 + R() * 0.08) + ')'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    }, 256);
  }
  const hsh2 = k => { let h = 2166136261; for (const ch of k) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const PAINT_SWATCH = (pat, cols) => { const C = cols.map(hexc); return pat === 'solid' ? C[0] : pat === 'fade' ? `linear-gradient(135deg,${C[0]},${C[1]},${C[0]})` : pat === 'stripe' ? `linear-gradient(180deg,${C[0]} 0 42%,${C[1]} 42% 58%,${C[0]} 58%)`
    : pat === 'twotone' ? `linear-gradient(180deg,${C[0]} 0 50%,${C[1]} 50%)` : pat === 'tiger' ? `repeating-linear-gradient(100deg,${C[0]} 0 8px,${C[1]} 8px 11px)` : pat === 'digital' ? `repeating-linear-gradient(90deg,${C.join(' 0 5px,')} 0 5px)`.replace(/ 0 5px\)$/, ')')
    : `radial-gradient(circle at 30% 35%,${C[1]} 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,${C[2] || C[1]} 0 16%,transparent 17%),${C[0]}`; };
  const PAINTS = [
    // Common: shop
    ['c_olive', 'Olive Drab', 'Common', 'solid', [0x4a5530], 100], ['c_tan', 'Desert Tan', 'Common', 'solid', [0xb59a6a], 100], ['c_slate', 'Slate', 'Common', 'solid', [0x56606b], 100],
    ['c_ghost', 'Ghost White', 'Common', 'solid', [0xd6dadd], 120], ['c_navy', 'Navy Blue', 'Common', 'solid', [0x24324d], 120], ['c_brick', 'Brick Red', 'Common', 'solid', [0x7a2e22], 120],
    // Uncommon: shop
    ['u_woodland', 'Woodland', 'Uncommon', 'woodland', [0x4f5a34, 0x2c3420, 0x6e6a44, 0x1e1a14], 260], ['u_urban', 'Urban Digital', 'Uncommon', 'digital', [0x7a828b, 0x4b525a, 0xb3bac1, 0x2a2e33], 280],
    ['u_redline', 'Redline', 'Uncommon', 'stripe', [0x1c1e22, 0xc8102e, 0xff5a5a], 300], ['u_cobalt', 'Cobalt Fade', 'Uncommon', 'fade', [0x0f1f4a, 0x2f7bff], 300],
    ['u_sandstorm', 'Sandstorm', 'Uncommon', 'woodland', [0xc9b083, 0xa48858, 0xe2d2a8, 0x7d6442], 280], ['u_twotone', 'Patrol Two-Tone', 'Uncommon', 'twotone', [0x3d4434, 0x1a1c1e], 260],
    // Street Case (case only)
    ['c_rust', 'Rust Bucket', 'Common', 'rust', [0x5a4a40, 0x9a4a1e, 0x3a2418], 'street'], ['c_concrete', 'Concrete', 'Common', 'splatter', [0x8a8d90, 0x6e7174, 0xa6a9ac], 'street'],
    ['u_splash', 'Paint Splash', 'Uncommon', 'splatter', [0x16181c, 0xff3d7f, 0x1de9ff], 'street'], ['u_hazard', 'Hazard Stripe', 'Uncommon', 'tiger', [0xe6dc1e, 0x161616], 'street'],
    ['r_wildcat', 'Wildcat', 'Rare', 'tiger', [0xff7a00, 0x111111], 'street'], ['r_glacier', 'Glacier Digital', 'Rare', 'digital', [0xdff3ff, 0x8fc8f0, 0x3a7ab0, 0xffffff], 'street'],
  ];
  for (const [id, name, rarity, pat, cols, price] of PAINTS) {
    SKINS[id] = Object.assign({ name, rarity, paint: { pat, cols }, swatch: PAINT_SWATCH(pat, cols) }, price === 'street' ? { caseOnly: true, case: 'street' } : { price });
    if (pat !== 'solid') TEX[id] = () => paintTex(id, pat, cols);
  }
  function skinMaterial(skin, base) {
    const key = skin + '|' + base;
    if (cache.mat[key]) return cache.mat[key];
    let m;
    if (GRIND_GLOW[skin] !== undefined && TEX[skin]) m = new THREE.MeshPhongMaterial({ map: TEX[skin](), emissive: 0xffffff, emissiveMap: TEX[skin](), emissiveIntensity: GRIND_GLOW[skin], specular: 0xffffff, shininess: skin === 'g_ascendant' ? 180 : 90 });
    else if (SKINS[skin] && SKINS[skin].paint) {           // v1.32 paint camos: satin paint over the weapon's own grain
      const P = SKINS[skin].paint; m = P.pat === 'solid' ? new THREE.MeshPhongMaterial({ map: wearTex(P.cols[0], 'gun'), specular: 0x2a2e33, shininess: 18 }) : new THREE.MeshPhongMaterial({ map: TEX[skin](), specular: 0x2a2e33, shininess: 18 });
    }
    else switch (skin) {
      case 'carbon': case 'arctic': case 'tiger': case 'crimson': case 'pixel':
        m = new THREE.MeshLambertMaterial({ map: TEX[skin]() }); break;
      case 'galaxy': m = new THREE.MeshLambertMaterial({ map: TEX.galaxy(), emissive: 0x24104a, emissiveIntensity: 0.6 }); break;
      case 'neon': m = new THREE.MeshLambertMaterial({ color: 0x111418, emissive: 0xffffff, emissiveMap: TEX.neon(), emissiveIntensity: 1 }); break;
      case 'gold': m = new THREE.MeshPhongMaterial({ color: 0xe8b830, specular: 0xfff2b0, shininess: 90, emissive: 0x3a2600 }); break;
      case 'chrome': m = new THREE.MeshPhongMaterial({ color: 0xc9d2da, specular: 0xffffff, shininess: 140, emissive: 0x1a1f24 }); break;
      case 'damascus': m = new THREE.MeshPhongMaterial({ map: TEX.damascus(), specular: 0xffffff, shininess: 120 }); break;
      case 'candy': case 'hyper': m = new THREE.MeshPhongMaterial({ map: TEX[skin](), specular: 0xffffff, shininess: 70 }); break;
      case 'scales': m = new THREE.MeshPhongMaterial({ map: TEX.scales(), specular: 0x9dffcf, shininess: 110, emissive: 0x06201a }); break;
      case 'bloodmoon': case 'circuit': case 'electric': case 'molten':
        m = new THREE.MeshPhongMaterial({ map: TEX[skin](), emissive: 0xffffff, emissiveMap: TEX[skin](), emissiveIntensity: 0.9, specular: 0x666666, shininess: 50 }); break;
      case 'jungle': m = new THREE.MeshLambertMaterial({ map: TEX.jungle() }); break;
      case 'holo': m = new THREE.MeshPhongMaterial({ map: TEX.holo(), emissive: 0xffffff, emissiveMap: TEX.holo(), emissiveIntensity: 0.45, specular: 0xffffff, shininess: 160, transparent: true, opacity: 0.92 }); break;
      case 'diamond': m = new THREE.MeshPhongMaterial({ map: TEX.diamond(), specular: 0xffffff, shininess: 200, emissive: 0x1a3a50 }); break;
      case 'hyperspace': case 'acid': case 'voidrift':
        m = new THREE.MeshPhongMaterial({ map: TEX[skin](), emissive: 0xffffff, emissiveMap: TEX[skin](), emissiveIntensity: 0.95, specular: 0x888888, shininess: 70 }); break;
      case 'sabertooth': m = new THREE.MeshPhongMaterial({ map: TEX.sabertooth(), specular: 0xffe0a0, shininess: 130 }); break;
      case 'ultraviolet': m = new THREE.MeshPhongMaterial({ map: TEX.ultraviolet(), specular: 0xd8b8ff, shininess: 110, emissive: 0x0a0214 }); break;
      case 'emerald': m = new THREE.MeshPhongMaterial({ map: TEX.emerald(), specular: 0xc8ffe0, shininess: 180, emissive: 0xffffff, emissiveMap: TEX.emerald(), emissiveIntensity: 0.25 }); break;
      case 'tidewater': m = new THREE.MeshPhongMaterial({ map: TEX.tidewater(), specular: 0xdff8ff, shininess: 160, emissive: 0xffffff, emissiveMap: TEX.tidewater(), emissiveIntensity: 0.55 }); break;
      case 'pap': m = new THREE.MeshPhongMaterial({ map: TEX.pap(), emissive: 0xffffff, emissiveMap: TEX.pap(), emissiveIntensity: 0.85, specular: 0xd8b8ff, shininess: 140 }); break;
      case 'opal': m = new THREE.MeshPhongMaterial({ map: TEX.opal(), specular: 0xffffff, shininess: 190, emissive: 0x1a1a24 }); break;
      // weapon-mastery camos (unlocked by kills, never sold)
      case 'm_copper': m = new THREE.MeshPhongMaterial({ color: 0xb8693a, specular: 0xffc8a0, shininess: 95, emissive: 0x1a0a04 }); break;
      case 'm_chrome': m = new THREE.MeshPhongMaterial({ color: 0xd8e0e8, specular: 0xffffff, shininess: 170, emissive: 0x1a1f24 }); break;
      case 'm_volt': m = new THREE.MeshPhongMaterial({ map: TEX.electric(), emissive: 0xffffff, emissiveMap: TEX.electric(), emissiveIntensity: 1, specular: 0x888888, shininess: 60 }); break;
      case 'm_singularity': m = new THREE.MeshPhongMaterial({ map: TEX.voidrift(), emissive: 0xffffff, emissiveMap: TEX.voidrift(), emissiveIntensity: 1, specular: 0xffffff, shininess: 120 }); break;
      case 'nebula': case 'inferno': case 'aurora':
        m = new THREE.MeshPhongMaterial({ map: TEX[skin](), emissive: 0xffffff, emissiveMap: TEX[skin](), emissiveIntensity: 0.85, specular: 0x888888, shininess: 60 }); break;
      case 'liquidgold': m = new THREE.MeshPhongMaterial({ map: TEX.liquidgold(), specular: 0xfff4c0, shininess: 180, emissive: 0x4a3000, emissiveMap: TEX.liquidgold(), emissiveIntensity: 0.4 }); break;
      case 'prism': m = new THREE.MeshPhongMaterial({ map: TEX.prism(), emissive: 0xffffff, emissiveMap: TEX.prism(), emissiveIntensity: 0.35, specular: 0xffffff, shininess: 150 }); break;
      default: m = new THREE.MeshPhongMaterial({ map: wearTex(base, 'polymer'), normalMap: NRM.scratch(), normalScale: new THREE.Vector2(0.45, 0.45), specular: 0x3a4048, shininess: 26, specularMap: DETAIL.finish(), envMap: envCube(), reflectivity: 0.05 });
        m.userData.real = true;
    }
    // ---- finish pass (v1.8.3): every camo gets a real surface. Matte camos become satin Phong (soft
    // highlights), glossy ones a clear-coat sheen, metals a mirror-like reflection of the studio env.
    if (skin !== 'default') {
      const F = SKIN_FINISH[skin] || (SKINS[skin] && SKINS[skin].paint ? [0.04, 20] : [0.1, 50]);
      if (m.isMeshLambertMaterial) m = new THREE.MeshPhongMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, specular: 0x3a3f48, shininess: F[1] });
      m.envMap = envCube(); m.reflectivity = F[0]; m.shininess = Math.max(m.shininess || 0, F[1]);
      if (m.specular && F[0] >= 0.3) m.specular.setHex(0xffffff);
    }
    return (cache.mat[key] = m);
  }
  // ---- realism: procedural surface detail (bump) + a small studio environment for reflections
  const DETAIL = {
    // fine speckled grain like a cerakote / parkerized finish
    finish: () => { const t = canvasTex('d-finish', (c, s) => { const im = c.createImageData(s, s); for (let i = 0; i < s * s; i++) { const v = 128 + Math.random() * 26 + (Math.random() < 0.03 ? 30 : 0); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } c.putImageData(im, 0, 0); }, 128); t.repeat.set(1, 1); return t; },
    // brushed metal: long streaks along one axis
    brushed: () => { const t = canvasTex('d-brushed', (c, s) => { c.fillStyle = '#888'; c.fillRect(0, 0, s, s); for (let i = 0; i < 260; i++) { const y = Math.random() * s, l = 20 + Math.random() * 90; c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + Math.random() * 0.12})`; c.fillRect(Math.random() * s, y, l, 1); } }, 128); t.repeat.set(1, 1); return t; },
    // stippled polymer grip texture
    stipple: () => { const t = canvasTex('d-stipple', (c, s) => { c.fillStyle = '#808080'; c.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { const r = 0.6 + Math.random() * 1.3; c.fillStyle = Math.random() < 0.5 ? '#b0b0b0' : '#4a4a4a'; c.beginPath(); c.arc(Math.random() * s, Math.random() * s, r, 0, 7); c.fill(); } }, 128); t.repeat.set(1.5, 1.5); return t; },
  };
  // ---- v1.17 surface detail (the look of a hand-textured model, made procedurally): worn albedo maps
  // (mottling, grime, fine scratches, chips, dust) and real normal maps generated from height fields
  // (scratches, stipple, knurling, brushed grain, fabric weave). Shared by every weapon, knife and glove.
  function normalTex(key, size, drawH, strength) {
    return canvasTex('n-' + key, (c, S) => {
      drawH(c, S);
      const src = c.getImageData(0, 0, S, S).data, out = c.createImageData(S, S), h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
        out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
      }
      c.putImageData(out, 0, 0);
    }, size);
  }
  const NRM = {
    scratch: () => normalTex('scratch', 256, (c, S) => { const R = BR.util.rng(71); c.fillStyle = '#808080'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 2600; i++) { const v = 118 + R() * 20 | 0; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(R() * S, R() * S, 2, 2); }
      c.lineCap = 'round'; for (let i = 0; i < 110; i++) { const x = R() * S, y = R() * S, a = R() * Math.PI, l = 3 + R() * 16; c.strokeStyle = `rgba(60,60,60,${0.25 + R() * 0.35})`; c.lineWidth = R() < 0.8 ? 1 : 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(60,60,60,0.7)'; c.beginPath(); c.arc(R() * S, R() * S, 0.8 + R() * 1.6, 0, 7); c.fill(); } }, 2.4),
    stipple: () => normalTex('stipple', 256, (c, S) => { const R = BR.util.rng(72); c.fillStyle = '#606060'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 5200; i++) { const r = 0.9 + R() * 1.4, g2 = c.createRadialGradient(0, 0, 0, 0, 0, r); const x = R() * S, y = R() * S; c.save(); c.translate(x, y); g2.addColorStop(0, '#e0e0e0'); g2.addColorStop(1, 'rgba(96,96,96,0)'); c.fillStyle = g2; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.restore(); } }, 3.2),
    knurl: () => normalTex('knurl', 128, (c, S) => { const im = c.createImageData(S, S), P = 8;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = ((x + y) / P) % 1, v = ((x - y + S * 4) / P) % 1, h = 1 - Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2, q = h * 255, i = (y * S + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = q; im.data[i + 3] = 255; }
      c.putImageData(im, 0, 0); }, 3.5),
    brushed: () => normalTex('brushed', 256, (c, S) => { const R = BR.util.rng(73); c.fillStyle = '#808080'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 1400; i++) { const v = 100 + R() * 56 | 0; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(R() * S, R() * S, 30 + R() * 140, 1); } }, 1.6),
    weave: () => normalTex('weave', 128, (c, S) => { const im = c.createImageData(S, S), T = 4;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const cx = Math.floor(x / T), cy = Math.floor(y / T), over = (cx + cy) % 2, f = over ? (x % T) / T : (y % T) / T, h = 0.25 + 0.75 * Math.sin(f * Math.PI), q = h * 255, i = (y * S + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = q; im.data[i + 3] = 255; }
      c.putImageData(im, 0, 0); }, 2.2),
  };
  // worn albedo for a base colour: soft mottling, grime, scratches, edge chips, dust
  function wearTex(base, kind) {
    return canvasTex('w-' + kind + '-' + base, (c, S) => {
      const R = BR.util.rng(base % 9973 + kind.length * 31), col = new THREE.Color(base), css = k => { const o = col.clone(); if (k > 0) o.lerp(new THREE.Color(0xffffff), k); else o.multiplyScalar(1 + k); return '#' + o.getHexString(); };
      c.fillStyle = css(0); c.fillRect(0, 0, S, S);
      for (let i = 0; i < 46; i++) { const x = R() * S, y = R() * S, r = 18 + R() * 60, g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, R() < 0.5 ? css(0.05) : css(-0.09)); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.38; c.fillStyle = g2; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.globalAlpha = 1;
      for (let i = 0; i < 22; i++) { c.fillStyle = `rgba(20,16,10,${0.05 + R() * 0.08})`; const x = R() * S; c.fillRect(x, R() * S, 2 + R() * 5, 20 + R() * 70); }          // grime streaks
      const nS = kind === 'metal' ? 150 : kind === 'blade' ? 260 : kind === 'gun' ? 90 : 45, gun = kind === 'gun';
      c.lineCap = 'round';
      for (let i = 0; i < nS; i++) { const x = R() * S, y = R() * S, a = kind === 'blade' ? (R() - 0.5) * 0.3 : R() * Math.PI, l = 2 + R() * (kind === 'blade' ? 50 : 12);
        c.strokeStyle = kind === 'blade' ? `rgba(255,255,255,${0.05 + R() * 0.09})` : css(gun ? 0.16 + R() * 0.12 : 0.3 + R() * 0.25); c.globalAlpha = kind === 'blade' ? 1 : gun ? 0.05 + R() * 0.08 : 0.06 + R() * 0.14; c.lineWidth = R() < 0.85 ? 0.8 : 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      c.globalAlpha = 1;
      for (let i = 0; i < (kind === 'polymer' ? 40 : gun ? 30 : 90); i++) { c.fillStyle = css(gun ? 0.18 + R() * 0.1 : 0.4 + R() * 0.3); c.globalAlpha = gun ? 0.1 + R() * 0.12 : 0.18 + R() * 0.3; c.fillRect(R() * S, R() * S, 1 + R() * 2.4, 1 + R() * 1.6); }      // chips
      for (let i = 0; i < (gun ? 2400 : 500); i++) { c.fillStyle = R() < 0.5 ? `rgba(255,255,255,${gun ? 0.05 : 0.10})` : `rgba(0,0,0,${gun ? 0.12 : 0.14})`; c.globalAlpha = 1; c.fillRect(R() * S, R() * S, 1, 1); }        // dust
    }, 256);
  }
  // fabric for gloves: the glove colour with a woven grain + soft wear
  function fabricTex(base) {
    return canvasTex('fab-' + base, (c, S) => {
      const R = BR.util.rng(base % 7919), col = new THREE.Color(base), css = k => { const o = col.clone(); if (k > 0) o.lerp(new THREE.Color(0xffffff), k); else o.multiplyScalar(1 + k); return '#' + o.getHexString(); };
      c.fillStyle = css(0); c.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 2) { c.fillStyle = y % 4 ? css(0.05) : css(-0.08); c.globalAlpha = 0.5; c.fillRect(0, y, S, 1); }
      for (let i = 0; i < 30; i++) { const x = R() * S, y = R() * S, r = 14 + R() * 40, g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, R() < 0.5 ? css(0.1) : css(-0.15)); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.5; c.fillStyle = g2; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.globalAlpha = 0.6; c.strokeStyle = css(-0.35); c.setLineDash([3, 3]); c.lineWidth = 1; for (const y of [S * 0.25, S * 0.75]) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }      // stitch seams
      c.setLineDash([]); c.globalAlpha = 1;
    }, 128);
  }
  // studio environment: soft bright top, a hot horizon band (where reflections "catch"), dark floor
  const envCube = () => cache.env || (cache.env = (() => {
    const face = (top) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      if (top === 1) { const g = x.createRadialGradient(32, 32, 4, 32, 32, 46); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9aa6b4'); x.fillStyle = g; }
      else if (top === -1) { x.fillStyle = '#1c1e22'; }
      else { const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#a9b6c6'); g.addColorStop(0.42, '#e8eef6'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.56, '#5a5e64'); g.addColorStop(1, '#202226'); x.fillStyle = g; }
      x.fillRect(0, 0, 64, 64);
      if (top === 0) { x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(18, 10, 14, 18); }      // a softbox highlight
      return c; };
    const t = new THREE.CubeTexture([face(0), face(0), face(1), face(-1), face(0), face(0)]); t.needsUpdate = true; return t; })());
  BR.weaponEnv = envCube;
  const realMat = o => { const m = new THREE.MeshPhongMaterial(o); m.userData.real = true; return m; };
  const MAT = () => cache.common || (cache.common = {
    // (v1.17) worn albedo + real normal maps on the shared parts; UVs are box-mapped per model in weapon()
    dark: realMat({ map: wearTex(0x272b31, 'metal'), normalMap: NRM.scratch(), normalScale: new THREE.Vector2(0.5, 0.5), specular: 0x4a5058, shininess: 30, specularMap: DETAIL.finish(), envMap: envCube(), reflectivity: 0.06 }),
    metal: realMat({ map: wearTex(0x5f6771, 'metal'), normalMap: NRM.brushed(), normalScale: new THREE.Vector2(0.35, 0.35), specular: 0xb8c0ca, shininess: 75, specularMap: DETAIL.brushed(), envMap: envCube(), reflectivity: 0.28 }),
    grip: realMat({ map: wearTex(0x1b1d20, 'polymer'), normalMap: NRM.stipple(), normalScale: new THREE.Vector2(0.9, 0.9), specular: 0x2e3236, shininess: 12 }),
    blade: realMat({ map: wearTex(0xc8d0d8, 'blade'), normalMap: NRM.brushed(), normalScale: new THREE.Vector2(0.18, 0.18), specular: 0xffffff, shininess: 120, side: THREE.DoubleSide, envMap: envCube(), reflectivity: 0.4 }),
    knurl: realMat({ map: wearTex(0x3a3f46, 'metal'), normalMap: NRM.knurl(), normalScale: new THREE.Vector2(1, 1), specular: 0x9aa2ac, shininess: 50, envMap: envCube(), reflectivity: 0.12 }),
    lens: new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    lensDark: new THREE.MeshPhongMaterial({ color: 0x102030, specular: 0x88ccff, shininess: 120 }),
    reticle: new THREE.MeshBasicMaterial({ color: 0xff2236 }),
    dotHalo: new THREE.MeshBasicMaterial({ color: 0xff3a48, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    lensRed: new THREE.MeshBasicMaterial({ color: 0xffd2a0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    // coated red-dot glass: clear in the middle, blue-violet anti-glare tint toward the rim
    lensCoat: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, map: canvasTex('lenscoat', (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,220,200,0.03)'); g.addColorStop(0.6, 'rgba(150,170,255,0.10)'); g.addColorStop(0.9, 'rgba(120,90,255,0.32)'); g.addColorStop(1, 'rgba(40,40,80,0.7)');
      c.clearRect(0, 0, s, s); c.fillStyle = g; c.fillRect(0, 0, s, s); }, 64) }),
    dotHalo2: new THREE.MeshBasicMaterial({ color: 0xff2236, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
    scopeTube: realMat({ map: wearTex(0x1d2025, 'metal'), normalMap: NRM.scratch(), normalScale: new THREE.Vector2(0.4, 0.4), specular: 0x555a60, shininess: 40, side: THREE.DoubleSide, specularMap: DETAIL.finish(), envMap: envCube(), reflectivity: 0.12 }),
    sightDot: new THREE.MeshBasicMaterial({ color: 0xff8a1f }),
    shell: new THREE.MeshLambertMaterial({ color: 0xc8202a }),
    brass: new THREE.MeshPhongMaterial({ color: 0xc89b3c, specular: 0xffe2a0, shininess: 80, envMap: envCube(), reflectivity: 0.35 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  });

  // ------------------------------------------------------------- builders
  // Bevelled box: corners and edges pushed onto a rounded shell (r ≈ 18% of the smallest side).
  // Used for weapon parts in first person + the shop; dropped guns stay plain boxes (cheap).
  const RB = {};
  let ROUND = false;
  function roundedBox(w, h, d) {
    const key = w.toFixed(4) + '|' + h.toFixed(4) + '|' + d.toFixed(4);
    if (RB[key]) return RB[key];
    // corners rounded with a real radius and SMOOTH normals (each vertex's normal points away from
    // the inner core box), so edges catch the light like machined parts instead of hard box seams
    const r = Math.min(w, h, d) * 0.3, g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, nr = g.attributes.normal;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      // spread the inner grid lines toward the edges so the bevel gets most of the segments
      const sq = (a, hh) => { const t = a / (hh + r); return Math.sign(t) * Math.pow(Math.abs(t), 0.55) * (hh + r); };
      v.set(sq(v.x, hx), sq(v.y, hy), sq(v.z, hz));
      c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(c);
      if (v.lengthSq() > 1e-12) { v.normalize(); p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); nr.setXYZ(i, v.x, v.y, v.z); }
    }
    g._shared = true;
    return (RB[key] = g);
  }
  BR.roundedBox = roundedBox;
  function kit(g) {
    return {
      box(w, h, d, x, y, z, mat, rx) { const m = new THREE.Mesh(ROUND ? roundedBox(w, h, d) : new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; g.add(m); return m; },
      cyl(r, len, x, y, z, mat, axis, seg) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, Math.max(16, seg || 0)), mat);
        m.position.set(x, y, z);
        if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
        g.add(m); return m;
      },
    };
  }

  // Iron sights: rear notch (or aperture ring) + front post with a dot, on one sight line.
  function irons(g, M, y, rearZ, frontZ, ring) {
    const k = kit(g);
    if (ring) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0028, 6, 16), M.dark);
      r.position.set(0, y, rearZ); g.add(r);
      k.box(0.026, y - 0.095, 0.01, 0, (y + 0.095) / 2 - 0.006, rearZ, M.dark);
    } else {
      k.box(0.006, 0.014, 0.008, 0.008, y - 0.002, rearZ, M.dark);
      k.box(0.006, 0.014, 0.008, -0.008, y - 0.002, rearZ, M.dark);
      k.box(0.024, 0.006, 0.008, 0, y - 0.011, rearZ, M.dark);
    }
    k.box(0.004, 0.016, 0.004, 0, y - 0.007, frontZ, M.dark);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.005), M.sightDot); dot.position.set(0, y, frontZ); g.add(dot);
    const s = new THREE.Object3D(); s.position.set(0, y, rearZ); g.add(s);
    g.userData.sight = s; g.userData.sightDist = 0.3;
  }

  // Bolt-action bolt: a group pivoting on the bore axis at (y, z) so it can lift
  // (rotation.z) and slide back (+z). Handle sticks out to the right with a knob.
  function boltGroup(g, M, y, z, len) {
    const b = new THREE.Group(); b.position.set(0, y, z); g.add(b);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 10), M.metal); body.rotation.x = Math.PI / 2; b.add(body);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.055, 8), M.metal); arm.rotation.z = Math.PI / 2; arm.position.set(0.03, 0, 0.02); b.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), M.dark); knob.position.set(0.06, -0.004, 0.022); b.add(knob);
    g.userData.bolt = b; g.userData.boltKnob = knob.position.clone(); g.userData.boltZ0 = z;
    return b;
  }

  // Group some meshes as the detachable magazine (animated during reloads).
  function magGroup(g, meshes) {
    const grp = new THREE.Group();
    g.add(grp);
    for (const m of meshes) grp.attach(m);
    g.userData.mag = grp;
    return grp;
  }
  // Where the hands go (model space): right hand on the grip, left hand on the foregrip
  function hands(g, grip, fore, charge) {
    g.userData.grip = new THREE.Vector3(...grip);
    g.userData.fore = fore ? new THREE.Vector3(...fore) : null;
    g.userData.charge = charge ? new THREE.Vector3(...charge) : null;
  }

  function anchors(g, muzzleZ, muzzleY, charmPos) {
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, muzzleY, muzzleZ); g.add(muzzle);
    const charm = new THREE.Object3D(); charm.position.set(charmPos[0], charmPos[1], charmPos[2]); g.add(charm);
    // v1.22 muzzle flash: a hot core, a 6-ray star facing you and two crossed flame tongues along the barrel
    // (additive; the viewmodel spins + scales it every shot so no two flashes look the same)
    let flash;
    if (BR.Effects && BR.Effects.tex) {
      // v1.33 layered flash: a hot core, a wide soft glow, two stars (6-ray + sharp 4-ray cross), three flame petals along
      // the barrel and a petalled blossom for shotguns. Each part has its own material, so the viewmodel can shape and fade
      // every layer per shot (BR.Viewmodel animFlash), styled per weapon (userData.style, set in weapon()).
      const T = BR.Effects.tex(), mm = (map, c, op) => new THREE.MeshBasicMaterial({ map, color: c, transparent: true, opacity: op === undefined ? 1 : op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const sp = (c, op) => new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      flash = new THREE.Group(); flash.position.copy(muzzle.position); flash.position.z -= 0.01;
      const pl = cache.geo.fxPlane || (cache.geo.fxPlane = new THREE.PlaneGeometry(1, 1));
      const fg = cache.geo.fxFlame2 || (cache.geo.fxFlame2 = new THREE.PlaneGeometry(0.075, 0.24).rotateX(-Math.PI / 2).translate(0, 0, -0.11));
      const glow = sp(0xff8a2a, 0.55); glow.scale.setScalar(0.26); glow.position.z = -0.03;
      const core = sp(0xfff4d8, 1); core.scale.setScalar(0.09); core.position.z = -0.015;
      const starA = new THREE.Mesh(pl, mm(T.star, 0xffc46a)), starB = new THREE.Mesh(pl, mm(T.star4, 0xfff0c0, 0.85)), bloom = new THREE.Mesh(pl, mm(T.blossom, 0xffb050, 0.9));
      starA.scale.setScalar(0.17); starB.scale.setScalar(0.12); starB.position.z = -0.004; bloom.scale.setScalar(0.22); bloom.position.z = -0.02;
      const petals = [0, 1, 2].map(i => { const m = new THREE.Mesh(fg, mm(T.flame, 0xff9a3a)); m.rotation.z = i * Math.PI / 3; flash.add(m); return m; });
      flash.add(glow, bloom, starA, starB, core);
      flash.userData.fx = { glow, core, starA, starB, bloom, petals };
      flash.traverse(o => { o.userData.isFlash = true; o.userData.noUV = true; });
    } else { flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), MAT().flash); flash.position.copy(muzzle.position); flash.position.z -= 0.04; flash.scale.set(1, 1, 1.8); }
    flash.visible = false;
    g.add(flash);
    g.userData.muzzle = muzzle; g.userData.charm = charm; g.userData.flash = flash;
  }

  // Walnut: procedural wood-grain texture (grain runs along the gun) on a satin finish.
  function woodMaterial() {
    return (cache.mat.sgWood || (cache.mat.sgWood = new THREE.MeshPhongMaterial({ specular: 0x3a2414, shininess: 26, map: canvasTex('wood', (c, sz) => {
            c.fillStyle = '#6b3a1c'; c.fillRect(0, 0, sz, sz);
            for (let i = 0; i < 70; i++) {
              const y = Math.random() * sz, h = 1 + Math.random() * 3, l = 40 + Math.random() * 30;
              c.fillStyle = `hsla(${22 + Math.random() * 8},${45 + Math.random() * 20}%,${l * 0.45}%,${0.25 + Math.random() * 0.35})`;
              c.beginPath(); c.moveTo(0, y);
              for (let x = 0; x <= sz; x += 8) c.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
              c.lineTo(sz, y + h); c.lineTo(0, y + h); c.closePath(); c.fill();
            }
          }, 256) })));
  }

  // Side-profile extruder: points authored on a 2D grid (x = back, y = down, mapped by Z / Y),
  // [x, y] = line to, [cx, cy, x, y] = curve to; extruded to width w (centred on x0).
  // v1.16.2 Hunting Rifle standard finish: an original splatter camo (black base, chalk-white marbling,
  // mint + deep teal splashes with dark rims, fine speckle). Tiles seamlessly.
  function hunterCamo() {
    if (cache.mat.huCamo) return cache.mat.huCamo;
    const tex = canvasTex('huCamo', (c, S) => {
      const R = BR.util.rng(9811);
      c.fillStyle = '#0c0e10'; c.fillRect(0, 0, S, S);
      const blob = (x, y, r, fill, rim) => {
        const n = 14, pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = r * (0.55 + R() * 0.7); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * (0.55 + R() * 0.5)]); }
        const rot = R() * Math.PI;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          c.save(); c.translate(x + ox, y + oy); c.rotate(rot); c.beginPath();
          for (let i = 0; i <= n; i++) { const p = pts[i % n], q = pts[(i + 1) % n]; const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? c.quadraticCurveTo(p[0], p[1], mx, my) : c.moveTo(mx, my); }
          c.closePath(); if (rim) { c.lineWidth = 3; c.strokeStyle = rim; c.stroke(); } c.fillStyle = fill; c.fill(); c.restore();
        }
      };
      for (let i = 0; i < 22; i++) blob(R() * S, R() * S, 50 + R() * 60, R() < 0.5 ? '#e9edf0' : '#c3ccd2', '#15181b');   // chalk marbling
      for (let i = 0; i < 13; i++) blob(R() * S, R() * S, 22 + R() * 34, R() < 0.55 ? '#5ff2c6' : '#22c29a', '#06281f');   // mint splashes
      for (let i = 0; i < 12; i++) blob(R() * S, R() * S, 10 + R() * 18, '#0d6f5a', '#04211a');                            // deep teal cores
      for (let i = 0; i < 34; i++) blob(R() * S, R() * S, 10 + R() * 34, '#0c0e10', null);                                 // black veins + islands
      for (let i = 0; i < 12; i++) blob(R() * S, R() * S, 10 + R() * 18, '#f4f7f8', '#15181b');                           // bright chips
      for (let i = 0; i < 900; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'; c.fillRect(R() * S, R() * S, 1 + R() * 1.5, 1 + R() * 1.5); }   // speckle
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.8;
      for (let i = 0; i < 26; i++) { c.beginPath(); let x = R() * S, y = R() * S; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 26; y += (R() - 0.5) * 26; c.lineTo(x, y); } c.stroke(); }   // hairline cracks
    }, 512);
    return (cache.mat.huCamo = new THREE.MeshPhongMaterial({ map: tex, specular: 0x9ab0b0, shininess: 55, envMap: BR.weaponEnv(), reflectivity: 0.12 }));
  }
  // planar UVs from model-space position, picking the projection by the face normal (box mapping)
  function camoUV(m, k) {
    const geo = m.geometry = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    m.updateMatrix(); const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m.matrix);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); n.fromBufferAttribute(N, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ax >= ay && ax >= az) { uv[i * 2] = v.z * k; uv[i * 2 + 1] = v.y * k; } else if (ay >= az) { uv[i * 2] = v.z * k; uv[i * 2 + 1] = v.x * k + 0.37; } else { uv[i * 2] = v.x * k + 0.61; uv[i * 2 + 1] = v.y * k; }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  function profiler(g, Z, Y) {
    return (pts, w, mat, bevel, x0) => {
      const sh = new THREE.Shape(); bevel = bevel === undefined ? 0.003 : bevel;
      pts.forEach((p, i) => {
        if (p.length === 4) sh.quadraticCurveTo(Z(p[0]), Y(p[1]), Z(p[2]), Y(p[3]));
        else if (i === 0) sh.moveTo(Z(p[0]), Y(p[1])); else sh.lineTo(Z(p[0]), Y(p[1]));
      });
      // wider, rounder bevels (capped by the part's thickness) so receivers and stocks read as moulded / machined
      const be = Math.min(bevel * 1.7, w * 0.3), d = Math.max(0.002, w - 2 * be);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: be > 0, bevelThickness: be, bevelSize: be * 0.75, bevelOffset: -be * 0.35, bevelSegments: 4, curveSegments: 14 });
      geo.translate(0, 0, -d / 2); geo.rotateY(-Math.PI / 2);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
      const m = new THREE.Mesh(geo, mat); m.position.x = x0 || 0; g.add(m); return m;
    };
  }

  const BUILD = {
    // Pistol: a polymer-frame striker pistol. Squared slide with rear serrations, a
    // lower slide groove and an ejection port; frame with a short accessory rail,
    // squared trigger guard, finger-groove grip with a beavertail and stippled panels,
    // flared mag base. Fixed sights. Side profiles on a 2D grid, extruded.
    pistol(g, S, M) {
      const k = kit(g);
      const Z = x => -0.17 + (x - 172) * 0.0011, Y = y => 0.075 - (y - 88) * 0.0011;
      const prof = profiler(g, Z, Y), BY = Y(105);
      // slide
      prof([[136, 93], [141, 88], [367, 88], [372, 94], [372, 140], [136, 140]], 0.044, S, 0.004);
      k.box(0.002, Y(92) - Y(104), Z(302) - Z(246), 0.0225, (Y(92) + Y(104)) / 2, (Z(246) + Z(302)) / 2, M.grip);   // ejection port
      k.box(0.008, 0.002, Z(302) - Z(246), 0.019, Y(89), (Z(246) + Z(302)) / 2, M.grip);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 7; i++) prof([[334 + i * 5, 96], [336 + i * 5, 96], [334 + i * 5, 132], [332 + i * 5, 132]], 0.0006, M.grip, 0, sx * 0.0223);   // serrations
        k.box(0.0006, 0.002, Z(318) - Z(150), sx * 0.0223, Y(128), (Z(150) + Z(318)) / 2, M.grip);                                        // lower slide groove
      }
      // long barrel running out past the slide, with a crown
      const BL = 0.034;
      k.cyl(0.0088, BL + 0.01, 0, BY, Z(136) - BL / 2 + 0.005, M.dark, 'z', 16);
      k.cyl(0.0094, 0.004, 0, BY, Z(136) - BL, M.metal, 'z', 16);
      k.cyl(0.0046, 0.005, 0, BY, Z(136) - BL - 0.001, M.grip, 'z', 10);
      // frame + grip (finger grooves, beavertail), rail slots, stippled panels
      prof([[140, 140], [372, 140], [380, 128], [390, 136], [386, 152], [394, 238], [390, 252], [334, 254], [328, 238], [322, 226],
        [326, 212], [318, 198], [322, 184], [312, 168], [300, 160], [252, 158], [140, 154]], 0.04, M.grip, 0.005);
      for (const x of [160, 182, 204, 226]) k.box(0.041, 0.004, 0.006, 0, Y(152), Z(x), M.dark);
      for (const sx of [-1, 1]) prof([[344, 172], [382, 166], [388, 232], [348, 240]], 0.0008, M.dark, 0, sx * 0.0202);
      k.box(0.004, 0.006, 0.02, -0.021, Y(142), Z(318), M.dark);                // slide stop
      k.box(0.0035, 0.004, 0.012, 0.021, Y(146), Z(276), M.dark);               // takedown
      // squared trigger guard + trigger
      prof([[252, 156], [258, 156], [258, 180], [296, 180], [300, 166], [306, 166], [302, 188], [252, 186]], 0.012, M.grip, 0.0015);
      prof([[282, 150], [288, 150], [290, 162], [285, 172], [281, 170], [283, 162]], 0.006, M.dark, 0.001);
      // extended mag: body inside the grip, a long sleeve below it with grip ribs, big base pad
      const xm = [prof([[338, 200], [384, 196], [392, 300], [340, 302]], 0.03, M.dark, 0.002),
        prof([[334, 252], [390, 248], [395, 298], [338, 300]], 0.037, M.grip, 0.003),
        prof([[333, 298], [397, 294], [400, 310], [335, 313]], 0.044, M.dark, 0.003)];
      for (let i = 0; i < 3; i++) xm.push(k.box(0.0375, 0.002, Z(392) - Z(338), 0, Y(262 + i * 11), (Z(338) + Z(392)) / 2 + 0.002, M.dark));
      magGroup(g, xm);
      irons(g, M, Y(80), Z(352), Z(148), false);
      hands(g, [0, -0.06, Z(345)], [-0.012, -0.095, Z(350) - 0.03], [0, Y(110), Z(360)]);
      anchors(g, Z(136) - BL - 0.004, BY, [-0.03, -0.02, Z(392)]);
    },
    smg(g, S, M) {
      const k = kit(g);
      const Z = x => 0.03 + (x - 330) * 0.00078, Y = y => -0.07 - (y - 230) * 0.00078;
      const prof = profiler(g, Z, Y);
      const BY = Y(127);
      // barrel, crown, knurled nut
      k.cyl(0.0092, Z(125) - Z(35), 0, BY, (Z(35) + Z(125)) / 2, M.dark, 'z', 14);
      k.cyl(0.0098, 0.004, 0, BY, Z(35) - 0.001, M.metal, 'z', 14);
      k.cyl(0.021, Z(166) - Z(120), 0, BY, (Z(120) + Z(166)) / 2, M.dark, 'z', 20);
      for (let i = 0; i < 7; i++) k.cyl(0.0215, 0.0016, 0, BY, Z(126 + i * 5.5), M.grip, 'z', 20);
      // receiver + front lip, top cover, rail with cross slots, sight ears
      prof([[115, 80], [490, 80], [490, 168], [165, 168], [160, 188], [118, 188], [113, 160]], 0.05, S);
      prof([[150, 82], [160, 70], [480, 70], [488, 82], [488, 98], [150, 98]], 0.054, M.dark, 0.003);
      k.box(0.026, 0.006, Z(410) - Z(205), 0, Y(64), (Z(205) + Z(410)) / 2, M.dark);
      for (let i = 0; i < 10; i++) k.box(0.027, 0.003, 0.006, 0, Y(62), Z(212 + i * 21), M.metal);
      for (const [x0, x1] of [[165, 202], [432, 478]]) for (const sx of [-1, 1]) prof([[x0, 72], [x0 + 5, 56], [x1 - 4, 56], [x1, 72]], 0.01, M.dark, 0.0015, sx * 0.018);
      k.cyl(0.004, 0.012, 0, Y(60), Z(455), M.metal, 'z', 8);                          // rear aperture post
      // side detail: two long channels, slanted grooves, cocking knob, selector, push pin
      for (const sx of [-1, 1]) {
        for (const yy of [106, 118]) k.box(0.002, 0.004, Z(430) - Z(205), sx * 0.0255, Y(yy), (Z(205) + Z(430)) / 2, M.grip);
        for (let i = 0; i < 9; i++) { const x = 182 + i * 30; prof([[x, 140], [x + 9, 140], [x + 1, 162], [x - 8, 162]], 0.0008, M.grip, 0, sx * 0.0254); }
        k.cyl(0.004, 0.003, sx * 0.026, Y(150), Z(330), M.metal, 'x', 10);
      }
      k.cyl(0.006, 0.014, -0.032, Y(92), Z(240), M.metal, 'x', 10);                    // cocking knob
      k.box(0.004, 0.012, 0.016, 0.027, Y(150), Z(318), M.metal);                       // selector
      // trigger guard + trigger, grip housing the mag
      prof([[205, 186], [212, 186], [214, 206], [280, 206], [282, 186], [290, 186], [288, 216], [208, 214]], 0.012, M.dark, 0.0015);
      prof([[245, 188], [251, 188], [253, 198], [248, 206], [244, 204], [246, 198]], 0.006, M.metal, 0.001);
      prof([[286, 168], [386, 168], [389, 322], [292, 322], [285, 278], [294, 250], [284, 220], [292, 194]], 0.042, M.grip, 0.005);
      for (let i = 0; i < 4; i++) k.box(0.0435, 0.002, 0.03, 0, Y(250 + i * 14), Z(352), M.dark);   // grip texture
      const mag = [prof([[298, 300], [354, 300], [356, 462], [300, 462]], 0.032, M.dark, 0.003)];
      mag.push(k.box(0.036, 0.008, Z(358) - Z(296), 0, Y(464), (Z(296) + Z(358)) / 2, M.grip));
      magGroup(g, mag);
      // folding skeleton stock (extended): hinge block, arm with two cut-outs, ribbed pad
      prof([[488, 92], [522, 92], [522, 136], [488, 142]], 0.04, M.dark, 0.003);
      k.cyl(0.006, 0.044, 0, Y(112), Z(506), M.metal, 'x', 10);
      prof([[518, 96], [705, 96], [775, 150], [775, 168], [698, 126], [518, 130]], 0.02, M.dark, 0.003);
      for (const [x0, x1] of [[552, 600], [620, 668]]) prof([[x0, 104], [x1, 104], [x1 - 4, 120], [x0 + 4, 120]], 0.021, M.grip, 0);
      prof([[770, 144], [806, 144], [812, 156], [812, 268], [796, 270], [782, 252], [770, 172]], 0.036, M.dark, 0.004);
      for (let i = 0; i < 7; i++) k.box(0.037, 0.006, 0.004, 0, Y(170 + i * 13), Z(812) + 0.001, M.grip);
      // Micro red dot (T2-style): QD mount, housing with a front hood + lip, rear rim, capped
      // turrets, battery cap, coated lens (clear centre, blue-violet edge) and a crisp dot with glow
      const RY = Y(62) + 0.035, RZ = Z(300);
      k.box(0.034, 0.014, 0.05, 0, RY - 0.026, RZ + 0.004, M.dark);                                  // mount base
      k.box(0.006, 0.01, 0.022, 0.02, RY - 0.028, RZ + 0.012, M.metal);                           // QD lever
      k.box(0.026, 0.016, 0.034, 0, RY - 0.018, RZ + 0.002, M.scopeTube);                          // body saddle
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0215, 0.05, 32, 1, true), M.scopeTube);
      body.rotation.x = Math.PI / 2; body.position.set(0, RY, RZ); g.add(body);
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0225, 0.014, 32, 1, true), M.scopeTube);
      hood.rotation.x = Math.PI / 2; hood.position.set(0, RY, RZ - 0.031); g.add(hood);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0018, 8, 32), M.metal); lip.position.set(0, RY, RZ - 0.038); g.add(lip);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0215, 0.0024, 8, 32), M.dark); rim.position.set(0, RY, RZ + 0.025); g.add(rim);
      for (const [x, y, rx, rz] of [[0, RY + 0.025, 0, 0], [0.025, RY, 0, Math.PI / 2]]) {                           // turrets + caps
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 14), M.scopeTube); t.position.set(x, y, RZ + 0.004); t.rotation.set(rx, 0, rz); g.add(t);
        const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.003, 14), M.metal); cp.position.set(x * 1.24, x ? y : y + 0.007, RZ + 0.004); cp.rotation.set(rx, 0, rz); g.add(cp);
      }
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 14), M.metal); bat.rotation.z = Math.PI / 2; bat.position.set(-0.024, RY - 0.004, RZ + 0.006); g.add(bat);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0212, 32), M.lensCoat); lens.position.set(0, RY, RZ - 0.03); g.add(lens);
      const glow2 = new THREE.Mesh(new THREE.CircleGeometry(0.009, 20), M.dotHalo2); glow2.position.set(0, RY, RZ - 0.0298); g.add(glow2);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 20), M.dotHalo); halo.position.set(0, RY, RZ - 0.0296); g.add(halo);
      const rd = new THREE.Mesh(new THREE.CircleGeometry(0.0021, 16), M.reticle); rd.position.set(0, RY, RZ - 0.0294); g.add(rd);
      const ss = new THREE.Object3D(); ss.position.set(0, RY, RZ); g.add(ss);
      g.userData.sight = ss; g.userData.sightDist = 0.37;
      g.userData.sightDist = 0.37;
      hands(g, [0, -0.07, Z(336)], [0, -0.04, Z(175)], [-0.034, Y(92), Z(240)]);
      anchors(g, Z(35) - 0.006, BY, [-0.03, -0.02, 0.12]);
    },
    // Shotgun: a classic pump-action. Blued receiver and barrel with a vent rib and a green
    // fibre front bead, magazine tube with a barrel clamp, ribbed wood forend on action
    // bars (userData.pump slides back after each shot), wood stock with a pistol-grip
    // wrist and a black recoil pad. Camos / blueprints recolour the wood too.
    shotgun(g, S, M) {
      const k = kit(g), I = v => v, prof = profiler(g, I, I);
      const def = BR.CONFIG.weapons.shotgun;
      const wood = S === cache.mat['default|' + def.color] ? woodMaterial() : S;
      const BY = 0.05;
      // receiver: rounded top, slopes into the wrist; ejection + loading ports, pins
      prof([[-0.2, -0.006], [-0.2, 0.068], [-0.19, 0.08], [0.02, 0.08], [0.05, 0.068], [0.064, 0.04], [0.064, -0.006]], 0.05, S, 0.006);
      k.box(0.002, 0.024, 0.075, 0.0255, 0.046, -0.08, M.grip);
      k.box(0.003, 0.016, 0.06, 0.0255, 0.046, -0.08, M.metal);                // bolt face in the port
      k.box(0.03, 0.003, 0.08, 0, -0.0075, -0.07, M.grip);                       // loading port
      for (const z of [-0.02, 0.035]) k.cyl(0.0035, 0.052, 0, 0.012, z, M.metal, 'x', 8);
      k.box(0.004, 0.006, 0.016, -0.026, 0.004, 0.045, M.metal);                 // slide release
      // barrel, crown, vent rib with posts, green front bead, rear notch
      k.cyl(0.0145, 0.47, 0, BY, -0.435, S, 'z', 18);
      k.cyl(0.0158, 0.012, 0, BY, -0.666, M.dark, 'z', 18);
      k.box(0.009, 0.004, 0.45, 0, 0.0705, -0.43, S);
      for (let i = 0; i < 9; i++) k.box(0.004, 0.006, 0.006, 0, 0.0665, -0.22 - i * 0.05, M.dark);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 10, 8), cache.mat.sgBead || (cache.mat.sgBead = new THREE.MeshBasicMaterial({ color: 0x5dff6a })));
      bead.position.set(0, 0.0745, -0.648); g.add(bead);
      // magazine tube + cap, barrel clamp
      k.cyl(0.0118, 0.4, 0, 0.016, -0.4, M.dark, 'z', 14);
      k.cyl(0.0128, 0.022, 0, 0.016, -0.606, M.metal, 'z', 14);
      k.box(0.03, 0.05, 0.016, 0, 0.033, -0.585, M.dark);
      // pump: ribbed wood forend on two action bars, in a group that slides
      const pump = new THREE.Group(); g.add(pump);
      const fe = profiler(pump, I, I);
      fe([[-0.44, 0.0], [-0.43, -0.014], [-0.24, -0.016], [-0.226, -0.004], [-0.226, 0.03], [-0.24, 0.038], [-0.43, 0.038], [-0.44, 0.03]], 0.05, wood, 0.009);
      for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0505, 0.004, 0.006), M.grip); r.position.set(0, -0.014, -0.415 + i * 0.024); pump.add(r);
        for (const sx of [-1, 1]) { const sr = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.03, 0.006), M.grip); sr.position.set(sx * 0.0255, 0.01, -0.415 + i * 0.024); pump.add(sr); } }
      for (const sx of [-1, 1]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.2), M.metal); bar.position.set(sx * 0.016, 0.004, -0.15); pump.add(bar); }
      g.userData.pump = pump;
      // trigger guard + trigger
      prof([[-0.002, -0.006], [0.006, -0.006], [0.008, -0.03], [0.05, -0.032], [0.052, -0.006], [0.06, -0.006], [0.058, -0.04], [0.002, -0.038]], 0.012, M.dark, 0.0015);
      prof([[0.022, -0.004], [0.028, -0.004], [0.03, -0.016], [0.026, -0.028], [0.022, -0.026], [0.024, -0.016]], 0.006, M.metal, 0.001);
      // stock: wrist with a pistol-grip curve, straight comb, deep butt; black recoil pad
      prof([[0.056, 0.058], [0.12, 0.04], [0.352, 0.014], [0.356, -0.124], [0.31, -0.126], [0.17, -0.046], [0.128, -0.078], [0.098, -0.082], [0.086, -0.068], [0.074, -0.012], [0.056, -0.006]], 0.044, wood, 0.008);
      prof([[0.35, 0.02], [0.37, 0.02], [0.372, -0.128], [0.352, -0.128]], 0.047, M.grip, 0.004);
      k.box(0.048, 0.003, 0.003, 0, -0.054, 0.351, M.metal);                     // pad spacer line
      hands(g, [0, -0.06, 0.088], [0, -0.03, -0.33], null);
      g.userData.port = new THREE.Vector3(0, -0.02, -0.07);
      // raised ghost-ring rear on the receiver + tall front post on the rib, so the sight line clears the stock
      k.box(0.03, 0.022, 0.024, 0, 0.09, 0.008, M.dark);
      k.box(0.006, 0.03, 0.008, 0, 0.088, -0.645, M.dark);
      irons(g, M, 0.108, 0.008, -0.645, true);
      g.userData.sightDist = 0.26;
      anchors(g, -0.676, BY, [-0.03, -0.02, 0.1]);
    },
    // Rifle: an AK-pattern battle rifle in black polymer. Long flat-topped handguard
    // with window slots, thin barrel with a slotted brake and a fin front sight,
    // banana mag curving forward, raked pistol grip, angular fixed stock.
    // Side profiles are authored in a 2D pixel grid (x = back, y = down) and extruded.
    rifle(g, S, M) {
      const k = kit(g);
      const Z = x => -0.76 + (x - 30) * 0.00193, Y = y => 0.09 - (y - 15) * 0.00193;
      const prof = profiler(g, Z, Y);
      const BY = Y(40);                                                    // bore line
      // muzzle brake: body, three slot rings, crown
      k.cyl(0.0155, Z(78) - Z(30), 0, BY, (Z(30) + Z(78)) / 2, M.dark, 'z', 16);
      for (let i = 0; i < 3; i++) k.cyl(0.0162, 0.005, 0, BY, Z(40 + i * 11), M.grip, 'z', 16);
      k.cyl(0.0125, 0.008, 0, BY, Z(30) - 0.003, M.metal, 'z', 16);
      k.cyl(0.0085, Z(170) - Z(78), 0, BY, (Z(78) + Z(170)) / 2, M.dark, 'z', 12);          // barrel
      k.cyl(0.0065, Z(170) - Z(112), 0, Y(27), (Z(112) + Z(170)) / 2, M.dark, 'z', 10);      // upper rod
      k.box(0.03, Y(24) - Y(50), 0.026, 0, (Y(24) + Y(50)) / 2, Z(158), M.dark);             // front sight block
      prof([[110, 26], [122, -6], [136, -8], [142, 26]], 0.008, M.dark, 0.0015);               // fin front sight
      // handguard: flat top rail with window slots over a tapered lower panel
      prof([[160, 30], [167, 8], [332, 8], [332, 30]], 0.05, M.dark);
      for (let i = 0; i < 4; i++) { const x = 188 + i * 33; k.box(0.034, 0.012, Z(x + 24) - Z(x), 0, Y(12), (Z(x) + Z(x + 24)) / 2, M.grip); }
      prof([[166, 30], [334, 30], [334, 68], [300, 66], [166, 44]], 0.056, S);
      for (const sx of [-1, 1]) k.box(0.002, 0.004, Z(330) - Z(190), sx * 0.0295, Y(36), (Z(190) + Z(330)) / 2, M.metal);   // chrome edge lines
      // receiver + dust cover + rear sight block
      prof([[330, 20], [474, 20], [474, 76], [432, 76], [400, 72], [334, 72]], 0.054, S);
      prof([[328, 20], [334, 9], [470, 9], [476, 20]], 0.046, M.dark, 0.004);
      prof([[292, 20], [300, -2], [334, -2], [342, 20]], 0.04, M.dark, 0.002);
      k.box(0.004, 0.006, Z(430) - Z(376), 0.029, Y(46), (Z(376) + Z(430)) / 2, M.metal);   // selector lever
      k.box(0.004, 0.016, 0.012, 0.029, Y(52), Z(430), M.metal);
      k.cyl(0.0055, 0.03, 0.04, Y(36), Z(350), M.metal, 'x', 8);                           // charging handle
      k.cyl(0.008, 0.012, 0.056, Y(36), Z(350), M.dark, 'x', 10);
      // trigger guard + trigger
      prof([[384, 72], [390, 72], [392, 90], [432, 92], [434, 76], [440, 76], [438, 98], [386, 96]], 0.012, M.dark, 0.0015);
      prof([[410, 74], [416, 74], [418, 82], [414, 90], [410, 88], [412, 82]], 0.006, M.metal, 0.001);
      // pistol grip, raked back
      prof([[432, 74], [466, 74], [488, 130], [482, 142], [456, 142], [450, 120], [438, 96]], 0.04, M.grip, 0.005);
      // stock: flat top, sloping belly, tall butt; recessed side panels, rubber pad, orange toe line
      prof([[472, 20], [598, 20], [602, 28], [602, 132], [584, 134], [580, 122], [500, 74], [472, 78]], 0.05, S, 0.004);
      for (const sx of [-1, 1]) prof([[512, 38], [586, 38], [586, 108], [566, 110]], 0.003, M.dark, 0, sx * 0.025);
      prof([[600, 20], [610, 20], [610, 134], [600, 134]], 0.054, M.grip, 0.003);
      const toe = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
      k.box(0.044, 0.003, Z(608) - Z(588), 0, Y(133), (Z(588) + Z(608)) / 2, toe);
      // banana mag (curves forward), ribbed spine, floor plate
      const magPts = [[334, 70], [376, 70], [374, 130, 334, 192], [272, 178], [316, 122, 334, 70]];
      const mag = [prof(magPts, 0.04, M.grip, 0.004)];
      for (let i = 0; i < 6; i++) {
        const t = 0.3 + i * 0.11, a = 1 - t;
        const px = a * a * 376 + 2 * a * t * 374 + t * t * 334, py = a * a * 70 + 2 * a * t * 130 + t * t * 192;
        const r = k.box(0.042, 0.004, 0.014, 0, Y(py), Z(px) - 0.005, M.dark); r.rotation.x = -0.2 - t * 0.55; mag.push(r);
      }
      { const fp = k.box(0.044, 0.008, Z(336) - Z(272) + 0.004, 0, (Y(192) + Y(178)) / 2 - 0.004, (Z(272) + Z(336)) / 2, M.dark); fp.rotation.x = Math.atan2(Y(178) - Y(192), Z(336) - Z(272)); mag.push(fp); }
      const fol = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.02), toe); fol.position.set(0, Y(68), Z(356)); g.add(fol); mag.push(fol);
      magGroup(g, mag);
      irons(g, M, Y(-10), Z(318), Z(129), false);
      g.userData.sightDist = 0.34;
      hands(g, [0, -0.075, 0.06], [0, 0.0, -0.33], [0.04, 0.045, -0.15]);
      anchors(g, Z(30) - 0.01, BY, [-0.035, -0.01, 0.12]);
    },
    // Holo AR: suppressed flat-top carbine. Long rectangular suppressor with angled
    // grooves, slim handguard with a top slot, flat-top receiver, straight box mag,
    // raked grip, angular stock with an under-notch; clean one-piece holographic sight.
    holoar(g, S, M) {
      const k = kit(g);
      const Z = x => 0.06 + (x - 412) * 0.00218, Y = y => -0.075 - (y - 335) * 0.00218;
      const prof = profiler(g, Z, Y);
      const BY = Y(281);
      // suppressor: flat-sided can, rounded edges, three angled grooves at the rear, bore at the front
      prof([[25, 266], [182, 266], [182, 296], [25, 296]], 0.05, M.dark, 0.008);
      for (let i = 0; i < 3; i++) { const x = 146 + i * 11; prof([[x, 267], [x + 5, 267], [x + 12, 295], [x + 7, 295]], 0.0515, M.grip, 0.0008); }
      k.cyl(0.0075, 0.004, 0, BY, Z(25) - 0.006, M.grip, 'z', 12);
      k.cyl(0.0165, Z(194) - Z(181), 0, BY, (Z(181) + Z(194)) / 2, M.metal, 'z', 14);     // barrel collar
      // top: front fin, flat upper rail with a slot, charging bump
      prof([[186, 262], [192, 247], [206, 247], [212, 262]], 0.008, M.dark, 0.0015);
      prof([[188, 262], [196, 254], [466, 254], [472, 262], [472, 276], [188, 280]], 0.052, M.dark, 0.004);
      for (const yy of [259, 263]) k.box(0.03, 0.0025, Z(268) - Z(206), 0, Y(yy) + 0.012, (Z(206) + Z(268)) / 2, M.grip);
      prof([[316, 254], [322, 247], [352, 247], [358, 254]], 0.04, M.dark, 0.002);
      // body: handguard + receiver in the skin, panel seam lines
      prof([[192, 280], [302, 276], [302, 300], [232, 300], [192, 292]], 0.056, S);
      prof([[298, 276], [472, 276], [472, 302], [440, 306], [392, 306], [360, 304], [298, 302]], 0.056, S);
      for (const sx of [-1, 1]) { const ln = k.box(0.002, 0.003, Z(470) - Z(300), sx * 0.0285, Y(288), (Z(300) + Z(470)) / 2, M.metal); ln.rotation.x = -0.05; }
      k.box(0.004, 0.006, 0.04, 0.029, Y(296), Z(420), M.metal);                            // selector
      // trigger guard + trigger, raked grip
      prof([[358, 304], [364, 304], [366, 326], [392, 328], [394, 308], [400, 308], [398, 334], [360, 332]], 0.012, M.dark, 0.0015);
      prof([[376, 306], [382, 306], [384, 316], [379, 323], [376, 321], [378, 315]], 0.006, M.metal, 0.001);
      prof([[394, 304], [424, 304], [438, 358], [432, 368], [408, 368], [402, 345], [398, 325]], 0.04, M.grip, 0.005);
      // stock: top steps down from the receiver, tall butt, notch underneath, recessed panels, pad
      prof([[470, 262], [500, 266], [526, 270], [532, 278], [532, 330], [520, 333], [508, 318], [486, 312], [470, 304]], 0.05, S, 0.004);
      for (const sx of [-1, 1]) prof([[488, 282], [520, 284], [520, 312], [500, 306]], 0.003, M.dark, 0, sx * 0.0245);
      prof([[530, 270], [538, 270], [538, 333], [530, 333]], 0.054, M.grip, 0.003);
      // straight box mag with a floor plate and two grip ribs
      prof([[316, 298], [358, 298], [358, 312], [316, 312]], 0.05, S, 0.002);
      const mag = [prof([[320, 304], [354, 304], [357, 372], [323, 374]], 0.038, M.grip, 0.003)];
      for (const yy of [330, 345]) mag.push(k.box(0.04, 0.003, Z(355) - Z(322), 0, Y(yy), (Z(322) + Z(355)) / 2 + 0.002, M.dark));
      mag.push(k.box(0.044, 0.008, Z(359) - Z(321), 0, Y(375), (Z(321) + Z(359)) / 2 + 0.002, M.dark));
      magGroup(g, mag);
      // Holographic sight: low mount, slim body, one-piece rounded hood with a clear window,
      // a crisp ring-and-dot reticle with a soft glow, two flush buttons
      const HZ = (Z(334) + Z(386)) / 2, HY = 0.158, top = Y(254);
      k.box(0.044, 0.012, 0.078, 0, top + 0.006, HZ, M.dark);
      k.box(0.056, 0.024, 0.074, 0, top + 0.022, HZ, M.scopeTube);
      for (let i = 0; i < 2; i++) k.box(0.004, 0.007, 0.01, -0.029, top + 0.022, HZ + 0.012 - i * 0.016, M.metal);
      const rr = (w, h, r) => { const sp = new THREE.Path(), x = -w / 2, y = -h / 2;
        sp.moveTo(x + r, y); sp.lineTo(x + w - r, y); sp.quadraticCurveTo(x + w, y, x + w, y + r); sp.lineTo(x + w, y + h - r);
        sp.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sp.lineTo(x + r, y + h); sp.quadraticCurveTo(x, y + h, x, y + h - r);
        sp.lineTo(x, y + r); sp.quadraticCurveTo(x, y, x + r, y); return sp; };
      const hoodS = new THREE.Shape(rr(0.062, 0.056, 0.012).getPoints(6)); hoodS.holes.push(rr(0.053, 0.047, 0.008));
      const hoodG = new THREE.ExtrudeGeometry(hoodS, { depth: 0.064, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 6 });
      hoodG.translate(0, 0, -0.032);
      const hood = new THREE.Mesh(hoodG, M.scopeTube); hood.position.set(0, HY, HZ); g.add(hood);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.053, 0.047), M.lens); glass.position.set(0, HY, HZ - 0.03); g.add(glass);
      const ret = new THREE.Group(); ret.position.set(0, HY, HZ - 0.028); g.add(ret);
      ret.add(new THREE.Mesh(new THREE.RingGeometry(0.0064, 0.0072, 64), M.reticle));
      ret.add(new THREE.Mesh(new THREE.RingGeometry(0.0059, 0.0077, 64), M.dotHalo2));
      ret.add(new THREE.Mesh(new THREE.CircleGeometry(0.0011, 16), M.reticle));
      const hh = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), M.dotHalo); hh.position.z = -0.0002; ret.add(hh);
      const sight = new THREE.Object3D(); sight.position.set(0, HY, HZ); g.add(sight);
      g.userData.sight = sight; g.userData.sightDist = 0.44;
      hands(g, [0, -0.075, 0.06], [0, -0.004, -0.29], [0.04, 0.08, Z(336)]);
      anchors(g, Z(25) - 0.012, BY, [-0.035, -0.01, 0.12]);
    },
    ar(g, S, M, opts) {
      const holo = opts && opts.holo;
      const k = kit(g);
      k.box(0.06, 0.085, 0.34, 0, 0.03, -0.05, S);                // receiver
      k.box(0.064, 0.022, 0.42, 0, 0.083, -0.1, M.dark);          // top rail
      for (let i = 0; i < 9; i++) k.box(0.066, 0.008, 0.014, 0, 0.098, -0.28 + i * 0.04, M.metal);
      k.box(0.07, 0.07, 0.26, 0, 0.035, -0.34, M.dark);           // handguard
      for (let i = 0; i < 5; i++) k.box(0.072, 0.018, 0.03, 0, 0.035, -0.25 - i * 0.045, M.metal); // vents
      k.cyl(0.03, 0.26, 0, 0.035, -0.6, M.grip, 'z', 12);         // SUPPRESSOR
      k.cyl(0.031, 0.02, 0, 0.035, -0.5, M.metal, 'z', 12);
      magGroup(g, [k.cyl(0.055, 0.06, 0, -0.07, -0.08, M.dark, 'x', 16), k.cyl(0.03, 0.065, 0, -0.07, -0.08, M.metal, 'x', 10)]); // DRUM MAG
      hands(g, [0, -0.07, 0.06], [0, -0.005, -0.34], [0.04, 0.05, 0.04]);
      k.box(0.03, 0.05, 0.04, 0, -0.02, -0.08, M.dark);           // mag well
      k.box(0.042, 0.12, 0.05, 0, -0.06, 0.06, M.grip, 0.25);     // grip
      k.box(0.055, 0.08, 0.2, 0, 0.01, 0.23, S);                  // stock
      k.box(0.06, 0.1, 0.02, 0, -0.005, 0.33, M.grip);            // butt pad
      if (holo) {
        // Holographic sight (EOTech-style): mount, battery body, hooded window,
        // clean 65-MOA ring with ticks + centre dot, soft glow
        k.box(0.05, 0.016, 0.1, 0, 0.104, -0.08, M.dark);                          // rail mount
        k.box(0.064, 0.024, 0.07, 0, 0.124, -0.075, M.scopeTube);                 // body under the window
        for (let i = 0; i < 3; i++) k.box(0.008, 0.006, 0.008, -0.034, 0.124, -0.058 - i * 0.014, M.metal);   // buttons
        for (const x of [-0.031, 0.031]) k.box(0.005, 0.05, 0.078, x, 0.16, -0.08, M.scopeTube);       // hood sides
        k.box(0.058, 0.005, 0.078, 0, 0.188, -0.08, M.scopeTube);                                      // hood top
        for (const x of [-0.028, 0.028]) k.cyl(0.0055, 0.078, x, 0.185, -0.08, M.scopeTube, 'z', 8);   // rounded corners
        k.box(0.064, 0.004, 0.004, 0, 0.135, -0.118, M.metal);                     // front window lip
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.05), M.lens);
        glass.position.set(0, 0.16, -0.1); g.add(glass);
        const ret = new THREE.Group(); ret.position.set(0, 0.156, -0.099); g.add(ret);
        ret.add(new THREE.Mesh(new THREE.RingGeometry(0.0062, 0.0072, 48), M.reticle));
        ret.add(new THREE.Mesh(new THREE.RingGeometry(0.0056, 0.0078, 48), M.dotHalo));
        for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.0009, 0.0022), M.reticle); const a2 = i * Math.PI / 2; t.position.set(Math.cos(a2) * 0.0081, Math.sin(a2) * 0.0081, 0); t.rotation.z = a2 + Math.PI / 2; ret.add(t); }
        ret.add(new THREE.Mesh(new THREE.CircleGeometry(0.0011, 12), M.reticle));
        const hh = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 12), M.dotHalo); hh.position.z = -0.0002; ret.add(hh);
        const sight = new THREE.Object3D(); sight.position.set(0, 0.156, -0.1); g.add(sight);
        g.userData.sight = sight; g.userData.sightDist = 0.44;
      } else {
        irons(g, M, 0.13, 0.05, -0.3, true);                      // aperture iron sights
      }
      anchors(g, -0.74, 0.035, [-0.04, -0.01, 0.1]);
    },
    // Hunting rifle: a classic wooden bolt-action sporter. One-piece walnut stock with a
    // long fore-end that runs under most of the barrel, a pistol-grip wrist with
    // checkering, raised comb and black butt pad; round blued receiver with a bolt and
    // shroud, tapered barrel with a band, open sights (rear notch + ramped front post),
    // steel trigger guard and floorplate, sling swivels.
    // v1.17.2 Shockwave Launcher: chunky revolving grenade launcher. Wide barrel with three glowing
    // purple coil rings and a heavy muzzle ring, a 4-round drum (the "mag" for reloads) with glowing
    // grenade noses in its chambers, receiver with a vented top rail and an open reflex-style sight,
    // angled pistol grip + vertical foregrip, skeleton stock with a rubber pad, purple accent strips.
    launcher(g, S, M) {
      const k = kit(g), glow = glowMat(0xb04bff), hot = glowMat(0xffb8ff);
      // receiver + rear housing
      k.box(0.064, 0.07, 0.22, 0, 0.032, 0.0, S);
      k.box(0.058, 0.05, 0.08, 0, 0.026, 0.14, S);
      for (const sx of [-1, 1]) { k.box(0.003, 0.008, 0.16, sx * 0.0325, 0.04, -0.01, glow); k.box(0.002, 0.03, 0.05, sx * 0.0326, 0.02, 0.06, M.dark); }
      // vented top rail + open reflex sight frame (sight line from irons)
      k.box(0.026, 0.008, 0.22, 0, 0.071, -0.04, M.dark);
      for (let i = 0; i < 9; i++) k.box(0.027, 0.004, 0.006, 0, 0.0765, -0.13 + i * 0.022, M.metal);
      k.box(0.036, 0.006, 0.05, 0, 0.081, -0.02, M.dark);
      for (const sx of [-1, 1]) k.box(0.004, 0.032, 0.04, sx * 0.017, 0.1, -0.02, M.dark);
      k.box(0.038, 0.005, 0.04, 0, 0.118, -0.02, M.dark);
      irons(g, M, 0.1, 0.03, -0.2, false);
      k.box(0.01, 0.02, 0.012, 0, 0.08, -0.2, M.dark);                        // front post base on the barrel
      g.userData.sightDist = 0.36;
      // barrel: wide tube, coil rings, muzzle ring, bore
      k.cyl(0.033, 0.34, 0, 0.038, -0.3, S, 'z', 24);
      for (const z of [-0.24, -0.32, -0.4]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0055, 10, 28), glow); r.position.set(0, 0.038, z); g.add(r); }
      k.cyl(0.04, 0.03, 0, 0.038, -0.475, M.metal, 'z', 24);
      k.cyl(0.026, 0.004, 0, 0.038, -0.492, M.grip, 'z', 20);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(0.006, 0.006, 0.02, Math.cos(a) * 0.036, 0.038 + Math.sin(a) * 0.036, -0.47, M.dark); }
      // 4-round drum under the barrel root, with glowing grenade noses in the chambers
      const drumParts = [];
      drumParts.push(k.cyl(0.054, 0.13, 0, -0.02, -0.11, M.dark, 'z', 28));
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39; drumParts.push(k.box(0.008, 0.008, 0.12, Math.cos(a) * 0.053, -0.02 + Math.sin(a) * 0.053, -0.11, M.metal)); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.79, x = Math.cos(a) * 0.03, y = -0.02 + Math.sin(a) * 0.03;
        drumParts.push(k.cyl(0.016, 0.006, x, y, -0.178, M.grip, 'z', 16));
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), i % 2 ? hot : glow); nose.position.set(x, y, -0.18); g.add(nose); drumParts.push(nose); }
      drumParts.push(k.cyl(0.012, 0.15, 0, -0.02, -0.11, M.metal, 'z', 14));
      magGroup(g, drumParts);
      // grip, trigger guard + trigger, vertical foregrip
      const grip = k.box(0.032, 0.11, 0.046, 0, -0.055, 0.09, M.grip); grip.rotation.x = 0.28;
      k.box(0.006, 0.004, 0.06, 0, -0.03, 0.045, M.dark); k.box(0.006, 0.03, 0.004, 0, -0.016, 0.016, M.dark);
      k.box(0.004, 0.02, 0.006, 0, -0.012, 0.045, M.metal);
      k.cyl(0.016, 0.09, 0, -0.056, -0.3, M.grip, 'y', 16); k.box(0.03, 0.012, 0.05, 0, -0.012, -0.3, M.dark);
      // skeleton stock + pad
      k.box(0.02, 0.018, 0.17, 0, 0.034, 0.25, M.dark); k.box(0.02, 0.018, 0.15, 0, -0.03, 0.25, M.dark);
      k.box(0.018, 0.08, 0.018, 0, 0.002, 0.33, M.dark);
      k.box(0.034, 0.1, 0.022, 0, 0.0, 0.345, M.grip);
      k.box(0.004, 0.06, 0.004, 0.012, 0.002, 0.33, glow);
      hands(g, [0, -0.07, 0.1], [0, -0.07, -0.3], [0.05, 0.03, 0.0]);
      anchors(g, -0.5, 0.038, [-0.036, -0.01, 0.1]);
    },
    hunter(g, S, M) {
      // v1.16.2 Hunting Rifle: a Mauser-pattern bolt action (the 98k layout). Full-length one-piece stock
      // running almost to the muzzle with a top handguard over the barrel, two barrel bands and a nose
      // cap (cleaning rod tip + bayonet lug under it), hooded front post and a stepped tangent rear sight,
      // a receiver with a stripper-clip bridge, the turned-down bolt with its round knob, the three-position
      // safety flag on the shroud, flush floorplate + trigger guard, steel buttplate, the bolt disassembly
      // disc and sling slot in the butt, sling swivels, and a laser module by the muzzle with a red beam.
      // Standard finish: an original black / white / mint "splatter" camo over the whole rifle.
      const k = kit(g), I = v => v, prof = profiler(g, I, I);
      const def = BR.CONFIG.weapons.hunter, std = S === cache.mat['default|' + def.color];
      const camo = std ? skinMaterial('default', 0x24272c) : S, steel = std ? camo : M.dark;     // v1.18: black factory finish (was the mint splatter camo)
      const BY = 0.046;
      const camoMeshes = [];
      const C = m => { camoMeshes.push(m); return m; };
      // ---- stock (one piece: forend, receiver area, wrist with a slight pistol grip, butt)
      C(prof([[-0.535, 0.03], [-0.33, 0.031], [-0.06, 0.033], [0.0, 0.034], [0.17, 0.034], [0.2, 0.029], [0.26, 0.035], [0.424, 0.05],
        [0.424, -0.085], [0.3, -0.062], [0.236, -0.052], [0.214, -0.07], [0.198, -0.083], [0.182, -0.082], [0.168, -0.052], [0.15, -0.033],
        [0.0, -0.033], [-0.1, -0.021], [-0.33, -0.004], [-0.535, 0.005]], 0.032, camo, 0.006));
      prof([[0.424, 0.051], [0.436, 0.052], [0.437, -0.088], [0.424, -0.086]], 0.034, M.dark, 0.003);            // steel buttplate
      const disc = k.cyl(0.0115, 0.003, 0.0172, -0.016, 0.288, M.metal, 'x', 18); void disc;              // bolt disassembly disc
      k.cyl(0.004, 0.003, 0.0185, -0.016, 0.288, M.dark, 'x', 10);
      k.box(0.034, 0.012, 0.03, 0, -0.035, 0.33, M.grip);                                                // sling slot
      // top handguard over the barrel, rear sight to lower band
      const hg = C(k.box(0.026, 0.016, 0.27, 0, BY + 0.004, -0.195, camo)); hg.scale.y = 0.95;
      // ---- barrel (tapered), crown
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0082, 0.0112, 0.63, 18), steel); bar.rotation.x = -Math.PI / 2; bar.position.set(0, BY, -0.31); g.add(C(bar));
      k.cyl(0.0086, 0.006, 0, BY, -0.627, M.metal, 'z', 16);
      k.cyl(0.0042, 0.004, 0, BY, -0.629, M.grip, 'z', 12);                                               // bore
      // ---- nose cap + bayonet lug + cleaning rod tip
      C(k.box(0.032, 0.04, 0.026, 0, 0.026, -0.548, steel));
      k.box(0.012, 0.012, 0.04, 0, 0.002, -0.55, M.dark);                                                  // bayonet lug
      k.cyl(0.0034, 0.05, 0, -0.006, -0.57, M.metal, 'z', 10);                                             // cleaning rod
      k.cyl(0.0052, 0.008, 0, -0.006, -0.596, M.metal, 'z', 12);                                           // rod knob
      // ---- barrel bands (upper band with a side swivel, lower band with the spring)
      for (const [z, w] of [[-0.47, 0.022], [-0.338, 0.014]]) C(k.box(0.038, 0.058, w, 0, 0.024, z, steel));
      k.box(0.004, 0.012, 0.01, 0.0195, 0.016, -0.32, M.metal);                                            // band spring
      for (const [x, y, z] of [[-0.021, 0.012, -0.47], [0, -0.071, 0.36]]) { const sw = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0018, 6, 14), M.metal); sw.position.set(x, y, z); sw.rotation.y = x ? 0 : Math.PI / 2; g.add(sw); }
      // ---- front sight: base, post (irons), protective hood
      C(k.box(0.016, 0.012, 0.024, 0, BY + 0.012, -0.6, steel));
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0018, 6, 18, Math.PI), M.dark); hood.position.set(0, BY + 0.016, -0.6); g.add(hood);
      // ---- tangent rear sight: base on the barrel, stepped ramp, leaf with the notch (irons)
      C(k.box(0.024, 0.012, 0.062, 0, BY + 0.012, -0.035, steel));
      prof([[-0.064, 0.064], [-0.006, 0.07], [-0.006, 0.064], [-0.062, 0.06]], 0.02, M.dark, 0.001);       // leaf
      for (let i = 0; i < 4; i++) k.box(0.026, 0.0016, 0.004, 0, 0.0645 + i * 0.0014, -0.05 + i * 0.012, M.metal);   // range steps
      k.box(0.006, 0.006, 0.01, 0.0135, 0.062, -0.035, M.metal);                                           // slide catch
      irons(g, M, 0.084, -0.012, -0.6, false);
      g.userData.sightDist = 0.4;
      // ---- receiver: front ring, body, bridge with the stripper-clip guide, ejection port, bolt shroud
      C(k.cyl(0.0168, 0.04, 0, 0.05, 0.016, steel, 'z', 22));
      C(k.cyl(0.0148, 0.135, 0, 0.05, 0.1, steel, 'z', 22));
      C(k.box(0.032, 0.014, 0.024, 0, 0.06, 0.155, steel));                                                // bridge
      for (const x of [-0.009, 0.009]) k.box(0.004, 0.01, 0.014, x, 0.071, 0.155, M.metal);               // clip guide
      k.box(0.003, 0.016, 0.07, 0.0147, 0.054, 0.085, M.grip);                                             // ejection port
      k.cyl(0.0108, 0.04, 0, 0.052, 0.186, M.dark, 'z', 16);                                               // shroud
      const flag = k.box(0.004, 0.017, 0.007, 0, 0.068, 0.19, M.metal); flag.rotation.z = 0.25;            // safety flag
      k.cyl(0.0045, 0.012, 0, 0.052, 0.21, M.metal, 'z', 10);                                              // cocking piece
      // turned-down bolt handle with a round knob (animated on the bolt cycle)
      const b = boltGroup(g, M, 0.052, 0.112, 0.14);
      const arm = b.children[1], knob = b.children[2];
      arm.rotation.set(0, 0, 0.98); arm.position.set(0.024, -0.016, 0.024); arm.scale.set(1, 1.05, 1);
      knob.geometry = new THREE.SphereGeometry(0.0115, 14, 10); knob.position.set(0.049, -0.034, 0.03); knob.scale.set(1, 0.92, 1.05); knob.material = M.dark;
      g.userData.boltKnob = knob.position.clone();
      // ---- trigger guard, trigger, flush floorplate (the "mag" for reloads)
      prof([[0.1, -0.026], [0.106, -0.026], [0.108, -0.047], [0.146, -0.049], [0.148, -0.028], [0.154, -0.028], [0.152, -0.056], [0.102, -0.054]], 0.01, M.dark, 0.0015);
      prof([[0.122, -0.026], [0.128, -0.026], [0.13, -0.036], [0.125, -0.046], [0.121, -0.044], [0.123, -0.036]], 0.005, M.metal, 0.001);
      magGroup(g, [k.box(0.022, 0.022, 0.08, 0, -0.016, 0.05, M.dark), k.box(0.026, 0.004, 0.1, 0, -0.033, 0.052, M.dark)]);
      // ---- laser module under the muzzle (right side) with its red beam
      k.box(0.016, 0.018, 0.046, 0.022, 0.018, -0.5, M.dark);
      k.box(0.012, 0.012, 0.002, 0.022, 0.018, -0.524, M.metal);
      const lensM = cache.mat.laserLens || (cache.mat.laserLens = new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.003, 12), lensM); lens.rotation.x = Math.PI / 2; lens.position.set(0.022, 0.018, -0.5245); g.add(lens);
      const beamM = cache.mat.laserBeam || (cache.mat.laserBeam = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0016, 0.9, 6, 1, true), beamM); beam.rotation.x = Math.PI / 2; beam.position.set(0.022, 0.018, -0.975); beam.userData.noMerge = true; g.add(beam);
      g.userData.laser = beam;
      // camo wraps every major part: planar UVs in model space so the pattern flows across parts
      // (v1.18: the factory finish is box-mapped in realPass like every other gun)
      hands(g, [0, -0.06, 0.19], [0, -0.008, -0.2], [0.055, 0.03, 0.14]);
      anchors(g, -0.632, BY, [-0.035, -0.02, 0.24]);
    },
    // LMG: belt-fed light machine gun. Boxy receiver with a feed cover and carry handle, perforated
    // barrel shroud, flash hider, folded bipod, vertical foregrip, an ammo box with a brass belt
    // feeding the side (the "mag" for reloads), pistol grip and a fixed stock.
    lmg(g, S, M) {
      const k = kit(g), I = v => v, prof = profiler(g, I, I), BY = 0.045;
      prof([[-0.18, -0.01], [-0.18, 0.082], [0.12, 0.082], [0.145, 0.06], [0.145, -0.01]], 0.07, S, 0.005);
      k.box(0.074, 0.02, 0.22, 0, 0.094, -0.04, M.dark);                                        // feed cover
      for (let i = 0; i < 5; i++) k.box(0.076, 0.004, 0.006, 0, 0.105, -0.12 + i * 0.04, M.metal);
      // top rail + ACOG-style 4x prism scope (round eyepiece view when aimed: def.optic 'acog')
      k.box(0.024, 0.008, 0.2, 0, 0.108, -0.04, M.dark);
      for (let i = 0; i < 9; i++) k.box(0.025, 0.004, 0.006, 0, 0.1135, -0.13 + i * 0.022, M.metal);
      const AY = 0.146, AZ = -0.03;
      k.box(0.03, 0.018, 0.06, 0, 0.122, AZ, M.dark);                                             // mount
      k.box(0.034, 0.008, 0.016, 0.004, 0.118, AZ + 0.012, M.metal);                              // throw lever
      k.cyl(0.019, 0.1, 0, AY, AZ, M.scopeTube, 'z', 24);                                          // body
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.025, 0.03, 24), M.scopeTube); bell.rotation.x = -Math.PI / 2; bell.position.set(0, AY, AZ - 0.065); g.add(bell);
      k.cyl(0.0255, 0.018, 0, AY, AZ - 0.088, M.scopeTube, 'z', 24);                               // objective
      const ep = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.017, 0.03, 24), M.scopeTube); ep.rotation.x = -Math.PI / 2; ep.position.set(0, AY, AZ + 0.064); g.add(ep);
      const cup = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.003, 8, 24), M.grip); cup.position.set(0, AY, AZ + 0.08); g.add(cup);
      k.box(0.03, 0.022, 0.034, 0, AY + 0.008, AZ - 0.005, M.scopeTube);                         // turret housing
      k.cyl(0.0075, 0.012, 0.018, AY + 0.004, AZ - 0.005, M.metal, 'x', 16);                       // windage cap
      k.cyl(0.0075, 0.012, 0, AY + 0.024, AZ - 0.005, M.metal, 'y', 16);                           // elevation cap
      const fib = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.07), cache.mat.acogFiber || (cache.mat.acogFiber = new THREE.MeshBasicMaterial({ color: 0xff3a2a })));
      fib.position.set(0, AY + 0.021, AZ + 0.032); g.add(fib);                                      // fibre-optic illumination strip
      const lensA = new THREE.Mesh(new THREE.CircleGeometry(0.0225, 24), M.lensCoat); lensA.position.set(0, AY, AZ - 0.098); lensA.rotation.y = Math.PI; g.add(lensA);
      const lensB = new THREE.Mesh(new THREE.CircleGeometry(0.016, 24), M.lensCoat); lensB.position.set(0, AY, AZ + 0.08); g.add(lensB);
      const chv = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 3), M.reticle); chv.position.set(0, AY, AZ + 0.0805); chv.rotation.z = Math.PI / 2; g.add(chv);
      k.cyl(0.027, 0.34, 0, BY, -0.35, M.dark, 'z', 14);                                        // perforated shroud
      for (let i = 0; i < 7; i++) for (const a of [0.6, 1.57, 2.54]) k.box(0.012, 0.008, 0.02, Math.cos(a) * 0.026, BY + Math.sin(a) * 0.026, -0.22 - i * 0.045, M.grip);
      k.cyl(0.0125, 0.24, 0, BY, -0.62, M.metal, 'z', 12);
      k.cyl(0.017, 0.06, 0, BY, -0.77, M.dark, 'z', 10);                                        // flash hider
      for (const x of [-0.012, 0.012]) k.box(0.006, 0.006, 0.22, x, 0.006, -0.4, M.metal);       // folded bipod
      k.box(0.026, 0.11, 0.032, 0, -0.04, -0.3, M.grip);                                        // vertical foregrip
      const box = k.box(0.06, 0.12, 0.11, -0.02, -0.075, -0.06, M.dark);                         // ammo box
      const belt = [];
      for (let i = 0; i < 6; i++) belt.push(k.box(0.012, 0.012, 0.03, -0.036 - i * 0.003, 0.0 + i * 0.008, -0.05, M.brass));
      magGroup(g, [box, k.box(0.062, 0.012, 0.112, -0.02, -0.02, -0.06, M.metal)].concat(belt));
      prof([[0.02, -0.01], [0.026, -0.01], [0.028, -0.034], [0.062, -0.036], [0.064, -0.01], [0.07, -0.01], [0.068, -0.044], [0.022, -0.042]], 0.012, M.dark, 0.0015);
      prof([[0.06, -0.006], [0.1, -0.006], [0.122, -0.11], [0.112, -0.122], [0.086, -0.122], [0.078, -0.06], [0.066, -0.03]], 0.04, M.grip, 0.005);
      prof([[0.14, 0.07], [0.36, 0.05], [0.372, 0.045], [0.372, -0.1], [0.33, -0.1], [0.17, -0.02], [0.14, -0.01]], 0.052, S, 0.005);
      k.box(0.054, 0.15, 0.014, 0, -0.025, 0.375, M.grip);
      const sightL = new THREE.Object3D(); sightL.position.set(0, AY, AZ + 0.03); g.add(sightL);
      g.userData.sight = sightL; g.userData.sightDist = 0.36;
      hands(g, [0, -0.075, 0.09], [0, -0.07, -0.3], [0.05, 0.05, -0.05]);
      anchors(g, -0.8, BY, [-0.045, -0.02, 0.16]);
    },
    // DMR: semi-auto marksman rifle. Slim receiver, long slotted free-float handguard, muzzle brake,
    // full-length top rail with a compact prism optic, straight 12-round mag, adjustable stock.
    dmr(g, S, M) {
      const k = kit(g), I = v => v, prof = profiler(g, I, I), BY = 0.045;
      prof([[-0.2, 0.0], [-0.2, 0.075], [0.1, 0.075], [0.12, 0.06], [0.12, 0.0]], 0.054, S, 0.005);
      prof([[-0.52, 0.012], [-0.52, 0.074], [-0.2, 0.074], [-0.2, 0.0], [-0.5, 0.0]], 0.05, M.dark, 0.004);
      for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) k.box(0.002, 0.012, 0.03, sx * 0.0255, 0.038, -0.47 + i * 0.045, M.grip);
      k.box(0.026, 0.008, 0.62, 0, 0.08, -0.2, M.dark);                                          // top rail
      for (let i = 0; i < 18; i++) k.box(0.027, 0.004, 0.006, 0, 0.0855, -0.49 + i * 0.034, M.metal);
      k.cyl(0.011, 0.32, 0, BY, -0.68, M.metal, 'z', 12);
      k.box(0.034, 0.03, 0.05, 0, BY, -0.86, M.dark);                                          // brake
      for (let i = 0; i < 3; i++) k.box(0.036, 0.016, 0.006, 0, BY, -0.845 - i * 0.012, M.grip);
      // compact prism optic
      const OY = 0.128, OZ = -0.07;
      k.box(0.03, 0.02, 0.07, 0, 0.094, OZ, M.dark);
      k.cyl(0.021, 0.12, 0, OY, OZ, M.scopeTube, 'z', 20);
      k.cyl(0.025, 0.03, 0, OY, OZ - 0.07, M.scopeTube, 'z', 20);
      k.cyl(0.023, 0.03, 0, OY, OZ + 0.07, M.scopeTube, 'z', 20);
      k.cyl(0.008, 0.016, 0, OY + 0.025, OZ, M.metal, 'y', 12);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 24), M.lensCoat); lens.position.set(0, OY, OZ - 0.084); g.add(lens);
      const chev = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 3), M.reticle); chev.position.set(0, OY, OZ - 0.082); chev.rotation.z = Math.PI / 2; g.add(chev);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.0085, 0.0095, 40), M.reticle); ring.position.set(0, OY, OZ - 0.082); g.add(ring);
      const sight = new THREE.Object3D(); sight.position.set(0, OY, OZ); g.add(sight);
      g.userData.sight = sight; g.userData.sightDist = 0.4;
      magGroup(g, [prof([[-0.08, 0.0], [-0.03, 0.0], [-0.034, -0.11], [-0.086, -0.104]], 0.034, M.dark, 0.003)]);
      prof([[0.01, 0.0], [0.016, 0.0], [0.018, -0.024], [0.054, -0.026], [0.056, 0.0], [0.062, 0.0], [0.06, -0.034], [0.012, -0.032]], 0.012, M.dark, 0.0015);
      prof([[0.05, 0.004], [0.088, 0.004], [0.11, -0.1], [0.1, -0.112], [0.074, -0.112], [0.066, -0.05], [0.056, -0.022]], 0.04, M.grip, 0.005);
      prof([[0.12, 0.06], [0.33, 0.05], [0.34, 0.045], [0.34, -0.085], [0.3, -0.085], [0.15, -0.012], [0.12, -0.004]], 0.048, S, 0.005);
      k.box(0.04, 0.02, 0.12, 0, 0.068, 0.25, M.grip);                                          // cheek riser
      k.box(0.05, 0.135, 0.014, 0, -0.02, 0.345, M.grip);
      hands(g, [0, -0.075, 0.075], [0, -0.005, -0.36], [0.05, 0.05, 0.02]);
      anchors(g, -0.89, BY, [-0.035, -0.02, 0.15]);
    },
    // Sniper: a heavy long-range bolt-action in desert tan. Ported muzzle brake, fluted
    // heavy barrel, skeletonised handguard with a top rail and a folding bipod, flat-top
    // receiver with a long rail, big scope with a wide ocular bell and turrets, ribbed
    // box mag, rubber pistol grip, and a skeleton stock (tube + cheek rest + tall butt
    // pad) with a rear monopod. Side profiles on a 2D grid, extruded.
    sniper(g, S, M) {
      const k = kit(g);
      const Z = x => -0.9 + (x - 35) * 0.0026, Y = y => 0.04 - (y - 118) * 0.0026;
      const prof = profiler(g, Z, Y), BY = 0.04, SY = 0.13;
      // muzzle brake with side ports
      k.box(0.044, 0.04, Z(62) - Z(33), 0, BY, (Z(33) + Z(62)) / 2, M.dark);
      for (let i = 0; i < 3; i++) k.box(0.046, 0.022, 0.012, 0, BY, Z(38 + i * 8), M.grip);
      // fluted heavy barrel
      k.cyl(0.0165, Z(125) - Z(60), 0, BY, (Z(60) + Z(125)) / 2, M.dark, 'z', 16);
      for (let i = 0; i < 6; i++) { const a2 = i / 6 * Math.PI * 2; k.box(0.004, 0.004, Z(118) - Z(70), Math.cos(a2) * 0.0158, BY + Math.sin(a2) * 0.0158, (Z(70) + Z(118)) / 2, M.grip).rotation.z = a2; }
      // skeleton handguard: tan, rail on top, rows of lightening cut-outs
      prof([[120, 100], [252, 98], [252, 142], [156, 138], [120, 126]], 0.056, S, 0.004);
      for (let i = 0; i < 5; i++) { const x = 140 + i * 21; prof([[x, 118], [x + 13, 118], [x + 16, 124], [x + 13, 130], [x, 130], [x - 3, 124]], 0.0575, M.grip, 0); }
      k.box(0.0605, Y(98) - Y(142), 0.003, 0, (Y(98) + Y(142)) / 2, Z(250), M.grip);   // handguard / receiver seam
      k.box(0.026, 0.008, Z(250) - Z(118), 0, Y(95), (Z(118) + Z(250)) / 2, M.dark);
      for (let i = 0; i < 12; i++) k.box(0.027, 0.004, 0.006, 0, Y(93), Z(124 + i * 11), M.metal);
      k.box(0.022, 0.014, 0.04, -0.02, Y(88), Z(180), M.dark);                    // laser module
      k.cyl(0.005, 0.003, -0.02, Y(88), Z(180) - 0.021, M.reticle, 'z', 8);
      // folding bipod: clamp + two splayed legs with feet
      k.box(0.036, 0.02, 0.036, 0, Y(147), Z(172), M.dark);
      const bipodSteel = cache.mat.bipod || (cache.mat.bipod = new THREE.MeshPhongMaterial({ color: 0x9aa3ad, specular: 0xdde4ea, shininess: 70 }));
      for (const sx of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(sx * 0.016, Y(150), Z(172)); leg.rotation.set(0.85, 0, sx * 0.55); g.add(leg);
        k.box(0.016, 0.016, 0.02, sx * 0.016, Y(150), Z(172), M.dark);                                                        // hinge
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.16, 10), M.dark); up.position.y = -0.08; leg.add(up);
        const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.018, 10), bipodSteel); cl.position.y = -0.16; leg.add(cl);   // lock collar
        const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.15, 10), bipodSteel); lo.position.y = -0.235; leg.add(lo);
        const ft = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), M.grip); ft.scale.y = 0.7; ft.position.y = -0.312; leg.add(ft);
      }
      // receiver + long top rail, ejection port, bolt
      prof([[248, 96], [366, 96], [374, 106], [374, 142], [248, 142]], 0.06, S, 0.004);
      k.box(0.028, 0.01, Z(372) - Z(226), 0, Y(92), (Z(226) + Z(372)) / 2, M.dark);
      for (let i = 0; i < 12; i++) k.box(0.029, 0.004, 0.006, 0, Y(89), Z(232 + i * 12), M.metal);
      k.box(0.002, 0.022, 0.07, 0.0305, Y(112), Z(318), M.grip);
      boltGroup(g, M, BY + 0.012, Z(334), 0.16);
      // scope: front bell, tube, wide ocular bell, turrets, rings + base, dark lenses
      k.cyl(0.028, 0.02, 0, SY, Z(232), M.scopeTube, 'z', 24);
      const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.028, 0.045, 24), M.scopeTube); fb.rotation.x = Math.PI / 2; fb.position.set(0, SY, Z(232) + 0.032); g.add(fb);
      k.cyl(0.0215, Z(352) - Z(252), 0, SY, (Z(252) + Z(352)) / 2, M.scopeTube, 'z', 24);
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.0215, 0.05, 28), M.scopeTube); ob.rotation.x = Math.PI / 2; ob.position.set(0, SY, Z(360)); g.add(ob);
      k.cyl(0.04, 0.05, 0, SY, Z(380), M.scopeTube, 'z', 28);
      k.cyl(0.041, 0.006, 0, SY, Z(392), M.grip, 'z', 28);
      k.cyl(0.026, 0.003, 0, SY, Z(232) - 0.011, M.lensDark, 'z', 24);
      k.cyl(0.037, 0.003, 0, SY, Z(392) + 0.004, M.lensDark, 'z', 28);
      k.cyl(0.011, 0.024, 0, SY + 0.028, Z(300), M.scopeTube, 'y', 16); k.cyl(0.012, 0.006, 0, SY + 0.042, Z(300), M.metal, 'y', 16);
      k.cyl(0.011, 0.024, 0.028, SY, Z(300), M.scopeTube, 'x', 16); k.cyl(0.012, 0.006, 0.042, SY, Z(300), M.metal, 'x', 16);
      k.cyl(0.009, 0.016, -0.026, SY, Z(300), M.scopeTube, 'x', 14);
      for (const x of [268, 334]) { k.box(0.03, 0.03, 0.018, 0, (SY + Y(92)) / 2, Z(x), M.dark); k.cyl(0.0215, 0.016, 0, SY, Z(x), M.dark, 'z', 20); }
      // box mag (ribbed)
      const mag = [prof([[262, 140], [302, 140], [302, 210], [264, 210]], 0.04, M.dark, 0.003)];
      for (let i = 0; i < 5; i++) mag.push(k.box(0.0415, 0.003, Z(300) - Z(266), 0, Y(152 + i * 12), (Z(266) + Z(300)) / 2, M.grip));
      magGroup(g, mag);
      // trigger guard + trigger, rubber pistol grip with finger bumps
      prof([[338, 140], [344, 140], [346, 162], [372, 164], [374, 140], [380, 140], [378, 170], [340, 168]], 0.012, M.dark, 0.0015);
      prof([[356, 142], [362, 142], [364, 152], [359, 160], [356, 158], [358, 152]], 0.006, M.metal, 0.001);
      prof([[372, 138], [404, 138], [420, 204], [412, 216], [390, 216], [384, 196], [380, 180], [384, 166], [376, 156]], 0.04, M.grip, 0.005);
      // skeleton stock: buffer tube, tan cheek rest on two posts, tall rubber butt pad, monopod
      k.cyl(0.013, Z(494) - Z(372), 0, Y(124), (Z(372) + Z(494)) / 2, M.dark, 'z', 14);
      prof([[372, 104], [420, 104], [420, 132], [372, 140]], 0.05, S, 0.003);
      prof([[402, 102], [494, 98], [500, 104], [498, 114], [404, 118]], 0.046, S, 0.005);
      for (const x of [428, 480]) k.cyl(0.006, Y(114) - Y(124), 0, (Y(114) + Y(124)) / 2, Z(x), M.metal, 'y', 8);
      prof([[490, 98], [514, 96], [528, 106], [530, 196], [518, 206], [494, 202], [490, 150]], 0.05, M.grip, 0.005);
      k.cyl(0.0095, Y(166) - Y(252), 0, (Y(166) + Y(252)) / 2, Z(484), M.dark, 'y', 10);
      k.cyl(0.013, 0.02, 0, Y(178), Z(484), M.metal, 'y', 12);
      k.cyl(0.016, 0.008, 0, Y(254), Z(484), M.grip, 'y', 12);
      hands(g, [0, -0.09, Z(394)], [0, -0.015, -0.42], [0.05, BY + 0.012, Z(334) + 0.02]);
      anchors(g, Z(33) - 0.006, BY, [-0.034, -0.02, 0.2]);
    },
    knife(g, S, M, opts) {
      // Karambit, CS-style: a curved "banana" handle with a large finger ring at the
      // butt, a finger guard, and a deeply hooked claw blade with spine notches.
      // Built in the blade plane (x = forward, y = up), then turned so +x points down -Z.
      const k = new THREE.Group();
      const ext = (shape, depth, bevel) => {
        const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14 });
        geo.translate(0, 0, -depth / 2);
        return geo;
      };
      // Blade (v1.15.2): a slender CS-style claw. Built along a centre line that keeps curving
      // harder toward the tip (about 105 degrees in all), tapering steadily from the bolster to a
      // needle point: convex spine outside, concave cutting edge inside, a thin bright grind along
      // the edge and jimping on the spine by the thumb.
      const bladeMat = (opts && opts.blade) || M.blade;
      const bladeG = new THREE.Group(); bladeG.scale.setScalar(1.25); k.add(bladeG);   // 25% bigger blade
      const extS = (shape, depth, bevel, size) => {
        const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: size === undefined ? bevel : size, bevelSegments: 2, curveSegments: 24 });
        geo.translate(0, 0, -depth / 2); return geo;
      };
      const N = 48, LEN = 0.168, cl = [];
      { let x = 0, y = 0; const ds = LEN / N;
        for (let i = 0; i <= N; i++) {
          const t = i / N, th = 0.2 - 2.05 * Math.pow(t, 1.6);              // heading: slightly up, then curling down
          const w = 0.0285 * Math.pow(1 - t, 0.8) * (1 + 0.2 * t) + (i === N ? 0 : 0.0004);   // taper to a needle
          const nx = -Math.sin(th), ny = Math.cos(th);                          // outer (spine) side
          const off = 0.08 * w;                                                 // a touch more steel on the spine side
          cl.push({ x, y, nx, ny, w, sp: [x + nx * (w / 2 + off), y + ny * (w / 2 + off)], ed: [x - nx * (w / 2 - off), y - ny * (w / 2 - off)] });
          x += Math.cos(th) * ds; y += Math.sin(th) * ds;
        } }
      const tip = cl[N];
      const bl = new THREE.Shape();
      bl.moveTo(cl[0].ed[0], cl[0].ed[1]); bl.lineTo(cl[0].sp[0], cl[0].sp[1]);
      for (let i = 1; i < N; i++) bl.lineTo(cl[i].sp[0], cl[i].sp[1]);
      bl.lineTo(tip.x, tip.y);
      for (let i = N - 1; i >= 1; i--) bl.lineTo(cl[i].ed[0], cl[i].ed[1]);
      bl.closePath();
      const bladeMesh = new THREE.Mesh(extS(bl, 0.0028, 0.0011, 0.0006), bladeMat); bladeG.add(bladeMesh); g.userData.bladeMesh = bladeMesh;
      // Bright edge grind: a band along the inner edge, about a third of the blade width, to the tip
      const bev = new THREE.Shape(), g0 = 4;
      bev.moveTo(cl[g0].ed[0], cl[g0].ed[1]);
      for (let i = g0 + 1; i < N; i++) bev.lineTo(cl[i].ed[0], cl[i].ed[1]);
      bev.lineTo(tip.x, tip.y);
      for (let i = N - 1; i >= g0; i--) { const c = cl[i], f = 0.36 * c.w; bev.lineTo(c.ed[0] + c.nx * f, c.ed[1] + c.ny * f); }
      bev.closePath();
      const edgeMat = (opts && opts.blade) ? bladeMat : (cache.mat.kEdge || (cache.mat.kEdge = new THREE.MeshPhongMaterial({ color: 0xf2f6fa, specular: 0xffffff, shininess: 180, side: THREE.DoubleSide })));
      bladeG.add(new THREE.Mesh(extS(bev, 0.0042, 0.0004), edgeMat));
      // Jimping notches on the spine near the bolster
      for (let i = 0; i < 6; i++) {
        const c = cl[3 + i * 2], j = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.003, 0.0058), M.dark);
        j.position.set(c.sp[0] - c.nx * 0.0008, c.sp[1] - c.ny * 0.0008, 0); j.rotation.z = Math.atan2(c.ny, c.nx) - Math.PI / 2; bladeG.add(j);
      }
      // Curved handle with finger grooves and a guard hook (skin material = scales)
      const hd = new THREE.Shape();
      hd.moveTo(0.006, 0.016);
      hd.bezierCurveTo(-0.03, 0.022, -0.07, 0.036, -0.1, 0.058);      // top line sweeping up to the ring
      hd.quadraticCurveTo(-0.113, 0.05, -0.108, 0.036);               // rounded butt
      hd.bezierCurveTo(-0.088, 0.026, -0.076, 0.014, -0.064, 0.012);  // belly
      hd.quadraticCurveTo(-0.055, 0.003, -0.046, 0.007);              // finger groove
      hd.quadraticCurveTo(-0.037, -0.002, -0.027, 0.0);               // finger groove
      hd.quadraticCurveTo(-0.012, -0.004, -0.008, -0.022);            // into the guard
      hd.quadraticCurveTo(-0.002, -0.035, 0.009, -0.031);             // guard hook
      hd.lineTo(0.006, -0.016);
      hd.closePath();
      k.add(new THREE.Mesh(extS(hd, 0.014, 0.003), S));
      // Steel liner showing as an even line all round the scales
      k.add(new THREE.Mesh(extS(hd, 0.004, 0.0002, 0.0016), M.metal));
      // Steel bolster + guard at the blade end
      const bo = new THREE.Shape();
      bo.moveTo(0.008, 0.0165); bo.lineTo(-0.007, 0.0185); bo.lineTo(-0.011, -0.012);
      bo.quadraticCurveTo(-0.004, -0.036, 0.0095, -0.0315); bo.closePath();
      k.add(new THREE.Mesh(extS(bo, 0.017, 0.002), M.metal));
      // Flush pins
      for (const [x, y] of [[-0.03, 0.012], [-0.058, 0.026], [-0.085, 0.042]]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.0205, 12), M.blade); pin.rotation.x = Math.PI / 2; pin.position.set(x, y, 0); k.add(pin);
      }
      // Finger ring at the butt (the deploy flip pivots on its centre)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0066, 16, 40), M.metal);
      ring.position.set(-0.12, 0.066, 0); k.add(ring);
      k.rotation.y = Math.PI / 2;      // +x -> -z
      g.add(k);
      g.userData.blade = k;
      const mid = cl[N >> 1]; g.userData.trailTip = new THREE.Vector3(0, tip.y * 1.25, -tip.x * 1.25); g.userData.trailMid = new THREE.Vector3(0, mid.y * 1.25, -mid.x * 1.25);   // claw tip / mid-blade (model space)
      hands(g, [0, 0.02, 0.05], null, null);
      anchors(g, -0.15, 0, [0, -0.02, 0.12]);
      g.userData.flash.visible = false;
    },
    // Revolver: heavy frame, full-lug barrel with a vent rib, fluted six-shot cylinder on a swing-out
    // crane (userData.crane / userData.cylinder), hammer, wood grip, speedloader as the "mag".
    revolver(g, S, M) {
      const k = kit(g), wood = cache.mat.revWood || (cache.mat.revWood = new THREE.MeshPhongMaterial({ color: 0x6a3f22, specular: 0x553322, shininess: 30 }));
      k.box(0.032, 0.058, 0.11, 0, 0.034, 0.01, S);                       // frame
      k.box(0.026, 0.012, 0.1, 0, 0.068, -0.005, S);                      // top strap
      k.cyl(0.0105, 0.18, 0, 0.05, -0.15, M.metal, 'z', 14);              // barrel
      k.box(0.018, 0.02, 0.17, 0, 0.033, -0.145, S);                      // full under-lug
      k.box(0.012, 0.008, 0.17, 0, 0.064, -0.145, S);                     // vent rib
      for (let i = 0; i < 6; i++) k.box(0.0125, 0.003, 0.012, 0, 0.069, -0.08 - i * 0.022, M.dark);
      k.cyl(0.013, 0.012, 0, 0.05, -0.238, M.dark, 'z', 14);              // muzzle crown
      // crane + cylinder (pivot on the left side so it swings out to the left)
      const crane = new THREE.Group(); crane.position.set(-0.016, 0.022, -0.035); g.add(crane);
      const cyl = new THREE.Group(); cyl.position.set(0.016, 0.02, 0); crane.add(cyl);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.052, 18), S); body.rotation.x = Math.PI / 2; cyl.add(body);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const fl = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.04), M.dark); fl.position.set(Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0); fl.rotation.z = a; cyl.add(fl);
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 10), M.brass); ch.rotation.x = Math.PI / 2; ch.position.set(Math.cos(a + 0.52) * 0.015, Math.sin(a + 0.52) * 0.015, 0.026); cyl.add(ch);
      }
      const ej = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), M.metal); ej.rotation.x = Math.PI / 2; ej.position.set(0, 0, -0.045); cyl.add(ej);
      g.userData.crane = crane; g.userData.cylinder = cyl;
      const ham = k.box(0.008, 0.022, 0.014, 0, 0.074, 0.066, M.dark); ham.rotation.x = -0.5;
      k.box(0.008, 0.008, 0.05, 0, -0.008, -0.01, M.dark); k.box(0.008, 0.026, 0.008, 0, 0.004, -0.035, M.dark);   // trigger guard
      k.box(0.005, 0.022, 0.005, 0, 0.0, -0.01, M.metal);                // trigger
      const gr = k.box(0.03, 0.105, 0.046, 0, -0.035, 0.07, wood, 0.32); void gr;
      k.box(0.032, 0.012, 0.05, 0, -0.088, 0.088, M.dark);               // butt cap
      // speedloader (the "mag" for the reload animation): 6 rounds in a dark ring
      const sl = new THREE.Group(); sl.position.set(0, 0.042, 0.03);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 16), M.dark); ring.rotation.x = Math.PI / 2; sl.add(ring);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.03, 8), M.brass); rd.rotation.x = Math.PI / 2; rd.position.set(Math.cos(a) * 0.015, Math.sin(a) * 0.015, -0.02); sl.add(rd); }
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), M.dark); knob.rotation.x = Math.PI / 2; knob.position.z = 0.014; sl.add(knob);
      const mg = new THREE.Group(); mg.add(sl); g.add(mg); g.userData.mag = mg; sl.visible = false; g.userData.speedloader = sl;
      irons(g, M, 0.082, 0.05, -0.226, false);
      g.userData.sightDist = 0.34;
      hands(g, [0, -0.07, 0.07], [-0.012, -0.09, 0.05], [0, 0.075, 0.066]);
      anchors(g, -0.25, 0.05, [-0.02, -0.07, 0.09]);
    },
    // Butterfly knife (balisong), CS-inspired: clip-point blade with a swedge + kicker, two
    // skeletonized channel handles with cut-outs, pivot pins and a latch. Built upright like a
    // pistol grip (blade up +Y, edge toward -Z, handles down -Y); handles swing about X on the pivot.
    // Closed = handles rotated ±PI over the blade.
    butterfly(g, S, M, opts) {
      const ext = (pts, depth, bevel, holes) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]); }
        sh.closePath();
        for (const h of holes || []) { const pa = new THREE.Path(); pa.absellipse(h[0], h[1], h[2], h[3], 0, Math.PI * 2, false, 0); sh.holes.push(pa); }
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 10 });
        geo.translate(0, 0, -depth / 2);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7);   // textures span the part
        const m = new THREE.Mesh(geo, null); m.rotation.y = -Math.PI / 2;   // shape x -> model Z, shape y -> model Y, thickness -> X
        return m;
      };
      const bladeMat = (opts && opts.blade) || M.blade;
      // blade: shape x = model z (front is negative), shape y = up
      // slim blade with a gentle recurve belly, a clipped point and a long swedge
      const blade = ext([[0.0085, 0.004], [0.0085, 0.09], [0.0085, 0.118, -0.002, 0.138], [-0.0045, 0.142], [-0.0115, 0.11, -0.0095, 0.07], [-0.0118, 0.04, -0.0108, 0.014], [-0.0062, 0.004]], 0.0024, 0.0008);
      blade.material = bladeMat; g.add(blade);
      const swedge = ext([[0.0072, 0.09], [0.0072, 0.114, 0.0, 0.132], [-0.002, 0.13], [0.004, 0.106]], 0.0032, 0);
      swedge.material = M.metal; g.add(swedge);
      // bright edge grind along the cutting edge + a dark fuller groove down the middle
      const edgeM = (opts && opts.blade) ? bladeMat : (cache.mat.bfEdge || (cache.mat.bfEdge = new THREE.MeshPhongMaterial({ color: 0xf4f7fa, specular: 0xffffff, shininess: 190 })));
      const grind = ext([[-0.0118, 0.016], [-0.0108, 0.05, -0.0098, 0.09], [-0.0065, 0.128], [-0.0048, 0.134], [-0.0068, 0.1], [-0.0078, 0.05, -0.0082, 0.018]], 0.0034, 0);
      grind.material = edgeM; g.add(grind);
      const fuller = ext([[0.0025, 0.022], [0.0042, 0.022], [0.0042, 0.078], [0.0025, 0.082]], 0.0031, 0);
      fuller.material = M.dark; g.add(fuller);
      const kick = ext([[-0.006, 0.0], [-0.013, 0.004], [-0.012, 0.014], [-0.006, 0.012]], 0.003, 0.0005); kick.material = M.metal; g.add(kick);
      // handles: pivot groups at the blade tang (pins along X)
      const handle = (side) => {
        const pv = new THREE.Group(); pv.position.set(side * 0.0042, 0.004, 0.001); g.add(pv);
        const h = ext([[-0.0115, 0.004], [0.0115, 0.004], [0.0115, -0.118], [0.0115, -0.13, 0.0, -0.13], [-0.0115, -0.13, -0.0115, -0.118]], 0.0046, 0.0008,
          [[0, -0.026, 0.004, 0.009], [0, -0.05, 0.004, 0.008], [0, -0.073, 0.004, 0.008], [0, -0.097, 0.0035, 0.007]]);
        h.material = S; pv.add(h);
        // chrome rails along both long edges of the handle
        for (const z of [-0.0112, 0.0112]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.0052, 0.118, 0.0016), M.blade); rail.position.set(0, -0.061, z); pv.add(rail); }
        for (const y of [0, -0.12]) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.012, 10), M.metal); pin.rotation.z = Math.PI / 2; pin.position.set(0, y, 0); pv.add(pin); }
        return pv;
      };
      const hA = handle(1), hB = handle(-1);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.006), M.metal); latch.position.set(-0.004, -0.128, 0.0); hB.add(latch);
      g.userData.handleA = hA; g.userData.handleB = hB;
      g.userData.blade = blade;
      g.userData.trailTip = new THREE.Vector3(0, 0.138, -0.003); g.userData.trailMid = new THREE.Vector3(0, 0.085, -0.003);
      hands(g, [0, -0.07, 0.0], null, null);
      anchors(g, 0.14, 0, [0, -0.13, 0]);
      g.userData.flash.visible = false;
    },
    // Bayonet (M9-style, original model): spear/clip-point blade with a saw-tooth spine, wire-cutter
    // slot and fuller, a crossguard with a muzzle ring on the spine side, a ribbed round grip and a
    // slotted pommel. Built upright like the butterfly (blade +Y, edge toward -Z, grip down -Y) so it
    // uses the same hammer-grip fist. All parts sit in userData.inner so the draw can toss and
    // flip the knife while the fist stays put. A camo goes on the BLADE (handle stays black rubber).
    bayonet(g, S, M, opts) {
      const inner = new THREE.Group(); g.add(inner);
      const camo = opts && opts.camo;
      const bladeMat = (opts && opts.blade) || camo || M.blade;
      const handleMat = camo ? (cache.mat.bayGrip || (cache.mat.bayGrip = new THREE.MeshPhongMaterial({ color: 0x17191c, specular: 0x333333, shininess: 18 }))) : S;
      const ext = (pts, depth, bevel, holes) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]); }
        sh.closePath();
        for (const h of holes || []) { const pa = new THREE.Path(); pa.absellipse(h[0], h[1], h[2], h[3], 0, Math.PI * 2, false, 0); sh.holes.push(pa); }
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 12 });
        geo.translate(0, 0, -depth / 2);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
        const m = new THREE.Mesh(geo, null); m.rotation.y = -Math.PI / 2; return m;     // shape x -> model +Z (spine), y -> up
      };
      // blade: straight spine, clipped spear point, gently rising edge; wire-cutter slot near the guard
      const blade = ext([[0.0125, 0.0], [0.0125, 0.112], [0.0125, 0.132, 0.004, 0.152], [-0.0015, 0.163], [-0.011, 0.138, -0.0155, 0.104], [-0.0162, 0.012], [-0.012, 0.0]], 0.0034, 0.0008,
        [[-0.003, 0.03, 0.0035, 0.0085]]);
      blade.material = bladeMat; inner.add(blade);
      const edgeM = (opts && (opts.blade || camo)) ? bladeMat : (cache.mat.bayEdge || (cache.mat.bayEdge = new THREE.MeshPhongMaterial({ color: 0xf2f6fa, specular: 0xffffff, shininess: 200 })));
      const grind = ext([[-0.0162, 0.014], [-0.0158, 0.1], [-0.011, 0.137, -0.0018, 0.161], [-0.0035, 0.152], [-0.0085, 0.13, -0.0112, 0.1], [-0.0118, 0.016]], 0.0044, 0);
      grind.material = edgeM; inner.add(grind);
      const fuller = ext([[0.004, 0.048], [0.0072, 0.05], [0.0072, 0.104], [0.004, 0.1]], 0.0041, 0); fuller.material = M.dark; inner.add(fuller);
      const clip = ext([[0.0125, 0.112], [0.0125, 0.13, 0.004, 0.152], [0.0005, 0.155], [0.0085, 0.124]], 0.0042, 0); clip.material = M.metal; inner.add(clip);
      // saw teeth along the spine
      for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.0036, 0.0036, 0.0036), M.metal); t.rotation.x = Math.PI / 4; t.position.set(0, 0.04 + i * 0.0068, 0.0128); inner.add(t); }
      // ricasso + crossguard; muzzle ring on the spine side
      const ric = new THREE.Mesh(new THREE.BoxGeometry(0.0052, 0.012, 0.03), M.metal); ric.position.set(0, 0.002, -0.001); inner.add(ric);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.0115, 0.0075, 0.052), M.metal); guard.position.set(0, -0.006, -0.002); inner.add(guard);
      const gtip = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), M.metal); gtip.scale.set(0.95, 0.8, 1); gtip.position.set(0, -0.006, -0.028); inner.add(gtip);
      const mring = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0032, 10, 26), M.metal); mring.rotation.y = Math.PI / 2; mring.position.set(0, -0.006, 0.033); inner.add(mring);
      // grip: slightly oval, swelling in the middle, with raised ribs
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0118, 0.104, 18), handleMat); grip.scale.set(0.82, 1, 1.12); grip.position.set(0, -0.064, 0); inner.add(grip);
      const swell = new THREE.Mesh(new THREE.SphereGeometry(0.0134, 16, 10), handleMat); swell.scale.set(0.82, 2.6, 1.12); swell.position.set(0, -0.066, 0); inner.add(swell);
      const ribM = camo ? handleMat : (cache.mat.bayRib || (cache.mat.bayRib = new THREE.MeshLambertMaterial({ color: 0x101113 })));
      for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0128, 0.0013, 6, 22), i % 2 ? ribM : handleMat); r.rotation.x = Math.PI / 2; r.scale.set(0.84, 1.14, 1); r.position.set(0, -0.026 - i * 0.012, 0); inner.add(r); }
      // pommel with a release slot
      const pom = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0142, 0.016, 18), M.metal); pom.scale.set(0.85, 1, 1.15); pom.position.set(0, -0.123, 0); inner.add(pom);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.0145, 0.004, 0.012), M.dark); slot.position.set(0, -0.124, 0.004); inner.add(slot);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.006), M.metal); latch.position.set(0, -0.114, 0.0165); inner.add(latch);
      g.userData.inner = inner; g.userData.blade = blade; g.userData.bayonet = true;
      g.userData.trailTip = new THREE.Vector3(0, 0.158, 0); g.userData.trailMid = new THREE.Vector3(0, 0.1, 0);
      hands(g, [0, -0.07, 0.0], null, null);
      anchors(g, 0.15, 0, [0, -0.13, 0]);
      g.userData.flash.visible = false;
    },
    // v1.13 TRACKER: a tanto-point survival knife (modelled from the reference image). Straight spine with
    // a saw-back near the tip, an angled tanto front, a long fuller, an integral guard whose lower
    // quillon hooks forward round your index finger, and a fat finger-grooved olive rubber handle
    // with two screws, a metal tang strip on the spine side, a flared butt and a lanyard hole.
    // Same layout as the bayonet (blade +Y, edge -Z, grip -Y) so it shares the fist + flip animations.
    tracker(g, S, M, opts) {
      const inner = new THREE.Group(); g.add(inner);
      const camo = opts && opts.camo;
      const bladeMat = (opts && opts.blade) || camo || (cache.mat.trkBlade || (cache.mat.trkBlade = new THREE.MeshPhongMaterial({ color: 0xc9cfd6, specular: 0xffffff, shininess: 150, envMap: envCube(), reflectivity: 0.3 })));
      const rubber = camo ? (cache.mat.trkGrip || (cache.mat.trkGrip = new THREE.MeshPhongMaterial({ color: 0x2c3524, specular: 0x2a2f26, shininess: 12 }))) : S;
      const ext = (pts, depth, bevel, holes, uvk) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]); }
        sh.closePath();
        for (const h of holes || []) { const pa = new THREE.Path(); pa.absellipse(h[0], h[1], h[2], h[3], 0, Math.PI * 2, false, 0); sh.holes.push(pa); }
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 3, curveSegments: 14 });
        geo.translate(0, 0, -depth / 2);
        const uv = geo.attributes.uv, k = uvk || 6; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
        const m = new THREE.Mesh(geo, null); m.rotation.y = -Math.PI / 2; return m;     // shape x -> model +Z (spine), y -> up
      };
      // blade (v1.15.3): a hunting drop point. Straight spine that drops in a long curve to a needle tip
      // near the centre line, a full belly sweeping up into the point, a small sharpening choil.
      // Layers on top: a flat primary grind (its grind line runs from the plunge by the ricasso up into the
      // tip), a bright secondary edge bevel, a swedge along the top of the point, spine jimping, a thumb stud
      // and a maker's etch. (shape x = spine side +, edge side -; y = along the blade)
      const blade = ext([[0.0198, 0.0], [0.0198, 0.092], [0.0196, 0.128, 0.0128, 0.162], [0.0072, 0.178, 0.0035, 0.192], [-0.016, 0.176, -0.0212, 0.128], [-0.0218, 0.03],
        [-0.0218, 0.013], [-0.0168, 0.0115, -0.0172, 0.006], [-0.0178, 0.0], [-0.0146, 0.0]], 0.0034, 0.0006, null, 7);
      blade.material = bladeMat; inner.add(blade);
      const edgeM = (opts && (opts.blade || camo)) ? bladeMat : (cache.mat.trkEdge || (cache.mat.trkEdge = new THREE.MeshPhongMaterial({ color: 0xf4f7fa, specular: 0xffffff, shininess: 220, envMap: envCube(), reflectivity: 0.45 })));
      const grindM = (opts && (opts.blade || camo)) ? bladeMat : (cache.mat.trkGrind || (cache.mat.trkGrind = new THREE.MeshPhongMaterial({ color: 0x9ea7b2, specular: 0xffffff, shininess: 200, envMap: envCube(), reflectivity: 0.5 })));
      const grind = ext([[-0.0218, 0.014], [-0.0218, 0.03], [-0.0212, 0.128], [-0.016, 0.176, 0.003, 0.1905], [-0.0005, 0.12], [-0.0035, 0.03], [-0.0036, 0.016, -0.0218, 0.014]], 0.0042, 0, null, 7);
      grind.material = grindM; inner.add(grind);
      const edgeB = ext([[-0.0219, 0.016], [-0.0213, 0.128], [-0.0162, 0.1765, 0.0034, 0.1915], [-0.0128, 0.171, -0.0179, 0.127], [-0.0186, 0.016]], 0.0049, 0, null, 7);
      edgeB.material = edgeM; inner.add(edgeB);
      const swedge = ext([[0.0198, 0.1], [0.0196, 0.128, 0.0128, 0.162], [0.0072, 0.178, 0.0035, 0.192], [0.0056, 0.176], [0.0118, 0.156, 0.0162, 0.104]], 0.0046, 0, null, 7);
      swedge.material = edgeM; inner.add(swedge);
      // small detail parts are merged per material below (keeps the knife to a few draw calls)
      const det = new THREE.Group(), hdet = new THREE.Group();
      // jimping across the spine by the thumb
      for (let i = 0; i < 7; i++) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.0052, 0.0013, 0.0018), M.dark); j.position.set(0, 0.006 + i * 0.0042, 0.0203); det.add(j); }
      // thumb stud (both sides) with a knurled ring look
      for (const sx of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0029, 0.0032, 0.0026, 14), M.metal); st.rotation.z = Math.PI / 2; st.position.set(sx * 0.0034, 0.024, 0.0118); det.add(st);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.0008, 10), M.dark); cap.rotation.z = Math.PI / 2; cap.position.set(sx * 0.0048, 0.024, 0.0118); det.add(cap);
        // maker's etch: a small chevron + line on the flat
        for (const [y, z, r] of [[0.05, 0.0105, 0.6], [0.05, 0.0075, -0.6], [0.041, 0.009, 0]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.0003, r ? 0.0052 : 0.0068, 0.0005), M.dark); e.position.set(sx * 0.00235, y, z); e.rotation.x = r; det.add(e); }
      }
      inner.add(mergeByMaterial(det));
      // integral guard: a plate across the ricasso, the lower quillon hooking forward round the finger, a pin hole
      const guard = ext([[0.0212, 0.007], [0.0212, -0.004], [0.004, -0.007], [-0.022, -0.008], [-0.034, -0.026], [-0.038, -0.035, -0.045, -0.03], [-0.046, -0.022], [-0.034, -0.004], [-0.024, 0.006], [-0.018, 0.009]], 0.0058, 0.0007, [[0.0095, 0.001, 0.0024, 0.0024], [-0.041, -0.027, 0.0022, 0.0022]], 7);
      guard.material = bladeMat; inner.add(guard);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0074, 10), M.dark); pin.rotation.z = Math.PI / 2; pin.position.set(0, 0.001, 0.0095); inner.add(pin);
      // handle: thick rubber slab with finger grooves on the edge side, a hump for the palm on the spine side,
      // flaring at the butt
      const hnd = ext([[0.0148, -0.004], [0.0158, -0.04, 0.0142, -0.07], [0.0136, -0.098], [0.0172, -0.122], [0.012, -0.134], [-0.012, -0.134], [-0.019, -0.122],
        [-0.0148, -0.108, -0.0172, -0.094], [-0.0122, -0.082, -0.0168, -0.068], [-0.0118, -0.056, -0.0165, -0.043], [-0.012, -0.03, -0.0152, -0.018], [-0.0138, -0.004]], 0.0148, 0.0045, [[-0.004, -0.124, 0.0028, 0.0028]], 5);
      hnd.material = rubber;
      const hg = new THREE.Group(); hg.rotation.x = 0.13; inner.add(hg); hg.add(hnd);          // the grip angles down from the blade like the reference
      // texture panels (slightly darker inset) + two screws per side
      const panelM = cache.mat.trkPanel || (cache.mat.trkPanel = new THREE.MeshLambertMaterial({ color: 0x1f251a }));
      // pivot-style bolster rings at the top of the handle (a turned ring + screw each side)
      for (const sx of [-1, 1]) {
        const rg = new THREE.Mesh(new THREE.TorusGeometry(0.0052, 0.0011, 8, 24), M.metal); rg.rotation.y = Math.PI / 2; rg.position.set(sx * 0.0121, -0.011, 0.0); hdet.add(rg);
        const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0012, 18), bladeMat); cp.rotation.z = Math.PI / 2; cp.position.set(sx * 0.0119, -0.011, 0.0); hdet.add(cp);
        const sl = new THREE.Mesh(new THREE.BoxGeometry(0.0004, 0.0052, 0.0009), M.dark); sl.position.set(sx * 0.0126, -0.011, 0.0); sl.rotation.x = 0.7; hdet.add(sl);
      }
      for (const sx of [-1, 1]) {
        const pn = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.072, 0.0175), camo ? rubber : panelM); pn.position.set(sx * 0.0122, -0.07, 0.0005); hg.add(pn);
        for (const y of [-0.04, -0.104]) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0016, 10), M.dark); sc.rotation.z = Math.PI / 2; sc.position.set(sx * 0.0128, y, 0.004); hdet.add(sc); }
      }
      hg.add(mergeByMaterial(hdet));
      // metal tang visible along the spine side and at the butt
      const tang = new THREE.Mesh(new THREE.BoxGeometry(0.0046, 0.124, 0.0024), bladeMat); tang.position.set(0, -0.066, 0.0168); tang.rotation.x = 0.03; hg.add(tang);
      const butt = new THREE.Mesh(new THREE.BoxGeometry(0.0058, 0.0062, 0.026), bladeMat); butt.position.set(0, -0.137, -0.0015); butt.rotation.x = -0.12; hg.add(butt);
      g.userData.inner = inner; g.userData.blade = blade; g.userData.bayonet = true; g.userData.tracker = true;
      g.userData.trailTip = new THREE.Vector3(0, 0.192, 0.0035); g.userData.trailMid = new THREE.Vector3(0, 0.11, 0);
      hands(g, [0, -0.07, 0.0], null, null);
      anchors(g, 0.16, 0, [0, -0.135, 0]);
      g.userData.flash.visible = false;
    },
  };

  // ------------------------------------------------------------------ imported models (v1.16.3)
  // A .glb dropped in with tools/import_model.py lands in BR.MODEL_DATA[id] (base64). It's parsed here
  // synchronously (tiny built-in glTF reader: positions, normals, UVs, indices; textures decode in the
  // background), turned so the barrel points down -Z, scaled and moved so its grip / foregrip / sights /
  // muzzle sit where the game's hands, ADS and effects expect, and the magazine triangles are split off
  // into their own part so reloads still animate. If the data is missing the procedural model is used.
  // Per-model placement lives in BR.IMPORTED (src/imported.js).
  const IMPORT_CACHE = {}, IMPORT_LOADS = [];
  function parseGLB(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), dv = new DataView(bytes.buffer);
    let off = 12, js = null, bin = null;
    while (off < bytes.length) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), start = off + 8;
      if (type === 0x4E4F534A) js = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len)));
      else if (type === 0x004E4942) bin = bytes.subarray(start, start + len);
      off = start + len;
    }
    const acc = i => {
      const a = js.accessors[i], bv = js.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
      const o = (bv.byteOffset || 0) + (a.byteOffset || 0), T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
      const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT, out = new T(a.count * n), src = new DataView(bin.buffer, bin.byteOffset + o);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
        const at = k * stride + c * T.BYTES_PER_ELEMENT;
        out[k * n + c] = T === Float32Array ? src.getFloat32(at, true) : T === Uint32Array ? src.getUint32(at, true) : T === Uint16Array ? src.getUint16(at, true) : src.getUint8(at);
      }
      return out;
    };
    const img = i => { const im = js.images[js.textures[i].source], bv = js.bufferViews[im.bufferView];
      const url = URL.createObjectURL(new Blob([bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType }));
      let done; IMPORT_LOADS.push(new Promise(r => { done = r; }));
      const t = new THREE.TextureLoader().load(url, done, undefined, done); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const prims = [];
    for (const m of js.meshes) for (const p of m.primitives) {
      const mat = js.materials && js.materials[p.material] || {}, pbr = mat.pbrMetallicRoughness || {};
      prims.push({ pos: acc(p.attributes.POSITION), nor: p.attributes.NORMAL !== undefined ? acc(p.attributes.NORMAL) : null, uv: p.attributes.TEXCOORD_0 !== undefined ? acc(p.attributes.TEXCOORD_0) : null,
        idx: p.indices !== undefined ? acc(p.indices) : null, map: pbr.baseColorTexture ? img(pbr.baseColorTexture.index) : null, normalMap: mat.normalTexture ? img(mat.normalTexture.index) : null,
        color: pbr.baseColorFactor ? new THREE.Color(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]) : null });
    }
    return prims;
  }
  // v1.31: the imported gun sculpts are decimated meshes with noisy normals, so flat faces shade lumpy and
  // edges look chewed. Two passes: a crease-aware Taubin smooth of the positions (shrink-free, only across
  // gentle angles so hard edges stay crisp), then crease-aware normal averaging (smooth panels, sharp corners).
  function smoothSculpt(P) {
    const nv = P.pos.length / 3, idx = P.idx, adj = Array.from({ length: nv }, () => []);
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; adj[a].push(b); adj[b].push(a); }
    const N = P.nor, dot = (a, b) => N[a * 3] * N[b * 3] + N[a * 3 + 1] * N[b * 3 + 1] + N[a * 3 + 2] * N[b * 3 + 2];
    const step = (src, f, lim) => { const out = new Float32Array(src);
      for (let v = 0; v < nv; v++) { let x = 0, y = 0, z = 0, c = 0;
        for (const u of adj[v]) if (dot(u, v) > lim) { x += src[u * 3]; y += src[u * 3 + 1]; z += src[u * 3 + 2]; c++; }
        if (c) { out[v * 3] += f * (x / c - src[v * 3]); out[v * 3 + 1] += f * (y / c - src[v * 3 + 1]); out[v * 3 + 2] += f * (z / c - src[v * 3 + 2]); } }
      return out; };
    let pos = P.pos; for (let i = 0; i < 2; i++) { pos = step(pos, 0.5, 0.82); pos = step(pos, -0.53, 0.82); }
    P.pos = pos;
    let nor = N; for (let i = 0; i < 3; i++) {
      const out = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) { let x = nor[v * 3], y = nor[v * 3 + 1], z = nor[v * 3 + 2];
        for (const u of adj[v]) { const d = nor[u * 3] * nor[v * 3] + nor[u * 3 + 1] * nor[v * 3 + 1] + nor[u * 3 + 2] * nor[v * 3 + 2]; if (d > 0.7) { x += nor[u * 3]; y += nor[u * 3 + 1]; z += nor[u * 3 + 2]; } }
        const l = Math.hypot(x, y, z) || 1; out[v * 3] = x / l; out[v * 3 + 1] = y / l; out[v * 3 + 2] = z / l; }
      nor = out; }
    P.nor = nor;
  }
  function importedParts(id) {
    if (IMPORT_CACHE[id] !== undefined) return IMPORT_CACHE[id];
    const C = BR.IMPORTED && BR.IMPORTED[id], data = BR.MODEL_DATA && C && BR.MODEL_DATA[C.model || id];      // (v1.32: variants reuse another gun's sculpt)
    if (!C || !data) return (IMPORT_CACHE[id] = null);
    try {
      const s = C.scale, [dx, dy, dz] = C.offset, out = [];
      // model -X (muzzle) -> game -Z, model +Z (left side) -> game -X. v1.21 knives: axes 'upright' puts the blade (model -X)
      // up +Y with the edge (model -Y) toward -Z, like the procedural knives; rot (game-space Euler) turns it about pivot.
      const up = C.axes === 'upright', ax = (x, y, z) => up ? [-z, -x, y] : [-z, y, x];
      const R = C.rot ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...C.rot)) : null, pv = C.pivot || [0, 0, 0], tv = new THREE.Vector3();
      const tp = (x, y, z) => { const a = ax(x, y, z); tv.set(a[0] * s, a[1] * s, a[2] * s); if (R) tv.sub(new THREE.Vector3(...pv)).applyMatrix4(R).add(new THREE.Vector3(...pv)); return [tv.x + dx, tv.y + dy, tv.z + dz]; };
      const tn = (x, y, z) => { const a = ax(x, y, z); tv.set(a[0], a[1], a[2]); if (R) tv.applyMatrix4(R); return [tv.x, tv.y, tv.z]; };
      for (const P of parseGLB(data)) {
        if (!P.map && P.idx && P.nor && !C.knife) smoothSculpt(P);     // v1.31: clean up the decimated sculpt (lumpy shading, rough edges)
        const mat = new THREE.MeshPhongMaterial({ map: P.map, normalMap: P.normalMap, color: P.map ? 0xffffff : (P.color || 0x888888), specular: 0x6a6a6a, shininess: C.shininess || 45, envMap: BR.weaponEnv(), reflectivity: C.reflect || 0.12, side: THREE.DoubleSide });
        if (P.normalMap) mat.normalScale.set(1, -1);
        const parts = { body: [], mag: [], pump: [], bolt: [], blade: [], cyl: [], hA: [], hB: [] }, n = P.idx ? P.idx.length : P.pos.length / 3;
        const inB = (B, x, y, z) => B && x >= B.x[0] && x <= B.x[1] && (!B.y || (y >= B.y[0] && y <= B.y[1])) && (!B.z || (z >= B.z[0] && z <= B.z[1]));
        const vi = k => P.idx ? P.idx[k] : k;
        for (let t = 0; t < n; t += 3) {
          const a = vi(t), b = vi(t + 1), c = vi(t + 2), cx = (P.pos[a * 3] + P.pos[b * 3] + P.pos[c * 3]) / 3, cy = (P.pos[a * 3 + 1] + P.pos[b * 3 + 1] + P.pos[c * 3 + 1]) / 3;
          const M = C.magBox, isMag = M && cx >= M.x[0] && cx <= M.x[1] && cy >= M.y[0] && cy <= M.y[1];
          const Pb = C.pumpBox, isPump = Pb && cx >= Pb.x[0] && cx <= Pb.x[1] && cy >= Pb.y[0] && cy <= Pb.y[1];     // v1.18.1 pump-action slide
          const Bb = C.boltBox, cz = (P.pos[a * 3 + 2] + P.pos[b * 3 + 2] + P.pos[c * 3 + 2]) / 3;                  // v1.20 bolt handle (bolt actions)
          const isBolt = Bb && cx >= Bb.x[0] && cx <= Bb.x[1] && cy >= Bb.y[0] && cy <= Bb.y[1] && cz >= Bb.z[0] && cz <= Bb.z[1];
          const HS = C.handleSplit, isH = HS && cx > HS.x;                                                     // v1.21 butterfly handles (two sides)
          (isBolt ? parts.bolt : isPump ? parts.pump : isMag ? parts.mag : inB(C.cylBox, cx, cy, cz) ? parts.cyl : isH ? (cz > HS.z ? parts.hA : parts.hB) : inB(C.bladeBox, cx, cy, cz) ? parts.blade : parts.body).push(a, b, c);
        }
        for (const key of ['body', 'mag', 'pump', 'bolt', 'blade', 'cyl', 'hA', 'hB']) {
          const ids = parts[key]; if (!ids.length) continue;
          const pos = new Float32Array(ids.length * 3), nor = new Float32Array(ids.length * 3), uv = new Float32Array(ids.length * 2);
          ids.forEach((v, i) => {
            const q = tp(P.pos[v * 3], P.pos[v * 3 + 1], P.pos[v * 3 + 2]); pos.set(q, i * 3);
            if (P.nor) nor.set(tn(P.nor[v * 3], P.nor[v * 3 + 1], P.nor[v * 3 + 2]), i * 3);
            if (P.uv) uv.set([P.uv[v * 2], P.uv[v * 2 + 1]], i * 2);
          });
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          if (P.nor) geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else geo.computeVertexNormals();
          // v1.32: untextured sculpts have no UVs, so every camo used to show as one flat colour. Box-map them here in real units
          // (the same density as the procedural guns); parts animate as whole meshes, so the mapping stays put.
          if (!P.uv) { const N = geo.attributes.normal.array, k = 6.5;
            for (let i = 0; i < pos.length / 3; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(N[i * 3]), ay = Math.abs(N[i * 3 + 1]), az = Math.abs(N[i * 3 + 2]);
              if (ax >= ay && ax >= az) { uv[i * 2] = z * k; uv[i * 2 + 1] = y * k; } else if (ay >= az) { uv[i * 2] = z * k; uv[i * 2 + 1] = x * k + 0.31; } else { uv[i * 2] = x * k + 0.57; uv[i * 2 + 1] = y * k; } }
            geo.attributes.uv.needsUpdate = true; geo.userData.boxed = true; }
          geo.computeBoundingSphere(); out.push({ key, geo, mat });
        }
      }
      return (IMPORT_CACHE[id] = out);
    } catch (e) { console.warn('imported model failed', id, e); return (IMPORT_CACHE[id] = null); }
  }
  function importedBuild(id, g, S, M, opts) {
    const parts = importedParts(id); if (!parts) return false;
    const C = BR.IMPORTED[id], def = BR.CONFIG.weapons[id], std = S === cache.mat['default|' + def.color];
    const magMeshes = [], pumpMeshes = [], boltMeshes = [], by = { blade: [], cyl: [], hA: [], hB: [] };
    const bladeMat = (opts && (opts.blade || opts.camo)) || M.blade;           // v1.21 knives: camo / blueprint blade finish
    let textured = false;
    for (const p of parts) {
      // finish: a camo / blueprint body replaces the model's own texture. Untextured models (and ones
      // set to finish: 'factory') wear the game's own worn black factory finish (box-mapped in realPass).
      let mat = std ? p.mat : S;
      if (std && C.finish === 'factory') {                    // keep the model's sculpted detail (normal map), drop its paint
        // v1.31: matte worn finish with real surface texture. Models with their own normal map (the Rifle) keep it on
        // their UVs; untextured sculpts get a box-mapped worn albedo + scratch / grain normal map (realPass maps it).
        const own = !!p.mat.normalMap, key = 'factory:' + id;
        mat = cache.mat[key] || (cache.mat[key] = new THREE.MeshPhongMaterial({ color: 0xffffff, map: wearTex(C.factoryColor || 0x33373d, 'gun'), normalMap: own ? p.mat.normalMap : NRM.scratch(), normalScale: own ? p.mat.normalScale : new THREE.Vector2(0.55, 0.55), specular: 0x3c4148, shininess: 20, specularMap: DETAIL.finish(), envMap: BR.weaponEnv(), reflectivity: 0.035, side: THREE.DoubleSide }));
        cache.mat[key].userData.real = true; if (own) textured = true;
      } else if (std && !p.mat.map) mat = S;
      else if (std) textured = true;
      if (p.key === 'blade') mat = bladeMat;
      const m = new THREE.Mesh(p.geo, mat);
      g.add(m); if (p.key === 'mag') magMeshes.push(m); if (p.key === 'pump') pumpMeshes.push(m); if (p.key === 'bolt') boltMeshes.push(m); if (by[p.key]) by[p.key].push(m);
    }
    // v1.21 revolver: the cylinder swings out on a crane (pivot low on the left) and spins on reloads / every shot
    if (C.cylC && by.cyl.length) {
      const c = C.cylC, crane = new THREE.Group(); crane.position.set(c[0] - 0.016, c[1] - 0.02, c[2]); g.add(crane);
      const cyl = new THREE.Group(); cyl.position.set(0.016, 0.02, 0); crane.add(cyl); crane.updateMatrixWorld(true);
      for (const m of by.cyl) cyl.attach(m);
      g.userData.crane = crane; g.userData.cylinder = cyl;
      const sl = new THREE.Group(); sl.position.set(0, 0.042, 0.03);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 16), M.dark); ring.rotation.x = Math.PI / 2; sl.add(ring);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.03, 8), M.brass); rd.rotation.x = Math.PI / 2; rd.position.set(Math.cos(a) * 0.015, Math.sin(a) * 0.015, -0.02); sl.add(rd); }
      const mg = new THREE.Group(); mg.add(sl); g.add(mg); g.userData.mag = mg; sl.visible = false; g.userData.speedloader = sl;
    }
    // v1.21 knives, laid out like the procedural ones so every pose, flip and twirl still fits
    if (C.knife) {
      const bv = [], v = new THREE.Vector3();
      for (const m of by.blade) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i += 3) bv.push(v.fromBufferAttribute(P, i).clone()); }
      let tip = new THREE.Vector3(0, 0.15, 0), tl = -1; for (const q of bv) if (q.length() > tl) { tl = q.length(); tip = q; }     // (v1.23: the real blade tip, not a fixed 15 cm floor)
      let mid = tip.clone().multiplyScalar(0.55), best = 1e9; for (const q of bv) { const d = Math.abs(q.length() - tip.length() * 0.55); if (d < best) { best = d; mid = q; } }
      g.userData.trailTip = tip.clone(); g.userData.trailMid = mid.clone(); if (by.blade[0]) g.userData.bladeMesh = by.blade[0];     // (blueprint auras hug this mesh)
      if (C.knife === 'baylike' || C.knife === 'karambit') {
        const inner = new THREE.Group(); g.add(inner); for (const m of g.children.slice()) if (m.isMesh) inner.attach(m);
        g.userData.blade = C.knife === 'baylike' ? (by.blade[0] || inner) : inner;      // (the blade mesh: camo / blueprint checks read its material)
        g.userData.trailSpace = inner;                                            // v1.23: the trail follows the blade through flips
        if (C.knife === 'baylike') { g.userData.inner = inner; g.userData.bayonet = true; if (id === 'tracker') g.userData.tracker = true; }
      } else if (C.knife === 'butterfly') {
        const mk = (list, at) => { const h = new THREE.Group(); h.position.set(...at); g.add(h); h.updateMatrixWorld(true); for (const m of list) h.attach(m); return h; };
        g.userData.handleA = mk(by.hA, C.hinge); g.userData.handleB = mk(by.hB, C.hinge);
        g.userData.blade = by.blade[0] || g;
      }
    }
    if (magMeshes.length) magGroup(g, magMeshes);
    if (pumpMeshes.length) { const pg = new THREE.Group(); g.add(pg); for (const m of pumpMeshes) pg.attach(m); g.userData.pump = pg; }   // slides back after each shot
    if (boltMeshes.length && C.bolt) {                         // v1.20: the bolt handle lifts + pulls back after each shot (the viewmodel's bolt cycle)
      const bg = new THREE.Group(); bg.position.set(...C.bolt.pivot); g.add(bg); for (const m of boltMeshes) bg.attach(m);
      g.userData.bolt = bg; g.userData.boltKnob = new THREE.Vector3(...C.bolt.knob); g.userData.boltZ0 = C.bolt.pivot[2];
    }
    g.userData.importedTextured = textured;
    // holographic sight (v1.18): clear glass + the ring-and-dot reticle inside the model's own sight window
    if (C.holo) {
      const H = C.holo, glass = new THREE.Mesh(new THREE.PlaneGeometry(H.w, H.h), M.lens); glass.position.set(0, H.y, H.z); g.add(glass);
      const ret = new THREE.Group(); ret.position.set(0, H.y, H.z + 0.002); g.add(ret);
      ret.add(new THREE.Mesh(new THREE.RingGeometry(0.0064, 0.0072, 64), M.reticle));
      ret.add(new THREE.Mesh(new THREE.RingGeometry(0.0059, 0.0077, 64), M.dotHalo2));
      ret.add(new THREE.Mesh(new THREE.CircleGeometry(0.0011, 16), M.reticle));
      const hh = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 16), M.dotHalo); hh.position.z = -0.0002; ret.add(hh);
      for (const o of [glass, ret]) o.userData.noUV = true;
      g.userData.holoReticle = ret;
    }
    // aim point: the model's own iron sights; a small dot on the front post helps line it up
    if (C.sight) { const sg = new THREE.Object3D(); sg.position.set(0, C.sight.y, C.sight.rearZ); g.add(sg);
    g.userData.sight = sg; g.userData.sightDist = C.sight.dist; }
    if (C.sight && C.sight.frontZ !== undefined && !C.holo && !C.sight.noDot) { const dot = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.0035), M.sightDot); dot.position.set(0, C.sight.y - 0.0035, C.sight.frontZ); g.add(dot); }
    hands(g, C.grip, C.fore || null, C.charge || null);
    anchors(g, C.muzzle[1], C.muzzle[0], C.charm);
    if (C.knife) g.userData.flash.visible = false;
    if (C.kScale) g.userData.kScale = C.kScale;
    // v1.20: the shell-loading point (shotguns load one shell at a time through it). Missing on the imported
    // Breacher in v1.18.1, which broke every frame of its reload (the game froze until the reload ended).
    if (C.port || def.shellReload) g.userData.port = new THREE.Vector3(...(C.port || [0, C.grip[1] + 0.03, C.grip[2] - 0.15]));
    g.userData.imported = id;
    return true;
  }
  const PROC = {};                                           // v1.23: the original procedural builders (blueprint fitting reference)
  for (const id of Object.keys(BR.IMPORTED || {})) {
    const proc = BUILD[id]; if (!proc) continue; PROC[id] = proc;
    BUILD[id] = (g, S, M, opts) => importedBuild(id, g, S, M, opts) || proc(g, S, M, opts);
  }
  // v1.32 new guns, built on the original procedural models (each with its own parts on top)
  const variant = (id, base, extra) => (g, S, M, o) => { if (importedBuild(id, g, S, M, o)) extra(g, kit(g), M, profiler(g, v => v, v => v)); else PROC[base](g, S, M, o); };
  const disc = (g, r, t, mat, x, y, z, ax, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, seg || 18), mat); m.position.set(x, y, z); if (ax === 'z') m.rotation.x = Math.PI / 2; else if (ax === 'x') m.rotation.z = Math.PI / 2; g.add(m); return m; };
  const torus = (g, r, t, mat, x, y, z, ry, rx) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 20), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); g.add(m); return m; };
  const shellAt = (g, M, x, y, z, ax, len) => { len = len || 0.05;                 // a 12-gauge shell: ribbed red hull, brass head with a rim, a primer
    const hull = disc(g, 0.0092, len, M.shell, x, y, z, ax, 14), d = ax === 'z' ? [0, 0, 1] : ax === 'x' ? [1, 0, 0] : [0, 1, 0], h = len / 2;
    disc(g, 0.0096, 0.012, M.brass, x + d[0] * (h + 0.004), y + d[1] * (h + 0.004), z + d[2] * (h + 0.004), ax, 14);
    disc(g, 0.0104, 0.002, M.brass, x + d[0] * (h + 0.011), y + d[1] * (h + 0.011), z + d[2] * (h + 0.011), ax, 14);
    disc(g, 0.0028, 0.0015, M.metal, x + d[0] * (h + 0.0125), y + d[1] * (h + 0.0125), z + d[2] * (h + 0.0125), ax, 8);
    for (let i = 0; i < 3; i++) { const q = -h + 0.01 + i * 0.012; disc(g, 0.0094, 0.0016, M.grip, x + d[0] * q, y + d[1] * q, z + d[2] * q, ax, 14); }
    return hull; };
  // Talon: a ribbed angled foregrip on a rail clamp, a flip-to-side 3x magnifier (knurled rings, coated glass,
  // mount + lever), a burst selector plate and a QD sling cup
  BUILD.burst = variant('burst', 'holoar', (g, k, M, prof) => {
    prof([[-0.372, -0.012], [-0.312, -0.012], [-0.322, -0.03], [-0.346, -0.072], [-0.36, -0.074], [-0.37, -0.062], [-0.364, -0.03]], 0.026, M.grip, 0.004);     // angled grip body
    for (let i = 0; i < 4; i++) k.box(0.0275, 0.003, 0.004, 0, -0.038 - i * 0.009, -0.345 + i * 0.004, M.dark);        // finger ridges
    k.box(0.03, 0.01, 0.07, 0, -0.008, -0.342, M.dark); for (const sx of [-1, 1]) k.box(0.003, 0.006, 0.02, sx * 0.016, -0.008, -0.33, M.metal);   // clamp + screws
    const mg = new THREE.Group(); mg.position.set(-0.04, 0.125, 0.012); mg.rotation.z = 0.62; g.add(mg); const mk = kit(mg);
    disc(mg, 0.0175, 0.075, M.scopeTube, 0, 0.024, 0, 'z', 22);
    for (const z of [-0.03, 0.03]) disc(mg, 0.0192, 0.008, M.knurl, 0, 0.024, z, 'z', 22);
    disc(mg, 0.0152, 0.002, M.lensDark, 0, 0.024, -0.0375, 'z', 22); disc(mg, 0.0152, 0.002, M.lensCoat, 0, 0.024, -0.0385, 'z', 22); disc(mg, 0.013, 0.002, M.lensDark, 0, 0.024, 0.0375, 'z', 22);
    mk.box(0.026, 0.012, 0.04, 0, 0.002, 0, M.dark); mk.box(0.03, 0.006, 0.05, 0, -0.008, 0, M.dark); mk.box(0.004, 0.018, 0.008, 0.016, 0.004, 0.012, M.metal);   // flip mount + lever
    k.box(0.003, 0.014, 0.02, 0.031, -0.015, 0.03, M.metal); disc(g, 0.004, 0.004, M.dark, 0.033, -0.015, 0.03, 'x', 10);                  // burst selector
    disc(g, 0.007, 0.006, M.metal, -0.03, -0.01, 0.17, 'x', 14); disc(g, 0.004, 0.0065, M.grip, -0.03, -0.01, 0.17, 'x', 10);               // QD sling cup
  });
  // Riot: a ribbed 8-shell drum (windowed so you see the brass), front plate with bolts, a winding key + latch,
  // a neck block into the receiver, and a sling loop. The whole drum comes off on reloads.
  BUILD.riot = variant('riot', 'shotgun', (g, k, M) => {
    const D = new THREE.Group(); D.position.set(0, -0.11, -0.075); D.scale.setScalar(1.12); g.add(D); const dk = kit(D);
    disc(D, 0.062, 0.07, M.dark, 0, 0, 0, 'x', 32);
    for (const x of [-0.03, -0.012, 0.012, 0.03]) disc(D, 0.0645, 0.005, M.metal, x, 0, 0, 'x', 32);                       // ribs
    for (const sx of [-1, 1]) {
      disc(D, 0.055, 0.004, M.grip, sx * 0.036, 0, 0, 'x', 32);                                                            // side plates
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; disc(D, 0.0035, 0.004, M.metal, sx * 0.039, Math.cos(a) * 0.046, Math.sin(a) * 0.046, 'x', 8); }   // bolts
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; disc(D, 0.0096, 0.004, M.brass, sx * 0.037, Math.cos(a) * 0.03, Math.sin(a) * 0.03, 'x', 12); disc(D, 0.0028, 0.0045, M.metal, sx * 0.0372, Math.cos(a) * 0.03, Math.sin(a) * 0.03, 'x', 8); }   // shell heads in the windows
    disc(D, 0.012, 0.012, M.knurl, 0.044, 0, 0, 'x', 16); dk.box(0.004, 0.03, 0.006, 0.051, 0, 0, M.metal);                // winding key
    dk.box(0.03, 0.05, 0.052, 0, 0.055, 0, M.dark); dk.box(0.034, 0.008, 0.056, 0, 0.034, 0, M.metal); dk.box(0.012, 0.012, 0.02, 0, 0.03, -0.035, M.metal);   // neck + latch
    if (g.userData.mag) g.userData.mag.attach(D); else magGroup(g, [D]);
    torus(g, 0.01, 0.0022, M.metal, 0.03, -0.02, 0.2, Math.PI / 2);                                                       // sling loop
  });
  // Hornet: a folding wire stock (hinge block with a hex bolt, two rods, a ribbed rubber butt pad), a finger-grooved
  // vertical foregrip on a rail clamp, and a laser module with a glowing emitter
  BUILD.mpistol = variant('mpistol', 'pistol', (g, k, M, prof) => {
    k.box(0.03, 0.026, 0.024, 0, -0.014, 0.048, M.dark); disc(g, 0.006, 0.032, M.metal, 0, -0.014, 0.048, 'x', 6);
    for (const x of [-0.014, 0.014]) disc(g, 0.0034, 0.14, M.metal, x, -0.016, 0.125, 'z', 10);
    prof([[0.19, 0.03], [0.205, 0.03], [0.208, -0.09], [0.19, -0.094], [0.186, -0.03]], 0.044, M.grip, 0.004);               // butt plate
    for (let i = 0; i < 5; i++) k.box(0.046, 0.003, 0.004, 0, 0.018 - i * 0.024, 0.209, M.dark);                             // pad ribs
    k.box(0.036, 0.012, 0.024, 0, -0.016, 0.188, M.dark);
    k.box(0.026, 0.012, 0.042, 0, 0.012, -0.12, M.dark); for (const sx of [-1, 1]) k.box(0.003, 0.005, 0.01, sx * 0.0145, 0.012, -0.11, M.metal);
    prof([[-0.132, 0.008], [-0.108, 0.008], [-0.108, -0.04], [-0.112, -0.046], [-0.13, -0.046], [-0.134, -0.04]], 0.024, M.grip, 0.004);
    for (let i = 0; i < 3; i++) k.box(0.0255, 0.004, 0.006, 0, -0.006 - i * 0.013, -0.133, M.dark);                          // finger grooves
    k.box(0.018, 0.014, 0.04, 0.02, 0.03, -0.12, M.dark); disc(g, 0.0035, 0.003, cache.mat.laser || (cache.mat.laser = new THREE.MeshBasicMaterial({ color: 0xff2236 })), 0.02, 0.03, -0.1415, 'z', 10);   // laser
  });
  // v1.32.1 Pump Action: a fully procedural classic pump gun. Machined steel receiver with milled side panels, a
  // shell in the ejection port, rail + ghost-ring sights, a perforated heat shield, breacher teeth, a knurled tube
  // cap, a barrel clamp with a sling loop, a deep-grooved walnut pump on action bars, a 6-shell side-saddle, a
  // checkered walnut pistol-grip stock with a ribbed recoil pad and a sling stud.
  // deep oiled walnut: dark heartwood, flowing grain with darker streaks and a little figure, a satin sheen
  const walnut = () => cache.mat.walnut || (cache.mat.walnut = new THREE.MeshPhongMaterial({ specular: 0x5a3a24, shininess: 55, envMap: envCube(), reflectivity: 0.07,
    normalMap: NRM.scratch(), normalScale: new THREE.Vector2(0.25, 0.25),
    map: canvasTex('walnut', (c, S) => { const R = BR.util.rng(4411); c.fillStyle = '#3e1f0f'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 140; i++) { const y0 = R() * S, amp = 2 + R() * 6, f = 0.01 + R() * 0.02, ph = R() * 6, w = 0.6 + R() * 2.2;
        c.strokeStyle = R() < 0.55 ? `rgba(${120 + R() * 40 | 0},${62 + R() * 22 | 0},${28 + R() * 12 | 0},${0.18 + R() * 0.3})` : `rgba(18,8,3,${0.2 + R() * 0.35})`; c.lineWidth = w;
        c.beginPath(); for (let x = 0; x <= S; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      for (let i = 0; i < 9; i++) { const x = R() * S, y = R() * S, r = 10 + R() * 26, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(20,9,3,0.45)'); g.addColorStop(1, 'rgba(20,9,3,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < 900; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,220,180,0.05)' : 'rgba(0,0,0,0.12)'; c.fillRect(R() * S, R() * S, 1 + R() * 3, 1); } }, 512) }));
  BUILD.pump = (g, S, M) => {
    const k = kit(g), I = v => v, prof = profiler(g, I, I), BY = 0.05;
    const std = S === cache.mat['default|' + BR.CONFIG.weapons.pump.color], wood = std ? walnut() : S;
    prof([[-0.2, -0.008], [-0.2, 0.07], [-0.188, 0.082], [0.018, 0.082], [0.048, 0.07], [0.064, 0.042], [0.064, -0.008]], 0.052, S, 0.006);
    for (const sx of [-1, 1]) prof([[-0.184, 0.006], [-0.184, 0.058], [-0.174, 0.066], [-0.03, 0.066], [-0.03, 0.006]], 0.0016, M.dark, 0.0004, sx * 0.0266);
    k.box(0.003, 0.026, 0.07, 0.0272, 0.044, -0.085, M.grip); k.box(0.003, 0.018, 0.05, 0.0276, 0.044, -0.068, M.metal);
    shellAt(g, M, 0.019, 0.045, -0.1, 'z', 0.04);
    k.box(0.032, 0.003, 0.085, 0, -0.0095, -0.07, M.grip); k.box(0.024, 0.002, 0.06, 0, -0.0075, -0.07, M.metal);
    for (const z of [-0.025, 0.035]) { disc(g, 0.0042, 0.056, M.metal, 0, 0.012, z, 'x', 10); for (const sx of [-1, 1]) disc(g, 0.0055, 0.0015, M.dark, sx * 0.028, 0.012, z, 'x', 10); }
    k.box(0.005, 0.007, 0.018, -0.0275, 0.004, 0.047, M.metal); disc(g, 0.0045, 0.06, M.dark, 0, -0.0015, 0.052, 'x', 10);
    k.box(0.022, 0.008, 0.17, 0, 0.0875, -0.075, M.dark); for (let i = 0; i < 9; i++) k.box(0.0245, 0.0045, 0.006, 0, 0.0925, -0.148 + i * 0.019, M.dark);
    // barrel, crown with breacher teeth, heat shield with perforations, front post with a fibre bead
    disc(g, 0.0145, 0.47, S, 0, BY, -0.435, 'z', 22); disc(g, 0.0162, 0.016, M.dark, 0, BY, -0.668, 'z', 22);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, t = k.box(0.006, 0.006, 0.014, Math.cos(a) * 0.0135, BY + Math.sin(a) * 0.0135, -0.682, M.dark); t.rotation.z = a; }
    const hsm = cache.mat.hsDark || (cache.mat.hsDark = (() => { const m = M.dark.clone(); m.side = THREE.DoubleSide; return m; })());
    const hs = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.3, 24, 1, true, Math.PI * 0.55, Math.PI * 0.9), hsm); hs.rotation.x = Math.PI / 2; hs.position.set(0, BY, -0.37); g.add(hs);
    for (let i = 0; i < 9; i++) for (const a of [-0.55, 0, 0.55]) { const h = disc(g, 0.004, 0.003, M.grip, Math.sin(a) * 0.021, BY + Math.cos(a) * 0.021, -0.25 - i * 0.03, 'y', 10); h.rotation.z = -a; }
    for (const z of [-0.226, -0.514]) disc(g, 0.0215, 0.008, M.dark, 0, BY, z, 'z', 22);
    k.box(0.006, 0.022, 0.012, 0, 0.074, -0.648, M.dark);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 10, 8), cache.mat.sgBead || (cache.mat.sgBead = new THREE.MeshBasicMaterial({ color: 0x5dff6a }))); bead.position.set(0, 0.088, -0.648); g.add(bead);
    // magazine tube + knurled cap, barrel clamp with a sling loop
    disc(g, 0.0118, 0.42, M.dark, 0, 0.016, -0.41, 'z', 16); disc(g, 0.0134, 0.028, M.knurl, 0, 0.016, -0.634, 'z', 18); disc(g, 0.0095, 0.004, M.metal, 0, 0.016, -0.65, 'z', 16);
    k.box(0.034, 0.056, 0.018, 0, 0.033, -0.59, M.dark); disc(g, 0.004, 0.038, M.metal, 0, 0.033, -0.59, 'x', 8); torus(g, 0.009, 0.0018, M.metal, 0, 0.004, -0.59, 0, Math.PI / 2);
    // pump: walnut forend, deep grooves wrapping round, a finger stop at the front, on two action bars
    const pump = new THREE.Group(); g.add(pump); const fe = profiler(pump, I, I);
    fe([[-0.452, 0.006], [-0.458, -0.02, -0.44, -0.022], [-0.34, -0.014, -0.25, -0.018], [-0.232, -0.016, -0.23, -0.002], [-0.23, 0.03], [-0.232, 0.042, -0.246, 0.042], [-0.432, 0.042], [-0.452, 0.04, -0.452, 0.026]], 0.054, wood, 0.01);
    for (let i = 0; i < 9; i++) { const z = -0.418 + i * 0.019; const r = new THREE.Mesh(new THREE.BoxGeometry(0.0545, 0.004, 0.005), M.grip); r.position.set(0, -0.0165, z); pump.add(r);
      for (const sx of [-1, 1]) { const sr = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.034, 0.005), M.grip); sr.position.set(sx * 0.0275, 0.011, z); pump.add(sr); } }
    for (const sx of [-1, 1]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.21), M.metal); bar.position.set(sx * 0.016, 0.004, -0.14); pump.add(bar); }
    g.userData.pump = pump;
    // trigger guard + curved trigger
    prof([[-0.002, -0.008], [0.006, -0.008], [0.008, -0.03], [0.05, -0.032], [0.052, -0.008], [0.06, -0.008], [0.058, -0.042], [0.002, -0.04]], 0.012, M.dark, 0.0015);
    prof([[0.022, -0.006], [0.028, -0.006], [0.031, -0.017], [0.027, -0.029], [0.022, -0.027], [0.025, -0.017]], 0.006, M.metal, 0.001);
    // side-saddle: plate on the left of the receiver with 6 shells standing in it
    k.box(0.004, 0.034, 0.12, -0.03, 0.034, -0.1, M.dark); k.box(0.006, 0.006, 0.12, -0.032, 0.054, -0.1, M.grip);
    for (let i = 0; i < 6; i++) shellAt(g, M, -0.042, 0.03, -0.152 + i * 0.021, 'y', 0.046);
    // walnut pistol-grip stock with checkering panels, a ribbed recoil pad, a sling stud
    prof([[0.056, 0.062], [0.1, 0.054, 0.16, 0.038], [0.34, 0.028], [0.356, 0.028, 0.356, 0.012], [0.36, -0.118], [0.36, -0.132, 0.344, -0.132], [0.24, -0.1, 0.17, -0.058],
      [0.15, -0.05, 0.142, -0.07], [0.136, -0.1, 0.112, -0.102], [0.094, -0.104, 0.088, -0.086], [0.082, -0.05, 0.07, -0.016], [0.062, -0.008, 0.056, -0.008]], 0.044, wood, 0.01);
    for (const sx of [-1, 1]) { prof([[0.09, -0.022], [0.114, -0.03], [0.128, -0.084], [0.102, -0.088]], 0.0012, M.knurl, 0, sx * 0.0222); }
    prof([[0.354, 0.03], [0.376, 0.03, 0.378, 0.016], [0.38, -0.126], [0.378, -0.136, 0.356, -0.136]], 0.048, M.grip, 0.004);
    for (let i = 0; i < 6; i++) k.box(0.0495, 0.0025, 0.004, 0, 0.014 - i * 0.026, 0.3795, M.dark);
    k.box(0.0485, 0.004, 0.003, 0, -0.05, 0.3555, M.metal);
    for (const sx of [-1, 1]) { k.box(0.0006, 0.002, 0.15, sx * 0.0268, 0.072, -0.11, M.metal); k.box(0.0006, 0.002, 0.15, sx * 0.0268, 0.0, -0.11, M.metal); disc(g, 0.004, 0.0012, M.metal, sx * 0.0268, 0.036, 0.04, 'x', 10); }      // machined accent lines + takedown screw
    torus(g, 0.009, 0.0018, M.metal, 0, -0.11, 0.29, 0, Math.PI / 2); disc(g, 0.004, 0.012, M.metal, 0, -0.1, 0.29, 'y', 8);
    hands(g, [0, -0.06, 0.088], [0, -0.03, -0.33], null);
    g.userData.port = new THREE.Vector3(0, -0.02, -0.07);
    k.box(0.03, 0.018, 0.024, 0, 0.098, 0.008, M.dark);
    irons(g, M, 0.116, 0.008, -0.648, true);
    g.userData.sightDist = 0.26;
    anchors(g, -0.69, BY, [-0.03, -0.02, 0.1]);
  };

  // ------------------------------------------------------------------ charms
  function charm(id) {
    const g = new THREE.Group();
    if (!id || id === 'none') return g;
    const M = MAT();
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.004), M.metal);
    chain.position.y = -0.02; g.add(chain);
    let o;
    const at = (m) => { m.position.y = -0.055; g.add(m); return m; };
    switch (id) {
      case 'dice': {
        o = at(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.026), new THREE.MeshLambertMaterial({ color: 0xf4f4f0 })));
        const pip = new THREE.MeshBasicMaterial({ color: 0xc8102e });
        for (const [x, y] of [[0, 0], [0.007, 0.007], [-0.007, -0.007]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.002), pip); p.position.set(x, y, 0.014); o.add(p); }
        break;
      }
      case 'coin': o = at(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.005, 16), M.brass)); o.rotation.x = Math.PI / 2; break;
      case 'skull': {
        o = at(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.024), new THREE.MeshLambertMaterial({ color: 0xe8e2d0 })));
        const eye = new THREE.MeshBasicMaterial({ color: 0x111111 });
        for (const x of [-0.006, 0.006]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.002), eye); e.position.set(x, 0.003, 0.013); o.add(e); }
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.02), new THREE.MeshLambertMaterial({ color: 0xd6cfba })); jaw.position.y = -0.016; o.add(jaw);
        break;
      }
      case 'star': o = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), new THREE.MeshPhongMaterial({ color: 0xffd23f, emissive: 0x553300, shininess: 80 }))); break;
      case 'crystal': o = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), new THREE.MeshLambertMaterial({ color: 0x40e0ff, emissive: 0x0090c0 }))); o.scale.y = 1.8; break;
      case 'cube': {
        o = at(new THREE.Group());
        const cols = [0xff3b3b, 0x3bff6b, 0x3b8bff, 0xffe23b];
        for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshLambertMaterial({ color: cols[i % 4] })); c.position.set((i & 1 ? 1 : -1) * 0.0065, (i & 2 ? 1 : -1) * 0.0065, (i & 4 ? 1 : -1) * 0.0065); o.add(c); }
        break;
      }
    }
    g.userData.spin = o;
    return g;
  }

  // One merged, vertex-colored geometry per weapon: a single draw call for world
  // models (loot on the ground, guns in bots' hands).
  const mergedCache = {};
  // average colour of a (canvas) texture, cached: lets the one-draw-call world models carry camo tints
  const avgCache = {};
  function texAvg(tex) {
    const img = tex && tex.image; if (!img || !img.getContext && !(img instanceof HTMLImageElement)) return null;
    const k = tex.uuid; if (avgCache[k]) return avgCache[k];
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 8; const x = cv.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      return (avgCache[k] = new THREE.Color(r / 16320, gg / 16320, b / 16320));
    } catch (e) { return null; }
  }
  // One merged, vertex-coloured mesh per weapon (+ optional blueprint / camo): one draw call in the world
  function merged(id, bpId, skin) {
    const key = id + '|' + (bpId || 'default') + '|' + (skin || 'default');
    if (mergedCache[key]) return mergedCache[key];
    let g = new THREE.Group();
    const def = BR.CONFIG.weapons[id];
    if ((bpId && bpId !== 'default') || (skin && skin !== 'default')) g = BR.Models.weapon(id, skin || 'default', 'none', bpId);
    else (BUILD[id] || BUILD.pistol)(g, skinMaterial('default', def.color), MAT());
    g.updateMatrixWorld(true);
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    g.traverse(o => {
      if (!o.isMesh || o === g.userData.flash || o.userData.isFlash) return;
      const mat = o.material;
      if (mat.transparent && mat.opacity < 0.5) return;           // skip holo glass
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      c.copy(mat.color || new THREE.Color(0x888888));
      const tav = mat.map ? texAvg(mat.map) : mat.emissiveMap ? texAvg(mat.emissiveMap) : null;
      if (tav) c.multiply(tav);
      if (mat.isMeshBasicMaterial === false && mat.emissive && mat.emissiveIntensity > 0.5 && !mat.map) c.lerp(mat.emissive, 0.5);
      const p = geo.attributes.position, n = geo.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        col.push(c.r, c.g, c.b);
      }
    });
    let out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (pos.length / 9 > 2500) out = clusterSimplify(out, 0.0085);       // v1.25: guns in other players' hands / on the ground: ~1/8 the triangles
    out.computeBoundingSphere();
    out._shared = true;
    return (mergedCache[key] = out);
  }
  let mergedMat = null;
  // v1.25: vertex-clustering simplification for the world (3rd-person) gun meshes: snap every vertex to a grid cell,
  // average the cell, drop the triangles that collapse. Keeps the silhouette and colours at a fraction of the cost.
  function clusterSimplify(geo, cell) {
    const P = geo.attributes.position, Cc = geo.attributes.color, n = P.count, map = new Map(), cid = new Int32Array(n);
    const acc = [];
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
      let j = map.get(k); if (j === undefined) { j = acc.length; map.set(k, j); acc.push([0, 0, 0, 0, 0, 0, 0]); }
      const a = acc[j]; a[0] += x; a[1] += y; a[2] += z; a[3] += Cc.getX(i); a[4] += Cc.getY(i); a[5] += Cc.getZ(i); a[6]++; cid[i] = j;
    }
    const pos = [], col = [];
    for (let t = 0; t < n; t += 3) {
      const a = cid[t], b = cid[t + 1], c = cid[t + 2]; if (a === b || b === c || a === c) continue;
      for (const j of [a, b, c]) { const q = acc[j]; pos.push(q[0] / q[6], q[1] / q[6], q[2] / q[6]); col.push(q[3] / q[6], q[4] / q[6], q[5] / q[6]); }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeVertexNormals();
    return out;
  }

  // ------------------------------------------------------------- blueprints
  // Weapon blueprints: original designs per gun, each with its own palette and
  // extra geometry (shrouds, fins, glow vents, muzzle devices...). A camo, if
  // equipped, replaces the body material; blueprint accents and glow stay.
  const GLOWS = [];
  const glowMat = c => cache.mat['glow' + c] || (cache.mat['glow' + c] = (() => { const m = new THREE.MeshBasicMaterial({ color: c }); m.userData.base = new THREE.Color(c); GLOWS.push(m); return m; })());
  const bpMat = (c, gloss) => cache.mat['bp' + c + gloss] || (cache.mat['bp' + c + gloss] = gloss
    ? new THREE.MeshPhongMaterial({ color: c, specular: 0xffffff, shininess: gloss === 2 ? 120 : 60, envMap: BR.weaponEnv(), reflectivity: gloss === 2 ? 0.22 : 0.1 })
    : new THREE.MeshLambertMaterial({ color: c }));
  const bladeTex = (key, draw) => canvasTex('blade-' + key, draw, 256);
  const BLADES = {
    fade: () => new THREE.MeshPhongMaterial({ shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, map: bladeTex('fade', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#ffe066'); g.addColorStop(0.35, '#ff5ec4'); g.addColorStop(0.75, '#8a4dff'); g.addColorStop(1, '#4a2bff');
      c.fillStyle = g; c.fillRect(0, 0, s, s); }) }),
    doppler: () => new THREE.MeshPhongMaterial({ shininess: 140, specular: 0x9fd8ff, side: THREE.DoubleSide, emissive: 0x0a1030, map: bladeTex('doppler', (c, s) => {
      const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#05061a'); g.addColorStop(0.5, '#1636a8'); g.addColorStop(1, '#0a0a20');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(160,220,255,${Math.random()})`; c.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); } }) }),
  };
  // ---- Mythic helpers: animated parts. Each pushes fn(t) onto g.userData.anim; the viewmodel
  // and the shop call BR.Models.animate(model, t) every frame.
  const anim = (g, fn) => (g.userData.anim || (g.userData.anim = [])).push(fn);
  // ---- v1.23 BLUEPRINT FIT: blueprint add-ons (glow strips, panels, brakes, gems, flames...) were designed on the old
  // procedural guns and knives. On the imported models every piece a blueprint adds is mapped from the procedural
  // model's space onto the imported one (anchored on stock end, grip and muzzle; knives on blade and handle), then
  // seated on the real surface: thin strips are re-laid as ribbons that follow the model's contours, small parts that
  // would float are pulled onto the nearest surface. Each piece is wrapped in a fit group, so animated parts still
  // move as designed (their animation runs in the old space, the wrapper maps it).
  const FIT = {};
  const ROLE_KEYS = ['inner', 'mag', 'pump', 'bolt', 'handleA', 'handleB', 'crane', 'cylinder', 'muzzle', 'charm'];
  const SNAP_ROLES = { handleA: 1, handleB: 1, mag: 1, pump: 1, bolt: 1, cylinder: 1 };
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const relMat = (g, o) => { g.updateMatrixWorld(true); return new THREE.Matrix4().copy(g.matrixWorld).invert().multiply(o.matrixWorld); };
  function roleOf(g, o) { const u = g.userData; for (let p = o; p && p !== g; p = p.parent) for (const k of ROLE_KEYS) if (u[k] === p) return k; return null; }
  function fitRef(g, keep, bladeTest) {
    g.updateMatrixWorld(true);
    const u = g.userData, box = new THREE.Box3(), blade = new THREE.Box3(), b = new THREE.Box3(), roles = {};
    g.traverse(o => {
      if (!o.isMesh || (keep && !keep.has(o)) || o === u.flash || o.userData.isFlash || o.userData.noUV || (o.material && o.material.transparent && o.material.opacity < 0.5 && !bladeTest(o))) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      b.copy(o.geometry.boundingBox).applyMatrix4(relMat(g, o)); box.union(b); if (bladeTest(o)) blade.union(b);
    });
    for (const k of ROLE_KEYS) if (u[k] && u[k].isObject3D) roles[k] = relMat(g, u[k]);
    const mz = u.muzzle ? new THREE.Vector3().setFromMatrixPosition(relMat(g, u.muzzle)) : new THREE.Vector3(0, 0, box.min.z);
    const vol = b => { const z = b.getSize(new THREE.Vector3()); return z.x * z.y * z.z; };
    return { box, blade: blade.isEmpty() || vol(blade) > vol(box) * 0.8 ? null : blade, roles, muzzle: mz, grip: u.grip ? u.grip.clone() : new THREE.Vector3(0, -0.05, 0.1), tip: u.trailTip ? u.trailTip.clone() : null };
  }
  function procRef(id) {
    const key = 'p' + id; if (FIT[key] !== undefined) return FIT[key];
    if (!PROC[id]) return (FIT[key] = null);
    const g = new THREE.Group(), M = MAT();
    try { PROC[id](g, skinMaterial('default', BR.CONFIG.weapons[id].color), M, {}); } catch (e) { return (FIT[key] = null); }
    const u = g.userData, bl = u.blade && u.blade !== g && u.blade !== u.inner ? u.blade : null;
    const under = (o, r) => { for (let q = o; q; q = q.parent) if (q === r) return true; return false; };
    return (FIT[key] = fitRef(g, null, o => o.material === M.blade || (bl && under(o, bl))));
  }
  // surface samples of the imported model (g-space points + outward normals + role), in a spatial hash
  function impRef(id, g, keep) {
    const key = 'i' + id; if (FIT[key]) return FIT[key];
    const C = BR.IMPORTED[id], u = g.userData;
    const R = fitRef(g, keep, o => o === u.bladeMesh);
    R.muzzle.set(0, C.muzzle[0], C.muzzle[1]);
    if (u.mag) { const mb = new THREE.Box3(), t = new THREE.Box3(); u.mag.traverse(o => { if (o.isMesh && keep.has(o)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); mb.union(t.copy(o.geometry.boundingBox).applyMatrix4(relMat(g, o))); } }); if (!mb.isEmpty()) R.magBox = mb; }
    const tris = []; let area = 0;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), nv = new THREE.Vector3();
    g.traverse(o => {
      if (!o.isMesh || !keep.has(o) || o === u.flash || o.userData.isFlash || o.userData.noUV || (o.material && o.material.transparent && o.material.opacity < 0.5 && o !== u.bladeMesh)) return;
      const role = o === u.bladeMesh ? 'blade' : roleOf(g, o) || 'body', M = relMat(g, o), P = o.geometry.attributes.position, N = o.geometry.attributes.normal, I = o.geometry.index;
      const nm = new THREE.Matrix3().getNormalMatrix(M), cnt = I ? I.count : P.count;
      for (let t = 0; t + 2 < cnt; t += 3) {
        const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2;
        va.fromBufferAttribute(P, ia).applyMatrix4(M); vb.fromBufferAttribute(P, ib).applyMatrix4(M); vc.fromBufferAttribute(P, ic).applyMatrix4(M);
        e1.subVectors(vb, va); e2.subVectors(vc, va); nn.crossVectors(e1, e2); const A = nn.length() / 2; if (A < 1e-9) continue;
        nn.normalize();
        if (N) { nv.fromBufferAttribute(N, ia).add(e1.fromBufferAttribute(N, ib)).add(e2.fromBufferAttribute(N, ic)).applyMatrix3(nm); if (nv.dot(nn) < 0) nn.negate(); }
        tris.push([va.clone(), vb.clone(), vc.clone(), nn.clone(), A, role]); area += A;
      }
    });
    const step = Math.max(0.0028, Math.sqrt(area / 45000)), cell = 0.008, hash = new Map(), pts = [], rng = BR.util.rng(991);
    const add = (p, n, role) => { const i = pts.length; pts.push({ p, n, role }); const k = Math.floor(p.x / cell) + ',' + Math.floor(p.y / cell) + ',' + Math.floor(p.z / cell); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(i); };
    for (const [a, b, c, n, A, role] of tris) {
      const m = Math.min(40, Math.max(1, Math.round(A / (step * step))));
      for (let i = 0; i < m; i++) { let r1 = i ? rng() : 1 / 3, r2 = i ? rng() : 1 / 3; if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
        add(new THREE.Vector3().copy(a).addScaledVector(e1.subVectors(b, a), r1).addScaledVector(e2.subVectors(c, a), r2), n, role); }
    }
    R.pts = pts; R.hash = hash; R.cell = cell;
    return (FIT[key] = R);
  }
  function nearestSurf(R, p, maxR, role) {
    const c = R.cell, cx = Math.floor(p.x / c), cy = Math.floor(p.y / c), cz = Math.floor(p.z / c), rr = Math.ceil(maxR / c);
    let best = null, bd = maxR * maxR, bestAny = null, bda = maxR * maxR;
    for (let r = 0; r <= rr; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const a = R.hash.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)); if (!a) continue;
        for (const i of a) { const q = R.pts[i], d = q.p.distanceToSquared(p); if (d < bda) { bda = d; bestAny = q; } if ((!role || q.role === role) && d < bd) { bd = d; best = q; } }
      }
      if ((role ? best : bestAny) && (r * c) * (r * c) > (role ? bd : bda)) break;
    }
    return role && best ? best : role && !SNAP_ROLES[role] ? bestAny : best || (role ? null : bestAny);
  }
  // proc g-space point -> imported g-space point + local scale
  function fitMap(id, P, I, c) {
    const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    if (BR.CONFIG.weapons[id].melee) {
      const inB = P.blade && I.blade && P.blade.clone().expandByScalar(0.016).containsPoint(c), A = inB ? P.blade : P.box, B = inB ? I.blade : I.box;
      for (const ax of ['x', 'y', 'z']) {
        const a0 = A.min[ax], a1 = A.max[ax], b0 = B.min[ax], b1 = B.max[ax], k = (c[ax] - a0) / Math.max(1e-4, a1 - a0);
        const flip = ax === 'y' && P.tip && I.tip && Math.sign(P.tip.y) !== Math.sign(I.tip.y);
        p[ax] = flip ? b1 - k * (b1 - b0) : b0 + k * (b1 - b0);
        s[ax] = clampN((b1 - b0) / Math.max(1e-4, a1 - a0), ax === 'x' ? 0.6 : 0.45, 2.2);
      }
      return { p, s };
    }
    const segs = [[P.box.max.z, I.box.max.z], [P.grip.z, I.grip.z], [P.muzzle.z, I.muzzle.z]].filter((v, i, a) => !i || a[i - 1][0] - v[0] > 0.02);
    const seg = (a, b) => { const sl = clampN((b[1] - a[1]) / (b[0] - a[0]), 0.5, 1.8); return [a[1] + (c.z - a[0]) * sl, sl]; };
    let z;
    if (segs.length < 2) z = [c.z - P.muzzle.z + I.muzzle.z, 1];
    else if (c.z >= segs[1][0]) z = seg(segs[0], segs[1]);
    else { let i = 1; while (i < segs.length - 1 && c.z < segs[i + 1][0]) i++; z = i < segs.length - 1 ? seg(segs[i], segs[i + 1]) : seg(segs[i - 1], segs[i]); }
    const W = (b) => Math.max(0.01, b.max.x - b.min.x), H = (b) => Math.max(0.01, b.max.y - b.min.y);
    s.set(clampN(W(I.box) / W(P.box), 0.6, 1.5), clampN(H(I.box) / H(P.box), 0.65, 1.5), z[1]);
    const m = (s.x + s.y + s.z) / 3; s.set(clampN(s.x, m * 0.75, m * 1.25), clampN(s.y, m * 0.75, m * 1.25), clampN(s.z, m * 0.75, m * 1.25));
    p.set(c.x * s.x, I.muzzle.y + (c.y - P.muzzle.y) * s.y, z[0]);
    return { p, s };
  }
  // a thin strip re-laid on the surface: samples along its long axis, each seated on the nearest surface point
  // an energy-flow material: bright pulses race along a ribbon, tinted live from the blueprint's own glow material
  function flowMat(g, src) {
    const T = canvasTex('flowpulse', (c, S) => { const gr = c.createLinearGradient(0, 0, S, 0); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.86, '#fff'); gr.addColorStop(0.9, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0.18)'); c.fillStyle = gr; c.fillRect(0, 0, S, S); }, 64);
    const map = T.clone(); map.needsUpdate = true; map.wrapS = THREE.RepeatWrapping; map.repeat.set(4, 1);
    const m = new THREE.MeshBasicMaterial({ map, color: src.color ? src.color.clone() : 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    anim(g, t => { map.offset.x = -(t * 1.6) % 1; if (src.color) m.color.copy(src.color); });
    return m;
  }
  function ribbonOn(I, center, axis, len, wAxis, w, mat, role) {
    const K = Math.max(2, Math.ceil(len / 0.005)), seats = [];
    for (let i = 0; i <= K; i++) {
      const p = center.clone().addScaledVector(axis, (i / K - 0.5) * len), q = nearestSurf(I, p, 0.05, role);
      seats.push(q ? { q: q.p.clone().addScaledVector(q.n, w > 0.012 ? 0.0022 : 0.0011), n: q.n.clone() } : null);
    }
    return ribbonSeats(seats, w, mat, len / K, axis, wAxis);
  }
  // a ribbon through surface seats ({q: point, n: normal} or null for a gap), smoothed, w wide
  function ribbonSeats(seats, w, mat, step, axis, wAxis) {
    const K = seats.length - 1, pos = [], uvs = [], len = step * K; wAxis = wAxis || new THREE.Vector3(0, 1, 0);
    for (let it = 0; it < (w > 0.012 ? 4 : 2); it++) {                                // smooth the seats so the ribbon reads as one clean line, not a scribble
      const prev = seats.map(x => x && { q: x.q.clone(), n: x.n.clone() });
      for (let i = 0; i <= K; i++) { if (!prev[i]) continue; let c = 1; const q = prev[i].q.clone(), n = prev[i].n.clone();
        for (const j of [i - 1, i + 1]) if (prev[j] && prev[j].q.distanceTo(prev[i].q) < len / K * 3) { q.add(prev[j].q); n.add(prev[j].n); c++; }
        seats[i].q.copy(q.divideScalar(c)); seats[i].n.copy(n.normalize()); }
    }
    for (let i = 0; i < K; i++) {
      const a = seats[i], b = seats[i + 1]; if (!a || !b || a.q.distanceTo(b.q) > len / K * 3.5) continue;
      const corner = (s) => { const wv = wAxis.clone().addScaledVector(s.n, -wAxis.dot(s.n)); if (wv.lengthSq() < 1e-6) wv.crossVectors(s.n, axis); wv.normalize().multiplyScalar(w / 2); return [s.q.clone().add(wv), s.q.clone().sub(wv)]; };
      const [a0, a1] = corner(a), [b0, b1] = corner(b), ua = i / K, ub = (i + 1) / K;
      const U = [[ua, 0], [ua, 1], [ub, 0], [ub, 1]], V = [a0, a1, b0, b1];
      for (const t of [[0, 1, 2], [1, 3, 2], [0, 2, 1], [1, 2, 3]]) for (const j of t) { pos.push(V[j].x, V[j].y, V[j].z); uvs.push(U[j][0], U[j][1]); }
    }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.userData.noUV = true; m.userData.fitted = true; return m;
  }
  function fitMods(g, id, keep, native) {
    if (!g.userData.imported || !BR.IMPORTED[id]) return;
    const P = native ? null : procRef(id); if (!P && !native) return;
    const I = impRef(id, g, keep), geos = new Set();
    g.traverse(o => { if (keep.has(o) && o.geometry) geos.add(o.geometry); });
    g.updateMatrixWorld(true);
    const added = []; g.traverse(o => { if (!keep.has(o) && keep.has(o.parent) && !o.userData.fitted && !(o.geometry && geos.has(o.geometry))) added.push(o); });
    const bb = new THREE.Box3(), sz = new THREE.Vector3(), ctr = new THREE.Vector3(), AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    // which add-ons are animated (their animation moves them): those are never re-laid as static ribbons
    const moving = new Set(), snap = o => o.position.toArray().concat(o.scale.toArray(), o.rotation.toArray().slice(0, 3)).join(',');
    if (g.userData.anim) { const all = []; g.traverse(o => { if (!keep.has(o)) all.push([o, snap(o)]); }); g.userData.anim.forEach(f => f(2.345)); g.userData.anim.forEach(f => f(0.71));
      for (const [o, s0] of all) if (snap(o) !== s0) for (let q = o; q && !keep.has(q); q = q.parent) moving.add(q); }
    const fits = [], melee = !!BR.CONFIG.weapons[id].melee;
    const put = (e) => { e.Wg.matrix.copy(e.Pinv).multiply(e.pre).multiply(e.base); e.Wg.updateMatrixWorld(true); };
    for (const o of added) {
      const par = o.parent, role = roleOf(g, par), Pi = relMat(g, par);
      const Mpp = role && P && P.roles[role] && I.roles[role] ? P.roles[role].clone().multiply(I.roles[role].clone().invert()).multiply(Pi) : Pi.clone();
      bb.setFromObject(o); if (bb.isEmpty()) bb.setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), new THREE.Vector3());
      const cLocal = par.worldToLocal(bb.getCenter(new THREE.Vector3())), cP = cLocal.clone().applyMatrix4(Mpp);
      let A = new THREE.Matrix4();
      if (!native) { const { p, s } = fitMap(id, P, I, cP); A.makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z)).multiply(new THREE.Matrix4().makeTranslation(-cP.x, -cP.y, -cP.z)); }
      const Wg = new THREE.Group(); Wg.matrixAutoUpdate = false; Wg.userData.fitted = true; par.add(Wg); Wg.add(o);
      const e = { o, Wg, Pinv: Pi.clone().invert(), base: native ? Pi.clone() : A.multiply(Mpp), pre: new THREE.Matrix4(), par, role };
      put(e);
      if (o.isSprite || o.isLine) continue;
      bb.setFromObject(o); bb.getSize(sz);
      const ds = [sz.x, sz.y, sz.z].sort((x, y) => x - y);
      if (o.isMesh && role !== 'mag' && ds[2] > 0.12 && ds[1] > 0.03 && !melee) { o.visible = false; o.userData.fitHidden = true; continue; }   // a blocky shroud would bury the real model's detail
      fits.push(e);
    }
    // a replacement drum / mag (all its pieces together) is centred on the real magazine
    const mags = fits.filter(e => e.role === 'mag');
    if (mags.length && I.magBox) {
      const u = new THREE.Box3(); for (const e of mags) u.union(bb.setFromObject(e.o));
      const mc = I.magBox.getCenter(new THREE.Vector3()), uc = u.getCenter(new THREE.Vector3());
      for (const e of mags) { e.pre.makeTranslation(mc.x - uc.x, Math.max(0, I.magBox.max.y - u.max.y - 0.01), mc.z - uc.z); put(e); e.done = u.getSize(sz).length() > 0.06; }
    }
    for (const e of fits) {
      if (e.done) continue;
      const { o, Pinv, par, role } = e;
      bb.setFromObject(o); bb.getSize(sz); bb.getCenter(ctr); if (bb.isEmpty()) continue;
      const order = [0, 1, 2].sort((x, y) => sz.getComponent(x) - sz.getComponent(y)), d0 = sz.getComponent(order[0]), d1 = sz.getComponent(order[1]), d2 = sz.getComponent(order[2]);
      const sr = SNAP_ROLES[role] ? role : null;
      if (o.isMesh && d0 <= 0.0075 && d2 >= 0.035 && (d2 > 3.5 * d1 || order[0] === 0) && o.geometry.attributes.position.count < 600) {          // a glow strip / pinstripe / panel: lay it on the surface
        const mv = moving.has(o), rm = mv ? flowMat(g, o.material) : o.material;    // (a moving streak becomes a flowing one)
        const rb = ribbonOn(I, ctr, AX[order[2]], mv ? Math.min(I.box.max.z - I.muzzle.z, Math.max(d2, 0.2)) : d2, AX[order[1]], Math.max(d1, 0.0026), rm, sr);
        if (rb) { rb.matrixAutoUpdate = false; rb.matrix.copy(Pinv); par.add(rb); o.visible = false; o.userData.fitHidden = true; continue; }
      }
      const q = nearestSurf(I, ctr, 0.15, sr); if (!q) continue;
      const slack = moving.has(o) ? 0.02 : 0.003;                                    // (animated parts may hover a little by design)
      const dv = ctr.clone().sub(q.p), dist = dv.length(), dir = dist > 1e-5 ? dv.divideScalar(dist) : q.n.clone(), out = dir.dot(q.n) > -0.2;
      const hx = d => Math.abs(d.x) * sz.x / 2 + Math.abs(d.y) * sz.y / 2 + Math.abs(d.z) * sz.z / 2, h = hx(dir);
      if (out && dist > h + slack) { const m = -(dist - h - 0.0006); e.pre.makeTranslation(dir.x * m, dir.y * m, dir.z * m); put(e); }     // floating: seat it on the surface
      else if (d0 <= 0.0075 && Math.abs(q.n.getComponent(order[0])) > 0.7) { const sd = (out ? dist : -dist) * Math.max(0.2, Math.abs(dir.dot(q.n))), hn = hx(q.n);                      // a decal sunk into the body: lift it out
        if (sd < hn * 0.6) { const m = hn + 0.0008 - sd; e.pre.makeTranslation(q.n.x * m, q.n.y * m, q.n.z * m); put(e); } }
    }
  }
  // v1.22 SKIN VFX: Legendary / Mythic / Exotic camos and Mythic / Exotic blueprints get a living glow: an additive rim
  // shell hugging the weapon that breathes, a slow light sweep along it, and sparkles drifting round it in the skin's
  // colour (Exotic cycles through the rainbow). Knife blueprints that already carry their own aura keep it.
  const FX_TIER = { Legendary: 1, Mythic: 2, Exotic: 3 };
  const swatchColor = sw => { let best = null, bs = -1; for (const h of String(sw || '').match(/#[0-9a-fA-F]{6}/g) || []) { const c = new THREE.Color(h), hsl = {}; c.getHSL(hsl); const sc = hsl.s * (1 - Math.abs(hsl.l - 0.55)); if (sc > bs) { bs = sc; best = c.getHex(); } } return best; };
  function skinFx(g, skin, bp) {
    const sk = skin && skin !== 'default' ? SKINS[skin] : null;
    let tier = 0, col = null;
    if (sk && FX_TIER[sk.rarity]) { tier = FX_TIER[sk.rarity]; col = swatchColor(sk.swatch); }
    else if (bp && FX_TIER[bp.rarity] && bp.glow != null && (!bp.mod || bp.fx || !g.userData.trailTip)) { tier = FX_TIER[bp.rarity]; col = bp.glow; }     // v1.32: every Legendary+ gun blueprint (knives with their own aura keep it)
    if (!tier || col === null || col === undefined || !(BR.Effects && BR.Effects.tex)) return;
    let src = null, n = 0;
    g.traverse(o => { if (o.isMesh && !o.userData.isFlash && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count > n && !(o.material && o.material.transparent)) { n = o.geometry.attributes.position.count; src = o; } });
    if (!src) return;
    const T = BR.Effects.tex(), C = new THREE.Color(col), tmp = new THREE.Color();
    if (!src.geometry.boundingBox) src.geometry.computeBoundingBox();
    const bb = src.geometry.boundingBox, ctr = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3()), len = Math.max(size.x, size.y, size.z);
    const shells = [[1.02 + 0.006 * tier, 0.16 + 0.05 * tier], [1.05 + 0.01 * tier, 0.07 + 0.03 * tier]].map(([k, op]) => {
      const m = new THREE.Mesh(src.geometry, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }));
      m.scale.setScalar(k); m.position.copy(ctr).multiplyScalar(1 - k); m.userData.isFlash = true; m.userData.noUV = true; src.add(m); return { m, op }; });
    // sparkles drift along the weapon's long axis and twinkle (in the model's own space so they follow every pose)
    const P = src.parent || g, axis = size.z >= size.x && size.z >= size.y ? 'z' : size.y >= size.x ? 'y' : 'x', motes = [];
    for (let i = 0; i < 5 + tier * 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.userData.isFlash = true; P.add(sp); motes.push({ sp, o: Math.random(), a: Math.random() * 6.28, r: 0.4 + Math.random() * 0.6 });
    }
    const half = size.clone().multiplyScalar(0.5);
    // v1.32: a band of light that sweeps down the weapon (two on Exotic, opposite ways), over the whole surface
    const sweep = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false,
      uniforms: { t: { value: 0 }, col: { value: new THREE.Color(col) }, lo: { value: bb.min[axis] }, hi: { value: bb.max[axis] }, w: { value: 0.07 + 0.02 * tier }, k: { value: 0.55 + 0.2 * tier }, two: { value: tier >= 3 ? 1 : 0 } },
      vertexShader: 'varying float a; uniform float lo, hi; void main(){ a = (position.' + axis + ' - lo) / max(1e-4, hi - lo); gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 1.004, 1.0); }',
      fragmentShader: 'varying float a; uniform float t, w, k, two; uniform vec3 col; void main(){ float p = fract(t * 0.42); float b = smoothstep(w, 0.0, abs(a - (1.0 - p * 1.3 + 0.15)));'
        + ' if (two > 0.5) b = max(b, smoothstep(w, 0.0, abs(a - (p * 1.3 - 0.15)))); gl_FragColor = vec4(col * b * k, b * k); }' });
    const lite = !!(BR.game && BR.game.settings && BR.game.settings.gfx === 'low');          // (Low graphics: keep the glow + sparkles, skip the extra passes)
    if (!lite) { const sm = new THREE.Mesh(src.geometry, sweep); sm.userData.isFlash = true; sm.userData.noUV = true; sm.renderOrder = 3; src.add(sm); }
    // Mythic + Exotic: rings of energy that slide from the stock out past the muzzle and fade
    const rings = [];
    if (tier >= 2 && !lite) {
      const rr = Math.max(axis === 'z' ? Math.max(half.x, half.y) : Math.max(half.x, half.z), len * 0.03) * 0.85;
      for (let i = 0; i < (tier >= 3 ? 3 : 2); i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(rr, rr * 0.09, 6, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        if (axis === 'z') r.rotation.y = 0.5; else if (axis === 'x') r.rotation.y = Math.PI / 2 + 0.5; else r.rotation.x = Math.PI / 2;     // (tilted: reads as a ring from the side too)
        r.userData.isFlash = true; r.userData.noUV = true; r.userData.adsHide = true; P.add(r); rings.push(r);
      }
    }
    anim(g, t => {
      sweep.uniforms.t.value = t; if (tier === 3) sweep.uniforms.col.value.setHSL((t * 0.18 + 0.5) % 1, 1, 0.6);
      rings.forEach((r, i) => { const f = (t * 0.55 + i / rings.length) % 1; r.position.copy(ctr); r.position[axis] = bb.max[axis] - f * (bb.max[axis] - bb.min[axis]) * 1.15;
        const sc = 0.7 + f * 0.6; r.scale.setScalar(sc); r.material.opacity = Math.sin(f * Math.PI) * (tier >= 3 ? 0.75 : 0.6);
        if (tier === 3) r.material.color.setHSL((t * 0.18 + i / rings.length) % 1, 1, 0.6); });
      const pulse = 0.65 + 0.35 * Math.sin(t * 2.4);
      if (tier === 3) C.setHSL((t * 0.18) % 1, 1, 0.6);
      shells.forEach(({ m, op }, i) => { m.material.opacity = op * (pulse + (i ? 0.2 * Math.sin(t * 5 + 1) : 0)); m.material.color.copy(C); });
      motes.forEach(({ sp, o, a, r }, i) => {
        const f = (t * (0.18 + 0.05 * tier) + o) % 1, ang = a + t * 1.6;
        const along = (f - 0.5) * 2, rr = r * (axis === 'z' ? Math.max(half.x, half.y) : Math.max(half.z, half.x)) * 1.6;
        const v = sp.position; v.copy(ctr);
        v[axis] += along * (axis === 'z' ? half.z : axis === 'y' ? half.y : half.x) * 1.05;
        const o1 = axis === 'x' ? 'y' : 'x', o2 = axis === 'z' ? 'y' : 'z'; v[o1] += Math.cos(ang) * rr; v[o2] += Math.sin(ang) * rr;
        sp.scale.setScalar(len * (0.025 + 0.01 * tier) * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.7)) * Math.sin(f * Math.PI));
        sp.material.opacity = Math.sin(f * Math.PI);
        if (tier === 3) sp.material.color.setHSL((t * 0.18 + i / motes.length) % 1, 1, 0.65); else sp.material.color.copy(i % 3 === 0 ? tmp.setRGB(1, 1, 1) : C);
      });
    });
    g.userData.skinFx = tier;
  }
  const liveGlow = (c) => new THREE.MeshBasicMaterial({ color: c });                  // own material, safe to animate
  const hueCycle = (g, mat, h0, h1, speed, l) => anim(g, t => mat.color.setHSL(h0 + (h1 - h0) * (0.5 + 0.5 * Math.sin(t * speed)), 1, l || 0.6));
  const chrome = (c) => new THREE.MeshPhongMaterial({ color: c, specular: 0xffffff, shininess: 150, emissive: new THREE.Color(c).multiplyScalar(0.12) });
  const crystal = (c) => new THREE.MeshPhongMaterial({ color: c, specular: 0xffffff, shininess: 160, transparent: true, opacity: 0.78, emissive: new THREE.Color(c).multiplyScalar(0.35) });
  function ring(g, r, tube, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 32), mat); m.position.set(x, y, z); g.add(m); return m;
  }
  function orbiters(g, n, geo, mat, cx, cy, cz, r, speed, axis) {
    const pivot = new THREE.Group(); pivot.position.set(cx, cy, cz); g.add(pivot);
    for (let i = 0; i < n; i++) { const o = new THREE.Mesh(geo, mat); const a = i / n * Math.PI * 2; if (axis === 'z') o.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); else o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); pivot.add(o); }
    anim(g, t => { if (axis === 'z') pivot.rotation.z = t * speed; else pivot.rotation.y = t * speed; pivot.children.forEach((o, i) => o.rotation.set(t * 3 + i, t * 2, 0)); });
    return pivot;
  }
  BLADES.gamma = () => new THREE.MeshPhongMaterial({ shininess: 160, specular: 0xb0ffd0, side: THREE.DoubleSide, emissive: 0x05301a, map: bladeTex('gamma', (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#003b1f'); g.addColorStop(0.4, '#00c46a'); g.addColorStop(0.7, '#7dffb8'); g.addColorStop(1, '#00361c');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(200,255,220,${Math.random()})`; c.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); } }) });
  BLADES.ruby = () => new THREE.MeshPhongMaterial({ shininess: 170, specular: 0xffc0c8, side: THREE.DoubleSide, emissive: 0x300008, map: bladeTex('ruby', (c, s) => {
    const g = c.createRadialGradient(s * 0.4, s * 0.4, 4, s * 0.5, s * 0.5, s * 0.7); g.addColorStop(0, '#ff5a72'); g.addColorStop(0.5, '#d1002a'); g.addColorStop(1, '#3a0008');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,190,200,${Math.random() * 0.8})`; c.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2); } }) });
  const glowStrip = (k, G, len, x, y, z, axis) => axis === 'y' ? k.box(0.003, len, 0.003, x, y, z, G) : k.box(0.003, 0.004, len, x, y, z, G);

  const BLUEPRINTS = {
    pistol: {
      viper: { name: 'Viper', rarity: 'Epic', price: 450, body: 0x1d2a22, accent: 0x31423a, glow: 0x39ff88,
        mod(g, k, P) {
          k.box(0.05, 0.048, 0.05, 0, 0.056, -0.262, P.A);                        // compensator
          for (const x of [-0.0225, 0.0225]) glowStrip(k, P.G, 0.2, x, 0.062, -0.08);
          k.box(0.004, 0.012, 0.004, 0, 0.078, -0.272, P.G);                      // port glow
          if (g.userData.mag) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.03, 0.054), P.A); b.position.set(0, -0.178, 0.042); b.rotation.x = 0.06; g.userData.mag.add(b); }
        } },
      gilded: { name: 'Gilded Monarch', rarity: 'Legendary', price: 800, body: 0xe6b422, bodyGloss: 2, accent: 0xf3efe6, glow: 0xffe9a0,
        mod(g, k, P) {
          for (let i = 0; i < 6; i++) k.box(0.046, 0.002, 0.012, 0, 0.0755, -0.19 + i * 0.03, P.G);  // engraving lines
          for (const x of [-0.023, 0.023]) { const p = k.box(0.004, 0.07, 0.04, x * 0.9, -0.05, 0.036, P.A); p.rotation.x = 0.1; } // ivory grips
          k.cyl(0.012, 0.008, 0, 0.056, -0.24, P.G, 'z', 12);
        } },
    },
    smg: {
      neonrush: { name: 'Neon Rush', rarity: 'Legendary', price: 900, body: 0x14161c, accent: 0x23262e, glow: 0x22e6ff,
        mod(g, k, P) {
          k.box(0.05, 0.05, 0.07, 0, 0.01, -0.165, P.A);                          // angular barrel shroud
          for (let i = 0; i < 3; i++) k.box(0.052, 0.005, 0.012, 0, 0.022, -0.19 + i * 0.022, P.G);
          for (const x of [-0.0265, 0.0265]) glowStrip(k, P.G, 0.24, x, 0.03, 0.0);
          k.box(0.022, 0.005, 0.04, 0, -0.016, -0.17, P.G);
        } },
      scarlet: { name: 'Scarlet Drum', rarity: 'Legendary', price: 1100, body: 0xe8121c, accent: 0x161616, glow: 0xff3b3b,
        mod(g, k, P) {
          // long barrel (muzzle moves forward), handstop, heavy drum in place of the stick mag
          k.cyl(0.0085, 0.2, 0, 0.01, -0.3, P.B, 'z', 14);
          k.cyl(0.0092, 0.006, 0, 0.01, -0.4, P.A, 'z', 14);
          const u = g.userData; u.muzzle.position.z -= 0.2; u.flash.position.z -= 0.2;
          k.box(0.016, 0.03, 0.02, 0, -0.026, -0.1, P.A);
          const mg = u.mag; mg.children.forEach(c => { c.visible = false; });
          const drum = [k.cyl(0.058, 0.034, 0.018, -0.21, 0.036, P.B, 'x', 28), k.cyl(0.058, 0.034, -0.018, -0.21, 0.036, P.B, 'x', 28),
            k.cyl(0.02, 0.074, 0, -0.21, 0.036, P.A, 'x', 16), k.box(0.03, 0.08, 0.04, 0, -0.13, 0.036, P.B),
            k.cyl(0.0595, 0.004, 0, -0.21, 0.036, P.G, 'x', 28)];
          for (const m of drum) mg.attach(m);
          k.box(0.026, 0.012, 0.08, 0, 0.041, 0.25, P.A);                         // cheek rest on the stock arm
        } },
      hornet: { name: 'Hornet', rarity: 'Epic', price: 500, body: 0xf2c200, accent: 0x111111, glow: 0xffe14d,
        mod(g, k, P) {
          for (let i = 0; i < 6; i++) k.box(0.052, 0.07, 0.012, 0, 0.033, -0.11 + i * 0.045, P.A);  // hazard bands
          k.box(0.034, 0.034, 0.04, 0, 0.01, -0.215, P.A);                        // muzzle brake
          for (const x of [-0.018, 0.018]) k.box(0.004, 0.016, 0.026, x, 0.01, -0.215, P.G);
          k.box(0.038, 0.09, 0.012, 0, -0.07, 0.402, P.A);
        } },
    },
    shotgun: {
      dragon: { name: "Dragon's Breath", rarity: 'Legendary', price: 950, body: 0x2a0d0a, accent: 0x5a1712, glow: 0xff5a1f,
        mod(g, k, P) {
          for (let i = 0; i < 5; i++) { const f = k.box(0.006, 0.05, 0.05, 0, 0.1, -0.24 - i * 0.065, P.A); f.rotation.x = -0.6; } // spine fins
          for (let i = 0; i < 4; i++) k.box(0.012, 0.005, 0.04, 0, 0.074, -0.26 - i * 0.07, P.G);         // glowing vents
          k.box(0.05, 0.045, 0.04, 0, 0.05, -0.66, P.A);                                                  // dragon head brake
          for (const x of [-0.014, 0.014]) k.box(0.01, 0.008, 0.004, x, 0.062, -0.681, P.G);             // eyes
          for (const x of [-0.026, 0.026]) glowStrip(k, P.G, 0.24, x, 0.03, -0.07);
        } },
      riot: { name: 'Riot Control', rarity: 'Epic', price: 500, body: 0x1b2a4a, accent: 0xe9eef4, glow: 0x7fd0ff,
        mod(g, k, P) {
          for (const x of [-0.0265, 0.0265]) k.box(0.003, 0.03, 0.24, x, 0.04, -0.07, P.A); // white side panels
          k.cyl(0.014, 0.08, 0.03, 0.016, -0.5, P.A, 'z', 12);                               // flashlight
          k.cyl(0.012, 0.004, 0.03, 0.016, -0.542, P.G, 'z', 12);
          k.box(0.05, 0.15, 0.012, 0, -0.054, 0.376, P.A);                                 // stock pad
        } },
    },
    rifle: {
      vandal: { name: 'Obsidian Edge', rarity: 'Legendary', price: 1000, body: 0x14151a, accent: 0x2a2c33, glow: 0xff2e63,
        mod(g, k, P) {
          k.box(0.08, 0.082, 0.26, 0, 0.035, -0.34, P.A);                         // angular shroud
          for (let i = 0; i < 5; i++) k.box(0.082, 0.007, 0.022, 0, 0.05, -0.43 + i * 0.045, P.G);
          for (const x of [-0.031, 0.031]) glowStrip(k, P.G, 0.3, x, 0.0, -0.05);
          k.box(0.05, 0.03, 0.12, 0, 0.065, 0.24, P.A);                           // cheek riser
          for (const a of [0, 1, 2, 3]) { const sp = k.box(0.01, 0.01, 0.05, Math.cos(a * 1.57) * 0.034, 0.035 + Math.sin(a * 1.57) * 0.034, -0.75, P.A); }
        } },
      desert: { name: 'Desert Storm', rarity: 'Epic', price: 550, body: 0xb89a6a, accent: 0x4f5a3a, glow: 0xffb224,
        mod(g, k, P) {
          k.box(0.035, 0.032, 0.07, 0.035, 0.105, -0.3, P.A);                     // PEQ box
          k.box(0.004, 0.012, 0.012, 0.053, 0.11, -0.33, P.G);
          const fg = k.box(0.03, 0.06, 0.05, 0, -0.025, -0.38, P.A); fg.rotation.x = -0.6;   // angled grip
          for (let i = 0; i < 3; i++) k.cyl(0.032, 0.012, 0, 0.035, -0.54 - i * 0.05, P.A, 'z', 12);  // ranger bands
        } },
    },
    holoar: {
      cyber: { name: 'Cyber Sentinel', rarity: 'Legendary', price: 1000, body: 0xe9edf2, accent: 0x2b3038, glow: 0x2ff3ff,
        mod(g, k, P) {
          for (const x of [-0.031, 0.031]) { glowStrip(k, P.G, 0.3, x, 0.05, -0.05); glowStrip(k, P.G, 0.18, x, 0.02, 0.23); }
          k.box(0.07, 0.004, 0.072, 0, 0.192, -0.08, P.G);                         // holo frame glow
          for (let i = 0; i < 3; i++) k.cyl(0.032, 0.008, 0, 0.035, -0.53 - i * 0.07, P.G, 'z', 14);
          k.box(0.074, 0.074, 0.22, 0, 0.035, -0.34, P.A);
        } },
      obsidian: { name: 'Obsidian Gold', rarity: 'Epic', price: 600, body: 0x0b0b0e, bodyGloss: 2, accent: 0xd4a017, accentGloss: 1, glow: 0xffcf5a,
        mod(g, k, P) {
          for (const y of [-0.012, 0.073]) for (const x of [-0.031, 0.031]) k.box(0.003, 0.004, 0.34, x, y, -0.05, P.A);
          for (let i = 0; i < 2; i++) k.cyl(0.032, 0.01, 0, 0.035, -0.5 - i * 0.18, P.A, 'z', 14);
          k.box(0.062, 0.102, 0.012, 0, -0.005, 0.345, P.A);
        } },
    },
    sniper: {
      arctic: { name: 'Arctic Wolf', rarity: 'Epic', price: 600, body: 0xe8eef4, accent: 0x8fb7d6, glow: 0x9fe8ff,
        mod(g, k, P) {
          k.box(0.06, 0.05, 0.09, 0, 0.04, -0.88, P.A);                           // big brake
          for (const x of [-0.031, 0.031]) k.box(0.004, 0.012, 0.06, x, 0.04, -0.88, P.G);
          k.cyl(0.03, 0.016, 0, 0.13, -0.39, P.A, 'z', 20); k.cyl(0.043, 0.016, 0, 0.13, 0.02, P.A, 'z', 24);
          k.box(0.05, 0.016, 0.2, 0, 0.095, 0.19, P.A);
        } },
      executioner: { name: 'Executioner', rarity: 'Legendary', price: 1100, body: 0x3a0a0e, accent: 0x111111, glow: 0xff2a2a,
        mod(g, k, P) {
          for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 4), P.A); const a = i / 6 * Math.PI * 2; c.position.set(Math.cos(a) * 0.03, 0.04 + Math.sin(a) * 0.03, -0.86); c.rotation.x = -Math.PI / 2; g.add(c); }
          glowStrip(k, P.G, 0.5, 0, 0.058, -0.55);
          k.box(0.012, 0.05, 0.05, 0.027, -0.03, 0.34, P.A);                       // stock badge
          for (const z of [0.33, 0.35]) k.box(0.006, 0.008, 0.006, 0.034, -0.02, z, P.G);
        } },
    },
    hunter: {
      timberwolf: { name: 'Timberwolf', rarity: 'Legendary', price: 950, body: 0x5a3418, bodyGloss: 1, accent: 0xc89b3c, accentGloss: 1, glow: 0xffb347,
        mod(g, k, P) {
          for (const z of [-0.08, 0.06, 0.38]) k.box(0.042, 0.012, 0.012, 0, z > 0.3 ? -0.012 : 0.012, z, P.A);   // brass bands
          for (const x of [-0.0185, 0.0185]) k.box(0.002, 0.03, 0.12, x, -0.012, 0.31, P.A);                  // inlay
          k.box(0.004, 0.006, 0.42, -0.022, -0.045, 0.13, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));  // leather sling
          k.box(0.002, 0.006, 0.12, 0.0155, 0.05, 0.04, P.G);           // glowing receiver inlay
          k.box(0.007, 0.007, 0.007, 0, 0.088, -0.578, P.G);           // glowing front bead
        } },
    },
    knife: {
      fade: { name: 'Fade', rarity: 'Legendary', price: 1200, body: 0x16161a, accent: 0x16161a, glow: 0xff5ec4, blade: 'fade' },
      doppler: { name: 'Doppler', rarity: 'Legendary', price: 1200, body: 0x101014, accent: 0x101014, glow: 0x4a8bff, blade: 'doppler' },
    },
  };
  // ---- Mythic blueprints: vibrant chrome + animated parts (spinning rings, orbiting gems,
  // hue-cycling glow). Shown with a rainbow card in the shop.
  const MYTHIC = {
    rifle: {
      neonviper: { name: 'Neon Viper', rarity: 'Mythic', price: 2000, body: 0xff2fa8, bodyGloss: 2, accent: 0x1de9ff, accentGloss: 2, glow: 0x1de9ff,
        mod(g, k, P) {
          const C = chrome(0x1de9ff), G = liveGlow(0x1de9ff); hueCycle(g, G, 0.5, 0.92, 2.2);
          k.box(0.084, 0.09, 0.3, 0, 0.035, -0.35, C);                                        // chrome shroud
          for (let i = 0; i < 6; i++) { const f = k.box(0.006, 0.06, 0.05, 0, 0.1, -0.22 - i * 0.05, chrome(0xff2fa8)); f.rotation.x = -0.7; }   // dorsal fins
          for (const x of [-0.045, 0.045]) { k.box(0.004, 0.012, 0.32, x, 0.035, -0.35, G); k.box(0.004, 0.008, 0.36, x * 0.75, -0.005, 0.02, G); }
          const rings = [-0.56, -0.64, -0.72].map((z, i) => { const r = ring(g, 0.05 - i * 0.006, 0.0045, G, 0, 0.035, z); return r; });
          anim(g, t => rings.forEach((r, i) => { r.rotation.x = t * (2 + i); r.rotation.y = t * (1.4 - i * 0.5); r.scale.setScalar(1 + 0.12 * Math.sin(t * 6 + i)); }));
          k.box(0.05, 0.004, 0.08, 0, -0.08, -0.12, G);                                       // mag glow line
        } },
    },
    holoar: {
      solarflare: { name: 'Solar Flare', rarity: 'Mythic', price: 2000, body: 0xffc400, bodyGloss: 2, accent: 0xfff4d6, accentGloss: 2, glow: 0xff7a00,
        mod(g, k, P) {
          const G = liveGlow(0xff7a00); hueCycle(g, G, 0.02, 0.13, 3, 0.55);
          const sun = new THREE.Group(); sun.position.set(0, 0.035, -0.6); g.add(sun);
          sun.add(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 8, 28), chrome(0xffd84a)));
          for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.045, 5), G); const a = i / 12 * Math.PI * 2; c.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0); c.rotation.z = a - Math.PI / 2; sun.add(c); }
          anim(g, t => { sun.rotation.z = t * 1.5; sun.scale.setScalar(1 + 0.06 * Math.sin(t * 5)); });
          for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 6), G); f.position.set(0, 0.095, -0.3 + i * 0.05); g.add(f);
            anim(g, t => { f.scale.y = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.3)); }); }                         // flickering flames
          for (const x of [-0.04, 0.04]) k.box(0.004, 0.014, 0.4, x, 0.035, -0.12, G);
        } },
    },
    smg: {
      glitch: { name: 'Glitch', rarity: 'Mythic', price: 1800, body: 0x0d0d12, bodyGloss: 2, accent: 0xff2bd6, accentGloss: 2, glow: 0x39ff14,
        mod(g, k, P) {
          const G = liveGlow(0x39ff14), M2 = liveGlow(0xff2bd6);
          anim(g, t => { const f = Math.floor(t * 8) % 5 === 0; G.color.setHex(f ? 0xff2bd6 : 0x39ff14); M2.color.setHex(f ? 0x39ff14 : 0xff2bd6); });
          for (const x of [-0.027, 0.027]) { k.box(0.004, 0.008, 0.26, x, 0.035, 0.0, G); k.box(0.004, 0.008, 0.2, x, -0.012, 0.0, M2); }
          const cubes = [];
          for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.014), i % 2 ? G : M2); g.add(c); cubes.push({ c, ox: (Math.random() - 0.5) * 0.12, oy: 0.08 + Math.random() * 0.05, oz: -0.15 + Math.random() * 0.3, s: Math.random() * 10 }); }
          anim(g, t => cubes.forEach(q => { const j = Math.floor(t * 10 + q.s) % 7 === 0 ? 0.02 : 0; q.c.position.set(q.ox + j, q.oy + Math.sin(t * 3 + q.s) * 0.01, q.oz); q.c.rotation.set(t + q.s, t * 2, 0); }));
          k.box(0.05, 0.05, 0.05, 0, 0.01, -0.16, chrome(0x1a1a24));
          for (let i = 0; i < 4; i++) k.box(0.052, 0.006, 0.008, 0, 0.018, -0.18 + i * 0.013, i % 2 ? G : M2);
        } },
    },
    shotgun: {
      frostbite: { name: 'Frostbite', rarity: 'Mythic', price: 1900, body: 0xbfe9ff, bodyGloss: 2, accent: 0xffffff, accentGloss: 2, glow: 0x6ff0ff,
        mod(g, k, P) {
          const G = liveGlow(0x6ff0ff); hueCycle(g, G, 0.5, 0.58, 2.5, 0.65);
          const ice = crystal(0x8fe8ff);
          for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.02 + (i % 3) * 0.008, 0), ice); c.scale.y = 2.2; c.position.set((i % 2 ? 0.02 : -0.02), 0.1 + (i % 3) * 0.01, -0.12 - i * 0.06); c.rotation.z = (i % 2 ? -0.4 : 0.4); g.add(c); }
          for (let i = 0; i < 4; i++) k.box(0.012, 0.005, 0.03, 0, 0.074, -0.26 - i * 0.07, G);
          orbiters(g, 6, new THREE.OctahedronGeometry(0.008, 0), G, 0, 0.05, -0.68, 0.06, 2.5, 'z');      // snow swirling round the muzzle
          k.box(0.05, 0.05, 0.04, 0, 0.05, -0.66, ice);
        } },
    },
    sniper: {
      celestial: { name: 'Celestial', rarity: 'Mythic', price: 2200, body: 0x0b1440, bodyGloss: 2, accent: 0xffd36a, accentGloss: 2, glow: 0xb48cff,
        mod(g, k, P) {
          const G = liveGlow(0xb48cff); hueCycle(g, G, 0.62, 0.82, 1.6, 0.68);
          const gold = chrome(0xffd36a);
          const h1 = ring(g, 0.06, 0.004, gold, 0, 0.13, -0.06), h2 = ring(g, 0.07, 0.003, G, 0, 0.13, -0.06);
          anim(g, t => { h1.rotation.set(t * 1.2, t * 0.7, 0); h2.rotation.set(-t * 0.9, 0, t * 1.1); });
          orbiters(g, 5, new THREE.OctahedronGeometry(0.01, 0), gold, 0, 0.04, -0.7, 0.06, -1.8, 'z');     // stars round the barrel
          glowStrip(k, G, 0.55, 0, 0.058, -0.55);
          for (const x of [-0.032, 0.032]) k.box(0.003, 0.01, 0.3, x, 0.03, 0.0, G);
          k.box(0.066, 0.05, 0.1, 0, 0.04, -0.88, gold);
          for (let i = 0; i < 18; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.003), liveGlow(0xffffff)); st.position.set((i % 2 ? 0.031 : -0.031), -0.01 + Math.random() * 0.07, -0.15 + Math.random() * 0.5); g.add(st); }
        } },
    },
    hunter: {
      aurora: { name: 'Aurora', rarity: 'Mythic', price: 1800, body: 0x062a24, bodyGloss: 2, accent: 0x00ffa6, accentGloss: 2, glow: 0x00ffa6,
        mod(g, k, P) {
          const G = liveGlow(0x00ffa6); hueCycle(g, G, 0.38, 0.8, 1.4, 0.6);
          const veil = new THREE.MeshBasicMaterial({ color: 0x00ffa6, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
          anim(g, t => { veil.color.copy(G.color); veil.opacity = 0.25 + 0.15 * Math.sin(t * 2.3); });
          for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.05), veil); f.position.set(0, 0.1, -0.28 + i * 0.11); f.rotation.y = Math.PI / 2; g.add(f);
            anim(g, t => { f.position.y = 0.1 + Math.sin(t * 2 + i) * 0.01; f.rotation.z = Math.sin(t * 1.5 + i) * 0.2; }); }
          for (const x of [-0.019, 0.019]) { k.box(0.002, 0.012, 0.36, x, 0.012, -0.05, G); k.box(0.002, 0.03, 0.18, x, -0.012, 0.3, G); }
          k.box(0.008, 0.008, 0.008, 0, 0.088, -0.578, G);
        } },
    },
    pistol: {
      plasma: { name: 'Plasma Core', rarity: 'Mythic', price: 1600, body: 0x5a1bff, bodyGloss: 2, accent: 0xe6e9ff, accentGloss: 2, glow: 0xff3df2,
        mod(g, k, P) {
          const G = liveGlow(0xff3df2); hueCycle(g, G, 0.75, 0.95, 3);
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), G); core.position.set(0, 0.098, -0.06); g.add(core);
          const cage = ring(g, 0.03, 0.003, chrome(0xe6e9ff), 0, 0.098, -0.06); anim(g, t => { cage.rotation.y = t * 2; cage.rotation.x = t * 1.3; });
          anim(g, t => core.scale.setScalar(1 + 0.25 * Math.sin(t * 8)));
          orbiters(g, 3, new THREE.SphereGeometry(0.006, 8, 6), liveGlow(0xffffff), 0, 0.098, -0.06, 0.045, 4, 'y');
          k.box(0.046, 0.004, 0.22, 0, 0.0765, -0.1, G);
          k.box(0.05, 0.05, 0.05, 0, 0.056, -0.262, chrome(0xe6e9ff));
        } },
    },
    knife: {
      gamma: { name: 'Gamma Doppler', rarity: 'Mythic', price: 2400, body: 0x0c1410, accent: 0x0c1410, glow: 0x39ff88, blade: 'gamma' },
      ruby: { name: 'Ruby', rarity: 'Mythic', price: 2600, body: 0x120608, accent: 0x120608, glow: 0xff2a4a, blade: 'ruby' },
    },
  };
  // ---- Mythic wave 2
  const MYTHIC2 = {
    rifle: {
      dragonlord: { name: 'Dragon Lord', rarity: 'Mythic', price: 2400, body: 0x5a0b0b, bodyGloss: 2, accent: 0xffc93a, accentGloss: 2, glow: 0xff5a1f,
        mod(g, k, P) {
          const G = liveGlow(0xff5a1f); hueCycle(g, G, 0.0, 0.1, 4, 0.55);
          const gold = chrome(0xffc93a);
          const wings = [];
          for (const sx of [-1, 1]) {
            const w = new THREE.Group(); w.position.set(sx * 0.04, 0.06, -0.12); g.add(w); wings.push({ w, sx });
            for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.09 - i * 0.015), i % 2 ? gold : chrome(0x8a1010)); f.position.set(sx * (0.02 + i * 0.018), 0.02 + i * 0.012, 0.02 - i * 0.012); f.rotation.x = -0.5; w.add(f); }
          }
          anim(g, t => wings.forEach(({ w, sx }) => { w.rotation.z = sx * (0.25 + 0.25 * Math.sin(t * 3)); }));
          k.box(0.09, 0.075, 0.08, 0, 0.035, -0.74, gold);                                    // dragon-head brake
          for (const x of [-0.03, 0.03]) k.box(0.014, 0.01, 0.006, x, 0.06, -0.782, G);       // eyes
          for (let i = 0; i < 4; i++) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 5), gold); h.position.set((i % 2 ? 0.025 : -0.025), 0.09, -0.72 + Math.floor(i / 2) * 0.03); h.rotation.x = 0.6; g.add(h); }
          orbiters(g, 4, new THREE.OctahedronGeometry(0.008, 0), G, 0, 0.035, -0.82, 0.03, 6, 'z');   // embers at the mouth
          for (const x of [-0.042, 0.042]) k.box(0.004, 0.012, 0.32, x, 0.035, -0.33, G);
        } },
    },
    holoar: {
      quantum: { name: 'Quantum', rarity: 'Mythic', price: 2400, body: 0xf2f6ff, bodyGloss: 2, accent: 0x1a2240, accentGloss: 2, glow: 0x3aa0ff,
        mod(g, k, P) {
          const G = liveGlow(0x3aa0ff); hueCycle(g, G, 0.55, 0.68, 2.5, 0.62);
          const hexMat = new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
          const pv = new THREE.Group(); pv.position.set(0, 0.04, -0.1); g.add(pv);
          for (let i = 0; i < 5; i++) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.03, 6), hexMat); const a = i / 5 * Math.PI * 2; h.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0); h.lookAt(0, 0, 0); pv.add(h); }
          anim(g, t => { pv.rotation.z = t * 0.8; hexMat.opacity = 0.3 + 0.2 * Math.sin(t * 5); });
          for (const x of [-0.035, 0.035]) { k.box(0.004, 0.006, 0.42, x, 0.06, -0.14, G); k.box(0.004, 0.006, 0.42, x, 0.0, -0.14, G); }
          const coil = []; for (let i = 0; i < 4; i++) coil.push(ring(g, 0.033, 0.004, G, 0, 0.035, -0.52 - i * 0.05));
          anim(g, t => coil.forEach((c, i) => c.scale.setScalar(1 + 0.25 * Math.max(0, Math.sin(t * 8 - i)))));
        } },
    },
    smg: {
      synthwave: { name: 'Synthwave', rarity: 'Mythic', price: 2200, body: 0x2a0b4a, bodyGloss: 2, accent: 0xff2fa8, accentGloss: 2, glow: 0xff2fa8,
        mod(g, k, P) {
          const sun = liveGlow(0xffb000), pink = liveGlow(0xff2fa8), cyan = liveGlow(0x1de9ff);
          for (let i = 0; i < 4; i++) k.box(0.0515, 0.006, 0.07 - i * 0.012, 0, 0.0 + i * 0.012, 0.03, i % 2 ? pink : sun);   // sunset stripes
          const bars = [];
          for (let i = 0; i < 7; i++) for (const x of [-0.027, 0.027]) { const b = k.box(0.004, 0.04, 0.012, x, 0.02, -0.12 + i * 0.022, i % 2 ? cyan : pink); bars.push({ b, i }); }
          anim(g, t => bars.forEach(({ b, i }) => { const v = 0.3 + 0.7 * Math.abs(Math.sin(t * 7 + i * 0.9) * Math.sin(t * 3.1 + i)); b.scale.y = v; b.position.y = 0.0 + v * 0.02; }));    // equalizer
          for (const x of [-0.0275, 0.0275]) k.box(0.003, 0.004, 0.3, x, 0.05, 0.005, cyan);
          k.box(0.046, 0.046, 0.05, 0, 0.01, -0.155, chrome(0xff2fa8));
        } },
    },
    shotgun: {
      volcano: { name: 'Volcano', rarity: 'Mythic', price: 2300, body: 0x1a0a06, bodyGloss: 1, accent: 0x2a1208, glow: 0xff5a00,
        mod(g, k, P) {
          const lava = new THREE.MeshPhongMaterial({ map: TEX.molten(), emissive: 0xffffff, emissiveMap: TEX.molten(), emissiveIntensity: 1 });
          k.box(0.036, 0.036, 0.34, 0, 0.05, -0.42, lava); k.box(0.053, 0.09, 0.27, 0, 0.037, -0.068, lava);
          const G = liveGlow(0xff7a00); hueCycle(g, G, 0.02, 0.1, 5, 0.55);
          const drops = [];
          for (let i = 0; i < 6; i++) { const d = k.box(0.01, 0.016, 0.01, (i % 2 ? 0.02 : -0.02), 0, -0.12 - i * 0.07, G); drops.push({ d, o: Math.random() }); }
          anim(g, t => drops.forEach(({ d, o }) => { const f = (t * 0.7 + o) % 1; d.position.y = -0.005 - f * 0.08; d.scale.setScalar(1 - f * 0.7); }));
          const smoke = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4, depthWrite: false });
          orbiters(g, 5, new THREE.IcosahedronGeometry(0.014, 0), smoke, 0, 0.07, -0.68, 0.04, 1.5, 'z');
        } },
    },
    sniper: {
      thunder: { name: 'Thunderstrike', rarity: 'Mythic', price: 2600, body: 0x0d1430, bodyGloss: 2, accent: 0xe8eef8, accentGloss: 2, glow: 0x6fc8ff,
        mod(g, k, P) {
          const G = liveGlow(0x9fe8ff);
          const coils = [-0.3, -0.45, -0.6, -0.75].map(z => ring(g, 0.03, 0.005, chrome(0xe8eef8), 0, 0.04, z));
          const arcs = [];
          for (let i = 0; i < 9; i++) { const a = k.box(0.003, 0.003, 0.05, 0, 0.04, -0.3 - i * 0.05, G); arcs.push(a); }
          anim(g, t => {                                                                        // crackling arcs between the coils
            const f = Math.floor(t * 20);
            arcs.forEach((a, i) => { const r = Math.sin(f * 12.9898 + i * 78.233) * 43758.5453; const u = r - Math.floor(r); const ang = u * 6.28;
              a.position.set(Math.cos(ang) * 0.03, 0.04 + Math.sin(ang) * 0.03, -0.32 - i * 0.05); a.rotation.set(u * 2 - 1, u * 3, 0); a.visible = u > 0.25; });
            G.color.setHSL(0.55, 1, 0.65 + 0.2 * Math.sin(t * 30));
          });
          glowStrip(k, G, 0.5, 0, 0.06, -0.5);
          for (const x of [-0.032, 0.032]) k.box(0.003, 0.012, 0.3, x, 0.02, 0.0, G);
        } },
    },
    hunter: {
      phantom: { name: 'Phantom', rarity: 'Mythic', price: 2200, body: 0x9fd8ff, bodyGloss: 2, accent: 0xe8f6ff, accentGloss: 2, glow: 0xbfeaff,
        mod(g, k, P) {
          const ghost = new THREE.MeshPhongMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.5, specular: 0xffffff, shininess: 140, emissive: 0x204a6a, depthWrite: false });
          k.box(0.044, 0.1, 0.24, 0, -0.012, 0.31, ghost); k.box(0.04, 0.056, 0.32, 0, 0.012, 0.0, ghost);                     // ethereal stock + fore-stock shells
          const wisp = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
          orbiters(g, 4, new THREE.SphereGeometry(0.01, 8, 6), wisp, 0, 0.04, -0.2, 0.07, 1.6, 'z');
          anim(g, t => { ghost.opacity = 0.4 + 0.15 * Math.sin(t * 2.2); wisp.opacity = 0.5 + 0.3 * Math.sin(t * 4); });
          const G = liveGlow(0xbfeaff); for (const x of [-0.021, 0.021]) k.box(0.002, 0.008, 0.4, x, 0.036, -0.1, G);
        } },
    },
    pistol: {
      kitsune: { name: 'Kitsune', rarity: 'Mythic', price: 2000, body: 0xf4f1ea, bodyGloss: 2, accent: 0xd1132a, accentGloss: 2, glow: 0xff3a5c,
        mod(g, k, P) {
          const red = chrome(0xd1132a), G = liveGlow(0xff3a5c); hueCycle(g, G, 0.95, 1.02, 3, 0.6);
          for (let i = 0; i < 5; i++) k.box(0.046, 0.004, 0.01, 0, 0.0765, -0.19 + i * 0.04, red);      // lacquer bands
          const spirits = new THREE.Group(); spirits.position.set(0, 0.04, -0.05); g.add(spirits);
          for (let i = 0; i < 3; i++) {                                                               // fox-fire spirits with flame tails
            const sp = new THREE.Group(); const a = i / 3 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0);
            sp.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), G));
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.04, 8), G); tail.rotation.z = Math.PI / 2 + a; tail.position.set(Math.sin(a) * 0.02, -Math.cos(a) * 0.02, 0); sp.add(tail);
            spirits.add(sp);
          }
          anim(g, t => { spirits.rotation.z = t * 2.2; spirits.children.forEach((c, i) => c.scale.setScalar(0.85 + 0.25 * Math.sin(t * 9 + i))); });
          const tassel = k.box(0.006, 0.05, 0.006, 0, -0.14, 0.05, red); anim(g, t => { tassel.rotation.z = Math.sin(t * 3) * 0.4; });
        } },
    },
    knife: {
      sapphire: { name: 'Sapphire', rarity: 'Mythic', price: 2800, body: 0x050a1a, accent: 0x050a1a, glow: 0x2a6bff, blade: 'sapphire' },
      blackpearl: { name: 'Black Pearl', rarity: 'Mythic', price: 3000, body: 0x0a0612, accent: 0x0a0612, glow: 0xb48cff, blade: 'blackpearl' },
    },
  };
  for (const w in MYTHIC2) MYTHIC[w] = Object.assign(MYTHIC[w] || {}, MYTHIC2[w]);
  // ---- Release Case exclusive blueprints: the most elaborate designs in the game
  const CASEBP = {
    rifle: {
      genesis: { name: 'Genesis', rarity: 'Exotic', caseOnly: true, body: 0xf6f2ff, bodyGloss: 2, accent: 0xffd36a, accentGloss: 2, glow: 0x9b5cff,
        mod(g, k, P) {
          const G = liveGlow(0x9b5cff); hueCycle(g, G, 0.0, 1.0, 0.6, 0.62);                                  // full-spectrum glow
          const gold = chrome(0xffd36a), ice = crystal(0xc8f0ff);
          const halo = new THREE.Group(); halo.position.set(0, 0.035, -0.62); g.add(halo);
          for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.05 + i * 0.012, 0.0035, 8, 40), i === 1 ? gold : G); r.rotation.y = i * 1.05; halo.add(r); }
          anim(g, t => { halo.rotation.z = t * 1.4; halo.children.forEach((r, i) => { r.rotation.x = t * (1.2 + i * 0.5); }); });
          const shards = [];
          for (let i = 0; i < 6; i++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), ice); sh.scale.y = 2.4; g.add(sh); shards.push(sh); }
          anim(g, t => shards.forEach((sh, i) => { const a = t * 1.1 + i / 6 * 6.283; sh.position.set(Math.cos(a) * 0.075, 0.05 + Math.sin(a) * 0.075, -0.2 + Math.sin(t + i) * 0.03); sh.rotation.set(t * 2 + i, t, 0); }));
          for (const x of [-0.04, 0.04]) { k.box(0.004, 0.014, 0.42, x, 0.035, -0.2, G); k.box(0.003, 0.006, 0.24, x * 0.8, 0.075, 0.2, gold); }
          k.box(0.09, 0.09, 0.22, 0, 0.035, -0.38, gold);
          const wing = []; for (const sx of [-1, 1]) { const w = k.box(0.004, 0.05, 0.16, sx * 0.05, 0.07, -0.05, ice); w.rotation.z = sx * 0.6; wing.push(w); }
          anim(g, t => wing.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.55 + 0.12 * Math.sin(t * 3)); }));
        }, tracer: { name: 'Genesis Signature', style: 'comet', color: -1, color2: -1 }, reload: { style: 'flip', fx: 0x9b5cff } },
      chroma: { name: 'Chroma', rarity: 'Legendary', caseOnly: true, body: 0xc9d2da, bodyGloss: 2, accent: 0x1a1c22, accentGloss: 2, glow: 0xff2e63,
        mod(g, k, P) {
          const strips = [0xff2e63, 0x39ff88, 0x1de9ff].map(c => liveGlow(c));
          strips.forEach((m, i) => { k.box(0.084, 0.004, 0.3, 0, 0.012 + i * 0.022, -0.32, m); });
          anim(g, t => strips.forEach((m, i) => m.color.setHSL((t * 0.25 + i / 3) % 1, 1, 0.58)));
          k.box(0.05, 0.05, 0.06, 0, 0.035, -0.76, chrome(0x1a1c22));
        } },
    },
    sniper: {
      horizon: { name: 'Event Horizon', rarity: 'Exotic', caseOnly: true, body: 0x0a0612, bodyGloss: 2, accent: 0xb48cff, accentGloss: 2, glow: 0xb48cff,
        mod(g, k, P) {
          const G = liveGlow(0xb48cff); hueCycle(g, G, 0.72, 0.82, 1.4, 0.65);
          const bh = new THREE.Group(); bh.position.set(0, 0.04, -0.98); g.add(bh);
          bh.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })));
          const disk = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.085, 40), new THREE.MeshBasicMaterial({ color: 0xffb46a, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
          disk.rotation.x = 1.2; bh.add(disk);
          const lens = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.003, 8, 40), G); bh.add(lens);
          anim(g, t => { disk.rotation.z = t * 3; bh.rotation.y = Math.sin(t * 0.7) * 0.4; lens.scale.setScalar(1 + 0.08 * Math.sin(t * 6)); });
          const dust = []; const dm = liveGlow(0xffd9a0);
          for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.005), i % 2 ? dm : G); g.add(d); dust.push({ d, o: i / 10 }); }
          anim(g, t => dust.forEach(({ d, o }) => { const f = (t * 0.5 + o) % 1, r = 0.14 * (1 - f), a = f * 12 + o * 6.28; d.position.set(Math.cos(a) * r, 0.04 + Math.sin(a) * r, -0.98 + (1 - f) * 0.05); d.scale.setScalar(1 - f * 0.6); }));
          glowStrip(k, G, 0.55, 0, 0.06, -0.55);
          for (const x of [-0.032, 0.032]) k.box(0.003, 0.012, 0.3, x, 0.02, 0.0, G);
        }, tracer: { name: 'Event Horizon Signature', style: 'rings', color: 0xffb46a, color2: 0x7b2cff }, reload: { style: 'toss', fx: 0xb48cff } },
    },
    smg: {
      hellfire: { name: 'Hellfire', rarity: 'Mythic', caseOnly: true, body: 0x1a0505, bodyGloss: 1, accent: 0x3a0a0a, glow: 0xff3a00,
        mod(g, k, P) {
          const fire = new THREE.MeshPhongMaterial({ map: TEX.inferno(), emissive: 0xffffff, emissiveMap: TEX.inferno(), emissiveIntensity: 1 });
          k.box(0.0535, 0.078, 0.29, 0, 0.016, 0.008, fire);
          const skull = new THREE.Group(); skull.position.set(0, 0.01, -0.235); g.add(skull);
          skull.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), chrome(0xe8e2d0)));
          for (const x of [-0.012, 0.012]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), liveGlow(0xff3a00)); e.position.set(x, 0.006, -0.026); skull.add(e); }
          orbiters(g, 6, new THREE.ConeGeometry(0.008, 0.03, 6), liveGlow(0xff7a00), 0, 0.01, -0.235, 0.05, 5, 'z');
        }, tracer: { name: 'Hellfire Signature', style: 'phoenix', color: 0xffe14d, color2: 0xff2a00 }, reload: { style: 'twirl', fx: 0xff5a00 } },
    },
    shotgun: {
      leviathan: { name: 'Leviathan', rarity: 'Mythic', caseOnly: true, body: 0x0a3a4a, bodyGloss: 2, accent: 0x1de9ff, accentGloss: 2, glow: 0x3affd8,
        mod(g, k, P) {
          const sc = new THREE.MeshPhongMaterial({ map: TEX.scales(), specular: 0x9dffcf, shininess: 120, emissive: 0x04201a });
          k.box(0.036, 0.036, 0.34, 0, 0.05, -0.42, sc);
          const G = liveGlow(0x3affd8); hueCycle(g, G, 0.45, 0.55, 2, 0.6);
          for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), chrome(0x1de9ff)); f.position.set(0, 0.088, -0.15 - i * 0.07); f.rotation.x = -0.5; g.add(f); }
          const bub = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.6 });
          const bubbles = []; for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), bub); g.add(b); bubbles.push({ b, o: Math.random() }); }
          anim(g, t => bubbles.forEach(({ b, o }, i) => { const f = (t * 0.6 + o) % 1; b.position.set(Math.sin(t * 2 + i) * 0.03, 0.07 + f * 0.12, -0.64 - (i % 3) * 0.04); b.scale.setScalar(0.6 + f); }));
          for (const x of [-0.0265, 0.0265]) k.box(0.004, 0.01, 0.24, x, 0.03, -0.07, G);
        }, tracer: { name: 'Leviathan Signature', style: 'helix', color: 0x3affd8, color2: 0x1d4aff }, reload: { style: 'flip', fx: 0x3affd8 } },
    },
    pistol: {
      royal: { name: 'Royal Gold', rarity: 'Mythic', caseOnly: true, body: 0xffcf40, bodyGloss: 2, accent: 0x5a1bff, accentGloss: 2, glow: 0xff3df2,
        mod(g, k, P) {
          const gems = [0xff2e63, 0x1de9ff, 0x39ff88, 0xff3df2].map(c => crystal(c));
          gems.forEach((m, i) => { const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), m); gm.position.set(0.03, 0.06, -0.14 + i * 0.04); g.add(gm); });
          orbiters(g, 4, new THREE.OctahedronGeometry(0.006, 0), liveGlow(0xfff3b0), 0, 0.05, -0.08, 0.07, 2.5, 'z');
          const crown = new THREE.Group(); crown.position.set(0, 0.1, -0.05); g.add(crown);
          for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 4), chrome(0xffcf40)); const a = i / 5 * 6.28; sp.position.set(Math.cos(a) * 0.018, 0.01, Math.sin(a) * 0.018); crown.add(sp); }
          anim(g, t => { crown.rotation.y = t * 1.5; crown.position.y = 0.1 + Math.sin(t * 3) * 0.005; });
        }, tracer: { name: 'Royal Signature', style: 'spark', color: 0xfff3b0, color2: 0xff3df2 }, reload: { style: 'spin', fx: 0xffcf40 } },
    },
    holoar: {
      ronin: { name: 'Cyber Ronin', rarity: 'Mythic', caseOnly: true, body: 0x0d0d12, bodyGloss: 2, accent: 0xff1f3d, accentGloss: 2, glow: 0xff1f3d,
        mod(g, k, P) {
          const G = liveGlow(0xff1f3d); hueCycle(g, G, 0.97, 1.02, 4, 0.55);
          for (const sx of [-1, 1]) { const b = k.box(0.003, 0.03, 0.34, sx * 0.042, 0.03, -0.3, chrome(0xe8eef4)); b.rotation.z = sx * 0.15; }     // katana blades along the handguard
          for (let i = 0; i < 4; i++) k.box(0.08, 0.004, 0.012, 0, 0.074, -0.2 - i * 0.05, G);
          const kanji = k.box(0.003, 0.04, 0.04, 0.04, 0.02, 0.18, G);
          anim(g, t => { kanji.visible = Math.floor(t * 3) % 6 !== 0; });
        }, tracer: { name: 'Ronin Signature', style: 'lightning', color: 0xffffff, color2: 0xff1f3d }, reload: { style: 'glitch', fx: 0xff1f3d } },
    },
    hunter: {
      wildhunt: { name: 'Wild Hunt', rarity: 'Legendary', caseOnly: true, body: 0x1a120a, bodyGloss: 1, accent: 0xe8dcc0, accentGloss: 1, glow: 0x39ff88,
        mod(g, k, P) {
          const bone = chrome(0xe8dcc0), G = liveGlow(0x39ff88);
          for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.05 - i * 0.01, 5), bone); a.position.set(sx * 0.02, 0.09 + i * 0.012, 0.22 - i * 0.03); a.rotation.set(-0.6, 0, sx * (0.5 + i * 0.2)); g.add(a); }
          for (const x of [-0.0185, 0.0185]) k.box(0.002, 0.03, 0.16, x, -0.012, 0.31, G);
          orbiters(g, 3, new THREE.SphereGeometry(0.007, 8, 6), G, 0, 0.04, 0.0, 0.06, 1.8, 'z');
        } },
    },
    knife: {
      fireice: { name: 'Fire & Ice', rarity: 'Exotic', caseOnly: true, body: 0x0a0a10, accent: 0x0a0a10, glow: 0xff5a1f, blade: 'fireice' },
      lore: { name: 'Lore', rarity: 'Mythic', caseOnly: true, body: 0x3a2a05, accent: 0x3a2a05, glow: 0xffcf40, blade: 'lore' },
    },
  };
  for (const w in CASEBP) MYTHIC[w] = Object.assign(MYTHIC[w] || {}, CASEBP[w]);
  // ---- Butterfly knife + revolver skins (shop + Release Case). Animated blades use the shared
  // animated textures (lava, lightning, prism, nebula, liquid gold), so they move in your hand.
  const animBlade = (key, glow) => () => new THREE.MeshPhongMaterial({ map: TEX[key](), emissive: 0xffffff, emissiveMap: TEX[key](), emissiveIntensity: glow, specular: 0xffffff, shininess: 170, side: THREE.DoubleSide });
  BLADES.molten = animBlade('molten', 1); BLADES.storm = animBlade('electric', 1); BLADES.prismblade = animBlade('prism', 0.6);
  BLADES.nebula = animBlade('nebula', 0.9); BLADES.goldrush = animBlade('liquidgold', 0.35);
  BLADES.crimson = () => new THREE.MeshPhongMaterial({ shininess: 150, specular: 0xffc0c0, side: THREE.DoubleSide, map: bladeTex('crimsonweb', (c, s) => {
    c.fillStyle = '#9a0010'; c.fillRect(0, 0, s, s); c.strokeStyle = '#140003'; c.lineWidth = 1.6;
    for (let r = 8; r < s; r += 14) { c.beginPath(); c.arc(s * 0.3, s * 0.3, r, 0, 7); c.stroke(); }
    for (let a = 0; a < 10; a++) { c.beginPath(); c.moveTo(s * 0.3, s * 0.3); c.lineTo(s * 0.3 + Math.cos(a) * s * 1.2, s * 0.3 + Math.sin(a) * s * 1.2); c.stroke(); } }) });
  BLADES.marble = () => new THREE.MeshPhongMaterial({ shininess: 160, specular: 0xffffff, side: THREE.DoubleSide, map: bladeTex('marble', (c, s) => {
    for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) { const v = Math.sin(x * 0.06 + Math.sin(y * 0.05) * 3) * 0.5 + 0.5;
      c.fillStyle = `hsl(${v < 0.33 ? 0 : v < 0.66 ? 45 : 220},95%,${45 + v * 20}%)`; c.fillRect(x, y, 2, 2); } }) });
  const handleGlow = (g, mat) => { for (const h of [g.userData.handleA, g.userData.handleB]) { if (!h) continue; for (const y of [-0.026, -0.05, -0.073, -0.097]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.005), mat); d.position.set(0, y, 0); h.add(d); } } };
  const NEWBP = {
    butterfly: {
      crimsonweb: { name: 'Crimson Web', rarity: 'Epic', price: 900, body: 0x1a1214, accent: 0x1a1214, glow: 0xff1f3d, blade: 'crimson' },
      fade: { name: 'Fade', rarity: 'Legendary', price: 1400, body: 0x16161a, accent: 0x16161a, glow: 0xff5ec4, blade: 'fade' },
      marble: { name: 'Marble Fade', rarity: 'Legendary', price: 1500, body: 0x0e0e12, accent: 0x0e0e12, glow: 0xffd24a, blade: 'marble' },
      goldrush: { name: 'Gold Rush', rarity: 'Legendary', price: 1600, body: 0xd9a400, bodyGloss: 2, accent: 0xfff3b0, glow: 0xfff3b0, blade: 'goldrush',
        mod(g, k, P) { handleGlow(g, liveGlow(0xfff3b0)); } },
      nebula: { name: 'Nebula', rarity: 'Legendary', caseOnly: true, body: 0x1a0a2a, bodyGloss: 2, accent: 0x7b2cff, glow: 0xff6af0, blade: 'nebula',
        mod(g, k, P) { const G = liveGlow(0xff6af0); hueCycle(g, G, 0.75, 0.92, 1.5, 0.62); handleGlow(g, G); } },
      moltencore: { name: 'Molten Core', rarity: 'Mythic', caseOnly: true, body: 0x1a0805, bodyGloss: 1, accent: 0x2a0d05, glow: 0xff6a00, blade: 'molten',
        mod(g, k, P) { const G = liveGlow(0xff7a00); hueCycle(g, G, 0.02, 0.1, 4, 0.55); handleGlow(g, G);
          orbiters(g, 5, new THREE.OctahedronGeometry(0.004, 0), G, 0, 0.07, 0, 0.03, 4, 'y'); } },
      stormbreaker: { name: 'Stormbreaker', rarity: 'Mythic', caseOnly: true, body: 0x0a1030, bodyGloss: 2, accent: 0x1a2a6a, glow: 0x6fc8ff, blade: 'storm',
        mod(g, k, P) { const G = liveGlow(0x9fe8ff); handleGlow(g, G);
          const arcs = []; for (let i = 0; i < 6; i++) { const a = k.box(0.002, 0.016, 0.002, 0, 0.03 + i * 0.016, 0, G); arcs.push(a); }
          anim(g, t => { const f = Math.floor(t * 18); arcs.forEach((a, i) => { const u = Math.abs(Math.sin(f * 7.1 + i * 3.3)); a.position.z = (u - 0.5) * 0.03; a.rotation.x = u * 2; a.visible = u > 0.35; }); G.color.setHSL(0.55, 1, 0.65 + 0.2 * Math.sin(t * 30)); }); } },
      prismatic: { name: 'Prismatic', rarity: 'Exotic', caseOnly: true, body: 0xf2f2ff, bodyGloss: 2, accent: 0xffffff, glow: 0xffffff, blade: 'prismblade',
        mod(g, k, P) { const G = liveGlow(0xff3df2); hueCycle(g, G, 0.0, 1.0, 0.8, 0.6); handleGlow(g, G);
          const ice = crystal(0xd8f4ff), shards = [];
          for (let i = 0; i < 5; i++) { const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), ice); sh.scale.y = 2.2; g.add(sh); shards.push(sh); }
          anim(g, t => shards.forEach((sh, i) => { const a = t * 1.6 + i / 5 * 6.283; sh.position.set(Math.cos(a) * 0.035, 0.07 + Math.sin(t * 2 + i) * 0.02, Math.sin(a) * 0.035); sh.rotation.set(t * 3 + i, t, 0); }));
          orbiters(g, 6, new THREE.BoxGeometry(0.003, 0.003, 0.003), liveGlow(0xffffff), 0, 0.12, 0, 0.02, -5, 'y'); },
        tracer: { name: 'Prismatic Signature', style: 'helix', color: -1, color2: -1 } },
    },
    revolver: {
      neonoutlaw: { name: 'Neon Outlaw', rarity: 'Epic', price: 800, body: 0x121218, bodyGloss: 2, accent: 0xff2fa8, accentGloss: 2, glow: 0x1de9ff,
        mod(g, k, P) { for (const x of [-0.016, 0.016]) k.box(0.002, 0.004, 0.16, x, 0.052, -0.14, P.G);
          const cyl = g.userData.cylinder; if (cyl) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const st = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.042), P.G); st.position.set(Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0); cyl.add(st); } } },
      engraved: { name: 'Engraved', rarity: 'Legendary', price: 1200, body: 0xd8dde3, bodyGloss: 2, accent: 0xe6b422, accentGloss: 2, glow: 0xfff0b0,
        mod(g, k, P) { for (let i = 0; i < 8; i++) k.box(0.0335, 0.002, 0.008, 0, 0.012 + (i % 4) * 0.012, -0.03 + Math.floor(i / 4) * 0.05, P.A);
          for (let i = 0; i < 5; i++) k.box(0.013, 0.002, 0.024, 0, 0.0715, -0.08 - i * 0.03, P.A);
          const iv = chrome(0xf3ecd8); for (const x of [-0.016, 0.016]) { const p2 = k.box(0.003, 0.09, 0.04, x, -0.035, 0.07, iv); p2.rotation.x = 0.32; } } },
      ghost: { name: 'Ghost', rarity: 'Legendary', caseOnly: true, body: 0xbfeaff, bodyGloss: 2, accent: 0xe8f6ff, glow: 0xdff6ff,
        mod(g, k, P) { const ghost = new THREE.MeshPhongMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.45, specular: 0xffffff, shininess: 140, emissive: 0x204a6a, depthWrite: false });
          k.box(0.036, 0.062, 0.12, 0, 0.034, 0.01, ghost);
          orbiters(g, 3, new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.05, -0.1, 0.04, 2, 'z');
          anim(g, t => { ghost.opacity = 0.35 + 0.15 * Math.sin(t * 2.2); }); } },
      dragonfang: { name: 'Dragon Fang', rarity: 'Mythic', caseOnly: true, body: 0x6a0b0b, bodyGloss: 2, accent: 0xffc93a, accentGloss: 2, glow: 0xff5a1f,
        mod(g, k, P) { const G = liveGlow(0xff5a1f); hueCycle(g, G, 0.0, 0.1, 4, 0.55); const gold = chrome(0xffc93a);
          k.box(0.03, 0.03, 0.04, 0, 0.05, -0.245, gold);
          for (const x of [-0.009, 0.009]) k.box(0.006, 0.004, 0.003, x, 0.058, -0.266, G);
          for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.022, 5), G); f.position.set(0, 0.078, -0.06 - i * 0.04); g.add(f); anim(g, t => { f.scale.y = 0.6 + 0.6 * Math.abs(Math.sin(t * 8 + i * 1.7)); }); }
          const cyl = g.userData.cylinder; if (cyl) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.003, 8, 24), G); r.position.z = 0.02; cyl.add(r); } },
        tracer: { name: 'Dragon Fang Signature', style: 'phoenix', color: 0xffe14d, color2: 0xff3a00 } },
      supernova: { name: 'Supernova', rarity: 'Exotic', caseOnly: true, body: 0xf6f2ff, bodyGloss: 2, accent: 0xffd36a, accentGloss: 2, glow: 0xb48cff,
        mod(g, k, P) { const G = liveGlow(0xb48cff); hueCycle(g, G, 0.0, 1.0, 0.7, 0.62);
          const cyl = g.userData.cylinder;
          if (cyl) {
            const pr = new THREE.MeshPhongMaterial({ map: TEX.prism(), emissive: 0xffffff, emissiveMap: TEX.prism(), emissiveIntensity: 0.6, shininess: 160, specular: 0xffffff });
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0268, 0.0268, 0.046, 18), pr); b.rotation.x = Math.PI / 2; cyl.add(b);
            const cores = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; const c = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), G); c.position.set(Math.cos(a) * 0.015, Math.sin(a) * 0.015, 0.028); cyl.add(c); cores.push(c); }
            anim(g, t => cores.forEach((c, i) => c.scale.setScalar(0.8 + 0.4 * Math.sin(t * 6 + i))));
          }
          orbiters(g, 5, new THREE.OctahedronGeometry(0.0045, 0), chrome(0xffd36a), 0, 0.042, -0.035, 0.045, 2.2, 'z');
          const halo = ring(g, 0.02, 0.0025, G, 0, 0.05, -0.255); anim(g, t => { halo.scale.setScalar(1 + 0.2 * Math.sin(t * 5)); halo.rotation.z = t; }); },
        tracer: { name: 'Supernova Signature', style: 'comet', color: -1, color2: -1 } },
    },
  };
  for (const w in NEWBP) MYTHIC[w] = Object.assign(MYTHIC[w] || {}, NEWBP[w]);
  BLADES.fireice = () => new THREE.MeshPhongMaterial({ shininess: 170, specular: 0xffffff, side: THREE.DoubleSide, emissive: 0x100408, map: bladeTex('fireice', (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#ff3a00'); g.addColorStop(0.42, '#ffb000'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.58, '#6fd8ff'); g.addColorStop(1, '#1d4aff');
    c.fillStyle = g; c.fillRect(0, 0, s, s); }) });
  BLADES.lore = () => new THREE.MeshPhongMaterial({ shininess: 140, specular: 0xfff4c0, side: THREE.DoubleSide, emissive: 0x2a1a00, map: bladeTex('lore', (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#e6b422'); g.addColorStop(1, '#8a5a00');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(90,50,0,0.6)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(s / 2, s / 2, 8 + i * 9, 0, 3.5); c.stroke(); } }) });
  BLADES.sapphire = () => new THREE.MeshPhongMaterial({ shininess: 180, specular: 0xbfd8ff, side: THREE.DoubleSide, emissive: 0x020a30, map: bladeTex('sapphire', (c, s) => {
    const g = c.createRadialGradient(s * 0.35, s * 0.4, 2, s * 0.5, s * 0.5, s * 0.75); g.addColorStop(0, '#9fc4ff'); g.addColorStop(0.35, '#1f4fff'); g.addColorStop(1, '#020830');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(200,225,255,${Math.random() * 0.7})`; c.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2); } }) });
  BLADES.blackpearl = () => new THREE.MeshPhongMaterial({ shininess: 170, specular: 0xd8b8ff, side: THREE.DoubleSide, emissive: 0x10051c, map: bladeTex('blackpearl', (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#120a24'); g.addColorStop(0.3, '#5a2bb0'); g.addColorStop(0.55, '#1a1040'); g.addColorStop(0.8, '#2b6bb0'); g.addColorStop(1, '#0a0614');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 10; i++) { c.strokeStyle = `rgba(200,170,255,${0.15 + Math.random() * 0.2})`; c.beginPath(); c.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, 0, 3); c.stroke(); } }) });
  // ---------------------------------------------------------- Season 2 (original designs)
  // Five animated themes that fit any gun: each reads the model's own muzzle / body size so the
  // effects sit on the barrel and the sides whatever the weapon. Reload styles: warp, slam, orbit.
  const bodyInfo = g => {
    g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    g.traverse(o => { if (o.isMesh && o !== g.userData.flash && !o.userData.isFlash) box.expandByObject(o); });
    const mz = g.userData.muzzle ? g.userData.muzzle.position : new THREE.Vector3(0, 0.04, box.min.z);
    return { box, mz, hw: Math.min(0.045, (box.max.x - box.min.x) / 2), by: mz.y, z0: mz.z, z1: box.max.z, len: box.max.z - mz.z };
  };
  const S2THEME = {
    // energy rings racing up the barrel, light streaks flowing back along the sides
    hyperdrive(g, k, P) {
      const I = bodyInfo(g), G = liveGlow(0x1de9ff), M2 = liveGlow(0xff3df2);
      anim(g, t => { const a = 0.5 + 0.5 * Math.sin(t * 2.4); G.color.setHSL(0.52 + 0.3 * a, 1, 0.6); M2.color.setHSL(0.86 - 0.3 * a, 1, 0.62); });
      const rings = [0, 1, 2].map(i => ring(g, 0.032 + i * 0.007, 0.0048, i % 2 ? M2 : G, 0, I.by, I.z0 + 0.04));
      anim(g, t => rings.forEach((r, i) => { const f = (t * 0.9 + i / 3) % 1; r.position.z = I.z0 + 0.03 + f * Math.min(0.32, I.len * 0.45); r.scale.setScalar(1.25 - f * 0.5); r.rotation.z = t * 4; }));
      for (const sx of [-1, 1]) { k.box(0.004, 0.008, I.len * 0.55, sx * (I.hw + 0.002), I.by - 0.012, (I.z0 + I.z1) / 2 + I.len * 0.1, sx > 0 ? G : M2); k.box(0.004, 0.004, I.len * 0.4, sx * (I.hw + 0.002), I.by + 0.01, (I.z0 + I.z1) / 2 + I.len * 0.15, sx > 0 ? M2 : G); }
      const st = []; for (let i = 0; i < 16; i++) { const b = k.box(0.005, 0.005, 0.06, (i % 2 ? 1 : -1) * (I.hw + 0.004), I.by - 0.03 + (i % 4) * 0.018, 0, i % 3 ? G : M2); st.push({ b, o: i / 12 }); }
      anim(g, t => st.forEach(({ b, o }) => { const f = (t * 1.3 + o) % 1; b.position.z = I.z0 + f * I.len; b.scale.z = 0.4 + Math.sin(f * Math.PI) * 1.4; }));
    },
    // a crown of flickering flame cones at the muzzle, embers circling the body, lava strips
    crown(g, k, P) {
      const I = bodyInfo(g), F = liveGlow(0xff7a00), H = liveGlow(0xffd24a), lava = new THREE.MeshPhongMaterial({ map: TEX.molten(), emissive: 0xffffff, emissiveMap: TEX.molten(), emissiveIntensity: 1 });
      const crown = new THREE.Group(); crown.position.set(0, I.by, I.z0 - 0.01); g.add(crown);
      const cones = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.075, 6), i % 2 ? F : H); c.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0); c.rotation.set(-Math.PI / 2, 0, 0); crown.add(c); cones.push(c); }
      anim(g, t => { crown.rotation.z = t * 1.6; cones.forEach((c, i) => { c.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(t * 9 + i * 1.7)), 1); }); F.color.setHSL(0.05 + 0.03 * Math.sin(t * 7), 1, 0.55); });
      for (const sx of [-1, 1]) k.box(0.004, 0.028, I.len * 0.55, sx * (I.hw + 0.002), I.by - 0.01, (I.z0 + I.z1) / 2, lava);
      orbiters(g, 7, new THREE.OctahedronGeometry(0.009, 0), H, 0, I.by, (I.z0 + I.z1) / 2, 0.075, 2.2, 'z');
    },
    // little ringed planets orbiting the barrel, twinkling stars, nebula side panels
    nebula(g, k, P) {
      const I = bodyInfo(g), neb = new THREE.MeshPhongMaterial({ map: TEX.nebula(), emissive: 0xffffff, emissiveMap: TEX.nebula(), emissiveIntensity: 0.9 });
      for (const sx of [-1, 1]) k.box(0.004, 0.034, I.len * 0.55, sx * (I.hw + 0.002), I.by - 0.008, (I.z0 + I.z1) / 2, neb);
      const piv = new THREE.Group(); piv.position.set(0, I.by, I.z0 + I.len * 0.25); g.add(piv);
      [[0xffb46a, 0.016], [0x7fd0ff, 0.012], [0xff7ad8, 0.009]].forEach(([c, r], i) => { const pl = new THREE.Group(); const pa = i / 3 * Math.PI * 2; pl.position.set(Math.cos(pa) * 0.08, Math.sin(pa) * 0.08, 0); piv.add(pl);
        pl.add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), chrome(c))); const rr = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, r * 0.18, 6, 24), liveGlow(0xffffff)); rr.rotation.x = 1.2; pl.add(rr); });
      anim(g, t => { piv.rotation.z = t * 0.9; });
      const stars = []; for (let i = 0; i < 14; i++) { const m = liveGlow(0xffffff), b = k.box(0.004, 0.004, 0.004, (Math.random() - 0.5) * I.hw * 3, I.by + 0.02 + Math.random() * 0.06, I.z0 + Math.random() * I.len, m); stars.push({ m, o: Math.random() * 6 }); }
      anim(g, t => stars.forEach(({ m, o }) => m.color.setScalar(0.3 + 0.7 * Math.abs(Math.sin(t * 2.5 + o)))));
    },
    // glass vials on the sides with rising bubbles, a heartbeat glow
    toxic(g, k, P) {
      const I = bodyInfo(g), G = liveGlow(0x7dff3a), glass = crystal(0x7dff3a), zc = (I.z0 + I.z1) / 2;
      const bubbles = [];
      for (const sx of [-1, 1]) {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 12), glass); v.rotation.x = Math.PI / 2; v.position.set(sx * (I.hw + 0.012), I.by - 0.015, zc); g.add(v);
        for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 5), G); g.add(b); bubbles.push({ b, x: sx * (I.hw + 0.012), o: Math.random() }); }
      }
      anim(g, t => bubbles.forEach(({ b, x, o }, i) => { const f = (t * 0.8 + o) % 1; b.position.set(x + Math.sin(t * 5 + i) * 0.003, I.by - 0.022 + f * 0.016, zc - 0.03 + f * 0.06); }));
      const strip = k.box(0.006, 0.006, I.len * 0.6, 0, I.by + 0.034, zc, G);
      anim(g, t => { const h = Math.pow(Math.max(0, Math.sin(t * 5.2)), 12) + Math.pow(Math.max(0, Math.sin(t * 5.2 - 0.6)), 12) * 0.6; G.color.setHSL(0.27, 1, 0.45 + h * 0.4); strip.scale.y = 1 + h * 3; });
    },
    // a halo of crystal shards orbiting the receiver, rainbow glow strips
    prism(g, k, P) {
      const I = bodyInfo(g), G = liveGlow(0xffffff); hueCycle(g, G, 0, 1, 0.8, 0.62);
      const cg = crystal(0xbfe8ff); cg.emissive.setHex(0x4a90c0); orbiters(g, 8, new THREE.OctahedronGeometry(0.016, 0), cg, 0, I.by + 0.01, (I.z0 + I.z1) / 2 + 0.02, 0.085, 1.4, 'z');
      for (const sx of [-1, 1]) k.box(0.004, 0.01, I.len * 0.6, sx * (I.hw + 0.002), I.by - 0.004, (I.z0 + I.z1) / 2, G);
      const h = ring(g, 0.055, 0.004, G, 0, I.by, I.z0 + 0.02); anim(g, t => { h.rotation.y = t * 1.3; h.rotation.x = t * 0.7; });
    },
  };
  // one Season 2 blueprint per weapon: [weapon, id, name, theme, body, accent, glow, rarity, price | case, reload]
  const S2 = [
    ['rifle', 'hyperdrive', 'Hyperdrive', 'hyperdrive', 0x0b0b1a, 0x1de9ff, 0x1de9ff, 'Mythic', 2400, 'warp'],
    ['holoar', 'prismheart', 'Prism Heart', 'prism', 0xeef2ff, 0xbfe8ff, 0xffffff, 'Exotic', 'nova', 'warp'],
    ['smg', 'toxicpulse', 'Toxic Pulse', 'toxic', 0x0a1a08, 0x2a3a20, 0x7dff3a, 'Mythic', 2200, 'orbit'],
    ['shotgun', 'moltencrown', 'Molten Crown', 'crown', 0x1a0806, 0x3a1208, 0xff7a00, 'Mythic', 'nova', 'slam'],
    ['sniper', 'nebuladrift', 'Nebula Drift', 'nebula', 0x0c0a24, 0xffd36a, 0xb48cff, 'Mythic', 2600, 'orbit'],
    ['hunter', 'starseeker', 'Starseeker', 'nebula', 0x1a1030, 0xd8c4ff, 0x9fd8ff, 'Legendary', 1500, 'orbit'],
    ['revolver', 'spectra', 'Spectra', 'prism', 0x1a1a24, 0xffffff, 0xffffff, 'Mythic', 'nova', 'warp'],
    ['pistol', 'venom', 'Venom Rush', 'toxic', 0x10200a, 0x7dff3a, 0x7dff3a, 'Legendary', 1300, 'orbit'],
    ['lmg', 'forgeheart', 'Forgeheart', 'crown', 0x1c0d06, 0x4a1e0a, 0xff8a1f, 'Mythic', 2400, 'slam'],
    ['dmr', 'lightspeed', 'Lightspeed', 'hyperdrive', 0x050510, 0xff3df2, 0xff3df2, 'Exotic', 'nova', 'warp'],
    ['launcher', 'voidbloom', 'Void Bloom', 'hyperdrive', 0x0b0616, 0xb04bff, 0xff5cf0, 'Mythic', 2500, 'orbit'],          // v1.17.2
    ['launcher', 'solarburst', 'Solar Burst', 'crown', 0x1a0806, 0x3a1208, 0xff7a00, 'Legendary', 1400, 'slam'],
  ];
  // v1.32 new guns
  S2.push(['burst', 'neontalon', 'Neon Talon', 'hyperdrive', 0x0b0b1a, 0x1de9ff, 0x1de9ff, 'Mythic', 2400, 'warp'],
    ['burst', 'streetking', 'Street King', 'prism', 0x16181c, 0xff3d7f, 0xffe14d, 'Legendary', 'street', 'orbit'],
    ['riot', 'infernodrum', 'Inferno Drum', 'crown', 0x1a0806, 0x3a1208, 0xff7a00, 'Legendary', 1500, 'slam'],
    ['riot', 'toxicriot', 'Toxic Riot', 'toxic', 0x0a1a08, 0x2a3a20, 0x7dff3a, 'Mythic', 2300, 'orbit'],
    ['mpistol', 'venomsting', 'Venom Sting', 'toxic', 0x10200a, 0x7dff3a, 0x7dff3a, 'Legendary', 1300, 'orbit'],
    ['mpistol', 'stardrive', 'Stardrive', 'nebula', 0x0c0a24, 0xffd36a, 0xb48cff, 'Mythic', 2200, 'warp'],
    ['pump', 'goldrush', 'Gold Rush', 'crown', 0x1a0e04, 0x3a2208, 0xffc83a, 'Legendary', 1500, 'slam'],
    ['pump', 'frostbark', 'Frostbark', 'nebula', 0x0e1a26, 0xdff6ff, 0x6fd8ff, 'Mythic', 2300, 'orbit']);
  const S2BP = {};
  for (const [w, id, name, theme, body, accent, glow, rarity, price, reload] of S2) {
    const e = { name, rarity, body, bodyGloss: 2, accent, accentGloss: 2, glow, mod: S2THEME[theme], reload: { style: reload, fx: glow }, season: 2 };
    if (price === 'nova' || price === 'street') { e.caseOnly = true; e.case = price; } else e.price = price;
    e.fit = 'native';                                    // (measured off the live model: only seated, never remapped)
    (S2BP[w] = S2BP[w] || {})[id] = e;
  }
  // Season 2 knives: animated blades
  BLADES.riftblade = animBlade('voidrift', 1);
  BLADES.hyperblade = animBlade('hyperspace', 0.95);
  BLADES.acidblade = animBlade('acid', 0.9);
  S2BP.knife = { abyss: { name: 'Abyss', rarity: 'Exotic', caseOnly: true, case: 'nova', body: 0x07020f, bodyGloss: 2, accent: 0xb04bff, glow: 0xb04bff, blade: 'riftblade', season: 2 },
    lightspeed: { name: 'Lightspeed', rarity: 'Mythic', price: 2600, body: 0x05050f, bodyGloss: 2, accent: 0x1de9ff, glow: 0x1de9ff, blade: 'hyperblade', season: 2 } };
  BLADES.nightshade = () => new THREE.MeshPhongMaterial({ shininess: 170, specular: 0xd8b8ff, side: THREE.DoubleSide, emissive: 0x2a0a5a, emissiveIntensity: 1,
    map: bladeTex('nightshade', (c, s) => {
      const gr = c.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#0b0414'); gr.addColorStop(0.45, '#3a1080'); gr.addColorStop(0.7, '#7b2cff'); gr.addColorStop(1, '#14062a');
      c.fillStyle = gr; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 9; i++) { let x = Math.random() * s, y = Math.random() * s; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; c.lineTo(x, y); }
        c.strokeStyle = '#d08bff'; c.lineWidth = 1.2; c.shadowColor = '#b04bff'; c.shadowBlur = 6; c.stroke(); }
    }) });
  // aura: additive shells hugging the blade that breathe, plus motes drifting off it
  // v1.23 aura shells on the imported blades: grow mostly through the blade's thickness, a little across it and barely
  // along it, about the blade's own centre (they were scaled about the grip, which blew them up into big sheets)
  const auraScale = (blade, sc) => {
    if (!blade.geometry.boundingBox) blade.geometry.computeBoundingBox();
    const s = blade.geometry.boundingBox.getSize(new THREE.Vector3()), ax = ['x', 'y', 'z'].sort((a, b) => s[a] - s[b]), out = new THREE.Vector3();
    out[ax[0]] = 1 + (sc - 1) * 5; out[ax[1]] = 1 + (sc - 1) * 0.55; out[ax[2]] = 1 + (sc - 1) * 0.16; return out;
  };
  const auraCentre = (m, blade) => { const c = blade.geometry.boundingBox.getCenter(new THREE.Vector3()); const k = m.scale.clone().divide(blade.scale);
    m.position.add(c.clone().multiply(blade.scale).applyEuler(blade.rotation).sub(c.clone().multiply(blade.scale).multiply(k).applyEuler(blade.rotation))); };
  const nightshadeAura = (g, k, P) => {
    const blade = g.userData.blade, par = blade.parent;
    const shells = [[1.16, 0.55, 0xb04bff], [1.38, 0.22, 0x7b2cff]].map(([sc, op, c]) => {
      const m = new THREE.Mesh(blade.geometry, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
      m.position.copy(blade.position); m.rotation.copy(blade.rotation); m.scale.copy(blade.scale).multiply(auraScale(blade, sc)); auraCentre(m, blade);     // thicker sideways so it reads as a glow
      m.userData.fitted = true; m.userData.isFlash = true; par.add(m); return m; });
    anim(g, t => shells.forEach((m, i) => { const b = 0.5 + 0.5 * Math.sin(t * 3.2 + i); m.material.opacity = (i ? 0.14 : 0.4) + b * (i ? 0.12 : 0.25); m.material.color.setHSL(0.76 + 0.03 * Math.sin(t * 1.3 + i), 1, 0.55); }));
    const motes = [], mm = new THREE.MeshBasicMaterial({ color: 0xd8a8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.0028, 0), mm); par.add(m); motes.push({ m, o: Math.random(), x: (Math.random() - 0.5) * 0.02 }); }
    anim(g, t => motes.forEach(({ m, o, x }) => { const f = (t * 0.6 + o) % 1; m.position.set(x + Math.sin(t * 3 + o * 9) * 0.004, 0.02 + f * 0.13, Math.cos(t * 2 + o * 7) * 0.01); m.scale.setScalar(1 - f * 0.7); }));
  };
  S2BP.butterfly = { nightshade: { name: 'Nightshade', rarity: 'Mythic', price: 2800, body: 0x120a1e, bodyGloss: 2, accent: 0xb04bff, glow: 0xb04bff, blade: 'nightshade', trail: 0xb04bff, mod: nightshadeAura, season: 2 },
    biohazard: { name: 'Biohazard', rarity: 'Mythic', caseOnly: true, case: 'nova', body: 0x041a06, bodyGloss: 2, accent: 0x7dff3a, glow: 0x7dff3a, blade: 'acidblade', season: 2 },
    riftwing: { name: 'Riftwing', rarity: 'Exotic', caseOnly: true, case: 'nova', body: 0x07020f, bodyGloss: 2, accent: 0xff3df2, glow: 0xff3df2, blade: 'riftblade', season: 2 } };
  // ---- Vibrant knife auras (v1.8.0): glowing shells hugging the blade that pulse and shift between two
  // colours (or the whole rainbow), a soft halo, and sparkles orbiting / drifting off the blade.
  const vibrantAura = (cA, cB, rainbow) => (g) => {
    const blade = g.userData.bladeMesh || g.userData.blade; if (!blade || !blade.geometry) return;
    g.updateMatrixWorld(true);
    const par = blade.parent, A = new THREE.Color(cA), Bc = new THREE.Color(cB), tmp = new THREE.Color();
    const shells = [[1.14, 0.6], [1.32, 0.3], [1.6, 0.14]].map(([sc, op]) => {
      const m = new THREE.Mesh(blade.geometry, new THREE.MeshBasicMaterial({ color: cA, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
      m.position.copy(blade.position); m.rotation.copy(blade.rotation); m.scale.copy(blade.scale).multiply(auraScale(blade, sc)); auraCentre(m, blade);
      m.userData.fitted = true; m.userData.isFlash = true; par.add(m); return { m, op }; });
    const sp = () => new THREE.SpriteMaterial({ map: BR.Effects ? BR.Effects.tex().dot : null, color: cA, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const box = new THREE.Box3().setFromObject(blade), ctr = blade.parent.worldToLocal(box.getCenter(new THREE.Vector3())), size = box.getSize(new THREE.Vector3()), len = Math.max(size.x, size.y, size.z);
    const halo = new THREE.Sprite(sp()); halo.position.copy(ctr); halo.scale.setScalar(len * 1.4); halo.userData.fitted = true; par.add(halo);
    const motes = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(sp()); s.userData.fitted = true; par.add(s); motes.push({ s, o: Math.random(), a: Math.random() * 6.28 }); }
    anim(g, t => {
      const k = 0.5 + 0.5 * Math.sin(t * 3);
      if (rainbow) tmp.setHSL((t * 0.35) % 1, 1, 0.6); else tmp.copy(A).lerp(Bc, k);
      shells.forEach(({ m, op }, i) => { m.material.color.copy(tmp); if (rainbow) m.material.color.setHSL((t * 0.35 + i * 0.12) % 1, 1, 0.6); m.material.opacity = op * (0.7 + 0.45 * Math.sin(t * 4 + i * 1.3)); });
      halo.material.color.copy(tmp); halo.material.opacity = 0.35 + 0.2 * k;
      motes.forEach(({ s, o, a }, i) => { const f = (t * 0.55 + o) % 1, ang = a + t * 2.5;
        s.position.set(ctr.x + Math.cos(ang) * len * 0.22, ctr.y + (f - 0.5) * len * 1.1, ctr.z + Math.sin(ang) * len * 0.22);
        s.scale.setScalar(len * 0.09 * (1 - f * 0.6)); s.material.opacity = 1 - f;
        if (rainbow) s.material.color.setHSL((t * 0.4 + i / 14) % 1, 1, 0.65); else s.material.color.copy(i % 2 ? A : Bc); });
    });
  };
  const KNIFE_VIBRANT = {
    butterfly: {
      hyperwave: { name: 'Hyperwave', rarity: 'Mythic', price: 3000, body: 0x14061e, bodyGloss: 2, accent: 0xff2fa8, glow: 0x1de9ff, blade: 'hyperblade', trail: 0xff2fa8, trail2: 0x1de9ff, mod: vibrantAura(0xff2fa8, 0x1de9ff) },
      solarflare: { name: 'Solar Flare', rarity: 'Mythic', caseOnly: true, case: 'nova', body: 0x2a0e02, bodyGloss: 2, accent: 0xff7a00, glow: 0xffd24a, blade: 'molten', trail: 0xffd24a, trail2: 0xff3a00, mod: vibrantAura(0xff7a00, 0xffe14d) },
      spectrum: { name: 'Spectrum', rarity: 'Exotic', caseOnly: true, case: 'nova', body: 0xf4f4ff, bodyGloss: 2, accent: 0xffffff, glow: 0xffffff, blade: 'prismblade', trail: -1, mod: vibrantAura(0xff3df2, 0x1de9ff, true) },
    },
    knife: {
      supernovaclaw: { name: 'Supernova Claw', rarity: 'Mythic', price: 3000, body: 0x2a1a02, bodyGloss: 2, accent: 0xffc93a, glow: 0xfff0b0, blade: 'goldrush', trail: 0xfff3b0, trail2: 0xffb000, mod: vibrantAura(0xffd24a, 0xffffff) },
      abyssalbloom: { name: 'Abyssal Bloom', rarity: 'Mythic', caseOnly: true, body: 0x12041e, bodyGloss: 2, accent: 0xff3df2, glow: 0xb04bff, blade: 'nebula', trail: 0xff3df2, trail2: 0x7b2cff, mod: vibrantAura(0xff3df2, 0x7b2cff) },
      frostreaper: { name: 'Frost Reaper', rarity: 'Exotic', caseOnly: true, case: 'nova', body: 0xdff4ff, bodyGloss: 2, accent: 0x6fc8ff, glow: 0xdff8ff, blade: 'glacier', trail: 0xffffff, trail2: 0x1de9ff, mod: vibrantAura(0x6fe8ff, 0xffffff) },
    },
    bayonet: {
      plasmaedge: { name: 'Plasma Edge', rarity: 'Mythic', price: 3000, body: 0x060a1e, bodyGloss: 2, accent: 0x1de9ff, glow: 0xff3df2, blade: 'storm', trail: 0x1de9ff, trail2: 0xff3df2, mod: vibrantAura(0x1de9ff, 0xff3df2) },
      toxicrush: { name: 'Toxic Rush', rarity: 'Mythic', caseOnly: true, body: 0x061a04, bodyGloss: 2, accent: 0x7dff3a, glow: 0xe8ff3a, blade: 'acidblade', trail: 0xe8ff3a, trail2: 0x1fdc3c, mod: vibrantAura(0x7dff3a, 0xe8ff3a) },
      prismstorm: { name: 'Prism Storm', rarity: 'Exotic', caseOnly: true, case: 'nova', body: 0xf4f4ff, bodyGloss: 2, accent: 0xffffff, glow: 0xffffff, blade: 'prismblade', trail: -1, mod: vibrantAura(0xff3df2, 0x1de9ff, true) },
    },
  };
  // ---- M9-style bayonet blueprints (shop, Release Case, Nova Case). Blades are animated where it
  // counts; `trail` adds the glowing blade trail in first person (same as Nightshade).
  BLADES.tideblade = animBlade('tidewater', 0.7);
  BLADES.emberblade = animBlade('molten', 1);
  BLADES.solarblade = animBlade('liquidgold', 0.5);
  BLADES.glacier = () => new THREE.MeshPhongMaterial({ color: 0xd8f4ff, specular: 0xffffff, shininess: 200, transparent: true, opacity: 0.82, emissive: 0x2a6a9a, side: THREE.DoubleSide });
  BLADES.nightops = () => new THREE.MeshPhongMaterial({ color: 0x2a2d32, specular: 0x6a7078, shininess: 40, side: THREE.DoubleSide });
  // glowing line down the fuller + along the saw teeth
  const bayGlow = (g, mat) => { const inr = g.userData.inner; if (!inr) return;
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.0046, 0.05, 0.0024), mat); f.position.set(0, 0.076, 0.0056); inr.add(f);
    for (const x of [-0.0021, 0.0021]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.064, 0.0016), mat); r.position.set(x, 0.067, 0.0135); inr.add(r); } };
  const BAYBP = {
    nightops: { name: 'Night Ops', rarity: 'Rare', price: 450, body: 0x101113, accent: 0x101113, glow: 0x6a7078, blade: 'nightops' },
    fade: { name: 'Fade', rarity: 'Legendary', price: 1300, body: 0x121216, accent: 0x121216, glow: 0xff5ec4, blade: 'fade' },
    doppler: { name: 'Doppler', rarity: 'Legendary', price: 1300, body: 0x0e0e12, accent: 0x0e0e12, glow: 0x4a8bff, blade: 'doppler' },
    riptide: { name: 'Riptide', rarity: 'Legendary', price: 1500, body: 0x06162e, bodyGloss: 2, accent: 0x50beff, glow: 0x9fe8ff, blade: 'tideblade',
      mod(g, k, P) { const G = liveGlow(0x9fe8ff); hueCycle(g, G, 0.52, 0.58, 2, 0.7); bayGlow(g, G); } },
    emberfang: { name: 'Emberfang', rarity: 'Mythic', price: 2600, body: 0x1a0805, bodyGloss: 1, accent: 0xff6a00, glow: 0xff6a00, blade: 'emberblade', trail: 0xff7a1a,
      mod(g, k, P) { const G = liveGlow(0xff7a00); hueCycle(g, G, 0.02, 0.1, 4, 0.55); bayGlow(g, G);
        const inr = g.userData.inner, fl = [];
        for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.0034, 0.016, 5), G); f.position.set(0, 0.044 + i * 0.011, 0.018); inr.add(f); fl.push(f); }
        anim(g, t => fl.forEach((f, i) => { f.scale.y = 0.5 + 0.8 * Math.abs(Math.sin(t * 9 + i * 1.9)); f.position.z = 0.017 + 0.004 * f.scale.y; })); } },
    glacier: { name: 'Glacier', rarity: 'Legendary', caseOnly: true, body: 0xbfeaff, bodyGloss: 2, accent: 0xe8f6ff, glow: 0xdff6ff, blade: 'glacier',
      mod(g, k, P) { const ice = crystal(0xd8f4ff), inr = g.userData.inner, sh = [];
        for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), ice); s.scale.y = 2; inr.add(s); sh.push(s); }
        anim(g, t => sh.forEach((s, i) => { const a = t * 1.3 + i / 4 * 6.283; s.position.set(Math.sin(a) * 0.012, 0.03 + ((t * 0.05 + i / 4) % 1) * 0.12, Math.cos(a) * 0.028); s.rotation.set(t * 2 + i, t, 0); })); } },
    gammaburst: { name: 'Gamma Burst', rarity: 'Mythic', caseOnly: true, body: 0x03140a, bodyGloss: 2, accent: 0x39ff88, glow: 0x39ff88, blade: 'gamma', trail: 0x39ff88,
      mod(g, k, P) { const G = liveGlow(0x39ff88); hueCycle(g, G, 0.3, 0.42, 2.4, 0.58); bayGlow(g, G);
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.0108, 0.0016, 8, 24), G); r.rotation.y = Math.PI / 2; r.position.set(0, -0.006, 0.033); g.userData.inner.add(r); } },
    solarcrown: { name: 'Solar Crown', rarity: 'Mythic', caseOnly: true, case: 'nova', body: 0x2a1a02, bodyGloss: 2, accent: 0xffc93a, accentGloss: 2, glow: 0xffd24a, blade: 'solarblade', trail: 0xffc93a, season: 2,
      mod(g, k, P) { const G = liveGlow(0xffd24a); hueCycle(g, G, 0.1, 0.15, 3, 0.6); bayGlow(g, G); const inr = g.userData.inner;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0015, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.rotation.x = Math.PI / 2; halo.position.y = -0.006; inr.add(halo);
        const rays = orbiters(g, 8, new THREE.ConeGeometry(0.002, 0.01, 4), G, 0, -0.006, 0, 0.036, 1.5, 'y'); inr.add(rays);
        anim(g, t => { halo.material.opacity = 0.5 + 0.35 * Math.sin(t * 3); halo.scale.setScalar(1 + 0.06 * Math.sin(t * 3)); }); } },
    singularity: { name: 'Singularity', rarity: 'Exotic', caseOnly: true, case: 'nova', body: 0x07020f, bodyGloss: 2, accent: 0xb04bff, glow: 0xff3df2, blade: 'riftblade', trail: 0xd06bff, season: 2,
      mod(g, k, P) { const G = liveGlow(0xff3df2); hueCycle(g, G, 0.75, 0.92, 1.4, 0.62); bayGlow(g, G); const inr = g.userData.inner;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })); core.position.y = -0.138; inr.add(core);
        const disk = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.019, 32), new THREE.MeshBasicMaterial({ color: 0xd06bff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        disk.position.y = -0.138; disk.rotation.x = 1.2; inr.add(disk);
        const motes = orbiters(g, 5, new THREE.OctahedronGeometry(0.0025, 0), G, 0, -0.138, 0, 0.022, 4, 'y'); inr.add(motes);
        anim(g, t => { disk.rotation.z = t * 2.5; disk.material.opacity = 0.55 + 0.3 * Math.sin(t * 4); }); } },
  };
  S2BP.bayonet = BAYBP;
  for (const w in KNIFE_VIBRANT) S2BP[w] = Object.assign(S2BP[w] || {}, KNIFE_VIBRANT[w]);
  for (const w in S2BP) MYTHIC[w] = Object.assign(MYTHIC[w] || {}, S2BP[w]);
  for (const w in MYTHIC) BLUEPRINTS[w] = Object.assign(BLUEPRINTS[w] || {}, MYTHIC[w]);
  // ---- v1.10 GRIND blueprints: never sold, never in cases — earned through challenges
  BLADES.soulblade = animBlade('g_soul', 0.95);
  const GRIND_BP = {
    rifle: { stormcaller: { name: 'Stormcaller', rarity: 'Mythic', grind: { stat: 'w:rifle', n: 150, label: '150 kills with the Rifle' }, body: 0x0a1030, bodyGloss: 2, accent: 0x9fd8ff, accentGloss: 2, glow: 0x9fd8ff,
      mod(g, k, P) {
        const G = liveGlow(0x9fd8ff); hueCycle(g, G, 0.55, 0.65, 3, 0.7);
        k.box(0.08, 0.085, 0.3, 0, 0.035, -0.35, chrome(0x1a2a5a));
        for (const x of [-0.043, 0.043]) k.box(0.004, 0.012, 0.3, x, 0.035, -0.35, G);
        // a crackling storm cell round the muzzle: three spinning arcs + a cloud of sparks
        const cell = new THREE.Group(); cell.position.set(0, 0.035, -0.62); g.add(cell);
        const arcs = [0, 1, 2].map(i => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.05 + i * 0.012, 0.003, 6, 20, Math.PI * 1.2), G); cell.add(r); return r; });
        const sparks = []; for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), liveGlow(0xffffff)); cell.add(s); sparks.push(s); }
        anim(g, t => { arcs.forEach((r, i) => { r.rotation.set(t * (3 + i), t * (2 - i), t * 4 * (i % 2 ? 1 : -1)); }); const f = Math.floor(t * 14);
          sparks.forEach((s, i) => { const a = (f * 7 + i * 13) % 31 / 31 * 6.28, r = 0.03 + ((f + i) % 5) * 0.01; s.position.set(Math.cos(a) * r, Math.sin(a) * r, ((f + i * 3) % 7 - 3) * 0.01); s.visible = (f + i) % 3 !== 0; }); });
        // lightning bolts running down the handguard, flickering
        const bolts = []; for (let i = 0; i < 4; i++) { const b = k.box(0.003, 0.003, 0.05, (i % 2 ? 0.044 : -0.044), 0.01 + (i % 3) * 0.01, -0.2 - i * 0.07, G); b.rotation.x = (i % 2 ? 0.6 : -0.6); bolts.push(b); }
        anim(g, t => bolts.forEach((b, i) => { b.visible = Math.floor(t * 9 + i * 2) % 3 !== 0; }));
      } } },
    smg: { hollowfang: { name: 'Hollowfang', rarity: 'Mythic', grind: { stat: 'zkills', n: 1000, label: '1,000 zombie kills' }, body: 0x140a06, bodyGloss: 1, accent: 0xff7a1a, glow: 0xff7a1a,
      mod(g, k, P) {
        const G = liveGlow(0xff7a1a); hueCycle(g, G, 0.03, 0.09, 5, 0.55);
        // a carved jack-o'-lantern drum mag with a flickering candle inside
        const drum = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshPhongMaterial({ color: 0xff7a1a, emissive: 0x5a2200, shininess: 40 })); drum.scale.set(1, 0.8, 1); drum.position.set(0, -0.09, -0.02); g.add(drum);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), G); face.position.set(0.051, -0.09, -0.02); face.rotation.y = Math.PI / 2; g.add(face);
        const face2 = face.clone(); face2.position.x = -0.051; face2.rotation.y = -Math.PI / 2; g.add(face2);
        anim(g, t => { const f = 0.6 + 0.4 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)); face.scale.setScalar(f); face2.scale.setScalar(f); });
        // bone teeth along the barrel shroud + green soul wisps rising
        for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.025, 4), bpMat(0xe8dcc0, 1)); c.position.set(0, -0.005, -0.12 - i * 0.025); c.rotation.x = Math.PI; g.add(c); }
        const W = liveGlow(0x7dff3a), wisps = []; for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), W); g.add(w); wisps.push(w); }
        anim(g, t => wisps.forEach((w, i) => { const k2 = (t * 0.4 + i / 5) % 1; w.position.set(Math.sin(t * 3 + i) * 0.02, 0.06 + k2 * 0.1, -0.1 - i * 0.03); w.scale.setScalar(1 - k2); }));
      } } },
    sniper: { zenith: { name: 'Zenith', rarity: 'Mythic', grind: { stat: 'wh:sniper', n: 50, label: '50 headshot kills with the Sniper' }, body: 0xf4f0ff, bodyGloss: 2, accent: 0xb48cff, accentGloss: 2, glow: 0xffffff,
      mod(g, k, P) {
        const G = liveGlow(0xffffff); hueCycle(g, G, 0.7, 0.85, 1.4, 0.82);
        const gold = chrome(0xffd36a);
        // a sun disc + two counter-rotating halos round the scope, a comet of stars down the barrel
        const halo = new THREE.Group(); halo.position.set(0, 0.13, -0.08); g.add(halo);
        const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 8, 40), gold), h2 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.003, 8, 40), G); halo.add(h1, h2);
        for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 4), gold); const a = i / 8 * 6.28; r.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0); r.rotation.z = a - Math.PI / 2; h2.add(r); }
        anim(g, t => { h1.rotation.set(t * 0.8, t * 1.3, 0); h2.rotation.z = -t * 0.9; halo.scale.setScalar(1 + 0.04 * Math.sin(t * 3)); });
        orbiters(g, 6, new THREE.OctahedronGeometry(0.008, 0), G, 0, 0.04, -0.78, 0.055, 2.2, 'z');
        glowStrip(k, G, 0.6, 0, 0.058, -0.55);
        for (const x of [-0.033, 0.033]) k.box(0.003, 0.01, 0.34, x, 0.03, 0.0, G);
      } } },
    bayonet: { reapersedge: { name: "Reaper's Edge", rarity: 'Exotic', grind: { stat: 'knife', n: 75, label: '75 knife kills' }, body: 0x07020f, bodyGloss: 2, accent: 0x39ff88, glow: 0x39ff88, blade: 'soulblade', trail: 0x39ff88, trail2: 0xb04bff, mod: vibrantAura(0x39ff88, 0xb04bff) } },
    pistol: { sovereign: { name: 'Sovereign', rarity: 'Mythic', grind: { stat: 'odtime', n: 300, label: 'Survive 5:00 in Overdrive' }, body: 0x1a0a2a, bodyGloss: 2, accent: 0xffd24a, accentGloss: 2, glow: 0xff5ec4,
      mod(g, k, P) {
        const G = liveGlow(0xff5ec4); hueCycle(g, G, 0.85, 0.98, 2.6, 0.62); const gold = chrome(0xffd24a);
        // a floating crown above the slide and gem orbiters round the muzzle
        const crown = new THREE.Group(); crown.position.set(0, 0.12, -0.08); g.add(crown);
        crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 16, 1, true), gold));
        for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.022, 4), gold); const a = i / 6 * 6.28; sp.position.set(Math.cos(a) * 0.03, 0.017, Math.sin(a) * 0.03); crown.add(sp); }
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), G); gem.position.y = 0.012; crown.add(gem);
        anim(g, t => { crown.rotation.y = t * 1.2; crown.position.y = 0.12 + Math.sin(t * 2.4) * 0.006; });
        orbiters(g, 4, new THREE.OctahedronGeometry(0.006, 0), G, 0, 0.056, -0.27, 0.035, 3, 'z');
        for (const x of [-0.0225, 0.0225]) glowStrip(k, G, 0.2, x, 0.062, -0.08);
      } } },
  };
  for (const w in GRIND_BP) BLUEPRINTS[w] = Object.assign(BLUEPRINTS[w] || {}, GRIND_BP[w]);
  // ---- v1.23 OVERDRIVE blueprints (original designs, made for the imported models): a living animated finish, energy
  // veins traced along both sides of the real model (circuit-style steps, pulses racing toward the muzzle), a spinning
  // twin-ring reactor at the muzzle, a breathing rim glow and sparkles. Every colour shifts through the theme's palette.
  const OVERDRIVE_THEMES = {
    eventhorizon: { name: 'Event Horizon', tex: 'voidrift', cols: [0xb04bff, 0xff3df2, 0x5a8bff], emi: 0.85 },
    supernova:    { name: 'Supernova', tex: 'g_starforge', cols: [0xffd24a, 0xff6a00, 0xfff4c0], emi: 0.8 },
    cryopulse:    { name: 'Cryo Pulse', tex: 'tidewater', cols: [0x6fe8ff, 0xffffff, 0x2f7bff], emi: 0.7 },
    toxicstorm:   { name: 'Toxic Storm', tex: 'acid', cols: [0x7dff3a, 0xe8ff3a, 0x1fdc8c], emi: 0.8 },
    neontokyo:    { name: 'Neon Tokyo', tex: 'hyperspace', cols: [0xff2fa8, 0x1de9ff, 0xb04bff], emi: 0.9 },
    magmacore:    { name: 'Magma Core', tex: 'molten', cols: [0xff3a00, 0xffb000, 0xff6a00], emi: 1 },
    stormsurge:   { name: 'Storm Surge', tex: 'electric', cols: [0x9fd8ff, 0xffffff, 0x4a6bff], emi: 0.9 },
    infinity:     { name: 'Infinity', tex: 'prism', cols: [0xff3df2, 0x1de9ff, 0xffe14d], emi: 0.75, rainbow: true },
  };
  function overdriveMod(th) {
    return (g, k, P) => {
      const C = th.cols.map(c => new THREE.Color(c)), tmp = new THREE.Color();
      const live = (i) => { const m = liveGlow(th.cols[i % th.cols.length]); anim(g, t => { if (th.rainbow) m.color.setHSL((t * 0.15 + i * 0.21) % 1, 1, 0.6); else { const f = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.1); m.color.copy(C[i % C.length]).lerp(C[(i + 1) % C.length], f); } }); return m; };
      if (!P.camo) {                                                         // the living finish
        const mat = new THREE.MeshPhongMaterial({ map: TEX[th.tex](), emissive: 0xffffff, emissiveMap: TEX[th.tex](), emissiveIntensity: th.emi * 0.55, specular: 0xffffff, shininess: 120, envMap: BR.weaponEnv(), reflectivity: 0.25 });
        g.traverse(o => { if (o.isMesh && o.material === P.B) o.material = mat; });
        mat.userData.finish = 'overdrive';
        anim(g, t => { mat.emissiveIntensity = th.emi * (0.45 + 0.2 * Math.sin(t * 2.2)); });
      }
      if (!g.userData.imported || !P.keep) return;
      const I = impRef(P.id, g, P.keep), melee = !!BR.CONFIG.weapons[P.id].melee, rng = BR.util.rng(hsh(th.name + P.id)), B = I.box;
      // energy veins: a far-out guide line along each side, stepping up / down like a circuit trace, seated on the surface
      const lines = melee ? [] : [[1, 0.62], [1, 0.36], [-1, 0.62], [-1, 0.36]];
      const z0 = Math.min(B.max.z - 0.02, I.grip.z + 0.25), z1 = I.muzzle.z + 0.02, top = Math.max(I.muzzle.y, I.grip.y), H = B.max.y - B.min.y;
      lines.forEach(([side, lv], li) => {
        let y = I.grip.y + (top - I.grip.y + 0.05) * lv, nextStep = z0 - 0.04 - rng() * 0.08; const seats = [];
        for (let z = z0; z > z1; z -= 0.005) {
          if (z < nextStep) { y += (rng() < 0.5 ? -1 : 1) * H * 0.05; y = clampN(y, I.grip.y - 0.01, B.max.y - 0.012); nextStep = z - 0.05 - rng() * 0.1; }
          const q = nearestSurf(I, new THREE.Vector3(side * (B.max.x + 0.004), y, z), 0.05);
          seats.push(q && Math.sign(q.p.x || side) === side && Math.abs(q.p.y - y) < 0.03 ? { q: q.p.clone().addScaledVector(q.n, 0.0012), n: q.n.clone() } : null);
        }
        const rb = ribbonSeats(seats, 0.0032, flowMat(g, live(li)), 0.03, new THREE.Vector3(0, 0, -1)); if (rb) g.add(rb);
      });
      // twin-ring reactor at the muzzle (or round the blade for knives) + a soft halo
      const ctr = melee ? (I.blade || B).getCenter(new THREE.Vector3()) : I.muzzle.clone().add(new THREE.Vector3(0, 0, 0.03));
      const R0 = melee ? 0.03 : Math.max(0.022, Math.min(0.045, (B.max.x - B.min.x) * 0.7));
      const r1 = ring(g, R0, 0.0022, live(0), ctr.x, ctr.y, ctr.z), r2 = ring(g, R0 * 1.3, 0.0016, live(1), ctr.x, ctr.y, ctr.z);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.Effects ? BR.Effects.tex().soft : null, color: th.cols[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(ctr); halo.scale.setScalar(R0 * 4); g.add(halo);
      for (const o of [r1, r2, halo]) { o.userData.isFlash = true; o.userData.noUV = true; }
      anim(g, t => { r1.rotation.set(t * 2.2, t * 1.3, 0); r2.rotation.set(-t * 1.6, 0, t * 2.4); const s = 1 + 0.08 * Math.sin(t * 6); r1.scale.setScalar(s); r2.scale.setScalar(2 - s);
        halo.material.opacity = 0.35 + 0.25 * Math.sin(t * 4); if (th.rainbow) halo.material.color.setHSL((t * 0.15) % 1, 1, 0.6); else halo.material.color.copy(C[0]).lerp(C[1], 0.5 + 0.5 * Math.sin(t * 1.7)); });
    };
  }
  const OVERDRIVE_SETS = {
    pistol: ['neontokyo', 'supernova'], smg: ['toxicstorm', 'eventhorizon'], shotgun: ['magmacore', 'cryopulse'], rifle: ['eventhorizon', 'infinity'],
    holoar: ['stormsurge', 'neontokyo'], sniper: ['cryopulse', 'infinity'], hunter: ['supernova', 'eventhorizon'], revolver: ['magmacore', 'stormsurge'],
    lmg: ['toxicstorm', 'supernova'], dmr: ['neontokyo', 'magmacore'], launcher: ['infinity', 'stormsurge'],
  };
  for (const w in OVERDRIVE_SETS) OVERDRIVE_SETS[w].forEach((key, i) => {
    const th = OVERDRIVE_THEMES[key], exotic = key === 'infinity';
    (BLUEPRINTS[w] = BLUEPRINTS[w] || {})['od_' + key] = { name: th.name, rarity: exotic ? 'Exotic' : 'Mythic', price: exotic ? 4000 : 3200, season: 3, fx: true, fit: 'own',
      body: 0x101018, bodyGloss: 2, accent: th.cols[1], accentGloss: 2, glow: th.cols[0], mod: overdriveMod(th) };
  });
  // ---- v1.13 TRACKER blueprints (original designs). Goldrune: an engraved gold blade (gold gradient,
  // brushed grain, an etched band of interlocking scrolls + runes) on the olive grip.
  BLADES.goldrune = () => new THREE.MeshPhongMaterial({ shininess: 170, specular: 0xfff0b0, emissive: 0x2a1a00, side: THREE.DoubleSide, map: bladeTex('goldrune', (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s * 0.4); g.addColorStop(0, '#8a6514'); g.addColorStop(0.35, '#e8bd4a'); g.addColorStop(0.6, '#f6d878'); g.addColorStop(1, '#a87a1a');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,190' : '90,60,10'},${0.05 + Math.random() * 0.12})`; c.fillRect(Math.random() * s, Math.random() * s, 1, 3 + Math.random() * 10); }   // brushed grain
    // etched band (wraps the u=0 seam so it sits mid-blade): two interlaced scroll lines with rune ticks + dots
    const band = (cx) => {
      for (const [col, lw, off] of [['rgba(70,45,5,0.85)', 3.2, 0], ['rgba(255,236,170,0.55)', 1.2, -1.2]]) {
        c.strokeStyle = col; c.lineWidth = lw;
        for (const ph of [0, Math.PI]) { c.beginPath(); for (let y = 0; y <= s; y += 2) { const x = cx + off + Math.sin(y / s * Math.PI * 6 + ph) * 9; y ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
        for (let k = 0; k < 6; k++) { const y = (k + 0.5) / 6 * s; c.beginPath(); c.moveTo(cx + off - 5, y - 6); c.lineTo(cx + off, y); c.lineTo(cx + off + 5, y - 6); c.stroke(); c.beginPath(); c.arc(cx + off, y + 10, 1.8, 0, 7); c.stroke(); }
      }
      c.strokeStyle = 'rgba(70,45,5,0.7)'; c.lineWidth = 1.4; for (const dx of [-15, 15]) { c.beginPath(); c.moveTo(cx + dx, 0); c.lineTo(cx + dx, s); c.stroke(); }
    };
    band(-2); band(s - 2);
  }) });
  BLADES.timber = () => new THREE.MeshPhongMaterial({ shininess: 40, specular: 0x444444, side: THREE.DoubleSide, map: bladeTex('timber', (c, s) => {
    c.fillStyle = '#5a5a3a'; c.fillRect(0, 0, s, s); const cols = ['#2f3a1e', '#6b5a36', '#1f2316', '#7a7a4a'];
    for (let i = 0; i < 60; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); const x = Math.random() * s, y = Math.random() * s; c.ellipse(x, y, 8 + Math.random() * 22, 5 + Math.random() * 12, Math.random() * 3, 0, 7); c.fill(); }
  }) });
  BLUEPRINTS.tracker = {
    blackout:    { name: 'Blackout', rarity: 'Rare', price: 450, body: 0x161816, accent: 0x161816, glow: 0x5a6068, blade: 'nightops' },
    timberline:  { name: 'Timberline', rarity: 'Epic', price: 750, body: 0x3a2a1a, accent: 0x3a2a1a, glow: 0x8a7a4a, blade: 'timber' },
    goldrune:    { name: 'Goldrune', rarity: 'Legendary', price: 1600, body: 0x2c3524, accent: 0x2c3524, glow: 0xffd24a, blade: 'goldrune' },
    glacierfang: { name: 'Glacier Fang', rarity: 'Legendary', price: 1500, body: 0xcfe6f2, bodyGloss: 2, accent: 0xe8f6ff, glow: 0xdff6ff, blade: 'glacier' },
    magmatooth:  { name: 'Magma Tooth', rarity: 'Mythic', price: 2800, body: 0x1a0805, bodyGloss: 1, accent: 0xff6a00, glow: 0xff6a00, blade: 'emberblade', trail: 0xff7a1a, trail2: 0xffd24a, mod: vibrantAura(0xff6a00, 0xffd24a) },
    aurumprime:  { name: 'Aurum Prime', rarity: 'Exotic', price: 3500, body: 0x1a1206, bodyGloss: 2, accent: 0xffd24a, glow: 0xffd24a, blade: 'solarblade', trail: 0xffd24a, trail2: 0xffffff, mod: vibrantAura(0xffd24a, 0xffffff) },
  };  // knives: a living blade, the aura, a long two-tone trail
  BLADES.od_void = animBlade('voidrift', 0.9); BLADES.od_nova = animBlade('g_starforge', 0.9); BLADES.od_cryo = animBlade('tidewater', 0.8); BLADES.od_prism = animBlade('prism', 0.8);
  const OD_KNIVES = {
    knife: { od_eventhorizon: ['Event Horizon', 'od_void', 0xb04bff, 0xff3df2, 'Mythic'] },
    bayonet: { od_supernova: ['Supernova', 'od_nova', 0xffd24a, 0xff6a00, 'Mythic'] },
    tracker: { od_cryopulse: ['Cryo Pulse', 'od_cryo', 0x6fe8ff, 0xffffff, 'Mythic'] },
    butterfly: { od_infinity: ['Infinity', 'od_prism', 0xff3df2, 0x1de9ff, 'Exotic'] },
  };
  for (const w in OD_KNIVES) for (const id in OD_KNIVES[w]) { const [name, blade, a, b, rarity] = OD_KNIVES[w][id];
    (BLUEPRINTS[w] = BLUEPRINTS[w] || {})[id] = { name, rarity, price: rarity === 'Exotic' ? 4200 : 3400, season: 3, body: 0x0c0a14, bodyGloss: 2, accent: b, glow: a, blade, trail: rarity === 'Exotic' ? -1 : a, trail2: b, mod: vibrantAura(a, b, rarity === 'Exotic') }; }

  // Signature tracers: every Legendary / Mythic blueprint fires its own tracer (used when that
  // gun's tracer is set to "Blueprint Signature"). Hand-picked styles, the rest derived from the glow.
  const SIG = {
    vandal: ['dual', 0xff2e63, 0xffffff], gilded: ['spark', 0xffe9a0, 0xffc93a], neonrush: ['helix', 0x22e6ff, 0xffffff], dragon: ['spark', 0xffd24a, 0xff3a1f],
    cyber: ['lightning', 0xdff8ff, 0x2ff3ff], executioner: ['dual', 0xff2a2a, 0x2a0000], timberwolf: ['spark', 0xffd08a, 0xff8a1f],
    neonviper: ['helix', 0x1de9ff, 0xff2fa8], solarflare: ['spark', 0xffe14d, 0xff6a00], glitch: ['lightning', 0x39ff14, 0xff2bd6], frostbite: ['helix', 0xdff8ff, 0x6ff0ff],
    celestial: ['spark', 0xd8c4ff, 0xffd36a], aurora: ['dual', 0x00ffa6, 0x9b5cff], plasma: ['helix', 0xff3df2, 0xffffff], dragonlord: ['spark', 0xffc93a, 0xff2a00],
    quantum: ['lightning', 0xffffff, 0x3aa0ff], synthwave: ['dual', 0xff2fa8, 0x1de9ff], volcano: ['spark', 0xffb000, 0xff3a00], thunder: ['lightning', 0xdff4ff, 0x6f8bff],
    phantom: ['helix', 0xeaf8ff, 0x9fd8ff], kitsune: ['spark', 0xff3a5c, 0xffffff],
  };
  for (const w in BLUEPRINTS) for (const b in BLUEPRINTS[w]) {
    const bp = BLUEPRINTS[w][b];
    if (BR.CONFIG.weapons[w] && BR.CONFIG.weapons[w].melee || !(bp.rarity === 'Legendary' || bp.rarity === 'Mythic' || bp.rarity === 'Exotic')) continue;
    const sg = SIG[b] || ['dual', bp.glow, 0xffffff];
    bp.tracer = bp.tracer || { name: bp.name + ' Signature', style: sg[0], color: sg[1], color2: sg[2] };
    // signature reload animation (viewmodel): twirl | flip | toss | spin | glitch, VFX in the blueprint's glow
    const RL = { vandal: 'twirl', gilded: 'spin', neonrush: 'glitch', dragon: 'flip', cyber: 'glitch', executioner: 'twirl', timberwolf: 'flip', neonviper: 'twirl',
      solarflare: 'flip', glitch: 'glitch', frostbite: 'flip', celestial: 'toss', aurora: 'twirl', plasma: 'spin', dragonlord: 'flip', quantum: 'glitch', synthwave: 'twirl',
      volcano: 'toss', thunder: 'flip', phantom: 'glitch', kitsune: 'spin', chroma: 'twirl', wildhunt: 'flip' };
    bp.reload = bp.reload || { style: w === 'revolver' ? 'spin' : RL[b] || (bp.rarity === 'Legendary' ? 'twirl' : 'flip'), fx: bp.glow };
  }
  BLUEPRINTS.butterfly = BLUEPRINTS.butterfly || {}; BLUEPRINTS.revolver = BLUEPRINTS.revolver || {};
  for (const [w, set] of Object.entries({ burst: [['midnight', 'Midnight', 'Rare', 0x14161c, 0x2f5aa8, 0x6fa8ff, 450], ['carbontalon', 'Carbon Talon', 'Epic', 0x1a1c20, 0xff7a00, 0xffb066, 750]],
    riot: [['bulldog', 'Bulldog', 'Rare', 0x3a2c22, 0x8a6a4a, 0xd8b88a, 450], ['hexdrum', 'Hex Drum', 'Epic', 0x101418, 0x39ff88, 0x9dffcf, 750]],
    pump: [['ranchhand', 'Ranch Hand', 'Rare', 0x2a2c30, 0x6b3a1c, 0xd8a060, 450], ['blackout', 'Blackout', 'Epic', 0x0e0f12, 0xc8102e, 0xff4a5a, 750]],
    mpistol: [['wasp', 'Wasp', 'Rare', 0x1a1a10, 0xffd24a, 0xffe08a, 400], ['frostbyte', 'Frostbyte', 'Epic', 0x0e1a26, 0x6fd8ff, 0xdff6ff, 700]] }))
    for (const [id, name, rarity, body, accent, glow, price] of set) (BLUEPRINTS[w] = BLUEPRINTS[w] || {})[id] = { name, rarity, body, accent, glow, price };
  // v1.32 Common / Uncommon blueprints for every weapon: honest painted finishes (no glow, no add-ons), plus a Street Case pair
  {
    const LOW = [
      ['field', 'Field Issue', 'Common', 0x4a5530, 0x2a2e22, 0x8a9a5a, 150], ['desert', 'Dune Runner', 'Common', 0xb59a6a, 0x6b5536, 0xe8d2a0, 150],
      ['patrol', 'Patrol', 'Uncommon', 0x2a2f37, 0x46525e, 0x7fd0ff, 300], ['redstripe', 'Red Stripe', 'Uncommon', 0x1c1e22, 0xc8102e, 0xff5a5a, 320],
      ['st_tag', 'Street Tag', 'Uncommon', 0x16181c, 0xff3d7f, 0x1de9ff, 'street'], ['st_brick', 'Brickyard', 'Common', 0x7a2e22, 0x3a1a14, 0xd8a080, 'street'],
    ];
    for (const w of Object.keys(BR.CONFIG.weapons)) {
      const T = BLUEPRINTS[w] = BLUEPRINTS[w] || {};
      for (const [id, name, rarity, body, accent, glow, price] of LOW) if (!T[id]) T[id] = Object.assign({ name, rarity, body, accent, glow, low: true }, price === 'street' ? { caseOnly: true, case: 'street' } : { price });
    }
  }
  for (const w in BLUEPRINTS) BLUEPRINTS[w] = Object.assign({ default: { name: 'Standard Issue', rarity: 'Base', price: 0 } }, BLUEPRINTS[w]);

  // ------------------------------------------------------------------ gloves
  const GLOVES = {
    default: { name: 'Tactical', price: 0, color: 0x2a2d33, pad: 0x15171a },
    desert:  { name: 'Desert Ops', price: 150, color: 0xb39a72, pad: 0x6f5a3c },
    // v1.32 Common / Uncommon
    c_olive: { name: 'Field Olive', price: 100, rarity: 'Common', color: 0x4a5530, pad: 0x262b18 },
    c_black: { name: 'Black Leather', price: 120, rarity: 'Common', color: 0x17181b, pad: 0x0b0b0d, gloss: true },
    u_hivis: { name: 'Hi-Vis', price: 220, rarity: 'Uncommon', color: 0xd7ff2a, pad: 0x2a2d33 },
    u_wood:  { name: 'Woodland', price: 260, rarity: 'Uncommon', tex: 'u_woodland', color: 0x4f5a34, pad: 0x1e1a14 },
    u_street:{ name: 'Paint Splash', caseOnly: true, case: 'street', rarity: 'Uncommon', tex: 'u_splash', color: 0xff3d7f, pad: 0x16181c },
    r_wild:  { name: 'Wildcat', caseOnly: true, case: 'street', rarity: 'Rare', tex: 'r_wildcat', color: 0xff7a00, pad: 0x111111 },
    arctic:  { name: 'Arctic Camo', price: 200, tex: 'arctic', pad: 0x8d9aa5 },
    carbon:  { name: 'Carbon Fiber', price: 250, tex: 'carbon', pad: 0x3a3f47 },
    crimson: { name: 'Crimson Leather', price: 300, color: 0x8f1424, pad: 0x2a0509, gloss: true },
    tiger:   { name: 'Tiger Claw', price: 350, tex: 'tiger', pad: 0x1a1209 },
    neon:    { name: 'Neon Grid', price: 450, tex: 'neon', pad: 0x0c0e10, glow: 0x2ff3ff },
    galaxy:  { name: 'Galaxy', price: 550, tex: 'galaxy', pad: 0x120a26, glow: 0xb48cff },
    gold:    { name: 'Gilded', price: 750, color: 0xe6b422, pad: 0x3a2a05, gloss: true, glow: 0xfff0b0 },
    hyper:   { name: 'Vice', price: 800, tex: 'hyper', pad: 0x1de9ff, glow: 0x1de9ff, fx: true, rarity: 'Legendary' },
    scales:  { name: 'Wyvern', price: 850, tex: 'scales', pad: 0x0b1f1a, glow: 0x9dffcf, fx: true, rarity: 'Legendary' },
    bloodmoon:{ name: 'Crimson Web', price: 900, tex: 'bloodmoon', emissive: 0.9, pad: 0x120002, glow: 0xff1f3d, fx: true, rarity: 'Legendary' },
    circuit: { name: 'Overclock', price: 1000, tex: 'circuit', emissive: 1, pad: 0x05140f, glow: 0x2bffb0, fx: true, rarity: 'Mythic' },
    molten:  { name: 'Magma Fist', price: 1100, tex: 'molten', emissive: 1, pad: 0x1a0a04, glow: 0xff7a00, fx: true, rarity: 'Mythic' },
    electric:{ name: 'Storm Caller', price: 1100, tex: 'electric', emissive: 1, pad: 0x0a1030, glow: 0x6fc8ff, fx: true, rarity: 'Mythic' },
    prism:   { name: 'Prismatic', price: 1300, tex: 'prism', emissive: 0.45, gloss: true, pad: 0xffffff, glow: 0xffffff, fx: true, rarity: 'Mythic' },
    // ---- Release Case exclusives
    c_jungle: { name: 'Jungle Ops', caseOnly: true, rarity: 'Rare', tex: 'jungle', pad: 0x1d2a12 },
    c_holo:   { name: 'Hologram', caseOnly: true, rarity: 'Epic', tex: 'holo', emissive: 0.5, gloss: true, pad: 0xe6f8ff, glow: 0x7af7ff, fx: true },
    c_nebula: { name: 'Nebula', caseOnly: true, rarity: 'Legendary', tex: 'nebula', emissive: 0.9, pad: 0x1a0a2a, glow: 0xff6af0, fx: true },
    c_inferno:{ name: 'Inferno', caseOnly: true, rarity: 'Legendary', tex: 'inferno', emissive: 1, pad: 0x2a0003, glow: 0xffb000, fx: true },
    c_aurora: { name: 'Aurora', caseOnly: true, rarity: 'Mythic', tex: 'aurora', emissive: 1, pad: 0x020a14, glow: 0x00ffa6, fx: true },
    c_gold:   { name: 'Liquid Gold', caseOnly: true, rarity: 'Exotic', tex: 'liquidgold', emissive: 0.35, gloss: true, pad: 0x8a5a00, glow: 0xfff3b0, fx: true },
    // Season 2 gloves (animated)
    hyperspace: { name: 'Lightspeed', price: 1200, tex: 'hyperspace', emissive: 1, pad: 0x05050f, glow: 0x1de9ff, fx: true, rarity: 'Mythic' },
    opal:       { name: 'Pearl Touch', price: 1000, tex: 'opal', gloss: true, pad: 0xf2f4ff, glow: 0xffd6f6, fx: true, rarity: 'Legendary' },
    acid:       { name: 'Biohazard', caseOnly: true, case: 'nova', tex: 'acid', emissive: 1, pad: 0x041a06, glow: 0x7dff3a, fx: true, rarity: 'Mythic' },
    voidrift:   { name: 'Riftgrip', caseOnly: true, case: 'nova', tex: 'voidrift', emissive: 1, pad: 0x07020f, glow: 0xb04bff, fx: true, rarity: 'Exotic' },
  };
  function gloveMats(id) {
    const key = 'glove-' + id;
    if (cache.mat[key]) return cache.mat[key];
    const G = GLOVES[id] || GLOVES.default;
    let main;
    if (G.tex === 'neon') main = skinMaterial('neon');
    else if (G.tex && G.emissive) main = new THREE.MeshPhongMaterial({ map: TEX[G.tex](), emissive: 0xffffff, emissiveMap: TEX[G.tex](), emissiveIntensity: G.emissive, specular: 0x888888, shininess: G.gloss ? 110 : 40 });
    else if (G.tex) main = G.gloss || G.fx ? new THREE.MeshPhongMaterial({ map: TEX[G.tex](), specular: 0xffffff, shininess: 80 }) : new THREE.MeshLambertMaterial({ map: TEX[G.tex]() });
    else main = G.gloss ? new THREE.MeshPhongMaterial({ color: G.color, specular: 0xffffff, shininess: 70 }) : new THREE.MeshPhongMaterial({ map: fabricTex(G.color), specular: 0x2a2a2a, shininess: 14 });
    // v1.17: woven fabric grain on every glove, a grippy stipple on the pads
    if (main.isMeshLambertMaterial) main = new THREE.MeshPhongMaterial({ map: main.map, color: main.color, specular: 0x2a2a2a, shininess: 14 });
    if (!main.normalMap && !G.emissive && G.tex !== 'neon') { main.normalMap = NRM.weave(); main.normalScale = new THREE.Vector2(0.6, 0.6); if (main.map) { main.map = main.map.clone(); main.map.needsUpdate = true; main.map.repeat.set(2, 2); } }
    const pad = G.fx ? new THREE.MeshPhongMaterial({ color: G.pad, specular: 0xffffff, shininess: 120 }) : new THREE.MeshPhongMaterial({ color: G.pad, specular: 0x333333, shininess: 18, normalMap: NRM.stipple(), normalScale: new THREE.Vector2(0.8, 0.8) });
    return (cache.mat[key] = { main, pad, glow: G.glow ? glowMat(G.glow) : null, fx: !!G.fx });
  }
  // Merge a group's meshes into one mesh per material (fewer draw calls). Keeps uvs for textures.
  function mergeByMaterial(g) {
    g.updateMatrixWorld(true);
    const buckets = new Map();
    g.traverse(o => {
      if (!o.isMesh) return;
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(geo);
    });
    const out = new THREE.Group();
    for (const [mat, geos] of buckets) {
      let n = 0; for (const q of geos) n += q.attributes.position.count;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2);
      let o = 0;
      for (const q of geos) {
        P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3);
        if (q.attributes.uv) UV.set(q.attributes.uv.array, o * 2);
        o += q.attributes.position.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.computeBoundingSphere();
      out.add(new THREE.Mesh(geo, mat));
    }
    return out;
  }

  // A gloved hand, fingers along -Z curling down (-Y), thumb on +X (mirrored for the left hand).
  // Three-segment fingers with knuckles, two-part thumb, rounded palm, knuckle guard, back plate,
  // round cuff with a strap. Merged per material and cached per glove + side.
  const handCache = {};
  // fist = fingers closed round a handle (karambit); otherwise the relaxed gun-grip curl
  function hand(id, left, fist) {
    const key = (id || 'default') + (left ? 'L' : 'R') + (fist === 'point' ? 'P' : fist ? 'F' : '');
    if (!handCache[key]) handCache[key] = buildHand(id, left, fist);
    const g = new THREE.Group();
    for (const m of handCache[key].children) { const c = new THREE.Mesh(m.geometry, m.material); c.userData.glove = true; g.add(c); }
    return g;
  }
  function buildHand(id, left, fist) {
    const m = gloveMats(id), g = new THREE.Group(), sx = left ? -1 : 1;
    const put = (geo, mat, x, y, z, rx, ry, rz, par) => { const o = new THREE.Mesh(geo, mat); o.position.set(x * sx, y, z); o.rotation.set(rx || 0, (ry || 0) * sx, (rz || 0) * sx); (par || g).add(o); return o; };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r1, r2, len, seg) => new THREE.CylinderGeometry(r1, r2, len, seg || 8);
    const sph = (r) => new THREE.SphereGeometry(r, 10, 8);
    // palm: core + rounded heel + slightly domed back
    // (v1.11: rounded instead of a box, so the glove reads as a hand, not a block)
    const core = put(sph(0.03), m.main, 0, 0, -0.004); core.scale.set(0.86, 0.42, 1.12);
    const heel = put(sph(0.026), m.main, 0, -0.004, 0.018); heel.scale.set(1.0, 0.55, 0.75);
    const dome = put(sph(0.028), m.main, 0, 0.005, -0.008); dome.scale.set(0.92, 0.42, 1.1);
    const pinky = put(sph(0.014), m.main, -0.021, -0.001, 0.004); pinky.scale.set(0.7, 0.8, 1.6);      // fleshy outer edge
    // fingers: three phalanges each, chained so the curl reads naturally
    // fist: true = all fingers closed; 'point' = index finger straight (the karambit ring spins on it)
    const lens = [0.023, 0.017, 0.013], radii = [0.0079, 0.0072, 0.0066], curl = fist ? [1.2, 1.45, 1.1] : [0.55, 0.95, 0.75], straight = [0.06, 0.08, 0.04];
    for (let i = 0; i < 4; i++) {
      const fx = -0.0195 + i * 0.013, fy = 0.002 + (i === 1 || i === 2 ? 0.0015 : 0), lenK = i === 0 ? 0.85 : i === 3 ? 0.95 : 1;
      let par = new THREE.Group(); par.position.set(fx * sx, fy, -0.03); g.add(par);
      put(sph(radii[0] * 1.15), m.main, 0, 0, 0, 0, 0, 0, par);                               // knuckle
      for (let k = 0; k < 3; k++) {
        const joint = new THREE.Group(); joint.rotation.x = -(fist === 'point' && i === 3 ? straight[k] : curl[k]); par.add(joint);
        const L = lens[k] * lenK;
        const seg = put(cyl(radii[k], radii[k] * 0.92, L, 8), m.main, 0, 0, -L / 2, Math.PI / 2, 0, 0, joint);
        seg.position.x = 0;
        put(sph(radii[k] * 0.98), m.main, 0, 0, -L, 0, 0, 0, joint).position.x = 0;            // joint / fingertip
        const next = new THREE.Group(); next.position.z = -L; joint.add(next); par = next;
      }
    }
    // thumb: two segments angled across the front of the fist
    const tb = new THREE.Group(); tb.position.set(0.026 * sx, -0.008, -0.004); tb.rotation.set(fist ? 0.75 : 0.35, (fist ? -0.95 : -0.75) * sx, (fist ? 0.35 : 0.2) * sx); g.add(tb);
    put(sph(0.0105), m.main, 0, 0, 0, 0, 0, 0, tb).position.x = 0;
    put(cyl(0.0098, 0.009, 0.022, 8), m.main, 0, 0, -0.011, Math.PI / 2, 0, 0, tb).position.x = 0;
    const t2 = new THREE.Group(); t2.position.z = -0.022; t2.rotation.x = fist ? -0.8 : -0.45; tb.add(t2);
    put(cyl(0.0088, 0.0080, 0.016, 8), m.main, 0, 0, -0.008, Math.PI / 2, 0, 0, t2).position.x = 0;
    put(sph(0.008), m.main, 0, 0, -0.016, 0, 0, 0, t2).position.x = 0;
    // armour: knuckle guard + back plate
    put(cyl(0.0052, 0.0052, 0.05, 10), m.pad, 0, 0.0095, -0.031, 0, 0, Math.PI / 2);
    const plate = put(sph(0.022), m.pad, 0, 0.0135, -0.004, -0.08, 0, 0); plate.scale.set(0.95, 0.22, 0.85);
    for (const px of [-0.011, 0.011]) { const r = put(sph(0.008), m.pad, px, 0.0175, -0.004, -0.08, 0, 0); r.scale.set(0.7, 0.25, 1.5); }
    // cuff + strap + velcro tab
    put(cyl(0.03, 0.032, 0.032, 16), m.pad, 0, 0.0, 0.046, Math.PI / 2, 0, 0);
    put(cyl(0.0325, 0.0325, 0.008, 16), m.glow || m.main, 0, 0.0, 0.04, Math.PI / 2, 0, 0);
    put(box(0.022, 0.006, 0.016), m.main, 0, 0.032, 0.046);
    if (m.fx && m.glow) {                                                      // flashy gloves: glowing studs + seams
      for (let i = 0; i < 4; i++) put(box(0.0065, 0.004, 0.0065), m.glow, -0.0195 + i * 0.013, 0.0165, -0.031);
      for (const px of [-0.022, 0.022]) put(box(0.003, 0.003, 0.034), m.glow, px, 0.0185, -0.002);
    } else if (m.glow) put(box(0.03, 0.003, 0.003), m.glow, 0, 0.0215, -0.016);
    void plate;
    return mergeByMaterial(g);
  }

  // Parachute: striped canopy + suspension lines. Origin = the wearer's shoulders.
  function parachute(colorA, colorB) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(2.3, 16, 5, 0, Math.PI * 2, 0, 1.15);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(colorA), b = new THREE.Color(colorB);
    for (let i = 0; i < pos.count; i++) {
      const ang = Math.atan2(pos.getZ(i), pos.getX(i)), c = Math.floor((ang + Math.PI) / (Math.PI / 4)) % 2 ? a : b;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    dome.scale.set(1, 0.55, 1); dome.position.y = 3.2;
    g.add(dome);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
    for (let i = 0; i < 6; i++) {
      const ang = i / 6 * Math.PI * 2, top = new THREE.Vector3(Math.cos(ang) * 2.0, 3.6, Math.sin(ang) * 2.0), bot = new THREE.Vector3(Math.cos(ang) * 0.2, 0.1, Math.sin(ang) * 0.15);
      const d = top.clone().sub(bot), len = d.length();
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 3), lineMat);
      l.position.copy(bot).addScaledVector(d, 0.5);
      l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.add(l);
    }
    return g;
  }


  // ------------------------------------------------------------------ v1.16 blueprint finishes
  // Every non-default gun + knife blueprint gets a real surface finish instead of a flat colour, chosen
  // by rarity: Rare = machined (brushed metal, panel lines, screws), Epic = carbon weave or hex armour,
  // Legendary = engraved filigree with a gilt border, Mythic/Exotic = an animated prismatic flow. On
  // top, crisp accent edge lines trace the model's hard edges (glowing + pulsing from Legendary up), and
  // knife blades get a glowing edge line. Edge lines live with the part they trace (so slides, bolts,
  // mags and knife parts keep them while animating) and never go into the merged world model.
  const TIER = { Common: 0.4, Uncommon: 0.7, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4, Exotic: 5 };
  const hsh = k => { let h = 2166136261; for (const ch of k) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const css = c => '#' + new THREE.Color(c).getHexString();
  const tone = (c, k) => { const o = new THREE.Color(c); if (k > 0) o.lerp(new THREE.Color(0xffffff), k); else o.multiplyScalar(1 + k); return '#' + o.getHexString(); };
  function finishMat(key, bp) {
    const ck = 'fin:' + key; if (cache.mat[ck]) return cache.mat[ck];
    const t0 = TIER[bp.rarity] || 1, t = Math.max(1, Math.floor(t0)), low = t0 < 1, body = bp.body != null ? bp.body : 0x444444, acc = bp.accent != null && bp.accent !== body ? bp.accent : (bp.glow != null ? bp.glow : 0xc8ccd2), glow = bp.glow != null ? bp.glow : acc;
    const dark = new THREE.Color(body).getHSL({}).l < 0.28, line = dark ? tone(body, 0.32) : tone(body, -0.5), hi = tone(body, dark ? 0.5 : 0.35), R = BR.util.rng(hsh(key));
    const style = low ? (t0 < 0.5 ? 'painted' : 'striped') : t >= 4 ? 'prism' : t === 3 ? 'engraved' : t === 2 ? (hsh(key) % 2 ? 'carbon' : 'hex') : 'machined';
    const tex = canvasTex('fin-' + key, (c, S) => {
      c.fillStyle = css(body); c.fillRect(0, 0, S, S);
      if (style === 'painted' || style === 'striped') {             // v1.32 Common / Uncommon: satin paint, a two-tone break, light wear
        c.fillStyle = css(acc); c.fillRect(0, S * 0.62, S, S * 0.38); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, S * 0.62 - 2, S, 3);
        if (style === 'striped') { c.fillStyle = css(glow); c.fillRect(0, S * 0.18, S, 6); c.fillRect(0, S * 0.18 + 10, S, 2); }
        for (let i = 0; i < 1600; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; c.fillRect(R() * S, R() * S, 1, 1); }
        for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.08 + R() * 0.1) + ')'; c.fillRect(R() * S, R() * S, 1 + R() * 2, 1); }
      }
      if (style === 'machined' || style === 'engraved') {           // brushed grain
        for (let i = 0; i < 700; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,' + (0.03 + R() * 0.05) + ')' : 'rgba(0,0,0,' + (0.04 + R() * 0.06) + ')'; c.fillRect(R() * S, R() * S, 10 + R() * 60, 1); }
      }
      if (style === 'machined') {
        c.lineWidth = 2; c.strokeStyle = line;
        for (const x of [S * 0.32, S * 0.71]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
        c.beginPath(); c.moveTo(0, S * 0.5); c.lineTo(S, S * 0.5); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; for (const x of [S * 0.32 + 2, S * 0.71 + 2]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
        c.fillStyle = line; for (const [x, y] of [[0.16, 0.25], [0.16, 0.75], [0.52, 0.25], [0.52, 0.75], [0.86, 0.25], [0.86, 0.75]]) { c.beginPath(); c.arc(x * S, y * S, 3.2, 0, 7); c.fill(); }
        c.fillStyle = css(acc); c.globalAlpha = 0.85; c.fillRect(0, S * 0.08, S, 5); c.fillRect(0, S * 0.9, S, 3); c.globalAlpha = 1;    // accent pinstripes
      } else if (style === 'carbon') {
        const q = 16;
        for (let y = 0; y < S; y += q) for (let x = 0; x < S; x += q) {
          const odd = ((x + y) / q) % 2, g2 = c.createLinearGradient(x, y, odd ? x + q : x, odd ? y : y + q);
          g2.addColorStop(0, tone(body, dark ? 0.16 : -0.15)); g2.addColorStop(0.5, tone(body, dark ? 0.04 : -0.05)); g2.addColorStop(1, tone(body, dark ? 0.2 : -0.2));
          c.fillStyle = g2; c.fillRect(x + 1, y + 1, q - 2, q - 2);
        }
        c.save(); c.translate(S / 2, S / 2); c.rotate(-0.5); c.fillStyle = css(acc); c.globalAlpha = 0.9; c.fillRect(-S, -10, S * 2, 8); c.globalAlpha = 0.5; c.fillRect(-S, 4, S * 2, 3); c.restore();
      } else if (style === 'hex') {
        const r = 14, w = r * Math.sqrt(3);
        for (let row = -1; row < S / (r * 1.5) + 1; row++) for (let col = -1; col < S / w + 1; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
          c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5)); } c.closePath();
          c.fillStyle = R() < 0.12 ? css(acc) : tone(body, (R() - 0.5) * 0.18); c.globalAlpha = 1; c.fill();
          c.strokeStyle = line; c.lineWidth = 1.6; c.stroke();
        }
      } else if (style === 'engraved') {
        const gold = css(acc);
        c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 3.2;
        const scroll = (x, y, rr, dir) => { c.beginPath(); for (let a = 0; a < 9.5; a += 0.15) { const rad = rr * (1 - a / 11); c.lineTo(x + Math.cos(a * dir) * rad, y + Math.sin(a * dir) * rad); } c.stroke(); };
        for (const pass of [0, 1]) {
          if (pass) { c.strokeStyle = gold; c.lineWidth = 1.6; }
          for (let i = 0; i < 6; i++) { const x = (i % 3 + 0.5) / 3 * S, y = (Math.floor(i / 3) + 0.5) / 2 * S; scroll(x, y, 26, i % 2 ? 1 : -1); scroll(x + 30, y + 22, 12, i % 2 ? -1 : 1); }
          c.beginPath(); for (let x = 0; x <= S; x += 4) c.lineTo(x, S * 0.5 + Math.sin(x / S * Math.PI * 6) * 14); c.stroke();
        }
        c.strokeStyle = gold; c.lineWidth = 5; c.strokeRect(5, 5, S - 10, S - 10); c.lineWidth = 1.5; c.strokeRect(13, 13, S - 26, S - 26);
      } else {                                                          // prism: flowing gradient + sparkle + faint hex
        const g2 = c.createLinearGradient(0, 0, S, S); g2.addColorStop(0, css(body)); g2.addColorStop(0.3, css(acc)); g2.addColorStop(0.55, css(glow)); g2.addColorStop(0.8, css(body)); g2.addColorStop(1, css(acc));
        c.fillStyle = g2; c.globalAlpha = 0.55; c.fillRect(0, 0, S, S); c.globalAlpha = 1;
        for (let i = 0; i < 160; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.25 + R() * 0.6) + ')'; const x = R() * S, y = R() * S, z = 0.6 + R() * 1.6; c.fillRect(x - z, y, z * 2 + 1, 1); c.fillRect(x, y - z, 1, z * 2 + 1); }
        c.strokeStyle = css(glow); c.globalAlpha = 0.35; c.lineWidth = 1.2; const r = 18, w = r * Math.sqrt(3);
        for (let row = -1; row < S / (r * 1.5) + 1; row++) for (let col = -1; col < S / w + 1; col++) { const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5; c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.stroke(); }
        c.globalAlpha = 1;
      }
      // fine edge vignette so every panel reads as a machined plate
      const v = c.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)'); c.fillStyle = v; c.fillRect(0, 0, S, S);
      c.fillStyle = hi; c.globalAlpha = 0.25; c.fillRect(0, 0, S, 2); c.globalAlpha = 1;
    }, 256);
    const m = low ? new THREE.MeshPhongMaterial({ map: tex, specular: 0x30343a, shininess: 20, envMap: BR.weaponEnv(), reflectivity: 0.04 })
      : new THREE.MeshPhongMaterial({ map: tex, specular: t >= 3 ? 0xffffff : 0xa8b0bc, shininess: [0, 45, 70, 110, 140, 150][t], envMap: BR.weaponEnv(), reflectivity: [0, 0.08, 0.12, 0.2, 0.26, 0.3][t] });
    if (t >= 4) m.emissive = new THREE.Color(glow).multiplyScalar(0.08);
    m.userData.finish = style;
    return (cache.mat[ck] = m);
  }
  // One LineSegments per parent object (so moving parts keep their lines), local to that parent
  function edgeLines(g, test, color, opacity, additive, threshold) {
    g.updateMatrixWorld(true);
    const buckets = new Map();
    g.traverse(o => {
      if (!o.isMesh || !o.visible || !test(o) || !o.parent || o.geometry.attributes.position.count > 8000) return;
      const e = new THREE.EdgesGeometry(o.geometry, threshold); e.applyMatrix4(o.matrix);
      if (!buckets.has(o.parent)) buckets.set(o.parent, []);
      buckets.get(o.parent).push(e.attributes.position.array);
    });
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    for (const [par, arrs] of buckets) {
      let n = 0; for (const a of arrs) n += a.length; const P = new Float32Array(n); let o = 0; for (const a of arrs) { P.set(a, o); o += a.length; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      const L = new THREE.LineSegments(geo, mat); L.userData.noMerge = true; L.renderOrder = 2; par.add(L);
    }
    return buckets.size ? mat : null;
  }
  // ------------------------------------------------------------------ v1.33 BLUEPRINT FORGE
  // Every blueprint gets real extra geometry, not just a new finish, scaled by rarity and fitted to the actual model:
  // rays find the gun's real surface (so nothing floats or sinks), parts hang off the moving pieces they belong to.
  //   Rare:      ported compensator (unsuppressed guns) + bolted side plates
  //   Epic:      + chamfered armour panels + a vented barrel collar
  //   Legendary: + swept side fins + gilt barrel rings + a glowing medallion
  //   Mythic:    + hovering energy blades beside the barrel + a pulsing core crystal
  //   Exotic:    + a rainbow halo round the muzzle, everything hue-cycling
  // Knives: guard plates, handle wraps, a pommel gem, orbiting shards, a halo (by rarity), riding the blade through flips.
  const FORGE_T = { Uncommon: 0.5, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4, Exotic: 5 };
  const _rc = new THREE.Raycaster();
  function forgeHits(g) { const list = []; g.traverse(o => { if (o.isMesh && !o.userData.isFlash && !o.userData.forge && o.visible) list.push(o); }); return list; }
  // first surface hit from `from` along `dir` (group space), or null
  function forgeRay(g, list, from, dir) {
    _rc.set(g.localToWorld(from.clone()), dir.clone().transformDirection(g.matrixWorld).normalize()); _rc.far = 2;
    const h = _rc.intersectObjects(list, false)[0]; return h ? g.worldToLocal(h.point.clone()) : null;
  }
  function forgePart(par, mesh) { mesh.userData.forge = true; mesh.userData.noUV = true; par.add(mesh); return mesh; }
  function chamferPanel(w, h, d, c) {          // a plate with cut corners, extruded (d = thickness, along x)
    const sh = new THREE.Shape(), a = w / 2, b = h / 2;
    sh.moveTo(-a + c, -b); sh.lineTo(a - c, -b); sh.lineTo(a, -b + c); sh.lineTo(a, b - c); sh.lineTo(a - c, b); sh.lineTo(-a + c, b); sh.lineTo(-a, b - c); sh.lineTo(-a, -b + c); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: d * 0.35, bevelSize: d * 0.35, bevelSegments: 2 }); geo.translate(0, 0, -d / 2); geo.rotateY(Math.PI / 2); return geo;
  }
  function finGeo(len, h, d) {                 // a swept crest: rises from the front, sweeps back to a point
    const sh = new THREE.Shape(); sh.moveTo(len * 0.5, 0); sh.quadraticCurveTo(len * 0.1, h * 0.3, -len * 0.25, h); sh.lineTo(-len * 0.5, h * 0.82); sh.quadraticCurveTo(-len * 0.2, h * 0.2, -len * 0.4, 0); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: d * 0.4, bevelSize: d * 0.3, bevelSegments: 2 }); geo.translate(0, 0, -d / 2); geo.rotateY(Math.PI / 2); return geo;
  }
  function bpForge(g, id, bp) {
    const t = FORGE_T[bp.rarity]; if (!t) return;
    const def = BR.CONFIG.weapons[id] || {}, acc = bp.accent != null ? bp.accent : (bp.body != null ? bp.body : 0x888888), glow = bp.glow != null ? bp.glow : acc;
    const A = bpMat(acc, bp.accentGloss || 1), Gm = glowMat(glow), Ch = cache.mat['forgeCh' + acc] || (cache.mat['forgeCh' + acc] = chrome(new THREE.Color(acc).lerp(new THREE.Color(0xffffff), 0.35).getHex()));
    const dark = MAT().dark, metal = MAT().metal;
    g.updateMatrixWorld(true);
    if (def.melee) return forgeKnife(g, t, A, Gm, Ch, metal, glow);
    const list = forgeHits(g), I = bodyInfo(g), ud = g.userData, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const gz = ud.grip ? ud.grip.z : I.z1 - 0.15, fz = ud.fore ? ud.fore.z : gz - 0.25, zA = Math.max(gz, fz) - 0.02, zB = Math.min(gz, fz) + 0.02, zm = (zA + zB) / 2, span = Math.abs(zA - zB);
    const y0 = I.by - 0.012;
    // side surfaces at the receiver (outermost of a few samples, so long plates never sink in)
    const sideX = sx => { let best = null; for (const z of [zA - span * 0.15, zm, zB + span * 0.15]) { const h = forgeRay(g, list, V(sx * 0.4, y0, z), V(-sx, 0, 0)); if (h && (best === null || Math.abs(h.x) > Math.abs(best))) best = h.x; } return best; };
    const parts = [];
    // Rare: compensator + bolted side plates
    if (t >= 1 && !def.suppressed && !bp.mod && !def.launcher && ud.muzzle) {
      const m = ud.muzzle.position, r = (() => { const h = forgeRay(g, list, V(0.3, m.y, m.z + 0.01), V(-1, 0, 0)); return h ? Math.max(0.008, Math.min(0.022, Math.abs(h.x))) : 0.012; })();
      const cg = new THREE.Group(); cg.position.set(0, m.y, m.z); g.add(cg);
      forgePart(cg, new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 1.25, 0.05, 18), dark)).rotation.x = Math.PI / 2; cg.children[0].position.z = -0.02;
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const sl = forgePart(cg, new THREE.Mesh(new THREE.BoxGeometry(0.003, r * 1.1, 0.008), MAT().grip)); sl.position.set(sx * r * 1.3, 0, -0.008 - i * 0.013); }
      forgePart(cg, new THREE.Mesh(new THREE.TorusGeometry(r * 1.3, 0.0018, 6, 18), A)).position.z = -0.044;
      ud.muzzle.position.z -= 0.045; if (ud.flash) ud.flash.position.z -= 0.045;
    }
    const plates = [];
    for (const sx of [-1, 1]) {
      const x = sideX(sx); if (x === null) continue;
      const px = x + sx * 0.0022;
      if (t >= 1) { const pl = forgePart(g, new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, span * 0.62), A)); pl.position.set(px, y0, zm); plates.push(pl);
        for (const dz of [-0.4, 0, 0.4]) forgePart(g, new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, 8), metal)).position.set(px + sx * 0.002, y0, zm + dz * span * 0.6), g.children[g.children.length - 1].rotation.z = Math.PI / 2;
        forgePart(g, new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0025, span * 0.5), Gm)).position.set(px + sx * 0.0006, y0 + 0.0095, zm); }
      if (t >= 2) { const ap = forgePart(g, new THREE.Mesh(chamferPanel(span * 0.34, 0.03, 0.003, 0.006), A)); ap.position.set(px + sx * 0.003, y0 - 0.02, zA - span * 0.22); plates.push(ap);
        for (let i = 0; i < 3; i++) forgePart(g, new THREE.Mesh(new THREE.BoxGeometry(0.0036, 0.004, 0.012), dark)).position.set(px + sx * 0.0048, y0 - 0.02 + (i - 1) * 0.008, zA - span * 0.22); }
      if (t >= 3) { const fin = forgePart(g, new THREE.Mesh(finGeo(span * 0.42, 0.032, 0.0025), Ch)); fin.position.set(px + sx * 0.004, y0 - 0.006, zB + span * 0.18); fin.rotation.z = sx * 0.55;
        const md = forgePart(g, new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.003, 20), Ch)); md.rotation.z = Math.PI / 2; md.position.set(px + sx * 0.004, y0 + 0.002, zA - span * 0.08);
        const mg = forgePart(g, new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0034, 14), Gm)); mg.rotation.z = Math.PI / 2; mg.position.set(px + sx * 0.0052, y0 + 0.002, zA - span * 0.08); }
    }
    // Epic: a vented collar on the barrel ahead of the handguard; Legendary: gilt rings
    const barrelR = z => { const h = forgeRay(g, list, V(0.3, I.by, z), V(-1, 0, 0)); return h ? Math.abs(h.x) : null; };
    if (t >= 2 && ud.muzzle) for (const [k, kind] of (t >= 3 ? [[0.16, 'ring'], [0.26, 'ring'], [0.38, 'collar']] : [[0.32, 'collar']])) {
      const z = I.z0 + (fz - I.z0) * k, r = barrelR(z); if (!r || r > 0.026) continue;
      if (kind === 'ring') forgePart(g, new THREE.Mesh(new THREE.TorusGeometry(r + 0.0016, 0.0022, 8, 22), Ch)).position.set(0, I.by, z);
      else { const c = forgePart(g, new THREE.Mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.03, 20), dark)); c.rotation.x = Math.PI / 2; c.position.set(0, I.by, z);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const v = forgePart(g, new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.02), Gm)); v.position.set(Math.cos(a) * (r + 0.0045), I.by + Math.sin(a) * (r + 0.0045), z); v.rotation.z = a; } }
    }
    // Mythic: energy blades hovering beside the barrel + a core crystal on the side plate; Exotic: halo
    if (t >= 4) {
      const L = Math.min(0.24, Math.abs(fz - I.z0) * 0.7), bz = I.z0 + (fz - I.z0) * 0.45, Lg = liveGlow(glow);
      const blades = [-1, 1].map(sx => { const b = forgePart(g, new THREE.Mesh(finGeo(L, 0.022, 0.0015), Lg)); b.position.set(sx * (I.hw + 0.018), I.by + 0.004, bz); b.rotation.z = sx * 1.2; b.userData.adsHide = true; return b; });
      const cr = forgePart(g, new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), crystal(glow))); const x0 = sideX(1); cr.position.set((x0 === null ? I.hw : x0) + 0.012, y0 - 0.004, zm);
      anim(g, tt => { blades.forEach((b, i) => { b.position.y = I.by + 0.004 + Math.sin(tt * 2.2 + i * 3.1) * 0.0035; }); cr.rotation.y = tt * 1.6; cr.scale.setScalar(1 + 0.12 * Math.sin(tt * 4)); Lg.color.setHex(glow).multiplyScalar(0.75 + 0.25 * Math.sin(tt * 3)); if (t >= 5) Lg.color.setHSL((tt * 0.15) % 1, 1, 0.6); });
    }
    if (t >= 5 && ud.muzzle) { const Hm = liveGlow(glow), h = forgePart(g, new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.002, 6, 36), Hm)); h.position.set(0, ud.muzzle.position.y, ud.muzzle.position.z + 0.04); h.userData.adsHide = true;
      anim(g, tt => { h.rotation.z = tt * 1.2; h.rotation.x = Math.sin(tt * 0.9) * 0.35; Hm.color.setHSL((tt * 0.18 + 0.3) % 1, 1, 0.62); }); }
    void parts;
  }
  function forgeKnife(g, t, A, Gm, Ch, metal, glow) {
    const ud = g.userData, bm = ud.bladeMesh, tipL = ud.trailTip; if (!tipL || !ud.grip) return;
    // work in the space the blade moves in (the inner group on bayonets / karambits, the blade itself on butterflies)
    const host = ud.handleA ? (bm || g) : (ud.trailSpace || g);
    g.updateMatrixWorld(true);
    const toHost = v => host.worldToLocal((ud.trailSpace && ud.trailSpace !== host ? ud.trailSpace : g).localToWorld(v.clone()));
    const tip = toHost(tipL), gripW = host.worldToLocal(g.localToWorld(ud.grip.clone()));
    let root = gripW.clone().lerp(tip, 0.32);
    if (bm && bm.geometry.attributes.position) { const P = bm.geometry.attributes.position, v = new THREE.Vector3(); let bd = 1e9;
      for (let i = 0; i < P.count; i += 9) { v.fromBufferAttribute(P, i); bm.localToWorld(v); host.worldToLocal(v); const d = v.distanceTo(gripW); if (d < bd) { bd = d; root.copy(v); } } }
    const ax = tip.clone().sub(gripW).normalize(); root = gripW.clone().addScaledVector(ax, Math.max(0.01, root.clone().sub(gripW).dot(ax)));      // (on the grip-tip axis)
    const dir = tip.clone().sub(root); const bl = dir.length(); if (bl < 0.02) return; dir.normalize();
    const handleLen = Math.min(0.12, Math.max(0.06, root.distanceTo(gripW) * 2)), curved = !!ud.handleA || (g.userData.trailSpace && !ud.bayonet);     // butterfly / karambit: blade-riding parts only
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), at = (k, m) => { m.position.copy(root).addScaledVector(dir, k); m.quaternion.copy(q); return forgePart(host, m); };
    if (t >= 1 && !curved) for (const k of [-0.3, -0.55]) at(k * handleLen, new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0022, 6, 18), A)).rotateX(Math.PI / 2);
    if (t >= 2) { if (!curved) at(0.004, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.016), Ch)); for (const sx of [-1, 1]) { const s = at(0.006, new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), Gm)); s.translateX(sx * (curved ? 0.008 : 0.022)); } }
    if (t >= 3) { if (!curved) { at(-handleLen - 0.004, new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.014, 12), Ch)); at(-handleLen - 0.016, new THREE.Mesh(new THREE.OctahedronGeometry(0.0075, 0), crystal(glow))); }
      else at(0.012, new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), crystal(glow))); }
    if (t >= 4) { const piv = new THREE.Group(); piv.position.copy(root).addScaledVector(dir, bl * 0.55); piv.quaternion.copy(q); forgePart(host, piv); const cg = crystal(glow);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, sh = forgePart(piv, new THREE.Mesh(new THREE.OctahedronGeometry(0.0055, 0), cg)); sh.position.set(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03); }
      anim(g, tt => { piv.rotation.y = tt * 1.8; piv.children.forEach((c, i) => { c.rotation.set(tt * 3 + i, tt * 2, 0); c.position.y = Math.sin(tt * 2.5 + i * 2) * 0.008; }); }); }
    if (t >= 5) { const Hm = liveGlow(glow), h = at(0.012, new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0018, 6, 30), Hm)); h.rotateX(Math.PI / 2); anim(g, tt => { h.rotation.z = tt * 1.4; Hm.color.setHSL((tt * 0.18) % 1, 1, 0.62); }); }
  }
  function bpUpgrade(g, id, bpId, bp, S, opts) {
    const t = TIER[bp.rarity]; if (!t) return;
    const F = finishMat(id + ':' + bpId, bp), melee = !!(BR.CONFIG.weapons[id] || {}).melee;
    g.traverse(o => { if (o.isMesh && o.material === S) o.material = F; });
    const acc = bp.accent != null && bp.accent !== bp.body ? bp.accent : (bp.glow != null ? bp.glow : 0xc8ccd2), glow = bp.glow != null ? bp.glow : acc;
    if (t < 0.5) return;                                         // Common: just the paint
    const em = edgeLines(g, o => o.material === F, t >= 3 ? glow : new THREE.Color(acc).lerp(new THREE.Color(0xffffff), 0.35), t >= 3 ? 0.85 : t < 1 ? 0.3 : 0.55, t >= 3, 30);
    const bm = melee && opts.blade ? edgeLines(g, o => o.material === opts.blade, glow, t >= 3 ? 0.8 : 0.4, true, 35) : null;
    if (t >= 3) anim(g, tt => {
      const k = 0.5 + 0.5 * Math.sin(tt * (t >= 4 ? 3.2 : 2));
      if (em) em.opacity = 0.55 + 0.4 * k; if (bm) bm.opacity = 0.45 + 0.5 * k;
      if (t >= 5 && em) em.color.setHSL((tt * 0.12) % 1, 1, 0.62);
    });
    if (t >= 4 && F.map) anim(g, tt => { F.map.offset.set((tt * 0.035) % 1, (tt * 0.02) % 1); });
    // v1.32: Legendary+ finishes breathe light through their own pattern (gilt engraving glints, prism flows glow)
    if (t >= 3 && F.map) { if (!F.userData.glint) { F.userData.glint = true; F.emissiveMap = F.map; F.emissive = new THREE.Color(glow); F.needsUpdate = true; }
      anim(g, tt => { F.emissiveIntensity = (t >= 4 ? 0.16 : 0.08) + (t >= 4 ? 0.12 : 0.1) * (0.5 + 0.5 * Math.sin(tt * (t >= 5 ? 3.4 : 2.2))); if (t >= 5) F.emissive.setHSL((tt * 0.12) % 1, 1, 0.55); }); }
  }

  // v1.17: every part with a detailed surface gets box-mapped UVs in real units (the same texel density
  // on every gun, no stretched faces), and standard-finish models get faint machined edge highlights.
  function boxUV(m, k) {
    const geo = m.geometry = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    m.updateMatrix(); const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m.matrix);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); n.fromBufferAttribute(N, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ax >= ay && ax >= az) { uv[i * 2] = v.z * k; uv[i * 2 + 1] = v.y * k; } else if (ay >= az) { uv[i * 2] = v.z * k; uv[i * 2 + 1] = v.x * k + 0.31; } else { uv[i * 2] = v.x * k + 0.57; uv[i * 2 + 1] = v.y * k; }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  function realPass(g, edges) {
    if (g.userData.imported && g.userData.importedTextured) return;
    const imp = !!g.userData.imported;
    if (imp) edges = false;                                   // sculpted imports already carry their own edges
    g.updateMatrixWorld(true);
    g.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.real && !o.userData.noUV && !o.geometry.userData.boxed && o.geometry.attributes.position.count < (imp ? 200000 : 20000)) boxUV(o, 6.5); });
    if (edges) edgeLines(g, o => o.parent === g && o.material && o.material.userData && o.material.userData.real, 0xffffff, 0.1, false, 38);     // main body only: one extra draw call
  }
  return {
    SKINS, TRACERS, CHARMS, BLUEPRINTS, GLOVES,
    // v1.16.3: parse every imported model now; resolves when their textures have decoded
    importsReady() { for (const id of Object.keys(BR.IMPORTED || {})) importedParts(id); return Promise.all(IMPORT_LOADS); },
    parachute,
    hand, gloveMats,
    merged,
    // A world-space weapon mesh (single draw call), barrel along -Z.
    // Hand points (grip, foregrip) of a weapon model, in model space — used by third-person arm IK
    gripPoints(id) {
      const c = cache.grips || (cache.grips = {});
      if (!c[id]) {
        const u = this.weapon(id).userData;
        c[id] = { grip: u.grip ? u.grip.clone() : new THREE.Vector3(0, -0.05, 0.1), fore: u.fore ? u.fore.clone() : null };
      }
      return c[id];
    },
    worldWeapon(id, bpId, skin) {
      mergedMat = mergedMat || new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      return new THREE.Mesh(merged(id, bpId, skin), mergedMat);
    },
    // Build a weapon model: blueprint design (optional), camo (optional), charm (optional).
    weapon(id, skin, charmId, bpId) {
      const def = BR.CONFIG.weapons[id];
      const g = new THREE.Group();
      const bp = bpId && bpId !== 'default' && BLUEPRINTS[id] ? BLUEPRINTS[id][bpId] : null;
      let S;
      if (skin && skin !== 'default') S = skinMaterial(skin, def.color);
      else if (bp) S = bpMat(bp.body, bp.bodyGloss || 0);
      else S = skinMaterial('default', def.color);
      const opts = {};
      if (skin && skin !== 'default') opts.camo = S;
      if (bp && bp.blade) { if (!cache.mat['blade' + bp.blade]) { const bm = BLADES[bp.blade](); if (bm.isMeshPhongMaterial && !bm.envMap) { bm.envMap = envCube(); bm.reflectivity = bm.transparent ? 0.3 : 0.22; } cache.mat['blade' + bp.blade] = bm; } opts.blade = cache.mat['blade' + bp.blade]; }
      ROUND = true;
      try {
        (BUILD[id] || BUILD.pistol)(g, S, MAT(), opts);
        if (bp && bp.mod) {
          const keep = g.userData.imported ? new Set() : null; if (keep) g.traverse(o => keep.add(o));
          bp.mod(g, kit(g), { A: bpMat(bp.accent, bp.accentGloss || 0), G: glowMat(bp.glow), B: S, M: MAT(), camo: !!opts.camo, keep, id });
          if (keep && bp.fit !== 'own') fitMods(g, id, keep, bp.fit === 'native');                                     // v1.23: seat the add-ons on the imported model
        }
        if (bp && !opts.camo) bpUpgrade(g, id, bpId, bp, S, opts);          // v1.16 finishes + edge lines
        if (bp) { try { bpForge(g, id, bp); } catch (e) { console.warn('blueprint forge', id, bpId, e); } }      // v1.33 real extra geometry by rarity
        realPass(g, !bp && !opts.camo);                                        // v1.17 surface detail
        skinFx(g, skin, bp);                                                   // v1.22 rarity glow + sparkles
        if (g.userData.flash) g.userData.flash.userData.style = def.melee ? 'none' : def.suppressed ? 'sup' : def.launcher ? 'launch' : def.pellets > 1 ? 'blast' : (def.bolt || def.dmg >= 40 || def.revolver) ? 'heavy' : def.rpm >= 700 ? 'auto' : 'std';     // v1.33 flash style
      } finally { ROUND = false; }
      if (charmId && charmId !== 'none') {
        const c = charm(charmId);
        g.userData.charm.add(c);
        g.userData.charmObj = c;
      }
      return g;
    },
    charm,
    // Run a model's animated parts (Mythic blueprints). Cheap no-op for everything else.
    animTex(tex, fn) { return animTex(tex, fn); },
    tick(t) {
      for (let i = 0; i < ANIM_TEX.length; i++) ANIM_TEX[i]._anim(ANIM_TEX[i], t);
      // blueprint glow strips breathe (brighter / softer) instead of sitting at a flat colour
      const k = 0.82 + 0.18 * Math.sin(t * 2.6);
      for (let i = 0; i < GLOWS.length; i++) GLOWS[i].color.copy(GLOWS[i].userData.base).multiplyScalar(k);
    },
    animate(model, t) { const a = model && model.userData.anim; if (a) for (let i = 0; i < a.length; i++) a[i](t); },
    // Which tracer a gun fires: its own per-gun pick, or (Signature) its blueprint's tracer
    resolveTracer(wid, equip) {
      const id = (equip.tracerByGun && equip.tracerByGun[wid]) || 'signature';
      if (id !== 'signature') return TRACERS[id] || TRACERS.default;
      const bp = BLUEPRINTS[wid] && BLUEPRINTS[wid][(equip.blueprints || {})[wid] || 'default'];
      return (bp && bp.tracer) || TRACERS.default;
    },
    tracerOpts(id, t) {
      const tr = typeof id === 'object' ? id : TRACERS[id] || TRACERS.default;
      if (!tr.style) return null;
      const c2 = tr.color2 < 0 ? new THREE.Color().setHSL((t * 0.7 + 0.5) % 1, 1, 0.6).getHex() : tr.color2;
      return { style: tr.style, color2: c2 };
    },
    tracerColor(id, t) {
      const tr = typeof id === 'object' ? id : TRACERS[id] || TRACERS.default;
      if (tr.color >= 0) return tr.color;
      return new THREE.Color().setHSL((t * 0.7) % 1, 1, 0.6).getHex();
    },
  };
})();
