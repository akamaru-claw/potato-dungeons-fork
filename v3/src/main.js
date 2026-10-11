// Einstiegspunkt: Module verdrahten, Schleife starten, Menü zeigen.

import { loadSave, flush, settings } from './core/storage.js';
import { initAudio, unlockAudio, applyAudioSettings, setAudioSuspended, stopMusic } from './core/audio.js';
import { initInput, setInputEnabled } from './core/input.js';
import { clearSpriteCache } from './core/sprites.js';
import { G, PHASE } from './game/state.js';
import { rt, initRuntime, startLoop, beginRun, continueToNextWave, setPaused } from './game/run.js';
import { initHud, showHud, updateHud, onPauseButton, resetHudCaches, toast } from './ui/hud.js';
import {
  initScreens, showMenu, showPause, showLevelUp, showCamp, showDeath, showWin,
  closeOverlay, overlayOpen,
} from './ui/screens.js';

function boot() {
  loadSave();

  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');

  initRuntime(canvas);
  initAudio();
  applyAudioSettings();

  // Audio darf erst nach einer echten Nutzer-Interaktion starten.
  initInput(canvas, () => {
    unlockAudio();
    applyAudioSettings();
  });

  initHud();
  onPauseButton(() => requestPause());

  initScreens(overlay, {
    startRun(opts) {
      beginRun(opts);
      setPaused(false);
      setInputEnabled(true);
    },
    nextWave() {
      continueToNextWave();
      setPaused(false);
      setInputEnabled(true);
    },
    resume() {
      setPaused(false);
      setInputEnabled(true);
      if (G.phase === PHASE.PLAYING) showHud(true);
    },
    quitRun() {
      G.phase = PHASE.MENU;
      stopMusic();
      setPaused(false);
      flush(true);
      resetHudCaches();
      showMenu();
    },
  });

  // --- Spiel-Ereignisse an die Oberfläche hängen ---

  rt.onUpdate = (dt) => {
    if (G.phase === PHASE.PLAYING && !G.paused) updateHud(dt);
  };

  rt.onPauseRequest = () => requestPause();

  rt.onLevelUp = (count) => {
    setPaused(true);
    showHud(false);
    showLevelUp(count);
  };

  rt.onWaveEnd = () => {
    setPaused(true);
    showHud(false);
    showCamp();
  };

  rt.onDeath = (summary) => {
    setPaused(true);
    showHud(false);
    showDeath(summary);
  };

  rt.onWin = (summary) => {
    setPaused(true);
    showHud(false);
    showWin(summary);
  };

  rt.onPhaseChange = (kind) => {
    if (kind === 'wave') showHud(true);
  };

  startLoop();
  showMenu();

  // Ladebild weg
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.classList.add('gone');
    setTimeout(() => bootEl.remove(), 450);
  }

  // Beim Wegklicken automatisch pausieren — sonst stirbt man in der Tasche.
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    setAudioSuspended(hidden);
    if (hidden && G.phase === PHASE.PLAYING && !G.paused) requestPause();
  });
  window.addEventListener('blur', () => {
    if (G.phase === PHASE.PLAYING && !G.paused) requestPause();
  });

  // Offline-Cache nur auf dem echten Host. Lokal würde er beim Entwickeln
  // ständig alten Code ausliefern.
  const isLocal = /^(127\.|localhost$|\[::1\]$|192\.168\.)/.test(location.hostname);
  if ('serviceWorker' in navigator && !isLocal && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update())
        .catch(() => { /* offline ist Bonus, kein Muss */ });
    });
  }

  // Für die Konsole, wenn Kiba etwas nachschauen will.
  window.PD = { G, rt, clearSpriteCache };
}

function requestPause() {
  if (G.phase !== PHASE.PLAYING) return;
  if (overlayOpen()) return;
  setPaused(true);
  showHud(false);
  showPause();
}

// Fehler sollen sichtbar sein, nicht still das Spiel einfrieren.
window.addEventListener('error', (e) => {
  console.error('[fehler]', e.error || e.message);
  try { toast('Fehler: ' + (e.message || 'unbekannt')); } catch (_) { /* HUD evtl. noch nicht da */ }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[promise]', e.reason);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
