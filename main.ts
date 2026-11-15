// Sablepoint — entry program for make.fun's "Make the best three.js tactical FPS" bounty.
//
// The game itself is plain static files under game/ (ES modules, three.js vendored, no build
// step, no network). This program is the hand-in: it copies game/ and screenshots/ from beside
// this file into the output directory and writes dossier.json there with the kit's vendored
// library (vendor/makefun-threejs.ts), which is the summary the judge reads.
//
// Run it the way the grader does, or locally with an output directory of your choice:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output. Running it twice writes the
// same bytes: the copy is a plain file copy and buildDossier is deterministic.
//
// To play the game itself, serve game/ statically (see serve.ts) and open it in Chrome.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the scorer's gate so a local run refuses what the scorer would refuse:
// at most 4 screenshots of 256 KiB, at most 993 files and 48 MiB under game/, and the dossier
// text the judge reads capped at 160 KiB of source.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
