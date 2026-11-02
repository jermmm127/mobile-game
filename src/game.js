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
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    const C = BR.CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(this.baseFov(), 1, C.near, C.far);
    this.camera.rotation.order = 'YXZ';
    // Viewmodel (your gun) is drawn in its own scene so it never clips into walls
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x6b6250, 0.85));
    const vd = new THREE.DirectionalLight(0xffffff, 0.75); vd.position.set(1, 2, 1.5); this.vmScene.add(vd);
    this.vmGroup = new THREE.Group();
    this.vmScene.add(this.vmGroup);
    this.vm = {};
    this.refreshCosmetics();
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

  baseFov() { return this.settings.fov || BR.CONFIG.camera.fov; }

  applyGraphics() {
    const g = BR.CONFIG.graphics[this.settings.gfx] || BR.CONFIG.graphics.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatio));
    this.fogFar = g.fogFar;
    this.detail = g.detail;
    if (this.scene && this.scene.fog) this.scene.fog.far = g.fogFar;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    for (const c of [this.camera, this.vmCamera, this.shopCam]) { if (!c) continue; c.aspect = w / h; c.updateProjectionMatrix(); }
    this.vmScale = w < h ? 0.6 : 1;   // keep the gun from filling a portrait screen
  }

  // ------------------------------------------------------------ scene setup
  buildScene(seed, demo) {
    if (this.scene) this.disposeScene();
    const fogCol = 0xc4dbe9;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(fogCol);
    this.scene.fog = new THREE.Fog(fogCol, 50, this.fogFar || 230);
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a5242, 0.8));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.8);
    sun.position.set(0.6, 1, 0.35);
    this.scene.add(sun);
    this.world = new BR.World(seed);
    this.world.buildMeshes(this.scene, this.detail);
    this.hud.setStaticMap(this.world.renderMinimap(256));
    this.fx = new BR.Effects(this.scene);
    this.loot = new BR.Loot(this);
    this.loot.spawnFromWorld(this.world);
    this.zone = new BR.Zone(this, this.world);
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
    a.mover.dropping = true;
    a.giveWeapon('pistol', 12);
    a.ammo.light = 24;
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
  startDemo() {
    this.buildScene(Math.floor(Math.random() * 1e9), true);
    this.diff = BR.CONFIG.difficulty.normal;
    this.practice = false;
    this.addBots(BR.CONFIG.match.demoBots, this.diff);
    this.camera.fov = 62; this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 90, 120); this.camera.lookAt(0, 0, 0);
  }

  // ------------------------------------------------------------------ match
  startMatch() {
    const S = this.settings, C = BR.CONFIG;
    this.buildScene(Math.floor(Math.random() * 1e9), false);
    this.diff = C.difficulty[S.difficulty] || C.difficulty.normal;
    this.result = null;
    this.player = new BR.Actor(this, { id: 0, name: 'You', isPlayer: true });
    this.spawn(this.player);
    this.player.yaw = Math.atan2(this.player.pos.x, this.player.pos.z); // face map center
    this.player.pitch = -0.75;                                           // look down at the landing area
    this.actors.push(this.player);
    const bots = Math.max(0, Math.min(29, S.bots ?? C.match.defaultBots));
    this.practice = bots === 0;
    this.addBots(bots, this.diff);
    this.zone.mesh.visible = !this.practice;
    this.total = this.actors.length;
    this.swapItem = null;
    this.lastWeapon = null;
    this.input.reset();
    this.state = 'playing';
    this.cam.off = C.actor.standHeight - C.actor.eyeFromTop;
    this.cam.fov = this.baseFov();
    this.hud.show('menu', false);
    this.hud.show('end', false);
    this.hud.show('pause', false);
    this.hud.show('play', true);
    this.hud.toast(this.practice ? 'Practice mode: no bots, no storm' : 'Skydive! Steer to a landing spot', 2600);
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
    this.startDemo();
    BR.updateCoins();
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
    else if (this.state === 'menu') this.updateDemo(dt);
    else if (this.state === 'shop') this.updateShop(dt);
    this.render();
  }

  // Everything that happens in the world, with or without a player.
  simulate(dt) {
    this.time += dt;
    for (const a of this.actors) if (a.brain && a.alive) a.brain.update(dt);
    for (const a of this.actors) a.update(dt);
    for (const a of this.actors) {
      if (!a.alive || a.mover.dropping) continue;
      a.pickupT -= dt;
      if (a.pickupT <= 0) {
        a.pickupT = 0.12;
        const s = this.loot.autoPickup(a);
        if (a === this.player) this.swapItem = s;
      }
    }
    if (!this.practice) {
      this.zone.update(dt);
      const dps = this.zone.dps;
      for (const a of this.actors) {
        if (!a.alive || !this.zone.outside(a.pos)) continue;
        if (a.takeDamage(dps * dt, true)) this.kill(a, null, 'storm');
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
    while (this.recentShots.length && this.time - this.recentShots[0].t > 2) this.recentShots.shift();
    this.loot.update(dt, cp);
    this.fx.update(dt);
  }

  update(dt) {
    const p = this.player;
    if (p.alive && this.state === 'playing') this.controlPlayer(dt);
    else p.fireHeld = false;
    this.simulate(dt);
    this.playerEvents();

    this.chest = p.alive && !p.mover.dropping ? this.loot.nearestChest(p, 2.2) : null;
    if (this.chest) this.hud.prompt('Open chest');
    else if (p.alive && this.swapItem && !this.swapItem.taken) this.hud.prompt('Swap for ' + BR.CONFIG.weapons[this.swapItem.wid].name);
    else this.hud.prompt(null);

    // Grapple rope
    if (p.mover.grapple) this.fx.rope(this.muzzlePoint(p, this._v4), p.mover.grapple);
    else this.fx.rope(null);

    this.updateCamera(dt);
    this.hud.update(this, dt);
    this.hud.fps(this.fpsVal, this.settings.showFps);

    // Match end
    if (this.state === 'playing') {
      if (!p.alive) { this.state = 'dead'; this.endT = BR.CONFIG.match.endDelay; }
      else if (!this.practice && this.aliveCount() === 1) {
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
        this.fx.rope(null);
        if (!this.practice) this.result.coins = BR.Profile.award(this.result);
        this.hud.showEnd(this.result);
        BR.updateCoins();
      }
    }
  }

  controlPlayer(dt) {
    const p = this.player, inp = this.input, S = this.settings, L = BR.CONFIG.look;
    const [dx, dy] = inp.consumeLook();
    this.lookD = [dx, dy];
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
    if (inp.consume('crouch')) p.input.crouch = true;
    if (inp.consume('grapple')) { if (p.tryGrapple()) BR.Audio.grapple(); else BR.Audio.click(); }
    if (inp.consume('reload') && BR.Weapons.startReload(w, p)) BR.Audio.reload();
    const sw = i => { if (i === p.cur) this.startInspect(); else if (p.switchTo(i)) inp.ads = false; };
    if (inp.consume('swap')) {
      // cycle: gun -> other gun -> karambit -> ...
      const order = [0, 1, 2], start = order.indexOf(p.cur);
      for (let k = 1; k <= 3; k++) { const i = order[(start + k) % 3]; if (p.slots[i]) { sw(i); break; } }
    }
    if (inp.consume('slot0')) sw(0);
    if (inp.consume('slot1')) sw(1);
    if (inp.consume('slot2')) sw(2);
    if (inp.consume('inspect')) this.startInspect();
    if (inp.consume('interact')) {
      if (this.chest && !this.chest.taken) { this.loot.openChest(p, this.chest); this.chest = null; }
      else if (this.swapItem && !this.swapItem.taken) { this.loot.swap(p, this.swapItem); this.swapItem = null; }
    }
    if (inp.consume('pause')) this.pause();
    p.ads = inp.ads && !!w && !w.def.melee && !p.mover.dropping;
    if (p.ads) this.cam.inspectT = 0;

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
      if (h.actor) fire = true;
    }
    p.fireHeld = fire && !p.mover.dropping;
    if (fire) this.cam.inspectT = 0;
  }

  startInspect() {
    const w = this.player && this.player.weapon;
    if (!w || this.player.ads) return;
    this.cam.inspectDur = this.cam.inspectT = w.def.melee ? 2.4 : 2.0;
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
    const p = this.player, ev = p.mover.events, m = p.mover;
    if (!p.alive) return;
    if (ev.jump || ev.walljump) BR.Audio.jump();
    if (ev.land) { BR.Audio.land(m.landSpeed); this.cam.kick = Math.min(0.3, m.landSpeed * 0.018); }
    if (ev.slide) BR.Audio.slide();
    if (ev.wallrun) BR.Audio.wallrun();
    if (ev.pad) { BR.Audio.pad(); this.cam.shake = Math.max(this.cam.shake, 0.15); }
    if (ev.tech) { this.hud.tech(ev.tech); BR.Audio.tech(); }
  }

  onChestOpened(actor, chest) {
    const d = Math.hypot(actor.pos.x - this.camera.position.x, actor.pos.z - this.camera.position.z);
    if (d < 40) BR.Audio.chest(d);
    if (actor === this.player) this.hud.toast('Chest opened', 900);
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

  tracerColor(actor) {
    if (!actor.isPlayer) return 0xff9a6b;
    return BR.Models.tracerColor(BR.Profile.data.equip.tracers, this.time);
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
    if (attacker && attacker === this.player) {
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
    if (victim.mover.grapple) victim.mover.releaseGrapple();
    if (killer) killer.kills++;
    this.loot.dropAll(victim);
    victim.dieVisual();
    if (this.demo) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nm = a => `<b class="${a.isPlayer ? 'me' : ''}">${esc(a.name)}</b>`;
    const how = weaponId === 'storm' ? 'storm' : (BR.CONFIG.weapons[weaponId] ? BR.CONFIG.weapons[weaponId].name : '') + (head ? ' ✕' : '');
    this.hud.killfeed(killer ? `${nm(killer)} <i>${esc(how)}</i> ${nm(victim)}` : `${nm(victim)} <i>${esc(how)}</i>`);
    if (killer && killer === this.player) {
      BR.Audio.kill();
      this.hud.toast(`Eliminated ${victim.name}  +${BR.CONFIG.coins.perKill} ◉`, 1400);
    }
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
    if (!actor.isPlayer && dist > 0.1 && this.player) {
      const p = this.player;
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      pan = BR.util.clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.8;
    }
    if (dist < 150 && !this.demo) BR.Audio.shot(w.id, dist, pan, !!w.def.suppressed);
    if (actor.isPlayer) {
      this.cam.vmKick = Math.min(0.14, this.cam.vmKick + w.def.recoil * 2 + 0.02);
      this.cam.flashT = w.def.suppressed ? 0.02 : 0.05;
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
    this.cam.swingT = 0.32;
    this.cam.inspectT = 0;
    BR.Audio.swish(hit);
  }

  onShellLoaded() { this.cam.shellT = 0.18; BR.Audio.reload(); }

  onPickup(actor, item) {
    if (actor !== this.player) return;
    BR.Audio.pickup();
    const C = BR.CONFIG;
    let label = '';
    if (item.kind === 'weapon') label = C.weapons[item.wid].name;
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
    const k = new THREE.DirectionalLight(0xffe2b0, 0.9); k.position.set(2, 3, 2); s.add(k);
    const r = new THREE.DirectionalLight(0x6fb8ff, 0.6); r.position.set(-3, 1, -2); s.add(r);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.08, 40), new THREE.MeshPhongMaterial({ color: 0x1c2027, specular: 0x444444 }));
    floor.position.y = -0.55; this.shopFloor = floor; s.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.015, 6, 60), new THREE.MeshBasicMaterial({ color: 0xffa31a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.5; floor.add(ring); ring.position.y = 0.05;
    this.shopScene = s;
    this.shopCam = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
    this.shopCam.position.set(0, 0.35, 3.6);
    this.shopCam.lookAt(0, 0, 0);
    this.shopPivot = new THREE.Group();
    s.add(this.shopPivot);
    this.shopTracers = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
      l.visible = false; s.add(l);
      this.shopTracers.push({ l, t: 9 });
    }
  }

  openShop() { this.prevState = this.state; this.state = 'shop'; this.resize(); }
  closeShop() { this.state = this.prevState || 'menu'; }

  setShopPreview(p) {
    this.shopPrev = p;
    while (this.shopPivot.children.length) this.shopPivot.remove(this.shopPivot.children[0]);
    const g = BR.Models.weapon('holoar', p.skin, p.charm);
    g.scale.setScalar(1.6);
    g.rotation.y = Math.PI / 2;
    g.position.set(0.0, -0.05, -0.15);
    this.shopPivot.add(g);
    this.shopGun = g;
  }

  updateShop(dt) {
    this.time += dt;
    // Keep the gun in the open part of the screen (left of the panel, or above it in portrait)
    const land = window.innerWidth >= window.innerHeight;
    // center of the visible area, in world units at the gun's distance
    const panelFrac = land ? Math.min(470, window.innerWidth * 0.56) / window.innerWidth : 0;
    const halfW = 3.6 * Math.tan(this.shopCam.fov * Math.PI / 360) * this.shopCam.aspect;
    this.shopPivot.position.x = -panelFrac * halfW;
    this.shopBaseY = land ? 0 : 0.45;
    this.shopPivot.rotation.y += dt * 0.5;
    this.shopPivot.position.y = this.shopBaseY + Math.sin(this.time * 1.4) * 0.03;
    const ch = this.shopGun && this.shopGun.userData.charmObj;
    if (ch) ch.rotation.z = Math.sin(this.time * 3) * 0.4;
    // Tracer preview: streaks flying past the gun
    this.shopFloor.position.x = this.shopPivot.position.x; this.shopFloor.position.y = this.shopBaseY - 0.55;
    const show = this.shopPrev && this.shopPrev.showTracer;
    for (let i = 0; i < this.shopTracers.length; i++) {
      const T = this.shopTracers[i];
      T.t += dt;
      if (show && T.t > 0.9 + i * 0.13) {
        T.t = 0; T.y = -0.35 + Math.random() * 0.8; T.z = -0.6 + Math.random() * 0.4;
        T.l.material.color.setHex(BR.Models.tracerColor(this.shopPrev.tracer, this.time + i * 0.15));
      }
      T.l.visible = show && T.t < 0.35;
      if (T.l.visible) {
        const a = T.l.geometry.attributes.position.array, x = -2 + T.t / 0.35 * 4.5;
        a[0] = x - 1.2; a[1] = T.y; a[2] = T.z; a[3] = x; a[4] = T.y; a[5] = T.z;
        T.l.geometry.attributes.position.needsUpdate = true;
        T.l.material.opacity = 1 - T.t / 0.35;
      }
    }
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
    c.shake = Math.max(0, c.shake - dt * 1.2);
    const sp = m.speedH;
    if (m.onGround && !m.sliding) c.bob += dt * sp * 1.35;
    const bobY = m.onGround && !m.sliding ? Math.abs(Math.sin(c.bob)) * Math.min(sp, 9) * 0.006 : 0;
    const sh = c.shake * c.shake;
    cam.position.set(m.pos.x + (Math.random() - 0.5) * sh, m.pos.y + c.off - c.kick + bobY + (Math.random() - 0.5) * sh, m.pos.z + (Math.random() - 0.5) * sh);

    const right = Math.cos(p.yaw) * m.wallN.x - Math.sin(p.yaw) * m.wallN.z;
    const rollT = m.wallRunning ? -right * C.camera.wallRunRoll : m.sliding ? 0.05 : 0;
    c.roll = U.damp(c.roll, rollT, 8, dt);
    cam.rotation.set(p.pitch, p.yaw, c.roll);

    const w = p.weapon;
    const zoom = p.ads && w ? w.def.zoom : 1;
    const speedK = U.clamp((sp - C.move.runSpeed) / 8, 0, 1);
    const fovT = (this.baseFov() + C.camera.fovSpeedBoost * speedK) / zoom;
    c.fov = U.damp(c.fov, fovT, 10, dt);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }

    this.updateViewmodel(dt);
  }

  // ------------------------------------------------------------- viewmodel
  // (Re)build viewmodels with the equipped skin + charm.
  refreshCosmetics() {
    const eq = BR.Profile.data.equip;
    while (this.vmGroup.children.length) this.vmGroup.remove(this.vmGroup.children[0]);
    this.vm = {};
    for (const id in BR.CONFIG.weapons) {
      const m = BR.Models.weapon(id, eq.skins, id === 'knife' ? 'none' : eq.charms);
      m.visible = false;
      if (id === 'knife') { m.rotation.set(0.15, 0.25, -0.5); m.scale.setScalar(1.35); }
      const holder = new THREE.Group();
      holder.add(m);
      holder.userData = m.userData;
      holder.visible = false;
      this.vmGroup.add(holder);
      m.visible = true;
      this.vm[id] = holder;
    }
  }

  updateViewmodel(dt) {
    const p = this.player, c = this.cam, U = BR.util, m = p.mover;
    const w = p.weapon;
    for (const id in this.vm) this.vm[id].visible = false;
    if (!w || m.dropping || (p.ads && w.def.scope)) { this.vmGroup.visible = false; return; }
    this.vmGroup.visible = true;
    const model = this.vm[w.id];
    model.visible = true;
    // Pull-out animation whenever the held weapon changes
    if (w !== this.lastWeapon) {
      this.lastWeapon = w;
      c.drawDur = c.drawT = w.def.melee ? 0.55 : 0.38;
      c.inspectT = 0;
      if (w.def.melee) BR.Audio.unsheathe(); else BR.Audio.reload();
    }
    const [ldx, ldy] = this.lookD || [0, 0];
    c.swayX = U.damp(c.swayX, U.clamp(-ldx * 0.0015, -0.05, 0.05), 10, dt);
    c.swayY = U.damp(c.swayY, U.clamp(ldy * 0.0015, -0.05, 0.05), 10, dt);
    c.vmKick = U.damp(c.vmKick, 0, 14, dt);
    c.drawT = Math.max(0, c.drawT - dt);
    c.inspectT = Math.max(0, c.inspectT - dt);
    c.swingT = Math.max(0, c.swingT - dt);
    c.shellT = Math.max(0, c.shellT - dt);
    c.flashT -= dt;
    model.userData.flash.visible = c.flashT > 0;
    const sp = Math.min(m.speedH, 10);
    const bx = m.onGround ? Math.sin(c.bob) * sp * 0.0022 : 0;
    const by = m.onGround ? Math.abs(Math.cos(c.bob)) * sp * 0.002 : 0;
    c.ads = U.damp(c.ads, p.ads ? 1 : 0, 14, dt);
    const s = this.vmScale;
    const g = this.vmGroup;

    // Base pose (hip) and ADS pose. Holo sights line the reticle up with screen center.
    let hx = 0.24 * s, hy = -0.26, hz = -0.74, ax = 0, ay = -0.13, az = -0.5;
    if (w.def.melee) { hx = 0.17 * s; hy = -0.15; hz = -0.36; }
    if (w.def.holo && model.userData.sight) { const sg = model.userData.sight.position; ax = -sg.x; ay = -sg.y; az = -0.44 - sg.z; }
    let px = U.lerp(hx, ax, c.ads) + bx + c.swayX;
    let py = U.lerp(hy, ay, c.ads) - by + c.swayY - (m.sliding ? 0.03 : 0) - (m.crouched ? 0.01 : 0);
    let pz = U.lerp(hz, az, c.ads) + c.vmKick;
    let rx = c.vmKick * 2.2, ry = 0, rz = m.sliding ? 0.35 : m.wallRunning ? 0.15 : 0;
    const ease = t => t * t * (3 - 2 * t);

    // Draw / pull-out
    if (c.drawT > 0) {
      const e = ease(1 - c.drawT / c.drawDur);
      if (w.def.melee) { rz += (1 - e) * -3.2; rx += (1 - e) * -1.1; py -= (1 - e) * 0.22; px += (1 - e) * 0.08; }
      else { rx += (1 - e) * -0.9; py -= (1 - e) * 0.3; }
    }
    // Inspect: karambit twirl around the finger ring, guns turn to show the side
    if (c.inspectT > 0) {
      const t = 1 - c.inspectT / c.inspectDur;
      if (w.def.melee) {
        const spinP = U.clamp(t / 0.45, 0, 1);
        rx += ease(spinP) * Math.PI * 4;                       // two full spins
        const show = U.clamp((t - 0.45) / 0.55, 0, 1), sh = Math.sin(show * Math.PI);
        ry += sh * 1.1; rz += sh * 0.6; px -= sh * 0.12; py += sh * 0.06;
      } else {
        const sh = Math.sin(ease(t) * Math.PI);
        ry += sh * 0.9; rz += sh * 0.35; px -= sh * 0.14; py += sh * 0.05;
        rx += Math.sin(t * Math.PI * 2) * 0.12;
      }
    }
    // Karambit slash
    if (c.swingT > 0) {
      const t = 1 - c.swingT / 0.32, a = Math.sin(t * Math.PI);
      px -= a * 0.2; py += a * 0.05 - t * 0.04; rz += a * 1.0; ry += a * 0.7; rx -= a * 0.6;
    }
    // Reloads
    if (w.reloadT > 0) {
      if (w.def.shellReload) { rz += 0.45; rx -= 0.25; py -= 0.03; }
      else rx -= Math.sin((1 - w.reloadT / w.def.reload) * Math.PI) * 0.9;
    }
    if (c.shellT > 0) py -= Math.sin(c.shellT / 0.18 * Math.PI) * 0.025;

    g.position.set(px, py, pz);
    g.rotation.set(rx, ry, rz);
    g.scale.setScalar(s);

    // Charm swings from look + movement
    const ch = model.userData.charmObj;
    if (ch) {
      const force = -ldx * 0.02 + p.input.mx * 0.4 - c.vmKick * 8;
      c.charmV += (-55 * c.charmA - 5 * c.charmV + force * 30) * dt;
      c.charmA += c.charmV * dt;
      ch.rotation.z = U.clamp(c.charmA, -1.2, 1.2);
      ch.rotation.x = U.clamp(c.charmA * 0.4 + by * 6, -0.8, 0.8);
    }
  }

  render() {
    const r = this.renderer;
    r.clear();
    if (this.state === 'shop') { r.render(this.shopScene, this.shopCam); return; }
    if (!this.scene) return;
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'won' || this.state === 'paused') && this.player && this.player.alive) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }
};
