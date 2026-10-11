// Alle Vollbild-Oberflächen: Startbild, Laufvorbereitung, Pause,
// Stufenaufstieg, Tod, Sieg, Einstellungen, Bestenliste.

import { clamp, fmtNum, fmtTime } from '../core/math.js';
import { seedToCode, codeToSeed, newSeed, makeRng } from '../core/rng.js';
import { sfx, applyAudioSettings, startMusic, stopMusic, setAudioSuspended } from '../core/audio.js';
import {
  settings, progress, save, setSetting, markDirty, flush, recordScore, resetSave, unlock,
} from '../core/storage.js';
import { CHARACTER_LIST, CHARACTERS, LEVEL_CARDS } from '../data/characters.js';
import { BIOME_LIST, BIOMES, DIFFICULTIES } from '../data/biomes.js';
import { TIER_COLORS, WEAPONS } from '../data/weapons.js';
import { BOSSES } from '../data/enemies.js';
import { playerSprite, weaponIcon } from '../core/sprites.js';
import { G, PHASE, runSummary, takeLevelCard } from '../game/state.js';
import { setInputEnabled } from '../core/input.js';
import { el, clear, tap, $, spriteNode, scrollArea, toggle } from './dom.js';
import { weaponCard, itemCard, artifactCard, gearCard } from './cards.js';
import { statGrid } from './camp.js';
import { showHud, resetHudCaches, toast } from './hud.js';
import { openCamp } from './camp.js';

const VERSION = 'v3.0';

let overlay = null;
let api = null;              // Rückrufe ins Spiel, von main.js gesetzt
let setupState = { char: 'knolle', biome: 'keller', diff: 0, seed: null, seedText: '' };
let levelQueue = 0;

export function initScreens(overlayNode, callbacks) {
  overlay = overlayNode;
  api = callbacks;
  // Overlay schluckt Spiel-Eingaben
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
}

function open(builder) {
  clear(overlay);
  overlay.hidden = false;
  setInputEnabled(false);
  builder(overlay);
  overlay.scrollTop = 0;
}

export function closeOverlay() {
  overlay.hidden = true;
  clear(overlay);
  setInputEnabled(true);
}

export const overlayOpen = () => !overlay.hidden;

// --- Startbild ---------------------------------------------------------

export function showMenu() {
  showHud(false);
  stopMusic();
  open((root) => {
    const pr = progress();
    const sheet = el('div.sheet');

    sheet.appendChild(el('div.title-wrap', null, [
      el('div.title-potato', { text: '🥔' }),
      el('h1.title-main', { html: 'Potato<br><span class="t-accent">Dungeons</span>' }),
      el('div.title-tag', { text: 'Wellen überleben. Beute sammeln. Verzaubern. Wiederholen.' }),
      el('div.title-ver', { text: `${VERSION} · Brotato × Minecraft Dungeons` }),
    ]));

    const body = scrollArea([
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
        btn('⚔️ Lauf starten', () => showSetup(), 'btn-primary btn-lg'),
        el('div', { style: { display: 'flex', gap: '8px' } }, [
          btn('🥔 Figuren', () => showCollection()),
          btn('🏆 Bestenliste', () => showScores()),
        ]),
        el('div', { style: { display: 'flex', gap: '8px' } }, [
          btn('⚙️ Einstellungen', () => showSettings(showMenu)),
          btn('📖 Anleitung', () => showHelp()),
        ]),
      ]),
      el('div.divider'),
      el('div.menu-stats', null, [
        el('span', { text: `${pr.runs || 0} Läufe` }),
        el('span', { text: `Beste Welle ${pr.bestWave || 0}` }),
        el('span', { text: `${fmtNum(pr.kills || 0)} Abschüsse` }),
        el('span', { text: `${fmtTime(pr.playtime || 0)} gespielt` }),
      ]),
    ]);
    sheet.appendChild(body);
    root.appendChild(sheet);
  });
}

function btn(text, fn, cls = '') {
  const b = el('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { text });
  tap(b, fn);
  return b;
}

// --- Laufvorbereitung --------------------------------------------------

export function showSetup() {
  const pr = progress();
  if (!pr.unlockedChars.includes(setupState.char)) setupState.char = 'knolle';
  if (!pr.unlockedBiomes.includes(setupState.biome)) setupState.biome = 'keller';

  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { html: 'Wähle deinen <span class="accent">Lauf</span>' }),
    ]));

    const render = () => {
      clear(bodyHolder);
      bodyHolder.appendChild(buildSetupBody());
    };

    const buildSetupBody = () => {
      const pr2 = progress();
      const char = CHARACTERS[setupState.char];
      const biome = BIOMES[setupState.biome];

      // Figuren
      const charRow = el('div.pick-row');
      for (const c of CHARACTER_LIST) {
        const unlocked = pr2.unlockedChars.includes(c.id);
        const node = el(`div.pick${setupState.char === c.id ? '.selected' : ''}${unlocked ? '' : '.locked'}`, null, [
          el('div.pick-emoji', { text: c.icon }),
          el('div.pick-name', { text: c.name }),
          el('div.pick-tag', { text: unlocked ? c.tagline : '' }),
          unlocked ? null : el('div.pick-lock', { text: '🔒 ' + c.unlock }),
        ]);
        if (unlocked) tap(node, () => { setupState.char = c.id; render(); });
        charRow.appendChild(node);
      }

      // Biome
      const biomeRow = el('div.pick-row');
      for (const b of BIOME_LIST) {
        const unlocked = pr2.unlockedBiomes.includes(b.id);
        const node = el(`div.pick${setupState.biome === b.id ? '.selected' : ''}${unlocked ? '' : '.locked'}`, null, [
          el('div.pick-emoji', { text: b.icon }),
          el('div.pick-name', { text: b.name }),
          el('div.pick-tag', { text: unlocked ? `${b.waves} Wellen · ${BOSSES[b.boss] ? BOSSES[b.boss].name : ''}` : '' }),
          unlocked ? null : el('div.pick-lock', { text: '🔒 Vorheriges Biom schaffen' }),
        ]);
        if (unlocked) tap(node, () => { setupState.biome = b.id; render(); });
        biomeRow.appendChild(node);
      }

      // Schwierigkeit
      const beaten = (pr2.difficultyBeaten || {})[setupState.biome];
      const maxDiff = beaten == null ? 1 : Math.min(DIFFICULTIES.length - 1, beaten + 1);
      const diffRow = el('div.diffs');
      for (const d of DIFFICULTIES) {
        const unlocked = d.id <= maxDiff;
        if (!unlocked && setupState.diff === d.id) setupState.diff = maxDiff;
        const node = el(`div.diff${setupState.diff === d.id ? '.active' : ''}${unlocked ? '' : '.locked'}`, null, [
          el('div.d-ico', { text: d.icon }),
          el('div', { text: d.name }),
          el('div', { text: `×${d.hpMul.toFixed(1)} LP`, style: { fontSize: '9px', opacity: .7 } }),
        ]);
        if (unlocked) tap(node, () => { setupState.diff = d.id; render(); });
        diffRow.appendChild(node);
      }

      const startWeapon = WEAPONS[char.weapon];

      // Seed
      const seedInput = el('input', {
        type: 'text', placeholder: 'Zufällig', maxlength: 8,
        value: setupState.seedText,
      });
      seedInput.addEventListener('input', () => { setupState.seedText = seedInput.value; });
      seedInput.addEventListener('pointerdown', (e) => e.stopPropagation());

      return scrollArea([
        el('div.card-meta', { text: 'Figur' }),
        charRow,
        el('div.card', { style: { borderColor: 'var(--line-strong)' } }, [
          el('div.card-head', null, [
            el('div.card-icon', null, [spriteNode(playerSprite(char.skin, 96), 42)]),
            el('div', null, [
              el('div.card-name', { text: char.name }),
              el('div.card-meta', { text: char.tagline }),
            ]),
          ]),
          el('div.card-desc', { text: char.traitText }),
          el('div.statlist', null, Object.keys(char.stats).length
            ? Object.keys(char.stats).map((k) => {
              const v = char.stats[k];
              const flat = ['maxHp', 'armor', 'hpRegen', 'engineering', 'thorns'].includes(k);
              return el('div.statline', null, [
                el('span', { text: k }),
                el('span', {
                  text: flat ? (v > 0 ? '+' : '') + v : (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
                  class: v > 0 ? 'good' : 'bad',
                }),
              ]);
            })
            : [el('div.statline', null, [el('span', { text: 'Standardwerte' }), el('span', { text: '—' })]),
            ]),
          startWeapon ? el('div.card-foot', null, [
            el('div.card-meta', { text: 'Startwaffe' }),
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
              spriteNode(weaponIcon(startWeapon.art, startWeapon.color, 72), 26),
              el('span', { text: startWeapon.name, style: { fontSize: '12px' } }),
            ]),
          ]) : null,
        ]),

        el('div.divider'),
        el('div.card-meta', { text: 'Biom' }),
        biomeRow,
        el('div.hint', { text: biome.subtitle }),

        el('div.divider'),
        el('div.card-meta', { text: 'Schwierigkeit' }),
        diffRow,

        el('div.divider'),
        el('div.setting', null, [
          el('div.setting-label', { html: 'Startwert<small>Gleicher Code = gleicher Dungeon</small>' }),
          seedInput,
        ]),
      ]);
    };

    const bodyHolder = el('div', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex' } });
    sheet.appendChild(bodyHolder);
    render();

    const start = el('button.btn.btn-primary.btn-lg', { text: '⚔️ Los' });
    tap(start, () => {
      const seed = setupState.seedText.trim() ? codeToSeed(setupState.seedText) : null;
      closeOverlay();
      showHud(true);
      resetHudCaches();
      api.startRun({
        charId: setupState.char,
        biomeId: setupState.biome,
        difficulty: setupState.diff,
        seed,
      });
    }, { sound: 'waveStart', haptic: 24 });

    sheet.appendChild(el('div.sheet-foot', null, [
      btn('← Zurück', showMenu, 'btn-ghost btn-sm'),
      start,
    ]));
    root.appendChild(sheet);
  });
}

// --- Pause -------------------------------------------------------------

export function showPause() {
  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { text: 'Pause' }),
      el('div.sheet-sub', {
        text: `${G.biome.name} · Welle ${G.wave} · Stufe ${G.level} · ${G.difficulty.icon} ${G.difficulty.name}`,
      }),
    ]));

    const weapons = el('div.pause-weapons', null, G.weapons.map((w) =>
      el('div.pw', { style: { borderColor: TIER_COLORS[w.def.tier] } }, [
        spriteNode(weaponIcon(w.def.art, w.def.color, 72), 26),
        el('span', { text: w.def.name }),
      ]),
    ));

    sheet.appendChild(scrollArea([
      el('div.card-meta', { text: 'Waffen' }),
      weapons,
      G.armor ? el('div', null, [el('div.card-meta', { text: 'Rüstung' }), gearCard(G.armor, {})]) : null,
      G.artifacts.length ? el('div', null, [
        el('div.card-meta', { text: 'Artefakte' }),
        el('div.grid.grid-auto', null, G.artifacts.map((a) => artifactCard(a.def, { desc: true }))),
      ]) : null,
      el('div.divider'),
      el('div.card-meta', { text: 'Werte' }),
      statGrid(),
      el('div.divider'),
      el('div.hint', {
        text: `Startwert: ${seedToCode(G.seed)} — mit diesem Code spielst du denselben Dungeon nochmal.`,
      }),
    ]));

    const resume = el('button.btn.btn-primary.btn-lg', { text: '▶ Weiter' });
    tap(resume, () => { closeOverlay(); api.resume(); });

    sheet.appendChild(el('div.sheet-foot', null, [
      btn('⚙️', () => showSettings(showPause), 'btn-ghost btn-sm'),
      resume,
      btn('Aufgeben', () => confirmQuit(), 'btn-danger btn-sm'),
    ]));
    root.appendChild(sheet);
  });
}

function confirmQuit() {
  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { text: 'Lauf aufgeben?' }),
      el('div.sheet-sub', { text: 'Der Fortschritt dieses Laufs ist dann weg.' }),
    ]));
    sheet.appendChild(el('div', { style: { flex: '1 1 auto' } }));
    sheet.appendChild(el('div.sheet-foot', null, [
      btn('Nein, weiter', showPause, 'btn-ghost'),
      btn('Ja, aufgeben', () => { api.quitRun(); }, 'btn-danger'),
    ]));
    root.appendChild(sheet);
  });
}

// --- Stufenaufstieg ---------------------------------------------------

export function showLevelUp(count) {
  levelQueue = count;
  nextLevelCard();
}

function nextLevelCard() {
  if (levelQueue <= 0) {
    closeOverlay();
    api.resume();
    return;
  }
  levelQueue--;

  // Drei Karten ziehen, keine doppelt
  const rng = G.rng;
  const pool = LEVEL_CARDS.slice();
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const c = rng.weighted(pool, (x) => x.weight);
    if (!c) break;
    picks.push(c);
    pool.splice(pool.indexOf(c), 1);
  }

  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { html: `Stufe <span class="accent">${G.level}</span>` }),
      el('div.sheet-sub', {
        text: levelQueue > 0 ? `Wähle eine Verbesserung · noch ${levelQueue + 1}` : 'Wähle eine Verbesserung',
      }),
    ]));

    const cards = el('div.lvl-cards', null, picks.map((c) => {
      const node = el(`div.lvl-card${c.tier ? '.t' + c.tier : ''}`, null, [
        el('div.lvl-ico', { text: c.icon }),
        el('div.lvl-name', { text: c.name }),
        el('div.lvl-stats', null, Object.keys(c.stats).map((k) => {
          const v = c.stats[k];
          const flat = ['maxHp', 'armor', 'hpRegen', 'engineering', 'thorns', 'revives'].includes(k);
          const text = flat
            ? `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`
            : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
          return el('span', {
            text: `${text} ${labelOf(k)}`,
            style: { color: (k === 'rollCd' || k === 'artifactCd' ? v < 0 : v > 0) ? 'var(--green)' : 'var(--red)' },
          });
        })),
      ]);
      tap(node, () => {
        takeLevelCard(c);
        toast(c.name, 'var(--amber-soft)');
        nextLevelCard();
      }, { sound: 'levelup', haptic: 18 });
      return node;
    }));

    const body = scrollArea([
      cards,
      el('div.divider'),
      el('div.hint', {
        text: G.enchPoints > 0
          ? `Du hast ${G.enchPoints} Verzauberungspunkt${G.enchPoints > 1 ? 'e' : ''} — im Lager einsetzen.`
          : 'Jede dritte Stufe gibt einen Verzauberungspunkt.',
      }),
    ]);
    body.classList.add('center');
    sheet.appendChild(body);
    root.appendChild(sheet);
  });
}

const SHORT_LABELS = {
  maxHp: 'LP', armor: 'Panzerung', hpRegen: 'Regen', lifesteal: 'Lebensraub',
  dodge: 'Ausweichen', speed: 'Tempo', dmgAll: 'Schaden', dmgMelee: 'Nahkampf',
  dmgRanged: 'Fernkampf', dmgElem: 'Elementar', attackSpeed: 'Tempo',
  crit: 'Crit', critDmg: 'Crit-Schaden', range: 'Reichweite', luck: 'Glück',
  harvesting: 'Ernte', pickupRange: 'Sammeln', engineering: 'Technik',
  thorns: 'Dornen', xpGain: 'Erfahrung', rollCd: 'Rollen-Abkl.',
  artifactCd: 'Artefakt-Abkl.', dotDuration: 'Effektdauer',
  knockback: 'Rückstoß', explosionSize: 'Fläche', revives: 'Rettung',
};
const labelOf = (k) => SHORT_LABELS[k] || k;

// --- Lager -------------------------------------------------------------

export function showCamp() {
  open((root) => {
    openCamp(root, () => {
      closeOverlay();
      api.nextWave();
    });
  });
}

// --- Tod / Sieg --------------------------------------------------------

export function showDeath(summary) {
  finishRun(summary, false);
}

export function showWin(summary) {
  finishRun(summary, true);
}

function finishRun(summary, won) {
  // Fortschritt verbuchen
  const pr = progress();
  pr.kills = (pr.kills || 0) + summary.kills;
  pr.totalKnollen = (pr.totalKnollen || 0) + summary.knollen;
  if (summary.wave > (pr.bestWave || 0)) pr.bestWave = summary.wave;
  if (summary.score > (pr.bestScore || 0)) pr.bestScore = summary.score;

  const unlocked = [];
  if (won) {
    pr.wins = (pr.wins || 0) + 1;
    const biome = BIOMES[summary.biomeId];
    const prevBeaten = (pr.difficultyBeaten || {})[summary.biomeId];
    if (prevBeaten == null || summary.difficultyId > prevBeaten) {
      pr.difficultyBeaten = pr.difficultyBeaten || {};
      pr.difficultyBeaten[summary.biomeId] = summary.difficultyId;
    }
    if (biome && biome.boss && unlock('bossesKilled', biome.boss)) {
      unlocked.push(`Boss besiegt: ${BOSSES[biome.boss].name}`);
    }
    if (biome && biome.reward) {
      if (biome.reward.biome && unlock('unlockedBiomes', biome.reward.biome)) {
        unlocked.push(`Neues Biom: ${BIOMES[biome.reward.biome].name}`);
      }
      if (biome.reward.char && unlock('unlockedChars', biome.reward.char)) {
        unlocked.push(`Neue Figur: ${CHARACTERS[biome.reward.char].name}`);
      }
    }
  }
  // Weitere Freischaltungen über Meilensteine
  if (summary.wave >= 10 && unlock('unlockedChars', 'suess')) unlocked.push('Neue Figur: Süßkartoffel');
  if (summary.knollen >= 2000 && unlock('unlockedChars', 'golden')) unlocked.push('Neue Figur: Goldene Knolle');
  if (G.flawlessWaves >= 5 && unlock('unlockedChars', 'frost')) unlocked.push('Neue Figur: Frostknolle');
  markDirty();
  flush(true);

  const rank = recordScore({
    name: save().lastName || G.character.name,
    char: summary.charId,
    biome: summary.biomeId,
    wave: summary.wave,
    kills: summary.kills,
    score: summary.score,
    won,
    diff: summary.difficultyId,
    date: new Date().toISOString().slice(0, 10),
  });

  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', {
        html: won
          ? `<span class="accent">${G.biome.name} geschafft!</span>`
          : 'Verloren',
      }),
      el('div.sheet-sub', {
        text: won
          ? `${BOSSES[G.biome.boss] ? BOSSES[G.biome.boss].name : 'Der Boss'} liegt. ${G.character.name} lebt.`
          : `Welle ${summary.wave} von ${G.biome.waves} · ${G.character.name}`,
      }),
    ]));

    sheet.appendChild(scrollArea([
      el('div.score-big', { text: fmtNum(summary.score) }),
      el('div.hint', { text: rank <= 25 ? `Platz ${rank} in deiner Bestenliste` : 'Kein Platz in der Bestenliste' }),

      unlocked.length ? el('div.card', { style: { borderColor: 'var(--amber)' } }, [
        el('div.card-name', { text: '🔓 Freigeschaltet' }),
        el('div.statlist', null, unlocked.map((u) => el('div.card-desc', { text: u }))),
      ]) : null,

      el('div.result-stats', null, [
        rstat('Welle', `${summary.wave}`),
        rstat('Stufe', `${summary.level}`),
        rstat('Abschüsse', fmtNum(summary.kills)),
        rstat('Knollen', fmtNum(summary.knollen)),
        rstat('Schaden', fmtNum(summary.damageDealt)),
        rstat('Erlitten', fmtNum(summary.damageTaken)),
        rstat('Zeit', fmtTime(summary.time)),
        rstat('Startwert', seedToCode(summary.seed)),
      ]),

      el('div.divider'),
      el('div.card-meta', { text: 'Dein Aufbau' }),
      el('div.pause-weapons', null, G.weapons.map((w) =>
        el('div.pw', { style: { borderColor: TIER_COLORS[w.def.tier] } }, [
          spriteNode(weaponIcon(w.def.art, w.def.color, 72), 26),
          el('span', { text: w.def.name }),
        ]),
      )),
      summary.items.length ? el('div.hint', { text: summary.items.join(' · ') }) : null,
      el('div.divider'),
      statGrid(),
    ]));

    const again = el('button.btn.btn-primary.btn-lg', { text: '🔁 Nochmal' });
    tap(again, () => {
      closeOverlay();
      showHud(true);
      resetHudCaches();
      api.startRun({
        charId: summary.charId,
        biomeId: summary.biomeId,
        difficulty: summary.difficultyId,
        seed: null,
      });
    }, { sound: 'waveStart' });

    sheet.appendChild(el('div.sheet-foot', null, [
      btn('Menü', () => { api.quitRun(); }, 'btn-ghost btn-sm'),
      again,
    ]));
    root.appendChild(sheet);
  });
}

const rstat = (label, val) => el('div.rstat', null, [
  el('div.rs-label', { text: label }),
  el('div.rs-val', { text: val }),
]);

// --- Sammlung ----------------------------------------------------------

export function showCollection() {
  open((root) => {
    const pr = progress();
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { html: 'Die <span class="accent">Knollen</span>' }),
      el('div.sheet-sub', { text: `${pr.unlockedChars.length} von ${CHARACTER_LIST.length} freigeschaltet` }),
    ]));

    const grid = el('div.grid.grid-auto');
    for (const c of CHARACTER_LIST) {
      const unlocked = pr.unlockedChars.includes(c.id);
      const card = el('div.card' + (unlocked ? '' : '.locked'));
      card.appendChild(el('div.card-head', null, [
        el('div.card-icon', null, unlocked
          ? [spriteNode(playerSprite(c.skin, 96), 42)]
          : [el('span', { text: '🔒' })]),
        el('div', null, [
          el('div.card-name', { text: unlocked ? c.name : '???' }),
          el('div.card-meta', { text: unlocked ? c.tagline : 'Noch verborgen' }),
        ]),
      ]));
      card.appendChild(el('div.card-desc', { text: unlocked ? c.traitText : `Bedingung: ${c.unlock}` }));
      grid.appendChild(card);
    }

    const bosses = el('div.grid.grid-2');
    for (const b of BIOME_LIST) {
      const killed = (pr.bossesKilled || []).includes(b.boss);
      const bd = BOSSES[b.boss];
      bosses.appendChild(el('div.card' + (killed ? '' : '.locked'), null, [
        el('div.card-head', null, [
          el('div.card-icon', { text: killed ? '💀' : '❓' }),
          el('div', null, [
            el('div.card-name', { text: killed ? bd.name : '???' }),
            el('div.card-meta', { text: b.name }),
          ]),
        ]),
        killed ? el('div.card-flavor', { text: bd.title }) : null,
      ]));
    }

    sheet.appendChild(scrollArea([
      grid,
      el('div.divider'),
      el('div.card-meta', { text: 'Bosse' }),
      bosses,
    ]));
    sheet.appendChild(el('div.sheet-foot', null, [btn('← Zurück', showMenu, 'btn-ghost')]));
    root.appendChild(sheet);
  });
}

// --- Bestenliste -------------------------------------------------------

export function showScores() {
  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { html: '<span class="accent">Bestenliste</span>' }),
      el('div.sheet-sub', { text: 'Lokal auf diesem Gerät' }),
    ]));

    const list = save().scores;
    const rows = list.length
      ? list.map((s, i) => el('div.score-row' + (i === 0 ? '.me' : ''), null, [
        el('div.sr-rank', { text: `${i + 1}` }),
        el('div.sr-main', null, [
          el('div', { text: `${CHARACTERS[s.char] ? CHARACTERS[s.char].name : s.char} · Welle ${s.wave}` }),
          el('div.sr-sub', {
            text: `${BIOMES[s.biome] ? BIOMES[s.biome].name : s.biome} · ${DIFFICULTIES[s.diff] ? DIFFICULTIES[s.diff].name : ''} · ${s.date}${s.won ? ' · 🏆' : ''}`,
          }),
        ]),
        el('div.sr-score', { text: fmtNum(s.score) }),
      ]))
      : [el('div.empty', { text: 'Noch keine Läufe. Dann mal los.' })];

    sheet.appendChild(scrollArea([el('div.scores', null, rows)]));
    sheet.appendChild(el('div.sheet-foot', null, [btn('← Zurück', showMenu, 'btn-ghost')]));
    root.appendChild(sheet);
  });
}

// --- Anleitung ---------------------------------------------------------

export function showHelp() {
  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { html: 'So <span class="accent">funktioniert</span> es' }),
    ]));

    const section = (title, lines) => el('div.card', null, [
      el('div.card-name', { text: title }),
      ...lines.map((l) => el('div.card-desc', { text: l })),
    ]);

    sheet.appendChild(scrollArea([
      section('Steuerung', [
        'Linke Bildschirmhälfte: Daumen auflegen und ziehen — der Stick entsteht dort, wo du hintippst.',
        'Waffen schießen von allein auf den nächsten Gegner. Du musst nur laufen.',
        'Rechts unten: ↻ ist Rollen (kurz unverwundbar). Darüber liegen deine Artefakte.',
        'Tastatur: WASD/Pfeile, Leertaste rollt, 1–3 für Artefakte, Esc pausiert.',
      ]),
      section('Eine Welle', [
        'Überlebe, bis der Timer abläuft. Danach werden alle Gegner entfernt und alles Liegengebliebene automatisch eingesammelt.',
        'Welle 5, 10 und 15 haben einen Anführer. Die letzte Welle ist der Boss.',
        'Gefahren am Boden — Lava, Öl, Gift — schaden auch den Gegnern. Nutze sie.',
      ]),
      section('Knollen und Stufen', [
        'Knollen sind Geld. Du gibst sie im Lager für Waffen, Gegenstände und Artefakte aus.',
        'Erfahrung bringt Stufen. Jede Stufe gibt eine Verbesserungskarte, jede dritte zusätzlich einen Verzauberungspunkt.',
      ]),
      section('Waffen verschmelzen', [
        'Zwei gleiche Waffen derselben Stufe lassen sich im Lager zur nächsten Stufe verschmelzen — bis Legendär.',
        'Vier Plätze. Breit sammeln bringt Klassen-Boni, eindampfen bringt rohe Zahlen.',
      ]),
      section('Verzauberungen', [
        'Jede Waffe und jede Rüstung hat Fassungen. Pro Fassung werden drei Runen angeboten, du wählst eine — endgültig.',
        'Mit weiteren Punkten steigerst du sie auf Stufe III. Steigern ist oft stärker als eine zweite Rune.',
      ]),
      section('Waffenklassen', [
        'Klinge, Wucht, Stich, Fernkampf, Elementar, Konstrukt, Natur.',
        'Ab 2, 4 und 6 Waffen einer Klasse gibt es wachsende Boni — oben links siehst du den Zähler.',
      ]),
      el('div.hint', { text: 'Der Startwert eines Laufs steht im Pausenmenü. Gleicher Code, gleicher Dungeon.' }),
    ]));
    sheet.appendChild(el('div.sheet-foot', null, [btn('← Zurück', showMenu, 'btn-ghost')]));
    root.appendChild(sheet);
  });
}

// --- Einstellungen -----------------------------------------------------

export function showSettings(backFn) {
  open((root) => {
    const st = settings();
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { html: '<span class="accent">Einstellungen</span>' }),
    ]));

    const slider = (label, hint, key, min, max, step, onChange) => {
      const input = el('input', { type: 'range', min, max, step, value: st[key] });
      input.addEventListener('input', () => {
        setSetting(key, parseFloat(input.value));
        if (onChange) onChange();
      });
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      return el('div.setting', null, [
        el('div.setting-label', { html: `${label}<small>${hint}</small>` }),
        input,
      ]);
    };

    const segment = (label, hint, key, options) => {
      const seg = el('div.seg');
      for (const [val, text] of options) {
        const b = el('button' + (st[key] === val ? '.active' : ''), { text });
        tap(b, () => { setSetting(key, val); showSettings(backFn); });
        seg.appendChild(b);
      }
      return el('div.setting', null, [
        el('div.setting-label', { html: `${label}<small>${hint}</small>` }),
        seg,
      ]);
    };

    sheet.appendChild(scrollArea([
      slider('Geräusche', 'Treffer, Schüsse, Beute', 'sfx', 0, 1, 0.05, applyAudioSettings),
      slider('Musik', 'Wird im Kampf dichter', 'music', 0, 1, 0.05, applyAudioSettings),
      slider('Bildschirm-Wackeln', '0 = ganz aus', 'shake', 0, 1.5, 0.1),
      segment('Partikel', 'Weniger = flüssiger auf alten Geräten', 'particles', [
        [0, 'Aus'], [0.5, 'Sparsam'], [1, 'Voll'],
      ]),
      segment('Zielen', 'Automatisch nimmt den nächsten Gegner', 'aimMode', [
        ['auto', 'Automatisch'], ['stick', 'Zweiter Stick'],
      ]),
      segment('Stick-Seite', 'Für Linkshänder', 'stickSide', [
        ['left', 'Links'], ['right', 'Rechts'],
      ]),
      segment('Vibration', '', 'haptics', [[true, 'An'], [false, 'Aus']]),
      segment('Schadenszahlen', '', 'showDamage', [[true, 'An'], [false, 'Aus']]),
      el('div.divider'),
      el('div.hint', { text: `Potato Dungeons ${VERSION} · läuft ohne Server, Spielstand bleibt auf dem Gerät.` }),
      btn('🗑 Spielstand löschen', () => confirmReset(backFn), 'btn-danger btn-sm'),
    ]));
    sheet.appendChild(el('div.sheet-foot', null, [btn('← Zurück', backFn || showMenu, 'btn-ghost')]));
    root.appendChild(sheet);
  });
}

function confirmReset(backFn) {
  open((root) => {
    const sheet = el('div.sheet');
    sheet.appendChild(el('div.sheet-head', null, [
      el('h2.sheet-title', { text: 'Alles löschen?' }),
      el('div.sheet-sub', { text: 'Figuren, Biome, Bestenliste und Einstellungen werden zurückgesetzt.' }),
    ]));
    sheet.appendChild(el('div', { style: { flex: '1 1 auto' } }));
    sheet.appendChild(el('div.sheet-foot', null, [
      btn('Abbrechen', () => showSettings(backFn), 'btn-ghost'),
      btn('Löschen', () => { resetSave(); location.reload(); }, 'btn-danger'),
    ]));
    root.appendChild(sheet);
  });
}
