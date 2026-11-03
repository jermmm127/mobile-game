# Velocity Royale: Blueprint

A browser FPS battle royale built for phones: movement-heavy, offline, you vs. bots.
"Velocity Royale" is a working title. Rename it in `src/hud.js` (menu) and in the `<title>` of `index.html` / `play.html`.

This doc explains how the prototype is built, where to tune it, and where new features plug in.

---

## 1. What's in the prototype

| Area | What it does now |
|---|---|
| **Match flow** | Menu → freefall from 110 m (press Jump to open your parachute; it opens by itself about 22 m above the ground) → loot → fight → shrinking zone → results screen (placement, kills, damage, time, coins earned). **One life:** if you die you're out (no respawn) and **Queue New Match** sends you through a matchmaking screen ("Finding match", players filling up) into a fresh match. Play from the menu uses the same queue. |
| **Menu** | Modern layout over a live bot match filmed by a cinematic camera: the compact logo with a season tag, three glass **mode cards** (a big orange Battle Royale PLAY hero card with a sheen, a blue/red split 1v1 Duel card and a green Practice card), and a dock with Shop (NEW tag), Settings, HUD and Fullscreen. Account chip and coins sit top right. Portrait stacks the cards. |
| **1v1 Duel** | Menu → **1v1 Duel**: you against one bot (Easy / Medium / Hard), first to 3, 5 or 7 rounds, with 60, 90 or 120 s rounds. Pick a primary and a secondary gun; the karambit, stim and grapple always come with you. Every round both players get 100 HP + 50 shield and full ammo, there's a frozen 3-2-1 countdown, then you fight until one dies. If time runs out, whoever has more HP + shield wins the round (equal is a draw). After each round a loadout screen lets you change guns (auto-ready after 12 s), and you swap ends every round. The bot always hunts you with a random loadout. The end screen shows the final score, and **Rematch** reruns the same settings. Coins: kills, damage and the win. Code: `Game.startDuel / startRound / updateDuel / endRound / endDuel` in `src/game.js`, the duel branch of `BotBrain.think`, and the menu in `main.js` (`BR.openDuelMenu`). |
| **Duel arena: The Yard** | `World.generateArena` (52 × 34 m, mirrored blue/red ends): tall perimeter walls with barbed wire, painted spawn boxes, spawn cover walls, a central two-level platform with stairs from both sides and cover on top, raised side catwalks with railings reached by jump pads, four wall-run walls flanking the mid lane, wall-chain pillars, crates and corner floodlights. Concrete ground. Everything is grappleable. |
| **Practice** | Menu → **Practice**: no bots, no storm, start at a movement hub, respawn on death. The **Spawn** button (B) opens a menu (close it with the ✕ in its top-right corner or Back to Practice) that gives any gun with full ammo, items, chests, standing or moving dummies (never shoot), combat bots (shoot back), a 110 m skydive, or a teleport. |
| **Players** | You + 0–39 bots (default 29). 0 bots in Settings also gives a bot-free match. Bots use the *same* movement and weapons as you. |
| **Movement** | Run, jump (coyote time + jump buffer), **one Crouch/Slide button** (slide only when running; omni-directional, locked direction while sliding; crouch toggle otherwise), wall-run, wall-jump, mantle ledges up to 1.75 m, auto-vault up to 1.25 m, auto step-up stairs, **grapple** (5 s cooldown; hooks walls, ground, trees and players), **jump pads**, Quake-style air control, skydive steering. |
| **Weapons** | **Karambit** (always carried: slash, lunge, backstab, CS-style deploy that twirls twice around the finger ring, inspect twirl, **+20% move speed while held**; held CS-style: both gloved fists sit low in view with the backs of the hands toward you. The right fist holds the handle across, with the ring on the inner side by the index finger, and the blade comes out the outer side sweeping up-right with the hook curving up. The left fist is empty. For the pull-out and inspect, CS:GO-style, the knife turns edge-on so its ring lines up with the index finger and flips forward over the top of the finger (the pull-out flip happens out to the right of the screen), then the fist closes back onto the handle in the final pose.), Pistol, SMG, **Breacher** shotgun (8-pellet horizontal line, shell-by-shell reload you can cancel by firing, strong blast jump), **Rifle** (an AK-pattern battle rifle in black polymer: slotted muzzle brake, thin barrel with a fin front sight, long flat-topped handguard with window slots and chrome edge lines over a tapered lower panel, rounded dust cover, raised rear sight, side charging handle and selector lever, a 30-round-look banana mag that curves forward with a ribbed spine and orange follower, raked pistol grip, angular fixed stock with recessed panels and an orange toe line; side profiles are drawn on a 2D grid and extruded, `BUILD.rifle`) and **Holo AR** (a suppressed flat-top carbine in black: long flat-sided suppressor with rounded edges and three angled grooves, slim handguard with a top slot and fin front sight, flat-top receiver with seam lines, straight box mag with ribs, raked grip, angular stock with an under-notch and recessed panels. Clean holographic sight: low mount, slim body, a one-piece rounded hood with a thin frame and a clear window, a crisp red ring + centre dot with a soft glow, lined up when aiming; `BUILD.holoar`. `BUILD.ar` keeps the old drum-mag build.), scoped heavy **bolt-action** Sniper (tan, bipod, skeleton stock), and the **Hunting Rifle** (lightweight bolt-action with open iron sights, a buckhorn rear and bead front: 78 dmg, 5 rounds, +5% move speed, very tight hip-fire that moving or jumping barely affects, so it's made for no-scopes). The Sniper has a big visible recoil (`kick: 3.5`): the view punches up and rolls, then springs back to where you were aiming, and the gun slams back. Every gun has a small view punch scaled by its recoil. Both bolt guns cycle after every shot: your right hand leaves the grip, lifts the bolt, pulls it back, drives it home and returns, with the bolt modelled as a moving part (`ud.bolt` in `models.js`, `boltT` in `viewmodel.js`). The Rifle and SMG kick noticeably harder. Automatic rifles have randomized recoil (vertical kick varies and the horizontal kick drifts on a random walk; aiming tames it). Every gun without an optic has iron sights (or an open red dot on the SMG) that line up with screen center when aiming; muzzle flash is hidden and kick softened while aiming. Tracers are glowing streaks that travel to the impact point in your tracer color. Dropped guns and bots' guns show the real models. Hitscan, spread + bloom, headshots, falloff, recoil, 3 ammo types. Suppressed guns are quieter and bots hear them from less than half as far. |
| **Weapon models** | Detailed placeholder models built from primitives in `src/models.js` (rails, vents, suppressors, drum mags, scopes, holo frame + glowing reticle, curved karambit blade with finger ring). Each model exposes `muzzle`, `charm`, `flash` (and `sight`) anchors so real assets can replace them later. |
| **Accounts** | Sign up / sign in on the menu (salted SHA-256 password hashes, stored on the device). Coins, cosmetics and stats are per account; signed-out players are Guest. Built-in dev accounts (`CONFIG.seedAccounts`, stored as salted password hashes) exist on every device with infinite coins and every shop item. Redeeming the private dev code (`CONFIG.devCodeHash` is its hash) gives the same to any one account. `src/accounts.js` documents the server API to swap in when the game goes online, so coins and dev access become server-authoritative. |
| **Crosshair** | Settings → Crosshair: presets (cross, cross+dot, dot, circle, T), 7 colors, length, thickness, gap, opacity, center dot, outline, and whether spread moves it. Live preview. |
| **Speed effects** | Speed lines and a cool edge glow fade in once you're well past running speed (slide-hops, grapple, pads, freefall). |
| **First person** | Gloved arms hold every weapon (right hand on the grip, left on the foregrip/pump). Spring-driven motion: look sway, figure-eight bob, sprint pose, air tilt, landing bounce, recoil kicks that settle. Full reloads (mag drops, hand to pouch, new mag, slap, charging handle), shell-by-shell shotgun loading, gun inspects, alternating knife slashes, overshoot draws, and the karambit's CS-style deploy (two twirls around the finger, which stays in the ring). `src/viewmodel.js` |
| **Coins + shop** | Earn coins per kill, damage, top-10 / top-5 / win (`CONFIG.coins`). Shop tabs: **Blueprints** (**Mythic** tier (18): Dragon Lord, Quantum, Synthwave, Volcano, Thunderstrike, Phantom, Kitsune, Sapphire and Black Pearl, plus Neon Viper rifle, Solar Flare Holo AR, Glitch SMG, Frostbite shotgun, Celestial sniper, Aurora hunting rifle, Plasma Core pistol, and Gamma Doppler and Ruby karambits. These have chrome bodies and animated parts: spinning energy rings, a rotating sun disc, flickering flames, glitching cubes, swirling ice, orbiting stars, an aurora veil and a pulsing plasma core, plus hue-cycling glow and a rainbow card in the shop (`MYTHIC` + `BR.Models.animate`). Plus two Epic/Legendary designs per weapon with their own geometry and glow, e.g. Obsidian Edge, Dragon's Breath, Executioner, Cyber Sentinel, plus Fade and Doppler karambits; pick a weapon with the chips), **Camos** (18 patterns. New: Damascus, Cotton Candy, Dragonscale, Hyper Beast, Blood Moon, plus animated Mythics: Overclock circuits, Electric Storm, Molten Core lava and a shimmering Prism), **Tracers** (8 colours + rainbow, plus styled tracers: Solar Flare / Toxic Venom two-tone, Plasma Helix / Prism Helix twin spirals, Dragon's Breath / Stardust sparkler trails, Thunderstrike / Void Bolt flickering lightning), **Charms** and **Gloves** (16 designs. New flashy ones have glowing knuckles, cuffs and seams, and several have animated glowing textures: Vice, Wyvern, Crimson Web, Overclock, Magma Fist, Storm Caller, Prismatic). Live 3D preview. Saved per device (`src/shop.js`). |
| **Loot** | 3 tiers (open field < buildings < roofs/towers). A guaranteed gun on every building floor, plus guns on roofs, rock tops, wall-run lane tops and pillar-maze tops. **Chests** (≈45 per map) burst into a gun one tier above the spot plus gear. Ammo, heals and shields auto-pickup; weapons fill empty slots or offer a Swap button. Dead players drop everything. |
| **Zone** | 6 phases. Next circle shown on the minimap. Damage ignores shields and ramps 1 → 15 HP/s. |
| **Map detail** | A dressing pass (`World.dress`, own RNG so the layout per seed doesn't change) adds the following. Buildings get window and door frames, sills, mullions, shutters with louvres, flower boxes, striped awnings, shop signs, drain pipes, rooftop AC units (solid cover), vents, antennas, sidewalks with curbs, and inside rugs, tables and chairs, shelves, baseboards and ceiling lights. Towns get parked cars (solid cover, with windows, lights and wheels), power poles with wires, benches, bins and hydrants. Containers get corrugation ribs and door bars, and yards get oil drums, pallets and a forklift. Rocks get moss caps and loose boulders. Open country gets fallen logs, stumps, ponds with shores, lily pads and reeds, pine trees, wildflower patches, and a natural grass ground texture. The tiniest details are skipped on Graphics: Low. |
| **Look pass** | MSAA anti-aliasing on, bevelled (rounded-edge) boxes for weapon parts in first person and the shop and for character torso pieces, smooth-shaded tree canopies and bushes, and a slightly warmer sun. Aiming pulls every sight about 22% closer to your eye. Characters' hips twist, drop and shift with each stride while the shoulders counter-rotate. Run speed is 6.9 m/s (was 7.4). The built-in dev account sits at #1 on the leaderboard (Predator). |
| **Performance (60 fps target)** | **Tiled world:** the world geometry is split into 128 m tiles and all instanced scenery (trees, bushes, grass, flowers, rocks, props) into 320 m tiles with real bounds, so the GPU skips off-screen tiles and `World.cullChunks` hides tiles past the fog each frame. **Cheaper scenery:** tree canopies are one merged geometry per tree (about 160 triangles instead of 400), bushes are low-poly, drums, logs and stumps use two-tone vertex colours, and the ground mesh has fewer segments. **Bots:** each bot's parts are merged per joint and material (about 33 down to 23 meshes). **Loot:** drawn within 50 m. A 30-player match is about 110-130 draw calls (was about 500 at worst while tuning). **Adaptive resolution:** `Game.adaptResolution` lowers the render scale (down to 55%) when frames drop, creeps back up after 8 s of smooth frames, and never goes past the last level that stuttered (that cap relaxes after 30 s calm). The HUD stays full resolution. The FPS counter shows the render scale when it's below 100%. |
| **Island** | The battle royale map is an open island like Fortnite: no box walls (an invisible boundary plus the storm keep you in), an irregular sandy coastline sloping into an animated ocean, and distant islands and mountains. Ridges, rocks and ledges are drawn as jagged moss-topped boulder formations over their collision boxes, and plateaus get rocky skirts. |
| **Map** | 640 m × 640 m (≈4× v0.3) with **12 named locations** of 4 kinds: towns, container yards with cranes, plateau outposts with watchtowers, and movement "relays". Long rock ridges split it into regions. Corner minimap zooms around you; tap it (or M) for the full map with names. Entering a location shows its name. Procedural, new seed every match: 6 towns (1–2 floor buildings with stairs, vaultable windows, rooftop parapets, trim, lamp posts, a jump pad on each town edge), **parkour courses** (rising platforms + a wall-run wall + a summit chest), **pillar mazes** for wall chains, ~30 jump pads, wall-run lanes, spiral towers, plateaus, fences. Visuals: gradient sky dome + sun, mountain ring, clouds, two-tone trees, bushes, grass tufts (density follows Graphics), painted grass/dirt ground with dirt roads between towns, fake ambient occlusion on walls. |
| **Characters** | Low-poly humanoids built from joints: hips, thighs, knees, boots, abdomen, chest + vest, backpack, neck, head with helmet and visor, shoulders, elbows and gloved hands. **Two-bone IK** puts the right hand on the grip and the left on the foregrip of the gun they're holding (`solveArm` in `src/actors.js`). Run cycle with knee bend, crouch, jump tuck, slide (lead leg out, lean back), parachute (hands on the risers), freefall spread. |
| **Smooth aim (both sides)** | Remote players' bodies, upper-body twist, head and gun all ease toward the aim instead of snapping. Bot aim accelerates and decelerates toward its target (capped at the difficulty's turn rate, no overshoot) and its aim error drifts rather than jumping. For you: Settings → **Aim Smoothing** (0 = raw input) filters touch/mouse look. |
| **Bots** | Easy/Normal/Hard. Easy bots are very gentle: slow reactions (1.6 s), wide aim error, short bursts with long pauses, a short sight range (35 m) and only 22% damage to you. Loot early, hunt later, follow the zone, hear gunfire, react to damage, strafe, jump and slide in fights, pick a weapon by range, fall back to the karambit when out of ammo, swap to better loot, get unstuck. |
| **Mobile controls** | Floating joystick (left), drag-to-look (right), drag *on* the Fire button to aim while shooting, a second Fire button that only fires (dragging it never turns the camera), Jump / Crouch-Slide / Hook / Reload / Aim / Swap / Knife buttons (Knife jumps to the karambit and back), 3 weapon slots (tap the held one to inspect). Optional aim assist and auto-fire. |
| **HUD editor** | Menu or pause → *Customize HUD*: drag, resize or hide every HUD control: action buttons, each weapon slot, the pickup/open button, minimap, pause and spawn. Set button opacity, and separately the **weapon slot opacity** (WEAPONS slider, down to 10%). Saved separately for landscape and portrait. Built for claw setups. (`src/layout.js`) |
| **Fullscreen** | Button in the menu and in-game. On iPhone Safari it explains *Share → Add to Home Screen*, which launches fullscreen. |
| **Grapple (first person)** | Your left arm throws out toward the hook with a wrist-mounted launcher, the rope shoots out from its barrel to the hook, and the arm holds against the rope tension while you're pulled. The gun drops to a one-handed hold, and it works while holding the karambit too (`specialLeft` in `src/viewmodel.js`). |
| **Spawn loadout** | You drop in with only your melee (karambit or butterfly knife). No pistol: find guns on the ground. |
| **Butterfly knife** | CS-inspired balisong (`BUILD.butterfly`): a spear-point blade with a swedge and kicker, two skeletonised handles with oval cut-outs on pivots, a latch and pins. Equip any butterfly blueprint (shop or case) and it replaces the karambit as your melee everywhere (spawn, duel). Draw and inspect do the CS flip sequence: the handles swing open and closed around the blade (`ud.handleA / handleB`), with rolls and swishes, before closing in the hand. +20% move speed while held. |
| **Revolver** | Six-shot heavy revolver (58 dmg, 2× headshot, 150 rpm, iron sights; tier 2 loot, shop, duel). Model has a vent rib, ejector lug, and a fluted cylinder on a swing-out crane. Each shot indexes the cylinder one chamber. Reload: the gun rolls, the crane swings out, the empties are dumped as the cylinder spins, the left hand drives in a speedloader, then the cylinder is flicked shut. Own shot sound. |
| **Karambit model** | Cleaned up CS-style (`BUILD.knife`): smooth hooked blade with a thumb ramp and jimping cut into the spine, a bright edge grind following the cutting edge, a curved black handle with finger grooves and an even steel liner line, a steel bolster and guard, flush pins, and a smooth finger ring (same ring centre, so the deploy/inspect flip is unchanged). All karambit blueprints still apply. In first person the hand is a **closed fist** (`BR.Models.hand(id, left, true)`: fingers curled tight, thumb wrapped) gripping the handle, with the ring by the index finger and the blade out past the bolster. |
| **Visual grade** | Filmic look: ACES tone mapping (exposure 0.92) for soft highlights and richer mid-tones; the sky dome, clouds and far mountains are kept out of the curve (`toneMapped = false`) so they stay vivid. Lighting: cool sky / warm-ground hemisphere, a warm key sun aligned with the sky's sun, and a faint cool fill from the other side. Fog matches the sky's horizon band and starts at 70 m. Calmer natural grass palette. A soft vignette frames the view (one CSS gradient, no post-processing). |
| **Tactical look** | Muted, grounded world palette (`PAL` in world.js): concrete / plaster walls, dark roofs, weathered industrial containers, steel-grey towers and pillars, olive grass. Box surfaces use a weathered-concrete texture (mottling, grain, pits, rain streaks, a faint formwork seam) instead of a bordered tile grid. Natural, less saturated sky, flatter soft clouds, hazy desaturated mountains. A base grade on the 3D view (`saturate(0.88) contrast(1.06)`, multiplied by the player's saturation setting). |
| **Sun shadows (Graphics: High)** | Soft PCF shadow map (1024²) from the sun that follows the camera (~84 m box, snapped to texels so it doesn't shimmer). Buildings, trees, rocks, props and players cast and receive shadows; unlit sky/clouds/mountains and transparent water are skipped. Off on Low / Medium so the default setting keeps its frame rate (`Game.applyShadows` / `updateShadowCam`). |
| **Weapon pictures** | At startup `BR.WeaponIcons.build()` (hud.js) renders every weapon's real 3D model side-on in a throwaway WebGL context: a white silhouette per weapon (used as a CSS mask on the HUD weapon slots, so it takes the slot colour and the active glow) and a lit picture for the menus. The **Spawn** menu and the **1v1 loadout** menu show weapon cards with those pictures. |
| **Recoil** | Automatics (SMG, Rifle, Holo AR) kick more randomly: a wider shot-to-shot vertical spread, a sideways random walk that sometimes snaps the other way, and a little jitter in every direction. The hunting rifle kicks harder (recoil 0.05 + a camera punch). |
| **Reload = inspect** | The reload button (R) inspects when you're holding a knife, or when your mag is already full; otherwise it reloads. |
| **Butterfly grip + deploy** | Held in a closed right fist (`knifeHands.RB`, hammer grip) round the safe handle. The model's parts sit in an inner group (`userData.inner`) that pivots about the handle pin, so the safe handle stays in the fist while the blade and bite handle flip around it (`bfly = { a, flip }`). **Deploy:** comes up closed, the bite handle flicks open forward, the blade rolls up out of the safe handle as the bite handle swings down into the palm, then a quick bite-handle flick out and back. **Inspect:** a chaplin, a full rollover, a fast second chaplin and a show-off tilt. |
| **Melee picker** | Inventory → **MELEE: KARAMBIT / BUTTERFLY**. Pick which knife you carry (only one at a time); it's saved and swaps the knife in your hand right away. Equipping a karambit or butterfly blueprint also selects that knife. |
| **Pistol model** | A polymer-frame striker pistol in black (`BUILD.pistol`): long squared slide (long-slide length) with rear serrations, a lower slide groove and ejection port, and a long barrel running out past it; polymer frame with a short accessory rail, squared trigger guard, finger-groove grip with a beavertail and stippled side panels; an **extended mag** that runs below the grip with ribs and a big base pad (drops on reload); fixed sights. Pistol skins are refitted. |
| **Hunting rifle model** | A slim classic wooden bolt-action sporter (`BUILD.hunter`): narrow one-piece walnut stock (shared procedural wood grain, `woodMaterial()`) with a long fore-end running under most of the barrel, a pistol-grip wrist and fore-end with subtle checkering, a raised comb and black butt pad; round blued receiver with a bolt and shroud, a slim tapered barrel with a band, open sights (rear notch on a base ahead of the receiver, ramped front post), steel trigger guard and floorplate (the mag), sling swivels. Same handling, iron sights and 5 rounds as before; its skins are refitted. |
| **Sniper model** | A heavy long-range bolt-action in desert tan (`BUILD.sniper`): ported muzzle brake, fluted heavy barrel, tapered skeleton handguard with oval cut-outs, a top rail, a laser module and a big forward-angled bipod (steel lower legs, lock collars, rubber feet; clearly visible at the hip), flat-top receiver with a long rail, a big scope (front bell, turrets, wide ocular bell, dark lenses) on two rings, ribbed box mag, rubber pistol grip, and a skeleton stock (buffer tube, cheek rest on posts, tall rubber butt pad) with a rear monopod. The bolt still cycles after every shot. Sniper skins are refitted to it. |
| **Shotgun model** | A classic pump-action (`BUILD.shotgun`): blued receiver with ejection and loading ports, barrel with a vent rib and a green fibre bead, magazine tube with a barrel clamp, ribbed wood forend on action bars, wood stock with a pistol-grip wrist, a dropped comb and a black recoil pad (procedural wood-grain texture; camos and blueprints recolour the wood). A raised ghost-ring rear sight and tall front post keep the sight picture clear of the stock. **Pump cycle:** after each shot the forend racks back and forward (`ud.pump`, `pumpT` in `viewmodel.js`), the left hand rides along, and the gun dips with a clack. Gameplay is unchanged (Breacher: 8-pellet horizontal line, shell-by-shell reload). Shotgun skins are refitted to the slimmer body. |
| **SMG model** | A compact open-bolt machine pistol in black (`BUILD.smg`): short barrel with a knurled barrel nut, boxy receiver with a front lip under a top cover with a short slotted rail, sight ears front and rear, two side channels and a row of slanted grooves, cocking knob, selector and push pin, the stick mag inside the raked grip, and an extended folding skeleton stock (hinge block, arm with two cut-outs, ribbed butt pad). The micro red dot sits on the rail. New Legendary shop skin **Scarlet Drum** (1100 coins): red body, long barrel (the muzzle moves forward), handstop, a big twin-drum mag in place of the stick mag, and a cheek rest. The older SMG skins (Neon Rush, Hornet, Glitch, Synthwave, Hellfire) are refitted to the new body. |
| **Butterfly + revolver skins** | Butterfly: Crimson Web, Fade, Marble, Gold Rush in the shop; case-only Nebula (Legendary), Molten Core (Mythic, flowing lava blade + embers), Stormbreaker (Mythic, crackling lightning blade + arcs) and Prismatic (Exotic, chrome-rainbow blade, orbiting crystal shards, sparkles, helix tracer). Glowing inserts fill the handle cut-outs. Revolver: Neon Outlaw and Engraved in the shop; case-only Ghost (Legendary), Dragonfang (Mythic, phoenix tracer) and Supernova (Exotic: prism cylinder with glowing chamber cores, orbiters, muzzle halo, comet tracer). Legendary+ revolver skins reload with the revolver spin. |
| **Shockwave grenade** | Trickshot item (`src/shockwave.js`, `CONFIG.shockwave`). Carry up to 3: they drop as loot (purple ring), come from **Spawn → Shockwave nades** in practice, and you get 2 per duel round. Throw with the purple **NADE** button or T: your left hand brings it up and whips it forward. It arcs, then detonates on contact (or after 2.4 s) in a purple shockwave (expanding dome, three rings, spark burst, vignette flash, a deep whoomp). Everyone within 8 m with line of sight is launched away and up (thrown at your feet: about 5 m of air). Enemies take up to 15 damage; you take none. |
| **HUD look** | Weapon slots are glass cards with a weapon silhouette icon, name, ammo count and a slim ammo bar. The active slot lifts with an amber glow, and low ammo turns red. The minimap is a circle centred on you, with a view cone, a vignette, a ring border and an N marker. |
| **World art** | **Sky:** a gradient dome tinted warm toward the sun, a sun disc with soft halos, fluffy shaded cumulus clouds, high cirrus streaks, far snow-capped mountains and nearer green hills (sun-shaded, hazed). **Trees:** tapered trunks with root flares; leafy trees get 5-blob canopies in varied greens, and pines get 4 drooping tiers. **Bushes:** 3-blob clusters. **Cars:** modelled sedans (extruded body profile, glasshouse, roof, wheels with rims, lights, grille, bumpers, mirrors), one mesh per car. **Gloves:** three-segment jointed fingers, a two-part thumb, knuckle guard, back plate and strapped cuff, merged per material. |
| **Dropped weapons** | Shown with a floating name in the rarity colour (no background, dark outline + glow; within about 18 m). Guns tossed out of chests, death drops and swaps fly out spinning fast, bounce a few times, then settle into a bouncing spin. |
| **Inventory** | Menu → **Inventory** (also from the Shop, and **Inspect** on a case drop). Everything you own (shop buys and case drops) by tab: blueprints / camos / tracers per gun, gloves, charms, kill feeds. Tap an item to load it on the big 3D preview, **drag to turn it any way** (with momentum, then a slow idle spin), pinch or scroll to zoom, double-tap to reset, and **Equip**. Kill feed banners preview as a large banner. Code: `BR.Inventory` (shop.js), `Game.inspect` + `updateShop`. |
| **Release Case** | Menu → **Cases** (600 coins). A CS-style reel decelerates onto your drop with ticks, then a rarity reveal. Odds: Rare 52%, Epic 28%, Legendary 13%, Mythic 6%, Exotic 1%. Its 39 items are case-only (including butterfly and revolver skins) (not sold in the shop): Exotic Genesis rifle (spinning tri-halo, orbiting crystal shards, flexing wings, full-spectrum glow), Exotic Event Horizon sniper (a black hole with a spinning accretion disk and in-spiralling dust), Exotic Fire & Ice karambit, Mythic Hellfire / Leviathan / Royal Gold / Cyber Ronin / Lore, Legendary Chroma / Wild Hunt, animated camos and gloves (Hologram, Diamond, Nebula, Inferno, Aurora Borealis, Liquid Gold), comet / energy-ring / phoenix tracers, and case-only kill feeds. A duplicate refunds 35%. Code: `BR.CASES`, `BR.CaseItems`, `Profile.openCase`. |
| **Tracers per gun** | Each gun has its own tracer slot (Shop → Tracers, pick the gun chip). **Blueprint Signature** (the default) fires the equipped blueprint's own tracer: every Legendary, Mythic and Exotic blueprint has one. |
| **Signature reloads** | Legendary, Mythic and Exotic blueprints have their own reload move (twirl / backflip / toss and catch / revolver spin / glitch-teleport) with sparks and a glow ring in the blueprint's colour. |
| **Ranked + leaderboard** | Every match earns RP (Battle Royale: placement + kills; Duel: ±). Tiers Bronze → Silver → Gold → Platinum → Diamond → Master → Predator have hexagon badges, which show next to your name in the kill feed. **Ranked** in the menu shows your rank, progress and a Season 1 leaderboard (rivals + other accounts on the device + you). Reaching Gold, Diamond, Master and Predator unlocks exclusive kill feed banners. |
| **Kill feed banners** | Shop → **Kill Feed**: how your kills look in the feed (Neon Edge, Hellfire, Toxic, Royal Crown, Galaxy, Glitch, Prism Wave), plus rank rewards and case-only banners (Void Rift, Solar Burst, Supreme). |
| **Hit feedback** | Hits: a crisp tick + low thump; headshots add a metallic "ting" and a gold spark burst, a gold crit hitmarker with an expanding ring, and a small FOV squeeze. Kills: a punchy chime (bigger on headshot kills), a red hitmarker, a ring, and a "HEADSHOT" callout. Damage numbers have a dark outline and pop in. Rapid hits on the same target stack into one number; headshots are gold gradient crits with a ✦ and shield hits are blue. |
| **Stim shot** | HUD **STIM** button (or F). Every 4 s: +30% run speed for 3 s and heals 1 HP per tick at 10 ticks/s for 5 s (50 HP). In first person (Warzone-style) the gun drops to a one-handed hold, your left hand brings up a pen injector and flicks the cap off. You tip your head down, turn the needle on yourself and stab it into the left side of your chest (the hand is solved so the needle tip lands there), press the plunger, then pull it out. The view flinches as it goes in. The button shows a cooldown sweep and glows green while boosted, with a green screen-edge tint. Bots stim when hurt. Tuning: `CONFIG.stim`; logic: `Actor.tryStim` / `Actor.update`. |
| **Movement tech** | Deliberate "bugs" with a skill ceiling. See section 5b. |
| **Desktop controls** | WASD, mouse look, Space jump, Shift/C crouch-slide, G or middle-click grapple, R, 1/2/3/Q, V inspect, E, Esc. |
| **Look** | Clean modern UI: dark frosted-glass panels, hairline borders, soft radii, Saira condensed type, one amber accent, slim health/shield bars, round translucent touch buttons. |
| **Settings** | Bot skill, bot count (0–29), look speed, **aim smoothing**, **stretched res** (0–100%: squeezes the camera aspect so the picture stretches wider, like 4:3 stretched; at 100% a 16:9 phone looks like ≈1.35:1 stretched), **saturation** (0–200%, a filter on the 3D view only), **FOV (60–110)**, graphics, volume, aim assist, auto-fire, FPS counter. Saved per device. |
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
- **No spectate mode** after death; the camera orbits your body until the results screen.
- **Matchmaking is simulated**: the queue screen is ready for a real server (swap the timer in `main.js` `play()` for a lobby call).
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
