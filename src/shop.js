'use strict';
// =============================================================================
// PROFILE + SHOP — coins earned in matches, spent on cosmetics. Saved per
// device in localStorage. The shop shows a live 3D preview (Game.renderShop).
// =============================================================================
BR.Profile = {
  KEY: 'velocity-royale.profile',
  data: null,
  load() {
    const C = BR.CONFIG.coins;
    const d = BR.util.load(this.KEY, null) || {};
    this.data = {
      coins: typeof d.coins === 'number' ? d.coins : C.start,
      owned: Object.assign({ skins: ['default'], tracers: ['default'], charms: ['none'] }, d.owned || {}),
      equip: Object.assign({ skins: 'default', tracers: 'default', charms: 'none' }, d.equip || {}),
      stats: Object.assign({ matches: 0, wins: 0, kills: 0 }, d.stats || {}),
    };
    return this.data;
  },
  save() { BR.util.save(this.KEY, this.data); },
  owns(cat, id) { return this.data.owned[cat].includes(id); },
  buy(cat, id) {
    const item = BR.Shop.catalog(cat)[id];
    if (!item || this.owns(cat, id) || this.data.coins < item.price) return false;
    this.data.coins -= item.price;
    this.data.owned[cat].push(id);
    this.data.equip[cat] = id;
    this.save();
    return true;
  },
  equip(cat, id) { if (!this.owns(cat, id)) return false; this.data.equip[cat] = id; this.save(); return true; },
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

BR.Shop = class Shop {
  static catalog(cat) { return cat === 'skins' ? BR.Models.SKINS : cat === 'tracers' ? BR.Models.TRACERS : BR.Models.CHARMS; }

  constructor(game) {
    this.game = game;
    this.cat = 'skins';
    this.sel = null;
    const $ = id => document.getElementById(id);
    this.el = { root: $('shop'), grid: $('shop-grid'), coins: $('shop-coins'), name: $('shop-sel-name'), action: $('shop-action'), msg: $('shop-msg') };
    $('shop-tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      this.cat = b.dataset.cat;
      this.sel = BR.Profile.data.equip[this.cat];
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

  open() {
    this.sel = BR.Profile.data.equip[this.cat];
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

  render() {
    const P = BR.Profile, cat = this.cat, items = Shop.catalog(cat);
    document.querySelectorAll('#shop-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.cat === cat));
    this.el.coins.textContent = P.data.coins;
    const html = [];
    for (const id in items) {
      const it = items[id], own = P.owns(cat, id), eq = P.data.equip[cat] === id;
      let sw = '';
      if (cat === 'skins') sw = `<i class="sw" style="background:${it.swatch}"></i>`;
      else if (cat === 'tracers') sw = `<i class="sw tr" style="background:${it.color < 0 ? 'linear-gradient(90deg,#f33,#fd3,#3f6,#3cf,#a3f)' : '#' + it.color.toString(16).padStart(6, '0')}"></i>`;
      else sw = `<i class="sw ch">${id === 'none' ? '—' : '✦'}</i>`;
      html.push(`<button class="card${this.sel === id ? ' sel' : ''}${eq ? ' eq' : ''}" data-id="${id}">${sw}<span class="cn">${it.name}</span><span class="cp">${eq ? 'EQUIPPED' : own ? 'OWNED' : '◉ ' + it.price}</span></button>`);
    }
    this.el.grid.innerHTML = html.join('');
    const it = items[this.sel];
    this.el.name.textContent = it ? it.name : '';
    const own = it && P.owns(cat, this.sel), eq = it && P.data.equip[cat] === this.sel;
    this.el.action.textContent = !it ? '' : eq ? 'Equipped' : own ? 'Equip' : 'Buy ◉ ' + it.price;
    this.el.action.disabled = !it || eq;
    this.el.action.classList.toggle('poor', !!it && !own && P.data.coins < it.price);
    // What the preview shows: equipped look, with the selected item swapped in
    const eqd = P.data.equip;
    this.game.setShopPreview({
      skin: cat === 'skins' ? this.sel : eqd.skins,
      charm: cat === 'charms' ? this.sel : eqd.charms,
      tracer: cat === 'tracers' ? this.sel : eqd.tracers,
      showTracer: cat === 'tracers',
    });
  }
};
