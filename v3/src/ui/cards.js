// Karten-Darstellung für Waffen, Gegenstände, Artefakte und Rüstung.
// Wird vom Lager, vom Pausenmenü und von der Beute-Anzeige benutzt.

import { TIER_COLORS, TIER_NAMES, CLASSES, weaponStatLines, upgradeOf } from '../data/weapons.js';
import { itemStatLines, statLine } from '../data/items.js';
import { ENCHANTS, enchDesc, enchValue } from '../data/enchants.js';
import { weaponIcon, artifactIcon, armorIcon, runeIcon } from '../core/sprites.js';
import { el, spriteNode, tap, signed } from './dom.js';

export function tierPill(tier) {
  return el('span.pill', {
    text: TIER_NAMES[tier],
    style: { color: TIER_COLORS[tier], background: 'rgba(255,255,255,.06)' },
  });
}

/** Waffenkarte. `mode` steuert die Fußzeile. */
export function weaponCard(def, opts = {}) {
  const cls = CLASSES[def.cls];
  const card = el(`div.card.tier${def.tier}`, { class: opts.class || '' });

  card.appendChild(el('div.card-head', null, [
    el('div.card-icon', null, [spriteNode(weaponIcon(def.art, def.color, 72), 42)]),
    el('div', { style: { minWidth: 0 } }, [
      el('div.card-name', { text: def.name }),
      el('div.card-meta', {
        text: `${cls ? cls.name : ''} · ${TIER_NAMES[def.tier]}`,
        style: { color: TIER_COLORS[def.tier] },
      }),
    ]),
  ]));

  if (opts.desc !== false) card.appendChild(el('div.card-desc', { text: def.desc }));

  if (opts.stats !== false) {
    const lines = weaponStatLines(def).slice(0, opts.maxStats || 5);
    card.appendChild(el('div.statlist', null, lines.map(([k, v]) =>
      el('div.statline', null, [el('span', { text: k }), el('span', { text: v })]),
    )));
  }

  if (opts.foot) card.appendChild(opts.foot);
  if (opts.onClick) { card.classList.add('selectable'); tap(card, opts.onClick); }
  return card;
}

export function itemCard(def, opts = {}) {
  const card = el(`div.card.tier${def.tier}`, { class: opts.class || '' });
  card.appendChild(el('div.card-head', null, [
    el('div.card-icon', { text: def.icon }),
    el('div', { style: { minWidth: 0 } }, [
      el('div.card-name', { text: def.name }),
      el('div.card-meta', { text: TIER_NAMES[def.tier], style: { color: TIER_COLORS[def.tier] } }),
    ]),
  ]));
  card.appendChild(el('div.statlist', null, itemStatLines(def).map((l) =>
    el('div.statline', null, [
      el('span', { text: l.label }),
      el('span', { text: l.text, class: l.good ? 'good' : 'bad' }),
    ]),
  )));
  if (opts.desc !== false && def.desc) card.appendChild(el('div.card-flavor', { text: def.desc }));
  if (opts.foot) card.appendChild(opts.foot);
  if (opts.onClick) { card.classList.add('selectable'); tap(card, opts.onClick); }
  return card;
}

export function artifactCard(def, opts = {}) {
  const card = el(`div.card.tier${Math.min(3, def.tier + 1)}`, { class: opts.class || '' });
  card.appendChild(el('div.card-head', null, [
    el('div.card-icon', null, [spriteNode(artifactIcon(def.glyph, def.color, 80), 42)]),
    el('div', { style: { minWidth: 0 } }, [
      el('div.card-name', { text: def.name }),
      el('div.card-meta', { text: `Artefakt · ${def.cd}s`, style: { color: def.color } }),
    ]),
  ]));
  card.appendChild(el('div.card-desc', { text: def.desc }));
  if (opts.foot) card.appendChild(opts.foot);
  if (opts.onClick) { card.classList.add('selectable'); tap(card, opts.onClick); }
  return card;
}

export function gearCard(gear, opts = {}) {
  const card = el(`div.card.tier${gear.tier}`, { class: opts.class || '' });
  card.appendChild(el('div.card-head', null, [
    el('div.card-icon', null, [spriteNode(armorIcon(gear.color, 72), 42)]),
    el('div', { style: { minWidth: 0 } }, [
      el('div.card-name', { text: gear.name }),
      el('div.card-meta', {
        text: gear.unique ? 'Einzigartig' : TIER_NAMES[gear.tier],
        style: { color: TIER_COLORS[gear.tier] },
      }),
    ]),
  ]));

  const lines = [statLine('armor', gear.armor)];
  if (gear.hp) lines.push(statLine('maxHp', gear.hp));
  card.appendChild(el('div.statlist', null, lines.map((l) =>
    el('div.statline', null, [
      el('span', { text: l.label }),
      el('span', { text: l.text, class: 'good' }),
    ]),
  )));

  // Verzauberungen kurz anreißen
  const chosen = gear.slots.filter((s) => s.chosen);
  if (chosen.length) {
    card.appendChild(el('div.statlist', null, chosen.map((s) => {
      const e = ENCHANTS[s.chosen];
      return el('div.statline', null, [
        el('span', { text: e ? e.name : s.chosen, style: { color: e ? e.color : null } }),
        el('span', { text: '★'.repeat(s.level) }),
      ]);
    })));
  }
  const empty = gear.slots.length - chosen.length;
  if (empty > 0) {
    card.appendChild(el('div.card-meta', { text: `${empty} freie Fassung${empty > 1 ? 'en' : ''}` }));
  }
  if (gear.flavor) card.appendChild(el('div.card-flavor', { text: gear.flavor }));

  if (opts.foot) card.appendChild(opts.foot);
  if (opts.onClick) { card.classList.add('selectable'); tap(card, opts.onClick); }
  return card;
}

/** Preisfuß für Shop-Karten. */
export function priceFoot(price, affordable, label, onBuy) {
  const btn = el('button.btn.btn-sm' + (affordable ? '.btn-primary' : ''), {
    text: label || 'Kaufen',
    disabled: !affordable,
  });
  if (onBuy) tap(btn, onBuy, { sound: affordable ? 'buy' : 'error' });
  return el('div.card-foot', null, [
    el('div.price' + (affordable ? '' : '.cant'), null, [
      el('span', { text: '🥔' }),
      el('span', { text: String(price) }),
    ]),
    btn,
  ]);
}

/** Eine Verzauberungs-Fassung: Auswahl oder Steigerung. */
export function enchSlotNode(slot, index, ctx) {
  const node = el('div.ench-slot' + (slot.chosen ? '.filled' : ''));

  if (!slot.chosen) {
    node.appendChild(el('div.card-meta', { text: `Fassung ${index + 1} — eine Rune wählen` }));
    node.appendChild(el('div.ench-opts', null, (slot.options || []).map((id) => {
      const e = ENCHANTS[id];
      if (!e) return null;
      const opt = el('div.ench-opt', { style: { borderColor: e.color } }, [
        spriteNode(runeIcon(id, e.color, 56), 26),
        el('div.eo-name', { text: e.name, style: { color: e.color } }),
        el('div.eo-desc', { text: enchDesc(id, 1) }),
      ]);
      tap(opt, () => ctx.onChoose(index, id), { sound: 'enchant' });
      return opt;
    })));
    return node;
  }

  const e = ENCHANTS[slot.chosen];
  const canUpgrade = slot.level < 3 && !slot.fixedMax;
  const cost = [1, 2, 3][Math.min(2, slot.level)];
  const affordable = ctx.points >= cost;

  node.style.borderColor = e.color;
  node.appendChild(el('div.ench-chosen', null, [
    spriteNode(runeIcon(slot.chosen, e.color, 56), 30),
    el('div.ec-body', null, [
      el('div.ec-name', { text: e.name, style: { color: e.color } }),
      el('div.ec-desc', { text: enchDesc(slot.chosen, slot.level) }),
      el('div.pips', { style: { color: e.color } }, [0, 1, 2].map((i) =>
        el('span.pip' + (i < slot.level ? '.on' : '')),
      )),
    ]),
    canUpgrade
      ? tap(el('button.btn.btn-sm' + (affordable ? '.btn-primary' : ''), {
        text: `✦ ${cost}`,
        disabled: !affordable,
      }), () => ctx.onUpgrade(index), { sound: affordable ? 'enchant' : 'error' })
      : el('span.pill', { text: slot.level >= 3 ? 'Max' : '—' }),
  ]));
  return node;
}

/** Zeigt, was eine Verschmelzung bringen würde. */
export function mergeHint(def) {
  const up = upgradeOf(def);
  if (!up) return null;
  return el('div.card-meta', {
    text: `Verschmelzen → ${up.name}`,
    style: { color: TIER_COLORS[up.tier] },
  });
}
