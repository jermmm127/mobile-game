'use strict';
// =============================================================================
// ARENAS (v1.10) — two small purpose-built maps:
//  * generateRange(): the aim-trainer range. A long hall with a dark target wall, lane
//    markings, a shooting line, light strips and side walls you can wall-run.
//  * generateOverdrive(): the Overdrive arena. A ruined round plaza on a plateau: open
//    ground for kiting the swarm, broken pillars, a few raised slabs with ramps, jump pads,
//    and a low rim wall. Big enough to run circles, small enough to stay busy.
// =============================================================================
Object.assign(BR.World.prototype, {
  generateRange() {
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    const D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    const W = 22, F = -34, BK = 16, H = 14, WALL = 0x23262e, DARK = 0x16181d, PUR = 0xa06bff, CY = 0x45e0ff;
    this.pois = [{ x: 0, z: 0, name: 'The Range', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: 0, z: 8, yaw: 0 }];
    // hall: back wall (targets), side walls, rear wall
    B(-W - 2, 0, F - 2, W + 2, H, F, DARK, { tag: 'edge' });
    B(-W - 2, 0, F, -W, H, BK, WALL, { tag: 'edge' }); B(W, 0, F, W + 2, H, BK, WALL, { tag: 'edge' });
    B(-W - 2, 0, BK, W + 2, H, BK + 2, WALL, { tag: 'edge' });
    // target wall: a framed panel with a grid of faint lines
    D(-12, 0.8, F + 0.02, 12, 9.2, F + 0.08, 0x1d2028);
    for (let x = -12; x <= 12; x += 3) D(x - 0.02, 0.8, F + 0.08, x + 0.02, 9.2, F + 0.1, 0x2c303a);
    for (let y = 0.8; y <= 9.2; y += 2.1) D(-12, y - 0.02, F + 0.08, 12, y + 0.02, F + 0.1, 0x2c303a);
    D(-12.3, 9.2, F + 0.02, 12.3, 9.45, F + 0.3, PUR); D(-12.3, 0.55, F + 0.02, 12.3, 0.8, F + 0.3, PUR);
    // floor: lanes + shooting line + distance marks
    D(-W, 0, 4.4, W, 0.02, 4.7, 0xffd24a);
    for (let x = -18; x <= 18; x += 6) D(x - 0.05, 0, F, x + 0.05, 0.015, 4.4, 0x3a3e48);
    for (let z = -6; z > F; z -= 8) D(-W, 0, z - 0.06, W, 0.015, z + 0.06, 0x30343c);
    // light strips along the walls + ceiling beams (decor)
    for (const sx of [-1, 1]) { D(sx * (W - 0.05), 3.0, F, sx * (W - 0.15), 3.15, BK, CY); D(sx * (W - 0.05), 9.0, F, sx * (W - 0.15), 9.15, BK, PUR); }
    for (let z = F + 4; z < BK; z += 8) D(-W, H - 0.6, z - 0.3, W, H - 0.3, z + 0.3, 0x2a2d35);
    // shooting line glow strip
    D(-W, 0.015, 4.45, W, 0.03, 4.65, PUR);
    // cover blocks out on the range (for the strafing dummies)
    for (const [x, z, h] of [[-9, -16, 1.2], [9, -16, 1.2], [0, -22, 1.6], [-14, -26, 2.4], [14, -26, 2.4]]) { B(x - 1, 0, z - 0.6, x + 1, h, z + 0.6, 0x3a3e48); D(x - 1.02, h, z - 0.62, x + 1.02, h + 0.06, z + 0.62, CY); }
    this.groundCols = [0x2a2c33, 0x25272d, 0x2e3038];
  },

  generateOverdrive() {
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    const D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    const R = this.rand, RIM = 74, STONE = 0x6b6478, STONE2 = 0x585266, GLOW = 0xb06bff, CY = 0x45e0ff;
    this.pois = [{ x: 0, z: 0, name: 'The Crucible', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: 0, z: 0, yaw: 0 }];
    // rim: a ring of wall segments (tall, so nothing leaves) with glowing caps
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2, x = Math.cos(a) * RIM, z = Math.sin(a) * RIM, w = RIM * Math.PI * 2 / segs / 2 + 0.6;
      const alongX = Math.abs(Math.sin(a)) > 0.7;
      if (alongX) B(x - w, 0, z - 1.2, x + w, 7, z + 1.2, STONE2, { tag: 'edge' }); else B(x - 1.2, 0, z - w, x + 1.2, 7, z + w, STONE2, { tag: 'edge' });
      D(x - 0.4, 7, z - 0.4, x + 0.4, 7.25, z + 0.4, GLOW);
    }
    B(-RIM - 6, 0, -RIM - 6, RIM + 6, 12, -RIM - 3, STONE2, { tag: 'edge', hidden: true }); B(-RIM - 6, 0, RIM + 3, RIM + 6, 12, RIM + 6, STONE2, { tag: 'edge', hidden: true });
    B(-RIM - 6, 0, -RIM - 3, -RIM - 3, 12, RIM + 3, STONE2, { tag: 'edge', hidden: true }); B(RIM + 3, 0, -RIM - 3, RIM + 6, 12, RIM + 3, STONE2, { tag: 'edge', hidden: true });
    // centre: a sunken-looking plaza ring (decor) and an altar you can stand on
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; D(Math.cos(a) * 9 - 0.25, 0, Math.sin(a) * 9 - 0.25, Math.cos(a) * 9 + 0.25, 0.03, Math.sin(a) * 9 + 0.25, GLOW); }
    B(-1.6, 0, -1.6, 1.6, 0.5, 1.6, STONE); D(-1.2, 0.5, -1.2, 1.2, 0.56, 1.2, CY);
    // broken pillars scattered around (cover to kite round)
    for (let i = 0; i < 22; i++) {
      const a = R() * Math.PI * 2, r = 16 + R() * 50, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.5 + R() * 5, s = 0.7 + R() * 0.6;
      B(x - s, 0, z - s, x + s, h, z + s, R() < 0.5 ? STONE : STONE2);
      D(x - s - 0.05, h - 0.12, z - s - 0.05, x + s + 0.05, h, z + s + 0.05, GLOW);
    }
    // four raised slabs with ramps (stairs) — high ground to fight from
    for (let q = 0; q < 4; q++) {
      const a = q / 4 * Math.PI * 2 + Math.PI / 4, cx = Math.cos(a) * 38, cz = Math.sin(a) * 38;
      B(cx - 5, 0, cz - 5, cx + 5, 2.4, cz + 5, STONE); D(cx - 5.05, 2.4, cz - 5.05, cx + 5.05, 2.48, cz + 5.05, GLOW);
      const dx = -Math.sign(cx), dz = -Math.sign(cz);
      for (let i = 0; i < 6; i++) { const y = (i + 1) * 0.4, off = 5 + (6 - i) * 0.5; B(cx + dx * off - (dx > 0 ? 0 : 0.5), 0, cz - 1.5, cx + dx * off + (dx > 0 ? 0.5 : 0), y, cz + 1.5, STONE2); }
      this.jumpPad(cx + dx * -9, cz + dz * 9);
    }
    this.jumpPad(0, 22); this.jumpPad(0, -22); this.jumpPad(22, 0); this.jumpPad(-22, 0);
    this.groundCols = [0x3a3448, 0x332e40, 0x42394f];
  },
});

// Re-tint the sky dome + hide sun / clouds / distant sprites for the custom modes (night looks).
BR.skyTint = (g, cols, light) => {
  const sc = g.scene, W = g.world, U = BR.util;
  sc.traverse(o => {
    const m = o.material;
    if (m && m.isMeshBasicMaterial && m.fog === false && o !== W.sky) { if (o.isInstancedMesh) m.color.setHex(cols.far || 0x1a1830); else o.visible = false; }
    if (o.isSprite && o.material && o.material.fog === false) o.visible = false;
    if (light && o.isHemisphereLight) { o.color.setHex(light.sky); o.groundColor.setHex(light.ground); o.intensity = light.hemi; }
    if (light && o.isDirectionalLight && o === g.sun) { o.color.setHex(light.sun); o.intensity = light.sunI; }
  });
  if (W.clouds) W.clouds.visible = false;
  if (W.sky) { const ca = W.sky.geometry.attributes.color, pa = W.sky.geometry.attributes.position, v = new THREE.Vector3(), c = new THREE.Color();
    const zen = new THREE.Color(cols.zen), mid = new THREE.Color(cols.mid), hor = new THREE.Color(cols.hor), low = new THREE.Color(cols.low);
    for (let i = 0; i < pa.count; i++) { v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).normalize(); const k = U.clamp(v.y, 0, 1);
      c.copy(hor).lerp(mid, Math.pow(k, 0.45)).lerp(zen, Math.pow(k, 1.3)); if (v.y < 0) c.copy(low); ca.setXYZ(i, c.r, c.g, c.b); }
    ca.needsUpdate = true; W.sky.visible = true; }
};
