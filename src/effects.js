'use strict';
// =============================================================================
// EFFECTS — tracers, impact puffs, bot muzzle flashes. Everything is pooled so
// nothing is allocated mid-fight (important for steady FPS on phones).
// =============================================================================
BR.Effects = class Effects {
  constructor(scene) {
    this.scene = scene;
    this.cam = null;                 // set by the game: beams turn to face it
    this.tracers = [];
    this.puffs = [];
    const T = BR.Effects.tex();
    // Tracers: soft camera-facing beams (no boxes): a hot tapered streak (the "bullet") with a glowing
    // head sprite, a wide soft glow around it and a thin fading trail. Additive so colours glow.
    const beamMat = (map, op) => new THREE.MeshBasicMaterial({ map, color: 0xffe2a0, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const geo = BR.Effects.beamGeo();
    for (let i = 0; i < 48; i++) {
      const streak = new THREE.Mesh(geo, beamMat(T.streak, 1)), trail = new THREE.Mesh(geo, beamMat(T.soft, 0.35)), glow = new THREE.Mesh(geo, beamMat(T.soft, 0.3));
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      for (const m of [streak, trail, glow, head]) { m.visible = false; m.frustumCulled = false; }
      scene.add(glow, trail, streak, head);
      this.tracers.push({ streak, trail, glow, head, life: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, dur: 0, w: 0.03, sl: 5.5 });
    }
    // impact puffs: soft dust / blood sprites that bloom and fade
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false; mesh.scale.setScalar(0.3);
      scene.add(mesh);
      this.puffs.push({ mesh, life: 0, max: 0.25, s0: 0.3 });
    }
    this.ti = 0; this.pi = 0;
    // Sparks: soft glowing streaks with velocity + gravity, stretched along their motion
    this.sparks = [];
    for (let i = 0; i < 260; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.spark, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.sparks.push({ m, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.05, g: 9 });
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
    t.streak.material.color.setHex(c); t.trail.material.color.setHex(c); t.glow.material.color.setHex(c); t.head.material.color.setHex(c);
    // the core burns hotter (towards white) so colors read as bright light
    const W = this._white || (this._white = new THREE.Color(0xffffff));
    t.streak.material.color.lerp(W, 0.45); t.head.material.color.lerp(W, 0.6);
    t.streak.visible = t.trail.visible = t.glow.visible = t.head.visible = true;
    // styled tracers: extra additive pieces (spiral strands, embers, bolt segments, energy rings)
    t.style = opts && opts.style || null;
    if (t.fx) { for (const b of t.fx) b.visible = false; for (const b of t.seg) b.visible = false; t.sheath.visible = false; }
    if (t.style) {
      if (!t.fx) {
        const T = BR.Effects.tex(), geo = BR.Effects.beamGeo();
        t.fx = []; t.seg = [];
        for (let i = 0; i < 16; i++) {
          const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
          b.frustumCulled = false; b.visible = false; this.scene.add(b); t.fx.push(b);
          const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.soft, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
          s.frustumCulled = false; s.visible = false; this.scene.add(s); t.seg.push(s);
        }
        t.sheath = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.soft, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        t.sheath.frustumCulled = false; t.sheath.visible = false; this.scene.add(t.sheath);
        t.p1 = new THREE.Vector3(); t.p2 = new THREE.Vector3(); t.jit = [];
      }
      const c2 = opts.color2 !== undefined ? opts.color2 : c, T = BR.Effects.tex();
      const dots = t.style === 'helix' || t.style === 'spark' || t.style === 'comet' || t.style === 'phoenix' || t.style === 'rings';
      for (const b of t.fx) { b.material.color.setHex(c2); b.material.map = t.style === 'rings' ? T.ring : T.dot; b.visible = dots; }
      for (const b of t.seg) { b.material.color.setHex(c2); b.visible = t.style === 'lightning'; }
      t.sheath.material.color.setHex(c2); t.sheath.visible = t.style === 'dual';
      if (t.style === 'dual') t.glow.material.color.setHex(c2);
      t.p1.crossVectors(t.dir, Math.abs(t.dir.y) > 0.9 ? this._ax || (this._ax = new THREE.Vector3(1, 0, 0)) : this._ay || (this._ay = new THREE.Vector3(0, 1, 0))).normalize();
      t.p2.crossVectors(t.dir, t.p1).normalize();
      t.jit.length = 0;
      for (let i = 0; i < 16; i++) t.jit.push(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random());
      t.phase = Math.random() * 6;
    }
    this.placeTracer(t);
  }

  // Point a beam quad from `a` along unit `dir` for `len`, `w` wide, turned around its own axis to face the camera
  beam(m, a, dir, len, w) {
    const X = this._bX || (this._bX = new THREE.Vector3()), Y = this._bY || (this._bY = new THREE.Vector3()), V = this._bV || (this._bV = new THREE.Vector3());
    if (this.cam) V.copy(this.cam.position).sub(a).addScaledVector(dir, -len * 0.5); else V.set(0, 1, 0);
    X.crossVectors(dir, V); if (X.lengthSq() < 1e-8) X.set(1, 0, 0).cross(dir); X.normalize();
    Y.crossVectors(dir, X);
    m.quaternion.setFromRotationMatrix((this._bM || (this._bM = new THREE.Matrix4())).makeBasis(X, Y, dir));
    m.position.copy(a); m.scale.set(w, 1, Math.max(0.01, len));
  }

  placeTracer(t) {
    const k = Math.min(1, t.t / t.dur);
    const head = t.len * k, sl = Math.min(t.len, t.sl);
    const tail = Math.max(0, head - sl);
    const A = this._tA || (this._tA = new THREE.Vector3());
    const fade = t.t > t.dur ? 1 - (t.t - t.dur) / 0.14 : 1, live = t.t <= t.dur;
    A.copy(t.from).addScaledVector(t.dir, tail);
    // close to the lens a world-width beam fills the screen: thin it while it's near the camera
    const near = this.cam ? Math.min(1, 0.15 + this.cam.position.distanceTo(A) / 14) : 1;
    this.beam(t.streak, A, t.dir, head - tail, t.w * 2.6 * near);
    this.beam(t.glow, A, t.dir, head - tail, t.w * 8 * near);
    this.beam(t.trail, t.from, t.dir, head, t.w * 1.1 * (this.cam ? Math.min(1, 0.3 + this.cam.position.distanceTo(t.from) / 6) : 1));
    t.streak.material.opacity = live ? 1 : 0;
    t.trail.material.opacity = 0.32 * Math.max(0, fade);
    t.glow.material.opacity = live ? (t.style === 'dual' ? 0.42 : 0.24) : 0;
    t.head.position.copy(t.from).addScaledVector(t.dir, head);
    t.head.scale.setScalar(t.w * (live ? 7 : 4));
    t.head.material.opacity = live ? 1 : 0;
    if (t.style) this.placeStyled(t, head, tail, fade);
  }

  placeStyled(t, head, tail, fade) {
    const fx = t.fx, n = fx.length, P = this._sp || (this._sp = new THREE.Vector3()), Q = this._sq || (this._sq = new THREE.Vector3());
    const alive = t.t <= t.dur + 0.12;
    if (t.style === 'dual') {
      // a pulsing outer sheath in the second colour
      this.beam(t.sheath, t.from, t.dir, head, t.w * (4.5 + Math.sin(t.t * 50)));
      t.sheath.material.opacity = 0.3 * Math.max(0, fade);
      return;
    }
    if (t.style === 'helix') {
      // two strands winding around the streak (and lingering on the trail)
      const len = Math.max(0.01, Math.min(head, 9)), s0 = head - len;
      for (let i = 0; i < n; i++) {
        const strand = i & 1, u = (i >> 1) / (n / 2 - 1), s = s0 + u * len;
        const a = s * 2.4 + t.phase + strand * Math.PI;
        P.copy(t.from).addScaledVector(t.dir, s).addScaledVector(t.p1, Math.cos(a) * 0.11).addScaledVector(t.p2, Math.sin(a) * 0.11);
        fx[i].position.copy(P);
        fx[i].scale.setScalar(0.1 + 0.08 * u);
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
        fx[i].position.copy(P);
        fx[i].scale.setScalar(0.15 * (1 - u * 0.6));
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
          b.position.copy(P);
          b.scale.setScalar(0.5 + 0.12 * Math.sin(t.t * 60)); b.material.opacity = t.t <= t.dur ? 1 : 0; continue;
        }
        const u = i / n, back = u * Math.min(head, wings ? 4 : 6);
        P.copy(t.from).addScaledVector(t.dir, Math.max(0, head - back));
        if (wings && i % 2) { const w = Math.sin(t.t * 30 + i) * 0.12 + 0.18; P.addScaledVector(t.p1, (i % 4 === 1 ? 1 : -1) * w * (1 - u) * 1.6); }
        else P.addScaledVector(t.p1, t.jit[i * 3] * 0.06 * u).addScaledVector(t.p2, t.jit[i * 3 + 1] * 0.06 * u);
        b.position.copy(P);
        b.scale.setScalar((wings ? 0.32 : 0.28) * (1 - u * 0.8));
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
        b.position.copy(P); b.material.rotation = t.t * 8 + i;
        const age = 1 - u, sz = 0.24 + age * 0.4 * Math.min(1, t.t * 6);
        b.scale.setScalar(sz);
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
        const b = t.seg[i], d = this._sd || (this._sd = new THREE.Vector3()), L = P.distanceTo(Q);
        d.subVectors(Q, P).divideScalar(Math.max(L, 1e-4));
        this.beam(b, P, d, L, 0.09);
        b.material.opacity = alive ? Math.max(0, fade) : 0;
        P.copy(Q);
      }
    }
  }

  impact(p, blood) {
    const f = this.puffs[this.pi++ % this.puffs.length];
    f.mesh.position.copy(p);
    f.mesh.material.color.setHex(blood ? 0xd8283c : 0xcfc6b2);
    f.mesh.material.opacity = 0.85; f.mesh.material.blending = THREE.NormalBlending; f.mesh.material.rotation = Math.random() * 6;
    f.mesh.visible = true;
    f.s0 = blood ? 0.32 : 0.26; f.grow = blood ? 1.4 : 2.2;
    f.mesh.scale.setScalar(f.s0);
    f.life = f.max = blood ? 0.3 : 0.4;
  }

  // Burst of n sparks from p: color, speed, size, life, gravity
  burst(p, color, n, speed, size, life, grav) {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this.si++ % this.sparks.length];
      s.p.copy(p); s.m.position.copy(p);
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
    f.mesh.material.opacity = 1; f.mesh.material.blending = THREE.AdditiveBlending; f.mesh.material.rotation = Math.random() * 6;
    f.mesh.visible = true;
    f.s0 = 0.55; f.grow = 3;
    f.mesh.scale.setScalar(f.s0);
    f.life = f.max = 0.06;
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
    } else if (style === 'supernova') {
      // collapse into a blazing core, then a blinding flash: light rays, shockwave sphere, ground rings, sparks
      const T = BR.Effects.tex(), mid = c.clone().setY(c.y + 1);
      fins.push({ mesh: null, life: 0.4, t: 0, upd: (t, m, d) => { if (victim && victim.mesh) { victim.mesh.scale.setScalar(Math.max(0.05, 1 - t * 2.2)); if (d) victim.mesh.visible = false; } } });
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xfff0b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.position.copy(mid); add(core, 0.45, (t, m) => { m.scale.setScalar(0.4 + t * 3 + Math.sin(t * 60) * 0.2); });
      setTimeout(() => {
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        fl.position.copy(mid); add(fl, 0.5, (t, m) => { m.scale.setScalar(4 + t * 30); m.material.opacity = Math.pow(1 - t / 0.5, 2); });
        const sph = add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat(0xffd24a, 0.6)), 0.7, (t, m) => { m.scale.setScalar(0.5 + t * 11); m.material.opacity = 0.6 * (1 - t / 0.7); }); sph.position.copy(mid);
        for (let i = 0; i < 3; i++) { const r = add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 64), mat(i ? 0xffffff : 0xffb000, 1)), 0.9, (t, m) => { const k = Math.max(0, t - i * 0.08); m.scale.setScalar(1 + k * (18 - i * 4)); m.material.opacity = Math.max(0, 1 - k / 0.8); }); r.position.copy(c).setY(c.y + 0.06 + i * 0.03); r.rotation.x = -Math.PI / 2; }
        for (let i = 0; i < 12; i++) { const ray = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.12, 1, 6, 1, true).translate(0, 0.5, 0), mat(i % 2 ? 0xffffff : 0xffd24a, 0.9)), 0.6, (t, m) => { m.scale.set(1, 1 + t * 26, 1); m.material.opacity = 0.9 * (1 - t / 0.6); });
          ray.position.copy(mid); ray.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28); }
        this.burst(mid, [0xffd24a, 0xffffff, 0xff9a1f], 80, 16, 0.12, 1.1, 3);
      }, 380);
    } else if (style === 'prismburst') {
      // rainbow orbs spiral up around the body, gather overhead and burst into rainbow rings
      const T = BR.Effects.tex(), orbs = [];
      hideBody(0.5);
      fins.push({ mesh: null, life: 0.5, t: 0, upd: (t) => { if (victim && victim.mesh) victim.mesh.scale.y = Math.max(0.05, 1 - t * 1.8); } });
      for (let i = 0; i < 24; i++) { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: new THREE.Color().setHSL(i / 24, 1, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        o.position.copy(c); add(o, 0.9, (t, m) => { const a = i / 24 * Math.PI * 2 + t * 9, r = 0.9 * (1 - Math.max(0, t - 0.55) / 0.35), h = 0.2 + (i / 24) * 1.4 + t * 2.4;
          m.position.set(c.x + Math.cos(a) * r, c.y + Math.min(h, 3.2), c.z + Math.sin(a) * r); m.scale.setScalar(0.6 + 0.2 * Math.sin(t * 20 + i)); m.material.color.setHSL((i / 24 + t * 0.8) % 1, 1, 0.6); }); orbs.push(o); }
      setTimeout(() => { const at = c.clone().setY(c.y + 3.2);
        this.burst(at, [0xff3df2, 0x1de9ff, 0xffe14d, 0x39ff88, 0xff5a3a, 0xb48cff], 90, 13, 0.1, 1.3, 2);
        for (let i = 0; i < 4; i++) { const rg = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.ring, color: new THREE.Color().setHSL(i / 4, 1, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          rg.position.copy(at); add(rg, 0.8, (t, m) => { const k = Math.max(0, t - i * 0.07); m.scale.setScalar(1 + k * (26 - i * 4)); m.material.opacity = Math.max(0, 1 - k / 0.7); }); } }, 880);
    } else if (style === 'thunderstrike') {
      // a lightning bolt from the sky (flickers 3x), white flash, scorch mark, electric shockwave and sparks
      const T = BR.Effects.tex(), geo = BR.Effects.beamGeo().clone(), segs = [], N = 14;   // own copy: finisher cleanup disposes it
      for (let i = 0; i < N; i++) { const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.soft, color: i % 3 ? 0xdff4ff : 0x6fc8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); segs.push(b); add(b, 0.75, () => {}); b.visible = false; }
      const P = new THREE.Vector3(), Q = new THREE.Vector3(), D = new THREE.Vector3();
      fins.push({ mesh: null, life: 0.75, t: 0, upd: (t) => { const on = t > 0.12 && (Math.floor(t * 22) % 3 !== 1) && t < 0.6;
        P.set(c.x, c.y + 30, c.z);
        for (let i = 0; i < N; i++) { const k = (i + 1) / N; Q.set(c.x + (i === N - 1 ? 0 : (Math.random() - 0.5) * 1.6 * (1 - k * 0.5)), c.y + 30 * (1 - k) + 0.6, c.z + (i === N - 1 ? 0 : (Math.random() - 0.5) * 1.6));
          const L = P.distanceTo(Q); D.subVectors(Q, P).divideScalar(L); this.beam(segs[i], P, D, L, 0.5 + Math.random() * 0.3); segs[i].visible = on; P.copy(Q); } } });
      setTimeout(() => { if (victim && victim.mesh) victim.mesh.visible = false;
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xdff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); fl.position.copy(c).setY(c.y + 1); add(fl, 0.4, (t, m) => { m.scale.setScalar(6 + t * 20); m.material.opacity = 1 - t / 0.4; });
        const sc2 = add(new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.7, depthWrite: false })), 2.5, (t, m) => { m.material.opacity = 0.7 * (1 - t / 2.5); }); sc2.position.copy(c).setY(c.y + 0.04); sc2.rotation.x = -Math.PI / 2;
        const sw = add(new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 48), mat(0x6fc8ff, 1)), 0.6, (t, m) => { m.scale.setScalar(1 + t * 16); m.material.opacity = 1 - t / 0.6; }); sw.position.copy(c).setY(c.y + 0.07); sw.rotation.x = -Math.PI / 2;
        this.burst(c.clone().setY(c.y + 0.6), [0xdff4ff, 0x6fc8ff, 0xffffff], 60, 12, 0.08, 0.8, 9); }, 150);
    } else if (style === 'sakura') {
      // a rising vortex of pink petals, the body dissolving into it, then a petal burst
      const pm = c2 => new THREE.MeshBasicMaterial({ color: c2, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
      const pg = new THREE.CircleGeometry(0.16, 6); pg.scale(1, 0.6, 1);
      fins.push({ mesh: null, life: 0.9, t: 0, upd: (t, m, d) => { if (victim && victim.mesh) { victim.mesh.scale.setScalar(Math.max(0.05, 1 - t * 1.05)); victim.mesh.position.y += 0.01; if (d) victim.mesh.visible = false; } } });
      for (let i = 0; i < 64; i++) { const col = [0xff8ac8, 0xffb3dd, 0xffe6f2, 0xff5fae][i % 4], p0 = Math.random() * 6.28, h0 = Math.random() * 0.6, sp = 4 + Math.random() * 3;
        const pt = add(new THREE.Mesh(pg.clone(), pm(col)), 1.8, (t, m) => { const a = p0 + t * sp, r = 0.5 + t * 1.3, h = h0 + t * 2.2; m.position.set(c.x + Math.cos(a) * r, c.y + h, c.z + Math.sin(a) * r); m.rotation.set(t * 7 + i, t * 5, t * 3); m.material.opacity = 0.95 * Math.min(1, (1.8 - t) * 2); }); pt.position.copy(c); }
      setTimeout(() => this.burst(c.clone().setY(c.y + 1.2), [0xff8ac8, 0xffe6f2, 0xffffff], 40, 6, 0.08, 1.2, 1), 650);
    } else if (style === 'dragonsoul') {
      // a fire serpent coils up around the body (glowing head + segmented tail shedding embers),
      // rears up overhead and explodes; the body burns away in an ember column
      const T = BR.Effects.tex(), N = 22;
      fins.push({ mesh: null, life: 1.0, t: 0, upd: (t, m, d) => { if (victim && victim.mesh) { victim.mesh.scale.y = Math.max(0.05, 1 - t * 0.9); if (d) victim.mesh.visible = false; } if (Math.random() < 0.5) this.burst(c.clone().setY(c.y + Math.random() * 1.6), [0xff7a00, 0xffd24a], 1, 1.4, 0.06, 0.6, -2); } });
      const path = (u, out) => { const a = u * Math.PI * 5, r = 1.0 - u * 0.4; return out.set(c.x + Math.cos(a) * r, c.y + u * 3.6, c.z + Math.sin(a) * r); };
      for (let i = 0; i < N; i++) { const head = i === 0, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: head ? 0xfff0b0 : new THREE.Color().setHSL(0.02 + 0.1 * (1 - i / N), 1, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        s.position.copy(c); add(s, 1.25, (t, m) => { const u = Math.max(0, Math.min(1, t / 1.0 - i * 0.022)); path(u, m.position); m.scale.setScalar((head ? 1.3 : 0.9 * (1 - i / N * 0.6)) * (0.9 + 0.2 * Math.sin(t * 40 + i))); m.material.opacity = u > 0 ? (t > 1.05 ? Math.max(0, 1 - (t - 1.05) / 0.2) : 1) : 0;
          if (head && Math.random() < 0.7) this.burst(m.position, [0xff7a00, 0xffd24a, 0xff3a00], 2, 1.6, 0.07, 0.5, -1); }); }
      setTimeout(() => { const at = c.clone().setY(c.y + 3.6);
        this.burst(at, [0xff7a00, 0xffd24a, 0xff3a00, 0xffffff], 90, 14, 0.12, 1.2, 4);
        const r = add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 48), mat(0xffb000, 1)), 0.7, (t, m) => { m.scale.setScalar(1 + t * 16); m.material.opacity = 1 - t / 0.7; m.lookAt(this.cam ? this.cam.position : m.position.clone().setZ(m.position.z + 1)); }); r.position.copy(at);
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); fl.position.copy(at); add(fl, 0.45, (t, m) => { m.scale.setScalar(3 + t * 18); m.material.opacity = 1 - t / 0.45; }); }, 1000);
    } else if (style === 'starfall') {
      const met = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), mat(0xffd24a)), 0.5, (t, m) => { m.position.set(c.x + 14 * (1 - t / 0.5), c.y + 1 + 26 * (1 - t / 0.5), c.z); if (Math.random() < 0.9) this.burst(m.position, [0xffb547, 0xff5a00, 0xffffff], 3, 1.2, 0.09, 0.5, 0); });
      met.position.copy(c);
      setTimeout(() => { if (victim && victim.mesh) victim.mesh.visible = false;
        this.burst(c.clone().setY(c.y + 0.4), [0xffd24a, 0xff5a00, 0xffffff, 0xff2a00], 80, 14, 0.11, 1.2, 9);
        const r = add(new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 48), mat(0xffb547)), 0.8, (t, m) => { m.scale.setScalar(1 + t * 13); m.material.opacity = 1 - t / 0.8; }); r.position.copy(c).setY(c.y + 0.08); r.rotation.x = -Math.PI / 2;
        const col = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 6, 16, 1, true), mat(0xffe08a, 0.7)), 0.5, (t, m) => { m.material.opacity = 0.7 * (1 - t / 0.5); m.scale.x = m.scale.z = 1 + t * 2; }); col.position.copy(c).setY(c.y + 3); }, 500);
    }
  }

  // Default kill reward on the victim: a glowing ground shockwave, a short light pillar, a rising
  // soul orb that pops into sparks, and a spark burst (gold on headshots, magenta/cyan on streaks)
  killBurst(p, head, streak, light) {
    const sc = this.scene, fins = this.fins || (this.fins = []), T = BR.Effects.tex();
    const col = streak >= 4 ? 0x1de9ff : streak >= 2 ? 0xff3df2 : head ? 0xffc93a : 0xff3b4e;
    const add = (mesh, life, upd) => { mesh.frustumCulled = false; sc.add(mesh); fins.push({ mesh, life, upd, t: 0 }); return mesh; };
    const mat = (c, op, map) => new THREE.MeshBasicMaterial({ color: c, map: map || null, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const c = p.clone(), chest = c.clone().setY(c.y + 1.0);
    this.burst(chest, [col, 0xffffff, col], light ? 12 : 26, head ? 9 : 7, 0.08, 0.7, 6);
    const ring = add(new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 48), mat(col, 1)), 0.6, (t, m) => { m.scale.setScalar(1 + t * 11); m.material.opacity = Math.pow(1 - t / 0.6, 1.5); });
    ring.position.copy(c).setY(c.y + 0.08); ring.rotation.x = -Math.PI / 2;
    if (light) return;
    const ring2 = add(new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 48), mat(0xffffff, 0.8)), 0.45, (t, m) => { m.scale.setScalar(1 + t * 7); m.material.opacity = 0.8 * (1 - t / 0.45); m.lookAt(this.cam ? this.cam.position : m.position.clone().setZ(m.position.z + 1)); });
    ring2.position.copy(chest);
    const pillar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 9, 20, 1, true), mat(col, 0)), 0.55, (t, m) => { m.material.opacity = Math.min(0.5, t * 6) * (1 - t / 0.55); m.scale.x = m.scale.z = 1 - t * 0.9; m.scale.y = 0.5 + t * 1.6; });
    pillar.position.copy(c).setY(c.y + 4.5);
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    add(orb, 0.75, (t, m, done) => { m.position.set(c.x + Math.sin(t * 9) * 0.08, c.y + 1.1 + t * 2.4, c.z); m.scale.setScalar(0.5 + 0.25 * Math.sin(t * 30) + t * 0.4); m.material.opacity = 1;
      if (done) this.burst(m.position, [col, 0xffffff], 18, 5, 0.06, 0.6, -1); });
    orb.position.copy(chest);
    if (head) { const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xfff0b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      add(flare, 0.3, (t, m) => { m.scale.setScalar(0.6 + t * 9); m.material.opacity = 1 - t / 0.3; }); flare.position.copy(c).setY(c.y + 1.65); }
  }

  // ---- victory show
  victory(p) {
    const sc = this.scene, fins = this.fins || (this.fins = []);
    const mat = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const add = (mesh, life, upd) => { mesh.frustumCulled = false; sc.add(mesh); fins.push({ mesh, life, upd, t: 0, vic: true }); return mesh; };
    this.burst(p.clone().setY(p.y + 1), [0xffd24a, 0xffffff, 0xffe9a0], 60, 10, 0.1, 1.2, 4);
    for (let i = 0; i < 3; i++) {
      const r = add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 64), mat(i ? 0xffffff : 0xffc93a, 1)), 1.2 + i * 0.25, (t, m, d) => { const k = Math.max(0, t - i * 0.18); m.scale.setScalar(1 + k * (14 - i * 3)); m.material.opacity = Math.max(0, 1 - k / (1 - i * 0.1)); });
      r.position.copy(p).setY(p.y + 0.06 + i * 0.02); r.rotation.x = -Math.PI / 2;
    }
    // golden pillar of light that holds for the whole show
    const pil = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 60, 32, 1, true), mat(0xffd24a, 0)), 5.5, (t, m) => { m.material.opacity = Math.min(0.14, t * 0.5) * (1 - Math.max(0, t - 4.6) / 0.9); m.rotation.y = t * 0.6; m.scale.x = m.scale.z = 1 + 0.06 * Math.sin(t * 5); });
    pil.position.copy(p).setY(p.y + 30);
    const core = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 60, 20, 1, true), mat(0xffe08a, 0)), 5.5, (t, m) => { m.material.opacity = Math.min(0.12, t * 0.6) * (1 - Math.max(0, t - 4.6) / 0.9); });
    core.position.copy(pil.position);
    // a slowly turning halo on the ground
    const halo = add(new THREE.Mesh(new THREE.RingGeometry(1.4, 1.62, 64), mat(0xffd24a, 0)), 5.5, (t, m) => { m.material.opacity = Math.min(0.7, t) * (1 - Math.max(0, t - 4.6) / 0.9); m.rotation.z = t * 0.8; m.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); });
    halo.position.copy(p).setY(p.y + 0.05); halo.rotation.x = -Math.PI / 2;
  }
  firework(at) {
    const pal = [[0xff3df2, 0xffffff], [0x1de9ff, 0xffffff], [0xffd24a, 0xff7a00], [0x39ff88, 0xffffff], [0xff3b4e, 0xffd24a], [0xb48cff, 0x1de9ff]];
    const c = pal[Math.floor(Math.random() * pal.length)];
    this.burst(at, [c[0], c[0], c[1]], 34, 11, 0.12, 1.3, 3.5);
    const fins = this.fins || (this.fins = []), T = BR.Effects.tex();
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: c[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.position.copy(at); fl.frustumCulled = false; this.scene.add(fl);
    fins.push({ mesh: fl, life: 0.45, t: 0, vic: true, upd: (t, m) => { m.scale.setScalar(1.5 + t * 14); m.material.opacity = Math.pow(1 - t / 0.45, 2); } });
    const rg = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.ring, color: c[1], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    rg.position.copy(at); rg.frustumCulled = false; this.scene.add(rg);
    fins.push({ mesh: rg, life: 0.6, t: 0, vic: true, upd: (t, m) => { m.scale.setScalar(1 + t * 22); m.material.opacity = 1 - t / 0.6; } });
  }
  confetti(at) {
    this.burst(at, [0xff3df2, 0x1de9ff, 0xffd24a, 0x39ff88, 0xff5a3a, 0xffffff], 8, 2.2, 0.09, 2.2, 1.6);
  }
  victoryEnd() {
    if (!this.fins) return;
    for (let i = this.fins.length - 1; i >= 0; i--) { const f = this.fins[i]; if (!f.vic) continue; if (f.mesh) { this.scene.remove(f.mesh); if (!f.mesh.isSprite) f.mesh.geometry.dispose(); f.mesh.material.dispose(); } this.fins.splice(i, 1); }
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
      s.p.addScaledVector(s.v, dt);
      const k = s.life / s.max, sp = s.v.length(), D = this._spd || (this._spd = new THREE.Vector3()), A = this._spa || (this._spa = new THREE.Vector3());
      if (sp > 1e-4) D.copy(s.v).divideScalar(sp); else D.set(0, 1, 0);
      const L = s.s * (1.6 + sp * 0.1);
      this.beam(s.m, A.copy(s.p).addScaledVector(D, -L * 0.5), D, L, s.s * 1.6);      // streak centred on the spark, along its motion
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
      if (t.t >= t.life) { t.streak.visible = t.trail.visible = t.glow.visible = t.head.visible = false; if (t.fx) { for (const b of t.fx) b.visible = false; for (const b of t.seg) b.visible = false; t.sheath.visible = false; } continue; }
      this.placeTracer(t);
    }
    for (const f of this.puffs) {
      if (!f.mesh.visible) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.mesh.material.opacity = k * k * 0.9;
      f.mesh.scale.setScalar(f.mesh.scale.x + dt * (f.grow || 3) * (0.4 + k));
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
};

// Shared soft textures (grayscale; tinted by material colour) + the beam quad (x = width, z = 0..1 length)
BR.Effects.beamGeo = () => BR.Effects._geo || (BR.Effects._geo = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5));
BR.Effects.tex = () => {
  if (BR.Effects._tex) return BR.Effects._tex;
  const mk = (w, h, fn) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), img = x.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = Math.max(0, Math.min(1, fn((i + 0.5) / w, 1 - (j + 0.5) / h))), o = (j * w + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(v * 255); }
    x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t;
  };
  const across = u => { const d = Math.abs(u * 2 - 1); return Math.pow(1 - d, 1.8) * 0.7 + Math.pow(Math.max(0, 1 - d * 2.2), 2) * 0.6; };
  BR.Effects._tex = {
    // u across the beam, v along it (0 = tail, 1 = head): bright core, soft edges, tapered tail, rounded head
    streak: mk(32, 128, (u, v) => across(u) * Math.pow(v, 0.7) * Math.min(1, (1 - v) * 14 + 0.25) * (1 - Math.abs(u * 2 - 1) * (1 - v) * 0.6)),
    soft: mk(32, 64, (u, v) => across(u) * Math.min(1, v * 6) * Math.min(1, (1 - v) * 6)),
    spark: mk(16, 64, (u, v) => across(u) * Math.sin(v * Math.PI) * (0.4 + 0.6 * v)),
    dot: mk(64, 64, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; return Math.pow(Math.max(0, 1 - r), 2.2) + Math.max(0, 1 - r * 3.5) * 0.8; }),
    ring: mk(64, 64, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; return Math.exp(-Math.pow((r - 0.75) / 0.09, 2)) + Math.max(0, 1 - r) * 0.15; }),
    smoke: mk(64, 64, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; const n = 0.75 + 0.25 * Math.sin(u * 23 + v * 9) * Math.sin(v * 19 - u * 7); return Math.pow(Math.max(0, 1 - r), 1.5) * n; }),
  };
  return BR.Effects._tex;
};
