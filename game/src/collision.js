// Collision against the map's axis-aligned boxes: circle-versus-box movement with axis-separated
// sliding, and ray-versus-box tests for bullets and sight lines. Barrels block movement (as
// circles) but not bullets, which is why they are tested here and not in the ray code.

import { MAP } from './mapdata.js';

const solids = MAP.solids;
const barrels = MAP.barrels;

function boxOf(s) {
  return {
    x0: s.x - s.w / 2, x1: s.x + s.w / 2,
    z0: s.z - s.d / 2, z1: s.z + s.d / 2,
    y0: s.y0, y1: s.y0 + s.h,
  };
}
const boxes = solids.map(boxOf);

// Move a circle (x, z, radius) whose body spans y [feetY, feetY + height]; returns the resolved
// position in the same object. Axis-separated, so sliding along a wall keeps the other axis.
export function moveCircle(pos, radius, feetY, height) {
  // X axis.
  for (const b of boxes) {
    if (feetY >= b.y1 || feetY + height <= b.y0) continue;
    if (pos.x > b.x0 - radius && pos.x < b.x1 + radius && pos.z > b.z0 && pos.z < b.z1) {
      pos.x = pos.x - (b.x0 + b.x1) / 2 < 0 ? b.x0 - radius : b.x1 + radius;
    }
  }
  for (const b of barrels) pushOutCircle(pos, b.x, b.z, 0.45 + radius);
  // Z axis.
  for (const b of boxes) {
    if (feetY >= b.y1 || feetY + height <= b.y0) continue;
    if (pos.x > b.x0 && pos.x < b.x1 && pos.z > b.z0 - radius && pos.z < b.z1 + radius) {
      pos.z = pos.z - (b.z0 + b.z1) / 2 < 0 ? b.z0 - radius : b.z1 + radius;
    }
  }
  for (const b of barrels) pushOutCircle(pos, b.x, b.z, 0.45 + radius);
  // World bounds.
  const bx = MAP.groundW / 2 - 1.2, bz = MAP.groundD / 2 - 1.2;
  pos.x = Math.max(-bx, Math.min(bx, pos.x));
  pos.z = Math.max(-bz, Math.min(bz, pos.z));
  return pos;
}

function pushOutCircle(pos, cx, cz, r) {
  const dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  const d = Math.sqrt(d2) || 0.001;
  pos.x = cx + (dx / d) * r;
  pos.z = cz + (dz / d) * r;
}

// Is a standing body at (x, z) intersecting any solid? Used to keep bot waypoints honest.
export function pointBlocked(x, z, radius = 0.42) {
  for (const b of boxes) {
    if (b.y0 > 1.8) continue;
    if (x > b.x0 - radius && x < b.x1 + radius && z > b.z0 - radius && z < b.z1 + radius) return true;
  }
  return false;
}

// Ray versus every solid box (slab test). Returns the nearest hit {dist, x, y, z} or null.
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = null;
  for (const b of boxes) {
    let t0 = 0, t1 = maxDist;
    // X slab.
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
    else {
      let ta = (b.x0 - ox) / dx, tb = (b.x1 - ox) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // Y slab.
    if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; }
    else {
      let ta = (b.y0 - oy) / dy, tb = (b.y1 - oy) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // Z slab.
    if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
    else {
      let ta = (b.z0 - oz) / dz, tb = (b.z1 - oz) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t0 > 0.01 && (!best || t0 < best.dist)) {
      best = { dist: t0, x: ox + dx * t0, y: oy + dy * t0, z: oz + dz * t0 };
    }
  }
  return best;
}

// Ground is y=0 everywhere; a downward ray that hits nothing else lands there.
export function rayScene(ox, oy, oz, dx, dy, dz, maxDist) {
  const hit = rayHit(ox, oy, oz, dx, dy, dz, maxDist);
  if (dy < -1e-6) {
    const tg = -oy / dy;
    if (tg > 0.01 && tg <= maxDist && (!hit || tg < hit.dist)) {
      return { dist: tg, x: ox + dx * tg, y: 0, z: oz + dz * tg, ground: true };
    }
  }
  return hit;
}

// Can eyes at A see a point at B? (Solids only; smoke is layered on by the caller.)
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;
  const hit = rayHit(ax, ay, az, dx / dist, dy / dist, dz / dist, dist);
  return !hit || hit.dist >= dist - 0.05;
}
