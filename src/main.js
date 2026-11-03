'use strict';
// =============================================================================
// MAIN — boot, menu / settings / shop wiring. Settings persist per device.
// =============================================================================
(function boot() {
  const DEFAULTS = { difficulty: 'normal', bots: BR.CONFIG.match.defaultBots, duel: { diff: 'normal', target: 5, roundTime: 90, loadout: ['rifle', 'shotgun'] }, sens: 1.0, aimSmooth: 0.3, sensX: 1, sensY: 1, sensAds: 1, sensScope: 1, sensFire: 1, sensCurve: 0, gyro: 'off', gyroSens: 1, gyroInvX: false, gyroInvY: false, stretch: 0, saturation: 1, fov: BR.CONFIG.camera.fov, gfx: 'medium', highlight: 'subtle', volume: 0.6, assist: true, autoFire: false, showFps: false,
    xh: { style: 'cross', color: '#ffffff', len: 8, thick: 2, gap: 6, op: 1, dot: true, ol: true, dyn: true } };
  const stored = BR.util.load('velocity-royale.settings', {});
  if (stored.bots === undefined && typeof stored.players === 'number') stored.bots = Math.max(0, stored.players - 1); // v0.2 -> v0.3
  const settings = Object.assign({}, DEFAULTS, stored);
  settings.xh = Object.assign({}, DEFAULTS.xh, stored.xh || {});
  settings.duel = Object.assign({}, DEFAULTS.duel, stored.duel || {});
  const save = () => BR.util.save('velocity-royale.settings', settings);
  BR.Accounts.load();
  BR.Profile.load();
  setTimeout(() => daily(), 0);

  let game;
  try {
    game = new BR.Game(settings);
  } catch (err) {
    document.getElementById('app').innerHTML =
      '<div class="fatal"><h2>This device could not start 3D graphics.</h2><p>Try another browser, or turn off battery saver. (' +
      String(err && err.message || err).replace(/</g, '&lt;') + ')</p></div>';
    return;
  }
  document.body.classList.add('in-menu');
  BR.game = game; // handy in the browser console: BR.game.player.mover.vel
  BR.Audio.setVolume(settings.volume);

  const $ = id => document.getElementById(id);
  BR.updateCoins = () => {
    $('menu-coins').textContent = BR.Profile.coinsLabel();
    $('acct-name').textContent = BR.Accounts.displayName();
    $('acct-sub').textContent = BR.Accounts.current() ? (BR.Profile.infinite() ? 'Dev · infinite coins' : 'Signed in') : 'Sign in';
    $('acct-avatar').textContent = BR.Accounts.displayName()[0].toUpperCase();
  };
  BR.updateCoins();

  // ---- settings panel --------------------------------------------------------
  const seg = (id, key, after) => {
    const el = $(id);
    const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === settings[key]));
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      settings[key] = b.dataset.v; save(); sync();
      if (after) after();
    });
    sync();
  };
  const range = (id, key, fmt, after) => {
    const el = $(id), out = $(id.replace('set-', 'out-'));
    el.value = settings[key];
    const show = () => { out.textContent = fmt(settings[key]); };
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); save(); show(); if (after) after(); });
    show();
  };
  const check = (id, key) => {
    const el = $(id);
    el.checked = !!settings[key];
    el.addEventListener('change', () => { settings[key] = el.checked; save(); });
  };
  seg('set-diff', 'difficulty');
  seg('set-gfx', 'gfx', () => game.applyGraphics());
  if (!settings.highlight) settings.highlight = 'subtle';
  seg('set-hl', 'highlight', () => game.applyHighlight());
  $('set-bots').max = BR.CONFIG.match.maxBots;
  range('set-bots', 'bots', v => v === 0 ? 'NONE' : v + '');
  range('set-sens', 'sens', v => v.toFixed(2) + '×');
  range('set-fov', 'fov', v => v + '°');
  range('set-stretch', 'stretch', v => v === 0 ? 'OFF' : Math.round(v * 100) + '%', () => game.resize());
  range('set-sat', 'saturation', v => Math.round(v * 100) + '%', () => game.applyColor());
  range('set-smooth', 'aimSmooth', v => v === 0 ? 'OFF' : Math.round(v * 100) + '%');
  // advanced sensitivity
  const mult = v => v.toFixed(2) + '×';
  for (const k of ['sensX', 'sensY', 'sensAds', 'sensScope', 'sensFire']) { if (settings[k] === undefined) settings[k] = 1; range('set-' + k, k, mult); }
  if (settings.sensCurve === undefined) settings.sensCurve = 0;
  range('set-sensCurve', 'sensCurve', v => v === 0 ? 'LINEAR' : Math.round(v * 100) + '%');
  if (settings.gyroSens === undefined) settings.gyroSens = 1;
  range('set-gyroSens', 'gyroSens', mult);
  if (!settings.gyro) settings.gyro = 'off';
  seg('set-gyro', 'gyro', () => { if (settings.gyro !== 'off') game.input.enableGyro().then(ok => { if (!ok) { settings.gyro = 'off'; save(); $('set-gyro').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === 'off')); game.hud.toast('Gyro not available on this device', 1600); } }); });
  check('set-gyroInvX', 'gyroInvX'); check('set-gyroInvY', 'gyroInvY');
  $('set-sensReset').addEventListener('click', () => {
    Object.assign(settings, { sensX: 1, sensY: 1, sensAds: 1, sensScope: 1, sensFire: 1, sensCurve: 0, gyroSens: 1 });
    for (const k of ['sensX', 'sensY', 'sensAds', 'sensScope', 'sensFire', 'sensCurve', 'gyroSens']) { const el = $('set-' + k); el.value = settings[k]; el.dispatchEvent(new Event('input')); }
    save();
  });
  if (settings.gyro !== 'off') game.input.enableGyro();
  range('set-vol', 'volume', v => Math.round(v * 100) + '%', () => BR.Audio.setVolume(settings.volume));
  check('set-assist', 'assist');
  check('set-auto', 'autoFire');
  check('set-fps', 'showFps');
  // ---- crosshair editor -------------------------------------------------------
  const X = settings.xh;
  BR.xh = X;
  const applyXh = () => {
    document.querySelectorAll('.xh').forEach(el => {
      el.style.setProperty('--len', X.len + 'px');
      el.style.setProperty('--thick', X.thick + 'px');
      el.style.setProperty('--xc', X.color);
      el.style.setProperty('--xo', X.op);
      if (el.id === 'xh-prev') el.style.setProperty('--gap', X.gap + 'px');
      el.classList.remove('s-cross', 's-crossdot', 's-dot', 's-circle', 's-tee');
      el.classList.add('s-' + X.style);
      el.classList.toggle('nodot', !X.dot && X.style !== 'dot' && X.style !== 'crossdot' && X.style !== 'circle');
      el.classList.toggle('ol', X.ol);
    });
    $('xh-style').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === X.style));
    $('xh-color').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === X.color));
    game.hud.cache.cx = undefined; // re-apply the in-game gap
  };
  $('xh-style').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; X.style = b.dataset.v; save(); applyXh(); });
  $('xh-color').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; X.color = b.dataset.v; save(); applyXh(); });
  for (const [id, key, fmt] of [['xh-len', 'len', v => v], ['xh-thick', 'thick', v => v], ['xh-gap', 'gap', v => v], ['xh-op', 'op', v => Math.round(v * 100) + '%']]) {
    const el = $(id), out = $(id + '-o');
    el.value = X[key]; out.textContent = fmt(X[key]);
    el.addEventListener('input', () => { X[key] = parseFloat(el.value); out.textContent = fmt(X[key]); save(); applyXh(); });
  }
  for (const [id, key] of [['xh-dot', 'dot'], ['xh-ol', 'ol'], ['xh-dyn', 'dyn']]) {
    const el = $(id); el.checked = !!X[key];
    el.addEventListener('change', () => { X[key] = el.checked; save(); applyXh(); });
  }
  applyXh();

  const openSettings = () => $('settings').classList.remove('hidden');
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-settings2').addEventListener('click', openSettings);
  $('settings-back').addEventListener('click', () => $('settings').classList.add('hidden'));

  // ---- fullscreen ------------------------------------------------------------
  const fsTip = () => $('fs-tip').classList.remove('hidden');
  const toggleFs = () => BR.Fullscreen.toggle(fsTip);
  const tryFullscreen = () => {
    // Quietly try on Play (Android/iPad); never nag here.
    if (!BR.Fullscreen.el() && BR.Fullscreen.supported() && window.matchMedia('(pointer: coarse)').matches) BR.Fullscreen.toggle(() => {});
  };
  $('btn-fs').addEventListener('click', toggleFs);
  $('fs-game').addEventListener('click', toggleFs);
  $('fs-tip-ok').addEventListener('click', () => $('fs-tip').classList.add('hidden'));
  if (BR.Fullscreen.standalone()) { document.body.classList.add('standalone'); $('btn-fs').classList.add('hidden'); }

  // ---- HUD editor + shop -----------------------------------------------------
  const layout = new BR.Layout(settings, save, game.input);
  BR.layout = layout;
  $('btn-hud').addEventListener('click', () => layout.open());
  $('btn-hud2').addEventListener('click', () => layout.open());
  const shop = new BR.Shop(game);
  const inv = BR.inventory = new BR.Inventory(game, shop);
  // which gun a camo from a case drop goes on: the gun picked in the inventory / shop chips
  BR.shopWeapon = () => (inv.weapon && inv.weapon !== 'all' && inv.weapon) || (shop.weapon && shop.weapon !== 'all' && shop.weapon) || 'rifle';
  $('btn-inv').addEventListener('click', () => { BR.Audio.init(); inv.open(); });
  $('shop-inv').addEventListener('click', () => { shop.close(); inv.open(); });
  BR.shop = shop;
  $('btn-shop').addEventListener('click', () => { BR.Audio.init(); shop.open(); });

  // ---- accounts --------------------------------------------------------------
  let acctMode = 'login';
  const renderAccount = () => {
    const signed = !!BR.Accounts.current(), P = BR.Profile.data;
    $('acct-out').classList.toggle('hidden', signed);
    $('acct-in').classList.toggle('hidden', !signed);
    $('acct-msg').textContent = '';
    document.querySelectorAll('#acct-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.v === acctMode));
    $('acct-submit').textContent = acctMode === 'login' ? 'Sign in' : 'Create account';
    if (signed) {
      $('acct-me').textContent = BR.Accounts.current();
      $('acct-coins').textContent = BR.Profile.coinsLabel();
      $('acct-stats').textContent = `${P.stats.matches} matches · ${P.stats.wins} wins · ${P.stats.kills} kills · K/D ${BR.Profile.kd().toFixed(2)}`;
      $('acct-dev').classList.toggle('hidden', !BR.Profile.infinite());
    }
  };
  // daily login reward: streak coins, a Nova Case key every 3rd day
  const daily = () => { const r = BR.Profile.claimDaily(); if (!r) return;
    setTimeout(() => { game.hud.toast(`DAILY REWARD · Day ${r.streak} streak · +${r.coins} coins${r.key ? ' · +1 NOVA CASE KEY' : ''}`, 3200); BR.Audio.coin && BR.Audio.coin(); BR.updateCoins(); }, 700); };
  const afterAuth = () => { BR.Profile.load(); daily(); game.refreshCosmetics(); BR.updateCoins(); renderAccount(); };
  $('acct-chip').addEventListener('click', () => { renderAccount(); $('account').classList.remove('hidden'); });
  $('acct-close').addEventListener('click', () => $('account').classList.add('hidden'));
  $('acct-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; acctMode = b.dataset.v; renderAccount(); });
  $('acct-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fn = acctMode === 'login' ? 'logIn' : 'signUp';
    const r = await BR.Accounts[fn]($('acct-user').value, $('acct-pass').value);
    if (!r.ok) { $('acct-msg').textContent = r.msg; return; }
    $('acct-pass').value = '';
    afterAuth();
  });
  $('acct-logout').addEventListener('click', () => { BR.Accounts.logOut(); afterAuth(); });
  $('acct-redeem').addEventListener('click', async () => {
    const r = await BR.Accounts.redeem($('acct-code').value);
    $('acct-code').value = '';
    BR.updateCoins(); renderAccount();
    $('acct-msg').textContent = r.msg;
    if (r.ok) BR.Audio.coin();
  });
  BR.updateCoins();

  // ---- match flow ------------------------------------------------------------
  // Matchmaking queue: one life per match, so every new match goes through here
  let qTimer = null;
  const TIPS = ['One life. If you go down, you\'re out.', 'Hold jump in the drop to pop your chute early.', 'Slide-jump timing keeps your speed.', 'The Hunting Rifle is deadly from the hip.', 'Grapple anything: walls, rocks, trees.'];
  const cancelQueue = () => { clearInterval(qTimer); qTimer = null; game.hud.show('queue', false); };
  const play = () => {
    BR.Audio.init(); tryFullscreen();
    if (qTimer) return;
    const total = Math.max(1, (settings.bots | 0) + 1);
    game.hud.show('end', false); game.hud.show('pause', false);
    const q = $('queue');
    q.classList.remove('found');
    $('q-total').textContent = total;
    $('q-tip').textContent = TIPS[Math.random() * TIPS.length | 0];
    const dur = 1.6 + Math.random() * 1.4, t0 = performance.now();
    let n = 1;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1000 / dur);
      n = Math.max(n, Math.min(total, 1 + Math.round((total - 1) * (1 - Math.pow(1 - k, 1.6)))));
      $('q-n').textContent = n;
      $('q-fill').style.width = (k * 100) + '%';
      if (k >= 1) {
        clearInterval(qTimer); qTimer = 'found';
        q.classList.add('found');
        q.querySelector('.q-title').textContent = 'MATCH FOUND';
        setTimeout(() => {
          qTimer = null;
          q.querySelector('.q-title').textContent = 'FINDING MATCH';
          game.hud.show('queue', false);
          game.startMatch();
        }, 550);
      }
    };
    game.hud.show('queue', true);
    tick();
    qTimer = setInterval(tick, 100);
  };
  $('q-cancel').addEventListener('click', () => { if (qTimer !== 'found') { cancelQueue(); if (game.state !== 'menu') game.toMenu(); } });
  const practice = () => { BR.Audio.init(); tryFullscreen(); game.startMatch({ practice: true }); };
  $('btn-practice').addEventListener('click', practice);
  // spawn menu
  // weapon cards with pictures of the real models
  BR.WeaponIcons.build();
  const gcard = (id, attrs, sel) => { const d = BR.CONFIG.weapons[id], pic = BR.WeaponIcons.pic[id];
    return `<button class="gcard${sel ? ' sel' : ''}" ${attrs}>${pic ? `<img src="${pic}" alt="">` : ''}<span>${d.name.toUpperCase()}</span></button>`; };
  $('sp-weapons').innerHTML = Object.keys(BR.CONFIG.weapons).filter(id => !BR.CONFIG.weapons[id].melee)
    .map(id => gcard(id, `data-sp="weapon" data-arg="${id}"`)).join('');
  // two-gun loadout: pick the slot, then tap a weapon card to put it there
  let spSlot = 0;
  BR.renderSpawnSlots = fresh => {
    const p = game.player; if (!p) return;
    if (fresh) spSlot = !p.slots[0] ? 0 : !p.slots[1] ? 1 : (p.cur === 1 ? 1 : 0);
    document.querySelectorAll('#sp-slots button').forEach(b => {
      const k = +b.dataset.slot, w = p.slots[k];
      b.classList.toggle('sel', k === spSlot);
      b.querySelector('i').textContent = w ? w.def.name.toUpperCase() : 'EMPTY';
    });
    document.querySelectorAll('#sp-weapons .gcard').forEach(c => {
      const id = c.dataset.arg, tags = [0, 1].filter(k => p.slots[k] && p.slots[k].id === id).map(k => k + 1);
      let bd = c.querySelector('.gbadge');
      if (tags.length) { if (!bd) { bd = document.createElement('em'); bd.className = 'gbadge'; c.appendChild(bd); } bd.textContent = tags.join('+'); }
      else if (bd) bd.remove();
      c.classList.toggle('held', tags.length > 0);
    });
  };
  $('sp-slots').addEventListener('click', e => {
    const b = e.target.closest('button[data-slot]'); if (!b) return;
    spSlot = +b.dataset.slot; BR.Audio.click(); BR.renderSpawnSlots();
  });
  $('spawnmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-sp]');
    if (!b) return;
    if (b.dataset.sp === 'weapon') {
      const p = game.player;
      game.practiceSpawn('weapon', b.dataset.arg, spSlot);
      if (spSlot === 0 && p && !p.slots[1]) spSlot = 1;        // first gun in -> second slot next
      BR.renderSpawnSlots(); BR.Audio.pickup();
      b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 300);
      return;
    }
    game.practiceSpawn(b.dataset.sp, b.dataset.arg);
    BR.Audio.pickup();
    b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 300);
  });
  $('sp-close').addEventListener('click', () => game.closeSpawnMenu());
  $('sp-x').addEventListener('click', () => game.closeSpawnMenu());
  $('btn-play').addEventListener('click', play);
  $('btn-again').addEventListener('click', () => {
    if (game.result && game.result.duel && game.lastDuel) { BR.Audio.init(); game.startDuel(game.lastDuel); }   // rematch, same settings
    else play();
  });

  // ---- 1v1 duel menu: setup (difficulty, rounds, time + loadout) and between-round loadouts
  const DS = settings.duel, GUNS = ['rifle', 'holoar', 'smg', 'lmg', 'shotgun', 'dmr', 'sniper', 'hunter', 'revolver', 'pistol'];
  let dmMode = 'setup', dmTimer = null;
  const dmSeg = (id, key, num) => {
    const el = $(id), sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('sel', String(DS[key]) === b.dataset.v));
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; DS[key] = num ? +b.dataset.v : b.dataset.v; save(); sync(); });
    sync();
  };
  dmSeg('dm-diff', 'diff'); dmSeg('dm-target', 'target', true); dmSeg('dm-time', 'roundTime', true);
  const dmGuns = () => {
    for (const k of [0, 1]) $('dm-g' + k).innerHTML = GUNS.map(id => gcard(id, `data-slot="${k}" data-gun="${id}"`, DS.loadout[k] === id)).join('');
  };
  $('duelmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-gun]');
    if (!b) return;
    const k = +b.dataset.slot, o = 1 - k;
    if (DS.loadout[o] === b.dataset.gun) DS.loadout[o] = DS.loadout[k];      // same gun in both slots -> swap them
    DS.loadout[k] = b.dataset.gun; save(); dmGuns(); BR.Audio.click();
  });
  const dmClose = () => { clearInterval(dmTimer); dmTimer = null; game.hud.show('duelmenu', false); };
  const dmGo = () => {
    BR.Audio.init();
    if (dmMode === 'setup') { dmClose(); tryFullscreen(); game.startDuel({ diff: DS.diff, target: DS.target, roundTime: DS.roundTime, loadout: DS.loadout }); }
    else if (game.duel) { dmClose(); game.duel.loadout = DS.loadout.slice(); game.startRound(); }
  };
  BR.openDuelMenu = mode => {
    dmMode = mode; dmGuns();
    const m = $('duelmenu'); m.classList.toggle('round', mode === 'round');
    $('dm-x').style.display = mode === 'round' ? 'none' : '';
    if (mode === 'round') {
      const D = game.duel;
      $('dm-title').textContent = `ROUND ${D.round + 1}`;
      $('dm-sub').textContent = `YOU ${D.score[0]} – ${D.score[1]} BOT · first to ${D.target} · change your loadout`;
      let left = 12; $('dm-go').textContent = `READY (${left})`;
      clearInterval(dmTimer);
      dmTimer = setInterval(() => { left--; if (left <= 0) dmGo(); else $('dm-go').textContent = `READY (${left})`; }, 1000);
    } else {
      $('dm-title').textContent = '1V1 DUEL';
      $('dm-sub').textContent = 'The Yard · you vs a bot · pick your loadout';
      $('dm-go').textContent = 'START DUEL';
    }
    game.hud.show('duelmenu', true);
  };
  // ---- Release Case: CS-style reel that decelerates onto the drop
  const RCOL = { Rare: '#4b8bff', Epic: '#b26bff', Legendary: '#ffb224', Mythic: '#ff3df2', Exotic: '#ff3b30' };
  const CAT_LABEL = { blueprints: 'Blueprint', skins: 'Camo', gloves: 'Gloves', tracers: 'Tracer', feeds: 'Kill feed' };
  const caseCard = (e, extra) => {
    const nm = e.item.name + (e.cat === 'blueprints' ? ' · ' + BR.CONFIG.weapons[e.id.split(':')[0]].name : '');
    const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
    const ck = e.cat + ':' + e.id, sp = BR.WeaponIcons && BR.WeaponIcons.spin[ck], cp = BR.WeaponIcons && BR.WeaponIcons.cpic[ck];
    const sw = sp ? `<i class="cc-spin" style="background-image:url(${sp})"></i>` : cp ? `<img class="cc-img" data-ck="${ck}" src="${cp}" alt="">` : e.cat === 'blueprints'
      ? `<i class="sw cbp" style="background:linear-gradient(135deg,${hex(e.item.body)} 0 45%,${hex(e.item.accent)} 45% 70%,${hex(e.item.glow)} 70%);box-shadow:0 0 12px ${hex(e.item.glow)}"></i>`
      : shop.swatch(e.cat, e.id, e.item);
    return `<div class="cs-card r-${e.item.rarity}${extra || ''}" style="--rc:${RCOL[e.item.rarity]}">${sw}<span class="cc-cat">${CAT_LABEL[e.cat]}</span><span class="cc-name">${nm}</span></div>`;
  };
  let caseBusy = false, lastDrop = null, curCase = 'release';
  const caseRefresh = () => {
    $('cs-coins').textContent = BR.Profile.coinsLabel();
    const all = BR.CaseItems.all(curCase), C = BR.CASES[curCase], order = ['Exotic', 'Mythic', 'Legendary', 'Epic', 'Rare'];
    $('cs-odds').innerHTML = order.filter(t => C.odds[t]).map(t => `<span style="--rc:${RCOL[t]}"><b>${t}</b> ${C.odds[t]}%</span>`).join('');
    $('cs-title').textContent = C.name.toUpperCase(); $('cs-label').textContent = C.label; $('cs-sub').textContent = C.sub; $('cs-price').textContent = BR.Profile.keys(curCase) > 0 ? 'FREE KEY ×' + BR.Profile.keys(curCase) : C.price;
    $('cs-case').classList.toggle('nova', curCase === 'nova');
    document.querySelectorAll('#cs-pick button').forEach(b => b.classList.toggle('sel', b.dataset.c === curCase));
    $('cs-grid').innerHTML = order.flatMap(t => all.filter(e => e.item.rarity === t)).map(e => caseCard(e, BR.Profile.owns(e.cat, e.id) ? ' owned' : '')).join('');
  };
  // spin the case items: render turntables in the background and swap them in as they finish
  const spinCase = () => BR.WeaponIcons.queueSpins(BR.CaseItems.all(curCase), (key, url) => {
    document.querySelectorAll('#cases img.cc-img').forEach(im => { if (im.dataset.ck === key) { const i = document.createElement('i'); i.className = 'cc-spin'; i.style.backgroundImage = `url(${url})`; im.replaceWith(i); } });
  });
  const openCasePanel = () => { setTimeout(spinCase, 60); $('cs-result').classList.add('hidden'); $('cs-equip').classList.add('hidden'); $('cs-reel').classList.add('hidden'); $('cs-case').classList.remove('hidden'); caseRefresh(); game.hud.show('cases', true); };
  $('btn-cases').addEventListener('click', () => { BR.Audio.init(); openCasePanel(); });
  $('cs-pick').addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (!b || caseBusy) return; curCase = b.dataset.c; BR.Audio.click(); openCasePanel(); });
  $('cs-x').addEventListener('click', () => { if (!caseBusy) { game.hud.show('cases', false); BR.updateCoins(); } });
  $('cs-open').addEventListener('click', () => {
    if (caseBusy) return;
    const r = BR.Profile.openCase(curCase);
    if (!r) { BR.Audio.click(); $('cs-result').classList.remove('hidden'); $('cs-result').innerHTML = '<div class="cs-msg">Not enough coins</div>'; return; }
    caseBusy = true; lastDrop = r;
    $('cs-coins').textContent = BR.Profile.coinsLabel();
    $('cs-result').classList.add('hidden'); $('cs-equip').classList.add('hidden'); $('cs-inspect').classList.add('hidden');
    $('cs-case').classList.add('hidden'); $('cs-reel').classList.remove('hidden');
    // reel: 56 cards, the drop at index 50
    const N = 56, WIN = 50, cards = [];
    for (let i = 0; i < N; i++) cards.push(i === WIN ? r : BR.CaseItems.roll(curCase));
    const strip = $('cs-strip');
    strip.style.transition = 'none'; strip.style.transform = 'translateX(0)';
    strip.innerHTML = cards.map((e, i) => caseCard(e, i === WIN ? ' win' : '')).join('');
    void strip.offsetWidth;
    const cw = strip.children[0].getBoundingClientRect().width + 8, view = $('cs-reel').clientWidth;
    const target = WIN * cw + cw / 2 - view / 2 + (Math.random() - 0.5) * cw * 0.6;
    strip.style.transition = 'transform 5.6s cubic-bezier(.06,.62,.12,1)';
    strip.style.transform = `translateX(${-target}px)`;
    // ticks as cards pass the marker
    let lastIdx = -1; const t0 = performance.now();
    const tick = () => {
      const m = new DOMMatrix(getComputedStyle(strip).transform), x = -m.m41, idx = Math.floor((x + view / 2) / cw);
      if (idx !== lastIdx) { lastIdx = idx; BR.Audio.click(); }
      if (performance.now() - t0 < 5700) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => {
      caseBusy = false;
      const col = RCOL[r.item.rarity];
      $('cs-result').classList.remove('hidden');
      $('cs-result').innerHTML = `<div class="cs-reveal r-${r.item.rarity}" style="--rc:${col}"><span class="rv-r">${r.item.rarity.toUpperCase()}</span>${caseCard(r, ' big')}<b>${r.item.name}</b><span>${r.dup ? 'Duplicate · +' + r.refund + ' coins back' : 'NEW · added to your collection'}</span></div>`;
      $('cs-equip').classList.remove('hidden'); $('cs-inspect').classList.remove('hidden');
      BR.Audio.kill(r.item.rarity === 'Mythic' || r.item.rarity === 'Exotic');
      if (r.item.rarity === 'Legendary' || r.item.rarity === 'Mythic' || r.item.rarity === 'Exotic') BR.Audio.coin();
      $('cs-coins').textContent = BR.Profile.coinsLabel();
      caseRefresh();
      BR.updateCoins();
    }, 5800);
  });
  $('cs-inspect').addEventListener('click', () => { if (!lastDrop) return; game.hud.show('cases', false); inv.open({ cat: lastDrop.cat, id: lastDrop.id }); });
  $('cs-equip').addEventListener('click', () => { if (!lastDrop) return; BR.Profile.equipDrop(lastDrop); game.refreshCosmetics(); BR.Audio.pickup(); $('cs-equip').classList.add('hidden'); });

  // ---- Ranked leaderboard
  const openRanks = () => {
    const P = BR.Profile.data, R = BR.Ranks, t = R.of(P.rp || 0), T = R.tiers[t], N = R.tiers[t + 1];
    const pct = N ? Math.round(((P.rp || 0) - T.rp) / (N.rp - T.rp) * 100) : 100;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    $('rk-me').innerHTML = `${R.badge(P.rp || 0, true)}<div class="rk-info"><b>${T.name.toUpperCase()}</b><span>${P.rp || 0} RP${N ? ' · ' + (N.rp - (P.rp || 0)) + ' to ' + N.name : ' · top tier'} · K/D ${BR.Profile.kd().toFixed(2)}</span><div class="rk-prog"><i style="width:${pct}%;background:linear-gradient(90deg,${T.c2},${T.c1})"></i></div></div>`;
    const rows = R.board(), meIdx = rows.findIndex(r => r.me);
    const shown = rows.slice(0, 25);
    if (meIdx >= 25) shown.push(rows[meIdx]);
    $('rk-board').innerHTML = shown.map(r => { const i = rows.indexOf(r);
      return `<div class="rk-row${r.me ? ' me' : ''}${i < 3 ? ' top top' + (i + 1) : ''}"><span class="pos">${i + 1}</span>${R.badge(r.rp)}<span class="nm">${esc(r.name)}${r.local ? ' <small>local</small>' : ''}</span><span class="rp">${r.rp.toLocaleString()} RP</span></div>`; }).join('');
    game.hud.show('ranks', true);
  };
  $('btn-ranks').addEventListener('click', () => { BR.Audio.init(); openRanks(); });
  $('rk-x').addEventListener('click', () => game.hud.show('ranks', false));
  $('btn-duel').addEventListener('click', () => { BR.Audio.init(); BR.openDuelMenu('setup'); });
  $('dm-go').addEventListener('click', dmGo);
  $('dm-x').addEventListener('click', dmClose);
  $('btn-menu').addEventListener('click', () => game.toMenu());
  $('btn-resume').addEventListener('click', () => game.resume());
  $('btn-quit').addEventListener('click', () => game.toMenu());
  document.addEventListener('pointerdown', () => BR.Audio.init(), { once: true });

  // Show touch controls only on touch devices
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('touch', isTouch);
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

  // Block pinch-zoom / double-tap zoom gestures inside the game
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
})();
