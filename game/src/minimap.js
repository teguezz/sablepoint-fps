// The minimap: a top-down canvas of Rustfall Yard — walls, the two sites, the player as a
// direction wedge, teammates as ember dots, and enemies only as brief pings when they fire
// (or when the charge is planted and everyone knows where the fight is). North is up.

import { MAP } from './mapdata.js';

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx = (x) => ((x + MAP.groundW / 2) / MAP.groundW) * W;
  const sz = (z) => ((z + MAP.groundD / 2) / MAP.groundD) * H;

  function draw(state) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(18,20,26,0.82)';
    g.fillRect(0, 0, W, H);
    // Sites.
    for (const site of [MAP.sites.A, MAP.sites.B]) {
      g.fillStyle = 'rgba(255,154,60,0.16)';
      g.fillRect(sx(site.x0), sz(site.z0), sx(site.x1) - sx(site.x0), sz(site.z1) - sz(site.z0));
      g.fillStyle = 'rgba(255,214,140,0.9)';
      g.font = '700 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(site.id, sx(site.cx), sz(site.cz) + 4);
    }
    // Walls.
    g.fillStyle = 'rgba(210,200,180,0.5)';
    for (const s of MAP.solids) {
      if (s.y0 > 0) continue;
      g.fillRect(sx(s.x - s.w / 2), sz(s.z - s.d / 2), Math.max(1.5, (s.w / MAP.groundW) * W), Math.max(1.5, (s.d / MAP.groundD) * H));
    }
    // The charge.
    if (state.chargePos) {
      g.fillStyle = '#ff2a1a';
      g.beginPath();
      g.arc(sx(state.chargePos.x), sz(state.chargePos.z), 3.2, 0, Math.PI * 2);
      g.fill();
    }
    // Combatants.
    for (const c of state.combatants) {
      if (!c.alive) continue;
      if (c.isPlayer) continue;
      const friendly = c.team === state.playerTeam;
      const pinged = state.now - (c.lastShotAt ?? -9) < 2.2;
      if (!friendly && !pinged && state.phase !== 'planted') continue;
      g.fillStyle = friendly ? '#ff9a3c' : '#ff5a4a';
      g.beginPath();
      g.arc(sx(c.pos.x), sz(c.pos.z), friendly ? 2.6 : 3, 0, Math.PI * 2);
      g.fill();
    }
    // Player wedge, pointing along the view yaw.
    const p = state.player;
    if (p && p.alive) {
      const px = sx(p.pos.x), py = sz(p.pos.z);
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(px + fx * 7, py + fz * 7);
      g.lineTo(px - fz * 4.4 - fx * 2, py + fx * 4.4 - fz * 2);
      g.lineTo(px + fz * 4.4 - fx * 2, py - fx * 4.4 - fz * 2);
      g.closePath();
      g.fill();
    }
  }

  return { draw };
}
