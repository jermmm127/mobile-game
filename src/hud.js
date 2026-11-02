'use strict';
// =============================================================================
// HUD — builds all DOM (menus, HUD, touch buttons) and updates it.
// Only touches the DOM when a value actually changed.
// =============================================================================
const ICON = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M5 14l7-7 7 7M5 20l7-7 7 7"/></svg>',
  slide: '<svg viewBox="0 0 24 24"><path d="M4 7l7 7h9M15 9l5 5-5 5"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
};

BR.HUD = class HUD {
  constructor(mount) {
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
    <div class="pill"><span class="lbl">Alive</span><span id="alive" class="num">20</span></div>
    <div class="pill"><span class="lbl">Kills</span><span id="kills" class="num">0</span></div>
    <div class="pill zone"><span class="lbl" id="zone-lbl">Zone</span><span id="zone-time" class="num">0:45</span></div>
  </div>
  <button class="btn pause" data-act="pause" aria-label="Pause">${ICON.pause}</button>
  <div id="killfeed"></div>
  <canvas id="minimap" width="220" height="220"></canvas>
  <div id="fps"></div>
  <div id="toast"></div>
  <div id="state-tag"></div>

  <div id="bottom">
    <div id="slots">
      <div class="slot" data-act="slot0"><span class="sname">—</span><span class="sammo"></span></div>
      <div class="slot" data-act="slot1"><span class="sname">—</span><span class="sammo"></span></div>
    </div>
    <div id="ammo"><span id="mag" class="num">0</span><span class="sep">/</span><span id="reserve" class="num">0</span><div id="reload-bar"><i></i></div></div>
    <div id="vitals">
      <div class="bar shield"><i id="shield-fill"></i><span id="shield-txt">0</span></div>
      <div class="bar health"><i id="health-fill"></i><span id="health-txt">100</span></div>
    </div>
  </div>

  <button id="prompt" class="btn prompt hidden" data-act="interact">Swap</button>

  <div id="joy-base"><div id="joy-knob"></div></div>
  <div id="joy-hint" class="touch-only">Drag to move</div>
  <div id="look-hint" class="touch-only">Drag to look</div>
  <button class="btn act firel touch-only" data-act="firel" aria-label="Fire">${ICON.fire}</button>
  <button class="btn act fire touch-only" data-act="fire" aria-label="Fire">${ICON.fire}<span>Fire</span></button>
  <button class="btn act jump touch-only" data-act="jump" aria-label="Jump">${ICON.jump}<span>Jump</span></button>
  <button class="btn act slide touch-only" data-act="slide" aria-label="Slide">${ICON.slide}<span>Slide</span></button>
  <button class="btn act reload touch-only" data-act="reload" aria-label="Reload">${ICON.reload}</button>
  <button class="btn act ads touch-only" data-act="ads" aria-label="Aim">${ICON.ads}<span>Aim</span></button>
</div>

<div id="menu" class="overlay">
  <div class="menu-card">
    <div class="brand">
      <div class="eyebrow">Prototype ${BR.CONFIG.version} · offline</div>
      <h1>Velocity<br>Royale</h1>
      <p class="tag">Drop in. Slide, wall-run, out-move ${BR.CONFIG.match.defaultBots} bots. Last one standing wins.</p>
      <button id="btn-play" class="cta">Drop in</button>
      <div id="rotate-hint">Turn your phone sideways for the best view.</div>
    </div>
    <div class="settings">
      <div class="row"><label>Bots</label><div class="seg" id="set-diff">
        <button data-v="easy">Easy</button><button data-v="normal">Normal</button><button data-v="hard">Hard</button></div></div>
      <div class="row"><label for="set-bots">Players</label><input id="set-bots" type="range" min="6" max="30" step="1"><output id="out-bots"></output></div>
      <div class="row"><label for="set-sens">Look speed</label><input id="set-sens" type="range" min="0.3" max="3" step="0.05"><output id="out-sens"></output></div>
      <div class="row"><label>Graphics</label><div class="seg" id="set-gfx">
        <button data-v="low">Low</button><button data-v="medium">Med</button><button data-v="high">High</button></div></div>
      <div class="row"><label for="set-vol">Volume</label><input id="set-vol" type="range" min="0" max="1" step="0.05"><output id="out-vol"></output></div>
      <div class="row toggles">
        <label class="tg"><input type="checkbox" id="set-assist"> Aim assist</label>
        <label class="tg"><input type="checkbox" id="set-auto"> Auto-fire</label>
        <label class="tg"><input type="checkbox" id="set-fps"> Show FPS</label>
      </div>
      <details class="help">
        <summary>Controls</summary>
        <p><b>Phone:</b> left thumb drags to move. Right side drags to look. Hold <b>Fire</b> and drag it to aim while shooting. Tap a weapon slot to switch.</p>
        <p><b>Keyboard:</b> WASD move · Mouse look · Click fire · Right-click aim · Space jump · Shift/C slide · R reload · 1/2 or Q switch · E swap pickup · Esc pause</p>
        <p><b>Movement:</b> Slide while running for a speed boost, then jump out of it to keep it. Jump at a tall wall while holding forward to wall-run, and jump again to kick off. Run into ledges to vault or climb them.</p>
      </details>
    </div>
  </div>
</div>

<div id="pause" class="overlay hidden">
  <div class="panel">
    <h2>Paused</h2>
    <button id="btn-resume" class="cta">Resume</button>
    <button id="btn-quit" class="ghost">Leave match</button>
  </div>
</div>

<div id="end" class="overlay hidden">
  <div class="panel">
    <div class="eyebrow" id="end-eyebrow">Eliminated</div>
    <div id="end-place" class="place">#7</div>
    <div id="end-sub" class="end-sub"></div>
    <div class="stats">
      <div><span class="num" id="end-kills">0</span><span class="lbl">Kills</span></div>
      <div><span class="num" id="end-dmg">0</span><span class="lbl">Damage</span></div>
      <div><span class="num" id="end-time">0:00</span><span class="lbl">Survived</span></div>
    </div>
    <button id="btn-again" class="cta">Drop again</button>
    <button id="btn-menu" class="ghost">Menu</button>
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
      stateTag: $('state-tag'), adsBtn: document.querySelector('.btn.ads'),
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
    const alive = game.aliveCount();
    this.set('alive', e.alive, alive);
    this.set('kills', e.kills, p.kills);
    const z = game.zone;
    let lbl, t;
    if (z.state === 'done') { lbl = 'Final'; t = '—'; }
    else if (z.state === 'wait') { lbl = 'Zone in'; t = fmtTime(z.timer); }
    else { lbl = 'Closing'; t = fmtTime(z.timer); }
    this.set('zl', e.zoneLbl, lbl);
    this.set('zt', e.zoneTime, t);

    const A = BR.CONFIG.actor;
    this.set('hp', e.healthFill, Math.ceil(Math.max(0, p.health)), (el, v) => { el.style.transform = `scaleX(${v / A.maxHealth})`; e.healthTxt.textContent = v; });
    this.set('sh', e.shieldFill, Math.ceil(p.shield), (el, v) => { el.style.transform = `scaleX(${v / A.maxShield})`; e.shieldTxt.textContent = v; });

    const w = p.weapon;
    this.set('mag', e.mag, w ? w.mag : '–');
    this.set('res', e.reserve, w ? p.ammo[w.def.ammo] : '–');
    const rel = w && w.reloadT > 0 ? 1 - w.reloadT / w.def.reload : -1;
    this.set('rel', e.reloadBar, rel < 0 ? -1 : Math.round(rel * 40), (el, v) => {
      el.classList.toggle('on', v >= 0);
      e.reloadFill.style.transform = `scaleX(${Math.max(0, v) / 40})`;
    });
    p.slots.forEach((s, i) => {
      const key = s ? `${s.id}|${s.mag}|${i === p.cur}` : 'empty' + i;
      this.set('slot' + i, e.slots[i], key, el => {
        el.classList.toggle('active', i === p.cur && !!s);
        el.classList.toggle('empty', !s);
        el.firstElementChild.textContent = s ? s.def.name : 'Empty';
        el.lastElementChild.textContent = s ? `${s.mag}/${s.def.mag}` : '';
        el.style.setProperty('--wc', s ? '#' + s.def.color.toString(16).padStart(6, '0') : 'transparent');
      });
    });
    this.set('ads', e.adsBtn, p.ads, (el, v) => el.classList.toggle('on-toggle', v));

    // Crosshair gap from current spread
    if (w) {
      const spread = BR.Weapons.spread(p, w);
      const px = Math.round(spread * (window.innerHeight / 2) / Math.tan(game.camera.fov * Math.PI / 360));
      this.set('cx', e.crosshair, Math.max(4, Math.min(px, 90)), (el, v) => el.style.setProperty('--gap', v + 'px'));
    }
    const scoped = p.ads && w && w.def.scope && p.alive;
    this.set('scope', e.scope, !!scoped, (el, v) => { el.classList.toggle('on', v); e.crosshair.classList.toggle('hide', v); });

    // Low health vignette + storm tint
    const hurt = 1 - Math.max(0, p.health) / A.maxHealth;
    this.set('vig', e.vignette, Math.round(hurt * 20), (el, v) => (el.style.opacity = Math.max(0, (v / 20) - 0.25)));
    this.set('zt2', e.zoneTint, p.alive && z.outside(p.pos), (el, v) => el.classList.toggle('on', v));

    // Movement state tag (helps when tuning movement)
    const m = p.mover;
    const tag = m.dropping ? 'SKYDIVE' : m.wallRunning ? 'WALL-RUN' : m.sliding ? 'SLIDE' : '';
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
    $('end-eyebrow').textContent = r.win ? 'Victory' : 'Eliminated';
    $('end-place').textContent = r.win ? '#1' : '#' + r.place;
    $('end-sub').textContent = r.win ? `Last one standing out of ${r.total}.` : `${r.by} · out of ${r.total}`;
    $('end-kills').textContent = r.kills;
    $('end-dmg').textContent = Math.round(r.damage);
    $('end-time').textContent = fmtTime(r.time);
    $('end').classList.toggle('win', !!r.win);
    this.show('end', true);
  }
};

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
BR.fmtTime = fmtTime;
