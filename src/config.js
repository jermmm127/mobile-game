'use strict';
// =============================================================================
// CONFIG — every tuning number in the game lives here.
// Change values here first before touching gameplay code.
// Units: meters, seconds, radians. Damage is in HP.
// =============================================================================
window.BR = window.BR || {};

BR.CONFIG = {
  version: '1.27.1',

  map: {
    size: 780,          // square map edge length (m): ~1.5x the area of the 640 m map
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
    launch: 24,         // outward push at the centre (m/s)
    lift: 30,           // minimum upward speed given at the centre (m/s): ~19 m apex (was 17 / ~6 m)
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
    runSpeed: 5.9,          // top ground speed from input alone
    crouchSpeed: 3.1,
    accelGround: 12,
    friction: 8,
    stopSpeed: 3,
    accelAir: 10,           // Quake-style air accel: steer & strafe, keeps momentum
    maxSpeed: 18.5,         // hard cap on horizontal speed

    gravity: 24,
    jumpSpeed: 8.2,         // ~1.4 m jump apex
    coyoteTime: 0.12,       // can still jump this long after walking off a ledge
    jumpBuffer: 0.08,       // jump pressed slightly early still fires on landing

    stepHeight: 0.55,       // auto step up stairs / curbs
    vaultHeight: 1.25,      // auto vault obstacles from the ground while moving forward
    mantleHeight: 1.75,     // grab & climb ledges this far above your feet while airborne

    slideMinSpeed: 0.8,     // fraction of runSpeed you need before Crouch becomes a slide
    slideBoost: 4.0,
    slideMaxSpeed: 14,
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
    wallRunSpeedSustain: 7.6,
    wallJumpOut: 7,
    wallJumpUp: 8,

    grapple: {
      range: 60,            // how far the hook reaches (walls, ground, trees, players: anything)
      pull: 40,             // pull acceleration (m/s²)
      maxSpeed: 21,         // top speed while reeling in
      maxTime: 1.6,         // auto-release after this long
      gravityScale: 0.3,
      cooldown: 5,          // seconds, starts when the hook releases
      releaseHop: 4,        // jump while hooked: let go with an upward kick
    },
    padSpeed: 23,           // jump pads launch you up at this speed

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
    revolver: { name: 'Revolver', ammo: 'heavy', dmg: 58, pellets: 1, rpm: 150, mag: 6, reload: 2.2, spread: 0.012, ads: 0.3, bloom: 0.012, bloomMax: 0.04, range: 90, head: 2.0, recoil: 0.07, kick: 2.4, zoom: 1.25, tier: 2, color: 0x8a8f96, revolver: true, knockback: 2 },     // v1.24.2: heavy kick
    butterfly: { name: 'Butterfly Knife', melee: true, ammo: null, dmg: 45, backstab: 110, pellets: 1, rpm: 150, mag: 0, reload: 0, spread: 0, ads: 1, bloom: 0, bloomMax: 0, range: 2.4, lunge: 4.8, head: 1.3, recoil: 0, zoom: 1, tier: -1, color: 0x9aa0a8, speedMult: 1.2 },
    // Default knife: M9-style bayonet (flipped into the hand on draw)
    bayonet: { name: 'M9 Bayonet', melee: true, ammo: null, dmg: 45, backstab: 110, pellets: 1, rpm: 140, mag: 0, reload: 0, spread: 0, ads: 1, bloom: 0, bloomMax: 0, range: 2.5, lunge: 4.8, head: 1.3, recoil: 0, zoom: 1, tier: -1, color: 0x1c1e22, speedMult: 1.2 },
    // v1.13: tanto-point survival knife (a touch heavier and slower than the bayonet)
    tracker: { name: 'Tracker', melee: true, ammo: null, dmg: 50, backstab: 110, pellets: 1, rpm: 130, mag: 0, reload: 0, spread: 0, ads: 1, bloom: 0, bloomMax: 0, range: 2.5, lunge: 4.8, head: 1.3, recoil: 0, zoom: 1, tier: -1, color: 0x1d1e20, speedMult: 1.2 },
    knife:   { name: 'Karambit', melee: true, ammo: null, dmg: 45, backstab: 110, pellets: 1, rpm: 140, mag: 0, reload: 0, spread: 0, ads: 1, bloom: 0, bloomMax: 0, range: 2.4, lunge: 4.8, head: 1.3, recoil: 0, zoom: 1, tier: -1, color: 0x1b1d21, speedMult: 1.2 },
    pistol:  { name: 'Pistol',  ammo: 'light',  dmg: 24, pellets: 1, rpm: 380, mag: 12, reload: 1.1, spread: 0.012, ads: 0.4, bloom: 0.010, bloomMax: 0.03, range: 55,  head: 1.8, recoil: 0.012, zoom: 1.2, tier: 0, color: 0x26282c, suppressed: true },     // v1.20 model: suppressed, extended mag
    // v1.19 SMG, tuned to the Superi 46's profile: a fast 950 rpm close-range shredder with a 30-round mag, very
    // fast to aim (adsRate) and to move with, a light, mostly vertical recoil with a small side bounce, strong
    // hip fire, low headshot bonus and a short effective range (damage drops off past ~18 m)
    smg:     { name: 'SMG',     ammo: 'light',  dmg: 20, pellets: 1, rpm: 950, mag: 30, reload: 1.9, spread: 0.024, ads: 0.42, bloom: 0.0028, bloomMax: 0.022, range: 18,  head: 1.3, recoil: 0.0078, recoilH: 0.0055, zoom: 1.3, tier: 1, color: 0x2f3237, speedMult: 1.08, adsRate: 20 },
    // Wide horizontal pellet line (tightens when aiming), shell-by-shell reload you can cancel by firing
    // v1.18.1 Mastiff-style: 8 heavy pellets in a wide horizontal line that tightens a lot when you aim,
    // a slow, heavy pump, shell-by-shell reload you can cancel by firing, and a longer reach than a normal shotgun
    shotgun: { name: 'Breacher', ammo: 'shells', dmg: 8, pellets: 8, pattern: 'line', rpm: 66, mag: 6, reload: 0.375, shellReload: true, spread: 0.042, ads: 0.4, pelletAssist: 0.42, bloom: 0, bloomMax: 0, range: 22, head: 1.25, recoil: 0.06, kick: 1.4, zoom: 1.15, tier: 1, color: 0x22252a, knockback: 13, pump: true },     // v1.24.3: 8 pellets x 8 = 64 a body blast (more on heads), each pellet counted where it lands; 66 rpm, 6 shells
    rifle:   { name: 'Rifle',   ammo: 'heavy',  dmg: 21, pellets: 1, rpm: 600, mag: 45, reload: 2.4, spread: 0.020, ads: 0.35, bloom: 0.006, bloomMax: 0.035, range: 100, head: 1.7, recoil: 0.015, recoilH: 0.018, zoom: 1.5, tier: 2, color: 0x2e3136 },
    holoar:  { name: 'Holo AR', ammo: 'heavy',  dmg: 19, pellets: 1, rpm: 660, mag: 45, reload: 2.4, spread: 0.022, ads: 0.22, bloom: 0.005, bloomMax: 0.03, range: 110, head: 1.7, recoil: 0.008, recoilH: 0.009, zoom: 1.75, tier: 2, color: 0x33363c, suppressed: true, holo: true },
    // Lightweight bolt-action with open iron sights: accurate from the hip (easy no-scopes), moves fast
    hunter:  { name: 'Hunting Rifle', ammo: 'heavy', dmg: 78, pellets: 1, rpm: 75, mag: 5, reload: 2.0, spread: 0.006, ads: 0.05, bloom: 0, bloomMax: 0, range: 250, head: 2.0, recoil: 0.05, kick: 1.5, zoom: 1.45, tier: 2, color: 0x24272c, bolt: true, easyHip: true, speedMult: 1.05, knockback: 2 },
    // Light machine gun: 80-round belt box, long sustained fire, slower to move with and reload
    // LMG: ACOG-style 4x prism scope -> its own round eyepiece when aimed (2x view zoom)
    lmg:     { name: 'LMG', ammo: 'heavy', dmg: 20, pellets: 1, rpm: 720, mag: 80, reload: 3.6, spread: 0.03, ads: 0.32, bloom: 0.004, bloomMax: 0.045, range: 90, head: 1.5, recoil: 0.012, recoilH: 0.02, kick: 0.6, zoom: 2.0, optic: 'acog', tier: 2, color: 0x3a3d33, speedMult: 0.9 },
    // Designated marksman rifle: semi-auto, hard-hitting, low-power prism optic
    dmr:     { name: 'DMR', ammo: 'heavy', dmg: 44, pellets: 1, rpm: 240, mag: 12, reload: 2.3, spread: 0.012, ads: 0.15, bloom: 0.012, bloomMax: 0.04, range: 200, head: 2.0, recoil: 0.03, kick: 0.9, zoom: 2.6, tier: 2, color: 0x5a5448, optic: 'prism' },
    // v1.17.2 Shockwave Launcher: lobs the purple shockwave grenade from a 4-round drum. Faster + flatter
    // than a thrown one, bursts on contact for more damage, and launches anyone caught in it (you too:
    // fire at your feet to rocket-jump). Shares shells with the Breacher.
    launcher: { name: 'Shockwave Launcher', ammo: 'shells', dmg: 0, pellets: 1, rpm: 80, mag: 4, reload: 2.9, spread: 0.008, ads: 0.6, bloom: 0, bloomMax: 0, range: 60, head: 1, recoil: 0.045, kick: 1.6, zoom: 1.3, tier: 2, color: 0x2a2433, launcher: true, launchSpeed: 38, blastDamage: 42 },
    sniper:  { name: 'Sniper',  ammo: 'heavy',  dmg: 95, pellets: 1, rpm: 42,  mag: 5,  reload: 2.6, spread: 0.035, ads: 0.03, bloom: 0, bloomMax: 0, range: 400, head: 2.2, recoil: 0.06, zoom: 4.0, tier: 3, color: 0x9a8a6c, scope: true, bolt: true, kick: 3.5, knockback: 4 },
  },

  // Loot rolls by spot tier. Weights are relative.
  loot: {
    tables: [
      { pistol: 22, smg: 16, shotgun: 14, rifle: 6, holoar: 4, hunter: 3, sniper: 1, revolver: 4, dmr: 2, ammo: 45, heal: 16, shield: 12, shock: 9 },     // tier 0: open ground
      { pistol: 8, smg: 18, shotgun: 18, rifle: 14, holoar: 10, hunter: 7, sniper: 4, revolver: 8, lmg: 6, dmr: 6, launcher: 3, ammo: 40, heal: 18, shield: 16, shock: 10 },   // tier 1: inside buildings
      { smg: 8, shotgun: 14, rifle: 18, holoar: 16, hunter: 12, sniper: 12, revolver: 9, lmg: 10, dmr: 9, launcher: 6, ammo: 30, heal: 16, shield: 22, shock: 14 },             // tier 2: roofs / towers
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
    { name: 'laishadev', salt: '5f69672d0e8a724baef1ded82a05745d', hash: '932dfd1b54ef6192788454059135bae7d6aff4b6f78ba400aee0300b9c95fe7a', dev: true },
  ],
  devCodeHash: '89799be69c532868209a761cbdcfbb642286502c419d77f5583bb8fd46e5db2a',
  // v1.16 dev commands (kick / ban / coins) are signed with an ECDSA P-256 key. Only the public half is
  // usable as-is; the private half is AES-GCM encrypted with a key derived (PBKDF2) from the private dev code,
  // so only someone who knows that code can sign. Every player's game verifies with `pub`.
  devSign: {"pub": {"x": "51uRU0R9Jk4JH2fqFoYXt-PoxT3AylBHhk_ZV6-MitA", "y": "JI6mQ9mknGMAFEeYPoY6KQRKLaW4hvi1ePkjkGhGMS0"}, "salt": "pXlMZ12kreiimORG2pmQPw==", "iv": "c9ee1JIGazfbHE+v", "ct": "u2dSD62ynBBJh6aafCPtup4gF1twIZ1Ov2WrLL/G2qJSDtuOF5HWq9jJSggUMHceUY8C27p2STIu6y6y9dWkSdoqP1MqIQhkwBLFB+JPujR0Cy8QMUnUY74FBjZwZWg5jZu7oFyI2FPOJFT8h2ceSxJwTpK2WxaW0MsYryrKeqd6bc9Y4duH8Xa9qSI0UsxZ73h4u5klitmHxg==", "iter": 150000},

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
    medium: { pixelRatio: 1.6, fogFar: 230, detail: 0.8 },    // (v1.25: 1.6 keeps a 60 Hz phone at 60 fps; still sharp on a 6 inch screen)    // adaptive resolution lowers it if frames drop
    high:   { pixelRatio: 3.0, fogFar: 300, detail: 1.0 },
  },

  botNames: [
    'Vex', 'Nova', 'Rook', 'Kestrel', 'Pike', 'Juno', 'Talon', 'Mako', 'Ember', 'Quill',
    'Sable', 'Rift', 'Onyx', 'Wren', 'Drift', 'Brisk', 'Halcyon', 'Flint', 'Gale', 'Lumen',
    'Cinder', 'Volt', 'Moss', 'Echo', 'Aster', 'Briar', 'Cobalt', 'Dune', 'Fable', 'Grit',
  ],
};

// Resurgence: smaller, faster circles. Respawns stay on until the 4th circle (index 3) starts.
BR.RESURGENCE_PHASES = [            // sized for the Ironreef island (380 m)
  { wait: 30, shrink: 30, radius: 150, dps: 2 },
  { wait: 40, shrink: 30, radius: 100, dps: 3 },
  { wait: 40, shrink: 25, radius: 62,  dps: 5 },
  { wait: 30, shrink: 25, radius: 34,  dps: 8 },
  { wait: 25, shrink: 20, radius: 14,  dps: 12 },
  { wait: 15, shrink: 20, radius: 0,   dps: 18 },
];

// Weapon rarity (v1.11): every gun drops as Common -> Mythic. Higher rarity = more damage, faster
// reloads and tighter spread. Colours are used on loot rings, name tags, HUD slots and prompts.
BR.RARITY = [
  { id: 'common',    name: 'Common',    css: '#b9c0c8', col: 0xb9c0c8, dmg: 1.00, reload: 1.00, spread: 1.00 },
  { id: 'uncommon',  name: 'Uncommon',  css: '#5fd35f', col: 0x5fd35f, dmg: 1.06, reload: 0.97, spread: 0.96 },
  { id: 'rare',      name: 'Rare',      css: '#45a8ff', col: 0x45a8ff, dmg: 1.12, reload: 0.94, spread: 0.92 },
  { id: 'epic',      name: 'Epic',      css: '#b26bff', col: 0xb26bff, dmg: 1.19, reload: 0.9,  spread: 0.88 },
  { id: 'legendary', name: 'Legendary', css: '#ff9a1f', col: 0xff9a1f, dmg: 1.27, reload: 0.86, spread: 0.84 },
  { id: 'mythic',    name: 'Mythic',    css: '#ffd84a', col: 0xffd84a, dmg: 1.36, reload: 0.8,  spread: 0.8 },
];
// odds per loot tier (0 floor, 1 buildings, 2 high ground, 3 chests + supply)
BR.RARITY_ODDS = [
  [46, 30, 16, 6, 2, 0],
  [26, 32, 24, 12, 5, 1],
  [12, 26, 30, 20, 10, 2],
  [0, 18, 34, 28, 16, 4],
];
BR.rollRarity = (tier, R) => { const o = BR.RARITY_ODDS[Math.max(0, Math.min(3, tier | 0))], tot = o.reduce((a, b) => a + b, 0); let r = (R || Math.random)() * tot; for (let i = 0; i < o.length; i++) { r -= o[i]; if (r < 0) return i; } return 0; };
BR.weaponScore = w => (w ? (w.def.tier || 0) + (w.rar || 0) * 0.7 : -1);

// v1.14 levels + knife unlocks (the Tracker is everyone's starting knife)
// v1.15.1: level L -> L+1 costs 1250 + 110·L XP. An average Battle Royale match is ~1,500 XP (a couple of kills,
// ~400 damage, ~5 min alive, a mid placing), so level 20 (45,900 XP) takes about 30 matches; every level after
// keeps costing more (level 50 -> 51 is 6,750 XP, 99 -> 100 is 12,140).
BR.LEVELS = { max: 100, coins: 150, need: L => 1250 + 110 * L, ranked: 20 };      // v1.16: Ranked unlocks at level 20
BR.KNIFE_LEVEL = { tracker: 0, bayonet: 20, knife: 40, butterfly: 60 };
