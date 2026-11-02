'use strict';
// =============================================================================
// HUD — builds all DOM (menus, shop, settings, HUD, touch buttons) and updates
// it. Only touches the DOM when a value actually changed.
// Visual style: chunky beveled metal panels + pixel fonts (old-school arena shooter).
// =============================================================================
const ICON = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M5 14l7-7 7 7M5 20l7-7 7 7"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M5 5l7 7 7-7M5 11l7 7 7-7"/><path d="M4 21h16"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  grapple: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6M17 7L6 18"/><path d="M6 18l-2 2M9 21l-3-3 3-3"/><circle cx="17" cy="7" r="2"/></svg>',
};

const HELP = `
  <p><b>PHONE:</b> left thumb drags to move. Right side drags to look. Hold FIRE and drag it to aim while shooting. The second fire button only shoots. Tap a weapon slot to switch; tap the slot you're holding to inspect.</p>
  <p><b>KEYBOARD:</b> WASD move · Mouse look · Click fire · Right-click aim · Space jump · Shift/C crouch/slide · G or middle-click grapple · R reload · 1/2/3 or Q switch · V inspect · E open/swap · Esc pause</p>
  <p><b>CROUCH / SLIDE:</b> one button. Tap it while running to slide in the direction you're moving (forward, sideways or backward). You can look around but not steer mid-slide. Tap it while walking or standing to crouch.</p>
  <p><b>GRAPPLE:</b> fires where you aim. Reels you in fast; let go by jumping or reaching a ledge. 5 second cooldown.</p>
  <p><b>CHESTS & PADS:</b> gold chests give a better gun plus gear. Cyan pads launch you into the air.</p>`;
const TECH_HELP = `
  <p><b>BUNNY HOP:</b> press Jump right as you land. Get the timing right and you keep all your speed. Holding Jump does nothing.</p>
  <p><b>SLIDE-HOP:</b> slide, jump, press Crouch in the air, and you slide again on landing with no cooldown. Each chain stacks speed.</p>
  <p><b>SUPER JUMP:</b> jump right as a slide starts.</p>
  <p><b>WALL CHAIN:</b> wall-jump to a different wall to refresh your wall-run.</p>
  <p><b>MANTLE BOOST:</b> jump while climbing a ledge.</p>
  <p><b>SHOTGUN JUMP:</b> fire the Breacher at your feet for a big launch, or mid-air to blast yourself the other way.</p>
  <p><b>GRAPPLE SLINGSHOT:</b> grapple, then jump before you arrive to fly off with the speed.</p>`;

BR.HUD = class HUD {
  constructor(mount) {
    const V = BR.CONFIG.version;
    mount.innerHTML = `
<div id="play">
  <canvas id="view"></canvas>
  <div id="vignette"></div>
  <div id="zone-tint"></div>
  <div id="scope"><div class="scope-ring"></div></div>
  <div id="crosshair"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><b></b></div>
  <div id="hitmarker"></div>
  <div id="dmg-dirs"></div>
  <div id="dmg-nums"></div>

  <div id="topbar">
    <div class="pill"><span class="lbl">ALIVE</span><span id="alive" class="num">20</span></div>
    <div class="pill"><span class="lbl">KILLS</span><span id="kills" class="num">0</span></div>
    <div class="pill zone"><span class="lbl" id="zone-lbl">ZONE</span><span id="zone-time" class="num">0:45</span></div>
  </div>
  <button class="btn pause" data-act="pause" aria-label="Pause">${ICON.pause}</button>
  <div id="killfeed"></div>
  <canvas id="minimap" width="220" height="220"></canvas>
  <div id="fps"></div>
  <div id="toast"></div>
  <div id="state-tag"></div>
  <div id="tech"></div>

  <div id="bottom">
    <div id="slots">
      <div class="slot" data-act="slot0"><span class="skey">1</span><span class="sname">—</span><span class="sammo"></span></div>
      <div class="slot" data-act="slot1"><span class="skey">2</span><span class="sname">—</span><span class="sammo"></span></div>
      <div class="slot knife" data-act="slot2"><span class="skey">3</span><span class="sname">Karambit</span><span class="sammo">MELEE</span></div>
    </div>
    <div id="ammo"><span id="mag" class="num">0</span><span class="sep">/</span><span id="reserve" class="num">0</span><div id="reload-bar"><i></i></div></div>
    <div id="vitals">
      <div class="bar shield"><i id="shield-fill"></i><span id="shield-txt">0</span></div>
      <div class="bar health"><i id="health-fill"></i><span id="health-txt">100</span></div>
    </div>
  </div>

  <button id="prompt" class="btn prompt hidden" data-act="interact">Swap</button>

  <div id="joy-base"><div id="joy-knob"></div></div>
  <div id="joy-hint" class="touch-only">DRAG TO MOVE</div>
  <div id="look-hint" class="touch-only">DRAG TO LOOK</div>
  <button class="btn act firel touch-only" data-act="firel" aria-label="Fire">${ICON.fire}</button>
  <button class="btn act fire touch-only" data-act="fire" aria-label="Fire">${ICON.fire}<span>FIRE</span></button>
  <button class="btn act jump touch-only" data-act="jump" aria-label="Jump">${ICON.jump}<span>JUMP</span></button>
  <button class="btn act crouch touch-only" data-act="crouch" aria-label="Crouch / Slide">${ICON.crouch}<span>CROUCH</span></button>
  <button class="btn act grapple touch-only" data-act="grapple" aria-label="Grapple">${ICON.grapple}<span>HOOK</span><em class="cd"></em></button>
  <button class="btn act reload touch-only" data-act="reload" aria-label="Reload">${ICON.reload}</button>
  <button class="btn act ads touch-only" data-act="ads" aria-label="Aim">${ICON.ads}<span>AIM</span></button>
  <button class="btn act swap touch-only" data-act="swap" aria-label="Swap weapon">${ICON.swap}</button>
</div>

<button id="fs-game" class="btn fs-btn" aria-label="Fullscreen">${ICON.fs}</button>

<div id="editor">
  <div class="ed-title">DRAG BUTTONS TO MOVE THEM. TAP ONE TO RESIZE OR HIDE IT.</div>
  <div class="ed-row">
    <span id="ed-sel" class="ed-name">Fire</span>
    <label class="ed-l">SIZE <input id="ed-size" type="range" min="36" max="140" step="2"></label>
    <label class="tg"><input id="ed-hide" type="checkbox"> HIDE</label>
  </div>
  <div class="ed-row">
    <label class="ed-l">OPACITY <input id="ed-alpha" type="range" min="0.15" max="1" step="0.05"></label>
    <button id="ed-flip" class="mbtn sm">MOVE PANEL</button>
    <button id="ed-reset" class="mbtn sm">RESET</button>
    <button id="ed-done" class="mbtn sm hot">DONE</button>
  </div>
</div>

<div id="menu" class="overlay menu">
  <div class="film"><i class="lb top"></i><i class="lb bot"></i><i class="scan"></i><i class="grain"></i><i class="cutflash"></i></div>
  <div class="menu-coins metal"><span class="coin">◉</span> <span id="menu-coins" class="num">0</span></div>
  <div class="menu-main">
    <div class="logo">
      <div class="logo-small">PROTOTYPE V${V} · OFFLINE · VS BOTS</div>
      <h1 class="chrome" data-text="VELOCITY">VELOCITY</h1>
      <h1 class="chrome two" data-text="ROYALE">ROYALE</h1>
      <div class="tagline">SLIDE · WALL-RUN · GRAPPLE · LAST ONE STANDING</div>
    </div>
    <nav class="menu-nav">
      <button id="btn-play" class="mbtn big hot">▶ PLAY</button>
      <button id="btn-shop" class="mbtn">SHOP</button>
      <button id="btn-settings" class="mbtn">SETTINGS</button>
      <button id="btn-hud" class="mbtn">CUSTOMIZE HUD</button>
      <button id="btn-fs" class="mbtn">FULLSCREEN</button>
    </nav>
  </div>
  <div class="rec"><b>●</b> LIVE MATCH FEED</div>
  <div id="rotate-hint">TURN YOUR PHONE SIDEWAYS FOR THE BEST VIEW</div>
</div>

<div id="settings" class="overlay hidden">
  <div class="panel metal wide">
    <div class="ptitle">SETTINGS</div>
    <div class="settings">
      <div class="row"><label>BOT SKILL</label><div class="seg" id="set-diff">
        <button data-v="easy">EASY</button><button data-v="normal">NORMAL</button><button data-v="hard">HARD</button></div></div>
      <div class="row"><label for="set-bots">BOTS</label><input id="set-bots" type="range" min="0" max="29" step="1"><output id="out-bots"></output></div>
      <div class="row"><label for="set-sens">LOOK SPEED</label><input id="set-sens" type="range" min="0.3" max="3" step="0.05"><output id="out-sens"></output></div>
      <div class="row"><label for="set-fov">FOV</label><input id="set-fov" type="range" min="60" max="110" step="1"><output id="out-fov"></output></div>
      <div class="row"><label>GRAPHICS</label><div class="seg" id="set-gfx">
        <button data-v="low">LOW</button><button data-v="medium">MED</button><button data-v="high">HIGH</button></div></div>
      <div class="row"><label for="set-vol">VOLUME</label><input id="set-vol" type="range" min="0" max="1" step="0.05"><output id="out-vol"></output></div>
      <div class="row toggles">
        <label class="tg"><input type="checkbox" id="set-assist"> AIM ASSIST</label>
        <label class="tg"><input type="checkbox" id="set-auto"> AUTO-FIRE</label>
        <label class="tg"><input type="checkbox" id="set-fps"> SHOW FPS</label>
      </div>
      <details class="help"><summary>CONTROLS</summary>${HELP}</details>
      <details class="help"><summary>MOVEMENT TECH</summary>${TECH_HELP}</details>
    </div>
    <button id="settings-back" class="mbtn hot">BACK</button>
  </div>
</div>

<div id="shop" class="overlay hidden">
  <div class="shop-preview-label"><span id="shop-sel-name"></span></div>
  <div class="shop-panel metal">
    <div class="shop-head">
      <div class="ptitle">SHOP</div>
      <div class="coins-pill"><span class="coin">◉</span> <span id="shop-coins" class="num">0</span></div>
    </div>
    <div id="shop-tabs" class="seg">
      <button data-cat="skins">GUN SKINS</button><button data-cat="tracers">TRACERS</button><button data-cat="charms">CHARMS</button>
    </div>
    <div id="shop-grid"></div>
    <div class="shop-foot">
      <span id="shop-msg"></span>
      <button id="shop-back" class="mbtn sm">BACK</button>
      <button id="shop-action" class="mbtn sm hot">EQUIP</button>
    </div>
  </div>
</div>

<div id="pause" class="overlay hidden">
  <div class="panel metal">
    <div class="ptitle">PAUSED</div>
    <button id="btn-resume" class="mbtn hot">RESUME</button>
    <button id="btn-settings2" class="mbtn">SETTINGS</button>
    <button id="btn-hud2" class="mbtn">CUSTOMIZE HUD</button>
    <button id="btn-quit" class="mbtn">LEAVE MATCH</button>
  </div>
</div>

<div id="fs-tip" class="overlay hidden">
  <div class="panel metal">
    <div class="ptitle">FULLSCREEN ON IPHONE</div>
    <p class="tip">Safari on iPhone doesn't let web pages go fullscreen. To play fullscreen, tap the <b>Share</b> button, choose <b>Add to Home Screen</b>, and open the game from its new Home Screen icon.</p>
    <button id="fs-tip-ok" class="mbtn hot">GOT IT</button>
  </div>
</div>

<div id="end" class="overlay hidden">
  <div class="panel metal">
    <div class="eyebrow" id="end-eyebrow">ELIMINATED</div>
    <div id="end-place" class="place">#7</div>
    <div id="end-sub" class="end-sub"></div>
    <div class="stats">
      <div><span class="num" id="end-kills">0</span><span class="lbl">KILLS</span></div>
      <div><span class="num" id="end-dmg">0</span><span class="lbl">DAMAGE</span></div>
      <div><span class="num" id="end-time">0:00</span><span class="lbl">SURVIVED</span></div>
    </div>
    <div id="end-coins" class="end-coins"></div>
    <button id="btn-again" class="mbtn hot">DROP AGAIN</button>
    <button id="btn-menu" class="mbtn">MENU</button>
  </div>
</div>`;
    const $ = id => document.getElementById(id);
    this.$ = $;
    this.el = {
      play: $('play'), alive: $('alive'), kills: $('kills'), zoneTime: $('zone-time'), zoneLbl: $('zone-lbl'),
      killfeed: $('killfeed'), minimap: $('minimap'), toast: $('toast'), fps: $('fps'),
      mag: $('mag'), reserve: $('reserve'), reloadBar: $('reload-bar'), reloadFill: $('reload-bar').firstElementChild,
      shieldFill: $('shield-fill'), healthFill: $('health-fill'), shieldTxt: $('shield-txt'), healthTxt: $('health-txt'),
      slots: Array.from(document.querySelectorAll('#slots .slot')),
      prompt: $('prompt'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), scope: $('scope'),
      dmgDirs: $('dmg-dirs'), dmgNums: $('dmg-nums'), vignette: $('vignette'), zoneTint: $('zone-tint'),
      stateTag: $('state-tag'), tech: $('tech'), adsBtn: document.querySelector('.btn.ads'),
      grapBtn: document.querySelector('.btn.grapple'), crouchBtn: document.querySelector('.btn.crouch'),
    };
    this.cache = {};
    this.mm = this.el.minimap.getContext('2d');
    this.numPool = [];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'dnum';
      this.el.dmgNums.appendChild(d);
      this.numPool.push({ el: d, life: 0, pos: new THREE.Vector3(), vy: 0 });
    }
    this.dirPool = [];
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.className = 'ddir';
      this.el.dmgDirs.appendChild(d);
      this.dirPool.push({ el: d, life: 0, angle: 0, from: null });
    }
    this.ni = 0; this.di = 0;
  }

  set(key, el, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn ? fn(el, value) : (el.textContent = value);
  }

  show(id, on) {
    if (id === 'play') { document.body.classList.toggle('in-menu', !on); return; }
    this.$(id).classList.toggle('hidden', !on);
  }

  update(game, dt) {
    const p = game.player, e = this.el;
    this.set('alive', e.alive, game.aliveCount());
    this.set('kills', e.kills, p.kills);
    const z = game.zone;
    let lbl, t;
    if (game.practice) { lbl = 'PRACTICE'; t = '∞'; }
    else if (z.state === 'done') { lbl = 'FINAL'; t = '—'; }
    else if (z.state === 'wait') { lbl = 'ZONE IN'; t = fmtTime(z.timer); }
    else { lbl = 'CLOSING'; t = fmtTime(z.timer); }
    this.set('zl', e.zoneLbl, lbl);
    this.set('zt', e.zoneTime, t);

    const A = BR.CONFIG.actor;
    this.set('hp', e.healthFill, Math.ceil(Math.max(0, p.health)), (el, v) => { el.style.transform = `scaleX(${v / A.maxHealth})`; e.healthTxt.textContent = v; });
    this.set('sh', e.shieldFill, Math.ceil(p.shield), (el, v) => { el.style.transform = `scaleX(${v / A.maxShield})`; e.shieldTxt.textContent = v; });

    const w = p.weapon, melee = w && w.def.melee;
    this.set('mag', e.mag, !w ? '–' : melee ? '∞' : w.mag);
    this.set('res', e.reserve, !w || melee ? '' : p.ammo[w.def.ammo]);
    this.set('melee', e.reserve, !!melee, (el, v) => el.parentNode.classList.toggle('melee', v));
    const rel = w && w.reloadT > 0 ? (w.def.shellReload ? w.mag / w.def.mag : 1 - w.reloadT / w.def.reload) : -1;
    this.set('rel', e.reloadBar, rel < 0 ? -1 : Math.round(rel * 40), (el, v) => {
      el.classList.toggle('on', v >= 0);
      e.reloadFill.style.transform = `scaleX(${Math.max(0, v) / 40})`;
    });
    p.slots.forEach((s, i) => {
      const key = s ? `${s.id}|${s.mag}|${i === p.cur}` : 'empty' + i + (i === p.cur);
      this.set('slot' + i, e.slots[i], key, el => {
        el.classList.toggle('active', i === p.cur && !!s);
        el.classList.toggle('empty', !s);
        el.children[1].textContent = s ? s.def.name : 'EMPTY';
        el.children[2].textContent = s ? (s.def.melee ? 'MELEE' : `${s.mag}/${s.def.mag}`) : '';
      });
    });
    this.set('ads', e.adsBtn, p.ads, (el, v) => el.classList.toggle('on-toggle', v));
    // Grapple cooldown sweep on the button
    const G = BR.CONFIG.move.grapple;
    const cd = p.mover.grapple ? -1 : Math.max(0, Math.ceil(p.grappleCd * 10) / 10);
    this.set('gcd', e.grapBtn, cd, (el, v) => {
      el.classList.toggle('cooling', v > 0);
      el.classList.toggle('hooked', v < 0);
      el.style.setProperty('--cd', v > 0 ? (v / G.cooldown * 360).toFixed(0) + 'deg' : '0deg');
      el.querySelector('.cd').textContent = v > 0 ? Math.ceil(v) : '';
    });
    const m = p.mover;
    const cLbl = m.sliding ? 'SLIDE' : m.crouched ? 'STAND' : m.speedH >= BR.CONFIG.move.runSpeed * BR.CONFIG.move.slideMinSpeed ? 'SLIDE' : 'CROUCH';
    this.set('cl', e.crouchBtn, cLbl, (el, v) => { el.querySelector('span').textContent = v; el.classList.toggle('on-toggle', m.crouched); });

    // Crosshair gap from current spread (hidden while scoped or on a holo sight)
    if (w) {
      const spread = BR.Weapons.spread(p, w);
      const px = Math.round(spread * (window.innerHeight / 2) / Math.tan(game.camera.fov * Math.PI / 360));
      this.set('cx', e.crosshair, Math.max(4, Math.min(px, 90)), (el, v) => el.style.setProperty('--gap', v + 'px'));
      this.set('cxl', e.crosshair, w.def.pattern === 'line', (el, v) => el.classList.toggle('line', v));
    }
    const scoped = p.ads && w && w.def.scope && p.alive;
    const holo = p.ads && w && w.def.holo && game.cam.ads > 0.7;
    this.set('scope', e.scope, !!scoped, el => el.classList.toggle('on', !!scoped));
    this.set('xh', e.crosshair, !!(scoped || holo), (el, v) => el.classList.toggle('hide', v));

    // Low health vignette + storm tint
    const hurt = 1 - Math.max(0, p.health) / A.maxHealth;
    this.set('vig', e.vignette, Math.round(hurt * 20), (el, v) => (el.style.opacity = Math.max(0, (v / 20) - 0.25)));
    this.set('zt2', e.zoneTint, p.alive && !game.practice && z.outside(p.pos), (el, v) => el.classList.toggle('on', v));

    // Movement state tag
    const tag = m.dropping ? 'SKYDIVE' : m.grapple ? 'GRAPPLE' : m.wallRunning ? 'WALL-RUN' : m.sliding ? 'SLIDE' : '';
    this.set('tag', e.stateTag, tag, (el, v) => { el.textContent = v; el.classList.toggle('on', !!v); });

    this.updateNums(game, dt);
    this.updateDirs(game, dt);
    this.drawMinimap(game);
  }

  fps(v, on) {
    this.set('fps', this.el.fps, on ? Math.round(v) + ' fps' : '');
  }

  killfeed(html) {
    const d = document.createElement('div');
    d.className = 'kf';
    d.innerHTML = html;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 5000);
    setTimeout(() => d.remove(), 6000);
  }

  toast(text, ms) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this._toastTO);
    this._toastTO = setTimeout(() => t.classList.remove('on'), ms || 1800);
  }

  hitmarker(head, kill) {
    const h = this.el.hitmarker;
    h.className = '';
    void h.offsetWidth;
    h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
  }

  // Movement-tech callout under the crosshair
  tech(text) {
    const t = this.el.tech;
    t.textContent = text;
    t.className = '';
    void t.offsetWidth;
    t.className = 'on';
  }

  prompt(text) {
    this.set('prompt', this.el.prompt, text || '', (el, v) => { el.textContent = v; el.classList.toggle('hidden', !v); });
  }

  damageNumber(pos, dmg, head) {
    const n = this.numPool[this.ni++ % this.numPool.length];
    n.pos.copy(pos);
    n.life = 0.8;
    n.el.textContent = Math.round(dmg);
    n.el.classList.toggle('head', !!head);
    n.el.style.opacity = 1;
  }

  updateNums(game, dt) {
    const cam = game.camera, v = game._v4, W = window.innerWidth, H = window.innerHeight;
    for (const n of this.numPool) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.pos.y += dt * 0.8;
      v.copy(n.pos).project(cam);
      if (n.life <= 0 || v.z > 1) { n.el.style.opacity = 0; n.life = 0; continue; }
      n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px) translate(-50%, -50%)`;
      n.el.style.opacity = Math.min(1, n.life * 3);
    }
  }

  damageFrom(attacker) {
    const d = this.dirPool[this.di++ % this.dirPool.length];
    d.from = attacker;
    d.life = 1.2;
  }

  updateDirs(game, dt) {
    const p = game.player;
    for (const d of this.dirPool) {
      if (d.life <= 0) { if (d.el.style.opacity !== '0') d.el.style.opacity = 0; continue; }
      d.life -= dt;
      if (d.from) {
        const dx = d.from.pos.x - p.pos.x, dz = d.from.pos.z - p.pos.z;
        const world = Math.atan2(-dx, -dz);
        d.angle = -BR.util.wrapAngle(world - p.yaw);
      }
      d.el.style.transform = `translate(-50%, -50%) rotate(${d.angle}rad)`;
      d.el.style.opacity = Math.min(1, d.life * 1.5);
    }
  }

  setStaticMap(img) { this.mapImg = img; }

  drawMinimap(game) {
    const c = this.mm, S = 220, w = game.world, k = S / w.size, H = w.half;
    this._mmT = (this._mmT || 0) + 1;
    if (this._mmT % 3) return; // 20 Hz is plenty
    c.clearRect(0, 0, S, S);
    if (this.mapImg) c.drawImage(this.mapImg, 0, 0, S, S);
    const z = game.zone;
    // storm outside the circle
    c.save();
    c.fillStyle = 'rgba(122,92,255,0.38)';
    c.beginPath();
    c.rect(0, 0, S, S);
    c.arc((z.x + H) * k, (z.z + H) * k, Math.max(z.r, 0) * k, 0, Math.PI * 2, true);
    c.fill('evenodd');
    c.restore();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath(); c.arc((z.x + H) * k, (z.z + H) * k, Math.max(z.r, 0) * k, 0, Math.PI * 2); c.stroke();
    if (z.state !== 'done') {
      c.setLineDash([5, 4]);
      c.strokeStyle = '#ffd27a';
      c.beginPath(); c.arc((z.nextX + H) * k, (z.nextZ + H) * k, Math.max(z.nextR, 0.5) * k, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    // Recently heard gunfire shows as red ticks
    for (const s of game.recentShots) {
      c.fillStyle = `rgba(255,90,90,${Math.max(0, 1 - (game.time - s.t) / 2)})`;
      c.fillRect((s.x + H) * k - 2, (s.z + H) * k - 2, 4, 4);
    }
    // player arrow
    const p = game.player;
    const px = (p.pos.x + H) * k, pz = (p.pos.z + H) * k;
    c.save();
    c.translate(px, pz);
    c.rotate(-p.yaw);
    c.fillStyle = '#ffb547';
    c.strokeStyle = '#1a1206';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(0, 3); c.lineTo(-5.5, 6); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }

  showEnd(r) {
    const $ = this.$;
    $('end-eyebrow').textContent = r.win ? 'VICTORY' : 'ELIMINATED';
    $('end-place').textContent = r.win ? '#1' : '#' + r.place;
    $('end-sub').textContent = r.win ? `Last one standing out of ${r.total}.` : `${r.by} · out of ${r.total}`;
    $('end-kills').textContent = r.kills;
    $('end-dmg').textContent = Math.round(r.damage);
    $('end-time').textContent = fmtTime(r.time);
    $('end').classList.toggle('win', !!r.win);
    const ec = $('end-coins');
    if (r.coins) {
      ec.innerHTML = r.coins.parts.map(p => `<div><span>${p[0]}</span><b>+${p[1]}</b></div>`).join('') +
        `<div class="tot"><span>COINS EARNED</span><b>◉ +${r.coins.total}</b></div>`;
      if (r.coins.total > 0) BR.Audio.coin();
    } else ec.innerHTML = '<div class="tot"><span>PRACTICE · NO COINS</span><b></b></div>';
    this.show('end', true);
  }
};

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
BR.fmtTime = fmtTime;
