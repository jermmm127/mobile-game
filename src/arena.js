'use strict';
// =============================================================================
// ARENA MATCHES (v1.12) — one mode class for every small-arena format on The Yard:
//   duel     rounds, no respawns, last team standing wins the round, first to N rounds
//            (1v1 or 2v2; guns: your duel loadout / Shotgun only / Sniper + Hunting Rifle)
//   tdm      Team Deathmatch, 4v4, respawn after 3 s, first team to 30 kills or most at 6:00
//   ffa      Free For All, 6 players, respawn after 3 s, first to 20 kills or most at 6:00
// Offline: you + AI teammates vs AI. Online (net.js): the host runs bots, rounds and scores;
// each player simulates their own character and sends snapshots; damage is applied by the
// victim's owner (so everyone sees consistent deaths); the host broadcasts the match state.
// =============================================================================
(function () {
  const $ = id => document.getElementById(id);
  const K = 1.22;
  const TEAM_COL = [0x2f6fd8, 0xd8443a], TEAM_CSS = ['#4f8fff', '#ff5a4a'], TEAM_NAME = ['BLUE', 'RED'];
  const BOT_NAMES = ['Viper', 'Nova', 'Echo', 'Rook', 'Blaze', 'Ghost', 'Talon', 'Jinx', 'Onyx', 'Volt', 'Sable', 'Rift'];
  const GUNSETS = {
    duel: null,                                    // your duel loadout (Settings) / random pairs for bots
    shotgun: ['shotgun', null],
    sniper: ['sniper', 'hunter'],
    loadout: null,                                 // TDM/FFA: your loadout (Loadout screen)
  };
  const BOT_POOL = [['rifle', 'shotgun'], ['holoar', 'smg'], ['sniper', 'smg'], ['hunter', 'shotgun'], ['smg', 'shotgun'], ['rifle', 'pistol'], ['lmg', 'pistol'], ['dmr', 'smg']];
  BR.ARENA_PRESETS = {
    duel:    { kind: 'duel', title: 'DUELS', guns: 'duel', sizes: [1, 2], target: 5, roundTime: 90 },
    shotgun: { kind: 'duel', title: 'SHOTGUN DUELS', guns: 'shotgun', sizes: [1, 2], target: 5, roundTime: 60 },
    sniper:  { kind: 'duel', title: 'SNIPER DUELS', guns: 'sniper', sizes: [1, 2], target: 5, roundTime: 90 },
    tdm:     { kind: 'tdm', title: 'TEAM DEATHMATCH', guns: 'loadout', sizes: [4], target: 30, time: 360 },
    ffa:     { kind: 'ffa', title: 'FREE FOR ALL', guns: 'loadout', sizes: [6], target: 20, time: 360 },
  };
  const SPOTS = [[-22, 0], [22, 0], [-15, -10], [15, 10], [-15, 10], [15, -10], [-4, -11], [4, 11], [-8, 4], [8, -4], [-20, -12], [20, 12]];

  BR.ArenaMatch = class ArenaMatch {
    // cfg: { preset, size, diff, roster? (online), net? }
    constructor(game) {
      const c = BR.ArenaMatch.next || {}; BR.ArenaMatch.next = null;
      this.g = game; this.arena = true; this.feed = true; this.noDrops = true; this.cls = 'arenamode';
      this.P = Object.assign({}, BR.ARENA_PRESETS[c.preset || 'duel']); this.preset = c.preset || 'duel';
      this.size = c.size || this.P.sizes[0]; this.diffId = c.diff || 'normal';
      this.net = c.net || null; this.host = !this.net || this.net.isHost; this.me = this.net ? this.net.pid : 'H';
      this.rosterIn = c.roster || null; this.ranked = !!c.ranked; this.mapId = c.map || 'yard';
      this.byId = new Map(); this.stats = {}; this.phase = 'countdown'; this.t = 3; this.round = 0; this.score = [0, 0]; this.time = 0;
      this.respawnQ = []; this.fxQ = []; this.sendT = 0; this.matchT = 0; this.ended = false;
    }

    // ------------------------------------------------------------------ setup
    start() {
      const g = this.g, W = g.world;
      g.diff = BR.CONFIG.difficulty[this.diffId] || BR.CONFIG.difficulty.normal; g.ranked = this.ranked;
      g.zone.mesh.visible = false;
      // roster: [{ id, pid (owner), name, team, bot }]
      let roster = this.rosterIn;
      if (!roster) {
        roster = []; let id = 0;
        const teams = this.P.kind === 'ffa' ? null : [this.size, this.size];
        const nm = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
        roster.push({ id: id++, pid: 'H', name: 'You', team: 0, bot: false });
        if (teams) { for (let i = 1; i < teams[0]; i++) roster.push({ id: id++, pid: null, name: nm.pop(), team: 0, bot: true }); for (let i = 0; i < teams[1]; i++) roster.push({ id: id++, pid: null, name: nm.pop(), team: 1, bot: true }); }
        else for (let i = 1; i < this.size; i++) roster.push({ id: id++, pid: null, name: nm.pop(), team: id, bot: true });
      }
      this.roster = roster;
      g.actors.length = 0;
      for (const r of roster) {
        const mine = r.pid === this.me, ffa = this.P.kind === 'ffa';
        const col = ffa ? new THREE.Color().setHSL((r.id * 0.17) % 1, 0.6, 0.55).getHex() : TEAM_COL[r.team];
        const a = mine ? g.player : new BR.Actor(g, { id: r.id, name: r.name, color: col });
        if (mine) { a.id = r.id; a.name = r.name; }
        a.team = ffa ? r.id + 100 : r.team; a.rosterId = r.id; a.owner = r.bot ? 'H' : r.pid; a.local = r.bot ? this.host : mine; a.isBot = r.bot;
        if (!mine) {
          if (a.local) { a.brain = new BR.BotBrain(a, g, g.diff); a.brain.landedT = 99; }
          else a.netProxy = new BR.NetProxy();
          g.scene.add(a.mesh);
        }
        if (!mine || !g.actors.includes(a)) g.actors.push(a);
        this.byId.set(r.id, a); this.stats[r.id] = { name: r.name, team: a.team, kills: 0, deaths: 0, bot: r.bot };
      }
      this.myActor = g.player; g.player.team = this.byId.get(roster.find(r => r.pid === this.me).id).team;
      g.applyHighlight();
      this.buildHud();
      if (this.net) this.wireNet();
      if (this.host) this.beginRound(); else this.waitT = 0;
    }
    get duel() { return this.P.kind === 'duel'; }
    get picksLoadout() { return this.P.guns === 'duel' || this.P.guns === 'sniper'; }        // Duels + Sniper Duels: pick your guns before every round
    // v1.20: which saved loadout + which guns the picker offers (the Shockwave Launcher only in Sniper Duels)
    loKey() { return this.P.guns === 'sniper' ? 'sniperDuel' : 'duel'; }
    loDefault() { return this.P.guns === 'sniper' ? ['sniper', 'hunter'] : ['rifle', 'shotgun']; }
    loLists() { return this.P.guns === 'sniper' ? [['sniper', 'hunter', 'launcher'], ['hunter', 'sniper', 'launcher']] : [['rifle', 'holoar', 'smg', 'lmg', 'dmr', 'shotgun', 'hunter', 'sniper'], ['pistol', 'revolver', 'smg', 'shotgun']]; }
    myLoadout() { const D = (this.g.settings[this.loKey()] || {}).loadout, def = this.loDefault(), [A, B] = this.loLists(); return [D && A.includes(D[0]) ? D[0] : def[0], D && B.includes(D[1]) ? D[1] : def[1]]; }
    get teams() { return this.P.kind !== 'ffa'; }
    gunsFor(a) {
      const set = this.P.guns;
      if (a.isPlayer && (set === 'duel' || set === 'sniper')) return this.myLoadout();
      if (set === 'shotgun' || set === 'sniper') return GUNSETS[set];
      if (a.isPlayer) { const L = BR.Profile.loadoutGuns(); return [L.primary === 'launcher' ? 'rifle' : L.primary, L.secondary]; }     // (no launcher outside BR / Sniper Duels)
      return BOT_POOL[(a.rosterId * 3 + this.round) % BOT_POOL.length];
    }
    arm(a) {
      const C = BR.CONFIG, gs = this.gunsFor(a);
      a.slots = [gs[0] ? BR.Weapons.create(gs[0]) : null, gs[1] ? BR.Weapons.create(gs[1]) : null, BR.Weapons.create(a.isPlayer ? BR.Profile.melee() : 'bayonet')];
      a.cur = a.slots[0] ? 0 : 2;
      for (const t in a.ammo) a.ammo[t] = C.ammoCap[t];
      a.health = C.actor.maxHealth; a.shield = this.duel ? 50 : 0; a.nades = this.P.guns === 'duel' || this.P.guns === 'loadout' ? 1 : 0;
    }
    safe(x, z) {
      const W = this.g.world, tmp = this._tmp || (this._tmp = []);
      for (let r = 0; r < 6; r += 0.8) for (let k = 0; k < 8; k++) {
        const a = k / 8 * 6.283, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        W.query(px - 0.45, 0.25, pz - 0.45, px + 0.45, 1.8, pz + 0.45, tmp);
        if (!tmp.some(b => !b.ground)) return { x: px, z: pz };
        if (r === 0) break;
      }
      return { x, z };
    }
    teamSpot(team, i) {
      const sp = this.g.world.spawns[team % 2], off = [0, 3.4, -3.4, 6.8, -6.8][i % 5];
      return Object.assign(this.safe(sp.x, sp.z + off), { yaw: sp.yaw });
    }
    freeSpot(a) {
      let best = null, bd = -1;
      const spots = this.g.world.ffaSpots || SPOTS.map(([x, z]) => [x * K, z * K]);      // v1.15: each map has its own
      // v1.21: also keep away from spots handed out in the last few seconds (everyone spawning at once used to
      // land on the same far spot), and prefer spots with no enemy in line of sight
      const now = this.g.time, recent = (this._recent || (this._recent = [])).filter(r => now - r.t < 4); this._recent = recent;
      const W = this.g.world;
      for (const [x, z] of spots) {
        let md = 1e9; for (const o of this.g.actors) if (o !== a && o.alive && o.team !== a.team) { const d = Math.hypot(o.pos.x - x, o.pos.z - z); md = Math.min(md, d < 30 && W.lineOfSight(x, 1.6, z, o.pos.x, o.pos.y + 1.4, o.pos.z) ? d * 0.5 : d); }
        for (const r of recent) md = Math.min(md, Math.hypot(r.x - x, r.z - z));
        md += Math.random() * 4;
        if (md > bd) { bd = md; best = [x, z]; }
      }
      recent.push({ x: best[0], z: best[1], t: now });
      const s = this.safe(best[0], best[1]);
      return Object.assign(s, { yaw: Math.atan2(s.x, s.z) });
    }
    placeAt(a, s) {
      if (a.isPlayer && BR.AntiCheat) BR.AntiCheat.grace();
      const m = a.mover; m.dropping = false; m.vel.set(0, 0, 0); m.pos.set(s.x, this.g.world.groundAt(s.x, s.z, 8), s.z); a.yaw = s.yaw; a.pitch = 0;
    }
    revive(a, s) {
      const g = this.g;
      a.alive = true; a.deathT = 0; a.fireHeld = false; a.lunge = null;
      if (a.mover.grapple) a.mover.releaseGrapple();
      if (!a.isPlayer) {
        if (a.mesh && a.mesh.parent) g.scene.remove(a.mesh);
        a.mesh = a.buildMesh(); g.scene.add(a.mesh); g.highlightActor(a);
        if (a.brain) { a.brain.target = null; a.brain.landedT = 99; }
      }
      if (a.local) { this.arm(a); this.placeAt(a, s); a.spawnLock = { x: a.mover.pos.x, y: a.mover.pos.y, z: a.mover.pos.z }; }
      if (a.netProxy) { a.netProxy.seen = false; a.mover.pos.set(s.x, 0, s.z); }
    }

    // ------------------------------------------------------------------ flow (host)
    beginRound() {
      const g = this.g; this.round++;
      const spawns = [];
      const cnt = [0, 0, 0];
      for (const r of this.roster) {
        const a = this.byId.get(r.id); if (!a) continue;
        const s = this.teams ? this.teamSpot(a.team, cnt[a.team]++) : this.freeSpot(a);
        spawns.push([r.id, +s.x.toFixed(2), +s.z.toFixed(2), +s.yaw.toFixed(3)]);
      }
      this.applyRound({ round: this.round, spawns });
      if (this.net) this.net.send('round', { round: this.round, spawns });
    }
    applyRound(m) {
      this.round = m.round;
      for (const [id, x, z, yaw] of m.spawns) { const a = this.byId.get(id); if (a) this.revive(a, { x, z, yaw }); }
      this.phase = 'countdown'; this.t = this.picksLoadout && m.round === 1 ? 6 : 3; this.lastN = 0; this.frozen = true;
      const title = this.duel ? 'ROUND ' + this.round : this.P.title;
      const sub = this.duel ? (this.teams ? `${TEAM_NAME[0]} ${this.score[0]} – ${this.score[1]} ${TEAM_NAME[1]}` : '') : this.P.kind === 'tdm' ? `First team to ${this.P.target} kills` : `First to ${this.P.target} kills`;
      this.g.hud.duelBanner(title, sub, 'info');
    }
    onKill(victim, killer, wid, head) {
      const g = this.g;
      if (this.net && victim.local && !this._remote) this.net.send('kill', { v: victim.rosterId, k: killer ? killer.rosterId : -1, w: wid, h: !!head });
      if (!this.host) return;
      const sv = this.stats[victim.rosterId]; if (sv) sv.deaths++;
      const sk = killer && killer !== victim ? this.stats[killer.rosterId] : null; if (sk) sk.kills++;
      if (this.P.kind === 'tdm' && killer && killer !== victim) this.score[killer.team]++;
      if (this.P.kind !== 'duel') this.respawnQ.push({ id: victim.rosterId, t: 3 });
      this.pushMatch();
    }
    checkEnd() {
      const P = this.P;
      if (P.kind === 'duel') {
        if (this.phase !== 'fight') return;
        const alive = [0, 1].map(t => this.g.actors.some(a => a.alive && a.team === t));
        let w = null;
        if (!alive[0] && !alive[1]) w = -1; else if (!alive[0]) w = 1; else if (!alive[1]) w = 0;
        else if (this.t <= 0) { const hp = [0, 1].map(t => this.g.actors.filter(a => a.alive && a.team === t).reduce((s, a) => s + a.health + a.shield, 0)); w = hp[0] > hp[1] + 0.5 ? 0 : hp[1] > hp[0] + 0.5 ? 1 : -1; }
        if (w !== null) { if (w >= 0) this.score[w]++; this.phase = 'roundEnd'; this.t = this.picksLoadout && Math.max(...this.score) < P.target ? 7 : 2.6; this.lastWinner = w; this.pushMatch(true); }
      } else if (this.phase === 'fight') {
        const best = P.kind === 'tdm' ? Math.max(...this.score) : Math.max(...Object.values(this.stats).map(s => s.kills));
        if (best >= P.target || this.t <= 0) this.finish();
      }
    }
    finish() {
      if (this.ended) return;
      let winTeam;
      if (this.P.kind === 'ffa') { const top = Object.entries(this.stats).sort((a, b) => b[1].kills - a[1].kills)[0]; winTeam = this.byId.get(+top[0]).team; }
      else winTeam = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
      const m = { winTeam, score: this.score.slice(), stats: this.stats };
      if (this.net) this.net.send('end', m);
      this.applyEnd(m);
    }
    pushMatch(roundEnd) {
      const m = { phase: this.phase, tm: +this.t.toFixed(1), round: this.round, score: this.score, stats: this.stats, lw: roundEnd ? this.lastWinner : undefined };
      if (this.net) this.net.send('match', m);
      if (roundEnd) this.roundBanner(this.lastWinner);
      this.renderHud();
    }
    roundBanner(w) {
      const myT = this.g.player.team, sc = `${TEAM_NAME[0]} ${this.score[0]} – ${this.score[1]} ${TEAM_NAME[1]}`;
      if (w === -1) this.g.hud.duelBanner('DRAW', sc, 'info');
      else if (w === myT) { this.g.hud.duelBanner('ROUND WON', sc, 'win'); BR.Audio.coin(); }
      else this.g.hud.duelBanner('ROUND LOST', sc, 'lose');
    }

    // ------------------------------------------------------------------ per frame
    update(dt) {
      const g = this.g;
      this.time += dt;
      if (this.ended) return;
      if (this.host) {
        this.t -= dt;
        if (this.phase === 'countdown') {
          const n = Math.ceil(this.t); if (n !== this.lastN && n > 0) { this.lastN = n; g.hud.duelCount(String(n)); BR.Audio.click(); }
          if (this.t <= 0) { this.phase = 'fight'; this.frozen = false; this.t = this.duel ? this.P.roundTime : (this.matchLeft ?? this.P.time); g.hud.duelCount('FIGHT!'); BR.Audio.pad && BR.Audio.pad(); this.pushMatch(); }
        } else if (this.phase === 'fight') {
          if (!this.duel) this.matchLeft = this.t;
          for (let i = this.respawnQ.length - 1; i >= 0; i--) { const q = this.respawnQ[i]; q.t -= dt; if (q.t <= 0) { this.respawnQ.splice(i, 1); this.respawnOne(q.id); } }
          this.checkEnd();
        } else if (this.phase === 'roundEnd') {
          if (this.t <= 0) { if (Math.max(...this.score) >= this.P.target) this.finish(); else this.beginRound(); }
        }
        this.matchT -= dt; if (this.matchT <= 0 && this.net) { this.matchT = 0.5; this.pushMatch(); }
      } else {
        if (this.phase === 'countdown') { this.t -= dt; const n = Math.ceil(this.t); if (n !== this.lastN && n > 0) { this.lastN = n; g.hud.duelCount(String(n)); BR.Audio.click(); } }
        else if (this.phase === 'fight') this.t -= dt;
      }
      // hold everyone at their spawn during the countdown
      if (this.frozen) for (const a of g.actors) if (a.local !== false && a.alive && (a.isPlayer || a.brain)) {
        const m = a.mover; m.vel.set(0, 0, 0); a.fireHeld = false; a.lunge = null;
        if (m.grapple) m.releaseGrapple();
        if (a.spawnLock) { m.pos.x = a.spawnLock.x; m.pos.z = a.spawnLock.z; if (m.pos.y > a.spawnLock.y) m.pos.y = a.spawnLock.y; }
      }
      this.loadoutPicker();
      // your own respawn countdown (TDM / FFA)
      const p = g.player;
      if (!p.alive && !this.duel) { this.deadT = (this.deadT || 0) + dt; g.hud.resurgence && g.hud.resurgence(false, Math.max(0, 3 - this.deadT)); } else if (this.deadT) { this.deadT = 0; g.hud.resurgence && g.hud.resurgence(false, null); }
      if (this.net) this.netTick(dt);
      this.renderHud(); this.markers();
    }
    respawnOne(id) {
      const a = this.byId.get(id); if (!a || this.ended) return;
      const s = this.teams ? this.freeSpotTeam(a) : this.freeSpot(a);
      const m = { spawns: [[id, +s.x.toFixed(2), +s.z.toFixed(2), +s.yaw.toFixed(3)]] };
      this.applySpawn(m); if (this.net) this.net.send('spawn', m);
    }
    freeSpotTeam(a) { return this.freeSpot(a); }
    applySpawn(m) { for (const [id, x, z, yaw] of m.spawns) { const a = this.byId.get(id); if (a) this.revive(a, { x, z, yaw }); } }

    // ------------------------------------------------------------------ net
    wireNet() {
      const N = this.net;
      N.on('st', m => { for (const s of m.a) { const a = this.byId.get(s[0]); if (a && a.netProxy) { a.netProxy.set(s); if (!a.alive && s[7] && a.mesh && !a.mesh.parent) { a.alive = true; } } } });
      N.on('fx', m => { for (const f of m.f) this.remoteShot(f); });
      N.on('hit', m => { const v = this.byId.get(m.v); if (!v || !v.local || !v.alive) return;
        if (BR.AntiCheat && m.from && m.from !== this.me) { const ok = BR.AntiCheat.hostHit(m, m.from); if (ok !== true) { if (ok === 'kick' && this.host && N.kick) { N.kick(m.from, 'cheat'); this.g.hud.toast('A player was removed by anti-cheat', 2000); } return; } } this.g.applyDamage(v, this.byId.get(m.a) || null, m.d, m.h, { x: m.at[0], y: m.at[1], z: m.at[2] }, m.w); });
      N.on('kill', m => { const v = this.byId.get(m.v); if (!v || !v.alive) return; this._remote = true; this.g.kill(v, this.byId.get(m.k) || null, m.w, m.h); this._remote = false; });
      N.on('round', m => this.applyRound(m));
      N.on('spawn', m => this.applySpawn(m));
      N.on('match', m => { if (this.host) return; const was = this.phase; this.phase = m.phase; this.t = m.tm; this.round = m.round; this.score = m.score; this.stats = m.stats;
        this.frozen = m.phase === 'countdown'; if (was === 'countdown' && m.phase === 'fight') this.g.hud.duelCount('FIGHT!'); if (m.lw !== undefined) this.roundBanner(m.lw); });
      N.on('end', m => { if (!this.host) this.applyEnd(m); });
      N.on('leave', m => { for (const a of this.g.actors) if (a.owner === m.from && a.alive) { a.alive = false; a.dieVisual(); a.deathT = this.g.time; } this.g.hud.toast('A player left the match', 1600); });
      N.on('closed', () => { if (!this.ended) { this.g.hud.toast('The host closed the match', 2200); setTimeout(() => this.g.toMenu(), 1200); } });
    }
    netTick(dt) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 0.05;
        const ids = BR.Net.WIDS, a = [];
        for (const x of this.g.actors) if (x.local) { const w = x.weapon; a.push([x.rosterId, +x.pos.x.toFixed(2), +x.pos.y.toFixed(2), +x.pos.z.toFixed(2), +x.yaw.toFixed(3), +x.pitch.toFixed(3), w ? ids.indexOf(w.id) : -1, x.alive ? 1 : 0, x.mover.crouched || x.mover.sliding ? 1 : 0, Math.round(x.health)]); }
        if (a.length) this.net.send('st', { a });
      }
      if (this.fxQ.length) { this.net.send('fx', { f: this.fxQ }); this.fxQ = []; }
    }
    netShot(actor, from, to, wid, first) {
      if (!this.net || !actor.local) return;
      this.fxQ.push([actor.rosterId, +from.x.toFixed(2), +from.y.toFixed(2), +from.z.toFixed(2), +to.x.toFixed(2), +to.y.toFixed(2), +to.z.toFixed(2), BR.Net.WIDS.indexOf(wid), first ? 1 : 0]);
    }
    remoteShot(f) {
      const g = this.g, a = this.byId.get(f[0]);
      const from = new THREE.Vector3(f[1], f[2], f[3]), to = new THREE.Vector3(f[4], f[5], f[6]);
      g.fx.tracer(from, to, false, 0xff9a6b, null);
      if (f[8] && a) { const cp = g.camera.position, d = Math.hypot(from.x - cp.x, from.z - cp.z); BR.Audio.shot(BR.Net.WIDS[f[7]], d, 0, false); }
    }
    // a hit on someone this browser doesn't own: send it to their owner, show the feedback here
    netDamage(victim, attacker, dmg, head, at, wid) {
      if (!this.net || victim.local) return false;
      this.net.send('hit', { v: victim.rosterId, a: attacker ? attacker.rosterId : -1, d: +dmg.toFixed(2), h: !!head, w: wid, at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] }, victim.owner === this.me ? undefined : victim.owner);
      if (attacker === this.g.player) {
        const v = this._v || (this._v = new THREE.Vector3()); v.set(at.x, at.y, at.z);
        this.g.hud.hitmarker(head, victim.health - dmg <= 0); this.g.hud.damageNumber(v, dmg, head, victim, false); BR.Audio.hit(head);
        this.g.fx.burst(v, head ? [0xffd24a, 0xffffff] : [0xff4a5a, 0xffffff], head ? 12 : 6, 5, 0.06, 0.35);
      }
      return true;
    }

    // ------------------------------------------------------------------ end
    applyEnd(m) {
      if (this.ended) return; this.ended = true;
      const g = this.g, myT = g.player.team, st = m.stats || this.stats, me = st[g.player.rosterId] || { kills: 0, deaths: 0 };
      const win = m.winTeam === myT;
      const rank = Object.values(st).sort((a, b) => b.kills - a.kills).findIndex(s => s === st[g.player.rosterId]) + 1;
      g.result = { arena: true, preset: this.preset, title: this.P.title + (this.duel ? ` ${this.size}V${this.size}` : ''), win, draw: m.winTeam === -1, kills: me.kills, deaths: me.deaths, damage: g.player.damageDealt, time: this.time,
        score: m.score, ffa: this.P.kind === 'ffa', ranked: this.ranked, map: this.mapId, rank, total: Object.keys(st).length, online: !!this.net, place: win ? 1 : 2,
        by: this.P.kind === 'ffa' ? `#${rank} of ${Object.keys(st).length} · ${me.kills} kills` : `${TEAM_NAME[0]} ${m.score[0]} – ${m.score[1]} ${TEAM_NAME[1]}` };
      g.state = 'dead'; g.endT = 2.4;
      g.hud.duelBanner(m.winTeam === -1 ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT', g.result.by, win ? 'win' : m.winTeam === -1 ? 'info' : 'lose');
      if (win) BR.Audio.victory && BR.Audio.victory();
    }

    // ------------------------------------------------------------------ HUD
    buildHud() {
      if (!$('ar-hud')) { const h = document.createElement('div'); h.id = 'ar-hud'; h.innerHTML = '<div class="ar-score" id="ar-score"></div><div id="ar-marks"></div>'; $('play').appendChild(h); }
      $('ar-hud').classList.remove('hidden');
    }
    renderHud() {
      const P = this.P, tm = BR.fmtTime(Math.max(0, this.t)), me = this.stats[this.g.player.rosterId] || { kills: 0 };
      let html;
      if (P.kind === 'ffa') {
        const top = Object.values(this.stats).sort((a, b) => b.kills - a.kills)[0];
        html = `<span class="ar-t">${P.title}</span><span class="ar-me"><b>${me.kills}</b> YOU</span><i>${tm}</i><span class="ar-top"><b>${top ? top.kills : 0}</b> ${top ? top.name.toUpperCase() : ''}</span><span class="ar-tg">FIRST TO ${P.target}</span>`;
      } else {
        const lbl = P.kind === 'tdm' ? `FIRST TO ${P.target}` : `ROUND ${this.round} · FIRST TO ${P.target}`;
        html = `<span class="ar-t">${P.title}${this.duel ? ` · ${this.size}V${this.size}` : ''}${this.net ? ' · ONLINE' : ''}</span><span class="ar-b" style="--c:${TEAM_CSS[0]}"><b>${this.score[0]}</b>${TEAM_NAME[0]}</span><i>${tm}</i><span class="ar-b" style="--c:${TEAM_CSS[1]}">${TEAM_NAME[1]}<b>${this.score[1]}</b></span><span class="ar-tg">${lbl}</span>`;
      }
      if (html !== this._hud) { this._hud = html; $('ar-score').innerHTML = html; }
    }
    // ---- v1.15 per-round loadout picker (Duels): open between rounds and before round 1
    loadoutPicker() {
      const g = this.g, want = this.picksLoadout && !this.ended && (this.phase === 'roundEnd' || this.phase === 'countdown');
      let el = $('ar-lo');
      if (!want) { if (el && !el.classList.contains('hidden')) el.classList.add('hidden'); return; }
      if (!el) {
        el = document.createElement('div'); el.id = 'ar-lo'; el.className = 'ar-lo ui-touch';       // v1.20: .ui-touch = the game's touch controls leave it alone (scroll + taps work)
        el.addEventListener('mousedown', e => e.stopPropagation());
        for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-slot]'); if (!b) return;
          const M = BR.game.mode; if (!M || !M.arena || !M.loKey) return;           // (the element outlives a match: always act on the current one)
          const gg = BR.game, key = M.loKey(), D = gg.settings[key] = gg.settings[key] || {}; const L = M.myLoadout().slice(), k = +b.dataset.slot;
          if (L[1 - k] === b.dataset.g) L[1 - k] = L[k];        // same gun in both slots -> swap them
          L[k] = b.dataset.g; D.loadout = L; if (BR.saveSettings) BR.saveSettings();
          BR.Audio.pickup(); M._loHtml = null;
          const p = BR.game.player; if (M.phase === 'countdown' && p.alive) { const cur = p.cur; M.arm(p); p.cur = Math.min(cur, 1); if (!p.slots[p.cur]) p.cur = 2; }   // re-arm right away before the fight
        });
        $('play').appendChild(el);
      }
      if (el.classList.contains('hidden')) { el.classList.remove('hidden'); this._loHtml = null; if (this.phase === 'roundEnd') g.input.unlock(); }
      const L = this.myLoadout(), [P1, P2] = this.loLists();
      const W = BR.CONFIG.weapons, pic = BR.WeaponIcons && BR.WeaponIcons.pic || {};
      const row = (ids, slot) => ids.map(id => `<button class="${L[slot] === id ? 'sel' : ''}" data-slot="${slot}" data-g="${id}">${pic[id] ? `<img src="${pic[id]}" alt="">` : ''}<span>${W[id].name}</span></button>`).join('');
      const html = `<div class="ar-lo-h"><b>CHOOSE YOUR LOADOUT</b><span>${this.phase === 'roundEnd' ? 'Next round in ' + Math.ceil(Math.max(0, this.t)) + 's' : 'Round starts in ' + Math.ceil(Math.max(0, this.t)) + 's'}</span></div><div class="ar-lo-l">PRIMARY</div><div class="ar-lo-r">${row(P1, 0)}</div><div class="ar-lo-l">SECONDARY</div><div class="ar-lo-r">${row(P2, 1)}</div>`;
      if (html !== this._loHtml) { this._loHtml = html; el.innerHTML = html; }
    }
    // teammate markers (names over allies, through walls)
    markers() {
      const box = $('ar-marks'), g = this.g, pool = this._mk || (this._mk = []);
      const mates = this.teams ? g.actors.filter(a => !a.isPlayer && a.alive && a.team === g.player.team) : [];
      while (pool.length < mates.length) { const d = document.createElement('div'); d.className = 'ar-mk'; box.appendChild(d); pool.push(d); }
      const W = window.innerWidth, H = window.innerHeight, v = this._mv || (this._mv = new THREE.Vector3());
      pool.forEach((el, i) => { const a = mates[i]; if (!a) { el.style.display = 'none'; return; }
        v.set(a.pos.x, a.pos.y + 2.25, a.pos.z).project(g.camera); if (v.z > 1) { el.style.display = 'none'; return; }
        el.style.display = ''; el.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px)`; if (el._n !== a.name) { el._n = a.name; el.textContent = a.name; } });
    }
    dispose() {
      const h = $('ar-hud'); if (h) h.classList.add('hidden');
      const lo = $('ar-lo'); if (lo) lo.classList.add('hidden');
      if (this._mk) for (const el of this._mk) el.style.display = 'none';
      this.g.hud.resurgence && this.g.hud.resurgence(false, null);
      if (this.net) { BR.Net.leave(); this.net = null; }
    }
  };
})();
