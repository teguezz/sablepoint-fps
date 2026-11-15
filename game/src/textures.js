// Every texture in Sablepoint is painted on a canvas at load: concrete, sandstone, corrugated
// container steel, crate planks, yard ground and hazard striping. Nothing is downloaded and
// nothing is borrowed, which keeps the game fully self-contained and the art its own.

import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function texture(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deterministic speckle so a texture looks the same on every machine.
function speckle(ctx, size, count, alpha, dark) {
  let s = 1234567;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${(rnd() * alpha).toFixed(3)})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function concrete() {
  const [c, x] = canvas(256);
  x.fillStyle = '#b8b4ac'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 2600, 0.10, true); speckle(x, 256, 1200, 0.06, false);
  x.strokeStyle = 'rgba(60,58,52,0.35)'; x.lineWidth = 2;
  x.strokeRect(1, 1, 254, 254);
  x.beginPath(); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  x.fillStyle = 'rgba(70,66,60,0.10)';
  x.fillRect(20, 170, 90, 40); x.fillRect(160, 30, 60, 26);
  return texture(c);
}

function sandstone() {
  const [c, x] = canvas(256);
  x.fillStyle = '#c9ae84'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 2000, 0.08, true); speckle(x, 256, 900, 0.05, false);
  x.strokeStyle = 'rgba(90,70,45,0.4)'; x.lineWidth = 3;
  for (let yy = 0; yy <= 256; yy += 64) { x.beginPath(); x.moveTo(0, yy); x.lineTo(256, yy); x.stroke(); }
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 64 : 0;
    for (let xx = off; xx <= 256; xx += 128) {
      x.beginPath(); x.moveTo(xx, row * 64); x.lineTo(xx, row * 64 + 64); x.stroke();
    }
  }
  return texture(c);
}

function corrugated() {
  const [c, x] = canvas(256);
  x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, 256, 256);
  for (let xx = 0; xx < 256; xx += 32) {
    const g = x.createLinearGradient(xx, 0, xx + 32, 0);
    g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.45, '#e8e8e8'); g.addColorStop(1, '#8f8f8f');
    x.fillStyle = g; x.fillRect(xx, 0, 32, 256);
  }
  speckle(x, 256, 700, 0.07, true);
  x.fillStyle = 'rgba(60,40,25,0.18)';
  x.fillRect(0, 226, 256, 30); // grime along the bottom edge
  return texture(c);
}

function crateWood() {
  const [c, x] = canvas(256);
  x.fillStyle = '#a67c4e'; x.fillRect(0, 0, 256, 256);
  for (let yy = 0; yy < 256; yy += 52) {
    x.fillStyle = yy % 104 ? '#9c7447' : '#b08654';
    x.fillRect(0, yy, 256, 50);
    x.strokeStyle = 'rgba(70,48,24,0.5)'; x.strokeRect(-2, yy, 260, 52);
  }
  speckle(x, 256, 900, 0.08, true);
  x.strokeStyle = '#6e4f2a'; x.lineWidth = 18; x.strokeRect(9, 9, 238, 238);
  x.beginPath(); x.moveTo(0, 0); x.lineTo(256, 256); x.moveTo(256, 0); x.lineTo(0, 256);
  x.lineWidth = 12; x.stroke();
  return texture(c);
}

function groundTex() {
  const [c, x] = canvas(512);
  x.fillStyle = '#9a8a70'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 9000, 0.09, true); speckle(x, 512, 4000, 0.05, false);
  x.strokeStyle = 'rgba(80,70,55,0.25)'; x.lineWidth = 2;
  for (let i = 0; i < 7; i++) { // cracks
    x.beginPath();
    let px = (i * 173) % 512, py = (i * 97) % 512;
    x.moveTo(px, py);
    for (let j = 0; j < 5; j++) { px += ((i * 31 + j * 47) % 61) - 30; py += ((i * 17 + j * 29) % 61) - 30; x.lineTo(px, py); }
    x.stroke();
  }
  x.fillStyle = 'rgba(60,52,40,0.10)';
  x.fillRect(60, 300, 150, 90); x.fillRect(330, 90, 120, 70);
  return texture(c, 10);
}

function hazard() {
  const [c, x] = canvas(128);
  x.fillStyle = '#d8a028'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#26262a';
  for (let i = -128; i < 256; i += 44) {
    x.beginPath();
    x.moveTo(i, 128); x.lineTo(i + 22, 128); x.lineTo(i + 128 + 22, 0); x.lineTo(i + 128, 0);
    x.closePath(); x.fill();
  }
  return texture(c);
}

export function makeTextures() {
  return {
    concrete: concrete(),
    sandstone: sandstone(),
    metal: corrugated(),
    crate: crateWood(),
    ground: groundTex(),
    hazard: hazard(),
  };
}
