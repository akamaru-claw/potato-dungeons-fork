// Entitäten und ihre Pools.
//
// Nichts wird während eines Laufs neu allokiert: jeder Pool wird einmal mit
// fertigen Objekten gefüllt, `spawn` holt sich das nächste freie, `release`
// gibt es per Swap-Remove zurück. Deshalb haben alle Felder einen Default —
// ein wiederverwendetes Objekt darf keine Reste vom Vorgänger behalten.

export function createPool(capacity, factory, reset) {
  const items = new Array(capacity);
  for (let i = 0; i < capacity; i++) items[i] = factory();
  return {
    items,
    count: 0,
    capacity,
    reset,
    spawn() {
      if (this.count >= capacity) return null;
      const o = items[this.count++];
      this.reset(o);
      return o;
    },
    /** Element bei Index i freigeben. Nur beim Rückwärts-Iterieren nutzen. */
    release(i) {
      this.count--;
      const t = items[i];
      items[i] = items[this.count];
      items[this.count] = t;
    },
    clear() { this.count = 0; },
    forEach(fn) { for (let i = 0; i < this.count; i++) fn(items[i], i); },
  };
}

// --- Gegner ------------------------------------------------------------

const newEnemy = () => ({
  etype: 'enemy',
  id: '', name: '', shape: 'kaefer', ai: 'chase',
  x: 0, y: 0, vx: 0, vy: 0, facing: 0,
  r: 16, size: 16, spriteSize: 88,
  hp: 10, maxHp: 10, dmg: 5, speed: 80, baseSpeed: 80,
  armor: 0, knockRes: 0, critWeak: 1,
  xp: 1, knollen: 1,
  pal: null, tint: null,
  elite: null, eliteColor: null,
  boss: false, bossDef: null, phase: 0, moveName: null, moveTimer: 0, moveCd: 0,
  nextMove: 0, windup: 0, windupMove: null, tellColor: null,

  // KI-Zustand
  state: 0, stateT: 0, atkCd: 0, aiT: 0,
  targetX: 0, targetY: 0, orbitDir: 1, hopT: 0,
  trailT: 0, fuse: -1, hidden: false,

  // Statuseffekte
  burn: 0, burnT: 0, poison: 0, poisonT: 0,
  slow: 0, slowT: 0, stun: 0, frozen: 0,
  mark: 0,                   // Zeit, in der der Gegner markiert leuchtet
  hitFlash: 0, dmgTaken: 0,

  // Verwaltung
  alive: true, spawnT: 0, lifetime: 0, contactCd: 0,
  dropsGear: 0, burnOnHit: 0, poisonOnHit: 0, healsAllies: 0, auraRadius: 0,
  trailDmg: 0, trailTime: 0, trailCd: 0,
  summons: null, summonCount: 0,
  projectile: null, range: 0, keepDist: 0,
  chargeSpeed: 0, chargeWindup: 0, chargeTime: 0, chargeCd: 0,
  blastRadius: 0, teleportCd: 0, burrowCd: 0, burrowTime: 0,
  pullForce: 0, orbitDist: 0, auraSlow: 0, flying: false, dodgeChance: 0,
  hopTime: 0, hopDist: 0, attackCd: 0,
  lastHitBy: null,
  // Akkumulatoren für periodische Ticks
  statusAcc: 0, poisonAcc: 0, hazardAcc: 0, healAcc: 0, overheatAcc: 0,
  lostX: 0, lostY: 0, lostT: 0,
});

const resetEnemy = (e) => {
  e.vx = 0; e.vy = 0; e.facing = 0;
  e.armor = 0; e.knockRes = 0; e.critWeak = 1;
  e.elite = null; e.eliteColor = null; e.tint = null;
  e.boss = false; e.bossDef = null; e.phase = 0;
  e.moveName = null; e.moveTimer = 0; e.moveCd = 0; e.nextMove = 0;
  e.windup = 0; e.windupMove = null; e.tellColor = null;
  e.state = 0; e.stateT = 0; e.atkCd = 0; e.aiT = Math.random() * 3;
  e.orbitDir = Math.random() < 0.5 ? 1 : -1;
  e.hopT = 0; e.trailT = 0; e.fuse = -1; e.hidden = false;
  e.burn = 0; e.burnT = 0; e.poison = 0; e.poisonT = 0;
  e.slow = 0; e.slowT = 0; e.stun = 0; e.frozen = 0; e.mark = 0;
  e.hitFlash = 0; e.dmgTaken = 0;
  e.alive = true; e.spawnT = 0.35; e.lifetime = 0; e.contactCd = 0;
  e.dropsGear = 0; e.burnOnHit = 0; e.poisonOnHit = 0; e.healsAllies = 0; e.auraRadius = 0;
  e.trailDmg = 0; e.trailTime = 0; e.trailCd = 0;
  e.summons = null; e.summonCount = 0;
  e.projectile = null; e.range = 0; e.keepDist = 0;
  e.chargeSpeed = 0; e.chargeWindup = 0; e.chargeTime = 0; e.chargeCd = 0;
  e.blastRadius = 0; e.teleportCd = 0; e.burrowCd = 0; e.burrowTime = 0;
  e.pullForce = 0; e.orbitDist = 0; e.auraSlow = 0; e.flying = false; e.dodgeChance = 0;
  e.hopTime = 0; e.hopDist = 0; e.attackCd = 0;
  e.lastHitBy = null;
  e.statusAcc = 0; e.poisonAcc = 0; e.hazardAcc = 0; e.healAcc = 0; e.overheatAcc = 0;
  e.lostX = 0; e.lostY = 0; e.lostT = 0;
};

// --- Projektile --------------------------------------------------------

const newProjectile = () => ({
  x: 0, y: 0, vx: 0, vy: 0, r: 6,
  dmg: 0, type: 'ranged', color: '#fff',
  pierce: 0, hitIds: null, bounce: 0,
  life: 2, maxLife: 2, traveled: 0, range: 9999,
  hostile: false, homing: 0, target: null,
  area: 0, burn: 0, burnT: 0, poison: 0, poisonT: 0, slow: 0, slowT: 0,
  knock: 0, crit: false, source: null, weapon: null,
  boomerang: 0, originX: 0, originY: 0, returning: false,
  spin: 0, rot: 0, trailColor: null, cloud: 0,
  alive: true, sprite: null, glow: true, gravity: 0,
});

const resetProjectile = (p) => {
  p.pierce = 0; p.bounce = 0; p.hostile = false; p.homing = 0; p.target = null;
  p.area = 0; p.burn = 0; p.burnT = 0; p.poison = 0; p.poisonT = 0;
  p.slow = 0; p.slowT = 0; p.knock = 0; p.crit = false;
  p.source = null; p.weapon = null; p.boomerang = 0; p.returning = false;
  p.spin = 0; p.rot = 0; p.trailColor = null; p.cloud = 0;
  p.traveled = 0; p.range = 9999; p.alive = true; p.glow = true; p.gravity = 0;
  if (p.hitIds) p.hitIds.length = 0; else p.hitIds = [];
};

// --- Aufsammelbares ---------------------------------------------------

const newPickup = () => ({
  x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0,
  kind: 'knolle', value: 1, r: 10,
  life: 40, bob: 0, magnet: false, gear: null,
  alive: true, spawnT: 0,
});

const resetPickup = (p) => {
  p.z = 0; p.vz = 0; p.bob = Math.random() * 6.28;
  p.magnet = false; p.gear = null; p.life = 40; p.alive = true; p.spawnT = 0.25;
};

// --- Bodenflächen (Heilung, Wurzeln, Feuer, Gift, Gefahren) -----------

const newField = () => ({
  x: 0, y: 0, radius: 60, kind: 'fire',
  duration: 3, maxDuration: 3,
  dmgPerSec: 0, healPerSec: 0, slow: 0, burn: 0, poison: 0,
  color: '#ff8a3d', hostile: true, tickT: 0, pulse: 0,
  damagesEnemies: true, damagesPlayer: true, permanent: false,
  alive: true,
});

const resetField = (f) => {
  f.dmgPerSec = 0; f.healPerSec = 0; f.slow = 0; f.burn = 0; f.poison = 0;
  f.hostile = true; f.tickT = 0; f.pulse = Math.random() * 6.28;
  f.damagesEnemies = true; f.damagesPlayer = true; f.permanent = false;
  f.alive = true;
};

// --- Verbündete, Türme, Minen, Bomben ---------------------------------

const newAlly = () => ({
  etype: 'ally',
  x: 0, y: 0, vx: 0, vy: 0, facing: 0, r: 14,
  hp: 30, maxHp: 30, dmg: 10, speed: 210,
  atkCd: 0, atkRate: 0.8, life: 18, target: null,
  hitFlash: 0, alive: true, spawnT: 0.3,
});
const resetAlly = (a) => {
  a.vx = 0; a.vy = 0; a.atkCd = 0; a.target = null;
  a.hitFlash = 0; a.alive = true; a.spawnT = 0.3;
};

const newTurret = () => ({
  etype: 'turret',
  x: 0, y: 0, facing: 0, r: 15,
  dmg: 10, range: 280, cd: 0, rate: 0.6, life: 16, maxLife: 16,
  projSpeed: 600, color: '#6fe0c0', weapon: null,
  shots: 0, alive: true, spawnT: 0.3,
});
const resetTurret = (t) => {
  t.facing = 0; t.cd = 0; t.shots = 0; t.alive = true; t.spawnT = 0.3; t.weapon = null;
};

const newMine = () => ({
  x: 0, y: 0, r: 11,
  dmg: 30, area: 90, armTime: 0.5, life: 30,
  color: '#e8a03a', weapon: null, pulse: 0, triggered: -1,
  alive: true,
});
const resetMine = (m) => {
  m.pulse = 0; m.triggered = -1; m.alive = true; m.weapon = null; m.life = 30;
};

const newBomb = () => ({
  x: 0, y: 0, z: -40, vz: 0, r: 12,
  fuse: 1.2, onBoom: null, color: '#d9943a', alive: true,
});
const resetBomb = (b) => { b.z = -46; b.vz = 0; b.onBoom = null; b.alive = true; };

const newRocket = () => ({
  x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0,
  t: 0, dur: 0.5, color: '#ff8a3d', alive: true,
});
const resetRocket = (r) => { r.t = 0; r.alive = true; };

/** Kreisende Klingen (orbit-Waffen). */
const newOrbiter = () => ({
  angle: 0, radius: 70, speed: 3, dmg: 8, r: 14,
  weapon: null, color: '#fff', hitCd: 0, alive: true,
  x: 0, y: 0,
});
const resetOrbiter = (o) => { o.hitCd = 0; o.alive = true; };

/** Kurzlebige Nahkampf-Trefferzonen, die auch gezeichnet werden. */
const newSwipe = () => ({
  x: 0, y: 0, angle: 0, radius: 90, arc: 1.4,
  life: 0.18, maxLife: 0.18, color: '#fff', kind: 'arc',
  width: 20, length: 120, alive: true,
});
const resetSwipe = (s) => { s.alive = true; };

/** Verzögerte Rückrufe — ersetzt setTimeout, damit Pause wirklich pausiert. */
const newTimer = () => ({ t: 0, fn: null, alive: true });
const resetTimer = (t) => { t.fn = null; t.alive = true; };

/** Blitz-Striche, rein optisch. */
const newBolt = () => ({
  x1: 0, y1: 0, x2: 0, y2: 0, life: 0.2, maxLife: 0.2,
  color: '#9ef0ff', seed: 0, alive: true,
});
const resetBolt = (b) => { b.seed = (Math.random() * 1e9) | 0; b.alive = true; };

export function createEntityPools() {
  return {
    enemies: createPool(260, newEnemy, resetEnemy),
    projectiles: createPool(420, newProjectile, resetProjectile),
    hostileProjectiles: createPool(260, newProjectile, resetProjectile),
    pickups: createPool(520, newPickup, resetPickup),
    fields: createPool(90, newField, resetField),
    allies: createPool(16, newAlly, resetAlly),
    turrets: createPool(14, newTurret, resetTurret),
    mines: createPool(28, newMine, resetMine),
    bombs: createPool(16, newBomb, resetBomb),
    rockets: createPool(16, newRocket, resetRocket),
    orbiters: createPool(40, newOrbiter, resetOrbiter),
    swipes: createPool(60, newSwipe, resetSwipe),
    timers: createPool(120, newTimer, resetTimer),
    bolts: createPool(60, newBolt, resetBolt),
  };
}

/** Räumt alles ab, was nicht über Wellengrenzen bestehen bleiben soll. */
export function clearTransientEntities(pools, { keepPickups = false } = {}) {
  pools.enemies.clear();
  pools.projectiles.clear();
  pools.hostileProjectiles.clear();
  pools.fields.clear();
  pools.allies.clear();
  pools.turrets.clear();
  pools.mines.clear();
  pools.bombs.clear();
  pools.rockets.clear();
  pools.swipes.clear();
  pools.timers.clear();
  pools.bolts.clear();
  if (!keepPickups) pools.pickups.clear();
}
