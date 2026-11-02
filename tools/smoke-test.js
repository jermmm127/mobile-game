// Headless smoke test: movement mechanics + a full bots-only match.
// Run from the repo root:  node tools/smoke-test.js
// Needs Playwright + Chromium (preinstalled in Claude Code cloud sessions; locally: npm i -D playwright && npx playwright install chromium).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.BR && BR.game);

  const mech = await page.evaluate(() => {
    const w = new BR.World(1);
    w.boxes = []; w.cells = w.cells.map(() => []);
    w.addBox(-50, 0, -3.6, 50, 5, -3, 0);   // tall wall
    w.addBox(20, 0, 5, 22, 1.6, 15, 0);     // ledge
    w.addBox(-22, 0, 5, -20, 1.2, 15, 0);   // crate
    const m = new BR.Mover(w), dt = 1 / 60;
    const step = (n, inp, yaw) => { for (let i = 0; i < n; i++) m.update(dt, Object.assign({ mx: 0, mz: 0, jump: false, slide: false }, inp), yaw); };
    const yawFor = (dx, dz) => Math.atan2(-dx, -dz);
    const r = {};
    m.pos.set(0, 0, 8); step(90, { mz: 1 }, yawFor(1, 0)); r.run = m.speedH;
    step(1, { mz: 1, slide: true }, yawFor(1, 0)); r.slide = m.speedH;
    m.pos.set(30, 0, -2); m.vel.set(0, 0, 0); step(40, { mz: 1 }, yawFor(-1, -0.25)); step(1, { mz: 1, jump: true }, yawFor(-1, -0.25));
    let wr = 0; for (let i = 0; i < 180 && !m.onGround; i++) { step(1, { mz: 1 }, yawFor(-1, -0.25)); if (m.wallRunning) wr++; }
    r.wallRunSec = wr / 60;
    m.pos.set(16, 0, 10); m.vel.set(0, 0, 0);
    let j = false, my = 0; for (let i = 0; i < 200; i++) { const now = !j && m.pos.x > 18.6; if (now) j = true; step(1, { mz: 1, jump: now }, yawFor(1, 0)); if (m.onGround) my = Math.max(my, m.pos.y); }
    r.mantleY = my; // highest ground stood on
    m.pos.set(-26, 0, 10); m.vel.set(0, 0, 0);
    let top = 0; for (let i = 0; i < 120; i++) { step(1, { mz: 1 }, yawFor(1, 0)); top = Math.max(top, m.pos.y); }
    r.vaultTop = top;
    // movement tech
    const go = (mv, n, inp, yaw) => { for (let i = 0; i < n; i++) mv.update(dt, Object.assign({ mx: 0, mz: 0, jump: false, slide: false, jumpHeld: false }, inp), yaw); };
    const flat = new BR.World(1); flat.boxes = []; flat.cells = flat.cells.map(() => []);
    let t = new BR.Mover(flat); go(t, 90, { mz: 1 }, yawFor(1, 0)); go(t, 1, { mz: 1, slide: true }, yawFor(1, 0)); go(t, 1, { mz: 1, jump: true }, yawFor(1, 0));
    let apex = 0; for (let i = 0; i < 60; i++) { go(t, 1, { mz: 1 }, yawFor(1, 0)); apex = Math.max(apex, t.pos.y); }
    r.superJumpApex = apex;
    t = new BR.Mover(flat); go(t, 90, { mz: 1 }, yawFor(1, 0)); go(t, 1, { mz: 1, slide: true }, yawFor(1, 0));
    go(t, 240, { mz: 1, jumpHeld: true }, yawFor(1, 0)); r.bhopSpeed = t.speedH;
    const lane = new BR.World(1); lane.boxes = []; lane.cells = lane.cells.map(() => []);
    lane.addBox(-80, 0, -3.6, 80, 6, -3, 0); lane.addBox(-80, 0, 3, 80, 6, 3.6, 0);
    t = new BR.Mover(lane); t.pos.set(60, 0, -2.5);
    let yw = yawFor(-1, -0.3), air = 0;
    go(t, 30, { mz: 1 }, yw); go(t, 1, { mz: 1, jump: true }, yw);
    for (let i = 0; i < 600 && !t.onGround; i++) { const j = t.wallRunning && t.wallRunT > 0.5; if (j) yw = yawFor(-1, t.wallN.z * 0.6); go(t, 1, { mz: 1, jump: j }, yw); air++; }
    r.wallChainAir = air / 60;
    return r;
  });

  await page.evaluate(() => BR.game.startMatch());
  const match = await page.evaluate(() => {
    const g = BR.game;
    g.player.takeDamage = () => false;           // idle player can't die, so the bots finish the match
    g.player.mover.pos.set(0, 200, 0);
    let n = 0; const t0 = performance.now();
    while (g.aliveCount() > 1 && n < 30 * 600) { g.update(1 / 30); n++; }
    return { seconds: n / 30, alive: g.aliveCount(), msPerStep: (performance.now() - t0) / n };
  });

  const checks = [
    ['run speed ~8.2', Math.abs(mech.run - 8.2) < 0.3],
    ['slide boosts speed', mech.slide > 11],
    ['wall-run lasts > 0.8s', mech.wallRunSec > 0.8],
    ['mantle climbs a 1.6m ledge', mech.mantleY >= 1.59],
    ['vault climbs a 1.2m crate', mech.vaultTop >= 1.19],
    ['super jump beats a normal jump (1.45m)', mech.superJumpApex > 2.2],
    ['holding jump bunny-hops and keeps speed', mech.bhopSpeed > 11],
    ['wall chain keeps you airborne > 3s', mech.wallChainAir > 3],
    ['bots finish a match', match.alive === 1],
    ['no page errors', errors.length === 0],
  ];
  console.log(JSON.stringify({ mech, match, errors }, null, 1));
  let ok = true;
  for (const [name, pass] of checks) { console.log((pass ? 'PASS ' : 'FAIL ') + name); ok = ok && pass; }
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
