// Artefakte — die aktiven Fähigkeiten aus Minecraft Dungeons.
//
// Drei Fassungen, drei Knöpfe am rechten Daumen. Jedes Artefakt ist ein
// bewusster Moment: der Spieler drückt, es passiert etwas Sichtbares.
//
// `use(ctx)` bekommt alles nötige von außen übergeben, damit diese Datei
// keine Spiel-Module importieren muss (und keine Importzyklen entstehen).

export const ARTIFACTS = {
  heiltotem: {
    name: 'Heiltotem', glyph: 'totem', color: '#7bd44f', cd: 16, tier: 0, price: 60,
    desc: 'Stellt ein Totem auf, das 6s lang alles in der Nähe heilt.',
    use(ctx) {
      ctx.spawnField(ctx.px, ctx.py, {
        kind: 'heal', radius: 150, duration: 6,
        healPerSec: 5 + ctx.level * 0.6, color: '#7bd44f',
      });
      ctx.sfx('heal');
      ctx.ring(ctx.px, ctx.py, 20, 150, { color: '#9ef08f', life: 0.6 });
      return true;
    },
  },

  feuerwerk: {
    name: 'Feuerwerksrakete', glyph: 'rakete', color: '#ff8a3d', cd: 12, tier: 0, price: 55,
    desc: 'Rakete auf den nächsten Gegner, großer Flächenschaden.',
    use(ctx) {
      const target = ctx.nearestEnemy(900);
      const tx = target ? target.x : ctx.px + Math.cos(ctx.facing) * 260;
      const ty = target ? target.y : ctx.py + Math.sin(ctx.facing) * 260;
      ctx.spawnDelayed(0.45, () => {
        ctx.areaDamage(tx, ty, 160, 55 + ctx.level * 9, { type: 'elem', knock: 320, source: 'feuerwerk' });
        ctx.explosion(tx, ty, 160);
        ctx.sfx('bomb');
      });
      ctx.spawnRocket(ctx.px, ctx.py, tx, ty, 0.45, '#ff8a3d');
      ctx.sfx('shoot', { pitch: 0.6 });
      return true;
    },
  },

  eisnebel: {
    name: 'Eisnebel', glyph: 'wolke', color: '#8fd8f0', cd: 14, tier: 0, price: 55,
    desc: 'Friert alle Gegner im weiten Umkreis 2,5s fest.',
    use(ctx) {
      const hit = ctx.forEnemiesInRadius(ctx.px, ctx.py, 300, (e) => {
        ctx.applyStatus(e, 'frozen', 2.5, 1);
        ctx.areaDamage(e.x, e.y, 1, 14 + ctx.level * 2, { type: 'elem', source: 'eisnebel' });
      });
      ctx.ring(ctx.px, ctx.py, 20, 300, { color: '#d8f6ff', life: 0.55, width: 10 });
      ctx.burst(ctx.px, ctx.py, 26, { color: '#d8f6ff', speed: 420, life: 0.7 });
      ctx.sfx('freeze');
      return hit > 0 || true;
    },
  },

  donnerpilz: {
    name: 'Donnerpilz', glyph: 'blitz', color: '#9ef0ff', cd: 13, tier: 1, price: 75,
    desc: 'Blitz-Nova: trifft bis zu 8 Gegner mit Kettenblitzen.',
    use(ctx) {
      const targets = ctx.enemiesInRadius(ctx.px, ctx.py, 340, 8);
      targets.forEach((e, i) => {
        ctx.spawnDelayed(i * 0.07, () => {
          ctx.lightning(ctx.px, ctx.py, e.x, e.y, '#9ef0ff');
          ctx.areaDamage(e.x, e.y, 40, 32 + ctx.level * 5, { type: 'elem', source: 'donnerpilz' });
          ctx.sfx('zap', { pitch: 1 + i * 0.04 });
        });
      });
      ctx.ring(ctx.px, ctx.py, 10, 340, { color: '#9ef0ff', life: 0.4, width: 7 });
      ctx.shake(7);
      return true;
    },
  },

  horn: {
    name: 'Beschwörungshorn', glyph: 'horn', color: '#d9b154', cd: 26, tier: 1, price: 85,
    desc: 'Ruft zwei Verbündete, die 18s mitkämpfen.',
    use(ctx) {
      for (let i = 0; i < 2; i++) {
        const a = ctx.facing + (i ? 0.9 : -0.9);
        ctx.spawnAlly(ctx.px + Math.cos(a) * 54, ctx.py + Math.sin(a) * 54, {
          hp: 40 + ctx.level * 5, dmg: 12 + ctx.level * 2.2, life: 18,
        });
      }
      ctx.sfx('summon');
      ctx.ring(ctx.px, ctx.py, 20, 110, { color: '#ffe79a', life: 0.5 });
      return true;
    },
  },

  schleier: {
    name: 'Schattenschleier', glyph: 'schleier', color: '#7a6fd0', cd: 20, tier: 1, price: 70,
    desc: '4s unsichtbar: Gegner verlieren dich, du läufst 50% schneller.',
    use(ctx) {
      ctx.buffPlayer('invis', 4, 1);
      ctx.buffPlayer('hast', 4, 0.5);
      ctx.burst(ctx.px, ctx.py, 20, { color: '#9f8ff0', speed: 200, life: 0.6 });
      ctx.sfx('teleport');
      return true;
    },
  },

  wutguertel: {
    name: 'Gürtel der Wut', glyph: 'guertel', color: '#e8503a', cd: 22, tier: 1, price: 80,
    desc: '6s lang +60% Schaden und +30% Angriffstempo.',
    use(ctx) {
      ctx.buffPlayer('rage', 6, 0.6);
      ctx.buffPlayer('frenzy', 6, 0.3);
      ctx.ring(ctx.px, ctx.py, 15, 120, { color: '#ff7a3d', life: 0.45 });
      ctx.sfx('bossRoar', { gain: 0.5 });
      return true;
    },
  },

  wurzelfalle: {
    name: 'Wurzelfalle', glyph: 'falle', color: '#6cbf4a', cd: 15, tier: 1, price: 65,
    desc: 'Wurzelfeld hält Gegner 5s lang fest und schadet ihnen.',
    use(ctx) {
      ctx.spawnField(ctx.px, ctx.py, {
        kind: 'root', radius: 180, duration: 5,
        dmgPerSec: 9 + ctx.level * 1.6, color: '#6cbf4a',
      });
      ctx.sfx('summon', { pitch: 0.7 });
      return true;
    },
  },

  knollenbombe: {
    name: 'Knollenbombe', glyph: 'bombe', color: '#d9943a', cd: 10, tier: 0, price: 50,
    desc: 'Wirft eine Bombe in Blickrichtung — 1,2s Zündzeit.',
    use(ctx) {
      const d = 170;
      const tx = ctx.px + Math.cos(ctx.facing) * d, ty = ctx.py + Math.sin(ctx.facing) * d;
      ctx.spawnBomb(tx, ty, 1.2, () => {
        ctx.areaDamage(tx, ty, 140, 48 + ctx.level * 8, { type: 'elem', knock: 280, source: 'bombe' });
        ctx.explosion(tx, ty, 140);
        ctx.sfx('bomb');
      });
      ctx.sfx('swing', { pitch: 0.8 });
      return true;
    },
  },

  zeitsand: {
    name: 'Zeitsand', glyph: 'sand', color: '#f0d04a', cd: 28, tier: 2, price: 110,
    desc: 'Verlangsamt alle Gegner 5s lang auf 35%.',
    use(ctx) {
      ctx.globalSlow(5, 0.65);
      ctx.ring(ctx.px, ctx.py, 10, 600, { color: '#f0d04a', life: 0.9, width: 6 });
      ctx.flash('#f0d04a', 0.14);
      ctx.sfx('freeze', { pitch: 0.6 });
      return true;
    },
  },

  seelenheiler: {
    name: 'Seelenheiler', glyph: 'kristall', color: '#c06ff0', cd: 18, tier: 1, price: 70,
    desc: 'Sofort 35% der maximalen Lebenspunkte heilen.',
    use(ctx) {
      ctx.healPlayer(ctx.maxHp * 0.35);
      ctx.ring(ctx.px, ctx.py, 10, 120, { color: '#e0a8ff', life: 0.5 });
      ctx.burst(ctx.px, ctx.py, 18, { color: '#e0a8ff', speed: 160, life: 0.8 });
      ctx.sfx('heal');
      return true;
    },
  },

  bohnenkanone: {
    name: 'Bohnenkanone', glyph: 'rakete', color: '#8fd14f', cd: 17, tier: 2, price: 95,
    desc: 'Feuert 18 Bohnen in einem breiten Fächer.',
    use(ctx) {
      for (let i = 0; i < 18; i++) {
        ctx.spawnDelayed(i * 0.045, () => {
          const a = ctx.facing + (((i % 6) / 5) - 0.5) * 0.85;
          ctx.spawnProjectile(ctx.px, ctx.py, a, {
            dmg: 16 + ctx.level * 2.6, speed: 640, size: 7, range: 340,
            color: '#8fd14f', type: 'elem', pierce: 1, source: 'bohnenkanone',
          });
          ctx.sfx('shoot', { pitch: 1.3, gain: 0.5 });
        });
      }
      return true;
    },
  },
};

export const ARTIFACT_IDS = Object.keys(ARTIFACTS);
export const ARTIFACT_LIST = ARTIFACT_IDS.map((id) => ({ id, ...ARTIFACTS[id] }));

export const artifactsOfTier = (tier) => ARTIFACT_LIST.filter((a) => a.tier === tier);

/** Startartefakt, damit die Knopfreihe von Welle 1 an nicht leer ist. */
export const STARTER_ARTIFACTS = ['knollenbombe', 'heiltotem', 'feuerwerk'];
