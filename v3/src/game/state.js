// Zustand eines Laufs und die Werte-Berechnung.
//
// Alle Spielerwerte werden an *einer* Stelle aus Basis + Figur + Gegenstände
// + Waffenklassen + Verzauberungen + Buffs zusammengerechnet. Nichts im
// Spiel schreibt direkt in `G.stats` — sonst findet man Balance-Fehler nie.

import { clamp } from '../core/math.js';
import { makeRng, newSeed } from '../core/rng.js';
import { BASE_STATS, BASE_SPEED, BASE_WEAPON_SLOTS, BASE_ARTIFACT_SLOTS, CHARACTERS, ENCH_POINT_EVERY } from '../data/characters.js';
import { BIOMES, DIFFICULTIES } from '../data/biomes.js';
import { CLASSES, WEAPONS } from '../data/weapons.js';
import { collectEnchants, enchantStats, enchValue } from '../data/enchants.js';
import { ITEMS } from '../data/items.js';
import { createEntityPools } from './entities.js';

export const PHASE = {
  MENU: 'menu',
  PLAYING: 'playing',
  CAMP: 'camp',
  LEVELUP: 'levelup',
  DEAD: 'dead',
  WIN: 'win',
};

export const G = {
  phase: PHASE.MENU,
  paused: false,

  seed: 0,
  rng: makeRng(1),
  biomeId: 'keller',
  biome: BIOMES.keller,
  difficulty: DIFFICULTIES[0],
  charId: 'knolle',
  character: CHARACTERS.knolle,

  wave: 0,
  waveTime: 0,
  waveDuration: 0,
  waveActive: false,
  waveClearing: false,
  spawnBudget: 0,
  spawnTimer: 0,
  spawnGroups: [],
  bossRef: null,
  runTime: 0,

  // Fortschritt im Lauf
  knollen: 0,
  knollenEarned: 0,
  level: 1,
  xp: 0,
  xpNext: 10,
  enchPoints: 0,
  kills: 0,
  damageDealt: 0,
  damageTaken: 0,
  waveDamageTaken: 0,
  flawlessWaves: 0,
  pendingLevels: 0,

  // Ausrüstung
  weapons: [],          // Instanzen: {uid, def, cd, slots:[], ...}
  items: [],            // {def, count}
  artifacts: [],        // {def, cd, uid}
  armor: null,          // Gear-Instanz oder null
  levelStats: Object.create(null),
  levelCardsTaken: [],

  player: null,
  stats: { ...BASE_STATS },
  classCounts: Object.create(null),
  classSteps: [],
  enchMap: Object.create(null),

  arena: null,
  camera: { x: 0, y: 0, w: 800, h: 600, zoom: 1, shakeX: 0, shakeY: 0 },
  pools: createEntityPools(),

  // Zähler für eindeutige IDs
  uid: 1,
};

export const nextUid = () => G.uid++;

export function makePlayer() {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    facing: 0, aimAngle: 0,
    r: 17,
    hp: 70, maxHp: 70,
    invuln: 0,
    rolling: 0, rollCd: 0, rollDirX: 1, rollDirY: 0,
    hitFlash: 0,
    regenAcc: 0,
    strikeCounter: 0,
    ambush: false,            // Schattenknolle: nächster Treffer garantiert kritisch
    revivesLeft: 0,
    lastHitT: 0,
    walkT: 0,
    buffs: Object.create(null),   // name -> {t, v}
    killsSinceGrow: 0,
    dead: false,
  };
}

// --- Lauf starten ------------------------------------------------------

export function startRun({ biomeId, charId, difficulty = 0, seed = null }) {
  G.seed = seed == null ? newSeed() : seed >>> 0;
  G.rng = makeRng(G.seed);
  G.biomeId = biomeId;
  G.biome = BIOMES[biomeId] || BIOMES.keller;
  G.difficulty = DIFFICULTIES[clamp(difficulty, 0, DIFFICULTIES.length - 1)];
  G.charId = charId;
  G.character = CHARACTERS[charId] || CHARACTERS.knolle;

  G.wave = 0;
  G.waveTime = 0;
  G.waveActive = false;
  G.waveClearing = false;
  G.runTime = 0;
  G.bossRef = null;

  G.knollen = 0;
  G.knollenEarned = 0;
  G.level = 1;
  G.xp = 0;
  G.xpNext = xpForLevel(1);
  G.enchPoints = 2;            // Startpunkte, damit man gleich verzaubern kann
  G.kills = 0;
  G.damageDealt = 0;
  G.damageTaken = 0;
  G.waveDamageTaken = 0;
  G.flawlessWaves = 0;
  G.pendingLevels = 0;

  G.weapons = [];
  G.items = [];
  G.artifacts = [];
  G.armor = null;
  G.levelStats = Object.create(null);
  G.levelCardsTaken = [];
  G.uid = 1;

  G.player = makePlayer();

  // Startwaffe
  const startWeapon = WEAPONS[G.character.weapon] || WEAPONS.messer_1;
  addWeapon(startWeapon);

  recomputeStats();
  G.player.hp = G.player.maxHp = G.stats.maxHp;
  G.player.revivesLeft = G.stats.revives;

  G.phase = PHASE.PLAYING;
  return G;
}

export const xpForLevel = (lvl) => Math.round(8 + lvl * 4 + lvl * lvl * 0.9);

// --- Ausrüstung --------------------------------------------------------

/** Erzeugt eine Waffen-Instanz mit eigenen Verzauberungs-Fassungen. */
export function makeWeaponInstance(def, slotCount = null) {
  const n = slotCount != null ? slotCount : 1 + Math.min(2, def.tier);
  const slots = [];
  for (let i = 0; i < n; i++) slots.push({ options: null, chosen: null, level: 0 });
  return {
    uid: nextUid(),
    def,
    slots,
    cd: 0,
    heat: 0,          // für Dauerfeuer-Waffen
    anim: 0,
    animDir: 1,
    shots: 0,
    kills: 0,
    damage: 0,
    orbiterRefs: [],
    activeCount: 0,
  };
}

export function addWeapon(def) {
  if (G.weapons.length >= weaponSlotCount()) return null;
  const inst = makeWeaponInstance(def);
  G.weapons.push(inst);
  recomputeStats();
  return inst;
}

export function removeWeapon(uid) {
  const i = G.weapons.findIndex((w) => w.uid === uid);
  if (i < 0) return null;
  const [w] = G.weapons.splice(i, 1);
  recomputeStats();
  return w;
}

/**
 * Zwei gleiche Waffen zur nächsten Stufe verschmelzen. Die Verzauberungen
 * der *besseren* Waffe werden übernommen, die andere verfällt — sonst wäre
 * Verschmelzen immer gratis besser als behalten.
 */
export function mergeWeapons(uidA, uidB, upgradeDef) {
  const a = G.weapons.find((w) => w.uid === uidA);
  const b = G.weapons.find((w) => w.uid === uidB);
  if (!a || !b || !upgradeDef) return null;
  const keep = enchantedCount(a) >= enchantedCount(b) ? a : b;
  const drop = keep === a ? b : a;

  const inst = makeWeaponInstance(upgradeDef);
  // Gewählte Verzauberungen übertragen, soweit Fassungen vorhanden sind.
  for (let i = 0; i < Math.min(inst.slots.length, keep.slots.length); i++) {
    inst.slots[i] = { ...keep.slots[i] };
  }
  const ia = G.weapons.indexOf(a);
  G.weapons.splice(ia, 1, inst);
  G.weapons.splice(G.weapons.indexOf(drop), 1);
  recomputeStats();
  return inst;
}

const enchantedCount = (w) => w.slots.reduce((n, s) => n + (s.chosen ? s.level : 0), 0);

export function addItem(def) {
  const existing = G.items.find((i) => i.def.id === def.id);
  if (existing) existing.count++;
  else G.items.push({ def, count: 1 });
  recomputeStats();
  if (def.stats && def.stats.revives) G.player.revivesLeft += def.stats.revives;
}

export function addArtifact(def) {
  if (G.artifacts.length >= artifactSlotCount()) return null;
  const inst = { uid: nextUid(), def, cd: 0, uses: 0 };
  G.artifacts.push(inst);
  return inst;
}

export function removeArtifact(uid) {
  const i = G.artifacts.findIndex((a) => a.uid === uid);
  if (i < 0) return null;
  return G.artifacts.splice(i, 1)[0];
}

export function equipArmor(gear) {
  const old = G.armor;
  G.armor = gear;
  recomputeStats();
  // Lebenspunkte mitziehen, damit ein LP-Bonus nicht ins Leere läuft.
  G.player.hp = clamp(G.player.hp, 1, G.player.maxHp);
  return old;
}

export const weaponSlotCount = () => BASE_WEAPON_SLOTS + (G.stats.weaponSlots | 0);
export const artifactSlotCount = () => Math.min(4, BASE_ARTIFACT_SLOTS + (G.stats.artifactSlots | 0));

// --- Werte-Berechnung --------------------------------------------------

function addStats(target, src, mul = 1) {
  if (!src) return;
  for (const k in src) target[k] = (target[k] || 0) + src[k] * mul;
}

export function recomputeStats() {
  const s = { ...BASE_STATS };

  // 1. Figur
  addStats(s, G.character.stats);

  // 2. Gegenstände und die beim Aufstieg gewählten Karten
  for (const it of G.items) addStats(s, it.def.stats, it.count);
  addStats(s, G.levelStats);

  // 3. Waffenklassen-Boni
  const counts = Object.create(null);
  const allClasses = G.character.trait === 'allesklasse';
  for (const w of G.weapons) {
    if (allClasses) {
      for (const c in CLASSES) counts[c] = (counts[c] || 0) + 1;
    } else {
      counts[w.def.cls] = (counts[w.def.cls] || 0) + 1;
    }
  }
  const steps = [];
  for (const cls in counts) {
    const def = CLASSES[cls];
    if (!def) continue;
    let active = null;
    for (const step of def.steps) if (counts[cls] >= step.at) active = step;
    if (active) {
      addStats(s, active.stats);
      steps.push({ cls, count: counts[cls], step: active });
    } else {
      steps.push({ cls, count: counts[cls], step: null });
    }
  }
  G.classCounts = counts;
  G.classSteps = steps;

  // 4. Rüstung: Grundwerte …
  if (G.armor) {
    s.armor += G.armor.armor;
    s.maxHp += G.armor.hp;
  }

  // … und ihre Verzauberungen. Waffen-Verzauberungen wirken nicht auf Werte,
  // sondern im Kampf — deshalb landen hier nur die der Rüstung.
  const enchMap = Object.create(null);
  if (G.armor) collectEnchants([G.armor], enchMap);
  G.enchMap = enchMap;
  addStats(s, enchantStats(enchMap));

  // 5. Technik-Bonus von Waffen
  for (const w of G.weapons) if (w.def.engBonus) s.engineering += w.def.engBonus;

  // 6. Figuren-Eigenheiten mit Wertewirkung
  if (G.character.trait === 'pakt') s.dmgAll += 0.06 * G.weapons.length;

  // 7. Dauerhafte Zuwächse (Süßkartoffel)
  if (G.permanentHp) s.maxHp += G.permanentHp;

  // Grenzen: Ausweichen und Verlangsamungs-Resistenz dürfen nicht 100% werden.
  s.dodge = clamp(s.dodge, 0, 0.6);
  s.crit = clamp(s.crit, 0, 1);
  s.maxHp = Math.max(1, Math.round(s.maxHp));
  s.armor = Math.max(0, s.armor);
  s.speed = Math.max(-0.7, s.speed);
  s.rollCd = clamp(s.rollCd, -0.8, 2);
  s.artifactCd = clamp(s.artifactCd, -0.8, 2);
  s.attackSpeed = Math.max(-0.7, s.attackSpeed);

  G.stats = s;
  if (G.player) {
    G.player.maxHp = s.maxHp;
    if (G.player.hp > s.maxHp) G.player.hp = s.maxHp;
  }
  return s;
}

/** Laufgeschwindigkeit in Pixel/Sekunde, inklusive Buffs. */
export function playerSpeed() {
  const p = G.player;
  let mul = 1 + G.stats.speed;
  if (p.buffs.hast) mul += p.buffs.hast.v;
  if (p.buffs.chill) mul *= 1 - p.buffs.chill.v;
  return BASE_SPEED * Math.max(0.25, mul);
}

/** Gesamter Schadensmultiplikator für eine Schadensart. */
export function damageMul(type) {
  const s = G.stats;
  let m = 1 + s.dmgAll;
  if (type === 'melee') m += s.dmgMelee;
  else if (type === 'ranged') m += s.dmgRanged;
  else if (type === 'elem') m += s.dmgElem;
  const p = G.player;
  if (p && p.buffs.rage) m += p.buffs.rage.v;
  if (p && G.character.trait === 'entschlossen') m += 0;
  return Math.max(0.05, m);
}

export function attackSpeedMul() {
  let m = 1 + G.stats.attackSpeed;
  const p = G.player;
  if (p && p.buffs.frenzy) m += p.buffs.frenzy.v;
  return clamp(m, 0.3, 6);
}

// --- Erfahrung & Stufen ------------------------------------------------

export function gainXp(amount) {
  amount *= 1 + G.stats.xpGain;
  G.xp += amount;
  let leveled = 0;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = xpForLevel(G.level);
    leveled++;
    if (G.level % ENCH_POINT_EVERY === 0) G.enchPoints++;
  }
  if (leveled) G.pendingLevels += leveled;
  return leveled;
}

export function gainKnollen(amount) {
  amount = Math.max(0, amount);
  G.knollen += amount;
  G.knollenEarned += amount;
  return amount;
}

export function spendKnollen(amount) {
  if (G.knollen < amount) return false;
  G.knollen -= amount;
  return true;
}

// --- Buffs -------------------------------------------------------------

export function addBuff(name, duration, value = 1) {
  const b = G.player.buffs[name];
  if (b) { b.t = Math.max(b.t, duration); b.v = Math.max(b.v, value); }
  else G.player.buffs[name] = { t: duration, v: value };
}

export function hasBuff(name) {
  const b = G.player.buffs[name];
  return !!b && b.t > 0;
}

export function tickBuffs(dt) {
  const b = G.player.buffs;
  for (const k in b) {
    b[k].t -= dt;
    if (b[k].t <= 0) delete b[k];
  }
}

// --- Hilfen für UI -----------------------------------------------------

export function runSummary() {
  return {
    biome: G.biome.name,
    biomeId: G.biomeId,
    character: G.character.name,
    charId: G.charId,
    difficulty: G.difficulty.name,
    difficultyId: G.difficulty.id,
    wave: G.wave,
    level: G.level,
    kills: G.kills,
    knollen: Math.round(G.knollenEarned),
    damageDealt: Math.round(G.damageDealt),
    damageTaken: Math.round(G.damageTaken),
    time: G.runTime,
    weapons: G.weapons.map((w) => w.def.name),
    items: G.items.map((i) => `${i.def.name}${i.count > 1 ? ` ×${i.count}` : ''}`),
    seed: G.seed,
    score: scoreOf(),
  };
}

export function scoreOf() {
  const d = 1 + G.difficulty.id * 0.35;
  return Math.round(
    (G.wave * 900 + G.kills * 14 + G.level * 180 + G.knollenEarned * 0.5) * d,
  );
}

/** Eine beim Stufenaufstieg gewählte Karte anwenden. */
export function takeLevelCard(card) {
  for (const k in card.stats) {
    G.levelStats[k] = (G.levelStats[k] || 0) + card.stats[k];
  }
  G.levelCardsTaken.push(card.id);
  recomputeStats();
  // Mehr Maximal-LP sollen sich sofort anfühlen, nicht erst nach Heilung.
  if (card.stats.maxHp > 0) G.player.hp = Math.min(G.player.maxHp, G.player.hp + card.stats.maxHp);
  if (card.stats.revives) G.player.revivesLeft += card.stats.revives;
  return card;
}

/** Aktiver Wert einer Verzauberung auf einer bestimmten Waffe. */
export function weaponEnch(weaponInst, id) {
  if (!weaponInst) return 0;
  let lvl = 0;
  for (const s of weaponInst.slots) {
    if (s.chosen === id) lvl += s.level;
  }
  if (!lvl) return 0;
  return enchValue(id, Math.min(3, lvl));
}

/** Verzauberung aus der Rüstung. */
export const armorEnch = (id) => (G.enchMap[id] ? enchValue(id, G.enchMap[id]) : 0);
