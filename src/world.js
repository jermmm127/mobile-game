'use strict';
// =============================================================================
// WORLD — procedural map made of axis-aligned boxes.
// Every solid thing is a box {x0,y0,z0,x1,y1,z1}. That keeps collision and
// hitscan cheap and predictable on phones. Boxes are bucketed into a 2D grid
// (x/z) so queries only look at nearby boxes.
// =============================================================================
const PAL = {
  // Muted, grounded palette (concrete, plaster, steel, weathered paint) for a competitive-shooter read
  ground: 0x6f8a4e, cliff: 0x5a6150,
  walls: [0xb9b4aa, 0xa9a59c, 0x9ea2a2, 0xb2a790, 0x9b988f, 0xa6a194],
  floor: 0x6f6a62, roof: 0x4a4845,
  containers: [0x8a5a3c, 0x45607a, 0x763a35, 0x4d6650, 0x8c784a],
  crate: 0x7a6247, rock: 0x7b7a74, trunk: 0x5a4330, leaves: 0x4a6a38,
  parkour: 0xa8854a, parkourAlt: 0x363b42, cover: 0x8a8882, tower: 0x585e66,
  pad: 0x38c2dc, padBase: 0x2a3036, trim: 0x47433f, lamp: 0x2e3135, lampGlow: 0xffe6b0, fence: 0x6e5a44, pillar: 0x6b7077,
};

BR.World = class World {
  constructor(seed, opts) {
    const M = BR.CONFIG.map;
    this.arena = !!(opts && (opts.arena || opts.halloween || opts.range || opts.overdrive));
    this.reef = !!(opts && opts.reef);           // v1.11.1: the small Resurgence island
    this.halloween = !!(opts && opts.halloween);
    this.range = !!(opts && opts.range); this.overdrive = !!(opts && opts.overdrive);
    this.mapId = (opts && opts.arena && opts.map) || (opts && opts.arena ? 'yard' : null);   // v1.15 arena maps: yard / killhouse / cargo
    if (this.halloween) this.groundCols = [0x2b3820, 0x1f2a17, 0x3a3122];   // dead grass, mud
    this.size = this.reef ? 380 : opts && opts.halloween ? 230 : this.overdrive ? 170 : this.range ? 100 : this.mapId === 'district' ? 128 : this.arena ? 92 : M.size;     // v1.21 District (FFA) is bigger
    this.half = this.reef ? this.size / 2 : M.size / 2;
    this.gridHalf = this.size / 2;     // collision grid spans this world's own size (the duel arena is 72 m)
    this.cell = M.cell;
    this.n = Math.ceil(this.size / this.cell) + 2;
    this.cells = [];
    for (let i = 0; i < this.n * this.n; i++) this.cells.push([]);
    this.boxes = [];
    this.stamp = 1;
    this.seed = seed;
    this.rand = BR.util.rng(seed);
    this.lootSpots = [];   // {x,y,z,tier,force?}  force:'weapon' guarantees a gun
    this.chestSpots = [];  // {x,y,z,tier}
    this.trees = [];       // {x,z,h,s}
    this.occupied = [];    // rects used during generation to avoid overlaps
    this.decor = [];       // visual-only boxes (trims, frames): rendered, never collided
    this.buildings = [];   // {x0,x1,z0,z1,H,floors,walls:[{si,cols,door}]} for dressing
    this.containers = [];  // {x0,x1,z0,z1,y0,y1,along}
    this.props = { barrels: [], logs: [], stumps: [], ponds: [], boulders: [], rockFill: [] };
    this.hit = { t: 0, box: null };
    this.ground = { x0: -1e4, y0: -10, z0: -1e4, x1: 1e4, y1: 0, z1: 1e4, ground: true };
    this.terrainOn = !this.arena && !this.halloween && !this.range && !this.overdrive;      // v1.35: the BR + Resurgence islands get real hills
    if (this.halloween) this.generateHalloween(); else if (this.range) this.generateRange(); else if (this.overdrive) this.generateOverdrive(); else if (this.reef) this.generateReef(); else if (this.mapId === 'killhouse') this.generateKillhouse(); else if (this.mapId === 'cargo') this.generateCargo(); else if (this.mapId === 'district') this.generateDistrict(); else if (this.mapId === 'suburb') this.generateSuburb(); else if (this.mapId === 'skyline') this.generateSkyline(); else if (this.mapId === 'crossroads') this.generateCrossroads(); else if (this.mapId === 'frostbite') this.generateFrostbite(); else if (this.mapId === 'harbor') this.generateHarbor(); else if (this.arena) this.generateArena(); else this.generate();
    if (this.terrainOn) this.buildTerrain();
  }

  // ------------------------------------------------------------------ zombies: Hollow Graves
  // Four zones joined by buyable doors (collision boxes the zombies mode removes when bought):
  //   THE GRAVEYARD (start, 84 x 84 m): ruined chapel + bell tower, mausoleums, headstone rows
  //   PUMPKIN PATCH (east, door 750): barn, crop rows, scarecrows, hay bales
  //   WITCH'S WOOD (west, door 1000): dense dead trees, the witch's hut + cauldron, standing stones
  //   RAVENHOLD MANOR (north, door 1250): the ruined manor (Pack-a-Punch in the great hall), courtyard fountain
  // Each zone lists its zombie spawn graves, wall buys, Mystery Box spots and quest spots.
  generateHalloween() {
    const STONE = 0x4a4652, STONE2 = 0x3a3742, MOSS = 0x34402c, WOOD = 0x3b2a1e, IRON = 0x1c1b20, BONE = 0x8d8676, ROOF = 0x2a2530, HAY = 0x8a7038, BRICK = 0x4a2a2a;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    const D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    const R = this.rand, L = 42, WH = 3.2;
    this.pois = [{ x: 0, z: 0, name: 'Hollow Graves', type: 'arena' }];
    this.towns = [];
    this.zmDoors = []; this.zmZones = {}; this.zmBuys = []; this.zmBoxSpots = []; this.zmSpawns = [];
    const zone = (id, name) => (this.zmZones[id] = { id, name, spawns: [] });
    zone('graveyard', 'The Graveyard'); zone('patch', 'Pumpkin Patch'); zone('wood', "Witch's Wood"); zone('manor', 'Ravenhold Manor');
    // a wall along X or Z with door gaps: gaps = [[a0, a1], ...]
    const wallX = (z, x0, x1, gaps, h) => { let a = x0; for (const [g0, g1] of (gaps || []).concat([[x1, x1]])) { if (g0 > a) { B(a, 0, z - 0.6, g0, h || WH, z + 0.6, STONE2); D(a, h || WH, z - 0.7, g0, (h || WH) + 0.25, z + 0.7, STONE); for (let i = a + 0.6; i < g0; i += 1.4) D(i - 0.04, (h || WH) + 0.25, z - 0.04, i + 0.04, (h || WH) + 1.3, z + 0.04, IRON); } a = g1; } };
    const wallZ = (x, z0, z1, gaps, h) => { let a = z0; for (const [g0, g1] of (gaps || []).concat([[z1, z1]])) { if (g0 > a) { B(x - 0.6, 0, a, x + 0.6, h || WH, g0, STONE2); D(x - 0.7, h || WH, a, x + 0.7, (h || WH) + 0.25, g0, STONE); for (let i = a + 0.6; i < g0; i += 1.4) D(x - 0.04, (h || WH) + 0.25, i - 0.04, x + 0.04, (h || WH) + 1.3, i + 0.04, IRON); } a = g1; } };
    const door = (id, name, cost, x0, z0, x1, z1, from, to) => { const box = B(x0, 0, z0, x1, 4.2, z1, WOOD, { hidden: true }); this.zmDoors.push({ id, name, cost, x0, z0, x1, z1, from, to, box, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }); };
    const spawnRing = (zid, pts) => { for (const [x, z] of pts) { this.zmZones[zid].spawns.push({ x, z }); this.zmSpawns.push({ x, z, zone: zid }); } };
    const buy = (zid, wid, x, y, z, nx, nz) => this.zmBuys.push([wid, x, y, z, nx, nz, zid]);

    // ======================= THE GRAVEYARD (start) =======================
    wallX(L, -L, L, [[-3.6, 3.6]]); wallX(-L, -L, L, [[17, 23]]); wallZ(L, -L, L, [[-3, 3]]); wallZ(-L, -L, L, [[-3, 3]]);
    door('patch', 'Pumpkin Patch', 750, L - 0.7, -3, L + 0.7, 3, 'graveyard', 'patch');
    door('wood', "Witch's Wood", 1000, -L - 0.7, -3, -L + 0.7, 3, 'graveyard', 'wood');
    door('manor', 'Ravenhold Manor', 1250, 17, -L - 0.7, 23, -L + 0.7, 'graveyard', 'manor');
    // south gate (closed iron gate between pillars)
    for (const x of [-4.5, 4.5]) { B(x - 0.9, 0, L - 1.2, x + 0.9, 4.6, L + 1.2, STONE); D(x - 1.05, 4.6, L - 1.35, x + 1.05, 4.9, L + 1.35, STONE2); }
    B(-3.6, 0, L - 0.15, 3.6, 3.9, L + 0.15, IRON, { hidden: true });
    for (let x = -3.4; x <= 3.4; x += 0.45) D(x - 0.05, 0, L - 0.1, x + 0.05, 3.9, L + 0.1, IRON);
    D(-3.6, 3.0, L - 0.12, 3.6, 3.15, L + 0.12, IRON); D(-3.6, 1.0, L - 0.12, 3.6, 1.15, L + 0.12, IRON);
    // ruined chapel + bell tower
    const cx = 0, cz = -22, cw = 9, cd = 7, ch = 6.5, t = 0.6;
    B(cx - cw, 0, cz - cd, cx + cw, ch, cz - cd + t, STONE);
    B(cx - cw, 0, cz + cd - t, cx - 2, ch, cz + cd, STONE); B(cx + 2, 0, cz + cd - t, cx + cw, ch * 0.8, cz + cd, STONE);
    B(cx - 2, 3.6, cz + cd - t, cx + 2, ch, cz + cd, STONE);
    B(cx - cw, 0, cz - cd, cx - cw + t, ch, cz - 1.6, STONE); B(cx - cw, 0, cz + 1.6, cx - cw + t, ch * 0.7, cz + cd, STONE);
    B(cx + cw - t, 0, cz - cd, cx + cw, ch * 0.85, cz - 1.6, STONE); B(cx + cw - t, 0, cz + 1.6, cx + cw, ch, cz + cd, STONE);
    D(cx - cw - 0.2, ch, cz - cd - 0.2, cx + 1, ch + 0.4, cz + cd + 0.2, ROOF);
    D(cx - 1, ch - 0.6, cz - cd, cx - 0.4, ch, cz + cd, WOOD); D(cx + 3, ch - 0.6, cz - cd, cx + 3.6, ch * 0.85, cz + cd, WOOD);
    B(cx - 3, 0, cz - cd + t, cx + 3, 1.0, cz - cd + 2.2, STONE2);
    D(cx - 0.15, 1.0, cz - cd + 1.0, cx + 0.15, 2.6, cz - cd + 1.3, BONE); D(cx - 0.7, 2.0, cz - cd + 1.0, cx + 0.7, 2.3, cz - cd + 1.3, BONE);
    B(cx + cw - 3.5, 0, cz - cd - 3.5, cx + cw + 0.5, 13, cz - cd + 0.5, STONE2);
    D(cx + cw - 3.8, 13, cz - cd - 3.8, cx + cw + 0.8, 13.5, cz - cd + 0.8, STONE);
    D(cx + cw - 3.0, 13.5, cz - cd - 3.0, cx + cw, 15.5, cz - cd, ROOF); D(cx + cw - 2.2, 15.5, cz - cd - 2.2, cx + cw - 0.8, 17.5, cz - cd - 0.8, ROOF);
    const crypt = (x, z, rot) => {
      const w = 3, d = 3.5, h = 3.6;
      B(x - w, 0, z - d, x + w, h, z + d, STONE);
      D(x - w - 0.3, h, z - d - 0.3, x + w + 0.3, h + 0.35, z + d + 0.3, STONE2); D(x - w + 0.5, h + 0.35, z - d + 0.4, x + w - 0.5, h + 0.9, z + d - 0.4, STONE2);
      D(x - w + 1.4, h + 0.9, z - d + 1, x + w - 1.4, h + 1.4, z + d - 1, ROOF);
      const fz = rot > 0 ? z + d : z - d, n = rot > 0 ? 1 : -1;
      D(x - 1.1, 0, fz - 0.05 * n, x + 1.1, 2.4, fz + 0.06 * n, 0x0c0b10);
      D(x - 1.5, 2.4, fz - 0.05 * n, x + 1.5, 2.7, fz + 0.2 * n, BONE);
      for (const sx of [-1.4, 1.4]) D(x + sx - 0.22, 0, fz, x + sx + 0.22, 2.4, fz + 0.3 * n, STONE2);
    };
    crypt(-25, -18, 1); crypt(25, -18, 1); crypt(-25, 20, -1); crypt(25, 20, -1);
    const lw = (x0, z0, x1, z1) => B(x0, 0, z0, x1, 1.0 + R() * 0.2, z1, MOSS);
    lw(-14, 4, -6, 4.8); lw(6, 4, 14, 4.8); lw(-16, -6, -15.2, 2); lw(15.2, -6, 16, 2); lw(-10, 26, -3, 26.8); lw(3, 26, 10, 26.8); lw(-36, -2, -30, -1.2); lw(30, 1.2, 36, 2);
    for (const [x, z, a] of [[-8, 14, 0], [9, 13, 1], [0, 33, 0], [-30, 32, 1], [31, -31, 0]]) { if (a) B(x - 0.5, 0, z - 1.1, x + 0.5, 0.75, z + 1.1, WOOD); else B(x - 1.1, 0, z - 0.5, x + 1.1, 0.75, z + 0.5, WOOD); }
    const stones = (x0, x1, z0, z1, skip) => { for (let gx = x0; gx <= x1; gx += 4.2) for (let gz = z0; gz <= z1; gz += 5.2) {
      if (skip && skip(gx, gz)) continue; if (R() < 0.25) continue;
      const x = gx + (R() - 0.5) * 1.2, z = gz + (R() - 0.5) * 1.2, hh = 0.6 + R() * 0.7, ww = 0.35 + R() * 0.25;
      D(x - ww, 0, z - 0.09, x + ww, hh, z + 0.09, R() < 0.5 ? STONE : 0x5a5662); if (R() < 0.35) D(x - 0.1, hh, z - 0.08, x + 0.1, hh + 0.35, z + 0.08, STONE);
      D(x - 0.45, 0, z + 0.2, x + 0.45, 0.16, z + 1.6, 0x2a2018); } };
    stones(-36, 36, -36, 38, (gx, gz) => (Math.abs(gx) < 11 && gz > -31 && gz < -13) || (Math.abs(Math.abs(gx) - 25) < 5 && Math.abs(Math.abs(gz) - 19) < 6) || (Math.abs(gx) < 6 && gz > 6 && gz < 30) || (Math.abs(gz) < 6 && Math.abs(gx) > 36) || (gx > 14 && gx < 26 && gz < -34));
    const ring = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.2, r = 33 + (i % 3) * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r]); }
    spawnRing('graveyard', ring.concat([[-12, -20], [12, -30], [-20, 8], [20, 8]]));
    buy('graveyard', 'smg', cx - 6, 1.7, cz + cd + 0.02, 0, 1); buy('graveyard', 'shotgun', cx + 6, 1.7, cz + cd + 0.02, 0, 1);
    buy('graveyard', 'rifle', -25, 1.7, -18 + 3.5 + 0.02, 0, 1); buy('graveyard', 'revolver', 25, 1.7, -18 + 3.5 + 0.02, 0, 1);
    buy('graveyard', 'holoar', -25, 1.7, 20 - 3.5 - 0.02, 0, -1); buy('graveyard', 'pistol', 25, 1.7, 20 - 3.5 - 0.02, 0, -1);
    this.zmBoxSpots.push({ x: 0, z: 10, yaw: 0, zone: 'graveyard' }, { x: -25, z: -8, yaw: Math.PI / 2, zone: 'graveyard' });

    // ======================= PUMPKIN PATCH (east) =======================
    const PX0 = L, PX1 = 100, PZ = 34;
    wallX(-PZ, PX0, PX1); wallX(PZ, PX0, PX1); wallZ(PX1, -PZ, PZ); wallZ(PX0, -PZ, -L + 0.1); wallZ(PX0, L - 0.1, PZ);
    // barn: open front facing west, hayloft, roof
    const bx0 = 74, bx1 = 92, bz0 = -24, bz1 = -8;
    B(bx0, 0, bz0, bx1, 7, bz0 + 0.5, BRICK); B(bx0, 0, bz1 - 0.5, bx1, 7, bz1, BRICK); B(bx1 - 0.5, 0, bz0, bx1, 7, bz1, BRICK);
    B(bx0, 0, bz0, bx0 + 0.5, 7, bz0 + 5, BRICK); B(bx0, 0, bz1 - 5, bx0 + 0.5, 7, bz1, BRICK); B(bx0, 5.2, bz0 + 5, bx0 + 0.5, 7, bz1 - 5, BRICK);
    D(bx0 - 0.4, 7, bz0 - 0.4, bx1 + 0.4, 7.4, bz1 + 0.4, 0x3a1a1a); D(bx0 + 1, 7.4, bz0 + 1, bx1 - 1, 8.6, bz1 - 1, 0x3a1a1a);
    B(bx0 + 8, 3.2, bz0 + 0.5, bx1 - 0.5, 3.5, bz1 - 0.5, WOOD);                                   // hayloft floor
    for (let i = 0; i < 6; i++) B(bx0 + 9 + (i % 3) * 2.6, 3.5, bz0 + 2 + Math.floor(i / 3) * 5, bx0 + 11 + (i % 3) * 2.6, 4.6, bz0 + 4 + Math.floor(i / 3) * 5, HAY);
    for (let i = 0; i < 5; i++) B(bx0 + 2 + i * 1.6, 0, bz1 - 3, bx0 + 3.3 + i * 1.6, 1.4 * (1 + (i % 2)), bz1 - 1.2, HAY);   // stairs of hay up
    // crop rows, hay bales, scarecrow posts, a wagon
    for (let x = 50; x < 96; x += 3.2) for (let z = 4; z < 30; z += 2.6) if (R() < 0.85) D(x - 0.6, 0, z - 0.25, x + 0.6, 0.25, z + 0.25, 0x2a3a18);
    for (const [x, z] of [[56, -12], [62, -26], [58, 20], [70, 10], [90, 22], [96, -2], [52, -28]]) B(x - 1, 0, z - 0.7, x + 1, 1.3, z + 0.7, HAY);
    for (const [x, z] of [[60, 12], [80, 26], [88, 6]]) { D(x - 0.08, 0, z - 0.08, x + 0.08, 2.6, z + 0.08, WOOD); D(x - 0.9, 2.0, z - 0.06, x + 0.9, 2.15, z + 0.06, WOOD); }
    B(64, 0, -6, 69, 1.4, -3.6, WOOD); D(64.2, 0, -6.3, 65.2, 1.0, -3.3, 0x1c1b20);
    for (const [x0, z0, x1, z1] of [[48, -16, 56, -15.4], [60, 0, 68, 0.6], [80, 0, 88, 0.6]]) B(x0, 0, z0, x1, 1.0, z1, WOOD);   // fences (vault)
    spawnRing('patch', [[96, 30], [96, -30], [70, 31], [70, -31], [98, 4], [50, 30], [50, -30]]);
    buy('patch', 'lmg', bx0 + 4, 1.7, bz1 + 0.02, 0, 1); buy('patch', 'hunter', bx1 + 0.02, 1.7, -16, 1, 0); buy('patch', 'shotgun', 69.1, 1.7, -4.8, 1, 0);
    this.zmBoxSpots.push({ x: 84, z: -16, yaw: Math.PI / 2, zone: 'patch' });

    // ======================= WITCH'S WOOD (west) =======================
    const WX0 = -100, WX1 = -L;
    wallX(-PZ, WX0, WX1); wallX(PZ, WX0, WX1); wallZ(WX0, -PZ, PZ); wallZ(WX1, -PZ, -L + 0.1); wallZ(WX1, L - 0.1, PZ);
    // witch's hut: crooked walls, doorway east, pointed roof, chimney
    const hx = -78, hz = 0;
    B(hx - 5, 0, hz - 5, hx + 5, 4.5, hz - 4.5, WOOD); B(hx - 5, 0, hz + 4.5, hx + 5, 4.5, hz + 5, WOOD); B(hx - 5, 0, hz - 5, hx - 4.5, 4.5, hz + 5, WOOD);
    B(hx + 4.5, 0, hz - 5, hx + 5, 4.5, hz - 1.4, WOOD); B(hx + 4.5, 0, hz + 1.4, hx + 5, 4.5, hz + 5, WOOD); B(hx + 4.5, 3, hz - 1.4, hx + 5, 4.5, hz + 1.4, WOOD);
    D(hx - 5.6, 4.5, hz - 5.6, hx + 5.6, 5.0, hz + 5.6, 0x241a14); D(hx - 4, 5.0, hz - 4, hx + 4, 6.5, hz + 4, 0x241a14); D(hx - 2.4, 6.5, hz - 2.4, hx + 2.4, 8.2, hz + 2.4, 0x241a14); D(hx - 0.8, 8.2, hz - 0.8, hx + 0.8, 10.4, hz + 0.8, 0x241a14);
    B(hx - 4, 4.5, hz + 2, hx - 2.8, 9, hz + 3.2, STONE2);
    B(hx + 7, 0, hz - 1.2, hx + 9.4, 0.9, hz + 1.2, IRON);                                        // the cauldron (dressed by the mode)
    // standing stones (circle) and the dead-tree thicket (trunks added by the mode)
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, x = -62 + Math.cos(a) * 7, z = -20 + Math.sin(a) * 7; B(x - 0.6, 0, z - 0.4, x + 0.6, 3 + (i % 3) * 0.6, z + 0.4, STONE2); }
    B(-63, 0, -21, -61, 0.8, -19, STONE);                                                          // altar stone
    spawnRing('wood', [[-96, 30], [-96, -30], [-70, 31], [-70, -31], [-98, 4], [-50, 30], [-50, -30]]);
    buy('wood', 'dmr', hx - 5.02, 1.7, hz, -1, 0); buy('wood', 'sniper', -62 + 7 * Math.cos(0) + 0.62, 1.7, -20, 1, 0); buy('wood', 'smg', hx, 1.7, hz + 5.02, 0, 1);
    this.zmBoxSpots.push({ x: -62, z: 12, yaw: 0, zone: 'wood' });

    // ======================= RAVENHOLD MANOR (north) =======================
    const MZ0 = -100, MZ1 = -L, MX = 34;
    wallZ(-MX, MZ0, MZ1); wallZ(MX, MZ0, MZ1); wallX(MZ0, -MX, MX); wallX(MZ1, -MX, -L + 0.1); wallX(MZ1, L - 0.1, MX);
    // the manor: a central great hall (Pack-a-Punch) with two wings, doorways front and sides
    const m0 = -92, m1 = -70;
    B(-14, 0, m0, 14, 9, m0 + 0.6, BRICK);                                                         // back
    B(-14, 0, m1 - 0.6, -3, 9, m1, BRICK); B(3, 0, m1 - 0.6, 14, 9, m1, BRICK); B(-3, 5, m1 - 0.6, 3, 9, m1, BRICK);   // front with the great doors
    B(-14, 0, m0, -13.4, 9, m1, BRICK); B(13.4, 0, m0, 14, 9, m1, BRICK);
    D(-14.5, 9, m0 - 0.5, 14.5, 9.5, m1 + 0.5, ROOF); D(-12, 9.5, m0 + 1.5, 12, 12, m1 - 1.5, ROOF); D(-9, 12, m0 + 4, 9, 14, m1 - 4, ROOF);
    for (const s of [-1, 1]) {                                                                     // wings
      const w0 = s * 14, w1 = s * 28;
      B(Math.min(w0, w1), 0, m0 + 4, Math.max(w0, w1), 6, m0 + 4.6, BRICK); B(Math.min(w0, w1), 0, m1 - 4.6, Math.max(w0, w1), 6, m1 - 4, BRICK);
      B(w1 - 0.3, 0, m0 + 4, w1 + 0.3, 6, m0 + 9, BRICK); B(w1 - 0.3, 0, m1 - 9, w1 + 0.3, 6, m1 - 4, BRICK);
      B(w0 - 0.3, 0, m0 + 4.6, w0 + 0.3, 6, m0 + 8, BRICK); B(w0 - 0.3, 0, m1 - 8, w0 + 0.3, 6, m1 - 4.6, BRICK);
      D(Math.min(w0, w1) - 0.4, 6, m0 + 3.6, Math.max(w0, w1) + 0.4, 6.4, m1 - 3.6, ROOF);
      for (let k = 0; k < 3; k++) D(s * (16 + k * 4) - 0.6, 2, m1 - 4.05, s * (16 + k * 4) + 0.6, 4, m1 - 3.95, 0xffb24a);  // lit windows
    }
    for (let k = -2; k <= 2; k++) if (k) D(k * 4.5 - 0.7, 4.5, m1 + 0.02, k * 4.5 + 0.7, 7, m1 + 0.08, 0xffb24a);
    // courtyard fountain + hedges
    B(-3, 0, -58, 3, 0.9, -52, STONE); D(-2.5, 0.9, -57.5, 2.5, 1.0, -52.5, 0x3a5a8a); B(-0.4, 0.9, -55.4, 0.4, 3.0, -54.6, STONE);
    for (const [x0, z0, x1, z1] of [[-28, -64, -16, -63], [16, -64, 28, -63], [-28, -50, -16, -49], [16, -50, 28, -49]]) B(x0, 0, z0, x1, 1.4, z1, 0x1e2a16);
    spawnRing('manor', [[-30, -96], [30, -96], [-30, -48], [30, -48], [0, -97], [-31, -72], [31, -72]]);
    buy('manor', 'hunter', -14.02, 1.7, -80, -1, 0); buy('manor', 'lmg', 14.02, 1.7, -80, 1, 0); buy('manor', 'dmr', -8, 1.7, m1 + 0.02, 0, 1); buy('manor', 'rifle', 8, 1.7, m1 + 0.02, 0, 1);
    this.zmBoxSpots.push({ x: 0, z: -60, yaw: 0, zone: 'manor' });
    this.zmPap = { x: 0, z: -86, yaw: 0, zone: 'manor' };
    // quest spots (story): journal pages in each zone, ritual candles, the bell tower top, the cauldron, the altar
    this.zmQuest = {
      pages: [{ x: -7, z: -27.5 }, { x: 85, z: -12 }, { x: -76, z: 3 }, { x: 10, z: -88 }, { x: -30, z: 30 }],
      candles: [{ x: -36, z: -36 }, { x: 36, z: -36 }, { x: 36, z: 36 }, { x: -36, z: 36 }],
      bell: { x: 7.5, y: 13, z: -30.5 }, cauldron: { x: hx + 8.2, z: hz }, altar: { x: 0, z: -27.2 }, stones: { x: -62, z: -20 },
    };
    this.spawns = [{ x: 0, z: 18, yaw: 0 }];
  }
  // remove a collision box (a bought door)
  removeBox(b) {
    if (!b) return;
    const i = this.boxes.indexOf(b); if (i >= 0) this.boxes.splice(i, 1);
    for (const cell of this.cells) { const k = cell.indexOf(b); if (k >= 0) cell.splice(k, 1); }
  }

  // ------------------------------------------------------------------ duel arena
  // "The Yard": a compact walled 1v1 arena (about 63 x 41 m), mirrored end to end so both
  // spawns are fair. Blue end at -X, red end at +X. Central two-level platform with
  // stairs, raised side catwalks reached by jump pads, wall-run walls, wall-chain
  // pillars, low cover, and floodlights. Everything is grappleable.
  generateArena() {
    const W = 26, D = 17, WH = 9;
    const CON = 0x7a808a, CON2 = 0x666c75, BLUE = 0x2f6fd8, RED = 0xd8443a, STEEL = 0x4a5160, Y = 0xf2b234;
    const K = 1.22;                                     // layout scale: the whole yard is 22% bigger across (heights unchanged)
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0 * K, y0, z0 * K, x1 * K, y1, z1 * K, c, o);
    const Dc = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0 * K, y0, z0 * K, x1 * K, y1, z1 * K, c, { decor: true });
    const mirror = fn => { fn(1); fn(-1); };            // build once for each half (x -> -x)
    this.pois = [{ x: 0, z: 0, name: 'The Yard', type: 'arena' }];
    this.towns = [];
    this.spawns = [{ x: -22 * K, z: 0, yaw: -Math.PI / 2 }, { x: 22 * K, z: 0, yaw: Math.PI / 2 }];
    this.playBounds = { x0: -W * K, x1: W * K, z0: -D * K, z1: D * K, y1: WH + 14 };     // v1.28.2: the hard play area (inside the walls)
    // perimeter walls (tall, grappleable) + coping + barbed wire
    B(-W - 3, 0, -D - 3, W + 3, WH, -D, CON, { tag: 'edge' }); B(-W - 3, 0, D, W + 3, WH, D + 3, CON, { tag: 'edge' });
    B(-W - 3, 0, -D, -W, WH, D, CON, { tag: 'edge' }); B(W, 0, -D, W + 3, WH, D, CON, { tag: 'edge' });
    Dc(-W, WH, -D - 0.2, W, WH + 0.25, -D + 0.2, CON2); Dc(-W, WH, D - 0.2, W, WH + 0.25, D + 0.2, CON2);
    for (const z of [-D, D]) for (let x = -W; x <= W; x += 4) Dc(x - 0.05, WH, z - 0.05, x + 0.05, WH + 1.1, z + 0.05, STEEL);
    for (const z of [-D, D]) for (const yy of [WH + 0.5, WH + 0.95]) Dc(-W, yy, z - 0.02, W, yy + 0.03, z + 0.02, 0x2a2d33);
    // painted floor: centre line, spawn boxes, lane arrows
    Dc(-0.15, 0, -D, 0.15, 0.015, D, 0xe8e4dc);
    mirror(sx => {
      const tc = sx < 0 ? BLUE : RED;
      for (const [a, b, c, d] of [[18.5, 25.5, -3.5, -3.2], [18.5, 25.5, 3.2, 3.5], [18.5, 18.8, -3.5, 3.5]]) Dc(sx * a, 0, c, sx * b, 0.015, d, tc);
      // team colour band + big number on the end wall
      Dc(sx * (W - 0.02), 1.0, -D, sx * (W - 0.12), 2.2, D, tc);
      Dc(sx * (W - 0.02), 3.0, -2.5, sx * (W - 0.14), 7.0, 2.5, tc);
      Dc(sx * (W - 0.02), 3.6, -1.6, sx * (W - 0.16), 6.4, 1.6, 0xe8e4dc);
      Dc(sx * (W - 0.02), 3.9, -0.4, sx * (W - 0.18), 6.1, 0.4, tc);
      // spawn cover: a low wall in front of each spawn
      B(sx * 17.5, 0, -2.8, sx * 18.2, 1.25, 2.8, CON2);
      Dc(sx * 17.45, 1.25, -2.85, sx * 18.25, 1.32, 2.85, tc);
      // wall-run walls flanking the mid lane
      for (const zz of [[4.5, 12], [-12, -4.5]]) {
        B(sx * 10.7, 0.6, zz[0], sx * 11.3, 5, zz[1], STEEL);
        Dc(sx * 10.65, 4.6, zz[0], sx * 11.35, 4.75, zz[1], Y);
      }
      // wall-chain pillars near each spawn
      for (const zz of [-6.5, 6.5]) { B(sx * 16 - 0.8, 0, zz - 0.8, sx * 16 + 0.8, 5.5, zz + 0.8, CON2); Dc(sx * 16 - 0.82, 5.3, zz - 0.82, sx * 16 + 0.82, 5.5, zz + 0.82, tc); }
      // crates / cover
      for (const [x, z, h] of [[6.5, 7, 1.2], [6.5, -7, 1.2], [14, 11.5, 2.4], [14, -11.5, 1.2], [21, 9.5, 1.2], [21, -9.5, 2.4]]) {
        B(sx * x - 0.65, 0, z - 0.65, sx * x + 0.65, h, z + 0.65, 0xa77b4f);
        if (h > 2) B(sx * x - 0.65 - sx * 1.3, 0, z - 0.65, sx * x + 0.65 - sx * 1.3, 1.2, z + 0.65, 0xa77b4f);
      }
      // jump pads up to the catwalks
      for (const zz of [-12.2, 12.2]) this.jumpPad(sx * 19 * K, zz * K);
      // floodlight towers in the corners
      for (const zz of [-D + 1, D - 1]) {
        const fx = sx * (W - 1);
        B(fx - 0.2, 0, zz - 0.2, fx + 0.2, 11, zz + 0.2, STEEL);
        Dc(fx - 0.9, 11, zz - 0.5, fx + 0.9, 11.9, zz + 0.5, 0x2a2d33);
        Dc(fx - 0.75, 11.15, zz - (zz > 0 ? 0.52 : -0.48), fx + 0.75, 11.75, zz - (zz > 0 ? 0.48 : -0.52), 0xfff4c8);
      }
    });
    // side catwalks (3.6 m up) along both long walls with railings
    for (const sz of [1, -1]) {
      const z0 = sz * 13.5, z1 = sz * (D - 0.01);
      B(-13, 3.3, z0, 13, 3.6, z1, STEEL);
      for (let x = -12; x <= 12; x += 4) B(x - 0.15, 0, z0 + sz * 0.2, x + 0.15, 3.3, z0 + sz * 0.5, STEEL);
      Dc(-13, 4.5, z0 - 0.04, 13, 4.58, z0 + 0.04, Y); Dc(-13, 4.0, z0 - 0.03, 13, 4.05, z0 + 0.03, Y);
      for (let x = -13; x <= 13; x += 2.6) Dc(x - 0.03, 3.6, z0 - 0.03, x + 0.03, 4.58, z0 + 0.03, Y);
      this.lootSpots.length = 0;
    }
    // central platform: pillars + deck at 3.2 m, stairs up from both long sides, cover on top
    for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) B(x - 0.35, 0, z - 0.35, x + 0.35, 2.9, z + 0.35, CON2);
    B(-3.2, 2.9, -3.2, 3.2, 3.2, 3.2, STEEL);
    Dc(-3.25, 3.2, -3.25, 3.25, 3.24, -3.05, Y); Dc(-3.25, 3.2, 3.05, 3.25, 3.24, 3.25, Y);
    for (const sz of [1, -1]) for (let i = 0; i < 6; i++) {
      const y = (i + 1) * 0.5, z = sz * (3.2 + (6 - i) * 0.55);
      B(-1.1, 0, Math.min(z, z - sz * 0.55), 1.1, Math.min(y, 3.2), Math.max(z, z - sz * 0.55), CON2);
    }
    B(-0.3, 3.2, -1.6, 0.3, 4.3, 1.6, CON);                       // cover wall on the deck
    // the ground is concrete here
    this.groundCols = [0x908a80, 0x837d74, 0x9e968a];      // v1.21: warmer yard concrete
  }

  // ---------------------------------------------------------------- storage
  addBox(x0, y0, z0, x1, y1, z1, color, opt) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (y0 > y1) { const t = y0; y0 = y1; y1 = t; }
    if (z0 > z1) { const t = z0; z0 = z1; z1 = t; }
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return null;
    const b = { x0, y0, z0, x1, y1, z1, color, stamp: 0, tag: opt && opt.tag };
    if (opt && opt.decor) { this.decor.push(b); return b; }
    if (opt && opt.hidden) b.hidden = true;      // collision only (drawn by an instanced prop)
    this.boxes.push(b);
    const c = this.cellRange(x0, z0, x1, z1);
    for (let cz = c[1]; cz <= c[3]; cz++)
      for (let cx = c[0]; cx <= c[2]; cx++) this.cells[cz * this.n + cx].push(b);
    return b;
  }

  cellRange(x0, z0, x1, z1) {
    const cs = this.cell, h = this.gridHalf, n = this.n - 1;
    const r = this._cr || (this._cr = [0, 0, 0, 0]);
    r[0] = BR.util.clamp(Math.floor((x0 + h) / cs) + 1, 0, n);
    r[1] = BR.util.clamp(Math.floor((z0 + h) / cs) + 1, 0, n);
    r[2] = BR.util.clamp(Math.floor((x1 + h) / cs) + 1, 0, n);
    r[3] = BR.util.clamp(Math.floor((z1 + h) / cs) + 1, 0, n);
    return r;
  }

  // All boxes strictly overlapping the AABB.
  query(x0, y0, z0, x1, y1, z1, out) {
    out.length = 0;
    const s = ++this.stamp;
    const c = this.cellRange(x0, z0, x1, z1);
    for (let cz = c[1]; cz <= c[3]; cz++) {
      for (let cx = c[0]; cx <= c[2]; cx++) {
        const list = this.cells[cz * this.n + cx];
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.stamp === s) continue;
          b.stamp = s;
          if (b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0 && b.z0 < z1 && b.z1 > z0) out.push(b);
        }
      }
    }
    // ground slab (v1.35: on terrain maps it sits at the terrain height under the query)
    if (this.T) { const gh = this.heightAt((x0 + x1) / 2, (z0 + z1) / 2); if (y0 < gh) { this.ground.y1 = gh; this.ground.y0 = gh - 10; out.push(this.ground); } }
    else if (y0 < 0) { this.ground.y1 = 0; this.ground.y0 = -10; out.push(this.ground); }      // (flat: always at 0, even if a terrain query moved it)
    return out;
  }

  // Ray vs world (boxes + ground). Uses a 2D grid walk so long shots stay cheap.
  // Returns this.hit = {t, box}; t === maxDist when nothing was hit.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const U = BR.util;
    let best = maxDist, bestBox = null;
    if (this.T) { const t = this.rayTerrain(ox, oy, oz, dx, dy, dz, best); if (t < best) { best = t; bestBox = this.ground; } }       // v1.35: hills block shots + sight
    else if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; bestBox = this.ground; } }
    const ix = U.inv(dx), iy = U.inv(dy), iz = U.inv(dz);
    const cs = this.cell, h = this.gridHalf, n = this.n;
    let cx = Math.floor((ox + h) / cs) + 1, cz = Math.floor((oz + h) / cs) + 1;
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const bx = (cx - 1 + (dx > 0 ? 1 : 0)) * cs - h;
    const bz = (cz - 1 + (dz > 0 ? 1 : 0)) * cs - h;
    let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : (bx - ox) / dx;
    let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : (bz - oz) / dz;
    const tDX = Math.abs(dx) < 1e-9 ? Infinity : cs / Math.abs(dx);
    const tDZ = Math.abs(dz) < 1e-9 ? Infinity : cs / Math.abs(dz);
    const s = ++this.stamp;
    let tCell = 0, guard = 0;
    while (tCell <= best && guard++ < 512) {
      if (cx < 0 || cz < 0 || cx >= n || cz >= n) break;
      const list = this.cells[cz * n + cx];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.stamp === s) continue;
        b.stamp = s;
        const t = U.rayAABB(ox, oy, oz, ix, iy, iz, b, best);
        if (t < best) { best = t; bestBox = b; }
      }
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDX; cx += stepX; }
      else { tCell = tMaxZ; tMaxZ += tDZ; cz += stepZ; }
    }
    this.hit.t = best; this.hit.box = bestBox;
    return this.hit;
  }

  // Ray vs tree canopies (visual-only for bullets, but the grapple can hook them).
  raycastTrees(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    for (const t of this.trees) {
      if (Math.abs(t.x - ox) > maxDist + 4 || Math.abs(t.z - oz) > maxDist + 4) continue;
      const hit = BR.util.raySphere(ox, oy, oz, dx, dy, dz, t.x, (t.y || 0) + t.h + t.s * 0.4, t.z, t.s * 1.05, best);
      if (hit < best) best = hit;
    }
    return best;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
    return h.t >= d - 0.05;
  }

  // Highest walkable surface under (x,z) below height `fromY`.
  groundAt(x, z, fromY) {
    let top = this.T ? this.heightAt(x, z) : 0;
    const tmp = this._gtmp || (this._gtmp = []);
    this.query(x - 0.2, 0, z - 0.2, x + 0.2, fromY, z + 0.2, tmp);
    for (const b of tmp) if (!b.ground && b.y1 <= fromY && b.y1 > top) top = b.y1;
    return top;
  }

  // ------------------------------------------------------------- v1.35 TERRAIN
  // A height field on a 5 m grid (bilinear between points). Generation runs on flat ground as before; then the terrain
  // is built: rolling hills, ridge lines and valleys from seeded noise, falling to the beach at the coast, slopes capped so
  // you can always run up them, and flattened pads under everything that was built (largest first). Then every box, loot
  // spot, tree and prop is lifted onto it, so buildings sit level and nothing floats.
  heightAt(x, z) {
    const T = this.T; if (!T) return 0;
    const fx = (x - T.o) / T.C, fz = (z - T.o) / T.C, i = Math.max(0, Math.min(T.N - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.N - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j)), h = T.h, N = T.N, k = j * N + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + N] * (1 - u) + h[k + N + 1] * u) * v;
  }
  buildTerrain() {
    const H = this.half, C = 5, S = this.size + 140, N = Math.ceil(S / C) + 1, o = -S / 2, h = new Float32Array(N * N);
    // seeded gradient noise
    const R = BR.util.rng(this.seed * 7 + 13), P = new Uint8Array(512), G = [];
    const pp = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const k = Math.floor(R() * (i + 1)); [pp[i], pp[k]] = [pp[k], pp[i]]; }
    for (let i = 0; i < 512; i++) P[i] = pp[i & 255];
    for (let i = 0; i < 256; i++) { const a = R() * Math.PI * 2; G.push([Math.cos(a), Math.sin(a)]); }
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const noise = (x, z) => { const X = Math.floor(x), Z = Math.floor(z), xf = x - X, zf = z - Z, xi = X & 255, zi = Z & 255;
      const g = (a, b, dx, dz) => { const v = G[P[P[a] + b]]; return v[0] * dx + v[1] * dz; };
      const n00 = g(xi, zi, xf, zf), n10 = g(xi + 1, zi, xf - 1, zf), n01 = g(xi, zi + 1, xf, zf - 1), n11 = g(xi + 1, zi + 1, xf - 1, zf - 1), u = fade(xf), w = fade(zf);
      return ((n00 * (1 - u) + n10 * u) * (1 - w) + (n01 * (1 - u) + n11 * u) * w) * 1.42; };
    const fbm = (x, z, oc) => { let v = 0, a = 1, f = 1, t = 0; for (let k = 0; k < oc; k++) { v += noise(x * f + k * 17.3, z * f - k * 9.1) * a; t += a; a *= 0.5; f *= 2.03; } return v / t; };
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const big = this.reef ? 0.6 : 1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = o + i * C, z = o + j * C;
      let v = 7 + 12 * big * fbm(x / 230, z / 230, 3) + 3.2 * noise(x / 52 + 11, z / 52 - 7);
      const r = 1 - Math.abs(noise(x / 270 + 40, z / 270 + 3)); v += 17 * big * Math.pow(Math.max(0, r - 0.6) / 0.4, 2);         // ridge lines
      const d = Math.min(H - Math.abs(x), H - Math.abs(z));
      h[j * N + i] = Math.max(0.3, v) * sm(-8, 95, d) + 0.12;                                                                      // down to the beach at the coast
    }
    this.T = { C, N, o, h };
    // flattened pads under everything built (largest first, so small ones inside big ones inherit the big pad's height)
    const rects = this.occupied.map(r => [r[0], r[1], r[2], r[3]]).concat(this.buildings.map(B => [B.x0 - 2, B.z0 - 2, B.x1 + 2, B.z1 + 2]));
    for (const p of this.pois || []) rects.push([p.x - 40, p.z - 40, p.x + 40, p.z + 40]);
    rects.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
    for (const [x0, z0, x1, z1] of rects) {
      const m = Math.max(3, Math.min(14, Math.min(x1 - x0, z1 - z0) * 0.6)), ph = (this.heightAt((x0 + x1) / 2, (z0 + z1) / 2) * 2 + this.heightAt(x0, z0) + this.heightAt(x1, z0) + this.heightAt(x0, z1) + this.heightAt(x1, z1)) / 6;
      const i0 = Math.max(0, Math.floor((x0 - m - o) / C)), i1 = Math.min(N - 1, Math.ceil((x1 + m - o) / C)), j0 = Math.max(0, Math.floor((z0 - m - o) / C)), j1 = Math.min(N - 1, Math.ceil((z1 + m - o) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = o + i * C, z = o + j * C, dd = Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, z0 - z, z - z1));
        const w = dd <= 0 ? 1 : 1 - sm(0, m, dd); if (w > 0) h[j * N + i] += (ph - h[j * N + i]) * w; }
    }
    // cap the slope so every hill can be climbed on foot (and bots never get stuck): relax neighbours that differ too much
    const maxD = C * 0.6;
    for (let it = 0; it < 6; it++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i;
      if (i + 1 < N) { const d = h[k + 1] - h[k]; if (Math.abs(d) > maxD) { const e = (Math.abs(d) - maxD) / 2 * Math.sign(d); h[k] += e; h[k + 1] -= e; } }
      if (j + 1 < N) { const d = h[k + N] - h[k]; if (Math.abs(d) > maxD) { const e = (Math.abs(d) - maxD) / 2 * Math.sign(d); h[k] += e; h[k + N] -= e; } } }
    // re-flatten the pads exactly (the slope pass may have nudged their rims)
    for (const [x0, z0, x1, z1] of rects) { const ph = this.heightAt((x0 + x1) / 2, (z0 + z1) / 2);
      const i0 = Math.max(0, Math.ceil((x0 - o) / C)), i1 = Math.min(N - 1, Math.floor((x1 - o) / C)), j0 = Math.max(0, Math.ceil((z0 - o) / C)), j1 = Math.min(N - 1, Math.floor((z1 - o) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) h[j * N + i] = ph; }
    let mx = 0; for (let k = 0; k < h.length; k++) if (h[k] > mx) mx = h[k]; this.T.max = mx;
    // lift the world onto the ground
    const at = (x, z) => this.heightAt(x, z);
    // each box sits at the LOWEST ground under it (structures are on flat pads, so that's their pad; a loose crate or rock on a
    // slope sinks a little into the uphill side instead of floating over the downhill one)
    const lo = b => Math.min(at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), at(b.x0, b.z0), at(b.x1, b.z0), at(b.x0, b.z1), at(b.x1, b.z1));
    // boxes that touch (stacked containers, a tower's legs + deck, a wall and its coping) form one cluster and move as one:
    // the whole cluster sits at the lowest ground under any of its parts, so nothing comes apart on a slope
    const B = this.boxes.filter(b => b.tag !== 'edge'), par = new Map(), find = b => { let r = b; while (par.get(r) !== r) r = par.get(r); let c = b; while (par.get(c) !== r) { const n = par.get(c); par.set(c, r); c = n; } return r; };
    for (const b of B) par.set(b, b);
    const e = 0.06, tmp = [];
    for (const b of B) { this.query(b.x0 - e, b.y0 - e, b.z0 - e, b.x1 + e, b.y1 + e, b.z1 + e, tmp); for (const o of tmp) if (o !== b && !o.ground && o.tag !== 'edge' && par.has(o)) { const ra = find(b), rb = find(o); if (ra !== rb) par.set(ra, rb); } }
    const lift = new Map(); for (const b of B) { const r = find(b), y = lo(b); lift.set(r, Math.min(lift.has(r) ? lift.get(r) : Infinity, y)); }
    const decorLift = d => { this.query(d.x0 - e, d.y0 - e, d.z0 - e, d.x1 + e, d.y1 + e, d.z1 + e, tmp); for (const o of tmp) if (!o.ground && par.has(o)) return lift.get(find(o)); return lo(d); };
    const dl = this.decor.map(decorLift);                        // (measured before any box moves)
    for (const b of B) { const y = lift.get(find(b)); b.y0 += y; b.y1 += y; }
    this.decor.forEach((d, i) => { d.y0 += dl[i]; d.y1 += dl[i]; });
    for (const q of this.lootSpots.concat(this.chestSpots)) q.y += at(q.x, q.z);
    for (const t of this.trees) t.y = at(t.x, t.z);
    for (const B of this.buildings) B.base = at((B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2);
    for (const q of (this.props.cars || []).concat(this.props.ponds || [])) q.y = at(q.x, q.z);
    for (const p of this.pois || []) p.y = at(p.x, p.z);
    // (this.containers holds the same box objects as this.boxes: already lifted)
  }
  // first terrain hit along a ray (march + refine), or Infinity
  rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    const T = this.T; if (!T || (oy > T.max + 0.5 && dy >= 0)) return Infinity;
    let prev = 0, step = 2.2;
    if (oy - this.heightAt(ox, oz) < 0) return 0;
    for (let t = step; t <= maxT + step; t += step) {
      const tt = Math.min(t, maxT), y = oy + dy * tt;
      if (y <= this.heightAt(ox + dx * tt, oz + dz * tt)) { let a = prev, b = tt; for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (oy + dy * m <= this.heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m; } return b; }
      if (y > T.max + 0.5 && dy >= 0) return Infinity;
      prev = tt; if (tt >= maxT) break;
    }
    return Infinity;
  }

  // ------------------------------------------------------------- generation
  free(x0, z0, x1, z1, pad) {
    if (x0 < -this.half + 6 || z0 < -this.half + 6 || x1 > this.half - 6 || z1 > this.half - 6) return false;
    for (const o of this.occupied)
      if (x0 - pad < o[2] && x1 + pad > o[0] && z0 - pad < o[3] && z1 + pad > o[1]) return false;
    return true;
  }
  claim(x0, z0, x1, z1) { this.occupied.push([x0, z0, x1, z1]); }
  // No solid box and no loot/chest spot in this footprint (for props inside built-up areas)
  clear(x0, z0, x1, z1, pad) {
    pad = pad || 0;
    if (x0 < -this.half + 6 || z0 < -this.half + 6 || x1 > this.half - 6 || z1 > this.half - 6) return false;
    if (this.query(x0 - pad, 0.02, z0 - pad, x1 + pad, 40, z1 + pad, this._clr || (this._clr = [])).length) return false;
    const near = q => q.x > x0 - pad - 1.2 && q.x < x1 + pad + 1.2 && q.z > z0 - pad - 1.2 && q.z < z1 + pad + 1.2 && q.y < 0.5;
    return !this.lootSpots.some(near) && !this.chestSpots.some(near);
  }

  generate() {
    const R = this.rand, U = BR.util, H = this.half;
    const A = (this.size / 640) * (this.size / 640);   // feature counts scale with map area
    const N = n => Math.round(n * A);

    // Boundary walls
    const bw = 6, bh = 26;
    // invisible boundary (the island's shore + the storm keep you in; no box walls)
    const eh = 80;
    this.addBox(-H - bw, 0, -H - bw, H + bw, eh, -H, PAL.cliff, { tag: 'edge', hidden: true });
    this.addBox(-H - bw, 0, H, H + bw, eh, H + bw, PAL.cliff, { tag: 'edge', hidden: true });
    this.addBox(-H - bw, 0, -H, -H, eh, H, PAL.cliff, { tag: 'edge', hidden: true });
    this.addBox(H, 0, -H, H + bw, eh, H, PAL.cliff, { tag: 'edge', hidden: true });

    // Named points of interest, spread across the map. Each has a type that
    // decides what gets built there.
    const NAMES = ['Relay Spire', 'Rust Basin', 'Dustwater', 'Hollow Yards', 'Cinder Flats', 'Skyhook',
      'Gravel Point', 'Ironbark', 'Saltmarsh', 'Bastion', 'Lowtide', 'Overpass', 'Redline', 'Kestrel Ridge'];
    const TYPES = ['town', 'military', 'town', 'farm', 'yard', 'town', 'relay', 'military', 'town', 'outpost', 'farm', 'town', 'yard', 'town'];     // v1.35: + military base, farm
    const pois = [];
    for (let tries = 0; pois.length < Math.min(14, Math.round(12 * Math.sqrt(A))) && tries < 3000; tries++) {
      const px = U.rand(R, -H + 60, H - 60), pz = U.rand(R, -H + 60, H - 60);
      if (pois.every(t => Math.hypot(t.x - px, t.z - pz) > 125)) pois.push({ x: px, z: pz });
    }
    const names = NAMES.slice().sort(() => R() - 0.5);
    pois.forEach((p, i) => { p.name = names[i]; p.type = TYPES[i % TYPES.length]; });
    this.pois = pois;
    this.towns = pois;  // bots drop toward these; roads link them
    for (const p of pois) {
      if (p.type === 'town') this.town(p.x, p.z);
      else if (p.type === 'yard') this.yard(p.x, p.z);
      else if (p.type === 'outpost') this.outpost(p.x, p.z);
      else if (p.type === 'military') this.military(p.x, p.z);
      else if (p.type === 'farm') this.farm(p.x, p.z);
      else this.relay(p.x, p.z);
    }

    // Long rock ridges carve the map into regions (with gaps to run through)
    if (!this.terrainOn) for (let i = 0; i < N(7); i++) this.ridge();

    // Landmarks
    for (let i = 0; i < N(4); i++) this.placeRandom(34, 34, (x, z) => this.mesa(x, z));
    for (let i = 0; i < N(6); i++) this.placeRandom(14, 14, (x, z) => this.tower(x, z));
    for (let i = 0; i < N(14); i++) this.placeRandom(18, 18, (x, z) => this.wallRunLane(x, z));
    // Movement playgrounds
    for (let i = 0; i < N(10); i++) this.placeRandom(34, 34, (x, z) => this.parkourCourse(x, z));
    for (let i = 0; i < N(6); i++) this.placeRandom(18, 18, (x, z) => this.pillarMaze(x, z));
    for (let i = 0; i < N(60); i++) this.placeRandom(4, 4, (x, z) => this.jumpPad(x, z));

    // Ponds (before the scatter so they find room; visual water, walkable)
    for (let i = 0; i < N(10); i++) this.placeRandom(22, 22, (x, z) => this.props.ponds.push({ x, z, r: 5 + R() * 4 }));

    // Scatter
    for (let i = 0; i < N(70); i++) this.placeRandom(8, 8, (x, z) => this.container(x, z));
    for (let i = 0; i < N(140); i++) this.placeRandom(5, 5, (x, z) => this.crateStack(x, z));
    for (let i = 0; i < N(160); i++) this.placeRandom(7, 7, (x, z) => this.rock(x, z));
    for (let i = 0; i < N(120); i++) this.placeRandom(7, 7, (x, z) => this.coverWall(x, z));
    for (let i = 0; i < N(520); i++) this.placeRandom(2, 2, (x, z) => this.tree(x, z));
    for (let i = 0; i < N(50); i++) this.placeRandom(12, 3, (x, z) => this.fence(x, z));

    // Visual dressing (own RNG so it never changes the gameplay layout)
    this.dress();

    // Open-field loot so nobody is empty-handed for long
    for (let i = 0; i < N(220); i++) {
      const x = U.rand(R, -H + 10, H - 10), z = U.rand(R, -H + 10, H - 10);
      if (this.free(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.5)) this.lootSpots.push({ x, y: 0, z, tier: 0 });
    }
  }

  // ---------------------------------------------------------------- dressing
  // Visual detail layered on top of the gameplay layout: window + door frames,
  // shutters, awnings, signs, rooftop AC units, pipes, sidewalks, parked cars,
  // power lines, street furniture, container ribs, barrels, pallets, logs,
  // stumps, mossy rocks, ponds. Mostly decor boxes (merged into the one world
  // mesh, so they cost almost nothing); a few small solid props for cover.
  dress() {
    const R = BR.util.rng(this.seed + 911), U = BR.util;
    const D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    const F = (x0, y0, z0, x1, y1, z1, c) => { const b = D(x0, y0, z0, x1, y1, z1, c); if (b) b.fine = true; return b; };   // skipped on Low graphics
    const pick = a => a[Math.floor(R() * a.length)];
    const SHUT = [0x4f6b52, 0x3f5f7a, 0x8a4a3c, 0x6b5a8a, 0x2f4f4f];
    const AWN = [[0xc8463c, 0xf0e6d6], [0x2f6fa8, 0xf0e6d6], [0x3f8a5a, 0xf0e6d6], [0xd99a2b, 0x3a3a3a]];
    const SIGN = [0xd94f3c, 0x2f7fc8, 0xf2b234, 0x3caa6a, 0x8a4ad9];
    const FRAME = 0xeee6d6, GLASS = 0x34465a, METAL = 0x6c737c, DARK = 0x2a2d33;

    for (const B of this.buildings) {
      const { x0, x1, z0, z1, H, fh } = B;
      // wall element helper: a = along-wall range, y range, out = [inner, outer] offset from the face
      for (const W of B.walls) {
        const n = W.si === 0 || W.si === 2 ? -1 : 1;
        const face = W.si === 0 ? z0 : W.si === 1 ? z1 : W.si === 2 ? x0 : x1;
        const E = (a0, a1, y0, y1, o0, o1, c, fine) => {
          const c0 = face + n * o0, c1 = face + n * o1, f = fine ? F : D;
          if (W.axis === 'x') f(a0, y0, c0, a1, y1, c1, c); else f(c0, y0, a0, c1, y1, a1, c);
        };
        const shut = pick(SHUT), boxes = R() < 0.35;
        W.cols.forEach((col, ci) => {
          for (const [g0, g1] of col.gaps) {
            const a = col.a, b = col.b, door = g0 < 0.05;
            E(a - 0.1, a, g0, g1 + 0.1, -0.02, 0.09, FRAME);            // jambs
            E(b, b + 0.1, g0, g1 + 0.1, -0.02, 0.09, FRAME);
            E(a - 0.14, b + 0.14, g1, g1 + 0.14, -0.02, 0.12, FRAME);   // lintel
            if (door) {
              E(a - 0.3, b + 0.3, 0, 0.12, 0, 0.7, 0xb5ada0);            // door step
              // striped awning over the door
              const [c1, c2] = pick(AWN), wa = b - a + 0.8, k = 5;
              for (let i = 0; i < k; i++) E(a - 0.4 + wa * i / k, a - 0.4 + wa * (i + 1) / k, g1 + 0.3, g1 + 0.38, 0.05, 0.95, i % 2 ? c2 : c1);
              E(a - 0.4, b + 0.4, g1 + 0.18, g1 + 0.3, 0.9, 0.95, c1);  // valance
              if (R() < 0.6) {                                          // shop sign above
                const sc = pick(SIGN);
                E(a - 0.6, b + 0.6, g1 + 0.6, g1 + 1.15, 0.0, 0.08, DARK);
                E(a - 0.5, b + 0.5, g1 + 0.67, g1 + 1.08, 0.08, 0.1, sc);
              }
            } else {
              E(a - 0.18, b + 0.18, g0 - 0.12, g0, -0.02, 0.2, FRAME);   // sill
              E(a + (b - a) / 2 - 0.03, a + (b - a) / 2 + 0.03, g0, g1, -0.02, 0.04, FRAME);   // mullion
              if (boxes && R() < 0.7) {                                  // flower box
                E(a - 0.05, b + 0.05, g0 - 0.38, g0 - 0.12, 0.05, 0.32, 0x7a5236);
                for (let i = 0; i < 4; i++) { const fx = a + (b - a) * (i + 0.5) / 4; E(fx - 0.09, fx + 0.09, g0 - 0.12, g0 + 0.06, 0.1, 0.27, pick([0xe0546a, 0xf2d24a, 0xf4f4f4, 0x9a6ad9, 0x5aa04a]), true); }
              }
              if (R() < 0.55) {                                          // shutters
                E(a - 0.72, a - 0.12, g0 - 0.05, g1 + 0.05, 0.02, 0.07, shut);
                E(b + 0.12, b + 0.72, g0 - 0.05, g1 + 0.05, 0.02, 0.07, shut);
                for (const yy of [g0 + 0.3, g0 + 0.65, g0 + 1.0]) {      // louvre lines
                  E(a - 0.68, a - 0.16, yy, yy + 0.04, 0.07, 0.085, 0x1a1a1a, true);
                  E(b + 0.16, b + 0.68, yy, yy + 0.04, 0.07, 0.085, 0x1a1a1a, true);
                }
              }
            }
          }
        });
        // drain pipe on one end of each wall
        const len = W.axis === 'x' ? [x0, x1] : [z0, z1], pa = R() < 0.5 ? len[0] + 0.35 : len[1] - 0.5;
        E(pa, pa + 0.14, 0, H + 0.3, 0.02, 0.16, METAL);
        E(pa - 0.05, pa + 0.19, H + 0.15, H + 0.32, 0.02, 0.24, METAL);
      }
      // rooftop: AC units (solid, low cover), vent stacks, satellite dish, antenna
      const ry = H + 0.3, nAC = 1 + Math.floor(R() * 2);
      for (let i = 0; i < nAC; i++) {
        const ax = i === 0 ? x0 + 1.4 : x1 - 1.4, az = i === 0 ? z1 - 1.4 : z0 + 1.4;
        this.addBox(ax - 0.55, ry, az - 0.45, ax + 0.55, ry + 0.75, az + 0.45, 0xbfc3c4);
        D(ax - 0.35, ry + 0.75, az - 0.35, ax + 0.35, ry + 0.79, az + 0.35, DARK);      // fan grille
        D(ax - 0.57, ry + 0.1, az - 0.47, ax + 0.57, ry + 0.16, az + 0.47, 0x9a9e9f);   // panel line
        D(ax - 0.57, ry + 0.4, az - 0.47, ax + 0.57, ry + 0.46, az + 0.47, 0x9a9e9f);
      }
      for (let i = 0; i < 2; i++) {
        const vx = U.lerp(x0 + 1, x1 - 1, R()), vz = U.lerp(z0 + 1, z1 - 1, R());
        if (Math.abs(vx - B.cx) < 2.5 && Math.abs(vz - B.cz) < 2.5) continue;
        D(vx - 0.1, ry, vz - 0.1, vx + 0.1, ry + 0.9, vz + 0.1, METAL);
        D(vx - 0.16, ry + 0.9, vz - 0.16, vx + 0.16, ry + 0.98, vz + 0.16, DARK);
      }
      if (R() < 0.5) {   // antenna
        const ax = x0 + 0.8, az = z0 + 0.8;
        D(ax - 0.04, ry, az - 0.04, ax + 0.04, ry + 2.6, az + 0.04, METAL);
        for (const yy of [1.6, 2.0, 2.4]) D(ax - 0.5, ry + yy, az - 0.02, ax + 0.5, ry + yy + 0.04, az + 0.02, METAL);
      }
      // Interior: rug, table + chairs, shelf, baseboards and a ceiling light on every floor
      const rw = Math.min(x1 - x0, z1 - z0) * 0.22;
      D(B.cx - rw, 0.1, B.cz - rw * 0.7, B.cx + rw, 0.13, B.cz + rw * 0.7, pick([0x8a3a3a, 0x3a5a8a, 0x6a7a3a, 0x7a5a8a]));
      D(B.cx - rw + 0.15, 0.13, B.cz - rw * 0.7 + 0.15, B.cx + rw - 0.15, 0.135, B.cz + rw * 0.7 - 0.15, 0xd8c9a0);
      const tx = B.cx + (R() < 0.5 ? -1 : 1) * 2.4, tz = B.cz + (R() - 0.5) * 2;
      if (this.clear(tx - 0.9, tz - 0.6, tx + 0.9, tz + 0.6, 0.1)) {
        this.addBox(tx - 0.75, 0.1, tz - 0.45, tx + 0.75, 0.85, tz + 0.45, 0x7a5a3c);           // table (cover you can vault)
        D(tx - 0.8, 0.85, tz - 0.5, tx + 0.8, 0.9, tz + 0.5, 0x8f6a46);
        for (const sx of [-1, 1]) {                                                          // chairs
          D(tx + sx * 1.05 - 0.22, 0.1, tz - 0.22, tx + sx * 1.05 + 0.22, 0.55, tz + 0.22, 0x5a4230);
          D(tx + sx * 1.27 - 0.04, 0.55, tz - 0.22, tx + sx * 1.27 + 0.04, 1.1, tz + 0.22, 0x5a4230);
        }
      }
      const t = 0.3;
      for (let f = 0; f < B.floors; f++) {
        const fy = f === 0 ? 0.1 : f * fh;
        D(x0 + t, fy, z0 + t, x1 - t, fy + 0.12, z0 + t + 0.04, 0x4a4038);                  // baseboards
        D(x0 + t, fy, z1 - t - 0.04, x1 - t, fy + 0.12, z1 - t, 0x4a4038);
        D(x1 - t - 0.04, fy, z0 + t, x1 - t, fy + 0.12, z1 - t, 0x4a4038);
        const cy = (f + 1) * fh - (f + 1 < B.floors ? 0.25 : 0);                              // ceiling light
        D(B.cx - 0.4, cy - 0.08, B.cz - 0.4, B.cx + 0.4, cy, B.cz + 0.4, 0x3a3a3a);
        D(B.cx - 0.32, cy - 0.1, B.cz - 0.32, B.cx + 0.32, cy - 0.08, B.cz + 0.32, 0xfff0c0);
      }
      // shelf against the east wall
      const shz = B.cz + (R() < 0.5 ? -1.6 : 1.6), shx = x1 - t - 0.3;
      if (this.clear(shx - 0.3, shz - 0.8, shx + 0.3, shz + 0.8, 0)) {
        this.addBox(shx - 0.25, 0.1, shz - 0.75, shx + 0.25, 1.9, shz + 0.75, 0x6a4e34);
        for (const yy of [0.6, 1.1, 1.6]) for (let i = 0; i < 3; i++) if (R() < 0.7)
          F(shx - 0.3, yy, shz - 0.6 + i * 0.45, shx - 0.25, yy + 0.3, shz - 0.6 + i * 0.45 + 0.3, pick([0xc8463c, 0x3f78b5, 0xd9a441, 0x4f9a6a, 0xe8e4dc]));
      }
      // sidewalk all round
      D(x0 - 1.4, 0, z0 - 1.4, x1 + 1.4, 0.06, z1 + 1.4, 0xb4ada0);
      D(x0 - 1.5, 0, z0 - 1.5, x1 + 1.5, 0.1, z0 - 1.35, 0x9c958a);
      D(x0 - 1.5, 0, z1 + 1.35, x1 + 1.5, 0.1, z1 + 1.5, 0x9c958a);
      D(x0 - 1.5, 0, z0 - 1.5, x0 - 1.35, 0.1, z1 + 1.5, 0x9c958a);
      D(x1 + 1.35, 0, z0 - 1.5, x1 + 1.5, 0.1, z1 + 1.5, 0x9c958a);
      // street furniture beside the building
      if (R() < 0.6) this.bench(R() < 0.5 ? x0 - 1.0 : x1 + 1.0, U.lerp(z0 + 1.5, z1 - 1.5, R()), 'z');
      if (R() < 0.6) this.bin(U.lerp(x0 + 1, x1 - 1, R()), R() < 0.5 ? z0 - 0.9 : z1 + 0.9);
      if (R() < 0.3) this.hydrant(x1 + 1.0, z1 + 1.0);
    }

    // Towns: parked cars on the outskirts + power lines on poles round the block
    for (const T of this.pois.filter(p => p.type === 'town')) {
      for (let i = 0; i < 4; i++) {
        const side = Math.floor(R() * 4), off = 34 + R() * 8, along = (R() * 2 - 1) * 20;
        const x = T.x + (side === 0 ? -off : side === 1 ? off : along), z = T.z + (side === 2 ? -off : side === 3 ? off : along);
        this.car(x, z, side < 2 ? 'z' : 'x', pick([0xb8433f, 0x3f78b5, 0xe8e4dc, 0x2f3338, 0xd9a441, 0x4f9a6a]));
      }
      const P = 30, poles = [[-P, -P], [P, -P], [P, P], [-P, P]].map(([dx, dz]) => [T.x + dx, T.z + dz]);
      const ok = poles.every(([x, z]) => this.clear(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.3));
      if (ok) {
        for (const [x, z] of poles) {
          this.addBox(x - 0.14, 0, z - 0.14, x + 0.14, 7.2, z + 0.14, 0x6b4a2f);
          D(x - 0.9, 6.6, z - 0.08, x + 0.9, 6.75, z + 0.08, 0x6b4a2f); D(x - 0.08, 6.6, z - 0.9, x + 0.08, 6.75, z + 0.9, 0x6b4a2f);
          for (const [ix, iz] of [[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]]) D(x + ix - 0.05, 6.75, z + iz - 0.05, x + ix + 0.05, 6.9, z + iz + 0.05, 0xe0e8e8);
        }
        for (let i = 0; i < 4; i++) {
          const [ax, az] = poles[i], [bx, bz] = poles[(i + 1) % 4];
          for (const o of [-0.75, 0.75]) {
            if (Math.abs(az - bz) < 0.1) D(Math.min(ax, bx), 6.86, az + o - 0.02, Math.max(ax, bx), 6.89, az + o + 0.02, 0x1e1f22);
            else D(ax + o - 0.02, 6.86, Math.min(az, bz), ax + o + 0.02, 6.89, Math.max(az, bz), 0x1e1f22);
          }
        }
      }
    }

    // Containers: corrugation ribs, door bars, top rails
    for (const C of this.containers) {
      const along = C.x1 - C.x0 > C.z1 - C.z0, L = along ? C.x1 - C.x0 : C.z1 - C.z0;
      const dark = new THREE.Color(C.color).multiplyScalar(0.72).getHex();
      const ribs = Math.floor(L / 0.7);
      for (let i = 1; i < ribs; i++) {
        const a = (along ? C.x0 : C.z0) + i * L / ribs;
        if (along) { F(a - 0.06, C.y0 + 0.1, C.z0 - 0.05, a + 0.06, C.y1 - 0.1, C.z0, dark); F(a - 0.06, C.y0 + 0.1, C.z1, a + 0.06, C.y1 - 0.1, C.z1 + 0.05, dark); }
        else { F(C.x0 - 0.05, C.y0 + 0.1, a - 0.06, C.x0, C.y1 - 0.1, a + 0.06, dark); F(C.x1, C.y0 + 0.1, a - 0.06, C.x1 + 0.05, C.y1 - 0.1, a + 0.06, dark); }
      }
      // doors on one end: two vertical lock bars + hinge line
      const e = along ? C.x1 : C.z1, w0 = along ? C.z0 : C.x0, w1 = along ? C.z1 : C.x1, mid = (w0 + w1) / 2;
      for (const q of [mid - 0.45, mid - 0.15, mid + 0.15, mid + 0.45]) {
        if (along) D(e, C.y0 + 0.15, q - 0.03, e + 0.06, C.y1 - 0.15, q + 0.03, 0x8a8f94);
        else D(q - 0.03, C.y0 + 0.15, e, q + 0.03, C.y1 - 0.15, e + 0.06, 0x8a8f94);
      }
      if (along) D(e, C.y0 + 0.1, mid - 0.01, e + 0.03, C.y1 - 0.1, mid + 0.01, DARK); else D(mid - 0.01, C.y0 + 0.1, e, mid + 0.01, C.y1 - 0.1, e + 0.03, DARK);
    }

    // Container yards: barrels + pallets + a forklift
    for (const Y of this.pois.filter(p => p.type === 'yard')) {
      for (let i = 0; i < 5; i++) this.barrelCluster(Y.x + (R() * 2 - 1) * 24, Y.z + (R() * 2 - 1) * 24, R);
      for (let i = 0; i < 4; i++) this.pallet(Y.x + (R() * 2 - 1) * 22, Y.z + (R() * 2 - 1) * 22, R);
      this.forklift(Y.x + 7, Y.z + 3);
    }

    // Rocks: moss caps + loose boulders at the base
    for (const b of this.boxes) {
      if (b.color !== PAL.rock && b.color !== PAL.cliff) continue;
      if (b.tag === 'edge' || b.x1 - b.x0 > 40 || b.z1 - b.z0 > 40) continue;
      if (!b.hidden && R() < 0.55) D(b.x0 + 0.1, b.y1, b.z0 + 0.1, b.x1 - 0.1, b.y1 + 0.05, b.z1 - 0.1, R() < 0.5 ? 0x5f7f45 : 0x6d8a4c);
      const nb = 1 + Math.floor(R() * 3);
      for (let i = 0; i < nb; i++) {
        const side = Math.floor(R() * 4), sz = 0.25 + R() * 0.55;
        const x = side < 2 ? U.lerp(b.x0, b.x1, R()) : side === 2 ? b.x0 - sz * 0.6 : b.x1 + sz * 0.6;
        const z = side >= 2 ? U.lerp(b.z0, b.z1, R()) : side === 0 ? b.z0 - sz * 0.6 : b.z1 + sz * 0.6;
        this.props.boulders.push({ x, z, s: sz });
      }
    }

    // Open country: fallen logs, stumps, barrels, ponds
    for (let i = 0; i < 70; i++) this.placeRandom(6, 6, (x, z) => this.log(x, z, R));
    for (let i = 0; i < 90; i++) { const x = (R() * 2 - 1) * (this.half - 10), z = (R() * 2 - 1) * (this.half - 10); if (this.free(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.3)) this.props.stumps.push({ x, z, s: 0.25 + R() * 0.2, h: 0.3 + R() * 0.4 }); }
    for (let i = 0; i < 30; i++) this.placeRandom(4, 4, (x, z) => this.barrelCluster(x, z, R));
  }

  bench(x, z, axis) {
    const L = 1.8, a = axis === 'z';
    if (!(a ? this.clear(x - 0.3, z - 1, x + 0.3, z + 1) : this.clear(x - 1, z - 0.3, x + 1, z + 0.3))) return;
    const B = (dx0, y0, dz0, dx1, y1, dz1, c, solid) => a ? this.addBox(x + dx0, y0, z + dz0, x + dx1, y1, z + dz1, c, solid ? null : { decor: true }) : this.addBox(x + dz0, y0, z + dx0, x + dz1, y1, z + dx1, c, solid ? null : { decor: true });
    B(-0.25, 0, -L / 2, 0.25, 0.45, L / 2, 0x7a5236, true);
    B(-0.27, 0.45, -L / 2 - 0.05, 0.27, 0.5, L / 2 + 0.05, 0x8a6240);
    B(0.2, 0.5, -L / 2, 0.27, 0.95, L / 2, 0x8a6240);
    for (const s of [-L / 2 + 0.1, L / 2 - 0.2]) B(-0.27, 0, s, 0.27, 0.48, s + 0.1, 0x2a2d33);
  }
  bin(x, z) {
    if (!this.clear(x - 0.35, z - 0.35, x + 0.35, z + 0.35)) return;
    this.addBox(x - 0.28, 0, z - 0.28, x + 0.28, 0.9, z + 0.28, 0x3f6b4a);
    this.addBox(x - 0.32, 0.9, z - 0.32, x + 0.32, 0.98, z + 0.32, 0x2f5038, { decor: true });
  }
  hydrant(x, z) {
    if (!this.clear(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) return;
    this.addBox(x - 0.14, 0, z - 0.14, x + 0.14, 0.7, z + 0.14, 0xc8362c);
    this.addBox(x - 0.24, 0.42, z - 0.07, x + 0.24, 0.54, z + 0.07, 0xc8362c, { decor: true });
    this.addBox(x - 0.1, 0.7, z - 0.1, x + 0.1, 0.8, z + 0.1, 0xd9d9d9, { decor: true });
  }
  car(x, z, axis, color) {
    const L = 4.2, W = 1.9;
    const w = axis === 'x' ? L : W, d = axis === 'x' ? W : L;
    if (!this.clear(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0.8)) return;
    this.claim(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    // collision only (the car itself is a modelled mesh, see buildScenery / carGeometry)
    if (axis === 'x') { this.addBox(x - L / 2, 0.3, z - W / 2, x + L / 2, 1.0, z + W / 2, color, { hidden: true }); this.addBox(x - 0.9, 1.0, z - W / 2 + 0.12, x + 1.1, 1.55, z + W / 2 - 0.12, color, { hidden: true }); }
    else { this.addBox(x - W / 2, 0.3, z - L / 2, x + W / 2, 1.0, z + L / 2, color, { hidden: true }); this.addBox(x - W / 2 + 0.12, 1.0, z - 0.9, x + W / 2 - 0.12, 1.55, z + 1.1, color, { hidden: true }); }
    this.props.cars = this.props.cars || [];
    this.props.cars.push({ x, z, axis, color, flip: this.rand() < 0.5 });
  }
  barrelCluster(x, z, R) {
    const n = 1 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const bx = x + (i % 2) * 0.75 - 0.35, bz = z + Math.floor(i / 2) * 0.75 - 0.35;
      if (!this.clear(bx - 0.35, bz - 0.35, bx + 0.35, bz + 0.35, 0.1)) continue;
      this.addBox(bx - 0.32, 0, bz - 0.32, bx + 0.32, 1.0, bz + 0.32, 0, { hidden: true });
      this.props.barrels.push({ x: bx, z: bz, c: Math.floor(R() * 4), tip: R() < 0.08 });
    }
  }
  pallet(x, z, R) {
    if (!this.clear(x - 0.7, z - 0.6, x + 0.7, z + 0.6, 0.2)) return;
    const n = 1 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const y = k * 0.16;
      this.addBox(x - 0.6, y, z - 0.5, x + 0.6, y + 0.16, z + 0.5, 0x9a7a52, k === n - 1 ? null : { decor: true });
      for (const o of [-0.35, 0, 0.35]) this.addBox(x - 0.62, y + 0.05, z + o - 0.06, x + 0.62, y + 0.1, z + o + 0.06, 0x6f5538, { decor: true });
    }
    if (R() < 0.5) this.addBox(x - 0.5, n * 0.16, z - 0.4, x + 0.5, n * 0.16 + 0.7, z + 0.4, 0xa77b4f);   // load on top
  }
  forklift(x, z) {
    if (!this.clear(x - 1.2, z - 2.6, x + 1.2, z + 2, 0.3)) return;
    this.addBox(x - 0.7, 0.25, z - 1.1, x + 0.7, 1.3, z + 0.9, 0xe0a32a);
    this.addBox(x - 0.7, 1.3, z - 0.8, x + 0.7, 1.36, z + 0.4, 0x2a2d33, { decor: true });
    for (const sx of [-0.65, 0.6]) this.addBox(x + sx, 1.3, z + 0.3, x + sx + 0.05, 2.3, z + 0.36, 0x2a2d33, { decor: true });
    for (const sx of [-0.65, 0.6]) this.addBox(x + sx, 1.3, z - 0.8, x + sx + 0.05, 2.3, z - 0.74, 0x2a2d33, { decor: true });
    this.addBox(x - 0.7, 2.3, z - 0.8, x + 0.7, 2.36, z + 0.36, 0x2a2d33, { decor: true });
    this.addBox(x - 0.55, 0.1, z - 1.6, x + 0.55, 2.6, z - 1.45, 0x3a3d42);    // mast
    for (const sx of [-0.4, 0.3]) this.addBox(x + sx, 0.08, z - 2.5, x + sx + 0.12, 0.16, z - 1.45, 0x6c737c, { decor: true }); // forks
    for (const a of [-0.8, 0.6]) for (const sx of [-0.78, 0.5]) this.addBox(x + sx, 0, z + a - 0.3, x + sx + 0.28, 0.6, z + a + 0.3, 0x18191b, { decor: true });
  }
  log(x, z, R) {
    const L = 3 + R() * 2.5, r = 0.28 + R() * 0.15, alongX = R() < 0.5;
    if (alongX) this.addBox(x - L / 2, 0, z - r, x + L / 2, r * 2, z + r, 0, { hidden: true });
    else this.addBox(x - r, 0, z - L / 2, x + r, r * 2, z + L / 2, 0, { hidden: true });
    this.props.logs.push({ x, z, L, r, alongX });
  }

  // Which named place is this point in (or nearest to, within 70 m)?
  poiAt(x, z) {
    let best = null, bd = 70;
    for (const p of this.pois || []) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // Container yard: stacked containers in rows, a crane with loot on its arm.
  yard(cx, cz) {
    const R = this.rand, U = BR.util;
    const W = 56;
    if (!this.free(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2, 4)) return;
    this.claim(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const x = cx + i * 16, z = cz + j * 16, along = (i + j) % 2 === 0;
      const stack = 1 + Math.floor(R() * 3);
      for (let k = 0; k < stack; k++) {
        const c = U.pick(PAL.containers, R), y = k * 2.6, inset = k * 0.6;
        if (along) this.addBox(x - 6 + inset, y, z - 1.25, x + 6 - inset, y + 2.6, z + 1.25, c);
        else this.addBox(x - 1.25, y, z - 6 + inset, x + 1.25, y + 2.6, z + 6 - inset, c);
        this.containers.push(this.boxes[this.boxes.length - 1]);
      }
      this.lootSpots.push({ x: x + (along ? 0 : 2.4), y: 0, z: z + (along ? 2.4 : 0), tier: 1, force: R() < 0.5 ? 'weapon' : undefined });
      if (stack >= 2) this.lootSpots.push({ x, y: stack * 2.6, z, tier: 2 });
    }
    // Crane: tower + long arm, chest at the end of the arm
    this.addBox(cx - 1.6, 0, cz - 1.6, cx + 1.6, 18, cz + 1.6, PAL.parkour);
    this.addBox(cx - 1.6, 18, cz - 1.2, cx + 16, 19, cz + 1.2, PAL.parkour);
    this.addBox(cx + 14, 6, cz - 0.15, cx + 14.3, 18, cz + 0.15, PAL.lamp);           // cable (grapple it)
    this.addBox(cx + 12.5, 19, cz - 1.2, cx + 16, 19.4, cz + 1.2, PAL.parkourAlt);
    this.chestSpots.push({ x: cx + 14.5, y: 19.4, z: cz, tier: 2 });
    for (let k = 0; k < 4; k++) this.addBox(cx - 2.6, k * 4.5 + 3.8, cz - 1, cx - 1.6, k * 4.5 + 4.1, cz + 1, PAL.cover); // ladder ledges
    this.jumpPad(cx - 4.5, cz + 6); this.jumpPad(cx + 6, cz - 6);
    this.lampPost(cx - W / 2 + 1, cz - W / 2 + 1); this.lampPost(cx + W / 2 - 1, cz + W / 2 - 1);
  }

  // Outpost: a big raised plateau with ramps of steps, a watchtower and loot on top.
  outpost(cx, cz) {
    const W = 44, Hh = 7;
    if (!this.free(cx - W / 2 - 10, cz - W / 2 - 10, cx + W / 2 + 10, cz + W / 2 + 10, 4)) return;
    this.claim(cx - W / 2 - 10, cz - W / 2 - 10, cx + W / 2 + 10, cz + W / 2 + 10);
    this.props.rockSkirt = this.props.rockSkirt || [];
    this.props.rockSkirt.push(this.addBox(cx - W / 2, 0, cz - W / 2, cx + W / 2, Hh, cz + W / 2, PAL.cliff));
    // Two stairways (0.5 m steps) on opposite sides
    for (let i = 0; i < 14; i++) {
      const y = (i + 1) * 0.5, off = W / 2 + 14 - i;
      this.addBox(cx - 2.5, 0, cz - off, cx + 2.5, y, cz - off + 1, PAL.cover);
      this.addBox(cx - 2.5, 0, cz + off - 1, cx + 2.5, y, cz + off, PAL.cover);
    }
    this.addBox(cx - 2, Hh, cz - 2, cx + 2, Hh + 9, cz + 2, PAL.tower);            // watchtower
    this.addBox(cx - 3.5, Hh + 9, cz - 3.5, cx + 3.5, Hh + 9.4, cz + 3.5, PAL.tower);
    this.chestSpots.push({ x: cx, y: Hh + 9.4, z: cz, tier: 2 });
    const R = this.rand;
    for (let i = 0; i < 8; i++) {
      const x = cx + BR.util.rand(R, -W / 2 + 4, W / 2 - 4), z = cz + BR.util.rand(R, -W / 2 + 4, W / 2 - 4);
      if (Math.abs(x - cx) < 5 && Math.abs(z - cz) < 5) continue;
      const L = 4, T = 0.6;
      if (i % 2) this.addBox(x - L / 2, Hh, z - T / 2, x + L / 2, Hh + 1.4, z + T / 2, PAL.cover);
      else this.addBox(x - T / 2, Hh, z - L / 2, x + T / 2, Hh + 1.4, z + L / 2, PAL.cover);
      this.lootSpots.push({ x: x + 1.5, y: Hh, z: z + 1.5, tier: 1, force: i < 3 ? 'weapon' : undefined });
    }
    this.jumpPad(cx + W / 2 + 4, cz); this.jumpPad(cx - W / 2 - 4, cz);
  }

  // v1.35 MILITARY BASE: a walled compound (gates on all four sides), corner watchtowers you can climb with chests on top,
  // barracks, a two-storey command post, an open hangar with a jeep, a helipad, fuel tanks, sandbags and concrete barriers.
  military(cx, cz) {
    const W = 66, WH = 3.6, t = 0.6, B = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c), D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    if (!this.free(cx - W / 2 - 8, cz - W / 2 - 8, cx + W / 2 + 8, cz + W / 2 + 8, 4)) { this.outpost(cx, cz); return; }
    this.claim(cx - W / 2 - 8, cz - W / 2 - 8, cx + W / 2 + 8, cz + W / 2 + 8);
    const CON = 0x8d8a82, OD = 0x55603f, STEEL = PAL.tower, R = this.rand;
    D(cx - W / 2, 0, cz - W / 2, cx + W / 2, 0.05, cz + W / 2, 0x77746c);                                                   // concrete yard
    const h = W / 2, g = 4;                                                                                                   // walls with a gate in the middle of each side
    for (const s of [-1, 1]) {
      B(cx - h, 0, cz + s * h - t / 2, cx - g, WH, cz + s * h + t / 2, CON); B(cx + g, 0, cz + s * h - t / 2, cx + h, WH, cz + s * h + t / 2, CON);
      B(cx + s * h - t / 2, 0, cz - h, cx + s * h + t / 2, WH, cz - g, CON); B(cx + s * h - t / 2, 0, cz + g, cx + s * h + t / 2, WH, cz + h, CON);
      for (let x = -h; x <= h; x += 3) { D(cx + x - 0.04, WH, cz + s * h - 0.04, cx + x + 0.04, WH + 0.7, cz + s * h + 0.04, 0x2a2d33); D(cx + s * h - 0.04, WH, cz + x - 0.04, cx + s * h + 0.04, WH + 0.7, cz + x + 0.04, 0x2a2d33); }   // wire posts
      D(cx - h, WH + 0.5, cz + s * h - 0.02, cx + h, WH + 0.55, cz + s * h + 0.02, 0x2a2d33); D(cx + s * h - 0.02, WH + 0.5, cz - h, cx + s * h + 0.02, WH + 0.55, cz + h, 0x2a2d33);
    }
    const tower = (x, z) => { const th = 7;
      for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) B(x + a - 0.15, 0, z + b - 0.15, x + a + 0.15, th, z + b + 0.15, STEEL);
      B(x - 2.2, th, z - 2.2, x + 2.2, th + 0.3, z + 2.2, OD);
      for (const [a, b, c, d] of [[-2.2, -2.2, 2.2, -2], [-2.2, 2, 2.2, 2.2], [-2.2, -2.2, -2, 2.2], [2, -2.2, 2.2, 2.2]]) B(x + a, th + 0.3, z + b, x + c, th + 1.3, z + d, OD);
      D(x - 2.5, th + 3, z - 2.5, x + 2.5, th + 3.3, z + 2.5, 0x3a3d42); for (const [a, b] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) D(x + a - 0.07, th + 1.3, z + b - 0.07, x + a + 0.07, th + 3, z + b + 0.07, 0x3a3d42);
      for (let i = 0; i < 8; i++) { const y = (i + 1) * 0.85; B(x - 0.6, y - 0.2, z + 1.8, x + 0.6, y, z + 2.6, PAL.parkour); }       // rungs
      this.chestSpots.push({ x, y: th + 0.3, z, tier: 2 });
    };
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower(cx + a * (h - 3.5), cz + b * (h - 3.5));
    // barracks + command post (real buildings: doors, floors, loot)
    this.building(cx - 17, cz - 15, 16, 9, 1); this.building(cx - 17, cz + 15, 16, 9, 1); this.building(cx + 16, cz + 16, 12, 12, 2);
    // hangar: open-fronted shed with a roof, a jeep and loot inside
    const hx = cx + 15, hz = cz - 14, hw = 20, hd = 14, hh = 7;
    B(hx - hw / 2, 0, hz - hd / 2, hx + hw / 2, hh, hz - hd / 2 + 0.4, OD); B(hx - hw / 2, 0, hz - hd / 2, hx - hw / 2 + 0.4, hh, hz + hd / 2, OD); B(hx + hw / 2 - 0.4, 0, hz - hd / 2, hx + hw / 2, hh, hz + hd / 2, OD);
    B(hx - hw / 2 - 0.4, hh, hz - hd / 2 - 0.4, hx + hw / 2 + 0.4, hh + 0.4, hz + hd / 2 + 0.4, 0x4a4f42);
    for (let i = 0; i < 4; i++) D(hx - hw / 2 + 2 + i * 5.3, hh - 0.6, hz - hd / 2 + 0.4, hx - hw / 2 + 2.4 + i * 5.3, hh, hz + hd / 2, 0x3a3d42);   // roof beams
    this.car(hx - 3, hz, 'z', 0x55603f);
    for (const [lx, lz] of [[hx + 5, hz - 3], [hx + 5, hz + 3], [hx - 6, hz - 4]]) this.lootSpots.push({ x: lx, y: 0, z: lz, tier: 2, force: 'weapon' });
    // helipad, fuel tanks, sandbags, barriers
    D(cx - 6, 0.05, cz - 6, cx + 6, 0.08, cz + 6, 0x3c3f44); D(cx - 3, 0.08, cz - 3.2, cx - 2, 0.1, cz + 3.2, 0xf2f2f2); D(cx + 2, 0.08, cz - 3.2, cx + 3, 0.1, cz + 3.2, 0xf2f2f2); D(cx - 2, 0.08, cz - 0.5, cx + 2, 0.1, cz + 0.5, 0xf2f2f2);
    this.chestSpots.push({ x: cx, y: 0.1, z: cz, tier: 3 });
    for (let i = 0; i < 3; i++) { const fx = cx - 26 + i * 4.2, fz = cz - 1; B(fx - 1.6, 0, fz - 1.6, fx + 1.6, 3.2, fz + 1.6, 0xc8c2b4); D(fx - 1.7, 3.2, fz - 1.7, fx + 1.7, 3.4, fz + 1.7, 0x8a8478); }
    const bag = (x, z, alongX) => { const L = 3.6; if (alongX) B(x - L / 2, 0, z - 0.45, x + L / 2, 1.1, z + 0.45, 0x8a7a5a); else B(x - 0.45, 0, z - L / 2, x + 0.45, 1.1, z + L / 2, 0x8a7a5a); };
    bag(cx, cz - h + 6, true); bag(cx, cz + h - 6, true); bag(cx - h + 6, cz, false); bag(cx + h - 6, cz, false); bag(cx - 6, cz + 9, true); bag(cx + 7, cz - 4, false);
    for (let i = 0; i < 6; i++) { const x = cx + BR.util.rand(R, -h + 6, h - 6), z = cz + BR.util.rand(R, -h + 6, h - 6); if (Math.abs(x - cx) < 8 && Math.abs(z - cz) < 8) continue; B(x - 1.2, 0, z - 0.3, x + 1.2, 1.0, z + 0.3, CON); this.lootSpots.push({ x: x + 1.6, y: 0, z, tier: 1 }); }
  }
  // v1.35 FARM: a big barn with a climbable hay loft (chest up there), a silo, a farmhouse, a water tower, fenced crop fields,
  // hay bales for cover and a tractor
  farm(cx, cz) {
    const W = 74, B = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c), D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    if (!this.free(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2, 4)) { this.town(cx, cz); return; }
    this.claim(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2);
    const RED = 0x9a3a2e, WHITE = 0xe8e2d4, WOOD = 0x7a5a3a, R = this.rand;
    // barn (open doorways front + back, loft floor with a ladder, stepped gable roof)
    const bx = cx - 12, bz = cz - 8, bw = 16, bd = 22, bh = 6.5, t = 0.3;
    B(bx - bw / 2, 0, bz - bd / 2, bx + bw / 2, 0.1, bz + bd / 2, 0x6a5a44);
    B(bx - bw / 2, 0, bz - bd / 2, bx - bw / 2 + t, bh, bz + bd / 2, RED); B(bx + bw / 2 - t, 0, bz - bd / 2, bx + bw / 2, bh, bz + bd / 2, RED);
    for (const s of [-1, 1]) { const z = bz + s * (bd / 2 - t / 2); B(bx - bw / 2, 0, z - t / 2, bx - 2.5, bh, z + t / 2, RED); B(bx + 2.5, 0, z - t / 2, bx + bw / 2, bh, z + t / 2, RED); B(bx - 2.5, 3.6, z - t / 2, bx + 2.5, bh, z + t / 2, RED);
      D(bx - 2.5, 0, z - t / 2 - 0.05 * s, bx - 2.3, 3.6, z + t / 2 + 0.05 * s, WHITE); D(bx + 2.3, 0, z - t / 2 - 0.05 * s, bx + 2.5, 3.6, z + t / 2 + 0.05 * s, WHITE); D(bx - 2.5, 3.4, z - t / 2 - 0.05 * s, bx + 2.5, 3.6, z + t / 2 + 0.05 * s, WHITE);
      D(bx - 2.3, 0.2, z - 0.02 * s, bx + 2.3, 3.4, z + 0.02 * s + (s > 0 ? 0.01 : -0.01), 0x7a2a22); }
    B(bx - bw / 2 + t, 3.5, bz - bd / 2 + t, bx + bw / 2 - t, 3.8, bz - 1, WOOD);                                            // loft floor (back half)
    for (let i = 0; i < 4; i++) { const y = (i + 1) * 0.85; B(bx + bw / 2 - 1.4, y - 0.2, bz - 0.6, bx + bw / 2 - 0.5, y, bz + 0.2, WOOD); }   // ladder up to the loft
    for (let i = 0; i < 5; i++) { const w = bw / 2 + 0.6 - i * 1.7, y = bh + i * 0.8; B(bx - w, y, bz - bd / 2 - 0.3, bx + w, y + 0.8, bz + bd / 2 + 0.3, i % 2 ? 0x5a2a22 : 0x6a3328); }   // stepped roof
    this.chestSpots.push({ x: bx - 3, y: 3.8, z: bz - 6, tier: 2 }); this.lootSpots.push({ x: bx + 3, y: 0.1, z: bz + 4, tier: 1, force: 'weapon' }, { x: bx - 4, y: 3.8, z: bz - 3, tier: 1 });
    for (let i = 0; i < 4; i++) B(bx - 5 + i * 1.3, 0.1, bz + 6, bx - 4 + i * 1.3, 1.1, bz + 7.4, 0xc8a85a);                    // hay inside
    // silo (octagonal stack) + water tower
    const sx = bx + bw / 2 + 4.5, sz = bz - 6;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4, c = Math.cos(a) * 2.6, s2 = Math.sin(a) * 2.6; B(sx - Math.abs(c) - 0.9, 0, sz - Math.abs(s2) - 0.9, sx + Math.abs(c) + 0.9, 13, sz + Math.abs(s2) + 0.9, 0xb8b4aa); }
    D(sx - 3.2, 13, sz - 3.2, sx + 3.2, 13.6, sz + 3.2, 0x8a8a86); D(sx - 2, 13.6, sz - 2, sx + 2, 14.4, sz + 2, 0x8a8a86);
    const wx = cx + 22, wz = cz - 22; for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) B(wx + a - 0.12, 0, wz + b - 0.12, wx + a + 0.12, 8, wz + b + 0.12, 0x5a4a3a);
    B(wx - 2.4, 8, wz - 2.4, wx + 2.4, 11.5, wz + 2.4, 0x7a6248); D(wx - 2.6, 11.5, wz - 2.6, wx + 2.6, 12, wz + 2.6, 0x4a3a2a);
    // farmhouse
    this.building(cx + 14, cz + 6, 12, 10, 2);
    // fenced crop fields + hay bales + tractor
    const field = (fx, fz, fw, fd, col) => { for (let x = fx - fw / 2 + 1; x < fx + fw / 2; x += 1.6) D(x, 0, fz - fd / 2 + 0.6, x + 0.7, 0.5 + R() * 0.25, fz + fd / 2 - 0.6, col);
      for (const s of [-1, 1]) { for (let x = fx - fw / 2; x <= fx + fw / 2; x += 3) B(x - 0.07, 0, fz + s * fd / 2 - 0.07, x + 0.07, 1.1, fz + s * fd / 2 + 0.07, PAL.fence); D(fx - fw / 2, 0.75, fz + s * fd / 2 - 0.04, fx + fw / 2, 0.85, fz + s * fd / 2 + 0.04, PAL.fence); } };
    field(cx - 14, cz + 22, 26, 16, 0x9aa83a); field(cx + 16, cz + 26, 20, 12, 0xc8a84a);
    for (let i = 0; i < 7; i++) { const x = cx + BR.util.rand(R, -W / 2 + 4, W / 2 - 4), z = cz + BR.util.rand(R, -6, 12); if (Math.abs(x - bx) < bw / 2 + 2 && Math.abs(z - bz) < bd / 2 + 2) continue; if (Math.abs(x - cx - 14) < 8 && Math.abs(z - cz - 6) < 7) continue;
      B(x - 0.8, 0, z - 0.6, x + 0.8, 1.2, z + 0.6, 0xc8a85a); this.lootSpots.push({ x: x + 1.4, y: 0, z, tier: 0 }); }
    this.car(cx + 2, cz - 18, 'x', 0xc83a2a);
  }
  // Relay: the movement hub — spiral tower, pillar maze, wall-run lane and a parkour course.
  relay(cx, cz) {
    const W = 70;
    if (!this.free(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2, 4)) return;
    this.claim(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2);
    this.tower(cx, cz);
    this.pillarMaze(cx + 20, cz + 18);
    this.wallRunLane(cx - 20, cz + 20);
    this.parkourCourse(cx - 8, cz - 22);
    this.jumpPad(cx + 8, cz); this.jumpPad(cx - 8, cz + 6);
    this.chestSpots.push({ x: cx + 6, y: 0, z: cz - 6, tier: 1 });
  }

  // Long rock wall with a couple of gaps. Tall enough to wall-run and grapple.
  ridge() {
    const R = this.rand, U = BR.util, H = this.half;
    for (let tries = 0; tries < 60; tries++) {
      const alongX = R() < 0.5, L = U.rand(R, 80, 150), T = U.rand(R, 5, 8), h = U.rand(R, 7, 11);
      const x = U.rand(R, -H + 30, H - 30), z = U.rand(R, -H + 30, H - 30);
      const w = alongX ? L : T, d = alongX ? T : L;
      if (!this.free(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 6)) continue;
      this.claim(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      // split into segments with gaps
      const segs = [[0, 0.3], [0.38, 0.7], [0.78, 1]];
      for (const [a, b] of segs) {
        const p0 = -L / 2 + a * L, p1 = -L / 2 + b * L, hh = h * U.rand(R, 0.8, 1.1);
        const rk = { hidden: true };        // drawn as natural rock (see buildScenery: rock masses)
        this.props.rockFill.push(alongX ? this.addBox(x + p0, 0, z - T / 2, x + p1, hh, z + T / 2, PAL.cliff, rk) : this.addBox(x - T / 2, 0, z + p0, x + T / 2, hh, z + p1, PAL.cliff, rk));
        // ledge halfway up to mantle onto
        this.props.rockFill.push(alongX ? this.addBox(x + p0 + 2, 0, z + T / 2, x + p0 + 6, hh * 0.45, z + T / 2 + 2.5, PAL.rock, rk) : this.addBox(x + T / 2, 0, z + p0 + 2, x + T / 2 + 2.5, hh * 0.45, z + p0 + 6, PAL.rock, rk));
        this.lootSpots.push({ x: alongX ? x + (p0 + p1) / 2 : x, y: hh, z: alongX ? z : z + (p0 + p1) / 2, tier: 2, force: R() < 0.4 ? 'weapon' : undefined });
      }
      return;
    }
  }

  placeRandom(w, d, fn) {
    const R = this.rand, H = this.half;
    for (let tries = 0; tries < 40; tries++) {
      const x = BR.util.rand(R, -H + 12, H - 12), z = BR.util.rand(R, -H + 12, H - 12);
      if (this.free(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2)) {
        this.claim(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
        fn(x, z);
        return true;
      }
    }
    return false;
  }

  town(cx, cz) {
    const R = this.rand, U = BR.util;
    const lot = 18, nx = 2 + Math.floor(R() * 3), nz = 2 + Math.floor(R() * 2);
    const w = nx * lot, d = nz * lot;
    const x0 = cx - w / 2, z0 = cz - d / 2;
    if (!this.free(x0, z0, x0 + w, z0 + d, 4)) return;
    this.claim(x0, z0, x0 + w, z0 + d);
    // Street furniture on the town edge: a jump pad to reach the roofs + lamp posts
    this.jumpPad(x0 - 2.6, cz);
    this.lampPost(x0 - 1.2, z0 + 2); this.lampPost(x0 + w + 1.2, z0 + d - 2);
    this.lampPost(x0 + w / 2, z0 - 1.2); this.lampPost(x0 + w / 2, z0 + d + 1.2);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const lx = x0 + i * lot + lot / 2, lz = z0 + j * lot + lot / 2;
        if (R() < 0.82) {
          const bw = U.rand(R, 9, 13), bd = U.rand(R, 9, 13);
          const floors = R() < 0.45 ? 2 : 1;
          this.building(lx, lz, bw, bd, floors);
        } else {
          // plaza: crates + cover
          this.crateStack(lx + U.rand(R, -3, 3), lz + U.rand(R, -3, 3));
          this.coverWall(lx + U.rand(R, -4, 4), lz + U.rand(R, -4, 4));
          this.chestSpots.push({ x: lx, y: 0, z: lz, tier: 1 });
        }
      }
    }
  }

  // Wall along one axis with openings. axis 'x': runs along x from a0..a1,
  // thickness c0..c1 on z. cols: [{a,b,gaps:[[y0,y1],...]}]
  wallSeg(axis, a0, a1, c0, c1, y0, y1, cols, color) {
    const box = (pa, pb, ya, yb) => {
      if (pb - pa < 0.01 || yb - ya < 0.01) return;
      if (axis === 'x') this.addBox(pa, ya, c0, pb, yb, c1, color);
      else this.addBox(c0, ya, pa, c1, yb, pb, color);
    };
    cols.sort((p, q) => p.a - q.a);
    let cur = a0;
    for (const col of cols) {
      box(cur, col.a, y0, y1);
      let yc = y0;
      col.gaps.sort((p, q) => p[0] - q[0]);
      for (const g of col.gaps) { box(col.a, col.b, yc, g[0]); yc = g[1]; }
      box(col.a, col.b, yc, y1);
      cur = col.b;
    }
    box(cur, a1, y0, y1);
  }

  building(cx, cz, w, d, floors) {
    const R = this.rand, U = BR.util;
    const t = 0.3, fh = 3.4, H = floors * fh;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const color = U.pick(PAL.walls, R);
    this.addBox(x0, 0, z0, x1, 0.1, z1, PAL.floor); // ground floor
    const doorSides = new Set([Math.floor(R() * 4)]);
    if (R() < 0.6) doorSides.add(Math.floor(R() * 4));

    const walls = [];
    const sides = [
      { axis: 'x', a0: x0, a1: x1, c0: z0, c1: z0 + t, len: w },
      { axis: 'x', a0: x0, a1: x1, c0: z1 - t, c1: z1, len: w },
      { axis: 'z', a0: z0 + t, a1: z1 - t, c0: x0, c1: x0 + t, len: d - 2 * t },
      { axis: 'z', a0: z0 + t, a1: z1 - t, c0: x1 - t, c1: x1, len: d - 2 * t },
    ];
    sides.forEach((s, si) => {
      const mid = (s.a0 + s.a1) / 2;
      const cols = [];
      // Side 2 (west) holds the staircase on 2-floor buildings: no door there.
      const hasDoor = doorSides.has(si) && !(floors > 1 && si === 2);
      const positions = s.len > 10.5 ? [mid - s.len * 0.25, mid + s.len * 0.25] : [mid];
      positions.forEach((p, pi) => {
        const half = (pi === 0 && hasDoor) ? 0.85 : 0.75;
        const col = { a: p - half, b: p + half, gaps: [] };
        for (let f = 0; f < floors; f++) {
          if (f === 0 && pi === 0 && hasDoor) col.gaps.push([0, 2.5]);
          else col.gaps.push([f * fh + 1.1, f * fh + 2.3]);
        }
        cols.push(col);
      });
      this.wallSeg(s.axis, s.a0, s.a1, s.c0, s.c1, 0, H, cols, color);
      walls.push({ si, axis: s.axis, cols, door: hasDoor });
    });
    this.buildings.push({ x0, x1, z0, z1, H, floors, fh, color, walls, cx, cz });

    // Upper floors with a stair hole + staircase along the west wall
    const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
    if (floors > 1) {
      const rise = fh / 8, run = 0.55, sw = 1.3;
      const sz = iz0 + 0.4;
      for (let i = 0; i < 8; i++)
        this.addBox(ix0, 0, sz + i * run, ix0 + sw, (i + 1) * rise, sz + (i + 1) * run, PAL.floor);
      const hz0 = iz0, hz1 = sz + 8 * run, hx1 = ix0 + sw;
      const y0 = fh - 0.25, y1 = fh;
      this.addBox(hx1, y0, iz0, ix1, y1, iz1, PAL.floor);
      this.addBox(ix0, y0, hz1, hx1, y1, iz1, PAL.floor);
      if (hz0 > iz0) this.addBox(ix0, y0, iz0, hx1, y1, hz0, PAL.floor);
    }
    // Roof + low parapet (cover on rooftops, step-able)
    this.addBox(x0 - 0.2, H, z0 - 0.2, x1 + 0.2, H + 0.3, z1 + 0.2, PAL.roof);
    const pt = 0.25, ph = H + 0.8;
    this.addBox(x0 - 0.2, H + 0.3, z0 - 0.2, x1 + 0.2, ph, z0 + pt - 0.2, PAL.trim);
    this.addBox(x0 - 0.2, H + 0.3, z1 - pt + 0.2, x1 + 0.2, ph, z1 + 0.2, PAL.trim);
    this.addBox(x0 - 0.2, H + 0.3, z0 + pt - 0.2, x0 + pt - 0.2, ph, z1 - pt + 0.2, PAL.trim);
    this.addBox(x1 - pt + 0.2, H + 0.3, z0 + pt - 0.2, x1 + 0.2, ph, z1 - pt + 0.2, PAL.trim);
    // Decorative trim bands between floors + a base course (visual only). Four strips hugging the
    // outside walls (sunk into the wall thickness) -- NOT one slab across the footprint, which used
    // to sit over the stair hole and hide the opening from upstairs (and poke up through the floor).
    const band = (ya, yb, o) => {
      const e = t - 0.05;                       // stops short of the inner wall face (no flicker inside)
      this.addBox(x0 - o, ya, z0 - o, x1 + o, yb, z0 + e, PAL.trim, { decor: true });
      this.addBox(x0 - o, ya, z1 - e, x1 + o, yb, z1 + o, PAL.trim, { decor: true });
      this.addBox(x0 - o, ya, z0 + e, x0 + e, yb, z1 - e, PAL.trim, { decor: true });
      this.addBox(x1 - e, ya, z0 + e, x1 + o, yb, z1 - e, PAL.trim, { decor: true });
    };
    for (let f = 1; f < floors; f++) band(f * fh - 0.12, f * fh + 0.08, 0.08);
    band(0, 0.35, 0.06);
    // Loot: a guaranteed gun on every floor (in a corner, clear of the stairs),
    // extra items, and sometimes a chest inside or on the roof.
    const cx0 = x0 + t + 1.7, cx1 = x1 - t - 0.9, cz0 = z0 + t + 0.9, cz1 = z1 - t - 0.9;
    const corner = () => [R() < 0.5 ? cx0 : cx1, R() < 0.5 ? cz0 : cz1];
    for (let f = 0; f < floors; f++) {
      const y = f === 0 ? 0.1 : f * fh;
      const [ax, az] = corner();
      this.lootSpots.push({ x: ax, y, z: az, tier: 1, force: 'weapon' });
      this.lootSpots.push({ x: cx + U.rand(R, -1.5, 1.5), y, z: cz + U.rand(R, -1.5, 1.5), tier: 1 });
      if (R() < 0.5) { const [bx, bz] = corner(); this.lootSpots.push({ x: bx, y, z: bz, tier: 1 }); }
    }
    if (R() < 0.45) {
      const f = Math.floor(R() * floors), [qx, qz] = corner();
      this.chestSpots.push({ x: qx, y: f === 0 ? 0.1 : f * fh, z: qz, tier: 1 });
    }
    if (R() < 0.3) this.chestSpots.push({ x: cx, y: H + 0.3, z: cz, tier: 2 });
    else if (R() < 0.6) this.lootSpots.push({ x: cx + U.rand(R, -2, 2), y: H + 0.3, z: cz + U.rand(R, -2, 2), tier: 2, force: 'weapon' });

    // Crates against an outside wall so roofs are reachable by climbing
    const side = Math.floor(R() * 4);
    const along = U.rand(R, -w / 2 + 2, w / 2 - 2);
    let px = cx, pz = cz, ox = 0, oz = 0;
    if (side === 0) { pz = z0 - 0.7; px = cx + along; oz = -1; }
    if (side === 1) { pz = z1 + 0.7; px = cx + along; oz = 1; }
    if (side === 2) { px = x0 - 0.7; pz = cz + U.rand(R, -d / 2 + 2, d / 2 - 2); ox = -1; }
    if (side === 3) { px = x1 + 0.7; pz = cz + U.rand(R, -d / 2 + 2, d / 2 - 2); ox = 1; }
    const tall = Math.min(H - 1.2, 2.4);
    this.addBox(px - 0.6, 0, pz - 0.6, px + 0.6, tall, pz + 0.6, PAL.crate);
    this.addBox(px - 0.6 + ox * 1.2, 0, pz - 0.6 + oz * 1.2, px + 0.6 + ox * 1.2, 1.2, pz + 0.6 + oz * 1.2, PAL.crate);
  }

  container(x, z) {
    const R = this.rand, U = BR.util;
    const along = R() < 0.5, L = 6, W = 2.5, Hh = 2.6;
    const c = U.pick(PAL.containers, R);
    if (along) this.addBox(x - L / 2, 0, z - W / 2, x + L / 2, Hh, z + W / 2, c);
    else this.addBox(x - W / 2, 0, z - L / 2, x + W / 2, Hh, z + L / 2, c);
    this.containers.push(this.boxes[this.boxes.length - 1]);
    if (R() < 0.3) {
      const c2 = U.pick(PAL.containers, R);
      if (along) this.addBox(x - L / 2 + 0.5, Hh, z - W / 2, x + L / 2 - 0.5, Hh * 2, z + W / 2, c2);
      else this.addBox(x - W / 2, Hh, z - L / 2 + 0.5, x + W / 2, Hh * 2, z + L / 2 - 0.5, c2);
      this.chestSpots.push({ x, y: Hh * 2, z, tier: 2 });
    }
    this.lootSpots.push({ x: x + (along ? 0 : 2.2), y: 0, z: z + (along ? 2.2 : 0), tier: 0 });
  }

  crateStack(x, z) {
    const R = this.rand, s = 1.2;
    this.addBox(x - s / 2, 0, z - s / 2, x + s / 2, s, z + s / 2, PAL.crate);
    if (R() < 0.6) this.addBox(x + s / 2, 0, z - s / 2, x + s * 1.5, s, z + s / 2, PAL.crate);
    if (R() < 0.4) this.addBox(x - s / 2, s, z - s / 2, x + s / 2, s * 2, z + s / 2, PAL.crate);
    if (R() < 0.5) this.lootSpots.push({ x: x, y: 0, z: z + 1.4, tier: 0 });
  }

  rock(x, z) {
    const R = this.rand, U = BR.util;
    const w = U.rand(R, 2, 6), d = U.rand(R, 2, 6), h = U.rand(R, 0.9, 3.2);
    this.props.rockFill.push(this.addBox(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, PAL.rock, { hidden: true }));
    if (h > 2 && R() < 0.35) this.lootSpots.push({ x, y: h, z, tier: 1, force: 'weapon' }); // gun on a rock top
    if (R() < 0.5) {
      const w2 = w * 0.6, d2 = d * 0.6;
      this.props.rockFill.push(this.addBox(x - w2 / 2 + 0.4, h, z - d2 / 2, x + w2 / 2 + 0.4, h + U.rand(R, 0.5, 1.2), z + d2 / 2, PAL.rock, { hidden: true }));
    }
  }

  coverWall(x, z) {
    const R = this.rand, U = BR.util;
    const L = U.rand(R, 3, 6), T = 0.5, h = R() < 0.5 ? 1.3 : 2.4;
    if (R() < 0.5) this.addBox(x - L / 2, 0, z - T / 2, x + L / 2, h, z + T / 2, PAL.cover);
    else this.addBox(x - T / 2, 0, z - L / 2, x + T / 2, h, z + L / 2, PAL.cover);
  }

  tree(x, z) {
    const R = this.rand, U = BR.util;
    const h = U.rand(R, 3.5, 6);
    this.addBox(x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3, PAL.trunk, { hidden: true });   // drawn as a tapered trunk
    this.trees.push({ x, z, h, s: U.rand(R, 1.6, 2.6), pine: R() < 0.35, tone: R() });
  }

  // Two tall parallel walls: the movement playground. Run along them, jump between.
  wallRunLane(x, z) {
    const R = this.rand;
    const L = 16, T = 0.6, H = 4.5, gap = 4.2;
    const alongX = R() < 0.5;
    for (const s of [-1, 1]) {
      const o = s * (gap / 2 + T / 2);
      if (alongX) this.addBox(x - L / 2, 0, z + o - T / 2, x + L / 2, H, z + o + T / 2, s < 0 ? PAL.parkour : PAL.parkourAlt);
      else this.addBox(x + o - T / 2, 0, z - L / 2, x + o + T / 2, H, z + L / 2, s < 0 ? PAL.parkour : PAL.parkourAlt);
    }
    this.lootSpots.push({ x, y: 0, z, tier: 1, force: 'weapon' });
    // A high-tier gun on top of the first wall: reach it with a wall chain or mantle boost
    const o = -(gap / 2 + T / 2);
    if (alongX) this.lootSpots.push({ x: x + (R() - 0.5) * 8, y: H, z: z + o, tier: 2, force: 'weapon' });
    else this.lootSpots.push({ x: x + o, y: H, z: z + (R() - 0.5) * 8, tier: 2, force: 'weapon' });
  }

  // Spiral of floating platforms around a pillar. High-tier loot on top.
  tower(x, z) {
    const steps = 9, rad = 4, sz = 1.1;
    this.addBox(x - 1, 0, z - 1, x + 1, steps * 1.1 + 0.1, z + 1, PAL.tower);
    for (let i = 0; i < steps; i++) {
      const a = i * Math.PI / 4;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad, top = (i + 1) * 1.1;
      this.addBox(px - sz, top - 0.35, pz - sz, px + sz, top, pz + sz, PAL.parkour);
    }
    const top = steps * 1.1 + 0.1;
    this.addBox(x - 2.4, top, z - 2.4, x + 2.4, top + 0.3, z + 2.4, PAL.tower);
    this.lootSpots.push({ x, y: top + 0.3, z, tier: 2 });
    this.chestSpots.push({ x: x + 1.2, y: top + 0.3, z: z + 1.2, tier: 2 });
  }

  // Raised plateau with stairs: a high-ground fight spot.
  mesa(x, z) {
    const R = this.rand;
    const W = 26, Hh = 4;
    this.props.rockSkirt = this.props.rockSkirt || [];
    this.props.rockSkirt.push(this.addBox(x - W / 2, 0, z - W / 2, x + W / 2, Hh, z + W / 2, PAL.cliff));
    const dir = Math.floor(R() * 4);
    for (let i = 0; i < 8; i++) {
      const y = (i + 1) * 0.5, off = W / 2 + 8 - i;
      if (dir === 0) this.addBox(x - 2, 0, z - off, x + 2, y, z - off + 1, PAL.cover);
      if (dir === 1) this.addBox(x - 2, 0, z + off - 1, x + 2, y, z + off, PAL.cover);
      if (dir === 2) this.addBox(x - off, 0, z - 2, x - off + 1, y, z + 2, PAL.cover);
      if (dir === 3) this.addBox(x + off - 1, 0, z - 2, x + off, y, z + 2, PAL.cover);
    }
    this.claim(x - W / 2 - 9, z - W / 2 - 9, x + W / 2 + 9, z + W / 2 + 9);
    for (let i = 0; i < 4; i++) {
      this.coverWall(x + BR.util.rand(R, -8, 8), z + BR.util.rand(R, -8, 8));
      // coverWall builds from y=0; lift those onto the mesa
      const b = this.boxes[this.boxes.length - 1];
      b.y0 += Hh; b.y1 += Hh;
    }
    this.lootSpots.push({ x, y: Hh, z, tier: 2 });
    this.lootSpots.push({ x: x + 6, y: Hh, z: z - 6, tier: 1, force: 'weapon' });
    this.chestSpots.push({ x: x - 5, y: Hh, z: z + 5, tier: 2 });
  }

  // Jump pad: land on it to get launched (tag 'pad' is read by the Mover).
  jumpPad(x, z) {
    this.addBox(x - 1.4, 0, z - 1.4, x + 1.4, 0.15, z + 1.4, PAL.padBase);
    this.addBox(x - 1.0, 0.15, z - 1.0, x + 1.0, 0.3, z + 1.0, PAL.pad, { tag: 'pad' });
    this.pads = this.pads || [];
    this.pads.push({ x, z });
  }

  // A run of floating platforms that climb, with a wall-run wall over the big gap.
  parkourCourse(x, z) {
    const R = this.rand, alongX = R() < 0.5;
    const P = (a, b, y0, y1, half) => alongX
      ? this.addBox(x + a - half, y0, z + b - half, x + a + half, y1, z + b + half, PAL.parkour)
      : this.addBox(x + b - half, y0, z + a - half, x + b + half, y1, z + a + half, PAL.parkour);
    this.jumpPad(alongX ? x - 14 : x, alongX ? z : z - 14);
    let a = -10, y = 1.2;
    for (let i = 0; i < 6; i++) {
      const side = (i % 2 ? 1 : -1) * 1.2;
      P(a, side, y - 0.35, y, 1.1);
      a += 3.6 + R() * 0.6;
      y += i === 3 ? 0 : 1.1;
    }
    // wall-run wall across the last gap
    if (alongX) this.addBox(x + a - 7, 2.5, z + 3.2, x + a - 1, 7.5, z + 3.8, PAL.parkourAlt);
    else this.addBox(x + 3.2, 2.5, z + a - 7, x + 3.8, 7.5, z + a - 1, PAL.parkourAlt);
    P(a + 1, 0, y - 0.4, y, 2.2);  // summit
    const sx = alongX ? x + a + 1 : x, sz = alongX ? z : z + a + 1;
    this.chestSpots.push({ x: sx, y, z: sz, tier: 2 });
  }

  // Grid of tall pillars: wall-chain playground with loot on the tallest one.
  pillarMaze(x, z) {
    const R = this.rand;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const h = i === 0 && j === 0 ? 9 : 4.5 + R() * 3;
      this.addBox(x + i * 5.2 - 0.9, 0, z + j * 5.2 - 0.9, x + i * 5.2 + 0.9, h, z + j * 5.2 + 0.9, PAL.pillar);
    }
    this.lootSpots.push({ x, y: 9, z, tier: 2, force: 'weapon' });
    this.jumpPad(x + 7.8, z);
  }

  fence(x, z) {
    const R = this.rand, L = 10, alongX = R() < 0.5;
    for (let i = 0; i <= 5; i++) {
      const o = -L / 2 + i * L / 5;
      if (alongX) this.addBox(x + o - 0.08, 0, z - 0.08, x + o + 0.08, 1.1, z + 0.08, PAL.fence);
      else this.addBox(x - 0.08, 0, z + o - 0.08, x + 0.08, 1.1, z + o + 0.08, PAL.fence);
    }
    for (const y of [0.45, 0.9]) {
      if (alongX) this.addBox(x - L / 2, y, z - 0.04, x + L / 2, y + 0.1, z + 0.04, PAL.fence);
      else this.addBox(x - 0.04, y, z - L / 2, x + 0.04, y + 0.1, z + L / 2, PAL.fence);
    }
  }

  lampPost(x, z) {
    this.addBox(x - 0.1, 0, z - 0.1, x + 0.1, 4.2, z + 0.1, PAL.lamp);
    this.addBox(x - 0.1, 4.0, z - 0.1, x + 0.9, 4.15, z + 0.1, PAL.lamp, { decor: true });
    this.addBox(x + 0.55, 3.8, z - 0.18, x + 0.95, 4.0, z + 0.18, PAL.lampGlow, { decor: true });
  }

  // ---------------------------------------------------------------- render
  buildMeshes(scene, detail) {
    const tex = makeTileTexture();
    const lowDetail = detail !== undefined && detail < 0.5;
    const visAll = this.boxes.filter(b => !b.hidden).concat(lowDetail ? this.decor.filter(b => !b.fine) : this.decor);
    // v1.21 art pass: architecture gets corner pilasters + a coping lip on top (visual only, merged into the same
    // tiles, so no extra draw calls). Corners read as built edges, window and door openings get frames.
    if (!lowDetail) {
      const trim = [], arch = b => b.tag !== 'edge' && b.y1 - b.y0 >= 2.0 && Math.max(b.x1 - b.x0, b.z1 - b.z0) >= 1.0 && Math.min(b.x1 - b.x0, b.z1 - b.z0) >= 0.2 && Math.min(b.x1 - b.x0, b.z1 - b.z0) <= 40;
      const tone = (c, k) => { const C = new THREE.Color(c); C.r = Math.min(1, C.r * k); C.g = Math.min(1, C.g * k); C.b = Math.min(1, C.b * k); return C.getHex(); };
      for (const b of this.boxes) {
        if (b.hidden || !arch(b)) continue;
        const e = 0.035, w = Math.min(0.16, (b.x1 - b.x0) * 0.3, (b.z1 - b.z0) * 0.6 + e), dk = tone(b.color, 0.8), lt = tone(b.color, 1.12), y1 = b.y1;
        for (const [cx, cz] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
          const sx = cx === b.x0 ? -1 : 1, sz = cz === b.z0 ? -1 : 1;
          trim.push({ x0: Math.min(cx + sx * e, cx - sx * w), x1: Math.max(cx + sx * e, cx - sx * w), y0: b.y0, y1: y1 - 0.02, z0: Math.min(cz + sz * e, cz - sz * w), z1: Math.max(cz + sz * e, cz - sz * w), color: dk, trim: true });
        }
        if (y1 > 1.5) trim.push({ x0: b.x0 - 0.05, x1: b.x1 + 0.05, y0: y1 - 0.02, y1: y1 + 0.09, z0: b.z0 - 0.05, z1: b.z1 + 0.05, color: lt, trim: true });
      }
      for (const t of trim) visAll.push(t);
    }
    // Split the world into 64 m tiles (one mesh each) so the GPU skips off-screen and fogged-out tiles
    const TILE = 128, tiles = new Map();
    for (const b of visAll) {
      const k = Math.floor(((b.x0 + b.x1) / 2 + this.half) / TILE) + ',' + Math.floor(((b.z0 + b.z1) / 2 + this.half) / TILE);
      if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(b);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
    let first = null;
    for (const vis of tiles.values()) {
    const count = vis.length;
    const Q = 14;                                  // quads per box at most (top, bottom, 4 sides x up to 3 bands)
    const pos = new Float32Array(count * Q * 4 * 3);
    const nor = new Float32Array(count * Q * 4 * 3);
    const col = new Float32Array(count * Q * 4 * 3);
    const uv = new Float32Array(count * Q * 4 * 2);
    const idx = new Uint32Array(count * Q * 6);
    let v = 0, ii = 0;
    const c = new THREE.Color();
    const S = 0.4; // uv scale: one tile per 2.5 m
    const face = (nx, ny, nz, P, shade, uvf) => {
      // P = 4 corners [x,y,z]; fix winding so the triangle normal matches (nx,ny,nz)
      const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2];
      const bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
      const cxp = ay * bz - az * by, cyp = az * bx - ax * bz, czp = ax * by - ay * bx;
      if (cxp * nx + cyp * ny + czp * nz < 0) { const tmp = P[1]; P[1] = P[3]; P[3] = tmp; }
      for (let k = 0; k < 4; k++) {
        const p = P[k];
        pos[v * 3] = p[0]; pos[v * 3 + 1] = p[1]; pos[v * 3 + 2] = p[2];
        nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
        // Fake ambient occlusion: a short dark band where side walls meet the ground (v1.21: banded, not the
        // whole wall height), a lighter bevel along the very top edge
        const ao = ny === 0 ? (p[1] < 0.05 ? 0.58 : p[1] === aoY0 ? 0.82 : p[1] === aoBand ? 0.97 : p[1] === aoTop ? 1.1 : 1) : 1;
        const sh = shade * ao;
        col[v * 3] = c.r * sh; col[v * 3 + 1] = c.g * sh; col[v * 3 + 2] = c.b * sh;
        const u = uvf(p);
        uv[v * 2] = u[0] * S; uv[v * 2 + 1] = u[1] * S;
        v++;
      }
      const b0 = v - 4;
      idx[ii++] = b0; idx[ii++] = b0 + 1; idx[ii++] = b0 + 2;
      idx[ii++] = b0; idx[ii++] = b0 + 2; idx[ii++] = b0 + 3;
    };
    const uvXZ = p => [p[0], p[2]], uvZY = p => [p[2], p[1]], uvXY = p => [p[0], p[1]];
    const jitter = this.rand;
    let aoY0 = 0, aoBand = -1, aoTop = -1;
    // a side face split into bands: [y0 .. y0+0.9] grounding gradient, middle, [y1-0.08 .. y1] top bevel
    const side = (nx, nz, x0, z0, x1, z1, y0, y1, shade, uvf) => {
      const h = y1 - y0, b1 = h > 1.6 ? y0 + 0.9 : -1, t0 = h > 1.0 ? y1 - 0.08 : -1;
      const ys = [y0]; if (b1 > 0) ys.push(b1); if (t0 > 0) ys.push(t0); ys.push(y1);
      aoBand = b1; aoTop = -1;
      for (let i = 0; i < ys.length - 1; i++) {
        const ya = ys[i], yb = ys[i + 1];
        if (t0 > 0 && i === ys.length - 2) aoTop = yb;
        face(nx, 0, nz, [[x0, ya, z0], [x0, yb, z0], [x1, yb, z1], [x1, ya, z1]], shade, uvf);
        aoTop = -1;
      }
    };
    for (const b of vis) {
      aoY0 = b.y0;
      c.setHex(b.color);
      const j = 0.94 + jitter() * 0.12;
      c.r *= j; c.g *= j; c.b *= j;
      const { x0, y0, z0, x1, y1, z1 } = b;
      face(0, 1, 0, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1.0, uvXZ);
      face(0, -1, 0, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.55, uvXZ);
      side(1, 0, x1, z0, x1, z1, y0, y1, 0.86, uvZY);
      side(-1, 0, x0, z0, x0, z1, y0, y1, 0.78, uvZY);
      side(0, 1, x0, z1, x1, z1, y0, y1, 0.92, uvXY);
      side(0, -1, x0, z0, x1, z0, y0, y1, 0.72, uvXY);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    g.setIndex(new THREE.BufferAttribute(idx.subarray(0, ii), 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    this.addChunk(mesh, g.boundingSphere.center, g.boundingSphere.radius);
    first = first || mesh;
    }
    const mesh = first;

    this.buildGround(scene);
    this.buildScenery(scene, detail === undefined ? 1 : detail);
    return mesh;
  }

  // ---- performance: tiles + culling ---------------------------------------
  addChunk(obj, center, radius) { (this.chunks || (this.chunks = [])).push({ obj, x: center.x, z: center.z, r: radius }); }
  // Hide tiles past the fog (they'd be invisible anyway) - cheap, once per frame
  cullChunks(cx, cz, far) {
    const C = this.chunks; if (!C) return;
    for (let i = 0; i < C.length; i++) { const c = C[i], d = Math.hypot(c.x - cx, c.z - cz) - c.r; c.obj.visible = d < far; }
    this.updateLod(cx, cz);
  }
  // Drop-in for THREE.InstancedMesh used while building scenery: collects instances, then flush() splits
  // them into 320 m tiles with real bounds so off-screen / fogged tiles are culled.
  // v1.37 lod = { lo: geometry | null, dist: m }: the tiles draw the cheap model (or nothing, lo null) and one extra
  // "near" mesh draws the detailed model for the instances within dist of the camera (see updateLod), so phones draw a
  // fraction of the triangles without extra draw calls.
  collector(geo, mat, _n, lod) {
    const self = this, M = [], Cl = [];
    const col = {
      count: 0, instanceColor: { needsUpdate: false },
      setMatrixAt(i, m) { M[i] = m.clone(); if (self.T && !this.noLift) M[i].elements[13] += self.heightAt(m.elements[12], m.elements[14]); if (i + 1 > this.count) this.count = i + 1; },      // (v1.35: sits on the terrain)
      setColorAt(i, c) { Cl[i] = c.clone(); },
      flush(scene) {
        const n = Math.min(this.count, M.length); if (!n) return;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const tileGeo = lod ? lod.lo : geo;
        const gr = geo.boundingSphere.radius + geo.boundingSphere.center.length(), TILE = 320, H = self.half;
        const tiles = new Map();
        for (let i = 0; i < n; i++) { if (!M[i]) continue; const e = M[i].elements, k = Math.floor((e[12] + H) / TILE) + ',' + Math.floor((e[14] + H) / TILE); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(i); }
        const v = new THREE.Vector3(), where = lod ? new Array(n) : null;      // instance -> [tile mesh, slot]
        if (tileGeo) for (const ids of tiles.values()) {
          // geometry view sharing the buffers, with this tile's bounding sphere
          const view = new THREE.BufferGeometry();
          for (const a in tileGeo.attributes) view.setAttribute(a, tileGeo.attributes[a]);
          if (tileGeo.index) view.setIndex(tileGeo.index);
          let cx = 0, cy = 0, cz = 0;
          for (const i of ids) { const e = M[i].elements; cx += e[12]; cy += e[13]; cz += e[14]; }
          cx /= ids.length; cy /= ids.length; cz /= ids.length;
          let r = 0;
          for (const i of ids) { const e = M[i].elements, sc = Math.max(v.set(e[0], e[1], e[2]).length(), v.set(e[4], e[5], e[6]).length(), v.set(e[8], e[9], e[10]).length());
            r = Math.max(r, Math.hypot(e[12] - cx, e[13] - cy, e[14] - cz) + gr * sc); }
          view.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), r);
          view._shared = true;
          const im = new THREE.InstancedMesh(view, mat, ids.length);
          ids.forEach((i, j) => { im.setMatrixAt(j, M[i]); if (Cl[i]) im.setColorAt(j, Cl[i]); if (where) where[i] = [im, j]; });
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          scene.add(im);
          self.addChunk(im, v.set(cx, cy, cz), r);
        }
        if (!lod) return;
        // near mesh: detailed geometry, refilled as the camera moves. Instances bucketed on a 32 m grid for the lookup.
        const area = self.size * self.size, cap = Math.min(n, Math.max(48, Math.ceil(n * Math.PI * (lod.dist + 16) * (lod.dist + 16) / area * 4)));
        const nv = new THREE.BufferGeometry(); for (const a in geo.attributes) nv.setAttribute(a, geo.attributes[a]); if (geo.index) nv.setIndex(geo.index); nv._shared = true;
        nv.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
        const near = new THREE.InstancedMesh(nv, mat, cap); near.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (Cl.length) { near.setColorAt(0, Cl.find(c => c) || new THREE.Color(1, 1, 1)); near.instanceColor.setUsage(THREE.DynamicDrawUsage); }      // (sized by count, so before count = 0)
        near.count = 0;
        scene.add(near);
        const grid = new Map(), C = 32;
        for (let i = 0; i < n; i++) { if (!M[i]) continue; const e = M[i].elements, k = Math.floor(e[12] / C) + ',' + Math.floor(e[14] / C); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(i); }
        let maxSc = 1; for (let i = 0; i < n; i++) if (M[i]) { const e = M[i].elements; maxSc = Math.max(maxSc, v.set(e[0], e[1], e[2]).length(), v.set(e[4], e[5], e[6]).length(), v.set(e[8], e[9], e[10]).length()); }
        (self.lodSets || (self.lodSets = [])).push({ M, Cl, where, grid, C, near, cap, dist: lod.dist, gr: gr * maxSc, cur: [], cx: 1e9, cz: 1e9, zero: new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) });
      },
    };
    (this._pend || (this._pend = [])).push(col);
    return col;
  }
  // v1.37: refill each near mesh when the camera has moved a few metres: those instances get the detailed model
  // and their slots in the cheap tiles are collapsed (restored when they fall out of range).
  updateLod(cx, cz) {
    const S = this.lodSets; if (!S) return;
    const k = this.lodScale === undefined ? 1 : this.lodScale;
    for (const L of S) {
      if (Math.abs(cx - L.cx) < 4 && Math.abs(cz - L.cz) < 4) continue;
      L.cx = cx; L.cz = cz;
      const d = L.dist * k, d2 = d * d, ids = [], C = L.C;
      for (let gx = Math.floor((cx - d) / C); gx <= Math.floor((cx + d) / C); gx++) for (let gz = Math.floor((cz - d) / C); gz <= Math.floor((cz + d) / C); gz++) {
        const b = L.grid.get(gx + ',' + gz); if (!b) continue;
        for (const i of b) { const e = L.M[i].elements, dx = e[12] - cx, dz = e[14] - cz; if (dx * dx + dz * dz < d2) ids.push(i); }
      }
      ids.sort((a, b) => { const ea = L.M[a].elements, eb = L.M[b].elements; return (ea[12] - cx) ** 2 + (ea[14] - cz) ** 2 - ((eb[12] - cx) ** 2 + (eb[14] - cz) ** 2); });
      if (ids.length > L.cap) ids.length = L.cap;
      const now = new Set(ids), dirty = new Set();
      if (L.where) {
        for (const i of L.cur) if (!now.has(i)) { const w = L.where[i]; if (w) { w[0].setMatrixAt(w[1], L.M[i]); dirty.add(w[0]); } }
        const was = new Set(L.cur);
        for (const i of ids) if (!was.has(i)) { const w = L.where[i]; if (w) { w[0].setMatrixAt(w[1], L.zero); dirty.add(w[0]); } }
        for (const m of dirty) m.instanceMatrix.needsUpdate = true;
      }
      const nm = L.near; let cy = 0;
      ids.forEach((i, j) => { nm.setMatrixAt(j, L.M[i]); if (nm.instanceColor && L.Cl[i]) nm.setColorAt(j, L.Cl[i]); cy += L.M[i].elements[13]; });
      nm.count = ids.length; nm.instanceMatrix.needsUpdate = true; if (nm.instanceColor) nm.instanceColor.needsUpdate = true;
      nm.geometry.boundingSphere.center.set(cx, ids.length ? cy / ids.length : 0, cz); nm.geometry.boundingSphere.radius = d + L.gr + 30;
      L.cur = ids;
    }
  }

  // Ground with painted grass/dirt variation (vertex colors) under a tiled detail texture.
  buildGround(scene) {
    const gt = makeTileTexture(true);
    const S = this.arena ? 420 : this.size + 300, segs = this.arena ? 40 : this.T ? Math.round(S / 5) : 120;     // (v1.35: 5 m grid to follow the terrain)
    const H0 = this.half, island = !this.arena;
    const sand = new THREE.Color(0xd9c58e), wetSand = new THREE.Color(0xb9a46e), seabed = new THREE.Color(0x6f8a7a);
    gt.repeat.set(S / 5, S / 5);
    const geo = new THREE.PlaneGeometry(S, S, segs, segs);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const GC = this.groundCols || [0x6f8f45, 0x55733a, 0xa89a5c];      // v1.34: richer, sunnier grass
    const grass = new THREE.Color(GC[0]), grass2 = new THREE.Color(GC[1]), dry = new THREE.Color(GC[2]), dirt = new THREE.Color(0x9c8460);
    const c = new THREE.Color();
    const towns = this.towns || [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = -pos.getY(i); // plane is rotated -90° about X
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.043) + Math.sin(x * 0.13 + z * 0.09) * 0.5;
      c.copy(grass).lerp(grass2, BR.util.clamp(n * 0.5 + 0.5, 0, 1));
      c.lerp(dry, BR.util.clamp(Math.sin(x * 0.021 + 1) * Math.sin(z * 0.017) * 1.2 - 0.3, 0, 0.6));
      // dirt plazas in towns + dirt roads linking them
      for (let t = 0; t < towns.length; t++) {
        const T = towns[t], d = Math.hypot(x - T.x, z - T.z);
        if (d < 34) c.lerp(dirt, BR.util.clamp((34 - d) / 12, 0, 0.85));
        const U2 = towns[(t + 1) % towns.length];
        const ex = U2.x - T.x, ez = U2.z - T.z, L2 = ex * ex + ez * ez;
        const k = BR.util.clamp(((x - T.x) * ex + (z - T.z) * ez) / L2, 0, 1);
        const rd = Math.hypot(x - (T.x + ex * k), z - (T.z + ez * k));
        if (rd < 4) c.lerp(dirt, (4 - rd) / 4 * 0.75);
      }
      if (this.T) {                                     // v1.35 terrain: height + rock on steep slopes, drier grass up high, darker in hollows
        const y = this.heightAt(x, z), gx = this.heightAt(x + 2.5, z) - this.heightAt(x - 2.5, z), gz = this.heightAt(x, z + 2.5) - this.heightAt(x, z - 2.5), sl = Math.hypot(gx, gz) / 5;
        pos.setZ(i, y);
        c.lerp(dry, BR.util.clamp((y - 9) / 14, 0, 0.55));
        c.lerp(new THREE.Color(0x8a8371), BR.util.clamp((sl - 0.28) / 0.25, 0, 0.85));
        c.multiplyScalar(0.92 + 0.08 * BR.util.clamp(y / 8, 0, 1));
      }
      if (island) {
        // irregular coastline: beach inside the last ~24 m, then the land slopes under the sea
        const wob = Math.sin(x * 0.031) * 7 + Math.sin(z * 0.027 + 1.3) * 7 + Math.sin((x + z) * 0.013) * 5;
        const ex = Math.max(0, Math.abs(x) - H0 - wob), ez = Math.max(0, Math.abs(z) - H0 - wob), e = Math.hypot(ex, ez);
        const inner = Math.min(Math.abs(Math.abs(x) - H0 - wob), Math.abs(Math.abs(z) - H0 - wob));
        if (e > 0) {
          pos.setZ(i, -Math.min(9, e * 0.2 + e * e * 0.004));
          c.copy(e < 6 ? wetSand : seabed).lerp(seabed, BR.util.clamp((e - 6) / 20, 0, 1));
        } else if (inner < 26 && (Math.abs(x) > H0 - 40 || Math.abs(z) > H0 - 40)) c.lerp(sand, BR.util.clamp((26 - inner) / 14, 0, 0.92));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    if (island) geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // v1.37: the ground is split into tiles (shared vertex buffers, own index ranges) so the parts behind you or past
    // the fog aren't drawn. One big mesh meant ~90k triangles every frame on the island maps.
    const gmat = new THREE.MeshLambertMaterial({ vertexColors: true, map: gt }), idx = geo.index.array, per = Math.max(1, Math.ceil(segs / (island ? 7 : 1)));
    for (let by = 0; by < segs; by += per) for (let bx = 0; bx < segs; bx += per) {
      const ix = [], ex = Math.min(segs, bx + per), ey = Math.min(segs, by + per);
      for (let iy = by; iy < ey; iy++) for (let qx = bx; qx < ex; qx++) { const q = (iy * segs + qx) * 6; for (let k = 0; k < 6; k++) ix.push(idx[q + k]); }
      const tg = new THREE.BufferGeometry();
      for (const a in geo.attributes) tg.setAttribute(a, geo.attributes[a]);
      tg.setIndex(ix);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < ix.length; k++) { const v = ix[k], px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v); if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz; }
      const ctr = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
      tg.boundingSphere = new THREE.Sphere(ctr, r);
      const ground = new THREE.Mesh(tg, gmat);
      ground.rotation.x = -Math.PI / 2; ground.updateMatrix(); ground.matrixAutoUpdate = false;
      scene.add(ground);
      if (island) this.addChunk(ground, { x: ctr.x, z: -ctr.y }, r);
    }
    if (island) {
      // ocean around the island: animated wave texture, shiny, slightly see-through
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
      x.fillStyle = '#2a86b8'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(220,245,255,${0.08 + Math.random() * 0.18})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath();
        const yy = Math.random() * 256, xx = Math.random() * 256; x.moveTo(xx, yy); x.quadraticCurveTo(xx + 12, yy - 4, xx + 26, yy); x.stroke(); }
      const wt = new THREE.CanvasTexture(cv); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(140, 140);
      BR.Models.animTex(wt, (tx, t) => { tx.offset.set(t * 0.012, t * 0.008); });
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), new THREE.MeshPhongMaterial({ map: wt, color: 0xffffff, specular: 0xbfe8ff, shininess: 90, transparent: true, opacity: 0.93 }));
      sea.rotation.x = -Math.PI / 2; sea.position.y = -0.7; sea.renderOrder = 1;
      scene.add(sea);
      this.sea = sea;
    }
  }

  // Sky dome, far mountains, clouds, tree canopies, bushes and grass tufts. All visual.
  buildScenery(scene, detail) {
    const R = BR.util.rng(this.seed + 5), H = this.half;
    // ---- Sky: gradient dome tinted toward the sun, sun disc + glow halos, layered mountains,
    // fluffy cumulus clusters and high cirrus streaks. All fog-free and drawn behind the world.
    const SUN = new THREE.Vector3(420, 300, 300).normalize();
    const skyG = new THREE.SphereGeometry(900, 32, 16);
    const sp = skyG.attributes.position, sc = new Float32Array(sp.count * 3);
    const zen = new THREE.Color(0x1d4a92), mid = new THREE.Color(0x5b94d2), hor = new THREE.Color(0xd5dcdf), warm = new THREE.Color(0xffc98a), c = new THREE.Color(), v = new THREE.Vector3();     // v1.34: deeper zenith, warmer sun glow
    for (let i = 0; i < sp.count; i++) {
      v.set(sp.getX(i), sp.getY(i), sp.getZ(i)).normalize();
      const k = BR.util.clamp(v.y, 0, 1);
      c.copy(hor).lerp(mid, Math.pow(k, 0.5)).lerp(zen, Math.pow(k, 1.6));
      const toSun = Math.max(0, v.dot(SUN));
      c.lerp(warm, Math.min(1, Math.pow(toSun, 4) * (1 - k) * 1.05 + Math.pow(toSun, 24) * 0.4));      // warm glow low near the sun (wider + a hot core)
      if (v.y < 0) c.copy(hor).lerp(new THREE.Color(0x9fb8c8), Math.min(1, -v.y * 3));
      sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    skyG.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;
    const glowTex = (inner, outer) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); };
    const sunPos = SUN.clone().multiplyScalar(800);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: 0xfffaea, fog: false, depthWrite: false }));
    sun.position.copy(sunPos); sun.lookAt(0, 0, 0); sun.renderOrder = -9; scene.add(sun);
    this.skyRig = [sky, sun].map(m => ({ o: m, x: m.position.x, y: m.position.y, z: m.position.z }));      // v1.36: follows the camera (no far-plane clipping off-centre)
    for (const [sz, tex, op] of [[150, glowTex('rgba(255,250,230,1)', 'rgba(255,220,150,0.55)'), 0.9], [360, glowTex('rgba(255,230,180,0.45)', 'rgba(255,190,120,0.12)'), 0.5]]) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      halo.position.copy(sunPos).multiplyScalar(0.98); halo.scale.set(sz, sz, 1); halo.renderOrder = -8; scene.add(halo);
      this.skyRig.push({ o: halo, x: halo.position.x, y: halo.position.y, z: halo.position.z });
    }

    // Mountains: far snow-capped blue range + nearer green hills (jittered cones, vertex colours)
    const o = new THREE.Object3D();
    const mountainGeo = (snow, base, peak) => {
      const g = new THREE.ConeGeometry(1, 1, 9, 4).toNonIndexed(); const p = g.attributes.position, cl = new Float32Array(p.count * 3), cc = new THREE.Color();
      const rr = BR.util.rng(this.seed + (snow ? 31 : 37));
      const jit = {}; const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      for (let i = 0; i < p.count; i++) {
        const k0 = key(p.getX(i), p.getY(i), p.getZ(i));
        if (!jit[k0]) jit[k0] = [(rr() - 0.5) * 0.18, (rr() - 0.5) * 0.08];
        const y = p.getY(i), h = y + 0.5;
        if (h > 0.02 && h < 0.98) { p.setX(i, p.getX(i) * (1 + jit[k0][0])); p.setZ(i, p.getZ(i) * (1 + jit[k0][0])); p.setY(i, y + jit[k0][1]); }
        cc.setHex(base).lerp(new THREE.Color(peak), h);
        if (snow && h > 0.68) cc.setHex(0xf4f8ff);
        cl[i * 3] = cc.r; cl[i * 3 + 1] = cc.g; cl[i * 3 + 2] = cc.b;
      }
      g.computeVertexNormals();
      const nn = g.attributes.normal, haze = new THREE.Color(0xc9e4f6);      // bake sun shading + aerial haze (no fog on these)
      for (let i = 0; i < p.count; i++) {
        const lit = 0.72 + 0.38 * Math.max(0, nn.getX(i) * SUN.x + nn.getY(i) * SUN.y + nn.getZ(i) * SUN.z);
        cc.setRGB(cl[i * 3] * lit, cl[i * 3 + 1] * lit, cl[i * 3 + 2] * lit).lerp(haze, snow ? 0.18 : 0.28);
        cl[i * 3] = cc.r; cl[i * 3 + 1] = cc.g; cl[i * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); return g;
    };
    const far = new THREE.InstancedMesh(mountainGeo(true, 0x77879a, 0xa6b2bf), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), 26);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + R() * 0.2, r = (this.arena ? H + 240 : H + 430) + R() * 120, hgt = 140 + R() * 160, wid = 120 + R() * 90;
      o.position.set(Math.cos(a) * r, hgt / 2 - 4, Math.sin(a) * r); o.scale.set(wid, hgt, wid); o.rotation.set(0, R() * 6, 0);
      o.updateMatrix(); far.setMatrixAt(i, o.matrix);
    }
    scene.add(far);
    const nHill = this.arena ? 22 : 9;      // a few distant islands out at sea (the arena keeps its ring of hills)
    const near = new THREE.InstancedMesh(mountainGeo(false, 0x56644e, 0x8a9580), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), nHill);
    for (let i = 0; i < nHill; i++) {
      const a = i / nHill * Math.PI * 2 + R() * 0.4, r = (this.arena ? H + 120 : H + 300) + R() * 90, hgt = this.arena ? 50 + R() * 60 : 35 + R() * 45, wid = 90 + R() * 70;
      o.position.set(Math.cos(a) * r, hgt / 2 - 3, Math.sin(a) * r); o.scale.set(wid, hgt, wid); o.rotation.set(0, R() * 6, 0);
      o.updateMatrix(); near.setMatrixAt(i, o.matrix);
    }
    scene.add(near);

    // Cumulus clouds: one merged cluster geometry (soft blobs, shaded underside), instanced
    const blob = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    const parts = [[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.8], [-1.05, -0.2, -0.1, 0.75], [0.45, 0.45, -0.2, 0.7], [-0.5, 0.35, 0.25, 0.65], [1.9, -0.35, 0, 0.5], [-1.8, -0.35, 0.1, 0.5]];
    const cp = [], ccol = [], cc2 = new THREE.Color();
    for (const [x, y, z, r] of parts) {
      const bp = blob.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const px = bp.getX(i) * r + x, py = bp.getY(i) * r * 0.8 + y, pz = bp.getZ(i) * r + z;
        cp.push(px, py, pz);
        const shade = BR.util.clamp((py + 0.9) / 1.6, 0, 1);
        cc2.setHex(0xaab4c0).lerp(new THREE.Color(0xeef2f5), shade);
        ccol.push(cc2.r, cc2.g, cc2.b);
      }
    }
    const cloudG = new THREE.BufferGeometry();
    cloudG.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cloudG.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
    const cl = new THREE.InstancedMesh(cloudG, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.82, depthWrite: false }), 22);
    for (let i = 0; i < 22; i++) {
      const a = R() * Math.PI * 2, r = 250 + R() * 520;
      o.position.set(Math.cos(a) * r, 150 + R() * 90, Math.sin(a) * r);
      const sz = 16 + R() * 20; o.scale.set(sz * (1.6 + R() * 1.0), sz * (0.32 + R() * 0.18), sz * 1.2); o.rotation.set(0, R() * 6, 0);
      o.updateMatrix(); cl.setMatrixAt(i, o.matrix);
    }
    scene.add(cl);
    this.clouds = cl;
    // high cirrus streaks
    const cirrusTex = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
      for (let i = 0; i < 40; i++) { const gy = 8 + Math.random() * 48, gx = Math.random() * 180; const gr = x.createLinearGradient(gx, 0, gx + 80, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.15 + Math.random() * 0.25})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(gx, gy, 80, 1.5 + Math.random() * 2.5); }
      return new THREE.CanvasTexture(cv); })();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(520, 130), new THREE.MeshBasicMaterial({ map: cirrusTex, transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      m.position.set((R() - 0.5) * 900, 330 + R() * 60, (R() - 0.5) * 900); m.rotation.set(-Math.PI / 2, 0, R() * 3); m.renderOrder = -7;
      scene.add(m);
    }

    // Trees: tapered trunks with a root flare, leafy trees get a cluster of rounded blobs in
    // varied greens, pines get four drooping tiers. All instanced, colour-varied per tree.
    const leafy = this.trees.filter(t => !t.pine), pines = this.trees.filter(t => t.pine), tc = new THREE.Color();
    if (this.trees.length) {
      const trunk = this.collector(trunkGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), this.trees.length, { lo: trunkGeometry(true), dist: 45 });
      const BK = [0x54402e, 0x4a3a2a, 0x5e4834];
      this.trees.forEach((t, i) => {
        o.position.set(t.x, 0, t.z); o.rotation.set(0, t.tone * 6, 0); o.scale.set(1, t.h + 0.6, 1); o.updateMatrix(); trunk.setMatrixAt(i, o.matrix);
        trunk.setColorAt(i, tc.setHex(BK[Math.floor(t.tone * 7) % 3]));
      });
    }
    if (leafy.length) {
      // v1.36: two canopy shapes (8 lumpy blobs each, soft dome shading), one instance per tree
      const geos = [canopyGeometry(this.seed + 101), canopyGeometry(this.seed + 202)], lows = [canopyGeometry(this.seed + 101, 0), canopyGeometry(this.seed + 202, 0)], mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const groups = [leafy.filter((t, i) => i % 2 === 0), leafy.filter((t, i) => i % 2 === 1)];
      const GR = [0x4f8a3a, 0x3f7a34, 0x5e9a40, 0x6aa648, 0x4a7f3e, 0x74a24a];
      groups.forEach((list, gi) => {
        if (!list.length) return;
        const lv = this.collector(geos[gi], mat, list.length, { lo: lows[gi], dist: 45 });
        list.forEach((t, i) => {
          o.position.set(t.x, t.h, t.z); o.scale.set(t.s, t.s * (0.92 + t.tone * 0.16), t.s); o.rotation.set(0, t.tone * 6.28, 0);
          o.updateMatrix(); lv.setMatrixAt(i, o.matrix); lv.setColorAt(i, tc.setHex(GR[Math.floor(t.tone * GR.length)]));
        });
      });
    }
    if (pines.length) {
      // v1.36: one merged five-tier pine per tree (jagged drooping tiers, shaded toward the trunk)
      const geos = [pineGeometry(0), pineGeometry(1.7)], lows = [pineGeometry(0, true), pineGeometry(1.7, true)], mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const PG = [0x2f5a35, 0x2a5232, 0x376640, 0x2c5e3c, 0x3a6a3a];
      [0, 1].forEach(gi => {
        const list = pines.filter((t, i) => i % 2 === gi); if (!list.length) return;
        const pm = this.collector(geos[gi], mat, list.length, { lo: lows[gi], dist: 45 });
        list.forEach((t, i) => {
          o.position.set(t.x, t.h * 0.45, t.z); o.scale.setScalar(t.s); o.rotation.set(0, t.tone * 6.28, 0);
          o.updateMatrix(); pm.setMatrixAt(i, o.matrix); pm.setColorAt(i, tc.setHex(PG[Math.floor(t.tone * PG.length)]).multiplyScalar(1.12));
        });
      });
    }

    // Cars: one modelled, vertex-coloured mesh per car (shared geometry per paint colour)
    for (const c of (this.props.cars || [])) {
      const m = new THREE.Mesh(carGeometry(c.color), carMat());
      m.position.set(c.x, c.y || 0, c.z); m.rotation.y = (c.axis === 'x' ? 0 : Math.PI / 2) + (c.flip ? Math.PI : 0);
      m.matrixAutoUpdate = false; m.updateMatrix();
      scene.add(m);
      this.addChunk(m, m.position, 3);
    }

    // ---- Natural rock: ridges / rocks / ledges are hidden collision boxes drawn as jittered,
    // moss-topped boulders; plateaus get rocky skirts so nothing reads as a box.
    const rockGeo = (seed, det) => {
      const g = new THREE.IcosahedronGeometry(1, det === undefined ? 1 : det).toNonIndexed(), p = g.attributes.position, rr = BR.util.rng(seed), jit = {};      // v1.36: more facets, chiselled
      for (let i = 0; i < p.count; i++) {
        const k0 = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
        const f = jit[k0] || (jit[k0] = 0.8 + rr() * 0.32);
        const y = p.getY(i), fy = y > 0.55 ? 0.55 + (y - 0.55) * 0.35 : y < -0.6 ? -0.6 + (y + 0.6) * 0.3 : y;      // flattened top + base
        p.setXYZ(i, p.getX(i) * f, fy * f, p.getZ(i) * f);
      }
      g.computeBoundingBox(); const bb = g.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz); const ct = new THREE.Vector3(); bb.getCenter(ct);
      g.translate(-ct.x, -ct.y, -ct.z); g.scale(1 / sz.x, 1 / sz.y, 1 / sz.z);                    // unit cube [-0.5, 0.5]
      g.computeVertexNormals();
      const n = g.attributes.normal, cl = new Float32Array(p.count * 3), moss = new THREE.Color(0x6f9a4a), stone = new THREE.Color(1, 1, 1), cc = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), ao = 0.68 + 0.32 * BR.util.clamp(y + 0.5, 0, 1), strata = 1 + 0.05 * Math.sin(y * 19 + seed);
        cc.copy(stone).multiplyScalar(ao * strata).lerp(moss, BR.util.clamp((n.getY(i) - 0.6) * 2.2, 0, 0.8));
        cl[i * 3] = cc.r; cl[i * 3 + 1] = cc.g; cl[i * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      return g;
    };
    const chunks = [];      // {x, y, z, sx, sy, sz, ry, tone}
    const RR = BR.util.rng(this.seed + 77);
    for (const b of this.props.rockFill || []) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const along = w >= d, L = Math.max(w, d), T = Math.min(w, d);
      const tone = b.color === PAL.cliff ? 0.62 : 0.85;
      if (L / T < 1.8) { chunks.push({ x: cx, y: b.y0 + h / 2, z: cz, sx: w * 1.08, sy: h * 1.04, sz: d * 1.08, ry: RR() * 0.4, tone: tone + RR() * 0.1 }); continue; }
      const step = Math.max(1.8, T * 0.55), n = Math.ceil(L / step);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5, hh = h * (0.86 + RR() * 0.26), len = step * (1.7 + RR() * 0.6), th = T * (1.05 + RR() * 0.25);
        const px = along ? cx + u * L : cx + (RR() - 0.5) * T * 0.15, pz = along ? cz + (RR() - 0.5) * T * 0.15 : cz + u * L;
        chunks.push({ x: px, y: b.y0 + hh / 2, z: pz, sx: along ? len : th, sy: hh, sz: along ? th : len, ry: (RR() - 0.5) * 0.9, rx: (RR() - 0.5) * 0.25, tone: tone + RR() * 0.14 });
        if (i % 2 === 0) {                              // base boulder on a random side
          const side = RR() < 0.5 ? -1 : 1, bs = T * (0.45 + RR() * 0.3), bh = h * (0.25 + RR() * 0.25);
          chunks.push({ x: px + (along ? 0 : side * T * 0.62), y: b.y0 + bh / 2, z: pz + (along ? side * T * 0.62 : 0), sx: bs * 1.3, sy: bh, sz: bs, ry: RR() * 6, rx: (RR() - 0.5) * 0.4, tone: tone + RR() * 0.15 });
        }
        if (h > 4 && RR() < 0.35) {                    // crag poking up from the top
          const cs = T * (0.35 + RR() * 0.25), ch = h * (0.18 + RR() * 0.15);
          chunks.push({ x: px, y: b.y0 + hh - ch * 0.2, z: pz, sx: cs, sy: ch * 1.6, sz: cs, ry: RR() * 6, rx: (RR() - 0.5) * 0.5, tone: tone + 0.05 });
        }
      }
    }
    for (const b of this.props.rockSkirt || []) {                                  // skirts round plateaus
      const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
      for (const [ax, az, len] of [[0, -1, w], [0, 1, w], [-1, 0, d], [1, 0, d]]) {
        const n = Math.ceil(len / 4.5);
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n - 0.5, hh = h * (0.7 + RR() * 0.35), sz2 = 3.4 + RR() * 2;
          const px = ax ? (ax < 0 ? b.x0 : b.x1) + ax * 0.6 : b.x0 + w / 2 + u * w, pz = az ? (az < 0 ? b.z0 : b.z1) + az * 0.6 : b.z0 + d / 2 + u * d;
          chunks.push({ x: px, y: b.y0 + hh / 2, z: pz, sx: ax ? 2.6 : sz2, sy: hh, sz: az ? 2.6 : sz2, ry: RR() * 6, tone: 0.6 + RR() * 0.15 });      // (absolute, like the others)
        }
      }
    }
    if (chunks.length) {
      const geos = [rockGeo(11), rockGeo(29)], mats = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const half = Math.ceil(chunks.length / 2), meshes = geos.map((gg, i) => this.collector(gg, mats, i ? chunks.length - half : half, { lo: rockGeo(i ? 29 : 11, 0), dist: 60 })); meshes.forEach(m => { m.noLift = true; });     // (rock chunks come from already-lifted boxes)
      const rcol = new THREE.Color();
      chunks.forEach((q, i) => {
        const m = meshes[i < half ? 0 : 1], j = i < half ? i : i - half;
        o.position.set(q.x, q.y, q.z); o.rotation.set(q.rx || 0, q.ry, (q.rx || 0) * 0.7); o.scale.set(q.sx, q.sy, q.sz); o.updateMatrix();
        m.setMatrixAt(j, o.matrix); m.setColorAt(j, rcol.setRGB(0.55 * q.tone + 0.05, 0.56 * q.tone + 0.05, 0.53 * q.tone + 0.04).multiplyScalar(1.15));
      });

    }

    // Props from the dressing pass (instanced: one draw call each)
    const P = this.props, col = new THREE.Color();
    const inst = (geo, mat, list, place, lod) => {
      if (!list.length) return null;
      const m = this.collector(geo, mat, list.length, lod);
      list.forEach((q, i) => { place(q, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      return m;
    };
    // Props with two-tone vertex colours (one draw call per tile instead of several):
    // drums with dark rib bands, logs with cut ends, stumps with ring tops
    const twoTone = (geo, sideHex, capHex, extra) => {
      const g = geo.toNonIndexed(); const parts = [g].concat(extra || []); let n = 0; parts.forEach(q => n += q.attributes.position.count);
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), cs = new THREE.Color(sideHex), cc = new THREE.Color(capHex), cr = new THREE.Color(0x2a2d33);
      let o2 = 0;
      parts.forEach((q, pi) => { const pa = q.attributes.position, na = q.attributes.normal;
        for (let i = 0; i < pa.count; i++, o2++) { P.set([pa.getX(i), pa.getY(i), pa.getZ(i)], o2 * 3); N.set([na.getX(i), na.getY(i), na.getZ(i)], o2 * 3);
          const c3 = pi > 0 ? cr : Math.abs(na.getY(i)) > 0.9 ? cc : cs; C.set([c3.r, c3.g, c3.b], o2 * 3); } });
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3)); out.computeBoundingSphere(); return out;
    };
    const BC = [0x2f6fa8, 0xb8433f, 0x3f7a4a, 0x8a5a32];
    const ribs = [0.3 - 0.475, 0.65 - 0.475].map(y => new THREE.CylinderGeometry(0.315, 0.315, 0.05, 12).toNonIndexed().translate(0, y, 0));
    const drum = inst(twoTone(new THREE.CylinderGeometry(0.3, 0.3, 0.95, 12), 0xffffff, 0xd8d8d8, ribs), new THREE.MeshLambertMaterial({ vertexColors: true }), P.barrels, q => {
      o.position.set(q.x, q.tip ? 0.3 : 0.475, q.z); o.scale.set(1, 1, 1); o.rotation.set(q.tip ? Math.PI / 2 : 0, q.x * 3, 0);
    });
    if (drum) P.barrels.forEach((q, i) => drum.setColorAt(i, col.setHex(BC[q.c])));
    const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    inst(twoTone(new THREE.CylinderGeometry(1, 1, 1, 9), 0x5e4129, 0xc9a46c), woodMat, P.logs, q => {
      o.position.set(q.x, q.r, q.z); o.scale.set(q.r, q.L, q.r); o.rotation.set(q.alongX ? 0 : Math.PI / 2, 0, q.alongX ? Math.PI / 2 : 0);
    });
    inst(twoTone(new THREE.CylinderGeometry(0.85, 1, 1, 9), 0x5e4129, 0xc9a46c), woodMat, P.stumps, q => { o.position.set(q.x, q.h / 2, q.z); o.scale.set(q.s, q.h, q.s); o.rotation.set(0, q.x, 0); });
    // loose boulders round the rocks
    inst(rockGeo(41), new THREE.MeshLambertMaterial({ color: 0x9a9c96, vertexColors: true, flatShading: true }), P.boulders, q => {
      o.position.set(q.x, q.s * 0.55, q.z); o.scale.set(q.s * 2.3, q.s * 1.5, q.s * 2); o.rotation.set((q.x % 1) * 0.3, q.z, 0);
    }, { lo: rockGeo(41, 0), dist: 45 });
    // ponds: sandy shore, water, lily pads, reeds
    for (const q of P.ponds) {
      const shore = new THREE.Mesh(new THREE.CircleGeometry(q.r + 1.4, 28), new THREE.MeshLambertMaterial({ color: 0xa89a6c }));
      shore.rotation.x = -Math.PI / 2; shore.position.set(q.x, (q.y || 0) + 0.02, q.z); scene.add(shore);
      const water = new THREE.Mesh(new THREE.CircleGeometry(q.r, 28), new THREE.MeshPhongMaterial({ color: 0x3a7aa6, specular: 0xcfe8ff, shininess: 80, transparent: true, opacity: 0.88 }));
      water.rotation.x = -Math.PI / 2; water.position.set(q.x, (q.y || 0) + 0.05, q.z); scene.add(water);
      q.mesh = water;
    }
    const pads = [], reeds = [];
    P.ponds.forEach(q => {
      for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = R() * q.r * 0.8; pads.push({ x: q.x + Math.cos(a) * d, z: q.z + Math.sin(a) * d, s: 0.3 + R() * 0.35 }); }
      for (let i = 0; i < 26 * detail + 6; i++) { const a = R() * 6.28, d = q.r + (R() - 0.3) * 1.2; reeds.push({ x: q.x + Math.cos(a) * d, z: q.z + Math.sin(a) * d, h: 0.8 + R() * 0.9 }); }
    });
    inst(new THREE.CircleGeometry(1, 9), new THREE.MeshLambertMaterial({ color: 0x4f8a3c, side: THREE.DoubleSide }), pads, q => { o.position.set(q.x, 0.07, q.z); o.scale.set(q.s, q.s, q.s); o.rotation.set(-Math.PI / 2, 0, q.x); });
    inst(new THREE.ConeGeometry(0.05, 1, 3), new THREE.MeshLambertMaterial({ color: 0x5a7a32 }), reeds, q => { o.position.set(q.x, q.h / 2, q.z); o.scale.set(1, q.h, 1); o.rotation.set((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3); });

    // Bushes + grass tufts scattered on open ground (count scales with Graphics)
    const nB = this.arena ? 0 : Math.floor(700 * detail), nG = this.arena ? 0 : Math.floor(5000 * detail);
    const bush = this.collector(bushGeometry(this.seed + 9), new THREE.MeshLambertMaterial({ vertexColors: true }), nB, { lo: bushGeometry(this.seed + 9, 0), dist: 30 });      // v1.36: clustered, shaded bushes
    const BG = [0x55803e, 0x4a7a3a, 0x5f8f42, 0x6b9446, 0x47703a], bc = new THREE.Color();
    const tuft = this.collector(grassTuftGeometry(), new THREE.MeshLambertMaterial({ color: 0x6f8a4c, vertexColors: true, side: THREE.DoubleSide }), nG, { lo: null, dist: 40 });      // v1.36: fanned blades
    let bi = 0, gi = 0;
    for (let tries = 0; tries < (nB + nG) * 2 && (bi < nB || gi < nG); tries++) {
      const x = (R() * 2 - 1) * (H - 4), z = (R() * 2 - 1) * (H - 4);
      if (!this.free(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0)) continue;
      if (bi < nB && R() < 0.12) {
        const s = 0.5 + R() * 0.6;
        o.position.set(x, s * 0.42, z); o.scale.set(s * 1.1, s * (0.8 + R() * 0.3), s * 1.1); o.rotation.set(0, R() * 6, 0);
        o.updateMatrix(); bush.setMatrixAt(bi, o.matrix); bush.setColorAt(bi++, bc.setHex(BG[Math.floor(R() * BG.length)]).multiplyScalar(1.1));
      } else if (gi < nG) {
        const s = 0.3 + R() * 0.35;
        o.position.set(x, 0, z); o.scale.set(s * 1.2, s, s * 1.2); o.rotation.set(0, R() * 6, 0);
        o.updateMatrix(); tuft.setMatrixAt(gi++, o.matrix);
      }
    }
    bush.count = bi; tuft.count = gi;
    if (bush.instanceColor) bush.instanceColor.needsUpdate = true;

    // Wildflower patches
    const nF = this.arena ? 0 : Math.floor(2400 * detail), FC = [0xf4f4f4, 0xf2d24a, 0xe0546a, 0x9a6ad9, 0xf28a3c];
    if (nF > 0) {
      const fl = this.collector(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), nF, { lo: null, dist: 40 });
      let fi = 0;
      for (let tries = 0; tries < nF && fi < nF; tries++) {
        const px = (R() * 2 - 1) * (H - 6), pz = (R() * 2 - 1) * (H - 6);
        if (!this.free(px - 2, pz - 2, px + 2, pz + 2, 0)) continue;
        const c = FC[Math.floor(R() * FC.length)], n = 8 + Math.floor(R() * 14);
        for (let k = 0; k < n && fi < nF; k++) {
          o.position.set(px + (R() - 0.5) * 3.5, 0.18 + R() * 0.15, pz + (R() - 0.5) * 3.5); o.scale.setScalar(0.8 + R() * 0.7); o.rotation.set(0, 0, 0);
          o.updateMatrix(); fl.setMatrixAt(fi, o.matrix); fl.setColorAt(fi, col.setHex(c)); fi++;
        }
      }
      fl.count = fi;
    }
    // build all the collected instanced scenery as culled 80 m tiles
    for (const c of this._pend || []) c.flush(scene);
    this._pend = [];
  }

  // Top-down picture of the map for the minimap.
  renderMinimap(px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const ctx = cv.getContext('2d');
    const k = px / this.size, H = this.half;
    ctx.fillStyle = '#4e6440';
    ctx.fillRect(0, 0, px, px);
    if (this.T) {                                      // v1.35: shaded relief (lit from the north-west), greener low, drier and rockier up high
      const q = Math.max(1, Math.round(px / 384)), pw = Math.ceil(px / q), cv2 = document.createElement('canvas'); cv2.width = cv2.height = pw; const c2 = cv2.getContext('2d');
      const img = c2.createImageData(pw, pw), D = img.data, st = this.size / pw;
      for (let yy = 0; yy < pw; yy++) for (let xx = 0; xx < pw; xx++) {
        const x = -H + (xx + 0.5) * st, z = -H + (yy + 0.5) * st, y = this.heightAt(x, z), gx = this.heightAt(x + 3, z) - this.heightAt(x - 3, z), gz = this.heightAt(x, z + 3) - this.heightAt(x, z - 3);
        const sh = BR.util.clamp(0.82 - (gx + gz) * 0.09, 0.45, 1.25), t = BR.util.clamp(y / 26, 0, 1), o2 = (yy * pw + xx) * 4;
        D[o2] = Math.min(255, (78 + 70 * t) * sh); D[o2 + 1] = Math.min(255, (100 + 40 * t) * sh); D[o2 + 2] = Math.min(255, (64 + 40 * t) * sh); D[o2 + 3] = 255;
      }
      c2.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(cv2, 0, 0, px, px);
    }
    const sorted = this.boxes.filter(b => b.tag !== 'edge').sort((a, b) => a.y1 - b.y1);
    for (const b of sorted) {
      const l = Math.min(1, 0.35 + (b.y1 - (this.T ? this.heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) : 0)) / 12);
      ctx.fillStyle = `rgba(${Math.round(190 * l + 40)},${Math.round(185 * l + 40)},${Math.round(165 * l + 40)},0.9)`;
      ctx.fillRect((b.x0 + H) * k, (b.z0 + H) * k, Math.max(1, (b.x1 - b.x0) * k), Math.max(1, (b.z1 - b.z0) * k));
    }
    return cv;
  }
};

// ---- Car model: extruded side profile body, glasshouse, wheels with rims, lights, grille,
// bumpers and mirrors - merged into one vertex-coloured geometry per paint colour.
const CAR_CACHE = {};
let CAR_MAT = null;
function carMat() { return CAR_MAT || (CAR_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x666666, shininess: 70 })); }
function carGeometry(paint) {
  if (CAR_CACHE[paint]) return CAR_CACHE[paint];
  const parts = [];                                   // [geometry, colorHex]
  const W = 1.82;
  const extrude = (pts, depth, bevel) => {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -depth / 2); return g;
  };
  // body side profile (x = length, y = height), front at +x
  parts.push([extrude([[-2.12, 0.34], [-2.16, 0.62], [-2.08, 0.92], [-1.25, 1.0], [1.2, 1.0], [2.02, 0.9], [2.16, 0.7], [2.14, 0.34]], W - 0.1, 0.05), paint]);
  // glasshouse (slightly narrower), then the roof skin on top of it
  parts.push([extrude([[-1.18, 0.98], [-0.78, 1.5], [0.52, 1.52], [1.14, 0.98]], W - 0.26, 0.03), 0x1e2a36]);
  parts.push([extrude([[-0.74, 1.49], [0.5, 1.51], [0.47, 1.57], [-0.7, 1.56]], W - 0.22, 0.02), paint]);
  const box = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push([g, c]); };
  box(0.06, 0.12, W - 0.5, 2.16, 0.55, 0, 0x15171a);                                        // grille
  for (const zz of [-0.62, 0.62]) { box(0.05, 0.12, 0.34, 2.14, 0.74, zz, 0xfff6d8); box(0.05, 0.12, 0.3, -2.15, 0.76, zz, 0xd8202a); }
  box(0.22, 0.14, W - 0.02, 2.12, 0.4, 0, 0x26292e); box(0.22, 0.14, W - 0.02, -2.1, 0.4, 0, 0x26292e);   // bumpers
  box(4.0, 0.06, 0.02, 0, 0.62, W / 2 - 0.04, 0x8a9098); box(4.0, 0.06, 0.02, 0, 0.62, -W / 2 + 0.04, 0x8a9098);  // chrome strips
  for (const zz of [-1, 1]) box(0.14, 0.08, 0.12, 1.02, 1.02, zz * (W / 2 + 0.02), paint);              // mirrors
  // wheels: tyre + rim + hub
  for (const xx of [-1.3, 1.3]) for (const zz of [-1, 1]) {
    const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16); tyre.rotateX(Math.PI / 2); tyre.translate(xx, 0.36, zz * (W / 2 - 0.1)); parts.push([tyre, 0x18191b]);
    const rim = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12); rim.rotateX(Math.PI / 2); rim.translate(xx, 0.36, zz * (W / 2 + 0.03)); parts.push([rim, 0xb9c0c8]);
    const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8); hub.rotateX(Math.PI / 2); hub.translate(xx, 0.36, zz * (W / 2 + 0.05)); parts.push([hub, 0x5a6068]);
  }
  // merge into one coloured geometry
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals();
    c.setHex(hex); const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere(); out._shared = true;
  return (CAR_CACHE[paint] = out);
}

// ---- v1.36 scenery geometry helpers: lumpy watertight blobs, smooth normals, colour merges ----
function sceneryHash(x, y, z, s) { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.581) * 43758.5453; return h - Math.floor(h); }
// Icosphere with every shared corner pushed by the same amount (no cracks), plus a soft wave.
function lumpyBlob(detail, amp, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = sceneryHash(Math.round(x * 500), Math.round(y * 500), Math.round(z * 500), seed);
    const w = Math.sin(x * 2.3 + seed) * Math.sin(y * 2.9 + seed * 0.7) * Math.sin(z * 2.1 + seed * 1.3);
    const f = 1 + amp * ((n - 0.5) * 0.9 + w * 0.7);
    p.setXYZ(i, x * f, y * f, z * f);
  }
  return g;
}
// Area-weighted smooth normals over shared positions of a non-indexed geometry.
function smoothNormals(g) {
  const p = g.attributes.position, acc = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const key = i => Math.round(p.getX(i) * 1000) + ',' + Math.round(p.getY(i) * 1000) + ',' + Math.round(p.getZ(i) * 1000);
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a); b.cross(c);
    for (let k = 0; k < 3; k++) { const kk = key(i + k); let v = acc.get(kk); if (!v) acc.set(kk, v = new THREE.Vector3()); v.add(b); }
  }
  const nn = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = acc.get(key(i)).clone().normalize(); nn[i * 3] = v.x; nn[i * 3 + 1] = v.y; nn[i * 3 + 2] = v.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return g;
}
// Merge non-indexed parts into one vertex-coloured geometry. shade(x, y, z, nx, ny, nz, part) -> [r, g, b]
function mergeShaded(parts, shade) {
  let n = 0; parts.forEach(q => n += q.attributes.position.count);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  parts.forEach((q, pi) => {
    if (!q.attributes.normal) q.computeVertexNormals();
    const pa = q.attributes.position, na = q.attributes.normal;
    for (let i = 0; i < pa.count; i++, o++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), nx = na.getX(i), ny = na.getY(i), nz = na.getZ(i);
      P[o * 3] = x; P[o * 3 + 1] = y; P[o * 3 + 2] = z; N[o * 3] = nx; N[o * 3 + 1] = ny; N[o * 3 + 2] = nz;
      const c = shade(x, y, z, nx, ny, nz, pi); C[o * 3] = c[0]; C[o * 3 + 1] = c[1]; C[o * 3 + 2] = c[2];
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.computeBoundingSphere();
  return g;
}
// Leafy canopy: a dome of 8 lumpy blobs with soft unified shading (darker underneath, sunlit crown).
function canopyGeometry(seed, det) {
  const r = BR.util.rng(seed), parts = [], lay = [[0, 0.35, 0, 1.0]];
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + r() * 0.6, d = 0.55 + r() * 0.15; lay.push([Math.cos(a) * d, 0.02 + r() * 0.25, Math.sin(a) * d, 0.58 + r() * 0.14]); }
  for (let i = 0; i < 2; i++) { const a = r() * 6.283; lay.push([Math.cos(a) * 0.25, 0.85 + r() * 0.12, Math.sin(a) * 0.25, 0.55 + r() * 0.08]); }
  const tint = [];
  lay.forEach(([dx, dy, dz, sc], j) => {
    const b = smoothNormals(lumpyBlob(det === undefined ? 1 : det, 0.2, seed + j * 7));
    b.scale(sc, sc * 0.86, sc); b.translate(dx, dy, dz);
    const pa = b.attributes.position, na = b.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {        // lean blob normals toward the canopy's overall dome so it reads as one crown
      v.set(pa.getX(i), (pa.getY(i) - 0.3) * 1.15, pa.getZ(i)).normalize().multiplyScalar(0.45).add(new THREE.Vector3(na.getX(i), na.getY(i), na.getZ(i)).multiplyScalar(0.55)).normalize();
      na.setXYZ(i, v.x, v.y, v.z);
    }
    parts.push(b); tint.push(0.93 + r() * 0.14);
  });
  return mergeShaded(parts, (x, y, z, nx, ny, nz, pi) => {
    const ao = BR.util.clamp((y + 0.55) / 1.7, 0, 1), k = (0.52 + 0.48 * Math.pow(ao, 0.8)) * tint[pi], sun = Math.max(0, ny) * ao;
    return [k * (1 + 0.1 * sun), k * (1 + 0.06 * sun), k * (0.95 - 0.12 * sun)];
  });
}
// Trunk with root flare, a gentle bend, two stub branches and bark shading (unit height; scaled per tree).
function trunkGeometry(lo) {
  const g = new THREE.CylinderGeometry(0.11, 0.24, 1, lo ? 5 : 9, lo ? 2 : 6).toNonIndexed(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5, a = Math.atan2(p.getZ(i), p.getX(i));
    let f = 1; if (y < 0.14) f += (1 - y / 0.14) * (0.55 + 0.35 * Math.cos(a * 5));        // roots
    p.setXYZ(i, p.getX(i) * f + Math.sin(y * 3.1) * 0.05, y, p.getZ(i) * f + Math.sin(y * 2.3 + 1) * 0.03);
  }
  const parts = [smoothNormals(g)], m = new THREE.Matrix4();
  for (const [ya, yy, tilt] of lo ? [] : [[0.4, 0.68, 0.75], [2.8, 0.78, 0.65]]) {
    const br = new THREE.CylinderGeometry(0.035, 0.065, 0.32, 6).toNonIndexed(); br.translate(0, 0.16, 0);
    br.applyMatrix4(m.makeRotationZ(tilt)); br.applyMatrix4(m.makeRotationY(ya)); br.translate(Math.sin(yy * 3.1) * 0.05, yy, Math.sin(yy * 2.3 + 1) * 0.03);
    parts.push(br);
  }
  return mergeShaded(parts, (x, y, z) => {
    const a = Math.atan2(z, x), k = (0.62 + 0.38 * BR.util.clamp(y * 1.6, 0, 1)) * (0.9 + 0.1 * Math.sin(a * 7 + y * 9));
    return [k, k * 0.97, k * 0.93];
  });
}
// Pine: five jagged needle tiers, darker toward the trunk and under each tier (unit scale; base at y 0).
function pineGeometry(seed, lo) {
  const parts = [], m = new THREE.Matrix4();
  for (let t = 0; t < 5; t++) {
    const w = 1.25 - t * 0.22, hh = 1.15 - t * 0.12, S = lo ? 6 : 12, g = new THREE.ConeGeometry(1, 1, S, lo ? 1 : 2).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), j = Math.round((a + Math.PI) / (Math.PI * 2) * S) % 2;
      if (y < -0.45 && Math.hypot(x, z) > 0.5) p.setXYZ(i, x * (j ? 0.8 : 1.04), y - (j ? 0 : 0.12), z * (j ? 0.8 : 1.04));     // jagged drooping rim
      else if (Math.abs(y) < 0.01) p.setXYZ(i, x * 0.96, y - 0.03, z * 0.96);
    }
    g.applyMatrix4(m.makeRotationY(t * 0.55 + seed)); g.scale(w, hh, w); g.translate(0, t * 0.5 + hh / 2, 0);
    parts.push(smoothNormals(g));
  }
  return mergeShaded(parts, (x, y, z, nx, ny, nz, t) => {
    if (ny < -0.6) return [0.32, 0.36, 0.33];                                       // underside of a tier
    const w = 1.25 - t * 0.22, out = BR.util.clamp(Math.hypot(x, z) / w, 0, 1), k = (0.55 + 0.5 * out) * (0.9 + t * 0.04);
    return [k * (1 + 0.06 * out), k * (1 + 0.04 * out), k];
  });
}
// Bush: four lumpy blobs, shaded darker at the base.
function bushGeometry(seed, det) {
  const r = BR.util.rng(seed), parts = [];
  for (const [dx, dy, dz, sc] of [[0, 0.1, 0, 1], [0.6, -0.1, 0.2, 0.7], [-0.5, -0.08, -0.25, 0.72], [0.1, 0.05, 0.55, 0.62]]) {
    const b = smoothNormals(lumpyBlob(det === undefined ? 1 : det, 0.24, seed + dx * 10)); b.scale(sc, sc * 0.8, sc); b.rotateY(r() * 6); b.translate(dx, dy, dz); parts.push(b);
  }
  return mergeShaded(parts, (x, y, z, nx, ny) => { const k = 0.5 + 0.5 * BR.util.clamp((y + 0.7) / 1.4, 0, 1) + 0.08 * Math.max(0, ny); return [k, k, k * 0.94]; });
}
// Grass tuft: five thin blades fanning out, dark at the root and sun-bleached at the tips.
function grassTuftGeometry() {
  const P = [], C = [], N = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * 6.283 + 0.4, lean = 0.18 + (i % 2) * 0.12, h = 0.75 + (i % 3) * 0.15, w = 0.045;
    const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05, tx = Math.cos(a) * lean, tz = Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    P.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    C.push(0.55, 0.6, 0.5, 0.55, 0.6, 0.5, 1.12, 1.1, 0.82);
    N.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere();
  return g;
}

function makeTileTexture(grass) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  const r = BR.util.rng(grass ? 7 : 3);
  if (grass) {
    // Natural ground: soft blotches + thousands of short grass strokes, no tile lines
    cv.width = cv.height = 256;
    const S2 = 256;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S2, S2);
    for (let i = 0; i < 60; i++) {
      const x = r() * S2, y = r() * S2, rad = 8 + r() * 26, dark = r() < 0.5;
      for (const [ox, oy] of [[0, 0], [S2, 0], [-S2, 0], [0, S2], [0, -S2]]) {
        const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,230,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (let i = 0; i < 3200; i++) {
      const x = r() * S2, y = r() * S2, l = 3 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 1.1, dk = r() < 0.55;
      ctx.strokeStyle = dk ? `rgba(20,40,10,${0.1 + r() * 0.12})` : `rgba(255,255,210,${0.08 + r() * 0.12})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(90,70,40,${0.1 + r() * 0.1})`; ctx.fillRect(r() * S2, r() * S2, 2, 2); }  // grit
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }
  // Weathered concrete / plaster: layered soft mottling, fine grain, small pits, a faint
  // formwork seam and streaks. No hard tile borders (those made the world read as blocks).
  cv.width = cv.height = 256;
  const S3 = 256;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S3, S3);
  for (let i = 0; i < 90; i++) {
    const x = r() * S3, y = r() * S3, rad = 6 + r() * 40, dark = r() < 0.55;
    for (const [ox, oy] of [[0, 0], [S3, 0], [-S3, 0], [0, S3], [0, -S3]]) {
      const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, dark ? `rgba(0,0,0,${0.035 + r() * 0.05})` : `rgba(255,255,255,${0.04 + r() * 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  for (let i = 0; i < 5000; i++) { const v = r(); ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.03 + r() * 0.05})` : `rgba(255,255,255,${0.03 + r() * 0.05})`; ctx.fillRect(r() * S3, r() * S3, 1, 1); }
  for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.12})`; const x = r() * S3, y = r() * S3, w = 1 + r() * 2; ctx.fillRect(x, y, w, w); }   // pits
  for (let i = 0; i < 14; i++) { const x = r() * S3, l = 30 + r() * 90, gr = ctx.createLinearGradient(0, 0, 0, l);     // rain streaks
    gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x, r() * S3, 2 + r() * 4, l); }
  ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, 127, S3, 1.5);                                   // faint formwork seam
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 129, S3, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// =============================================================================
// IRONREEF (v1.11.1) — a small island for Resurgence (original layout, inspired by the compact
// prison-island maps of other shooters). A walled prison in the middle with cell blocks, a warden
// tower and four guard towers; a chemical plant; docks with a container yard; a lighthouse; a
// little harbour town; a fortified hill. Tight sightlines, lots of rooftops, fast rotations.
// =============================================================================
Object.assign(BR.World.prototype, {
  generateReef() {
    const R = this.rand, U = BR.util, H = this.half;
    const B = (x0, y0, z0, x1, y1, z1, c, o) => this.addBox(x0, y0, z0, x1, y1, z1, c, o);
    const D = (x0, y0, z0, x1, y1, z1, c) => this.addBox(x0, y0, z0, x1, y1, z1, c, { decor: true });
    const CON = 0x8e8a82, CON2 = 0x77736c, RUST = 0x7a4a34, STEEL = PAL.tower, WARN = 0xd9a02a;
    // invisible boundary at the edge of the water
    const bw = 6, eh = 80;
    B(-H - bw, 0, -H - bw, H + bw, eh, -H, PAL.cliff, { tag: 'edge', hidden: true }); B(-H - bw, 0, H, H + bw, eh, H + bw, PAL.cliff, { tag: 'edge', hidden: true });
    B(-H - bw, 0, -H, -H, eh, H, PAL.cliff, { tag: 'edge', hidden: true }); B(H, 0, -H, H + bw, eh, H, PAL.cliff, { tag: 'edge', hidden: true });
    const guardTower = (x, z, h) => {
      B(x - 1.1, 0, z - 1.1, x + 1.1, h, z + 1.1, STEEL);                                  // leg
      B(x - 2.6, h, z - 2.6, x + 2.6, h + 0.3, z + 2.6, CON2);                            // deck
      for (const [a, b, c, d] of [[-2.6, -2.6, 2.6, -2.4], [-2.6, 2.4, 2.6, 2.6], [-2.6, -2.6, -2.4, 2.6], [2.4, -2.6, 2.6, 2.6]]) B(x + a, h + 0.3, z + b, x + c, h + 1.4, z + d, CON2);   // parapet
      D(x - 2.8, h + 3.1, z - 2.8, x + 2.8, h + 3.4, z + 2.8, 0x3a3d42);                  // roof
      for (const [a, b] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) D(x + a - 0.08, h + 1.4, z + b - 0.08, x + a + 0.08, h + 3.1, z + b + 0.08, 0x3a3d42);
      for (let i = 0; i < Math.floor(h / 0.9); i++) { const y = (i + 1) * 0.9; B(x + 1.1, y - 0.25, z - 0.6, x + 1.9, y, z + 0.6, PAL.parkour); }   // climb rungs
      this.chestSpots.push({ x, y: h + 0.3, z, tier: 2 });
    };
    // ---- THE STOCKADE (prison, centre)
    const sx = 0, sz = -8, SW = 76, SD = 62, WH = 5;
    this.claim(sx - SW / 2 - 4, sz - SD / 2 - 4, sx + SW / 2 + 4, sz + SD / 2 + 4);
    const gate = [{ a: -4, b: 4, gaps: [[0, 4]] }];
    this.wallSeg('x', sx - SW / 2, sx + SW / 2, sz - SD / 2 - 0.5, sz - SD / 2 + 0.5, 0, WH, gate.map(g => ({ a: sx + g.a, b: sx + g.b, gaps: g.gaps })), CON);
    this.wallSeg('x', sx - SW / 2, sx + SW / 2, sz + SD / 2 - 0.5, sz + SD / 2 + 0.5, 0, WH, [{ a: sx - 22, b: sx - 15, gaps: [[0, 4]] }, { a: sx + 15, b: sx + 22, gaps: [[0, 4]] }], CON);
    this.wallSeg('z', sz - SD / 2, sz + SD / 2, sx - SW / 2 - 0.5, sx - SW / 2 + 0.5, 0, WH, [{ a: sz - 4, b: sz + 4, gaps: [[0, 4]] }], CON);
    this.wallSeg('z', sz - SD / 2, sz + SD / 2, sx + SW / 2 - 0.5, sx + SW / 2 + 0.5, 0, WH, [{ a: sz - 4, b: sz + 4, gaps: [[0, 4]] }], CON);
    for (const z of [sz - SD / 2, sz + SD / 2]) D(sx - SW / 2, WH, z - 0.6, sx + SW / 2, WH + 0.2, z + 0.6, CON2);
    for (const x of [sx - SW / 2, sx + SW / 2]) D(x - 0.6, WH, sz - SD / 2, x + 0.6, WH + 0.2, sz + SD / 2, CON2);
    for (const z of [sz - SD / 2, sz + SD / 2]) for (let x = sx - SW / 2; x <= sx + SW / 2; x += 3) D(x - 0.04, WH + 0.2, z - 0.04, x + 0.04, WH + 1.2, z + 0.04, 0x2a2d33);   // wire posts
    this.building(sx - 20, sz - 14, 26, 12, 2);                 // cell block A
    this.building(sx - 20, sz + 14, 26, 12, 2);                 // cell block B
    this.building(sx + 22, sz + 14, 16, 14, 2);                 // mess hall
    this.building(sx + 22, sz - 15, 14, 12, 1);                 // infirmary
    this.tower(sx + 4, sz);                                     // warden tower (spiral climb)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) guardTower(sx + x * (SW / 2 - 3), sz + z * (SD / 2 - 3), 8);
    for (const [x, z, w, d] of [[-6, -2, 3, 0.7], [-6, 6, 0.7, 3], [12, 2, 3, 0.7], [12, -6, 0.7, 3]]) B(sx + x - w / 2, 0, sz + z - d / 2, sx + x + w / 2, 1.2, sz + z + d / 2, PAL.cover);   // yard cover
    for (let i = 0; i < 10; i++) this.lootSpots.push({ x: sx + U.rand(R, -SW / 2 + 4, SW / 2 - 4), y: 0, z: sz + U.rand(R, -SD / 2 + 4, SD / 2 - 4), tier: 1 });
    this.jumpPad(sx, sz - SD / 2 - 5); this.jumpPad(sx, sz + SD / 2 + 5);
    // ---- SALTWORKS (chemical plant, north-east)
    const cx = 92, cz = -78;
    this.claim(cx - 30, cz - 26, cx + 30, cz + 26);
    const tanks = [[-14, -10], [-2, -12], [10, -8], [-12, 6]];
    for (const [x, z] of tanks) { B(cx + x - 4, 0, cz + z - 4, cx + x + 4, 9, cz + z + 4, 0xb8b2a4); D(cx + x - 4.2, 2.8, cz + z - 4.2, cx + x + 4.2, 3.2, cz + z + 4.2, RUST); D(cx + x - 4.2, 6.6, cz + z - 4.2, cx + x + 4.2, 7, cz + z + 4.2, RUST); B(cx + x - 3, 9, cz + z - 3, cx + x + 3, 10, cz + z + 3, 0x9a958a); this.lootSpots.push({ x: cx + x, y: 10, z: cz + z, tier: 2, force: 'weapon' }); }
    B(cx - 14, 6.2, cz - 11, cx + 10, 6.6, cz - 9, STEEL);                     // catwalk linking the tanks
    for (let i = 0; i < 12; i++) { const y = (i + 1) * 0.55; B(cx + 14 + i * 0.01, 0, cz - 2 - i, cx + 17, y, cz - 1 - i, CON2); }   // stairs up
    B(cx + 13.5, 6.2, cz - 14, cx + 17.5, 6.6, cz - 9, STEEL);
    this.building(cx + 6, cz + 12, 16, 12, 1);
    for (let i = 0; i < 6; i++) D(cx - 20 + i * 7, 3.5, cz + 2, cx - 19.4 + i * 7, 4.1, cz + 22, 0x6a6f74);     // pipe rack
    D(cx - 22, 3.4, cz + 1.6, cx + 20, 3.6, cz + 22, 0x585e66);
    this.chestSpots.push({ x: cx + 2, y: 6.6, z: cz - 10, tier: 2 });
    // ---- PIER NINE (docks, south)
    const px = 22, pz = 118;
    this.yard(px, pz - 8);
    for (const x of [-30, -14, 2, 18]) { B(px + x - 2.5, -2, pz + 22, px + x + 2.5, 0.45, pz + 52, 0x6e5a44); for (let k = 0; k < 4; k++) D(px + x - 2.8, -2, pz + 26 + k * 8, px + x - 2.4, 1.1, pz + 26.4 + k * 8, 0x4a3a2a); this.lootSpots.push({ x: px + x, y: 0.45, z: pz + 46, tier: 1 }); }
    B(px - 34, -2, pz + 16, px + 24, 0.45, pz + 23, 0x6e5a44);                 // quay
    // ---- BEACON POINT (lighthouse, north-west)
    const lx = -112, lz = -98;
    this.claim(lx - 16, lz - 16, lx + 16, lz + 16);
    B(lx - 3, 0, lz - 3, lx + 3, 16, lz + 3, 0xe8e4dc); for (let y = 2; y < 16; y += 4) D(lx - 3.05, y, lz - 3.05, lx + 3.05, y + 1.4, lz + 3.05, 0xc8362c);
    B(lx - 4.2, 16, lz - 4.2, lx + 4.2, 16.4, lz + 4.2, STEEL); D(lx - 2.2, 16.4, lz - 2.2, lx + 2.2, 19, lz + 2.2, 0xfff4c8); D(lx - 2.6, 19, lz - 2.6, lx + 2.6, 19.5, lz + 2.6, 0x3a3d42);
    for (let i = 0; i < 20; i++) { const a = i * Math.PI / 4, r = 5.4, y = (i + 1) * 0.8; B(lx + Math.cos(a) * r - 1.1, y - 0.35, lz + Math.sin(a) * r - 1.1, lx + Math.cos(a) * r + 1.1, y, lz + Math.sin(a) * r + 1.1, PAL.parkour); }   // spiral stair
    this.chestSpots.push({ x: lx + 3.4, y: 16.4, z: lz, tier: 2 }); this.building(lx + 10, lz + 8, 9, 9, 1);
    // ---- HARBOR ROW (town, south-west) + SIGNAL HILL (fortified plateau, east)
    this.town(-96, 66);
    this.outpost(112, 40);
    this.pois = [
      { x: sx, z: sz, name: 'The Stockade', type: 'prison' }, { x: cx, z: cz, name: 'Saltworks', type: 'plant' }, { x: px, z: pz, name: 'Pier Nine', type: 'docks' },
      { x: lx, z: lz, name: 'Beacon Point', type: 'lighthouse' }, { x: -96, z: 66, name: 'Harbor Row', type: 'town' }, { x: 112, z: 40, name: 'Signal Hill', type: 'outpost' },
    ];
    this.towns = this.pois;
    // scatter (scaled down for the small island)
    for (let i = 0; i < 3; i++) this.ridge();
    for (let i = 0; i < 14; i++) this.placeRandom(8, 8, (x, z) => this.container(x, z));
    for (let i = 0; i < 40; i++) this.placeRandom(5, 5, (x, z) => this.crateStack(x, z));
    for (let i = 0; i < 46; i++) this.placeRandom(7, 7, (x, z) => this.rock(x, z));
    for (let i = 0; i < 36; i++) this.placeRandom(7, 7, (x, z) => this.coverWall(x, z));
    for (let i = 0; i < 140; i++) this.placeRandom(2, 2, (x, z) => this.tree(x, z));
    for (let i = 0; i < 12; i++) this.placeRandom(4, 4, (x, z) => this.jumpPad(x, z));
    for (let i = 0; i < 4; i++) this.placeRandom(18, 18, (x, z) => this.wallRunLane(x, z));
    this.dress();
    for (let i = 0; i < 70; i++) { const x = U.rand(R, -H + 30, H - 30), z = U.rand(R, -H + 30, H - 30); if (Math.hypot(x, z) < H - 30 && this.free(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.5)) this.lootSpots.push({ x, y: 0, z, tier: 0 }); }
    this.spawns = [{ x: 0, z: 0, yaw: 0 }];
  },
});
