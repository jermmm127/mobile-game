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
  knife: '<svg viewBox="0 0 24 24"><path d="M4 20c2-1 4-1 6-3l9-11c1-1 1-2 0-3-3 2-7 6-10 9l-2 4"/><circle cx="5.5" cy="18.5" r="1.6"/></svg>',
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
  <div id="crosshair" class="xh"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><b></b><u></u></div>
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
  <button class="btn mapbtn" data-act="map" aria-label="Map"><canvas id="minimap" width="220" height="220"></canvas></button>
  <div id="bigmap"><canvas id="bigmap-cv" width="720" height="720"></canvas><div class="bm-hint">Tap the minimap to close</div></div>
  <div id="loc"></div>
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
  <button class="btn act firel touch-only" data-act="firel" aria-label="Fire">${ICON.fire}</button>
  <button class="btn act fire touch-only" data-act="fire" aria-label="Fire">${ICON.fire}<span>FIRE</span></button>
  <button class="btn act jump touch-only" data-act="jump" aria-label="Jump">${ICON.jump}<span>JUMP</span></button>
  <button class="btn act crouch cdable touch-only" data-act="crouch" aria-label="Crouch / Slide">${ICON.crouch}<span>CROUCH</span></button>
  <button class="btn act grapple cdable touch-only" data-act="grapple" aria-label="Grapple">${ICON.grapple}<span>HOOK</span><em class="cd"></em></button>
  <button class="btn act reload touch-only" data-act="reload" aria-label="Reload">${ICON.reload}</button>
  <button class="btn act ads touch-only" data-act="ads" aria-label="Aim">${ICON.ads}<span>AIM</span></button>
  <button class="btn act swap touch-only" data-act="swap" aria-label="Swap weapon">${ICON.swap}</button>
  <button class="btn act knife touch-only" data-act="knife" aria-label="Knife">${ICON.knife}<span>KNIFE</span></button>
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
  <div class="menu-coins glass"><i class="coin"></i><span id="menu-coins" class="num">0</span></div>
  <button id="acct-chip" class="acct-chip glass"><span id="acct-avatar" class="avatar">G</span><span class="acct-text"><b id="acct-name">Guest</b><small id="acct-sub">Sign in</small></span></button>
  <div class="menu-main">
    <div class="logo">
      <div class="logo-small">Prototype v${V} · Offline vs bots</div>
      <h1 class="logo-title"><span>Velocity</span><span class="accent">Royale</span></h1>
      <div class="tagline">Slide. Wall-run. Grapple. Be the last one standing.</div>
    </div>
    <nav class="menu-nav">
      <button id="btn-play" class="mbtn big hot"><svg viewBox="0 0 24 24" class="play-ic"><path d="M8 5l11 7-11 7z"/></svg>Play</button>
      <button id="btn-shop" class="mbtn">SHOP</button>
      <button id="btn-settings" class="mbtn">SETTINGS</button>
      <button id="btn-hud" class="mbtn">CUSTOMIZE HUD</button>
      <button id="btn-fs" class="mbtn">FULLSCREEN</button>
    </nav>
  </div>
  <div class="rec"><b></b>Live match</div>
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
      <details class="help xh-set"><summary>CROSSHAIR</summary>
        <div class="xh-wrap">
          <div class="xh-prev"><div id="xh-prev" class="xh"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><b></b><u></u></div></div>
          <div class="xh-ctl">
            <div class="seg" id="xh-style"><button data-v="cross">CROSS</button><button data-v="crossdot">CROSS+DOT</button><button data-v="dot">DOT</button><button data-v="circle">CIRCLE</button><button data-v="tee">T</button></div>
            <div class="swatches" id="xh-color">
              <button data-v="#ffffff" style="--c:#ffffff" aria-label="White"></button><button data-v="#4dff6a" style="--c:#4dff6a" aria-label="Green"></button>
              <button data-v="#39e1ff" style="--c:#39e1ff" aria-label="Cyan"></button><button data-v="#ffe14d" style="--c:#ffe14d" aria-label="Yellow"></button>
              <button data-v="#ffb224" style="--c:#ffb224" aria-label="Orange"></button><button data-v="#ff4d5e" style="--c:#ff4d5e" aria-label="Red"></button>
              <button data-v="#ff5cf0" style="--c:#ff5cf0" aria-label="Pink"></button>
            </div>
            <div class="row"><label for="xh-len">LENGTH</label><input id="xh-len" type="range" min="2" max="24" step="1"><output id="xh-len-o"></output></div>
            <div class="row"><label for="xh-thick">THICKNESS</label><input id="xh-thick" type="range" min="1" max="6" step="1"><output id="xh-thick-o"></output></div>
            <div class="row"><label for="xh-gap">GAP</label><input id="xh-gap" type="range" min="0" max="24" step="1"><output id="xh-gap-o"></output></div>
            <div class="row"><label for="xh-op">OPACITY</label><input id="xh-op" type="range" min="0.2" max="1" step="0.05"><output id="xh-op-o"></output></div>
            <div class="row toggles">
              <label class="tg"><input type="checkbox" id="xh-dot"> CENTER DOT</label>
              <label class="tg"><input type="checkbox" id="xh-ol"> OUTLINE</label>
              <label class="tg"><input type="checkbox" id="xh-dyn"> SPREAD MOVES IT</label>
            </div>
          </div>
        </div>
      </details>
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
      <div class="coins-pill"><i class="coin"></i><span id="shop-coins" class="num">0</span></div>
    </div>
    <div id="shop-tabs" class="seg">
      <button data-cat="blueprints">BLUEPRINTS</button><button data-cat="skins">CAMOS</button><button data-cat="tracers">TRACERS</button><button data-cat="charms">CHARMS</button><button data-cat="gloves">GLOVES</button>
    </div>
    <div id="shop-weps" class="chips"></div>
    <div id="shop-grid"></div>
    <div class="shop-foot">
      <span id="shop-msg"></span>
      <button id="shop-back" class="mbtn sm">BACK</button>
      <button id="shop-action" class="mbtn sm hot">EQUIP</button>
    </div>
  </div>
</div>

<div id="account" class="overlay hidden">
  <div class="panel metal acct">
    <div class="ptitle">ACCOUNT</div>
    <div id="acct-out">
      <div class="seg" id="acct-tabs"><button data-v="login">SIGN IN</button><button data-v="signup">CREATE ACCOUNT</button></div>
      <form id="acct-form" autocomplete="on">
        <label for="acct-user">Username</label>
        <input id="acct-user" name="username" type="text" autocomplete="username" maxlength="16" autocapitalize="off" spellcheck="false">
        <label for="acct-pass">Password</label>
        <input id="acct-pass" name="password" type="password" autocomplete="current-password" maxlength="64">
        <button id="acct-submit" class="mbtn hot" type="submit">Sign in</button>
      </form>
      <p class="fine">Accounts are saved on this device for now. Coins, skins and stats are kept per account.</p>
    </div>
    <div id="acct-in" class="hidden">
      <div class="acct-me"><span id="acct-me"></span><span id="acct-dev" class="dev-badge hidden">DEV</span></div>
      <div class="acct-row"><span>Coins</span><b><i class="coin"></i><span id="acct-coins"></span></b></div>
      <div class="acct-row"><span>Record</span><b id="acct-stats"></b></div>
      <label for="acct-code">Redeem a code</label>
      <div class="code-row"><input id="acct-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XX-XXX-XXXX"><button id="acct-redeem" class="mbtn sm">REDEEM</button></div>
      <button id="acct-logout" class="mbtn">LOG OUT</button>
    </div>
    <div id="acct-msg" class="acct-msg" role="status"></div>
    <button id="acct-close" class="mbtn">CLOSE</button>
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
    this.bm = $('bigmap-cv').getContext('2d');
    this.el.bigmap = $('bigmap'); this.el.loc = $('loc');
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
    // Super jump cooldown sweep on the crouch/slide button
    const sj = Math.max(0, Math.ceil(m.superCd * 10) / 10);
    this.set('sjcd', e.crouchBtn, sj, (el, v) => {
      el.classList.toggle('cooling', v > 0);
      el.style.setProperty('--cd', (v / BR.CONFIG.move.tech.superJumpCooldown * 360).toFixed(0) + 'deg');
    });
    const cLbl = m.sliding ? 'SLIDE' : m.crouched ? 'STAND' : m.speedH >= BR.CONFIG.move.runSpeed * BR.CONFIG.move.slideMinSpeed ? 'SLIDE' : 'CROUCH';
    this.set('cl', e.crouchBtn, cLbl, (el, v) => { el.querySelector('span').textContent = v; el.classList.toggle('on-toggle', m.crouched); });

    // Crosshair gap from current spread (hidden while scoped or on a holo sight)
    if (w) {
      const spread = BR.Weapons.spread(p, w);
      const X = BR.xh || {};
      const px = X.dyn === false ? 0 : Math.round(spread * (window.innerHeight / 2) / Math.tan(game.camera.fov * Math.PI / 360));
      this.set('cx', e.crosshair, Math.min((X.gap ?? 6) + px, 90), (el, v) => el.style.setProperty('--gap', v + 'px'));
      this.set('cxl', e.crosshair, w.def.pattern === 'line', (el, v) => el.classList.toggle('line', v));
    }
    const scoped = p.ads && w && w.def.scope && p.alive;
    const holo = p.ads && w && !w.def.scope && !w.def.melee && game.vmr.adsW > 0.7; // sights replace the crosshair
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

  toggleMap(on) {
    this.bigOpen = on === undefined ? !this.bigOpen : on;
    this.el.bigmap.classList.toggle('on', this.bigOpen);
  }

  // Location banner when you enter a named place
  location(name) {
    const l = this.el.loc;
    l.textContent = name;
    l.classList.remove('on'); void l.offsetWidth; l.classList.add('on');
  }

  // Shared map painter: draws the world image, storm, names and player into a
  // square view centred on (cx, cz) that is `view` meters wide.
  paintMap(c, S, game, cx, cz, view, labels) {
    const w = game.world, H = w.half, k = S / view;
    const X = x => (x - cx) * k + S / 2, Z = z => (z - cz) * k + S / 2;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#26331f'; c.fillRect(0, 0, S, S);
    if (this.mapImg) {
      const ik = this.mapImg.width / w.size;
      const sx = (cx - view / 2 + H) * ik, sz = (cz - view / 2 + H) * ik;
      c.drawImage(this.mapImg, sx, sz, view * ik, view * ik, 0, 0, S, S);
    }
    const z = game.zone;
    if (!game.practice) {
      c.save();
      c.fillStyle = 'rgba(138,107,255,0.36)';
      c.beginPath(); c.rect(0, 0, S, S);
      c.arc(X(z.x), Z(z.z), Math.max(z.r, 0) * k, 0, Math.PI * 2, true);
      c.fill('evenodd');
      c.restore();
      c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, S / 150);
      c.beginPath(); c.arc(X(z.x), Z(z.z), Math.max(z.r, 0) * k, 0, Math.PI * 2); c.stroke();
      if (z.state !== 'done') {
        c.setLineDash([6, 5]); c.strokeStyle = '#ffd27a';
        c.beginPath(); c.arc(X(z.nextX), Z(z.nextZ), Math.max(z.nextR, 0.5) * k, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
    }
    if (labels) {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 ${Math.round(S / 34)}px "Saira Semi Condensed", sans-serif`;
      for (const p of w.pois || []) {
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(p.name.toUpperCase(), X(p.x), Z(p.z));
        c.fillStyle = '#fff'; c.fillText(p.name.toUpperCase(), X(p.x), Z(p.z));
      }
    }
    for (const s of game.recentShots) {
      c.fillStyle = `rgba(255,90,90,${Math.max(0, 1 - (game.time - s.t) / 2)})`;
      c.fillRect(X(s.x) - 2, Z(s.z) - 2, 4, 4);
    }
    const p = game.player, sz = Math.max(7, S / 40);
    c.save();
    c.translate(X(p.pos.x), Z(p.pos.z));
    c.rotate(-p.yaw);
    c.fillStyle = '#ffb224'; c.strokeStyle = '#1a1206'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -sz); c.lineTo(sz * 0.7, sz * 0.75); c.lineTo(0, sz * 0.38); c.lineTo(-sz * 0.7, sz * 0.75); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }

  drawMinimap(game) {
    this._mmT = (this._mmT || 0) + 1;
    if (this._mmT % 3) return; // 20 Hz is plenty
    const p = game.player, w = game.world, view = 220, H = w.half;
    // Zoomed window that follows you (clamped to the map)
    const cx = BR.util.clamp(p.pos.x, -H + view / 2, H - view / 2), cz = BR.util.clamp(p.pos.z, -H + view / 2, H - view / 2);
    this.paintMap(this.mm, 220, game, cx, cz, view, false);
    if (this.bigOpen) this.paintMap(this.bm, 720, game, 0, 0, w.size, true);
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
        `<div class="tot"><span>Coins earned</span><b><i class="coin"></i>+${r.coins.total}</b></div>`;
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
