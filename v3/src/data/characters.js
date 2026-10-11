// Spielbare Kartoffeln.
//
// Jede hat Startwerte, eine Startwaffe und eine Eigenheit, die den ganzen
// Lauf prägt. Die Eigenheiten sind absichtlich grob — eine Kartoffel soll
// sich anders *spielen*, nicht nur andere Zahlen haben.

/** Basiswerte, von denen jede Figur abweicht. */
export const BASE_STATS = {
  maxHp: 70,
  hpRegen: 0,
  lifesteal: 0,
  armor: 0,
  dodge: 0,
  speed: 0,              // Prozent auf BASE_SPEED
  dmgAll: 0,
  dmgMelee: 0,
  dmgRanged: 0,
  dmgElem: 0,
  attackSpeed: 0,
  crit: 0.03,
  critDmg: 0.5,
  range: 0,
  luck: 0,
  harvesting: 0,
  pickupRange: 0,
  knockback: 0,
  explosionSize: 0,
  engineering: 0,
  dotDuration: 0,
  rollCd: 0,
  artifactCd: 0,
  xpGain: 0,
  allyDmg: 0,
  thorns: 0,
  revives: 0,
  weaponSlots: 0,
  artifactSlots: 0,
};

/** Pixel pro Sekunde bei 0% Tempo-Bonus. */
export const BASE_SPEED = 196;
export const BASE_WEAPON_SLOTS = 4;
export const BASE_ARTIFACT_SLOTS = 3;

export const CHARACTERS = {
  knolle: {
    name: 'Knolle', skin: 'knolle', icon: '🥔',
    tagline: 'Die ganz normale Kartoffel',
    stats: {},
    weapon: 'messer_1',
    trait: null,
    traitText: 'Keine Eigenheit — dafür keine Schwäche.',
    unlock: null,
  },

  pommes: {
    name: 'Pommes', skin: 'pommes', icon: '🍟',
    tagline: 'Schnell, dünn, nervös',
    stats: { maxHp: -18, speed: 0.26, attackSpeed: 0.12, dodge: 0.06 },
    weapon: 'messer_1',
    trait: 'flink',
    traitText: 'Rollen kostet nur die halbe Abklingzeit und gibt 0,4s länger Unverwundbarkeit.',
    unlock: 'Besiege den Kartoffelkönig',
  },

  suess: {
    name: 'Süßkartoffel', skin: 'suess', icon: '🍠',
    tagline: 'Gemütlich und widerstandsfähig',
    stats: { maxHp: 30, hpRegen: 2, speed: -0.08, dmgAll: -0.05 },
    weapon: 'pfanne_1',
    trait: 'zuwachs',
    traitText: 'Alle 12 Abschüsse +1 maximale Lebenspunkte, dauerhaft.',
    unlock: 'Erreiche Welle 10',
  },

  chips: {
    name: 'Chips', skin: 'chips', icon: '🥫',
    tagline: 'Flach, scharf, zerbrechlich',
    stats: { maxHp: -24, crit: 0.1, critDmg: 0.3, dodge: 0.1 },
    weapon: 'gabel_1',
    trait: 'splitter',
    traitText: 'Kritische Treffer verursachen eine kleine Explosion.',
    unlock: 'Besiege die Große Fritteuse',
  },

  golden: {
    name: 'Goldene Knolle', skin: 'golden', icon: '🥇',
    tagline: 'Reich, aber zimperlich',
    stats: { maxHp: -12, dmgAll: -0.15, harvesting: 0.5, luck: 0.3 },
    weapon: 'schleuder_1',
    trait: 'goldrausch',
    traitText: 'Kritische Treffer lassen Knollen fallen. Jede Welle 10% Zinsen auf dein Guthaben.',
    unlock: 'Sammle 2000 Knollen in einem Lauf',
  },

  schatten: {
    name: 'Schattenknolle', skin: 'schatten', icon: '🌑',
    tagline: 'Schlägt zu, wenn keiner hinsieht',
    stats: { maxHp: -16, crit: 0.14, speed: 0.08, armor: -2 },
    weapon: 'messer_1',
    trait: 'hinterhalt',
    traitText: 'Nach einer Rolle ist der nächste Treffer immer kritisch und macht doppelten Crit-Schaden.',
    unlock: 'Besiege den Schimmelmoloch',
  },

  regenbogen: {
    name: 'Regenbogenknolle', skin: 'regenbogen', icon: '🌈',
    tagline: 'Alles ein bisschen',
    stats: { maxHp: -8, dmgAll: 0.05 },
    weapon: 'chili_1',
    trait: 'allesklasse',
    traitText: 'Jede Waffe zählt für alle Waffenklassen-Boni gleichzeitig.',
    unlock: 'Besiege die Rübenhexe',
  },

  teufel: {
    name: 'Teufelskartoffel', skin: 'teufel', icon: '😈',
    tagline: 'Der Deal: Macht gegen Leben',
    stats: { maxHp: -30, dmgAll: 0.4, lifesteal: 0.05, hpRegen: -1 },
    weapon: 'sense_1',
    trait: 'pakt',
    traitText: 'Pro getragener Waffe +6% Schaden. Nach jeder Welle −2 maximale Lebenspunkte.',
    unlock: 'Besiege den Knollenkoloss',
  },

  frost: {
    name: 'Frostknolle', skin: 'frost', icon: '❄️',
    tagline: 'Langsam, aber alles andere auch',
    stats: { maxHp: 10, speed: -0.1, dmgElem: 0.2 },
    weapon: 'frostbeutel_1',
    trait: 'kaelteaura',
    traitText: 'Dauerhafte Frostaura verlangsamt Gegner im Umkreis um 30%.',
    unlock: 'Beende ein Biom ohne Schaden in einer Welle',
  },

  stahl: {
    name: 'Stahlknolle', skin: 'stahl', icon: '⚙️',
    tagline: 'Baut, statt zu kämpfen',
    stats: { maxHp: 20, armor: 8, speed: -0.12, attackSpeed: -0.1, engineering: 8 },
    weapon: 'turm_1',
    trait: 'werkstatt',
    traitText: 'Türme und Minen halten doppelt so lange und starten mit +50% Schaden.',
    unlock: 'Beende die Chips-Fabrik',
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);
export const CHARACTER_LIST = CHARACTER_IDS.map((id) => ({ id, ...CHARACTERS[id] }));

/**
 * Aufstiegs-Karten. Bei jedem Levelaufstieg werden drei gezogen.
 * `weight` steuert die Häufigkeit, `tier` die Stärke.
 */
export const LEVEL_CARDS = [
  { id: 'hp_s', name: 'Dickere Schale', icon: '🥔', stats: { maxHp: 8 }, weight: 10 },
  { id: 'hp_l', name: 'Viel dickere Schale', icon: '🥔', stats: { maxHp: 20 }, weight: 4, tier: 1 },
  { id: 'dmg_s', name: 'Geschärft', icon: '⚔️', stats: { dmgAll: 0.07 }, weight: 10 },
  { id: 'dmg_l', name: 'Schwer geschärft', icon: '⚔️', stats: { dmgAll: 0.16 }, weight: 4, tier: 1 },
  { id: 'melee', name: 'Zuschlagen', icon: '🗡️', stats: { dmgMelee: 0.14 }, weight: 8 },
  { id: 'ranged', name: 'Abstand halten', icon: '🏹', stats: { dmgRanged: 0.14 }, weight: 8 },
  { id: 'elem', name: 'Entzünden', icon: '🔥', stats: { dmgElem: 0.14 }, weight: 8 },
  { id: 'as', name: 'Schneller Arm', icon: '⚡', stats: { attackSpeed: 0.09 }, weight: 9 },
  { id: 'crit', name: 'Schwachstelle', icon: '🎯', stats: { crit: 0.05 }, weight: 8 },
  { id: 'critdmg', name: 'Durchziehen', icon: '💥', stats: { critDmg: 0.25 }, weight: 7 },
  { id: 'speed', name: 'Leichtfüßig', icon: '👟', stats: { speed: 0.08 }, weight: 9 },
  { id: 'armor', name: 'Gepolstert', icon: '🛡️', stats: { armor: 4 }, weight: 8 },
  { id: 'dodge', name: 'Ausweichen', icon: '💨', stats: { dodge: 0.04 }, weight: 7 },
  { id: 'regen', name: 'Nachwachsen', icon: '🌱', stats: { hpRegen: 1.2 }, weight: 8 },
  { id: 'lifesteal', name: 'Aufsaugen', icon: '🩸', stats: { lifesteal: 0.035 }, weight: 6 },
  { id: 'range', name: 'Weiter greifen', icon: '🔭', stats: { range: 0.1 }, weight: 8 },
  { id: 'harvest', name: 'Gründlich ernten', icon: '🧺', stats: { harvesting: 0.15 }, weight: 8 },
  { id: 'luck', name: 'Glückssträhne', icon: '🍀', stats: { luck: 0.14 }, weight: 7 },
  { id: 'pickup', name: 'Magnetisch', icon: '🧲', stats: { pickupRange: 0.4 }, weight: 6 },
  { id: 'eng', name: 'Techniker', icon: '⚙️', stats: { engineering: 4 }, weight: 6 },
  { id: 'xp', name: 'Lernfähig', icon: '📘', stats: { xpGain: 0.15 }, weight: 6 },
  { id: 'thorns', name: 'Stachelig', icon: '🌵', stats: { thorns: 8 }, weight: 6 },
  { id: 'rollcd', name: 'Reflexe', icon: '🌀', stats: { rollCd: -0.15 }, weight: 6 },
  { id: 'artcd', name: 'Totemnähe', icon: '📿', stats: { artifactCd: -0.12 }, weight: 6 },
  { id: 'dot', name: 'Schwelend', icon: '🫧', stats: { dotDuration: 0.25 }, weight: 6 },
  { id: 'knock', name: 'Durchschlagskraft', icon: '🔨', stats: { knockback: 0.3 }, weight: 5 },
  { id: 'boom', name: 'Größere Explosionen', icon: '🧨', stats: { explosionSize: 0.2 }, weight: 5 },
  // Starke Karten mit Preis
  { id: 'glass', name: 'Glaskanone', icon: '💎', stats: { dmgAll: 0.28, maxHp: -14 }, weight: 3, tier: 2 },
  { id: 'bulwark', name: 'Bollwerk', icon: '🗿', stats: { armor: 12, maxHp: 25, speed: -0.1 }, weight: 3, tier: 2 },
  { id: 'frenzy', name: 'Raserei', icon: '🌀', stats: { attackSpeed: 0.25, dmgAll: -0.08 }, weight: 3, tier: 2 },
  { id: 'assassin', name: 'Meuchler', icon: '🗡️', stats: { crit: 0.12, critDmg: 0.4, maxHp: -10 }, weight: 3, tier: 2 },
];

/** Jede dritte Stufe gibt zusätzlich einen Verzauberungspunkt. */
export const ENCH_POINT_EVERY = 3;
