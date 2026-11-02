'use strict';
// =============================================================================
// EFFECTS — tracers, impact puffs, bot muzzle flashes. Everything is pooled so
// nothing is allocated mid-fight (important for steady FPS on phones).
// =============================================================================
BR.Effects = class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.puffs = [];
    // Tracers: a bright travelling streak (the "bullet") + a faint trail behind it.
    // Unit box along +Z, stretched/oriented per shot. Additive so colors glow.
    const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) {
      const mk = op => new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const streak = mk(1), trail = mk(0.35), glow = mk(0.3);
      streak.visible = trail.visible = glow.visible = false;
      streak.frustumCulled = trail.frustumCulled = glow.frustumCulled = false;
      scene.add(glow, trail, streak);
      this.tracers.push({ streak, trail, glow, life: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, dur: 0, w: 0.03, sl: 5.5 });
    }
    const pg = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(pg, m);
      mesh.visible = false;
      scene.add(mesh);
      this.puffs.push({ mesh, life: 0, max: 0.25 });
    }
    this.ti = 0; this.pi = 0;
    // Grapple rope + hook
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.ropeLine = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x2b2b2b }));
    this.ropeLine.frustumCulled = false; this.ropeLine.visible = false;
    this.hook = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: 0xffa31a, emissive: 0x553300 }));
    this.hook.visible = false;
    scene.add(this.ropeLine, this.hook);
    // Shotgun-jump blast rings
    this.rings = [];
    const ringG = new THREE.RingGeometry(0.6, 1, 32);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.rings.push({ m, life: 0 });
    }
    this.ri = 0;
  }

  rope(from, g) {
    if (!g) { this.ropeLine.visible = this.hook.visible = false; return; }
    const a = this.ropeLine.geometry.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z; a[3] = g.x; a[4] = g.y; a[5] = g.z;
    this.ropeLine.geometry.attributes.position.needsUpdate = true;
    this.ropeLine.visible = this.hook.visible = true;
    this.hook.position.set(g.x, g.y, g.z);
  }

  blast(p, power) {
    const r = this.rings[this.ri++ % this.rings.length];
    r.m.position.copy(p);
    r.m.visible = true; r.life = r.max = 0.45; r.power = power;
    for (let i = 0; i < 3; i++) { this._b = this._b || new THREE.Vector3(); this._b.set(p.x + (Math.random() - 0.5), p.y + 0.2, p.z + (Math.random() - 0.5)); this.impact(this._b, false); }
  }

  // opts: { speed (m/s), streak (m) } — the shop preview uses a slow, long streak
  tracer(from, to, mine, color, opts) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    t.from.copy(from);
    t.dir.subVectors(to, from);
    t.len = t.dir.length();
    if (t.len < 0.5) return;
    t.dir.divideScalar(t.len);
    t.t = 0;
    t.dur = Math.max(0.05, t.len / ((opts && opts.speed) || 320)); // bullet speed for the streak
    t.life = t.dur + 0.14;                      // trail lingers briefly
    t.sl = (opts && opts.streak) || 6;
    t.w = mine ? 0.06 : 0.04;
    const c = color !== undefined ? color : mine ? 0xffe9a8 : 0xff9a6b;
    t.streak.material.color.setHex(c); t.trail.material.color.setHex(c); t.glow.material.color.setHex(c);
    // the core burns hotter (towards white) so colors read as bright light
    t.streak.material.color.lerp(this._white || (this._white = new THREE.Color(0xffffff)), 0.35);
    const look = this._look || (this._look = new THREE.Vector3());
    look.copy(from).add(t.dir);
    t.streak.position.copy(from); t.streak.lookAt(look);
    t.trail.position.copy(from); t.trail.lookAt(look);
    t.glow.position.copy(from); t.glow.lookAt(look);
    t.streak.visible = t.trail.visible = t.glow.visible = true;
    this.placeTracer(t);
  }

  placeTracer(t) {
    const k = Math.min(1, t.t / t.dur);
    const head = t.len * k, sl = Math.min(t.len, t.sl);
    const tail = Math.max(0, head - sl);
    t.streak.position.copy(t.from).addScaledVector(t.dir, tail);
    t.streak.scale.set(t.w, t.w, Math.max(0.01, head - tail));
    t.trail.position.copy(t.from);
    t.trail.scale.set(t.w * 0.45, t.w * 0.45, Math.max(0.01, head));
    const fade = t.t > t.dur ? 1 - (t.t - t.dur) / 0.12 : 1;
    t.streak.material.opacity = t.t > t.dur ? 0 : 1;
    t.trail.material.opacity = 0.4 * Math.max(0, fade);
    t.glow.position.copy(t.streak.position);
    t.glow.scale.set(t.w * 4, t.w * 4, t.streak.scale.z);
    t.glow.material.opacity = t.t > t.dur ? 0 : 0.28;
  }

  impact(p, blood) {
    const f = this.puffs[this.pi++ % this.puffs.length];
    f.mesh.position.copy(p);
    f.mesh.material.color.setHex(blood ? 0xff4a5a : 0xd9d2c0);
    f.mesh.material.opacity = 0.9;
    f.mesh.visible = true;
    f.mesh.scale.setScalar(1);
    f.life = f.max = 0.25;
  }

  flash(p) {
    const f = this.puffs[this.pi++ % this.puffs.length];
    f.mesh.position.copy(p);
    f.mesh.material.color.setHex(0xffd27a);
    f.mesh.material.opacity = 1;
    f.mesh.visible = true;
    f.mesh.scale.setScalar(1.6);
    f.life = f.max = 0.05;
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.5 + k * 4 * (0.5 + r.power));
      r.m.material.opacity = (1 - k) * 0.85;
      if (r.life <= 0) r.m.visible = false;
    }
    for (const t of this.tracers) {
      if (!t.trail.visible) continue;
      t.t += dt;
      if (t.t >= t.life) { t.streak.visible = t.trail.visible = t.glow.visible = false; continue; }
      this.placeTracer(t);
    }
    for (const f of this.puffs) {
      if (!f.mesh.visible) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.mesh.material.opacity = k;
      f.mesh.scale.setScalar(f.mesh.scale.x + dt * 4);
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
};
