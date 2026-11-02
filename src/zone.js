'use strict';
// =============================================================================
// ZONE — the shrinking safe circle. Phases come from CONFIG.zone.phases.
// Each phase: wait (circle fixed, next circle shown) -> shrink (lerp to next).
// Outside the current circle you take phase.dps damage (ignores shields).
// =============================================================================
BR.Zone = class Zone {
  constructor(game, world) {
    this.game = game;
    const H = world.half;
    this.x = 0; this.z = 0; this.r = H * 1.5;
    this.fromX = 0; this.fromZ = 0; this.fromR = this.r;
    this.phase = -1;
    this.state = 'wait';
    this.timer = 0;
    this.half = H;
    this.pickNext(0);
    this.mesh = this.buildMesh();
    game.scene.add(this.mesh);
  }

  get def() { return BR.CONFIG.zone.phases[Math.max(0, Math.min(this.phase, BR.CONFIG.zone.phases.length - 1))]; }
  get dps() { return this.phase < 0 ? 0 : this.def.dps; }

  pickNext(i) {
    const P = BR.CONFIG.zone.phases;
    this.phase = i;
    if (i >= P.length) { this.state = 'done'; this.nextX = this.x; this.nextZ = this.z; this.nextR = this.r; return; }
    const p = P[i];
    // New circle fully inside the old one, and centered on land
    const maxOff = Math.max(0, this.r - p.radius);
    const lim = this.half - p.radius - 5;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxOff * 0.9;
      const nx = this.x + Math.cos(a) * d, nz = this.z + Math.sin(a) * d;
      if (Math.abs(nx) <= Math.max(lim, 0) + 1e-6 && Math.abs(nz) <= Math.max(lim, 0) + 1e-6) { this.nextX = nx; this.nextZ = nz; break; }
      this.nextX = BR.util.clamp(nx, -Math.max(lim, 0), Math.max(lim, 0));
      this.nextZ = BR.util.clamp(nz, -Math.max(lim, 0), Math.max(lim, 0));
    }
    this.nextR = p.radius;
    this.state = 'wait';
    this.timer = p.wait;
  }

  timeLeft() { return this.state === 'wait' ? this.timer : 0; }

  update(dt) {
    if (this.state === 'done') return;
    this.timer -= dt;
    const p = this.def;
    if (this.state === 'wait' && this.timer <= 0) {
      this.state = 'shrink';
      this.timer = p.shrink;
      this.fromX = this.x; this.fromZ = this.z; this.fromR = this.r;
      this.game.onZoneShrink();
    } else if (this.state === 'shrink') {
      const k = 1 - Math.max(0, this.timer) / p.shrink;
      this.x = BR.util.lerp(this.fromX, this.nextX, k);
      this.z = BR.util.lerp(this.fromZ, this.nextZ, k);
      this.r = BR.util.lerp(this.fromR, this.nextR, k);
      if (this.timer <= 0) this.pickNext(this.phase + 1);
    }
    this.mesh.position.set(this.x, 0, this.z);
    const s = Math.max(this.r, 0.01);
    this.mesh.scale.set(s, 1, s);
  }

  outside(pos) { return Math.hypot(pos.x - this.x, pos.z - this.z) > this.r; }

  buildMesh() {
    const g = new THREE.CylinderGeometry(1, 1, 160, 72, 1, true);
    g.translate(0, 80, 0);
    const m = new THREE.MeshBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 5;
    return mesh;
  }
};
