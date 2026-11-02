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
  pad: 0x2fe0ff, padBase: 0x2a3340, trim: 0x5b5048, lamp: 0x30343a, lampGlow: 0xffe9a8, fence: 0x8a6a48, pillar: 0x7c86a0,
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
    this.decor = [];       // visual-only boxes (trims, frames): rendered, never collided
    this.buildings = [];   // {x0,x1,z0,z1,H,floors,walls:[{si,cols,door}]} for dressing
    this.containers = [];  // {x0,x1,z0,z1,y0,y1,along}
    this.props = { barrels: [], logs: [], stumps: [], ponds: [], boulders: [] };
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
    if (opt && opt.decor) { this.decor.push(b); return b; }
    if (opt && opt.hidden) b.hidden = true;      // collision only (drawn by an instanced prop)
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

  // Ray vs tree canopies (visual-only for bullets, but the grapple can hook them).
  raycastTrees(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    for (const t of this.trees) {
      if (Math.abs(t.x - ox) > maxDist + 4 || Math.abs(t.z - oz) > maxDist + 4) continue;
      const hit = BR.util.raySphere(ox, oy, oz, dx, dy, dz, t.x, t.h + t.s * 0.4, t.z, t.s * 1.05, best);
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

    // Boundary walls
    const bw = 6, bh = 26;
    this.addBox(-H - bw, 0, -H - bw, H + bw, bh, -H, PAL.cliff, { tag: 'edge' });
    this.addBox(-H - bw, 0, H, H + bw, bh, H + bw, PAL.cliff, { tag: 'edge' });
    this.addBox(-H - bw, 0, -H, -H, bh, H, PAL.cliff, { tag: 'edge' });
    this.addBox(H, 0, -H, H + bw, bh, H, PAL.cliff, { tag: 'edge' });

    // Named points of interest, spread across the map. Each has a type that
    // decides what gets built there.
    const NAMES = ['Relay Spire', 'Rust Basin', 'Dustwater', 'Hollow Yards', 'Cinder Flats', 'Skyhook',
      'Gravel Point', 'Ironbark', 'Saltmarsh', 'Bastion', 'Lowtide', 'Overpass', 'Redline', 'Kestrel Ridge'];
    const TYPES = ['town', 'yard', 'town', 'relay', 'town', 'outpost', 'town', 'yard', 'town', 'relay', 'outpost', 'town'];
    const pois = [];
    for (let tries = 0; pois.length < 12 && tries < 3000; tries++) {
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
      else this.relay(p.x, p.z);
    }

    // Long rock ridges carve the map into regions (with gaps to run through)
    for (let i = 0; i < 7; i++) this.ridge();

    // Landmarks
    for (let i = 0; i < 4; i++) this.placeRandom(34, 34, (x, z) => this.mesa(x, z));
    for (let i = 0; i < 6; i++) this.placeRandom(14, 14, (x, z) => this.tower(x, z));
    for (let i = 0; i < 14; i++) this.placeRandom(18, 18, (x, z) => this.wallRunLane(x, z));
    // Movement playgrounds
    for (let i = 0; i < 10; i++) this.placeRandom(34, 34, (x, z) => this.parkourCourse(x, z));
    for (let i = 0; i < 6; i++) this.placeRandom(18, 18, (x, z) => this.pillarMaze(x, z));
    for (let i = 0; i < 60; i++) this.placeRandom(4, 4, (x, z) => this.jumpPad(x, z));

    // Ponds (before the scatter so they find room; visual water, walkable)
    for (let i = 0; i < 10; i++) this.placeRandom(22, 22, (x, z) => this.props.ponds.push({ x, z, r: 5 + R() * 4 }));

    // Scatter
    for (let i = 0; i < 70; i++) this.placeRandom(8, 8, (x, z) => this.container(x, z));
    for (let i = 0; i < 140; i++) this.placeRandom(5, 5, (x, z) => this.crateStack(x, z));
    for (let i = 0; i < 160; i++) this.placeRandom(7, 7, (x, z) => this.rock(x, z));
    for (let i = 0; i < 120; i++) this.placeRandom(7, 7, (x, z) => this.coverWall(x, z));
    for (let i = 0; i < 520; i++) this.placeRandom(2, 2, (x, z) => this.tree(x, z));
    for (let i = 0; i < 50; i++) this.placeRandom(12, 3, (x, z) => this.fence(x, z));

    // Visual dressing (own RNG so it never changes the gameplay layout)
    this.dress();

    // Open-field loot so nobody is empty-handed for long
    for (let i = 0; i < 220; i++) {
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
      if (R() < 0.55) D(b.x0 + 0.1, b.y1, b.z0 + 0.1, b.x1 - 0.1, b.y1 + 0.05, b.z1 - 0.1, R() < 0.5 ? 0x5f7f45 : 0x6d8a4c);
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
    const B = (a0, y0, b0, a1, y1, b1, c, solid) => axis === 'x'
      ? this.addBox(x + a0, y0, z + b0, x + a1, y1, z + b1, c, solid ? null : { decor: true })
      : this.addBox(x + b0, y0, z + a0, x + b1, y1, z + a1, c, solid ? null : { decor: true });
    const dark = new THREE.Color(color).multiplyScalar(0.7).getHex();
    B(-L / 2, 0.32, -W / 2, L / 2, 1.0, W / 2, color, true);                  // body (cover)
    B(-0.9, 1.0, -W / 2 + 0.12, 1.1, 1.62, W / 2 - 0.12, color, true);        // cabin
    B(-0.85, 1.08, -W / 2 + 0.1, 1.05, 1.52, W / 2 - 0.1, 0x34465a);           // side windows
    B(1.1, 1.05, -W / 2 + 0.18, 1.14, 1.55, W / 2 - 0.18, 0x34465a);           // windscreen
    B(-0.94, 1.05, -W / 2 + 0.18, -0.9, 1.55, W / 2 - 0.18, 0x34465a);         // rear window
    B(-L / 2 - 0.05, 0.3, -W / 2, L / 2 + 0.05, 0.45, W / 2, 0x2a2d33);         // bumpers / skirt
    B(L / 2, 0.62, -W / 2 + 0.15, L / 2 + 0.03, 0.8, -W / 2 + 0.45, 0xfff2c0);  // headlights
    B(L / 2, 0.62, W / 2 - 0.45, L / 2 + 0.03, 0.8, W / 2 - 0.15, 0xfff2c0);
    B(-L / 2 - 0.03, 0.66, -W / 2 + 0.15, -L / 2, 0.82, -W / 2 + 0.45, 0xd02a2a); // tail lights
    B(-L / 2 - 0.03, 0.66, W / 2 - 0.45, -L / 2, 0.82, W / 2 - 0.15, 0xd02a2a);
    B(-L / 2 + 0.2, 0.98, -W / 2 - 0.01, L / 2 - 0.2, 1.0, W / 2 + 0.01, dark);  // belt line
    for (const a of [-1.3, 1.3]) for (const b of [-W / 2 - 0.02, W / 2 - 0.26]) B(a - 0.36, 0, b, a + 0.36, 0.66, b + 0.28, 0x18191b);  // wheels
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
    this.addBox(cx - W / 2, 0, cz - W / 2, cx + W / 2, Hh, cz + W / 2, PAL.cliff);
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
        if (alongX) this.addBox(x + p0, 0, z - T / 2, x + p1, hh, z + T / 2, PAL.cliff);
        else this.addBox(x - T / 2, 0, z + p0, x + T / 2, hh, z + p1, PAL.cliff);
        // ledge halfway up to mantle onto
        if (alongX) this.addBox(x + p0 + 2, 0, z + T / 2, x + p0 + 6, hh * 0.45, z + T / 2 + 2.5, PAL.rock);
        else this.addBox(x + T / 2, 0, z + p0 + 2, x + T / 2 + 2.5, hh * 0.45, z + p0 + 6, PAL.rock);
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
    // Decorative trim bands between floors + a base course (visual only)
    for (let f = 1; f < floors; f++) {
      const y = f * fh;
      this.addBox(x0 - 0.08, y - 0.12, z0 - 0.08, x1 + 0.08, y + 0.08, z1 + 0.08, PAL.trim, { decor: true });
    }
    this.addBox(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.35, z1 + 0.06, PAL.trim, { decor: true });
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
    this.trees.push({ x, z, h, s: U.rand(R, 1.6, 2.6), pine: R() < 0.35 });
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
    const vis = this.boxes.filter(b => !b.hidden).concat(lowDetail ? this.decor.filter(b => !b.fine) : this.decor);
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
        // Fake ambient occlusion: darken side walls where they meet the ground
        const ao = ny === 0 && p[1] < 0.05 ? 0.62 : ny === 0 && p[1] === aoY0 ? 0.85 : 1;
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
    let aoY0 = 0;
    for (const b of vis) {
      aoY0 = b.y0;
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

    this.buildGround(scene);
    this.buildScenery(scene, detail === undefined ? 1 : detail);
    return mesh;
  }

  // Ground with painted grass/dirt variation (vertex colors) under a tiled detail texture.
  buildGround(scene) {
    const gt = makeTileTexture(true);
    gt.repeat.set(this.size / 5, this.size / 5);
    const segs = 160, S = this.size + 12;
    const geo = new THREE.PlaneGeometry(S, S, segs, segs);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(0x7d9a5a), grass2 = new THREE.Color(0x6a8a4a), dry = new THREE.Color(0xa4a35e), dirt = new THREE.Color(0x9c8460);
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
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: gt }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
  }

  // Sky dome, far mountains, clouds, tree canopies, bushes and grass tufts. All visual.
  buildScenery(scene, detail) {
    const R = BR.util.rng(this.seed + 5), H = this.half;
    // Sky dome with a vertical gradient + sun
    const skyG = new THREE.SphereGeometry(900, 24, 12);
    const sp = skyG.attributes.position, sc = new Float32Array(sp.count * 3);
    const top = new THREE.Color(0x3d7cc9), hor = new THREE.Color(0xcfe3f0), c = new THREE.Color();
    for (let i = 0; i < sp.count; i++) {
      const k = BR.util.clamp(sp.getY(i) / 900, 0, 1);
      c.copy(hor).lerp(top, Math.pow(k, 0.6));
      sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    skyG.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(16, 20), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    sun.position.set(420, 560, 300); sun.scale.setScalar(1.8); sun.lookAt(0, 0, 0);
    scene.add(sun);

    // Mountain ring beyond the map edge
    const mg = new THREE.ConeGeometry(1, 1, 5);
    const mtn = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ color: 0x8aa0b4, fog: false }), 30);
    const o = new THREE.Object3D();
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * Math.PI * 2 + R() * 0.2, r = H + 160 + R() * 120;
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      const hgt = 90 + R() * 110, wid = 90 + R() * 70;
      o.scale.set(wid, hgt, wid); o.position.y = hgt / 2 - 2; o.rotation.y = R() * 6;
      o.updateMatrix(); mtn.setMatrixAt(i, o.matrix);
    }
    scene.add(mtn);

    // Clouds
    const cl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xf4f7fb, fog: false }), 30);
    for (let i = 0; i < 30; i++) {
      o.position.set((R() * 2 - 1) * 700, 140 + R() * 60, (R() * 2 - 1) * 700);
      o.scale.set(20 + R() * 30, 5 + R() * 5, 12 + R() * 16); o.rotation.set(0, R() * 6, 0);
      o.updateMatrix(); cl.setMatrixAt(i, o.matrix);
    }
    scene.add(cl);

    // Tree canopies: leafy trees get two stacked blobs (two greens), pines get stacked cones
    const cg = new THREE.IcosahedronGeometry(1, 0);
    const greens = [0x4f7d3c, 0x3f6b33];
    const leafy = this.trees.filter(t => !t.pine), pines = this.trees.filter(t => t.pine);
    for (let gi = 0; gi < 2; gi++) {
      const inst = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: greens[gi], flatShading: true }), Math.max(1, leafy.length));
      inst.count = leafy.length;
      leafy.forEach((t, i) => {
        const s = gi ? t.s * 0.7 : t.s;
        o.position.set(t.x + (gi ? 0.3 : 0), t.h + t.s * (gi ? 1.2 : 0.4), t.z);
        o.scale.set(s, s * 1.2, s); o.rotation.set(0, i + gi, 0);
        o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
      });
      scene.add(inst);
    }
    if (pines.length) {
      const cone = new THREE.ConeGeometry(1, 1, 7);
      const pm = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0x2f5a35, flatShading: true }), pines.length * 3);
      let k = 0;
      pines.forEach((t, i) => {
        for (let tier = 0; tier < 3; tier++) {
          const w = t.s * (1.15 - tier * 0.3), hh = t.s * (1.5 - tier * 0.25);
          o.position.set(t.x, t.h * 0.55 + tier * t.s * 0.8 + hh / 2, t.z); o.scale.set(w, hh, w); o.rotation.set(0, i + tier, 0);
          o.updateMatrix(); pm.setMatrixAt(k++, o.matrix);
        }
      });
      scene.add(pm);
    }

    // Props from the dressing pass (instanced: one draw call each)
    const P = this.props, col = new THREE.Color();
    const inst = (geo, mat, list, place) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((q, i) => { place(q, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      scene.add(m); return m;
    };
    // oil drums with lids and rib bands
    const BC = [0x2f6fa8, 0xb8433f, 0x3f7a4a, 0x8a5a32];
    const drum = inst(new THREE.CylinderGeometry(0.3, 0.3, 0.95, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }), P.barrels, q => {
      o.position.set(q.x, q.tip ? 0.3 : 0.475, q.z); o.scale.set(1, 1, 1); o.rotation.set(q.tip ? Math.PI / 2 : 0, q.x * 3, 0);
    });
    if (drum) { P.barrels.forEach((q, i) => drum.setColorAt(i, col.setHex(BC[q.c]))); drum.instanceColor.needsUpdate = true; }
    const ribG = new THREE.CylinderGeometry(0.315, 0.315, 0.05, 12);
    for (const yy of [0.3, 0.65]) inst(ribG, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), P.barrels.filter(q => !q.tip), q => {
      o.position.set(q.x, yy, q.z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0);
    });
    // logs (bark) + their cut ends, stumps with rings
    const bark = new THREE.MeshLambertMaterial({ color: 0x5e4129, flatShading: true }), cut = new THREE.MeshLambertMaterial({ color: 0xc9a46c });
    inst(new THREE.CylinderGeometry(1, 1, 1, 9), bark, P.logs, q => {
      o.position.set(q.x, q.r, q.z); o.scale.set(q.r, q.L, q.r); o.rotation.set(q.alongX ? 0 : Math.PI / 2, 0, q.alongX ? Math.PI / 2 : 0);
    });
    const ends = [];
    P.logs.forEach(q => { for (const sgn of [-1, 1]) ends.push({ x: q.x + (q.alongX ? sgn * q.L / 2 : 0), z: q.z + (q.alongX ? 0 : sgn * q.L / 2), r: q.r, alongX: q.alongX }); });
    inst(new THREE.CylinderGeometry(1, 1, 0.04, 9), cut, ends, q => {
      o.position.set(q.x, q.r, q.z); o.scale.set(q.r * 0.92, 1, q.r * 0.92); o.rotation.set(q.alongX ? 0 : Math.PI / 2, 0, q.alongX ? Math.PI / 2 : 0);
    });
    inst(new THREE.CylinderGeometry(0.85, 1, 1, 9), bark, P.stumps, q => { o.position.set(q.x, q.h / 2, q.z); o.scale.set(q.s, q.h, q.s); o.rotation.set(0, q.x, 0); });
    inst(new THREE.CylinderGeometry(1, 1, 0.02, 9), cut, P.stumps, q => { o.position.set(q.x, q.h + 0.01, q.z); o.scale.set(q.s * 0.85, 1, q.s * 0.85); o.rotation.set(0, q.x, 0); });
    // loose boulders round the rocks
    inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x8a8c86, flatShading: true }), P.boulders, q => {
      o.position.set(q.x, q.s * 0.45, q.z); o.scale.set(q.s * 1.2, q.s * 0.8, q.s); o.rotation.set(q.x, q.z, 0);
    });
    // ponds: sandy shore, water, lily pads, reeds
    for (const q of P.ponds) {
      const shore = new THREE.Mesh(new THREE.CircleGeometry(q.r + 1.4, 28), new THREE.MeshLambertMaterial({ color: 0xa89a6c }));
      shore.rotation.x = -Math.PI / 2; shore.position.set(q.x, 0.02, q.z); scene.add(shore);
      const water = new THREE.Mesh(new THREE.CircleGeometry(q.r, 28), new THREE.MeshPhongMaterial({ color: 0x3a7aa6, specular: 0xcfe8ff, shininess: 80, transparent: true, opacity: 0.88 }));
      water.rotation.x = -Math.PI / 2; water.position.set(q.x, 0.05, q.z); scene.add(water);
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
    const nB = Math.floor(700 * detail), nG = Math.floor(5000 * detail);
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x55803e, flatShading: true }), nB);
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 1, 3), new THREE.MeshLambertMaterial({ color: 0x6f9a4a }), nG);
    let bi = 0, gi = 0;
    for (let tries = 0; tries < (nB + nG) * 2 && (bi < nB || gi < nG); tries++) {
      const x = (R() * 2 - 1) * (H - 4), z = (R() * 2 - 1) * (H - 4);
      if (!this.free(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0)) continue;
      if (bi < nB && R() < 0.12) {
        const s = 0.5 + R() * 0.7;
        o.position.set(x, s * 0.5, z); o.scale.set(s * 1.3, s, s * 1.3); o.rotation.set(0, R() * 6, 0);
        o.updateMatrix(); bush.setMatrixAt(bi++, o.matrix);
      } else if (gi < nG) {
        const s = 0.25 + R() * 0.35;
        o.position.set(x, s * 0.5, z); o.scale.set(1, s, 1); o.rotation.set((R() - 0.5) * 0.4, R() * 6, 0);
        o.updateMatrix(); tuft.setMatrixAt(gi++, o.matrix);
      }
    }
    bush.count = bi; tuft.count = gi;
    scene.add(bush, tuft);
    // Wildflower patches
    const nF = Math.floor(2400 * detail), FC = [0xf4f4f4, 0xf2d24a, 0xe0546a, 0x9a6ad9, 0xf28a3c];
    if (nF > 0) {
      const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), nF);
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
      fl.count = fi; if (fl.instanceColor) fl.instanceColor.needsUpdate = true;
      scene.add(fl);
    }
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
