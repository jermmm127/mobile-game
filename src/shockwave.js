'use strict';
// =============================================================================
// SHOCKWAVE GRENADES — a movement item for trickshots. Throw (HUD "NADE" button
// or T), it arcs and detonates on contact (or after its fuse) in a purple
// shockwave that launches everyone nearby — you included — away from the blast
// and up into the air. Enemies take a little damage; you take none.
//
//   CONFIG.shockwave: radius, launch strength, carry cap, fuse...
//   game.shock.throw(actor)   -> true if thrown
//   game.shock.update(dt)     -> flies grenades + animates blasts
// =============================================================================
BR.Shockwave = class Shockwave {
  constructor(game) {
    this.game = game;
    this.nades = [];
    this.blasts = [];
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
    this.geo = {
      sphere: new THREE.SphereGeometry(1, 24, 16),
      ring: new THREE.RingGeometry(0.82, 1, 48),
    };
    this.pool = [];
    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(this.geo.sphere, new THREE.MeshBasicMaterial(Object.assign({ color: 0xa64bff, opacity: 0 }, add)));
      const core = new THREE.Mesh(this.geo.sphere, new THREE.MeshBasicMaterial(Object.assign({ color: 0xffd6ff, opacity: 0 }, add)));
      const r1 = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial(Object.assign({ color: 0xc77dff, opacity: 0 }, add)));
      const r2 = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial(Object.assign({ color: 0xff5cf0, opacity: 0 }, add)));
      const r3 = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial(Object.assign({ color: 0x7b2cff, opacity: 0 }, add)));
      r1.rotation.x = -Math.PI / 2;
      for (const m of [shell, core, r1, r2, r3]) { m.visible = false; m.frustumCulled = false; game.scene.add(m); }
      this.pool.push({ shell, core, r1, r2, r3, t: 9, pos: new THREE.Vector3() });
    }
    this.pi = 0;
  }

  // The grenade itself: dark faceted shell, glowing purple core, two spinning bands.
  static model() {
    const g = new THREE.Group();
    const dark = new THREE.MeshPhongMaterial({ color: 0x1c1626, specular: 0xb48cff, shininess: 80, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ color: 0xb04bff });
    const hot = new THREE.MeshBasicMaterial({ color: 0xffb8ff });
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), dark));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), glow); g.add(core);
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), hot); g.add(pip);
    const b1 = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.008, 8, 28), glow);
    const b2 = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.008, 8, 28), glow); b2.rotation.x = Math.PI / 2;
    g.add(b1, b2);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.03, 10), dark); cap.position.y = 0.085; g.add(cap);
    const ringPin = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 14), new THREE.MeshPhongMaterial({ color: 0xd6d9e0, specular: 0xffffff, shininess: 90 }));
    ringPin.position.set(0.03, 0.1, 0); g.add(ringPin);
    g.userData.anim = [t => { b1.rotation.y = t * 4; b2.rotation.z = t * 3; const k = 0.85 + 0.15 * Math.sin(t * 14); core.scale.setScalar(k); glow.color.setHSL(0.78 + 0.04 * Math.sin(t * 6), 1, 0.6); }];
    return g;
  }

  throw(actor) {
    const C = BR.CONFIG.shockwave, g = this.game;
    if (!actor.alive || (actor.nades || 0) <= 0 || (actor.nadeCd || 0) > 0 || actor.mover.dropping) return false;
    actor.nades--; actor.nadeCd = C.throwCooldown;
    const eye = actor.eye(new THREE.Vector3()), dir = actor.aimDir(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(actor.yaw), 0, -Math.sin(actor.yaw));
    const pos = eye.addScaledVector(dir, 0.55).addScaledVector(right, -0.18).add(new THREE.Vector3(0, -0.12, 0));
    const vel = dir.clone().multiplyScalar(C.throwSpeed).add(new THREE.Vector3(0, C.throwLift, 0)).addScaledVector(actor.mover.vel, 0.6);
    const mesh = Shockwave.model(); mesh.scale.setScalar(1.6); mesh.position.copy(pos);
    g.scene.add(mesh);
    this.nades.push({ pos, vel, mesh, owner: actor, t: 0, trailT: 0 });
    return true;
  }

  // v1.17.2: a grenade fired from the Shockwave Launcher (no grenade used up): fast, flatter arc,
  // bursts on contact, more damage than a thrown one
  launch(actor, pos, dir, speed, damage) {
    const g = this.game;
    const vel = dir.clone().multiplyScalar(speed).addScaledVector(actor.mover.vel, 0.4);
    const mesh = Shockwave.model(); mesh.scale.setScalar(1.25); mesh.position.copy(pos);
    g.scene.add(mesh);
    this.nades.push({ pos: pos.clone(), vel, mesh, owner: actor, t: 0, trailT: 0, fired: true, dmg: damage, grav: 0.45 });
    return true;
  }

  update(dt) {
    const g = this.game, C = BR.CONFIG.shockwave, W = g.world;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      let boom = n.t > C.fuse;
      const steps = 2, h = dt / steps;
      for (let s = 0; s < steps && !boom; s++) {
        n.vel.y -= C.gravity * (n.grav || 1) * h;
        const len = n.vel.length() * h;
        if (len < 1e-5) continue;
        const d = this._d || (this._d = new THREE.Vector3()); d.copy(n.vel).normalize();
        const hit = g.hitscan(n.owner, n.pos, d, len + 0.12);
        if (hit.t < len + 0.12) { n.pos.addScaledVector(d, Math.max(0, hit.t - 0.12)); boom = true; break; }
        n.pos.addScaledVector(n.vel, h);
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += dt * 9; n.mesh.rotation.z += dt * 6;
      BR.Models.animate(n.mesh, g.time);
      n.trailT -= dt;
      if (n.trailT <= 0) { n.trailT = 0.025; g.fx.burst(n.pos, [0xb04bff, 0xff7af5], 2, 0.6, 0.05, 0.3, 0); }
      if (boom) { this.explode(n.pos, n.owner, n.fired ? n.dmg : null); g.scene.remove(n.mesh); this.nades.splice(i, 1); }
    }
    for (const b of this.pool) {
      if (b.t > 1) continue;
      b.t += dt;
      const k = Math.min(1, b.t / 0.45), e = 1 - Math.pow(1 - k, 3), R = C.radius;
      b.shell.scale.setScalar(0.3 + e * R * 0.95); b.shell.material.opacity = 0.55 * (1 - k);
      const kc = Math.min(1, b.t / 0.18);
      b.core.scale.setScalar(0.4 + kc * 2.4); b.core.material.opacity = 0.95 * (1 - kc);
      const kr = Math.min(1, b.t / 0.6), er = 1 - Math.pow(1 - kr, 2);
      b.r1.scale.setScalar(0.3 + er * R * 1.35); b.r1.material.opacity = 0.9 * (1 - kr);
      b.r2.scale.setScalar(0.3 + er * R * 0.9); b.r2.material.opacity = 0.75 * (1 - kr);
      b.r3.scale.setScalar(0.2 + Math.min(1, b.t / 0.35) * R * 0.7); b.r3.material.opacity = 0.8 * (1 - Math.min(1, b.t / 0.35));
      if (b.t > 1) for (const m of [b.shell, b.core, b.r1, b.r2, b.r3]) m.visible = false;
    }
    for (const a of g.actors) if (a.nadeCd > 0) a.nadeCd -= dt;
  }

  explode(pos, owner, dmgOverride) {
    const g = this.game, C = BR.CONFIG.shockwave, R = C.radius;
    // VFX
    const b = this.pool[this.pi++ % this.pool.length];
    b.t = 0; b.pos.copy(pos);
    for (const m of [b.shell, b.core, b.r1, b.r2, b.r3]) { m.visible = true; m.position.copy(pos); }
    b.r2.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    b.r3.lookAt(g.camera.position);
    g.fx.burst(pos, [0xb04bff, 0xff5cf0, 0xffffff, 0x7b2cff], 40, 15, 0.09, 0.7, 4);
    g.fx.burst(pos, [0xd9a8ff, 0xffffff], 16, 6, 0.06, 0.4, 0);
    // launch everyone in range away from the blast and up
    let hitPlayer = false;
    for (const a of g.actors) {
      if (!a.alive) continue;
      const m = a.mover, cx = m.pos.x, cy = m.pos.y + m.h * 0.5, cz = m.pos.z;
      const dx = cx - pos.x, dy = cy - pos.y, dz = cz - pos.z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      if (!g.world.lineOfSight(pos.x, pos.y + 0.2, pos.z, cx, cy, cz)) continue;
      const k = 1 - d / R, inv = 1 / Math.max(d, 0.001);
      const push = C.launch * (0.45 + 0.55 * k);
      if (m.grapple) m.releaseGrapple();
      m.vel.x += dx * inv * push; m.vel.z += dz * inv * push;
      m.vel.y = Math.max(m.vel.y + dy * inv * push * 0.6, C.lift * (0.55 + 0.45 * k));
      m.onGround = false; m.sliding = false;
      m.pos.y += 0.05;
      if (a === g.player) hitPlayer = true;
      const dmg = dmgOverride != null ? dmgOverride : C.damage;
      if (a !== owner && dmg > 0) g.applyDamage(a, owner, dmg * (0.4 + 0.6 * k), false, new THREE.Vector3(cx, cy, cz), dmgOverride != null ? 'launcher' : 'shockwave');
    }
    const cp = g.camera.position, dist = cp.distanceTo(pos);
    if (dist < 60) BR.Audio.shockwave(dist);
    if (dist < R * 1.8) { g.cam.shake = Math.max(g.cam.shake, 0.35 * (1 - dist / (R * 1.8)) + 0.05); g.hud.shockFlash(); }
    if (hitPlayer) { g.hud.tech('SHOCKWAVE'); g.cam.hitFov = Math.min(8, (g.cam.hitFov || 0) - 6); }
  }

  clear() {
    for (const n of this.nades) this.game.scene.remove(n.mesh);
    this.nades.length = 0;
  }
};
