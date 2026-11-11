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
  // v1.40: fill a map's big open stretches with cover, mirrored east/west so both sides stay fair. Each piece is only
  // placed where nothing stands within 1.6 m and no spawn / respawn spot is within 4 m. kind: 'c' crate, 'C' tall crate,
  // 'b' concrete barrier (along z), 'B' barrier (along x), 'k' container (along z), 'K' container (along x).
  arenaCover(list) {
    const spots = (this.ffaSpots || []).concat((this.spawns || []).map(q => [q.x, q.z]));
    const clear = (x0, z0, x1, z1) => {
      for (const q of this.boxes) { if (q.tag === 'edge' || q.decor || q.y0 > 2.4) continue; if (q.x1 > x0 - 1.6 && q.x0 < x1 + 1.6 && q.z1 > z0 - 1.6 && q.z0 < z1 + 1.6) return false; }
      for (const [sx, sz] of spots) if (sx > x0 - 4 && sx < x1 + 4 && sz > z0 - 4 && sz < z1 + 4) return false;
      const P = this.playBounds; return !P || (x0 > P.x0 + 1.5 && x1 < P.x1 - 1.5 && z0 > P.z0 + 1.5 && z1 < P.z1 - 1.5);
    };
    let n = 0;
    for (const [kind, x, z] of list) for (const sx of x === 0 ? [1] : [-1, 1]) {
      const px = sx * x;
      const [hw, hd] = kind === 'b' ? [0.35, 2.2] : kind === 'B' ? [2.2, 0.35] : kind === 'k' ? [1.25, 3.1] : kind === 'K' ? [3.1, 1.25] : [0.65, 0.65];
      if (!clear(px - hw, z - hd, px + hw, z + hd)) continue;
      if (kind === 'c' || kind === 'C') this.arenaCrate(px, z, kind === 'C' ? 2.4 : 1.2);
      else if (kind === 'b' || kind === 'B') { this.addBox(px - hw, 0, z - hd, px + hw, 1.2, z + hd, 0x8a8d90); this.addBox(px - hw - 0.04, 1.2, z - hd - 0.04, px + hw + 0.04, 1.27, z + hd + 0.04, 0xf2b234, { decor: true }); }
      else this.arenaContainer(px, z, kind === 'K', 1);
      n++;
    }
    return n;
  },
  arenaShell(X, Z, WH, CON, CON2) {
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    this.playBounds = { x0: -X, x1: X, z0: -Z, z1: Z, y1: WH + 14 };       // v1.28.2: the hard play area (inside the walls)
    B(-X - 3, 0, -Z - 3, X + 3, WH, -Z, CON, { tag: 'edge' }); B(-X - 3, 0, Z, X + 3, WH, Z + 3, CON, { tag: 'edge' });
    B(-X - 3, 0, -Z, -X, WH, Z, CON, { tag: 'edge' }); B(X, 0, -Z, X + 3, WH, Z, CON, { tag: 'edge' });
    for (const z of [-Z, Z]) this.addBox(-X, WH, z - 0.2, X, WH + 0.25, z + 0.2, CON2, { decor: true });
    for (const x of [-X, X]) this.addBox(x - 0.2, WH, -Z, x + 0.2, WH + 0.25, Z, CON2, { decor: true });
  },

  generateKillhouse() {
    const X = 34, Z = 22, WH = 8, HH = 3.4;
    const CON = 0x8a7f6e, CON2 = 0x6e6556, PLA = 0xcbbca2, TRIM = 0x8f7f68, BLUE = 0x2f6fd8, RED = 0xd8443a, STEEL = 0x4a5160, Y = 0xf2b234;      // v1.21: warmer concrete
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
    this.groundCols = [0x8a8174, 0x7d7569, 0x968c7c];
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

  // ---- v1.35 three more original TDM / FFA maps (three-lane layouts in the spirit of classic arena shooters, mirrored end to end)
  // a walk-in house with a flat roof you can stand on (stairs up the outside), doors + windows on the long sides
  arenaHouse(cx, cz, w, d, h, col, roofCol, doorSide, stairSide) {
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.arenaWallX(x0, x1, z0, h, col, [[cx - 0.8, cx + 0.8, doorSide !== 1 ? 'door' : 'window'], [x0 + 1, x0 + 2.2, 'window']]);
    this.arenaWallX(x0, x1, z1, h, col, [[cx - 0.8, cx + 0.8, doorSide !== -1 ? 'door' : 'window'], [x1 - 2.2, x1 - 1, 'window']]);
    this.arenaWallZ(z0, z1, x0, h, col, [[cz - 0.9, cz + 0.9, 'window']]); this.arenaWallZ(z0, z1, x1, h, col, [[cz - 0.9, cz + 0.9, 'window']]);
    B(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.25, z1 + 0.2, roofCol);                                                   // flat roof
    for (const [a, b, c, e] of [[x0 - 0.2, x1 + 0.2, z0 - 0.2, z0 + 0.05], [x0 - 0.2, x1 + 0.2, z1 - 0.05, z1 + 0.2]]) B(a, h + 0.25, c, b, h + 0.95, e, roofCol);   // parapet
    if (stairSide) { const sx = stairSide > 0 ? x1 : x0; for (let i = 0; i < 7; i++) { const y = (i + 1) * (h + 0.25) / 7, zz = z0 + 0.6 + i * 0.75; B(sx + stairSide * 0.2, 0, zz, sx + stairSide * 1.4, y, zz + 0.75, roofCol); } }
  },
  generateCrossroads() {
    const X = 40, Z = 28, WH = 8, HH = 3.6;
    const CON = 0xb89c74, CON2 = 0x9c8260, MUD = [0xd4b48a, 0xc9a77a, 0xdcbf96], ROOF = 0xa88a62, CLOTH = [0xb8463c, 0x3f6fae, 0xd19a3c], BLUE = 0x2f6fd8, RED = 0xd8443a, STONE = 0x9a8e7a;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => B(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Crossroads', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -35, z: 0, yaw: -Math.PI / 2 }, { x: 35, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    // middle lane: the market street (stalls with cloth awnings) and a stone well in the centre square
    B(-1.6, 0, -1.6, 1.6, 1.0, 1.6, STONE); Dc(-1.3, 1.0, -1.3, 1.3, 1.05, 1.3, 0x2f5a7a); for (const s of [-1, 1]) Dc(s * 1.4 - 0.1, 1.0, -0.1, s * 1.4 + 0.1, 2.6, 0.1, 0x6a5a44); Dc(-1.5, 2.6, -0.12, 1.5, 2.75, 0.12, 0x6a5a44);
    for (const sx of [-1, 1]) {
      const tc = sx < 0 ? BLUE : RED;
      for (let i = 0; i < 3; i++) { const x = sx * (8 + i * 5.5), z = (i % 2 ? 1 : -1) * 5.2; B(x - 1.4, 0, z - 0.6, x + 1.4, 1.05, z + 0.6, 0x8a6a48); Dc(x - 1.6, 2.4, z - 1.4, x + 1.6, 2.5, z + 1.4, CLOTH[(i + (sx > 0 ? 1 : 0)) % 3]);
        for (const [a, b] of [[-1.5, -1.3], [1.5, -1.3], [-1.5, 1.3], [1.5, 1.3]]) Dc(x + a - 0.05, 0, z + b - 0.05, x + a + 0.05, 2.4, z + b + 0.05, 0x6a5a44); }
      // north lane: two houses with roofs you can run along (stairs on the outside) and a bridge plank between them
      this.arenaHouse(sx * 12, 18, 10, 8, HH, MUD[0], ROOF, -1, sx);
      this.arenaHouse(sx * 26, 19, 8, 7, HH, MUD[1], ROOF, -1, 0);
      B(sx * 17, HH, 17.2, sx * 22, HH + 0.25, 18.8, 0x7a5a3a);
      // south lane: an alley between garden walls, archway gaps, a donkey cart
      B(sx * 6, 0, -12.5, sx * 20, 2.2, -12.0, CON2); B(sx * 24, 0, -12.5, sx * 34, 2.2, -12.0, CON2);
      for (const z of [-17, -22]) { this.arenaCrate(sx * (10 + (z === -17 ? 0 : 6)), z, 1.2); }
      B(sx * 28 - 1.3, 0, -20.5, sx * 28 + 1.3, 1.3, -19.3, 0x7a5a3a); Dc(sx * 28 - 1.5, 0, -21, sx * 28 - 1.2, 0.9, -18.8, 0x3a2a1a);
      this.arenaHouse(sx * 15, -23, 9, 6, HH, MUD[2], ROOF, 1, 0);
      // spawn ends
      B(sx * 30 - 0.35, 0, -3, sx * 30 + 0.35, 1.25, 3, CON2); Dc(sx * 30 - 0.4, 1.25, -3.05, sx * 30 + 0.4, 1.32, 3.05, tc);
      Dc(sx * (X - 0.02), 1.0, -Z, sx * (X - 0.12), 2.2, Z, tc);
      for (const sz of [-1, 1]) { B(sx * 31, 0, sz * 9 - 0.3, sx * 24, 3, sz * 9 + 0.3, CON2); }
    }
    this.ffaSpots = [[-35, 0], [35, 0], [-35, 18], [35, -18], [-35, -18], [35, 18], [0, 8], [0, -8], [-12, 18], [12, 18], [-15, -23], [15, -23], [-20, -16], [20, -16], [-22, 6], [22, -6]];
    this.groundCols = [0xc8ad82, 0xbda274, 0xd2b88e];
  },
  generateFrostbite() {
    const X = 40, Z = 28, WH = 8, HH = 3.4;
    const CON = 0x9aa6b0, CON2 = 0x7e8a94, LAB = 0xdfe4e8, TRIM = 0x3a4652, ORANGE = 0xd9622a, STEEL = 0x55606c, BLUE = 0x2f6fd8, RED = 0xd8443a, ICE = 0xbfe2f2;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => B(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Frostbite', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -35, z: 0, yaw: -Math.PI / 2 }, { x: 35, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    // centre: a two-storey lab (doors on all sides, a mezzanine inside, stairs up, a roof catwalk with a railing)
    this.arenaWallX(-9, 9, -6, HH * 2, LAB, [[-1, 1, 'door'], [-6, -4.5, 'window'], [4.5, 6, 'window']]);
    this.arenaWallX(-9, 9, 6, HH * 2, LAB, [[-1, 1, 'door'], [-6, -4.5, 'window'], [4.5, 6, 'window']]);
    this.arenaWallZ(-6, 6, -9, HH * 2, LAB, [[-1, 1, 'door']]); this.arenaWallZ(-6, 6, 9, HH * 2, LAB, [[-1, 1, 'door']]);
    B(-9, HH, -6, -2, HH + 0.25, 6, STEEL); B(2, HH, -6, 9, HH + 0.25, 6, STEEL);                                               // mezzanines either side of an open middle
    for (let i = 0; i < 8; i++) { const y = (i + 1) * HH / 8; B(-1.4 + i * 0.4 - 0.2, 0, -5.6, -1.4 + i * 0.4 + 0.2, y, -4.2, STEEL); }
    B(-9.3, HH * 2, -6.3, 9.3, HH * 2 + 0.25, 6.3, TRIM); for (const z of [-6.3, 6.3]) Dc(-9.3, HH * 2 + 0.25, z - 0.05, 9.3, HH * 2 + 1.1, z + 0.05, ORANGE);
    for (let i = 0; i < 10; i++) { const y = (i + 1) * (HH * 2 + 0.25) / 10; B(9.4, 0, -5.8 + i * 1.0, 10.6, y, -4.8 + i * 1.0, STEEL); }                // outside stairs to the roof
    Dc(-0.2, HH * 2 + 0.25, -0.2, 0.2, HH * 2 + 4.5, 0.2, STEEL); Dc(-1.6, HH * 2 + 4.3, -0.1, 1.6, HH * 2 + 4.6, 0.1, 0xe8e8e8);                            // radar mast
    for (const sx of [-1, 1]) {
      const tc = sx < 0 ? BLUE : RED;
      // sheds north + south, fuel drums, ice blocks, a snowcat
      for (const sz of [-1, 1]) { const x = sx * 20, z = sz * 17; this.arenaWallX(x - 5, x + 5, z - sz * 3, HH, LAB, [[x - 1, x + 1, 'door']]); this.arenaWallX(x - 5, x + 5, z + sz * 3, HH, LAB, []);
        this.arenaWallZ(Math.min(z - 3, z + 3), Math.max(z - 3, z + 3), x - 5, HH, LAB, [[z - 0.9, z + 0.9, 'window']]); this.arenaWallZ(Math.min(z - 3, z + 3), Math.max(z - 3, z + 3), x + 5, HH, LAB, [[z - 0.9, z + 0.9, 'window']]);
        B(x - 5.3, HH, z - 3.3, x + 5.3, HH + 0.25, z + 3.3, ORANGE); }
      for (let i = 0; i < 3; i++) B(sx * 12 - 0.4 + i * 0.85 * sx, 0, 11 - 0.4, sx * 12 + 0.4 + i * 0.85 * sx, 1.0, 11 + 0.4, ORANGE);
      B(sx * 13 - 1.2, 0, -11.5, sx * 13 + 1.2, 1.4, -10.3, ICE); B(sx * 27 - 1, 0, 4, sx * 27 + 1, 1.2, 5.6, ICE);
      B(sx * 28 - 1.4, 0.4, -9, sx * 28 + 1.4, 2.0, -5.2, ORANGE); Dc(sx * 28 - 1.5, 0, -9.2, sx * 28 + 1.5, 0.45, -5, 0x2a2d33);
      this.arenaCrate(sx * 15, 0, 1.2); this.arenaCrate(sx * 15, 1.4, 2.4);
      B(sx * 30 - 0.35, 0, -3, sx * 30 + 0.35, 1.25, 3, CON2); Dc(sx * 30 - 0.4, 1.25, -3.05, sx * 30 + 0.4, 1.32, 3.05, tc);
      Dc(sx * (X - 0.02), 1.0, -Z, sx * (X - 0.12), 2.2, Z, tc);
    }
    this.ffaSpots = [[-35, 0], [35, 0], [-35, 18], [35, -18], [-35, -18], [35, 18], [-5, 0], [5, 0], [-20, 17], [20, -17], [-20, -17], [20, 17], [-13, 6], [13, -6], [0, -20], [0, 20]];
    this.arenaCover([['b', 20, 0], ['c', 24, -9], ['C', 24, 9], ['B', 10, -17], ['B', 10, 17], ['c', 0, -19], ['c', 0, 19], ['c', 26, 3.5]]);      // v1.40: cover round the frozen yard
    this.groundCols = [0xe8eef2, 0xd9e2e8, 0xf2f6f8];
  },
  generateHarbor() {
    const X = 40, Z = 28, WH = 7, HH = 4.2;
    const CON = 0x6a7078, CON2 = 0x565c64, WARE = 0x8a8f86, ROOF = 0x4a5058, WOOD = 0x7a5a3a, BLUE = 0x2f6fd8, RED = 0xd8443a, Y = 0xf2b234, WATER = 0x2f6a8a;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => B(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Harbor', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -35, z: 0, yaw: -Math.PI / 2 }, { x: 35, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    // centre: a warehouse you can run straight through (big doors both ends), side doors, crates + a forklift inside
    this.arenaWallX(-11, 11, -7, HH, WARE, [[-2, 2, 'door'], [-8, -6.5, 'window'], [6.5, 8, 'window']]);
    this.arenaWallX(-11, 11, 7, HH, WARE, [[-8, -6.5, 'window'], [6.5, 8, 'window']]);
    this.arenaWallZ(-7, 7, -11, HH, WARE, [[-2.2, 2.2, 'door']]); this.arenaWallZ(-7, 7, 11, HH, WARE, [[-2.2, 2.2, 'door']]);
    B(-11.3, HH, -7.3, 11.3, HH + 0.3, 7.3, ROOF); for (let x = -9; x <= 9; x += 4.5) Dc(x - 0.1, HH - 0.5, -7, x + 0.1, HH, 7, 0x3a3d42);
    for (const [x, z, h] of [[-6, 3, 1.2], [-6, 4.4, 2.4], [5, -3, 1.2], [6.4, -3, 1.2], [0, 4, 2.4]]) this.arenaCrate(x, z, h);
    B(-1.2, 0.3, -4, 1.2, 1.4, -1.6, Y);
    // north: container stacks + a gantry crane over them; south: the pier with bollards, a fishing boat, water beyond
    for (const sx of [-1, 1]) {
      const tc = sx < 0 ? BLUE : RED;
      this.arenaContainer(sx * 9, 16, true, 2); this.arenaContainer(sx * 20, 18, false, 1); this.arenaContainer(sx * 27, 14, true, 1);
      for (const z of [12, 22]) { B(sx * 15 - 0.4, 0, z - 0.4, sx * 15 + 0.4, 9, z + 0.4, Y); }
      Dc(sx * 15 - 0.5, 9, 11.5, sx * 15 + 0.5, 9.6, 22.5, Y);
      this.arenaCrate(sx * 4, 12, 1.2); this.arenaCrate(sx * 24, 9, 2.4);
      for (let x = 6; x <= 34; x += 7) B(sx * x - 0.3, 0, -20.5, sx * x + 0.3, 0.8, -19.9, 0x2a2d33);
      B(sx * 18 - 4, 0, -24, sx * 18 + 4, 1.4, -21.6, 0xe8e2d4); B(sx * 18 - 1.5, 1.4, -23.5, sx * 18 + 1.5, 3.2, -22, 0x2f6a8a); Dc(sx * 18 - 4.1, 0.9, -24.05, sx * 18 + 4.1, 1.05, -21.55, 0xd8443a);
      this.arenaCrate(sx * 8, -15, 1.2); this.arenaCrate(sx * 26, -15, 1.2); this.arenaCrate(sx * 26, -13.7, 2.4);
      B(sx * 30 - 0.35, 0, -3, sx * 30 + 0.35, 1.25, 3, CON2); Dc(sx * 30 - 0.4, 1.25, -3.05, sx * 30 + 0.4, 1.32, 3.05, tc);
      Dc(sx * (X - 0.02), 1.0, -Z, sx * (X - 0.12), 2.2, Z, tc);
    }
    Dc(-X, 0.01, -Z, X, 0.02, -24.6, WATER); Dc(-X, 0.02, -24.6, X, 0.03, -24.4, 0xdff2ff);                                                         // water along the pier
    for (let x = -X; x < X; x += 1.6) Dc(x, 0.015, -20.2, x + 0.8, 0.02, -19.9, Y);
    this.ffaSpots = [[-35, 0], [35, 0], [-35, 18], [35, -18], [-35, -18], [35, 18], [-6, 0], [6, 0], [0, 12], [0, -15], [-20, 10], [20, -10], [-24, -16], [24, 16], [-13, -9], [13, 9]];
    this.arenaCover([['k', 20, -1.5], ['c', 17, 6], ['C', 23, -7.5], ['B', 16, -13], ['c', 31, 10], ['b', 6, -12]]);      // v1.40: cover on the open lanes between the spawns and the warehouse
    this.groundCols = [0x6d6e6c, 0x626361, 0x77756f];
  },

  // v1.21 "District": a big original town block made for Free For All (about 2.5x the Killhouse floor).
  // A plaza with a raised fountain in the middle, four walk-in houses (doors + windows you can vault
  // through), a covered market row, container alleys round the edge and a raised footbridge across the
  // north street with stairs at both ends. 24 respawn spots spread over the whole map.
  generateDistrict() {
    const X = 52, Z = 40, WH = 9, HH = 3.4;
    const CON = 0x7b7468, CON2 = 0x655f55, PLA = [0xd9c9ad, 0xc9b79a, 0xd6bfa4, 0xbfb7a6], TRIM = 0x8a7a64, ROOF = 0x7a4a3a, STONE = 0x9a948a, STEEL = 0x4a5160, Y = 0xf2b234, GREEN = 0x5b7a3a, AWN = [0xb8463c, 0x3f6fae, 0xd19a3c, 0x4f8a5a];
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => B(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'District', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -46, z: 0, yaw: -Math.PI / 2 }, { x: 46, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    // plaza: raised fountain, low planters, benches
    B(-3.2, 0, -3.2, 3.2, 0.8, 3.2, STONE); B(-1.2, 0.8, -1.2, 1.2, 2.2, 1.2, STONE); Dc(-2.7, 0.8, -2.7, 2.7, 0.86, 2.7, 0x4f8fb8);
    for (const [px, pz] of [[-8, -8], [8, 8], [-8, 8], [8, -8]]) { B(px - 1.6, 0, pz - 0.6, px + 1.6, 0.9, pz + 0.6, STONE); Dc(px - 1.5, 0.9, pz - 0.5, px + 1.5, 1.2, pz + 0.5, GREEN); }
    for (const sx of [-1, 1]) B(sx * 6 - 0.3, 0, -1.4, sx * 6 + 0.3, 0.55, 1.4, TRIM);
    // four houses (one per quarter), each 13 x 10 with an inner wall; doors + windows on every side
    const house = (cx, cz, c, flip) => {
      const w = 6.5, d = 5;
      this.arenaWallX(cx - w, cx + w, cz - d, HH, c, [[cx - 4, cx - 2.6, 'window'], [cx + 0.2, cx + 1.6, 'door'], [cx + 3.4, cx + 5, 'window']]);
      this.arenaWallX(cx - w, cx + w, cz + d, HH, c, [[cx - 5, cx - 3.4, 'window'], [cx - 1.6, cx - 0.2, 'door'], [cx + 2.6, cx + 4, 'window']]);
      this.arenaWallZ(cz - d, cz + d, cx - w, HH, c, [[cz - 3.6, cz - 2, 'window'], [cz + 1, cz + 2.4, flip ? 'door' : 'window']]);
      this.arenaWallZ(cz - d, cz + d, cx + w, HH, c, [[cz - 2.4, cz - 1, flip ? 'window' : 'door'], [cz + 2, cz + 3.6, 'window']]);
      this.arenaWallZ(cz - d, cz + d, cx + (flip ? 1.5 : -1.5), HH, c, [[cz - 1.2, cz + 0.4, 'door']]);
      Dc(cx - w - 0.15, HH, cz - d - 0.15, cx + w + 0.15, HH + 0.1, cz - d + 0.15, TRIM); Dc(cx - w - 0.15, HH, cz + d - 0.15, cx + w + 0.15, HH + 0.1, cz + d + 0.15, TRIM);
      Dc(cx - w - 0.15, HH, cz - d, cx - w + 0.15, HH + 0.1, cz + d, TRIM); Dc(cx + w - 0.15, HH, cz - d, cx + w + 0.15, HH + 0.1, cz + d, TRIM);
      this.arenaCrate(cx + (flip ? -3.5 : 3.5), cz + 2.6, 1.2); B(cx + (flip ? 3.8 : -3.8) - 1, 0, cz - 2.8, cx + (flip ? 3.8 : -3.8) + 1, 0.9, cz - 2.2, TRIM);
    };
    house(-24, -17, PLA[0], false); house(24, 17, PLA[1], true); house(-24, 17, PLA[2], true); house(24, -17, PLA[3], false);
    // covered market row (east-west, south of the plaza): stalls with awnings you can shoot under
    for (let i = 0; i < 4; i++) { const x = -13.5 + i * 9, c = AWN[i];
      B(x - 2.6, 0, -16.2, x + 2.6, 1.0, -15.4, TRIM); for (const px of [-2.4, 2.4]) B(x + px - 0.12, 0, -16.4, x + px + 0.12, 2.6, -16.2, STEEL);
      Dc(x - 2.8, 2.6, -17.6, x + 2.8, 2.72, -15.2, c); }
    // north street: a raised footbridge with stairs at both ends + cover under it
    B(-14, 3.0, 26.5, 14, 3.25, 29.5, STEEL); for (let x = -12; x <= 12; x += 6) for (const z of [26.6, 29.4]) B(x - 0.15, 0, z - 0.15, x + 0.15, 3.0, z + 0.15, STEEL);
    Dc(-14, 4.2, 26.45, 14, 4.28, 26.55, Y); Dc(-14, 4.2, 29.45, 14, 4.28, 29.55, Y);
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const x0 = sx * (14 + i * 0.85); B(x0, 0, 26.5, x0 + sx * 0.85, 3.0 - i * 0.5, 29.5, CON2); }
    this.arenaCrate(-4, 28, 1.2); this.arenaCrate(5, 27.6, 2.4); this.arenaCrate(6.3, 27.6, 1.2);
    // container alleys along the east + west walls and the south edge
    for (const sx of [-1, 1]) {
      this.arenaContainer(sx * 44, -26, false, 1); this.arenaContainer(sx * 44, 26, false, 2); this.arenaContainer(sx * 39, 4, true, 1);
      this.arenaContainer(sx * 36, -33, true, 1); this.arenaCrate(sx * 40, -6, 1.2); this.arenaCrate(sx * 41.4, -6, 2.4); this.arenaCrate(sx * 33, 31, 1.2);
      B(sx * 13 - 0.35, 0, -4, sx * 13 + 0.35, 1.2, 4, CON2);                                       // low walls flanking the plaza
      B(sx * 34 - 2, 0, -0.35, sx * 34 + 2, 1.2, 0.35, CON2);
    }
    this.arenaContainer(0, -33, true, 1); this.arenaContainer(0, 34, true, 1);
    // street paint: lane lines + crossings
    for (let x = -X + 2; x < X - 2; x += 4) for (const z of [-24.5, 24.5]) Dc(x, 0, z - 0.1, x + 2, 0.015, z + 0.1, 0xe8e4dc);
    for (let i = 0; i < 6; i++) Dc(-1.6 + i * 0.6, 0, 9, -1.3 + i * 0.6, 0.015, 12, 0xe8e4dc);
    this.ffaSpots = [[-46, 0], [46, 0], [-46, -32], [46, 32], [-46, 32], [46, -32], [0, -36], [0, 36], [-24, -17], [24, 17], [-24, 17], [24, -17],
      [-12, 0], [12, 0], [0, -10], [0, 10], [-34, -12], [34, 12], [-34, 14], [34, -14], [-14, 24], [14, -24], [-14, -24], [14, 24]];
    // v1.40: cover across the long open streets and corners (placed only where there is room)
    this.arenaCover([['K', 38, -8], ['K', 38, 8], ['b', 30, -26], ['b', 30, 26], ['C', 42, -18], ['C', 42, 18], ['c', 36, 0], ['B', 12, -30], ['B', 12, 30], ['c', 8, -14], ['c', 8, 14], ['b', 18, 0], ['c', 44, -8], ['c', 44, 9.3], ['B', 26, -34], ['B', 26, 34], ['k', 0, -27], ['c', 20, -30], ['c', 20, 30]]);
    this.groundCols = [0x7f7a70, 0x77736a, 0x8a8478];
  },
});

// =============================================================================
// v1.23 two more original arena maps
//  * generateSuburb(): "Cul-de-Sac" — two two-storey houses face each other across a dead-end street with a
//    round island at the end. Front yards with low fences, back gardens, side alleys, a garage on each house,
//    parked cars and a box truck in the street for cover. Upstairs bedrooms look down the street through windows.
//    Mirrored end to end (team spawns behind each house).
//  * generateSkyline(): "Skyline" — a small rooftop for duels: AC units, a raised skylight block in the middle,
//    a water tank on stilts you can stand under, stair huts at each end and a parapet all round.
// =============================================================================
Object.assign(BR.World.prototype, {
  arenaCar(x, z, along, col) {
    const L = 4.4, W = 1.9, B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    if (along) { B(x - L / 2, 0.25, z - W / 2, x + L / 2, 1.05, z + W / 2, col); B(x - 1.2, 1.05, z - W / 2 + 0.12, x + 0.9, 1.6, z + W / 2 - 0.12, 0x2b3440);
      for (const sx of [-1.4, 1.4]) for (const sz of [-1, 1]) this.addBox(x + sx - 0.33, 0, z + sz * (W / 2) - 0.12, x + sx + 0.33, 0.62, z + sz * (W / 2) + 0.12, 0x1b1c1f, { decor: true }); }
    else { B(x - W / 2, 0.25, z - L / 2, x + W / 2, 1.05, z + L / 2, col); B(x - W / 2 + 0.12, 1.05, z - 1.2, x + W / 2 - 0.12, 1.6, z + 0.9, 0x2b3440);
      for (const sz of [-1.4, 1.4]) for (const sx of [-1, 1]) this.addBox(x + sx * (W / 2) - 0.12, 0, z + sz - 0.33, x + sx * (W / 2) + 0.12, 0.62, z + sz + 0.33, 0x1b1c1f, { decor: true }); }
  },

  generateSuburb() {
    const X = 36, Z = 24, WH = 9, H1 = 3.2, H2 = 6.2;
    const CON = 0x8f8676, CON2 = 0x766e60, TRIM = 0xf1ece2, ROOF = 0x5a3a33, GRASS = 0x5f8a43, ROAD = 0x4b4d52, FENCE = 0xe9e3d6, BLUE = 0x2f6fd8, RED = 0xd8443a;
    const SIDING = [0x8fb3c9, 0xd9b36c], STEEL = 0x4a5160;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => B(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Cul-de-Sac', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -31, z: 0, yaw: -Math.PI / 2 }, { x: 31, z: 0, yaw: Math.PI / 2 }];
    this.arenaShell(X, Z, WH, CON, CON2);
    // the street (runs north-south down the middle) with a turning circle island at the north end
    Dc(-6, 0, -Z, 6, 0.012, Z, ROAD); for (let z = -Z + 1; z < Z - 1; z += 3) Dc(-0.1, 0.012, z, 0.1, 0.02, z + 1.5, 0xf2d24a);
    B(-3, 0, 13, 3, 0.35, 19, 0x9a948a); Dc(-2.6, 0.35, 13.4, 2.6, 0.42, 18.6, GRASS); B(-0.35, 0.35, 15.6, 0.35, 3.2, 16.4, 0x6b4a32); Dc(-1.4, 3.0, 14.6, 1.4, 4.4, 17.4, 0x3f6e33);   // tree
    for (const sx of [-1, 1]) {
      const c = SIDING[sx < 0 ? 0 : 1], tc = sx < 0 ? BLUE : RED, hx = sx * 17;       // house centre x
      // lawns + sidewalk kerb
      Dc(sx * 6, 0, -Z, sx * 9, 0.03, Z, 0xb8b2a6); Dc(sx * 9, 0, -Z, sx * 26, 0.02, Z, GRASS);
      // ---- the house: 14 (x) x 12 (z), two storeys; front door faces the street
      const x0 = hx - 7, x1 = hx + 7, fx = sx < 0 ? x1 : x0, bx = sx < 0 ? x0 : x1;      // front wall (street side) / back wall
      this.arenaWallZ(-6, 6, fx, H1, c, [[-4.6, -2.8, 'window'], [-0.8, 0.8, 'door'], [2.8, 4.6, 'window']]);
      this.arenaWallZ(-6, 6, bx, H1, c, [[-3.8, -2.4, 'window'], [1.2, 2.6, 'door'], [3.6, 5, 'window']]);
      this.arenaWallX(x0, x1, -6, H1, c, [[hx - 4.5, hx - 3, 'window'], [hx + 2.4, hx + 3.9, 'window']]);
      this.arenaWallX(x0, x1, 6, H1, c, [[hx - 1, hx + 1, 'door'], [hx + 3.6, hx + 5, 'window']]);
      this.arenaWallX(x0, x1, 0.8, H1, c, [[hx - 4.6, hx - 3.2, 'door'], [hx + 1.4, hx + 2.8, 'door']]);                   // ground floor: kitchen / living room
      // upstairs: floor over the whole house except the stair well, walls with windows down the street
      B(x0, H1, -6, x1, H1 + 0.25, 6, TRIM, {}); 
      const up = (a, b, z, gaps) => { let p = a; for (const [g0, g1] of gaps) { if (g0 > p) B(p, H1 + 0.25, z - 0.17, g0, H2, z + 0.17, c); B(g0, H1 + 0.25, z - 0.17, g1, H1 + 1.25, z + 0.17, c); B(g0, H1 + 2.35, z - 0.17, g1, H2, z + 0.17, c); p = g1; } if (b > p) B(p, H1 + 0.25, z - 0.17, b, H2, z + 0.17, c); };
      const upZ = (a, b, x, gaps) => { let p = a; for (const [g0, g1] of gaps) { if (g0 > p) B(x - 0.17, H1 + 0.25, p, x + 0.17, H2, g0, c); B(x - 0.17, H1 + 0.25, g0, x + 0.17, H1 + 1.25, g1, c); B(x - 0.17, H1 + 2.35, g0, x + 0.17, H2, g1, c); p = g1; } if (b > p) B(x - 0.17, H1 + 0.25, p, x + 0.17, H2, b, c); };
      upZ(-6, 6, fx, [[-4.8, -2.4], [2.4, 4.8]]); upZ(-6, 6, bx, [[-1.2, 1.2]]);
      up(x0, x1, -6, [[hx - 2, hx]]); up(x0, x1, 6, [[hx + 1, hx + 3]]);
      Dc(x0 - 0.4, H2, -6.4, x1 + 0.4, H2 + 0.35, 6.4, ROOF);                                                      // flat roof edge (the roof itself is open: no skybox to hide)
      // stairs up along the north wall inside (front half), rising toward the street
      for (let i = 0; i < 8; i++) { const sxp = sx < 0 ? x0 + 1 + i * 0.8 : x1 - 1 - i * 0.8; B(sxp, 0, 3.4, sxp + sx * 0.8, (i + 1) * 0.42, 5.8, CON2); }
      Dc(x0 - 0.2, H1, -6.2, x1 + 0.2, H1 + 0.1, -5.8, TRIM); Dc(x0 - 0.2, H1, 5.8, x1 + 0.2, H1 + 0.1, 6.2, TRIM);
      // furniture cover
      this.arenaCrate(hx - sx * 3.5, -3.4, 1.0); B(hx + sx * 2 - 1.2, 0, -3.2, hx + sx * 2 + 1.2, 0.9, -2.2, 0x6b4a32);     // sofa
      B(hx - 1, H1 + 0.25, -4.6, hx + 1, H1 + 0.95, -2.6, 0xe9e3d6);                                                 // bed upstairs
      // ---- garage on the south side of each house (open door to the street)
      const g0 = -Z + 0.5, g1 = -9;
      this.arenaWallZ(g0, g1, sx < 0 ? x1 - 2 : x0 + 2, 3, c, [[g0 + 1.2, g1 - 1.2, 'door']]);
      B(sx < 0 ? x1 - 9 : x0 + 9, 0, g1 - 0.17, sx < 0 ? x1 - 2 : x0 + 2, 3, g1 + 0.17, c);
      Dc(sx < 0 ? x1 - 9.2 : x0 + 9.2, 3, g0, sx < 0 ? x1 - 1.8 : x0 + 1.8, 3.2, g1 + 0.2, ROOF);
      this.arenaCar(hx + sx * 0.5, -17, false, sx < 0 ? 0xc94f4f : 0x3f6fae);
      // ---- front yard: white picket fence with a gate, a mailbox
      for (let z = -9; z <= 12; z += 0.6) if (Math.abs(z) > 1.4) B(sx * 9.3 - 0.06, 0, z - 0.06, sx * 9.3 + 0.06, 1.0, z + 0.06, FENCE);
      Dc(sx * 9.3 - 0.04, 0.7, -9, sx * 9.3 + 0.04, 0.8, 12, FENCE);
      B(sx * 8.4 - 0.08, 0, 2.2, sx * 8.4 + 0.08, 1.1, 2.4, STEEL); Dc(sx * 8.2, 1.1, 2.0, sx * 8.6, 1.4, 2.6, tc);
      // ---- back garden: a shed, a hedge line, a trampoline-ish low platform
      B(sx * 29 - 1.6, 0, 12, sx * 29 + 1.6, 2.6, 16, 0x7a5a3a); B(sx * 27 - 0.5, 0, -12, sx * 27 + 0.5, 1.4, -4, 0x3f6e33);
      B(sx * 30 - 1.5, 0, -14, sx * 30 + 1.5, 0.7, -11, STEEL);
      // spawn markings
      Dc(sx * (X - 0.02), 1.0, -Z, sx * (X - 0.12), 2.2, Z, tc);
      for (const [a, b, c2, d] of [[29, 35, -3.4, -3.1], [29, 35, 3.1, 3.4], [29, 29.3, -3.4, 3.4]]) Dc(sx * a, 0, c2, sx * b, 0.015, d, tc);
    }
    // the street: parked cars and a box truck slanted across the middle
    this.arenaCar(-3.6, -6, false, 0xe6e2da); this.arenaCar(3.6, 7, false, 0x2b2d31);
    B(-1.2, 0, -2.6, 1.2, 3.0, 4.2, 0xf0ede6); B(-1.2, 0, 4.2, 1.2, 2.1, 6.0, 0x3f6fae); Dc(-1.25, 2.4, -2.4, 1.25, 2.7, 3.9, 0xd8443a);
    for (const sx of [-1, 1]) B(sx * 4.5 - 0.6, 0, 20, sx * 4.5 + 0.6, 0.9, 21.2, 0x6b6e75);                        // bins at the circle
    this.ffaSpots = [[-31, 0], [31, 0], [-31, -18], [31, 18], [-31, 18], [31, -18], [-17, -3], [17, 3], [-17, 3.5], [17, -3.5], [-3, -18], [3, 18], [0, 10], [0, -10], [-11, 14], [11, -14], [-20, -17], [20, 17]];
    this.groundCols = [0x6f8a52, 0x67804c, 0x78935a];
  },

  generateSkyline() {
    const X = 19, Z = 14, WH = 1.15;
    this.playBounds = { x0: -X, x1: X, z0: -Z, z1: Z, y1: 14 };            // v1.28.2: stay on the roof
    const ROOF = 0x55585f, PAR = 0x7b7f87, AC = 0x9aa0a8, GLASS = 0x6fa8c8, STEEL = 0x3c4048, Y = 0xf2b234, BLUE = 0x2f6fd8, RED = 0xd8443a;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => B(x0, y0, z0, x1, y1, z1, c, { decor: true });
    this.pois = [{ x: 0, z: 0, name: 'Skyline', type: 'arena' }]; this.towns = [];
    this.spawns = [{ x: -15.5, z: 0, yaw: -Math.PI / 2 }, { x: 15.5, z: 0, yaw: Math.PI / 2 }];
    // parapet (waist high, you can see the city) + tall invisible bounds so nobody falls off
    B(-X - 1, 0, -Z - 1, X + 1, WH, -Z, PAR, { tag: 'edge' }); B(-X - 1, 0, Z, X + 1, WH, Z + 1, PAR, { tag: 'edge' });
    B(-X - 1, 0, -Z, -X, WH, Z, PAR, { tag: 'edge' }); B(X, 0, -Z, X + 1, WH, Z, PAR, { tag: 'edge' });
    B(-X - 1, WH, -Z - 1, X + 1, 14, -Z - 0.6, PAR, { tag: 'edge', hidden: true }); B(-X - 1, WH, Z + 0.6, X + 1, 14, Z + 1, PAR, { tag: 'edge', hidden: true });
    B(-X - 1, WH, -Z, -X - 0.6, 14, Z, PAR, { tag: 'edge', hidden: true }); B(X + 0.6, WH, -Z, X + 1, 14, Z, PAR, { tag: 'edge', hidden: true });
    Dc(-X - 1, WH, -Z - 1, X + 1, WH + 0.06, -Z, Y); Dc(-X - 1, WH, Z, X + 1, WH + 0.06, Z + 1, Y);
    // the skylight block in the middle (climb it from the crates) with glass panes on top
    B(-3, 0, -2.4, 3, 1.6, 2.4, ROOF); for (const x of [-2, 0, 2]) Dc(x - 0.85, 1.6, -2, x + 0.85, 1.68, 2, GLASS);
    this.arenaCrate(-3.8, 2.6, 1.0); this.arenaCrate(3.8, -2.6, 1.0);
    for (const sx of [-1, 1]) {
      const tc = sx < 0 ? BLUE : RED;
      // stair hut at each end (the spawn) with a door facing the middle
      this.arenaWallZ(-3, 3, sx * 13, 3, PAR, [[-1, 1, 'door']]); B(sx * 13, 0, -3.17, sx * 17.5, 3, -2.83, PAR); B(sx * 13, 0, 2.83, sx * 17.5, 3, 3.17, PAR);
      Dc(sx * 12.8, 3, -3.3, sx * 17.7, 3.25, 3.3, STEEL); Dc(sx * 12.82, 2.4, -1.1, sx * 12.86, 2.6, 1.1, tc);
      // AC units (two sizes), vent pipes
      B(sx * 8 - 1.3, 0, sx * 7 - 1, sx * 8 + 1.3, 1.5, sx * 7 + 1, AC); Dc(sx * 8 - 0.9, 1.5, sx * 7 - 0.6, sx * 8 + 0.9, 1.56, sx * 7 + 0.6, STEEL);
      B(sx * 8 - 0.9, 0, sx * -8 - 0.9, sx * 8 + 0.9, 1.1, sx * -8 + 0.9, AC);
      B(sx * 4 - 0.25, 0, sx * 10 - 0.25, sx * 4 + 0.25, 2.2, sx * 10 + 0.25, STEEL);
      // low duct running along each side
      B(sx * 2 - 4, 0, sx * -11.6, sx * 2 + 4, 0.75, sx * -10.6, STEEL);
      Dc(sx * (X - 0.02), 0.2, -Z, sx * (X - 0.08), 0.9, Z, tc);
    }
    // water tank on stilts (stand under it, or climb the ladder side of the crates to its deck)
    for (const [x, z] of [[-2, 8.5], [2, 8.5], [-2, 12], [2, 12]]) B(x - 0.15, 0, z - 0.15, x + 0.15, 2.6, z + 0.15, STEEL);
    B(-2.4, 2.6, 8.1, 2.4, 2.8, 12.4, STEEL); B(-1.8, 2.8, 8.7, 1.8, 5.4, 11.8, 0x7a5a3a); Dc(-1.9, 3.6, 8.6, 1.9, 3.7, 11.9, STEEL); Dc(-1.9, 4.6, 8.6, 1.9, 4.7, 11.9, STEEL);
    this.arenaCrate(3.4, 9, 1.2); this.arenaCrate(3.4, 10.4, 2.4);
    // roof markings
    for (let x = -10; x <= 10; x += 2.5) Dc(x - 0.6, 0, -0.08, x + 0.6, 0.012, 0.08, 0xe8e4dc);
    Dc(-6.5, 0, -6.5, 6.5, 0.01, 6.5, 0x4c4f56);
    // the city around: towers of every height past the parapet (decor), lit window bands, a few antennas
    const R = BR.util.rng(4242), TW = [0x3d4350, 0x4a4f5c, 0x2f3440, 0x5a5f6a, 0x6b6258];
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + R() * 0.1, r = 30 + R() * 14, cx = Math.cos(a) * r * 1.25, cz = Math.sin(a) * r, w = 3 + R() * 4, d = 3 + R() * 4, h = 4 + R() * 26, col = TW[i % TW.length];
      Dc(cx - w, 0, cz - d, cx + w, h, cz + d, col);
      for (let y = 2.5; y < h - 1; y += 2.6) Dc(cx - w - 0.03, y, cz - d - 0.03, cx + w + 0.03, y + 0.5, cz + d + 0.03, R() < 0.5 ? 0xffd88a : 0x9fc8e8);
      if (R() < 0.25) Dc(cx - 0.1, h, cz - 0.1, cx + 0.1, h + 5, cz + 0.1, STEEL);
    }
    this.ffaSpots = [[-15.5, 0], [15.5, 0], [-10, -10], [10, 10], [-10, 10], [10, -10], [0, -8], [0, 5], [-6, 0], [6, 0]];
    this.groundCols = [0x55585f, 0x4f5258, 0x5b5e65];
  },
});
