// Spielschleife, Wellenverwaltung, Spielerlogik, Rendering.

import {
  TAU, clamp, lerp, damp, dist, dist2, angleTo, angleDiff, angleLerp,
  easeOutCubic, easeOutBack, fmtTime,
} from '../core/math.js';
import { vfxRng } from '../core/rng.js';
import {
  updateFx, drawParticles, drawDecals, drawRings, drawTexts, clearFx,
  clearTransient, shakeOffset, flashState, consumeHitStop, addShake, addFlash,
  burst, ring, notice, dust, smoke, trail, damageText, explosion,
} from '../core/fx.js';
import {
  playerSprite, enemySprite, bossSprite, weaponSprite, glowSprite, shadowSprite,
  knolleSprite, orbSprite, heartSprite, armorIcon, artifactIcon, dotSprite,
  vignette, alpha, shade, mix, chestSprite, propSprite, ringSprite,
} from '../core/sprites.js';
import {
  input, pollInput, endInputFrame, consumeRoll, consumeArtifact, consumePause, setButtons,
} from '../core/input.js';
import { sfx, sfxAt, buzz, startMusic, setMusicMood, music, stopMusic } from '../core/audio.js';
import { settings, progress, markDirty, tickSave } from '../core/storage.js';
import { HAZARDS, poolForWave, DIFFICULTIES } from '../data/biomes.js';
import { ELITE_IDS } from '../data/enemies.js';
import { BASE_SPEED } from '../data/characters.js';
import {
  G, PHASE, playerSpeed, tickBuffs, hasBuff, addBuff, recomputeStats,
  startRun, runSummary, artifactSlotCount, weaponSlotCount,
} from './state.js';
import { clearTransientEntities } from './entities.js';
import {
  generateArena, arenaZoomFor, drawFloor, drawWalls, drawProps, drawHazards,
  drawChests, drawTorchLights, collideCircle, hazardAt, pickSpawnPoint,
} from './dungeon.js';
import {
  updateWeapons, updateProjectiles, updateFields, updateAllies, updateTurrets,
  updateMines, updateBombs, updateRockets, updateSwipes, updateTimers,
  updateBolts, updateArtifacts, useArtifact, artifactCooldown, damagePlayer,
  healPlayer, nearestEnemy, dealDamage, areaDamage, clearOrbiters, forEnemiesInRadius,
  applyStatus, spawnField,
} from './combat.js';
import {
  spawnEnemy, spawnBoss, updateEnemies, countEnemies, despawnAllEnemies,
} from './ai.js';
import { updatePickups, vacuumPickups, openChest, breakProp, rollShop } from './loot.js';

// --- Laufzeit ----------------------------------------------------------

export const rt = {
  canvas: null,
  ctx: null,
  dpr: 1,
  w: 800, h: 600,          // CSS-Pixel
  running: false,
  lastT: 0,
  acc: 0,
  fps: 60,
  frames: 0,
  fpsT: 0,
  slowFrames: 0,
  errors: 0,
  downgraded: false,       // Auflösung wurde bereits einmal abgesenkt
  quality: 1,              // wird automatisch gesenkt, wenn es ruckelt
  onPhaseChange: null,
  onWaveEnd: null,
  onLevelUp: null,
  onDeath: null,
  onWin: null,
  onPauseRequest: null,
  onUpdate: null,
};

const view = { left: 0, top: 0, right: 0, bottom: 0 };
const drawList = [];

export function initRuntime(canvas) {
  rt.canvas = canvas;
  rt.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  resizeRuntime();
  window.addEventListener('resize', resizeRuntime);
  window.addEventListener('orientationchange', () => setTimeout(resizeRuntime, 120));
}

export function resizeRuntime() {
  if (!rt.canvas) return;
  const cssW = Math.max(240, window.innerWidth);
  const cssH = Math.max(240, window.innerHeight);
  // Auf Handys ist devicePixelRatio oft 3 — das kostet viel und bringt kaum
  // etwas. 2 ist der Punkt, an dem es scharf aussieht und flüssig bleibt.
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2) * rt.quality;
  rt.w = cssW; rt.h = cssH; rt.dpr = dpr;
  rt.canvas.width = Math.round(cssW * dpr);
  rt.canvas.height = Math.round(cssH * dpr);
  rt.canvas.style.width = cssW + 'px';
  rt.canvas.style.height = cssH + 'px';
  G.camera.w = cssW; G.camera.h = cssH;
}

// --- Kamera ------------------------------------------------------------

function updateCamera(dt) {
  const cam = G.camera;
  const p = G.player;
  const want = G.arena ? G.arena.zoom : arenaZoomFor(rt.w, rt.h, 1, false);
  cam.zoom = damp(cam.zoom || want, want, 6, dt);

  const viewW = rt.w / cam.zoom;
  const viewH = rt.h / cam.zoom;

  // Leichtes Vorhalten in Laufrichtung macht Ausweichen lesbarer.
  const leadX = clamp(p.vx * 0.22, -140, 140);
  const leadY = clamp(p.vy * 0.22, -140, 140);
  let tx = p.x + leadX;
  let ty = p.y + leadY;

  if (G.arena) {
    const a = G.arena;
    if (viewW >= a.w) tx = 0;
    else tx = clamp(tx, -a.halfW + viewW / 2, a.halfW - viewW / 2);
    if (viewH >= a.h) ty = 0;
    else ty = clamp(ty, -a.halfH + viewH / 2, a.halfH - viewH / 2);
  }

  cam.x = damp(cam.x, tx, 9, dt);
  cam.y = damp(cam.y, ty, 9, dt);

  const sh = shakeOffset();
  cam.shakeX = sh.x; cam.shakeY = sh.y;

  view.left = cam.x - viewW / 2 - 60;
  view.right = cam.x + viewW / 2 + 60;
  view.top = cam.y - viewH / 2 - 60;
  view.bottom = cam.y + viewH / 2 + 60;
}

// --- Lauf / Wellen -----------------------------------------------------

export function beginRun(opts) {
  startRun(opts);
  clearFx();
  clearTransientEntities(G.pools);
  G.pools.orbiters.clear();
  G.pools.pickups.clear();
  G.permanentHp = 0;
  G.globalSlowT = 0;
  G.pendingGear = [];
  G.pendingItems = [];
  G.pendingArtifacts = [];
  G.shop = null;
  G.rerolls = 0;
  G.camera.zoom = arenaZoomFor(rt.w, rt.h, 1, false);

  const pr = progress();
  pr.runs++;
  markDirty();

  startWave(1);
  startMusic('calm', 110);
  return G;
}

export function startWave(n) {
  G.wave = n;
  const isBoss = n >= G.biome.waves;
  const isMini = !isBoss && n % 5 === 0;

  G.arena = generateArena(G.rng, {
    wave: n, biome: { ...G.biome, id: G.biomeId }, boss: isBoss,
    viewW: rt.w, viewH: rt.h,
  });

  // Spieler in die Mitte, Welt leeren
  const p = G.player;
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
  p.invuln = 1.0;
  p.rolling = 0;
  p.rollCd = 0;
  clearTransient();
  clearTransientEntities(G.pools, { keepPickups: false });
  G.pools.orbiters.clear();
  G.globalSlowT = 0;

  G.waveDamageTaken = 0;
  G.waveActive = true;
  G.waveClearing = false;
  G.bossRef = null;
  G.isBossWave = isBoss;
  G.isMiniWave = isMini;

  // Dauer und Gegnerbudget
  G.waveDuration = isBoss ? 0 : clamp(19 + n * 1.5, 19, 52);
  G.waveTime = G.waveDuration;

  const budgetBase = (7 + n * 3.4 + Math.pow(n, 1.55) * 0.5) * G.difficulty.countMul;
  G.spawnBudget = isBoss ? 0 : Math.round(budgetBase * (isMini ? 0.75 : 1));
  G.spawnTimer = 0.6;
  G.spawnedThisWave = 0;

  if (isBoss) {
    const bx = 0, by = -G.arena.halfH * 0.45;
    spawnBoss(G.biome.boss, bx, by);
    setMusicMood('boss', 1);
  } else {
    setMusicMood(n >= G.biome.waves - 4 ? 'tense' : 'calm', clamp(n / G.biome.waves, 0.05, 0.9));
    if (isMini) {
      // Miniboss: ein Elite aus dem Biom-Pool
      const id = G.rng.pick(G.biome.miniboss);
      const spot = pickSpawnPoint(G.arena, G.rng, p.x, p.y, 520);
      const elite = G.rng.pick(['gross', 'gepanzert', 'rasend']);
      const e = spawnEnemy(id, spot.x, spot.y, { elite, wave: n + 2 });
      if (e) {
        e.maxHp *= 2.4; e.hp = e.maxHp;
        e.knollen *= 2;
        e.xp *= 2;
        notice(e.x, e.y - e.r - 30, 'Anführer!', e.eliteColor || '#ffd93d', 22);
      }
      sfx('bossRoar', { gain: 0.5, pitch: 1.3 });
    }
  }

  sfx('waveStart');
  if (rt.onPhaseChange) rt.onPhaseChange('wave', n);
}

function spawnTick(dt) {
  if (G.isBossWave || G.spawnBudget <= 0) return;
  G.spawnTimer -= dt;
  if (G.spawnTimer > 0) return;

  // Gegner kommen in Gruppen, nicht im Dauertropf — das erzeugt Wellen
  // innerhalb der Welle und gibt Luft zum Einsammeln.
  const alive = countEnemies();
  const cap = Math.round(26 + G.wave * 2.6);
  if (alive >= cap) { G.spawnTimer = 0.5; return; }

  const pool = poolForWave(G.biome, G.wave);
  const groupSize = clamp(2 + Math.floor(G.wave / 3), 2, 8);
  const n = Math.min(groupSize, G.spawnBudget, cap - alive);

  const pickId = () => {
    const chosen = G.rng.weighted(pool, (o) => o.weight);
    return chosen ? chosen.id : 'kaefer';
  };

  // Gruppe am gleichen Rand, damit eine Richtung bedrohlich wird
  const anchor = pickSpawnPoint(G.arena, G.rng, G.player.x, G.player.y, 460);
  const groupId = G.rng.chance(0.65) ? pickId() : null;

  for (let i = 0; i < n; i++) {
    const id = groupId || pickId();
    const a = G.rng.angle(), d = G.rng.range(0, 90);
    let x = anchor.x + Math.cos(a) * d;
    let y = anchor.y + Math.sin(a) * d;
    x = clamp(x, -G.arena.halfW + 40, G.arena.halfW - 40);
    y = clamp(y, -G.arena.halfH + 40, G.arena.halfH - 40);

    // Elite-Chance steigt mit der Welle
    let elite = null;
    const eliteChance = clamp((G.wave - 3) * 0.016, 0, 0.2) * (1 + G.difficulty.id * 0.2);
    if (G.wave >= 4 && G.rng.chance(eliteChance)) elite = G.rng.pick(ELITE_IDS);

    spawnEnemy(id, x, y, { elite, wave: G.wave });
    G.spawnBudget--;
    G.spawnedThisWave++;
  }

  const pace = clamp(2.6 - G.wave * 0.07, 0.75, 2.6);
  G.spawnTimer = pace * G.rng.range(0.75, 1.3);
}

function checkWaveEnd(dt) {
  if (!G.waveActive) return;

  if (G.isBossWave) {
    if (G.bossRef && !G.bossRef.alive) G.bossRef = null;
    if (!G.bossRef && countEnemies() === 0) finishWave();
    return;
  }

  G.waveTime -= dt;
  if (G.waveTime <= 0 && !G.waveClearing) {
    G.waveClearing = true;
    G.waveTime = 0;
    finishWave();
  }
}

function finishWave() {
  G.waveActive = false;
  G.waveClearing = false;

  despawnAllEnemies();
  G.pools.hostileProjectiles.clear();
  G.pools.fields.clear();

  const picked = vacuumPickups();
  if (picked > 0) sfx('coin', { pitch: 1.3 });

  if (G.waveDamageTaken <= 0) {
    G.flawlessWaves++;
    notice(G.player.x, G.player.y - 70, 'Ohne Kratzer!', '#7bd44f', 22);
  }

  // Teufelskartoffel bezahlt jede Welle
  if (G.character.trait === 'pakt') {
    G.permanentHp = (G.permanentHp || 0) - 2;
    recomputeStats();
    G.player.hp = Math.min(G.player.hp, G.player.maxHp);
  }
  // Goldene Knolle bekommt Zinsen
  if (G.character.trait === 'goldrausch' && G.knollen > 0) {
    const interest = Math.floor(G.knollen * 0.1);
    if (interest > 0) {
      G.knollen += interest;
      notice(G.player.x, G.player.y - 48, `+${interest} Zinsen`, '#f5cf3a', 18);
    }
  }

  sfx('waveEnd');
  addFlash('#ffffff', 0.12, 5);

  const pr = progress();
  pr.kills = (pr.kills || 0) + 0;
  if (G.wave > (pr.bestWave || 0)) { pr.bestWave = G.wave; }
  markDirty();

  if (G.wave >= G.biome.waves) {
    G.phase = PHASE.WIN;
    stopMusic();
    if (rt.onWin) rt.onWin(runSummary());
  } else {
    G.phase = PHASE.CAMP;
    G.shop = rollShop(G.rng, 4);
    G.rerolls = 0;
    setMusicMood('calm', 0.1);
    if (rt.onWaveEnd) rt.onWaveEnd(G.wave);
  }
}

export function continueToNextWave() {
  G.phase = PHASE.PLAYING;
  startWave(G.wave + 1);
}

// --- Spieler -----------------------------------------------------------

const ROLL_TIME = 0.26;
const ROLL_SPEED = 720;

function updatePlayer(dt) {
  const p = G.player;
  const s = G.stats;

  if (p.dead) return;

  // Rollen
  if (p.rollCd > 0) p.rollCd -= dt;
  if (p.rolling > 0) {
    p.rolling -= dt;
    const k = p.rolling / ROLL_TIME;
    const sp = ROLL_SPEED * (0.45 + easeOutCubic(k) * 0.8);
    p.vx = p.rollDirX * sp;
    p.vy = p.rollDirY * sp;
    if (vfxRng.chance(dt * 40)) trail(p.x, p.y + 6, '#ffe79a', 7, 0.25);
  } else if (consumeRoll() && p.rollCd <= 0) {
    const flink = G.character.trait === 'flink';
    p.rolling = ROLL_TIME;
    p.rollCd = (0.95 * (flink ? 0.5 : 1)) * (1 + s.rollCd);
    p.invuln = Math.max(p.invuln, ROLL_TIME + 0.12 + (flink ? 0.4 : 0));
    let dx = input.moveX, dy = input.moveY;
    if (Math.hypot(dx, dy) < 0.15) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
    const l = Math.hypot(dx, dy) || 1;
    p.rollDirX = dx / l; p.rollDirY = dy / l;
    if (G.character.trait === 'hinterhalt') p.ambush = true;
    dust(p.x, p.y, 22, '#d9c8a8');
    sfx('roll');
    buzz(14);
  } else {
    // Normale Bewegung
    const speed = playerSpeed();
    const ax = input.moveX * speed;
    const ay = input.moveY * speed;
    // Beschleunigen/abbremsen statt harte Geschwindigkeit — fühlt sich an,
    // ohne träge zu werden.
    p.vx = damp(p.vx, ax, 16, dt);
    p.vy = damp(p.vy, ay, 16, dt);
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (G.arena) collideCircle(G.arena, p, p.r);

  // Blickrichtung: auf Gegner zielen, sonst Laufrichtung
  const target = nearestEnemy(p.x, p.y, 760);
  if (settings().aimMode === 'stick' && input.aimActive) {
    p.aimAngle = Math.atan2(input.aimY, input.aimX);
  } else if (target) {
    p.aimAngle = angleLerp(p.aimAngle, angleTo(p.x, p.y, target.x, target.y), clamp(dt * 14, 0, 1));
  } else if (Math.hypot(p.vx, p.vy) > 20) {
    p.aimAngle = angleLerp(p.aimAngle, Math.atan2(p.vy, p.vx), clamp(dt * 9, 0, 1));
  }
  p.facing = p.aimAngle;

  // Laufanimation
  const movement = Math.hypot(p.vx, p.vy);
  p.walkT += dt * (1 + movement / BASE_SPEED * 7);

  if (p.invuln > 0) p.invuln -= dt;
  if (p.hitFlash > 0) p.hitFlash -= dt;

  // Regeneration
  if (s.hpRegen !== 0 && p.hp < p.maxHp) {
    p.regenAcc += s.hpRegen * dt;
    if (p.regenAcc >= 1) {
      const whole = Math.floor(p.regenAcc);
      p.regenAcc -= whole;
      p.hp = Math.min(p.maxHp, p.hp + whole);
    }
  } else if (s.hpRegen < 0) {
    p.regenAcc += s.hpRegen * dt;
    if (p.regenAcc <= -1) {
      p.regenAcc += 1;
      p.hp = Math.max(1, p.hp - 1);
    }
  }

  // Brennen/Vergiften am Spieler
  const b = p.buffs;
  if (b.burning) {
    p.dotAcc = (p.dotAcc || 0) + dt;
    if (p.dotAcc >= 0.4) {
      p.dotAcc = 0;
      damagePlayer(b.burning.v * 0.4, { source: 'burn', undodgeable: true });
      trail(p.x + vfxRng.range(-8, 8), p.y - 8, '#ff8a3d', 6, 0.3);
    }
  }
  if (b.poisoned) {
    p.poisonAcc = (p.poisonAcc || 0) + dt;
    if (p.poisonAcc >= 0.5) {
      p.poisonAcc = 0;
      damagePlayer(b.poisoned.v * 0.5, { source: 'poison', undodgeable: true });
      trail(p.x + vfxRng.range(-8, 8), p.y - 8, '#8fd14f', 6, 0.35);
    }
  }

  // Gefahren am Boden
  if (G.arena && p.rolling <= 0) {
    const hz = hazardAt(G.arena, p.x, p.y, -p.r * 0.3);
    if (hz) {
      const hd = HAZARDS[hz.type];
      if (hd) {
        p.hazardAcc = (p.hazardAcc || 0) + dt;
        if (p.hazardAcc >= 0.35) {
          p.hazardAcc = 0;
          damagePlayer(hd.dmgPerSec * 0.35, { source: hz.type, undodgeable: true });
        }
        if (hd.slow) addBuff('chill', 0.3, hd.slow);
        if (hd.burn) addBuff('burning', 2.2, hd.burn);
        if (hd.poison) addBuff('poisoned', 2.5, hd.poison);
      }
    }
  }

  // Frostknolle: dauerhafte Kälteaura
  if (G.character.trait === 'kaelteaura') {
    forEnemiesInRadius(p.x, p.y, 165, (e) => applyStatus(e, 'slow', 0.3, 0.3));
  }

  // Truhen öffnen, Kisten zerschlagen
  if (G.arena) {
    for (const c of G.arena.chests) {
      if (c.opened) continue;
      if (dist2(p.x, p.y, c.x, c.y) < (p.r + 34) ** 2) openChest(c);
    }
    for (const pr of G.arena.props) {
      if (pr.broken || !pr.hp) continue;
      if (dist2(p.x, p.y, pr.x, pr.y) < (p.r + pr.r + 2) ** 2 && p.rolling > 0) breakProp(pr);
    }
  }

  // Artefakte
  for (let i = 0; i < Math.min(3, G.artifacts.length); i++) {
    if (consumeArtifact(i)) useArtifact(i);
  }

  if (G.globalSlowT > 0) G.globalSlowT -= dt;

  tickBuffs(dt);

  if (p.hp <= 0 && !p.dead) p.dead = true;
  if (p.dead) onPlayerDeath();
}

function onPlayerDeath() {
  if (G.phase === PHASE.DEAD) return;
  G.phase = PHASE.DEAD;
  G.waveActive = false;
  const p = G.player;
  explosion(p.x, p.y, 160, { color: '#e04a5a', color2: '#ffd27a' });
  addShake(24);
  addFlash('#ff3a3a', 0.45, 2);
  sfx('death');
  buzz(220);
  stopMusic();
  if (rt.onDeath) rt.onDeath(runSummary());
}

// --- Haupt-Update ------------------------------------------------------

export function update(dt) {
  pollInput();

  // Pause-Taste/Knopf wird hier abgefangen, nicht im Spielzustand — sonst
  // kommt man aus einem Menü nicht mehr heraus.
  if (consumePause() && rt.onPauseRequest) rt.onPauseRequest();

  if (G.phase === PHASE.PLAYING && !G.paused) {
    // Treffer-Standbild: kurze Pause nach schweren Schlägen
    const stop = consumeHitStop(dt);
    const sim = Math.max(0, dt - stop);

    G.runTime += sim;
    updatePlayer(sim);
    updateWeapons(sim);
    updateEnemies(sim);
    updateProjectiles(sim);
    updateFields(sim);
    updateAllies(sim);
    updateTurrets(sim);
    updateMines(sim);
    updateBombs(sim);
    updateRockets(sim);
    updateSwipes(sim);
    updateBolts(sim);
    updateTimers(sim);
    updateArtifacts(sim);
    updatePickups(sim);
    spawnTick(sim);
    checkWaveEnd(sim);

    // Stufenaufstieg unterbricht die Welle
    if (G.pendingLevels > 0 && rt.onLevelUp) {
      const n = G.pendingLevels;
      G.pendingLevels = 0;
      rt.onLevelUp(n);
    }

    const pr = progress();
    pr.playtime = (pr.playtime || 0) + sim;
    tickSave(sim);
  } else if (G.player && G.arena) {
    // Im Lager und in der Pause bleibt die Welt stehen, Beute trudelt aber
    // noch aus — das sieht beim Zurückkommen richtig aus.
    updatePickups(Math.min(dt, 0.05));
  }

  updateFx(dt);
  if (G.player) updateCamera(dt);
  if (rt.onUpdate) rt.onUpdate(dt);
  endInputFrame();
}

// --- Rendering ---------------------------------------------------------

export function render() {
  const g = rt.ctx;
  if (!g) return;

  g.setTransform(rt.dpr, 0, 0, rt.dpr, 0, 0);
  g.fillStyle = G.arena ? G.arena.pal.fog : '#12100c';
  g.fillRect(0, 0, rt.w, rt.h);

  if (!G.arena || !G.player) return;

  const cam = G.camera;
  const z = cam.zoom;

  g.save();
  g.translate(rt.w / 2 + cam.shakeX, rt.h / 2 + cam.shakeY);
  g.scale(z, z);
  g.translate(-cam.x, -cam.y);

  const t = G.runTime;

  drawFloor(g, G.arena, view);
  drawDecals(g);
  drawHazards(g, G.arena, t);
  drawFieldsLayer(g, t);
  drawMinesLayer(g, t);
  drawChests(g, G.arena, t);
  drawPickupsLayer(g, t);
  drawSwipesBack(g);

  drawEntities(g, t);

  drawProjectilesLayer(g);
  drawSwipesFront(g);
  drawOrbiters(g, t);
  drawBoltsLayer(g);
  drawWalls(g, G.arena, view);

  if (settings().particles > 0) drawParticles(g);
  drawRings(g);

  g.restore();

  // Dunkelheit liegt über der Welt, nicht darunter: erst wird alles normal
  // gezeichnet, dann deckt eine Maske zu, in die Fackeln Löcher brennen.
  drawDarkness(g, cam, z);

  g.save();
  g.translate(rt.w / 2 + cam.shakeX, rt.h / 2 + cam.shakeY);
  g.scale(z, z);
  g.translate(-cam.x, -cam.y);
  drawTorchLights(g, G.arena, t);
  drawTexts(g, 1);
  g.restore();

  drawScreenEffects(g);
  drawTouchControls(g);
}

/** Alles, was nach y sortiert gezeichnet werden muss. */
function drawEntities(g, t) {
  drawList.length = 0;

  const ep = G.pools.enemies;
  for (let i = 0; i < ep.count; i++) {
    const e = ep.items[i];
    if (!e.alive || e.hidden) continue;
    if (e.x < view.left - 120 || e.x > view.right + 120) continue;
    if (e.y < view.top - 160 || e.y > view.bottom + 160) continue;
    drawList.push(e);
  }
  const ap = G.pools.allies;
  for (let i = 0; i < ap.count; i++) drawList.push(ap.items[i]);
  const tp = G.pools.turrets;
  for (let i = 0; i < tp.count; i++) drawList.push(tp.items[i]);
  for (const pr of G.arena.props) {
    if (pr.broken) continue;
    if (pr.x < view.left - 100 || pr.x > view.right + 100) continue;
    if (pr.y < view.top - 160 || pr.y > view.bottom + 100) continue;
    drawList.push(pr);
  }
  drawList.push(G.player);

  drawList.sort(byY);

  for (const o of drawList) {
    if (o === G.player) drawPlayer(g, o, t);
    else if (o.etype === 'enemy') (o.boss ? drawBoss : drawEnemy)(g, o, t);
    else if (o.etype === 'ally') drawAlly(g, o, t);
    else if (o.etype === 'turret') drawTurret(g, o, t);
    else drawProp(g, o, t);
  }
}

const byY = (a, b) => a.y - b.y;

function drawShadow(g, x, y, r, scale = 1) {
  const img = shadowSprite(96);
  const w = r * 2.5 * scale;
  g.globalAlpha = 0.55;
  g.drawImage(img, x - w / 2, y - w * 0.14, w, w * 0.5);
  g.globalAlpha = 1;
}

function drawProp(g, p, t) {
  const img = propSprite(p.id, 72);
  const sw = img.width * p.scale, sh = img.height * p.scale;
  if (p.solid) drawShadow(g, p.x, p.y, p.r * 0.9);
  g.save();
  if (p.flip) { g.translate(p.x, 0); g.scale(-1, 1); g.translate(-p.x, 0); }
  g.drawImage(img, p.x - sw / 2, p.y - sh * 0.78, sw, sh);
  g.restore();
}

function drawPlayer(g, p, t) {
  const skin = G.character.skin;
  const img = playerSprite(skin, 96);
  const size = p.r * 3.1;

  // Eigenes Licht: hebt die Kartoffel vom Boden ab und zeigt, wo "sicher" ist.
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.16;
  const lr = 150;
  g.drawImage(glowSprite(G.arena.pal.light, 256), p.x - lr, p.y - lr, lr * 2, lr * 2);
  g.restore();

  drawShadow(g, p.x, p.y, p.r);

  g.save();
  g.translate(p.x, p.y);

  // Unsichtbarkeit
  if (hasBuff('invis')) g.globalAlpha = 0.4;

  // Rollen = Überschlag
  if (p.rolling > 0) {
    const k = 1 - p.rolling / ROLL_TIME;
    g.rotate(k * TAU * (p.rollDirX >= 0 ? 1 : -1));
  } else {
    // Lauf-Wippen
    const bob = Math.sin(p.walkT * 2.2) * 0.05 * clamp(Math.hypot(p.vx, p.vy) / BASE_SPEED, 0, 1);
    g.rotate(Math.sin(p.walkT * 1.1) * 0.04);
    g.scale(1 + bob, 1 - bob);
  }

  const faceLeft = Math.cos(p.facing) < 0;
  if (faceLeft) g.scale(-1, 1);
  g.drawImage(img, -size / 2, -size * 0.62, size, size);
  g.restore();

  // Treffer-Aufblitzen
  if (p.hitFlash > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(p.hitFlash * 2.4, 0, 0.85);
    g.translate(p.x, p.y);
    if (Math.cos(p.facing) < 0) g.scale(-1, 1);
    g.drawImage(img, -size / 2, -size * 0.62, size, size);
    g.restore();
  }

  // Unverwundbarkeit zeigt einen Ring, kein Blinken (Blinken nervt)
  if (p.invuln > 0 && p.rolling <= 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3 + Math.sin(t * 22) * 0.12;
    g.strokeStyle = '#9ef0ff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(p.x, p.y, p.r + 9, 0, TAU);
    g.stroke();
    g.restore();
  }

  drawPlayerBuffs(g, p, t);
  drawHeldWeapons(g, p, t);
}

function drawPlayerBuffs(g, p, t) {
  const b = p.buffs;
  g.save();
  g.globalCompositeOperation = 'lighter';
  if (b.rage) {
    const r = p.r + 14 + Math.sin(t * 9) * 3;
    g.globalAlpha = 0.3;
    g.drawImage(glowSprite('#ff6b4a', 128), p.x - r, p.y - r, r * 2, r * 2);
  }
  if (b.burning) {
    for (let i = 0; i < 2; i++) {
      if (vfxRng.chance(0.4)) trail(p.x + vfxRng.range(-10, 10), p.y + vfxRng.range(-14, 4), '#ff8a3d', 6, 0.3);
    }
  }
  if (b.chill) {
    const r = p.r + 10;
    g.globalAlpha = 0.25;
    g.drawImage(glowSprite('#9ef0ff', 128), p.x - r, p.y - r, r * 2, r * 2);
  }
  g.restore();

  // Frostknolle sieht ihre Aura
  if (G.character.trait === 'kaelteaura') {
    g.save();
    g.globalAlpha = 0.1 + Math.sin(t * 2) * 0.03;
    g.strokeStyle = '#9ef0ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(p.x, p.y, 165, 0, TAU);
    g.stroke();
    g.restore();
  }
}

/** Waffen liegen im Kreis um die Kartoffel und zeigen in Zielrichtung. */
function drawHeldWeapons(g, p, t) {
  const n = G.weapons.length;
  if (!n) return;
  const baseR = p.r + 7;

  for (let i = 0; i < n; i++) {
    const w = G.weapons[i];
    const def = w.def;
    if (def.pattern === 'orbit' || def.pattern === 'aura') continue;

    // Fächerförmig um die Blickrichtung verteilt
    const spread = Math.min(1.5, 0.42 * (n - 1));
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2;
    const a = p.facing + off;
    const recoil = w.anim > 0 ? easeOutCubic(clamp(w.anim, 0, 1)) : 0;
    const r = baseR + (1 - recoil) * 2;
    const wx = p.x + Math.cos(a) * r;
    const wy = p.y + Math.sin(a) * r * 0.85 + 2;

    const len = clamp(def.range * 0.34, 34, 72);
    const img = weaponSprite(def.art, def.color, 96);

    g.save();
    g.translate(wx, wy);
    g.rotate(a + (def.pattern === 'swing' ? recoil * 0.9 * w.animDir : 0));
    const back = def.pattern === 'thrust' || def.pattern === 'shoot' ? recoil * 9 : 0;
    g.drawImage(img, -len * 0.18 - back, -len * 0.25, len, len * 0.5);
    g.restore();
  }
}

function drawEnemy(g, e, t) {
  const img = enemySprite(e.shape, e.pal, e.spriteSize);
  const size = e.r * 3.4;

  drawShadow(g, e.x, e.y, e.r);

  // Elite-Schein
  if (e.elite) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.34 + Math.sin(t * 4 + e.aiT) * 0.08;
    const r = e.r * 2.3;
    g.drawImage(glowSprite(e.eliteColor, 128), e.x - r, e.y - r, r * 2, r * 2);
    g.restore();
  }

  // Erscheinen: aufpoppen
  let scale = 1;
  if (e.spawnT > 0) {
    const k = 1 - clamp(e.spawnT / 0.42, 0, 1);
    scale = easeOutBack(k);
    g.save();
    g.globalAlpha = clamp(k * 1.6, 0, 1);
  }

  // Vorzeichen beim Ansturm
  if (e.state === 1 && e.chargeWindup > 0) {
    const k = 1 - e.stateT / Math.max(0.01, e.chargeWindup);
    g.save();
    g.globalAlpha = 0.5 * k;
    g.strokeStyle = '#ff6b4a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(e.x, e.y);
    const a = angleTo(e.x, e.y, e.targetX, e.targetY);
    g.lineTo(e.x + Math.cos(a) * 240, e.y + Math.sin(a) * 240);
    g.stroke();
    g.restore();
  }

  g.save();
  g.translate(e.x, e.y);
  g.scale(scale, scale);
  // Hüpfen/Schweben
  let yOff = 0;
  if (e.flying) yOff = Math.sin(t * 6 + e.aiT * 3) * 5;
  if (e.ai === 'hop' && e.state === 6) yOff = -Math.abs(Math.sin((1 - e.stateT / 0.3) * Math.PI)) * 22;
  g.translate(0, yOff);
  if (Math.cos(e.facing) < 0) g.scale(-1, 1);
  g.drawImage(img, -size / 2, -size * 0.62, size, size);
  g.restore();

  if (e.spawnT > 0) g.restore();

  // Zustände
  if (e.hitFlash > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(e.hitFlash * 5, 0, 0.9);
    g.translate(e.x, e.y + (e.flying ? Math.sin(t * 6 + e.aiT * 3) * 5 : 0));
    if (Math.cos(e.facing) < 0) g.scale(-1, 1);
    g.drawImage(img, -size / 2, -size * 0.62, size, size);
    g.restore();
  }
  if (e.frozen > 0) {
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = '#9ef0ff';
    g.beginPath();
    g.arc(e.x, e.y - e.r * 0.2, e.r * 1.2, 0, TAU);
    g.fill();
    g.strokeStyle = '#d8f6ff';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }
  if (e.burn > 0 && vfxRng.chance(0.25)) {
    trail(e.x + vfxRng.range(-e.r, e.r), e.y - e.r * 0.4, '#ff8a3d', 5, 0.3);
  }
  if (e.stun > 0 && e.frozen <= 0) {
    g.save();
    g.globalAlpha = 0.8;
    g.fillStyle = '#ffd93d';
    g.font = '700 16px Outfit, sans-serif';
    g.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i / 3) * TAU;
      g.fillText('✦', e.x + Math.cos(a) * 14, e.y - e.r - 16 + Math.sin(a) * 5);
    }
    g.restore();
  }

  // Lebensbalken nur bei Elites und Angeschlagenen
  if ((e.elite || e.hp < e.maxHp * 0.999) && e.spawnT <= 0) {
    drawHealthBar(g, e.x, e.y - e.r - 14, e.r * 2.1, 4.5, e.hp / e.maxHp, e.eliteColor || '#e8503a');
  }
}

function drawBoss(g, e, t) {
  const img = bossSprite(e.shape, e.pal, e.spriteSize);
  const size = e.r * 3.2;

  drawShadow(g, e.x, e.y, e.r * 1.1, 1.2);

  // Aura
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.28 + Math.sin(t * 2.4) * 0.07;
  const r = e.r * 2.4;
  g.drawImage(glowSprite(e.pal.eye, 256), e.x - r, e.y - r, r * 2, r * 2);
  g.restore();

  // Vorzeichen für den nächsten Angriff
  if (e.windup > 0 && e.tellColor) {
    const md = e.bossDef.moveDefs[e.windupMove];
    const k = md ? 1 - e.windup / Math.max(0.01, md.windup) : 0;
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (md && (md.radius || md.rings)) {
      const rr = (md.radius || 160) * (md.rings ? 1 : 1);
      g.globalAlpha = 0.18 + k * 0.3;
      g.fillStyle = e.tellColor;
      g.beginPath();
      g.arc(e.x, e.y, rr * (0.35 + k * 0.65), 0, TAU);
      g.fill();
      g.globalAlpha = 0.6;
      g.strokeStyle = e.tellColor;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(e.x, e.y, rr, 0, TAU);
      g.stroke();
    } else {
      g.globalAlpha = 0.25 + k * 0.4;
      const gr = e.r * 2.1;
      g.drawImage(glowSprite(e.tellColor, 256), e.x - gr, e.y - gr, gr * 2, gr * 2);
    }
    g.restore();
  }

  let scale = 1;
  if (e.spawnT > 0) {
    const k = 1 - clamp(e.spawnT / 1.2, 0, 1);
    scale = easeOutBack(k);
  }

  g.save();
  g.translate(e.x, e.y);
  g.scale(scale, scale);
  g.translate(0, Math.sin(t * 1.6) * 3);
  if (Math.cos(e.facing) < 0) g.scale(-1, 1);
  g.drawImage(img, -size / 2, -size * 0.64, size, size);
  g.restore();

  if (e.hitFlash > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(e.hitFlash * 4, 0, 0.7);
    g.translate(e.x, e.y);
    if (Math.cos(e.facing) < 0) g.scale(-1, 1);
    g.drawImage(img, -size / 2, -size * 0.64, size, size);
    g.restore();
  }
}

function drawAlly(g, a, t) {
  drawShadow(g, a.x, a.y, a.r);
  const img = playerSprite('knolle', 96);
  const size = a.r * 3;
  g.save();
  g.globalAlpha = clamp(a.life, 0, 1) * (a.spawnT > 0 ? 1 - a.spawnT / 0.3 : 1);
  g.translate(a.x, a.y);
  if (Math.cos(a.facing) < 0) g.scale(-1, 1);
  g.drawImage(img, -size / 2, -size * 0.62, size, size);
  g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.25;
  const r = a.r * 1.8;
  g.drawImage(glowSprite('#ffe79a', 128), a.x - r, a.y - r, r * 2, r * 2);
  g.restore();
  drawHealthBar(g, a.x, a.y - a.r - 12, a.r * 1.9, 3.5, a.hp / a.maxHp, '#7bd44f');
}

function drawTurret(g, tr, t) {
  drawShadow(g, tr.x, tr.y, tr.r);
  g.save();
  g.translate(tr.x, tr.y);
  const k = tr.spawnT > 0 ? easeOutBack(1 - tr.spawnT / 0.3) : 1;
  g.scale(k, k);
  // Sockel
  g.fillStyle = '#3a4248';
  g.beginPath();
  g.ellipse(0, 2, tr.r * 1.1, tr.r * 0.5, 0, 0, TAU);
  g.fill();
  // Körper
  g.fillStyle = '#5e666e';
  g.beginPath();
  g.arc(0, -tr.r * 0.5, tr.r * 0.8, 0, TAU);
  g.fill();
  g.strokeStyle = '#2a3034';
  g.lineWidth = 2.5;
  g.stroke();
  // Rohr
  g.rotate(tr.facing);
  g.fillStyle = tr.color;
  g.fillRect(0, -3.5, tr.r * 1.7, 7);
  g.restore();
  // Lebensdauer als Ring
  const frac = tr.life / tr.maxLife;
  g.save();
  g.strokeStyle = alpha(tr.color, 0.8);
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(tr.x, tr.y - tr.r * 0.5, tr.r + 6, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  g.stroke();
  g.restore();
}

function drawHealthBar(g, x, y, w, h, frac, color) {
  frac = clamp(frac, 0, 1);
  g.fillStyle = 'rgba(14,10,6,0.72)';
  g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  g.fillStyle = color;
  g.fillRect(x - w / 2, y, w * frac, h);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(x - w / 2, y, w * frac, h * 0.4);
}

function drawPickupsLayer(g, t) {
  const pool = G.pools.pickups;
  for (let i = 0; i < pool.count; i++) {
    const it = pool.items[i];
    if (it.x < view.left - 40 || it.x > view.right + 40) continue;
    if (it.y < view.top - 40 || it.y > view.bottom + 40) continue;
    const bob = Math.sin(it.bob) * 2.5;
    const y = it.y + it.z + bob;

    g.globalAlpha = 0.3;
    const sh = shadowSprite(96);
    g.drawImage(sh, it.x - it.r, it.y - it.r * 0.3, it.r * 2, it.r);
    g.globalAlpha = 1;

    switch (it.kind) {
      case 'knolle': {
        // Goldschimmer, damit Währung nie mit einem Käfer verwechselt wird.
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.3;
        const gr = it.r * 2.1;
        g.drawImage(glowSprite('#f5c842', 64), it.x - gr, y - gr, gr * 2, gr * 2);
        g.restore();
        const img = knolleSprite(28);
        const s = it.r * 2.1;
        g.drawImage(img, it.x - s / 2, y - s / 2, s, s);
        break;
      }
      case 'xp': {
        const img = orbSprite('#58c9f3', 24);
        const s = it.r * 2.4;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.drawImage(img, it.x - s / 2, y - s / 2, s, s);
        g.restore();
        break;
      }
      case 'heart': {
        const img = heartSprite(30);
        const s = it.r * 2.3;
        g.drawImage(img, it.x - s / 2, y - s / 2, s, s);
        break;
      }
      case 'gear': {
        const img = armorIcon(it.gear ? it.gear.color : '#c98f4e', 72);
        const s = it.r * 2.3;
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gl = glowSprite(it.gear ? it.gear.color : '#fff', 128);
        const r = it.r * 2.6;
        g.globalAlpha = 0.5 + Math.sin(t * 4) * 0.12;
        g.drawImage(gl, it.x - r, y - r, r * 2, r * 2);
        g.restore();
        g.drawImage(img, it.x - s / 2, y - s / 2, s, s);
        break;
      }
      case 'artifact': {
        const img = artifactIcon(it.gear.glyph, it.gear.color, 80);
        const s = it.r * 2.4;
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gl = glowSprite(it.gear.color, 128);
        const r = it.r * 2.8;
        g.globalAlpha = 0.55 + Math.sin(t * 5) * 0.12;
        g.drawImage(gl, it.x - r, y - r, r * 2, r * 2);
        g.restore();
        g.drawImage(img, it.x - s / 2, y - s / 2, s, s);
        break;
      }
      case 'item': {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gl = glowSprite('#ffd93d', 128);
        const r = it.r * 2.6;
        g.globalAlpha = 0.45;
        g.drawImage(gl, it.x - r, y - r, r * 2, r * 2);
        g.restore();
        g.font = `${Math.round(it.r * 2)}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(it.gear.icon || '📦', it.x, y);
        break;
      }
      default: break;
    }
  }
  g.globalAlpha = 1;
}

function drawFieldsLayer(g, t) {
  const pool = G.pools.fields;
  for (let i = 0; i < pool.count; i++) {
    const f = pool.items[i];
    const fade = clamp(f.duration / Math.min(0.6, f.maxDuration), 0, 1);
    const pulse = 0.9 + Math.sin(t * 3 + f.pulse) * 0.1;
    g.save();
    g.globalAlpha = 0.3 * fade;
    g.translate(f.x, f.y);
    g.scale(1, 0.7);
    g.beginPath();
    g.arc(0, 0, f.radius * pulse, 0, TAU);
    g.fillStyle = f.color;
    g.fill();
    g.globalAlpha = 0.6 * fade;
    g.strokeStyle = f.color;
    g.lineWidth = 4;
    g.stroke();
    g.restore();

    if (f.kind === 'root') {
      g.save();
      g.globalAlpha = 0.6 * fade;
      g.strokeStyle = shade(f.color, -0.2);
      g.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        const a = f.pulse + (k / 9) * TAU;
        g.beginPath();
        g.moveTo(f.x, f.y);
        g.quadraticCurveTo(
          f.x + Math.cos(a) * f.radius * 0.5, f.y + Math.sin(a) * f.radius * 0.35,
          f.x + Math.cos(a + 0.4) * f.radius * 0.95, f.y + Math.sin(a + 0.4) * f.radius * 0.66,
        );
        g.stroke();
      }
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

function drawMinesLayer(g, t) {
  const pool = G.pools.mines;
  for (let i = 0; i < pool.count; i++) {
    const m = pool.items[i];
    const blink = m.triggered >= 0
      ? (Math.sin(m.pulse * 3) > 0 ? 1 : 0.3)
      : 0.55 + Math.sin(m.pulse) * 0.3;
    g.save();
    g.globalAlpha = 0.7;
    g.fillStyle = '#3a3630';
    g.beginPath();
    g.ellipse(m.x, m.y, m.r, m.r * 0.55, 0, 0, TAU);
    g.fill();
    g.globalAlpha = blink;
    g.fillStyle = m.color;
    g.beginPath();
    g.arc(m.x, m.y - 2, m.r * 0.42, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = blink * 0.5;
    const r = m.r * 2.2;
    g.drawImage(glowSprite(m.color, 128), m.x - r, m.y - r, r * 2, r * 2);
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawProjectilesLayer(g) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  drawProjPool(g, G.pools.projectiles);
  drawProjPool(g, G.pools.hostileProjectiles);
  g.restore();
}

function drawProjPool(g, pool) {
  for (let i = 0; i < pool.count; i++) {
    const p = pool.items[i];
    if (p.x < view.left - 40 || p.x > view.right + 40) continue;
    if (p.y < view.top - 40 || p.y > view.bottom + 40) continue;
    const r = p.r;
    if (p.glow) {
      const gr = r * 3.4;
      g.globalAlpha = 0.55;
      g.drawImage(glowSprite(p.color, 64), p.x - gr, p.y - gr, gr * 2, gr * 2);
    }
    g.globalAlpha = 1;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = p.color;
    if (p.boomerang) {
      g.fillRect(-r * 1.6, -r * 0.4, r * 3.2, r * 0.8);
      g.fillRect(-r * 0.4, -r * 1.6, r * 0.8, r * 3.2);
    } else if (p.hostile) {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(20,12,8,0.6)';
      g.lineWidth = 2;
      g.stroke();
    } else {
      // Gestreckt in Flugrichtung — liest sich schneller
      g.beginPath();
      g.ellipse(0, 0, r * 1.7, r * 0.85, 0, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawOrbiters(g, t) {
  const pool = G.pools.orbiters;
  for (let i = 0; i < pool.count; i++) {
    const o = pool.items[i];
    const img = weaponSprite(o.weapon ? o.weapon.def.art : 'klinge', o.color, 96);
    const len = o.r * 3.4;
    g.save();
    g.translate(o.x, o.y);
    g.rotate(o.angle + Math.PI * 0.5);
    g.drawImage(img, -len * 0.5, -len * 0.25, len, len * 0.5);
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3;
    const r = o.r * 1.8;
    g.drawImage(glowSprite(o.color, 64), o.x - r, o.y - r, r * 2, r * 2);
    g.restore();
  }
}

function drawSwipesBack(g) {
  const pool = G.pools.swipes;
  for (let i = 0; i < pool.count; i++) {
    const s = pool.items[i];
    if (s.kind !== 'circle') continue;
    const k = 1 - s.life / s.maxLife;
    g.save();
    g.globalAlpha = (1 - k) * 0.5;
    g.translate(s.x, s.y);
    g.scale(1, 0.68);
    g.fillStyle = s.color;
    g.beginPath();
    g.arc(0, 0, s.radius * easeOutCubic(k), 0, TAU);
    g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawSwipesFront(g) {
  const pool = G.pools.swipes;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pool.count; i++) {
    const s = pool.items[i];
    const k = 1 - s.life / s.maxLife;
    const fade = 1 - k;
    g.globalAlpha = fade * 0.75;

    if (s.kind === 'arc') {
      // Sichelförmiger Schwung, der mit der Zeit nachzieht
      const a0 = s.angle - s.arc * 0.5;
      const a1 = s.angle + s.arc * 0.5;
      const sweep = a0 + (a1 - a0) * easeOutCubic(Math.min(1, k * 1.5));
      g.strokeStyle = s.color;
      g.lineWidth = 12 * fade + 4;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(s.x, s.y, s.radius * 0.82, a0, sweep);
      g.stroke();
      g.globalAlpha = fade * 0.35;
      g.lineWidth = 26 * fade + 4;
      g.stroke();
    } else if (s.kind === 'line') {
      g.strokeStyle = s.color;
      g.lineWidth = s.width * (1 - k * 0.6);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x + Math.cos(s.angle) * s.length, s.y + Math.sin(s.angle) * s.length);
      g.stroke();
    } else if (s.kind === 'beam') {
      g.strokeStyle = s.color;
      g.lineWidth = s.width * (1 - k * 0.4);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x + Math.cos(s.angle) * s.length, s.y + Math.sin(s.angle) * s.length);
      g.stroke();
      g.globalAlpha = fade * 0.9;
      g.strokeStyle = '#ffffff';
      g.lineWidth = s.width * 0.3 * (1 - k * 0.4);
      g.stroke();
    } else if (s.kind === 'cone') {
      g.fillStyle = s.color;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.arc(s.x, s.y, s.radius, s.angle - s.arc / 2, s.angle + s.arc / 2);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

function drawBoltsLayer(g) {
  const pool = G.pools.bolts;
  if (!pool.count) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let i = 0; i < pool.count; i++) {
    const b = pool.items[i];
    const fade = b.life / b.maxLife;
    const segs = 7;
    g.globalAlpha = fade;
    for (const [lw, col] of [[9, alpha(b.color, 0.35)], [3.5, b.color], [1.4, '#ffffff']]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      let seed = b.seed;
      for (let k = 1; k < segs; k++) {
        const t = k / segs;
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const jitter = ((seed >>> 16) / 65536 - 0.5) * 34 * Math.sin(t * Math.PI);
        const nx = -(b.y2 - b.y1), ny = b.x2 - b.x1;
        const l = Math.hypot(nx, ny) || 1;
        g.lineTo(
          b.x1 + (b.x2 - b.x1) * t + (nx / l) * jitter,
          b.y1 + (b.y2 - b.y1) * t + (ny / l) * jitter,
        );
      }
      g.lineTo(b.x2, b.y2);
      g.stroke();
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

// --- Beleuchtung -------------------------------------------------------
//
// Die Maske wird in halber Auflösung gezeichnet und hochskaliert. Weiche
// Verläufe verlieren dabei nichts, es kostet aber nur ein Viertel Füllrate.

let maskCv = null, maskCtx = null, maskW = 0, maskH = 0;

function ensureMask() {
  const w = Math.max(2, Math.round(rt.w * 0.5));
  const h = Math.max(2, Math.round(rt.h * 0.5));
  if (!maskCv) {
    maskCv = document.createElement('canvas');
    maskCtx = maskCv.getContext('2d');
  }
  if (maskW !== w || maskH !== h) {
    maskCv.width = w; maskCv.height = h;
    maskW = w; maskH = h;
  }
}

/** Ein weiches Loch in die Dunkelheit brennen. */
function punch(lc, x, y, r, strength = 1) {
  if (r <= 0) return;
  const grd = lc.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(0,0,0,${0.96 * strength})`);
  grd.addColorStop(0.3, `rgba(0,0,0,${0.62 * strength})`);
  grd.addColorStop(0.62, `rgba(0,0,0,${0.22 * strength})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  lc.fillStyle = grd;
  lc.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawDarkness(g, cam, z) {
  const pal = G.arena.pal;
  // Obergrenze: völlig schwarze Flächen sind Stimmung auf Kosten der
  // Spielbarkeit. 0.66 ist die Grenze, ab der man Umrisse noch erkennt.
  const darkness = clamp(1 - clamp(pal.ambient, 0, 1), 0, 0.66);
  if (darkness <= 0.03) return;

  ensureMask();
  const lc = maskCtx;
  const s = 0.5 * z;                   // Welt → Maske
  const ox = maskW / 2 + cam.shakeX * 0.5;
  const oy = maskH / 2 + cam.shakeY * 0.5;
  const toX = (wx) => (wx - cam.x) * s + ox;
  const toY = (wy) => (wy - cam.y) * s + oy;

  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'source-over';
  lc.fillStyle = pal.fog;
  lc.fillRect(0, 0, maskW, maskH);

  lc.globalCompositeOperation = 'destination-out';

  // Fackeln
  const t = G.runTime;
  for (const tr of G.arena.torches) {
    const x = toX(tr.x), y = toY(tr.y);
    const r = 158 * s * (0.88 + Math.sin(t * 7 + tr.flicker) * 0.07 + Math.sin(t * 13.3 + tr.flicker) * 0.04);
    if (x < -r || x > maskW + r || y < -r || y > maskH + r) continue;
    punch(lc, x, y, r);
  }

  // Der Spieler trägt sein eigenes Licht — sonst verliert man sich.
  const p = G.player;
  punch(lc, toX(p.x), toY(p.y), 210 * s, 1);

  // Gefahren leuchten selbst
  for (const h of G.arena.hazards) {
    punch(lc, toX(h.x), toY(h.y), (h.r + 48) * s, 0.75);
  }

  // Aktive Felder, Minen, Türme
  const fp = G.pools.fields;
  for (let i = 0; i < fp.count; i++) {
    const f = fp.items[i];
    punch(lc, toX(f.x), toY(f.y), (f.radius + 34) * s, 0.65);
  }
  const tp = G.pools.turrets;
  for (let i = 0; i < tp.count; i++) {
    punch(lc, toX(tp.items[i].x), toY(tp.items[i].y), 84 * s, 0.55);
  }

  // Projektile und Bosse werfen Licht — macht Geschosse gut lesbar
  const pp = G.pools.projectiles;
  for (let i = 0; i < pp.count; i++) {
    const pr = pp.items[i];
    punch(lc, toX(pr.x), toY(pr.y), (pr.r + 26) * s * 2, 0.55);
  }
  const hp = G.pools.hostileProjectiles;
  for (let i = 0; i < hp.count; i++) {
    const pr = hp.items[i];
    punch(lc, toX(pr.x), toY(pr.y), (pr.r + 22) * s * 2, 0.5);
  }
  // Jeder Gegner hellt seine Umgebung ein wenig auf. Ohne das verschwinden
  // kleine Käfer in unbeleuchteten Ecken, und Treffer aus dem Nichts sind
  // kein Schwierigkeitsgrad, sondern ein Fehler.
  const ep = G.pools.enemies;
  for (let i = 0; i < ep.count; i++) {
    const e = ep.items[i];
    if (!e.alive || e.hidden) continue;
    const x = toX(e.x), y = toY(e.y);
    if (x < -80 || x > maskW + 80 || y < -80 || y > maskH + 80) continue;
    if (e.boss) punch(lc, x, y, e.r * 4 * s, 0.8);
    else if (e.elite) punch(lc, x, y, e.r * 3.2 * s, 0.55);
    else punch(lc, x, y, e.r * 2.4 * s, 0.34);
  }

  // Explosionen hellen kurz auf
  const fl = flashState();
  if (fl.a > 0.01) punch(lc, maskW / 2, maskH / 2, Math.max(maskW, maskH) * 0.8, clamp(fl.a * 1.6, 0, 1));

  g.save();
  g.globalAlpha = darkness;
  g.imageSmoothingEnabled = true;
  g.drawImage(maskCv, 0, 0, rt.w, rt.h);
  g.restore();
}

function drawScreenEffects(g) {
  const p = G.player;

  // Vignette, bei niedrigem Leben rot
  const low = p && p.maxHp ? 1 - clamp(p.hp / p.maxHp / 0.35, 0, 1) : 0;
  const vigStrength = 0.5 + low * 0.3;
  const vigColor = low > 0.05 ? mix('#000000', '#8a0f18', low) : '#000000';
  const vw = Math.round(rt.w / 8) * 8, vh = Math.round(rt.h / 8) * 8;
  if (vw > 0 && vh > 0) {
    const img = vignette(vw, vh, Math.round(vigStrength * 20) / 20, vigColor);
    g.drawImage(img, 0, 0, rt.w, rt.h);
  }

  if (low > 0.05) {
    g.save();
    g.globalAlpha = low * (0.12 + Math.sin(G.runTime * 5) * 0.05);
    g.fillStyle = '#ff2a2a';
    g.fillRect(0, 0, rt.w, rt.h);
    g.restore();
  }

  const fl = flashState();
  if (fl.a > 0.004) {
    g.save();
    g.globalAlpha = clamp(fl.a, 0, 0.8);
    g.fillStyle = fl.color;
    g.fillRect(0, 0, rt.w, rt.h);
    g.restore();
  }
}

// --- Touch-Bedienung ---------------------------------------------------

const buttonDefs = [];

function layoutButtons() {
  buttonDefs.length = 0;
  const pad = 22;
  const safeB = 18;
  const bottom = rt.h - safeB;
  const right = rt.w - pad;

  // Rollen: größter Knopf, unten rechts
  const rollR = clamp(Math.min(rt.w, rt.h) * 0.095, 34, 52);
  const rollX = right - rollR;
  const rollY = bottom - rollR - 8;
  buttonDefs.push({ id: 'roll', x: rollX, y: rollY, r: rollR, kind: 'roll' });

  // Artefakte im Bogen darüber
  const n = Math.min(3, G.artifacts.length);
  const artR = clamp(Math.min(rt.w, rt.h) * 0.072, 26, 40);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.5 - i * 0.52 - 0.18;
    const d = rollR + artR + 24 + i * 4;
    buttonDefs.push({
      id: 'art' + i,
      x: rollX + Math.cos(a) * d,
      y: rollY + Math.sin(a) * d,
      r: artR,
      kind: 'artifact',
      index: i,
    });
  }
  setButtons(buttonDefs);
}

function drawTouchControls(g) {
  if (G.phase !== PHASE.PLAYING || G.paused) { setButtons([]); return; }
  layoutButtons();

  const touch = input.usingTouch;

  // Virtueller Stick
  if (touch && input.stick.active) {
    const s = input.stick;
    g.save();
    g.globalAlpha = 0.22;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(s.ax, s.ay, 58, 0, TAU);
    g.fill();
    g.globalAlpha = 0.5;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(s.ax, s.ay, 58, 0, TAU);
    g.stroke();

    const kx = s.ax + clamp(s.px - s.ax, -58, 58);
    const ky = s.ay + clamp(s.py - s.ay, -58, 58);
    g.globalAlpha = 0.72;
    g.fillStyle = '#ffe79a';
    g.beginPath();
    g.arc(kx, ky, 24, 0, TAU);
    g.fill();
    g.restore();
  }

  if (!touch) return;

  const p = G.player;
  for (const b of buttonDefs) {
    const held = input.held[b.id];
    if (b.kind === 'roll') {
      const ready = p.rollCd <= 0;
      drawRoundButton(g, b, '#9ef0ff', ready ? 1 : 1 - clamp(p.rollCd / Math.max(0.01, 0.95 * (1 + G.stats.rollCd)), 0, 1), held, '↻');
    } else {
      const inst = G.artifacts[b.index];
      if (!inst) continue;
      const total = artifactCooldown(inst);
      const frac = total > 0 ? 1 - clamp(inst.cd / total, 0, 1) : 1;
      drawRoundButton(g, b, inst.def.color, frac, held, null, inst);
    }
  }
}

function drawRoundButton(g, b, color, frac, held, glyph, artifact) {
  const ready = frac >= 0.999;
  g.save();
  g.translate(b.x, b.y);
  const scale = held ? 0.92 : 1;
  g.scale(scale, scale);

  // Hintergrund
  g.globalAlpha = ready ? 0.42 : 0.26;
  g.fillStyle = '#0d0a07';
  g.beginPath();
  g.arc(0, 0, b.r, 0, TAU);
  g.fill();

  // Abklingzeit als Füllung von unten
  if (!ready) {
    g.save();
    g.beginPath();
    g.arc(0, 0, b.r, 0, TAU);
    g.clip();
    g.globalAlpha = 0.35;
    g.fillStyle = color;
    g.fillRect(-b.r, b.r - b.r * 2 * frac, b.r * 2, b.r * 2 * frac);
    g.restore();
  }

  // Rand
  g.globalAlpha = ready ? 0.95 : 0.4;
  g.strokeStyle = color;
  g.lineWidth = ready ? 3 : 2;
  g.beginPath();
  g.arc(0, 0, b.r, 0, TAU);
  g.stroke();

  if (ready) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3;
    const r = b.r * 1.9;
    g.drawImage(glowSprite(color, 64), -r, -r, r * 2, r * 2);
    g.globalCompositeOperation = 'source-over';
  }

  // Inhalt
  g.globalAlpha = ready ? 1 : 0.55;
  if (artifact) {
    const img = artifactIcon(artifact.def.glyph, artifact.def.color, 80);
    const s = b.r * 1.5;
    g.drawImage(img, -s / 2, -s / 2, s, s);
  } else if (glyph) {
    g.fillStyle = color;
    g.font = `700 ${Math.round(b.r * 1.1)}px Outfit, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(glyph, 0, 1);
  }
  g.restore();
}

// --- Schleife ----------------------------------------------------------

export function startLoop() {
  if (rt.running) return;
  rt.running = true;
  rt.lastT = performance.now();
  requestAnimationFrame(frame);
}

export function stopLoop() {
  rt.running = false;
}

function frame(now) {
  if (!rt.running) return;
  let dt = (now - rt.lastT) / 1000;
  rt.lastT = now;
  // Nach einem Tab-Wechsel keinen Riesen-Sprung simulieren
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  // Ein einzelner Fehler darf nicht die ganze Schleife beenden — sonst
  // steht das Bild still und niemand weiß, warum.
  try {
    update(dt);
  } catch (err) {
    console.error('[update]', err);
    rt.errors++;
  }
  try {
    render();
  } catch (err) {
    console.error('[render]', err);
    rt.errors++;
  }
  if (rt.errors > 240) {
    rt.running = false;
    console.error('[loop] Zu viele Fehler, Schleife gestoppt.');
    return;
  }

  // Qualität automatisch senken, wenn es dauerhaft ruckelt
  rt.frames++;
  rt.fpsT += dt;
  if (dt > 1 / 32) rt.slowFrames++;
  if (rt.fpsT >= 1) {
    rt.fps = rt.frames / rt.fpsT;
    // Nur einmal absenken. Ohne das Merker-Feld greift die Bedingung jede
    // Sekunde erneut und löst endlos Resizes aus.
    if (rt.slowFrames > 22 && !rt.downgraded) {
      rt.downgraded = true;
      rt.quality = 0.72;
      resizeRuntime();
      console.info('[perf] Auflösung reduziert, um flüssig zu bleiben.');
    }
    rt.frames = 0; rt.fpsT = 0; rt.slowFrames = 0;
  }

  requestAnimationFrame(frame);
}

export function setPaused(v) {
  G.paused = v;
}
