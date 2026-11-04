'use strict';
// =============================================================================
// LOBBY UI (v1.12) — match setup for the arena modes (play with AI, host or join online) and
// the online lobby (code, players by team, host starts). See net.js + arena.js.
// =============================================================================
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DESC = {
    duel: 'Round-based duels: pick your guns before every round. No respawns: last team standing takes the round. First to 5. The map is rolled at the start.',
    shotgun: 'Breacher shotguns only. Close, fast, brutal. First to 5 rounds.',
    sniper: 'Sniper and Hunting Rifle only. Hold angles, land the headshot. First to 5 rounds.',
    tdm: 'Team Deathmatch, 4v4. Respawn after 3 seconds with your loadout. First team to 30 kills.',
    ffa: 'Free For All, 6 players. Everyone for themselves, respawns on. First to 20 kills.',
  };
  const L = BR.Lobby = { preset: 'duel', size: 1, diff: 'normal', sess: null, players: [] };
  const msg = t => { $('am-msg').textContent = t || ''; };
  const name = () => (BR.Accounts && BR.Accounts.displayName && BR.Accounts.displayName()) || 'Player';
  const cap = () => { const P = BR.ARENA_PRESETS[L.preset]; return P.kind === 'ffa' ? L.size : L.size * 2; };

  L.open = preset => {
    L.preset = preset; const P = BR.ARENA_PRESETS[preset]; L.size = P.sizes[0];
    $('am-title').textContent = P.title; $('am-desc').textContent = DESC[preset] || '';
    $('am-sizerow').style.display = P.sizes.length > 1 ? '' : 'none';
    $('am-size').innerHTML = P.sizes.map(n => `<button data-v="${n}" class="${n === L.size ? 'sel' : ''}">${n}V${n}</button>`).join('');
    $('am-diff').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === L.diff));
    msg(''); $('arenamenu').classList.remove('hidden');
  };
  // v1.15: every arena match rolls its map first (equal odds for each map), case-opening style
  L.MAPS = [
    { id: 'yard', name: 'THE YARD', sub: 'Concrete yard · centre tower', art: 'linear-gradient(150deg,#9aa0a8,#4a5160 55%,#1d2128)' },
    { id: 'killhouse', name: 'KILLHOUSE', sub: '3 lanes · training house', art: 'linear-gradient(150deg,#e3d6bc,#8f8676 50%,#2c2823)' },
    { id: 'cargo', name: 'CARGO', sub: 'Tiny container grid', art: 'linear-gradient(150deg,#4f8fc8,#763a35 50%,#1a1d22)' },
  ];
  L.rollMap = () => L.MAPS[Math.floor(Math.random() * L.MAPS.length)].id;
  L.play = (opts) => {
    const g = BR.game; BR.Audio.init();
    const o = Object.assign({ preset: L.preset, size: L.size, diff: L.diff, ranked: !!g.ranked }, opts || {});
    if (!o.map) o.map = L.rollMap();
    for (const id of ['arenamenu', 'lobby', 'discover']) $(id).classList.add('hidden');
    L.showRoll(o.map, () => { BR.ArenaMatch.next = o; g.startMode(BR.ArenaMatch, { arena: true, map: o.map }); });
  };
  L.showRoll = (target, done) => {
    const el = $('maproll'); if (!el || L.skipRoll) { done(); return; }
    const N = 34, at = 29, cards = [];
    for (let i = 0; i < N; i++) cards.push(i === at ? L.MAPS.find(m => m.id === target) : L.MAPS[Math.floor(Math.random() * L.MAPS.length)]);
    const strip = $('mr-strip');
    strip.innerHTML = cards.map(m => `<div class="mr-card" style="--a:${m.art}"><i></i><b>${m.name}</b><span>${m.sub}</span></div>`).join('');
    $('mr-title').textContent = (BR.ARENA_PRESETS[L.preset] || {}).title || 'ARENA';
    $('mr-res').textContent = ''; el.classList.remove('hidden', 'done');
    const cw = 172, t0 = performance.now(), dur = 3600, jitter = (Math.random() - 0.5) * cw * 0.6;
    const end = at * cw + 80 + jitter;     // card 160 px + 12 px gap; land somewhere on the target card
    let lastI = -1;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4), x = end * e;
      strip.style.transform = `translateX(${(-x).toFixed(1)}px)`;
      const i = Math.floor(x / cw); if (i !== lastI) { lastI = i; BR.Audio.click && BR.Audio.click(); }
      if (k < 1) { requestAnimationFrame(step); return; }
      strip.style.transform = `translateX(${-(at * cw + 80)}px)`; strip.style.transition = 'transform .25s ease-out';
      setTimeout(() => { strip.style.transition = ''; }, 260);
      el.classList.add('done'); const m = cards[at]; $('mr-res').textContent = m.name; BR.Audio.coin && BR.Audio.coin();
      setTimeout(() => { el.classList.add('hidden'); done(); }, 1100);
    };
    requestAnimationFrame(step);
  };
  // ---- online lobby
  const render = () => {
    const P = BR.ARENA_PRESETS[L.preset], S = L.sess, host = S && S.isHost;
    $('lb-title').textContent = P.title + (P.kind === 'duel' ? ` ${L.size}V${L.size}` : '') + ' · ONLINE · ' + ((S && !S.isHost ? L.ranked : BR.game.ranked) ? 'RANKED' : 'CASUAL');
    $('lb-code').textContent = S ? S.code : '------';
    const teams = P.kind === 'ffa' ? [{ n: 'PLAYERS', c: '#c8a8ff', list: L.players }] : [0, 1].map(t => ({ n: t ? 'RED' : 'BLUE', c: t ? '#ff5a4a' : '#4f8fff', t, list: L.players.filter(p => p.team === t) }));
    const per = P.kind === 'ffa' ? L.size : L.size;
    $('lb-teams').innerHTML = teams.map(T => `<div class="lb-team" style="--c:${T.c}"><b>${T.n}</b>${T.list.map(p => `<button class="lb-p${p.pid === S.pid ? ' me' : ''}" data-pid="${p.pid}" ${host && P.kind !== 'ffa' ? '' : 'disabled'}>${esc(p.name)}${p.pid === 'H' ? ' <i>HOST</i>' : ''}</button>`).join('')}${Array.from({ length: Math.max(0, per - T.list.length) }, () => '<span class="lb-p ai">AI</span>').join('')}</div>`).join('');
    $('lb-start').style.display = host ? '' : 'none';
    $('lb-info').textContent = host ? 'Send the code to your friends. Empty slots are filled with AI. Tap a player to switch their team.' : 'Waiting for the host to start…';
  };
  const broadcast = () => { if (L.sess && L.sess.isHost) L.sess.send('lobby', { players: L.players, preset: L.preset, size: L.size, diff: L.diff, ranked: !!BR.game.ranked }); render(); };
  const showLobby = () => { $('arenamenu').classList.add('hidden'); $('lobby').classList.remove('hidden'); render(); };
  const onStart = m => { L.preset = m.preset; L.size = m.size; L.diff = m.diff; L.play({ roster: m.roster, net: L.sess, map: m.map, ranked: !!m.ranked }); };
  L.host = async (local) => {
    if (BR.Bans && BR.Bans.blocked(true)) { msg('This account or device is banned from online play'); return; }
    msg('Creating lobby…');
    try {
      const S = L.sess = await BR.Net.host(name(), local);
      L.players = [{ pid: 'H', acct: (BR.Accounts && BR.Accounts.accountId()) || '', name: name(), team: 0 }];
      S.on('dev', m => BR.Dev && BR.Dev.receive(m.sc));
      S.on('board', m => BR.Board && BR.Board.merge(m.list));
      S.on('join', m => {
        if (BR.Bans && BR.Bans.has(m.acct)) { S.send('kicked', { reason: 'banned' }, m.from); setTimeout(() => S.drop(m.from), 150); return; }     // v1.16 banned accounts can't join
        if (L.players.length >= cap()) { S.send('full', {}, m.from); return; }
        if (BR.Bans) { const recs = BR.Bans.records(); if (recs.length) S.send('bans', { list: recs }, m.from); }                                  // share the ban list
        if (BR.Board) S.send('board', { list: BR.Board.top(100) }, m.from);                                                                      // and the leaderboard
        const P = BR.ARENA_PRESETS[L.preset], c0 = L.players.filter(p => p.team === 0).length, c1 = L.players.filter(p => p.team === 1).length;
        L.players.push({ pid: m.from, acct: String(m.acct || '').slice(0, 14), name: String(m.name || 'Player').slice(0, 16), team: P.kind === 'ffa' ? L.players.length : c0 <= c1 ? 0 : 1 });
        BR.Audio.pickup(); broadcast();
      });
      S.on('leave', m => { L.players = L.players.filter(p => p.pid !== m.from); broadcast(); });
      showLobby(); broadcast();
    } catch (e) { msg(e.message || String(e)); }
  };
  L.join = async (code, local) => {
    if (!code || code.length < 4) { msg('Enter the 6-letter lobby code'); return; }
    if (BR.Bans && BR.Bans.blocked(true)) { msg('This account or device is banned from online play'); return; }
    msg('Joining…');
    try {
      const S = L.sess = await BR.Net.join(code, name(), local);
      S.on('lobby', m => { L.players = m.players; L.ranked = !!m.ranked; L.preset = m.preset; L.size = m.size; L.diff = m.diff; if ($('lobby').classList.contains('hidden') && !BR.game.mode) showLobby(); else render(); });
      S.on('full', () => { msg('That lobby is full'); BR.Net.leave(); L.sess = null; $('lobby').classList.add('hidden'); $('arenamenu').classList.remove('hidden'); });
      S.on('start', onStart);
      S.on('dev', m => BR.Dev && BR.Dev.receive(m.sc));                               // signed dev commands (kick / ban / coins)
      S.on('bans', m => BR.Bans && BR.Bans.merge(m.list));
      S.on('board', m => BR.Board && BR.Board.merge(m.list));
      if (BR.Board) S.send('board', { list: BR.Board.top(100) });                       // give the host (and everyone) our board
      S.on('kicked', m => { if (BR.Dev) BR.Dev.kickedOut(m.reason === 'banned' ? 'You are banned from online play' : m.reason === 'cheat' ? 'Removed from the lobby by anti-cheat' : 'You were removed from the lobby'); });
      S.on('closed', () => { if (!BR.game.mode) { $('lobby').classList.add('hidden'); msg('The host closed the lobby'); $('arenamenu').classList.remove('hidden'); } });
      setTimeout(() => { if (L.sess === S && !L.players.length) msg('Connected, waiting for the lobby…'); }, 1500);
    } catch (e) { msg(e.message || String(e)); }
  };
  L.start = () => {
    const S = L.sess, P = BR.ARENA_PRESETS[L.preset]; if (!S || !S.isHost) return;
    const roster = []; let id = 0;
    const nm = ['Viper', 'Nova', 'Echo', 'Rook', 'Blaze', 'Ghost', 'Talon', 'Jinx', 'Onyx', 'Volt', 'Sable', 'Rift'].sort(() => Math.random() - 0.5);
    if (P.kind === 'ffa') { for (const p of L.players) roster.push({ id: id++, pid: p.pid, name: p.name, team: 0, bot: false }); while (roster.length < L.size) roster.push({ id: id++, pid: null, name: nm.pop(), team: 0, bot: true }); }
    else for (const t of [0, 1]) { const hs = L.players.filter(p => p.team === t); for (const p of hs) roster.push({ id: id++, pid: p.pid, name: p.name, team: t, bot: false }); for (let i = hs.length; i < L.size; i++) roster.push({ id: id++, pid: null, name: nm.pop(), team: t, bot: true }); }
    const st = { preset: L.preset, size: L.size, diff: L.diff, roster, map: L.rollMap(), ranked: !!BR.game.ranked };      // the host rolls; everyone watches the same roll
    S.send('start', st);
    onStart(st);
  };

  // ---- wiring
  $('am-x').addEventListener('click', () => $('arenamenu').classList.add('hidden'));
  $('am-size').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; L.size = +b.dataset.v; $('am-size').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); BR.Audio.click(); });
  $('am-diff').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; L.diff = b.dataset.v; $('am-diff').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); BR.Audio.click(); });
  $('am-ai').addEventListener('click', () => L.play());
  $('am-host').addEventListener('click', () => L.host());
  $('am-join').addEventListener('click', () => L.join($('am-code').value.trim().toUpperCase()));
  $('am-code').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') L.join($('am-code').value.trim().toUpperCase()); });
  $('lb-start').addEventListener('click', () => L.start());
  $('lb-leave').addEventListener('click', () => { BR.Net.leave(); L.sess = null; $('lobby').classList.add('hidden'); $('arenamenu').classList.remove('hidden'); msg(''); });
  $('lb-copy').addEventListener('click', () => { try { const pr = navigator.clipboard.writeText(L.sess ? L.sess.code : ''); if (pr && pr.catch) pr.catch(() => {}); BR.game.hud.toast('Code copied', 900); } catch (e) { /* no clipboard */ } });
  $('lb-teams').addEventListener('click', e => { const b = e.target.closest('[data-pid]'); if (!b || !L.sess || !L.sess.isHost) return; const p = L.players.find(q => q.pid === b.dataset.pid); if (!p) return;
    const nt = 1 - p.team; if (L.players.filter(q => q.team === nt).length >= L.size) return; p.team = nt; BR.Audio.click(); broadcast(); });
})();
