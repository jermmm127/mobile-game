'use strict';
// =============================================================================
// ZOMBIES — "Hollow Graves": endless rounds on a Halloween graveyard.
//   - every round has a set number of zombies (more each round), who get tougher and faster
//   - zombies rise from broken graves and go straight for the player
//   - CoD-style economy: points per hit / kill, wall-buy guns, power-ups (Max Ammo, Insta-Kill,
//     Double Points, Nuke), health regenerates when you avoid damage
//   - a unique boss every 10 rounds (The Pumpkin King, The Weeping Bride, The Bone Colossus,
//     The Plague Doctor, then they return stronger), each with its own model, moves and VFX
//   - the run ends when you die: results show the round you reached
// =============================================================================
(function () {
  const U = BR.util;
  const dampAngle = (a, b, k, dt) => a + U.wrapAngle(b - a) * (1 - Math.exp(-k * dt));
  const ZC = {
    startPoints: 500, hitPts: 10, killPts: 60, headPts: 100, knifePts: 130,
    maxAlive: 18, regenDelay: 4, regenRate: 34, powerChance: 0.04, maxPowers: 3,
    buys: { smg: 600, shotgun: 900, rifle: 1200, holoar: 1300, dmr: 1400, lmg: 1800, mpistol: 500, riot: 1100, burst: 1250, pump: 800 },
    bossEvery: 10,
  };
  BR.ZOMBIE_CFG = ZC;
  // per-round stats (CoD-like curve: linear to round 9, then +10% a round)
  const roundStats = r => ({
    count: Math.min(140, Math.round(6 + r * 3 + (r > 9 ? (r - 9) * 1.5 : 0))),
    hp: r <= 9 ? 100 + 80 * (r - 1) : Math.round(740 * Math.pow(1.1, r - 9)),
    dmg: Math.min(60, 30 + r * 1.2),
    spawnGap: Math.max(0.3, 1.9 - r * 0.1),
    // fraction of walkers / joggers / sprinters
    mix: r <= 2 ? [1, 0, 0] : r <= 4 ? [0.6, 0.4, 0] : r <= 7 ? [0.25, 0.5, 0.25] : r <= 11 ? [0.1, 0.4, 0.5] : [0, 0.3, 0.7],
  });
  BR.zombieRoundStats = roundStats;
  const SPEED = [0.42, 0.68, 0.95];                    // × run speed: shamble, jog, sprint

  const mats = {};
  const lam = (c, o) => mats['l' + c] || (mats['l' + c] = new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})));
  const basic = (c, o) => mats['b' + c + (o ? JSON.stringify(o) : '')] || (mats['b' + c + (o ? JSON.stringify(o) : '')] = new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {})));
  const addMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const sprite = (c, s, map) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: map || BR.Effects.tex().dot, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.setScalar(s); return m; };
  const mesh = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x || 0, y || 0, z || 0); return o; };
  const cyl = (r1, r2, len, seg) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg || 8); g.translate(0, -len / 2, 0); return g; };

  // ======================================================================== zombie
  // shared zombie textures: mottled rotting skin with veins, bruises and dried blood; stained, torn cloth
  const zombieTex = () => mats.ztex || (mats.ztex = (() => {
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); draw(x, 256); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const skin = mk((x, s) => {
      x.fillStyle = '#9aa486'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i++) { const r = 4 + Math.random() * 22; const g = x.createRadialGradient(0, 0, 0, 0, 0, r); const c = ['rgba(90,110,70,', 'rgba(140,130,100,', 'rgba(70,60,80,', 'rgba(160,170,130,'][i % 4];
        g.addColorStop(0, c + '0.35)'); g.addColorStop(1, c + '0)'); x.save(); x.translate(Math.random() * s, Math.random() * s); x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); }
      x.strokeStyle = 'rgba(50,40,90,0.45)'; x.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) { let px = Math.random() * s, py = Math.random() * s; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 26; py += Math.random() * 18; x.lineTo(px, py); } x.stroke(); }      // veins
      for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(70,8,8,${0.3 + Math.random() * 0.4})`; x.beginPath(); x.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 14, 3 + Math.random() * 8, Math.random() * 3, 0, 7); x.fill(); }   // blood
      for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); }
    });
    const cloth = mk((x, s) => {
      x.fillStyle = '#c8c0b0'; x.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 3) { x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; x.fillRect(0, y, s, 1); }
      for (let i = 0; i < 30; i++) { const r = 8 + Math.random() * 30; const g = x.createRadialGradient(0, 0, 0, 0, 0, r); const c = i % 3 ? 'rgba(60,40,20,' : 'rgba(90,10,10,';
        g.addColorStop(0, c + '0.5)'); g.addColorStop(1, c + '0)'); x.save(); x.translate(Math.random() * s, Math.random() * s); x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); }   // dirt + blood stains
      for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(20,10,8,0.85)'; x.beginPath(); const px = Math.random() * s, py = Math.random() * s; x.moveTo(px, py); for (let k = 0; k < 5; k++) x.lineTo(px + (Math.random() - 0.3) * 24, py + (Math.random() - 0.3) * 24); x.fill(); }   // tears
    });
    return { skin, cloth };
  })());
  let PENDING = null;                                  // opts for buildMesh (runs inside the Actor constructor)
  BR.Zombie = class Zombie extends BR.Actor {
    constructor(game, opts) {
      PENDING = opts;
      super(game, Object.assign({ name: 'Zombie' }, opts));
      PENDING = null;
      this.zombie = true;
      this.stats = opts.stats;
      this.health = this.maxHp = opts.stats.hp;
      this.shield = 0;
      this.slots = [null, null, null]; this.cur = 0;
      this.zSpeed = opts.speed;
      this.attackT = 0; this.attackCd = 0.4; this.riseT = opts.rise === undefined ? 1.1 : opts.rise; this.riseMax = this.riseT || 1;
      this.groanT = 1 + Math.random() * 6;
    }
    get weapon() { return null; }
    buildMesh() {
      const o = PENDING || {}, S = BR.actorGeo(), R = Math.random, T = zombieTex();
      const g = new THREE.Group();
      // four outfits from the story: villagers, Pumpkin Patch farmers, wedding-guest grooms, gravediggers
      const kind = ['villager', 'farmer', 'groom', 'digger'][Math.floor(R() * 4)];
      const skin = new THREE.MeshPhongMaterial({ map: T.skin, color: [0xd8e0c8, 0xc8d2b0, 0xe0dcc8, 0xbcc8a8][Math.floor(R() * 4)], specular: 0x2a3020, shininess: 22 });
      const cloth = c => new THREE.MeshLambertMaterial({ map: T.cloth, color: c });
      const top = cloth(kind === 'groom' ? 0x2a2a30 : kind === 'farmer' ? 0x8a3a2a : kind === 'digger' ? 0x5a4a38 : [0x7a6a52, 0x4a5a6a, 0x6a4a4a][Math.floor(R() * 3)]);
      const bottom = cloth(kind === 'farmer' ? 0x3a5a8a : kind === 'groom' ? 0x1e1e24 : 0x3a3228);
      const blood = new THREE.MeshPhongMaterial({ color: 0x3a0606, specular: 0x441010, shininess: 60 }), bone = lam(0xd8cfb4), dark = lam(0x120808), eye = basic(o.eyes || 0xffa31a);
      const body = new THREE.Group(); g.add(body);
      const hips = mesh(S.hips, bottom, 0, 0.95, 0); hips.scale.set(0.9, 1, 0.9); body.add(hips);
      const leg = x => { const hip = new THREE.Group(); hip.position.set(x, 0.94, 0); const th = mesh(S.thigh, bottom); th.scale.set(0.82, 1, 0.82); hip.add(th);
        const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee); const sh = mesh(S.shin, R() < 0.35 ? skin : bottom); sh.scale.set(0.78, 1, 0.78); knee.add(sh);
        knee.add(mesh(S.boot, R() < 0.3 ? skin : S.boots, 0, -0.44, -0.04)); return { hip, knee }; };
      const L = leg(-0.095), Rr = leg(0.095); body.add(L.hip, Rr.hip);
      const upper = new THREE.Group(); upper.position.y = 0.98; body.add(upper);
      const ab = mesh(S.abdomen, R() < 0.4 ? skin : top, 0, 0.1, 0); ab.scale.set(0.85, 1, 0.8); upper.add(ab);
      const chest = mesh(S.chest, top, 0, 0.36, 0); chest.scale.set(0.88, 1, 0.6); upper.add(chest);
      // a torn-open wound with ribs showing, blood down the front
      upper.add(mesh(new THREE.BoxGeometry(0.15, 0.18, 0.02), dark, 0.06, 0.34, -0.118));
      for (let i = 0; i < 4; i++) upper.add(mesh(new THREE.BoxGeometry(0.13, 0.016, 0.02), bone, 0.06, 0.28 + i * 0.04, -0.128));
      upper.add(mesh(new THREE.BoxGeometry(0.1, 0.22, 0.012), blood, -0.07, 0.24, -0.124));
      // shirt flaps hanging off
      for (let i = 0; i < 3; i++) { const f = mesh(new THREE.PlaneGeometry(0.09, 0.16), top, -0.12 + i * 0.12, 0.06, -0.12); f.rotation.x = 0.2; f.material.side = THREE.DoubleSide; upper.add(f); }
      if (kind === 'groom') { upper.add(mesh(new THREE.BoxGeometry(0.1, 0.22, 0.012), cloth(0xd8d2c0), 0, 0.42, -0.124)); upper.add(mesh(new THREE.BoxGeometry(0.08, 0.035, 0.03), dark, 0, 0.54, -0.13)); }
      if (kind === 'digger') upper.add(mesh(new THREE.BoxGeometry(0.3, 0.42, 0.02), cloth(0x3a2e22), 0, 0.12, -0.13));
      if (kind === 'farmer') for (const x of [-0.08, 0.08]) upper.add(mesh(new THREE.BoxGeometry(0.035, 0.36, 0.02), bottom, x, 0.36, -0.125));
      const neck = mesh(S.neck, skin, 0, 0.55, 0.02); neck.scale.set(0.8, 1.1, 0.8); upper.add(neck);
      // head: gaunt skull shape, sunken dark sockets with small glowing pupils, teeth, ears, lank hair
      const head = new THREE.Group(); head.position.set(0, 0.69, 0.02); upper.add(head);
      const face = mesh(S.head, skin); face.scale.set(0.88, 1.12, 0.98); head.add(face);
      for (const x of [-0.042, 0.042]) { head.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), dark, x, 0.025, -0.096)); head.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), eye, x, 0.025, -0.121));
        const gl = sprite(o.eyes || 0xffa31a, 0.07); gl.position.set(x, 0.025, -0.125); head.add(gl); const ear = mesh(new THREE.SphereGeometry(0.025, 8, 6), skin, x * 2.55, 0.0, 0.0); ear.scale.set(0.5, 1, 1); head.add(ear); }
      { const nose = mesh(new THREE.ConeGeometry(0.018, 0.04, 4), dark, 0, -0.012, -0.112); nose.rotation.x = -1.4; head.add(nose); }                     // nose cavity
      for (let i = 0; i < 6; i++) head.add(mesh(new THREE.BoxGeometry(0.012, 0.016, 0.01), bone, -0.03 + i * 0.012, -0.058, -0.106));
      const jaw = new THREE.Group(); jaw.position.set(0, -0.07, -0.02); head.add(jaw);
      jaw.add(mesh(new THREE.BoxGeometry(0.105, 0.035, 0.085), skin, 0, -0.02, -0.03));
      for (let i = 0; i < 5; i++) jaw.add(mesh(new THREE.BoxGeometry(0.011, 0.014, 0.01), bone, -0.024 + i * 0.012, 0.0, -0.07));
      if (kind === 'farmer') { head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), lam(0x9a8040), 0, 0.1, 0)); head.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 12), lam(0x9a8040), 0, 0.15, 0)); }
      else if (kind === 'digger') head.add(mesh(new THREE.SphereGeometry(0.128, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), cloth(0x2a2420), 0, 0.02, 0.0));
      else { const hair = lam(0x1e1814); for (let i = 0; i < 9; i++) { const h = mesh(new THREE.BoxGeometry(0.018, 0.16 + R() * 0.1, 0.012), hair, Math.cos(i * 0.7 + 1.9) * 0.1, 0.0, Math.sin(i * 0.7 + 1.9) * 0.08 + 0.04); h.rotation.z = (R() - 0.5) * 0.3; head.add(h); }
        head.add(mesh(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), hair, 0, 0.03, 0.01)); }
      // arms: thin, one torn sleeve showing a bloody forearm with bone at the elbow; long bony fingers
      const arm = (x, torn) => { const sh = new THREE.Group(); sh.position.set(x, 0.49, 0.02); upper.add(sh); const sd = mesh(S.shoulder, top); sd.scale.setScalar(0.85); sh.add(sd);
        const ua = mesh(S.upperArm, torn ? skin : top); ua.scale.set(0.78, 1.04, 0.78); sh.add(ua);
        const el = new THREE.Group(); el.position.y = -0.29; sh.add(el); const fa = mesh(S.forearm, skin); fa.scale.set(0.75, 1.06, 0.75); el.add(fa);
        if (torn) { el.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), bone, 0, 0, 0.02)); el.add(mesh(new THREE.BoxGeometry(0.05, 0.12, 0.012), blood, 0, -0.12, -0.03)); }
        el.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), skin, 0, -0.29, 0));
        for (let f = -1.5; f <= 1.5; f++) { const fg = mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), skin, f * 0.015, -0.36, -0.01); fg.rotation.x = 0.25; el.add(fg); }
        return { sh, el }; };
      const tornR = R() < 0.5, AR = arm(0.2, tornR), AL = arm(-0.2, !tornR);
      g.userData = { body, upper, head, jaw, L, R: Rr, AR, AL, mat: skin, t: R() * 6, yaw: 0, gait: 0.9 + R() * 0.3, reachArm: R() < 0.5 ? 1 : -1, kind };
      BR.collapseMeshes(g);
      return g;
    }
    // zombies skip the gun / stim / recoil logic: just move (driven by the brain) and animate
    update(dt) {
      if (!this.alive) return;
      if (this.riseT > 0) this.riseT = Math.max(0, this.riseT - dt);
      this.input.speedMult = this.zSpeed * (this.slowT > 0 ? 0.45 : 1);
      if (this.slowT > 0) this.slowT -= dt;
      if (this.riseT <= 0) this.mover.update(dt, this.input, this.yaw);
      this.input.jump = false; this.input.crouch = false;
      if (this.attackCd > 0) this.attackCd -= dt;
      if (this.mesh) this.syncMesh(dt);
    }
    syncMesh(dt) {
      const m = this.mover, u = this.mesh.userData;
      this.mesh.position.copy(m.pos);
      if (this.riseT > 0) this.mesh.position.y -= (this.riseT / this.riseMax) * 1.75;      // clawing up out of the grave
      u.yaw = dampAngle(u.yaw, this.yaw, 8, dt); this.mesh.rotation.y = u.yaw;
      const sp = m.speedH, sprint = this.zSpeed > 0.8;
      u.t += dt * (1.6 + sp * 1.25) * u.gait;
      const c = Math.sin(u.t), a = Math.min(0.75, 0.25 + sp * 0.1);
      u.L.hip.rotation.x = c * a; u.R.hip.rotation.x = -c * a;
      u.L.knee.rotation.x = Math.max(0, -Math.cos(u.t)) * a * 1.4 + 0.1; u.R.knee.rotation.x = Math.max(0, Math.cos(u.t)) * a * 1.4 + 0.1;
      u.upper.rotation.x = sprint ? 0.42 : 0.28 + Math.sin(u.t * 0.5) * 0.06;
      u.upper.rotation.z = Math.sin(u.t * 0.5) * (sprint ? 0.06 : 0.14);
      u.body.position.y = -Math.abs(Math.sin(u.t)) * 0.04;
      u.head.rotation.z = Math.sin(u.t * 0.37) * 0.3; u.head.rotation.x = -0.15;
      u.jaw.rotation.x = 0.3 + Math.abs(Math.sin(u.t * 1.7)) * 0.25;
      // CoD reach: shamblers stretch one or both arms out toward you; sprinters pump their arms low
      let rR, rL;
      if (sprint) { rR = -0.6 - c * 0.7; rL = -0.6 + c * 0.7; }
      else { rR = -1.35 + Math.sin(u.t * 0.9) * 0.15; rL = u.reachArm > 0 && this.zSpeed < 0.5 ? -0.25 + Math.sin(u.t) * 0.1 : -1.25 + Math.sin(u.t * 0.9 + 1) * 0.15; }
      // swipe: arms go up then rake down
      if (this.attackT > 0) { const k = 1 - this.attackT / 0.55, up = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55; rR = -2.6 * up - 0.5 * (1 - up); rL = rR + 0.3; }
      u.AR.sh.rotation.set(rR, 0, -0.12); u.AL.sh.rotation.set(rL, 0, 0.12);
      u.AR.el.rotation.x = -0.35; u.AL.el.rotation.x = -0.35;
    }
    flash() { if (!this.mesh) return; const m = this.mesh.userData.mat; if (!this._flashTO) this._flashPrev = m.emissive.getHex(); m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.6; clearTimeout(this._flashTO); this._flashTO = setTimeout(() => { m.emissive.setHex(this._flashPrev || 0); this._flashTO = null; }, 70); }
    dieVisual() {
      if (!this.mesh) return;
      const u = this.mesh.userData;
      u.body.rotation.x = Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2; u.body.position.y = 0.2;
      u.AR.sh.rotation.set(-1.5, 0, -0.6); u.AL.sh.rotation.set(-1.2, 0, 0.6);
    }
  };

  // ======================================================================== brain
  BR.ZombieBrain = class ZombieBrain {
    constructor(z, game) { this.z = z; this.g = game; this.target = game.player; this.stuckT = 0; this.side = 0; this.sideT = 0; }
    onDamaged() {}
    onHeard() {}
    update(dt) {
      const z = this.z, p = this.target = this.g.player;
      if (!p || !z.alive) return;
      if (z.riseT > 0) { z.input.mx = z.input.mz = 0; return; }
      const goal = this.goal || p.pos;                      // a door waypoint when you're in another zone
      const dx = goal.x - z.pos.x, dz = goal.z - z.pos.z, dy = p.pos.y - z.pos.y, d = Math.hypot(dx, dz);
      const dp = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      let yaw = Math.atan2(-dx, -dz);
      // unstick: if we're pushing but not moving, jump and side-step for a moment
      if (d > 1.6 && z.mover.speedH < 0.35 && z.mover.onGround) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT > 0.45) { this.side = Math.random() < 0.5 ? -1 : 1; this.sideT = 0.6 + Math.random() * 0.6; this.stuckT = 0; z.input.jump = true; }
      if (this.sideT > 0) { this.sideT -= dt; yaw += this.side * 1.2; }
      // spread out a little so they don't stack into one column
      const zm = this.g.zm; if (zm) { let sx = 0, sz = 0; for (const o of zm.zombies) { if (o === z || !o.alive) continue; const ex = z.pos.x - o.pos.x, ez = z.pos.z - o.pos.z, e2 = ex * ex + ez * ez; if (e2 < 0.8 && e2 > 1e-4) { sx += ex / e2; sz += ez / e2; } }
        if (sx || sz) yaw = Math.atan2(-(dx / Math.max(d, 0.1) * 2 + sx * 0.25), -(dz / Math.max(d, 0.1) * 2 + sz * 0.25)); }
      z.yaw = dampAngle(z.yaw, yaw, 9, dt);
      z.input.mz = d > 1.05 || this.goal ? 1 : 0; z.input.mx = 0;
      // swipe
      if (z.attackT > 0) {
        z.attackT -= dt;
        if (!z.hitDone && z.attackT < 0.28) { z.hitDone = true; if (dp < 1.9 && Math.abs(dy) < 1.8 && p.alive) { this.g.applyDamage(p, z, z.stats.dmg, false, { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z }, 'zombie'); BR.Audio.zSwipe && BR.Audio.zSwipe(); } }
      } else if (dp < 1.55 && Math.abs(dy) < 1.8 && z.attackCd <= 0) { z.attackT = 0.55; z.attackCd = 1.15; z.hitDone = false; }
      // groans
      z.groanT -= dt; if (z.groanT <= 0) { z.groanT = 3 + Math.random() * 7; if (dp < 30) BR.Audio.zGroan && BR.Audio.zGroan(dp); }
    }
  };

  // ======================================================================== bosses
  // Each boss: a model, a hitbox, a speed, and three moves. Moves are small state machines:
  // { dur, start(b, M), tick(b, M, t, dt), end(b, M) }. The boss chases you between moves.
  const BOSSES = {};
  const faceTex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); draw(x); const t = new THREE.CanvasTexture(c); return t; };

  // ---- 1. The Pumpkin King: a towering scarecrow with a burning jack-o'-lantern head
  BOSSES.pumpkin = {
    name: 'THE PUMPKIN KING', sub: 'Lord of the Hollow Harvest', color: 0xff7a1a, hp: 4000, speed: 0.5, scale: 2.0,
    hitbox: { r: 0.75, h: 3.9, bodyTop: 3.0, headR: 0.62, headY: 3.45 },
    build(g, B) {
      const robe = lam(0x2a1630), straw = lam(0xb08a3a), vine = lam(0x2f4a1e), pump = new THREE.MeshPhongMaterial({ color: 0xff7a1a, emissive: 0x6a2400, shininess: 30 });
      const body = new THREE.Group(); g.add(body);
      const cloak = mesh(new THREE.ConeGeometry(0.85, 2.5, 10, 1, true), robe, 0, 1.3, 0); body.add(cloak);
      for (let i = 0; i < 10; i++) { const s = mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), straw, Math.cos(i * 0.63) * 0.8, 0.22, Math.sin(i * 0.63) * 0.8); s.rotation.z = (Math.random() - 0.5) * 0.6; body.add(s); }  // straw hem
      const torso = mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.9, 10), robe, 0, 2.55, 0); body.add(torso);
      { const _m = mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 14), vine, 0, 2.95, 0); _m.rotation.x = Math.PI / 2; body.add(_m); }
      const head = new THREE.Group(); head.position.y = 3.45; body.add(head);
      const pk = mesh(new THREE.SphereGeometry(0.62, 18, 12), pump); pk.scale.set(1.15, 0.85, 1.05); head.add(pk);
      for (let i = 0; i < 8; i++) { const rib = mesh(new THREE.SphereGeometry(0.6, 12, 8), pump); rib.scale.set(0.35, 0.86, 0.6); rib.position.set(Math.cos(i / 8 * 6.28) * 0.45, 0, Math.sin(i / 8 * 6.28) * 0.42); rib.rotation.y = -i / 8 * 6.28; head.add(rib); }
      head.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 6), vine, 0, 0.6, 0));
      for (let i = 0; i < 7; i++) { const sp = mesh(new THREE.ConeGeometry(0.06, 0.32, 5), vine, Math.cos(i * 0.9) * 0.42, 0.55, Math.sin(i * 0.9) * 0.42); sp.rotation.set(Math.sin(i) * 0.4, 0, Math.cos(i) * 0.4); head.add(sp); }   // crown of thorns
      const ft = faceTex(x => { x.fillStyle = '#fff3a0'; x.shadowColor = '#ff9a1a'; x.shadowBlur = 14;
        const tri = (a, b, c) => { x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...c); x.fill(); };
        tri([22, 52], [50, 30], [54, 58]); tri([106, 52], [78, 30], [74, 58]); tri([56, 66], [64, 54], [72, 66]);
        x.beginPath(); x.moveTo(20, 76); for (let i = 0; i <= 8; i++) x.lineTo(20 + i * 11, i % 2 ? 98 : 82); x.lineTo(108, 76); x.quadraticCurveTo(64, 120, 20, 76); x.fill(); });
      const face = mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, -0.66); face.rotation.y = Math.PI; head.add(face);
      const glow = sprite(0xff8a1a, 2.4); head.add(glow);
      const light = new THREE.PointLight(0xff7a1a, 2.2, 14, 2); head.add(light);
      const arm = s => { const sh = new THREE.Group(); sh.position.set(s * 0.6, 2.85, 0); body.add(sh);
        sh.add(mesh(cyl(0.09, 0.07, 1.0), robe)); const el = new THREE.Group(); el.position.y = -1.0; sh.add(el); el.add(mesh(cyl(0.06, 0.05, 0.9), straw));
        for (let f = 0; f < 4; f++) { const cl = mesh(new THREE.ConeGeometry(0.03, 0.32, 4), lam(0x1a1410), (f - 1.5) * 0.05, -1.0, -0.04); cl.rotation.x = Math.PI; el.add(cl); }
        return { sh, el }; };
      B.u = { body, head, face, glow, light, AR: arm(1), AL: arm(-1) };
    },
    anim(b, u, dt, M) {
      const t = b.t; u.body.rotation.z = Math.sin(t * 1.5) * 0.05;
      u.head.rotation.y = Math.sin(t * 0.7) * 0.25;
      const fl = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3); u.light.intensity = 2.2 * fl; u.glow.material.opacity = 0.65 * fl;
      const raise = M && (M.id === 'fireballs' || M.id === 'summon') ? 1 : 0, slam = M && M.id === 'slam' ? 1 : 0;
      u.AR.sh.rotation.x = -0.3 - raise * 2.2 - slam * 2.6 + Math.sin(t * 2) * 0.1; u.AL.sh.rotation.x = -0.3 - raise * 1.4 - slam * 2.6 + Math.sin(t * 2 + 1) * 0.1;
      u.AR.sh.rotation.z = -0.25; u.AL.sh.rotation.z = 0.25;
      if (Math.random() < dt * 8) b.zm.g.fx.burst(b.mesh.localToWorld(new THREE.Vector3(0, 4.2, 0)), [0xff7a1a, 0xffd24a, 0xff3a00], 2, 1.2, 0.08, 0.6, -3);   // the head smoulders
    },
    moves: {
      // a volley of arcing fireballs that burst into fire on impact
      fireballs: { dur: 2.2, start(b, M) { M.n = 0; }, tick(b, M, t) { if (t > 0.5 + M.n * 0.3 && M.n < 5) { M.n++;
        const Z = b.zm, src = b.mesh.localToWorld(new THREE.Vector3(0, 4, -0.5)), tgt = Z.lead(0.6 + Math.random() * 0.3).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
        const T = 1.0, vel = new THREE.Vector3((tgt.x - src.x) / T, (tgt.y - src.y) / T + 0.5 * 20 * T, (tgt.z - src.z) / T);
        Z.projectile({ pos: src, vel, grav: 20, r: 0.45, dmg: 14, color: 0xff7a1a, size: 1.1, trail: [0xff7a1a, 0xffd24a, 0xff3a00], explode: { r: 3.2, dmg: 10, colors: [0xff7a1a, 0xffd24a, 0xff3a00], fire: 2.5 } });
        BR.Audio.zFire && BR.Audio.zFire(); } } },
      // leaps at you and lands with a shockwave ring (jump over it)
      slam: { dur: 2.0, start(b, M) { M.from = b.pos.clone(); M.to = b.zm.g.player.pos.clone(); M.landed = false; b.zm.telegraph(M.to, 5.5, 0xff3a00, 1.0); },
        tick(b, M, t) { const k = Math.min(1, Math.max(0, (t - 0.25) / 0.75)); if (t > 0.25 && !M.landed) { b.mover.pos.lerpVectors(M.from, M.to, k); b.mover.pos.y = M.from.y + Math.sin(k * Math.PI) * 6; b.mover.vel.set(0, 0, 0); }
          if (k >= 1 && !M.landed) { M.landed = true; b.mover.pos.y = b.zm.g.world.groundAt(b.pos.x, b.pos.z, b.pos.y + 2); b.zm.shockRing(b.pos.clone(), 9, 30, 0xff7a1a); b.zm.g.cam.shake = Math.max(b.zm.g.cam.shake, 0.4); } } },
      // raises a ring of zombies from the earth around him
      summon: { dur: 1.6, start(b, M) { b.zm.g.fx.burst(b.pos.clone().setY(b.pos.y + 2), [0xff7a1a, 0x7dff3a], 40, 6, 0.1, 1, 2); }, tick(b, M, t) { if (t > 0.6 && !M.done) { M.done = true; for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; b.zm.spawnZombie({ x: b.pos.x + Math.cos(a) * 3, z: b.pos.z + Math.sin(a) * 3 }, 2); } } } },
    },
  };

  // ---- 2. The Weeping Bride: a floating banshee in a tattered veil that blinks, screams and casts spirit orbs
  BOSSES.banshee = {
    name: 'THE WEEPING BRIDE', sub: 'She never left the altar', color: 0x9fe8ff, hp: 3600, speed: 0.75, scale: 1.3, float: true,
    hitbox: { r: 0.6, h: 3.7, bodyTop: 2.9, headR: 0.34, headY: 3.35 },
    build(g, B) {
      const ghost = new THREE.MeshPhongMaterial({ color: 0xcfefff, emissive: 0x2a5a7a, transparent: true, opacity: 0.62, shininess: 80, side: THREE.DoubleSide, depthWrite: false });
      const hair = lam(0x0c0c14), veilM = new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const body = new THREE.Group(); g.add(body);
      body.add(mesh(new THREE.ConeGeometry(0.8, 2.3, 14, 1, true), ghost, 0, 1.25, 0));
      const strips = [];
      for (let i = 0; i < 12; i++) { const s = mesh(new THREE.PlaneGeometry(0.22, 1.2), ghost, Math.cos(i * 0.52) * 0.72, -0.25, Math.sin(i * 0.52) * 0.72); s.rotation.y = -i * 0.52; body.add(s); strips.push(s); }
      body.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.7, 10), ghost, 0, 2.3, 0));
      const head = new THREE.Group(); head.position.y = 2.75; body.add(head);
      head.add(mesh(new THREE.SphereGeometry(0.24, 14, 10), ghost));
      for (const x of [-0.08, 0.08]) { head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), basic(0x001018), x, 0.02, -0.2)); const e = sprite(0x6ff0ff, 0.22); e.position.set(x, 0.02, -0.23); head.add(e); }
      for (let i = 0; i < 14; i++) { const h = mesh(new THREE.BoxGeometry(0.035, 1.1, 0.02), hair, Math.cos(i * 0.45 + 1.6) * 0.2, -0.45, Math.sin(i * 0.45 + 1.6) * 0.18 + 0.04); h.rotation.z = (Math.random() - 0.5) * 0.2; head.add(h); }
      const veil = mesh(new THREE.ConeGeometry(0.5, 1.6, 14, 1, true), veilM, 0, -0.45, 0.05); head.add(veil);
      const arm = s => { const sh = new THREE.Group(); sh.position.set(s * 0.32, 2.45, 0); body.add(sh); sh.add(mesh(cyl(0.05, 0.03, 0.9), ghost)); return { sh }; };
      const aura = sprite(0x6ff0ff, 4.5); aura.position.y = 1.6; aura.material.opacity = 0.25; body.add(aura);
      B.u = { body, head, strips, AR: arm(1), AL: arm(-1), aura };
    },
    anim(b, u, dt, M) {
      const t = b.t; u.body.position.y = 0.6 + Math.sin(t * 1.6) * 0.25;
      u.strips.forEach((s, i) => { s.rotation.x = Math.sin(t * 3 + i) * 0.35; });
      const scream = M && M.id === 'scream' ? 1 : 0;
      u.AR.sh.rotation.set(-1.3 - scream * 0.5 + Math.sin(t * 1.3) * 0.2, 0, -0.5 - scream * 0.6); u.AL.sh.rotation.set(-1.3 - scream * 0.5 + Math.sin(t * 1.3 + 1) * 0.2, 0, 0.5 + scream * 0.6);
      u.head.rotation.x = -0.2 - scream * 0.4; u.aura.material.opacity = 0.2 + scream * 0.4 + 0.08 * Math.sin(t * 5);
      if (Math.random() < dt * 10) b.zm.g.fx.burst(b.mesh.localToWorld(new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5))), [0x9fe8ff, 0xffffff], 1, 0.6, 0.07, 0.9, -1.5);   // ghostly wisps
    },
    moves: {
      // vanishes in a puff of spirit smoke and reappears close to you
      blink: { dur: 1.1, start(b, M) { b.zm.g.fx.burst(b.pos.clone().setY(b.pos.y + 1.5), [0x9fe8ff, 0xffffff, 0x2a5a7a], 40, 6, 0.12, 0.9, 0); b.mesh.visible = false; },
        tick(b, M, t) { if (t > 0.45 && !M.done) { M.done = true; const p = b.zm.g.player.pos, a = Math.random() * 6.28; const x = U.clamp(p.x + Math.cos(a) * 6, -38, 38), z = U.clamp(p.z + Math.sin(a) * 6, -38, 38);
          b.mover.pos.set(x, b.zm.g.world.groundAt(x, z, 20), z); b.mesh.visible = true; b.zm.g.fx.burst(b.pos.clone().setY(b.pos.y + 1.5), [0x9fe8ff, 0xffffff], 40, 6, 0.12, 0.9, 0); BR.Audio.zBlink && BR.Audio.zBlink(); } },
        end(b) { b.mesh.visible = true; } },
      // inhales (glow), then a wailing shockwave: damage + slow if you're within 13 m
      scream: { dur: 1.9, start(b, M) { b.zm.telegraph(b.pos.clone(), 13, 0x6ff0ff, 0.9); },
        tick(b, M, t) { if (t > 0.9 && !M.done) { M.done = true; const Z = b.zm, p = Z.g.player; BR.Audio.zScream && BR.Audio.zScream();
          Z.shockRing(b.pos.clone().setY(b.pos.y + 1.2), 13, 0, 0x9fe8ff, true);
          if (p.pos.distanceTo(b.pos) < 13) { Z.g.applyDamage(p, b, 20, false, { x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z }, 'boss'); p.zSlowT = 2.5; Z.g.hud.shockFlash && Z.g.hud.shockFlash(); } } } },
      // six slow homing spirit orbs
      orbs: { dur: 1.6, tick(b, M, t) { if (t > 0.3 + (M.n || 0) * 0.18 && (M.n || 0) < 6) { M.n = (M.n || 0) + 1; const a = M.n / 6 * 6.28;
        b.zm.projectile({ pos: b.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 2.4, Math.sin(a) * 1.2)), vel: new THREE.Vector3(Math.cos(a) * 3, 2, Math.sin(a) * 3), grav: 0, homing: 3.2, speed: 7, r: 0.4, dmg: 12, color: 0x6ff0ff, size: 0.9, life: 6, trail: [0x9fe8ff, 0xffffff], shootable: true }); } } },
    },
  };

  // ---- 3. The Bone Colossus: a horned giant skeleton that charges, raises bone spikes and roars
  BOSSES.colossus = {
    name: 'THE BONE COLOSSUS', sub: 'Built from a thousand graves', color: 0xff2a2a, hp: 6000, speed: 0.45, scale: 2.4,
    hitbox: { r: 0.9, h: 4.6, bodyTop: 3.6, headR: 0.55, headY: 4.1 },
    build(g, B) {
      const bone = new THREE.MeshPhongMaterial({ color: 0xd8d0b8, specular: 0x333333, shininess: 20 }), dark = lam(0x2a241c);
      const body = new THREE.Group(); g.add(body);
      const legs = [];
      for (const s of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(s * 0.32, 1.9, 0); body.add(hip); hip.add(mesh(cyl(0.12, 0.09, 0.95), bone));
        const kn = new THREE.Group(); kn.position.y = -0.95; hip.add(kn); kn.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), bone)); kn.add(mesh(cyl(0.1, 0.08, 0.9), bone)); kn.add(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.4), bone, 0, -0.92, -0.08)); legs.push({ hip, kn }); }
      { const _m = mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 12, Math.PI), bone, 0, 1.95, 0); _m.rotation.x = Math.PI / 2; body.add(_m); }    // pelvis
      for (let i = 0; i < 9; i++) body.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), bone, 0, 2.05 + i * 0.16, 0.12));      // spine
      for (let i = 0; i < 6; i++) { const rib = mesh(new THREE.TorusGeometry(0.42 - i * 0.025, 0.04, 5, 16, Math.PI * 1.4), bone, 0, 2.55 + i * 0.16, 0); rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.8); body.add(rib); }
      const glowCore = sprite(0xff2a2a, 1.2); glowCore.position.set(0, 2.9, 0); body.add(glowCore);
      const head = new THREE.Group(); head.position.set(0, 4.1, -0.05); body.add(head);
      const sk = mesh(new THREE.SphereGeometry(0.42, 14, 10), bone); sk.scale.set(1, 1.05, 1.15); head.add(sk);
      const jaw = mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), bone, 0, -0.38, -0.12); head.add(jaw);
      for (const x of [-0.16, 0.16]) { head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), basic(0x050000), x, 0.04, -0.4)); const e = sprite(0xff2a2a, 0.5); e.position.set(x, 0.04, -0.46); head.add(e);
        const horn = mesh(new THREE.ConeGeometry(0.1, 0.9, 6), dark, x * 2.2, 0.45, 0); horn.rotation.z = -Math.sign(x) * 0.7; head.add(horn); }
      const arm = s => { const sh = new THREE.Group(); sh.position.set(s * 0.62, 3.55, 0); body.add(sh); sh.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), bone));
        sh.add(mesh(new THREE.ConeGeometry(0.1, 0.5, 5), dark, 0, 0.25, 0)); sh.add(mesh(cyl(0.11, 0.08, 1.1), bone));
        const el = new THREE.Group(); el.position.y = -1.1; sh.add(el); el.add(mesh(cyl(0.09, 0.07, 1.0), bone));
        for (let f = 0; f < 4; f++) { const c = mesh(new THREE.ConeGeometry(0.04, 0.35, 4), bone, (f - 1.5) * 0.07, -1.05, 0); c.rotation.x = Math.PI; el.add(c); }
        return { sh, el }; };
      B.u = { body, head, jaw, legs, glowCore, AR: arm(1), AL: arm(-1) };
    },
    anim(b, u, dt, M) {
      const t = b.t, sp = b.mover.speedH, c = Math.sin(t * (2 + sp));
      u.legs[0].hip.rotation.x = c * 0.4; u.legs[1].hip.rotation.x = -c * 0.4; u.legs[0].kn.rotation.x = Math.max(0, -c) * 0.5; u.legs[1].kn.rotation.x = Math.max(0, c) * 0.5;
      const ch = M && M.id === 'charge' ? 1 : 0, roar = M && M.id === 'roar' ? 1 : 0;
      u.body.rotation.x = ch * 0.4; u.jaw.rotation.x = 0.1 + roar * 0.6 + Math.abs(Math.sin(t * 2)) * 0.1;
      u.AR.sh.rotation.set(-0.2 - ch * 1.0 - roar * 2.4 + c * 0.2, 0, -0.2 - roar * 0.5); u.AL.sh.rotation.set(-0.2 - ch * 1.0 - roar * 2.4 - c * 0.2, 0, 0.2 + roar * 0.5);
      u.glowCore.material.opacity = 0.6 + 0.3 * Math.sin(t * 5);
    },
    moves: {
      // lowers its head and charges along a telegraphed line
      charge: { dur: 2.3, start(b, M) { const p = b.zm.g.player.pos; M.dir = new THREE.Vector3(p.x - b.pos.x, 0, p.z - b.pos.z).normalize(); b.yaw = Math.atan2(-M.dir.x, -M.dir.z); b.zm.lane(b.pos.clone(), M.dir, 22, 0xff2a2a, 0.8); },
        tick(b, M, t, dt) { if (t > 0.8 && t < 1.9) { const s = 17; b.mover.pos.addScaledVector(M.dir, s * dt); b.mover.pos.x = U.clamp(b.pos.x, -39, 39); b.mover.pos.z = U.clamp(b.pos.z, -39, 39);
          b.mover.pos.y = b.zm.g.world.groundAt(b.pos.x, b.pos.z, b.pos.y + 1.5); if (Math.random() < 0.5) b.zm.g.fx.burst(b.pos.clone(), [0x6a5a48, 0xd8d0b8], 3, 3, 0.1, 0.5, 9);
          const p = b.zm.g.player; if (!M.hit && p.pos.distanceTo(b.pos) < 2.2) { M.hit = true; b.zm.g.applyDamage(p, b, 40, false, { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, 'boss'); p.mover.vel.addScaledVector(M.dir, 14); p.mover.vel.y = 7; p.mover.onGround = false; } } } },
      // bone spikes burst from the ground under and around you after a red warning
      spikes: { dur: 2.0, start(b, M) { const p = b.zm.g.player.pos; M.pts = [p.clone()]; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + Math.random(); M.pts.push(p.clone().add(new THREE.Vector3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2))); }
          M.pts.forEach(q => b.zm.spikeAt(q, 1.0)); } },
      // a roar that shakes the screen, slows you and calls three fast skeleton runners
      roar: { dur: 1.8, tick(b, M, t) { if (t > 0.5 && !M.done) { M.done = true; const Z = b.zm; BR.Audio.zRoar && BR.Audio.zRoar(); Z.g.cam.shake = Math.max(Z.g.cam.shake, 0.5);
        Z.shockRing(b.pos.clone().setY(b.pos.y + 0.2), 16, 0, 0xff2a2a, true); Z.g.player.zSlowT = 2;
        for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28; Z.spawnZombie({ x: b.pos.x + Math.cos(a) * 4, z: b.pos.z + Math.sin(a) * 4 }, 2, 0.95); } } } },
    },
  };

  // ---- 4. The Plague Doctor: beaked mask, toxic flasks, a murder of crows, and vanishing acts
  BOSSES.plague = {
    name: 'THE PLAGUE DOCTOR', sub: 'The cure is worse', color: 0x7dff3a, hp: 5000, speed: 0.62, scale: 1.55,
    hitbox: { r: 0.6, h: 3.2, bodyTop: 2.5, headR: 0.36, headY: 2.8 },
    build(g, B) {
      const coat = lam(0x15131a), leather = lam(0x6a4a2a), brim = lam(0x0d0c10);
      const body = new THREE.Group(); g.add(body);
      body.add(mesh(new THREE.ConeGeometry(0.75, 2.5, 12, 1, true), coat, 0, 1.25, 0));
      body.add(mesh(new THREE.CylinderGeometry(0.34, 0.45, 0.7, 10), coat, 0, 2.3, 0));
      const cape = mesh(new THREE.ConeGeometry(0.62, 1.2, 12, 1, true, 0, Math.PI), coat, 0, 2.2, 0.05); cape.rotation.y = Math.PI; body.add(cape);
      const head = new THREE.Group(); head.position.y = 2.8; body.add(head);
      head.add(mesh(new THREE.SphereGeometry(0.28, 12, 10), leather));
      const beak = mesh(new THREE.ConeGeometry(0.12, 0.7, 10), leather, 0, -0.12, -0.45); beak.rotation.x = -Math.PI / 2 - 0.35; head.add(beak);
      for (const x of [-0.11, 0.11]) { head.add(mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 14), brim, x, 0.05, -0.25)); { const _m = mesh(new THREE.CircleGeometry(0.065, 14), basic(0x7dff3a), x, 0.05, -0.255); _m.rotation.y = Math.PI; head.add(_m); }
        const e = sprite(0x7dff3a, 0.3); e.position.set(x, 0.05, -0.28); head.add(e); }
      head.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 20), brim, 0, 0.2, 0)); head.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.38, 14), brim, 0, 0.4, 0));
      const arm = s => { const sh = new THREE.Group(); sh.position.set(s * 0.42, 2.45, 0); body.add(sh); sh.add(mesh(cyl(0.09, 0.07, 0.95), coat)); return { sh }; };
      const AR = arm(1), AL = arm(-1);
      const lantern = new THREE.Group(); lantern.position.set(0, -1.0, 0); AL.sh.add(lantern);
      lantern.add(mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: 0.75 }))); const lg = sprite(0x7dff3a, 1.2); lantern.add(lg);
      const cane = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), leather, 0, -0.6, 0); AR.sh.add(cane);
      B.u = { body, head, AR, AL, lg, coatMat: coat };
    },
    anim(b, u, dt, M) {
      const t = b.t; u.body.rotation.z = Math.sin(t * 1.2) * 0.05; u.head.rotation.y = Math.sin(t * 0.6) * 0.3;
      const thr = M && M.id === 'flasks' ? Math.sin(Math.min(1, b.moveT / 0.4) * Math.PI) : 0;
      u.AR.sh.rotation.set(-0.3 - thr * 2.2, 0, -0.15); u.AL.sh.rotation.set(-0.6 + Math.sin(t * 2) * 0.15, 0, 0.2);
      u.lg.material.opacity = 0.6 + 0.3 * Math.sin(t * 9) * Math.sin(t * 3.3);
    },
    moves: {
      // lobs three flasks that shatter into lingering toxic clouds (stay out of the green)
      flasks: { dur: 1.8, tick(b, M, t) { if (t > 0.3 + (M.n || 0) * 0.35 && (M.n || 0) < 3) { M.n = (M.n || 0) + 1; const Z = b.zm, src = b.mesh.localToWorld(new THREE.Vector3(0.4, 2.6, -0.3));
        const tgt = Z.lead(0.7).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), T = 1.1;
        Z.projectile({ pos: src, vel: new THREE.Vector3((tgt.x - src.x) / T, (tgt.y - src.y) / T + 0.5 * 20 * T, (tgt.z - src.z) / T), grav: 20, r: 0.3, dmg: 10, color: 0x7dff3a, size: 0.7, trail: [0x7dff3a, 0xd8ff6a], spin: true, explode: { r: 2.5, dmg: 8, colors: [0x7dff3a, 0x2a6a1a], gas: 5.5 } }); } } },
      // a murder of crows: circles you, then dives one by one (shoot them down)
      crows: { dur: 1.2, start(b, M) { const Z = b.zm; BR.Audio.zCrows && BR.Audio.zCrows(); for (let i = 0; i < 9; i++) Z.crow(b.pos.clone().setY(b.pos.y + 3), i); } },
      // fades to a shimmer, reappears behind you and bursts a gas cloud
      vanish: { dur: 2.0, start(b, M) { b.u.coatMat.transparent = true; b.mesh.traverse(o => { if (o.material) o.material.__op = o.material.opacity; }); },
        tick(b, M, t) { const k = t < 0.5 ? 1 - t / 0.5 : t > 1.5 ? (t - 1.5) / 0.5 : 0; b.mesh.traverse(o => { if (o.material && o.material.__op !== undefined) { o.material.transparent = true; o.material.opacity = Math.max(0.06, o.material.__op * k); } });
          if (t > 1.0 && !M.done) { M.done = true; const p = b.zm.g.player; const bx = p.pos.x + Math.sin(p.yaw) * 4, bz = p.pos.z + Math.cos(p.yaw) * 4;
            b.mover.pos.set(U.clamp(bx, -38, 38), 0, U.clamp(bz, -38, 38)); b.mover.pos.y = b.zm.g.world.groundAt(b.pos.x, b.pos.z, 20); b.zm.gasCloud(b.pos.clone(), 3.2, 5); } },
        end(b) { b.mesh.traverse(o => { if (o.material && o.material.__op !== undefined) { o.material.opacity = o.material.__op; delete o.material.__op; } }); } },
    },
  };
  BR.ZOMBIE_BOSSES = BOSSES;
  const BOSS_ORDER = ['pumpkin', 'banshee', 'colossus', 'plague'];

  BR.ZBoss = class ZBoss extends BR.Zombie {
    constructor(game, zm, type, round) {
      const D = BOSSES[type], cycle = Math.floor((round / ZC.bossEvery - 1) / BOSS_ORDER.length);
      const hp = Math.round(D.hp * (1 + 0.6 * cycle) * (1 + 0.03 * (round - 10)));
      super(game, { name: D.name, stats: { hp, dmg: 35 }, speed: D.speed, rise: 1.4, boss: type });
      this.boss = type; this.D = D; this.zm = zm; this.t = 0; this.hitbox = D.hitbox;
      this.moveCd = 2.5; this.move = null; this.moveT = 0; this.lastMove = null; this.attackCd = 1;
    }
    buildMesh() {
      const o = PENDING; const D = BOSSES[o.boss], g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
      const holder = {}; D.build(inner, holder);          // models are built at true size (hitboxes match)
      this._u = holder.u; g.userData = { mat: new THREE.MeshLambertMaterial(), inner };
      return g;
    }
    get u() { return this._u; }
    update(dt) {
      if (!this.alive) return;
      this.t += dt;
      if (this.riseT > 0) this.riseT = Math.max(0, this.riseT - dt);
      const Z = this.zm, p = Z.g.player;
      // moves
      if (this.move) {
        this.moveT += dt;
        const M = this.move, mv = this.D.moves[M.id];
        if (mv.tick) mv.tick(this, M, this.moveT, dt);
        if (this.moveT >= mv.dur) { if (mv.end) mv.end(this, M); this.move = null; this.moveCd = 2.6 + Math.random() * 1.6; }
      } else if (this.riseT <= 0) {
        this.moveCd -= dt;
        if (this.moveCd <= 0 && p.alive) {
          const ids = Object.keys(this.D.moves).filter(k => k !== this.lastMove), id = ids[Math.floor(Math.random() * ids.length)];
          this.lastMove = id; this.move = { id }; this.moveT = 0; const mv = this.D.moves[id]; if (mv.start) mv.start(this, this.move);
        }
      }
      // chase between moves (and swipe when close)
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z), tg = Z.navTarget ? Z.navTarget(this, p) : p.pos;   // walk round walls (zmnav.js)
      this.yaw = dampAngle(this.yaw, Math.atan2(-(tg.x - this.pos.x), -(tg.z - this.pos.z)), 5, dt);
      this.input.mz = !this.move && this.riseT <= 0 && d > 2.2 ? 1 : 0; this.input.mx = 0;
      this.input.speedMult = this.zSpeed;
      if (!this.move || this.move.id !== 'slam') { if (this.riseT <= 0 && !(this.move && this.move.id === 'charge' && this.moveT > 0.8)) this.mover.update(dt, this.input, this.yaw); }
      if (this.D.float) this.mover.vel.y = Math.max(this.mover.vel.y, 0);
      this.attackCd -= dt;
      if (!this.move && d < 2.6 && this.attackCd <= 0 && p.alive) { this.attackCd = 1.7; Z.g.applyDamage(p, this, 28, false, { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z }, 'boss'); BR.Audio.zSwipe && BR.Audio.zSwipe(); }
      this.syncMesh(dt);
    }
    syncMesh(dt) {
      this.mesh.position.copy(this.mover.pos);
      if (this.riseT > 0) this.mesh.position.y -= (this.riseT / this.riseMax) * 3.5;
      this.mesh.rotation.y = this.yaw;
      this.D.anim(this, this.u, dt, this.move);
    }
    flash() { if (!this.mesh) return; this.mesh.userData.inner.traverse(o => { if (o.material && o.material.emissive && !o.material.__f) { o.material.__f = o.material.emissive.getHex(); o.material.emissive.setHex(0x553333); } });
      clearTimeout(this._flashTO); this._flashTO = setTimeout(() => this.mesh.userData.inner.traverse(o => { if (o.material && o.material.__f !== undefined) { o.material.emissive.setHex(o.material.__f); delete o.material.__f; } }), 60); }
    dieVisual() {}
  };

  // ======================================================================== the mode
  BR.ZombieMode = class ZombieMode {
    constructor(game) {
      this.g = game; this.round = 0; this.points = ZC.startPoints; this.kills = 0; this.zombies = []; this.toSpawn = 0; this.spawnT = 0;
      this.phase = 'break'; this.breakT = 3; this.boss = null; this.proj = []; this.haz = []; this.powers = []; this.powersRound = 0;
      this.insta = 0; this.double = 0; this.bossKills = 0; this.light = 0;
    }

    // ---- setup -------------------------------------------------------------
    start() {
      const g = this.g, C = BR.CONFIG, W = g.world;
      this.night();
      this.decorate();
      const p = g.player = new BR.Actor(g, { id: 0, name: 'You', isPlayer: true });
      const sp = W.spawns[0];
      p.mover.dropping = false; p.mover.pos.set(sp.x, 0, sp.z); p.yaw = sp.yaw; p.pitch = 0;
      p.slots = [BR.Weapons.create('pistol'), null, BR.Weapons.create(BR.Profile.melee())]; p.cur = 0;
      p.ammo.light = 96; p.health = C.actor.maxHealth; p.shield = 0;
      g.actors.push(p);
      this.wallBuys();
      g.hud.zmShow(true); g.hud.zmPoints(this.points, 0); g.hud.zmRound(0);
      this.phase = 'break'; this.breakT = 2.5;
    }

    // night: dark violet sky with a blood-orange horizon, moonlight, purple fog, no clouds
    night() {
      const g = this.g, sc = g.scene, W = g.world;
      sc.background = new THREE.Color(0x120a1c); sc.fog = new THREE.Fog(0x1a1028, 20, 110);
      sc.traverse(o => {
        if (o.isHemisphereLight) { o.color.setHex(0x8f7ad0); o.groundColor.setHex(0x2a2018); o.intensity = 0.95; }
        if (o.isDirectionalLight) { if (o === g.sun) { o.color.setHex(0xb8c8ff); o.intensity = 0.75; o.position.set(-0.4, 0.6, -0.7); } else { o.color.setHex(0xff7a2a); o.intensity = 0.14; } }
        const m = o.material;
        if (m && m.isMeshBasicMaterial && m.fog === false && o !== W.sky) { if (o.isInstancedMesh) m.color.setHex(0x2a2140); else o.visible = false; }
        if (o.isSprite && o.material && o.material.fog === false) o.visible = false;
      });
      if (W.clouds) W.clouds.visible = false;
      if (W.sky) { const ca = W.sky.geometry.attributes.color, pa = W.sky.geometry.attributes.position, v = new THREE.Vector3(), c = new THREE.Color();
        const zen = new THREE.Color(0x07040e), mid = new THREE.Color(0x22123a), hor = new THREE.Color(0x6a2438), low = new THREE.Color(0x140a1c);
        for (let i = 0; i < pa.count; i++) { v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).normalize(); const k = U.clamp(v.y, 0, 1);
          c.copy(hor).lerp(mid, Math.pow(k, 0.45)).lerp(zen, Math.pow(k, 1.3)); if (v.y < 0) c.copy(low); ca.setXYZ(i, c.r, c.g, c.b); }
        ca.needsUpdate = true; W.sky.visible = true; }
      // moon with craters + halo
      const mt = faceTex(x => { const gr = x.createRadialGradient(54, 54, 10, 64, 64, 64); gr.addColorStop(0, '#fffbe8'); gr.addColorStop(1, '#e8dcb0'); x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
        x.fillStyle = 'rgba(160,140,100,0.35)'; for (const [cx, cy, r] of [[44, 48, 12], [80, 70, 16], [60, 92, 9], [90, 40, 7], [38, 80, 6]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); } });
      const moonDir = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
      const moon = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshBasicMaterial({ map: mt, transparent: true, fog: false, depthWrite: false }));
      moon.position.copy(moonDir).multiplyScalar(800); moon.lookAt(0, 0, 0); moon.renderOrder = -9; moon.material.toneMapped = false; sc.add(moon);
      const halo = sprite(0xffe9b0, 420); halo.material.opacity = 0.35; halo.material.fog = false; halo.position.copy(moonDir).multiplyScalar(790); halo.renderOrder = -8; sc.add(halo);
      this.sky = { moon, halo };
    }

    // pumpkins, dead trees, lanterns, candles, ground mist, bats
    decorate() {
      const g = this.g, sc = g.scene, W = g.world, R = Math.random;
      const deco = this.deco = new THREE.Group(); sc.add(deco);
      const pumpMat = new THREE.MeshPhongMaterial({ color: 0xff7a1a, emissive: 0x4a1a00, shininess: 25 }), stem = lam(0x3a4a1e);
      const faceT = faceTex(x => { x.fillStyle = '#ffe28a'; x.shadowColor = '#ff8a1a'; x.shadowBlur = 10; const tri = (a, b, c) => { x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...c); x.fill(); };
        tri([30, 54], [48, 34], [56, 58]); tri([98, 54], [80, 34], [72, 58]); x.beginPath(); x.moveTo(28, 76); for (let i = 0; i <= 6; i++) x.lineTo(28 + i * 12, i % 2 ? 96 : 82); x.lineTo(100, 76); x.quadraticCurveTo(64, 112, 28, 76); x.fill(); });
      const faceM = new THREE.MeshBasicMaterial({ map: faceT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.flicker = [];
      const pumpkin = (x, y, z, s, light) => {
        const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = R() * 6.28; p.scale.setScalar(s);
        for (let i = 0; i < 6; i++) { const r = mesh(new THREE.SphereGeometry(0.26, 10, 8), pumpMat); r.scale.set(0.55, 0.78, 1); r.position.set(Math.cos(i / 6 * 6.28) * 0.12, 0.2, Math.sin(i / 6 * 6.28) * 0.12); r.rotation.y = -i / 6 * 6.28; p.add(r); }
        p.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 6), stem, 0, 0.44, 0));
        const f = mesh(new THREE.PlaneGeometry(0.44, 0.44), faceM, 0, 0.2, 0.27); p.add(f);
        const gl = sprite(0xff8a1a, 1.4 * s); gl.position.y = 0.25; gl.material.opacity = 0.55; p.add(gl); this.flicker.push(gl);
        if (light) { const L = new THREE.PointLight(0xff7a1a, 1.4, 10, 2); L.position.y = 0.6; p.add(L); this.flicker.push(L); }
        deco.add(p); return p;
      };
      // gate pillars, chapel door, crypt doors, and scattered among the graves
      pumpkin(-4.5, 4.9, 42, 1.4, true); pumpkin(4.5, 4.9, 42, 1.4, false);
      pumpkin(-2.6, 0, -14.5, 1.2, true); pumpkin(2.6, 0, -14.5, 1.0, false);
      for (const [x, z] of [[-25, -14], [25, -14], [-25, 16], [25, 16]]) pumpkin(x + 1.8, 0, z, 0.9, false);
      for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = 8 + R() * 30; pumpkin(Math.cos(a) * r, 0, Math.sin(a) * r, 0.6 + R() * 0.6, i === 0); }
      // dead trees: twisted trunks with forked bare branches (thin collision trunk)
      const bark = lam(0x1e1814);
      const tree = (x, z, h) => {
        const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = R() * 6.28;
        const tr = mesh(new THREE.CylinderGeometry(0.16, 0.38, h, 7), bark, 0, h / 2, 0); tr.rotation.z = (R() - 0.5) * 0.15; t.add(tr);
        const branch = (par, y, len, rz, ry, th, depth) => { const b = new THREE.Group(); b.position.y = y; b.rotation.set(0, ry, rz); par.add(b);
          b.add(mesh(new THREE.CylinderGeometry(th * 0.5, th, len, 5).translate(0, len / 2, 0), bark));
          if (depth > 0) for (let k = 0; k < 2; k++) branch(b, len * (0.6 + R() * 0.35), len * 0.62, (k ? 1 : -1) * (0.5 + R() * 0.4), R() * 6.28, th * 0.6, depth - 1); };
        for (let k = 0; k < 4; k++) branch(t, h * (0.55 + k * 0.1), h * 0.45, (R() - 0.5) * 2.2, k * 1.6 + R(), 0.12, 2);
        deco.add(t); W.addBox(x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3, 0x1e1814, { hidden: true });
      };
      for (const [x, z] of [[-36, -36], [36, -36], [-36, 36], [36, 36], [-14, -4], [14, 30], [-33, 10], [33, -8], [-6, 38], [18, -38]]) tree(x, z, 6 + R() * 4);
      // lanterns on posts
      const iron = lam(0x14131a);
      for (const [x, z] of [[-6, 10], [6, 10], [-6, 24], [6, 24], [-14, -14], [14, -14], [-30, 0], [30, 0]]) {
        deco.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6), iron, x, 1.3, z)); deco.add(mesh(new THREE.BoxGeometry(0.24, 0.32, 0.24), new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.85 }), x, 2.75, z));
        deco.add(mesh(new THREE.ConeGeometry(0.2, 0.18, 4), iron, x, 3.0, z)); const gl = sprite(0xffb24a, 2.2); gl.position.set(x, 2.75, z); gl.material.opacity = 0.5; deco.add(gl); this.flicker.push(gl);
      }
      // candles on the altar
      for (let i = 0; i < 5; i++) { const x = -2 + i, z = -28.4; deco.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), lam(0xeae0c8), x, 1.15, z)); const c = sprite(0xffc46a, 0.35); c.position.set(x, 1.38, z); deco.add(c); this.flicker.push(c); }
      // low drifting ground mist
      this.mist = [];
      for (let i = 0; i < 16; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.Effects.tex().smoke, color: 0x6a5a8a, transparent: true, opacity: 0.22, depthWrite: false }));
        m.scale.set(18, 5, 1); m.position.set((R() - 0.5) * 76, 0.9, (R() - 0.5) * 76); deco.add(m); this.mist.push({ m, v: (R() - 0.5) * 0.8 }); }
      // bats circling the bell tower
      this.bats = [];
      const batM = new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.DoubleSide });
      for (let i = 0; i < 10; i++) { const b = new THREE.Group(); const wl = mesh(new THREE.PlaneGeometry(0.5, 0.22), batM, -0.25, 0, 0), wr = mesh(new THREE.PlaneGeometry(0.5, 0.22), batM, 0.25, 0, 0); b.add(wl, wr, mesh(new THREE.SphereGeometry(0.08, 6, 4), batM));
        deco.add(b); this.bats.push({ b, wl, wr, a: R() * 6.28, r: 4 + R() * 9, h: 14 + R() * 8, s: 0.6 + R() * 0.6 }); }
    }

    wallBuys() {
      const g = this.g, W = g.world, sc = g.scene;
      this.buys = [];
      for (const [wid, x, y, z, nx, nz] of W.zmBuys || []) {
        const cost = ZC.buys[wid] || 1000, def = BR.CONFIG.weapons[wid];
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
        const tex = new THREE.CanvasTexture(cv);
        const draw = img => { c.clearRect(0, 0, 256, 128); c.strokeStyle = 'rgba(255,240,220,0.9)'; c.lineWidth = 3; c.setLineDash([10, 5]); c.strokeRect(6, 6, 244, 116); c.setLineDash([]);
          if (img) { c.globalAlpha = 0.92; c.drawImage(img, 22, 16, 212, 76); c.globalAlpha = 1; }
          c.font = '700 22px Outfit, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff4e0'; c.fillText(def.name.toUpperCase() + '  ·  ' + cost, 128, 114); tex.needsUpdate = true; };
        draw(null);
        const sil = BR.WeaponIcons && BR.WeaponIcons.sil && BR.WeaponIcons.sil[wid];
        if (sil) { const im = new Image(); im.onload = () => draw(im); im.src = sil; }
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        m.position.set(x, y, z); m.lookAt(x + nx, y, z + nz); sc.add(m);
        const gl = sprite(0xffe9c0, 2.2); gl.position.set(x + nx * 0.1, y, z + nz * 0.1); gl.material.opacity = 0.18; sc.add(gl);
        this.buys.push({ wid, cost, x: x + nx * 0.6, y, z: z + nz * 0.6, name: def.name });
      }
    }

    // ---- spawning --------------------------------------------------------------
    spawnZombie(at, riseT, speedOverride) {
      const g = this.g, st = roundStats(this.round), W = g.world;
      let sp = at;
      if (!sp) { const p = g.player.pos, cands = (W.zmSpawns || []).filter(s => Math.hypot(s.x - p.x, s.z - p.z) > 12); const list = cands.length ? cands : W.zmSpawns; sp = list[Math.floor(Math.random() * list.length)]; }
      const roll = Math.random(), mix = st.mix, type = roll < mix[0] ? 0 : roll < mix[0] + mix[1] ? 1 : 2;
      const z = new BR.Zombie(g, { id: 1000 + Math.floor(Math.random() * 1e6), stats: st, speed: speedOverride || SPEED[type] * (0.92 + Math.random() * 0.16), rise: riseT === undefined ? 1.1 : riseT, eyes: this.round >= 20 ? 0xff2a2a : 0xffa31a });
      z.mover.dropping = false; z.mover.pos.set(sp.x, g.world.groundAt(sp.x, sp.z, 20), sp.z);
      z.yaw = Math.random() * 6.28;
      z.brain = new BR.ZombieBrain(z, g);
      g.scene.add(z.mesh); g.actors.push(z); this.zombies.push(z); g.highlightActor(z);
      if (z.riseT > 0) g.fx.burst(z.pos.clone().setY(z.pos.y + 0.2), [0x3a2a1e, 0x5a4a3a, 0x241a12], 10, 3, 0.1, 0.8, 9);   // dirt bursting up
      return z;
    }
    spawnBoss() {
      const g = this.g, type = BOSS_ORDER[(this.round / ZC.bossEvery - 1) % BOSS_ORDER.length];
      const b = this.boss = new BR.ZBoss(g, this, type, this.round);
      const p = g.player.pos, cands = (g.world.zmSpawns || []).filter(s => !this.unlocked || this.unlocked.has(s.zone || 'graveyard')).sort((a, c) => Math.hypot(c.x - p.x, c.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z)), sp = cands[0] || { x: 0, z: -30 };
      b.mover.dropping = false; b.mover.pos.set(sp.x, g.world.groundAt(sp.x, sp.z, 20), sp.z);
      g.scene.add(b.mesh); g.actors.push(b); this.zombies.push(b); g.highlightActor(b);
      g.fx.burst(b.pos.clone().setY(b.pos.y + 1), [b.D.color, 0xffffff, 0x2a1a10], 70, 10, 0.14, 1.4, 6);
      this.shockRing(b.pos.clone(), 10, 0, b.D.color, true);
      g.cam.shake = Math.max(g.cam.shake, 0.5); this.lightning(1);
      g.hud.zmBanner(b.D.name, b.D.sub, 'boss'); g.hud.zmBoss(b.D.name, 1, b.D.color);
      BR.Audio.zRoar && BR.Audio.zRoar();
    }

    nextRound() {
      const g = this.g;
      this.round++; this.powersRound = 0;
      const st = roundStats(this.round);
      this.toSpawn = st.count; this.spawnT = 1; this.phase = 'fight';
      if (this.round % ZC.bossEvery === 0) { this.toSpawn = Math.round(st.count * 0.4); this.bossPending = 2.2; }
      g.hud.zmRound(this.round);
      if (!this.bossPending) g.hud.zmBanner('ROUND ' + this.round, this.round === 1 ? "They're coming. Survive." : this.round % ZC.bossEvery === ZC.bossEvery - 1 ? 'Something big is coming next round…' : '', 'round');
      BR.Audio.zRound && BR.Audio.zRound(true);
    }

    // ---- per frame -------------------------------------------------------------
    update(dt) {
      const g = this.g, p = g.player;
      if (this.net && !this.net.host) return this.net.clientUpdate(dt);       // v1.29 online: a guest's frame (the host runs the zombies)
      this.tAll = (this.tAll || 0) + dt;
      this.ambience(dt);
      if (!p.alive && !this.net) { if (g.state === 'playing') this.gameOver(); return; }
      // regen + slow from boss screams
      if (p.alive && g.time - p.lastHurtT > ZC.regenDelay && p.health < BR.CONFIG.actor.maxHealth) p.health = Math.min(BR.CONFIG.actor.maxHealth, p.health + ZC.regenRate * dt);
      if (p.zSlowT > 0) p.zSlowT -= dt;
      // rounds
      if (this.phase === 'break') { this.breakT -= dt; if (this.breakT <= 0) this.nextRound(); }
      else {
        if (this.bossPending > 0) { this.bossPending -= dt; if (this.bossPending <= 0) { this.bossPending = 0; this.spawnBoss(); } }
        const alive = this.zombies.filter(z => z.alive && !z.boss).length;
        this.spawnT -= dt;
        if (this.toSpawn > 0 && this.spawnT <= 0 && alive < ZC.maxAlive) { this.spawnT = roundStats(this.round).spawnGap * (0.6 + Math.random() * 0.8); this.toSpawn--; this.spawnZombie(); }
        if (this.toSpawn <= 0 && !this.bossPending && !this.zombies.some(z => z.alive)) {
          this.phase = 'break'; this.breakT = 7; BR.Audio.zRound && BR.Audio.zRound(false);
          g.hud.zmBanner('ROUND ' + this.round + ' SURVIVED', 'Next round in a few seconds', 'done');
          g.hud.zmBoss(null);
        }
      }
      if (this.boss) { if (this.boss.alive) g.hud.zmBoss(this.boss.D.name, this.boss.health / this.boss.maxHp, this.boss.D.color); }
      // tidy up the dead
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i]; if (z.alive) continue;
        const age = g.time - z.deathT;
        if (z.mesh && age > 1.2) z.mesh.position.y = z.mover.pos.y - (age - 1.2) * 0.8;
        if (age > 3) { if (z.mesh && z.mesh.parent) g.scene.remove(z.mesh); this.zombies.splice(i, 1); const k = g.actors.indexOf(z); if (k >= 0) g.actors.splice(k, 1); }
      }
      if (this.insta > 0) this.insta -= dt;
      if (this.double > 0) this.double -= dt;
      g.hud.zmTimers(this.insta, this.double);
      this.updateProjectiles(dt); this.updateHazards(dt); this.updatePowers(dt); this.updateBuys();
    }

    ambience(dt) {
      const t = this.tAll || 0;
      for (const f of this.flicker || []) { const k = 0.75 + 0.25 * Math.sin(t * 13 + f.id) * Math.sin(t * 5.7 + f.id * 2); if (f.isLight) f.intensity = 1.4 * k; else f.material.opacity = 0.55 * k; }
      for (const m of this.mist || []) { m.m.position.x += m.v * dt; if (Math.abs(m.m.position.x) > 40) m.v = -m.v; m.m.material.opacity = 0.18 + 0.06 * Math.sin(t * 0.3 + m.m.position.z); }
      for (const b of this.bats || []) { b.a += dt * b.s; b.b.position.set(9 + Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 2) * 1.5, -29 + Math.sin(b.a) * b.r); b.b.rotation.y = -b.a; const fl = Math.sin(t * 18 + b.r) * 0.9; b.wl.rotation.z = fl; b.wr.rotation.z = -fl; }
      // occasional lightning: a flash of the sky + fog and a rumble
      this.nextBolt = (this.nextBolt ?? 12) - dt; if (this.nextBolt <= 0) { this.nextBolt = 14 + Math.random() * 20; this.lightning(0.7); }
      if (this.light > 0) { this.light = Math.max(0, this.light - dt * 3); const s = this.g.scene; s.fog.color.setHex(0x1a1028).lerp(new THREE.Color(0x8a80b0), this.light); s.background.copy(s.fog.color); }
    }
    lightning(k) { this.light = k; this.g.hud.zmLightning && this.g.hud.zmLightning(); setTimeout(() => BR.Audio.zThunder && BR.Audio.zThunder(), 250); }

    // ---- combat hooks ------------------------------------------------------------
    damageMult(victim) { return this.insta > 0 && victim.zombie && !victim.boss ? 1e6 : 1; }
    onHit(victim, dmg, head) { if (victim.zombie) this.addPoints(ZC.hitPts, victim); }
    onKill(victim, killer, weaponId, head) {
      const g = this.g;
      if (victim.isPlayer) { if (this.net) this.net.localDied(); else this.gameOver(); return; }     // v1.29 online: you're down until the next round
      if (!victim.zombie) return;
      if (killer && killer.isPlayer) {
        this.kills++;
        const melee = BR.CONFIG.weapons[weaponId] && BR.CONFIG.weapons[weaponId].melee;
        this.addPoints(victim.boss ? 2000 : melee ? ZC.knifePts : head ? ZC.headPts : ZC.killPts, victim);
        BR.Audio.kill(head, 1);
        if (head) g.hud.hitmarker(true, true);
      }
      g.fx.burst(victim.pos.clone().setY(victim.pos.y + 1.1), [0x5a0808, 0x8a1010, 0x3a2a1e], victim.boss ? 60 : 12, victim.boss ? 9 : 4, 0.08, 0.8, 9);
      if (victim.boss) {
        const b = victim, pos = b.pos.clone(); this.boss = null; this.bossKills++;
        g.fx.killBurst(pos, true, 4, false); this.shockRing(pos.clone(), 14, 0, b.D.color, true);
        g.fx.burst(pos.clone().setY(pos.y + 2), [b.D.color, 0xffffff, 0xffd24a], 90, 14, 0.14, 1.6, 4);
        g.cam.shake = Math.max(g.cam.shake, 0.6); this.lightning(1);
        g.hud.zmBanner(b.D.name + ' SLAIN', '+2000 points', 'slain'); g.hud.zmBoss(null);
        if (b.mesh && b.mesh.parent) setTimeout(() => { if (b.mesh.parent) g.scene.remove(b.mesh); }, 600);
        this.dropPower(pos.clone().add(new THREE.Vector3(1, 0, 0)), 'maxammo'); this.dropPower(pos.clone().add(new THREE.Vector3(-1, 0, 0)), Math.random() < 0.5 ? 'double' : 'instakill');
      } else if (this.powersRound < ZC.maxPowers && Math.random() < ZC.powerChance) { this.powersRound++; this.dropPower(victim.pos.clone()); }
    }
    addPoints(n, at) { n *= this.double > 0 ? 2 : 1; this.points += n; this.g.hud.zmPoints(this.points, n); }

    gameOver() {
      const g = this.g, p = g.player;
      if (g.state !== 'playing') return;
      g.state = 'dead'; g.endT = 3.2; g.deathPos = p.pos.clone();
      g.hud.zmBoss(null);
      g.result = { zombies: true, win: false, round: this.round, kills: this.kills, points: this.points, bosses: this.bossKills, damage: p.damageDealt, time: g.time, total: 1, place: 1, by: 'Overrun on round ' + this.round };
      g.hud.zmBanner('YOU DIED', 'You survived ' + Math.max(0, this.round - 1) + ' rounds', 'dead');
      BR.Audio.zRound && BR.Audio.zRound(false);
    }

    // ---- interact: wall buys -----------------------------------------------------------
    updateBuys() {
      const g = this.g, p = g.player; this.nearBuy = null;
      for (const b of this.buys || []) if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 2.3 && Math.abs(b.y - 1.7 - p.pos.y) < 2) { this.nearBuy = b; break; }
      if (this.nearBuy) { const b = this.nearBuy, have = p.hasWeapon(b.wid); g.hud.prompt(have ? `Ammo · ${Math.round(b.cost / 2)}` : `Buy ${b.name} · ${b.cost}`); }
      else g.hud.prompt(null);
    }
    interact() {
      const g = this.g, p = g.player, b = this.nearBuy; if (!b) return false;
      const have = p.hasWeapon(b.wid), cost = have ? Math.round(b.cost / 2) : b.cost, def = BR.CONFIG.weapons[b.wid];
      if (this.points < cost) { g.hud.toast('Not enough points', 900); BR.Audio.click(); return true; }
      this.points -= cost; g.hud.zmPoints(this.points, -cost);
      if (have) { const w = p.slots.find(s => s && s.id === b.wid); if (w) w.mag = def.mag; p.ammo[def.ammo] = BR.CONFIG.ammoCap[def.ammo]; }
      else { const i = p.giveWeapon(b.wid, def.mag); if (i < 0) { const c = p.cur === 2 ? 0 : p.cur; p.slots[c] = BR.Weapons.create(b.wid, def.mag); p.switchTo(c); } p.ammo[def.ammo] = BR.CONFIG.ammoCap[def.ammo]; }
      BR.Audio.zBuy && BR.Audio.zBuy(); g.hud.toast(have ? 'Ammo refilled' : def.name + ' bought', 1000);
      return true;
    }

    // ---- power-ups ------------------------------------------------------------------
    dropPower(pos, type) {
      const T = ['maxammo', 'instakill', 'double', 'nuke'], tp = type || T[Math.floor(Math.random() * T.length)];
      const LAB = { maxammo: ['MAX AMMO', '#7dff6a'], instakill: ['INSTA-KILL', '#ff4a4a'], double: ['DOUBLE POINTS', '#ffd24a'], nuke: ['NUKE', '#ff9a1a'] }[tp];
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
      c.shadowColor = LAB[1]; c.shadowBlur = 20; c.fillStyle = LAB[1]; c.beginPath(); c.arc(128, 110, 70, 0, 7); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1;
      c.lineWidth = 8; c.strokeStyle = LAB[1]; c.stroke(); c.font = '800 30px Outfit, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(LAB[0], 128, 230);
      c.font = '900 64px Outfit, sans-serif'; c.fillStyle = LAB[1]; c.fillText({ maxammo: '▮▮', instakill: '☠', double: '×2', nuke: '☢' }[tp], 128, 132);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })); s.scale.setScalar(1.6);
      const glow = sprite(new THREE.Color(LAB[1]).getHex(), 3); glow.material.opacity = 0.5;
      const grp = new THREE.Group(); grp.add(glow, s); grp.position.set(pos.x, this.g.world.groundAt(pos.x, pos.z, pos.y + 2) + 1.1, pos.z); this.g.scene.add(grp);
      this.powers.push({ tp, grp, s, glow, t: 0, label: LAB[0], col: LAB[1] });
    }
    updatePowers(dt) {
      const g = this.g, p = g.player;
      for (let i = this.powers.length - 1; i >= 0; i--) {
        const P = this.powers[i]; P.t += dt;
        P.grp.position.y += Math.sin(P.t * 3) * 0.004; P.glow.material.opacity = 0.35 + 0.2 * Math.sin(P.t * 5);
        P.s.visible = P.t < 20 || Math.floor(P.t * 6) % 2 === 0;
        const d = Math.hypot(P.grp.position.x - p.pos.x, P.grp.position.z - p.pos.z);
        if (d < 1.7 || P.t > 26) {
          if (d < 1.7) this.applyPower(P);
          g.scene.remove(P.grp); this.powers.splice(i, 1);
        }
      }
    }
    applyPower(P) {
      const g = this.g, p = g.player;
      g.hud.zmBanner(P.label, '', 'power', P.col); BR.Audio.zPower && BR.Audio.zPower();
      g.fx.burst(P.grp.position.clone(), [new THREE.Color(P.col).getHex(), 0xffffff], 30, 6, 0.08, 0.8, 2);
      if (P.tp === 'maxammo') { for (const w of p.slots) if (w && !w.def.melee) { w.mag = w.def.mag; p.ammo[w.def.ammo] = BR.CONFIG.ammoCap[w.def.ammo]; } }
      else if (P.tp === 'instakill') this.insta = 25;
      else if (P.tp === 'double') this.double = 25;
      else if (P.tp === 'nuke') {
        g.hud.zmNuke && g.hud.zmNuke(); g.cam.shake = Math.max(g.cam.shake, 0.4);
        for (const z of this.zombies.slice()) if (z.alive && !z.boss) { g.kill(z, null, 'nuke', false); }
        this.addPoints(400);
      }
    }

    // ---- boss toolkit: projectiles, telegraphs, rings, spikes, gas, crows -------------------------
    lead(t) { const p = this.g.player; return p.pos.clone().addScaledVector(p.mover.vel, t || 0); }
    projectile(o) {
      const s = sprite(o.color, o.size || 0.8); s.position.copy(o.pos); this.g.scene.add(s);
      const core = sprite(0xffffff, (o.size || 0.8) * 0.4); s.add(core);
      this.proj.push(Object.assign({ mesh: s, t: 0, life: o.life || 4, hp: 1 }, o));
    }
    updateProjectiles(dt) {
      const g = this.g, p = g.player, W = g.world, eye = p.pos.clone().setY(p.pos.y + 1.2);
      for (let i = this.proj.length - 1; i >= 0; i--) {
        const P = this.proj[i]; P.t += dt;
        if (P.homing) { const want = eye.clone().sub(P.pos).normalize().multiplyScalar(P.speed || 7); P.vel.lerp(want, Math.min(1, P.homing * dt)); }
        const prev = this._pp || (this._pp = new THREE.Vector3()); prev.copy(P.pos);
        P.vel.y -= (P.grav || 0) * dt; P.pos.addScaledVector(P.vel, dt); P.mesh.position.copy(P.pos);
        if (P.trail && Math.random() < 0.7) g.fx.burst(P.pos, P.trail, 1, 0.6, 0.07, 0.4, -1);
        if (P.spin) P.mesh.material.rotation += dt * 9;
        let boom = P.t > P.life;
        if (!boom && P.pos.distanceTo(eye) < (P.r || 0.4) + 0.5) { g.applyDamage(p, this.boss || null, P.dmg, false, { x: P.pos.x, y: P.pos.y, z: P.pos.z }, 'boss'); boom = true; }
        if (!boom && P.pos.y <= W.groundAt(P.pos.x, P.pos.z, P.pos.y + 1)) boom = true;
        if (!boom) { const sx = P.pos.x - prev.x, sy = P.pos.y - prev.y, sz = P.pos.z - prev.z, sl = Math.hypot(sx, sy, sz); if (sl > 1e-4 && W.raycast(prev.x, prev.y, prev.z, sx / sl, sy / sl, sz / sl, sl).t < sl) boom = true; }
        if (boom) { this.explode(P); g.scene.remove(P.mesh); this.proj.splice(i, 1); }
      }
    }
    // shootable projectiles (spirit orbs) and crows: a hitscan from the player knocks them out
    shotAt(o, d, maxDist) {
      for (let i = this.proj.length - 1; i >= 0; i--) { const P = this.proj[i]; if (!P.shootable) continue; const t = U.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, P.pos.x, P.pos.y, P.pos.z, 0.6, maxDist);
        if (t < maxDist) { this.g.fx.burst(P.pos, [P.color, 0xffffff], 14, 4, 0.07, 0.5, 0); this.g.scene.remove(P.mesh); this.proj.splice(i, 1); this.addPoints(10); } }
      for (const c of this.haz) if (c.type === 'crow' && !c.dead) { const t = U.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, c.pos.x, c.pos.y, c.pos.z, 0.55, maxDist); if (t < maxDist) { c.dead = true; this.g.fx.burst(c.pos, [0x101010, 0x5a0a0a], 12, 4, 0.06, 0.6, 9); this.addPoints(10); } }
    }
    explode(P) {
      const g = this.g, E = P.explode; if (!E) { g.fx.burst(P.pos, [P.color, 0xffffff], 16, 4, 0.08, 0.5, 2); return; }
      g.fx.burst(P.pos, E.colors, 30, 7, 0.1, 0.9, 4);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 32), addMat(E.colors[0])); ring.position.copy(P.pos).setY(P.pos.y + 0.08); ring.rotation.x = -Math.PI / 2; g.scene.add(ring);
      this.haz.push({ type: 'fx', mesh: ring, t: 0, life: 0.5, upd: (h, k) => { h.mesh.scale.setScalar(1 + k * E.r * 2.4); h.mesh.material.opacity = 1 - k; } });
      const p = g.player; if (p.pos.distanceTo(P.pos) < E.r) g.applyDamage(p, this.boss || null, E.dmg, false, { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, 'boss');
      if (E.fire) this.fireZone(P.pos.clone(), 2.2, E.fire);
      if (E.gas) this.gasCloud(P.pos.clone(), E.r + 0.5, E.gas);
      BR.Audio.zBoom && BR.Audio.zBoom(p.pos.distanceTo(P.pos));
    }
    telegraph(pos, r, col, dur) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.94, r, 48), addMat(col)); m.position.copy(pos).setY(this.g.world.groundAt(pos.x, pos.z, pos.y + 1) + 0.06); m.rotation.x = -Math.PI / 2; this.g.scene.add(m);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 48), addMat(col)); fill.position.copy(m.position); fill.rotation.x = -Math.PI / 2; this.g.scene.add(fill);
      this.haz.push({ type: 'fx', mesh: m, extra: fill, t: 0, life: dur, upd: (h, k) => { h.mesh.material.opacity = 0.5 + 0.5 * Math.sin(k * 30); h.extra.scale.setScalar(Math.max(0.01, k)); h.extra.material.opacity = 0.25; } });
    }
    lane(pos, dir, len, col, dur) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, len), addMat(col)); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-dir.x, -dir.z);
      m.position.copy(pos).addScaledVector(dir, len / 2).setY(this.g.world.groundAt(pos.x, pos.z, pos.y + 1) + 0.07); this.g.scene.add(m);
      this.haz.push({ type: 'fx', mesh: m, t: 0, life: dur + 0.3, upd: (h, k) => { h.mesh.material.opacity = 0.25 + 0.3 * Math.sin(k * 25); } });
    }
    shockRing(pos, r, dmg, col, visualOnly) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.75, 48), addMat(col)); m.position.copy(pos).setY(pos.y + 0.1); m.rotation.x = -Math.PI / 2; this.g.scene.add(m);
      this.haz.push({ type: 'ring', mesh: m, pos: pos.clone(), r, dmg: visualOnly ? 0 : dmg, t: 0, life: 0.7, hit: false });
    }
    spikeAt(pos, delay) {
      pos.y = this.g.world.groundAt(pos.x, pos.z, pos.y + 2);
      this.telegraph(pos, 1.3, 0xff2a2a, delay);
      this.haz.push({ type: 'spike', pos, t: 0, delay, life: delay + 0.9, fired: false });
    }
    gasCloud(pos, r, dur) {
      const grp = new THREE.Group(); grp.position.copy(pos); this.g.scene.add(grp);
      const puffs = []; for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.Effects.tex().smoke, color: 0x6aff3a, transparent: true, opacity: 0.35, depthWrite: false })); s.scale.setScalar(r * 1.4); s.position.set((Math.random() - 0.5) * r, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * r); grp.add(s); puffs.push(s); }
      this.haz.push({ type: 'gas', mesh: grp, puffs, pos: pos.clone(), r, t: 0, life: dur, tick: 0 });
    }
    fireZone(pos, r, dur) {
      const grp = new THREE.Group(); grp.position.copy(pos); this.g.scene.add(grp);
      const f = sprite(0xff6a1a, r * 2.2); f.position.y = 0.4; f.material.opacity = 0.5; grp.add(f);
      this.haz.push({ type: 'fire', mesh: grp, glow: f, pos: pos.clone(), r, t: 0, life: dur, tick: 0 });
    }
    crow(from, i) {
      const g = this.g, grp = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.DoubleSide });
      const wl = mesh(new THREE.PlaneGeometry(0.45, 0.16), m, -0.22, 0, 0), wr = mesh(new THREE.PlaneGeometry(0.45, 0.16), m, 0.22, 0, 0);
      grp.add(wl, wr, mesh(new THREE.ConeGeometry(0.07, 0.3, 5), m)); const e = sprite(0xff2a2a, 0.12); e.position.set(0, 0.05, -0.12); grp.add(e);
      grp.position.copy(from); g.scene.add(grp);
      this.haz.push({ type: 'crow', mesh: grp, wl, wr, pos: grp.position, t: 0, life: 9, a: i / 9 * 6.28, dive: 1.6 + i * 0.45, vel: new THREE.Vector3() });
    }
    updateHazards(dt) {
      const g = this.g, p = g.player;
      for (let i = this.haz.length - 1; i >= 0; i--) {
        const h = this.haz[i]; h.t += dt; const k = Math.min(1, h.t / h.life);
        if (h.type === 'fx') h.upd(h, k);
        else if (h.type === 'ring') {
          const rr = 0.6 + k * h.r; h.mesh.scale.setScalar(rr / 0.6); h.mesh.material.opacity = 1 - k;
          if (h.dmg && !h.hit) { const d = Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z); if (Math.abs(d - rr) < 0.9 && p.mover.onGround && Math.abs(p.pos.y - h.pos.y) < 1.2) { h.hit = true; g.applyDamage(p, this.boss || null, h.dmg, false, { x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z }, 'boss'); p.mover.vel.y = 6; p.mover.onGround = false; } }
        } else if (h.type === 'spike' && !h.fired && h.t >= h.delay) {
          h.fired = true; const S = new THREE.Group(); S.position.copy(h.pos); g.scene.add(S); const bone = lam(0xd8d0b8);
          for (let j = 0; j < 6; j++) { const c = mesh(new THREE.ConeGeometry(0.14, 1.6, 5), bone, (Math.random() - 0.5) * 1.4, 0.8, (Math.random() - 0.5) * 1.4); c.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5); S.add(c); }
          h.mesh = S; g.fx.burst(h.pos, [0xd8d0b8, 0x6a5a48, 0xff2a2a], 18, 6, 0.1, 0.7, 9);
          if (Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z) < 1.4 && p.pos.y - h.pos.y < 1.6) { g.applyDamage(p, this.boss || null, 30, false, { x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z }, 'boss'); p.mover.vel.y = 8; p.mover.onGround = false; }
        } else if (h.type === 'spike' && h.mesh) { h.mesh.scale.y = Math.max(0.01, 1 - Math.max(0, h.t - h.delay - 0.5) / 0.4); }
        else if (h.type === 'gas' || h.type === 'fire') {
          if (h.type === 'gas') h.puffs.forEach((s, j) => { s.material.opacity = 0.32 * (1 - Math.max(0, k - 0.8) / 0.2); s.material.rotation += dt * (j % 2 ? 0.4 : -0.4); });
          else h.glow.material.opacity = (0.4 + 0.2 * Math.sin(h.t * 20)) * (1 - k), Math.random() < 0.6 && g.fx.burst(h.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * h.r * 1.5, 0.1, (Math.random() - 0.5) * h.r * 1.5)), [0xff7a1a, 0xffd24a], 1, 1.5, 0.08, 0.5, -3);
          h.tick -= dt; if (h.tick <= 0 && Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z) < h.r && Math.abs(p.pos.y - h.pos.y) < 2) { h.tick = 0.5; g.applyDamage(p, this.boss || null, h.type === 'gas' ? 5 : 5, false, { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, 'boss'); }
        } else if (h.type === 'crow' && !h.dead) {
          const fl = Math.sin(h.t * 22) * 0.9; h.wl.rotation.z = fl; h.wr.rotation.z = -fl;
          const eye = p.pos.clone().setY(p.pos.y + 1.4);
          if (h.t < h.dive) { h.a += dt * 2.2; const want = eye.clone().add(new THREE.Vector3(Math.cos(h.a) * 4, 2 + Math.sin(h.t * 2) * 0.6, Math.sin(h.a) * 4)); h.pos.lerp(want, Math.min(1, dt * 3)); }
          else { const dir = eye.clone().sub(h.pos); const d = dir.length(); h.vel.lerp(dir.normalize().multiplyScalar(14), Math.min(1, dt * 4)); h.pos.addScaledVector(h.vel, dt);
            if (d < 0.8) { h.dead = true; g.applyDamage(p, this.boss || null, 8, false, { x: h.pos.x, y: h.pos.y, z: h.pos.z }, 'boss'); g.fx.burst(h.pos, [0x101010, 0x5a0a0a], 10, 3, 0.06, 0.5, 9); } }
          h.mesh.lookAt(eye);
        }
        if (h.t >= h.life || (h.type === 'crow' && h.dead)) { if (h.mesh) g.scene.remove(h.mesh); if (h.extra) g.scene.remove(h.extra); this.haz.splice(i, 1); }
      }
    }

    dispose() {
      const g = this.g;
      for (const P of this.proj) if (P.mesh) g.scene && g.scene.remove(P.mesh);
      g.hud.zmShow(false); g.hud.zmBoss(null);
      this.proj = []; this.haz = []; this.powers = [];
    }
  };
})();

// =============================================================================
// ZOMBIES, part 2 — the story of Hollow Graves, quests + journal, boss intro cutscenes,
// zones + buyable doors (zombies path through open doors), the Mystery Box, Pack-a-Punch,
// and a zombies-left counter. Extends BR.ZombieMode / BR.ZombieBrain / the bosses above.
// =============================================================================
(function () {
  const U = BR.util, ZC = BR.ZOMBIE_CFG, BOSSES = BR.ZOMBIE_BOSSES;
  const addMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const sprite = (c, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: BR.Effects.tex().dot, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.setScalar(s); return m; };
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const mesh = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x || 0, y || 0, z || 0); return o; };

  // ---------------------------------------------------------------- the story
  // Ravenhold, 1893: a wedding, a funeral and a ritual on the night of the harvest moon.
  BR.ZOMBIE_STORY = {
    prologue: { title: 'Hollow Graves, 1893', text: 'The night the harvest moon bled, the village of Hollow Graves held a wedding, a funeral and a ritual. By dawn, only the dead came home. Survive the night. Learn what happened. End it.' },
    bosses: {
      pumpkin: { name: 'SILAS HALE', title: 'THE PUMPKIN KING', line: 'The groundskeeper kept his promise. He will never dig another grave. He will fill them.' },
      banshee: { name: 'ELINOR RAVENHOLD', title: 'THE WEEPING BRIDE', line: 'She rang the bell for her wedding. You answered.' },
      colossus: { name: 'THE OSSUARY', title: 'THE BONE COLOSSUS', line: 'Forty years of graves, stitched into one. It only remembers the shovel.' },
      plague: { name: 'DR. CORVIN VALE', title: 'THE PLAGUE DOCTOR', line: 'Death is a disease. He found the cure. You are the side effect.' },
    },
    lore: [
      { title: 'The Doctor\'s Journal', text: 'Dr. Corvin Vale: "Death is only a disease, and every disease has a cure. Lord Ravenhold has given me his crypts, his daughter\'s dowry and his groundskeeper. I need nothing more than a harvest moon."' },
      { title: 'The Groundskeeper', text: 'Silas Hale dug every grave in Hollow Graves for forty years. Vale promised he would never have to dig another. He kept that promise: Silas became the Pumpkin King, keeper of a harvest of the dead.' },
      { title: 'The Lantern Head', text: 'The flame in the Pumpkin King\'s head is Silas\' last breath. Vale carved the lantern and sealed it in, so the harvest would never be left untended.' },
      { title: 'The Wedding Bell', text: 'Elinor Ravenhold rang this bell to call her guests. The groom never came. Vale needed a healthy heart for his first patient. She still waits at the altar, and she still weeps.' },
      { title: 'The Witch of the Wood', text: 'Morwen of the wood warned the village about the doctor. Vale burned her hut and stole her cauldron\'s recipe: the Bone Draught, which knits the dead together into one.' },
      { title: 'The Ossuary', text: 'The Bone Colossus is every grave Silas ever filled, poured through Morwen\'s draught and stood up on its own. It has a thousand names and remembers none of them.' },
      { title: 'Lord Ravenhold\'s Machine', text: 'Ravenhold sealed his manor and built a machine under the great hall to undo Vale\'s work, fed by moonlight. He called it the Pack-a-Punch. It was never finished. Until you.' },
      { title: 'The Cure', text: 'Vale wears the beaked mask to breathe his own cure. The crows are his nurses. Put the doctor down and the harvest moon will set... but every cure has a relapse.' },
    ],
  };
  const STORY = BR.ZOMBIE_STORY;
  for (const k in STORY.bosses) { BOSSES[k].name = STORY.bosses[k].title; BOSSES[k].sub = STORY.bosses[k].name; }

  // per-boss cinematic intros: camera path + their own effects while they arrive
  const INTRO = {
    pumpkin: { cam: (t) => ({ ang: 0.4 + t * 0.12, r: 9 - t * 0.6, h: 0.8 + t * 0.15, look: 3 }), fx(Z, b, t, dt) { if (Math.random() < dt * 30) Z.g.fx.burst(b.pos.clone().setY(b.pos.y + Math.random() * 2), [0xff7a1a, 0xffd24a, 0xff3a00], 3, 4, 0.12, 0.9, -2); } },
    banshee: { cam: (t) => ({ ang: t * 0.6, r: 8, h: 2 + Math.sin(t) * 0.5, look: 3 }), fx(Z, b, t, dt) { b.mover.pos.y = Z.g.world.groundAt(b.pos.x, b.pos.z, 20) + Math.max(0, 8 - t * 3); if (Math.random() < dt * 25) Z.g.fx.burst(b.pos.clone().setY(b.pos.y + 2), [0x9fe8ff, 0xffffff], 3, 3, 0.08, 1.2, -1); } },
    colossus: { cam: (t) => ({ ang: -0.3, r: 12 - t * 1.0, h: 1.2, look: 3.8, shake: t > 1 && t < 3 ? 0.15 : 0 }), fx(Z, b, t, dt) { if (Math.random() < dt * 20) Z.g.fx.burst(b.pos.clone(), [0xd8d0b8, 0x6a5a48, 0x2a1a10], 4, 7, 0.14, 1.0, 9); } },
    plague: { cam: (t) => ({ ang: 1.2 - t * 0.25, r: 7, h: 2.2, look: 2.6 }), fx(Z, b, t, dt) { if (t < 2.4 && Math.random() < dt * 30) { const a = Math.random() * 6.28, r = 6 - t * 2.2; Z.g.fx.burst(b.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 2 + Math.random() * 2, Math.sin(a) * r)), [0x101010, 0x7dff3a], 2, 1, 0.1, 0.5, 0); } } },
  };

  // ---------------------------------------------------------------- zones + navigation
  const zoneAt = (x, z) => x > 42.6 ? 'patch' : x < -42.6 ? 'wood' : z < -42.6 ? 'manor' : 'graveyard';
  BR.zombieZoneAt = zoneAt;
  const baseBrainUpdate = BR.ZombieBrain.prototype.update;
  BR.ZombieBrain.baseUpdate = baseBrainUpdate;             // zmnav.js steers with a flow field instead of door waypoints
  BR.ZombieBrain.prototype.update = function (dt) {
    // across zones: walk to the door between this zone and the graveyard hub, then on to you
    const z = this.z, p = this.g.player, zm = this.g.zm;
    if (zm && zm.doors && p) {
      const za = zoneAt(z.pos.x, z.pos.z), zp = zoneAt(p.pos.x, p.pos.z);
      if (za !== zp) {
        const d = zm.doors.find(o => o.open && o.to === (za !== 'graveyard' ? za : zp));
        if (d) { this.goal = this._gv || (this._gv = new THREE.Vector3()); this.goal.set(d.cx, p.pos.y, d.cz);
          const r = baseBrainUpdate.call(this, dt); this.goal = null; return r; }
      }
    }
    return baseBrainUpdate.call(this, dt);
  };

  // ---------------------------------------------------------------- quests
  const QUESTS = [
    { id: 'pages', title: 'Lost Journal', desc: 'Find 3 pages of the doctor\'s journal', goal: 3 },
    { id: 'candles', title: 'Ritual Candles', desc: 'Light the 4 ritual candles at the graveyard corners', goal: 4 },
    { id: 'headshots', title: 'The Lantern\'s Flame', desc: 'Kill 15 zombies with headshots', goal: 15 },
    { id: 'bell', title: 'The Wedding Bell', desc: 'Climb the bell tower and ring the bell', goal: 1 },
    { id: 'cauldron', title: 'Bone Draught', desc: 'Kill 12 zombies near the witch\'s cauldron (or in the chapel if the wood is locked)', goal: 12 },
    { id: 'stones', title: 'The Ossuary Circle', desc: 'Survive 40 s inside the standing stones (or at the chapel altar)', goal: 40 },
    { id: 'knife', title: 'Gravedigger\'s Work', desc: 'Get 10 knife kills', goal: 10 },
    { id: 'pap', title: 'Ravenhold\'s Machine', desc: 'Pack-a-Punch a weapon', goal: 1 },
  ];
  BR.ZOMBIE_QUESTS = QUESTS;

  const ZM = BR.ZombieMode.prototype;
  const baseStart = ZM.start, baseUpdate = ZM.update, baseOnKill = ZM.onKill, baseNext = ZM.nextRound, baseDecorate = ZM.decorate;
  ZM._spawnZombieBase = ZM.spawnZombie; ZM._spawnBossBase = ZM.spawnBoss;

  Object.assign(ZM, {
    start() {
      this.unlocked = new Set(['graveyard']); this.journal = [STORY.prologue]; this.questN = 0; this.quest = null; this.papCount = 0;
      baseStart.call(this);
      this.buildDoors(); this.buildBox(); this.buildPap();
      this.g.hud.zmLore(STORY.prologue.title, STORY.prologue.text);
      this.g.hud.zmJournal(this.journal);
    },
    decorate() {
      baseDecorate.call(this);
      const W = this.g.world, deco = this.deco, R = Math.random;
      // Pumpkin Patch: rows of jack-o'-lanterns + scarecrows
      const pumpMat = new THREE.MeshPhongMaterial({ color: 0xff7a1a, emissive: 0x3a1400, shininess: 25 });
      const pg = new THREE.SphereGeometry(0.3, 10, 8);
      for (let x = 50; x < 96; x += 3.2) for (let z = 4; z < 30; z += 2.6) if (R() < 0.45) { const p = mesh(pg, pumpMat, x + (R() - 0.5), 0.2, z + (R() - 0.5)); p.scale.set(1 + R() * 0.5, 0.75, 1 + R() * 0.5); deco.add(p); }
      for (const [x, z] of [[60, 12], [80, 26], [88, 6]]) { const s = new THREE.Group(); s.position.set(x, 0, z);
        s.add(mesh(new THREE.ConeGeometry(0.42, 1.0, 8, 1, true), lam(0x5a3a1a), 0, 1.5, 0)); s.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), pumpMat, 0, 2.3, 0));
        s.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 12), lam(0x8a7038), 0, 2.5, 0)); s.add(mesh(new THREE.ConeGeometry(0.18, 0.3, 10), lam(0x8a7038), 0, 2.66, 0));
        const gl = sprite(0xff8a1a, 0.6); gl.position.set(0, 2.3, -0.24); s.add(gl); deco.add(s); }
      // Witch's Wood: a thicket of dead trees (collision trunks) + the cauldron's green brew + stone-circle runes
      const bark = lam(0x1a1512);
      for (let i = 0; i < 26; i++) { const x = -96 + R() * 50, z = -30 + R() * 60; if (Math.hypot(x + 78, z) < 9 || Math.hypot(x + 62, z + 20) < 9 || Math.hypot(x + 62, z - 12) < 3 || (x > -50 && Math.abs(z) < 5)) continue;
        const h = 6 + R() * 6, t = new THREE.Group(); t.position.set(x, 0, z); t.add(mesh(new THREE.CylinderGeometry(0.14, 0.34, h, 6).translate(0, h / 2, 0), bark));
        for (let k = 0; k < 4; k++) { const b = mesh(new THREE.CylinderGeometry(0.03, 0.09, h * 0.4, 5).translate(0, h * 0.2, 0), bark, 0, h * (0.5 + k * 0.1), 0); b.rotation.set(0, k * 1.7, (R() - 0.5) * 2.2); t.add(b); }
        deco.add(t); W.addBox(x - 0.28, 0, z - 0.28, x + 0.28, h, z + 0.28, 0x1a1512, { hidden: true }); }
      const Q = W.zmQuest, cq = Q.cauldron;
      const caul = mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), lam(0x141418), cq.x, 1.0, cq.z); deco.add(caul);
      const brew = mesh(new THREE.CircleGeometry(0.85, 20), new THREE.MeshBasicMaterial({ color: 0x7dff3a }), cq.x, 1.45, cq.z); brew.rotation.x = -Math.PI / 2; deco.add(brew);
      const bg = sprite(0x7dff3a, 3); bg.position.set(cq.x, 1.8, cq.z); bg.material.opacity = 0.45; deco.add(bg); this.flicker.push(bg); this.brew = { x: cq.x, z: cq.z };
      // Ravenhold Manor: lit chandelier glow in the great hall and ghost-lights in the windows
      for (const [x, z] of [[0, -80], [-8, -84], [8, -84]]) { const c = sprite(0xffc46a, 3); c.position.set(x, 7.2, z); c.material.opacity = 0.5; deco.add(c); this.flicker.push(c); }
      const L = new THREE.PointLight(0xb26bff, 1.6, 22, 2); L.position.set(0, 4, -84); deco.add(L);
    },

    // ---- doors ------------------------------------------------------------------
    buildDoors() {
      const g = this.g, sc = g.scene;
      this.doors = (g.world.zmDoors || []).map(d => {
        const grp = new THREE.Group(); grp.position.set(d.cx, 0, d.cz); sc.add(grp);
        const alongX = d.x1 - d.x0 > d.z1 - d.z0, w = alongX ? d.x1 - d.x0 : d.z1 - d.z0;
        const plank = lam(0x4a3220), iron = lam(0x1c1b20), bars = new THREE.Group(); grp.add(bars);
        for (let i = 0; i < 6; i++) { const p = mesh(new THREE.BoxGeometry(alongX ? w : 0.25, 0.42, alongX ? 0.25 : w), plank, 0, 0.5 + i * 0.6, 0); p.rotation[alongX ? 'z' : 'x'] = (i % 2 ? 0.08 : -0.06); bars.add(p); }
        for (const s of [-1, 1]) bars.add(mesh(new THREE.BoxGeometry(alongX ? 0.2 : 0.3, 4, alongX ? 0.3 : 0.2), iron, alongX ? s * w * 0.35 : 0, 2, alongX ? 0 : s * w * 0.35));
        // price sign
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const c = cv.getContext('2d');
        c.fillStyle = '#1a0e08'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#ffb24a'; c.lineWidth = 4; c.strokeRect(4, 4, 248, 88);
        c.fillStyle = '#ffe2b0'; c.font = '700 26px Outfit, sans-serif'; c.textAlign = 'center'; c.fillText(d.name.toUpperCase(), 128, 40); c.fillStyle = '#ffb24a'; c.font = '900 30px Outfit, sans-serif'; c.fillText(d.cost + ' PTS', 128, 78);
        const sign = mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }), 0, 2.5, 0);
        if (!alongX) sign.rotation.y = Math.PI / 2; sign.position[alongX ? 'z' : 'x'] = 0.2; bars.add(sign);
        return Object.assign({}, d, { grp, bars, open: false, openT: 0 });
      });
    },
    openDoor(d) {
      const g = this.g; d.open = true; g.world.removeBox(d.box); this.unlocked.add(d.to);
      g.fx.burst(new THREE.Vector3(d.cx, 1.5, d.cz), [0x8a6a4a, 0x4a3220, 0xffd24a], 40, 7, 0.12, 1.0, 9);
      g.hud.zmBanner(d.name.toUpperCase(), 'Area opened', 'done'); BR.Audio.zDoor && BR.Audio.zDoor();
      if (this.quest) this.refreshQuestSpots();
    },

    // ---- the Mystery Box ---------------------------------------------------------
    buildBox() {
      const g = this.g, sc = g.scene, grp = new THREE.Group(); sc.add(grp);
      const wood = new THREE.MeshPhongMaterial({ color: 0x3a2414, shininess: 20 }), trim = new THREE.MeshPhongMaterial({ color: 0xc89b3c, specular: 0xffe2a0, shininess: 80 });
      grp.add(mesh(new THREE.BoxGeometry(2.0, 0.8, 0.9), wood, 0, 0.4, 0));
      for (const x of [-0.95, 0.95]) grp.add(mesh(new THREE.BoxGeometry(0.08, 0.82, 0.92), trim, x, 0.4, 0));
      const lid = new THREE.Group(); lid.position.set(0, 0.8, -0.45); grp.add(lid); lid.add(mesh(new THREE.BoxGeometry(2.0, 0.16, 0.9), wood, 0, 0.08, 0.45)); lid.add(mesh(new THREE.BoxGeometry(2.02, 0.04, 0.92), trim, 0, 0.17, 0.45));
      // question marks glowing on the sides
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); c.font = '900 52px Outfit, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#9fe8ff'; c.shadowColor = '#4fd0ff'; c.shadowBlur = 10; c.fillText('?', 32, 50);
      const qm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const z of [-0.46, 0.46]) { const q = mesh(new THREE.PlaneGeometry(0.5, 0.5), qm, 0, 0.42, z); if (z < 0) q.rotation.y = Math.PI; grp.add(q); }
      // the beam: a tall pillar of light seen from anywhere on the map
      const beam = mesh(new THREE.CylinderGeometry(0.32, 0.55, 140, 16, 1, true), addMat(0x3ab8ff), 0, 70, 0); beam.material.opacity = 0.2; grp.add(beam);
      const core = mesh(new THREE.CylinderGeometry(0.07, 0.12, 140, 10, 1, true), addMat(0xbff0ff), 0, 70, 0); core.material.opacity = 0.55; grp.add(core);
      const gl = sprite(0x7fd8ff, 4); gl.position.y = 1.2; gl.material.opacity = 0.5; grp.add(gl);
      const show = new THREE.Group(); show.position.y = 1.45; grp.add(show);
      this.box = { grp, lid, beam, core, show, state: 'idle', t: 0, uses: 0, spot: 0, wid: null };
      this.placeBox(0);
    },
    placeBox(i) {
      const spots = this.g.world.zmBoxSpots, s = spots[i]; const b = this.box; b.spot = i;
      b.grp.position.set(s.x, this.g.world.groundAt(s.x, s.z, 3), s.z); b.grp.rotation.y = s.yaw || 0; b.grp.visible = true;
      this.g.fx.burst(b.grp.position.clone().setY(b.grp.position.y + 1), [0x7fd8ff, 0xffffff], 40, 8, 0.1, 1, 0);
    },
    boxPool() { return ['smg', 'shotgun', 'rifle', 'holoar', 'dmr', 'lmg', 'sniper', 'hunter', 'revolver', 'pistol', 'lmg', 'shotgun', 'dmr', 'burst', 'riot', 'mpistol', 'burst', 'riot', 'pump', 'pump']; },
    updateBox(dt) {
      const b = this.box; if (!b) return; b.t += dt;
      b.beam.material.opacity = 0.16 + 0.06 * Math.sin(this.tAll * 2); b.beam.rotation.y += dt * 0.4;
      const openK = b.state === 'idle' ? 0 : 1; b.lid.rotation.x = U.lerp(b.lid.rotation.x, -1.6 * openK, Math.min(1, dt * 8));
      if (b.state === 'rolling') {
        b.swapT = (b.swapT || 0) - dt;
        if (b.swapT <= 0) { b.swapT = 0.06 + b.t * 0.06; const pool = this.boxPool(); this.showBoxGun(pool[Math.floor(Math.random() * pool.length)]); BR.Audio.click(); }
        b.show.position.y = 1.0 + Math.min(1, b.t / 1.2) * 0.8;
        if (b.t > 3.2) { // result
          b.uses++;
          if (b.uses >= 4 && Math.random() < 0.22 && this.g.world.zmBoxSpots.filter(s => this.unlocked.has(s.zone)).length > 1) { this.boxTeddy(); return; }
          const pool = this.boxPool().filter(w => !this.g.player.hasWeapon(w)); b.wid = pool[Math.floor(Math.random() * pool.length)] || 'smg';
          this.showBoxGun(b.wid); b.state = 'offer'; b.t = 0; BR.Audio.zBuy && BR.Audio.zBuy();
        }
      } else if (b.state === 'offer') { b.show.rotation.y += dt * 1.5; b.show.position.y = 1.8 - Math.min(1, b.t / 7) * 0.8; if (b.t > 7) this.boxClose(); }
      else if (b.state === 'teddy') {
        b.show.position.y = 1.8 + b.t * 0.5;
        if (b.t > 2.6) { // the box flies away to a new spot
          b.grp.position.y += dt * 30;
          if (b.t > 3.6) { const spots = this.g.world.zmBoxSpots, ok = spots.map((s, i) => i).filter(i => i !== b.spot && this.unlocked.has(spots[i].zone)); this.placeBox(ok[Math.floor(Math.random() * ok.length)]); this.boxClose(); b.uses = 0; }
        }
      }
    },
    showBoxGun(wid) { const b = this.box; while (b.show.children.length) b.show.remove(b.show.children[0]); const m = BR.Models.worldWeapon(wid); m.scale.setScalar(1.5); m.rotation.y = Math.PI / 2; b.show.add(m); },
    boxClose() { const b = this.box; b.state = 'idle'; b.t = 0; b.wid = null; while (b.show.children.length) b.show.remove(b.show.children[0]); },
    boxTeddy() {
      const b = this.box; b.state = 'teddy'; b.t = 0; while (b.show.children.length) b.show.remove(b.show.children[0]);
      const fur = lam(0x7a5a3a), t = new THREE.Group(); t.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), fur, 0, 0, 0)); t.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), fur, 0, 0.3, 0));
      for (const x of [-0.11, 0.11]) t.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), fur, x, 0.44, 0)); t.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), lam(0x1a0a0a), 0, 0.3, -0.15)); b.show.add(t);
      this.addPoints(950); this.g.hud.zmBanner('BYE BYE', 'The box is moving… follow the beam', 'done'); BR.Audio.zTeddy && BR.Audio.zTeddy();
    },

    // ---- Pack-a-Punch ------------------------------------------------------------
    buildPap() {
      const g = this.g, P = g.world.zmPap; if (!P) return;
      const grp = new THREE.Group(); grp.position.set(P.x, 0, P.z); g.scene.add(grp);
      const stone = new THREE.MeshPhongMaterial({ color: 0x2a2436, shininess: 40 }), brass = new THREE.MeshPhongMaterial({ color: 0xb08a3c, specular: 0xffe2a0, shininess: 90 });
      grp.add(mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.5, 8), stone, 0, 0.25, 0)); grp.add(mesh(new THREE.BoxGeometry(1.8, 1.6, 1.2), stone, 0, 1.3, 0));
      for (const x of [-1.05, 1.05]) grp.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.4, 8), brass, x, 1.7, 0));
      grp.add(mesh(new THREE.BoxGeometry(2.5, 0.3, 1.3), brass, 0, 3.3, 0));
      const core = mesh(new THREE.SphereGeometry(0.42, 18, 14), new THREE.MeshBasicMaterial({ color: 0xc06bff }), 0, 2.55, 0); grp.add(core);
      const rings = []; for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(0.7 + i * 0.16, 0.025, 6, 40), addMat(i === 1 ? 0x50f0dc : 0xc06bff), 0, 2.55, 0); grp.add(r); rings.push(r); }
      const glow = sprite(0xc06bff, 5); glow.position.y = 2.55; glow.material.opacity = 0.5; grp.add(glow);
      const slot = mesh(new THREE.BoxGeometry(1.2, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0x50f0dc }), 0, 1.5, -0.61); grp.add(slot);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d'); c.font = '900 34px Outfit, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#e9d5ff'; c.shadowColor = '#b26bff'; c.shadowBlur = 12; c.fillText('PACK-A-PUNCH', 128, 44);
      const sign = mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }), 0, 3.3, -0.66); sign.rotation.y = Math.PI; grp.add(sign);
      const show = new THREE.Group(); show.position.set(0, 1.9, -0.9); grp.add(show);
      this.pap = { grp, core, rings, glow, show, x: P.x, z: P.z - 1.4, busy: 0 };
    },
    updatePap(dt) {
      const P = this.pap; if (!P) return; const t = this.tAll;
      P.rings.forEach((r, i) => { r.rotation.set(t * (0.6 + i * 0.3), t * (0.9 - i * 0.2), i); });
      P.core.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); P.glow.material.opacity = 0.4 + 0.15 * Math.sin(t * 3) + (P.busy > 0 ? 0.4 : 0);
      if (P.busy > 0) { P.busy -= dt; P.show.rotation.y += dt * 6; if (Math.random() < dt * 30) this.g.fx.burst(P.grp.position.clone().setY(2.55), [0xc06bff, 0x50f0dc, 0xffffff], 2, 3, 0.08, 0.5, 0);
        if (P.busy <= 0) { while (P.show.children.length) P.show.remove(P.show.children[0]); } }
    },
    papWeapon(w) {
      const NAMES = { smg: 'Spectral Chopper', shotgun: 'Grave Digger', rifle: 'Reaper\'s Toll', holoar: 'Phantom Lance', dmr: 'Witch\'s Eye', lmg: 'Harvest Moon', sniper: 'Raven\'s Gaze', hunter: 'Bone Splitter', revolver: 'Hex Six', pistol: 'Lantern of Souls', burst: 'Triple Hex', riot: 'Coffin Drum', mpistol: 'Wasp Nest', pump: 'Undertaker' };
      const d = w.def;
      w.def = Object.assign({}, d, { name: NAMES[w.id] || d.name + ' Mk II', dmg: d.dmg * 2.2, mag: Math.round(d.mag * 1.5), reload: d.reload * 0.85, recoil: d.recoil * 0.8, pap: true, tier: 3 });
      w.mag = w.def.mag; this.g.player.ammo[d.ammo] = BR.CONFIG.ammoCap[d.ammo];
      this.papCount++;
    },

    // ---- interact: doors, wall buys, the box, Pack-a-Punch, quest objects ----------------
    updateBuys() {
      const g = this.g, p = g.player, near = (x, z, r, y) => Math.hypot(x - p.pos.x, z - p.pos.z) < r && (y === undefined || Math.abs(y - p.pos.y) < 2.5);
      this.near = null;
      for (const d of this.doors || []) if (!d.open && near(d.cx, d.cz, 3)) { this.near = { k: 'door', o: d, txt: `Open ${d.name} · ${d.cost}` }; break; }
      if (!this.near) for (const b of this.buys || []) if (near(b.x, b.z, 2.3, b.y - 1.7)) { const have = p.hasWeapon(b.wid); this.near = { k: 'buy', o: b, txt: have ? `Ammo · ${Math.round(b.cost / 2)}` : `Buy ${b.name} · ${b.cost}` }; break; }
      const B = this.box; if (!this.near && B && near(B.grp.position.x, B.grp.position.z, 2.6)) {
        if (B.state === 'idle') this.near = { k: 'box', txt: 'Mystery Box · 950' };
        else if (B.state === 'offer') this.near = { k: 'boxtake', txt: 'Take ' + BR.CONFIG.weapons[B.wid].name };
      }
      const P = this.pap; if (!this.near && P && near(P.x, P.z, 2.6)) { const w = p.weapon; this.near = { k: 'pap', txt: !w || w.def.melee ? 'Pack-a-Punch · hold a gun' : w.def.pap ? 'Already upgraded' : `Pack-a-Punch ${w.def.name} · 5000` }; }
      if (!this.near && this.quest && this.quest.spots) for (const s of this.quest.spots) if (!s.done && s.interact && near(s.x, s.z, 2.4, s.y)) { this.near = { k: 'quest', o: s, txt: s.interact }; break; }
      g.hud.prompt(this.near ? this.near.txt : null);
    },
    interact() {
      const g = this.g, p = g.player, N = this.near; if (!N) return false;
      const pay = c => { if (this.points < c) { g.hud.toast('Not enough points', 900); BR.Audio.click(); return false; } this.points -= c; g.hud.zmPoints(this.points, -c); return true; };
      if (N.k === 'door') { if (pay(N.o.cost)) this.openDoor(N.o); return true; }
      if (N.k === 'buy') {
        const b = N.o, have = p.hasWeapon(b.wid), cost = have ? Math.round(b.cost / 2) : b.cost, def = BR.CONFIG.weapons[b.wid];
        if (!pay(cost)) return true;
        if (have) { const w = p.slots.find(s => s && s.id === b.wid); if (w) w.mag = w.def.mag; p.ammo[def.ammo] = BR.CONFIG.ammoCap[def.ammo]; }
        else this.giveGun(b.wid);
        BR.Audio.zBuy && BR.Audio.zBuy(); g.hud.toast(have ? 'Ammo refilled' : def.name + ' bought', 1000); return true;
      }
      if (N.k === 'box') { if (pay(950)) { const B = this.box; B.state = 'rolling'; B.t = 0; B.swapT = 0; BR.Audio.zBox && BR.Audio.zBox(); } return true; }
      if (N.k === 'boxtake') { const B = this.box; this.giveGun(B.wid); g.hud.toast(BR.CONFIG.weapons[B.wid].name, 1000); this.boxClose(); BR.Audio.pickup(); return true; }
      if (N.k === 'pap') {
        const w = p.weapon; if (!w || w.def.melee || w.def.pap) return true;
        if (!pay(5000)) return true;
        const P = this.pap; P.busy = 2.4; while (P.show.children.length) P.show.remove(P.show.children[0]); const m = BR.Models.worldWeapon(w.id); m.scale.setScalar(1.4); P.show.add(m);
        this.papWeapon(w); g.vmr.lastWeapon = null;
        g.hud.zmBanner(w.def.name.toUpperCase(), 'Pack-a-Punched: double damage, bigger mag', 'power', '#c06bff'); BR.Audio.zPap && BR.Audio.zPap();
        this.questEvent('pap'); return true;
      }
      if (N.k === 'quest') { this.questSpot(N.o); return true; }
      return false;
    },
    giveGun(wid) {
      const p = this.g.player, def = BR.CONFIG.weapons[wid];
      const i = p.giveWeapon(wid, def.mag);
      if (i < 0) { const c = p.cur === 2 ? 0 : p.cur; p.slots[c] = BR.Weapons.create(wid, def.mag); p.switchTo(c); }
      p.ammo[def.ammo] = BR.CONFIG.ammoCap[def.ammo];
    },

    // ---- spawning only in opened zones -------------------------------------------------
    spawnZombie(at, riseT, speedOverride) {
      if (!at) { const p = this.g.player.pos, W = this.g.world, open = (W.zmSpawns || []).filter(s => this.unlocked.has(s.zone || 'graveyard'));
        const far = open.filter(s => Math.hypot(s.x - p.x, s.z - p.z) > 12 && Math.hypot(s.x - p.x, s.z - p.z) < 70); const list = far.length ? far : open; at = list[Math.floor(Math.random() * list.length)]; }
      return BR.ZombieMode.prototype._spawnZombieBase.call(this, at, riseT, speedOverride);
    },

    // ---- quests every 5 rounds (story lore + points) ---------------------------------------
    nextRound() {
      baseNext.call(this);
      if (this.round % 5 === 0) this.startQuest();
    },
    startQuest() {
      const def = QUESTS[this.questN % QUESTS.length], tier = Math.floor(this.questN / QUESTS.length);
      this.quest = { def, n: 0, goal: Math.round(def.goal * (1 + tier * 0.5)), reward: 600 + this.round * 40, lore: STORY.lore[this.questN % STORY.lore.length], t: 0 };
      this.refreshQuestSpots();
      this.g.hud.zmQuest(this.quest);
      setTimeout(() => this.g.hud.zmBanner('NEW QUEST', def.title + ': ' + def.desc, 'quest'), 2600);
    },
    refreshQuestSpots() {
      const Q = this.quest; if (!Q) return; const W = this.g.world, QS = W.zmQuest, sc = this.g.scene;
      if (Q.spots) for (const s of Q.spots) if (s.mesh) sc.remove(s.mesh);
      Q.spots = [];
      const mk = (x, y, z, col, interact, kind) => { const grp = new THREE.Group(); grp.position.set(x, y, z); const gl = sprite(col, 1.6); gl.material.opacity = 0.7; grp.add(gl); sc.add(grp); const s = { x, y, z, mesh: grp, gl, interact, kind, done: false }; Q.spots.push(s); return s; };
      const id = Q.def.id;
      if (id === 'pages') { const open = QS.pages.filter(pp => this.unlocked.has(BR.zombieZoneAt(pp.x, pp.z))); const pool = open.concat([{ x: -14, z: 30 }, { x: 18, z: -6 }, { x: -33, z: -12 }]).slice(0, Q.goal);
        for (const pg of pool) { const s = mk(pg.x, this.g.world.groundAt(pg.x, pg.z, 3) + 1, pg.z, 0xfff2c0, null, 'page'); const page = mesh(new THREE.PlaneGeometry(0.35, 0.45), new THREE.MeshBasicMaterial({ color: 0xf2e6c8, side: THREE.DoubleSide })); s.mesh.add(page); s.page = page; } }
      else if (id === 'candles') for (const c of QS.candles) { const s = mk(c.x, 0.9, c.z, 0x666666, 'Light the ritual candle', 'candle'); s.mesh.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), lam(0xeae0c8), 0, -0.45, 0)); s.gl.material.opacity = 0.15; }
      else if (id === 'bell') mk(QS.bell.x, QS.bell.y + 1.2, QS.bell.z, 0xffd24a, 'Ring the wedding bell', 'bell');
      else if (id === 'cauldron') { const open = this.unlocked.has('wood'); Q.zone = open ? { x: QS.cauldron.x, z: QS.cauldron.z, r: 8 } : { x: 0, z: -22, r: 8 }; mk(Q.zone.x, 2.5, Q.zone.z, 0x7dff3a, null, 'area'); }
      else if (id === 'stones') { const open = this.unlocked.has('wood'); Q.zone = open ? { x: QS.stones.x, z: QS.stones.z, r: 6 } : { x: QS.altar.x, z: QS.altar.z, r: 4 }; mk(Q.zone.x, 2.5, Q.zone.z, 0xff2a2a, null, 'area'); }
    },
    questSpot(s) {
      if (s.done) return; s.done = true;
      if (s.kind === 'candle') { s.gl.material.color.setHex(0xffb24a); s.gl.material.opacity = 0.8; s.gl.scale.setScalar(1.2); BR.Audio.zFire && BR.Audio.zFire(); }
      else if (s.kind === 'bell') { BR.Audio.zBell && BR.Audio.zBell(); this.g.cam.shake = Math.max(this.g.cam.shake, 0.2); }
      this.questProgress(1);
    },
    questEvent(kind, n) {
      const Q = this.quest; if (!Q) return; const id = Q.def.id;
      if ((id === 'headshots' && kind === 'headshot') || (id === 'knife' && kind === 'knife') || (id === 'pap' && kind === 'pap')) this.questProgress(n || 1);
      if (id === 'cauldron' && kind === 'kill' && n && Math.hypot(n.x - Q.zone.x, n.z - Q.zone.z) < Q.zone.r) this.questProgress(1);
    },
    questProgress(k) {
      const Q = this.quest; if (!Q) return; Q.n = Math.min(Q.goal, Q.n + k); this.g.hud.zmQuest(Q);
      if (Q.n >= Q.goal) this.completeQuest();
    },
    completeQuest() {
      const Q = this.quest, g = this.g; this.quest = null; this.questN++;
      if (Q.spots) for (const s of Q.spots) if (s.mesh) g.scene.remove(s.mesh);
      this.addPoints(Q.reward); this.journal.push(Q.lore);
      g.hud.zmQuest(null); g.hud.zmJournal(this.journal);
      g.hud.zmBanner('QUEST COMPLETE', Q.def.title + '  ·  +' + Q.reward + ' points', 'slain');
      setTimeout(() => g.hud.zmLore(Q.lore.title, Q.lore.text), 1500);
      BR.Audio.zPower && BR.Audio.zPower();
    },
    updateQuest(dt) {
      const Q = this.quest; if (!Q) return; const p = this.g.player;
      Q.t += dt;
      if (Q.spots) for (const s of Q.spots) { if (s.done && s.kind === 'page') continue; s.mesh.position.y = s.y + Math.sin(this.tAll * 2 + s.x) * 0.15; if (s.page) s.page.rotation.y += dt * 2;
        if (s.kind === 'page' && !s.done && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 1.6 && Math.abs(s.y - 1 - p.pos.y) < 2.5) { s.done = true; this.g.scene.remove(s.mesh); BR.Audio.pickup(); this.questProgress(1); } }
      if (Q.def.id === 'stones' && Q.zone && Math.hypot(p.pos.x - Q.zone.x, p.pos.z - Q.zone.z) < Q.zone.r) { Q.acc = (Q.acc || 0) + dt; if (Q.acc >= 1) { Q.acc -= 1; this.questProgress(1); } }
    },

    // ---- boss intro cutscene -------------------------------------------------------------
    spawnBoss() {
      ZM._spawnBossBase.call(this);
      const b = this.boss; if (!b) return;
      b.riseT = b.riseMax = 3.2;
      this.cut = { t: 0, dur: 6.2, b, type: b.boss, story: STORY.bosses[b.boss] };
      document.body.classList.add('zm-cinema'); this.g.hud.zmCut(this.cut.story, BOSSES[b.boss].color);
      this.g.hud.zmBoss(null);
    },
    updateCut(dt) {
      const C = this.cut, g = this.g, b = C.b; C.t += dt;
      this.tAll = (this.tAll || 0) + dt; this.ambience(dt);
      b.t += dt; if (b.riseT > 0) b.riseT = Math.max(0, b.riseT - dt); b.syncMesh(dt);
      INTRO[C.type].fx(this, b, C.t, dt); g.fx.update(dt);
      // camera: per-boss path around the boss, looking at the head
      const cp = INTRO[C.type].cam(C.t), cam = g.camera, bp = b.pos;
      cam.position.set(bp.x + Math.sin(cp.ang) * cp.r, bp.y + cp.h + (cp.shake ? (Math.random() - 0.5) * cp.shake : 0), bp.z + Math.cos(cp.ang) * cp.r);
      cam.lookAt(bp.x, bp.y + cp.look, bp.z); cam.fov = 55; cam.updateProjectionMatrix(); g.vmr.hide();
      if (C.t >= C.dur || (g.input && g.input.consume && (g.input.consume('jump') || g.input.consume('interact')) && C.t > 1)) this.endCut();
    },
    endCut() {
      const g = this.g, C = this.cut; this.cut = null; document.body.classList.remove('zm-cinema'); g.hud.zmCut(null);
      if (C.b) { C.b.riseT = 0; g.hud.zmBoss(C.b.D.name, 1, C.b.D.color); }
      g.camera.fov = g.baseFov(); g.camera.updateProjectionMatrix(); g.input.reset(); g.last = performance.now();
    },

    // ---- per frame extras ------------------------------------------------------------------
    update(dt) {
      baseUpdate.call(this, dt);
      if (!this.g.player.alive && !this.net) return;
      this.updateBox(dt); this.updatePap(dt); if (!this.net || this.net.host) this.updateQuest(dt);
      for (const d of this.doors || []) if (d.open && d.openT < 1) { d.openT = Math.min(1, d.openT + dt * 1.5); d.bars.position.y = -d.openT * 4.6; if (d.openT >= 1) d.grp.visible = false; }
      if (this.net && !this.net.host) return;               // (a guest's count comes from the host)
      const left = this.phase === 'fight' ? this.toSpawn + this.zombies.filter(z => z.alive).length + (this.bossPending ? 1 : 0) : 0;
      this.g.hud.zmLeft(left, this.phase === 'fight');
    },
    onKill(victim, killer, weaponId, head) {
      baseOnKill.call(this, victim, killer, weaponId, head);
      if (!victim.zombie || !killer || !killer.isPlayer) return;
      const melee = BR.CONFIG.weapons[weaponId] && BR.CONFIG.weapons[weaponId].melee;
      if (head && !melee) this.questEvent('headshot'); if (melee) this.questEvent('knife');
      this.questEvent('kill', victim.pos);
    },
  });
})();
