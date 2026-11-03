'use strict';
// =============================================================================
// LAYOUT EDITOR — drag / resize / hide the touch buttons (claw setups etc.).
// Layouts are saved per orientation (landscape / portrait) as fractions of the
// screen, so they survive different phone sizes.
//   settings.layout = { alpha: 0.85, land: { fire: {x, y, s, hide} }, port: {...} }
// =============================================================================
BR.Layout = class Layout {
  constructor(settings, save, input) {
    this.settings = settings;
    this.save = save;
    this.input = input;
    if (!settings.layout) settings.layout = { alpha: 0.85 };
    this.play = document.getElementById('play');
    // Everything tappable on the HUD: action buttons, weapon slots, pickup button, minimap, pause, spawn
    this.buttons = Array.from(this.play.querySelectorAll(':scope > [data-act]'));
    this.sel = null;
    const $ = id => document.getElementById(id);
    this.ui = { bar: $('editor'), name: $('ed-sel'), size: $('ed-size'), hide: $('ed-hide'), alpha: $('ed-alpha'), slotAlpha: $('ed-slot-alpha') };
    this.bind();
    this.apply();
    window.addEventListener('resize', () => this.apply());
  }

  // Round action buttons resize by diameter (px); everything else scales (percent).
  round(b) { return b.classList.contains('act'); }
  half(b, e) { return this.round(b) ? { w: e.s / 2, h: e.s / 2 } : { w: (e.w * e.s / 100) / 2, h: (e.h * e.s / 100) / 2 }; }

  orient() { return window.innerWidth >= window.innerHeight ? 'land' : 'port'; }
  table() { const L = this.settings.layout; return L[this.orient()] || (L[this.orient()] = {}); }

  // Push saved positions onto the buttons (or clear back to the CSS defaults).
  apply() {
    const t = this.settings.layout[this.orient()] || {};
    this.play.style.setProperty('--btn-alpha', this.settings.layout.alpha ?? 0.85);
    this.play.style.setProperty('--slot-alpha', this.settings.layout.slotAlpha ?? 1);
    for (const b of this.buttons) {
      const e = t[b.dataset.act];
      if (e) {
        if (this.round(b)) {
          Object.assign(b.style, {
            left: `calc(${(e.x * 100).toFixed(3)}% - ${e.s / 2}px)`, top: `calc(${(e.y * 100).toFixed(3)}% - ${e.s / 2}px)`,
            right: 'auto', bottom: 'auto', width: e.s + 'px', height: e.s + 'px',
          });
        } else {
          Object.assign(b.style, {
            left: `calc(${(e.x * 100).toFixed(3)}% - ${e.w / 2}px)`, top: `calc(${(e.y * 100).toFixed(3)}% - ${e.h / 2}px)`,
            right: 'auto', bottom: 'auto', transform: `scale(${e.s / 100})`, transformOrigin: '50% 50%',
          });
        }
        b.classList.toggle('user-hidden', !!e.hide);
      } else {
        b.style.left = b.style.top = b.style.right = b.style.bottom = b.style.width = b.style.height = b.style.transform = '';
        b.classList.remove('user-hidden');
      }
    }
  }

  // Freeze every button's current on-screen rect into the table.
  capture() {
    const t = this.table(), W = window.innerWidth, H = window.innerHeight;
    for (const b of this.buttons) {
      if (t[b.dataset.act]) continue;
      const r = b.getBoundingClientRect();
      const e = { x: (r.left + r.width / 2) / W, y: (r.top + r.height / 2) / H, hide: false };
      if (this.round(b)) e.s = Math.round(r.width) || 60;
      else { e.s = 100; e.w = b.offsetWidth || r.width; e.h = b.offsetHeight || r.height; }
      t[b.dataset.act] = e;
    }
  }

  open(onDone) {
    this.onDone = onDone;
    this.input.editing = true;
    this.input.reset();
    document.body.classList.add('editing');
    this.capture();
    this.apply();
    this.ui.alpha.value = this.settings.layout.alpha ?? 0.85;
    this.ui.slotAlpha.value = this.settings.layout.slotAlpha ?? 1;
    this.select(this.buttons.find(b => b.dataset.act === 'fire'));
  }

  close() {
    this.input.editing = false;
    document.body.classList.remove('editing');
    if (this.sel) this.sel.classList.remove('ed-sel');
    this.sel = null;
    this.save();
    if (this.onDone) this.onDone();
  }

  select(b) {
    if (this.sel) this.sel.classList.remove('ed-sel');
    this.sel = b;
    if (!b) return;
    b.classList.add('ed-sel');
    const e = this.table()[b.dataset.act];
    this.ui.name.textContent = b.getAttribute('aria-label') + (b.dataset.act === 'firel' ? ' (2nd)' : '');
    // round buttons: diameter in px; other elements: scale in %
    this.ui.size.min = this.round(b) ? 36 : 50; this.ui.size.max = this.round(b) ? 140 : 200;
    this.ui.size.value = e.s;
    this.ui.hide.checked = !!e.hide;
  }

  bind() {
    const ui = this.ui;
    for (const b of this.buttons) {
      b.addEventListener('pointerdown', ev => {
        if (!this.input.editing) return;
        ev.preventDefault();
        this.select(b);
        const e = this.table()[b.dataset.act];
        const W = window.innerWidth, H = window.innerHeight;
        this.drag = { id: ev.pointerId, dx: ev.clientX - e.x * W, dy: ev.clientY - e.y * H, b };
        try { b.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      });
      b.addEventListener('pointermove', ev => {
        const d = this.drag;
        if (!d || d.id !== ev.pointerId || !this.input.editing) return;
        const e = this.table()[b.dataset.act];
        const W = window.innerWidth, H = window.innerHeight, hf = this.half(b, e);
        e.x = BR.util.clamp(ev.clientX - d.dx, hf.w, W - hf.w) / W;
        e.y = BR.util.clamp(ev.clientY - d.dy, hf.h, H - hf.h) / H;
        this.apply();
      });
      const end = ev => { if (this.drag && this.drag.id === ev.pointerId) { this.drag = null; this.save(); } };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
    }
    ui.size.addEventListener('input', () => {
      if (!this.sel) return;
      this.table()[this.sel.dataset.act].s = parseInt(ui.size.value, 10);
      this.apply(); this.save();
    });
    ui.hide.addEventListener('change', () => {
      if (!this.sel) return;
      this.table()[this.sel.dataset.act].hide = ui.hide.checked;
      this.apply(); this.save();
    });
    ui.alpha.addEventListener('input', () => {
      this.settings.layout.alpha = parseFloat(ui.alpha.value);
      this.apply(); this.save();
    });
    ui.slotAlpha.addEventListener('input', () => {
      this.settings.layout.slotAlpha = parseFloat(ui.slotAlpha.value);
      this.apply(); this.save();
    });
    document.getElementById('ed-reset').addEventListener('click', () => {
      delete this.settings.layout[this.orient()];
      this.settings.layout.alpha = 0.85;
      ui.alpha.value = 0.85;
      this.settings.layout.slotAlpha = 1; ui.slotAlpha.value = 1;
      this.apply();     // back to CSS defaults…
      this.capture();   // …then capture them so editing continues
      this.apply();
      this.select(this.sel);
      this.save();
    });
    document.getElementById('ed-done').addEventListener('click', () => this.close());
    // Let people put buttons where the panel sits (claw layouts use the top edge)
    document.getElementById('ed-flip').addEventListener('click', () => ui.bar.classList.toggle('bottom'));
  }
};

// Fullscreen helper. iPhone Safari has no fullscreen API for pages, so there we
// explain the Home Screen route instead (which does run fullscreen).
BR.Fullscreen = {
  el() { return document.fullscreenElement || document.webkitFullscreenElement || null; },
  supported() {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen) && document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false;
  },
  standalone() { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches; },
  toggle(onFail) {
    try {
      if (this.el()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return;
      }
      if (!this.supported()) { onFail(); return; }
      const d = document.documentElement;
      const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* optional */ } };
      if (p && p.then) p.then(lock).catch(onFail); else lock();
    } catch (e) { onFail(); }
  },
};
