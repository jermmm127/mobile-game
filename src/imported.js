'use strict';
// =============================================================================
// IMPORTED MODELS (v1.16.3): placement for 3D models brought in with tools/import_model.py.
// Model space is the .glb's own (here: barrel along -X, up +Y, left side +Z); models.js turns it so the
// barrel points down -Z and applies scale + offset (both in game metres). Points below are GAME space:
//   grip / fore / charge   where the right hand, left hand and charging hand go
//   sight                  rear-sight aim point (y, rearZ), front post z, ADS eye distance
//   muzzle [y, z]          flash + tracer origin;   charm [x, y, z]
//   magBox                 MODEL-space box: triangles whose centre is inside become the magazine part
// =============================================================================
BR.IMPORTED = {
  // "AK 420 Liberator" (Meshy AI export) -> Rifle. 1.91 model units long -> ~1.24 m.
  rifle: {
    scale: 0.65, offset: [0.017, -0.049, -0.135],
    magBox: { x: [-0.245, 0.02], y: [-1, 0.088] },
    grip: [0, -0.075, 0.06], fore: [0, 0.004, -0.4], charge: [0.045, 0.08, -0.13],
    sight: { y: 0.134, rearZ: -0.232, frontZ: -0.733, dist: 0.42 },
    muzzle: [0.059, -0.762], charm: [-0.04, -0.02, 0.12],
    shininess: 40, reflect: 0.1,
  },
};

// v1.18: three more imports (untextured sculpts -> the game's worn black factory finish)
Object.assign(BR.IMPORTED, {
  // "tactical M416" -> Holo AR. Holo window centre (model) x 0.11..0.22, y 0.295.
  holoar: {
    scale: 0.64, offset: [0, -0.043, -0.183],
    magBox: { x: [-0.065, 0.17], y: [-1, 0.06] },
    grip: [0, -0.075, 0.06], fore: [0, -0.01, -0.36], charge: [0.04, 0.085, 0.0],
    sight: { y: 0.146, rearZ: -0.077, dist: 0.44 },
    holo: { y: 0.146, z: -0.11, w: 0.038, h: 0.032 },
    muzzle: [0.046, -0.792], charm: [-0.04, -0.02, 0.15],
  },
  // "tactical PCC" -> SMG (a pistol-calibre carbine: longer than the old compact SMG). Flip-up irons.
  smg: {
    scale: 0.42, offset: [0, -0.053, -0.087],
    magBox: { x: [-0.12, 0.13], y: [-1, 0.09] },
    grip: [0, -0.07, 0.035], fore: [0, -0.015, -0.25], charge: [0.035, 0.06, -0.02],
    sight: { y: 0.074, rearZ: -0.003, frontZ: -0.381, dist: 0.37, noDot: true },
    muzzle: [0.01, -0.487], charm: [-0.03, -0.02, 0.12],
  },
  // "tactical LMG + ACOG" -> LMG. ACOG axis (model) y 0.28, objective x 0.07, eyepiece x 0.44.
  lmg: {
    scale: 0.635, offset: [0, -0.043, -0.196],
    magBox: { x: [-0.08, 0.22], y: [-1, -0.005] },
    grip: [0, -0.075, 0.09], fore: [0, -0.05, -0.36], charge: [0.05, 0.05, -0.05],
    sight: { y: 0.134, rearZ: -0.037, dist: 0.36, noDot: true },
    muzzle: [0.0205, -0.801], charm: [-0.05, -0.02, 0.17],
  },
});
// v1.18: the Rifle keeps its sculpted detail (normal map) but loses its green paint: black factory finish
BR.IMPORTED.rifle.finish = 'factory';

// v1.18.1: sci-fi pump shotgun -> Breacher. Pump grip under the front (model x -0.88..-0.66) is split off
// as userData.pump so it racks back after every shot. Iron sights on the top rail.
BR.IMPORTED.shotgun = {
  scale: 0.552, offset: [0, -0.005, -0.149],
  pumpBox: { x: [-0.88, -0.66], y: [-1, -0.035] },
  grip: [0, -0.06, 0.088], fore: [0, -0.066, -0.57], charge: null,
  sight: { y: 0.125, rearZ: 0.017, frontZ: -0.657, dist: 0.26 },
  muzzle: [0.089, -0.675], charm: [-0.03, -0.02, 0.12],
  port: [0, -0.035, -0.06],          // v1.20: shells go in under the receiver, just ahead of the trigger guard
};

// v1.20: three more imports (untextured sculpts in the game's finish)
Object.assign(BR.IMPORTED, {
  // "tactical pistol" -> Pistol: suppressor + extended magazine. Slide (model x -0.3..0.95) = 0.25 m.
  pistol: {
    scale: 0.2, offset: [0, -0.058, -0.14],
    magBox: { x: [0.5, 1.0], y: [-1, -0.06] },
    grip: [0, -0.06, 0.012], fore: [-0.012, -0.095, 0.0], charge: [0, 0.05, 0.035],
    sight: { y: 0.0792, rearZ: 0.03, frontZ: -0.176, dist: 0.4 },
    muzzle: [0.0563, -0.33], charm: [-0.03, -0.02, 0.06],
  },
  // "DMR piercing strike" -> DMR: M14-style marksman rifle, prism scope (model x 0.1..0.35, axis y 0.178), suppressor.
  dmr: {
    scale: 0.65, offset: [-0.005, -0.0106, -0.0355],
    magBox: { x: [-0.14, 0.03], y: [-1, -0.005] },
    grip: [0, -0.075, 0.075], fore: [0, -0.02, -0.263], charge: [0.05, 0.05, -0.06],
    sight: { y: 0.105, rearZ: 0.107, dist: 0.4, noDot: true },
    muzzle: [0.045, -0.653], charm: [-0.035, -0.02, 0.2],
  },
  // "Kar98k" -> Hunting Rifle: bolt action with open sights. The bolt handle (right side, model x 0.15..0.36)
  // is split off so it cycles after every shot.
  hunter: {
    scale: 0.58, offset: [0.0046, -0.0103, -0.088],
    boltBox: { x: [0.15, 0.36], y: [-1, 1], z: [-1, -0.034] },
    bolt: { pivot: [0, 0.0535, 0.057], knob: [0.0435, -0.0465, 0.012] },
    grip: [0, -0.06, 0.19], fore: [0, -0.01, -0.23], charge: [0.055, 0.03, 0.14],
    sight: { y: 0.0818, rearZ: -0.146, frontZ: -0.627, dist: 0.6, noDot: true },
    muzzle: [0.05, -0.639], charm: [-0.035, -0.02, 0.24],
  },
});

// v1.21: sniper, revolver, launcher + all four knives. Knives use axes 'upright' (blade +Y, edge -Z) or a
// rotation about a pivot so they land exactly where the procedural knives were: every grip, flip and twirl
// still fits. bladeBox parts wear the knife's camo / blueprint blade finish.
Object.assign(BR.IMPORTED, {
  // heavy bolt-action sniper, low-mounted scope: scope axis (model) y 0.185 -> the aim point is on it
  sniper: {
    scale: 0.68, offset: [0.0034, -0.0498, -0.137],
    magBox: { x: [0.05, 0.2], y: [-1, -0.02] },
    grip: [0, -0.09, 0.033], fore: [0, -0.04, -0.24], charge: [0.05, 0.05, 0.0],
    sight: { y: 0.076, rearZ: -0.035, dist: 0.36, noDot: true },
    muzzle: [0.04, -0.817], charm: [-0.034, -0.02, 0.2],
  },
  // tactical revolver: the cylinder (model x 0.04..0.36) is split onto the crane so it swings out + spins
  revolver: {
    scale: 0.19, offset: [0, -0.0027, -0.06],
    cylBox: { x: [0.04, 0.36], y: [0.05, 0.42] }, cylC: [0, 0.042, -0.022],
    grip: [0, -0.05, 0.065], fore: [-0.012, -0.075, 0.05], charge: [0, 0.09, 0.03],
    sight: { y: 0.091, rearZ: 0.016, frontZ: -0.231, dist: 0.34 },
    muzzle: [0.054, -0.25], charm: [-0.02, -0.07, 0.09],
  },
  // Shockwave Launcher: the lower canister is the drum (comes off on reloads)
  launcher: {
    scale: 0.45, offset: [0, -0.015, -0.071],
    magBox: { x: [-0.75, 0.02], y: [-1, -0.03] },
    grip: [0, -0.07, 0.1], fore: [0, -0.06, -0.25], charge: [0.05, 0.03, 0.0],
    sight: { y: 0.1335, rearZ: -0.026, dist: 0.36, noDot: true },
    muzzle: [0.038, -0.521], charm: [-0.036, -0.01, 0.1],
  },
  // knives
  knife: {           // Karambit: blade root at the origin, ring centre at (0, 0.066, 0.12) like the procedural one
    scale: 0.17, pivot: [0, 0.0425, -0.0595], rot: [-0.55, 0, 0], offset: [0, -0.0425, 0.0595], kScale: 1.33,     // a third bigger than the old one
    bladeBox: { x: [-1.1, -0.38] }, knife: 'karambit',
    grip: [0, 0.02, 0.05], muzzle: [0, -0.15], charm: [0, -0.02, 0.12],
  },
  bayonet: {
    scale: 0.156, axes: 'upright', offset: [0, 0.0096, 0.003],
    bladeBox: { x: [-1.1, 0.05] }, knife: 'baylike',
    grip: [0, -0.07, 0.0], muzzle: [0, 0.15], charm: [0, -0.13, 0],
  },
  tracker: {
    scale: 0.172, axes: 'upright', offset: [0, 0.0172, -0.003],
    bladeBox: { x: [-1.1, -0.02] }, knife: 'baylike',
    grip: [0, -0.07, 0.0], muzzle: [0, 0.16], charm: [0, -0.135, 0],
  },
  butterfly: {       // open in the file (handles together under the blade); the two handles split by side
    scale: 0.148, axes: 'upright', pivot: [0.00074, 0.03256, 0.00888], rot: [-0.443, 0, 0], offset: [-0.0007, -0.0286, -0.0079],
    bladeBox: { x: [-1.1, -0.2] }, handleSplit: { x: -0.2, z: -0.005 }, hinge: [0, 0.004, 0.001], knife: 'butterfly',
    grip: [0, -0.07, 0.0], muzzle: [0, 0.14], charm: [0, -0.13, 0],
  },
});
// v1.23: every gun wears the black factory finish by default (sculpted detail kept, paint and mismatched colours dropped);
// knives keep their own steel and grips
for (const id of Object.keys(BR.IMPORTED)) if (!['knife', 'bayonet', 'tracker', 'butterfly'].includes(id)) BR.IMPORTED[id].finish = 'factory';

// v1.32 new guns: variants of the sculpts above, each with its own finish colour and procedural parts (models.js BUILD.burst / riot / mpistol)
BR.IMPORTED.burst = Object.assign({}, BR.IMPORTED.holoar, { model: 'holoar', finish: 'factory', factoryColor: 0x6b5d45, fore: [0, -0.07, -0.34] });                       // Talon: FDE tan, angled foregrip, flip magnifier
BR.IMPORTED.riot = Object.assign({}, BR.IMPORTED.shotgun, { model: 'shotgun', finish: 'factory', factoryColor: 0x3d4632, pumpBox: null, port: null });                  // Riot: OD green, drum magazine, no pump
BR.IMPORTED.mpistol = Object.assign({}, BR.IMPORTED.pistol, { model: 'pistol', finish: 'factory', factoryColor: 0x2b2e34, fore: [0, -0.035, -0.12] });                   // Hornet: folding stock + vertical foregrip
