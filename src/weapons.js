'use strict';
// =============================================================================
// WEAPONS — hitscan guns + the karambit. Stats live in CONFIG.weapons.
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
        const have = actor.ammo[w.def.ammo];
        if (w.def.shellReload) {
          // one shell at a time; keeps going until full or out of shells
          if (have > 0 && w.mag < w.def.mag) { w.mag++; actor.ammo[w.def.ammo]--; }
          w.reloadT = w.mag < w.def.mag && actor.ammo[w.def.ammo] > 0 ? w.def.reload : 0;
          if (actor.isPlayer && actor.game) actor.game.onShellLoaded();
        } else {
          w.reloadT = 0;
          const take = Math.min(w.def.mag - w.mag, have);
          w.mag += take;
          actor.ammo[w.def.ammo] -= take;
        }
      }
    }
  },

  canReload(w, actor) {
    return w && !w.def.melee && w.reloadT <= 0 && w.mag < w.def.mag && actor.ammo[w.def.ammo] > 0;
  },

  startReload(w, actor) {
    if (!this.canReload(w, actor)) return false;
    w.reloadT = w.def.reload;
    return true;
  },

  spread(actor, w) {
    const d = w.def, m = actor.mover;
    if (d.melee) return 0;
    let s = d.spread;
    if (actor.ads) s *= d.ads;
    if (d.pattern === 'line') return s * (m.onGround ? 1 : 1.1); // the line pattern is the spread
    const speed = Math.min(1, m.speedH / BR.CONFIG.move.runSpeed);
    const pen = d.easyHip ? 0.25 : 1;              // hunting rifle: movement barely hurts accuracy
    s += speed * d.spread * 0.5 * pen;
    if (!m.onGround && !m.wallRunning) s += (d.spread * 0.6 + 0.01) * pen;
    if (m.sliding || m.crouched) s *= 0.85;
    return s + w.bloom;
  },

  // Fire once if possible. Returns true when a shot (or swing) went out.
  tryFire(game, actor) {
    const w = actor.weapon;
    if (!w || w.cool > 0) return false;
    if (w.def.melee) return this.melee(game, actor, w);
    // Shell-by-shell reloads can be cancelled by shooting
    if (w.reloadT > 0) { if (w.def.shellReload && w.mag > 0) w.reloadT = 0; else return false; }
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
    // Basis for the spread: u = right, v = up (relative to the aim)
    const worldUp = this._ay || (this._ay = new THREE.Vector3(0, 1, 0));
    const u = (this._u || (this._u = new THREE.Vector3())).crossVectors(dir, worldUp);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const v = (this._v || (this._v = new THREE.Vector3())).crossVectors(u, dir).normalize();
    const pd = this._pd || (this._pd = new THREE.Vector3());
    const hits = this._hits || (this._hits = new Map());
    hits.clear();
    const muzzle = game.muzzlePoint(actor, this._mz || (this._mz = new THREE.Vector3()));
    const maxRange = Math.min(d.range * 2.5, 420);
    const end = this._end || (this._end = new THREE.Vector3());

    for (let p = 0; p < d.pellets; p++) {
      if (d.pattern === 'line') {
        // Horizontal line of pellets, like a door-breaching shotgun
        const k = d.pellets > 1 ? p / (d.pellets - 1) - 0.5 : 0;
        const ox = k * 2 * spread + (Math.random() - 0.5) * spread * 0.08;
        const oy = (Math.random() - 0.5) * spread * 0.12;
        pd.copy(dir).addScaledVector(u, ox).addScaledVector(v, oy).normalize();
      } else {
        const a = Math.random() * Math.PI * 2, rr = spread * Math.sqrt(Math.random());
        pd.copy(dir).addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr).normalize();
      }
      const hit = game.hitscan(actor, eye, pd, maxRange);
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
      if (p < 3 || actor.isPlayer || d.pattern === 'line') game.fx.tracer(muzzle, end, actor.isPlayer, game.tracerColor(actor), game.tracerOpts(actor));
    }
    hits.forEach((h, victim) => game.applyDamage(victim, actor, h.dmg, h.head, h, w.id));

    // TECH shotgun jump: big guns blast you away from where you aim when airborne,
    // and launch you upward when aimed at your feet.
    const mv = actor.mover;
    if (d.knockback && (!mv.onGround || dir.y < -0.45)) {
      const k = d.knockback;
      if (dir.y < -0.45) {
        const down = -dir.y;
        mv.vel.y = Math.max(mv.vel.y, 0) + k * down + 2.5;          // straight-up launch
        mv.vel.x -= dir.x * k * 0.55; mv.vel.z -= dir.z * k * 0.55;  // plus a shove away from the aim
        mv.onGround = false; mv.sliding = false; mv.crouched = false;
        mv.events.tech = d.pellets > 1 ? (mv.sinceLand === 0 && !mv.wasGround ? 'AIR BLAST' : 'SHOTGUN JUMP') : 'RECOIL JUMP';
      } else {
        mv.vel.addScaledVector(dir, -k * 0.7);
        if (d.pellets > 1) mv.events.tech = 'AIR BLAST';
      }
      game.onBlast(actor, d.pellets > 1 ? 1 : 0.4);
    }
    w.bloom = Math.min(d.bloomMax, w.bloom + d.bloom);
    if (actor.isPlayer) {
      // Random recoil: vertical kick varies shot to shot; automatic rifles also wander
      // sideways on a random walk, so sprays need control. Aiming tames it.
      const ads = actor.ads ? 0.6 : 1;
      actor.recoil += d.recoil * (0.75 + Math.random() * 0.5) * ads;
      if (d.recoilH) {
        actor.recoilDrift = BR.util.clamp((actor.recoilDrift || 0) * 0.85 + (Math.random() - 0.5) * 0.9, -1, 1);
        actor.yaw += (actor.recoilDrift * 0.7 + (Math.random() - 0.5) * 0.6) * d.recoilH * ads;
      } else actor.yaw += (Math.random() - 0.5) * d.recoil * 0.4;
    }
    game.onShot(actor, w);
    return true;
  },

  // Karambit: slash anything in front of you. If someone is a few meters ahead
  // in your crosshair, you lunge at them. Hits from behind are a backstab.
  melee(game, actor, w) {
    const d = w.def;
    w.cool = 60 / d.rpm;
    const eye = actor.eye(this._eye || (this._eye = new THREE.Vector3()));
    const dir = actor.aimDir(this._dir || (this._dir = new THREE.Vector3()));
    let best = null, bestD = d.lunge;
    for (const o of game.actors) {
      if (o === actor || !o.alive) continue;
      const tx = o.pos.x - eye.x, ty = o.pos.y + o.mover.h * 0.6 - eye.y, tz = o.pos.z - eye.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > bestD) continue;
      const cos = (tx * dir.x + ty * dir.y + tz * dir.z) / (dist || 1);
      if (cos < (dist < 1.5 ? 0.3 : 0.88)) continue;
      best = o; bestD = dist;
    }
    if (best && bestD > d.range) {
      // Lunge: dash at the target, the hit lands when we arrive
      const m = actor.mover, dx = best.pos.x - actor.pos.x, dz = best.pos.z - actor.pos.z, l = Math.hypot(dx, dz) || 1;
      m.vel.x = dx / l * 13; m.vel.z = dz / l * 13; if (m.onGround) m.vel.y = 2;
      actor.lunge = { target: best, t: 0.35 };
    } else if (best) {
      this.meleeHit(game, actor, best, w);
    } else {
      const h = game.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, d.range);
      if (h.t < d.range) { const p = this._end || (this._end = new THREE.Vector3()); p.copy(eye).addScaledVector(dir, h.t); game.fx.impact(p, false); }
    }
    game.onMelee(actor, !!best);
    return true;
  },

  meleeHit(game, actor, target, w) {
    const d = w.def;
    // Backstab if the target is facing away from us
    const tf = { x: -Math.sin(target.yaw), z: -Math.cos(target.yaw) };
    const dx = target.pos.x - actor.pos.x, dz = target.pos.z - actor.pos.z, l = Math.hypot(dx, dz) || 1;
    const back = (tf.x * dx + tf.z * dz) / l > 0.55;
    const dmg = back ? d.backstab : d.dmg;
    const at = { x: target.pos.x, y: target.pos.y + target.mover.h * 0.7, z: target.pos.z };
    game.applyDamage(target, actor, dmg, false, at, w.id);
    if (back && actor.isPlayer) game.hud.tech('BACKSTAB');
  },
};
