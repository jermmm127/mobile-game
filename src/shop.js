'use strict';
// =============================================================================
// PROFILE + SHOP — coins earned in matches, spent on cosmetics. Saved per
// device in localStorage. The shop shows a live 3D preview (Game.renderShop).
// =============================================================================
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
      owned: Object.assign({ skins: ['default'], tracers: ['default'], charms: ['none'], gloves: ['default'], blueprints: [] }, d.owned || {}),
      equip: Object.assign({ skins: 'default', tracers: 'default', charms: 'none', gloves: 'default' }, d.equip || {}),
      stats: Object.assign({ matches: 0, wins: 0, kills: 0 }, d.stats || {}),
      dev: !!d.dev,
    };
    this.data.equip.blueprints = Object.assign({}, (d.equip && d.equip.blueprints) || {});
    for (const k of ['gloves', 'blueprints']) if (!this.data.owned[k]) this.data.owned[k] = k === 'gloves' ? ['default'] : [];
    // Dev accounts: infinite coins and everything unlocked (including items added later)
    if (BR.Accounts && BR.Accounts.isSeededDev()) this.data.dev = true;
    if (this.data.dev) this.grantAll();
    return this.data;
  },
  grantAll() {
    const M = BR.Models, o = this.data.owned;
    const add = (cat, ids) => { for (const id of ids) if (!o[cat].includes(id)) o[cat].push(id); };
    add('skins', Object.keys(M.SKINS)); add('tracers', Object.keys(M.TRACERS));
    add('charms', Object.keys(M.CHARMS)); add('gloves', Object.keys(M.GLOVES));
    for (const w in M.BLUEPRINTS) add('blueprints', Object.keys(M.BLUEPRINTS[w]).map(b => w + ':' + b));
  },
  save() { BR.util.save(this.KEY, this.data); },
  // Blueprint ids are "weapon:blueprint" (e.g. "rifle:vandal"); every weapon owns "default".
  owns(cat, id) {
    if (cat === 'blueprints' && id.endsWith(':default')) return true;
    return this.data.owned[cat].includes(id);
  },
  isEquipped(cat, id) {
    if (cat === 'blueprints') { const [w, b] = id.split(':'); return (this.data.equip.blueprints[w] || 'default') === b; }
    return this.data.equip[cat] === id;
  },
  infinite() { return !!this.data.dev; },
  coinsLabel() { return this.infinite() ? '∞' : String(this.data.coins); },
  canAfford(price) { return this.infinite() || this.data.coins >= price; },
  buy(cat, id) {
    const item = BR.Shop.item(cat, id);
    if (!item || this.owns(cat, id) || !this.canAfford(item.price)) return false;
    if (!this.infinite()) this.data.coins -= item.price;
    this.data.owned[cat].push(id);
    this.setEquip(cat, id);
    this.save();
    return true;
  },
  equip(cat, id) { if (!this.owns(cat, id)) return false; this.setEquip(cat, id); this.save(); return true; },
  setEquip(cat, id) {
    if (cat === 'blueprints') { const [w, b] = id.split(':'); this.data.equip.blueprints[w] = b; }
    else this.data.equip[cat] = id;
  },
  // Coins for a finished match. Returns the breakdown so the end screen can show it.
  award(r) {
    const C = BR.CONFIG.coins;
    const parts = [];
    if (r.kills) parts.push(['Kills ×' + r.kills, r.kills * C.perKill]);
    if (r.damage > 0) parts.push(['Damage', Math.floor(r.damage * C.perDamage)]);
    if (r.win) parts.push(['Victory', C.win]);
    else if (r.place <= 5) parts.push(['Top 5', C.top5]);
    else if (r.place <= 10) parts.push(['Top 10', C.top10]);
    const total = parts.reduce((s, p) => s + p[1], 0);
    this.data.coins += total;
    this.data.stats.matches++;
    this.data.stats.kills += r.kills;
    if (r.win) this.data.stats.wins++;
    this.save();
    return { total, parts };
  },
};

const SHOP_WEAPONS = [['rifle', 'Rifle'], ['holoar', 'Holo AR'], ['smg', 'SMG'], ['shotgun', 'Breacher'], ['sniper', 'Sniper'], ['pistol', 'Pistol'], ['knife', 'Karambit']];
const RARITY = { Base: '#8d97a5', Epic: '#b26bff', Legendary: '#ffb224' };

BR.Shop = class Shop {
  // Catalog for a category. Blueprints are per weapon; ids look like "rifle:vandal".
  static catalog(cat, weapon) {
    const M = BR.Models;
    if (cat === 'blueprints') {
      const out = {}, bps = M.BLUEPRINTS[weapon] || {};
      for (const b in bps) out[weapon + ':' + b] = bps[b];
      return out;
    }
    return cat === 'skins' ? M.SKINS : cat === 'tracers' ? M.TRACERS : cat === 'gloves' ? M.GLOVES : M.CHARMS;
  }
  static item(cat, id) {
    if (cat === 'blueprints') { const [w] = id.split(':'); return Shop.catalog(cat, w)[id]; }
    return Shop.catalog(cat)[id];
  }

  constructor(game) {
    this.game = game;
    this.cat = 'blueprints';
    this.weapon = 'rifle';
    this.sel = null;
    const $ = id => document.getElementById(id);
    this.el = { root: $('shop'), grid: $('shop-grid'), coins: $('shop-coins'), name: $('shop-sel-name'), action: $('shop-action'), msg: $('shop-msg'), weps: $('shop-weps') };
    this.el.weps.innerHTML = SHOP_WEAPONS.map(([id, n]) => `<button data-w="${id}">${n}</button>`).join('');
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
    if (P.owns(cat, id)) { P.equip(cat, id); BR.Audio.pickup(); }
    else if (P.buy(cat, id)) { BR.Audio.kill(); this.flash('Unlocked!'); }
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
    if (cat === 'tracers') {
      const c = it.color < 0 ? 'linear-gradient(90deg,#ff1f3d,#ffcc00,#39ff14,#00e5ff,#b026ff)' : hex(it.color);
      return `<i class="sw tr" style="background:${c};--c:${it.color < 0 ? '#fff' : hex(it.color)}"></i>`;
    }
    if (cat === 'gloves') return `<i class="sw gl" style="--c:${it.color !== undefined ? hex(it.color) : '#666'};--p:${hex(it.pad)}">✋</i>`;
    return `<i class="sw ch">${id === 'none' ? '—' : '◆'}</i>`;
  }

  render() {
    const P = BR.Profile, cat = this.cat, items = Shop.catalog(cat, this.weapon);
    document.querySelectorAll('#shop-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.cat === cat));
    const showWeps = cat === 'blueprints' || cat === 'skins';
    this.el.weps.classList.toggle('hidden', !showWeps);
    this.el.weps.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.w === this.weapon));
    this.el.coins.textContent = P.coinsLabel();
    const html = [];
    for (const id in items) {
      const it = items[id], own = P.owns(cat, id), eq = P.isEquipped(cat, id);
      const rar = it.rarity ? `<span class="rar" style="--r:${RARITY[it.rarity] || '#8d97a5'}">${it.rarity}</span>` : '';
      html.push(`<button class="card${this.sel === id ? ' sel' : ''}${eq ? ' eq' : ''}${it.rarity === 'Legendary' ? ' legend' : ''}" data-id="${id}">${this.swatch(cat, id, it)}${rar}<span class="cn">${it.name}</span><span class="cp">${eq ? 'Equipped' : own ? 'Owned' : '<i class="coin"></i>' + it.price}</span></button>`);
    }
    this.el.grid.innerHTML = html.join('');
    const it = items[this.sel];
    this.el.name.textContent = it ? it.name : '';
    const own = it && P.owns(cat, this.sel), eq = it && P.isEquipped(cat, this.sel);
    this.el.action.textContent = !it ? '' : eq ? 'Equipped' : own ? 'Equip' : 'Buy · ' + it.price;
    this.el.action.disabled = !it || eq;
    this.el.action.classList.toggle('poor', !!it && !own && !P.canAfford(it.price));
    // Preview: the equipped look, with the selected item swapped in
    const eqd = P.data.equip;
    const wpn = showWeps ? this.weapon : 'holoar';
    this.game.setShopPreview({
      weapon: cat === 'gloves' ? 'pistol' : wpn,
      bp: cat === 'blueprints' ? this.sel.split(':')[1] : (eqd.blueprints[cat === 'gloves' ? 'pistol' : wpn] || 'default'),
      skin: cat === 'skins' ? this.sel : eqd.skins,
      charm: cat === 'charms' ? this.sel : eqd.charms,
      tracer: cat === 'tracers' ? this.sel : eqd.tracers,
      gloves: cat === 'gloves' ? this.sel : eqd.gloves,
      showTracer: cat === 'tracers',
      showHands: cat === 'gloves',
    });
  }
};
