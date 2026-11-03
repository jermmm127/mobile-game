'use strict';
// =============================================================================
// VIEWMODEL — your gun + gloved arms in first person, drawn in their own scene
// so they never clip into walls.
//
// Motion is procedural and spring-driven (no baked clips):
//   springs  — sway from looking, movement bob, sprint pose, landing bounce, recoil
//   keyframes — draw (karambit: CS-style twirl around the finger ring), inspect,
//               knife slashes, full magazine reloads, shell-by-shell loading
// Hooks called by Game: rebuild(), update(dt), onFire(w), onMelee(hit),
// onShell(), startInspect(), onLand(speed). Read adsW for aim progress.
// =============================================================================
(function () {
  const U = BR.util;
  const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const easeOutBack = t => { t = clamp01(t); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const easeInOut = t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  // Window helper: 0 before a, ramps to 1 by b, holds until c, back to 0 by d
  const win = (t, a, b, c, d) => (t < a || t > d ? 0 : t < b ? smooth((t - a) / (b - a)) : t <= c ? 1 : 1 - smooth((t - c) / (d - c)));

  class Spring {
    constructor(k, z) { this.v = 0; this.vel = 0; this.k = k; this.d = 2 * Math.sqrt(k) * (z || 0.75); }
    step(target, dt) {
      const n = dt > 1 / 90 ? 2 : 1, h = dt / n;
      for (let i = 0; i < n; i++) { this.vel += (this.k * (target - this.v) - this.d * this.vel) * h; this.v += this.vel * h; }
      return this.v;
    }
  }
  const S3 = (k, z) => ({ x: new Spring(k, z), y: new Spring(k, z), z: new Spring(k, z) });

  BR.Viewmodel = class Viewmodel {
    constructor(game) {
      this.game = game;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6250, 0.85));
      const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(1, 2, 1.5); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x9fc4ff, 0.35); rim.position.set(-2, 0.5, -1); this.scene.add(rim);
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.models = {};
      this.pos = S3(140, 0.7);        // smoothed pose
      this.rot = S3(140, 0.7);
      this.kick = S3(260, 0.45);      // recoil (impulses, springs back to 0)
      this.kickR = S3(220, 0.5);
      this.adsW = 0; this.sprintW = 0; this.bob = 0; this.bobAmt = 0;
      this.drawT = 0; this.drawDur = 0.5; this.inspectT = 0; this.inspectDur = 2;
      this.swingT = 0; this.swingDir = 1; this.shellT = 0; this.flashT = 0;
      this.charmA = 0; this.charmV = 0;
      this.lastWeapon = null; this.lastReloadK = 0;
      this.scale = 1;
      this.grapW = 0; this.grapT = 0; this.stimT = 0; this.stimDur = 1; this.stimW = 0; this.stimK = 0;
      this.ropeFrom = new THREE.Vector3(); this.ropeValid = false;
      for (const k of ['_sx', '_sv', '_sy', '_sz', '_sp0', '_sp1', '_sp2', '_spo']) this[k] = new THREE.Vector3();
      this._sq1 = new THREE.Quaternion(); this._sq2 = new THREE.Quaternion(); this._sm = new THREE.Matrix4();
      this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._pumpFore = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
      this.rebuild();
    }

    resize(w, h) {
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.scale = w < h ? 0.6 : 1;
    }

    // (Re)build weapon models + arms with the equipped blueprints, camo, charm and gloves.
    rebuild() {
      const eq = BR.Profile.data.equip;
      while (this.root.children.length) this.root.remove(this.root.children[0]);
      this.models = {};
      for (const id in BR.CONFIG.weapons) {
        const bp = (eq.blueprints || {})[id];
        const m = BR.Models.weapon(id, eq.skins, BR.CONFIG.weapons[id].melee ? 'none' : eq.charms, bp);
        const holder = new THREE.Group();
        if (id === 'knife') {
          // Reverse grip: handle upright in the fist (ring on top by the index finger), blade
          // hanging below it with the hooked tip sweeping forward and up.
          // CS-style idle: handle across the fist (ring on the inner side by the index finger),
          // blade out the outer side sweeping up-right with the hook curving up, flat facing you.
          // model Z (handle -> ring) -> left, model -Y (hook) -> up, model X -> toward the camera's -Z
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0)));
          m.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.25, -0.32, 'YXZ')));
          m.scale.setScalar(0.8);
          // Pivot at the finger ring so the karambit twirls around it
          m.updateMatrix();
          const P = new THREE.Vector3(0, 0.066, 0.12).applyMatrix4(m.matrix);   // ring centre
          const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion).normalize();
          const spin = new THREE.Group();
          spin.position.copy(P); m.position.sub(P);
          spin.add(m); holder.add(spin);
          holder.userData.spin = { obj: spin, axis };
        } else if (id === 'butterfly') {
          // held like a hammer grip: handles in the fist, blade angled forward and in
          m.rotation.set(-0.5, 0.4, 0.12); m.scale.setScalar(1.25);
          m.userData.baseRot = m.rotation.clone();
          holder.add(m);
        } else holder.add(m);
        holder.userData.model = m;
        holder.visible = false;
        this.root.add(holder);
        this.models[id] = holder;
      }
      // Arms: sleeve + gloved hand for each side, placed every frame in camera space
      if (this.arms) for (const s of ['R', 'L']) this.scene.remove(this.arms[s].hand, this.arms[s].fore);
      const sleeve = new THREE.MeshLambertMaterial({ color: 0x2c333c });
      const sleeveGeo = new THREE.CylinderGeometry(0.03, 0.042, 1, 10);
      const mk = left => {
        const hand = BR.Models.hand(eq.gloves || 'default', left);
        hand.scale.setScalar(1.3);
        const fore = new THREE.Mesh(sleeveGeo, sleeve);
        this.scene.add(hand, fore);
        return { hand, fore };
      };
      this.arms = { R: mk(false), L: mk(true) };
      // signature reload styles for the equipped blueprints + a small VFX pool
      this.sigReload = {};
      for (const id in BR.CONFIG.weapons) {
        const bp = (eq.blueprints || {})[id], B = bp && BR.Models.BLUEPRINTS[id] && BR.Models.BLUEPRINTS[id][bp];
        if (B && B.reload) this.sigReload[id] = B.reload;
      }
      if (!this.sparks) {
        this.sparks = []; this.rings = []; this.spi = 0; this.rgi = 0;
        const bg = new THREE.BoxGeometry(1, 1, 1), rg = new THREE.RingGeometry(0.8, 1, 32);
        for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; this.scene.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0, max: 1 }); }
        for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; this.scene.add(m); this.rings.push({ m, life: 0, max: 1 }); }
      }
      // Backhand fists for the karambit idle (mirrored gloves so the thumbs sit toward the centre)
      if (this.knifeHands) this.scene.remove(this.knifeHands.R, this.knifeHands.L);
      const kh = left => { const h = BR.Models.hand(eq.gloves || 'default', left, true); h.scale.setScalar(1.3); h.visible = false; this.scene.add(h); return h; };
      this.knifeHands = { R: kh(true), L: kh(false) };
      // Wrist grapple launcher (child of the left hand: aims where the fingers point)
      const dark = new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), steel = new THREE.MeshLambertMaterial({ color: 0x8a9098 });
      const orange = new THREE.MeshLambertMaterial({ color: 0xffa31a, emissive: 0x552200 });
      const ln = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.07), dark); body.position.set(0, 0.03, 0.03); ln.add(body);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.018), dark); strap.position.set(0, 0.0, 0.05); ln.add(strap);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.035, -0.03); ln.add(barrel);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.02), new THREE.MeshBasicMaterial({ color: 0x8fe6ff })); light.position.set(0.012, 0.044, 0.035); ln.add(light);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), orange); tip.position.set(0, 0.035, -0.065); ln.add(tip);
      ln.userData.tip = tip; ln.visible = false;
      this.arms.L.hand.add(ln); this.launcher = ln;
      // Stim pen injector (needle along +X, plunger at -X by the thumb)
      if (this.injector) this.scene.remove(this.injector);
      const inj = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xe8ecef })); tube.rotation.z = Math.PI / 2; inj.add(tube);
      const win = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.04, 10), new THREE.MeshBasicMaterial({ color: 0x5dff9a })); win.rotation.z = Math.PI / 2; win.position.x = 0.01; inj.add(win);
      const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0x2f9a5a })); plunger.rotation.z = Math.PI / 2; plunger.position.x = -0.075; inj.add(plunger); inj.userData.plunger = plunger;
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 6), steel); needle.rotation.z = Math.PI / 2; needle.position.x = 0.075; inj.add(needle);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.04, 10), orange); cap.rotation.z = Math.PI / 2; cap.position.x = 0.08; inj.add(cap);
      inj.userData.cap = cap; inj.scale.setScalar(1.3); inj.visible = false;
      this.scene.add(inj); this.injector = inj;
      if (this.vmNade) this.scene.remove(this.vmNade);
      this.vmNade = BR.Shockwave.model(); this.vmNade.scale.setScalar(0.55); this.vmNade.visible = false; this.scene.add(this.vmNade);

      this.lastWeapon = null;
    }

    // ---- events from the game -------------------------------------------
    onFire(w) {
      const d = w.def, a = (1 - this.adsW * 0.65) * (d.kick || 1), auto = d.rpm >= 500;
      const r = (Math.random() - 0.5);
      this.kick.z.vel += (d.recoil * 9 + 0.35) * a;                   // straight back
      this.kick.y.vel += (d.recoil * 2.2 + 0.05) * a;
      this.kickR.x.vel += (d.recoil * 30 + 0.8) * a;                  // muzzle climb
      this.kickR.z.vel += r * (auto ? 1.2 : 0.6) * a;                 // random roll
      this.kickR.y.vel += r * (auto ? 0.6 : 0.25) * a;
      this.flashT = d.suppressed ? 0.025 : 0.05;
      this.inspectT = 0;
      if (d.revolver) this.cylTarget = (this.cylTarget || 0) + Math.PI / 3;          // index one chamber
      // Bolt action: cycle the bolt after every shot (unless that was the last round)
      if (d.bolt && w.mag > 0) { this.boltDelay = 0.12; this.boltDur = Math.min(0.9, 60 / d.rpm * 0.72); this.boltT = 0; }
      // Pump action: rack the forend back and forward after every shot
      if (d.pump && w.mag > 0) { this.pumpDelay = 0.1; this.pumpDur = Math.min(0.5, 60 / d.rpm * 0.62); this.pumpT = 0; }
    }
    onMelee() { this.swingT = 0.42; this.swingDir *= -1; this.inspectT = 0; }
    onShell() { this.shellT = 0.2; }
    onLand(speed) { this.pos.y.vel -= Math.min(1.6, speed * 0.07); this.rot.x.vel -= Math.min(2, speed * 0.08); }
    startInspect(w) { if (!w) return; this.inspectDur = this.inspectT = w.def.melee ? 2.4 : 2.1; this.lastBflyT = 0; }

    hide() { if (this.vmNade) this.vmNade.visible = false; if (this.knifeHands) this.knifeHands.R.visible = this.knifeHands.L.visible = false; this.lookDown = 0; this.ropeValid = false; if (this.launcher) this.launcher.visible = false; if (this.injector) this.injector.visible = false; this.root.visible = false; for (const s of ['R', 'L']) { this.arms[s].hand.visible = this.arms[s].fore.visible = false; } }

    // ---- per frame ------------------------------------------------------------
    update(dt, lookDX, lookDY) {
      const game = this.game, p = game.player, w = p.weapon, m = p.mover, Mv = BR.CONFIG.move;
      for (const id in this.models) this.models[id].visible = false;
      // bolt cycle timer (runs even while scoped, when the gun is hidden)
      if (this.boltDelay > 0) { this.boltDelay -= dt; if (this.boltDelay <= 0) this.boltT = this.boltDur; }
      else if (this.boltT > 0) this.boltT = Math.max(0, this.boltT - dt);
      if (!w || !w.def.bolt) { this.boltT = 0; this.boltDelay = 0; }
      if (this.pumpDelay > 0) { this.pumpDelay -= dt; if (this.pumpDelay <= 0) this.pumpT = this.pumpDur; }
      else if (this.pumpT > 0) this.pumpT = Math.max(0, this.pumpT - dt);
      if (!w || !w.def.pump) { this.pumpT = 0; this.pumpDelay = 0; }
      if (!w || m.dropping || (p.ads && w.def.scope)) { this.hide(); return; }
      this.root.visible = true;
      const holder = this.models[w.id], model = holder.userData.model, ud = model.userData, def = w.def;
      holder.visible = true;

      // New weapon in hand: draw animation
      if (w !== this.lastWeapon) {
        this.lastWeapon = w;
        this.drawDur = this.drawT = def.melee ? 1.05 : 0.55;
        this.inspectT = 0; this.spinSwish = 0; this.lastReloadK = 0; this.lastBflyT = 0; this.boltT = 0; this.boltDelay = 0; this.pumpT = 0; this.pumpDelay = 0;
        if (def.melee) BR.Audio.unsheathe(); else BR.Audio.reload();
      }
      this.drawT = Math.max(0, this.drawT - dt);
      this.inspectT = Math.max(0, this.inspectT - dt);
      this.swingT = Math.max(0, this.swingT - dt);
      this.shellT = Math.max(0, this.shellT - dt);
      this.flashT -= dt;

      // ---- pose targets ---------------------------------------------------------
      const s = this.scale;
      const sp = m.speedH, run = Mv.runSpeed;
      this.adsW = U.damp(this.adsW, p.ads ? 1 : 0, 13, dt);
      const reloading = w.reloadT > 0;
      const sprinting = m.onGround && !m.sliding && sp > run * 0.92 && !p.ads && !p.fireHeld && !reloading && this.drawT <= 0 && this.inspectT <= 0;
      this.sprintW = U.damp(this.sprintW, sprinting ? 1 : 0, 7, dt);
      let hx = 0.2 * s, hy = -0.205, hz = -0.6, ax = 0, ay = -0.13, az = -0.42;
      if (def.melee) { hx = 0.1 * s; hy = -0.095; hz = -0.38; }      // karambit low in the right of the view, like CS
      if (w.id === 'butterfly') { hx = 0.14 * s; hy = -0.05; hz = -0.4; }
      // aiming: the sight sits closer to your eye (bigger in view) than it used to
      if (ud.sight && !def.scope) { const sg = ud.sight.position; ax = -sg.x; ay = -sg.y; az = -(ud.sightDist || 0.3) * 0.78 - sg.z; }
      const A = this.adsW, nA = 1 - A * 0.85;
      // Bob: figure-eight while moving on the ground
      const grounded = m.onGround && !m.sliding;
      this.bobAmt = U.damp(this.bobAmt, grounded ? Math.min(sp / run, 1.3) : 0, 8, dt);
      this.bob += dt * (4 + sp * 0.9) * (grounded ? 1 : 0.3);
      const bx = Math.sin(this.bob) * 0.011 * this.bobAmt * nA;
      const by = -Math.abs(Math.cos(this.bob)) * 0.013 * this.bobAmt * nA;
      let tx = U.lerp(hx, ax, A) + bx, ty = U.lerp(hy, ay, A) + by, tz = U.lerp(hz, az, A);
      let rx = 0, ry = 0, rz = 0;
      // Sway: the gun lags behind where you look
      ry += U.clamp(-lookDX * 0.0022, -0.12, 0.12) * nA;
      rx += U.clamp(-lookDY * 0.0018, -0.1, 0.1) * nA;
      tx += U.clamp(-lookDX * 0.0004, -0.02, 0.02) * nA;
      // Sprint: lowered and canted
      const W = this.sprintW;
      tx += 0.02 * W; ty -= 0.035 * W; tz += 0.03 * W; rx -= 0.22 * W; ry += 0.5 * W; rz += 0.32 * W;
      // Air / slide / wall-run / crouch
      if (!m.onGround) rx += U.clamp(m.vel.y * 0.012, -0.12, 0.1) * nA;
      if (m.sliding) { rz += 0.32 * nA; ty -= 0.025; }
      if (m.wallRunning) rz += 0.16 * nA;
      if (m.crouched) ty -= 0.012;

      // ---- keyframed overlays (added after the springs) -------------------------
      let ox = 0, oy = 0, oz = 0, orx = 0, ory = 0, orz = 0;
      let leftTarget = null, magOff = null, magVis = true, spinAng = 0, ringW = 0, leftHidden = !!def.melee, bfly = null;
      // Draw
      if (this.drawT > 0) {
        const t = 1 - this.drawT / this.drawDur;
        if (w.id === 'butterfly') {
          // Butterfly deploy: comes up closed, the bite handle swings open, the knife rolls over in the
          // hand while the safe handle swings round, then an extra aerial flip and the handles slap shut
          const rise = smooth(t / 0.1);
          oy += -(1 - rise) * 0.18; orz += Math.sin(t * Math.PI) * 0.35; ox += 0.04 * win(t, 0, 0.1, 0.6, 0.9);
          bfly = { a: Math.PI * (1 - smooth((t - 0.08) / 0.3)), b: -Math.PI * (1 - smooth((t - 0.02) / 0.22)) + Math.PI * 2 * smooth((t - 0.48) / 0.2), roll: easeInOut(t / 0.75) * Math.PI * 2 };
          this.bflySwish(t, [0.12, 0.3, 0.55, 0.68]);
        } else if (def.melee) {
          // CS-style karambit deploy: snap into view, twirl twice around the ring, settle
          const rise = smooth(t / 0.08), out = 1 - smooth((t - 0.6) / 0.4);
          oy += -(1 - rise) * 0.16 + out * rise * 0.06;
          ox += -out * rise * 0.06; oz += -out * 0.14;
          ox += 0.18 * win(t, 0, 0.1, 0.5, 0.72); oy -= 0.02 * win(t, 0, 0.1, 0.5, 0.72);                           // the flip happens out to the right side
          orz += -out * 0.3; orx += out * 0.15;
          spinAng = easeInOut(t / 0.6) * Math.PI * 4;                       // starts right away
          ringW = win(t, 0, 0.07, 0.52, 0.68);                              // index finger in the ring while it rolls
          const turns = Math.floor(spinAng / (Math.PI * 2) + 0.25);
          if (turns > this.spinSwish) { this.spinSwish = turns; BR.Audio.swish(false); }
        } else {
          const e = easeOutBack(t);
          oy -= (1 - e) * 0.3; orx -= (1 - e) * 0.85; orz += (1 - e) * 0.45; ox += (1 - e) * 0.06;
        }
      }
      // Inspect
      if (this.inspectT > 0) {
        const t = 1 - this.inspectT / this.inspectDur;
        if (w.id === 'butterfly') {
          // Butterfly inspect: chaplin flips (each handle swings closed and back open), a full roll, then a
          // fast aerial and a show-off tilt toward the camera
          const c1 = win(t, 0.04, 0.16, 0.16, 0.3), c2 = win(t, 0.22, 0.34, 0.34, 0.48);
          bfly = { a: Math.PI * c1, b: -Math.PI * c2 + Math.PI * 2 * smooth((t - 0.62) / 0.14), roll: easeInOut((t - 0.4) / 0.25) * Math.PI * 2 };
          const sh = win(t, 0.75, 0.85, 0.95, 1);
          ory += sh * 0.9; orz += sh * 0.5 + Math.sin(t * Math.PI) * 0.2; ox -= sh * 0.1; oy += sh * 0.05;
          this.bflySwish(t, [0.12, 0.3, 0.5, 0.68]);
        } else if (def.melee) {
          spinAng = easeInOut(t / 0.42) * Math.PI * 4;
          ringW = win(t, 0, 0.06, 0.36, 0.48);
          const sh = win(t, 0.42, 0.55, 0.85, 1);
          ory += sh * 1.15; orz += sh * 0.65; ox -= sh * 0.12; oy += sh * 0.06; orx += Math.sin(t * Math.PI * 3) * 0.05 * sh;
        } else {
          const a = win(t, 0, 0.2, 0.45, 0.6), b = win(t, 0.45, 0.6, 0.85, 1);
          ory += a * 0.95 - b * 0.35; orz += a * 0.4 + b * 0.55; orx += b * 0.35;
          ox -= a * 0.12 + b * 0.04; oy += a * 0.05 + b * 0.04; oz += b * 0.06;
        }
      }
      // Knife slash: wind-up, fast arc across, follow-through; alternates direction
      if (this.swingT > 0) {
        const t = 1 - this.swingT / 0.42, dr = this.swingDir;
        const wind = win(t, 0, 0.12, 0.12, 0.3), cut = smooth((t - 0.12) / 0.2), back = smooth((t - 0.45) / 0.55);
        const arc = cut * (1 - back);
        ox += dr * (0.05 * wind - 0.2 * arc); oy += 0.03 * wind - 0.05 * arc;
        orz += dr * (0.35 * wind - 1.05 * arc); ory += dr * 0.6 * arc; orx += -0.5 * arc + 0.15 * wind;
      }
      if (this.throwT > 0) this.throwT = Math.max(0, this.throwT - dt);
      // Grapple: off hand throws out toward the hook; the gun drops to a one-handed hold
      this.ropeValid = false;
      const hooked = !!m.grapple;
      if (this.grapT > 0) this.grapT = Math.max(0, this.grapT - dt);
      this.grapW = U.damp(this.grapW, hooked || this.grapT > 0 ? 1 : 0, hooked || this.grapT > 0 ? 18 : 8, dt);
      // Stim (Warzone-style): pen comes up, cap flicked off, jabbed into the thigh
      if (this.stimT > 0) {
        this.stimT = Math.max(0, this.stimT - dt);
        this.stimK = 1 - this.stimT / this.stimDur;
        const passedS = x => this.lastStimK < x && this.stimK >= x;
        if (passedS(0.24)) BR.Audio.click();
        if (passedS(0.46)) {   // needle goes into the chest: the whole view flinches
          const c = this.game.cam; c.kick = Math.max(c.kick, 0.07); c.punchV = (c.punchV || 0) - 0.9; c.rollV = (c.rollV || 0) + 0.6;
          this.rot.z.vel += 1.4; this.pos.y.vel -= 0.6; BR.Audio.swish(true);
        }
        this.lastStimK = this.stimK;
      }
      this.stimW = U.damp(this.stimW, this.stimT > 0 && this.stimK < 0.86 ? 1 : 0, this.stimT > 0 && this.stimK < 0.86 ? 16 : 9, dt);
      // look down at the chest while stabbing (the game camera tilts by the same amount)
      this.lookDown = this.stimT > 0 ? 0.22 * win(this.stimK, 0.26, 0.4, 0.66, 0.84) : 0;
      if (this.injector) this.injector.userData.plunger.position.x = -0.075 + (this.stimK > 0.48 && this.stimT > 0 ? Math.min(1, (this.stimK - 0.48) / 0.15) * 0.022 : 0);
      const busy = Math.max(this.grapW, this.stimW, this.throwT > 0 ? 0.7 : 0);
      if (busy > 0.01) {
        oy -= 0.05 * busy; ox += 0.04 * busy; orz -= 0.22 * busy; orx -= 0.1 * this.stimW;
        if (this.stimW > 0.01) leftTarget = null;
      }

      // Bolt action: right hand leaves the grip, lifts the bolt, rips it back, drives it
      // home, locks it down and returns. The gun cants toward you while you work it.
      let rightTarget = null, boltLift = 0, boltBack = 0;
      if (this.boltT > 0 && ud.bolt && !reloading) {
        const k = 1 - this.boltT / this.boltDur;
        const reach = smooth(k / 0.18), ret = smooth((k - 0.8) / 0.2);
        boltLift = smooth((k - 0.16) / 0.12) * (1 - smooth((k - 0.66) / 0.12));
        boltBack = smooth((k - 0.3) / 0.16) * (1 - smooth((k - 0.5) / 0.14));
        const cant = win(k, 0, 0.2, 0.75, 1) * (1 - A * 0.6);
        orz += 0.32 * cant; ory += 0.12 * cant; oy += 0.015 * cant; orx += 0.06 * cant + boltBack * 0.04;
        oz += boltBack * 0.015;
        rightTarget = { w: reach * (1 - ret) };
        const passed = x => this.lastBoltK < x && k >= x;
        if (passed(0.32)) { BR.Audio.click(); }
        if (passed(0.5)) { BR.Audio.reload(); this.pos.z.vel += 0.25; }
        this.lastBoltK = k;
      } else this.lastBoltK = 0;
      if (ud.bolt) { ud.bolt.rotation.z = boltLift * 1.05; ud.bolt.position.z = ud.boltZ0 + boltBack * 0.075; }
      // pump: forend snaps back (spent shell out), then forward; the gun dips and rolls a touch
      let pumpBack = 0;
      if (this.pumpT > 0 && ud.pump && !reloading) {
        const k = 1 - this.pumpT / this.pumpDur;
        pumpBack = smooth(k / 0.35) * (1 - smooth((k - 0.5) / 0.35));
        const tilt = win(k, 0, 0.2, 0.7, 1) * (1 - A * 0.5);
        orz += 0.12 * tilt; orx -= 0.05 * tilt; oy -= 0.008 * tilt; oz += pumpBack * 0.012;
        const passed = x => this.lastPumpK < x && k >= x;
        if (passed(0.3)) BR.Audio.click();
        if (passed(0.75)) { BR.Audio.reload(); this.pos.z.vel -= 0.2; }
        this.lastPumpK = k;
      } else this.lastPumpK = 0;
      if (ud.pump) ud.pump.position.z = pumpBack * 0.07;

      // Signature reloads (Legendary / Mythic / Exotic blueprints): a flashy move + glow VFX
      this.reloadEl = reloading ? (this.reloadEl || 0) + dt : 0;
      const sig = !def.melee && this.sigReload[w.id];
      if (reloading && sig) {
        const kk = def.shellReload ? Math.min(1, this.reloadEl / 0.9) : 1 - w.reloadT / def.reload;
        const st = sig.style, E = smooth;
        if (st === 'twirl') { const a = E((kk - 0.06) / 0.34); orz += a * Math.PI * 2; oy += Math.sin(a * Math.PI) * 0.05; oz -= Math.sin(a * Math.PI) * 0.04; }
        else if (st === 'flip') { const a = E((kk - 0.5) / 0.3); orx += a * Math.PI * 2; oy += Math.sin(a * Math.PI) * 0.09; }
        else if (st === 'toss') { const a = Math.min(1, Math.max(0, (kk - 0.12) / 0.36)); oy += Math.sin(a * Math.PI) * 0.16; orx -= E(a) * Math.PI * 2; ory += Math.sin(a * Math.PI) * 0.4; }
        else if (st === 'spin') { const a = E((kk - 0.58) / 0.3); ory += a * Math.PI * 2; ox -= Math.sin(a * Math.PI) * 0.05; }
        else if (st === 'glitch' && kk > 0.08 && kk < 0.9) {
          const f = Math.floor(performance.now() / 55), r1 = Math.sin(f * 12.9898) * 43758.5453, u = r1 - Math.floor(r1);
          if (u > 0.55) { ox += (u - 0.75) * 0.08; oy += (u - 0.7) * 0.05; orz += (u - 0.7) * 0.6; }
          model.visible = !(u > 0.93);
        }
        const passedR = x => this.lastSigK < x && kk >= x;
        const at = model.localToWorld(this._v.set(0, 0.0, -0.1));
        if (passedR(0.2)) { this.vfx(at, sig.fx, 14, 1.4); this.ringFx(at, sig.fx); BR.Audio.swish(false); }
        if (passedR(0.68)) { this.vfx(at, sig.fx, 18, 1.8); this.ringFx(at, sig.fx); }
        if (passedR(0.97)) this.vfx(at, 0xffffff, 10, 1.2);
        this.lastSigK = kk;
      } else { this.lastSigK = 0; model.visible = true; }

      // Reloads
      const port = ud.port, fore = ud.fore;
      if (reloading && !def.melee) {
        const k = 1 - w.reloadT / def.reload;
        if (def.shellReload) {
          // Tilt the gun to show the loading port; left hand feeds a shell each cycle
          const tilt = 1;
          orz -= 0.45 * tilt; ory -= 0.25 * tilt; ox += 0.02; oy += 0.025; orx += 0.08;
          const lp = this._v2.copy(port);
          const reach = smooth(k / 0.55), push = smooth((k - 0.55) / 0.3), away = smooth((k - 0.85) / 0.15);
          leftTarget = lp.set(port.x - 0.01, port.y - 0.16 * (1 - reach) - 0.01 * away, port.z + 0.06 * (1 - reach) - 0.035 * push + 0.08 * away);
          if (this.shellT > 0) oy -= Math.sin(this.shellT / 0.2 * Math.PI) * 0.02;
        } else if (def.revolver && ud.crane) {
          // Revolver: roll the gun, swing the cylinder out, punch the ejector (cylinder spins), left hand
          // brings a speedloader up and drives it in, flick the cylinder shut, settle
          const tilt = win(k, 0, 0.1, 0.84, 0.97), up = win(k, 0.14, 0.2, 0.3, 0.36);
          orz += 0.75 * tilt; ory -= 0.2 * tilt; oy += 0.05 * tilt; ox -= 0.05 * tilt; orx += 0.55 * up - 0.15 * tilt;
          const open = win(k, 0.04, 0.14, 0.72, 0.8);
          ud.crane.rotation.z = open * 1.35;
          if (k > 0.14 && k < 0.34) this.cylSpinV = 18;                                    // empties dumped
          const sl = ud.speedloader, slIn = smooth((k - 0.42) / 0.18), slOn = k > 0.3 && k < 0.66;
          sl.visible = slOn;
          // speedloader path in model space: from below the gun up to the open cylinder's rear face
          const cylAt = ud.crane.localToWorld(this._v.set(0.016, 0.02, 0.03)); model.worldToLocal(cylAt);
          magOff = this._v2.set(0, -0.28, 0.12).lerp(cylAt.sub(this._rvSl || (this._rvSl = new THREE.Vector3(0, 0.042, 0.03))), slIn);
          const handAt = this._rvHand || (this._rvHand = new THREE.Vector3());
          handAt.set(0, 0.042, 0.03).add(magOff).add(this._rvOff || (this._rvOff = new THREE.Vector3(0, -0.04, -0.012)));
          if (k < 0.2) leftTarget = (fore || handAt).clone().lerp(new THREE.Vector3(-0.1, -0.4, 0.2), smooth(k / 0.2));
          else if (k < 0.7) leftTarget = handAt.clone();
          else leftTarget = new THREE.Vector3(-0.02, 0.05, -0.03).lerp(fore || handAt, smooth((k - 0.72) / 0.2));   // palm flicks it shut
          const passed = x => this.lastReloadK < x && k >= x;
          if (passed(0.12)) { BR.Audio.click(); this.rot.z.vel += 0.8; }
          if (passed(0.22)) { BR.Audio.reload(); this.pos.y.vel += 0.4; }
          if (passed(0.6)) { BR.Audio.click(); this.pos.z.vel -= 0.3; }
          if (passed(0.76)) { BR.Audio.reload(); this.rot.z.vel -= 1.6; }
          this.lastReloadK = k;
        } else {
          // Magazine: tilt, mag out, hand to pouch, new mag in, slap, (rifles) charge
          const tilt = win(k, 0, 0.12, 0.82, 0.97);
          // roll the gun so the mag well faces you, lift it and bring it toward centre
          orz -= 0.5 * tilt; orx += 0.3 * tilt; ory += 0.38 * tilt; oy += 0.06 * tilt; ox -= 0.08 * tilt; oz += 0.03 * tilt;
          const magPos = this._v.set(0, 0, 0);
          if (k < 0.18) magOff = magPos.set(0, 0, 0);
          else if (k < 0.34) { const d = smooth((k - 0.18) / 0.16); magOff = magPos.set(0, -0.32 * d, 0.06 * d); magVis = d < 0.95; }
          else if (k < 0.52) { magVis = false; magOff = magPos.set(0, -0.3, 0.05); }
          else if (k < 0.7) { const d = smooth((k - 0.52) / 0.18); magOff = magPos.set(0, -0.24 * (1 - d), 0.05 * (1 - d)); }
          else magOff = magPos.set(0, 0, 0);
          // left hand path (model space)
          const mc = ud.mag && ud.mag.children[0];
          const magAt = mc ? this._v2.set(0, mc.position.y - 0.045, mc.position.z).add(magOff) : this._v2.set(0, -0.1, -0.08);
          const pouch = new THREE.Vector3(-0.12, -0.42, 0.18);
          if (k < 0.15) leftTarget = fore ? fore.clone().lerp(magAt, smooth(k / 0.15)) : magAt.clone();
          else if (k < 0.32) leftTarget = magAt.clone();
          else if (k < 0.52) leftTarget = magAt.clone().lerp(pouch, win(k, 0.32, 0.42, 0.44, 0.52));
          else if (k < 0.72) leftTarget = magAt.clone();
          else if (ud.charge && (def.rpm >= 300 || w.id === 'sniper')) {
            const ch = ud.charge || fore;
            const toC = smooth((k - 0.72) / 0.08), pull = win(k, 0.8, 0.85, 0.85, 0.9), back = smooth((k - 0.9) / 0.1);
            leftTarget = magAt.clone().lerp(ch, toC).add(new THREE.Vector3(0, 0, 0.05 * pull)).lerp(fore || ch, back);
          } else leftTarget = magAt.clone().lerp(fore || magAt, smooth((k - 0.72) / 0.2));
          // one-shot jolts + sounds when passing key moments
          const passed = x => this.lastReloadK < x && k >= x;
          if (passed(0.22)) { BR.Audio.click(); this.rot.z.vel -= 0.6; }
          if (passed(0.68)) { BR.Audio.reload(); this.pos.y.vel += 0.5; this.rot.x.vel -= 1.2; }
          if (passed(0.86) && ud.charge) { BR.Audio.reload(); this.pos.z.vel += 0.5; }
          this.lastReloadK = k;
        }
      } else this.lastReloadK = 0;

      // ---- springs ---------------------------------------------------------------
      const P = this.pos, R = this.rot, K = this.kick, KR = this.kickR;
      P.x.step(tx, dt); P.y.step(ty, dt); P.z.step(tz, dt);
      R.x.step(rx, dt); R.y.step(ry, dt); R.z.step(rz, dt);
      K.x.step(0, dt); K.y.step(0, dt); K.z.step(0, dt);
      KR.x.step(0, dt); KR.y.step(0, dt); KR.z.step(0, dt);
      const g = this.root;
      g.position.set(P.x.v + K.x.v + ox, P.y.v + K.y.v + oy, P.z.v + K.z.v + oz);
      g.rotation.set(R.x.v + KR.x.v + orx, R.y.v + KR.y.v + ory, R.z.v + KR.z.v + orz);
      g.scale.setScalar(s);

      // Revolver: cylinder indexing / spinning, crane closed when not reloading
      if (ud.cylinder) {
        this.cylSpinV = (this.cylSpinV || 0) * Math.exp(-dt * 3);
        this.cylAng = (this.cylAng || 0) + this.cylSpinV * dt;
        this.cylAng += ((this.cylTarget || 0) - this.cylAng) * Math.min(1, dt * 18) * (this.cylSpinV > 1 ? 0 : 1);
        if (this.cylSpinV > 1) this.cylTarget = this.cylAng;
        ud.cylinder.rotation.z = this.cylAng;
        if (!reloading) { ud.crane.rotation.z = 0; if (ud.speedloader) ud.speedloader.visible = false; }
      }
      // Butterfly handles + roll (open and still when idle)
      if (ud.handleA) {
        ud.handleA.rotation.x = bfly ? bfly.a : 0; ud.handleB.rotation.x = bfly ? bfly.b : 0;
        const br = model.userData.baseRot; if (br) model.rotation.set(br.x, br.y + (bfly ? bfly.roll : 0), br.z);
      }
      // Karambit ring twirl
      if (holder.userData.spin) {
        // CS:GO-style flip: during twirls the knife turns edge-on so its ring lines up with the
        // index finger (pointing across the screen), then flips forward over the top of the finger.
        const sp = holder.userData.spin;
        const finger = this._fx || (this._fx = new THREE.Vector3());
        this._fq = (this._fq || new THREE.Quaternion()).copy(g.quaternion).invert();
        finger.set(-0.92, 0.08, -0.38).normalize().applyQuaternion(this._fq);          // finger axis in the knife's parent frame
        const align = (this._qa || (this._qa = new THREE.Quaternion())).setFromUnitVectors(sp.axis, finger);
        const alignW = (this._qb || (this._qb = new THREE.Quaternion())).identity().slerp(align, ringW);
        if (ringW > 0.001) sp.obj.quaternion.setFromAxisAngle(finger, spinAng).multiply(alignW);   // flip over the finger
        else sp.obj.quaternion.setFromAxisAngle(sp.axis, -spinAng);
        sp.ang = spinAng; sp.ringW = ringW;
      }
      // Mag + muzzle flash
      if (ud.mag) { ud.mag.position.copy(magOff || this._v.set(0, 0, 0)); ud.mag.visible = magVis; }
      ud.flash.visible = this.flashT > 0 && A < 0.5;
      if (ud.flash.visible) ud.flash.rotation.z = Math.random() * 3;

      // Charm swings from look + movement + recoil
      const ch = ud.charmObj;
      if (ch) {
        const force = -lookDX * 0.02 + p.input.mx * 0.4 - K.z.v * 8 + (P.y.vel || 0) * 0.5;
        this.charmV += (-55 * this.charmA - 5 * this.charmV + force * 30) * dt;
        this.charmA += this.charmV * dt;
        ch.rotation.z = U.clamp(this.charmA, -1.2, 1.2);
        ch.rotation.x = U.clamp(this.charmA * 0.4, -0.8, 0.8);
      }

      this.placeArms(holder, model, ud, leftTarget, leftHidden, rightTarget);
      this.updateVfx(dt);
      BR.Models.animate(model, performance.now() / 1000);     // Mythic blueprints: rings, orbiters, hue cycling
    }

    // Hands follow anchors on the weapon; sleeves run from the wrist to an elbow
    // point just off-screen, so it reads as two arms holding the gun.
    placeArms(holder, model, ud, leftTarget, leftHidden, rightTarget) {
      this.root.updateMatrixWorld(true);
      const A = this.adsW, s = this.scale;
      const R = this.arms.R, L = this.arms.L;
      let wq = model.getWorldQuaternion(this._q);
      // right hand on the grip (palm against the grip's right side, fingers wrapping the front)
      let gp = model.localToWorld(this._v.copy(ud.grip));
      const spin = holder.userData.spin;
      const KH = this.knifeHands, H = spin ? KH.R : R.hand;     // karambit uses the backhand-fist gloves
      R.hand.visible = KH.R.visible = KH.L.visible = false;
      if (spin) {
        // Karambit: a backhand fist round the handle, index finger by the ring. The hand
        // stays put during twirls and the knife spins round the ring at the index finger.
        const sq = this._ksq || (this._ksq = new THREE.Quaternion());
        sq.copy(spin.obj.quaternion); spin.obj.quaternion.identity(); spin.obj.updateMatrixWorld(true);
        const a = model.localToWorld((this._kv2 || (this._kv2 = new THREE.Vector3())).set(0, 0.002, 0.004));      // handle centre line
        const b = model.localToWorld((this._kv3 || (this._kv3 = new THREE.Vector3())).set(0, 0.044, 0.1));
        spin.obj.quaternion.copy(sq); spin.obj.updateMatrixWorld(true);
        // mirrored glove (thumb on -X): -X points at the ring, wrist down toward you, back of hand up
        const X = (this._kx || (this._kx = new THREE.Vector3())).subVectors(a, b).normalize();
        const Z = (this._kz || (this._kz = new THREE.Vector3())).set(0.6, -0.78, -0.05).normalize();
        Z.addScaledVector(X, -Z.dot(X)).normalize();
        const Y = (this._ky || (this._ky = new THREE.Vector3())).crossVectors(Z, X);
        const gripQ = (this._kq2 || (this._kq2 = new THREE.Quaternion())).setFromRotationMatrix((this._km || (this._km = new THREE.Matrix4())).makeBasis(X, Y, Z));
        const fist = this._v2.set(0, -0.014, -0.029).multiplyScalar(1.3).applyQuaternion(gripQ);   // centre of the closed fingers
        H.position.copy(a.lerp(b, 0.5)).sub(fist);
        H.quaternion.copy(gripQ);
        // Twirls: the hand opens off the handle so the index finger sits in the ring, and the
        // knife rolls around that finger; it closes back onto the handle for the final pose.
        const rw = spin.ringW || 0;
        if (rw > 0.001) {
          const ringC = spin.obj.getWorldPosition(this._kv1 || (this._kv1 = new THREE.Vector3()));
          const tip = this._v2.set(-0.0194, -0.018, -0.04).multiplyScalar(1.3).applyQuaternion(gripQ);    // mirrored glove: index on -X
          H.position.lerp(ringC.sub(tip), rw);
          const tilt = this._kq3 || (this._kq3 = new THREE.Quaternion());
          tilt.setFromAxisAngle(X, -0.35 * rw);                                // fingers relax open a little
          H.quaternion.premultiply(tilt);
        }
      } else {
        R.hand.position.copy(gp);
        R.hand.quaternion.copy(wq).multiply(this._qGrip || (this._qGrip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, -Math.PI / 2))));
        R.hand.translateX(0.0); R.hand.translateY(0.026); R.hand.translateZ(0.012);
        if (rightTarget && rightTarget.w > 0 && ud.bolt) {
          // pinch the bolt knob: hand sits just behind/right of it, fingers forward
          const kp = ud.bolt.localToWorld((this._kb2 || (this._kb2 = new THREE.Vector3())).copy(ud.boltKnob));
          // fingers reach in from the right toward the knob, wrist back toward the elbow
          const Zc = (this._bz || (this._bz = new THREE.Vector3())).set(0.75, -0.45, 0.5).normalize();
          const Yb = (this._by || (this._by = new THREE.Vector3())).set(0.1, 1, 0.15);
          Yb.addScaledVector(Zc, -Yb.dot(Zc)).normalize();
          const Xb = (this._bx || (this._bx = new THREE.Vector3())).crossVectors(Yb, Zc);
          const bq = (this._kq3 || (this._kq3 = new THREE.Quaternion())).setFromRotationMatrix((this._bm || (this._bm = new THREE.Matrix4())).makeBasis(Xb, Yb, Zc));
          const off = this._v2.set(0, -0.018, -0.062).multiplyScalar(1.3 * this.scale).applyQuaternion(bq);
          kp.sub(off);
          R.hand.position.lerp(kp, rightTarget.w);
          R.hand.quaternion.slerp(bq, rightTarget.w);
        }
      }
      H.visible = true;
      const elbowR = spin ? this._v2.set(0.5 * s, -0.68, -0.3) : this._v2.set(U.lerp(0.3, 0.2, A) * s, U.lerp(-0.62, -0.55, A), 0.08);
      this.limb(R.fore, H.localToWorld(new THREE.Vector3(0, 0, spin ? 0.075 : 0.05)), elbowR, spin ? 0.72 : 1);
      // left hand on the foregrip / mag / charging handle
      const lt = leftTarget || (ud.pump && ud.fore ? this._pumpFore.copy(ud.fore).setZ(ud.fore.z + ud.pump.position.z) : ud.fore);
      const special = this.specialLeft();          // grapple / stim pose (or null)
      this.launcher.visible = false; this.injector.visible = false; this.vmNade.visible = false;
      if (spin && !(special && special.w > 0.05)) {
        // empty left fist, mirroring the knife hand (like CS)
        L.hand.visible = false;
        const P = this.pos;                    // follows bob/sway/landing, not the knife's slashes
        KH.L.position.set(-P.x.v - 0.1 * s, P.y.v - 0.05, P.z.v + 0.02);
        const LX = this._sx.set(0.9, -0.35, 0.2).normalize(), LZ = this._sz.set(-0.35, -0.9, -0.15).normalize();
        LZ.addScaledVector(LX, -LZ.dot(LX)).normalize();
        KH.L.quaternion.setFromRotationMatrix(this._sm.makeBasis(LX, this._sy.crossVectors(LZ, LX), LZ));
        KH.L.visible = true;
        this.limb(L.fore, KH.L.localToWorld(new THREE.Vector3(0, 0, 0.075)), this._sv.set(-0.3 * s, -0.7, -0.45), 0.72);
        return;
      }
      if ((!lt || leftHidden) && !special) { L.hand.visible = L.fore.visible = false; return; }
      if (lt && !leftHidden) {
        const lp = model.localToWorld(this._v.copy(lt));
        L.hand.position.copy(lp);
        L.hand.quaternion.copy(wq).multiply(this._qFore || (this._qFore = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, Math.PI, 'YXZ'))));
        L.hand.translateY(0.024);
      } else {
        // no off hand on this weapon (karambit): come in from below the screen
        L.hand.position.set(-0.3, -0.62, -0.25);
        L.hand.quaternion.copy(special.q);
      }
      if (special) {
        L.hand.position.lerp(special.p, special.w);
        L.hand.quaternion.slerp(special.q, special.w);
        this.launcher.visible = special.kind === 'grapple' && special.w > 0.05;
        if (special.kind === 'throw' && special.held) {
          this.vmNade.visible = true;
          this.vmNade.position.copy(L.hand.position).add(this._v2.set(0, -0.03, -0.055).multiplyScalar(1.3).applyQuaternion(L.hand.quaternion));
          BR.Models.animate(this.vmNade, performance.now() / 1000);
        }
        if (special.kind === 'stim') {
          // pen injector held in the fist, needle along the hand's X axis
          this.injector.visible = special.w > 0.05;
          this.injector.position.copy(L.hand.position).add(this._v2.set(0, -0.026, -0.05).multiplyScalar(1.3).applyQuaternion(L.hand.quaternion));
          this.injector.quaternion.copy(L.hand.quaternion);
          this.injector.userData.cap.visible = special.capOn;
        }
      }
      L.hand.visible = true;
      const elbowL = new THREE.Vector3(U.lerp(-0.28, -0.16, A) * s, U.lerp(-0.6, -0.52, A), -0.06);
      if (special) elbowL.lerp(this._v2.set(-0.34, -0.7, 0.05), special.w);
      this.limb(L.fore, L.hand.localToWorld(new THREE.Vector3(0, 0, 0.05)), elbowL);
      // where the grapple rope leaves the launcher, mapped into the game camera's world
      if (this.launcher.visible) {
        const tip = this.launcher.userData.tip.getWorldPosition(this._v);
        tip.project(this.camera);
        const gc = this.game.camera, dir = this._v2.set(tip.x, tip.y, 0.5).unproject(gc).sub(gc.position).normalize();
        this.ropeFrom.copy(gc.position).addScaledVector(dir, 0.7);
        this.ropeValid = true;
      }
    }

    // ---- grapple + stim poses for the left hand (camera space) ----------------
    // Returns {kind, w, p, q, capOn} or null.
    specialLeft() {
      const B = (X, Zref, out) => {          // basis: hand X axis + wrist direction hint -> quaternion
        const Z = this._sz.copy(Zref); Z.addScaledVector(X, -Z.dot(X)).normalize();
        const Y = this._sy.crossVectors(Z, X);
        return out.setFromRotationMatrix(this._sm.makeBasis(X, Y, Z));
      };
      if (this.throwT > 0) {
        // grenade throw: hand comes up behind the shoulder line, then whips forward and releases
        const k = 1 - this.throwT / this.throwDur, q = this._sq1;
        const up = smooth(k / 0.35), fwd = smooth((k - 0.4) / 0.22), out = smooth((k - 0.7) / 0.3);
        const p = this._spo.set(-0.3, -0.55, -0.2).lerp(this._sv.set(-0.15, -0.06, -0.24), up).lerp(this._sx.set(-0.05, -0.02, -0.62), fwd).lerp(this._sy.set(-0.25, -0.5, -0.3), out);
        const X = this._sx.set(0.3, 1, 0.2).normalize();
        const Z = this._sz.set(-0.3, -0.4, 0.85).lerp(this._sv.set(-0.1, -0.2, 0.97), fwd); Z.addScaledVector(X, -Z.dot(X)).normalize();
        q.setFromRotationMatrix(this._sm.makeBasis(X, this._sy.crossVectors(Z, X), Z));
        return { kind: 'throw', w: Math.min(1, Math.min(k / 0.12, (1 - k) / 0.2)), p, q, held: k < 0.58 };
      }
      if (this.stimW > 0.01) {
        const k = this.stimK, q = this._sq1;
        // enter from below -> present the pen and flick the cap -> turn the needle on yourself ->
        // stab it into the left side of the chest, press, hold -> pull it out and drop it away
        const P0 = this._sp0.set(-0.28, -0.6, -0.22), P1 = this._sp1.set(-0.1, -0.1, -0.36);
        const present = smooth(k / 0.16), aim = smooth((k - 0.28) / 0.12), stab = smooth((k - 0.42) / 0.05), out = smooth((k - 0.7) / 0.14);
        // needle (+X of the fist): down-forward while presenting, then turned back onto your chest
        const needle = this._sx.set(0.25, -0.6, -0.75).normalize().lerp(this._sv.set(0.12, -0.35, 0.93), aim).normalize();
        B(needle, this._sv.set(-0.6, -0.5, 0.2), q);
        // solve the hand so the needle tip lands on the left chest (body space, before the look-down tilt)
        const tipOff = this._sp2.set(0.117, -0.034, -0.065).applyQuaternion(q);
        const chest = this._sy.set(-0.15, -0.2, -0.2);
        const wind = this._sz.copy(chest).addScaledVector(needle, -0.1).sub(tipOff);
        const p = this._spo.copy(P0).lerp(P1, present).lerp(wind, aim);
        p.addScaledVector(needle, 0.112 * stab);                                            // drive it in
        if (k > 0.47 && k < 0.7) p.add(this._sv.set((Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.003, 0));   // pressing
        p.lerp(this._sv.set(-0.3, -0.62, -0.2), out);
        if (k > 0.2 && k < 0.3) p.y += Math.sin((k - 0.2) / 0.1 * Math.PI) * 0.015;        // cap flick
        p.x += Math.sin(k * 9) * 0.005 * (1 - aim);
        // you look down at your chest for the stab: rotate the pose into the tilted view
        const qa = this._sq2.setFromAxisAngle(this._sv.set(1, 0, 0), this.lookDown);
        p.applyQuaternion(qa); q.premultiply(qa);
        return { kind: 'stim', w: this.stimW, p, q, capOn: k < 0.26, press: stab };
      }
      if (this.grapW > 0.01) {
        // arm thrown out toward the hook, fingers pointing at it, launcher on the wrist
        const g = this.game, m = g.player.mover, cam = g.camera;
        const d = this._sx.set(0, 0, -1);
        if (m.grapple) {
          d.set(m.grapple.x, m.grapple.y, m.grapple.z).sub(cam.position).normalize()
            .applyQuaternion(this._sq2.copy(cam.quaternion).invert());
          if (d.z > -0.35) { d.z = -0.35; d.normalize(); }
        }
        d.x = U.clamp(d.x, -0.6, 0.45); d.y = U.clamp(d.y, -0.35, 0.7); d.normalize();
        const fire = this.grapT > 0 ? Math.sin(U.clamp(1 - this.grapT / 0.3, 0, 1) * Math.PI) : 0;
        const p = this._spo.set(-0.16 + d.x * 0.1, -0.12 + d.y * 0.09, -0.4)
          .addScaledVector(d, 0.05 - fire * 0.04);                                                    // recoil kicks the hand back
        if (m.grapple) p.add(this._sv.set((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004, Math.min(0.06, m.grapple.t * 0.05)));   // rope tension
        // fingers along -Z point at the hook: Z = -d; back of the hand up
        const q = this._sq1, Z = this._sz.copy(d).negate(), Y = this._sy.set(0.15, 1, 0); Y.addScaledVector(Z, -Y.dot(Z)).normalize();
        const X = this._sv.crossVectors(Y, Z);
        q.setFromRotationMatrix(this._sm.makeBasis(X, Y, Z));
        return { kind: 'grapple', w: this.grapW, p, q };
      }
      return null;
    }

    // ---- viewmodel VFX (signature reloads): additive sparks + an expanding glow ring
    vfx(at, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const s = this.sparks[this.spi++ % this.sparks.length];
        s.m.position.copy(at); s.v.set(Math.random() - 0.5, Math.random() * 0.8 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
        s.m.material.color.setHex(Math.random() < 0.25 ? 0xffffff : color); s.life = s.max = 0.35 + Math.random() * 0.3; s.m.visible = true;
      }
    }
    ringFx(at, color) {
      const r = this.rings[this.rgi++ % this.rings.length];
      r.m.position.copy(at); r.m.lookAt(0, 0, 0); r.m.material.color.setHex(color); r.life = r.max = 0.4; r.m.visible = true;
    }
    updateVfx(dt) {
      for (const s of this.sparks) {
        if (s.life <= 0) continue;
        s.life -= dt; if (s.life <= 0) { s.m.visible = false; continue; }
        s.v.y -= 2.5 * dt; s.m.position.addScaledVector(s.v, dt);
        const k = s.life / s.max; s.m.scale.setScalar(0.006 + 0.008 * k); s.m.material.opacity = k;
      }
      for (const r of this.rings) {
        if (r.life <= 0) continue;
        r.life -= dt; if (r.life <= 0) { r.m.visible = false; continue; }
        const k = 1 - r.life / r.max; r.m.scale.setScalar(0.02 + k * 0.16); r.m.material.opacity = (1 - k) * 0.9;
      }
    }

    // a swish each time a flip phase passes
    bflySwish(t, marks) {
      for (const m of marks) if (this.lastBflyT < m && t >= m) BR.Audio.swish(false);
      this.lastBflyT = t;
    }

    onGrapple() { this.grapT = 0.3; }
    onThrow() { this.throwT = this.throwDur = 0.42; }
    onStim() { this.stimT = this.stimDur = 0.95; this.lastStimK = 0; }

    limb(mesh, a, b, thick) {
      const d = this._d || (this._d = new THREE.Vector3());
      d.subVectors(b, a);
      const len = d.length();
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(this._up || (this._up = new THREE.Vector3(0, 1, 0)), d.normalize());
      mesh.scale.set(thick || 1, len, thick || 1);
      mesh.visible = true;
    }
  };
})();
