'use strict';
// =============================================================================
// BOT BRAIN — fills in an Actor's input like a player would (move stick, look,
// jump, slide, fire). Bots obey the exact same movement + weapon rules.
//
// States: drop -> loot / roam / zone -> fight
// =============================================================================
const PREF_DIST = { knife: 1.5, pistol: 14, smg: 10, shotgun: 6, rifle: 24, holoar: 30, hunter: 38, sniper: 55 };

BR.BotBrain = class BotBrain {
  constructor(actor, game, diff) {
    this.a = actor;
    actor.mover.chuteAt = 24 + Math.random() * 36;   // bots open their parachutes at different heights
    this.g = game;
    this.d = diff;
    this.state = 'drop';
    this.target = null;
    this.targetSeenT = 0;
    this.engageT = 0;
    this.thinkT = Math.random() * 0.3;
    this.aimOff = new THREE.Vector3();      // current (eased) aim error
    this.aimOffGoal = new THREE.Vector3();  // where the aim error is drifting to
    this.aimOffT = 0;
    this.yawVel = 0; this.pitchVel = 0;     // smoothed turn velocity (no snapping)
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.goal = null;
    this.lootGoal = null;
    this.stuckT = 0;
    this.stuckCheck = new THREE.Vector3();
    this.detourT = 0;
    this.detour = { x: 0, z: 0 };
    this.burstT = 0;
    this.pauseT = 0;
    this.moveJumpT = 1 + Math.random() * 3;
    this.heard = null;
    this.heardT = 0;
    this.obstacleJumpCd = 0;
    const H = game.world.half;
    this.dropTarget = { x: (Math.random() * 2 - 1) * H * 0.8, z: (Math.random() * 2 - 1) * H * 0.8 };
    // Many bots dive for towns, like real players do
    if (Math.random() < 0.4 && game.world.towns.length) {
      const t = game.world.towns[Math.floor(Math.random() * game.world.towns.length)];
      this.dropTarget = { x: t.x + (Math.random() - 0.5) * 30, z: t.z + (Math.random() - 0.5) * 30 };
    }
  }

  // Called by the game when this bot is shot or hears gunfire.
  onDamaged(attacker) {
    if (attacker && attacker !== this.a && attacker.alive && (!this.target || !this.canSee(this.target))) {
      this.target = attacker;
      this.targetSeenT = this.g.time;
      this.engageT = Math.min(this.engageT, 0.1);
    }
  }
  onHeard(shooter) {
    if (!this.target) { this.heard = shooter.pos.clone(); this.heardT = 3; }
  }

  canSee(t) {
    const a = this.a, e = this.g._v1.set(0, 0, 0);
    a.eye(e);
    return this.g.world.lineOfSight(e.x, e.y, e.z, t.pos.x, t.pos.y + t.mover.h * 0.7, t.pos.z);
  }

  update(dt) {
    const a = this.a, m = a.mover, g = this.g;
    const inp = a.input;
    inp.mx = 0; inp.mz = 0;
    a.fireHeld = false;

    if (m.dropping) {
      this.steerTo(this.dropTarget.x, this.dropTarget.z, dt, 1);
      this.landedT = 0;
      return;
    }
    this.landedT = (this.landedT || 0) + dt;

    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.22 + Math.random() * 0.1; this.think(); }
    this.obstacleJumpCd -= dt;
    this.heardT -= dt;

    if (this.target) this.fight(dt);
    else {
      this.engageT = 0;
      let gx, gz;
      if (this.state === 'zone' || !this.goal) { const z = g.zone; gx = z.nextX; gz = z.nextZ; }
      else { gx = this.goal.x; gz = this.goal.z; }
      if (this.heardT > 0 && this.heard) this.lookToward(this.heard.x, this.heard.y + 1, this.heard.z, dt);
      this.steerTo(gx, gz, dt, this.heardT > 0 ? 0 : 1);
      // reload when calm
      const w = a.weapon;
      if (w && w.mag < w.def.mag * 0.6) BR.Weapons.startReload(w, a);
    }
    this.unstick(dt);
    // Practice-mode dummies: passive bots never shoot; still bots don't move either
    if (this.passive) a.fireHeld = false;
    if (this.still) { inp.mx = inp.mz = 0; inp.jump = inp.crouch = false; }
  }

  think() {
    const a = this.a, g = this.g, d = this.d;
    // Drop dead/lost targets
    if (this.target) {
      const t = this.target;
      if (!t.alive) this.target = null;
      else {
        const dist = a.pos.distanceTo(t.pos);
        if (this.canSee(t)) this.targetSeenT = g.time;
        if (dist > d.viewDist * 1.4 || g.time - this.targetSeenT > 3) this.target = null;
      }
    }
    // Look for someone to fight. Early on bots focus on looting and only fight
    // up close; late in the match they hunt from further away.
    const early = Math.max(0, 1 - g.time / BR.CONFIG.match.botLootPhase);
    let engage = d.viewDist * (1 - 0.85 * early);
    if (g.aliveCount() <= 5) engage *= 1.3;
    let best = null, bestD = engage;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const o of g.actors) {
      if (o === a || !o.alive || o.mover.dropping) continue;
      const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestD) continue;
      const cos = (dx * fx + dz * fz) / (dist || 1);
      if (dist > 10 && Math.acos(BR.util.clamp(cos, -1, 1)) > d.fov * 0.5) continue;
      if (!this.canSee(o)) continue;
      best = o; bestD = dist;
    }
    if (best && (!this.target || (best !== this.target && bestD < a.pos.distanceTo(this.target.pos) * 0.6))) {
      if (best !== this.target) this.engageT = 0;
      this.target = best;
      this.targetSeenT = g.time;
    }

    // Pick the best weapon for the range
    if (this.target) {
      const dist = a.pos.distanceTo(this.target.pos);
      let bi = a.cur, bs = -1;
      bi = 2; bs = -1; // karambit only if no gun has ammo
      a.slots.forEach((w, i) => {
        if (!w || w.def.melee || (w.mag === 0 && a.ammo[w.def.ammo] === 0)) return;
        const pd = PREF_DIST[w.id];
        const s = 100 - Math.abs(dist - pd) * (w.id === 'sniper' ? 0.8 : 2) + w.def.tier * 5;
        if (s > bs) { bs = s; bi = i; }
      });
      if (bi !== a.cur) a.switchTo(bi);
    }

    // Zone logic
    const z = g.zone;
    const dNext = Math.hypot(a.pos.x - z.nextX, a.pos.z - z.nextZ);
    const dCur = Math.hypot(a.pos.x - z.x, a.pos.z - z.z);
    const outside = dCur > z.r - 3 || (dNext > z.nextR * 0.85 && z.timeLeft() < 25);
    if (outside && !(this.target && dCur < z.r - 8)) { this.state = 'zone'; this.target = this.target && dCur < z.r ? this.target : null; return; }

    if (this.target) { this.state = 'fight'; return; }

    // Loot: something useful nearby?
    if (this.lootGoal && (this.lootGoal.taken || a.pos.distanceTo(this.lootGoal.pos) > 45)) this.lootGoal = null;
    if (!this.lootGoal) this.lootGoal = g.loot.findWanted(a, 35);
    if (this.lootGoal) { this.state = 'loot'; this.goal = this.lootGoal.pos; return; }

    // Roam inside the next safe circle
    if (this.state !== 'roam' || !this.goal || Math.hypot(a.pos.x - this.goal.x, a.pos.z - this.goal.z) < 4) {
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * z.nextR * 0.75;
      this.goal = { x: z.nextX + Math.cos(ang) * rr, y: 0, z: z.nextZ + Math.sin(ang) * rr };
    }
    this.state = 'roam';
  }

  fight(dt) {
    const a = this.a, g = this.g, d = this.d, t = this.target, m = a.mover;
    const w = a.weapon;
    const eye = a.eye(g._v2);
    const tx = t.pos.x, ty = t.pos.y + t.mover.h * 0.62, tz = t.pos.z;
    const dist = Math.hypot(tx - eye.x, ty - eye.y, tz - eye.z);
    this.engageT += dt;

    // Aim error shrinks the longer we track the target, grows with target speed
    this.aimOffT -= dt;
    if (this.aimOffT <= 0) {
      this.aimOffT = 0.22 + Math.random() * 0.25;
      const err = d.aimError * (0.55 + 1.6 * Math.exp(-this.engageT / d.settle)) * (1 + t.mover.speedH * 0.06);
      this.aimOffGoal.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(err * Math.random());
    }
    // ease the error instead of snapping, so bot aim drifts like a thumb would
    this.aimOff.lerp(this.aimOffGoal, 1 - Math.exp(-dt * 7));
    const ax = tx + this.aimOff.x, ay = ty + this.aimOff.y, az = tz + this.aimOff.z;
    const aimErr = this.lookToward(ax, ay, az, dt);

    // Movement: hold preferred range + strafe
    const pd = w ? PREF_DIST[w.id] : 12;
    const dx = (tx - a.pos.x) / (dist || 1), dz = (tz - a.pos.z) / (dist || 1);
    let radial = dist > pd * 1.25 ? 1 : dist < pd * 0.7 ? -1 : 0;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 0.5 + Math.random() * 1.0; this.strafe = Math.random() < 0.5 ? 1 : -1; }
    const mx = dx * radial + -dz * this.strafe * 0.9, mz = dz * radial + dx * this.strafe * 0.9;
    this.moveWorld(mx, mz);

    // Movement tech: random jumps/slides scale with difficulty
    this.moveJumpT -= dt;
    if (this.moveJumpT <= 0) {
      this.moveJumpT = 1.2 + Math.random() * 3;
      if (Math.random() < d.jumpiness) { if (Math.random() < 0.5) a.input.jump = true; else a.input.crouch = true; }
    }

    // Trigger discipline: bursts and pauses
    if (!w) return;
    const visible = g.time - this.targetSeenT < 0.3;
    if (!w.def.melee && w.mag === 0) { BR.Weapons.startReload(w, a); return; }
    if (this.burstT > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) this.pauseT = BR.util.rand(Math.random, d.pause[0], d.pause[1]);
    } else if (this.pauseT > 0) this.pauseT -= dt;
    else this.burstT = BR.util.rand(Math.random, d.burst[0], d.burst[1]);
    const tol = 0.06 + 0.9 / Math.max(dist, 1);
    // Grace period after landing so drops aren't instant deaths
    if (this.landedT < 2.5) return;
    if (visible && this.engageT > d.reaction && aimErr < tol && dist < w.def.range * 2.2 && this.burstT > 0) a.fireHeld = true;
  }

  // Rotate toward a point smoothly: the turn speed eases in/out (critically damped
  // toward the target, capped at turnRate) so bot aim never snaps. Returns the
  // remaining angle error.
  lookToward(x, y, z, dt) {
    const a = this.a, e = a.eye(this.g._v3);
    const dx = x - e.x, dy = y - e.y, dz = z - e.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const max = this.d.turnRate, k = 9;
    const dyaw = BR.util.wrapAngle(yaw - a.yaw), dp = pitch - a.pitch;
    const wantY = BR.util.clamp(dyaw * k, -max, max), wantP = BR.util.clamp(dp * k, -max, max);
    const ease = 1 - Math.exp(-dt * 14);
    this.yawVel += (wantY - this.yawVel) * ease;
    this.pitchVel += (wantP - this.pitchVel) * ease;
    let sy = this.yawVel * dt, sp = this.pitchVel * dt;
    if (Math.abs(sy) > Math.abs(dyaw)) sy = dyaw;          // never overshoot
    if (Math.abs(sp) > Math.abs(dp)) sp = dp;
    a.yaw += sy;
    a.pitch = BR.util.clamp(a.pitch + sp, -1.45, 1.45);
    return Math.abs(BR.util.wrapAngle(yaw - a.yaw)) + Math.abs(pitch - a.pitch);
  }

  // Convert a world-space move direction into stick input relative to yaw.
  moveWorld(wx, wz) {
    const a = this.a;
    if (this.detourT > 0) { wx = this.detour.x; wz = this.detour.z; }
    const l = Math.hypot(wx, wz);
    if (l < 1e-3) return;
    wx /= l; wz /= l;
    const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    a.input.mz = wx * -sy + wz * -cy;
    a.input.mx = wx * cy + wz * -sy;
  }

  steerTo(x, z, dt, faceMove) {
    const a = this.a;
    const dx = x - a.pos.x, dz = z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.0 && !a.mover.dropping) return;
    if (faceMove) {
      const yaw = Math.atan2(-(this.detourT > 0 ? this.detour.x : dx), -(this.detourT > 0 ? this.detour.z : dz));
      const tr = 5 * dt;
      a.yaw += BR.util.clamp(BR.util.wrapAngle(yaw - a.yaw), -tr, tr);
      a.pitch = BR.util.damp(a.pitch, 0, 4, dt);
    }
    this.moveWorld(dx, dz);
    // Occasionally slide-hop when travelling (looks alive + faster)
    this.moveJumpT -= dt;
    if (this.moveJumpT <= 0 && dist > 15) {
      this.moveJumpT = 2 + Math.random() * 4;
      if (Math.random() < this.d.jumpiness && a.mover.speedH > 6) a.input.crouch = true;
    }
  }

  // Jump at walls, and detour sideways when we stop making progress.
  unstick(dt) {
    const a = this.a, m = a.mover;
    this.detourT -= dt;
    const wants = Math.abs(a.input.mx) + Math.abs(a.input.mz) > 0.3;
    if (wants && m.wallContactT < 0.05 && m.onGround && this.obstacleJumpCd <= 0) {
      a.input.jump = true;
      a.input.mz = Math.max(a.input.mz, 0.6);
      this.obstacleJumpCd = 0.7;
    }
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = Math.hypot(a.pos.x - this.stuckCheck.x, a.pos.z - this.stuckCheck.z);
      if (wants && moved < 0.8) {
        const ang = Math.random() * Math.PI * 2;
        this.detour.x = Math.cos(ang); this.detour.z = Math.sin(ang);
        this.detourT = 0.9;
        this.goal = null;
      }
      this.stuckCheck.copy(a.pos);
      this.stuckT = 0;
    }
  }
};
