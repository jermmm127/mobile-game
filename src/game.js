'use strict';
// =============================================================================
// GAME — owns the renderer, the match, and the main loop.
//
// Frame order (update):
//   1. read player input -> player.input / look
//   2. bot brains fill their inputs
//   3. every actor moves + fires (Actor.update)
//   4. pickups, zone damage, effects
//   5. camera + viewmodel + HUD
//
// Hooks you will likely extend for new features:
//   applyDamage(), kill(), onShot(), onPickup(), onZoneShrink(), mover.events
// =============================================================================
BR.Game = class Game {
  constructor(settings) {
    this.settings = settings;
    this.hud = new BR.HUD(document.getElementById('app'));
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    const C = BR.CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(C.fov, 1, C.near, C.far);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x6b6250, 0.9));
    const vd = new THREE.DirectionalLight(0xffffff, 0.6); vd.position.set(1, 2, 1); this.vmScene.add(vd);
    this.vm = this.buildViewmodels();
    this.input = new BR.Input(document.getElementById('play'));
    this.state = 'menu';
    this.time = 0;
    this.actors = [];
    this.recentShots = [];
    for (let i = 1; i <= 6; i++) this['_v' + i] = new THREE.Vector3();
    this.cam = { off: 1.66, kick: 0, roll: 0, fov: C.fov, bob: 0, swayX: 0, swayY: 0, vmKick: 0, flashT: 0, switchT: 0, orbit: 0 };
    this.applyGraphics();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.resize();
    this.buildScene(Math.floor(Math.random() * 1e9), true);
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0; this.fpsVal = 60;
    requestAnimationFrame(t => this.loop(t));
  }

  applyGraphics() {
    const g = BR.CONFIG.graphics[this.settings.gfx] || BR.CONFIG.graphics.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatio));
    this.fogFar = g.fogFar;
    if (this.scene && this.scene.fog) this.scene.fog.far = g.fogFar;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
    // Keep the gun from filling a portrait screen
    this.vmScale = w < h ? 0.6 : 1;
  }

  // ------------------------------------------------------------ scene setup
  buildScene(seed, attract) {
    if (this.scene) this.disposeScene();
    const sky = 0xb9d3e6;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 40, this.fogFar || 230);
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a5242, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.75);
    sun.position.set(0.6, 1, 0.35);
    this.scene.add(sun);
    this.world = new BR.World(seed);
    this.world.buildMeshes(this.scene);
    this.hud.setStaticMap(this.world.renderMinimap(256));
    this.fx = new BR.Effects(this.scene);
    this.loot = new BR.Loot(this);
    this.loot.spawnFromWorld(this.world);
    this.zone = new BR.Zone(this, this.world);
    this.zone.mesh.visible = !attract;
    this.actors = [];
    this.player = null;
  }

  disposeScene() {
    this.scene.traverse(o => {
      if (o.geometry && !o.geometry._shared) o.geometry.dispose();
    });
    this.scene = null;
  }

  // ------------------------------------------------------------------ match
  startMatch() {
    const S = this.settings, C = BR.CONFIG;
    this.buildScene(Math.floor(Math.random() * 1e9), false);
    this.diff = C.difficulty[S.difficulty] || C.difficulty.normal;
    this.time = 0;
    this.recentShots = [];
    this.result = null;
    const H = this.world.half;
    const spawn = a => {
      a.mover.pos.set((Math.random() * 2 - 1) * H * 0.85, C.match.dropHeight + Math.random() * 12, (Math.random() * 2 - 1) * H * 0.85);
      a.mover.dropping = true;
      a.giveWeapon('pistol', 12);
      a.ammo.light = 24;
    };
    this.player = new BR.Actor(this, { id: 0, name: 'You', isPlayer: true });
    spawn(this.player);
    this.player.yaw = Math.atan2(this.player.pos.x, this.player.pos.z); // face map center
    this.player.pitch = -0.75; // look down at the landing area
    this.actors.push(this.player);
    const names = C.botNames.slice().sort(() => Math.random() - 0.5);
    const botCount = Math.max(1, (S.players || 20) - 1);
    for (let i = 0; i < botCount; i++) {
      const col = new THREE.Color().setHSL(Math.random(), 0.55, 0.55).getHex();
      const b = new BR.Actor(this, { id: i + 1, name: names[i % names.length] + (i >= names.length ? ' ' + (i + 1) : ''), color: col });
      spawn(b);
      b.brain = new BR.BotBrain(b, this, this.diff);
      this.scene.add(b.mesh);
      this.actors.push(b);
    }
    this.total = this.actors.length;
    this.swapItem = null;
    this.input.reset();
    this.state = 'playing';
    this.cam.off = BR.CONFIG.actor.standHeight - BR.CONFIG.actor.eyeFromTop;
    this.hud.show('menu', false);
    this.hud.show('end', false);
    this.hud.show('pause', false);
    this.hud.show('play', true);
    this.hud.toast('Skydive! Steer to a landing spot', 2600);
    document.body.classList.remove('hint-off');
    clearTimeout(this._hintTO);
    this._hintTO = setTimeout(() => document.body.classList.add('hint-off'), 12000);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }

  aliveCount() { let n = 0; for (const a of this.actors) if (a.alive) n++; return n; }

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
    this.input.unlock();
    this.hud.show('pause', false);
    this.hud.show('end', false);
    this.hud.show('play', false);
    this.hud.show('menu', true);
    this.buildScene(Math.floor(Math.random() * 1e9), true);
  }

  // ------------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fpsVal = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    dt = Math.min(dt, 0.05);
    if (this.state === 'playing' || this.state === 'dead' || this.state === 'won') this.update(dt);
    else if (this.state === 'menu') this.attract(dt);
    this.render();
  }

  attract(dt) {
    this.cam.orbit += dt * 0.05;
    const r = this.world.half * 0.55;
    this.camera.position.set(Math.cos(this.cam.orbit) * r, 45, Math.sin(this.cam.orbit) * r);
    this.camera.lookAt(0, 0, 0);
    this.loot.update(dt, this.camera.position);
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    if (p.alive && this.state === 'playing') this.controlPlayer(dt);
    else p.fireHeld = false;

    for (const a of this.actors) if (a.brain && a.alive) a.brain.update(dt);
    for (const a of this.actors) a.update(dt);

    this.playerEvents();

    // Pickups (a few times per second per actor)
    for (const a of this.actors) {
      if (!a.alive || a.mover.dropping) continue;
      a.pickupT -= dt;
      if (a.pickupT <= 0) {
        a.pickupT = 0.12;
        const s = this.loot.autoPickup(a);
        if (a === p) this.swapItem = s;
      }
    }
    if (p.alive && this.swapItem && !this.swapItem.taken) this.hud.prompt('Swap for ' + BR.CONFIG.weapons[this.swapItem.wid].name);
    else this.hud.prompt(null);

    // Zone
    this.zone.update(dt);
    const dps = this.zone.dps;
    for (const a of this.actors) {
      if (!a.alive || !this.zone.outside(a.pos)) continue;
      if (a.takeDamage(dps * dt, true)) this.kill(a, null, 'storm');
      else if (a === p) {
        this.zoneHurtT = (this.zoneHurtT || 0) - dt;
        if (this.zoneHurtT <= 0) { this.zoneHurtT = 1; BR.Audio.hurt(); }
      }
    }

    // Remove bodies after a while
    for (const a of this.actors) {
      if (!a.alive && a.mesh && a.mesh.parent && this.time - a.deathT > 4) this.scene.remove(a.mesh);
      else if (a.mesh && a.alive) a.mesh.visible = Math.abs(a.pos.x - this.camera.position.x) + Math.abs(a.pos.z - this.camera.position.z) < 260;
    }
    while (this.recentShots.length && this.time - this.recentShots[0].t > 2) this.recentShots.shift();

    this.loot.update(dt, this.camera.position);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.hud.update(this, dt);
    this.hud.fps(this.fpsVal, this.settings.showFps);

    // Match end
    if (this.state === 'playing') {
      if (!p.alive) { this.state = 'dead'; this.endT = BR.CONFIG.match.endDelay; }
      else if (this.aliveCount() === 1) {
        this.state = 'won'; this.endT = 1.6;
        this.result = { win: true, place: 1, total: this.total, kills: p.kills, damage: p.damageDealt, time: this.time };
        this.hud.toast('Victory!', 2000);
      }
    } else if (this.state === 'dead' || this.state === 'won') {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.state = 'end';
        this.input.unlock();
        this.hud.prompt(null);
        this.hud.showEnd(this.result);
      }
    }
  }

  controlPlayer(dt) {
    const p = this.player, inp = this.input, S = this.settings, L = BR.CONFIG.look;
    const [dx, dy] = inp.consumeLook();
    const w = p.weapon;
    const zoom = p.ads && w ? w.def.zoom : 1;
    let sens = L.touch * S.sens * (p.ads ? L.adsMult : 1) / Math.sqrt(zoom);
    const touch = inp.usingTouch;
    const target = touch && S.assist ? this.findAssistTarget() : null;
    if (target) sens *= 1 - L.aimAssist * 0.6;
    p.yaw -= dx * sens;
    p.pitch = BR.util.clamp(p.pitch - dy * sens, -1.45, 1.45);

    p.input.mx = inp.moveX;
    p.input.mz = inp.moveY;
    if (inp.consume('jump')) p.input.jump = true;
    if (inp.consume('slide')) p.input.slide = true;
    if (inp.consume('reload') && BR.Weapons.startReload(w, p)) BR.Audio.reload();
    const sw = i => { if (p.switchTo(i)) { inp.ads = false; this.cam.switchT = 0.25; } };
    if (inp.consume('swap')) sw(1 - p.cur);
    if (inp.consume('slot0')) sw(0);
    if (inp.consume('slot1')) sw(1);
    if (inp.consume('interact') && this.swapItem && !this.swapItem.taken) { this.loot.swap(p, this.swapItem); this.swapItem = null; this.cam.switchT = 0.25; }
    if (inp.consume('pause')) this.pause();
    p.ads = inp.ads && !!w && !p.mover.dropping;

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
    if (S.autoFire && touch && w && !fire) {
      const e = p.eye(this._v1), d = p.aimDir(this._v2);
      const h = this.hitscan(p, e, d, w.def.range * 1.6);
      if (h.actor) fire = true;
    }
    p.fireHeld = fire && !p.mover.dropping;
  }

  findAssistTarget() {
    const p = this.player, e = p.eye(this._v5), d = p.aimDir(this._v6);
    let best = null, bestA = 0.1;
    for (const a of this.actors) {
      if (a === p || !a.alive) continue;
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
    const ev = this.player.mover.events, m = this.player.mover;
    if (!this.player.alive) return;
    if (ev.jump || ev.walljump) BR.Audio.jump();
    if (ev.land) { BR.Audio.land(m.landSpeed); this.cam.kick = Math.min(0.3, m.landSpeed * 0.018); }
    if (ev.slide) BR.Audio.slide();
    if (ev.wallrun) BR.Audio.wallrun();
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
      const m = a.mover;
      const cx = m.pos.x, cy = m.pos.y + m.h * 0.5, cz = m.pos.z;
      const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
      const tc = lx * d.x + ly * d.y + lz * d.z;
      if (tc < -1 || tc > best + 1) continue;
      if (lx * lx + ly * ly + lz * lz - tc * tc > 4.8) continue;
      const th = U.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, m.pos.y + m.h - 0.2, cz, 0.24, best);
      if (th < best) { best = th; actor = a; head = true; }
      box.x0 = cx - 0.34; box.x1 = cx + 0.34; box.z0 = cz - 0.34; box.z1 = cz + 0.34;
      box.y0 = m.pos.y; box.y1 = m.pos.y + m.h - 0.4;
      const tb = U.rayAABB(o.x, o.y, o.z, ix, iy, iz, box, best);
      if (tb < best) { best = tb; actor = a; head = false; }
    }
    const r = this._hit || (this._hit = {});
    r.t = best; r.actor = actor; r.head = head;
    return r;
  }

  muzzlePoint(a, out) {
    if (a.isPlayer) {
      out.set(0.2 * this.vmScale, -0.16, -0.75);
      return this.camera.localToWorld(out);
    }
    const s = Math.sin(a.yaw), c = Math.cos(a.yaw), m = a.mover;
    return out.set(m.pos.x + c * 0.26 - s * 0.72, m.pos.y + m.h - 0.62, m.pos.z - s * 0.26 - c * 0.72);
  }

  applyDamage(victim, attacker, dmg, head, at, weaponId) {
    if (!victim.alive) return;
    if (victim.isPlayer && attacker && !attacker.isPlayer) dmg *= this.diff.playerDamageMult;
    else if (!victim.isPlayer && attacker && !attacker.isPlayer) dmg *= BR.CONFIG.match.botVsBotDamage;
    const died = victim.takeDamage(dmg);
    if (attacker) attacker.damageDealt += dmg;
    victim.lastAttacker = attacker;
    victim.lastHurtT = this.time;
    this._v3.set(at.x, at.y, at.z);
    this.fx.impact(this._v3, true);
    victim.flash();
    if (attacker === this.player) {
      this.hud.hitmarker(head, died);
      this.hud.damageNumber(this._v3, dmg, head);
      BR.Audio.hit(head);
    }
    if (victim === this.player) {
      this.hud.damageFrom(attacker);
      BR.Audio.hurt();
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* optional */ }
    }
    if (victim.brain) victim.brain.onDamaged(attacker);
    if (died) this.kill(victim, attacker, weaponId, head);
  }

  kill(victim, killer, weaponId, head) {
    victim.alive = false;
    victim.health = 0;
    victim.deathT = this.time;
    victim.fireHeld = false;
    if (killer) killer.kills++;
    this.loot.dropAll(victim);
    victim.dieVisual();
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nm = a => `<b class="${a.isPlayer ? 'me' : ''}">${esc(a.name)}</b>`;
    const how = weaponId === 'storm' ? 'storm' : (BR.CONFIG.weapons[weaponId] ? BR.CONFIG.weapons[weaponId].name : '') + (head ? ' ✕' : '');
    this.hud.killfeed(killer ? `${nm(killer)} <i>${esc(how)}</i> ${nm(victim)}` : `${nm(victim)} <i>${esc(how)}</i>`);
    if (killer === this.player) { BR.Audio.kill(); this.hud.toast('Eliminated ' + victim.name, 1400); }
    if (victim === this.player) {
      this.deathPos = victim.pos.clone();
      this.killer = killer;
      this.result = {
        win: false, place: this.aliveCount() + 1, total: this.total, kills: victim.kills,
        damage: victim.damageDealt, time: this.time,
        by: killer ? 'Eliminated by ' + killer.name : 'Lost to the storm',
      };
    }
  }

  onShot(actor, w) {
    const cp = this.camera.position;
    const dx = actor.pos.x - cp.x, dz = actor.pos.z - cp.z;
    const dist = actor.isPlayer ? 0 : Math.hypot(dx, dz);
    let pan = 0;
    if (!actor.isPlayer && dist > 0.1) {
      const p = this.player;
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      pan = BR.util.clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.8;
    }
    if (dist < 150) BR.Audio.shot(w.id, dist, pan);
    if (actor.isPlayer) { this.cam.vmKick = Math.min(0.12, this.cam.vmKick + w.def.recoil * 2 + 0.02); this.cam.flashT = 0.05; }
    else {
      if (dist < 90) this.fx.flash(this.muzzlePoint(actor, this._v4));
      this.recentShots.push({ x: actor.pos.x, z: actor.pos.z, t: this.time });
    }
    // Bots hear gunfire
    for (const a of this.actors) {
      if (!a.brain || !a.alive || a === actor) continue;
      if (Math.abs(a.pos.x - actor.pos.x) + Math.abs(a.pos.z - actor.pos.z) < 80) a.brain.onHeard(actor);
    }
  }

  onPickup(actor, item) {
    if (actor !== this.player) return;
    BR.Audio.pickup();
    const C = BR.CONFIG;
    let label = '';
    if (item.kind === 'weapon') { label = C.weapons[item.wid].name; this.cam.switchT = 0.25; }
    else if (item.kind === 'ammo') label = `+${item.amount} ${item.ammoType} ammo`;
    else if (item.kind === 'heal') label = `+${item.amount} health`;
    else label = `+${item.amount} shield`;
    this.hud.toast(label, 1000);
  }

  onZoneShrink() {
    if (this.state !== 'playing') return;
    this.hud.toast('The storm is closing in', 2200);
    BR.Audio.zone();
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const p = this.player, m = p.mover, cam = this.camera, C = BR.CONFIG, U = BR.util;
    const c = this.cam;
    if (!p.alive) {
      // Death cam: drift up and orbit the spot where you went down
      c.orbit += dt * 0.35;
      const dp = this.deathPos || p.pos;
      const tx = dp.x + Math.cos(c.orbit) * 7, tz = dp.z + Math.sin(c.orbit) * 7;
      cam.position.x = U.damp(cam.position.x, tx, 3, dt);
      cam.position.y = U.damp(cam.position.y, dp.y + 5, 3, dt);
      cam.position.z = U.damp(cam.position.z, tz, 3, dt);
      cam.lookAt(dp.x, dp.y + 0.5, dp.z);
      this.vmGroup.visible = false;
      return;
    }
    c.off = U.damp(c.off, m.h - C.actor.eyeFromTop, 14, dt);
    c.kick = U.damp(c.kick, 0, 9, dt);
    const sp = m.speedH;
    if (m.onGround && !m.sliding) c.bob += dt * sp * 1.35;
    const bobY = m.onGround && !m.sliding ? Math.abs(Math.sin(c.bob)) * Math.min(sp, 9) * 0.006 : 0;
    cam.position.set(m.pos.x, m.pos.y + c.off - c.kick + bobY, m.pos.z);

    const right = Math.cos(p.yaw) * m.wallN.x - Math.sin(p.yaw) * m.wallN.z;
    const rollT = m.wallRunning ? -right * C.camera.wallRunRoll : m.sliding ? 0.04 : 0;
    c.roll = U.damp(c.roll, rollT, 8, dt);
    cam.rotation.set(p.pitch, p.yaw, c.roll);

    const w = p.weapon;
    const zoom = p.ads && w ? w.def.zoom : 1;
    const speedK = U.clamp((sp - C.move.runSpeed) / 8, 0, 1);
    const fovT = (C.camera.fov + C.camera.fovSpeedBoost * speedK) / zoom;
    c.fov = U.damp(c.fov, fovT, 10, dt);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }

    this.updateViewmodel(dt);
  }

  // ------------------------------------------------------------- viewmodel
  buildViewmodels() {
    const g = new THREE.Group();
    this.vmScene.add(g);
    this.vmGroup = g;
    const models = {};
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
    for (const id in BR.CONFIG.weapons) {
      const def = BR.CONFIG.weapons[id];
      const m = new THREE.Group();
      const body = new THREE.MeshLambertMaterial({ color: def.color });
      const L = def.len;
      const recv = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, L * 0.6), body); recv.position.z = -L * 0.2;
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, L * 0.55), dark); barrel.position.set(0, 0.02, -L * 0.7);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), dark); grip.position.set(0, -0.1, 0.02); grip.rotation.x = 0.25;
      m.add(recv, barrel, grip);
      if (id !== 'pistol') {
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), dark); mag.position.set(0, -0.1, -L * 0.3);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.2), body); stock.position.set(0, -0.02, 0.18);
        m.add(mag, stock);
      }
      if (def.scope) {
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8), dark); sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.09, -L * 0.2);
        m.add(sc);
      }
      const flash = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      flash.position.set(0, 0.02, -L * 0.98 - 0.05);
      flash.rotation.z = Math.PI / 4;
      flash.visible = false;
      m.add(flash);
      m.userData.flash = flash;
      m.visible = false;
      g.add(m);
      models[id] = m;
    }
    return models;
  }

  updateViewmodel(dt) {
    const p = this.player, c = this.cam, U = BR.util, m = p.mover;
    const w = p.weapon;
    for (const id in this.vm) this.vm[id].visible = false;
    if (!w || m.dropping || (p.ads && w.def.scope)) { this.vmGroup.visible = false; return; }
    this.vmGroup.visible = true;
    const model = this.vm[w.id];
    model.visible = true;
    const [ldx, ldy] = [this.input.lookDX, this.input.lookDY];
    c.swayX = U.damp(c.swayX, U.clamp(-ldx * 0.0015, -0.05, 0.05), 10, dt);
    c.swayY = U.damp(c.swayY, U.clamp(ldy * 0.0015, -0.05, 0.05), 10, dt);
    c.vmKick = U.damp(c.vmKick, 0, 14, dt);
    c.switchT = Math.max(0, c.switchT - dt);
    c.flashT -= dt;
    model.userData.flash.visible = c.flashT > 0;
    const sp = Math.min(m.speedH, 10);
    const bx = m.onGround ? Math.sin(c.bob) * sp * 0.0022 : 0;
    const by = m.onGround ? Math.abs(Math.cos(c.bob)) * sp * 0.002 : 0;
    const ads = p.ads ? 1 : 0;
    c.ads = U.damp(c.ads || 0, ads, 14, dt);
    const s = this.vmScale;
    const g = this.vmGroup;
    g.position.set(
      U.lerp(0.24 * s, 0, c.ads) + bx + c.swayX,
      U.lerp(-0.25, -0.13, c.ads) - by + c.swayY - c.switchT * 1.2 - (m.sliding ? 0.03 : 0),
      U.lerp(-0.62, -0.42, c.ads) + c.vmKick
    );
    let rx = c.vmKick * 2.2;
    if (w.reloadT > 0) rx -= Math.sin((1 - w.reloadT / w.def.reload) * Math.PI) * 0.9;
    g.rotation.set(rx, 0, m.sliding ? 0.35 : m.wallRunning ? 0.15 : 0);
    g.scale.setScalar(s);
  }

  render() {
    if (!this.scene) return;
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'won' || this.state === 'paused') && this.player && this.player.alive) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }
};
