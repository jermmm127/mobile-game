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
    this.slots = [null, null];
    this.cur = 0;
    this.ammo = { light: 0, heavy: 0, shells: 0 };
    this.kills = 0;
    this.damageDealt = 0;
    this.fireHeld = false;
    this.ads = false;
    this.lastAttacker = null;
    this.lastHurtT = -99;
    this.deathT = 0;
    this.input = { mx: 0, mz: 0, jump: false, slide: false };
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

  // Put a weapon in an empty slot. Returns the slot index or -1.
  giveWeapon(id, mag) {
    for (let i = 0; i < 2; i++) {
      if (!this.slots[i]) {
        this.slots[i] = BR.Weapons.create(id, mag);
        if (!this.slots[this.cur]) this.cur = i;
        if (this.isPlayer || !this.slots[this.cur]) this.cur = i;
        return i;
      }
    }
    return -1;
  }

  hasWeapon(id) { return this.slots.some(s => s && s.id === id); }

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
    this.mover.update(dt, this.input, this.yaw);
    this.input.jump = false;
    this.input.slide = false;
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
    const S = sharedGeo();
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: this.color });
    const body = new THREE.Group();
    const torso = new THREE.Mesh(S.torso, mat); torso.position.y = 1.08;
    const hips = new THREE.Mesh(S.hips, S.dark); hips.position.y = 0.72;
    const l1 = new THREE.Mesh(S.leg, S.dark); l1.position.set(-0.15, 0.39, 0);
    const l2 = new THREE.Mesh(S.leg, S.dark); l2.position.set(0.15, 0.39, 0);
    const head = new THREE.Mesh(S.head, mat); head.position.y = 1.64;
    const visor = new THREE.Mesh(S.visor, S.visorMat); visor.position.set(0, 1.66, -0.19);
    const pack = new THREE.Mesh(S.pack, S.dark); pack.position.set(0, 1.1, 0.26);
    const gun = new THREE.Mesh(S.gun, S.dark); gun.position.set(0.26, 1.18, -0.38);
    body.add(torso, hips, l1, l2, head, visor, pack, gun);
    g.add(body);
    g.userData = { body, l1, l2, gun, mat, t: 0 };
    return g;
  }

  syncMesh(dt) {
    const m = this.mover, u = this.mesh.userData;
    this.mesh.position.copy(m.pos);
    this.mesh.rotation.y = this.yaw;
    const sp = m.speedH;
    u.t += dt * sp * 1.6;
    const swing = m.onGround && !m.sliding ? Math.sin(u.t) * Math.min(0.7, sp * 0.08) : 0.3;
    u.l1.rotation.x = swing; u.l2.rotation.x = -swing;
    // Lean back while sliding, spread out while skydiving
    const tilt = m.sliding ? 0.9 : m.dropping ? -1.2 : 0;
    u.body.rotation.x = BR.util.damp(u.body.rotation.x, tilt, 12, dt);
    u.body.position.y = BR.util.damp(u.body.position.y, m.sliding ? -0.25 : 0, 12, dt);
    // Lean into wall-runs
    u.body.rotation.z = BR.util.damp(u.body.rotation.z, m.wallRunning ? 0.35 * (m.wallN.x + m.wallN.z) : 0, 10, dt);
    u.gun.rotation.x = -this.pitch * 0.6;
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
    this.mesh.userData.body.rotation.x = -Math.PI / 2;
    this.mesh.userData.body.position.y = 0.2;
  }
};
