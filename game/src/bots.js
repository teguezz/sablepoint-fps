// Bot brains: every non-player combatant is driven from here. Bots walk the map's waypoint
// graph (A* between named nodes), follow a team plan each round — attackers pick a site and a
// lane each, the carrier plants, defenders hold points and rotate — and fight with human-like
// limits: a vision cone, line of sight blocked by walls and smoke, a reaction delay, aim error
// that settles the longer they track a target, and burst fire with pauses. They hear gunfire
// through the noise events the arsenal reports and turn toward it.

import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { moveCircle } from './collision.js';
import { losClear } from './collision.js';
import { buildCharacter, fitGun } from './viewmodels.js';
import { currentWeapon } from './weapons.js';

// --- Waypoint graph (built once) ---
const nodePos = new Map();
for (const [id, [x, z]] of Object.entries(MAP.nodes)) nodePos.set(id, { x, z });
const adjacency = new Map();
for (const id of nodePos.keys()) adjacency.set(id, []);
for (const [a, b] of MAP.edges) { adjacency.get(a).push(b); adjacency.get(b).push(a); }

function nearestNode(x, z) {
  let best = null, bd = Infinity;
  for (const [id, p] of nodePos) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const open = new Map([[fromId, 0]]);
  const came = new Map();
  const cost = new Map([[fromId, 0]]);
  const target = nodePos.get(toId);
  const h = (id) => { const p = nodePos.get(id); return Math.hypot(p.x - target.x, p.z - target.z); };
  while (open.size) {
    let cur = null, cf = Infinity;
    for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
    if (cur === toId) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const next of adjacency.get(cur)) {
      const p = nodePos.get(cur), q = nodePos.get(next);
      const g = cost.get(cur) + Math.hypot(p.x - q.x, p.z - q.z);
      if (g < (cost.get(next) ?? Infinity)) {
        cost.set(next, g);
        came.set(next, cur);
        open.set(next, g + h(next));
      }
    }
  }
  return [toId];
}

// A route is A* legs through any must-pass nodes, as a flat list of world points.
function routePoints(from, viaIds, toId) {
  const ids = [];
  let cur = nearestNode(from.x, from.z);
  for (const id of [...viaIds, toId]) {
    const leg = findPath(cur, id);
    ids.push(...(ids.length ? leg.slice(1) : leg));
    cur = id;
  }
  return ids.map((id) => nodePos.get(id));
}

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

export function createBots(ctx) {
  const models = new Map();

  function attachModels(combatants) {
    for (const c of combatants) {
      if (c.isPlayer) continue;
      const model = buildCharacter(c.team);
      ctx.scene.add(model.group);
      models.set(c.id, model);
    }
  }

  function newBrain(c) {
    return {
      path: [], target: null, state: 'advance', role: 'rifle',
      seen: null, lastSeenAt: -9, lastSeenPos: null, reactionUntil: 0,
      aimErr: 0.4, burstLeft: 0, pauseUntil: 0, strafeDir: 0, strafeUntil: 0,
      holdPos: null, peekPos: null, peekUntil: 0, crouched: false,
      alertPos: null, alertUntil: 0, channel: null, thinkAt: Math.random() * 0.15,
      smokeUsed: false, nadeAt: 0, flankSet: false, guardSet: false,
      stuckAt: 0, lastX: c.pos.x, lastZ: c.pos.z, walkPhase: 0, fallT: 0,
    };
  }

  // Team plans, set by rounds.js at each round start. attackers: [{c, via, site}], etc.
  function planRound(plans) {
    for (const plan of plans) {
      const c = plan.c;
      c.brain = newBrain(c);
      c.brain.role = plan.role ?? 'rifle';
      if (plan.hold) {
        c.brain.holdPos = { x: plan.hold[0], z: plan.hold[1] };
        c.brain.state = 'hold';
        setPath(c, routePoints(c.pos, [], nearestNode(plan.hold[0], plan.hold[1])));
      } else if (plan.site) {
        c.brain.site = plan.site;
        setPath(c, routePoints(c.pos, plan.via ?? [], plan.site === 'A' ? 'siteA' : 'siteB'));
      }
    }
  }

  function setPath(c, points) {
    c.brain.path = points.slice();
    c.brain.target = c.brain.path.shift() ?? null;
  }

  function pathTo(c, x, z, via = []) {
    setPath(c, [...routePoints(c.pos, via, nearestNode(x, z)), { x, z }]);
  }

  function canSee(c, other, now) {
    const dx = other.pos.x - c.pos.x, dz = other.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 48) return false;
    // Vision cone 110°, unless the target is very close (heard as much as seen).
    if (dist > 3.5) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.35) return false;
    }
    const eyeY = c.pos.y + (c.crouch ? 1.15 : 1.55);
    const targetY = other.pos.y + (other.crouch ? 1.0 : 1.3);
    if (!losClear(c.pos.x, eyeY, c.pos.z, other.pos.x, targetY, other.pos.z)) return false;
    if (ctx.smokeBlocks(c.pos.x, eyeY, c.pos.z, other.pos.x, targetY, other.pos.z, now)) return false;
    return true;
  }

  function perceive(c, now) {
    const b = c.brain;
    let best = null, bd = Infinity;
    for (const other of ctx.combatants()) {
      if (!other.alive || other.team === c.team) continue;
      if (canSee(c, other, now)) {
        const d = Math.hypot(other.pos.x - c.pos.x, other.pos.z - c.pos.z);
        if (d < bd) { bd = d; best = other; }
      }
    }
    if (best) {
      if (b.seen !== best) { b.reactionUntil = now + c.brainSkill.reaction; b.aimErr = 0.42; }
      b.seen = best;
      b.lastSeenAt = now;
      b.lastSeenPos = { x: best.pos.x, z: best.pos.z };
      b.alertPos = null;
    } else if (now - b.lastSeenAt > 0.4) {
      b.seen = null;
    }
    // Gunfire: turn toward fresh noise from the other team.
    for (const n of ctx.noise()) {
      if (n.team === c.team || now - n.at > 0.6) continue;
      const d = Math.hypot(n.x - c.pos.x, n.z - c.pos.z);
      if (d < n.r) { b.alertPos = { x: n.x, z: n.z }; b.alertUntil = now + 2.5; }
    }
  }

  function moveAlong(c, dt, speed) {
    const b = c.brain;
    if (!b.target) { c.vel.x = 0; c.vel.z = 0; return true; }
    const dx = b.target.x - c.pos.x, dz = b.target.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      b.target = b.path.shift() ?? null;
      return !b.target;
    }
    const vx = (dx / dist) * speed, vz = (dz / dist) * speed;
    c.vel.x = vx; c.vel.z = vz;
    c.pos.x += vx * dt;
    c.pos.z += vz * dt;
    moveCircle(c.pos, 0.42, c.pos.y, 1.8);
    faceToward(c, Math.atan2(dx, dz), dt, 10);
    b.walkPhase += dt * speed * 1.9;
    // Stuck? Skip to the next point.
    if (Math.hypot(c.pos.x - b.lastX, c.pos.z - b.lastZ) < 0.05) {
      b.stuckAt += dt;
      if (b.stuckAt > 0.8) { b.target = b.path.shift() ?? null; b.stuckAt = 0; }
    } else b.stuckAt = 0;
    b.lastX = c.pos.x; b.lastZ = c.pos.z;
    return false;
  }

  function faceToward(c, yaw, dt, rate = 8) {
    let d = yaw - c.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    c.yaw += d * Math.min(1, dt * rate);
  }

  // Lob a grenade at a ground point: face it, then let the arsenal's throw physics carry
  // it, with the throw's power matched to the range so a point-blank smoke stays close.
  const _tgt = new THREE.Vector3();
  function throwAt(c, kind, tx, tz, now) {
    faceToward(c, Math.atan2(tx - c.pos.x, tz - c.pos.z), 1, 10);
    _eye.set(c.pos.x, c.pos.y + 1.5, c.pos.z);
    _tgt.set(tx, 1.1, tz);
    _dir.copy(_tgt).sub(_eye).normalize();
    const range = Math.hypot(tx - c.pos.x, tz - c.pos.z);
    const power = Math.max(4, Math.min(15, range * 0.95));
    return ctx.arsenal.throwGrenade(c, kind, _eye, _dir, now, power);
  }

  function engage(c, dt, now) {
    const b = c.brain;
    const foe = b.seen;
    c.crouch = false;
    if (!foe) return;
    const dx = foe.pos.x - c.pos.x, dz = foe.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    faceToward(c, Math.atan2(dx, dz), dt, 14);
    // Movement in a fight: mostly planted (accuracy), with a sidestep between bursts.
    if (now < b.strafeUntil && b.strafeDir !== 0) {
      const px = Math.cos(c.yaw) * b.strafeDir, pz = -Math.sin(c.yaw) * b.strafeDir;
      c.vel.x = px * 2.4; c.vel.z = pz * 2.4;
      c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
      moveCircle(c.pos, 0.42, c.pos.y, 1.8);
    } else { c.vel.x = 0; c.vel.z = 0; }
    if (now < b.reactionUntil || now < (c.flashUntil ?? 0)) return;
    // Aim: at the chest, sometimes the head at close range; error settles while tracking.
    b.aimErr = Math.max(0.07, b.aimErr - dt * 0.30);
    const err = b.aimErr;
    const aimY = foe.pos.y + (dist < 12 ? 1.58 : 1.28);
    _eye.set(c.pos.x, c.pos.y + 1.55, c.pos.z);
    _dir.set(
      foe.pos.x + (Math.random() * 2 - 1) * err - c.pos.x,
      aimY + (Math.random() * 2 - 1) * err * 0.7 - _eye.y,
      foe.pos.z + (Math.random() * 2 - 1) * err - c.pos.z,
    ).normalize();
    _muzzle.set(c.pos.x + Math.sin(c.yaw) * 0.55, c.pos.y + 1.34, c.pos.z + Math.cos(c.yaw) * 0.55);
    if (b.burstLeft <= 0) {
      if (now < b.pauseUntil) return;
      const def = currentWeapon(c);
      b.burstLeft = def && def.id === 'scatter' ? 1 : 2 + Math.floor(Math.random() * 3);
    }
    if (ctx.arsenal.fire(c, _eye, _dir, _muzzle, now)) {
      b.burstLeft -= 1;
      if (b.burstLeft <= 0) {
        b.pauseUntil = now + 0.35 + Math.random() * 0.45;
        if (Math.random() < 0.4) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeUntil = now + 0.45; }
        const w = currentWeapon(c);
        if (w && w.mag <= 4) ctx.arsenal.startReload(c, now);
      }
    }
  }

  function update(dt, now) {
    const match = ctx.match();
    for (const c of ctx.combatants()) {
      if (c.isPlayer) continue;
      const b = c.brain;
      const model = models.get(c.id);
      if (!c.alive) {
        // Death fall, then stillness.
        if (model && b.fallT < 1) {
          b.fallT = Math.min(1, b.fallT + dt * 2.6);
          model.group.rotation.x = -Math.PI / 2 * b.fallT * 0.92;
          model.group.position.set(c.pos.x, 0.12, c.pos.z);
        }
        continue;
      }
      if (!b) continue;
      if (now >= b.thinkAt) {
        b.thinkAt = now + 0.12;
        perceive(c, now);
      }
      const flashed = now < (c.flashUntil ?? 0);
      const inCombatPhase = match.phase === 'live' || match.phase === 'planted';
      if (b.seen && !flashed && inCombatPhase) engage(c, dt, now);
      else if (inCombatPhase) act(c, dt, now, match);
      else { c.vel.x = 0; c.vel.z = 0; }
      syncModel(c, model);
    }
  }

  // Non-combat behaviour per role and round state, driven by the plans rounds.js hands out and
  // by what the bot has seen or heard since.
  function act(c, dt, now, match) {
    const b = c.brain;
    // A lost target is worth checking: walk to where it was last seen. A Warden with a frag
    // and a fresh, mid-range fix on the enemy lobs the frag at that spot first.
    if (b.lastSeenPos && now - b.lastSeenAt < 4 && !b.seen) {
      if (c.team === 'wardens' && c.loadout.grenades.frag > 0 && now > b.nadeAt) {
        const dN = Math.hypot(b.lastSeenPos.x - c.pos.x, b.lastSeenPos.z - c.pos.z);
        if (dN > 6 && dN < 16 && throwAt(c, 'frag', b.lastSeenPos.x, b.lastSeenPos.z, now)) b.nadeAt = now + 7;
      }
      if (!b.target || Math.hypot(b.target.x - b.lastSeenPos.x, b.target.z - b.lastSeenPos.z) > 2) {
        pathTo(c, b.lastSeenPos.x, b.lastSeenPos.z);
      }
      if (moveAlong(c, dt, 3.4)) b.lastSeenPos = null;
      return;
    }
    if (b.channel) { c.vel.x = 0; c.vel.z = 0; c.crouch = true; return; } // planting / defusing: rounds watches
    c.crouch = false;
    const site = match.targetSite ? MAP.sites[match.targetSite] : null;

    if (c.team === 'vanguard') {
      if (match.phase === 'planted') {
        // Guard the charge from a nearby point.
        if (!b.guardSet) {
          b.guardSet = true;
          const guards = match.targetSite === 'A' ? MAP.holds.guardA : MAP.holds.guardB;
          const g = guards[c.id % guards.length];
          pathTo(c, g[0], g[1]);
        }
        if (moveAlong(c, dt, 3.6)) holdStance(c);
        return;
      }
      // Entry utility: the first attackers to close on the site smoke its heart, so the
      // carrier crosses the last open ground behind a wall the Wardens cannot see through.
      if (site && !insideSite(c.pos, site) && !b.smokeUsed && c.loadout.grenades.smoke > 0) {
        const dS = Math.hypot(site.cx - c.pos.x, site.cz - c.pos.z);
        if (dS < 13 && Math.random() < 0.03 && throwAt(c, 'smoke', site.cx, site.cz, now)) b.smokeUsed = true;
      }
      if (b.role === 'carrier') {
        if (site && insideSite(c.pos, site)) {
          b.channel = { kind: 'plant', startedAt: now };
          c.vel.x = 0; c.vel.z = 0;
          faceToward(c, -Math.PI / 2, dt);
          return;
        }
        if (moveAlong(c, dt, 4.35) && site) pathTo(c, site.cx, site.cz);
        return;
      }
      // Rifles: follow the plan; on arrival near the site, settle onto a guard point.
      if (moveAlong(c, dt, 4.35)) {
        if (b.alertPos && now < b.alertUntil) pathTo(c, b.alertPos.x, b.alertPos.z);
        else if (site) {
          const guards = match.targetSite === 'A' ? MAP.holds.guardA : MAP.holds.guardB;
          const g = guards[c.id % guards.length];
          if (Math.hypot(g[0] - c.pos.x, g[1] - c.pos.z) > 1.2) pathTo(c, g[0], g[1]);
          else holdStance(c);
        }
      }
    } else {
      // Wardens.
      if (match.phase === 'planted') {
        // Retake shape: the last Warden swings wide through the Crossing to hit the site
        // from the far side while the rest come straight in; the defuser smokes the Charge
        // first, so the Vanguard guards are shooting into a cloud.
        if (!b.flankSet) {
          b.flankSet = true;
          if (c.id === 9 && site) pathTo(c, site.cx, site.cz, ['midGap']);
        }
        if (site && insideSite(c.pos, site)) {
          const charge = match.chargePos;
          const d = Math.hypot(charge.x - c.pos.x, charge.z - c.pos.z);
          if (d > 1.1) { pathTo(c, charge.x, charge.z); moveAlong(c, dt, 4.2); }
          else if (!b.smokeUsed && c.loadout.grenades.smoke > 0 && throwAt(c, 'smoke', charge.x, charge.z, now)) {
            b.smokeUsed = true;
          } else { b.channel = { kind: 'defuse', startedAt: now }; c.vel.x = 0; c.vel.z = 0; }
        } else if (!b.target) pathTo(c, site ? site.cx : c.pos.x, site ? site.cz : c.pos.z);
        else moveAlong(c, dt, 4.2);
        return;
      }
      if (b.state === 'hold') {
        if (b.holdPos && Math.hypot(b.holdPos.x - c.pos.x, b.holdPos.z - c.pos.z) > 0.8) {
          moveAlong(c, dt, 4.2);
        } else {
          // Settled: peek between the hold point and a step out, crouching half the time.
          c.vel.x = 0; c.vel.z = 0;
          if (now > b.peekUntil) {
            b.peekUntil = now + 1.6 + Math.random() * 2.2;
            b.crouched = Math.random() < 0.45;
            b.peekYaw = c.yaw + (Math.random() - 0.5) * 1.2;
          }
          c.crouch = b.crouched;
          faceToward(c, b.peekYaw ?? c.yaw, dt, 3);
          // Rotate on a strong alert: a teammate's fight or the charge being planted nearby.
          if (b.alertPos && now < b.alertUntil && Math.random() < 0.5) {
            pathTo(c, b.alertPos.x, b.alertPos.z);
            b.state = 'rotate';
          }
        }
        return;
      }
      // Rotating / hunting wardens just walk their path, then settle near its end.
      if (moveAlong(c, dt, 4.1)) { b.state = 'hold'; b.holdPos = { x: c.pos.x, z: c.pos.z }; }
    }
  }

  function holdStance(c) {
    c.vel.x = 0; c.vel.z = 0;
    c.crouch = (c.id % 2 === 0);
  }

  function insideSite(pos, site) {
    return pos.x >= site.x0 && pos.x <= site.x1 && pos.z >= site.z0 && pos.z <= site.z1;
  }

  function syncModel(c, model) {
    if (!model) return;
    // The carried gun tracks the bot's current weapon, so a Kestrel reads longer than a P9.
    const wid = c.loadout?.[c.loadout.current]?.id;
    if (wid && model.gunKind !== wid) { model.gunKind = wid; fitGun(model, wid); }
    const g = model.group;
    g.position.set(c.pos.x, c.crouch ? -0.34 : 0, c.pos.z);
    g.rotation.set(0, c.yaw, 0);
    const speed = Math.hypot(c.vel.x, c.vel.z);
    const b = c.brain;
    if (speed > 0.3 && b) {
      const swing = Math.sin(b.walkPhase * 2.4) * 0.55;
      model.legL.rotation.x = swing;
      model.legR.rotation.x = -swing;
    } else {
      model.legL.rotation.x *= 0.8;
      model.legR.rotation.x *= 0.8;
    }
  }

  function resetModel(c) {
    const model = models.get(c.id);
    if (!model) return;
    model.group.rotation.set(0, c.yaw, 0);
    model.group.position.set(c.pos.x, 0, c.pos.z);
    if (c.brain) c.brain.fallT = 0;
  }

  return { attachModels, planRound, update, resetModel, pathTo };
}
