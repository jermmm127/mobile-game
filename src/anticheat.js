'use strict';
// =============================================================================
// ANTI-CHEAT (v1.16). The game runs in the player's browser with no game server, so nothing here
// is unbreakable; it stops the easy cheats and makes the rest noisy:
//  * SIGNED SAVES: every profile save carries a signature (and a signed backup copy). A save edited
//    outside the game (coins, XP, RP, unlocks...) fails the check and is rolled back to the last
//    good backup, or has its currencies wiped if there is none.
//  * LOCKED STATS: weapon, movement, health, coin and level tables are frozen at startup, so they
//    can't be changed from the browser console.
//  * RUNTIME CHECKS on your own player: speed / teleport, health + shield above max, ammo above the
//    magazine, fire rate faster than the gun, damage per hit above the gun's maximum.
//  * REWARD SANITY: impossible match results (too many kills, wins in seconds, results faster than a
//    match can finish) pay nothing.
//  * ONLINE (host side, arena.js): hits from other players are checked against the gun's maximum
//    damage and fire rate; repeat offenders are kicked from the lobby.
// Every detection is logged (BR.AntiCheat.log, shown in the dev menu). Enough serious strikes turn
// Ranked off for the account.
// =============================================================================
BR.AntiCheat = {
  PEPPER: 'srg~v1.16~7f3a1c9e',
  strikes: 0, log: [], lastAward: 0,
  // the automated test suite stages impossible things on purpose (999-damage kills, stubbed saves); it only
  // switches the checks off when the game is served from this machine
  testing() { return !!this._testing && typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname); },
  enc(s) { return new TextEncoder().encode(s); },
  sig(key, json) { return BR.sha256.js(this.enc(this.PEPPER + '|' + key + '|' + json)).slice(0, 40); },
  // ---- signed saves ---------------------------------------------------------
  saveSigned(key, data) {
    const json = JSON.stringify(data), sg = this.sig(key, json);
    try {
      localStorage.setItem(key, json); localStorage.setItem(key + '.sig', sg);
      const reg = JSON.parse(localStorage.getItem('surge.acs') || '[]'); if (!reg.includes(key)) { reg.push(key); localStorage.setItem('surge.acs', JSON.stringify(reg)); }
      localStorage.setItem(key + '.bk', btoa(unescape(encodeURIComponent(json))).split('').reverse().join('')); localStorage.setItem(key + '.bks', sg);
    } catch (e) { /* storage full / blocked */ }
  },
  verify(key, d) {
    let sg = null, reg = []; try { sg = localStorage.getItem(key + '.sig'); reg = JSON.parse(localStorage.getItem('surge.acs') || '[]'); } catch (e) { return true; }
    if (!sg) return !reg.includes(key);                          // unsigned older saves are accepted once, then signed; a removed signature is not
    return sg === this.sig(key, JSON.stringify(d));
  },
  loadSigned(key) {
    const d = BR.util.load(key, null);
    if (!d || this.testing() || this.verify(key, d)) return d;
    // tampered: try the signed backup
    let bk = null;
    try { const raw = localStorage.getItem(key + '.bk'), s2 = localStorage.getItem(key + '.bks'); if (raw && s2) { const j = decodeURIComponent(escape(atob(raw.split('').reverse().join('')))); if (this.sig(key, j) === s2) bk = JSON.parse(j); } } catch (e) { bk = null; }
    this.flag('save-edit', bk ? 'save edited outside the game, restored the last good copy' : 'save edited outside the game, currencies reset', 5);
    if (bk) return bk;
    d.coins = 0; d.xp = 0; d.rp = 0; d.dev = false; d.acTampered = (d.acTampered || 0) + 1;
    return d;
  },
  // ---- locked stat tables ---------------------------------------------------
  deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) this.deepFreeze(o[k]); } return o; },
  lock() {
    const C = BR.CONFIG;
    for (const k of ['weapons', 'actor', 'movement', 'coins', 'difficulty', 'match', 'ammoCap', 'look']) if (C[k]) { this.deepFreeze(C[k]); try { Object.defineProperty(C, k, { value: C[k], writable: false, configurable: false }); } catch (e) { /* already locked */ } }
    for (const k of ['devCodeHash', 'devSign', 'seedAccounts']) if (C[k]) { this.deepFreeze(C[k]); try { Object.defineProperty(C, k, { value: C[k], writable: false, configurable: false }); } catch (e) { /* already locked */ } }
    for (const k of ['LEVELS', 'KNIFE_LEVEL', 'RARITY']) if (BR[k]) { this.deepFreeze(BR[k]); try { Object.defineProperty(BR, k, { value: BR[k], writable: false, configurable: false }); } catch (e) { /* already locked */ } }
  },
  // ---- detections -----------------------------------------------------------
  flag(kind, detail, sev) {
    sev = sev || 1;
    this.log.unshift({ t: Date.now(), kind, detail, sev }); if (this.log.length > 40) this.log.length = 40;
    this.strikes += sev;
    const P = BR.Profile && BR.Profile.data;
    if (P) { P.ac = P.ac || { strikes: 0 }; P.ac.strikes = (P.ac.strikes || 0) + sev; P.ac.last = kind; }
  },
  rankedBlocked() { if (this.testing()) return false;
    const P = BR.Profile && BR.Profile.data; return this.strikes >= 12 || !!(P && P.ac && P.ac.strikes >= 25); },
  active(g) { return g && !g.practice && !g.demo && !g.zm && !(g.mode && (g.mode.aim || g.mode.overdrive || g.mode.cls === 'aimmode')); },
  maxHit(wid) {
    const d = BR.CONFIG.weapons[wid]; if (!d) return 9999;
    return Math.max(d.dmg * (d.head || 2), d.backstab || 0, d.dmg) * 1.5 + 1;
  },
  // called by game.applyDamage for damage dealt BY the local player: returns the allowed damage
  checkHit(g, attacker, dmg, wid) {
    if (!attacker || !attacker.isPlayer || !this.active(g) || this.testing()) return dmg;
    const mx = this.maxHit(wid);
    if (dmg > mx) { this.flag('damage', `${wid} hit for ${Math.round(dmg)} (max ${Math.round(mx)})`, 3); return mx; }
    return dmg;
  },
  // called by Weapons.tryFire after a shot by the local player
  onShot(g, actor, w) {
    if (!actor.isPlayer || !this.active(g) || !w || w.def.melee || this.testing()) return;
    const now = performance.now(), min = 60000 / (w.def.rpm || 600) * 0.45;
    if (this._lastShot && w === this._lastW && now - this._lastShot < min && !(w.def.pellets > 1)) { this._fast = (this._fast || 0) + 1; if (this._fast > 6) { this._fast = 0; this.flag('fire-rate', `${w.id} firing faster than ${w.def.rpm} rpm`, 2); } }
    this._lastShot = now; this._lastW = w;
  },
  // per-frame checks on your own player
  tick(g, dt) {
    const p = g.player; if (!p || !this.active(g) || g.state !== 'playing' || this.testing()) { this._pos = null; return; }
    const A = BR.CONFIG.actor, cap = A.maxHealth + 1;
    if (p.health > cap) { p.health = A.maxHealth; this.flag('health', 'health above max', 3); }
    if (p.shield > (A.maxShield || 100) + 1) { p.shield = A.maxShield || 100; this.flag('shield', 'shield above max', 3); }
    const w = p.weapon; if (w && !w.def.melee && w.mag > w.def.mag * 1.01 + 1 && !(g.mode && g.mode.infAmmo)) { w.mag = w.def.mag; this.flag('ammo', `${w.id} magazine above ${w.def.mag}`, 2); }
    const m = p.mover;
    if (!p.alive || m.dropping || m.grapple || g.freezeT > 0) { this._pos = null; return; }
    if (this._pos && dt > 0) {
      const dx = m.pos.x - this._pos.x, dz = m.pos.z - this._pos.z, d = Math.hypot(dx, dz);
      if (d > 14 && !this._grace) this.flag('teleport', `moved ${d.toFixed(1)} m in one frame`, 3);
      else if (d / dt > 60 && !this._grace) { this._fastMove = (this._fastMove || 0) + 1; if (this._fastMove > 20) { this._fastMove = 0; this.flag('speed', `moving at ${(d / dt).toFixed(0)} m/s`, 2); } }
    }
    this._grace = false;
    this._pos = { x: m.pos.x, z: m.pos.z };
  },
  grace() { this._grace = true; this._pos = null; },          // respawns / teleports the game does itself
  // match results: returns false when the result is impossible (no rewards)
  checkResult(r) {
    const now = Date.now(), kills = r.kills || 0, time = r.time || 0;
    let bad = null;
    if (kills < 0 || (r.total && !r.arena && kills > r.total)) bad = `${kills} kills in a ${r.total}-player match`;
    else if (time > 0 && kills > time / 0.9 + 4 && !r.zombies && !r.overdrive) bad = `${kills} kills in ${Math.round(time)} s`;
    else if (r.win && !r.arena && !r.zombies && !r.overdrive && !r.duel && time > 0 && time < 25) bad = `won a battle royale in ${Math.round(time)} s`;
    else if (now - this.lastAward < 8000 && !this.testing()) bad = 'match results arriving faster than a match can be played';
    this.lastAward = now;
    if (bad) { this.flag('result', bad, 4); return false; }
    return true;
  },
  // host: validate a hit reported by another player (returns false to drop it)
  hostHit(m, fromPid) {
    const mx = this.maxHit(m.w);
    const v = this._remote || (this._remote = {}); const s = v[fromPid] || (v[fromPid] = { n: 0, last: 0, fast: 0 });
    const now = performance.now(), d = BR.CONFIG.weapons[m.w], min = d ? 60000 / (d.rpm || 600) * 0.4 / Math.max(1, d.pellets || 1) : 0;
    let bad = null;
    if (!d) bad = 'unknown weapon ' + m.w; else if (m.d > mx) bad = `hit for ${Math.round(m.d)} with ${m.w} (max ${Math.round(mx)})`;
    else if (now - s.last < min) { s.fast++; if (s.fast > 8) { s.fast = 0; bad = `${m.w} hitting faster than its fire rate`; } }
    s.last = now;
    if (bad) { s.n++; this.log.unshift({ t: Date.now(), kind: 'online', detail: `${fromPid}: ${bad}`, sev: 0 }); return s.n >= 3 ? 'kick' : false; }
    return true;
  },
};
