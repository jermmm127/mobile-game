'use strict';
// =============================================================================
// ZOMBIES ONLINE (v1.29): a party survives the zombie rounds together (2-4 players).
//
//  * The party leader's browser hosts and runs the real game: the rounds, spawning, zombie and boss AI,
//    power-up drops. Zombies chase and swipe at whoever is nearest. Everyone else sees them as puppets
//    driven by the host's state stream.
//  * Every player's own character runs locally (moving, shooting, buying, points, the Mystery Box,
//    Pack-a-Punch). Your teammates appear as players on your screen.
//  * Shots at a zombie go to the host, who applies them (Insta-Kill included). Kills are announced to everyone,
//    and the shooter gets the kill points. A zombie or boss hitting a teammate is sent to that teammate's game.
//  * Boss hazards (fireballs, spikes, gas, crows, shock rings) are copied to every screen, and each game checks
//    them against its own player, so everyone can dodge them fairly.
//  * Doors, power-ups and the box moving are shared. If you go down you watch until the next round starts,
//    then everyone who died comes back. The game ends only when the whole party is down at the same time.
// It plugs into the same hooks as party BR (game.brnet): netDamage / canKill / netShot / update / stop.
// =============================================================================
(function () {
  const ZC = BR.ZOMBIE_CFG || { hitPts: 10, killPts: 60, headPts: 100, knifePts: 130, regenDelay: 4, regenRate: 30 };
  const V = v => v && v.isVector3 ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : v;
  // boss hazard args <-> JSON (vectors become [x, y, z] with a marker; functions are dropped)
  const pack = a => JSON.parse(JSON.stringify(a, (k, v) => v && v.isVector3 ? { __v: V(v) } : typeof v === 'function' ? undefined : v));
  const unpack = a => JSON.parse(JSON.stringify(a), (k, v) => v && v.__v ? new THREE.Vector3(v.__v[0], v.__v[1], v.__v[2]) : v);
  const HAZ = ['projectile', 'telegraph', 'lane', 'shockRing', 'spikeAt', 'gasCloud', 'fireZone', 'crow'];

  // a zombie / boss on a guest's screen: follows the host's stream
  class ZProxy {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.att = 0; this.seen = false; this.mv = null; }
    set(s) { this.x = s[1]; this.y = s[2]; this.z = s[3]; this.yaw = s[4]; this.att = s[5]; this.hp = s[6]; this.mv = s[7] || null; if (!this.seen) { this.seen = true; this.snap = true; } }
    apply(a, dt) {
      const m = a.mover, k = this.snap ? 1 : 1 - Math.exp(-dt * 12); this.snap = false;
      const ox = m.pos.x, oz = m.pos.z;
      m.pos.x += (this.x - m.pos.x) * k; m.pos.y += (this.y - m.pos.y) * k; m.pos.z += (this.z - m.pos.z) * k;
      m.vel.set((m.pos.x - ox) / Math.max(dt, 1e-3), 0, (m.pos.z - oz) / Math.max(dt, 1e-3));
      a.yaw = this.yaw;
      if (a.riseT > 0) a.riseT = Math.max(0, a.riseT - dt);
      if (this.att && !(a.attackT > 0)) a.attackT = 0.55; if (a.attackT > 0) a.attackT -= dt;
      if (a.boss) { a.t = (a.t || 0) + dt; a.move = this.mv ? { id: this.mv } : null; if (this.hp !== undefined) a.health = a.maxHp * this.hp / 100; }
      if (a.mesh) a.syncMesh(dt);
    }
  }

  // zombies / bosses: puppets on guests; on the host the AI aims at the nearest player
  const zUpd = BR.Zombie.prototype.update, bUpd = BR.ZBoss.prototype.update, brainUpd = BR.ZombieBrain.prototype.update;
  BR.Zombie.prototype.update = function (dt) { if (this.zproxy) { if (this.alive) this.zproxy.apply(this, dt); return; } return zUpd.call(this, dt); };
  BR.ZBoss.prototype.update = function (dt) {
    if (this.zproxy) { if (this.alive) this.zproxy.apply(this, dt); return; }
    const N = this.zm && this.zm.net; if (!N || !N.host) return bUpd.call(this, dt);
    const g = this.zm.g, keep = g.player; g.player = N.targetFor(this) || keep;      // the boss chases / aims / swipes at the nearest player
    try { return bUpd.call(this, dt); } finally { g.player = keep; }
  };
  BR.ZombieBrain.prototype.update = function (dt) {
    const zm = this.g.zm, N = zm && zm.net; if (!N || !N.host) return brainUpd.call(this, dt);
    const g = this.g, keep = g.player; g.player = N.targetFor(this.z) || keep;
    try { return brainUpd.call(this, dt); } finally { g.player = keep; }
  };

  BR.ZMNet = class ZMNet {
    // cfg: { seed, humans: [{ pid, name, ch }] }
    static begin(game, sess, cfg) {
      if (game.brnet) game.brnet.stop(true);
      const keep = Math.random; Math.random = BR.util.rng(cfg.seed >>> 0);           // the same map + box spot on every screen
      try { game.startZombies(); } finally { Math.random = keep; }
      const n = new BR.ZMNet(game, sess, cfg); game.brnet = n; game.zm.net = n; n.setup();
      return n;
    }
    constructor(game, sess, cfg) {
      this.g = game; this.net = sess; this.me = sess.pid; this.host = !!sess.isHost; this.cfg = cfg;
      this.sendT = 0; this.zsT = 0; this.fxQ = []; this.byNet = new Map(); this.byZ = new Map(); this.zid = 0; this.done = false; this.tgt = new Map();
    }
    setup() {
      const g = this.g, zm = g.zm, C = this.cfg, H = C.humans, meIdx = Math.max(0, H.findIndex(h => h.pid === this.me)), p = g.player, W = g.world;
      p.netId = meIdx; p.local = true; p.owner = this.me; p.team = 0; p.name = H[meIdx].name; this.byNet.set(meIdx, p);
      const sp = W.spawns[0];
      H.forEach((h, i) => {
        if (i === meIdx) return;
        const a = new BR.Actor(g, { id: 500 + i, name: h.name, color: 0x5fb4ff });
        a.netId = i; a.owner = h.pid; a.human = true; a.local = false; a.team = 0; a.netProxy = new BR.NetProxy();
        if (h.ch && typeof h.ch === 'object') { a.look = { o: String(h.ch.o || 'default'), m: String(h.ch.m || 'default'), h: String(h.ch.h || 'default') }; if (a.mesh) { if (a.mesh.parent) g.scene.remove(a.mesh); a.mesh = a.buildMesh(); } }
        a.mover.dropping = false; a.mover.pos.set(sp.x + (i - meIdx) * 1.5, 0, sp.z + 1.5);
        a.slots = [BR.Weapons.create('pistol'), null, null]; a.cur = 0;
        if (a.mesh) { g.scene.add(a.mesh); g.highlightActor(a); }
        g.actors.push(a); this.byNet.set(i, a);
      });
      p.mover.pos.x += meIdx * 1.5;                       // don't all spawn inside each other
      g.total = H.length;
      if (this.host) this.hookHost(); else this.hookGuest();
      this.wire();
      g.hud.toast(`ZOMBIES WITH YOUR PARTY · ${H.map(h => h.name).join(', ')}`, 2600);
    }
    humans() { return [...this.byNet.values()].filter(a => a && !a.gone); }
    // the nearest player still up (host AI), re-picked every half second per zombie so they don't flicker between targets
    targetFor(z) {
      const t = this.g.time, c = this.tgt.get(z);
      if (c && t - c.t < 0.5 && c.a.alive && !c.a.gone) return c.a;
      let best = null, bd = Infinity;
      for (const a of this.humans()) { if (!a.alive) continue; const d = (a.pos.x - z.pos.x) ** 2 + (a.pos.z - z.pos.z) ** 2; if (d < bd) { bd = d; best = a; } }
      if (best) this.tgt.set(z, { a: best, t }); return best;
    }
    zombieOf(id) { return this.byZ.get(id) || null; }

    // ---------------------------------------------------------------- host: tell everyone what happens
    hookHost() {
      const zm = this.g.zm, N = this;
      const wrap = (name, after) => { const f = zm[name]; zm[name] = function (...a) { const r = f.apply(this, a); after.call(N, r, a); return r; }; };
      wrap('spawnZombie', z => { if (z) this.announce(z); });
      wrap('spawnBoss', () => { const b = zm.boss; if (b) this.announce(b); });
      wrap('dropPower', (r, a) => { const P = zm.powers[zm.powers.length - 1]; if (P) { P.nid = ++this.zid; this.net.send('zpw', { id: P.nid, tp: P.tp, at: V(P.grp.position) }); } });
      wrap('nextRound', () => { if (this.humans().some(a => !a.alive)) { this.net.send('zrev', { r: zm.round }); this.reviveLocal(); } });
      for (const f of HAZ) { const orig = zm[f]; zm[f] = function (...a) { if (!N._remote) N.net.send('zfx', { f, a: pack(a) }); return orig.apply(this, a); }; }
      const kill = zm.onKill; zm.onKill = function (v, k, w, h) {
        if (v.zombie && v.zid) N.net.send('zk', { id: v.zid, k: k && k.netId !== undefined ? k.netId : -1, w, h: !!h, boss: !!v.boss });
        return kill.call(this, v, k, w, h);
      };
    }
    announce(z) {
      z.zid = ++this.zid; this.byZ.set(z.zid, z);
      this.net.send('zz', { id: z.zid, boss: z.boss || null, r: this.g.zm.round, sp: +(z.zSpeed || 1).toFixed(2), at: V(z.pos), yaw: +z.yaw.toFixed(2), rise: +(z.riseT || 0).toFixed(2), hp: z.maxHp || 100 });
    }
    // ---------------------------------------------------------------- guests: shared doors / box
    hookGuest() {
      const zm = this.g.zm; zm.toSpawn = 0;
      document.body.classList.add('zm-guest');
    }
    wire() {
      const N = this.net, g = this.g, zm = g.zm;
      // shared by everyone: doors, the box moving, power-ups, player state, shot tracers
      const od = zm.openDoor; zm.openDoor = function (d) { if (d.open) return; od.call(this, d); if (!this._netRemote) N.send('zdoor', { i: this.doors.indexOf(d) }); };
      const pb = zm.placeBox; let boxReady = false; zm.placeBox = function (i) { pb.call(this, i); if (boxReady && !this._netRemote) N.send('zbox', { i }); };
      boxReady = true;
      const self = this;
      zm.updatePowers = function (dt) {             // pick-ups: whoever touches it first gets it for the team
        const p = g.player;
        for (let i = this.powers.length - 1; i >= 0; i--) {
          const P = this.powers[i]; P.t += dt;
          P.grp.position.y += Math.sin(P.t * 3) * 0.004; P.glow.material.opacity = 0.35 + 0.2 * Math.sin(P.t * 5);
          P.s.visible = P.t < 20 || Math.floor(P.t * 6) % 2 === 0;
          const d = Math.hypot(P.grp.position.x - p.pos.x, P.grp.position.z - p.pos.z);
          if ((d < 1.7 && p.alive) || P.t > 26) { if (d < 1.7 && p.alive) { self.applyPowerNet(P, true); N.send('zpt', { id: P.nid, tp: P.tp }); } g.scene.remove(P.grp); this.powers.splice(i, 1); }
        }
      };
      N.on('zdoor', m => { const d = zm.doors && zm.doors[m.i]; if (d && !d.open) { zm._netRemote = true; try { zm.openDoor(d); } finally { zm._netRemote = false; } } });
      N.on('zbox', m => { if (!zm.box) return; zm._netRemote = true; try { if (zm.box.state !== 'idle' && zm.boxClose) zm.boxClose(); zm.placeBox(m.i); } finally { zm._netRemote = false; } });
      N.on('zpt', m => { const i = zm.powers.findIndex(P => P.nid === m.id); const P = i >= 0 ? zm.powers[i] : { tp: m.tp, grp: { position: g.player.pos.clone() }, label: m.tp.toUpperCase(), col: '#ffffff' }; this.applyPowerNet(P, false); if (i >= 0) { g.scene.remove(zm.powers[i].grp); zm.powers.splice(i, 1); } });
      N.on('st', m => { if (this.done) return; for (const s of m.a) { const a = this.byNet.get(s[0]); if (!a || !a.netProxy) continue; a.netProxy.set(s); if (!a.alive && s[7] && !a.gone) this.reviveProxy(a); else if (a.alive && !s[7]) this.proxyDown(a); } });
      N.on('fx', m => { if (!this.done) for (const f of m.f) this.remoteShot(f); });
      N.on('zhurt', m => { const p = g.player; if (this.done || !p.alive) return; g.applyDamage(p, null, m.d, false, { x: m.at[0], y: m.at[1], z: m.at[2] }, 'zombie'); });
      N.on('zdie', m => { const a = this.byNet.get(m.n); if (a) this.proxyDown(a); if (this.host) this.checkWipe(); });
      N.on('zover', m => this.wipe(m.r));
      N.on('zrev', () => this.reviveLocal());
      N.on('gone', m => this.dropOwner(m.pid));
      N.on('leave', m => { this.dropOwner(m.from); if (this.host) N.send('gone', { pid: m.from }); });
      N.on('closed', () => { if (this.done) return; g.hud.toast('The party leader left the game', 2400); this.stop(true); const seed = g.world && g.world.seed; setTimeout(() => { if (g.zm && g.state === 'playing' && g.world && g.world.seed === seed) zm.gameOver(); }, 1600); });
      if (this.host) {
        N.on('zh', m => {                                  // a guest hit a zombie: apply it here
          const z = this.zombieOf(m.id); if (!z || !z.alive) return;
          const who = this.byNet.get(m.a) || null, cap = BR.AntiCheat && BR.AntiCheat.maxHit && BR.CONFIG.weapons[m.w] ? BR.AntiCheat.maxHit(m.w) * 2.2 : 1e4;     // (Pack-a-Punch doubles damage)
          g.applyDamage(z, who, Math.min(+m.d || 0, cap), m.h, { x: m.at[0], y: m.at[1], z: m.at[2] }, m.w);
          if (z.alive && zm.insta > 0 && !z.boss) g.kill(z, who, m.w, m.h);          // Insta-Kill works for the whole party
        });
        N.on('znuke', () => { for (const z of zm.zombies.slice()) if (z.alive && !z.boss) g.kill(z, null, 'nuke', false); });
      } else {
        N.on('zz', m => this.spawnPuppet(m));
        N.on('zs', m => this.applyState(m));
        N.on('zk', m => this.puppetKilled(m));
        N.on('zpw', m => { zm._netRemote = true; try { zm.dropPower(new THREE.Vector3(m.at[0], m.at[1], m.at[2]), m.tp); } finally { zm._netRemote = false; } const P = zm.powers[zm.powers.length - 1]; if (P) P.nid = m.id; });
        N.on('zfx', m => { if (!HAZ.includes(m.f) || typeof zm[m.f] !== 'function') return; try { zm[m.f](...unpack(m.a)); } catch (e) { /* a hazard that needs host-only data */ } });
      }
    }
    // a power-up: Max Ammo refills everyone, Insta-Kill / Double Points are for everyone, a Nuke clears the
    // round's zombies (the host does the killing) and pays whoever grabbed it
    applyPowerNet(P, mine) {
      const g = this.g, zm = g.zm, p = g.player;
      g.hud.zmBanner(P.label, '', 'power', P.col); BR.Audio.zPower && BR.Audio.zPower();
      if (P.grp && P.grp.position && P.grp.position.isVector3 && g.fx) g.fx.burst(P.grp.position.clone(), [new THREE.Color(P.col).getHex(), 0xffffff], 30, 6, 0.08, 0.8, 2);
      if (P.tp === 'maxammo') { for (const w of p.slots) if (w && !w.def.melee) { w.mag = w.def.mag; p.ammo[w.def.ammo] = BR.CONFIG.ammoCap[w.def.ammo]; } }
      else if (P.tp === 'instakill') zm.insta = 25;
      else if (P.tp === 'double') zm.double = 25;
      else if (P.tp === 'nuke') {
        g.hud.zmNuke && g.hud.zmNuke(); g.cam.shake = Math.max(g.cam.shake, 0.4);
        if (this.host) for (const z of zm.zombies.slice()) if (z.alive && !z.boss) g.kill(z, null, 'nuke', false);
        else if (mine) this.net.send('znuke', {});
        if (mine) zm.addPoints(400);
      }
    }

    // ---------------------------------------------------------------- guests: puppets of the host's zombies
    spawnPuppet(m) {
      const g = this.g, zm = g.zm; if (this.byZ.has(m.id)) return;
      let z;
      if (m.boss) { z = new BR.ZBoss(g, zm, m.boss, m.r); z.maxHp = z.health; zm.boss = z; }
      else z = new BR.Zombie(g, { id: 1000 + m.id, stats: { hp: m.hp || 100, dmg: 0 }, speed: m.sp, rise: m.rise, eyes: m.r >= 20 ? 0xff2a2a : 0xffa31a });
      z.zid = m.id; z.local = false; z.zproxy = new ZProxy(); z.brain = null;
      z.mover.dropping = false; z.mover.pos.set(m.at[0], m.at[1], m.at[2]); z.yaw = m.yaw;
      z.zproxy.set([m.id, m.at[0], m.at[1], m.at[2], m.yaw, 0, 100]);
      g.scene.add(z.mesh); g.actors.push(z); zm.zombies.push(z); g.highlightActor(z); this.byZ.set(m.id, z);
      if (z.riseT > 0) g.fx.burst(z.pos.clone().setY(z.pos.y + 0.2), [0x3a2a1e, 0x5a4a3a, 0x241a12], 10, 3, 0.1, 0.8, 9);
      if (m.boss) {                                         // the same entrance as the host sees
        g.hud.zmBanner(z.D.name, z.D.sub, 'boss'); BR.Audio.zRoar && BR.Audio.zRoar(); zm.lightning(1);
        const story = BR.ZOMBIE_STORY && BR.ZOMBIE_STORY.bosses && BR.ZOMBIE_STORY.bosses[m.boss];
        if (story) { z.riseT = z.riseMax = 3.2; zm.cut = { t: 0, dur: 6.2, b: z, type: m.boss, story }; document.body.classList.add('zm-cinema'); g.hud.zmCut(story, z.D.color); g.hud.zmBoss(null); }
      }
    }
    applyState(m) {
      const g = this.g, zm = g.zm;
      if (m.r !== zm.round) {                               // a new round
        zm.round = m.r; g.hud.zmRound(m.r);
        if (m.ph === 'fight') { g.hud.zmBanner('ROUND ' + m.r, m.r === 1 ? "They're coming. Survive." : '', 'round'); BR.Audio.zRound && BR.Audio.zRound(true); }
      }
      if (m.ph !== zm.phase) {
        if (m.ph === 'break' && zm.phase === 'fight') { g.hud.zmBanner('ROUND ' + zm.round + ' SURVIVED', 'Next round in a few seconds', 'done'); BR.Audio.zRound && BR.Audio.zRound(false); g.hud.zmBoss(null); }
        zm.phase = m.ph;
      }
      zm.insta = m.ins ? Math.max(zm.insta, 0.5) : 0; zm.double = m.dbl ? Math.max(zm.double, 0.5) : 0;
      g.hud.zmLeft(m.left, m.ph === 'fight');
      for (const s of m.z) { const z = this.byZ.get(s[0]); if (z && z.zproxy && z.alive) z.zproxy.set(s); }
      if (zm.boss && zm.boss.alive && m.bh !== undefined) g.hud.zmBoss(zm.boss.D.name, m.bh / 100, zm.boss.D.color);
    }
    puppetKilled(m) {
      const g = this.g, zm = g.zm, z = this.byZ.get(m.id), mine = m.k === g.player.netId;
      if (z && z.alive) {
        z.alive = false; z.health = 0; z.deathT = g.time; z.dieVisual();
        g.fx.burst(z.pos.clone().setY(z.pos.y + 1.1), [0x5a0808, 0x8a1010, 0x3a2a1e], z.boss ? 60 : 12, z.boss ? 9 : 4, 0.08, 0.8, 9);
        if (z.boss) { zm.boss = null; zm.bossKills++; g.hud.zmBoss(null); g.hud.zmBanner(z.D.name + ' SLAIN', mine ? '+2000 points' : '', 'slain'); if (z.mesh) setTimeout(() => { if (z.mesh.parent) g.scene.remove(z.mesh); }, 600); }
      }
      if (mine) {                                           // your kill: points, the kill sound, challenges + mastery
        zm.kills++;
        const melee = BR.CONFIG.weapons[m.w] && BR.CONFIG.weapons[m.w].melee;
        zm.addPoints(m.boss ? 2000 : melee ? ZC.knifePts : m.h ? ZC.headPts : ZC.killPts);
        BR.Audio.kill(m.h, 1); if (m.h) g.hud.hitmarker(true, true);
        g.player.kills++;
        if (BR.Profile.addGrind) BR.Profile.addGrind('kill', 1, { w: m.w, head: !!m.h, melee: !!melee, zombie: true });
      }
    }

    // ---------------------------------------------------------------- deaths, revives, the end
    localDied() {
      const g = this.g, p = g.player;
      g.deathPos = p.pos.clone();
      this.net.send('zdie', { n: p.netId });
      const anyUp = this.humans().some(a => a.alive);
      g.hud.zmBanner("YOU'RE DOWN", anyUp ? 'Your team can still win the round: you come back when the next one starts' : '', 'dead');
      if (this.host) this.checkWipe();
    }
    proxyDown(a) {
      if (!a.alive) return;
      a.alive = false; a.health = 0; a.deathT = this.g.time; if (a.dieVisual) a.dieVisual();
      this.g.hud.toast(a.name + ' is down', 1600);
    }
    reviveProxy(a) {
      const g = this.g; a.alive = true; a.downed = false; a.deathT = 0; a.health = 100;
      if (a.mesh && a.mesh.parent) g.scene.remove(a.mesh);
      a.mesh = a.buildMesh(); g.scene.add(a.mesh); g.highlightActor(a);
      a.netProxy.seen = false;
    }
    reviveLocal() {
      const g = this.g, p = g.player, W = g.world; if (p.alive || g.state !== 'playing') return;
      const mate = this.humans().find(a => a !== p && a.alive), sp = W.spawns[0];
      const at = mate ? mate.pos : new THREE.Vector3(sp.x, 0, sp.z);
      p.alive = true; p.downed = false; p.deathT = 0; p.health = BR.CONFIG.actor.maxHealth; p.mover.prone = false;
      p.mover.pos.set(at.x + 1, W.groundAt(at.x + 1, at.z, at.y + 3), at.z); p.mover.vel.set(0, 0, 0);
      if (p.resetCooldowns) p.resetCooldowns();
      g.hud.zmBanner('BACK IN THE FIGHT', 'Round ' + g.zm.round, 'round'); g.vmr.lastWeapon = null;
    }
    checkWipe() { if (!this.done && this.humans().every(a => !a.alive)) { this.net.send('zover', { r: this.g.zm.round }); this.wipe(this.g.zm.round); } }
    wipe() { const g = this.g; if (this.wiped) return; this.wiped = true; if (g.zm && g.state === 'playing') { g.zm.gameOver(); if (g.result) g.result.by = 'Your party was overrun on round ' + g.zm.round; } }
    dropOwner(pid) {
      for (const a of this.humans()) if (a.owner === pid && a !== this.g.player) { a.gone = true; this.proxyDown(a); if (a.mesh && a.mesh.parent) this.g.scene.remove(a.mesh); }
      this.g.hud.toast('A party member left the game', 1600);
      if (this.host) this.checkWipe();
    }

    // ---------------------------------------------------------------- hooks from game.js / weapons.js
    canKill(victim) { if (this.done) return true; return victim.local !== false; }      // only puppets' owners kill them
    netDamage(victim, attacker, dmg, head, at, wid) {
      if (this.done || victim.local !== false) return false;
      const g = this.g, zm = g.zm;
      if (victim.zombie && !this.host) {                   // your shot at a host zombie
        if (attacker !== g.player) return true;
        this.net.send('zh', { id: victim.zid, a: g.player.netId, d: +dmg.toFixed(2), h: !!head, w: wid, at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] }, 'H');
        const v = this._v || (this._v = new THREE.Vector3()); v.set(at.x, at.y, at.z);
        g.hud.hitmarker(head, false); g.hud.damageNumber(v, dmg, head, victim, false, at); BR.Audio.hit(head, false);
        zm.onHit(victim, dmg, head); victim.flash && victim.flash();
        return true;
      }
      if (victim.human && this.host && attacker !== g.player) {      // a zombie / boss hit a teammate: their game applies it
        this.net.send('zhurt', { d: +dmg.toFixed(1), at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] }, victim.owner);
        return true;
      }
      return true;                                          // (no friendly fire between players)
    }
    onDown() {} reviveDone() {} took() {} chest() {} chestRng() { return Math.random; }
    netShot(actor, from, to, wid, first) {
      if (this.done || actor.local === false || actor.zombie) return;
      this.fxQ.push([actor.netId, +from.x.toFixed(2), +from.y.toFixed(2), +from.z.toFixed(2), +to.x.toFixed(2), +to.y.toFixed(2), +to.z.toFixed(2), BR.Net.WIDS.indexOf(wid), first ? 1 : 0]);
    }
    remoteShot(f) {
      const g = this.g, from = new THREE.Vector3(f[1], f[2], f[3]), to = new THREE.Vector3(f[4], f[5], f[6]);
      g.fx.tracer(from, to, false, 0xff9a6b, null);
      if (f[8]) { const cp = g.camera.position, d = Math.hypot(from.x - cp.x, from.z - cp.z), pan = BR.util.clamp((from.x - cp.x) / Math.max(1, d), -0.8, 0.8); if (d < 150) BR.Audio.shot(BR.Net.WIDS[f[7]], d, pan, false); }
    }

    // ---------------------------------------------------------------- per frame
    update(dt) {
      if (this.done) return;
      const g = this.g, zm = g.zm;
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 0.05;
        const p = g.player, w = p.weapon, m = p.mover;
        this.net.send('st', { a: [[p.netId, +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), w ? BR.Net.WIDS.indexOf(w.id) : -1, p.alive ? 1 : 0, m.crouched || m.sliding ? 1 : 0, Math.round(p.health), 0, 0]] });
      }
      if (this.fxQ.length) { this.net.send('fx', { f: this.fxQ }); this.fxQ = []; }
      if (this.host) {
        this.zsT -= dt;
        if (this.zsT <= 0) {
          this.zsT = 0.08;
          const z = [];
          for (const a of zm.zombies) if (a.alive && a.zid) z.push([a.zid, +a.pos.x.toFixed(2), +a.pos.y.toFixed(2), +a.pos.z.toFixed(2), +a.yaw.toFixed(2), a.attackT > 0 ? 1 : 0, Math.round(100 * a.health / (a.maxHp || 100)), a.boss && a.move ? a.move.id : 0]);
          const left = zm.phase === 'fight' ? zm.toSpawn + zm.zombies.filter(q => q.alive).length + (zm.bossPending ? 1 : 0) : 0;
          this.net.send('zs', { r: zm.round, ph: zm.phase, left, ins: zm.insta > 0 ? 1 : 0, dbl: zm.double > 0 ? 1 : 0, z, bh: zm.boss && zm.boss.alive ? Math.round(100 * zm.boss.health / zm.boss.maxHp) : undefined });
        }
      }
    }
    // a guest's zombies frame: no spawning or AI (the host does that), but your own hazards, power-ups, buys and box
    clientUpdate(dt) {
      const g = this.g, zm = g.zm, p = g.player;
      zm.tAll = (zm.tAll || 0) + dt; zm.ambience(dt);
      if (p.alive) {
        if (g.time - p.lastHurtT > ZC.regenDelay && p.health < BR.CONFIG.actor.maxHealth) p.health = Math.min(BR.CONFIG.actor.maxHealth, p.health + ZC.regenRate * dt);
        if (p.zSlowT > 0) p.zSlowT -= dt;
      }
      for (let i = zm.zombies.length - 1; i >= 0; i--) {
        const z = zm.zombies[i]; if (z.alive) continue;
        const age = g.time - z.deathT;
        if (z.mesh && age > 1.2) z.mesh.position.y = z.mover.pos.y - (age - 1.2) * 0.8;
        if (age > 3) { if (z.mesh && z.mesh.parent) g.scene.remove(z.mesh); zm.zombies.splice(i, 1); this.byZ.delete(z.zid); const k = g.actors.indexOf(z); if (k >= 0) g.actors.splice(k, 1); }
      }
      if (zm.insta > 0) zm.insta -= dt; if (zm.double > 0) zm.double -= dt;
      g.hud.zmTimers(zm.insta, zm.double);
      zm.updateProjectiles(dt); zm.updateHazards(dt); zm.updatePowers(dt); zm.updateBuys();
    }
    stop(quiet) {
      if (this.done) return; this.done = true;
      if (this.g.brnet === this) this.g.brnet = null;
      if (this.g.zm && this.g.zm.net === this) this.g.zm.net = null;
      document.body.classList.remove('zm-guest');
      if (BR.Net.session === this.net) BR.Net.leave(); else try { this.net.close(); } catch (e) { /* closed */ }
      void quiet;
    }
  };
})();
