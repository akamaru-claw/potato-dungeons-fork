// Das HUD läuft über DOM, nicht über Canvas: Text bleibt scharf, und der
// Browser zeichnet nur neu, was sich geändert hat.

import { clamp, fmtTime, fmtNum } from '../core/math.js';
import { CLASSES, TIER_COLORS } from '../data/weapons.js';
import { weaponIcon as wIcon } from '../core/sprites.js';
import { G, PHASE, artifactSlotCount } from '../game/state.js';
import { $, el, clear, setText, setWidth, toggle, spriteNode } from './dom.js';

let refs = null;
let lastHp = -1, hpGhostT = 0;
let lastKnollen = 0;
let weaponNodes = [];
let weaponSig = '';
let classSig = '';
let buffSig = '';

export function initHud() {
  refs = {
    root: $('#hud'),
    hpFill: $('#hp-fill'),
    hpGhost: $('#hp-ghost'),
    hpText: $('#hp-text'),
    hpBar: $('#hp-fill').parentElement,
    xpFill: $('#xp-fill'),
    xpText: $('#xp-text'),
    classbar: $('#classbar'),
    waveNum: $('#wave-num'),
    waveTimer: $('#wave-timer'),
    waveProgress: $('#wave-progress-fill'),
    knollen: $('#knollen'),
    knollenNum: $('#knollen-num'),
    enchPoints: $('#ench-points'),
    enchNum: $('#ench-num'),
    bossBar: $('#boss-bar'),
    bossName: $('#boss-name'),
    bossFill: $('#boss-fill'),
    bossPhases: $('#boss-phases'),
    buffrow: $('#buffrow'),
    weaponrow: $('#weaponrow'),
    toasts: $('#toasts'),
    pause: $('#btn-pause'),
  };
  return refs;
}

export function showHud(on) {
  if (refs) toggle(refs.root, on);
}

export function onPauseButton(fn) {
  if (refs && refs.pause) {
    refs.pause.addEventListener('pointerup', (e) => { e.preventDefault(); fn(); });
    refs.pause.addEventListener('click', (e) => e.preventDefault());
  }
}

export function updateHud(dt) {
  if (!refs || refs.root.hidden) return;
  const p = G.player;
  if (!p) return;

  // --- Leben ---
  const frac = clamp(p.hp / Math.max(1, p.maxHp), 0, 1);
  setWidth(refs.hpFill, frac * 100);
  setText(refs.hpText, `${Math.ceil(p.hp)} / ${p.maxHp}`);
  refs.hpBar.classList.toggle('low', frac < 0.3);

  // Geisterbalken: zeigt kurz den verlorenen Anteil
  if (lastHp < 0) lastHp = p.hp;
  if (p.hp < lastHp - 0.01) {
    setWidth(refs.hpGhost, clamp(lastHp / Math.max(1, p.maxHp), 0, 1) * 100);
    hpGhostT = 0.6;
  }
  if (hpGhostT > 0) {
    hpGhostT -= dt;
    if (hpGhostT <= 0) setWidth(refs.hpGhost, frac * 100);
  } else {
    lastHp = p.hp;
    setWidth(refs.hpGhost, frac * 100);
  }
  if (p.hp > lastHp) lastHp = p.hp;

  // --- Erfahrung ---
  setWidth(refs.xpFill, clamp(G.xp / Math.max(1, G.xpNext), 0, 1) * 100);
  setText(refs.xpText, `Stufe ${G.level}`);

  // --- Welle ---
  setText(refs.waveNum, G.isBossWave ? 'BOSS' : `Welle ${G.wave} / ${G.biome.waves}`);
  if (G.isBossWave) {
    setText(refs.waveTimer, G.bossRef ? `${Math.ceil(G.bossRef.hp)}` : '—');
    setWidth(refs.waveProgress, 100);
    refs.waveTimer.classList.remove('urgent');
  } else {
    setText(refs.waveTimer, fmtTime(Math.ceil(G.waveTime)));
    setWidth(refs.waveProgress, (1 - clamp(G.waveTime / Math.max(1, G.waveDuration), 0, 1)) * 100);
    refs.waveTimer.classList.toggle('urgent', G.waveTime <= 5 && G.waveActive);
  }

  // --- Knollen ---
  const k = Math.floor(G.knollen);
  if (k !== lastKnollen) {
    setText(refs.knollenNum, fmtNum(k));
    if (k > lastKnollen) {
      refs.knollen.classList.remove('bump');
      void refs.knollen.offsetWidth;
      refs.knollen.classList.add('bump');
    }
    lastKnollen = k;
  }

  toggle(refs.enchPoints, G.enchPoints > 0);
  if (G.enchPoints > 0) setText(refs.enchNum, String(G.enchPoints));

  // --- Boss ---
  const boss = G.bossRef;
  if (boss && boss.alive) {
    toggle(refs.bossBar, true);
    setText(refs.bossName, boss.name);
    setWidth(refs.bossFill, clamp(boss.hp / boss.maxHp, 0, 1) * 100);
    if (refs.bossPhases.childElementCount === 0 && boss.bossDef) {
      for (const ph of boss.bossDef.phases) {
        if (ph.at >= 1) continue;
        refs.bossPhases.appendChild(el('i', { style: { left: `${ph.at * 100}%` } }));
      }
    }
  } else {
    toggle(refs.bossBar, false);
    if (refs.bossPhases.childElementCount) clear(refs.bossPhases);
  }

  updateClassBar();
  updateWeaponRow();
  updateBuffs();
}

function updateClassBar() {
  const sig = Object.keys(G.classCounts).map((c) => `${c}${G.classCounts[c]}`).join(',');
  if (sig === classSig) return;
  classSig = sig;
  clear(refs.classbar);
  for (const info of G.classSteps) {
    const def = CLASSES[info.cls];
    if (!def) continue;
    const next = def.steps.find((s) => info.count < s.at);
    refs.classbar.appendChild(el('div.class-chip', {
      style: { color: def.color },
      class: info.step ? 'active' : '',
      title: info.step ? info.step.text : `Noch ${next ? next.at - info.count : 0} für den Bonus`,
    }, [
      el('span', { text: def.icon }),
      el('span.cc-n', { text: next ? `${info.count}/${next.at}` : `${info.count}` }),
    ]));
  }
}

function updateWeaponRow() {
  const sig = G.weapons.map((w) => w.uid + ':' + w.def.id).join('|');
  if (sig !== weaponSig) {
    weaponSig = sig;
    clear(refs.weaponrow);
    weaponNodes = [];
    for (const w of G.weapons) {
      const slot = el('div.wslot', { style: { borderColor: TIER_COLORS[w.def.tier] } });
      slot.appendChild(spriteNode(wIcon(w.def.art, w.def.color, 72)));
      const cd = el('div.wcd');
      slot.appendChild(cd);
      if (w.def.tier > 0) {
        slot.appendChild(el('span.wtier', {
          text: '★'.repeat(w.def.tier),
          style: { color: TIER_COLORS[w.def.tier] },
        }));
      }
      refs.weaponrow.appendChild(slot);
      weaponNodes.push({ w, slot, cd, lastFire: w.shots });
    }
  }

  for (const n of weaponNodes) {
    const frac = n.w.def.cd > 0 ? clamp(n.w.cd / n.w.def.cd, 0, 1) : 0;
    const h = `${(frac * 100).toFixed(0)}%`;
    if (n.cd.style.height !== h) n.cd.style.height = h;
    if (n.w.shots !== n.lastFire) {
      n.lastFire = n.w.shots;
      n.slot.classList.remove('fire');
      void n.slot.offsetWidth;
      n.slot.classList.add('fire');
    }
  }
}

const BUFF_ICONS = {
  rage: ['😡', '#ff6b4a'],
  frenzy: ['⚡', '#ffd93d'],
  hast: ['💨', '#9ef0ff'],
  invis: ['👻', '#b06ef0'],
  burning: ['🔥', '#ff8a3d'],
  poisoned: ['☠️', '#8fd14f'],
  chill: ['❄️', '#9ef0ff'],
};

function updateBuffs() {
  const b = G.player.buffs;
  const keys = Object.keys(b).filter((k) => BUFF_ICONS[k]);
  const sig = keys.join(',');
  if (sig !== buffSig) {
    buffSig = sig;
    clear(refs.buffrow);
    for (const k of keys) {
      const [icon, color] = BUFF_ICONS[k];
      refs.buffrow.appendChild(el('div.buff', { style: { color }, dataset: { buff: k } }, [
        el('span', { text: icon }),
        el('b', { text: '' }),
      ]));
    }
  }
  for (const node of refs.buffrow.children) {
    const buff = b[node.dataset.buff];
    if (buff) setText(node.lastChild, String(Math.ceil(buff.t)));
  }
}

// --- Hinweise ---------------------------------------------------------

export function toast(text, color = null) {
  if (!refs) return;
  const node = el('div.toast', { text, style: color ? { borderColor: color, color } : null });
  refs.toasts.appendChild(node);
  setTimeout(() => node.remove(), 2500);
  // Nie mehr als vier gleichzeitig — sonst verdeckt es das Spiel.
  while (refs.toasts.childElementCount > 4) refs.toasts.firstChild.remove();
}

export function resetHudCaches() {
  lastHp = -1;
  lastKnollen = -1;
  weaponSig = '';
  classSig = '';
  buffSig = '';
  if (refs) {
    clear(refs.weaponrow);
    clear(refs.classbar);
    clear(refs.buffrow);
    clear(refs.bossPhases);
  }
  weaponNodes = [];
}
