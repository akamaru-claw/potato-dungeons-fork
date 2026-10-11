// Kampf: Waffen feuern, Schaden rechnen, Statuseffekte, Projektile.
//
// Die Schadensformel steht genau einmal in `dealDamage`. Alles — Waffen,
// Artefakte, Gefahren, Dornen — geht durch diese Funktion, damit
// Verzauberungen und Werte nirgends vergessen werden können.

import {
  TAU, clamp, dist, dist2, angleTo, angleDiff, inArc, pointSeg2,
} from '../core/math.js';
import { vfxRng } from '../core/rng.js';
import {
  burst, splatter, ring, damageText, notice, explosion, addShake, addFlash,
  addHitStop, smoke, trail, dust,
} from '../core/fx.js';
import { sfx, buzz } from '../core/audio.js';
import {
  G, damageMul, attackSpeedMul, weaponEnch, armorEnch, addBuff, hasBuff,
  gainXp, gainKnollen, recomputeStats,
} from './state.js';
import { collideCircle, lineBlocked, hazardAt } from './dungeon.js';
import { onEnemyKilled } from './loot.js';

const EPS = 1e-6;

// --- Ziel finden -------------------------------------------------------

export function nearestEnemy(x, y, maxDist = 99999, filter = null) {
  const pool = G.pools.enemies;
  let best = null, bestD = maxDist * maxDist;
  for (let i = 0; i < pool.count; i++) {
    const e = pool.items[i];
    if (!e.alive || e.hidden) continue;
    if (filter && !filter(e)) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function enemiesInRadius(x, y, r, limit = 999) {
  const pool = G.pools.enemies;
  const out = [];
  const r2 = r * r;
  for (let i = 0; i < pool.count && out.length < limit; i++) {
    const e = pool.items[i];
    if (!e.alive || e.hidden) continue;
    if (dist2(x, y, e.x, e.y) <= r2) out.push(e);
  }
  return out;
}

export function forEnemiesInRadius(x, y, r, fn) {
  const pool = G.pools.enemies;
  const r2 = r * r;
  let n = 0;
  for (let i = pool.count - 1; i >= 0; i--) {
    const e = pool.items[i];
    if (!e.alive || e.hidden) continue;
    if (dist2(x, y, e.x, e.y) <= r2) { fn(e); n++; }
  }
  return n;
}

// --- Schaden am Gegner -------------------------------------------------

/**
 * Zentrale Schadensfunktion.
 * opts: { type, weapon, crit, knock, dirX, dirY, source, silent, noEffects, mul }
 */
export function dealDamage(e, raw, opts = {}) {
  if (!e || !e.alive || raw <= 0) return 0;

  const type = opts.type || 'melee';
  const w = opts.weapon || null;
  const def = w ? w.def : null;
  const p = G.player;

  let dmg = raw * damageMul(type) * (opts.mul || 1);

  // Verzauberungen der auslösenden Waffe
  let critChance = G.stats.crit + (def && def.crit ? def.crit : 0);
  if (w) {
    const sharp = weaponEnch(w, 'schaerfe');
    if (sharp) dmg *= 1 + sharp;

    const resolve = weaponEnch(w, 'entschlossen');
    if (resolve) dmg *= 1 + resolve * (1 - p.hp / Math.max(1, p.maxHp));

    const heavy = weaponEnch(w, 'wucht');
    if (heavy) dmg *= 1 + heavy * 0.4;

    critChance += weaponEnch(w, 'kritisch');
  }

  // Kritische Treffer
  let crit = opts.crit != null ? opts.crit : vfxRng.chance(critChance);
  let critMul = 1 + G.stats.critDmg;
  if (p.ambush && !opts.noEffects) {
    crit = true;
    critMul = 1 + G.stats.critDmg * 2;
    p.ambush = false;
  }
  if (crit) dmg *= critMul;

  // Panzerung des Gegners. Crits beißen sich durch Blech.
  let through = 100 / (100 + Math.max(0, e.armor));
  if (crit) through = Math.min(1, through * (e.critWeak || 1));
  dmg *= through;

  // Eingefrorene Gegner nehmen mehr Schaden — belohnt Frost-Builds.
  if (e.frozen > 0) dmg *= 1.3;

  dmg = Math.max(1, dmg);
  const before = e.hp;
  e.hp -= dmg;
  e.hitFlash = 0.14;
  e.dmgTaken += dmg;
  e.lastHitBy = w;
  G.damageDealt += Math.min(dmg, before);

  // Rückstoß
  const knockBase = opts.knock != null ? opts.knock : (def ? def.knock || 0 : 0);
  if (knockBase > 0) {
    const kb = knockBase * (1 + G.stats.knockback + (w ? weaponEnch(w, 'wucht') : 0)) * (1 - clamp(e.knockRes, 0, 0.98));
    let dx = opts.dirX, dy = opts.dirY;
    if (dx == null || dy == null) {
      const a = angleTo(p.x, p.y, e.x, e.y);
      dx = Math.cos(a); dy = Math.sin(a);
    }
    e.vx += dx * kb;
    e.vy += dy * kb;
  }

  // Effekte der Waffe und ihrer Verzauberungen
  if (w && !opts.noEffects) applyWeaponOnHit(e, w, dmg, opts);

  // Rückmeldung
  if (!opts.silent) {
    const dir = opts.dirX != null ? Math.atan2(opts.dirY, opts.dirX) : angleTo(p.x, p.y, e.x, e.y);
    if (crit) {
      damageText(e.x, e.y - e.r - 8, dmg, { crit: true });
      splatter(e.x, e.y, dir, e.pal ? e.pal.main : '#c98f4e', 11);
      sfx('crit');
      addHitStop(0.045);
      addShake(3.5);
      buzz(16);
      // Chips: Crits explodieren
      if (G.character.trait === 'splitter') {
        areaDamage(e.x, e.y, 70 * (1 + G.stats.explosionSize), dmg * 0.4, {
          type, source: 'splitter', silent: false, noEffects: true,
        });
        explosion(e.x, e.y, 70 * (1 + G.stats.explosionSize), { particles: 0.5 });
      }
    } else {
      damageText(e.x, e.y - e.r - 8, dmg);
      splatter(e.x, e.y, dir, e.pal ? e.pal.main : '#c98f4e', 5);
      if (e.armor > 6 && through < 0.6) sfx('armored');
      else sfx('hit');
    }
  }

  // Lebensraub
  if (!opts.noEffects) {
    let steal = G.stats.lifesteal;
    if (w) steal += weaponEnch(w, 'seelenraub');
    if (steal > 0) healPlayer(dmg * steal, true);
    if (def && def.heal) healPlayer(def.heal, true);
    if (w) {
      const radiance = weaponEnch(w, 'strahlen');
      if (radiance) {
        p.strikeCounter++;
        if (p.strikeCounter % 6 === 0) {
          healPlayer(radiance);
          ring(p.x, p.y, 10, 80, { color: '#ffe79a', life: 0.35 });
        }
      }
    }
  }

  if (w) w.damage += Math.min(dmg, before);

  if (e.hp <= 0) {
    killEnemy(e, opts);
    return dmg;
  }
  return dmg;
}

function applyWeaponOnHit(e, w, dmg, opts) {
  const def = w.def;
  const dotMul = 1 + G.stats.dotDuration;

  // Von der Waffe selbst
  if (def.burn) applyStatus(e, 'burn', (def.burnTime || 2) * dotMul, def.burn * damageMul('elem'));
  if (def.poison) applyStatus(e, 'poison', (def.poisonTime || 3) * dotMul, def.poison * damageMul('elem'));
  if (def.slow) applyStatus(e, 'slow', (def.slowTime || 2) * dotMul, def.slow);
  if (def.stun) applyStatus(e, 'stun', def.stun, 1);

  // Von Verzauberungen
  const fire = weaponEnch(w, 'feuerhauch');
  if (fire) applyStatus(e, 'burn', 3 * dotMul, fire * damageMul('elem'));

  const frost = weaponEnch(w, 'frostbiss');
  if (frost) applyStatus(e, 'slow', 2 * dotMul, frost);

  const poison = weaponEnch(w, 'giftklinge');
  if (poison) applyStatus(e, 'poison', 4 * dotMul, poison * damageMul('elem'));

  const stun = weaponEnch(w, 'betaeubung');
  if (stun && vfxRng.chance(stun)) applyStatus(e, 'stun', 0.6, 1);

  const grav = weaponEnch(w, 'schwerkraft');
  if (grav) {
    const a = angleTo(e.x, e.y, G.player.x, G.player.y);
    e.vx += Math.cos(a) * grav;
    e.vy += Math.sin(a) * grav;
  }

  const chain = weaponEnch(w, 'kettenblitz');
  if (chain && vfxRng.chance(chain)) {
    const next = nearestEnemy(e.x, e.y, 180, (o) => o !== e);
    if (next) {
      lightning(e.x, e.y, next.x, next.y, '#9ef0ff');
      dealDamage(next, dmg * 0.5, { type: 'elem', source: 'kettenblitz', noEffects: true });
      sfx('zap');
    }
  }
}

export function killEnemy(e, opts = {}) {
  if (!e.alive) return;
  e.alive = false;
  G.kills++;

  const w = opts.weapon || e.lastHitBy;

  // Explosiv-Verzauberung
  if (w) {
    const boom = weaponEnch(w, 'explosiv');
    if (boom) {
      const r = 80 * (1 + G.stats.explosionSize);
      areaDamage(e.x, e.y, r, e.maxHp * 0.15 + 12 * boom * 3, {
        type: 'elem', source: 'explosiv', noEffects: true,
      });
      explosion(e.x, e.y, r, { particles: 0.6 });
      sfx('bomb', { gain: 0.5 });
    }
  }

  // Faulknollen platzen auch beim Tod
  if (e.ai === 'exploder' && e.blastRadius > 0) {
    explodeEnemy(e);
  }

  // Figuren-Eigenheiten
  if (G.character.trait === 'zuwachs') {
    const p = G.player;
    p.killsSinceGrow++;
    if (p.killsSinceGrow >= 12) {
      p.killsSinceGrow = 0;
      G.permanentHp = (G.permanentHp || 0) + 1;
      recomputeStats();
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + 1);
      notice(p.x, p.y - 40, '+1 Max-LP', '#7bd44f', 15);
    }
  }

  onEnemyKilled(e, w);

  burst(e.x, e.y, 14, {
    color: e.pal ? e.pal.main : '#c98f4e', speed: 220, life: 0.5, size: 7,
  });
  smoke(e.x, e.y, 3, { color: '#6b5f4a', size: e.r });
  sfx('kill', { pitch: 1 + (18 - Math.min(18, e.r)) * 0.02 });
  if (e.boss) {
    addShake(22);
    addFlash('#ffffff', 0.5, 2.2);
  } else if (e.elite) {
    addShake(6);
  }
}

export function explodeEnemy(e) {
  const r = e.blastRadius || 90;
  explosion(e.x, e.y, r, { color: '#c0f06a', color2: '#e8ffd8' });
  sfx('bomb');
  const d = dist(e.x, e.y, G.player.x, G.player.y);
  if (d < r + G.player.r) {
    damagePlayer(e.dmg, { source: 'explosion' });
  }
  // Explodierende Gegner reißen auch eigene Leute mit — das belohnt Kiten.
  forEnemiesInRadius(e.x, e.y, r, (o) => {
    if (o !== e) dealDamage(o, e.dmg * 0.6, { type: 'elem', source: 'friendly', noEffects: true });
  });
}

// --- Flächenschaden ---------------------------------------------------

export function areaDamage(x, y, radius, amount, opts = {}) {
  const r = radius * (opts.ignoreSize ? 1 : 1 + G.stats.explosionSize);
  let hits = 0;
  forEnemiesInRadius(x, y, r, (e) => {
    const falloff = opts.falloff === false ? 1 : 1 - 0.35 * (dist(x, y, e.x, e.y) / Math.max(1, r));
    const a = angleTo(x, y, e.x, e.y);
    dealDamage(e, amount * falloff, {
      ...opts, dirX: Math.cos(a), dirY: Math.sin(a),
    });
    hits++;
  });
  return hits;
}

// --- Statuseffekte ----------------------------------------------------

export function applyStatus(e, kind, duration, value) {
  if (!e || !e.alive) return;
  switch (kind) {
    case 'burn':
      e.burn = Math.max(e.burn, value);
      e.burnT = Math.max(e.burnT, duration);
      break;
    case 'poison':
      e.poison = Math.max(e.poison, value);
      e.poisonT = Math.max(e.poisonT, duration);
      break;
    case 'slow':
      e.slow = Math.max(e.slow, clamp(value, 0, 0.85));
      e.slowT = Math.max(e.slowT, duration);
      break;
    case 'stun':
      if (e.boss) duration *= 0.3;
      e.stun = Math.max(e.stun, duration);
      break;
    case 'frozen':
      if (e.boss) duration *= 0.35;
      e.frozen = Math.max(e.frozen, duration);
      e.stun = Math.max(e.stun, duration);
      break;
    case 'mark':
      e.mark = Math.max(e.mark, duration);
      break;
    default: break;
  }
}

export function globalSlow(duration, value) {
  const pool = G.pools.enemies;
  for (let i = 0; i < pool.count; i++) {
    applyStatus(pool.items[i], 'slow', duration, value);
  }
  G.globalSlowT = duration;
}

// --- Spieler ----------------------------------------------------------

export function damagePlayer(raw, opts = {}) {
  const p = G.player;
  if (p.dead || raw <= 0) return 0;
  if (p.invuln > 0 || p.rolling > 0) return 0;

  // Ausweichen
  if (!opts.undodgeable && vfxRng.chance(G.stats.dodge)) {
    notice(p.x, p.y - 34, 'Ausgewichen', '#9ef0ff', 15);
    sfx('dodge');
    return 0;
  }

  let dmg = raw * G.difficulty.dmgMul;
  // Panzerung: abnehmender Ertrag, nie auf null
  dmg *= 100 / (100 + G.stats.armor * 1.7);
  dmg = Math.max(1, dmg);

  p.hp -= dmg;
  p.hitFlash = 0.3;
  p.invuln = Math.max(p.invuln, 0.45);
  p.lastHitT = G.runTime;
  G.damageTaken += dmg;
  G.waveDamageTaken += dmg;

  damageText(p.x, p.y - 42, Math.round(dmg), { color: '#ff6b4a', force: true, size: 20 });
  burst(p.x, p.y, 10, { color: '#e04a5a', speed: 190, life: 0.4 });
  addShake(7 + Math.min(14, dmg * 0.3));
  addFlash('#ff3a3a', 0.2, 6);
  sfx('hurt');
  buzz(38);

  // Dornen schlagen zurück
  if (G.stats.thorns > 0 && opts.attacker) {
    dealDamage(opts.attacker, G.stats.thorns, { type: 'melee', source: 'thorns', noEffects: true });
  }
  const spiky = armorEnch('stachelhaut');
  if (spiky > 0 && opts.attacker) {
    dealDamage(opts.attacker, spiky, { type: 'melee', source: 'stachelhaut', noEffects: true });
  }

  if (p.hp <= 0) {
    // Letzte Knolle (Rüstungs-Verzauberung)
    const last = armorEnch('letzteknolle');
    if (last > 0 && (p.lastKnolleUsed || 0) < last) {
      p.lastKnolleUsed = (p.lastKnolleUsed || 0) + 1;
      p.hp = 1;
      p.invuln = 1.6;
      notice(p.x, p.y - 56, 'LETZTE KNOLLE!', '#ffd93d', 24);
      ring(p.x, p.y, 10, 190, { color: '#ffd93d', life: 0.7, width: 9 });
      addFlash('#ffd93d', 0.5, 3);
      sfx('legendary');
      return dmg;
    }
    // Phönixknolle / Rettungen
    if (p.revivesLeft > 0) {
      p.revivesLeft--;
      p.hp = Math.round(p.maxHp * 0.5);
      p.invuln = 2.2;
      notice(p.x, p.y - 56, 'WIEDERAUFERSTANDEN', '#ff8a3d', 24);
      explosion(p.x, p.y, 220, { color: '#ff8a3d', color2: '#ffe79a' });
      forEnemiesInRadius(p.x, p.y, 240, (e) => {
        dealDamage(e, p.maxHp * 0.6, { type: 'elem', source: 'revive', knock: 500, noEffects: true });
      });
      sfx('legendary');
      return dmg;
    }
    p.hp = 0;
    p.dead = true;
  }
  return dmg;
}

export function healPlayer(amount, silent = false) {
  const p = G.player;
  if (p.dead || amount <= 0) return 0;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  const healed = p.hp - before;
  if (healed > 0.5 && !silent) {
    damageText(p.x, p.y - 44, `+${Math.round(healed)}`, { color: '#7bd44f', force: true });
    sfx('heal');
  }
  return healed;
}

// --- Projektile -------------------------------------------------------

export function spawnProjectile(x, y, angle, opts = {}) {
  const pool = opts.hostile ? G.pools.hostileProjectiles : G.pools.projectiles;
  const p = pool.spawn();
  if (!p) return null;
  const speed = opts.speed || 500;
  p.x = x; p.y = y;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.r = opts.size || 7;
  p.dmg = opts.dmg || 10;
  p.type = opts.type || 'ranged';
  p.color = opts.color || '#ffd27a';
  p.pierce = opts.pierce || 0;
  p.bounce = opts.bounce || 0;
  p.maxLife = p.life = opts.life || 3;
  p.range = opts.range || 9999;
  p.hostile = !!opts.hostile;
  p.homing = opts.homing || 0;
  p.area = opts.area || 0;
  p.burn = opts.burn || 0; p.burnT = opts.burnT || 0;
  p.poison = opts.poison || 0; p.poisonT = opts.poisonT || 0;
  p.slow = opts.slow || 0; p.slowT = opts.slowT || 0;
  p.knock = opts.knock || 0;
  p.weapon = opts.weapon || null;
  p.source = opts.source || null;
  p.boomerang = opts.boomerang || 0;
  p.originX = x; p.originY = y;
  p.returning = false;
  p.spin = opts.spin || 0;
  p.rot = angle;
  p.trailColor = opts.trailColor || null;
  p.cloud = opts.cloud || 0;
  p.glow = opts.glow !== false;
  p.gravity = opts.gravity || 0;
  return p;
}

export function updateProjectiles(dt) {
  updateProjectilePool(G.pools.projectiles, dt, false);
  updateProjectilePool(G.pools.hostileProjectiles, dt, true);
}

function updateProjectilePool(pool, dt, hostile) {
  const p0 = G.player;
  const arena = G.arena;

  for (let i = pool.count - 1; i >= 0; i--) {
    const pr = pool.items[i];
    pr.life -= dt;

    // Zielsuche
    if (pr.homing > 0) {
      const target = hostile ? p0 : (pr.target && pr.target.alive ? pr.target : nearestEnemy(pr.x, pr.y, 420));
      if (!hostile) pr.target = target;
      if (target) {
        const want = angleTo(pr.x, pr.y, target.x, target.y);
        const cur = Math.atan2(pr.vy, pr.vx);
        const speed = Math.hypot(pr.vx, pr.vy);
        const a = cur + angleDiff(cur, want) * clamp(pr.homing * dt * 5, 0, 1);
        pr.vx = Math.cos(a) * speed;
        pr.vy = Math.sin(a) * speed;
      }
    }

    // Bumerang: Umkehrpunkt
    if (pr.boomerang > 0) {
      const traveled = dist(pr.originX, pr.originY, pr.x, pr.y);
      if (!pr.returning && traveled >= pr.boomerang) {
        pr.returning = true;
        pr.hitIds.length = 0;        // auf dem Rückweg wieder treffen
      }
      if (pr.returning) {
        const a = angleTo(pr.x, pr.y, p0.x, p0.y);
        const speed = Math.hypot(pr.vx, pr.vy);
        pr.vx = Math.cos(a) * speed;
        pr.vy = Math.sin(a) * speed;
        if (dist2(pr.x, pr.y, p0.x, p0.y) < 400) { pool.release(i); continue; }
      }
    }

    if (pr.gravity) pr.vy += pr.gravity * dt;

    const nx = pr.x + pr.vx * dt;
    const ny = pr.y + pr.vy * dt;
    pr.traveled += Math.hypot(nx - pr.x, ny - pr.y);
    pr.x = nx; pr.y = ny;
    pr.rot += pr.spin * dt;

    if (pr.trailColor) trail(pr.x, pr.y, pr.trailColor, pr.r * 0.8, 0.2);

    // Lebensende / Reichweite
    if (pr.life <= 0 || pr.traveled > pr.range) {
      if (pr.cloud > 0) spawnCloud(pr);
      else if (pr.area > 0) projectileImpact(pr, null);
      pool.release(i);
      continue;
    }

    // Wand getroffen?
    if (arena && outsideArena(arena, pr.x, pr.y, pr.r)) {
      if (pr.bounce > 0) {
        pr.bounce--;
        // Einfache Umkehr — bei runden Arenen reicht das optisch völlig.
        if (Math.abs(pr.x) > arena.halfW - pr.r) pr.vx *= -1;
        if (Math.abs(pr.y) > arena.halfH - pr.r) pr.vy *= -1;
        pr.x = clamp(pr.x, -arena.halfW + pr.r, arena.halfW - pr.r);
        pr.y = clamp(pr.y, -arena.halfH + pr.r, arena.halfH - pr.r);
        pr.hitIds.length = 0;
        burst(pr.x, pr.y, 4, { color: pr.color, speed: 90, life: 0.2 });
      } else {
        if (pr.cloud > 0) spawnCloud(pr);
        else if (pr.area > 0) projectileImpact(pr, null);
        else burst(pr.x, pr.y, 4, { color: pr.color, speed: 110, life: 0.22 });
        pool.release(i);
        continue;
      }
    }

    // Treffer
    if (hostile) {
      if (p0.invuln <= 0 && p0.rolling <= 0 && !hasBuff('invis')
        && dist2(pr.x, pr.y, p0.x, p0.y) < (pr.r + p0.r) * (pr.r + p0.r)) {
        damagePlayer(pr.dmg, { source: 'projectile' });
        if (pr.burn) addBuff('burning', pr.burnT || 2, pr.burn);
        if (pr.slow) addBuff('chill', pr.slowT || 2, pr.slow);
        burst(pr.x, pr.y, 7, { color: pr.color, speed: 150, life: 0.3 });
        pool.release(i);
        continue;
      }
    } else {
      const epool = G.pools.enemies;
      let consumed = false;
      for (let k = epool.count - 1; k >= 0; k--) {
        const e = epool.items[k];
        if (!e.alive || e.hidden || e.spawnT > 0) continue;
        const rr = pr.r + e.r;
        if (dist2(pr.x, pr.y, e.x, e.y) > rr * rr) continue;
        if (pr.hitIds.includes(e)) continue;

        // Kompostgeister weichen manchmal aus
        if (e.dodgeChance && vfxRng.chance(e.dodgeChance)) {
          notice(e.x, e.y - e.r, 'daneben', '#9ef0ff', 13);
          pr.hitIds.push(e);
          continue;
        }

        pr.hitIds.push(e);
        const dirA = Math.atan2(pr.vy, pr.vx);
        if (pr.area > 0) {
          projectileImpact(pr, e);
          consumed = true;
          break;
        }
        dealDamage(e, pr.dmg, {
          type: pr.type, weapon: pr.weapon, knock: pr.knock,
          dirX: Math.cos(dirA), dirY: Math.sin(dirA), source: pr.source,
        });
        if (pr.burn) applyStatus(e, 'burn', pr.burnT, pr.burn);
        if (pr.poison) applyStatus(e, 'poison', pr.poisonT, pr.poison);
        if (pr.slow) applyStatus(e, 'slow', pr.slowT, pr.slow);

        if (pr.pierce > 0) {
          pr.pierce--;
        } else if (pr.bounce > 0) {
          pr.bounce--;
          const next = nearestEnemy(pr.x, pr.y, 260, (o) => !pr.hitIds.includes(o));
          if (next) {
            const a = angleTo(pr.x, pr.y, next.x, next.y);
            const sp = Math.hypot(pr.vx, pr.vy);
            pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
          } else { consumed = true; }
        } else {
          consumed = true;
        }
        if (consumed) break;
      }
      if (consumed) {
        if (pr.cloud > 0) spawnCloud(pr);
        pool.release(i);
        continue;
      }
    }
  }
}

function outsideArena(arena, x, y, r) {
  if (Math.abs(x) > arena.halfW - r || Math.abs(y) > arena.halfH - r) return true;
  for (const w of arena.walls) {
    if (w.outer) continue;
    const hw = w.w / 2 + r, hh = w.h / 2 + r;
    if (Math.abs(x - w.x) < hw && Math.abs(y - w.y) < hh) return true;
  }
  return false;
}

function projectileImpact(pr, hit) {
  const r = pr.area;
  areaDamage(pr.x, pr.y, r, pr.dmg, {
    type: pr.type, weapon: pr.weapon, source: pr.source, knock: pr.knock,
  });
  explosion(pr.x, pr.y, r * (1 + G.stats.explosionSize), {
    color: pr.color, particles: 0.8,
  });
  sfx('bomb', { gain: 0.6 });
}

function spawnCloud(pr) {
  spawnField(pr.x, pr.y, {
    kind: 'poison', radius: pr.area || 70, duration: pr.cloud,
    dmgPerSec: pr.dmg * 0.5, poison: pr.poison, color: '#8fd14f',
    damagesPlayer: false,
  });
}

// --- Blitz (Optik) ----------------------------------------------------

export function lightning(x1, y1, x2, y2, color = '#9ef0ff') {
  const b = G.pools.bolts.spawn();
  if (!b) return;
  b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
  b.color = color;
  b.maxLife = b.life = 0.18;
  addFlash(color, 0.05, 12);
}

// --- Bodenflächen ------------------------------------------------------

export function spawnField(x, y, opts = {}) {
  const f = G.pools.fields.spawn();
  if (!f) return null;
  f.x = x; f.y = y;
  f.radius = opts.radius || 80;
  f.kind = opts.kind || 'fire';
  f.maxDuration = f.duration = opts.duration || 3;
  f.dmgPerSec = opts.dmgPerSec || 0;
  f.healPerSec = opts.healPerSec || 0;
  f.slow = opts.slow || 0;
  f.burn = opts.burn || 0;
  f.poison = opts.poison || 0;
  f.color = opts.color || '#ff8a3d';
  f.damagesEnemies = opts.damagesEnemies !== false;
  f.damagesPlayer = opts.damagesPlayer !== false;
  f.hostile = !!opts.hostile;
  return f;
}

export function updateFields(dt) {
  const pool = G.pools.fields;
  const p = G.player;
  for (let i = pool.count - 1; i >= 0; i--) {
    const f = pool.items[i];
    f.duration -= dt;
    if (f.duration <= 0) { pool.release(i); continue; }
    f.tickT -= dt;
    const tick = f.tickT <= 0;
    if (tick) f.tickT = 0.25;

    if (tick) {
      if (f.kind === 'heal') {
        if (dist2(p.x, p.y, f.x, f.y) < f.radius * f.radius) {
          healPlayer(f.healPerSec * 0.25, true);
          if (vfxRng.chance(0.4)) trail(p.x + vfxRng.range(-12, 12), p.y + vfxRng.range(-18, 6), '#9ef08f', 5, 0.5);
        }
        // Verbündete mitheilen
        const ap = G.pools.allies;
        for (let k = 0; k < ap.count; k++) {
          const a = ap.items[k];
          if (dist2(a.x, a.y, f.x, f.y) < f.radius * f.radius) a.hp = Math.min(a.maxHp, a.hp + f.healPerSec * 0.25);
        }
      }

      if (f.damagesEnemies && (f.dmgPerSec > 0 || f.slow > 0 || f.kind === 'root')) {
        forEnemiesInRadius(f.x, f.y, f.radius, (e) => {
          if (f.dmgPerSec > 0) {
            dealDamage(e, f.dmgPerSec * 0.25, {
              type: 'elem', source: f.kind, silent: !vfxRng.chance(0.35), noEffects: true,
            });
          }
          if (f.kind === 'root') applyStatus(e, 'stun', 0.3, 1);
          if (f.slow > 0) applyStatus(e, 'slow', 0.4, f.slow);
          if (f.burn > 0) applyStatus(e, 'burn', 1.5, f.burn);
          if (f.poison > 0) applyStatus(e, 'poison', 2, f.poison);
        });
      }

      if (f.damagesPlayer && f.hostile && f.dmgPerSec > 0) {
        if (dist2(p.x, p.y, f.x, f.y) < (f.radius + p.r) * (f.radius + p.r)) {
          damagePlayer(f.dmgPerSec * 0.25, { source: f.kind, undodgeable: true });
        }
      }
    }

    // Optik
    if (vfxRng.chance(dt * 14)) {
      const a = vfxRng.angle(), d = Math.sqrt(vfxRng.next()) * f.radius;
      trail(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, f.color, 6, 0.5);
    }
  }
}

// --- Verbündete, Türme, Minen, Bomben, Raketen ------------------------

export function spawnAlly(x, y, opts = {}) {
  const a = G.pools.allies.spawn();
  if (!a) return null;
  a.x = x; a.y = y;
  a.maxHp = a.hp = opts.hp || 40;
  a.dmg = (opts.dmg || 12) * (1 + G.stats.allyDmg);
  a.speed = opts.speed || 215;
  a.life = opts.life || 18;
  a.atkRate = opts.atkRate || 0.75;
  dust(x, y, 22, '#ffe79a');
  return a;
}

export function updateAllies(dt) {
  const pool = G.pools.allies;
  for (let i = pool.count - 1; i >= 0; i--) {
    const a = pool.items[i];
    a.life -= dt;
    a.spawnT = Math.max(0, a.spawnT - dt);
    if (a.hitFlash > 0) a.hitFlash -= dt;
    if (a.life <= 0 || a.hp <= 0) {
      burst(a.x, a.y, 12, { color: '#ffe79a', speed: 170, life: 0.45 });
      pool.release(i);
      continue;
    }
    const target = (a.target && a.target.alive) ? a.target : nearestEnemy(a.x, a.y, 520);
    a.target = target;
    if (target) {
      const d = dist(a.x, a.y, target.x, target.y);
      const want = angleTo(a.x, a.y, target.x, target.y);
      a.facing = want;
      if (d > 42) {
        a.vx = Math.cos(want) * a.speed;
        a.vy = Math.sin(want) * a.speed;
      } else {
        a.vx *= 0.8; a.vy *= 0.8;
        a.atkCd -= dt;
        if (a.atkCd <= 0) {
          a.atkCd = a.atkRate;
          dealDamage(target, a.dmg, {
            type: 'melee', source: 'ally', knock: 70,
            dirX: Math.cos(want), dirY: Math.sin(want), noEffects: true,
          });
          swipe(a.x, a.y, want, 52, 1.5, '#ffe79a');
          sfx('swing', { pitch: 1.4, gain: 0.4 });
        }
      }
    } else {
      // Keine Gegner: beim Spieler bleiben
      const want = angleTo(a.x, a.y, G.player.x, G.player.y);
      const d = dist(a.x, a.y, G.player.x, G.player.y);
      if (d > 90) { a.vx = Math.cos(want) * a.speed * 0.8; a.vy = Math.sin(want) * a.speed * 0.8; }
      else { a.vx *= 0.85; a.vy *= 0.85; }
    }
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (G.arena) collideCircle(G.arena, a, a.r);
  }
}

export function spawnTurret(x, y, weapon) {
  const def = weapon.def;
  const pool = G.pools.turrets;
  // Höchstzahl pro Waffe einhalten: ältesten Turm abbauen
  let own = 0, oldest = -1, oldestLife = Infinity;
  for (let i = 0; i < pool.count; i++) {
    const t = pool.items[i];
    if (t.weapon === weapon) {
      own++;
      if (t.life < oldestLife) { oldestLife = t.life; oldest = i; }
    }
  }
  if (own >= (def.maxActive || 1) && oldest >= 0) pool.release(oldest);

  const t = pool.spawn();
  if (!t) return null;
  const eng = 1 + G.stats.engineering * 0.04;
  const workshop = G.character.trait === 'werkstatt';
  t.x = x; t.y = y;
  t.dmg = def.dmg * eng * (workshop ? 1.5 : 1);
  t.range = def.range * (1 + G.stats.range);
  t.rate = def.turretCd || 0.6;
  t.maxLife = t.life = (def.turretLife || 14) * (workshop ? 2 : 1);
  t.projSpeed = def.speed || 600;
  t.color = def.color;
  t.weapon = weapon;
  dust(x, y, 26, '#6fe0c0');
  sfx('summon', { pitch: 0.9 });
  return t;
}

export function updateTurrets(dt) {
  const pool = G.pools.turrets;
  for (let i = pool.count - 1; i >= 0; i--) {
    const t = pool.items[i];
    t.life -= dt;
    t.spawnT = Math.max(0, t.spawnT - dt);
    if (t.life <= 0) {
      smoke(t.x, t.y, 5, { color: '#6b5f4a' });
      burst(t.x, t.y, 8, { color: t.color, speed: 140, life: 0.4 });
      pool.release(i);
      continue;
    }
    const target = nearestEnemy(t.x, t.y, t.range);
    if (!target) continue;
    t.facing = angleTo(t.x, t.y, target.x, target.y);
    t.cd -= dt * attackSpeedMul();
    if (t.cd <= 0) {
      t.cd = t.rate;
      t.shots++;
      spawnProjectile(t.x, t.y - 6, t.facing, {
        dmg: t.dmg, speed: t.projSpeed, size: 6, range: t.range * 1.2,
        color: t.color, type: 'ranged', weapon: t.weapon, source: 'turret',
        pierce: 0, trailColor: t.color,
      });
      sfx('shoot', { pitch: 1.45, gain: 0.35 });
    }
  }
}

export function spawnMine(x, y, weapon) {
  const def = weapon.def;
  const pool = G.pools.mines;
  let own = 0, oldest = -1, oldestLife = Infinity;
  for (let i = 0; i < pool.count; i++) {
    const m = pool.items[i];
    if (m.weapon === weapon) {
      own++;
      if (m.life < oldestLife) { oldestLife = m.life; oldest = i; }
    }
  }
  if (own >= (def.maxActive || 3) && oldest >= 0) pool.release(oldest);

  const m = pool.spawn();
  if (!m) return null;
  const eng = 1 + G.stats.engineering * 0.04;
  const workshop = G.character.trait === 'werkstatt';
  m.x = x; m.y = y;
  m.dmg = def.dmg * eng * (workshop ? 1.5 : 1);
  m.area = def.area * (1 + G.stats.explosionSize);
  m.armTime = def.armTime || 0.5;
  m.life = workshop ? 60 : 30;
  m.color = def.color;
  m.weapon = weapon;
  return m;
}

export function updateMines(dt) {
  const pool = G.pools.mines;
  for (let i = pool.count - 1; i >= 0; i--) {
    const m = pool.items[i];
    m.life -= dt;
    m.armTime -= dt;
    m.pulse += dt * (m.triggered >= 0 ? 22 : 4);
    if (m.triggered >= 0) {
      m.triggered -= dt;
      if (m.triggered <= 0) {
        areaDamage(m.x, m.y, m.area, m.dmg, {
          type: 'elem', weapon: m.weapon, source: 'mine', knock: 240,
        });
        explosion(m.x, m.y, m.area, { color: m.color });
        sfx('bomb');
        pool.release(i);
      }
      continue;
    }
    if (m.life <= 0) { pool.release(i); continue; }
    if (m.armTime > 0) continue;
    const e = nearestEnemy(m.x, m.y, m.r + 26);
    if (e) { m.triggered = 0.22; sfx('ui', { pitch: 1.8 }); }
  }
}

export function spawnBomb(x, y, fuse, onBoom) {
  const b = G.pools.bombs.spawn();
  if (!b) { onBoom(); return null; }
  b.x = x; b.y = y; b.fuse = fuse; b.onBoom = onBoom;
  b.z = -60; b.vz = 0;
  return b;
}

export function updateBombs(dt) {
  const pool = G.pools.bombs;
  for (let i = pool.count - 1; i >= 0; i--) {
    const b = pool.items[i];
    if (b.z < 0) {
      b.vz += 420 * dt;
      b.z = Math.min(0, b.z + b.vz * dt);
      if (b.z >= 0) { b.z = 0; dust(b.x, b.y, 16); }
    }
    b.fuse -= dt;
    if (vfxRng.chance(dt * 12)) trail(b.x, b.y + b.z - 14, '#ff9a3d', 4, 0.3);
    if (b.fuse <= 0) {
      if (b.onBoom) b.onBoom();
      pool.release(i);
    }
  }
}

export function spawnRocket(x, y, tx, ty, dur, color) {
  const r = G.pools.rockets.spawn();
  if (!r) return null;
  r.x = r.sx = x; r.y = r.sy = y;
  r.tx = tx; r.ty = ty; r.dur = dur; r.t = 0; r.color = color;
  return r;
}

export function updateRockets(dt) {
  const pool = G.pools.rockets;
  for (let i = pool.count - 1; i >= 0; i--) {
    const r = pool.items[i];
    r.t += dt;
    const k = clamp(r.t / r.dur, 0, 1);
    r.x = r.sx + (r.tx - r.sx) * k;
    r.y = r.sy + (r.ty - r.sy) * k - Math.sin(k * Math.PI) * 120;
    smoke(r.x, r.y, 1, { color: '#8a8070', size: 10, life: 0.5 });
    trail(r.x, r.y, r.color, 6, 0.25);
    if (k >= 1) pool.release(i);
  }
}

// --- Nahkampf-Zonen (nur Optik, Schaden wird sofort gerechnet) --------

export function swipe(x, y, angle, radius, arc, color, kind = 'arc', extra = {}) {
  const s = G.pools.swipes.spawn();
  if (!s) return null;
  s.x = x; s.y = y; s.angle = angle;
  s.radius = radius; s.arc = arc;
  s.maxLife = s.life = extra.life || 0.18;
  s.color = color; s.kind = kind;
  s.width = extra.width || 20;
  s.length = extra.length || radius;
  return s;
}

export function updateSwipes(dt) {
  const pool = G.pools.swipes;
  for (let i = pool.count - 1; i >= 0; i--) {
    const s = pool.items[i];
    s.life -= dt;
    if (s.life <= 0) pool.release(i);
  }
}

// --- Verzögerte Aktionen ---------------------------------------------

export function delay(seconds, fn) {
  if (seconds <= 0) { fn(); return null; }
  const t = G.pools.timers.spawn();
  if (!t) { fn(); return null; }
  t.t = seconds; t.fn = fn;
  return t;
}

export function updateTimers(dt) {
  const pool = G.pools.timers;
  for (let i = pool.count - 1; i >= 0; i--) {
    const t = pool.items[i];
    t.t -= dt;
    if (t.t <= 0) {
      const fn = t.fn;
      pool.release(i);
      if (fn) {
        try { fn(); } catch (err) { console.error('[timer]', err); }
      }
    }
  }
}

export function updateBolts(dt) {
  const pool = G.pools.bolts;
  for (let i = pool.count - 1; i >= 0; i--) {
    const b = pool.items[i];
    b.life -= dt;
    if (b.life <= 0) pool.release(i);
  }
}

// --- Gegner-Statusticks -----------------------------------------------

export function tickEnemyStatus(e, dt) {
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.statusAcc = (e.statusAcc || 0) + dt;
    if (e.statusAcc >= 0.25) {
      e.statusAcc = 0;
      dealDamage(e, e.burn * 0.25, { type: 'elem', source: 'burn', silent: !vfxRng.chance(0.3), noEffects: true });
      if (vfxRng.chance(0.5)) trail(e.x + vfxRng.range(-8, 8), e.y - 6, '#ff8a3d', 5, 0.3);
    }
    if (e.burnT <= 0) e.burn = 0;
  }
  if (e.poisonT > 0) {
    e.poisonT -= dt;
    e.poisonAcc = (e.poisonAcc || 0) + dt;
    if (e.poisonAcc >= 0.3) {
      e.poisonAcc = 0;
      dealDamage(e, e.poison * 0.3, { type: 'elem', source: 'poison', silent: !vfxRng.chance(0.25), noEffects: true });
      if (vfxRng.chance(0.45)) trail(e.x + vfxRng.range(-8, 8), e.y - 6, '#8fd14f', 5, 0.4);
    }
    if (e.poisonT <= 0) e.poison = 0;
  }
  if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
  if (e.stun > 0) e.stun -= dt;
  if (e.frozen > 0) {
    e.frozen -= dt;
    if (vfxRng.chance(dt * 5)) trail(e.x + vfxRng.range(-10, 10), e.y + vfxRng.range(-10, 4), '#d8f6ff', 4, 0.4);
  }
  if (e.mark > 0) e.mark -= dt;
  if (e.hitFlash > 0) e.hitFlash -= dt;
  if (e.contactCd > 0) e.contactCd -= dt;
}

// --- Waffen feuern ----------------------------------------------------

/** Effektive Reichweite einer Waffe mit allen Boni. */
export function weaponRange(w) {
  return w.def.range * (1 + G.stats.range);
}

function areaMul(w) {
  return (1 + G.stats.explosionSize) * (1 + weaponEnch(w, 'wirbel'));
}

export function updateWeapons(dt) {
  const p = G.player;
  const asm = attackSpeedMul();

  for (const w of G.weapons) {
    const def = w.def;

    if (def.pattern === 'orbit') { updateOrbitWeapon(w, dt); continue; }

    w.cd -= dt * asm;
    if (w.anim > 0) w.anim -= dt * 4;

    if (w.cd > 0) continue;

    const range = weaponRange(w);
    const needsTarget = def.pattern !== 'aura' && def.pattern !== 'cone'
      && def.pattern !== 'turret' && def.pattern !== 'mine';
    const target = nearestEnemy(p.x, p.y, range);

    if (needsTarget && !target) continue;
    if ((def.pattern === 'cone' || def.pattern === 'aura') && !nearestEnemy(p.x, p.y, range * 1.4)) continue;
    if (def.pattern === 'turret' || def.pattern === 'mine') {
      if (!nearestEnemy(p.x, p.y, range * 2)) continue;
    }

    const angle = target ? angleTo(p.x, p.y, target.x, target.y) : p.facing;
    w.cd = def.cd;
    w.anim = 1;
    w.shots++;
    if (target) p.aimAngle = angle;

    fireWeapon(w, angle, target);

    // Echo-Verzauberung: sofortige Wiederholung
    const echo = weaponEnch(w, 'echo');
    if (echo && vfxRng.chance(echo)) {
      delay(0.1, () => {
        const t2 = nearestEnemy(p.x, p.y, range);
        fireWeapon(w, t2 ? angleTo(p.x, p.y, t2.x, t2.y) : angle, t2);
        notice(p.x, p.y - 50, 'Echo', '#c06ff0', 13);
      });
    }
  }
}

export function fireWeapon(w, angle, target) {
  const def = w.def;
  const p = G.player;
  const dmgType = dominantType(def);
  const extraShots = weaponEnch(w, 'vielschuss');
  const pierceBonus = weaponEnch(w, 'durchschlag');
  const bounce = weaponEnch(w, 'abprall');
  const swirl = 1 + weaponEnch(w, 'wirbel');
  const range = weaponRange(w);
  const am = areaMul(w);
  const dotMul = 1 + G.stats.dotDuration;

  switch (def.pattern) {
    case 'swing': {
      const r = (def.range) * (1 + G.stats.range) * swirl;
      const arc = def.arc * swirl;
      w.animDir *= -1;
      swipe(p.x, p.y, angle, r, arc, def.color, 'arc', { life: 0.2 });
      sfx('swing', { pitch: 1 / (0.7 + def.cd * 0.4) });
      const pool = G.pools.enemies;
      for (let i = pool.count - 1; i >= 0; i--) {
        const e = pool.items[i];
        if (!e.alive || e.spawnT > 0) continue;
        if (!inArc(e.x, e.y, p.x, p.y, r + e.r, angle, arc * 0.5)) continue;
        const a = angleTo(p.x, p.y, e.x, e.y);
        dealDamage(e, def.dmg, {
          type: dmgType, weapon: w, dirX: Math.cos(a), dirY: Math.sin(a), source: def.id,
        });
      }
      addShake(def.dmg > 30 ? 4 : 1.5);
      break;
    }

    case 'thrust': {
      const len = range * swirl;
      const width = (def.width || 20) * swirl;
      const count = def.count || 1;
      const spread = def.spread || 0;
      for (let c = 0; c < count; c++) {
        const a = angle + (count > 1 ? (c / (count - 1) - 0.5) * spread * 2 : 0);
        const ex = p.x + Math.cos(a) * len, ey = p.y + Math.sin(a) * len;
        swipe(p.x, p.y, a, len, 0, def.color, 'line', { life: 0.16, width, length: len });
        let pierce = (def.pierce || 1) + pierceBonus;
        const pool = G.pools.enemies;
        const order = [];
        for (let i = 0; i < pool.count; i++) {
          const e = pool.items[i];
          if (!e.alive || e.spawnT > 0) continue;
          if (pointSeg2(e.x, e.y, p.x, p.y, ex, ey) > (width * 0.5 + e.r) ** 2) continue;
          order.push(e);
        }
        order.sort((a1, b1) => dist2(p.x, p.y, a1.x, a1.y) - dist2(p.x, p.y, b1.x, b1.y));
        for (const e of order) {
          if (pierce-- <= 0) break;
          dealDamage(e, def.dmg, {
            type: dmgType, weapon: w, dirX: Math.cos(a), dirY: Math.sin(a), source: def.id,
          });
        }
      }
      sfx('thrust');
      break;
    }

    case 'slam': {
      const tx = target ? target.x : p.x + Math.cos(angle) * range * 0.6;
      const ty = target ? target.y : p.y + Math.sin(angle) * range * 0.6;
      const r = (def.area || 90) * am;
      swipe(tx, ty, 0, r, TAU, def.color, 'circle', { life: 0.26 });
      areaDamage(tx, ty, r, def.dmg, {
        type: dmgType, weapon: w, source: def.id, ignoreSize: true,
      });
      if (def.slow) {
        forEnemiesInRadius(tx, ty, r, (e) => applyStatus(e, 'slow', (def.slowTime || 2) * dotMul, def.slow));
      }
      ring(tx, ty, r * 0.2, r, { color: def.color, life: 0.35, width: 6 });
      dust(tx, ty, r * 0.6);
      addShake(6);
      sfx('heavy');
      break;
    }

    case 'shoot': {
      const n = (def.count || 1) + extraShots;
      for (let c = 0; c < n; c++) {
        const isExtra = c >= (def.count || 1);
        const jitter = (def.spread || 0) * (vfxRng.next() - 0.5);
        const a = angle + jitter + (isExtra ? (c - (def.count || 1) + 1) * 0.14 * (c % 2 ? 1 : -1) : 0);
        spawnProjectile(p.x, p.y - 4, a, {
          dmg: def.dmg * (isExtra ? 0.5 : 1), speed: def.speed || 520,
          size: (def.projSize || 7) * swirl, range: range * 1.15, color: def.color,
          type: dmgType, weapon: w, source: def.id,
          pierce: (def.pierce || 0) + pierceBonus, bounce,
          area: def.area ? def.area * am : 0,
          burn: def.burn || 0, burnT: (def.burnTime || 0) * dotMul,
          poison: def.poison || 0, poisonT: (def.poisonTime || 0) * dotMul,
          slow: def.slow || 0, slowT: (def.slowTime || 0) * dotMul,
          knock: def.knock || 0, cloud: def.cloud || 0,
          trailColor: def.cls === 'elementar' ? def.color : null,
          spin: 6,
        });
      }
      sfx(def.area ? 'bomb' : 'shoot', { pitch: def.area ? 0.8 : 1 + (1 - Math.min(1, def.cd)) * 0.3, gain: def.area ? 0.7 : 1 });
      break;
    }

    case 'shotgun': {
      const n = (def.count || 5) + extraShots;
      for (let c = 0; c < n; c++) {
        const a = angle + ((c / Math.max(1, n - 1)) - 0.5) * (def.spread || 0.5) * 2 + vfxRng.range(-0.05, 0.05);
        spawnProjectile(p.x, p.y - 4, a, {
          dmg: def.dmg, speed: (def.speed || 600) * vfxRng.range(0.88, 1.12),
          size: (def.projSize || 6) * swirl, range: range * vfxRng.range(0.85, 1.1),
          color: def.color, type: dmgType, weapon: w, source: def.id,
          pierce: (def.pierce || 0) + pierceBonus, bounce, knock: def.knock || 0,
        });
      }
      swipe(p.x, p.y, angle, 56, def.spread * 2, def.color, 'arc', { life: 0.12 });
      addShake(3);
      sfx('shoot', { pitch: 0.7, gain: 1.2 });
      break;
    }

    case 'pierce': {
      const n = 1 + extraShots;
      for (let c = 0; c < n; c++) {
        const a = angle + (c ? c * 0.1 * (c % 2 ? 1 : -1) : 0);
        spawnProjectile(p.x, p.y - 4, a, {
          dmg: def.dmg * (c ? 0.5 : 1), speed: def.speed || 860,
          size: (def.projSize || 8) * swirl, range: range * 1.2, color: def.color,
          type: dmgType, weapon: w, source: def.id,
          pierce: (def.pierce || 3) + pierceBonus, bounce,
          trailColor: def.color, knock: def.knock || 0,
        });
      }
      sfx('laser', { pitch: 1.1 });
      break;
    }

    case 'boomerang': {
      spawnProjectile(p.x, p.y - 4, angle, {
        dmg: def.dmg, speed: def.speed || 480, size: (def.projSize || 11) * swirl,
        range: 9999, life: 6, color: def.color, type: dmgType, weapon: w, source: def.id,
        pierce: 99, boomerang: range, spin: 18, trailColor: def.color,
      });
      sfx('swing', { pitch: 1.2 });
      break;
    }

    case 'cone': {
      const r = range * swirl;
      const arc = (def.arc || 0.6) * swirl;
      swipe(p.x, p.y, angle, r, arc, def.color, 'cone', { life: 0.16 });
      const pool = G.pools.enemies;
      for (let i = pool.count - 1; i >= 0; i--) {
        const e = pool.items[i];
        if (!e.alive || e.spawnT > 0) continue;
        if (!inArc(e.x, e.y, p.x, p.y, r + e.r, angle, arc * 0.5)) continue;
        dealDamage(e, def.dmg, {
          type: dmgType, weapon: w, source: def.id, silent: !vfxRng.chance(0.3),
          dirX: Math.cos(angle), dirY: Math.sin(angle),
        });
      }
      for (let i = 0; i < 3; i++) {
        const a = angle + vfxRng.range(-arc / 2, arc / 2);
        const d = vfxRng.range(0.3, 1) * r;
        trail(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, def.color, 10, 0.3);
      }
      sfx('burn', { gain: 0.5 });
      break;
    }

    case 'beam': {
      const len = range * swirl;
      const width = (def.width || 24) * swirl;
      const ex = p.x + Math.cos(angle) * len, ey = p.y + Math.sin(angle) * len;
      swipe(p.x, p.y, angle, len, 0, def.color, 'beam', { life: 0.22, width, length: len });
      const pool = G.pools.enemies;
      for (let i = pool.count - 1; i >= 0; i--) {
        const e = pool.items[i];
        if (!e.alive || e.spawnT > 0) continue;
        if (pointSeg2(e.x, e.y, p.x, p.y, ex, ey) > (width * 0.5 + e.r) ** 2) continue;
        dealDamage(e, def.dmg, {
          type: dmgType, weapon: w, source: def.id,
          dirX: Math.cos(angle), dirY: Math.sin(angle),
        });
        if (def.burn) applyStatus(e, 'burn', (def.burnTime || 2) * dotMul, def.burn);
      }
      addFlash(def.color, 0.08, 10);
      addShake(3);
      sfx('laser', { pitch: 0.8 });
      break;
    }

    case 'chain': {
      let current = target;
      const seen = [];
      const links = (def.chain || 3) + Math.floor(extraShots);
      let fromX = p.x, fromY = p.y;
      for (let c = 0; c < links && current; c++) {
        seen.push(current);
        lightning(fromX, fromY, current.x, current.y, def.color);
        dealDamage(current, def.dmg * Math.pow(0.88, c), {
          type: dmgType, weapon: w, source: def.id,
        });
        fromX = current.x; fromY = current.y;
        current = nearestEnemy(fromX, fromY, def.chainRange || 130, (o) => !seen.includes(o));
      }
      sfx('zap');
      break;
    }

    case 'turret': {
      let spot = { x: p.x + Math.cos(angle) * 40, y: p.y + Math.sin(angle) * 40 };
      spawnTurret(spot.x, spot.y, w);
      break;
    }

    case 'mine': {
      const a = angle + vfxRng.range(-0.5, 0.5);
      const d = vfxRng.range(50, def.range || 120);
      spawnMine(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, w);
      sfx('ui', { pitch: 0.7 });
      break;
    }

    case 'aura': {
      const r = range * swirl;
      ring(p.x, p.y, r * 0.5, r, { color: def.color, life: 0.4, width: 4 });
      let hit = 0;
      forEnemiesInRadius(p.x, p.y, r, (e) => {
        dealDamage(e, def.dmg, {
          type: dmgType, weapon: w, source: def.id, silent: !vfxRng.chance(0.25),
        });
        hit++;
      });
      if (hit && def.heal) healPlayer(def.heal, true);
      sfx('burn', { gain: 0.35, pitch: 1.4 });
      break;
    }

    default:
      break;
  }
}

/** Orbit-Waffen halten eine feste Zahl kreisender Klingen. */
function updateOrbitWeapon(w, dt) {
  const def = w.def;
  const pool = G.pools.orbiters;
  const want = def.count || 1;
  const swirl = 1 + weaponEnch(w, 'wirbel');

  // Fehlende Klingen ergänzen
  let own = 0;
  for (let i = 0; i < pool.count; i++) if (pool.items[i].weapon === w) own++;
  for (let i = own; i < want; i++) {
    const o = pool.spawn();
    if (!o) break;
    o.weapon = w;
    o.angle = (i / want) * TAU;
    o.color = def.color;
  }

  const p = G.player;
  const radius = def.range * (1 + G.stats.range) * swirl;
  const speed = (def.orbitSpeed || 3) * attackSpeedMul();

  for (let i = pool.count - 1; i >= 0; i--) {
    const o = pool.items[i];
    if (o.weapon !== w) continue;
    o.angle += speed * dt;
    o.radius = radius;
    o.r = 13 * swirl;
    o.x = p.x + Math.cos(o.angle) * radius;
    o.y = p.y + Math.sin(o.angle) * radius;
    o.hitCd -= dt;
    if (o.hitCd > 0) continue;

    const hit = nearestEnemy(o.x, o.y, o.r + 16);
    if (hit) {
      o.hitCd = def.cd;
      const a = o.angle + Math.PI * 0.5;
      dealDamage(hit, def.dmg, {
        type: dominantType(def), weapon: w, source: def.id,
        dirX: Math.cos(a), dirY: Math.sin(a),
      });
      burst(o.x, o.y, 4, { color: def.color, speed: 120, life: 0.2 });
      sfx('hit', { gain: 0.6, pitch: 1.3 });
    }
  }
}

export function clearOrbiters(weapon = null) {
  const pool = G.pools.orbiters;
  for (let i = pool.count - 1; i >= 0; i--) {
    if (!weapon || pool.items[i].weapon === weapon) pool.release(i);
  }
}

export function dominantType(def) {
  const s = def.scale || {};
  let best = 'melee', v = -1;
  for (const k in s) if (s[k] > v) { v = s[k]; best = k; }
  return best;
}

// --- Artefakte --------------------------------------------------------

/** Kontext, den die Artefakt-Definitionen bekommen. */
function artifactCtx() {
  const p = G.player;
  return {
    px: p.x, py: p.y, facing: p.facing, level: G.level, maxHp: p.maxHp,
    nearestEnemy: (r) => nearestEnemy(p.x, p.y, r),
    enemiesInRadius: (x, y, r, n) => enemiesInRadius(x, y, r, n),
    forEnemiesInRadius,
    areaDamage,
    applyStatus,
    spawnField,
    spawnAlly,
    spawnProjectile: (x, y, a, o) => spawnProjectile(x, y, a, o),
    spawnBomb,
    spawnRocket,
    spawnDelayed: delay,
    lightning,
    globalSlow,
    healPlayer,
    buffPlayer: addBuff,
    explosion,
    ring,
    burst,
    shake: addShake,
    flash: addFlash,
    sfx,
  };
}

export function artifactCooldown(inst) {
  return inst.def.cd * (1 + G.stats.artifactCd);
}

export function useArtifact(index) {
  const inst = G.artifacts[index];
  if (!inst || inst.cd > 0) {
    if (inst) sfx('error');
    return false;
  }
  const ok = inst.def.use(artifactCtx());
  if (ok) {
    inst.cd = artifactCooldown(inst);
    inst.uses++;
    buzz(22);
  }
  return ok;
}

export function updateArtifacts(dt) {
  for (const a of G.artifacts) if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);
}
