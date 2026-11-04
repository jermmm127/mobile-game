'use strict';
// =============================================================================
// VIEWMODEL — your gun + gloved arms in first person, drawn in their own scene
// so they never clip into walls.
//
// Motion is procedural and spring-driven (no baked clips):
//   springs  — sway from looking, movement bob, sprint pose, landing bounce, recoil
//   keyframes — draw (karambit: CS-style twirl around the finger ring), inspect,
//               knife slashes, full magazine reloads, shell-by-shell loading
// Hooks called by Game: rebuild(), update(dt), onFire(w), onMelee(hit),
// onShell(), startInspect(), onLand(speed). Read adsW for aim progress.
// =============================================================================
(function () {
  // v1.11 sleeves: a tapered fabric forearm (lathe) with an elastic cuff at the wrist and a
  // seam band, instead of a plain tube. Unit length along +Y (wrist at -0.5, elbow at +0.5).
  const KI = { z1: 0.95, y1: -0.15, x1: 0.1, z2: -0.25, y2: -0.55, x2: 0 };      // karambit inspect show poses (wrist turns)
  const BAYLIKE = id => id === 'bayonet' || id === 'tracker';      // v1.13: the Tracker shares the bayonet's fist + flips
  let SLEEVE = null;
  function sleeveParts() {
    if (SLEEVE) return SLEEVE;
    const prof = [[0.0, -0.5], [0.031, -0.5], [0.034, -0.492], [0.0345, -0.47], [0.032, -0.455], [0.035, -0.44], [0.039, -0.38], [0.043, -0.25], [0.047, -0.08], [0.05, 0.12], [0.052, 0.35], [0.053, 0.5], [0.0, 0.5]];
    const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 20);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.452) c.setHex(0x1c2027);                      // elastic cuff
      else if (y > 0.18 && y < 0.2) c.setHex(0x232831);        // seam band
      else c.setHex(0xffffff);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = '#272d35'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 2) { x.fillStyle = `rgba(255,255,255,${0.025 + 0.02 * ((i / 2) % 2)})`; x.fillRect(0, i, 128, 1); x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, 128); }
    for (let k = 0; k < 7; k++) { const y = 10 + k * 17 + Math.random() * 6; x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(40, y - 5, 80, y + 6, 128, y); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.moveTo(0, y + 2); x.bezierCurveTo(40, y - 3, 80, y + 8, 128, y + 2); x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(60, 0, 2, 128);                // side seam
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 3);
    const sleeve = new THREE.MeshPhongMaterial({ map: tex, vertexColors: true, shininess: 10, specular: 0x222831 });
    return (SLEEVE = { sleeve, sleeveGeo: geo });
  }
  const U = BR.util;
  // butterfly hammer grip: relaxed elbow (camera space, x scaled by the side) + which way the thumb faces
  const BF_ARM = new THREE.Vector3(0.36, -0.5, 0.26);         // wrist -> elbow, kept constant so the forearm never swings at the camera
  let BF_THUMB = 1;
  BR._bfThumb = v => { BF_THUMB = v; };
  const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const easeOutBack = t => { t = clamp01(t); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const easeInOut = t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  // Window helper: 0 before a, ramps to 1 by b, holds until c, back to 0 by d
  const win = (t, a, b, c, d) => (t < a || t > d ? 0 : t < b ? smooth((t - a) / (b - a)) : t <= c ? 1 : 1 - smooth((t - c) / (d - c)));

  class Spring {
    constructor(k, z) { this.v = 0; this.vel = 0; this.k = k; this.d = 2 * Math.sqrt(k) * (z || 0.75); }
    step(target, dt) {
      const n = dt > 1 / 90 ? 2 : 1, h = dt / n;
      for (let i = 0; i < n; i++) { this.vel += (this.k * (target - this.v) - this.d * this.vel) * h; this.v += this.vel * h; }
      return this.v;
    }
  }
  const S3 = (k, z) => ({ x: new Spring(k, z), y: new Spring(k, z), z: new Spring(k, z) });

  BR.Viewmodel = class Viewmodel {
    constructor(game) {
      this.game = game;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6250, 0.85));
      const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(1, 2, 1.5); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x9fc4ff, 0.35); rim.position.set(-2, 0.5, -1); this.scene.add(rim);
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.models = {};
      this.pos = S3(140, 0.7);        // smoothed pose
      this.rot = S3(140, 0.7);
      this.kick = S3(260, 0.45);      // recoil (impulses, springs back to 0)
      this.kickR = S3(220, 0.5);
      this.adsW = 0; this.sprintW = 0; this.bob = 0; this.bobAmt = 0;
      this.drawT = 0; this.drawDur = 0.5; this.inspectT = 0; this.inspectDur = 2;
      this.swingT = 0; this.swingDir = 1; this.shellT = 0; this.flashT = 0;
      this.charmA = 0; this.charmV = 0;
      this.lastWeapon = null; this.lastReloadK = 0;
      this.scale = 1;
      this.grapW = 0; this.grapT = 0; this.stimT = 0; this.stimDur = 1; this.stimW = 0; this.stimK = 0;
      this.ropeFrom = new THREE.Vector3(); this.ropeValid = false;
      for (const k of ['_sx', '_sv', '_sy', '_sz', '_sp0', '_sp1', '_sp2', '_spo']) this[k] = new THREE.Vector3();
      this._sq1 = new THREE.Quaternion(); this._sq2 = new THREE.Quaternion(); this._sm = new THREE.Matrix4();
      this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._pumpFore = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
      this.rebuild();
    }

    resize(w, h) {
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.scale = w < h ? 0.6 : 1;
    }

    // (Re)build weapon models + arms with the equipped blueprints, camo, charm and gloves.
    rebuild() {
      const eq = BR.Profile.data.equip;
      while (this.root.children.length) this.root.remove(this.root.children[0]);
      this.models = {};
      for (const id in BR.CONFIG.weapons) {
        const bp = (eq.blueprints || {})[id];
        const m = BR.Models.weapon(id, BR.Profile.skinFor(id), BR.CONFIG.weapons[id].melee ? 'none' : eq.charms, bp);
        const holder = new THREE.Group();
        if (id === 'knife') {
          // Reverse grip: handle upright in the fist (ring on top by the index finger), blade
          // hanging below it with the hooked tip sweeping forward and up.
          // CS-style idle: handle across the fist (ring on the inner side by the index finger),
          // blade out the outer side sweeping up-right with the hook curving up, flat facing you.
          // model Z (handle -> ring) -> left, model -Y (hook) -> up, model X -> toward the camera's -Z
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0)));
          m.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.25, -0.32, 'YXZ')));
          m.scale.setScalar(0.8);
          // Pivot at the finger ring so the karambit twirls around it
          m.updateMatrix();
          const P = new THREE.Vector3(0, 0.066, 0.12).applyMatrix4(m.matrix);   // ring centre
          const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion).normalize();
          const spin = new THREE.Group();
          spin.position.copy(P); m.position.sub(P);
          spin.add(m); holder.add(spin);
          holder.userData.spin = { obj: spin, axis };
        } else if (id === 'butterfly') {
          // Two held poses (blended every frame): IDLE, the knife lying almost flat at the bottom
          // right with the blade pointing left across the screen; UP, blade straight up in the fist
          // with the edge toward the centre (the draw / inspect show beat). Model +Y = blade, -Z = edge.
          const basis = (y, z) => { const Y = new THREE.Vector3(...y).normalize(), X = new THREE.Vector3().crossVectors(Y, new THREE.Vector3(...z)).normalize();
            return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y))); };
          m.userData.qIdle = basis([-0.92, 0.13, -0.38], [0.12, 1, -0.2]);
          m.userData.qUp = basis([-0.18, 1, -0.22], [1, 0.1, -0.15]);
          m.quaternion.copy(m.userData.qIdle); m.scale.setScalar(1.12);
          // everything pivots inside the fist about the handle pin, so the held (safe) handle can
          // stay put while the blade and bite handle flip round it
          const inner = new THREE.Group(); while (m.children.length) inner.add(m.children[0]); m.add(inner);
          m.userData.inner = inner; m.userData.pivot = new THREE.Vector3(0, 0.004, 0.001);
          holder.add(m);
        } else if (BAYLIKE(id)) {
          // Poses from the reference clip (model +Y = blade, -Z = edge, +Z = saw-tooth spine):
          // IDLE forward grip at the bottom right, blade angled up and to the left, spine on top;
          // SHOW1 upright close to the centre, one face to the camera (spine on the left);
          // SHOW2 the wrist twisted to show the other face, tilted to the left (spine on the right)
          const basis = (y, z) => { const Y = new THREE.Vector3(...y).normalize(), X = new THREE.Vector3().crossVectors(Y, new THREE.Vector3(...z)).normalize();
            return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y))); };
          m.userData.qIdle = basis([-0.86, 0.52, -0.2], [0.1, -1, -0.1]);       // saw teeth on the bottom edge, flat to the camera
          m.userData.wristRoll = Math.PI; m.userData.gripY = -0.05; m.userData.armVec = new THREE.Vector3(0.22, -0.42, 0.42); m.userData.armVecUp = new THREE.Vector3(0.42, -0.62, 0.3);    // upright: forearm comes up from the lower right, slightly toward you (reference clip)                // forearm comes up from below, toward you (back of the hand faces the camera)
          m.userData.qUp = basis([-0.06, 1, -0.12], [-1, 0, -0.1]);
          m.userData.qUp2 = basis([-0.4, 1, -0.1], [1, 0.1, 0.1]);
          m.quaternion.copy(m.userData.qIdle); m.scale.setScalar(1.08);
          m.userData.pivot = new THREE.Vector3(0, -0.065, 0);      // the draw flip turns the knife about the middle of the handle (in the palm)
          holder.add(m);
        } else holder.add(m);
        holder.userData.model = m;
        holder.visible = false;
        this.root.add(holder);
        this.models[id] = holder;
      }
      // Arms: sleeve + gloved hand for each side, placed every frame in camera space
      if (this.arms) for (const s of ['R', 'L']) this.scene.remove(this.arms[s].hand, this.arms[s].fore);
      const { sleeve, sleeveGeo } = sleeveParts();
      const mk = left => {
        const hand = BR.Models.hand(eq.gloves || 'default', left);
        hand.scale.setScalar(1.3);
        const fore = new THREE.Mesh(sleeveGeo, sleeve);
        this.scene.add(hand, fore);
        return { hand, fore };
      };
      this.arms = { R: mk(false), L: mk(true) };
      // signature reload styles for the equipped blueprints + a small VFX pool
      this.sigReload = {};
      for (const id in BR.CONFIG.weapons) {
        const bp = (eq.blueprints || {})[id], B = bp && BR.Models.BLUEPRINTS[id] && BR.Models.BLUEPRINTS[id][bp];
        if (B && B.reload) this.sigReload[id] = B.reload;
      }
      if (!this.sparks) {
        this.sparks = []; this.rings = []; this.spi = 0; this.rgi = 0;
        const bg = new THREE.BoxGeometry(1, 1, 1), rg = new THREE.RingGeometry(0.8, 1, 32);
        for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; this.scene.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0, max: 1 }); }
        for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; this.scene.add(m); this.rings.push({ m, life: 0, max: 1 }); }
      }
      // Backhand fists for the karambit idle (mirrored gloves so the thumbs sit toward the centre)
      if (this.knifeHands) this.scene.remove(this.knifeHands.R, this.knifeHands.L, this.knifeHands.RB, this.knifeHands.RP);
      const kh = left => { const h = BR.Models.hand(eq.gloves || 'default', left, true); h.scale.setScalar(1.3); h.visible = false; this.scene.add(h); return h; };
      this.knifeHands = { R: kh(true), L: kh(false), RB: kh(false), RP: (() => { const h = BR.Models.hand(eq.gloves || 'default', true, 'point'); h.scale.setScalar(1.3); h.visible = false; this.scene.add(h); return h; })() };
      this.curGlove = null;          // forces the per-weapon glove pass on the next frame
      // Glowing blade trail (butterfly blueprints with a .trail colour): a ribbon between the blade
      // tip and mid-blade over the last frames, drawn additively and fading toward the tail
      if (this.bfTrail) { this.scene.remove(this.bfTrail.mesh); this.bfTrail.mesh.geometry.dispose(); this.bfTrail = null; }
      { const mel = eq.melee || 'bayonet', bpId = (eq.blueprints || {})[mel], B = bpId && BR.Models.BLUEPRINTS[mel] && BR.Models.BLUEPRINTS[mel][bpId];
        if (B && B.trail && this.models[mel] && this.models[mel].userData.model.userData.trailTip) {
          const N = 11, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3), idx = [];
          for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
          const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          mesh.frustumCulled = false; mesh.visible = false; this.scene.add(mesh);
          this.bfTrail = { mesh, N, tips: [], mids: [], color: new THREE.Color(B.trail < 0 ? 0xffffff : B.trail), color2: new THREE.Color(B.trail2 !== undefined ? B.trail2 : B.trail < 0 ? 0xffffff : B.trail), rainbow: B.trail < 0, on: 0, id: mel };
        } }
      // Wrist grapple launcher (child of the left hand: aims where the fingers point)
      const dark = new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), steel = new THREE.MeshLambertMaterial({ color: 0x8a9098 });
      const orange = new THREE.MeshLambertMaterial({ color: 0xffa31a, emissive: 0x552200 });
      const ln = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.07), dark); body.position.set(0, 0.03, 0.03); ln.add(body);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.018), dark); strap.position.set(0, 0.0, 0.05); ln.add(strap);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.035, -0.03); ln.add(barrel);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.02), new THREE.MeshBasicMaterial({ color: 0x8fe6ff })); light.position.set(0.012, 0.044, 0.035); ln.add(light);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), orange); tip.position.set(0, 0.035, -0.065); ln.add(tip);
      ln.userData.tip = tip; ln.visible = false;
      this.arms.L.hand.add(ln); this.launcher = ln;
      // Stim pen injector (needle along +X, plunger at -X by the thumb)
      if (this.injector) this.scene.remove(this.injector);
      const inj = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xe8ecef })); tube.rotation.z = Math.PI / 2; inj.add(tube);
      const win = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.04, 10), new THREE.MeshBasicMaterial({ color: 0x5dff9a })); win.rotation.z = Math.PI / 2; win.position.x = 0.01; inj.add(win);
      const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0x2f9a5a })); plunger.rotation.z = Math.PI / 2; plunger.position.x = -0.075; inj.add(plunger); inj.userData.plunger = plunger;
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 6), steel); needle.rotation.z = Math.PI / 2; needle.position.x = 0.075; inj.add(needle);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.04, 10), orange); cap.rotation.z = Math.PI / 2; cap.position.x = 0.08; inj.add(cap);
      inj.userData.cap = cap; inj.scale.setScalar(1.3); inj.visible = false;
      this.scene.add(inj); this.injector = inj;
      if (this.vmNade) this.scene.remove(this.vmNade);
      this.vmNade = BR.Shockwave.model(); this.vmNade.scale.setScalar(0.55); this.vmNade.visible = false; this.scene.add(this.vmNade);

      this.lastWeapon = null; this.papModels = null;
    }

    // Pack-a-Punched guns (zombies): the same gun model in the animated Ravenhold camo, built on first use
    papHolder(id) {
      this.papModels = this.papModels || {};
      if (!this.papModels[id]) {
        const eq = BR.Profile.data.equip, m = BR.Models.weapon(id, 'pap', 'none', (eq.blueprints || {})[id]);
        const holder = new THREE.Group(); holder.add(m); holder.userData.model = m; holder.visible = false; this.root.add(holder); this.papModels[id] = holder;
      }
      return this.papModels[id];
    }

    // ---- events from the game -------------------------------------------
    onFire(w) {
      const d = w.def, a = (1 - this.adsW * 0.65) * (d.kick || 1), auto = d.rpm >= 500;
      const r = (Math.random() - 0.5);
      this.kick.z.vel += (d.recoil * 9 + 0.35) * a;                   // straight back
      this.kick.y.vel += (d.recoil * 2.2 + 0.05) * a;
      this.kickR.x.vel += (d.recoil * 30 + 0.8) * a;                  // muzzle climb
      this.kickR.z.vel += r * (auto ? 1.2 : 0.6) * a;                 // random roll
      this.kickR.y.vel += r * (auto ? 0.6 : 0.25) * a;
      this.flashT = d.suppressed ? 0.025 : 0.05;
      this.inspectT = 0;
      if (d.revolver) this.cylTarget = (this.cylTarget || 0) + Math.PI / 3;          // index one chamber
      // Bolt action: cycle the bolt after every shot (unless that was the last round)
      if (d.bolt && w.mag > 0) { this.boltDelay = 0.12; this.boltDur = Math.min(0.9, 60 / d.rpm * 0.72); this.boltT = 0; }
      // Pump action: rack the forend back and forward after every shot
      if (d.pump && w.mag > 0) { this.pumpDelay = 0.1; this.pumpDur = Math.min(0.5, 60 / d.rpm * 0.62); this.pumpT = 0; }
    }
    onMelee() { this.swingT = 0.42; this.swingDir *= -1; this.inspectT = 0; }
    onShell() { this.shellT = 0.2; }
    onLand(speed) { this.pos.y.vel -= Math.min(1.6, speed * 0.07); this.rot.x.vel -= Math.min(2, speed * 0.08); }
    startInspect(w) { if (!w) return; this.inspectDur = this.inspectT = w.id === 'butterfly' ? 2.8 : BAYLIKE(w.id) ? 4.6 : w.def.melee ? 3.0 : 2.1; this.lastBflyT = 0; this.spinSwish = 0; }

    hide() { if (this.sparks) { for (const q of this.sparks) { q.life = 0; q.m.visible = false; } for (const q of this.rings) { q.life = 0; q.m.visible = false; } }      // v1.11.1: no frozen white spark boxes while skydiving
      if (this.bfTrail) { this.bfTrail.mesh.visible = false; this.bfTrail.tips.length = this.bfTrail.mids.length = 0; } if (this.vmNade) this.vmNade.visible = false; if (this.knifeHands) this.knifeHands.R.visible = this.knifeHands.L.visible = this.knifeHands.RB.visible = this.knifeHands.RP.visible = false; this.lookDown = 0; this.ropeValid = false; if (this.launcher) this.launcher.visible = false; if (this.injector) this.injector.visible = false; this.root.visible = false; for (const s of ['R', 'L']) { this.arms[s].hand.visible = this.arms[s].fore.visible = false; } }

    // ---- per frame ------------------------------------------------------------
    update(dt, lookDX, lookDY) {
      const game = this.game, p = game.player, w = p.weapon, m = p.mover, Mv = BR.CONFIG.move;
      for (const id in this.models) this.models[id].visible = false;
      if (this.papModels) for (const id in this.papModels) this.papModels[id].visible = false;
      // bolt cycle timer (runs even while scoped, when the gun is hidden)
      if (this.boltDelay > 0) { this.boltDelay -= dt; if (this.boltDelay <= 0) this.boltT = this.boltDur; }
      else if (this.boltT > 0) this.boltT = Math.max(0, this.boltT - dt);
      if (!w || !w.def.bolt) { this.boltT = 0; this.boltDelay = 0; }
      if (this.pumpDelay > 0) { this.pumpDelay -= dt; if (this.pumpDelay <= 0) this.pumpT = this.pumpDur; }
      else if (this.pumpT > 0) this.pumpT = Math.max(0, this.pumpT - dt);
      if (!w || !w.def.pump) { this.pumpT = 0; this.pumpDelay = 0; }
      if (!w || m.dropping || (p.ads && w.def.scope) || (p.ads && w.def.optic && this.adsW > 0.8)) { this.hide(); if (p.ads && w && w.def.optic) this.adsW = Math.min(1, this.adsW + dt * 6); return; }
      this.root.visible = true;
      const holder = w.def.pap ? this.papHolder(w.id) : this.models[w.id], model = holder.userData.model, ud = model.userData, def = w.def;
      holder.visible = true;

      // Gloves can differ per weapon: swap the glove meshes in place (keeps the wrist launcher etc.)
      const gid = BR.Profile && BR.Profile.gloveFor ? BR.Profile.gloveFor(w.id) : 'default';
      if (gid !== this.curGlove) {
        this.curGlove = gid;
        const swap = (grp, left, fist) => {
          for (let i = grp.children.length - 1; i >= 0; i--) if (grp.children[i].userData.glove) grp.remove(grp.children[i]);
          const src = BR.Models.hand(gid, left, fist); while (src.children.length) grp.add(src.children[0]);
        };
        swap(this.arms.R.hand, false, false); swap(this.arms.L.hand, true, false);
        swap(this.knifeHands.R, true, true); swap(this.knifeHands.L, false, true); swap(this.knifeHands.RB, false, true); swap(this.knifeHands.RP, true, 'point');
      }
      // New weapon in hand: draw animation
      if (w !== this.lastWeapon) {
        this.lastWeapon = w;
        this.drawDur = this.drawT = def.melee ? 1.05 : 0.55;
        this.inspectT = 0; this.spinSwish = 0; this.lastReloadK = 0; this.lastBflyT = 0; this.boltT = 0; this.boltDelay = 0; this.pumpT = 0; this.pumpDelay = 0;
        if (def.melee) BR.Audio.unsheathe(); else BR.Audio.reload();
      }
      this.drawT = Math.max(0, this.drawT - dt);
      this.inspectT = Math.max(0, this.inspectT - dt);
      this.swingT = Math.max(0, this.swingT - dt);
      this.shellT = Math.max(0, this.shellT - dt);
      this.flashT -= dt;

      // ---- pose targets ---------------------------------------------------------
      const s = this.scale;
      const sp = m.speedH, run = Mv.runSpeed;
      this.adsW = U.damp(this.adsW, p.ads ? 1 : 0, 13, dt);
      const reloading = w.reloadT > 0;
      const sprinting = m.onGround && !m.sliding && sp > run * 0.92 && !p.ads && !p.fireHeld && !reloading && this.drawT <= 0 && this.inspectT <= 0;
      this.sprintW = U.damp(this.sprintW, sprinting ? 1 : 0, 7, dt);
      let hx = 0.2 * s, hy = -0.205, hz = -0.6, ax = 0, ay = -0.13, az = -0.42;
      if (def.melee) { hx = 0.1 * s; hy = -0.095; hz = -0.38; }      // karambit low in the right of the view, like CS
      if (w.id === 'butterfly') { hx = 0.19 * s; hy = -0.19; hz = -0.43; }
      let bUp = 0;               // butterfly: 0 = flat idle, 1 = upright
      if (BAYLIKE(w.id)) { hx = 0.04 * s; hy = -0.108; hz = -0.42; }   // v1.11: fist + sleeve in view at the bottom right   // farther from the eye: same spot on screen, smaller
      let bUp2 = 0;              // bayonet: blend toward the second show face
      let bay = null;            // bayonet: { lift, flip, roll } applied to the knife inside the fist
      // aiming: the sight sits closer to your eye (bigger in view) than it used to
      if (ud.sight && !def.scope) { const sg = ud.sight.position; ax = -sg.x; ay = -sg.y; az = -(ud.sightDist || 0.3) * 0.78 - sg.z; }
      const A = this.adsW, nA = 1 - A * 0.85;
      // Bob: figure-eight while moving on the ground
      const grounded = m.onGround && !m.sliding;
      this.bobAmt = U.damp(this.bobAmt, grounded ? Math.min(sp / run, 1.3) : 0, 8, dt);
      this.bob += dt * (4 + sp * 0.9) * (grounded ? 1 : 0.3);
      const bx = Math.sin(this.bob) * 0.011 * this.bobAmt * nA;
      const by = -Math.abs(Math.cos(this.bob)) * 0.013 * this.bobAmt * nA;
      let tx = U.lerp(hx, ax, A) + bx, ty = U.lerp(hy, ay, A) + by, tz = U.lerp(hz, az, A);
      let rx = 0, ry = 0, rz = 0;
      // Sway: the gun lags behind where you look
      ry += U.clamp(-lookDX * 0.0022, -0.12, 0.12) * nA;
      rx += U.clamp(-lookDY * 0.0018, -0.1, 0.1) * nA;
      tx += U.clamp(-lookDX * 0.0004, -0.02, 0.02) * nA;
      // Sprint: lowered and canted
      const W = this.sprintW;
      tx += 0.02 * W; ty -= 0.035 * W; tz += 0.03 * W; rx -= 0.22 * W; ry += 0.5 * W; rz += 0.32 * W;
      // Air / slide / wall-run / crouch
      if (!m.onGround) rx += U.clamp(m.vel.y * 0.012, -0.12, 0.1) * nA;
      if (m.sliding) { rz += 0.32 * nA; ty -= 0.025; }
      if (m.wallRunning) rz += 0.16 * nA;
      if (m.crouched) ty -= 0.012;

      // ---- keyframed overlays (added after the springs) -------------------------
      let ox = 0, oy = 0, oz = 0, orx = 0, ory = 0, orz = 0;
      let leftTarget = null, magOff = null, magVis = true, spinAng = 0, ringW = 0, leftHidden = !!def.melee, bfly = null;
      // Draw
      if (this.drawT > 0) {
        const t = 1 - this.drawT / this.drawDur;
        if (w.id === 'butterfly') {
          // Balisong deploy (safe handle stays in the fist): the closed knife swings up into view
          // with the palm turned in, the bite handle flicks open forward, the blade rolls out of the
          // safe handle as the bite handle swings down into the palm, then the wrist turns back out
          // and the knife settles into the hold
          // (matched to the reference clip) the fist comes up from below holding the closed knife
          // upright, the bite handle fans out while the whole knife spins round in a big sweeping arc,
          // the blade flips into place, a short upright beat, then the wrist lays it down flat
          const rise = smooth(t / 0.14);
          oy += -(1 - rise) * 0.24; orx += (1 - rise) * 0.35; ox += (1 - rise) * 0.05;
          bUp = 1 - smooth((t - 0.74) / 0.22);
          const p1 = easeInOut((t - 0.12) / 0.3), p2 = easeInOut((t - 0.36) / 0.24), settle = win(t, 0.58, 0.63, 0.63, 0.75);
          bfly = { a: Math.PI + Math.PI * p1, flip: Math.PI + Math.PI * p2 - 0.14 * settle, roll: Math.PI * 2 * easeInOut((t - 0.14) / 0.34) };
          const sw = win(t, 0.12, 0.2, 0.4, 0.52);                                       // the wrist carves the arc
          ory += 0.45 * Math.sin((t - 0.12) / 0.4 * Math.PI * 2) * sw; ox -= 0.04 * sw; oy += 0.05 * sw;
          const hold = win(t, 0.55, 0.62, 0.72, 0.86);                                   // upright beat
          oy += 0.06 * hold; ox -= 0.03 * hold; orz += 0.1 * hold;
          this.bflySwish(t, [0.2, 0.36, 0.5]);
        } else if (BAYLIKE(w.id)) {
          // Bayonet deploy (reference clip): the hand comes up near the centre holding the knife
          // blade-down, flips it end over end in the palm to blade-up, then rolls the wrist down
          // into the angled idle with a small settle
          const rise = smooth(t / 0.16);
          oy += -(1 - rise) * 0.26; orx += (1 - rise) * 0.3;
          const near = 1 - smooth((t - 0.5) / 0.32);
          ox -= 0.07 * near; oy += 0.07 * near; oz -= 0.03 * near;
          bUp = near;
          // v1.11: one clean end-over-end flip (blade up -> forward over the top -> blade up), tossed a
          // little above the palm and caught, instead of the half turn from blade-down
          const a = easeInOut((t - 0.16) / 0.36);
          bay = { lift: Math.sin(clamp01((t - 0.16) / 0.36) * Math.PI) * 0.055, flip: -Math.PI * 2 * a, roll: 0 };
          const settle = win(t, 0.78, 0.84, 0.84, 0.96); orx -= 0.07 * settle; oy -= 0.012 * settle;
          if (t > 0.14 && !(this.spinSwish & 1)) { this.spinSwish |= 1; BR.Audio.swish(false); }
          if (t > 0.46 && !(this.spinSwish & 2)) { this.spinSwish |= 2; BR.Audio.click(); }
        } else if (def.melee) {
          // Karambit deploy: the hand comes up near the centre, turning a little upright, while the
          // knife twirls twice around the index finger in the ring, then drops into the low hold
          const rise = smooth(t / 0.08), out = 1 - smooth((t - 0.62) / 0.38);
          oy += -(1 - rise) * 0.16; oz += -out * 0.06;
          const lift = win(t, 0.02, 0.12, 0.5, 0.76);
          ox -= 0.05 * lift; oy += 0.07 * lift; oz -= 0.04 * lift; orz += 0.45 * lift; orx += 0.08 * lift;
          spinAng = easeInOut(t / 0.6) * Math.PI * 4;
          ringW = win(t, 0, 0.07, 0.52, 0.68);                              // index finger in the ring while it rolls
          const turns = Math.floor(spinAng / (Math.PI * 2) + 0.25);
          if (turns > this.spinSwish) { this.spinSwish = turns; BR.Audio.swish(false); }
        } else {
          const e = easeOutBack(t);
          oy -= (1 - e) * 0.3; orx -= (1 - e) * 0.85; orz += (1 - e) * 0.45; ox += (1 - e) * 0.06;
        }
      }
      // Inspect
      if (this.inspectT > 0) {
        const t = 1 - this.inspectT / this.inspectDur;
        if (w.id === 'butterfly') {
          // Balisong inspect: a quick chaplin, a roll of the whole knife around the hand, then the
          // long show-off pose (wrist turned to the camera, bite handle swung out so the handles
          // spread in a V behind the blade), a fast close-and-rollover catch, and back to the hold
          // (matched to the reference clip) raise it upright toward the centre, spread the handles into a
          // V, a spinning flourish that sweeps an arc, a long upright show pose with a slow sway, a quick
          // chaplin, then lay it back down flat
          const raise = win(t, 0, 0.08, 0.86, 0.96);
          bUp = raise; ox -= 0.07 * raise; oy += 0.09 * raise; oz -= 0.03 * raise;
          const vee = win(t, 0.1, 0.18, 0.24, 0.3);
          const spin = easeInOut((t - 0.3) / 0.2), rl = easeInOut((t - 0.32) / 0.18);
          const show = win(t, 0.5, 0.56, 0.76, 0.82);
          const chap = win(t, 0.82, 0.86, 0.86, 0.92);
          bfly = { a: 1.9 * vee + Math.PI * chap, flip: -Math.PI * 2 * spin, roll: Math.PI * 2 * rl };
          const sw = win(t, 0.3, 0.36, 0.46, 0.52);
          ory += 0.35 * Math.sin((t - 0.3) / 0.22 * Math.PI * 2) * sw; oy += 0.03 * sw;
          ory += 0.25 * show + Math.sin(t * Math.PI * 2.4) * 0.03 * show; orz += 0.12 * show; orx -= 0.05 * show;
          this.bflySwish(t, [0.14, 0.34, 0.44, 0.85]);
        } else if (BAYLIKE(w.id)) {
          // Bayonet inspect (reference clip): bring it up upright close to the centre showing one face,
          // a slow look with small wobbles, twist the wrist to show the other face tilted left, twist
          // back to the first face, then drop back into the angled idle. No tosses.
          const up = win(t, 0, 0.08, 0.88, 0.97);
          bUp = up; bUp2 = win(t, 0.26, 0.34, 0.54, 0.62);
          ox -= 0.1 * up + 0.015 * bUp2; oy += 0.11 * up; oz -= 0.06 * up;
          const hold = up * (1 - 0.6 * win(t, 0.28, 0.32, 0.36, 0.4) - 0.6 * win(t, 0.6, 0.64, 0.68, 0.72));
          orz += 0.035 * Math.sin(t * Math.PI * 5) * hold; ory += 0.06 * Math.sin(t * Math.PI * 3.4 + 1) * hold; orx += 0.025 * Math.sin(t * Math.PI * 4.2) * hold;
          // v1.11: finish with a flip-and-catch before it drops back into the idle
          const fa = easeInOut((t - 0.68) / 0.16);
          bay = fa > 0 && fa < 1 ? { lift: Math.sin(fa * Math.PI) * 0.06, flip: -Math.PI * 2 * fa, roll: 0 } : null;
          if (t > 0.26 && !(this.spinSwish & 1)) { this.spinSwish |= 1; BR.Audio.swish(false); }
          if (t > 0.54 && !(this.spinSwish & 2)) { this.spinSwish |= 2; BR.Audio.swish(false); }
          if (t > 0.69 && !(this.spinSwish & 4)) { this.spinSwish |= 4; BR.Audio.swish(false); }
          if (t > 0.84 && !(this.spinSwish & 8)) { this.spinSwish |= 8; BR.Audio.click(); }
        } else if (def.melee) {
          // Karambit inspect: the hand rises to the centre and turns upright while the knife twirls
          // round the ring finger and ends hanging below the fist; hold that show pose with a gentle
          // sway; then a last half-twirl as the hand drops back into the low hold
          // v1.11 (CS-style): raise it, turn the wrist to show one side of the blade, turn it over to
          // show the other, then two full spins round the index finger in the ring and catch
          const up = win(t, 0.0, 0.12, 0.86, 0.97);
          ox -= 0.07 * up; oy += 0.08 * up; oz -= 0.05 * up;
          const show = win(t, 0.06, 0.18, 0.38, 0.48), show2 = win(t, 0.4, 0.5, 0.56, 0.62);
          orz += KI.z1 * show + KI.z2 * show2; ory += KI.y1 * show + KI.y2 * show2; orx += KI.x1 * show + KI.x2 * show2;
          spinAng = easeInOut((t - 0.62) / 0.22) * Math.PI * 4;
          ringW = win(t, 0.58, 0.63, 0.84, 0.9);
          const hold = win(t, 0.16, 0.24, 0.72, 0.78);
          orz += 0.035 * Math.sin(t * Math.PI * 3) * hold; ory += 0.03 * Math.sin(t * Math.PI * 2) * hold;
          const turns = Math.floor(spinAng / Math.PI + 0.25);
          if (turns > this.spinSwish) { this.spinSwish = turns; BR.Audio.swish(false); }
        } else {
          const a = win(t, 0, 0.2, 0.45, 0.6), b = win(t, 0.45, 0.6, 0.85, 1);
          ory += a * 0.95 - b * 0.35; orz += a * 0.4 + b * 0.55; orx += b * 0.35;
          ox -= a * 0.12 + b * 0.04; oy += a * 0.05 + b * 0.04; oz += b * 0.06;
        }
      }
      // Knife slash: wind-up, fast arc across, follow-through; alternates direction
      if (this.swingT > 0) {
        const t = 1 - this.swingT / 0.42, dr = this.swingDir;
        const wind = win(t, 0, 0.12, 0.12, 0.3), cut = smooth((t - 0.12) / 0.2), back = smooth((t - 0.45) / 0.55);
        const arc = cut * (1 - back);
        ox += dr * (0.05 * wind - 0.2 * arc); oy += 0.03 * wind - 0.05 * arc;
        orz += dr * (0.35 * wind - 1.05 * arc); ory += dr * 0.6 * arc; orx += -0.5 * arc + 0.15 * wind;
      }
      if (this.throwT > 0) this.throwT = Math.max(0, this.throwT - dt);
      // Grapple: off hand throws out toward the hook; the gun drops to a one-handed hold
      this.ropeValid = false;
      const hooked = !!m.grapple;
      if (this.grapT > 0) this.grapT = Math.max(0, this.grapT - dt);
      this.grapW = U.damp(this.grapW, hooked || this.grapT > 0 ? 1 : 0, hooked || this.grapT > 0 ? 18 : 8, dt);
      // Stim (Warzone-style): pen comes up, cap flicked off, jabbed into the thigh
      if (this.stimT > 0) {
        this.stimT = Math.max(0, this.stimT - dt);
        this.stimK = 1 - this.stimT / this.stimDur;
        const passedS = x => this.lastStimK < x && this.stimK >= x;
        if (passedS(0.24)) BR.Audio.click();
        if (passedS(0.46)) {   // needle goes into the chest: the whole view flinches
          const c = this.game.cam; c.kick = Math.max(c.kick, 0.07); c.punchV = (c.punchV || 0) - 0.9; c.rollV = (c.rollV || 0) + 0.6;
          this.rot.z.vel += 1.4; this.pos.y.vel -= 0.6; BR.Audio.swish(true);
        }
        this.lastStimK = this.stimK;
      }
      this.stimW = U.damp(this.stimW, this.stimT > 0 && this.stimK < 0.86 ? 1 : 0, this.stimT > 0 && this.stimK < 0.86 ? 16 : 9, dt);
      // look down at the chest while stabbing (the game camera tilts by the same amount)
      this.lookDown = this.stimT > 0 ? 0.22 * win(this.stimK, 0.26, 0.4, 0.66, 0.84) : 0;
      if (this.injector) this.injector.userData.plunger.position.x = -0.075 + (this.stimK > 0.48 && this.stimT > 0 ? Math.min(1, (this.stimK - 0.48) / 0.15) * 0.022 : 0);
      const busy = Math.max(this.grapW, this.stimW, this.throwT > 0 ? 0.7 : 0);
      if (busy > 0.01) {
        oy -= 0.05 * busy; ox += 0.04 * busy; orz -= 0.22 * busy; orx -= 0.1 * this.stimW;
        if (this.stimW > 0.01) leftTarget = null;
      }

      // Bolt action: right hand leaves the grip, lifts the bolt, rips it back, drives it
      // home, locks it down and returns. The gun cants toward you while you work it.
      let rightTarget = null, boltLift = 0, boltBack = 0;
      if (this.boltT > 0 && ud.bolt && !reloading) {
        const k = 1 - this.boltT / this.boltDur;
        const reach = smooth(k / 0.18), ret = smooth((k - 0.8) / 0.2);
        boltLift = smooth((k - 0.16) / 0.12) * (1 - smooth((k - 0.66) / 0.12));
        boltBack = smooth((k - 0.3) / 0.16) * (1 - smooth((k - 0.5) / 0.14));
        const cant = win(k, 0, 0.2, 0.75, 1) * (1 - A * 0.6);
        orz += 0.32 * cant; ory += 0.12 * cant; oy += 0.015 * cant; orx += 0.06 * cant + boltBack * 0.04;
        oz += boltBack * 0.015;
        rightTarget = { w: reach * (1 - ret) };
        const passed = x => this.lastBoltK < x && k >= x;
        if (passed(0.32)) { BR.Audio.click(); }
        if (passed(0.5)) { BR.Audio.reload(); this.pos.z.vel += 0.25; }
        this.lastBoltK = k;
      } else this.lastBoltK = 0;
      if (ud.bolt) { ud.bolt.rotation.z = boltLift * 1.05; ud.bolt.position.z = ud.boltZ0 + boltBack * 0.075; }
      // pump: forend snaps back (spent shell out), then forward; the gun dips and rolls a touch
      let pumpBack = 0;
      if (this.pumpT > 0 && ud.pump && !reloading) {
        const k = 1 - this.pumpT / this.pumpDur;
        pumpBack = smooth(k / 0.35) * (1 - smooth((k - 0.5) / 0.35));
        const tilt = win(k, 0, 0.2, 0.7, 1) * (1 - A * 0.5);
        orz += 0.12 * tilt; orx -= 0.05 * tilt; oy -= 0.008 * tilt; oz += pumpBack * 0.012;
        const passed = x => this.lastPumpK < x && k >= x;
        if (passed(0.3)) BR.Audio.click();
        if (passed(0.75)) { BR.Audio.reload(); this.pos.z.vel -= 0.2; }
        this.lastPumpK = k;
      } else this.lastPumpK = 0;
      if (ud.pump) ud.pump.position.z = pumpBack * 0.07;

      // Signature reloads (Legendary / Mythic / Exotic blueprints): a flashy move + glow VFX
      this.reloadEl = reloading ? (this.reloadEl || 0) + dt : 0;
      const sig = !def.melee && this.sigReload[w.id];
      if (reloading && sig) {
        const kk = def.shellReload ? Math.min(1, this.reloadEl / 0.9) : 1 - w.reloadT / def.reload;
        const st = sig.style, E = smooth;
        if (st === 'twirl') { const a = E((kk - 0.06) / 0.34); orz += a * Math.PI * 2; oy += Math.sin(a * Math.PI) * 0.05; oz -= Math.sin(a * Math.PI) * 0.04; }
        else if (st === 'flip') { const a = E((kk - 0.5) / 0.3); orx += a * Math.PI * 2; oy += Math.sin(a * Math.PI) * 0.09; }
        else if (st === 'toss') { const a = Math.min(1, Math.max(0, (kk - 0.12) / 0.36)); oy += Math.sin(a * Math.PI) * 0.16; orx -= E(a) * Math.PI * 2; ory += Math.sin(a * Math.PI) * 0.4; }
        else if (st === 'spin') { const a = E((kk - 0.58) / 0.3); ory += a * Math.PI * 2; ox -= Math.sin(a * Math.PI) * 0.05; }
        else if (st === 'warp') {
          // the gun shrinks into a portal, blinks, and pops back out bigger with a ring burst
          const sh = win(kk, 0.12, 0.3, 0.52, 0.68);
          holder.scale.setScalar(1 - 0.94 * sh + 0.08 * win(kk, 0.66, 0.72, 0.74, 0.86));
          orz += sh * Math.PI * 1.5; oy += sh * 0.05;
          if (this.lastSigK < 0.3 && kk >= 0.3) { this.ringFx(model.localToWorld(this._v.set(0, 0, 0)), sig.fx); }
          if (this.lastSigK < 0.66 && kk >= 0.66) { this.ringFx(model.localToWorld(this._v.set(0, 0, 0)), sig.fx); this.pos.z.vel += 0.6; }
        }
        else if (st === 'orbit') {
          // the gun swings round a little loop while rolling once
          const a = E((kk - 0.18) / 0.5), ang = a * Math.PI * 2;
          ox += Math.sin(ang) * 0.07; oy += (1 - Math.cos(ang)) * 0.045; oz -= Math.sin(ang * 0.5) * 0.05; orz -= ang; ory += Math.sin(ang) * 0.25;
        }
        else if (st === 'slam') {
          // heave the gun up, then slam it down with a shockwave and a heavy settle
          const up = win(kk, 0.1, 0.3, 0.36, 0.44), dn = win(kk, 0.42, 0.47, 0.5, 0.66);
          oy += up * 0.12 - dn * 0.07; orx += up * 0.7 - dn * 0.35; orz += up * 0.25;
          if (this.lastSigK < 0.46 && kk >= 0.46) { const at2 = model.localToWorld(this._v.set(0, -0.05, 0)); this.ringFx(at2, sig.fx); this.vfx(at2, sig.fx, 22, 2); this.pos.y.vel -= 0.9; }
        }
        else if (st === 'glitch' && kk > 0.08 && kk < 0.9) {
          const f = Math.floor(performance.now() / 55), r1 = Math.sin(f * 12.9898) * 43758.5453, u = r1 - Math.floor(r1);
          if (u > 0.55) { ox += (u - 0.75) * 0.08; oy += (u - 0.7) * 0.05; orz += (u - 0.7) * 0.6; }
          model.visible = !(u > 0.93);
        }
        const passedR = x => this.lastSigK < x && kk >= x;
        const at = model.localToWorld(this._v.set(0, 0.0, -0.1));
        if (passedR(0.2)) { this.vfx(at, sig.fx, 14, 1.4); this.ringFx(at, sig.fx); BR.Audio.swish(false); }
        if (passedR(0.68)) { this.vfx(at, sig.fx, 18, 1.8); this.ringFx(at, sig.fx); }
        if (passedR(0.97)) this.vfx(at, 0xffffff, 10, 1.2);
        this.lastSigK = kk;
      } else { this.lastSigK = 0; model.visible = true; }
      if (!(reloading && sig && sig.style === 'warp') && holder.scale.x !== 1) holder.scale.setScalar(1);

      // Butterfly: fluid wrist follow-through. A spring per axis is driven by how fast the blade and
      // bite handle are swinging, so every flip rolls / lifts / turns the wrist and it settles smoothly.
      if (w.id === 'butterfly') {
        const bw = this.bfW || (this.bfW = { r: 0, rv: 0, p: 0, pv: 0, y: 0, yv: 0, pf: 0, pa: 0, on: false });
        const fl = bfly ? bfly.flip : 0, aa = bfly ? bfly.a : 0, idt = 1 / Math.max(dt, 1e-3);
        const vf = bw.on && bfly ? (fl - bw.pf) * idt : 0, va = bw.on && bfly ? (aa - bw.pa) * idt : 0;
        bw.pf = fl; bw.pa = aa; bw.on = !!bfly;
        const vr = bw.on && bfly ? ((bfly.roll || 0) - (bw.pr || 0)) * idt : 0; bw.pr = bfly ? (bfly.roll || 0) : 0;
        const tr = U.clamp(-0.022 * vf + 0.012 * va, -0.42, 0.42), tp = U.clamp(0.016 * Math.abs(vf) + 0.007 * Math.abs(va), 0, 0.36), ty = U.clamp(0.011 * vf, -0.28, 0.28);
        const step = (x, v, tg) => { v += (-(x - tg) * 95 - v * 14) * Math.min(dt, 0.05); return [x + v * Math.min(dt, 0.05), v]; };
        [bw.r, bw.rv] = step(bw.r, bw.rv, tr); [bw.p, bw.pv] = step(bw.p, bw.pv, tp); [bw.y, bw.yv] = step(bw.y, bw.yv, ty);
        orz += bw.r; orx -= bw.p; ory += bw.y; oy += bw.p * 0.03;
        // idle: a slow relaxed wrist drift so the hold never looks frozen
        if (!bfly) { this.bfIdle = (this.bfIdle || 0) + dt; const q = this.bfIdle; orz += 0.035 * Math.sin(q * 1.1); orx += 0.025 * Math.sin(q * 0.8 + 1); ory += 0.03 * Math.sin(q * 0.6); }
      }
      if (BAYLIKE(w.id) && !bay && this.inspectT <= 0) { this.bfIdle = (this.bfIdle || 0) + dt; const q = this.bfIdle; orz += 0.03 * Math.sin(q * 1.1); orx += 0.02 * Math.sin(q * 0.8 + 1); ory += 0.025 * Math.sin(q * 0.6); }
      this._bUpNow = bUp;
      // melee blade trail: sample after the pose is applied (see end of update)
      this._trailFrame = this.bfTrail && this.bfTrail.id === w.id ? { model } : null;
      // Reloads
      const port = ud.port, fore = ud.fore;
      if (reloading && !def.melee) {
        const k = 1 - w.reloadT / def.reload;
        if (def.shellReload) {
          // Tilt the gun to show the loading port; left hand feeds a shell each cycle
          const tilt = 1;
          orz -= 0.45 * tilt; ory -= 0.25 * tilt; ox += 0.02; oy += 0.025; orx += 0.08;
          const lp = this._v2.copy(port);
          const reach = smooth(k / 0.55), push = smooth((k - 0.55) / 0.3), away = smooth((k - 0.85) / 0.15);
          leftTarget = lp.set(port.x - 0.01, port.y - 0.16 * (1 - reach) - 0.01 * away, port.z + 0.06 * (1 - reach) - 0.035 * push + 0.08 * away);
          if (this.shellT > 0) oy -= Math.sin(this.shellT / 0.2 * Math.PI) * 0.02;
        } else if (def.revolver && ud.crane) {
          // Revolver: roll the gun, swing the cylinder out, punch the ejector (cylinder spins), left hand
          // brings a speedloader up and drives it in, flick the cylinder shut, settle
          const tilt = win(k, 0, 0.1, 0.84, 0.97), up = win(k, 0.14, 0.2, 0.3, 0.36);
          orz += 0.75 * tilt; ory -= 0.2 * tilt; oy += 0.05 * tilt; ox -= 0.05 * tilt; orx += 0.55 * up - 0.15 * tilt;
          const open = win(k, 0.04, 0.14, 0.72, 0.8);
          ud.crane.rotation.z = open * 1.35;
          if (k > 0.14 && k < 0.34) this.cylSpinV = 18;                                    // empties dumped
          const sl = ud.speedloader, slIn = smooth((k - 0.42) / 0.18), slOn = k > 0.3 && k < 0.66;
          sl.visible = slOn;
          // speedloader path in model space: from below the gun up to the open cylinder's rear face
          const cylAt = ud.crane.localToWorld(this._v.set(0.016, 0.02, 0.03)); model.worldToLocal(cylAt);
          magOff = this._v2.set(0, -0.28, 0.12).lerp(cylAt.sub(this._rvSl || (this._rvSl = new THREE.Vector3(0, 0.042, 0.03))), slIn);
          const handAt = this._rvHand || (this._rvHand = new THREE.Vector3());
          handAt.set(0, 0.042, 0.03).add(magOff).add(this._rvOff || (this._rvOff = new THREE.Vector3(0, -0.04, -0.012)));
          if (k < 0.2) leftTarget = (fore || handAt).clone().lerp(new THREE.Vector3(-0.1, -0.4, 0.2), smooth(k / 0.2));
          else if (k < 0.7) leftTarget = handAt.clone();
          else leftTarget = new THREE.Vector3(-0.02, 0.05, -0.03).lerp(fore || handAt, smooth((k - 0.72) / 0.2));   // palm flicks it shut
          const passed = x => this.lastReloadK < x && k >= x;
          if (passed(0.12)) { BR.Audio.click(); this.rot.z.vel += 0.8; }
          if (passed(0.22)) { BR.Audio.reload(); this.pos.y.vel += 0.4; }
          if (passed(0.6)) { BR.Audio.click(); this.pos.z.vel -= 0.3; }
          if (passed(0.76)) { BR.Audio.reload(); this.rot.z.vel -= 1.6; }
          this.lastReloadK = k;
        } else {
          // Magazine: tilt, mag out, hand to pouch, new mag in, slap, (rifles) charge
          const tilt = win(k, 0, 0.12, 0.82, 0.97);
          // roll the gun so the mag well faces you, lift it and bring it toward centre
          orz -= 0.5 * tilt; orx += 0.3 * tilt; ory += 0.38 * tilt; oy += 0.06 * tilt; ox -= 0.08 * tilt; oz += 0.03 * tilt;
          const magPos = this._v.set(0, 0, 0);
          if (k < 0.18) magOff = magPos.set(0, 0, 0);
          else if (k < 0.34) { const d = smooth((k - 0.18) / 0.16); magOff = magPos.set(0, -0.32 * d, 0.06 * d); magVis = d < 0.95; }
          else if (k < 0.52) { magVis = false; magOff = magPos.set(0, -0.3, 0.05); }
          else if (k < 0.7) { const d = smooth((k - 0.52) / 0.18); magOff = magPos.set(0, -0.24 * (1 - d), 0.05 * (1 - d)); }
          else magOff = magPos.set(0, 0, 0);
          // left hand path (model space)
          const mc = ud.mag && ud.mag.children[0];
          const magAt = mc ? this._v2.set(0, mc.position.y - 0.045, mc.position.z).add(magOff) : this._v2.set(0, -0.1, -0.08);
          const pouch = new THREE.Vector3(-0.12, -0.42, 0.18);
          if (k < 0.15) leftTarget = fore ? fore.clone().lerp(magAt, smooth(k / 0.15)) : magAt.clone();
          else if (k < 0.32) leftTarget = magAt.clone();
          else if (k < 0.52) leftTarget = magAt.clone().lerp(pouch, win(k, 0.32, 0.42, 0.44, 0.52));
          else if (k < 0.72) leftTarget = magAt.clone();
          else if (ud.charge && (def.rpm >= 300 || w.id === 'sniper')) {
            const ch = ud.charge || fore;
            const toC = smooth((k - 0.72) / 0.08), pull = win(k, 0.8, 0.85, 0.85, 0.9), back = smooth((k - 0.9) / 0.1);
            leftTarget = magAt.clone().lerp(ch, toC).add(new THREE.Vector3(0, 0, 0.05 * pull)).lerp(fore || ch, back);
          } else leftTarget = magAt.clone().lerp(fore || magAt, smooth((k - 0.72) / 0.2));
          // one-shot jolts + sounds when passing key moments
          const passed = x => this.lastReloadK < x && k >= x;
          if (passed(0.22)) { BR.Audio.click(); this.rot.z.vel -= 0.6; }
          if (passed(0.68)) { BR.Audio.reload(); this.pos.y.vel += 0.5; this.rot.x.vel -= 1.2; }
          if (passed(0.86) && ud.charge) { BR.Audio.reload(); this.pos.z.vel += 0.5; }
          this.lastReloadK = k;
        }
      } else this.lastReloadK = 0;

      // ---- springs ---------------------------------------------------------------
      const P = this.pos, R = this.rot, K = this.kick, KR = this.kickR;
      P.x.step(tx, dt); P.y.step(ty, dt); P.z.step(tz, dt);
      R.x.step(rx, dt); R.y.step(ry, dt); R.z.step(rz, dt);
      K.x.step(0, dt); K.y.step(0, dt); K.z.step(0, dt);
      KR.x.step(0, dt); KR.y.step(0, dt); KR.z.step(0, dt);
      const g = this.root;
      g.position.set(P.x.v + K.x.v + ox, P.y.v + K.y.v + oy, P.z.v + K.z.v + oz);
      g.rotation.set(R.x.v + KR.x.v + orx, R.y.v + KR.y.v + ory, R.z.v + KR.z.v + orz);
      g.scale.setScalar(s);

      // Revolver: cylinder indexing / spinning, crane closed when not reloading
      if (ud.cylinder) {
        this.cylSpinV = (this.cylSpinV || 0) * Math.exp(-dt * 3);
        this.cylAng = (this.cylAng || 0) + this.cylSpinV * dt;
        this.cylAng += ((this.cylTarget || 0) - this.cylAng) * Math.min(1, dt * 18) * (this.cylSpinV > 1 ? 0 : 1);
        if (this.cylSpinV > 1) this.cylTarget = this.cylAng;
        ud.cylinder.rotation.z = this.cylAng;
        if (!reloading) { ud.crane.rotation.z = 0; if (ud.speedloader) ud.speedloader.visible = false; }
      }
      // Butterfly handles + roll (open and still when idle)
      if (ud.handleA) {
        const fl = bfly ? bfly.flip : 0, inner = model.userData.inner, pv = model.userData.pivot;
        ud.handleA.rotation.x = bfly ? bfly.a : 0; ud.handleB.rotation.x = -fl;
        // roll spins the knife's parts around the handle axis inside the fist (the hand itself stays put)
        if (inner) { inner.rotation.set(fl, bfly && bfly.roll ? bfly.roll : 0, 0); const c = Math.cos(fl), sn = Math.sin(fl); inner.position.set(0, pv.y - (pv.y * c - pv.z * sn), pv.z - (pv.y * sn + pv.z * c)); }
        if (model.userData.qIdle) model.quaternion.copy(model.userData.qIdle).slerp(model.userData.qUp, bUp);
      }
      // Bayonet toss / roll: the knife moves inside the (still) fist about its balance point
      if (ud.bayonet && ud.inner) {
        const inr = ud.inner, pv = model.userData.pivot || this._v.set(0, 0, 0);
        inr.rotation.set(bay ? bay.flip : 0, bay ? bay.roll : 0, 0);
        const r = this._v2.copy(pv).applyEuler(inr.rotation);
        inr.position.set(pv.x - r.x, pv.y - r.y + (bay ? bay.lift : 0), pv.z - r.z);
        const Q = this._bq || (this._bq = new THREE.Quaternion());
        Q.copy(model.userData.qUp).slerp(model.userData.qUp2, bUp2);
        model.quaternion.copy(model.userData.qIdle).slerp(Q, bUp);
      }
      // Karambit ring twirl
      if (holder.userData.spin) {
        // CS:GO-style flip: during twirls the knife turns edge-on so its ring lines up with the
        // index finger (pointing across the screen), then flips forward over the top of the finger.
        const sp = holder.userData.spin;
        const finger = this._fx || (this._fx = new THREE.Vector3());
        this._fq = (this._fq || new THREE.Quaternion()).copy(g.quaternion).invert();
        finger.set(-0.92, 0.08, -0.38).normalize().applyQuaternion(this._fq);          // finger axis in the knife's parent frame
        const align = (this._qa || (this._qa = new THREE.Quaternion())).setFromUnitVectors(sp.axis, finger);
        const alignW = (this._qb || (this._qb = new THREE.Quaternion())).identity().slerp(align, ringW);
        if (ringW > 0.001) sp.obj.quaternion.setFromAxisAngle(finger, spinAng).multiply(alignW);   // flip over the finger
        else sp.obj.quaternion.setFromAxisAngle(sp.axis, -spinAng);
        sp.ang = spinAng; sp.ringW = ringW;
      }
      // Mag + muzzle flash
      if (ud.mag) { ud.mag.position.copy(magOff || this._v.set(0, 0, 0)); ud.mag.visible = magVis; }
      ud.flash.visible = this.flashT > 0 && A < 0.5;
      if (ud.flash.visible) ud.flash.rotation.z = Math.random() * 3;

      // Charm swings from look + movement + recoil
      const ch = ud.charmObj;
      if (ch) {
        const force = -lookDX * 0.02 + p.input.mx * 0.4 - K.z.v * 8 + (P.y.vel || 0) * 0.5;
        this.charmV += (-55 * this.charmA - 5 * this.charmV + force * 30) * dt;
        this.charmA += this.charmV * dt;
        ch.rotation.z = U.clamp(this.charmA, -1.2, 1.2);
        ch.rotation.x = U.clamp(this.charmA * 0.4, -0.8, 0.8);
      }

      this.placeArms(holder, model, ud, leftTarget, leftHidden, rightTarget);
      if (this.bfTrail) this.stepTrail(dt);
      this.updateVfx(dt);
      BR.Models.animate(model, performance.now() / 1000);     // Mythic blueprints: rings, orbiters, hue cycling
    }

    // Hands follow anchors on the weapon; sleeves run from the wrist to an elbow
    // point just off-screen, so it reads as two arms holding the gun.
    placeArms(holder, model, ud, leftTarget, leftHidden, rightTarget) {
      this.root.updateMatrixWorld(true);
      const A = this.adsW, s = this.scale;
      const R = this.arms.R, L = this.arms.L;
      let wq = model.getWorldQuaternion(this._q);
      // right hand on the grip (palm against the grip's right side, fingers wrapping the front)
      let gp = model.localToWorld(this._v.copy(ud.grip));
      const spin = holder.userData.spin;
      const bf = !!ud.handleA || !!ud.bayonet;
      const KH = this.knifeHands;
      let H = spin ? (spin.ringW > 0.45 ? KH.RP : KH.R) : bf ? KH.RB : R.hand;     // karambit: backhand fist (pointing finger in the ring while it spins); butterfly: hammer-grip fist
      R.hand.visible = KH.R.visible = KH.L.visible = KH.RB.visible = KH.RP.visible = false;
      if (bf) {
        // Butterfly: closed fist round the safe handle (the handle stays put in the hand while
        // the blade and bite handle flip around the pin)
        // Natural hammer grip: the handle runs across the palm, and the fist is lined up with the
        // forearm (wrist straight, pointing back toward a relaxed elbow) instead of being bent to
        // match the knife's tilt
        const hc = this._bh1 || (this._bh1 = new THREE.Vector3()), ht = this._bh2 || (this._bh2 = new THREE.Vector3());
        model.localToWorld(hc.set(0, model.userData.gripY || -0.07, 0)); model.localToWorld(ht.set(0, -0.01, 0));
        const X = (this._bhx || (this._bhx = new THREE.Vector3())).subVectors(ht, hc).normalize().multiplyScalar(model.userData.thumbSign || BF_THUMB);
        let AV = model.userData.armVec || BF_ARM;
        if (model.userData.armVecUp) AV = (this._avb || (this._avb = new THREE.Vector3())).copy(AV).lerp(model.userData.armVecUp, this._bUpNow || 0);
        const Z = (this._bhz || (this._bhz = new THREE.Vector3())).set(AV.x * s, AV.y, AV.z);
        const armLen = Z.length(), Zr = (this._bzr || (this._bzr = new THREE.Vector3())).copy(Z).normalize();
        Z.addScaledVector(X, -Z.dot(X)).normalize();
        // v1.12.1: the forearm leaves the wrist along the fist's own axis, cocked at most ~32° toward the
        // natural arm direction (like a real hammer grip). It used to aim straight at the raw arm vector,
        // which bent the wrist ~90° in the upright bayonet pose.
        const ang = Math.acos(BR.util.clamp(Z.dot(Zr), -1, 1)), tk = ang > 0.56 ? 0.56 / ang : 1;
        const F = (this._bzf || (this._bzf = new THREE.Vector3())).copy(Z).multiplyScalar(1 - tk).addScaledVector(Zr, tk).normalize();
        this._bfElbow = (this._bfElbow || new THREE.Vector3()).copy(hc).addScaledVector(F, armLen);
        const Y = (this._bhy || (this._bhy = new THREE.Vector3())).crossVectors(Z, X);
        H.quaternion.setFromRotationMatrix((this._bhm || (this._bhm = new THREE.Matrix4())).makeBasis(X, Y, Z));
        // bayonet: the forearm rolls the fist over (back of the hand up) for the flat idle, back for upright poses
        if (model.userData.wristRoll) H.quaternion.multiply((this._wrq || (this._wrq = new THREE.Quaternion())).setFromAxisAngle(this._zAx || (this._zAx = new THREE.Vector3(0, 0, 1)), model.userData.wristRoll * (1 - (this._bUpNow || 0))));
        H.position.copy(hc).sub(this._v2.set(0, -0.014, -0.029).multiplyScalar(1.3).applyQuaternion(H.quaternion));
      } else if (spin) {
        // Karambit: a backhand fist round the handle, index finger by the ring. The hand
        // stays put during twirls and the knife spins round the ring at the index finger.
        const sq = this._ksq || (this._ksq = new THREE.Quaternion());
        sq.copy(spin.obj.quaternion); spin.obj.quaternion.identity(); spin.obj.updateMatrixWorld(true);
        const a = model.localToWorld((this._kv2 || (this._kv2 = new THREE.Vector3())).set(0, 0.002, 0.004));      // handle centre line
        const b = model.localToWorld((this._kv3 || (this._kv3 = new THREE.Vector3())).set(0, 0.044, 0.1));
        spin.obj.quaternion.copy(sq); spin.obj.updateMatrixWorld(true);
        // mirrored glove (thumb on -X): -X points at the ring, wrist down toward you, back of hand up
        const X = (this._kx || (this._kx = new THREE.Vector3())).subVectors(a, b).normalize();
        const Z = (this._kz || (this._kz = new THREE.Vector3())).set(0.6, -0.78, -0.05).normalize();
        Z.addScaledVector(X, -Z.dot(X)).normalize();
        const Y = (this._ky || (this._ky = new THREE.Vector3())).crossVectors(Z, X);
        const gripQ = (this._kq2 || (this._kq2 = new THREE.Quaternion())).setFromRotationMatrix((this._km || (this._km = new THREE.Matrix4())).makeBasis(X, Y, Z));
        const fist = this._v2.set(0, -0.014, -0.029).multiplyScalar(1.3).applyQuaternion(gripQ);   // centre of the closed fingers
        H.position.copy(a.lerp(b, 0.5)).sub(fist);
        H.quaternion.copy(gripQ);
        // Twirls: the hand opens off the handle so the index finger sits in the ring, and the
        // knife rolls around that finger; it closes back onto the handle for the final pose.
        const rw = spin.ringW || 0;
        if (rw > 0.001) {
          // The index finger straightens and goes THROUGH the ring: the finger lies along the knife's
          // spin axis with the ring's centre on it, so the knife visibly rolls around the finger.
          const ringC = spin.obj.getWorldPosition(this._kv1 || (this._kv1 = new THREE.Vector3()));
          const F = this._kF || (this._kF = new THREE.Vector3(-0.92, 0.08, -0.38).normalize());
          const Zp = (this._kzp || (this._kzp = new THREE.Vector3())).copy(F).negate();
          const Yp = (this._kyp || (this._kyp = new THREE.Vector3())).set(0, 1, 0.25); Yp.addScaledVector(Zp, -Yp.dot(Zp)).normalize();
          const Xp = (this._kxp || (this._kxp = new THREE.Vector3())).crossVectors(Yp, Zp);
          const pq = (this._kpq || (this._kpq = new THREE.Quaternion())).setFromRotationMatrix((this._kpm || (this._kpm = new THREE.Matrix4())).makeBasis(Xp, Yp, Zp));
          const q = (this._kq4 || (this._kq4 = new THREE.Quaternion())).copy(gripQ).slerp(pq, smooth(rw));
          const onFinger = this._v2.set(-0.0195, 0.002, -0.062).multiplyScalar(1.3).applyQuaternion(q);   // point mid-way along the straight index finger
          H.position.lerp(ringC.sub(onFinger), smooth(rw));
          H.quaternion.copy(q);
        }
      } else {
        R.hand.position.copy(gp);
        R.hand.quaternion.copy(wq).multiply(this._qGrip || (this._qGrip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, -Math.PI / 2))));
        R.hand.translateX(0.0); R.hand.translateY(0.026); R.hand.translateZ(0.012);
        if (rightTarget && rightTarget.w > 0 && ud.bolt) {
          // pinch the bolt knob: hand sits just behind/right of it, fingers forward
          const kp = ud.bolt.localToWorld((this._kb2 || (this._kb2 = new THREE.Vector3())).copy(ud.boltKnob));
          // fingers reach in from the right toward the knob, wrist back toward the elbow
          const Zc = (this._bz || (this._bz = new THREE.Vector3())).set(0.75, -0.45, 0.5).normalize();
          const Yb = (this._by || (this._by = new THREE.Vector3())).set(0.1, 1, 0.15);
          Yb.addScaledVector(Zc, -Yb.dot(Zc)).normalize();
          const Xb = (this._bx || (this._bx = new THREE.Vector3())).crossVectors(Yb, Zc);
          const bq = (this._kq3 || (this._kq3 = new THREE.Quaternion())).setFromRotationMatrix((this._bm || (this._bm = new THREE.Matrix4())).makeBasis(Xb, Yb, Zc));
          const off = this._v2.set(0, -0.018, -0.062).multiplyScalar(1.3 * this.scale).applyQuaternion(bq);
          kp.sub(off);
          R.hand.position.lerp(kp, rightTarget.w);
          R.hand.quaternion.slerp(bq, rightTarget.w);
        }
      }
      H.visible = true;
      // the butterfly is held high in view, so its elbow sits low and forward (keeps the sleeve end off the camera)
      const elbowR = spin ? this._v2.set(0.5 * s, -0.68, -0.3) : bf ? this._v2.copy(this._bfElbow) : this._v2.set(U.lerp(0.3, 0.2, A) * s, U.lerp(-0.62, -0.55, A), 0.08);
      H.updateMatrixWorld(true);
      this.limb(R.fore, H.localToWorld(new THREE.Vector3(0, 0, spin || bf ? 0.075 : 0.05)), elbowR, spin || bf ? 0.72 : 1);
      // left hand on the foregrip / mag / charging handle
      const lt = leftTarget || (ud.pump && ud.fore ? this._pumpFore.copy(ud.fore).setZ(ud.fore.z + ud.pump.position.z) : ud.fore);
      const special = this.specialLeft();          // grapple / stim pose (or null)
      this.launcher.visible = false; this.injector.visible = false; this.vmNade.visible = false;
      if (spin && !(special && special.w > 0.05)) {
        // empty left fist, mirroring the knife hand (like CS)
        L.hand.visible = false;
        const P = this.pos;                    // follows bob/sway/landing, not the knife's slashes
        KH.L.position.set(-P.x.v - 0.1 * s, P.y.v - 0.05, P.z.v + 0.02);
        const LX = this._sx.set(0.9, -0.35, 0.2).normalize(), LZ = this._sz.set(-0.35, -0.9, -0.15).normalize();
        LZ.addScaledVector(LX, -LZ.dot(LX)).normalize();
        KH.L.quaternion.setFromRotationMatrix(this._sm.makeBasis(LX, this._sy.crossVectors(LZ, LX), LZ));
        KH.L.visible = false;                  // v1.11: like CS, the off hand stays out of view with the karambit
        KH.L.updateMatrixWorld(true);
        L.fore.visible = false;
        return;
      }
      if ((!lt || leftHidden) && !special) { L.hand.visible = L.fore.visible = false; return; }
      if (lt && !leftHidden) {
        const lp = model.localToWorld(this._v.copy(lt));
        L.hand.position.copy(lp);
        // v1.11.1: a straight wrist. The hand is lined up with the forearm (wrist axis pointing at the
        // elbow, lower left) with the palm turned up against the underside of the handguard, so the
        // fingers wrap the far side and no joint bends at an odd angle.
        const gUp = this._gUp || (this._gUp = new THREE.Vector3()), gRt = this._gRt || (this._gRt = new THREE.Vector3());
        gUp.set(0, 1, 0).applyQuaternion(wq); gRt.set(1, 0, 0).applyQuaternion(wq);
        L.hand.position.addScaledVector(gUp, -0.038).addScaledVector(gRt, -0.012);
        const elb = this._lElb || (this._lElb = new THREE.Vector3());
        elb.copy(L.hand.position).add(this._sv.set(U.lerp(-0.3, -0.22, A) * s, U.lerp(-0.3, -0.26, A), U.lerp(0.14, 0.18, A)));
        const Zw = this._lZ || (this._lZ = new THREE.Vector3()); Zw.subVectors(elb, L.hand.position).normalize();
        const Yw = this._lY || (this._lY = new THREE.Vector3()); Yw.copy(gUp).negate().addScaledVector(Zw, gUp.dot(Zw)).normalize();
        const Xw = this._lX || (this._lX = new THREE.Vector3()); Xw.crossVectors(Yw, Zw);
        L.hand.quaternion.setFromRotationMatrix((this._lM || (this._lM = new THREE.Matrix4())).makeBasis(Xw, Yw, Zw));
      } else {
        // no off hand on this weapon (karambit): come in from below the screen
        L.hand.position.set(-0.3, -0.62, -0.25);
        L.hand.quaternion.copy(special.q);
      }
      if (special) {
        L.hand.position.lerp(special.p, special.w);
        L.hand.quaternion.slerp(special.q, special.w);
        this.launcher.visible = special.kind === 'grapple' && special.w > 0.05;
        if (special.kind === 'throw' && special.held) {
          this.vmNade.visible = true;
          this.vmNade.position.copy(L.hand.position).add(this._v2.set(0, -0.03, -0.055).multiplyScalar(1.3).applyQuaternion(L.hand.quaternion));
          BR.Models.animate(this.vmNade, performance.now() / 1000);
        }
        if (special.kind === 'stim') {
          // pen injector held in the fist, needle along the hand's X axis
          this.injector.visible = special.w > 0.05;
          this.injector.position.copy(L.hand.position).add(this._v2.set(0, -0.026, -0.05).multiplyScalar(1.3).applyQuaternion(L.hand.quaternion));
          this.injector.quaternion.copy(L.hand.quaternion);
          this.injector.userData.cap.visible = special.capOn;
        }
      }
      L.hand.visible = true;
      // v1.11: the forearm leaves the wrist sideways-down toward the lower left (seen from the side, like
      // most shooters) instead of pointing back at the camera (which showed only the cuff end-on)
      const elbowL = new THREE.Vector3().copy(L.hand.position).add(this._sv.set(U.lerp(-0.3, -0.22, A) * s, U.lerp(-0.3, -0.26, A), U.lerp(0.14, 0.18, A)));
      if (special) elbowL.lerp(this._v2.set(-0.34, -0.7, 0.05), special.w);
      L.hand.updateMatrixWorld(true);
      this.limb(L.fore, L.hand.localToWorld(new THREE.Vector3(0, 0, 0.05)), elbowL);
      // where the grapple rope leaves the launcher, mapped into the game camera's world
      if (this.launcher.visible) {
        const tip = this.launcher.userData.tip.getWorldPosition(this._v);
        tip.project(this.camera);
        const gc = this.game.camera, dir = this._v2.set(tip.x, tip.y, 0.5).unproject(gc).sub(gc.position).normalize();
        this.ropeFrom.copy(gc.position).addScaledVector(dir, 0.7);
        this.ropeValid = true;
      }
    }

    // ---- grapple + stim poses for the left hand (camera space) ----------------
    // Returns {kind, w, p, q, capOn} or null.
    specialLeft() {
      const B = (X, Zref, out) => {          // basis: hand X axis + wrist direction hint -> quaternion
        const Z = this._sz.copy(Zref); Z.addScaledVector(X, -Z.dot(X)).normalize();
        const Y = this._sy.crossVectors(Z, X);
        return out.setFromRotationMatrix(this._sm.makeBasis(X, Y, Z));
      };
      if (this.throwT > 0) {
        // grenade throw: hand comes up behind the shoulder line, then whips forward and releases
        const k = 1 - this.throwT / this.throwDur, q = this._sq1;
        const up = smooth(k / 0.35), fwd = smooth((k - 0.4) / 0.22), out = smooth((k - 0.7) / 0.3);
        const p = this._spo.set(-0.3, -0.55, -0.2).lerp(this._sv.set(-0.15, -0.06, -0.24), up).lerp(this._sx.set(-0.05, -0.02, -0.62), fwd).lerp(this._sy.set(-0.25, -0.5, -0.3), out);
        const X = this._sx.set(0.3, 1, 0.2).normalize();
        const Z = this._sz.set(-0.3, -0.4, 0.85).lerp(this._sv.set(-0.1, -0.2, 0.97), fwd); Z.addScaledVector(X, -Z.dot(X)).normalize();
        q.setFromRotationMatrix(this._sm.makeBasis(X, this._sy.crossVectors(Z, X), Z));
        return { kind: 'throw', w: Math.min(1, Math.min(k / 0.12, (1 - k) / 0.2)), p, q, held: k < 0.58 };
      }
      if (this.stimW > 0.01) {
        const k = this.stimK, q = this._sq1;
        // enter from below -> present the pen and flick the cap -> turn the needle on yourself ->
        // stab it into the left side of the chest, press, hold -> pull it out and drop it away
        const P0 = this._sp0.set(-0.28, -0.6, -0.22), P1 = this._sp1.set(-0.1, -0.1, -0.36);
        const present = smooth(k / 0.16), aim = smooth((k - 0.28) / 0.12), stab = smooth((k - 0.42) / 0.05), out = smooth((k - 0.7) / 0.14);
        // needle (+X of the fist): down-forward while presenting, then turned back onto your chest
        const needle = this._sx.set(0.25, -0.6, -0.75).normalize().lerp(this._sv.set(0.12, -0.35, 0.93), aim).normalize();
        B(needle, this._sv.set(-0.6, -0.5, 0.2), q);
        // solve the hand so the needle tip lands on the left chest (body space, before the look-down tilt)
        const tipOff = this._sp2.set(0.117, -0.034, -0.065).applyQuaternion(q);
        const chest = this._sy.set(-0.15, -0.2, -0.2);
        const wind = this._sz.copy(chest).addScaledVector(needle, -0.1).sub(tipOff);
        const p = this._spo.copy(P0).lerp(P1, present).lerp(wind, aim);
        p.addScaledVector(needle, 0.112 * stab);                                            // drive it in
        if (k > 0.47 && k < 0.7) p.add(this._sv.set((Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.003, 0));   // pressing
        p.lerp(this._sv.set(-0.3, -0.62, -0.2), out);
        if (k > 0.2 && k < 0.3) p.y += Math.sin((k - 0.2) / 0.1 * Math.PI) * 0.015;        // cap flick
        p.x += Math.sin(k * 9) * 0.005 * (1 - aim);
        // you look down at your chest for the stab: rotate the pose into the tilted view
        const qa = this._sq2.setFromAxisAngle(this._sv.set(1, 0, 0), this.lookDown);
        p.applyQuaternion(qa); q.premultiply(qa);
        return { kind: 'stim', w: this.stimW, p, q, capOn: k < 0.26, press: stab };
      }
      if (this.grapW > 0.01) {
        // arm thrown out toward the hook, fingers pointing at it, launcher on the wrist
        const g = this.game, m = g.player.mover, cam = g.camera;
        const d = this._sx.set(0, 0, -1);
        if (m.grapple) {
          d.set(m.grapple.x, m.grapple.y, m.grapple.z).sub(cam.position).normalize()
            .applyQuaternion(this._sq2.copy(cam.quaternion).invert());
          if (d.z > -0.35) { d.z = -0.35; d.normalize(); }
        }
        d.x = U.clamp(d.x, -0.6, 0.45); d.y = U.clamp(d.y, -0.35, 0.7); d.normalize();
        const fire = this.grapT > 0 ? Math.sin(U.clamp(1 - this.grapT / 0.3, 0, 1) * Math.PI) : 0;
        const p = this._spo.set(-0.16 + d.x * 0.1, -0.12 + d.y * 0.09, -0.4)
          .addScaledVector(d, 0.05 - fire * 0.04);                                                    // recoil kicks the hand back
        if (m.grapple) p.add(this._sv.set((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004, Math.min(0.06, m.grapple.t * 0.05)));   // rope tension
        // fingers along -Z point at the hook: Z = -d; back of the hand up
        const q = this._sq1, Z = this._sz.copy(d).negate(), Y = this._sy.set(0.15, 1, 0); Y.addScaledVector(Z, -Y.dot(Z)).normalize();
        const X = this._sv.crossVectors(Y, Z);
        q.setFromRotationMatrix(this._sm.makeBasis(X, Y, Z));
        return { kind: 'grapple', w: this.grapW, p, q };
      }
      return null;
    }

    // ---- viewmodel VFX (signature reloads): additive sparks + an expanding glow ring
    vfx(at, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const s = this.sparks[this.spi++ % this.sparks.length];
        s.m.position.copy(at); s.v.set(Math.random() - 0.5, Math.random() * 0.8 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
        s.m.material.color.setHex(Math.random() < 0.25 ? 0xffffff : color); s.life = s.max = 0.35 + Math.random() * 0.3; s.m.visible = true;
      }
    }
    ringFx(at, color) {
      const r = this.rings[this.rgi++ % this.rings.length];
      r.m.position.copy(at); r.m.lookAt(0, 0, 0); r.m.material.color.setHex(color); r.life = r.max = 0.4; r.m.visible = true;
    }
    updateVfx(dt) {
      for (const s of this.sparks) {
        if (s.life <= 0) continue;
        s.life -= dt; if (s.life <= 0) { s.m.visible = false; continue; }
        s.v.y -= 2.5 * dt; s.m.position.addScaledVector(s.v, dt);
        const k = s.life / s.max; s.m.scale.setScalar(0.006 + 0.008 * k); s.m.material.opacity = k;
      }
      for (const r of this.rings) {
        if (r.life <= 0) continue;
        r.life -= dt; if (r.life <= 0) { r.m.visible = false; continue; }
        const k = 1 - r.life / r.max; r.m.scale.setScalar(0.02 + k * 0.16); r.m.material.opacity = (1 - k) * 0.9;
      }
    }

    // a swish each time a flip phase passes
    stepTrail(dt) {
      const T = this.bfTrail, f = this._trailFrame, m = T.mesh;
      if (!f) { m.visible = false; T.tips.length = T.mids.length = 0; return; }
      const inner = f.model.userData.inner || f.model; inner.updateMatrixWorld(true);
      const tip = inner.localToWorld((f.model.userData.trailTip || new THREE.Vector3(0, 0.138, -0.003)).clone()), mid = inner.localToWorld((f.model.userData.trailMid || new THREE.Vector3(0, 0.085, -0.003)).clone());
      const last = T.tips[0], speed = last ? tip.distanceTo(last) / Math.max(dt, 1e-3) : 0;
      T.tips.unshift(tip); T.mids.unshift(mid); if (T.tips.length > T.N) { T.tips.length = T.N; T.mids.length = T.N; }
      T.on += ((speed > 0.6 ? 1 : 0) - T.on) * Math.min(1, dt * 10);      // shows while the blade is whipping round
      const pos = m.geometry.attributes.position.array, col = m.geometry.attributes.color.array, n = T.tips.length;
      for (let i = 0; i < T.N; i++) {
        const a = T.tips[Math.min(i, n - 1)], b = T.mids[Math.min(i, n - 1)], f1 = Math.max(0, 1 - i / (T.N - 1)), k = f1 * f1 * T.on;
        pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        // head colour -> tail colour along the ribbon (or a rainbow that cycles over time)
        const C = this._tc || (this._tc = new THREE.Color()), u = i / (T.N - 1);
        if (T.rainbow) C.setHSL((performance.now() / 1400 + u * 0.8) % 1, 1, 0.6); else C.copy(T.color).lerp(T.color2, u);
        const g2 = k * 0.85;
        col.set([C.r * g2, C.g * g2, C.b * g2, C.r * g2 * 0.25, C.g * g2 * 0.25, C.b * g2 * 0.25], i * 6);
      }
      m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.color.needsUpdate = true;
      m.visible = T.on > 0.02 && n > 2;
    }
    bflySwish(t, marks) {
      for (const m of marks) if (this.lastBflyT < m && t >= m) BR.Audio.swish(false);
      this.lastBflyT = t;
    }

    onGrapple() { this.grapT = 0.3; }
    onThrow() { this.throwT = this.throwDur = 0.42; }
    onStim() { this.stimT = this.stimDur = 0.95; this.lastStimK = 0; }

    limb(mesh, a, b, thick) {
      const d = this._d || (this._d = new THREE.Vector3());
      d.subVectors(b, a).multiplyScalar(1.7);                   // v1.11: run the sleeve well past the elbow (open end off-screen)
      const len = d.length();
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(this._up || (this._up = new THREE.Vector3(0, 1, 0)), d.normalize());
      mesh.scale.set(thick || 1, len, thick || 1);
      mesh.visible = true;
    }
  };
})();
