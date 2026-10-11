// Waffen.
//
// Statt 100 Waffen von Hand zu pflegen, gibt es Familien mit vier Stufen.
// Zwei Waffen derselben Familie und Stufe lassen sich im Lager zur nächsten
// Stufe verschmelzen — das ist die Kern-Entscheidung aus Brotato: breit
// sammeln oder auf eine Waffe eindampfen.

export const TIER_NAMES = ['Gewöhnlich', 'Selten', 'Episch', 'Legendär'];
export const TIER_COLORS = ['#9fb0bd', '#58c9f3', '#c06ff0', '#ffb13d'];
export const TIER_PRICE = [16, 42, 95, 195];

/** Waffenklassen mit Satz-Bonus. Zählt, wie viele Waffen der Klasse man trägt. */
export const CLASSES = {
  klinge: {
    name: 'Klinge', color: '#e86a5a', icon: '🗡️',
    desc: 'Schnelle Schnitte, hohe Trefferzahl.',
    steps: [
      { at: 2, stats: { dmgMelee: 0.10 }, text: '+10% Nahkampfschaden' },
      { at: 4, stats: { dmgMelee: 0.20, attackSpeed: 0.10 }, text: '+20% Nahkampfschaden, +10% Angriffstempo' },
      { at: 6, stats: { dmgMelee: 0.35, attackSpeed: 0.20, lifesteal: 0.03 }, text: '+35% Nahkampf, +20% Tempo, 3% Lebensraub' },
    ],
  },
  wucht: {
    name: 'Wucht', color: '#d9943a', icon: '🔨',
    desc: 'Langsam, schwer, schmeißt alles weg.',
    steps: [
      { at: 2, stats: { knockback: 0.25, armor: 2 }, text: '+25% Rückstoß, +2 Panzerung' },
      { at: 4, stats: { knockback: 0.5, armor: 5, dmgMelee: 0.15 }, text: '+50% Rückstoß, +5 Panzerung, +15% Nahkampf' },
      { at: 6, stats: { knockback: 1.0, armor: 10, dmgMelee: 0.3, maxHp: 15 }, text: '+100% Rückstoß, +10 Panzerung, +30% Nahkampf, +15 LP' },
    ],
  },
  stich: {
    name: 'Stich', color: '#f0d04a', icon: '🍴',
    desc: 'Präzise Stöße, lebt von kritischen Treffern.',
    steps: [
      { at: 2, stats: { crit: 0.05 }, text: '+5% kritische Chance' },
      { at: 4, stats: { crit: 0.10, critDmg: 0.25 }, text: '+10% Crit, +25% Crit-Schaden' },
      { at: 6, stats: { crit: 0.18, critDmg: 0.6 }, text: '+18% Crit, +60% Crit-Schaden' },
    ],
  },
  fern: {
    name: 'Fernkampf', color: '#58c9f3', icon: '🏹',
    desc: 'Schaden auf Abstand.',
    steps: [
      { at: 2, stats: { range: 0.12 }, text: '+12% Reichweite' },
      { at: 4, stats: { range: 0.24, dmgRanged: 0.15 }, text: '+24% Reichweite, +15% Fernkampf' },
      { at: 6, stats: { range: 0.4, dmgRanged: 0.3, attackSpeed: 0.15 }, text: '+40% Reichweite, +30% Fernkampf, +15% Tempo' },
    ],
  },
  elementar: {
    name: 'Elementar', color: '#b06ef0', icon: '🔥',
    desc: 'Feuer, Frost, Gift — Schaden über Zeit.',
    steps: [
      { at: 2, stats: { dmgElem: 0.12 }, text: '+12% Elementarschaden' },
      { at: 4, stats: { dmgElem: 0.25, dotDuration: 0.3 }, text: '+25% Elementar, +30% Dauer von Effekten' },
      { at: 6, stats: { dmgElem: 0.45, dotDuration: 0.6, explosionSize: 0.25 }, text: '+45% Elementar, +60% Effektdauer, +25% Flächengröße' },
    ],
  },
  konstrukt: {
    name: 'Konstrukt', color: '#6fe0c0', icon: '⚙️',
    desc: 'Türme und Minen kämpfen für dich.',
    steps: [
      { at: 2, stats: { engineering: 3 }, text: '+3 Technik' },
      { at: 4, stats: { engineering: 8, maxHp: 10 }, text: '+8 Technik, +10 LP' },
      { at: 6, stats: { engineering: 16, maxHp: 25, armor: 4 }, text: '+16 Technik, +25 LP, +4 Panzerung' },
    ],
  },
  natur: {
    name: 'Natur', color: '#7bd44f', icon: '🌱',
    desc: 'Heilung und Lebensraub.',
    steps: [
      { at: 2, stats: { hpRegen: 1 }, text: '+1 LP-Regeneration' },
      { at: 4, stats: { hpRegen: 2.5, lifesteal: 0.04 }, text: '+2,5 Regeneration, 4% Lebensraub' },
      { at: 6, stats: { hpRegen: 5, lifesteal: 0.09, maxHp: 20 }, text: '+5 Regeneration, 9% Lebensraub, +20 LP' },
    ],
  },
};

/**
 * Waffen-Familien. `base` gilt für Stufe 1, `mul` wird pro Stufe multipliziert,
 * `add` pro Stufe addiert.
 *
 * pattern: swing | slam | thrust | shoot | shotgun | pierce | chain | cone
 *          | beam | orbit | turret | mine | boomerang | aura
 */
const FAMILIES = [
  // --- Klinge ---
  {
    id: 'messer', cls: 'klinge', art: 'klinge', pattern: 'swing', color: '#dfe6ec',
    names: ['Schälmesser', 'Küchenmesser', 'Hackmesser', 'Kartoffelsäbel'],
    base: { dmg: 10, cd: 0.62, range: 88, arc: 1.45, knock: 60, crit: 0.06 },
    mul: { dmg: 1.62, cd: 0.94, range: 1.05 },
    scale: { melee: 1 },
    desc: 'Schneller Schnitt mit erhöhter Crit-Chance.',
  },
  {
    id: 'sense', cls: 'klinge', art: 'klinge', pattern: 'swing', color: '#a8d8c0',
    names: ['Handsichel', 'Erntesense', 'Krautschneider', 'Knollenschnitter'],
    base: { dmg: 17, cd: 1.05, range: 108, arc: 2.7, knock: 110 },
    mul: { dmg: 1.58, cd: 0.96, range: 1.07 },
    scale: { melee: 1 },
    desc: 'Weiter Bogen, trifft alles vor dir.',
  },
  {
    id: 'kreisel', cls: 'klinge', art: 'klinge', pattern: 'orbit', color: '#f0a8c0',
    names: ['Kreisklinge', 'Wirbelklinge', 'Säbelrad', 'Knollenmühle'],
    base: { dmg: 7, cd: 0.34, range: 76, count: 1, orbitSpeed: 3.4 },
    mul: { dmg: 1.55, range: 1.08 },
    add: { count: 1 },
    scale: { melee: 1 },
    desc: 'Klingen kreisen dauerhaft um dich.',
  },
  // --- Wucht ---
  {
    id: 'pfanne', cls: 'wucht', art: 'wucht', pattern: 'swing', color: '#5a6670',
    names: ['Bratpfanne', 'Eisenpfanne', 'Gusspfanne', 'Pfanne des Zorns'],
    base: { dmg: 22, cd: 1.25, range: 92, arc: 1.9, knock: 320, stun: 0.3 },
    mul: { dmg: 1.6, cd: 0.96, knock: 1.18 },
    scale: { melee: 1 },
    desc: 'Schmeißt Gegner weg und betäubt sie kurz.',
  },
  {
    id: 'stampfer', cls: 'wucht', art: 'wucht', pattern: 'slam', color: '#9a6b3a',
    names: ['Kartoffelstampfer', 'Steinmörser', 'Erdbrecher', 'Weltenstampfer'],
    base: { dmg: 28, cd: 1.6, range: 104, area: 86, knock: 260 },
    mul: { dmg: 1.64, cd: 0.95, area: 1.12 },
    scale: { melee: 1 },
    desc: 'Schlag in den Boden, Flächenschaden um den Einschlag.',
  },
  {
    id: 'hammer', cls: 'wucht', art: 'wucht', pattern: 'swing', color: '#c0c6cc',
    names: ['Holzkeule', 'Schmiedehammer', 'Kriegshammer', 'Knollenbrecher'],
    base: { dmg: 42, cd: 2.1, range: 100, arc: 1.5, knock: 420, stun: 0.45 },
    mul: { dmg: 1.68, cd: 0.96, knock: 1.15 },
    scale: { melee: 1 },
    desc: 'Langsam, aber ein Treffer räumt die Reihe.',
  },
  // --- Stich ---
  {
    id: 'gabel', cls: 'stich', art: 'stich', pattern: 'thrust', color: '#dfe6ec',
    names: ['Essgabel', 'Grillgabel', 'Mistgabel', 'Gabel des Königs'],
    base: { dmg: 13, cd: 0.56, range: 112, width: 20, pierce: 1, crit: 0.1 },
    mul: { dmg: 1.6, cd: 0.95, range: 1.06 },
    scale: { melee: 1 },
    desc: 'Schneller Stoß, durchbohrt einen Gegner.',
  },
  {
    id: 'speer', cls: 'stich', art: 'stich', pattern: 'thrust', color: '#c9a05a',
    names: ['Holzspeer', 'Fleischspieß', 'Langspeer', 'Schaschlikspeer'],
    base: { dmg: 24, cd: 1.0, range: 168, width: 22, pierce: 3, crit: 0.08 },
    mul: { dmg: 1.6, cd: 0.96, range: 1.08 },
    add: { pierce: 1 },
    scale: { melee: 1 },
    desc: 'Lange Reichweite, spießt eine ganze Reihe auf.',
  },
  {
    id: 'dreizack', cls: 'stich', art: 'stich', pattern: 'thrust', color: '#6fd0e0',
    names: ['Zweizack', 'Dreizack', 'Vierzack', 'Knollentrident'],
    base: { dmg: 15, cd: 0.9, range: 130, width: 18, pierce: 2, count: 3, spread: 0.42, crit: 0.1 },
    mul: { dmg: 1.58, cd: 0.96, range: 1.06 },
    scale: { melee: 1 },
    desc: 'Drei Stöße gleichzeitig in leichtem Fächer.',
  },
  // --- Fernkampf ---
  {
    id: 'schleuder', cls: 'fern', art: 'bogen', pattern: 'shoot', color: '#9ad65c',
    names: ['Astschleuder', 'Lederschleuder', 'Kampfschleuder', 'Sturmschleuder'],
    base: { dmg: 12, cd: 0.7, range: 320, speed: 560, projSize: 7 },
    mul: { dmg: 1.6, cd: 0.94, range: 1.06, speed: 1.05 },
    scale: { ranged: 1 },
    desc: 'Günstiger Fernkampf mit guter Reichweite.',
  },
  {
    id: 'kanone', cls: 'fern', art: 'rohr', pattern: 'shoot', color: '#4a5560',
    names: ['Knollenrohr', 'Kartoffelkanone', 'Belagerungsrohr', 'Knollenmörser'],
    base: { dmg: 38, cd: 1.75, range: 360, speed: 430, projSize: 14, area: 54, knock: 200 },
    mul: { dmg: 1.66, cd: 0.96, area: 1.12 },
    scale: { ranged: 1 },
    desc: 'Langsamer Schuss, explodiert beim Einschlag.',
  },
  {
    id: 'schrot', cls: 'fern', art: 'rohr', pattern: 'shotgun', color: '#c08a4a',
    names: ['Erbsenflinte', 'Pommes-Schrot', 'Doppelflinte', 'Knollendonner'],
    base: { dmg: 9, cd: 1.15, range: 190, speed: 600, count: 5, spread: 0.52, projSize: 6, knock: 90 },
    mul: { dmg: 1.58, cd: 0.96, range: 1.07 },
    add: { count: 1 },
    scale: { ranged: 1 },
    desc: 'Streuschuss — verheerend auf kurze Distanz.',
  },
  {
    id: 'mg', cls: 'fern', art: 'rohr', pattern: 'shoot', color: '#7a8690',
    names: ['Erbsenpistole', 'Bohnen-MG', 'Schnellfeuerrohr', 'Knollengewitter'],
    base: { dmg: 5, cd: 0.17, range: 260, speed: 700, projSize: 5, spread: 0.1 },
    mul: { dmg: 1.62, cd: 0.95, range: 1.05 },
    scale: { ranged: 1 },
    desc: 'Dauerfeuer mit leichter Streuung.',
  },
  {
    id: 'armbrust', cls: 'fern', art: 'bogen', pattern: 'pierce', color: '#8a5a2a',
    names: ['Handarmbrust', 'Jagdarmbrust', 'Schwere Armbrust', 'Knollenballiste'],
    base: { dmg: 26, cd: 1.3, range: 420, speed: 860, pierce: 3, projSize: 8, crit: 0.08 },
    mul: { dmg: 1.64, cd: 0.96, range: 1.06 },
    add: { pierce: 1 },
    scale: { ranged: 1 },
    desc: 'Bolzen fliegt durch mehrere Gegner.',
  },
  {
    id: 'boomerang', cls: 'fern', art: 'klinge', pattern: 'boomerang', color: '#d9b154',
    names: ['Wurfkartoffel', 'Wurfklinge', 'Bumerang', 'Knollenrückkehrer'],
    base: { dmg: 18, cd: 1.1, range: 260, speed: 480, pierce: 99, projSize: 11 },
    mul: { dmg: 1.6, cd: 0.95, range: 1.07 },
    scale: { ranged: 0.6, melee: 0.4 },
    desc: 'Fliegt hin und zurück, trifft doppelt.',
  },
  // --- Elementar ---
  {
    id: 'chili', cls: 'elementar', art: 'stab', pattern: 'shoot', color: '#e8503a',
    names: ['Chilischote', 'Feuerschote', 'Glutschote', 'Höllenschote'],
    base: { dmg: 11, cd: 0.78, range: 300, speed: 520, projSize: 9, burn: 7, burnTime: 2.5 },
    mul: { dmg: 1.58, cd: 0.95, burn: 1.6 },
    scale: { elem: 1 },
    desc: 'Setzt Gegner in Brand.',
  },
  {
    id: 'flammen', cls: 'elementar', art: 'rohr', pattern: 'cone', color: '#ff8a3d',
    names: ['Feuerzeug', 'Flammenwerfer', 'Drachenrohr', 'Infernorohr'],
    base: { dmg: 5, cd: 0.14, range: 148, arc: 0.68, burn: 4, burnTime: 2 },
    mul: { dmg: 1.6, range: 1.09, burn: 1.5 },
    scale: { elem: 1 },
    desc: 'Dauerhafter Flammenkegel vor dir.',
  },
  {
    id: 'frostbeutel', cls: 'elementar', art: 'stab', pattern: 'slam', color: '#8fd8f0',
    names: ['Eiswürfel', 'Frostbeutel', 'Gletscherknolle', 'Eiszeitkern'],
    base: { dmg: 16, cd: 1.5, range: 150, area: 112, slow: 0.45, slowTime: 2.2 },
    mul: { dmg: 1.6, cd: 0.96, area: 1.1 },
    scale: { elem: 1 },
    desc: 'Frostschlag verlangsamt alles in der Fläche.',
  },
  {
    id: 'gewitter', cls: 'elementar', art: 'stab', pattern: 'chain', color: '#9ef0ff',
    names: ['Funkenwurzel', 'Gewitterwurzel', 'Sturmwurzel', 'Donnerknolle'],
    base: { dmg: 14, cd: 1.15, range: 240, chain: 3, chainRange: 130 },
    mul: { dmg: 1.6, cd: 0.96, range: 1.06 },
    add: { chain: 1 },
    scale: { elem: 1 },
    desc: 'Blitz springt von Gegner zu Gegner.',
  },
  {
    id: 'gift', cls: 'elementar', art: 'rohr', pattern: 'shoot', color: '#8fd14f',
    names: ['Sprühflasche', 'Giftsprüher', 'Säureschleuder', 'Seuchenwerfer'],
    base: { dmg: 8, cd: 0.95, range: 240, speed: 400, projSize: 12, area: 72, poison: 6, poisonTime: 4, cloud: 3 },
    mul: { dmg: 1.56, cd: 0.96, area: 1.12, poison: 1.55 },
    scale: { elem: 1 },
    desc: 'Hinterlässt eine ätzende Giftwolke.',
  },
  {
    id: 'sonne', cls: 'elementar', art: 'stab', pattern: 'beam', color: '#ffd93d',
    names: ['Glühkolben', 'Sonnenknolle', 'Sternenkern', 'Sonnenzorn'],
    base: { dmg: 30, cd: 1.5, range: 380, width: 26, pierce: 99, burn: 6, burnTime: 2 },
    mul: { dmg: 1.66, cd: 0.95, range: 1.06, width: 1.08 },
    scale: { elem: 1 },
    desc: 'Lichtstrahl durch alles, was im Weg steht.',
  },
  // --- Konstrukt ---
  {
    id: 'schluessel', cls: 'konstrukt', art: 'konstrukt', pattern: 'swing', color: '#8a949e',
    names: ['Schraubschlüssel', 'Rohrzange', 'Schwerer Schlüssel', 'Maschinenschlüssel'],
    base: { dmg: 16, cd: 0.9, range: 90, arc: 1.6, knock: 150, engBonus: 2 },
    mul: { dmg: 1.6, cd: 0.96 },
    add: { engBonus: 2 },
    scale: { melee: 1 },
    desc: 'Nahkampf und gibt zusätzlich Technik.',
  },
  {
    id: 'mine', cls: 'konstrukt', art: 'konstrukt', pattern: 'mine', color: '#e8a03a',
    names: ['Knallerbse', 'Minenleger', 'Haftmine', 'Knollenmine'],
    base: { dmg: 34, cd: 2.2, range: 120, area: 100, maxActive: 3, armTime: 0.5 },
    mul: { dmg: 1.66, cd: 0.96, area: 1.1 },
    add: { maxActive: 1 },
    scale: { elem: 0.5, ranged: 0.5 },
    desc: 'Legt Minen, die bei Kontakt hochgehen.',
  },
  {
    id: 'turm', cls: 'konstrukt', art: 'konstrukt', pattern: 'turret', color: '#6fe0c0',
    names: ['Erbsenwerfer', 'Geschützturm', 'Doppelturm', 'Laserturm'],
    base: { dmg: 9, cd: 7, range: 280, turretCd: 0.55, turretLife: 16, maxActive: 1, speed: 620 },
    mul: { dmg: 1.62, turretCd: 0.9 },
    add: { maxActive: 1, turretLife: 4 },
    scale: { ranged: 1 },
    desc: 'Stellt einen Turm auf, der selbstständig schießt.',
  },
  // --- Natur ---
  {
    id: 'rankenpeitsche', cls: 'natur', art: 'klinge', pattern: 'swing', color: '#6cbf4a',
    names: ['Wurzelpeitsche', 'Rankenpeitsche', 'Dornenpeitsche', 'Weltenranke'],
    base: { dmg: 14, cd: 0.95, range: 150, arc: 1.1, knock: 90, heal: 1 },
    mul: { dmg: 1.6, cd: 0.96, range: 1.07 },
    add: { heal: 1 },
    scale: { melee: 1 },
    desc: 'Lange Reichweite, heilt bei jedem Treffer.',
  },
  {
    id: 'dornen', cls: 'natur', art: 'klinge', pattern: 'orbit', color: '#4f8f3a',
    names: ['Dornenzweig', 'Dornenbusch', 'Dornenkranz', 'Dornenwall'],
    base: { dmg: 6, cd: 0.42, range: 62, count: 2, orbitSpeed: 2.2, knock: 60 },
    mul: { dmg: 1.56, range: 1.08 },
    add: { count: 1 },
    scale: { melee: 0.6, elem: 0.4 },
    desc: 'Dornen kreisen enger und dichter als Klingen.',
  },
  {
    id: 'heilpilz', cls: 'natur', art: 'stab', pattern: 'aura', color: '#c0453a',
    names: ['Heilpilz', 'Lebenspilz', 'Sporenkrone', 'Weltenpilz'],
    base: { dmg: 5, cd: 0.7, range: 110, heal: 2 },
    mul: { dmg: 1.55, range: 1.1 },
    add: { heal: 1 },
    scale: { elem: 0.5, melee: 0.5 },
    desc: 'Sporenaura schadet Gegnern und heilt dich.',
  },
];

/** Flache Waffenliste, aus den Familien erzeugt. */
export const WEAPONS = {};
export const WEAPON_LIST = [];

function buildFamily(fam) {
  for (let tier = 0; tier < 4; tier++) {
    const stats = { ...fam.base };
    for (let t = 0; t < tier; t++) {
      if (fam.mul) for (const k in fam.mul) stats[k] = (stats[k] || 0) * fam.mul[k];
      if (fam.add) for (const k in fam.add) stats[k] = (stats[k] || 0) + fam.add[k];
    }
    // Rundung, damit im UI keine 13,4999 steht
    for (const k of ['dmg', 'range', 'area', 'width', 'knock', 'speed', 'burn', 'poison', 'projSize']) {
      if (stats[k] != null) stats[k] = Math.round(stats[k]);
    }
    if (stats.cd != null) stats.cd = Math.round(stats.cd * 100) / 100;
    if (stats.count != null) stats.count = Math.round(stats.count);
    if (stats.chain != null) stats.chain = Math.round(stats.chain);
    if (stats.pierce != null) stats.pierce = Math.round(stats.pierce);
    if (stats.maxActive != null) stats.maxActive = Math.round(stats.maxActive);

    const id = `${fam.id}_${tier + 1}`;
    const w = {
      id,
      family: fam.id,
      tier,
      name: fam.names[tier],
      cls: fam.cls,
      art: fam.art,
      pattern: fam.pattern,
      color: fam.color,
      scale: fam.scale,
      desc: fam.desc,
      price: TIER_PRICE[tier],
      sell: Math.round(TIER_PRICE[tier] * 0.5),
      ...stats,
    };
    WEAPONS[id] = w;
    WEAPON_LIST.push(w);
  }
}
FAMILIES.forEach(buildFamily);

export const WEAPON_FAMILIES = FAMILIES;

/** Die nächste Stufe derselben Familie — null bei Legendär. */
export function upgradeOf(weapon) {
  if (!weapon || weapon.tier >= 3) return null;
  return WEAPONS[`${weapon.family}_${weapon.tier + 2}`] || null;
}

export function weaponsOfTier(tier) {
  return WEAPON_LIST.filter((w) => w.tier === tier);
}

/** Startwaffen sind absichtlich simpel und immer Stufe 1. */
export const STARTER_WEAPONS = ['messer_1', 'schleuder_1', 'gabel_1', 'pfanne_1', 'chili_1', 'sense_1'];

/** Kurztext für die Waffenkarte. */
export function weaponStatLines(w) {
  const lines = [];
  lines.push(['Schaden', String(w.dmg)]);
  if (w.pattern === 'orbit' || w.pattern === 'aura') lines.push(['Takt', `${w.cd.toFixed(2)}s`]);
  else lines.push(['Abklingzeit', `${w.cd.toFixed(2)}s`]);
  lines.push(['DPS', (w.dmg * (w.count || 1) / Math.max(0.05, w.cd)).toFixed(1)]);
  lines.push(['Reichweite', String(w.range)]);
  if (w.count > 1) lines.push(['Projektile', String(w.count)]);
  if (w.pierce) lines.push(['Durchschlag', w.pierce >= 99 ? '∞' : String(w.pierce)]);
  if (w.area) lines.push(['Fläche', String(w.area)]);
  if (w.chain) lines.push(['Kettenziele', String(w.chain)]);
  if (w.burn) lines.push(['Brand', `${w.burn}/s`]);
  if (w.poison) lines.push(['Gift', `${w.poison}/s`]);
  if (w.slow) lines.push(['Verlangsamung', `${Math.round(w.slow * 100)}%`]);
  if (w.stun) lines.push(['Betäubung', `${w.stun.toFixed(2)}s`]);
  if (w.heal) lines.push(['Heilung/Treffer', String(w.heal)]);
  if (w.crit) lines.push(['Crit-Bonus', `+${Math.round(w.crit * 100)}%`]);
  if (w.knock) lines.push(['Rückstoß', String(w.knock)]);
  if (w.maxActive) lines.push(['Max. aktiv', String(w.maxActive)]);
  if (w.engBonus) lines.push(['Technik', `+${w.engBonus}`]);
  return lines;
}

/** Welche Schadensart dominiert — für Farbcodes im UI. */
export function weaponDamageType(w) {
  const s = w.scale || {};
  let best = 'melee', v = -1;
  for (const k in s) if (s[k] > v) { v = s[k]; best = k; }
  return best;
}
