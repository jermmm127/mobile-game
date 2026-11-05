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
};
