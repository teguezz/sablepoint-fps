// Sablepoint's tuning in one place: teams, weapons, economy, round timings and the palette.
// Everything else reads from here, so a balance change is a change to this file alone.

export const TEAMS = {
  vanguard: { id: 'vanguard', name: 'Vanguard', role: 'attack', color: 0xff9a3c, ui: '#ff9a3c' },
  wardens: { id: 'wardens', name: 'Wardens', role: 'defend', color: 0x39c2b0, ui: '#39c2b0' },
};

// Bot callsigns, four per side; the player is the fifth Vanguard.
export const CALLSIGNS = {
  vanguard: ['Ash', 'Bram', 'Cato', 'Dove'],
  wardens: ['Ferro', 'Grimm', 'Havel', 'Ivo', 'Jett'],
};

// Weapon table. Damage is per pellet at the chest; the head multiplier and limb falloff live in
// weapons.js. spread/moveSpread are radians of cone half-angle standing still / at full speed;
// kick is camera pitch added per shot; ads is the aim-down-sights fov zoom factor.
export const WEAPONS = {
  p9: {
    name: 'P9 Sidearm', short: 'P9', slot: 'sidearm', price: 0,
    damage: 27, headMult: 4, rpm: 400, auto: false, mag: 12, reserve: 48,
    reload: 1.4, spread: 0.009, moveSpread: 0.028, kick: 0.010, ads: 1.25, pellets: 1,
  },
  raptor: {
    name: 'Raptor-9', short: 'R-9', slot: 'primary', price: 1500,
    damage: 22, headMult: 4, rpm: 820, auto: true, mag: 32, reserve: 128,
    reload: 2.0, spread: 0.020, moveSpread: 0.045, kick: 0.0075, ads: 1.3, pellets: 1,
  },
  scatter: {
    name: 'Scatter-7', short: 'S-7', slot: 'primary', price: 1100,
    damage: 9, headMult: 2, rpm: 75, auto: false, mag: 6, reserve: 30,
    reload: 2.6, spread: 0.055, moveSpread: 0.07, kick: 0.032, ads: 1.15, pellets: 8,
  },
  vk7: {
    name: 'VK-7 Carbine', short: 'VK-7', slot: 'primary', price: 2700,
    damage: 33, headMult: 4, rpm: 660, auto: true, mag: 30, reserve: 120,
    reload: 2.2, spread: 0.013, moveSpread: 0.034, kick: 0.0125, ads: 1.4, pellets: 1,
  },
  kestrel: {
    name: 'Kestrel DMR', short: 'K-DMR', slot: 'primary', price: 4300,
    damage: 74, headMult: 4, rpm: 230, auto: false, mag: 10, reserve: 40,
    reload: 2.6, spread: 0.0035, moveSpread: 0.05, kick: 0.030, ads: 2.4, pellets: 1,
  },
  hunter: {
    name: 'Hunter .45', short: 'H-45', slot: 'sidearm', price: 500,
    damage: 38, headMult: 4, rpm: 320, auto: false, mag: 8, reserve: 40,
    reload: 1.6, spread: 0.008, moveSpread: 0.026, kick: 0.016, ads: 1.25, pellets: 1,
  },
};

export const GRENADES = {
  frag: { name: 'Frag Charge', price: 300, damage: 92, radius: 6.5 },
  smoke: { name: 'Smoke Charge', price: 300, duration: 14, radius: 4.2 },
  flash: { name: 'Flash Charge', price: 200, duration: 2.6, radius: 16 },
};

export const ARMOR = { price: 650, factor: 0.55 }; // armoured targets take `factor` of damage

// The buy menu, in display order (keys 1-9 buy the matching row).
export const BUY_MENU = ['vk7', 'raptor', 'scatter', 'kestrel', 'hunter', 'armor', 'frag', 'smoke', 'flash'];

export const ECONOMY = {
  start: 800,
  kill: 300,
  plant: 300, // paid to the planter
  win: 3250,
  lossBase: 1900,
  lossStep: 250, // extra loss pay per consecutive lost round, up to lossSteps
  lossSteps: 3,
  max: 16000,
};

export const MATCH = {
  buyTime: 12,
  roundTime: 100,
  bombTime: 40,
  plantTime: 3,
  defuseTime: 5,
  endTime: 5.5,
  winTarget: 8, // first to 8 takes the match (at most 15 rounds)
  teamSize: 5,
};

export const PLAYER = {
  eye: 1.62,
  crouchEye: 1.12,
  radius: 0.42,
  walkSpeed: 4.6,
  crouchSpeed: 2.2,
  quietSpeed: 2.6, // shift-walk: slower, silent footsteps
  accel: 42,
  friction: 10,
  jumpSpeed: 4.4,
  gravity: 12.5,
  health: 100,
};

// The look: a freight yard at dusk. Warm sun, ember and teal team accents over sand and slate.
export const PALETTE = {
  sky: 0x2c3a52,
  horizon: 0xe8905a,
  fog: 0x4a4038,
  sun: 0xffb37a,
  hemiSky: 0x8794b0,
  hemiGround: 0x4a3b2c,
  ground: 0x8a7a63,
  sandstone: 0xb09a78,
  concrete: 0x9a958c,
  slate: 0x596068,
  rust: 0x9c4a2f,
  tealMetal: 0x2f6f6a,
  wood: 0x8a6844,
  darkMetal: 0x3a3f45,
};
