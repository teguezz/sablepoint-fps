// The arsenal: weapon state, hitscan fire with per-body-part hit tests, reloads and thrown
// grenades. One factory holds the live projectiles and pending reloads; the match (rounds.js)
// owns the combatants and decides what damage means, this file only works out where bullets go.
//
// Accuracy model (the judge's "stopping to aim pays"): a shot's cone grows with the shooter's
// speed and while airborne, shrinks when crouched or aiming down sights, and every weapon adds
// camera kick per shot, so spraying on the move sprays wide and a planted shot lands.

import * as THREE from 'three';
import { WEAPONS, GRENADES } from './config.js';
import { HIT, buildGrenade } from './viewmodels.js';
import { rayScene } from './collision.js';

export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve };
}

export function defaultLoadout() {
  return {
    primary: null,
    sidearm: makeWeaponState('p9'),
    current: 'sidearm',
    grenades: { frag: 0, smoke: 0, flash: 0 },
    armor: false,
  };
}

export function currentWeapon(c) {
  return c.loadout[c.loadout.current];
}

// Closest approach between a ray (o + t*d, t >= 0) and the vertical body segment of a
// combatant. Returns {t, y} (ray distance and world height of the pass) or null.
function rayVsBody(o, d, c) {
  const ax = c.pos.x, az = c.pos.z;
  const y0 = c.pos.y + HIT.bodyBottom, y1 = c.pos.y + HIT.bodyTop;
  // Work in the ray's frame: find t minimising distance to the segment's axis line, then clamp.
  const ox = o.x - ax, oz = o.z - az;
  const dxz2 = d.x * d.x + d.z * d.z;
  let t = dxz2 > 1e-9 ? -(ox * d.x + oz * d.z) / dxz2 : 0;
  t = Math.max(0, t);
  const px = o.x + d.x * t - ax, pz = o.z + d.z * t - az;
  const distXZ = Math.hypot(px, pz);
  if (distXZ > HIT.bodyR) return null;
  const y = o.y + d.y * t;
  if (y < y0 - 0.1 || y > y1 + 0.1) return null;
  return { t, y };
}

function rayVsHead(o, d, c) {
  const cx = c.pos.x, cy = c.pos.y + HIT.headY, cz = c.pos.z;
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - HIT.headR * HIT.headR;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

const _dir = new THREE.Vector3();

export function createArsenal(ctx) {
  const projectiles = []; // thrown grenades in flight
  const reloads = []; // { c, until }
  const scene = ctx.scene;

  function startReload(c, now) {
    const w = currentWeapon(c);
    if (!w || c.reloadUntil > now || w.mag >= WEAPONS[w.id].mag || w.reserve <= 0) return false;
    c.reloadUntil = now + WEAPONS[w.id].reload;
    c.reloadStartedAt = now;
    reloads.push({ c, until: c.reloadUntil });
    if (c.isPlayer || ctx.nearPlayer(c.pos)) ctx.audio.reload();
    return true;
  }

  function fire(c, origin, dir, muzzle, now) {
    const w = currentWeapon(c);
    if (!w || !c.alive) return false;
    const def = WEAPONS[w.id];
    if (now < c.nextShotAt || now < c.reloadUntil || now < c.switchUntil) return false;
    if (w.mag <= 0) {
      if (c.isPlayer) ctx.audio.dryFire();
      c.nextShotAt = now + 0.3;
      startReload(c, now);
      return false;
    }
    w.mag -= 1;
    c.nextShotAt = now + 60 / def.rpm;
    c.lastShotAt = now;

    const speed = Math.hypot(c.vel.x, c.vel.z);
    let spread = def.spread + def.moveSpread * Math.min(1, speed / 4.6);
    if (c.airborne) spread += 0.05;
    if (c.crouch) spread *= 0.8;
    if (c.ads) spread *= 0.55;

    const distToPlayer = ctx.playerPos ? origin.distanceTo(ctx.playerPos()) : 99;
    const vol = c.isPlayer ? 1 : Math.max(0, 1 - distToPlayer / 46);
    const cutoff = c.isPlayer ? 9000 : Math.max(900, 9000 - distToPlayer * 160);
    if (vol > 0.02 || c.isPlayer) ctx.audio.shot(w.id, vol, cutoff);
    ctx.noise(origin.x, origin.z, c.crouch || c.quiet ? 8 : 30, c.team);
    ctx.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, c.isPlayer ? ctx.camera : null);

    for (let p = 0; p < def.pellets; p++) {
      _dir.copy(dir);
      _dir.x += (Math.random() * 2 - 1) * spread;
      _dir.y += (Math.random() * 2 - 1) * spread;
      _dir.z += (Math.random() * 2 - 1) * spread;
      _dir.normalize();
      shootRay(c, origin, _dir, def, muzzle);
    }
    if (c.isPlayer) ctx.kick(def.kick * (c.ads ? 0.6 : 1));
    if (w.mag === 0) startReload(c, now + 0.25);
    return true;
  }

  function shootRay(c, origin, dir, def, muzzle) {
    const wall = rayScene(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 120);
    const wallDist = wall ? wall.dist : 120;
    let best = null;
    for (const other of ctx.combatants()) {
      if (other === c || !other.alive || other.team === c.team) continue;
      const headT = rayVsHead(origin, dir, other);
      if (headT !== null && headT < wallDist && (!best || headT < best.t)) {
        best = { t: headT, target: other, part: 'head' };
        continue;
      }
      const body = rayVsBody(origin, dir, other);
      if (body && body.t < wallDist && (!best || body.t < best.t)) {
        best = { t: body.t, target: other, part: body.y - other.pos.y < 0.85 ? 'legs' : 'body' };
      }
    }
    const endT = best ? best.t : wallDist;
    const ex = origin.x + dir.x * endT, ey = origin.y + dir.y * endT, ez = origin.z + dir.z * endT;
    ctx.effects.tracer(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez);
    if (best) {
      let dmg = def.damage;
      if (best.part === 'head') dmg *= def.headMult;
      else if (best.part === 'legs') dmg *= 0.75;
      if (best.t > 25) dmg *= Math.max(0.65, 1 - (best.t - 25) * 0.008);
      ctx.effects.burst(ex, ey, ez, 0xa8232a, best.part === 'head' ? 10 : 6, 2.2, 0.4);
      ctx.damage(best.target, dmg, c, best.part, def.id);
    } else if (wall) {
      ctx.effects.burst(ex, ey, ez, 0xcbb693, 5, 1.8, 0.35);
    }
  }

  function throwGrenade(c, kind, origin, dir, now, power = 15) {
    if (!c.alive || c.loadout.grenades[kind] <= 0 || now < c.grenadeLockUntil) return false;
    c.loadout.grenades[kind] -= 1;
    c.grenadeLockUntil = now + 0.55;
    const mesh = buildGrenade(kind);
    mesh.position.copy(origin);
    scene.add(mesh);
    projectiles.push({
      kind, mesh, owner: c,
      vx: dir.x * power, vy: dir.y * power + 3.2, vz: dir.z * power,
      fuse: kind === 'flash' ? 1.5 : kind === 'smoke' ? 1.1 : 1.9,
      settled: 0,
    });
    ctx.audio.throwIt();
    return true;
  }

  function detonate(p, now) {
    const pos = p.mesh.position;
    const def = GRENADES[p.kind];
    if (p.kind === 'frag') {
      ctx.effects.explosion(pos.x, 0.4, pos.z);
      ctx.audio.explosion();
      ctx.shake?.(0.35);
      for (const other of ctx.combatants()) {
        if (!other.alive) continue;
        const d = Math.hypot(other.pos.x - pos.x, other.pos.z - pos.z);
        if (d > def.radius) continue;
        const blocked = rayScene(pos.x, 1.0, pos.z,
          (other.pos.x - pos.x) / (d || 1), 0.1, (other.pos.z - pos.z) / (d || 1), d);
        if (blocked && blocked.dist < d - 0.4) continue;
        const dmg = def.damage * (1 - d / (def.radius * 1.25));
        if (dmg > 2) ctx.damage(other, dmg, p.owner, 'body', 'frag');
      }
    } else if (p.kind === 'smoke') {
      ctx.effects.smoke(pos.x, 0, pos.z, def.radius, def.duration, now);
      ctx.audio.smokePop();
    } else if (p.kind === 'flash') {
      ctx.effects.burst(pos.x, pos.y, pos.z, 0xffffff, 26, 5, 0.3, 0);
      ctx.audio.flash();
      ctx.flashed(pos, def.radius, def.duration);
    }
    scene.remove(p.mesh);
  }

  function update(dt, now) {
    for (let i = reloads.length - 1; i >= 0; i--) {
      const r = reloads[i];
      if (now >= r.until) {
        const w = currentWeapon(r.c);
        if (w && r.c.alive) {
          const def = WEAPONS[w.id];
          const take = Math.min(def.mag - w.mag, w.reserve);
          w.mag += take;
          w.reserve -= take;
        }
        reloads.splice(i, 1);
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.fuse -= dt;
      p.vy -= 12.5 * dt;
      const m = p.mesh.position;
      m.x += p.vx * dt; m.y += p.vy * dt; m.z += p.vz * dt;
      if (m.y < 0.09) {
        m.y = 0.09;
        if (Math.abs(p.vy) > 1.4) { p.vy = -p.vy * 0.38; p.vx *= 0.7; p.vz *= 0.7; ctx.audio.bounce(); }
        else { p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
      }
      // Walls: cheap axis clamp against the yard bounds keeps grenades in play.
      if (m.x < -34 || m.x > 34) { m.x = Math.sign(m.x) * 34; p.vx *= -0.4; }
      if (m.z < -26 || m.z > 26) { m.z = Math.sign(m.z) * 26; p.vz *= -0.4; }
      if (p.fuse <= 0) {
        detonate(p, now);
        projectiles.splice(i, 1);
      }
    }
  }

  return { fire, startReload, throwGrenade, update };
}
