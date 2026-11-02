'use strict';
// =============================================================================
// WORLD — procedural map made of axis-aligned boxes.
// Every solid thing is a box {x0,y0,z0,x1,y1,z1}. That keeps collision and
// hitscan cheap and predictable on phones. Boxes are bucketed into a 2D grid
// (x/z) so queries only look at nearby boxes.
// =============================================================================
const PAL = {
  ground: 0x7d9a5a, cliff: 0x5d6b4c,
  walls: [0xd8cbb3, 0xc9b8a6, 0xb7c4c8, 0xd6c19a, 0xc4b1c9, 0xa9bfa5],
  floor: 0x8a7a66, roof: 0x6b5d55,
  containers: [0xd0643b, 0x3f78b5, 0xb8433f, 0x4f9a6a, 0xd9a441],
  crate: 0xa77b4f, rock: 0x8d8f8a, trunk: 0x6b4a2f, leaves: 0x4f7d3c,
  parkour: 0xf2a33a, parkourAlt: 0x2f3b4a, cover: 0x9d9a90, tower: 0x5f6f86,
};

BR.World = class World {
  constructor(seed) {
    const M = BR.CONFIG.map;
    this.size = M.size;
    this.half = M.size / 2;
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
    this.hit = { t: 0, box: null };
    this.ground = { x0: -1e4, y0: -10, z0: -1e4, x1: 1e4, y1: 0, z1: 1e4, ground: true };
    this.generate();
  }

  // ---------------------------------------------------------------- storage
  addBox(x0, y0, z0, x1, y1, z1, color, opt) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (y0 > y1) { const t = y0; y0 = y1; y1 = t; }
    if (z0 > z1) { const t = z0; z0 = z1; z1 = t; }
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return null;
    const b = { x0, y0, z0, x1, y1, z1, color, stamp: 0, tag: opt && opt.tag };
    this.boxes.push(b);
    const c = this.cellRange(x0, z0, x1, z1);
    for (let cz = c[1]; cz <= c[3]; cz++)
      for (let cx = c[0]; cx <= c[2]; cx++) this.cells[cz * this.n + cx].push(b);
    return b;
  }

  cellRange(x0, z0, x1, z1) {
    const cs = this.cell, h = this.half, n = this.n - 1;
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
    // ground slab
    if (y0 < 0) out.push(this.ground);
    return out;
  }

  // Ray vs world (boxes + ground). Uses a 2D grid walk so long shots stay cheap.
  // Returns this.hit = {t, box}; t === maxDist when nothing was hit.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const U = BR.util;
    let best = maxDist, bestBox = null;
    if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; bestBox = this.ground; } }
    const ix = U.inv(dx), iy = U.inv(dy), iz = U.inv(dz);
    const cs = this.cell, h = this.half, n = this.n;
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

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
    return h.t >= d - 0.05;
  }

  // Highest walkable surface under (x,z) below height `fromY`.
  groundAt(x, z, fromY) {
    let top = 0;
    const tmp = this._gtmp || (this._gtmp = []);
    this.query(x - 0.2, 0, z - 0.2, x + 0.2, fromY, z + 0.2, tmp);
    for (const b of tmp) if (!b.ground && b.y1 <= fromY && b.y1 > top) top = b.y1;
    return top;
  }

  // ------------------------------------------------------------- generation
  free(x0, z0, x1, z1, pad) {
    if (x0 < -this.half + 6 || z0 < -this.half + 6 || x1 > this.half - 6 || z1 > this.half - 6) return false;
    for (const o of this.occupied)
      if (x0 - pad < o[2] && x1 + pad > o[0] && z0 - pad < o[3] && z1 + pad > o[1]) return false;
    return true;
  }
  claim(x0, z0, x1, z1) { this.occupied.push([x0, z0, x1, z1]); }

  generate() {
    const R = this.rand, U = BR.util, H = this.half;

    // Boundary walls
    const bw = 6, bh = 26;
    this.addBox(-H - bw, 0, -H - bw, H + bw, bh, -H, PAL.cliff, { tag: 'edge' });
    this.addBox(-H - bw, 0, H, H + bw, bh, H + bw, PAL.cliff, { tag: 'edge' });
    this.addBox(-H - bw, 0, -H, -H, bh, H, PAL.cliff, { tag: 'edge' });
    this.addBox(H, 0, -H, H + bw, bh, H, PAL.cliff, { tag: 'edge' });

    // Towns — clusters of enterable buildings
    const towns = [];
    for (let tries = 0; towns.length < 6 && tries < 400; tries++) {
      const tx = U.rand(R, -H + 45, H - 45), tz = U.rand(R, -H + 45, H - 45);
      if (towns.every(t => Math.hypot(t.x - tx, t.z - tz) > 85)) towns.push({ x: tx, z: tz });
    }
    this.towns = towns;
    for (const t of towns) this.town(t.x, t.z);

    // Landmarks
    for (let i = 0; i < 2; i++) this.placeRandom(34, 34, (x, z) => this.mesa(x, z));
    for (let i = 0; i < 4; i++) this.placeRandom(14, 14, (x, z) => this.tower(x, z));
    for (let i = 0; i < 7; i++) this.placeRandom(18, 18, (x, z) => this.wallRunLane(x, z));

    // Scatter
    for (let i = 0; i < 26; i++) this.placeRandom(8, 8, (x, z) => this.container(x, z));
    for (let i = 0; i < 45; i++) this.placeRandom(5, 5, (x, z) => this.crateStack(x, z));
    for (let i = 0; i < 50; i++) this.placeRandom(7, 7, (x, z) => this.rock(x, z));
    for (let i = 0; i < 40; i++) this.placeRandom(7, 7, (x, z) => this.coverWall(x, z));
    for (let i = 0; i < 160; i++) this.placeRandom(2, 2, (x, z) => this.tree(x, z));

    // Open-field loot so nobody is empty-handed for long
    for (let i = 0; i < 70; i++) {
      const x = U.rand(R, -H + 10, H - 10), z = U.rand(R, -H + 10, H - 10);
      if (this.free(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.5)) this.lootSpots.push({ x, y: 0, z, tier: 0 });
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
    const lot = 18, nx = 2 + Math.floor(R() * 2), nz = 2 + Math.floor(R() * 2);
    const w = nx * lot, d = nz * lot;
    const x0 = cx - w / 2, z0 = cz - d / 2;
    if (!this.free(x0, z0, x0 + w, z0 + d, 4)) return;
    this.claim(x0, z0, x0 + w, z0 + d);
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
    });

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
    // Roof
    this.addBox(x0 - 0.2, H, z0 - 0.2, x1 + 0.2, H + 0.3, z1 + 0.2, PAL.roof);
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
    this.addBox(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, PAL.rock);
    if (h > 2 && R() < 0.35) this.lootSpots.push({ x, y: h, z, tier: 1, force: 'weapon' }); // gun on a rock top
    if (R() < 0.5) {
      const w2 = w * 0.6, d2 = d * 0.6;
      this.addBox(x - w2 / 2 + 0.4, h, z - d2 / 2, x + w2 / 2 + 0.4, h + U.rand(R, 0.5, 1.2), z + d2 / 2, PAL.rock);
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
    this.addBox(x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3, PAL.trunk);
    this.trees.push({ x, z, h, s: U.rand(R, 1.6, 2.6) });
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
    this.addBox(x - W / 2, 0, z - W / 2, x + W / 2, Hh, z + W / 2, PAL.cliff);
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

  // ---------------------------------------------------------------- render
  buildMeshes(scene) {
    const tex = makeTileTexture();
    const vis = this.boxes;
    const count = vis.length;
    const pos = new Float32Array(count * 24 * 3);
    const nor = new Float32Array(count * 24 * 3);
    const col = new Float32Array(count * 24 * 3);
    const uv = new Float32Array(count * 24 * 2);
    const idx = new Uint32Array(count * 36);
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
        col[v * 3] = c.r * shade; col[v * 3 + 1] = c.g * shade; col[v * 3 + 2] = c.b * shade;
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
    for (const b of vis) {
      c.setHex(b.color);
      const j = 0.94 + jitter() * 0.12;
      c.r *= j; c.g *= j; c.b *= j;
      const { x0, y0, z0, x1, y1, z1 } = b;
      face(0, 1, 0, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1.0, uvXZ);
      face(0, -1, 0, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.55, uvXZ);
      face(1, 0, 0, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.86, uvZY);
      face(-1, 0, 0, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.78, uvZY);
      face(0, 0, 1, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.92, uvXY);
      face(0, 0, -1, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], 0.72, uvXY);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
    const mesh = new THREE.Mesh(g, mat);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);

    // Ground
    const gt = makeTileTexture(true);
    gt.repeat.set(this.size / 5, this.size / 5);
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size + 12, this.size + 12),
      new THREE.MeshLambertMaterial({ color: PAL.ground, map: gt })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    scene.add(groundMesh);

    // Tree canopies (visual only — bullets pass through leaves)
    const cg = new THREE.IcosahedronGeometry(1, 0);
    const cm = new THREE.MeshLambertMaterial({ color: PAL.leaves });
    const inst = new THREE.InstancedMesh(cg, cm, this.trees.length);
    const o = new THREE.Object3D();
    this.trees.forEach((t, i) => {
      o.position.set(t.x, t.h + t.s * 0.4, t.z);
      o.scale.set(t.s, t.s * 1.25, t.s);
      o.rotation.y = i;
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
    });
    scene.add(inst);
    return mesh;
  }

  // Top-down picture of the map for the minimap.
  renderMinimap(px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const ctx = cv.getContext('2d');
    const k = px / this.size, H = this.half;
    ctx.fillStyle = '#4e6440';
    ctx.fillRect(0, 0, px, px);
    const sorted = this.boxes.filter(b => b.tag !== 'edge').sort((a, b) => a.y1 - b.y1);
    for (const b of sorted) {
      const l = Math.min(1, 0.35 + b.y1 / 12);
      ctx.fillStyle = `rgba(${Math.round(190 * l + 40)},${Math.round(185 * l + 40)},${Math.round(165 * l + 40)},0.9)`;
      ctx.fillRect((b.x0 + H) * k, (b.z0 + H) * k, Math.max(1, (b.x1 - b.x0) * k), Math.max(1, (b.z1 - b.z0) * k));
    }
    return cv;
  }
};

function makeTileTexture(grass) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);
  const r = BR.util.rng(grass ? 7 : 3);
  for (let i = 0; i < 900; i++) {
    const a = grass ? 0.08 : 0.05;
    ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 2);
  }
  ctx.strokeStyle = grass ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, s - 3, s - 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
