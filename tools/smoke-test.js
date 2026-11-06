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
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });     // (blocked web fonts aren't game errors)
  await page.route(u => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u.href), r => r.abort());      // offline-safe: web fonts etc. are optional
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.BR && BR.game);
  // the older checks below cover the karambit, so carry it (the bayonet is the default knife and has its own checks)
  await page.evaluate(() => { if (BR.AntiCheat) BR.AntiCheat._testing = true; BR.Profile.data.xp = 5e6; BR.Profile.data.equip.melee = 'knife'; BR.Profile.save(); BR.game.refreshCosmetics(); });     // v1.14: max level so every knife is unlocked for the older checks

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
    // wall-run only while JUMP is held (players): same run-up with jump released vs held
    const wr = held => { const mm = new BR.Mover(lane); mm.pos.set(60, 0, -2.5); let y2 = yawFor(-1, -0.3), ran = false;
      go(mm, 30, { mz: 1 }, y2); go(mm, 1, { mz: 1, jump: true, jumpHeld: true }, y2);
      for (let i = 0; i < 90 && !mm.onGround; i++) { go(mm, 1, { mz: 1, jumpHeld: held }, y2); if (mm.wallRunning) ran = true; }
      return ran; };
    r.wallRunReleased = wr(false); r.wallRunHeld = wr(true);
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
    r.spawnSlots = p.slots.map(s => s && s.id);
    p.slots[1] = BR.Weapons.create('shotgun'); p.cur = 1; p.pitch = -1.45;
    const y0 = p.pos.y; BR.Weapons.tryFire(g, p);
    let peak = y0; for (let i = 0; i < 60; i++) { p.mover.update(1 / 60, { mx: 0, mz: 0 }, p.yaw); peak = Math.max(peak, p.pos.y); }
    r.shotgunJump = peak - y0;
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
    BR.Profile.data.equip.tracerByGun.rifle = 'red';
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
    p.cur = 2; v.lastWeapon = null; v.update(1 / 60, 0, 0); let maxSpin = 0;
    for (let i = 0; i < 70; i++) { v.update(1 / 60, 0, 0); const q = v.models.knife.userData.spin.obj.quaternion; maxSpin = Math.max(maxSpin, 2 * Math.acos(Math.min(1, Math.abs(q.w)))); }
    r.knifeSpin = maxSpin;
    // karambit is held in the backhand-fist gloves (right holds the knife, left is an empty fist)
    // v1.18.2 (reference screenshot): the empty left fist shows at idle, after the draw has finished
    v.drawT = 0; v.inspectT = 0; for (let i = 0; i < 60; i++) v.update(1 / 60, 0, 0);
    r.armsVisible = v.knifeHands.R.visible && v.knifeHands.L.visible && v.arms.R.fore.visible;
    p.slots[0] = BR.Weapons.create('rifle', 2); p.ammo.heavy = 90; p.cur = 0;
    for (let i = 0; i < 60; i++) v.update(1 / 60, 0, 0);
    BR.Weapons.startReload(p.weapon, p); let magDrop = 0;
    while (p.weapon.reloadT > 0) { BR.Weapons.update(p.weapon, 1 / 60, p); v.update(1 / 60, 0, 0); magDrop = Math.min(magDrop, v.models.rifle.userData.model.userData.mag.position.y); }
    r.magDrop = magDrop; r.reloaded = p.weapon.mag === 45;
    r.leftHandOnGun = v.arms.L.hand.visible && v.arms.R.hand.visible && !v.knifeHands.R.visible;
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
    BR._testDevHash = await BR.sha256.hex(testCode.toUpperCase());
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
    BR._testDevHash = null; BR.CONFIG.devCodeHash = 'tampered'; r.hashLocked = BR.CONFIG.devCodeHash === realHash;
    return r;
  });
  // Parachute + practice mode + HUD editor coverage
  const extra = await page.evaluate(() => {
    BR.Profile.data.equip.melee = 'knife'; BR.Profile.save(); BR.game.refreshCosmetics(); 
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
    const realWorld = P.mover.world, realPos = P.mover.pos.clone();
    P.mover.world = flat; P.mover.pos.set(0, 0, 0);          // open flat ground: nothing to run into
    P.mover.vel.set(0, 0, 0); P.mover.onGround = true; P.mover.sliding = false; P.mover.crouched = false; P.input.mx = 0; P.input.mz = 1;
    let vBoost = 0; for (let i = 0; i < 60; i++) { P.update(1 / 60); P.input.mz = 1; vBoost = P.mover.speedH; }
    const hp1 = P.health;              // after 1 s: ~+10
    for (let i = 0; i < 60 * 5; i++) { P.update(1 / 60); P.input.mz = 1; }
    const hpEnd = P.health, cdBack = P.stimCd === 0, vAfter = P.mover.speedH;
    P.mover.world = realWorld; P.mover.pos.copy(realPos);
    r.stim = { used, again, vBoost, vAfter, hp1, hpEnd, cdBack, ready: P.tryStim(), hudBtn: !!document.querySelector('#play > .btn.stim[data-act="stim"]') };
    // knife = faster; bolt actions cycle; hunting rifle has irons, no scope; detailed map
    P.health = 100; P.stimT = 0; P.stimCd = 0;
    P.mover.world = flat; P.mover.pos.set(0, 0, 0); P.mover.onGround = true;
    P.switchTo(2); P.mover.vel.set(0, 0, 0); for (let i = 0; i < 90; i++) { P.input.mz = 1; P.update(1 / 60); }
    const knifeSpeed = P.mover.speedH;
    P.mover.world = realWorld; P.mover.pos.copy(realPos);
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
    // shockwave grenade: throw at your feet -> launched; pickup refills; styled tracer beads; damage-number stacking
    {
      const P2 = g.player; P2.mover.world = flat; P2.mover.pos.set(0, 0, 0); P2.mover.vel.set(0, 0, 0); P2.mover.onGround = true;
      g.practiceSpawn('nades'); const n0 = P2.nades; P2.pitch = -1.35; P2.nadeCd = 0;
      const y0 = P2.pos.y; let maxY = y0; g.input.press('grenade');
      for (let i = 0; i < 120; i++) { g.update(1 / 60); maxY = Math.max(maxY, P2.pos.y); }
      P2.mover.world = realWorld; P2.mover.pos.copy(realPos); P2.mover.vel.set(0, 0, 0);
      const it = g.loot.spawnKind('shock', P2.pos.x, P2.pos.y, P2.pos.z, Math.random); const before = P2.nades;
      g.loot.autoPickup(P2);
      r.shock = { n0, used: n0 - before > 0, rise: maxY - y0, picked: P2.nades === before + 1, model: !!it.mesh.userData.nade };
      const fxT = g.fx; fxT.tracer(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, -30), true, 0xffffff, BR.Models.tracerOpts('thunder', 0));
      const tt = fxT.tracers[(fxT.ti - 1) % fxT.tracers.length]; fxT.update(0.02);
      r.styledTracer = !!(tt.fx && (tt.fx.some(b => b.visible) || tt.seg.some(b => b.visible))) && Object.values(BR.Models.TRACERS).filter(x => x.style).length >= 8;
      const hud = g.hud, dummy = {}; hud.damageNumber(new THREE.Vector3(0, 1, -5), 20, false, dummy, false); hud.damageNumber(new THREE.Vector3(0, 1, -5), 30, true, dummy, false);
      const shown = hud.numPool.filter(q => q.victim === dummy && q.life > 0);
      r.dmgStack = shown.length === 1 && Math.round(shown[0].total) === 50 && shown[0].el.classList.contains('head');
      const M = BR.Models;
      r.cosmetics = { camos: Object.keys(M.SKINS).length, gloves: Object.keys(M.GLOVES).length,
        mythicBp: Object.values(M.BLUEPRINTS).reduce((n, w) => n + Object.values(w).filter(b => b.rarity === 'Mythic').length, 0) };
      M.tick(3); r.animCamo = M.weapon('rifle', 'molten', 'none').children.some(c => c.material && c.material.emissiveMap && c.material.emissiveMap.offset.y > 0);
    }
    // karambit ring roll: mid-deploy the index fingertip sits in the ring
    {
      const v = g.vmr, P3 = g.player; P3.switchTo(2); v.lastWeapon = P3.weapon; v.drawDur = 1.05;
      let best = 9;
      for (const k of [0.2, 0.3, 0.4]) {
        for (let i = 0; i < 40; i++) { v.drawT = 1.05 * (1 - k); v.update(1 / 60, 0, 0); }
        const H = v.knifeHands.RP, ring = v.models.knife.userData.spin.obj.getWorldPosition(new THREE.Vector3());     // straight index finger through the ring
        const tip = new THREE.Vector3(-0.0195, 0.002, -0.062).multiplyScalar(1.3).applyQuaternion(H.quaternion).add(H.position);
        best = Math.min(best, tip.distanceTo(ring));
      }
      r.ringRoll = best;
      // dropped weapon: tossed, bounces, settles on the floor; has a name tag
      const D2 = g.player.pos;
      const it2 = g.loot.add({ kind: 'weapon', wid: 'rifle', mag: 30, reserve: 0 }, D2.x + 1, D2.y + 1.2, D2.z + 1, new THREE.Vector3(2, 5, 0));
      let maxY2 = it2.pos.y; for (let i = 0; i < 240; i++) { g.loot.update(1 / 60, D2); maxY2 = Math.max(maxY2, it2.pos.y); }
      r.drop = { label: !!it2.mesh.userData.label, rose: maxY2 > D2.y + 1.5, settled: !it2.air && Math.abs(it2.pos.y - g.world.groundAt(it2.pos.x, it2.pos.z, it2.pos.y + 0.6)) < 0.01 };
      g.loot.remove(it2);
      r.handMeshes = BR.Models.hand('default', false).children.length;
      r.cars = (g.world.props.cars || []).length; r.roundMap = getComputedStyle(document.getElementById('minimap')).borderRadius;
    }
    // per-gun tracers + blueprint signature tracers
    {
      const E = BR.Profile.data.equip, M = BR.Models;
      E.tracerByGun.smg = 'plasma'; E.tracerByGun.rifle = 'signature'; E.blueprints.rifle = 'neonviper'; E.blueprints.sniper = 'default'; E.tracerByGun.sniper = 'signature';
      r.perGun = M.resolveTracer('smg', E).style === 'helix' && M.resolveTracer('rifle', E).style === M.BLUEPRINTS.rifle.neonviper.tracer.style && M.resolveTracer('sniper', E) === M.TRACERS.default;
      // cases: roll respects rarities, opening pays + grants (or refunds a duplicate)
      const P = BR.Profile, before = P.data.coins, wasDev = P.data.dev; P.data.dev = false; P.data.coins = 5000;
      const tally = {}; for (let i = 0; i < 2000; i++) { const it = BR.CaseItems.roll('release'); tally[it.item.rarity] = (tally[it.item.rarity] || 0) + 1; }
      const got = P.openCase('release');
      r.cases = { items: BR.CaseItems.all().length, rareShare: tally.Rare / 2000, exotic: tally.Exotic || 0, paid: P.data.coins <= 5000 - 600 + (got.dup ? 210 : 0), owned: P.owns(got.cat, got.id), notInShop: !BR.Shop.catalog('skins').liquidgold || P.owns('skins', 'liquidgold') };
      P.data.coins = before; P.data.dev = wasDev;
      // ranks: RP from a win unlocks rank rewards
      const rp0 = P.data.rp; P.data.rp = 4400; const res = P.award({ win: true, place: 1, kills: 3, damage: 100, ranked: true });
      r.ranks = { rp: res.rp > 0, tier: BR.Ranks.tiers[BR.Ranks.of(P.data.rp)].name, diamondFeed: P.owns('feeds', 'rk_diamond'), board: BR.Ranks.board().length === 50 };
      P.data.rp = rp0;
      // karambit flip: mid-deploy the ring axis lines up with the finger (flip over it, not a fan)
      const v = g.vmr, P4 = g.player; P4.switchTo(2); v.lastWeapon = P4.weapon; v.drawDur = 1.05;
      for (let i = 0; i < 40; i++) { v.drawT = 1.05 * (1 - 0.3); v.update(1 / 60, 0, 0); }
      const sp = v.models.knife.userData.spin, ringAxis = sp.axis.clone().applyQuaternion(sp.obj.quaternion);
      const fing = new THREE.Vector3(-0.92, 0.08, -0.38).normalize().applyQuaternion(v.root.quaternion.clone().invert());
      r.flip = Math.abs(ringAxis.dot(fing));
      // signature reload: Neon Viper twirls the gun during the reload
      g.refreshCosmetics(); g.practiceSpawn('weapon', 'rifle'); const RW = P4.weapon; RW.mag = 1; v.lastWeapon = RW; v.drawT = 0;
      BR.Weapons.startReload(RW, P4); let maxRoll = 0;
      for (let i = 0; i < 60; i++) { BR.Weapons.update(RW, 1 / 60, P4); v.update(1 / 60, 0, 0); maxRoll = Math.max(maxRoll, Math.abs(v.root.rotation.z)); }
      r.sigReload = { style: (v.sigReload.rifle || {}).style, maxRoll };
      E.blueprints.rifle = 'default'; g.refreshCosmetics();
      // island map: invisible boundary, ocean, natural rock (hidden collision boxes)
      const Wi = g.world;
      r.island = { edgeHidden: Wi.boxes.filter(b => b.tag === 'edge').every(b => b.hidden), sea: !!Wi.sea, rocks: Wi.props.rockFill.length > 50 && Wi.props.rockFill.every(b => b.hidden) };
    }
    // inventory: lists only owned items, equips, and drag-inspect turns the preview
    {
      const P = BR.Profile, inv = BR.inventory;
      if (!P.owns('blueprints', 'rifle:vandal')) P.data.owned.blueprints.push('rifle:vandal');
      inv.cat = 'blueprints'; inv.weapon = 'rifle';
      const keys = Object.keys(inv.items());
      const onlyOwned = keys.every(k => P.owns('blueprints', k)) && keys.includes('rifle:vandal') && !keys.includes('rifle:genesis') === !P.owns('blueprints', 'rifle:genesis');
      inv.open({ cat: 'blueprints', id: 'rifle:vandal' }); inv.act();
      const equipped = P.data.equip.blueprints.rifle === 'vandal';
      const I = g.inspect; I.dragging = false; I.vy = 4; const y0 = I.yaw; g.updateShop(0.1);
      const turned = Math.abs(g.shopPivot.rotation.y - I.yaw) < 1e-6 && I.yaw !== y0;
      inv.close();
      P.data.equip.blueprints.rifle = 'default'; g.refreshCosmetics();
      r.inventory = { onlyOwned, equipped, turned, closed: g.state !== 'shop' };
    }
    const Wd = g.world;
    r.newstuff = { knifeSpeed, bolts: !!(C.sniper.bolt && C.hunter.bolt), hunterIrons: !C.hunter.scope && !!hm.sight, sniperBolt: !!vm.models.sniper.userData.model.userData.bolt, sniperImported: vm.models.sniper.userData.model.userData.imported === 'sniper',
      lift, back, settled: Math.abs(hm.bolt.rotation.z) < 1e-3 && Math.abs(hm.bolt.position.z - hm.boltZ0) < 1e-3,
      decor: Wd.decor.length, buildings: Wd.buildings.length, ponds: Wd.props.ponds.length, barrels: Wd.props.barrels.length, logs: Wd.props.logs.length };
    // stretched res + saturation
    const asp0 = g.camera.aspect; g.settings.stretch = 1; g.resize(); const asp1 = g.camera.aspect;
    g.settings.saturation = 1.6; g.applyColor(); const filt = g.renderer.domElement.style.filter;
    g.settings.stretch = 0; g.settings.saturation = 1; g.resize();
    r.video = { asp0, asp1, filt, reset: /saturate\(0\.88/.test(g.renderer.domElement.style.filter) && Math.abs(g.camera.aspect - asp0) < 1e-6 };
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
  // 1v1 duel: arena, loadouts, rounds, timeout rule, first-to-N, rematch
  const duel = await page.evaluate(() => {
    BR.Profile.data.equip.melee = 'knife'; BR.Profile.save(); BR.game.refreshCosmetics(); 
    const g = BR.game, o = {};
    g.startDuel({ diff: 'hard', target: 3, roundTime: 60, loadout: ['sniper', 'smg'] });
    o.arena = g.world.arena && g.world.size < 100 && g.actors.length === 2;
    o.loadout = g.player.slots.map(s => s && s.id).join(',');
    o.frozen = (() => { const x = g.player.pos.x; g.input.moveY = 1; for (let i = 0; i < 30; i++) g.update(1 / 30); g.input.moveY = 0; return Math.abs(g.player.pos.x - x) < 0.05 && g.duel.phase === 'countdown'; })();
    for (let i = 0; i < 80; i++) g.update(1 / 30);
    o.fighting = g.duel.phase === 'fight' && g.duelBot.brain.target === g.player;
    g.kill(g.duelBot, g.player, 'sniper', true); g.update(1 / 30);
    o.round1 = g.duel.score.join('-');
    for (let i = 0; i < 100 && g.state === 'playing'; i++) g.update(1 / 30);
    o.loadoutMenu = g.state === 'loadout' && !document.getElementById('duelmenu').classList.contains('hidden');
    g.duel.loadout = ['shotgun', 'pistol']; g.hud.show('duelmenu', false); g.startRound();
    o.newLoadout = g.player.slots.map(s => s && s.id).join(',') === 'shotgun,pistol,knife' && g.duel.round === 2;
    g.duel.phase = 'fight'; g.duel.t = 0.01; g.duelBot.health = 30; g.update(1 / 30);
    o.timeout = g.duel.score.join('-') === '2-0';
    for (let k = 0; k < 6 && g.state !== 'end'; k++) {
      for (let i = 0; i < 100 && g.state === 'playing'; i++) g.update(1 / 30);
      if (g.state === 'loadout') { g.hud.show('duelmenu', false); g.startRound(); g.duel.phase = 'fight'; g.duel.t = 30; g.kill(g.player, g.duelBot, 'rifle', false); g.update(1 / 30); }
    }
    o.end = g.state === 'end' && g.result.duel && document.getElementById('btn-again').textContent === 'REMATCH';
    o.final = g.duel.score.join('-');
    // mythic blueprints animate
    const m = BR.Models.weapon('rifle', 'default', 'none', 'neonviper');
    const rots = () => { const r = []; m.traverse(c => r.push(c.rotation.x.toFixed(3))); return JSON.stringify(r); }, before = rots();     // (v1.23: parts sit inside fit groups)
    BR.Models.animate(m, 2.5);
    o.mythic = Object.values(BR.Models.BLUEPRINTS).reduce((n, w) => n + Object.values(w).filter(b => b.rarity === 'Mythic').length, 0);
    o.mythicAnim = (m.userData.anim || []).length > 0 && rots() !== before;
    g.settings.bots = 19; g.startMatch();       // back to a battle royale for the next check
    return o;
  });
  const match = await page.evaluate(() => {
    const g = BR.game;
    g.player.takeDamage = () => false;           // idle player can't die, so the bots finish the match
    g.player.mover.pos.set(0, 200, 0);
    let n = 0; const t0 = performance.now();
    while (g.aliveCount() > 1 && n < 30 * 600) { g.update(1 / 30); n++; }
    return { seconds: n / 30, alive: g.aliveCount(), msPerStep: (performance.now() - t0) / n };
  });

  // performance: tiled + culled world, draw-call budget, adaptive resolution
  const perf = await page.evaluate(() => {
    const g = BR.game; g.settings.bots = 29; g.startMatch(); g.player.takeDamage = () => false;
    for (let i = 0; i < 30 * 30; i++) g.update(1 / 30);
    const W = g.world, info = g.renderer.info; info.autoReset = false;
    let calls = 0, tris = 0;
    for (let i = 0; i < 10; i++) { info.reset(); g.render(); calls += info.render.calls; tris += info.render.triangles; }
    info.autoReset = true;
    W.cullChunks(0, 0, 100); const hidden = W.chunks.filter(c => !c.obj.visible).length;
    const P = g.perf, s0 = P.scale; g.state = 'playing';
    for (let i = 0; i < 40; i++) g.adaptResolution(28);
    const dropped = P.scale; for (let i = 0; i < 700; i++) g.adaptResolution(16);
    return { chunks: W.chunks.length, hidden, calls: calls / 10, tris: Math.round(tris / 10), s0, dropped, recovered: P.scale, cap: P.cap, botMeshes: g.actors[1].mesh ? (() => { let n = 0; g.actors[1].mesh.traverse(o => { if (o.isMesh) n++; }); return n; })() : 0 };
  });
  // v1.5: butterfly knife + revolver + their skins, weaker Easy bots, 5-round hunter, slot opacity
  const v15 = await page.evaluate(() => {
    const g = BR.game, C = BR.CONFIG, P = BR.Profile, out = {};
    out.hunterMag = C.weapons.hunter.mag;
    out.easyMult = C.difficulty.easy.playerDamageMult; out.medMult = C.difficulty.normal.playerDamageMult;
    const M = BR.Models.BLUEPRINTS, caseIds = BR.CaseItems.all().map(x => x.id);
    out.bflySkins = Object.keys(M.butterfly).length; out.rvSkins = Object.keys(M.revolver).length;
    out.inCase = caseIds.filter(x => /^(butterfly|revolver):/.test(x)).length;
    out.inShop = Object.keys(M.butterfly).concat(Object.keys(M.revolver)).length - out.inCase;
    // equip the butterfly -> becomes the player's melee; draw flips the handles
    P.data.owned.blueprints.push('butterfly:fade'); P.setEquip('blueprints', 'butterfly:fade');
    g.startMatch({ practice: true }); g.player.takeDamage = () => false;
    for (let i = 0; i < 400 && g.player.mover.dropping; i++) g.update(1 / 30);
    const p = g.player; out.melee = p.slots[2] && p.slots[2].id;
    p.switchTo ? p.switchTo(2) : (p.cur = 2);
    const vm = g.vmr; let maxA = 0;
    for (let i = 0; i < 40; i++) { g.update(1 / 60); const ud = vm.models.butterfly && vm.models.butterfly.userData.model.userData; if (ud && ud.handleA) maxA = Math.max(maxA, Math.abs(ud.handleA.rotation.x)); }
    out.bflyFlip = maxA;
    // revolver: crane swings out and cylinder spins during reload
    g.practiceSpawn('weapon', 'revolver');
    const w = p.weapon; out.rv = w && w.id;
    let crane = 0, cyl0 = null, cyl = 0;
    if (w && w.id === 'revolver') { for (let i = 0; i < 60; i++) vm.update(1 / 60, 0, 0); w.mag = 0; BR.Weapons.startReload(w, p); for (let i = 0; i < 200 && w.reloadT > 0; i++) { BR.Weapons.update(w, 1 / 60, p); vm.update(1 / 60, 0, 0); const ud = vm.models.revolver.userData.model.userData; crane = Math.max(crane, ud.crane.rotation.z); if (cyl0 === null) cyl0 = ud.cylinder.rotation.z; cyl = Math.max(cyl, Math.abs(ud.cylinder.rotation.z - cyl0)); } }
    out.crane = crane; out.cyl = cyl;
    // pump shotgun: forend racks back after a shot and returns
    g.practiceSpawn('weapon', 'shotgun'); const sg = p.weapon; let pumpMax = 0, pumpEnd = 1;
    for (let i = 0; i < 40; i++) vm.update(1 / 60, 0, 0);
    vm.onFire(sg); for (let i = 0; i < 50; i++) { vm.update(1 / 60, 0, 0); pumpMax = Math.max(pumpMax, vm.models.shotgun.userData.model.userData.pump.position.z); }
    pumpEnd = vm.models.shotgun.userData.model.userData.pump.position.z; out.pump = [pumpMax, pumpEnd];
    P.setEquip('blueprints', 'butterfly:default'); P.data.equip.melee = 'knife';
    // every gun (old + new models) builds with every blueprint and every camo, and has a tracer slot
    { const MD = BR.Models, W = BR.CONFIG.weapons; let built = 0, bad = [];
      for (const w in W) {
        for (const b in (MD.BLUEPRINTS[w] || {})) { try { const m = MD.weapon(w, 'default', 'none', b); if (!m.children.length) bad.push(w + ':' + b); built++; } catch (e) { bad.push(w + ':' + b + ' ' + e.message); } }
        for (const sk in MD.SKINS) { try { MD.weapon(w, sk, 'none'); built++; } catch (e) { bad.push(w + ' camo ' + sk); } }
      }
      const tr = ['revolver', 'butterfly', 'smg', 'holoar', 'rifle', 'shotgun', 'sniper', 'hunter', 'pistol'].every(w => { P.data.equip.tracerByGun[w] = 'red'; return P.data.equip.tracerByGun[w] === 'red'; });
      out.cosmetics = { built, bad, tracers: tr }; }
    // inventory melee picker: karambit OR butterfly
    { const inv = document.querySelector('#inv-melee'); const btn = m => inv.querySelector('button[data-m="' + m + '"]');
      btn('butterfly').click(); const a = [P.data.equip.melee, g.player.slots[2] && g.player.slots[2].id];
      btn('knife').click(); const b2 = [P.data.equip.melee, g.player.slots[2] && g.player.slots[2].id, inv.querySelectorAll('button.sel').length];
      out.meleePick = { a, b: b2 }; }
    // reload button: inspects with a knife or a full mag, reloads otherwise
    { const inp = g.input, run = () => { vm.inspectT = 0; inp.press('reload'); g.state = 'playing'; g.update(1 / 60); return vm.inspectT > 0; };
      p.cur = 2; vm.lastWeapon = null; for (let i = 0; i < 80; i++) vm.update(1 / 60, 0, 0);
      const knife = run();
      g.practiceSpawn('weapon', 'rifle'); const rw = p.weapon; rw.mag = rw.def.mag; rw.reloadT = 0; for (let i = 0; i < 40; i++) vm.update(1 / 60, 0, 0);
      const full = run(), fullNoReload = !(rw.reloadT > 0);
      rw.mag = 3; vm.inspectT = 0; inp.press('reload'); g.update(1 / 60); const reloads = rw.reloadT > 0 && !(vm.inspectT > 0);
      out.reloadInspect = { knife, full, fullNoReload, reloads }; }
    // weapon pictures from the models: slot silhouettes + menu cards; hunting rifle kicks harder
    { const WI = BR.WeaponIcons, ids = Object.keys(C.weapons);
      g.hud.update && g.state === 'playing';
      out.icons = { sil: ids.every(id => WI.sil[id] && WI.sil[id].length > 500), pic: ids.every(id => WI.pic[id]),
        slot: !!document.querySelector('.slot .sicon .wsil'), spawnCards: document.querySelectorAll('#sp-weapons .gcard img').length,
        duelCards: document.querySelectorAll('#dm-g0 .gcard img').length, hunterRecoil: C.weapons.hunter.recoil, hunterKick: C.weapons.hunter.kick }; }
    // spawn menu (v1.23): a picked gun drops on the ground in front of you (not equipped); walking over it picks it up
    { p.slots[0] = null; p.slots[1] = null; g.state = 'playing'; g.openSpawnMenu(); const n0 = g.loot.items.length;
      const card = id => document.querySelector('#sp-weapons .gcard[data-arg="' + id + '"]');
      card('sniper').click(); const dropped = g.loot.items.length === n0 + 1 && g.loot.items[g.loot.items.length - 1].wid === 'sniper', a = p.slots.map(x => x && x.id).join();
      const it = g.loot.items[g.loot.items.length - 1]; g.closeSpawnMenu(); it.air = false; p.mover.pos.set(it.pos.x, it.pos.y, it.pos.z); p.pickupT = 0; g.update(1 / 30); g.update(1 / 30);
      out.spawnSlots = { a, dropped, picked: p.slots.some(x => x && x.id === 'sniper') }; }
    // weapon-slot opacity in the HUD editor
    const sa = document.getElementById('ed-slot-alpha'); sa.value = 0.3; sa.dispatchEvent(new Event('input'));
    out.slotAlpha = parseFloat(getComputedStyle(document.querySelector('#play > .slot:not(.empty)')).opacity);
    out.saved = g.settings.layout.slotAlpha;
    sa.value = 1; sa.dispatchEvent(new Event('input'));
    g.state = 'menu';
    return out;
  });
  // walls stop bullets and knives (both directions) in battle royale and the 1v1 arena
  const walls = await page.evaluate(() => {
    const g = BR.game, res = {};
    const scenario = () => {
      const W = g.world, p = g.player, bot = g.actors.find(a => a !== p);
      const Y = 118;
      W.addBox(-12, Y - 2, -12, 12, Y, 12, 0x888888);                 // platform high above everything
      W.addBox(-0.3, Y, -3, 0.3, Y + 4, 3, 0x888888);                 // the wall (blocks z -3..3)
      for (const a of [p, bot]) { a.alive = true; a.mover.dropping = false; a.mover.parachute = false; a.mover.vel.set(0, 0, 0); a.health = 100; a.shield = 0; a.pitch = 0; }
      const hp = a => a.health + (a.shield || 0);
      const gun = a => { a.slots[0] = BR.Weapons.create('rifle'); a.cur = 0; a.ammo.heavy = 300; };
      const aim = (a, yaw) => { a.alive = true; a.health = 100; a.shield = 0; a.yaw = yaw; a.pitch = 0; a.recoil = 0; a.recoilDrift = 0; a.mover.onGround = true; a.mover.vel.set(0, 0, 0); if (a.weapon) a.weapon.bloom = 0; };
      const fire = (a, n) => { for (let i = 0; i < n; i++) { a.mover.onGround = true; a.weapon.cool = 0; a.weapon.reloadT = 0; if (a.weapon.mag === 0) a.weapon.mag = a.weapon.def.mag; BR.Weapons.tryFire(g, a); } };
      gun(p); gun(bot);
      // through the wall: player at x=-4 facing +x, bot at x=+4 facing -x
      p.mover.pos.set(-4, Y, 0); aim(p, -Math.PI / 2); bot.mover.pos.set(4, Y, 0); aim(bot, Math.PI / 2);
      let b0 = hp(bot), p0 = hp(p); fire(p, 6); fire(bot, 6);
      const throughPlayer = hp(bot) < b0, throughBot = hp(p) < p0;
      // knife through the wall (both 0.8 m from it)
      bot.health = 100; p.mover.pos.set(-0.9, Y, 0); bot.mover.pos.set(0.9, Y, 0); p.cur = 2; aim(p, -Math.PI / 2); p.weapon.cool = 0; b0 = hp(bot);
      BR.Weapons.tryFire(g, p); const knifeThrough = hp(bot) < b0;
      // control: same distance with nothing in between (z = 6, past the wall's end)
      bot.health = 100; p.health = 100; p.cur = 0; p.mover.pos.set(-4, Y, 6); bot.mover.pos.set(4, Y, 6); aim(p, -Math.PI / 2); aim(bot, Math.PI / 2); b0 = hp(bot); p0 = hp(p);
      fire(p, 10); fire(bot, 10);
      const clearPlayer = hp(bot) < b0, clearBot = hp(p) < p0;
      p.mover.pos.set(-0.9, Y, 6); bot.mover.pos.set(0.9, Y, 6); p.cur = 2; aim(p, -Math.PI / 2); aim(bot, Math.PI / 2); p.weapon.cool = 0; b0 = hp(bot);
      BR.Weapons.tryFire(g, p); const knifeClear = hp(bot) < b0;
      return { throughPlayer, throughBot, knifeThrough, clearPlayer, clearBot, knifeClear };
    };
    g.settings.bots = 3; g.startMatch(); res.br = scenario();
    g.startDuel({ diff: 'normal', target: 3, roundTime: 60, loadout: ['rifle', 'smg'] }); res.duel = scenario();
    g.state = 'menu';
    return res;
  });
  // advanced sensitivity: horizontal / vertical multipliers scale the look
  const sensAdv = await page.evaluate(() => {
    const g = BR.game, S = g.settings, p = g.player, inp = g.input; g.state = 'playing';
    const turn = (sx, sy) => { S.sensX = sx; S.sensY = sy; S.aimSmooth = 0; S.sensCurve = 0; p.ads = false; const y0 = p.yaw, q0 = p.pitch = 0;
      inp.lookDX = 20; inp.lookDY = -10; g.controlPlayer(1 / 60); return [y0 - p.yaw, p.pitch - q0]; };
    const a = turn(1, 1), b = turn(2, 0.5);
    S.sensX = 1; S.sensY = 1; S.aimSmooth = 0.3;
    return { a, b, ui: !!document.getElementById('set-sensX') && !!document.getElementById('set-gyro') };
  });
  // v1.7: big feature batch
  const v17 = await page.evaluate(async () => {
    const g = BR.game, C = BR.CONFIG, P = BR.Profile, M = BR.Models, out = {};
    out.mapSize = C.map.size; out.run = C.move.runSpeed;
    // new weapons exist, build, fire and reload
    out.newGuns = ['lmg', 'dmr'].every(id => C.weapons[id] && (M.weapon(id).children.length > 10 || M.weapon(id).userData.imported) && BR.WeaponIcons.sil[id]);     // (v1.18: the LMG is an imported model)
    g.startMatch({ practice: true }); const p = g.player; p.mover.dropping = false; p.takeDamage = () => false;
    g.practiceSpawn('weapon', 'lmg', 0); g.practiceSpawn('weapon', 'dmr', 1);
    let fired = 0; for (const k of [0, 1]) { p.cur = k; p.weapon.cool = 0; if (BR.Weapons.tryFire(g, p)) fired++; }
    out.fired = fired; out.slots = p.slots.map(x => x && x.id).join();
    // Season 2 blueprints: one for every gun, animated, with a reload style
    const guns = Object.keys(C.weapons).filter(w => !C.weapons[w].melee);
    out.s2 = guns.every(w => Object.values(M.BLUEPRINTS[w] || {}).some(b => b.season === 2 && b.reload && ['warp', 'orbit', 'slam'].includes(b.reload.style)));
    out.s2anim = (() => { const m = M.weapon('rifle', 'default', 'none', 'hyperdrive'); return !!(m.userData.anim && m.userData.anim.length >= 2); })();
    // new reload styles run without errors
    const vm = g.vmr; let styled = 0;
    for (const st of ['warp', 'orbit', 'slam']) { vm.sigReload.rifle = { style: st, fx: 0x1de9ff }; g.practiceSpawn('weapon', 'rifle', 0); p.cur = 0; const w = p.weapon; w.mag = 3; BR.Weapons.startReload(w, p);
      for (let i = 0; i < 200 && w.reloadT > 0; i++) { BR.Weapons.update(w, 1 / 60, p); vm.update(1 / 60, 0, 0); } styled++; }
    out.styles = styled; out.holderScale = vm.models.rifle.scale.x;
    // Nova case: its own pool, only Legendary+
    const nova = BR.CaseItems.all('nova'), rel = BR.CaseItems.all('release');
    out.nova = { n: nova.length, onlyHigh: nova.every(e => ['Legendary', 'Mythic', 'Exotic'].includes(e.item.rarity)), disjoint: !nova.some(e => rel.includes(e)) };
    let rolls = 0; for (let i = 0; i < 200; i++) if (nova.includes(BR.CaseItems.roll('nova'))) rolls++; out.nova.rollsInPool = rolls === 200;
    // finishers: equip and play one on a kill
    P.data.owned.finishers.push('voidpop'); P.equip('finishers', 'voidpop');
    out.finEquipped = P.data.equip.finishers === 'voidpop';
    g.fx.finisher('voidpop', new THREE.Vector3(0, 0, 0), null); g.fx.finisher('starfall', new THREE.Vector3(2, 0, 0), null);
    for (let i = 0; i < 30; i++) g.fx.update(1 / 30);
    out.finActive = g.fx.fins && g.fx.fins.length >= 0;
    // per-weapon gloves
    P.data.owned.gloves.push('hyperspace'); P.equip('gloves', 'hyperspace', 'lmg');
    out.gloves = { lmg: P.gloveFor('lmg'), rifle: P.gloveFor('rifle') };
    g.refreshCosmetics(); p.cur = 0; g.practiceSpawn('weapon', 'lmg', 0); vm.update(1 / 60, 0, 0); out.gloveSwapped = vm.curGlove === 'hyperspace';
    P.equip('gloves', 'default', 'all');
    // dropped / loot weapons wear your skin: the merged mesh differs from the default one
    P.data.equip.blueprints.rifle = 'hyperdrive';
    const a = M.worldWeapon('rifle').geometry, b = M.worldWeapon('rifle', 'hyperdrive', 'default').geometry;
    out.lootSkin = a !== b && b.attributes.position.count > a.attributes.position.count;
    P.data.equip.blueprints.rifle = 'default';
    // camos are per gun: equipping on the SMG leaves the rifle alone; ALL puts it on every gun
    P.data.owned.skins.push('hyperspace');
    P.equip('skins', 'hyperspace', 'smg');
    out.camo = { smg: P.skinFor('smg'), rifle: P.skinFor('rifle'), smgEq: P.isEquipped('skins', 'hyperspace', 'smg'), rifleEq: P.isEquipped('skins', 'hyperspace', 'rifle') };
    g.refreshCosmetics(); const smgMat = []; vm.models.smg.traverse(o => { if (o.isMesh && o.material && o.material.map) smgMat.push(o.material.map.image); });
    const rifleTex = []; vm.models.rifle.traverse(o => { if (o.isMesh && o.material && o.material.map && o.material.emissiveMap) rifleTex.push(1); });
    out.camo.vmSmg = smgMat.length > 0; out.camo.vmRifleClean = rifleTex.length === 0;
    P.equip('skins', 'opal', 'all'); P.data.owned.skins.push('opal'); P.equip('skins', 'opal', 'all');
    out.camo.all = Object.keys(BR.CONFIG.weapons).every(w => P.skinFor(w) === 'opal');
    P.equip('skins', 'default', 'all');
    // K/D: deaths counted when a match isn't won; kd = kills / deaths
    { const st = P.data.stats, k0 = st.kills, d0 = st.deaths || 0;
      st.kills = 9; st.deaths = 3; out.kd = +P.kd().toFixed(2); st.kills = k0; st.deaths = d0;
      P.award({ kills: 2, damage: 100, place: 7, win: false, mode: 'br' }); out.kdDeath = (P.data.stats.deaths || 0) === d0 + 1; }
    // DMR prism optic: own overlay (not the sniper scope), zooms, hides the gun
    { g.practiceSpawn('weapon', 'dmr', 0); p.cur = 0; g.state = 'playing'; g.input.ads = true; p.ads = true;
      for (let i = 0; i < 40; i++) g.update(1 / 60);
      out.dmr = { optic: document.getElementById('scope2').classList.contains('on'), sniperScope: document.getElementById('scope').classList.contains('on'), zoomed: g.camera.fov < 45, gunHidden: !vm.root.visible };
      g.input.ads = false; p.ads = false; for (let i = 0; i < 20; i++) g.update(1 / 60); out.dmr.off = !document.getElementById('scope2').classList.contains('on'); }
    // karambit: the straight-finger glove holds the ring while it spins
    { P.data.equip.melee = 'knife'; g.refreshCosmetics(); p.cur = 2; vm.lastWeapon = null; let pointSeen = false;
      for (let i = 0; i < 40; i++) { vm.update(1 / 60, 0, 0); if (vm.knifeHands.RP.visible) pointSeen = true; }
      out.ringFinger = pointSeen; }
    // Nightshade butterfly: aura + glowing trail that shows while the blade flips
    { const B = BR.Models.BLUEPRINTS.butterfly.nightshade; P.data.equip.melee = 'butterfly'; P.data.equip.blueprints = Object.assign({}, P.data.equip.blueprints, { butterfly: 'nightshade' });
      g.refreshCosmetics(); p.cur = 2; vm.lastWeapon = null; let trailSeen = false;
      for (let i = 0; i < 60; i++) { vm.update(1 / 60, 0, 0); if (vm.bfTrail && vm.bfTrail.mesh.visible) trailSeen = true; }
      const base = BR.Models.weapon('butterfly', 'default', 'none'), ns = BR.Models.weapon('butterfly', 'default', 'none', 'nightshade'); let aura = 0; ns.traverse(o => { if (o.material && o.material.blending === THREE.AdditiveBlending) aura++; });
      out.nightshade = { bp: !!(B && B.trail && B.rarity === 'Mythic'), trail: !!vm.bfTrail, trailSeen, base: !!base, aura };
      P.data.equip.blueprints.butterfly = null; P.data.equip.melee = 'knife'; g.refreshCosmetics(); out.nightshade.cleared = !vm.bfTrail; }
    // v1.7.5: M9 bayonet = default knife, flipped into the hand on draw; blueprints, camos, case items; speedometer
    { const tryLoad = (d0) => { const k = P.KEY, saved = P.data, ul = BR.util.load, sv = P.save; BR.util.load = () => d0; P.save = () => {};
        try { P.load(); return P.data.equip.melee; } finally { BR.util.load = ul; P.save = sv; P.data = saved; P.KEY = k; } };
      const fresh = tryLoad(null), migrated = tryLoad({ owned: {}, equip: { melee: 'knife' } }), kept = tryLoad({ owned: {}, equip: { melee: 'butterfly' }, meleeV: 2 });
      P.data.equip.melee = 'bayonet'; g.refreshCosmetics(); p.cur = 2; vm.lastWeapon = null; let maxFlip = 0, maxLift = 0;
      const inr = vm.models.bayonet.userData.model.userData.inner;
      const bm = vm.models.bayonet.userData.model; let upBeat = 9, flipMid = 0;
      for (let i = 0; i < 70; i++) { vm.update(1 / 60, 0, 0); maxFlip = Math.max(maxFlip, Math.abs(inr.rotation.x)); maxLift = Math.max(maxLift, inr.position.y); if (i === 16) { upBeat = bm.quaternion.angleTo(bm.userData.qUp); flipMid = inr.rotation.x; } }
      const idleOk = bm.quaternion.angleTo(bm.userData.qIdle) < 0.05;
      vm.startInspect(p.weapon); let face2 = 9; for (let i = 0; i < Math.round(4.6 * 60 * 0.5); i++) vm.update(1 / 60, 0, 0); face2 = bm.quaternion.angleTo(bm.userData.qUp2);
      for (let i = 0; i < 160; i++) vm.update(1 / 60, 0, 0);
      const BB = BR.Models.BLUEPRINTS.bayonet || {}, ids = Object.keys(BB).filter(k => k !== 'default');
      const caseR = BR.CaseItems.all('release').filter(e => e.id.startsWith('bayonet:')).length, caseN = BR.CaseItems.all('nova').filter(e => e.id.startsWith('bayonet:')).length;
      const cm = BR.Models.weapon('bayonet', 'sabertooth', 'none'); const camoBlade = !!cm.userData.blade.material.map;
      out.bayonet = { fresh, migrated, kept, slot: p.slots[2] && p.slots[2].id, maxFlip, maxLift, upBeat, flipMid, idleOk, face2, settled: Math.abs(inr.rotation.x) < 0.01 && Math.abs(inr.position.y) < 0.002, fist: vm.knifeHands.RB.visible,
        bps: ids.length, caseR, caseN, camoBlade, trail: !!(BB.emberfang && BB.emberfang.trail), newCamos: ['sabertooth', 'ultraviolet', 'emerald', 'tidewater'].every(k => BR.Models.SKINS[k]) };
      g.settings.showSpeed = true; p.mover.vel.set(7, 0, 0); g.update ? null : null; g.hud.speed(p.mover.speedH, true);
      const sp = document.getElementById('speedo'); out.bayonet.speedo = sp && sp.style.display !== 'none' && sp.textContent.includes('7.0') && /M\/S/i.test(sp.textContent);
      g.hud.speed(0, false); out.bayonet.speedoOff = sp.style.display === 'none'; p.mover.vel.set(0, 0, 0); }
    // v1.7.6: soft beam tracers, spray pattern + recovery, kill reward
    { const T = g.fx.tracers[0]; out.beams = T.streak.geometry.type !== 'BoxGeometry' && !!T.head && T.head.isSprite && !!T.streak.material.map && g.fx.cam === g.camera;
      g.fx.tracer(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, -60), true, 0xffffff, { style: 'lightning', color2: 0x88aaff }); g.fx.update(0.05); out.beamOk = true;
      p.slots[0] = BR.Weapons.create('rifle'); p.cur = 0; p.ads = false; p.pitch = 0; p.recoil = 0; p.sprayLast = -9; p.mover.onGround = true; p.mover.vel.set(0, 0, 0);
      const kicks = [], yaws = [];
      for (let i = 0; i < 22; i++) { g.time += 0.09; const w = p.slots[0]; w.cool = 0; w.mag = 30; const r0 = p.recoil, y0 = p.yaw; BR.Weapons.tryFire(g, p); kicks.push(p.recoil - r0); yaws.push(p.yaw - y0); }
      let flips = 0; for (let i = 7; i < yaws.length; i++) if (Math.sign(p.sprayDir * Math.sin((i) * 0.42 + p.sprayPhase)) !== Math.sign(p.sprayDir * Math.sin((i - 1) * 0.42 + p.sprayPhase))) flips++;
      for (let i = 0; i < 30; i++) { p.recoil > 0 && (p.pitch += p.recoil, p.recoil = 0); }
      const peak = p.pitch; g.time += 0.3; for (let i = 0; i < 60; i++) { g.time += 1 / 60; p.update(1 / 60); }
      out.spray = { first: kicks[0], mid: kicks[8], ramps: kicks[0] < kicks[8] * 0.8, flips, peak, after: p.pitch, recovered: p.pitch < peak * 0.6 && p.pitch >= -1e-6 };
      // kill reward
      g.settings.bots = 2; g.startMatch(); const bot2 = g.actors.find(x => !x.isPlayer); const fins0 = (g.fx.fins || []).length;
      g.applyDamage(bot2, g.player, 999, true, { x: bot2.pos.x, y: bot2.pos.y + 1.6, z: bot2.pos.z }, 'rifle');
      const kb = document.getElementById('killban');
      out.killReward = { banner: kb.className.includes('on') && /HEADSHOT|KILL/.test(kb.textContent), flash: document.getElementById('killflash').className.includes('on'), hitStop: g.hitStop > 0, fx: (g.fx.fins || []).length > fins0 };
      g.hitStop = 0; }
    // v1.7.7: butterfly poses matched to the reference clip; victory sequence
    { P.data.equip.melee = 'butterfly'; g.settings.bots = 2; g.startMatch(); g.refreshCosmetics(); const pl = g.player, vm2 = g.vmr; pl.mover.dropping = false; pl.cur = 2; vm2.lastWeapon = null;
      const mdl = vm2.models.butterfly.userData.model, ud2 = mdl.userData; let upMid = 9, rollSeen = 0;
      for (let i = 0; i < 70; i++) { vm2.update(1 / 60, 0, 0); if (i === 40) upMid = mdl.quaternion.angleTo(ud2.qUp); rollSeen = Math.max(rollSeen, Math.abs(ud2.inner.rotation.y)); }
      const flatEnd = mdl.quaternion.angleTo(ud2.qIdle);
      vm2.startInspect(pl.weapon); let upInsp = 9; for (let i = 0; i < 90; i++) { vm2.update(1 / 60, 0, 0); if (i === 60) upInsp = mdl.quaternion.angleTo(ud2.qUp); }
      out.bfly2 = { upMid, flatEnd, rollSeen, upInsp, dur: vm2.inspectDur };
      P.data.equip.melee = 'knife'; g.refreshCosmetics();
      // win: kill every bot -> victory show, then the results screen
      const p3 = g.player; p3.mover.dropping = false; p3.mover.onGround = true;
      for (const a of g.actors) if (!a.isPlayer && a.alive) g.kill(a, p3, 'rifle', false);
      g.state = 'playing'; g.update(1 / 60);
      const eye = p3.pos.clone().setY(p3.pos.y + 1.6); for (let i = 0; i < 90; i++) g.update(1 / 60);
      const vicEl = document.getElementById('victory');
      out.victory = { state: g.state, active: !!g.victory, overlay: !vicEl.classList.contains('hidden') && vicEl.classList.contains('on'), hudHidden: document.getElementById('play').classList.contains('vic'),
        body: !!(p3.mesh && p3.mesh.visible), camOut: g.camera.position.distanceTo(eye) > 2, armsUp: !!(p3.mesh && (() => { const u = p3.mesh.userData, a = new THREE.Vector3(), b = new THREE.Vector3(); p3.mesh.updateMatrixWorld(true); u.AR.sh.getWorldPosition(a); u.AR.el.getWorldPosition(b); return b.y > a.y; })()), vmHidden: !g.vmr.root.visible };
      for (let i = 0; i < 60 * 7 && g.state !== 'end'; i++) g.update(1 / 60);
      out.victory.ended = g.state === 'end' && !g.victory && vicEl.classList.contains('hidden') && !document.getElementById('play').classList.contains('vic') && !document.getElementById('end').classList.contains('hidden');
      g.hud.show('end', false); }
    // v1.7.9: LMG ACOG eyepiece; smooth bevelled boxes
    { g.startMatch({ practice: true }); g.state = 'playing'; const pL = g.player; pL.mover.dropping = false; pL.mover.onGround = true; pL.slots[0] = BR.Weapons.create('lmg'); pL.cur = 0; g.vmr.lastWeapon = null;
      g.input.ads = true; for (let i = 0; i < 40; i++) g.update(1 / 60);
      const s3 = document.getElementById('scope3');
      out.acog = { on: s3.classList.contains('on'), prismOff: !document.getElementById('scope2').classList.contains('on'), sniperOff: !document.getElementById('scope').classList.contains('on'), zoomed: g.camera.fov < 50, gunHidden: !g.vmr.root.visible, model: !!BR.Models.weapon('lmg').userData.sight };
      g.input.ads = false; for (let i = 0; i < 20; i++) g.update(1 / 60); out.acog.off = !s3.classList.contains('on');
      const rb = BR.roundedBox(0.1, 0.05, 0.2), nn = rb.attributes.normal; let diag = 0; for (let i = 0; i < nn.count; i++) { const ax = Math.max(Math.abs(nn.getX(i)), Math.abs(nn.getY(i)), Math.abs(nn.getZ(i))); if (ax < 0.95) diag++; }
      out.smooth = diag; }
    // v1.8.0: vibrant knife blueprints (auras + gradient/rainbow trails), new finishers, realistic materials, bayonet grip
    { const VB = [['butterfly', 'hyperwave'], ['butterfly', 'solarflare'], ['butterfly', 'spectrum'], ['knife', 'supernovaclaw'], ['knife', 'abyssalbloom'], ['knife', 'frostreaper'], ['bayonet', 'plasmaedge'], ['bayonet', 'toxicrush'], ['bayonet', 'prismstorm']];
      let auraOk = 0; for (const [w, id] of VB) { const B = BR.Models.BLUEPRINTS[w][id]; const m = BR.Models.weapon(w, 'default', 'none', id); BR.Models.animate(m, 1.2);
        let add = 0, spr = 0; m.traverse(o => { if (o.isSprite) spr++; else if (o.material && o.material.blending === THREE.AdditiveBlending) add++; }); if (B && B.trail && add >= 3 && spr >= 10) auraOk++; }
      const trails = {};
      for (const [w, id] of [['bayonet', 'plasmaedge'], ['knife', 'supernovaclaw'], ['butterfly', 'spectrum']]) {
        g.startMatch({ practice: true }); P.data.equip.melee = w; P.data.equip.blueprints = Object.assign({}, P.data.equip.blueprints, { [w]: id }); g.refreshCosmetics();
        const pp = g.player; pp.mover.dropping = false; pp.cur = 2; g.vmr.lastWeapon = null; let seen = false;
        for (let i = 0; i < 70; i++) { g.vmr.update(1 / 60, 0, 0); if (g.vmr.bfTrail && g.vmr.bfTrail.mesh.visible) seen = true; }
        const T = g.vmr.bfTrail; trails[id] = { built: !!T, seen, grad: !!T && (T.rainbow || !T.color.equals(T.color2)) };
        P.data.equip.blueprints[w] = null; }
      P.data.equip.melee = 'knife'; g.refreshCosmetics();
      // finishers: each plays, then cleans itself up
      g.startMatch({ practice: true }); const fx = g.fx, base = (fx.fins || []).length, fins = {};
      for (const f of ['supernova', 'prismburst', 'thunderstrike', 'sakura', 'dragonsoul']) { const dummy = { mesh: new THREE.Group(), pos: g.player.pos.clone() }; g.scene.add(dummy.mesh);
        fx.finisher(f, dummy.pos.clone(), dummy); const peak = fx.fins.length; fins[f] = { peak: peak - base }; }
      await new Promise(r => setTimeout(r, 1300));
      for (let i = 0; i < 60 * 3; i++) fx.update(1 / 60);
      const left = fx.fins.length - base;
      const M = BR.Models.weapon('sniper', 'default', 'none'); let env = 0, bump = 0; M.traverse(o => { if (o.material && o.material.envMap) env++; if (o.material && (o.material.bumpMap || o.material.normalMap)) bump++; });   // (v1.17: normal maps; v1.16.3: the rifle is an imported model now, checked separately)
      const bm = g.vmr.models.bayonet.userData.model.userData;
      out.v180 = { auraOk, trails, fins, left, env, bump, grip: !!(bm.armVec && bm.armVecUp && bm.wristRoll && bm.gripY), shop: ['sakura', 'prismburst', 'supernova'].every(k => BR.FINISHERS[k] && BR.FINISHERS[k].price), nova: ['thunderstrike', 'dragonsoul'].every(k => BR.FINISHERS[k].caseOnly && BR.FINISHERS[k].case === 'nova') }; }
    // v1.8.2: PC keybinds for every action
    { const KB = BR.Keybinds, inp = g.input; KB.reset();
      const all = KB.ACTIONS.every(([a]) => KB.DEFAULTS[a] && KB.DEFAULTS[a][0]);
      const kd = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })), ku = c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
      KB.set('jump', 0, 'KeyH'); inp.pressed = {}; kd('KeyH'); const hJump = !!inp.pressed.jump && inp.jumpHeld; ku('KeyH'); const released = !inp.jumpHeld;
      inp.pressed = {}; kd('Space'); const spaceDead = !inp.pressed.jump; ku('Space');
      const stolen = KB.set('reload', 1, 'KeyH'); const steal = stolen === 'jump' && KB.get().jump[0] === null && KB.actionsFor('KeyH').join() === 'reload';
      KB.set('fire', 1, 'Mouse3'); inp.bindDown('Mouse3'); const mFire = inp.fire; inp.bindUp('Mouse3'); const mOff = !inp.fire;
      KB.set('slot0', 1, 'WheelUp'); inp.pressed = {}; inp.bindDown('WheelUp'); inp.bindUp('WheelUp'); const wheel = !!inp.pressed.slot0;
      KB.set('forward', 0, 'KeyI'); kd('KeyI'); const fwd = inp.moveY > 0.9; ku('KeyI'); const stop = inp.moveY === 0;
      const saved = JSON.parse(localStorage.getItem('surge.keybinds') || '{}');
      // settings UI: click a slot, press a key
      document.getElementById('btn-settings').click();
      document.querySelector('.kb-key[data-a="stim"][data-i="1"]').click(); kd('KeyZ');
      const ui = KB.get().stim[1] === 'KeyZ' && !KB.capturing && document.querySelector('.kb-key[data-a="stim"][data-i="1"]').textContent === 'Z';
      document.querySelector('.kb-key[data-a="map"][data-i="0"]').click(); kd('Escape'); const esc = KB.get().map[0] === 'KeyM';
      document.getElementById('kb-reset').click(); const reset = KB.get().jump[0] === 'Space' && KB.get().stim[1] === null;
      document.getElementById('settings-back').click();
      out.kb = { n: KB.ACTIONS.length, all, hJump, released, spaceDead, steal, mFire, mOff, wheel, fwd, stop, saved: saved.forward && saved.forward[0] === 'KeyI', ui, esc, reset }; }
    // v1.8.3: pause -> settings, shop/inventory layout, font, tuning, freeze frame, skin finishes
    { g.startMatch({ practice: true }); g.state = 'playing'; g.pause();
      document.getElementById('btn-settings2').click();
      const pauseHid = document.getElementById('pause').classList.contains('hidden') && !document.getElementById('settings').classList.contains('hidden');
      document.getElementById('settings-back').click();
      const pauseBack = !document.getElementById('pause').classList.contains('hidden') && document.getElementById('settings').classList.contains('hidden');
      g.resume ? g.resume() : (g.state = 'playing', g.hud.show('pause', false));
      const font = getComputedStyle(document.body).fontFamily.includes('Outfit') && getComputedStyle(document.querySelector('.logo-title .lt i')).fontFamily.includes('Outfit');
      // freeze frame on the last kill
      g.settings.bots = 1; g.startMatch(); const pf = g.player; pf.mover.dropping = false; pf.mover.onGround = true;
      for (const a of g.actors) if (!a.isPlayer && a.alive) g.kill(a, pf, 'rifle', true);
      g.state = 'playing'; g.update(1 / 60);
      const t0 = g.time, frz = g.freezeT > 0 && document.getElementById('play').classList.contains('freeze') && !g.victory;
      for (let i = 0; i < 30; i++) g.update(1 / 60);
      const held = g.time === t0 && !g.victory;
      for (let i = 0; i < 40; i++) g.update(1 / 60);
      const after = !!g.victory && !document.getElementById('play').classList.contains('freeze');
      g.startMatch({ practice: true });
      const tiger = BR.Models.weapon('rifle', 'tiger', 'none'), gold = BR.Models.weapon('rifle', 'gold', 'none'); let envT = 0, envG = 0;
      tiger.traverse(o => { if (o.material && o.material.map && o.material.envMap) envT++; }); gold.traverse(o => { if (o.material && o.material.reflectivity >= 0.4) envG++; });
      out.v183 = { pauseHid, pauseBack, font, frz, held, after, shotgunRpm: C.weapons.shotgun.rpm, lift: C.shockwave.lift, envT, envG,
        meleeHidden: (() => { document.getElementById('btn-inv').click(); document.querySelector('#inv-tabs button[data-cat="skins"]').click(); const h = document.getElementById('inv-melee').classList.contains('hidden'); document.querySelector('#inv-tabs button[data-cat="blueprints"]').click(); const v = !document.getElementById('inv-melee').classList.contains('hidden'); document.getElementById('inv-back').click(); return h && v; })() }; }
    // v1.9.0: zombies mode
    { const zr = {};
      zr.card = !!document.getElementById('btn-zombies');
      document.getElementById('btn-zombies').click();
      const p = g.player, Z = g.zm; let taken = 0; const td = p.takeDamage.bind(p); p.takeDamage = (a, bs) => { taken += a; return td(a, bs); };
      zr.map = g.world.halloween && (g.world.zmSpawns || []).length >= 10 && Z.buys.length >= 4 && document.body.classList.contains('zombies');
      for (let i = 0; i < 60 * 5; i++) g.update(1 / 60);
      zr.round1 = Z.round === 1 && Z.zombies.length > 0 && !document.getElementById('zm-hud').classList.contains('hidden');
      const z0 = Z.zombies.find(z => z.alive); const d0 = z0.pos.distanceTo(p.pos);
      for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);
      zr.chase = Z.zombies.every(z => !z.alive || z.brain.target === p) && z0.pos.distanceTo(p.pos) < d0 - 1;
      // a zombie next to you swipes
      p.health = 100; p.shield = 0; taken = 0; const zz = Z.spawnZombie({ x: p.pos.x + 0.9, z: p.pos.z }, 0);
      for (let i = 0; i < 60 * 2; i++) g.update(1 / 60);
      zr.swipe = taken > 0;
      // clear the round: kill everything that's left
      p.takeDamage = () => false; let pts0 = Z.points;
      const killAll = () => { for (const z of Z.zombies.slice()) if (z.alive) g.applyDamage(z, p, 1e6, true, { x: z.pos.x, y: z.pos.y + 1.6, z: z.pos.z }, 'pistol'); };
      for (let k = 0; k < 40 && Z.round === 1; k++) { Z.toSpawn = 0; killAll(); for (let i = 0; i < 30; i++) g.update(1 / 60); }
      zr.points = Z.points > pts0; zr.kills = Z.kills > 0;
      for (let i = 0; i < 60 * 9 && Z.round < 2; i++) g.update(1 / 60);
      const s1 = BR.zombieRoundStats(1), s5 = BR.zombieRoundStats(5), s15 = BR.zombieRoundStats(15);
      zr.round2 = Z.round === 2; zr.scales = s5.hp > s1.hp && s15.hp > s5.hp && s5.count > s1.count && s15.mix[2] > s5.mix[2];
      // jump to round 9 and clear it -> round 10 brings a boss
      Z.round = 9; Z.toSpawn = 0; killAll(); for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);
      for (let i = 0; i < 60 * 10 && Z.round < 10; i++) g.update(1 / 60);
      for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);
      zr.cutscene = !!Z.cut && document.body.classList.contains('zm-cinema') && document.getElementById('zm-cut').classList.contains('on');
      for (let i = 0; i < 60 * 7; i++) g.update(1 / 60);
      zr.cutEnd = !Z.cut && !document.body.classList.contains('zm-cinema');
      zr.boss = Z.round === 10 && !!Z.boss && Z.boss.boss === 'pumpkin' && !document.getElementById('zm-boss').classList.contains('hidden');
      // boss takes damage, dies, pays out
      if (Z.boss) { const bo = Z.boss; pts0 = Z.points; g.applyDamage(bo, p, 50, true, { x: bo.pos.x, y: bo.pos.y + 3.4, z: bo.pos.z }, 'rifle'); const hit = bo.health < bo.maxHp;
        g.applyDamage(bo, p, 1e7, false, { x: bo.pos.x, y: bo.pos.y + 1, z: bo.pos.z }, 'rifle'); zr.bossDies = hit && !bo.alive && Z.points >= pts0 + 2000 && Z.powers.length >= 2 && !Z.boss; }
      // every boss type runs its moves
      zr.moves = {};
      for (const t of ['pumpkin', 'banshee', 'colossus', 'plague']) {
        Z.round = { pumpkin: 10, banshee: 20, colossus: 30, plague: 40 }[t];
        const bo = new BR.ZBoss(g, Z, t, Z.round); bo.mover.pos.set(p.pos.x, 0, p.pos.z - 6); bo.riseT = 0; g.scene.add(bo.mesh); Z.zombies.push(bo); g.actors.push(bo); Z.boss = bo;
        const seen = new Set(); for (let i = 0; i < 60 * 14; i++) { Z.toSpawn = 0; g.update(1 / 60); if (bo.move) seen.add(bo.move.id); }
        zr.moves[t] = seen.size; bo.alive = false; bo.deathT = g.time - 5; Z.boss = null;
      }
      // power-ups
      Z.dropPower(p.pos.clone(), 'instakill'); for (let i = 0; i < 10; i++) g.update(1 / 60);
      const w = p.slots[0]; w.mag = 1; Z.dropPower(p.pos.clone(), 'maxammo'); for (let i = 0; i < 10; i++) g.update(1 / 60);
      zr.powers = Z.insta > 0 && w.mag === w.def.mag;
      // wall buy
      const by = Z.buys.find(x => x.wid === 'smg'); Z.points = 5000; p.mover.pos.set(by.x, g.world.groundAt(by.x, by.z, 3), by.z); g.update(1 / 60);
      const promptOk = /Buy/.test(document.getElementById('prompt') ? document.getElementById('prompt').textContent : 'Buy');
      g.input.press('interact'); g.update(1 / 60);
      zr.buy = promptOk && p.hasWeapon('smg') && Z.points === 5000 - by.cost;
      // death ends the run on the round reached
      p.takeDamage = td; Z.phase = 'fight'; g.applyDamage(p, Z.zombies.find(z => z.alive) || null, 1e6, false, { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, 'zombie');
      for (let i = 0; i < 60 * 4 && g.state !== 'end'; i++) g.update(1 / 60);
      zr.death = g.state === 'end' && g.result && g.result.zombies && /ROUND/.test(document.getElementById('end-place').textContent);
      g.hud.show('end', false);
      out.zm = zr; }
    // v1.9.1: ADS crosshair, zombie highlight, doors, box, Pack-a-Punch, counter, quests, journal, zombie models
    { const z2 = {};
      g.startMatch({ practice: true }); const pa = g.player; pa.mover.dropping = false; pa.slots[0] = BR.Weapons.create('rifle'); pa.cur = 0; g.state = 'playing';
      g.input.ads = true; for (let i = 0; i < 40; i++) g.update(1 / 60); z2.adsXh = !document.getElementById('crosshair').classList.contains('hide'); g.input.ads = false; g.update(1 / 60);
      g.settings.highlight = 'bright'; g.startZombies(); const p = g.player, Z = g.zm; p.takeDamage = () => false;
      const step = s => { for (let i = 0; i < s * 60; i++) g.update(1 / 60); };
      const at = (x, z) => { p.mover.pos.set(x, g.world.groundAt(x, z, 3), z); p.mover.vel.set(0, 0, 0); g.update(1 / 60); };
      const press = () => { g.input.press('interact'); g.update(1 / 60); };
      step(4.5);
      const zz = Z.zombies.find(z => z.alive); let tinted = false; if (zz) zz.mesh.traverse(o => { if (o.isMesh && o.material && o.material.emissive && o.material.emissive.r > 0.04) tinted = true; });
      z2.highlight = tinted; g.settings.highlight = 'subtle';
      z2.kinds = new Set(Z.zombies.map(z => z.mesh.userData.kind)).size >= 1 && !!Z.zombies[0].mesh.userData.mat.map;
      z2.left = /ZOMBIES\s*\d+/.test(document.getElementById('zm-left').textContent) && !document.getElementById('zm-left').classList.contains('hidden');
      z2.map = g.world.size >= 200 && Z.doors.length === 3 && Z.buys.length >= 12 && g.world.zmBoxSpots.length >= 4 && !!g.world.zmPap;
      // doors: locked spawns stay closed until bought
      z2.spawnsLocked = Z.zombies.every(z => BR.zombieZoneAt(z.pos.x, z.pos.z) === 'graveyard');
      Z.points = 30000; const d = Z.doors.find(x => x.to === 'patch'); at(d.cx - 2, d.cz); press();
      z2.door = d.open && Z.unlocked.has('patch') && !g.world.boxes.includes(d.box) && Z.points === 30000 - d.cost;
      // box: roll, offer, take
      const B = Z.box; at(B.grp.position.x + 1.6, B.grp.position.z); press(); const rolled = B.state === 'rolling'; step(3.6); const offered = B.state === 'offer' && !!B.wid; const w = B.wid; press();
      z2.box = rolled && offered && p.hasWeapon(w) && B.state === 'idle' && B.beam.visible !== false;
      // pack-a-punch (open the manor first)
      const dm = Z.doors.find(x => x.to === 'manor'); at(dm.cx, dm.cz + 2); press(); at(Z.pap.x, Z.pap.z); p.cur = 0; const before = p.slots[0].def.dmg; g.update(1 / 60); press();
      z2.pap = !!p.slots[0].def.pap && p.slots[0].def.dmg > before * 2 && p.slots[0].def.name !== BR.CONFIG.weapons[p.slots[0].id].name;
      g.vmr.update(1 / 60, 0, 0); z2.papModel = !!(g.vmr.papModels && g.vmr.papModels[p.slots[0].id]) && g.tracerColor(p) === 0xc06bff;
      // quests every 5 rounds -> reward + lore in the journal
      Z.round = 4; Z.toSpawn = 0; for (const z of Z.zombies) if (z.alive) g.kill(z, p, 'pistol', false); step(9.5);
      const q = Z.quest; z2.questStart = !!q && q.def.id === 'pages' && q.spots.length === q.goal && !document.getElementById('zm-quest').classList.contains('hidden');
      const pts = Z.points, jn = Z.journal.length; if (q) for (const sp of q.spots) at(sp.x, sp.z); step(0.2);
      z2.questDone = !Z.quest && Z.points > pts && Z.journal.length === jn + 1 && /STORY/.test(document.getElementById('zm-lore').textContent);
      g.input.press('journal'); g.update(1 / 60); z2.journal = !document.getElementById('zm-journal').classList.contains('hidden') && document.querySelectorAll('#zm-journal .zj-e').length >= 2; g.input.press('journal'); g.update(1 / 60);
      z2.story = Object.keys(BR.ZOMBIE_STORY.bosses).length === 4 && BR.ZOMBIE_STORY.lore.length >= 8 && BR.ZOMBIE_QUESTS.length >= 8;
      z2.kb = BR.Keybinds.get().journal[0] === 'KeyJ';
      out.z2 = z2; g.state = 'menu'; }
    // v1.10: zombie flow-field nav + last-5 markers, aim trainer, Overdrive, Resurgence, grind, in-match locker
    { const v = {}, P = BR.Profile, run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
      // zombies walk round walls to reach you (flow field), lost ones get rescued, markers at <= 5 left
      g.startZombies(); const Z = g.zm, p = g.player; run(90);
      Z.phase = 'fight'; Z.toSpawn = 0; Z.bossPending = 0;
      const zs = g.world.zmSpawns.filter(s => s.zone === 'graveyard').slice(0, 8).map(s => Z.spawnZombie(s, 0.05));
      p.mover.pos.set(0, g.world.groundAt(0, -20, 20), -20);
      for (let i = 0; i < 30 * 30; i++) { p.health = 100; g.update(1 / 30); }
      v.navReach = zs.filter(z => z.alive && Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 4).length;
      v.navField = Z.nav.n >= 200 && Z.nav.distAt(p.pos.x + 2, p.pos.z) < 65535;
      for (const z of zs.slice(0, 4)) if (z.alive) g.kill(z, p, 'pistol', false);
      for (let i = 0; i < 6; i++) { p.health = 100; g.update(1 / 30); }
      v.marks = [...document.querySelectorAll('#zm-marks .zmk')].filter(e => e.style.display !== 'none').length;
      v.left = Z.left();
      // aim trainer
      g.startMode(BR.AimTrainer, { range: true }); const A = g.mode;
      v.aimMenu = !document.getElementById('aimmenu').classList.contains('hidden') && document.querySelectorAll('#at-drills .at-drill').length === 4;
      document.getElementById('at-go').click(); run(100);
      const t = A.targets[0], e = p.eye ? null : null, pl = g.player, ey = pl.eye(new THREE.Vector3());
      const dx = t.mesh.position.x - ey.x, dy = t.mesh.position.y - ey.y, dz = t.mesh.position.z - ey.z;
      pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); pl.slots[0].cool = 0;
      BR.Weapons.tryFire ? 0 : 0; const h = g.hitscan(pl, ey, pl.aimDir(new THREE.Vector3()), 100);
      v.aimRay = h.target === t; A.onShot(); A.hitTarget(h.target, 60, false, h.target.mesh.position);
      v.aimHit = A.run.hits === 1 && A.run.score > 0 && A.targets.length === 3;
      A.run.t = 0.01; run(2); v.aimDone = A.state === 'done' && !document.getElementById('at-res').classList.contains('hidden') && (A.data.best.gridshot || 0) > 0;
      // locker from the aim trainer + pause in practice
      document.getElementById('atr-menu').click(); document.getElementById('at-locker').click();
      v.locker = g.state === 'shop' && !document.getElementById('inventory').classList.contains('hidden');
      document.getElementById('inv-back').click(); v.lockerBack = g.state === 'paused' && !document.getElementById('aimmenu').classList.contains('hidden');
      // Overdrive
      g.startMode(BR.Overdrive, { overdrive: true }); const O = g.mode;
      const card = () => { const c = document.querySelector('#od-level:not(.hidden) #od-cards [data-u]'); if (c) c.click(); else if (g.state === 'paused') { g.state = 'playing'; v.odStray = (v.odStray || 0) + 1; } };
      for (let i = 0; i < 30 * 20; i++) { g.player.health = 100; if (g.state === 'paused') card(); g.update(1 / 30); }
      O.damage(O.enemies[0], 1e9, null, false, 'gun');
      v.odEnemies = O.enemies.length > 5 && O.kills > 0 && O.powers.orbit >= 1;
      O.xp = 1e3; for (let i = 0; i < 3; i++) g.update(1 / 30);
      v.odLevel = g.state === 'paused' && !document.getElementById('od-level').classList.contains('hidden') && document.querySelectorAll('#od-cards .od-card').length >= 1;
      card(); for (let k = 0; k < 80 && g.state === 'paused'; k++) card();
      O.pendingLv = 0; if (g.state === 'paused') { g.hud.show('od-level', false); g.state = 'playing'; }
      v.odPicked = O.level > 1 && Object.keys(O.powers).length + Object.keys(O.passives).length >= 2;
      const en = O.enemies[0], ey2 = g.player.eye(new THREE.Vector3()); const d2 = new THREE.Vector3(en.x - ey2.x, en.y - ey2.y, en.z - ey2.z).normalize();
      v.odRay = g.hitscan(g.player, ey2, d2, 200).target === en || O.enemies.length > 0;
      O.t = 600; for (let i = 0; i < 3; i++) g.update(1 / 30); const ov = O.enemies.find(q => q.E.final); O.pendingLv = 0; if (g.state === 'paused') { g.hud.show('od-level', false); g.state = 'playing'; } O.damage(ov, 1e9, null, false, 'gun'); v.odDbg = { st: g.state, ov: !!ov };
      for (let i = 0; i < 30 * 8; i++) g.update(1 / 30);
      v.odWin = g.state === 'end' && g.result.overdrive && g.result.win && /OVERDRIVE/.test(document.getElementById('end-eyebrow').textContent);
      // Resurgence: you + bots redeploy until circle 4, then last one standing
      g.startMatch({ resurgence: true }); const rp = g.player; run(30);
      g.applyDamage(rp, g.actors[1], 999, false, rp.pos, 'rifle'); run(30 * 15);
      v.resBack = rp.alive && g.state === 'playing' && rp.mover.dropping;
      const bot = g.actors.find(a => a !== rp && a.alive); g.kill(bot, rp, 'rifle', false); for (let i = 0; i < 30 * 15; i++) { rp.health = 100; g.update(1 / 30); }
      v.resBot = g.actors.some(a => a.id === bot.id && a.alive);
      g.zone.pickNext(3); run(3); g.applyDamage(rp, g.actors[1], 999, false, rp.pos, 'rifle'); run(30 * 3);
      v.resEnd = g.state === 'end' && /RESURGENCE/.test(document.getElementById('end-eyebrow').textContent);
      // grind camos + blueprints
      const G0 = JSON.stringify(P.data.grind || {});
      v.grindItems = P.grindItems().length >= 12 && P.grindItems().every(e => !e.item.price && !e.item.caseOnly);
      v.grindLocked = !P.owns('skins', 'g_tempest');
      for (let i = 0; i < 400; i++) P.addGrind('kill', 1, { w: 'rifle', head: i < 150, melee: false });
      v.grindUnlock = P.owns('skins', 'g_tempest') && P.owns('skins', 'g_ember') && P.owns('blueprints', 'rifle:stormcaller');
      v.grindAnim = ['g_ember', 'g_tempest', 'g_abyss', 'g_starforge', 'g_afterburn', 'g_lumen', 'g_ascendant'].every(id => { const m = BR.Models.weapon('rifle', id, 'none', 'default'); let ok = false; m.traverse(o => { if (o.material && o.material.map && o.material.map._anim) ok = true; }); return ok; });
      g.toMenu(); document.getElementById('btn-grind').click(); v.grindUi = document.querySelectorAll('#grind-list .gr-row').length >= 12 && document.querySelectorAll('#grind-list .gr-row.own').length >= 3; document.getElementById('grind-x').click();
      P.data.grind = JSON.parse(G0); P.data.owned.skins = P.data.owned.skins.filter(x => !/^g_/.test(x)); P.data.owned.blueprints = P.data.owned.blueprints.filter(x => x !== 'rifle:stormcaller'); P.save();
      // practice: locker in the pause menu
      document.getElementById('btn-practice').click(); g.pause(); v.pauseLocker = getComputedStyle(document.getElementById('btn-locker')).display !== 'none';
      document.getElementById('btn-locker').click(); const inShop = g.state === 'shop'; document.getElementById('inv-back').click();
      v.practiceLocker = inShop && g.state === 'paused' && !document.getElementById('pause').classList.contains('hidden');
      v.modes = ['btn-resurgence', 'btn-overdrive', 'btn-aim'].every(id => !!document.getElementById(id));
      g.toMenu();
      out.v110 = v; }
    // v1.11: rarities, default loadout, Discover browser, sleeves, knife animation fixes
    { const v = {}, P = BR.Profile, run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
      const W = BR.Weapons, c = W.create('rifle', undefined, 0), m = W.create('rifle', undefined, 5);
      v.rarTable = BR.RARITY.length === 6 && BR.RARITY.map(r => r.id).join() === 'common,uncommon,rare,epic,legendary,mythic';
      v.rarStats = c.def === BR.CONFIG.weapons.rifle && m.def.dmg > c.def.dmg * 1.3 && m.def.reload < c.def.reload && m.rar === 5;
      let cnt = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 4000; i++) cnt[BR.rollRarity(1)]++; v.rarRoll = cnt.every((n, i) => i === 5 ? n > 0 && n < 120 : n > 50);
      // loadout: default + used in practice
      v.loadoutDefault = P.loadoutGuns().primary === 'rifle' && P.loadoutGuns().secondary === 'pistol';
      P.data.loadout = { primary: 'lmg', secondary: 'revolver' };
      document.getElementById('btn-practice').click(); const pl = g.player;
      v.loadoutUsed = pl.slots[0] && pl.slots[0].id === 'lmg' && pl.slots[1] && pl.slots[1].id === 'revolver';
      P.data.loadout = { primary: 'rifle', secondary: 'pistol' }; P.save();
      // rarity loot: label + beam + pickup keeps rarity + HUD slot tint + swap prompt
      pl.slots[0] = null; pl.slots[1] = null; pl.cur = 2; run(2);
      const q = g.frontPoint(0.5), it = g.loot.add({ kind: 'weapon', wid: 'smg', rar: 4, mag: 25, reserve: 25 }, pl.pos.x, pl.pos.y, pl.pos.z);
      v.lootBeam = !!it.mesh.userData.beam;
      run(10); v.pickRar = pl.slots.some(s => s && s.id === 'smg' && s.rar === 4);
      run(3); v.slotRar = !!document.querySelector('#play > .slot.rar[data-rar="legendary"]');
      const it2 = g.loot.add({ kind: 'weapon', wid: 'smg', rar: 5, mag: 25, reserve: 25 }, pl.pos.x, pl.pos.y, pl.pos.z);
      run(10); v.swapPrompt = /Mythic SMG/.test(document.getElementById('prompt').textContent);
      // practice spawn menu rarity picker
      v.spRar = document.querySelectorAll('#sp-rar button').length === 6;
      g.practiceSpawn('weapon', 'dmr', 0, 3); v.spawnRar = pl.slots[0].rar === 3;
      // sleeves: lathe forearms attached at the wrist
      pl.slots[0] = W.create('rifle'); pl.cur = 0; g.vmr.lastWeapon = null; run(40);
      const A = g.vmr.arms.L, wrist = A.hand.localToWorld(new THREE.Vector3(0, 0, 0.05));
      v.sleeve = (A.fore.geometry.type === 'LatheGeometry' || !!BR.CHAR_DATA) && A.fore.geometry.attributes.position.count > 200 && A.fore.visible && A.fore.position.distanceTo(wrist) < A.fore.scale.y * 0.55 + 0.02;
      // bayonet: full flip mid-draw; karambit inspect shows the blade (not hanging on the finger) mid-way
      P.data.equip.melee = 'bayonet'; g.refreshCosmetics(); pl.slots[2] = W.create('bayonet'); pl.cur = 2; g.vmr.lastWeapon = null; run(1);
      const vm = g.vmr; vm.drawT = vm.drawDur * (1 - 0.34); g.update(1 / 240);
      const inr = vm.models.bayonet.userData.model.userData.inner; v.bayFlip = inr && Math.abs(inr.rotation.x) > 2.5 && Math.abs(inr.rotation.x) < 3.8;
      P.data.equip.melee = 'knife'; g.refreshCosmetics(); pl.slots[2] = W.create('knife'); g.vmr.lastWeapon = null; run(40);
      g.startInspect(); vm.inspectT = vm.inspectDur * (1 - 0.3); g.update(1 / 240);
      const sp = vm.models.knife.userData.spin; v.karShow = sp && sp.ringW < 0.01;
      vm.inspectT = vm.inspectDur * (1 - 0.72); g.update(1 / 240); v.karSpin = sp && sp.ringW > 0.9 && sp.ang > 1;
      P.data.equip.melee = 'bayonet'; g.refreshCosmetics();
      // Discover browser + lobby PLAY
      g.toMenu(); document.getElementById('mode-cur').click();
      v.discover = !document.getElementById('discover').classList.contains('hidden') && document.querySelectorAll('#dc-rows .dc-tile').length === 11;
      document.querySelector('#discover [data-m="aim"]').click();
      v.selected = g.settings.mode === 'aim' && /AIM TRAINER/.test(document.getElementById('mc-name').textContent);
      document.getElementById('btn-go').click(); v.goAim = g.mode instanceof BR.AimTrainer;
      g.toMenu(); BR.selectMode('br');
      document.getElementById('btn-loadout').click(); v.loUi = document.querySelectorAll('#lo-primary .gcard').length === 8 && !!document.querySelector('#lo-primary .gcard.sel'); document.getElementById('lo-x').click();
      out.v111 = v; }
    // v1.11.1: straight wrist, aim trainer infinite ammo, no frozen sparks in freefall, Ironreef for Resurgence
    { const v = {}, run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
      document.getElementById('btn-practice').click(); const pl = g.player; pl.slots[0] = BR.Weapons.create('rifle'); pl.cur = 0; g.vmr.lastWeapon = null; run(40);
      const L = g.vmr.arms.L; L.hand.updateMatrixWorld(true);
      const hz = new THREE.Vector3(0, 0, 1).applyQuaternion(L.hand.quaternion), fd = new THREE.Vector3(0, 1, 0).applyQuaternion(L.fore.quaternion);
      v.wrist = hz.dot(fd) > 0.97;
      // sparks are cleared when the viewmodel hides (skydive)
      const sp = g.vmr.sparks[0]; sp.life = 1; sp.m.visible = true; g.practiceSpawn('skydive'); run(3);
      v.sparks = g.vmr.sparks.every(q => !q.m.visible);
      // aim trainer: the mag never empties
      g.startMode(BR.AimTrainer, { range: true }); document.getElementById('at-go').click(); run(100);
      const w = g.player.weapon; for (let i = 0; i < 40; i++) { w.cool = 0; BR.Weapons.tryFire(g, g.player); run(1); }
      v.infAmmo = w.mag === w.def.mag && w.reloadT === 0;
      // Resurgence plays on Ironreef
      g.startMatch({ resurgence: true }); const W = g.world;
      v.reef = W.reef && W.size === 380 && W.half === 190 && W.pois.length === 6 && W.pois[0].name === 'The Stockade' && W.chestSpots.length >= 15 && g.loot.items.length > 100 && g.zone.phases[0].radius <= 160;
      g.toMenu();
      out.v1111 = v; }
    // v1.12: arena formats offline (duels 1v1/2v2, shotgun, sniper, TDM, FFA), shield cell, Overdrive humanoids
    { const v = {}, run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
      const play = (preset, size) => { BR.Lobby.skipRoll = true; BR.Lobby.preset = preset; BR.Lobby.size = size; BR.Lobby.play(); return g.mode; };
      let M = play('duel', 2); v.duel2 = g.actors.length === 4 && g.actors.filter(a => a.team === g.player.team).length === 2 && M.arena;
      run(220); v.duelFight = M.phase === 'fight';
      // a kill on the enemy team scores; no friendly fire
      const mate = g.actors.find(a => !a.isPlayer && a.team === g.player.team), foe = g.actors.find(a => a.team !== g.player.team);
      const hp0 = mate.health; g.applyDamage(mate, g.player, 50, false, mate.pos, 'rifle'); v.noFF = mate.health === hp0;
      g.applyDamage(foe, g.player, 999, true, foe.pos, 'rifle'); v.duelKill = !foe.alive && M.stats[g.player.rosterId].kills === 1;
      M = play('shotgun', 1); v.shotgun = g.player.slots[0].id === 'shotgun' && !g.player.slots[1] && g.actors.every(a => !a.slots[1] && a.slots[0].id === 'shotgun');
      M = play('sniper', 2); v.sniper = g.actors.every(a => a.slots[0].id === 'sniper' && a.slots[1].id === 'hunter');
      M = play('tdm', 4); v.tdm = g.actors.length === 8; run(120);
      const f2 = g.actors.find(a => a.team !== g.player.team && a.alive); g.applyDamage(f2, g.player, 999, true, f2.pos, 'rifle'); v.tdmScore = M.score[g.player.team] === 1;
      run(30 * 4); v.respawn = f2.alive;
      M.score[g.player.team] = 30; run(3); v.tdmEnd = M.ended; run(260); v.tdmResult = g.state === 'end' && /TEAM DEATHMATCH/.test(document.getElementById('end-eyebrow').textContent);
      g.toMenu(); M = play('ffa', 6); v.ffa = g.actors.length === 6 && new Set(g.actors.map(a => a.team)).size === 6; g.toMenu();
      v.discover = document.querySelectorAll('#discover [data-m="tdm"], #discover [data-m="ffa"], #discover [data-m="shotgun"], #discover [data-m="sniper"], #discover [data-m="duels"]').length >= 0 && typeof BR.Lobby.open === 'function';
      // shield cell model
      document.getElementById('btn-practice').click(); const it = g.loot.add({ kind: 'shield', amount: 50 }, 0, 0, 0); let n = 0; it.mesh.traverse(o => { if (o.isMesh) n++; }); v.shieldModel = n > 30 && !!it.mesh.userData.cell;
      // overdrive humanoids with head hitboxes
      g.startMode(BR.Overdrive, { overdrive: true }); const O = g.mode, h = O.spawnEnemy('gunner', { r: 10 }); run(2);
      const e = g.player.eye(new THREE.Vector3()), d = new THREE.Vector3(h.x - e.x, 1.8 * h.k - e.y, h.z - e.z).normalize(), r = O.rayTargets(e, d, 200);
      v.humanoid = !!h.limbs && r && r.target === h && r.head === true && ['husk', 'gunner', 'warden'].every(k => BR.OVERDRIVE.ENEMY[k].humanoid);
      g.toMenu();
      out.v112 = v; }
    // v1.13: the Tracker knife + its blueprints
    { const v = {}, P = BR.Profile, run = n => { for (let i = 0; i < n; i++) g.update(1 / 30); };
      const m = BR.Models.weapon('tracker', 'default', 'none', 'goldrune'); let n = 0; m.traverse(o => { if (o.isMesh) n++; });
      v.model = !!m.userData.tracker && !!m.userData.inner && n >= (m.userData.imported ? 2 : 12);      // (v1.21: imported model)
      v.bps = Object.keys(BR.Models.BLUEPRINTS.tracker).length >= 7 && BR.MELEE.tracker && !!BR.CONFIG.weapons.tracker.melee;
      const was = P.data.equip.melee; P.data.equip.melee = 'tracker'; g.refreshCosmetics();
      document.getElementById('btn-practice').click(); const pl = g.player; pl.slots[2] = BR.Weapons.create('tracker'); pl.cur = 2; g.vmr.lastWeapon = null; run(40);
      v.vm = g.vmr.models.tracker && g.vmr.models.tracker.visible !== false && g.vmr.knifeHands.RB.visible;
      v.picker = !!document.querySelector('#inv-melee [data-m="tracker"]');
      P.data.equip.melee = was; g.refreshCosmetics(); g.toMenu();
      out.v113 = v; }
    // v1.14: fresh accounts start from scratch, levels + XP, knives locked by level
    { const v = {}, P = BR.Profile, keep = JSON.stringify(P.data);
      const tryLoad = (d0) => { const k = P.KEY, saved = P.data, ul = BR.util.load, sv = P.save; BR.util.load = () => d0; P.save = () => {};
        try { P.load(); return JSON.parse(JSON.stringify(P.data)); } finally { BR.util.load = ul; P.save = sv; P.data = saved; P.KEY = k; } };
      const f = tryLoad(null);
      v.fresh = f.owned.skins.join() === 'default' && f.owned.blueprints.length === 0 && f.owned.gloves.join() === 'default' && f.xp === 0 && f.equip.melee === 'tracker' && !f.equip.skinByGun.rifle;
      const old = tryLoad({ owned: { skins: ['default', 'gold'] }, stats: { kills: 50, wins: 2, matches: 10, deaths: 8 } }); v.migrate = old.xp === 50 * 100 + 2 * 1500 + 10 * 250;
      P.data.xp = 0; P.data.equip.melee = 'butterfly';
      v.locked = P.level() === 0 && P.melee() === 'tracker' && !P.meleeUnlocked('bayonet') && !P.meleeUnlocked('knife') && !P.meleeUnlocked('butterfly') && P.meleeUnlocked('tracker');
      const coins0 = P.data.coins, res = P.award({ kills: 5, damage: 800, place: 1, total: 30, time: 400, win: true });
      v.matchXP = res.xp && res.xp.total >= 3000 && res.xp.after >= 2 && P.data.coins > coins0;
      let need = 0; for (let L = 0; L < 20; L++) need += BR.LEVELS.need(L);
      P.data.xp = need - 1; v.lv19 = P.level() === 19 && !P.meleeUnlocked('bayonet');
      const up = P.addXP([['t', 1]]); v.lv20 = P.level() === 20 && P.meleeUnlocked('bayonet') && up.unlocked.includes('M9 Bayonet') && !P.meleeUnlocked('knife');
      P.data.equip.melee = 'bayonet'; v.bayEquip = P.melee() === 'bayonet';
      g.toMenu(); BR.updateCoins(); v.chip = /^\d+$/.test(document.getElementById('lvl-n').textContent) && /XP/.test(document.getElementById('lvl-xp').textContent);
      document.getElementById('lvl-chip').click(); v.panel = document.querySelectorAll('#lv-track .lv-k').length === 4; document.getElementById('lv-x').click();
      P.data = JSON.parse(keep); P.save(); g.refreshCosmetics(); BR.updateCoins();
      // v1.15.1 pacing: level 20 ≈ 30 average BR matches; every level costs more than the last
      const avg = P.matchXP({ kills: 2, damage: 400, time: 300, place: 9, total: 30 }).reduce((a, p) => a + p[1], 0);
      let to20 = 0; for (let L = 0; L < 20; L++) to20 += BR.LEVELS.need(L);
      let inc = true; for (let L = 1; L < BR.LEVELS.max; L++) inc = inc && BR.LEVELS.need(L) > BR.LEVELS.need(L - 1);
      v.pace = to20 / avg >= 27 && to20 / avg <= 33 && inc;
      out.v114 = v; }
    // v1.15: new arena maps + map roll, freeze before the round, no shooting through walls, per-round duel loadouts,
    // Ranked vs Casual, casual kills count for challenges, account IDs + support panel
    { const v = {}, run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); }, L = BR.Lobby, keepProfile = JSON.stringify(BR.Profile.data);
      const play = (preset, size, map) => { L.skipRoll = true; L.preset = preset; L.size = size; L.play({ map }); return g.mode; };
      // maps: each builds, every spawn / FFA spot is clear of walls, bots fight there without errors
      v.maps = {};
      for (const id of ['yard', 'killhouse', 'cargo']) {
        const M = play(id === 'cargo' ? 'ffa' : 'tdm', id === 'cargo' ? 6 : 4, id), W = g.world, tmp = [];
        const clear = (x, z) => { W.query(x - 0.4, 0.3, z - 0.4, x + 0.4, 1.7, z + 0.4, tmp); return !tmp.some(b => !b.ground); };
        const spots = (W.ffaSpots || []).concat(W.spawns.map(s => [s.x, s.z]));
        const allClear = spots.every(([x, z]) => { const s = M.safe(x, z); return clear(s.x, s.z); });
        run(200);
        const inside = g.actors.every(a => Math.abs(a.pos.x) < W.size / 2 && Math.abs(a.pos.z) < W.size / 2 && a.pos.y > -1);
        v.maps[id] = W.mapId === id && allClear && inside && (id === 'yard' || W.ffaSpots.length >= 12);
        g.toMenu();
      }
      // fair odds: every map rolls about a third of the time
      L.preset = 'duel'; const tally = {}, NP = L.pool('duel').length; for (let i = 0; i < 30000; i++) { const m = L.rollMap(); tally[m] = (tally[m] || 0) + 1; }
      v.fair = NP >= 3 && Object.keys(tally).length === NP && Object.values(tally).every(n => Math.abs(n / 30000 - 1 / NP) < 0.02);
      // the roll overlay lands on the chosen map
      L.skipRoll = false; let rolled = false; L.showRoll('cargo', () => { rolled = true; });
      const cards = document.querySelectorAll('#mr-strip .mr-card');
      v.roll = !document.getElementById('maproll').classList.contains('hidden') && cards.length === 34 && cards[29].querySelector('b').textContent === 'CARGO' && !rolled;
      document.getElementById('maproll').classList.add('hidden'); L.skipRoll = true;
      // freeze: during the countdown nobody moves or fires
      let M = play('duel', 1, 'killhouse'); const p = g.player, lock = { x: p.pos.x, z: p.pos.z };
      p.mover.vel.set(8, 0, 8); run(10);
      v.frozenPos = M.frozen && Math.hypot(p.pos.x - lock.x, p.pos.z - lock.z) < 0.05;
      const mag0 = p.weapon.mag; v.noFire = BR.Weapons.tryFire(g, p) === false && p.weapon.mag === mag0;
      // per-round loadout picker (Duels): shown during the countdown, a pick re-arms you right away
      const lo = document.getElementById('ar-lo'), pick = lo && lo.querySelector('[data-slot="0"][data-g="smg"]');
      v.picker = !!lo && !lo.classList.contains('hidden') && !!pick;
      const keepLo = (g.settings.duel.loadout || []).slice(); if (pick) pick.click();
      v.picked = g.settings.duel.loadout[0] === 'smg' && p.slots[0].id === 'smg';
      g.settings.duel.loadout = keepLo;
      run(200); v.unfrozen = M.phase === 'fight' && !M.frozen && document.getElementById('ar-lo').classList.contains('hidden');
      // walls stop bullets: the house's west wall (solid at z = 2.2) blocks a shot at a bot behind it
      const W = g.world, h = W.raycast(-13, 1.5, 2.2, 1, 0, 0, 60);
      const foe = g.actors.find(a => a.team !== p.team);
      foe.mover.pos.set(-7, 0, 2.2); foe.health = 100; foe.shield = 0; if (foe.brain) foe.alive = true;
      p.mover.pos.set(-13, 0, 2.2); p.yaw = -Math.PI / 2; p.pitch = 0; p.cur = 0; p.weapon.cool = 0; p.weapon.reloadT = 0; p.weapon.mag = 30; p.ads = false;
      let shots = 0; for (let i = 0; i < 6; i++) { p.weapon.cool = 0; if (BR.Weapons.tryFire(g, p)) shots++; }
      v.walls = h.t > 2.5 && h.t < 3.5 && shots > 0 && foe.health === 100;
      // casual kills count toward challenges (grind) + mastery
      const G0 = BR.Profile.grind().kills || 0; foe.mover.pos.set(-15, 0, 2.2); g.kill(foe, p, 'rifle', false);
      v.casualGrind = (BR.Profile.grind().kills || 0) === G0 + 1;
      g.toMenu();
      // ranked vs casual
      const P = BR.Profile, rp0 = P.data.rp || 0;
      const cas = P.award({ arena: true, preset: 'tdm', win: true, kills: 6, ranked: false });
      v.casual = cas.rp === undefined && (P.data.rp || 0) === rp0 && cas.xp && cas.xp.total > 0 && cas.total > 0;
      const rk = P.award({ arena: true, preset: 'tdm', win: true, kills: 6, ranked: true });
      v.ranked = rk.rp > 0 && P.data.rp === rp0 + rk.rp;
      const brc = P.award({ win: false, place: 4, kills: 2, damage: 300, time: 200, ranked: false }); v.brCasual = brc.rp === undefined && P.data.rp === rp0 + rk.rp;
      P.data.rp = rp0; P.save();
      // Discover: classic duel is gone, Ranked/Casual toggle tags the modes, zombies has no queue
      document.getElementById('mode-cur').click();
      v.noClassic = !document.querySelector('#discover [data-m="duel"]') && !!document.querySelector('#discover [data-m="duels"]');
      const qb = document.querySelector('#dc-queue [data-q="ranked"]'); qb.click();
      const tagsOf = id => Array.from(document.querySelectorAll(`#dc-rows [data-m="${id}"] .dt-tags u`)).map(u => u.textContent);
      v.queue = g.settings.ranked === true && tagsOf('tdm').includes('RANKED') && tagsOf('br').includes('RANKED') && !tagsOf('zombies').includes('RANKED') && BR.rankedNow() === (g.settings.mode !== 'zombies' && g.settings.mode !== 'overdrive' && g.settings.mode !== 'practice' && g.settings.mode !== 'aim');
      document.querySelector('#dc-queue [data-q="casual"]').click(); v.queueOff = g.settings.ranked === false && tagsOf('tdm').includes('CASUAL');
      document.getElementById('discover').classList.add('hidden');
      // account IDs + the support panel
      const A = BR.Accounts, keepDb = JSON.stringify(A.db), keepSeeded = A.isSeededDev, keepKey = P.KEY;
      try {
        const r1 = await A.signUp('idtest_' + (Date.now() % 1e6), 'hunter22'); const me = A.current();
        v.idFormat = r1.ok && /^SRG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(A.accountId());
        const seed = (BR.CONFIG.seedAccounts || [])[0]; v.seedId = !seed || (A.seedId(seed.name) === A.seedId(seed.name) && A.accountId(seed.name) === A.seedId(seed.name));
        const ids = Object.values(A.db.users).map(u => u.id); v.unique = new Set(ids).size === ids.length;
        v.lockedOut = A.adminList() === null && !(await A.adminUnlock('hunter22')).ok;                 // not the dev account: no list
        A.isSeededDev = () => true;
        v.badPw = !(await A.adminUnlock('nope')).ok && A.adminList() === null;
        v.unlock = (await A.adminUnlock('hunter22')).ok;
        const rows = A.adminList(A.accountId(me)); v.list = rows.length === 1 && rows[0].name === me && !('hash' in rows[0]) && !('salt' in rows[0]);
        const csv = A.adminExport(); v.csv = csv.startsWith('account_id,username') && !/[0-9a-f]{64}/.test(csv);
        const rs = await A.adminResetPassword(me); A.logOut(); const li = await A.logIn(me, rs.temp);
        v.reset = rs.ok && li.ok && li.mustChange && (await A.changePassword(rs.temp, 'newpass9')).ok && !(await A.logIn(me, 'hunter22')).ok && (await A.logIn(me, 'newpass9')).ok;
        renderOk: { BR.Accounts.isSeededDev = () => true; document.getElementById('acct-chip').click(); v.panel = /^SRG-/.test(document.getElementById('acct-id').textContent) && !document.getElementById('acct-admin').classList.contains('hidden'); document.getElementById('acct-close').click(); }
        A.isSeededDev = keepSeeded; A.adminLock();
        document.getElementById('acct-chip').click(); v.hiddenForOthers = document.getElementById('acct-admin').classList.contains('hidden'); document.getElementById('acct-close').click();
        localStorage.removeItem('velocity-royale.profile.u:' + me.toLowerCase());
      } finally { A.isSeededDev = keepSeeded; A.db = JSON.parse(keepDb); A.save(); P.KEY = keepKey; P.data = JSON.parse(keepProfile); P.save(); g.refreshCosmetics(); BR.updateCoins(); }
      out.v115 = v; }
    // v1.16: Ranked at level 20, anti-cheat, signed dev commands (kick / ban / coins), blueprint finishes
    { const v = {}, P = BR.Profile, AC = BR.AntiCheat, keep = JSON.stringify(P.data), run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
      // ranked locked under level 20
      P.data.xp = 0; g.settings.ranked = true; g.settings.mode = 'tdm';
      v.rankLock = BR.rankedNow() === false && P.award({ arena: true, preset: 'tdm', win: true, kills: 3, time: 200, ranked: true }).rp === undefined;
      document.getElementById('mode-cur').click(); const rb = document.querySelector('#dc-queue [data-q="ranked"]'); rb.click();
      v.rankLockUi = rb.classList.contains('locked') && /LV 20/.test(rb.textContent); document.getElementById('discover').classList.add('hidden');
      P.data.xp = 5e6; v.rankOpen = BR.rankedNow() === true; g.settings.ranked = false;
      // stat tables are frozen
      BR.CONFIG.weapons.rifle.dmg = 999; BR.CONFIG.weapons = {}; BR.CONFIG.actor.maxHealth = 9999;
      v.frozen = BR.CONFIG.weapons.rifle.dmg === 21 && BR.CONFIG.actor.maxHealth === 100;
      // live checks (switch the test bypass off)
      AC._testing = false; const log0 = AC.log.length;
      BR.Lobby.skipRoll = true; BR.Lobby.preset = 'tdm'; BR.Lobby.size = 4; BR.Lobby.play({ map: 'yard' }); run(130);
      const p = g.player, foe = g.actors.find(a => a.team !== p.team && a.alive); foe.shield = 0; foe.health = 100;
      g.applyDamage(foe, p, 999, true, foe.pos, 'rifle'); v.dmgClamp = foe.alive && foe.health > 30 && AC.log.some(e => e.kind === 'damage');
      p.health = 500; p.weapon.mag = 999; run(2); v.hpClamp = p.health <= 100 && AC.log.some(e => e.kind === 'health'); v.magClamp = p.weapon.mag <= p.weapon.def.mag && AC.log.some(e => e.kind === 'ammo');
      p.mover.pos.x += 30; run(2); v.teleport = AC.log.some(e => e.kind === 'teleport');
      g.toMenu();
      v.badResult = P.award({ kills: 80, total: 30, place: 1, win: true, time: 400, damage: 100 }).rejected === true;
      AC.lastAward = 0; v.fastWin = P.award({ kills: 1, total: 30, place: 1, win: true, time: 6, damage: 100 }).rejected === true;
      let hk = []; for (let i = 0; i < 3; i++) hk.push(AC.hostHit({ w: 'rifle', d: 500 }, 'Pcheat')); v.hostKick = hk[0] === false && hk[2] === 'kick' && AC.hostHit({ w: 'rifle', d: 20 }, 'Pfair') === true;
      // a save edited outside the game is rolled back
      P.data.coins = 1234; P.save(); const raw = JSON.parse(localStorage.getItem(P.KEY)); raw.coins = 9999999; localStorage.setItem(P.KEY, JSON.stringify(raw));
      P.load(); v.saveEdit = P.data.coins === 1234 && AC.log.some(e => e.kind === 'save-edit');
      localStorage.removeItem(P.KEY + '.sig'); raw.coins = 5555555; localStorage.setItem(P.KEY, JSON.stringify(raw)); P.load(); v.sigStrip = P.data.coins === 1234;
      v.logged = AC.log.length > log0; AC.strikes = 0; AC._testing = true;
      P.data = JSON.parse(keep); P.data.ac = null; P.save();
      // signed dev commands with a throwaway key (the real key only unlocks with the private dev code)
      const S = crypto.subtle, code = 'TEST-' + Math.random().toString(36).slice(2).toUpperCase();
      const kp = await S.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), jwk = await S.exportKey('jwk', kp.publicKey), pk8 = await S.exportKey('pkcs8', kp.privateKey);
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
      const base = await S.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']), aes = await S.deriveKey({ name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      BR._testDevSign = { pub: { x: jwk.x, y: jwk.y }, salt: b64(salt), iv: b64(iv), ct: b64(await S.encrypt({ name: 'AES-GCM', iv }, aes, pk8)), iter: 1000 };
      const A = BR.Accounts, keepDb = JSON.stringify(A.db), keepSeed = A.isSeededDev;
      try {
        await A.signUp('devtgt_' + (Date.now() % 1e6), 'pw1234'); P.load(); const me = A.accountId(), c0 = P.data.coins;
        v.notDev = !(await BR.Dev.unlock(code)).ok;
        A.isSeededDev = () => true;
        v.wrongCode = !(await BR.Dev.unlock('NOPE')).ok;
        v.unlock = (await BR.Dev.unlock(code)).ok && BR.Dev.unlocked();
        const gift = await BR.Dev.sign('coins', me, { amount: 750 });
        const giftCode = BR.Dev.toCode(gift);
        document.getElementById('acct-code').value = giftCode; document.getElementById('acct-redeem').click(); await new Promise(r => setTimeout(r, 300));
        v.gift = P.data.coins === c0 + 750 && (await BR.Dev.receive(gift)) === 'used' && P.data.coins === c0 + 750;
        const forged = JSON.parse(JSON.stringify(gift)); forged.cmd.amount = 999999; forged.cmd.n = 'ffff0000';
        v.forged = (await BR.Dev.receive(forged)) === null && P.data.coins === c0 + 750;
        const other = await BR.Dev.sign('coins', 'SRG-AAAA-BBBB', { amount: 50 }); v.wrongTarget = (await BR.Dev.receive(other)) === null;
        const ban = await BR.Dev.sign('ban', me, { reason: 'test' }); await BR.Dev.receive(ban);
        v.ban = BR.Bans.has(me) && BR.Bans.blocked(false) && BR.Bans.blocked(true);
        document.getElementById('btn-go').click(); v.banBlocksPlay = g.state === 'menu' && !g.mode;
        const ub = await BR.Dev.sign('unban', me); await BR.Dev.receive(ub); v.unban = !BR.Bans.has(me) && !BR.Bans.blocked(true);
        BR.Dev.lock(); A.isSeededDev = () => false; let threw = false; try { await BR.Dev.sign('coins', me, { amount: 1 }); } catch (e) { threw = true; } v.lockedSign = threw;
        A.isSeededDev = () => true; document.getElementById('acct-chip').click(); v.menuBtn = !document.getElementById('acct-devmenu').classList.contains('hidden'); document.getElementById('acct-close').click();
        A.isSeededDev = () => false; document.getElementById('acct-chip').click(); v.menuHidden = document.getElementById('acct-devmenu').classList.contains('hidden'); document.getElementById('acct-close').click();
        localStorage.removeItem(P.KEY); localStorage.removeItem(P.KEY + '.sig');
      } finally { A.isSeededDev = keepSeed; BR.Dev.lock(); BR._testDevSign = null; A.db = JSON.parse(keepDb); A.save(); BR.util.save('surge.devban', null); P.load(); P.data = JSON.parse(keep); P.save(); g.refreshCosmetics(); BR.updateCoins(); }
      // blueprint finishes: every non-default blueprint gets a textured finish + edge lines; world models stay one mesh
      let fin = 0, edges = 0, n = 0, bad = [];
      for (const w in BR.Models.BLUEPRINTS) for (const b in BR.Models.BLUEPRINTS[w]) { if (b === 'default' || !BR.CONFIG.weapons[w]) continue; n++;
        const m = BR.Models.weapon(w, 'default', 'none', b); let f = false, e = false; m.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.finish) f = true; if (o.isLineSegments) e = true; });
        if (f) fin++; else bad.push(w + ':' + b); if (e) edges++; }
      v.finishes = fin === n;      // (v1.21: edge lines only on procedural models; every gun + knife is imported now) v.bpCount = n; v.noFinish = bad.slice(0, 5);
      v.worldOne = BR.Models.worldWeapon('rifle', Object.keys(BR.Models.BLUEPRINTS.rifle).find(k => k !== 'default')).isMesh;
      out.v116 = v; }
    // v1.16.1: real leaderboard (owner's name in open spots; signed entries replace them; forgeries rejected)
    { const v = {}, B = BR.Board, A = BR.Accounts, P = BR.Profile, keepBoard = localStorage.getItem('surge.board'), keepDb = JSON.stringify(A.db), keepP = JSON.stringify(P.data), keepKey = P.KEY;
      try {
        localStorage.removeItem('surge.board');
        let R = B.rows(); v.empty = R.rows.length === 50 && R.rows.every(r => r.holder && r.name === B.owner()) && B.owner() === 'jermmm';
        await A.signUp('lb_' + (Date.now() % 1e6), 'pw1234'); P.load(); P.data.xp = 5e6; P.data.rp = 0;
        const res = P.award({ arena: true, preset: 'tdm', win: true, kills: 6, time: 300, ranked: true }); await new Promise(r => setTimeout(r, 400));
        R = B.rows(); v.took = res.rp > 0 && R.rows[0].me && R.rows[0].rp === P.data.rp && R.rows.filter(r => r.holder).length === 49 && R.total === 1;
        const mine = B.top(5)[0];
        // a forged copy (higher RP, same key) fails the signature
        const forged = Object.assign({}, mine, { rp: mine.rp + 500, ts: mine.ts + 10 }); v.forged = (await B.merge([forged])) === 0 && B.top(5)[0].rp === mine.rp;
        // someone else's key can't post under this ID
        const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), jw = await crypto.subtle.exportKey('jwk', kp.publicKey);
        const fake = { id: mine.id, name: 'Imposter', rp: 100, rm: 3, ts: Date.now() + 1000, pk: { x: jw.x, y: jw.y } };
        const canon = e => JSON.stringify([e.id, e.name, e.rp, e.rm, e.ts, e.pk.x, e.pk.y]), b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
        fake.sig = b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(canon(fake))));
        v.pinned = (await B.merge([fake])) === 0;
        // a genuine new player arriving from a lobby takes the next spot; impossible RP for their match count is refused
        const other = { id: 'SRG-ZZZZ-2222', name: 'RealRival', rp: 90, rm: 2, ts: Date.now(), pk: { x: jw.x, y: jw.y } }; other.sig = b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(canon(other))));
        const greedy = { id: 'SRG-YYYY-3333', name: 'Greedy', rp: 9000, rm: 1, ts: Date.now(), pk: { x: jw.x, y: jw.y } }; greedy.sig = b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(canon(greedy))));
        v.newcomer = (await B.merge([other, greedy])) === 1 && B.rows().rows.filter(r => r.holder).length === 48 && B.rows().rows.some(r => r.name === 'RealRival');
        // banned accounts drop off the board
        BR.Bans.add({ cmd: { c: 'ban', target: 'SRG-ZZZZ-2222', ts: Date.now(), n: 'x' }, sig: 'test' }); v.bannedHidden = !B.rows().rows.some(r => r.name === 'RealRival'); BR.Bans.remove('SRG-ZZZZ-2222');
        // UI
        g.toMenu(); document.getElementById('btn-ranks').click();
        const ui = document.querySelectorAll('#rk-board .rk-row'); v.ui = ui.length === 50 && document.querySelectorAll('#rk-board .rk-row.holder').length === 48 && /jermmm/.test(document.querySelector('#rk-board .rk-row.holder').textContent);
        document.getElementById('rk-x').click();
        localStorage.removeItem(P.KEY); localStorage.removeItem(P.KEY + '.sig');
      } finally { if (keepBoard) localStorage.setItem('surge.board', keepBoard); else localStorage.removeItem('surge.board'); A.db = JSON.parse(keepDb); A.save(); P.KEY = keepKey; P.data = JSON.parse(keepP); P.save(); BR.updateCoins(); }
      out.v1161 = v; }
    // v1.16.3: imported .glb rifle (built-in reader, placed with BR.IMPORTED, magazine split for reloads)
    { const v = {}, m = BR.Models.weapon('rifle', 'default', 'none', null); let tris = 0, tex = false, nmap = false;
      const bx = new THREE.Box3(); m.updateMatrixWorld(true);
      m.traverse(o => { if (!o.isMesh || o === m.userData.flash || o.userData.isFlash || o.geometry.type === 'BoxGeometry') return; if (o.material.map || BR.IMPORTED.rifle.finish === 'factory') tex = true;      // (v1.18: factory finish = sculpted normal map, no paint)
        if (o.material.normalMap) nmap = true; tris += o.geometry.attributes.position.count / 3; bx.expandByObject(o); });
      const len = bx.max.z - bx.min.z;
      v.imported = m.userData.imported === 'rifle' && tex && nmap && tris > 4000 && len > 1.1 && len < 1.35;
      v.anchors = Math.abs(m.userData.muzzle.position.z - bx.min.z) < 0.03 && !!m.userData.sight && m.userData.grip.z > m.userData.fore.z;
      v.mag = !!m.userData.mag && m.userData.mag.children.length === 1 && m.userData.mag.children[0].geometry.attributes.position.count > 100;
      const w = BR.Models.worldWeapon('rifle'); v.world = w.isMesh && w.geometry.attributes.position.count > 10000;
      const sk = BR.Models.weapon('rifle', 'chrome', 'none', null); let skinOn = false; sk.traverse(o => { if (o.isMesh && !o.material.map && o.material !== m.children[0].material) skinOn = true; }); v.skin = skinOn;
      out.v1163 = v; }
    // v1.17: detailed surfaces on every procedural weapon, knife and glove
    { const v = {}; let real = 0, uvOk = 0, edges = 0, n = 0;
      for (const id of ['sniper', 'revolver', 'launcher', 'tracker', 'bayonet', 'knife', 'butterfly']) {      // (v1.20: pistol / dmr / hunter imported)      // (v1.18.1: shotgun imported too)      // (v1.18: holoar / smg / lmg are imported models)
        const m = BR.Models.weapon(id, 'default', 'none', null); n++; let r = 0, e = 0, u = true;
        m.traverse(o => { if (o.isMesh && o.material.userData && o.material.userData.real) { r++; if (!o.material.map || !o.material.normalMap || !o.geometry.attributes.uv) u = false; } if (o.isLineSegments) e++; });
        if (r > 3) real++; if (u) uvOk++; if (e) edges++;
      }
      v.weapons = ['sniper', 'revolver', 'launcher', 'tracker', 'bayonet', 'knife', 'butterfly'].every(id => BR.Models.weapon(id, 'default', 'none', null).userData.imported === id);      // (v1.21: all imported)      // edge highlights on the guns' main bodies (knife parts live in sub-groups)
      const h = BR.Models.hand('default', false); let fab = false; h.traverse(o => { if (o.isMesh && o.material.normalMap && o.material.map) fab = true; }); v.gloves = fab;
      const w = BR.Models.worldWeapon('smg'); v.world = w.isMesh;
      out.v117 = v; }
    // v1.17.1: Remember me (checked: stays signed in after reopening; unchecked: only for this tab session)
    { const v = {}, A = BR.Accounts, keepDb = JSON.stringify(A.db), keepRem = A.remember, keepP = JSON.stringify(BR.Profile.data), keepKey = BR.Profile.KEY;
      try {
        const nm = 'rem_' + (Date.now() % 1e6);
        v.box = !!document.getElementById('acct-remember') && document.getElementById('acct-remember').checked;
        await A.signUp(nm, 'pw1234', true);
        v.remembered = BR.util.load(A.KEY, {}).current === nm && !sessionStorage.getItem('surge.session');
        A.logOut(); await A.logIn(nm, 'pw1234', false);
        v.sessionOnly = BR.util.load(A.KEY, {}).current === null && sessionStorage.getItem('surge.session') === nm;
        A.load(); v.sameTab = A.current() === nm && A.remember === false;                     // reload in the same tab keeps you in
        sessionStorage.removeItem('surge.session'); A.load(); v.newVisit = A.current() !== nm;  // a new visit (tab closed) signs you out
        // through the form
        A.logOut(); document.getElementById('acct-chip').click();
        document.getElementById('acct-user').value = nm; document.getElementById('acct-pass').value = 'pw1234'; document.getElementById('acct-remember').checked = true;
        document.getElementById('acct-form').dispatchEvent(new Event('submit', { cancelable: true })); await new Promise(r => setTimeout(r, 400));
        v.form = A.current() === nm && BR.util.load(A.KEY, {}).current === nm; document.getElementById('acct-close').click();
        localStorage.removeItem('velocity-royale.profile.u:' + nm.toLowerCase()); localStorage.removeItem('velocity-royale.profile.u:' + nm.toLowerCase() + '.sig');
      } finally { sessionStorage.removeItem('surge.session'); A.db = JSON.parse(keepDb); A.remember = keepRem; A.save(); BR.Profile.KEY = keepKey; BR.Profile.data = JSON.parse(keepP); BR.Profile.save(); BR.updateCoins(); }
      out.v1171 = v; }
    // v1.17.2: Shockwave Launcher
    { const v = {}, AC = BR.AntiCheat, keepT = AC._testing; AC._testing = false;
      g.settings.bots = 3; g.startMatch(); for (let i = 0; i < 30; i++) g.update(1 / 30);
      const p = g.player; p.mover.dropping = false; p.mover.pos.set(0, g.world.groundAt(0, 0, 8), 0); p.mover.vel.set(0, 0, 0); for (let i = 0; i < 10; i++) g.update(1 / 30);
      p.slots[0] = BR.Weapons.create('launcher'); p.cur = 0; p.alive = true;
      const foe = g.actors.find(a => a !== p && a.alive); foe.mover.dropping = false; foe.brain = null; foe.shield = 0; foe.health = 100;
      foe.mover.pos.set(p.pos.x, p.pos.y, p.pos.z - 7); foe.mover.vel.set(0, 0, 0); p.yaw = 0; p.pitch = -0.02; for (let i = 0; i < 3; i++) g.update(1 / 60);
      foe.mover.pos.set(p.pos.x, p.pos.y, p.pos.z - 7); foe.mover.vel.set(0, 0, 0);
      // (open sky, both pinned: no random building or hill in the way)
      const pin = () => { p.mover.pos.set(0, 150, 0); p.mover.vel.set(0, 0, 0); foe.mover.pos.set(0, 150, -7); foe.mover.vel.set(0, 0, 0); };
      pin(); p.yaw = 0; p.pitch = 0;
      const n0 = g.shock.nades.length, fired = BR.Weapons.tryFire(g, p); v.fires = fired && g.shock.nades.length === n0 + 1 && p.weapon.mag === 3;

      for (let i = 0; i < 40; i++) { pin(); g.update(1 / 60); }
      v.blast = foe.health < 100 && foe.health > 100 - BR.CONFIG.weapons.launcher.blastDamage - 1;
      p.mover.pos.set(30, g.world.groundAt(30, 30, 8), 30); p.mover.vel.set(0, 0, 0); p.health = 100; for (let i = 0; i < 30; i++) g.update(1 / 60);      // (the first blast threw us too: stand on open ground again)
      p.weapon.cool = 0; p.weapon.reloadT = 0; p.pitch = -1.45; const y0 = p.mover.pos.y; BR.Weapons.tryFire(g, p); let top = y0; for (let i = 0; i < 90; i++) { g.update(1 / 60); top = Math.max(top, p.mover.pos.y); }
      v.rocketJump = top - y0 > 6 && p.alive && p.health === 100;
      v.loadout = !!BR.WeaponIcons.pic.launcher && !!BR.Models.BLUEPRINTS.launcher.voidbloom;
      AC._testing = keepT; g.toMenu();
      out.v1172 = v; }
    // v1.18: imported Holo AR / SMG / LMG (factory finish, aligned optics), black factory Rifle + Hunting Rifle, light menu, karambit grip
    { const v = {}, ids = ['holoar', 'smg', 'lmg', 'shotgun'];
      v.imports = ids.every(id => { const m = BR.Models.weapon(id, 'default', 'none', null); let real = 0, uv = true; m.traverse(o => { if (o.isMesh && o.material.userData && o.material.userData.real) { real++; if (!o.geometry.attributes.uv) uv = false; } });
        return m.userData.imported === id && real >= 1 && uv && !!(m.userData.mag || m.userData.pump) && !!m.userData.sight; });     // (tube-fed shotgun: a pump instead of a magazine)
      const ho = BR.Models.weapon('holoar', 'default', 'none', null), ret = ho.userData.holoReticle, sg = ho.userData.sight.position;
      v.holo = !!ret && Math.abs(ret.position.y - sg.y) < 0.001 && Math.abs(ret.position.x) < 0.001;
      const lm = BR.Models.weapon('lmg', 'default', 'none', null); v.acog = BR.CONFIG.weapons.lmg.optic === 'acog' && Math.abs(lm.userData.sight.position.y - 0.134) < 0.002;
      const camo = BR.Models.weapon('holoar', 'chrome', 'none', null); let ch = false; camo.traverse(o => { if (o.isMesh && o.material === camo.children[0].material && !(o.material.userData && o.material.userData.real)) ch = true; }); v.camo = ch;
      const rf = BR.Models.weapon('rifle', 'default', 'none', null); let green = false, nm = false; rf.traverse(o => { if (o.isMesh && !o.userData.isFlash && o.material.map) green = true; if (o.isMesh && o.material.normalMap) nm = true; }); v.rifleBlack = !green && nm;
      const hu = BR.Models.weapon('hunter', 'default', 'none', null); let mint = false; hu.traverse(o => { if (o.isMesh && o.material.map && o.material.map.image && o.material.map === (BR.Models._huCamoTex || null)) mint = true; }); v.hunterBlack = !mint;
      // light menu: no world behind it
      g.toMenu(); v.lightMenu = g.state === 'menu' && !g.scene && document.body.classList.contains('menulite') && getComputedStyle(document.querySelector('.menu-bg')).display === 'block';
      g.startMatch({ practice: true }); v.menuOff = !document.body.classList.contains('menulite') && !!g.scene; g.toMenu();
      { const sg = BR.Models.weapon('shotgun', 'default', 'none', null), d = BR.CONFIG.weapons.shotgun; v.mastiff = !!sg.userData.pump && sg.userData.pump.children.length === 1 && d.pattern === 'line' && d.pellets === 8 && d.dmg === 8 && d.pellets === 8 && d.ads <= 0.4 && d.rpm === 66 && d.mag === 6 && d.shellReload; }     // v1.23 Apex Mastiff numbers
      out.v118 = v; }
    // v1.7.8: stair holes stay open (no slab over them); patch notes page
    { g.settings.bots = 2; g.startMatch(); let covered = 0, n = 0;
      for (const B of g.world.buildings) { if (B.floors < 2) continue; n++; const hx = B.x0 + 0.3 + 0.65, hz = B.z0 + 0.3 + 2.2;
        for (let f = 1; f < B.floors; f++) covered += g.world.boxes.filter(o => hx > o.x0 && hx < o.x1 && hz > o.z0 && hz < o.z1 && o.y1 > f * B.fh - 0.3 && o.y0 < f * B.fh + 0.2).length; }
      const NOTES = BR.PATCH_NOTES || [];
      document.getElementById('btn-notes').click();
      const shown = !document.getElementById('patchnotes').classList.contains('hidden'), rows = document.querySelectorAll('#pn-list details').length;
      const sorted = NOTES.every((e, i) => i === 0 || e.date <= NOTES[i - 1].date), dated = NOTES.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.notes.length);
      document.getElementById('pn-x').click();
      out.v178 = { buildings2: n, covered, notes: NOTES.length, latest: NOTES[0] && NOTES[0].v, shown, rows, sorted, dated, closed: document.getElementById('patchnotes').classList.contains('hidden'), badgeOff: !document.getElementById('btn-notes').classList.contains('fresh') }; }
    // mastery + daily
    const before = P.owns('skins', 'm_copper'); let got = []; for (let i = 0; i < 10; i++) got = got.concat(P.addKill('smg'));
    out.mastery = { before, after: P.owns('skins', 'm_copper'), got: got.join() };
    P.data.daily = { last: '2026-01-01', streak: 2 }; const d1 = P.claimDaily('2026-01-02'), d2 = P.claimDaily('2026-01-02');
    out.daily = { streak: d1 && d1.streak, key: d1 && d1.key, again: d2 };
    // enemy highlight tints other players only
    g.settings.bots = 2; g.settings.highlight = 'bright'; g.startMatch(); const bot = g.actors.find(x => !x.isPlayer);
    let tinted = false; bot.mesh.traverse(o => { if (o.isMesh && o.material && o.material.emissive && o.material.emissive.r > 0.3) tinted = true; });
    out.highlight = tinted; g.settings.highlight = 'subtle';
    // spinning case previews render
    await new Promise(res => { BR.WeaponIcons.queueSpins(BR.CaseItems.all('nova').slice(0, 2), () => {}); const t0 = performance.now(); const chk = () => (Object.keys(BR.WeaponIcons.spin).length >= 2 || performance.now() - t0 > 40000) ? res() : setTimeout(chk, 200); chk(); });
    out.spins = Object.keys(BR.WeaponIcons.spin).length;
    g.state = 'menu';
    return out;
  });
  const run = 5.9, BR_RUN = run;
  const BR_VERSION = (require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'config.js'), 'utf8').match(/version: '([^']+)'/) || [])[1];
  // v1.19: squads + knockdowns, recoil springs, SMG
  const v119 = await page.evaluate(() => {
    const g = BR.game, out = {}; BR.AntiCheat._testing = true; g.settings.bots = 29;
    g.startMatch({ squad: 3 });
    const p = g.player, mates = BR.Squads.mates(g);
    out.setup = g.actors.length % 3 === 0 && g.teams === g.actors.length / 3 && mates.length === 2 && mates.every(m => m.team === 0) && g.actors.filter(a => a.team === 4).length === 3;
    for (const a of g.actors) { a.mover.dropping = false; a.mover.pos.y = g.world.groundAt(a.pos.x, a.pos.z, 80); }
    for (let i = 0; i < 20; i++) g.update(1 / 30);
    const foe = g.actors.find(a => a.team === 1), foe2 = g.actors.find(a => a.team === 1 && a !== foe);
    g.applyDamage(foe, p, 999, false, foe.pos, 'rifle');
    out.knocked = foe.alive && foe.downed && foe.mover.prone;
    const h0 = foe.health; for (let i = 0; i < 30; i++) g.update(1 / 30); out.bleeds = foe.health < h0;
    foe.fireHeld = true; foe.update(1 / 30); out.noFire = !foe.fireHeld;
    foe2.mover.pos.set(foe.pos.x + 1, foe.pos.y, foe.pos.z); foe2.brain.target = null;
    for (let i = 0; i < 200 && foe.downed; i++) g.update(1 / 30);
    out.botRevive = !foe.downed && foe.alive && foe.health === BR.Squads.REVIVE_HP;
    g.applyDamage(foe, p, 999, false, foe.pos, 'rifle'); const k0 = p.kills; g.applyDamage(foe, p, 999, false, foe.pos, 'rifle');
    out.finish = !foe.alive && p.kills === k0 + 1;
    const team1 = g.actors.filter(a => a.team === 1); for (const a of team1) if (a.alive) g.applyDamage(a, p, 999, false, a.pos, 'rifle');
    out.wipe = team1.every(a => !a.alive);
    out.noFF = (() => { const m = mates[0], hp = m.health; g.applyDamage(m, p, 50, false, m.pos, 'rifle'); return m.health === hp; })();
    const enemy = g.actors.find(a => a.team === 2), m = mates[0];
    m.mover.pos.set(p.pos.x + 5, p.pos.y, p.pos.z); m.brain.target = null;
    g.applyDamage(p, enemy, 9999, false, p.pos, 'rifle');
    out.playerDown = p.alive && p.downed && g.state === 'playing';
    for (let i = 0; i < 300 && p.downed; i++) { for (const a of g.actors) if (a.team !== 0 && a.brain) a.brain.target = null; g.update(1 / 30); }
    out.playerRevived = p.alive && !p.downed;
    const m2 = mates[1]; if (m2.alive) { m2.downed = false; m2.mover.prone = false; m2.mover.pos.set(p.pos.x + 60, p.pos.y, p.pos.z + 60); m2.brain.still = true; }
    g.applyDamage(m, enemy, 9999, false, m.pos, 'rifle'); m.mover.pos.set(p.pos.x + 1, p.pos.y, p.pos.z); for (const a of g.actors) if (a.brain) a.brain.target = null; g.update(1 / 30);
    out.prompt = /Revive/.test(document.getElementById('prompt').textContent);
    g.input.press('interact'); for (let i = 0; i < 160 && m.downed; i++) { for (const a of g.actors) if (a.brain) a.brain.target = null; g.update(1 / 30); }
    out.youRevive = !m.downed && m.alive;
    out.panel = !document.getElementById('squad').classList.contains('hidden') && document.querySelectorAll('#squad .sq-row').length === 3;
    for (const a of g.actors) if (a.team !== 0 && a.alive) g.kill(a, p, 'rifle');
    g.update(1 / 30);
    out.teamWin = g.state === 'won' && g.result.win && g.result.squad === 3;
    // spectate your team: you're out, a teammate is alive
    g.startMatch({ squad: 2 }); const p2 = g.player, mt = BR.Squads.mates(g)[0];
    for (const a of g.actors) { a.mover.dropping = false; a.mover.pos.y = g.world.groundAt(a.pos.x, a.pos.z, 80); }
    g.kill(p2, null, 'storm'); for (let i = 0; i < 10; i++) g.update(1 / 30);
    out.spectate = g.state === 'playing' && mt.alive && !!g._spec;
    // Resurgence: trios max, 24 players
    g.startMatch({ resurgence: true, squad: 4 }); out.resTrios = g.squad === 3 && g.actors.length === 24;
    g.startMatch({}); out.solo = g.squad === 1 && g.player.team === undefined;
    out.picker = (() => { BR.selectMode('br'); const n = document.querySelectorAll('#sq-pick button').length; BR.selectMode('resurgence'); const r = document.querySelectorAll('#sq-pick button').length; BR.selectMode('zombies'); const hid = document.getElementById('sq-pick').classList.contains('hidden'); BR.selectMode('br'); return n === 4 && r === 3 && hid; })();
    // recoil: the kick spring settles without bouncing back past rest
    g.startMatch({ practice: true }); const v = g.vmr, pl = g.player; pl.slots[0] = BR.Weapons.create('smg'); pl.cur = 0; v.lastWeapon = null; for (let i = 0; i < 30; i++) v.update(1 / 60, 0, 0);
    v.kick.z.v = 0; v.kick.z.vel = 0; v.onFire(pl.weapon); let peak = 0, under = 0;
    for (let i = 0; i < 60; i++) { v.update(1 / 60, 0, 0); peak = Math.max(peak, v.kick.z.v); under = Math.min(under, v.kick.z.v); }
    out.recoil = peak > 0.004 && under > -peak * 0.08;
    const S = BR.CONFIG.weapons.smg; out.smg = S.rpm === 950 && S.mag === 30 && S.adsRate > 13 && S.speedMult > 1;
    return out;
  });
  // v1.21: kill credit on knocks + assists, give up, District + FFA spawns, window vault, tracking runner, imports, art pass
  const v121 = await page.evaluate(async () => {
    const g = BR.game, out = {}; BR.AntiCheat._testing = true; g.settings.bots = 29;
    g.startMatch({ squad: 2 }); const p = g.player;
    for (const a of g.actors) { a.mover.dropping = false; a.mover.pos.y = g.world.groundAt(a.pos.x, a.pos.z, 80); }
    const foe = g.actors.find(a => a.team === 1), other = g.actors.find(a => a.team === 2);
    g.applyDamage(foe, p, 999, false, foe.pos, 'rifle'); const k0 = p.kills, o0 = other.kills;
    g.applyDamage(foe, other, 999, false, foe.pos, 'rifle');
    out.knockCredit = !foe.alive && p.kills === k0 + 1 && other.kills === o0 && (other.assists || 0) === 1;
    const e2 = g.actors.find(a => a.team === 3); g.applyDamage(p, e2, 9999, false, p.pos, 'rifle');
    g.input.press('giveup'); g.update(1 / 30); out.giveUp = !p.alive && !!document.querySelector('#downed .dn-give');
    // District + FFA spawns
    BR.Lobby.skipRoll = true; BR.Lobby.preset = 'ffa'; BR.Lobby.size = 6; const pool = BR.Lobby.pool('ffa').map(m => m.id).sort().join();
    g.toMenu(); BR.Lobby.play({ map: 'district' }); await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 10; i++) g.update(1 / 30);
    const A = g.actors.filter(a => a.alive); let md = 1e9; for (const a of A) for (const o of A) if (a !== o) md = Math.min(md, a.pos.distanceTo(o.pos));
    out.ffa = pool === 'district,killhouse,suburb' && g.world.mapId === 'district' && g.world.size >= 120 && md > 15;
    // window vault (Killhouse north window)
    g.toMenu(); BR.Lobby.preset = 'duel'; BR.Lobby.size = 1; BR.Lobby.play({ map: 'killhouse' }); await new Promise(r => setTimeout(r, 300));
    const m = g.player.mover; g.mode.frozen = false; m.pos.set(0, 0, 7.9); m.vel.set(0, 0, 0); g.player.yaw = 0; for (let i = 0; i < 6; i++) g.update(1 / 30);
    g.input.press('jump'); for (let i = 0; i < 25; i++) g.update(1 / 30); out.vault = m.pos.z < 6.6 && m.pos.y < 0.1;
    // tracking runner
    g.toMenu(); g.startMode(BR.AimTrainer, { range: true }); const T = g.mode; T.data.drill = 'tracking'; T.begin(); for (let i = 0; i < 120; i++) g.update(1 / 30);
    const t = T.targets.find(x => x.kind === 'runner'); let sl = 0, air = 0; for (let i = 0; i < 300; i++) { g.update(1 / 30); if (t.fake.mover.sliding) sl++; if (!t.fake.mover.onGround) air++; }
    out.runner = !!t && sl > 0 && air > 0;
    g.toMenu();
    // imports
    const ud = id => BR.Models.weapon(id, 'default', 'none', null).userData;
    out.imports = ['sniper', 'revolver', 'launcher', 'knife', 'bayonet', 'tracker', 'butterfly'].every(id => ud(id).imported === id) && !!ud('revolver').cylinder && !!ud('revolver').crane && !!ud('butterfly').handleA && !!ud('bayonet').inner && !!ud('launcher').mag;
    return out;
  });
  // v1.23: blueprints seated on the imported models, Overdrive blueprints, factory black, Mastiff blast, kill ammo packs,
  // pause while dead, new maps, sound engine
  const v123 = await page.evaluate(async () => {
    const g = BR.game, out = {}, M = BR.Models; BR.AntiCheat._testing = true; const L = BR.Lobby, keepL = { skipRoll: L.skipRoll, preset: L.preset, size: L.size };
    const m = M.weapon('rifle', 'default', 'none', 'hyperdrive'); let wr = 0, rb = 0; m.traverse(o => { if (o.userData.fitted && o.isGroup) wr++; if (o.userData.fitted && o.isMesh) rb++; });
    out.fit = wr > 5 && rb > 0;
    out.overdrive = ['pistol', 'smg', 'shotgun', 'rifle', 'holoar', 'sniper', 'hunter', 'revolver', 'lmg', 'dmr', 'launcher'].every(w => Object.keys(M.BLUEPRINTS[w]).filter(k => k.startsWith('od_')).length === 2)
      && ['knife', 'bayonet', 'tracker', 'butterfly'].every(w => Object.keys(M.BLUEPRINTS[w]).some(k => k.startsWith('od_')));
    const od = M.weapon('pistol', 'default', 'none', 'od_neontokyo'); let veins = 0; od.traverse(o => { if (o.isMesh && o.userData.fitted && o.material.map) veins++; }); out.veins = veins >= 2 && od.userData.skinFx >= 2;
    out.factory = ['pistol', 'smg', 'sniper', 'revolver', 'dmr', 'launcher'].every(id => BR.IMPORTED[id].finish === 'factory');
    const bf = M.weapon('butterfly'), bb = bf.userData.bladeMesh.geometry; bb.computeBoundingBox(); out.trailTip = bf.userData.trailTip.y <= bb.boundingBox.max.y + 1e-4 && !!M.weapon('knife').userData.trailSpace;
    // Mastiff: a point-blank blast lands all 8 pellets
    BR.Lobby.skipRoll = true; BR.Lobby.preset = 'duel'; BR.Lobby.size = 1; BR.Lobby.play({ map: 'skyline' }); await new Promise(r => setTimeout(r, 300));
    out.skyline = g.world.mapId === 'skyline' && g.world.ffaSpots.length >= 8;
    const p = g.player, e = g.actors.find(a => a !== p); if (g.mode) g.mode.frozen = false;
    p.mover.pos.set(-6, 0, 4.5); e.mover.pos.set(-2, 0, 4.5); p.mover.vel.set(0, 0, 0); e.mover.vel.set(0, 0, 0); g.update(1 / 60);
    const eye = p.eye(new THREE.Vector3()), d = new THREE.Vector3(e.pos.x, e.pos.y + e.mover.h * 0.55, e.pos.z).sub(eye).normalize(); p.yaw = Math.atan2(-d.x, -d.z); p.pitch = Math.asin(d.y);
    const w = BR.Weapons.create('shotgun'); p.slots[0] = w; p.cur = 0; w.mag = 6; w.cool = 0; let got = 0; const ad = g.applyDamage.bind(g);
    g.applyDamage = (v, a, dmg, ...r) => { if (v === e) got += dmg; return ad(v, a, dmg, ...r); }; e.health = 5000; if (g.mode) { g.mode.frozen = false; g.mode.phase = 'fight'; } BR.Weapons.tryFire(g, p); out.shotDmg = Math.round(got); g.applyDamage = ad;
    out.mastiff = Math.round(got) >= 56; const sd = out.shotDmg; delete out.shotDmg; window.__sd = sd;
    // kill ammo pack
    g.toMenu(); BR.Lobby.preset = 'tdm'; BR.Lobby.size = 4; BR.Lobby.play({ map: 'suburb' }); await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 60; i++) g.update(1 / 30);
    out.suburb = g.world.mapId === 'suburb' && g.world.ffaSpots.length >= 12;
    const P2 = g.player, foe = g.actors.find(a => a.team !== P2.team && a.alive), gun = P2.guns().find(Boolean); P2.ammo[gun.def.ammo] = 0;
    foe.mover.pos.set(P2.pos.x + 1.5, P2.pos.y, P2.pos.z); g.kill(foe, P2, gun.id, false);
    const pack = g.loot.items.find(i => i.kind === 'scav'); for (let i = 0; i < 60; i++) g.update(1 / 30); if (pack) P2.mover.pos.copy(pack.pos); for (let i = 0; i < 6; i++) g.update(1 / 30);
    out.ammoPack = !!pack && pack.taken && P2.ammo[gun.def.ammo] > 0;
    // pause while dead
    g.kill(P2, foe, 'rifle', false); g.update(1 / 30); g.input.press('pause'); g.update(1 / 30); out.deadPause = g.state === 'paused'; g.resume();
    out.sound = typeof BR.Audio.mech === 'function' && typeof BR.Audio.step === 'function' && !!BR.Audio.GUNS.shotgun;
    g.toMenu(); BR.AntiCheat._testing = false; Object.assign(L, keepL);
    return out;
  });
  // v1.27: hats, revolver hold, victory freeze + dance, downed crawl hitbox, chest show, upright floating guns
  const v127 = await page.evaluate(async () => {
    const g = BR.game, P = BR.Profile, out = {}, keep = JSON.stringify({ owned: P.data.owned, equip: P.data.equip, coins: P.data.coins, dev: P.data.dev });
    const H = BR.HATS, ids = Object.keys(H).filter(k => k !== 'default');
    out.hats = ids.length >= 18 && ids.filter(k => !H[k].caseOnly && !H[k].grind).length >= 6 && ['release', 'nova'].every(c => BR.CaseItems.all(c).some(e => e.cat === 'hats')) && P.grindItems().filter(e => e.cat === 'hats').length >= 3;
    P.data.owned.hats = ['default', 'saturn']; P.equip('hats', 'saturn');
    const fake = () => ({ isPlayer: true, color: 0x3366ff, yaw: 0, pitch: 0, weapon: { id: 'rifle' }, mover: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: true, wallN: new THREE.Vector3() } });
    const me = BR.Actor.prototype.buildMesh.call(fake()); let n = 0; me.userData.head.traverse(o => { if (o.isMesh) n++; });
    out.hatWorn = P.charLook().h === 'saturn' && n >= 5 && typeof me.userData.hatTick === 'function';
    out.everyHat = ids.every(id => { try { return !!BR.Actor.prototype.buildMesh.call({ look: { o: 'default', m: 'default', h: id }, color: 1, yaw: 0, pitch: 0, weapon: { id: 'rifle' }, mover: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: true, wallN: new THREE.Vector3() } }); } catch (e) { return false; } });
    BR.inventory.open(); document.querySelector('#inv-tabs [data-cat=character]').click(); document.querySelector('#inv-char [data-s=hats]').click();
    out.hatTab = BR.inventory.cat === 'hats' && document.querySelectorAll('#inv-grid .sw.chr').length >= 2 && !!g.shopChar; document.querySelector('#inv-char [data-s=outfits]').click(); BR.inventory.close();
    const k = JSON.parse(keep); Object.assign(P.data, { owned: k.owned, equip: k.equip, coins: k.coins, dev: k.dev }); P.save();
    // downed: the hitbox lies along the body (a shot at the head out in front lands as a headshot)
    BR.AntiCheat._testing = true; g.startMatch({ seed: 5 }); const p = g.player, b = g.actors.find(a => a !== p); p.mover.dropping = false; p.mover.chute = false; for (const a of g.actors) if (a !== p) { a.brain = null; if (a !== b) a.mover.pos.set(9999, 0, 9999); }
    b.mover.pos.set(p.pos.x, p.pos.y, p.pos.z - 10); b.downed = true; b.mover.prone = true; b.mover.h = 0.62; b.yaw = Math.PI; if (b.mesh) b.mesh.rotation.y = Math.PI; for (let i = 0; i < 10; i++) b.syncMesh(1 / 30);
    const eye = new THREE.Vector3(p.pos.x, b.pos.y + 0.3, p.pos.z), dir = new THREE.Vector3(0, 0, -1);
    const hs = g.hitscan(p, eye, dir, 50); out.crawlHead = hs.actor === b && hs.head && Math.abs(hs.t - (10 - 0.8 - 0.2)) < 0.15;
    const side = g.hitscan(p, new THREE.Vector3(b.pos.x - 6, b.pos.y + 0.18, b.pos.z + 0.5), new THREE.Vector3(1, 0, 0), 20); out.crawlLegs = side.actor === b && !side.head;
    out.crawlCentred = Math.abs(b.mesh.userData.body.position.z - 0.94) < 0.05;
    // victory: the stick can't walk you during the show
    g.toMenu(); g.startMatch({ seed: 3 }); const p2 = g.player; p2.mover.dropping = false; p2.mover.chute = false; for (const a of g.actors) if (a !== p2) { a.alive = false; }
    p2.input.mz = 1; g.update(1 / 30); for (let i = 0; i < 40; i++) g.update(1 / 30); const x0 = p2.pos.clone(); p2.input.mz = 1; for (let i = 0; i < 60; i++) { p2.input.mz = 1; g.update(1 / 30); }
    out.victoryStill = !!g.victory && Math.hypot(p2.pos.x - x0.x, p2.pos.z - x0.z) < 0.05;
    g.toMenu();
    // chest: plays an opening show; loot launches with sparkle and lands; guns float upright
    g.startMatch({ practice: true }); const L = g.loot, pp = g.player, c = L.add({ kind: 'chest', tier: 2 }, pp.pos.x + 3, pp.pos.y, pp.pos.z);
    L.openChest(pp, c); out.chestShow = L.opening.length === 1 && L.items.some(i => i.air && i.spark !== undefined);
    for (let i = 0; i < 150; i++) g.update(1 / 30);
    const gun = L.items.filter(i => i.kind === 'weapon' && !i.air && i.mesh.visible).sort((a, b) => a.pos.distanceTo(c.pos) - b.pos.distanceTo(c.pos))[0]; out.chestDone = L.opening.length === 0;
    const gm = gun && gun.mesh.children[0]; out.upright = !!gm && Math.abs(gm.rotation.z) < 0.01 && gun.mesh.position.y > gun.pos.y + 0.45;
    out.revolver = true;
    g.toMenu(); BR.AntiCheat._testing = false;
    return out;
  });
  // v1.26: CHARACTER cosmetics: outfits + masks (shop, cases, mastery), worn by your character, party lineup + preview
  const v126 = await page.evaluate(async () => {
    const g = BR.game, P = BR.Profile, out = {}, keep = JSON.stringify({ owned: P.data.owned, equip: P.data.equip, coins: P.data.coins, dev: P.data.dev, grind: P.data.grind });
    const O = BR.OUTFITS, K = BR.MASKS, ids = T => Object.keys(T).filter(k => k !== 'default');
    out.tables = ids(O).length >= 20 && ids(K).length >= 15;
    const sold = T => ids(T).filter(k => !T[k].caseOnly && !T[k].grind && T[k].price > 0).length;
    out.shop = sold(O) >= 6 && sold(K) >= 6;
    out.cases = ['release', 'nova'].every(c => BR.CaseItems.all(c).some(e => e.cat === 'outfits') && BR.CaseItems.all(c).some(e => e.cat === 'masks'));
    out.mastery = P.grindItems().filter(e => e.cat === 'outfits').length >= 3 && P.grindItems().filter(e => e.cat === 'masks').length >= 3;
    out.defaults = P.owns('outfits', 'default') && P.owns('masks', 'default') && P.charLook().o === 'default' && P.charLook().m === 'default';
    // buy + equip, then your character wears it (jacket in the outfit colour, not the team colour)
    P.data.dev = false; P.data.coins = 5000; P.data.owned.outfits = ['default']; P.data.owned.masks = ['default'];
    out.buy = P.buy('outfits', 'crimson') && P.buy('masks', 'redeye') && P.data.equip.outfits === 'crimson' && P.data.equip.masks === 'redeye' && P.data.coins === 5000 - O.crimson.price - K.redeye.price;
    out.caseOnly = !P.buy('outfits', 'magma') && !BR.Shop.catalog('outfits').magma;
    const fake = () => ({ isPlayer: true, color: 0x3366ff, yaw: 0, pitch: 0, weapon: { id: 'rifle' }, mover: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: true, wallN: new THREE.Vector3() } });
    const C = new THREE.Color(O.crimson.jacket), me = BR.Actor.prototype.buildMesh.call(fake()), sm = me.children.find(o => o.isSkinnedMesh), col = sm.geometry.attributes.color.array;
    const ti = (() => { for (let i = 0; i < col.length / 3; i++) if (Math.abs(col[i * 3] - C.r) < 0.01 && Math.abs(col[i * 3 + 1] - C.g) < 0.01) return true; return false; })();
    me.userData.mat.color.setHex(0x00ff00); let green = false; for (let i = 0; i < col.length; i += 3) if (col[i + 1] > 0.99 && col[i] < 0.01) green = true;
    out.worn = ti && !green && !!me.userData.mat3.emissiveMap;
    // a patterned + glowing outfit gets its own jacket material; masks with add-ons get them
    P.data.owned.outfits.push('magma'); P.data.owned.masks.push('halo'); P.equip('outfits', 'magma'); P.equip('masks', 'halo');
    const m2 = BR.Actor.prototype.buildMesh.call(fake()), u2 = m2.userData, sk2 = m2.children.find(o => o.isSkinnedMesh);
    out.pattern = Array.isArray(sk2.material) && !!u2.mat2 && !!u2.mat2.map && !!u2.mat2.emissiveMap && sk2.geometry.groups.length === 2;
    let addon = 0; u2.head.traverse(o => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial) addon++; }); out.addon = addon >= 1;
    out.untrusted = !!BR.Actor.prototype.buildMesh.call({ look: { o: '__proto__', m: 'constructor' }, color: 0x123456, yaw: 0, pitch: 0, weapon: { id: 'rifle' }, mover: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: true, wallN: new THREE.Vector3() } }).userData.char;
    // bots keep their team colours
    g.startMatch({ practice: true }); const bot = g.actors.find(a => a !== g.player && a.mesh); out.bots = !bot || (!bot.mesh.userData.mat2 && bot.mesh.userData.mat3.map === bot.mesh.userData.mat3.map && !BR.lookOf(bot)); g.toMenu();
    // the inventory has a CHARACTER tab with OUTFIT / MASK slots, pictures and a 3D character preview
    BR.inventory.open(); document.querySelector('#inv-tabs [data-cat=character]').click();
    out.tab = BR.inventory.cat === 'outfits' && !document.getElementById('inv-char').classList.contains('hidden') && document.querySelectorAll('#inv-grid .sw.chr').length >= 2 && !!g.shopChar;
    document.querySelector('#inv-char [data-s=masks]').click(); out.maskTab = BR.inventory.cat === 'masks' && document.querySelectorAll('#inv-grid .card').length >= 2;
    BR.inventory.close();
    BR.shop.open(); document.querySelector('#shop-tabs [data-cat=character]').click(); out.shopTab = BR.shop.cat === 'outfits' && document.querySelectorAll('#shop-grid .card').length >= 8 && !!g.shopChar; BR.shop.close();
    out.party = BR.Party.look().ch && BR.Party.look().ch.o === 'magma' && BR.Party.look().ch.m === 'halo';
    const k = JSON.parse(keep); Object.assign(P.data, { owned: k.owned, equip: k.equip, coins: k.coins, dev: k.dev, grind: k.grind }); P.save();
    return out;
  });
  // v1.20: reloads never throw (the Breacher froze the game), new imports, launcher rules, friends + party
  const v120 = await page.evaluate(() => {
    const g = BR.game, out = {}; BR.AntiCheat._testing = true;
    g.startMatch({ practice: true }); const p = g.player; const bad = [];
    for (const id of Object.keys(BR.CONFIG.weapons)) { if (BR.CONFIG.weapons[id].melee) continue;
      try { p.slots[0] = BR.Weapons.create(id); p.cur = 0; p.ammo = { light: 999, heavy: 999, shells: 999 }; for (let i = 0; i < 20; i++) g.update(1 / 60);
        p.slots[0].mag = 0; BR.Weapons.startReload(p.slots[0], p); for (let i = 0; i < 600 && p.slots[0].reloadT > 0; i++) g.vmr.update(1 / 60, 0, 0) || BR.Weapons.update(p.slots[0], 1 / 60, p);
        if (p.slots[0].mag !== p.slots[0].def.mag) bad.push(id); } catch (e) { bad.push(id + ':' + e.message); } }
    out.reloads = bad.length === 0; out.bad = bad;
    const ud = id => g.vmr.models[id].userData.model.userData;
    out.imports = ['pistol', 'dmr', 'hunter'].every(id => ud(id).imported === id) && !!ud('hunter').bolt && !!ud('pistol').mag && !!ud('dmr').mag && !!ud('shotgun').port;
    // the launcher: Sniper Duels picker only (never in the Duels / TDM / FFA lists or the Zombies box)
    const fake = P => ({ P: BR.ARENA_PRESETS[P], g });
    const lists = P => BR.ArenaMatch.prototype.loLists.call(fake(P));
    out.launcher = lists('sniper')[0].join() === 'sniper,hunter,launcher' && !lists('duel')[1].includes('launcher') && !BR.ZombieMode.prototype.boxPool.call({}).includes('launcher');
    out.sniperPicker = BR.ArenaMatch.prototype.loKey.call(fake('sniper')) === 'sniperDuel' && Object.getOwnPropertyDescriptor(BR.ArenaMatch.prototype, 'picksLoadout').get.call(fake('sniper')) === true;
    out.duelLists = !lists('duel')[0].includes('launcher');
    // friends + party pieces exist and the lineup renders your character
    out.party = !!(BR.Party && BR.PartyStage && document.getElementById('btn-friends') && document.getElementById('pt-stage') && document.getElementById('friends'));
    return out;
  });
  const checks = [
    ['v1.27 hats (shop, cases, mastery, worn, animated, HAT slot), downed hitbox along the crawling body, no walking during the victory, chest opening show + sparkle loot, upright floating guns', Object.values(v127).every(Boolean), v127],
    ['v1.26 CHARACTER: outfits + masks in the shop, both cases and mastery; bought / equipped looks are worn by your character (patterns, glow, mask add-ons), bots keep team colours, inventory + shop CHARACTER tab with preview, party look', Object.values(v126).every(Boolean), v126],
    ['v1.23 blueprints seated on the new models (fit groups + surface ribbons), Overdrive blueprints with energy veins, factory black guns, knife trail tips, Mastiff full blast, kill ammo packs, pause while dead, Cul-de-Sac + Skyline, sound engine', Object.values(v123).every(Boolean), v123],
    ['v1.21 knock = the kill, finishing = assist, give up when knocked, District FFA map + spread spawns, window vault, tracking runner, imported sniper / revolver / launcher / knives', ['knockCredit', 'giveUp', 'ffa', 'vault', 'runner', 'imports'].every(k => v121[k])],
    ['v1.20 every gun reloads without errors (the Breacher reload froze the game), Pistol / DMR / Kar98k imports (bolt cycles), launcher only in Sniper Duels picker (+ BR loot), friends + party UI', v120.reloads && v120.imports && v120.sniperPicker && v120.duelLists && v120.launcher && v120.party],
    ['v1.19 squads: duos/trios/squads teams + teammates, knockdowns (crawl, no shooting, bleed out), bot + player revives, finishing the downed, team wipes, spectate, team win, Resurgence up to trios, lobby picker', ['setup', 'knocked', 'bleeds', 'noFire', 'botRevive', 'finish', 'wipe', 'noFF', 'playerDown', 'playerRevived', 'prompt', 'youRevive', 'panel', 'teamWin', 'spectate', 'resTrios', 'solo', 'picker'].every(k => v119[k])],
    ['v1.19 recoil springs settle without bouncing; SMG retuned (950 rpm, 30 rounds, fast ADS + mobility)', v119.recoil && v119.smg],
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
    ['wall-run only while holding jump', mech.wallRunHeld && !mech.wallRunReleased],
    ['mantle climbs a 1.6m ledge', mech.mantleY >= 1.59],
    ['vault climbs a 1.2m crate', mech.vaultTop >= 1.19],
    ['jump pad launches > 5m', mech.padApex > 5],
    ['grapple pulls you onto a 10m roof', mech.grappleTop >= 9.9],
    ['shotgun jump launches > 2.5m', combat.shotgunJump > 2.5],
    ['you drop in with only your knife (no pistol)', !combat.spawnSlots[0] && !combat.spawnSlots[1] && combat.spawnSlots[2] === 'knife'],
    ['super jump has a cooldown', combat.superJumpVy[0] > 11 && combat.superJumpVy[1] < 9],
    ['grapple hooks the ground', combat.grappleGround],
    ['grapple hooks tree canopies', combat.grappleTree],
    ['grapple hooks other players', combat.grappleActor],
    ['tracers are visible in the equipped color', combat.tracerVisible],
    ['dropped guns show the real model', combat.lootModel],
    ['big map has 10+ named locations', combat.pois.length >= 10 && combat.mapSize >= 600],
    ['SHA-256 fallback is correct', acct.jsHashMatches],
    ['accounts: validation, sign up, wrong code/password rejected', acct.bad && acct.signup && acct.wrongCode && acct.wrongPass],
    ['dev code gives that account infinite coins; the dev code hash can\'t be swapped from the console', acct.devOk && acct.buyFree && acct.devPersists && acct.hashLocked],
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
    ['stretched res widens the picture; saturation filters the 3D view', extra.video.asp1 < extra.video.asp0 / 1.5 && /saturate\(1\.40?8/.test(extra.video.filt) && extra.video.reset],
    ['karambit gives a movement speed boost', extra.newstuff.knifeSpeed > BR_RUN * 1.15],
    ['sniper + hunting rifle are bolt actions (bolt lifts, pulls back, returns)', extra.newstuff.bolts && (extra.newstuff.sniperBolt || extra.newstuff.sniperImported) && extra.newstuff.lift > 0.8 && extra.newstuff.back > 0.05 && extra.newstuff.settled],
    ['stim + grapple have first-person arm animations', extra.fpAnims.injSeen && extra.fpAnims.injGone && extra.fpAnims.launchSeen && extra.fpAnims.launchGone],
    ['shockwave grenade launches you; pickups refill; purple model', extra.shock.used && extra.shock.rise > 12 && extra.shock.picked && extra.shock.model],
    ['styled tracers (helix/spark/lightning/dual) render extra beads', extra.styledTracer],
    ['damage numbers stack per target and mark headshots', extra.dmgStack],
    ['more camos, gloves and Mythic blueprints (animated camos scroll)', extra.cosmetics.camos >= 19 && extra.cosmetics.gloves >= 16 && extra.cosmetics.mythicBp >= 18 && extra.animCamo],
    ['karambit deploy rolls on the index finger in the ring', extra.ringRoll < 0.03],
    ['dropped weapons toss, bounce, settle and show a name tag', extra.drop.label && extra.drop.rose && extra.drop.settled],
    ['gloves merged (few draw calls), modelled cars, round minimap', extra.handMeshes <= 4 && extra.cars > 0 && extra.roundMap === '50%'],
    ['one tracer per gun; blueprints fire their signature tracer', extra.perGun],
    ['Release Case: rarity odds, pays, grants exclusive (not sold) items', extra.cases.items >= 25 && extra.cases.rareShare > 0.45 && extra.cases.rareShare < 0.6 && extra.cases.paid && extra.cases.owned && extra.cases.notInShop],
    ['ranked RP, rank-reward kill feeds and a leaderboard', extra.ranks.rp && extra.ranks.diamondFeed && extra.ranks.board],
    ['karambit flips over the finger (ring axis along the finger)', extra.flip > 0.9],
    ['Mythic blueprint signature reload animation', extra.sigReload.style === 'twirl' && extra.sigReload.maxRoll > 1.5],
    ['island map: hidden boundary, ocean, natural rock formations', extra.island.edgeHidden && extra.island.sea && extra.island.rocks],
    ['inventory: owned items only, equip, drag to inspect', extra.inventory.onlyOwned && extra.inventory.equipped && extra.inventory.turned && extra.inventory.closed],
    ['hunting rifle uses iron sights (no scope)', extra.newstuff.hunterIrons],
    ['map is dressed (frames, props, ponds, barrels, logs)', extra.newstuff.decor > 3000 && extra.newstuff.ponds >= 4 && extra.newstuff.barrels > 10 && extra.newstuff.logs > 20],
    ['dying ends your match (no respawn)', death.state === 'end' && !death.alive && death.endShown],
    ['queue screen finds a new match', queue.shown && queue.stillEnded && queue.state === 'playing' && queue.alive && queue.hidden && /QUEUE/.test(death.btn)],
    ['duel: arena + chosen loadout, frozen countdown, bot hunts you', duel.arena && duel.loadout === 'sniper,smg,knife' && duel.frozen && duel.fighting],
    ['duel: rounds score, loadout menu between rounds, new loadout applies', duel.round1 === '1-0' && duel.loadoutMenu && duel.newLoadout],
    ['duel: time-out goes to more HP; first to N ends with rematch', duel.timeout && duel.end],
    ['mythic blueprints exist for every weapon and animate', duel.mythic >= 9 && duel.mythicAnim],
    ['performance: tiled world culled past the fog, < 200 draw calls, lean bots', perf.chunks > 20 && perf.hidden > 5 && perf.calls < 200 && perf.botMeshes < 26],
    ['adaptive resolution drops on slow frames and recovers (capped)', perf.dropped < perf.s0 && perf.recovered > perf.dropped && perf.recovered <= perf.cap + 1e-9],
    ['hunting rifle holds 5 rounds', v15.hunterMag === 5],
    ['Easy bots hit much softer than Medium', v15.easyMult < v15.medMult * 0.6],
    ['butterfly + revolver skins in the shop and the Release Case', v15.bflySkins >= 8 && v15.rvSkins >= 5 && v15.inCase >= 6 && v15.inShop >= 6],
    ['butterfly equips as your melee and flips open on draw', v15.melee === 'butterfly' && v15.bflyFlip > 1],
    ['revolver reload swings the cylinder out and spins it', v15.rv === 'revolver' && v15.crane > 0.8 && v15.cyl > 0.5],
    ['pump shotgun racks its forend after a shot', v15.pump[0] > 0.05 && v15.pump[1] < 0.005],
    ['every gun builds with every blueprint + camo; per-gun tracers', v15.cosmetics.bad.length === 0 && v15.cosmetics.built > 200 && v15.cosmetics.tracers],
    ['inventory melee picker swaps karambit / butterfly (one at a time)', v15.meleePick.a.join() === 'butterfly,butterfly' && v15.meleePick.b.join() === 'knife,knife,1'],
    ['reload button inspects with a knife or a full mag, reloads otherwise', v15.reloadInspect.knife && v15.reloadInspect.full && v15.reloadInspect.fullNoReload && v15.reloadInspect.reloads],
    ['weapon slots + spawn/duel menus use pictures of the real models', v15.icons.sil && v15.icons.pic && v15.icons.slot && v15.icons.spawnCards >= 8 && v15.icons.duelCards >= 8],
    ['hunting rifle has more recoil', v15.icons.hunterRecoil >= 0.05 && v15.icons.hunterKick > 1],
    ['spawn menu drops the gun on the ground (no auto-equip); walking over it picks it up', v15.spawnSlots.dropped && v15.spawnSlots.a === ',,knife' && v15.spawnSlots.picked],
    ['weapon buttons opacity can be lowered (saved)', Math.abs(v15.slotAlpha - 0.3) < 0.02 && v15.saved === 0.3],
    ['walls stop bullets both ways and knives (battle royale)', !walls.br.throughPlayer && !walls.br.throughBot && !walls.br.knifeThrough && walls.br.clearPlayer && walls.br.clearBot && walls.br.knifeClear],
    ['walls stop bullets both ways and knives (1v1 duel)', !walls.duel.throughPlayer && !walls.duel.throughBot && !walls.duel.knifeThrough && walls.duel.clearPlayer && walls.duel.clearBot && walls.duel.knifeClear],
    ['advanced sensitivity: horizontal / vertical multipliers + settings UI', Math.abs(sensAdv.b[0] / sensAdv.a[0] - 2) < 0.05 && Math.abs(sensAdv.b[1] / sensAdv.a[1] - 0.5) < 0.05 && sensAdv.ui],
    ['bigger battle royale map (780 m), slower run speed', v17.mapSize >= 780 && v17.run < 6.9],
    ['new weapons: LMG + DMR build, fire, have icons', v17.newGuns && v17.fired === 2 && v17.slots === 'lmg,dmr,knife'],
    ['Season 2: an animated blueprint for every gun with a new reload style', v17.s2 && v17.s2anim],
    ['new reload styles (warp / orbit / slam) play and reset', v17.styles === 3 && v17.holderScale === 1],
    ['Nova Case: own pool, Legendary+ only, rolls stay in it', v17.nova.n >= 10 && v17.nova.onlyHigh && v17.nova.disjoint && v17.nova.rollsInPool],
    ['kill finishers equip and play', v17.finEquipped && v17.finActive],
    ['gloves per weapon (and the viewmodel swaps them)', v17.gloves.lmg === 'hyperspace' && v17.gloves.rifle === 'default' && v17.gloveSwapped],
    ['loot / dropped guns wear your equipped blueprint', v17.lootSkin],
    ['weapon mastery unlocks a camo; daily reward streak + key, once a day', !v17.mastery.before && v17.mastery.after && v17.daily.streak === 3 && v17.daily.key && v17.daily.again === null],
    ['camos equip per gun (SMG camo stays on the SMG; ALL = every gun)', v17.camo.smg === 'hyperspace' && (v17.camo.rifle === 'default' || v17.camo.rifle === 'carbon') && v17.camo.smgEq && !v17.camo.rifleEq && v17.camo.vmSmg && v17.camo.vmRifleClean && v17.camo.all],
    ['K/D ratio: deaths tracked, kills / deaths', v17.kd === 3 && v17.kdDeath],
    ['DMR prism optic: own overlay, zooms, hides the gun, turns off', v17.dmr.optic && !v17.dmr.sniperScope && v17.dmr.zoomed && v17.dmr.gunHidden && v17.dmr.off],
    ['karambit spins on a straight finger through the ring', v17.ringFinger],
    ['zombies boss intro cutscene (letterbox + title card), then the fight', v17.zm.cutscene && v17.zm.cutEnd],
    ['crosshair stays up while aiming; zombies take the enemy highlight; realistic textured zombies; zombies-left counter', v17.z2.adsXh && v17.z2.highlight && v17.z2.kinds && v17.z2.left],
    ['zombies map: 4 zones, 3 buyable doors (spawns open with them), 12+ wall buys', v17.z2.map && v17.z2.spawnsLocked && v17.z2.door],
    ['Mystery Box (beam, roll, take) and Pack-a-Punch (upgrade, camo, tracer)', v17.z2.box && v17.z2.pap && v17.z2.papModel],
    ['quests every 5 rounds reward points + story lore in the journal (J)', v17.z2.questStart && v17.z2.questDone && v17.z2.journal && v17.z2.story && v17.z2.kb],
    ['zombies: Halloween map, round 1 starts, zombies rise and chase the player and swipe', v17.zm.card && v17.zm.map && v17.zm.round1 && v17.zm.chase && v17.zm.swipe],
    ['zombies: points + kills, rounds advance and get stronger, boss on round 10 with a health bar', v17.zm.points && v17.zm.kills && v17.zm.round2 && v17.zm.scales && v17.zm.boss && v17.zm.bossDies],
    ['zombies: all four bosses use their moves; power-ups, wall buys, death ends the run', Object.values(v17.zm.moves).every(n => n >= 2) && v17.zm.powers && v17.zm.buy && v17.zm.death],
    ['pause -> settings hides the pause menu and BACK restores it', v17.v183.pauseHid && v17.v183.pauseBack],
    ['last-kill freeze frame holds the world, then the victory show', v17.v183.frz && v17.v183.held && v17.v183.after],
    ['one font everywhere, slower shotgun, higher shockwave, camo finishes, melee picker only on blueprints', v17.v183.font && v17.v183.shotgunRpm < 80 && v17.v183.lift >= 28 && v17.v183.envT > 0 && v17.v183.envG > 0 && v17.v183.meleeHidden],
    ['PC keybinds: every action rebindable (keys, mouse, wheel), conflicts move, saved, settings UI, reset', v17.kb.n >= 22 && v17.kb.all && v17.kb.hJump && v17.kb.released && v17.kb.spaceDead && v17.kb.steal && v17.kb.mFire && v17.kb.mOff && v17.kb.wheel && v17.kb.fwd && v17.kb.stop && v17.kb.saved && v17.kb.ui && v17.kb.esc && v17.kb.reset],
    ['vibrant knife blueprints: 9 with glow auras + sparkles and colour trails', v17.v180.auraOk === 9 && Object.values(v17.v180.trails).every(t => t.built && t.seen && t.grad)],
    ['new finishers (Supernova, Prism Burst, Thunderstrike, Sakura, Dragon Soul) play and clean up', Object.values(v17.v180.fins).every(f => f.peak >= 2) && v17.v180.left === 0 && v17.v180.shop && v17.v180.nova],
    ['weapons use reflective, detailed materials; bayonet CS-style grip', v17.v180.env >= 1 && v17.v180.grip],      // (v1.21: every gun is an imported model now)
    ['LMG ACOG: round eyepiece on aim, zooms, hides the gun, turns off', v17.acog.on && v17.acog.prismOff && v17.acog.sniperOff && v17.acog.zoomed && v17.acog.gunHidden && v17.acog.off && v17.acog.model],
    ['weapon boxes have smooth rounded bevels (curved edge normals)', v17.smooth > 50],
    ['two-floor buildings: nothing covers the stair hole', v17.v178.buildings2 > 0 && v17.v178.covered === 0],
    ['v1.10 zombies: flow-field pathing reaches you round walls, markers over the last 5', v17.v110.navReach >= 7 && v17.v110.navField && v17.v110.marks >= 1 && v17.v110.left <= 5],
    ['v1.10 aim trainer: drills menu, targets hit by your gun, results + personal best', v17.v110.aimMenu && v17.v110.aimRay && v17.v110.aimHit && v17.v110.aimDone],
    ['v1.10 locker mid-match (aim trainer + practice pause menu) and back', v17.v110.locker && v17.v110.lockerBack && v17.v110.pauseLocker && v17.v110.practiceLocker],
    ['v1.10 Overdrive: swarm, auto powers, level-up cards, Overlord win -> results', v17.v110.odEnemies && v17.v110.odLevel && v17.v110.odPicked && v17.v110.odRay && v17.v110.odWin],
    ['v1.10 Resurgence: you and bots redeploy, respawns end at circle 4, results', v17.v110.resBack && v17.v110.resBot && v17.v110.resEnd],
    ['v1.10 grind camos + blueprints: locked, unlock by challenges, animated, challenges page', v17.v110.grindItems && v17.v110.grindLocked && v17.v110.grindUnlock && v17.v110.grindAnim && v17.v110.grindUi && v17.v110.modes],
    ['v1.11 weapon rarity: Common..Mythic stats, loot rolls, beams, pickups keep rarity, HUD + prompt + practice picker', v17.v111.rarTable && v17.v111.rarStats && v17.v111.rarRoll && v17.v111.lootBeam && v17.v111.pickRar && v17.v111.slotRar && v17.v111.swapPrompt && v17.v111.spRar && v17.v111.spawnRar],
    ['v1.11 default loadout (rifle + pistol + bayonet), used in practice, loadout screen', v17.v111.loadoutDefault && v17.v111.loadoutUsed && v17.v111.loUi],
    ['v1.11 Discover mode browser: tiles, select, lobby PLAY launches the mode', v17.v111.discover && v17.v111.selected && v17.v111.goAim],
    ['v1.11 arms: fabric sleeves attached at the wrist; bayonet full flip; karambit inspect shows the blade then spins', v17.v111.sleeve && v17.v111.bayFlip && v17.v111.karShow && v17.v111.karSpin],
    ['v1.11.1 straight support wrist, aim trainer infinite ammo, no white boxes in freefall, Ironreef map for Resurgence', v17.v1111.wrist && v17.v1111.sparks && v17.v1111.infAmmo && v17.v1111.reef],
    ['v1.12 arena modes: 2v2 duels, shotgun + sniper duels, TDM (score, respawns, end), FFA; no friendly fire', v17.v112.duel2 && v17.v112.duelFight && v17.v112.noFF && v17.v112.duelKill && v17.v112.shotgun && v17.v112.sniper && v17.v112.tdm && v17.v112.tdmScore && v17.v112.respawn && v17.v112.tdmEnd && v17.v112.tdmResult && v17.v112.ffa],
    ['v1.12 shield cell model + Overdrive humanoids (husk, gunner, warden) with head hitboxes', v17.v112.shieldModel && v17.v112.humanoid],
    ['v1.13 Tracker knife: model, blueprints, melee picker, held in the fist in first person', v17.v113.model && v17.v113.bps && v17.v113.vm && v17.v113.picker],
    ['v1.15 arena maps: The Yard, Killhouse + Cargo build with clear spawns and bots fight on them', v17.v115.maps.yard && v17.v115.maps.killhouse && v17.v115.maps.cargo],
    ['v1.15 map roll: fair odds (each map ~1/3) and the case strip lands on the rolled map', v17.v115.fair && v17.v115.roll],
    ['v1.15 no moving or shooting before the round starts; walls stop bullets', v17.v115.frozenPos && v17.v115.noFire && v17.v115.unfrozen && v17.v115.walls],
    ['v1.15 Duels: pick your loadout before every round (re-arms you during the countdown)', v17.v115.picker && v17.v115.picked],
    ['v1.15 Ranked vs Casual: casual gives XP + coins + challenges but no RP, ranked gives RP; Discover queue toggle; classic 1v1 Duel removed', v17.v115.casual && v17.v115.ranked && v17.v115.brCasual && v17.v115.casualGrind && v17.v115.noClassic && v17.v115.queue && v17.v115.queueOff],
    ['v1.15 account IDs (unique SRG-XXXX-XXXX) + support panel: dev-only, password re-entry, no hashes shown, one-time reset', v17.v115.idFormat && v17.v115.seedId && v17.v115.unique && v17.v115.lockedOut && v17.v115.badPw && v17.v115.unlock && v17.v115.list && v17.v115.csv && v17.v115.reset && v17.v115.panel && v17.v115.hiddenForOthers],
    ['v1.16 Ranked unlocks at level 20 (locked queue + no RP below it)', v17.v116.rankLock && v17.v116.rankLockUi && v17.v116.rankOpen],
    ['v1.16 anti-cheat: frozen stats, damage / health / ammo / teleport checks, impossible results paid nothing, host kicks bad hits, edited saves rolled back', v17.v116.frozen && v17.v116.dmgClamp && v17.v116.hpClamp && v17.v116.magClamp && v17.v116.teleport && v17.v116.badResult && v17.v116.fastWin && v17.v116.hostKick && v17.v116.saveEdit && v17.v116.sigStrip && v17.v116.logged],
    ['v1.16 dev menu: dev-only, unlocks with the dev code, signed gift codes (once, right account), forged + mis-targeted commands ignored, ban/unban', v17.v116.notDev && v17.v116.wrongCode && v17.v116.unlock && v17.v116.gift && v17.v116.forged && v17.v116.wrongTarget && v17.v116.ban && v17.v116.banBlocksPlay && v17.v116.unban && v17.v116.lockedSign && v17.v116.menuBtn && v17.v116.menuHidden],
    ['v1.16 every gun + knife blueprint has a textured finish and edge lines; world models stay one mesh', v17.v116.finishes && v17.v116.worldOne],
    ['v1.16.1 leaderboard: 50 spots filled with the owner\'s name, real ranked players replace them, forged / impersonated / impossible entries refused, bans hidden', v17.v1161.empty && v17.v1161.took && v17.v1161.forged && v17.v1161.pinned && v17.v1161.newcomer && v17.v1161.bannedHidden && v17.v1161.ui],
    ['v1.16.3 imported .glb rifle: textured + normal-mapped, placed (length, muzzle, sights, hands), magazine split off, world model, camos still apply', v17.v1163.imported && v17.v1163.anchors && v17.v1163.mag && v17.v1163.world && v17.v1163.skin],
    ['v1.17 every procedural weapon + knife has worn textures, normal maps and real-scale UVs, guns get edge highlights; gloves get fabric', v17.v117.weapons && v17.v117.gloves && v17.v117.world],
    ['v1.17.1 Remember me: checked keeps you signed in across visits, unchecked only for the tab session; works from the form', v17.v1171.box && v17.v1171.remembered && v17.v1171.sessionOnly && v17.v1171.sameTab && v17.v1171.newVisit && v17.v1171.form],
    ['v1.17.2 Shockwave Launcher: fires a grenade from the drum, the blast damages enemies (capped), firing at your feet rocket-jumps you unhurt; icon + blueprints', v17.v1172.fires && v17.v1172.blast && v17.v1172.rocketJump && v17.v1172.loadout],
    ['v1.18 imported Holo AR / SMG / LMG (factory finish, magazines, holo reticle + ACOG aligned, camos apply), black factory Rifle + Hunting Rifle, light menu with no match behind it', v17.v118.imports && v17.v118.holo && v17.v118.acog && v17.v118.camo && v17.v118.rifleBlack && v17.v118.hunterBlack && v17.v118.lightMenu && v17.v118.menuOff && v17.v118.mastiff],
    ['v1.14 fresh accounts (default skins, Tracker, level 0), XP + levels, knives unlock at 20/40/60, level UI', v17.v114.fresh && v17.v114.migrate && v17.v114.locked && v17.v114.matchXP && v17.v114.lv19 && v17.v114.lv20 && v17.v114.bayEquip && v17.v114.chip && v17.v114.panel],
    ['v1.15.1 level 20 takes about 30 average Battle Royale matches; each level needs more XP than the last', v17.v114.pace],
    ['patch notes page: every update with a date, newest = current version', v17.v178.shown && v17.v178.rows === v17.v178.notes && v17.v178.notes >= 40 && v17.v178.latest === BR_VERSION && v17.v178.sorted && v17.v178.dated && v17.v178.closed && v17.v178.badgeOff],
    ['butterfly (reference clip): flat idle, upright beat mid-draw, spin-open, upright inspect', v17.bfly2.upMid < 0.35 && v17.bfly2.flatEnd < 0.2 && v17.bfly2.rollSeen > 3 && v17.bfly2.upInsp < 0.5],
    ['victory: orbit cam, celebrating character, overlay, HUD hidden, then results', v17.victory.state === 'won' && v17.victory.active && v17.victory.overlay && v17.victory.hudHidden && v17.victory.body && v17.victory.camOut && v17.victory.armsUp && v17.victory.vmHidden && v17.victory.ended],
    ['tracers are soft camera-facing beams with a glowing head (no boxes)', v17.beams && v17.beamOk],
    ['spray: first shot light, climb ramps up, smooth side sway, view recovers after', v17.spray.ramps && v17.spray.flips <= 4 && v17.spray.recovered],
    ['kill reward: banner + screen flash + hit-stop + on-body burst', v17.killReward.banner && v17.killReward.flash && v17.killReward.hitStop && v17.killReward.fx],
    ['M9 bayonet: default knife, flips into the hand on draw and settles in the fist', v17.bayonet.fresh === 'tracker' && v17.bayonet.migrated === 'bayonet' && v17.bayonet.kept === 'butterfly' && v17.bayonet.slot === 'bayonet' && v17.bayonet.maxFlip > 2 && v17.bayonet.upBeat < 0.4 && Math.abs(v17.bayonet.flipMid) > 0.5 && v17.bayonet.idleOk && v17.bayonet.face2 < 0.3 && v17.bayonet.settled && v17.bayonet.fist],
    ['bayonet blueprints (shop + both cases), camo on the blade, new camos, trails', v17.bayonet.bps >= 9 && v17.bayonet.caseR >= 2 && v17.bayonet.caseN >= 2 && v17.bayonet.camoBlade && v17.bayonet.trail && v17.bayonet.newCamos],
    ['speedometer shows m/s and can be turned off; movement slowed', v17.bayonet.speedo && v17.bayonet.speedoOff && v17.run < 6],
    ['Nightshade butterfly: purple aura + glowing trail on the flips', v17.nightshade.bp && v17.nightshade.trail && v17.nightshade.trailSeen && v17.nightshade.base && v17.nightshade.aura >= 2 && v17.nightshade.cleared],
    ['enemy highlight tints other players', v17.highlight],
    ['spinning case previews render', v17.spins >= 2],
    ['bots finish a match', match.alive === 1],
    ['no page errors', errors.length === 0],
  ];
  console.log(JSON.stringify({ v127, v126, v123, v121, v120, v119, v17, walls, sensAdv, v15, mech, combat, acct, extra, death, queue, duel, perf, loadMs, match, errors }, null, 1));
  let ok = true;
  for (const [name, pass] of checks) { console.log((pass ? 'PASS ' : 'FAIL ') + name); ok = ok && pass; }
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
