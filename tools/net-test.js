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
  for (const p of [A, B]) { p.on('pageerror', e => errors.push(e.message)); await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForFunction(() => window.BR && BR.game, null, { timeout: 60000 }); await p.evaluate(() => { BR.Net.forceLocal = true; BR.Lobby.skipRoll = true; }); }
  const code = await A.evaluate(async () => { BR.Lobby.open('tdm'); await BR.Lobby.host(); return BR.Lobby.sess.code; });
  await B.evaluate(async c => { BR.Lobby.open('tdm'); await BR.Lobby.join(c); }, code);
  await A.waitForTimeout(800);
  const lobby = await A.evaluate(() => BR.Lobby.players.length), lobbyB = await B.evaluate(() => BR.Lobby.players.length);
  await A.evaluate(() => BR.Lobby.start()); await A.waitForTimeout(4000);
  const sA = await A.evaluate(() => { const g = BR.game; return { n: g.actors.length, proxies: g.actors.filter(a => a.netProxy).length, map: g.world.mapId, ranked: g.mode.ranked }; });
  const mapB = await B.evaluate(() => ({ map: BR.game.world.mapId, ranked: BR.game.mode.ranked }));
  const sB = await B.evaluate(() => { const g = BR.game; return { n: g.actors.length, proxies: g.actors.filter(a => a.netProxy).length, seen: g.actors.filter(a => a.netProxy && a.netProxy.seen).length }; });
  const hit = await B.evaluate(() => { const g = BR.game, t = g.actors.find(a => a.owner === 'H' && a.team !== g.player.team && a.alive); g.applyDamage(t, g.player, 999, true, { x: t.pos.x, y: t.pos.y + 1.5, z: t.pos.z }, 'rifle'); return t.rosterId; });
  await A.waitForTimeout(1500);
  const kA = await A.evaluate(id => { const M = BR.game.mode, me = M.roster.find(r => r.pid && r.pid !== 'H'); return { dead: !M.byId.get(id).alive, kills: M.stats[me.id].kills, score: M.score.slice() }; }, hit);
  const kB = await B.evaluate(id => { const M = BR.game.mode; return { dead: !M.byId.get(id).alive, score: M.score.slice() }; }, hit);
  const checks = [
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
