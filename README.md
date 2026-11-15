# SABLEPOINT — a three.js tactical FPS

An entry for make.fun's **three.js tactical FPS** bounty ("Make the best three.js tactical FPS").

**Sablepoint** is a complete, original, round-based tactical shooter in the style
Counter-Strike made famous — two teams, short rounds won by elimination or an objective,
money between rounds to buy weapons, accuracy-focused gunplay — and entirely its own work:
original map, teams, weapons, art and sounds. Nothing is copied from any commercial game.

You lead the **Vanguard** (ember) against the **Wardens** (teal) in **Rustfall Yard**, a dusk
freight yard of container lanes, a contested Crossing and two bomb sites. Plant **the Charge**
at the Foundry (A) or the Depot (B) — or eliminate the Wardens — to take rounds; first to 8
wins the match.

## The game

- **Full match structure** — buy phase (12 s) → live round (100 s) → planted phase (40 s
  fuse) → round end, with a CS-style economy: kill and plant rewards, win pay, and a
  loss-bonus ladder, all capped at $16,000. First to 8 rounds takes the yard.
- **Six weapons, three grenades, armour** — P9 sidearm, Hunter .45, Raptor-9 SMG, Scatter-7
  shotgun (8 pellets), VK-7 carbine, Kestrel DMR, plus frag / smoke / flash grenades with
  bounce physics and a kevlar vest. Every gun has its own damage, spread, recoil kick,
  reload and ADS zoom; the viewmodel — and the gun in every bot's hands — is shaped per weapon.
- **Gunplay where stopping pays** — head / body / leg hit zones with a headshot multiplier,
  distance falloff and armour scaling; spread grows with movement and air time and shrinks
  when crouched, still or aiming; per-shot camera kick.
- **Bots that play the objective** — 4 teammates + 5 opponents on a waypoint graph (A*).
  Attackers pick a site, split across lanes, smoke the entry, and the carrier plants
  (3 s channel) while rifles take guard points; a dropped Charge is fetched. Defenders hold
  site and mid points with peeks, rotate on gunfire, lob frags at last-seen positions, and
  retake a planted Charge from two directions — the last man swings through mid — smoking
  the Charge before the defuse (5 s channel). In combat they are limited like humans:
  110° vision cone, line of sight blocked by walls and smoke, reaction delay, aim error
  that settles while tracking, burst fire with sidesteps, reload discipline. They hear
  footsteps and gunfire.
- **Bots run an economy too** — every bot spends its own money in the buy phase: rifles and
  armour by preference (the Warden marksman saves for the Kestrel), grenades by role,
  force-buys and save rounds when poor. The scoreboard's money column is real.
- **The map** — Rustfall Yard: west/east spawns, north and south lanes, a mid lane through
  the Crossing (stacked containers, lamp posts), two full sites with furnace, silo, crates
  and painted site markings, backlit FOUNDRY / DEPOT signage, procedural canvas textures,
  a gradient dusk sky with a sun halo, fog, shadow-casting sun and flickering furnace glow.
  What you see is what you hit: rendering and collision read the same map data.
- **Presentation** — full HUD (health/armour, money, ammo, grenade counts, round timer,
  team scores with alive pips and a round-history strip, phase label, planted warning),
  spreading crosshair, hitmarkers (red for headshots), directional damage indicator,
  damage vignette, flash overlay, killfeed, round banners, plant/defuse channel bar,
  buy menu (click or hotkeys 1–9), Tab scoreboard, a live minimap (walls, sites,
  teammates, enemy muzzle-flash pings, the planted Charge), spectate view after death,
  and start / match-end overlays. All sound is synthesized WebAudio — per-weapon gunshots,
  reloads, hits, footsteps, accelerating plant beeps, explosion, UI. No external assets;
  the game makes **zero network requests**.

## Play it

Serve `game/` with any static file server and open it in desktop Chrome — no build step,
no network requests:

```
node serve.ts        # or any static server pointed at game/
```

Click **DEPLOY**, buy with number keys during the buy phase (B reopens the menu), and play.

| Keys | Action |
| --- | --- |
| W A S D | Move (Shift = quiet walk, Ctrl/C = crouch, Space = jump) |
| Mouse | Look · left button fire · right button aim down sights |
| 1 / 2 | Primary / sidearm (mouse wheel switches too) |
| 3 / 4 / 5 | Throw frag / smoke / flash |
| R | Reload |
| E (hold) | Plant the Charge at a site |
| B | Buy menu during the buy phase (number keys 1–9 buy) |
| Tab | Scoreboard |

## Entry layout

- `main.ts` — Node 22 entry: assembles the dossier via the kit's `buildDossier`.
- `vendor/makefun-threejs.ts` — the bounty kit's builder, copied unchanged.
- `game/` — the playable game as static files: `index.html` (one import map), `main.js`,
  `src/` modules (one job each), `vendor/three/` (three.js 0.187.0, byte-for-byte),
  `shots.json`.
- `screenshots/` — four real renders of the game (1280×720 JPEG), the first is the cover.
- `serve.ts` — a tiny local static server for development.
- `LICENSE` — MIT.

## How it is built

Sixteen ES modules under `game/src/`, one job each: `config` (all tuning — teams, weapons,
economy, timings, palette), `mapdata`, `world`, `textures`, `collision`, `weapons` (the
arsenal: hitscan, hit zones, grenades), `bots` (perception, plans, combat), `player`,
`rounds` (the match state machine and the only place match state lives), `hud`, `minimap`,
`effects`, `audio`, `input`, `viewmodels`, `rng`. The simulation runs at a fixed 60 Hz step
decoupled from rendering; effects are pooled (particles, tracers, smoke) so hot loops
allocate nothing; a seeded RNG makes matches and screenshot scenes reproducible.

## Verify

```
node main.ts         # writes ./output (or $MAKEFUN_OUTPUT_DIR) — run twice, outputs are identical
```
