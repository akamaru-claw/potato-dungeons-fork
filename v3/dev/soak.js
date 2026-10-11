// Dauertest: spielt mehrere Läufe ohne Oberfläche durch und sammelt Fehler.
// Aufruf in der Browser-Konsole:
//   const m = await import('./dev/soak.js'); console.log(await m.soak());
// Gehört nicht zum Spiel und wird vom Service Worker nicht zwischengespeichert.

export async function soak() {
  const run   = await import('../src/game/run.js');
  const state = await import('../src/game/state.js');
  const inp   = await import('../src/core/input.js');
  const chars = await import('../src/data/characters.js');
  const loot  = await import('../src/game/loot.js');
  const sett  = await import('../src/core/storage.js');

  sett.setSetting('sfx', 0); sett.setSetting('music', 0);
  const G = state.G;
  const errors = [];
  const log = [];
  const origErr = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 220)); };

  // Overlays abschalten, alles automatisch entscheiden
  run.rt.onUpdate = null;
  run.rt.onPhaseChange = null;
  run.rt.onLevelUp = (n) => {
    for (let i = 0; i < n; i++) {
      const c = G.rng.weighted(chars.LEVEL_CARDS, (x) => x.weight);
      if (c) state.takeLevelCard(c);
    }
  };
  let deaths = 0, wins = 0, campCount = 0;
  run.rt.onWaveEnd = () => {
    campCount++;
    // Im Lager einkaufen, verzaubern und weiter
    if (!G.shop) G.shop = loot.rollShop(G.rng, 4);
    for (const o of G.shop) {
      if (o.sold || G.knollen < o.price) continue;
      if (o.kind === 'weapon' && G.weapons.length < state.weaponSlotCount()) {
        state.spendKnollen(o.price); state.addWeapon(o.def); o.sold = true;
      } else if (o.kind === 'item') {
        state.spendKnollen(o.price); state.addItem(o.def); o.sold = true;
      } else if (o.kind === 'artifact' && G.artifacts.length < state.artifactSlotCount()) {
        state.spendKnollen(o.price); state.addArtifact(o.def); o.sold = true;
      }
    }
    // Rüstung anlegen und verzaubern
    const q = G.pendingGear || [];
    while (q.length) { state.equipArmor(q.pop()); }
    const targets = [G.armor, ...G.weapons].filter(Boolean);
    for (const t of targets) {
      loot.ensureSlotOptions(t, t === G.armor ? 'armor' : 'weapon');
      for (const s of t.slots) {
        if (G.enchPoints <= 0) break;
        if (!s.chosen) { s.chosen = s.options[0]; s.level = 1; G.enchPoints -= 1; }
        else if (s.level < 3 && G.enchPoints >= s.level + 1) { G.enchPoints -= s.level + 1; s.level++; }
      }
    }
    state.recomputeStats();
    run.continueToNextWave();
    run.setPaused(false);
  };
  run.rt.onDeath = () => { deaths++; };
  run.rt.onWin = () => { wins++; };

  inp.input.usingTouch = true;   // damit pollInput unsere Eingaben nicht überschreibt

  const biomes = ['keller', 'wueste', 'sumpf', 'fabrik', 'ofen'];
  const charIds = Object.keys(chars.CHARACTERS);
  let totalFrames = 0, renders = 0;
  const t0 = performance.now();

  for (let r = 0; r < 5; r++) {
    const biome = biomes[r % biomes.length];
    const charId = charIds[(r * 2) % charIds.length];
    run.beginRun({ biomeId: biome, charId, difficulty: r % 5, seed: 1000 + r * 777 });
    run.setPaused(false);
    let frames = 0;
    let maxWave = 0;
    while (frames < 60 * 150 && G.phase !== 'win') {
      // Spieler bewegt sich kreisend und rollt ab und zu
      const t = frames / 60;
      inp.input.moveX = Math.cos(t * 1.3); inp.input.moveY = Math.sin(t * 1.1);
      inp.input.moveMag = 1;
      if (frames % 90 === 0) inp.input.rollQueued = true;
      if (frames % 40 === 0) inp.input.artifactQueued[frames % 3] = true;

      run.update(1 / 60);
      frames++; totalFrames++;
      maxWave = Math.max(maxWave, G.wave);

      if (frames % 37 === 0) { run.render(); renders++; }
      if (G.phase === 'dead') {
        // Unsterblich weitermachen, damit der Test die späten Wellen erreicht
        G.player.dead = false; G.player.hp = G.player.maxHp; G.phase = 'playing';
        G.waveActive = true;
      }
      if (errors.length > 25) break;
    }
    log.push(`${biome}/${charId}/d${r % 5}: Welle ${maxWave}, Lvl ${G.level}, ${G.kills} Kills, ${Math.round(G.knollenEarned)} Knollen, ${G.weapons.length} Waffen`);
    if (errors.length > 25) break;
  }

  console.error = origErr;
  return JSON.stringify({
    runs: log, camps: campCount, wins, deathsCaught: deaths,
    frames: totalFrames, renders,
    msPerFrame: ((performance.now() - t0) / totalFrames).toFixed(3),
    errorCount: errors.length,
    errors: [...new Set(errors)].slice(0, 12),
  }, null, 1);
}

/**
 * Gezielter Bosstest: springt direkt auf die Anführer- und Bosswellen jedes
 * Bioms und prüft, ob alle Phasen und Angriffe fehlerfrei durchlaufen.
 */
export async function soakBosses() {
  const run   = await import('../src/game/run.js');
  const state = await import('../src/game/state.js');
  const inp   = await import('../src/core/input.js');
  const chars = await import('../src/data/characters.js');
  const biomes = await import('../src/data/biomes.js');
  const sett  = await import('../src/core/storage.js');

  sett.setSetting('sfx', 0); sett.setSetting('music', 0);
  const G = state.G;
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 220)); };

  run.rt.onUpdate = null;
  run.rt.onPhaseChange = null;
  run.rt.onLevelUp = (n) => {
    for (let i = 0; i < n; i++) {
      const c = G.rng.weighted(chars.LEVEL_CARDS, (x) => x.weight);
      if (c) state.takeLevelCard(c);
    }
  };
  run.rt.onWaveEnd = () => {};
  run.rt.onDeath = () => {};
  run.rt.onWin = () => {};
  inp.input.usingTouch = true;

  const report = [];
  for (const biomeId of Object.keys(biomes.BIOMES)) {
    const biome = biomes.BIOMES[biomeId];
    for (const wave of [5, 10, 15, biome.waves]) {
      run.beginRun({ biomeId, charId: 'knolle', difficulty: 1, seed: 4242 + wave });
      run.setPaused(false);
      // Spieler kampftauglich machen, damit der Boss wirklich stirbt
      G.levelStats.dmgAll = 40; G.levelStats.maxHp = 4000; G.levelStats.attackSpeed = 3;
      state.recomputeStats();
      G.player.hp = G.player.maxHp;
      run.startWave(wave);

      const boss = G.bossRef;
      const phasesSeen = new Set();
      const movesSeen = new Set();
      let frames = 0;
      while (frames < 60 * 100) {
        const t = frames / 60;
        inp.input.moveX = Math.cos(t * 1.7); inp.input.moveY = Math.sin(t * 1.3);
        inp.input.moveMag = 1;
        if (frames % 70 === 0) inp.input.rollQueued = true;
        run.update(1 / 60);
        if (frames % 53 === 0) run.render();
        frames++;
        const b = G.bossRef;
        if (b && b.alive) { phasesSeen.add(b.phase); if (b.moveName) movesSeen.add(b.moveName); if (b.windupMove) movesSeen.add(b.windupMove); }
        if (G.player.dead) { G.player.dead = false; G.player.hp = G.player.maxHp; G.phase = 'playing'; }
        if (!G.waveActive) break;
        if (errors.length > 20) break;
      }
      report.push(`${biomeId} W${wave}${wave === biome.waves ? ' (BOSS)' : ''}: ${G.waveActive ? 'Zeit abgelaufen' : 'geschafft'}, ${G.kills} Kills` +
        (boss ? `, Phasen ${[...phasesSeen].join('/')}, Angriffe ${[...movesSeen].sort().join(',')}` : ''));
      if (errors.length > 20) break;
    }
    if (errors.length > 20) break;
  }

  console.error = origErr;
  return JSON.stringify({ report, errorCount: errors.length, errors: [...new Set(errors)].slice(0, 12) }, null, 1);
}

/** Prüft Kernsysteme auf Korrektheit statt nur auf Fehlerfreiheit. */
export async function checks() {
  const state = await import('../src/game/state.js');
  const run   = await import('../src/game/run.js');
  const combat= await import('../src/game/combat.js');
  const ai    = await import('../src/game/ai.js');
  const loot  = await import('../src/game/loot.js');
  const W     = await import('../src/data/weapons.js');
  const sett  = await import('../src/core/storage.js');
  sett.setSetting('sfx', 0); sett.setSetting('music', 0);
  const G = state.G;
  const out = [];
  const ok = (name, cond, detail) => out.push(`${cond ? 'OK  ' : 'FEHL'} ${name}${detail ? ' — ' + detail : ''}`);

  run.beginRun({ biomeId: 'keller', charId: 'knolle', difficulty: 0, seed: 99 });
  run.setPaused(false);

  // 1. Verschmelzen: zwei Stufe-1-Messer -> ein Stufe-2-Messer
  state.addWeapon(W.WEAPONS.messer_1);
  const a = G.weapons[0], b = G.weapons[1];
  const before = G.weapons.length;
  state.mergeWeapons(a.uid, b.uid, W.upgradeOf(W.WEAPONS.messer_1));
  ok('Verschmelzen reduziert Waffenzahl', G.weapons.length === before - 1, `${before} -> ${G.weapons.length}`);
  ok('Verschmelzen erhöht die Stufe', G.weapons[0].def.tier === 1, G.weapons[0].def.name);

  // 2. Waffenklassen-Bonus greift ab zwei Waffen
  const dmgBefore = G.stats.dmgMelee;
  state.addWeapon(W.WEAPONS.sense_1);
  ok('Klassenbonus Klinge ab 2 Waffen', G.stats.dmgMelee > dmgBefore, `${dmgBefore.toFixed(2)} -> ${G.stats.dmgMelee.toFixed(2)}`);

  // 3. Rüstung wirkt auf Panzerung und LP
  const armorBefore = G.stats.armor, hpBefore = G.stats.maxHp;
  const gear = loot.makeArmor(G.rng, 2, 1);
  state.equipArmor(gear);
  ok('Rüstung gibt Panzerung', G.stats.armor === armorBefore + gear.armor, `+${gear.armor}`);
  ok('Rüstung gibt LP', G.stats.maxHp === hpBefore + gear.hp, `+${gear.hp}`);

  // 4. Rüstungs-Verzauberung wirkt auf die Werte
  gear.slots[0].chosen = 'leben'; gear.slots[0].level = 2;
  state.recomputeStats();
  ok('Verzauberung "Zähe Schale" II gibt +26 LP',
     G.stats.maxHp === hpBefore + gear.hp + 26, `maxHp ${G.stats.maxHp}`);

  // 5. Waffen-Verzauberung "Schärfe" erhöht den Schaden messbar
  const weapon = G.weapons[0];
  weapon.slots[0] = { options: ['schaerfe'], chosen: 'schaerfe', level: 3 };
  const mk = () => { const e = ai.spawnEnemy('schimmel', 300, 0, { wave: 1 }); e.spawnT = 0; e.hp = e.maxHp = 1e9; e.armor = 0; return e; };
  const e1 = mk();
  const d1 = combat.dealDamage(e1, 100, { type: 'melee', weapon, crit: false, silent: true, noEffects: true });
  weapon.slots[0].level = 0; weapon.slots[0].chosen = null;
  const e2 = mk();
  const d2 = combat.dealDamage(e2, 100, { type: 'melee', weapon, crit: false, silent: true, noEffects: true });
  ok('Schärfe III = +42% Schaden', Math.abs(d1 / d2 - 1.42) < 0.02, `${d2.toFixed(1)} -> ${d1.toFixed(1)}`);

  // 6. Panzerung des Gegners reduziert Schaden, Crits gehen durch Blech
  const blech = ai.spawnEnemy('blech', 300, 0, { wave: 1 }); blech.spawnT = 0; blech.hp = blech.maxHp = 1e9;
  const normal = combat.dealDamage(blech, 100, { type: 'melee', crit: false, silent: true, noEffects: true });
  const crit   = combat.dealDamage(blech, 100, { type: 'melee', crit: true,  silent: true, noEffects: true });
  ok('Panzerung reduziert Schaden', normal < 100, normal.toFixed(1));
  ok('Crit durchschlägt Panzerung stärker', crit / normal > 1.6, `${normal.toFixed(1)} vs ${crit.toFixed(1)}`);

  // 7. Statuseffekte ticken Schaden
  const brenner = ai.spawnEnemy('kaefer', 300, 0, { wave: 1 }); brenner.spawnT = 0; brenner.hp = brenner.maxHp = 1000;
  combat.applyStatus(brenner, 'burn', 2, 40);
  const hpBeforeBurn = brenner.hp;
  for (let i = 0; i < 60; i++) combat.tickEnemyStatus(brenner, 1 / 60);
  ok('Brand verursacht Schaden über Zeit', brenner.hp < hpBeforeBurn, `${hpBeforeBurn} -> ${brenner.hp.toFixed(1)}`);

  // 8. Ausweichen und Panzerung beim Spieler
  G.levelStats.armor = 100; state.recomputeStats();
  // Unverwundbarkeit vom Wellenstart abräumen, sonst misst der Test nichts.
  G.player.invuln = 0; G.player.rolling = 0;
  const php = G.player.hp;
  combat.damagePlayer(100, { undodgeable: true });
  const taken = php - G.player.hp;
  ok('Spieler-Panzerung halbiert ungefähr', taken > 20 && taken < 60, `100 roh -> ${taken.toFixed(1)}`);
  G.levelStats.armor = 0; state.recomputeStats();

  // 9. Beute: Knollen landen im Guthaben
  const kBefore = G.knollen;
  const opfer = ai.spawnEnemy('kaefer', G.player.x + 5, G.player.y, { wave: 3 }); opfer.spawnT = 0;
  combat.killEnemy(opfer);
  for (let i = 0; i < 180; i++) loot.updatePickups(1 / 60);
  ok('Knollen werden gutgeschrieben', G.knollen > kBefore, `${kBefore} -> ${Math.round(G.knollen)}`);

  // 10. Stufenaufstieg durch Erfahrung
  const lvlBefore = G.level;
  state.gainXp(100000);
  ok('Erfahrung steigert die Stufe', G.level > lvlBefore, `${lvlBefore} -> ${G.level}`);
  ok('Verzauberungspunkte wachsen mit', G.enchPoints > 2, `${G.enchPoints}`);

  // 11. Boss-Angriffe "sweep" und "rage" laufen fehlerfrei
  const errs = [];
  const oe = console.error; console.error = (...x) => errs.push(x.join(' '));
  run.startWave(20);
  const boss = G.bossRef;
  if (boss) {
    for (const mv of ['sweep', 'rage', 'slam', 'summon']) {
      boss.windupMove = mv; boss.windup = 0.01; boss.moveTimer = 0;
      for (let i = 0; i < 300; i++) run.update(1 / 60);
    }
  }
  console.error = oe;
  ok('Boss-Angriffe sweep/rage laufen', !!boss && errs.length === 0, errs.slice(0, 2).join(' | ') || 'keine Fehler');

  return out.join('\n');
}
