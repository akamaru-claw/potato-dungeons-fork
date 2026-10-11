// Alle Sprites werden zur Laufzeit gezeichnet und in Offscreen-Canvases
// gecacht. Vorteil: nichts zu laden, beliebige Auflösung, Farbvarianten
// kostenlos. Stil: dicke dunkle Kontur, flache Grundfarbe, Licht von oben.

import { TAU, clamp } from './math.js';
import { makeRng, hashStr } from './rng.js';

const cache = new Map();

function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Holt ein Sprite aus dem Cache oder zeichnet es einmal. */
export function sprite(key, w, h, draw) {
  let s = cache.get(key);
  if (s) return s;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  draw(g, c.width, c.height);
  cache.set(key, c);
  return c;
}

export function clearSpriteCache() { cache.clear(); }

// --- Farbhelfer --------------------------------------------------------

/** Mischt zwei Hex-Farben. */
export function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return rgb(
    Math.round(pa[0] + (pb[0] - pa[0]) * t),
    Math.round(pa[1] + (pb[1] - pa[1]) * t),
    Math.round(pa[2] + (pb[2] - pa[2]) * t),
  );
}
export function shade(c, amt) { return mix(c, amt < 0 ? '#000000' : '#ffffff', Math.abs(amt)); }
export function alpha(c, a) { const p = hex(c); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }

function hex(c) {
  if (c[0] !== '#') c = '#888888';
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = (r, g, b) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

// --- Formen ------------------------------------------------------------

/**
 * Unregelmäßige Knolle. `wobble` steuert, wie kartoffelig die Silhouette ist.
 * Zeichnet nur den Pfad — Füllung/Kontur macht der Aufrufer.
 */
export function blobPath(g, cx, cy, rx, ry, rng, wobble = 0.17, points = 11) {
  const rs = [];
  for (let i = 0; i < points; i++) rs.push(1 + (rng.next() * 2 - 1) * wobble);
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const i0 = i % points, i1 = (i + 1) % points;
    const a0 = (i0 / points) * TAU, a1 = (i1 / points) * TAU;
    const x0 = cx + Math.cos(a0) * rx * rs[i0], y0 = cy + Math.sin(a0) * ry * rs[i0];
    const x1 = cx + Math.cos(a1) * rx * rs[i1], y1 = cy + Math.sin(a1) * ry * rs[i1];
    if (i === 0) g.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
    else g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  g.closePath();
}

function starPath(g, cx, cy, outer, inner, spikes, rot = 0) {
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i / (spikes * 2)) * TAU;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Standard-Behandlung: füllen, Lichtkante oben, dunkle Kontur. */
function body(g, pathFn, col, size, outline = 0.14) {
  const dark = shade(col, -0.55);

  pathFn();
  g.fillStyle = col;
  g.fill();

  // Licht von oben links
  g.save();
  pathFn();
  g.clip();
  const grd = g.createLinearGradient(0, 0, size * 0.35, size);
  grd.addColorStop(0, alpha(shade(col, 0.42), 0.85));
  grd.addColorStop(0.42, alpha(shade(col, 0.05), 0));
  grd.addColorStop(0.75, alpha(dark, 0.28));
  grd.addColorStop(1, alpha(dark, 0.55));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  g.restore();

  pathFn();
  g.lineWidth = Math.max(2, size * outline * 0.4);
  g.strokeStyle = dark;
  g.lineJoin = 'round';
  g.stroke();
}

function eyes(g, cx, cy, spread, r, opts = {}) {
  const { pupil = '#15110d', white = '#fdf6e6', angry = false, glow = null, single = false } = opts;
  const list = single ? [0] : [-spread, spread];
  for (const dx of list) {
    g.beginPath();
    g.ellipse(cx + dx, cy, r, r * 1.1, 0, 0, TAU);
    g.fillStyle = glow || white;
    g.fill();
    if (glow) {
      g.shadowColor = glow; g.shadowBlur = r * 2.6;
      g.fill();
      g.shadowBlur = 0;
    }
    g.beginPath();
    g.ellipse(cx + dx * 1.08, cy + r * 0.18, r * 0.46, r * 0.56, 0, 0, TAU);
    g.fillStyle = pupil;
    g.fill();
  }
  if (angry) {
    g.strokeStyle = '#1a1208';
    g.lineWidth = r * 0.52;
    g.lineCap = 'round';
    for (const dx of list) {
      g.beginPath();
      const s = dx < 0 ? 1 : -1;
      g.moveTo(cx + dx - r * 0.9 * s, cy - r * 1.55);
      g.lineTo(cx + dx + r * 0.9 * s, cy - r * 0.85);
      g.stroke();
    }
  }
}

function sprout(g, cx, cy, size, col = '#6cbf4a', count = 2) {
  g.strokeStyle = shade(col, -0.3);
  g.lineWidth = size * 0.055;
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const dir = i % 2 ? 1 : -1;
    g.beginPath();
    g.moveTo(cx + dir * size * 0.04, cy);
    g.quadraticCurveTo(cx + dir * size * 0.14, cy - size * 0.12, cx + dir * size * 0.19, cy - size * 0.2);
    g.stroke();
    g.beginPath();
    g.ellipse(cx + dir * size * 0.205, cy - size * 0.215, size * 0.055, size * 0.032, dir * 0.6, 0, TAU);
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = shade(col, -0.45);
    g.lineWidth = size * 0.014;
    g.stroke();
    g.strokeStyle = shade(col, -0.3);
    g.lineWidth = size * 0.055;
  }
}

/** Augen/Dellen, die eine Kartoffel erst echt aussehen lassen. */
function potatoDots(g, cx, cy, rx, ry, rng, col, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = rng.angle(), d = Math.sqrt(rng.next()) * 0.72;
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    const r = rx * rng.range(0.035, 0.07);
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, rng.angle(), 0, TAU);
    g.fillStyle = alpha(shade(col, -0.4), 0.5);
    g.fill();
    g.beginPath();
    g.ellipse(x, y - r * 0.45, r * 0.8, r * 0.3, 0, 0, TAU);
    g.fillStyle = alpha(shade(col, 0.3), 0.35);
    g.fill();
  }
}

// --- Spieler -----------------------------------------------------------

export const SKINS = {
  knolle:    { body: '#c98f4e', sprout: '#6cbf4a' },
  pommes:    { body: '#f0c24a', sprout: '#8fd14f' },
  suess:     { body: '#d4663f', sprout: '#7bc96f' },
  chips:     { body: '#e8b14e', sprout: '#9ad65c' },
  golden:    { body: '#f5cf3a', sprout: '#b8e063' },
  schatten:  { body: '#5a4a6b', sprout: '#8f6fb0' },
  regenbogen:{ body: '#d98ac4', sprout: '#6ce0c0' },
  teufel:    { body: '#a33b36', sprout: '#e06a3a' },
  frost:     { body: '#8fc4d8', sprout: '#b8e8f0' },
  stahl:     { body: '#9aa5b0', sprout: '#7f8c99' },
};

/**
 * Spieler-Sprite. Vier Blickrichtungen wären Overkill — wir drehen den
 * Körper leicht und spiegeln beim Zeichnen, das reicht völlig.
 */
export function playerSprite(skinId, size = 96) {
  const pal = SKINS[skinId] || SKINS.knolle;
  return sprite(`player:${skinId}:${size}`, size, size, (g, w, h) => {
    const rng = makeRng(hashStr('player' + skinId));
    const cx = w / 2, cy = h * 0.54;
    const rx = w * 0.3, ry = h * 0.34;

    body(g, () => blobPath(g, cx, cy, rx, ry, makeRng(hashStr('pb' + skinId)), 0.13, 12), pal.body, w);
    potatoDots(g, cx, cy, rx, ry, rng, pal.body, 7);
    sprout(g, cx, cy - ry * 0.92, w, pal.sprout, 2);
    eyes(g, cx, cy - ry * 0.12, rx * 0.36, rx * 0.17, { angry: false });

    // Mund
    g.strokeStyle = '#2a1d10';
    g.lineWidth = w * 0.022;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy + ry * 0.2, rx * 0.22, 0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();

    // Füße
    g.fillStyle = shade(pal.body, -0.45);
    for (const dx of [-rx * 0.42, rx * 0.42]) {
      g.beginPath();
      g.ellipse(cx + dx, cy + ry * 0.95, rx * 0.17, ry * 0.11, 0, 0, TAU);
      g.fill();
    }
  });
}

// --- Gegner ------------------------------------------------------------
// Jede Form ist eine kleine Zeichenfunktion. `pal.main` ist die Grundfarbe,
// `pal.accent` das Highlight.

const ENEMY_SHAPES = {
  // Käfer: flacher Panzer, sechs Beine
  kaefer(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, rx = w * 0.3, ry = h * 0.26;
    g.strokeStyle = shade(pal.main, -0.6);
    g.lineWidth = w * 0.035;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = cy - ry * 0.4 + i * ry * 0.52;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * rx * 0.6, y);
        g.lineTo(cx + s * rx * 1.26, y + ry * 0.3);
        g.stroke();
      }
    }
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.07, 10), pal.main, w);
    // Panzernaht
    g.strokeStyle = alpha(shade(pal.main, -0.5), 0.8);
    g.lineWidth = w * 0.022;
    g.beginPath(); g.moveTo(cx, cy - ry * 0.85); g.lineTo(cx, cy + ry * 0.8); g.stroke();
    g.fillStyle = pal.accent;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(cx + s * rx * 0.4, cy - ry * 0.2, rx * 0.13, ry * 0.2, 0, 0, TAU); g.fill();
    }
    eyes(g, cx, cy - ry * 0.62, rx * 0.26, w * 0.035, { glow: pal.eye, angry: true });
  },

  // Floh: kleine Kugel mit riesigen Sprungbeinen
  floh(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.52, r = w * 0.24;
    g.strokeStyle = shade(pal.main, -0.55);
    g.lineWidth = w * 0.05; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * r * 0.5, cy + r * 0.3);
      g.lineTo(cx + s * r * 1.3, cy - r * 0.1);
      g.lineTo(cx + s * r * 1.0, cy + r * 1.1);
      g.stroke();
    }
    body(g, () => blobPath(g, cx, cy, r, r * 0.95, rng, 0.1, 9), pal.main, w);
    eyes(g, cx, cy - r * 0.15, r * 0.3, w * 0.04, { glow: pal.eye });
  },

  // Schimmelknolle: dicker Brocken mit Pelz
  schimmel(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, rx = w * 0.34, ry = h * 0.32;
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.2, 13), pal.main, w);
    // Schimmelflecken
    for (let i = 0; i < 9; i++) {
      const a = rng.angle(), d = Math.sqrt(rng.next()) * 0.75;
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      const r = rx * rng.range(0.1, 0.2);
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = alpha(pal.accent, 0.75); g.fill();
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, TAU);
      g.fillStyle = alpha(shade(pal.accent, 0.4), 0.8); g.fill();
    }
    // Pelz am Rand
    g.strokeStyle = alpha(shade(pal.accent, 0.3), 0.8);
    g.lineWidth = w * 0.016; g.lineCap = 'round';
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * w * 0.035, y + Math.sin(a) * h * 0.035);
      g.stroke();
    }
    eyes(g, cx, cy - ry * 0.25, rx * 0.3, w * 0.04, { glow: pal.eye, angry: true });
  },

  // Wurzelschütze: dünn, aufrecht, mit Blasrohr
  schuetze(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.52, rx = w * 0.21, ry = h * 0.3;
    // Blasrohr
    g.save();
    g.translate(cx + rx * 0.5, cy + ry * 0.05);
    g.rotate(-0.25);
    g.fillStyle = '#6b4a2a';
    roundRect(g, 0, -w * 0.022, w * 0.4, w * 0.044, w * 0.022);
    g.fill();
    g.strokeStyle = '#3a2614'; g.lineWidth = w * 0.014; g.stroke();
    g.restore();
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.14, 11), pal.main, w);
    // Wurzelranken als Arme
    g.strokeStyle = shade(pal.main, -0.4);
    g.lineWidth = w * 0.03; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * rx * 0.75, cy);
      g.quadraticCurveTo(cx + s * rx * 1.3, cy + ry * 0.25, cx + s * rx * 1.1, cy + ry * 0.7);
      g.stroke();
    }
    sprout(g, cx, cy - ry * 0.95, w, pal.accent, 2);
    eyes(g, cx, cy - ry * 0.2, rx * 0.34, w * 0.032, { glow: pal.eye, angry: true });
  },

  // Stachelrübe: Kegel mit Dornen, stürmt
  stachel(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, r = w * 0.29;
    starPath(g, cx, cy, r * 1.3, r * 0.92, 11, rng.angle());
    g.fillStyle = shade(pal.accent, -0.1); g.fill();
    g.strokeStyle = shade(pal.main, -0.6); g.lineWidth = w * 0.018; g.stroke();
    body(g, () => blobPath(g, cx, cy, r, r * 1.02, rng, 0.08, 10), pal.main, w);
    g.fillStyle = alpha('#ffffff', 0.18);
    g.beginPath(); g.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.3, r * 0.2, -0.5, 0, TAU); g.fill();
    eyes(g, cx, cy - r * 0.1, r * 0.3, w * 0.038, { glow: pal.eye, angry: true });
  },

  // Faulknolle: aufgeblasen, Risse, explodiert
  faul(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, r = w * 0.31;
    body(g, () => blobPath(g, cx, cy, r, r * 0.96, rng, 0.16, 11), pal.main, w);
    g.strokeStyle = alpha(pal.accent, 0.95);
    g.lineWidth = w * 0.024; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = rng.angle();
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.15, cy + Math.sin(a) * r * 0.15);
      let px = cx, py = cy, ca = a;
      for (let k = 0; k < 3; k++) {
        ca += rng.range(-0.7, 0.7);
        px += Math.cos(ca) * r * 0.3; py += Math.sin(ca) * r * 0.3;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.shadowColor = pal.accent; g.shadowBlur = w * 0.1;
    g.stroke(); g.shadowBlur = 0;
    eyes(g, cx, cy - r * 0.2, r * 0.3, w * 0.042, { glow: pal.accent });
  },

  // Kompostgeist: halbtransparent, schwebend, ohne Beine
  geist(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.5, rx = w * 0.27, ry = h * 0.29;
    g.globalAlpha = 0.82;
    body(g, () => {
      g.beginPath();
      g.moveTo(cx - rx, cy + ry * 0.3);
      g.bezierCurveTo(cx - rx, cy - ry * 1.3, cx + rx, cy - ry * 1.3, cx + rx, cy + ry * 0.3);
      // zerfließender Saum
      for (let i = 4; i >= 0; i--) {
        const x0 = cx - rx + (rx * 2 * i) / 5;
        const x1 = cx - rx + (rx * 2 * (i + 0.5)) / 5;
        g.quadraticCurveTo(x1, cy + ry * (i % 2 ? 1.15 : 0.6), x0, cy + ry * 0.35);
      }
      g.closePath();
    }, pal.main, w);
    g.globalAlpha = 1;
    eyes(g, cx, cy - ry * 0.25, rx * 0.34, w * 0.045, { glow: pal.eye, white: pal.eye });
  },

  // Rankenwerfer: Knolle mit Peitschenranke
  ranke(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.56, rx = w * 0.25, ry = h * 0.27;
    g.strokeStyle = pal.accent;
    g.lineWidth = w * 0.032; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + rx * 0.7, cy);
    g.bezierCurveTo(cx + rx * 2.2, cy - ry * 0.8, cx + rx * 1.6, cy + ry * 1.2, cx + rx * 2.6, cy + ry * 0.7);
    g.stroke();
    g.strokeStyle = shade(pal.accent, -0.4); g.lineWidth = w * 0.012; g.stroke();
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.15, 11), pal.main, w);
    eyes(g, cx, cy - ry * 0.2, rx * 0.32, w * 0.036, { glow: pal.eye, angry: true });
  },

  // Krautmagier: Hut, Stab, beschwört
  magier(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.58, rx = w * 0.23, ry = h * 0.26;
    // Stab
    g.strokeStyle = '#6b4a2a'; g.lineWidth = w * 0.028; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + rx * 1.1, cy + ry * 0.9); g.lineTo(cx + rx * 1.5, cy - ry * 1.3); g.stroke();
    g.beginPath(); g.arc(cx + rx * 1.5, cy - ry * 1.45, w * 0.045, 0, TAU);
    g.fillStyle = pal.eye; g.shadowColor = pal.eye; g.shadowBlur = w * 0.12; g.fill(); g.shadowBlur = 0;
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.13, 11), pal.main, w);
    // Spitzhut
    g.beginPath();
    g.moveTo(cx - rx * 1.05, cy - ry * 0.75);
    g.lineTo(cx + rx * 1.05, cy - ry * 0.75);
    g.lineTo(cx + rx * 0.2, cy - ry * 2.3);
    g.closePath();
    g.fillStyle = pal.accent; g.fill();
    g.strokeStyle = shade(pal.accent, -0.55); g.lineWidth = w * 0.02; g.stroke();
    eyes(g, cx, cy - ry * 0.1, rx * 0.32, w * 0.032, { glow: pal.eye });
  },

  // Blechdose: gepanzert, braucht Crits
  blech(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, rw = w * 0.5, rh = h * 0.52;
    body(g, () => roundRect(g, cx - rw / 2, cy - rh / 2, rw, rh, w * 0.07), pal.main, w);
    // Rillen
    g.strokeStyle = alpha(shade(pal.main, -0.45), 0.9);
    g.lineWidth = w * 0.018;
    for (let i = 1; i < 4; i++) {
      const y = cy - rh / 2 + (rh * i) / 4;
      g.beginPath(); g.moveTo(cx - rw / 2 + w * 0.02, y); g.lineTo(cx + rw / 2 - w * 0.02, y); g.stroke();
    }
    // Nieten
    g.fillStyle = shade(pal.accent, 0.2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      g.beginPath(); g.arc(cx + sx * rw * 0.38, cy + sy * rh * 0.38, w * 0.022, 0, TAU); g.fill();
    }
    // Sehschlitz
    g.fillStyle = '#120d08';
    roundRect(g, cx - rw * 0.3, cy - rh * 0.22, rw * 0.6, rh * 0.14, w * 0.02); g.fill();
    g.fillStyle = pal.eye; g.shadowColor = pal.eye; g.shadowBlur = w * 0.1;
    for (const dx of [-rw * 0.14, rw * 0.14]) {
      g.beginPath(); g.arc(cx + dx, cy - rh * 0.15, w * 0.022, 0, TAU); g.fill();
    }
    g.shadowBlur = 0;
  },

  // Feuerzwiebel: Schichten, brennt
  zwiebel(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.56, rx = w * 0.27, ry = h * 0.3;
    body(g, () => {
      g.beginPath();
      g.moveTo(cx, cy - ry * 1.15);
      g.bezierCurveTo(cx + rx * 1.35, cy - ry * 0.5, cx + rx * 0.9, cy + ry, cx, cy + ry);
      g.bezierCurveTo(cx - rx * 0.9, cy + ry, cx - rx * 1.35, cy - ry * 0.5, cx, cy - ry * 1.15);
      g.closePath();
    }, pal.main, w);
    g.strokeStyle = alpha(shade(pal.main, -0.4), 0.7);
    g.lineWidth = w * 0.016;
    for (const s of [-0.45, 0, 0.45]) {
      g.beginPath();
      g.moveTo(cx + rx * s * 0.3, cy - ry * 1.05);
      g.quadraticCurveTo(cx + rx * s * 1.5, cy, cx + rx * s * 0.5, cy + ry * 0.95);
      g.stroke();
    }
    // Flammenschopf
    g.beginPath();
    g.moveTo(cx - rx * 0.25, cy - ry * 1.1);
    g.quadraticCurveTo(cx, cy - ry * 2.1, cx + rx * 0.25, cy - ry * 1.1);
    g.closePath();
    g.fillStyle = pal.accent;
    g.shadowColor = pal.accent; g.shadowBlur = w * 0.14; g.fill(); g.shadowBlur = 0;
    eyes(g, cx, cy - ry * 0.1, rx * 0.3, w * 0.036, { glow: '#fff3c4', angry: true });
  },

  // Frostrübe: eckig, Eiskristalle
  frost(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, r = w * 0.28;
    starPath(g, cx, cy, r * 1.35, r * 0.75, 6, 0.4);
    g.fillStyle = alpha(pal.accent, 0.55); g.fill();
    body(g, () => blobPath(g, cx, cy, r, r * 1.05, rng, 0.1, 8), pal.main, w);
    g.strokeStyle = alpha('#ffffff', 0.7); g.lineWidth = w * 0.014;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.3;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2);
      g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
      g.stroke();
    }
    eyes(g, cx, cy - r * 0.15, r * 0.3, w * 0.036, { glow: '#d8f6ff' });
  },

  // Maulwurf: gräbt, Schaufelhände
  maulwurf(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.56, rx = w * 0.28, ry = h * 0.26;
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.1, 10), pal.main, w);
    // Schnauze
    g.beginPath(); g.ellipse(cx, cy + ry * 0.35, rx * 0.3, ry * 0.22, 0, 0, TAU);
    g.fillStyle = shade(pal.accent, 0.1); g.fill();
    g.strokeStyle = shade(pal.main, -0.55); g.lineWidth = w * 0.016; g.stroke();
    // Krallen
    g.strokeStyle = '#efe6d2'; g.lineWidth = w * 0.022; g.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(cx + s * rx * 0.85, cy + ry * 0.4);
      g.lineTo(cx + s * rx * 1.25 + i * w * 0.02, cy + ry * 0.75 + i * h * 0.015);
      g.stroke();
    }
    eyes(g, cx, cy - ry * 0.1, rx * 0.26, w * 0.026, { glow: pal.eye });
  },
};

export function enemySprite(shapeId, palette, size = 88) {
  const key = `enemy:${shapeId}:${palette.main}${palette.accent}${palette.eye}:${size}`;
  const fn = ENEMY_SHAPES[shapeId] || ENEMY_SHAPES.kaefer;
  return sprite(key, size, size, (g, w, h) => {
    fn(g, w, h, palette, makeRng(hashStr(shapeId + palette.main)));
  });
}

// --- Bosse -------------------------------------------------------------

const BOSS_SHAPES = {
  koenig(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.58, rx = w * 0.33, ry = h * 0.3;
    // Umhang
    g.beginPath();
    g.moveTo(cx - rx * 1.1, cy - ry * 0.3);
    g.quadraticCurveTo(cx - rx * 1.9, cy + ry * 1.3, cx, cy + ry * 1.15);
    g.quadraticCurveTo(cx + rx * 1.9, cy + ry * 1.3, cx + rx * 1.1, cy - ry * 0.3);
    g.closePath();
    g.fillStyle = '#7a2230'; g.fill();
    g.strokeStyle = '#3d0f17'; g.lineWidth = w * 0.015; g.stroke();
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.12, 13), pal.main, w);
    potatoDots(g, cx, cy, rx, ry, rng, pal.main, 8);
    // Krone
    const kw = rx * 1.15, ky = cy - ry * 0.95;
    g.beginPath();
    g.moveTo(cx - kw, ky);
    g.lineTo(cx - kw, ky - h * 0.07);
    for (let i = 0; i < 4; i++) {
      const x0 = cx - kw + (kw * 2 * i) / 4, x1 = cx - kw + (kw * 2 * (i + 0.5)) / 4;
      g.lineTo(x1, ky - h * 0.15);
      g.lineTo(cx - kw + (kw * 2 * (i + 1)) / 4, ky - h * 0.07);
    }
    g.lineTo(cx + kw, ky);
    g.closePath();
    g.fillStyle = '#f0c93a'; g.fill();
    g.strokeStyle = '#8a6a10'; g.lineWidth = w * 0.013; g.stroke();
    g.fillStyle = '#d8344a';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.arc(cx - kw + (kw * 2 * (i + 0.5)) / 4, ky - h * 0.165, w * 0.016, 0, TAU); g.fill();
    }
    eyes(g, cx, cy - ry * 0.15, rx * 0.34, w * 0.034, { glow: '#ffd36b', angry: true });
    // Zepter
    g.strokeStyle = '#c9a227'; g.lineWidth = w * 0.026; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + rx * 1.15, cy + ry * 0.8); g.lineTo(cx + rx * 1.35, cy - ry * 1.1); g.stroke();
    g.beginPath(); g.arc(cx + rx * 1.37, cy - ry * 1.25, w * 0.04, 0, TAU);
    g.fillStyle = '#ff7a3d'; g.shadowColor = '#ff7a3d'; g.shadowBlur = w * 0.12; g.fill(); g.shadowBlur = 0;
  },

  moloch(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.56, rx = w * 0.37, ry = h * 0.33;
    body(g, () => blobPath(g, cx, cy, rx, ry, rng, 0.24, 15), pal.main, w);
    for (let i = 0; i < 14; i++) {
      const a = rng.angle(), d = Math.sqrt(rng.next()) * 0.8;
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      const r = rx * rng.range(0.1, 0.22);
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = alpha(pal.accent, 0.8); g.fill();
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU);
      g.fillStyle = alpha('#e8ffd8', 0.5); g.fill();
    }
    // Mehrere Augen
    for (const [dx, dy, r] of [[-0.4, -0.3, 0.055], [0.1, -0.42, 0.045], [0.45, -0.1, 0.05], [-0.15, 0.1, 0.038]]) {
      g.beginPath(); g.arc(cx + rx * dx, cy + ry * dy, w * r, 0, TAU);
      g.fillStyle = pal.eye; g.shadowColor = pal.eye; g.shadowBlur = w * 0.08; g.fill(); g.shadowBlur = 0;
      g.beginPath(); g.arc(cx + rx * dx, cy + ry * dy + w * r * 0.2, w * r * 0.45, 0, TAU);
      g.fillStyle = '#1a2208'; g.fill();
    }
    // Maul
    g.beginPath();
    g.ellipse(cx, cy + ry * 0.55, rx * 0.4, ry * 0.2, 0, 0, TAU);
    g.fillStyle = '#2a1a0a'; g.fill();
    g.fillStyle = '#fdf6e6';
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(cx + i * rx * 0.14 - rx * 0.05, cy + ry * 0.42);
      g.lineTo(cx + i * rx * 0.14 + rx * 0.05, cy + ry * 0.42);
      g.lineTo(cx + i * rx * 0.14, cy + ry * 0.62);
      g.closePath(); g.fill();
    }
  },

  fritteuse(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.55, rw = w * 0.62, rh = h * 0.5;
    // Beine
    g.strokeStyle = '#4a5560'; g.lineWidth = w * 0.045; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * rw * 0.3, cy + rh * 0.4); g.lineTo(cx + s * rw * 0.45, cy + rh * 0.85); g.stroke();
    }
    body(g, () => roundRect(g, cx - rw / 2, cy - rh / 2, rw, rh, w * 0.05), pal.main, w);
    // Öl-Wanne
    g.fillStyle = pal.accent;
    roundRect(g, cx - rw * 0.42, cy - rh * 0.34, rw * 0.84, rh * 0.3, w * 0.02); g.fill();
    g.strokeStyle = shade(pal.accent, -0.5); g.lineWidth = w * 0.012; g.stroke();
    // Blubbern
    g.fillStyle = alpha('#fff3c4', 0.6);
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(cx - rw * 0.34 + rng.next() * rw * 0.68, cy - rh * 0.3 + rng.next() * rh * 0.2, w * rng.range(0.012, 0.026), 0, TAU);
      g.fill();
    }
    // Anzeige
    g.fillStyle = '#121820';
    roundRect(g, cx - rw * 0.2, cy + rh * 0.02, rw * 0.4, rh * 0.2, w * 0.015); g.fill();
    g.fillStyle = pal.eye; g.shadowColor = pal.eye; g.shadowBlur = w * 0.09;
    for (const dx of [-0.08, 0.08]) {
      g.beginPath(); g.arc(cx + rw * dx, cy + rh * 0.12, w * 0.024, 0, TAU); g.fill();
    }
    g.shadowBlur = 0;
    // Korb-Arme
    g.strokeStyle = '#8a949e'; g.lineWidth = w * 0.03;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * rw * 0.5, cy - rh * 0.1);
      g.quadraticCurveTo(cx + s * rw * 0.85, cy + rh * 0.1, cx + s * rw * 0.7, cy + rh * 0.45);
      g.stroke();
    }
  },

  hexe(g, w, h, pal, rng) {
    const cx = w / 2, cy = h * 0.6, rx = w * 0.26, ry = h * 0.28;
    // Besen
    g.strokeStyle = '#7a5a30'; g.lineWidth = w * 0.028;
    g.beginPath(); g.moveTo(cx - rx * 2.1, cy + ry * 0.9); g.lineTo(cx + rx * 1.6, cy + ry * 0.2); g.stroke();
    g.fillStyle = '#c9a05a';
    g.beginPath();
    g.moveTo(cx - rx * 2.0, cy + ry * 0.75);
    g.lineTo(cx - rx * 2.7, cy + ry * 0.35);
    g.lineTo(cx - rx * 2.6, cy + ry * 1.3);
    g.closePath(); g.fill();
    // Robe
    g.beginPath();
    g.moveTo(cx - rx * 0.9, cy - ry * 0.2);
    g.quadraticCurveTo(cx - rx * 1.5, cy + ry * 1.2, cx, cy + ry * 1.1);
    g.quadraticCurveTo(cx + rx * 1.5, cy + ry * 1.2, cx + rx * 0.9, cy - ry * 0.2);
    g.closePath();
    g.fillStyle = shade(pal.accent, -0.2); g.fill();
    g.strokeStyle = shade(pal.accent, -0.6); g.lineWidth = w * 0.014; g.stroke();
    body(g, () => blobPath(g, cx, cy - ry * 0.2, rx, ry * 0.85, rng, 0.14, 11), pal.main, w);
    // Hut mit Krempe
    g.beginPath(); g.ellipse(cx, cy - ry * 1.0, rx * 1.6, ry * 0.22, 0, 0, TAU);
    g.fillStyle = shade(pal.accent, -0.3); g.fill();
    g.beginPath();
    g.moveTo(cx - rx * 0.8, cy - ry * 1.05);
    g.quadraticCurveTo(cx + rx * 0.9, cy - ry * 2.0, cx + rx * 0.1, cy - ry * 2.5);
    g.quadraticCurveTo(cx - rx * 0.2, cy - ry * 1.7, cx + rx * 0.7, cy - ry * 1.0);
    g.closePath();
    g.fillStyle = shade(pal.accent, -0.15); g.fill();
    g.strokeStyle = shade(pal.accent, -0.6); g.lineWidth = w * 0.014; g.stroke();
    eyes(g, cx, cy - ry * 0.35, rx * 0.3, w * 0.03, { glow: pal.eye, angry: true });
  },
};

export function bossSprite(shapeId, palette, size = 200) {
  const key = `boss:${shapeId}:${palette.main}:${size}`;
  const fn = BOSS_SHAPES[shapeId] || BOSS_SHAPES.koenig;
  return sprite(key, size, size, (g, w, h) => {
    fn(g, w, h, palette, makeRng(hashStr('boss' + shapeId)));
  });
}

// --- Umgebung ----------------------------------------------------------

/** Bodenkachel mit Fugen und Körnung. */
export function floorTile(biomeId, pal, size = 128, variant = 0) {
  return sprite(`floor:${biomeId}:${variant}:${size}`, size, size, (g, w, h) => {
    const rng = makeRng(hashStr(biomeId + 'floor' + variant));
    g.fillStyle = pal.floor;
    g.fillRect(0, 0, w, h);

    // Platten
    const n = 2;
    const cell = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const off = rng.range(-0.05, 0.05);
      g.fillStyle = mix(pal.floor, off > 0 ? '#ffffff' : '#000000', Math.abs(off));
      g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    }
    g.strokeStyle = alpha(pal.floorLine, 0.5);
    g.lineWidth = Math.max(1, size * 0.012);
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * cell); g.lineTo(w, i * cell); g.stroke();
    }
    // Körnung
    for (let i = 0; i < size * 1.2; i++) {
      g.fillStyle = alpha(rng.chance(0.5) ? '#ffffff' : '#000000', rng.range(0.015, 0.05));
      const s = rng.range(1, 3);
      g.fillRect(rng.next() * w, rng.next() * h, s, s);
    }
    // Risse
    if (variant > 0) {
      g.strokeStyle = alpha(pal.floorLine, 0.35);
      g.lineWidth = Math.max(1, size * 0.008);
      for (let i = 0; i < variant + 1; i++) {
        let x = rng.next() * w, y = rng.next() * h, a = rng.angle();
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          a += rng.range(-0.8, 0.8);
          x += Math.cos(a) * size * 0.12; y += Math.sin(a) * size * 0.12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  });
}

/** Wandblock: Oberkante hell, Front dunkel — gibt die 2,5-D-Tiefe. */
export function wallTile(biomeId, pal, w = 96, h = 120) {
  return sprite(`wall:${biomeId}:${w}x${h}`, w, h, (g, cw, ch) => {
    const rng = makeRng(hashStr(biomeId + 'wall'));
    const topH = ch * 0.34;
    // Front
    const grd = g.createLinearGradient(0, topH, 0, ch);
    grd.addColorStop(0, pal.wall);
    grd.addColorStop(1, shade(pal.wall, -0.45));
    g.fillStyle = grd;
    g.fillRect(0, topH, cw, ch - topH);
    // Oberseite
    g.fillStyle = shade(pal.wall, 0.22);
    g.beginPath();
    g.moveTo(0, topH); g.lineTo(cw * 0.1, 0); g.lineTo(cw, 0); g.lineTo(cw, topH);
    g.closePath(); g.fill();
    // Steinfugen
    g.strokeStyle = alpha(shade(pal.wall, -0.6), 0.55);
    g.lineWidth = Math.max(1, cw * 0.02);
    for (let i = 1; i < 3; i++) {
      const y = topH + ((ch - topH) * i) / 3;
      g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const y0 = topH + ((ch - topH) * i) / 3, y1 = topH + ((ch - topH) * (i + 1)) / 3;
      const x = cw * (i % 2 ? 0.35 : 0.65);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    }
    // Körnung
    for (let i = 0; i < 90; i++) {
      g.fillStyle = alpha(rng.chance(0.5) ? '#ffffff' : '#000000', rng.range(0.02, 0.07));
      g.fillRect(rng.next() * cw, topH + rng.next() * (ch - topH), rng.range(1, 3), rng.range(1, 3));
    }
    g.strokeStyle = shade(pal.wall, -0.7);
    g.lineWidth = Math.max(1.5, cw * 0.022);
    g.strokeRect(0, topH * 0.0, cw, ch);
  });
}

const PROPS = {
  kiste(g, w, h) {
    const pad = w * 0.1;
    body(g, () => roundRect(g, pad, h * 0.22, w - pad * 2, h * 0.68, w * 0.05), '#9a6b3a', w);
    g.strokeStyle = '#5e3c1c'; g.lineWidth = w * 0.04;
    g.beginPath(); g.moveTo(pad, h * 0.22); g.lineTo(w - pad, h * 0.9); g.stroke();
    g.beginPath(); g.moveTo(w - pad, h * 0.22); g.lineTo(pad, h * 0.9); g.stroke();
    g.strokeStyle = '#c9a05a'; g.lineWidth = w * 0.03;
    g.strokeRect(pad * 1.4, h * 0.3, w - pad * 2.8, h * 0.52);
  },
  fass(g, w, h) {
    body(g, () => {
      g.beginPath();
      g.moveTo(w * 0.22, h * 0.26);
      g.bezierCurveTo(w * 0.1, h * 0.55, w * 0.1, h * 0.65, w * 0.22, h * 0.9);
      g.lineTo(w * 0.78, h * 0.9);
      g.bezierCurveTo(w * 0.9, h * 0.65, w * 0.9, h * 0.55, w * 0.78, h * 0.26);
      g.closePath();
    }, '#7a5230', w);
    g.fillStyle = '#5a6670';
    for (const y of [0.4, 0.62, 0.84]) g.fillRect(w * 0.1, h * y, w * 0.8, h * 0.05);
    g.fillStyle = '#95673a';
    g.beginPath(); g.ellipse(w * 0.5, h * 0.26, w * 0.28, h * 0.08, 0, 0, TAU); g.fill();
    g.strokeStyle = '#3d2a14'; g.lineWidth = w * 0.025; g.stroke();
  },
  saeule(g, w, h) {
    body(g, () => roundRect(g, w * 0.26, h * 0.1, w * 0.48, h * 0.8, w * 0.04), '#8a8378', w);
    g.fillStyle = '#a39b8e';
    g.beginPath(); g.ellipse(w * 0.5, h * 0.12, w * 0.3, h * 0.07, 0, 0, TAU); g.fill();
    g.strokeStyle = '#4a463e'; g.lineWidth = w * 0.025; g.stroke();
    g.strokeStyle = alpha('#3a3630', 0.5); g.lineWidth = w * 0.02;
    for (const x of [0.38, 0.5, 0.62]) {
      g.beginPath(); g.moveTo(w * x, h * 0.16); g.lineTo(w * x, h * 0.86); g.stroke();
    }
  },
  stein(g, w, h) {
    body(g, () => blobPath(g, w * 0.5, h * 0.6, w * 0.36, h * 0.3, makeRng(7), 0.2, 9), '#7d7a72', w);
  },
  pilz(g, w, h) {
    g.fillStyle = '#e8dcc0';
    roundRect(g, w * 0.42, h * 0.5, w * 0.16, h * 0.4, w * 0.06); g.fill();
    g.strokeStyle = '#a89878'; g.lineWidth = w * 0.02; g.stroke();
    body(g, () => {
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.48, w * 0.36, h * 0.26, 0, Math.PI, TAU);
      g.closePath();
    }, '#c0453a', w);
    g.fillStyle = alpha('#fdf6e6', 0.9);
    for (const [x, y, r] of [[0.38, 0.36, 0.05], [0.56, 0.32, 0.04], [0.66, 0.42, 0.035]]) {
      g.beginPath(); g.arc(w * x, h * y, w * r, 0, TAU); g.fill();
    }
  },
  fackel(g, w, h) {
    g.strokeStyle = '#5e3c1c'; g.lineWidth = w * 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.5, h * 0.9); g.lineTo(w * 0.5, h * 0.42); g.stroke();
    g.fillStyle = '#ff9a3d';
    g.beginPath();
    g.moveTo(w * 0.36, h * 0.42);
    g.quadraticCurveTo(w * 0.5, h * 0.02, w * 0.64, h * 0.42);
    g.closePath();
    g.shadowColor = '#ff9a3d'; g.shadowBlur = w * 0.3; g.fill(); g.shadowBlur = 0;
    g.fillStyle = '#ffe79a';
    g.beginPath();
    g.moveTo(w * 0.43, h * 0.42);
    g.quadraticCurveTo(w * 0.5, h * 0.18, w * 0.57, h * 0.42);
    g.closePath(); g.fill();
  },
  knochen(g, w, h) {
    g.fillStyle = '#e8e0cc';
    g.strokeStyle = '#9a9078'; g.lineWidth = w * 0.02;
    g.save();
    g.translate(w * 0.5, h * 0.65); g.rotate(-0.4);
    roundRect(g, -w * 0.3, -h * 0.05, w * 0.6, h * 0.1, h * 0.05); g.fill(); g.stroke();
    for (const s of [-1, 1]) for (const d of [-1, 1]) {
      g.beginPath(); g.arc(s * w * 0.3, d * h * 0.06, w * 0.06, 0, TAU); g.fill(); g.stroke();
    }
    g.restore();
  },
};

export function propSprite(id, size = 72) {
  const fn = PROPS[id] || PROPS.kiste;
  return sprite(`prop:${id}:${size}`, size, size * 1.15, (g, w, h) => fn(g, w, h));
}

/** Truhe — offen und zu. */
export function chestSprite(open, size = 80) {
  return sprite(`chest:${open ? 1 : 0}:${size}`, size, size, (g, w, h) => {
    const base = '#8a5a2a';
    body(g, () => roundRect(g, w * 0.12, h * 0.42, w * 0.76, h * 0.46, w * 0.05), base, w);
    g.strokeStyle = '#d9b154'; g.lineWidth = w * 0.035;
    g.beginPath(); g.moveTo(w * 0.12, h * 0.62); g.lineTo(w * 0.88, h * 0.62); g.stroke();
    if (open) {
      g.save();
      g.translate(w * 0.5, h * 0.44); g.rotate(-0.95);
      body(g, () => {
        g.beginPath();
        g.ellipse(0, 0, w * 0.38, h * 0.2, 0, Math.PI, TAU);
        g.closePath();
      }, shade(base, 0.1), w);
      g.restore();
      // Leuchten
      const grd = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.4);
      grd.addColorStop(0, alpha('#ffe79a', 0.85));
      grd.addColorStop(1, alpha('#ffe79a', 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    } else {
      body(g, () => {
        g.beginPath();
        g.ellipse(w * 0.5, h * 0.44, w * 0.38, h * 0.2, 0, Math.PI, TAU);
        g.closePath();
      }, shade(base, 0.12), w);
      g.fillStyle = '#d9b154';
      roundRect(g, w * 0.43, h * 0.4, w * 0.14, h * 0.18, w * 0.02); g.fill();
      g.fillStyle = '#4a2e12';
      g.beginPath(); g.arc(w * 0.5, h * 0.48, w * 0.025, 0, TAU); g.fill();
    }
  });
}

// --- Pickups & Effekte -------------------------------------------------

/**
 * Knollen sind die Währung und müssen sich auf den ersten Blick von
 * Kartoffelkäfern unterscheiden — beide wären sonst braune Ovale. Deshalb
 * golden, mit hartem Glanzpunkt und hellem Rand.
 */
export function knolleSprite(size = 28) {
  return sprite(`knolle:${size}`, size, size, (g, w, h) => {
    const path = () => blobPath(g, w / 2, h * 0.52, w * 0.33, h * 0.28, makeRng(42), 0.18, 8);
    path();
    g.fillStyle = '#f5c842';
    g.fill();
    g.save();
    path(); g.clip();
    const grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
    grd.addColorStop(0, alpha('#fff3c4', 0.95));
    grd.addColorStop(0.5, alpha('#f5c842', 0));
    grd.addColorStop(1, alpha('#9a6b10', 0.7));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.restore();
    path();
    g.lineWidth = Math.max(1.5, w * 0.055);
    g.strokeStyle = '#6b4708';
    g.stroke();
    // Glanzpunkt
    g.beginPath();
    g.ellipse(w * 0.38, h * 0.42, w * 0.11, h * 0.07, -0.6, 0, TAU);
    g.fillStyle = '#fffbe8';
    g.fill();
  });
}

export function orbSprite(color, size = 24) {
  return sprite(`orb:${color}:${size}`, size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w * 0.4, h * 0.36, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.3, color);
    grd.addColorStop(1, alpha(color, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, TAU); g.fill();
  });
}

export function heartSprite(size = 30) {
  return sprite(`heart:${size}`, size, size, (g, w, h) => {
    const path = () => {
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.85);
      g.bezierCurveTo(w * -0.05, h * 0.5, w * 0.18, h * 0.08, w * 0.5, h * 0.33);
      g.bezierCurveTo(w * 0.82, h * 0.08, w * 1.05, h * 0.5, w * 0.5, h * 0.85);
      g.closePath();
    };
    body(g, path, '#e04a5a', w);
    g.fillStyle = alpha('#ffffff', 0.55);
    g.beginPath(); g.ellipse(w * 0.35, h * 0.33, w * 0.1, h * 0.07, -0.6, 0, TAU); g.fill();
  });
}

/** Weicher Lichtfleck — für Fackeln, Projektile, Auren. */
export function glowSprite(color, size = 256) {
  return sprite(`glow:${color}:${size}`, size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, alpha(color, 0.95));
    grd.addColorStop(0.25, alpha(color, 0.45));
    grd.addColorStop(0.6, alpha(color, 0.12));
    grd.addColorStop(1, alpha(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

export function shadowSprite(size = 96) {
  return sprite(`shadow:${size}`, size, size * 0.5, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.42)');
    grd.addColorStop(0.65, 'rgba(0,0,0,0.16)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.save(); g.translate(w / 2, h / 2); g.scale(1, 0.5); g.translate(-w / 2, -h / 2);
    g.fillRect(0, 0, w, h);
    g.restore();
  });
}

/** Ringwelle für Explosionen/Novas. */
export function ringSprite(color, size = 256) {
  return sprite(`ring:${color}:${size}`, size, size, (g, w, h) => {
    g.strokeStyle = color;
    g.lineWidth = size * 0.055;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, TAU); g.stroke();
    g.globalAlpha = 0.4;
    g.lineWidth = size * 0.11;
    g.stroke();
  });
}

// --- Waffen & Icons ----------------------------------------------------
// Waffen werden in der Hand gezeichnet (nach rechts zeigend) und als Icon
// im Menü wiederverwendet.

const WEAPON_ART = {
  klinge(g, w, h, col) {
    const cy = h / 2;
    g.fillStyle = '#6b4a2a';
    roundRect(g, w * 0.04, cy - h * 0.055, w * 0.22, h * 0.11, h * 0.05); g.fill();
    g.fillStyle = '#c9a05a';
    roundRect(g, w * 0.22, cy - h * 0.16, w * 0.07, h * 0.32, h * 0.03); g.fill();
    g.beginPath();
    g.moveTo(w * 0.29, cy - h * 0.1);
    g.lineTo(w * 0.86, cy - h * 0.05);
    g.lineTo(w * 0.97, cy);
    g.lineTo(w * 0.86, cy + h * 0.05);
    g.lineTo(w * 0.29, cy + h * 0.1);
    g.closePath();
    g.fillStyle = col; g.fill();
    g.strokeStyle = shade(col, -0.55); g.lineWidth = h * 0.028; g.stroke();
    g.beginPath(); g.moveTo(w * 0.32, cy); g.lineTo(w * 0.9, cy);
    g.strokeStyle = alpha('#ffffff', 0.6); g.lineWidth = h * 0.022; g.stroke();
  },
  wucht(g, w, h, col) {
    const cy = h / 2;
    g.fillStyle = '#6b4a2a';
    roundRect(g, w * 0.04, cy - h * 0.05, w * 0.6, h * 0.1, h * 0.05); g.fill();
    g.strokeStyle = '#3a2614'; g.lineWidth = h * 0.02; g.stroke();
    body(g, () => roundRect(g, w * 0.58, cy - h * 0.26, w * 0.36, h * 0.52, h * 0.08), col, h * 1.4);
    g.fillStyle = alpha('#ffffff', 0.3);
    roundRect(g, w * 0.62, cy - h * 0.2, w * 0.1, h * 0.14, h * 0.03); g.fill();
  },
  stich(g, w, h, col) {
    const cy = h / 2;
    g.fillStyle = '#5e4a3a';
    roundRect(g, w * 0.02, cy - h * 0.045, w * 0.5, h * 0.09, h * 0.04); g.fill();
    g.beginPath();
    g.moveTo(w * 0.5, cy - h * 0.07);
    g.lineTo(w * 0.98, cy);
    g.lineTo(w * 0.5, cy + h * 0.07);
    g.closePath();
    g.fillStyle = col; g.fill();
    g.strokeStyle = shade(col, -0.5); g.lineWidth = h * 0.025; g.stroke();
  },
  bogen(g, w, h, col) {
    const cy = h / 2;
    g.strokeStyle = col; g.lineWidth = h * 0.09; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.08);
    g.quadraticCurveTo(w * 0.95, cy, w * 0.3, h * 0.92);
    g.stroke();
    g.strokeStyle = shade(col, -0.5); g.lineWidth = h * 0.03; g.stroke();
    g.strokeStyle = '#e8e0cc'; g.lineWidth = h * 0.02;
    g.beginPath(); g.moveTo(w * 0.3, h * 0.08); g.lineTo(w * 0.22, cy); g.lineTo(w * 0.3, h * 0.92); g.stroke();
    g.strokeStyle = '#c9a05a'; g.lineWidth = h * 0.035;
    g.beginPath(); g.moveTo(w * 0.22, cy); g.lineTo(w * 0.75, cy); g.stroke();
  },
  rohr(g, w, h, col) {
    const cy = h / 2;
    g.fillStyle = '#4a4238';
    roundRect(g, w * 0.04, cy - h * 0.09, w * 0.3, h * 0.18, h * 0.05); g.fill();
    body(g, () => roundRect(g, w * 0.3, cy - h * 0.13, w * 0.64, h * 0.26, h * 0.06), col, h * 1.4);
    g.fillStyle = '#1a1510';
    g.beginPath(); g.ellipse(w * 0.93, cy, h * 0.05, h * 0.1, 0, 0, TAU); g.fill();
  },
  stab(g, w, h, col) {
    const cy = h / 2;
    g.strokeStyle = '#6b4a2a'; g.lineWidth = h * 0.09; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.06, cy); g.lineTo(w * 0.74, cy); g.stroke();
    g.beginPath(); g.arc(w * 0.84, cy, h * 0.19, 0, TAU);
    g.fillStyle = col;
    g.shadowColor = col; g.shadowBlur = h * 0.3; g.fill(); g.shadowBlur = 0;
    g.strokeStyle = shade(col, -0.45); g.lineWidth = h * 0.03; g.stroke();
    g.fillStyle = alpha('#ffffff', 0.7);
    g.beginPath(); g.arc(w * 0.8, cy - h * 0.06, h * 0.05, 0, TAU); g.fill();
  },
  konstrukt(g, w, h, col) {
    const cy = h / 2;
    body(g, () => roundRect(g, w * 0.12, cy - h * 0.24, w * 0.56, h * 0.48, h * 0.07), col, h * 1.4);
    g.fillStyle = '#4a5560';
    roundRect(g, w * 0.6, cy - h * 0.08, w * 0.34, h * 0.16, h * 0.04); g.fill();
    g.fillStyle = '#9ef0ff';
    g.shadowColor = '#9ef0ff'; g.shadowBlur = h * 0.2;
    g.beginPath(); g.arc(w * 0.32, cy, h * 0.09, 0, TAU); g.fill();
    g.shadowBlur = 0;
  },
};

export function weaponSprite(art, color, len = 96) {
  const fn = WEAPON_ART[art] || WEAPON_ART.klinge;
  return sprite(`weapon:${art}:${color}:${len}`, len, len * 0.5, (g, w, h) => fn(g, w, h, color));
}

/** Quadratisches Icon fürs Menü — gleiche Kunst, nur gedreht und zentriert. */
export function weaponIcon(art, color, size = 72) {
  const fn = WEAPON_ART[art] || WEAPON_ART.klinge;
  return sprite(`wicon:${art}:${color}:${size}`, size, size, (g, w, h) => {
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-Math.PI / 4);
    g.translate(-w * 0.46, -h * 0.12);
    fn(g, w * 0.92, h * 0.46, color);
    g.restore();
  });
}

/** Rüstung als Icon. */
export function armorIcon(color, size = 72) {
  return sprite(`armor:${color}:${size}`, size, size, (g, w, h) => {
    body(g, () => {
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.12);
      g.lineTo(w * 0.86, h * 0.26);
      g.quadraticCurveTo(w * 0.88, h * 0.72, w * 0.5, h * 0.9);
      g.quadraticCurveTo(w * 0.12, h * 0.72, w * 0.14, h * 0.26);
      g.closePath();
    }, color, w);
    g.strokeStyle = alpha('#ffffff', 0.45); g.lineWidth = w * 0.025;
    g.beginPath(); g.moveTo(w * 0.5, h * 0.2); g.lineTo(w * 0.5, h * 0.82); g.stroke();
    g.beginPath(); g.moveTo(w * 0.2, h * 0.42); g.lineTo(w * 0.8, h * 0.42); g.stroke();
  });
}

/** Artefakt-Icon: Symbol in einem Ring. Das Glyph kommt als Zeichenfunktion. */
const ARTIFACT_GLYPHS = {
  totem(g, w, h, col) {
    g.fillStyle = col;
    roundRect(g, w * 0.36, h * 0.2, w * 0.28, h * 0.6, w * 0.06); g.fill();
    g.strokeStyle = shade(col, -0.5); g.lineWidth = w * 0.03; g.stroke();
    g.fillStyle = '#fdf6e6';
    for (const y of [0.33, 0.52, 0.7]) {
      g.beginPath(); g.arc(w * 0.5, h * y, w * 0.05, 0, TAU); g.fill();
    }
  },
  rakete(g, w, h, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.12);
    g.lineTo(w * 0.66, h * 0.52);
    g.lineTo(w * 0.34, h * 0.52);
    g.closePath(); g.fill();
    g.fillStyle = shade(col, -0.25);
    roundRect(g, w * 0.4, h * 0.5, w * 0.2, h * 0.26, w * 0.04); g.fill();
    g.fillStyle = '#ff9a3d';
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.76); g.lineTo(w * 0.5, h * 0.94); g.lineTo(w * 0.58, h * 0.76);
    g.closePath();
    g.shadowColor = '#ff9a3d'; g.shadowBlur = w * 0.14; g.fill(); g.shadowBlur = 0;
  },
  kristall(g, w, h, col) {
    starPath(g, w * 0.5, h * 0.5, w * 0.36, w * 0.14, 6, -0.3);
    g.fillStyle = col;
    g.shadowColor = col; g.shadowBlur = w * 0.16; g.fill(); g.shadowBlur = 0;
    g.strokeStyle = alpha('#ffffff', 0.6); g.lineWidth = w * 0.022; g.stroke();
  },
  horn(g, w, h, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(w * 0.16, h * 0.62);
    g.quadraticCurveTo(w * 0.52, h * 0.2, w * 0.86, h * 0.34);
    g.quadraticCurveTo(w * 0.6, h * 0.52, w * 0.3, h * 0.78);
    g.closePath(); g.fill();
    g.strokeStyle = shade(col, -0.5); g.lineWidth = w * 0.03; g.stroke();
  },
  wolke(g, w, h, col) {
    g.fillStyle = col;
    for (const [x, y, r] of [[0.34, 0.54, 0.17], [0.52, 0.44, 0.21], [0.7, 0.56, 0.16]]) {
      g.beginPath(); g.arc(w * x, h * y, w * r, 0, TAU); g.fill();
    }
    g.fillStyle = alpha('#ffffff', 0.5);
    g.beginPath(); g.arc(w * 0.46, h * 0.44, w * 0.07, 0, TAU); g.fill();
  },
  blitz(g, w, h, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(w * 0.58, h * 0.1); g.lineTo(w * 0.3, h * 0.54); g.lineTo(w * 0.48, h * 0.54);
    g.lineTo(w * 0.38, h * 0.92); g.lineTo(w * 0.72, h * 0.44); g.lineTo(w * 0.52, h * 0.44);
    g.lineTo(w * 0.64, h * 0.1);
    g.closePath();
    g.shadowColor = col; g.shadowBlur = w * 0.18; g.fill(); g.shadowBlur = 0;
    g.strokeStyle = shade(col, -0.4); g.lineWidth = w * 0.02; g.stroke();
  },
  schleier(g, w, h, col) {
    g.fillStyle = alpha(col, 0.75);
    g.beginPath();
    g.moveTo(w * 0.2, h * 0.76);
    g.bezierCurveTo(w * 0.2, h * 0.14, w * 0.8, h * 0.14, w * 0.8, h * 0.76);
    for (let i = 3; i >= 0; i--) {
      const x0 = w * (0.2 + (0.6 * i) / 4), x1 = w * (0.2 + (0.6 * (i + 0.5)) / 4);
      g.quadraticCurveTo(x1, h * (i % 2 ? 0.94 : 0.68), x0, h * 0.78);
    }
    g.closePath(); g.fill();
    g.strokeStyle = alpha('#ffffff', 0.4); g.lineWidth = w * 0.022; g.stroke();
  },
  guertel(g, w, h, col) {
    g.fillStyle = col;
    roundRect(g, w * 0.1, h * 0.4, w * 0.8, h * 0.2, w * 0.04); g.fill();
    g.strokeStyle = shade(col, -0.5); g.lineWidth = w * 0.028; g.stroke();
    g.fillStyle = '#f0c93a';
    roundRect(g, w * 0.4, h * 0.32, w * 0.2, h * 0.36, w * 0.04); g.fill();
    g.strokeStyle = '#8a6a10'; g.stroke();
  },
  falle(g, w, h, col) {
    g.strokeStyle = col; g.lineWidth = w * 0.06; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      g.beginPath();
      g.moveTo(w * 0.5, h * 0.5);
      g.quadraticCurveTo(
        w * 0.5 + Math.cos(a) * w * 0.2, h * 0.5 + Math.sin(a) * h * 0.2,
        w * 0.5 + Math.cos(a + 0.5) * w * 0.38, h * 0.5 + Math.sin(a + 0.5) * h * 0.38,
      );
      g.stroke();
    }
    g.fillStyle = shade(col, -0.2);
    g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.1, 0, TAU); g.fill();
  },
  sand(g, w, h, col) {
    g.strokeStyle = col; g.lineWidth = w * 0.045;
    g.beginPath();
    g.moveTo(w * 0.28, h * 0.16); g.lineTo(w * 0.72, h * 0.16);
    g.lineTo(w * 0.52, h * 0.5); g.lineTo(w * 0.72, h * 0.84); g.lineTo(w * 0.28, h * 0.84);
    g.lineTo(w * 0.48, h * 0.5); g.closePath();
    g.stroke();
    g.fillStyle = alpha(col, 0.55); g.fill();
  },
  bombe(g, w, h, col) {
    body(g, () => { g.beginPath(); g.arc(w * 0.5, h * 0.6, w * 0.3, 0, TAU); }, col, w);
    g.strokeStyle = '#8a7a5a'; g.lineWidth = w * 0.04; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.56, h * 0.32);
    g.quadraticCurveTo(w * 0.78, h * 0.18, w * 0.7, h * 0.08);
    g.stroke();
    g.fillStyle = '#ff9a3d';
    g.beginPath(); g.arc(w * 0.7, h * 0.07, w * 0.055, 0, TAU);
    g.shadowColor = '#ff9a3d'; g.shadowBlur = w * 0.16; g.fill(); g.shadowBlur = 0;
  },
};

export function artifactIcon(glyph, color, size = 80) {
  const fn = ARTIFACT_GLYPHS[glyph] || ARTIFACT_GLYPHS.kristall;
  return sprite(`art:${glyph}:${color}:${size}`, size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w * 0.4, h * 0.34, 0, w / 2, h / 2, w * 0.56);
    grd.addColorStop(0, alpha(shade(color, 0.3), 0.3));
    grd.addColorStop(1, alpha('#000000', 0.25));
    g.fillStyle = grd;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.48, 0, TAU); g.fill();
    g.strokeStyle = alpha(color, 0.9); g.lineWidth = w * 0.035;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, TAU); g.stroke();
    g.save();
    g.translate(w * 0.5, h * 0.5); g.scale(0.72, 0.72); g.translate(-w * 0.5, -h * 0.5);
    fn(g, w, h, color);
    g.restore();
  });
}

/** Verzauberungs-Rune: kleines geometrisches Siegel pro ID. */
export function runeIcon(id, color, size = 56) {
  return sprite(`rune:${id}:${color}:${size}`, size, size, (g, w, h) => {
    const rng = makeRng(hashStr('rune' + id));
    g.strokeStyle = alpha(color, 0.9);
    g.lineWidth = w * 0.06;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const n = rng.int(3, 5);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.3, 0.3);
      const r = w * rng.range(0.2, 0.36);
      pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.shadowColor = color; g.shadowBlur = w * 0.14;
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = alpha(color, 0.22); g.fill();
    g.fillStyle = color;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.07, 0, TAU); g.fill();
  });
}

/** Partikel-Punkt, einmal gezeichnet statt tausendfach arc(). */
export function dotSprite(color, size = 16) {
  return sprite(`dot:${color}:${size}`, size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, color);
    grd.addColorStop(0.55, alpha(color, 0.7));
    grd.addColorStop(1, alpha(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

/** Vorgefertigter Vignetten-Layer, damit wir ihn nicht pro Frame bauen. */
export function vignette(w, h, strength, color = '#000000') {
  const key = `vig:${w}x${h}:${strength}:${color}`;
  return sprite(key, w, h, (g, cw, ch) => {
    const grd = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.28, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
    grd.addColorStop(0, alpha(color, 0));
    grd.addColorStop(0.7, alpha(color, strength * 0.45));
    grd.addColorStop(1, alpha(color, strength));
    g.fillStyle = grd;
    g.fillRect(0, 0, cw, ch);
  });
}
