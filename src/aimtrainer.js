'use strict';
// =============================================================================
// AIM TRAINER (v1.10) — a shooting range with four drills, scores and personal bests.
//   GRIDSHOT  3 targets at a time on a 5x5 board; hit one, another appears. 60 s.
//   FLICK     one small target at a time somewhere in front of you; speed bonus. 60 s.
//   TRACKING  one strafing orb; score = time your crosshair stays on it (+ hits). 45 s.
//   STRAFE    4 dummies strafing round cover; 150 HP each, headshots count double. 60 s.
// Any gun (infinite reserve ammo), your equipped skins, the locker from the menu or pause.
// Targets aren't actors: Game.hitscan asks rayTargets(), the gun calls hitTarget().
// =============================================================================
(function () {
  const DRILLS = {
    gridshot: { name: 'GRIDSHOT', dur: 60, gun: 'pistol', desc: '3 targets at once on a 5×5 board. Clear them fast.' },
    flick:    { name: 'FLICK',    dur: 60, gun: 'dmr',    desc: 'One small target at a time, anywhere ahead. Faster hits score more.' },
    tracking: { name: 'TRACKING', dur: 45, gun: 'smg',    desc: 'Keep your crosshair on the strafing orb.' },
    strafe:   { name: 'STRAFE',   dur: 60, gun: 'rifle',  desc: '4 strafing dummies, 150 HP. Headshots score double.' },
  };
  const GUNS = ['pistol', 'revolver', 'smg', 'rifle', 'holoar', 'lmg', 'dmr', 'hunter', 'sniper', 'shotgun'];
  const KEY = 'surge.aimtrainer';
  const store = () => Object.assign({ drill: 'gridshot', gun: null, best: {} }, BR.util.load(KEY, {}));
  const save = d => BR.util.save(KEY, d);
  const $ = id => document.getElementById(id);
  const U = () => BR.util;

  BR.AimTrainer = class AimTrainer {
    constructor(game) { this.g = game; this.cls = 'aimtrain'; this.targets = []; this.state = 'lobby'; this.data = store(); }

    start() {
      const g = this.g, p = g.player, W = g.world;
      g.scene.background = new THREE.Color(0x0d0e13); g.scene.fog.color.setHex(0x14122a); g.scene.fog.near = 60; g.scene.fog.far = 220;
      BR.skyTint(g, { zen: 0x04050c, mid: 0x0e1030, hor: 0x3a1a6a, low: 0x0a0a14 }, { sky: 0xb8c0ff, ground: 0x2a2440, hemi: 0.9, sun: 0xe8e0ff, sunI: 0.75 });
      this.root = new THREE.Group(); g.scene.add(this.root);
      this.geo = new THREE.SphereGeometry(1, 20, 14);
      this.mat = new THREE.MeshPhongMaterial({ color: 0x45e0ff, emissive: 0x0a5a70, specular: 0xffffff, shininess: 90 });
      this.matHot = new THREE.MeshPhongMaterial({ color: 0xff5ec4, emissive: 0x6a0a48, specular: 0xffffff, shininess: 90 });
      this.dmat = new THREE.MeshPhongMaterial({ color: 0x8a90a0, emissive: 0x15171c, shininess: 40 });
      this.dhead = new THREE.MeshPhongMaterial({ color: 0xffd24a, emissive: 0x3a2a00, shininess: 60 });
      this.place(p, W.spawns[0]);
      this.armGun(this.data.gun || DRILLS[this.data.drill].gun);
      this.buildUI();
      this.openMenu();
    }
    place(p, sp) { p.mover.pos.set(sp.x, 0, sp.z); p.mover.vel.set(0, 0, 0); p.yaw = sp.yaw; p.pitch = 0.04; }
    armGun(id) {
      const p = this.g.player, C = BR.CONFIG;
      p.slots[0] = BR.Weapons.create(id); p.slots[1] = null; p.cur = 0;
      for (const t in p.ammo) p.ammo[t] = C.ammoCap[t];
      this.gun = id;
    }

    // ------------------------------------------------------------------ UI
    buildUI() {
      if (!$('aimmenu')) {
        const m = document.createElement('div'); m.id = 'aimmenu'; m.className = 'overlay hidden';
        m.innerHTML = `<div class="panel metal wide aimpanel">
          <div class="ptitle">AIM TRAINER</div>
          <div class="sp-sec">DRILL</div><div class="at-drills" id="at-drills"></div>
          <div class="sp-sec">WEAPON</div><div class="sp-grid at-guns" id="at-guns"></div>
          <div class="at-row"><button class="mbtn hot" id="at-go">START</button><button class="mbtn" id="at-locker">LOCKER · SKINS</button></div>
          <div class="at-row"><button class="mbtn sm" id="at-free">FREE AIM ON THE RANGE</button><button class="mbtn sm" id="at-leave">LEAVE</button></div>
        </div>`;
        $('app').appendChild(m);
        const h = document.createElement('div'); h.id = 'at-hud'; h.className = 'hidden';
        h.innerHTML = '<div class="at-name" id="at-name"></div><div class="at-time" id="at-time">0:00</div><div class="at-stats"><span><b id="at-score">0</b>SCORE</span><span><b id="at-acc">—</b>ACCURACY</span><span><b id="at-hits">0</b>HITS</span></div><div class="at-count" id="at-count"></div>';
        $('play').appendChild(h);
        const r = document.createElement('div'); r.id = 'at-res'; r.className = 'overlay hidden';
        r.innerHTML = `<div class="panel metal at-respanel"><div class="ptitle" id="atr-title">GRIDSHOT</div><div class="atr-score" id="atr-score">0</div><div class="atr-pb" id="atr-pb"></div>
          <div class="atr-grid"><div><b id="atr-acc">0%</b><span>ACCURACY</span></div><div><b id="atr-hits">0</b><span>HITS</span></div><div><b id="atr-ttk">0</b><span id="atr-ttkl">AVG TIME / TARGET</span></div></div>
          <button class="mbtn hot" id="atr-again">AGAIN</button><button class="mbtn" id="atr-menu">CHANGE DRILL</button></div>`;
        $('app').appendChild(r);
      }
      $('at-drills').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; this.data.drill = b.dataset.d; if (!this.data.gun) this.armGun(DRILLS[b.dataset.d].gun); save(this.data); BR.Audio.click(); this.renderMenu(); };
      $('at-guns').onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; this.data.gun = b.dataset.g; this.armGun(b.dataset.g); save(this.data); BR.Audio.pickup(); this.renderMenu(); };
      $('at-go').onclick = () => { this.closeMenu(); this.begin(); };
      $('at-free').onclick = () => { this.closeMenu(); this.g.hud.toast('Free aim: open the menu (SPAWN key / button) to start a drill', 2200); };
      $('at-locker').onclick = () => BR.openLocker && BR.openLocker();
      $('at-leave').onclick = () => { this.g.hud.show('aimmenu', false); this.g.toMenu(); };
      $('atr-again').onclick = () => { this.g.hud.show('at-res', false); this.resume(); this.begin(); };
      $('atr-menu').onclick = () => { this.g.hud.show('at-res', false); this.openMenu(); };
    }
    renderMenu() {
      const D = this.data;
      $('at-drills').innerHTML = Object.entries(DRILLS).map(([id, d]) => `<button class="at-drill${D.drill === id ? ' sel' : ''}" data-d="${id}"><b>${d.name}</b><i>${d.desc}</i><em>${D.best[id] ? 'BEST ' + D.best[id].toLocaleString() : 'NO SCORE YET'}</em></button>`).join('');
      $('at-guns').innerHTML = GUNS.map(id => { const pic = BR.WeaponIcons && BR.WeaponIcons.pic[id]; return `<button class="gcard${this.gun === id ? ' sel' : ''}" data-g="${id}">${pic ? `<img src="${pic}" alt="">` : ''}<span>${BR.CONFIG.weapons[id].name.toUpperCase()}</span></button>`; }).join('');
    }
    openMenu() {
      const g = this.g; this.stopRun(); this.renderMenu();
      if (g.state === 'playing') g.state = 'paused';
      g.input.reset(); g.input.unlock(); g.hud.show('aimmenu', true);
    }
    menu() { this.openMenu(); }
    closeMenu() { this.g.hud.show('aimmenu', false); this.resume(); }
    resume() { const g = this.g; if (g.state === 'paused') { g.state = 'playing'; g.input.reset(); g.last = performance.now(); } }

    // ------------------------------------------------------------------ runs
    begin() {
      const g = this.g, d = DRILLS[this.data.drill];
      this.place(g.player, g.world.spawns[0]); this.armGun(this.gun);
      this.run = { id: this.data.drill, d, t: d.dur, count: 3, shots: 0, hits: 0, score: 0, kills: 0, onT: 0, spawnT: [], ttk: [] };
      this.clearTargets();
      $('at-name').textContent = d.name; $('at-hud').classList.remove('hidden');
      this.state = 'count'; this.lastCount = 0; this.refresh();
    }
    stopRun() { this.state = 'lobby'; this.clearTargets(); const h = $('at-hud'); if (h) h.classList.add('hidden'); }
    clearTargets() { for (const t of this.targets) this.root.remove(t.mesh); this.targets = []; }
    finish() {
      const R = this.run, g = this.g; this.state = 'done'; this.clearTargets();
      const acc = R.shots ? R.hits / R.shots : 0;
      R.score = Math.round(R.score * (0.6 + 0.4 * acc));                 // accuracy matters
      const prev = this.data.best[R.id] || 0, pb = R.score > prev;
      if (pb) { this.data.best[R.id] = R.score; save(this.data); }
      if (BR.Profile.addGrind) BR.Profile.addGrind('aim', R.score, R.id);
      if (BR.Profile.addXP && R.score > 0) BR.Profile.addXP([['Aim drill', Math.min(600, Math.round(R.score / 15))]]);
      $('atr-title').textContent = R.d.name; $('atr-score').textContent = R.score.toLocaleString();
      $('atr-pb').textContent = pb ? 'NEW PERSONAL BEST!' : 'BEST ' + prev.toLocaleString();
      $('atr-pb').classList.toggle('pb', pb);
      $('atr-acc').textContent = Math.round(acc * 100) + '%'; $('atr-hits').textContent = R.id === 'strafe' ? R.kills + ' kills' : R.hits;
      const avg = R.ttk.length ? R.ttk.reduce((a, b) => a + b, 0) / R.ttk.length : 0;
      $('atr-ttk').textContent = R.id === 'tracking' ? Math.round(R.onT / R.d.dur * 100) + '%' : avg ? (avg * 1000).toFixed(0) + ' ms' : '—';
      $('atr-ttkl').textContent = R.id === 'tracking' ? 'TIME ON TARGET' : R.id === 'strafe' ? 'AVG TIME / KILL' : 'AVG TIME / TARGET';
      $('at-hud').classList.add('hidden');
      if (pb) BR.Audio.coin(); else BR.Audio.click();
      g.state = 'paused'; g.input.reset(); g.input.unlock(); g.hud.show('at-res', true);
    }
    refresh() {
      const R = this.run; if (!R) return;
      $('at-time').textContent = BR.fmtTime(Math.max(0, R.t)); $('at-score').textContent = Math.round(R.score).toLocaleString();
      $('at-acc').textContent = R.shots ? Math.round(R.hits / R.shots * 100) + '%' : '—'; $('at-hits').textContent = R.id === 'strafe' ? R.kills : R.hits;
    }

    // ------------------------------------------------------------------ targets
    addOrb(x, y, z, r, extra) {
      const m = new THREE.Mesh(this.geo, this.mat); m.scale.setScalar(r); m.position.set(x, y, z); this.root.add(m);
      const t = Object.assign({ kind: 'orb', mesh: m, r, born: this.g.time, pop: 0 }, extra || {}); this.targets.push(t);
      this.g.fx.burst(m.position.clone(), [0x45e0ff, 0xffffff], 5, 2, 0.04, 0.25, 0);
      return t;
    }
    addDummy(x, z) {
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.5, 12), this.dmat); body.position.y = 0.75; g.add(body);
      const head = new THREE.Mesh(this.geo, this.dhead); head.scale.setScalar(0.24); head.position.y = 1.72; g.add(head);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.07), new THREE.MeshBasicMaterial({ color: 0x45e0ff })); bar.position.y = 2.15; g.add(bar);
      g.position.set(x, 0, z); this.root.add(g);
      const t = { kind: 'dummy', mesh: g, bar, hp: 150, max: 150, born: this.g.time, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2.5), turn: 0.4 + Math.random() * 1.2, x0: x };
      this.targets.push(t); return t;
    }
    gridCell(exclude) {
      for (let k = 0; k < 40; k++) { const i = Math.floor(Math.random() * 5), j = Math.floor(Math.random() * 5);
        if (!this.targets.some(t => t.cell === i + ',' + j) && (i + ',' + j) !== exclude) return [i, j]; }
      return [2, 2];
    }
    spawnFor(id, exclude) {
      const p = this.g.player, eye = p.pos.y + 1.6;
      if (id === 'gridshot') { const [i, j] = this.gridCell(exclude); return this.addOrb((i - 2) * 1.3, 1.0 + j * 0.95, -1.5, 0.4, { cell: i + ',' + j }); }
      if (id === 'flick') {
        const yaw = (Math.random() - 0.5) * 1.6, pitch = -0.04 + Math.random() * 0.36, d = 12 + Math.random() * 9;
        return this.addOrb(p.pos.x - Math.sin(yaw) * Math.cos(pitch) * d, eye + Math.sin(pitch) * d, p.pos.z - Math.cos(yaw) * Math.cos(pitch) * d, 0.3);
      }
      if (id === 'tracking') { const t = this.addOrb(0, 2.6, -10, 0.5, { vx: 4, vy: 0, chg: 0.6 }); t.mesh.material = this.matHot; return t; }
      if (id === 'strafe') { const x = (Math.random() - 0.5) * 26, z = -12 - Math.random() * 16; return this.addDummy(x, z); }
    }

    // ------------------------------------------------------------------ shooting hooks
    rayTargets(o, d, maxT) {
      const u = U(); let best = maxT, hit = null, head = false;
      for (const t of this.targets) {
        if (t.dead) continue;
        if (t.kind === 'orb') { const p = t.mesh.position, th = u.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y, p.z, t.r * 1.05, best); if (th < best) { best = th; hit = t; head = false; } }
        else {
          const p = t.mesh.position;
          const th = u.raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y + 1.72, p.z, 0.25, best); if (th < best) { best = th; hit = t; head = true; }
          const bx = this._bx || (this._bx = {}); bx.x0 = p.x - 0.36; bx.x1 = p.x + 0.36; bx.z0 = p.z - 0.36; bx.z1 = p.z + 0.36; bx.y0 = 0; bx.y1 = 1.5;
          const tb = u.rayAABB(o.x, o.y, o.z, u.inv(d.x), u.inv(d.y), u.inv(d.z), bx, best); if (tb < best) { best = tb; hit = t; head = false; }
        }
      }
      return hit ? { t: best, target: hit, head } : null;
    }
    onShot() { if (this.state === 'run') this.run.shots++; }
    hitTarget(t, dmg, head, at) {
      const g = this.g, R = this.run, v = this._hv || (this._hv = new THREE.Vector3()); v.set(at.x, at.y, at.z);
      if (this.state !== 'run' || t.dead) { g.fx.burst(v, [0x45e0ff, 0xffffff], 6, 3, 0.05, 0.3, 0); g.hud.hitmarker(head, false); BR.Audio.hit(head); return; }
      R.hits++;
      if (t.kind === 'orb') {
        if (R.id === 'tracking') { R.score += 6; g.hud.hitmarker(false, false); return; }
        t.dead = true; this.root.remove(t.mesh); this.targets.splice(this.targets.indexOf(t), 1);
        const life = g.time - t.born; R.ttk.push(life);
        R.score += R.id === 'flick' ? Math.round(100 + Math.max(0, 1.2 - life) * 150) : 100;
        g.fx.burst(t.mesh.position.clone(), [0x45e0ff, 0xffffff, 0xa06bff], 16, 5, 0.06, 0.35, 0);
        g.hud.hitmarker(false, true); BR.Audio.pop ? BR.Audio.pop(0.35) : BR.Audio.hit(false);
        this.spawnFor(R.id, t.cell);
      } else {
        t.hp -= dmg; g.hud.damageNumber(v, dmg, head, t, false); g.fx.burst(v, head ? [0xffd24a, 0xffffff] : [0x45e0ff, 0xffffff], head ? 10 : 5, 4, 0.05, 0.3, 0);
        t.bar.scale.x = Math.max(0.01, t.hp / t.max);
        if (t.hp <= 0) {
          R.kills++; R.score += head ? 200 : 100; R.ttk.push(g.time - t.born);
          g.hud.hitmarker(head, true); BR.Audio.kill(head, 1);
          g.fx.burst(t.mesh.position.clone().setY(1.2), [0x45e0ff, 0xa06bff, 0xffffff], 26, 6, 0.08, 0.5, 2);
          this.root.remove(t.mesh); this.targets.splice(this.targets.indexOf(t), 1);
          setTimeout(() => { if (this.state === 'run') this.spawnFor('strafe'); }, 350);
        } else { g.hud.hitmarker(head, false); BR.Audio.hit(head); }
      }
      this.refresh();
    }

    // ------------------------------------------------------------------ per frame
    update(dt) {
      const g = this.g, p = g.player;
      for (const t in p.ammo) p.ammo[t] = Math.max(p.ammo[t], 300);           // infinite reserve
      for (const w of p.slots) if (w && !w.def.melee) { w.mag = w.def.mag; w.reloadT = 0; }      // v1.11.1: infinite ammo, never reload
      if (p.health < 100) p.health = 100;
      if (this.state === 'count') {
        const R = this.run; R.count -= dt; const n = Math.ceil(R.count);
        if (n !== this.lastCount) { this.lastCount = n; $('at-count').textContent = n > 0 ? n : 'GO'; $('at-count').classList.remove('pop'); void $('at-count').offsetWidth; $('at-count').classList.add('pop'); if (n > 0) BR.Audio.click(); else BR.Audio.pad && BR.Audio.pad(); }
        if (R.count <= 0) {
          this.state = 'run';
          const n0 = R.id === 'gridshot' ? 3 : R.id === 'strafe' ? 4 : 1;
          for (let i = 0; i < n0; i++) this.spawnFor(R.id);
          setTimeout(() => { const c = $('at-count'); if (c) c.textContent = ''; }, 500);
        }
        return;
      }
      if (this.state !== 'run') return;
      const R = this.run; R.t -= dt;
      for (const t of this.targets) {
        if (t.kind === 'orb' && R.id === 'tracking') {
          t.chg -= dt; if (t.chg <= 0) { t.chg = 0.35 + Math.random() * 0.9; t.vx = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 5); t.vy = (Math.random() - 0.5) * 2.4; }
          const m = t.mesh.position; m.x += t.vx * dt; m.y += t.vy * dt;
          if (Math.abs(m.x) > 11) { m.x = Math.sign(m.x) * 11; t.vx *= -1; } if (m.y < 1.2 || m.y > 5.5) { m.y = U().clamp(m.y, 1.2, 5.5); t.vy *= -1; }
          // time on target: the crosshair ray (not just shots)
          const e = p.eye(this._e || (this._e = new THREE.Vector3())), d = p.aimDir(this._d || (this._d = new THREE.Vector3()));
          const on = U().raySphere(e.x, e.y, e.z, d.x, d.y, d.z, m.x, m.y, m.z, t.r * 1.15, 200) < 200;
          if (on) { R.onT += dt; R.score += dt * 160; }
          t.mesh.material = on ? this.mat : this.matHot;
        } else if (t.kind === 'dummy') {
          const m = t.mesh.position; t.turn -= dt;
          if (t.turn <= 0) { t.turn = 0.35 + Math.random() * 1.3; t.vx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.5); }
          m.x += t.vx * dt; if (Math.abs(m.x) > 18) { m.x = Math.sign(m.x) * 18; t.vx *= -1; }
          t.bar.lookAt(g.camera.position);
        } else if (t.kind === 'orb') { const s = t.r * (1 + 0.06 * Math.sin((g.time - t.born) * 9)); t.mesh.scale.setScalar(Math.min(s, t.r * Math.min(1, (g.time - t.born) * 8 + 0.2))); }
      }
      this.refresh();
      if (R.t <= 0) this.finish();
    }
    dispose() {
      this.clearTargets();
      for (const id of ['at-hud']) { const e = $(id); if (e) e.classList.add('hidden'); }
      for (const id of ['aimmenu', 'at-res']) { const e = $(id); if (e) e.classList.add('hidden'); }
    }
  };
  BR.AIM_DRILLS = DRILLS;
})();
