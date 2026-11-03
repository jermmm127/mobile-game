'use strict';
// =============================================================================
// MODELS — placeholder weapon models built from primitives, plus cosmetic
// skins, charms and tracer colours. Every model faces -Z (barrel forward) with
// the origin at the grip, and exposes userData anchors:
//   muzzle (Object3D), charm (Object3D), flash (Mesh), sight (Object3D, holo only)
// Replace build functions with real assets later; keep the anchors.
// =============================================================================
BR.Models = (function () {
  const cache = { tex: {}, mat: {} };

  // ---------------------------------------------------------------- textures
  function canvasTex(key, draw, size) {
    if (cache.tex[key]) return cache.tex[key];
    const s = size || 128, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    draw(cv.getContext('2d'), s);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
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
    }, 128), (tx, t) => { tx.offset.set(t * 0.05, Math.sin(t * 0.7) * 0.06); }),
    molten: () => animTex(canvasTex('molten', (c, s) => {
      c.fillStyle = '#120806'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) {                         // glowing cracks
        let x = rnd() * s, y = rnd() * s; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; c.lineTo(x, y); }
        c.strokeStyle = rnd() < 0.5 ? '#ff5a00' : '#ffb000'; c.lineWidth = 1.5 + rnd() * 3; c.shadowColor = '#ff3a00'; c.shadowBlur = 8; c.stroke();
      }
      c.shadowBlur = 0;
    }, 256), (tx, t) => { tx.offset.set(t * 0.02, t * 0.035); }),
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
    damascus: () => canvasTex('damascus', (c, s) => {
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x += 2) {
        const v = Math.sin((x * 0.09) + Math.sin(y * 0.05) * 3 + Math.sin(x * 0.03 + y * 0.02) * 2) * 0.5 + 0.5;
        const l = 70 + v * 120; c.fillStyle = `rgb(${l},${l + 4},${l + 10})`; c.fillRect(x, y, 2, 1); }
    }, 128),
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
    phoenix:   { name: 'Phoenix', caseOnly: true, rarity: 'Exotic', color: 0xffe14d, color2: 0xff3a00, style: 'phoenix' },
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

  function skinMaterial(skin, base) {
    const key = skin + '|' + base;
    if (cache.mat[key]) return cache.mat[key];
    let m;
    switch (skin) {
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
      case 'nebula': case 'inferno': case 'aurora':
        m = new THREE.MeshPhongMaterial({ map: TEX[skin](), emissive: 0xffffff, emissiveMap: TEX[skin](), emissiveIntensity: 0.85, specular: 0x888888, shininess: 60 }); break;
      case 'liquidgold': m = new THREE.MeshPhongMaterial({ map: TEX.liquidgold(), specular: 0xfff4c0, shininess: 180, emissive: 0x4a3000, emissiveMap: TEX.liquidgold(), emissiveIntensity: 0.4 }); break;
      case 'prism': m = new THREE.MeshPhongMaterial({ map: TEX.prism(), emissive: 0xffffff, emissiveMap: TEX.prism(), emissiveIntensity: 0.35, specular: 0xffffff, shininess: 150 }); break;
      default: m = new THREE.MeshLambertMaterial({ color: base });
    }
    return (cache.mat[key] = m);
  }
  const MAT = () => cache.common || (cache.common = {
    dark: new THREE.MeshLambertMaterial({ color: 0x24282e }),
    metal: new THREE.MeshPhongMaterial({ color: 0x5b636d, specular: 0x9aa3ad, shininess: 50 }),
    grip: new THREE.MeshLambertMaterial({ color: 0x1a1c1f }),
    blade: new THREE.MeshPhongMaterial({ color: 0xc8d0d8, specular: 0xffffff, shininess: 120, side: THREE.DoubleSide }),
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
    scopeTube: new THREE.MeshPhongMaterial({ color: 0x1d2025, specular: 0x555a60, shininess: 40, side: THREE.DoubleSide }),
    sightDot: new THREE.MeshBasicMaterial({ color: 0xff8a1f }),
    shell: new THREE.MeshLambertMaterial({ color: 0xc8202a }),
    brass: new THREE.MeshPhongMaterial({ color: 0xc89b3c, specular: 0xffe2a0, shininess: 60 }),
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
    const r = Math.min(w, h, d) * 0.2, g = new THREE.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(c); if (v.lengthSq() > 1e-12) { v.setLength(r); p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z); }
    }
    g.computeVertexNormals(); g._shared = true;
    return (RB[key] = g);
  }
  BR.roundedBox = roundedBox;
  function kit(g) {
    return {
      box(w, h, d, x, y, z, mat, rx) { const m = new THREE.Mesh(ROUND ? roundedBox(w, h, d) : new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; g.add(m); return m; },
      cyl(r, len, x, y, z, mat, axis, seg) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 10), mat);
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
    const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), MAT().flash);
    flash.position.copy(muzzle.position); flash.position.z -= 0.04; flash.scale.set(1, 1, 1.8); flash.visible = false;
    g.add(flash);
    g.userData.muzzle = muzzle; g.userData.charm = charm; g.userData.flash = flash;
  }

  const BUILD = {
    pistol(g, S, M) {
      const k = kit(g);
      k.box(0.05, 0.05, 0.22, 0, 0.05, -0.06, S);                 // slide
      for (let i = 0; i < 4; i++) k.box(0.052, 0.035, 0.006, 0, 0.055, 0.02 + i * 0.012, M.dark); // serrations
      k.box(0.044, 0.035, 0.2, 0, 0.012, -0.05, M.dark);          // frame
      k.box(0.042, 0.13, 0.055, 0, -0.06, 0.02, M.grip, 0.22);    // grip
      k.box(0.008, 0.012, 0.06, 0, -0.012, -0.03, M.dark);        // trigger guard bottom
      k.box(0.006, 0.03, 0.006, 0, -0.005, -0.03, M.metal);       // trigger
      k.cyl(0.011, 0.03, 0, 0.045, -0.18, M.metal, 'z');          // barrel tip
      magGroup(g, [k.box(0.034, 0.11, 0.04, 0, -0.065, 0.025, M.dark, 0.22), k.box(0.044, 0.014, 0.052, 0, -0.127, 0.039, M.grip, 0.22)]);
      irons(g, M, 0.088, 0.035, -0.16, false);
      hands(g, [0, -0.07, 0.03], [-0.012, -0.095, 0.0], [0, 0.05, 0.02]);
      anchors(g, -0.2, 0.045, [-0.03, 0.0, 0.04]);
    },
    smg(g, S, M) {
      const k = kit(g);
      k.box(0.06, 0.08, 0.3, 0, 0.03, -0.08, S);                  // receiver
      k.box(0.065, 0.02, 0.26, 0, 0.08, -0.08, M.dark);           // top rail
      for (let i = 0; i < 6; i++) k.box(0.067, 0.008, 0.012, 0, 0.093, -0.19 + i * 0.04, M.metal);
      k.cyl(0.016, 0.12, 0, 0.035, -0.28, M.metal, 'z');          // barrel
      magGroup(g, [k.box(0.035, 0.18, 0.045, 0, -0.08, -0.12, M.dark)]); // long mag
      hands(g, [0, -0.07, 0.03], [0, -0.07, -0.21], [0.035, 0.05, -0.02]);
      k.box(0.04, 0.11, 0.05, 0, -0.06, 0.03, M.grip, 0.2);       // grip
      k.box(0.03, 0.09, 0.035, 0, -0.04, -0.21, M.grip);          // foregrip
      k.box(0.012, 0.012, 0.18, 0.02, 0.02, 0.15, M.metal);       // stock rods
      k.box(0.012, 0.012, 0.18, -0.02, 0.02, 0.15, M.metal);
      k.box(0.05, 0.07, 0.015, 0, 0.0, 0.24, M.grip);             // butt plate
      // Micro red dot (T2-style): QD mount, housing with a front hood + lip, rear rim, capped
      // turrets, battery cap, coated lens (clear centre, blue-violet edge) and a crisp dot with glow
      const RY = 0.126, RZ = -0.07;
      k.box(0.034, 0.014, 0.05, 0, 0.1, RZ + 0.004, M.dark);                                  // mount base
      k.box(0.006, 0.01, 0.022, 0.02, 0.098, RZ + 0.012, M.metal);                           // QD lever
      k.box(0.026, 0.016, 0.034, 0, 0.108, RZ + 0.002, M.scopeTube);                          // body saddle
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
      anchors(g, -0.34, 0.035, [-0.04, -0.01, 0.03]);
    },
    shotgun(g, S, M) {
      const k = kit(g);
      k.box(0.075, 0.1, 0.32, 0, 0.03, -0.06, S);                 // chunky receiver
      k.box(0.1, 0.045, 0.34, 0, 0.055, -0.38, M.dark);           // wide flat barrel housing (horizontal pattern)
      for (let i = 0; i < 4; i++) k.box(0.102, 0.006, 0.05, 0, 0.08, -0.24 - i * 0.07, M.metal); // vents
      k.box(0.11, 0.05, 0.03, 0, 0.055, -0.56, M.metal);          // muzzle brake
      k.box(0.07, 0.06, 0.16, 0, -0.01, -0.33, M.grip);           // pump
      for (let i = 0; i < 5; i++) k.box(0.072, 0.008, 0.012, 0, -0.01, -0.27 - i * 0.03, M.dark);
      k.box(0.045, 0.12, 0.055, 0, -0.07, 0.04, M.grip, 0.25);    // grip
      k.box(0.06, 0.08, 0.22, 0, 0.0, 0.2, S);                    // stock
      for (let i = 0; i < 3; i++) k.cyl(0.011, 0.05, 0.042, 0.02 - i * 0.026, -0.02, M.shell, 'z', 8); // side-saddle shells
      hands(g, [0, -0.075, 0.04], [0, -0.045, -0.33], null);
      g.userData.port = new THREE.Vector3(0, -0.03, -0.06);       // shells go in here
      irons(g, M, 0.1, 0.0, -0.52, false);
      anchors(g, -0.58, 0.055, [-0.05, -0.02, 0.06]);
    },
    // Rifle: an AK-pattern battle rifle in black polymer. Long flat-topped handguard
    // with window slots, thin barrel with a slotted brake and a fin front sight,
    // banana mag curving forward, raked pistol grip, angular fixed stock.
    // Side profiles are authored in a 2D pixel grid (x = back, y = down) and extruded.
    rifle(g, S, M) {
      const k = kit(g);
      const Z = x => -0.76 + (x - 30) * 0.00193, Y = y => 0.09 - (y - 15) * 0.00193;
      const prof = (pts, w, mat, bevel, x0) => {
        const sh = new THREE.Shape(); bevel = bevel === undefined ? 0.003 : bevel;
        pts.forEach((p, i) => {
          if (p.length === 4) sh.quadraticCurveTo(Z(p[0]), Y(p[1]), Z(p[2]), Y(p[3]));
          else if (i === 0) sh.moveTo(Z(p[0]), Y(p[1])); else sh.lineTo(Z(p[0]), Y(p[1]));
        });
        const d = Math.max(0.002, w - 2 * bevel);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 10 });
        geo.translate(0, 0, -d / 2); geo.rotateY(-Math.PI / 2);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
        const m = new THREE.Mesh(geo, mat); m.position.x = x0 || 0; g.add(m); return m;
      };
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
    holoar(g, S, M) { BUILD.ar(g, S, M, { holo: true }); },
    hunter(g, S, M) {
      // Lightweight bolt-action: walnut stock (S), slim blued barrel, compact low-power scope
      const k = kit(g);
      k.box(0.05, 0.06, 0.3, 0, 0.0, 0.0, S);                     // fore-stock
      const wrist = k.box(0.042, 0.075, 0.12, 0, -0.025, 0.17, S); wrist.rotation.x = 0.25;   // grip wrist
      k.box(0.05, 0.1, 0.22, 0, -0.03, 0.31, S);                  // buttstock
      k.box(0.044, 0.03, 0.14, 0, 0.035, 0.3, S);                 // cheek comb
      k.box(0.052, 0.11, 0.02, 0, -0.03, 0.425, M.grip);          // butt pad
      k.box(0.034, 0.04, 0.2, 0, 0.045, 0.04, M.metal);           // receiver
      k.cyl(0.011, 0.5, 0, 0.045, -0.36, M.metal, 'z', 10);       // slim barrel
      k.cyl(0.014, 0.02, 0, 0.045, -0.6, M.dark, 'z', 10);        // crown
      // Open iron sights: buckhorn rear on the receiver, ramp + bead front at the muzzle
      k.box(0.012, 0.022, 0.03, 0, 0.065, -0.555, M.metal);       // front ramp
      k.box(0.022, 0.016, 0.016, 0, 0.07, -0.03, M.metal);        // rear sight base
      irons(g, M, 0.088, -0.03, -0.555, false);
      g.userData.sightDist = 0.4;
      k.box(0.026, 0.01, 0.05, 0, 0.06, 0.13, M.metal);           // bolt shroud
      boltGroup(g, M, 0.052, 0.1, 0.12);
      k.box(0.006, 0.02, 0.006, 0, -0.04, -0.1, M.metal); k.box(0.006, 0.02, 0.006, 0, -0.085, 0.36, M.metal);  // sling swivels
      magGroup(g, [k.box(0.03, 0.035, 0.06, 0, -0.04, 0.03, M.dark)]);
      hands(g, [0, -0.06, 0.17], [0, -0.035, -0.12], [0.06, 0.05, 0.11]);
      anchors(g, -0.62, 0.045, [-0.035, -0.02, 0.24]);
    },
    sniper(g, S, M) {
      const k = kit(g);
      k.box(0.06, 0.08, 0.36, 0, 0.03, -0.04, S);                 // receiver
      k.cyl(0.016, 0.62, 0, 0.04, -0.52, M.metal, 'z', 10);       // long barrel
      k.cyl(0.024, 0.08, 0, 0.04, -0.84, M.dark, 'z', 10);        // muzzle brake
      k.cyl(0.032, 0.3, 0, 0.13, -0.06, M.dark, 'z', 14);         // scope tube
      k.cyl(0.042, 0.06, 0, 0.13, -0.24, M.dark, 'z', 14);        // objective bell
      k.cyl(0.036, 0.05, 0, 0.13, 0.11, M.dark, 'z', 14);         // eyepiece
      k.cyl(0.04, 0.003, 0, 0.13, -0.271, M.lensDark, 'z', 14);   // lens
      k.box(0.02, 0.05, 0.02, 0, 0.085, -0.13, M.dark); k.box(0.02, 0.05, 0.02, 0, 0.085, 0.02, M.dark); // rings
      boltGroup(g, M, 0.05, 0.1, 0.16);                            // bolt (cycles after every shot)
      magGroup(g, [k.box(0.035, 0.08, 0.06, 0, -0.06, -0.06, M.dark)]); // mag
      hands(g, [0, -0.07, 0.1], [0, 0.0, -0.32], [0.05, 0.05, 0.08]);
      k.box(0.042, 0.12, 0.05, 0, -0.06, 0.1, M.grip, 0.25);      // grip
      k.box(0.06, 0.09, 0.26, 0, 0.0, 0.3, S);                    // stock
      k.box(0.05, 0.03, 0.12, 0, 0.06, 0.28, S);                  // cheek rest
      const l1 = k.box(0.01, 0.16, 0.01, 0.02, -0.05, -0.5, M.dark); l1.rotation.z = 0.25; // bipod
      const l2 = k.box(0.01, 0.16, 0.01, -0.02, -0.05, -0.5, M.dark); l2.rotation.z = -0.25;
      anchors(g, -0.9, 0.04, [-0.04, -0.01, 0.14]);
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
      // Blade: concave inner edge, sweeping spine, needle tip
      const bl = new THREE.Shape();
      bl.moveTo(0, 0.013);
      bl.bezierCurveTo(0.045, 0.034, 0.105, 0.026, 0.138, -0.022);   // spine
      bl.bezierCurveTo(0.150, -0.042, 0.150, -0.062, 0.141, -0.078); // hook to the tip
      bl.bezierCurveTo(0.128, -0.040, 0.090, -0.006, 0.040, -0.006); // sharpened inner edge
      bl.quadraticCurveTo(0.012, -0.007, 0.0, -0.013);
      bl.closePath();
      const bladeMat = (opts && opts.blade) || M.blade;
      const bladeG = new THREE.Group(); bladeG.scale.setScalar(1.25); k.add(bladeG);   // 25% bigger blade
      bladeG.add(new THREE.Mesh(ext(bl, 0.003, 0.0012), bladeMat));
      // Bevel line along the edge (slightly darker steel)
      const bev = new THREE.Shape();
      bev.moveTo(0.02, -0.002);
      bev.bezierCurveTo(0.07, 0.002, 0.115, -0.02, 0.136, -0.06);
      bev.bezierCurveTo(0.122, -0.032, 0.086, -0.005, 0.04, -0.004);
      bev.closePath();
      const bm = new THREE.Mesh(ext(bev, 0.0045, 0.0005), (opts && opts.blade) ? bladeMat : M.metal); bladeG.add(bm);
      // Jimping notches on the spine
      for (let i = 0; i < 6; i++) {
        const t = 0.008 + i * 0.008, j = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.006), M.dark);
        j.position.set(t, 0.016 + t * 0.35, 0); j.rotation.z = 0.35; bladeG.add(j);
      }
      // Curved handle (skin material) with a guard bump
      const hd = new THREE.Shape();
      hd.moveTo(0.004, 0.016);
      hd.quadraticCurveTo(-0.045, 0.034, -0.098, 0.064);              // shorter handle, sweeping up hard toward the ring
      hd.lineTo(-0.108, 0.042);
      hd.quadraticCurveTo(-0.052, 0.006, -0.02, -0.012);              // curved belly
      hd.quadraticCurveTo(-0.008, -0.03, 0.006, -0.026);              // finger guard
      hd.lineTo(0.004, -0.014);
      hd.closePath();
      k.add(new THREE.Mesh(ext(hd, 0.014, 0.003), S));
      // Steel liner peeking out between the scales
      const liner = new THREE.Mesh(ext(hd, 0.007, 0.0005), M.metal); liner.scale.set(1.03, 1.08, 1); liner.position.set(0.002, -0.001, 0); k.add(liner);
      // Pins
      for (const [x, y] of [[-0.025, 0.013], [-0.055, 0.027], [-0.083, 0.043]]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 8), M.blade); pin.rotation.x = Math.PI / 2; pin.position.set(x, y, 0); k.add(pin);
      }
      // Finger ring at the butt
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0062, 10, 22), M.metal);
      ring.position.set(-0.12, 0.066, 0); k.add(ring);
      k.rotation.y = Math.PI / 2;      // +x -> -z
      g.add(k);
      g.userData.blade = k;
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
      const blade = ext([[0.009, 0.004], [0.009, 0.082], [0.009, 0.106, -0.001, 0.127], [-0.004, 0.131], [-0.012, 0.098, -0.011, 0.034], [-0.012, 0.012], [-0.006, 0.004]], 0.0026, 0.0009);
      blade.material = bladeMat; g.add(blade);
      const swedge = ext([[0.0075, 0.084], [0.0075, 0.104, 0.0, 0.122], [-0.002, 0.12], [0.0045, 0.1]], 0.0034, 0);
      swedge.material = M.metal; g.add(swedge);
      const kick = ext([[-0.006, 0.0], [-0.013, 0.004], [-0.012, 0.014], [-0.006, 0.012]], 0.003, 0.0005); kick.material = M.metal; g.add(kick);
      // handles: pivot groups at the blade tang (pins along X)
      const handle = (side) => {
        const pv = new THREE.Group(); pv.position.set(side * 0.0042, 0.004, 0.001); g.add(pv);
        const h = ext([[-0.0115, 0.004], [0.0115, 0.004], [0.0115, -0.118], [0.0115, -0.13, 0.0, -0.13], [-0.0115, -0.13, -0.0115, -0.118]], 0.0046, 0.0008,
          [[0, -0.026, 0.004, 0.009], [0, -0.05, 0.004, 0.008], [0, -0.073, 0.004, 0.008], [0, -0.097, 0.0035, 0.007]]);
        h.material = S; pv.add(h);
        for (const y of [0, -0.12]) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.012, 10), M.metal); pin.rotation.z = Math.PI / 2; pin.position.set(0, y, 0); pv.add(pin); }
        return pv;
      };
      const hA = handle(1), hB = handle(-1);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.006), M.metal); latch.position.set(-0.004, -0.128, 0.0); hB.add(latch);
      g.userData.handleA = hA; g.userData.handleB = hB;
      g.userData.blade = blade;
      hands(g, [0, -0.07, 0.0], null, null);
      anchors(g, 0.14, 0, [0, -0.13, 0]);
      g.userData.flash.visible = false;
    },
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
  function merged(id) {
    if (mergedCache[id]) return mergedCache[id];
    const g = new THREE.Group();
    const def = BR.CONFIG.weapons[id];
    (BUILD[id] || BUILD.pistol)(g, skinMaterial('default', def.color), MAT());
    g.updateMatrixWorld(true);
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    g.traverse(o => {
      if (!o.isMesh || o === g.userData.flash) return;
      const mat = o.material;
      if (mat.transparent && mat.opacity < 0.5) return;           // skip holo glass
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      c.copy(mat.color || new THREE.Color(0x888888));
      const p = geo.attributes.position, n = geo.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        col.push(c.r, c.g, c.b);
      }
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out._shared = true;
    return (mergedCache[id] = out);
  }
  let mergedMat = null;

  // ------------------------------------------------------------- blueprints
  // Weapon blueprints: original designs per gun, each with its own palette and
  // extra geometry (shrouds, fins, glow vents, muzzle devices...). A camo, if
  // equipped, replaces the body material; blueprint accents and glow stay.
  const glowMat = c => cache.mat['glow' + c] || (cache.mat['glow' + c] = new THREE.MeshBasicMaterial({ color: c }));
  const bpMat = (c, gloss) => cache.mat['bp' + c + gloss] || (cache.mat['bp' + c + gloss] = gloss
    ? new THREE.MeshPhongMaterial({ color: c, specular: 0xffffff, shininess: gloss === 2 ? 120 : 60 })
    : new THREE.MeshLambertMaterial({ color: c }));
  const bladeTex = (key, draw) => canvasTex('blade-' + key, draw, 128);
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
          k.box(0.056, 0.052, 0.05, 0, 0.05, -0.195, P.A);                       // compensator
          for (const x of [-0.026, 0.026]) glowStrip(k, P.G, 0.16, x, 0.062, -0.06);
          k.box(0.004, 0.012, 0.004, 0, 0.074, -0.205, P.G);                      // port glow
          if (g.userData.mag) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.03, 0.054), P.A); b.position.set(0, -0.14, 0.042); b.rotation.x = 0.22; g.userData.mag.add(b); }
        } },
      gilded: { name: 'Gilded Monarch', rarity: 'Legendary', price: 800, body: 0xe6b422, bodyGloss: 2, accent: 0xf3efe6, glow: 0xffe9a0,
        mod(g, k, P) {
          for (let i = 0; i < 5; i++) k.box(0.052, 0.002, 0.012, 0, 0.076, -0.15 + i * 0.03, P.G);  // engraving lines
          for (const x of [-0.023, 0.023]) { const p = k.box(0.004, 0.09, 0.04, x, -0.055, 0.022, P.A); p.rotation.x = 0.22; } // ivory grips
          k.cyl(0.014, 0.008, 0, 0.045, -0.196, P.G, 'z', 12);
        } },
    },
    smg: {
      neonrush: { name: 'Neon Rush', rarity: 'Legendary', price: 900, body: 0x14161c, accent: 0x23262e, glow: 0x22e6ff,
        mod(g, k, P) {
          k.box(0.07, 0.072, 0.16, 0, 0.035, -0.3, P.A);                          // angular barrel shroud
          for (let i = 0; i < 4; i++) k.box(0.072, 0.006, 0.02, 0, 0.045, -0.36 + i * 0.035, P.G);
          for (const x of [-0.031, 0.031]) glowStrip(k, P.G, 0.26, x, 0.0, -0.08);
          k.box(0.03, 0.006, 0.05, 0, -0.005, -0.38, P.G);
        } },
      hornet: { name: 'Hornet', rarity: 'Epic', price: 500, body: 0xf2c200, accent: 0x111111, glow: 0xffe14d,
        mod(g, k, P) {
          for (let i = 0; i < 6; i++) k.box(0.062, 0.082, 0.014, 0, 0.03, -0.2 + i * 0.045, P.A);  // hazard bands
          k.box(0.05, 0.05, 0.05, 0, 0.035, -0.36, P.A);                          // muzzle brake
          for (const x of [-0.026, 0.026]) k.box(0.004, 0.02, 0.03, x, 0.035, -0.36, P.G);
          k.box(0.06, 0.08, 0.02, 0, 0.0, 0.25, P.A);
        } },
    },
    shotgun: {
      dragon: { name: "Dragon's Breath", rarity: 'Legendary', price: 950, body: 0x2a0d0a, accent: 0x5a1712, glow: 0xff5a1f,
        mod(g, k, P) {
          for (let i = 0; i < 5; i++) { const f = k.box(0.006, 0.05, 0.05, 0, 0.1, -0.24 - i * 0.065, P.A); f.rotation.x = -0.6; } // spine fins
          for (let i = 0; i < 4; i++) k.box(0.104, 0.008, 0.04, 0, 0.081, -0.24 - i * 0.07, P.G);         // glowing vents
          k.box(0.12, 0.07, 0.05, 0, 0.055, -0.585, P.A);                                                 // dragon head brake
          for (const x of [-0.035, 0.035]) k.box(0.012, 0.01, 0.004, x, 0.075, -0.611, P.G);             // eyes
          for (const x of [-0.04, 0.04]) glowStrip(k, P.G, 0.28, x, 0.02, -0.06);
        } },
      riot: { name: 'Riot Control', rarity: 'Epic', price: 500, body: 0x1b2a4a, accent: 0xe9eef4, glow: 0x7fd0ff,
        mod(g, k, P) {
          for (const x of [-0.039, 0.039]) k.box(0.003, 0.03, 0.26, x, 0.04, -0.07, P.A);   // white side panels
          k.cyl(0.02, 0.09, 0, -0.015, -0.48, P.A, 'z', 12);                                 // flashlight
          k.cyl(0.018, 0.004, 0, -0.015, -0.527, P.G, 'z', 12);
          k.box(0.07, 0.1, 0.03, 0, -0.005, 0.32, P.A);                                     // stock pad
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
          k.cyl(0.044, 0.02, 0, 0.13, -0.28, P.A, 'z', 14); k.cyl(0.038, 0.02, 0, 0.13, 0.14, P.A, 'z', 14);
          k.box(0.065, 0.04, 0.14, 0, 0.065, 0.28, P.A);
        } },
      executioner: { name: 'Executioner', rarity: 'Legendary', price: 1100, body: 0x3a0a0e, accent: 0x111111, glow: 0xff2a2a,
        mod(g, k, P) {
          for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 4), P.A); const a = i / 6 * Math.PI * 2; c.position.set(Math.cos(a) * 0.03, 0.04 + Math.sin(a) * 0.03, -0.86); c.rotation.x = -Math.PI / 2; g.add(c); }
          glowStrip(k, P.G, 0.5, 0, 0.058, -0.55);
          k.box(0.05, 0.05, 0.012, 0.031, 0.01, 0.3, P.A);                        // stock badge
          for (const z of [0.29, 0.31]) k.box(0.004, 0.008, 0.006, 0.058, 0.02, z, P.G);
        } },
    },
    hunter: {
      timberwolf: { name: 'Timberwolf', rarity: 'Legendary', price: 950, body: 0x5a3418, bodyGloss: 1, accent: 0xc89b3c, accentGloss: 1, glow: 0xffb347,
        mod(g, k, P) {
          for (const z of [-0.08, 0.06, 0.38]) k.box(0.054, 0.012, 0.012, 0, z > 0.3 ? -0.03 : 0.0, z, P.A);   // brass bands
          for (const x of [-0.026, 0.026]) k.box(0.002, 0.03, 0.12, x, -0.03, 0.31, P.A);                    // inlay
          k.box(0.004, 0.006, 0.42, -0.03, -0.06, 0.13, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));  // leather sling
          k.box(0.002, 0.006, 0.12, 0.019, 0.04, 0.04, P.G);           // glowing receiver inlay
          k.box(0.007, 0.007, 0.007, 0, 0.08, -0.555, P.G);            // glowing front bead
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
          for (const x of [-0.034, 0.034]) { k.box(0.004, 0.01, 0.3, x, 0.03, -0.12, G); k.box(0.004, 0.01, 0.2, x, -0.02, -0.08, M2); }
          const cubes = [];
          for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.014), i % 2 ? G : M2); g.add(c); cubes.push({ c, ox: (Math.random() - 0.5) * 0.12, oy: 0.07 + Math.random() * 0.06, oz: -0.35 + Math.random() * 0.4, s: Math.random() * 10 }); }
          anim(g, t => cubes.forEach(q => { const j = Math.floor(t * 10 + q.s) % 7 === 0 ? 0.02 : 0; q.c.position.set(q.ox + j, q.oy + Math.sin(t * 3 + q.s) * 0.01, q.oz); q.c.rotation.set(t + q.s, t * 2, 0); }));
          k.box(0.066, 0.07, 0.12, 0, 0.032, -0.33, chrome(0x1a1a24));
          for (let i = 0; i < 4; i++) k.box(0.068, 0.008, 0.012, 0, 0.04, -0.37 + i * 0.03, i % 2 ? G : M2);
        } },
    },
    shotgun: {
      frostbite: { name: 'Frostbite', rarity: 'Mythic', price: 1900, body: 0xbfe9ff, bodyGloss: 2, accent: 0xffffff, accentGloss: 2, glow: 0x6ff0ff,
        mod(g, k, P) {
          const G = liveGlow(0x6ff0ff); hueCycle(g, G, 0.5, 0.58, 2.5, 0.65);
          const ice = crystal(0x8fe8ff);
          for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.02 + (i % 3) * 0.008, 0), ice); c.scale.y = 2.2; c.position.set((i % 2 ? 0.02 : -0.02), 0.1 + (i % 3) * 0.01, -0.12 - i * 0.06); c.rotation.z = (i % 2 ? -0.4 : 0.4); g.add(c); }
          for (let i = 0; i < 4; i++) k.box(0.106, 0.008, 0.03, 0, 0.082, -0.24 - i * 0.07, G);
          orbiters(g, 6, new THREE.OctahedronGeometry(0.008, 0), G, 0, 0.04, -0.6, 0.07, 2.5, 'z');      // snow swirling round the muzzle
          k.box(0.12, 0.075, 0.05, 0, 0.055, -0.585, ice);
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
          for (const x of [-0.027, 0.027]) { k.box(0.002, 0.012, 0.36, x, 0.0, -0.05, G); k.box(0.002, 0.03, 0.18, x, -0.03, 0.3, G); }
          k.box(0.008, 0.008, 0.008, 0, 0.09, -0.555, G);
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
          k.box(0.058, 0.004, 0.18, 0, 0.078, -0.09, G);
          k.box(0.056, 0.054, 0.05, 0, 0.05, -0.2, chrome(0xe6e9ff));
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
          for (let i = 0; i < 4; i++) k.box(0.064, 0.006, 0.07 - i * 0.012, 0, 0.0 + i * 0.012, 0.0, i % 2 ? pink : sun);   // sunset stripes
          const bars = [];
          for (let i = 0; i < 7; i++) for (const x of [-0.033, 0.033]) { const b = k.box(0.004, 0.04, 0.012, x, 0.02, -0.2 + i * 0.022, i % 2 ? cyan : pink); bars.push({ b, i }); }
          anim(g, t => bars.forEach(({ b, i }) => { const v = 0.3 + 0.7 * Math.abs(Math.sin(t * 7 + i * 0.9) * Math.sin(t * 3.1 + i)); b.scale.y = v; b.position.y = 0.0 + v * 0.02; }));    // equalizer
          k.box(0.07, 0.004, 0.3, 0, 0.073, -0.1, cyan);
          k.box(0.05, 0.05, 0.05, 0, 0.035, -0.36, chrome(0xff2fa8));
        } },
    },
    shotgun: {
      volcano: { name: 'Volcano', rarity: 'Mythic', price: 2300, body: 0x1a0a06, bodyGloss: 1, accent: 0x2a1208, glow: 0xff5a00,
        mod(g, k, P) {
          const lava = new THREE.MeshPhongMaterial({ map: TEX.molten(), emissive: 0xffffff, emissiveMap: TEX.molten(), emissiveIntensity: 1 });
          k.box(0.112, 0.05, 0.36, 0, 0.06, -0.38, lava); k.box(0.082, 0.105, 0.33, 0, 0.03, -0.06, lava);
          const G = liveGlow(0xff7a00); hueCycle(g, G, 0.02, 0.1, 5, 0.55);
          const drops = [];
          for (let i = 0; i < 6; i++) { const d = k.box(0.01, 0.016, 0.01, (i % 2 ? 0.03 : -0.03), 0, -0.15 - i * 0.07, G); drops.push({ d, o: Math.random() }); }
          anim(g, t => drops.forEach(({ d, o }) => { const f = (t * 0.7 + o) % 1; d.position.y = -0.005 - f * 0.08; d.scale.setScalar(1 - f * 0.7); }));
          const smoke = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4, depthWrite: false });
          orbiters(g, 5, new THREE.IcosahedronGeometry(0.014, 0), smoke, 0, 0.09, -0.6, 0.04, 1.5, 'z');
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
          k.box(0.06, 0.11, 0.24, 0, -0.03, 0.31, ghost); k.box(0.056, 0.066, 0.32, 0, 0.0, 0.0, ghost);                     // ethereal stock + fore-stock shells
          const wisp = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
          orbiters(g, 4, new THREE.SphereGeometry(0.01, 8, 6), wisp, 0, 0.04, -0.2, 0.07, 1.6, 'z');
          anim(g, t => { ghost.opacity = 0.4 + 0.15 * Math.sin(t * 2.2); wisp.opacity = 0.5 + 0.3 * Math.sin(t * 4); });
          const G = liveGlow(0xbfeaff); for (const x of [-0.03, 0.03]) k.box(0.002, 0.008, 0.4, x, 0.045, -0.1, G);
        } },
    },
    pistol: {
      kitsune: { name: 'Kitsune', rarity: 'Mythic', price: 2000, body: 0xf4f1ea, bodyGloss: 2, accent: 0xd1132a, accentGloss: 2, glow: 0xff3a5c,
        mod(g, k, P) {
          const red = chrome(0xd1132a), G = liveGlow(0xff3a5c); hueCycle(g, G, 0.95, 1.02, 3, 0.6);
          for (let i = 0; i < 4; i++) k.box(0.058, 0.004, 0.01, 0, 0.078, -0.16 + i * 0.04, red);      // lacquer bands
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
          k.box(0.066, 0.084, 0.24, 0, 0.032, -0.1, fire);
          const skull = new THREE.Group(); skull.position.set(0, 0.035, -0.36); g.add(skull);
          skull.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), chrome(0xe8e2d0)));
          for (const x of [-0.012, 0.012]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), liveGlow(0xff3a00)); e.position.set(x, 0.006, -0.026); skull.add(e); }
          orbiters(g, 6, new THREE.ConeGeometry(0.008, 0.03, 6), liveGlow(0xff7a00), 0, 0.035, -0.36, 0.05, 5, 'z');
        }, tracer: { name: 'Hellfire Signature', style: 'phoenix', color: 0xffe14d, color2: 0xff2a00 }, reload: { style: 'twirl', fx: 0xff5a00 } },
    },
    shotgun: {
      leviathan: { name: 'Leviathan', rarity: 'Mythic', caseOnly: true, body: 0x0a3a4a, bodyGloss: 2, accent: 0x1de9ff, accentGloss: 2, glow: 0x3affd8,
        mod(g, k, P) {
          const sc = new THREE.MeshPhongMaterial({ map: TEX.scales(), specular: 0x9dffcf, shininess: 120, emissive: 0x04201a });
          k.box(0.112, 0.052, 0.36, 0, 0.06, -0.38, sc);
          const G = liveGlow(0x3affd8); hueCycle(g, G, 0.45, 0.55, 2, 0.6);
          for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), chrome(0x1de9ff)); f.position.set(0, 0.1, -0.15 - i * 0.07); f.rotation.x = -0.5; g.add(f); }
          const bub = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.6 });
          const bubbles = []; for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), bub); g.add(b); bubbles.push({ b, o: Math.random() }); }
          anim(g, t => bubbles.forEach(({ b, o }, i) => { const f = (t * 0.6 + o) % 1; b.position.set(Math.sin(t * 2 + i) * 0.03, 0.08 + f * 0.12, -0.55 - (i % 3) * 0.04); b.scale.setScalar(0.6 + f); }));
          for (const x of [-0.045, 0.045]) k.box(0.004, 0.012, 0.3, x, 0.02, -0.06, G);
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
          for (const x of [-0.027, 0.027]) k.box(0.002, 0.03, 0.16, x, -0.03, 0.31, G);
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
  for (const w in MYTHIC) BLUEPRINTS[w] = Object.assign(BLUEPRINTS[w] || {}, MYTHIC[w]);
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
    if (w === 'knife' || w === 'butterfly' || !(bp.rarity === 'Legendary' || bp.rarity === 'Mythic' || bp.rarity === 'Exotic')) continue;
    const sg = SIG[b] || ['dual', bp.glow, 0xffffff];
    bp.tracer = bp.tracer || { name: bp.name + ' Signature', style: sg[0], color: sg[1], color2: sg[2] };
    // signature reload animation (viewmodel): twirl | flip | toss | spin | glitch, VFX in the blueprint's glow
    const RL = { vandal: 'twirl', gilded: 'spin', neonrush: 'glitch', dragon: 'flip', cyber: 'glitch', executioner: 'twirl', timberwolf: 'flip', neonviper: 'twirl',
      solarflare: 'flip', glitch: 'glitch', frostbite: 'flip', celestial: 'toss', aurora: 'twirl', plasma: 'spin', dragonlord: 'flip', quantum: 'glitch', synthwave: 'twirl',
      volcano: 'toss', thunder: 'flip', phantom: 'glitch', kitsune: 'spin', chroma: 'twirl', wildhunt: 'flip' };
    bp.reload = bp.reload || { style: w === 'revolver' ? 'spin' : RL[b] || (bp.rarity === 'Legendary' ? 'twirl' : 'flip'), fx: bp.glow };
  }
  BLUEPRINTS.butterfly = BLUEPRINTS.butterfly || {}; BLUEPRINTS.revolver = BLUEPRINTS.revolver || {};
  for (const w in BLUEPRINTS) BLUEPRINTS[w] = Object.assign({ default: { name: 'Standard Issue', rarity: 'Base', price: 0 } }, BLUEPRINTS[w]);

  // ------------------------------------------------------------------ gloves
  const GLOVES = {
    default: { name: 'Tactical', price: 0, color: 0x2a2d33, pad: 0x15171a },
    desert:  { name: 'Desert Ops', price: 150, color: 0xb39a72, pad: 0x6f5a3c },
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
  };
  function gloveMats(id) {
    const key = 'glove-' + id;
    if (cache.mat[key]) return cache.mat[key];
    const G = GLOVES[id] || GLOVES.default;
    let main;
    if (G.tex === 'neon') main = skinMaterial('neon');
    else if (G.tex && G.emissive) main = new THREE.MeshPhongMaterial({ map: TEX[G.tex](), emissive: 0xffffff, emissiveMap: TEX[G.tex](), emissiveIntensity: G.emissive, specular: 0x888888, shininess: G.gloss ? 110 : 40 });
    else if (G.tex) main = G.gloss || G.fx ? new THREE.MeshPhongMaterial({ map: TEX[G.tex](), specular: 0xffffff, shininess: 80 }) : new THREE.MeshLambertMaterial({ map: TEX[G.tex]() });
    else main = G.gloss ? new THREE.MeshPhongMaterial({ color: G.color, specular: 0xffffff, shininess: 70 }) : new THREE.MeshLambertMaterial({ color: G.color });
    return (cache.mat[key] = { main, pad: G.fx ? new THREE.MeshPhongMaterial({ color: G.pad, specular: 0xffffff, shininess: 120 }) : new THREE.MeshLambertMaterial({ color: G.pad }), glow: G.glow ? glowMat(G.glow) : null, fx: !!G.fx });
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
  function hand(id, left) {
    const key = (id || 'default') + (left ? 'L' : 'R');
    if (!handCache[key]) handCache[key] = buildHand(id, left);
    const g = new THREE.Group();
    for (const m of handCache[key].children) g.add(new THREE.Mesh(m.geometry, m.material));
    return g;
  }
  function buildHand(id, left) {
    const m = gloveMats(id), g = new THREE.Group(), sx = left ? -1 : 1;
    const put = (geo, mat, x, y, z, rx, ry, rz, par) => { const o = new THREE.Mesh(geo, mat); o.position.set(x * sx, y, z); o.rotation.set(rx || 0, (ry || 0) * sx, (rz || 0) * sx); (par || g).add(o); return o; };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r1, r2, len, seg) => new THREE.CylinderGeometry(r1, r2, len, seg || 8);
    const sph = (r) => new THREE.SphereGeometry(r, 10, 8);
    // palm: core + rounded heel + slightly domed back
    put(box(0.05, 0.026, 0.062), m.main, 0, 0, 0);
    const heel = put(sph(0.026), m.main, 0, -0.004, 0.018); heel.scale.set(1.0, 0.55, 0.75);
    const dome = put(sph(0.028), m.main, 0, 0.006, -0.006); dome.scale.set(0.95, 0.45, 1.15);
    // fingers: three phalanges each, chained so the curl reads naturally
    const lens = [0.023, 0.017, 0.013], radii = [0.0066, 0.006, 0.0056], curl = [0.55, 0.95, 0.75];
    for (let i = 0; i < 4; i++) {
      const fx = -0.0195 + i * 0.013, fy = 0.002 + (i === 1 || i === 2 ? 0.0015 : 0), lenK = i === 0 ? 0.85 : i === 3 ? 0.95 : 1;
      let par = new THREE.Group(); par.position.set(fx * sx, fy, -0.03); g.add(par);
      put(sph(radii[0] * 1.15), m.main, 0, 0, 0, 0, 0, 0, par);                               // knuckle
      for (let k = 0; k < 3; k++) {
        const joint = new THREE.Group(); joint.rotation.x = -curl[k]; par.add(joint);
        const L = lens[k] * lenK;
        const seg = put(cyl(radii[k], radii[k] * 0.92, L, 8), m.main, 0, 0, -L / 2, Math.PI / 2, 0, 0, joint);
        seg.position.x = 0;
        put(sph(radii[k] * 0.98), m.main, 0, 0, -L, 0, 0, 0, joint).position.x = 0;            // joint / fingertip
        const next = new THREE.Group(); next.position.z = -L; joint.add(next); par = next;
      }
    }
    // thumb: two segments angled across the front of the fist
    const tb = new THREE.Group(); tb.position.set(0.026 * sx, -0.008, -0.004); tb.rotation.set(0.35, -0.75 * sx, 0.2 * sx); g.add(tb);
    put(sph(0.0085), m.main, 0, 0, 0, 0, 0, 0, tb).position.x = 0;
    put(cyl(0.0082, 0.0076, 0.022, 8), m.main, 0, 0, -0.011, Math.PI / 2, 0, 0, tb).position.x = 0;
    const t2 = new THREE.Group(); t2.position.z = -0.022; t2.rotation.x = -0.45; tb.add(t2);
    put(cyl(0.0074, 0.0068, 0.016, 8), m.main, 0, 0, -0.008, Math.PI / 2, 0, 0, t2).position.x = 0;
    put(sph(0.0068), m.main, 0, 0, -0.016, 0, 0, 0, t2).position.x = 0;
    // armour: knuckle guard + back plate
    put(cyl(0.0075, 0.0075, 0.054, 10), m.pad, 0, 0.0085, -0.031, 0, 0, Math.PI / 2);
    const plate = put(box(0.042, 0.007, 0.036), m.pad, 0, 0.0175, -0.002, -0.08, 0, 0);
    for (const px of [-0.012, 0.012]) put(box(0.012, 0.003, 0.03), m.pad, px, 0.022, -0.002, -0.08, 0, 0);
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

  return {
    SKINS, TRACERS, CHARMS, BLUEPRINTS, GLOVES,
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
    worldWeapon(id) {
      mergedMat = mergedMat || new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      return new THREE.Mesh(merged(id), mergedMat);
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
      if (bp && bp.blade) opts.blade = cache.mat['blade' + bp.blade] || (cache.mat['blade' + bp.blade] = BLADES[bp.blade]());
      ROUND = true;
      try {
        (BUILD[id] || BUILD.pistol)(g, S, MAT(), opts);
        if (bp && bp.mod) bp.mod(g, kit(g), { A: bpMat(bp.accent, bp.accentGloss || 0), G: glowMat(bp.glow), B: S, M: MAT() });
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
    tick(t) { for (let i = 0; i < ANIM_TEX.length; i++) ANIM_TEX[i]._anim(ANIM_TEX[i], t); },
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
