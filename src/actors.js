'use strict';
// =============================================================================
// ACTOR — anything that can move, shoot and die. The player and every bot are
// Actors; bots just get a `brain` (see bot.js) that fills in their input.
// =============================================================================
const SHARED = {};
function sharedGeo() {
  if (SHARED.ready) return SHARED;
  SHARED.torso = new THREE.BoxGeometry(0.62, 0.72, 0.36);
  SHARED.hips = new THREE.BoxGeometry(0.56, 0.22, 0.32);
  SHARED.leg = new THREE.BoxGeometry(0.22, 0.78, 0.26);
  SHARED.head = new THREE.BoxGeometry(0.36, 0.36, 0.36);
  SHARED.visor = new THREE.BoxGeometry(0.30, 0.10, 0.04);
  SHARED.gun = new THREE.BoxGeometry(0.1, 0.12, 0.62);
  SHARED.pack = new THREE.BoxGeometry(0.42, 0.46, 0.18);
  SHARED.dark = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  SHARED.visorMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  SHARED.ready = true;
  return SHARED;
}

BR.Actor = class Actor {
  constructor(game, opts) {
    const A = BR.CONFIG.actor;
    this.game = game;
    this.id = opts.id;
    this.name = opts.name;
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color || 0xcccccc;
    this.mover = new BR.Mover(game.world);
    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.health = A.maxHealth;
    this.shield = 0;
    this.alive = true;
    this.slots = [null, null, BR.Weapons.create('knife')]; // 2 guns + the karambit you always carry
    this.cur = 2;
    this.grappleCd = 0;
    this.lunge = null;
    this.ammo = { light: 0, heavy: 0, shells: 0 };
    this.kills = 0;
    this.damageDealt = 0;
    this.fireHeld = false;
    this.ads = false;
    this.lastAttacker = null;
    this.lastHurtT = -99;
    this.deathT = 0;
    this.input = { mx: 0, mz: 0, jump: false, crouch: false, speedMult: 1 };
    this.brain = null;
    this.pickupT = Math.random() * 0.1;
    this.mesh = this.isPlayer ? null : this.buildMesh();
  }

  get weapon() { return this.slots[this.cur]; }
  get pos() { return this.mover.pos; }

  eye(out) {
    const m = this.mover;
    return out.set(m.pos.x, m.pos.y + m.h - BR.CONFIG.actor.eyeFromTop, m.pos.z);
  }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // The two gun slots (index 0 and 1). Slot 2 is always the karambit.
  guns() { return this.slots.slice(0, 2); }

  // Put a gun in an empty gun slot and switch to it. Returns the slot index or -1.
  giveWeapon(id, mag) {
    for (let i = 0; i < 2; i++) {
      if (!this.slots[i]) {
        this.slots[i] = BR.Weapons.create(id, mag);
        this.switchTo(i);
        return i;
      }
    }
    return -1;
  }

  hasWeapon(id) { return this.guns().some(s => s && s.id === id); }

  // Fire the grapple along the aim. Returns true if it hooked something.
  tryGrapple() {
    const G = BR.CONFIG.move.grapple, m = this.mover;
    if (this.grappleCd > 0 || m.grapple || m.dropping) return false;
    const e = this.eye(this._ge || (this._ge = new THREE.Vector3()));
    const d = this.aimDir(this._gd || (this._gd = new THREE.Vector3()));
    // Anything solid works: buildings, rocks, the ground, tree canopies, other players
    const h = this.game.hitscan(this, e, d, G.range);
    let t = h.t, target = h.actor;
    const tt = this.game.world.raycastTrees(e.x, e.y, e.z, d.x, d.y, d.z, t);
    if (tt < t) { t = tt; target = null; }
    if (t >= G.range - 0.01) return false;
    m.startGrapple(e.x + d.x * t, e.y + d.y * t, e.z + d.z * t, target);
    return true;
  }

  switchTo(i) {
    if (i === this.cur || !this.slots[i]) return false;
    const w = this.weapon;
    if (w) w.reloadT = 0;
    this.cur = i;
    this.slots[i].cool = Math.max(this.slots[i].cool, 0.25);
    this.ads = false;
    return true;
  }

  update(dt) {
    if (!this.alive) return;
    const w = this.weapon;
    this.input.speedMult = w && w.def.speedMult ? w.def.speedMult : 1;
    const hooked = !!this.mover.grapple;
    this.mover.update(dt, this.input, this.yaw);
    if (hooked && !this.mover.grapple) this.grappleCd = BR.CONFIG.move.grapple.cooldown;
    if (!this.mover.grapple && this.grappleCd > 0) this.grappleCd -= dt;
    this.input.jump = false;
    this.input.crouch = false;
    // Karambit lunge: land the hit once we're close enough
    if (this.lunge) {
      const L = this.lunge, t = L.target;
      L.t -= dt;
      if (!t.alive || L.t <= 0) this.lunge = null;
      else if (t.pos.distanceTo(this.pos) < this.slots[2].def.range) { BR.Weapons.meleeHit(this.game, this, t, this.slots[2]); this.lunge = null; }
    }
    if (this.recoil > 0) {
      const k = Math.min(this.recoil, this.recoil * 14 * dt + 0.0005);
      this.pitch = Math.min(1.45, this.pitch + k);
      this.recoil -= k;
    }
    for (const w of this.slots) if (w) BR.Weapons.update(w, dt, this);
    if (this.fireHeld) BR.Weapons.tryFire(this.game, this);
    if (this.mesh) this.syncMesh(dt);
  }

  heal(amount) {
    const max = BR.CONFIG.actor.maxHealth;
    if (this.health >= max) return false;
    this.health = Math.min(max, this.health + amount);
    return true;
  }

  addShield(amount) {
    const max = BR.CONFIG.actor.maxShield;
    if (this.shield >= max) return false;
    this.shield = Math.min(max, this.shield + amount);
    return true;
  }

  // Shield soaks damage first. bypassShield is used by the zone.
  takeDamage(amount, bypassShield) {
    let left = amount;
    if (!bypassShield && this.shield > 0) {
      const s = Math.min(this.shield, left);
      this.shield -= s;
      left -= s;
    }
    this.health -= left;
    return this.health <= 0;
  }

  // ---------------------------------------------------------------- visuals
  buildMesh() {
    // Hierarchy: body > hips, two legs pivoting at the hip, and an upper body
    // (torso, head, pack, gun) pivoting at the waist — so poses read clearly.
    const S = sharedGeo();
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: this.color });
    const body = new THREE.Group();
    const hips = new THREE.Mesh(S.hips, S.dark); hips.position.y = 0.74;
    const leg = x => { const p = new THREE.Group(); p.position.set(x, 0.8, 0); const m = new THREE.Mesh(S.leg, S.dark); m.position.y = -0.4; p.add(m); return p; };
    const l1 = leg(-0.15), l2 = leg(0.15);
    const upper = new THREE.Group(); upper.position.y = 0.78;
    const torso = new THREE.Mesh(S.torso, mat); torso.position.y = 0.3;
    const head = new THREE.Mesh(S.head, mat); head.position.y = 0.86;
    const visor = new THREE.Mesh(S.visor, S.visorMat); visor.position.set(0, 0.88, -0.19);
    const pack = new THREE.Mesh(S.pack, S.dark); pack.position.set(0, 0.32, 0.26);
    const gun = new THREE.Group(); gun.position.set(0.26, 0.4, -0.2);   // holds the real weapon model
    upper.add(torso, head, visor, pack, gun);
    body.add(hips, l1, l2, upper);
    g.add(body);
    const chute = BR.Models.parachute(this.color, 0xf2f2f2);
    chute.position.y = 1.5; chute.visible = false;
    g.add(chute);
    g.userData = { body, upper, l1, l2, gun, mat, chute, t: 0 };
    return g;
  }

  syncMesh(dt) {
    const m = this.mover, u = this.mesh.userData, U = BR.util;
    this.mesh.position.copy(m.pos);
    const sp = m.speedH;
    // While sliding the body faces where it's going and the upper body twists to keep aiming
    const velYaw = Math.atan2(-m.vel.x, -m.vel.z);
    const faceYaw = m.sliding && sp > 1 ? velYaw : this.yaw;
    this.mesh.rotation.y = faceYaw;
    u.upper.rotation.y = U.damp(u.upper.rotation.y, m.sliding ? U.clamp(U.wrapAngle(this.yaw - faceYaw), -1.1, 1.1) : 0, 14, dt);
    u.t += dt * sp * 1.5;
    let l1 = 0, l2 = 0, lean = 0, bodyY = 0, bodyX = 0;
    if (m.dropping && !m.chute) {                 // freefall: flat, limbs spread
      bodyX = -1.35; bodyY = 0.9; l1 = 0.35; l2 = 0.5; lean = -0.2;
    } else if (m.dropping) {                      // under canopy: upright, legs dangling
      const sw = Math.sin(performance.now() / 400) * 0.15; l1 = 0.2 + sw; l2 = 0.25 - sw;
    } else if (m.sliding) {                       // clean slide: lead leg out straight, trail leg tucked, torso back
      bodyY = -0.42; l1 = -1.4; l2 = -0.85; lean = 0.5;
    } else if (m.crouched) {
      bodyY = -0.32; l1 = -0.9; l2 = -0.5; lean = 0.25;
    } else if (!m.onGround) {                     // jump: knees up a bit
      l1 = -0.5; l2 = 0.2; lean = 0.05;
    } else {                                      // run cycle
      const a = Math.min(0.75, sp * 0.085);
      l1 = Math.sin(u.t) * a; l2 = -Math.sin(u.t) * a; lean = Math.min(sp * 0.012, 0.12);
    }
    u.l1.rotation.x = U.damp(u.l1.rotation.x, l1, 16, dt);
    u.l2.rotation.x = U.damp(u.l2.rotation.x, l2, 16, dt);
    u.upper.rotation.x = U.damp(u.upper.rotation.x, lean, 12, dt);
    u.body.rotation.x = U.damp(u.body.rotation.x, bodyX, 8, dt);
    u.body.position.y = U.damp(u.body.position.y, bodyY, 12, dt);
    u.body.rotation.z = U.damp(u.body.rotation.z, m.wallRunning ? 0.35 * (m.wallN.x + m.wallN.z) : m.sliding ? 0.12 : 0, 10, dt);
    u.gun.rotation.x = -this.pitch * 0.6 - u.upper.rotation.x;
    u.chute.visible = !!(m.dropping && m.chute);
    if (u.chute.visible) u.chute.rotation.z = Math.sin(performance.now() / 700) * 0.06;
    // Show the gun this bot is actually holding
    const wid = this.weapon ? this.weapon.id : null;
    if (u.wid !== wid) {
      u.wid = wid;
      while (u.gun.children.length) u.gun.remove(u.gun.children[0]);
      if (wid) { const gm = BR.Models.worldWeapon(wid); gm.scale.setScalar(wid === 'knife' ? 1.6 : 1.15); u.gun.add(gm); }
    }
  }

  // Flash white briefly on hit
  flash() {
    if (!this.mesh) return;
    const mat = this.mesh.userData.mat;
    mat.emissive.setHex(0xffffff);
    mat.emissiveIntensity = 0.7;
    clearTimeout(this._flashTO);
    this._flashTO = setTimeout(() => { mat.emissive.setHex(0x000000); }, 70);
  }

  // Ragdoll-lite: topple over
  dieVisual() {
    if (!this.mesh) return;
    const u = this.mesh.userData;
    u.body.rotation.x = -Math.PI / 2; u.body.position.y = 0.2;
    u.chute.visible = false;
  }
};
