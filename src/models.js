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
  const TEX = {
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
  };
  const TRACERS = {
    default: { name: 'Standard', price: 0, color: 0xfff1c4 },
    red:     { name: 'Hot Red', price: 100, color: 0xff3344 },
    green:   { name: 'Toxic Green', price: 120, color: 0x5cff5c },
    cyan:    { name: 'Ion Blue', price: 150, color: 0x33e6ff },
    purple:  { name: 'Void Purple', price: 200, color: 0xb04dff },
    gold:    { name: 'Gold', price: 300, color: 0xffc400 },
    rainbow: { name: 'Rainbow', price: 500, color: -1 },
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
      default: m = new THREE.MeshLambertMaterial({ color: base });
    }
    return (cache.mat[key] = m);
  }
  const MAT = () => cache.common || (cache.common = {
    dark: new THREE.MeshLambertMaterial({ color: 0x24282e }),
    metal: new THREE.MeshPhongMaterial({ color: 0x5b636d, specular: 0x9aa3ad, shininess: 50 }),
    grip: new THREE.MeshLambertMaterial({ color: 0x1a1c1f }),
    blade: new THREE.MeshPhongMaterial({ color: 0xc8d0d8, specular: 0xffffff, shininess: 120, side: THREE.DoubleSide }),
    lens: new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    lensDark: new THREE.MeshPhongMaterial({ color: 0x102030, specular: 0x88ccff, shininess: 120 }),
    reticle: new THREE.MeshBasicMaterial({ color: 0xff3040 }),
    shell: new THREE.MeshLambertMaterial({ color: 0xc8202a }),
    brass: new THREE.MeshPhongMaterial({ color: 0xc89b3c, specular: 0xffe2a0, shininess: 60 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  });

  // ------------------------------------------------------------- builders
  function kit(g) {
    return {
      box(w, h, d, x, y, z, mat, rx) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; g.add(m); return m; },
      cyl(r, len, x, y, z, mat, axis, seg) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 10), mat);
        m.position.set(x, y, z);
        if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
        g.add(m); return m;
      },
    };
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
      k.box(0.01, 0.012, 0.01, 0, 0.081, -0.16, M.dark);          // front sight
      k.box(0.03, 0.012, 0.01, 0, 0.081, 0.04, M.dark);           // rear sight
      anchors(g, -0.2, 0.045, [-0.03, 0.0, 0.04]);
    },
    smg(g, S, M) {
      const k = kit(g);
      k.box(0.06, 0.08, 0.3, 0, 0.03, -0.08, S);                  // receiver
      k.box(0.065, 0.02, 0.26, 0, 0.08, -0.08, M.dark);           // top rail
      for (let i = 0; i < 6; i++) k.box(0.067, 0.008, 0.012, 0, 0.093, -0.19 + i * 0.04, M.metal);
      k.cyl(0.016, 0.12, 0, 0.035, -0.28, M.metal, 'z');          // barrel
      k.box(0.035, 0.18, 0.045, 0, -0.08, -0.12, M.dark);         // long mag
      k.box(0.04, 0.11, 0.05, 0, -0.06, 0.03, M.grip, 0.2);       // grip
      k.box(0.03, 0.09, 0.035, 0, -0.04, -0.21, M.grip);          // foregrip
      k.box(0.012, 0.012, 0.18, 0.02, 0.02, 0.15, M.metal);       // stock rods
      k.box(0.012, 0.012, 0.18, -0.02, 0.02, 0.15, M.metal);
      k.box(0.05, 0.07, 0.015, 0, 0.0, 0.24, M.grip);             // butt plate
      k.box(0.03, 0.03, 0.05, 0, 0.115, -0.06, M.dark);           // mini red dot
      k.box(0.012, 0.012, 0.004, 0, 0.12, -0.085, M.reticle);
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
      k.box(0.01, 0.02, 0.01, 0, 0.09, -0.52, M.reticle);         // bead sight
      anchors(g, -0.58, 0.055, [-0.05, -0.02, 0.06]);
    },
    rifle(g, S, M, holo) {
      const k = kit(g);
      k.box(0.06, 0.085, 0.34, 0, 0.03, -0.05, S);                // receiver
      k.box(0.064, 0.022, 0.42, 0, 0.083, -0.1, M.dark);          // top rail
      for (let i = 0; i < 9; i++) k.box(0.066, 0.008, 0.014, 0, 0.098, -0.28 + i * 0.04, M.metal);
      k.box(0.07, 0.07, 0.26, 0, 0.035, -0.34, M.dark);           // handguard
      for (let i = 0; i < 5; i++) k.box(0.072, 0.018, 0.03, 0, 0.035, -0.25 - i * 0.045, M.metal); // vents
      k.cyl(0.03, 0.26, 0, 0.035, -0.6, M.grip, 'z', 12);         // SUPPRESSOR
      k.cyl(0.031, 0.02, 0, 0.035, -0.5, M.metal, 'z', 12);
      k.cyl(0.055, 0.06, 0, -0.07, -0.08, M.dark, 'x', 16);       // DRUM MAG
      k.cyl(0.03, 0.065, 0, -0.07, -0.08, M.metal, 'x', 10);
      k.box(0.03, 0.05, 0.04, 0, -0.02, -0.08, M.dark);           // mag well
      k.box(0.042, 0.12, 0.05, 0, -0.06, 0.06, M.grip, 0.25);     // grip
      k.box(0.055, 0.08, 0.2, 0, 0.01, 0.23, S);                  // stock
      k.box(0.06, 0.1, 0.02, 0, -0.005, 0.33, M.grip);            // butt pad
      if (holo) {
        // Holographic sight: open frame, tinted glass, glowing reticle
        k.box(0.06, 0.03, 0.08, 0, 0.11, -0.08, M.dark);          // base
        k.box(0.006, 0.065, 0.07, 0.03, 0.155, -0.08, M.dark);    // frame sides
        k.box(0.006, 0.065, 0.07, -0.03, 0.155, -0.08, M.dark);
        k.box(0.066, 0.006, 0.07, 0, 0.19, -0.08, M.dark);        // frame top
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.054, 0.058), M.lens);
        glass.position.set(0, 0.156, -0.1); g.add(glass);
        const ret = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.009, 16), M.reticle);
        ret.position.set(0, 0.156, -0.099); g.add(ret);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 8), M.reticle);
        dot.position.set(0, 0.156, -0.099); g.add(dot);
        const sight = new THREE.Object3D(); sight.position.set(0, 0.156, -0.1); g.add(sight);
        g.userData.sight = sight;
      } else {
        k.box(0.012, 0.035, 0.01, 0, 0.11, -0.3, M.dark);         // iron sights
        k.box(0.03, 0.03, 0.012, 0, 0.11, 0.06, M.dark);
      }
      anchors(g, -0.74, 0.035, [-0.04, -0.01, 0.1]);
    },
    holoar(g, S, M) { BUILD.rifle(g, S, M, true); },
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
      k.cyl(0.008, 0.06, 0.05, 0.05, 0.08, M.metal, 'x');         // bolt handle
      k.box(0.035, 0.08, 0.06, 0, -0.06, -0.06, M.dark);          // mag
      k.box(0.042, 0.12, 0.05, 0, -0.06, 0.1, M.grip, 0.25);      // grip
      k.box(0.06, 0.09, 0.26, 0, 0.0, 0.3, S);                    // stock
      k.box(0.05, 0.03, 0.12, 0, 0.06, 0.28, S);                  // cheek rest
      const l1 = k.box(0.01, 0.16, 0.01, 0.02, -0.05, -0.5, M.dark); l1.rotation.z = 0.25; // bipod
      const l2 = k.box(0.01, 0.16, 0.01, -0.02, -0.05, -0.5, M.dark); l2.rotation.z = -0.25;
      anchors(g, -0.9, 0.04, [-0.04, -0.01, 0.14]);
    },
    knife(g, S, M) {
      // Karambit: curved claw blade + finger ring, built in the blade's plane
      // (x = forward, y = up) then turned so +x points down -Z.
      const k = new THREE.Group();
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.012);
      sh.quadraticCurveTo(0.09, 0.03, 0.15, -0.06);    // spine
      sh.lineTo(0.152, -0.072);                          // tip
      sh.quadraticCurveTo(0.085, 0.0, 0.0, -0.014);    // edge
      sh.closePath();
      const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 10 }), M.blade);
      blade.position.z = -0.003;
      k.add(blade);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.022), S);
      handle.position.set(-0.055, 0, 0); handle.rotation.z = -0.12; k.add(handle);
      for (let i = 0; i < 3; i++) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.026, 6), M.metal); sc.rotation.x = Math.PI / 2; sc.position.set(-0.03 - i * 0.03, 0.002 + i * 0.004, 0); k.add(sc); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0065, 8, 18), M.metal);
      ring.position.set(-0.13, 0.016, 0); k.add(ring);
      k.rotation.y = Math.PI / 2;      // +x -> -z
      g.add(k);
      g.userData.blade = k;
      anchors(g, -0.15, 0, [0, -0.02, 0.12]);
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

  return {
    SKINS, TRACERS, CHARMS,
    // Build a weapon model with a skin (and optional charm).
    weapon(id, skin, charmId) {
      const def = BR.CONFIG.weapons[id];
      const g = new THREE.Group();
      const S = skinMaterial(skin || 'default', def.color);
      (BUILD[id] || BUILD.pistol)(g, S, MAT());
      if (charmId && charmId !== 'none') {
        const c = charm(charmId);
        g.userData.charm.add(c);
        g.userData.charmObj = c;
      }
      return g;
    },
    charm,
    tracerColor(id, t) {
      const tr = TRACERS[id] || TRACERS.default;
      if (tr.color >= 0) return tr.color;
      return new THREE.Color().setHSL((t * 0.7) % 1, 1, 0.6).getHex();
    },
  };
})();
