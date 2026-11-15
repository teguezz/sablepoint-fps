# SABLEPOINT — a three.js tactical FPS

An original round-based tactical shooter in the Counter-Strike style (never a copy: the map,
teams, weapons, art and sounds are all new). You lead the **Vanguard** against the **Wardens**
in Rustfall Yard, a dusk freight yard: win rounds by elimination or by planting **the Charge**
at the Foundry (A) or the Depot (B), earn money, and buy weapons between rounds.

Single-player against bots, desktop browser, three.js, static files only — no build step and
no network requests. Every sound is synthesized with WebAudio; every texture is drawn on a
canvas at boot; the three.js build is vendored beside the code.

## Run it

Serve this `game/` folder with any static file server and open it in desktop Chrome:

```
npx serve .          # or: python3 -m http.server
```

Then click **DEPLOY** (the click takes pointer lock and starts the audio).

## How to play

| Input | Action |
| --- | --- |
| W A S D | Move (Shift quiet-walk, Ctrl/C crouch, Space jump) |
| Mouse | Look · left button fire · right button aim down sights |
| 1 / 2 / wheel | Primary / sidearm |
| 3 / 4 / 5 | Throw frag / smoke / flash |
| R | Reload |
| E (hold) | Plant the Charge inside a site |
| B | Buy menu during the buy phase (number keys 1–9 buy directly) |
| Tab | Scoreboard |

Accuracy is positional: moving, jumping and spraying spread your shots wide; stopping,
crouching and aiming put them on target. Headshots multiply damage. Bots hear gunfire, hold
angles, rotate on the plant and defuse — first team to 8 rounds wins the match.

## Layout

- `index.html` — the page, HUD DOM and the one import map (module specifier `three`).
- `main.js` — boot, renderer, fixed-step loop, screenshot staging (`?shot=cover|buy|mid|site&seed=n`).
- `src/` — one module per job: `config` (all tuning), `mapdata` (map geometry + waypoint graph),
  `world` (3D scene), `textures`, `collision`, `weapons` (gunplay), `bots` (AI), `player`
  (movement + viewmodel), `rounds` (match state machine), `hud`, `minimap`, `effects`, `audio`, `input`, `rng`.
- `vendor/three/` — three.js 0.187.0, byte-for-byte as shipped in the bounty kit.
- `shots.json` — how each screenshot in `/screenshots` was produced.
