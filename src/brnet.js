'use strict';
// =============================================================================
// BR ONLINE (v1.24): a party plays Battle Royale / Resurgence together.
//
//  * The party leader's browser hosts (net.js session) and is the authority for the bots.
//  * Every browser builds the same match: startMatch runs on a shared seed (Math.random is swapped for a
//    seeded generator while the match is set up), so the island, loot, bots and their teams are identical.
//    The host also sends every bot's name + team so nothing can drift.
//  * Actors get a shared netId: party members 0..H-1 (in the host's order), bots after them.
//    Your own character runs locally; your party members are NetProxies; the host's bots run their AI on
//    the host and are NetProxies everywhere else.
//  * A hit on someone you don't own goes to their owner (who applies it: shields, knockdowns, kills);
//    deaths, revives, loot pickups and chest openings are broadcast so every screen agrees.
//  * The party is always one squad (duos for 2, trios for 3, squads for 4) so you drop and fight together.
// =============================================================================
BR.BRNet = class BRNet {
  // cfg: { seed, res, squad, bots, diff, humans: [{ pid, name }], names?: {netId: name}, teams?: {netId: team} }
  static begin(game, sess, cfg) {
    if (game.brnet) game.brnet.stop(true);
    const keep = Math.random; Math.random = BR.util.rng(cfg.seed >>> 0);
    try { game.startMatch({ resurgence: !!cfg.res, squad: cfg.squad, seed: cfg.seed, bots: cfg.bots, diff: cfg.diff, online: true }); }
    finally { Math.random = keep; }
    const n = new BR.BRNet(game, sess, cfg); game.brnet = n; n.setup();
    return n;
  }
  constructor(game, sess, cfg) {
    this.g = game; this.net = sess; this.me = sess.pid; this.host = !!sess.isHost; this.cfg = cfg;
    this.sendT = 0; this.fxQ = []; this.byNet = new Map(); this.done = false;
  }
  setup() {
    const g = this.g, C = this.cfg, H = C.humans, meIdx = Math.max(0, H.findIndex(h => h.pid === this.me)), p = g.player;
    const bots = g.actors.filter(a => a !== p), others = H.map((h, i) => i).filter(i => i !== meIdx);
    p.netId = meIdx; p.local = true; p.owner = this.me; p.name = H[meIdx].name;
    bots.forEach((b, k) => {
      if (k < others.length) {                                       // a party member: a puppet of their own browser
        const i = others[k]; b.netId = i; b.owner = H[i].pid; b.name = H[i].name; b.human = true; b.local = false;
        b.brain = null; b.netProxy = new BR.NetProxy();
        const ch = H[i].ch; if (ch && typeof ch === 'object' && b.mesh) {        // wear the outfit + mask they equipped
          b.look = { o: String(ch.o || 'default'), m: String(ch.m || 'default'), h: String(ch.h || 'default') };
          const old = b.mesh; b.mesh = b.buildMesh(); b.mesh.position.copy(old.position); b.mesh.visible = old.visible; if (old.parent) { old.parent.add(b.mesh); old.parent.remove(old); }
        }
      } else {
        b.netId = H.length + (k - others.length); b.owner = H[0].pid; b.local = this.host;
        if (!this.host) { b.brain = null; b.netProxy = new BR.NetProxy(); }
      }
    });
    // the host's bot names + teams win (so a different setting / profile can never shift them)
    for (const a of g.actors) {
      if (C.names && C.names[a.netId] !== undefined && !a.human && a !== p) a.name = C.names[a.netId];
      if (C.teams && C.teams[a.netId] !== undefined) a.team = C.teams[a.netId];
      this.byNet.set(a.netId, a);
    }
    if (g.zone) g.zone.rng = BR.util.rng((C.seed ^ 0x5bd1e995) >>> 0);   // the storm closes the same way everywhere
    g.total = g.actors.length;
    this.wire();
    g.hud.toast(`PLAYING WITH YOUR PARTY · ${H.map(h => h.name).join(', ')}`, 2600);
  }
  // the payload the host sends so members build the identical match
  startMsg() {
    const names = {}, teams = {};
    for (const a of this.g.actors) { names[a.netId] = a === this.g.player ? this.cfg.humans[a.netId].name : a.name; if (a.team !== undefined) teams[a.netId] = a.team; }
    return Object.assign({}, this.cfg, { names, teams });
  }
  actor(id) { const a = this.byNet.get(id); if (a && this.g.actors.includes(a)) return a; const b = this.g.actors.find(x => x.netId === id); if (b) this.byNet.set(id, b); return b || null; }

  // ------------------------------------------------------------------ messages
  wire() {
    const N = this.net, g = this.g;
    N.on('st', m => { if (this.done) return; for (const s of m.a) { const a = this.actor(s[0]); if (!a || !a.netProxy) continue; a.netProxy.set(s); if (!a.alive && s[7] && !a.gone) this.reviveProxy(a); } });
    N.on('fx', m => { if (!this.done) for (const f of m.f) this.remoteShot(f); });
    N.on('hit', m => { if (this.done) return; const v = this.actor(m.v); if (!v || !v.local || !v.alive) return;
      if (BR.AntiCheat && BR.AntiCheat.hostHit && m.from && BR.CONFIG.weapons[m.w]) { const ok = BR.AntiCheat.hostHit(m, m.from); if (ok !== true) return; }
      g.applyDamage(v, this.actor(m.a), m.d, m.h, { x: m.at[0], y: m.at[1], z: m.at[2] }, m.w); });
    N.on('kill', m => { if (this.done) return; const v = this.actor(m.v); if (!v || !v.alive) return; this._remote = true; try { g.kill(v, this.actor(m.k), m.w, m.h); } finally { this._remote = false; } });
    N.on('down', m => { const v = this.actor(m.v); if (v && v.netProxy) { v.downed = true; v.health = BR.Squads.DOWN_HP; } });
    N.on('rev', m => { const v = this.actor(m.v), by = this.actor(m.by); if (v && v.local && v.alive && v.downed) BR.Squads.revive(g, v, by || v); });
    N.on('take', m => this.removeItem(m));
    N.on('chest', m => { const c = g.loot.items.find(i => i.kind === 'chest' && i.id === m.id && !i.taken); if (c) { this._remote = true; try { g.loot.openChest(this.actor(m.a) || g.player, c); } finally { this._remote = false; } } });
    N.on('gone', m => this.dropOwner(m.pid));
    N.on('leave', m => { this.dropOwner(m.from); if (this.host) N.send('gone', { pid: m.from }); });
    N.on('closed', () => { if (this.done) return; g.hud.toast('The party leader left the match', 2400); this.stop(true); const seed = g.world && g.world.seed; setTimeout(() => { if (g.state !== 'menu' && !g.mode && !g.brnet && g.world && g.world.seed === seed) g.toMenu(); }, 1600); });     // (only if you're still in THIS match)
  }
  dropOwner(pid) {
    for (const a of this.g.actors) if (a.owner === pid && a.human && a.alive) { a.gone = true; this._remote = true; try { this.g.kill(a, null, 'leave', false); } finally { this._remote = false; } }
    this.g.hud.toast('A party member left the match', 1600);
  }
  reviveProxy(a) {
    const g = this.g; a.alive = true; a.downed = false; a.deathT = 0; a._rq = false; a.health = 100;
    if (a.mesh && a.mesh.parent) g.scene.remove(a.mesh);
    a.mesh = a.buildMesh(); g.scene.add(a.mesh); g.highlightActor && g.highlightActor(a);
    if (a.mesh.userData.mat && a.color !== undefined) a.mesh.userData.mat.color.setHex(a.color);
    a.netProxy.seen = false;
  }
  removeItem(m) {
    const L = this.g.loot; let it = L.items.find(i => i.id === m.id && i.kind === m.k && !i.taken);
    if (!it || Math.hypot(it.pos.x - m.x, it.pos.z - m.z) > 3) {          // ids drift after death drops: fall back to the nearest match
      let bd = 3; it = null; for (const i of L.items) { if (i.taken || i.kind !== m.k || (m.w && i.wid !== m.w)) continue; const d = Math.hypot(i.pos.x - m.x, i.pos.z - m.z); if (d < bd) { bd = d; it = i; } }
    }
    if (it) L.remove(it);
  }

  // ------------------------------------------------------------------ hooks (called by game / loot / weapons / squads)
  // may this browser kill this actor? (yes for the ones it owns, or when the owner told us so)
  canKill(victim, killer, wid, head) {
    if (this.done) return true;
    if (this._remote) return true;
    if (victim.local === false) return false;
    this.net.send('kill', { v: victim.netId, k: killer && killer.netId !== undefined ? killer.netId : -1, w: wid, h: !!head });
    return true;
  }
  netDamage(victim, attacker, dmg, head, at, wid) {
    if (this.done || victim.local !== false) return false;
    if (attacker && attacker.local === false) return true;              // someone else's shot: their owner already sent it
    this.net.send('hit', { v: victim.netId, a: attacker ? attacker.netId : -1, d: +dmg.toFixed(2), h: !!head, w: wid, at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] }, victim.owner === this.me ? undefined : victim.owner);
    if (attacker === this.g.player) {
      const v = this._v || (this._v = new THREE.Vector3()); v.set(at.x, at.y, at.z);
      this.g.hud.hitmarker(head, victim.health - dmg <= 0); this.g.hud.damageNumber(v, dmg, head, victim, victim.shield > 0, at); BR.Audio.hit(head, victim.shield > 0);
      this.g.fx.burst(v, head ? [0xffd24a, 0xffffff] : [0xff4a5a, 0xffffff], head ? 12 : 6, 5, 0.06, 0.35);
    }
    return true;
  }
  onDown(v) { if (!this.done && v.local) this.net.send('down', { v: v.netId }); }
  reviveDone(v, by) { if (!this.done) this.net.send('rev', { v: v.netId, by: by ? by.netId : -1 }, v.owner === this.me ? undefined : v.owner); }
  took(actor, it) { if (!this.done && actor.local !== false) this.net.send('take', { id: it.id, k: it.kind, w: it.wid, x: +it.pos.x.toFixed(2), z: +it.pos.z.toFixed(2) }); }
  chest(actor, c) { if (!this.done && !this._remote) this.net.send('chest', { id: c.id, a: actor.netId }); }
  chestRng(c) { return BR.util.rng(((this.cfg.seed >>> 0) ^ Math.imul(c.id + 1, 2654435761)) >>> 0); }
  netShot(actor, from, to, wid, first) {
    if (this.done || actor.local === false) return;
    this.fxQ.push([actor.netId, +from.x.toFixed(2), +from.y.toFixed(2), +from.z.toFixed(2), +to.x.toFixed(2), +to.y.toFixed(2), +to.z.toFixed(2), BR.Net.WIDS.indexOf(wid), first ? 1 : 0]);
  }
  remoteShot(f) {
    const g = this.g, from = new THREE.Vector3(f[1], f[2], f[3]), to = new THREE.Vector3(f[4], f[5], f[6]);
    g.fx.tracer(from, to, false, 0xff9a6b, null);
    if (f[8]) { const cp = g.camera.position, d = Math.hypot(from.x - cp.x, from.z - cp.z), pan = BR.util.clamp((from.x - cp.x) / Math.max(1, d), -0.8, 0.8); if (d < 150) BR.Audio.shot(BR.Net.WIDS[f[7]], d, pan, false); }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (this.done) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.05;
      const ids = BR.Net.WIDS, a = [];
      for (const x of this.g.actors) if (x.local && x.netId !== undefined) {
        const w = x.weapon, m = x.mover;
        a.push([x.netId, +x.pos.x.toFixed(2), +x.pos.y.toFixed(2), +x.pos.z.toFixed(2), +x.yaw.toFixed(3), +x.pitch.toFixed(3), w ? ids.indexOf(w.id) : -1, x.alive ? 1 : 0, m.crouched || m.sliding || m.prone ? 1 : 0, Math.round(x.health), x.downed ? 1 : 0, m.dropping ? 1 : 0]);
      }
      if (a.length) this.net.send('st', { a });
    }
    if (this.fxQ.length) { this.net.send('fx', { f: this.fxQ }); this.fxQ = []; }
  }
  stop(quiet) {
    if (this.done) return; this.done = true;
    if (this.g.brnet === this) this.g.brnet = null;
    if (this.g.zone) this.g.zone.rng = null;
    if (BR.Net.session === this.net) BR.Net.leave(); else try { this.net.close(); } catch (e) { /* closed */ }
    void quiet;
  }
};
