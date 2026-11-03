'use strict';
// =============================================================================
// CONFIG — every tuning number in the game lives here.
// Change values here first before touching gameplay code.
// Units: meters, seconds, radians. Damage is in HP.
// =============================================================================
window.BR = window.BR || {};

BR.CONFIG = {
  version: '1.5.6',

  map: {
    size: 640,          // square map edge length (m) — ~4x the area of v0.3
    cell: 8,            // spatial-hash cell size for collision / raycasts
  },

  match: {
    defaultBots: 29,     // 29 bots + you = 30 players. 0 bots = practice mode
    maxBots: 39,
    dropHeight: 110,     // everyone skydives in from this height
    endDelay: 2.4,       // seconds between your death/win and the results screen
    botLootPhase: 80,    // seconds until bots engage at full sight range
    botVsBotDamage: 0.4, // pacing: bots hurt each other less so the lobby doesn't empty in 30s
    demoBots: 16,        // bots in the menu's live "trailer" match
  },

  // Stim shot: HUD button / F key. Speed boost + heal over time.
  // Shockwave grenade (trickshot item): T / NADE button. Launches everyone in range.
  shockwave: {
    radius: 8,          // blast radius (m)
    launch: 21,         // outward push at the centre (m/s)
    lift: 17,           // minimum upward speed given at the centre (m/s)
    damage: 15,         // to enemies only (you take none from your own)
    fuse: 2.4,          // detonates on contact, or after this long
    throwSpeed: 19, throwLift: 4, gravity: 20,
    maxCarry: 3, throwCooldown: 0.5,
  },

  stim: {
    cooldown: 4,        // seconds between stims
    speedTime: 3,       // movement boost duration
    speedMult: 1.3,     // run speed x this while boosted
    healTime: 5,        // heal-over-time duration
    tickRate: 10,       // heal ticks per second
    healPerTick: 1,     // HP per tick (10 HP/s, 50 HP per stim)
  },

  actor: {
    maxHealth: 100,
    maxShield: 100,
    radius: 0.38,       // collision half-width
    standHeight: 1.8,
    slideHeight: 1.05,
    crouchHeight: 1.2,
    eyeFromTop: 0.14,
  },

  // ---- Movement (shared by player AND bots) --------------------------------
  move: {
    runSpeed: 6.9,          // top ground speed from input alone
    crouchSpeed: 3.4,
    accelGround: 12,
    friction: 8,
    stopSpeed: 3,
    accelAir: 10,           // Quake-style air accel: steer & strafe, keeps momentum
    maxSpeed: 20,           // hard cap on horizontal speed

    gravity: 24,
    jumpSpeed: 8.2,         // ~1.4 m jump apex
    coyoteTime: 0.12,       // can still jump this long after walking off a ledge
    jumpBuffer: 0.08,       // jump pressed slightly early still fires on landing

    stepHeight: 0.55,       // auto step up stairs / curbs
    vaultHeight: 1.25,      // auto vault obstacles from the ground while moving forward
    mantleHeight: 1.75,     // grab & climb ledges this far above your feet while airborne

    slideMinSpeed: 0.8,     // fraction of runSpeed you need before Crouch becomes a slide
    slideBoost: 4.5,
    slideMaxSpeed: 15.5,
    slideFriction: 0.45,
    slideEndSpeed: 4.2,
    slideMaxTime: 1.1,
    slideCooldown: 0.75,
    slideQueueTime: 0.35,   // press crouch in the air -> slide on landing

    wallRunMinSpeed: 4.6,
    wallRunGravityScale: 0.15,
    wallRunMaxFall: 1.5,
    wallRunMaxTime: 1.4,
    wallRunStartLift: 2.5,
    wallRunEnterVy: 5,      // must be past the fast part of a jump before a wall-run catches
    wallRunSpeedSustain: 8.2,
    wallJumpOut: 7,
    wallJumpUp: 8,

    grapple: {
      range: 60,            // how far the hook reaches (walls, ground, trees, players: anything)
      pull: 40,             // pull acceleration (m/s²)
      maxSpeed: 23,         // top speed while reeling in
      maxTime: 1.6,         // auto-release after this long
      gravityScale: 0.3,
      cooldown: 5,          // seconds, starts when the hook releases
      releaseHop: 4,        // jump while hooked: let go with an upward kick
    },
    padSpeed: 17,           // jump pads launch you up at this speed

    // Intentional "bugs" — movement tech with a skill ceiling. Set a window to 0 to disable one.
    tech: {
      bhopWindow: 0.07,       // jump within this long after landing keeps ALL your speed (timed, no auto-hop)
      slideHopWindow: 0.15,   // crouch this soon after landing: slide with no cooldown, cap rises to maxSpeed
      superJumpWindow: 0.12,  // jump this soon after starting a slide: bigger jump
      superJumpMult: 1.4,
      superJumpCooldown: 6,   // seconds between super jumps
      mantleBoostWindow: 0.25, // jump while mantling: launch forward
      mantleBoost: 6,
      wallChainCooldown: 0.12, // short cooldown after a wall-jump so you can catch the next wall
    },

    dropFallSpeed: 18,      // freefall terminal velocity
    dropGlideSpeed: 22,     // freefall horizontal steering speed (big map: cover ground)
    dropAccel: 10,
    chuteFallSpeed: 5.5,    // parachute open: slow descent...
    chuteGlideSpeed: 13,    // ...and gentler steering
    chuteAutoHeight: 22,    // the chute opens by itself this high above the ground
  },

  camera: {
    fov: 80,                // default; players change it in Settings
    fovSpeedBoost: 12,      // extra FOV at high speed
    near: 0.05,
    far: 1000,
    wallRunRoll: 0.12,
  },

  look: {
    touch: 0.0058,          // radians per CSS pixel at sensitivity 1.0
    adsMult: 0.65,          // extra look slowdown while aiming down sights
    aimAssist: 0.35,        // touch only: 0 = off. Pull + slowdown near targets
  },

  ammoCap: { light: 210, heavy: 150, shells: 48 },
  ammoPickup: { light: 30, heavy: 24, shells: 10 },

  // ---- Weapons -------------------------------------------------------------
  // dmg per pellet, rpm, mag size, reload seconds (per shell if shellReload),
  // spread (radians, hip fire), range = full damage distance (falls to 55% at 2x),
  // tier = loot rarity, knockback = self-push when airborne / aimed at your feet
  weapons: {
    // Revolver: six heavy rounds, big punch, swing-out cylinder + speedloader reload
    revolver: { name: 'Revolver', ammo: 'heavy', dmg: 58, pellets: 1, rpm: 150, mag: 6, reload: 2.2, spread: 0.012, ads: 0.3, bloom: 0.012, bloomMax: 0.04, range: 90, head: 2.0, recoil: 0.055, zoom: 1.25, tier: 2, color: 0x8a8f96, revolver: true, knockback: 2 },
    butterfly: { name: 'Butterfly Knife', melee: true, ammo: null, dmg: 45, backstab: 110, pellets: 1, rpm: 150, mag: 0, reload: 0, spread: 0, ads: 1, bloom: 0, bloomMax: 0, range: 2.4, lunge: 4.8, head: 1.3, recoil: 0, zoom: 1, tier: -1, color: 0x9aa0a8, speedMult: 1.2 },
    knife:   { name: 'Karambit', melee: true, ammo: null, dmg: 45, backstab: 110, pellets: 1, rpm: 140, mag: 0, reload: 0, spread: 0, ads: 1, bloom: 0, bloomMax: 0, range: 2.4, lunge: 4.8, head: 1.3, recoil: 0, zoom: 1, tier: -1, color: 0x9aa0a8, speedMult: 1.2 },
    pistol:  { name: 'Pistol',  ammo: 'light',  dmg: 24, pellets: 1, rpm: 380, mag: 12, reload: 1.1, spread: 0.012, ads: 0.4, bloom: 0.010, bloomMax: 0.03, range: 55,  head: 1.8, recoil: 0.012, zoom: 1.2, tier: 0, color: 0x8e96a3 },
    smg:     { name: 'SMG',     ammo: 'light',  dmg: 15, pellets: 1, rpm: 1100, mag: 35, reload: 1.6, spread: 0.030, ads: 0.6, bloom: 0.0035, bloomMax: 0.03, range: 40,  head: 1.5, recoil: 0.0095, recoilH: 0.012, zoom: 1.3, tier: 1, color: 0x2f3237 },
    // Wide horizontal pellet line (tightens when aiming), shell-by-shell reload you can cancel by firing
    shotgun: { name: 'Breacher', ammo: 'shells', dmg: 13, pellets: 8, pattern: 'line', rpm: 80, mag: 6, reload: 0.42, shellReload: true, spread: 0.10, ads: 0.6, bloom: 0, bloomMax: 0, range: 20, head: 1.4, recoil: 0.05, zoom: 1.15, tier: 1, color: 0x22252a, knockback: 13, pump: true },
    rifle:   { name: 'Rifle',   ammo: 'heavy',  dmg: 21, pellets: 1, rpm: 600, mag: 45, reload: 2.4, spread: 0.020, ads: 0.35, bloom: 0.006, bloomMax: 0.035, range: 100, head: 1.7, recoil: 0.015, recoilH: 0.018, zoom: 1.5, tier: 2, color: 0x2e3136 },
    holoar:  { name: 'Holo AR', ammo: 'heavy',  dmg: 19, pellets: 1, rpm: 660, mag: 45, reload: 2.4, spread: 0.022, ads: 0.22, bloom: 0.005, bloomMax: 0.03, range: 110, head: 1.7, recoil: 0.008, recoilH: 0.009, zoom: 1.75, tier: 2, color: 0x33363c, suppressed: true, holo: true },
    // Lightweight bolt-action with open iron sights: accurate from the hip (easy no-scopes), moves fast
    hunter:  { name: 'Hunting Rifle', ammo: 'heavy', dmg: 78, pellets: 1, rpm: 75, mag: 5, reload: 2.0, spread: 0.006, ads: 0.05, bloom: 0, bloomMax: 0, range: 250, head: 2.0, recoil: 0.035, zoom: 1.45, tier: 2, color: 0x7a4a2a, bolt: true, easyHip: true, speedMult: 1.05, knockback: 2 },
    sniper:  { name: 'Sniper',  ammo: 'heavy',  dmg: 95, pellets: 1, rpm: 42,  mag: 5,  reload: 2.6, spread: 0.035, ads: 0.03, bloom: 0, bloomMax: 0, range: 400, head: 2.2, recoil: 0.06, zoom: 4.0, tier: 3, color: 0x9a8a6c, scope: true, bolt: true, kick: 3.5, knockback: 4 },
  },

  // Loot rolls by spot tier. Weights are relative.
  loot: {
    tables: [
      { pistol: 22, smg: 16, shotgun: 14, rifle: 6, holoar: 4, hunter: 3, sniper: 1, revolver: 4, ammo: 45, heal: 16, shield: 12, shock: 9 },     // tier 0: open ground
      { pistol: 8, smg: 18, shotgun: 18, rifle: 14, holoar: 10, hunter: 7, sniper: 4, revolver: 8, ammo: 40, heal: 18, shield: 16, shock: 10 },   // tier 1: inside buildings
      { smg: 8, shotgun: 14, rifle: 18, holoar: 16, hunter: 12, sniper: 12, revolver: 9, ammo: 30, heal: 16, shield: 22, shock: 14 },             // tier 2: roofs / towers
    ],
    healAmount: 50,
    shieldAmount: 50,
    pickupRadius: 1.6,
  },

  // ---- Accounts -----------------------------------------------------------------
  // SHA-256 of the private dev code. Redeeming that code on an account gives it
  // infinite coins on THIS device. Offline only: once the game has a server, the
  // server decides who is a dev and this check should be removed (see accounts.js).
  // Built-in accounts that exist on every device. Only a salted SHA-256 of the
  // password is stored. dev: infinite coins + every shop item unlocked.
  seedAccounts: [
    { name: 'jermmm', salt: 'b275785f07d6d05b4bf1e6a734075234', hash: '279c7e735ac93532a6f4af6fbddefe13336a6ebc1232f8687ab94329ad33d20a', dev: true },
    { name: 'jermdev', salt: 'b1856c19fee53b96456b60e0eee75144', hash: '3997a0cb437595b13d9062c6035befab837e373d2914115d644a6d3fa74f7a32', dev: true },
  ],
  devCodeHash: '89799be69c532868209a761cbdcfbb642286502c419d77f5583bb8fd46e5db2a',

  // ---- Coins (saved per account) -------------------------------------------
  coins: { start: 150, perKill: 25, win: 150, top5: 60, top10: 25, perDamage: 0.05 },

  // ---- Zone (the shrinking safe circle) ------------------------------------
  // radius = target radius at the end of that phase. dps = damage/second outside.
  zone: {
    phases: [
      { wait: 60, shrink: 45, radius: 230, dps: 1 },
      { wait: 45, shrink: 40, radius: 140, dps: 2 },
      { wait: 40, shrink: 30, radius: 80,  dps: 4 },
      { wait: 30, shrink: 25, radius: 40,  dps: 7 },
      { wait: 25, shrink: 20, radius: 15,  dps: 10 },
      { wait: 15, shrink: 20, radius: 0,   dps: 15 },
    ],
  },

  // ---- Bots ----------------------------------------------------------------
  difficulty: {
    easy:   { reaction: 1.6,  aimError: 2.3,  settle: 3.2, turnRate: 2.2, playerDamageMult: 0.22, viewDist: 35, fov: 1.3, burst: [0.12, 0.28], pause: [1.1, 2.2], jumpiness: 0.05 },
    normal: { reaction: 0.55, aimError: 0.7,  settle: 1.2, turnRate: 6.0, playerDamageMult: 0.65, viewDist: 70, fov: 1.9, burst: [0.3, 0.7],  pause: [0.35, 0.8], jumpiness: 0.35 },
    hard:   { reaction: 0.3,  aimError: 0.4,  settle: 0.7, turnRate: 9.0, playerDamageMult: 1.0,  viewDist: 90, fov: 2.1, burst: [0.4, 0.9],  pause: [0.2, 0.5], jumpiness: 0.6 },
  },

  graphics: {
    low:    { pixelRatio: 1.0, fogFar: 170, detail: 0.4 },    // pixelRatio is capped by the device's own;
    medium: { pixelRatio: 2.0, fogFar: 230, detail: 0.8 },    // adaptive resolution lowers it if frames drop
    high:   { pixelRatio: 3.0, fogFar: 300, detail: 1.0 },
  },

  botNames: [
    'Vex', 'Nova', 'Rook', 'Kestrel', 'Pike', 'Juno', 'Talon', 'Mako', 'Ember', 'Quill',
    'Sable', 'Rift', 'Onyx', 'Wren', 'Drift', 'Brisk', 'Halcyon', 'Flint', 'Gale', 'Lumen',
    'Cinder', 'Volt', 'Moss', 'Echo', 'Aster', 'Briar', 'Cobalt', 'Dune', 'Fable', 'Grit',
  ],
};
