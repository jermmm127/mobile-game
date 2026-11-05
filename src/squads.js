'use strict';
// =============================================================================
// SQUADS + KNOCKDOWNS (v1.19)
// Battle Royale can be played as Solos, Duos, Trios or Squads; Resurgence as Solos, Duos or Trios.
// Your teammates are bots on your team (blue). In any team mode:
//  * at 0 HP you're KNOCKED DOWN instead of dying (as long as a teammate is still standing): you crawl
//    slowly, can't shoot, aim, use items or pick things up, and you bleed out over BLEED seconds
//  * a standing teammate revives you (stand next to them for REVIVE_T s; you: tap the prompt), you get
//    back up with REVIVE_HP health
//  * enemies can keep shooting a downed player to finish them faster (the finisher gets the kill)
//  * when nobody on a team is left standing, every downed member of that team is eliminated
//  * the last team with anyone alive wins; if you're out but your team is still in, you spectate them
// =============================================================================
BR.Squads = {
  SIZES: { br: [1, 2, 3, 4], resurgence: [1, 2, 3] },
  NAMES: { 1: 'SOLOS', 2: 'DUOS', 3: 'TRIOS', 4: 'SQUADS' },
  BLEED: 30, DOWN_HP: 100, REVIVE_T: 3.5, REVIVE_HP: 35, REVIVE_DIST: 2.3,
  MATE_COL: 0x3f8cff,
  TEAM_COLS: [0xe0533d, 0xe0a33d, 0x8fd14f, 0x3dd6c5, 0xb56ce6, 0xe66cb0, 0xd6d6d6, 0x9b6b43, 0x5b7a3a, 0xc94f7c, 0x6a74d9, 0xd9c36a, 0x4fa38a, 0xa04848, 0x7c8ea6],

  on(g) { return !!(g && g.squad > 1 && !g.zm && !g.mode && !g.duel && !g.practice); },

  // Called by startMatch after the bots are added: the player is on team 0 with the first (size-1)
  // bots; every other run of `size` bots is a team. Teams drop together.
  setup(g, size) {
    g.squad = size;
    const p = g.player, bots = g.actors.filter(a => a !== p);
    p.team = 0;
    bots.forEach((b, i) => { b.team = i < size - 1 ? 0 : 1 + Math.floor((i - (size - 1)) / size); });
    g.teams = 1 + Math.ceil(Math.max(0, bots.length - (size - 1)) / size);
    const C = BR.CONFIG, H = g.world.half;
    const byTeam = {};
    for (const a of g.actors) (byTeam[a.team] = byTeam[a.team] || []).push(a);
    for (const t in byTeam) {
      const list = byTeam[t], lead = t === '0' ? p : list[0];
      const col = t === '0' ? this.MATE_COL : this.TEAM_COLS[(t - 1) % this.TEAM_COLS.length];
      list.forEach((a, i) => {
        if (a !== lead) a.mover.pos.set(BR.util.clamp(lead.pos.x + (i % 2 ? 4 : -4) * Math.ceil(i / 2), -H, H), lead.pos.y + Math.random() * 3, BR.util.clamp(lead.pos.z + 3 * (i % 2), -H, H));
        if (a.mesh && a.mesh.userData.mat) { a.mesh.userData.mat.color.setHex(col); a.color = col; }
        if (a.brain && a !== lead && lead.brain) { const d = lead.brain.dropTarget; a.brain.dropTarget = { x: d.x + (Math.random() - 0.5) * 16, z: d.z + (Math.random() - 0.5) * 16 }; }
        if (a.brain && t === '0') a.brain.mateOfPlayer = true;
      });
    }
    void C;
  },

  standing(g, team, except) { for (const a of g.actors) if (a !== except && a.alive && !a.downed && a.team === team) return true; return false; },
  teamAlive(g, team) { for (const a of g.actors) if (a.alive && a.team === team) return true; return false; },
  teamsAlive(g) { const s = new Set(); for (const a of g.actors) if (a.alive) s.add(a.team); return s.size; },
  mates(g) { const p = g.player; return g.actors.filter(a => a !== p && a.team === p.team); },

  // Instead of dying: get knocked down (returns true). Only while a teammate is still standing.
  tryDown(g, v, killer, wid, head) {
    if (!this.on(g) || v.downed || v.team === undefined) return false;
    if (!this.standing(g, v.team, v)) return false;
    v.downed = true; v.health = this.DOWN_HP; v.shield = 0; v.downT = g.time;
    v.knocker = killer || null; v.downWid = wid; v.reviver = null; v.reviveP = 0;
    v.fireHeld = false; v.ads = false; v.stimT = 0; v.stimHealT = 0; v.lunge = null;
    if (v.mover.grapple) v.mover.releaseGrapple();
    v.mover.prone = true; v.mover.sliding = false; v.mover.crouched = true;
    if (v.brain) { v.brain.target = null; v.brain.burstT = 0; }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nm = a => `<b class="${a.isPlayer ? 'me' : a.team === g.player.team ? 'mate' : ''}">${esc(a.name)}</b>`;
    g.hud.killfeed(killer ? `${nm(killer)} <i>knocked</i> ${nm(v)}` : `${nm(v)} <i>went down</i>`, v.isPlayer || (killer && killer.isPlayer) ? 'feed-none' : '');
    if (killer && killer.isPlayer) { g.hud.toast('KNOCKED · ' + v.name, 900); BR.Audio.kill && BR.Audio.kill(head, 1); }
    if (v.isPlayer) { g.hud.toast('YOU\'RE DOWN · crawl to cover, a teammate can revive you', 2200); BR.Audio.hurt(); g.vmr.hide && g.vmr.hide(); }
    return true;
  },

  revive(g, v, by) {
    v.downed = false; v.reviver = null; v.reviveP = 0; v.health = this.REVIVE_HP; v.mover.prone = false; v.mover.crouched = false;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    g.hud.killfeed(`<b class="${by.isPlayer ? 'me' : 'mate'}">${esc(by.name)}</b> <i>revived</i> <b class="${v.isPlayer ? 'me' : 'mate'}">${esc(v.name)}</b>`, 'feed-none');
    if (v.isPlayer) { g.hud.toast('REVIVED', 900); g.vmr.lastWeapon = null; }
    if (by.isPlayer) { g.hud.toast('Revived ' + v.name, 900); BR.Audio.coin && BR.Audio.coin(); }
  },

  // After any death: a team with nobody left standing is wiped (its downed members are finished off)
  onDeath(g, v) {
    if (!this.on(g) || v.team === undefined || this.standing(g, v.team)) return;
    for (const a of g.actors) if (a.alive && a.downed && a.team === v.team) g.kill(a, a.knocker && a.knocker.alive ? a.knocker : null, 'bleed', false);
  },

  // The player's revive target: a downed teammate right next to you
  reviveTarget(g) {
    const p = g.player;
    if (!this.on(g) || !p.alive || p.downed || p.mover.dropping) return null;
    let best = null, bd = this.REVIVE_DIST;
    for (const a of g.actors) if (a !== p && a.alive && a.downed && a.team === p.team) { const d = a.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = a; } }
    return best;
  },

  update(g, dt) {
    if (!this.on(g)) return;
    const p = g.player;
    for (const a of g.actors) {
      if (!a.alive || !a.downed) continue;
      // revive in progress? the reviver must stay close, standing and not shooting
      const r = a.reviver;
      if (r && (!r.alive || r.downed || r.fireHeld || r.pos.distanceTo(a.pos) > this.REVIVE_DIST + 0.4 || (r.isPlayer && Math.hypot(g.input.moveX, g.input.moveY) > 0.35))) { a.reviver = null; a.reviveP = 0; if (r.isPlayer) g.hud.toast('Revive cancelled', 700); }
      if (a.reviver) {
        a.reviveP += dt;
        if (a.reviveP >= this.REVIVE_T) { this.revive(g, a, a.reviver); continue; }
      } else {
        a.health -= this.DOWN_HP / this.BLEED * dt;                // bleeding out (paused while being revived)
        if (a.health <= 0) { a.health = 0; g.kill(a, a.knocker && a.knocker.alive ? a.knocker : null, 'bleed', false); }
      }
    }
    // your teammates follow your drop
    for (const a of g.actors) {
      if (a.brain && a.brain.mateOfPlayer && a.mover.dropping && p.alive && p.mover.dropping) {
        const i = a.id % 3, ang = i * 2.1;
        a.brain.dropTarget = { x: p.pos.x + Math.cos(ang) * 6, z: p.pos.z + Math.sin(ang) * 6 };
      }
    }
    // out but your team is still in: spectate a living teammate
    if (!p.alive) {
      const m = this.mates(g).find(a => a.alive && !a.downed) || this.mates(g).find(a => a.alive);
      if (m) { g.deathPos = g.deathPos || m.pos.clone(); g.deathPos.lerp(m.pos, Math.min(1, dt * 4)); if (g._spec !== m) { g._spec = m; g.hud.toast('SPECTATING ' + m.name, 1400); } }
    } else g._spec = null;
  },

  // Bot side. Returns true when it took over the bot this frame.
  botTick(brain, dt) {
    const a = brain.a, g = brain.g, inp = a.input;
    if (!this.on(g) || a.team === undefined) return false;
    if (a.downed) {
      // crawl away from the nearest enemy, toward the nearest standing teammate
      a.fireHeld = false;
      let mate = null, md = 1e9, foe = null, fd = 1e9;
      for (const o of g.actors) {
        if (o === a || !o.alive) continue;
        const d = o.pos.distanceTo(a.pos);
        if (o.team === a.team) { if (!o.downed && d < md) { md = d; mate = o; } }
        else if (d < fd) { fd = d; foe = o; }
      }
      if (mate && md > 1.5) brain.steerTo(mate.pos.x, mate.pos.z, dt, 1);
      else if (foe && fd < 25) brain.steerTo(a.pos.x * 2 - foe.pos.x, a.pos.z * 2 - foe.pos.z, dt, 1);
      return true;
    }
    if (brain.target && brain.target.alive) return false;
    // revive a downed teammate nearby (unless someone is already on it)
    let need = null, nd = 70;
    for (const o of g.actors) {
      if (o === a || !o.alive || !o.downed || o.team !== a.team || (o.reviver && o.reviver !== a)) continue;
      const d = o.pos.distanceTo(a.pos); if (d < nd) { nd = d; need = o; }
    }
    if (need) {
      if (nd > 1.4) brain.steerTo(need.pos.x, need.pos.z, dt, 1);
      else { inp.mx = inp.mz = 0; brain.lookToward(need.pos.x, need.pos.y + 0.3, need.pos.z, dt); if (!need.reviver) { need.reviver = a; need.reviveP = 0; } }
      a.fireHeld = false;
      return true;
    }
    // regroup: stay near the team leader (you, on your team)
    if (brain.state === 'roam' || brain.state === 'loot') {
      const lead = brain.mateOfPlayer ? g.player : g.actors.find(o => o.alive && !o.downed && o.team === a.team && o !== a);
      if (lead && lead.alive && !lead.mover.dropping && lead.pos.distanceTo(a.pos) > (brain.mateOfPlayer ? 22 : 35)) {
        brain.lootGoal = null; brain.state = 'roam';
        brain.goal = { x: lead.pos.x + (Math.random() - 0.5) * 8, y: 0, z: lead.pos.z + (Math.random() - 0.5) * 8 };
      }
    }
    return false;
  },
};
