// The HUD: every DOM readout — health, armor, ammo, money, round timer, team score, killfeed,
// banners, buy menu, scoreboard, damage vignette, flash overlay and the plant/defuse channel
// bar. rounds.js owns the match; this file only renders what it is handed, plus the buy menu's
// item grid (built from config so prices can never drift from the shop's).

import { WEAPONS, GRENADES, ARMOR, BUY_MENU } from './config.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    hpFill: $('hpfill'), hpNum: $('hpnum'), armor: $('armorstat'), money: $('money'),
    wepName: $('wepname'), ammoMag: $('ammomag'), ammoRes: $('ammores'),
    nades: $('grenades'), timer: $('timer'), scoreV: $('scorev'), scoreW: $('scorew'),
    roundNo: $('roundno'), aliveV: $('alivev'), aliveW: $('alivew'), history: $('history'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('bannertitle'),
    bannerSub: $('bannersub'), vignette: $('vignette'), flash: $('flash'),
    dirhit: $('dirhit'), prompt: $('prompt'), promptLabel: $('promptlabel'),
    promptFill: $('promptfill'), planted: $('planted'), buyMenu: $('buymenu'),
    buyItems: $('buyitems'), buyMoney: $('buymoney'), buyTimer: $('buytimer'),
    scoreboard: $('scoreboard'), sbBody: $('sbbody'), spectate: $('spectate'),
    phase: $('phase'),
  };
  let hitT = null, bannerT = null, dirT = null;
  let histSig = '', aliveSig = '';

  const api = {
    onBuyRequest: null,

    update(s) {
      // Bottom-left vitals.
      const hp = Math.max(0, Math.ceil(s.health));
      els.hpNum.textContent = String(hp);
      els.hpFill.style.width = `${hp}%`;
      els.hpFill.style.background = hp > 55 ? 'var(--ink)' : hp > 25 ? 'var(--ember)' : 'var(--danger)';
      els.armor.textContent = s.armor ? '◈ VEST' : '';
      els.money.textContent = `$${s.money}`;
      // Bottom-right weapon block.
      els.wepName.textContent = s.weaponName ?? '';
      els.ammoMag.textContent = s.mag ?? '–';
      els.ammoRes.textContent = s.reserve !== undefined && s.reserve !== null ? `/ ${s.reserve}` : '';
      els.nades.textContent = s.grenadesText ?? '';
      // Top bar.
      const t = Math.max(0, s.timeLeft);
      const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
      els.timer.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      els.timer.classList.toggle('urgent', t <= 10 && s.phase === 'live');
      els.scoreV.textContent = String(s.scoreV);
      els.scoreW.textContent = String(s.scoreW);
      els.roundNo.textContent = `ROUND ${s.round}`;
      // Alive pips under each score: filled for the standing, hollow for the fallen.
      const aSig = `${s.aliveV ?? 5}|${s.aliveW ?? 5}`;
      if (aSig !== aliveSig) {
        aliveSig = aSig;
        const pips = (n) => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, 5 - n));
        els.aliveV.textContent = pips(s.aliveV ?? 5);
        els.aliveW.textContent = pips(s.aliveW ?? 5);
      }
      // Round-history dots: one per finished round, ember for Vanguard, teal for Wardens.
      const hist = s.history ?? [];
      const hSig = hist.join(',');
      if (hSig !== histSig) {
        histSig = hSig;
        els.history.replaceChildren();
        for (const w of hist) {
          const dot = document.createElement('i');
          dot.className = w === 'vanguard' ? 'v' : 'w';
          els.history.appendChild(dot);
        }
      }
      els.phase.textContent = s.phaseLabel ?? '';
      els.planted.style.display = s.planted ? 'block' : 'none';
      if (s.planted) els.planted.textContent = `⚠ CHARGE PLANTED — ${s.plantedSite}`;
      // Crosshair spread grows with movement and fire, in pixels.
      els.crosshair.style.setProperty('--gap', `${6 + (s.spreadPx ?? 0)}px`);
      els.crosshair.style.opacity = s.aiming ? '0.35' : '1';
      // Damage vignette: steady at low health, flashing on a fresh hit.
      const low = s.health <= 30 && s.alive ? 0.25 + 0.1 * Math.sin(s.now * 5) : 0;
      els.vignette.style.opacity = String(Math.min(0.85, Math.max(low, s.hurtFlash ?? 0)));
      els.flash.style.opacity = String(Math.max(0, s.flashLeft ?? 0));
      els.spectate.style.display = s.spectating ? 'block' : 'none';
      if (s.spectating) els.spectate.textContent = `SPECTATING — ${s.spectating}`;
    },

    hitmark(head) {
      els.hitmarker.className = head ? 'show head' : 'show';
      clearTimeout(hitT);
      hitT = setTimeout(() => { els.hitmarker.className = ''; }, 130);
    },

    banner(title, sub = '', ms = 2400) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.className = 'show';
      clearTimeout(bannerT);
      bannerT = setTimeout(() => { els.banner.className = ''; }, ms);
    },

    killfeed(text) {
      const div = document.createElement('div');
      div.className = 'kf';
      div.textContent = text;
      els.killfeed.prepend(div);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 600); }, 3600);
    },

    damageFrom(angleRad) {
      els.dirhit.style.transform = `translate(-50%,-50%) rotate(${angleRad}rad)`;
      els.dirhit.className = 'show';
      clearTimeout(dirT);
      dirT = setTimeout(() => { els.dirhit.className = ''; }, 650);
    },

    channel(label, frac) {
      if (frac === null || frac === undefined) { els.prompt.style.display = 'none'; return; }
      els.prompt.style.display = 'block';
      els.promptLabel.textContent = label;
      els.promptFill.style.width = `${Math.round(frac * 100)}%`;
    },

    showBuy(show) {
      els.buyMenu.style.display = show ? 'block' : 'none';
    },

    renderBuy({ money, loadout, timeLeft }) {
      els.buyMoney.textContent = `$${money}`;
      els.buyTimer.textContent = `${Math.ceil(timeLeft)}s`;
      els.buyItems.replaceChildren();
      BUY_MENU.forEach((key, i) => {
        const item = document.createElement('button');
        item.className = 'buyitem';
        let name, price, owned = false, afford = false;
        if (key === 'armor') {
          name = 'Kevlar Vest'; price = ARMOR.price; owned = loadout.armor; afford = money >= price;
        } else if (WEAPONS[key]) {
          name = WEAPONS[key].name; price = WEAPONS[key].price; afford = money >= price;
          owned = (loadout.primary?.id === key) || (loadout.sidearm?.id === key);
        } else {
          name = GRENADES[key].name; price = GRENADES[key].price; afford = money >= price;
          owned = loadout.grenades[key] > 0;
        }
        item.disabled = owned || !afford;
        item.innerHTML = `<span class="bk">${i + 1}</span><span class="bn">${name}</span>` +
          `<span class="bp">${owned ? 'OWNED' : '$' + price}</span>`;
        item.addEventListener('click', () => api.onBuyRequest?.(key));
        els.buyItems.appendChild(item);
      });
    },

    showScoreboard(rows, show) {
      els.scoreboard.style.display = show ? 'block' : 'none';
      if (!show) return;
      els.sbBody.replaceChildren();
      for (const r of rows) {
        const tr = document.createElement('tr');
        if (r.me) tr.className = 'me';
        tr.innerHTML = `<td>${r.name}</td><td>${r.team}</td><td>${r.k}</td><td>${r.d}</td><td>$${r.money}</td>`;
        els.sbBody.appendChild(tr);
      }
    },
  };
  return api;
}
