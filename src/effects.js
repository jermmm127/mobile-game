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
    for (let i = 0; i < 48; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, fog: false });
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
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

  tracer(from, to, mine, color) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    const a = t.line.geometry.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z;
    a[3] = to.x; a[4] = to.y; a[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color !== undefined ? color : mine ? 0xfff1c4 : 0xff9a6b);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
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
      if (!t.line.visible) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.line.visible = false;
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
