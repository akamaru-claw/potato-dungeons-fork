// Spielstand. Ein einziger localStorage-Key, versioniert, defensiv gelesen —
// ein kaputter Eintrag darf das Spiel nie am Start hindern.

const KEY = 'potatodungeons.v3';
const VERSION = 3;

const DEFAULTS = () => ({
  version: VERSION,
  settings: {
    sfx: 0.7,
    music: 0.35,
    haptics: true,
    shake: 1,
    particles: 1,       // 0 = aus, 0.5 = sparsam, 1 = voll
    aimMode: 'auto',    // 'auto' | 'stick'
    stickSide: 'left',
    showDamage: true,
    highContrast: false,
    fpsCap: 0,          // 0 = Bildschirm-Rate
  },
  progress: {
    runs: 0,
    wins: 0,
    kills: 0,
    bestWave: 0,
    bestScore: 0,
    totalKnollen: 0,
    playtime: 0,
    unlockedChars: ['knolle'],
    unlockedBiomes: ['keller'],
    seenWeapons: [],
    seenArtifacts: [],
    bossesKilled: [],
    difficultyBeaten: {},   // biomeId -> höchste geschaffte Stufe
  },
  scores: [],           // lokale Bestenliste
  lastName: '',
});

let data = DEFAULTS();
let dirty = false;
let flushTimer = 0;

function deepMerge(target, src) {
  for (const k in src) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k], v);
    } else if (v !== undefined) {
      target[k] = v;
    }
  }
  return target;
}

export function loadSave() {
  data = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Ältere Formate einfach drübermergen; fehlende Felder bleiben Default.
        deepMerge(data, parsed);
        data.version = VERSION;
        if (!Array.isArray(data.scores)) data.scores = [];
        if (!Array.isArray(data.progress.unlockedChars) || !data.progress.unlockedChars.length) {
          data.progress.unlockedChars = ['knolle'];
        }
      }
    }
  } catch (err) {
    console.warn('[save] Spielstand unlesbar, starte frisch.', err);
  }
  return data;
}

export const save = () => data;
export const settings = () => data.settings;
export const progress = () => data.progress;

/** Markiert den Stand als geändert; geschrieben wird gebündelt. */
export function markDirty() {
  dirty = true;
}

export function flush(force = false) {
  if (!dirty && !force) return;
  dirty = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[save] Schreiben fehlgeschlagen.', err);
  }
}

/** Im Loop aufrufen: schreibt höchstens alle 4 Sekunden. */
export function tickSave(dt) {
  if (!dirty) return;
  flushTimer -= dt;
  if (flushTimer <= 0) { flushTimer = 4; flush(); }
}

export function setSetting(key, value) {
  data.settings[key] = value;
  markDirty();
  flush();
}

export function unlock(list, id) {
  const arr = data.progress[list];
  if (Array.isArray(arr) && !arr.includes(id)) {
    arr.push(id);
    markDirty();
    return true;
  }
  return false;
}

export function noteSeen(list, id) {
  return unlock(list, id);
}

/** Lauf-Ergebnis in die lokale Bestenliste. Gibt den Rang zurück (1-basiert). */
export function recordScore(entry) {
  data.scores.push(entry);
  data.scores.sort((a, b) => (b.score || 0) - (a.score || 0));
  data.scores = data.scores.slice(0, 25);
  markDirty();
  flush();
  return data.scores.indexOf(entry) + 1;
}

export function resetSave() {
  data = DEFAULTS();
  try { localStorage.removeItem(KEY); } catch (_) { /* egal */ }
}

// Letzte Chance, den Stand zu sichern, wenn die App in den Hintergrund geht.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
}
