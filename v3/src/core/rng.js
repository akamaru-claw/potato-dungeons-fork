// Deterministischer Zufall. Ein Run hat einen Seed, damit Dungeons
// reproduzierbar sind (und Bugs nachstellbar).

/** mulberry32 — schnell, kurz, gut genug für ein Spiel. */
export function makeRng(seed) {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;

  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const r = {
    next,
    get seed() { return a; },
    set seed(v) { a = v >>> 0; },

    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max] inklusive. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    angle: () => next() * Math.PI * 2,
    /** Gleichverteilter Punkt in einem Kreis. */
    inCircle(radius, out = { x: 0, y: 0 }) {
      const a2 = r.angle(), d = Math.sqrt(next()) * radius;
      out.x = Math.cos(a2) * d; out.y = Math.sin(a2) * d;
      return out;
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],

    /** Zufällige Teilmenge ohne Wiederholung. */
    sample(arr, n) {
      if (n >= arr.length) return r.shuffle(arr.slice());
      const pool = arr.slice(), out = [];
      for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      return out;
    },

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },

    /** Gewichtete Auswahl. `weightOf` darf 0 zurückgeben (= nie). */
    weighted(arr, weightOf) {
      let total = 0;
      for (let i = 0; i < arr.length; i++) total += Math.max(0, weightOf(arr[i], i));
      if (total <= 0) return null;
      let roll = next() * total;
      for (let i = 0; i < arr.length; i++) {
        roll -= Math.max(0, weightOf(arr[i], i));
        if (roll <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    },

    /** Zwei Würfe gemittelt — Werte in der Mitte werden häufiger. */
    bell: (min, max) => min + ((next() + next()) * 0.5) * (max - min),
  };
  return r;
}

/** Globale Instanz für reine Optik (Partikel, Wackeln) — nie für Logik. */
export const vfxRng = makeRng((Math.random() * 0xffffffff) >>> 0);

export const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

/** Stabiler Hash, damit Namen/IDs feste Varianten bekommen. */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seed als lesbarer Code, damit Kiba einen Run teilen kann. */
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXYZ2346789';
export function seedToCode(seed) {
  let s = seed >>> 0, out = '';
  for (let i = 0; i < 6; i++) { out += ALPHABET[s % ALPHABET.length]; s = Math.floor(s / ALPHABET.length); }
  return out;
}
export function codeToSeed(code) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) return null;
  let s = 0;
  for (let i = c.length - 1; i >= 0; i--) {
    const idx = ALPHABET.indexOf(c[i]);
    if (idx < 0) return null;
    s = s * ALPHABET.length + idx;
  }
  return s >>> 0;
}
