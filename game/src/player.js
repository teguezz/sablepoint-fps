// The human player: mouse look, acceleration-based movement with crouch and quiet-walk, and
// the first-person viewmodel (bob, recoil spring, reload dip, aim-down-sights blend).
// The combatant object owns position and velocity; this file drives it from input each step.
// Facing convention for the whole game: forward = (sin(yaw), 0, cos(yaw)).

import * as THREE from 'three';
import { PLAYER, WEAPONS } from './config.js';
import { buildViewmodel } from './viewmodels.js';
import { moveCircle } from './collision.js';
import { currentWeapon } from './weapons.js';

export function createPlayer({ camera, input, audio, onStep }) {
  let c = null; // the bound combatant
  let view = null; // { group, muzzle }
  let viewId = null;
  let recoil = 0;
  let bobPhase = 0;
  let stepAcc = 0;
  let eyeHeight = PLAYER.eye;
  let adsBlend = 0;
  let landDip = 0;

  const viewGroup = new THREE.Group();
  viewGroup.scale.setScalar(0.82);
  camera.add(viewGroup);

  function bind(combatant) {
    c = combatant;
    setWeapon(combatant.loadout[combatant.loadout.current]?.id ?? 'p9');
  }

  function setWeapon(id) {
    if (viewId === id) return;
    viewId = id;
    while (viewGroup.children.length) viewGroup.remove(viewGroup.children[0]);
    view = buildViewmodel(id);
    viewGroup.add(view.group);
  }

  function kick(amount) {
    recoil += amount;
    if (c) c.pitch = Math.min(1.35, c.pitch + amount * 0.32);
  }

  function update(dt, now, canMove) {
    if (!c) return;
    const m = input.consumeMouse();
    if (input.locked) {
      c.yaw -= m.dx * 0.0021;
      c.pitch -= m.dy * 0.0021;
      c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch));
    }
    c.ads = input.rightDown && c.alive && canMove;
    c.crouch = input.keys.has('ControlLeft') || input.keys.has('KeyC');
    const quiet = input.keys.has('ShiftLeft');
    c.quiet = quiet;

    // Wish direction from keys, in facing space.
    let wx = 0, wz = 0;
    if (canMove && c.alive) {
      const f = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
      const r = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      wx = sy * f + -cy * r;
      wz = cy * f + sy * r;
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
    }
    const maxSpeed = c.crouch ? PLAYER.crouchSpeed : quiet ? PLAYER.quietSpeed : PLAYER.walkSpeed;
    const speedNow = Math.hypot(c.vel.x, c.vel.z);
    if (wx !== 0 || wz !== 0) {
      c.vel.x += wx * PLAYER.accel * dt;
      c.vel.z += wz * PLAYER.accel * dt;
      const s = Math.hypot(c.vel.x, c.vel.z);
      if (s > maxSpeed) { c.vel.x *= maxSpeed / s; c.vel.z *= maxSpeed / s; }
    } else {
      const damp = Math.max(0, 1 - PLAYER.friction * dt);
      c.vel.x *= damp;
      c.vel.z *= damp;
    }
    // Jump and gravity; the yard is flat, so the ground is y = 0.
    if (canMove && c.alive && input.keys.has('Space') && !c.airborne) {
      c.vel.y = PLAYER.jumpSpeed;
      c.airborne = true;
    }
    if (c.airborne) {
      c.vel.y -= PLAYER.gravity * dt;
      c.pos.y += c.vel.y * dt;
      if (c.pos.y <= 0) {
        c.pos.y = 0;
        c.vel.y = 0;
        c.airborne = false;
        landDip = 1;
      }
    }
    c.pos.x += c.vel.x * dt;
    c.pos.z += c.vel.z * dt;
    moveCircle(c.pos, PLAYER.radius, c.pos.y, 1.8);

    // Footsteps: a stride every 2.1 m at full speed, quieter and rarer when walking softly.
    if (!c.airborne && speedNow > 0.6) {
      stepAcc += speedNow * dt;
      const stride = quiet ? 2.8 : 2.1;
      if (stepAcc > stride) {
        stepAcc = 0;
        audio.footstep(!quiet);
        onStep?.(quiet);
      }
      bobPhase += dt * speedNow * 1.9;
    }
    landDip = Math.max(0, landDip - dt * 5);

    // Camera: eye height eases between standing and crouched; recoil is a spring on top.
    const targetEye = c.crouch ? PLAYER.crouchEye : PLAYER.eye;
    eyeHeight += (targetEye - eyeHeight) * Math.min(1, dt * 11);
    recoil *= Math.exp(-dt * 9);
    const bobY = Math.sin(bobPhase * 2) * 0.016 * Math.min(1, speedNow / 4);
    camera.position.set(
      c.pos.x,
      c.pos.y + eyeHeight + bobY - landDip * 0.07,
      c.pos.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.set(c.pitch + recoil, c.yaw + Math.PI, Math.sin(bobPhase) * 0.0016 * Math.min(1, speedNow / 4));

    // Viewmodel: hip and ADS anchors blend; recoil pushes the gun back; a reload dips it.
    adsBlend += ((c.ads ? 1 : 0) - adsBlend) * Math.min(1, dt * 12);
    const reloading = now < c.reloadUntil;
    const switching = now < c.switchUntil;
    const reloadSpan = Math.max(0.01, c.reloadUntil - (c.reloadStartedAt ?? now));
    const dip = reloading ? Math.sin(Math.min(1, (now - (c.reloadStartedAt ?? now)) / reloadSpan) * Math.PI) : 0;
    const switchDip = switching ? Math.sin(Math.min(1, 1 - (c.switchUntil - now) / 0.35) * Math.PI) : 0;
    const hip = { x: 0.23, y: -0.225, z: -0.52 };
    const ads = { x: 0, y: -0.148, z: -0.3 };
    viewGroup.position.set(
      hip.x + (ads.x - hip.x) * adsBlend + Math.sin(bobPhase) * 0.006 * (1 - adsBlend),
      hip.y + (ads.y - hip.y) * adsBlend + Math.abs(Math.cos(bobPhase)) * 0.005 * (1 - adsBlend)
        - dip * 0.13 - switchDip * 0.16,
      hip.z + (ads.z - hip.z) * adsBlend + recoil * 1.4,
    );
    viewGroup.rotation.set(-dip * 0.7 - switchDip * 0.5 + recoil * 0.7, 0, 0);
    // ADS narrows the field of view through the current weapon's zoom factor.
    const w = currentWeapon(c);
    const def = w ? WEAPONS[w.id] : null;
    const targetFov = c.ads && def ? 74 / def.ads : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
  }

  return {
    bind,
    setWeapon,
    kick,
    update,
    eyePos(out) {
      out.set(c.pos.x, c.pos.y + eyeHeight, c.pos.z);
      return out;
    },
    aimDir(out) {
      const cp = Math.cos(c.pitch);
      out.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp);
      return out;
    },
    muzzlePos(out) {
      if (view) return view.muzzle.getWorldPosition(out);
      return out.set(c.pos.x, c.pos.y + 1.4, c.pos.z);
    },
    get adsBlend() { return adsBlend; },
  };
}
