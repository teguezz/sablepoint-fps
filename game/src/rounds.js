// The match: combatants, the round state machine (buy → live → planted → over), the economy,
// the Charge (carry, drop, plant, defuse, detonate), damage and deaths, and every callback the
// arsenal, bots and HUD need. This is the one place match state lives; other modules read it
// through the view this factory hands them and change it only through these functions.

import * as THREE from 'three';
import { MATCH, ECONOMY as ECON, WEAPONS, GRENADES, TEAMS, ARMOR, BUY_MENU, CALLSIGNS } from './config.js';
import { MAP } from './mapdata.js';
import { createArsenal, defaultLoadout, makeWeaponState, currentWeapon } from './weapons.js';
import { createBots } from './bots.js';
import { buildCharge } from './viewmodels.js';
import { losClear } from './collision.js';

const NAMES = {
  vanguard: ['YOU', ...CALLSIGNS.vanguard],
  wardens: [...CALLSIGNS.wardens],
};
const GRENADE_CAPS = { frag: 1, smoke: 1, flash: 2 };

export function createMatch(deps) {
  const { scene, camera, effects, audio, input, hud, minimap, playerCtl, rng } = deps;
  let now = 0;

  // --- Combatants ---
  const combatants = [];
  function makeCombatant(id, team, name, isPlayer) {
    return {
      id, team, name, isPlayer, alive: true, health: 100,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      yaw: 0, pitch: 0, crouch: false, airborne: false, ads: false, quiet: false,
      loadout: defaultLoadout(), money: ECON.start,
      kills: 0, deaths: 0, hurtAt: -9, lastShotAt: -9,
      nextShotAt: 0, reloadUntil: 0, reloadStartedAt: 0, switchUntil: 0, grenadeLockUntil: 0,
      flashUntil: 0, brain: null, brainSkill: { reaction: 0.36 + rng.next() * 0.3 },
    };
  }
  for (let i = 0; i < MATCH.teamSize; i++) combatants.push(makeCombatant(i, 'vanguard', NAMES.vanguard[i], i === 0));
  for (let i = 0; i < MATCH.teamSize; i++) combatants.push(makeCombatant(5 + i, 'wardens', NAMES.wardens[i], false));
  const player = combatants[0];
  const byTeam = (t) => combatants.filter((c) => c.team === t);
  const aliveOf = (t) => byTeam(t).filter((c) => c.alive);

  // --- Shared noise log (gunfire, footsteps) that bots listen to ---
  const noiseLog = [];
  function addNoise(x, z, r, team) {
    noiseLog.push({ x, z, r, team, at: now });
    if (noiseLog.length > 24) noiseLog.shift();
  }

  // --- Match state ---
  const S = {
    started: false, phase: 'idle', phaseT: 0, round: 0,
    scoreV: 0, scoreW: 0, history: [], lossStreak: { vanguard: 0, wardens: 0 },
    targetSite: 'A', carrier: null,
    charge: { state: 'carried', pos: new THREE.Vector3(), site: null },
    winner: null, reason: '', beepAt: 0, matchWinner: null,
  };
  const chargeVis = buildCharge();
  scene.add(chargeVis.group);

  let shakeAmp = 0;
  let bloom = 0;
  let hurtFlash = 0;
  let flashStrength = 0;
  let playerChannel = null;
  let prevMouse = false;

  // --- Damage, deaths, flashes (the arsenal's view of the world) ---
  function damage(target, amount, attacker, part, via) {
    if (!target.alive || (S.phase !== 'live' && S.phase !== 'planted')) return;
    if (target.loadout.armor) amount *= ARMOR.factor;
    target.health -= amount;
    target.hurtAt = now;
    const killed = target.health <= 0;
    if (attacker?.isPlayer) {
      hud.hitmark(part === 'head');
      audio.hit(killed);
      bloom = Math.min(16, bloom + 1.6);
    }
    if (target.isPlayer && attacker) {
      hurtFlash = 0.6;
      audio.hurt();
      const rel = Math.atan2(attacker.pos.x - target.pos.x, attacker.pos.z - target.pos.z) - target.yaw;
      hud.damageFrom(rel);
    }
    if (killed) kill(target, attacker, via, part);
  }

  function kill(target, attacker, via, part) {
    target.alive = false;
    target.health = 0;
    target.deaths += 1;
    target.vel.set(0, 0, 0);
    if (attacker && attacker !== target) {
      attacker.kills += 1;
      attacker.money = Math.min(16000, attacker.money + ECON.kill);
    }
    const viaName = via === 'frag' ? 'Frag Charge' : (WEAPONS[via]?.name ?? '—');
    hud.killfeed(`${attacker ? attacker.name : '—'}  ▸ ${viaName}${part === 'head' ? ' ⌖' : ''} ▸  ${target.name}`);
    if (S.carrier === target && S.charge.state === 'carried') {
      S.charge.state = 'dropped';
      S.charge.pos.copy(target.pos);
      S.carrier = null;
      hud.banner('CHARGE DROPPED', '', 1400);
    }
    if (target.isPlayer) audio.roundEnd(false);
  }

  function flashed(pos, radius, duration) {
    for (const c of combatants) {
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d > radius) continue;
      const eyeY = c.pos.y + 1.4;
      if (!losClear(pos.x, pos.y, pos.z, c.pos.x, eyeY, c.pos.z)) continue;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const dot = ((pos.x - c.pos.x) * fx + (pos.z - c.pos.z) * fz) / (d || 1);
      const factor = dot > 0.3 ? 1 : dot > -0.3 ? 0.45 : 0.15;
      if (c.isPlayer) {
        flashStrength = Math.max(flashStrength, factor);
        c.flashUntil = Math.max(c.flashUntil, now + duration * factor);
      } else {
        c.flashUntil = Math.max(c.flashUntil, now + duration * factor * 1.15);
      }
    }
  }

  // --- The arsenal and the bots, wired to the state above ---
  const arsenal = createArsenal({
    scene, effects, audio, camera,
    combatants: () => combatants,
    damage, flashed,
    noise: (x, z, r, team) => addNoise(x, z, r, team),
    kick: (a) => playerCtl.kick(a),
    nearPlayer: (pos) => pos.distanceTo(player.pos) < 16,
    playerPos: () => player.pos,
    shake: (a) => { shakeAmp = Math.max(shakeAmp, a); },
  });
  const bots = createBots({
    scene, arsenal,
    combatants: () => combatants,
    match: () => ({ phase: S.phase, targetSite: S.targetSite, chargePos: S.charge.state === 'planted' || S.charge.state === 'dropped' ? S.charge.pos : null }),
    noise: () => noiseLog,
    smokeBlocks: (x0, y0, z0, x1, y1, z1, t) => effects.smokeBlocks(x0, y0, z0, x1, y1, z1, t),
  });
  bots.attachModels(combatants);
  playerCtl.bind(player);

  // --- Economy ---
  function buy(c, key) {
    if (c !== player || S.phase !== 'buy') return;
    const L = c.loadout;
    const spend = (price) => { c.money -= price; audio.buy(); hud.renderBuy({ money: c.money, loadout: L, timeLeft: S.phaseT }); };
    if (key === 'armor') {
      if (L.armor || c.money < ARMOR.price) return audio.denied();
      L.armor = true; return spend(ARMOR.price);
    }
    if (WEAPONS[key]) {
      const def = WEAPONS[key];
      if (c.money < def.price) return audio.denied();
      const slot = def.slot;
      if (L[slot]?.id === key) return audio.denied();
      L[slot] = makeWeaponState(key);
      if (slot === 'primary' || L.current === 'sidearm') { L.current = slot; c.switchUntil = now + 0.35; playerCtl.setWeapon(key); }
      return spend(def.price);
    }
    if (GRENADES[key]) {
      if (c.money < GRENADES[key].price || L.grenades[key] >= GRENADE_CAPS[key]) return audio.denied();
      L.grenades[key] += 1;
      return spend(GRENADES[key].price);
    }
  }
  hud.onBuyRequest = (key) => buy(player, key);

  // --- Bot shopping: bots spend their own money in the buy phase, like the player does ---
  // Each bot has a taste: the designated Warden marksman saves for the Kestrel, the Charge
  // carrier favours the fast Raptor, everyone else works down the rifle list. Armour comes
  // after a primary, grenades after armour — attackers smoke and flash their entry, defenders
  // keep a frag for a heard contact. A bot too poor for the cheapest primary either forces the
  // Hunter .45 (when it can also stay useful next round) or saves untouched, pistol-round style.
  const BOT_PRIMARY = {
    carrier: ['raptor', 'vk7', 'scatter'],
    marksman: ['kestrel', 'vk7', 'raptor'],
    rifle: ['vk7', 'raptor', 'scatter'],
  };
  function botBuy(c, role) {
    const L = c.loadout;
    const afford = (id) => c.money >= WEAPONS[id].price;
    const give = (id) => {
      const def = WEAPONS[id];
      c.money -= def.price;
      L[def.slot] = makeWeaponState(id);
      if (def.slot === 'primary') L.current = 'primary';
    };
    if (!L.primary) {
      const prefs = BOT_PRIMARY[role] ?? BOT_PRIMARY.rifle;
      const pick = prefs.find((id) => afford(id));
      if (pick) give(pick);
      else if (c.money >= 1000 && L.sidearm?.id !== 'hunter') give('hunter'); // force-buy
    }
    if (L.primary && !L.armor && c.money >= ARMOR.price + 300) { L.armor = true; c.money -= ARMOR.price; }
    if (L.primary && L.sidearm?.id !== 'hunter' && c.money >= WEAPONS.hunter.price + 900) give('hunter');
    const nades = c.team === 'vanguard' ? ['smoke', 'frag'] : ['frag', 'smoke'];
    for (const kind of nades) {
      if (L.grenades[kind] < GRENADE_CAPS[kind] && c.money >= GRENADES[kind].price + 200) {
        L.grenades[kind] += 1;
        c.money -= GRENADES[kind].price;
      }
    }
  }

  // --- Round flow ---
  function startMatch() {
    S.scoreV = 0; S.scoreW = 0; S.round = 0; S.history = [];
    S.lossStreak = { vanguard: 0, wardens: 0 };
    for (const c of combatants) {
      c.money = ECON.start; c.kills = 0; c.deaths = 0;
      c.loadout = defaultLoadout();
    }
    S.started = true;
    nextRound();
  }

  function nextRound() {
    S.round += 1;
    S.targetSite = rng.next() < 0.5 ? 'A' : 'B';
    const attackers = byTeam('vanguard');
    const defenders = byTeam('wardens');
    // Reset everyone to spawn, alive and healed; the dead lose their kit, survivors keep it.
    const place = (list, spawns) => {
      list.forEach((c, i) => {
        const s = spawns[i % spawns.length];
        c.pos.set(s.x, 0, s.z);
        c.vel.set(0, 0, 0);
        c.yaw = s.yaw; c.pitch = 0; c.crouch = false; c.airborne = false;
        c.alive = true; c.health = 100;
        c.nextShotAt = 0; c.reloadUntil = 0; c.switchUntil = 0; c.flashUntil = 0;
        if (c._diedLastRound) c.loadout = defaultLoadout();
        c._diedLastRound = false;
        const w = currentWeapon(c);
        if (!w) { c.loadout.sidearm = makeWeaponState('p9'); c.loadout.current = 'sidearm'; }
        bots.resetModel(c);
      });
    };
    place(attackers, MAP.spawns.vanguard);
    place(defenders, MAP.spawns.wardens);
    playerCtl.setWeapon(currentWeapon(player).id);
    playerCtl.bind(player);
    // The Charge: a random attacker carries it.
    S.carrier = attackers[Math.floor(rng.next() * attackers.length)];
    S.charge.state = 'carried';
    S.charge.site = null;
    // Bot plans.
    const viaFor = { A: [[], ['midGap', 'linkAM', 'linkAN'], []], B: [[], ['midGap', 'linkBM', 'linkBN'], []] };
    const plans = [];
    let rifleIdx = 0;
    for (const c of attackers) {
      if (c.isPlayer) continue;
      if (c === S.carrier) { botBuy(c, 'carrier'); plans.push({ c, role: 'carrier', site: S.targetSite }); }
      else { botBuy(c, 'rifle'); plans.push({ c, role: 'rifle', site: S.targetSite, via: viaFor[S.targetSite][rifleIdx++ % 3] }); }
    }
    const holds = [MAP.holds.A[0], MAP.holds.A[1], MAP.holds.B[0], MAP.holds.B[1], MAP.holds.mid[0]];
    defenders.forEach((c, i) => {
      botBuy(c, i === 2 ? 'marksman' : 'rifle');
      plans.push({ c, role: 'hold', hold: holds[i % holds.length] });
    });
    bots.planRound(plans);
    S.phase = 'buy';
    S.phaseT = MATCH.buyTime;
    S.winner = null;
    hud.showBuy(true);
    hud.renderBuy({ money: player.money, loadout: player.loadout, timeLeft: S.phaseT });
    hud.banner(`ROUND ${S.round}`, `Vanguard push ${S.targetSite === 'A' ? 'FOUNDRY (A)' : 'DEPOT (B)'} — press B to buy`, 2600);
    audio.click();
  }

  function endRound(winner, reason) {
    S.phase = 'over';
    S.phaseT = MATCH.endTime;
    S.winner = winner;
    S.reason = reason;
    if (winner === 'vanguard') S.scoreV += 1; else S.scoreW += 1;
    S.history.push(winner);
    const loser = winner === 'vanguard' ? 'wardens' : 'vanguard';
    S.lossStreak[winner] = 0;
    S.lossStreak[loser] += 1;
    for (const c of combatants) {
      const won = c.team === winner;
      const bonus = won ? ECON.win : ECON.lossBase + ECON.lossStep * Math.min(4, S.lossStreak[loser] - 1);
      c.money = Math.min(16000, c.money + bonus);
      if (!c.alive) c._diedLastRound = true;
    }
    for (const c of combatants) if (c.brain) c.brain.channel = null;
    playerChannel = null;
    hud.showBuy(false);
    hud.channel(null);
    hud.banner(`${TEAMS[winner].name.toUpperCase()} WIN THE ROUND`, reason, 3400);
    audio.roundEnd(winner === 'vanguard');
    if (S.scoreV >= MATCH.winTarget || S.scoreW >= MATCH.winTarget) {
      S.matchWinner = winner;
    }
  }

  function plantCharge(siteId, planter) {
    S.phase = 'planted';
    S.phaseT = MATCH.bombTime;
    S.charge.state = 'planted';
    S.charge.site = siteId;
    if (planter) {
      S.charge.pos.copy(planter.pos);
      planter.money = Math.min(16000, planter.money + ECON.plant);
    }
    hud.banner('CHARGE PLANTED', siteId === 'A' ? 'Foundry' : 'Depot', 2200);
    audio.plantDone();
  }

  function insideSite(pos, site) {
    return pos.x >= site.x0 && pos.x <= site.x1 && pos.z >= site.z0 && pos.z <= site.z1;
  }
  function siteAt(pos) {
    if (insideSite(pos, MAP.sites.A)) return 'A';
    if (insideSite(pos, MAP.sites.B)) return 'B';
    return null;
  }

  // --- Per-frame update ---
  function update(dt) {
    now += dt;
    bloom = Math.max(0, bloom - dt * 9);
    hurtFlash = Math.max(0, hurtFlash - dt * 1.8);
    shakeAmp = Math.max(0, shakeAmp - dt * 1.4);
    for (let i = noiseLog.length - 1; i >= 0; i--) if (now - noiseLog[i].at > 1) noiseLog.splice(i, 1);

    const inPlay = S.phase === 'live' || S.phase === 'planted';
    const canAct = S.started && player.alive && (inPlay || S.phase === 'buy');

    // Player body + camera.
    if (S.started) {
      if (player.alive) {
        playerCtl.update(dt, now, inPlay);
      } else if (inPlay) {
        spectateCamera();
      }
    }

    if (S.started && S.phase !== 'idle') {
      S.phaseT -= dt;
      phaseLogic(dt);
    }

    // Player combat input.
    if (S.phase === 'buy') handleBuyKeys();
    if (canAct && inPlay) playerActions(dt);
    prevMouse = input.mouseDown;

    // Bots, projectiles, particles.
    if (S.started) bots.update(dt, now);
    arsenal.update(dt, now);
    effects.update(dt, now);

    // The charge visual follows its state.
    updateChargeVisual();

    // Camera shake (explosions, nearby fire) — applied after the player set the camera.
    if (shakeAmp > 0.002 && player.alive) {
      camera.rotation.z += (Math.random() * 2 - 1) * shakeAmp * 0.05;
      camera.rotation.x += (Math.random() * 2 - 1) * shakeAmp * 0.04;
    }
    if (player.flashUntil <= now) flashStrength = 0;

    pushHud();
    minimap.draw({
      combatants, player, playerTeam: 'vanguard',
      phase: S.phase, now, chargePos: S.charge.state === 'planted' || S.charge.state === 'dropped' ? S.charge.pos : null,
    });
  }

  function spectateCamera() {
    const mate = aliveOf('vanguard')[0];
    if (!mate) return;
    camera.position.set(mate.pos.x, mate.pos.y + 1.58, mate.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, mate.yaw + Math.PI, 0);
    if (camera.fov !== 74) { camera.fov = 74; camera.updateProjectionMatrix(); }
  }

  let buySig = '';
  function renderBuyIfChanged() {
    const L = player.loadout;
    const sig = [player.money, Math.ceil(S.phaseT), L.primary?.id, L.sidearm?.id, L.armor,
      L.grenades.frag, L.grenades.smoke, L.grenades.flash].join('|');
    if (sig === buySig) return;
    buySig = sig;
    hud.renderBuy({ money: player.money, loadout: L, timeLeft: S.phaseT });
  }

  function phaseLogic(dt) {
    void dt;
    if (S.phase === 'buy') {
      renderBuyIfChanged();
      if (S.phaseT <= 0) {
        S.phase = 'live';
        S.phaseT = MATCH.roundTime;
        hud.showBuy(false);
        hud.banner('ROUND LIVE', S.carrier === player ? 'You carry the Charge — plant at a site (hold E)' : 'Eliminate the Wardens or plant the Charge', 2000);
      }
      return;
    }
    if (S.phase === 'live') {
      // Bot channels: carrier planting.
      for (const c of combatants) {
        const ch = c.brain?.channel;
        if (!ch) continue;
        if (!c.alive) { c.brain.channel = null; continue; }
        if (ch.kind === 'plant' && S.carrier === c && now - ch.startedAt >= MATCH.plantTime) {
          c.brain.channel = null;
          plantCharge(siteAt(c.pos) ?? S.targetSite, c);
        }
      }
      // Dropped charge: nearest attacker fetches it.
      if (S.charge.state === 'dropped') fetchCharge();
      // Win checks.
      if (aliveOf('wardens').length === 0) return endRound('vanguard', 'Wardens eliminated');
      if (aliveOf('vanguard').length === 0) return endRound('wardens', 'Vanguard eliminated');
      if (S.phaseT <= 0) return endRound('wardens', 'Time expired — the yard holds');
      return;
    }
    if (S.phase === 'planted') {
      // Beeping, faster as the timer runs down.
      const interval = 0.25 + (S.phaseT / MATCH.bombTime) * 0.75;
      if (now >= S.beepAt) { S.beepAt = now + interval; audio.beep(S.phaseT < 8); }
      chargeVis.lampMat.emissiveIntensity = 1.5 + Math.sin(now * (4 + (MATCH.bombTime - S.phaseT))) * 1.2;
      for (const c of combatants) {
        const ch = c.brain?.channel;
        if (!ch || ch.kind !== 'defuse') continue;
        if (!c.alive) { c.brain.channel = null; continue; }
        if (now - ch.startedAt >= MATCH.defuseTime) {
          return endRound('wardens', 'Charge defused');
        }
      }
      if (aliveOf('wardens').length === 0) return endRound('vanguard', 'Wardens eliminated');
      if (S.phaseT <= 0) {
        effects.explosion(S.charge.pos.x, 0.5, S.charge.pos.z);
        audio.explosion();
        shakeAmp = 0.8;
        return endRound('vanguard', 'The Charge detonated');
      }
      return;
    }
    if (S.phase === 'over') {
      if (S.phaseT <= 0) {
        if (S.matchWinner) {
          S.phase = 'matchover';
          hud.banner('', '', 0);
          deps.onMatchEnd?.(S.matchWinner, S.scoreV, S.scoreW);
        } else nextRound();
      }
    }
  }

  function fetchCharge() {
    let best = null, bd = Infinity;
    for (const c of aliveOf('vanguard')) {
      const d = c.pos.distanceTo(S.charge.pos);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    if (bd < 1.5) {
      S.carrier = best;
      S.charge.state = 'carried';
      if (best.brain) {
        best.brain.role = 'carrier';
        best.brain.site = S.targetSite;
        bots.pathTo(best, MAP.sites[S.targetSite].cx, MAP.sites[S.targetSite].cz);
      }
      if (best.isPlayer) hud.banner('CHARGE PICKED UP', 'Plant at a site — hold E', 1600);
      return;
    }
    if (!best.isPlayer && best.brain && !best.brain.fetching) {
      best.brain.fetching = true;
      bots.pathTo(best, S.charge.pos.x, S.charge.pos.z);
    }
  }

  const _eye = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _muzzle = new THREE.Vector3();

  function playerActions(dt) {
    void dt;
    playerCtl.eyePos(_eye);
    playerCtl.aimDir(_dir);
    playerCtl.muzzlePos(_muzzle);
    const w = currentWeapon(player);
    const def = w ? WEAPONS[w.id] : null;
    // Fire: automatics while held, semi-automatics on the click.
    if (input.mouseDown && def) {
      if (def.auto || !prevMouse) arsenal.fire(player, _eye, _dir, _muzzle, now);
    }
    if (input.wasPressed('KeyR')) arsenal.startReload(player, now);
    // Weapon slots.
    const wheel = input.consumeWheel();
    const slotKey = input.wasPressed('Digit1') ? 'primary' : input.wasPressed('Digit2') ? 'sidearm' : null;
    let slot = slotKey;
    if (wheel !== 0) slot = player.loadout.current === 'primary' ? 'sidearm' : 'primary';
    if (slot && player.loadout[slot] && player.loadout.current !== slot) {
      player.loadout.current = slot;
      player.switchUntil = now + 0.35;
      playerCtl.setWeapon(player.loadout[slot].id);
      audio.click();
    }
    // Grenades throw on their keys.
    if (input.wasPressed('Digit3')) arsenal.throwGrenade(player, 'frag', _eye, _dir, now);
    if (input.wasPressed('Digit4')) arsenal.throwGrenade(player, 'smoke', _eye, _dir, now);
    if (input.wasPressed('Digit5')) arsenal.throwGrenade(player, 'flash', _eye, _dir, now);
    // Planting: hold E inside a site while carrying.
    const site = siteAt(player.pos);
    if (S.phase === 'live' && S.carrier === player && site) {
      if (input.keys.has('KeyE')) {
        if (!playerChannel) playerChannel = { startedAt: now };
        const frac = (now - playerChannel.startedAt) / MATCH.plantTime;
        hud.channel('PLANTING THE CHARGE', frac);
        if (frac >= 1) {
          playerChannel = null;
          hud.channel(null);
          plantCharge(site, player);
        }
      } else {
        playerChannel = null;
        hud.channel('Hold E to plant the Charge', 0.001);
      }
    } else if (playerChannel) {
      playerChannel = null;
      hud.channel(null);
    }
  }

  function updateChargeVisual() {
    const g = chargeVis.group;
    if (S.charge.state === 'carried' && S.carrier) {
      g.visible = !S.carrier.isPlayer;
      g.position.set(S.carrier.pos.x, S.carrier.pos.y + 1.52 + Math.sin(now * 2) * 0.03, S.carrier.pos.z);
      g.rotation.y = S.carrier.yaw;
    } else if (S.charge.state === 'dropped' || S.charge.state === 'planted') {
      g.visible = true;
      g.position.set(S.charge.pos.x, 0.32, S.charge.pos.z);
      g.rotation.y = 0.6;
    } else {
      g.visible = false;
    }
    if (S.charge.state !== 'planted') chargeVis.lampMat.emissiveIntensity = 1.2;
  }

  function pushHud() {
    const w = currentWeapon(player);
    const def = w ? WEAPONS[w.id] : null;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const spreadPx = def ? (def.spread + def.moveSpread * Math.min(1, speed / 4.6)) * 620 + bloom : 0;
    const g = player.loadout.grenades;
    hud.update({
      health: player.health, armor: player.loadout.armor, money: player.money, alive: player.alive,
      weaponName: def ? def.name : '', mag: w ? w.mag : null, reserve: w ? w.reserve : null,
      grenadesText: `FRAG ${g.frag} · SMOKE ${g.smoke} · FLASH ${g.flash}`,
      timeLeft: S.phaseT, scoreV: S.scoreV, scoreW: S.scoreW, round: Math.max(1, S.round),
      aliveV: aliveOf('vanguard').length, aliveW: aliveOf('wardens').length, history: S.history,
      phase: S.phase, now,
      phaseLabel: S.phase === 'buy' ? 'BUY PHASE — B for shop' : S.phase === 'live' ? (S.carrier === player ? '⚡ YOU HAVE THE CHARGE' : '') : S.phase === 'over' ? '' : '',
      planted: S.phase === 'planted', plantedSite: S.charge.site === 'A' ? 'FOUNDRY' : 'DEPOT',
      spreadPx, aiming: player.ads, hurtFlash,
      flashLeft: player.flashUntil > now ? Math.min(1, (player.flashUntil - now) / 1.4) * (0.35 + flashStrength * 0.65) : 0,
      spectating: !player.alive && (S.phase === 'live' || S.phase === 'planted') ? (aliveOf('vanguard')[0]?.name ?? '') : null,
    });
    hud.showScoreboard(scoreRows(), input.keys.has('Tab'));
  }

  function scoreRows() {
    return [...combatants]
      .sort((a, b) => b.kills - a.kills)
      .map((c) => ({ name: c.name, team: TEAMS[c.team].name, k: c.kills, d: c.deaths, money: c.money, me: c.isPlayer }));
  }

  // Buy keys during the buy phase: Digit1..Digit9 follow the BUY_MENU order in config.
  function handleBuyKeys() {
    if (S.phase !== 'buy') return;
    BUY_MENU.forEach((item, i) => {
      if (input.wasPressed(`Digit${i + 1}`)) buy(player, item);
    });
  }

  return {
    startMatch, update, buy,
    footstep(quiet) { addNoise(player.pos.x, player.pos.z, quiet ? 6 : 14, 'vanguard'); },
    get now() { return now; },
    get state() { return S; },
    get player() { return player; },
    combatants,
    // Staging hooks for the screenshot scenes in main.js.
    staging: {
      combatants, state: S, player,
      teleport(c, x, z, yaw) { c.pos.set(x, 0, z); c.yaw = yaw; c.vel.set(0, 0, 0); },
      setPhase(phase, t) { S.phase = phase; S.phaseT = t; },
      plantAt(siteId) { S.charge.pos.set(MAP.sites[siteId].cx, 0, MAP.sites[siteId].cz); plantCharge(siteId, null); },
      // Fire one staged shot from c toward a ground point, so a screenshot can catch the
      // tracer and muzzle flash of a fight already in progress.
      stageFire(c, tx, tz) {
        c.yaw = Math.atan2(tx - c.pos.x, tz - c.pos.z);
        _eye.set(c.pos.x, c.pos.y + 1.55, c.pos.z);
        _dir.set(tx - c.pos.x, 1.25 - _eye.y, tz - c.pos.z).normalize();
        _muzzle.set(c.pos.x + Math.sin(c.yaw) * 0.55, c.pos.y + 1.34, c.pos.z + Math.cos(c.yaw) * 0.55);
        arsenal.fire(c, _eye, _dir, _muzzle, now);
      },
    },
  };
}
