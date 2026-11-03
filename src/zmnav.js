'use strict';
// =============================================================================
// ZOMBIE NAVIGATION (v1.10) — a flow field over the whole map so zombies walk round
// walls, fences, headstones and locked doors instead of pressing into them.
//
//  * BR.NavField: 1 m grid over the world. Each cell is free, "hop" (a low wall / coffin a
//    zombie can jump) or blocked (anything taller, inflated by the zombie's radius). A BFS
//    from the player's cell (8 neighbours, no corner cutting) gives every cell its walking
//    distance to you; a zombie steers toward the lowest neighbour a few cells ahead.
//    Rebuilt when a door is bought; re-flooded ~4x a second or when you move a cell.
//  * Rescue: a zombie that makes no progress for ~6 s, can't reach you at all, or is
//    stranded far away digs back up at an open spawn near you (classic CoD behaviour), so a
//    round can never stall on a lost zombie.
//  * Last zombies: once 5 or fewer are left in a round, every one gets a marker above its
//    head that shows through walls (and clamps to the screen edge when off-screen).
// =============================================================================
(function () {
  const BLOCK = 0, FREE = 1, HOP = 2;
  BR.NavField = class NavField {
    constructor(world, opts) {
      this.w = world; this.cs = (opts && opts.cell) || 1; this.r = (opts && opts.radius) || 0.42;
      this.half = world.gridHalf; this.n = Math.ceil(world.size / this.cs);
      this.cell = new Uint8Array(this.n * this.n); this.dist = new Uint16Array(this.n * this.n);
      this.build();
      this.src = -1; this.t = 0;
    }
    idx(x, z) { const n = this.n, i = Math.floor((x + this.half) / this.cs), j = Math.floor((z + this.half) / this.cs); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; }
    cx(i) { return (i % this.n + 0.5) * this.cs - this.half; }
    cz(i) { return (Math.floor(i / this.n) + 0.5) * this.cs - this.half; }
    build() {
      const n = this.n, cs = this.cs, h = this.half, r = this.r, C = this.cell;
      C.fill(FREE);
      for (const b of this.w.boxes) {
        if (b.ground || b.y0 > 1.75 || b.y1 <= 0.5) continue;           // overhead, or low enough to step over
        const t = b.y1 <= 1.3 && b.y0 < 0.3 ? HOP : BLOCK;
        const i0 = Math.max(0, Math.floor((b.x0 - r + h) / cs)), i1 = Math.min(n - 1, Math.floor((b.x1 + r + h) / cs));
        const j0 = Math.max(0, Math.floor((b.z0 - r + h) / cs)), j1 = Math.min(n - 1, Math.floor((b.z1 + r + h) / cs));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          // only cells whose centre sits inside the inflated box (keeps 1-cell gaps open)
          const x = (i + 0.5) * cs - h, z = (j + 0.5) * cs - h;
          if (x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
          const k = j * n + i; if (t === BLOCK) C[k] = BLOCK; else if (C[k] === FREE) C[k] = HOP;
        }
      }
      for (let i = 0; i < n; i++) { C[i] = C[(n - 1) * n + i] = C[i * n] = C[i * n + n - 1] = BLOCK; }   // map edge
      this.src = -1;
    }
    // Dial's algorithm (bucketed Dijkstra): straight step 10, diagonal 14, a hop cell +30 so zombies
    // prefer to walk round a low wall when that's close. Unreachable = 65535.
    flood(x, z) {
      const n = this.n, C = this.cell, D = this.dist;
      const B = this.buckets || (this.buckets = Array.from({ length: 64 }, () => []));
      for (const b of B) b.length = 0;
      D.fill(65535);
      const s = this.idx(x, z); if (s < 0) return;
      this.src = s;
      let pending = 0;
      const put = (k, d) => { D[k] = d; B[d & 63].push(k); pending++; };
      // standing on top of something (a crate, the tower stairs)? seed the free cells around you
      if (C[s] === BLOCK) { const i0 = s % n, j0 = Math.floor(s / n);
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue; const k = j * n + i; if (C[k] !== BLOCK) put(k, (Math.abs(di) + Math.abs(dj)) * 10); } }
      else put(s, 0);
      for (let cur = 0; pending > 0 && cur < 65000; cur++) {
        const bucket = B[cur & 63];
        while (bucket.length) {
          const k = bucket.pop(); pending--;
          if (D[k] !== cur) continue;                                  // stale entry
          const i = k % n, j = (k - i) / n;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
            const q = jj * n + ii, c = C[q]; if (c === BLOCK) continue;
            if (di && dj && (C[j * n + ii] === BLOCK || C[jj * n + i] === BLOCK)) continue;    // no corner cutting
            const nd = cur + (di && dj ? 14 : 10) + (c === HOP ? 30 : 0);
            if (nd < D[q]) put(q, nd);
          }
        }
      }
    }
    // re-flood when the target moves to a new cell, at most every 0.25 s (and at least every 1.5 s)
    update(dt, x, z) { this.t -= dt; const s = this.idx(x, z); if ((s !== this.src && this.t <= 0) || this.t < -1.25) { this.flood(x, z); this.t = 0.25; } }
    distAt(x, z) { const k = this.idx(x, z); return k < 0 ? 65535 : this.dist[k]; }
    // a point a few cells down the gradient from (x,z); returns null if unreachable
    next(x, z, out, ahead) {
      const n = this.n, D = this.dist, C = this.cell;
      let k = this.idx(x, z); if (k < 0) return null;
      if (C[k] === BLOCK || D[k] === 65535) {                       // pushed into a blocked cell: find the best free neighbour
        let best = -1, bd = 65535; const i0 = k % n, j0 = Math.floor(k / n);
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue; const q = j * n + i; if (C[q] !== BLOCK && D[q] < bd) { bd = D[q]; best = q; } }
        if (best < 0) return null; k = best;
      }
      let hop = false;
      for (let s = 0; s < (ahead || 3); s++) {
        const i = k % n, j = (k - i) / n; let best = k, bd = D[k];
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const q = jj * n + ii; if (C[q] === BLOCK || D[q] >= bd) continue;
          if (di && dj && (C[j * n + ii] === BLOCK || C[jj * n + i] === BLOCK)) continue;
          best = q; bd = D[q];
        }
        if (best === k) break;
        k = best; if (C[k] === HOP) { hop = true; if (s === 0) break; }
      }
      out.x = this.cx(k); out.z = this.cz(k); out.hop = hop;
      return out;
    }
  };

  // ---------------------------------------------------------------- zombie steering
  const ZM = BR.ZombieMode.prototype, baseBrain = BR.ZombieBrain.baseUpdate;
  BR.ZombieBrain.prototype.update = function (dt) {
    const z = this.z, g = this.g, zm = g.zm, p = g.player;
    if (!zm || !zm.nav || !p || !z.alive) return baseBrain.call(this, dt);
    const dp = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
    // close and in sight: straight at you
    const direct = dp < 3.2 || (dp < 9 && Math.abs(p.pos.y - z.pos.y) < 1.5 && g.world.lineOfSight(z.pos.x, z.pos.y + 1.2, z.pos.z, p.pos.x, p.pos.y + 1.2, p.pos.z));
    if (!direct) {
      const o = this._nv || (this._nv = { x: 0, z: 0, hop: false }), r = zm.nav.next(z.pos.x, z.pos.z, o, 3);
      if (r) { this.goal = this._gv || (this._gv = new THREE.Vector3()); this.goal.set(r.x, p.pos.y, r.z);
        if (r.hop && z.mover.onGround && Math.hypot(r.x - z.pos.x, r.z - z.pos.z) < 1.6) z.input.jump = true; }
    }
    // progress tracking for the rescue
    if (z.riseT <= 0) {
      const d = zm.nav.distAt(z.pos.x, z.pos.z);
      if (this.navBest === undefined || d < this.navBest - 5) { this.navBest = d; this.navT = 0; } else this.navT = (this.navT || 0) + dt;
      if (d >= 65535) this.lostT = (this.lostT || 0) + dt; else this.lostT = 0;
      this.farT = dp > 80 ? (this.farT || 0) + dt : 0;
      if (dp > 4 && z.attackT <= 0 && (this.navT > 6 || this.lostT > 3.5 || this.farT > 8)) { zm.rescue(z); this.navBest = undefined; this.navT = this.lostT = this.farT = 0; }
    }
    const res = baseBrain.call(this, dt);
    this.goal = null;
    return res;
  };

  // ---------------------------------------------------------------- mode hooks
  const baseStart = ZM.start, baseUpdate = ZM.update, baseOpen = ZM.openDoor, baseDispose = ZM.dispose;
  Object.assign(ZM, {
    start() { const r = baseStart.call(this); this.nav = new BR.NavField(this.g.world); this.rescues = 0; return r; },
    openDoor(d) { const r = baseOpen.call(this, d); if (this.nav) this.nav.build(); return r; },
    // dig a lost zombie back up at an open spawn near you
    rescue(z) {
      const g = this.g, p = g.player.pos, W = g.world, open = (W.zmSpawns || []).filter(s => !this.unlocked || this.unlocked.has(s.zone || 'graveyard'));
      const ok = open.filter(s => { const d = Math.hypot(s.x - p.x, s.z - p.z); return d > 10 && d < 45 && this.nav.distAt(s.x, s.z) < 65535; });
      const list = ok.length ? ok : open; if (!list.length) return;
      const s = list[Math.floor(Math.random() * list.length)];
      z.mover.pos.set(s.x, W.groundAt(s.x, s.z, 20), s.z); z.mover.vel.set(0, 0, 0);
      if (!z.boss) { z.riseT = z.riseMax = 1.1; g.fx.burst(z.pos.clone().setY(z.pos.y + 0.2), [0x3a2a1e, 0x5a4a3a, 0x241a12], 10, 3, 0.1, 0.8, 9); }
      this.rescues++;
    },
    // bosses use the field too (see ZBoss.update)
    navTarget(b, p) {
      if (!this.nav) return p.pos;
      const dp = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      if (dp < 5) return p.pos;
      const o = b._nv || (b._nv = { x: 0, z: 0 }), r = this.nav.next(b.pos.x, b.pos.z, o, 4);
      return r || p.pos;
    },
    update(dt) {
      const p = this.g.player;
      if (this.nav && p && p.alive && !this.cut) this.nav.update(dt, p.pos.x, p.pos.z);
      const r = baseUpdate.call(this, dt);
      this.updateMarkers();
      return r;
    },
    left() { return this.phase === 'fight' ? this.toSpawn + this.zombies.filter(z => z.alive).length + (this.bossPending ? 1 : 0) : 0; },
    // markers over the last 5 zombies (through walls, clamped to the screen edge)
    updateMarkers() {
      const g = this.g, n = this.left(), show = this.phase === 'fight' && n > 0 && n <= 5 && g.player.alive && !this.cut;
      const live = show ? this.zombies.filter(z => z.alive && z.riseT <= 0) : [];
      g.hud.zmMarkers(live, g.camera);
    },
    dispose() { this.g.hud.zmMarkers([], null); return baseDispose.call(this); },
  });
})();
