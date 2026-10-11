// Beute: Rüstung mit Verzauberungs-Fassungen, Drops, Aufsammeln, Truhen.

import { TAU, clamp, dist2, angleTo } from '../core/math.js';
import { vfxRng } from '../core/rng.js';
import { burst, ring, notice, damageText, trail, addFlash, addShake } from '../core/fx.js';
import { sfx, buzz } from '../core/audio.js';
import { TIER_COLORS, TIER_NAMES, WEAPON_LIST, weaponsOfTier } from '../data/weapons.js';
import { WEAPON_ENCHANTS, ARMOR_ENCHANTS, ENCHANTS } from '../data/enchants.js';
import { ARTIFACT_LIST } from '../data/artifacts.js';
import { ITEM_LIST, itemsOfTier } from '../data/items.js';
import {
  G, nextUid, gainXp, gainKnollen, recomputeStats, addArtifact, artifactSlotCount,
} from './state.js';
import { collideCircle } from './dungeon.js';

// --- Rüstung ----------------------------------------------------------

const ARMOR_BASES = [
  { id: 'schale', name: 'Kartoffelschale', color: '#c98f4e', armor: 5, hp: 8 },
  { id: 'kittel', name: 'Küchenkittel', color: '#dfe6ec', armor: 3, hp: 14 },
  { id: 'rinde', name: 'Rindenharnisch', color: '#8a5a2a', armor: 8, hp: 6 },
  { id: 'chitin', name: 'Chitinpanzer', color: '#6b5a8a', armor: 7, hp: 10 },
  { id: 'blech', name: 'Ofenblech', color: '#8a949e', armor: 12, hp: 4 },
  { id: 'frost', name: 'Frostmantel', color: '#8fc4d8', armor: 6, hp: 12 },
  { id: 'kraut', name: 'Krautgeflecht', color: '#6cbf4a', armor: 4, hp: 16 },
  { id: 'gold', name: 'Goldharnisch', color: '#f0c93a', armor: 10, hp: 10 },
];

const ARMOR_PREFIX = [
  '', '', '', 'Robuste', 'Leichte', 'Geflickte', 'Verstärkte', 'Alte',
  'Gegerbte', 'Schwere', 'Gehärtete',
];

/** Einzigartige Rüstungen mit festgelegter Verzauberung. */
const UNIQUE_ARMORS = [
  {
    id: 'u_koenigsschale', name: 'Schale des Königs', base: 'gold', color: '#f0c93a',
    armor: 16, hp: 30, fixed: [{ id: 'leben', level: 2 }],
    flavor: 'Trug er, als der Keller noch ihm gehörte.',
  },
  {
    id: 'u_schattenhaut', name: 'Schattenhaut', base: 'chitin', color: '#5a4a6b',
    armor: 8, hp: 12, fixed: [{ id: 'ausweichen', level: 2 }, { id: 'eile', level: 1 }],
    flavor: 'Man sieht sie erst, wenn es zu spät ist.',
  },
  {
    id: 'u_ofenherz', name: 'Ofenherz', base: 'blech', color: '#e8503a',
    armor: 20, hp: 16, fixed: [{ id: 'stachelhaut', level: 2 }],
    flavor: 'Immer noch warm.',
  },
  {
    id: 'u_lebensgeflecht', name: 'Lebensgeflecht', base: 'kraut', color: '#7bd44f',
    armor: 6, hp: 34, fixed: [{ id: 'regeneration', level: 2 }],
    flavor: 'Wächst nach, solange du atmest.',
  },
  {
    id: 'u_letztehaut', name: 'Die letzte Haut', base: 'schale', color: '#ffd93d',
    armor: 10, hp: 18, fixed: [{ id: 'letzteknolle', level: 1 }],
    flavor: 'Eine Kartoffel gibt nie ganz auf.',
  },
  {
    id: 'u_totemkleid', name: 'Totemkleid', base: 'frost', color: '#b06ef0',
    armor: 9, hp: 20, fixed: [{ id: 'totemgespuer', level: 2 }],
    flavor: 'Die Totems hören besser zu, wenn man es trägt.',
  },
];

/** Erzeugt eine Rüstungs-Instanz. `tier` 0–3. */
export function makeArmor(rng, tier = 0, powerLevel = 1) {
  tier = clamp(tier, 0, 3);

  if (tier === 3 && rng.chance(0.75)) {
    const u = rng.pick(UNIQUE_ARMORS);
    const slots = [];
    for (const f of u.fixed) {
      slots.push({ options: [f.id], chosen: f.id, level: f.level, fixed: true });
    }
    while (slots.length < 3) slots.push(makeSlot(rng, 'armor'));
    return {
      uid: nextUid(), kind: 'armor', tier: 3, unique: true,
      id: u.id, name: u.name, color: u.color, flavor: u.flavor,
      armor: Math.round(u.armor * powerLevel),
      hp: Math.round(u.hp * powerLevel),
      slots,
    };
  }

  const base = rng.pick(ARMOR_BASES);
  const prefix = tier > 0 ? rng.pick(ARMOR_PREFIX) : '';
  const mul = (1 + tier * 0.55) * powerLevel;
  const slotCount = tier === 0 ? 1 : tier === 1 ? 2 : 3;
  const slots = [];
  for (let i = 0; i < slotCount; i++) slots.push(makeSlot(rng, 'armor'));

  return {
    uid: nextUid(), kind: 'armor', tier,
    id: base.id,
    name: (prefix ? prefix + ' ' : '') + base.name,
    color: base.color,
    armor: Math.max(1, Math.round(base.armor * mul)),
    hp: Math.max(0, Math.round(base.hp * mul)),
    slots,
  };
}

/** Eine leere Fassung mit drei Kandidaten. */
export function makeSlot(rng, kind) {
  const pool = kind === 'armor' ? ARMOR_ENCHANTS : WEAPON_ENCHANTS;
  return { options: rng.sample(pool, 3), chosen: null, level: 0 };
}

/** Füllt noch leere Kandidatenlisten — Waffen bekommen sie erst im Lager. */
export function ensureSlotOptions(item, kind) {
  for (const s of item.slots) {
    if (!s.options) s.options = makeSlot(G.rng, kind).options;
  }
  return item;
}

export function armorStatText(a) {
  return [`+${a.armor} Panzerung`, a.hp ? `+${a.hp} LP` : null].filter(Boolean);
}

/** Rüstungswerte in die Spielerwerte einrechnen. */
export function armorBonus() {
  const a = G.armor;
  if (!a) return null;
  return { armor: a.armor, maxHp: a.hp };
}

// --- Drops ------------------------------------------------------------

export function spawnPickup(x, y, kind, value = 1, gear = null) {
  const p = G.pools.pickups.spawn();
  if (!p) return null;
  const a = vfxRng.angle(), s = vfxRng.range(40, 150);
  p.x = x; p.y = y;
  p.vx = Math.cos(a) * s;
  p.vy = Math.sin(a) * s;
  p.z = -vfxRng.range(6, 22);
  p.vz = -vfxRng.range(60, 140);
  p.kind = kind;
  p.value = value;
  p.gear = gear;
  p.r = kind === 'gear' ? 16 : kind === 'heart' ? 13 : 10;
  return p;
}

export function onEnemyKilled(e, weapon) {
  const lootMul = G.difficulty.lootMul;

  // Knollen
  let knollen = e.knollen * (1 + G.stats.harvesting) * lootMul;
  if (weapon) {
    const greed = weapon.slots ? weaponGreed(weapon) : 0;
    if (greed) knollen *= 1 + greed;
  }
  knollen = Math.max(1, Math.round(knollen));
  // In Häufchen aufteilen, damit das Einsammeln sich gut anfühlt
  const stacks = clamp(Math.ceil(knollen / 6), 1, 7);
  const per = Math.max(1, Math.floor(knollen / stacks));
  for (let i = 0; i < stacks; i++) {
    spawnPickup(e.x, e.y, 'knolle', i === stacks - 1 ? knollen - per * (stacks - 1) : per);
  }

  // Erfahrung
  const xpOrbs = clamp(Math.ceil(e.xp / 3), 1, 5);
  const xpPer = e.xp / xpOrbs;
  for (let i = 0; i < xpOrbs; i++) spawnPickup(e.x, e.y, 'xp', xpPer);

  // Heilung — selten, aber rettend
  const healChance = 0.035 + G.stats.luck * 0.03;
  if (vfxRng.chance(healChance)) spawnPickup(e.x, e.y, 'heart', Math.round(G.player.maxHp * 0.12));

  // Ausrüstung
  let gearChance = e.boss ? 1 : e.elite ? 0.22 : 0.012;
  gearChance += G.stats.luck * 0.02;
  if (e.dropsGear) gearChance = Math.max(gearChance, e.dropsGear);
  if (vfxRng.chance(gearChance)) {
    const tier = rollGearTier(e);
    spawnPickup(e.x, e.y, 'gear', 1, makeArmor(G.rng, tier, 1 + G.wave * 0.035));
  }

  // Boss lässt zusätzlich ein Artefakt fallen
  if (e.boss) {
    const pool = ARTIFACT_LIST.filter((a) => !G.artifacts.some((x) => x.def.name === a.name));
    if (pool.length) {
      spawnPickup(e.x + 40, e.y, 'artifact', 1, G.rng.pick(pool));
    }
  }
}

function weaponGreed(weapon) {
  let lvl = 0;
  for (const s of weapon.slots) if (s.chosen === 'gier') lvl += s.level;
  return lvl ? ENCHANTS.gier.val[Math.min(3, lvl) - 1] : 0;
}

function rollGearTier(e) {
  const luck = G.stats.luck;
  const r = vfxRng.next();
  if (e.boss) return r < 0.45 + luck * 0.2 ? 3 : 2;
  if (e.elite) return r < 0.12 + luck * 0.1 ? 2 : r < 0.6 ? 1 : 0;
  return r < 0.08 + luck * 0.08 ? 1 : 0;
}

/** Zerstörbare Requisite — gibt ein paar Knollen. */
export function breakProp(prop) {
  prop.broken = true;
  burst(prop.x, prop.y - 14, 12, { color: '#9a6b3a', speed: 190, life: 0.5, size: 7 });
  sfx('kill', { pitch: 1.4, gain: 0.6 });
  const n = vfxRng.int(1, 3);
  for (let i = 0; i < n; i++) spawnPickup(prop.x, prop.y, 'knolle', vfxRng.int(1, 3));
  if (vfxRng.chance(0.08)) spawnPickup(prop.x, prop.y, 'heart', Math.round(G.player.maxHp * 0.08));
}

// --- Truhen -----------------------------------------------------------

export function openChest(chest) {
  if (chest.opened) return;
  chest.opened = true;
  sfx('chest');
  addFlash('#ffd93d', 0.18, 5);
  addShake(5);
  ring(chest.x, chest.y, 10, 150, { color: '#ffd93d', life: 0.6, width: 7 });

  const roll = vfxRng.next() + G.stats.luck * 0.15;
  if (roll < 0.42) {
    const tier = vfxRng.chance(0.25 + G.stats.luck * 0.1) ? 2 : 1;
    spawnPickup(chest.x, chest.y - 10, 'gear', 1, makeArmor(G.rng, tier, 1 + G.wave * 0.035));
  } else if (roll < 0.62 && G.artifacts.length < artifactSlotCount()) {
    const pool = ARTIFACT_LIST.filter((a) => !G.artifacts.some((x) => x.def.name === a.name));
    if (pool.length) spawnPickup(chest.x, chest.y - 10, 'artifact', 1, G.rng.pick(pool));
    else spawnPickup(chest.x, chest.y, 'knolle', 60);
  } else if (roll < 0.78) {
    const n = vfxRng.int(8, 16);
    for (let i = 0; i < n; i++) spawnPickup(chest.x, chest.y, 'knolle', vfxRng.int(4, 12));
  } else if (roll < 0.9) {
    spawnPickup(chest.x, chest.y, 'heart', Math.round(G.player.maxHp * 0.3));
    for (let i = 0; i < 5; i++) spawnPickup(chest.x, chest.y, 'knolle', vfxRng.int(3, 7));
  } else {
    // Sofort-Gegenstand
    const tier = vfxRng.chance(0.2) ? 2 : 1;
    const item = vfxRng.pick(itemsOfTier(tier));
    spawnPickup(chest.x, chest.y - 10, 'item', 1, item);
  }
}

// --- Aufsammeln -------------------------------------------------------

export function updatePickups(dt) {
  const pool = G.pools.pickups;
  const p = G.player;
  const magnetR = 86 * (1 + G.stats.pickupRange);
  const grabR = 26 + p.r;

  for (let i = pool.count - 1; i >= 0; i--) {
    const it = pool.items[i];
    it.spawnT = Math.max(0, it.spawnT - dt);
    it.life -= dt;
    it.bob += dt * 4;

    // Hüpfen bis zum Boden
    if (it.z < 0) {
      it.vz += 520 * dt;
      it.z += it.vz * dt;
      if (it.z >= 0) { it.z = 0; it.vz *= -0.4; if (Math.abs(it.vz) < 25) it.vz = 0; }
    }

    const d2 = dist2(it.x, it.y, p.x, p.y);

    // Magnetwirkung
    if (it.magnet || d2 < magnetR * magnetR) {
      it.magnet = true;
      const a = angleTo(it.x, it.y, p.x, p.y);
      const pull = 420 + (1 - clamp(Math.sqrt(d2) / magnetR, 0, 1)) * 520;
      it.vx += Math.cos(a) * pull * dt;
      it.vy += Math.sin(a) * pull * dt;
    } else {
      it.vx *= Math.exp(-5 * dt);
      it.vy *= Math.exp(-5 * dt);
    }

    it.x += it.vx * dt;
    it.y += it.vy * dt;
    if (G.arena) collideCircle(G.arena, it, it.r * 0.5, true);

    if (it.kind === 'gear' || it.kind === 'artifact' || it.kind === 'item') {
      if (vfxRng.chance(dt * 9)) {
        trail(it.x + vfxRng.range(-8, 8), it.y + it.z - 8, gearColor(it), 5, 0.4);
      }
    }

    // Einsammeln
    if (it.spawnT <= 0 && d2 < grabR * grabR) {
      collect(it);
      pool.release(i);
      continue;
    }
    if (it.life <= 0) pool.release(i);
  }
}

function gearColor(it) {
  if (it.kind === 'gear') return it.gear ? it.gear.color : '#c98f4e';
  if (it.kind === 'artifact') return it.gear ? it.gear.color : '#b06ef0';
  if (it.kind === 'item') return TIER_COLORS[it.gear ? it.gear.tier : 0];
  return '#ffd27a';
}

function collect(it) {
  const p = G.player;
  switch (it.kind) {
    case 'knolle':
      gainKnollen(it.value);
      sfx('coin', { pitch: 0.95 + vfxRng.next() * 0.25 });
      break;
    case 'xp': {
      const lv = G.level;
      gainXp(it.value);
      sfx('xp', { pitch: 1 + vfxRng.next() * 0.2, gain: 0.5 });
      if (G.level > lv) {
        notice(p.x, p.y - 60, `Stufe ${G.level}!`, '#ffd93d', 24);
        ring(p.x, p.y, 10, 160, { color: '#ffd93d', life: 0.6, width: 7 });
        burst(p.x, p.y, 24, { color: '#ffd93d', speed: 260, life: 0.7 });
        sfx('levelup');
        addFlash('#ffd93d', 0.12, 5);
      }
      break;
    }
    case 'heart': {
      const healed = Math.min(p.maxHp - p.hp, it.value);
      p.hp += healed;
      damageText(p.x, p.y - 44, `+${Math.round(healed)}`, { color: '#7bd44f', force: true, size: 19 });
      ring(p.x, p.y, 8, 70, { color: '#7bd44f', life: 0.4 });
      sfx('heal');
      break;
    }
    case 'gear':
      // Ins Lager legen; Vergleich passiert dort.
      G.pendingGear = G.pendingGear || [];
      G.pendingGear.push(it.gear);
      notice(p.x, p.y - 56, `${it.gear.name}`, TIER_COLORS[it.gear.tier], 17);
      sfx(it.gear.tier >= 3 ? 'legendary' : 'loot');
      buzz(28);
      break;
    case 'artifact':
      if (G.artifacts.length < artifactSlotCount()) {
        addArtifact(it.gear);
        notice(p.x, p.y - 56, `${it.gear.name}`, it.gear.color, 17);
        sfx('legendary');
      } else {
        G.pendingArtifacts = G.pendingArtifacts || [];
        G.pendingArtifacts.push(it.gear);
        notice(p.x, p.y - 56, 'Artefakt — Plätze voll', '#ffd93d', 15);
        sfx('loot');
      }
      buzz(28);
      break;
    case 'item':
      G.pendingItems = G.pendingItems || [];
      G.pendingItems.push(it.gear);
      notice(p.x, p.y - 56, it.gear.name, TIER_COLORS[it.gear.tier], 17);
      sfx('loot');
      break;
    default:
      break;
  }
}

/** Alle liegengebliebenen Knollen am Wellenende einsammeln (Brotato-Regel). */
export function vacuumPickups() {
  const pool = G.pools.pickups;
  let collected = 0;
  for (let i = pool.count - 1; i >= 0; i--) {
    collect(pool.items[i]);
    collected++;
    pool.release(i);
  }
  return collected;
}

// --- Shop-Angebote ----------------------------------------------------

/**
 * Baut die Auslage fürs Lager. Je höher Welle und Glück, desto bessere
 * Stufen. Jede Karte ist entweder Waffe, Gegenstand oder Artefakt.
 */
export function rollShop(rng, slots = 4) {
  const wave = G.wave;
  const luck = G.stats.luck;
  const offers = [];
  const usedWeapons = new Set();

  for (let i = 0; i < slots; i++) {
    const tier = rollTier(rng, wave, luck);
    const kindRoll = rng.next();
    let kind;
    if (kindRoll < 0.42) kind = 'weapon';
    else if (kindRoll < 0.9) kind = 'item';
    else kind = 'artifact';

    if (kind === 'artifact' && G.artifacts.length >= artifactSlotCount()) kind = 'item';

    if (kind === 'weapon') {
      const pool = weaponsOfTier(tier).filter((w) => !usedWeapons.has(w.id));
      const def = pool.length ? rng.pick(pool) : rng.pick(WEAPON_LIST);
      usedWeapons.add(def.id);
      offers.push({ kind: 'weapon', def, price: priceWith(def.price, wave), locked: false, sold: false });
    } else if (kind === 'item') {
      const pool = itemsOfTier(tier);
      const def = rng.pick(pool.length ? pool : ITEM_LIST);
      offers.push({ kind: 'item', def, price: priceWith(def.price, wave), locked: false, sold: false });
    } else {
      const owned = new Set(G.artifacts.map((a) => a.def.name));
      const pool = ARTIFACT_LIST.filter((a) => !owned.has(a.name));
      if (!pool.length) {
        const def = rng.pick(ITEM_LIST);
        offers.push({ kind: 'item', def, price: priceWith(def.price, wave), locked: false, sold: false });
      } else {
        const def = rng.pick(pool);
        offers.push({ kind: 'artifact', def, price: priceWith(def.price, wave), locked: false, sold: false });
      }
    }
  }
  return offers;
}

function rollTier(rng, wave, luck) {
  // Gewichte wandern mit der Welle nach oben.
  const w = [
    Math.max(2, 100 - wave * 6),
    Math.max(4, 12 + wave * 4),
    Math.max(0, -14 + wave * 3.2 + luck * 18),
    Math.max(0, -34 + wave * 1.9 + luck * 22),
  ];
  const total = w[0] + w[1] + w[2] + w[3];
  let r = rng.next() * total;
  for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

/** Preise steigen mit der Welle, sonst wird der Shop ab Welle 10 belanglos. */
export const priceWith = (base, wave) => Math.round(base * (1 + wave * 0.09));

export const rerollCost = (times) => Math.round(6 + times * times * 2.2 + G.wave * 1.3);
