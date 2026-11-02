'use strict';
// =============================================================================
// LOOT — floor items: weapons, ammo, heals, shields.
// Ammo/heals/shields are picked up automatically when useful. Weapons go into
// an empty slot automatically; when both slots are full the player gets a
// "Swap" button and bots swap if the new gun is a higher tier.
// =============================================================================
const AMMO_COLORS = { light: 0xf2d16b, heavy: 0x8fd16a, shells: 0xe5674a };
const TIER_COLORS = [0xd8dde3, 0x5fb4ff, 0xb57bff, 0xffb547];

BR.Loot = class Loot {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.nextId = 1;
    this.cullT = 0;
    this.geo = {
      gun: new THREE.BoxGeometry(0.75, 0.16, 0.16),
      stock: new THREE.BoxGeometry(0.22, 0.24, 0.16),
      ammo: new THREE.BoxGeometry(0.34, 0.26, 0.26),
      heal: new THREE.BoxGeometry(0.42, 0.42, 0.42),
      cross: new THREE.BoxGeometry(0.44, 0.12, 0.44),
      shield: new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8),
      ring: new THREE.RingGeometry(0.45, 0.6, 20),
    };
    this.mats = {};
    const mat = (k, c, basic) => (this.mats[k] = this.mats[k] || (basic ? new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 })));
    this.mat = mat;
  }

  spawnFromWorld(world) {
    const R = world.rand, U = BR.util, L = BR.CONFIG.loot;
    for (const s of world.lootSpots) {
      const n = s.tier >= 1 && R() < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const kind = U.weighted(L.tables[Math.min(s.tier, L.tables.length - 1)], R);
        const x = s.x + (i ? U.rand(R, -1, 1) : 0), z = s.z + (i ? U.rand(R, -1, 1) : 0);
        this.spawnKind(kind, x, s.y, z, R);
      }
    }
  }

  spawnKind(kind, x, y, z, R) {
    const C = BR.CONFIG;
    if (C.weapons[kind]) {
      const def = C.weapons[kind];
      return this.add({ kind: 'weapon', wid: kind, mag: def.mag, reserve: def.mag }, x, y, z);
    }
    if (kind === 'ammo') {
      const t = BR.util.pick(['light', 'light', 'heavy', 'heavy', 'shells'], R);
      return this.add({ kind: 'ammo', ammoType: t, amount: C.ammoPickup[t] }, x, y, z);
    }
    if (kind === 'heal') return this.add({ kind: 'heal', amount: C.loot.healAmount }, x, y, z);
    if (kind === 'shield') return this.add({ kind: 'shield', amount: C.loot.shieldAmount }, x, y, z);
  }

  add(data, x, y, z) {
    const item = Object.assign({ id: this.nextId++, taken: false, phase: Math.random() * 6 }, data);
    item.pos = new THREE.Vector3(x, y, z);
    item.mesh = this.buildMesh(item);
    item.mesh.position.set(x, y + 0.45, z);
    this.game.scene.add(item.mesh);
    this.items.push(item);
    return item;
  }

  buildMesh(item) {
    const g = new THREE.Group(), G = this.geo;
    if (item.kind === 'weapon') {
      const def = BR.CONFIG.weapons[item.wid];
      const m = this.mat('w_' + item.wid, def.color);
      const gun = new THREE.Mesh(G.gun, m);
      gun.scale.x = 0.6 + def.len;
      const stock = new THREE.Mesh(G.stock, m); stock.position.set(-0.3, -0.08, 0);
      g.add(gun, stock);
      const ring = new THREE.Mesh(G.ring, this.mat('ring' + def.tier, TIER_COLORS[def.tier], true));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.4;
      g.add(ring);
      g.userData.ring = ring;
    } else if (item.kind === 'ammo') {
      g.add(new THREE.Mesh(G.ammo, this.mat('a_' + item.ammoType, AMMO_COLORS[item.ammoType])));
    } else if (item.kind === 'heal') {
      g.add(new THREE.Mesh(G.heal, this.mat('heal', 0xf4f4f0)));
      g.add(new THREE.Mesh(G.cross, this.mat('healx', 0x3ccf6e)));
    } else {
      g.add(new THREE.Mesh(G.shield, this.mat('shield', 0x4aa8ff)));
    }
    return g;
  }

  remove(item) {
    item.taken = true;
    this.game.scene.remove(item.mesh);
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  update(dt, viewer) {
    const t = this.game.time;
    this.cullT -= dt;
    const doCull = this.cullT <= 0;
    if (doCull) this.cullT = 0.3;
    for (const it of this.items) {
      if (doCull) it.mesh.visible = Math.abs(it.pos.x - viewer.x) < 70 && Math.abs(it.pos.z - viewer.z) < 70;
      if (!it.mesh.visible) continue;
      it.mesh.rotation.y = t * 1.4 + it.phase;
      it.mesh.position.y = it.pos.y + 0.45 + Math.sin(t * 2.5 + it.phase) * 0.08;
      if (it.mesh.userData.ring) it.mesh.userData.ring.rotation.z = -it.mesh.rotation.y;
    }
  }

  // Called a few times a second per actor. Returns the nearest weapon the
  // actor could swap to (used for the player's Swap prompt), or null.
  autoPickup(actor) {
    const C = BR.CONFIG, R = C.loot.pickupRadius;
    const p = actor.pos;
    let swapCandidate = null, swapD = Infinity;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z, dy = it.pos.y - p.y;
      if (Math.abs(dx) > R || Math.abs(dz) > R || dy > 1.6 || dy < -1.2) continue;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      let took = false;
      if (it.kind === 'ammo') {
        const cap = C.ammoCap[it.ammoType];
        if (actor.ammo[it.ammoType] < cap) { actor.ammo[it.ammoType] = Math.min(cap, actor.ammo[it.ammoType] + it.amount); took = true; }
      } else if (it.kind === 'heal') took = actor.heal(it.amount);
      else if (it.kind === 'shield') took = actor.addShield(it.amount);
      else if (it.kind === 'weapon') {
        const def = C.weapons[it.wid];
        const cap = C.ammoCap[def.ammo];
        if (actor.hasWeapon(it.wid)) {
          if (actor.ammo[def.ammo] < cap) {
            actor.ammo[def.ammo] = Math.min(cap, actor.ammo[def.ammo] + it.mag + it.reserve);
            took = true;
          }
        } else if (actor.giveWeapon(it.wid, it.mag) >= 0) {
          actor.ammo[def.ammo] = Math.min(cap, actor.ammo[def.ammo] + it.reserve);
          took = true;
        } else if (d < swapD) { swapCandidate = it; swapD = d; }
      }
      if (took) { this.game.onPickup(actor, it); this.remove(it); }
    }
    if (swapCandidate && !actor.isPlayer) {
      const worst = Math.min(...actor.slots.map(s => s.def.tier));
      if (C.weapons[swapCandidate.wid].tier > worst) {
        const i = actor.slots.findIndex(s => s.def.tier === worst);
        actor.cur = i;
        this.swap(actor, swapCandidate);
      }
      return null;
    }
    return swapCandidate;
  }

  // Drop the held weapon and take this one.
  swap(actor, item) {
    if (item.taken) return;
    const old = actor.weapon;
    if (old) this.add({ kind: 'weapon', wid: old.id, mag: old.mag, reserve: 0 }, actor.pos.x, actor.pos.y, actor.pos.z);
    actor.slots[actor.cur] = BR.Weapons.create(item.wid, item.mag);
    const def = BR.CONFIG.weapons[item.wid];
    actor.ammo[def.ammo] = Math.min(BR.CONFIG.ammoCap[def.ammo], actor.ammo[def.ammo] + item.reserve);
    this.game.onPickup(actor, item);
    this.remove(item);
  }

  // Nearest item this actor actually wants (used by bot brains).
  findWanted(actor, radius) {
    const C = BR.CONFIG;
    let best = null, bestD = radius;
    const empty = actor.slots.some(s => !s);
    const worst = empty ? -1 : Math.min(...actor.slots.map(s => s.def.tier));
    const heldAmmo = new Set(actor.slots.filter(Boolean).map(s => s.def.ammo));
    for (const it of this.items) {
      if (it.pos.y > 12) continue;
      const d = actor.pos.distanceTo(it.pos);
      if (d >= bestD) continue;
      let want = false;
      if (it.kind === 'weapon') want = !actor.hasWeapon(it.wid) && C.weapons[it.wid].tier > worst;
      else if (it.kind === 'ammo') want = heldAmmo.has(it.ammoType) && actor.ammo[it.ammoType] < C.ammoCap[it.ammoType] * 0.5;
      else if (it.kind === 'heal') want = actor.health < 75;
      else if (it.kind === 'shield') want = actor.shield < 75;
      if (want) { best = it; bestD = d; }
    }
    return best;
  }

  // Death drop: everything the actor carried.
  dropAll(actor) {
    const p = actor.pos;
    let k = 0;
    const spot = () => { const a = k++ * 2.1; return [p.x + Math.cos(a) * 0.9, p.y, p.z + Math.sin(a) * 0.9]; };
    for (const w of actor.slots) if (w) this.add({ kind: 'weapon', wid: w.id, mag: w.mag, reserve: 0 }, ...spot());
    for (const t in actor.ammo) if (actor.ammo[t] > 0) this.add({ kind: 'ammo', ammoType: t, amount: actor.ammo[t] }, ...spot());
    if (actor.shield > 0 || Math.random() < 0.5) this.add({ kind: 'shield', amount: BR.CONFIG.loot.shieldAmount }, ...spot());
  }

  clear() {
    for (const it of this.items) this.game.scene.remove(it.mesh);
    this.items.length = 0;
  }
};
