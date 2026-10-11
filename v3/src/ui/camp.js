// Das Lager zwischen zwei Wellen.
//
// Drei Reiter: Laden (kaufen), Schmiede (verzaubern), Ausrüstung (verwalten).
// Hier liegt die eigentliche Tiefe des Spiels — deshalb ist alles mit einem
// Daumen erreichbar und jede Zahl steht sichtbar auf der Karte.

import { clamp, fmtNum } from '../core/math.js';
import { sfx } from '../core/audio.js';
import { TIER_COLORS, TIER_NAMES, WEAPONS, upgradeOf, CLASSES } from '../data/weapons.js';
import { ENCHANTS, enchCost, enchValue } from '../data/enchants.js';
import { ITEMS, statLine, STAT_LABELS, FLAT_STATS, INVERTED_STATS } from '../data/items.js';
import { armorIcon, artifactIcon, weaponIcon, runeIcon } from '../core/sprites.js';
import {
  G, addWeapon, removeWeapon, addItem, addArtifact, removeArtifact, equipArmor,
  mergeWeapons, spendKnollen, recomputeStats, weaponSlotCount, artifactSlotCount,
  makeWeaponInstance,
} from '../game/state.js';
import { rollShop, rerollCost, ensureSlotOptions } from '../game/loot.js';
import { clearOrbiters } from '../game/combat.js';
import { el, clear, tap, spriteNode, scrollArea, signed, toggle } from './dom.js';
import {
  weaponCard, itemCard, artifactCard, gearCard, priceFoot, enchSlotNode, mergeHint, tierPill,
} from './cards.js';
import { toast } from './hud.js';

let tabId = 'shop';
let forgeTarget = null;      // uid der Waffe/Rüstung in der Schmiede
let onContinue = null;
let root = null;

export function openCamp(overlay, continueFn) {
  onContinue = continueFn;
  root = overlay;
  tabId = 'shop';
  forgeTarget = null;
  if (!G.shop) G.shop = rollShop(G.rng, 4);
  render();
}

function render() {
  if (!root) return;
  clear(root);

  const sheet = el('div.sheet');

  // Kopf
  sheet.appendChild(el('div.sheet-head', null, [
    el('h2.sheet-title', { html: `Lager <span class="accent">— Welle ${G.wave} geschafft</span>` }),
    el('div.sheet-sub', {
      text: `${G.biome.name} · ${G.difficulty.icon} ${G.difficulty.name} · Stufe ${G.level}`,
    }),
  ]));

  // Infozeile
  sheet.appendChild(el('div.camp-info', null, [
    el('div.ci-item', null, [el('span', { text: '🥔' }), el('span', { text: fmtNum(G.knollen), style: { color: 'var(--amber-soft)' } })]),
    el('div.ci-item', null, [el('span', { text: '✦' }), el('span', { text: `${G.enchPoints} Punkte`, style: { color: 'var(--purple)' } })]),
    el('div.ci-item', null, [el('span', { text: '⚔️' }), el('span', { text: `${G.weapons.length}/${weaponSlotCount()}` })]),
    el('div.ci-item', null, [el('span', { text: '❤️' }), el('span', { text: `${Math.ceil(G.player.hp)}/${G.player.maxHp}` })]),
  ]));

  // Reiter
  const tabs = el('div.tabs');
  const mkTab = (id, label, badge) => {
    const t = el(`div.tab${tabId === id ? '.active' : ''}`, null, [
      el('span', { text: label }),
      badge ? el('b', { text: String(badge) }) : null,
    ]);
    tap(t, () => { tabId = id; forgeTarget = null; render(); });
    return t;
  };
  const pendingCount = (G.pendingGear || []).length + (G.pendingItems || []).length + (G.pendingArtifacts || []).length;
  tabs.appendChild(mkTab('shop', '🛒 Laden'));
  tabs.appendChild(mkTab('forge', '✦ Schmiede', G.enchPoints || null));
  tabs.appendChild(mkTab('gear', '🎒 Ausrüstung', pendingCount || null));
  sheet.appendChild(tabs);

  // Inhalt
  let body;
  if (tabId === 'shop') body = renderShop();
  else if (tabId === 'forge') body = renderForge();
  else body = renderGear();
  sheet.appendChild(body);

  // Fuß
  const nextLabel = G.wave + 1 >= G.biome.waves
    ? `☠️ ${G.biome.name}: Boss`
    : `Welle ${G.wave + 1} starten`;
  const go = el('button.btn.btn-primary.btn-lg', { text: nextLabel });
  tap(go, () => {
    if (onContinue) onContinue();
  }, { sound: 'waveStart', haptic: 20 });
  sheet.appendChild(el('div.sheet-foot', null, [go]));

  root.appendChild(sheet);
}

// --- Laden -------------------------------------------------------------

function renderShop() {
  const kids = [];

  // Rasten: Leben kaufen
  const missing = G.player.maxHp - G.player.hp;
  if (missing > 0.5) {
    const healAmount = Math.ceil(G.player.maxHp * 0.25);
    const healCost = Math.max(4, Math.round(Math.min(healAmount, missing) * (0.7 + G.wave * 0.05)));
    const can = G.knollen >= healCost;
    const btn = el('button.btn.btn-sm' + (can ? '.btn-primary' : ''), { text: `🥔 ${healCost}`, disabled: !can });
    tap(btn, () => {
      if (!spendKnollen(healCost)) { toast('Zu wenig Knollen'); return; }
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + healAmount);
      toast(`+${Math.min(healAmount, Math.ceil(missing))} LP`, 'var(--green)');
      render();
    }, { sound: can ? 'heal' : 'error' });
    kids.push(el('div.card', null, [
      el('div.card-head', null, [
        el('div.card-icon', { text: '🍲' }),
        el('div', null, [
          el('div.card-name', { text: 'Rasten' }),
          el('div.card-meta', { text: `Heilt ${healAmount} Lebenspunkte` }),
        ]),
      ]),
      el('div.card-foot', null, [el('div', { style: { flex: '1 1 auto' } }), btn]),
    ]));
  }

  // Angebote
  const grid = el('div.grid.grid-auto');
  let soldAll = true;
  G.shop.forEach((offer, i) => {
    if (!offer.sold) soldAll = false;
    grid.appendChild(offerCard(offer, i));
  });
  kids.push(grid);

  // Neu auslegen
  const cost = rerollCost(G.rerolls);
  const can = G.knollen >= cost;
  const reroll = el('button.btn' + (can ? '' : '.btn-ghost'), {
    text: `🎲 Neu auslegen · 🥔 ${cost}`,
    disabled: !can,
  });
  tap(reroll, () => {
    if (!spendKnollen(cost)) { toast('Zu wenig Knollen'); return; }
    G.rerolls++;
    const locked = G.shop.filter((o) => o.locked && !o.sold);
    const fresh = rollShop(G.rng, 4 - locked.length);
    G.shop = [...locked, ...fresh];
    render();
  }, { sound: can ? 'buy' : 'error' });

  kids.push(el('div', { style: { display: 'flex', gap: '8px' } }, [reroll]));

  if (soldAll) kids.push(el('div.hint', { text: 'Alles weg. Neu auslegen oder weiterziehen.' }));
  kids.push(el('div.hint', {
    text: 'Zwei gleiche Waffen derselben Stufe lassen sich unter „Ausrüstung“ verschmelzen.',
  }));

  return scrollArea(kids);
}

function offerCard(offer, index) {
  const def = offer.def;
  const affordable = G.knollen >= offer.price && !offer.sold;

  const lockBtn = el('button.btn.btn-sm.btn-ghost', { text: offer.locked ? '🔒' : '🔓' });
  tap(lockBtn, () => { offer.locked = !offer.locked; render(); });

  let blockReason = null;
  if (offer.kind === 'weapon' && G.weapons.length >= weaponSlotCount()) {
    const dup = G.weapons.find((w) => w.def.id === def.id);
    if (!dup) blockReason = 'Waffenplätze voll';
  }
  if (offer.kind === 'artifact' && G.artifacts.length >= artifactSlotCount()) {
    blockReason = 'Artefaktplätze voll';
  }

  const buyable = affordable && !blockReason;
  const buy = el('button.btn.btn-sm' + (buyable ? '.btn-primary' : ''), {
    text: offer.sold ? 'Gekauft' : blockReason || 'Kaufen',
    disabled: !buyable,
  });
  tap(buy, () => buyOffer(offer), { sound: buyable ? 'buy' : 'error' });

  const foot = el('div.card-foot', null, [
    el('div.price' + (affordable ? '' : '.cant'), null, [
      el('span', { text: '🥔' }), el('span', { text: String(offer.price) }),
    ]),
    lockBtn,
    buy,
  ]);

  const cls = offer.sold ? 'sold' : offer.locked ? 'locked' : '';
  if (offer.kind === 'weapon') {
    const card = weaponCard(def, { foot, class: cls, maxStats: 4 });
    const dup = G.weapons.find((w) => w.def.id === def.id);
    if (dup && upgradeOf(def)) {
      const hint = mergeHint(def);
      if (hint) card.insertBefore(hint, card.children[1]);
    }
    return card;
  }
  if (offer.kind === 'item') return itemCard(def, { foot, class: cls });
  return artifactCard(def, { foot, class: cls });
}

function buyOffer(offer) {
  if (offer.sold) return;
  if (G.knollen < offer.price) { toast('Zu wenig Knollen'); return; }

  if (offer.kind === 'weapon') {
    if (G.weapons.length >= weaponSlotCount()) {
      const dup = G.weapons.find((w) => w.def.id === offer.def.id);
      if (!dup) { toast('Waffenplätze voll'); return; }
      // Platz ist voll, aber es gibt ein Duplikat: direkt verschmelzen
      const up = upgradeOf(offer.def);
      if (!up) { toast('Waffenplätze voll'); return; }
      spendKnollen(offer.price);
      const inst = addWeaponForce(offer.def);
      mergeWeapons(dup.uid, inst.uid, up);
      clearOrbiters();
      toast(`Verschmolzen → ${up.name}`, TIER_COLORS[up.tier]);
      offer.sold = true;
      recomputeStats();
      render();
      return;
    }
    spendKnollen(offer.price);
    addWeapon(offer.def);
    toast(`${offer.def.name} gekauft`, TIER_COLORS[offer.def.tier]);
  } else if (offer.kind === 'item') {
    spendKnollen(offer.price);
    addItem(offer.def);
    toast(`${offer.def.name} gekauft`, TIER_COLORS[offer.def.tier]);
  } else {
    if (G.artifacts.length >= artifactSlotCount()) { toast('Artefaktplätze voll'); return; }
    spendKnollen(offer.price);
    addArtifact(offer.def);
    toast(`${offer.def.name} gekauft`, offer.def.color);
  }
  offer.sold = true;
  render();
}

/**
 * Waffe anlegen und dabei die Platzgrenze bewusst übergehen. Nur erlaubt,
 * wenn direkt danach verschmolzen wird — sonst stünde man mit einem Platz
 * zu viel da.
 */
function addWeaponForce(def) {
  const inst = makeWeaponInstance(def);
  G.weapons.push(inst);
  recomputeStats();
  return inst;
}

// --- Schmiede ----------------------------------------------------------

function renderForge() {
  const kids = [];

  kids.push(el('div.hint', {
    text: 'Verzauberungspunkte gibt es bei jeder dritten Stufe. Eine gewählte Rune bleibt — überleg dir die erste gut.',
  }));

  // Auswahl: welches Teil verzaubern?
  const targets = [];
  if (G.armor) targets.push({ kind: 'armor', item: G.armor, name: G.armor.name, color: G.armor.color, icon: armorIcon(G.armor.color, 72) });
  for (const w of G.weapons) {
    targets.push({ kind: 'weapon', item: w, name: w.def.name, color: w.def.color, icon: weaponIcon(w.def.art, w.def.color, 72), uid: w.uid });
  }

  if (!targets.length) {
    kids.push(el('div.empty', { text: 'Keine Ausrüstung zum Verzaubern.' }));
    return scrollArea(kids);
  }

  if (forgeTarget == null) forgeTarget = targets[0].kind === 'armor' ? 'armor' : targets[0].uid;

  const row = el('div.pick-row');
  for (const t of targets) {
    const id = t.kind === 'armor' ? 'armor' : t.uid;
    const slots = t.kind === 'armor' ? t.item.slots : t.item.slots;
    const filled = slots.filter((s) => s.chosen).length;
    const node = el(`div.pick${forgeTarget === id ? '.selected' : ''}`, { style: { width: '108px' } }, [
      spriteNode(t.icon, 44),
      el('div.pick-name', { text: t.name, style: { fontSize: '11px' } }),
      el('div.pick-tag', { text: `${filled}/${slots.length} Fassungen` }),
    ]);
    tap(node, () => { forgeTarget = id; render(); });
    row.appendChild(node);
  }
  kids.push(row);

  const target = targets.find((t) => (t.kind === 'armor' ? 'armor' : t.uid) === forgeTarget) || targets[0];
  const item = target.item;
  const kind = target.kind;

  // Kandidaten nachziehen (Waffen bekommen ihre Optionen erst hier)
  ensureSlotOptions(item, kind === 'armor' ? 'armor' : 'weapon');

  const panel = el('div.card', { style: { borderColor: target.color } });
  panel.appendChild(el('div.card-head', null, [
    el('div.card-icon', null, [spriteNode(target.icon, 42)]),
    el('div', null, [
      el('div.card-name', { text: target.name }),
      el('div.card-meta', {
        text: kind === 'armor'
          ? `Rüstung · +${item.armor} Panzerung${item.hp ? `, +${item.hp} LP` : ''}`
          : `${CLASSES[item.def.cls] ? CLASSES[item.def.cls].name : ''} · Schaden ${item.def.dmg}`,
        style: { color: target.color },
      }),
    ]),
  ]));

  const ctx = {
    points: G.enchPoints,
    onChoose(index, enchId) {
      if (G.enchPoints < 1) { toast('Keine Verzauberungspunkte'); sfx('error'); return; }
      const slot = item.slots[index];
      if (slot.chosen) return;
      G.enchPoints -= 1;
      slot.chosen = enchId;
      slot.level = 1;
      recomputeStats();
      toast(`${ENCHANTS[enchId].name} I`, ENCHANTS[enchId].color);
      render();
    },
    onUpgrade(index) {
      const slot = item.slots[index];
      if (!slot.chosen || slot.level >= 3) return;
      const cost = enchCost(slot.level);
      if (G.enchPoints < cost) { toast('Zu wenige Punkte'); sfx('error'); return; }
      G.enchPoints -= cost;
      slot.level++;
      recomputeStats();
      toast(`${ENCHANTS[slot.chosen].name} ${'I'.repeat(slot.level)}`, ENCHANTS[slot.chosen].color);
      render();
    },
  };

  panel.appendChild(el('div.slotrow', null,
    item.slots.map((s, i) => enchSlotNode(s, i, ctx)),
  ));
  kids.push(panel);

  return scrollArea(kids);
}

// --- Ausrüstung --------------------------------------------------------

function renderGear() {
  const kids = [];

  // Liegengebliebene Beute zuerst
  const gearQueue = G.pendingGear || [];
  if (gearQueue.length) {
    kids.push(el('div.card-meta', { text: 'Gefundene Rüstung' }));
    const grid = el('div.grid.grid-auto');
    gearQueue.forEach((gear, i) => {
      const better = !G.armor || gear.armor + gear.hp * 0.5 > G.armor.armor + G.armor.hp * 0.5;
      const equip = el('button.btn.btn-sm' + (better ? '.btn-primary' : ''), { text: 'Anlegen' });
      tap(equip, () => {
        const old = equipArmor(gear);
        gearQueue.splice(i, 1);
        if (old) {
          G.knollen += Math.round((old.armor + old.hp) * 0.6);
          toast(`${old.name} eingeschmolzen`, 'var(--amber-soft)');
        }
        toast(`${gear.name} angelegt`, TIER_COLORS[gear.tier]);
        render();
      }, { sound: 'loot' });
      const drop = el('button.btn.btn-sm.btn-ghost', { text: '🥔' });
      tap(drop, () => {
        G.knollen += Math.round((gear.armor + gear.hp) * 0.6);
        gearQueue.splice(i, 1);
        toast('Eingeschmolzen', 'var(--amber-soft)');
        render();
      }, { sound: 'buy' });
      grid.appendChild(gearCard(gear, {
        foot: el('div.card-foot', null, [el('div', { style: { flex: '1 1 auto' } }), drop, equip]),
      }));
    });
    kids.push(grid);
    kids.push(el('div.divider'));
  }

  const itemQueue = G.pendingItems || [];
  if (itemQueue.length) {
    kids.push(el('div.card-meta', { text: 'Gefundene Gegenstände' }));
    const grid = el('div.grid.grid-auto');
    itemQueue.forEach((def, i) => {
      const take = el('button.btn.btn-sm.btn-primary', { text: 'Nehmen' });
      tap(take, () => {
        addItem(def);
        itemQueue.splice(i, 1);
        toast(`${def.name} erhalten`, TIER_COLORS[def.tier]);
        render();
      }, { sound: 'loot' });
      grid.appendChild(itemCard(def, {
        foot: el('div.card-foot', null, [el('div', { style: { flex: '1 1 auto' } }), take]),
      }));
    });
    kids.push(grid);
    kids.push(el('div.divider'));
  }

  const artQueue = G.pendingArtifacts || [];
  if (artQueue.length) {
    kids.push(el('div.card-meta', { text: 'Gefundene Artefakte — ein Platz muss frei werden' }));
    const grid = el('div.grid.grid-auto');
    artQueue.forEach((def, i) => {
      const can = G.artifacts.length < artifactSlotCount();
      const take = el('button.btn.btn-sm' + (can ? '.btn-primary' : ''), {
        text: can ? 'Nehmen' : 'Plätze voll', disabled: !can,
      });
      tap(take, () => {
        addArtifact(def);
        artQueue.splice(i, 1);
        toast(`${def.name} erhalten`, def.color);
        render();
      }, { sound: 'loot' });
      grid.appendChild(artifactCard(def, {
        foot: el('div.card-foot', null, [el('div', { style: { flex: '1 1 auto' } }), take]),
      }));
    });
    kids.push(grid);
    kids.push(el('div.divider'));
  }

  // Getragene Rüstung
  kids.push(el('div.card-meta', { text: 'Rüstung' }));
  if (G.armor) {
    kids.push(gearCard(G.armor, {}));
  } else {
    kids.push(el('div.empty', { text: 'Keine Rüstung. Gegner und Truhen lassen welche fallen.' }));
  }

  // Waffen
  kids.push(el('div.divider'));
  kids.push(el('div.card-meta', { text: `Waffen ${G.weapons.length}/${weaponSlotCount()}` }));
  const wgrid = el('div.grid.grid-auto');
  for (const w of G.weapons) {
    const up = upgradeOf(w.def);
    const twin = G.weapons.find((o) => o !== w && o.def.id === w.def.id);
    const foot = el('div.card-foot');
    foot.appendChild(el('div', { style: { flex: '1 1 auto' } }));

    if (twin && up) {
      const mb = el('button.btn.btn-sm.btn-primary', { text: '⇧ Verschmelzen' });
      tap(mb, () => {
        mergeWeapons(w.uid, twin.uid, up);
        clearOrbiters();
        toast(`${up.name}!`, TIER_COLORS[up.tier]);
        render();
      }, { sound: 'legendary', haptic: 26 });
      foot.appendChild(mb);
    }
    if (G.weapons.length > 1) {
      const sell = el('button.btn.btn-sm.btn-ghost', { text: `🥔 ${w.def.sell}` });
      tap(sell, () => {
        removeWeapon(w.uid);
        clearOrbiters(w);
        G.knollen += w.def.sell;
        toast(`${w.def.name} verkauft`, 'var(--amber-soft)');
        render();
      }, { sound: 'buy' });
      foot.appendChild(sell);
    }

    const card = weaponCard(w.def, { foot, maxStats: 4 });
    const chosen = w.slots.filter((s) => s.chosen);
    if (chosen.length) {
      card.appendChild(el('div.statlist', null, chosen.map((s) => {
        const e = ENCHANTS[s.chosen];
        return el('div.statline', null, [
          el('span', { text: e ? e.name : s.chosen, style: { color: e ? e.color : null } }),
          el('span', { text: '★'.repeat(s.level) }),
        ]);
      })));
    }
    wgrid.appendChild(card);
  }
  kids.push(wgrid);

  // Artefakte
  kids.push(el('div.divider'));
  kids.push(el('div.card-meta', { text: `Artefakte ${G.artifacts.length}/${artifactSlotCount()}` }));
  if (G.artifacts.length) {
    const agrid = el('div.grid.grid-auto');
    for (const a of G.artifacts) {
      const foot = el('div.card-foot', null, [el('div', { style: { flex: '1 1 auto' } })]);
      const drop = el('button.btn.btn-sm.btn-ghost', { text: 'Ablegen' });
      tap(drop, () => {
        removeArtifact(a.uid);
        toast(`${a.def.name} abgelegt`);
        render();
      }, { sound: 'uiBack' });
      foot.appendChild(drop);
      agrid.appendChild(artifactCard(a.def, { foot }));
    }
    kids.push(agrid);
  } else {
    kids.push(el('div.empty', { text: 'Keine Artefakte.' }));
  }

  // Gegenstände
  if (G.items.length) {
    kids.push(el('div.divider'));
    kids.push(el('div.card-meta', { text: 'Gegenstände' }));
    const list = el('div.grid.grid-auto');
    for (const it of G.items) {
      list.appendChild(el(`div.card.tier${it.def.tier}`, null, [
        el('div.card-head', null, [
          el('div.card-icon', { text: it.def.icon }),
          el('div', null, [
            el('div.card-name', { text: it.def.name + (it.count > 1 ? ` ×${it.count}` : '') }),
            el('div.card-meta', { text: TIER_NAMES[it.def.tier], style: { color: TIER_COLORS[it.def.tier] } }),
          ]),
        ]),
      ]));
    }
    kids.push(list);
  }

  // Werteübersicht
  kids.push(el('div.divider'));
  kids.push(el('div.card-meta', { text: 'Deine Werte' }));
  kids.push(statGrid());

  return scrollArea(kids);
}

export function statGrid() {
  const s = G.stats;
  const show = [
    ['maxHp', s.maxHp], ['armor', s.armor], ['hpRegen', s.hpRegen], ['lifesteal', s.lifesteal],
    ['dodge', s.dodge], ['speed', s.speed], ['dmgAll', s.dmgAll], ['dmgMelee', s.dmgMelee],
    ['dmgRanged', s.dmgRanged], ['dmgElem', s.dmgElem], ['attackSpeed', s.attackSpeed],
    ['crit', s.crit], ['critDmg', s.critDmg], ['range', s.range], ['luck', s.luck],
    ['harvesting', s.harvesting], ['engineering', s.engineering], ['thorns', s.thorns],
  ];
  return el('div.statgrid', null, show.filter(([, v]) => v !== 0).map(([k, v]) => {
    const flat = FLAT_STATS.has(k);
    const text = flat ? String(Math.round(v * 10) / 10) : `${Math.round(v * 100)}%`;
    const good = INVERTED_STATS.has(k) ? v < 0 : v > 0;
    return el('div.sg', null, [
      el('span', { text: STAT_LABELS[k] || k }),
      el('span', { text: (flat ? '' : v > 0 ? '+' : '') + text, style: { color: good ? 'var(--green)' : 'var(--red)' } }),
    ]);
  }));
}
