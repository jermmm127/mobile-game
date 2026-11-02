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
      this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
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
        const m = BR.Models.weapon(id, eq.skins, id === 'knife' ? 'none' : eq.charms, bp);
        const holder = new THREE.Group();
        if (id === 'knife') {
          m.rotation.set(0.15, 0.25, -0.5); m.scale.setScalar(1.35);
          // Pivot at the finger ring so the karambit twirls around it
          m.updateMatrix();
          const P = new THREE.Vector3(0, 0.036, 0.152).applyMatrix4(m.matrix);
          const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion).normalize();
          const spin = new THREE.Group();
          spin.position.copy(P); m.position.sub(P);
          spin.add(m); holder.add(spin);
          holder.userData.spin = { obj: spin, axis };
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
      this.lastWeapon = null;
    }

    // ---- events from the game -------------------------------------------
    onFire(w) {
      const d = w.def, a = 1 - this.adsW * 0.65, auto = d.rpm >= 500;
      const r = (Math.random() - 0.5);
      this.kick.z.vel += (d.recoil * 9 + 0.35) * a;                   // straight back
      this.kick.y.vel += (d.recoil * 2.2 + 0.05) * a;
      this.kickR.x.vel += (d.recoil * 30 + 0.8) * a;                  // muzzle climb
      this.kickR.z.vel += r * (auto ? 1.2 : 0.6) * a;                 // random roll
      this.kickR.y.vel += r * (auto ? 0.6 : 0.25) * a;
      this.flashT = d.suppressed ? 0.025 : 0.05;
      this.inspectT = 0;
    }
    onMelee() { this.swingT = 0.42; this.swingDir *= -1; this.inspectT = 0; }
    onShell() { this.shellT = 0.2; }
    onLand(speed) { this.pos.y.vel -= Math.min(1.6, speed * 0.07); this.rot.x.vel -= Math.min(2, speed * 0.08); }
    startInspect(w) { if (!w) return; this.inspectDur = this.inspectT = w.def.melee ? 2.4 : 2.1; }

    hide() { this.root.visible = false; for (const s of ['R', 'L']) { this.arms[s].hand.visible = this.arms[s].fore.visible = false; } }

    // ---- per frame ------------------------------------------------------------
    update(dt, lookDX, lookDY) {
      const game = this.game, p = game.player, w = p.weapon, m = p.mover, Mv = BR.CONFIG.move;
      for (const id in this.models) this.models[id].visible = false;
      if (!w || m.dropping || (p.ads && w.def.scope)) { this.hide(); return; }
      this.root.visible = true;
      const holder = this.models[w.id], model = holder.userData.model, ud = model.userData, def = w.def;
      holder.visible = true;

      // New weapon in hand: draw animation
      if (w !== this.lastWeapon) {
        this.lastWeapon = w;
        this.drawDur = this.drawT = def.melee ? 1.05 : 0.55;
        this.inspectT = 0; this.spinSwish = 0; this.lastReloadK = 0;
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
      if (def.melee) { hx = 0.16 * s; hy = -0.13; hz = -0.36; }
      if (ud.sight && !def.scope) { const sg = ud.sight.position; ax = -sg.x; ay = -sg.y; az = -(ud.sightDist || 0.3) - sg.z; }
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
      let leftTarget = null, magOff = null, magVis = true, spinAng = 0, leftHidden = !!def.melee;
      // Draw
      if (this.drawT > 0) {
        const t = 1 - this.drawT / this.drawDur;
        if (def.melee) {
          // CS-style karambit deploy: snap into view, twirl twice around the ring, settle
          const rise = smooth(t / 0.14), out = 1 - smooth((t - 0.7) / 0.3);
          oy += -(1 - rise) * 0.16 + out * rise * 0.06;
          ox += -out * rise * 0.06; oz += -out * 0.14;
          orz += -out * 0.3; orx += out * 0.15;
          spinAng = easeInOut((t - 0.08) / 0.72) * Math.PI * 4;
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
        if (def.melee) {
          spinAng = easeInOut(t / 0.42) * Math.PI * 4;
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

      // Karambit ring twirl
      if (holder.userData.spin) holder.userData.spin.obj.quaternion.setFromAxisAngle(holder.userData.spin.axis, -spinAng);
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

      this.placeArms(holder, model, ud, leftTarget, leftHidden);
    }

    // Hands follow anchors on the weapon; sleeves run from the wrist to an elbow
    // point just off-screen, so it reads as two arms holding the gun.
    placeArms(holder, model, ud, leftTarget, leftHidden) {
      this.root.updateMatrixWorld(true);
      const A = this.adsW, s = this.scale;
      const R = this.arms.R, L = this.arms.L;
      let wq = model.getWorldQuaternion(this._q);
      // right hand on the grip (palm against the grip's right side, fingers wrapping the front)
      let gp = model.localToWorld(this._v.copy(ud.grip));
      const spin = holder.userData.spin;
      if (spin) {
        // Karambit: the index finger stays in the ring while the knife twirls around it
        gp = spin.obj.getWorldPosition(this._v).add(this._v2.set(0.01, -0.035, 0.02));
        wq = holder.getWorldQuaternion(this._q).multiply(this._qKn || (this._qKn = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0.3, -0.6))));
      }
      R.hand.position.copy(gp);
      R.hand.quaternion.copy(wq).multiply(this._qGrip || (this._qGrip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, -Math.PI / 2))));
      R.hand.translateX(0.0); R.hand.translateY(0.026); R.hand.translateZ(0.012);
      R.hand.visible = true;
      const elbowR = this._v2.set(U.lerp(0.3, 0.2, A) * s, U.lerp(-0.62, -0.55, A), 0.08);
      this.limb(R.fore, R.hand.localToWorld(new THREE.Vector3(0, 0, 0.05)), elbowR);
      // left hand on the foregrip / mag / charging handle
      const lt = leftTarget || ud.fore;
      if (!lt || leftHidden) { L.hand.visible = L.fore.visible = false; return; }
      const lp = model.localToWorld(this._v.copy(lt));
      L.hand.position.copy(lp);
      L.hand.quaternion.copy(wq).multiply(this._qFore || (this._qFore = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, Math.PI, 'YXZ'))));
      L.hand.translateY(0.024);
      L.hand.visible = true;
      const elbowL = new THREE.Vector3(U.lerp(-0.28, -0.16, A) * s, U.lerp(-0.6, -0.52, A), -0.06);
      this.limb(L.fore, L.hand.localToWorld(new THREE.Vector3(0, 0, 0.05)), elbowL);
    }

    limb(mesh, a, b) {
      const d = this._d || (this._d = new THREE.Vector3());
      d.subVectors(b, a);
      const len = d.length();
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(this._up || (this._up = new THREE.Vector3(0, 1, 0)), d.normalize());
      mesh.scale.set(1, len, 1);
      mesh.visible = true;
    }
  };
})();
