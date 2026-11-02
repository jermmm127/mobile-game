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
    default: { name: 'Standard', price: 0, color: 0xffe9a8 },
    red:     { name: 'Hot Red', price: 100, color: 0xff1f3d },
    green:   { name: 'Toxic Green', price: 120, color: 0x39ff14 },
    cyan:    { name: 'Ion Blue', price: 150, color: 0x00e5ff },
    orange:  { name: 'Blaze', price: 150, color: 0xff7b00 },
    pink:    { name: 'Hyper Pink', price: 200, color: 0xff2bd6 },
    purple:  { name: 'Void Purple', price: 200, color: 0xb026ff },
    gold:    { name: 'Gold', price: 300, color: 0xffcc00 },
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
    sightDot: new THREE.MeshBasicMaterial({ color: 0xff8a1f }),
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
      // open mini red dot: base + hoop, dot floating in the middle
      k.box(0.03, 0.012, 0.05, 0, 0.1, -0.06, M.dark);
      k.box(0.004, 0.034, 0.012, 0.016, 0.122, -0.075, M.dark);
      k.box(0.004, 0.034, 0.012, -0.016, 0.122, -0.075, M.dark);
      k.box(0.036, 0.004, 0.012, 0, 0.139, -0.075, M.dark);
      const rd = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 8), M.reticle); rd.position.set(0, 0.122, -0.075); g.add(rd);
      const ss = new THREE.Object3D(); ss.position.set(0, 0.122, -0.075); g.add(ss);
      g.userData.sight = ss; g.userData.sightDist = 0.36;
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
    rifle(g, S, M, opts) {
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
        g.userData.sight = sight; g.userData.sightDist = 0.44;
      } else {
        irons(g, M, 0.13, 0.05, -0.3, true);                      // aperture iron sights
      }
      anchors(g, -0.74, 0.035, [-0.04, -0.01, 0.1]);
    },
    holoar(g, S, M) { BUILD.rifle(g, S, M, { holo: true }); },
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
      hd.quadraticCurveTo(-0.06, 0.03, -0.128, 0.046);                // top line curves up toward the ring
      hd.lineTo(-0.134, 0.022);
      hd.quadraticCurveTo(-0.07, 0.006, -0.022, -0.012);              // belly
      hd.quadraticCurveTo(-0.008, -0.03, 0.006, -0.026);              // finger guard
      hd.lineTo(0.004, -0.014);
      hd.closePath();
      k.add(new THREE.Mesh(ext(hd, 0.014, 0.003), S));
      // Steel liner peeking out between the scales
      const liner = new THREE.Mesh(ext(hd, 0.007, 0.0005), M.metal); liner.scale.set(1.03, 1.08, 1); liner.position.set(0.002, -0.001, 0); k.add(liner);
      // Pins
      for (const [x, y] of [[-0.03, 0.012], [-0.075, 0.024], [-0.11, 0.033]]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 8), M.blade); pin.rotation.x = Math.PI / 2; pin.position.set(x, y, 0); k.add(pin);
      }
      // Finger ring at the butt
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0062, 10, 22), M.metal);
      ring.position.set(-0.152, 0.036, 0); k.add(ring);
      k.rotation.y = Math.PI / 2;      // +x -> -z
      g.add(k);
      g.userData.blade = k;
      hands(g, [0, 0.012, 0.07], null, null);
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
      vandal: { name: 'Vandal', rarity: 'Legendary', price: 1000, body: 0x14151a, accent: 0x2a2c33, glow: 0xff2e63,
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
    knife: {
      fade: { name: 'Fade', rarity: 'Legendary', price: 1200, body: 0x16161a, accent: 0x16161a, glow: 0xff5ec4, blade: 'fade' },
      doppler: { name: 'Doppler', rarity: 'Legendary', price: 1200, body: 0x101014, accent: 0x101014, glow: 0x4a8bff, blade: 'doppler' },
    },
  };
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
  };
  function gloveMats(id) {
    const key = 'glove-' + id;
    if (cache.mat[key]) return cache.mat[key];
    const G = GLOVES[id] || GLOVES.default;
    let main;
    if (G.tex === 'neon') main = skinMaterial('neon');
    else if (G.tex) main = new THREE.MeshLambertMaterial({ map: TEX[G.tex]() });
    else main = G.gloss ? new THREE.MeshPhongMaterial({ color: G.color, specular: 0xffffff, shininess: 70 }) : new THREE.MeshLambertMaterial({ color: G.color });
    return (cache.mat[key] = { main, pad: new THREE.MeshLambertMaterial({ color: G.pad }), glow: G.glow ? glowMat(G.glow) : null });
  }
  // A gloved hand, fingers along -Z curling down (-Y), thumb on +X (mirrored for the left hand).
  function hand(id, left) {
    const m = gloveMats(id), g = new THREE.Group(), sx = left ? -1 : 1;
    const box = (w, h, d, x, y, z, mat, rx) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x * sx, y, z); if (rx) b.rotation.x = rx; g.add(b); return b; };
    box(0.052, 0.03, 0.07, 0, 0, 0, m.main);                    // palm
    box(0.044, 0.008, 0.045, 0, 0.018, -0.004, m.pad);           // back-of-hand armour
    if (m.glow) box(0.03, 0.003, 0.003, 0, 0.023, -0.02, m.glow);
    for (let i = 0; i < 4; i++) {                                // fingers, two segments each, curled
      const x = -0.019 + i * 0.0128;
      box(0.011, 0.013, 0.03, x, -0.004, -0.046, m.main, 0.5);
      box(0.0105, 0.012, 0.022, x, -0.024, -0.058, m.main, 1.4);
    }
    const th = box(0.013, 0.014, 0.04, 0.03, -0.006, -0.02, m.main); th.rotation.y = -0.5 * sx; th.rotation.x = 0.3;  // thumb
    box(0.056, 0.034, 0.02, 0, 0, 0.042, m.pad);                 // cuff
    return g;
  }

  return {
    SKINS, TRACERS, CHARMS, BLUEPRINTS, GLOVES,
    hand, gloveMats,
    merged,
    // A world-space weapon mesh (single draw call), barrel along -Z.
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
      (BUILD[id] || BUILD.pistol)(g, S, MAT(), opts);
      if (bp && bp.mod) bp.mod(g, kit(g), { A: bpMat(bp.accent, bp.accentGloss || 0), G: glowMat(bp.glow), B: S, M: MAT() });
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
