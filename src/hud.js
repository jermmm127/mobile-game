'use strict';
// =============================================================================
// HUD — builds all DOM (menus, shop, settings, HUD, touch buttons) and updates
// it. Only touches the DOM when a value actually changed.
// Visual style: chunky beveled metal panels + pixel fonts (old-school arena shooter).
// =============================================================================
// Weapon silhouettes for the slot cards (viewBox 0 0 64 24, filled with currentColor)
const WICON_PATHS = {
  pistol: 'M8 6h30v7H24l-2 9h-8l2-9h-8z M38 8h4v3h-4z',
  smg: 'M4 7h40v6H31v3h-4l-1 7h-7l1-7h-3l-2-3H4z M44 9h12v2H44z M18 3h10v4H18z',
  shotgun: 'M2 8h58v5H26l-2 9h-8l2-9H2z M30 14h22v3H30z',
  rifle: 'M2 8h60v4H42v3h-9v8h-6l-1-8H18l-3 7H7l3-7H2z M26 4h8v4h-8z',
  holoar: 'M2 9h60v4H42v3h-9v7h-6l-1-7H18l-3 7H7l3-7H2z M22 2h14v7H22z M25 4h8v3h-8z',
  sniper: 'M0 10h64v3H40v2h-6l-1 8h-6l-1-8H16l-3 6H6l3-6H0z M18 4h22v5H18z',
  hunter: 'M0 10h62v2H40c-7 0-11 3-15 9h-9c3-4 7-8 10-9H0z M30 8h6v2h-6z',
  knife: 'M28 6a4 4 0 1 1 0.1 0z M24 9l8 2c-2 8-8 12-18 12 7-3 10-8 10-14z',
};
const WICON = id => `<svg viewBox="0 0 64 24"><path d="${WICON_PATHS[id] || WICON_PATHS.pistol}" fill-rule="evenodd"/></svg>`;

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
  spawn: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>',
  nade: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="6"/><path d="M12 8V5M10 5h4M17 9l2-2"/><circle cx="12" cy="14" r="2.2"/></svg>',
  stim: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6M17 7l-9 9-3 1 1-3 9-9"/><path d="M12 9l3 3M4 20l2-2"/></svg>',
  grapple: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6M17 7L6 18"/><path d="M6 18l-2 2M9 21l-3-3 3-3"/><circle cx="17" cy="7" r="2"/></svg>',
};

const HELP = `
  <p><b>PHONE:</b> left thumb drags to move. Right side drags to look. Hold FIRE and drag it to aim while shooting. The second fire button only shoots. Tap a weapon slot to switch; tap the slot you're holding to inspect.</p>
  <p><b>KEYBOARD:</b> F stim · WASD move · Mouse look · Click fire · Right-click aim · Space jump · Shift/C crouch/slide · G or middle-click grapple · R reload · 1/2/3 or Q switch · V inspect · E open/swap · Esc pause</p>
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
  <div id="speedvig"></div>
  <div id="speedfx"></div>
  <div id="stimfx"></div>
  <div id="shockfx"></div>
  <div id="scope"><div class="scope-ring"></div></div>
  <div id="crosshair" class="xh"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><b></b><u></u></div>
  <div id="hitmarker"></div>
  <div id="hitcrit"></div>
  <div id="dmg-dirs"></div>
  <div id="dmg-nums"></div>

  <div id="topbar">
    <div class="pill"><span class="lbl">ALIVE</span><span id="alive" class="num">20</span></div>
    <div class="pill"><span class="lbl">KILLS</span><span id="kills" class="num">0</span></div>
    <div class="pill zone"><span class="lbl" id="zone-lbl">ZONE</span><span id="zone-time" class="num">0:45</span></div>
    <div class="pill dp you"><span class="lbl">YOU</span><span id="d-you" class="num">0</span></div>
    <div class="pill dp dtime"><span class="lbl" id="d-round">R1 · FT5</span><span id="d-time" class="num">1:30</span></div>
    <div class="pill dp bot"><span class="lbl">BOT</span><span id="d-bot" class="num">0</span></div>
  </div>
  <div id="duelcount"></div>
  <div id="duelbanner"><b></b><span></span></div>
  <button class="btn pause" data-act="pause" aria-label="Pause">${ICON.pause}</button>
  <div id="killfeed"></div>
  <button class="btn mapbtn" data-act="map" aria-label="Minimap"><canvas id="minimap" width="220" height="220"></canvas></button>
  <div id="bigmap"><canvas id="bigmap-cv" width="720" height="720"></canvas><div class="bm-hint">Tap the minimap to close</div></div>
  <div id="loc"></div>
  <div id="fps"></div>
  <div id="toast"></div>
  <div id="state-tag"></div>
  <div id="tech"></div>

  <div class="slot s0" data-act="slot0" aria-label="Weapon slot 1"><span class="skey">1</span><i class="sicon"></i><span class="sline"><span class="sname">—</span><span class="sammo"></span></span><b class="sbar"><i></i></b></div>
  <div class="slot s1" data-act="slot1" aria-label="Weapon slot 2"><span class="skey">2</span><i class="sicon"></i><span class="sline"><span class="sname">—</span><span class="sammo"></span></span><b class="sbar"><i></i></b></div>
  <div class="slot s2 knife" data-act="slot2" aria-label="Karambit slot"><span class="skey">3</span><i class="sicon"></i><span class="sline"><span class="sname">Karambit</span><span class="sammo"></span></span><b class="sbar"><i></i></b></div>
  <div id="bottom">
    <div id="ammo"><span id="mag" class="num">0</span><span class="sep">/</span><span id="reserve" class="num">0</span><div id="reload-bar"><i></i></div></div>
    <div id="vitals">
      <div class="bar shield"><i id="shield-fill"></i><span id="shield-txt">0</span></div>
      <div class="bar health"><i id="health-fill"></i><span id="health-txt">100</span></div>
    </div>
  </div>

  <button id="prompt" class="btn prompt hidden" data-act="interact" aria-label="Pickup / open button">Swap</button>

  <div id="joy-base"><div id="joy-knob"></div></div>
  <button class="btn act firel touch-only" data-act="firel" aria-label="Fire">${ICON.fire}</button>
  <button class="btn act fire touch-only" data-act="fire" aria-label="Fire">${ICON.fire}<span>FIRE</span></button>
  <button class="btn act jump touch-only" data-act="jump" aria-label="Jump">${ICON.jump}<span>JUMP</span></button>
  <button class="btn act crouch cdable touch-only" data-act="crouch" aria-label="Crouch / Slide">${ICON.crouch}<span>CROUCH</span></button>
  <button class="btn act grapple cdable touch-only" data-act="grapple" aria-label="Grapple">${ICON.grapple}<span>HOOK</span><em class="cd"></em></button>
  <button class="btn act nade touch-only" data-act="grenade" aria-label="Shockwave grenade">${ICON.nade}<span>NADE</span><em class="cnt">0</em></button>
  <button class="btn act stim cdable touch-only" data-act="stim" aria-label="Stim">${ICON.stim}<span>STIM</span><em class="cd"></em></button>
  <button class="btn act reload touch-only" data-act="reload" aria-label="Reload">${ICON.reload}</button>
  <button class="btn act ads touch-only" data-act="ads" aria-label="Aim">${ICON.ads}<span>AIM</span></button>
  <button class="btn act swap touch-only" data-act="swap" aria-label="Swap weapon">${ICON.swap}</button>
  <button class="btn act knife touch-only" data-act="knife" aria-label="Knife">${ICON.knife}<span>KNIFE</span></button>
  <button class="btn act spawnbtn practice-only" data-act="spawnmenu" aria-label="Spawn menu">${ICON.spawn}<span>SPAWN</span></button>
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
      <div class="logo-small"><i class="dot"></i>Season 1 · v${V}</div>
      <h1 class="logo-title"><span>Velocity</span><span class="accent">Royale</span></h1>
      <div class="tagline">Slide. Wall-run. Grapple. Be the last one standing.</div>
    </div>
    <nav class="menu-nav">
      <div class="modes">
        <button id="btn-play" class="mode hero">
          <span class="m-tag">BATTLE ROYALE</span>
          <span class="m-title">PLAY</span>
          <span class="m-sub">Solo · one life · last one standing</span>
          <span class="m-go"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span>
        </button>
        <button id="btn-duel" class="mode duel">
          <span class="m-tag">NEW MODE</span>
          <span class="m-title">1V1 DUEL</span>
          <span class="m-sub">The Yard · first to 5</span>
          <span class="m-vs"><b>VS</b></span>
        </button>
        <button id="btn-practice" class="mode practice">
          <span class="m-tag">TRAINING</span>
          <span class="m-title">PRACTICE</span>
          <span class="m-sub">No bots · spawn anything</span>
        </button>
      </div>
      <div class="dock">
        <button id="btn-cases" class="dk cases"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M12 8v12M8 8l1-3h6l1 3"/></svg><span>CASES</span><em>NEW</em></button>
        <button id="btn-inv" class="dk inv"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span>INVENTORY</span></button>
        <button id="btn-shop" class="dk shop"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span>SHOP</span></button>
        <button id="btn-ranks" class="dk ranks"><svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg><span>RANKED</span></button>
        <button id="btn-settings" class="dk"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg><span>SETTINGS</span></button>
        <button id="btn-hud" class="dk"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/></svg><span>HUD</span></button>
        <button id="btn-fs" class="dk"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>FULL</span></button>
      </div>
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
      <div class="row"><label for="set-smooth">AIM SMOOTHING</label><input id="set-smooth" type="range" min="0" max="1" step="0.05"><output id="out-smooth"></output></div>
      <div class="row"><label for="set-stretch">STRETCHED RES</label><input id="set-stretch" type="range" min="0" max="1" step="0.05"><output id="out-stretch"></output></div>
      <div class="row"><label for="set-sat">SATURATION</label><input id="set-sat" type="range" min="0" max="2" step="0.05"><output id="out-sat"></output></div>
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
      <button data-cat="blueprints">BLUEPRINTS</button><button data-cat="skins">CAMOS</button><button data-cat="tracers">TRACERS</button><button data-cat="charms">CHARMS</button><button data-cat="gloves">GLOVES</button><button data-cat="feeds">KILL FEED</button>
    </div>
    <div id="shop-weps" class="chips"></div>
    <div id="shop-grid"></div>
    <div class="shop-foot">
      <span id="shop-msg"></span>
      <button id="shop-inv" class="mbtn sm">INVENTORY</button>
      <button id="shop-back" class="mbtn sm">BACK</button>
      <button id="shop-action" class="mbtn sm hot">EQUIP</button>
    </div>
  </div>
</div>

<div id="inventory" class="overlay hidden">
  <div class="inv-stage" id="inv-stage">
    <div class="inv-label"><span class="rar" id="inv-rar"></span><b id="inv-name"></b><small id="inv-sub"></small></div>
    <div class="inv-feed hidden" id="inv-feed"></div>
    <div class="inv-hint"><svg viewBox="0 0 24 24"><path d="M9 11V5a2 2 0 0 1 4 0v5M13 10V8a2 2 0 0 1 4 0v4M9 11l-1.5-1.5a2 2 0 0 0-3 2.6L9 17c1.5 2 3 3 6 3a5 5 0 0 0 5-5v-3a2 2 0 0 0-3 0"/></svg>Drag to inspect · pinch / scroll to zoom · double-tap to reset</div>
  </div>
  <div class="shop-panel metal">
    <div class="shop-head"><div class="ptitle">INVENTORY</div><div class="coins-pill"><span id="inv-count" class="num">0</span>&nbsp;items</div></div>
    <div id="inv-tabs" class="seg">
      <button data-cat="blueprints">BLUEPRINTS</button><button data-cat="skins">CAMOS</button><button data-cat="tracers">TRACERS</button><button data-cat="gloves">GLOVES</button><button data-cat="charms">CHARMS</button><button data-cat="feeds">KILL FEED</button>
    </div>
    <div id="inv-weps" class="chips"></div>
    <div id="inv-grid"></div>
    <div class="shop-foot">
      <span id="inv-msg"></span>
      <button id="inv-back" class="mbtn sm">BACK</button>
      <button id="inv-action" class="mbtn sm hot">EQUIP</button>
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

<div id="spawnmenu" class="overlay hidden">
  <div class="panel metal wide spawn">
    <button id="sp-x" class="xbtn" aria-label="Close spawn menu">✕</button>
    <div class="ptitle">SPAWN</div>
    <div class="sp-sec">WEAPONS</div>
    <div class="sp-grid" id="sp-weapons"></div>
    <div class="sp-sec">ITEMS</div>
    <div class="sp-grid">
      <button class="mbtn sm" data-sp="ammo">FULL AMMO</button>
      <button class="mbtn sm" data-sp="heal">FULL HEALTH + SHIELD</button>
      <button class="mbtn sm" data-sp="nades">SHOCKWAVE NADES ×3</button>
      <button class="mbtn sm" data-sp="item" data-arg="shock">DROP SHOCKWAVE</button>
      <button class="mbtn sm" data-sp="item" data-arg="heal">MEDKIT</button>
      <button class="mbtn sm" data-sp="item" data-arg="shield">SHIELD CELL</button>
      <button class="mbtn sm" data-sp="item" data-arg="ammo">AMMO BOX</button>
      <button class="mbtn sm" data-sp="chest">CHEST</button>
    </div>
    <div class="sp-sec">BOTS</div>
    <div class="sp-grid">
      <button class="mbtn sm" data-sp="bot" data-arg="dummy">DUMMY · STANDS STILL, NO SHOOTING</button>
      <button class="mbtn sm" data-sp="bot" data-arg="moving">MOVING DUMMY · NO SHOOTING</button>
      <button class="mbtn sm hot" data-sp="bot" data-arg="combat">COMBAT BOT · SHOOTS BACK</button>
      <button class="mbtn sm" data-sp="clearbots">CLEAR ALL BOTS</button>
    </div>
    <div class="sp-sec">MOVEMENT</div>
    <div class="sp-grid">
      <button class="mbtn sm" data-sp="skydive">SKYDIVE FROM 110 M</button>
      <button class="mbtn sm" data-sp="teleport">TELEPORT TO A LOCATION</button>
    </div>
    <button id="sp-close" class="mbtn hot">BACK TO PRACTICE</button>
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

<div id="queue" class="overlay hidden">
  <div class="panel metal q-panel">
    <div class="eyebrow">BATTLE ROYALE · SOLO</div>
    <div class="q-title">FINDING MATCH</div>
    <div class="q-ring"><span></span></div>
    <div class="q-count"><b id="q-n">1</b> / <span id="q-total">30</span> PLAYERS</div>
    <div class="q-bar"><i id="q-fill"></i></div>
    <div class="q-tip" id="q-tip">One life. If you go down, you're out.</div>
    <button id="q-cancel" class="mbtn">CANCEL</button>
  </div>
</div>

<div id="cases" class="overlay hidden">
  <div class="panel metal wide cases-panel">
    <button id="cs-x" class="xbtn" aria-label="Close">✕</button>
    <div class="cs-head"><div class="ptitle">RELEASE CASE</div><div class="coins-pill"><i class="coin"></i><span id="cs-coins" class="num">0</span></div></div>
    <div class="cs-stage">
      <div class="cs-case" id="cs-case"><div class="cs-lid"></div><div class="cs-body"><b>RELEASE</b><span>CASE · SEASON 1</span></div><i class="cs-shine"></i></div>
      <div class="cs-reel hidden" id="cs-reel"><div class="cs-strip" id="cs-strip"></div><i class="cs-mark"></i></div>
    </div>
    <div class="cs-result hidden" id="cs-result"></div>
    <div class="cs-actions"><button id="cs-open" class="mbtn hot">OPEN · <i class="coin"></i>600</button><button id="cs-equip" class="mbtn hidden">EQUIP</button><button id="cs-inspect" class="mbtn hidden">INSPECT</button></div>
    <div class="sp-sec">CONTENTS · EXCLUSIVE TO THIS CASE</div>
    <div class="cs-odds" id="cs-odds"></div>
    <div class="cs-grid" id="cs-grid"></div>
  </div>
</div>

<div id="ranks" class="overlay hidden">
  <div class="panel metal wide ranks-panel">
    <button id="rk-x" class="xbtn" aria-label="Close">✕</button>
    <div class="ptitle">RANKED</div>
    <div id="rk-me" class="rk-me"></div>
    <div class="sp-sec">LEADERBOARD · SEASON 1</div>
    <div id="rk-board" class="rk-board"></div>
    <div class="dm-note">Earn RP in every match: placement + kills in Battle Royale, wins in 1v1 Duels. Reaching Gold, Diamond, Master and Predator unlocks exclusive kill feed banners.</div>
  </div>
</div>

<div id="duelmenu" class="overlay hidden">
  <div class="panel metal wide duel">
    <button id="dm-x" class="xbtn" aria-label="Close">✕</button>
    <div class="ptitle" id="dm-title">1V1 DUEL</div>
    <div class="dm-sub" id="dm-sub">The Yard · you vs a bot · pick your loadout</div>
    <div class="dm-setup">
      <div class="row"><label>OPPONENT</label><div class="seg" id="dm-diff"><button data-v="easy">EASY</button><button data-v="normal">MEDIUM</button><button data-v="hard">HARD</button></div></div>
      <div class="row"><label>FIRST TO</label><div class="seg" id="dm-target"><button data-v="3">3</button><button data-v="5">5</button><button data-v="7">7</button></div></div>
      <div class="row"><label>ROUND TIME</label><div class="seg" id="dm-time"><button data-v="60">60s</button><button data-v="90">90s</button><button data-v="120">120s</button></div></div>
    </div>
    <div class="sp-sec">PRIMARY</div><div class="sp-grid dm-guns" id="dm-g0"></div>
    <div class="sp-sec">SECONDARY</div><div class="sp-grid dm-guns" id="dm-g1"></div>
    <div class="dm-note">Karambit, stim and grapple always come with you. Everyone gets 100 HP + 50 shield.</div>
    <button id="dm-go" class="mbtn hot">START DUEL</button>
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
    <button id="btn-again" class="mbtn hot">QUEUE NEW MATCH</button>
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
      slots: Array.from(document.querySelectorAll('#play > .slot')),
      prompt: $('prompt'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), scope: $('scope'),
      dmgDirs: $('dmg-dirs'), dmgNums: $('dmg-nums'), vignette: $('vignette'), zoneTint: $('zone-tint'),
      stateTag: $('state-tag'), speedfx: $('speedfx'), speedvig: $('speedvig'), tech: $('tech'), adsBtn: document.querySelector('.btn.ads'),
      grapBtn: document.querySelector('.btn.grapple'), stimBtn: document.querySelector('.btn.stim'), stimfx: $('stimfx'), crouchBtn: document.querySelector('.btn.crouch'), jumpBtn: document.querySelector('.btn.jump'),
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
      this.numPool.push({ el: d, life: 0, pos: new THREE.Vector3(), vy: 0, age: 9, total: 0, dx: 0, victim: null });
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
    if (game.duel) {
      const D = game.duel, $ = this.$;
      this.set('dyou', $('d-you'), D.score[0]); this.set('dbot', $('d-bot'), D.score[1]);
      this.set('dround', $('d-round'), `R${D.round} · FIRST TO ${D.target}`);
      const tl = D.phase === 'fight' ? Math.max(0, D.t) : D.phase === 'countdown' ? D.roundTime : 0;
      this.set('dtime', $('d-time'), fmtTime(tl));
      this.set('dlow', $('d-time').parentNode, D.phase === 'fight' && D.t < 10, (el, v) => el.classList.toggle('low', v));
    }
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
        el.querySelector('.sicon').innerHTML = s ? WICON(s.id) : '';
        el.querySelector('.sname').textContent = s ? (s.def.melee ? 'KNIFE' : s.def.name.toUpperCase()) : 'EMPTY';
        el.querySelector('.sammo').textContent = s && !s.def.melee ? s.mag : '';
        el.querySelector('.sbar i').style.transform = `scaleX(${s && !s.def.melee ? s.mag / s.def.mag : s ? 1 : 0})`;
        el.classList.toggle('low', !!(s && !s.def.melee && s.mag <= s.def.mag * 0.25));
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
    // Shockwave grenade count
    const nb = this._nadeBtn || (this._nadeBtn = document.querySelector('.btn.nade'));
    this.set('nades', nb, p.nades || 0, (el, v) => { el.querySelector('.cnt').textContent = v; el.classList.toggle('empty', v <= 0); });
    // Stim cooldown sweep + boost glow
    const SC = BR.CONFIG.stim;
    const scd = Math.ceil(p.stimCd * 10) / 10;
    this.set('scd', e.stimBtn, scd, (el, v) => {
      el.classList.toggle('cooling', v > 0);
      el.style.setProperty('--cd', v > 0 ? (v / SC.cooldown * 360).toFixed(0) + 'deg' : '0deg');
      el.querySelector('.cd').textContent = v > 0 ? Math.ceil(v) : '';
    });
    const boost = p.alive && p.stimT > 0 ? Math.round(Math.min(1, p.stimT / 0.4) * 10) / 10 : 0;
    this.set('stimfx', e.stimfx, boost, (el, v) => { el.style.opacity = v; e.stimBtn.classList.toggle('active', v > 0); });
    const m = p.mover;
    // Super jump cooldown sweep on the crouch/slide button
    const sj = Math.max(0, Math.ceil(m.superCd * 10) / 10);
    this.set('sjcd', e.crouchBtn, sj, (el, v) => {
      el.classList.toggle('cooling', v > 0);
      el.style.setProperty('--cd', (v / BR.CONFIG.move.tech.superJumpCooldown * 360).toFixed(0) + 'deg');
    });
    const jLbl = m.dropping ? (m.chute ? 'JUMP' : 'CHUTE') : 'JUMP';
    this.set('jl', e.jumpBtn, jLbl, (el, v) => { el.querySelector('span').textContent = v; el.classList.toggle('on-toggle', v === 'CHUTE'); });
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

    // Speed effects: lines + edge glow once you're well past running speed (freefall counts)
    const v3 = Math.hypot(m.vel.x, m.vel.y * 0.8, m.vel.z);
    const spdK = p.alive ? Math.round(BR.util.clamp((v3 - BR.CONFIG.move.runSpeed * 1.15) / 7, 0, 1) * 20) / 20 : 0;
    this.set('spd', e.speedfx, spdK, (el, v) => { el.style.opacity = v; e.speedvig.style.opacity = v * 0.9; });

    // Movement state tag
    const tag = m.dropping ? (m.chute ? 'PARACHUTE' : 'FREEFALL') : m.grapple ? 'GRAPPLE' : m.wallRunning ? 'WALL-RUN' : m.sliding ? 'SLIDE' : '';
    this.set('tag', e.stateTag, tag, (el, v) => { el.textContent = v; el.classList.toggle('on', !!v); });

    this.updateNums(game, dt);
    this.updateDirs(game, dt);
    this.drawMinimap(game);
  }

  fps(v, on) {
    this.set('fps', this.el.fps, on ? Math.round(v) + ' fps' : '');
  }

  killfeed(html, cls) {
    const d = document.createElement('div');
    d.className = 'kf' + (cls ? ' ' + cls : '');
    d.innerHTML = html;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 5000);
    setTimeout(() => d.remove(), 6000);
  }

  shockFlash() { const el = this.$('shockfx'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }

  // Big centre countdown (3, 2, 1, FIGHT!)
  duelCount(text) {
    const el = this.$('duelcount');
    el.textContent = text;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  // Round banner: kind = win | lose | info
  duelBanner(title, sub, kind) {
    const el = this.$('duelbanner');
    el.querySelector('b').textContent = title; el.querySelector('span').textContent = sub || '';
    el.className = kind || 'info';
    void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._dbTO); this._dbTO = setTimeout(() => el.classList.remove('on'), 2300);
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
    const c = this.$('hitcrit');
    if (c && (head || kill)) { c.className = ''; void c.offsetWidth; c.className = 'on' + (kill ? ' kill' : ''); }
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

  // Damage numbers stack per target (Apex-style): rapid hits on the same enemy add up in
  // one number that re-pops; headshots are gold crits, shield hits are blue.
  damageNumber(pos, dmg, head, victim, shield) {
    let n = victim && this.numPool.find(q => q.victim === victim && q.life > 0.25 && q.age < 1.1);
    if (n) { n.total += dmg; n.age = Math.min(n.age, 0.2); }
    else {
      n = this.numPool[this.ni++ % this.numPool.length];
      n.victim = victim; n.total = dmg; n.age = 0;
      n.pos.copy(pos); n.dx = (Math.random() - 0.5) * 40;
    }
    n.life = 1.0;
    n.head = n.head && n.age > 0 ? n.head || head : head;
    const el = n.el;
    el.innerHTML = (head ? '<i>✦</i>' : '') + Math.round(n.total);
    el.className = 'dnum' + (head ? ' head' : shield ? ' shield' : '');
    void el.offsetWidth; el.classList.add('pop');
    el.style.opacity = 1;
  }

  updateNums(game, dt) {
    const cam = game.camera, v = game._v4, W = window.innerWidth, H = window.innerHeight;
    for (const n of this.numPool) {
      if (n.life <= 0) continue;
      n.life -= dt; n.age += dt;
      n.pos.y += dt * 0.55;
      v.copy(n.pos).project(cam);
      if (n.life <= 0 || v.z > 1) { n.el.style.opacity = 0; n.life = 0; continue; }
      n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W + n.dx}px, ${(-v.y * 0.5 + 0.5) * H - 26}px) translate(-50%, -50%)`;
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
  paintMap(c, S, game, cx, cz, view, labels, round) {
    const w = game.world, H = w.half, k = S / view;
    const X = x => (x - cx) * k + S / 2, Z = z => (z - cz) * k + S / 2;
    c.clearRect(0, 0, S, S);
    c.save();
    if (round) { c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); c.clip(); }
    c.fillStyle = round ? '#141a14' : '#26331f'; c.fillRect(0, 0, S, S);
    if (this.mapImg) {
      // source window clipped to the image (Safari won't draw an out-of-bounds source rect)
      const im = this.mapImg, ik = im.width / w.size;
      let sx = (cx - view / 2 + H) * ik, sz = (cz - view / 2 + H) * ik, sw = view * ik, sh = view * ik;
      let dx = 0, dz = 0, dw = S, dh = S;
      const f = S / sw;
      if (sx < 0) { dx -= sx * f; dw += sx * f; sw += sx; sx = 0; }
      if (sz < 0) { dz -= sz * f; dh += sz * f; sh += sz; sz = 0; }
      if (sx + sw > im.width) { const o = sx + sw - im.width; sw -= o; dw -= o * f; }
      if (sz + sh > im.height) { const o = sz + sh - im.height; sh -= o; dh -= o * f; }
      if (sw > 0 && sh > 0) c.drawImage(im, sx, sz, sw, sh, dx, dz, dw, dh);
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
    if (round) {
      // view cone + soft vignette inside the circle
      c.save(); c.translate(X(p.pos.x), Z(p.pos.z)); c.rotate(-p.yaw);
      const cone = c.createRadialGradient(0, 0, 2, 0, 0, S * 0.45); cone.addColorStop(0, 'rgba(255,214,120,0.35)'); cone.addColorStop(1, 'rgba(255,214,120,0)');
      c.fillStyle = cone; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, S * 0.45, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
      c.restore();
      const vg = c.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = vg; c.fillRect(0, 0, S, S);
    }
    c.save();
    c.translate(X(p.pos.x), Z(p.pos.z));
    c.rotate(-p.yaw);
    c.fillStyle = '#ffb224'; c.strokeStyle = '#1a1206'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -sz); c.lineTo(sz * 0.7, sz * 0.75); c.lineTo(0, sz * 0.38); c.lineTo(-sz * 0.7, sz * 0.75); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    c.restore();
  }

  drawMinimap(game) {
    this._mmT = (this._mmT || 0) + 1;
    if (this._mmT % 3) return; // 20 Hz is plenty
    const p = game.player, w = game.world, view = 220, H = w.half;
    // Round minimap centred on you (zoomed in tighter for the small duel arena)
    const vw = w.arena ? 70 : 160;
    this.paintMap(this.mm, 220, game, p.pos.x, p.pos.z, vw, false, true);
    if (this.bigOpen) this.paintMap(this.bm, 720, game, 0, 0, w.size, true);
  }

  showEnd(r) {
    const $ = this.$;
    $('end-eyebrow').textContent = r.duel ? (r.win ? 'DUEL WON' : 'DUEL LOST') : r.win ? 'VICTORY' : 'ELIMINATED';
    $('end-place').textContent = r.duel ? `${r.score[0]} – ${r.score[1]}` : r.win ? '#1' : '#' + r.place;
    $('btn-again').textContent = r.duel ? 'REMATCH' : 'QUEUE NEW MATCH';
    $('end-sub').textContent = r.duel ? r.by : r.win ? `Last one standing out of ${r.total}.` : `${r.by} · out of ${r.total}`;
    $('end-kills').textContent = r.kills;
    $('end-dmg').textContent = Math.round(r.damage);
    $('end-time').textContent = fmtTime(r.time);
    $('end').classList.toggle('win', !!r.win);
    const ec = $('end-coins');
    if (r.coins) {
      ec.innerHTML = r.coins.parts.map(p => `<div><span>${p[0]}</span><b>+${p[1]}</b></div>`).join('') +
        `<div class="tot"><span>Coins earned</span><b><i class="coin"></i>+${r.coins.total}</b></div>`;
      if (r.coins.total > 0) BR.Audio.coin();
      if (r.coins.rp !== undefined) ec.innerHTML += `<div class="rprow"><span>${BR.Ranks.badge(BR.Profile.data.rp || 0)} Ranked</span><b class="${r.coins.rp < 0 ? 'neg' : ''}">${r.coins.rp >= 0 ? '+' : ''}${r.coins.rp} RP</b></div>`
        + (r.coins.rankUp ? `<div class="rprow up"><span>RANK UP!</span><b>${r.coins.rankUp}</b></div>` : '')
        + (r.coins.unlocked && r.coins.unlocked.length ? `<div class="rprow up"><span>Unlocked</span><b>${r.coins.unlocked.join(', ')}</b></div>` : '');
    } else ec.innerHTML = '<div class="tot"><span>PRACTICE · NO COINS</span><b></b></div>';
    this.show('end', true);
  }
};

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
BR.fmtTime = fmtTime;
