// Kompletter Sound synthetisch über WebAudio — keine Dateien, kein Ladebalken,
// nichts was auf dem Handy erst 2 MB ziehen muss.

import { clamp } from './math.js';
import { settings } from './storage.js';

let ctx = null;
let master = null, sfxBus = null, musicBus = null;
let noiseBuf = null;
let unlocked = false;
let suspended = false;

// Pro Sound-Key ein Mindestabstand, sonst wird aus 30 Treffern pro Sekunde Lärm.
const lastPlay = Object.create(null);
let voices = 0;
const MAX_VOICES = 22;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch (_) { return null; }

  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Weicher Limiter, damit Explosionen nicht clippen.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  comp.connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings().sfx;
  sfxBus.connect(comp);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(comp);

  // 2 s weißes Rauschen als Quelle für alles Perkussive.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

  return ctx;
}

/** Browser verlangen eine Nutzer-Interaktion. Aus jedem Tap/Klick aufrufen. */
export function unlockAudio() {
  if (!ctx) initAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  unlocked = true;
}

export function applyAudioSettings() {
  if (!ctx) return;
  sfxBus.gain.value = settings().sfx;
  if (music.playing) musicBus.gain.setTargetAtTime(settings().music * 0.6, ctx.currentTime, 0.3);
  else musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

export function setAudioSuspended(v) {
  suspended = v;
  if (!ctx) return;
  master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.05);
}

const ready = () => ctx && unlocked && !suspended && settings().sfx > 0;

function voice() {
  if (voices >= MAX_VOICES) return false;
  voices++;
  setTimeout(() => { voices--; }, 400);
  return true;
}

function env(node, t0, dur, peak, attack = 0.004) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g);
  return g;
}

function tone(type, freq, dur, peak, t0, bendTo = null, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (bendTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, bendTo), t0 + dur * 0.9);
  if (detune) o.detune.value = detune;
  const g = env(o, t0, dur, peak);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  return g;
}

function noise(dur, peak, t0, filterType = 'bandpass', freq = 1200, q = 1, bendTo = null) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 1;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, t0);
  if (bendTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, bendTo), t0 + dur);
  f.Q.value = q;
  s.connect(f);
  const g = env(f, t0, dur, peak, 0.002);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + dur + 0.02);
  return g;
}

/**
 * Alle Sounds. `pan` in [-1,1] für Stereo-Ortung, `pitch` als Multiplikator.
 * Rückgabe egal — alles feuert und vergisst.
 */
const RECIPES = {
  // --- Waffen ---
  swing:   (t, p) => [noise(0.13, 0.30, t, 'bandpass', 2400 * p, 1.4, 700 * p)],
  thrust:  (t, p) => [noise(0.09, 0.26, t, 'highpass', 1800 * p, 0.8, 900 * p)],
  heavy:   (t, p) => [noise(0.22, 0.38, t, 'lowpass', 900 * p, 1.2, 160 * p),
                      tone('sine', 150 * p, 0.2, 0.3, t, 48 * p)],
  shoot:   (t, p) => [tone('square', 760 * p, 0.09, 0.18, t, 220 * p),
                      noise(0.06, 0.14, t, 'highpass', 2600, 0.7)],
  laser:   (t, p) => [tone('sawtooth', 1400 * p, 0.14, 0.14, t, 300 * p)],
  zap:     (t, p) => [tone('square', 2000 * p, 0.07, 0.13, t, 520 * p),
                      noise(0.1, 0.16, t, 'bandpass', 3800, 6)],
  bomb:    (t, p) => [noise(0.5, 0.5, t, 'lowpass', 1100 * p, 0.9, 50),
                      tone('sine', 110 * p, 0.42, 0.42, t, 26)],
  // --- Treffer ---
  hit:     (t, p) => [noise(0.07, 0.24, t, 'bandpass', 1500 * p, 2.2, 600 * p)],
  crit:    (t, p) => [noise(0.1, 0.3, t, 'bandpass', 3000 * p, 3, 900 * p),
                      tone('triangle', 1250 * p, 0.12, 0.2, t, 1900 * p)],
  armored: (t, p) => [noise(0.1, 0.26, t, 'bandpass', 5200 * p, 9, 4200 * p)],
  kill:    (t, p) => [noise(0.2, 0.3, t, 'lowpass', 1600 * p, 1, 220),
                      tone('triangle', 420 * p, 0.17, 0.16, t, 130 * p)],
  // --- Spieler ---
  hurt:    (t, p) => [tone('sawtooth', 300 * p, 0.2, 0.3, t, 90 * p),
                      noise(0.14, 0.2, t, 'bandpass', 700, 1.2)],
  dodge:   (t, p) => [tone('sine', 1500 * p, 0.1, 0.12, t, 2400 * p)],
  roll:    (t, p) => [noise(0.2, 0.2, t, 'bandpass', 500 * p, 0.9, 1500 * p)],
  block:   (t, p) => [noise(0.12, 0.3, t, 'bandpass', 4400, 11, 3000)],
  death:   (t, p) => [tone('sawtooth', 340, 1.0, 0.36, t, 44),
                      noise(0.8, 0.26, t, 'lowpass', 900, 0.8, 70)],
  // --- Pickups / UI ---
  coin:    (t, p) => [tone('triangle', 1180 * p, 0.07, 0.11, t),
                      tone('triangle', 1760 * p, 0.1, 0.09, t + 0.05)],
  xp:      (t, p) => [tone('sine', 900 * p, 0.09, 0.08, t, 1500 * p)],
  heal:    (t, p) => [tone('sine', 620, 0.26, 0.16, t, 1040),
                      tone('sine', 930, 0.3, 0.1, t + 0.07, 1400)],
  levelup: (t) => [tone('triangle', 523, 0.16, 0.2, t), tone('triangle', 659, 0.16, 0.2, t + 0.1),
                   tone('triangle', 784, 0.16, 0.2, t + 0.2), tone('triangle', 1046, 0.4, 0.22, t + 0.3)],
  loot:    (t, p) => [tone('triangle', 740 * p, 0.1, 0.13, t), tone('triangle', 1108 * p, 0.14, 0.12, t + 0.07),
                      noise(0.2, 0.1, t, 'highpass', 5000, 1)],
  legendary: (t) => [tone('triangle', 659, 0.3, 0.2, t), tone('triangle', 988, 0.3, 0.2, t + 0.12),
                     tone('triangle', 1319, 0.6, 0.24, t + 0.24), noise(0.7, 0.12, t + 0.2, 'highpass', 6000, 1)],
  chest:   (t) => [noise(0.3, 0.3, t, 'bandpass', 900, 1.6, 2600), tone('sine', 220, 0.3, 0.2, t, 420)],
  ui:      (t, p) => [tone('square', 620 * p, 0.045, 0.085, t)],
  uiBack:  (t) => [tone('square', 420, 0.05, 0.08, t, 300)],
  buy:     (t) => [tone('triangle', 880, 0.08, 0.14, t), tone('triangle', 1320, 0.12, 0.12, t + 0.06)],
  error:   (t) => [tone('square', 220, 0.14, 0.17, t, 150)],
  waveStart: (t) => [tone('sawtooth', 160, 0.5, 0.26, t, 320), noise(0.5, 0.14, t, 'lowpass', 500, 1)],
  waveEnd: (t) => [tone('triangle', 784, 0.18, 0.2, t), tone('triangle', 1046, 0.3, 0.2, t + 0.12)],
  bossRoar: (t) => [tone('sawtooth', 90, 1.3, 0.44, t, 42), noise(1.1, 0.3, t, 'lowpass', 600, 0.7, 90),
                    tone('square', 136, 0.9, 0.16, t + 0.1, 60)],
  summon:  (t, p) => [tone('sine', 300 * p, 0.3, 0.17, t, 900 * p), noise(0.25, 0.1, t, 'bandpass', 2000, 3)],
  freeze:  (t) => [noise(0.4, 0.2, t, 'highpass', 4000, 1.6, 9000), tone('sine', 1600, 0.35, 0.1, t, 2600)],
  burn:    (t) => [noise(0.3, 0.14, t, 'bandpass', 1200, 0.8, 400)],
  teleport:(t) => [tone('sine', 400, 0.22, 0.16, t, 2200), noise(0.2, 0.1, t, 'highpass', 3000, 1)],
  enchant: (t) => [tone('sine', 523, 0.2, 0.14, t, 1046), tone('sine', 784, 0.3, 0.14, t + 0.1, 1568),
                   noise(0.4, 0.09, t + 0.05, 'highpass', 7000, 1)],
};

const THROTTLE = {
  hit: 0.035, swing: 0.05, shoot: 0.035, coin: 0.045, xp: 0.05,
  thrust: 0.05, zap: 0.05, armored: 0.05, kill: 0.04, burn: 0.12, laser: 0.06,
};

export function sfx(key, { pitch = 1, gain = 1, pan = 0 } = {}) {
  if (!ready()) return;
  const recipe = RECIPES[key];
  if (!recipe) return;

  const now = ctx.currentTime;
  const min = THROTTLE[key];
  if (min) {
    if (lastPlay[key] && now - lastPlay[key] < min) return;
    lastPlay[key] = now;
  }
  if (!voice()) return;

  let out = sfxBus;
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(sfxBus);
    out = p;
  }
  let vol = out;
  if (gain !== 1) {
    vol = ctx.createGain();
    vol.gain.value = clamp(gain, 0, 2);
    vol.connect(out);
  }

  try {
    for (const g of recipe(now + 0.001, pitch)) g.connect(vol);
  } catch (err) {
    console.warn('[audio]', key, err);
  }
}

/** Sound an einer Weltposition — pannt relativ zur Kamera. */
export function sfxAt(key, x, camX, camW, opts = {}) {
  const pan = clamp(((x - camX) / Math.max(1, camW * 0.5)), -1, 1) * 0.6;
  sfx(key, { ...opts, pan });
}

// --- Musik -------------------------------------------------------------
// Kein Loop-File, sondern ein Generator: Bass-Puls plus Arpeggio in Moll.
// Intensität steigt mit der Welle, im Boss-Kampf wird es dissonanter.

const SCALES = {
  calm:  [0, 3, 5, 7, 10],
  tense: [0, 2, 3, 7, 8],
  boss:  [0, 1, 5, 6, 10],
};

export const music = {
  playing: false,
  intensity: 0,
  mood: 'calm',
  _root: 110,
  _step: 0,
  _next: 0,
  _timer: null,
};

export function startMusic(mood = 'calm', root = 110) {
  if (!ctx || settings().music <= 0) return;
  music.mood = mood;
  music._root = root;
  music._step = 0;
  music._next = ctx.currentTime + 0.1;
  if (music.playing) return;
  music.playing = true;
  musicBus.gain.setTargetAtTime(settings().music * 0.6, ctx.currentTime, 0.8);
  music._timer = setInterval(scheduleMusic, 120);
  scheduleMusic();
}

export function stopMusic() {
  if (!music.playing) return;
  music.playing = false;
  if (music._timer) { clearInterval(music._timer); music._timer = null; }
  if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
}

export function setMusicMood(mood, intensity = music.intensity) {
  music.mood = mood;
  music.intensity = clamp(intensity, 0, 1);
}

function mnote(semi, root) {
  return root * Math.pow(2, semi / 12);
}

function scheduleMusic() {
  if (!ctx || !music.playing) return;
  const scale = SCALES[music.mood] || SCALES.calm;
  const bpm = 92 + music.intensity * 46;
  const beat = 60 / bpm / 2;        // Achtel
  const horizon = ctx.currentTime + 0.5;

  while (music._next < horizon) {
    const t = music._next;
    const s = music._step;
    const root = music._root;

    // Bass auf 1 und 3
    if (s % 4 === 0) {
      const g = tone('sine', mnote(s % 8 === 0 ? 0 : -5, root) * 0.5, beat * 3.4, 0.5, t, null);
      g.connect(musicBus);
      const sub = tone('triangle', mnote(0, root) * 0.25, beat * 2, 0.26, t);
      sub.connect(musicBus);
    }
    // Perkussion
    if (s % 2 === 1) {
      const g = noise(0.05, 0.1 + music.intensity * 0.12, t, 'highpass', 6000, 1);
      g.connect(musicBus);
    }
    if (s % 8 === 4) {
      const g = noise(0.14, 0.16, t, 'bandpass', 220, 0.8, 90);
      g.connect(musicBus);
    }
    // Arpeggio, dichter je intensiver
    if (music.intensity > 0.12 || s % 2 === 0) {
      const deg = scale[(s * 3 + (s >> 3)) % scale.length];
      const oct = 12 * (1 + ((s >> 2) % 2));
      const g = tone('triangle', mnote(deg + oct, root), beat * 1.6, 0.11 + music.intensity * 0.07, t);
      g.connect(musicBus);
    }
    // Boss: tiefes Dröhnen
    if (music.mood === 'boss' && s % 16 === 0) {
      const g = tone('sawtooth', mnote(-12, root), beat * 12, 0.1, t);
      g.connect(musicBus);
    }

    music._step = (s + 1) % 64;
    music._next += beat;
  }
}

// --- Haptik ------------------------------------------------------------

let lastBuzz = 0;
export function buzz(ms = 12) {
  if (!settings().haptics || !navigator.vibrate) return;
  const now = performance.now();
  if (now - lastBuzz < 45) return;
  lastBuzz = now;
  try { navigator.vibrate(ms); } catch (_) { /* iOS kennt das nicht */ }
}
