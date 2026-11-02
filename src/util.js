'use strict';
// Small math + helper toolbox. No game logic here.
BR.util = {
  // Deterministic RNG (mulberry32). Same seed => same map.
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  // Frame-rate independent smoothing toward a target.
  damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); },
  wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },
  rand(r, a, b) { return a + (b - a) * r(); },
  pick(arr, r) { return arr[Math.floor(r() * arr.length)]; },
  weighted(table, r) {
    let total = 0;
    for (const k in table) total += table[k];
    let x = r() * total;
    for (const k in table) { x -= table[k]; if (x <= 0) return k; }
    return Object.keys(table)[0];
  },
  // Slab test. ix/iy/iz are inverse ray directions. Returns distance or Infinity.
  rayAABB(ox, oy, oz, ix, iy, iz, b, maxT) {
    let t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (b.y0 - oy) * iy; t2 = (b.y1 - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b.z0 - oz) * iz; t2 = (b.z1 - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax < Math.max(tmin, 0) || tmin > maxT) return Infinity;
    return tmin > 0 ? tmin : 0;
  },
  raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tc = lx * dx + ly * dy + lz * dz;
    if (tc < 0) return Infinity;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
    if (d2 > r * r) return Infinity;
    const t = tc - Math.sqrt(r * r - d2);
    return t <= maxT ? Math.max(t, 0) : Infinity;
  },
  inv(d) { return Math.abs(d) < 1e-9 ? 1e9 : 1 / d; },
  // localStorage wrapped so private mode / blocked storage never breaks the game.
  load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};
