// Transient visuals, all pooled and preallocated: tracer lines, muzzle flashes, a particle
// system for impact sparks and debris, smoke clouds (which also block bot sight — rounds.js
// and bots.js ask smokeBlocks), and the charge's explosion. Nothing here allocates per frame.

import * as THREE from 'three';

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAX_PARTICLES = 900;

export function createEffects(scene) {
  // --- Particles ---
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const grav = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -60;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.085, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let pCursor = 0;
  const tmpColor = new THREE.Color();

  function burst(x, y, z, color, count, speed, lifeSec, gravity = -4) {
    tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = pCursor;
      pCursor = (pCursor + 1) % MAX_PARTICLES;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.85);
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      vel[i * 3 + 1] = Math.cos(ph) * sp + speed * 0.25;
      vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      pCol[i * 3] = tmpColor.r; pCol[i * 3 + 1] = tmpColor.g; pCol[i * 3 + 2] = tmpColor.b;
      life[i] = maxLife[i] = lifeSec * (0.6 + Math.random() * 0.7);
      grav[i] = gravity;
    }
  }

  // --- Tracers ---
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let i = 0; i < 28; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;
  function tracer(x0, y0, z0, x1, y1, z1) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const a = t.line.geometry.getAttribute('position');
    a.setXYZ(0, x0, y0, z0);
    a.setXYZ(1, x1, y1, z1);
    a.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.055;
  }

  // --- Muzzle flashes: crossed additive planes + one shared light ---
  const flashTex = radialTexture('rgba(255,240,200,1)', 'rgba(255,140,40,0)');
  const flashes = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.visible = false;
    scene.add(m);
    flashes.push({ mesh: m, life: 0 });
  }
  let flashCursor = 0;
  const flashLight = new THREE.PointLight(0xffb36a, 0, 9, 1.6);
  scene.add(flashLight);
  function muzzle(x, y, z, camera) {
    const f = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % flashes.length;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.setScalar(0.7 + Math.random() * 0.6);
    f.mesh.rotation.z = Math.random() * Math.PI;
    if (camera) f.mesh.quaternion.copy(camera.quaternion);
    f.mesh.visible = true;
    f.life = 0.045;
    flashLight.position.set(x, y, z);
    flashLight.intensity = 14;
  }

  // --- Smoke clouds ---
  const smokeTex = radialTexture('rgba(196,198,204,0.55)', 'rgba(196,198,204,0)');
  const smokes = [];
  for (let i = 0; i < 8; i++) {
    const grp = new THREE.Group();
    const sprites = [];
    for (let j = 0; j < 7; j++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.set((Math.random() - 0.5) * 2.4, Math.random() * 1.6 + 0.4, (Math.random() - 0.5) * 2.4);
      s.scale.setScalar(2.4 + Math.random() * 2.2);
      grp.add(s);
      sprites.push(s);
    }
    grp.visible = false;
    scene.add(grp);
    smokes.push({ grp, sprites, x: 0, y: 0, z: 0, radius: 4, until: -1, born: 0 });
  }
  let smokeCursor = 0;
  function smoke(x, y, z, radius, duration, now) {
    const s = smokes[smokeCursor];
    smokeCursor = (smokeCursor + 1) % smokes.length;
    s.grp.position.set(x, y, z);
    s.x = x; s.y = y + 1; s.z = z;
    s.radius = radius;
    s.born = now;
    s.until = now + duration;
    s.grp.visible = true;
  }
  // Does the segment a-b pass through live smoke? Bots cannot see through it; players just
  // see the cloud itself.
  function smokeBlocks(ax, ay, az, bx, by, bz, now) {
    for (const s of smokes) {
      if (now > s.until || now < s.born + 0.4) continue;
      // Distance from the smoke centre to the segment.
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const len2 = abx * abx + aby * aby + abz * abz || 1;
      let t = ((s.x - ax) * abx + (s.y - ay) * aby + (s.z - az) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const dx = ax + abx * t - s.x, dy = ay + aby * t - s.y, dz = az + abz * t - s.z;
      if (dx * dx + dy * dy + dz * dz < s.radius * s.radius * 0.8) return true;
    }
    return false;
  }

  // --- Explosion flash ---
  const boomLight = new THREE.PointLight(0xffa050, 0, 30, 1.4);
  scene.add(boomLight);
  let boomLife = 0;
  function explosion(x, y, z) {
    burst(x, y + 0.5, z, 0xffa050, 90, 9, 0.9, -2);
    burst(x, y + 0.5, z, 0x59473a, 50, 5, 1.4, 1.5);
    burst(x, y + 0.3, z, 0xffd9a0, 40, 13, 0.5, -6);
    boomLight.position.set(x, y + 1.5, z);
    boomLight.intensity = 260;
    boomLife = 0.5;
  }

  function update(dt, now) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pPos[i * 3 + 1] = -60; continue; }
      vel[i * 3 + 1] += grav[i] * dt;
      pPos[i * 3] += vel[i * 3] * dt;
      pPos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; vel[i * 3 + 1] = 0; }
    }
    pGeo.getAttribute('position').needsUpdate = true;
    for (const t of tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; }
    }
    for (const f of flashes) {
      if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.mesh.visible = false; }
    }
    if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
    if (boomLife > 0) {
      boomLife -= dt;
      boomLight.intensity = Math.max(0, boomLife * 420);
    }
    for (const s of smokes) {
      if (!s.grp.visible) continue;
      const age = now - s.born;
      const remain = s.until - now;
      if (remain <= 0) { s.grp.visible = false; continue; }
      const fadeIn = Math.min(1, age / 0.8);
      const fadeOut = Math.min(1, remain / 2.5);
      const o = 0.85 * Math.min(fadeIn, fadeOut);
      for (const sp of s.sprites) sp.material.opacity = o;
      s.grp.rotation.y += dt * 0.05;
    }
  }

  return { burst, tracer, muzzle, smoke, smokeBlocks, explosion, update };
}
