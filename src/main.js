'use strict';
// =============================================================================
// MAIN — boot, menu / settings / shop wiring. Settings persist per device.
// =============================================================================
(function boot() {
  const DEFAULTS = { difficulty: 'normal', bots: BR.CONFIG.match.defaultBots, sens: 1.0, fov: BR.CONFIG.camera.fov, gfx: 'medium', volume: 0.6, assist: true, autoFire: false, showFps: false };
  const stored = BR.util.load('velocity-royale.settings', {});
  if (stored.bots === undefined && typeof stored.players === 'number') stored.bots = Math.max(0, stored.players - 1); // v0.2 -> v0.3
  const settings = Object.assign({}, DEFAULTS, stored);
  const save = () => BR.util.save('velocity-royale.settings', settings);
  BR.Profile.load();

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
  BR.updateCoins = () => { $('menu-coins').textContent = BR.Profile.data.coins; };
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
  range('set-bots', 'bots', v => v === 0 ? 'NONE' : v + '');
  range('set-sens', 'sens', v => v.toFixed(2) + '×');
  range('set-fov', 'fov', v => v + '°');
  range('set-vol', 'volume', v => Math.round(v * 100) + '%', () => BR.Audio.setVolume(settings.volume));
  check('set-assist', 'assist');
  check('set-auto', 'autoFire');
  check('set-fps', 'showFps');
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
  BR.shop = shop;
  $('btn-shop').addEventListener('click', () => { BR.Audio.init(); shop.open(); });

  // ---- match flow ------------------------------------------------------------
  const play = () => { BR.Audio.init(); tryFullscreen(); game.startMatch(); };
  $('btn-play').addEventListener('click', play);
  $('btn-again').addEventListener('click', play);
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
