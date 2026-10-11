// Partikel, Schadenszahlen, Ringe, Bildschirm-Wackeln.
//
// Alles läuft über feste Pools. Auf einem Mittelklasse-Handy ist der
// Garbage Collector der Hauptgrund für Ruckler, deshalb wird hier nach dem
// Start nichts mehr allokiert.

import { clamp, TAU, easeOutCubic } from './math.js';
import { vfxRng as rng } from './rng.js';
import { settings } from './storage.js';
import { dotSprite, glowSprite, ringSprite, alpha } from './sprites.js';

const MAX_PARTICLES = 900;
const MAX_TEXTS = 80;
const MAX_RINGS = 40;
const MAX_DECALS = 120;

function makePool(size, factory) {
  const items = new Array(size);
  for (let i = 0; i < size; i++) items[i] = factory();
  return { items, count: 0 };
}

const particles = makePool(MAX_PARTICLES, () => ({
  x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, color: '#fff',
  drag: 0.9, grav: 0, spin: 0, rot: 0, kind: 0, z: 0, vz: 0,
}));

const texts = makePool(MAX_TEXTS, () => ({
  x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 16, crit: false,
}));

const rings = makePool(MAX_RINGS, () => ({
  x: 0, y: 0, r0: 0, r1: 0, life: 0, maxLife: 1, color: '#fff', width: 3, fill: false,
}));

const decals = makePool(MAX_DECALS, () => ({
  x: 0, y: 0, r: 0, life: 0, maxLife: 1, color: '#000', rot: 0,
}));

const shake = { x: 0, y: 0, power: 0, decay: 1, t: 0 };
const flash = { a: 0, color: '#fff', decay: 4 };
let hitStop = 0;

/** Partikelbudget je nach Einstellung — "sparsam" halbiert alles. */
const budget = () => settings().particles;

function spawn(pool) {
  if (pool.count >= pool.items.length) {
    // Pool voll: ältestes Element überschreiben, nicht wachsen.
    let oldest = 0, min = Infinity;
    for (let i = 0; i < pool.count; i++) {
      const l = pool.items[i].life;
      if (l < min) { min = l; oldest = i; }
    }
    return pool.items[oldest];
  }
  return pool.items[pool.count++];
}

function kill(pool, i) {
  pool.count--;
  const tmp = pool.items[i];
  pool.items[i] = pool.items[pool.count];
  pool.items[pool.count] = tmp;
}

// --- Partikel ----------------------------------------------------------

export const P_DOT = 0, P_SPARK = 1, P_SMOKE = 2, P_SHARD = 3;

export function particle(x, y, vx, vy, opts = {}) {
  const p = spawn(particles);
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.maxLife = p.life = opts.life ?? 0.5;
  p.size = opts.size ?? 5;
  p.color = opts.color ?? '#ffd27a';
  p.drag = opts.drag ?? 2.2;
  p.grav = opts.grav ?? 0;
  p.kind = opts.kind ?? P_DOT;
  p.rot = opts.rot ?? rng.angle();
  p.spin = opts.spin ?? 0;
  p.z = opts.z ?? 0;
  p.vz = opts.vz ?? 0;
  return p;
}

/** Treffer-Funken in eine Richtung. */
export function burst(x, y, count, opts = {}) {
  count = Math.round(count * budget());
  if (count <= 0) return;
  const {
    color = '#ffd27a', speed = 160, spread = TAU, dir = 0,
    life = 0.38, size = 5, kind = P_SPARK, grav = 0, drag = 3.4,
  } = opts;
  for (let i = 0; i < count; i++) {
    const a = dir + rng.range(-spread / 2, spread / 2);
    const s = speed * rng.range(0.45, 1.25);
    particle(x, y, Math.cos(a) * s, Math.sin(a) * s, {
      color, life: life * rng.range(0.7, 1.3), size: size * rng.range(0.7, 1.35),
      kind, grav, drag, spin: rng.range(-9, 9),
    });
  }
}

/** Blut/Mus beim Treffer — bleibt als Fleck am Boden liegen. */
export function splatter(x, y, dir, color, amount = 8) {
  burst(x, y, amount, { color, dir, spread: 1.5, speed: 190, size: 6, kind: P_SHARD, grav: 420, drag: 1.2, life: 0.55 });
  if (budget() > 0.6 && rng.chance(0.5)) decal(x, y + 6, rng.range(10, 20), color, 7);
}

export function smoke(x, y, count = 4, opts = {}) {
  count = Math.round(count * budget());
  const { color = '#9a9078', speed = 34, life = 0.95, size = 18 } = opts;
  for (let i = 0; i < count; i++) {
    const a = rng.angle();
    particle(x + rng.range(-6, 6), y + rng.range(-6, 6), Math.cos(a) * speed * rng.next(), Math.sin(a) * speed * rng.next() - 18, {
      color, life: life * rng.range(0.7, 1.3), size: size * rng.range(0.7, 1.4),
      kind: P_SMOKE, drag: 1.2, spin: rng.range(-1.5, 1.5),
    });
  }
}

/** Staubring, wenn jemand landet oder losspringt. */
export function dust(x, y, radius = 24, color = '#b8a88a') {
  const n = Math.round(10 * budget());
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.2, 0.2);
    particle(x + Math.cos(a) * radius * 0.4, y + Math.sin(a) * radius * 0.2, Math.cos(a) * radius * 3.4, Math.sin(a) * radius * 1.2, {
      color, life: rng.range(0.3, 0.55), size: rng.range(7, 14), kind: P_SMOKE, drag: 5,
    });
  }
}

export function trail(x, y, color, size = 6, life = 0.25) {
  if (budget() <= 0) return;
  particle(x + rng.range(-2, 2), y + rng.range(-2, 2), rng.range(-14, 14), rng.range(-14, 14), {
    color, life, size, kind: P_DOT, drag: 4,
  });
}

// --- Schadenszahlen ----------------------------------------------------

export function damageText(x, y, value, opts = {}) {
  if (!settings().showDamage && !opts.force) return;
  const t = spawn(texts);
  t.x = x + rng.range(-7, 7); t.y = y;
  t.vx = rng.range(-26, 26); t.vy = opts.vy ?? -108;
  t.maxLife = t.life = opts.life ?? 0.78;
  t.text = typeof value === 'number' ? String(Math.round(value)) : String(value);
  t.crit = !!opts.crit;
  t.color = opts.color ?? (opts.crit ? '#ffd93d' : '#fff4e0');
  t.size = (opts.size ?? 17) * (opts.crit ? 1.45 : 1);
  return t;
}

export function notice(x, y, text, color = '#9ef0ff', size = 19) {
  const t = spawn(texts);
  t.x = x; t.y = y;
  t.vx = 0; t.vy = -52;
  t.maxLife = t.life = 1.15;
  t.text = text; t.color = color; t.size = size; t.crit = false;
  return t;
}

// --- Ringe & Flecken ---------------------------------------------------

export function ring(x, y, r0, r1, opts = {}) {
  const r = spawn(rings);
  r.x = x; r.y = y; r.r0 = r0; r.r1 = r1;
  r.maxLife = r.life = opts.life ?? 0.4;
  r.color = opts.color ?? '#ffd27a';
  r.width = opts.width ?? 4;
  r.fill = !!opts.fill;
  return r;
}

export function decal(x, y, r, color, life = 9) {
  if (budget() < 0.4) return;
  const d = spawn(decals);
  d.x = x; d.y = y; d.r = r; d.color = color;
  d.maxLife = d.life = life;
  d.rot = rng.angle();
  return d;
}

// --- Kamera-Effekte ----------------------------------------------------

export function addShake(power, decay = 3.2) {
  const s = settings().shake;
  if (s <= 0) return;
  shake.power = Math.max(shake.power, power * s);
  shake.decay = decay;
}

export function addFlash(color = '#ffffff', amount = 0.3, decay = 4) {
  flash.color = color;
  flash.a = Math.max(flash.a, amount);
  flash.decay = decay;
}

/** Kurzes Einfrieren bei schweren Treffern — macht Schläge fühlbar. */
export function addHitStop(seconds) {
  hitStop = Math.max(hitStop, seconds);
}

export function consumeHitStop(dt) {
  if (hitStop <= 0) return 0;
  const used = Math.min(hitStop, dt);
  hitStop -= used;
  return used;
}

export const shakeOffset = () => shake;
export const flashState = () => flash;

// --- Explosion (Komplettpaket) -----------------------------------------

export function explosion(x, y, radius, opts = {}) {
  const { color = '#ff9a3d', color2 = '#ffe79a', shake: sh = radius * 0.1, particles: pc = 1 } = opts;
  ring(x, y, radius * 0.25, radius * 1.15, { color: color2, width: 7, life: 0.34 });
  ring(x, y, radius * 0.1, radius * 0.75, { color, width: 16, life: 0.26, fill: true });
  burst(x, y, 22 * pc, { color, speed: radius * 3.4, life: 0.46, size: 9, kind: P_SPARK, drag: 3.8 });
  burst(x, y, 10 * pc, { color: color2, speed: radius * 1.9, life: 0.6, size: 13, kind: P_SMOKE, drag: 1.6 });
  smoke(x, y, 7 * pc, { color: '#6b5f4a', size: radius * 0.45, life: 1.1 });
  addShake(sh);
  addFlash(color2, 0.16, 7);
}

// --- Update ------------------------------------------------------------

export function updateFx(dt) {
  for (let i = particles.count - 1; i >= 0; i--) {
    const p = particles.items[i];
    p.life -= dt;
    if (p.life <= 0) { kill(particles, i); continue; }
    const d = Math.exp(-p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.vz || p.z) {
      p.vz += 900 * dt;
      p.z += p.vz * dt;
      if (p.z > 0) { p.z = 0; p.vz *= -0.35; }
    }
  }
  for (let i = texts.count - 1; i >= 0; i--) {
    const t = texts.items[i];
    t.life -= dt;
    if (t.life <= 0) { kill(texts, i); continue; }
    t.vy += 240 * dt;
    t.vx *= Math.exp(-2 * dt);
    t.x += t.vx * dt; t.y += t.vy * dt;
  }
  for (let i = rings.count - 1; i >= 0; i--) {
    const r = rings.items[i];
    r.life -= dt;
    if (r.life <= 0) kill(rings, i);
  }
  for (let i = decals.count - 1; i >= 0; i--) {
    const d = decals.items[i];
    d.life -= dt;
    if (d.life <= 0) kill(decals, i);
  }

  if (shake.power > 0.01) {
    shake.t += dt * 42;
    shake.power *= Math.exp(-shake.decay * dt);
    // Zwei Sinus mit krummem Verhältnis — wirkt zufälliger als Math.random
    shake.x = Math.sin(shake.t) * shake.power;
    shake.y = Math.cos(shake.t * 1.37) * shake.power;
  } else {
    shake.power = 0; shake.x = 0; shake.y = 0;
  }

  if (flash.a > 0.001) flash.a *= Math.exp(-flash.decay * dt);
  else flash.a = 0;
}

export function clearFx() {
  particles.count = 0; texts.count = 0; rings.count = 0; decals.count = 0;
  shake.power = 0; shake.x = 0; shake.y = 0;
  flash.a = 0; hitStop = 0;
}

/** Nur Flecken behalten löschen wir beim Wellenwechsel nicht mit. */
export function clearTransient() {
  particles.count = 0; texts.count = 0; rings.count = 0;
}

// --- Zeichnen ----------------------------------------------------------

/** Flecken liegen unter allem anderen. */
export function drawDecals(g) {
  for (let i = 0; i < decals.count; i++) {
    const d = decals.items[i];
    const fade = clamp(d.life / Math.min(1.6, d.maxLife), 0, 1);
    g.save();
    g.globalAlpha = 0.3 * fade;
    g.translate(d.x, d.y);
    g.rotate(d.rot);
    g.scale(1, 0.55);
    g.fillStyle = d.color;
    g.beginPath();
    g.arc(0, 0, d.r, 0, TAU);
    g.fill();
    g.restore();
  }
}

export function drawParticles(g) {
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    if (p.kind === P_SMOKE) continue;
    const t = p.life / p.maxLife;
    const a = p.kind === P_SPARK ? clamp(t * 1.6, 0, 1) : t;
    const s = p.size * (p.kind === P_SHARD ? 1 : 0.5 + t * 0.9);
    g.globalAlpha = a;
    if (p.kind === P_SHARD) {
      g.save();
      g.translate(p.x, p.y + p.z);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-s * 0.5, -s * 0.28, s, s * 0.56);
      g.restore();
    } else {
      const img = dotSprite(p.color, 16);
      g.drawImage(img, p.x - s, p.y + p.z - s, s * 2, s * 2);
    }
  }
  g.globalCompositeOperation = 'source-over';

  // Rauch deckend, nicht additiv — sonst leuchtet er.
  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    if (p.kind !== P_SMOKE) continue;
    const t = p.life / p.maxLife;
    const s = p.size * (1.4 - t * 0.5);
    g.globalAlpha = t * 0.4;
    g.drawImage(dotSprite(p.color, 16), p.x - s, p.y - s, s * 2, s * 2);
  }
  g.globalAlpha = 1;
}

export function drawRings(g) {
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rings.count; i++) {
    const r = rings.items[i];
    const t = 1 - r.life / r.maxLife;
    const rad = r.r0 + (r.r1 - r.r0) * easeOutCubic(t);
    g.globalAlpha = (1 - t) * (r.fill ? 0.5 : 0.9);
    if (r.fill) {
      const img = glowSprite(r.color, 128);
      g.drawImage(img, r.x - rad, r.y - rad, rad * 2, rad * 2);
    } else {
      const img = ringSprite(r.color, 128);
      const d = rad * 2.27;
      g.drawImage(img, r.x - d / 2, r.y - d / 2, d, d);
    }
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
}

export function drawTexts(g, scale = 1) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (let i = 0; i < texts.count; i++) {
    const t = texts.items[i];
    const k = t.life / t.maxLife;
    const pop = t.crit ? 1 + (1 - k) * 0.25 : 1;
    const size = t.size * pop * scale;
    g.globalAlpha = clamp(k * 2.2, 0, 1);
    g.font = `900 ${size.toFixed(1)}px Outfit, system-ui, sans-serif`;
    g.lineWidth = Math.max(2.5, size * 0.22);
    g.strokeStyle = 'rgba(16,11,7,0.92)';
    g.strokeText(t.text, t.x, t.y);
    g.fillStyle = t.color;
    g.fillText(t.text, t.x, t.y);
    if (t.crit) {
      g.globalAlpha = clamp(k, 0, 1) * 0.5;
      g.fillStyle = alpha('#ffffff', 0.9);
      g.fillText(t.text, t.x, t.y - size * 0.03);
    }
  }
  g.globalAlpha = 1;
}

export function fxStats() {
  return { particles: particles.count, texts: texts.count, rings: rings.count, decals: decals.count };
}
