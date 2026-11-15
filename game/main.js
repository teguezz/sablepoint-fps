// Boot and the frame loop. Owns the renderer, the start/end overlays and the fixed-step clock;
// the match (rounds.js) owns everything about the game itself. Simulation runs at a fixed
// 60 Hz step, decoupled from rendering, so gunplay and bot timing do not depend on frame rate.
//
// Screenshot scenes: opening index.html with ?shot=<name>&seed=<n> stages a deterministic
// frame (cover / buy / mid / site) and sets window.__shotReady once it is rendered — that is
// how the images in /screenshots were captured, from this exact code, with no other assets.

import * as THREE from 'three';
import { createWorld } from './src/world.js';
import { createEffects } from './src/effects.js';
import { createAudio } from './src/audio.js';
import { createInput } from './src/input.js';
import { createPlayer } from './src/player.js';
import { createHud } from './src/hud.js';
import { createMinimap } from './src/minimap.js';
import { createMatch } from './src/rounds.js';
import { makeRng } from './src/rng.js';
import { makeWeaponState } from './src/weapons.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 7);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 320);
scene.add(camera); // the viewmodel hangs off the camera

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const input = createInput(renderer.domElement);
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));

let match = null;
const playerCtl = createPlayer({
  camera, input, audio,
  onStep: (quiet) => { if (match) match.footstep(quiet); },
});

const endOverlay = document.getElementById('overlay-end');
match = createMatch({
  scene, camera, effects, audio, input, hud, minimap, playerCtl,
  rng: makeRng(shotName ? shotSeed : (Math.random() * 1e9) | 0),
  onMatchEnd: (winner, sv, sw) => {
    document.getElementById('end-title').textContent =
      winner === 'vanguard' ? 'VANGUARD TAKE THE YARD' : 'WARDENS HOLD THE YARD';
    document.getElementById('end-sub').textContent = `Final score ${sv} — ${sw}.`;
    endOverlay.style.display = 'flex';
    input.unlock();
  },
});

// --- Overlays and pointer lock flow ---
const startOverlay = document.getElementById('overlay-start');
let buyOpen = true;
if (!shotName) {
  document.getElementById('btn-play').addEventListener('click', () => {
    audio.ensure();
    startOverlay.style.display = 'none';
    input.lock();
    match.startMatch();
  });
  document.getElementById('btn-again').addEventListener('click', () => {
    audio.ensure();
    endOverlay.style.display = 'none';
    input.lock();
    match.startMatch();
  });
  renderer.domElement.addEventListener('click', () => {
    if (match.state.started && match.state.phase !== 'matchover' && !input.locked) input.lock();
  });
} else {
  startOverlay.style.display = 'none';
}

// --- Screenshot staging ---
function stageShot() {
  const st = match.staging;
  match.startMatch();
  for (let i = 0; i < 30; i++) match.update(1 / 60);
  const P = st.player;
  const foe = (i) => st.combatants[5 + i];
  const mate = (i) => st.combatants[i];
  if (shotName === 'cover') {
    st.setPhase('live', 87);
    P.loadout.primary = makeWeaponState('vk7');
    P.loadout.current = 'primary';
    P.health = 82;
    playerCtl.setWeapon('vk7');
    // West mid lane, looking east through the Crossing passage: two Wardens in the open
    // beyond it, a teammate pushing up the north side.
    st.teleport(P, -14, 0, Math.PI / 2);
    st.teleport(foe(0), 5.5, -0.5, -Math.PI / 2);
    st.teleport(foe(1), 10, 0.5, -Math.PI / 2);
    st.teleport(mate(1), -8, -3.5, Math.PI / 2);
    hud.showBuy(false);
    hud.banner('', '', 1);
  } else if (shotName === 'buy') {
    P.money = 4350;
    P.loadout.primary = makeWeaponState('raptor');
    st.setPhase('buy', 9);
    st.teleport(P, -23, 0.5, Math.PI / 2);
    hud.showBuy(true);
  } else if (shotName === 'mid') {
    st.setPhase('live', 64);
    P.loadout.primary = makeWeaponState('raptor');
    P.loadout.current = 'primary';
    P.health = 64;
    playerCtl.setWeapon('raptor');
    // East mid, looking west into the sunset: a Warden at the Crossing, smoke behind him,
    // a second Warden past the smoke, a teammate on the north side.
    st.teleport(P, 14, 0.5, -Math.PI / 2);
    st.teleport(foe(2), 4, -1, Math.PI / 2);
    st.teleport(foe(3), -6, 2, Math.PI / 2);
    st.teleport(mate(2), 8, -4.2, -Math.PI / 2);
    effects.smoke(-2, 0, 0, 3.4, 999, match.now);
    hud.showBuy(false);
    hud.banner('', '', 1);
  } else if (shotName === 'site') {
    st.plantAt('A');
    st.setPhase('planted', 23.4);
    P.loadout.primary = makeWeaponState('vk7');
    P.loadout.current = 'primary';
    playerCtl.setWeapon('vk7');
    // South-west edge of Foundry (A), sightline passing the furnace's south edge: the Charge
    // is planted center-site, a Warden crouches in to defuse it, a second covers from the
    // east, a teammate holds the west line.
    st.teleport(P, 9, -13.5, Math.atan2(12, -1.5));
    st.teleport(foe(0), 21.8, -14.2, Math.atan2(-0.8, -0.8));
    foe(0).crouch = true;
    st.teleport(foe(1), 24, -13.5, Math.atan2(-3, -1.5));
    st.teleport(mate(1), 16, -11, Math.atan2(5, -4));
    hud.showBuy(false);
  }
  for (let i = 0; i < 3; i++) match.update(1 / 60);
  world.update(1 / 60);
  renderer.render(scene, camera);
  window.__shotReady = true;
}
if (shotName) stageShot();
window.__sablepoint = { match, scene, camera, renderer };

// --- Frame loop: fixed-step simulation, render every animation frame ---
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let menuAngle = 0;

function frame(t) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (shotName) return; // the staged frame is already rendered
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    if (input.wasPressed('KeyB') && match.state.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen);
    }
    if (match.state.phase === 'buy' && !buyOpen) { /* shop closed by the player */ }
    match.update(STEP);
    world.update(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 4) acc = 0;
  if (!match.state.started) {
    // Menu backdrop: a slow orbit over the yard behind the start overlay.
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 30, 13, Math.cos(menuAngle) * 30);
    camera.lookAt(0, 1, 0);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
