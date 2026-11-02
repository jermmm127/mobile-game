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
    const dt = 1 / 60, yawFor = (dx, dz) => Math.atan2(-dx, -dz);
    const mkWorld = boxes => { const w = new BR.World(1); w.boxes = []; w.cells = w.cells.map(() => []); boxes.forEach(b => w.addBox(...b)); return w; };
    const go = (m, n, inp, yaw) => { for (let i = 0; i < n; i++) m.update(dt, Object.assign({ mx: 0, mz: 0, jump: false, crouch: false }, typeof inp === 'function' ? inp(i) : inp), yaw); };
    const run = BR.CONFIG.move.runSpeed, r = {};
    const E = yawFor(1, 0);
    const flat = mkWorld([]);
    let m = new BR.Mover(flat); go(m, 90, { mz: 1 }, E); r.run = m.speedH;
    go(m, 1, { mz: 1, crouch: true }, E); r.slide = m.speedH;
    // omni-slide: running forward, push the stick sideways and slide -> goes sideways, can't steer after
    m = new BR.Mover(flat); go(m, 90, { mz: 1 }, E); go(m, 1, { mx: 1, mz: 0.2, crouch: true }, E);
    const d0 = Math.atan2(m.vel.z, m.vel.x); go(m, 20, { mx: -1 }, E);
    r.slideSideways = Math.abs(m.vel.z) > Math.abs(m.vel.x); r.slideSteerDrift = Math.abs(Math.atan2(m.vel.z, m.vel.x) - d0);
    // crouch when not running
    m = new BR.Mover(flat); go(m, 30, {}, E); go(m, 1, { crouch: true }, E); go(m, 10, {}, E); r.crouchH = m.h;
    // super jump
    m = new BR.Mover(flat); go(m, 90, { mz: 1 }, E); go(m, 1, { mz: 1, crouch: true }, E); go(m, 1, { mz: 1, jump: true }, E);
    let apex = 0; for (let i = 0; i < 70; i++) { go(m, 1, { mz: 1 }, E); apex = Math.max(apex, m.pos.y); } r.superJumpApex = apex;
    // bunny hop: timed jumps on landing keep slide speed; holding jump does nothing; late jumps lose it
    const hop = mode => {
      const t = new BR.Mover(flat); go(t, 90, { mz: 1 }, E); go(t, 1, { mz: 1, crouch: true }, E); go(t, 1, { mz: 1, jump: true }, E);
      let late = 0;
      for (let i = 0; i < 300; i++) {
        let j = false;
        if (mode === 'timed') j = t.onGround || (t.vel.y < 0 && t.pos.y < 0.15);
        if (mode === 'held') j = false;                         // holding = no new presses
        if (mode === 'late') { if (t.onGround) late++; else late = 0; j = late === 9; }
        go(t, 1, { mz: 1, jump: j }, E);
      }
      return t.speedH;
    };
    r.bhopTimed = hop('timed'); r.bhopHeld = hop('held'); r.bhopLate = hop('late');
    // wall chain
    const lane = mkWorld([[-80, 0, -3.6, 80, 6, -3, 0], [-80, 0, 3, 80, 6, 3.6, 0]]);
    m = new BR.Mover(lane); m.pos.set(60, 0, -2.5);
    let yw = yawFor(-1, -0.3), air = 0;
    go(m, 30, { mz: 1 }, yw); go(m, 1, { mz: 1, jump: true }, yw);
    for (let i = 0; i < 600 && !m.onGround; i++) { const j = m.wallRunning && m.wallRunT > 0.5; if (j) yw = yawFor(-1, m.wallN.z * 0.6); go(m, 1, { mz: 1, jump: j }, yw); air++; }
    r.wallChainAir = air / 60;
    // ledges
    const led = mkWorld([[20, 0, 5, 22, 1.6, 15, 0], [-22, 0, 5, -20, 1.2, 15, 0]]);
    m = new BR.Mover(led); m.pos.set(16, 0, 10);
    let jd = false, my = 0; for (let i = 0; i < 200; i++) { const now = !jd && m.pos.x > 18.6; if (now) jd = true; go(m, 1, { mz: 1, jump: now }, E); if (m.onGround) my = Math.max(my, m.pos.y); }
    r.mantleY = my;
    m = new BR.Mover(led); m.pos.set(-26, 0, 10); let top = 0; for (let i = 0; i < 120; i++) { go(m, 1, { mz: 1 }, E); top = Math.max(top, m.pos.y); } r.vaultTop = top;
    // jump pad
    const padW = mkWorld([]); padW.addBox(-1, 0, -1, 1, 0.3, 1, 0, { tag: 'pad' });
    m = new BR.Mover(padW); m.pos.set(0, 2, 0); let py = 0; for (let i = 0; i < 120; i++) { go(m, 1, {}, E); py = Math.max(py, m.pos.y); } r.padApex = py;
    // grapple onto a 10m tower top edge
    const tw = mkWorld([[10, 0, -3, 16, 10, 3, 0]]);
    m = new BR.Mover(tw); go(m, 10, {}, E); m.startGrapple(10, 9.9, 0);
    let gy = 0; for (let i = 0; i < 180; i++) { go(m, 1, { mz: 1 }, E); if (m.onGround) gy = Math.max(gy, m.pos.y); } r.grappleTop = gy;
    return r;
  });
  // Shotgun jump + karambit + chests on a real match
  await page.evaluate(() => BR.game.startMatch());
  const combat = await page.evaluate(() => {
    const g = BR.game, p = g.player, r = {};
    g.actors.forEach(a => { if (a !== p) a.alive = false; });
    p.mover.dropping = false; p.mover.pos.set(0, 30, 0); p.mover.vel.set(0, 0, 0);
    for (let i = 0; i < 90; i++) g.update(1 / 30);
    p.slots[1] = BR.Weapons.create('shotgun'); p.cur = 1; p.pitch = -1.45;
    const y0 = p.pos.y; BR.Weapons.tryFire(g, p);
    let peak = y0; for (let i = 0; i < 60; i++) { p.mover.update(1 / 60, { mx: 0, mz: 0 }, p.yaw); peak = Math.max(peak, p.pos.y); }
    r.shotgunJump = peak - y0;
    r.spawnSlots = p.slots.map(s => s && s.id);
    return r;
  });
  await page.evaluate(() => { BR.game.settings.bots = 19; BR.game.startMatch(); });
  const match = await page.evaluate(() => {
    const g = BR.game;
    g.player.takeDamage = () => false;           // idle player can't die, so the bots finish the match
    g.player.mover.pos.set(0, 200, 0);
    let n = 0; const t0 = performance.now();
    while (g.aliveCount() > 1 && n < 30 * 600) { g.update(1 / 30); n++; }
    return { seconds: n / 30, alive: g.aliveCount(), msPerStep: (performance.now() - t0) / n };
  });

  const run = 7.4;
  const checks = [
    ['run speed matches config', Math.abs(mech.run - run) < 0.3],
    ['crouch while running slides with a boost', mech.slide > run + 3],
    ['omni-slide goes where the stick points', mech.slideSideways],
    ['slides cannot be steered', mech.slideSteerDrift < 0.05],
    ['crouch when not running lowers you', mech.crouchH < 1.4],
    ['super jump beats a normal jump (1.4m)', mech.superJumpApex > 2.2],
    ['timed bunny hops keep speed', mech.bhopTimed > run + 3],
    ['holding jump does NOT bunny hop', mech.bhopHeld < run + 0.5],
    ['late jumps lose speed', mech.bhopLate < mech.bhopTimed - 2],
    ['wall chain keeps you airborne > 3s', mech.wallChainAir > 3],
    ['mantle climbs a 1.6m ledge', mech.mantleY >= 1.59],
    ['vault climbs a 1.2m crate', mech.vaultTop >= 1.19],
    ['jump pad launches > 5m', mech.padApex > 5],
    ['grapple pulls you onto a 10m roof', mech.grappleTop >= 9.9],
    ['shotgun jump launches > 2.5m', combat.shotgunJump > 2.5],
    ['you spawn with a pistol + karambit', combat.spawnSlots[0] === 'pistol' && combat.spawnSlots[2] === 'knife'],
    ['bots finish a match', match.alive === 1],
    ['no page errors', errors.length === 0],
  ];
  console.log(JSON.stringify({ mech, combat, match, errors }, null, 1));
  let ok = true;
  for (const [name, pass] of checks) { console.log((pass ? 'PASS ' : 'FAIL ') + name); ok = ok && pass; }
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
