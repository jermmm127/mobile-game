'use strict';
// =============================================================================
// MAIN — boot, menu / settings / shop wiring. Settings persist per device.
// =============================================================================
(function boot() {
  const DEFAULTS = { difficulty: 'normal', bots: BR.CONFIG.match.defaultBots, duel: { diff: 'normal', target: 5, roundTime: 90, loadout: ['rifle', 'shotgun'] }, sens: 1.0, aimSmooth: 0.3, sensX: 1, sensY: 1, sensAds: 1, sensScope: 1, sensFire: 1, sensCurve: 0, gyro: 'off', gyroSens: 1, gyroInvX: false, gyroInvY: false, stretch: 0, saturation: 1, fov: BR.CONFIG.camera.fov, gfx: 'medium', highlight: 'subtle', volume: 0.6, assist: true, autoFire: false, showFps: false, showSpeed: true,
    xh: { style: 'cross', color: '#ffffff', len: 8, thick: 2, gap: 6, op: 1, dot: true, ol: true, dyn: true } };
  const stored = BR.util.load('velocity-royale.settings', {});
  if (stored.bots === undefined && typeof stored.players === 'number') stored.bots = Math.max(0, stored.players - 1); // v0.2 -> v0.3
  const settings = Object.assign({}, DEFAULTS, stored);
  settings.xh = Object.assign({}, DEFAULTS.xh, stored.xh || {});
  settings.duel = Object.assign({}, DEFAULTS.duel, stored.duel || {});
  const save = () => BR.util.save('velocity-royale.settings', settings);
  BR.saveSettings = save;
  if (BR.AntiCheat) BR.AntiCheat.lock();          // v1.16: stat tables can't be edited from the console
  BR.Accounts.load();
  BR.Profile.load();
  setTimeout(() => { try { daily(); } catch (e) { /* (no game: 3D failed to start) */ } }, 0);

  // v1.28.3: what the browser said about 3D, shown on the help screen (send a photo of it to get help)
  const glReport = err => {
    const D = BR.glDiag || { tries: [] }, esc = x => String(x).replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;');
    const verdict = !D.api ? 'This browser has no WebGL at all (3D is switched off or not built in), so no website can show 3D here.'
      : 'This browser has WebGL, but it refused every request' + (D.reason ? ': "' + esc(D.reason) + '"' : '') + '.';
    return '<div class="gl-diag"><b>' + verdict + '</b><details open><summary>Details (' + D.tries.length + ' tries)</summary><p>WebGL 1: ' + (D.api ? 'present' : 'missing') + ' · WebGL 2: ' + (D.api2 ? 'present' : 'missing') +
      (D.reason ? ' · reason: ' + esc(D.reason) : '') + '</p><ol>' + D.tries.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol><p class="fatal-err">' + esc(navigator.userAgent) + '<br>(' + esc(err && err.message || err) + ')</p></details></div>';
  };
  let game;
  try {
    game = new BR.Game(settings);
  } catch (err) {
    document.getElementById('app').innerHTML =
      '<div class="fatal"><h2>This browser can\'t start 3D graphics</h2><p>surge needs WebGL. Things to try:</p><ul>' +
      '<li>Use Chrome, Edge, Safari or Firefox (game-console and in-app browsers often block 3D)</li>' +
      '<li>Turn on hardware acceleration in the browser settings, and update the browser</li>' +
      '<li>Close other tabs or apps using 3D, turn off battery saver, then reload</li></ul>' +
      '<button class="mbtn hot" onclick="location.reload()">TRY AGAIN</button>' + glReport(err) + '</div>';
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
    const L = BR.Profile.levelInfo(), mx = L.level >= BR.LEVELS.max;
    $('lvl-n').textContent = L.level; $('lvl-bar').style.width = (mx ? 100 : L.into / L.need * 100).toFixed(1) + '%';
    $('lvl-xp').textContent = mx ? 'MAX LEVEL' : `${L.into.toLocaleString()} / ${L.need.toLocaleString()} XP`;
  };
  const renderLevels = () => {
    const P = BR.Profile, L = P.levelInfo(), mx = L.level >= BR.LEVELS.max;
    $('lv-n').textContent = L.level; $('lv-bar').style.width = (mx ? 100 : L.into / L.need * 100).toFixed(1) + '%';
    $('lv-sub').textContent = mx ? 'Max level' : `${L.into.toLocaleString()} / ${L.need.toLocaleString()} XP to level ${L.level + 1}`;
    $('lv-track').innerHTML = Object.entries(BR.KNIFE_LEVEL).map(([id, lv]) => { const ok = P.meleeUnlocked(id), pic = BR.WeaponIcons && BR.WeaponIcons.pic[id];
      return `<div class="lv-k${ok ? ' ok' : ''}"><em>LV ${lv}</em>${pic ? `<img src="${pic}" alt="">` : ''}<b>${BR.CONFIG.weapons[id].name}</b><i>${ok ? (lv ? 'UNLOCKED' : 'STARTING KNIFE') : `${Math.max(0, lv - L.level)} levels to go`}</i></div>`; }).join('');
  };
  $('lvl-chip').addEventListener('click', () => { BR.Audio.init(); renderLevels(); $('levels').classList.remove('hidden'); });
  $('lv-x').addEventListener('click', () => $('levels').classList.add('hidden'));
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
  // v1.28 controller
  if (settings.padSens === undefined) settings.padSens = 1;
  if (settings.padRumble === undefined) settings.padRumble = true;
  range('set-padSens', 'padSens', mult); check('set-padInvert', 'padInvert'); check('set-padRumble', 'padRumble');
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
  check('set-speed', 'showSpeed');
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

  // ---- PC keybinds editor
  const KB = BR.Keybinds;
  const renderKeybinds = () => {
    const map = KB.get(); let html = '', grp = '';
    for (const [a, name, g] of KB.ACTIONS) {
      if (g !== grp) { grp = g; html += `<div class="kb-grp">${g}</div>`; }
      html += `<div class="kb-row"><span>${name}</span>` + [0, 1].map(i => `<button class="kb-key${map[a][i] ? '' : ' empty'}" data-a="${a}" data-i="${i}">${KB.label(map[a][i])}</button>`).join('') + `</div>`;
    }
    $('kb-list').innerHTML = html;
    const lab = a => KB.label(map[a][0]);
    $('kb-help').innerHTML = `<b>KEYBOARD & MOUSE:</b> ${lab('forward')}${lab('left')}${lab('back')}${lab('right')} move · mouse look · ${lab('fire')} fire · ${lab('ads')} aim · ${lab('jump')} jump · ${lab('crouch')} crouch/slide · ${lab('grapple')} grapple · ${lab('reload')} reload · ${lab('slot0')}/${lab('slot1')}/${lab('slot2')} or ${lab('swap')} switch · ${lab('inspect')} inspect · ${lab('interact')} open/swap · ${lab('stim')} stim · ${lab('grenade')} grenade · ${lab('pause')} pause. Change them in PC CONTROLS.`;
  };
  const kbMsg = t => { $('kb-msg').textContent = t || ''; };
  const endCapture = () => {
    const c = KB.capturing; if (!c) return;
    KB.capturing = null;
    window.removeEventListener('keydown', c.onKey, true); window.removeEventListener('mousedown', c.onMouse, true); window.removeEventListener('wheel', c.onWheel, true);
    renderKeybinds();
  };
  const commit = (code) => {
    const c = KB.capturing; if (!c) return;
    const stolen = KB.set(c.a, c.i, code);
    const nm = a => (KB.ACTIONS.find(x => x[0] === a) || [])[1];
    kbMsg(code ? (stolen && stolen !== c.a ? `${KB.label(code)} moved from "${nm(stolen)}" to "${nm(c.a)}"` : `${nm(c.a)}: ${KB.label(code)}`) : `${nm(c.a)}: slot cleared`);
    endCapture();
  };
  $('kb-list').addEventListener('click', e => {
    const b = e.target.closest('.kb-key'); if (!b) return;
    endCapture(); kbMsg('');
    b.textContent = 'press a key…'; b.classList.add('wait');
    const c = KB.capturing = { a: b.dataset.a, i: +b.dataset.i };
    c.onKey = ev => { ev.preventDefault(); ev.stopPropagation(); if (ev.code === 'Escape') { kbMsg('cancelled'); endCapture(); } else if (ev.code === 'Backspace' || ev.code === 'Delete') commit(null); else commit(ev.code); };
    c.onMouse = ev => { if (ev.target.closest && ev.target.closest('.kb-key') && ev.button === 0 && ev.target.closest('.kb-key') !== b) return; ev.preventDefault(); ev.stopPropagation(); commit('Mouse' + ev.button); };
    c.onWheel = ev => { ev.preventDefault(); ev.stopPropagation(); commit(ev.deltaY < 0 ? 'WheelUp' : 'WheelDown'); };
    window.addEventListener('keydown', c.onKey, true);
    setTimeout(() => { if (KB.capturing === c) { window.addEventListener('mousedown', c.onMouse, true); window.addEventListener('wheel', c.onWheel, { capture: true, passive: false }); } }, 0);
  });
  $('kb-reset').addEventListener('click', () => { endCapture(); KB.reset(); renderKeybinds(); kbMsg('Keybinds reset to defaults'); });
  renderKeybinds();
  // opened from the in-game pause menu: hide the pause panel while settings are up, bring it back after
  const openSettings = () => { const fromPause = !$('pause').classList.contains('hidden'); $('settings').dataset.fromPause = fromPause ? '1' : ''; if (fromPause) $('pause').classList.add('hidden'); $('settings').classList.remove('hidden'); renderKeybinds(); };
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-settings2').addEventListener('click', openSettings);
  $('settings-back').addEventListener('click', () => { endCapture(); $('settings').classList.add('hidden'); if ($('settings').dataset.fromPause && game.state === 'paused') $('pause').classList.remove('hidden'); $('settings').dataset.fromPause = ''; });

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
      $('acct-id').textContent = BR.Accounts.accountId() || '—';
      $('acct-admin').classList.toggle('hidden', !BR.Accounts.isSeededDev());
      $('acct-devmenu').classList.toggle('hidden', !BR.Accounts.isSeededDev());
      $('acct-banned').classList.toggle('hidden', !(BR.Bans && BR.Bans.blocked(false)));
    }
  };
  const copyText = t => { try { const pr = navigator.clipboard.writeText(t); if (pr && pr.catch) pr.catch(() => {}); return true; } catch (e) { return false; } };
  $('acct-copy').addEventListener('click', () => { const id = BR.Accounts.accountId(); if (id && copyText(id)) $('acct-msg').textContent = 'Account ID copied'; });
  // ---- support panel: only the built-in dev account, password re-entry required
  const esc = v => String(v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const day = t => t ? new Date(t).toLocaleDateString() : '—';
  const renderAdmin = () => {
    const open = BR.Accounts.adminOpen();
    $('adm-gate').classList.toggle('hidden', open); $('adm-body').classList.toggle('hidden', !open);
    if (!open) return;
    const rows = BR.Accounts.adminList($('adm-q').value) || [];
    $('adm-list').innerHTML = rows.length ? rows.map(r => `<div class="adm-row"><div><b>${esc(r.name)}</b>${r.builtIn ? ' <i class="dev-badge">BUILT-IN</i>' : ''}${r.temp ? ' <i class="dev-badge">TEMP PW</i>' : ''}<code>${esc(r.id)}</code></div>` +
      `<small>Lv ${r.level} · ${r.coins} coins · ${r.rp} RP · ${r.matches} matches · joined ${day(r.created)} · last ${day(r.last)}</small>` +
      (r.builtIn ? '' : `<button class="mbtn sm" data-reset="${esc(r.name)}">RESET PW</button>`) + '</div>').join('') : '<p class="fine">No accounts match.</p>';
  };
  $('acct-admin').addEventListener('click', () => { if (!BR.Accounts.isSeededDev()) return; $('adm-msg').textContent = ''; $('adm-pass').value = ''; renderAdmin(); $('admin').classList.remove('hidden'); });
  $('adm-gate').addEventListener('submit', async e => { e.preventDefault(); const r = await BR.Accounts.adminUnlock($('adm-pass').value); $('adm-pass').value = ''; $('adm-msg').textContent = r.ok ? '' : r.msg; renderAdmin(); });
  $('adm-q').addEventListener('input', renderAdmin);
  $('adm-list').addEventListener('click', async e => { const b = e.target.closest('[data-reset]'); if (!b) return;
    if (!confirm('Reset the password for ' + b.dataset.reset + '? Their old password stops working.')) return;
    const r = await BR.Accounts.adminResetPassword(b.dataset.reset); $('adm-msg').textContent = r.msg; renderAdmin(); });
  $('adm-export').addEventListener('click', () => { const csv = BR.Accounts.adminExport(); $('adm-msg').textContent = csv && copyText(csv) ? 'Account list copied as CSV (no passwords)' : 'Nothing to copy'; });
  // ---- v1.16 dev menu (built-in dev accounts; commands are signed after unlocking with the dev code)
  const dvMsg = t => { $('dv-msg').textContent = t || ''; };
  const dvAmt = () => Math.max(1, Math.min(1000000, parseInt($('dv-coins').value, 10) || 0));
  const dvReason = () => $('dv-reason').value.trim().slice(0, 60);
  const livePlayers = () => {
    const S = BR.Lobby && BR.Lobby.sess; if (!S) return [];
    return (BR.Lobby.players || []).filter(p => p.pid !== S.pid).map(p => ({ pid: p.pid, name: p.name, acct: p.acct || '' }));
  };
  const renderDev = () => {
    const open = BR.Dev.unlocked();
    $('dv-gate').classList.toggle('hidden', open); $('dv-body').classList.toggle('hidden', !open);
    if (!open) return;
    const live = livePlayers(), S = BR.Lobby && BR.Lobby.sess;
    $('dv-live').innerHTML = live.length ? live.map(p => `<div class="adm-row"><div><b>${esc(p.name)}</b><code>${esc(p.acct || 'guest')}</code></div><small>${S && S.isHost ? 'in your lobby (you are host)' : 'in your lobby'}</small><span class="dv-btns"><button class="mbtn sm" data-live="kick" data-pid="${esc(p.pid)}">KICK</button><button class="mbtn sm" data-live="ban" data-pid="${esc(p.pid)}">BAN</button><button class="mbtn sm" data-live="coins" data-pid="${esc(p.pid)}">+COINS</button></span></div>`).join('') : '<p class="fine">Nobody else is in a lobby with you. Host or join an online lobby to manage players live.</p>';
    const rows = Object.keys(BR.Accounts.db.users).map(n => ({ n, u: BR.Accounts.db.users[n] }));
    $('dv-local').innerHTML = rows.map(({ n, u }) => { const banned = BR.Bans.has(u.id); return `<div class="adm-row"><div><b>${esc(n)}</b>${u.seeded ? ' <i class="dev-badge">BUILT-IN</i>' : ''}${banned ? ' <i class="dev-badge ban">BANNED</i>' : ''}<code>${esc(u.id)}</code></div><small>on this device</small><span class="dv-btns"><button class="mbtn sm" data-loc="coins" data-n="${esc(n)}">+COINS</button>${u.seeded ? '' : `<button class="mbtn sm" data-loc="${banned ? 'unban' : 'ban'}" data-n="${esc(n)}">${banned ? 'UNBAN' : 'BAN'}</button>`}</span></div>`; }).join('');
    const bans = BR.Bans.records();
    $('dv-bans').innerHTML = bans.length ? bans.map(r => `<div class="adm-row"><div><code>${esc(r.cmd.target)}</code></div><small>${new Date(r.cmd.ts).toLocaleString()}${r.cmd.reason ? ' · ' + esc(r.cmd.reason) : ''}</small><span class="dv-btns"><button class="mbtn sm" data-unban="${esc(r.cmd.target)}">UNBAN</button></span></div>`).join('') : '<p class="fine">No bans.</p>';
    const L = BR.AntiCheat ? BR.AntiCheat.log : [];
    $('dv-log').innerHTML = L.length ? L.map(e => `<div class="adm-row"><div><b>${esc(e.kind)}</b></div><small>${new Date(e.t).toLocaleTimeString()} · ${esc(e.detail)}</small></div>`).join('') : '<p class="fine">Nothing flagged this session.</p>';
  };
  BR.renderBan = () => { renderAccount(); };
  const dvSend = async (c, pid, extra) => {
    const p = livePlayers().find(q => q.pid === pid), S = BR.Lobby.sess; if (!p || !S) return;
    if (!p.acct && c !== 'kick') { dvMsg('That player is a guest (no Account ID): only KICK works'); return; }
    const sc = await BR.Dev.sign(c, p.acct || 'guest:' + pid, Object.assign({ reason: dvReason() }, extra || {}));
    if (c === 'ban') BR.Bans.add(sc);
    S.send('dev', { sc }, pid);
    if ((c === 'kick' || c === 'ban') && S.isHost) S.kick(pid, c === 'ban' ? 'banned' : '');
    dvMsg(c === 'coins' ? `Sent ${extra.amount} coins to ${p.name}` : `${c === 'ban' ? 'Banned' : 'Kicked'} ${p.name}`); renderDev();
  };
  $('acct-devmenu').addEventListener('click', () => { if (!BR.Dev.isDev()) return; dvMsg(''); renderDev(); $('devmenu').classList.remove('hidden'); });
  $('dv-gate').addEventListener('submit', async e => { e.preventDefault(); const r = await BR.Dev.unlock($('dv-code').value); $('dv-code').value = ''; dvMsg(r.msg); renderDev(); });
  $('dv-live').addEventListener('click', async e => { const b = e.target.closest('[data-live]'); if (!b) return; const c = b.dataset.live;
    if (c !== 'coins' && !confirm(`${c.toUpperCase()} this player?`)) return;
    try { await dvSend(c, b.dataset.pid, c === 'coins' ? { amount: dvAmt() } : null); } catch (err) { dvMsg(err.message); } });
  $('dv-local').addEventListener('click', async e => { const b = e.target.closest('[data-loc]'); if (!b) return; const n = b.dataset.n, u = BR.Accounts.db.users[n], c = b.dataset.loc;
    try {
      if (c === 'coins') { BR.Dev.giveLocal(n, dvAmt()); dvMsg(`Gave ${dvAmt()} coins to ${n}`); BR.updateCoins(); }
      else if (c === 'ban') { if (!confirm('Ban ' + n + '?')) return; BR.Bans.add(await BR.Dev.sign('ban', u.id, { reason: dvReason() })); dvMsg('Banned ' + n); }
      else { BR.Bans.remove(u.id); dvMsg('Unbanned ' + n); }
      renderDev();
    } catch (err) { dvMsg(err.message); } });
  const dvId = () => { const v = $('dv-id').value.trim().toUpperCase(); return /^SRG-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(v) ? v : null; };
  const showCode = (t, label) => { $('dv-out').value = t; $('dv-out').classList.remove('hidden'); try { const pr = navigator.clipboard.writeText(t); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* no clipboard */ } dvMsg(label + ' (copied). The player pastes it into Account → Redeem a code.'); };
  $('dv-gift').addEventListener('click', async () => { const id = dvId(); if (!id) { dvMsg('Enter an Account ID like SRG-7K3Q-92XD'); return; } try { showCode(BR.Dev.toCode(await BR.Dev.sign('coins', id, { amount: dvAmt() })), `Gift code for ${dvAmt()} coins → ${id}`); } catch (err) { dvMsg(err.message); } });
  $('dv-ban').addEventListener('click', async () => { const id = dvId(); if (!id) { dvMsg('Enter an Account ID like SRG-7K3Q-92XD'); return; } if (!confirm('Ban ' + id + '?')) return; try { const sc = await BR.Dev.sign('ban', id, { reason: dvReason() }); BR.Bans.add(sc); renderDev(); showCode(BR.Dev.toCode(sc), 'Banned ' + id + '. Ban code'); } catch (err) { dvMsg(err.message); } });
  $('dv-unban').addEventListener('click', async () => { const id = dvId(); if (!id) { dvMsg('Enter an Account ID like SRG-7K3Q-92XD'); return; } try { const sc = await BR.Dev.sign('unban', id); BR.Bans.remove(id); renderDev(); showCode(BR.Dev.toCode(sc), 'Unbanned ' + id + '. Unban code'); } catch (err) { dvMsg(err.message); } });
  $('dv-bans').addEventListener('click', e => { const b = e.target.closest('[data-unban]'); if (!b) return; BR.Bans.remove(b.dataset.unban); renderDev(); });
  $('dv-close').addEventListener('click', () => { $('devmenu').classList.add('hidden'); $('dv-out').classList.add('hidden'); });
  $('adm-close').addEventListener('click', () => { $('admin').classList.add('hidden'); BR.Accounts.adminLock(); $('adm-list').innerHTML = ''; });
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
    const r = await BR.Accounts[fn]($('acct-user').value, $('acct-pass').value, $('acct-remember').checked);
    if (!r.ok) { $('acct-msg').textContent = r.msg; return; }
    const used = $('acct-pass').value; $('acct-pass').value = '';
    afterAuth();
    if (r.mustChange) {      // support issued a temporary password: pick a new one now
      const np = prompt('You signed in with a temporary password. Choose a new password (4+ characters):');
      const c = np ? await BR.Accounts.changePassword(used, np) : { msg: 'Remember to set a new password soon' };
      $('acct-msg').textContent = c.msg;
    }
  });
  $('acct-logout').addEventListener('click', () => { BR.Accounts.logOut(); afterAuth(); });
  $('acct-redeem').addEventListener('click', async () => {
    const sc = BR.Dev && BR.Dev.fromCode($('acct-code').value);
    if (sc) {      // v1.16 signed gift / unban code from the developers
      $('acct-code').value = ''; const res = await BR.Dev.receive(sc, 'code');
      $('acct-msg').textContent = res === 'coins' ? `Gift redeemed: +${sc.cmd.amount} coins` : res === 'used' ? 'That code was already used' : res === 'unban' ? 'Ban lifted' : res === 'ban' ? 'Ban recorded' : 'That code isn’t valid for this account';
      BR.updateCoins(); renderAccount(); return;
    }
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
  let playOpts = null;
  const play = opts => {
    BR.Audio.init(); tryFullscreen();
    playOpts = opts ? { resurgence: !!opts.resurgence, squad: opts.squad | 0 || 1 } : null;
    if (qTimer) return;
    const sq = playOpts ? playOpts.squad : 1, base = playOpts && playOpts.resurgence ? 24 : Math.max(1, (settings.bots | 0) + 1);
    const total = sq > 1 ? Math.ceil(Math.max(base, sq * 2) / sq) * sq : base;
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
          game.startMatch(playOpts);
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
  $('btn-zombies').addEventListener('click', () => { BR.Audio.init(); game.startZombies(); });
  // v1.10 modes
  const overdrive = () => { BR.Audio.init(); tryFullscreen(); game.startMode(BR.Overdrive, { overdrive: true }); };
  const aimTrainer = () => { BR.Audio.init(); tryFullscreen(); game.startMode(BR.AimTrainer, { range: true }); };
  $('btn-resurgence').addEventListener('click', () => play({ resurgence: true }));
  $('btn-overdrive').addEventListener('click', overdrive);
  $('btn-aim').addEventListener('click', aimTrainer);
  // the locker mid-match (practice, aim trainer): your inventory over the paused game; skins apply on close
  BR.openLocker = () => {
    const was = ['pause', 'spawnmenu', 'aimmenu'].filter(id => $(id) && !$(id).classList.contains('hidden'));
    was.forEach(id => game.hud.show(id, false));
    if (game.state === 'playing') { game.state = 'paused'; game.input.reset(); game.input.unlock(); }
    BR.Audio.init(); BR.Audio.click();
    inv.onClose = () => { game.refreshCosmetics(); was.forEach(id => game.hud.show(id, true)); if (!was.length) { game.state = 'playing'; game.input.reset(); game.last = performance.now(); } };
    inv.open();
  };
  $('btn-locker').addEventListener('click', () => BR.openLocker());
  $('sp-locker').addEventListener('click', () => BR.openLocker());
  // challenges: every grind camo + blueprint with its progress
  const renderGrind = () => {
    const P = BR.Profile;
    $('grind-list').innerHTML = P.grindItems().map(e => {
      const [cur, n] = P.grindProgress(e.item), own = P.owns(e.cat, e.id), k = Math.min(1, cur / n);
      const what = e.cat === 'skins' ? 'CAMO · any gun' : e.cat === 'outfits' ? 'OUTFIT · character' : e.cat === 'masks' ? 'MASK · character' : e.cat === 'hats' ? 'HAT · character' : 'BLUEPRINT · ' + BR.CONFIG.weapons[e.id.split(':')[0]].name;
      return `<div class="gr-row${own ? ' own' : ''}"><div class="gr-sw">${shop.swatch(e.cat, e.id, e.item)}</div><div class="gr-main"><div class="gr-top"><b>${e.item.name}</b><span class="rar" style="--r:${({ Epic: '#b06bff', Legendary: '#ffb020', Mythic: '#ff3df2', Exotic: '#39ffd0' })[e.item.rarity] || '#8d97a5'}">${e.item.rarity}</span><i>${what}</i></div>
        <div class="gr-lbl">${e.item.grind.label}</div><div class="gr-bar"><u style="width:${(k * 100).toFixed(1)}%"></u></div></div><div class="gr-n">${own ? 'UNLOCKED' : cur.toLocaleString() + ' / ' + n.toLocaleString()}</div></div>`;
    }).join('');
  };
  $('btn-grind').addEventListener('click', () => { BR.Audio.init(); BR.Profile.checkGrind(); renderGrind(); $('grind').classList.remove('hidden'); });
  $('grind-x').addEventListener('click', () => $('grind').classList.add('hidden'));
  // spawn menu
  // weapon cards with pictures of the real models
  BR.WeaponIcons.build();
  const gcard = (id, attrs, sel) => { const d = BR.CONFIG.weapons[id], pic = BR.WeaponIcons.pic[id];
    return `<button class="gcard${sel ? ' sel' : ''}" ${attrs}>${pic ? `<img src="${pic}" alt="">` : ''}<span>${d.name.toUpperCase()}</span></button>`; };
  const renderSpCards = () => { $('sp-weapons').innerHTML = Object.keys(BR.CONFIG.weapons).filter(id => !BR.CONFIG.weapons[id].melee)
    .map(id => gcard(id, `data-sp="weapon" data-arg="${id}"`)).join(''); };
  renderSpCards();
  BR.WeaponIcons.onBuilt = renderSpCards;          // v1.16.3: icons finish after imported models' textures load
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
  let spRar = 0;
  $('sp-rar').addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (!b) return; spRar = +b.dataset.r; $('sp-rar').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); BR.Audio.click(); });
  $('sp-slots').addEventListener('click', e => {
    const b = e.target.closest('button[data-slot]'); if (!b) return;
    spSlot = +b.dataset.slot; BR.Audio.click(); BR.renderSpawnSlots();
  });
  $('spawnmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-sp]');
    if (!b) return;
    if (b.dataset.sp === 'weapon') {
      const p = game.player;
      game.practiceSpawn('dropweapon', b.dataset.arg, spSlot, spRar);       // v1.23: dropped on the ground, not auto-equipped
      void p; BR.renderSpawnSlots(); BR.Audio.pickup(); setTimeout(() => game.closeSpawnMenu && game.closeSpawnMenu(), 220);   // back to the game so you can grab it
      b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 300);
      return;
    }
    game.practiceSpawn(b.dataset.sp, b.dataset.arg);
    BR.Audio.pickup();
    b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 300);
  });
  $('sp-close').addEventListener('click', () => game.closeSpawnMenu());
  $('sp-x').addEventListener('click', () => game.closeSpawnMenu());
  $('btn-play').addEventListener('click', () => play());
  $('btn-again').addEventListener('click', () => {
    if (game.result && game.result.duel && game.lastDuel) { BR.Audio.init(); game.startDuel(game.lastDuel); }   // rematch, same settings
    else if (game.result && game.result.zombies) { BR.Audio.init(); game.startZombies(); }
    else if (game.result && game.result.overdrive) overdrive();
    else if (game.result && game.result.arena) { game.toMenu(); if (!game.result.online && BR.Lobby) { BR.Lobby.preset = game.result.preset; BR.Lobby.play(); } else BR.Lobby && BR.Lobby.open(game.result.preset); }
    else play({ resurgence: !!game.resurgence, squad: game.squad || 1 });
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
  const CAT_LABEL = { blueprints: 'Blueprint', skins: 'Camo', gloves: 'Gloves', tracers: 'Tracer', feeds: 'Kill feed', finishers: 'Finisher', outfits: 'Outfit', masks: 'Mask', hats: 'Hat' };
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
    // v1.16.1: real players only; open spots carry the owner's name until someone takes them
    const B = BR.Board.rows(), rows = B.rows.slice();
    if (B.mine >= BR.Board.SIZE) rows.push(Object.assign({ pos: B.mine }, B.mineRow));
    $('rk-board').innerHTML = rows.map((r, i) => { const pos = r.pos !== undefined ? r.pos : i;
      return `<div class="rk-row${r.me ? ' me' : ''}${r.holder ? ' holder' : ''}${pos < 3 ? ' top top' + (pos + 1) : ''}"><span class="pos">${pos + 1}</span>${r.holder ? '<i class="rk rk-open"><b>·</b></i>' : R.badge(r.rp)}<span class="nm">${esc(r.name)}${r.me ? ' <small>you</small>' : ''}</span><span class="rp">${r.holder ? 'open spot' : r.rp.toLocaleString() + ' RP'}</span></div>`; }).join('')
      + `<p class="rk-foot">${B.total ? B.total + ' ranked player' + (B.total === 1 ? '' : 's') + ' known' : 'No ranked players yet'} · play a Ranked match (level ${BR.LEVELS.ranked}+, signed in) to take a spot · boards sync when you meet players in online lobbies</p>`;
    game.hud.show('ranks', true);
  };
  $('btn-ranks').addEventListener('click', () => { BR.Audio.init(); openRanks(); });
  // patch notes
  $('btn-notes').addEventListener('click', () => { BR.Audio.init(); game.hud.patchNotes(); game.hud.show('patchnotes', true); });
  $('pn-x').addEventListener('click', () => game.hud.show('patchnotes', false));
  game.hud.notesBadge();
  $('rk-x').addEventListener('click', () => game.hud.show('ranks', false));
  $('btn-duel').addEventListener('click', () => { BR.Audio.init(); BR.openDuelMenu('setup'); });

  // ---- v1.11: Discover-style mode browser. The lobby shows the selected mode; PLAY launches it.
  const ICO = {
    br: '<path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="M8 12l3 3 5-6" fill="none" stroke-width="2.2"/>',
    resurgence: '<path d="M12 3a9 9 0 1 0 9 9h-2.4A6.6 6.6 0 1 1 12 5.4V9l5-4.5L12 0z"/>',
    duel: '<path d="M4 3l7 7-2 2L2 5V3zM20 3h2v2l-7 7-2-2zM6 15l3 3-3 3-3-3zM18 15l3 3-3 3-3-3zM8 13l3 3M16 13l-3 3" stroke-width="2"/>',
    zombies: '<path d="M32 4C18 4 8 14 8 27c0 8 4 14 9 17v8c0 2 2 4 4 4h3v-6h4v6h8v-6h4v6h3c2 0 4-2 4-4v-8c5-3 9-9 9-17C56 14 46 4 32 4zm-11 32a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm22 0a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm-11 9-4-6h8z" transform="scale(.375)"/>',
    overdrive: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    practice: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6" fill="none" stroke-width="2"/>',
    duels: '<path d="M3 4l8 8M21 4l-8 8M7 14l-3 3 3 3 3-3zM17 14l3 3-3 3-3-3z" fill="none" stroke-width="2.2"/><circle cx="6" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/>',
    shotgun: '<path d="M2 11h14l2-2h4v4h-4l-1 1H8l-2 4H3l1-4H2z"/><circle cx="20" cy="6" r="1.4"/><circle cx="17" cy="5" r="1.1"/><circle cx="22" cy="4" r="1"/>',
    sniper: '<circle cx="12" cy="12" r="9" fill="none" stroke-width="1.8"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke-width="1.8"/><circle cx="12" cy="12" r="1.4"/>',
    tdm: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6zM10 20c0-4 3-6 6-6s6 2 6 6z"/>',
    ffa: '<path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/>',
    aim: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke-width="2"/>',
  };
  const MODES = {
    br:         { name: 'BATTLE ROYALE', sub: 'Solos · Duos · Trios · Squads', cat: 'BATTLE ROYALE', rk: true, tags: ['30 PLAYERS', 'SQUADS'], art: 'linear-gradient(160deg,#c084fc,#7b2cff 45%,#2a0b5a)', glow: '#c084fc', go: () => play({ squad: squadFor('br') }) },
    resurgence: { name: 'RESURGENCE', sub: 'Solos · Duos · Trios · redeploys', rk: true, cat: 'BATTLE ROYALE', tags: ['24 PLAYERS', 'TRIOS'], art: 'linear-gradient(160deg,#39ff88,#0f7a5a 45%,#06202a)', glow: '#39ff88', go: () => play({ resurgence: true, squad: squadFor('resurgence') }) },
    duels:      { name: 'DUELS 1V1 · 2V2', sub: 'AI teammate or friends online', rk: true, cat: 'COMPETITIVE', tags: ['NEW', 'ONLINE', '2V2'], art: 'linear-gradient(120deg,#1f4fb8 0 46%,#ffd24a 48% 52%,#b8302a 54% 100%)', glow: '#ffd24a', go: () => BR.Lobby.open('duel') },
    shotgun:    { name: 'SHOTGUN DUELS', sub: 'Breachers only · 1v1 / 2v2', rk: true, cat: 'COMPETITIVE', tags: ['NEW', 'ONLINE'], art: 'radial-gradient(120% 120% at 80% 0%,#ff9a1f,#6a2a10 55%,#1a0a06)', glow: '#ff9a1f', go: () => BR.Lobby.open('shotgun') },
    sniper:     { name: 'SNIPER DUELS', sub: 'Snipers, hunting rifles + launchers · 1v1 / 2v2', rk: true, cat: 'COMPETITIVE', tags: ['NEW', 'ONLINE'], art: 'radial-gradient(120% 120% at 80% 0%,#9fe8ff,#1a4a6a 55%,#06121c)', glow: '#9fe8ff', go: () => BR.Lobby.open('sniper') },
    tdm:        { name: 'TEAM DEATHMATCH', sub: '4v4 · first to 30 kills', rk: true, cat: 'CASUAL', tags: ['NEW', 'ONLINE', '4V4'], art: 'linear-gradient(160deg,#4f8fff,#1a2f6a 50%,#6a1a1a 51%,#ff5a4a)', glow: '#c8a8ff', go: () => BR.Lobby.open('tdm') },
    ffa:        { name: 'FREE FOR ALL', sub: '6 players · first to 20 kills', rk: true, cat: 'CASUAL', tags: ['NEW', 'ONLINE'], art: 'radial-gradient(120% 120% at 80% 0%,#ffe14d,#8a3aff 55%,#12061c)', glow: '#ffe14d', go: () => BR.Lobby.open('ffa') },
    zombies:    { name: 'ZOMBIES', sub: 'Hollow Graves · endless rounds', cat: 'SURVIVAL', tags: ['STORY', 'BOSSES'], art: 'radial-gradient(120% 120% at 80% 0%,#ff7a1a,#5a141e 55%,#140818)', glow: '#ff8a2a', go: () => { BR.Audio.init(); game.startZombies(); } },
    overdrive:  { name: 'OVERDRIVE', sub: 'Roguelike swarm survival', cat: 'SURVIVAL', tags: ['NEW', 'ROGUELIKE'], art: 'radial-gradient(120% 120% at 80% 0%,#ff5ec4,#46145a 55%,#12061c)', glow: '#ff5ec4', go: () => overdrive() },
    practice:   { name: 'PRACTICE', sub: 'Spawn anything · no bots', cat: 'TRAINING', tags: ['SOLO'], art: 'linear-gradient(160deg,#4fdc8a,#14583a 55%,#071a12)', glow: '#4fdc8a', go: () => practice() },
    aim:        { name: 'AIM TRAINER', sub: 'Gridshot · Flick · Tracking · Strafe', cat: 'TRAINING', tags: ['NEW', 'SCORES'], art: 'radial-gradient(120% 120% at 80% 0%,#45e0ff,#0b3a56 55%,#050d18)', glow: '#45e0ff', go: () => aimTrainer() },
  };
  // v1.19 team size per mode (Battle Royale: solos to squads; Resurgence: solos to trios)
  const squadFor = id => { const S = BR.Squads.SIZES[id] || [1], v = (settings.squads || {})[id] | 0; return S.includes(v) ? v : 1; };
  BR.squadFor = squadFor;
  const renderSquadPick = () => {
    const el = $('sq-pick'), S = BR.Squads.SIZES[settings.mode];
    el.classList.toggle('hidden', !S);
    if (!S) return;
    el.style.setProperty('--g', MODES[settings.mode].glow);
    const cur = squadFor(settings.mode), sub = { 1: 'just you', 2: '+1 teammate', 3: '+2 teammates', 4: '+3 teammates' };
    el.innerHTML = S.map(n => `<button data-sq="${n}" class="${n === cur ? 'sel' : ''}">${BR.Squads.NAMES[n]}<small>${sub[n]}</small></button>`).join('');
  };
  $('sq-pick').addEventListener('click', e => { const b = e.target.closest('[data-sq]'); if (!b) return; settings.squads = Object.assign({}, settings.squads, { [settings.mode]: +b.dataset.sq }); save(); BR.Audio.init(); BR.Audio.click(); renderSquadPick(); renderLobby(); });
  const CATS = ['BATTLE ROYALE', 'COMPETITIVE', 'CASUAL', 'SURVIVAL', 'TRAINING'];
  if (!MODES[settings.mode]) settings.mode = 'br';          // (the classic 1v1 Duel was retired in v1.15: Duels 1v1 · 2v2 replaces it)
  // v1.15 Ranked / Casual: every mode except Zombies, Overdrive and Training has both queues.
  // Ranked gives RP; Casual gives XP, coins, challenge + mastery progress only.
  const rankedOk = () => BR.Profile.level() >= BR.LEVELS.ranked && !(BR.AntiCheat && BR.AntiCheat.rankedBlocked());
  const rankedNow = id => !!(settings.ranked && MODES[id] && MODES[id].rk && rankedOk());
  BR.rankedNow = () => rankedNow(settings.mode);
  const art = (id, big) => { const M = MODES[id]; return `<span class="mart${big ? ' big' : ''}" style="background:${M.art};--g:${M.glow}"><i class="mart-grid"></i><svg viewBox="0 0 24 24">${ICO[id]}</svg></span>`; };
  const renderLobby = () => { const M = MODES[settings.mode]; $('mc-art').innerHTML = art(settings.mode); $('mc-name').textContent = M.name; $('mc-sub').textContent = BR.Squads.SIZES[settings.mode] ? BR.Squads.NAMES[squadFor(settings.mode)] + (settings.mode === 'br' ? ' · 30 players · one life' : ' · redeploy until circle 4') : M.sub; $('mode-cur').style.setProperty('--g', M.glow); renderSquadPick();
    const q = $('mode-cur').querySelector('.mc-tag'); q.innerHTML = M.rk ? (rankedNow(settings.mode) ? '<em class="q-rk">RANKED</em> GAME MODE' : '<em class="q-cs">CASUAL</em> GAME MODE') : 'GAME MODE'; };
  const renderDiscover = () => {
    const rk = !!settings.ranked && rankedOk();
    document.querySelectorAll('#dc-queue button').forEach(b => b.classList.toggle('sel', (b.dataset.q === 'ranked') === rk));
    const rb = document.querySelector('#dc-queue [data-q="ranked"]'); rb.classList.toggle('locked', !rankedOk()); rb.textContent = rankedOk() ? 'RANKED' : '🔒 RANKED · LV ' + BR.LEVELS.ranked;
    const qtag = M => M.rk ? [rk ? 'RANKED' : 'CASUAL'] : [];
    const feat = 'overdrive', F = MODES[feat];
    $('dc-feat').innerHTML = `<button class="dc-tile feat${settings.mode === feat ? ' sel' : ''}" data-m="${feat}" style="--g:${F.glow}">${art(feat, true)}<span class="dt-txt"><em>FEATURED</em><b>${F.name}</b><i>${F.sub}</i><span class="dt-tags">${F.tags.map(t => `<u>${t}</u>`).join('')}</span></span></button>`;
    $('dc-rows').innerHTML = CATS.map(c => `<div class="dc-row"><div class="dc-cat">${c}</div><div class="dc-strip">${Object.entries(MODES).filter(([, M]) => M.cat === c).map(([id, M]) =>
      `<button class="dc-tile${settings.mode === id ? ' sel' : ''}" data-m="${id}" style="--g:${M.glow}">${art(id)}<span class="dt-txt"><b>${M.name}</b><i>${M.sub}</i><span class="dt-tags">${qtag(M).concat(M.tags).map(t => `<u class="${t === 'NEW' ? 'new' : t === 'RANKED' ? 'rk' : ''}">${t}</u>`).join('')}</span></span>${settings.mode === id ? '<span class="dt-check">✓</span>' : ''}</button>`).join('')}</div></div>`).join('');
  };
  BR.selectMode = id => { if (!MODES[id]) return; settings.mode = id; save(); renderLobby(); };
  $('mode-cur').addEventListener('click', () => { BR.Audio.init(); BR.Audio.click(); renderDiscover(); $('discover').classList.remove('hidden'); });
  $('dc-x').addEventListener('click', () => $('discover').classList.add('hidden'));
  $('dc-queue').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; e.stopPropagation();
    if (b.dataset.q === 'ranked' && !rankedOk()) { BR.Audio.click(); game.hud.toast(BR.AntiCheat && BR.AntiCheat.rankedBlocked() ? 'Ranked is disabled on this account' : `Ranked unlocks at level ${BR.LEVELS.ranked} (you are level ${BR.Profile.level()})`, 1800); return; }
    settings.ranked = b.dataset.q === 'ranked'; save(); BR.Audio.click(); renderDiscover(); renderLobby(); });
  $('discover').addEventListener('click', e => { const t = e.target.closest('[data-m]'); if (!t) return; BR.selectMode(t.dataset.m); BR.Audio.pickup(); renderDiscover(); setTimeout(() => $('discover').classList.add('hidden'), 160); });
  $('btn-go').addEventListener('click', () => { BR.Audio.init();
    if (BR.Bans && BR.Bans.blocked(false)) { game.hud.toast('This account is banned', 2200); BR.Audio.click(); return; } game.ranked = rankedNow(settings.mode);
    // v1.20 parties: the leader queues everyone into an online lobby; members wait for the leader
    if (BR.Party && BR.Party.inParty()) { if (!BR.Party.isLeader()) { game.hud.toast('Waiting for your party leader to start', 1800); return; } BR.Party.queue(settings.mode); return; }
    MODES[settings.mode].go(); });
  renderLobby();

  // ---- v1.11: loadout editor
  const LO_P = ['rifle', 'holoar', 'smg', 'lmg', 'shotgun', 'dmr', 'hunter', 'sniper'], LO_S = ['pistol', 'revolver', 'smg', 'shotgun'], LO_M = [['tracker', 'TRACKER'], ['bayonet', 'M9 BAYONET'], ['knife', 'KARAMBIT'], ['butterfly', 'BUTTERFLY']];
  const renderLoadout = () => {
    const L = BR.Profile.loadoutGuns();
    $('lo-primary').innerHTML = LO_P.map(id => gcard(id, `data-lo="primary" data-g="${id}"`, L.primary === id)).join('');
    $('lo-secondary').innerHTML = LO_S.map(id => gcard(id, `data-lo="secondary" data-g="${id}"`, L.secondary === id)).join('');
    $('lo-melee').innerHTML = LO_M.map(([id, n]) => `<button class="gcard${L.melee === id ? ' sel' : ''}${BR.Profile.meleeUnlocked(id) ? '' : ' locked'}" data-lv="LV ${BR.KNIFE_LEVEL[id]}" data-lo="melee" data-g="${id}">${BR.WeaponIcons.pic[id] ? `<img src="${BR.WeaponIcons.pic[id]}" alt="">` : ''}<span>${n}</span></button>`).join('');
  };
  $('btn-loadout').addEventListener('click', () => { BR.Audio.init(); renderLoadout(); $('loadout').classList.remove('hidden'); });
  $('lo-x').addEventListener('click', () => $('loadout').classList.add('hidden'));
  $('loadout').addEventListener('click', e => {
    const b = e.target.closest('[data-lo]'); if (!b) return;
    const P = BR.Profile, k = b.dataset.lo, id = b.dataset.g;
    if (k === 'melee' && !P.meleeUnlocked(id)) { BR.Audio.click(); game.hud.toast(`${BR.CONFIG.weapons[id].name} unlocks at level ${BR.KNIFE_LEVEL[id]}`, 1600); return; }
    if (k === 'melee') P.data.equip.melee = id; else P.data.loadout[k] = id;
    P.save(); game.refreshCosmetics(); BR.Audio.pickup(); renderLoadout();
  });
  $('lo-reset').addEventListener('click', () => { const P = BR.Profile; P.data.loadout = { primary: 'rifle', secondary: 'pistol' }; P.data.equip.melee = 'tracker'; P.save(); game.refreshCosmetics(); BR.Audio.click(); renderLoadout(); });
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
