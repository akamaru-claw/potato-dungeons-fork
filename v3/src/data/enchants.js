// Verzauberungen — das System aus Minecraft Dungeons.
//
// Jedes Ausrüstungsteil hat 1–3 Verzauberungs-Fassungen. Pro Fassung werden
// drei Kandidaten gewürfelt, man wählt einen und steigert ihn mit
// Verzauberungspunkten bis Stufe 3. Einmal gewählt, bleibt die Wahl — das
// erzwingt echte Entscheidungen statt Optimieren bis zum Optimum.

export const ENCH_SLOT_COST = [1, 2, 3];   // Punktekosten für Stufe 1/2/3

/**
 * `val` ist der Wert pro Stufe. `stats` (nur Rüstung) wird direkt auf die
 * Spielerwerte addiert. Alles andere wird im Kampf über die ID abgefragt.
 */
export const ENCHANTS = {
  // --- Waffen: direkter Schaden ---
  schaerfe: {
    name: 'Schärfe', slot: 'weapon', color: '#e86a5a',
    val: [0.12, 0.25, 0.42],
    desc: (v) => `+${Math.round(v * 100)}% Schaden dieser Waffe`,
  },
  kritisch: {
    name: 'Kritischer Treffer', slot: 'weapon', color: '#ffd93d',
    val: [0.07, 0.14, 0.24],
    desc: (v) => `+${Math.round(v * 100)}% Crit-Chance dieser Waffe`,
  },
  entschlossen: {
    name: 'Entschlossen', slot: 'weapon', color: '#d9943a',
    val: [0.35, 0.7, 1.1],
    desc: (v) => `Bis zu +${Math.round(v * 100)}% Schaden, je weniger LP du hast`,
  },
  wucht: {
    name: 'Wuchtschlag', slot: 'weapon', color: '#c08a4a',
    val: [0.3, 0.6, 1.0],
    desc: (v) => `+${Math.round(v * 100)}% Rückstoß, Schaden skaliert mit Rückstoß`,
  },
  echo: {
    name: 'Echo', slot: 'weapon', color: '#b06ef0',
    val: [0.15, 0.28, 0.42],
    desc: (v) => `${Math.round(v * 100)}% Chance, den Angriff sofort zu wiederholen`,
  },
  vielschuss: {
    name: 'Vielschuss', slot: 'weapon', color: '#58c9f3',
    val: [1, 2, 3],
    desc: (v) => `+${v} Projektil${v > 1 ? 'e' : ''} (halber Schaden für Extras)`,
  },
  durchschlag: {
    name: 'Durchschlag', slot: 'weapon', color: '#9fb0bd',
    val: [1, 2, 4],
    desc: (v) => `+${v} Durchschlag, Geschosse fliegen weiter`,
  },
  abprall: {
    name: 'Abprall', slot: 'weapon', color: '#6fe0c0',
    val: [1, 2, 3],
    desc: (v) => `Geschosse springen ${v}× auf neue Ziele`,
  },
  wirbel: {
    name: 'Wirbelnd', slot: 'weapon', color: '#a8d8c0',
    val: [0.2, 0.4, 0.65],
    desc: (v) => `+${Math.round(v * 100)}% Angriffs- und Flächengröße`,
  },

  // --- Waffen: Effekte ---
  feuerhauch: {
    name: 'Feuerhauch', slot: 'weapon', color: '#ff8a3d',
    val: [5, 11, 20],
    desc: (v) => `Treffer entzünden: ${v} Schaden/s für 3s`,
  },
  frostbiss: {
    name: 'Frostbiss', slot: 'weapon', color: '#8fd8f0',
    val: [0.25, 0.4, 0.6],
    desc: (v) => `Treffer verlangsamen um ${Math.round(v * 100)}% für 2s`,
  },
  giftklinge: {
    name: 'Giftklinge', slot: 'weapon', color: '#8fd14f',
    val: [4, 9, 16],
    desc: (v) => `Treffer vergiften: ${v} Schaden/s für 4s`,
  },
  kettenblitz: {
    name: 'Kettenblitz', slot: 'weapon', color: '#9ef0ff',
    val: [0.12, 0.22, 0.35],
    desc: (v) => `${Math.round(v * 100)}% Chance auf einen Blitz zum nächsten Gegner`,
  },
  explosiv: {
    name: 'Explosiv', slot: 'weapon', color: '#e8503a',
    val: [0.4, 0.7, 1.1],
    desc: (v) => `Getötete Gegner explodieren für ${Math.round(v * 100)}% Schaden`,
  },
  betaeubung: {
    name: 'Betäubung', slot: 'weapon', color: '#f0d04a',
    val: [0.1, 0.18, 0.28],
    desc: (v) => `${Math.round(v * 100)}% Chance, Gegner 0,6s zu betäuben`,
  },
  schwerkraft: {
    name: 'Schwerkraft', slot: 'weapon', color: '#7a6fd0',
    val: [90, 170, 280],
    desc: (v) => `Treffer ziehen Gegner ${v} Einheiten zu dir`,
  },
  seelenraub: {
    name: 'Seelenraub', slot: 'weapon', color: '#c06ff0',
    val: [0.04, 0.08, 0.14],
    desc: (v) => `${Math.round(v * 100)}% des Schadens als Lebensraub`,
  },
  strahlen: {
    name: 'Strahlen', slot: 'weapon', color: '#ffe79a',
    val: [1, 2, 4],
    desc: (v) => `Jeder 6. Treffer heilt dich um ${v}`,
  },
  gier: {
    name: 'Gier', slot: 'weapon', color: '#f5cf3a',
    val: [0.2, 0.4, 0.7],
    desc: (v) => `+${Math.round(v * 100)}% Knollen von Gegnern, die diese Waffe tötet`,
  },

  // --- Rüstung: Werte ---
  leben: {
    name: 'Zähe Schale', slot: 'armor', color: '#7bd44f',
    val: [12, 26, 45],
    stats: (v) => ({ maxHp: v }),
    desc: (v) => `+${v} maximale Lebenspunkte`,
  },
  schutz: {
    name: 'Schutz', slot: 'armor', color: '#9fb0bd',
    val: [4, 9, 16],
    stats: (v) => ({ armor: v }),
    desc: (v) => `+${v} Panzerung`,
  },
  ausweichen: {
    name: 'Flinkheit', slot: 'armor', color: '#58c9f3',
    val: [0.05, 0.1, 0.16],
    stats: (v) => ({ dodge: v }),
    desc: (v) => `+${Math.round(v * 100)}% Ausweichen`,
  },
  eile: {
    name: 'Eile', slot: 'armor', color: '#6fe0c0',
    val: [0.08, 0.16, 0.26],
    stats: (v) => ({ speed: v }),
    desc: (v) => `+${Math.round(v * 100)}% Lauftempo`,
  },
  regeneration: {
    name: 'Regeneration', slot: 'armor', color: '#9ad65c',
    val: [1.5, 3.5, 6],
    stats: (v) => ({ hpRegen: v }),
    desc: (v) => `+${v} LP-Regeneration pro Sekunde`,
  },
  magnet: {
    name: 'Magnetknolle', slot: 'armor', color: '#d9943a',
    val: [0.5, 1.1, 2.0],
    stats: (v) => ({ pickupRange: v }),
    desc: (v) => `+${Math.round(v * 100)}% Aufsammel-Radius`,
  },
  reflex: {
    name: 'Reflex', slot: 'armor', color: '#f0a8c0',
    val: [0.18, 0.32, 0.48],
    stats: (v) => ({ rollCd: -v }),
    desc: (v) => `−${Math.round(v * 100)}% Rollen-Abklingzeit`,
  },
  totemgespuer: {
    name: 'Totemgespür', slot: 'armor', color: '#b06ef0',
    val: [0.15, 0.28, 0.42],
    stats: (v) => ({ artifactCd: -v }),
    desc: (v) => `−${Math.round(v * 100)}% Artefakt-Abklingzeit`,
  },
  stachelhaut: {
    name: 'Stachelhaut', slot: 'armor', color: '#e86a5a',
    val: [8, 18, 32],
    desc: (v) => `Angreifer im Nahkampf nehmen ${v} Schaden`,
  },
  letzteknolle: {
    name: 'Letzte Knolle', slot: 'armor', color: '#ffd93d',
    val: [1, 1, 2],
    desc: (v) => `Überlebt ${v}× pro Lauf einen tödlichen Treffer mit 1 LP`,
  },
};

export const ENCH_IDS = Object.keys(ENCHANTS);
export const WEAPON_ENCHANTS = ENCH_IDS.filter((id) => ENCHANTS[id].slot === 'weapon');
export const ARMOR_ENCHANTS = ENCH_IDS.filter((id) => ENCHANTS[id].slot === 'armor');

export const enchValue = (id, lvl) => {
  const e = ENCHANTS[id];
  if (!e || lvl <= 0) return 0;
  return e.val[Math.min(lvl, 3) - 1];
};

export const enchDesc = (id, lvl) => {
  const e = ENCHANTS[id];
  if (!e) return '';
  return e.desc(enchValue(id, Math.max(1, lvl)));
};

/** Kosten, um von `lvl` auf `lvl+1` zu steigern. */
export const enchCost = (lvl) => ENCH_SLOT_COST[Math.min(lvl, 2)];

/**
 * Baut aus den Fassungen eines Teils die Nachschlag-Tabelle `{id: level}`.
 * Mehrere Teile mit derselben Verzauberung addieren die Stufen (max 3).
 */
export function collectEnchants(items, into = Object.create(null)) {
  for (const it of items) {
    if (!it || !it.slots) continue;
    for (const s of it.slots) {
      if (!s.chosen || s.level <= 0) continue;
      into[s.chosen] = Math.min(3, (into[s.chosen] || 0) + s.level);
    }
  }
  return into;
}

/** Summiert die passiven Rüstungs-Boni. */
export function enchantStats(enchMap) {
  const out = {};
  for (const id in enchMap) {
    const e = ENCHANTS[id];
    if (!e || !e.stats) continue;
    const s = e.stats(enchValue(id, enchMap[id]));
    for (const k in s) out[k] = (out[k] || 0) + s[k];
  }
  return out;
}
