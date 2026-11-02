'use strict';
// =============================================================================
// MOVER — the character controller. Player and bots both use this, so every
// movement trick (slide, crouch, wall-run, wall-jump, mantle, vault, grapple,
// jump pads, skydive) works the same for everyone.
//
// Input each frame: { mx, mz, jump, crouch, speedMult }
//   mx/mz: strafe / forward in [-1, 1] relative to `yaw`
//   jump/crouch: true on the frame the button was pressed
//   Crouch while running = slide. Crouch otherwise = toggle crouch.
// The grapple is started from Actor.tryGrapple() (it needs the aim ray).
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
    this.crouched = false;
    this.slideT = 0;
    this.slideCd = 0;
    this.slideQueue = 0;
    this.slideDir = { x: 0, z: 0 };
    this.wallN = { x: 0, z: 0 };
    this.wallContactT = 9;
    this.wallTall = false;
    this.wallRunning = false;
    this.wallRunT = 0;
    this.wallRunCd = 0;
    this.mantleTop = null;
    this.dropping = false;
    this.grapple = null;     // { x, y, z, t } while hooked
    this.padHit = false;
    this.events = {};        // one-frame flags: jump, land, slide, wallrun, walljump, mantle, pad, grappleEnd, tech
    this.landSpeed = 0;
    // movement-tech bookkeeping
    this.sinceLand = 9;      // seconds on the ground since the last landing
    this.landVel = { x: 0, z: 0 }; // horizontal velocity at the moment we landed (bhop restores it)
    this.hopChain = 0;
    this.wallKey = '';
    this.wallPlane = 0;
    this.wallChain = 0;
    this.mantleT = 0;
    this.pendingBoost = null;
    this.superCd = 0;        // super jump cooldown
    this._tmp = [];
  }

  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }

  update(dt, inp, yaw) {
    const M = BR.CONFIG.move;
    const ev = this.events;
    for (const k in ev) ev[k] = false;
    this.slideCd -= dt; this.wallRunCd -= dt; this.coyote -= dt; this.jumpBuf -= dt;
    this.slideQueue -= dt; this.wallContactT += dt; this.mantleT -= dt; this.superCd -= dt;
    this.sinceLand = this.onGround ? this.sinceLand + dt : 0;
    if (inp.jump) this.jumpBuf = M.jumpBuffer;
    const run = M.runSpeed * (inp.speedMult || 1);

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

    // ---- crouch / slide (one button) ---------------------------------------
    const hs = this.speedH;
    // TECH slide-hop: crouch within a few frames of landing -> no cooldown, higher cap
    const landSlide = this.onGround && this.sinceLand < M.tech.slideHopWindow && hs > run;
    const running = hs >= run * M.slideMinSpeed && frac > 0.3;
    const queued = this.slideQueue > 0 && this.onGround && hs >= run * M.slideMinSpeed;
    if (inp.crouch || queued) {
      if (this.sliding) {                          // tap again: stop the slide
        if (inp.crouch) { this.sliding = false; this.crouched = false; }
      } else if ((this.onGround || this.coyote > 0) && (running || queued || landSlide) && (this.slideCd <= 0 || landSlide)) {
        this.startSlide(hs, wx, wz, frac, landSlide, run);
      } else if (!this.onGround && inp.crouch) {
        this.slideQueue = M.slideQueueTime;        // slide when we land
      } else if (this.onGround && inp.crouch) {
        this.crouched = !this.crouched;            // not running: plain crouch toggle
      }
    }
    if (this.sliding) {
      this.slideT += dt;
      if (this.onGround && (this.speedH < M.slideEndSpeed || this.slideT > M.slideMaxTime)) this.sliding = false;
    }

    // ---- jump / wall-jump / grapple release ---------------------------------
    let jumped = false;
    if (this.jumpBuf > 0 && this.grapple) {
      this.vel.y = Math.max(this.vel.y, 0) + M.grapple.releaseHop;
      this.releaseGrapple();
      this.jumpBuf = 0;
      jumped = true; ev.jump = true;
    } else if (this.jumpBuf > 0) {
      if (this.onGround || this.coyote > 0) {
        this.vel.y = M.jumpSpeed;
        this.crouched = false;
        // TECH bunny hop: a jump timed within bhopWindow of landing gives back the
        // speed ground friction just took. Mistime it and the friction sticks.
        if (this.onGround && this.sinceLand <= M.tech.bhopWindow) {
          const lv = this.landVel, ls = Math.hypot(lv.x, lv.z);
          if (ls > this.speedH) { this.vel.x = lv.x; this.vel.z = lv.z; }
          if (ls > run + 1) {
            this.hopChain++;
            if (this.hopChain >= 2) ev.tech = 'BHOP x' + this.hopChain;
          }
        } else this.hopChain = 0;
        // TECH super jump: jump in the first instant of a slide
        if (this.sliding && this.slideT < M.tech.superJumpWindow && this.superCd <= 0) {
          this.superCd = M.tech.superJumpCooldown;
          this.vel.y = M.jumpSpeed * M.tech.superJumpMult;
          this.vel.x *= 1.08; this.vel.z *= 1.08;
          ev.tech = 'SUPER JUMP';
        }
        this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
        this.sliding = false;
        jumped = true; ev.jump = true;
      } else if (this.mantleT > 0) {
        // TECH mantle boost: jump while climbing a ledge to launch off it
        this.vel.y = M.jumpSpeed * 1.15;
        this.pendingBoost = { x: -this.wallN.x, z: -this.wallN.z, t: 0.5 };
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
    const crouchy = this.crouched && !this.sliding;
    if (this.grapple) {
      this.updateGrapple(dt);
      this.accelerate(wx, wz, run * frac, M.accelAir, dt);
    } else if (this.onGround && !jumped) {
      if (this.sliding) {
        // Slides are locked to their starting direction: friction only, no steering
        this.friction(M.slideFriction, dt);
      } else {
        this.friction(M.friction, dt);
        this.accelerate(wx, wz, (crouchy ? M.crouchSpeed : run) * frac, M.accelGround, dt);
      }
    } else {
      this.accelerate(wx, wz, run * frac, M.accelAir, dt);
    }

    // ---- wall-run stick -----------------------------------------------------
    if (this.wallRunning) {
      this.wallRunT += dt;
      const n = this.wallN;
      const vn = this.vel.x * n.x + this.vel.z * n.z;
      this.vel.x -= n.x * (vn + 1.5);
      this.vel.z -= n.z * (vn + 1.5);
      const along = { x: -n.z, z: n.x };
      const va = this.vel.x * along.x + this.vel.z * along.z;
      if (Math.abs(va) < M.wallRunSpeedSustain) {
        const sign = va >= 0 ? 1 : -1;
        const add = (M.wallRunSpeedSustain - Math.abs(va)) * Math.min(1, 6 * dt);
        this.vel.x += along.x * add * sign; this.vel.z += along.z * add * sign;
      }
    }

    // ---- gravity ------------------------------------------------------------
    const gScale = this.grapple ? M.grapple.gravityScale : this.wallRunning ? M.wallRunGravityScale : 1;
    this.vel.y -= M.gravity * gScale * dt;
    if (this.wallRunning && this.vel.y < -M.wallRunMaxFall) this.vel.y = -M.wallRunMaxFall;

    // speed cap (the grapple has its own)
    const sp = this.speedH, cap = this.grapple ? M.grapple.maxSpeed : M.maxSpeed;
    if (sp > cap) { this.vel.x *= cap / sp; this.vel.z *= cap / sp; }

    // ---- body height --------------------------------------------------------
    const A = BR.CONFIG.actor;
    const targetH = this.sliding ? A.slideHeight : this.crouched ? A.crouchHeight : this.standH;
    if (targetH < this.h) this.h = targetH;
    else if (targetH > this.h) {
      const p = this.pos, r = this.r;
      if (!this.world.query(p.x - r, p.y + 0.05, p.z - r, p.x + r, p.y + targetH, p.z + r, this._tmp).length) this.h = targetH;
    }

    // ---- move + collide -----------------------------------------------------
    this.mantleWish = inp.mz > 0.3 || !!this.grapple;
    this.integrate(dt, jumped);

    // ---- jump pad -----------------------------------------------------------
    if (this.padHit) {
      this.padHit = false;
      this.vel.y = M.padSpeed;
      this.onGround = false;
      this.sliding = false;
      ev.pad = true; ev.tech = 'LAUNCH';
    }

    if (this.pendingBoost) {
      const b = this.pendingBoost;
      b.t -= dt;
      if (this.wallContactT > 0) {
        const cur = this.vel.x * b.x + this.vel.z * b.z;
        const add = Math.max(cur, run) + M.tech.mantleBoost - cur;
        this.vel.x += b.x * add; this.vel.z += b.z * add;
        this.pendingBoost = null;
      } else if (b.t <= 0) this.pendingBoost = null;
    }

    // ---- mantle / vault -----------------------------------------------------
    if (this.mantleTop !== null) {
      const need = this.mantleTop - this.pos.y + 0.15;
      const v = Math.sqrt(2 * M.gravity * Math.max(need, 0.1));
      if (this.vel.y < v) { this.vel.y = v; ev.mantle = true; this.mantleT = M.tech.mantleBoostWindow; }
      this.vel.x -= this.wallN.x * 2.5; this.vel.z -= this.wallN.z * 2.5;
      this.mantleTop = null;
      this.sliding = false;
      this.crouched = false;
      if (this.grapple) this.releaseGrapple(true);
    }

    // ---- wall-run state -----------------------------------------------------
    const fwd = inp.mz > 0.3;
    const canRun = !this.grapple && !this.onGround && this.wallContactT < (this.wallRunning ? 0.06 : 0.2) && this.wallTall && this.wallRunCd <= 0 &&
      this.wallRunT < M.wallRunMaxTime && fwd && this.speedH >= M.wallRunMinSpeed &&
      (this.wallRunning || this.vel.y < M.wallRunEnterVy);
    if (canRun) {
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

  startSlide(hs, wx, wz, frac, landSlide, run) {
    const M = BR.CONFIG.move;
    this.sliding = true; this.crouched = false; this.slideT = 0; this.slideCd = M.slideCooldown; this.slideQueue = 0;
    // Omni-slide: go where the stick points (sideways and backwards too), else along velocity
    let dx, dz;
    if (frac > 0.3) { dx = wx; dz = wz; } else { dx = this.vel.x / (hs || 1); dz = this.vel.z / (hs || 1); }
    const cap = landSlide ? M.maxSpeed : M.slideMaxSpeed;
    const ns = Math.min(Math.max(hs, run) + M.slideBoost, cap);
    this.vel.x = dx * ns; this.vel.z = dz * ns;
    this.slideDir.x = dx; this.slideDir.z = dz;
    this.events.slide = true;
    if (landSlide && ns > M.slideMaxSpeed - 0.5) this.events.tech = 'SLIDE-HOP';
  }

  // ---- grapple ---------------------------------------------------------------
  // actor (optional): hooked onto a player — the hook follows them
  startGrapple(x, y, z, actor) {
    this.grapple = { x, y, z, t: 0, actor: actor || null };
    this.sliding = false; this.crouched = false; this.wallRunning = false;
    this.onGround = false;
    if (this.vel.y < 2) this.vel.y = 2;
    this.events.grapple = true;
  }

  // auto = the hook reached its point (vs. the player jumping off early)
  releaseGrapple(auto) {
    if (!this.grapple) return;
    if (auto) {
      // Arriving: tame the launch so you land on the roof instead of flying past it,
      // and add a little hop so you crest the ledge. Jumping off early keeps all momentum.
      // enough upward speed to get the ledge within mantle reach, but no more
      const climb = Math.sqrt(2 * BR.CONFIG.move.gravity * Math.max(0, this.grapple.y - this.pos.y - 1.1));
      this.vel.y = Math.min(this.vel.y, Math.max(6, climb));
      const s = this.speedH;
      if (s > 9) { this.vel.x *= 9 / s; this.vel.z *= 9 / s; }
      if (this.grapple.y > this.pos.y + 0.5 && this.vel.y < 5) this.vel.y = 5;
    }
    this.grapple = null;
    this.events.grappleEnd = true;
  }

  updateGrapple(dt) {
    const G = BR.CONFIG.move.grapple, g = this.grapple;
    g.t += dt;
    if (g.actor) {
      if (!g.actor.alive) { this.releaseGrapple(true); return; }
      g.x = g.actor.pos.x; g.y = g.actor.pos.y + g.actor.mover.h * 0.6; g.z = g.actor.pos.z;
    }
    const dx = g.x - this.pos.x, dy = g.y - (this.pos.y + 0.6), dz = g.z - this.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1.6 || g.t > G.maxTime) { this.releaseGrapple(true); return; }
    this.vel.x += dx / d * G.pull * dt;
    this.vel.y += dy / d * G.pull * dt;
    this.vel.z += dz / d * G.pull * dt;
    const s = this.vel.length();
    if (s > G.maxSpeed) this.vel.multiplyScalar(G.maxSpeed / s);
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
    const preX = v.x, preZ = v.z;
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
    if (!wasGround && this.onGround) {
      this.events.land = true;
      this.landVel.x = preX; this.landVel.z = preZ;
      if (this.grapple) this.releaseGrapple();
    }
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
        let top = -Infinity, pad = false;
        for (const b of list) { if (b.y1 > top) top = b.y1; if (b.tag === 'pad') pad = true; }
        if (this.vel.y < 0) this.landSpeed = -this.vel.y;
        p.y = top; this.vel.y = 0; this.onGround = true;
        if (pad) this.padHit = true;
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
