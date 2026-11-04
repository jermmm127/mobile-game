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
