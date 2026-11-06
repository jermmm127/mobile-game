'use strict';
// =============================================================================
// GAME — owns the renderer, the match, the menu "trailer", the shop preview
// and the main loop.
//
// States: menu (live bot match filmed by a cinematic camera) | shop |
//         playing | paused | dead | won | end
//
// Frame order (update):
//   1. read player input -> player.input / look
//   2. simulate(): bot brains, actors move + fire, pickups, zone, effects
//   3. camera + viewmodel + HUD
//
// Hooks you will likely extend for new features:
//   applyDamage(), kill(), onShot(), onBlast(), onMelee(), onPickup(),
//   onZoneShrink(), playerEvents() (reads mover.events)
// =============================================================================
BR.Game = class Game {
  constructor(settings) {
    this.settings = settings;
    this.hud = new BR.HUD(document.getElementById('app'));
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });   // MSAA: smooth edges (cheap on mobile tile GPUs)
    this.renderer.autoClear = false;
    // Filmic grade: ACES tone mapping gives soft highlight roll-off, richer mid-tones and
    // more depth than the raw linear output
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    const C = BR.CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(this.baseFov(), 1, C.near, C.far);
    this.camera.rotation.order = 'YXZ';
    // Viewmodel (your gun + arms) lives in its own scene so it never clips into walls
    this.vmr = new BR.Viewmodel(this);
    this.buildShopScene();
    this.input = new BR.Input(document.getElementById('play'));
    this.state = 'menu';
    this.time = 0;
    this.actors = [];
    this.recentShots = [];
    for (let i = 1; i <= 6; i++) this['_v' + i] = new THREE.Vector3();
    this.cam = { off: 1.66, kick: 0, roll: 0, fov: this.baseFov(), bob: 0, swayX: 0, swayY: 0, vmKick: 0, flashT: 0,
      drawT: 0, drawDur: 0.35, inspectT: 0, inspectDur: 0, swingT: 0, shellT: 0, shake: 0, ads: 0, charmA: 0, charmV: 0, orbit: 0 };
    this.applyGraphics();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.resize();
    this.startDemo();
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0; this.fpsVal = 60;
    requestAnimationFrame(t => this.loop(t));
  }

  // Adaptive resolution: holds 60 fps. Dropped frames -> render a little smaller; smooth for a
  // while -> creep back up, but never past a level that already stuttered. The HUD stays sharp.
  adaptResolution(ms) {
    const P = this.perf; if (!P || (this.state !== 'playing' && this.state !== 'dead' && this.state !== 'won')) return;
    if (ms > 80) return;                                   // tab switch / hitch, not steady load
    if (ms > 17.6) P.slow += 1; else P.slow = Math.max(0, P.slow - 0.2);          // v1.25: aim for a solid 60 fps (16.7 ms)
    if (P.slow > 10 && P.scale <= 0.56 && this.fogFar > 140) {         // v1.25: still slow at the lowest resolution: it's draw calls, not pixels, so draw less far
      this.fogFar = Math.max(140, this.fogFar * 0.85); if (this.scene && this.scene.fog) this.scene.fog.far = this.fogFar; P.slow = 0; P.good = 0; P.shrunk = true;
    } else if (P.slow > 10 && P.scale > 0.55) {
      P.cap = Math.min(P.cap, P.scale - 0.01); P.scale = Math.max(0.55, P.scale * 0.88); P.slow = 0; P.good = 0; P.calm = 0;
      this.renderer.setPixelRatio(this.basePR * P.scale); this.resize();
    } else if (ms < 16.9) {
      P.good += ms / 1000; P.calm = (P.calm || 0) + ms / 1000;
      if (P.calm > 30 && P.cap < 1) { P.cap = Math.min(1, P.cap + 0.05); P.calm = 0; }   // a one-off hitch doesn't cap you forever
      if (P.shrunk && P.good > 12) { const g0 = (BR.CONFIG.graphics[this.settings.gfx] || BR.CONFIG.graphics.medium).fogFar; this.fogFar = Math.min(g0, this.fogFar * 1.08); if (this.scene && this.scene.fog) this.scene.fog.far = this.fogFar; if (this.fogFar >= g0) P.shrunk = false; P.good = 0; }
      if (P.good > 8 && P.scale < P.cap) { P.scale = Math.min(P.cap, P.scale * 1.06); P.good = 0; this.renderer.setPixelRatio(this.basePR * P.scale); this.resize(); }
    } else P.good = 0;
  }

  baseFov() { return this.settings.fov || BR.CONFIG.camera.fov; }

  applyGraphics() {
    const g = BR.CONFIG.graphics[this.settings.gfx] || BR.CONFIG.graphics.medium;
    this.basePR = Math.min(window.devicePixelRatio || 1, g.pixelRatio);
    this.perf = { scale: 1, cap: 1, slow: 0, good: 0 };
    this.renderer.setPixelRatio(this.basePR);
    this.fogFar = g.fogFar;
    this.detail = g.detail;
    if (this.scene && this.scene.fog) this.scene.fog.far = g.fogFar;
    this.resize();
    if (this.sun) this.applyShadows();
  }

  // Saturation: a CSS filter on the 3D canvas only (HUD stays untouched)
  applyColor() {
    // base grade: slightly desaturated with a touch more contrast (tactical-shooter look),
    // then the player's own saturation setting on top
    const sat = (this.settings.saturation ?? 1) * 0.88, c = this.renderer.domElement;
    const f = `saturate(${sat.toFixed(3)}) contrast(1.06)`;
    if (c.style.filter !== f) c.style.filter = f;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    // Stretched res: squeeze the camera's aspect so the picture is stretched wide
    // (like 4:3 stretched on a 16:9 screen). 0 = native, 1 = very stretched.
    const st = 1 + (this.settings.stretch || 0) * 0.6;
    if (this.camera) { this.camera.aspect = w / h / st; this.camera.updateProjectionMatrix(); }
    if (this.shopCam) { this.shopCam.aspect = w / h; this.shopCam.updateProjectionMatrix(); }
    if (this.vmr) this.vmr.resize(w / st, h);
    this.applyColor();
    this.vmScale = w < h ? 0.6 : 1;
  }

  // ------------------------------------------------------------ enemy highlight
  // Tints every other player's own materials so they read clearly in shade, foliage and clutter.
  // It's a colour tint only: walls still hide them (no seeing through geometry).
  applyHighlight() { for (const a of this.actors || []) this.highlightActor(a); }
  // tint one actor (bots, zombies as they spawn, bosses) by the Enemy highlight setting
  highlightActor(a) {
    if (!a || a.isPlayer || !a.mesh) return;
    const mate = this.player && a.team !== undefined && a.team === this.player.team;      // teammates: no red tint
    const mode = this.settings.highlight || 'off', k = mate ? 0 : (mode === 'bright' ? 0.5 : mode === 'subtle' ? 0.22 : 0) * (a.zombie ? 0.32 : 1);   // night map: zombies need far less tint
    const col = this._hlc || (this._hlc = new THREE.Color(0xff3b30));
    a.mesh.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      if (!o.userData.hlOwn) { const old = o.material; o.material = old.clone(); o.userData.hlOwn = true; o.userData.hlBase = o.material.emissive.clone(); if (a.mesh.userData.mat === old) a.mesh.userData.mat = o.material; }
      o.material.emissive.copy(o.userData.hlBase).lerp(col, k);
    });
  }

  // ------------------------------------------------------------ sun shadows (Graphics: High)
  // A soft shadow map that follows the camera (about 80 m across), so buildings, trees,
  // props and players ground themselves. Off on Low / Medium to keep phones at 60 fps.
  shadowsWanted() { return (this.settings.gfx || 'medium') === 'high'; }
  applyShadows() {
    this.applyHighlight();
    const on = this.shadowsWanted(), r = this.renderer, sun = this.sun;
    r.shadowMap.enabled = on; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = true;
    if (!sun || !this.scene) return;
    sun.castShadow = on;
    if (on) {
      const S = sun.shadow; S.mapSize.set(1024, 1024); S.bias = -0.0008; S.normalBias = 0.03;
      const c = S.camera; c.left = -42; c.right = 42; c.top = 42; c.bottom = -42; c.near = 1; c.far = 320; c.updateProjectionMatrix();
    }
    this.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const lit = m && (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial);
      o.receiveShadow = on && !!lit;
      o.castShadow = on && !!lit && !m.transparent;
    });
    this.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(mm => { mm.needsUpdate = true; }); } });
  }
  updateShadowCam() {
    if (!this.sun || !this.sun.castShadow) return;
    const p = this.camera.position, snap = 84 / 1024;                       // snap to texels: no shimmer while moving
    const tx = Math.round(p.x / snap) * snap, tz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx, 0, tz).addScaledVector(this.sunDir, 160);
  }

  // ------------------------------------------------------------ scene setup
  buildScene(seed, demo, opts) {
    if (this.zm) { this.zm.dispose(); this.zm = null; document.body.classList.remove('zombies'); }
    this.endMode();
    this.resurgence = null; document.body.classList.remove('resurgence');
    if (this.scene) this.disposeScene();
    document.body.classList.remove('menulite');
    const fogCol = 0xbfcfda;                                    // matches the sky dome's horizon band
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(fogCol);
    this.scene.fog = new THREE.Fog(fogCol, 70, this.fogFar || 230);
    // Lighting: cool sky / warm ground bounce, a warm key sun from the sky's sun direction,
    // and a faint cool fill from the other side so shaded faces aren't flat
    // v1.21 art direction: a touch more contrast (warmer, stronger key; darker bounce) so forms read clearly
    this.scene.add(new THREE.HemisphereLight(0xd2e2ff, 0x4f4636, 0.76));
    const sun = new THREE.DirectionalLight(0xffe9c8, 1.2);
    this.sunDir = new THREE.Vector3(420, 300, 300).normalize();
    sun.position.copy(this.sunDir);
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xa9c4ff, 0.22); fill.position.set(-0.5, 0.35, -0.6); this.scene.add(fill);
    this.muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 2); this.scene.add(this.muzzleLight);   // flashes on your shots
    this.sun = sun;
    this.world = new BR.World(seed, opts);
    this.world.buildMeshes(this.scene, this.detail);
    // sky, clouds and far mountains are already painted in display colours: keep them out of the filmic curve
    this.scene.traverse(o => { const m = o.material; if (m && m.isMeshBasicMaterial && m.fog === false) m.toneMapped = false; });
    this.hud.setStaticMap(this.world.renderMinimap(1024));
    this.fx = new BR.Effects(this.scene); this.fx.cam = this.camera;
    this.shock = new BR.Shockwave(this);
    this.loot = new BR.Loot(this);
    this.loot.spawnFromWorld(this.world);
    this.zone = new BR.Zone(this, this.world);
    this.playerChute = BR.Models.parachute(0xffb224, 0x1b1f27);
    this.playerChute.visible = false;
    this.scene.add(this.playerChute);
    this.actors = [];
    this.player = null;
    this.time = 0;
    this.recentShots = [];
    this.demo = demo ? { shotT: 0, subject: null, mode: 'fly', t: 0 } : null;
  }

  disposeScene() {
    this.scene.traverse(o => { if (o.geometry && !o.geometry._shared) o.geometry.dispose(); });
    this.scene = null;
  }

  spawn(a) {
    const H = this.world.half, C = BR.CONFIG;
    a.mover.pos.set((Math.random() * 2 - 1) * H * 0.85, C.match.dropHeight + Math.random() * 12, (Math.random() * 2 - 1) * H * 0.85);
    a.mover.dropping = true;          // everyone drops in with just their knife - loot up fast
  }

  addBots(n, diff) {
    const C = BR.CONFIG;
    const names = C.botNames.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const col = new THREE.Color().setHSL(Math.random(), 0.55, 0.55).getHex();
      const b = new BR.Actor(this, { id: i + 1, name: names[i % names.length] + (i >= names.length ? ' ' + (i + 1) : ''), color: col });
      this.spawn(b);
      b.brain = new BR.BotBrain(b, this, diff);
      this.scene.add(b.mesh);
      this.actors.push(b);
    }
  }

  // The menu background: a real bot match filmed by a cinematic camera.
  // v1.18: the main menu no longer runs a bot match behind it (lighter: no world, no AI, no 3D frames).
  // It frees the last match's scene and shows the animated purple CSS background instead.
  startDemo() {
    if (this.zm) { this.zm.dispose(); this.zm = null; document.body.classList.remove('zombies'); }
    this.endMode();
    this.resurgence = null; document.body.classList.remove('resurgence');
    if (this.scene) this.disposeScene();
    this.scene = null; this.world = null; this.actors.length = 0; this.demo = null;
    if (this.loot && this.loot.clear) try { this.loot.clear(); } catch (e) { /* nothing to clear */ }
    document.body.classList.add('menulite');
  }
  startDemoMatch() {
    this.buildScene(Math.floor(Math.random() * 1e9), true);
    this.diff = BR.CONFIG.difficulty.normal;
    this.practice = false;
    this.addBots(BR.CONFIG.match.demoBots, this.diff);
    // Big map: cluster the trailer's bots around two hot spots so there's action to film
    const pois = this.world.pois.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    this.actors.forEach((a, i) => {
      const p = pois[i % pois.length];
      a.mover.pos.set(p.x + (Math.random() - 0.5) * 70, 30 + Math.random() * 20, p.z + (Math.random() - 0.5) * 70);
      if (a.brain) a.brain.dropTarget = { x: p.x + (Math.random() - 0.5) * 30, z: p.z + (Math.random() - 0.5) * 30 };
    });
    this.camera.fov = 62; this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 90, 120); this.camera.lookAt(0, 0, 0);
    this.applyShadows();
  }

  // ------------------------------------------------------------------ match
  // opts.practice: no bots, no storm, spawn menu, respawn on death
  startMatch(opts) {
    this.endVictory(); this.freezeT = 0; this.hud.freeze(false);
    const S = this.settings, C = BR.CONFIG;
    this.duel = null; document.body.classList.remove('duel');
    const practiceMode = !!(opts && opts.practice), resMode = !!(opts && opts.resurgence), online = !!(opts && opts.online);
    if (this.brnet && !online) this.brnet.stop();
    const squad = practiceMode ? 1 : Math.max(1, Math.min(resMode && !online ? 3 : 4, (opts && opts.squad) | 0 || 1));     // (a party of 4 can play Resurgence as a squad)     // v1.19 solos / duos / trios / squads
    this.squad = 1; this.teams = 0; this._spec = null;
    this.zonePhases = resMode ? BR.RESURGENCE_PHASES : null;
    this.buildScene(Math.floor(Math.random() * 1e9), false, resMode ? { reef: true } : undefined);     // Resurgence: the Ironreef island
    if (resMode) { this.resurgence = { lastPhase: 3, queue: [], credit: 0, kills: 0, redeploys: 0 }; document.body.classList.add('resurgence'); }
    this.diff = C.difficulty[(opts && opts.diff) || S.difficulty] || C.difficulty.normal;
    this.result = null;
    this.player = new BR.Actor(this, { id: 0, name: 'You', isPlayer: true });
    this.spawn(this.player);
    this.player.yaw = Math.atan2(this.player.pos.x, this.player.pos.z); // face map center
    this.player.pitch = -0.75;                                           // look down at the landing area
    this.actors.push(this.player);
    let bots = practiceMode ? 0 : resMode ? 23 : Math.max(0, Math.min(C.match.maxBots, opts && opts.bots != null ? opts.bots : S.bots ?? C.match.defaultBots));
    if (squad > 1) bots = Math.ceil(Math.max(bots + 1, squad * 2) / squad) * squad - 1;     // full teams only
    this.practice = bots === 0;
    document.body.classList.toggle('practice', this.practice);
    if (practiceMode) {
      // Start on the ground at a movement hub (or any named place)
      const hub = this.world.pois.find(q => q.type === 'relay') || this.world.pois[0];
      this.player.mover.dropping = false;
      this.player.mover.pos.set(hub.x + 10, 0, hub.z + 10);
      this.player.mover.pos.y = this.world.groundAt(hub.x + 10, hub.z + 10, 60);
      this.player.pitch = 0;
      // v1.11: you start practice with your loadout
      const LO = BR.Profile.loadoutGuns(), pl = this.player;
      pl.slots[0] = BR.Weapons.create(LO.primary); pl.slots[1] = BR.Weapons.create(LO.secondary); pl.cur = 0;
      for (const t in pl.ammo) pl.ammo[t] = C.ammoCap[t];
    }
    this.addBots(bots, this.diff);
    if (squad > 1) BR.Squads.setup(this, squad);
    this.zone.mesh.visible = !this.practice;
    this.total = this.actors.length;
    this.swapItem = null;
    this.lastWeapon = null;
    this.lastPoi = null;
    this.hud.toggleMap(false);
    this.input.reset();
    this.state = 'playing';
    this.cam.off = C.actor.standHeight - C.actor.eyeFromTop;
    this.cam.fov = this.baseFov();
    this.hud.show('menu', false);
    this.hud.show('end', false);
    this.hud.show('pause', false);
    this.hud.show('play', true);
    this.hud.toast(this.practice ? 'Practice mode: tap SPAWN for guns, items and bots' : (squad > 1 ? BR.Squads.NAMES[squad] + ' · ' : '') + (resMode ? 'RESURGENCE · you redeploy until the 4th circle closes' : 'Freefall! Tap JUMP to open your parachute'), 2800);
    this.applyShadows();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }

  // ---- Resurgence: a faster battle royale where everyone redeploys (you after a countdown that
  // your kills shorten, bots after 10-14 s) until the 4th circle starts closing. Then it's one life,
  // last one standing wins. Returns true while it's handling the match (no normal win/loss yet).
  updateResurgence(dt) {
    const R = this.resurgence, p = this.player, on = this.zone.phase < R.lastPhase;
    if (p.kills > R.kills) { R.credit = Math.min(8, R.credit + (p.kills - R.kills) * 2); R.kills = p.kills; }
    // bots
    for (const a of this.actors) if (a !== p && !a.alive && !a._rq && !a.netProxy && !(this.brnet && !this.brnet.host)) { a._rq = true; if (on) R.queue.push({ a, t: 10 + Math.random() * 4 }); }     // (party BR: the host redeploys the bots; players redeploy themselves)
    for (let i = R.queue.length - 1; i >= 0; i--) { const q = R.queue[i]; q.t -= dt; if (q.t <= 0) { R.queue.splice(i, 1); if (on) this.redeployBot(q.a); } }
    if (!on && R.queue.length) R.queue.length = 0;
    // you
    if (!p.alive) {
      if (R.pT === undefined) { if (!on) { this.hud.resurgence(on, null); return false; } R.pT = Math.max(4, 14 - R.credit); R.credit = 0; BR.Audio.zRound && BR.Audio.zRound(false); }
      R.pT -= dt;
      this.hud.resurgence(on, Math.max(0, R.pT));
      if (R.pT <= 0) { R.pT = undefined; this.redeployPlayer(); }
      return true;
    }
    this.hud.resurgence(on, null);
    return on;                                                     // respawns on: nobody has won yet
  }
  dropPoint() {
    const Z = this.zone, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.max(10, Math.min(Z.nextR || Z.r, Z.r) * 0.75);
    const H = this.world.half - 10;
    return { x: BR.util.clamp(Z.x + Math.cos(a) * r, -H, H), z: BR.util.clamp(Z.z + Math.sin(a) * r, -H, H) };
  }
  redeployPlayer() {
    const p = this.player, C = BR.CONFIG, q = this.dropPoint();
    p.alive = true; p.health = C.actor.maxHealth; p.shield = 0; p.fireHeld = false;
    const LO = BR.Profile.loadoutGuns();                        // redeploy with your loadout's sidearm
    p.slots[0] = BR.Weapons.create(LO.secondary); p.slots[1] = null; p.cur = 0;
    p.ammo[C.weapons[LO.secondary].ammo] = Math.max(p.ammo[C.weapons[LO.secondary].ammo] || 0, C.weapons[LO.secondary].mag * 3);
    p.mover.pos.set(q.x, C.match.dropHeight * 0.55, q.z); p.mover.vel.set(0, 0, 0); p.mover.dropping = true; p.mover.chute = false;
    p.pitch = -0.6;
    this.result = null; this.resurgence.redeploys++;
    this.hud.toast('REDEPLOYED · grab loot fast', 1800); BR.Audio.chute && BR.Audio.chute();
  }
  redeployBot(old) {
    const C = BR.CONFIG, q = this.dropPoint();
    const b = new BR.Actor(this, { id: old.id, name: old.name, color: old.color || 0x8899aa });
    if (old.netId !== undefined) { b.netId = old.netId; b.owner = old.owner; b.local = old.local; }
    b.mover.pos.set(q.x, C.match.dropHeight * 0.55, q.z); b.mover.dropping = true;
    b.brain = new BR.BotBrain(b, this, this.diff); b.brain.dropTarget = { x: q.x, z: q.z };
    if (old.team !== undefined) { b.team = old.team; b.brain.mateOfPlayer = !!(old.brain && old.brain.mateOfPlayer); if (b.mesh && b.mesh.userData.mat) b.mesh.userData.mat.color.setHex(b.color); }     // v1.19 squads
    this.scene.add(b.mesh);
    const i = this.actors.indexOf(old); if (i >= 0) this.actors.splice(i, 1, b); else this.actors.push(b);
    if (old.mesh && old.mesh.parent) this.scene.remove(old.mesh);
  }

  // ---- 1v1 duel -------------------------------------------------------------
  // cfg: { diff: 'easy'|'normal'|'hard', target: rounds to win, roundTime: s, loadout: [gunA, gunB] }
  // Rounds: 3 s countdown -> fight until one dies or time runs out (more HP + shield wins,
  // equal is a draw) -> 2.6 s banner -> pick a new loadout -> next round. First to `target`.
  startDuel(cfg) {
    const C = BR.CONFIG; this.zonePhases = null;
    this.buildScene(Math.floor(Math.random() * 1e9), false, { arena: true });
    this.duel = { diff: cfg.diff, target: cfg.target, roundTime: cfg.roundTime, loadout: cfg.loadout.slice(),
      score: [0, 0], round: 0, phase: 'countdown', t: 0, damage: 0, kills: 0, time: 0, draws: 0 };
    this.diff = C.difficulty[cfg.diff] || C.difficulty.normal;
    this.practice = false;
    document.body.classList.remove('practice');
    document.body.classList.add('duel');
    this.zone.mesh.visible = false;
    this.result = null;
    this.hud.toggleMap(false);
    this.hud.show('menu', false); this.hud.show('end', false); this.hud.show('pause', false); this.hud.show('duelmenu', false);
    this.hud.show('play', true);
    this.startRound();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }

  // ---- Zombies: endless rounds on the Halloween graveyard (see zombies.js)
  startZombies() {
    const C = BR.CONFIG; this.zonePhases = null;
    this.endVictory(); this.freezeT = 0; this.hud.freeze(false);
    this.duel = null; document.body.classList.remove('duel', 'practice');
    this.buildScene(Math.floor(Math.random() * 1e9), false, { halloween: true });
    this.diff = C.difficulty.normal; this.practice = false; this.result = null;
    document.body.classList.add('zombies');
    this.zone.mesh.visible = false;
    this.zm = new BR.ZombieMode(this);
    this.zm.start();
    this.total = 1; this.swapItem = null; this.lastPoi = this.world.pois[0];
    this.hud.toggleMap(false);
    this.hud.show('menu', false); this.hud.show('end', false); this.hud.show('pause', false); this.hud.show('duelmenu', false);
    this.hud.show('play', true);
    this.input.reset();
    this.cam.off = C.actor.standHeight - C.actor.eyeFromTop; this.cam.fov = this.baseFov();
    this.state = 'playing'; this.last = performance.now();
    this.applyShadows();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }

  // ---- custom modes (aim trainer, Overdrive): a mode object owns the rules; the game runs the world.
  // Mode API: start(), update(dt), dispose(), optional rayTargets(o, d, maxT) -> {t, target, head},
  // hitTarget(target, dmg, head, at, w), onKill(victim, killer, weaponId, head), cls (body class)
  startMode(ModeClass, worldOpts) {
    const C = BR.CONFIG; this.zonePhases = null;
    this.endVictory(); this.freezeT = 0; this.hud.freeze(false);
    this.duel = null; document.body.classList.remove('duel', 'practice', 'zombies');
    this.buildScene(Math.floor(Math.random() * 1e9), false, worldOpts);
    this.diff = C.difficulty.normal; this.practice = false; this.result = null;
    this.zone.mesh.visible = false;
    this.player = new BR.Actor(this, { id: 0, name: 'You', isPlayer: true });
    this.player.mover.dropping = false;
    this.actors.push(this.player);
    this.mode = new ModeClass(this);
    if (this.mode.cls) document.body.classList.add(this.mode.cls);
    this.mode.start();
    this.total = 1; this.swapItem = null; this.lastPoi = this.world.pois[0];
    this.hud.toggleMap(false);
    this.hud.show('menu', false); this.hud.show('end', false); this.hud.show('pause', false); this.hud.show('duelmenu', false);
    this.hud.show('play', true);
    this.input.reset();
    this.cam.off = C.actor.standHeight - C.actor.eyeFromTop; this.cam.fov = this.baseFov();
    this.state = 'playing'; this.last = performance.now();
    this.applyShadows();
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }
  endMode() { if (this.mode) { const m = this.mode; this.mode = null; if (m.cls) document.body.classList.remove(m.cls); m.dispose(); } }

  // Fresh actors every round: full health + 50 shield, the chosen guns, full ammo, no cooldowns.
  startRound() {
    const D = this.duel, C = BR.CONFIG, W = this.world;
    D.round++;
    for (const a of this.actors) if (a.mesh && a.mesh.parent) this.scene.remove(a.mesh);
    this.loot.clear();
    this.shock.clear();
    this.actors = [];
    const arm = (a, guns, sp) => {
      a.mover.dropping = false; a.mover.vel.set(0, 0, 0);
      a.mover.pos.set(sp.x, 0, sp.z);
      a.yaw = sp.yaw; a.pitch = 0;
      a.slots = [BR.Weapons.create(guns[0]), BR.Weapons.create(guns[1]), BR.Weapons.create(a.isPlayer ? BR.Profile.melee() : 'bayonet')];
      a.cur = 0;
      for (const t in a.ammo) a.ammo[t] = C.ammoCap[t];
      a.health = C.actor.maxHealth; a.shield = 50;
      a.nades = 2;
    };
    // which end you start at alternates each round
    const flip = D.round % 2 === 0, sp = W.spawns;
    const p = this.player = new BR.Actor(this, { id: 0, name: 'You', isPlayer: true });
    arm(p, D.loadout, flip ? sp[1] : sp[0]);
    this.actors.push(p);
    const pool = [['rifle', 'shotgun'], ['holoar', 'smg'], ['sniper', 'smg'], ['hunter', 'shotgun'], ['smg', 'shotgun'], ['rifle', 'pistol'], ['holoar', 'shotgun'], ['sniper', 'pistol']];
    const bl = pool[Math.floor(Math.random() * pool.length)];
    const b = this.duelBot = new BR.Actor(this, { id: 1, name: (D.diff === 'hard' ? 'Viper' : D.diff === 'easy' ? 'Rookie' : 'Duelist') + ' (' + D.diff.toUpperCase() + ')', color: 0xd8443a });
    arm(b, bl, flip ? sp[0] : sp[1]);
    b.brain = new BR.BotBrain(b, this, this.diff);
    b.brain.landedT = 99;
    b.brain.target = p;
    this.scene.add(b.mesh);
    this.actors.push(b);
    D.botLoadout = bl;
    this.total = 2;
    this.swapItem = null; this.lastWeapon = null; this.lastPoi = W.pois[0];
    this.input.reset();
    this.cam.off = C.actor.standHeight - C.actor.eyeFromTop;
    this.cam.fov = this.baseFov();
    D.phase = 'countdown'; D.t = 3; D.lastN = 0;
    this.state = 'playing';
    this.last = performance.now();
    this.hud.duelBanner(`ROUND ${D.round}`, `${BR.CONFIG.weapons[bl[0]].name} + ${BR.CONFIG.weapons[bl[1]].name} on the other side`, 'info');
    this.applyShadows();
  }

  updateDuel(dt) {
    const D = this.duel, p = this.player, b = this.duelBot;
    if (this.state !== 'playing') return;
    D.t -= dt;
    if (D.phase === 'countdown') {
      const n = Math.ceil(D.t);
      if (n !== D.lastN && n > 0) { D.lastN = n; this.hud.duelCount(String(n)); BR.Audio.click(); }
      if (D.t <= 0) { D.phase = 'fight'; D.t = D.roundTime; this.hud.duelCount('FIGHT!'); BR.Audio.pad(); }
    } else if (D.phase === 'fight') {
      D.time += dt;
      let w = null;
      if (!p.alive && !b.alive) w = 'draw';
      else if (!p.alive) w = 'bot';
      else if (!b.alive) w = 'you';
      else if (D.t <= 0) { const hp = p.health + p.shield, hb = b.health + b.shield; w = hp > hb + 0.5 ? 'you' : hb > hp + 0.5 ? 'bot' : 'draw'; }
      if (w) this.endRound(w, D.t <= 0);
    } else if (D.phase === 'roundEnd') {
      if (D.t <= 0) {
        if (D.score[0] >= D.target || D.score[1] >= D.target) this.endDuel();
        else this.openDuelLoadout();
      }
    }
  }

  endRound(w, timeout) {
    const D = this.duel, p = this.player;
    D.phase = 'roundEnd'; D.t = 2.6;
    D.damage += p.damageDealt; D.kills += p.kills;
    if (w === 'you') D.score[0]++; else if (w === 'bot') D.score[1]++; else D.draws++;
    const sc = `${D.score[0]} – ${D.score[1]}`;
    if (w === 'you') { this.hud.duelBanner('ROUND WON', (timeout ? 'Time! More health left · ' : '') + sc, 'win'); BR.Audio.coin(); }
    else if (w === 'bot') this.hud.duelBanner('ROUND LOST', (timeout ? 'Time! They had more health · ' : '') + sc, 'lose');
    else this.hud.duelBanner('DRAW', sc, 'info');
  }

  openDuelLoadout() {
    this.state = 'loadout';
    this.input.reset(); this.input.unlock();
    this.fx.rope(null);
    this.hud.prompt(null);
    BR.openDuelMenu && BR.openDuelMenu('round');
  }

  endDuel() {
    const D = this.duel, win = D.score[0] > D.score[1];
    this.state = 'end';
    this.input.unlock();
    this.hud.prompt(null);
    this.fx.rope(null);
    this.result = { duel: true, win, place: win ? 1 : 2, total: 2, score: D.score.slice(), diff: D.diff, kills: D.kills, damage: D.damage, time: D.time,
      by: `vs ${D.diff.toUpperCase()} bot · first to ${D.target}` };
    this.result.coins = BR.Profile.award(this.result);
    this.lastDuel = { diff: D.diff, target: D.target, roundTime: D.roundTime, loadout: D.loadout.slice() };
    this.hud.showEnd(this.result);
    BR.updateCoins();
  }

  // ---- practice spawn menu ---------------------------------------------------
  // A point `dist` meters in front of the player, on the ground.
  frontPoint(dist) {
    const p = this.player, x = p.pos.x - Math.sin(p.yaw) * dist, z = p.pos.z - Math.cos(p.yaw) * dist;
    const H = this.world.half - 4, cx = BR.util.clamp(x, -H, H), cz = BR.util.clamp(z, -H, H);
    return { x: cx, y: this.world.groundAt(cx, cz, p.pos.y + 6), z: cz };
  }

  practiceSpawn(kind, arg, toSlot, rar) {
    const p = this.player, C = BR.CONFIG;
    if (kind === 'weapon') {
      const def = C.weapons[arg];
      const slot = toSlot === 0 || toSlot === 1 ? toSlot : p.cur < 2 ? p.cur : (!p.slots[0] ? 0 : !p.slots[1] ? 1 : 0);
      p.slots[slot] = BR.Weapons.create(arg, undefined, rar | 0);
      p.cur = slot;
      p.ammo[def.ammo] = C.ammoCap[def.ammo];
      this.hud.toast(BR.RARITY[rar | 0].name + ' ' + def.name, 900);
    } else if (kind === 'dropweapon') {                     // v1.23 spawn menu: the gun lands on the ground in front of you; walk over it to grab it
      const def = C.weapons[arg], q = this.frontPoint(2.2), a = p.yaw;
      this.loot.add({ kind: 'weapon', wid: arg, rar: rar | 0, mag: def.mag, reserve: C.ammoCap[def.ammo] }, q.x, q.y + 1.2, q.z, new THREE.Vector3(-Math.sin(a) * 1.2, 3.2, -Math.cos(a) * 1.2));
      this.hud.toast(BR.RARITY[rar | 0].name + ' ' + def.name + ' dropped · walk over it to pick it up', 1300);
    } else if (kind === 'ammo') { for (const t in p.ammo) p.ammo[t] = C.ammoCap[t]; this.hud.toast('Ammo full', 900); }
    else if (kind === 'nades') { p.nades = C.shockwave.maxCarry; this.hud.toast('Shockwave grenades ×' + p.nades, 900); }
    else if (kind === 'heal') { p.health = C.actor.maxHealth; p.shield = C.actor.maxShield; this.hud.toast('Health + shield full', 900); }
    else if (kind === 'item') { const q = this.frontPoint(3); this.loot.spawnKind(arg, q.x, q.y, q.z, Math.random); }
    else if (kind === 'chest') { const q = this.frontPoint(4); this.loot.add({ kind: 'chest', tier: 2 }, q.x, q.y, q.z); }
    else if (kind === 'bot') {
      const q = this.frontPoint(arg === 'combat' ? 18 : 10);
      const n = this.actors.length, col = new THREE.Color().setHSL(Math.random(), 0.55, 0.55).getHex();
      const label = arg === 'combat' ? 'Combat bot' : arg === 'moving' ? 'Moving dummy' : 'Dummy';
      const b = new BR.Actor(this, { id: n, name: label + ' ' + n, color: col });
      b.mover.pos.set(q.x + (Math.random() - 0.5) * 3, q.y, q.z + (Math.random() - 0.5) * 3);
      b.giveWeapon(arg === 'combat' ? 'rifle' : 'pistol');
      b.ammo.heavy = b.ammo.light = 200;
      b.yaw = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      b.brain = new BR.BotBrain(b, this, this.diff);
      b.brain.state = 'roam';
      b.brain.passive = arg !== 'combat';
      b.brain.still = arg === 'dummy';
      b.brain.landedT = 99;
      this.scene.add(b.mesh);
      this.actors.push(b);
      this.total = this.actors.length;
    } else if (kind === 'clearbots') {
      for (const a of this.actors) if (a !== p && a.mesh) this.scene.remove(a.mesh);
      this.actors = [p];
    } else if (kind === 'skydive') {
      p.mover.pos.y = C.match.dropHeight; p.mover.vel.set(0, 0, 0);
      p.mover.dropping = true; p.mover.chute = false; p.pitch = -0.6;
    } else if (kind === 'teleport') {
      const q = this.world.pois[Math.floor(Math.random() * this.world.pois.length)];
      p.mover.pos.set(q.x + 6, this.world.groundAt(q.x + 6, q.z + 6, 60), q.z + 6); p.mover.vel.set(0, 0, 0);
      this.hud.toast(q.name, 1200);
    }
  }

  openSpawnMenu() {
    if (this.state === 'playing' && this.mode && this.mode.menu) { this.mode.menu(); return; }     // aim trainer / Overdrive menus
    if (this.state !== 'playing' || !this.practice) return;
    this.state = 'paused';
    this.input.reset();
    this.input.unlock();
    this.hud.show('spawnmenu', true);
    if (BR.renderSpawnSlots) BR.renderSpawnSlots(true);
  }
  closeSpawnMenu() {
    this.hud.show('spawnmenu', false);
    if (this.state === 'paused') { this.state = 'playing'; this.input.reset(); this.last = performance.now(); }
  }

  aliveCount() { let n = 0; for (const a of this.actors) if (a.alive) n++; return n; }

  online() { return !!(this.brnet || (this.mode && this.mode.net)); }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.input.unlock();
    this.hud.show('pause', true);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.reset();
    this.last = performance.now();
    this.hud.show('pause', false);
  }
  toMenu() {
    this.state = 'menu';
    if (this.brnet) this.brnet.stop();
    if (this.zm) { this.zm.dispose(); this.zm = null; document.body.classList.remove('zombies'); }
    this.endMode(); this.resurgence = null; document.body.classList.remove('resurgence', 'practice');
    if (this.duel) { this.duel = null; document.body.classList.remove('duel'); this.hud.show('duelmenu', false); }
    this.input.unlock();
    this.hud.show('pause', false);
    this.hud.show('end', false);
    this.hud.show('play', false);
    this.hud.show('menu', true);
    this.startDemo();
    BR.updateCoins();
  }

  // ------------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    this.adaptResolution(dt * 1000);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fpsVal = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    dt = Math.min(dt, 0.05);
    // hit-stop: a split second of slow motion when you get a kill
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.3; }
    // victory: starts in slow motion and eases back to full speed
    if (this.victory) { this.victory.rt += dt; const k = Math.min(1, this.victory.rt / 1.8); dt *= 0.25 + 0.75 * k * k; }
    // v1.20: one bad frame (a script error) must never freeze the game: report it once, keep running
    try {
      if (this.state === 'playing' || this.state === 'dead' || this.state === 'won' || (this.state === 'paused' && this.online())) this.update(dt);     // v1.24: an online match never stops for your pause menu
      else if (this.state === 'menu') { if (this.scene) this.updateDemo(dt); }
      else if (this.state === 'shop') this.updateShop(dt);
    } catch (e) { const k = String(e && e.message); this._errs = this._errs || {}; if (!this._errs[k]) { this._errs[k] = 1; console.error(e); } }
    this.render();
  }

  // Everything that happens in the world, with or without a player.
  simulate(dt) {
    this.time += dt;
    const frozen = (this.duel && this.duel.phase === 'countdown') || !!(this.mode && this.mode.frozen);
    for (const a of this.actors) if (a.brain && a.alive && !frozen) a.brain.update(dt);
    for (const a of this.actors) a.update(dt);
    for (const a of this.actors) {
      if (!a.alive || a.mover.dropping || a.zombie || a.downed || a.netProxy) continue;
      a.pickupT -= dt;
      if (a.pickupT <= 0) {
        a.pickupT = 0.12;
        const s = this.loot.autoPickup(a);
        if (a === this.player) this.swapItem = s;
      }
    }
    if (!this.practice && !this.duel && !this.zm && !this.mode) {
      this.zone.update(dt);
      const dps = this.zone.dps;
      for (const a of this.actors) {
        if (!a.alive || !this.zone.outside(a.pos)) continue;
        if (a.takeDamage(dps * dt, true)) { if (!BR.Squads.tryDown(this, a, null, 'storm')) this.kill(a, a.knocker && a.knocker.alive ? a.knocker : null, 'storm'); }
        else if (a === this.player) {
          this.zoneHurtT = (this.zoneHurtT || 0) - dt;
          if (this.zoneHurtT <= 0) { this.zoneHurtT = 1; BR.Audio.hurt(); }
        }
      }
    }
    const cp = this.camera.position;
    for (const a of this.actors) {
      if (!a.alive && a.mesh && a.mesh.parent && this.time - a.deathT > 4) this.scene.remove(a.mesh);
      else if (a.mesh && a.alive) a.mesh.visible = Math.abs(a.pos.x - cp.x) + Math.abs(a.pos.z - cp.z) < 260;
    }
    if (this.squad > 1) BR.Squads.update(this, dt);
    while (this.recentShots.length && this.time - this.recentShots[0].t > 2) this.recentShots.shift();
    if (this.brnet) this.brnet.update(dt);
    this.loot.update(dt, cp);
    this.fx.update(dt);
    if (this.shock) this.shock.update(dt);
  }

  update(dt) {
    const p = this.player;
    // last-kill freeze frame: the whole world holds still (desaturated, zoomed, flash) before the victory show
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      if (this.freezeT <= 0) { this.freezeT = 0; this.hud.freeze(false); this.startVictory(); }
      return;
    }
    if (this.zm && this.zm.cut) { this.zm.updateCut(dt); return; }      // zombies boss intro cutscene
    if (BR.AntiCheat) BR.AntiCheat.tick(this, dt);
    if (p.alive && this.state === 'playing') this.controlPlayer(dt);
    else {
      p.fireHeld = false;
      if (this.state === 'won' || this.freezeT > 0) { const I = p.input; I.mx = I.mz = 0; I.jump = I.crouch = false; }     // v1.27: the stick no longer walks you during the victory
      // v1.23: the menu (and map) still work while you're dead / waiting to respawn
      if (this.state === 'playing') { if (this.input.consume('pause')) this.pause(); if (this.input.consume('map')) this.hud.toggleMap(); }
    }
    this.simulate(dt);
    this.playerEvents();

    this.reviveTgt = BR.Squads.reviveTarget(this);
    this.chest = p.alive && !p.downed && !p.mover.dropping ? this.loot.nearestChest(p, 2.2) : null;
    if (this.reviveTgt) { const t = this.reviveTgt; this.hud.prompt(t.reviver === p ? `Reviving ${t.name}… ${Math.round(t.reviveP / BR.Squads.REVIVE_T * 100)}%` : t.reviver ? `${t.reviver.name} is reviving ${t.name}` : `Revive ${t.name}`, '#5fb4ff'); }
    else if (this.chest) this.hud.prompt('Open chest');
    else if (p.alive && this.swapItem && !this.swapItem.taken) this.hud.prompt('Swap for ' + BR.RARITY[this.swapItem.rar | 0].name + ' ' + BR.CONFIG.weapons[this.swapItem.wid].name, BR.RARITY[this.swapItem.rar | 0].css);
    else if (!this.zm && !(this.mode && this.mode.prompts)) this.hud.prompt(null);

    // Player parachute (look up to see it)
    const pc = this.playerChute;
    pc.visible = p.alive && p.mover.dropping && p.mover.chute;
    if (pc.visible) { pc.position.set(p.pos.x, p.pos.y + 1.5, p.pos.z); pc.rotation.y = p.yaw; pc.rotation.z = Math.sin(this.time * 1.5) * 0.05; }

    // Grapple rope
    if (p.mover.grapple) {
      // rope leaves the wrist launcher and shoots out to the hook over ~0.12 s
      this.ropeT = (this.ropeT ?? 1) + dt;
      const from = this.vmr.ropeValid ? this.vmr.ropeFrom : this.muzzlePoint(p, this._v4), G = p.mover.grapple;
      const e = Math.min(1, this.ropeT / 0.12), end = this._ropeEnd || (this._ropeEnd = new THREE.Vector3());
      end.set(from.x + (G.x - from.x) * e, from.y + (G.y - from.y) * e, from.z + (G.z - from.z) * e);
      this.fx.rope(from, end);
    }
    else this.fx.rope(null);

    // Location banner when entering a named place
    const poi = this.world.poiAt(p.pos.x, p.pos.z);
    if (poi && poi !== this.lastPoi && !p.mover.dropping) this.hud.location(poi.name);
    if (!p.mover.dropping) this.lastPoi = poi;

    this.updateCamera(dt);
    this.hud.update(this, dt);
    this.hud.fps(this.fpsVal, this.settings.showFps);
    this.hud.speed(p.alive && !p.mover.dropping ? p.mover.speedH : 0, this.settings.showSpeed !== false && p.alive && !(p.ads && p.weapon && (p.weapon.def.scope || p.weapon.def.optic)));

    // Match end
    if (this.duel) this.updateDuel(dt);
    else if (this.zm && this.state === 'playing') this.zm.update(dt);
    else if (this.mode && this.state === 'playing') this.mode.update(dt);
    else if (this.resurgence && this.state === 'playing' && this.updateResurgence(dt)) { /* respawning */ }
    else if (this.state === 'playing') {
      if (!p.alive && this.practice) {
        // Practice: respawn where you fell after a moment
        this.respawnT = (this.respawnT ?? 2) - dt;
        if (this.respawnT <= 0) {
          this.respawnT = undefined;
          p.alive = true; p.health = BR.CONFIG.actor.maxHealth; p.shield = 0;
          this.result = null;
          this.hud.toast('Respawned', 900);
        }
      } else if (this.squad > 1 && BR.Squads.teamsAlive(this) <= 1 && BR.Squads.teamAlive(this, p.team) && !p.alive) {
        // v1.19: you were out, but your team won it
        this.state = 'won'; this.endT = 3.2;
        this.result = { win: true, place: 1, total: this.total, kills: p.kills, assists: p.assists || 0, damage: p.damageDealt, time: this.time, squad: this.squad, teams: this.teams };
        this.hud.toast('YOUR TEAM WON', 2400); BR.Audio.victory && BR.Audio.victory();
      } else if (!p.alive && this.squad > 1 && BR.Squads.teamAlive(this, p.team)) { /* spectating your team */ }
      else if (!p.alive) { this.state = 'dead'; this.endT = BR.CONFIG.match.endDelay;
        if (this.squad > 1 && this.result) { this.result.place = BR.Squads.teamsAlive(this) + 1; this.result.squad = this.squad; this.result.teams = this.teams; } }
      else if (!this.practice && (this.squad > 1 ? BR.Squads.teamsAlive(this) === 1 : this.aliveCount() === 1)) {
        this.state = 'won'; this.endT = 5.4;
        this.result = { win: true, place: 1, total: this.total, kills: p.kills, assists: p.assists || 0, damage: p.damageDealt, time: this.time, squad: this.squad, teams: this.teams };
        if (p.downed) { p.downed = false; p.reviver = null; p.mover.prone = false; p.health = Math.max(p.health, 1); }
        // freeze frame first (like the big shooters), then the victory show
        this.freezeT = 1.0; p.fireHeld = false; p.input.mx = p.input.mz = 0; p.mover.vel.set(0, 0, 0); this.hud.freeze(true); BR.Audio.freeze && BR.Audio.freeze();
      }
    } else if (this.state === 'dead' || this.state === 'won') {
      this.endT -= dt;
      if (this.victory) this.updateVictory(dt);
      if (this.endT <= 0) {
        this.endVictory();
        this.state = 'end';
        this.input.unlock();
        this.hud.prompt(null);
        this.fx.rope(null);
        if (!this.practice) this.result.coins = BR.Profile.award(this.result);
        this.hud.showEnd(this.result);
        BR.updateCoins();
      }
    }
  }

  // ---- Victory: slow motion, the camera pulls out to orbit your character celebrating (arms up,
  // fist pumps, a jump and a spin) inside a golden light pillar, fireworks and confetti all around,
  // a fanfare, and the VICTORY overlay with your stats counting up. Then the results screen.
  startVictory() {
    const p = this.player;
    this.victory = { t: 0, rt: 0, nextFw: 0.35, nextConf: 0.1, yaw0: p.yaw, fw: 0 };
    const I = p.input; I.mx = I.mz = 0; I.jump = I.crouch = false; p.mover.vel.set(0, 0, 0); p.mover.sliding = false; p.ads = false;     // v1.27: no more walking mid-celebration
    if (!p.mesh) { p.mesh = p.buildMesh(); this.scene.add(p.mesh); p.syncMesh(0.016); }
    p.mesh.visible = true; p.fireHeld = false;
    this.fx.victory && this.fx.victory(p.pos.clone());
    this.hud.victory(this.result);
    BR.Audio.victory && BR.Audio.victory();
    this.input.unlock && this.input.unlock();
  }
  updateVictory(dt) {
    const v = this.victory, p = this.player; v.t += dt;
    if (!p.mesh) return;
    // v1.27 dance, five beats: a burst jump with arms flung up, alternating fist pumps on the beat, a spin with
    // arms out, a side-step shuffle, then a hero pose pointing at the sky. Poses blend smoothly into each other.
    const u = p.mesh.userData, t = v.t, U = BR.util, S = x => x * x * (3 - 2 * x);
    const m = p.mover; m.vel.set(0, 0, 0);                                      // stand still for the whole show
    const beat = t * 2.6 * Math.PI, bb = Math.sin(beat), bounce = Math.abs(Math.sin(beat));
    const poses = [
      // [start, pose fn] - each returns { R, L (hand targets in the upper body's space), hl, kl, hr, kr, hz, y, yaw, lean, roll, head }
      [0, () => { const k = U.clamp(t / 0.25, 0, 1), air = t > 0.25 && t < 0.8 ? Math.sin((t - 0.25) / 0.55 * Math.PI) : 0;
        return { R: [0.42, 1.1, 0.05], L: [-0.42, 1.1, 0.05], hl: -0.4 * (1 - k) - air * 0.5, kl: 0.9 * (1 - k) + air * 0.9, hr: -0.4 * (1 - k) - air * 0.3, kr: 0.9 * (1 - k) + air * 0.6,
          hz: 0.1, y: -0.22 * (1 - k) + air * 0.6, yaw: 0, lean: -0.15 * air, roll: 0, head: -0.45 }; }],
      [0.9, () => { const up = bb > 0;
        return { R: up ? [0.22, 1.18, -0.05] : [0.1, 0.42, -0.24], L: up ? [-0.1, 0.42, -0.24] : [-0.22, 1.18, -0.05], hl: -0.15 * bounce, kl: 0.35 * bounce, hr: -0.15 * bounce, kr: 0.35 * bounce,
          hz: 0.08, y: -0.07 * bounce, yaw: bb * 0.18, lean: 0.06 * bounce, roll: bb * 0.08, head: -0.2 - 0.15 * bounce }; }],
      [2.3, () => { const k = S(U.clamp((t - 2.3) / 0.8, 0, 1));
        return { R: [0.8, 0.62, 0], L: [-0.8, 0.62, 0], hl: -0.1, kl: 0.25, hr: -0.1, kr: 0.25, hz: 0.12, y: -0.06, yaw: Math.PI * 2 * k, lean: -0.05, roll: 0, head: -0.25 }; }],
      [3.15, () => { const s1 = Math.sin(beat * 0.5), side = s1 > 0 ? 1 : -1, kick = Math.abs(s1);
        return { R: [0.0 + s1 * 0.25, 0.32, -0.38], L: [-0.0 + s1 * 0.25, 0.3, -0.36], hl: side < 0 ? -0.55 * kick : 0.05, kl: side < 0 ? 0.25 : 0.4 * kick, hr: side > 0 ? -0.55 * kick : 0.05, kr: side > 0 ? 0.25 : 0.4 * kick,
          hz: 0.1 + kick * 0.25, y: -0.05 * bounce, yaw: s1 * 0.45, lean: 0.08, roll: -s1 * 0.12, head: -0.1 }; }],
      [4.4, () => { const br = Math.sin(t * 2.2) * 0.015;
        return { R: [0.34, 1.22, -0.32], L: [-0.24, 0.02, -0.04], hl: 0.0, kl: 0.05, hr: -0.12, kr: 0.12, hz: 0.18, y: br, yaw: -0.25, lean: -0.12, roll: 0.05, head: -0.55 }; }],
    ];
    let i = 0; while (i < poses.length - 1 && t >= poses[i + 1][0]) i++;
    const A = poses[i][1](), nx = poses[i + 1], w = nx ? S(U.clamp((t - (nx[0] - 0.18)) / 0.18, 0, 1)) : 0;
    const B = w > 0 ? nx[1]() : A, L = (a, b) => a + (b - a) * w, L3 = (a, b) => [L(a[0], b[0]), L(a[1], b[1]), L(a[2], b[2])];
    const P = { R: L3(A.R, B.R), L: L3(A.L, B.L) }; for (const k of ['hl', 'kl', 'hr', 'kr', 'hz', 'y', 'yaw', 'lean', 'roll', 'head']) P[k] = L(A[k], B[k]);
    if (i === 2 && w > 0) P.yaw = A.yaw + (B.yaw + Math.PI * 2 - A.yaw) * w;      // finish the spin forward, not back
    const keep = this._vp || (this._vp = new THREE.Vector3()), keep2 = this._vp2 || (this._vp2 = new THREE.Vector3());
    if (u.AR && u.AL && BR.solveArm) { BR.solveArm(u.AR, keep.set(P.R[0], P.R[1], P.R[2]), 1); BR.solveArm(u.AL, keep2.set(P.L[0], P.L[1], P.L[2]), -1); }
    u.L.hip.rotation.x = P.hl; u.L.knee.rotation.x = P.kl; u.R.hip.rotation.x = P.hr; u.R.knee.rotation.x = P.kr;
    u.L.hip.rotation.z = -P.hz; u.R.hip.rotation.z = P.hz;
    u.body.position.y = P.y; u.body.rotation.set(0, 0, P.roll); u.body.position.x = 0; u.body.position.z = 0;
    u.upper.rotation.set(P.lean, -P.yaw * 0.35, -P.roll * 0.6);
    p.mesh.position.set(m.pos.x, m.pos.y, m.pos.z);
    p.mesh.rotation.y = (v.yaw0 !== undefined ? v.yaw0 : p.yaw) + P.yaw;
    if (u.head) u.head.rotation.set(P.head, P.yaw * 0.2, 0);
    if (u.gun) u.gun.visible = false;
    // fireworks + confetti
    const at = this._vfw || (this._vfw = new THREE.Vector3());
    if (t > v.nextFw && t < 4.6) {
      v.nextFw = t + 0.26 + Math.random() * 0.22; v.fw++;
      // behind the character as seen from the orbiting camera, so they burst in frame
      const cam = this.camera.position, bx = p.pos.x - cam.x, bz = p.pos.z - cam.z, bl = Math.hypot(bx, bz) || 1;
      const a = Math.atan2(bz, bx) + (Math.random() - 0.5) * 1.6, r = 5 + Math.random() * 6;
      at.set(p.pos.x + Math.cos(a) * r, p.pos.y + 3.5 + Math.random() * 4.5, p.pos.z + Math.sin(a) * r);
      this.fx.firework && this.fx.firework(at);
      BR.Audio.pop && BR.Audio.pop(Math.max(0.15, 0.45 - v.fw * 0.01));
    }
    if (t > v.nextConf && t < 4.2) {
      v.nextConf = t + 0.12;
      at.set(p.pos.x + (Math.random() - 0.5) * 5, p.pos.y + 4.5 + Math.random() * 1.5, p.pos.z + (Math.random() - 0.5) * 5);
      this.fx.confetti && this.fx.confetti(at);
    }
  }
  endVictory() {
    if (!this.victory) return;
    this.victory = null;
    this.hud.victory(null);
    if (this.fx && this.fx.victoryEnd) this.fx.victoryEnd();
    if (this.camera) { this.camera.fov = this.baseFov ? this.baseFov() : this.camera.fov; this.camera.updateProjectionMatrix(); }
  }

  controlPlayer(dt) {
    const p = this.player, inp = this.input, S = this.settings, L = BR.CONFIG.look;
    let [dx, dy] = inp.consumeLook();
    // Optional aim smoothing: a light 1-pole filter on look input (0 = raw)
    const sm = S.aimSmooth || 0;
    if (sm > 0) {
      const f = this.lookF || (this.lookF = [0, 0]);
      const keep = Math.exp(-dt / (0.006 + sm * 0.05));   // up to ~56ms time constant
      const ix = dx * (1 - keep) / Math.max(dt, 1e-3), iy = dy * (1 - keep) / Math.max(dt, 1e-3);
      f[0] = f[0] * keep + ix; f[1] = f[1] * keep + iy;    // per-second filtered velocity
      dx = f[0] * dt; dy = f[1] * dt;
    }
    this.lookD = [dx, dy];
    const w = p.weapon;
    const zoom = p.ads && w ? w.def.zoom : 1;
    const scoped = p.ads && w && (w.def.scope || w.def.optic);
    let sens = L.touch * S.sens * (p.ads ? L.adsMult * (scoped ? (S.sensScope ?? 1) : (S.sensAds ?? 1)) : 1) / Math.sqrt(zoom);
    const touch = inp.usingTouch;
    inp.fireLookMult = S.sensFire ?? 1;
    // response curve: slow drags finer, fast flicks further (0 = linear)
    const curve = touch ? (S.sensCurve || 0) : 0;
    if (curve > 0 && (dx || dy)) { const v = Math.hypot(dx, dy) / Math.max(dt, 1e-3); sens *= BR.util.clamp(Math.pow(v / 700, curve * 0.6), 0.5, 1.9); }
    const target = touch && S.assist ? this.findAssistTarget() : null;
    if (target) sens *= 1 - L.aimAssist * 0.6;
    p.yaw -= dx * sens * (S.sensX ?? 1);
    p.pitch = BR.util.clamp(p.pitch - dy * sens * (S.sensY ?? 1), -1.45, 1.45);
    // gyro aim (always, or only while aiming down sights)
    if (inp.gyroOn) {
      const [gy, gp] = inp.consumeGyro();
      if (S.gyro === 'always' || (S.gyro === 'ads' && p.ads)) {
        const gk = (S.gyroSens ?? 1) * (p.ads ? 0.8 / Math.sqrt(zoom) : 1);
        p.yaw += gy * gk * (S.gyroInvX ? -1 : 1);
        p.pitch = BR.util.clamp(p.pitch + gp * gk * (S.gyroInvY ? -1 : 1), -1.45, 1.45);
      }
    }
    // Duel countdown: look around, but no moving or shooting yet
    if ((this.duel && this.duel.phase !== 'fight') || (this.mode && this.mode.frozen)) { p.input.mx = p.input.mz = 0; p.fireHeld = false; for (const k of ['jump', 'crouch', 'grenade', 'grapple', 'stim']) inp.consume(k); return; }

    p.input.mx = inp.moveX;
    p.input.mz = inp.moveY;
    // v1.19 knocked down: crawl and look only
    if (p.downed && inp.consume('giveup')) { this.kill(p, p.knocker && p.knocker.alive ? p.knocker : null, 'bleed', false); return; }     // v1.21: give up instead of waiting to bleed out
    if (p.downed) { p.fireHeld = false; p.ads = false; inp.ads = false; for (const k of ['jump', 'crouch', 'grenade', 'grapple', 'stim', 'reload', 'swap', 'slot0', 'slot1', 'slot2', 'knife', 'inspect', 'interact']) inp.consume(k);
      if (inp.consume('pause')) this.pause(); if (inp.consume('map')) this.hud.toggleMap(); return; }
    if (this.reviveTgt && inp.consume('interact')) { const t = this.reviveTgt; if (!t.reviver) { t.reviver = p; t.reviveP = 0; BR.Audio.click(); } }
    if (p === (this.reviveTgt && this.reviveTgt.reviver)) { p.fireHeld = false; p.ads = false; inp.ads = false; for (const k of ['jump', 'crouch', 'grenade', 'grapple', 'stim', 'reload']) inp.consume(k); return; }
    if (inp.consume('jump')) p.input.jump = true;
    p.input.jumpHeld = !!inp.jumpHeld;
    if (inp.consume('crouch')) p.input.crouch = true;
    if (inp.consume('grenade')) { if (!(this.mode && this.mode.frozen) && this.shock.throw(p)) { BR.Audio.throwNade(); this.vmr.onThrow(); } else BR.Audio.click(); }
    if (inp.consume('stim')) { if (p.tryStim()) { BR.Audio.stim(); this.vmr.onStim(); this.hud.toast('STIM', 600); } else BR.Audio.click(); }
    if (inp.consume('grapple')) { if (p.tryGrapple()) { BR.Audio.grapple(); this.vmr.onGrapple(); this.ropeT = 0; } else BR.Audio.click(); }
    // Reload button: knives and full mags inspect instead
    if (inp.consume('reload') && w) {
      if (w.def.melee || (w.mag >= w.def.mag && !(w.reloadT > 0))) this.startInspect();
      else if (BR.Weapons.startReload(w, p)) BR.Audio.mech(w.def.shellReload ? 'grab' : 'grab');
    }
    const sw = i => { if (i === p.cur) this.startInspect(); else if (p.switchTo(i)) inp.ads = false; };
    if (inp.consume('swap')) {
      // cycle: gun -> other gun -> karambit -> ...
      const order = [0, 1, 2], start = order.indexOf(p.cur);
      for (let k = 1; k <= 3; k++) { const i = order[(start + k) % 3]; if (p.slots[i]) { sw(i); break; } }
    }
    if (inp.consume('slot0')) sw(0);
    if (inp.consume('slot1')) sw(1);
    if (inp.consume('slot2')) sw(2);
    if (inp.consume('knife')) {
      if (p.cur === 2) { const back = p.slots[this.lastGun] ? this.lastGun : p.slots[0] ? 0 : p.slots[1] ? 1 : 2; if (back !== 2) sw(back); }
      else { this.lastGun = p.cur; sw(2); }
    }
    if (p.cur !== 2) this.lastGun = p.cur;
    if (inp.consume('inspect')) this.startInspect();
    if (inp.consume('interact')) {
      if (this.chest && !this.chest.taken) { this.loot.openChest(p, this.chest); this.chest = null; }
      else if (this.swapItem && !this.swapItem.taken) { this.loot.swap(p, this.swapItem); this.swapItem = null; }
      else if (this.zm) this.zm.interact();
      else if (this.mode && this.mode.interact) this.mode.interact();
    }
    if (inp.consume('journal') && this.zm) this.hud.zmJournalToggle();
    if (inp.consume('pause')) this.pause();
    if (inp.consume('map')) this.hud.toggleMap();
    if (inp.consume('spawnmenu')) this.openSpawnMenu();
    p.ads = inp.ads && !!w && !w.def.melee && !p.mover.dropping;
    if (p.ads) this.vmr.inspectT = 0;

    // Aim assist pull (touch only): gently drags the crosshair onto a nearby target
    if (target) {
      const e = p.eye(this._v1);
      const tx = target.pos.x - e.x, ty = target.pos.y + target.mover.h * 0.62 - e.y, tz = target.pos.z - e.z;
      const yawT = Math.atan2(-tx, -tz), pitchT = Math.atan2(ty, Math.hypot(tx, tz));
      const active = Math.abs(dx) + Math.abs(dy) > 0 || Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.1 || inp.fire;
      if (active) {
        const k = Math.min(1, L.aimAssist * 5 * dt);
        p.yaw += BR.util.wrapAngle(yawT - p.yaw) * k;
        p.pitch += (pitchT - p.pitch) * k * 0.6;
      }
    }

    let fire = inp.fire;
    if (S.autoFire && touch && w && !w.def.melee && !fire) {
      const e = p.eye(this._v1), d = p.aimDir(this._v2);
      const h = this.hitscan(p, e, d, w.def.range * 1.6);
      if (h.actor || h.target) fire = true;
    }
    p.fireHeld = fire && !p.mover.dropping;
    if (fire && w && !w.def.melee) this.vmr.inspectT = 0;
  }

  startInspect() {
    const w = this.player && this.player.weapon;
    if (!w || this.player.ads) return;
    this.vmr.startInspect(w);
  }

  findAssistTarget() {
    const p = this.player, e = p.eye(this._v5), d = p.aimDir(this._v6);
    let best = null, bestA = 0.1;
    for (const a of this.actors) {
      if (a === p || !a.alive || (a.team !== undefined && a.team === p.team)) continue;
      const tx = a.pos.x - e.x, ty = a.pos.y + a.mover.h * 0.62 - e.y, tz = a.pos.z - e.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > 70 || dist < 0.5) continue;
      const ang = Math.acos(BR.util.clamp((tx * d.x + ty * d.y + tz * d.z) / dist, -1, 1));
      if (ang < bestA) { best = a; bestA = ang; }
    }
    if (best && !this.world.lineOfSight(e.x, e.y, e.z, best.pos.x, best.pos.y + best.mover.h * 0.62, best.pos.z)) return null;
    return best;
  }

  playerEvents() {
    const p = this.player, ev = p.mover.events, m = p.mover;
    if (!p.alive) return;
    if (ev.jump || ev.walljump) BR.Audio.jump();
    if (ev.land) { BR.Audio.land(m.landSpeed); this.cam.kick = Math.min(0.3, m.landSpeed * 0.018); this.vmr.onLand(m.landSpeed); }
    if (ev.slide) BR.Audio.slide();
    // v1.23 footsteps: one per stride on the ground (longer strides when sprinting, quiet when crouched)
    const sp = Math.hypot(m.vel.x, m.vel.z), lp = this._stepP || (this._stepP = p.pos.clone());
    if (m.onGround && !m.sliding && sp > 1.2) { this._stepD = (this._stepD || 0) + Math.hypot(p.pos.x - lp.x, p.pos.z - lp.z); const stride = 1.1 + sp * 0.12;
      if (this._stepD > stride) { this._stepD = 0; BR.Audio.step && BR.Audio.step(sp, m.crouched); } } else this._stepD = 0.6;
    lp.copy(p.pos);
    if (ev.wallrun) BR.Audio.wallrun();
    if (ev.chute) { BR.Audio.chute(); this.hud.toast('Parachute deployed', 900); this.cam.kick = 0.25; }
    if (ev.pad) { BR.Audio.pad(); this.cam.shake = Math.max(this.cam.shake, 0.15); }
    if (ev.tech) { this.hud.tech(ev.tech); BR.Audio.tech(); }
  }

  onChestOpened(actor, chest, gun) {
    const d = Math.hypot(actor.pos.x - this.camera.position.x, actor.pos.z - this.camera.position.z), rar = gun ? gun.rar | 0 : 0;
    if (d < 40) BR.Audio.chest(d, rar);
    if (actor === this.player) {                                   // v1.27: a kick, a buzz and the loot called out in its rarity
      this.cam.shake = Math.max(this.cam.shake, 0.12); this.cam.hitFov = Math.min(6, (this.cam.hitFov || 0) + 3);
      try { if (navigator.vibrate) navigator.vibrate(rar >= 4 ? [30, 40, 60] : 35); } catch (e) { /* no haptics */ }
      const R = BR.RARITY[rar];
      this.hud.toast(gun && R ? `${R.name.toUpperCase()} ${BR.CONFIG.weapons[gun.wid].name.toUpperCase()}!` : 'Chest opened', 1400);
    }
  }

  // ----------------------------------------------------------------- combat
  hitscan(shooter, o, d, maxDist) {
    const U = BR.util;
    const wh = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxDist);
    let best = wh.t, actor = null, head = false;
    const ix = U.inv(d.x), iy = U.inv(d.y), iz = U.inv(d.z);
    const box = this._hb || (this._hb = {});
    for (const a of this.actors) {
      if (a === shooter || !a.alive) continue;
      const m = a.mover, HB = a.hitbox;                 // optional custom hitbox (giant zombie bosses)
      const bh = HB ? HB.h : m.h, br = HB ? HB.r : 0.34, hr = HB ? HB.headR : 0.24, hy = HB ? HB.headY : bh - 0.2;
      const cx = m.pos.x, cy = m.pos.y + bh * 0.5, cz = m.pos.z;
      const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
      const tc = lx * d.x + ly * d.y + lz * d.z;
      if (tc < -1 - bh || tc > best + 1 + bh) continue;
      const cull = HB ? (bh * 0.5 + br + hr + 0.5) ** 2 : 4.8;
      if (lx * lx + ly * ly + lz * lz - tc * tc > cull) continue;
      if (a.downed && !HB) {                           // v1.27.2: on hands and knees: head, back, hips and shins along the body (matches the crawl pose)
        const yw = a.mesh ? a.mesh.rotation.y : a.yaw, fx = -Math.sin(yw), fz = -Math.cos(yw), py = m.pos.y;
        const S = this._downS || (this._downS = [[0.62, 0.56, 0.19, true], [0.32, 0.5, 0.25, false], [0.0, 0.44, 0.25, false], [-0.3, 0.16, 0.17, false], [-0.6, 0.1, 0.14, false]]);
        for (const [f, y, r, hd] of S) { const tt = U.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, m.pos.x + fx * f, py + y, m.pos.z + fz * f, r, best); if (tt < best) { best = tt; actor = a; head = hd; } }
        continue;
      }
      const th = U.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, m.pos.y + hy, cz, hr, best);
      if (th < best) { best = th; actor = a; head = true; }
      box.x0 = cx - br; box.x1 = cx + br; box.z0 = cz - br; box.z1 = cz + br;
      box.y0 = m.pos.y; box.y1 = m.pos.y + (HB ? HB.bodyTop : m.h - 0.4);
      const tb = U.rayAABB(o.x, o.y, o.z, ix, iy, iz, box, best);
      if (tb < best) { best = tb; actor = a; head = false; }
    }
    const r = this._hit || (this._hit = {});
    r.target = null;
    // custom-mode targets (aim trainer targets, Overdrive swarm): not actors, just shapes to hit
    if (this.mode && this.mode.rayTargets && (!shooter || shooter.isPlayer)) {
      const m = this.mode.rayTargets(o, d, best);
      if (m && m.t < best) { best = m.t; actor = null; head = m.head; r.target = m.target; }
    }
    r.t = best; r.actor = actor; r.head = head;
    return r;
  }

  muzzlePoint(a, out) {
    if (a.isPlayer) {
      const ads = this.vmr.adsW || 0;
      out.set(BR.util.lerp(0.2 * this.vmScale, 0.02, ads), BR.util.lerp(-0.16, -0.08, ads), -1.6);
      return this.camera.localToWorld(out);
    }
    const s = Math.sin(a.yaw), c = Math.cos(a.yaw), m = a.mover;
    return out.set(m.pos.x + c * 0.26 - s * 0.72, m.pos.y + m.h - 0.62, m.pos.z - s * 0.26 - c * 0.72);
  }

  tracerOpts(actor) {
    if (actor.isPlayer && actor.weapon && actor.weapon.def.pap) return { style: 'helix', color2: 0x50f0dc };      // Pack-a-Punched: moon-energy helix
    if (!actor.isPlayer) return null;
    return BR.Models.tracerOpts(this.playerTracer(actor), this.time);
  }

  tracerColor(actor) {
    if (actor.isPlayer && actor.weapon && actor.weapon.def.pap) return 0xc06bff;
    if (!actor.isPlayer) return 0xff9a6b;
    return BR.Models.tracerColor(this.playerTracer(actor), this.time);
  }
  playerTracer(actor) { return BR.Models.resolveTracer(actor.weapon ? actor.weapon.id : 'rifle', BR.Profile.data.equip); }

  applyDamage(victim, attacker, dmg, head, at, weaponId) {
    if (BR.AntiCheat) dmg = BR.AntiCheat.checkHit(this, attacker, dmg, weaponId);
    if (!victim.alive) return;
    if (attacker && victim !== attacker && victim.team !== undefined && victim.team === attacker.team) return;     // no friendly fire
    if (this.mode && this.mode.netDamage && this.mode.netDamage(victim, attacker, dmg, head, at, weaponId)) return; // online: the victim's owner applies it
    if (this.brnet && this.brnet.netDamage(victim, attacker, dmg, head, at, weaponId)) return;                      // v1.24 party BR: same
    const remoteHuman = attacker && attacker.netProxy;          // v1.16: another player online does full damage (the bot multipliers are for bots)
    if (victim.isPlayer && attacker && !attacker.isPlayer && !remoteHuman) dmg *= this.diff.playerDamageMult;
    else if (!victim.isPlayer && attacker && !attacker.isPlayer && !remoteHuman) dmg *= BR.CONFIG.match.botVsBotDamage;
    if (this.zm && attacker && attacker.isPlayer) dmg *= this.zm.damageMult(victim);       // Insta-Kill
    const shieldBefore = victim.shield;
    const died = victim.takeDamage(dmg);
    if (this.zm && attacker && attacker.isPlayer && victim.zombie) this.zm.onHit(victim, dmg, head);
    const shieldHit = shieldBefore > 0;
    if (attacker) attacker.damageDealt += dmg;
    victim.lastAttacker = attacker;
    victim.lastHurtT = this.time;
    this._v3.set(at.x, at.y, at.z);
    this.fx.impact(this._v3, true);
    victim.flash();
    if (attacker && attacker === this.player) {
      this.hud.hitmarker(head, died);
      this.hud.damageNumber(this._v3, dmg, head, victim, shieldHit);
      if (!died) BR.Audio.hit(head, shieldHit);
      // impact sparks: gold crit burst on the head, team-colour/shield-blue on the body
      this.fx.burst(this._v3, head ? [0xffd24a, 0xffffff, 0xff9a1f] : shieldHit ? [0x6fc8ff, 0xffffff] : [0xff4a5a, 0xffffff], head ? 14 : 7, head ? 7 : 4.5, head ? 0.07 : 0.05, head ? 0.45 : 0.3);
      // v1.22: a coloured shock ring + hot pop where your round lands (gold crit, blue shield, red body; bigger on the kill)
      { const hc = head ? 0xffd24a : shieldHit ? 0x58c8ff : 0xff4a5a; this.fx.shock(this._v3, hc, died ? 1.6 : head ? 0.95 : 0.6, died ? 0.4 : 0.22); this.fx.pop(this._v3, hc, head ? 0.5 : 0.32, 0.09, 1.5); }
      // headshots punch the view a touch (FOV squeeze + tiny shake)
      if (head) { this.cam.hitFov = Math.min(4, (this.cam.hitFov || 0) + 2.5); this.cam.shake = Math.max(this.cam.shake, 0.06); }
      if (died) { this.cam.hitFov = Math.min(5, (this.cam.hitFov || 0) + (head ? 4 : 2)); }
    }
    if (victim === this.player) {
      this.hud.damageFrom(attacker);
      BR.Audio.hurt();
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* optional */ }
    }
    if (victim.brain) victim.brain.onDamaged(attacker);
    if (died && !BR.Squads.tryDown(this, victim, attacker, weaponId, head)) this.kill(victim, attacker, weaponId, head);
  }

  kill(victim, killer, weaponId, head) {
    if (this.brnet && !this.brnet.canKill(victim, killer, weaponId, head)) return;     // v1.24 party BR: only the owner kills (and tells everyone)
    // v1.21: knocking someone down earns the elimination; finishing them off (or helping to) is an assist
    const kn = victim.downed ? victim.knocker : null;
    if (kn && kn !== victim && !(kn.team !== undefined && kn.team === victim.team)) {
      if (killer && killer !== kn && killer !== victim) { killer.assists = (killer.assists || 0) + 1; if (killer.isPlayer) { this.hud.toast('+ ASSIST · ' + victim.name, 1100); BR.Audio.hit && BR.Audio.hit(false); } }
      killer = kn; weaponId = victim.downWid || weaponId;
    } else if (weaponId === 'bleed' && killer && victim.downWid) weaponId = victim.downWid;
    victim.downed = false; victim.reviver = null; victim.mover.prone = false;
    victim.alive = false;
    victim.health = 0;
    victim.deathT = this.time;
    victim.fireHeld = false;
    if (victim.mover.grapple) victim.mover.releaseGrapple();
    if (killer) killer.kills++;
    // grind challenges (camos / blueprints): your kills in real matches, zombies included
    if (killer && killer.isPlayer && victim !== killer && !this.practice && !this.demo && (!this.mode || this.mode.arena) && BR.Profile.addGrind) {   // v1.15: casual + ranked arena kills count too
      const wd = BR.CONFIG.weapons[weaponId];
      BR.Profile.addGrind('kill', 1, { w: weaponId, head: !!head, melee: !!(wd && wd.melee), zombie: !!victim.zombie });
    }
    if (!this.zm && !(this.mode && this.mode.noDrops)) this.loot.dropAll(victim);
    // v1.23: every kill drops an ammo pack for the killer (ammo for whatever they have equipped when they walk over it)
    if (!this.zm && !this.demo && killer && killer !== victim && killer.alive && !victim.zombie) {
      const p = victim.pos; this.loot.add({ kind: 'scav', owner: killer, t0: this.time }, p.x, p.y + 0.9, p.z, new THREE.Vector3((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2));
    }
    victim.dieVisual();
    if (this.demo) return;
    if (this.zm) { this.zm.onKill(victim, killer, weaponId, head); return; }
    if (this.mode && this.mode.onKill) { this.mode.onKill(victim, killer, weaponId, head); if (!this.mode.feed) return; }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nm = a => `<b class="${a.isPlayer ? 'me' : ''}">${esc(a.name)}</b>`;
    const how = weaponId === 'bleed' ? 'bled out' : weaponId === 'storm' ? 'storm' : weaponId === 'shockwave' ? 'Shockwave' : (BR.CONFIG.weapons[weaponId] ? BR.CONFIG.weapons[weaponId].name : '') + (head ? ' ✕' : '');
    // your rows use your equipped kill feed banner + rank badge
    const P = BR.Profile.data, mine = (killer && killer.isPlayer) || victim.isPlayer;
    const badge = a => a && a.isPlayer ? BR.Ranks.badge(P.rp || 0) : '';
    const body = killer ? `${badge(killer)}${nm(killer)} <i>${esc(how)}</i> ${badge(victim)}${nm(victim)}` : `${badge(victim)}${nm(victim)} <i>${esc(how)}</i>`;
    this.hud.killfeed(body, killer && killer.isPlayer ? 'feed-' + (P.equip.feeds || 'none') : mine ? 'feed-none' : '');
    if (killer && killer === this.player) {
      // equipped kill finisher plays on the victim
      // weapon mastery: count the kill, announce any camo it unlocks
      const unlocked = BR.Profile.addKill(weaponId);
      if (unlocked.length) setTimeout(() => this.hud.toast('UNLOCKED · ' + unlocked.join(', ') + ' camo', 2400), 900);
      const fin = P.equip.finishers;
      if (fin && fin !== 'none' && this.fx.finisher) this.fx.finisher(fin, victim.pos.clone(), victim);
      // multi-kill streak (kills within 4 s of each other)
      const mk = this.multiKill || (this.multiKill = { n: 0, t: -9 });
      mk.n = this.time - mk.t < 4 ? mk.n + 1 : 1; mk.t = this.time;
      // the reward: on-body burst (lighter under a finisher), banner + screen flash, layered sound,
      // a split second of slow motion and a punch on the camera
      if (this.fx.killBurst) this.fx.killBurst(victim.pos.clone(), head, mk.n, !!(fin && fin !== 'none'));
      this.hud.killBanner({ name: victim.name, head, streak: mk.n, coins: BR.CONFIG.coins.perKill });
      BR.Audio.kill(head, mk.n);
      this.hitStop = head || mk.n >= 2 ? 0.12 : 0.08;
      this.cam.shake = Math.max(this.cam.shake || 0, 0.14 + (head ? 0.06 : 0)); this.cam.hitFov = Math.min(10, (this.cam.hitFov || 0) - 3.5);
    }
    if (victim === this.player) {
      this.deathPos = victim.pos.clone();
      this.killer = killer;
      this.result = {
        win: false, place: this.aliveCount() + 1, total: this.total, kills: victim.kills, assists: victim.assists || 0,
        damage: victim.damageDealt, time: this.time,
        by: killer ? 'Eliminated by ' + killer.name : weaponId === 'bleed' ? 'Bled out' : 'Lost to the storm',
      };
    }
    if (this.squad > 1) BR.Squads.onDeath(this, victim);
  }

  onShot(actor, w) {
    // your shots light up the surroundings for a split second
    if (actor.isPlayer && this.muzzleLight && !w.def.melee && !w.def.suppressed) {
      this.muzzleLight.position.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(this._mlv || (this._mlv = new THREE.Vector3())), 1.2);
      this.muzzleLight.intensity = w.def.pellets > 1 || w.def.kick > 1 ? 3.2 : 2.2;
    }
    const cp = this.camera.position;
    const dx = actor.pos.x - cp.x, dz = actor.pos.z - cp.z;
    const dist = actor.isPlayer ? 0 : Math.hypot(dx, dz);
    let pan = 0;
    if (!actor.isPlayer && dist > 0.1 && this.player) {
      const p = this.player;
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      pan = BR.util.clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.8;
    }
    if (dist < 150 && !this.demo) BR.Audio.shot(w.id, dist, pan, !!w.def.suppressed);
    if (actor.isPlayer) {
      this.vmr.onFire(w);
      // Visible recoil: the view punches up and rolls, then springs back (huge on the sniper)
      const K = w.def.kick || 0, c = this.cam;
      if (K || w.def.recoil) {
        // v1.19: the punch spring is damped (no bounce); the roll swaps sides shot to shot instead of jittering
        const ads = this.player.ads ? 0.85 : 1;
        c.rollSide = -(c.rollSide || 1);
        c.punchV = (c.punchV || 0) + (w.def.recoil * 5 + K * 1.1) * ads;
        c.rollV = (c.rollV || 0) + c.rollSide * (0.6 + Math.random() * 0.4) * (K * 0.3 + w.def.recoil * 1.6);
        if (K) { c.kick = Math.max(c.kick, 0.05 * K); c.shake = Math.max(c.shake, 0.07 * K); }
      }
    } else {
      if (dist < 90) this.fx.flash(this.muzzlePoint(actor, this._v4));
      this.recentShots.push({ x: actor.pos.x, z: actor.pos.z, t: this.time });
    }
    // Bots hear gunfire (suppressed guns carry less than half as far)
    const hear = w.def.suppressed ? 35 : 80;
    for (const a of this.actors) {
      if (!a.brain || !a.alive || a === actor) continue;
      if (Math.abs(a.pos.x - actor.pos.x) + Math.abs(a.pos.z - actor.pos.z) < hear) a.brain.onHeard(actor);
    }
  }

  onBlast(actor, power) {
    const p = this._v5.set(actor.pos.x, actor.pos.y + 0.1, actor.pos.z);
    this.fx.blast(p, power);
    if (actor === this.player) { this.cam.shake = Math.max(this.cam.shake, 0.25 * power + 0.05); BR.Audio.blast(); }
  }

  onMelee(actor, hit) {
    if (actor !== this.player) return;
    this.vmr.onMelee(hit);
    BR.Audio.swish(hit);
  }

  onShellLoaded() { this.vmr.onShell(); BR.Audio.mech('shell'); }

  onPickup(actor, item) {
    if (actor !== this.player) return;
    BR.Audio.pickup();
    const C = BR.CONFIG;
    let label = '';
    if (item.kind === 'weapon') label = BR.RARITY[item.rar | 0].name + ' ' + C.weapons[item.wid].name;
    else if (item.kind === 'ammo') label = `+${item.amount} ${item.ammoType} ammo`;
    else if (item.kind === 'scav') label = `+AMMO · ${item.gunName || 'weapon'}`;
    else if (item.kind === 'heal') label = `+${item.amount} health`;
    else label = `+${item.amount} shield`;
    this.hud.toast(label, 1000);
  }

  onZoneShrink() {
    if (this.state !== 'playing') return;
    this.hud.toast('The storm is closing in', 2200);
    BR.Audio.zone();
  }

  // --------------------------------------------------------- menu trailer
  updateDemo(dt) {
    this.simulate(dt);
    const D = this.demo, cam = this.camera, U = BR.util;
    if (!D) return;
    D.shotT -= dt; D.t += dt;
    const alive = this.actors.filter(a => a.alive);
    if (alive.length <= 1 || this.time > 200) { this.startDemo(); return; }
    if (D.shotT <= 0 || !D.subject || !D.subject.alive) {
      // Cut to a new shot. Prefer someone in a fight.
      const fighting = alive.filter(a => a.brain && a.brain.target && !a.mover.dropping);
      D.subject = (fighting.length && Math.random() < 0.75 ? U.pick(fighting, Math.random) : U.pick(alive, Math.random));
      const modes = D.subject.mover.dropping ? ['chase', 'orbit', 'fly'] : ['chase', 'orbit', 'side', 'fly', 'low'];
      D.mode = U.pick(modes, Math.random);
      D.shotT = 4.5 + Math.random() * 3;
      D.ang = Math.random() * Math.PI * 2;
      D.cut = true;
      document.body.classList.remove('cut'); void document.body.offsetWidth; document.body.classList.add('cut');
    }
    const s = D.subject, sp = s.pos, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const want = this._v1, look = this._v2.set(sp.x, sp.y + 1.2, sp.z);
    if (D.mode === 'chase') { want.set(sp.x - fx * 5, sp.y + 2.2, sp.z - fz * 5); look.set(sp.x + fx * 6, sp.y + 1.2, sp.z + fz * 6); }
    else if (D.mode === 'orbit') { D.ang += dt * 0.45; want.set(sp.x + Math.cos(D.ang) * 6.5, sp.y + 2.4, sp.z + Math.sin(D.ang) * 6.5); }
    else if (D.mode === 'side') { want.set(sp.x - fz * 7, sp.y + 1.3, sp.z + fx * 7); }
    else if (D.mode === 'low') { D.ang += dt * 0.2; want.set(sp.x + Math.cos(D.ang) * 9, sp.y + 0.6, sp.z + Math.sin(D.ang) * 9); look.y = sp.y + 1.8; }
    else { want.set(sp.x - fx * 22 + 8, sp.y + 22, sp.z - fz * 22); }
    if (D.cut) { cam.position.copy(want); D.cut = false; }
    else cam.position.lerp(want, 1 - Math.exp(-4 * dt));
    if (cam.position.y < 0.5) cam.position.y = 0.5;
    cam.lookAt(look);
  }

  // ------------------------------------------------------------------ shop
  buildShopScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x0c0e12);
    s.add(new THREE.HemisphereLight(0xdde6ff, 0x30281c, 0.7));
    const k = new THREE.DirectionalLight(0xfff2ff, 0.95); k.position.set(2, 3, 2); s.add(k);
    const r = new THREE.DirectionalLight(0x6fb8ff, 0.7); r.position.set(-3, 1, -2); s.add(r);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.08, 40), new THREE.MeshPhongMaterial({ color: 0x1c2027, specular: 0x444444 }));
    floor.position.y = -0.55; this.shopFloor = floor; s.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.015, 6, 60), new THREE.MeshBasicMaterial({ color: 0xb26bff }));
    ring.rotation.x = Math.PI / 2; floor.add(ring); ring.position.y = 0.05;
    this.shopScene = s;
    this.shopCam = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
    this.shopCam.position.set(0, 0.35, 3.6);
    this.shopCam.lookAt(0, 0, 0);
    this.inspect = { on: false, yaw: 0, pitch: 0, zoom: 1, vy: 0, vx: 0, idle: 0, dragging: false };
    this.shopPivot = new THREE.Group();
    s.add(this.shopPivot);
    this.shopFx = new BR.Effects(s); this.shopFx.cam = this.shopCam;   // real in-game tracers, slowed down for the preview
    this.shopTracerT = 0;
  }

  openShop() { this.prevState = this.state; this.state = 'shop'; this.resize(); }
  // Inventory inspect: free rotation + zoom of the preview, with momentum after a flick
  inspectReset() { Object.assign(this.inspect, { yaw: 0.6, pitch: 0.12, zoom: 0.72, vy: 0, vx: 0, idle: 0 }); }
  closeShop() { this.state = this.prevState || 'menu'; }

  // p: { weapon, bp, skin, charm, tracer, gloves, showTracer, showHands }
  setShopPreview(p) {
    this.shopPrev = p;
    while (this.shopPivot.children.length) this.shopPivot.remove(this.shopPivot.children[0]);
    this.shopChar = null;
    if (p.character) {                                       // v1.26 CHARACTER tab: the full character in the look, holding your gun
      const L = p.character, fig = BR.charFigure({ o: L.o, m: L.m, h: L.h }, L.wid, L.skin, L.bp), head = L.focus !== 'body', hat = L.focus === 'hat';
      const g = new THREE.Group(); g.add(fig.mesh);
      fig.fake.yaw = Math.PI; fig.mesh.userData.yaw = Math.PI;
      const k = this.inspect.on ? 1 : 0.75, sc = (hat ? 2.5 : head ? 3.6 : 1.2) * k;            // (the shop doesn't zoom out like the inventory)
      fig.mesh.userData.gun.visible = !head;
      g.scale.setScalar(sc);
      g.position.set(0, hat ? -1.83 * sc : head ? -1.75 * sc + 0.05 : this.inspect.on ? -1.1 : -0.52, 0);
      g.rotation.y = head ? 0.5 : 0.35;
      this.shopPivot.add(g); this.shopGun = null; this.shopChar = fig;
      return;
    }
    const wid = p.weapon || 'holoar';
    const g = BR.Models.weapon(wid, p.skin, wid === 'knife' ? 'none' : p.charm, p.bp);
    const sc = wid === 'knife' ? 5 : wid === 'butterfly' ? 3.6 : wid === 'bayonet' ? 3.3 : wid === 'tracker' ? 3.0 : wid === 'pistol' ? (p.showHands ? 3.4 : 2.6) : wid === 'sniper' || wid === 'hunter' ? 1.3 : wid === 'launcher' ? 1.8 : wid === 'revolver' ? 2.4 : 1.6;
    g.scale.setScalar(sc);
    g.rotation.y = Math.PI / 2;
    g.position.set(0, wid === 'knife' ? 0.05 : -0.05, -0.15);
    if (p.showHands && g.userData.grip) {
      // gloved hands on the grip + foregrip so glove skins can be previewed
      const R = BR.Models.hand(p.gloves, false); R.position.copy(g.userData.grip); R.rotation.set(0.22, 0, -Math.PI / 2); R.translateY(0.026);
      g.add(R);
      if (g.userData.fore) { const L = BR.Models.hand(p.gloves, true); L.position.copy(g.userData.fore); L.rotation.set(0, -Math.PI / 2, Math.PI, 'YXZ'); L.translateY(0.024); g.add(L); }
    }
    this.shopPivot.add(g);
    this.shopGun = g;
    g.visible = !p.hideGun;
    // spin around the model's middle: centre its bounding box on the pivot
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g), ctr = bb.getCenter(new THREE.Vector3());
    this.shopPivot.worldToLocal(ctr); g.position.x -= ctr.x; g.position.z -= ctr.z;
  }

  updateShop(dt) {
    this.time += dt;
    // Keep the gun in the open part of the screen (left of the panel, or above it in portrait)
    const land = window.innerWidth >= window.innerHeight;
    const panelFrac = land ? Math.min(470, window.innerWidth * 0.56) / window.innerWidth : 0;
    const halfW = 3.6 * Math.tan(this.shopCam.fov * Math.PI / 360) * this.shopCam.aspect;
    this.shopPivot.position.x = -panelFrac * halfW;
    this.shopBaseY = land ? 0 : 0.45;
    const I = this.inspect;
    if (I.on) {
      if (!I.dragging) {                                     // momentum, then a slow idle spin
        I.yaw += I.vy * dt; I.pitch = BR.util.clamp(I.pitch + I.vx * dt, -1.3, 1.3);
        I.vy *= Math.exp(-dt * 3); I.vx *= Math.exp(-dt * 3);
        I.idle += dt; if (I.idle > 3) I.yaw += dt * 0.35 * Math.min(1, I.idle - 3);
      }
      this.shopPivot.rotation.set(I.pitch, I.yaw, 0, 'YXZ');
      const zs = BR.util.lerp(this.shopPivot.scale.x, I.zoom, 1 - Math.exp(-dt * 12)); this.shopPivot.scale.setScalar(zs);
      this.shopPivot.position.y = this.shopBaseY + 0.1;
      this.shopFloor.visible = false;
    } else {
      this.shopFloor.visible = true;
      this.shopPivot.rotation.set(0, this.shopPivot.rotation.y + dt * 0.5, 0);
      this.shopPivot.scale.setScalar(1);
      this.shopPivot.position.y = this.shopBaseY + Math.sin(this.time * 1.4) * 0.03;
    }
    this.shopFloor.position.x = this.shopPivot.position.x; this.shopFloor.position.y = this.shopBaseY - 0.55;
    if (this.shopGun) BR.Models.animate(this.shopGun, this.time);
    if (this.shopChar) { const f = this.shopChar.fake; f.pitch = -0.06 + Math.sin(this.time * 0.9) * 0.04; BR.Actor.prototype.syncMesh.call(f, dt); }
    const ch = this.shopGun && this.shopGun.userData.charmObj;
    if (ch) ch.rotation.z = Math.sin(this.time * 3) * 0.4;
    // Tracer preview: slow, bright streaks sweeping past the gun
    if (this.shopPrev && this.shopPrev.showTracer) {
      this.shopTracerT -= dt;
      if (this.shopTracerT <= 0) {
        this.shopTracerT = 0.28;
        const cx = this.shopPivot.position.x, y = this.shopBaseY - 0.3 + Math.random() * 0.7, z = 0.2 + Math.random() * 0.5;
        const from = this._v1.set(cx - 3.2, y, z), to = this._v2.set(cx + 3.2, y + (Math.random() - 0.5) * 0.4, z - 0.4);
        this.shopFx.tracer(from, to, true, BR.Models.tracerColor(this.shopPrev.tracer, this.time), Object.assign({ speed: 9, streak: 2.2 }, BR.Models.tracerOpts(this.shopPrev.tracer, this.time) || {}));
      }
    }
    this.shopFx.update(dt);
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const p = this.player, m = p.mover, cam = this.camera, C = BR.CONFIG, U = BR.util;
    const c = this.cam;
    if (this.victory && p.alive) {
      // Victory cam: dolly out of your eyes into an orbit around your character, looking up at them
      const v = this.victory, e = BR.util.clamp(v.t / 1.3, 0, 1), k = 1 - Math.pow(1 - e, 3);
      const ang = v.yaw0 + v.t * 0.42, R = 0.2 + 3.9 * k, cx = m.pos.x, cy = m.pos.y + 1.15, cz = m.pos.z;
      cam.position.set(cx - Math.sin(ang) * R, cy + 0.5 - 0.55 * k + Math.sin(v.t * 0.7) * 0.12, cz - Math.cos(ang) * R);
      cam.up.set(0, 1, 0); cam.lookAt(cx, cy + 0.95 * k, cz);           // low heroic angle, looking up past them at the sky
      cam.fov = U.damp(cam.fov, 62, 3, dt); cam.updateProjectionMatrix();
      this.vmr.hide();
      return;
    }
    if (!p.alive) {
      // Death cam: drift up and orbit the spot where you went down
      c.orbit += dt * 0.35;
      const dp = this.deathPos || p.pos;
      const tx = dp.x + Math.cos(c.orbit) * 7, tz = dp.z + Math.sin(c.orbit) * 7;
      cam.position.x = U.damp(cam.position.x, tx, 3, dt);
      cam.position.y = U.damp(cam.position.y, dp.y + 5, 3, dt);
      cam.position.z = U.damp(cam.position.z, tz, 3, dt);
      cam.lookAt(dp.x, dp.y + 0.5, dp.z);
      this.vmr.hide();
      return;
    }
    c.off = U.damp(c.off, m.h - C.actor.eyeFromTop, 14, dt);
    c.kick = U.damp(c.kick, 0, 9, dt);
    // view punch spring (visual only: aim returns to where it was)
    c.punch = c.punch || 0; c.punchV = c.punchV || 0; c.rollP = c.rollP || 0; c.rollV = c.rollV || 0;
    { const n = dt > 1 / 90 ? 2 : 1, h = dt / n;                  // v1.19: near-critically damped, sub-stepped
      for (let i = 0; i < n; i++) { c.punchV += (-150 * c.punch - 21 * c.punchV) * h; c.punch += c.punchV * h; c.rollV += (-150 * c.rollP - 21 * c.rollV) * h; c.rollP += c.rollV * h; } }
    c.shake = Math.max(0, c.shake - dt * 1.2);
    const sp = m.speedH;
    if (m.onGround && !m.sliding) c.bob += dt * sp * 1.35;
    // v1.21: smooth step bob (a rounded rise and fall each step instead of a hard bounce), eased in and out with speed
    c.bobA = BR.util.damp(c.bobA || 0, m.onGround && !m.sliding ? Math.min(sp, 9) : 0, 8, dt);
    const bobY = (0.5 - 0.5 * Math.cos(c.bob * 2)) * c.bobA * 0.0055;
    const sh = c.shake * c.shake;
    // v1.19: smooth shake (layered sines) instead of a new random offset every frame
    const st = this.time * 1;
    cam.position.set(m.pos.x + (Math.sin(st * 41.3) + Math.sin(st * 23.1 + 1.7)) * 0.25 * sh, m.pos.y + c.off - c.kick + bobY + (Math.sin(st * 37.7 + 0.6) + Math.sin(st * 19.3 + 2.9)) * 0.25 * sh, m.pos.z + (Math.sin(st * 29.9 + 2.2) + Math.sin(st * 17.1)) * 0.25 * sh);

    const right = Math.cos(p.yaw) * m.wallN.x - Math.sin(p.yaw) * m.wallN.z;
    const rollT = m.wallRunning ? -right * C.camera.wallRunRoll : m.sliding ? 0.05 : 0;
    c.roll = U.damp(c.roll, rollT, 8, dt);
    cam.rotation.set(p.pitch + c.punch - (this.vmr.lookDown || 0), p.yaw, c.roll + c.rollP);

    const w = p.weapon;
    const zoom = p.ads && w ? w.def.zoom : 1;
    const speedK = U.clamp((sp - C.move.runSpeed) / 8, 0, 1);
    const fovT = (this.baseFov() + C.camera.fovSpeedBoost * speedK) / zoom;
    c.fov = U.damp(c.fov, fovT, 10, dt);
    c.hitFov = U.damp(c.hitFov || 0, 0, 12, dt);
    const fovNow = c.fov - c.hitFov;
    if (Math.abs(cam.fov - fovNow) > 0.01) { cam.fov = fovNow; cam.updateProjectionMatrix(); }

    const ld = this.lookD || [0, 0];
    if (p.downed) { this.vmr.hide(); return; }            // v1.19 knocked down: no gun, just crawling
    this.vmr.update(dt, ld[0], ld[1]);
  }

  // ------------------------------------------------------------- viewmodel
  refreshCosmetics() {
    this.vmr.rebuild();
    // swapped knives? give the player the newly equipped one
    const p = this.player, mel = BR.Profile.melee();
    if (p && p.slots && p.slots[2] && p.slots[2].id !== mel) { p.slots[2] = BR.Weapons.create(mel); if (p.cur === 2) this.vmr.lastWeapon = null; }
    if (p && p.mesh && p.mesh.userData.char) { this.scene.remove(p.mesh); p.mesh = null; }      // a new outfit: rebuilt when it's next shown
    if (BR.Party && BR.Party.relook) BR.Party.relook();
  }

  render() {
    if (this.state === 'menu' && !this.scene) return;            // v1.18 light menu: nothing 3D to draw
    BR.Models.tick(performance.now() / 1000);       // animated camo / glove textures
    const r = this.renderer;
    r.clear();
    if (this.state === 'shop') { r.render(this.shopScene, this.shopCam); return; }
    if (!this.scene) return;
    // skip map tiles past the fog (invisible anyway)
    if (this.world && this.scene.fog) this.world.cullChunks(this.camera.position.x, this.camera.position.z, this.scene.fog.far + 30);
    this.updateShadowCam();
    if (this.muzzleLight && this.muzzleLight.intensity > 0.01) this.muzzleLight.intensity *= 0.6; else if (this.muzzleLight) this.muzzleLight.intensity = 0;
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'won' || this.state === 'paused') && this.player && this.player.alive) {
      r.clearDepth();
      r.render(this.vmr.scene, this.vmr.camera);
    }
  }
};
