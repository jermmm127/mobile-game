'use strict';
// =============================================================================
// OVERDRIVE (v1.10) — a roguelike survivor mode (in the spirit of the "swarm survivor"
// games): you vs an endless, growing swarm on the Crucible arena.
//  * Enemies are light objects (not actors): mites (fast), brutes (tanky), wisps (keep
//    their distance and spit orbs), chargers (dash at you), golden elites every minute, and
//    a boss every 3 minutes. The final boss, THE OVERLORD, comes at 10:00 — kill it to win.
//  * Kills drop XP gems; a magnet pulls them in. Level up -> the run pauses and you pick
//    1 of 3 upgrades: POWERS that fire on their own (Orbit Blades, Arc Lightning, Nova Pulse,
//    Seeker Drones, Flame Trail, Frost Field; 4 slots, 5 levels) or PASSIVES (Power, Haste,
//    Rapid, Magnet, Vitality, Armor, Greed, Luck, Big Gun; 4 slots, 5 levels).
//  * Treasure chests appear with a beam every ~70 s: walk up and open one for a free level.
//  * Your gun still matters: shoot the swarm yourself (infinite reserve ammo).
// =============================================================================
(function () {
  const $ = id => document.getElementById(id);
  const ENEMY = {
    mite:    { hp: 26, speed: 5.4, dmg: 6, r: 0.42, xp: 1, col: 0x7dff3a, eye: 0xff2a6a, score: 10 },
    brute:   { hp: 150, speed: 2.7, dmg: 15, r: 0.95, xp: 4, col: 0x8a4dff, eye: 0xffd24a, score: 40 },
    wisp:    { hp: 48, speed: 3.6, dmg: 9, r: 0.55, xp: 3, col: 0x45e0ff, eye: 0xffffff, score: 30, ranged: true, fly: 1.6 },
    charger: { hp: 80, speed: 3.4, dmg: 14, r: 0.7, xp: 3, col: 0xff7a1a, eye: 0xffffff, score: 30, dash: true },
    boss:    { hp: 2600, speed: 2.4, dmg: 26, r: 2.2, xp: 60, col: 0xff2a6a, eye: 0xffffff, score: 1000, boss: true },
    overlord:{ hp: 9000, speed: 2.6, dmg: 34, r: 2.8, xp: 200, col: 0xffd24a, eye: 0xff2a2a, score: 5000, boss: true, final: true },
  };
  const POWERS = {
    orbit:  { name: 'Orbit Blades', icon: '✦', col: '#45e0ff', desc: L => `${L + 1} blades circle you, ${18 + L * 7} damage each touch` },
    arc:    { name: 'Arc Lightning', icon: 'ϟ', col: '#9fd8ff', desc: L => `Zaps the nearest enemy and chains to ${L + 1} more · ${30 + L * 12} damage` },
    nova:   { name: 'Nova Pulse', icon: '◎', col: '#ff5ec4', desc: L => `A shockwave every ${(3.6 - L * 0.35).toFixed(1)} s, ${5 + L} m wide · ${26 + L * 14} damage` },
    drones: { name: 'Seeker Drones', icon: '◆', col: '#ffd24a', desc: L => `${L} drone${L > 1 ? 's' : ''} shoot the closest enemy · ${16 + L * 6} damage` },
    flame:  { name: 'Flame Trail', icon: '🔥', col: '#ff7a1a', desc: L => `Leave fire as you run · ${22 + L * 10} damage / s` },
    frost:  { name: 'Frost Field', icon: '❄', col: '#bff4ff', desc: L => `Slows enemies near you by ${30 + L * 6}% · ${8 + L * 5} damage / s` },
  };
  const PASSIVES = {
    power:  { name: 'Power', icon: '▲', col: '#ff5a4a', desc: L => `+${L * 15}% damage (everything)` },
    haste:  { name: 'Haste', icon: '»', col: '#7dff3a', desc: L => `+${L * 8}% move speed` },
    rapid:  { name: 'Rapid', icon: '≡', col: '#ffd24a', desc: L => `+${L * 10}% fire rate, powers recharge ${L * 6}% faster` },
    magnet: { name: 'Magnet', icon: '∪', col: '#45e0ff', desc: L => `+${L * 40}% XP pickup range` },
    vital:  { name: 'Vitality', icon: '♥', col: '#ff5ec4', desc: L => `Heal 40 now, +${(L * 1.5).toFixed(1)} health / s` },
    armor:  { name: 'Armor', icon: '⬢', col: '#c8d0dc', desc: L => `−${L * 8}% damage taken` },
    greed:  { name: 'Greed', icon: '$', col: '#ffe14d', desc: L => `+${L * 15}% XP` },
    luck:   { name: 'Luck', icon: '♣', col: '#39ff88', desc: L => `${L * 8}% crit chance (double damage)` },
    biggun: { name: 'Big Gun', icon: '✚', col: '#a06bff', desc: L => `Gun: +${L * 20}% damage, +${L * 25}% magazine` },
  };
  const MAX_L = 5, SLOTS = 4, FINAL_T = 600;
  const need = L => Math.round(5 + L * 3.2 + Math.pow(L, 1.45));

  BR.Overdrive = class Overdrive {
    constructor(game) {
      this.g = game; this.cls = 'overdrive'; this.prompts = true;
      this.enemies = []; this.gems = []; this.shots = []; this.fires = []; this.chests = [];
      this.powers = {}; this.passives = {}; this.cd = {};
      this.t = 0; this.level = 1; this.xp = 0; this.kills = 0; this.score = 0; this.bossKills = 0; this.pendingLv = 0;
    }
    start() {
      const g = this.g, p = g.player, C = BR.CONFIG;
      g.scene.background = new THREE.Color(0x150f22); g.scene.fog.color.setHex(0x2a1638); g.scene.fog.near = 45; g.scene.fog.far = 190;
      BR.skyTint(g, { zen: 0x07030f, mid: 0x26103e, hor: 0xb02a6a, low: 0x120a1c, far: 0x2a1640 }, { sky: 0xd0a8ff, ground: 0x2a1a30, hemi: 0.95, sun: 0xffc8e8, sunI: 0.8 });
      p.mover.pos.set(0, 0.5, 6); p.yaw = 0; p.pitch = 0;
      p.slots[0] = BR.Weapons.create('smg'); p.slots[1] = null; p.cur = 0;
      for (const t in p.ammo) p.ammo[t] = C.ammoCap[t];
      this.root = new THREE.Group(); g.scene.add(this.root);
      this.sphere = new THREE.SphereGeometry(1, 14, 10); this.ico = new THREE.IcosahedronGeometry(1, 0); this.oct = new THREE.OctahedronGeometry(1, 0); this.box = new THREE.BoxGeometry(1, 1, 1); this.cone = new THREE.ConeGeometry(1, 1, 5);
      this.mats = {}; this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (const k in ENEMY) { const E = ENEMY[k]; this.mats[k] = new THREE.MeshPhongMaterial({ color: E.col, emissive: new THREE.Color(E.col).multiplyScalar(0.25), shininess: 50, specular: 0x666666 }); this.mats[k + 'eye'] = new THREE.MeshBasicMaterial({ color: E.eye }); }
      this.eliteMat = new THREE.MeshPhongMaterial({ color: 0xffd24a, emissive: 0x6a4a00, shininess: 120, specular: 0xffffff });
      this.gemMat = [0x45e0ff, 0x7dff3a, 0xff5ec4, 0xffd24a].map(c => new THREE.MeshBasicMaterial({ color: c }));
      this.bladeMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff }); this.droneMat = new THREE.MeshPhongMaterial({ color: 0xffd24a, emissive: 0x6a4a00, shininess: 100 });
      this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
      this.frostMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff5ec4, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.orbMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
      this.blades = []; this.drones = []; this.rings = [];
      this.frostMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.frostMat); this.frostMesh.rotation.x = -Math.PI / 2; this.frostMesh.visible = false; this.root.add(this.frostMesh);
      this.buildUI();
      this.spawnT = 0.5; this.eliteT = 60; this.bossT = 180; this.chestT = 45;
      this.addPower('orbit');                                                  // everyone starts with one power
      g.hud.toast('OVERDRIVE · Survive the swarm. Pick up XP gems to level up.', 3000);
      this.renderHud();
    }

    // ------------------------------------------------------------------ UI
    buildUI() {
      if (!$('od-hud')) {
        const h = document.createElement('div'); h.id = 'od-hud';
        h.innerHTML = `<div class="od-xp"><u id="od-xpf"></u><b id="od-lv">LV 1</b></div><div class="od-top"><span id="od-time">0:00</span><span class="od-k"><b id="od-kills">0</b> KILLS</span></div>
          <div class="od-boss hidden" id="od-boss"><b id="od-bossn">BOSS</b><div><u id="od-bossf"></u></div></div><div class="od-slots" id="od-slots"></div>`;
        $('play').appendChild(h);
        const m = document.createElement('div'); m.id = 'od-level'; m.className = 'overlay hidden';
        m.innerHTML = `<div class="od-lvpanel"><div class="od-lvt" id="od-lvt">LEVEL UP!</div><div class="od-lvs" id="od-lvs">Choose an upgrade</div><div class="od-cards" id="od-cards"></div><button class="mbtn sm" id="od-reroll">REROLL (1)</button></div>`;
        $('app').appendChild(m);
      }
      $('od-hud').classList.remove('hidden');
      $('od-cards').onclick = e => { const c = e.target.closest('[data-u]'); if (!c) return; this.pick(c.dataset.k, c.dataset.u); };
      $('od-reroll').onclick = () => { if (this.rerolls > 0) { this.rerolls--; this.offer(this.offerTitle); BR.Audio.click(); } };
      this.rerolls = 1;
    }
    renderHud() {
      const n = need(this.level);
      $('od-xpf').style.width = Math.min(100, this.xp / n * 100) + '%';
      $('od-lv').textContent = 'LV ' + this.level;
      $('od-time').textContent = BR.fmtTime(this.t);
      $('od-kills').textContent = this.kills;
      const cell = (k, d, L) => `<span class="od-slot" style="--c:${d.col}"><i>${d.icon}</i><b>${L}</b></span>`;
      $('od-slots').innerHTML = Object.entries(this.powers).map(([k, L]) => cell(k, POWERS[k], L)).join('') + '<em></em>' + Object.entries(this.passives).map(([k, L]) => cell(k, PASSIVES[k], L)).join('');
    }
    // level-up: pause and show 3 cards
    offer(title) {
      const g = this.g; this.offerTitle = title;
      const opts = [];
      for (const k in POWERS) { const L = this.powers[k] || 0; if (L < MAX_L && (L || Object.keys(this.powers).length < SLOTS)) opts.push(['p', k, L]); }
      for (const k in PASSIVES) { const L = this.passives[k] || 0; if (L < MAX_L && (L || Object.keys(this.passives).length < SLOTS)) opts.push(['s', k, L]); }
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      const pick = opts.slice(0, 3);
      if (!pick.length) pick.push(['h', 'heal', 0]);
      $('od-lvt').textContent = title || 'LEVEL UP!'; $('od-lvs').textContent = title ? 'Treasure! Take one' : 'Level ' + this.level + ' · choose an upgrade';
      $('od-cards').innerHTML = pick.map(([k, id, L]) => {
        if (k === 'h') return `<button class="od-card" data-k="h" data-u="heal" style="--c:#ff5ec4"><i>♥</i><b>Full Heal</b><span>Everything is maxed. Patch up.</span><em>BONUS</em></button>`;
        const D = k === 'p' ? POWERS[id] : PASSIVES[id];
        return `<button class="od-card${L ? '' : ' new'}" data-k="${k}" data-u="${id}" style="--c:${D.col}"><i>${D.icon}</i><b>${D.name}</b><span>${D.desc(L + 1)}</span><em>${L ? 'LV ' + L + ' → ' + (L + 1) : k === 'p' ? 'NEW POWER' : 'NEW PASSIVE'}</em></button>`;
      }).join('');
      $('od-reroll').textContent = `REROLL (${this.rerolls})`; $('od-reroll').disabled = this.rerolls <= 0;
      g.state = 'paused'; g.input.reset(); g.input.unlock();
      g.hud.show('od-level', true); BR.Audio.coin();
    }
    pick(k, id) {
      const g = this.g;
      if (k === 'p') this.addPower(id); else if (k === 's') this.addPassive(id); else g.player.health = BR.CONFIG.actor.maxHealth;
      g.hud.show('od-level', false); BR.Audio.pickup();
      this.renderHud();
      if (this.pendingLv > 0) { this.pendingLv--; this.offer(); return; }
      g.state = 'playing'; g.input.reset(); g.last = performance.now();
    }
    menu() {}                                                    // no spawn menu here (the pause menu has the locker)

    // ------------------------------------------------------------------ upgrades
    addPower(id) {
      const L = this.powers[id] = (this.powers[id] || 0) + 1;
      if (id === 'orbit') this.syncBlades();
      if (id === 'drones') this.syncDrones();
      if (id === 'frost') this.frostMesh.visible = true;
      return L;
    }
    addPassive(id) {
      const L = this.passives[id] = (this.passives[id] || 0) + 1, p = this.g.player;
      if (id === 'vital') p.health = Math.min(BR.CONFIG.actor.maxHealth, p.health + 40);
      if (id === 'haste') p.speedBoost = 1 + L * 0.08;
      if (id === 'rapid' || id === 'biggun') this.tuneGun();
      return L;
    }
    tuneGun() {
      const p = this.g.player, w = p.slots[0]; if (!w) return;
      const base = BR.CONFIG.weapons[w.id], r = this.passives.rapid || 0, b = this.passives.biggun || 0;
      w.def = Object.assign({}, base, { rpm: base.rpm * (1 + r * 0.1), dmg: base.dmg * (1 + b * 0.2), mag: Math.round(base.mag * (1 + b * 0.25)) });
    }
    get dmgMult() { return 1 + (this.passives.power || 0) * 0.15; }
    get cdMult() { return 1 - (this.passives.rapid || 0) * 0.06; }
    crit(d) { return Math.random() < (this.passives.luck || 0) * 0.08 ? [d * 2, true] : [d, false]; }
    syncBlades() {
      const n = (this.powers.orbit || 0) + 1;
      while (this.blades.length < n) { const m = new THREE.Mesh(this.cone, this.bladeMat); m.scale.set(0.16, 0.7, 0.16); this.root.add(m); this.blades.push({ m, hit: new Map() }); }
    }
    syncDrones() {
      const n = this.powers.drones || 0;
      while (this.drones.length < n) { const m = new THREE.Mesh(this.oct, this.droneMat); m.scale.setScalar(0.22); this.root.add(m); this.drones.push({ m, cd: Math.random() }); }
    }

    // ------------------------------------------------------------------ enemies
    spawnEnemy(kind, opts) {
      const g = this.g, p = g.player, E = ENEMY[kind], o = opts || {};
      let x, z;
      for (let k = 0; k < 12; k++) { const a = Math.random() * Math.PI * 2, r = o.r || (22 + Math.random() * 14); x = p.pos.x + Math.cos(a) * r; z = p.pos.z + Math.sin(a) * r; if (Math.hypot(x, z) < 68) break; }
      const d = Math.hypot(x, z); if (d > 68) { x *= 68 / d; z *= 68 / d; }
      const scaleT = 1 + this.t / 110 + Math.pow(this.t / 280, 2);
      const grp = new THREE.Group(), mat = o.elite ? this.eliteMat : this.mats[kind], s = E.r * (o.elite ? 1.35 : 1);
      let body;
      if (kind === 'mite') { body = new THREE.Mesh(this.ico, mat); body.scale.setScalar(s); for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(this.cone, mat); sp.scale.set(0.1, 0.45, 0.1); const a = i / 4 * 6.28; sp.position.set(Math.cos(a) * s * 0.9, -s * 0.3, Math.sin(a) * s * 0.9); sp.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); grp.add(sp); } }
      else if (kind === 'brute' || E.boss) { body = new THREE.Mesh(this.box, mat); body.scale.set(s * 1.6, s * 1.8, s * 1.3); for (const sx of [-1, 1]) { const arm = new THREE.Mesh(this.box, mat); arm.scale.set(s * 0.5, s * 1.4, s * 0.5); arm.position.set(sx * s * 1.1, -s * 0.2, 0); grp.add(arm); } if (E.boss) { for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(this.cone, this.mats[kind + 'eye']); c.scale.set(0.25, 0.9, 0.25); c.position.set((i - 2.5) * s * 0.28, s * 1.1, 0); grp.add(c); } } }
      else if (kind === 'wisp') { body = new THREE.Mesh(this.sphere, mat); body.scale.setScalar(s); const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 1.4, 0.05, 6, 24), this.mats[kind + 'eye']); ring.rotation.x = Math.PI / 2; grp.add(ring); }
      else { body = new THREE.Mesh(this.oct, mat); body.scale.set(s, s * 0.8, s * 1.5); }
      grp.add(body);
      const eye = new THREE.Mesh(this.sphere, this.mats[kind + 'eye']); eye.scale.setScalar(s * 0.22); eye.position.set(0, s * 0.25, -s * 0.85); grp.add(eye);
      const fly = E.fly || 0, y = (E.boss ? s * 0.9 : s) + fly;
      grp.position.set(x, y, z); this.root.add(grp);
      const hpM = (E.boss ? 1 + this.bossKills * 0.6 : scaleT) * (o.elite ? 6 : 1);
      const e = { kind, E, grp, body, mat, x, z, y, r: s, hp: E.hp * hpM, max: E.hp * hpM, speed: E.speed * (o.elite ? 1.1 : 1) * (1 + Math.min(0.5, this.t / 600)), dmg: E.dmg * (1 + this.t / 180), elite: !!o.elite, hitCd: 0, flash: 0, slow: 0, t: Math.random() * 6, dashT: 3 + Math.random() * 2, shootT: 2 + Math.random() * 2, kx: 0, kz: 0 };
      this.enemies.push(e);
      if (E.boss) { this.boss = e; $('od-boss').classList.remove('hidden'); $('od-bossn').textContent = E.final ? 'THE OVERLORD' : 'CRUCIBLE TITAN'; this.g.hud.toast(E.final ? 'THE OVERLORD HAS COME · KILL IT TO WIN' : 'A CRUCIBLE TITAN APPROACHES', 2600); BR.Audio.zRoar && BR.Audio.zRoar(); this.g.cam.shake = Math.max(this.g.cam.shake, 0.4); }
      return e;
    }
    damage(e, dmg, at, head, src) {
      if (e.dead) return;
      const g = this.g; let crit; [dmg, crit] = this.crit(dmg * this.dmgMult);
      e.hp -= dmg; e.flash = 0.06;
      if (at) g.hud.damageNumber(at, dmg, head || crit, e, false);
      if (e.hp <= 0) this.killEnemy(e, src);
    }
    killEnemy(e, src) {
      const g = this.g; e.dead = true; this.root.remove(e.grp);
      this.kills++; this.score += e.E.score * (e.elite ? 5 : 1);
      const pos = new THREE.Vector3(e.x, e.y, e.z);
      g.fx.burst(pos, [e.elite ? 0xffd24a : e.E.col, 0xffffff, e.E.eye], e.E.boss ? 80 : e.elite ? 34 : 12, e.E.boss ? 10 : 5, e.E.boss ? 0.2 : 0.08, 0.5, 4);
      // XP gems (elites + bosses burst into many) — and a chest from elites/bosses
      const xp = e.E.xp * (e.elite ? 6 : 1) * (1 + this.t / 150), n = Math.min(12, Math.max(1, Math.round(xp / 3)));
      for (let i = 0; i < n; i++) this.dropGem(e.x + (Math.random() - 0.5) * (n > 1 ? 2.5 : 0), e.z + (Math.random() - 0.5) * (n > 1 ? 2.5 : 0), xp / n);
      if (e.elite || e.E.boss) this.spawnChest(e.x, e.z);
      // rare pickups: a magnet (pulls every gem on the map) and a heart (+25 health)
      const roll = Math.random();
      if (e.elite || roll < 0.012) this.dropGem(e.x + 0.6, e.z, 0, 'magnet'); else if (roll < 0.03) this.dropGem(e.x - 0.6, e.z, 0, 'heal');
      if (e.E.boss) {
        this.bossKills++; this.boss = null; $('od-boss').classList.add('hidden');
        g.hud.toast((e.E.final ? 'THE OVERLORD' : 'CRUCIBLE TITAN') + ' DESTROYED', 2200);
        BR.Audio.kill(true, 3); g.hitStop = 0.25;
        if (e.E.final) { this.win(); return; }
      } else if (src === 'gun') BR.Audio.kill(false, 1); else if (Math.random() < 0.3) BR.Audio.pop && BR.Audio.pop(0.2);
      if (BR.Profile.addGrind) BR.Profile.addGrind('odkill', 1);
    }
    dropGem(x, z, v, kind) {
      let m;
      if (kind === 'magnet') { m = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 16, Math.PI * 1.3), this.magMat || (this.magMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a }))); }
      else if (kind === 'heal') { m = new THREE.Mesh(this.sphere, this.healMat || (this.healMat = new THREE.MeshBasicMaterial({ color: 0xff5ec4 }))); m.scale.setScalar(0.22); }
      else { const mi = v >= 8 ? 3 : v >= 4 ? 2 : v >= 2 ? 1 : 0; m = new THREE.Mesh(this.oct, this.gemMat[mi]); m.scale.set(0.16 + mi * 0.04, 0.26 + mi * 0.06, 0.16 + mi * 0.04); }
      m.position.set(x, 0.4, z); this.root.add(m); this.gems.push({ m, v, x, z, pull: false, kind });
    }
    spawnChest(x, z) {
      const grp = new THREE.Group(), gold = new THREE.MeshPhongMaterial({ color: 0xffd24a, emissive: 0x5a3a00, shininess: 120, specular: 0xffffff }), wood = new THREE.MeshPhongMaterial({ color: 0x5a2a6a, shininess: 30 });
      const b = new THREE.Mesh(this.box, wood); b.scale.set(1.2, 0.7, 0.8); b.position.y = 0.35; grp.add(b);
      const lid = new THREE.Mesh(this.box, gold); lid.scale.set(1.25, 0.18, 0.85); lid.position.y = 0.78; grp.add(lid);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 20; grp.add(beam);
      grp.position.set(x, this.g.world.groundAt(x, z, 10), z); this.root.add(grp);
      this.chests.push({ grp, x, z, beam });
    }

    // ------------------------------------------------------------------ shooting hooks
    rayTargets(o, d, maxT) {
      const u = BR.util; let best = maxT, hit = null;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const lx = e.x - o.x, ly = e.y - o.y, lz = e.z - o.z, tc = lx * d.x + ly * d.y + lz * d.z;
        if (tc < 0 || tc > best + e.r * 2) continue;
        const th = u.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, e.x, e.y, e.z, e.r * (e.kind === 'brute' || e.E.boss ? 1.25 : 1.05), best);
        if (th < best) { best = th; hit = e; }
      }
      return hit ? { t: best, target: hit, head: false } : null;
    }
    hitTarget(e, dmg, head, at) {
      const g = this.g, v = this._hv || (this._hv = new THREE.Vector3()); v.set(at.x, at.y, at.z);
      // weak spot: shots near the eye count as headshots
      const hs = Math.hypot(at.x - e.x, at.y - (e.y + e.r * 0.25), at.z - e.z) < e.r * 0.45;
      this.damage(e, dmg * (hs ? 1.6 : 1), v, hs, 'gun');
      g.fx.burst(v, [e.E.col, 0xffffff], 5, 3.5, 0.05, 0.25, 0);
      g.hud.hitmarker(hs, !!e.dead); if (!e.dead) BR.Audio.hit(hs);
      // knockback from your gun
      const p = g.player, kx = e.x - p.pos.x, kz = e.z - p.pos.z, kl = Math.hypot(kx, kz) || 1; e.kx += kx / kl * 2.5; e.kz += kz / kl * 2.5;
    }

    // ------------------------------------------------------------------ interact (chests)
    interact() {
      const p = this.g.player, c = this.chests.find(c => Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 2.4);
      if (!c) return;
      this.root.remove(c.grp); this.chests.splice(this.chests.indexOf(c), 1);
      this.g.fx.burst(new THREE.Vector3(c.x, 1, c.z), [0xffd24a, 0xffffff, 0xff5ec4], 50, 8, 0.1, 0.9, 6);
      BR.Audio.chest(0); BR.Audio.coin();
      this.offer('TREASURE!');
    }

    // ------------------------------------------------------------------ per frame
    update(dt) {
      const g = this.g, p = g.player, C = BR.CONFIG;
      if (!p.alive) return;
      this.t += dt;
      for (const t in p.ammo) p.ammo[t] = Math.max(p.ammo[t], 400);
      // regen + armor (armor is applied by scaling incoming damage in hurt())
      const vit = this.passives.vital || 0; if (vit && p.health < C.actor.maxHealth) p.health = Math.min(C.actor.maxHealth, p.health + vit * 1.5 * dt);
      // ---- spawning: rate and mix grow with time
      this.spawnT -= dt;
      const alive = this.enemies.length, cap = Math.min(85, 22 + this.t * 0.22);
      if (this.spawnT <= 0 && alive < cap) {
        this.spawnT = Math.max(0.12, 0.9 - this.t / 260);
        const r = Math.random(), T = this.t;
        const kind = T > 150 && r < 0.12 ? 'charger' : T > 90 && r < 0.27 ? 'wisp' : T > 40 && r < 0.45 ? 'brute' : 'mite';
        const pack = kind === 'mite' ? 1 + Math.floor(Math.random() * (2 + T / 90)) : 1;
        for (let i = 0; i < pack; i++) this.spawnEnemy(kind);
      }
      this.eliteT -= dt; if (this.eliteT <= 0) { this.eliteT = 60; this.spawnEnemy(['brute', 'charger', 'wisp'][Math.floor(Math.random() * 3)], { elite: true }); g.hud.toast('An ELITE has appeared', 1600); }
      this.bossT -= dt; if (this.bossT <= 0 && !this.boss) { this.bossT = 180; if (this.t < FINAL_T - 30) this.spawnEnemy('boss', { r: 30 }); }
      if (this.t >= FINAL_T && !this.finalSpawned) { this.finalSpawned = true; this.spawnEnemy('overlord', { r: 30 }); }
      this.chestT -= dt; if (this.chestT <= 0) { this.chestT = 70; const a = Math.random() * 6.28, r = 15 + Math.random() * 35; this.spawnChest(Math.cos(a) * r, Math.sin(a) * r); g.hud.toast('A treasure chest appeared · follow the beam', 1800); }
      this.updateEnemies(dt);
      this.updatePowers(dt);
      this.updateGems(dt);
      this.updateShots(dt);
      // chest prompt
      const near = this.chests.find(c => Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 2.4);
      g.hud.prompt(near ? 'Open treasure chest' : null);
      for (const c of this.chests) c.beam.material.opacity = 0.16 + 0.08 * Math.sin(this.t * 4);
      if (this.boss) $('od-bossf').style.width = Math.max(0, this.boss.hp / this.boss.max * 100) + '%';
      this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.2; this.renderHud(); }
      if (this.pendingLv > 0 && g.state === 'playing') { this.pendingLv--; this.offer(); }
    }
    hurt(dmg, from) {
      const g = this.g, p = g.player;
      if (!p.alive) return;
      dmg *= 1 - (this.passives.armor || 0) * 0.08;
      g.applyDamage(p, null, dmg, false, { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z }, 'swarm');
    }
    updateEnemies(dt) {
      const g = this.g, p = g.player, W = g.world, frost = this.powers.frost || 0, fr = 4 + frost * 0.6;
      const list = this.enemies, tmp = this._q || (this._q = []);
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]; if (e.dead) { list.splice(i, 1); continue; }
        e.t += dt; e.hitCd -= dt;
        const dx = p.pos.x - e.x, dz = p.pos.z - e.z, d = Math.hypot(dx, dz) || 0.01;
        let sp = e.speed * (frost && d < fr ? 1 - (0.3 + frost * 0.06) : 1);
        let wx = dx / d, wz = dz / d;
        if (e.E.ranged) { if (d < 12) { wx = -wx; wz = -wz; } else if (d < 16) sp *= 0.2; e.shootT -= dt; if (e.shootT <= 0 && d < 30) { e.shootT = 2.2 + Math.random(); this.enemyShot(e); } }
        if (e.E.dash) { e.dashT -= dt; if (e.dashT < 0.6 && e.dashT > 0) sp = 0; else if (e.dashT <= 0) { sp *= 4.5; if (e.dashT < -0.5) e.dashT = 3 + Math.random() * 2; } }
        if (e.E.boss) { e.dashT -= dt; if (e.dashT <= 0) { e.dashT = 4.5; this.slam(e); } }
        // separation from neighbours (cheap: only a few checks each)
        for (let k = 0; k < 6; k++) { const o = list[(i + 1 + k * 7) % list.length]; if (!o || o === e || o.dead) continue; const ex = e.x - o.x, ez = e.z - o.z, m = e.r + o.r, dd = ex * ex + ez * ez; if (dd < m * m && dd > 1e-4) { const q = Math.sqrt(dd); wx += ex / q * 0.9; wz += ez / q * 0.9; } }
        const wl = Math.hypot(wx, wz) || 1;
        let nx = e.x + (wx / wl * sp + e.kx) * dt, nz = e.z + (wz / wl * sp + e.kz) * dt;
        e.kx *= Math.exp(-dt * 6); e.kz *= Math.exp(-dt * 6);
        // slide round pillars / slabs (circle vs box) — flying wisps ignore low stuff
        W.query(nx - e.r, 0.2, nz - e.r, nx + e.r, e.y + 0.5, nz + e.r, tmp);
        for (const b of tmp) { if (b.ground || b.y1 < 0.6) continue; const cx = BR.util.clamp(nx, b.x0, b.x1), cz = BR.util.clamp(nz, b.z0, b.z1), ox = nx - cx, oz = nz - cz, ol = Math.hypot(ox, oz);
          if (ol < e.r) { if (ol > 1e-4) { nx = cx + ox / ol * e.r; nz = cz + oz / ol * e.r; } else { nx = e.x; nz = e.z; } } }
        const rr = Math.hypot(nx, nz); if (rr > 71) { nx *= 71 / rr; nz *= 71 / rr; }
        e.x = nx; e.z = nz;
        const baseY = (e.E.boss ? e.r * 0.9 : e.r) + (e.E.fly || 0);
        e.y = baseY + (e.E.fly ? Math.sin(e.t * 2) * 0.3 : Math.abs(Math.sin(e.t * (e.kind === 'mite' ? 12 : 5))) * 0.12);
        e.grp.position.set(e.x, e.y, e.z); e.grp.rotation.y = Math.atan2(-dx, -dz);
        if (e.kind === 'wisp') e.grp.children[0].rotation.z = e.t * 2;
        if (e.flash > 0) { e.flash -= dt; e.body.material = e.flash > 0 ? this.flashMat : e.mat; }
        // contact damage
        if (d < e.r + 0.55 && Math.abs(p.pos.y + 0.9 - e.y) < e.r + 1.2 && e.hitCd <= 0) { e.hitCd = 0.8; this.hurt(e.dmg, e); if (!p.alive) return; }
      }
    }
    enemyShot(e) {
      const p = this.g.player, m = new THREE.Mesh(this.sphere, this.orbMat); m.scale.setScalar(0.22); m.position.set(e.x, e.y, e.z); this.root.add(m);
      const tx = p.pos.x - e.x, ty = p.pos.y + 1.2 - e.y, tz = p.pos.z - e.z, l = Math.hypot(tx, ty, tz) || 1, s = 11;
      this.shots.push({ m, vx: tx / l * s, vy: ty / l * s, vz: tz / l * s, life: 4, dmg: e.dmg });
    }
    updateShots(dt) {
      const p = this.g.player;
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i]; s.life -= dt; const q = s.m.position; q.x += s.vx * dt; q.y += s.vy * dt; q.z += s.vz * dt;
        if (Math.hypot(q.x - p.pos.x, q.y - (p.pos.y + 1.1), q.z - p.pos.z) < 0.75) { this.hurt(s.dmg); s.life = 0; }
        if (s.life <= 0 || q.y < 0) { this.root.remove(s.m); this.shots.splice(i, 1); }
      }
    }
    slam(e) {
      const g = this.g, p = g.player, at = new THREE.Vector3(e.x, 0.2, e.z);
      this.ring(at, 9, 0xff2a6a);
      g.fx.burst(at, [0xff2a6a, 0xffd24a, 0xffffff], 40, 9, 0.12, 0.7, 6); g.cam.shake = Math.max(g.cam.shake, 0.3);
      if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < 9 && p.mover.onGround) this.hurt(e.dmg * 0.8);
      BR.Audio.zBoom && BR.Audio.zBoom();
    }
    ring(at, r, col) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.ringMat.clone()); m.material.color.setHex(col); m.rotation.x = -Math.PI / 2; m.position.copy(at); m.position.y = 0.15; this.root.add(m);
      this.rings.push({ m, t: 0, r, dur: 0.45 });
    }
    near(x, z, r) { let best = null, bd = r; for (const e of this.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } } return best; }

    updatePowers(dt) {
      const g = this.g, p = g.player, P = this.powers, cdm = this.cdMult, px = p.pos.x, pz = p.pos.z, py = p.pos.y;
      // orbit blades
      if (P.orbit) {
        const n = this.blades.length, rad = 2.4 + P.orbit * 0.15, dmg = 18 + P.orbit * 7;
        this.blades.forEach((b, i) => {
          const a = this.t * (2.6 + P.orbit * 0.2) + i / n * Math.PI * 2, x = px + Math.cos(a) * rad, z = pz + Math.sin(a) * rad;
          b.m.position.set(x, py + 1.0, z); b.m.rotation.set(Math.PI / 2, 0, -a);
          for (const e of this.enemies) { if (e.dead) continue; if (Math.hypot(e.x - x, e.z - z) < e.r + 0.45) { const last = b.hit.get(e) || -9; if (this.t - last > 0.4) { b.hit.set(e, this.t); this.damage(e, dmg, new THREE.Vector3(e.x, e.y + e.r, e.z), false, 'orbit'); e.kx += Math.cos(a + 1.57) * 3; e.kz += Math.sin(a + 1.57) * 3; } } }
        });
      }
      // arc lightning
      if (P.arc) {
        this.cd.arc = (this.cd.arc || 0) - dt;
        if (this.cd.arc <= 0) {
          let e = this.near(px, pz, 20);
          if (e) {
            this.cd.arc = (1.7 - P.arc * 0.12) * cdm;
            let from = new THREE.Vector3(px, py + 1.4, pz); const hit = new Set();
            for (let k = 0; k <= P.arc + 1 && e; k++) {
              hit.add(e); const to = new THREE.Vector3(e.x, e.y, e.z);
              g.fx.tracer(from, to, true, 0xdff4ff, { style: 'lightning', color2: 0x6f8bff });
              this.damage(e, 30 + P.arc * 12, to.clone().setY(e.y + e.r), false, 'arc');
              from = to; let nb = null, bd = 9; for (const o of this.enemies) { if (o.dead || hit.has(o)) continue; const d = Math.hypot(o.x - to.x, o.z - to.z); if (d < bd) { bd = d; nb = o; } } e = nb;
            }
            BR.Audio.hit(true);
          }
        }
      }
      // nova pulse
      if (P.nova) {
        this.cd.nova = (this.cd.nova || 0) - dt;
        if (this.cd.nova <= 0) {
          this.cd.nova = (3.6 - P.nova * 0.35) * cdm;
          const R = 5 + P.nova, at = new THREE.Vector3(px, py + 0.2, pz);
          this.ring(at, R, 0xff5ec4); g.fx.burst(at.clone().setY(py + 1), [0xff5ec4, 0xffffff], 18, 7, 0.07, 0.35, 0);
          for (const e of this.enemies) { if (e.dead) continue; const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz); if (d < R + e.r) { this.damage(e, 26 + P.nova * 14, new THREE.Vector3(e.x, e.y + e.r, e.z), false, 'nova'); if (!e.E.boss) { e.kx += dx / (d || 1) * 9; e.kz += dz / (d || 1) * 9; } } }
          BR.Audio.blast();
        }
      }
      // seeker drones
      if (P.drones) {
        this.drones.forEach((dr, i) => {
          const a = -this.t * 1.4 + i / this.drones.length * Math.PI * 2; dr.m.position.set(px + Math.cos(a) * 1.4, py + 2.3 + Math.sin(this.t * 3 + i) * 0.15, pz + Math.sin(a) * 1.4); dr.m.rotation.y = this.t * 3;
          dr.cd -= dt;
          if (dr.cd <= 0) { const e = this.near(dr.m.position.x, dr.m.position.z, 26); if (e) { dr.cd = 0.85 * cdm; const to = new THREE.Vector3(e.x, e.y, e.z); g.fx.tracer(dr.m.position.clone(), to, true, 0xffd24a, { style: 'dual', color2: 0xffffff }); this.damage(e, 16 + P.drones * 6, to.clone().setY(e.y + e.r), false, 'drone'); } else dr.cd = 0.2; }
        });
      }
      // flame trail
      if (P.flame) {
        this.cd.flame = (this.cd.flame || 0) - dt;
        if (this.cd.flame <= 0 && p.mover.speedH > 2 && p.mover.onGround) { this.cd.flame = 0.22; const m = new THREE.Mesh(this.sphere, this.fireMat); m.scale.set(0.9, 0.15, 0.9); m.position.set(px, py + 0.1, pz); this.root.add(m); this.fires.push({ m, x: px, z: pz, life: 2.6 }); }
        const dps = 22 + P.flame * 10;
        for (let i = this.fires.length - 1; i >= 0; i--) { const f = this.fires[i]; f.life -= dt; f.m.scale.y = 0.15 + 0.1 * Math.sin(this.t * 20 + i); f.m.material.opacity = 0.75;
          if (Math.random() < dt * 6) g.fx.burst(f.m.position.clone().setY(py + 0.4), [0xff7a1a, 0xffd24a], 1, 1.5, 0.06, 0.4, -2);
          for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - f.x, e.z - f.z) < 1.1 + e.r) { e.burn = (e.burn || 0) + dt; if (e.burn > 0.25) { e.burn = 0; this.damage(e, dps * 0.25, null, false, 'flame'); } }
          if (f.life <= 0) { this.root.remove(f.m); this.fires.splice(i, 1); } }
      }
      // frost field
      if (P.frost) {
        const R = 4 + P.frost * 0.6; this.frostMesh.scale.setScalar(R); this.frostMesh.position.set(px, py + 0.08, pz); this.frostMat.opacity = 0.1 + 0.04 * Math.sin(this.t * 3);
        this.cd.frost = (this.cd.frost || 0) - dt;
        if (this.cd.frost <= 0) { this.cd.frost = 0.5; for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - px, e.z - pz) < R + e.r) this.damage(e, (8 + P.frost * 5) * 0.5, null, false, 'frost'); }
      }
      // rings expanding
      for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; const k = r.t / r.dur; r.m.scale.setScalar(Math.max(0.01, r.r * k)); r.m.material.opacity = 0.85 * (1 - k); if (k >= 1) { this.root.remove(r.m); this.rings.splice(i, 1); } }
    }
    updateGems(dt) {
      const g = this.g, p = g.player, R = 4.5 * (1 + (this.passives.magnet || 0) * 0.4), greed = 1 + (this.passives.greed || 0) * 0.15;
      for (let i = this.gems.length - 1; i >= 0; i--) {
        const q = this.gems[i], dx = p.pos.x - q.x, dz = p.pos.z - q.z, d = Math.hypot(dx, dz);
        if (d < R) q.pull = true;
        if (q.pull) { const s = Math.min(d, (8 + (R - Math.min(d, R)) * 6) * dt + 0.02); q.x += dx / (d || 1) * s; q.z += dz / (d || 1) * s; }
        q.m.position.set(q.x, p.pos.y * (q.pull ? 1 : 0) + 0.45 + Math.sin(this.t * 3 + i) * 0.1, q.z); q.m.rotation.y = this.t * 2 + i;
        if (d < 0.8) {
          this.root.remove(q.m); this.gems.splice(i, 1);
          if (q.kind === 'magnet') { for (const o of this.gems) o.pull = true; g.hud.toast('MAGNET · every gem is yours', 1200); BR.Audio.coin(); continue; }
          if (q.kind === 'heal') { p.health = Math.min(BR.CONFIG.actor.maxHealth, p.health + 25); BR.Audio.pickup(); continue; }
          this.xp += q.v * greed;
          if (Math.random() < 0.5) BR.Audio.pop && BR.Audio.pop(0.12);
        }
      }
      while (this.xp >= need(this.level)) { this.xp -= need(this.level); this.level++; this.pendingLv++; g.fx.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), [0x45e0ff, 0xffd24a, 0xffffff], 30, 6, 0.08, 0.6, -1); }
      if (this.gems.length > 260) { const q = this.gems.shift(); this.root.remove(q.m); this.xp += q.v; }   // too many on the floor: auto-collect the oldest
    }

    // ------------------------------------------------------------------ end
    result(win) {
      const p = this.g.player;
      return { overdrive: true, win, place: win ? 1 : 2, total: 1, kills: this.kills, damage: p.damageDealt, time: this.t, level: this.level, bosses: this.bossKills, score: this.score,
        by: win ? 'You destroyed the Overlord' : 'Overrun at ' + BR.fmtTime(this.t) };
    }
    onKill(victim) {
      const g = this.g; if (victim !== g.player || g.state !== 'playing') return;
      g.state = 'dead'; g.endT = 2.6; g.deathPos = victim.pos.clone();
      g.result = this.result(false);
      if (BR.Profile.addGrind) BR.Profile.addGrind('odtime', this.t);
      g.hud.toast('OVERRUN · survived ' + BR.fmtTime(this.t), 2400);
    }
    win() {
      const g = this.g; if (g.state !== 'playing') return;
      g.result = this.result(true);
      if (BR.Profile.addGrind) { BR.Profile.addGrind('odtime', this.t); BR.Profile.addGrind('odwin', 1); }
      g.state = 'won'; g.endT = 5.4; g.player.fireHeld = false;
      g.freezeT = 1.0; g.hud.freeze(true); BR.Audio.freeze && BR.Audio.freeze();
    }
    dispose() {
      const h = $('od-hud'); if (h) h.classList.add('hidden');
      const l = $('od-level'); if (l) l.classList.add('hidden');
      if (this.g.player) this.g.player.speedBoost = 0;
      this.enemies = []; this.gems = [];
    }
  };
  BR.OVERDRIVE = { ENEMY, POWERS, PASSIVES };
})();
