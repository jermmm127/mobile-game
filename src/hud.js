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
  butterfly: 'M6 11h22v3H6z M28 10l26-2-4 6H28z M8 15h20v2H8z',
  bayonet: 'M4 10h20v6H4z M24 7h3v12h-3z M27 10h20l9 3-9 3H27z',
  tracker: 'M3 9h19l2 2-2 5H6z M22 6h3v10l-2 4h-2z M25 9h24l6 4-5 3H25z',
  revolver: 'M10 6h34v5H30v3h-6l-3 9h-8l3-9h-3l-2-3H10z M44 7h12v3H44z M24 11a3 3 0 1 1 0.1 0z',
};
// Weapon pictures rendered from the real 3D models (once, at startup, in a throwaway WebGL
// context): a white silhouette per weapon for the HUD slots (used as a CSS mask so it takes the
// slot colour / glow) and a lit picture for the spawn + duel loadout menus.
BR.WeaponIcons = {
  sil: {}, pic: {}, cpic: {},
  build() {
    if (this.done) return;
    // imported models (v1.16.3): wait for their textures so the icons aren't drawn blank
    if (!this.waited && BR.Models.importsReady) { this.waited = true; BR.Models.importsReady().then(() => this.build()); return; }
    this.done = true;
    setTimeout(() => { if (this.onBuilt) this.onBuilt(); }, 0);
    let r;
    try {
      const W = 320, H = 120;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xffffff, 0x6a7484, 1.7));
      const dl = new THREE.DirectionalLight(0xffffff, 1.3); dl.position.set(-2, 2.5, 1.2); sc.add(dl);       // key (camera side)
      const rim = new THREE.DirectionalLight(0xbfd6ff, 0.8); rim.position.set(1, 1.5, -2); sc.add(rim);         // cool rim
      sc.add(new THREE.AmbientLight(0xffffff, 0.35));
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
      const css = [];
      // frame a model side-on (muzzle to the left) and grab a lit picture (+ optional silhouette)
      const shoot = (m, sil) => {
        if (m.userData.flash) m.userData.flash.visible = false;
        if (m.userData.laser) m.userData.laser.visible = false;         // (the laser beam would shrink the framing)
        const g = new THREE.Group(); g.add(m); sc.add(g);
        if (BR.Models.animate) BR.Models.animate(m, 1.2);
        g.updateMatrixWorld(true);
        const box = new THREE.Box3();
        m.traverse(o => { if (o.isMesh && o.visible && o !== m.userData.flash) box.expandByObject(o); });
        const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
        const pad = 1.08, w = Math.max(sz.z, sz.y * W / H) * pad / 2, h = w * H / W;
        cam.left = -w; cam.right = w; cam.top = h; cam.bottom = -h; cam.updateProjectionMatrix();
        cam.position.set(c.x - 3, c.y, c.z); cam.up.set(0, 1, 0); cam.lookAt(c);
        sc.overrideMaterial = null; r.render(sc, cam); const pic = cv.toDataURL('image/png');
        let s2 = null; if (sil) { sc.overrideMaterial = white; r.render(sc, cam); s2 = cv.toDataURL('image/png'); sc.overrideMaterial = null; }
        sc.remove(g);
        return [pic, s2];
      };
      for (const id in BR.CONFIG.weapons) {
        const m = BR.Models.weapon(id, 'default', 'none');
        if (id === 'butterfly' || id === 'bayonet' || id === 'tracker') m.rotation.x = -Math.PI / 2;          // blade toward the muzzle side
        [this.pic[id], this.sil[id]] = shoot(m, true);
        css.push(`.wsil-${id}{-webkit-mask-image:url(${this.sil[id]});mask-image:url(${this.sil[id]})}`);
      }
      // Release Case contents: blueprints as their own model, camos on a rifle, gloves on a hand
      for (const e of (BR.CaseItems ? BR.CaseItems.all() : [])) {
        let m = null;
        if (e.cat === 'blueprints') { const [w, b] = e.id.split(':'); m = BR.Models.weapon(w, 'default', 'none', b); if (w === 'butterfly' || w === 'bayonet' || w === 'tracker') m.rotation.x = -Math.PI / 2; }
        else if (e.cat === 'skins') m = BR.Models.weapon('rifle', e.id, 'none');
        else if (e.cat === 'gloves') { m = BR.Models.hand(e.id, false); m.rotation.set(0, 0, -0.35); }
        if (m) this.cpic[e.cat + ':' + e.id] = shoot(m, false)[0];
      }
      const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
    } catch (e) { this.sil = {}; this.pic = {}; }
    finally { if (r) { r.dispose(); if (r.forceContextLoss) r.forceContextLoss(); } }
  },
  has(id) { return !!this.sil[id]; },
  // ---- spinning previews for case items: a 12-frame turntable strip per item, rendered lazily one
  // item per frame (keeps the UI smooth), then swapped in for the static picture
  spin: {},
  modelFor(e) {
    if (e.cat === 'blueprints') { const [w, b] = e.id.split(':'); const m = BR.Models.weapon(w, 'default', 'none', b); if (w === 'butterfly' || w === 'bayonet' || w === 'tracker') m.rotation.x = -Math.PI / 2; return m; }
    if (e.cat === 'skins') return BR.Models.weapon('rifle', e.id, 'none');
    if (e.cat === 'gloves') { const m = BR.Models.hand(e.id, false); m.rotation.set(0, 0, -0.35); return m; }
    return null;
  },
  queueSpins(entries, onReady) {
    this.q = (this.q || []).concat(entries.filter(e => !this.spin[e.cat + ':' + e.id] && this.modelFor(e)));
    this.onReady = onReady;
    if (this.running) return;
    this.running = true;
    const F = 12, W = 120, H = 48;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    let r = null;
    try { r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch (err) { this.running = false; return; }
    r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x6a7484, 1.7));
    const dl = new THREE.DirectionalLight(0xffffff, 1.3); dl.position.set(-2, 2.5, 1.2); sc.add(dl); sc.add(new THREE.AmbientLight(0xffffff, 0.35));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    const strip = document.createElement('canvas'); strip.width = W * F; strip.height = H; const sx = strip.getContext('2d');
    const step = () => {
      const e = this.q.shift();
      if (!e) { this.running = false; r.dispose(); if (r.forceContextLoss) r.forceContextLoss(); return; }
      const key = e.cat + ':' + e.id, m = this.modelFor(e);
      const turn = new THREE.Group(), g = new THREE.Group(); g.add(m); turn.add(g); sc.add(turn);
      if (BR.Models.animate) BR.Models.animate(m, 1.2);
      turn.updateMatrixWorld(true);
      const box = new THREE.Box3(); m.traverse(o => { if (o.isMesh && o.visible && o !== m.userData.flash) box.expandByObject(o); });
      const c = box.getCenter(new THREE.Vector3()); g.position.sub(c);
      const rad = box.getSize(new THREE.Vector3()).length() / 2, w = rad * 1.02, h = w * H / W;
      cam.left = -w; cam.right = w; cam.top = h; cam.bottom = -h; cam.updateProjectionMatrix();
      cam.position.set(-4, 0.9, 0); cam.lookAt(0, 0, 0);
      sx.clearRect(0, 0, strip.width, strip.height);
      for (let f = 0; f < F; f++) { turn.rotation.y = f / F * Math.PI * 2; r.render(sc, cam); sx.drawImage(cv, f * W, 0); }
      sc.remove(turn);
      this.spin[key] = strip.toDataURL('image/png');
      if (this.onReady) this.onReady(key, this.spin[key]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
};
const WICON_SVG = id => `<svg viewBox="0 0 64 24"><path d="${WICON_PATHS[id] || WICON_PATHS.pistol}" fill-rule="evenodd"/></svg>`;
const WICON = id => BR.WeaponIcons.has(id) ? `<i class="wsil wsil-${id}"></i>` : WICON_SVG(id);

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
  <p id="kb-help"><b>KEYBOARD & MOUSE:</b> mouse to look; every other key can be changed in Settings → PC CONTROLS.</p>
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
  <div id="scope2"><div class="s2-win"><i class="s2-h l"></i><i class="s2-h r"></i><i class="s2-post l"></i><i class="s2-post r"></i><b class="s2-chev"></b><i class="s2-bdc b1"></i><i class="s2-bdc b2"></i><i class="s2-bdc b3"></i></div></div>
  <div id="scope3"><div class="a3-win"><i class="a3-h l"></i><i class="a3-h r"></i><i class="a3-v"></i><b class="a3-chev"></b><i class="a3-dot"></i>
    <i class="a3-bdc" style="--y:34px;--w:30px"></i><i class="a3-bdc" style="--y:58px;--w:22px"></i><i class="a3-bdc" style="--y:80px;--w:16px"></i><i class="a3-bdc" style="--y:100px;--w:11px"></i>
    <i class="a3-n" style="--y:34px">4</i><i class="a3-n" style="--y:58px">6</i><i class="a3-n" style="--y:80px">8</i></div></div>
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
  <div id="speedo"><b>0.0</b><i>M/S</i></div>
  <div id="toast"></div>
  <div id="killflash"></div>
  <div id="squad" class="squad hidden"></div>
  <div id="sq-marks"></div>
  <div id="downed" class="downed hidden"><b>YOU'RE DOWN</b><span id="dn-sub">Crawl to cover · a teammate can revive you</span><i><u id="dn-bar"></u></i></div>
  <div id="rs-chip" class="rs-chip"><i></i><b>RESPAWNS ON</b><span>until circle 4</span></div>
  <div id="rs-count" class="rs-count hidden"><b>REDEPLOYING IN</b><span>9</span><i>Kills shorten your next timer</i></div>
  <div id="zm-hud" class="hidden">
    <div class="zm-round"><b id="zm-round">0</b></div>
    <div class="zm-points"><span id="zm-points">0</span><i id="zm-pop"></i></div>
    <div id="zm-left" class="zm-left hidden">ZOMBIES <b>0</b></div>
    <div id="zm-marks"></div>
    <div id="zm-quest" class="zm-quest hidden"><small>QUEST</small><b class="zq-t"></b><span class="zq-d"></span><i class="zq-bar"><u></u></i><em class="zq-n"></em></div>
    <button class="zm-jbtn" data-act="journal" aria-label="Journal"><svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg><span>JOURNAL</span></button>
    <div id="zm-lore" class="zm-lore"><small>STORY UNLOCKED</small><b></b><p></p></div>
    <div id="zm-journal" class="zm-journal hidden" data-act="journal"><div class="zj-panel"><div class="zj-head">THE HOLLOW GRAVES JOURNAL <span>tap to close</span></div><div class="zj-list"></div></div></div>
    <div id="zm-cut" class="zm-cut"><i class="bar t"></i><i class="bar b"></i><div class="zc-card"><small class="zc-name"></small><b class="zc-title"></b><p class="zc-line"></p><span class="zc-skip">tap JUMP to skip</span></div></div>
    <div class="zm-timers"><span id="zm-insta" class="hidden">INSTA-KILL <b></b></span><span id="zm-double" class="hidden">DOUBLE POINTS <b></b></span></div>
    <div id="zm-boss" class="hidden"><div class="zb-name"></div><div class="zb-bar"><i></i></div></div>
    <div id="zm-banner"><b></b><span></span></div>
    <div id="zm-flash"></div>
  </div>
  <div id="freezefx"><i class="fz-flash"></i><i class="fz-lines"></i><i class="fz-frame"></i></div>
  <div id="victory" class="hidden"><div class="v-flash"></div><div class="v-rays"></div><div class="v-glow"></div>
    <div class="v-rank"><span>#</span>1</div>
    <div class="v-title">${'VICTORY'.split('').map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</div>
    <div class="v-sub">LAST ONE STANDING</div>
    <div class="v-stats"><div><b data-k="kills">0</b><span>KILLS</span></div><div><b data-k="damage">0</b><span>DAMAGE</span></div><div><b data-k="total">0</b><span>PLAYERS</span></div></div>
    <div class="v-conf">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i * 13) % 10};--c:${i % 5}"></i>`).join('')}</div></div>
  <div id="killban"><u class="kb-ring"></u><u class="kb-ring r2"></u><i class="kb-skull"><svg viewBox="0 0 64 64"><path d="M32 4C18 4 8 14 8 27c0 8 4 14 9 17v8c0 2 2 4 4 4h3v-6h4v6h8v-6h4v6h3c2 0 4-2 4-4v-8c5-3 9-9 9-17C56 14 46 4 32 4zm-11 32a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm22 0a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm-11 9-4-6h8z"/></svg></i><b class="kb-t">ELIMINATED</b><span class="kb-n"></span><em class="kb-x"></em><s class="kb-c"></s></div>
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
    <label class="ed-l">WEAPONS <input id="ed-slot-alpha" type="range" min="0.1" max="1" step="0.05"></label>
    <button id="ed-flip" class="mbtn sm">MOVE PANEL</button>
    <button id="ed-reset" class="mbtn sm">RESET</button>
    <button id="ed-done" class="mbtn sm hot">DONE</button>
  </div>
</div>

<div id="menu" class="overlay menu">
  <div class="menu-bg" aria-hidden="true"><i class="mb-glow g1"></i><i class="mb-glow g2"></i><i class="mb-glow g3"></i><i class="mb-ring"></i>
    <div class="mb-floor"><div class="mb-grid"></div></div><div class="mb-motes">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 41) % 100};--d:${(i * 7) % 11};--s:${0.5 + (i % 4) * 0.35};--t:${9 + (i % 5) * 2.5}"></i>`).join('')}</div><i class="mb-shade"></i></div>
  <div class="m-aurora"><i></i><i></i><i></i></div>
  <div class="m-motes">${Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 41) % 100};--d:${(i * 7) % 11};--s:${0.6 + (i % 5) * 0.25}"></i>`).join('')}</div>
  <div class="film"><i class="lb top"></i><i class="lb bot"></i><i class="scan"></i><i class="grain"></i><i class="cutflash"></i></div>
  <div class="menu-coins glass"><i class="coin"></i><span id="menu-coins" class="num">0</span></div>
  <button id="lvl-chip" class="lvl-chip glass" aria-label="Level"><b id="lvl-n">0</b><span class="lvl-txt"><i>LEVEL</i><u class="lvl-bar"><s id="lvl-bar"></s></u><small id="lvl-xp">0 / 1,000 XP</small></span></button>
  <button id="acct-chip" class="acct-chip glass"><span id="acct-avatar" class="avatar">G</span><span class="acct-text"><b id="acct-name">Guest</b><small id="acct-sub">Sign in</small></span></button>
  <div class="menu-main">
    <div class="logo">
      <div class="logo-small"><i class="dot"></i>Season 1 · v${V}</div>
      <h1 class="logo-title" aria-label="surge"><span class="lt">${'surge'.split('').map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</span><b class="lt-glow" aria-hidden="true">surge</b><u class="lt-line" aria-hidden="true"></u></h1>
      <div class="tagline">Slide. Wall-run. Grapple. Be the last one standing.</div>
    </div>
    <nav class="menu-nav">
      <div class="lobby">
        <button id="mode-cur" class="mode-cur" aria-label="Change game mode">
          <span class="mc-art" id="mc-art"></span>
          <span class="mc-txt"><span class="mc-tag">GAME MODE</span><b id="mc-name">BATTLE ROYALE</b><i id="mc-sub">Solo · one life</i></span>
          <span class="mc-change">CHANGE<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>
        </button>
        <button id="btn-go" class="play-big"><span>PLAY</span><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></button>
      </div>
      <div id="sq-pick" class="sq-pick hidden"></div>
      <div class="modes legacy-modes" hidden aria-hidden="true">
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
        <button id="btn-zombies" class="mode zombies">
          <span class="m-tag">NEW · HALLOWEEN</span>
          <span class="m-title">ZOMBIES</span>
          <span class="m-sub">Hollow Graves · endless rounds</span>
          <span class="m-skull"><svg viewBox="0 0 64 64"><path d="M32 4C18 4 8 14 8 27c0 8 4 14 9 17v8c0 2 2 4 4 4h3v-6h4v6h8v-6h4v6h3c2 0 4-2 4-4v-8c5-3 9-9 9-17C56 14 46 4 32 4zm-11 32a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm22 0a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm-11 9-4-6h8z"/></svg></span>
        </button>
        <button id="btn-resurgence" class="mode resurgence">
          <span class="m-tag">NEW · BATTLE ROYALE</span>
          <span class="m-title">RESURGENCE</span>
          <span class="m-sub">24 players · redeploy until circle 4</span>
          <span class="m-ico"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-2.2A6.8 6.8 0 1 1 12 5.2V8l4-4-4-4z"/></svg></span>
        </button>
        <button id="btn-overdrive" class="mode overdrive">
          <span class="m-tag">NEW · ROGUELIKE</span>
          <span class="m-title">OVERDRIVE</span>
          <span class="m-sub">Survive the swarm · level up · beat the Overlord</span>
          <span class="m-ico"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>
        </button>
        <button id="btn-aim" class="mode aim">
          <span class="m-tag">NEW · TRAINING</span>
          <span class="m-title">AIM TRAINER</span>
          <span class="m-sub">Gridshot · Flick · Tracking · Strafe</span>
          <span class="m-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke-width="2"/></svg></span>
        </button>
      </div>
      <div class="dock">
        <button id="btn-loadout" class="dk loadout"><svg viewBox="0 0 24 24"><path d="M3 14h11l3-3h4v3l-3 3H3z"/><path d="M6 14v4M10 14v3"/></svg><span>LOADOUT</span></button>
        <button id="btn-cases" class="dk cases"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M12 8v12M8 8l1-3h6l1 3"/></svg><span>CASES</span><em>NEW</em></button>
        <button id="btn-inv" class="dk inv"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span>INVENTORY</span></button>
        <button id="btn-shop" class="dk shop"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span>SHOP</span></button>
        <button id="btn-grind" class="dk grind"><svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/></svg><span>CHALLENGES</span><em>NEW</em></button>
        <button id="btn-ranks" class="dk ranks"><svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg><span>RANKED</span></button>
        <button id="btn-notes" class="dk notes"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 15h7M9 19h4"/></svg><span>NOTES</span><em>NEW</em></button>
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
      <details class="help sens-adv"><summary>ADVANCED SENSITIVITY</summary>
        <div class="row"><label for="set-sensX">HORIZONTAL</label><input id="set-sensX" type="range" min="0.3" max="2" step="0.05"><output id="out-sensX"></output></div>
        <div class="row"><label for="set-sensY">VERTICAL</label><input id="set-sensY" type="range" min="0.3" max="2" step="0.05"><output id="out-sensY"></output></div>
        <div class="row"><label for="set-sensAds">AIMING (ADS)</label><input id="set-sensAds" type="range" min="0.3" max="2" step="0.05"><output id="out-sensAds"></output></div>
        <div class="row"><label for="set-sensScope">SNIPER SCOPE</label><input id="set-sensScope" type="range" min="0.3" max="2" step="0.05"><output id="out-sensScope"></output></div>
        <div class="row"><label for="set-sensFire">FIRE BUTTON DRAG</label><input id="set-sensFire" type="range" min="0.3" max="2" step="0.05"><output id="out-sensFire"></output></div>
        <div class="row"><label for="set-sensCurve">RESPONSE CURVE</label><input id="set-sensCurve" type="range" min="0" max="1" step="0.05"><output id="out-sensCurve"></output></div>
        <div class="row"><label>GYRO AIM</label><div class="seg" id="set-gyro">
          <button data-v="off">OFF</button><button data-v="ads">WHEN AIMING</button><button data-v="always">ALWAYS</button></div></div>
        <div class="row"><label for="set-gyroSens">GYRO SPEED</label><input id="set-gyroSens" type="range" min="0.2" max="3" step="0.05"><output id="out-gyroSens"></output></div>
        <div class="row toggles">
          <label class="tg"><input type="checkbox" id="set-gyroInvX"> INVERT GYRO X</label>
          <label class="tg"><input type="checkbox" id="set-gyroInvY"> INVERT GYRO Y</label>
          <button id="set-sensReset" class="mbtn sm">RESET</button>
        </div>
        <p class="sens-hint">Each value multiplies LOOK SPEED. Response curve: 0 = linear, higher = slow drags are finer and fast flicks turn further. Gyro: tilt / turn your phone to aim (iPhone asks for motion access the first time).</p>
      </details>
      <div class="row"><label for="set-smooth">AIM SMOOTHING</label><input id="set-smooth" type="range" min="0" max="1" step="0.05"><output id="out-smooth"></output></div>
      <div class="row"><label for="set-stretch">STRETCHED RES</label><input id="set-stretch" type="range" min="0" max="2" step="0.05"><output id="out-stretch"></output></div>
      <div class="row"><label for="set-sat">SATURATION</label><input id="set-sat" type="range" min="0" max="2" step="0.05"><output id="out-sat"></output></div>
      <div class="row"><label for="set-fov">FOV</label><input id="set-fov" type="range" min="60" max="110" step="1"><output id="out-fov"></output></div>
      <div class="row"><label>ENEMY HIGHLIGHT</label><div class="seg" id="set-hl">
        <button data-v="off">OFF</button><button data-v="subtle">SUBTLE</button><button data-v="bright">BRIGHT</button></div></div>
      <div class="row"><label>GRAPHICS</label><div class="seg" id="set-gfx">
        <button data-v="low">LOW</button><button data-v="medium">MED</button><button data-v="high">HIGH</button></div></div>
      <div class="row"><label for="set-vol">VOLUME</label><input id="set-vol" type="range" min="0" max="1" step="0.05"><output id="out-vol"></output></div>
      <div class="row toggles">
        <label class="tg"><input type="checkbox" id="set-assist"> AIM ASSIST</label>
        <label class="tg"><input type="checkbox" id="set-auto"> AUTO-FIRE</label>
        <label class="tg"><input type="checkbox" id="set-fps"> SHOW FPS</label>
        <label class="tg"><input type="checkbox" id="set-speed"> SPEED (M/S)</label>
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
      <details class="help kb-set" id="kb-set"><summary>PC CONTROLS (KEYBINDS)</summary>
        <div class="kb-note">Click a key slot, then press any key, mouse button or scroll the wheel. <b>Esc</b> cancels, <b>Backspace</b> clears the slot. Each key does one action: binding it here unbinds it elsewhere.</div>
        <div id="kb-list" class="kb-list"></div>
        <div class="kb-foot"><span id="kb-msg" class="kb-msg"></span><button id="kb-reset" class="mbtn">RESET TO DEFAULTS</button></div>
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
      <button data-cat="blueprints">BLUEPRINTS</button><button data-cat="skins">CAMOS</button><button data-cat="tracers">TRACERS</button><button data-cat="charms">CHARMS</button><button data-cat="gloves">GLOVES</button><button data-cat="feeds">KILL FEED</button><button data-cat="finishers">FINISHERS</button>
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
      <button data-cat="blueprints">BLUEPRINTS</button><button data-cat="skins">CAMOS</button><button data-cat="tracers">TRACERS</button><button data-cat="gloves">GLOVES</button><button data-cat="charms">CHARMS</button><button data-cat="feeds">KILL FEED</button><button data-cat="finishers">FINISHERS</button>
    </div>
    <div id="inv-melee" class="melee-pick"><span>MELEE</span><button data-m="tracker">TRACKER</button><button data-m="bayonet">BAYONET</button><button data-m="knife">KARAMBIT</button><button data-m="butterfly">BUTTERFLY</button></div>
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
        <label class="acct-remember" for="acct-remember"><input id="acct-remember" type="checkbox" checked><span>Remember me</span><small>Stay signed in on this device</small></label>
        <button id="acct-submit" class="mbtn hot" type="submit">Sign in</button>
      </form>
      <p class="fine">Accounts are saved on this device for now. Coins, skins and stats are kept per account.</p>
    </div>
    <div id="acct-in" class="hidden">
      <div class="acct-me"><span id="acct-me"></span><span id="acct-dev" class="dev-badge hidden">DEV</span></div>
      <div class="acct-row"><span>Account ID</span><b class="acct-idb"><span id="acct-id"></span><button id="acct-copy" class="mbtn sm" type="button">COPY</button></b></div>
      <div class="acct-row"><span>Coins</span><b><i class="coin"></i><span id="acct-coins"></span></b></div>
      <div class="acct-row"><span>Record</span><b id="acct-stats"></b></div>
      <label for="acct-code">Redeem a code</label>
      <div class="code-row"><input id="acct-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XX-XXX-XXXX"><button id="acct-redeem" class="mbtn sm">REDEEM</button></div>
      <button id="acct-admin" class="mbtn hidden" type="button">SUPPORT · ACCOUNTS</button>
      <button id="acct-devmenu" class="mbtn hot hidden" type="button">DEV MENU · KICK · BAN · COINS</button>
      <div id="acct-banned" class="acct-banned hidden">BANNED · this account can't play</div>
      <button id="acct-logout" class="mbtn">LOG OUT</button>
    </div>
    <div id="acct-msg" class="acct-msg" role="status"></div>
    <button id="acct-close" class="mbtn">CLOSE</button>
  </div>
</div>
<div id="maproll" class="overlay hidden">
  <div class="mr-box"><div class="mr-top"><em id="mr-title">ARENA</em><b>ROLLING THE MAP</b></div>
    <div class="mr-win"><div class="mr-strip" id="mr-strip"></div><i class="mr-mark"></i></div>
    <div class="mr-res" id="mr-res"></div><small class="mr-fine">Every map has the same odds</small></div>
</div>
<div id="devmenu" class="overlay hidden">
  <div class="panel metal acct admin devm">
    <div class="ptitle">DEV MENU</div>
    <p class="adm-note">Kick, ban and give coins. Every command is signed with the dev key, so players' games only obey commands from you. Unlock with your private dev code (kept for this session only).</p>
    <form id="dv-gate"><label for="dv-code">Dev code</label><input id="dv-code" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="mbtn hot" type="submit">UNLOCK</button></form>
    <div id="dv-body" class="hidden">
      <div class="dv-amt"><label for="dv-coins">Coins to give</label><input id="dv-coins" type="number" min="1" max="1000000" value="1000"><label for="dv-reason">Reason (kick / ban)</label><input id="dv-reason" type="text" maxlength="60" placeholder="optional"></div>
      <div class="dv-h">PLAYERS IN YOUR LOBBY / MATCH</div><div id="dv-live" class="adm-list"></div>
      <div class="dv-h">ACCOUNTS ON THIS DEVICE</div><div id="dv-local" class="adm-list"></div>
      <div class="dv-h">BY ACCOUNT ID (gift or ban anyone)</div>
      <div class="code-row"><input id="dv-id" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="SRG-XXXX-XXXX"><button id="dv-gift" class="mbtn sm" type="button">GIFT CODE</button><button id="dv-ban" class="mbtn sm" type="button">BAN</button><button id="dv-unban" class="mbtn sm" type="button">UNBAN</button></div>
      <textarea id="dv-out" class="dv-out hidden" readonly></textarea>
      <div class="dv-h">BAN LIST</div><div id="dv-bans" class="adm-list"></div>
      <div class="dv-h">ANTI-CHEAT LOG (this device)</div><div id="dv-log" class="adm-list"></div>
    </div>
    <div id="dv-msg" class="acct-msg" role="status"></div>
    <button id="dv-close" class="mbtn">CLOSE</button>
  </div>
</div>
<div id="admin" class="overlay hidden">
  <div class="panel metal acct admin">
    <div class="ptitle">SUPPORT · ACCOUNTS</div>
    <p class="adm-note">Accounts saved on this device. Passwords are one-way hashed and can never be shown: use RESET to issue a one-time temporary password.</p>
    <form id="adm-gate"><label for="adm-pass">Re-enter your password</label>
      <input id="adm-pass" type="password" autocomplete="current-password" maxlength="64"><button class="mbtn hot" type="submit">UNLOCK</button></form>
    <div id="adm-body" class="hidden">
      <div class="code-row"><input id="adm-q" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Search ID or username"><button id="adm-export" class="mbtn sm" type="button">COPY CSV</button></div>
      <div id="adm-list" class="adm-list"></div>
    </div>
    <div id="adm-msg" class="acct-msg" role="status"></div>
    <button id="adm-close" class="mbtn">CLOSE</button>
  </div>
</div>

<div id="spawnmenu" class="overlay hidden">
  <div class="panel metal wide spawn">
    <button id="sp-x" class="xbtn" aria-label="Close spawn menu">✕</button>
    <div class="ptitle">SPAWN</div>
    <button class="mbtn sm hot sp-locker" id="sp-locker">LOCKER · SWAP SKINS, BLUEPRINTS + KNIFE</button>
    <div class="sp-sec">WEAPONS</div>
    <div class="sp-rar" id="sp-rar"><span>RARITY</span>${(BR.RARITY || []).map((r, i) => `<button data-r="${i}" style="--rc:${r.css}"${i === 0 ? ' class="sel"' : ''}>${r.name.toUpperCase()}</button>`).join('')}</div>
    <div class="sp-slots" id="sp-slots"><span>PUT IN</span><button data-slot="0"><b>SLOT 1</b><i>EMPTY</i></button><button data-slot="1"><b>SLOT 2</b><i>EMPTY</i></button></div>
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
    <button id="btn-locker" class="mbtn locker-btn">LOCKER · SWAP SKINS</button>
    <button id="btn-settings2" class="mbtn">SETTINGS</button>
    <button id="btn-hud2" class="mbtn">CUSTOMIZE HUD</button>
    <button id="btn-quit" class="mbtn">LEAVE MATCH</button>
  </div>
</div>

<div id="discover" class="overlay hidden discover">
  <div class="dc-top"><div class="dc-title"><b>DISCOVER</b><span>Pick a mode, then hit PLAY</span></div><div class="seg dc-queue" id="dc-queue"><button data-q="casual">CASUAL</button><button data-q="ranked">RANKED</button></div><button id="dc-x" class="xbtn" aria-label="Close">✕</button></div>
  <div class="dc-feat" id="dc-feat"></div>
  <div id="dc-rows"></div>
</div>

<div id="loadout" class="overlay hidden">
  <div class="panel metal wide lopanel">
    <button id="lo-x" class="xbtn" aria-label="Close loadout">✕</button>
    <div class="ptitle">LOADOUT</div>
    <p class="tip">Your default kit. You start Practice and Overdrive with it, and Resurgence redeploys you with your sidearm. In Battle Royale you still drop in with just your knife.</p>
    <div class="sp-sec">PRIMARY</div><div class="sp-grid lo-grid" id="lo-primary"></div>
    <div class="sp-sec">SECONDARY</div><div class="sp-grid lo-grid" id="lo-secondary"></div>
    <div class="sp-sec">MELEE</div><div class="sp-grid lo-grid" id="lo-melee"></div>
    <button id="lo-reset" class="mbtn sm">RESET TO DEFAULT (RIFLE · PISTOL · M9 BAYONET)</button>
  </div>
</div>

<div id="arenamenu" class="overlay hidden">
  <div class="panel metal wide arpanel">
    <button id="am-x" class="xbtn" aria-label="Close">✕</button>
    <div class="ptitle" id="am-title">DUELS</div>
    <p class="tip" id="am-desc"></p>
    <div class="row" id="am-sizerow"><label>FORMAT</label><div class="seg" id="am-size"></div></div>
    <div class="row"><label>BOT SKILL</label><div class="seg" id="am-diff"><button data-v="easy">EASY</button><button data-v="normal">NORMAL</button><button data-v="hard">HARD</button></div></div>
    <div class="am-actions"><button class="mbtn hot" id="am-ai">PLAY WITH AI</button><button class="mbtn" id="am-host">HOST ONLINE LOBBY</button></div>
    <div class="am-join"><input id="am-code" maxlength="6" autocomplete="off" spellcheck="false" placeholder="FRIEND'S LOBBY CODE"><button class="mbtn" id="am-join">JOIN</button></div>
    <div class="am-msg" id="am-msg"></div>
  </div>
</div>

<div id="lobby" class="overlay hidden">
  <div class="panel metal wide lbpanel">
    <div class="ptitle" id="lb-title">ONLINE LOBBY</div>
    <div class="lb-code"><span>LOBBY CODE</span><b id="lb-code">------</b><button id="lb-copy" class="mbtn sm">COPY</button></div>
    <p class="tip" id="lb-info">Send the code to your friends. Empty slots are filled with AI.</p>
    <div class="lb-teams" id="lb-teams"></div>
    <div class="am-actions"><button class="mbtn hot" id="lb-start">START MATCH</button><button class="mbtn" id="lb-leave">LEAVE</button></div>
  </div>
</div>

<div id="levels" class="overlay hidden">
  <div class="panel metal wide lvpanel">
    <button id="lv-x" class="xbtn" aria-label="Close levels">✕</button>
    <div class="ptitle">LEVEL <span id="lv-n">0</span></div>
    <div class="lv-bar"><u id="lv-bar"></u></div><div class="lv-sub" id="lv-sub"></div>
    <div class="sp-sec">KNIFE UNLOCKS</div><div class="lv-track" id="lv-track"></div>
    <div class="sp-sec">EARN XP</div>
    <p class="tip">Every level pays <b>150 coins</b>. XP comes from every mode except Practice: kills (100 each), damage, survival time and placement in Battle Royale + Resurgence (win 2,000), duels + arena modes (win 700), Zombies rounds (120) and bosses (400), Overdrive survival time (3 per second) and bosses, and Aim Trainer drills.</p>
  </div>
</div>

<div id="grind" class="overlay hidden">
  <div class="panel metal wide grindpanel">
    <button id="grind-x" class="xbtn" aria-label="Close challenges">✕</button>
    <div class="ptitle">CHALLENGES</div>
    <p class="tip">Grind camos and blueprints are never sold and never drop from cases. Earn them. Every one is animated.</p>
    <div id="grind-list" class="grind-list"></div>
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
    <div class="cs-head"><div class="ptitle" id="cs-title">RELEASE CASE</div><div class="coins-pill"><i class="coin"></i><span id="cs-coins" class="num">0</span></div></div>
    <div class="seg cs-pick" id="cs-pick"><button data-c="release" class="sel">RELEASE · S1</button><button data-c="nova">NOVA · S2 <em>NEW</em></button></div>
    <div class="cs-stage">
      <div class="cs-case" id="cs-case"><div class="cs-lid"></div><div class="cs-body"><b id="cs-label">RELEASE</b><span id="cs-sub">CASE · SEASON 1</span></div><i class="cs-shine"></i></div>
      <div class="cs-reel hidden" id="cs-reel"><div class="cs-strip" id="cs-strip"></div><i class="cs-mark"></i></div>
    </div>
    <div class="cs-result hidden" id="cs-result"></div>
    <div class="cs-actions"><button id="cs-open" class="mbtn hot">OPEN · <i class="coin"></i><span id="cs-price">600</span></button><button id="cs-equip" class="mbtn hidden">EQUIP</button><button id="cs-inspect" class="mbtn hidden">INSPECT</button></div>
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

<div id="patchnotes" class="overlay hidden">
  <div class="panel metal wide pn-panel">
    <button id="pn-x" class="xbtn" aria-label="Close">✕</button>
    <div class="ptitle">PATCH NOTES</div>
    <div id="pn-cur" class="pn-cur"></div>
    <div id="pn-list" class="pn-list"></div>
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
      killfeed: $('killfeed'), minimap: $('minimap'), toast: $('toast'), fps: $('fps'), speedo: $('speedo'),
      mag: $('mag'), reserve: $('reserve'), reloadBar: $('reload-bar'), reloadFill: $('reload-bar').firstElementChild,
      shieldFill: $('shield-fill'), healthFill: $('health-fill'), shieldTxt: $('shield-txt'), healthTxt: $('health-txt'),
      slots: Array.from(document.querySelectorAll('#play > .slot')),
      prompt: $('prompt'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), scope: $('scope'), scope2: $('scope2'), scope3: $('scope3'),
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
    this.squadHud(game);
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
      const key = s ? `${s.id}|${s.mag}|${i === p.cur}|${s.rar | 0}` : 'empty' + i + (i === p.cur);
      this.set('slot' + i, e.slots[i], key, el => {
        el.classList.toggle('active', i === p.cur && !!s);
        el.classList.toggle('empty', !s);
        const rr = s && !s.def.melee ? BR.RARITY[s.rar | 0] : null;      // rarity colour on the slot (v1.11)
        el.classList.toggle('rar', !!rr); el.dataset.rar = rr ? rr.id : '';
        if (rr) el.style.setProperty('--rc', rr.css); else el.style.removeProperty('--rc');
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
      this.set('cxl', e.crosshair, w.def.pellets > 1, (el, v) => el.classList.toggle('sq', v));          // shotguns: square bracket reticle
    }
    const scoped = p.ads && w && w.def.scope && p.alive;
    const holo = p.ads && w && !w.def.scope && !w.def.melee && game.vmr.adsW > 0.7; // sights replace the crosshair
    this.set('scope', e.scope, !!scoped, el => el.classList.toggle('on', !!scoped));
    // magnified optics: their own eyepiece once the gun is up (DMR prism, LMG ACOG)
    const optic = p.ads && w && w.def.optic && p.alive && game.vmr.adsW > 0.8;
    const prism = !!(optic && w.def.optic === 'prism'), acog = !!(optic && w.def.optic === 'acog');
    this.set('scope2', e.scope2, prism, el => el.classList.toggle('on', prism));
    this.set('scope3', e.scope3, acog, el => el.classList.toggle('on', acog));
    this.set('xh', e.crosshair, !!(scoped || optic), (el, v) => el.classList.toggle('hide', v));   // the crosshair stays up while aiming (only scopes / magnified optics replace it)

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

  // Speedometer: horizontal speed in m/s under the crosshair (tints up as you go faster)
  speed(v, on) {
    const el = this.el.speedo; if (!el) return;
    if (!on) { if (this._spOn !== false) { el.style.display = 'none'; this._spOn = false; } return; }
    if (this._spOn !== true) { el.style.display = ''; this._spOn = true; }
    const t = Math.round(v * 10) / 10; if (t === this._spV) return; this._spV = t;
    el.firstChild.textContent = t.toFixed(1);
    const run = BR.CONFIG.move.runSpeed, tier = v > run * 2 ? 3 : v > run * 1.35 ? 2 : v > run * 0.6 ? 1 : 0;
    if (tier !== this._spTier) { el.className = 'sp' + tier; this._spTier = tier; }
  }
  fps(v, on) {
    const sc = BR.game && BR.game.perf ? Math.round(BR.game.perf.scale * 100) : 100;
    this.set('fps', this.el.fps, on ? Math.round(v) + ' fps' + (sc < 100 ? ' · ' + sc + '% res' : '') : '');
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

  // Kill reward banner: skull punch-in with expanding rings, ELIMINATED / HEADSHOT, the victim's
  // name, a streak badge (x2, x3...) and the coins earned, plus a coloured screen-edge flash
  killBanner(o) {
    const k = this.$('killban'), f = this.$('killflash'); if (!k) return;
    const MK = [null, null, 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'RAMPAGE', 'UNSTOPPABLE'];
    k.querySelector('.kb-t').textContent = o.streak >= 2 ? MK[Math.min(o.streak, 6)] : o.head ? 'HEADSHOT' : 'ELIMINATED';
    k.querySelector('.kb-n').textContent = o.name || '';
    k.querySelector('.kb-x').textContent = o.streak >= 2 ? '×' + o.streak : '';
    k.querySelector('.kb-c').textContent = o.coins ? '+' + o.coins : '';
    const cls = (o.head ? ' head' : '') + (o.streak >= 2 ? ' streak s' + Math.min(o.streak, 5) : '');
    k.className = ''; void k.offsetWidth; k.className = 'on' + cls;
    clearTimeout(this._kbTO); this._kbTO = setTimeout(() => { k.className = 'out' + cls; }, 1500 + Math.min(o.streak || 1, 4) * 150);
    if (f) { f.className = ''; void f.offsetWidth; f.className = 'on' + (o.head ? ' head' : '') + (o.streak >= 2 ? ' streak' : ''); }
  }

  // Patch notes page: every update, newest first, with the date it shipped (latest 3 open)
  patchNotes() {
    const list = BR.PATCH_NOTES || [], esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
    this.$('pn-cur').textContent = 'You are on v' + BR.CONFIG.version + ' · ' + list.length + ' updates';
    let lastDate = '';
    this.$('pn-list').innerHTML = list.map((e, i) => {
      const day = e.date !== lastDate ? `<div class="pn-day">${fmt(e.date)}</div>` : ''; lastDate = e.date;
      return day + `<details class="pn-e${i === 0 ? ' latest' : ''}"${i < 3 ? ' open' : ''}><summary><b class="pn-v">v${esc(e.v)}</b><span class="pn-t">${esc(e.title)}</span>${i === 0 ? '<em>LATEST</em>' : ''}<i class="pn-d">${fmt(e.date)}</i></summary><ul>${e.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>`;
    }).join('');
    try { localStorage.setItem('velocity-royale.notesSeen', list[0] ? list[0].v : ''); } catch (e) { /* private mode */ }
    this.notesBadge();
  }
  notesBadge() {
    let seen = ''; try { seen = localStorage.getItem('velocity-royale.notesSeen') || ''; } catch (e) { /* private mode */ }
    const b = this.$('btn-notes'); if (b) b.classList.toggle('fresh', !!(BR.PATCH_NOTES && BR.PATCH_NOTES[0] && seen !== BR.PATCH_NOTES[0].v));
  }

  // ---- zombies HUD
  zmShow(on) { const z = this.$('zm-hud'); if (z) z.classList.toggle('hidden', !on); }
  zmRound(n) { const e = this.$('zm-round'); if (!e) return; e.textContent = n || ''; e.parentElement.classList.remove('flash'); void e.offsetWidth; if (n) e.parentElement.classList.add('flash'); }
  zmPoints(v, delta) {
    this.$('zm-points').textContent = Math.round(v).toLocaleString();
    if (delta) { const pop = document.createElement('i'); pop.className = 'zm-p' + (delta < 0 ? ' neg' : ''); pop.textContent = (delta > 0 ? '+' : '') + delta; pop.style.left = (8 + Math.random() * 30) + 'px';
      const host = this.$('zm-pop'); host.appendChild(pop); setTimeout(() => pop.remove(), 900); }
  }
  zmTimers(insta, dbl) {
    const s = (id, t) => { const e = this.$(id); const on = t > 0; e.classList.toggle('hidden', !on); if (on) e.querySelector('b').textContent = Math.ceil(t); };
    s('zm-insta', insta); s('zm-double', dbl);
  }
  zmBoss(name, frac, col) {
    const b = this.$('zm-boss'); if (!b) return;
    if (!name) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden'); b.querySelector('.zb-name').textContent = name;
    if (col !== undefined) b.style.setProperty('--bc', '#' + col.toString(16).padStart(6, '0'));
    b.querySelector('.zb-bar i').style.width = Math.max(0, frac * 100) + '%';
  }
  zmBanner(t, sub, kind, col) {
    const b = this.$('zm-banner'); b.querySelector('b').textContent = t; b.querySelector('span').textContent = sub || '';
    b.className = ''; void b.offsetWidth; b.className = 'on ' + (kind || ''); b.style.setProperty('--zc', col || '');
  }
  // markers over the last zombies of a round: visible through walls, pinned to the screen edge when off-screen
  zmMarkers(list, cam) {
    const box = this.$('zm-marks'); if (!box) return;
    const pool = this._zmk || (this._zmk = []);
    while (pool.length < list.length) { const d = document.createElement('div'); d.className = 'zmk'; d.innerHTML = '<i></i><b></b>'; box.appendChild(d); pool.push(d); }
    const W = window.innerWidth, H = window.innerHeight, v = this._zmv || (this._zmv = new THREE.Vector3());
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i], z = list[i];
      if (!z || !cam) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      v.set(z.pos.x, z.pos.y + (z.hitbox ? z.hitbox.h : 1.9) + 0.55, z.pos.z).project(cam);
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, off = false;
      if (v.z > 1) { x = W - x; y = H - y; off = true; }                         // behind you: mirror, then clamp
      const m = 34;
      if (x < m || x > W - m || y < m || y > H - m) off = true;
      x = Math.max(m, Math.min(W - m, x)); y = Math.max(m, Math.min(H - m, y));
      el.style.display = '';
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      el.classList.toggle('off', off);
      const d = Math.round(Math.hypot(z.pos.x - cam.position.x, z.pos.z - cam.position.z));
      if (el._d !== d) { el._d = d; el.querySelector('b').textContent = d + 'm'; }
    }
  }
  // v1.19 squads: teammate list (health, downed, out), markers over teammates, the downed overlay
  squadHud(game) {
    const $ = this.$, on = BR.Squads && BR.Squads.on(game), p = game.player;
    this.set('sqOn', $('squad'), !!on, (el, v) => el.classList.toggle('hidden', !v));
    const dn = $('downed');
    this.set('dnOn', dn, !!(on && p.alive && p.downed), (el, v) => el.classList.toggle('hidden', !v));
    if (!on) { if (this._sqk) for (const el of this._sqk) el.style.display = 'none'; return; }
    if (p.downed) {
      const S = BR.Squads, rv = p.reviver;
      this.set('dnBar', dn, Math.round((rv ? p.reviveP / S.REVIVE_T : p.health / S.DOWN_HP) * 100), (el, v) => { $('dn-bar').style.transform = `scaleX(${v / 100})`; });
      this.set('dnSub', dn, rv ? 'BEING REVIVED BY ' + rv.name.toUpperCase() : 'Crawl to cover · bleeding out', (el, v) => { el.classList.toggle('rev', !!rv); $('dn-sub').textContent = v; });
    }
    const mates = BR.Squads.mates(game), A = BR.CONFIG.actor;
    this._sqT = (this._sqT || 0) + 1;
    if (this._sqT % 6 === 0) {
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const row = a => { const st = !a.alive ? 'out' : a.downed ? 'down' : '';
        const hp = a.alive ? (a.downed ? a.health / BR.Squads.DOWN_HP : a.health / A.maxHealth) : 0, sh = a.alive && !a.downed ? a.shield / A.maxShield : 0;
        return `<div class="sq-row ${st}${a.isPlayer ? ' me' : ''}"><b>${esc(a.isPlayer ? 'YOU' : a.name)}</b><i><u style="transform:scaleX(${hp.toFixed(2)})"></u><s style="transform:scaleX(${sh.toFixed(2)})"></s></i><em>${st === 'out' ? '✕' : st === 'down' ? '✚' : ''}</em></div>`; };
      const html = `<div class="sq-h">${BR.Squads.NAMES[game.squad]} · ${BR.Squads.teamsAlive(game)} TEAMS LEFT</div>` + [p].concat(mates).map(row).join('');
      if (html !== this._sqHtml) { this._sqHtml = html; $('squad').innerHTML = html; }
    }
    // markers over teammates (through walls), red + REVIVE when they're down
    const box = $('sq-marks'), pool = this._sqk || (this._sqk = []), cam = game.camera;
    while (pool.length < mates.length) { const d = document.createElement('div'); d.className = 'sqk'; d.innerHTML = '<i></i><b></b>'; box.appendChild(d); pool.push(d); }
    const W = window.innerWidth, H = window.innerHeight, v = this._sqv || (this._sqv = new THREE.Vector3());
    cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i], a = mates[i];
      if (!a || !a.alive || a.mover.dropping && p.mover.dropping) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      v.set(a.pos.x, a.pos.y + a.mover.h + 0.45, a.pos.z).project(cam);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      el.style.display = ''; el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      el.classList.toggle('down', !!a.downed);
      const d = Math.round(a.pos.distanceTo(p.pos)), t = a.downed ? `REVIVE ${d}m` : (d > 12 ? `${a.name} ${d}m` : a.name);
      if (el._t !== t) { el._t = t; el.querySelector('b').textContent = t; }
    }
  }
  // Resurgence: respawn status chip + the redeploy countdown while you're down
  resurgence(on, t) {
    const c = this.$('rs-chip'), k = this.$('rs-count');
    this.set('rsOn', c, on, (el, v) => { el.classList.toggle('off', !v); el.querySelector('b').textContent = v ? 'RESPAWNS ON' : 'NO RESPAWNS'; el.querySelector('span').textContent = v ? 'until circle 4' : 'last one standing'; });
    k.classList.toggle('hidden', t === null);
    if (t !== null) this.set('rsT', k, Math.ceil(t), (el, v) => { el.querySelector('span').textContent = v; });
  }
  zmLeft(n, on) { const e = this.$('zm-left'); if (!e) return; e.classList.toggle('hidden', !on); this.set('zmLeftN', e, n, (el, v) => { el.querySelector('b').textContent = v; }); }
  zmQuest(q) {
    const e = this.$('zm-quest'); if (!e) return;
    if (!q) { e.classList.add('hidden'); return; }
    e.classList.remove('hidden'); e.querySelector('.zq-t').textContent = q.def.title; e.querySelector('.zq-d').textContent = q.def.desc;
    e.querySelector('.zq-bar u').style.width = Math.round(q.n / q.goal * 100) + '%'; e.querySelector('.zq-n').textContent = q.n + ' / ' + q.goal;
    e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse');
  }
  zmLore(title, text) { const e = this.$('zm-lore'); e.querySelector('b').textContent = title; e.querySelector('p').textContent = text; e.className = 'zm-lore'; void e.offsetWidth; e.className = 'zm-lore on'; }
  zmJournal(list) { this._journal = list; const L = this.$('zm-journal').querySelector('.zj-list'); L.innerHTML = list.map((j, i) => `<div class="zj-e"><b>${i ? 'Entry ' + i + ' · ' : ''}${j.title}</b><p>${j.text}</p></div>`).join('') + (list.length < 9 ? '<div class="zj-e lock"><b>More pages are lost...</b><p>Complete quests (every 5 rounds) to recover them.</p></div>' : ''); }
  zmJournalToggle(force) { const e = this.$('zm-journal'); const on = force !== undefined ? force : e.classList.contains('hidden'); e.classList.toggle('hidden', !on); }
  zmCut(story, col) {
    const e = this.$('zm-cut'); if (!e) return;
    if (!story) { e.className = 'zm-cut'; return; }
    e.querySelector('.zc-name').textContent = story.name; e.querySelector('.zc-title').textContent = story.title; e.querySelector('.zc-line').textContent = story.line;
    e.style.setProperty('--cc', '#' + (col || 0xff7a1a).toString(16).padStart(6, '0'));
    e.className = 'zm-cut'; void e.offsetWidth; e.className = 'zm-cut on';
  }
  zmLightning() { const f = this.$('zm-flash'); f.className = ''; void f.offsetWidth; f.className = 'on'; }
  zmNuke() { const f = this.$('zm-flash'); f.className = ''; void f.offsetWidth; f.className = 'on nuke'; }

  // Last-kill freeze frame: desaturate + zoom the frozen view, white flash, speed-line frame
  freeze(on) {
    const play = this.$('play'), f = this.$('freezefx'); if (!play || !f) return;
    play.classList.toggle('freeze', !!on);
    f.classList.remove('on'); if (on) { void f.offsetWidth; f.classList.add('on'); }
  }

  // Victory overlay (null hides it): rays, #1 badge, letter-by-letter VICTORY with a shine sweep,
  // stats counting up, falling confetti. The HUD controls fade out underneath.
  victory(r) {
    const v = this.$('victory'), play = this.$('play'); if (!v) return;
    cancelAnimationFrame(this._vRAF);
    if (!r) { v.classList.add('hidden'); v.classList.remove('on'); play && play.classList.remove('vic'); return; }
    v.classList.remove('hidden'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on'); play && play.classList.add('vic');
    const tgt = { kills: r.kills || 0, damage: Math.round(r.damage || 0), total: r.total || 0 }, t0 = performance.now();
    const els = [...v.querySelectorAll('.v-stats b')];
    const tick = () => { const k = Math.min(1, Math.max(0, (performance.now() - t0 - 1100) / 1300)), e = 1 - Math.pow(1 - k, 3);
      for (const b of els) b.textContent = Math.round(tgt[b.dataset.k] * e);
      if (k < 1) this._vRAF = requestAnimationFrame(tick); };
    tick();
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

  prompt(text, col) {
    this.set('prompt', this.el.prompt, text || '', (el, v) => { el.textContent = v; el.classList.toggle('hidden', !v); });
    this.set('promptCol', this.el.prompt, col || '', (el, v) => { if (v) el.style.setProperty('--pc', v); else el.style.removeProperty('--pc'); el.classList.toggle('rarp', !!v); });
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
      c.font = `600 ${Math.round(S / 34)}px "Outfit", sans-serif`;
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
    if (r.arena) {
      $('end-eyebrow').textContent = r.title + (r.online ? ' · ONLINE' : '');
      $('end-place').textContent = r.draw ? 'DRAW' : r.ffa ? '#' + r.rank : r.win ? 'VICTORY' : 'DEFEAT';
      $('btn-again').textContent = 'PLAY AGAIN';
      $('end-sub').textContent = `${r.by} · ${r.kills} kills · ${r.deaths} deaths`;
    } else if (r.overdrive) {
      $('end-eyebrow').textContent = r.win ? 'OVERDRIVE · VICTORY' : 'OVERDRIVE · OVERRUN';
      $('end-place').textContent = fmtTime(r.time); $('btn-again').textContent = 'PLAY AGAIN';
      $('end-sub').textContent = `${r.by} · level ${r.level} · ${r.kills} kills · ${r.bosses || 0} bosses`;
    } else {
      $('end-eyebrow').textContent = r.zombies ? 'YOU DIED · ZOMBIES' : r.duel ? (r.win ? 'DUEL WON' : 'DUEL LOST') : r.win ? 'VICTORY' : 'ELIMINATED';
      $('end-place').textContent = r.zombies ? `ROUND ${r.round}` : r.duel ? `${r.score[0]} – ${r.score[1]}` : r.win ? '#1' : '#' + r.place;
      $('btn-again').textContent = r.zombies ? 'PLAY AGAIN' : r.duel ? 'REMATCH' : 'QUEUE NEW MATCH';
      $('end-sub').textContent = r.zombies ? `Survived ${Math.max(0, r.round - 1)} rounds · ${r.kills} zombies · ${r.bosses || 0} bosses · ${(r.points || 0).toLocaleString()} points` : r.duel ? r.by : r.win ? (r.squad > 1 ? `${BR.Squads.NAMES[r.squad]} · last team standing out of ${r.teams}.` : `Last one standing out of ${r.total}.`) : `${r.by} · out of ${r.squad > 1 ? r.teams + ' teams' : r.total}`;
    }
    if (BR.game && BR.game.resurgence && !r.overdrive) $('end-eyebrow').textContent = 'RESURGENCE · ' + $('end-eyebrow').textContent;
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
      else if (r.ranked === false && !r.zombies && !r.overdrive) ec.innerHTML += `<div class="rprow casual"><span>Casual match</span><b>No RP · play Ranked to climb</b></div>`;
      const X = r.coins.xp;
      if (X) ec.innerHTML += `<div class="xprow"><span>+${X.total.toLocaleString()} XP</span><b>${X.after > X.before ? `LEVEL ${X.before} → <em>${X.after}</em>` : 'LEVEL ' + X.after}</b><u><s style="width:${(X.into / X.need * 100).toFixed(1)}%"></s></u></div>`
        + (X.unlocked.length ? `<div class="rprow up"><span>Unlocked</span><b>${X.unlocked.join(', ')}</b></div>` : '');
    } else ec.innerHTML = '<div class="tot"><span>PRACTICE · NO COINS</span><b></b></div>';
    this.show('end', true);
  }
};

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
BR.fmtTime = fmtTime;
