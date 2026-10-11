// Gegner.
//
// `ai` wählt das Verhalten in game/enemyAI.js. Die Zahlen hier sind Werte für
// Welle 1 — hochskaliert wird zentral, damit Balance an einer Stelle lebt.

export const ENEMIES = {
  kaefer: {
    name: 'Kartoffelkäfer', shape: 'kaefer', ai: 'chase',
    pal: { main: '#8a6b3a', accent: '#d9a05a', eye: '#ff6b4a' },
    size: 17, hp: 11, dmg: 6, speed: 86, xp: 2, knollen: 1,
    desc: 'Kommt in Massen und beißt.',
  },
  floh: {
    name: 'Erdfloh', shape: 'floh', ai: 'hop',
    pal: { main: '#6b5a8a', accent: '#a890d0', eye: '#ffe79a' },
    size: 13, hp: 7, dmg: 5, speed: 150, xp: 2, knollen: 1,
    hopTime: 0.55, hopDist: 110,
    desc: 'Springt in Sätzen, schwer zu treffen.',
  },
  schimmel: {
    name: 'Schimmelknolle', shape: 'schimmel', ai: 'chase',
    pal: { main: '#7a7a5a', accent: '#a8c060', eye: '#d0ff8a' },
    size: 26, hp: 46, dmg: 11, speed: 44, xp: 6, knollen: 3,
    armor: 2, knockRes: 0.45,
    desc: 'Langsam, zäh, stinkt.',
  },
  schuetze: {
    name: 'Wurzelschütze', shape: 'schuetze', ai: 'shooter',
    pal: { main: '#8a5a3a', accent: '#6cbf4a', eye: '#ffd93d' },
    size: 17, hp: 16, dmg: 8, speed: 62, xp: 4, knollen: 2,
    attackCd: 2.1, range: 330, keepDist: 250,
    projectile: { speed: 260, size: 8, color: '#a8d86a', life: 2.4 },
    desc: 'Hält Abstand und spuckt Dornen.',
  },
  stachel: {
    name: 'Stachelrübe', shape: 'stachel', ai: 'charger',
    pal: { main: '#b04a5a', accent: '#f0d8c0', eye: '#ffd93d' },
    size: 20, hp: 26, dmg: 15, speed: 72, xp: 5, knollen: 2,
    chargeSpeed: 420, chargeWindup: 0.7, chargeTime: 0.75, chargeCd: 2.6,
    desc: 'Nimmt Anlauf und rammt dich.',
  },
  faul: {
    name: 'Faulknolle', shape: 'faul', ai: 'exploder',
    pal: { main: '#6b7a4a', accent: '#c0f06a', eye: '#d0ff8a' },
    size: 20, hp: 18, dmg: 26, speed: 104, xp: 5, knollen: 2,
    fuse: 0.75, blastRadius: 96,
    desc: 'Rennt auf dich zu und platzt.',
  },
  geist: {
    name: 'Kompostgeist', shape: 'geist', ai: 'teleporter',
    pal: { main: '#5a6b7a', accent: '#8fb0c0', eye: '#9ef0ff' },
    size: 18, hp: 22, dmg: 10, speed: 78, xp: 6, knollen: 2,
    teleportCd: 3.2, flying: true, dodgeChance: 0.12,
    desc: 'Blinkt durch die Gegend, ignoriert Wände.',
  },
  maulwurf: {
    name: 'Blindmaulwurf', shape: 'maulwurf', ai: 'burrow',
    pal: { main: '#4a4038', accent: '#e8c0a0', eye: '#ff9a3d' },
    size: 19, hp: 24, dmg: 13, speed: 96, xp: 5, knollen: 2,
    burrowCd: 4.2, burrowTime: 1.3,
    desc: 'Taucht ab und kommt neben dir raus.',
  },
  ranke: {
    name: 'Rankenwerfer', shape: 'ranke', ai: 'puller',
    pal: { main: '#5a7a3a', accent: '#8fd14f', eye: '#ffd93d' },
    size: 20, hp: 30, dmg: 9, speed: 50, xp: 6, knollen: 3,
    attackCd: 3.4, range: 280, pullForce: 340,
    desc: 'Zieht dich zu sich, wenn du stehen bleibst.',
  },
  magier: {
    name: 'Krautmagier', shape: 'magier', ai: 'summoner',
    pal: { main: '#6b4a7a', accent: '#4a3a6b', eye: '#d08aff' },
    size: 19, hp: 34, dmg: 8, speed: 54, xp: 9, knollen: 4,
    attackCd: 4.0, range: 400, keepDist: 320,
    summons: 'kaefer', summonCount: 2,
    desc: 'Ruft Käfer, bis man ihn ausschaltet.',
  },
  blech: {
    name: 'Blechdose', shape: 'blech', ai: 'tank',
    pal: { main: '#8a949e', accent: '#d0d8e0', eye: '#ff6b4a' },
    size: 24, hp: 70, dmg: 16, speed: 40, xp: 10, knollen: 5,
    armor: 10, knockRes: 0.8, critWeak: 1.6,
    desc: 'Panzerung frisst normalen Schaden — Crits gehen durch.',
  },
  zwiebel: {
    name: 'Feuerzwiebel', shape: 'zwiebel', ai: 'firetrail',
    pal: { main: '#d98a4a', accent: '#ff8a3d', eye: '#fff3c4' },
    size: 21, hp: 32, dmg: 12, speed: 82, xp: 7, knollen: 3,
    trailCd: 0.4, trailDmg: 7, trailTime: 3.2,
    desc: 'Lässt eine Feuerspur hinter sich.',
  },
  frost: {
    name: 'Frostrübe', shape: 'frost', ai: 'aura',
    pal: { main: '#6b94b0', accent: '#c0e8f8', eye: '#d8f6ff' },
    size: 22, hp: 40, dmg: 10, speed: 56, xp: 8, knollen: 3,
    auraRadius: 130, auraSlow: 0.4,
    desc: 'Verlangsamt alles in ihrer Nähe.',
  },
  wespe: {
    name: 'Kompostwespe', shape: 'floh', ai: 'orbiter',
    pal: { main: '#d9b154', accent: '#2a2218', eye: '#ff6b4a' },
    size: 14, hp: 18, dmg: 7, speed: 170, xp: 5, knollen: 2,
    flying: true, orbitDist: 170, attackCd: 1.5, range: 220,
    projectile: { speed: 330, size: 6, color: '#ffd93d', life: 1.6 },
    desc: 'Kreist um dich und sticht aus der Luft.',
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES);

/** Elite-Varianten. Werden auf einen normalen Gegner aufgesetzt. */
export const ELITES = {
  gross: {
    name: 'Riesige', color: '#c08a4a',
    mul: { hp: 3.2, dmg: 1.5, size: 1.5, xp: 3, knollen: 3.5 },
    add: { knockRes: 0.4 },
  },
  rasend: {
    name: 'Rasende', color: '#e8503a',
    mul: { hp: 1.5, speed: 1.65, dmg: 1.2, xp: 2, knollen: 2 },
  },
  gepanzert: {
    name: 'Gepanzerte', color: '#9fb0bd',
    mul: { hp: 2.2, xp: 2.2, knollen: 2.5 },
    add: { armor: 12, knockRes: 0.5 },
  },
  giftig: {
    name: 'Giftige', color: '#8fd14f',
    mul: { hp: 1.8, dmg: 1.2, xp: 2.2, knollen: 2.2 },
    flags: { poisonOnHit: 8 },
  },
  golden: {
    name: 'Goldene', color: '#f5cf3a',
    mul: { hp: 2.0, speed: 1.3, xp: 3, knollen: 9 },
    flags: { dropsGear: 0.5 },
  },
  brennend: {
    name: 'Brennende', color: '#ff8a3d',
    mul: { hp: 1.7, dmg: 1.15, xp: 2.2, knollen: 2.2 },
    flags: { burnOnHit: 9, trailCd: 0.5, trailDmg: 6, trailTime: 2.5 },
  },
  heilend: {
    name: 'Heilende', color: '#7bd44f',
    mul: { hp: 2.4, xp: 2.5, knollen: 2.5 },
    flags: { healsAllies: 6, auraRadius: 190 },
  },
};

export const ELITE_IDS = Object.keys(ELITES);

// --- Bosse -------------------------------------------------------------
//
// Jeder Boss hat Phasen. `at` ist der LP-Anteil, ab dem die Phase gilt.
// `moves` sind gewichtete Angriffe, die die KI reihum auswählt.

export const BOSSES = {
  kartoffelkoenig: {
    name: 'Der Kartoffelkönig', shape: 'koenig',
    pal: { main: '#c98f4e', accent: '#f0c93a', eye: '#ffd36b' },
    size: 58, hp: 1400, dmg: 22, speed: 62, xp: 180, knollen: 120,
    armor: 8, knockRes: 0.92,
    title: 'Herrscher des Kellers',
    phases: [
      { at: 1.0, moves: ['slam', 'summon'], speedMul: 1.0 },
      { at: 0.65, moves: ['slam', 'summon', 'sweep'], speedMul: 1.15 },
      { at: 0.3, moves: ['slam', 'sweep', 'rage', 'summon'], speedMul: 1.35 },
    ],
    moveDefs: {
      slam: { windup: 0.8, radius: 190, dmg: 34, cd: 3.4, tell: '#ff6b4a' },
      sweep: { windup: 0.6, count: 10, projSpeed: 230, dmg: 18, cd: 4.2, tell: '#ffd93d' },
      summon: { windup: 0.7, enemy: 'kaefer', count: 5, cd: 7.5, tell: '#8fd14f' },
      rage: { windup: 1.0, duration: 4, speedMul: 2.0, cd: 11, tell: '#e8503a' },
    },
  },

  schimmelmoloch: {
    name: 'Schimmelmoloch', shape: 'moloch',
    pal: { main: '#6b7a4a', accent: '#a8c060', eye: '#d0ff8a' },
    size: 64, hp: 2100, dmg: 26, speed: 46, xp: 240, knollen: 160,
    armor: 14, knockRes: 0.96,
    title: 'Was im Keller wuchs',
    phases: [
      { at: 1.0, moves: ['spores', 'charge'], speedMul: 1.0 },
      { at: 0.6, moves: ['spores', 'charge', 'split'], speedMul: 1.1 },
      { at: 0.25, moves: ['spores', 'split', 'burst'], speedMul: 1.2 },
    ],
    moveDefs: {
      spores: { windup: 0.7, count: 7, radius: 90, dmg: 14, poison: 10, cd: 4.5, tell: '#8fd14f' },
      charge: { windup: 0.9, speed: 460, duration: 1.3, dmg: 30, cd: 5.5, tell: '#ff6b4a' },
      split: { windup: 0.8, enemy: 'schimmel', count: 3, cd: 9, tell: '#a8c060' },
      burst: { windup: 1.1, radius: 280, dmg: 44, cd: 10, tell: '#d0ff8a' },
    },
  },

  grossefritteuse: {
    name: 'Die Große Fritteuse', shape: 'fritteuse',
    pal: { main: '#8a949e', accent: '#f0c24a', eye: '#ff6b4a' },
    size: 62, hp: 2600, dmg: 30, speed: 54, xp: 300, knollen: 210,
    armor: 18, knockRes: 1.0,
    title: 'Letzte Station jeder Kartoffel',
    phases: [
      { at: 1.0, moves: ['oilspray', 'stomp'], speedMul: 1.0 },
      { at: 0.6, moves: ['oilspray', 'stomp', 'flames'], speedMul: 1.1 },
      { at: 0.3, moves: ['flames', 'oilspray', 'overheat'], speedMul: 1.25 },
    ],
    moveDefs: {
      oilspray: { windup: 0.6, count: 14, projSpeed: 280, dmg: 20, burn: 10, cd: 4.0, tell: '#f0c24a' },
      stomp: { windup: 0.75, radius: 210, dmg: 38, cd: 4.5, tell: '#ff6b4a' },
      flames: { windup: 0.9, rings: 3, dmg: 26, burn: 12, cd: 7, tell: '#ff8a3d' },
      overheat: { windup: 1.3, duration: 5, radius: 320, dmg: 12, cd: 13, tell: '#ffe79a' },
    },
  },

  ruebenhexe: {
    name: 'Die Rübenhexe', shape: 'hexe',
    pal: { main: '#b06ef0', accent: '#4a3a6b', eye: '#d08aff' },
    size: 54, hp: 2300, dmg: 24, speed: 86, xp: 320, knollen: 230,
    armor: 10, knockRes: 0.9,
    title: 'Sie kennt jedes Beet',
    phases: [
      { at: 1.0, moves: ['hex', 'blink'], speedMul: 1.0 },
      { at: 0.65, moves: ['hex', 'blink', 'swarm'], speedMul: 1.15 },
      { at: 0.3, moves: ['hex', 'blink', 'swarm', 'curse'], speedMul: 1.3 },
    ],
    moveDefs: {
      hex: { windup: 0.55, count: 5, projSpeed: 300, dmg: 18, homing: 0.9, cd: 2.8, tell: '#d08aff' },
      blink: { windup: 0.35, dist: 320, cd: 4.0, tell: '#b06ef0' },
      swarm: { windup: 0.8, enemy: 'wespe', count: 4, cd: 8, tell: '#ffd93d' },
      curse: { windup: 1.0, radius: 260, dmg: 30, slow: 0.5, cd: 9.5, tell: '#7a6fd0' },
    },
  },

  knollenkoloss: {
    name: 'Knollenkoloss', shape: 'moloch',
    pal: { main: '#9a6b3a', accent: '#d9a05a', eye: '#ff8a3d' },
    size: 72, hp: 3600, dmg: 36, speed: 42, xp: 420, knollen: 300,
    armor: 24, knockRes: 1.0,
    title: 'Der Berg, der zurückschlägt',
    phases: [
      { at: 1.0, moves: ['quake', 'boulder'], speedMul: 1.0 },
      { at: 0.65, moves: ['quake', 'boulder', 'charge'], speedMul: 1.1 },
      { at: 0.3, moves: ['quake', 'boulder', 'charge', 'burst'], speedMul: 1.2 },
    ],
    moveDefs: {
      quake: { windup: 1.0, rings: 4, dmg: 32, cd: 5.5, tell: '#d9a05a' },
      boulder: { windup: 0.7, count: 6, projSpeed: 240, dmg: 26, radius: 90, cd: 4.2, tell: '#ff8a3d' },
      charge: { windup: 1.0, speed: 520, duration: 1.5, dmg: 40, cd: 7, tell: '#ff6b4a' },
      burst: { windup: 1.2, radius: 340, dmg: 50, cd: 12, tell: '#ffe79a' },
    },
  },
};

export const BOSS_IDS = Object.keys(BOSSES);
