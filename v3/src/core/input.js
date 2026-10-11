// Eingabe für Touch, Tastatur und Gamepad.
//
// Handy-Konzept: der linke Daumen bekommt einen *dynamischen* Stick — er
// entsteht da, wo der Finger aufsetzt, nicht an einer festen Stelle. Das ist
// der einzige Weg, auf dem man mit unterschiedlich großen Händen zielsicher
// läuft. Rechts liegen runde Knöpfe (Rolle + 3 Artefakte), die Vorrang vor
// dem optionalen Ziel-Stick haben.

import { clamp } from './math.js';
import { settings } from './storage.js';

const DEAD_ZONE = 0.16;
const STICK_RADIUS = 58;      // CSS-Pixel bis Vollauslenkung
const STICK_SLIDE = 0.55;     // Anker folgt, wenn der Daumen weiter wandert

export const input = {
  enabled: true,

  moveX: 0, moveY: 0, moveMag: 0,
  aimX: 0, aimY: 0, aimActive: false,

  // Rohdaten für die Anzeige des Sticks
  stick: { active: false, ax: 0, ay: 0, px: 0, py: 0, side: 'left' },

  rollQueued: false,
  artifactQueued: [false, false, false],
  pauseQueued: false,
  anyTapQueued: false,

  usingTouch: false,
  lastPointerDown: 0,

  // Vom HUD gesetzt: Knopf-Trefferflächen in CSS-Pixeln
  buttons: [],
  /** Welcher Knopf wird gerade gedrückt gehalten (für die Optik). */
  held: Object.create(null),
};

const keys = Object.create(null);
const pointers = new Map();   // pointerId -> {role, ...}
let moveStickId = null;
let aimStickId = null;
let el = null;
let unlockCb = null;

const KEY_MOVE = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function initInput(target, onFirstInteraction) {
  el = target;
  unlockCb = onFirstInteraction;

  el.addEventListener('pointerdown', onDown, { passive: false });
  el.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: false });
  window.addEventListener('pointercancel', onUp, { passive: false });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);

  // Browser-Gesten wegnehmen, die beim Spielen nur störn.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  // Doppeltipp-Zoom auf iOS
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 320) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

/** HUD meldet seine Knöpfe an. `{id, x, y, r, enabled}` in CSS-Pixeln. */
export function setButtons(list) {
  input.buttons = list;
}

function buttonAt(x, y) {
  // Rückwärts, damit später gezeichnete Knöpfe oben liegen.
  for (let i = input.buttons.length - 1; i >= 0; i--) {
    const b = input.buttons[i];
    if (b.enabled === false) continue;
    const dx = x - b.x, dy = y - b.y;
    // Trefferfläche großzügiger als die Optik — Daumen sind ungenau.
    const r = b.r * 1.22;
    if (dx * dx + dy * dy <= r * r) return b;
  }
  return null;
}

function localPos(e) {
  const rect = el.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onDown(e) {
  input.lastPointerDown = performance.now();
  if (e.pointerType === 'touch' || e.pointerType === 'pen') input.usingTouch = true;
  if (unlockCb) { unlockCb(); unlockCb = null; }
  input.anyTapQueued = true;
  if (!input.enabled) return;

  const { x, y } = localPos(e);
  e.preventDefault();

  const btn = buttonAt(x, y);
  if (btn) {
    pointers.set(e.pointerId, { role: 'button', id: btn.id });
    input.held[btn.id] = true;
    pressButton(btn.id);
    return;
  }

  const w = el.clientWidth;
  const moveSide = settings().stickSide === 'right' ? 'right' : 'left';
  const onMoveSide = moveSide === 'left' ? x < w * 0.52 : x > w * 0.48;

  if (onMoveSide && moveStickId === null) {
    moveStickId = e.pointerId;
    pointers.set(e.pointerId, { role: 'move', ax: x, ay: y });
    input.stick.active = true;
    input.stick.side = moveSide;
    input.stick.ax = x; input.stick.ay = y;
    input.stick.px = x; input.stick.py = y;
    return;
  }

  if (settings().aimMode === 'stick' && aimStickId === null) {
    aimStickId = e.pointerId;
    pointers.set(e.pointerId, { role: 'aim', ax: x, ay: y });
    return;
  }

  pointers.set(e.pointerId, { role: 'none' });
}

function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (p.role === 'button') {
    // Finger vom Knopf gerutscht? Dann Haltezustand lösen.
    const { x, y } = localPos(e);
    const b = input.buttons.find((q) => q.id === p.id);
    if (b) {
      const dx = x - b.x, dy = y - b.y, r = b.r * 1.9;
      if (dx * dx + dy * dy > r * r) { input.held[p.id] = false; p.role = 'none'; }
    }
    return;
  }
  if (p.role !== 'move' && p.role !== 'aim') return;
  e.preventDefault();

  const { x, y } = localPos(e);
  let dx = x - p.ax, dy = y - p.ay;
  const len = Math.hypot(dx, dy);

  // Anker nachziehen, damit der Stick nie "ausläuft".
  if (len > STICK_RADIUS) {
    const over = len - STICK_RADIUS;
    p.ax += (dx / len) * over * STICK_SLIDE;
    p.ay += (dy / len) * over * STICK_SLIDE;
    dx = x - p.ax; dy = y - p.ay;
  }

  const mag = clamp(Math.hypot(dx, dy) / STICK_RADIUS, 0, 1);
  const nx = len > 0.001 ? dx / Math.max(1e-3, Math.hypot(dx, dy)) : 0;
  const ny = len > 0.001 ? dy / Math.max(1e-3, Math.hypot(dx, dy)) : 0;

  if (p.role === 'move') {
    input.stick.ax = p.ax; input.stick.ay = p.ay;
    input.stick.px = x; input.stick.py = y;
    if (mag < DEAD_ZONE) {
      input.moveX = 0; input.moveY = 0; input.moveMag = 0;
    } else {
      // Deadzone herausrechnen, damit langsames Gehen noch möglich ist.
      const m = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
      input.moveX = nx * m; input.moveY = ny * m; input.moveMag = m;
    }
  } else {
    if (mag < 0.3) { input.aimActive = false; }
    else { input.aimX = nx; input.aimY = ny; input.aimActive = true; }
  }
}

function onUp(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  if (p.role === 'button') input.held[p.id] = false;
  if (e.pointerId === moveStickId) {
    moveStickId = null;
    input.stick.active = false;
    input.moveX = 0; input.moveY = 0; input.moveMag = 0;
  }
  if (e.pointerId === aimStickId) {
    aimStickId = null;
    input.aimActive = false;
  }
}

function pressButton(id) {
  if (id === 'roll') input.rollQueued = true;
  else if (id === 'pause') input.pauseQueued = true;
  else if (id.startsWith('art')) {
    const i = parseInt(id.slice(3), 10);
    if (i >= 0 && i < 3) input.artifactQueued[i] = true;
  }
}

function onKeyDown(e) {
  if (e.repeat) return;
  if (unlockCb) { unlockCb(); unlockCb = null; }
  const code = e.code;

  // Tastatur-Navigation in DOM-Menüs nicht abwürgen.
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (code === 'Escape' || code === 'KeyP') { input.pauseQueued = true; e.preventDefault(); return; }
  if (!input.enabled) return;

  if (KEY_MOVE[code]) { keys[code] = true; e.preventDefault(); return; }
  if (code === 'Space' || code === 'ShiftLeft') { input.rollQueued = true; e.preventDefault(); return; }
  if (code === 'Digit1') input.artifactQueued[0] = true;
  else if (code === 'Digit2') input.artifactQueued[1] = true;
  else if (code === 'Digit3') input.artifactQueued[2] = true;
}

function onKeyUp(e) {
  if (KEY_MOVE[e.code]) keys[e.code] = false;
}

function releaseAll() {
  for (const k in keys) keys[k] = false;
  for (const k in input.held) input.held[k] = false;
  pointers.clear();
  moveStickId = null; aimStickId = null;
  input.stick.active = false;
  input.moveX = 0; input.moveY = 0; input.moveMag = 0;
  input.aimActive = false;
}

// --- Gamepad -----------------------------------------------------------

let padPrev = [];
function pollGamepad() {
  if (!navigator.getGamepads) return false;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag > DEAD_ZONE) {
      const m = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
      input.moveX = (ax / mag) * m; input.moveY = (ay / mag) * m; input.moveMag = m;
    }
    const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    if (Math.hypot(rx, ry) > 0.35) {
      const l = Math.hypot(rx, ry);
      input.aimX = rx / l; input.aimY = ry / l; input.aimActive = true;
    }
    const b = pad.buttons;
    const pressed = (i) => b[i] && b[i].pressed;
    const fresh = (i) => pressed(i) && !padPrev[i];
    if (fresh(0) || fresh(5) || fresh(7)) input.rollQueued = true;
    if (fresh(2)) input.artifactQueued[0] = true;
    if (fresh(1)) input.artifactQueued[1] = true;
    if (fresh(3)) input.artifactQueued[2] = true;
    if (fresh(9)) input.pauseQueued = true;
    padPrev = b.map((x) => x.pressed);
    return true;
  }
  return false;
}

/** Einmal pro Frame vor der Spiel-Logik. */
export function pollInput() {
  if (!input.usingTouch && moveStickId === null) {
    let kx = 0, ky = 0;
    for (const code in KEY_MOVE) {
      if (keys[code]) { kx += KEY_MOVE[code][0]; ky += KEY_MOVE[code][1]; }
    }
    const len = Math.hypot(kx, ky);
    if (len > 0) {
      input.moveX = kx / len; input.moveY = ky / len; input.moveMag = 1;
    } else {
      input.moveX = 0; input.moveY = 0; input.moveMag = 0;
      pollGamepad();
    }
  }
}

/** Nach der Logik: Einmal-Signale zurücksetzen. */
export function endInputFrame() {
  input.rollQueued = false;
  input.artifactQueued[0] = input.artifactQueued[1] = input.artifactQueued[2] = false;
  input.pauseQueued = false;
  input.anyTapQueued = false;
}

export function consumeRoll() {
  if (!input.rollQueued) return false;
  input.rollQueued = false;
  return true;
}
export function consumeArtifact(i) {
  if (!input.artifactQueued[i]) return false;
  input.artifactQueued[i] = false;
  return true;
}
export function consumePause() {
  if (!input.pauseQueued) return false;
  input.pauseQueued = false;
  return true;
}

export function setInputEnabled(v) {
  if (input.enabled === v) return;
  input.enabled = v;
  if (!v) releaseAll();
}
