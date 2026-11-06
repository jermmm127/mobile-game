// Two-player online test (v1.12): two pages in one browser talk over BroadcastChannel (the same
// code path as WebRTC lobbies, minus the PeerJS broker). Host makes a TDM lobby, guest joins with
// the code, host starts; checks sync of roster, bots, snapshots, a cross-player hit, kill + score.
// Run from the repo root:  node tools/net-test.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, r)); const url = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 320 } }), A = await ctx.newPage(), B = await ctx.newPage(), errors = [];
  for (const p of [A, B]) { p.on('pageerror', e => errors.push(e.message)); await p.route(u => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u.href), r => r.abort()); await p.goto(url, { waitUntil: 'commit', timeout: 120000 }); await p.waitForFunction(() => window.BR && BR.game, null, { timeout: 60000 }); await p.evaluate(() => { BR.Net.forceLocal = true; BR.Lobby.skipRoll = true; }); }
  const code = await A.evaluate(async () => { BR.Lobby.open('tdm'); await BR.Lobby.host(); return BR.Lobby.sess.code; });
  await B.evaluate(async c => { BR.Lobby.open('tdm'); await BR.Lobby.join(c); }, code);
  await A.waitForTimeout(800);
  const lobby = await A.evaluate(() => BR.Lobby.players.length), lobbyB = await B.evaluate(() => BR.Lobby.players.length);
  await A.evaluate(() => BR.Lobby.start()); await A.waitForTimeout(4000);
  const sA = await A.evaluate(() => { const g = BR.game; return { n: g.actors.length, proxies: g.actors.filter(a => a.netProxy).length, map: g.world.mapId, ranked: g.mode.ranked }; });
  const mapB = await B.evaluate(() => ({ map: BR.game.world.mapId, ranked: BR.game.mode.ranked }));
  const sB = await B.evaluate(() => { const g = BR.game; return { n: g.actors.length, proxies: g.actors.filter(a => a.netProxy).length, seen: g.actors.filter(a => a.netProxy && a.netProxy.seen).length }; });
  // three legitimate rifle hits (the host's anti-cheat drops impossible damage)
  const hit = await B.evaluate(async () => { const g = BR.game, t = g.actors.find(a => a.owner === 'H' && a.team !== g.player.team && a.alive);
    for (let i = 0; i < 3; i++) { g.applyDamage(t, g.player, 36, false, { x: t.pos.x, y: t.pos.y + 1.5, z: t.pos.z }, 'rifle'); await new Promise(r => setTimeout(r, 150)); } return t.rosterId; });
  await A.waitForTimeout(1500);
  const kA = await A.evaluate(id => { const M = BR.game.mode, me = M.roster.find(r => r.pid && r.pid !== 'H'); return { dead: !M.byId.get(id).alive, kills: M.stats[me.id].kills, score: M.score.slice() }; }, hit);
  const kB = await B.evaluate(id => { const M = BR.game.mode; return { dead: !M.byId.get(id).alive, score: M.score.slice() }; }, hit);
  // v1.16: host kicks the guest; a banned account can't get back in
  await A.evaluate(() => { const S = BR.Lobby.sess || BR.game.mode && BR.game.mode.net; const pid = [...S.conns.keys()][0]; S.kick(pid, ''); });
  await A.waitForTimeout(900);
  const kicked = await B.evaluate(() => ({ inMatch: !!BR.game.mode, sess: !!BR.Net.session, state: BR.game.state }));
  const hostConns = await A.evaluate(() => { const S = BR.Net.session; return S ? S.conns.size : -1; });
  // fresh tabs for the party checks (close the first two: two Battle Royale islands at once is heavy for software GL)
  await A.close(); await B.close();
  const A2 = await ctx.newPage(), B2 = await ctx.newPage();
  for (const p of [A2, B2]) { p.on('pageerror', e => errors.push(e.message)); await p.route(u => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u.href), r => r.abort()); await p.goto(url, { waitUntil: 'commit', timeout: 120000 }); await p.waitForFunction(() => window.BR && BR.game, null, { timeout: 60000 }); }
  // (two tabs in one headless browser: only the front one runs at full speed, so let each have the focus in turn)
  const pump = async () => { for (const pg of [B2, A2, B2, A2]) { await pg.bringToFront(); await pg.waitForTimeout(1400); } };
  // v1.24 parties: invite a friend, then the leader queues Battle Royale / Duels and both land in the same match
  for (const [pg, id, nm, fid, fnm] of [[A2, 'SRG-AAAA-1111', 'alpha', 'SRG-BBBB-2222', 'beta'], [B2, 'SRG-BBBB-2222', 'beta', 'SRG-AAAA-1111', 'alpha']])
    await pg.evaluate(([id, nm, fid, fnm]) => { if (BR.game.state !== 'menu') BR.game.toMenu(); BR.Net.forceLocal = true; BR.Lobby.skipRoll = true; BR.Accounts.accountId = () => id; BR.Accounts.displayName = () => nm; BR.Profile.data.friends = [{ id: fid, name: fnm }]; BR.Party.stop(); BR.Party.start(); }, [id, nm, fid, fnm]);
  await A2.waitForTimeout(600);
  await A2.evaluate(() => BR.Party.invite('SRG-BBBB-2222')); await A2.waitForTimeout(900);
  await B2.evaluate(() => BR.Party.joinInvite(BR.Party.invites[0].code)); await A2.waitForTimeout(1200);
  await A2.evaluate(() => { BR.selectMode('br'); document.getElementById('btn-go').click(); }); await A2.waitForTimeout(1500); await pump();
  const pst = pg => pg.evaluate(() => { const g = BR.game, p = g.player, o = g.actors.find(a => a.human); return { on: !!g.brnet && g.state === 'playing', seed: g.world.seed, n: g.actors.length, team: p.team, mate: !!o && o.team === p.team, seen: !!o && o.netProxy.seen }; });
  for (const [x, y] of [[B2, A2], [A2, B2], [B2, A2]]) { await x.bringToFront(); await x.evaluate(() => BR.game.brnet && BR.game.brnet.update(1)); await y.bringToFront(); await y.waitForTimeout(600); }     // (send a snapshot each way)
  const pA = await pst(A2), pB = await pst(B2);
  await A2.evaluate(() => BR.game.toMenu()); await B2.evaluate(() => BR.game.toMenu()); await A2.waitForTimeout(500);
  await A2.evaluate(() => { BR.selectMode('duels'); document.getElementById('btn-go').click(); }); await A2.waitForTimeout(1500);
  for (let i = 0; i < 12; i++) { await pump(); if (await B2.evaluate(() => !!(BR.game.mode && BR.game.mode.preset === 'duel'))) break; }
  const dA = await A2.evaluate(() => ({ preset: BR.game.mode && BR.game.mode.preset, team: BR.game.player.team })), dB = await B2.evaluate(() => ({ preset: BR.game.mode && BR.game.mode.preset, team: BR.game.player.team, net: !!(BR.game.mode && BR.game.mode.net) }));
  // v1.29 party Zombies: same game, the guest sees + kills the host's zombies (points to the guest), zombies hurt
  // the guest, doors are shared, a downed guest comes back next round, a party wipe ends it for everyone
  await A2.evaluate(() => BR.game.toMenu()); await B2.evaluate(() => { BR.Net.leave(); BR.game.toMenu(); }); await A2.waitForTimeout(500);
  for (const pg of [A2, B2]) await pg.evaluate(() => { BR.AntiCheat._testing = true; });
  await A2.evaluate(() => { BR.selectMode('zombies'); document.getElementById('btn-go').click(); }); await A2.waitForTimeout(1500);
  for (let i = 0; i < 12; i++) { await pump(); if (await B2.evaluate(() => !!(BR.game.brnet && BR.game.zm && BR.game.zm.net))) break; }
  const zst = pg => pg.evaluate(() => { const g = BR.game, zm = g.zm, N = g.brnet; return { on: !!(N && zm && zm.net === N), seed: g.world && g.world.seed, humans: N ? N.humans().length : 0, round: zm ? zm.round : -1, zombies: zm ? zm.zombies.filter(z => z.alive).length : 0, pts: zm ? zm.points : 0, hp: g.player.health, state: g.state }; });
  for (let i = 0; i < 14; i++) { await pump(); if ((await zst(A2)).zombies >= 1 && (await zst(B2)).zombies >= 1) break; }
  const zA = await zst(A2), zB = await zst(B2);
  const zid = await B2.evaluate(() => { const g = BR.game, z = g.zm.zombies.find(z => z.alive && z.zproxy); if (!z) return null; g.applyDamage(z, g.player, 9999, true, z.pos.clone().setY(z.pos.y + 1.6), 'rifle'); return z.zid; });
  await pump(); await pump();
  const zKill = { host: await A2.evaluate(id => { const z = BR.game.brnet.byZ.get(id); return !z || !z.alive; }, zid), guest: await B2.evaluate(id => { const z = BR.game.brnet.byZ.get(id); return !z || !z.alive; }, zid), pts: (await zst(B2)).pts - zB.pts, hostPts: (await zst(A2)).pts - zA.pts };
  await A2.evaluate(() => { const g = BR.game, N = g.brnet, o = N.humans().find(a => a !== g.player); let z = g.zm.zombies.find(z => z.alive); if (!z) z = g.zm.spawnZombie(); if (!o || !z) return; z.riseT = 0; z.mover.pos.set(o.pos.x + 0.8, o.pos.y, o.pos.z); g.player.mover.pos.set(o.pos.x + 30, o.pos.y, o.pos.z + 30); for (let i = 0; i < 90; i++) { N.tgt.clear(); g.update(1 / 30); } });
  await pump(); await pump();
  const zHurt = (await zst(B2)).hp < 100;
  await B2.evaluate(() => { const zm = BR.game.zm, d = zm.doors && zm.doors[0]; if (d && !d.open) zm.openDoor(d); }); await pump();
  const zDoor = await A2.evaluate(() => !!(BR.game.zm.doors[0] && BR.game.zm.doors[0].open));
  await B2.evaluate(() => { const g = BR.game; g.applyDamage(g.player, null, 999, false, g.player.pos, 'zombie'); }); await pump(); await pump();
  const zDown = (await B2.evaluate(() => !BR.game.player.alive && BR.game.state === 'playing')) && (await A2.evaluate(() => BR.game.state === 'playing'));
  await A2.evaluate(() => { const g = BR.game, zm = g.zm; for (const z of zm.zombies.slice()) if (z.alive) g.kill(z, null, 'nuke', false); zm.toSpawn = 0; zm.bossPending = 0; for (let i = 0; i < 40; i++) g.update(1 / 30); zm.breakT = 0.01; for (let i = 0; i < 10; i++) g.update(1 / 30); });
  await pump(); await pump();
  const zBack = await B2.evaluate(() => BR.game.player.alive);
  await B2.evaluate(() => { const g = BR.game; g.applyDamage(g.player, null, 999, false, g.player.pos, 'zombie'); }); await pump();
  await A2.evaluate(() => { const g = BR.game; g.applyDamage(g.player, null, 999, false, g.player.pos, 'zombie'); for (let i = 0; i < 3; i++) g.update(1 / 30); }); await pump(); await pump();
  const over = () => /^(dead|end)$/.test(BR.game.state) && !!(BR.game.result && /overrun/.test(BR.game.result.by || ''));      // (the death screen, or already the results)
  const zWipe = (await A2.evaluate(over)) && (await B2.evaluate(over));
  const checks = [
    ['party Battle Royale: the leader queues, both drop into the same match (same island, same squad) and see each other', pA.on && pB.on && pA.seed === pB.seed && pA.n === pB.n && pA.mate && pB.mate && pA.seen && pB.seen],
    ['party Duels: the leader queues, the lobby starts by itself, both play on the same team', dA.preset === 'duel' && dB.preset === 'duel' && dB.net && dA.team === dB.team],
    ['party Zombies: the leader queues, both land in the same game (same map), the guest sees the host\'s zombies', zA.on && zB.on && zA.seed === zB.seed && zA.humans === 2 && zB.humans === 2 && zA.round >= 1 && zB.zombies >= 1],
    ['party Zombies: a guest shot kills the host\'s zombie on both screens and pays the guest (not the host); zombies hurt the guest; doors are shared', zKill.host && zKill.guest && zKill.pts >= 100 && zKill.hostPts === 0 && zHurt && zDoor],
    ['party Zombies: a downed guest spectates while the host plays on, comes back next round; a party wipe ends it for both', zDown && zBack && zWipe],
    ['host can kick a player: they are sent back to the menu and dropped from the host', !kicked.inMatch && !kicked.sess && hostConns === 0],
    ['lobby: guest joins with the code, both see 2 players', lobby === 2 && lobbyB === 2],
    ['match starts on both with the same 8-player roster (2 humans + 6 AI)', sA.n === 8 && sB.n === 8 && sA.proxies === 1 && sB.proxies === 7],
    ['host rolls the map + queue; the guest plays the same map', !!sA.map && sA.map === mapB.map && sA.ranked === mapB.ranked],
    ['guest receives snapshots for the host + every host bot', sB.seen === 7],
    ['guest hit on a host-owned player/bot kills it on both screens', kA.dead && kB.dead],
    ['kill credited to the guest, team score synced to the guest', kA.kills === 1 && kA.score.join() === kB.score.join() && Math.max(...kA.score) === 1],
    ['no page errors', errors.length === 0],
  ];
  let ok = true; for (const [n, p] of checks) { console.log((p ? 'PASS ' : 'FAIL ') + n); ok = ok && p; }
  if (errors.length) console.log(errors.slice(0, 5));
  await b.close(); server.close(); process.exit(ok ? 0 : 1);
})();
