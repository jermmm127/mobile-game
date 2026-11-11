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
    if (r.arena) {         // v1.15 ranked arena: the win (or your FFA placing) + kills
      if (r.draw) return Math.min(r.kills || 0, 10) * 2;
      const base = r.ffa ? (r.win ? 60 : r.rank <= 3 ? 20 : -10) : r.win ? (r.online ? 55 : 40) : -15;
      return base + Math.min(r.kills || 0, r.ffa || r.preset === 'tdm' ? 15 : 8) * 3;
    }
    const place = r.place || 99;
    const p = r.win ? 140 : place <= 3 ? 85 : place <= 5 ? 60 : place <= 10 ? 32 : place <= 20 ? 10 : -8;
    return p + Math.min(r.kills || 0, 10) * 14;
  },
  // v1.16.1: the leaderboard is real players only (see leaderboard.js); this keeps the old call working
  board() { return BR.Board ? BR.Board.rows().rows : []; },
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
// ---- v1.26 CHARACTER: outfits (your character's clothes) and masks. Bought in the shop, dropped by cases or earned by grinding.
//   outfit: jacket / pants / boots / gloves colours; pat = jacket print (cols, scale); glowPat + glow = a glowing trim on the jacket
//   mask:   base knit colour, pat (+ c2 / c3), eyes 'glow' (+ eyeCol), trim, glow, add = visor / goggles / horns / halo / crown / antenna
BR.OUTFITS = {
  default:   { name: 'Operator', price: 0, desc: 'Team-colour jacket' },
  // v1.32 Common / Uncommon
  tracksuit: { name: 'Tracksuit', price: 150, rarity: 'Common', jacket: 0x2a2f3a, pants: 0x2a2f3a, boots: 0xe8e8e8, gloves: 0x1a1b1e },
  fieldolive:{ name: 'Field Olive', price: 150, rarity: 'Common', jacket: 0x4a5530, pants: 0x3a3f2a, boots: 0x231c14, gloves: 0x2b3020 },
  navyops:   { name: 'Navy Ops', price: 180, rarity: 'Common', jacket: 0x22304a, pants: 0x161c2a, boots: 0x0e1016, gloves: 0x161c2a },
  sandcamo:  { name: 'Sand Camo', price: 320, rarity: 'Uncommon', jacket: 0xffffff, pants: 0x9a8566, boots: 0x5a4430, gloves: 0x6b5a44, pat: 'camo', cols: [0xd8c39a, 0xb49a6a, 0x8a7250, 0xeee0bc] },
  urbandigi: { name: 'Urban Digital', price: 340, rarity: 'Uncommon', jacket: 0xffffff, pants: 0x3a3f46, boots: 0x1c1d20, gloves: 0x2a2d33, pat: 'digital', cols: [0x7a828b, 0x4b525a, 0xb3bac1, 0x2a2e33] },
  denim:     { name: 'Denim', caseOnly: true, case: 'street', rarity: 'Common', jacket: 0x3a5a8a, pants: 0x24385a, boots: 0x3a2418, gloves: 0x1a1b1e },
  hivis:     { name: 'Hi-Vis Crew', caseOnly: true, case: 'street', rarity: 'Uncommon', jacket: 0xd7ff2a, pants: 0x2a2d33, boots: 0x1a1a1a, gloves: 0x2a2d33, glowPat: 'seams', glow: 0xf2f2f2 },
  graffiti:  { name: 'Graffiti', caseOnly: true, case: 'street', rarity: 'Epic', jacket: 0xffffff, pants: 0x16181c, boots: 0xff3d7f, gloves: 0x16181c, pat: 'splatter', cols: [0x16181c, 0xff3d7f, 0x1de9ff] },
  urban:     { name: 'Urban Grey', price: 500, rarity: 'Rare', jacket: 0x5d636b, pants: 0x2b2e33, boots: 0x1c1d20, gloves: 0x1a1b1e },
  crimson:   { name: 'Crimson', price: 700, rarity: 'Rare', jacket: 0xb3202c, pants: 0x1e1f24, boots: 0x141416, gloves: 0x141416 },
  desert:    { name: 'Desert Ops', price: 800, rarity: 'Epic', jacket: 0xffffff, pants: 0x9a8566, boots: 0x5a4430, gloves: 0x6b5a44, pat: 'camo', cols: [0xc9b48a, 0xa58a5e, 0x7c6444, 0xe0d2ac] },
  woodland:  { name: 'Woodland', price: 900, rarity: 'Epic', jacket: 0xffffff, pants: 0x3b4630, boots: 0x2a2219, gloves: 0x2b3024, pat: 'camo', cols: [0x5c6b3e, 0x3a4528, 0x2a2219, 0x8b8a5a] },
  arctic:    { name: 'Arctic Ghost', price: 1100, rarity: 'Epic', jacket: 0xffffff, pants: 0xc7cfd6, boots: 0x6c7680, gloves: 0xe6ebef, pat: 'digital', cols: [0xe9eef2, 0xb9c4cc, 0x8a96a0, 0xffffff] },
  bengal:    { name: 'Bengal', price: 1500, rarity: 'Legendary', jacket: 0xffffff, pants: 0x1b1b1d, boots: 0x111112, gloves: 0x1b1b1d, pat: 'tiger', cols: [0xe8801f, 0x141414], scale: 0.24 },
  midnight:  { name: 'Midnight Ops', price: 1800, rarity: 'Legendary', jacket: 0x23262d, pants: 0x14161a, boots: 0x0c0d0f, gloves: 0x101114, glowPat: 'seams', glow: 0x2f8bff },
  // Release Case
  cobalt:    { name: 'Cobalt Strike', caseOnly: true, rarity: 'Rare', jacket: 0x2453c8, pants: 0x1c2233, boots: 0x111522, gloves: 0x182038 },
  hazmat:    { name: 'Hazmat', caseOnly: true, rarity: 'Epic', jacket: 0xffffff, pants: 0xc8c22a, boots: 0x161616, gloves: 0x161616, pat: 'hazard', cols: [0xe6dc1e, 0x161616], scale: 0.22 },
  phantom:   { name: 'Jungle Phantom', caseOnly: true, rarity: 'Legendary', jacket: 0xffffff, pants: 0x1d2a1b, boots: 0x101410, gloves: 0x18201a, pat: 'camo', cols: [0x1f3a22, 0x0f1c11, 0x2f5a2a, 0x63a83a], glowPat: 'circuit', glow: 0x39ff88 },
  neonrun:   { name: 'Neon Runner', caseOnly: true, rarity: 'Mythic', jacket: 0x111216, pants: 0x0b0c10, boots: 0xff2bd6, gloves: 0x0b0c10, glowPat: 'circuit', glow: 0xff2bd6 },
  magma:     { name: 'Magma Core', caseOnly: true, rarity: 'Exotic', jacket: 0xffffff, pants: 0x1a0d08, boots: 0x0d0605, gloves: 0x1a0d08, pat: 'lava', cols: [0x241410, 0x3a1a0e, 0x5a2008], glowPat: 'cracks', glow: 0xff5a00 },
  // Nova Case
  emperor:   { name: 'Golden Emperor', caseOnly: true, case: 'nova', rarity: 'Legendary', jacket: 0xffffff, pants: 0x1a1a1a, boots: 0xb8860b, gloves: 0xd4a83a, pat: 'gold', cols: [0xffd86a, 0xc8921e, 0xfff2b0] },
  samurai:   { name: 'Cyber Ronin', caseOnly: true, case: 'nova', rarity: 'Mythic', jacket: 0xffffff, pants: 0x18181c, boots: 0xc8102e, gloves: 0x18181c, pat: 'split', cols: [0xeeeeee, 0xc8102e, 0x111111], scale: 0.18, glowPat: 'chevron', glow: 0xff2040 },
  galaxy:    { name: 'Galaxy Walker', caseOnly: true, case: 'nova', rarity: 'Mythic', jacket: 0xffffff, pants: 0x140a2a, boots: 0x0a0514, gloves: 0x1a0d36, pat: 'galaxy', cols: [0x12082a, 0x3b1a7a, 0xff3df2], glowPat: 'stars', glow: 0xbfe8ff },
  voidreap:  { name: 'Void Reaper', caseOnly: true, case: 'nova', rarity: 'Exotic', jacket: 0x1a0b2a, pants: 0x07030c, boots: 0x07030c, gloves: 0x7b2cff, glowPat: 'cracks', glow: 0xb04bff },
  // Mastery (grind)
  ghillie:   { name: 'Marksman Ghillie', rarity: 'Legendary', jacket: 0xffffff, pants: 0x3a4529, boots: 0x231c14, gloves: 0x2b3020, pat: 'ghillie', cols: [0x4b5a30, 0x2e3a1c, 0x6f7a3e, 0x5a4a2a], grind: { stat: 'wh:sniper', n: 50, label: 'Get 50 headshot kills with the Sniper' } },
  bladesong: { name: 'Blade Dancer', rarity: 'Mythic', jacket: 0xe8edf2, pants: 0x20242c, boots: 0x101216, gloves: 0x20242c, glowPat: 'seams', glow: 0x1de9ff, grind: { stat: 'knife', n: 100, label: 'Get 100 knife kills' } },
  rotwalker: { name: 'Dead Walker', rarity: 'Legendary', jacket: 0xffffff, pants: 0x3a3a2a, boots: 0x1d1a14, gloves: 0x4a5a3a, pat: 'splatter', cols: [0x5d6a4a, 0x7a1a14, 0x2a2a1e], grind: { stat: 'zkills', n: 1000, label: 'Kill 1,000 zombies' } },
  champion:  { name: 'Champion', rarity: 'Mythic', jacket: 0xf2f2f2, pants: 0xd4a83a, boots: 0x1a1a1a, gloves: 0xd4a83a, glowPat: 'chevron', glow: 0xffc83a, grind: { stat: 'wins', n: 25, label: 'Win 25 matches' } },
};
BR.MASKS = {
  default:   { name: 'Black Knit', price: 0 },
  // v1.32 Common / Uncommon
  tanknit:   { name: 'Tan Knit', price: 120, rarity: 'Common', base: 0xa48a62 },
  whiteknit: { name: 'White Knit', price: 120, rarity: 'Common', base: 0xdedfe0 },
  navyknit:  { name: 'Navy Knit', price: 140, rarity: 'Common', base: 0x22304a },
  camoknit:  { name: 'Digital Camo', price: 280, rarity: 'Uncommon', base: 0x4f5a34, pat: 'digital', c2: 0x2c3420, c3: 0x6e6a44 },
  stripeknit:{ name: 'Racer', price: 300, rarity: 'Uncommon', base: 0x1c1e22, trim: 0xc8102e },
  redknit:   { name: 'Red Knit', caseOnly: true, case: 'street', rarity: 'Common', base: 0x8a1a22 },
  splatm:    { name: 'Splatter', caseOnly: true, case: 'street', rarity: 'Uncommon', base: 0x16181c, pat: 'splatter', c2: 0xff3d7f, c3: 0x1de9ff },
  wildm:     { name: 'Wildcat', caseOnly: true, case: 'street', rarity: 'Rare', base: 0xff7a00, pat: 'tiger', c2: 0x111111 },
  charcoal:  { name: 'Charcoal', price: 300, rarity: 'Rare', base: 0x45484e },
  olive:     { name: 'Olive Drab', price: 300, rarity: 'Rare', base: 0x3f4a2c },
  tigerm:    { name: 'Tiger Stripe', price: 700, rarity: 'Epic', base: 0xe8801f, pat: 'tiger', c2: 0x141414 },
  hazardm:   { name: 'Hazard', price: 700, rarity: 'Epic', base: 0xe6dc1e, pat: 'hazard', c2: 0x161616 },
  skull:     { name: 'Skull', price: 900, rarity: 'Epic', base: 0x141416, pat: 'skull', c2: 0xe9e4d6 },
  frost:     { name: 'Digital Frost', price: 1200, rarity: 'Legendary', base: 0xdfe6eb, pat: 'digital', c2: 0x9fb2c0, c3: 0x5d7486, add: 'goggles', glow: 0x6fd8ff },
  redeye:    { name: 'Red Eye', price: 1400, rarity: 'Legendary', base: 0x0e0e10, eyes: 'glow', eyeCol: 0xff2030 },
  // Release Case
  stitched:  { name: 'Stitched Grin', caseOnly: true, rarity: 'Epic', base: 0x2a2a2e, pat: 'grin', c2: 0xd8d0c0 },
  visor:     { name: 'Neon Visor', caseOnly: true, rarity: 'Mythic', base: 0x101114, trim: 0x1de9ff, glow: 0x1de9ff, add: 'visor' },
  demon:     { name: 'Demon', caseOnly: true, rarity: 'Exotic', base: 0x5a0a0e, eyes: 'glow', eyeCol: 0xffb000, add: 'horns', addCol: 0x1a1414 },
  // Nova Case
  goldm:     { name: 'Gold Plated', caseOnly: true, case: 'nova', rarity: 'Legendary', base: 0xd4a83a, pat: 'gold', c2: 0xffe08a, c3: 0x8a6a1a },
  galaxym:   { name: 'Nebula', caseOnly: true, case: 'nova', rarity: 'Mythic', base: 0x12082a, pat: 'galaxy', c2: 0x3b1a7a, c3: 0xff3df2, eyes: 'glow', eyeCol: 0xbfe8ff, add: 'antenna', glow: 0xff3df2 },
  halo:      { name: 'Seraph', caseOnly: true, case: 'nova', rarity: 'Exotic', base: 0xf2f0ea, trim: 0xffd24a, eyes: 'glow', eyeCol: 0xffe08a, add: 'halo', glow: 0xffd24a },
  // Mastery (grind)
  headhunt:  { name: 'Headhunter', rarity: 'Legendary', base: 0x101012, pat: 'skull', c2: 0xd8d0c0, eyes: 'glow', eyeCol: 0xff2030, grind: { stat: 'heads', n: 500, label: 'Get 500 headshot kills' } },
  undying:   { name: 'Undying', rarity: 'Mythic', base: 0x1d2a1b, pat: 'splatter', c2: 0x5d6a4a, c3: 0x7a1a14, eyes: 'glow', eyeCol: 0x39ff88, grind: { stat: 'zround', n: 30, label: 'Reach round 30 in Zombies' } },
  kingpin:   { name: 'Kingpin', rarity: 'Mythic', base: 0x18181c, trim: 0xd4a83a, add: 'crown', addCol: 0xd4a83a, grind: { stat: 'wins', n: 50, label: 'Win 50 matches' } },
};
// ---- v1.27 HATS: worn over the mask. kind = the model (actors.js buildHat), c1 / c2 / glow = its colours. Some animate.
BR.HATS = {
  default:   { name: 'No Hat', price: 0 },
  // v1.32 Common / Uncommon
  greybeanie:{ name: 'Grey Beanie', price: 120, rarity: 'Common', kind: 'beanie', c1: 0x6a7078, c2: 0x6a7078 },
  blackcap:  { name: 'Black Cap', price: 120, rarity: 'Common', kind: 'cap', c1: 0x17181b, c2: 0x17181b },
  olivebucket:{ name: 'Olive Bucket', price: 150, rarity: 'Common', kind: 'bucket', c1: 0x4a5530, c2: 0x3a4226 },
  bluebandana:{ name: 'Blue Bandana', price: 240, rarity: 'Uncommon', kind: 'bandana', c1: 0x2453c8 },
  camobucket:{ name: 'Camo Bucket', price: 280, rarity: 'Uncommon', kind: 'bucket', c1: 0x6e6a44, c2: 0x2c3420 },
  orangebeanie:{ name: 'Hunter Beanie', caseOnly: true, case: 'street', rarity: 'Common', kind: 'beanie', c1: 0xff6a00, c2: 0xff6a00 },
  whitecap:  { name: 'Reverse Cap', caseOnly: true, case: 'street', rarity: 'Uncommon', kind: 'backcap', c1: 0xf2f2f2, c2: 0xc8102e, glow: 0xffffff },
  st_cone:   { name: 'Street Cone', caseOnly: true, case: 'street', rarity: 'Rare', kind: 'cone', c1: 0x1de9ff },
  bandana:   { name: 'Red Bandana', price: 300, rarity: 'Rare', kind: 'bandana', c1: 0xc8102e },
  beanie:    { name: 'Pom Beanie', price: 400, rarity: 'Rare', kind: 'beanie', c1: 0xff7a00, c2: 0xfff2d6 },
  snapback:  { name: 'Snapback', price: 450, rarity: 'Rare', kind: 'cap', c1: 0x1d6bff, c2: 0xffd24a },
  bucket:    { name: 'Bucket Hat', price: 800, rarity: 'Epic', kind: 'bucket', c1: 0x39d98a, c2: 0x1b6b45 },
  beret:     { name: 'Commando Beret', price: 900, rarity: 'Epic', kind: 'beret', c1: 0x7a0f1d, c2: 0xffd24a },
  tophat:    { name: 'Neon Top Hat', price: 1600, rarity: 'Legendary', kind: 'tophat', c1: 0x111114, glow: 0xff2bd6 },
  catears:   { name: 'Glow Cat Ears', price: 1500, rarity: 'Legendary', kind: 'catears', c1: 0x18181c, glow: 0x1de9ff },
  // Release Case
  backcap:   { name: 'Backwards Cap', caseOnly: true, rarity: 'Rare', kind: 'backcap', c1: 0xffd24a, c2: 0x111111, glow: 0xffd24a },
  cone:      { name: 'Traffic Cone', caseOnly: true, rarity: 'Epic', kind: 'cone', c1: 0xff6a00 },
  kabuto:    { name: 'Shogun Kabuto', caseOnly: true, rarity: 'Legendary', kind: 'kabuto', c1: 0x7a0a12, c2: 0xffc83a, glow: 0xff3030 },
  headset:   { name: 'RGB Headset', caseOnly: true, rarity: 'Mythic', kind: 'headset', c1: 0x15161a, glow: 0x39ff88 },
  flame:     { name: 'Inferno Crown', caseOnly: true, rarity: 'Exotic', kind: 'flame', c1: 0xffc83a, c2: 0xffe14d, glow: 0xff4a00 },
  // Nova Case
  antlers:   { name: 'Spirit Antlers', caseOnly: true, case: 'nova', rarity: 'Legendary', kind: 'antlers', glow: 0x6fd8ff },
  wizard:    { name: 'Archmage', caseOnly: true, case: 'nova', rarity: 'Mythic', kind: 'wizard', c1: 0x3b1a9a, c2: 0xffd24a, glow: 0xff3df2 },
  saturn:    { name: 'Saturn Orbit', caseOnly: true, case: 'nova', rarity: 'Exotic', kind: 'saturn', c1: 0x1de9ff, c2: 0xff3df2, glow: 0xffd24a },
  // Mastery (grind)
  viking:    { name: 'Warlord Helm', rarity: 'Legendary', kind: 'viking', c1: 0x8a929c, c2: 0xb8860b, grind: { stat: 'kills', n: 1000, label: 'Get 1,000 kills' } },
  gunslinger:{ name: 'Gunslinger', rarity: 'Legendary', kind: 'cowboy', c1: 0x5a3a22, c2: 0xd4a83a, grind: { stat: 'w:revolver', n: 150, label: 'Get 150 kills with the Revolver' } },
  mohawk:    { name: 'Neon Mohawk', rarity: 'Mythic', kind: 'mohawk', c1: 0xff2bd6, c2: 0x39ff88, grind: { stat: 'heads', n: 1000, label: 'Get 1,000 headshot kills' } },
  brainjar:  { name: 'Brain Jar', rarity: 'Mythic', kind: 'brainjar', c1: 0xff8ab0, glow: 0x39ff88, grind: { stat: 'zkills', n: 2500, label: 'Kill 2,500 zombies' } },
};
// ---- Cases: exclusive items you can only get by opening one. Rarer = flashier.
BR.CASES = {
  release: { name: 'Release Case', price: 600, odds: { Rare: 52, Epic: 28, Legendary: 13, Mythic: 6, Exotic: 1 }, dupRefund: 0.35, label: 'RELEASE', sub: 'CASE · SEASON 1' },
  // Season 2: only Legendary and up. Every drop is animated.
  nova: { name: 'Nova Case', price: 900, odds: { Legendary: 58, Mythic: 34, Exotic: 8 }, dupRefund: 0.4, label: 'NOVA', sub: 'CASE · SEASON 2' },
  // v1.32: a cheap starter case, mostly Common + Uncommon with a shot at Rare, Epic and one Legendary
  // v1.41: the only way to get attachments (optics, muzzles, grips, stocks)
  attach: { name: 'Attachment Case', price: 400, odds: { Common: 40, Uncommon: 28, Rare: 20, Epic: 10, Legendary: 2 }, dupRefund: 0.45, label: 'ATTACH', sub: 'CASE · GUNSMITH' },
  street: { name: 'Street Case', price: 250, odds: { Common: 44, Uncommon: 33, Rare: 15, Epic: 7, Legendary: 1 }, dupRefund: 0.3, label: 'STREET', sub: 'CASE · STARTER' },
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
    add('outfits', BR.OUTFITS); add('masks', BR.MASKS); add('hats', BR.HATS);
    if (BR.ATTACH) add('attach', BR.ATTACH);          // v1.41 (all in the Attachment Case)
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
    let d = BR.AntiCheat ? BR.AntiCheat.loadSigned(this.KEY) : BR.util.load(this.KEY, null);
    if (!d && this.KEY.endsWith('.guest')) d = BR.util.load('velocity-royale.profile', null); // pre-accounts save
    d = d || {};
    // v1.30.1: keep EVERY saved field (friends, friend requests, challenges, mastery, daily streak, keys, ...) and only
    // normalise the known ones on top. It used to rebuild the profile from a fixed list, so anything else was wiped on load.
    this.data = Object.assign({}, d, {
      coins: typeof d.coins === 'number' ? d.coins : C.start,
      owned: Object.assign({ skins: ['default'], tracers: ['default'], charms: ['none'], gloves: ['default'], blueprints: [], feeds: ['none'], finishers: ['none'], outfits: ['default'], masks: ['default'], hats: ['default'] }, d.owned || {}),
      equip: Object.assign({ skins: 'default', tracers: 'default', charms: 'none', gloves: 'default', feeds: 'none', finishers: 'none', outfits: 'default', masks: 'default', hats: 'default', melee: 'tracker' }, d.equip || {}),
      rp: typeof d.rp === 'number' ? d.rp : 0,
      cases: Object.assign({ opened: 0 }, d.cases || {}),
      stats: Object.assign({ matches: 0, wins: 0, kills: 0, deaths: 0 }, d.stats || {}),
      dev: !!d.dev,
      meleeV: d.meleeV || (d.owned ? 0 : 3),          // brand-new accounts skip the old 'bayonet is the default' migration
      // v1.11: default loadout (used where a mode hands you guns: Practice, Overdrive, Aim Trainer, Resurgence redeploys)
      loadout: Object.assign({ primary: 'rifle', secondary: 'pistol' }, d.loadout || {}),
      starter: !!d.starter,
      fresh: !d.owned,
      xp: typeof d.xp === 'number' ? d.xp : null,
    });
    for (const k of ['friends', 'friendsOut']) if (!Array.isArray(this.data[k])) delete this.data[k];      // (only well-formed lists)
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
    if (!this.data.owned.attach) this.data.owned.attach = []; if (!this.data.equip.attach) this.data.equip.attach = {};          // v1.41 attachments
    for (const k of ['outfits', 'masks', 'hats']) { if (!this.data.owned[k]) this.data.owned[k] = ['default']; if (!this.data.equip[k]) this.data.equip[k] = 'default'; }     // v1.26 character
    // v1.14: new accounts start from scratch — default skins only, the Tracker knife, level 0.
    // Older saves get XP credited for what they already did (kills, wins, matches, zombies).
    if (this.data.xp === null) {
      const st = this.data.stats;
      this.data.xp = this.data.fresh ? 0 : Math.round((st.kills || 0) * 100 + (st.wins || 0) * 1500 + (st.matches || 0) * 250 + (st.zmKills || 0) * 15);
    }
    delete this.data.fresh;
    this.unlockRankRewards();
    // Dev accounts: infinite coins and everything unlocked (including items added later)
    if (BR.Accounts && BR.Accounts.isSeededDev()) this.data.dev = true;
    if (this.data.dev) this.grantAll();
    // the built-in dev account has the top rank (Predator) for its rewards; it isn't listed on the leaderboard
    if (BR.Accounts && BR.Accounts.isSeededDev()) {
      this.data.rp = Math.max(this.data.rp || 0, BR.Ranks.tiers[BR.Ranks.tiers.length - 1].rp + 2500);
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
    add('finishers', Object.keys(BR.FINISHERS)); add('outfits', Object.keys(BR.OUTFITS)); add('masks', Object.keys(BR.MASKS)); add('hats', Object.keys(BR.HATS));
    for (const w in M.BLUEPRINTS) add('blueprints', Object.keys(M.BLUEPRINTS[w]).map(b => w + ':' + b));
  },
  // v1.41: saving signs + writes the whole profile (several storage writes), which was a hitch on EVERY kill. During a
  // match the save now waits for a quiet moment (at most 15 s, and straight away when the match ends, you pause, or the
  // tab is hidden / closed), so nothing is lost and fights stay smooth.
  save() {
    const g = BR.game;
    if (g && g.state === 'playing' && !(BR.AntiCheat && BR.AntiCheat.testing && BR.AntiCheat.testing())) {
      if (!this._saveT) this._saveT = setTimeout(() => { this._saveT = 0; this.saveNow(); }, 15000);
      if (!this._saveHook) { this._saveHook = true; const fl = () => this.flush(); window.addEventListener('pagehide', fl); document.addEventListener('visibilitychange', () => { if (document.hidden) fl(); }); }
      return;
    }
    this.saveNow();
  },
  flush() { if (this._saveT) this.saveNow(); },
  saveNow() { if (this._saveT) { clearTimeout(this._saveT); this._saveT = 0; } if (BR.AntiCheat) BR.AntiCheat.saveSigned(this.KEY, this.data); else BR.util.save(this.KEY, this.data); },
  // Blueprint ids are "weapon:blueprint" (e.g. "rifle:vandal"); every weapon owns "default".
  owns(cat, id) {
    if (cat === 'blueprints' && id.endsWith(':default')) return true;
    return this.data.owned[cat].includes(id);
  },
  isEquipped(cat, id, weapon) {
    if (cat === 'blueprints') { const [w, b] = id.split(':'); return (this.data.equip.blueprints[w] || 'default') === b && (!BR.MELEE[w] || this.melee() === w); }
    if (cat === 'tracers') return (this.data.equip.tracerByGun[weapon || 'rifle'] || 'signature') === id;
    if (cat === 'gloves') return this.gloveFor(weapon) === id;
    if (cat === 'skins') return weapon === 'all' ? Object.keys(BR.CONFIG.weapons).every(w => this.skinFor(w) === id) : this.skinFor(weapon || 'rifle') === id;
    return this.data.equip[cat] === id;
  },
  infinite() { return !!this.data.dev; },
  // ---- v1.14 LEVELS: start at 0; level L -> L+1 costs BR.LEVELS.need(L) XP (1250 + 110·L since v1.15.1); cap 100. Knives unlock by level.
  levelInfo(xp) {
    xp = xp === undefined ? (this.data.xp || 0) : xp;
    if (this.data && this.data.dev) return { level: BR.LEVELS.max, into: 0, need: 1, xp };
    let L = 0, left = xp;
    while (L < BR.LEVELS.max && left >= BR.LEVELS.need(L)) { left -= BR.LEVELS.need(L); L++; }
    return { level: L, into: left, need: BR.LEVELS.need(L), xp };
  },
  level() { return this.levelInfo().level; },
  meleeUnlocked(id) { return this.infinite() || this.level() >= (BR.KNIFE_LEVEL[id] || 0); },
  // the knife you actually carry: your pick if you've unlocked it, otherwise the Tracker
  melee() { const m = this.data.equip.melee; return m && BR.MELEE[m] && this.meleeUnlocked(m) ? m : 'tracker'; },
  // add XP from a list of [label, xp] parts; pays 150 coins per level gained; reports knife unlocks
  addXP(parts) {
    parts = parts.filter(p => p[1] > 0);
    const total = parts.reduce((s, p) => s + Math.round(p[1]), 0), before = this.levelInfo();
    this.data.xp = (this.data.xp || 0) + total;
    const after = this.levelInfo(), gained = Math.max(0, after.level - before.level), unlocked = [];
    if (gained && !this.infinite()) this.data.coins += gained * BR.LEVELS.coins;
    for (const id in BR.KNIFE_LEVEL) { const lv = BR.KNIFE_LEVEL[id]; if (lv > before.level && lv <= after.level) unlocked.push(BR.CONFIG.weapons[id].name); }
    this.save();
    if (gained && BR.game && BR.game.hud) setTimeout(() => { BR.game.hud.toast(`LEVEL ${after.level}!${unlocked.length ? ' · UNLOCKED ' + unlocked.join(', ').toUpperCase() : ''} · +${gained * BR.LEVELS.coins} coins`, 3200); BR.Audio.coin(); }, 400);
    if (BR.updateCoins) BR.updateCoins();
    return { total, parts, before: before.level, after: after.level, into: after.into, need: after.need, unlocked };
  },
  // XP for a finished match / run (every mode except Practice)
  matchXP(r) {
    const t = Math.round(r.time || 0);
    if (r.arena) return [['Kills ×' + r.kills, r.kills * 100], [r.win ? 'Victory' : 'Played', r.win ? (r.online ? 900 : 700) : 200]];
    if (r.overdrive) return [['Survived ' + BR.fmtTime(t), t * 3], ['Kills ×' + r.kills, r.kills * 5], ['Bosses ×' + (r.bosses || 0), (r.bosses || 0) * 300], ['Overlord', r.win ? 1500 : 0]];
    if (r.zombies) return [['Rounds ×' + Math.max(0, r.round - 1), Math.max(0, r.round - 1) * 120], ['Zombies ×' + r.kills, r.kills * 15], ['Bosses ×' + (r.bosses || 0), (r.bosses || 0) * 400]];
    if (r.duel) return [['Kills ×' + r.kills, r.kills * 100], [r.win ? 'Duel won' : 'Duel played', r.win ? 700 : 200]];
    return [['Kills ×' + r.kills, r.kills * 100], ['Damage', Math.round(r.damage || 0)], ['Survived ' + BR.fmtTime(t), Math.min(600, t * 2)],
      [r.win ? 'Victory' : r.place <= 5 ? 'Top 5' : r.place <= 10 ? 'Top 10' : 'Played', r.win ? 2000 : r.place <= 5 ? 800 : r.place <= 10 ? 400 : 200]];
  },
  // the guns + knife you start with where a mode arms you (v1.11)
  loadoutGuns() { const L = this.data.loadout || {}, W = BR.CONFIG.weapons; return { primary: W[L.primary] ? L.primary : 'rifle', secondary: W[L.secondary] ? L.secondary : 'pistol', melee: this.melee() }; },
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
    if (cat === 'blueprints') { const [w, b] = id.split(':'); this.data.equip.blueprints[w] = b; if (BR.MELEE[w] && this.meleeUnlocked(w)) this.data.equip.melee = w; }   // equipping a knife skin makes it your knife
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
    for (const cat of ['outfits', 'masks', 'hats']) { const T = BR.CHAR_TABLES[cat](); for (const id in T) if (T[id].grind) out.push({ cat, id, item: T[id] }); }
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
  // v1.26: the character look you wear (outfit + mask ids)
  charLook() { const e = this.data.equip, O = BR.OUTFITS || {}, K = BR.MASKS || {}, H = BR.HATS || {}; return { o: O[e.outfits] ? e.outfits : 'default', m: K[e.masks] ? e.masks : 'default', h: H[e.hats] ? e.hats : 'default' }; },
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
    if (r.cat === 'attach') { const a = BR.ATTACH[r.id]; for (const g of BR.Attach.guns()) if (BR.Attach.fits(r.id, g) && !BR.Attach.on(g)[a.slot]) BR.Attach.set(g, a.slot, r.id); return; }      // v1.41: onto every gun with that slot free
    if (r.cat === 'tracers') { for (const [w] of SHOP_WEAPONS) this.data.equip.tracerByGun[w] = r.id; }
    else this.setEquip(r.cat, r.id, r.cat === 'skins' ? ((BR.shopWeapon && BR.shopWeapon()) || 'rifle') : undefined);
    this.save();
  },

  // Coins for a finished match. Returns the breakdown so the end screen can show it.
  // v1.15: Ranked matches give RP; Casual matches give only XP, coins, challenge + mastery progress
  award(r) {
    if (r.ranked === undefined) r.ranked = !!(BR.game && BR.game.ranked);
    if (BR.AntiCheat && !BR.AntiCheat.checkResult(r)) { r.ranked = false; return { total: 0, parts: [['Result rejected by anti-cheat', 0]], unlocked: [], rejected: true }; }
    if (r.ranked && (this.level() < BR.LEVELS.ranked || (BR.AntiCheat && BR.AntiCheat.rankedBlocked()))) r.ranked = false;    // v1.16: Ranked needs level 20 (and a clean record)
    const res = this.awardCoins(r);
    if (r.ranked) { this.data.stats.rm = (this.data.stats.rm || 0) + 1; this.save(); if (BR.Board) BR.Board.updateSelf().catch(() => {}); }    // v1.16.1: post to the leaderboard
    res.xp = this.addXP(this.matchXP(r));
    return res;
  },
  awardCoins(r) {
    const C = BR.CONFIG.coins;
    if (r.arena) {          // arena modes (duels, TDM, FFA): coins for kills + the win; RP only in Ranked
      const parts = [['Kills ×' + r.kills, r.kills * 15]];
      if (r.win) parts.push([r.ffa ? 'Won the lobby' : 'Victory', r.online ? 200 : 120]);
      else if (r.ffa && r.rank <= 3) parts.push(['Top 3', 50]);
      const total = parts.reduce((s, p) => s + p[1], 0);
      this.data.coins += total; this.data.stats.kills += r.kills;
      if (r.win) this.addGrind('win', 1);
      const out = { total, parts, unlocked: [] };
      if (r.ranked) {
        const rp = BR.Ranks.forMatch(r), before = BR.Ranks.of(this.data.rp || 0);
        this.data.rp = Math.max(0, (this.data.rp || 0) + rp);
        const after = BR.Ranks.of(this.data.rp);
        Object.assign(out, { rp, rankUp: after > before ? BR.Ranks.tiers[after].name : null, unlocked: this.unlockRankRewards() });
      }
      this.save();
      return out;
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
    const rp = r.ranked ? BR.Ranks.forMatch(r) : undefined, before = BR.Ranks.of(this.data.rp || 0);
    if (r.ranked) this.data.rp = Math.max(0, (this.data.rp || 0) + rp);
    const after = BR.Ranks.of(this.data.rp || 0), unlocked = r.ranked ? this.unlockRankRewards() : [];
    this.data.stats.kills += r.kills;
    if (r.win) this.data.stats.wins++;
    else this.data.stats.deaths = (this.data.stats.deaths || 0) + 1;     // one life: a match you didn't win ended in a death
    this.save();
    return { total, parts, rp, rankUp: after > before ? BR.Ranks.tiers[after].name : null, unlocked };
  },
};

BR.CHAR_TABLES = { outfits: () => BR.OUTFITS, masks: () => BR.MASKS, hats: () => BR.HATS };
// the look shown in the preview: what you wear, with the selected outfit / mask swapped in
BR.lookPreview = (cat, id) => { const L = Object.assign({}, BR.Profile.charLook()); if (id) L[cat === 'outfits' ? 'o' : cat === 'hats' ? 'h' : 'm'] = id; L.focus = cat === 'outfits' ? 'body' : cat === 'hats' ? 'hat' : 'head'; const G = BR.Profile.loadoutGuns(); L.wid = G.primary; L.skin = BR.Profile.skinFor(G.primary); L.bp = (BR.Profile.data.equip.blueprints || {})[G.primary] || null; return L; };
BR.MELEE = { bayonet: true, knife: true, butterfly: true, tracker: true };
const SHOP_WEAPONS = [['rifle', 'Rifle'], ['holoar', 'Holo AR'], ['smg', 'SMG'], ['shotgun', 'Breacher'], ['sniper', 'Sniper'], ['hunter', 'Hunting Rifle'], ['revolver', 'Revolver'], ['lmg', 'LMG'], ['dmr', 'DMR'], ['launcher', 'Shockwave Launcher'], ['pistol', 'Pistol'], ['bayonet', 'M9 Bayonet'], ['knife', 'Karambit'], ['butterfly', 'Butterfly'], ['tracker', 'Tracker'], ['burst', 'Talon Burst'], ['riot', 'Riot Auto'], ['pump', 'Pump Action'], ['mpistol', 'Hornet']];
const RARITY = BR.COS_RARITY = { Base: '#8d97a5', Common: '#b9c0c8', Uncommon: '#5fd35f', Rare: '#4b8bff', Epic: '#b26bff', Legendary: '#ffb224', Mythic: '#ff3df2', Exotic: '#ff3b30' };
BR.COS_ORDER = ['Exotic', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
// v1.32: older shop items had no tier; give them one from their price so every item shows where it sits
BR.cosRarity = it => !it ? null : it.rarity || (it.price > 0 ? (it.price <= 200 ? 'Common' : it.price <= 450 ? 'Uncommon' : it.price <= 700 ? 'Rare' : 'Epic') : null);

// ---- v1.26: a posed character (the in-game model) wearing a look and holding a gun: shop/inventory preview + item icons
BR.charFigure = (look, wid, skin, bp) => {
  wid = BR.CONFIG.weapons[wid] ? wid : 'rifle';
  const fake = { color: 0x8899aa, look, yaw: Math.PI, pitch: -0.05, downed: false, weapon: { id: wid },
    mover: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), speedH: 0, dropping: false, chute: false, sliding: false, crouched: false, onGround: true, wallRunning: false, wallN: new THREE.Vector3() } };
  const mesh = BR.Actor.prototype.buildMesh.call(fake); fake.mesh = mesh; mesh.userData.yaw = fake.yaw;
  BR.Actor.prototype.syncMesh.call(fake, 0.016);
  const u = mesh.userData; while (u.gun.children.length) u.gun.remove(u.gun.children[0]);
  let gm; try { gm = BR.Models.worldWeapon(wid, bp || null, skin || 'default'); } catch (e) { gm = BR.Models.worldWeapon(wid); }
  gm.scale.setScalar(1.15); u.gun.add(gm); u.wid = wid; u.gp = BR.Models.gripPoints(wid); u.gunScale = 1.15;
  BR.Actor.prototype.syncMesh.call(fake, 0.016);
  return { fake, mesh };
};
// little rendered pictures of each outfit (full body) and mask (head), made once with a shared offscreen renderer
BR.CharIcons = {
  pics: {},
  get(cat, id) {
    const k = cat + ':' + id; if (this.pics[k] !== undefined) return this.pics[k];
    let url = null;
    if (BR.liteGL) return (this.pics[k] = null);       // limited browser: colour swatches instead of rendered pictures
    try {
      if (!this.r) {
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
        this.r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true }); this.r.setPixelRatio(1); this.r.setSize(128, 128, false); this.r.setClearColor(0, 0);
        const sc = this.sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x50586a, 1.1));
        const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(-1.5, 2.5, -2.5); sc.add(dl);
        this.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
      }
      clearTimeout(this.idle); this.idle = setTimeout(() => this.drop(), 4000);         // give the WebGL context back when idle
      const look = { o: cat === 'outfits' ? id : 'default', m: cat === 'masks' ? id : 'default', h: cat === 'hats' ? id : 'default' }, head = cat !== 'outfits';
      const fig = BR.charFigure(look, 'rifle'); fig.mesh.userData.gun.visible = !head;
      this.sc.add(fig.mesh); fig.mesh.updateMatrixWorld(true);
      const a = 0.5, c = this.cam;
      const hp = new THREE.Vector3(); fig.mesh.userData.head.getWorldPosition(hp); hp.y += 0.06;      // (the figure faces +Z)
      if (cat === 'hats') { c.position.set(hp.x + Math.sin(a) * 1.0, hp.y + 0.3, hp.z + Math.cos(a) * 1.0); c.lookAt(hp.x, hp.y + 0.1, hp.z); }
      else if (cat === 'masks') { c.position.set(hp.x + Math.sin(a) * 0.78, hp.y + 0.1, hp.z + Math.cos(a) * 0.78); c.lookAt(hp.x, hp.y + 0.03, hp.z); }
      else { c.position.set(Math.sin(a) * 3.7, 1.15, Math.cos(a) * 3.7); c.lookAt(0, 0.93, 0); }
      this.r.render(this.sc, c); url = this.r.domElement.toDataURL('image/png');
      this.sc.remove(fig.mesh);
    } catch (e) { url = null; }
    return (this.pics[k] = url);
  },
  drop() { if (this.r) { this.r.dispose(); if (this.r.forceContextLoss) this.r.forceContextLoss(); this.r = null; } },
};

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
    if (cat === 'finishers' || BR.CHAR_TABLES[cat]) { const T = cat === 'finishers' ? BR.FINISHERS : BR.CHAR_TABLES[cat](), out = {}; for (const k in T) if (!T[k].caseOnly || BR.Profile.owns(cat, k)) out[k] = T[k]; return out; }
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
    if (BR.CHAR_TABLES[cat]) return BR.CHAR_TABLES[cat]()[id];
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
    this.slot = 'outfits';
    $('shop-tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      this.cat = b.dataset.cat === 'character' ? this.slot : b.dataset.cat;
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
    $('shop-char').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; this.slot = this.cat = b.dataset.s; this.sel = this.equippedId(); BR.Audio.click(); this.render(); });
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
    if (BR.CHAR_TABLES[cat]) {
      const pic = BR.CharIcons.get(cat, id), hx = c => c === undefined ? '#555' : hex(c);
      const glow = it.glow !== undefined ? hex(it.glow) : it.eyeCol !== undefined ? hex(it.eyeCol) : 'transparent';
      const bg = cat === 'outfits' ? `linear-gradient(180deg,${hx(it.jacket)} 0 55%,${hx(it.pants)} 55% 88%,${hx(it.boots)} 88%)` : hx(it.base);
      return pic ? `<i class="sw chr${cat !== 'outfits' ? ' mk' : ''}" style="background-image:url(${pic}),radial-gradient(circle at 50% 60%,${glow === 'transparent' ? 'rgba(178,107,255,0.25)' : glow + '55'},transparent 70%)"></i>` : `<i class="sw" style="background:${bg}"></i>`;
    }
    if (cat === 'feeds') return `<i class="sw fd"><span class="kf feed-${id}">${BR.Ranks.badge(BR.Profile.data.rp || 0)}<b class="me">You</b><i>✕</i></span></i>`;
    return `<i class="sw ch">${id === 'none' ? '—' : '◆'}</i>`;
  }

  render() {
    const P = BR.Profile, cat = this.cat, items = Shop.catalog(cat, this.weapon), chr = !!BR.CHAR_TABLES[cat];
    document.querySelectorAll('#shop-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.cat === (chr ? 'character' : cat)));
    document.getElementById('shop-char').classList.toggle('hidden', !chr);
    document.querySelectorAll('#shop-char button').forEach(b => b.classList.toggle('sel', b.dataset.s === cat));
    const showWeps = cat === 'blueprints' || cat === 'skins' || cat === 'tracers' || cat === 'gloves';
    this.el.weps.classList.toggle('hidden', !showWeps);
    this.el.weps.classList.toggle('gl', cat === 'gloves' || cat === 'skins');
    if (cat !== 'gloves' && cat !== 'skins' && this.weapon === 'all') this.weapon = 'rifle';
    this.el.weps.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.w === this.weapon));
    this.el.coins.textContent = P.coinsLabel();
    const html = [];
    for (const id in items) {
      const it = items[id], own = P.owns(cat, id), eq = P.isEquipped(cat, id, this.weapon);
      const rr = BR.cosRarity(it), rar = rr ? `<span class="rar" style="--r:${RARITY[rr] || '#8d97a5'}">${rr}</span>` : '';
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
      character: chr ? BR.lookPreview(cat, this.sel) : null,
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
    this.slot = 'outfits';
    $('inv-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-cat]'); if (!b) return; this.cat = b.dataset.cat === 'character' ? this.slot : b.dataset.cat; this.sel = null; this.game.inspectReset(); this.render(); });
    $('inv-char').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; this.slot = this.cat = b.dataset.s; this.sel = null; this.game.inspectReset(); BR.Audio.click(); this.render(); });
    this.el.weps.addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (!b) return; this.weapon = b.dataset.w; this.sel = null; this.render(); });
    this.el.grid.addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (!c) return; this.sel = c.dataset.id; this.game.inspectReset(); this.render(); });
    // Melee: carry the bayonet, the karambit or the butterfly knife (one at a time)
    $('inv-melee').addEventListener('click', e => {
      const b = e.target.closest('button[data-m]'); if (!b) return;
      if (!BR.Profile.meleeUnlocked(b.dataset.m)) { BR.Audio.click(); this.cat = 'blueprints'; this.weapon = b.dataset.m; this.sel = null; this.flash(`${BR.CONFIG.weapons[b.dataset.m].name} unlocks at level ${BR.KNIFE_LEVEL[b.dataset.m]}`); this.render(); return; }
      const P = BR.Profile; P.data.equip.melee = b.dataset.m; P.save(); BR.Audio.pickup();
      this.cat = 'blueprints'; this.weapon = b.dataset.m; this.sel = null;
      this.flash(({ butterfly: 'Butterfly knife', knife: 'Karambit', bayonet: 'M9 Bayonet', tracker: 'Tracker' })[b.dataset.m] + ' equipped');
      this.game.refreshCosmetics(); this.render();
    });
    this.el.action.addEventListener('click', () => this.act());
    $('inv-back').addEventListener('click', () => this.close());
    { const ab = $('inv-attach'); if (ab) ab.addEventListener('click', () => { BR.Audio.click(); BR.Attach.open(BR.CONFIG.weapons[this.weapon] ? this.weapon : undefined); }); }      // v1.41
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
    for (const t of [M.SKINS, M.TRACERS, M.CHARMS, M.GLOVES, BR.FEEDS, BR.FINISHERS, BR.OUTFITS, BR.MASKS, BR.HATS]) n += Object.keys(t).filter(k => k !== 'default' && k !== 'none' && k !== 'signature').length;
    for (const w in M.BLUEPRINTS) n += Object.keys(M.BLUEPRINTS[w]).filter(k => k !== 'default').length;
    return (this._coll = n);
  }
  total() {
    const o = BR.Profile.data.owned; let n = 0;
    for (const k of ['skins', 'tracers', 'charms', 'gloves', 'feeds', 'finishers', 'outfits', 'masks', 'hats']) n += (o[k] || []).filter(x => x !== 'default' && x !== 'none' && x !== 'signature').length;
    return n + (o.blueprints || []).filter(x => !x.endsWith(':default')).length;
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
    const P = BR.Profile, cat = this.cat, items = this.items(), chr = !!BR.CHAR_TABLES[cat];
    document.querySelectorAll('#inv-tabs button').forEach(b => b.classList.toggle('sel', b.dataset.cat === (chr ? 'character' : cat)));
    document.getElementById('inv-char').classList.toggle('hidden', !chr);
    document.querySelectorAll('#inv-char button').forEach(b => b.classList.toggle('sel', b.dataset.s === cat));
    const showWeps = cat === 'blueprints' || cat === 'skins' || cat === 'tracers' || cat === 'gloves';
    this.el.weps.classList.toggle('hidden', !showWeps);
    this.el.weps.classList.toggle('gl', cat === 'gloves' || cat === 'skins');
    if (cat !== 'gloves' && cat !== 'skins' && this.weapon === 'all') this.weapon = 'rifle';
    this.el.weps.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.w === this.weapon));
    this.el.count.textContent = this.total() + ' / ' + this.collectible();
    const mel = P.melee();
    document.querySelectorAll('#inv-melee button').forEach(b => { b.classList.toggle('sel', b.dataset.m === mel); const lk = !BR.Profile.meleeUnlocked(b.dataset.m); b.classList.toggle('locked', lk); if (!b.dataset.name) b.dataset.name = b.textContent; b.textContent = lk ? '🔒 LV ' + BR.KNIFE_LEVEL[b.dataset.m] : b.dataset.name; });
    document.getElementById('inv-melee').classList.toggle('hidden', cat !== 'blueprints');
    if (!this.sel || !items[this.sel]) this.sel = items[this.equippedId()] ? this.equippedId() : Object.keys(items)[0] || null;
    const html = [];
    for (const id in items) {
      const it = items[id], eq = P.isEquipped(cat, id, this.weapon);
      const rr = BR.cosRarity(it), rar = rr ? `<span class="rar" style="--r:${RARITY[rr] || '#8d97a5'}">${rr}</span>` : '';
      const cls = it.rarity === 'Legendary' ? ' legend' : it.rarity === 'Mythic' ? ' mythic' : it.rarity === 'Exotic' ? ' exotic' : '';
      this.shop.weapon = this.weapon;
      html.push(`<button class="card${this.sel === id ? ' sel' : ''}${eq ? ' eq' : ''}${cls}" data-id="${id}">${this.shop.swatch(cat, id, it)}${rar}<span class="cn">${it.name}</span><span class="cp">${eq ? '✓ Equipped' : it.caseOnly ? 'Case drop' : 'Owned'}</span></button>`);
    }
    this.el.grid.innerHTML = html.length ? html.join('') : '<div class="inv-empty">Nothing here yet. Buy items in the Shop or open a Release Case.</div>';
    const it = items[this.sel];
    this.el.name.textContent = it ? it.name : '';
    this.el.rar.textContent = it && it.rarity ? it.rarity.toUpperCase() : '';
    this.el.rar.style.color = it && BR.cosRarity(it) ? RARITY[BR.cosRarity(it)] : '';
    this.el.sub.textContent = !it ? '' : cat === 'blueprints' ? BR.CONFIG.weapons[this.weapon].name + ' blueprint' : cat === 'skins' ? 'Camo · on ' + (this.weapon === 'all' ? 'every gun' : BR.CONFIG.weapons[this.weapon].name) : cat === 'tracers' ? 'Tracer · ' + BR.CONFIG.weapons[this.weapon].name : cat === 'gloves' ? 'Gloves' : cat === 'charms' ? 'Charm' : cat === 'outfits' ? 'Character outfit' + (it.grind && P.owns(cat, this.sel) ? ' · mastery' : '') : cat === 'masks' ? 'Character mask' : cat === 'hats' ? 'Character hat' : cat === 'finishers' ? 'Kill finisher' : 'Kill feed banner';
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
      character: chr ? BR.lookPreview(cat, this.sel) : null,
    });
  }
};
