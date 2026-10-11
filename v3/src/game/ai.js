// Gegner: Erzeugung, Skalierung, Verhalten, Bosse.

import {
  TAU, clamp, dist, dist2, angleTo, angleDiff, angleTowards,
} from '../core/math.js';
import { vfxRng } from '../core/rng.js';
import {
  burst, ring, notice, dust, smoke, trail, addShake, addFlash, damageText,
} from '../core/fx.js';
import { sfx, setMusicMood, music } from '../core/audio.js';
import { ENEMIES, ELITES, BOSSES } from '../data/enemies.js';
import { mix, shade } from '../core/sprites.js';
import { G } from './state.js';
import { collideCircle, pickSpawnPoint, hazardAt } from './dungeon.js';
import {
  dealDamage, damagePlayer, applyStatus, spawnProjectile, tickEnemyStatus,
  areaDamage, nearestEnemy, forEnemiesInRadius, spawnField, delay, lightning,
} from './combat.js';
import { HAZARDS } from '../data/biomes.js';

// --- Skalierung --------------------------------------------------------

/** Gegner-Lebenspunkte über die Wellen. Bewusst überlinear ab Welle 10. */
export function hpScale(wave) {
  return (1 + wave * 0.26 + Math.pow(wave, 1.7) * 0.014) * G.difficulty.hpMul;
}
export function dmgScale(wave) {
  return (1 + wave * 0.11 + Math.pow(wave, 1.4) * 0.004) * G.difficulty.dmgMul;
}
const speedScale = (wave) => 1 + Math.min(0.3, wave * 0.012);
const rewardScale = (wave) => 1 + wave * 0.1;

// --- Erzeugen ----------------------------------------------------------

export function spawnEnemy(id, x, y, opts = {}) {
  const def = ENEMIES[id];
  if (!def) return null;
  const e = G.pools.enemies.spawn();
  if (!e) return null;

  const wave = opts.wave != null ? opts.wave : G.wave;
  e.id = id;
  e.name = def.name;
  e.shape = def.shape;
  e.ai = def.ai;
  e.pal = def.pal;
  e.x = x; e.y = y;
  e.size = def.size;
  e.r = def.size;
  e.spriteSize = Math.max(64, Math.round(def.size * 5));
  e.maxHp = e.hp = def.hp * hpScale(wave);
  e.dmg = def.dmg * dmgScale(wave);
  e.baseSpeed = e.speed = def.speed * speedScale(wave);
  e.armor = (def.armor || 0) * (1 + wave * 0.05);
  e.knockRes = def.knockRes || 0;
  e.critWeak = def.critWeak || 1;
  e.xp = def.xp * rewardScale(wave);
  e.knollen = def.knollen * rewardScale(wave);
  e.flying = !!def.flying;
  e.dodgeChance = def.dodgeChance || 0;

  // Verhaltens-Parameter
  e.attackCd = def.attackCd || 0;
  e.atkCd = vfxRng.range(0, def.attackCd || 1);
  e.range = (def.range || 0);
  e.keepDist = def.keepDist || 0;
  e.projectile = def.projectile || null;
  e.chargeSpeed = def.chargeSpeed || 0;
  e.chargeWindup = def.chargeWindup || 0;
  e.chargeTime = def.chargeTime || 0;
  e.chargeCd = def.chargeCd || 0;
  e.blastRadius = def.blastRadius || 0;
  e.fuse = -1;
  e.teleportCd = def.teleportCd || 0;
  e.burrowCd = def.burrowCd || 0;
  e.burrowTime = def.burrowTime || 0;
  e.pullForce = def.pullForce || 0;
  e.orbitDist = def.orbitDist || 0;
  e.auraRadius = def.auraRadius || 0;
  e.auraSlow = def.auraSlow || 0;
  e.trailCd = def.trailCd || 0;
  e.trailDmg = (def.trailDmg || 0) * dmgScale(wave);
  e.trailTime = def.trailTime || 0;
  e.summons = def.summons || null;
  e.summonCount = def.summonCount || 0;
  e.hopTime = def.hopTime || 0.5;
  e.hopDist = def.hopDist || 100;

  // Elite-Aufsatz
  if (opts.elite) {
    const el = ELITES[opts.elite];
    if (el) {
      e.elite = opts.elite;
      e.eliteColor = el.color;
      if (el.mul) {
        if (el.mul.hp) { e.maxHp *= el.mul.hp; e.hp = e.maxHp; }
        if (el.mul.dmg) e.dmg *= el.mul.dmg;
        if (el.mul.speed) { e.baseSpeed *= el.mul.speed; e.speed = e.baseSpeed; }
        if (el.mul.size) { e.size *= el.mul.size; e.r = e.size; e.spriteSize = Math.max(64, Math.round(e.size * 5)); }
        if (el.mul.xp) e.xp *= el.mul.xp;
        if (el.mul.knollen) e.knollen *= el.mul.knollen;
      }
      if (el.add) {
        if (el.add.armor) e.armor += el.add.armor;
        if (el.add.knockRes) e.knockRes = Math.min(0.98, e.knockRes + el.add.knockRes);
      }
      if (el.flags) {
        for (const k in el.flags) e[k] = el.flags[k];
        if (el.flags.trailDmg) e.trailDmg = el.flags.trailDmg * dmgScale(wave);
      }
      e.pal = {
        main: mix(def.pal.main, el.color, 0.45),
        accent: el.color,
        eye: def.pal.eye,
      };
      // Elite-Auftritt
      ring(x, y, 6, e.r * 3.4, { color: el.color, life: 0.5, width: 5 });
    }
  }

  e.spawnT = 0.42;
  dust(x, y, e.r * 1.2);
  return e;
}

export function spawnBoss(bossId, x, y) {
  const def = BOSSES[bossId];
  if (!def) return null;
  const e = G.pools.enemies.spawn();
  if (!e) return null;
  const wave = G.wave;

  e.id = bossId;
  e.name = def.name;
  e.shape = def.shape;
  e.ai = 'boss';
  e.pal = def.pal;
  e.x = x; e.y = y;
  e.size = def.size;
  e.r = def.size;
  e.spriteSize = Math.max(180, Math.round(def.size * 4.2));
  e.boss = true;
  e.bossDef = def;
  e.maxHp = e.hp = def.hp * (0.7 + hpScale(wave) * 0.42);
  e.dmg = def.dmg * dmgScale(wave);
  e.baseSpeed = e.speed = def.speed;
  e.armor = def.armor || 0;
  e.knockRes = def.knockRes != null ? def.knockRes : 0.95;
  e.xp = def.xp;
  e.knollen = def.knollen * (1 + wave * 0.04) * G.difficulty.lootMul;
  e.phase = 0;
  e.nextMove = 1.4;
  e.spawnT = 1.2;

  G.bossRef = e;
  addShake(26);
  addFlash('#ffffff', 0.45, 2);
  sfx('bossRoar');
  setMusicMood('boss', 1);
  notice(x, y - def.size - 50, def.name, '#ff6b4a', 30);
  return e;
}

// --- Haupt-Update ------------------------------------------------------

export function updateEnemies(dt) {
  const pool = G.pools.enemies;
  const p = G.player;
  const arena = G.arena;
  const invisible = p.buffs.invis && p.buffs.invis.t > 0;

  for (let i = pool.count - 1; i >= 0; i--) {
    const e = pool.items[i];

    if (!e.alive) {
      pool.release(i);
      continue;
    }

    tickEnemyStatus(e, dt);
    if (!e.alive) { pool.release(i); continue; }

    if (e.spawnT > 0) {
      e.spawnT -= dt;
      continue;
    }

    e.lifetime += dt;
    e.aiT += dt;

    // Tempo mit Verlangsamung
    e.speed = e.baseSpeed * (1 - clamp(e.slow, 0, 0.85));
    if (G.globalSlowT > 0) e.speed *= 0.4;

    const stunned = e.stun > 0 || e.frozen > 0;

    // Zielposition: unsichtbarer Spieler wird nur vermutet
    let tx = p.x, ty = p.y;
    if (invisible) {
      if (!e.lostT || e.lostT <= 0) {
        e.lostX = p.x + vfxRng.range(-260, 260);
        e.lostY = p.y + vfxRng.range(-260, 260);
        e.lostT = 1.2;
      }
      e.lostT -= dt;
      tx = e.lostX; ty = e.lostY;
    }

    if (!stunned) {
      if (e.boss) updateBoss(e, dt, tx, ty);
      else runBehavior(e, dt, tx, ty);
    } else {
      e.vx *= Math.exp(-6 * dt);
      e.vy *= Math.exp(-6 * dt);
    }

    // Bewegung + Reibung
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const friction = e.state === ST_CHARGE ? 1.5 : 7;
    e.vx *= Math.exp(-friction * dt);
    e.vy *= Math.exp(-friction * dt);

    if (arena && !e.hidden) collideCircle(arena, e, e.r, e.flying);

    // Gegner stoßen sich gegenseitig ab, damit sie nicht stapeln
    separate(e, pool, dt);

    // Gefahren auf dem Boden
    if (arena && !e.flying) {
      const hz = hazardAt(arena, e.x, e.y, e.r * 0.4);
      if (hz) {
        const hd = HAZARDS[hz.type];
        if (hd && hd.damagesEnemies) {
          e.hazardAcc = (e.hazardAcc || 0) + dt;
          if (e.hazardAcc >= 0.3) {
            e.hazardAcc = 0;
            dealDamage(e, hd.dmgPerSec * 0.3, { type: 'elem', source: 'hazard', silent: true, noEffects: true });
            if (!e.alive) { pool.release(i); continue; }
          }
          if (hd.slow) applyStatus(e, 'slow', 0.4, hd.slow);
        }
      }
    }

    // Feuerspur
    if (e.trailCd > 0 && e.trailDmg > 0) {
      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = e.trailCd;
        spawnField(e.x, e.y, {
          kind: 'fire', radius: e.r * 1.5, duration: e.trailTime || 3,
          dmgPerSec: e.trailDmg, color: '#ff8a3d',
          hostile: true, damagesEnemies: false,
        });
      }
    }

    // Frost-/Heil-Aura
    if (e.auraRadius > 0) {
      if (e.auraSlow > 0) {
        if (dist2(e.x, e.y, p.x, p.y) < e.auraRadius * e.auraRadius) {
          G.player.buffs.chill = { t: 0.3, v: e.auraSlow };
        }
      }
      if (e.healsAllies > 0) {
        e.healAcc = (e.healAcc || 0) + dt;
        if (e.healAcc >= 0.5) {
          e.healAcc = 0;
          forEnemiesInRadius(e.x, e.y, e.auraRadius, (o) => {
            if (o !== e && o.hp < o.maxHp) {
              o.hp = Math.min(o.maxHp, o.hp + e.healsAllies);
              trail(o.x, o.y - o.r, '#7bd44f', 5, 0.4);
            }
          });
        }
      }
    }

    // Kontaktschaden
    if (!e.hidden && e.contactCd <= 0) {
      const rr = e.r + p.r;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        const dealt = damagePlayer(e.dmg, { attacker: e, source: 'contact' });
        if (dealt > 0) {
          e.contactCd = 0.55;
          if (e.burnOnHit) G.player.buffs.burning = { t: 3, v: e.burnOnHit };
          if (e.poisonOnHit) G.player.buffs.poisoned = { t: 4, v: e.poisonOnHit };
          // Gegner prallt leicht ab, damit man nicht im Körper klebt
          const a = angleTo(p.x, p.y, e.x, e.y);
          e.vx += Math.cos(a) * 150;
          e.vy += Math.sin(a) * 150;
        }
      }
    }

    // Blickrichtung für die Darstellung
    if (Math.abs(e.vx) > 6) e.facing = e.vx > 0 ? 0 : Math.PI;
  }
}

/** Gegenseitiges Abstoßen — billig gehalten, nur Nachbarn im Pool. */
function separate(e, pool, dt) {
  const step = 1;
  const idx = pool.items.indexOf(e);
  const start = Math.max(0, idx - 6), end = Math.min(pool.count, idx + 7);
  for (let k = start; k < end; k += step) {
    const o = pool.items[k];
    if (o === e || !o.alive || o.hidden) continue;
    const rr = (e.r + o.r) * 0.86;
    const dx = e.x - o.x, dy = e.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr || d2 < 1e-4) continue;
    const d = Math.sqrt(d2);
    const push = (rr - d) / rr;
    const w = o.boss ? 0 : e.boss ? 1 : 0.5;
    const f = 170 * push * dt * 60 * 0.016;
    e.vx += (dx / d) * f * (1 - w * 0);
    e.vy += (dy / d) * f;
  }
}

// --- Verhaltenszustände ------------------------------------------------

const ST_IDLE = 0, ST_WINDUP = 1, ST_CHARGE = 2, ST_RECOVER = 3,
  ST_HIDDEN = 4, ST_HOP_WAIT = 5, ST_HOP = 6;

function moveToward(e, tx, ty, mul = 1) {
  const a = angleTo(e.x, e.y, tx, ty);
  e.vx += Math.cos(a) * e.speed * mul * 9 * (1 / 60);
  e.vy += Math.sin(a) * e.speed * mul * 9 * (1 / 60);
  // Zielgeschwindigkeit begrenzen
  const sp = Math.hypot(e.vx, e.vy);
  const max = e.speed * mul;
  if (sp > max) { e.vx = (e.vx / sp) * max; e.vy = (e.vy / sp) * max; }
}

function setVel(e, angle, speed) {
  e.vx = Math.cos(angle) * speed;
  e.vy = Math.sin(angle) * speed;
}

function runBehavior(e, dt, tx, ty) {
  const p = G.player;
  const d = dist(e.x, e.y, tx, ty);

  switch (e.ai) {
    case 'chase':
      moveToward(e, tx, ty);
      break;

    case 'tank':
      moveToward(e, tx, ty, 1);
      break;

    case 'hop':
      if (e.state === ST_HOP) {
        e.stateT -= dt;
        if (e.stateT <= 0) { e.state = ST_HOP_WAIT; e.stateT = e.hopTime * vfxRng.range(0.7, 1.3); }
      } else {
        e.stateT -= dt;
        e.vx *= Math.exp(-10 * dt); e.vy *= Math.exp(-10 * dt);
        if (e.stateT <= 0) {
          e.state = ST_HOP;
          e.stateT = 0.3;
          const a = angleTo(e.x, e.y, tx, ty) + vfxRng.range(-0.3, 0.3);
          setVel(e, a, e.hopDist * 3.4);
          dust(e.x, e.y, e.r);
          sfx('roll', { gain: 0.25, pitch: 1.6 });
        }
      }
      break;

    case 'shooter': {
      const keep = e.keepDist || 240;
      if (d > keep * 1.15) moveToward(e, tx, ty);
      else if (d < keep * 0.75) moveToward(e, e.x * 2 - tx, e.y * 2 - ty, 0.8);
      else {
        // Seitwärts ausweichen statt stehen
        const a = angleTo(e.x, e.y, tx, ty) + Math.PI / 2 * e.orbitDir;
        moveToward(e, e.x + Math.cos(a) * 100, e.y + Math.sin(a) * 100, 0.5);
        if (vfxRng.chance(dt * 0.4)) e.orbitDir *= -1;
      }
      e.atkCd -= dt;
      if (e.atkCd <= 0 && d < e.range) {
        e.atkCd = e.attackCd;
        shootAtPlayer(e, 1);
      }
      break;
    }

    case 'orbiter': {
      const keep = e.orbitDist || 170;
      const toP = angleTo(e.x, e.y, tx, ty);
      const tangent = toP + (Math.PI / 2) * e.orbitDir;
      const radial = d > keep ? 1 : -1;
      const ax = Math.cos(tangent) * 0.8 + Math.cos(toP) * radial * 0.6;
      const ay = Math.sin(tangent) * 0.8 + Math.sin(toP) * radial * 0.6;
      moveToward(e, e.x + ax * 120, e.y + ay * 120);
      e.atkCd -= dt;
      if (e.atkCd <= 0 && d < e.range) {
        e.atkCd = e.attackCd;
        shootAtPlayer(e, 1);
      }
      break;
    }

    case 'charger':
      if (e.state === ST_IDLE) {
        moveToward(e, tx, ty, 0.65);
        e.atkCd -= dt;
        if (e.atkCd <= 0 && d < 420) {
          e.state = ST_WINDUP;
          e.stateT = e.chargeWindup;
          e.targetX = tx; e.targetY = ty;
        }
      } else if (e.state === ST_WINDUP) {
        e.stateT -= dt;
        e.vx *= Math.exp(-8 * dt); e.vy *= Math.exp(-8 * dt);
        // Richtung bis zuletzt leicht nachführen
        e.targetX = e.targetX * 0.9 + tx * 0.1;
        e.targetY = e.targetY * 0.9 + ty * 0.1;
        if (vfxRng.chance(dt * 18)) trail(e.x, e.y, '#ff6b4a', 6, 0.25);
        if (e.stateT <= 0) {
          e.state = ST_CHARGE;
          e.stateT = e.chargeTime;
          setVel(e, angleTo(e.x, e.y, e.targetX, e.targetY), e.chargeSpeed);
          dust(e.x, e.y, e.r * 1.4, '#ff9a6a');
          sfx('roll', { pitch: 0.8 });
        }
      } else if (e.state === ST_CHARGE) {
        e.stateT -= dt;
        if (vfxRng.chance(dt * 30)) trail(e.x, e.y, '#ff9a6a', 7, 0.3);
        if (e.stateT <= 0) { e.state = ST_RECOVER; e.stateT = 0.45; }
      } else {
        e.stateT -= dt;
        e.vx *= Math.exp(-7 * dt); e.vy *= Math.exp(-7 * dt);
        if (e.stateT <= 0) { e.state = ST_IDLE; e.atkCd = e.chargeCd; }
      }
      break;

    case 'exploder':
      moveToward(e, tx, ty, 1.05);
      if (e.fuse < 0 && d < e.r + p.r + 40) {
        e.fuse = ENEMIES[e.id] ? (ENEMIES[e.id].fuse || 0.75) : 0.75;
        sfx('ui', { pitch: 2 });
      }
      if (e.fuse >= 0) {
        e.fuse -= dt;
        e.vx *= Math.exp(-3 * dt); e.vy *= Math.exp(-3 * dt);
        if (vfxRng.chance(dt * 26)) trail(e.x, e.y - e.r, '#c0f06a', 7, 0.25);
        if (e.fuse <= 0) {
          e.hp = 0;
          dealDamage(e, 1e9, { silent: true, noEffects: true, source: 'selfdestruct' });
        }
      }
      break;

    case 'teleporter':
      moveToward(e, tx, ty, 0.75);
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.teleportCd * vfxRng.range(0.8, 1.3);
        const a = vfxRng.angle();
        const nx = tx + Math.cos(a) * vfxRng.range(90, 190);
        const ny = ty + Math.sin(a) * vfxRng.range(90, 190);
        burst(e.x, e.y, 12, { color: '#9ef0ff', speed: 170, life: 0.4 });
        e.x = nx; e.y = ny;
        burst(e.x, e.y, 12, { color: '#9ef0ff', speed: 170, life: 0.4 });
        sfx('teleport', { gain: 0.6 });
      }
      break;

    case 'burrow':
      if (e.state === ST_HIDDEN) {
        e.stateT -= dt;
        e.hidden = true;
        if (vfxRng.chance(dt * 20)) dust(e.x, e.y, 14, '#5a4a38');
        // Unter der Erde direkt zum Spieler
        const a = angleTo(e.x, e.y, tx, ty);
        e.x += Math.cos(a) * e.speed * 1.8 * dt;
        e.y += Math.sin(a) * e.speed * 1.8 * dt;
        if (e.stateT <= 0) {
          e.hidden = false;
          e.state = ST_IDLE;
          e.atkCd = e.burrowCd * vfxRng.range(0.8, 1.2);
          dust(e.x, e.y, e.r * 1.8, '#5a4a38');
          sfx('heavy', { gain: 0.5, pitch: 1.4 });
          // Überraschungsschlag
          if (dist(e.x, e.y, G.player.x, G.player.y) < e.r + G.player.r + 20) {
            damagePlayer(e.dmg * 1.3, { attacker: e, source: 'ambush' });
          }
        }
      } else {
        moveToward(e, tx, ty);
        e.atkCd -= dt;
        if (e.atkCd <= 0 && d > 120) {
          e.state = ST_HIDDEN;
          e.stateT = e.burrowTime;
          dust(e.x, e.y, e.r * 1.6, '#5a4a38');
        }
      }
      break;

    case 'puller': {
      const keep = 230;
      if (d > keep * 1.2) moveToward(e, tx, ty, 0.8);
      else if (d < keep * 0.6) moveToward(e, e.x * 2 - tx, e.y * 2 - ty, 0.6);
      e.atkCd -= dt;
      if (e.atkCd <= 0 && d < e.range) {
        e.atkCd = e.attackCd;
        const a = angleTo(G.player.x, G.player.y, e.x, e.y);
        G.player.vx += Math.cos(a) * e.pullForce;
        G.player.vy += Math.sin(a) * e.pullForce;
        lightning(e.x, e.y, G.player.x, G.player.y, '#8fd14f');
        notice(e.x, e.y - e.r - 10, 'Ranke!', '#8fd14f', 14);
        sfx('swing', { pitch: 0.7 });
      }
      break;
    }

    case 'summoner': {
      const keep = e.keepDist || 320;
      if (d < keep * 0.85) moveToward(e, e.x * 2 - tx, e.y * 2 - ty, 0.9);
      else if (d > keep * 1.3) moveToward(e, tx, ty, 0.7);
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.attackCd;
        const n = e.summonCount || 2;
        ring(e.x, e.y, 10, 90, { color: '#d08aff', life: 0.5 });
        sfx('summon');
        for (let i = 0; i < n; i++) {
          const a = vfxRng.angle();
          delay(i * 0.12, () => {
            if (!e.alive) return;
            spawnEnemy(e.summons || 'kaefer', e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46, {
              wave: Math.max(1, G.wave - 2),
            });
          });
        }
      }
      break;
    }

    case 'firetrail':
      moveToward(e, tx, ty);
      break;

    case 'aura':
      moveToward(e, tx, ty, 0.9);
      break;

    default:
      moveToward(e, tx, ty);
      break;
  }
}

function shootAtPlayer(e, count = 1, spread = 0) {
  const pr = e.projectile;
  if (!pr) return;
  const base = angleTo(e.x, e.y, G.player.x, G.player.y);
  for (let i = 0; i < count; i++) {
    const a = base + (count > 1 ? ((i / (count - 1)) - 0.5) * spread : 0);
    spawnProjectile(e.x, e.y - e.r * 0.4, a, {
      dmg: e.dmg * 0.85, speed: pr.speed, size: pr.size, color: pr.color,
      life: pr.life, hostile: true, range: 9999,
      trailColor: pr.color,
    });
  }
  burst(e.x, e.y, 4, { color: pr.color, speed: 90, life: 0.2, dir: base, spread: 0.8 });
  sfx('shoot', { pitch: 0.85, gain: 0.55 });
}

// --- Bosse -------------------------------------------------------------

function updateBoss(e, dt, tx, ty) {
  const def = e.bossDef;
  const p = G.player;
  const hpFrac = e.hp / e.maxHp;

  // Phasenwechsel
  let phase = 0;
  for (let i = 0; i < def.phases.length; i++) {
    if (hpFrac <= def.phases[i].at) phase = i;
  }
  if (phase !== e.phase) {
    e.phase = phase;
    e.nextMove = 0.6;
    e.windup = 0;
    e.moveName = null;
    ring(e.x, e.y, 20, 360, { color: '#ff6b4a', life: 0.8, width: 12 });
    addShake(16);
    addFlash('#ff6b4a', 0.25, 3);
    sfx('bossRoar', { pitch: 1 + phase * 0.1 });
    notice(e.x, e.y - e.r - 40, `Phase ${phase + 1}`, '#ff6b4a', 24);
    setMusicMood('boss', Math.min(1, 0.7 + phase * 0.15));
  }

  const ph = def.phases[e.phase];
  const speedMul = ph.speedMul || 1;

  // Laufender Angriff?
  if (e.moveTimer > 0) {
    e.moveTimer -= dt;
    runBossMoveTick(e, dt, tx, ty);
    if (e.moveTimer <= 0) { e.moveName = null; e.nextMove = vfxRng.range(0.5, 1.1); }
    return;
  }

  // Vorzeichen (Tell) läuft
  if (e.windup > 0) {
    e.windup -= dt;
    e.vx *= Math.exp(-6 * dt); e.vy *= Math.exp(-6 * dt);
    if (e.windup <= 0) executeBossMove(e, e.windupMove, tx, ty);
    return;
  }

  // Normale Bewegung zum Spieler
  moveToward(e, tx, ty, speedMul * 0.85);

  e.nextMove -= dt;
  if (e.nextMove <= 0) {
    const name = vfxRng.pick(ph.moves);
    const md = def.moveDefs[name];
    if (!md) { e.nextMove = 1; return; }
    e.windupMove = name;
    e.windup = md.windup || 0.6;
    e.tellColor = md.tell || '#ff6b4a';
    e.nextMove = md.cd || 4;
    sfx('ui', { pitch: 0.5, gain: 0.8 });
  }
}

function runBossMoveTick(e, dt, tx, ty) {
  const def = e.bossDef;
  const md = def.moveDefs[e.moveName];
  if (!md) return;

  if (e.moveName === 'charge') {
    if (vfxRng.chance(dt * 30)) trail(e.x, e.y, '#ff9a6a', 10, 0.35);
    // Trifft alles auf dem Weg
    const rr = e.r + G.player.r;
    if (dist2(e.x, e.y, G.player.x, G.player.y) < rr * rr) {
      damagePlayer(md.dmg, { attacker: e, source: 'charge' });
    }
  } else if (e.moveName === 'rage') {
    e.baseSpeed = (def.speed || 60) * (md.speedMul || 2);
    if (vfxRng.chance(dt * 20)) trail(e.x, e.y, '#e8503a', 9, 0.3);
    moveToward(e, tx, ty, 1.2);
    if (e.moveTimer <= dt) e.baseSpeed = def.speed;
  } else if (e.moveName === 'overheat') {
    e.overheatAcc = (e.overheatAcc || 0) + dt;
    if (e.overheatAcc >= 0.35) {
      e.overheatAcc = 0;
      const r = md.radius || 300;
      ring(e.x, e.y, r * 0.8, r, { color: '#ffe79a', life: 0.3, width: 5 });
      if (dist2(e.x, e.y, G.player.x, G.player.y) < r * r) {
        damagePlayer(md.dmg, { source: 'overheat', undodgeable: true });
      }
    }
  }
}

function executeBossMove(e, name, tx, ty) {
  const def = e.bossDef;
  const md = def.moveDefs[name];
  if (!md) return;
  e.moveName = name;
  e.moveTimer = 0.01;

  switch (name) {
    case 'slam':
    case 'stomp':
    case 'burst':
    case 'curse': {
      const r = md.radius || 200;
      ring(e.x, e.y, 20, r, { color: md.tell, life: 0.45, width: 14 });
      areaDamage(e.x, e.y, r, md.dmg, { type: 'melee', source: name, falloff: false, ignoreSize: true });
      if (dist2(e.x, e.y, G.player.x, G.player.y) < (r + G.player.r) * (r + G.player.r)) {
        damagePlayer(md.dmg, { source: name, attacker: e });
      }
      if (md.slow) G.player.buffs.chill = { t: 3, v: md.slow };
      dust(e.x, e.y, r * 0.7);
      addShake(14);
      sfx('heavy', { pitch: 0.6 });
      break;
    }

    case 'sweep':
    case 'oilspray':
    case 'boulder':
    case 'hex': {
      const n = md.count || 8;
      const base = angleTo(e.x, e.y, tx, ty);
      for (let i = 0; i < n; i++) {
        const a = md.homing ? base + vfxRng.range(-0.4, 0.4) : base + (i / n) * TAU;
        delay(i * 0.04, () => {
          if (!e.alive) return;
          spawnProjectile(e.x, e.y, a, {
            dmg: md.dmg, speed: md.projSpeed || 250, size: md.radius ? 14 : 11,
            color: md.tell, hostile: true, life: 5, homing: md.homing || 0,
            burn: md.burn || 0, burnT: 3,
            trailColor: md.tell,
          });
        });
      }
      sfx('shoot', { pitch: 0.6, gain: 1.1 });
      break;
    }

    case 'summon':
    case 'split':
    case 'swarm': {
      const n = md.count || 3;
      ring(e.x, e.y, 20, 180, { color: md.tell, life: 0.5 });
      sfx('summon', { pitch: 0.7 });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + vfxRng.range(-0.3, 0.3);
        delay(i * 0.1, () => {
          if (!e.alive) return;
          spawnEnemy(md.enemy || 'kaefer', e.x + Math.cos(a) * (e.r + 40), e.y + Math.sin(a) * (e.r + 40), {
            wave: Math.max(1, G.wave - 3),
          });
        });
      }
      break;
    }

    case 'spores': {
      const n = md.count || 6;
      for (let i = 0; i < n; i++) {
        const a = vfxRng.angle(), d = vfxRng.range(80, 320);
        const fx = e.x + Math.cos(a) * d, fy = e.y + Math.sin(a) * d;
        ring(fx, fy, 10, md.radius || 90, { color: '#8fd14f', life: 0.6, width: 4 });
        delay(0.6, () => {
          spawnField(fx, fy, {
            kind: 'poison', radius: md.radius || 90, duration: 5,
            dmgPerSec: md.dmg * 0.4, color: '#8fd14f',
            hostile: true, damagesEnemies: false,
          });
        });
      }
      sfx('burn');
      break;
    }

    case 'flames':
    case 'quake': {
      const rings = md.rings || 3;
      for (let i = 0; i < rings; i++) {
        delay(i * 0.45, () => {
          if (!e.alive) return;
          const r = 140 + i * 150;
          ring(e.x, e.y, r * 0.75, r, { color: md.tell, life: 0.45, width: 16 });
          const d = dist(e.x, e.y, G.player.x, G.player.y);
          if (Math.abs(d - r * 0.88) < 70) {
            damagePlayer(md.dmg, { source: name });
            if (md.burn) G.player.buffs.burning = { t: 3, v: md.burn };
          }
          addShake(9);
          sfx('heavy', { pitch: 0.7 + i * 0.1 });
        });
      }
      break;
    }

    case 'charge': {
      e.moveTimer = md.duration || 1.3;
      setVel(e, angleTo(e.x, e.y, tx, ty), md.speed || 460);
      dust(e.x, e.y, e.r * 1.5, '#ff9a6a');
      sfx('roll', { pitch: 0.6 });
      break;
    }

    case 'rage': {
      e.moveTimer = md.duration || 4;
      addFlash('#e8503a', 0.2, 4);
      sfx('bossRoar', { pitch: 1.2 });
      break;
    }

    case 'overheat': {
      e.moveTimer = md.duration || 5;
      e.overheatAcc = 0;
      addFlash('#ffe79a', 0.2, 4);
      sfx('bossRoar', { pitch: 0.8 });
      break;
    }

    case 'blink': {
      const a = vfxRng.angle(), d = md.dist || 300;
      burst(e.x, e.y, 18, { color: md.tell, speed: 220, life: 0.5 });
      e.x = clamp(tx + Math.cos(a) * d * 0.5, -G.arena.halfW + e.r, G.arena.halfW - e.r);
      e.y = clamp(ty + Math.sin(a) * d * 0.5, -G.arena.halfH + e.r, G.arena.halfH - e.r);
      burst(e.x, e.y, 18, { color: md.tell, speed: 220, life: 0.5 });
      sfx('teleport');
      break;
    }

    default:
      break;
  }
}

/** Lebende Gegner zählen — für die Wellen-Logik. */
export function countEnemies(includeSpawning = true) {
  const pool = G.pools.enemies;
  let n = 0;
  for (let i = 0; i < pool.count; i++) {
    const e = pool.items[i];
    if (!e.alive) continue;
    if (!includeSpawning && e.spawnT > 0) continue;
    n++;
  }
  return n;
}

/** Alle Gegner töten (Wellenende ohne Boss). */
export function despawnAllEnemies(reward = false) {
  const pool = G.pools.enemies;
  for (let i = pool.count - 1; i >= 0; i--) {
    const e = pool.items[i];
    if (!e.alive) { pool.release(i); continue; }
    if (reward) {
      e.alive = false;
    } else {
      burst(e.x, e.y, 8, { color: e.pal ? e.pal.main : '#888', speed: 150, life: 0.4 });
      smoke(e.x, e.y, 2, { color: '#6b5f4a' });
    }
    pool.release(i);
  }
  G.bossRef = null;
}
