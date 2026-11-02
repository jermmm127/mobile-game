'use strict';
// =============================================================================
// MOVER — the character controller. Player and bots both use this, so every
// movement trick (slide, wall-run, wall-jump, mantle, vault, skydive) works the
// same for everyone.
//
// Input each frame: { mx, mz, jump, slide }
//   mx/mz: strafe / forward in [-1, 1] relative to `yaw`
//   jump/slide: true on the frame the button was pressed
// =============================================================================
BR.Mover = class Mover {
  constructor(world) {
    const A = BR.CONFIG.actor;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.r = A.radius;
    this.standH = A.standHeight;
    this.h = this.standH;
    this.onGround = false;
    this.wasGround = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.sliding = false;
    this.slideT = 0;
    this.slideCd = 0;
    this.slideQueue = 0;
    this.wallN = { x: 0, z: 0 };
    this.wallContactT = 9;
    this.wallTall = false;
    this.wallRunning = false;
    this.wallRunT = 0;
    this.wallRunCd = 0;
    this.mantleTop = null;
    this.dropping = false;
    this.events = {};    // one-frame flags: jump, land, slide, wallrun, walljump, mantle
    this.landSpeed = 0;
    // movement-tech bookkeeping
    this.sinceLand = 9;      // seconds on the ground since the last landing
    this.hopChain = 0;       // consecutive bunny hops
    this.wallKey = '';       // which wall we last wall-ran on
    this.wallPlane = 0;      // coordinate of the last wall surface we touched
    this.wallChain = 0;      // consecutive walls in one air-time
    this.mantleT = 0;        // window to mantle-boost
    this.pendingBoost = null;
    this._tmp = [];
  }

  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }

  update(dt, inp, yaw) {
    const M = BR.CONFIG.move;
    const ev = this.events;
    for (const k in ev) ev[k] = false;
    this.slideCd -= dt; this.wallRunCd -= dt; this.coyote -= dt; this.jumpBuf -= dt;
    this.slideQueue -= dt; this.wallContactT += dt; this.mantleT -= dt;
    this.sinceLand = this.onGround ? this.sinceLand + dt : 0; // time spent on the ground since landing
    if (inp.jump) this.jumpBuf = M.jumpBuffer;
    // TECH auto-hop: holding jump re-jumps the instant you land (no friction frame)
    if (inp.jumpHeld && this.onGround) this.jumpBuf = M.jumpBuffer;
    if (inp.slide && !this.onGround && !this.dropping) this.slideQueue = M.slideQueueTime;

    // wish direction in world space. forward = (-sin yaw, -cos yaw)
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    let wx = -sy * inp.mz + cy * inp.mx;
    let wz = -cy * inp.mz - sy * inp.mx;
    const wl = Math.hypot(wx, wz);
    const frac = Math.min(1, wl);
    if (wl > 1e-4) { wx /= wl; wz /= wl; }

    // ---- skydive ----------------------------------------------------------
    if (this.dropping) {
      const tx = wx * M.dropGlideSpeed * frac, tz = wz * M.dropGlideSpeed * frac;
      const k = 1 - Math.exp(-M.dropAccel * 0.25 * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      this.vel.y = Math.max(this.vel.y - M.gravity * dt, -M.dropFallSpeed);
      this.integrate(dt, false);
      if (this.onGround) { this.dropping = false; ev.land = true; this.landSpeed = M.dropFallSpeed * 0.5; }
      return;
    }

    // ---- slide --------------------------------------------------------------
    const hs = this.speedH;
    const wantSlide = inp.slide || (this.slideQueue > 0 && this.onGround);
    // TECH slide-hop: a slide that starts within a few frames of landing ignores the
    // cooldown and the normal speed cap, so slide -> jump -> slide chains keep stacking.
    const landSlide = this.onGround && this.sinceLand < M.tech.slideHopWindow && hs > M.runSpeed;
    if (wantSlide && (this.slideCd <= 0 || landSlide) && !this.sliding && (this.onGround || this.coyote > 0) && (hs > 2 || frac > 0.3)) {
      this.sliding = true; this.slideT = 0; this.slideCd = M.slideCooldown; this.slideQueue = 0;
      let dx = this.vel.x, dz = this.vel.z;
      if (hs < 0.5) { dx = wx; dz = wz; } else { dx /= hs; dz /= hs; }
      const cap = landSlide ? M.maxSpeed : M.slideMaxSpeed;
      const ns = Math.min(Math.max(hs, M.runSpeed) + M.slideBoost, cap);
      if (landSlide && ns > M.slideMaxSpeed - 0.5) ev.tech = 'SLIDE-HOP';
      this.vel.x = dx * ns; this.vel.z = dz * ns;
      ev.slide = true;
    }
    if (this.sliding) {
      this.slideT += dt;
      if (this.onGround && (this.speedH < M.slideEndSpeed || this.slideT > M.slideMaxTime)) this.sliding = false;
    }

    // ---- jump / wall-jump ---------------------------------------------------
    let jumped = false;
    if (this.jumpBuf > 0) {
      if (this.onGround || this.coyote > 0) {
        this.vel.y = M.jumpSpeed;
        // TECH super jump: jump in the first instant of a slide
        if (this.sliding && this.slideT < M.tech.superJumpWindow) {
          this.vel.y = M.jumpSpeed * M.tech.superJumpMult;
          this.vel.x *= 1.08; this.vel.z *= 1.08;
          ev.tech = 'SUPER JUMP';
        }
        // TECH bunny hop: jumping on the landing frame skips ground friction entirely
        if (this.sinceLand < 0.06 && this.speedH > M.runSpeed + 1) {
          this.hopChain++;
          if (this.hopChain >= 2 && !ev.tech) ev.tech = 'BHOP x' + this.hopChain;
        } else this.hopChain = 0;
        this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
        this.sliding = false;
        jumped = true; ev.jump = true;
      } else if (this.mantleT > 0) {
        // TECH mantle boost: jump while climbing a ledge to launch off it
        const fx = -this.wallN.x, fz = -this.wallN.z;
        this.vel.y = M.jumpSpeed * 1.15;
        this.pendingBoost = { x: fx, z: fz, t: 0.5 }; // applied once we clear the ledge
        this.mantleT = 0; this.jumpBuf = 0;
        jumped = true; ev.jump = true; ev.tech = 'MANTLE BOOST';
      } else if (this.wallRunning || (this.wallContactT < 0.18 && this.wallTall)) {
        const n = this.wallN;
        this.vel.x += n.x * M.wallJumpOut + wx * 2;
        this.vel.z += n.z * M.wallJumpOut + wz * 2;
        this.vel.y = M.wallJumpUp;
        this.wallRunning = false; this.wallRunCd = M.tech.wallChainCooldown; this.jumpBuf = 0;
        this.wallContactT = 9; // forget this wall: only a fresh touch starts the next wall-run
        jumped = true; ev.walljump = true;
        if (this.wallChain >= 2) ev.tech = 'WALL CHAIN x' + this.wallChain;
      }
    }

    // ---- horizontal acceleration -------------------------------------------
    if (this.onGround && !jumped) {
      if (this.sliding) {
        this.friction(M.slideFriction, dt);
        this.accelerate(wx, wz, M.runSpeed * 0.5 * frac, M.slideSteer, dt);
      } else {
        this.friction(M.friction, dt);
        this.accelerate(wx, wz, M.runSpeed * frac, M.accelGround, dt);
      }
    } else {
      this.accelerate(wx, wz, M.runSpeed * frac, M.accelAir, dt);
    }

    // ---- wall-run stick -----------------------------------------------------
    if (this.wallRunning) {
      this.wallRunT += dt;
      const n = this.wallN;
      const vn = this.vel.x * n.x + this.vel.z * n.z;
      this.vel.x -= n.x * (vn + 1.5);
      this.vel.z -= n.z * (vn + 1.5);
      // keep running speed along the wall
      const along = { x: -n.z, z: n.x };
      let va = this.vel.x * along.x + this.vel.z * along.z;
      if (Math.abs(va) < M.wallRunSpeedSustain) {
        const sign = va >= 0 ? 1 : -1;
        const add = (M.wallRunSpeedSustain - Math.abs(va)) * Math.min(1, 6 * dt);
        this.vel.x += along.x * add * sign; this.vel.z += along.z * add * sign;
      }
    }

    // ---- gravity ------------------------------------------------------------
    const g = M.gravity * (this.wallRunning ? M.wallRunGravityScale : 1);
    this.vel.y -= g * dt;
    if (this.wallRunning && this.vel.y < -M.wallRunMaxFall) this.vel.y = -M.wallRunMaxFall;

    // speed cap
    const sp = this.speedH;
    if (sp > M.maxSpeed) { this.vel.x *= M.maxSpeed / sp; this.vel.z *= M.maxSpeed / sp; }

    // ---- crouch height (slide) ---------------------------------------------
    const targetH = this.sliding ? BR.CONFIG.actor.slideHeight : this.standH;
    if (targetH < this.h) this.h = targetH;
    else if (targetH > this.h) {
      const p = this.pos, r = this.r;
      if (!this.world.query(p.x - r, p.y + 0.05, p.z - r, p.x + r, p.y + targetH, p.z + r, this._tmp).length) this.h = targetH;
    }

    // ---- move + collide -----------------------------------------------------
    this.mantleWish = inp.mz > 0.3;
    this.integrate(dt, jumped);

    if (this.pendingBoost) {
      const b = this.pendingBoost;
      b.t -= dt;
      if (this.wallContactT > 0) {
        // launch forward at run speed + boost, whatever speed the climb left us with
        const cur = this.vel.x * b.x + this.vel.z * b.z;
        const add = Math.max(cur, M.runSpeed) + M.tech.mantleBoost - cur;
        this.vel.x += b.x * add; this.vel.z += b.z * add;
        this.pendingBoost = null;
      }
      else if (b.t <= 0) this.pendingBoost = null;
    }

    // ---- mantle / vault -----------------------------------------------------
    if (this.mantleTop !== null) {
      const need = this.mantleTop - this.pos.y + 0.15;
      const v = Math.sqrt(2 * M.gravity * Math.max(need, 0.1));
      if (this.vel.y < v) { this.vel.y = v; ev.mantle = true; this.mantleT = M.tech.mantleBoostWindow; }
      this.vel.x -= this.wallN.x * 2.5; this.vel.z -= this.wallN.z * 2.5;
      this.mantleTop = null;
      this.sliding = false;
    }

    // ---- wall-run state -----------------------------------------------------
    const fwd = inp.mz > 0.3;
    const canRun = !this.onGround && this.wallContactT < (this.wallRunning ? 0.06 : 0.2) && this.wallTall && this.wallRunCd <= 0 &&
      this.wallRunT < M.wallRunMaxTime && fwd && this.speedH >= M.wallRunMinSpeed &&
      (this.wallRunning || this.vel.y < M.wallRunEnterVy);
    if (canRun) {
      // Entering a wall-run resets vertical speed to a small lift: a gentle arc, not a wall climb
      if (!this.wallRunning) {
        this.vel.y = M.wallRunStartLift; ev.wallrun = true;
        // TECH wall chain: a *different* wall refreshes your wall-run timer
        const key = this.wallN.x + ',' + this.wallN.z + ',' + this.wallPlane.toFixed(1);
        if (key !== this.wallKey) { this.wallRunT = 0; this.wallChain++; this.wallKey = key; }
      }
      this.wallRunning = true;
    } else if (this.wallRunning) {
      this.wallRunning = false;
      this.wallRunCd = 0.25;
    }
    if (this.onGround) { this.wallRunT = 0; this.wallChain = 0; this.wallKey = ''; }
  }

  friction(f, dt) {
    const M = BR.CONFIG.move;
    const sp = this.speedH;
    if (sp < 1e-4) return;
    const drop = Math.max(sp, M.stopSpeed) * f * dt;
    const ns = Math.max(sp - drop, 0) / sp;
    this.vel.x *= ns; this.vel.z *= ns;
  }

  // Quake-style: only adds speed along wishdir up to wishSpeed, so momentum
  // from slides / wall-jumps is never stolen while airborne.
  accelerate(wx, wz, wishSpeed, accel, dt) {
    if (wishSpeed <= 0) return;
    const cur = this.vel.x * wx + this.vel.z * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const a = Math.min(accel * dt * wishSpeed, add);
    this.vel.x += wx * a; this.vel.z += wz * a;
  }

  integrate(dt, jumped) {
    const M = BR.CONFIG.move;
    const v = this.vel;
    const maxD = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
    const steps = Math.max(1, Math.min(12, Math.ceil(maxD / 0.25)));
    const sdt = dt / steps;
    this.wasGround = this.onGround;
    const wasGround = this.onGround;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('x', v.x * sdt);
      this.moveAxis('z', v.z * sdt);
      this.moveAxis('y', v.y * sdt);
    }
    // Snap down small steps so running down stairs doesn't feel floaty
    if (!this.onGround && wasGround && !jumped && v.y <= 0) {
      const p = this.pos, r = this.r;
      const list = this.world.query(p.x - r, p.y - M.stepHeight, p.z - r, p.x + r, p.y, p.z + r, this._tmp);
      let top = -Infinity;
      for (const b of list) if (b.y1 <= p.y + 1e-3 && b.y1 > top) top = b.y1;
      if (top > -Infinity) { p.y = top; v.y = 0; this.onGround = true; }
    }
    if (wasGround && !this.onGround && !jumped) this.coyote = M.coyoteTime;
    if (!wasGround && this.onGround) { this.events.land = true; }
  }

  clearAt(x, y, z, h) {
    const r = this.r;
    return this.world.query(x - r, y, z - r, x + r, y + h, z + r, this._tmp).length === 0;
  }

  moveAxis(axis, d) {
    if (d === 0) return;
    const M = BR.CONFIG.move;
    const p = this.pos, r = this.r, h = this.h;
    p[axis] += d;
    const list = this.world.query(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r, this._tmp);
    if (!list.length) return;

    if (axis === 'y') {
      if (d < 0) {
        let top = -Infinity;
        for (const b of list) if (b.y1 > top) top = b.y1;
        if (this.vel.y < 0) this.landSpeed = -this.vel.y;
        p.y = top; this.vel.y = 0; this.onGround = true;
      } else {
        let bot = Infinity;
        for (const b of list) if (b.y0 < bot) bot = b.y0;
        p.y = bot - h - 1e-3; this.vel.y = Math.min(this.vel.y, 0);
      }
      return;
    }

    let top = -Infinity, bottom = Infinity, edge = d > 0 ? Infinity : -Infinity;
    for (const b of list) {
      if (b.y1 > top) top = b.y1;
      if (b.y0 < bottom) bottom = b.y0;
      if (axis === 'x') edge = d > 0 ? Math.min(edge, b.x0) : Math.max(edge, b.x1);
      else edge = d > 0 ? Math.min(edge, b.z0) : Math.max(edge, b.z1);
    }
    const dh = top - p.y;
    const grounded = this.onGround || this.wasGround;

    // step up
    if (dh > 0 && dh <= M.stepHeight && grounded) {
      const list2 = this.world.query(p.x - r, top + 0.01, p.z - r, p.x + r, top + 0.01 + h, p.z + r, this._tmp);
      if (!list2.length) { p.y = top + 0.001; return; }
    }

    // push out
    p[axis] = d > 0 ? edge - r - 1e-3 : edge + r + 1e-3;
    this.wallPlane = edge;
    this.vel[axis] = 0;
    this.wallN.x = axis === 'x' ? (d > 0 ? -1 : 1) : 0;
    this.wallN.z = axis === 'z' ? (d > 0 ? -1 : 1) : 0;
    this.wallContactT = 0;
    this.wallTall = top >= p.y + h * 0.9 && bottom <= p.y + 0.5;

    // mantle / vault candidate: ledge within reach and room on top
    const reach = grounded ? M.vaultHeight : M.mantleHeight;
    if (this.mantleWish && dh > M.stepHeight && dh <= reach) {
      const s = d > 0 ? 1 : -1;
      const fx = axis === 'x' ? p.x + s * (r + 0.35) : p.x;
      const fz = axis === 'z' ? p.z + s * (r + 0.35) : p.z;
      if (this.clearAt(fx, top + 0.02, fz, 1.0)) this.mantleTop = top;
    }
  }
};
