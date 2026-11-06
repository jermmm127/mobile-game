'use strict';
// =============================================================================
// INPUT — touch (phones) + keyboard/mouse (desktop testing), merged into one
// state object the game reads each frame.
//
// Touch: left 42% of the screen = floating joystick, the rest = look.
// Buttons carry data-act="fire|firel|jump|crouch|grapple|reload|ads|swap|interact|pause".
// Dragging a finger that started on FIRE also aims (like real mobile shooters).
// The 2nd fire button (firel) only fires: dragging it never moves the camera.
// =============================================================================
BR.Input = class Input {
  constructor(root) {
    this.root = root;
    this.moveX = 0; this.moveY = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.fireLookMult = 1;
    this.fire = false;
    this.ads = false;
    this.pressed = {};       // one-shot actions: jump, crouch, grapple, reload, swap, inspect, interact, pause, slot0-2
    this.touches = {};
    this.keys = {};
    this.usingTouch = false;
    this.fireTouches = 0;
    this.mouseFire = false;
    this.locked = false;
    this.joy = { base: root.querySelector('#joy-base'), knob: root.querySelector('#joy-knob'), active: false, R: 56 };
    this.bindTouch();
    this.bindDesktop();
  }

  press(act) { this.pressed[act] = true; }
  consume(act) { const v = !!this.pressed[act]; this.pressed[act] = false; return v; }
  // Gyro aiming: integrates the phone's rotation rate into yaw / pitch radians (screen-orientation aware).
  // iOS needs DeviceMotionEvent.requestPermission() from a tap, so this is called from the settings toggle.
  enableGyro() {
    if (this.gyroOn) return Promise.resolve(true);
    const start = () => {
      this.gyroOn = true; this.gyroYaw = 0; this.gyroPitch = 0;
      window.addEventListener('devicemotion', e => {
        const r = e.rotationRate; if (!r || r.beta === null) return;
        const dt = Math.min(0.05, (e.interval > 1 ? e.interval / 1000 : e.interval) || 0.016), D = Math.PI / 180;
        const ang = (screen.orientation && screen.orientation.angle !== undefined) ? screen.orientation.angle : (window.orientation || 0);
        let yaw, pitch;
        if (ang === 90) { yaw = r.beta; pitch = -r.gamma; }
        else if (ang === 270 || ang === -90) { yaw = -r.beta; pitch = r.gamma; }
        else { yaw = r.gamma; pitch = r.beta; }
        this.gyroYaw += yaw * D * dt; this.gyroPitch += pitch * D * dt; this.gyroSeen = true;
      });
      return true;
    };
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function')
        return DeviceMotionEvent.requestPermission().then(st => st === 'granted' ? start() : false).catch(() => false);
      if (typeof DeviceMotionEvent === 'undefined') return Promise.resolve(false);
      return Promise.resolve(start());
    } catch (e) { return Promise.resolve(false); }
  }
  consumeGyro() { const g = [this.gyroYaw || 0, this.gyroPitch || 0]; this.gyroYaw = 0; this.gyroPitch = 0; return g; }
  consumeLook() { const d = [this.lookDX, this.lookDY]; this.lookDX = 0; this.lookDY = 0; return d; }
  reset() {
    this.moveX = this.moveY = this.lookDX = this.lookDY = 0;
    this.fire = false; this.fireTouches = 0; this.mouseFire = false; this.jumpHeld = false;
    this.pressed = {}; this.touches = {}; this.keys = {};
    this.joy.active = false;
    this.joy.base.classList.remove('on');
    this.root.querySelectorAll('[data-act].on').forEach(b => b.classList.remove('on'));
  }

  // ------------------------------------------------------------------ touch
  bindTouch() {
    const el = this.root;
    const opt = { passive: false };
    el.addEventListener('touchstart', e => this.onStart(e), opt);
    el.addEventListener('touchmove', e => this.onMove(e), opt);
    el.addEventListener('touchend', e => this.onEnd(e), opt);
    el.addEventListener('touchcancel', e => this.onEnd(e), opt);
  }

  onStart(e) {
    if (e.target && e.target.closest && e.target.closest('.ui-touch')) return;     // v1.20: panels over the game (loadout picker) get normal taps + scrolling
    e.preventDefault();
    if (this.editing) return; // the HUD layout editor owns touches
    this.usingTouch = true;
    BR.Audio.init();
    const W = window.innerWidth;
    for (const t of e.changedTouches) {
      const btn = t.target.closest && t.target.closest('[data-act]');
      if (btn) {
        const act = btn.dataset.act;
        const role = { type: 'btn', act, btn, x: t.clientX, y: t.clientY, look: act === 'fire' };
        this.touches[t.identifier] = role;
        btn.classList.add('on');
        if (act === 'fire' || act === 'firel') { this.fireTouches++; this.fire = true; }
        else if (act === 'ads') this.ads = !this.ads;
        else if (act === 'jump') { this.jumpHeld = true; this.press(act); }

        else this.press(act);
        continue;
      }
      if (t.clientX < W * 0.42 && !this.joy.active) {
        this.joy.active = true;
        this.joy.ox = t.clientX; this.joy.oy = t.clientY;
        this.touches[t.identifier] = { type: 'joy' };
        this.joy.base.style.transform = `translate(${t.clientX - 64}px, ${t.clientY - 64}px)`;
        this.joy.knob.style.transform = 'translate(0px, 0px)';
        this.joy.base.classList.add('on');
      } else {
        this.touches[t.identifier] = { type: 'look', x: t.clientX, y: t.clientY };
      }
    }
  }

  onMove(e) {
    if (e.target && e.target.closest && e.target.closest('.ui-touch')) return;
    e.preventDefault();
    if (this.editing) return;
    for (const t of e.changedTouches) {
      const r = this.touches[t.identifier];
      if (!r) continue;
      if (r.type === 'joy') {
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const R = this.joy.R, l = Math.hypot(dx, dy);
        // Let the joystick follow the thumb if it drifts far past the edge
        if (l > R * 1.6) {
          const k = (l - R * 1.6) / l;
          this.joy.ox += dx * k; this.joy.oy += dy * k;
          this.joy.base.style.transform = `translate(${this.joy.ox - 64}px, ${this.joy.oy - 64}px)`;
          dx = t.clientX - this.joy.ox; dy = t.clientY - this.joy.oy;
        }
        const ll = Math.hypot(dx, dy), cl = Math.min(ll, R);
        const nx = ll > 0 ? dx / ll * cl : 0, ny = ll > 0 ? dy / ll * cl : 0;
        this.joy.knob.style.transform = `translate(${nx}px, ${ny}px)`;
        // small deadzone, then full speed quickly (phones need a forgiving stick)
        let mx = nx / R, my = -ny / R;
        const m = Math.hypot(mx, my);
        if (m < 0.12) { mx = 0; my = 0; }
        else { const k = Math.min(1, (m - 0.12) / 0.6) / m; mx *= k; my *= k; }
        this.moveX = mx; this.moveY = my;
      } else if (r.type === 'look' || r.look) {
        const k = r.type === 'look' ? 1 : this.fireLookMult;        // drags that start on the fire button
        this.lookDX += (t.clientX - r.x) * k;
        this.lookDY += (t.clientY - r.y) * k;
        r.x = t.clientX; r.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    if (e.target && e.target.closest && e.target.closest('.ui-touch')) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = this.touches[t.identifier];
      if (!r) continue;
      delete this.touches[t.identifier];
      if (r.type === 'joy') {
        this.joy.active = false;
        this.moveX = 0; this.moveY = 0;
        this.joy.base.classList.remove('on');
      } else if (r.type === 'btn') {
        r.btn.classList.remove('on');
        if (r.act === 'jump') this.jumpHeld = false;
        if (r.act === 'fire' || r.act === 'firel') {
          this.fireTouches = Math.max(0, this.fireTouches - 1);
          this.fire = this.fireTouches > 0 || this.mouseFire;
        }
      }
    }
  }

  // ---------------------------------------------------------------- desktop
  bindDesktop() {
    // Every action goes through the rebindable map (BR.Keybinds): keyboard codes, mouse buttons
    // (Mouse0..4) and the wheel (WheelUp / WheelDown) can drive any action.
    const MOVE = { forward: 'f', back: 'b', left: 'l', right: 'r' };
    const upd = () => {
      if (this.usingTouch) return;
      this.moveY = (this.keys.f ? 1 : 0) - (this.keys.b ? 1 : 0);
      this.moveX = (this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0);
      const l = Math.hypot(this.moveX, this.moveY);
      if (l > 1) { this.moveX /= l; this.moveY /= l; }
    };
    this.kbUpd = () => { const t = this.usingTouch; this.usingTouch = false; upd(); this.usingTouch = t; };     // (the controller hands movement back to the keys)
    this.held = {};
    const down = act => {
      if (MOVE[act]) { this.keys[MOVE[act]] = true; upd(); return; }
      if (act === 'fire') { this.mouseFire = true; this.fire = true; return; }
      if (act === 'ads') { this.ads = true; return; }
      if (act === 'jump') { this.jumpHeld = true; this.press('jump'); return; }
      this.press(act);
    };
    const up = act => {
      if (MOVE[act]) { this.keys[MOVE[act]] = false; upd(); return; }
      if (act === 'fire') { this.mouseFire = false; this.fire = this.fireTouches > 0; return; }
      if (act === 'ads') { this.ads = false; return; }
      if (act === 'jump') this.jumpHeld = false;
    };
    this.bindDown = (code, e) => { const acts = BR.Keybinds.actionsFor(code); for (const a of acts) { this.held[code] = true; down(a); } if (acts.length && e && (code === 'Space' || code === 'Tab' || code.startsWith('Arrow'))) e.preventDefault(); return acts.length > 0; };
    this.bindUp = code => { if (!this.held[code]) return; this.held[code] = false; for (const a of BR.Keybinds.actionsFor(code)) up(a); };
    window.addEventListener('keydown', e => {
      if (e.repeat || BR.Keybinds.capturing) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      this.usingTouch = false; this.kbm();
      BR.Audio.init();
      this.bindDown(e.code, e);
    });
    window.addEventListener('keyup', e => this.bindUp(e.code));
    this.root.addEventListener('mousedown', e => {
      if (this.usingTouch || this.editing || e.target.closest('[data-act]') || BR.Keybinds.capturing) return;
      this.kbm(); BR.Audio.init();
      if (!this.locked && this.root.requestPointerLock) {
        try { const p = this.root.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* not allowed here */ }
      }
      if (this.bindDown('Mouse' + e.button, e) && e.button === 1) e.preventDefault();
      this.dragging = true;
    });
    window.addEventListener('mouseup', e => {
      this.bindUp('Mouse' + e.button);
      this.dragging = false;
    });
    window.addEventListener('mousemove', e => {
      if (this.usingTouch) return;
      // With pointer lock: free look. Without (some embeds block it): drag to look.
      if (this.locked || this.dragging) { this.lookDX += e.movementX * 0.4; this.lookDY += e.movementY * 0.4; }
    });
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    // Mouse clicks on on-screen buttons (pause, slots, spawn, pickup...) work on desktop too
    this.root.addEventListener('click', e => {
      if (this.usingTouch || this.editing) return;
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'fire' || act === 'firel' || act === 'ads') return;
      this.press(act);
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.root; });
    // wheel: one-shot actions only (a held action on the wheel is pressed and released at once)
    window.addEventListener('wheel', e => { if (!this.locked || BR.Keybinds.capturing) return; const c = e.deltaY < 0 ? 'WheelUp' : 'WheelDown'; if (this.bindDown(c, e)) this.bindUp(c); }, { passive: true });
    window.addEventListener('blur', () => this.reset());
  }

  // v1.29.3: keyboard / mouse took over: the controller counts as idle until it's touched again (auto-fire follows the device in use)
  kbm() { if (this.padActive) { this.padActive = false; if (BR.Pad) BR.Pad.active = false; document.body.classList.remove('pad'); if (this.padRelease) this.padRelease(); } }
  unlock() {
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }
};

// =============================================================================
// v1.28 CONTROLLER (Gamepad API, standard mapping: DualSense / DualShock / Xbox / most pads)
//  In a match:  L stick move · R stick look · R2 fire · L2 aim · Cross/A jump · Circle/B crouch + slide
//               Square/X reload (or open / swap / buy when a prompt shows) · Triangle/Y next weapon
//               L1 grenade · R1 grapple · L3 stim · R3 knife · D-pad ↑ inspect ↓ map ←/→ weapon 1 / 2
//               Options/Menu pause · Share/View map. Aim assist (slowdown + gentle pull) like touch.
//  In menus:    D-pad / L stick move the highlight · Cross/A select · Circle/B back · L1/R1 switch tabs
//               L stick ←/→ on a slider changes it · R stick turns the 3D preview in the inventory
// =============================================================================
BR.Pad = {
  B: { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SHARE: 8, OPTIONS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 },
  prev: [], active: false, idx: -1, navT: 0, focus: null, holdT: 0,
  // the connected pad we listen to (the last one that pressed something)
  get() {
    let pads; try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return null; }
    if (!pads) return null;
    if (this.idx >= 0 && pads[this.idx] && pads[this.idx].connected) return pads[this.idx];
    for (const p of pads) if (p && p.connected) { this.idx = p.index; return p; }
    return null;
  },
  // on screen? (offsetParent is null for position:fixed overlays, so measure instead)
  shown(el) { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; },
  dz(v, d) { const a = Math.abs(v); return a < d ? 0 : Math.sign(v) * (a - d) / (1 - d); },
  rumble(strong, weak, ms) {
    const p = this.get(), S = BR.game && BR.game.settings; if (!p || (S && S.padRumble === false)) return;
    try { const h = p.vibrationActuator; if (h && h.playEffect) h.playEffect('dual-rumble', { duration: ms || 80, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* no rumble */ }
  },
};
BR.Input.prototype.pollPad = function (dt, game) {
  const P = BR.Pad, pad = P.get();
  if (!pad) { if (P.active) { P.active = false; this.padActive = false; document.body.classList.remove('pad'); this.padRelease(); } return; }
  const B = P.B, bt = i => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5)), val = i => pad.buttons[i] ? pad.buttons[i].value : 0;
  const now = []; for (let i = 0; i < pad.buttons.length; i++) now[i] = bt(i);
  const edge = i => now[i] && !P.prev[i];
  const ax = pad.axes, lx = P.dz(ax[0] || 0, 0.16), ly = P.dz(ax[1] || 0, 0.16), rx = P.dz(ax[2] || 0, 0.12), ry = P.dz(ax[3] || 0, 0.12);
  const any = now.some(Boolean) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0;
  if (any && !P.active) {
    P.active = true; this.padActive = true; this.usingTouch = false; document.body.classList.add('pad');
    if (!P.greeted && game && game.hud) { P.greeted = true; game.hud.toast('🎮 Controller connected', 1800); }
    BR.Audio && BR.Audio.init && BR.Audio.init();
  }
  if (!P.active) { P.prev = now; return; }
  const S = (game && game.settings) || {};
  const overlay = this.padMenuRoot(game);
  if (overlay) { this.padRelease(); this.padMenu(dt, game, overlay, now, edge, lx, ly, rx, ry); P.prev = now; return; }
  this.padClearFocus();
  // ---- gameplay
  if (Math.abs(lx) + Math.abs(ly) > 0) { let mx = lx, my = -ly; const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; } this.moveX = mx; this.moveY = my; this.padMoving = true; }
  else if (this.padMoving) { this.padMoving = false; if (this.kbUpd) this.kbUpd(); else { this.moveX = this.moveY = 0; } }
  // look: a curved stick (fine near the middle) plus a turn boost when held fully over
  const mag = Math.min(1, Math.hypot(rx, ry));
  P.holdT = mag > 0.92 ? P.holdT + dt : 0;
  if (mag > 0) {
    const curve = Math.pow(mag, 1.8) / mag, boost = 1 + Math.min(1, Math.max(0, P.holdT - 0.15) / 0.35) * 0.7;
    const speed = 640 * (S.padSens ?? 1) * boost;
    this.lookDX += rx * curve * speed * dt;
    this.lookDY += ry * curve * speed * dt * (S.padInvert ? -1 : 1);
  }
  const fire = val(B.R2) > 0.35 || now[B.R2], ads = val(B.L2) > 0.35 || now[B.L2];
  if (fire !== this.padFire) { this.padFire = fire; this.fire = fire || this.mouseFire || this.fireTouches > 0; }
  if (ads !== this.padAds) { this.padAds = ads; this.ads = ads; }
  if (now[B.A] !== this.padJump) { this.padJump = now[B.A]; this.jumpHeld = now[B.A]; if (now[B.A]) this.press('jump'); }
  if (edge(B.B)) this.press('crouch');
  if (edge(B.X)) { const pr = document.getElementById('prompt'); if (pr && !pr.classList.contains('hidden') && P.shown(pr)) this.press('interact'); else this.press('reload'); }
  if (edge(B.Y)) this.press('swap');
  if (edge(B.L1)) this.press('grenade');
  if (edge(B.R1)) this.press('grapple');
  if (edge(B.L3)) this.press('stim');
  if (edge(B.R3)) this.press('knife');
  if (edge(B.UP)) this.press('inspect');
  if (edge(B.DOWN) || edge(B.SHARE)) this.press('map');
  if (edge(B.LEFT)) this.press('slot0');
  if (edge(B.RIGHT)) this.press('slot1');
  if (edge(B.OPTIONS)) this.press('pause');
  // rumble: a kick when your gun fires, a thud when you get hit
  const p = game && game.player;
  if (p) {
    const w = p.weapon, mag2 = w ? w.mag : -1;
    if (P.lastW === w && mag2 < P.lastMag && w && !w.def.melee) P.rumble(Math.min(1, 0.25 + (w.def.kick || 0.5) * 0.18), 0.35, w.def.dmg > 40 ? 110 : 50);
    P.lastW = w; P.lastMag = mag2;
    const hp = (p.health || 0) + (p.shield || 0);
    if (P.lastHp !== undefined && hp < P.lastHp - 0.5 && p.alive) P.rumble(0.8, 0.4, 140);
    P.lastHp = hp;
  }
  P.prev = now;
};
// stop any held controller inputs (on menus / disconnect) so nothing stays stuck on
BR.Input.prototype.padRelease = function () {
  if (this.padFire) { this.padFire = false; this.fire = this.mouseFire || this.fireTouches > 0; }
  if (this.padAds) { this.padAds = false; this.ads = false; }
  if (this.padJump) { this.padJump = false; this.jumpHeld = false; }
  if (this.padMoving) { this.padMoving = false; if (this.kbUpd) this.kbUpd(); else this.moveX = this.moveY = 0; }
};
// the screen the controller should drive as a menu (null = you're playing)
BR.Input.prototype.padMenuRoot = function (game) {
  const vis = el => el && !el.classList.contains('hidden') && BR.Pad.shown(el);
  const ovs = [...document.querySelectorAll('.overlay')].filter(vis);
  if (ovs.length) return ovs[ovs.length - 1];
  if (!game || game.state === 'menu' || game.state === 'end') { const m = document.getElementById('menu'); return vis(m) ? m : document.body; }
  return null;
};
BR.Input.prototype.padClearFocus = function () { const P = BR.Pad; if (P.focus) { P.focus.classList.remove('pad-focus'); P.focus = null; } };
BR.Input.prototype.padMenu = function (dt, game, root, now, edge, lx, ly, rx, ry) {
  const P = BR.Pad, B = P.B;
  const visible = el => { if (el.disabled || !P.shown(el)) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const items = [...root.querySelectorAll('button, [data-act], .card, input[type=range], input[type=checkbox], select, a[href], [data-id], [tabindex]:not([tabindex="-1"])')].filter(visible);
  if (!items.length) return;
  // start on the obvious choice: PLAY, the screen's main button, the selected card, else the first. Until you move it,
  // the highlight hops to that choice as soon as it appears (screens fade in).
  const pref = items.find(e => e.id === 'btn-go') || items.find(e => e.id === 'btn-resume') || items.find(e => e.classList.contains('hot')) || items.find(e => e.classList.contains('card') && e.classList.contains('sel'));
  if (!P.focus || !items.includes(P.focus) || (!P.moved && pref && P.focus !== pref)) {
    const fresh0 = !P.focus || !items.includes(P.focus);
    this.padClearFocus();
    P.focus = pref || items[0];
    P.focus.classList.add('pad-focus');
    if (fresh0) { P.moved = false; P.navHeld = true; P.navT = 0.25; }     // (the press that brought the highlight in doesn't also move it)
  }
  // direction: D-pad, or the left stick (repeats while held)
  let dx = (now[B.RIGHT] ? 1 : 0) - (now[B.LEFT] ? 1 : 0), dy = (now[B.DOWN] ? 1 : 0) - (now[B.UP] ? 1 : 0);
  if (!dx && !dy) { if (Math.abs(lx) > 0.5) dx = Math.sign(lx); else if (Math.abs(ly) > 0.5) dy = Math.sign(ly); }
  P.navT -= dt;
  const fresh = (dx || dy) && !P.navHeld;
  P.navHeld = !!(dx || dy);
  const f = P.focus;
  // sliders: left / right change the value
  if (f.matches('input[type=range]') && dx && (fresh || P.navT <= 0)) {
    const st = +f.step || 0.05; f.value = Math.min(+f.max, Math.max(+f.min, +f.value + dx * st)); f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
    P.navT = fresh ? 0.3 : 0.06; dx = 0; if (!dy) return;
  }
  if ((dx || dy) && (fresh || P.navT <= 0)) {
    P.navT = fresh ? 0.32 : 0.11;
    const r0 = f.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const e of items) {
      if (e === f) continue;
      const r = e.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2, vx = ex - cx, vy = ey - cy;
      const along = vx * dx + vy * dy; if (along <= 4) continue;
      const side = Math.abs(dx ? vy : vx), score = along + side * 2.2;
      if (score < bs) { bs = score; best = e; }
    }
    if (best) { P.moved = true; f.classList.remove('pad-focus'); P.focus = best; best.classList.add('pad-focus'); try { best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old browser */ } BR.Audio && BR.Audio.click && BR.Audio.click(); }
  }
  if (edge(B.A)) { const t = P.focus; if (t.matches('input[type=checkbox]')) { t.checked = !t.checked; t.dispatchEvent(new Event('change', { bubbles: true })); } else t.click(); }
  if (edge(B.B) || edge(B.OPTIONS) && game && game.state === 'paused') {
    const back = [...root.querySelectorAll('[id$="-back"], [id$="-x"], [id$="-close"], .close, #btn-resume, [data-act="resume"]')].find(visible)
      || [...root.querySelectorAll('button')].filter(visible).find(b => /^(back|close|resume|done|cancel|✕|×)$/i.test(b.textContent.trim()));
    if (back) back.click();
  }
  // L1 / R1: previous / next tab in the screen's tab strip
  if (edge(B.L1) || edge(B.R1)) {
    const seg = [...root.querySelectorAll('.seg')].find(s => visible(s) && s.querySelector('button.sel'));
    if (seg) { const bs = [...seg.querySelectorAll('button')].filter(visible), i = bs.findIndex(b => b.classList.contains('sel')), n = bs[(i + (edge(B.R1) ? 1 : -1) + bs.length) % bs.length]; if (n) { n.click(); BR.Audio && BR.Audio.click && BR.Audio.click(); } }
  }
  // inventory / shop preview: the right stick turns the item
  if (game && game.inspect && game.inspect.on && (rx || ry)) { const I = game.inspect; I.yaw += rx * dt * 3; I.pitch = BR.util.clamp(I.pitch + ry * dt * 2, -1.3, 1.3); I.idle = 0; }
};

// ---- Rebindable PC controls. Each action has two slots (primary / alternate). Codes are
// KeyboardEvent.code values, Mouse0..Mouse4, WheelUp / WheelDown. Saved per device.
BR.Keybinds = {
  KEY: 'surge.keybinds',
  ACTIONS: [
    ['forward', 'Move forward', 'Movement'], ['back', 'Move back', 'Movement'], ['left', 'Move left', 'Movement'], ['right', 'Move right', 'Movement'],
    ['jump', 'Jump', 'Movement'], ['crouch', 'Crouch / slide', 'Movement'], ['grapple', 'Grapple', 'Movement'],
    ['fire', 'Fire', 'Combat'], ['ads', 'Aim down sights', 'Combat'], ['reload', 'Reload', 'Combat'], ['inspect', 'Inspect', 'Combat'],
    ['grenade', 'Shockwave grenade', 'Combat'], ['stim', 'Stim', 'Combat'],
    ['slot0', 'Weapon 1', 'Weapons'], ['slot1', 'Weapon 2', 'Weapons'], ['slot2', 'Knife slot', 'Weapons'], ['swap', 'Next weapon', 'Weapons'], ['knife', 'Knife toggle', 'Weapons'],
    ['interact', 'Open chest / swap gun / buy', 'Other'], ['journal', 'Zombies journal', 'Other'], ['map', 'Map', 'Other'], ['spawnmenu', 'Spawn menu (practice)', 'Other'], ['pause', 'Pause', 'Other'],
  ],
  DEFAULTS: {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    jump: ['Space', null], crouch: ['ShiftLeft', 'KeyC'], grapple: ['KeyG', 'Mouse1'],
    fire: ['Mouse0', null], ads: ['Mouse2', null], reload: ['KeyR', null], inspect: ['KeyV', null], grenade: ['KeyT', null], stim: ['KeyF', null],
    slot0: ['Digit1', null], slot1: ['Digit2', null], slot2: ['Digit3', null], swap: ['KeyQ', 'WheelDown'], knife: ['KeyX', null],
    interact: ['KeyE', null], journal: ['KeyJ', null], map: ['KeyM', 'Tab'], spawnmenu: ['KeyB', null], pause: ['Escape', 'KeyP'],
  },
  capturing: null,
  load() {
    const saved = BR.util.load(this.KEY, null) || {};
    this.map = {};
    for (const [a] of this.ACTIONS) this.map[a] = Array.isArray(saved[a]) ? [saved[a][0] || null, saved[a][1] || null] : this.DEFAULTS[a].slice();
    this.index();
    return this.map;
  },
  index() { this.rev = {}; for (const a in this.map) for (const c of this.map[a]) if (c) (this.rev[c] = this.rev[c] || []).push(a); },
  get() { return this.map || this.load(); },
  actionsFor(code) { this.get(); return this.rev[code] || []; },
  save() { BR.util.save(this.KEY, this.map); this.index(); },
  // set one slot; a code can only drive one action, so it is removed from wherever else it was.
  // Returns the action it was taken from (or null).
  set(action, slot, code) {
    this.get(); let stolen = null;
    if (code) for (const a in this.map) for (let i = 0; i < 2; i++) if (this.map[a][i] === code && !(a === action && i === slot)) { this.map[a][i] = null; stolen = a; }
    this.map[action][slot] = code; this.save(); return stolen;
  },
  reset() { this.map = {}; for (const [a] of this.ACTIONS) this.map[a] = this.DEFAULTS[a].slice(); this.save(); },
  label(code) {
    if (!code) return '—';
    const M = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', WheelUp: 'Wheel up', WheelDown: 'Wheel down', Space: 'Space', Escape: 'Esc',
      ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps', Enter: 'Enter', Backspace: 'Backspace' };
    if (M[code]) return M[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  },
};
