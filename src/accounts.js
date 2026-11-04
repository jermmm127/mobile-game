'use strict';
// =============================================================================
// ACCOUNTS — local (on-device) accounts. Each account has its own coins,
// cosmetics and stats (see BR.Profile in shop.js). Signed-out players are
// "Guest".
//
// Dev access: redeeming the private dev code (CONFIG.devCodeHash is its
// SHA-256) marks THAT account as dev = infinite coins on this device.
//
// GOING ONLINE: everything here runs on the player's device, so a determined
// player can edit their own storage. That's fine offline, but once there's a
// server, coins, purchases and the dev flag must live on the server:
//   POST /api/signup  {username, password}      -> {token}
//   POST /api/login   {username, password}      -> {token}
//   GET  /api/profile (Authorization: token)    -> {coins, owned, equip, stats, dev}
//   POST /api/buy     {category, id}            -> {coins, owned}      (server checks price)
//   POST /api/match   {matchId, kills, ...}     -> {coinsAwarded}      (server validates)
//   POST /api/equip   {category, id}
// Swap the methods below for fetch() calls with the same names and delete the
// dev-code check from the client. Nothing else in the game needs to change.
// =============================================================================
BR.Accounts = {
  KEY: 'velocity-royale.accounts',
  db: null,

  load() {
    const d = BR.util.load(this.KEY, null) || {};
    this.db = { users: d.users || {}, current: null };
    // Built-in accounts (CONFIG.seedAccounts) exist everywhere; local ones can't replace them
    for (const s of BR.CONFIG.seedAccounts || []) {
      for (const k of Object.keys(this.db.users)) if (k.toLowerCase() === s.name.toLowerCase() && k !== s.name) delete this.db.users[k];
      const old = this.db.users[s.name] || {};
      this.db.users[s.name] = { salt: s.salt, hash: s.hash, seeded: true, id: this.seedId(s.name), created: old.created || 0, last: old.last || 0, };
    }
    // v1.15: every account gets a permanent, unique Account ID (for support lookups)
    let dirty = false;
    const taken = new Set(Object.values(this.db.users).map(u => u.id).filter(Boolean));
    for (const u of Object.values(this.db.users)) if (!u.id) { u.id = this.newId(taken); taken.add(u.id); dirty = true; }
    if (d.current && this.db.users[d.current]) this.db.current = d.current;
    if (dirty) this.save();
    return this;
  },

  // Account IDs look like SRG-7K3Q-92XD (no 0/O/1/I so they're easy to read out loud)
  ID_CH: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  newId(taken) {
    let id;
    do {
      const r = BR.sha256.randomHex(8), c = [];
      for (let i = 0; i < 8; i++) c.push(this.ID_CH[parseInt(r.substr(i * 2, 2), 16) % 32]);
      id = 'SRG-' + c.slice(0, 4).join('') + '-' + c.slice(4).join('');
    } while (taken && taken.has(id));
    return id;
  },
  // built-in accounts get the same ID on every device (derived from the name)
  seedId(name) {
    let h = 2166136261; const c = [];
    for (const ch of 'surge:' + name.toLowerCase()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    for (let i = 0; i < 8; i++) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; c.push(this.ID_CH[h % 32]); }
    return 'SRG-' + c.slice(0, 4).join('') + '-' + c.slice(4).join('');
  },
  accountId(name) { const n = name === undefined ? this.db.current : name; const u = n && this.db.users[n]; return u ? u.id : null; },
  save() { BR.util.save(this.KEY, this.db); },

  current() { return this.db.current; },
  displayName() { return this.db.current || 'Guest'; },
  profileKey() { return 'velocity-royale.profile.' + (this.db.current ? 'u:' + this.db.current.toLowerCase() : 'guest'); },

  validName(n) { return /^[A-Za-z0-9_]{3,16}$/.test(n); },

  async signUp(name, pass) {
    name = (name || '').trim();
    if (!this.validName(name)) return { ok: false, msg: 'Username: 3–16 letters, numbers or _' };
    if (!pass || pass.length < 4) return { ok: false, msg: 'Password: at least 4 characters' };
    if (Object.keys(this.db.users).some(u => u.toLowerCase() === name.toLowerCase())) return { ok: false, msg: 'That username is taken on this device' };
    const salt = BR.sha256.randomHex(16);
    const id = this.newId(new Set(Object.values(this.db.users).map(u => u.id)));
    this.db.users[name] = { salt, hash: await BR.sha256.hex(salt + ':' + pass), id, created: Date.now(), last: Date.now() };
    this.db.current = name;
    this.save();
    return { ok: true };
  },

  async logIn(name, pass) {
    name = (name || '').trim();
    const key = Object.keys(this.db.users).find(u => u.toLowerCase() === name.toLowerCase());
    const u = key && this.db.users[key];
    if (!u || (await BR.sha256.hex(u.salt + ':' + (pass || ''))) !== u.hash) return { ok: false, msg: 'Wrong username or password' };
    this.db.current = key;
    u.last = Date.now();
    this.save();
    return { ok: true, mustChange: !!u.mustChange };
  },

  async checkPassword(pass) {
    const u = this.db.current && this.db.users[this.db.current];
    return !!u && (await BR.sha256.hex(u.salt + ':' + (pass || ''))) === u.hash;
  },
  async changePassword(oldPass, newPass) {
    if (!(await this.checkPassword(oldPass))) return { ok: false, msg: 'Current password is wrong' };
    if (!newPass || newPass.length < 4) return { ok: false, msg: 'Password: at least 4 characters' };
    const u = this.db.users[this.db.current]; if (u.seeded) return { ok: false, msg: 'Built-in accounts keep their password' };
    u.salt = BR.sha256.randomHex(16); u.hash = await BR.sha256.hex(u.salt + ':' + newPass); delete u.mustChange; this.save();
    return { ok: true, msg: 'Password changed' };
  },

  // ---- Support panel (built-in dev account only, unlocked by re-typing its password) ----------
  // Lists every account stored on THIS device. Passwords are one-way hashes: nobody can read
  // them, not even the admin. Support can only issue a one-time temporary password.
  adminUntil: 0,
  adminOpen() { return this.isSeededDev() && performance.now() < this.adminUntil; },
  async adminUnlock(pass) {
    if (!this.isSeededDev()) return { ok: false, msg: 'Not available on this account' };
    if (!(await this.checkPassword(pass))) { this.adminUntil = 0; return { ok: false, msg: 'Wrong password' }; }
    this.adminUntil = performance.now() + 10 * 60 * 1000;       // stays open 10 minutes
    return { ok: true };
  },
  adminLock() { this.adminUntil = 0; },
  adminList(query) {
    if (!this.adminOpen()) return null;
    const q = String(query || '').trim().toUpperCase();
    return Object.keys(this.db.users).map(name => {
      const u = this.db.users[name], p = BR.util.load('velocity-royale.profile.u:' + name.toLowerCase(), null) || {};
      const st = p.stats || {}; let lv = 0, left = p.xp || 0;
      if (p.dev) lv = BR.LEVELS.max; else while (lv < BR.LEVELS.max && left >= BR.LEVELS.need(lv)) { left -= BR.LEVELS.need(lv); lv++; }
      return { name, id: u.id, created: u.created || 0, last: u.last || 0, builtIn: !!u.seeded, dev: !!p.dev, level: lv, coins: p.coins || 0, rp: p.rp || 0, matches: st.matches || 0, wins: st.wins || 0, temp: !!u.mustChange };
    }).filter(r => !q || r.id.includes(q) || r.name.toUpperCase().includes(q)).sort((a, b) => (b.last || b.created) - (a.last || a.created));
  },
  async adminResetPassword(name) {
    if (!this.adminOpen()) return { ok: false, msg: 'Support panel is locked' };
    const u = this.db.users[name];
    if (!u || u.seeded) return { ok: false, msg: 'Can’t reset that account' };
    const temp = Array.from({ length: 8 }, () => this.ID_CH[Math.random() * 32 | 0]).join('');
    u.salt = BR.sha256.randomHex(16); u.hash = await BR.sha256.hex(u.salt + ':' + temp); u.mustChange = true; this.save();
    return { ok: true, temp, msg: 'Temporary password for ' + name + ': ' + temp + ' (shown once)' };
  },
  adminExport() {
    const rows = this.adminList(); if (!rows) return '';
    const d = t => t ? new Date(t).toISOString().slice(0, 10) : '';
    return ['account_id,username,created,last_login,level,coins,rp,matches,wins'].concat(rows.map(r => [r.id, r.name, d(r.created), d(r.last), r.level, r.coins, r.rp, r.matches, r.wins].join(','))).join('\n');
  },

  logOut() { this.db.current = null; this.adminUntil = 0; this.save(); },

  // Is the signed-in account a built-in dev account?
  isSeededDev() {
    const c = this.db.current;
    return !!c && (BR.CONFIG.seedAccounts || []).some(s => s.dev && s.name === c);
  },

  // Returns {ok, msg}. On success the current account's profile becomes dev.
  async redeem(code) {
    if (!this.db.current) return { ok: false, msg: 'Sign in to an account first' };
    const h = await BR.sha256.hex((code || '').trim().toUpperCase());
    const want = (BR.AntiCheat && BR.AntiCheat.testing() && BR._testDevHash) || BR.CONFIG.devCodeHash;      // (the test suite uses a throwaway code on localhost)
    if (h !== want) return { ok: false, msg: 'That code isn’t valid' };
    BR.Profile.data.dev = true;
    BR.Profile.grantAll();
    BR.Profile.save();
    return { ok: true, msg: 'Dev access unlocked: infinite coins + every item' };
  },
};

// SHA-256: Web Crypto when available (https / localhost), small JS fallback otherwise
// (e.g. testing over plain http on your Wi-Fi).
BR.sha256 = {
  randomHex(bytes) {
    const a = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < bytes; i++) a[i] = Math.random() * 256 | 0;
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  },
  async hex(text) {
    const data = new TextEncoder().encode(text);
    if (window.crypto && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* fall through */ }
    }
    return this.js(data);
  },
  js(bytes) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    const w = new Uint32Array(64), r = (x, s) => (x >>> s) | (x << (32 - s));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  },
};
