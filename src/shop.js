'use strict';
// =============================================================================
// PROFILE + SHOP — coins earned in matches, spent on cosmetics. Saved per
// device in localStorage. The shop shows a live 3D preview (Game.renderShop).
// =============================================================================
// ---- Ranked: RP from every match, 7 tiers with badges. Leaderboard = you + local accounts +
// a stable field of rival players.
BR.Ranks = {
  tiers: [
    { id: 'bronze', name: 'Bronze', rp: 0, c1: '#c98a55', c2: '#7a4a24', icon: '▲' },
    { id: 'silver', name: 'Silver', rp: 400, c1: '#e3e8ee', c2: '#8a96a3', icon: '▲' },
    { id: 'gold', name: 'Gold', rp: 1200, c1: '#ffe07a', c2: '#c98a00', icon: '◆' },
    { id: 'platinum', name: 'Platinum', rp: 2600, c1: '#9ff3e6', c2: '#2a9a8a', icon: '◆' },
    { id: 'diamond', name: 'Diamond', rp: 4500, c1: '#a9d4ff', c2: '#3a6bff', icon: '✦' },
    { id: 'master', name: 'Master', rp: 7000, c1: '#e6a8ff', c2: '#7a2bd8', icon: '✦' },
    { id: 'predator', name: 'Predator', rp: 10000, c1: '#ff8a8a', c2: '#c4001a', icon: '♛' },
  ],
  of(rp) { let t = 0; this.tiers.forEach((x, i) => { if (rp >= x.rp) t = i; }); return t; },
  badge(rp, big) {
    const T = this.tiers[this.of(rp)];
    return `<i class="rk rk-${T.id}${big ? ' big' : ''}" style="--r1:${T.c1};--r2:${T.c2}" title="${T.name}"><b>${T.icon}</b></i>`;
  },
  // RP for a finished match (battle royale placement + kills; duels: win/loss)
  forMatch(r) {
    if (r.duel) return r.win ? 45 : -12;
    const place = r.place || 99;
    const p = r.win ? 140 : place <= 3 ? 85 : place <= 5 ? 60 : place <= 10 ? 32 : place <= 20 ? 10 : -8;
    return p + Math.min(r.kills || 0, 10) * 14;
  },
  // Rival field: stable per device, spread from Bronze to Predator
  rivals() {
    if (this._rivals) return this._rivals;
    const R = BR.util.rng(4242), names = BR.CONFIG.botNames, tags = ['', 'TTV', 'xX', 'GG', 'YT', '_', 'Pro', 'OG'];
    const out = [];
    for (let i = 0; i < 60; i++) {
      const n = names[Math.floor(R() * names.length)], t = tags[Math.floor(R() * tags.length)];
      const name = (t === 'xX' ? 'xX' + n + 'Xx' : t ? n + (t === '_' ? '_' + Math.floor(R() * 99) : t) : n + Math.floor(R() * 999)).slice(0, 16);
      out.push({ name, rp: Math.round(14000 * Math.pow(R(), 2.2)) });
    }
    return (this._rivals = out);
  },
  board() {
    const rows = this.rivals().map(r => Object.assign({}, r));
    const me = BR.Accounts ? BR.Accounts.displayName() : 'You';
    try {   // other accounts on this device
      for (const u of Object.keys((BR.Accounts && BR.Accounts.db.users) || {})) {
        if (u === me) continue;
        const d = BR.util.load('velocity-royale.profile.u:' + u.toLowerCase(), null);
        if (d) rows.push({ name: u, rp: d.rp || 0, local: true });
      }
    } catch (e) { /* storage may be blocked */ }
    rows.push({ name: me, rp: BR.Profile.data.rp || 0, me: true });
    rows.sort((a, b) => b.rp - a.rp);
    return rows;
  },
};

// Kill feed banners: how YOUR kills look in the kill feed. Some are rank rewards (unlock by
// reaching that rank, can't be bought); some only come from cases.
BR.FEEDS = {
  none:     { name: 'Standard', price: 0 },
  neon:     { name: 'Neon Edge', price: 300, rarity: 'Epic' },
  flame:    { name: 'Hellfire', price: 450, rarity: 'Epic' },
  toxic:    { name: 'Toxic', price: 450, rarity: 'Epic' },
  royal:    { name: 'Royal Crown', price: 700, rarity: 'Legendary' },
  galaxy:   { name: 'Galaxy', price: 800, rarity: 'Legendary' },
  glitch:   { name: 'Glitch', price: 900, rarity: 'Legendary' },
  rainbow:  { name: 'Prism Wave', price: 1200, rarity: 'Mythic' },
  void:     { name: 'Void Rift', caseOnly: true, rarity: 'Epic' },
  solar:    { name: 'Solar Burst', caseOnly: true, rarity: 'Legendary' },
  exotic:   { name: 'Supreme', caseOnly: true, rarity: 'Exotic' },
  nova:     { name: 'Nova Burst', caseOnly: true, case: 'nova', rarity: 'Legendary' },
  rk_gold:     { name: 'Gold Laurel', rank: 2, rarity: 'Epic' },
  rk_diamond:  { name: 'Diamond Frost', rank: 4, rarity: 'Legendary' },
  rk_master:   { name: 'Master Flame', rank: 5, rarity: 'Mythic' },
  rk_predator: { name: 'Apex Predator', rank: 6, rarity: 'Mythic' },
};

// ---- Kill finishers: a show on the player you eliminate (src/effects.js finisher())
BR.FINISHERS = {
  none:      { name: 'None', price: 0 },
  shatter:   { name: 'Shatter', price: 600, rarity: 'Epic', c1: '#bfe8ff', c2: '#ffffff' },
  ascend:    { name: 'Ascend', price: 1000, rarity: 'Legendary', c1: '#ffe08a', c2: '#fff6d6' },
  firework:  { name: 'Grand Finale', price: 1100, rarity: 'Legendary', c1: '#ff3df2', c2: '#1de9ff' },
  voidpop:   { name: 'Void Pop', price: 1600, rarity: 'Mythic', c1: '#b04bff', c2: '#050008' },
  glitchout: { name: 'Glitch Out', caseOnly: true, case: 'nova', rarity: 'Mythic', c1: '#ff2244', c2: '#2266ff' },
  starfall:  { name: 'Starfall', caseOnly: true, case: 'nova', rarity: 'Exotic', c1: '#ffd24a', c2: '#ff5a00' },
  // v1.8.0
  sakura:        { name: 'Sakura Storm', price: 1400, rarity: 'Legendary', c1: '#ff8ac8', c2: '#ffe6f2' },
  prismburst:    { name: 'Prism Burst', price: 2000, rarity: 'Mythic', c1: '#39ff88', c2: '#ff3df2' },
  supernova:     { name: 'Supernova', price: 2400, rarity: 'Mythic', c1: '#ffd24a', c2: '#ffffff' },
  thunderstrike: { name: 'Thunderstrike', caseOnly: true, case: 'nova', rarity: 'Legendary', c1: '#6fc8ff', c2: '#ffffff' },
  dragonsoul:    { name: 'Dragon Soul', caseOnly: true, case: 'nova', rarity: 'Exotic', c1: '#ff7a00', c2: '#ffe14d' },
};
// ---- Cases: exclusive items you can only get by opening one. Rarer = flashier.
BR.CASES = {
  release: { name: 'Release Case', price: 600, odds: { Rare: 52, Epic: 28, Legendary: 13, Mythic: 6, Exotic: 1 }, dupRefund: 0.35, label: 'RELEASE', sub: 'CASE · SEASON 1' },
  // Season 2: only Legendary and up. Every drop is animated.
  nova: { name: 'Nova Case', price: 900, odds: { Legendary: 58, Mythic: 34, Exotic: 8 }, dupRefund: 0.4, label: 'NOVA', sub: 'CASE · SEASON 2' },
};
BR.CaseItems = {
  // every caseOnly item across the cosmetic tables: [{cat, id, item}]
  // all caseOnly items, or only one case's items (an item's .case, default 'release')
  all(caseId) {
    const full = this._full();
    return caseId ? full.filter(e => (e.item.case || 'release') === caseId) : full;
  },
  _full() {
    if (this._all) return this._all;
    const M = BR.Models, out = [];
    const add = (cat, table, pre) => { for (const id in table) if (table[id].caseOnly) out.push({ cat, id: pre ? pre + id : id, item: table[id] }); };
    for (const w in M.BLUEPRINTS) add('blueprints', M.BLUEPRINTS[w], w + ':');
    add('skins', M.SKINS); add('gloves', M.GLOVES); add('tracers', M.TRACERS); add('feeds', BR.FEEDS); add('finishers', BR.FINISHERS);
    return (this._all = out);
  },
  roll(caseId, R) {
    R = R || Math.random;
    const C = BR.CASES[caseId], pool = this.all(caseId);
    const tiers = Object.keys(C.odds).filter(t => pool.some(p => p.item.rarity === t));
    const total = tiers.reduce((s, t) => s + C.odds[t], 0);
    let x = R() * total, tier = tiers[0];
    for (const t of tiers) { if (x < C.odds[t]) { tier = t; break; } x -= C.odds[t]; }
    const list = pool.filter(p => p.item.rarity === tier);
    return list[Math.floor(R() * list.length)];
  },
};

BR.Profile = {
  KEY: 'velocity-royale.profile',
  data: null,
  // Loads the profile of the signed-in account (or the guest profile).
  load() {
    const C = BR.CONFIG.coins;
    this.KEY = BR.Accounts ? BR.Accounts.profileKey() : 'velocity-royale.profile';
    let d = BR.util.load(this.KEY, null);
    if (!d && this.KEY.endsWith('.guest')) d = BR.util.load('velocity-royale.profile', null); // pre-accounts save
    d = d || {};
    this.data = {
      coins: typeof d.coins === 'number' ? d.coins : C.start,
      owned: Object.assign({ skins: ['default'], tracers: ['default'], charms: ['none'], gloves: ['default'], blueprints: [], feeds: ['none'], finishers: ['none'] }, d.owned || {}),
      equip: Object.assign({ skins: 'default', tracers: 'default', charms: 'none', gloves: 'default', feeds: 'none', finishers: 'none', melee: 'bayonet' }, d.equip || {}),
      rp: typeof d.rp === 'number' ? d.rp : 0,
      cases: Object.assign({ opened: 0 }, d.cases || {}),
      stats: Object.assign({ matches: 0, wins: 0, kills: 0, deaths: 0 }, d.stats || {}),
      dev: !!d.dev,
      meleeV: d.meleeV || 0,
      // v1.11: default loadout (used where a mode hands you guns: Practice, Overdrive, Aim Trainer, Resurgence redeploys)
      loadout: Object.assign({ primary: 'rifle', secondary: 'pistol' }, d.loadout || {}),
      starter: !!d.starter,
      fresh: !d.owned,
    };
    // v1.7.5: the M9 bayonet is the new default knife (one-time switch for older saves)
    if (this.data.meleeV < 2) { this.data.equip.melee = 'bayonet'; this.data.meleeV = 2; }
    this.data.equip.blueprints = Object.assign({}, (d.equip && d.equip.blueprints) || {});
    // one tracer per gun ('signature' = the blueprint's own tracer). Old saves: their single tracer goes on every gun.
    const legacyTr = d.equip && d.equip.tracers && d.equip.tracers !== 'default' ? d.equip.tracers : null;
    this.data.equip.tracerByGun = Object.assign({}, (d.equip && d.equip.tracerByGun) || {});
    this.data.equip.glovesByGun = Object.assign({}, (d.equip && d.equip.glovesByGun) || {});   // gloves per weapon ('all' = equip.gloves)
    // camos per weapon. Old saves had one camo for everything: keep that look by copying it onto every gun
    this.data.equip.skinByGun = Object.assign({}, (d.equip && d.equip.skinByGun) || {});
    if (!(d.equip && d.equip.skinByGun) && this.data.equip.skins && this.data.equip.skins !== 'default') for (const [w] of SHOP_WEAPONS) this.data.equip.skinByGun[w] = this.data.equip.skins;
    if (legacyTr && !(d.equip && d.equip.tracerByGun)) for (const [w] of SHOP_WEAPONS) this.data.equip.tracerByGun[w] = legacyTr;
    if (!this.data.owned.tracers.includes('signature')) this.data.owned.tracers.push('signature');
    for (const k of ['gloves', 'blueprints']) if (!this.data.owned[k]) this.data.owned[k] = k === 'gloves' ? ['default'] : [];
    if (!this.data.owned.finishers) this.data.owned.finishers = ['none'];
    if (!this.data.equip.finishers) this.data.equip.finishers = 'none';
    if (!this.data.owned.feeds) this.data.owned.feeds = ['none'];
    // v1.11: new accounts start with a Recruit kit equipped (rifle camo + tracer) on top of the default loadout
    if (this.data.fresh && !this.data.starter) {
      const o = this.data.owned, e = this.data.equip;
      for (const [k, id] of [['skins', 'carbon'], ['tracers', 'cyan']]) if (!o[k].includes(id)) o[k].push(id);
      e.skinByGun.rifle = 'carbon'; e.tracerByGun.rifle = 'cyan';
      this.data.starter = true;
    }
    delete this.data.fresh;
    this.unlockRankRewards();
    // Dev accounts: infinite coins and everything unlocked (including items added later)
    if (BR.Accounts && BR.Accounts.isSeededDev()) this.data.dev = true;
    if (this.data.dev) this.grantAll();
    // the built-in dev account sits at #1 on the leaderboard (Predator)
    if (BR.Accounts && BR.Accounts.isSeededDev()) {
      const top = Math.max(...BR.Ranks.rivals().map(r => r.rp));
      this.data.rp = Math.max(this.data.rp || 0, top + 2500);
      this.unlockRankRewards();
    }
    return this.data;
  },
  // Rank rewards unlock themselves when you reach the rank
  unlockRankRewards() {
    const t = BR.Ranks.of(this.data.rp || 0), o = this.data.owned.feeds, got = [];
    for (const id in BR.FEEDS) if (BR.FEEDS[id].rank !== undefined && t >= BR.FEEDS[id].rank && !o.includes(id)) { o.push(id); got.push(BR.FEEDS[id].name); }
    return got;
  },
  grantAll() {
    const M = BR.Models, o = this.data.owned;
    const add = (cat, ids) => { for (const id of ids) if (!o[cat].includes(id)) o[cat].push(id); };
    add('skins', Object.keys(M.SKINS)); add('tracers', Object.keys(M.TRACERS));
    add('charms', Object.keys(M.CHARMS)); add('gloves', Object.keys(M.GLOVES)); add('feeds', Object.keys(BR.FEEDS));
    for (const w in M.BLUEPRINTS) add('blueprints', Object.keys(M.BLUEPRINTS[w]).map(b => w + ':' + b));
  },
  save() { BR.util.save(this.KEY, this.data); },
  // Blueprint ids are "weapon:blueprint" (e.g. "rifle:vandal"); every weapon owns "default".
  owns(cat, id) {
    if (cat === 'blueprints' && id.endsWith(':default')) return true;
    return this.data.owned[cat].includes(id);
  },
  isEquipped(cat, id, weapon) {
    if (cat === 'blueprints') { const [w, b] = id.split(':'); return (this.data.equip.blueprints[w] || 'default') === b && (!BR.MELEE[w] || (this.data.equip.melee || 'bayonet') === w); }
    if (cat === 'tracers') return (this.data.equip.tracerByGun[weapon || 'rifle'] || 'signature') === id;
    if (cat === 'gloves') return this.gloveFor(weapon) === id;
    if (cat === 'skins') return weapon === 'all' ? Object.keys(BR.CONFIG.weapons).every(w => this.skinFor(w) === id) : this.skinFor(weapon || 'rifle') === id;
    return this.data.equip[cat] === id;
  },
  infinite() { return !!this.data.dev; },
  // the guns + knife you start with where a mode arms you (v1.11)
  loadoutGuns() { const L = this.data.loadout || {}, W = BR.CONFIG.weapons; return { primary: W[L.primary] ? L.primary : 'rifle', secondary: W[L.secondary] ? L.secondary : 'pistol', melee: this.data.equip.melee || 'bayonet' }; },
  coinsLabel() { return this.infinite() ? '∞' : String(this.data.coins); },
  canAfford(price) { return this.infinite() || this.data.coins >= price; },
  buy(cat, id, weapon) {
    const item = BR.Shop.item(cat, id);
    if (!item || this.owns(cat, id) || !this.canAfford(item.price)) return false;
    if (!this.infinite()) this.data.coins -= item.price;
    this.data.owned[cat].push(id);
    this.setEquip(cat, id, weapon);
    this.save();
    return true;
  },
  equip(cat, id, weapon) { if (!this.owns(cat, id)) return false; this.setEquip(cat, id, weapon); this.save(); return true; },
  setEquip(cat, id, weapon) {
    if (cat === 'blueprints') { const [w, b] = id.split(':'); this.data.equip.blueprints[w] = b; if (BR.MELEE[w]) this.data.equip.melee = w; }   // equipping a knife skin makes it your knife
    else if (cat === 'tracers') this.data.equip.tracerByGun[weapon || 'rifle'] = id;
    else if (cat === 'skins' && weapon && weapon !== 'all') this.data.equip.skinByGun[weapon] = id;          // camo on this gun only
    else if (cat === 'skins') { for (const w in BR.CONFIG.weapons) this.data.equip.skinByGun[w] = id; }       // ALL: every gun
    else if (cat === 'gloves' && weapon && weapon !== 'all') this.data.equip.glovesByGun[weapon] = id;
    else if (cat === 'gloves') { this.data.equip.gloves = id; this.data.equip.glovesByGun = {}; }      // ALL: one pair everywhere
    else this.data.equip[cat] = id;
  },
  // K/D ratio (kills per death; with no deaths yet it's just your kills)
  kd() { const st = this.data.stats || {}; return (st.kills || 0) / Math.max(1, st.deaths || 0); },
  // ---- Weapon mastery: kills per weapon; camos unlock at 10 / 25 / 50 / 100 kills with any one gun
  addKill(weapon) {
    const d = this.data; d.mastery = d.mastery || {};
    if (!weapon || !BR.CONFIG.weapons[weapon]) return [];
    d.mastery[weapon] = (d.mastery[weapon] || 0) + 1;
    const got = [], best = Math.max(...Object.values(d.mastery));
    for (const id in BR.Models.SKINS) { const it = BR.Models.SKINS[id]; if (it.mastery && best >= it.mastery && !this.owns('skins', id)) { d.owned.skins.push(id); got.push(it.name); } }
    this.save();
    return got;
  },
  // ---- v1.10 GRIND: challenge stats that unlock the grind camos + blueprints (item.grind = { stat, n, label })
  //   kills / heads / knife / zkills / w:<gun> / wh:<gun> (headshot kills) / wins / zround (best) /
  //   odtime (best s) / odwin / odkill / aimtotal / meta (grind camos owned)
  grind() { return this.data.grind || (this.data.grind = {}); },
  grindItems() {
    const M = BR.Models, out = [];
    for (const id in M.SKINS) if (M.SKINS[id].grind) out.push({ cat: 'skins', id, item: M.SKINS[id] });
    for (const w in M.BLUEPRINTS) for (const b in M.BLUEPRINTS[w]) if (M.BLUEPRINTS[w][b].grind) out.push({ cat: 'blueprints', id: w + ':' + b, item: M.BLUEPRINTS[w][b] });
    return out;
  },
  grindProgress(item) { const G = this.grind(), g = item.grind; return [Math.min(g.n, Math.floor(G[g.stat] || 0)), g.n]; },
  addGrind(kind, v, x) {
    const G = this.grind(); v = v || 1;
    const inc = k => { G[k] = (G[k] || 0) + v; };
    if (kind === 'kill') {
      inc('kills');
      if (x && x.head) inc('heads');
      if (x && x.melee) inc('knife');
      if (x && x.zombie) inc('zkills');
      if (x && x.w) { inc('w:' + x.w); if (x.head) inc('wh:' + x.w); }
    } else if (kind === 'zround' || kind === 'odtime') G[kind] = Math.max(G[kind] || 0, v);
    else if (kind === 'win' || kind === 'odwin' || kind === 'odkill') inc(kind === 'win' ? 'wins' : kind);
    else if (kind === 'aim') G.aimtotal = (G.aimtotal || 0) + v;
    const got = this.checkGrind();
    if (kind !== 'odkill' || got.length) this.save();
    if (got.length && BR.game && BR.game.hud) {
      setTimeout(() => { BR.game.hud.toast('UNLOCKED · ' + got.join(', ') + ' · equip it in the inventory', 3200); BR.Audio.coin(); }, 600);
    }
    return got;
  },
  checkGrind() {
    const G = this.grind(), got = [], o = this.data.owned;
    G.meta = this.grindItems().filter(e => e.cat === 'skins' && e.item.grind.stat !== 'meta' && this.owns('skins', e.id)).length;
    for (let pass = 0; pass < 2; pass++) for (const e of this.grindItems()) {
      if (this.owns(e.cat, e.id) || (G[e.item.grind.stat] || 0) < e.item.grind.n) continue;
      o[e.cat].push(e.id); got.push(e.item.name);
      G.meta = this.grindItems().filter(q => q.cat === 'skins' && q.item.grind.stat !== 'meta' && this.owns('skins', q.id)).length;
    }
    return got;
  },
  // ---- Daily reward: log in on consecutive days to grow the streak; every 3rd day adds a Nova Case key
  claimDaily(today) {
    const d = this.data; today = today || new Date().toISOString().slice(0, 10);
    d.daily = d.daily || { last: null, streak: 0 }; d.keys = d.keys || {};
    if (d.daily.last === today) return null;
    const y = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
    d.daily.streak = d.daily.last === y ? d.daily.streak + 1 : 1; d.daily.last = today;
    const coins = 100 + 50 * Math.min(d.daily.streak - 1, 6), key = d.daily.streak % 3 === 0;
    if (!this.infinite()) d.coins += coins;
    if (key) d.keys.nova = (d.keys.nova || 0) + 1;
    this.save();
    return { streak: d.daily.streak, coins, key };
  },
  keys(caseId) { return (this.data.keys && this.data.keys[caseId]) || 0; },
  // gloves worn with a weapon (per-weapon pick, else the default pair)
  skinFor(weapon) { const e = this.data.equip; return (e.skinByGun && e.skinByGun[weapon]) || 'default'; },
  gloveFor(weapon) { const e = this.data.equip; return (weapon && weapon !== 'all' && e.glovesByGun && e.glovesByGun[weapon]) || e.gloves || 'default'; },
  // Open a case: pay, roll, add (or refund a duplicate). Returns the result or null if broke.
  openCase(caseId) {
    const C = BR.CASES[caseId];
    if (this.keys(caseId) > 0) this.data.keys[caseId]--;                 // a free key opens it
    else { if (!this.canAfford(C.price)) return null; if (!this.infinite()) this.data.coins -= C.price; }
    const r = BR.CaseItems.roll(caseId);
    const dup = this.owns(r.cat, r.id);
    let refund = 0;
    if (dup) { refund = Math.round(C.price * C.dupRefund); if (!this.infinite()) this.data.coins += refund; }
    else this.data.owned[r.cat].push(r.id);
    this.data.cases.opened = (this.data.cases.opened || 0) + 1;
    this.save();
    return Object.assign({ dup, refund }, r);
  },
  // Equip a case drop where it makes sense (tracers go on every gun)
  equipDrop(r) {
    if (r.cat === 'tracers') { for (const [w] of SHOP_WEAPONS) this.data.equip.tracerByGun[w] = r.id; }
    else this.setEquip(r.cat, r.id, r.cat === 'skins' ? ((BR.shopWeapon && BR.shopWeapon()) || 'rifle') : undefined);
    this.save();
  },

  // Coins for a finished match. Returns the breakdown so the end screen can show it.
  award(r) {
    const C = BR.CONFIG.coins;
    if (r.arena) {          // arena modes (duels, TDM, FFA): coins for kills + the win, no Ranked RP
      const parts = [['Kills ×' + r.kills, r.kills * 15]];
      if (r.win) parts.push([r.ffa ? 'Won the lobby' : 'Victory', r.online ? 200 : 120]);
      else if (r.ffa && r.rank <= 3) parts.push(['Top 3', 50]);
      const total = parts.reduce((s, p) => s + p[1], 0);
      this.data.coins += total; this.data.stats.kills += r.kills; this.save();
      return { total, parts, unlocked: [] };
    }
    if (r.overdrive) {      // Overdrive: coins for time survived, kills, bosses and the win (no Ranked RP)
      const parts = [['Survived ' + BR.fmtTime(r.time), Math.floor(r.time / 10) * 5], ['Kills ×' + r.kills, Math.floor(r.kills * 0.5)]];
      if (r.bosses) parts.push(['Bosses ×' + r.bosses, r.bosses * 150]);
      if (r.win) parts.push(['Overlord destroyed', 600]);
      const total = parts.reduce((s, p) => s + p[1], 0);
      this.data.coins += total; this.data.stats.odBest = Math.max(this.data.stats.odBest || 0, r.time);
      this.save();
      return { total, parts, unlocked: [] };
    }
    if (r.zombies) this.addGrind('zround', r.round);
    else if (r.win && !r.duel) this.addGrind('win', 1);
    if (r.zombies) {        // zombies: coins for rounds survived, kills and bosses (no Ranked RP)
      const parts = [['Rounds ×' + Math.max(0, r.round - 1), Math.max(0, r.round - 1) * 20], ['Zombies ×' + r.kills, Math.floor(r.kills * 2)]];
      if (r.bosses) parts.push(['Bosses ×' + r.bosses, r.bosses * 250]);
      const total = parts.reduce((s, p) => s + p[1], 0);
      this.data.coins += total; this.data.stats.zmBest = Math.max(this.data.stats.zmBest || 0, r.round); this.data.stats.zmKills = (this.data.stats.zmKills || 0) + r.kills;
      this.save();
      return { total, parts, unlocked: [] };
    }
    const parts = [];
    if (r.kills) parts.push(['Kills ×' + r.kills, r.kills * C.perKill]);
    if (r.damage > 0) parts.push(['Damage', Math.floor(r.damage * C.perDamage)]);
    if (r.win) parts.push(['Victory', C.win]);
    else if (r.place <= 5) parts.push(['Top 5', C.top5]);
    else if (r.place <= 10) parts.push(['Top 10', C.top10]);
    const total = parts.reduce((s, p) => s + p[1], 0);
    this.data.coins += total;
    this.data.stats.matches++;
    const rp = BR.Ranks.forMatch(r), before = BR.Ranks.of(this.data.rp || 0);
    this.data.rp = Math.max(0, (this.data.rp || 0) + rp);
    const after = BR.Ranks.of(this.data.rp), unlocked = this.unlockRankRewards();
    this.data.stats.kills += r.kills;
    if (r.win) this.data.stats.wins++;
    else this.data.stats.deaths = (this.data.stats.deaths || 0) + 1;     // one life: a match you didn't win ended in a death
    this.save();
    return { total, parts, rp, rankUp: after > before ? BR.Ranks.tiers[after].name : null, unlocked };
  },
};

BR.MELEE = { bayonet: true, knife: true, butterfly: true };
const SHOP_WEAPONS = [['rifle', 'Rifle'], ['holoar', 'Holo AR'], ['smg', 'SMG'], ['shotgun', 'Breacher'], ['sniper', 'Sniper'], ['hunter', 'Hunting Rifle'], ['revolver', 'Revolver'], ['lmg', 'LMG'], ['dmr', 'DMR'], ['pistol', 'Pistol'], ['bayonet', 'M9 Bayonet'], ['knife', 'Karambit'], ['butterfly', 'Butterfly']];
const RARITY = { Base: '#8d97a5', Rare: '#4b8bff', Epic: '#b26bff', Legendary: '#ffb224', Mythic: '#ff3df2', Exotic: '#ff3b30' };

BR.Shop = class Shop {
  // Catalog for a category. Blueprints are per weapon; ids look like "rifle:vandal".
  static catalog(cat, weapon) {
    const M = BR.Models;
    if (cat === 'blueprints') {
      const out = {}, bps = M.BLUEPRINTS[weapon] || {};
      for (const b in bps) out[weapon + ':' + b] = bps[b];
      return out;
    }
    if (cat === 'feeds') return BR.FEEDS;
    if (cat === 'finishers') { const out = {}; for (const k in BR.FINISHERS) if (!BR.FINISHERS[k].caseOnly || BR.Profile.owns(cat, k)) out[k] = BR.FINISHERS[k]; return out; }
    const all = cat === 'skins' ? M.SKINS : cat === 'tracers' ? M.TRACERS : cat === 'gloves' ? M.GLOVES : M.CHARMS;
    // case-exclusive items live in the same tables but aren't sold
    const out = {}; for (const k in all) if (!all[k].caseOnly || BR.Profile.owns(cat, k)) out[k] = all[k];
    return out;
  }
  static item(cat, id) {
    const M = BR.Models;
    if (cat === 'blueprints') { const [w, b] = id.split(':'); return M.BLUEPRINTS[w] && M.BLUEPRINTS[w][b]; }
    if (cat === 'feeds') return BR.FEEDS[id];
    if (cat === 'finishers') return BR.FINISHERS[id];
    return (cat === 'skins' ? M.SKINS : cat === 'tracers' ? M.TRACERS : cat === 'gloves' ? M.GLOVES : M.CHARMS)[id];
  }

  constructor(game) {
    this.game = game;
    this.cat = 'blueprints';
    this.weapon = 'rifle';
    this.sel = null;
    const $ = id => document.getElementById(id);
    this.el = { root: $('shop'), grid: $('shop-grid'), coins: $('shop-coins'), name: $('shop-sel-name'), action: $('shop-action'), msg: $('shop-msg'), weps: $('shop-weps') };
    this.el.weps.innerHTML = '<button data-w="all" class="w-all">ALL</button>' + SHOP_WEAPONS.map(([id, n]) => `<button data-w="${id}">${n}</button>`).join('');
    $('shop-tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      this.cat = b.dataset.cat;
      this.sel = this.equippedId();
      this.render();
    });
    this.el.weps.addEventListener('click', e => {
      const b = e.target.closest('button[data-w]');
      if (!b) return;
      this.weapon = b.dataset.w;
      this.sel = this.equippedId();
      this.render();
    });
    this.el.grid.addEventListener('click', e => {
      const c = e.target.closest('[data-id]');
      if (!c) return;
      this.sel = c.dataset.id;
      this.render();
    });
    this.el.action.addEventListener('click', () => this.act());
    $('shop-back').addEventListener('click', () => this.close());
  }

  equippedId() {
    const eq = BR.Profile.data.equip;
    if (this.cat === 'blueprints') return this.weapon + ':' + (eq.blueprints[this.weapon] || 'default');
    if (this.cat === 'tracers') return eq.tracerByGun[this.weapon] || 'signature';
    return eq[this.cat];
  }

  open() {
    this.sel = this.equippedId();
    this.el.root.classList.remove('hidden');
    document.body.classList.add('shopping');
    this.game.openShop();
    this.render();
  }

  close() {
    this.el.root.classList.add('hidden');
    document.body.classList.remove('shopping');
    this.game.closeShop();
    BR.updateCoins();
  }

  act() {
    const P = BR.Profile, id = this.sel, cat = this.cat;
    if (!id) return;
    if (P.owns(cat, id)) { P.equip(cat, id, this.weapon); BR.Audio.pickup(); if (cat === 'tracers' || cat === 'skins') this.flash('Equipped on ' + (this.weapon === 'all' ? 'every gun' : BR.CONFIG.weapons[this.weapon].name)); }
    else if (P.buy(cat, id, this.weapon)) { BR.Audio.kill(); this.flash('Unlocked!'); }
    else { BR.Audio.click(); this.flash('Not enough coins'); }
    this.game.refreshCosmetics();
    this.render();
  }

  flash(t) {
    this.el.msg.textContent = t;
    this.el.msg.classList.remove('on'); void this.el.msg.offsetWidth; this.el.msg.classList.add('on');
  }

  swatch(cat, id, it) {
    const hex = c => '#' + c.toString(16).padStart(6, '0');
    if (cat === 'blueprints') {
      if (!it.body) return `<i class="sw bp" style="--a:#5a6270;--b:#2a2f37;--g:#8d97a5"></i>`;
      return `<i class="sw bp" style="--a:${hex(it.body)};--b:${hex(it.accent)};--g:${hex(it.glow)}"></i>`;
    }
    if (cat === 'skins') return `<i class="sw" style="background:${it.swatch}"></i>`;
    if (cat === 'finishers') return it.c1 ? `<i class="sw fin" style="background:radial-gradient(circle at 50% 60%,${it.c2} 0 12%,${it.c1} 30%,transparent 62%),#0b0d12"></i>` : `<i class="sw" style="background:#2a2f37"></i>`;
    if (cat === 'tracers' && it.signature) {
      const sig = BR.Models.resolveTracer(this.weapon, Object.assign({}, BR.Profile.data.equip, { tracerByGun: { [this.weapon]: 'signature' } }));
      it = Object.assign({}, it, { color: sig.color, color2: sig.color2 });
    }
    if (cat === 'tracers') {
      const rb = 'linear-gradient(90deg,#ff1f3d,#ffcc00,#39ff14,#00e5ff,#b026ff)';
      const c = it.color < 0 ? rb : it.color2 !== undefined ? `linear-gradient(90deg,${hex(it.color)},${hex(it.color2)},${hex(it.color)})` : hex(it.color);
      return `<i class="sw tr" style="background:${c};--c:${it.color < 0 ? '#fff' : hex(it.color)}"></i>`;
    }
    if (cat === 'gloves') {
      const GS = { c_jungle: '#2f4a1c', c_holo: 'linear-gradient(90deg,#7af7ff,#c8a2ff,#ff9ef0)', c_nebula: 'radial-gradient(circle,#ff6af0,#7b2cff,#05020f)', c_inferno: 'linear-gradient(0deg,#ffe14d,#ff7a00,#c4001a)', c_aurora: 'linear-gradient(170deg,#020a14,#00ffa6,#9b5cff)', c_gold: 'radial-gradient(circle,#fff3b0,#ffcf40,#b8860b)', hyper: '#ff2fa8', scales: '#1fa37a', bloodmoon: '#a3001a', circuit: '#0b3a2a', molten: '#ff5a00', electric: '#1a3a8a', prism: 'linear-gradient(135deg,#ff3df2,#ffd84a,#1de9ff)', arctic: '#dfe6eb', carbon: '#22252a', tiger: '#e07a1f', neon: '#0c2a30', galaxy: '#3b1a7a' };
      const bg = it.color !== undefined ? hex(it.color) : GS[id] || '#666';
      return `<i class="sw gl" style="--c:${bg};background:${bg};${it.glow ? 'box-shadow:0 0 10px ' + hex(it.glow) : ''}">✋</i>`;
    }
    if (cat === 'feeds') return `<i class="sw fd"><span class="kf feed-${id}">${BR.Ranks.badge(BR.Profile.data.rp || 0)}<b class="me">You</b><i>✕</i></span></i>`;
    return `<i class="sw ch">${id === 'none' ? '—' : '◆'}</i>`;
  }

  render() {
    const P = BR.Profile, cat = this.cat, items = Shop.catalog(cat, this.weapon);
    document.querySelectorAll('#shop-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.cat === cat));
    const showWeps = cat === 'blueprints' || cat === 'skins' || cat === 'tracers' || cat === 'gloves';
    this.el.weps.classList.toggle('hidden', !showWeps);
    this.el.weps.classList.toggle('gl', cat === 'gloves' || cat === 'skins');
    if (cat !== 'gloves' && cat !== 'skins' && this.weapon === 'all') this.weapon = 'rifle';
    this.el.weps.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.w === this.weapon));
    this.el.coins.textContent = P.coinsLabel();
    const html = [];
    for (const id in items) {
      const it = items[id], own = P.owns(cat, id), eq = P.isEquipped(cat, id, this.weapon);
      const rar = it.rarity ? `<span class="rar" style="--r:${RARITY[it.rarity] || '#8d97a5'}">${it.rarity}</span>` : '';
      html.push(`<button class="card${this.sel === id ? ' sel' : ''}${eq ? ' eq' : ''}${it.rarity === 'Legendary' ? ' legend' : it.rarity === 'Mythic' ? ' mythic' : it.rarity === 'Exotic' ? ' exotic' : ''}" data-id="${id}">${this.swatch(cat, id, it)}${rar}<span class="cn">${it.name}</span><span class="cp">${eq ? 'Equipped' : own ? 'Owned' : it.mastery ? 'Mastery · ' + it.mastery + ' kills' : it.grind ? '🔒 ' + P.grindProgress(it).map(n => n.toLocaleString()).join(' / ') : it.rank !== undefined ? 'Reach ' + BR.Ranks.tiers[it.rank].name : it.caseOnly ? 'Case only' : '<i class="coin"></i>' + it.price}</span></button>`);
    }
    this.el.grid.innerHTML = html.join('');
    const it = items[this.sel];
    this.el.name.textContent = it ? it.name : '';
    const own = it && P.owns(cat, this.sel), eq = it && P.isEquipped(cat, this.sel, this.weapon);
    const locked = it && !own && (it.rank !== undefined || it.caseOnly || it.mastery || it.grind);
    this.el.action.textContent = !it ? '' : eq ? 'Equipped' : own ? 'Equip' : it.mastery ? it.mastery + ' kills with one gun' : it.grind ? 'GRIND · ' + it.grind.label + ' (' + P.grindProgress(it).map(n => n.toLocaleString()).join(' / ') + ')' : it.rank !== undefined ? 'Reach ' + BR.Ranks.tiers[it.rank].name : it.caseOnly ? 'Case only' : 'Buy · ' + it.price;
    this.el.action.disabled = !it || eq || locked;
    this.el.action.classList.toggle('poor', !!it && !own && !P.canAfford(it.price));
    // Preview: the equipped look, with the selected item swapped in
    const eqd = P.data.equip;
    const wpn = showWeps ? (this.weapon === 'all' ? 'pistol' : this.weapon) : 'holoar';
    this.game.setShopPreview({
      weapon: wpn,
      bp: cat === 'blueprints' ? this.sel.split(':')[1] : (eqd.blueprints[wpn] || 'default'),
      skin: cat === 'skins' ? this.sel : P.skinFor(wpn),
      charm: cat === 'charms' ? this.sel : eqd.charms,
      tracer: cat === 'tracers' ? (this.sel === 'signature' ? BR.Models.resolveTracer(wpn, eqd) : this.sel) : BR.Models.resolveTracer(wpn, eqd),
      gloves: cat === 'gloves' ? this.sel : P.gloveFor(wpn),
      showTracer: cat === 'tracers',
      showHands: cat === 'gloves',
    });
  }
};


// =============================================================================
// INVENTORY — everything you own (shop buys + case drops). Pick an item to see it
// on the big 3D preview, drag to turn it any way you like (pinch / scroll zooms,
// double-tap resets), and equip it. Tracers equip on the gun chip you picked.
// =============================================================================
BR.Inventory = class Inventory {
  constructor(game, shop) {
    this.game = game; this.shop = shop;
    this.cat = 'blueprints'; this.weapon = 'rifle'; this.sel = null;
    const $ = id => document.getElementById(id);
    this.el = { root: $('inventory'), grid: $('inv-grid'), weps: $('inv-weps'), action: $('inv-action'), msg: $('inv-msg'), count: $('inv-count'),
      name: $('inv-name'), rar: $('inv-rar'), sub: $('inv-sub'), feed: $('inv-feed'), stage: $('inv-stage') };
    this.el.weps.innerHTML = '<button data-w="all" class="w-all">ALL</button>' + SHOP_WEAPONS.map(([id, n]) => `<button data-w="${id}">${n}</button>`).join('');
    $('inv-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-cat]'); if (!b) return; this.cat = b.dataset.cat; this.sel = null; this.render(); });
    this.el.weps.addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (!b) return; this.weapon = b.dataset.w; this.sel = null; this.render(); });
    this.el.grid.addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (!c) return; this.sel = c.dataset.id; this.game.inspectReset(); this.render(); });
    // Melee: carry the bayonet, the karambit or the butterfly knife (one at a time)
    $('inv-melee').addEventListener('click', e => {
      const b = e.target.closest('button[data-m]'); if (!b) return;
      const P = BR.Profile; P.data.equip.melee = b.dataset.m; P.save(); BR.Audio.pickup();
      this.cat = 'blueprints'; this.weapon = b.dataset.m; this.sel = null;
      this.flash(({ butterfly: 'Butterfly knife', knife: 'Karambit', bayonet: 'M9 Bayonet' })[b.dataset.m] + ' equipped');
      this.game.refreshCosmetics(); this.render();
    });
    this.el.action.addEventListener('click', () => this.act());
    $('inv-back').addEventListener('click', () => this.close());
    this.bindDrag();
  }

  // Drag / pinch / wheel on the preview area turns and zooms the item
  bindDrag() {
    const st = this.el.stage, I = () => this.game.inspect, pts = new Map();
    let lastTap = 0, pinch0 = 0, zoom0 = 1;
    st.addEventListener('pointerdown', e => {
      st.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const i = I(); i.dragging = true; i.vy = i.vx = 0; i.idle = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = i.zoom; }
      const now = performance.now(); if (pts.size === 1 && now - lastTap < 300) this.game.inspectReset(); lastTap = now;
    });
    st.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const i = I(), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) i.zoom = BR.util.clamp(zoom0 * d / pinch0, 0.6, 2.6); return; }
      i.yaw += dx * 0.012; i.pitch = BR.util.clamp(i.pitch + dy * 0.01, -1.3, 1.3);
      i.vy = dx * 0.012 / 0.016; i.vx = dy * 0.01 / 0.016;
    });
    const up = e => { pts.delete(e.pointerId); if (!pts.size) I().dragging = false; pinch0 = 0; };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('wheel', e => { e.preventDefault(); const i = I(); i.zoom = BR.util.clamp(i.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.6, 2.6); }, { passive: false });
  }

  items() {
    const P = BR.Profile, all = BR.Shop.catalog(this.cat, this.weapon), out = {};
    for (const id in all) if (P.owns(this.cat, id)) out[id] = all[id];
    return out;
  }
  // everything that can be collected (shop + case + mastery + rank rewards), for the progress counter
  collectible() {
    if (this._coll) return this._coll;
    const M = BR.Models; let n = 0;
    for (const t of [M.SKINS, M.TRACERS, M.CHARMS, M.GLOVES, BR.FEEDS, BR.FINISHERS]) n += Object.keys(t).filter(k => k !== 'default' && k !== 'none' && k !== 'signature').length;
    for (const w in M.BLUEPRINTS) n += Object.keys(M.BLUEPRINTS[w]).filter(k => k !== 'default').length;
    return (this._coll = n);
  }
  total() {
    const o = BR.Profile.data.owned; let n = 0;
    for (const k of ['skins', 'tracers', 'charms', 'gloves', 'feeds', 'finishers']) n += (o[k] || []).filter(x => x !== 'default' && x !== 'none' && x !== 'signature').length;
    return n + (o.blueprints || []).length;
  }
  open(focus) {
    if (focus) { this.cat = focus.cat; if (focus.cat === 'blueprints') this.weapon = focus.id.split(':')[0]; this.sel = focus.id; }
    this.el.root.classList.remove('hidden');
    document.body.classList.add('shopping');
    this.game.openShop();
    this.game.inspect.on = true; this.game.inspectReset();
    this.render();
  }
  close() {
    this.el.root.classList.add('hidden');
    document.body.classList.remove('shopping');
    this.game.inspect.on = false;
    this.game.closeShop();
    BR.updateCoins();
    if (this.onClose) { const f = this.onClose; this.onClose = null; f(); }      // opened mid-match from the locker
  }
  equippedId() {
    const eq = BR.Profile.data.equip;
    if (this.cat === 'blueprints') return this.weapon + ':' + (eq.blueprints[this.weapon] || 'default');
    if (this.cat === 'tracers') return eq.tracerByGun[this.weapon] || 'signature';
    return eq[this.cat];
  }
  act() {
    const P = BR.Profile, id = this.sel;
    if (!id || !P.owns(this.cat, id)) return;
    P.equip(this.cat, id, this.weapon); BR.Audio.pickup();
    this.flash(this.cat === 'tracers' || this.cat === 'skins' ? 'Equipped on ' + (this.weapon === 'all' ? 'every gun' : BR.CONFIG.weapons[this.weapon].name) : 'Equipped');
    this.game.refreshCosmetics();
    this.render();
  }
  flash(t) { const m = this.el.msg; m.textContent = t; m.classList.remove('on'); void m.offsetWidth; m.classList.add('on'); }

  render() {
    const P = BR.Profile, cat = this.cat, items = this.items();
    document.querySelectorAll('#inv-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.cat === cat));
    const showWeps = cat === 'blueprints' || cat === 'skins' || cat === 'tracers' || cat === 'gloves';
    this.el.weps.classList.toggle('hidden', !showWeps);
    this.el.weps.classList.toggle('gl', cat === 'gloves' || cat === 'skins');
    if (cat !== 'gloves' && cat !== 'skins' && this.weapon === 'all') this.weapon = 'rifle';
    this.el.weps.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.w === this.weapon));
    this.el.count.textContent = this.total() + ' / ' + this.collectible();
    const mel = P.data.equip.melee || 'bayonet';
    document.querySelectorAll('#inv-melee button').forEach(b => b.classList.toggle('sel', b.dataset.m === mel));
    document.getElementById('inv-melee').classList.toggle('hidden', cat !== 'blueprints');
    if (!this.sel || !items[this.sel]) this.sel = items[this.equippedId()] ? this.equippedId() : Object.keys(items)[0] || null;
    const html = [];
    for (const id in items) {
      const it = items[id], eq = P.isEquipped(cat, id, this.weapon);
      const rar = it.rarity ? `<span class="rar" style="--r:${RARITY[it.rarity] || '#8d97a5'}">${it.rarity}</span>` : '';
      const cls = it.rarity === 'Legendary' ? ' legend' : it.rarity === 'Mythic' ? ' mythic' : it.rarity === 'Exotic' ? ' exotic' : '';
      this.shop.weapon = this.weapon;
      html.push(`<button class="card${this.sel === id ? ' sel' : ''}${eq ? ' eq' : ''}${cls}" data-id="${id}">${this.shop.swatch(cat, id, it)}${rar}<span class="cn">${it.name}</span><span class="cp">${eq ? '✓ Equipped' : it.caseOnly ? 'Case drop' : 'Owned'}</span></button>`);
    }
    this.el.grid.innerHTML = html.length ? html.join('') : '<div class="inv-empty">Nothing here yet. Buy items in the Shop or open a Release Case.</div>';
    const it = items[this.sel];
    this.el.name.textContent = it ? it.name : '';
    this.el.rar.textContent = it && it.rarity ? it.rarity.toUpperCase() : '';
    this.el.rar.style.color = it && it.rarity ? RARITY[it.rarity] : '';
    this.el.sub.textContent = !it ? '' : cat === 'blueprints' ? BR.CONFIG.weapons[this.weapon].name + ' blueprint' : cat === 'skins' ? 'Camo · on ' + (this.weapon === 'all' ? 'every gun' : BR.CONFIG.weapons[this.weapon].name) : cat === 'tracers' ? 'Tracer · ' + BR.CONFIG.weapons[this.weapon].name : cat === 'gloves' ? 'Gloves' : cat === 'charms' ? 'Charm' : 'Kill feed banner';
    const eq = it && P.isEquipped(cat, this.sel, this.weapon);
    this.el.action.textContent = !it ? '' : eq ? 'Equipped' : 'Equip';
    this.el.action.disabled = !it || eq;
    // kill feed banners show as a big banner instead of a gun
    this.el.feed.classList.toggle('hidden', cat !== 'feeds');
    if (cat === 'feeds' && it) this.el.feed.innerHTML = `<div class="kf feed-${this.sel}">${BR.Ranks.badge(P.data.rp || 0)}<b class="me">${BR.Accounts ? BR.Accounts.displayName() : 'You'}</b> <i>Rifle ✕</i> <b>Rival</b></div>`;
    const eqd = P.data.equip, wpn = showWeps ? (this.weapon === 'all' ? 'pistol' : this.weapon) : 'holoar';
    this.game.setShopPreview({
      weapon: wpn,
      bp: cat === 'blueprints' && this.sel ? this.sel.split(':')[1] : (eqd.blueprints[wpn] || 'default'),
      skin: cat === 'skins' && this.sel ? this.sel : P.skinFor(wpn),
      charm: cat === 'charms' && this.sel ? this.sel : eqd.charms,
      tracer: cat === 'tracers' && this.sel ? (this.sel === 'signature' ? BR.Models.resolveTracer(wpn, eqd) : this.sel) : BR.Models.resolveTracer(wpn, eqd),
      gloves: cat === 'gloves' && this.sel ? this.sel : P.gloveFor(wpn),
      showTracer: cat === 'tracers', showHands: cat === 'gloves', hideGun: cat === 'feeds',
    });
  }
};
