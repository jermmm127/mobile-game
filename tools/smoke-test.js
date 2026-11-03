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
    r.armsVisible = v.knifeHands.R.visible && v.knifeHands.L.visible && v.arms.R.fore.visible && v.arms.L.fore.visible;
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
      r.styledTracer = !!(tt.fx && tt.fx.some(b => b.visible)) && Object.values(BR.Models.TRACERS).filter(x => x.style).length >= 8;
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
        const H = v.knifeHands.R, ring = v.models.knife.userData.spin.obj.getWorldPosition(new THREE.Vector3());
        const tip = new THREE.Vector3(-0.0194, -0.02, -0.056).multiplyScalar(1.3).applyQuaternion(H.quaternion).add(H.position);
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
      const rp0 = P.data.rp; P.data.rp = 4400; const res = P.award({ win: true, place: 1, kills: 3, damage: 100 });
      r.ranks = { rp: res.rp > 0, tier: BR.Ranks.tiers[BR.Ranks.of(P.data.rp)].name, diamondFeed: P.owns('feeds', 'rk_diamond'), board: BR.Ranks.board().some(x => x.me) };
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
    r.newstuff = { knifeSpeed, bolts: !!(C.sniper.bolt && C.hunter.bolt), hunterIrons: !C.hunter.scope && !!hm.sight, sniperBolt: !!vm.models.sniper.userData.model.userData.bolt,
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
    const before = JSON.stringify(m.children.map(c => c.rotation.x.toFixed(3)));
    BR.Models.animate(m, 2.5);
    o.mythic = Object.values(BR.Models.BLUEPRINTS).reduce((n, w) => n + Object.values(w).filter(b => b.rarity === 'Mythic').length, 0);
    o.mythicAnim = (m.userData.anim || []).length > 0 && JSON.stringify(m.children.map(c => c.rotation.x.toFixed(3))) !== before;
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
    // spawn menu: pick a slot, then a gun goes into that slot (two-gun loadout)
    { p.slots[0] = null; p.slots[1] = null; g.state = 'playing'; g.openSpawnMenu();
      const card = id => document.querySelector('#sp-weapons .gcard[data-arg="' + id + '"]');
      card('sniper').click(); card('smg').click(); const a = p.slots.map(x => x && x.id).join();
      document.querySelector('#sp-slots button[data-slot="0"]').click(); card('shotgun').click(); const b2 = p.slots.map(x => x && x.id).join();
      const badges = document.querySelectorAll('#sp-weapons .gbadge').length; g.closeSpawnMenu();
      out.spawnSlots = { a, b: b2, badges }; }
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
  const run = 6.9, BR_RUN = run;
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
    ['stretched res widens the picture; saturation filters the 3D view', extra.video.asp1 < extra.video.asp0 / 1.5 && /saturate\(1\.40?8/.test(extra.video.filt) && extra.video.reset],
    ['karambit gives a movement speed boost', extra.newstuff.knifeSpeed > BR_RUN * 1.15],
    ['sniper + hunting rifle are bolt actions (bolt lifts, pulls back, returns)', extra.newstuff.bolts && extra.newstuff.sniperBolt && extra.newstuff.lift > 0.8 && extra.newstuff.back > 0.05 && extra.newstuff.settled],
    ['stim + grapple have first-person arm animations', extra.fpAnims.injSeen && extra.fpAnims.injGone && extra.fpAnims.launchSeen && extra.fpAnims.launchGone],
    ['shockwave grenade launches you; pickups refill; purple model', extra.shock.used && extra.shock.rise > 3 && extra.shock.picked && extra.shock.model],
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
    ['spawn menu fills slot 1 and slot 2 (pick the slot, then the gun)', v15.spawnSlots.a === 'sniper,smg,knife' && v15.spawnSlots.b === 'shotgun,smg,knife' && v15.spawnSlots.badges === 2],
    ['weapon buttons opacity can be lowered (saved)', Math.abs(v15.slotAlpha - 0.3) < 0.02 && v15.saved === 0.3],
    ['walls stop bullets both ways and knives (battle royale)', !walls.br.throughPlayer && !walls.br.throughBot && !walls.br.knifeThrough && walls.br.clearPlayer && walls.br.clearBot && walls.br.knifeClear],
    ['walls stop bullets both ways and knives (1v1 duel)', !walls.duel.throughPlayer && !walls.duel.throughBot && !walls.duel.knifeThrough && walls.duel.clearPlayer && walls.duel.clearBot && walls.duel.knifeClear],
    ['advanced sensitivity: horizontal / vertical multipliers + settings UI', Math.abs(sensAdv.b[0] / sensAdv.a[0] - 2) < 0.05 && Math.abs(sensAdv.b[1] / sensAdv.a[1] - 0.5) < 0.05 && sensAdv.ui],
    ['bots finish a match', match.alive === 1],
    ['no page errors', errors.length === 0],
  ];
  console.log(JSON.stringify({ walls, sensAdv, v15, mech, combat, acct, extra, death, queue, duel, perf, loadMs, match, errors }, null, 1));
  let ok = true;
  for (const [name, pass] of checks) { console.log((pass ? 'PASS ' : 'FAIL ') + name); ok = ok && pass; }
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
