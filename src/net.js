'use strict';
// =============================================================================
// NET (v1.12) — peer-to-peer lobbies with no game server.
//
//  * The HOST's browser runs the match (bots, rounds, scores). Friends join with a 6-letter code.
//  * Transport 'peer': WebRTC data channels via PeerJS (loaded on demand from unpkg). Its free
//    public broker only introduces the browsers; game traffic then flows browser-to-browser,
//    so the game can be served from any static host (GitHub Pages included).
//  * Transport 'local': BroadcastChannel — tabs of the same browser (handy for testing and
//    split-screen-ish play on one computer). Used automatically if BR.Net.forceLocal is set.
//  * Star topology: clients talk only to the host; the host relays (msg.to = one peer, else all).
//    Every message: { t: type, from: pid, to?: pid, ...data }.
// =============================================================================
(function () {
  const PEERJS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const makeCode = () => Array.from({ length: 6 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  const rid = () => Math.random().toString(36).slice(2, 10);
  let peerLib = null;
  const loadPeer = () => peerLib || (peerLib = new Promise((res, rej) => {
    if (window.Peer) return res(window.Peer);
    const s = document.createElement('script'); s.src = PEERJS; s.async = true;
    s.onload = () => window.Peer ? res(window.Peer) : rej(new Error('PeerJS failed to load'));
    s.onerror = () => { peerLib = null; rej(new Error('Could not load the online library (offline or blocked)')); };
    document.head.appendChild(s);
  }));

  class Session {
    constructor(code, name, isHost) {
      this.code = code; this.name = name; this.isHost = isHost;
      this.pid = isHost ? 'H' : 'P' + rid(); this.handlers = {}; this.conns = new Map(); this.closed = false;
      this.players = isHost ? [{ pid: 'H', name, team: 0 }] : [];
    }
    on(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); return this; }
    emit(m) { for (const fn of this.handlers[m.t] || []) fn(m); for (const fn of this.handlers['*'] || []) fn(m); }
    // send to everyone (or msg.to); clients go through the host
    send(t, data, to) { const m = Object.assign({}, data, { t, from: this.pid }); if (to) m.to = to; this.out(m); return m; }     // type + sender always win over data fields
    // host: route a message that arrived from a client
    route(m) {
      if (m.to && m.to !== 'H') { this.deliver(m.to, m); return; }
      if (!m.to) for (const pid of this.conns.keys()) if (pid !== m.from) this.deliver(pid, m);
      this.emit(m);
    }
    close() { this.closed = true; }
    acct() { return (BR.Accounts && BR.Accounts.accountId()) || ''; }
    // v1.16 host: remove a player from the lobby / match (they get a 'kicked' message first)
    kick(pid, reason) { if (!this.isHost || !this.conns.has(pid)) return; this.send('kicked', { reason: reason || '' }, pid); setTimeout(() => this.drop(pid), 150); }
  }

  // ---- BroadcastChannel transport (same browser)
  class LocalSession extends Session {
    constructor(code, name, isHost) {
      super(code, name, isHost);
      this.ch = new BroadcastChannel('surge-' + code);
      this.ch.onmessage = e => { const m = e.data; if (this.closed || m.from === this.pid) return; if (m.to && m.to !== this.pid) return;
        if (m.t === '_hello' && this.isHost) { this.conns.set(m.from, true); this.emit({ t: 'join', from: m.from, name: m.name, acct: m.acct }); return; }
        if (m.t === '_bye') { if (this.isHost) { this.conns.delete(m.from); this.emit({ t: 'leave', from: m.from }); } else if (m.from === 'H') this.emit({ t: 'closed' }); return; }
        if (this.isHost && m.to === undefined) { this.emit(m); return; }       // everyone already got it
        this.emit(m); };
    }
    start() { if (!this.isHost) this.ch.postMessage({ t: '_hello', from: this.pid, name: this.name, acct: this.acct() }); return Promise.resolve(this); }
    drop(pid) { if (this.conns.delete(pid)) this.emit({ t: 'leave', from: pid }); }
    out(m) { this.ch.postMessage(m); }
    deliver(pid, m) { this.ch.postMessage(Object.assign({}, m, { to: pid })); }
    close() { if (this.closed) return; try { this.ch.postMessage({ t: '_bye', from: this.pid }); } catch (e) { /* closed */ } super.close(); this.ch.close(); }
  }

  // ---- PeerJS transport (online)
  class PeerSession extends Session {
    async start() {
      const Peer = await loadPeer();
      const hostId = 'surge-lobby-' + this.code;
      return new Promise((res, rej) => {
        const fail = err => rej(new Error(err && err.type === 'unavailable-id' ? 'That lobby code is taken, try again' : err && err.type === 'peer-unavailable' ? 'No lobby with that code' : 'Could not reach the lobby service (' + (err && (err.type || err.message) || 'network') + ')'));
        this.peer = this.isHost ? new Peer(hostId) : new Peer();
        this.peer.on('error', e => { if (!this.ready) fail(e); else if (!this.isHost) this.emit({ t: 'closed' }); });
        this.peer.on('open', () => {
          this.ready = true;
          if (this.isHost) {
            this.peer.on('connection', c => {
              c.on('data', m => { if (m.t === '_hello') { c.pid = m.from; this.conns.set(m.from, c); this.emit({ t: 'join', from: m.from, name: m.name, acct: m.acct }); return; } if (c.pid && m.from !== c.pid) return; this.route(m); });     // (a client can't speak as someone else)
              c.on('close', () => { if (c.pid) { this.conns.delete(c.pid); this.emit({ t: 'leave', from: c.pid }); } });
            });
            res(this);
          } else {
            const c = this.conn = this.peer.connect(hostId, { reliable: true });
            const to = setTimeout(() => fail({ type: 'peer-unavailable' }), 12000);
            c.on('open', () => { clearTimeout(to); c.send({ t: '_hello', from: this.pid, name: this.name, acct: this.acct() }); res(this); });
            c.on('data', m => this.emit(m));
            c.on('close', () => this.emit({ t: 'closed' }));
          }
        });
      });
    }
    out(m) { if (this.isHost) { for (const [pid, c] of this.conns) if (!m.to || m.to === pid) c.open && c.send(m); } else if (this.conn && this.conn.open) this.conn.send(m); }
    deliver(pid, m) { const c = this.conns.get(pid); if (c && c.open) c.send(m); }
    drop(pid) { const c = this.conns.get(pid); if (!c) return; this.conns.delete(pid); try { c.close(); } catch (e) { /* gone */ } this.emit({ t: 'leave', from: pid }); }
    close() { if (this.closed) return; super.close(); try { this.peer && this.peer.destroy(); } catch (e) { /* gone */ } }
  }

  BR.Net = {
    forceLocal: false,
    loadPeer,                                    // v1.20: shared with party.js (friends + parties)
    session: null,
    makeCode,
    transport(local) { return local || this.forceLocal ? LocalSession : PeerSession; },
    async host(name, local) { this.leave(); const S = this.transport(local); const s = new S(makeCode(), name, true); await s.start(); return (this.session = s); },
    async join(code, name, local) { this.leave(); const S = this.transport(local); const s = new S(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''), name, false); await s.start(); return (this.session = s); },
    leave() { if (this.session) { this.session.close(); this.session = null; } },
  };

  // A remote actor (another player's character, or a bot simulated on the host): follows the
  // latest snapshot smoothly; never runs physics or AI locally.
  BR.NetProxy = class NetProxy {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.seen = false; this.w = null; }
    set(s) { this.x = s[1]; this.y = s[2]; this.z = s[3]; this.yaw = s[4]; this.pitch = s[5]; this.w = s[6]; this.alive = !!s[7]; this.crouch = !!s[8]; this.hp = s[9]; this.downed = s[10] === undefined ? undefined : !!s[10]; this.drop = !!s[11]; if (!this.seen) { this.seen = true; this.snap = true; } }
    apply(a, dt) {
      const m = a.mover, k = this.snap ? 1 : 1 - Math.exp(-dt * 14); this.snap = false;
      const ox = m.pos.x, oz = m.pos.z;
      m.pos.x += (this.x - m.pos.x) * k; m.pos.y += (this.y - m.pos.y) * k; m.pos.z += (this.z - m.pos.z) * k;
      m.vel.set((m.pos.x - ox) / Math.max(dt, 1e-3), 0, (m.pos.z - oz) / Math.max(dt, 1e-3));
      m.onGround = !this.drop; m.crouched = this.crouch; m.dropping = this.drop;
      if (this.downed !== undefined) { a.downed = this.downed; m.prone = this.downed; }            // v1.24 party BR: knocked down / still in the drop
      a.yaw = this.yaw; a.pitch = this.pitch;
      if (this.hp !== undefined) a.health = this.hp;
      const ids = BR.Net.WIDS, wid = ids[this.w];
      if (wid && (!a.slots[0] || a.slots[0].id !== wid)) { a.slots[0] = BR.Weapons.create(wid); a.cur = 0; }
      if (a.mesh && a.alive) a.syncMesh(dt);
    }
  };
  BR.Net.WIDS = Object.keys(BR.CONFIG.weapons);
})();
