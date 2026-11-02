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
    // super jump cooldown: two slide-jumps in a row -> only the first is super
    { const fw = new BR.World(1); fw.boxes = []; fw.cells = fw.cells.map(() => []);
      const m = new BR.Mover(fw); m.pos.set(0, 0, 0);
      const go = (n, inp) => { for (let i = 0; i < n; i++) m.update(1 / 60, Object.assign({ mx: 0, mz: 0, jump: false, crouch: false }, inp), 0); };
      for (let i = 0; i < 200 && !m.onGround; i++) go(1, {});
      go(60, { mz: 1 }); go(1, { mz: 1, crouch: true }); go(1, { mz: 1, jump: true }); const v1 = m.vel.y;
      for (let i = 0; i < 200 && !m.onGround; i++) go(1, { mz: 1 });
      go(30, { mz: 1 }); go(1, { mz: 1, crouch: true }); go(1, { mz: 1, jump: true }); const v2 = m.vel.y;
      r.superJumpVy = [v1, v2]; }
    // grapple: ground, a tree canopy, and another player
    p.mover.grapple = null; p.grappleCd = 0; p.mover.pos.set(0, 20, 0); p.pitch = -1.2; p.yaw = 0;
    r.grappleGround = p.tryGrapple(); p.mover.grapple = null;
    const tree = g.world.trees[0]; p.grappleCd = 0;
    p.mover.pos.set(tree.x + 8, tree.h + tree.s * 0.4 - 1.5, tree.z); p.yaw = Math.atan2(8, 0); p.pitch = Math.atan2(1.5 - BR.CONFIG.actor.standHeight + BR.CONFIG.actor.eyeFromTop, 8);
    r.grappleTree = p.tryGrapple() && !!p.mover.grapple; p.mover.grapple = null;
    const bot = g.actors[1]; bot.alive = true; bot.mover.dropping = false;
    // find an open spot (high up, nothing in between) so the map layout can't block the test
    bot.mover.pos.set(0, 120, 0); p.grappleCd = 0; p.mover.pos.set(0, 120, 15); p.yaw = 0; p.pitch = Math.atan2(1.08 - 1.66, 15);
    r.grappleActor = !!(p.tryGrapple() && p.mover.grapple && p.mover.grapple.actor === bot);
    p.mover.grapple = null; bot.alive = false;
    // tracers render as visible meshes in the player's tracer color
    p.alive = true; p.mover.pos.set(0, 150, 0); p.slots[0] = BR.Weapons.create('rifle'); p.slots[0].cool = 0; p.cur = 0; p.pitch = 0; p.weapon.reloadT = 0;
    BR.Profile.data.equip.tracers = 'red';
    r.tracerFired = BR.Weapons.tryFire(g, p); g.fx.update(0.02);
    const tr = g.fx.tracers.filter(t => t.streak.visible);
    r.tracerVisible = tr.some(t => t.glow.material.color.getHex() === BR.Models.tracerColor('red', 0) && t.streak.scale.z > 1);
    BR.Profile.data.equip.tracers = 'default';
    // ground loot shows the merged weapon model
    const wl = g.loot.items.find(i => i.kind === 'weapon');
    r.lootModel = wl.mesh.children.some(c => c.geometry && c.geometry.attributes.position.count > 200);
    r.pois = g.world.pois.map(q => q.name);
    // viewmodel: every blueprint builds, karambit deploy spins, reload moves the mag, arms render
    let built = 0; for (const w in BR.Models.BLUEPRINTS) for (const b in BR.Models.BLUEPRINTS[w]) { BR.Models.weapon(w, 'default', 'none', b); built++; }
    r.blueprints = built;
    const v = g.vmr; p.alive = true; p.mover.dropping = false; p.ads = false;
    p.cur = 2; v.update(1 / 60, 0, 0); let maxSpin = 0;
    for (let i = 0; i < 70; i++) { v.update(1 / 60, 0, 0); const q = v.models.knife.userData.spin.obj.quaternion; maxSpin = Math.max(maxSpin, 2 * Math.acos(Math.min(1, Math.abs(q.w)))); }
    r.knifeSpin = maxSpin;
    r.armsVisible = v.arms.R.hand.visible && v.arms.R.fore.visible;
    p.slots[0] = BR.Weapons.create('rifle', 2); p.ammo.heavy = 90; p.cur = 0;
    for (let i = 0; i < 60; i++) v.update(1 / 60, 0, 0);
    BR.Weapons.startReload(p.weapon, p); let magDrop = 0;
    while (p.weapon.reloadT > 0) { BR.Weapons.update(p.weapon, 1 / 60, p); v.update(1 / 60, 0, 0); magDrop = Math.min(magDrop, v.models.rifle.userData.model.userData.mag.position.y); }
    r.magDrop = magDrop; r.reloaded = p.weapon.mag === 45;
    r.leftHandOnGun = v.arms.L.hand.visible;
    // knife button toggles knife <-> last gun
    g.input.press('knife'); g.controlPlayer(1 / 60); const onKnife = p.cur === 2;
    g.input.press('knife'); g.controlPlayer(1 / 60); r.knifeButton = onKnife && p.cur === 0;
    // random rifle recoil moves yaw sideways
    const yaws = []; for (let i = 0; i < 40; i++) { p.slots[0].cool = 0; const y0 = p.yaw; BR.Weapons.tryFire(g, p); yaws.push(p.yaw - y0); }
    r.recoilSideways = new Set(yaws.map(y => Math.sign(y))).size > 1 && yaws.some(y => Math.abs(y) > 1e-4);
    r.mapSize = g.world.size;
    return r;
  });
  // Accounts: use a throwaway test code (the real dev code is never stored in the repo)
  const acct = await page.evaluate(async () => {
    const A = BR.Accounts, r = {};
    const realHash = BR.CONFIG.devCodeHash;
    const testCode = 'TEST-' + Math.random().toString(36).slice(2);
    BR.CONFIG.devCodeHash = await BR.sha256.hex(testCode.toUpperCase());
    r.jsHashMatches = BR.sha256.js(new TextEncoder().encode('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    A.logOut();
    r.bad = (await A.signUp('x', '1')).ok === false;
    r.signup = (await A.signUp('Tester_' + Date.now() % 100000, 'hunter22')).ok;
    BR.Profile.load();
    r.coinsBefore = BR.Profile.data.coins;
    r.wrongCode = (await A.redeem('NOT-A-CODE')).ok === false;
    r.devOk = (await A.redeem(testCode)).ok && BR.Profile.infinite();
    r.buyFree = BR.Profile.owns('skins', 'chrome') && BR.Profile.owns('blueprints', 'rifle:vandal') && BR.Profile.data.coins === r.coinsBefore; // redeeming unlocks everything
    const me = A.current();
    A.logOut(); BR.Profile.load();
    r.guestNotDev = !BR.Profile.infinite();
    r.relogin = (await A.logIn(me, 'hunter22')).ok; BR.Profile.load();
    r.devPersists = BR.Profile.infinite();
    r.wrongPass = (await A.logIn(me, 'nope')).ok === false;
    A.logOut(); BR.Profile.load();
    BR.CONFIG.devCodeHash = realHash;
    return r;
  });
  // Parachute + practice mode + HUD editor coverage
  const extra = await page.evaluate(() => {
    const r = {}, flat = new BR.World(1); flat.boxes = []; flat.cells = flat.cells.map(() => []);
    const fall = (pressAt) => {
      const m = new BR.Mover(flat); m.pos.set(0, 110, 0); m.dropping = true; let t = 0, openedAt = null, landV = 0;
      while (m.dropping && t < 60) { const j = pressAt !== null && m.pos.y < pressAt && !m.chute; m.update(1 / 60, { mx: 0, mz: 1, jump: j, crouch: false }, 0); t += 1 / 60; if (m.chute && openedAt === null) openedAt = m.pos.y; landV = m.vel.y; }
      return { openedAt, t, landed: !m.dropping };
    };
    r.auto = fall(null); r.manual = fall(90);
    const g = BR.game;
    g.startMatch({ practice: true });
    r.practiceBots = g.actors.length; r.practiceFlag = g.practice && document.body.classList.contains('practice');
    g.practiceSpawn('weapon', 'sniper'); r.gotSniper = g.player.weapon && g.player.weapon.id === 'sniper';
    g.practiceSpawn('bot', 'dummy'); g.practiceSpawn('bot', 'combat');
    r.botsSpawned = g.actors.length === 3 && g.actors[1].brain.passive && !g.actors[2].brain.passive;
    let dummyFired = false; for (let i = 0; i < 120; i++) { g.update(1 / 30); if (g.actors[1].fireHeld) dummyFired = true; }
    r.dummyPassive = !dummyFired;
    g.practiceSpawn('clearbots'); r.cleared = g.actors.length === 1;
    const L = BR.layout; L.open(); const keys = Object.keys(L.table()); L.close();
    // hunting rifle: lightweight, accurate from the hip even while moving/airborne
    const P = g.player, W = BR.Weapons, hw = W.create('hunter'), sw = W.create('sniper');
    P.ads = false; P.mover.vel.set(0, 0, 0); P.mover.onGround = true;
    const sniperStill = W.spread(P, sw), hunterStill = W.spread(P, hw);
    P.mover.vel.set(BR.CONFIG.move.runSpeed, 0, 0); P.mover.onGround = false;
    const hunterAir = W.spread(P, hw), sniperAir = W.spread(P, sw);
    r.hunter = { sniperStill, hunterStill, hunterAir, sniperAir, light: (BR.CONFIG.weapons.hunter.speedMult || 1) >= 1 };
    P.mover.vel.set(0, 0, 0); P.mover.onGround = true;
    // bot aim: eases in (no snap) and never exceeds its turn rate
    g.practiceSpawn('bot', 'dummy');
    const bb = g.actors[g.actors.length - 1].brain, ba = bb.a; ba.yaw = 0; ba.pitch = 0; bb.yawVel = bb.pitchVel = 0;
    const e0 = ba.eye(new THREE.Vector3()), steps = [];
    for (let i = 0; i < 90; i++) { const y0 = ba.yaw; bb.lookToward(e0.x + 10, e0.y, e0.z, 1 / 60); steps.push(Math.abs(ba.yaw - y0)); }
    r.botAim = { first: steps[0], peak: Math.max(...steps), cap: bb.d.turnRate / 60, err: Math.abs(BR.util.wrapAngle(ba.yaw + Math.PI / 2)) };
    g.practiceSpawn('clearbots');
    // stim: 4s cooldown, 3s speed boost, heals 10 ticks/s for 5s
    P.health = 20; P.stimCd = 0;
    const used = P.tryStim(), again = P.tryStim();
    P.mover.vel.set(0, 0, 0); P.mover.onGround = true; P.mover.sliding = false; P.mover.crouched = false; P.input.mx = 0; P.input.mz = 1;
    let vBoost = 0; for (let i = 0; i < 60; i++) { P.update(1 / 60); P.input.mz = 1; vBoost = P.mover.speedH; }
    const hp1 = P.health;              // after 1 s: ~+10
    for (let i = 0; i < 60 * 5; i++) { P.update(1 / 60); P.input.mz = 1; }
    const hpEnd = P.health, cdBack = P.stimCd === 0, vAfter = P.mover.speedH;
    r.stim = { used, again, vBoost, vAfter, hp1, hpEnd, cdBack, ready: P.tryStim(), hudBtn: !!document.querySelector('#play > .btn.stim[data-act="stim"]') };
    // knife = faster; bolt actions cycle; hunting rifle has irons, no scope; detailed map
    P.health = 100; P.stimT = 0; P.stimCd = 0;
    P.switchTo(2); P.mover.vel.set(0, 0, 0); for (let i = 0; i < 90; i++) { P.input.mz = 1; P.update(1 / 60); }
    const knifeSpeed = P.mover.speedH;
    const C = BR.CONFIG.weapons, vm = g.vmr;
    g.practiceSpawn('weapon', 'hunter');
    const hm = vm.models.hunter.userData.model.userData;
    vm.lastWeapon = P.weapon; vm.drawT = 0;
    vm.onFire(P.weapon);
    let lift = 0, back = 0;
    for (let i = 0; i < 60; i++) { vm.update(1 / 60, 0, 0); lift = Math.max(lift, hm.bolt.rotation.z); back = Math.max(back, hm.bolt.position.z - hm.boltZ0); }
    for (let i = 0; i < 60; i++) vm.update(1 / 60, 0, 0);
    // first-person stim + grapple animations
    let injSeen = false, launchSeen = false;
    vm.onStim(); for (let i = 0; i < 40; i++) { vm.update(1 / 60, 0, 0); if (vm.injector.visible) injSeen = true; }
    for (let i = 0; i < 60; i++) vm.update(1 / 60, 0, 0);
    const injGone = !vm.injector.visible;
    vm.onGrapple(); for (let i = 0; i < 12; i++) { vm.update(1 / 60, 0, 0); if (vm.launcher.visible && vm.ropeValid) launchSeen = true; }
    for (let i = 0; i < 60; i++) vm.update(1 / 60, 0, 0);
    r.fpAnims = { injSeen, injGone, launchSeen, launchGone: !vm.launcher.visible };
    const Wd = g.world;
    r.newstuff = { knifeSpeed, bolts: !!(C.sniper.bolt && C.hunter.bolt), hunterIrons: !C.hunter.scope && !!hm.sight, sniperBolt: !!vm.models.sniper.userData.model.userData.bolt,
      lift, back, settled: Math.abs(hm.bolt.rotation.z) < 1e-3 && Math.abs(hm.bolt.position.z - hm.boltZ0) < 1e-3,
      decor: Wd.decor.length, buildings: Wd.buildings.length, ponds: Wd.props.ponds.length, barrels: Wd.props.barrels.length, logs: Wd.props.logs.length };
    // stretched res + saturation
    const asp0 = g.camera.aspect; g.settings.stretch = 1; g.resize(); const asp1 = g.camera.aspect;
    g.settings.saturation = 1.6; g.applyColor(); const filt = g.renderer.domElement.style.filter;
    g.settings.stretch = 0; g.settings.saturation = 1; g.resize();
    r.video = { asp0, asp1, filt, reset: g.renderer.domElement.style.filter === '' && Math.abs(g.camera.aspect - asp0) < 1e-6 };
    r.editable = ['slot0', 'slot1', 'slot2', 'interact', 'map', 'pause', 'fire', 'jump', 'knife', 'spawnmenu', 'stim'].every(k => keys.includes(k));
    return r;
  });
  const loadMs = await page.evaluate(() => { const t = performance.now(); BR.game.startMatch(); return performance.now() - t; });
  await page.evaluate(() => { BR.game.settings.bots = 19; BR.game.startMatch(); });
  // One life: dying outside practice ends the match for good (no respawn) -> end screen
  const death = await page.evaluate(() => {
    const g = BR.game; g.settings.bots = 3; g.startMatch();
    const p = g.player; p.mover.dropping = false;
    g.kill(p, g.actors[1], 'rifle', false);
    for (let i = 0; i < 30 * 8; i++) g.update(1 / 30);
    return { state: g.state, alive: p.alive, endShown: !document.getElementById('end').classList.contains('hidden'), btn: document.getElementById('btn-again').textContent };
  });
  // Queue: the end-screen button goes through matchmaking into a fresh match
  const queue = await page.evaluate(() => new Promise(res => {
    const g = BR.game; document.getElementById('btn-again').click();
    const shown = !document.getElementById('queue').classList.contains('hidden'), st = g.state;
    setTimeout(() => res({ shown, stillEnded: st === 'end', state: g.state, alive: g.player.alive, hidden: document.getElementById('queue').classList.contains('hidden') }), 3800);
  }));
  const match = await page.evaluate(() => {
    const g = BR.game;
    g.player.takeDamage = () => false;           // idle player can't die, so the bots finish the match
    g.player.mover.pos.set(0, 200, 0);
    let n = 0; const t0 = performance.now();
    while (g.aliveCount() > 1 && n < 30 * 600) { g.update(1 / 30); n++; }
    return { seconds: n / 30, alive: g.aliveCount(), msPerStep: (performance.now() - t0) / n };
  });

  const run = 7.4, BR_RUN = run;
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
    ['super jump has a cooldown', combat.superJumpVy[0] > 11 && combat.superJumpVy[1] < 9],
    ['grapple hooks the ground', combat.grappleGround],
    ['grapple hooks tree canopies', combat.grappleTree],
    ['grapple hooks other players', combat.grappleActor],
    ['tracers are visible in the equipped color', combat.tracerVisible],
    ['dropped guns show the real model', combat.lootModel],
    ['big map has 10+ named locations', combat.pois.length >= 10 && combat.mapSize >= 600],
    ['SHA-256 fallback is correct', acct.jsHashMatches],
    ['accounts: validation, sign up, wrong code/password rejected', acct.bad && acct.signup && acct.wrongCode && acct.wrongPass],
    ['dev code gives that account infinite coins', acct.devOk && acct.buyFree && acct.devPersists],
    ['guests and other accounts do not get it', acct.guestNotDev],
    ['big map loads in under 4s (headless)', loadMs < 4000],
    ['all weapon blueprints build', combat.blueprints >= 21],
    ['karambit deploy twirls (CS-style)', combat.knifeSpin > 2],
    ['first-person arms render', combat.armsVisible && combat.leftHandOnGun],
    ['reload drops the magazine and refills', combat.magDrop < -0.15 && combat.reloaded],
    ['knife button swaps to the karambit and back', combat.knifeButton],
    ['rifle recoil kicks randomly sideways', combat.recoilSideways],
    ['parachute opens by itself before the ground', extra.auto.openedAt > 15 && extra.auto.openedAt < 40 && extra.auto.landed],
    ['Jump opens the parachute early (slower descent)', extra.manual.openedAt > 80 && extra.manual.t > extra.auto.t + 5],
    ['practice mode starts with no bots', extra.practiceBots === 1 && extra.practiceFlag],
    ['spawn menu gives guns and spawns passive + combat bots', extra.gotSniper && extra.botsSpawned && extra.cleared],
    ['passive dummies never shoot', extra.dummyPassive],
    ['every HUD element is editable (slots, pickup, map, pause...)', extra.editable],
    ['hunting rifle is accurate from the hip, even moving/airborne', extra.hunter.hunterAir < extra.hunter.sniperStill * 0.5 && extra.hunter.hunterAir < extra.hunter.hunterStill * 2 && extra.hunter.light],
    ['bot aim eases in and respects its turn rate', extra.botAim.first < extra.botAim.peak * 0.5 && extra.botAim.peak <= extra.botAim.cap + 1e-6 && extra.botAim.err < 0.02],
    ['stim: 4s cooldown, speed boost, heals 10/s for 5s', extra.stim.used && !extra.stim.again && extra.stim.vBoost > BR_RUN * 1.2 && extra.stim.vAfter < BR_RUN * 1.05 && extra.stim.hp1 >= 29 && extra.stim.hp1 <= 31 && extra.stim.hpEnd === 70 && extra.stim.cdBack && extra.stim.ready && extra.stim.hudBtn],
    ['stretched res widens the picture; saturation filters the 3D view', extra.video.asp1 < extra.video.asp0 / 1.5 && /saturate\(1\.6\)/.test(extra.video.filt) && extra.video.reset],
    ['karambit gives a movement speed boost', extra.newstuff.knifeSpeed > BR_RUN * 1.15],
    ['sniper + hunting rifle are bolt actions (bolt lifts, pulls back, returns)', extra.newstuff.bolts && extra.newstuff.sniperBolt && extra.newstuff.lift > 0.8 && extra.newstuff.back > 0.05 && extra.newstuff.settled],
    ['stim + grapple have first-person arm animations', extra.fpAnims.injSeen && extra.fpAnims.injGone && extra.fpAnims.launchSeen && extra.fpAnims.launchGone],
    ['hunting rifle uses iron sights (no scope)', extra.newstuff.hunterIrons],
    ['map is dressed (frames, props, ponds, barrels, logs)', extra.newstuff.decor > 3000 && extra.newstuff.ponds >= 4 && extra.newstuff.barrels > 10 && extra.newstuff.logs > 20],
    ['dying ends your match (no respawn)', death.state === 'end' && !death.alive && death.endShown],
    ['queue screen finds a new match', queue.shown && queue.stillEnded && queue.state === 'playing' && queue.alive && queue.hidden && /QUEUE/.test(death.btn)],
    ['bots finish a match', match.alive === 1],
    ['no page errors', errors.length === 0],
  ];
  console.log(JSON.stringify({ mech, combat, acct, extra, death, queue, loadMs, match, errors }, null, 1));
  let ok = true;
  for (const [name, pass] of checks) { console.log((pass ? 'PASS ' : 'FAIL ') + name); ok = ok && pass; }
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
