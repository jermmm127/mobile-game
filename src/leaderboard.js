'use strict';
// =============================================================================
// RANKED LEADERBOARD (v1.16.1). Real players only, no generated rivals.
//
//  * The board has 50 spots. Until real players earn them, every open spot shows the owner's name
//    (the first built-in dev account). As soon as someone plays Ranked they take a spot (sorted by
//    RP), and one of those placeholder rows drops off.
//  * There is no game server, so the board spreads peer-to-peer: whenever players meet in an online
//    lobby they swap boards (the host passes everyone's entries on), and each player's entry updates
//    after every Ranked match. Accounts on this device are always included.
//  * Each entry is signed with its own account's key (ECDSA P-256, made when the account first
//    plays Ranked, kept with the account on its device). The first key seen for an Account ID is
//    pinned, so nobody can post scores under someone else's ID, and RP can't exceed what the number
//    of Ranked matches allows. Dev accounts and banned accounts are never listed.
// =============================================================================
(function () {
  const SIZE = 50, KEY = 'surge.board', MAX_PER_MATCH = 300;
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const subtle = () => (window.crypto && crypto.subtle) || null;
  const canon = e => JSON.stringify([e.id, e.name, e.rp, e.rm, e.ts, e.pk.x, e.pk.y]);
  const ID_RE = /^SRG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

  BR.Board = {
    SIZE,
    owner() { const s = (BR.CONFIG.seedAccounts || []).find(a => a.dev); return s ? s.name : 'surge'; },
    store() { const d = BR.util.load(KEY, null); return d && d.e ? d : { e: {}, pins: {} }; },
    save(d) {
      const ids = Object.keys(d.e);
      if (ids.length > 600) { ids.sort((a, b) => d.e[b].rp - d.e[a].rp); for (const id of ids.slice(600)) delete d.e[id]; }
      BR.util.save(KEY, d);
    },
    // a structurally valid, believable entry?
    sane(e) {
      return e && ID_RE.test(e.id) && /^[A-Za-z0-9_]{3,16}$/.test(e.name) && Number.isInteger(e.rp) && e.rp >= 0 && e.rp <= 50000 &&
        Number.isInteger(e.rm) && e.rm >= 1 && e.rp <= e.rm * MAX_PER_MATCH && typeof e.ts === 'number' && e.ts <= Date.now() + 864e5 &&
        e.pk && typeof e.pk.x === 'string' && typeof e.pk.y === 'string' && typeof e.sig === 'string';
    },
    async verify(e) {
      try {
        const k = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: e.pk.x, y: e.pk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64(e.sig), new TextEncoder().encode(canon(e)));
      } catch (err) { return false; }
    },
    // merge entries from another player; returns how many were taken
    async merge(list) {
      if (!Array.isArray(list) || !subtle()) return 0;
      const d = this.store(); let n = 0;
      for (const e of list.slice(0, 200)) {
        if (!this.sane(e)) continue;
        const pin = d.pins[e.id];
        if (pin && (pin.x !== e.pk.x || pin.y !== e.pk.y)) continue;            // not that account's key
        const cur = d.e[e.id]; if (cur && cur.ts >= e.ts) continue;
        if (!(await this.verify(e))) continue;
        d.pins[e.id] = { x: e.pk.x, y: e.pk.y }; d.e[e.id] = { id: e.id, name: e.name, rp: e.rp, rm: e.rm, ts: e.ts, pk: e.pk, sig: e.sig }; n++;
      }
      if (n) this.save(d);
      return n;
    },
    // the signed-in account's key pair (made on first use, stored with the account)
    async keys() {
      const A = BR.Accounts, name = A && A.current(); if (!name || !subtle()) return null;
      const u = A.db.users[name];
      if (u.lbk && u.lbk.d) {
        const priv = await subtle().importKey('jwk', u.lbk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        return { priv, pk: { x: u.lbk.x, y: u.lbk.y } };
      }
      const kp = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const jwk = await subtle().exportKey('jwk', kp.privateKey);
      u.lbk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }; A.save();
      return { priv: kp.privateKey, pk: { x: jwk.x, y: jwk.y } };
    },
    // publish this account's entry (after a Ranked match). Returns the entry or null.
    async updateSelf() {
      const A = BR.Accounts, P = BR.Profile.data; if (!A || !A.current() || A.isSeededDev() || P.dev) return null;
      const rm = (P.stats && P.stats.rm) || 0; if (rm < 1) return null;
      const k = await this.keys(); if (!k) return null;
      const e = { id: A.accountId(), name: A.current(), rp: Math.max(0, Math.round(P.rp || 0)), rm, ts: Date.now(), pk: k.pk };
      e.rp = Math.min(e.rp, rm * MAX_PER_MATCH);
      e.sig = b64(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, k.priv, new TextEncoder().encode(canon(e))));
      const d = this.store(), pin = d.pins[e.id];
      if (!pin || (pin.x === e.pk.x && pin.y === e.pk.y)) { d.pins[e.id] = e.pk; d.e[e.id] = e; this.save(d); }
      const S = BR.Net && BR.Net.session; if (S) S.send('board', { list: [e] });
      return e;
    },
    // the best entries this device knows (what gets shared with other players)
    top(n) { return Object.values(this.store().e).sort((a, b) => b.rp - a.rp).slice(0, n || 100); },
    // 50 rows: real ranked players first (by RP), the rest filled with the owner's name
    rows() {
      const me = BR.Accounts && BR.Accounts.accountId(), devIds = new Set(Object.values((BR.Accounts && BR.Accounts.db.users) || {}).filter(u => u.seeded).map(u => u.id));
      const real = Object.values(this.store().e).filter(e => !devIds.has(e.id) && !(BR.Bans && BR.Bans.has(e.id)))
        .sort((a, b) => b.rp - a.rp || a.ts - b.ts).map(e => ({ id: e.id, name: e.name, rp: e.rp, me: e.id === me }));
      const rows = real.slice(0, SIZE), owner = this.owner();
      while (rows.length < SIZE) rows.push({ name: owner, rp: null, holder: true });
      const mine = real.findIndex(r => r.me);
      return { rows, mine, mineRow: mine >= 0 ? real[mine] : null, total: real.length };
    },
  };
})();
