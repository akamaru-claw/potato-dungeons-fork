// Biome — jedes ist ein eigener Lauf über 20 Wellen mit eigenem Gegnerpool,
// eigener Farbwelt und eigenem Boss.

/**
 * `pool` ist eine Liste aus [gegnerId, abWelle, gewicht]. Das Gewicht steigt
 * nicht automatisch; wer später häufiger kommen soll, bekommt mehrere
 * Einträge mit unterschiedlichen Startwellen.
 */
export const BIOMES = {
  keller: {
    name: 'Kartoffelkeller',
    subtitle: 'Dunkel, feucht, voller Krabbelzeug',
    icon: '🕯️',
    unlock: null,
    waves: 20,
    pal: {
      floor: '#3b3228', floorLine: '#241d15', wall: '#4e4337',
      fog: '#0e0a06', light: '#ffb45e', ambient: 0.36,
    },
    props: ['fass', 'kiste', 'saeule', 'fackel', 'pilz'],
    hazards: [],
    pool: [
      ['kaefer', 1, 10], ['kaefer', 4, 8], ['floh', 2, 6],
      ['schimmel', 3, 5], ['schuetze', 4, 5], ['faul', 5, 4],
      ['stachel', 6, 4], ['maulwurf', 7, 4], ['ranke', 9, 3],
      ['geist', 10, 3], ['blech', 12, 3], ['magier', 13, 3],
      ['schimmel', 14, 4], ['stachel', 15, 4],
    ],
    miniboss: ['stachel', 'blech'],
    boss: 'kartoffelkoenig',
    reward: { biome: 'wueste', char: 'pommes' },
  },

  wueste: {
    name: 'Pommes-Wüste',
    subtitle: 'Heißes Öl, so weit das Auge reicht',
    icon: '🏜️',
    unlock: 'keller',
    waves: 20,
    pal: {
      floor: '#9a7840', floorLine: '#6b4e22', wall: '#b08a4a',
      fog: '#2a1c0a', light: '#ffd27a', ambient: 0.62,
    },
    props: ['stein', 'knochen', 'kiste', 'fass'],
    hazards: ['oil'],
    pool: [
      ['kaefer', 1, 8], ['floh', 1, 8], ['stachel', 2, 7],
      ['schuetze', 3, 6], ['zwiebel', 4, 6], ['wespe', 5, 5],
      ['faul', 6, 5], ['maulwurf', 7, 4], ['blech', 9, 4],
      ['schimmel', 10, 3], ['magier', 12, 3], ['zwiebel', 13, 5],
      ['stachel', 14, 5], ['wespe', 15, 5],
    ],
    miniboss: ['zwiebel', 'stachel'],
    boss: 'grossefritteuse',
    reward: { biome: 'sumpf', char: 'chips' },
  },

  sumpf: {
    name: 'Krautsumpf',
    subtitle: 'Alles wächst, alles fault',
    icon: '🥬',
    unlock: 'wueste',
    waves: 20,
    pal: {
      floor: '#2e3b2a', floorLine: '#182115', wall: '#3d4b30', 
      fog: '#080f07', light: '#9ef08f', ambient: 0.4,
    },
    props: ['pilz', 'stein', 'knochen', 'fass'],
    hazards: ['poison'],
    pool: [
      ['schimmel', 1, 8], ['kaefer', 1, 7], ['ranke', 2, 7],
      ['faul', 3, 7], ['magier', 4, 5], ['geist', 5, 5],
      ['frost', 6, 4], ['schuetze', 7, 5], ['maulwurf', 8, 4],
      ['blech', 10, 3], ['schimmel', 12, 6], ['ranke', 13, 5],
      ['magier', 15, 5], ['faul', 16, 6],
    ],
    miniboss: ['magier', 'schimmel'],
    boss: 'schimmelmoloch',
    reward: { biome: 'fabrik', char: 'schatten' },
  },

  fabrik: {
    name: 'Chips-Fabrik',
    subtitle: 'Hier wird aus Kartoffeln Ware',
    icon: '🏭',
    unlock: 'sumpf',
    waves: 20,
    pal: {
      floor: '#3c4046', floorLine: '#1f2225', wall: '#4e545b',
      fog: '#0b0d10', light: '#9ef0ff', ambient: 0.46,
    },
    props: ['kiste', 'saeule', 'stein'],
    hazards: ['saw', 'oil'],
    pool: [
      ['blech', 1, 8], ['kaefer', 1, 6], ['wespe', 2, 6],
      ['zwiebel', 3, 5], ['schuetze', 4, 6], ['stachel', 5, 6],
      ['geist', 6, 5], ['frost', 7, 5], ['magier', 9, 4],
      ['faul', 10, 5], ['blech', 12, 6], ['wespe', 13, 6],
      ['stachel', 15, 6], ['geist', 16, 5],
    ],
    miniboss: ['blech', 'geist'],
    boss: 'ruebenhexe',
    reward: { biome: 'ofen', char: 'stahl' },
  },

  ofen: {
    name: 'Vulkan-Ofen',
    subtitle: 'Der letzte Ort. 220 Grad.',
    icon: '🌋',
    unlock: 'fabrik',
    waves: 20,
    pal: {
      floor: '#3b241e', floorLine: '#1f0f0a', wall: '#4e3022',
      fog: '#160705', light: '#ff8a3d', ambient: 0.42,
    },
    props: ['stein', 'knochen', 'saeule'],
    hazards: ['lava'],
    pool: [
      ['zwiebel', 1, 9], ['stachel', 1, 7], ['blech', 2, 6],
      ['faul', 3, 7], ['wespe', 4, 6], ['geist', 5, 5],
      ['magier', 6, 5], ['schimmel', 7, 5], ['ranke', 8, 4],
      ['frost', 9, 3], ['zwiebel', 11, 7], ['blech', 13, 6],
      ['stachel', 14, 7], ['faul', 16, 7], ['magier', 17, 5],
    ],
    miniboss: ['zwiebel', 'blech'],
    boss: 'knollenkoloss',
    reward: { char: 'teufel' },
  },
};

export const BIOME_IDS = Object.keys(BIOMES);
export const BIOME_LIST = BIOME_IDS.map((id) => ({ id, ...BIOMES[id] }));

/** Gefahren-Definitionen: Bodenflächen, die weh tun. */
export const HAZARDS = {
  lava: {
    name: 'Lava', color: '#ff5a2a', glow: '#ff8a3d',
    dmgPerSec: 16, slow: 0, burn: 8, damagesEnemies: true,
  },
  oil: {
    name: 'Heißes Öl', color: '#d9a03a', glow: '#ffd27a',
    dmgPerSec: 9, slow: 0.3, burn: 5, damagesEnemies: true,
  },
  poison: {
    name: 'Giftpfütze', color: '#6cbf4a', glow: '#a8e86a',
    dmgPerSec: 7, slow: 0.2, poison: 6, damagesEnemies: false,
  },
  saw: {
    name: 'Sägeblatt', color: '#c0c6cc', glow: '#ffffff',
    dmgPerSec: 26, slow: 0, damagesEnemies: true, moving: true,
  },
};

/** Schwierigkeitsstufen — Brotatos "Danger". */
export const DIFFICULTIES = [
  { id: 0, name: 'Spaziergang', icon: '🌼', hpMul: 1.0, dmgMul: 1.0, countMul: 1.0, lootMul: 1.0, unlockAt: 0 },
  { id: 1, name: 'Ernst', icon: '⚔️', hpMul: 1.35, dmgMul: 1.2, countMul: 1.15, lootMul: 1.15, unlockAt: 0 },
  { id: 2, name: 'Brutal', icon: '💀', hpMul: 1.9, dmgMul: 1.45, countMul: 1.3, lootMul: 1.3, unlockAt: 1 },
  { id: 3, name: 'Fritteuse', icon: '🔥', hpMul: 2.7, dmgMul: 1.8, countMul: 1.5, lootMul: 1.5, unlockAt: 2 },
  { id: 4, name: 'Albtraum', icon: '☠️', hpMul: 4.0, dmgMul: 2.2, countMul: 1.75, lootMul: 1.8, unlockAt: 3 },
];

/** Welche Gegner sind in dieser Welle erlaubt? */
export function poolForWave(biome, wave) {
  const out = [];
  for (const [id, from, weight] of biome.pool) {
    if (wave >= from) out.push({ id, weight });
  }
  return out.length ? out : [{ id: 'kaefer', weight: 1 }];
}
