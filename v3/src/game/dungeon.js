// Arena-Erzeugung.
//
// Jede Welle spielt in einem eigenen Raum. Minecraft Dungeons lebt davon,
// dass Räume unterschiedlich *geformt* sind — nicht nur unterschiedlich
// dekoriert. Deshalb gibt es Grundformen, die echte Deckung und Engstellen
// erzeugen, und keine leeren Rechtecke.

import { TAU, clamp, dist2, resolveCircleRect, circleRect } from '../core/math.js';
import { floorTile, wallTile, propSprite, chestSprite, glowSprite, alpha, shade } from '../core/sprites.js';
import { HAZARDS } from '../data/biomes.js';

const TILE = 128;
const WALL_T = 72;          // Dicke der Außenmauer
const out = { x: 0, y: 0, hit: false };

const SOLID_PROPS = new Set(['saeule', 'fass', 'kiste', 'stein']);
const DESTRUCTIBLE = new Set(['fass', 'kiste', 'pilz', 'knochen']);

/**
 * Die Arena richtet sich nach dem Bildschirm, nicht nach einer festen Zahl.
 * Auf einem Handy im Hochformat würde ein quadratischer Raum bedeuten, dass
 * seitlich Gegner aus dem Nichts auftauchen — das ist kein Schwierigkeitsgrad,
 * das ist nur unfair. Der Raum ist deshalb immer etwas größer als das Bild:
 * man sieht fast alles, die Kamera bewegt sich nur ein Stück mit.
 */
export function arenaZoomFor(viewW, viewH, wave, boss) {
  const base = clamp(Math.min(viewW, viewH) / 470, 0.6, 1.15);
  const out = base * (1 - Math.min(wave, 20) * 0.008) * (boss ? 0.88 : 1);
  return clamp(out, 0.45, 1.2);
}

export function generateArena(rng, { wave, biome, boss = false, viewW = 800, viewH = 600 }) {
  const zoom = arenaZoomFor(viewW, viewH, wave, boss);
  const worldW = viewW / zoom;
  const worldH = viewH / zoom;

  // Etwas Überhang, damit es Spawn-Raum außerhalb des Bildes gibt.
  const slackW = boss ? 1.5 : 1.26;
  const slackH = boss ? 1.4 : 1.1;
  let w = Math.round(worldW * slackW * rng.range(0.96, 1.06));
  let h = Math.round(worldH * slackH * rng.range(0.96, 1.06));

  // Keine extremen Schläuche — sonst funktionieren die Raumformen nicht.
  w = clamp(w, h * 0.5, h * 2.0);
  h = clamp(h, w * 0.5, w * 2.0);
  // Mindestgröße, damit auch auf sehr kleinen Bildschirmen Platz bleibt.
  w = Math.max(w, 620); h = Math.max(h, 620);

  const shape = boss ? 'round' : rng.pick(['rect', 'rect', 'cross', 'round', 'pillars', 'corners', 'lane']);

  const arena = {
    w, h, zoom,
    halfW: w / 2, halfH: h / 2,
    shape,
    walls: [],
    props: [],
    hazards: [],
    chests: [],
    torches: [],
    floorVariant: rng.int(0, 2),
    pal: biome.pal,
    biomeId: biome.id || 'keller',
    boss,
  };

  // --- Außenmauer ---
  const hw = w / 2, hh = h / 2;
  arena.walls.push({ x: 0, y: -hh - WALL_T / 2, w: w + WALL_T * 2, h: WALL_T, outer: true });
  arena.walls.push({ x: 0, y: hh + WALL_T / 2, w: w + WALL_T * 2, h: WALL_T, outer: true });
  arena.walls.push({ x: -hw - WALL_T / 2, y: 0, w: WALL_T, h: h + WALL_T * 2, outer: true });
  arena.walls.push({ x: hw + WALL_T / 2, y: 0, w: WALL_T, h: h + WALL_T * 2, outer: true });

  // --- Innenform ---
  const block = (x, y, bw, bh) => arena.walls.push({ x, y, w: bw, h: bh });

  if (shape === 'cross') {
    // Vier Ecken zumauern -> Kreuzform mit vier Gängen
    const cw = w * rng.range(0.26, 0.33), ch = h * rng.range(0.26, 0.33);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      block(sx * (hw - cw / 2), sy * (hh - ch / 2), cw, ch);
    }
  } else if (shape === 'corners') {
    const cw = w * rng.range(0.16, 0.22);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      block(sx * (hw - cw / 2), sy * (hh - cw / 2), cw, cw);
    }
  } else if (shape === 'round') {
    // Runde Arena durch gestufte Ecken
    const steps = 5;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      for (let i = 0; i < steps; i++) {
        const f = (i + 1) / (steps + 1);
        const bw = w * 0.42 * (1 - f);
        const bh = h * 0.42 * f;
        if (bw < 20 || bh < 20) continue;
        block(sx * (hw - bw / 2), sy * (hh - bh / 2), bw, bh);
      }
    }
  } else if (shape === 'pillars') {
    const cols = rng.int(2, 3), rows = rng.int(2, 3);
    const pw = w * 0.1, ph = h * 0.1;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = -w * 0.28 + (cols > 1 ? (cx / (cols - 1)) * w * 0.56 : 0);
      const y = -h * 0.28 + (rows > 1 ? (cy / (rows - 1)) * h * 0.56 : 0);
      block(x, y, pw, ph);
    }
  } else if (shape === 'lane') {
    // Zwei lange Riegel -> drei Bahnen
    const bw = w * 0.5, bh = h * 0.07;
    block(rng.range(-w * 0.1, w * 0.1), -h * 0.22, bw, bh);
    block(rng.range(-w * 0.1, w * 0.1), h * 0.22, bw, bh);
  }

  // Der Spieler startet immer in der Mitte — dort darf keine Wand stehen.
  // Bei der Säulen-Form landet sonst ein Block genau auf dem Startpunkt.
  const SPAWN_CLEAR = 90;
  arena.walls = arena.walls.filter((wl) => {
    if (wl.outer) return true;
    return !circleRect(0, 0, SPAWN_CLEAR, wl.x, wl.y, wl.w, wl.h);
  });

  // --- Gefahren ---
  const hazardTypes = biome.hazards || [];
  if (hazardTypes.length && !boss) {
    const n = rng.int(1, 2 + Math.min(3, Math.floor(wave / 6)));
    for (let i = 0; i < n; i++) {
      const type = rng.pick(hazardTypes);
      const r = rng.range(60, 130);
      const p = findOpenSpot(arena, rng, r + 20, 200);
      if (p) arena.hazards.push({ x: p.x, y: p.y, r, type, pulse: rng.angle() });
    }
  } else if (hazardTypes.length && boss) {
    // Boss-Arena: Ring aus Gefahren am Rand, Mitte bleibt frei
    const type = rng.pick(hazardTypes);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.2, 0.2);
      arena.hazards.push({
        x: Math.cos(a) * hw * 0.74, y: Math.sin(a) * hh * 0.74,
        r: rng.range(80, 120), type, pulse: rng.angle(),
      });
    }
  }

  // --- Requisiten ---
  const propIds = biome.props || ['kiste'];
  const propCount = boss ? rng.int(4, 7) : rng.int(7, 14);
  for (let i = 0; i < propCount; i++) {
    const id = rng.pick(propIds);
    const r = id === 'saeule' ? 26 : id === 'fackel' ? 10 : 22;
    const p = findOpenSpot(arena, rng, r + 26, 150);
    if (!p) continue;
    arena.props.push({
      x: p.x, y: p.y, id, r,
      solid: SOLID_PROPS.has(id),
      hp: DESTRUCTIBLE.has(id) ? 1 : 0,
      scale: rng.range(0.88, 1.14),
      flip: rng.chance(0.5),
      broken: false,
    });
    if (id === 'fackel') arena.torches.push({ x: p.x, y: p.y - 24, flicker: rng.angle() });
  }

  // Zusätzliche Fackeln an den Wänden — die Beleuchtung macht die Stimmung.
  const torchCount = boss ? 8 : 6;
  for (let i = 0; i < torchCount; i++) {
    const a = (i / torchCount) * TAU + 0.3;
    arena.torches.push({
      x: Math.cos(a) * hw * 0.88,
      y: Math.sin(a) * hh * 0.88,
      flicker: rng.angle(),
    });
  }

  // --- Truhen ---
  const chestCount = boss ? 1 : rng.chance(0.45) ? 1 : 0;
  for (let i = 0; i < chestCount; i++) {
    const p = findOpenSpot(arena, rng, 40, 260);
    if (p) arena.chests.push({ x: p.x, y: p.y, opened: false, glow: 0 });
  }

  arena.spawnRadius = Math.min(hw, hh) * 0.86;
  return arena;
}

/** Sucht einen freien Platz, der nicht zu nah an der Mitte liegt. */
function findOpenSpot(arena, rng, clearance, minFromCenter) {
  for (let tries = 0; tries < 40; tries++) {
    const x = rng.range(-arena.halfW * 0.86, arena.halfW * 0.86);
    const y = rng.range(-arena.halfH * 0.86, arena.halfH * 0.86);
    if (x * x + y * y < minFromCenter * minFromCenter) continue;
    if (blockedAt(arena, x, y, clearance)) continue;
    return { x, y };
  }
  return null;
}

export function blockedAt(arena, x, y, r) {
  for (const w of arena.walls) {
    if (circleRect(x, y, r, w.x, w.y, w.w, w.h)) return true;
  }
  for (const p of arena.props) {
    if (!p.solid || p.broken) continue;
    const rr = r + p.r;
    if (dist2(x, y, p.x, p.y) < rr * rr) return true;
  }
  return false;
}

/**
 * Schiebt einen Kreis aus allen Hindernissen. Mehrere Durchgänge, weil ein
 * Körper in einer Ecke gleichzeitig zwei Wände berührt.
 */
export function collideCircle(arena, ent, radius, ignoreProps = false) {
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const w of arena.walls) {
      resolveCircleRect(ent.x, ent.y, radius, w.x, w.y, w.w, w.h, out);
      if (out.hit) { ent.x = out.x; ent.y = out.y; moved = true; }
    }
    if (!ignoreProps) {
      for (const p of arena.props) {
        if (!p.solid || p.broken) continue;
        const rr = radius + p.r;
        const dx = ent.x - p.x, dy = ent.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          ent.x = p.x + (dx / d) * rr;
          ent.y = p.y + (dy / d) * rr;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  // Harte Grenze, falls doch mal etwas durchrutscht
  ent.x = clamp(ent.x, -arena.halfW + radius, arena.halfW - radius);
  ent.y = clamp(ent.y, -arena.halfH + radius, arena.halfH - radius);
}

/** Trifft eine Linie eine Wand? Grob, aber ausreichend für Projektile. */
export function lineBlocked(arena, x1, y1, x2, y2, steps = 6) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
    for (const w of arena.walls) {
      if (circleRect(x, y, 2, w.x, w.y, w.w, w.h)) return true;
    }
  }
  return false;
}

/** Spawn-Position am Rand, möglichst weit weg vom Spieler. */
export function pickSpawnPoint(arena, rng, px, py, minDist = 420) {
  let best = null, bestD = -1;
  for (let tries = 0; tries < 24; tries++) {
    const a = rng.angle();
    const rr = arena.spawnRadius * rng.range(0.78, 1.0);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * (arena.halfH / arena.halfW);
    if (blockedAt(arena, x, y, 24)) continue;
    const d = dist2(x, y, px, py);
    if (d > minDist * minDist) return { x, y };
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best || { x: arena.halfW * 0.8, y: 0 };
}

export function hazardAt(arena, x, y, r = 0) {
  for (const h of arena.hazards) {
    const rr = h.r + r;
    if (dist2(x, y, h.x, h.y) < rr * rr) return h;
  }
  return null;
}

// --- Zeichnen ----------------------------------------------------------

export function drawFloor(g, arena, view) {
  const pal = arena.pal;
  const tile = floorTile(arena.biomeId, pal, TILE, arena.floorVariant);

  // Nur die sichtbaren Kacheln zeichnen.
  const x0 = Math.floor((view.left + arena.halfW) / TILE) - 1;
  const x1 = Math.ceil((view.right + arena.halfW) / TILE) + 1;
  const y0 = Math.floor((view.top + arena.halfH) / TILE) - 1;
  const y1 = Math.ceil((view.bottom + arena.halfH) / TILE) + 1;

  const maxX = Math.ceil(arena.w / TILE), maxY = Math.ceil(arena.h / TILE);
  for (let ty = Math.max(0, y0); ty < Math.min(maxY, y1); ty++) {
    for (let tx = Math.max(0, x0); tx < Math.min(maxX, x1); tx++) {
      g.drawImage(tile, tx * TILE - arena.halfW, ty * TILE - arena.halfH, TILE, TILE);
    }
  }

  // Dunkler Rand nach außen, damit die Arena begrenzt wirkt
  g.fillStyle = alpha(pal.fog, 0.9);
  const m = 2000;
  g.fillRect(-arena.halfW - m, -arena.halfH - m, arena.w + m * 2, m);
  g.fillRect(-arena.halfW - m, arena.halfH, arena.w + m * 2, m);
  g.fillRect(-arena.halfW - m, -arena.halfH, m, arena.h);
  g.fillRect(arena.halfW, -arena.halfH, m, arena.h);
}

export function drawHazards(g, arena, t) {
  for (const h of arena.hazards) {
    const def = HAZARDS[h.type];
    if (!def) continue;
    const pulse = 0.82 + Math.sin(t * 2.2 + h.pulse) * 0.18;

    g.save();
    g.globalCompositeOperation = 'lighter';
    const glow = glowSprite(def.glow, 256);
    const gr = h.r * 1.75 * pulse;
    g.globalAlpha = 0.4;
    g.drawImage(glow, h.x - gr, h.y - gr * 0.65, gr * 2, gr * 1.3);
    g.restore();

    g.save();
    g.translate(h.x, h.y);
    g.scale(1, 0.68);
    g.beginPath();
    g.arc(0, 0, h.r, 0, TAU);
    const grd = g.createRadialGradient(0, 0, h.r * 0.1, 0, 0, h.r);
    grd.addColorStop(0, alpha(def.glow, 0.95));
    grd.addColorStop(0.6, alpha(def.color, 0.85));
    grd.addColorStop(1, alpha(shade(def.color, -0.4), 0.7));
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = alpha(shade(def.color, -0.5), 0.85);
    g.lineWidth = 5;
    g.stroke();

    // Blubbernde Oberfläche
    for (let i = 0; i < 5; i++) {
      const a = h.pulse + i * 1.7 + t * 0.8;
      const d = h.r * (0.25 + ((i * 0.17 + t * 0.21) % 0.6));
      const br = h.r * 0.1 * (0.6 + Math.sin(t * 3 + i) * 0.4);
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(1, br), 0, TAU);
      g.fillStyle = alpha(def.glow, 0.5);
      g.fill();
    }
    g.restore();
  }
}

export function drawWalls(g, arena, view) {
  const pal = arena.pal;
  for (const w of arena.walls) {
    // Grobe Sichtbarkeitsprüfung
    if (w.x + w.w / 2 < view.left - 200 || w.x - w.w / 2 > view.right + 200) continue;
    if (w.y + w.h / 2 < view.top - 300 || w.y - w.h / 2 > view.bottom + 200) continue;

    const img = wallTile(arena.biomeId, pal, 96, 120);
    const lift = 34;      // Höhe, die die Wand "nach oben" ragt
    const x0 = w.x - w.w / 2, y0 = w.y - w.h / 2 - lift;
    const tw = 96 * 0.75;
    const cols = Math.max(1, Math.ceil(w.w / tw));
    const cw = w.w / cols;

    // Schatten am Fuß
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x0, w.y + w.h / 2 - 6, w.w, 16);

    for (let i = 0; i < cols; i++) {
      g.drawImage(img, x0 + i * cw, y0, cw + 1, w.h + lift);
    }
  }
}

export function drawProps(g, arena, t) {
  // Nach y sortieren, damit vorne liegende Objekte hinten liegende überdecken.
  for (const p of arena.props) {
    if (p.broken) continue;
    const img = propSprite(p.id, 72);
    const sw = img.width * p.scale, sh = img.height * p.scale;
    g.save();
    if (p.flip) { g.translate(p.x, 0); g.scale(-1, 1); g.translate(-p.x, 0); }
    g.drawImage(img, p.x - sw / 2, p.y - sh * 0.78, sw, sh);
    g.restore();
  }
}

export function drawTorchLights(g, arena, t) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const img = glowSprite(arena.pal.light, 256);
  for (const tr of arena.torches) {
    const f = 0.84 + Math.sin(t * 7 + tr.flicker) * 0.08 + Math.sin(t * 13.3 + tr.flicker) * 0.05;
    const r = 170 * f;
    // Nur die warme Färbung — die eigentliche Helligkeit macht die
    // Dunkelheits-Maske, sonst wäscht beides zusammen alles aus.
    g.globalAlpha = 0.26 * f;
    g.drawImage(img, tr.x - r, tr.y - r, r * 2, r * 2);
  }
  g.restore();
}

export function drawChests(g, arena, t) {
  for (const c of arena.chests) {
    const img = chestSprite(c.opened, 80);
    const bob = c.opened ? 0 : Math.sin(t * 2.4) * 2;
    if (!c.opened) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const glow = glowSprite('#ffd93d', 256);
      const r = 90 + Math.sin(t * 3) * 10;
      g.globalAlpha = 0.35;
      g.drawImage(glow, c.x - r, c.y - r, r * 2, r * 2);
      g.restore();
    }
    g.drawImage(img, c.x - 40, c.y - 56 + bob, 80, 80);
  }
}

export const arenaTileSize = TILE;
