# Velocity Royale: Blueprint

A browser FPS battle royale built for phones: movement-heavy, offline, you vs. bots.
"Velocity Royale" is a working title. Rename it in `src/hud.js` (menu) and in the `<title>` of `index.html` / `play.html`.

This doc explains how the prototype is built, where to tune it, and where new features plug in.

---

## 1. What's in the prototype

| Area | What it does now |
|---|---|
| **Match flow** | Menu → skydive from 75 m → loot → fight → shrinking zone → results screen (placement, kills, damage, time). |
| **Players** | You + 5–29 bots (default 19). Bots use the *same* movement and weapons as you. |
| **Movement** | Run, jump (coyote time + jump buffer), slide (speed boost, chain into a slide-jump), wall-run, wall-jump, mantle ledges up to 1.75 m, auto-vault obstacles up to 1.25 m, auto step-up stairs, Quake-style air control that keeps momentum, skydive steering. |
| **Weapons** | Pistol, SMG, Shotgun, Rifle, Sniper (scoped). Hitscan, spread + bloom, headshots, damage falloff, recoil, reload, 2 weapon slots, 3 ammo types. |
| **Loot** | Ground loot in 3 tiers (open field < buildings < roofs/towers). Ammo, heals and shields are picked up automatically. Weapons fill empty slots automatically; when both slots are full you get a Swap button. Dead players drop everything. |
| **Zone** | 6 phases. Next circle shown on the minimap. Damage ignores shields and ramps 1 → 15 HP/s. |
| **Map** | Procedural, new seed every match: 6 towns (enterable 1–2 floor buildings with stairs, windows you can vault through, climbable roofs), wall-run lanes, spiral jump towers, plateaus, containers, crates, rocks, trees. |
| **Bots** | Easy/Normal/Hard. Loot early, hunt later, follow the zone, hear gunfire, react to damage, strafe, jump and slide in fights, pick a weapon by range, swap to better loot, get unstuck. |
| **Mobile controls** | Floating joystick (left), drag-to-look (right), drag *on* the Fire button to aim while shooting, second Fire button on the left, Jump / Slide / Reload / Aim buttons, tap weapon slots to switch. Optional aim assist and auto-fire. |
| **Desktop controls** | WASD, mouse look (pointer lock, or drag-to-look in embeds), Space, Shift/C, R, 1/2/Q, E, Esc. |
| **Feel** | Speed-based FOV, wall-run camera roll, landing dip, head bob, gun sway/kick/reload animation, hitmarkers, damage numbers, directional damage arcs, kill feed, synthesized sound effects (no audio files). |
| **Settings** | Difficulty, player count, look speed, graphics (render scale + fog distance), volume, aim assist, auto-fire, FPS counter. Saved per device. |

---

## 2. How to playtest

**On your phone (fastest):** open the Artifact link Claude published. Hold the phone sideways and tap **Drop in**.

**Locally:** any static file server works:
```bash
python3 -m http.server 8000
# open http://localhost:8000 (or http://<your-computer-ip>:8000 on your phone, same Wi-Fi)
```

**GitHub Pages (permanent phone link):** repo Settings → Pages → deploy from branch → root. `index.html` is the entry point.

**Automated check** (movement + a full bots-only match, headless):
```bash
node tools/smoke-test.js
```

---

## 3. Architecture

No build step and no framework, just plain scripts that share one global namespace, `BR`. Three.js r128 is vendored in `lib/` so the game makes no network calls apart from Google Fonts, which is optional.

```
index.html / play.html   entry pages (play.html = same thing, wrapped by the claude.ai artifact viewer)
lib/three.min.js         Three.js r128 (MIT)
src/
  config.js     ← ALL tuning numbers (movement, weapons, loot tables, zone, bots, graphics)
  util.js       RNG, math, ray tests, safe localStorage
  world.js      procedural map, box collision grid, raycasts, map mesh, minimap image
  movement.js   BR.Mover: character controller shared by player and bots
  weapons.js    BR.Weapons: fire / reload / spread / hitscan resolution
  actors.js     BR.Actor: health, shield, inventory, body mesh
  bot.js        BR.BotBrain: AI that writes into an Actor's input each frame
  loot.js       BR.Loot: floor items, auto-pickup, swap, death drops
  zone.js       BR.Zone: shrinking circle + damage
  effects.js    pooled tracers, impacts, muzzle flashes
  input.js      touch + keyboard/mouse -> one input state
  hud.js        builds all DOM (menu, HUD, buttons), updates only on change
  game.js       BR.Game: renderer, match lifecycle, main loop, camera, viewmodel, combat hooks
  main.js       boot + settings wiring
  style.css     HUD/menu styles
tools/smoke-test.js   headless regression test
```

**Script order matters** (see `index.html`): config → util → audio → world → movement → weapons → actors → bot → loot → zone → effects → input → hud → game → main. If you add a file, add it to **both** `index.html` and `play.html`.

### The one big idea: everything is an axis-aligned box

Every solid object is a box `{x0,y0,z0,x1,y1,z1}` stored in a 2D grid (8 m cells). This keeps the whole game cheap enough for phones:

- **Collision** (`Mover.moveAxis`): move one axis at a time, push out of any overlapping box. Sub-steps stop fast movement from passing through walls.
- **Hitscan** (`World.raycast`): walk the grid cells along the ray, slab-test the boxes in each cell.
- **Rendering** (`World.buildMeshes`): all boxes merged into **one** mesh with vertex colors, which is one draw call for the whole map.

Limitation: no slopes or rotated walls. Ramps can be built from steps (see the stairs and the plateau). If you need real slopes later, add a heightfield or a ramp primitive to `Mover`.

### Frame loop (`Game.update`)
1. `controlPlayer`: input → `player.input` + look (+ aim assist / auto-fire)
2. `bot.brain.update` → each bot's `input`, `yaw/pitch`, `fireHeld`
3. `actor.update` → `Mover.update` (movement) + weapon timers + fire
4. pickups (≈8×/s per actor), zone damage, body cleanup
5. effects, camera, viewmodel, HUD
6. win/lose check → results screen

### Player and bots are the same thing
`BR.Actor` has an `input` object (`mx, mz, jump, slide`), `yaw/pitch` and `fireHeld`. The player's are filled from the touchscreen. A bot's are filled by `BotBrain`. **Any new ability you add to `Mover` or `Weapons` automatically works for bots**; you only need to teach the brain *when* to use it.

---

## 4. Where to tune (all in `src/config.js`)

| Want to change… | Edit |
|---|---|
| How fast / floaty movement feels | `move.runSpeed`, `gravity`, `jumpSpeed`, `accelAir` |
| Slide strength / length | `move.slideBoost`, `slideFriction`, `slideMaxTime` |
| Wall-run | `move.wallRunGravityScale`, `wallRunMaxTime`, `wallRunSpeedSustain`, `wallJumpOut/Up` |
| Climbing | `move.mantleHeight`, `vaultHeight`, `stepHeight` |
| Weapon balance | `weapons.<id>` (dmg, rpm, mag, spread, range, head multiplier, recoil, zoom) |
| Loot rarity | `loot.tables` (3 tiers, relative weights) |
| Match length | `zone.phases` (wait/shrink seconds, radius, damage) |
| Bot skill | `difficulty.<level>` (reaction, aimError, settle, turnRate, viewDist, playerDamageMult) |
| Bot pacing | `match.botLootPhase`, `match.botVsBotDamage` |
| Phone performance | `graphics.<level>.pixelRatio`, `fogFar`; map density in `World.generate()` |
| Touch look speed | `look.touch`, `look.adsMult`, `look.aimAssist` |

---

## 5. Adding your unique features

Pick the closest hook:

| Feature type | Hook |
|---|---|
| **New movement ability** (dash, grapple, double jump, slam, jetpack…) | Add state + config to `BR.Mover`. Add a button in `hud.js` with `data-act="yourAct"`, consume it in `Game.controlPlayer` (`inp.consume('yourAct')`), and pass it through `actor.input`. Raise a `mover.events.yourAct` flag for sound/FX in `Game.playerEvents`. |
| **New weapon** | Add an entry to `CONFIG.weapons`, add it to `loot.tables`, and add a `PREF_DIST` entry in `bot.js`. The viewmodel is generated from `color`/`len`. Special behavior (projectiles, charge-up) goes in `BR.Weapons.tryFire`. |
| **Abilities / gadgets / consumables** | New loot `kind` in `loot.js` (`spawnKind`, `buildMesh`, `autoPickup`), effect applied on the Actor. |
| **On-hit / on-kill effects** (e.g. kills refill shield, momentum = damage) | `Game.applyDamage` and `Game.kill`. |
| **Zone variants** (moving zone, multiple zones, gravity zones) | `BR.Zone` |
| **Map features** (jump pads, zip lines, vehicles, destructibles) | New generator in `World.generate()`. Use a box `tag` for special behavior and check `tag` in `Mover.moveAxis` (e.g. `tag: 'jumppad'` → set `vel.y`). |
| **Bot behavior** | `BotBrain.think()` (decisions, ~4×/s) and `fight()` / `steerTo()` (per frame). |
| **HUD** | Markup in the `HUD` constructor, update in `HUD.update` using `this.set(key, el, value, fn)` so the DOM only changes when a value does. |

---

## 6. Known limitations / next steps

- **Bots:** no pathfinding. They steer straight, jump at walls and detour when stuck, so they can get trapped inside buildings. Next: waypoint graph per town + door nodes.
- **Bots:** they don't retreat to heal or use cover. Next: a "low health → break line of sight → heal" state.
- **Hitboxes:** an axis-aligned body box plus a head sphere, not rotated. Fine at this scale.
- **No spectate mode** after death; the camera orbits your body.
- **No progression, cosmetics, or persistence** beyond settings.
- **Performance:** tested in headless Chromium (≈0.1 ms per simulation step for 20 players). On older phones, use Graphics: Low and fewer players.
- **iOS Safari** doesn't allow true fullscreen for web pages. Add the page to the home screen for a fuller screen.
- **Audio** is synthesized placeholders; swap in real samples later via `BR.Audio`.
