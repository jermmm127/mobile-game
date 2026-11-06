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
// v1.25: the imported character's shared geometry (built once from BR.CHAR_DATA) + a woven fabric detail map
let charCache = null;
function charAssets() {
  if (charCache) return charCache;
  const D = BR.CHAR_DATA, dec = (b, T) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T(u.buffer); };
  const pos = new THREE.BufferAttribute(dec(D.pos, Float32Array), 3), uv = new THREE.BufferAttribute(dec(D.uv, Float32Array), 2);
  const col = new THREE.BufferAttribute(dec(D.col, Uint8Array), 3, true), si = new THREE.BufferAttribute(dec(D.si, Uint8Array), 4), sw = new THREE.BufferAttribute(dec(D.sw, Uint8Array), 4, true);
  const geoAll = new THREE.BufferGeometry(); geoAll.setAttribute('position', pos); geoAll.setAttribute('uv', uv); geoAll.setAttribute('skinIndex', si); geoAll.setAttribute('skinWeight', sw);
  geoAll.setIndex(new THREE.BufferAttribute(dec(D.idx, Uint16Array), 1)); geoAll.computeVertexNormals();
  geoAll.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
  const team = dec(D.team, Uint8Array), cb = col.array, base = new Float32Array(cb.length), teamIdx = [];
  for (let i = 0; i < cb.length; i++) base[i] = cb[i] / 255;
  for (let i = 0; i < team.length; i++) if (team[i]) teamIdx.push(i);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 64, 64);
  for (let yy = 0; yy < 64; yy += 2) for (let xx = 0; xx < 64; xx += 2) { const v = 196 + ((xx + yy) % 4 ? 18 : -10) + Math.random() * 30; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(xx, yy, 2, 2); }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 12, 1); }
  const fabric = new THREE.CanvasTexture(cv); fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  // the ski mask: a smooth head-shaped ellipsoid in black knit with a painted eye opening (front = -Z: u 0.75, v ~0.56)
  const R = D.mask.r, mg = new THREE.SphereGeometry(1, 32, 24), mp = mg.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    let x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i); const front = -z;
    if (y < -0.35) { const k = 1 - (-0.35 - y) * 0.55; x *= k; z *= k; }                                   // tapers into the neck
    if (front > 0.55 && y < 0.05 && y > -0.6) z -= 0.06 * (front - 0.55) * (1 - Math.abs(y + 0.25) * 2);       // nose / chin shape
    if (front > 0.6 && Math.abs(y - 0.16) < 0.13) z += 0.03 * (front - 0.6);                                    // the eyes sit a touch deeper
    mp.setXYZ(i, x * R[0], y * R[1], z * R[2]);
  }
  mg.computeVertexNormals();
  const mc = document.createElement('canvas'); mc.width = 256; mc.height = 128; const m2 = mc.getContext('2d');
  m2.fillStyle = '#17181b'; m2.fillRect(0, 0, 256, 128);
  for (let yy = 0; yy < 128; yy += 2) for (let xx = 0; xx < 256; xx += 3) { m2.fillStyle = `rgba(255,255,255,${((xx / 3 + yy / 2) % 2 ? 0.035 : 0.0)})`; m2.fillRect(xx, yy, 2, 2); }      // knit rib
  const ex = 0.75 * 256, ey = 0.44 * 128;
  m2.fillStyle = '#0c0d0f'; m2.beginPath(); m2.ellipse(ex, ey, 34, 11, 0, 0, Math.PI * 2); m2.fill();                                  // rim
  m2.fillStyle = '#b4866a'; m2.beginPath(); m2.ellipse(ex, ey, 29, 8, 0, 0, Math.PI * 2); m2.fill();                                   // skin
  m2.fillStyle = 'rgba(80,50,35,0.35)'; m2.fillRect(ex - 29, ey - 8, 58, 3);                                                             // brow shadow
  for (const dx of [-12, 12]) { m2.fillStyle = '#efe9e2'; m2.beginPath(); m2.ellipse(ex + dx, ey + 1, 4.6, 2.5, 0, 0, Math.PI * 2); m2.fill();
    m2.fillStyle = '#3a2a20'; m2.beginPath(); m2.arc(ex + dx, ey + 1, 2.0, 0, Math.PI * 2); m2.fill(); m2.fillStyle = '#000'; m2.beginPath(); m2.arc(ex + dx, ey + 1, 1.0, 0, Math.PI * 2); m2.fill(); }
  const maskTex = new THREE.CanvasTexture(mc);
  return (charCache = { geo: geoAll, base, teamIdx, fabric, mask: mg, maskTex });
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
    this.slots = [null, null, BR.Weapons.create(opts && opts.isPlayer && BR.Profile && BR.Profile.data ? BR.Profile.melee() : 'bayonet')];
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
    if (!this.alive || this.downed || this.stimCd > 0 || this.mover.dropping) return false;
    this.stimCd = C.cooldown;
    this.stimT = C.speedTime;
    this.stimHealT = C.healTime;
    this.stimAcc = 0;
    return true;
  }

  // Fire the grapple along the aim. Returns true if it hooked something.
  tryGrapple() {
    const G = BR.CONFIG.move.grapple, m = this.mover;
    if (this.downed || this.grappleCd > 0 || m.grapple || m.dropping) return false;
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
    if (this.downed) {
      // v1.19 knocked down: crawl only (no jumping, shooting, aiming, items or reloads)
      const m = this.mover, inp = this.input;
      inp.jump = false; inp.crouch = false; inp.speedMult = 1; this.fireHeld = false; this.ads = false;
      m.prone = true; m.sliding = false; m.crouched = true;
      if (m.grapple) m.releaseGrapple();
      m.update(dt, inp, this.yaw);
      for (const w of this.slots) if (w) w.reloadT = 0;
      if (this.mesh) this.syncMesh(dt);
      return;
    }
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
    if (BR.CHAR_DATA && !this.zombie) return BR.Actor.prototype.buildCharMesh.call(this);      // (also called on plain objects: party stage)
    return BR.Actor.prototype.buildProcMesh.call(this);
  }
  // v1.25: the imported character, skinned onto the same joints the procedural animations drive (every pose,
  // run cycle, crouch, slide, knockdown, death and victory keeps working). Two draw calls: the jacket in the
  // team colour, everything else in its region colours (pants, boots, gloves, chest rig, ski mask).
  buildCharMesh() {
    const C = charAssets(), g = new THREE.Group(), body = new THREE.Group();
    const leg = x => { const hip = new THREE.Group(); hip.position.set(x, 0.96, 0); const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee); return { hip, knee }; };
    const L = leg(-0.1), R = leg(0.1); body.add(L.hip, R.hip);
    const upper = new THREE.Group(); upper.position.y = 1.0;
    const head = new THREE.Group(); head.position.y = 0.7; upper.add(head);
    const arm = x => { const sh = new THREE.Group(); sh.position.set(x, 0.5, 0); upper.add(sh); const el = new THREE.Group(); el.position.y = -0.28; sh.add(el); return { sh, el }; };
    const AR = arm(0.22), AL = arm(-0.22);
    const gun = new THREE.Group(); gun.position.set(0.1, 0.38, -0.2); upper.add(gun);
    body.add(upper); g.add(body);
    // bind pose = the model's A-pose: arms out, elbows a touch bent, legs slightly apart
    const B = BR.CHAR_DATA.bind;
    AR.sh.rotation.z = B.sh; AL.sh.rotation.z = -B.sh; AR.el.rotation.z = B.el; AL.el.rotation.z = -B.el;
    R.hip.rotation.z = B.hip; L.hip.rotation.z = -B.hip; R.knee.rotation.z = B.knee; L.knee.rotation.z = -B.knee;
    g.updateMatrixWorld(true);
    const skel = new THREE.Skeleton([body, upper, head, AR.sh, AR.el, AL.sh, AL.el, R.hip, R.knee, L.hip, L.knee]);
    // one skinned mesh, one draw call: per-vertex colours (pants, boots, gloves) with the jacket in this actor's
    // team colour, blended smoothly at the borders. The geometry is shared; only the colour layer is per actor.
    const geo = new THREE.BufferGeometry(); for (const k in C.geo.attributes) if (k !== 'color') geo.setAttribute(k, C.geo.attributes[k]);
    geo.setIndex(C.geo.index); geo.boundingSphere = C.geo.boundingSphere;
    const colA = new THREE.BufferAttribute(new Float32Array(C.base), 3); geo.setAttribute('color', colA);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: C.fabric, skinning: true });
    // existing code sets team colours with mat.color.setHex(...): route that into the jacket's vertex colours instead
    const paint = hex => { const c = new THREE.Color(hex), a = colA.array; for (const i of C.teamIdx) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } colA.needsUpdate = true; };
    mat.color.setHex = function (hex) { paint(hex); return this; };
    mat.clone = function () { const m = THREE.MeshLambertMaterial.prototype.clone.call(this); m.color.setHex = mat.color.setHex; m.clone = mat.clone; return m; };     // (the enemy highlight clones it)
    paint(this.color !== undefined ? this.color : 0x8899aa);
    const sm = new THREE.SkinnedMesh(geo, mat); sm.bind(skel); sm.userData.noMerge = true; g.add(sm);
    const mat2 = null;
    // the ski mask head (smooth knit, eye opening) on the head joint
    const mat3 = new THREE.MeshLambertMaterial({ map: C.maskTex });
    const mk = BR.CHAR_DATA.mask, maskM = new THREE.Mesh(C.mask, mat3); maskM.position.set(mk.c[0], mk.c[1] - 1.7, mk.c[2]); head.add(maskM);
    for (const o of [AR.sh, AL.sh, AR.el, AL.el, R.hip, L.hip, R.knee, L.knee]) o.rotation.set(0, 0, 0);     // back to the rig's rest pose
    const chute = BR.Models.parachute(this.color, 0xf2f2f2);
    chute.position.y = 1.5; chute.visible = false; g.add(chute);
    g.userData = { body, upper, head, L, R, AR, AL, gun, mat, mat2, mat3, chute, t: 0, yaw: this.yaw, pitch: 0, char: true };
    return g;
  }

  buildProcMesh() {
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
    u.spS = U.damp(u.spS || 0, sp, 7, dt);                       // v1.21: smoothed speed drives the gait (no stride pops)
    u.t += dt * (u.spS * 1.3 + (u.spS > 0.3 ? 0.6 : 0));
    // targets: [hipL, kneeL, hipR, kneeR, lean, bodyY, bodyX]
    let hL = 0, kL = 0, hR = 0, kR = 0, lean = 0, bodyY = 0, bodyX = 0, armsUp = 0, armsOut = 0, hipYaw = 0, hipRoll = 0, hipShift = 0;
    let crawl = 0;
    if (this.downed) {                            // v1.19 knocked down: prone, crawling on the elbows
      const c = Math.sin(u.t * 1.6);
      bodyX = -1.38; bodyY = 0.24; hL = 0.2 + c * 0.35; kL = 0.4 + Math.max(0, c) * 0.9; hR = 0.2 - c * 0.35; kR = 0.4 + Math.max(0, -c) * 0.9; armsUp = 1; crawl = c;
    } else if (m.dropping && !m.chute) {                 // freefall: belly down, limbs spread
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
    } else {                                      // v1.21 direction-aware gait: forward/back strides, side-steps when strafing
      const spd = u.spS, c = Math.sin(u.t), cc = Math.cos(u.t);
      const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), vf = m.vel.x * fx + m.vel.z * fz, vs = m.vel.x * -fz + m.vel.z * fx;
      const n = Math.max(0.001, Math.hypot(vf, vs)), f = vf / n, l = vs / n;          // f: +1 forward, -1 back; l: strafe share
      u.gf = U.damp(u.gf === undefined ? 1 : u.gf, spd > 0.3 ? f : 1, 8, dt); u.gl = U.damp(u.gl || 0, spd > 0.3 ? l : 0, 8, dt);
      const a = Math.min(0.72, spd * 0.085) * (spd < 2.6 ? 0.75 : 1);                 // a shorter, calmer stride when walking
      const fw = Math.abs(u.gf), sd = Math.min(1, Math.abs(u.gl) * 1.2), dir = u.gf < 0 ? -1 : 1;
      hL = c * a * fw * dir; hR = -c * a * fw * dir;
      const lift = a * (1.25 + 0.35 * sd);                                             // knees lift on the swing (also when side-stepping)
      kL = Math.max(0, -cc) * lift + (spd > 0.4 ? 0.12 : 0); kR = Math.max(0, cc) * lift + (spd > 0.4 ? 0.12 : 0);
      u.side = c * a * 0.55 * sd * Math.sign(u.gl || 1);                              // legs open + cross when strafing
      lean = U.clamp(u.gf * spd * 0.011, -0.05, 0.11);
      bodyY = -(0.5 - 0.5 * Math.cos(u.t * 2)) * Math.min(spd * 0.0065, 0.04);         // smooth double bounce per stride (no sharp dip)
      const amp = Math.min(1, spd / 5);
      hipYaw = c * 0.17 * amp * fw; hipRoll = c * 0.06 * amp - u.gl * Math.min(spd * 0.012, 0.07); hipShift = c * 0.03 * amp;
    }
    const D = (o, key, v, k) => { o[key] = U.damp(o[key], v, k, dt); };
    D(u.L.hip.rotation, 'x', hL, 16); D(u.L.knee.rotation, 'x', kL, 16);
    D(u.R.hip.rotation, 'x', hR, 16); D(u.R.knee.rotation, 'x', kR, 16);
    const sideOn = !m.dropping && !m.sliding && !m.crouched && m.onGround && !this.downed ? (u.side || 0) : 0;
    D(u.L.hip.rotation, 'z', -0.04 + sideOn, 14); D(u.R.hip.rotation, 'z', 0.04 + sideOn, 14);
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
    if (crawl) { tR.y += crawl * 0.12; tL.y -= crawl * 0.12; tR.z -= 0.12; tL.z -= 0.12; }
    if (out > 0) { tR.lerp(_ikV.set(0.62, 0.58, 0.05), out); tL.lerp(_ikC.set(-0.62, 0.58, 0.05), out); }
    if (!u.hR) { u.hR = tR.clone(); u.hL = tL.clone(); }
    const kk = 1 - Math.exp(-dt * 18);
    u.hR.lerp(tR, kk); u.hL.lerp(tL, kk);
    solveArm(u.AR, u.hR, 1); solveArm(u.AL, u.hL, -1);
    u.gun.visible = !m.dropping && !this.downed;
    u.chute.visible = !!(m.dropping && m.chute);
    if (u.chute.visible) u.chute.rotation.z = Math.sin(performance.now() / 700) * 0.06;
    // Show the gun this bot is actually holding
    const wid = this.weapon ? this.weapon.id : null;
    if (u.wid !== wid) {
      u.wid = wid;
      while (u.gun.children.length) u.gun.remove(u.gun.children[0]);
      if (wid) {
        const sc = wid === 'knife' ? 1.6 : wid === 'bayonet' || wid === 'tracker' ? 1.3 : 1.15, gm = BR.Models.worldWeapon(wid);
        gm.scale.setScalar(sc); u.gun.add(gm);
        u.gp = BR.Models.gripPoints(wid); u.gunScale = sc; u.gun.userData.knife = wid === 'knife' || wid === 'bayonet' || wid === 'tracker';
      }
    }
  }

  // Flash white briefly on hit
  flash() {
    if (!this.mesh) return;
    const u = this.mesh.userData, mats = [u.mat, u.mat2, u.mat3].filter(Boolean);
    for (const mat of mats) { mat.emissive.setHex(0xffffff); mat.emissiveIntensity = 0.7; }
    clearTimeout(this._flashTO);
    this._flashTO = setTimeout(() => { for (const mat of mats) mat.emissive.setHex(0x000000); }, 70);
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
