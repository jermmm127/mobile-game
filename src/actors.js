'use strict';
// =============================================================================
// ACTOR — anything that can move, shoot and die. The player and every bot are
// Actors; bots just get a `brain` (see bot.js) that fills in their input.
// =============================================================================
const SHARED = {};
// Merge the meshes that sit directly in the same joint group and share a material into one
// mesh (geometry baked into the group's space). Joints keep animating; far fewer draw calls.
function collapseMeshes(group, skip) {
  for (const ch of group.children.slice()) if (!ch.isMesh && ch !== skip) collapseMeshes(ch, skip);
  const byMat = new Map();
  for (const ch of group.children) if (ch.isMesh && !ch.isInstancedMesh) { if (!byMat.has(ch.material)) byMat.set(ch.material, []); byMat.get(ch.material).push(ch); }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    let n = 0; const parts = list.map(m => { m.updateMatrix(); const gg = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); n += gg.attributes.position.count; return gg; });
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
    for (const gg of parts) { P.set(gg.attributes.position.array, o * 3); if (!gg.attributes.normal) gg.computeVertexNormals(); N.set(gg.attributes.normal.array, o * 3); o += gg.attributes.position.count; gg.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.computeBoundingSphere();
    for (const m of list) group.remove(m);
    group.add(new THREE.Mesh(geo, mat));
  }
}
const _ikA = new THREE.Vector3(), _ikB = new THREE.Vector3(), _ikC = new THREE.Vector3(), _ikV = new THREE.Vector3();
const _ikD = new THREE.Vector3(), _ikE = new THREE.Vector3(), _ikP = new THREE.Vector3(), _ikQ = new THREE.Quaternion();
const _DOWN = new THREE.Vector3(0, -1, 0);
const ARM_L1 = 0.28, ARM_L2 = 0.27;
// Two-bone IK: rotate shoulder + elbow so the hand (at the end of the forearm) reaches
// `target` (in the upper-body space the shoulder lives in). Elbow points down/out.
function solveArm(arm, target, side) {
  const d = _ikD.copy(target).sub(arm.sh.position);
  let len = d.length();
  if (len < 1e-4) return;
  d.divideScalar(len);
  len = Math.min(Math.max(len, 0.12), ARM_L1 + ARM_L2 - 0.002);
  const a1 = Math.acos(Math.min(1, Math.max(-1, (ARM_L1 * ARM_L1 + len * len - ARM_L2 * ARM_L2) / (2 * ARM_L1 * len))));
  // pole (elbow hint) projected perpendicular to the reach direction
  const pole = _ikP.set(side * 0.7, -1, 0.25);
  pole.addScaledVector(d, -pole.dot(d)).normalize();
  const upperDir = _ikE.copy(d).multiplyScalar(Math.cos(a1)).addScaledVector(pole, Math.sin(a1));
  arm.sh.quaternion.setFromUnitVectors(_DOWN, upperDir);
  // forearm: from elbow to the target, expressed in the shoulder's rotated space
  const elbow = upperDir.multiplyScalar(ARM_L1);
  const fore = _ikV.copy(d).multiplyScalar(len).sub(elbow).normalize();
  fore.applyQuaternion(_ikQ.copy(arm.sh.quaternion).invert());
  arm.el.quaternion.setFromUnitVectors(_DOWN, fore);
}
function sharedGeo() {
  if (SHARED.ready) return SHARED;
  const cyl = (r1, r2, len, seg) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg || 8); g.translate(0, -len / 2, 0); g._shared = true; return g; }; // hangs down from its joint
  SHARED.thigh = cyl(0.085, 0.068, 0.44);
  SHARED.shin = cyl(0.064, 0.05, 0.42);
  SHARED.boot = new THREE.BoxGeometry(0.12, 0.08, 0.24);
  SHARED.upperArm = cyl(0.056, 0.048, 0.28);
  SHARED.forearm = cyl(0.046, 0.04, 0.26);
  SHARED.hand = new THREE.SphereGeometry(0.045, 8, 6);
  SHARED.hips = BR.roundedBox(0.34, 0.16, 0.22);
  SHARED.abdomen = new THREE.CylinderGeometry(0.15, 0.13, 0.22, 10);
  SHARED.chest = new THREE.CylinderGeometry(0.21, 0.15, 0.34, 10);
  SHARED.vest = BR.roundedBox(0.34, 0.27, 0.07);
  SHARED.neck = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8);
  SHARED.head = new THREE.SphereGeometry(0.12, 12, 10);
  SHARED.helmet = new THREE.SphereGeometry(0.135, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  SHARED.visor = new THREE.BoxGeometry(0.18, 0.045, 0.04);
  SHARED.pack = BR.roundedBox(0.3, 0.36, 0.14);
  SHARED.shoulder = new THREE.SphereGeometry(0.075, 8, 6);
  for (const k in SHARED) if (SHARED[k] && SHARED[k].isBufferGeometry) SHARED[k]._shared = true;
  SHARED.dark = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  SHARED.boots = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  SHARED.gloves = new THREE.MeshLambertMaterial({ color: 0x23262b });
  SHARED.visorMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  SHARED.skins = [0xf1c7a1, 0xd9a27a, 0xb07a52, 0x7d5236, 0x5a3a26].map(c => new THREE.MeshLambertMaterial({ color: c }));
  SHARED.ready = true;
  return SHARED;
}
const dampAngle = (a, b, k, dt) => a + BR.util.wrapAngle(b - a) * (1 - Math.exp(-k * dt));

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
    // 2 guns + the knife you always carry (yours: bayonet, karambit or butterfly, whichever you equipped)
    this.slots = [null, null, BR.Weapons.create(opts && opts.isPlayer && BR.Profile && BR.Profile.data ? (BR.Profile.data.equip.melee || 'bayonet') : 'bayonet')];
    this.cur = 2;
    this.grappleCd = 0;
    this.stimCd = 0; this.stimT = 0; this.stimHealT = 0; this.stimAcc = 0;
    this.nades = 0; this.nadeCd = 0;      // shockwave grenades carried
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
  giveWeapon(id, mag, rar) {
    for (let i = 0; i < 2; i++) {
      if (!this.slots[i]) {
        this.slots[i] = BR.Weapons.create(id, mag, rar);
        this.switchTo(i);
        return i;
      }
    }
    return -1;
  }

  hasWeapon(id) { return this.guns().some(s => s && s.id === id); }

  // Stim shot: speed boost + heal ticks. Returns true if it was used.
  tryStim() {
    const C = BR.CONFIG.stim;
    if (!this.alive || this.stimCd > 0 || this.mover.dropping) return false;
    this.stimCd = C.cooldown;
    this.stimT = C.speedTime;
    this.stimHealT = C.healTime;
    this.stimAcc = 0;
    return true;
  }

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
    if (this.netProxy) { this.netProxy.apply(this, dt); return; }     // v1.12: a remote player / remote bot (net.js)
    if (!this.alive) return;
    const w = this.weapon;
    this.input.speedMult = w && w.def.speedMult ? w.def.speedMult : 1;
    if (this.zSlowT > 0) this.input.speedMult *= 0.55;          // slowed by a zombie boss (scream / roar)
    // Stim: boost + heal 10 ticks a second
    const SC = BR.CONFIG.stim;
    if (this.stimCd > 0) this.stimCd = Math.max(0, this.stimCd - dt);
    if (this.stimT > 0) { this.stimT = Math.max(0, this.stimT - dt); this.input.speedMult *= SC.speedMult; }
    if (this.speedBoost) this.input.speedMult *= this.speedBoost;      // Overdrive: Haste upgrades
    if (this.stimHealT > 0) {
      const t = Math.min(dt, this.stimHealT);
      this.stimHealT -= dt;
      this.stimAcc += t * SC.tickRate;
      while (this.stimAcc >= 1) { this.stimAcc -= 1; this.health = Math.min(BR.CONFIG.actor.maxHealth, this.health + SC.healPerTick); }
    }
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
    // recoil recovery: a moment after you stop shooting, the view settles back down most of the
    // climb (never below where the spray started, so pulling down yourself is never punished)
    if (this.recoilPull > 0 && this.game && this.game.time - (this.sprayLast ?? -9) > 0.09) {
      const k = Math.min(this.recoilPull, this.recoilPull * 9 * dt + 0.0002);
      this.recoilPull -= k;
      const floor = Math.min(this.pitch, this.sprayPitch0 ?? this.pitch);
      this.pitch = Math.max(floor, this.pitch - k * 0.75);
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
    // Low-poly humanoid. Joints: hips > thighs > knees > shins; waist > upper body
    // (chest, vest, neck, head, shoulders > arms holding the gun). All poses animate joints.
    const S = sharedGeo();
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: this.color });            // team colour: shirt + helmet
    const pants = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.color).multiplyScalar(0.35).add(new THREE.Color(0x1d2026)) });
    const skin = S.skins[Math.floor(Math.random() * S.skins.length)];
    const mesh = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); return o; };
    const body = new THREE.Group();
    body.add(mesh(S.hips, pants, 0, 0.97, 0));
    const leg = x => {
      const hip = new THREE.Group(); hip.position.set(x, 0.96, 0);
      hip.add(mesh(S.thigh, pants));
      const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      knee.add(mesh(S.shin, pants));
      knee.add(mesh(S.boot, S.boots, 0, -0.44, -0.04));
      return { hip, knee };
    };
    const L = leg(-0.1), R = leg(0.1);
    body.add(L.hip, R.hip);
    const upper = new THREE.Group(); upper.position.y = 1.0;
    upper.add(mesh(S.abdomen, pants, 0, 0.1, 0));
    const chest = mesh(S.chest, mat, 0, 0.36, 0); chest.scale.z = 0.62; upper.add(chest);
    upper.add(mesh(S.vest, S.dark, 0, 0.34, -0.1));
    upper.add(mesh(S.pack, S.dark, 0, 0.36, 0.17));
    upper.add(mesh(S.neck, skin, 0, 0.56, 0));
    const head = new THREE.Group(); head.position.y = 0.7; upper.add(head);
    const face = mesh(S.head, skin); face.scale.set(0.95, 1.08, 1); head.add(face);
    head.add(mesh(S.helmet, mat, 0, 0.02, 0));
    head.add(mesh(S.visor, S.visorMat, 0, 0.0, -0.11));
    // Arms: shoulder joints swing the whole arm; elbows bend so the hands meet the gun
    const arm = x => {
      const sh = new THREE.Group(); sh.position.set(x, 0.5, 0); upper.add(sh);
      sh.add(mesh(S.shoulder, mat));
      sh.add(mesh(S.upperArm, mat));
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      el.add(mesh(S.forearm, mat));
      el.add(mesh(S.hand, S.gloves, 0, -0.27, 0));
      return { sh, el };
    };
    const AR = arm(0.22), AL = arm(-0.22);
    const gun = new THREE.Group(); gun.position.set(0.1, 0.38, -0.2);   // holds the real weapon model
    upper.add(gun);
    body.add(upper);
    g.add(body);
    const chute = BR.Models.parachute(this.color, 0xf2f2f2);
    chute.position.y = 1.5; chute.visible = false;
    g.add(chute);
    g.userData = { body, upper, head, L, R, AR, AL, gun, mat, chute, t: 0, yaw: this.yaw, pitch: 0 };
    collapseMeshes(g, gun);          // ~33 draw calls per bot -> ~14 (parts on the same joint share one mesh per material)
    return g;
  }

  syncMesh(dt) {
    const m = this.mover, u = this.mesh.userData, U = BR.util;
    this.mesh.position.copy(m.pos);
    const sp = m.speedH;
    // Smooth turning: the body eases toward where it's facing (or sliding), the
    // upper body / head / gun ease toward the aim — no snapping on either end.
    const velYaw = Math.atan2(-m.vel.x, -m.vel.z);
    const faceYaw = m.sliding && sp > 1 ? velYaw : this.yaw;
    u.yaw = dampAngle(u.yaw, faceYaw, 14, dt);
    this.mesh.rotation.y = u.yaw;
    // shoulders counter-rotate against the hip sway so the pelvis visibly swings under them
    u.upper.rotation.y = U.damp(u.upper.rotation.y, U.clamp(U.wrapAngle(this.yaw - u.yaw), -1.1, 1.1) - (u.hipYaw || 0) * 1.15, 16, dt);
    u.pitch = U.damp(u.pitch, this.pitch, 14, dt);
    u.t += dt * sp * 1.45;
    // targets: [hipL, kneeL, hipR, kneeR, lean, bodyY, bodyX]
    let hL = 0, kL = 0, hR = 0, kR = 0, lean = 0, bodyY = 0, bodyX = 0, armsUp = 0, armsOut = 0, hipYaw = 0, hipRoll = 0, hipShift = 0;
    if (m.dropping && !m.chute) {                 // freefall: belly down, limbs spread
      bodyX = -1.4; bodyY = 1.0; hL = 0.3; kL = 0.6; hR = 0.25; kR = 0.5; armsOut = 1.1;
    } else if (m.dropping) {                      // under canopy: holding the lines, legs dangling
      const sw = Math.sin(performance.now() / 420) * 0.15;
      hL = -0.15 + sw; kL = 0.3; hR = -0.1 - sw; kR = 0.35; armsUp = 1;
    } else if (m.sliding) {                       // slide: lead leg straight out, trail leg tucked, lean back
      bodyY = -0.5; hL = -1.45; kL = 0.05; hR = -0.55; kR = 1.55; lean = 0.42;
    } else if (m.crouched) {
      bodyY = -0.34; hL = -1.0; kL = 1.6; hR = -0.6; kR = 1.4; lean = 0.18;
    } else if (!m.onGround) {                     // jump: tuck the knees
      hL = -0.7; kL = 1.0; hR = -0.2; kR = 0.6; lean = 0.05;
    } else {                                      // run cycle with knee bend
      const a = Math.min(0.8, sp * 0.09), c = Math.sin(u.t);
      hL = c * a; hR = -c * a;
      kL = Math.max(0, -Math.cos(u.t)) * a * 1.4 + (sp > 0.5 ? 0.15 : 0); kR = Math.max(0, Math.cos(u.t)) * a * 1.4 + (sp > 0.5 ? 0.15 : 0);
      lean = Math.min(sp * 0.012, 0.12);
      bodyY = -Math.abs(Math.sin(u.t)) * Math.min(sp * 0.006, 0.04);
      // hips: twist with the leg swing, drop toward the swinging leg, shift over the planted foot
      const amp = Math.min(1, sp / 5);
      hipYaw = c * 0.2 * amp; hipRoll = Math.sin(u.t) * 0.07 * amp; hipShift = Math.sin(u.t) * 0.035 * amp;
    }
    const D = (o, key, v, k) => { o[key] = U.damp(o[key], v, k, dt); };
    D(u.L.hip.rotation, 'x', hL, 16); D(u.L.knee.rotation, 'x', kL, 16);
    D(u.R.hip.rotation, 'x', hR, 16); D(u.R.knee.rotation, 'x', kR, 16);
    D(u.upper.rotation, 'x', lean, 12);
    D(u.body.rotation, 'x', bodyX, 7);
    D(u.body.position, 'y', bodyY, 12);
    D(u.body.rotation, 'z', (m.wallRunning ? 0.35 * (m.wallN.x + m.wallN.z) : m.sliding ? 0.1 : 0) + hipRoll, 10);
    D(u.body.rotation, 'y', hipYaw, 12); D(u.body.position, 'x', hipShift, 12);
    D(u.upper.rotation, 'z', -hipRoll * 0.8, 12);
    u.hipYaw = u.body.rotation.y;
    // Aim: head + arms + gun follow the (smoothed) pitch together
    const aimP = u.pitch - u.upper.rotation.x;
    u.head.rotation.x = aimP * 0.6;
    u.gun.rotation.x = aimP;
    // Arms: two-bone IK puts the right hand on the grip and the left on the foregrip
    // of whatever gun is held; blends to holding the risers (canopy) or spread (freefall).
    const gp = u.gp || { grip: _ikV.set(0, -0.05, 0.1).clone(), fore: null };
    const sc = u.gunScale || 1.15;
    const tR = _ikA.copy(gp.grip).multiplyScalar(sc).applyEuler(u.gun.rotation).add(u.gun.position);
    const tL = _ikB.copy(gp.fore || _ikV.set(0, -0.03, -0.22)).multiplyScalar(gp.fore ? sc : 1).applyEuler(u.gun.rotation).add(u.gun.position);
    if (u.gun.userData.knife) tL.set(-0.2, 0.08, -0.08);           // off hand guards while holding the knife
    const up = Math.max(armsUp, 0), out = Math.min(armsOut, 1);
    if (up > 0) { tR.lerp(_ikV.set(0.2, 1.08, 0.02), up); tL.lerp(_ikC.set(-0.2, 1.08, 0.02), up); }
    if (out > 0) { tR.lerp(_ikV.set(0.62, 0.58, 0.05), out); tL.lerp(_ikC.set(-0.62, 0.58, 0.05), out); }
    if (!u.hR) { u.hR = tR.clone(); u.hL = tL.clone(); }
    const kk = 1 - Math.exp(-dt * 18);
    u.hR.lerp(tR, kk); u.hL.lerp(tL, kk);
    solveArm(u.AR, u.hR, 1); solveArm(u.AL, u.hL, -1);
    u.gun.visible = !m.dropping;
    u.chute.visible = !!(m.dropping && m.chute);
    if (u.chute.visible) u.chute.rotation.z = Math.sin(performance.now() / 700) * 0.06;
    // Show the gun this bot is actually holding
    const wid = this.weapon ? this.weapon.id : null;
    if (u.wid !== wid) {
      u.wid = wid;
      while (u.gun.children.length) u.gun.remove(u.gun.children[0]);
      if (wid) {
        const sc = wid === 'knife' ? 1.6 : wid === 'bayonet' ? 1.3 : 1.15, gm = BR.Models.worldWeapon(wid);
        gm.scale.setScalar(sc); u.gun.add(gm);
        u.gp = BR.Models.gripPoints(wid); u.gunScale = sc; u.gun.userData.knife = wid === 'knife' || wid === 'bayonet';
      }
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
    u.body.rotation.x = -Math.PI / 2; u.body.position.y = 0.25;
    u.L.hip.rotation.x = u.R.hip.rotation.x = 0; u.L.knee.rotation.x = 0.3; u.R.knee.rotation.x = 0.1;
    u.chute.visible = false;
  }
};

// shared with zombies.js: the humanoid part geometry + the draw-call merger
BR.actorGeo = sharedGeo;
BR.collapseMeshes = collapseMeshes;
BR.dampAngle = dampAngle;
