'use strict';
// =============================================================================
// WEAPONS — hitscan guns. Stats live in CONFIG.weapons.
// A weapon "instance" is { id, def, mag, cool, reloadT, bloom }.
// =============================================================================
BR.Weapons = {
  create(id, mag) {
    const def = BR.CONFIG.weapons[id];
    return { id, def, mag: mag === undefined ? def.mag : mag, cool: 0, reloadT: 0, bloom: 0 };
  },

  update(w, dt, actor) {
    w.cool -= dt;
    w.bloom = Math.max(0, w.bloom - dt * 0.12);
    if (w.reloadT > 0) {
      w.reloadT -= dt;
      if (w.reloadT <= 0) {
        w.reloadT = 0;
        const need = w.def.mag - w.mag;
        const have = actor.ammo[w.def.ammo];
        const take = Math.min(need, have);
        w.mag += take;
        actor.ammo[w.def.ammo] -= take;
      }
    }
  },

  canReload(w, actor) {
    return w && w.reloadT <= 0 && w.mag < w.def.mag && actor.ammo[w.def.ammo] > 0;
  },

  startReload(w, actor) {
    if (!this.canReload(w, actor)) return false;
    w.reloadT = w.def.reload;
    return true;
  },

  spread(actor, w) {
    const d = w.def, m = actor.mover;
    let s = d.spread;
    if (actor.ads) s *= d.ads;
    const speed = Math.min(1, m.speedH / BR.CONFIG.move.runSpeed);
    s += speed * d.spread * 0.5;
    if (!m.onGround && !m.wallRunning) s += d.spread * 0.6 + 0.01;
    if (m.sliding) s *= 0.85;
    return s + w.bloom;
  },

  // Fire once if possible. Returns true when a shot went out.
  tryFire(game, actor) {
    const w = actor.weapon;
    if (!w || w.reloadT > 0 || w.cool > 0) return false;
    if (w.mag <= 0) {
      if (!this.startReload(w, actor) && actor.isPlayer && w.cool <= 0) {
        BR.Audio.click();
        w.cool = 0.3;
      }
      return false;
    }
    const d = w.def;
    w.cool = 60 / d.rpm;
    w.mag--;
    const spread = this.spread(actor, w);
    const eye = actor.eye(this._eye || (this._eye = new THREE.Vector3()));
    const dir = actor.aimDir(this._dir || (this._dir = new THREE.Vector3()));
    // Orthonormal basis for the spread cone
    const up = Math.abs(dir.y) > 0.95 ? this._ax || (this._ax = new THREE.Vector3(1, 0, 0)) : this._ay || (this._ay = new THREE.Vector3(0, 1, 0));
    const u = (this._u || (this._u = new THREE.Vector3())).crossVectors(dir, up).normalize();
    const v = (this._v || (this._v = new THREE.Vector3())).crossVectors(u, dir).normalize();
    const pd = this._pd || (this._pd = new THREE.Vector3());
    const hits = this._hits || (this._hits = new Map());
    hits.clear();
    const muzzle = game.muzzlePoint(actor, this._mz || (this._mz = new THREE.Vector3()));
    const maxRange = Math.min(d.range * 2.5, 420);

    for (let p = 0; p < d.pellets; p++) {
      const a = Math.random() * Math.PI * 2, rr = spread * Math.sqrt(Math.random());
      pd.copy(dir).addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr).normalize();
      const hit = game.hitscan(actor, eye, pd, maxRange);
      const end = this._end || (this._end = new THREE.Vector3());
      end.copy(eye).addScaledVector(pd, hit.t);
      if (hit.actor) {
        const falloff = hit.t <= d.range ? 1 : Math.max(0.55, 1 - 0.45 * (hit.t - d.range) / d.range);
        const dmg = d.dmg * falloff * (hit.head ? d.head : 1);
        const prev = hits.get(hit.actor);
        if (prev) { prev.dmg += dmg; prev.head = prev.head || hit.head; }
        else hits.set(hit.actor, { dmg, head: hit.head, x: end.x, y: end.y, z: end.z });
      } else if (hit.t < maxRange) {
        game.fx.impact(end, false);
      }
      if (p < 3 || actor.isPlayer) game.fx.tracer(muzzle, end, actor.isPlayer);
    }
    hits.forEach((h, victim) => game.applyDamage(victim, actor, h.dmg, h.head, h, w.id));

    // TECH shotgun jump: big guns push you backwards when airborne (or aimed at your feet)
    const mv = actor.mover;
    if (d.knockback && (!mv.onGround || dir.y < -0.6)) {
      mv.vel.addScaledVector(dir, -d.knockback);
      if (dir.y < -0.3) { mv.onGround = false; mv.events.tech = d.pellets > 1 ? 'SHOTGUN JUMP' : 'RECOIL JUMP'; }
    }
    w.bloom = Math.min(d.bloomMax, w.bloom + d.bloom);
    if (actor.isPlayer) {
      actor.recoil += d.recoil * (actor.ads ? 0.6 : 1);
      actor.yaw += (Math.random() - 0.5) * d.recoil * 0.4;
    }
    game.onShot(actor, w);
    return true;
  },
};
