'use strict';
// =============================================================================
// FRIENDS + PARTIES (v1.20) — no game server, so this rides the same peer-to-peer layer as the online
// lobbies (net.js: PeerJS online, BroadcastChannel between tabs when BR.Net.forceLocal is set).
//
//  * PRESENCE: while the game is open and you're signed in, you can be reached by your account ID and by
//    your username. Friend requests, accepts and party invites are short messages sent straight to the
//    other player. Both players have to be online at the same moment; requests to someone offline are
//    kept and retried while the menu is open.
//  * FRIENDS are saved on your account (BR.Profile.data.friends).
//  * PARTY: the leader hosts a small session; invited friends join it. Everyone in the party shows up in the
//    main menu lineup with the gun they have equipped, in their camo / blueprint.
//  * QUEUE: the leader presses PLAY on an online mode (Duels, Shotgun / Sniper Duels, TDM, FFA): the leader
//    hosts an online lobby and every party member joins it automatically, on the leader's team.
// =============================================================================
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40);
  const PRE_ID = 'surge-u-', PRE_NAME = 'surge-n-';
  const ONLINE_MODES = { duels: 'duel', duel: 'duel', shotgun: 'shotgun', sniper: 'sniper', tdm: 'tdm', ffa: 'ffa' };
  const rid = () => Math.random().toString(36).slice(2, 10);

  const P = BR.Party = {
    me: null,                 // { id, name } while presence is up
    online: {},               // friend id -> last time they answered a ping
    requests: [],             // incoming friend requests { id, name }
    invites: [],              // incoming party invites { code, id, name }
    party: null,              // { sess, code, leader: bool, members: [{ pid, id, name, look }] }
    status: '',

    myId() { return (BR.Accounts && BR.Accounts.accountId && BR.Accounts.accountId()) || null; },
    myName() { return (BR.Accounts && BR.Accounts.displayName && BR.Accounts.displayName()) || 'Guest'; },
    local() { return !!BR.Net.forceLocal; },
    friends() { const d = BR.Profile && BR.Profile.data; if (!d) return []; return (d.friends = d.friends || []); },
    pendingOut() { const d = BR.Profile && BR.Profile.data; if (!d) return []; return (d.friendsOut = d.friendsOut || []); },
    save() { BR.Profile && BR.Profile.save(); },
    isFriend(id) { return this.friends().some(f => f.id === id); },
    // what the other players see of you in the lineup: the gun you'd drop in with, in your camo / blueprint
    look() {
      const Pr = BR.Profile, L = Pr.loadoutGuns(), eq = Pr.data.equip || {};
      return { wid: L.primary, skin: Pr.skinFor(L.primary), bp: (eq.blueprints || {})[L.primary] || null, lv: Pr.level(), rp: Pr.data.rp || 0, col: P.colorFor(this.myId() || this.myName()) };
    },
    colorFor(key) { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.55).getHex(); },

    // ---------------------------------------------------------------- presence
    async start() {
      const id = this.myId(), name = this.myName();
      if (!id) { this.stop(); return; }                                   // guests can't have friends (no ID)
      if (this.me && this.me.id === id) return;
      this.stop();
      this.me = { id, name };
      if (this.local()) {
        this.ch = new BroadcastChannel('surge-presence');
        this.ch.onmessage = e => { const m = e.data; if (!m || m.from === id) return;
          if (m.re) { const w = this.waits && this.waits[m.re]; if (w) { delete this.waits[m.re]; w(m); } return; }
          if (m.to === 'i:' + norm(id) || m.to === 'n:' + norm(name)) this.handle(m, r => this.ch.postMessage(Object.assign({ re: m.rid, from: id }, r))); };
        this.retryLoop(); return;
      }
      try {
        const Peer = await BR.Net.loadPeer();
        const serve = peer => peer.on('connection', c => c.on('data', m => this.handle(m, r => { try { c.send(r); } catch (e) { /* gone */ } })));
        this.peer = new Peer(PRE_ID + norm(id)); serve(this.peer);
        this.peer.on('error', e => { this.status = e && e.type === 'unavailable-id' ? 'This account is already online on another device' : 'Friends are offline (' + ((e && e.type) || 'network') + ')'; this.render(); });
        this.namePeer = new Peer(PRE_NAME + norm(name)); serve(this.namePeer);
        this.namePeer.on('error', () => { /* name taken by another device: you're still reachable by ID */ });
        this.status = ''; this.retryLoop();
      } catch (e) { this.status = 'Friends need an internet connection (' + (e.message || e) + ')'; this.render(); }
    },
    stop() {
      try { this.ch && this.ch.close(); } catch (e) { /* closed */ } this.ch = null;
      try { this.peer && this.peer.destroy(); this.namePeer && this.namePeer.destroy(); } catch (e) { /* gone */ }
      this.peer = this.namePeer = null; this.me = null; clearInterval(this._retry);
      if (this.party) this.leaveParty(true);
    },
    // send one message to a player (by { id } or { name }); resolves with their reply, or null if they're offline
    request(target, msg, timeout) {
      const to = target.id ? 'i:' + norm(target.id) : 'n:' + norm(target.name), me = this.me;
      if (!me) return Promise.resolve(null);
      const body = Object.assign({ from: me.id, fromName: me.name, rid: rid(), to }, msg);
      return new Promise(res => {
        const done = r => { clearTimeout(t); res(r); };
        const t = setTimeout(() => { if (this.waits) delete this.waits[body.rid]; res(null); }, timeout || 6000);
        if (this.local()) { (this.waits = this.waits || {})[body.rid] = done; this.ch.postMessage(body); return; }
        if (!this.peer) { done(null); return; }
        let c; try { c = this.peer.connect((target.id ? PRE_ID + norm(target.id) : PRE_NAME + norm(target.name)), { reliable: true }); } catch (e) { done(null); return; }
        c.on('open', () => c.send(body));
        c.on('data', r => { done(r); setTimeout(() => { try { c.close(); } catch (e) { /* closed */ } }, 50); });
        c.on('error', () => done(null));
      });
    },
    // messages from other players
    handle(m, reply) {
      const me = this.me; if (!me || !m || !m.t) return;
      const who = { id: String(m.from || '').slice(0, 16), name: String(m.fromName || 'Player').slice(0, 20) };
      if (BR.Bans && BR.Bans.has && BR.Bans.has(who.id)) return;
      this.online[who.id] = Date.now();
      if (m.t === 'ping') { reply({ t: 'pong', id: me.id, name: me.name, party: !!(this.party && this.party.members.length > 1) }); return; }
      if (m.t === 'freq') {
        if (this.isFriend(who.id)) { reply({ t: 'ok', id: me.id, name: me.name, already: true }); return; }
        const out = this.pendingOut().find(f => f.id === who.id || norm(f.name) === norm(who.name));
        if (out) { this.addFriend(who); reply({ t: 'facc', id: me.id, name: me.name }); this.toast(`You and ${who.name} are now friends`); return; }   // both asked: friends
        if (!this.requests.some(r => r.id === who.id)) this.requests.push(who);
        reply({ t: 'ok', id: me.id, name: me.name }); this.toast(`${who.name} sent you a friend request`); this.render(); return;
      }
      if (m.t === 'facc') { this.addFriend(who); reply({ t: 'ok' }); this.toast(`${who.name} accepted your friend request`); return; }
      if (m.t === 'fdel') { this.removeFriend(who.id, true); reply({ t: 'ok' }); return; }
      if (m.t === 'invite') {
        if (!this.isFriend(who.id)) { reply({ t: 'no' }); return; }
        this.invites = this.invites.filter(i => i.id !== who.id); this.invites.push({ code: String(m.code).slice(0, 12), id: who.id, name: who.name });
        reply({ t: 'ok' }); this.toast(`${who.name} invited you to their party`); this.renderInvite(); this.render(); return;
      }
      reply({ t: 'no' });
    },
    toast(t) { if (BR.game && BR.game.hud) BR.game.hud.toast(t, 2200); if (BR.Audio && BR.Audio.pickup) BR.Audio.pickup(); },

    // ---------------------------------------------------------------- friends
    addFriend(who) {
      const F = this.friends(); if (!F.some(f => f.id === who.id)) F.push({ id: who.id, name: who.name });
      const O = this.pendingOut(); for (let i = O.length - 1; i >= 0; i--) if (O[i].id === who.id || norm(O[i].name) === norm(who.name)) O.splice(i, 1);
      this.requests = this.requests.filter(r => r.id !== who.id);
      this.online[who.id] = Date.now(); this.save(); this.render();
    },
    removeFriend(id, quiet) {
      const d = BR.Profile.data; d.friends = this.friends().filter(f => f.id !== id); this.save();
      if (!quiet) this.request({ id }, { t: 'fdel' }, 3000);
      this.render();
    },
    async add(text) {
      text = String(text || '').trim(); if (!text) return this.msg('Type a username or an ID like SRG-AB12-CD34');
      if (!this.me) return this.msg('Sign in to add friends');
      const byId = /^srg-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(text), target = byId ? { id: text.toUpperCase() } : { name: text };
      if ((byId && target.id === this.me.id) || (!byId && norm(text) === norm(this.me.name))) return this.msg('That’s you');
      if (this.friends().some(f => (byId ? f.id === target.id : norm(f.name) === norm(text)))) return this.msg('Already friends');
      this.msg('Sending…');
      const r = await this.request(target, { t: 'freq' });
      if (!r) { const O = this.pendingOut(); if (!O.some(o => (o.id && o.id === target.id) || (o.name && norm(o.name) === norm(target.name)))) O.push(Object.assign({ name: target.name || target.id }, target)); this.save();
        return this.msg(`${text} isn’t online right now. The request will be sent when you’re both online.`); }
      if (r.t === 'facc' || r.already) { this.addFriend({ id: r.id, name: r.name }); return this.msg(`You and ${r.name} are now friends`); }
      const O = this.pendingOut(); if (!O.some(o => o.id === r.id)) O.push({ id: r.id, name: r.name }); this.save();
      this.msg(`Friend request sent to ${r.name}`); this.render();
    },
    async accept(id) {
      const q = this.requests.find(r => r.id === id); if (!q) return;
      this.addFriend(q); await this.request({ id }, { t: 'facc' }); this.toast(`You and ${q.name} are now friends`);
    },
    decline(id) { this.requests = this.requests.filter(r => r.id !== id); this.render(); },
    // retry requests to players who were offline, and refresh who's online, while the menu is open
    retryLoop() {
      clearInterval(this._retry);
      const tick = () => {
        if (!this.me || !BR.game || BR.game.state !== 'menu') return;
        for (const o of this.pendingOut().slice()) this.request(o.id ? { id: o.id } : { name: o.name }, { t: 'freq' }, 4000).then(r => { if (r && (r.t === 'facc' || r.already)) this.addFriend({ id: r.id, name: r.name }); else if (r && r.id && !o.id) { o.id = r.id; o.name = r.name; this.save(); } });
        if (!$('friends').classList.contains('hidden')) this.refreshOnline();
      };
      this._retry = setInterval(tick, 20000); setTimeout(tick, 1500);
    },
    refreshOnline() { for (const f of this.friends()) this.request({ id: f.id }, { t: 'ping' }, 4000).then(r => { if (r) { this.online[f.id] = Date.now(); if (r.name && r.name !== f.name) { f.name = r.name; this.save(); } } else delete this.online[f.id]; this.render(); }); },
    isOnline(id) { return !!this.online[id] && Date.now() - this.online[id] < 60000; },

    // ---------------------------------------------------------------- party
    inParty() { return !!(this.party && this.party.members.length > 1); },
    isLeader() { return !this.party || this.party.leader; },
    hasAcct(acct) { return !!(this.party && acct && this.party.members.some(m => m.id === acct)); },
    members() {
      if (this.party) return this.party.members;
      return [{ pid: 'me', id: this.myId(), name: this.myName(), look: this.look(), me: true, leader: true }];
    },
    async hostParty() {
      if (this.party) return this.party;
      const S = BR.Net.transport(this.local()), code = 'PTY' + BR.Net.makeCode();
      const sess = new S(code, this.myName(), true);
      await sess.start();
      const party = this.party = { sess, code, leader: true, members: [{ pid: 'H', id: this.myId(), name: this.myName(), look: this.look(), me: true, leader: true }] };
      sess.on('join', m => { if (party.members.length >= 4) { sess.send('pfull', {}, m.from); return; } party.members.push({ pid: m.from, id: String(m.acct || '').slice(0, 16), name: String(m.name || 'Player').slice(0, 20), look: null }); this.pushParty(); this.toast(`${m.name} joined your party`); });
      sess.on('look', m => { const x = party.members.find(q => q.pid === m.from); if (x) { x.look = m.look; this.pushParty(); } });
      sess.on('leave', m => { const x = party.members.find(q => q.pid === m.from); party.members = party.members.filter(q => q.pid !== m.from); if (x) this.toast(`${x.name} left the party`); this.pushParty(); });
      return party;
    },
    pushParty() { const p = this.party; if (!p) return; if (p.leader) p.sess.send('party', { members: p.members.map(m => ({ pid: m.pid, id: m.id, name: m.name, look: m.look, leader: m.pid === 'H' })) }); this.render(); BR.PartyStage && BR.PartyStage.sync(); },
    async invite(id) {
      const f = this.friends().find(x => x.id === id); if (!f) return;
      try { await this.hostParty(); } catch (e) { return this.msg('Could not start a party (' + (e.message || e) + ')'); }
      if (!this.party.leader) return this.msg('Only the party leader can invite');
      const r = await this.request({ id }, { t: 'invite', code: this.party.code });
      this.msg(r && r.t === 'ok' ? `Invite sent to ${f.name}` : `${f.name} isn’t online right now`);
    },
    async joinInvite(code) {
      const inv = this.invites.find(i => i.code === code); this.invites = this.invites.filter(i => i.code !== code); this.renderInvite();
      if (this.party) this.leaveParty(true);
      const S = BR.Net.transport(this.local()), sess = new S(code, this.myName(), false);
      try { await sess.start(); } catch (e) { this.toast('That party is gone'); return; }
      const party = this.party = { sess, code, leader: false, members: [] };
      sess.on('party', m => { party.members = (m.members || []).map(x => Object.assign({}, x, { me: x.pid === sess.pid })); this.render(); BR.PartyStage && BR.PartyStage.sync(); });
      sess.on('pfull', () => { this.toast('That party is full'); this.leaveParty(true); });
      sess.on('closed', () => { if (this.party === party) { this.party = null; this.toast('The party was closed'); this.render(); BR.PartyStage && BR.PartyStage.sync(); } });
      sess.on('go', m => this.follow(m));
      sess.send('look', { look: this.look() });
      this.toast(`Joined ${inv ? inv.name + '’s' : 'the'} party`); this.render();
    },
    leaveParty(quiet) {
      const p = this.party; if (!p) return; this.party = null;
      try { p.sess.close(); } catch (e) { /* closed */ }
      if (!quiet) this.toast('You left the party');
      this.render(); BR.PartyStage && BR.PartyStage.sync();
    },
    // leader: queue the party into a mode everyone plays together.
    //  * Duels / TDM / FFA: host an online lobby, everyone joins it, and it starts by itself once the whole party is in.
    //  * Battle Royale / Resurgence (v1.24): host a party match (brnet.js); the party drops in as one squad.
    async queue(modeId) {
      if (modeId === 'br' || modeId === 'resurgence') return this.queueBR(modeId);
      const preset = ONLINE_MODES[modeId];
      if (!preset) { BR.game.hud.toast('That mode is solo only. With a party, pick Battle Royale, Resurgence, Duels, Shotgun Duels, Sniper Duels, TDM or Free For All.', 3600); return false; }
      const L = BR.Lobby, PR = BR.ARENA_PRESETS[preset], n = this.party.members.length;
      L.open(preset); L.size = PR.kind === 'duel' ? Math.min(Math.max(...PR.sizes), Math.max(PR.sizes[0], n)) : Math.max(PR.sizes[0], n);
      await L.host();
      if (!L.sess) return false;
      this.party.sess.send('go', { preset, size: L.size, code: L.sess.code });
      // start as soon as everyone in the party has joined the lobby (or after 12 s with whoever made it)
      const t0 = Date.now(), S = L.sess, want = () => this.party ? this.party.members.length : 1;
      BR.game.hud.toast('Waiting for your party to join…', 2000);
      while (L.sess === S && BR.game.state === 'menu' && L.players.length < want() && Date.now() - t0 < 12000) await new Promise(r => setTimeout(r, 200));
      if (L.sess === S && BR.game.state === 'menu') L.start();
      return true;
    },
    async queueBR(modeId) {
      const res = modeId === 'resurgence', H = this.party.members.length, local = this.local();
      BR.game.hud.toast('Starting your party match…', 2000);
      let S; try { BR.Net.leave(); S = await BR.Net.host(this.myName(), local); } catch (e) { BR.game.hud.toast('Could not start the party match (' + (e.message || e) + ')', 3000); return false; }
      const joined = [];
      S.on('join', m => { if (!joined.some(j => j.pid === m.from)) joined.push({ pid: m.from, name: String(m.name || 'Player').slice(0, 16) }); });
      S.on('leave', m => { const i = joined.findIndex(j => j.pid === m.from); if (i >= 0 && !BR.game.brnet) joined.splice(i, 1); });
      this.party.sess.send('go', { kind: 'br', mode: modeId, code: S.code });
      const t0 = Date.now();
      while (joined.length < H - 1 && Date.now() - t0 < 12000) await new Promise(r => setTimeout(r, 150));
      if (BR.Net.session !== S) return false;
      const st = BR.game.settings, squad = Math.min(4, Math.max(BR.squadFor ? BR.squadFor(modeId) : 1, joined.length + 1, 2));
      const cfg = { seed: Math.floor(Math.random() * 2 ** 31), res, squad, bots: res ? 23 : st.bots, diff: st.difficulty, humans: [{ pid: 'H', name: this.myName() }].concat(joined) };
      const N = BR.BRNet.begin(BR.game, S, cfg);
      S.send('brstart', N.startMsg());
      if (joined.length < H - 1) BR.game.hud.toast('Some of your party didn’t connect in time', 2600);
      return true;
    },
    async follow(m) {
      if (BR.game.state !== 'menu') BR.game.toMenu();
      if (m.kind === 'br') {                                     // v1.24: join the leader's Battle Royale / Resurgence match
        BR.game.hud.toast('Joining your party’s match…', 2000);
        let S; try { BR.Net.leave(); S = await BR.Net.join(String(m.code), this.myName(), this.local()); } catch (e) { BR.game.hud.toast('Could not join your party’s match (' + (e.message || e) + ')', 3000); return; }
        S.on('brstart', cfg => { if (BR.Net.session === S && !BR.game.brnet) BR.BRNet.begin(BR.game, S, cfg); });
        S.on('closed', () => { if (!BR.game.brnet) BR.game.hud.toast('Your party leader cancelled the match', 2000); });
        return;
      }
      const L = BR.Lobby; if (!BR.ARENA_PRESETS[m.preset]) return;
      L.open(m.preset); L.size = m.size; L.join(String(m.code));
      BR.game.hud.toast('Joining your party’s lobby…', 1600);
    },

    // ---------------------------------------------------------------- UI
    msg(t) { const e = $('fr-msg'); if (e) e.textContent = t || ''; },
    open() { $('friends').classList.remove('hidden'); this.start(); this.refreshOnline(); this.render(); },
    render() {
      const box = $('friends'); if (!box || box.classList.contains('hidden')) { this.renderInvite(); return; }
      const me = this.me;
      $('fr-me').innerHTML = me ? `<span>YOUR ID</span><b>${esc(me.id)}</b><i>${esc(me.name)}</i><button id="fr-copy" class="mbtn sm">COPY</button>` : '<span>Sign in to add friends and make a party</span>';
      $('fr-status').textContent = this.status;
      const row = (f, btns) => `<div class="fr-row"><i class="fr-dot ${this.isOnline(f.id) ? 'on' : ''}"></i><span class="fr-n"><b>${esc(f.name)}</b><small>${esc(f.id || '')}${this.isOnline(f.id) ? ' · online' : ''}</small></span>${btns}</div>`;
      $('fr-req').innerHTML = this.requests.length ? '<div class="fr-h">FRIEND REQUESTS</div>' + this.requests.map(r => row(r, `<button class="mbtn sm hot" data-acc="${esc(r.id)}">ACCEPT</button><button class="mbtn sm" data-dec="${esc(r.id)}">✕</button>`)).join('') : '';
      $('fr-inv').innerHTML = this.invites.length ? '<div class="fr-h">PARTY INVITES</div>' + this.invites.map(v => row(v, `<button class="mbtn sm hot" data-join="${esc(v.code)}">JOIN</button>`)).join('') : '';
      const F = this.friends(), inP = id => this.party && this.party.members.some(m => m.id === id);
      $('fr-list').innerHTML = '<div class="fr-h">FRIENDS · ' + F.length + '</div>' + (F.length ? F.map(f => row(f, inP(f.id) ? '<em class="fr-tag">IN PARTY</em>' : `<button class="mbtn sm" data-inv="${esc(f.id)}">INVITE</button><button class="mbtn sm ghost" data-del="${esc(f.id)}" aria-label="Remove friend">✕</button>`)).join('') : '<div class="fr-empty">No friends yet: add someone by username or ID.</div>')
        + (this.pendingOut().length ? '<div class="fr-h">SENT</div>' + this.pendingOut().map(o => `<div class="fr-row sent"><span class="fr-n"><b>${esc(o.name || o.id)}</b><small>waiting for them to accept</small></span></div>`).join('') : '');
      const pm = this.party ? this.party.members : [];
      $('fr-party').innerHTML = this.party ? `<div class="fr-h">PARTY · ${pm.length}/4${this.party.leader ? ' · YOU LEAD' : ''}</div>` + pm.map(m => `<div class="fr-row"><i class="fr-dot on"></i><span class="fr-n"><b>${esc(m.name)}${m.leader ? ' ★' : ''}</b><small>${m.me ? 'you' : esc(m.id || '')}</small></span></div>`).join('') + '<button id="fr-leave" class="mbtn sm">LEAVE PARTY</button>' : '';
      this.renderInvite();
    },
    renderInvite() {
      const el = $('pt-invite'); if (!el) return;
      const v = this.invites[0];
      el.classList.toggle('hidden', !v || !BR.game || BR.game.state !== 'menu');
      if (v) el.innerHTML = `<span><b>${esc(v.name)}</b> invited you to their party</span><button class="mbtn sm hot" data-join="${esc(v.code)}">JOIN</button><button class="mbtn sm" data-skip="${esc(v.code)}">✕</button>`;
    },
  };

  // ---- wiring
  const wire = () => {
    $('btn-friends').addEventListener('click', () => { BR.Audio.init(); BR.Audio.click(); P.open(); });
    $('fr-x').addEventListener('click', () => $('friends').classList.add('hidden'));
    $('fr-add').addEventListener('click', () => { P.add($('fr-input').value); $('fr-input').value = ''; });
    $('fr-input').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { P.add($('fr-input').value); $('fr-input').value = ''; } });
    $('friends').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (b.id === 'fr-copy') { try { const pr = navigator.clipboard.writeText(P.me ? P.me.id : ''); if (pr && pr.catch) pr.catch(() => {}); } catch (err) { /* no clipboard */ } BR.game.hud.toast('ID copied', 900); }
      else if (b.id === 'fr-leave') P.leaveParty();
      else if (d.acc) P.accept(d.acc); else if (d.dec) P.decline(d.dec);
      else if (d.inv) P.invite(d.inv); else if (d.del) P.removeFriend(d.del);
      else if (d.join) P.joinInvite(d.join);
    });
    $('pt-invite').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.join) P.joinInvite(b.dataset.join); else { P.invites = P.invites.filter(i => i.code !== b.dataset.skip); P.renderInvite(); } });
    $('pt-slots').addEventListener('click', e => { if (e.target.closest('[data-add]')) { BR.Audio.init(); BR.Audio.click(); P.open(); } });
    setTimeout(() => P.start(), 800);
    setInterval(() => { if (P.myId() !== (P.me && P.me.id)) P.start(); }, 3000);     // signed in / out / switched account
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();

// =============================================================================
// PARTY LINEUP — the main menu shows everyone in your party standing on the stage (you in the middle),
// each holding the gun they have equipped in their camo / blueprint, with a name plate. Empty spots have
// a "+" to invite a friend. Its own small renderer, only running while the menu is on screen.
// =============================================================================
BR.PartyStage = (function () {
  const $ = id => document.getElementById(id);
  const S = { members: [], figs: [], key: '' };
  const SLOT_X = [0, -1.15, 1.15, 2.2], SLOT_Z = [0, 0.45, 0.45, 1.0];          // v1.21.1: you in front, party fanned out behind
  const order = list => { const me = list.find(m => m.me) || list[0], rest = list.filter(m => m !== me); return [me].concat(rest).filter(Boolean).slice(0, 4); };
  const init = () => {
    const cv = $('pt-stage'); if (!cv || S.r) return !!S.r;
    try { S.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { return false; }
    S.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    S.scene = new THREE.Scene();
    S.scene.add(new THREE.HemisphereLight(0xe9dcff, 0x2a1440, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(2, 4, 5); S.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc084fc, 0.9); rim.position.set(-3, 2, -3); S.scene.add(rim);
    // glowing pads under each slot
    S.pads = SLOT_X.map((x, i) => { const g = new THREE.Group(); g.position.set(x, 0, -SLOT_Z[i]);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.06, 40), new THREE.MeshPhongMaterial({ color: 0x241038, emissive: 0x1a0a2a, shininess: 60 })); disc.position.y = -0.03; g.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.018, 8, 48), new THREE.MeshBasicMaterial({ color: i ? 0x8a5cff : 0xffc24a })); ring.rotation.x = Math.PI / 2; g.add(ring);
      S.scene.add(g); return g; });
    S.cam = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    S.cam.position.set(0.45, 1.2, 7.3); S.cam.lookAt(0.45, 0.95, -0.4);
    return true;
  };
  // a menu figure: the in-game character (actors.js) holding the member's gun in their finish
  const fig = (m, i) => {
    const L = m.look || {}, wid = BR.CONFIG.weapons[L.wid] ? L.wid : 'rifle', yaw = Math.PI - 0.62 + (i === 0 ? 0 : i % 2 ? 0.12 : -0.12);     // three-quarter view toward the camera: the gun shows side-on
    const fake = { color: L.col || 0x8a6cff, yaw, pitch: -0.05, downed: false, weapon: { id: wid },
      mover: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), speedH: 0, dropping: false, chute: false, sliding: false, crouched: false, onGround: true, wallRunning: false, wallN: new THREE.Vector3() } };
    fake.mover.pos.set(SLOT_X[i], 0, -SLOT_Z[i]);
    const mesh = BR.Actor.prototype.buildMesh.call(fake); fake.mesh = mesh; mesh.userData.yaw = yaw;
    BR.Actor.prototype.syncMesh.call(fake, 0.016);       // builds the joints' first pose
    const u = mesh.userData; while (u.gun.children.length) u.gun.remove(u.gun.children[0]);
    let gm; try { gm = BR.Models.worldWeapon(wid, L.bp || null, L.skin || 'default'); } catch (e) { gm = BR.Models.worldWeapon(wid); }
    gm.scale.setScalar(1.15); u.gun.add(gm); u.wid = wid; u.gp = BR.Models.gripPoints(wid); u.gunScale = 1.15;
    return { m, fake, mesh, t: Math.random() * 6 };
  };
  const sync = () => {
    if (!init()) return;
    const list = order(BR.Party.members()), key = list.map(m => (m.id || m.name) + '|' + JSON.stringify(m.look || {})).join(';');
    if (key !== S.key) {
      S.key = key;
      for (const f of S.figs) S.scene.remove(f.mesh);
      S.figs = list.map((m, i) => { const f = fig(m, i); S.scene.add(f.mesh); return f; });
    }
    // name plates + "+" slots (HTML over the canvas)
    const plates = $('pt-slots'); if (!plates) return;
    const html = [0, 1, 2, 3].map(i => { const m = list[i];
      if (!m) return `<button class="pt-add" data-add="1" data-slot="${i}" aria-label="Invite a friend"><b>+</b><span>INVITE</span></button>`;
      const lv = m.look && m.look.lv !== undefined ? `<i>LV ${m.look.lv}</i>` : '';
      return `<div class="pt-plate${i === 0 ? ' me' : ''}" data-slot="${i}"><b>${String(m.name).replace(/[&<>"]/g, '')}${m.leader && list.length > 1 ? ' ★' : ''}</b>${lv}</div>`; }).join('');
    if (html !== S.html) { S.html = html; plates.innerHTML = html; }
    S.list = list;
  };
  const place = () => {
    const cv = $('pt-stage'), plates = $('pt-slots'); if (!cv || !plates) return;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    const v = S._v || (S._v = new THREE.Vector3());
    plates.querySelectorAll('[data-slot]').forEach(el => { const i = +el.dataset.slot; v.set(SLOT_X[i], el.classList.contains('pt-add') ? 1.0 : 2.15, -SLOT_Z[i]).project(S.cam);
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(0)}px,${((-v.y * 0.5 + 0.5) * H).toFixed(0)}px) translate(-50%,-50%)`; });
  };
  let last = 0, acc = 0;
  const frame = now => {
    requestAnimationFrame(frame);
    const g = BR.game, on = g && g.state === 'menu' && !document.hidden && $('menu') && !$('menu').classList.contains('hidden');
    if (!on || !S.r) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; acc += dt;
    if (acc < 1 / 30) return; const step = acc; acc = 0;                     // ~30 fps is plenty for idle poses
    const cv = $('pt-stage'), W = cv.clientWidth, H = cv.clientHeight;
    if (W && H && (cv.width !== Math.round(W * S.r.getPixelRatio()) || cv.height !== Math.round(H * S.r.getPixelRatio()))) { S.r.setSize(W, H, false); S.cam.aspect = W / H; S.cam.updateProjectionMatrix(); }
    for (const f of S.figs) { f.t += step; f.fake.pitch = -0.08 + Math.sin(f.t * 0.9) * 0.04; BR.Actor.prototype.syncMesh.call(f.fake, step); }
    S.r.render(S.scene, S.cam); place();
  };
  const boot = () => { if (!$('pt-stage')) return; sync(); requestAnimationFrame(frame); setInterval(() => { if (BR.game && BR.game.state === 'menu') sync(); }, 1500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 400)); else setTimeout(boot, 400);
  return { sync, state: S };
})();
