// Gegenstände für den Lager-Shop.
//
// Vorbild Brotato: fast jeder Gegenstand kostet etwas. Reiner Gewinn ohne
// Nachteil gibt es nur auf Stufe 1 und bei den Legendären. So entstehen
// Builds, weil man Schwächen in Kauf nimmt, die zum Rest passen.

export const STAT_LABELS = {
  maxHp: 'Max. LP', hpRegen: 'LP-Regen', lifesteal: 'Lebensraub', armor: 'Panzerung',
  dodge: 'Ausweichen', speed: 'Tempo', dmgAll: 'Schaden', dmgMelee: 'Nahkampf',
  dmgRanged: 'Fernkampf', dmgElem: 'Elementar', attackSpeed: 'Angriffstempo',
  crit: 'Crit-Chance', critDmg: 'Crit-Schaden', range: 'Reichweite', luck: 'Glück',
  harvesting: 'Ernte', pickupRange: 'Sammelradius', knockback: 'Rückstoß',
  explosionSize: 'Flächengröße', engineering: 'Technik', dotDuration: 'Effektdauer',
  rollCd: 'Rollen-Abklingzeit', artifactCd: 'Artefakt-Abklingzeit', xpGain: 'Erfahrung',
  allyDmg: 'Verbündeten-Schaden', thorns: 'Dornen', revives: 'Rettungen',
  weaponSlots: 'Waffenplätze', artifactSlots: 'Artefaktplätze',
};

/** Werte, die als absolute Zahl angezeigt werden (alles andere in Prozent). */
export const FLAT_STATS = new Set([
  'maxHp', 'hpRegen', 'armor', 'engineering', 'thorns', 'revives',
  'weaponSlots', 'artifactSlots',
]);

/** Werte, bei denen weniger besser ist. */
export const INVERTED_STATS = new Set(['rollCd', 'artifactCd']);

export const ITEM_PRICE = [14, 34, 72, 150];

const I = (id, name, icon, tier, stats, desc, tags = []) =>
  ({ id, name, icon, tier, stats, desc, tags, price: ITEM_PRICE[tier], sell: Math.round(ITEM_PRICE[tier] * 0.5) });

export const ITEM_LIST = [
  // --- Stufe 1: kleine, klare Boni ---
  I('schale', 'Harte Schale', '🥔', 0, { maxHp: 12 }, 'Einfach mehr Kartoffel.'),
  I('turnschuh', 'Turnschuh', '👟', 0, { speed: 0.09 }, 'Links und rechts verwechselt, läuft trotzdem.'),
  I('schleifstein', 'Schleifstein', '🪨', 0, { dmgMelee: 0.1 }, 'Scharf ist besser als stumpf.'),
  I('federn', 'Federkiel', '🪶', 0, { dmgRanged: 0.1 }, 'Fliegt gerader.'),
  I('zunder', 'Zunder', '🔥', 0, { dmgElem: 0.1 }, 'Brennt zuverlässig.'),
  I('lupe', 'Lupe', '🔍', 0, { crit: 0.04 }, 'Man sieht, wo es weh tut.'),
  I('metronom', 'Metronom', '🎵', 0, { attackSpeed: 0.08 }, 'Takt macht Schaden.'),
  I('fernglas', 'Fernglas', '🔭', 0, { range: 0.12 }, 'Reichweite für alle Waffen.'),
  I('kleeblatt', 'Kleeblatt', '🍀', 0, { luck: 0.12 }, 'Bessere Funde, bessere Angebote.'),
  I('korb', 'Erntekorb', '🧺', 0, { harvesting: 0.15 }, 'Mehr Knollen pro Gegner.'),
  I('magnetstein', 'Magnetstein', '🧲', 0, { pickupRange: 0.5 }, 'Zieht Beute aus der Ferne an.'),
  I('verband', 'Verband', '🩹', 0, { hpRegen: 1.2 }, 'Heilt langsam, aber stetig.'),
  I('nagel', 'Rostiger Nagel', '📌', 0, { thorns: 6 }, 'Wer dich anfasst, blutet.'),
  I('zahnrad', 'Zahnrad', '⚙️', 0, { engineering: 3 }, 'Türme und Minen schlagen härter.'),
  I('lederweste', 'Lederweste', '🦺', 0, { armor: 4 }, 'Nimmt jedem Treffer etwas weg.'),
  I('blatt', 'Glattes Blatt', '🍃', 0, { dodge: 0.04 }, 'Manchmal geht der Schlag daneben.'),

  // --- Stufe 2: Bonus mit Preis ---
  I('schwerefell', 'Schweres Fell', '🧥', 1, { armor: 10, speed: -0.07 },
    'Dick gepolstert, dafür langsam.', ['tank']),
  I('wurfarm', 'Trainierter Wurfarm', '💪', 1, { dmgRanged: 0.25, dmgMelee: -0.1 },
    'Aus der Distanz gefährlicher, im Nahkampf verlernt.', ['fern']),
  I('kampfstiefel', 'Kampfstiefel', '🥾', 1, { speed: 0.16, maxHp: -8 },
    'Schneller unterwegs, weniger Puffer.', ['speed']),
  I('brennglas', 'Brennglas', '☀️', 1, { dmgElem: 0.24, dotDuration: 0.2 },
    'Feuer und Gift halten länger.', ['elementar']),
  I('schlagring', 'Schlagring', '🥊', 1, { dmgMelee: 0.22, range: -0.15 },
    'Nah dran heißt hart zuschlagen.', ['nah']),
  I('pfefferkorn', 'Pfefferkorn', '🌶️', 1, { attackSpeed: 0.18, dmgAll: -0.06 },
    'Hektisch, aber flott.', ['tempo']),
  I('zielfernrohr', 'Zielfernrohr', '🎯', 1, { crit: 0.08, critDmg: 0.2, attackSpeed: -0.08 },
    'Langsam zielen, hart treffen.', ['crit']),
  I('blutegel', 'Blutegel', '🪱', 1, { lifesteal: 0.06, maxHp: -10 },
    'Lebt vom Schaden, den du machst.', ['lebensraub']),
  I('wurzelbart', 'Wurzelbart', '🌿', 1, { hpRegen: 3, speed: -0.05 },
    'Wächst nach, bleibt aber lieber stehen.', ['regen']),
  I('sprungfeder', 'Sprungfeder', '🌀', 1, { rollCd: -0.25, dodge: 0.05 },
    'Rollen kommt schneller zurück.', ['mobilität']),
  I('amulett', 'Totem-Amulett', '📿', 1, { artifactCd: -0.2 }, 'Artefakte laden schneller.', ['artefakt']),
  I('hamsterrad', 'Hamsterrad', '🐹', 1, { xpGain: 0.2, harvesting: -0.1 },
    'Mehr Erfahrung, weniger Knollen.', ['xp']),
  I('dynamit', 'Dynamitstange', '🧨', 1, { explosionSize: 0.25, dmgAll: 0.08, maxHp: -6 },
    'Größere Explosionen, dünnere Haut.', ['explosion']),
  I('schmiedehandschuh', 'Schmiedehandschuh', '🧤', 1, { engineering: 7, attackSpeed: -0.05 },
    'Türme bauen sich besser als sie schießen.', ['konstrukt']),
  I('kompass', 'Kompass', '🧭', 1, { luck: 0.2, harvesting: 0.12 }, 'Findet die guten Sachen.', ['glück']),
  I('rucksack', 'Rucksack', '🎒', 1, { pickupRange: 1.0, speed: -0.04 },
    'Sammelt alles ein, wiegt aber.', ['sammeln']),
  I('kettenhemd', 'Kettenhemd', '⛓️', 1, { armor: 8, dodge: -0.04, maxHp: 10 },
    'Hart, aber unbeweglich.', ['tank']),
  I('dornenranke', 'Dornenranke', '🥀', 1, { thorns: 16, speed: -0.06 },
    'Nahkämpfer bezahlen für jeden Schlag.', ['dornen']),

  // --- Stufe 3: Build-prägend ---
  I('herzknolle', 'Herzknolle', '❤️', 2, { maxHp: 40, hpRegen: 2, speed: -0.08 },
    'Ein großer Puffer gegen alles.', ['tank']),
  I('berserkerhut', 'Berserkerhut', '🎩', 2, { dmgAll: 0.3, armor: -6, maxHp: -15 },
    'Alles auf Angriff.', ['glaskanone']),
  I('praezisionslinse', 'Präzisionslinse', '💎', 2, { crit: 0.14, critDmg: 0.45 },
    'Crit-Build ohne Nachteil — teuer dafür.', ['crit']),
  I('windmantel', 'Windmantel', '🌬️', 2, { speed: 0.22, dodge: 0.1, maxHp: -12 },
    'Nicht getroffen ist besser als gepanzert.', ['speed']),
  I('vampirzahn', 'Vampirzahn', '🧛', 2, { lifesteal: 0.12, dmgMelee: 0.15, hpRegen: -1 },
    'Heilung nur noch durch Angriff.', ['lebensraub']),
  I('gewitterkern', 'Gewitterkern', '⚡', 2, { dmgElem: 0.35, attackSpeed: 0.12, maxHp: -10 },
    'Elementarschaden auf Anschlag.', ['elementar']),
  I('schnellspanner', 'Schnellspanner', '🏹', 2, { dmgRanged: 0.32, range: 0.2, dmgMelee: -0.25 },
    'Reiner Fernkampf-Build.', ['fern']),
  I('maschinenherz', 'Maschinenherz', '🫀', 2, { engineering: 15, maxHp: 20, speed: -0.1 },
    'Deine Konstrukte tragen den Kampf.', ['konstrukt']),
  I('glueckspilz', 'Glückspilz', '🍄', 2, { luck: 0.35, harvesting: 0.25 },
    'Bessere Angebote, mehr Knollen.', ['glück']),
  I('eisenhaut', 'Eisenhaut', '🛡️', 2, { armor: 18, thorns: 14, speed: -0.09 },
    'Eine wandelnde Mauer.', ['tank', 'dornen']),
  I('zeitknolle', 'Zeitknolle', '⏳', 2, { artifactCd: -0.35, maxHp: 12 },
    'Artefakte fast doppelt so oft.', ['artefakt']),
  I('waffengurt', 'Waffengurt', '🎽', 2, { weaponSlots: 1, dmgAll: -0.08 },
    'Ein Waffenplatz mehr, dafür etwas weniger Schaden.', ['slots']),
  I('tanzschuhe', 'Tanzschuhe', '🩰', 2, { rollCd: -0.45, dodge: 0.12, armor: -4 },
    'Dauernd am Ausweichen.', ['mobilität']),
  I('sporenbeutel', 'Sporenbeutel', '🫧', 2, { dotDuration: 0.5, dmgElem: 0.18 },
    'Brand und Gift halten deutlich länger.', ['elementar']),

  // --- Stufe 4: legendär, reiner Gewinn, aber teuer und selten ---
  I('koenigskrone', 'Königskrone', '👑', 3, { dmgAll: 0.25, maxHp: 30, luck: 0.25 },
    'Das Erbe des Kartoffelkönigs.', ['legendär']),
  I('phoenixknolle', 'Phönixknolle', '🔥', 3, { revives: 1, maxHp: 25, hpRegen: 3 },
    'Steht einmal pro Lauf mit halbem Leben wieder auf.', ['legendär']),
  I('artefaktgurt', 'Artefaktgurt', '🧰', 3, { artifactSlots: 1, artifactCd: -0.2 },
    'Ein vierter Artefaktplatz.', ['legendär', 'artefakt']),
  I('weltenkern', 'Weltenkern', '🌍', 3, { dmgAll: 0.18, attackSpeed: 0.18, range: 0.18, crit: 0.08 },
    'Alles ein Stück besser.', ['legendär']),
  I('goldene_knolle', 'Goldene Knolle', '🥇', 3, { harvesting: 0.6, luck: 0.4, xpGain: 0.25 },
    'Macht aus jedem Lauf eine Wirtschaftsmaschine.', ['legendär', 'glück']),
  I('titanenschale', 'Titanenschale', '🗿', 3, { maxHp: 60, armor: 22, thorns: 25, speed: -0.12 },
    'Nahezu unverwundbar, nahezu unbeweglich.', ['legendär', 'tank']),
];

export const ITEMS = Object.create(null);
for (const it of ITEM_LIST) ITEMS[it.id] = it;

export const itemsOfTier = (tier) => ITEM_LIST.filter((i) => i.tier === tier);

/** Lesbare Zeile für eine Werteänderung. */
export function statLine(key, value) {
  const label = STAT_LABELS[key] || key;
  const inverted = INVERTED_STATS.has(key);
  let text;
  if (FLAT_STATS.has(key)) {
    text = `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10}`;
  } else {
    const pct = Math.round(value * 100);
    text = `${pct > 0 ? '+' : ''}${pct}%`;
  }
  const good = inverted ? value < 0 : value > 0;
  return { label, text, good };
}

export function itemStatLines(item) {
  const out = [];
  for (const k in item.stats) out.push(statLine(k, item.stats[k]));
  return out;
}
