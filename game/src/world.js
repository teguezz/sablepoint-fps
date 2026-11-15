// Builds the three.js scene for Rustfall Yard from mapdata: the same boxes the collision code
// tests become the rendered walls, crates and containers, so what you see is what you hit.
// Adds the dusk sky, sun and lamps, ground paint for the two sites, and set dressing (silo,
// chimney, crane, distant silhouettes) that sits outside the playable collision set.

import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { PALETTE } from './config.js';
import { makeTextures } from './textures.js';

function sitePaint(site, letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,214,140,0.9)';
  x.lineWidth = 7;
  x.setLineDash([26, 16]);
  x.strokeRect(12, 12, 232, 232);
  x.setLineDash([]);
  x.fillStyle = 'rgba(255,214,140,0.85)';
  x.font = '700 150px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(site.x1 - site.x0, site.z1 - site.z0),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(site.cx, 0.02, site.cz);
  return m;
}

// A backlit yard sign: dark plate, pale title, team-warm accent line. Canvas-drawn like the
// site paint, so the yard's lettering is the game's own art, not a borrowed font asset.
function textSign(title, sub, w = 4.6) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#22252b';
  x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#e8905a';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 496, 144);
  x.textAlign = 'center';
  x.fillStyle = '#f2ede4';
  x.font = '700 62px system-ui, sans-serif';
  x.fillText(title, 256, 82);
  x.fillStyle = '#e8905a';
  x.font = '700 32px system-ui, sans-serif';
  x.fillText(sub, 256, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * 160 / 512),
    new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.38, roughness: 0.85 }),
  );
  return m;
}

export function createWorld(scene) {
  const tex = makeTextures();
  const group = new THREE.Group();
  scene.add(group);

  // Sky: a big gradient dome, dusk blue up top melting into ember at the horizon.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(PALETTE.sky) },
        horizon: { value: new THREE.Color(PALETTE.horizon) },
        sunDir: { value: new THREE.Vector3(-38, 34, -20).normalize() },
        sunTint: { value: new THREE.Color(PALETTE.sun) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunTint; varying vec3 vP;'
        + 'void main(){ vec3 d = normalize(vP); float h = clamp(d.y * 1.6, 0.0, 1.0);'
        + ' vec3 col = mix(horizon, top, pow(h, 0.62));'
        + ' float s = pow(max(dot(d, sunDir), 0.0), 22.0);'
        + ' col += sunTint * (s * 0.55 + pow(max(dot(d, sunDir), 0.0), 350.0) * 0.9);'
        + ' gl_FragColor = vec4(col, 1.0); }',
    }),
  );
  group.add(sky);

  scene.fog = new THREE.Fog(PALETTE.fog, 55, 165);

  // Lights: warm low sun with shadows, cool sky fill, furnace and lamp glows.
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.0);
  sun.position.set(-38, 34, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48; sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const furnaceGlow = new THREE.PointLight(0xff6a2a, 30, 16, 1.8);
  furnaceGlow.position.set(18, 3.2, -16.5);
  scene.add(furnaceGlow);
  const lampA = new THREE.PointLight(0xffd9a0, 18, 15, 1.8);
  lampA.position.set(0, 5.4, 0);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0xffd9a0, 18, 15, 1.8);
  lampB.position.set(28, 5.4, 0);
  scene.add(lampB);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.groundW, MAP.groundD),
    new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  group.add(sitePaint(MAP.sites.A, 'A'));
  group.add(sitePaint(MAP.sites.B, 'B'));

  // Solids. One shared unit box, scaled per solid; materials keyed by the map's mat names.
  const mats = {
    sandstone: new THREE.MeshStandardMaterial({ map: tex.sandstone, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95 }),
    rust: new THREE.MeshStandardMaterial({ map: tex.metal, color: 0xc96a44, roughness: 0.8, metalness: 0.35 }),
    tealMetal: new THREE.MeshStandardMaterial({ map: tex.metal, color: 0x4fae9f, roughness: 0.8, metalness: 0.35 }),
    slate: new THREE.MeshStandardMaterial({ map: tex.metal, color: 0x77808c, roughness: 0.85, metalness: 0.3 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7, metalness: 0.5 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9 }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (const s of MAP.solids) {
    // The silo is drawn round; its collision stays the square in the data.
    if (s.x === 27 && s.z === -20) continue;
    const mesh = new THREE.Mesh(unitBox, mats[s.mat]);
    mesh.scale.set(s.w, s.h, s.d);
    mesh.position.set(s.x, s.y0 + s.h / 2, s.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Silo and furnace chimney.
  const silo = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2, 8, 18),
    new THREE.MeshStandardMaterial({ map: tex.metal, color: 0xc96a44, roughness: 0.8, metalness: 0.35 }),
  );
  silo.position.set(27, 4, -20);
  silo.castShadow = true;
  group.add(silo);
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.05, 3.6, 12),
    mats.darkMetal,
  );
  chimney.position.set(18, 7.3, -19.5);
  chimney.castShadow = true;
  group.add(chimney);
  // The furnace mouth: an emissive slit the glow light sits in front of.
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.1, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff5a1a, emissiveIntensity: 2.4 }),
  );
  mouth.position.set(18, 1.0, -16.93);
  group.add(mouth);

  // Barrels.
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.05, 12);
  const barrelMats = [
    new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.7, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0xa04a2c, roughness: 0.75, metalness: 0.3 }),
  ];
  MAP.barrels.forEach((b, i) => {
    const mesh = new THREE.Mesh(barrelGeo, barrelMats[i % 2]);
    mesh.position.set(b.x, 0.525, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // Lamp posts over the Crossing and the Warden yard.
  const poleMat = mats.darkMetal;
  for (const [lx, lz] of [[0, -4.6], [0, 4.6], [28, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.4, 8), poleMat);
    pole.position.set(lx, 2.7, lz);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x2c2c2c, emissive: 0xffc98a, emissiveIntensity: 1.6 }),
    );
    head.position.set(lx, 5.45, lz);
    group.add(head);
  }

  // Set dressing beyond the walls: silhouetted blocks and a gantry crane to the north.
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x2c3242, roughness: 1 });
  const dressing = [[-52, -40, 16, 14], [-20, -44, 22, 10], [14, -42, 18, 16], [48, -38, 14, 12],
    [-54, 20, 14, 10], [52, 26, 18, 13], [0, 46, 30, 9], [-40, 42, 16, 12]];
  for (const [x, z, w, h] of dressing) {
    const m = new THREE.Mesh(unitBox, silhouette);
    m.scale.set(w, h, 8);
    m.position.set(x, h / 2, z);
    group.add(m);
  }
  // Yard signage: the Foundry over site A's furnace face, the Depot over B's back wall, and
  // a small board for the Crossing on its lamp pole — the places name themselves in play.
  const signA = textSign('FOUNDRY', 'SITE A');
  signA.position.set(18, 3.7, -16.8);
  group.add(signA);
  const signB = textSign('DEPOT', 'SITE B');
  signB.position.set(21, 3.7, 19.4);
  signB.rotation.y = Math.PI;
  group.add(signB);
  const signMid = textSign('CROSSING', 'MID', 2.3);
  signMid.position.set(0, 3.3, -4.6);
  signMid.material.side = THREE.DoubleSide;
  group.add(signMid);

  const craneMat = new THREE.MeshStandardMaterial({ color: 0x54443a, roughness: 0.9 });
  const craneLegL = new THREE.Mesh(unitBox, craneMat);
  craneLegL.scale.set(0.6, 13, 0.6); craneLegL.position.set(-14, 6.5, -31);
  const craneLegR = craneLegL.clone(); craneLegR.position.x = 16;
  const craneBeam = new THREE.Mesh(unitBox, craneMat);
  craneBeam.scale.set(34, 0.7, 0.9); craneBeam.position.set(1, 13, -31);
  group.add(craneLegL, craneLegR, craneBeam);

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      furnaceGlow.intensity = 28 + Math.sin(t * 11) * 4 + Math.sin(t * 23.7) * 3;
    },
  };
}
