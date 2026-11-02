# Velocity Royale: Blueprint

A browser FPS battle royale built for phones: movement-heavy, offline, you vs. bots.
"Velocity Royale" is a working title. Rename it in `src/hud.js` (menu) and in the `<title>` of `index.html` / `play.html`.

This doc explains how the prototype is built, where to tune it, and where new features plug in.

---

## 1. What's in the prototype

| Area | What it does now |
|---|---|
| **Match flow** | Menu → freefall from 110 m (press Jump to open your parachute; it opens by itself about 22 m above the ground) → loot → fight → shrinking zone → results screen (placement, kills, damage, time, coins earned). |
| **Menu** | A live bot match plays behind the menu, filmed by a cinematic camera that cuts between chase, orbit, side, low and fly-over shots of whoever is fighting, behind letterbox bars, scanlines and film grain. Chrome pixel logo, beveled buttons, coin counter. (`Game.updateDemo`) |
| **Practice** | Menu → **Practice**: no bots, no storm, start at a movement hub, respawn on death. The **Spawn** button (B) gives any gun with full ammo, items, chests, standing or moving dummies (never shoot), combat bots (shoot back), a 110 m skydive, or a teleport. |
| **Players** | You + 0–39 bots (default 29). 0 bots in Settings also gives a bot-free match. Bots use the *same* movement and weapons as you. |
| **Movement** | Run, jump (coyote time + jump buffer), **one Crouch/Slide button** (slide only when running; omni-directional, locked direction while sliding; crouch toggle otherwise), wall-run, wall-jump, mantle ledges up to 1.75 m, auto-vault up to 1.25 m, auto step-up stairs, **grapple** (5 s cooldown; hooks walls, ground, trees and players), **jump pads**, Quake-style air control, skydive steering. |
| **Weapons** | **Karambit** (always carried: slash, lunge, backstab, CS-style deploy that twirls twice around the finger ring, inspect twirl, +8% move speed), Pistol, SMG, **Breacher** shotgun (8-pellet horizontal line, shell-by-shell reload you can cancel by firing, strong blast jump), **Rifle** and **Holo AR** (both suppressed with drum mags; Holo AR has a holographic sight that lines up when aiming), scoped Sniper. Automatic rifles have randomized recoil (vertical kick varies and the horizontal kick drifts on a random walk; aiming tames it). Every gun without an optic has iron sights (or an open red dot on the SMG) that line up with screen center when aiming; muzzle flash is hidden and kick softened while aiming. Tracers are glowing streaks that travel to the impact point in your tracer color. Dropped guns and bots' guns show the real models. Hitscan, spread + bloom, headshots, falloff, recoil, 3 ammo types. Suppressed guns are quieter and bots hear them from less than half as far. |
| **Weapon models** | Detailed placeholder models built from primitives in `src/models.js` (rails, vents, suppressors, drum mags, scopes, holo frame + glowing reticle, curved karambit blade with finger ring). Each model exposes `muzzle`, `charm`, `flash` (and `sight`) anchors so real assets can replace them later. |
| **Accounts** | Sign up / sign in on the menu (salted SHA-256 password hashes, stored on the device). Coins, cosmetics and stats are per account; signed-out players are Guest. Built-in dev accounts (`CONFIG.seedAccounts`, stored as salted password hashes) exist on every device with infinite coins and every shop item. Redeeming the private dev code (`CONFIG.devCodeHash` is its hash) gives the same to any one account. `src/accounts.js` documents the server API to swap in when the game goes online, so coins and dev access become server-authoritative. |
| **Crosshair** | Settings → Crosshair: presets (cross, cross+dot, dot, circle, T), 7 colors, length, thickness, gap, opacity, center dot, outline, and whether spread moves it. Live preview. |
| **Speed effects** | Speed lines and a cool edge glow fade in once you're well past running speed (slide-hops, grapple, pads, freefall). |
| **First person** | Gloved arms hold every weapon (right hand on the grip, left on the foregrip/pump). Spring-driven motion: look sway, figure-eight bob, sprint pose, air tilt, landing bounce, recoil kicks that settle. Full reloads (mag drops, hand to pouch, new mag, slap, charging handle), shell-by-shell shotgun loading, gun inspects, alternating knife slashes, overshoot draws, and the karambit's CS-style deploy (two twirls around the finger, which stays in the ring). `src/viewmodel.js` |
| **Coins + shop** | Earn coins per kill, damage, top-10 / top-5 / win (`CONFIG.coins`). Shop tabs: **Blueprints** (two original designs per weapon with their own geometry and glow, e.g. Vandal, Dragon's Breath, Executioner, Cyber Sentinel, plus Fade and Doppler karambits; pick a weapon with the chips), **Camos** (9 patterns that recolor any weapon or blueprint body), **Tracers** (8 colors + rainbow, glowing), **Charms** and **Gloves** (9 designs for the first-person hands). Live 3D preview. Saved per device (`src/shop.js`). |
| **Loot** | 3 tiers (open field < buildings < roofs/towers). A guaranteed gun on every building floor, plus guns on roofs, rock tops, wall-run lane tops and pillar-maze tops. **Chests** (≈45 per map) burst into a gun one tier above the spot plus gear. Ammo, heals and shields auto-pickup; weapons fill empty slots or offer a Swap button. Dead players drop everything. |
| **Zone** | 6 phases. Next circle shown on the minimap. Damage ignores shields and ramps 1 → 15 HP/s. |
| **Map** | 640 m × 640 m (≈4× v0.3) with **12 named locations** of 4 kinds: towns, container yards with cranes, plateau outposts with watchtowers, and movement "relays". Long rock ridges split it into regions. Corner minimap zooms around you; tap it (or M) for the full map with names. Entering a location shows its name. Procedural, new seed every match: 6 towns (1–2 floor buildings with stairs, vaultable windows, rooftop parapets, trim, lamp posts, a jump pad on each town edge), **parkour courses** (rising platforms + a wall-run wall + a summit chest), **pillar mazes** for wall chains, ~30 jump pads, wall-run lanes, spiral towers, plateaus, fences. Visuals: gradient sky dome + sun, mountain ring, clouds, two-tone trees, bushes, grass tufts (density follows Graphics), painted grass/dirt ground with dirt roads between towns, fake ambient occlusion on walls. |
| **Bots** | Easy/Normal/Hard (Easy is much gentler now). Loot early, hunt later, follow the zone, hear gunfire, react to damage, strafe, jump and slide in fights, pick a weapon by range, fall back to the karambit when out of ammo, swap to better loot, get unstuck. |
| **Mobile controls** | Floating joystick (left), drag-to-look (right), drag *on* the Fire button to aim while shooting, a second Fire button that only fires (dragging it never turns the camera), Jump / Crouch-Slide / Hook / Reload / Aim / Swap / Knife buttons (Knife jumps to the karambit and back), 3 weapon slots (tap the held one to inspect). Optional aim assist and auto-fire. |
| **HUD editor** | Menu or pause → *Customize HUD*: drag, resize or hide every HUD control: action buttons, each weapon slot, the pickup/open button, minimap, pause and spawn. Set button opacity. Saved separately for landscape and portrait. Built for claw setups. (`src/layout.js`) |
| **Fullscreen** | Button in the menu and in-game. On iPhone Safari it explains *Share → Add to Home Screen*, which launches fullscreen. |
| **Movement tech** | Deliberate "bugs" with a skill ceiling. See section 5b. |
| **Desktop controls** | WASD, mouse look, Space jump, Shift/C crouch-slide, G or middle-click grapple, R, 1/2/3/Q, V inspect, E, Esc. |
| **Look** | Clean modern UI: dark frosted-glass panels, hairline borders, soft radii, Saira condensed type, one amber accent, slim health/shield bars, round translucent touch buttons. |
| **Settings** | Bot skill, bot count (0–29), look speed, **FOV (60–110)**, graphics, volume, aim assist, auto-fire, FPS counter. Saved per device. |
---

## 2. How to playtest

**On your phone (fastest):** open the Artifact link Claude published. Hold the phone sideways and tap **Play**.

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
  models.js     weapon models, blueprints, camos, gloves/hands, charms, tracer colors
  viewmodel.js  first-person gun + arms, spring animation, reloads, draws, inspects
  shop.js       coin profile + shop UI
  accounts.js   local accounts, password hashing, dev code (server API documented inside)
  layout.js     HUD button editor + fullscreen helper
  hud.js        builds all DOM (menu, HUD, buttons), updates only on change
  game.js       BR.Game: renderer, match lifecycle, main loop, camera, viewmodel, combat hooks
  main.js       boot + settings wiring
  style.css     HUD/menu styles
tools/smoke-test.js   headless regression test
```

**Script order matters** (see `index.html`): config → util → audio → world → movement → weapons → models → viewmodel → actors → bot → loot → zone → effects → input → layout → accounts → shop → hud → game → main. If you add a file, add it to **both** `index.html` and `play.html`.

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

## 5b. Movement tech (intentional exploits)

All of these live in `BR.Mover` (`src/movement.js`, search `TECH`) and are tuned in `CONFIG.move.tech`. Each one raises `mover.events.tech`, which flashes a callout under the crosshair. Bots get the same physics but don't use the tricks on purpose.

| Tech | How to do it | Why it works |
|---|---|---|
| **Bunny hop** | Press Jump right as you land (holding does nothing) | A jump within `bhopWindow` of landing (or buffered just before) restores the speed you had at touchdown. Mistime it and ground friction keeps what it took. |
| **Slide-hop** | Slide → Jump → press Crouch in the air → repeat | A slide that starts within `slideHopWindow` of landing ignores the slide cooldown and its speed cap, so each chain stacks up to `maxSpeed` (20 m/s). |
| **Super jump** | Tap Jump right as a slide starts | Jumping within `superJumpWindow` of a slide start multiplies jump speed by `superJumpMult`. `superJumpCooldown` (6 s) between uses, shown on the Crouch button. |
| **Wall chain** | Wall-jump onto a *different* wall | A new wall resets the wall-run timer. Each bounce gains height (pillar mazes and wall-run lanes are built for this). |
| **Mantle boost** | Tap Jump while climbing a ledge | Launches you up and forward at run speed + `mantleBoost` once you clear the edge. |
| **Shotgun jump** | Fire the Breacher at your feet, or mid-air | Aimed down: a vertical launch of up to ~5 m plus a shove. Mid-air: blasts you away from your aim ("AIR BLAST"). Blast ring + screen shake. The sniper does a smaller version. |
| **Grapple slingshot** | Grapple, then Jump before you arrive | Letting go early keeps the full reel-in speed plus a hop. Arriving normally tames the speed so you land on the roof. |
| **Launch** | Land on a cyan jump pad | `padSpeed` straight up, horizontal speed kept, so chain it with a slide for distance. |

To add another: put the trigger in `Mover.update`, set `ev.tech = 'NAME'`, add its numbers to `CONFIG.move.tech`, and add a check to `tools/smoke-test.js`.

## 6. Known limitations / next steps

- **Bots:** no pathfinding. They steer straight, jump at walls and detour when stuck, so they can get trapped inside buildings. Next: waypoint graph per town + door nodes.
- **Bots:** they don't retreat to heal or use cover. Next: a "low health → break line of sight → heal" state.
- **Hitboxes:** an axis-aligned body box plus a head sphere, not rotated. Fine at this scale.
- **No spectate mode** after death; the camera orbits your body.
- **No progression, cosmetics, or persistence** beyond settings.
- **Performance:** tested in headless Chromium (≈0.1 ms per simulation step for 20 players). On older phones, use Graphics: Low and fewer players.
- **iOS Safari** doesn't allow true fullscreen for web pages. *Add to Home Screen* runs it fullscreen (the fullscreen button explains this).
- **Bots** skip loot and chests more than 2.5 m above them (no pathfinding), so roof and tower loot is player-only for now.
- **Audio** is synthesized placeholders; swap in real samples later via `BR.Audio`.

---

## 7. One-file build (for hosting anywhere)

`node tools/build-single.js` writes `dist/index.html`, the entire game in a single ~740 KB file with no other files needed. Upload it to any static host to get a normal browser link (works in iOS Safari):

- **Netlify Drop:** go to app.netlify.com/drop, upload the file (or a folder containing it), and you get an `https://….netlify.app` link. A free account keeps the link alive.
- **GitHub Pages:** once the repo is pushed, Settings → Pages → deploy from branch, root folder. The site URL serves the root `index.html`.

Re-run the build after every change.
