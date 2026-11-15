// Keyboard and mouse state, plus pointer lock. The game reads `keys` and consumes mouse deltas
// once a frame; menus (buy, scoreboard) read the same state. Pointer lock is requested from the
// start overlay's click, which is also the gesture that unlocks audio.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys that went down since the last consume
  let dx = 0, dy = 0;
  let locked = false;
  let mouseDown = false;
  let rightDown = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; rightDown = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  let wheelAcc = 0;
  canvas.addEventListener('wheel', (e) => { wheelAcc += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    dx += e.movementX || 0;
    dy += e.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  return {
    keys,
    get locked() { return locked; },
    get mouseDown() { return mouseDown; },
    get rightDown() { return rightDown; },
    lock() { canvas.requestPointerLock(); },
    unlock() { document.exitPointerLock(); },
    consumeMouse() {
      const out = { dx, dy };
      dx = 0; dy = 0;
      return out;
    },
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    consumeWheel() {
      const out = wheelAcc;
      wheelAcc = 0;
      return out;
    },
    clearPressed() { pressed.clear(); },
  };
}
