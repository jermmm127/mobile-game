'use strict';
// =============================================================================
// ATTACHMENTS (v1.41)
// Optics, muzzles, grips and stocks for every gun except the Sniper and the Shockwave Launcher.
//  * You only get attachments from the ATTACHMENT CASE (BR.CASES.attach). Once you own one you can fit it to
//    every gun that has that slot.
//  * Equipped per gun: Profile.data.equip.attach[gunId] = { optic, muzzle, grip, stock }.
//  * Stats: BR.Attach.apply(w) gives YOUR weapon its own stat copy with the attachment changes (handling only:
//    recoil, spread, aim speed, zoom, range, sound. Never damage, fire rate or magazine size).
//  * Looks: BR.Attach.fit(model, gunId) bolts the parts onto your first-person gun (optic on the sight line with a
//    working reticle, muzzle device on the barrel, grip under the handguard).
// =============================================================================
BR.ATTACH = {
  // ---- optics: `zoom` replaces the gun's own aim zoom; all of them line up on the crosshair and hide it
  reddot:  { slot: 'optic', name: 'Red Dot', rarity: 'Common', kind: 'reddot', zoom: 1.25, m: { adsRate: 1.05 }, desc: 'Clean 1x dot. Slightly faster aim.' },
  reflex:  { slot: 'optic', name: 'Reflex Sight', rarity: 'Uncommon', kind: 'reflex', zoom: 1.3, m: { adsRate: 1.12 }, desc: 'Open frame, wide view, quick to aim.' },
  holo:    { slot: 'optic', name: 'Holo Sight', rarity: 'Rare', kind: 'holo', zoom: 1.4, m: { ads: 0.9 }, desc: 'Ring-and-dot reticle. Tighter aimed shots.' },
  x15:     { slot: 'optic', name: '1.5x Optic', rarity: 'Rare', kind: 'tube', zoom: 1.5, m: { ads: 0.88, adsRate: 0.97 }, desc: 'A little magnification for mid range.' },
  delta2:  { slot: 'optic', name: 'Delta 2x', rarity: 'Epic', kind: 'tube2', zoom: 2.0, m: { ads: 0.8, adsRate: 0.9 }, desc: '2x scope. Slower to aim, steadier at range.' },
  acog:    { slot: 'optic', name: 'ACOG 3x', rarity: 'Epic', kind: 'acog', zoom: 2.6, m: { ads: 0.72, adsRate: 0.82, recoil: 1.05 }, desc: '3x combat scope with a chevron. For long lanes.' },
  apex:    { slot: 'optic', name: 'Apex Holo', rarity: 'Legendary', kind: 'apex', zoom: 1.5, m: { ads: 0.82, adsRate: 1.12 }, desc: 'Holo with a 1.5x view that still aims fast.' },
  // ---- muzzles
  brake:   { slot: 'muzzle', name: 'Muzzle Brake', rarity: 'Common', kind: 'brake', m: { recoil: 0.9 }, desc: 'Vents gas sideways to cut recoil.' },
  flash:   { slot: 'muzzle', name: 'Flash Hider', rarity: 'Common', kind: 'flash', m: { bloom: 0.88, bloomMax: 0.9 }, desc: 'Spray spreads less as you hold the trigger.' },
  comp:    { slot: 'muzzle', name: 'Compensator', rarity: 'Uncommon', kind: 'comp', m: { recoil: 0.84, kick: 0.9, adsRate: 0.97 }, desc: 'Strong recoil control, a touch slower to aim.' },
  choke:   { slot: 'muzzle', name: 'Choke', rarity: 'Uncommon', kind: 'choke', only: 'shotgun', m: { spread: 0.8, range: 1.1 }, desc: 'Shotguns only: tighter pellets, more reach.' },
  supp:    { slot: 'muzzle', name: 'Suppressor', rarity: 'Rare', kind: 'supp', suppressed: true, m: { range: 0.94, recoil: 0.96 }, desc: 'Quiet shots, no flash. Slightly less range.' },
  longb:   { slot: 'muzzle', name: 'Long Barrel', rarity: 'Rare', kind: 'long', m: { range: 1.2, spread: 0.92, adsRate: 0.92 }, desc: 'More range and accuracy, slower handling.' },
  mono:    { slot: 'muzzle', name: 'Monolith Suppressor', rarity: 'Epic', kind: 'mono', suppressed: true, m: { range: 1.08, recoil: 0.93, adsRate: 0.9 }, desc: 'Heavy suppressor: quiet AND more range.' },
  phantom: { slot: 'muzzle', name: 'Phantom Suppressor', rarity: 'Legendary', kind: 'phantom', suppressed: true, m: { range: 1.1, recoil: 0.9 }, desc: 'Silent, longer range, less recoil. No downside.' },
  // ---- grips
  vert:    { slot: 'grip', name: 'Vertical Grip', rarity: 'Common', kind: 'vert', m: { recoil: 0.92 }, desc: 'Steadier recoil.' },
  angled:  { slot: 'grip', name: 'Angled Grip', rarity: 'Uncommon', kind: 'angled', m: { adsRate: 1.15 }, desc: 'Faster aim down sights.' },
  stubby:  { slot: 'grip', name: 'Stubby Grip', rarity: 'Rare', kind: 'stubby', m: { spread: 0.8, bloom: 0.92 }, desc: 'Tighter hip fire.' },
  laser:   { slot: 'grip', name: 'Laser Sight', rarity: 'Rare', kind: 'laser', m: { spread: 0.7 }, desc: 'Much tighter hip fire. Shows a red beam.' },
  cmd:     { slot: 'grip', name: 'Commando Foregrip', rarity: 'Epic', kind: 'cmd', m: { recoil: 0.86, bloom: 0.9, adsRate: 0.96 }, desc: 'Big recoil and spray control.' },
  gyro:    { slot: 'grip', name: 'Gyro Grip', rarity: 'Legendary', kind: 'gyro', m: { recoil: 0.8, kick: 0.85, spread: 0.9 }, desc: 'Stabilised grip: the steadiest recoil there is.' },
  // ---- stocks
  padded:  { slot: 'stock', name: 'Padded Stock', rarity: 'Common', kind: 'stock', m: { kick: 0.85 }, desc: 'Softer kick on every shot.' },
  skel:    { slot: 'stock', name: 'Skeleton Stock', rarity: 'Uncommon', kind: 'stock', m: { adsRate: 1.12, drawTime: 0.88, recoil: 1.05 }, desc: 'Light: faster aim and swaps, a bit more recoil.' },
  heavy:   { slot: 'stock', name: 'Heavy Stock', rarity: 'Rare', kind: 'stock', m: { recoil: 0.88, adsRate: 0.93 }, desc: 'Less recoil, slower to aim.' },
  tac:     { slot: 'stock', name: 'Tactical Stock', rarity: 'Epic', kind: 'stock', m: { recoil: 0.92, adsRate: 1.08, bloom: 0.94 }, desc: 'A bit better at everything.' },
};
for (const id in BR.ATTACH) { BR.ATTACH[id].caseOnly = true; BR.ATTACH[id].case = 'attach'; }

BR.Attach = {
  SLOTS: ['optic', 'muzzle', 'grip', 'stock'],
  LABEL: { optic: 'OPTIC', muzzle: 'MUZZLE', grip: 'GRIP', stock: 'STOCK' },
  // which slots a gun has (none for knives, the Sniper and the Shockwave Launcher)
  slots(id) {
    const d = BR.CONFIG.weapons[id];
    if (!d || d.melee || id === 'sniper' || id === 'launcher' || d.launcher) return [];
    const pistol = id === 'pistol' || id === 'mpistol' || id === 'revolver', out = [];
    if (!d.holo && !d.optic && !d.scope) out.push('optic');          // (guns with a built-in optic keep it)
    if (!d.suppressed) out.push('muzzle');                           // (already suppressed from the factory)
    if (!pistol) out.push('grip', 'stock');
    return out;
  },
  guns() { return Object.keys(BR.CONFIG.weapons).filter(id => this.slots(id).length); },
  fits(attId, gunId) {
    const a = BR.ATTACH[attId]; if (!a || !this.slots(gunId).includes(a.slot)) return false;
    return !(a.only === 'shotgun' && !(BR.CONFIG.weapons[gunId].pellets > 1));
  },
  owned(attId) { const o = BR.Profile && BR.Profile.data && BR.Profile.data.owned.attach; return !!(o && o.includes(attId)); },
  // equipped on a gun: { optic, muzzle, grip, stock } (only attachments you own and that fit)
  on(gunId) {
    const D = BR.Profile && BR.Profile.data, e = D && D.equip.attach && D.equip.attach[gunId], out = {};
    if (e) for (const s of this.SLOTS) if (e[s] && this.owned(e[s]) && this.fits(e[s], gunId)) out[s] = e[s];
    return out;
  },
  set(gunId, slot, attId) {
    const D = BR.Profile.data; D.equip.attach = D.equip.attach || {}; const e = D.equip.attach[gunId] || (D.equip.attach[gunId] = {});
    if (attId && this.owned(attId) && this.fits(attId, gunId)) e[slot] = attId; else delete e[slot];
    BR.Profile.save(); this.ver++;
  },
  ver: 1,
  stamp(gunId) { const o = this.on(gunId); return this.ver + ':' + this.SLOTS.map(s => o[s] || '').join(','); },
  // Give a weapon instance its own stats with the equipped attachments (the player's guns only).
  apply(w) {
    if (!w || !w.def || w.def.melee) return;
    const base = w._baseDef || (w._baseDef = w.def), on = this.on(w.id), ids = this.SLOTS.map(s => on[s]).filter(Boolean);
    w._att = this.stamp(w.id);
    if (!ids.length) { w.def = base; return; }
    const d = Object.assign({}, base);
    if (d.adsRate === undefined) d.adsRate = 13; if (d.drawTime === undefined) d.drawTime = 0.55;
    for (const id of ids) {
      const a = BR.ATTACH[id];
      for (const k in a.m) if (typeof d[k] === 'number') d[k] *= a.m[k];
      if (a.zoom) { d.zoom = a.zoom; d.holo = true; }
      if (a.suppressed) d.suppressed = true;
    }
    d.att = ids;
    w.def = d;
  },
  // "+12% aim speed" style lines for the UI: [text, good?]
  lines(attId) {
    const a = BR.ATTACH[attId], out = [], N = { recoil: ['recoil', -1], kick: ['kick', -1], spread: ['hip spread', -1], bloom: ['spray spread', -1], bloomMax: null, ads: ['aimed spread', -1], adsRate: ['aim speed', 1], range: ['range', 1], drawTime: ['swap time', -1] };
    if (a.zoom) out.push([a.zoom.toFixed(a.zoom % 1 ? 2 : 1).replace(/0$/, '') + 'x zoom', true]);
    if (a.suppressed) out.push(['Suppressed', true]);
    for (const k in a.m) { const n = N[k]; if (!n) continue; const pct = Math.round((a.m[k] - 1) * 100); if (!pct) continue; out.push([(pct > 0 ? '+' : '') + pct + '% ' + n[0], pct * n[1] > 0]); }
    return out;
  },

  // ---------------------------------------------------------------- first-person parts
  mats() {
    if (this._m) return this._m;
    const P = (c, sh) => new THREE.MeshPhongMaterial({ color: c, specular: 0x555a62, shininess: sh || 40 });
    return (this._m = { body: P(0x1b1d21, 34), steel: P(0x34383f, 70), tan: P(0x5a5348, 20), gold: P(0xc9a24a, 90),
      lens: new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
      red: new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.95, depthWrite: false }),
      cyan: new THREE.MeshBasicMaterial({ color: 0x5ff0ff, transparent: true, opacity: 0.95, depthWrite: false }),
      beam: new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }) });
  },
  // Bolt the equipped parts onto a freshly built first-person gun model.
  fit(model, gunId) {
    const on = this.on(gunId), ud = model.userData; if (!ud) return;
    const M = this.mats(), small = gunId === 'pistol' || gunId === 'mpistol' || gunId === 'revolver', S = small ? 0.8 : 1;
    const g = new THREE.Group(); g.userData.attach = true; model.add(g);
    const box = (w, h, d, mat, x, y, z, par) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); (par || g).add(m); return m; };
    const tube = (r0, r1, L, mat, x, y, z, par, open, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, L, seg || 18, 1, !!open), mat); if (open) { mat = mat.clone(); mat.side = THREE.DoubleSide; m.material = mat; } m.rotation.x = Math.PI / 2; m.position.set(x, y, z); (par || g).add(m); return m; };
    const mark = o => { o.userData.isFlash = true; o.userData.noUV = true; o.renderOrder = 5; return o; };
    // ---- optic: sits on the sight line; the gun's aim point moves up to the centre of its lens
    if (on.optic && ud.sight) {
      const a = BR.ATTACH[on.optic], k = a.kind, sp = ud.sight.position, o = new THREE.Group(); o.position.set(sp.x, sp.y + 0.006, sp.z); g.add(o);          // (riser: the optic's line of sight clears the iron sights)
      const R = M[k === 'apex' ? 'cyan' : 'red'];
      let cy = 0.034, len = 0.05;
      box(0.024, 0.026, k === 'acog' ? 0.1 : 0.06, M.steel, 0, -0.003, 0, o);                         // rail mount + riser
      if (k === 'reddot') { tube(0.021, 0.021, 0.05, M.body, 0, cy, 0, o, true); box(0.008, 0.008, 0.012, M.steel, 0.024, cy, 0, o); }
      else if (k === 'reflex') { cy = 0.036; box(0.03, 0.008, 0.04, M.body, 0, 0.012, 0.006, o); for (const sx of [-1, 1]) box(0.003, 0.042, 0.004, M.body, sx * 0.022, cy, -0.012, o); box(0.047, 0.003, 0.004, M.body, 0, cy + 0.021, -0.012, o); mark(box(0.041, 0.039, 0.0006, M.lens, 0, cy, -0.012, o)); }
      else if (k === 'holo' || k === 'apex') { cy = 0.036; len = 0.05; box(0.05, 0.004, len, M.body, 0, cy + 0.021, 0, o); box(0.05, 0.004, len, M.body, 0, cy - 0.021, 0, o); for (const sx of [-1, 1]) box(0.004, 0.046, len, M.body, sx * 0.025, cy, 0, o);
        if (k === 'apex') { box(0.052, 0.002, len + 0.002, M.gold, 0, cy + 0.0235, 0, o); }
        mark(box(0.046, 0.038, 0.0006, M.lens, 0, cy, -len / 2 + 0.002, o)); }
      else { len = k === 'acog' ? 0.12 : k === 'tube2' ? 0.095 : 0.075; const r = k === 'acog' ? 0.022 : 0.021; cy = 0.036;
        tube(r, r * (k === 'acog' ? 0.86 : 1), len, M.body, 0, cy, 0, o, true); tube(r + 0.003, r + 0.003, 0.012, M.steel, 0, cy, -len / 2 + 0.006, o, true); tube(r + 0.002, r + 0.002, 0.01, M.steel, 0, cy, len / 2 - 0.005, o, true);
        if (k === 'acog') box(0.006, 0.004, 0.07, M.red, 0, cy + r + 0.002, -0.005, o);                       // fibre-optic strip
        box(0.012, 0.014, 0.02, M.steel, 0, 0.016, 0, o);
        mark(tube(r * 0.94, r * 0.94, 0.0006, M.lens, 0, cy, -len / 2 + 0.004, o, false, 20)); }
      // reticle on the aim line (drawn over the lens)
      const ret = new THREE.Group(); ret.position.set(0, cy, k === 'reflex' ? -0.012 : 0); o.add(ret);
      const dot = (r, mat) => mark(new THREE.Mesh(new THREE.CircleGeometry(r, 14), mat));
      if (k === 'holo' || k === 'apex') { ret.add(mark(new THREE.Mesh(new THREE.RingGeometry(0.0062, 0.0072, 28), R))); ret.add(dot(0.0011, R)); for (const [x, y] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const t = mark(box(x ? 0.003 : 0.0008, y ? 0.003 : 0.0008, 0.0001, R, x * 0.0085, y * 0.0085, 0, ret)); void t; } }
      else if (k === 'acog') { const sh = new THREE.Shape(); sh.moveTo(0, 0.0012); sh.lineTo(0.0034, -0.0034); sh.lineTo(0.0022, -0.0034); sh.lineTo(0, -0.0006); sh.lineTo(-0.0022, -0.0034); sh.lineTo(-0.0034, -0.0034); sh.closePath(); ret.add(mark(new THREE.Mesh(new THREE.ShapeGeometry(sh), R))); mark(box(0.0006, 0.007, 0.0001, R, 0, -0.0075, 0, ret)); }
      else if (k === 'tube' || k === 'tube2') { ret.add(dot(0.001, R)); for (const sx of [-1, 1]) mark(box(0.006, 0.0006, 0.0001, R, sx * 0.0075, 0, 0, ret)); mark(box(0.0006, 0.006, 0.0001, R, 0, -0.0075, 0, ret)); }
      else ret.add(dot(0.0014, R));
      // aim through the centre of the optic, held a little closer so the window is big on screen
      const aim = new THREE.Object3D(); aim.position.set(sp.x, sp.y + 0.006 + cy, sp.z); model.add(aim);
      ud.sight = aim; ud.sightDist = k === 'acog' ? 0.27 : k === 'tube2' ? 0.23 : k === 'tube' ? 0.2 : 0.21; ud.attOptic = on.optic;
    }
    // ---- muzzle device: on the end of the barrel; the flash moves out to its tip (and is hidden when suppressed)
    if (on.muzzle && ud.flash) {
      const a = BR.ATTACH[on.muzzle], k = a.kind, fp = ud.flash.position, mz = new THREE.Group(); mz.position.copy(fp); g.add(mz);
      let L = 0.05;
      if (k === 'supp' || k === 'mono' || k === 'phantom') { L = (k === 'supp' ? 0.14 : 0.17) * S; const r = (k === 'supp' ? 0.019 : 0.022) * S; tube(r, r, L, k === 'phantom' ? M.steel : M.body, 0, 0, -L / 2, mz); tube(r + 0.0015, r + 0.0015, 0.012, M.steel, 0, 0, -0.008, mz); tube(r + 0.0015, r + 0.0015, 0.01, k === 'phantom' ? M.gold : M.steel, 0, 0, -L + 0.006, mz);
        if (k === 'mono') for (let i = 1; i < 5; i++) tube(r + 0.001, r + 0.001, 0.004, M.steel, 0, 0, -L * i / 5, mz); }
      else if (k === 'long') { L = 0.12 * S; tube(0.011 * S, 0.011 * S, L, M.steel, 0, 0, -L / 2, mz); tube(0.014 * S, 0.014 * S, 0.014, M.body, 0, 0, -L + 0.007, mz); }
      else if (k === 'choke') { L = 0.035; tube(0.023, 0.02, L, M.steel, 0, 0, -L / 2, mz); }
      else { L = (k === 'comp' ? 0.055 : 0.045) * S; const r = 0.0165 * S; tube(r, r, L, M.steel, 0, 0, -L / 2, mz);
        if (k === 'flash') for (let i = 0; i < 4; i++) { const b = box(0.004, r * 2.3, L * 0.6, M.body, 0, 0, -L * 0.62, mz); b.rotation.z = i * Math.PI / 4; }
        else for (const z of k === 'comp' ? [0.3, 0.55, 0.8] : [0.4, 0.75]) { box(r * 2.4, 0.005, 0.007, M.body, 0, k === 'comp' ? r * 0.55 : 0, -L * z, mz); if (k === 'brake') box(0.005, r * 2.4, 0.007, M.body, 0, 0, -L * z, mz); } }
      fp.z -= L; if (ud.muzzle && ud.muzzle.position) ud.muzzle.position.z -= L;
    }
    // ---- grip: under the handguard, just ahead of your support hand
    if (on.grip && ud.fore) {
      const a = BR.ATTACH[on.grip], k = a.kind, f = ud.fore, gp = new THREE.Group(); gp.position.set(f.x, f.y - 0.012, f.z - 0.085); g.add(gp);
      const V = (r, L, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, L, 12), mat); m.position.y = -L / 2 - 0.006; gp.add(m); return m; };
      box(0.022, 0.008, 0.045, M.steel, 0, -0.003, 0, gp);
      if (k === 'vert') V(0.0135, 0.075, M.body);
      else if (k === 'stubby') V(0.0155, 0.042, M.body);
      else if (k === 'cmd') { V(0.015, 0.07, M.tan); box(0.03, 0.01, 0.03, M.body, 0, -0.08, 0, gp); }
      else if (k === 'gyro') { V(0.0145, 0.07, M.body); const r = mark(new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0022, 6, 22), M.cyan)); r.rotation.x = Math.PI / 2; r.position.y = -0.03; gp.add(r); box(0.024, 0.004, 0.047, M.gold, 0, 0.0015, 0, gp); }
      else if (k === 'angled') { const w = box(0.022, 0.016, 0.085, M.body, 0, -0.022, 0.005, gp); w.rotation.x = -0.5; }
      else if (k === 'laser') { box(0.018, 0.018, 0.05, M.body, 0.024, 0.012, 0, gp); tube(0.005, 0.005, 0.012, M.steel, 0.024, 0.012, -0.03, gp);
        const b = mark(box(0.0016, 0.0016, 5, M.beam, 0.024, 0.012, -2.53, gp)); b.userData.adsHide = true; ud.laser = b; }
    }
    ud.attFit = this.stamp(gunId);
  },

  // ---------------------------------------------------------------- UI
  icon(a) {
    const P = { optic: '<circle cx="12" cy="11" r="6"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/><path d="M8 19h8M12 17v2"/>', muzzle: '<rect x="3" y="9" width="14" height="6" rx="2"/><path d="M17 12h4M7 9v6M11 9v6"/>', grip: '<path d="M4 7h16v4H4z"/><path d="M10 11l-1 9h5l-1-9"/>', stock: '<path d="M3 9h12l6 3v5h-7l-2-3H3z"/>' };
    return `<i class="sw att-ic" style="color:${BR.COS_RARITY[a.rarity]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[a.slot]}</svg></i>`;
  },
  ui: { gun: 'rifle', slot: 'optic' },
  open(gun) {
    let el = document.getElementById('attach');
    if (!el) {
      el = document.createElement('div'); el.id = 'attach'; el.className = 'overlay hidden';
      el.innerHTML = `<div class="panel metal wide att-panel"><button id="att-x" class="xbtn" aria-label="Close attachments">✕</button>
        <div class="ptitle">ATTACHMENTS</div>
        <p class="tip">Fit optics, muzzles, grips and stocks to your guns. Attachments only come from the <b>Attachment Case</b>; once you own one it fits every gun with that slot.</p>
        <div id="att-guns" class="chips"></div>
        <div id="att-slots" class="seg"></div>
        <div id="att-grid" class="att-grid"></div>
        <div class="shop-foot"><span id="att-msg"></span><button id="att-case" class="mbtn sm hot">OPEN ATTACHMENT CASE</button></div></div>`;
      (document.getElementById('app') || document.body).appendChild(el);
      el.querySelector('#att-x').addEventListener('click', () => el.classList.add('hidden'));
      el.querySelector('#att-case').addEventListener('click', () => { el.classList.add('hidden'); const inv = document.getElementById('inventory'); if (inv) inv.classList.add('hidden'); document.getElementById('btn-cases').click(); const b = document.querySelector('#cs-pick [data-c="attach"]'); if (b) b.click(); });
      el.querySelector('#att-guns').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (!b) return; this.ui.gun = b.dataset.g; BR.Audio.click(); this.render(); });
      el.querySelector('#att-slots').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; this.ui.slot = b.dataset.s; BR.Audio.click(); this.render(); });
      el.querySelector('#att-grid').addEventListener('click', e => {
        const c = e.target.closest('[data-a]'); if (!c) return; const id = c.dataset.a, U = this.ui;
        if (id && !this.owned(id)) { BR.Audio.click(); document.getElementById('att-msg').textContent = 'Locked · find it in the Attachment Case'; return; }
        const cur = this.on(U.gun)[U.slot] || '';
        this.set(U.gun, U.slot, id && id !== cur ? id : '');
        BR.Audio.pickup && BR.Audio.pickup(); if (BR.game && BR.game.refreshCosmetics) BR.game.refreshCosmetics(); this.render();
      });
    }
    if (gun && this.slots(gun).length) this.ui.gun = gun;
    el.classList.remove('hidden'); this.render();
  },
  render() {
    const U = this.ui, guns = this.guns(); if (!guns.includes(U.gun)) U.gun = guns[0];
    const slots = this.slots(U.gun); if (!slots.includes(U.slot)) U.slot = slots[0];
    const on = this.on(U.gun), W = BR.CONFIG.weapons, $ = id => document.getElementById(id);
    $('att-guns').innerHTML = guns.map(g => `<button data-g="${g}" class="${g === U.gun ? 'sel' : ''}">${W[g].name}${Object.keys(this.on(g)).length ? ' <em>' + Object.keys(this.on(g)).length + '</em>' : ''}</button>`).join('');
    $('att-slots').innerHTML = slots.map(s => `<button data-s="${s}" class="${s === U.slot ? 'sel' : ''}">${this.LABEL[s]}<small>${on[s] ? BR.ATTACH[on[s]].name : 'None'}</small></button>`).join('');
    const order = BR.COS_ORDER, list = Object.keys(BR.ATTACH).filter(id => BR.ATTACH[id].slot === U.slot && this.fits(id, U.gun)).sort((a, b) => (this.owned(b) - this.owned(a)) || (order.indexOf(BR.ATTACH[b].rarity) - order.indexOf(BR.ATTACH[a].rarity)));          // the ones you own first, then common -> legendary
    const card = id => { const a = BR.ATTACH[id], own = this.owned(id), eq = on[U.slot] === id;
      return `<button class="card att-card${eq ? ' sel eq' : ''}${own ? '' : ' locked'}" data-a="${id}" style="--r:${BR.COS_RARITY[a.rarity]}">${this.icon(a)}<span class="rar">${a.rarity}</span><span class="cn">${a.name}</span><span class="att-d">${a.desc}</span><span class="att-st">${this.lines(id).map(([t, good]) => `<b class="${good ? 'up' : 'dn'}">${t}</b>`).join('')}</span><span class="cp">${eq ? '✓ Equipped' : own ? 'Tap to equip' : '🔒 Case only'}</span></button>`; };
    $('att-grid').innerHTML = `<button class="card att-card none${on[U.slot] ? '' : ' sel'}" data-a=""><span class="cn">No ${this.LABEL[U.slot].toLowerCase()}</span><span class="att-d">Factory ${U.slot === 'optic' ? 'iron sights' : U.slot}.</span></button>` + list.map(card).join('');
    const have = Object.keys(BR.ATTACH).filter(id => this.owned(id)).length;
    $('att-msg').textContent = have + ' / ' + Object.keys(BR.ATTACH).length + ' attachments owned';
  },
};
