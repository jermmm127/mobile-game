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
    // Sparks: tiny additive cubes with velocity + gravity (hit bursts, headshot crits, shockwaves)
    this.sparks = [];
    const sg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.sparks.push({ m, v: new THREE.Vector3(), life: 0, max: 1, s: 0.05, g: 9 });
    }
    this.si = 0;
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
    // styled tracers: extra additive "beads" (spiral strands, sparks, bolt segments)
    t.style = opts && opts.style || null;
    if (t.fx) for (const b of t.fx) b.visible = false;
    if (t.style) {
      if (!t.fx) {
        t.fx = [];
        for (let i = 0; i < 16; i++) {
          const b = new THREE.Mesh(this._beadGeo || (this._beadGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
          b.frustumCulled = false; b.visible = false; this.scene.add(b); t.fx.push(b);
        }
        t.p1 = new THREE.Vector3(); t.p2 = new THREE.Vector3(); t.jit = [];
      }
      const c2 = opts.color2 !== undefined ? opts.color2 : c;
      for (const b of t.fx) { b.material.color.setHex(c2); b.visible = true; }
      if (t.style === 'dual') t.glow.material.color.setHex(c2);
      t.p1.crossVectors(t.dir, Math.abs(t.dir.y) > 0.9 ? this._ax || (this._ax = new THREE.Vector3(1, 0, 0)) : this._ay || (this._ay = new THREE.Vector3(0, 1, 0))).normalize();
      t.p2.crossVectors(t.dir, t.p1).normalize();
      t.jit.length = 0;
      for (let i = 0; i < 16; i++) t.jit.push(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random());
      t.phase = Math.random() * 6;
    }
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
    t.glow.material.opacity = t.t > t.dur ? 0 : t.style === 'dual' ? 0.5 : 0.28;
    if (t.style) this.placeStyled(t, head, tail, fade);
  }

  placeStyled(t, head, tail, fade) {
    const fx = t.fx, n = fx.length, P = this._sp || (this._sp = new THREE.Vector3()), Q = this._sq || (this._sq = new THREE.Vector3());
    const alive = t.t <= t.dur + 0.12;
    if (t.style === 'dual') {
      // a pulsing outer sheath in the second colour
      const b = fx[0]; for (let i = 1; i < n; i++) fx[i].visible = false;
      b.position.copy(t.trail.position); b.quaternion.copy(t.trail.quaternion);
      b.scale.set(t.w * 2.2, t.w * 2.2, Math.max(0.01, head)); b.material.opacity = 0.28 * Math.max(0, fade);
      return;
    }
    if (t.style === 'helix') {
      // two strands winding around the streak (and lingering on the trail)
      const len = Math.max(0.01, Math.min(head, 9)), s0 = head - len;
      for (let i = 0; i < n; i++) {
        const strand = i & 1, u = (i >> 1) / (n / 2 - 1), s = s0 + u * len;
        const a = s * 2.4 + t.phase + strand * Math.PI;
        P.copy(t.from).addScaledVector(t.dir, s).addScaledVector(t.p1, Math.cos(a) * 0.11).addScaledVector(t.p2, Math.sin(a) * 0.11);
        fx[i].position.copy(P); fx[i].quaternion.copy(t.streak.quaternion);
        fx[i].scale.set(0.05, 0.05, 0.22);
        fx[i].material.opacity = alive ? Math.max(0, fade) * (0.4 + 0.6 * u) : 0;
      }
      return;
    }
    if (t.style === 'spark') {
      // sparkler: embers shed behind the head drift outward and fade
      for (let i = 0; i < n; i++) {
        const u = i / n, s = Math.max(0, head - u * Math.min(head, 7));
        const drift = (t.t * 1.6 + u) * 0.25;
        P.copy(t.from).addScaledVector(t.dir, s).addScaledVector(t.p1, t.jit[i * 3] * drift).addScaledVector(t.p2, t.jit[i * 3 + 1] * drift - drift * 0.4);
        fx[i].position.copy(P); fx[i].quaternion.copy(t.streak.quaternion);
        const sz = 0.07 * (1 - u * 0.6);
        fx[i].scale.set(sz, sz, sz);
        fx[i].material.opacity = alive ? Math.max(0, fade) * (1 - u * 0.7) * (0.6 + 0.4 * Math.sin(t.t * 40 + i)) : 0;
      }
      return;
    }
    if (t.style === 'comet' || t.style === 'phoenix') {
      // blazing head that races down the shot + a tapering tail of embers (phoenix adds flame wings)
      const wings = t.style === 'phoenix';
      for (let i = 0; i < n; i++) {
        const b = fx[i];
        if (i === 0) {
          P.copy(t.from).addScaledVector(t.dir, Math.max(0, head - 0.25));
          b.position.copy(P); b.quaternion.copy(t.streak.quaternion);
          const pulse = 0.22 + 0.06 * Math.sin(t.t * 60);
          b.scale.set(pulse, pulse, 0.5); b.material.opacity = t.t <= t.dur ? 1 : 0; continue;
        }
        const u = i / n, back = u * Math.min(head, wings ? 4 : 6);
        P.copy(t.from).addScaledVector(t.dir, Math.max(0, head - back));
        if (wings && i % 2) { const w = Math.sin(t.t * 30 + i) * 0.12 + 0.18; P.addScaledVector(t.p1, (i % 4 === 1 ? 1 : -1) * w * (1 - u) * 1.6); }
        else P.addScaledVector(t.p1, t.jit[i * 3] * 0.06 * u).addScaledVector(t.p2, t.jit[i * 3 + 1] * 0.06 * u);
        b.position.copy(P); b.quaternion.copy(t.streak.quaternion);
        const sz = (wings ? 0.14 : 0.12) * (1 - u * 0.85);
        b.scale.set(sz, sz, sz * 1.6);
        b.material.opacity = alive ? Math.max(0, fade) * (1 - u) : 0;
      }
      return;
    }
    if (t.style === 'rings') {
      // flat energy plates strung along the shot, spinning and expanding as they fade
      const len = Math.max(0.01, Math.min(head, 12)), s0 = head - len;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), s = s0 + u * len, b = fx[i];
        P.copy(t.from).addScaledVector(t.dir, s);
        b.position.copy(P); b.quaternion.copy(t.streak.quaternion);
        b.rotateZ(t.t * 8 + i);
        const age = 1 - u, sz = 0.12 + age * 0.22 * Math.min(1, t.t * 6);
        b.scale.set(sz, sz, 0.008);
        b.material.opacity = alive ? Math.max(0, fade) * (0.25 + 0.6 * u) : 0;
      }
      return;
    }
    if (t.style === 'lightning') {
      // jagged bolt along the shot that re-forks every frame
      const len = Math.max(0.01, head), seg = len / n;
      P.copy(t.from);
      for (let i = 0; i < n; i++) {
        const s1 = (i + 1) * seg, j = i === n - 1 ? 0 : 0.16;
        Q.copy(t.from).addScaledVector(t.dir, s1).addScaledVector(t.p1, (Math.random() * 2 - 1) * j).addScaledVector(t.p2, (Math.random() * 2 - 1) * j);
        const b = fx[i];
        b.position.copy(P); b.lookAt(Q);
        b.scale.set(0.035, 0.035, P.distanceTo(Q));
        b.material.opacity = alive ? Math.max(0, fade) : 0;
        P.copy(Q);
      }
    }
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

  // Burst of n sparks from p: color, speed, size, life, gravity
  burst(p, color, n, speed, size, life, grav) {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this.si++ % this.sparks.length];
      s.m.position.copy(p);
      s.v.set(Math.random() * 2 - 1, Math.random() * 1.6 - 0.3, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.m.material.color.setHex(Array.isArray(color) ? color[i % color.length] : color);
      s.s = (size || 0.05) * (0.6 + Math.random() * 0.8);
      s.life = s.max = (life || 0.35) * (0.7 + Math.random() * 0.6);
      s.g = grav === undefined ? 9 : grav;
      s.m.visible = true;
    }
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

  // ---- bullet holes: small dark quads on the wall face that was hit (pooled, oldest reused)
  decal(p, n) {
    if (!this.decals) {
      this.decals = []; this.di = 0;
      const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
        const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(10,10,10,0.95)'); g.addColorStop(0.35, 'rgba(25,22,20,0.85)'); g.addColorStop(0.6, 'rgba(60,55,50,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const geo = new THREE.PlaneGeometry(0.16, 0.16);
      for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; this.scene.add(m); this.decals.push(m); }
    }
    const m = this.decals[this.di++ % this.decals.length];
    m.position.copy(p).addScaledVector(n, 0.012);
    m.lookAt(m.position.x + n.x, m.position.y + n.y, m.position.z + n.z);
    m.rotation.z = Math.random() * 6; m.scale.setScalar(0.7 + Math.random() * 0.5); m.visible = true;
  }

  // ---- kill finishers: short additive shows on the victim (equippable cosmetic)
  finisher(style, p, victim) {
    const sc = this.scene, fins = this.fins || (this.fins = []);
    const mat = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op === undefined ? 1 : op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const add = (mesh, life, upd) => { mesh.frustumCulled = false; sc.add(mesh); fins.push({ mesh, life, upd, t: 0 }); return mesh; };
    const hideBody = at => fins.push({ mesh: null, life: at, t: 0, upd: (t, m, done) => { if (done && victim && victim.mesh) victim.mesh.visible = false; } });
    const c = p.clone();
    if (style === 'shatter') {
      hideBody(0.02);
      this.burst(c.clone().setY(c.y + 0.9), [0xbfe8ff, 0xffffff, 0x7fd0ff], 46, 9, 0.12, 1.1, 8);
      const r = add(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 40), mat(0xdff4ff)), 0.6, (t, m) => { m.scale.setScalar(1 + t * 9); m.material.opacity = 1 - t / 0.6; });
      r.position.copy(c).setY(c.y + 1); r.lookAt(r.position.x, r.position.y + 1, r.position.z);
    } else if (style === 'ascend') {
      const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 30, 20, 1, true), mat(0xffe08a, 0.0)), 1.6, (t, m) => { m.material.opacity = Math.min(0.55, t * 3) * (1 - Math.max(0, t - 1.1) / 0.5); m.scale.x = m.scale.z = 1 - t * 0.3; });
      beam.position.copy(c).setY(c.y + 15);
      fins.push({ mesh: null, life: 1.2, t: 0, upd: (t) => { if (victim && victim.mesh) { victim.mesh.position.y += 0.03 + t * 0.02; victim.mesh.visible = t < 1.15; } } });
      for (let i = 0; i < 4; i++) setTimeout(() => this.burst(c.clone().setY(c.y + 0.5 + i * 0.6), [0xffe08a, 0xffffff], 10, 2.5, 0.06, 1.2, -3), i * 180);
    } else if (style === 'firework') {
      hideBody(0.15);
      const rocket = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xffffff)), 0.55, (t, m) => { m.position.y = c.y + 1 + t * 22; if (Math.random() < 0.6) this.burst(m.position, [0xffb547, 0xffffff], 2, 0.8, 0.05, 0.4, 2); });
      rocket.position.copy(c);
      setTimeout(() => { const at = c.clone().setY(c.y + 13); this.burst(at, [0xff3df2, 0x1de9ff, 0xffe14d, 0x39ff88, 0xff5a3a], 70, 13, 0.1, 1.4, 4);
        const r = add(new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 48), mat(0xffffff)), 0.7, (t, m) => { m.scale.setScalar(1 + t * 14); m.material.opacity = 1 - t / 0.7; m.lookAt(m.position.clone().add(new THREE.Vector3(0, 0, 1))); }); r.position.copy(at); }, 520);
    } else if (style === 'voidpop') {
      const orb = add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x050008 })), 0.9, (t, m) => { const k = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.4; m.scale.setScalar(Math.max(0.01, k * 0.75)); });
      orb.position.copy(c).setY(c.y + 0.9);
      const halo = add(new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 48), mat(0xb04bff)), 0.9, (t, m) => { m.scale.setScalar(Math.max(0.05, 1.4 - t * 1.5)); m.rotation.z = t * 6; m.material.opacity = 0.9; m.lookAt(m.position.x, m.position.y + 1, m.position.z); });
      halo.position.copy(orb.position);
      fins.push({ mesh: null, life: 0.5, t: 0, upd: (t) => { if (victim && victim.mesh) { victim.mesh.scale.setScalar(Math.max(0.02, 1 - t * 2)); if (t > 0.48) victim.mesh.visible = false; } } });
      setTimeout(() => { this.burst(orb.position, [0xb04bff, 0xff3df2, 0xffffff], 50, 11, 0.09, 0.9, 0);
        const sw = add(new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 48), mat(0xff3df2)), 0.6, (t, m) => { m.scale.setScalar(1 + t * 16); m.material.opacity = 1 - t / 0.6; }); sw.position.copy(c).setY(c.y + 0.1); sw.rotation.x = -Math.PI / 2; }, 820);
    } else if (style === 'glitchout') {
      const cols = [0xff2244, 0x22ff66, 0x2266ff];
      const cubes = []; for (let i = 0; i < 18; i++) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mat(cols[i % 3], 0.9)), 1.0, (t, mm) => { const f = Math.floor(t * 18 + i); mm.visible = (f % 3) !== 0; mm.position.x += (Math.random() - 0.5) * 0.08; mm.position.y += t * 0.04; mm.material.opacity = 0.9 * (1 - t); }); m.position.set(c.x + (Math.random() - 0.5) * 0.7, c.y + Math.random() * 1.8, c.z + (Math.random() - 0.5) * 0.7); cubes.push(m); }
      fins.push({ mesh: null, life: 0.5, t: 0, upd: (t) => { if (victim && victim.mesh) { victim.mesh.visible = Math.floor(t * 30) % 2 === 0 && t < 0.45; victim.mesh.position.x += (Math.random() - 0.5) * 0.06; } } });
    } else if (style === 'starfall') {
      const met = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), mat(0xffd24a)), 0.5, (t, m) => { m.position.set(c.x + 14 * (1 - t / 0.5), c.y + 1 + 26 * (1 - t / 0.5), c.z); if (Math.random() < 0.9) this.burst(m.position, [0xffb547, 0xff5a00, 0xffffff], 3, 1.2, 0.09, 0.5, 0); });
      met.position.copy(c);
      setTimeout(() => { if (victim && victim.mesh) victim.mesh.visible = false;
        this.burst(c.clone().setY(c.y + 0.4), [0xffd24a, 0xff5a00, 0xffffff, 0xff2a00], 80, 14, 0.11, 1.2, 9);
        const r = add(new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 48), mat(0xffb547)), 0.8, (t, m) => { m.scale.setScalar(1 + t * 13); m.material.opacity = 1 - t / 0.8; }); r.position.copy(c).setY(c.y + 0.08); r.rotation.x = -Math.PI / 2;
        const col = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 6, 16, 1, true), mat(0xffe08a, 0.7)), 0.5, (t, m) => { m.material.opacity = 0.7 * (1 - t / 0.5); m.scale.x = m.scale.z = 1 + t * 2; }); col.position.copy(c).setY(c.y + 3); }, 500);
    }
  }

  update(dt) {
    if (this.fins) for (let i = this.fins.length - 1; i >= 0; i--) {
      const f = this.fins[i]; f.t += dt; const done = f.t >= f.life;
      if (f.upd) f.upd(Math.min(f.t, f.life), f.mesh, done);
      if (done) { if (f.mesh) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); } this.fins.splice(i, 1); }
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.v.y -= s.g * dt; s.v.multiplyScalar(1 - dt * 2.5);
      s.m.position.addScaledVector(s.v, dt);
      const k = s.life / s.max;
      s.m.scale.set(s.s, s.s, s.s * (1 + s.v.length() * 0.08));
      s.m.lookAt(s.m.position.x + s.v.x, s.m.position.y + s.v.y, s.m.position.z + s.v.z);
      s.m.material.opacity = Math.min(1, k * 1.6);
    }
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
      if (t.t >= t.life) { t.streak.visible = t.trail.visible = t.glow.visible = false; if (t.fx) for (const b of t.fx) b.visible = false; continue; }
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
