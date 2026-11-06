'use strict';
// =============================================================================
// WEAPONS — hitscan guns + the karambit. Stats live in CONFIG.weapons.
// A weapon "instance" is { id, def, mag, cool, reloadT, bloom }.
// =============================================================================
BR.Weapons = {
  // rar: 0 common .. 5 mythic (BR.RARITY). Above common the instance gets its own scaled stats.
  create(id, mag, rar) {
    let def = BR.CONFIG.weapons[id];
    rar = def.melee ? 0 : Math.max(0, Math.min(5, rar | 0));
    if (rar > 0) { const R = BR.RARITY[rar]; def = Object.assign({}, def, { dmg: def.dmg * R.dmg, reload: def.reload * R.reload, spread: def.spread * R.spread, bloomMax: def.bloomMax * R.spread, rar }); }
    return { id, def, rar, mag: mag === undefined ? def.mag : mag, cool: 0, reloadT: 0, bloom: 0 };
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
    if (game.mode && game.mode.frozen) return false;          // v1.15: nobody shoots or swings before the round starts
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

    // v1.17.2 Shockwave Launcher: fire a shockwave grenade out of the muzzle instead of a hitscan round
    if (d.launcher && game.shock) {
      const aim = (this._la || (this._la = new THREE.Vector3())).copy(dir).addScaledVector(u, (Math.random() - 0.5) * spread).addScaledVector(v, (Math.random() - 0.5) * spread).normalize();
      // start from the shooter (just in front of the eyes, a touch right + down where the barrel is), not the
      // on-screen muzzle, so a respawn / teleport can never leave the shot behind
      const right = (this._lr || (this._lr = new THREE.Vector3())).set(Math.cos(actor.yaw), 0, -Math.sin(actor.yaw));
      const from = eye.clone().addScaledVector(aim, 0.6).addScaledVector(right, 0.12); from.y -= 0.1;
      game.shock.launch(actor, from, aim, d.launchSpeed || 38, d.blastDamage || 40);
    }
    for (let p = 0; p < (d.launcher ? 0 : d.pellets); p++) {
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
      if (d.pelletAssist && !hit.actor && !hit.target) (this._miss || (this._miss = [])).push({ d: pd.clone(), t: hit.t });
      if (actor.isPlayer && game.zm) game.zm.shotAt(eye, pd, hit.t);
      end.copy(eye).addScaledVector(pd, hit.t);
      if (hit.target) {                                              // a custom-mode target (aim trainer / Overdrive)
        const falloff = hit.t <= d.range ? 1 : Math.max(0.55, 1 - 0.45 * (hit.t - d.range) / d.range);
        const dmg = d.dmg * falloff * (hit.head ? d.head : 1), tm = this._thits || (this._thits = new Map()), prev = tm.get(hit.target);
        if (prev) { prev.dmg += dmg; prev.head = prev.head || hit.head; } else tm.set(hit.target, { dmg, head: hit.head, x: end.x, y: end.y, z: end.z });
      } else if (hit.actor) {
        const falloff = hit.t <= d.range ? 1 : Math.max(0.55, 1 - 0.45 * (hit.t - d.range) / d.range);
        const dmg = d.dmg * falloff * (hit.head ? d.head : 1);
        const prev = hits.get(hit.actor);
        if (prev) { prev.dmg += dmg; prev.head = prev.head || hit.head; }
        else hits.set(hit.actor, { dmg, head: hit.head, x: end.x, y: end.y, z: end.z });
      } else if (hit.t < maxRange) {
        game.fx.impact(end, false);
        // bullet hole on the face that was hit (your shots only)
        if (actor.isPlayer && game.fx.decal) {
          const b = game.world.hit.box, n = this._dn || (this._dn = new THREE.Vector3());
          if (!b || b === game.world.ground) n.set(0, 1, 0);
          else {
            const d = [[Math.abs(end.x - b.x0), -1, 0, 0], [Math.abs(end.x - b.x1), 1, 0, 0], [Math.abs(end.y - b.y0), 0, -1, 0], [Math.abs(end.y - b.y1), 0, 1, 0], [Math.abs(end.z - b.z0), 0, 0, -1], [Math.abs(end.z - b.z1), 0, 0, 1]];
            d.sort((a, c) => a[0] - c[0]); n.set(d[0][1], d[0][2], d[0][3]);
          }
          game.fx.decal(end, n);
          // hard surfaces kick up a few hot sparks (not every pellet)
          if (p < 2 && Math.random() < 0.7) game.fx.burst(end, [0xffd27a, 0xffffff, 0xffa040], 3, 3.2, 0.035, 0.22, 9);
        }
      }
      if (p < 3 || actor.isPlayer || d.pattern === 'line') game.fx.tracer(muzzle, end, actor.isPlayer, game.tracerColor(actor), game.tracerOpts(actor));
      if (game.mode && game.mode.netShot && p < 3) game.mode.netShot(actor, muzzle, end, w.id, p === 0);      // online: show this shot on the other screens
      else if (game.brnet && p < 3) game.brnet.netShot(actor, muzzle, end, w.id, p === 0);
    }
    // v1.23: a shotgun blast lands as one: a pellet that only grazes past someone the blast already hit (and didn't hit a
    // wall first) still counts on them, so a well-placed shot deals its full damage instead of 2 stray pellets
    if (this._miss && this._miss.length) {
      for (const m of this._miss) {
        let best = null, bd = d.pelletAssist;
        hits.forEach((h, victim) => { const c = victim.pos, cy = c.y + (victim.mover ? victim.mover.h * 0.55 : 0.9), dx = c.x - eye.x, dy = cy - eye.y, dz = c.z - eye.z;
          const along = dx * m.d.x + dy * m.d.y + dz * m.d.z; if (along <= 0 || along > d.range * 1.3 || m.t < along - 0.3) return;
          const off = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along)); if (off < bd) { bd = off; best = h; } });
        if (best) best.dmg += d.dmg;
      }
      this._miss.length = 0;
    }
    hits.forEach((h, victim) => game.applyDamage(victim, actor, h.dmg, h.head, h, w.id));
    if (this._thits && this._thits.size) { if (game.mode && game.mode.hitTarget) this._thits.forEach((h, t) => game.mode.hitTarget(t, h.dmg, h.head, h, w)); this._thits.clear(); }
    if (actor.isPlayer && game.mode && game.mode.onShot) game.mode.onShot(w);

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
      // Spray recoil you can learn and control (aiming tames it):
      //  - the first shot is near-perfect, the climb ramps up over ~5 shots, then levels off and eases
      //    once the gun "settles" (long sprays stay controllable)
      //  - sideways the gun snakes smoothly left/right (a sine sway whose side and phase change every
      //    spray) instead of jittering, plus a touch of randomness so no two sprays match exactly
      //  - when you let go, the view recovers most of the climb (never past where you started)
      const ads = actor.ads ? 0.6 : 1, now = game.time || 0, gap = 60 / d.rpm;
      if (!(now - (actor.sprayLast ?? -9) <= gap * 2.2 + 0.1)) {
        actor.sprayN = 0; actor.sprayPhase = Math.random() * 6.283; actor.sprayDir = Math.random() < 0.5 ? -1 : 1;
        actor.recoilPull = 0; actor.sprayPitch0 = actor.pitch;
      }
      actor.sprayLast = now; const n = actor.sprayN++;
      let v;
      if (d.recoilH) {
        const ramp = 0.45 + 0.65 * Math.min(1, n / 5) - (n > 14 ? 0.22 : 0);
        v = d.recoil * ramp * (0.88 + Math.random() * 0.24) * ads;
        const side = Math.min(1, n / 6);
        actor.recoilDrift = Math.sin(n * 0.42 + actor.sprayPhase) * actor.sprayDir;
        actor.yaw += d.recoilH * ads * (side * actor.recoilDrift * 0.9 + (Math.random() - 0.5) * 0.35);
      } else {
        // v1.19: semi-autos and heavies climb straight with a small, smooth side drift (no random yaw jitter)
        v = d.recoil * (0.92 + Math.random() * 0.16) * ads;
        actor.yaw += Math.sin(n * 1.3 + actor.sprayPhase) * actor.sprayDir * d.recoil * 0.16 * ads;
      }
      actor.recoil += v; actor.recoilPull = (actor.recoilPull || 0) + v;
    }
    game.onShot(actor, w);
    if (BR.AntiCheat) BR.AntiCheat.onShot(game, actor, w);
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
      if (o === actor || !o.alive || (o.team !== undefined && o.team === actor.team)) continue;     // never lunge at a teammate
      const tx = o.pos.x - eye.x, ty = o.pos.y + o.mover.h * 0.6 - eye.y, tz = o.pos.z - eye.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > bestD) continue;
      const cos = (tx * dir.x + ty * dir.y + tz * dir.z) / (dist || 1);
      if (cos < (dist < 1.5 ? 0.3 : 0.88)) continue;
      if (!this.canReach(game, actor, o)) continue;                // no knifing through walls
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

  // Melee needs a clear line from the attacker's eye to the target's chest or head
  canReach(game, actor, target) {
    const e = actor.eye(this._re || (this._re = new THREE.Vector3())), W = game.world, m = target.mover;
    return W.lineOfSight(e.x, e.y, e.z, m.pos.x, m.pos.y + m.h * 0.6, m.pos.z) || W.lineOfSight(e.x, e.y, e.z, m.pos.x, m.pos.y + m.h - 0.2, m.pos.z);
  },

  meleeHit(game, actor, target, w) {
    const d = w.def;
    if (!this.canReach(game, actor, target)) return;            // a wall got in the way (e.g. mid-lunge)
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
