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
  consumeLook() { const d = [this.lookDX, this.lookDY]; this.lookDX = 0; this.lookDY = 0; return d; }
  reset() {
    this.moveX = this.moveY = this.lookDX = this.lookDY = 0;
    this.fire = false; this.fireTouches = 0; this.mouseFire = false;
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
        this.lookDX += t.clientX - r.x;
        this.lookDY += t.clientY - r.y;
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
        if (r.act === 'fire' || r.act === 'firel') {
          this.fireTouches = Math.max(0, this.fireTouches - 1);
          this.fire = this.fireTouches > 0 || this.mouseFire;
        }
      }
    }
  }

  // ---------------------------------------------------------------- desktop
  bindDesktop() {
    const map = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    const upd = () => {
      if (this.usingTouch) return;
      this.moveY = (this.keys.f ? 1 : 0) - (this.keys.b ? 1 : 0);
      this.moveX = (this.keys.r ? 1 : 0) - (this.keys.l ? 1 : 0);
      const l = Math.hypot(this.moveX, this.moveY);
      if (l > 1) { this.moveX /= l; this.moveY /= l; }
    };
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.usingTouch = false;
      BR.Audio.init();
      if (map[e.code]) { this.keys[map[e.code]] = true; upd(); }
      if (e.code === 'Space') { this.press('jump'); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'KeyC' || e.code === 'ControlLeft') this.press('crouch');
      if (e.code === 'KeyG') this.press('grapple');
      if (e.code === 'KeyV') this.press('inspect');
      if (e.code === 'Digit3') this.press('slot2');
      if (e.code === 'KeyM' || e.code === 'Tab') { this.press('map'); e.preventDefault(); }
      if (e.code === 'KeyR') this.press('reload');
      if (e.code === 'KeyE' || e.code === 'KeyF') this.press('interact');
      if (e.code === 'KeyQ') this.press('swap');
      if (e.code === 'Digit1') this.press('slot0');
      if (e.code === 'Digit2') this.press('slot1');
      if (e.code === 'Escape' || e.code === 'KeyP') this.press('pause');
    });
    window.addEventListener('keyup', e => {
      if (map[e.code]) { this.keys[map[e.code]] = false; upd(); }
    });
    this.root.addEventListener('mousedown', e => {
      if (this.usingTouch || this.editing || e.target.closest('[data-act]')) return;
      BR.Audio.init();
      if (!this.locked && this.root.requestPointerLock) {
        try { const p = this.root.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* not allowed here */ }
      }
      if (e.button === 0) { this.mouseFire = true; this.fire = true; }
      if (e.button === 2) this.ads = true;
      if (e.button === 1) { this.press('grapple'); e.preventDefault(); }
      this.dragging = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouseFire = false; this.fire = this.fireTouches > 0; }
      if (e.button === 2) this.ads = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', e => {
      if (this.usingTouch) return;
      // With pointer lock: free look. Without (some embeds block it): drag to look.
      if (this.locked || this.dragging) { this.lookDX += e.movementX * 0.4; this.lookDY += e.movementY * 0.4; }
    });
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.root; });
    window.addEventListener('wheel', e => { if (this.locked) this.press('swap'); }, { passive: true });
    window.addEventListener('blur', () => this.reset());
  }

  unlock() {
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }
};
