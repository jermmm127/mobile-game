'use strict';
// =============================================================================
// CONFIG — every tuning number in the game lives here.
// Change values here first before touching gameplay code.
// Units: meters, seconds, radians. Damage is in HP.
// =============================================================================
window.BR = window.BR || {};

BR.CONFIG = {
  version: '0.1.0',

  map: {
    size: 340,          // square map edge length (m)
    cell: 8,            // spatial-hash cell size for collision / raycasts
  },

  match: {
    defaultBots: 19,    // 19 bots + you = 20 players
    dropHeight: 75,     // everyone skydives in from this height
    endDelay: 2.4,      // seconds between your death/win and the results screen
    botLootPhase: 80,    // seconds until bots engage at full sight range
    botVsBotDamage: 0.4, // pacing: bots hurt each other less so the lobby doesn't empty in 30s
  },

  actor: {
    maxHealth: 100,
    maxShield: 100,
    radius: 0.38,       // collision half-width
    standHeight: 1.8,
    slideHeight: 1.05,
    eyeFromTop: 0.14,
  },

  // ---- Movement (shared by player AND bots) --------------------------------
  move: {
    runSpeed: 8.2,          // top ground speed from input alone
    accelGround: 12,
    friction: 8,
    stopSpeed: 3,
    accelAir: 10,           // Quake-style air accel: steer & strafe, keeps momentum
    maxSpeed: 22,           // hard cap on horizontal speed

    gravity: 24,
    jumpSpeed: 8.4,         // ~1.45 m jump apex
    coyoteTime: 0.12,       // can still jump this long after walking off a ledge
    jumpBuffer: 0.14,       // jump pressed slightly early still fires on landing

    stepHeight: 0.55,       // auto step up stairs / curbs
    vaultHeight: 1.25,      // auto vault obstacles from the ground while moving forward
    mantleHeight: 1.75,     // grab & climb ledges this far above your feet while airborne

    slideBoost: 5,
    slideMaxSpeed: 17,
    slideFriction: 0.45,
    slideSteer: 10,
    slideEndSpeed: 4.5,
    slideMaxTime: 1.1,
    slideCooldown: 0.75,
    slideQueueTime: 0.35,   // press slide in the air -> slide on landing

    wallRunMinSpeed: 5.0,
    wallRunGravityScale: 0.15,
    wallRunMaxFall: 1.5,
    wallRunMaxTime: 1.4,
    wallRunStartLift: 2.5,
    wallRunEnterVy: 5,      // must be past the fast part of a jump before a wall-run catches
    wallRunSpeedSustain: 9, // wall-running keeps you at least this fast
    wallJumpOut: 7,
    wallJumpUp: 8,

    dropFallSpeed: 16,      // skydive terminal velocity
    dropGlideSpeed: 18,     // skydive horizontal steering speed
    dropAccel: 10,
  },

  camera: {
    fov: 80,
    fovSpeedBoost: 12,      // extra FOV at high speed
    near: 0.05,
    far: 420,
    wallRunRoll: 0.12,
  },

  look: {
    touch: 0.0058,          // radians per CSS pixel at sensitivity 1.0
    mouse: 0.0022,
    adsMult: 0.65,          // extra look slowdown while aiming down sights
    aimAssist: 0.35,        // touch only: 0 = off. Pull + slowdown near targets
  },

  ammoCap: { light: 210, heavy: 120, shells: 40 },
  ammoPickup: { light: 30, heavy: 20, shells: 8 },

  // ---- Weapons -------------------------------------------------------------
  // dmg per pellet, rpm, mag size, reload seconds, spread (radians, hip fire),
  // range = full damage distance (falls to 55% at 2x range), tier = loot rarity
  weapons: {
    pistol:  { name: 'Pistol',  ammo: 'light',  dmg: 24, pellets: 1, rpm: 380, mag: 12, reload: 1.1, spread: 0.012, ads: 0.4, bloom: 0.010, bloomMax: 0.03, range: 55,  head: 1.8, recoil: 0.012, zoom: 1.2, tier: 0, color: 0x9aa4b1, len: 0.28 },
    smg:     { name: 'SMG',     ammo: 'light',  dmg: 15, pellets: 1, rpm: 850, mag: 30, reload: 1.6, spread: 0.030, ads: 0.6, bloom: 0.004, bloomMax: 0.03, range: 40,  head: 1.5, recoil: 0.006, zoom: 1.3, tier: 1, color: 0x58c4dd, len: 0.42 },
    shotgun: { name: 'Shotgun', ammo: 'shells', dmg: 11, pellets: 9, rpm: 72,  mag: 5,  reload: 2.3, spread: 0.075, ads: 0.75, bloom: 0, bloomMax: 0,       range: 22,  head: 1.5, recoil: 0.045, zoom: 1.2, tier: 1, color: 0xd98c45, len: 0.55 },
    rifle:   { name: 'Rifle',   ammo: 'heavy',  dmg: 21, pellets: 1, rpm: 600, mag: 30, reload: 2.0, spread: 0.020, ads: 0.35, bloom: 0.006, bloomMax: 0.035, range: 100, head: 1.7, recoil: 0.009, zoom: 1.6, tier: 2, color: 0x7fbf63, len: 0.6 },
    sniper:  { name: 'Sniper',  ammo: 'heavy',  dmg: 95, pellets: 1, rpm: 42,  mag: 5,  reload: 2.6, spread: 0.035, ads: 0.03, bloom: 0, bloomMax: 0,       range: 400, head: 2.2, recoil: 0.06,  zoom: 4.0, tier: 3, color: 0xb98be8, len: 0.8, scope: true },
  },

  // Loot rolls by spot tier. Weights are relative.
  loot: {
    tables: [
      { pistol: 22, smg: 16, shotgun: 12, rifle: 8, sniper: 1, ammo: 45, heal: 16, shield: 12 },    // tier 0: open ground
      { pistol: 8, smg: 18, shotgun: 16, rifle: 18, sniper: 4, ammo: 40, heal: 18, shield: 16 },    // tier 1: inside buildings
      { smg: 10, shotgun: 12, rifle: 24, sniper: 14, ammo: 30, heal: 16, shield: 22 },              // tier 2: roofs / towers
    ],
    healAmount: 50,
    shieldAmount: 50,
    pickupRadius: 1.6,
  },

  // ---- Zone (the shrinking safe circle) ------------------------------------
  // radius = target radius at the end of that phase. dps = damage/second outside.
  zone: {
    phases: [
      { wait: 45, shrink: 35, radius: 115, dps: 1 },
      { wait: 35, shrink: 30, radius: 68,  dps: 2 },
      { wait: 30, shrink: 25, radius: 38,  dps: 4 },
      { wait: 25, shrink: 20, radius: 18,  dps: 7 },
      { wait: 20, shrink: 20, radius: 6,   dps: 10 },
      { wait: 15, shrink: 25, radius: 0,   dps: 15 },
    ],
  },

  // ---- Bots ----------------------------------------------------------------
  difficulty: {
    easy:   { reaction: 0.8,  aimError: 1.0,  settle: 1.6, turnRate: 4.0, playerDamageMult: 0.55, viewDist: 55, fov: 1.7, burst: [0.2, 0.5],  pause: [0.5, 1.0], jumpiness: 0.15 },
    normal: { reaction: 0.55, aimError: 0.7,  settle: 1.2, turnRate: 6.0, playerDamageMult: 0.65, viewDist: 70, fov: 1.9, burst: [0.3, 0.7],  pause: [0.35, 0.8], jumpiness: 0.35 },
    hard:   { reaction: 0.3,  aimError: 0.4,  settle: 0.7, turnRate: 9.0, playerDamageMult: 1.0,  viewDist: 90, fov: 2.1, burst: [0.4, 0.9],  pause: [0.2, 0.5], jumpiness: 0.6 },
  },

  graphics: {
    low:    { pixelRatio: 0.75, fogFar: 170 },   // pixelRatio is capped by the device's own
    medium: { pixelRatio: 1.25, fogFar: 230 },
    high:   { pixelRatio: 2.0, fogFar: 300 },
  },

  botNames: [
    'Vex', 'Nova', 'Rook', 'Kestrel', 'Pike', 'Juno', 'Talon', 'Mako', 'Ember', 'Quill',
    'Sable', 'Rift', 'Onyx', 'Wren', 'Drift', 'Brisk', 'Halcyon', 'Flint', 'Gale', 'Lumen',
    'Cinder', 'Volt', 'Moss', 'Echo', 'Aster', 'Briar', 'Cobalt', 'Dune', 'Fable', 'Grit',
  ],
};
