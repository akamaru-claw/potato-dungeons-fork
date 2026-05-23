// ============================================================
// CONFIG.JS — Potato Dungeons Configuration
// ============================================================
const CONFIG = {
  // Dungeon dimensions — varied per floor
  ROOM_BASE_WIDTH: 800,
  ROOM_BASE_HEIGHT: 800,
  MIN_ROOM_SCALE: 1.0,
  MAX_ROOM_SCALE: 1.8,
  TILE_SIZE: 40,
  WALL_THICKNESS: 40,
  DOOR_WIDTH: 80,

  // Camera
  CAMERA: { MIN_ZOOM: 0.5, MAX_ZOOM: 2.0, DEFAULT_ZOOM: 1.0, SMOOTH_SPEED: 5 },

  // Player
  PLAYER: { SIZE: 18, BASE_SPEED: 180, BASE_HP: 12, INVINCIBILITY_TIME: 0.5, MAX_WEAPONS: 6, DODGE_BASE: 5, DASH_DURATION: 0.15, DASH_IFRAMES: 0.3, DASH_COOLDOWN: 1.5, DASH_SPEED: 600 },

  // XP & Leveling
  XP: { BASE_TO_LEVEL: 8, SCALING: 1.35, ORB_SIZE: 6, ORB_SPEED: 350 },

  // Gold (limited in dungeons — dropped by enemies)
  GOLD: { DROP_CHANCE: 0.25, BASE_DROP: 1 },

  // Tower / Floor progression
  TOWER: {
    START_FLOOR: 1,
    BOSS_EVERY: 10,       // Boss every 10 floors
    FLOOR_TIME_LIMIT: 60, // seconds per floor (0 = no limit)
    ENEMIES_BASE: 5,      // starting enemy count
    ENEMIES_PER_FLOOR: 2, // additional enemies per floor
    HP_SCALING: 0.15,     // enemy HP increase per floor
    DAMAGE_SCALING: 0.10, // enemy damage increase per floor
    SPEED_SCALING: 0.03,  // enemy speed increase per floor
  },

  // Dungeon themes per floor range
  THEMES: [
    { name: 'Stein-Dungeon', floorMin: 1, floorMax: 9, color: '#4a4a5a', wallColor: '#3a3a5a', floorColor: '#1e1e32', enemies: ['skeleton', 'slime', 'bat'] },
    { name: 'Höhle', floorMin: 10, floorMax: 19, color: '#3a5a3a', wallColor: '#2a4a28', floorColor: '#142a14', enemies: ['spider', 'cave_crawler', 'slime'] },
    { name: 'Festung', floorMin: 20, floorMax: 29, color: '#6a5a4a', wallColor: '#4a3a22', floorColor: '#2a1e10', enemies: ['knight', 'archer', 'skeleton'] },
    { name: 'Nether', floorMin: 30, floorMax: 39, color: '#6a2a2a', wallColor: '#4a1a1a', floorColor: '#2a0e0e', enemies: ['blaze', 'wither_skeleton', 'ghast'] },
    { name: 'End', floorMin: 40, floorMax: 999, color: '#3a3a6a', wallColor: '#1a1a4a', floorColor: '#0e0e28', enemies: ['enderman', 'shulker', 'dragon_minion'] },
  ],

  // Enemy definitions
  ENEMY_DEFS: {
    // --- Stone Dungeon ---
    skeleton:    { name: 'Skelett',    icon: '💀', hp: 8,  damage: 2, speed: 70,  size: 16, xp: 3, color: '#c8c8b0', colorDark: '#8a8a70', shape: 'circle', weight: 3, minFloor: 1, attackCooldown: 0 },
    slime:       { name: 'Schleim',    icon: '🟢', hp: 5,  damage: 1, speed: 50,  size: 14, xp: 2, color: '#66cc66', colorDark: '#337733', shape: 'circle', weight: 3, minFloor: 1, attackCooldown: 0 },
    bat:         { name: 'Fledermaus', icon: '🦇', hp: 3,  damage: 1, speed: 130, size: 10, xp: 2, color: '#8866aa', colorDark: '#553377', shape: 'triangle', weight: 2, minFloor: 1, attackCooldown: 0 },
    // --- Cave ---
    spider:      { name: 'Spinne',     icon: '🕷️', hp: 10, damage: 3, speed: 90,  size: 14, xp: 4, color: '#444433', colorDark: '#222211', shape: 'circle', weight: 3, minFloor: 10, attackCooldown: 0 },
    cave_crawler:{ name: 'Höhlenkrabbler', icon: '🪲', hp: 15, damage: 2, speed: 60,  size: 18, xp: 5, color: '#556644', colorDark: '#334422', shape: 'square', weight: 2, minFloor: 10, attackCooldown: 0 },
    // --- Fortress ---
    knight:      { name: 'Ritter',     icon: '🛡️', hp: 25, damage: 5, speed: 55,  size: 20, xp: 8, color: '#8888aa', colorDark: '#555577', shape: 'square', weight: 3, minFloor: 20, attackCooldown: 0 },
    archer:      { name: 'Bogenschütze', icon: '🏹', hp: 12, damage: 4, speed: 65,  size: 14, xp: 6, color: '#aa8866', colorDark: '#775533', shape: 'diamond', weight: 2, minFloor: 20, ranged: true, attackRange: 250, projectileSpeed: 200, attackCooldown: 2.0 },
    // --- Nether ---
    blaze:       { name: 'Lohe',       icon: '🔥', hp: 20, damage: 6, speed: 60,  size: 16, xp: 10, color: '#ffaa00', colorDark: '#cc7700', shape: 'diamond', weight: 3, minFloor: 30, ranged: true, attackRange: 200, projectileSpeed: 180, attackCooldown: 1.5 },
    wither_skeleton:{ name: 'Wither-Skelett', icon: '☠️', hp: 35, damage: 8, speed: 70, size: 22, xp: 12, color: '#333344', colorDark: '#111122', shape: 'triangle', weight: 2, minFloor: 30, attackCooldown: 0 },
    ghast:       { name: 'Ghast',      icon: '👻', hp: 15, damage: 10, speed: 40, size: 24, xp: 15, color: '#ddddcc', colorDark: '#aaaaaa', shape: 'circle', weight: 1, minFloor: 30, ranged: true, attackRange: 350, projectileSpeed: 150, attackCooldown: 3.0 },
    // --- End ---
    enderman:    { name: 'Enderman',   icon: '👁️', hp: 30, damage: 7, speed: 120, size: 20, xp: 15, color: '#1a1a2a', colorDark: '#0a0a1a', shape: 'diamond', weight: 3, minFloor: 40, charges: true, chargeSpeed: 300, chargeCooldown: 3 },
    shulker:     { name: 'Shulker',    icon: '📦', hp: 25, damage: 5, speed: 20,  size: 18, xp: 12, color: '#9955cc', colorDark: '#663399', shape: 'square', weight: 2, minFloor: 40, ranged: true, attackRange: 200, projectileSpeed: 120, attackCooldown: 2.5 },
    dragon_minion:{ name: 'Drachenwächter', icon: '🐲', hp: 50, damage: 12, speed: 80, size: 26, xp: 25, color: '#334455', colorDark: '#112233', shape: 'triangle', weight: 1, minFloor: 40, attackCooldown: 0 },
    // --- Bosses ---
    boss_stone:  { name: 'Stein-Golem', icon: '🗿', hp: 100, damage: 8, speed: 50,  size: 36, xp: 50, color: '#aaaacc', colorDark: '#666688', shape: 'circle', weight: 0, minFloor: 10, boss: true, elite: true, attackCooldown: 0 },
    boss_cave:   { name: 'Höhlen-Titan', icon: '🦎', hp: 200, damage: 12, speed: 45,  size: 40, xp: 80, color: '#558855', colorDark: '#335533', shape: 'circle', weight: 0, minFloor: 20, boss: true, elite: true, attackCooldown: 0 },
    boss_nether: { name: 'Nether-Lord', icon: '👹', hp: 350, damage: 18, speed: 55,  size: 44, xp: 120, color: '#ff6600', colorDark: '#cc3300', shape: 'diamond', weight: 0, minFloor: 30, boss: true, elite: true, attackCooldown: 0 },
    boss_end:    { name: 'Ender-Drache', icon: '🐉', hp: 500, damage: 25, speed: 65,  size: 48, xp: 200, color: '#6666cc', colorDark: '#333399', shape: 'triangle', weight: 0, minFloor: 40, boss: true, elite: true, attackCooldown: 0 },
  },

  // Weapon definitions — compatible with WeaponSystem (baseDamage, pellets, etc.)
  WEAPON_DEFS: {
    knife:       { icon: '🗡️', name: 'Messer',    type: 'melee',  baseDamage: 3,  attackSpeed: 0.3,  range: 55,  arc: 1.2,  knockback: 2,  tier: 0, projectileColor: '#ddd', projectileSize: 3, projectileSpeed: 350, spread: 0.1, tags: ['blade'] },
    sword:       { icon: '⚔️', name: 'Schwert',   type: 'melee',  baseDamage: 7,  attackSpeed: 0.5,  range: 75,  arc: 1.0,  knockback: 4,  tier: 1, projectileColor: '#aef', projectileSize: 3, projectileSpeed: 350, spread: 0.1, tags: ['blade'] },
    club:        { icon: '🏏', name: 'Keule',     type: 'melee',  baseDamage: 12, attackSpeed: 0.8,  range: 65,  arc: 0.8,  knockback: 8,  tier: 1, projectileColor: '#fa4', projectileSize: 4, projectileSpeed: 300, spread: 0.15, tags: ['heavy'] },
    hammer:      { icon: '🔨', name: 'Hammer',    type: 'melee',  baseDamage: 18, attackSpeed: 1.0,  range: 70,  arc: 0.9,  knockback: 12, tier: 3, projectileColor: '#fa4', projectileSize: 5, projectileSpeed: 250, spread: 0.15, tags: ['heavy'] },
    pistol:      { icon: '🔫', name: 'Pistole',   type: 'ranged', baseDamage: 5,  attackSpeed: 0.35, range: 250, projectileSpeed: 350, pierce: 0, tier: 0, projectileColor: '#ff8', projectileSize: 3, spread: 0.05, tags: ['ranged'] },
    shotgun:     { icon: '💥', name: 'Schrotflinte', type: 'ranged', baseDamage: 8, attackSpeed: 0.7, range: 120, projectileSpeed: 250, pierce: 0, tier: 2, pellets: 3, spread: 0.4, projectileColor: '#fa4', projectileSize: 3, tags: ['ranged'] },
    smg:         { icon: '🔧', name: 'SMG',       type: 'ranged', baseDamage: 3,  attackSpeed: 0.12, range: 200, projectileSpeed: 400, pierce: 0, tier: 1, projectileColor: '#8ff', projectileSize: 2, spread: 0.08, tags: ['ranged', 'fire'] },
    sniper:      { icon: '🎯', name: 'Sniper',    type: 'ranged', baseDamage: 20, attackSpeed: 1.2, range: 450, projectileSpeed: 600, pierce: 1, tier: 2, projectileColor: '#f88', projectileSize: 4, spread: 0.02, tags: ['ranged'] },
    shuriken:    { icon: '⭐', name: 'Shuriken',  type: 'ranged', baseDamage: 4,  attackSpeed: 0.15, range: 180, projectileSpeed: 300, pierce: 2, tier: 2, projectileColor: '#af4', projectileSize: 4, spinning: true, spread: 0.2, tags: ['blade', 'nature'] },
    crossbow:    { icon: '🏹', name: 'Armbrust',  type: 'ranged', baseDamage: 14, attackSpeed: 0.9, range: 300, projectileSpeed: 450, pierce: 1, tier: 2, projectileColor: '#faf', projectileSize: 3, spread: 0.05, tags: ['ranged'] },
  },

  // Reward definitions
  REWARDS: {
    WEAPONS: { weight: 30 },
    STAT_UP: { weight: 40 },
    HEAL:    { weight: 30 },
  },

  // Stat upgrade pool
  STAT_UPGRADES: [
    { stat: 'maxHp',     name: '+3 Max HP',       icon: '❤️', value: 3 },
    { stat: 'speed',     name: '+15% Speed',       icon: '👟', value: 15, percent: true },
    { stat: 'damage',    name: '+15% Damage',      icon: '⚔️', value: 15, percent: true },
    { stat: 'attackSpeed', name: '+10% Attack Speed', icon: '⚡', value: 10, percent: true },
    { stat: 'armor',     name: '+2 Armor',         icon: '🛡️', value: 2 },
    { stat: 'dodge',     name: '+5% Dodge',         icon: '💨', value: 5 },
    { stat: 'lifeSteal', name: '+3% Life Steal',   icon: '🧛', value: 3 },
    { stat: 'critChance', name: '+5% Crit',         icon: '💥', value: 5 },
    { stat: 'harvesting', name: '+15% Harvesting',  icon: '🌾', value: 15, percent: true },
  ],

  // Visual
  VISUAL: { SHADOW_ALPHA: 0.3, MAX_PARTICLES: 300, DAMAGE_NUMBER_SPEED: 80, MAX_FLOATING_TEXTS: 50 },

  // Colors
  COLORS: {
    HEALTH_HIGH: '#44dd66', HEALTH_MID: '#ddaa00', HEALTH_LOW: '#ff4466',
    XP_ORB: '#66ffaa', GOLD: '#ffd700', DODGE_COLOR: '#88aaff', HEAL_COLOR: '#44ff88',
    CRIT_COLOR: '#ff8800', GRID_SIZE: 40
  },

  // Relic definitions
  RELIC_DEFS: {
    salt_shaker:  { icon: '🧂', name: 'Salzstreuer', desc: '+50% Gold', tag: 'gold' },
    oven_glove:  { icon: '🧤', name: 'Ofenhandschuhe', desc: '+3 Damage, -10% Speed', tag: 'dmg_slow' },
    peel_knife:  { icon: '🔪', name: 'Schälmesser', desc: '5% Chance: DoT bei Treffer', tag: 'dot' },
    clover:      { icon: '🍀', name: 'Glücksklee', desc: '+1 Reroll pro Ebene', tag: 'reroll' },
    rabbit_foot: { icon: '🐇', name: 'Hasenfuß', desc: '<30% HP: +30% Dodge', tag: 'dodge' },
    hot_potato:  { icon: '🔥', name: 'Heiße Kartoffel', desc: '+15% ATK Speed pro Relikt', tag: 'speed' },
  },

  // Synergy tag definitions
  SYNERGY_TAGS: {
    blade:  { icon: '🗡️', desc: '2× Blade: +10% Crit', bonus2: 10 },
    ranged: { icon: '🏹', desc: '3× Ranged: +20% Range', bonus3: 20 },
    heavy:  { icon: '🔨', desc: '2× Heavy: +15% Knockback', bonus2: 15 },
    fire:   { icon: '🔥', desc: '2× Fire: +8% DoT', bonus2: 8 },
    nature: { icon: '🌿', desc: '2× Nature: +5% LifeSteal', bonus2: 5 },
  },

  // ============================================================
  // CHARACTER CLASSES
  // Each character has unique starting stats and a passive ability
  // Stats: hp, speed, damage, attackSpeed, armor, dodge, critChance, lifeSteal, maxWeapons
  // Stats are % modifications (except hp and maxWeapons which are absolute)
  // ============================================================
  CHARACTERS: {
    potato_default: {
      name: 'Kartoffel',
      icon: '🥔',
      desc: 'Ausgewogen. Der Allrounder.',
      price: 0,
      stats: {},  // defaults
      ability: null,
      abilityDesc: 'Keine Besonderheit — solid & zuverlässig.',
    },
    potato_fries: {
      name: 'Pommes',
      icon: '🍟',
      desc: 'Schnell und wendig, aber zerbrechlich.',
      price: 50,
      stats: { hp: -3, speed: 25, armor: -1 },
      ability: 'dash_master',
      abilityDesc: 'Dash-Cooldown 50% kürzer',
    },
    potato_sweet: {
      name: 'Süßkartoffel',
      icon: '🍠',
      desc: 'Heilt sich durch Angriffe.',
      price: 80,
      stats: { hp: 2, lifeSteal: 5, damage: -10 },
      ability: 'life_drain',
      abilityDesc: '+1 HP bei jedem 10. Kill',
    },
    potato_chips: {
      name: 'Chips',
      icon: '🥔',
      desc: 'Dünne Haut, extra Waffenslot.',
      price: 120,
      stats: { hp: -4, maxWeapons: 1, dodge: 8 },
      ability: 'extra_slot',
      abilityDesc: 'Startet mit +1 Waffenslot',
    },
    potato_golden: {
      name: 'Goldene Kartoffel',
      icon: '✨',
      desc: 'Gierig nach Gold — und glücklicher.',
      price: 200,
      stats: { damage: -15, critChance: 8 },
      ability: 'gold_rush',
      abilityDesc: '+100% Gold-Drops, kritische Treffer geben Gold',
    },
    potato_shadow: {
      name: 'Schattenknolle',
      icon: '🖤',
      desc: 'Unsichtbar und tödlich.',
      price: 300,
      stats: { hp: -4, critChance: 15, armor: -2 },
      ability: 'shadow_strike',
      abilityDesc: 'Erster Treffer nach Dash immer kritisch',
    },
    potato_rainbow: {
      name: 'Regenbogen-Kartoffel',
      icon: '🌈',
      desc: 'Allsynergy — passt überall rein.',
      price: 500,
      stats: { hp: -2, damage: 5, speed: 5 },
      ability: 'rainbow_soul',
      abilityDesc: 'Jede Waffe zählt für alle Synergien',
    },
    potato_devil: {
      name: 'Teufelskartoffel',
      icon: '😈',
      desc: 'Hohes Risiko, hoher Lohn.',
      price: 666,
      stats: { hp: -6, damage: 30, critChance: 10 },
      ability: 'devil_bargain',
      abilityDesc: '+5% Damage pro Waffe, aber -1 HP pro Ebene',
    },
  }
};