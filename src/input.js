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
      this.usingTouch = false;
      BR.Audio.init();
      this.bindDown(e.code, e);
    });
    window.addEventListener('keyup', e => this.bindUp(e.code));
    this.root.addEventListener('mousedown', e => {
      if (this.usingTouch || this.editing || e.target.closest('[data-act]') || BR.Keybinds.capturing) return;
      BR.Audio.init();
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

  unlock() {
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }
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
