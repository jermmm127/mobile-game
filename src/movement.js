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
const U_lerp = (a, b, t) => a + (b - a) * t;

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
    this.chute = false;      // parachute open (skydive)
    this.chuteAt = 0;        // optional custom auto-open height (bots vary it)
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

  // v1.28.2: arena maps (duels / TDM / FFA) have a hard play area: nobody gets over, onto or round the perimeter
  // walls, whatever the grapple, wall-run, jump pad or vault does. Pushing into the edge just stops you.
  clampBounds() {
    const B = this.world && this.world.playBounds; if (!B) return;
    const p = this.pos, v = this.vel, r = this.r || 0.35;
    if (p.x < B.x0 + r) { p.x = B.x0 + r; if (v.x < 0) v.x = 0; } else if (p.x > B.x1 - r) { p.x = B.x1 - r; if (v.x > 0) v.x = 0; }
    if (p.z < B.z0 + r) { p.z = B.z0 + r; if (v.z < 0) v.z = 0; } else if (p.z > B.z1 - r) { p.z = B.z1 - r; if (v.z > 0) v.z = 0; }
    if (B.y1 !== undefined && p.y > B.y1) { p.y = B.y1; if (v.y > 0) v.y = 0; }
    if (this.grapple && (this.grapple.x < B.x0 || this.grapple.x > B.x1 || this.grapple.z < B.z0 || this.grapple.z > B.z1) && this.releaseGrapple) this.releaseGrapple();     // no hooking onto the outside
  }
  update(dt, inp, yaw) {
    const M = BR.CONFIG.move;
    const ev = this.events;
    this.clampBounds();                               // (also catches teleports / respawns placed outside)
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

    // ---- v1.21 window vault: a scripted climb up onto the sill and through the opening ----------
    if (this.vault) {
      const V = this.vault; V.t += dt; const k = Math.min(1, V.t / V.dur), e = k * k * (3 - 2 * k);
      // up to the sill in the first half, through + down to the landing in the second
      const a = Math.min(1, e / 0.5), b = Math.max(0, (e - 0.5) / 0.5);
      const ox = this.pos.x, oy = this.pos.y, oz = this.pos.z;
      this.pos.x = V.x0 + (V.mx - V.x0) * a + (V.x1 - V.mx) * b; this.pos.z = V.z0 + (V.mz - V.z0) * a + (V.z1 - V.mz) * b;
      this.pos.y = V.y0 + (V.sill + 0.06 - V.y0) * Math.sin(a * Math.PI / 2) + (V.y1 - V.sill - 0.06) * b * b;
      this.h = 0.8; this.onGround = false; this.sliding = false; this.crouched = false;
      if (dt > 0) this.vel.set((this.pos.x - ox) / dt, (this.pos.y - oy) / dt, (this.pos.z - oz) / dt);
      if (k >= 1) { this.vault = null; this.pos.set(V.x1, V.y1, V.z1); this.clampBounds(); this.vel.set(V.dx * 4.5, 0, V.dz * 4.5); this.onGround = V.y1 <= this.world.groundAt(V.x1, V.z1, V.y1 + 0.05) + 0.02; ev.land = true; this.landSpeed = 3; }
      return;
    }
    if (inp.jump && !this.dropping && !this.grapple && this.tryWindowVault(yaw)) { this.jumpBuf = 0; ev.mantle = true; ev.tech = 'VAULT'; return; }

    // ---- v1.36 glider redeploy ------------------------------------------------
    // On the Battle Royale islands: high enough in the air (a Shockwave launch, a jump pad, off a roof or a ridge) and not on a
    // wall, Jump opens the glider again
    if (!this.dropping && !this.onGround && this.world.terrainOn && inp.jump && !this.grapple && !this.wallRunning && this.wallContactT > 0.25) {
      const gy = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y - gy >= M.glideMinHeight) { this.dropping = true; this.chute = true; this.chuteCut = false; ev.chute = true; this.jumpBuf = 0; this.sliding = false; this.crouched = false; }
    }
    // ---- skydive ----------------------------------------------------------
    // Freefall until you press Jump (or get close to the ground), then the parachute opens. v1.36: Crouch cuts the glider
    // (you freefall and it stays cut until you open it again with Jump).
    if (this.dropping) {
      if (this.chute && inp.crouch) { this.chute = false; this.chuteCut = true; ev.chuteCut = true; }
      else if (!this.chute) {
        const groundY = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
        if (inp.jump || (!this.chuteCut && this.pos.y - groundY < (this.chuteAt || M.chuteAutoHeight))) { this.chute = true; this.chuteCut = false; ev.chute = true; this.jumpBuf = 0; }
      }
      const glide = this.chute ? M.chuteGlideSpeed : M.dropGlideSpeed, fall = this.chute ? M.chuteFallSpeed : M.dropFallSpeed;
      const tx = wx * glide * frac, tz = wz * glide * frac;
      const k = 1 - Math.exp(-M.dropAccel * (this.chute ? 0.35 : 0.25) * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      // opening the chute brakes hard, then you float down
      if (this.chute && this.vel.y < -fall) this.vel.y = U_lerp(this.vel.y, -fall, 1 - Math.exp(-6 * dt));
      else this.vel.y = Math.max(this.vel.y - M.gravity * dt, -fall);
      this.integrate(dt, false);
      if (this.onGround) { this.dropping = false; this.chute = false; this.chuteCut = false; ev.land = true; this.landSpeed = this.vel.y < -8 ? 8 : 4; this.jumpBuf = 0; }
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
        this.accelerate(wx, wz, (this.prone ? M.crouchSpeed * 0.42 : crouchy ? M.crouchSpeed : run) * frac, M.accelGround, dt);     // v1.19 prone = knocked down, crawling
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
    const targetH = this.prone ? 0.62 : this.sliding ? A.slideHeight : this.crouched ? A.crouchHeight : this.standH;
    if (targetH < this.h) this.h = targetH;
    else if (targetH > this.h) {
      const p = this.pos, r = this.r;
      if (!this.world.query(p.x - r, p.y + 0.05, p.z - r, p.x + r, p.y + targetH, p.z + r, this._tmp).length) this.h = targetH;
    }

    // ---- move + collide -----------------------------------------------------
    this.mantleWish = inp.mz > 0.3 || !!this.grapple;
    this.integrate(dt, jumped);
    this.clampBounds();

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
      inp.jumpHeld !== false &&                       // players must hold JUMP to wall-run (letting go drops you off)
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

  // v1.21: Jump next to a window (a sill between knee and chest height with an opening above it) climbs through it.
  // Returns true and starts the vault when there's a clear landing on the other side.
  tryWindowVault(yaw) {
    const W = this.world, p = this.pos, dx = -Math.sin(yaw), dz = -Math.cos(yaw), q = this._tmp, w = 0.14;
    for (const reach of [0.45, 0.75, 1.05]) {
      const ax = p.x + dx * reach, az = p.z + dz * reach;
      W.query(ax - w, p.y + 0.35, az - w, ax + w, p.y + 1.6, az + w, q);
      if (!q.length) continue;
      let sill = -1; for (const b of q) if (!b.ground && b.y1 > sill && b.y1 <= p.y + 1.6) sill = b.y1;
      if (sill < p.y + 0.4 || sill > p.y + 1.55) continue;
      // an opening above the sill (at least 0.75 m) with something over it: a window, not just a low wall
      if (W.query(ax - w, sill + 0.03, az - w, ax + w, sill + 0.78, az + w, q).length) return false;
      if (!W.query(ax - w, sill + 0.78, az - w, ax + w, sill + 2.4, az + w, q).length) return false;
      // the far side: walk forward until there's standing room on the ground beyond the wall
      for (let l = reach + 0.35; l < reach + 1.9; l += 0.25) {
        const bx = p.x + dx * l, bz = p.z + dz * l;
        if (W.query(bx - w, sill + 0.03, bz - w, bx + w, sill + 0.78, bz + w, q).length) return false;     // blocked through the opening
        const gy = W.groundAt(bx, bz, sill + 0.05);
        if (gy > sill + 0.02) return false;
        if (this.clearAt(bx, gy + 0.02, bz, this.standH - 0.05)) {
          this.vault = { t: 0, dur: 0.46, x0: p.x, y0: p.y, z0: p.z, mx: ax, mz: az, sill, x1: bx, y1: gy + 0.001, z1: bz, dx, dz };
          if (this.grapple) this.releaseGrapple();
          return true;
        }
      }
      return false;
    }
    return false;
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

    let top = -Infinity, bottom = Infinity, edge = d > 0 ? Infinity : -Infinity, solid = false, gTop = -Infinity;
    for (const b of list) {
      if (b.ground) { gTop = b.y1; continue; }            // v1.35 terrain: the slab under you, handled below (never a wall edge)
      solid = true;
      if (b.y1 > top) top = b.y1;
      if (b.y0 < bottom) bottom = b.y0;
      if (axis === 'x') edge = d > 0 ? Math.min(edge, b.x0) : Math.max(edge, b.x1);
      else edge = d > 0 ? Math.min(edge, b.z0) : Math.max(edge, b.z1);
    }
    if (!solid) {                                          // only terrain here: walk up the slope, or stop at one too steep to climb
      const gh = gTop - p.y;
      if (gh <= M.stepHeight * 1.5) { p.y = gTop + 0.001; return; }
      p[axis] -= d; this.vel[axis] *= 0.25; return;
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
