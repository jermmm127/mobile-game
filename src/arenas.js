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

// =============================================================================
// v1.15 ARENA MAPS for Duels / TDM / FFA (original layouts; the map is rolled before each match)
//  * generateKillhouse(): "Killhouse" — three lanes. North: a container yard. Middle: an
//    open-top training house (rooms, doorways, windows, a straight corridor through the
//    middle). South: an alley under a raised walkway. Spawns at the west/east ends.
//  * generateCargo(): "Cargo" — a tiny dockside square packed with a 3x3 grid of shipping
//    containers and crates. Non-stop close-range fights.
// Both are mirrored end to end, so the two team spawns are fair. Each lists its own
// FFA respawn spots (world.ffaSpots) for arena.js.
// =============================================================================
Object.assign(BR.World.prototype, {
  // wall along X at z (thickness t) from x0..x1 with openings: [a, b, 'door'|'window']
  arenaWallX(x0, x1, z, h, c, gaps, t) {
    t = t || 0.35; let x = x0;
    const seg = (a, b, y0, y1) => { if (b - a > 0.01) this.addBox(a, y0, z - t / 2, b, y1, z + t / 2, c); };
    for (const [a, b, k] of (gaps || []).slice().sort((p, q) => p[0] - q[0])) {
      seg(x, a, 0, h);
      if (k === 'window') { seg(a, b, 0, 1.05); seg(a, b, 2.2, h); } else seg(a, b, 2.35, h);
      x = b;
    }
    seg(x, x1, 0, h);
  },
  arenaWallZ(z0, z1, x, h, c, gaps, t) {
    t = t || 0.35; let z = z0;
    const seg = (a, b, y0, y1) => { if (b - a > 0.01) this.addBox(x - t / 2, y0, a, x + t / 2, y1, b, c); };
    for (const [a, b, k] of (gaps || []).slice().sort((p, q) => p[0] - q[0])) {
      seg(z, a, 0, h);
      if (k === 'window') { seg(a, b, 0, 1.05); seg(a, b, 2.2, h); } else seg(a, b, 2.35, h);
      z = b;
    }
    seg(z, z1, 0, h);
  },
  arenaContainer(x, z, along, stack, col) {
    const L = 6.2, W = 2.5, H = 2.6, P = [0x8a5a3c, 0x45607a, 0x763a35, 0x4d6650, 0x8c784a];
    for (let k = 0; k < (stack || 1); k++) {
      const c = col !== undefined ? col : P[(Math.abs(Math.round(x * 7 + z * 3)) + k) % P.length], y = k * H, inset = k * 0.4;
      const b = along ? this.addBox(x - L / 2 + inset, y, z - W / 2, x + L / 2 - inset, y + H, z + W / 2, c) : this.addBox(x - W / 2, y, z - L / 2 + inset, x + W / 2, y + H, z + L / 2 - inset, c);
      this.containers.push(b);
    }
  },
  arenaCrate(x, z, h) { this.addBox(x - 0.65, 0, z - 0.65, x + 0.65, h || 1.2, z + 0.65, 0xa77b4f); },
  arenaShell(X, Z, WH, CON, CON2) {
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    B(-X - 3, 0, -Z - 3, X + 3, WH, -Z, CON, { tag: 'edge' }); B(-X - 3, 0, Z, X + 3, WH, Z + 3, CON, { tag: 'edge' });
    B(-X - 3, 0, -Z, -X, WH, Z, CON, { tag: 'edge' }); B(X, 0, -Z, X + 3, WH, Z, CON, { tag: 'edge' });
    for (const z of [-Z, Z]) this.addBox(-X, WH, z - 0.2, X, WH + 0.25, z + 0.2, CON2, { decor: true });
    for (const x of [-X, X]) this.addBox(x - 0.2, WH, -Z, x + 0.2, WH + 0.25, Z, CON2, { decor: true });
  },

  generateKillhouse() {
    const X = 34, Z = 22, WH = 8, HH = 3.4;
    const CON = 0x77736c, CON2 = 0x625f59, PLA = 0xbdb3a0, TRIM = 0x8f8676, BLUE = 0x2f6fd8, RED = 0xd8443a, STEEL = 0x4a5160, Y = 0xf2b234;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Killhouse', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -29, z: 0, yaw: -Math.PI / 2 }, { x: 29, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    // ---- the house (open top): outer shell 20 x 14 m with doors + windows on every side
    this.arenaWallX(-10, 10, 7, HH, PLA, [[-7.2, -5.8, 'door'], [-1.5, 1.5, 'window'], [5.8, 7.2, 'door']]);
    this.arenaWallX(-10, 10, -7, HH, PLA, [[-7.2, -5.8, 'door'], [-1.5, 1.5, 'window'], [5.8, 7.2, 'door']]);
    for (const sx of [-1, 1]) {
      this.arenaWallZ(-7, 7, sx * 10, HH, PLA, [[-5.4, -3.6, 'window'], [-1, 1, 'door'], [3.6, 5.4, 'window']]);
      // inner rooms: a wall across each half (door in it) + the split walls by the centre corridor
      this.arenaWallX(Math.min(sx * 10, sx * 4.2), Math.max(sx * 10, sx * 4.2), 3, HH, PLA, [[sx > 0 ? 6.4 : -7.8, sx > 0 ? 7.8 : -6.4, 'door']]);
      this.arenaWallX(Math.min(sx * 10, sx * 4.2), Math.max(sx * 10, sx * 4.2), -3, HH, PLA, [[sx > 0 ? 6.4 : -7.8, sx > 0 ? 7.8 : -6.4, 'door']]);
      this.arenaWallZ(3, 7, sx * 4.2, HH, PLA, [[4.3, 5.7, 'door']]);
      this.arenaWallZ(-7, -3, sx * 4.2, HH, PLA, [[-5.7, -4.3, 'door']]);
      // cover inside the rooms
      this.arenaCrate(sx * 7, 5.2, 1.2); this.arenaCrate(sx * 7.2, -5.2, 1.2);
      B(sx * 1.6 - 0.9, 0, -0.35, sx * 1.6 + 0.9, 1.1, 0.35, TRIM);              // low table across the corridor
      // ---- spawn ends: a low wall + two pillars
      B(sx * 25.5 - 0.35, 0, -3, sx * 25.5 + 0.35, 1.25, 3, CON2); Dc(sx * 25.5 - 0.4, 1.25, -3.05, sx * 25.5 + 0.4, 1.32, 3.05, sx < 0 ? BLUE : RED);
      for (const zz of [-8, 8]) { B(sx * 22 - 0.8, 0, zz - 0.8, sx * 22 + 0.8, 5, zz + 0.8, CON2); Dc(sx * 22 - 0.82, 4.8, zz - 0.82, sx * 22 + 0.82, 5, zz + 0.82, sx < 0 ? BLUE : RED); }
      for (const [a, b, c, d] of [[27, 33, -3.4, -3.1], [27, 33, 3.1, 3.4], [27, 27.3, -3.4, 3.4]]) Dc(sx * a, 0, c, sx * b, 0.015, d, sx < 0 ? BLUE : RED);
      Dc(sx * (X - 0.02), 1.0, -Z, sx * (X - 0.12), 2.2, Z, sx < 0 ? BLUE : RED);
      // ---- lane dividers (3 m) with a gap to rotate through
      for (const sz of [-1, 1]) { B(sx * 24, 0, sz * 9.5 - 0.3, sx * 19.6, 3, sz * 9.5 + 0.3, CON2); B(sx * 17.4, 0, sz * 9.5 - 0.3, sx * 12.5, 3, sz * 9.5 + 0.3, CON2); Dc(sx * 24, 3, sz * 9.5 - 0.32, sx * 12.5, 3.08, sz * 9.5 + 0.32, Y); }
      // ---- north lane: container yard
      this.arenaContainer(sx * 16, 16, true, 1); this.arenaContainer(sx * 6.5, 13.6, false, 1);
      this.arenaCrate(sx * 11.5, 12.2, 2.4); this.arenaCrate(sx * 10.2, 12.2, 1.2); this.arenaCrate(sx * 25, 17, 1.2);
      // ---- south lane: walkway stairs at both ends + cover in the alley
      for (let i = 0; i < 5; i++) { const x0 = sx * (13 + i * 0.9); B(Math.min(x0, x0 + sx * 0.9), 0, -Z, Math.max(x0, x0 + sx * 0.9), 2.2 - i * 0.44, -18.6, CON2); }
      B(sx * 8.5 - 1.6, 0, -13.6, sx * 8.5 + 1.6, 1.1, -13.0, TRIM); this.arenaCrate(sx * 19, -15.5, 1.2); this.arenaCrate(sx * 19, -14.2, 2.4);
    }
    this.arenaContainer(0, 18.4, true, 2);                                        // a double stack up north
    B(-2, 0, 12.1, 2, 1.15, 12.6, TRIM);
    B(-13, 2.0, -Z, 13, 2.2, -18.6, STEEL); Dc(-13, 3.1, -18.65, 13, 3.16, -18.55, Y);   // raised walkway (south wall)
    for (let x = -12; x <= 12; x += 4) B(x - 0.15, 0, -18.9, x + 0.15, 2.0, -18.6, STEEL);
    this.arenaCrate(-1.2, -14, 2.4); this.arenaCrate(1.2, -14, 1.2);
    // floor paint + house trim
    Dc(-0.12, 0, -Z, 0.12, 0.015, -7, 0xe8e4dc); Dc(-0.12, 0, 7, 0.12, 0.015, Z, 0xe8e4dc);
    Dc(-10.2, HH, -7.2, 10.2, HH + 0.08, -6.8, TRIM); Dc(-10.2, HH, 6.8, 10.2, HH + 0.08, 7.2, TRIM);
    this.ffaSpots = [[-29, 0], [29, 0], [-29, 15], [29, -15], [-29, -15], [29, 15], [-7, 5], [7, -5], [-7, -5], [7, 5], [-16, -14], [16, 14], [0, 14.5], [0, -16.5], [-16, 12.4], [16, -12.4]];
    this.groundCols = [0x7d7b75, 0x75736d, 0x8a857a];
  },

  generateCargo() {
    const X = 21, Z = 21, WH = 7;
    const CON = 0x5d6670, CON2 = 0x4b535c, BLUE = 0x2f6fd8, RED = 0xd8443a, Y = 0xf2b234;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Cargo', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -17.5, z: 0, yaw: -Math.PI / 2 }, { x: 17.5, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    this.arenaContainer(0, 0, false, 2);                                           // centre: double stack
    for (const sx of [-1, 1]) {
      const tc = sx < 0 ? BLUE : RED;
      this.arenaContainer(sx * 9, 0, true, 1);
      this.arenaContainer(sx * 9, sx * -9.5, false, 1); this.arenaContainer(sx * 9, sx * 9.5, false, sx > 0 ? 2 : 1);
      this.arenaContainer(sx * 0.5, sx * 10.5, true, 1);
      this.arenaCrate(sx * 4.6, sx * 4.6, 1.2); this.arenaCrate(sx * 4.6, sx * -4.8, 2.4);
      this.arenaCrate(sx * 15.5, sx * 12.5, 1.2); this.arenaCrate(sx * 15.5, sx * -12.5, 2.4); this.arenaCrate(sx * 14.2, sx * -12.5, 1.2);
      B(sx * 14.6 - 0.3, 0, -2.2, sx * 14.6 + 0.3, 1.2, 2.2, CON2); Dc(sx * 14.6 - 0.35, 1.2, -2.25, sx * 14.6 + 0.35, 1.27, 2.25, tc);
      for (const [a, b, c, d] of [[16, 20.6, -3, -2.7], [16, 20.6, 2.7, 3], [16, 16.3, -3, 3]]) Dc(sx * a, 0, c, sx * b, 0.015, d, tc);
      Dc(sx * (X - 0.02), 1.0, -Z, sx * (X - 0.12), 2.2, Z, tc);
      // dock bollards + hazard stripes along the walls
      for (const zz of [-17, 17]) { B(sx * 18 - 0.3, 0, zz - 0.3, sx * 18 + 0.3, 0.8, zz + 0.3, 0x2a2d33); }
    }
    for (let x = -X; x < X; x += 1.6) for (const z of [-Z, Z]) Dc(x, 0, z - (z > 0 ? 0.6 : -0.3), x + 0.8, 0.015, z - (z > 0 ? 0.3 : -0.6), Y);
    this.ffaSpots = [[-17.5, 0], [17.5, 0], [-17.5, -16], [17.5, 16], [-17.5, 16], [17.5, -16], [0, -16.5], [0, 16.5], [-4.5, 0], [4.5, 0], [-9, -4.5], [9, 4.5], [-4, 15], [4, -15]];
    this.groundCols = [0x6d6e6c, 0x626361, 0x77756f];
  },
});
