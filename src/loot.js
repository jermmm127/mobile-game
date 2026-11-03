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
      chest: new THREE.BoxGeometry(0.95, 0.5, 0.6),
      lid: new THREE.BoxGeometry(0.99, 0.18, 0.64),
      band: new THREE.BoxGeometry(0.16, 0.7, 0.66),
    };
    this.mats = {};
    const mat = (k, c, basic) => (this.mats[k] = this.mats[k] || (basic ? new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 })));
    this.mat = mat;
  }

  spawnFromWorld(world) {
    const R = world.rand, U = BR.util, L = BR.CONFIG.loot;
    for (const c of world.chestSpots) this.add({ kind: 'chest', tier: c.tier }, c.x, c.y, c.z);
    for (const s of world.lootSpots) {
      const n = s.force ? 1 : s.tier >= 1 && R() < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const table = L.tables[Math.min(s.tier, L.tables.length - 1)];
        const kind = U.weighted(s.force === 'weapon' ? this.weaponTable(table) : table, R);
        const x = s.x + (i ? U.rand(R, -1, 1) : 0), z = s.z + (i ? U.rand(R, -1, 1) : 0);
        this.spawnKind(kind, x, s.y, z, R);
      }
    }
  }

  weaponTable(table) {
    const t = {};
    for (const k in table) if (BR.CONFIG.weapons[k]) t[k] = table[k];
    return t;
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
    if (kind === 'shock') return this.add({ kind: 'shock', amount: 1 }, x, y, z);
    if (kind === 'heal') return this.add({ kind: 'heal', amount: C.loot.healAmount }, x, y, z);
    if (kind === 'shield') return this.add({ kind: 'shield', amount: C.loot.shieldAmount }, x, y, z);
  }

  // Name tag for dropped weapons: rarity-coloured text on a dark pill (cached per weapon)
  label(wid) {
    this.labels = this.labels || {};
    if (this.labels[wid]) return this.labels[wid];
    const def = BR.CONFIG.weapons[wid], col = '#' + TIER_COLORS[def.tier].toString(16).padStart(6, '0');
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
    // rarity-coloured name, no background: dark outline + soft glow so it reads anywhere
    c.font = '800 34px "Saira Semi Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const text = def.name.toUpperCase();
    c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = 'rgba(6,8,12,0.85)'; c.strokeText(text, 128, 33);
    c.shadowColor = col; c.shadowBlur = 12; c.fillStyle = col; c.fillText(text, 128, 33);
    c.shadowBlur = 0; c.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(cv);
    return (this.labels[wid] = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }));
  }

  // vel (optional): toss the item out - it flies, spins fast, bounces and settles
  add(data, x, y, z, vel) {
    const item = Object.assign({ id: this.nextId++, taken: false, phase: Math.random() * 6 }, data);
    if (vel) { item.vel = vel; item.spinV = 9 + Math.random() * 6; item.air = true; }
    item.pos = new THREE.Vector3(x, y, z);
    item.mesh = this.buildMesh(item);
    item.mesh.position.set(x, item.kind === 'chest' ? y : y + 0.45, z);
    this.game.scene.add(item.mesh);
    this.items.push(item);
    return item;
  }

  buildMesh(item) {
    const g = new THREE.Group(), G = this.geo;
    if (item.kind === 'weapon') {
      const def = BR.CONFIG.weapons[item.wid];
      // The real gun model, lying on its side and slowly turning, over a rarity ring
      const gun = BR.Models.worldWeapon(item.wid);
      gun.scale.setScalar(1.7);
      gun.rotation.set(0, Math.PI / 2, Math.PI / 2 * 0.9);
      gun.position.y = -0.05;
      g.add(gun);
      const ring = new THREE.Mesh(G.ring, this.mat('ring' + def.tier, TIER_COLORS[def.tier], true));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.4;
      ring.scale.setScalar(1.4);
      g.add(ring);
      g.userData.ring = ring;
      const tag = new THREE.Sprite(this.label(item.wid)); tag.scale.set(1.25, 0.31, 1); tag.position.y = 0.62; tag.renderOrder = 5; tag.visible = false;
      g.add(tag); g.userData.label = tag;
    } else if (item.kind === 'chest') {
      const wood = this.mat('chest', 0x8a5a2b), gold = this.mat('gold', 0xffc04a);
      const base = new THREE.Mesh(G.chest, wood); base.position.y = 0.25;
      const lid = new THREE.Mesh(G.lid, wood); lid.position.y = 0.59;
      const b1 = new THREE.Mesh(G.band, gold); b1.position.set(-0.28, 0.35, 0);
      const b2 = new THREE.Mesh(G.band, gold); b2.position.set(0.28, 0.35, 0);
      const ring = new THREE.Mesh(G.ring, this.mat('ring3', 0xffb547, true));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(1.5);
      g.add(base, lid, b1, b2, ring);
      g.rotation.y = item.id * 1.7;
      g.userData.lid = lid;
      g.userData.ring = ring;
    } else if (item.kind === 'ammo') {
      g.add(new THREE.Mesh(G.ammo, this.mat('a_' + item.ammoType, AMMO_COLORS[item.ammoType])));
    } else if (item.kind === 'shock') {
      const n = BR.Shockwave.model(); n.scale.setScalar(2.6); g.add(n); g.userData.nade = n;
      const ring = new THREE.Mesh(G.ring, this.mat('ringShock', 0xb04bff, true)); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.4; g.add(ring); g.userData.ring = ring;
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
    const W = this.game.world;
    for (const it of this.items) {
      if (it.air) this.toss(it, dt, W);
      if (doCull) {
        it.mesh.visible = Math.abs(it.pos.x - viewer.x) < 50 && Math.abs(it.pos.z - viewer.z) < 50;
        const lb = it.mesh.userData.label;
        if (lb) lb.visible = it.mesh.visible && Math.abs(it.pos.x - viewer.x) + Math.abs(it.pos.z - viewer.z) < 18 && Math.abs(it.pos.y - viewer.y) < 6;
      }
      if (!it.mesh.visible) continue;
      if (it.kind === 'chest') { it.mesh.userData.ring.material.opacity = 0.45 + Math.sin(t * 4) * 0.3; continue; }
      if (it.air) { it.spinA = (it.spinA || 0) + it.spinV * dt; it.mesh.rotation.y = it.spinA; it.mesh.position.set(it.pos.x, it.pos.y + 0.3, it.pos.z); continue; }
      it.spinA = (it.spinA || t * 1.4 + it.phase) + 1.6 * dt;
      it.mesh.rotation.y = it.spinA;
      // weapons do a little bounce on the ground; other items bob
      it.mesh.position.y = it.kind === 'weapon' ? it.pos.y + 0.3 + Math.abs(Math.sin(t * 2.6 + it.phase)) * 0.2 : it.pos.y + 0.45 + Math.sin(t * 2.5 + it.phase) * 0.08;
      if (it.mesh.userData.ring) it.mesh.userData.ring.rotation.z = -it.mesh.rotation.y;
      if (it.mesh.userData.nade) BR.Models.animate(it.mesh.userData.nade, t);
    }
  }

  // Physics for tossed items: gravity, bounce off the floor, stop at walls, settle.
  toss(it, dt, W) {
    const v = it.vel;
    v.y -= 20 * dt;
    const nx = it.pos.x + v.x * dt, nz = it.pos.z + v.z * dt;
    const h = Math.hypot(v.x, v.z);
    if (h > 0.01) {
      const hit = W.raycast(it.pos.x, it.pos.y + 0.25, it.pos.z, v.x / h, 0, v.z / h, h * dt + 0.2);
      if (hit.t < h * dt + 0.2) { v.x *= -0.3; v.z *= -0.3; }
      else { it.pos.x = nx; it.pos.z = nz; }
    }
    it.pos.y += v.y * dt;
    const floor = W.groundAt(it.pos.x, it.pos.z, it.pos.y + 0.6);
    if (it.pos.y <= floor) {
      it.pos.y = floor;
      if (Math.abs(v.y) > 2.2) { v.y = -v.y * 0.42; v.x *= 0.6; v.z *= 0.6; it.spinV *= 0.65; if (this.game.player && it.pos.distanceTo(this.game.player.pos) < 25) BR.Audio.land(Math.abs(v.y) * 0.6); }
      else { it.air = false; it.vel = null; }
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
      if (it.kind === 'chest') {
        if (!actor.isPlayer) this.openChest(actor, it); // bots pop chests by walking into them
        continue;
      }
      if (it.kind === 'ammo') {
        const cap = C.ammoCap[it.ammoType];
        if (actor.ammo[it.ammoType] < cap) { actor.ammo[it.ammoType] = Math.min(cap, actor.ammo[it.ammoType] + it.amount); took = true; }
      } else if (it.kind === 'shock') { if ((actor.nades || 0) < C.shockwave.maxCarry) { actor.nades = (actor.nades || 0) + it.amount; took = true; } }
      else if (it.kind === 'heal') took = actor.heal(it.amount);
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
      const worst = Math.min(...actor.guns().map(s => s.def.tier));
      if (C.weapons[swapCandidate.wid].tier > worst) {
        const i = actor.guns().findIndex(s => s.def.tier === worst);
        actor.cur = i;
        this.swap(actor, swapCandidate);
      }
      return null;
    }
    return swapCandidate;
  }

  nearestChest(actor, radius) {
    let best = null, bd = radius;
    for (const it of this.items) {
      if (it.kind !== 'chest') continue;
      const dy = it.pos.y - actor.pos.y;
      if (dy > 1.5 || dy < -1.2) continue;
      const d = Math.hypot(it.pos.x - actor.pos.x, it.pos.z - actor.pos.z);
      if (d < bd) { best = it; bd = d; }
    }
    return best;
  }

  // Burst a chest into a guaranteed gun (one tier better than the spot) + gear.
  openChest(actor, chest) {
    if (chest.taken) return;
    const C = BR.CONFIG, U = BR.util, R = Math.random;
    const tier = Math.min(chest.tier + 1, C.loot.tables.length - 1);
    const wid = U.weighted(this.weaponTable(C.loot.tables[tier]), R);
    const def = C.weapons[wid];
    const p = chest.pos, out = [];
    out.push({ kind: 'weapon', wid, mag: def.mag, reserve: def.mag });
    out.push({ kind: 'ammo', ammoType: def.ammo, amount: C.ammoPickup[def.ammo] * 2 });
    out.push(R() < 0.5 ? { kind: 'shield', amount: C.loot.shieldAmount } : { kind: 'heal', amount: C.loot.healAmount });
    if (R() < 0.6) out.push({ kind: 'shield', amount: C.loot.shieldAmount });
    // Spread items in front of the chest, toward the opener
    const ang0 = Math.atan2(actor.pos.z - p.z, actor.pos.x - p.x);
    out.forEach((d, i) => {
      const a = ang0 + (i - (out.length - 1) / 2) * 0.7;
      this.add(d, p.x + Math.cos(a) * 0.4, p.y + 0.6, p.z + Math.sin(a) * 0.4, new THREE.Vector3(Math.cos(a) * 2.6, 5.5 + Math.random() * 1.5, Math.sin(a) * 2.6));
    });
    this.game.onChestOpened(actor, chest);
    this.remove(chest);
  }

  // Drop the held weapon and take this one.
  swap(actor, item) {
    if (item.taken) return;
    // Holding the karambit: replace gun slot 0 (or fill an empty one)
    if (actor.cur === 2) actor.cur = actor.slots[0] && !actor.slots[1] ? 1 : 0;
    const old = actor.weapon;
    if (old) {
      const fx = -Math.sin(actor.yaw), fz = -Math.cos(actor.yaw);
      this.add({ kind: 'weapon', wid: old.id, mag: old.mag, reserve: 0 }, actor.pos.x + fx * 0.5, actor.pos.y + 1.0, actor.pos.z + fz * 0.5, new THREE.Vector3(fx * 3.2, 4, fz * 3.2));
    }
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
    const empty = actor.guns().some(s => !s);
    const worst = empty ? -1 : Math.min(...actor.guns().map(s => s.def.tier));
    const heldAmmo = new Set(actor.guns().filter(Boolean).map(s => s.def.ammo));
    for (const it of this.items) {
      if (Math.abs(it.pos.y - actor.pos.y) > 2.5) continue; // bots have no pathfinding: skip roofs
      const d = actor.pos.distanceTo(it.pos);
      if (d >= bestD) continue;
      let want = false;
      if (it.kind === 'chest') want = true;
      else if (it.kind === 'weapon') want = !actor.hasWeapon(it.wid) && C.weapons[it.wid].tier > worst;
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
    const spot = () => { const a = k++ * 2.1 + Math.random() * 0.4; return [p.x + Math.cos(a) * 0.3, p.y + 0.9, p.z + Math.sin(a) * 0.3, new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 1.5), 4.5 + Math.random() * 2, Math.sin(a) * (2 + Math.random() * 1.5))]; };
    for (const w of actor.guns()) if (w) this.add({ kind: 'weapon', wid: w.id, mag: w.mag, reserve: 0 }, ...spot());
    for (const t in actor.ammo) if (actor.ammo[t] > 0) this.add({ kind: 'ammo', ammoType: t, amount: actor.ammo[t] }, ...spot());
    if (actor.shield > 0 || Math.random() < 0.5) this.add({ kind: 'shield', amount: BR.CONFIG.loot.shieldAmount }, ...spot());
  }

  clear() {
    for (const it of this.items) this.game.scene.remove(it.mesh);
    this.items.length = 0;
  }
};
