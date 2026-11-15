# SABLEPOINT — a three.js tactical FPS

An entry for the make.fun bounty **threejs-fps-01** ("Make the best three.js tactical FPS").

**Sablepoint** is an original round-based tactical shooter in the style Counter-Strike made
famous — two teams, short rounds won by elimination or an objective, money between rounds to
buy weapons, accuracy-focused gunplay — and entirely its own work: original map, teams,
weapons, art and sounds. Nothing is copied from any commercial game.

You lead the **Vanguard** (ember) against the **Wardens** (teal) in **Rustfall Yard**, a dusk
freight yard. Plant **the Charge** at the Foundry (A) or the Depot (B) — or eliminate the
Wardens — to take rounds; first to 8 wins the match. Bots hold angles, rotate on noise and on
the plant, fetch a dropped Charge and defuse. Gunplay rewards stopping, crouching and aiming:
shots fired on the move spread wide, headshots multiply damage.

## Play it

Serve `game/` with any static file server and open it in desktop Chrome — no build step, no
network requests:

```
node serve.ts        # or any static server pointed at game/
```

Click **DEPLOY**, buy with number keys during the buy phase (B reopens the menu), and play.
Full controls are on the start screen and in `game/README.md`.

## Entry layout (what the builder expects)

- `main.ts` — Node 22 entry: assembles the dossier via the kit's `buildDossier`.
- `vendor/makefun-threejs.ts` — the bounty kit's builder, copied unchanged.
- `game/` — the playable game as static files: `index.html` (one import map), `main.js`,
  `src/` modules (one job each), `vendor/three/` (three.js 0.187.0, byte-for-byte), `shots.json`.
- `screenshots/` — four real renders of the game (1280×720 JPEG), the first is the cover.
- `serve.ts` — a tiny local static server for development.
- `LICENSE` — MIT.

## Verify

```
node main.ts         # writes ./output (or $MAKEFUN_OUTPUT_DIR) — run twice, outputs are identical
```

See `BUILD-REPORT.md` for how every requirement is met and how the build was verified.
