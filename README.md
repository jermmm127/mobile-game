# Velocity Royale (working title)

Mobile-first browser FPS battle royale: movement-heavy (slide, wall-run, grapple, shotgun jumps), offline, you vs. bots. Coins + cosmetics shop. No install and no build step.

- **Play locally:** `python3 -m http.server 8000`, then open `http://localhost:8000`
- **Phone:** landscape, left thumb moves, right thumb looks, drag on Fire to aim while shooting
- **Desktop:** WASD · mouse · Space jump · Shift crouch/slide · G grapple · R reload · 1/2/3 switch · V inspect · E open/swap · Esc pause
- **Test:** `node tools/smoke-test.js`

See **[BLUEPRINT.md](BLUEPRINT.md)** for the architecture, tuning guide, and where new features plug in.
