// Stylized low-poly models built from boxes and cylinders: the first-person weapon viewmodels
// and the bot characters. One palette of gunmetal, polymer and team cloth; the Vanguard wear
// ember, the Wardens teal, so a silhouette's side reads at a glance across the yard.

import * as THREE from 'three';
import { TEAMS } from './config.js';

const gunmetal = new THREE.MeshStandardMaterial({ color: 0x484f57, roughness: 0.55, metalness: 0.6 });
const polymer = new THREE.MeshStandardMaterial({ color: 0x353a40, roughness: 0.85, metalness: 0.1 });
const accent = new THREE.MeshStandardMaterial({ color: 0xff9a3c, roughness: 0.6, metalness: 0.2 });
const steel = new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.4, metalness: 0.7 });

function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r, h) => new THREE.CylinderGeometry(r, r, h, 10);

// Each builder returns the group plus its muzzle anchor (where flashes and tracers begin).
// Models point down -Z, the camera's forward.
export function buildViewmodel(id) {
  const g = new THREE.Group();
  let muzzleZ = -0.5;
  if (id === 'p9') {
    part(B(0.055, 0.09, 0.21), gunmetal, 0, 0, -0.1, g);
    part(B(0.04, 0.05, 0.1), steel, 0, 0.045, -0.16, g);
    const grip = part(B(0.045, 0.13, 0.06), polymer, 0, -0.09, 0.03, g);
    grip.rotation.x = 0.25;
    muzzleZ = -0.24;
  } else if (id === 'raptor') {
    part(B(0.06, 0.11, 0.42), gunmetal, 0, 0, -0.14, g);
    part(C(0.028, 0.16), steel, 0, 0.01, -0.42, g).rotation.x = Math.PI / 2;
    const mag = part(B(0.04, 0.17, 0.055), polymer, 0, -0.12, -0.1, g);
    mag.rotation.x = -0.18;
    part(B(0.05, 0.07, 0.14), polymer, 0, 0.01, 0.12, g);
    part(B(0.02, 0.05, 0.02), accent, 0, 0.085, -0.2, g);
    muzzleZ = -0.5;
  } else if (id === 'scatter') {
    part(B(0.06, 0.1, 0.5), polymer, 0, -0.01, -0.16, g);
    part(C(0.032, 0.52), gunmetal, 0, 0.035, -0.3, g).rotation.x = Math.PI / 2;
    part(C(0.042, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 0.9 }), 0, 0.0, -0.3, g).rotation.x = Math.PI / 2;
    part(B(0.045, 0.12, 0.06), polymer, 0, -0.1, 0.08, g).rotation.x = 0.2;
    muzzleZ = -0.58;
  } else if (id === 'kestrel') {
    part(B(0.06, 0.1, 0.62), gunmetal, 0, 0, -0.24, g);
    part(C(0.02, 0.4), steel, 0, 0.02, -0.68, g).rotation.x = Math.PI / 2;
    part(C(0.035, 0.2), polymer, 0, 0.1, -0.3, g).rotation.x = Math.PI / 2; // scope
    part(B(0.04, 0.15, 0.05), polymer, 0, -0.11, -0.18, g);
    part(B(0.05, 0.06, 0.2), polymer, 0, 0, 0.2, g);
    muzzleZ = -0.9;
  } else if (id === 'hunter') {
    part(B(0.06, 0.1, 0.3), gunmetal, 0, 0, -0.14, g);
    part(B(0.045, 0.055, 0.12), steel, 0, 0.05, -0.22, g);
    part(C(0.02, 0.07), steel, 0, 0.01, -0.3, g).rotation.x = Math.PI / 2;
    const grip = part(B(0.05, 0.15, 0.065), polymer, 0, -0.1, 0.04, g);
    grip.rotation.x = 0.22;
    muzzleZ = -0.34;
  } else { // vk7
    part(B(0.065, 0.12, 0.55), gunmetal, 0, 0, -0.2, g);
    part(C(0.022, 0.3), steel, 0, 0.02, -0.6, g).rotation.x = Math.PI / 2;
    part(B(0.055, 0.07, 0.26), polymer, 0, -0.005, -0.42, g);
    const mag = part(B(0.042, 0.18, 0.06), polymer, 0, -0.13, -0.14, g);
    mag.rotation.x = -0.12;
    part(B(0.05, 0.08, 0.16), polymer, 0, 0.005, 0.16, g);
    part(B(0.018, 0.055, 0.018), accent, 0, 0.095, -0.3, g);
    muzzleZ = -0.76;
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, muzzleZ);
  g.add(muzzle);
  g.traverse((o) => { o.frustumCulled = false; });
  return { group: g, muzzle };
}

// Bot character, 1.8 m tall, built facing +Z (rotation.y orients it). Parts are returned for
// the walk cycle and death fall. Hit zones (used by weapons.js): head sphere at y 1.62 r 0.20,
// body capsule from y 0.2 to 1.5, radius 0.36.
export const HIT = { headY: 1.62, headR: 0.21, bodyR: 0.37, bodyTop: 1.5, bodyBottom: 0.2 };

export function buildCharacter(teamId) {
  const team = TEAMS[teamId];
  const cloth = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.8 });
  const g = new THREE.Group();

  const legL = part(B(0.16, 0.8, 0.18), dark, -0.11, 0.4, 0, g);
  const legR = part(B(0.16, 0.8, 0.18), dark, 0.11, 0.4, 0, g);
  legL.geometry.translate(0, -0.4, 0); legL.position.y = 0.8;
  legR.geometry = legL.geometry; legR.position.y = 0.8;
  const torso = part(B(0.46, 0.62, 0.26), cloth, 0, 1.11, 0, g);
  part(B(0.4, 0.4, 0.08), dark, 0, 1.14, 0.15, g); // vest plate
  part(B(0.17, 0.07, 0.22), cloth, -0.3, 1.44, 0, g); // shoulder pads
  part(B(0.17, 0.07, 0.22), cloth, 0.3, 1.44, 0, g);
  const head = part(B(0.26, 0.28, 0.26), skin, 0, 1.62, 0, g);
  part(B(0.3, 0.12, 0.3), cloth, 0, 1.79, 0, g); // helmet
  // A lit team band around the helmet: the side reads even in silhouette and at range.
  const band = new THREE.MeshStandardMaterial({ color: team.color, emissive: team.color, emissiveIntensity: 0.5, roughness: 0.6 });
  part(B(0.31, 0.045, 0.31), band, 0, 1.735, 0, g);
  part(B(0.28, 0.07, 0.05), dark, 0, 1.64, 0.14, g); // visor
  const armR = part(B(0.11, 0.5, 0.11), cloth, 0.3, 1.28, 0.12, g);
  armR.rotation.x = -1.15;
  const armL = part(B(0.11, 0.45, 0.11), cloth, -0.28, 1.26, 0.14, g);
  armL.rotation.x = -1.3; armL.rotation.z = -0.35;
  // The gun rides in its own group so fitGun can reshape it per weapon class.
  const gun = new THREE.Group();
  gun.position.set(0.16, 1.32, 0.3);
  g.add(gun);
  part(B(0.07, 0.13, 0.62), gunmetal, 0, 0, 0.04, gun);
  part(B(0.03, 0.03, 0.2), steel, 0, 0.04, 0.42, gun);
  part(B(0.04, 0.14, 0.05), polymer, 0, -0.12, -0.02, gun);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legL, legR, armR, armL, torso, head, gun, gunKind: null };
}

// Reshape a character's gun for the weapon it currently holds: a sidearm sits short in the
// hands, the Kestrel stretches long, the Scatter-7 runs bulky. Scale only — the shared
// materials and the hit zones never change.
const GUN_SHAPES = {
  p9: [0.8, 0.8, 0.42], hunter: [0.9, 0.9, 0.58], raptor: [1, 1, 0.85],
  vk7: [1, 1, 1], scatter: [1.3, 1.15, 1.05], kestrel: [0.95, 0.95, 1.4],
};
export function fitGun(model, id) {
  const s = GUN_SHAPES[id] ?? GUN_SHAPES.vk7;
  model.gun.scale.set(s[0], s[1], s[2]);
}

// The charge: a slab of shaped explosive with a keypad and a light that blinks faster as the
// fuse burns down. Planted and dropped charges share the model.
export function buildCharge() {
  const g = new THREE.Group();
  part(B(0.42, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x35383d, roughness: 0.6, metalness: 0.4 }), 0, 0.08, 0, g);
  part(B(0.2, 0.05, 0.14), polymer, 0, 0.18, 0, g);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x220a06, emissive: 0xff2a1a, emissiveIntensity: 2 });
  const lamp = part(B(0.05, 0.05, 0.05), lampMat, 0.13, 0.19, 0, g);
  return { group: g, lampMat };
}

export function buildGrenade(kind) {
  const color = kind === 'frag' ? 0x4a5548 : kind === 'smoke' ? 0x707880 : 0xc8c8ce;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }),
  );
  m.castShadow = true;
  return m;
}
