'use strict';
// =============================================================================
// DEV TOOLS (v1.16): a dev menu for the built-in dev accounts to kick or ban players and give coins.
//
// There is no game server, so commands travel peer-to-peer (lobbies / matches) or as codes, and every
// command is SIGNED: an ECDSA P-256 signature made with the dev key (CONFIG.devSign). The private
// key is stored encrypted with the private dev code, so the menu only works after you unlock it with
// that code; every player's game checks the signature with the public key before obeying. A
// signature can't be forged by flipping a flag in the browser.
//
//   kick   target leaves the lobby / match now
//   ban    target account can't play; the device that received it can't play online; hosts refuse it
//   unban  lifts a ban
//   coins  adds coins to the target account (once per command)
//
// Delivery: to players in your lobby or match directly; to accounts on this device directly; to
// anyone else as a GIFT CODE they paste into Account -> Redeem a code. Ban records spread: every host
// shares the bans it knows with players who join, and refuses banned accounts.
// =============================================================================
(function () {
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const canon = c => JSON.stringify([c.c, c.target, c.amount || 0, c.ts, c.n, c.by || '', c.reason || '']);
  const subtle = () => (window.crypto && crypto.subtle) || null;
  let pubKey = null;
  const signCfg = () => (BR.AntiCheat && BR.AntiCheat.testing() && BR._testDevSign) || BR.CONFIG.devSign;     // (test suite: a throwaway key on localhost)
  const pub = async () => { const S = signCfg(); if (pubKey && pubKey.S === S) return pubKey.k; pubKey = { S, k: await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: S.pub.x, y: S.pub.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']) }; return pubKey.k; };

  BR.Bans = {
    KEY: 'surge.bans',
    records() { return BR.util.load(this.KEY, []) || []; },
    has(id) { return !!id && this.records().some(r => r.cmd.target === id); },
    add(sc) { const L = this.records().filter(r => r.cmd.target !== sc.cmd.target); L.push(sc); BR.util.save(this.KEY, L); },
    remove(id) { BR.util.save(this.KEY, this.records().filter(r => r.cmd.target !== id)); },
    deviceBanned() { return !!BR.util.load('surge.devban', null); },
    // is the signed-in account (or this device, for online play) banned?
    blocked(online) { const id = BR.Accounts && BR.Accounts.accountId(); return this.has(id) || (online && this.deviceBanned()); },
    async merge(list) { for (const sc of list || []) if (await BR.Dev.verify(sc) && sc.cmd.c === 'ban' && !this.has(sc.cmd.target)) this.add(sc); },
  };

  BR.Dev = {
    key: null,
    isDev() { return !!(BR.Accounts && BR.Accounts.isSeededDev()); },
    unlocked() { return !!this.key && this.isDev(); },
    async unlock(code) {
      if (!this.isDev()) return { ok: false, msg: 'Dev menu is only for dev accounts' };
      if (!subtle()) return { ok: false, msg: 'This browser can\'t sign (needs https)' };
      const S = signCfg();
      try {
        const base = await subtle().importKey('raw', new TextEncoder().encode(String(code || '').trim().toUpperCase()), 'PBKDF2', false, ['deriveKey']);
        const aes = await subtle().deriveKey({ name: 'PBKDF2', salt: unb64(S.salt), iterations: S.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const pk8 = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(S.iv) }, aes, unb64(S.ct));
        this.key = await subtle().importKey('pkcs8', pk8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        return { ok: true, msg: 'Dev menu unlocked for this session' };
      } catch (e) { this.key = null; return { ok: false, msg: 'Wrong dev code' }; }
    },
    lock() { this.key = null; },
    async sign(c, target, extra) {
      if (!this.unlocked()) throw new Error('Unlock the dev menu first');
      const cmd = Object.assign({ c, target, ts: Date.now(), n: BR.sha256.randomHex(8), by: BR.Accounts.accountId() }, extra || {});
      const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, this.key, new TextEncoder().encode(canon(cmd)));
      return { cmd, sig: b64(sig) };
    },
    async verify(sc) {
      try {
        if (!sc || !sc.cmd || !sc.sig || !subtle()) return false;
        return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, await pub(), unb64(sc.sig), new TextEncoder().encode(canon(sc.cmd)));
      } catch (e) { return false; }
    },
    used(n) { const U = BR.util.load('surge.devn', []) || []; if (U.includes(n)) return true; U.push(n); if (U.length > 400) U.splice(0, U.length - 400); BR.util.save('surge.devn', U); return false; },
    // give coins straight to an account saved on this device
    giveLocal(name, amount) {
      const key = 'velocity-royale.profile.u:' + name.toLowerCase();
      if (BR.Accounts.current() === name) { BR.Profile.data.coins += amount; BR.Profile.save(); if (BR.updateCoins) BR.updateCoins(); return true; }
      const d = BR.AntiCheat.loadSigned(key); if (!d) return false;
      d.coins = (d.coins || 0) + amount; BR.AntiCheat.saveSigned(key, d); return true;
    },
    // a signed command arrived (lobby / match message, or a pasted code). Returns a message or null.
    async receive(sc, via) {
      if (!(await this.verify(sc))) return null;
      const c = sc.cmd, me = BR.Accounts.accountId();
      if (c.c === 'ban') { BR.Bans.add(sc); if (c.target === me) { BR.util.save('surge.devban', { t: Date.now() }); this.kickedOut('You have been banned by a developer' + (c.reason ? ': ' + c.reason : '')); } return 'ban'; }
      if (c.c === 'unban') { BR.Bans.remove(c.target); if (c.target === me) BR.util.save('surge.devban', null); return 'unban'; }
      if (c.target !== me) return null;
      if (this.used(c.n)) return 'used';
      if (c.c === 'kick') { if (Date.now() - c.ts < 10 * 60 * 1000) this.kickedOut('You were kicked by a developer' + (c.reason ? ': ' + c.reason : '')); return 'kick'; }
      if (c.c === 'coins') {
        const amt = Math.max(0, Math.min(1e6, c.amount | 0));
        BR.Profile.data.coins += amt; BR.Profile.save(); if (BR.updateCoins) BR.updateCoins();
        if (BR.game && BR.game.hud) BR.game.hud.toast(`+${amt.toLocaleString()} COINS · gift from the developers`, 2600); if (BR.Audio && BR.Audio.coin) BR.Audio.coin();
        return 'coins';
      }
      return null;
    },
    kickedOut(msg) {
      const g = BR.game;
      if (BR.Net) BR.Net.leave(); if (BR.Lobby) BR.Lobby.sess = null;
      for (const id of ['lobby', 'arenamenu']) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
      if (g && g.state !== 'menu' && g.toMenu) g.toMenu();
      if (g && g.hud) g.hud.toast(msg, 4200);
      if (BR.renderBan) BR.renderBan();
    },
    // gift / ban codes: one line a player pastes into Account -> Redeem a code
    toCode(sc) { return 'SRG1.' + btoa(unescape(encodeURIComponent(JSON.stringify(sc)))); },
    fromCode(s) { s = String(s || '').trim(); if (!s.startsWith('SRG1.')) return null; try { return JSON.parse(decodeURIComponent(escape(atob(s.slice(5))))); } catch (e) { return null; } },
  };
})();
