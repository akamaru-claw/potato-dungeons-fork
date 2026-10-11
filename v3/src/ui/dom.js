// Kleine DOM-Helfer. Kein Framework — bei dieser Menge an Oberfläche wäre
// das nur Ballast, und jedes Byte zählt auf Mobilfunk.

import { sfx, unlockAudio } from '../core/audio.js';
import { buzz } from '../core/audio.js';

/**
 * el('div.card.tier2', {text:'Hallo'}, [kind1, kind2])
 * Tag darf Klassen per Punkt enthalten.
 */
export function el(spec, props = null, children = null) {
  const parts = String(spec).split('.');
  const node = document.createElement(parts[0] || 'div');
  for (let i = 1; i < parts.length; i++) if (parts[i]) node.classList.add(parts[i]);

  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'onClick') tap(node, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'disabled' || k === 'hidden' || k === 'checked') node[k] = !!v;
      else node.setAttribute(k, v);
    }
  }

  if (children) {
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  return node;
}

/**
 * Tap-Handler, der auf Touch sofort reagiert. `click` hat auf manchen
 * Android-Browsern bis zu 300 ms Verzögerung — bei einem Spiel merkt man das.
 */
export function tap(node, fn, { sound = 'ui', haptic = 8 } = {}) {
  let handled = false;
  const fire = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (node.hasAttribute('disabled') || node.classList.contains('is-disabled')) return;
    unlockAudio();
    if (sound) sfx(sound);
    if (haptic) buzz(haptic);
    fn(ev);
  };
  node.addEventListener('pointerup', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    handled = true;
    fire(ev);
    setTimeout(() => { handled = false; }, 350);
  });
  node.addEventListener('click', (ev) => {
    if (handled) { ev.preventDefault(); return; }
    fire(ev);
  });
  return node;
}

export const $ = (sel) => document.querySelector(sel);
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

export function setWidth(node, pct) {
  if (!node) return;
  const v = `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
  if (node.style.width !== v) node.style.width = v;
}

export function toggle(node, on) {
  if (!node) return;
  if (node.hidden === !on) return;
  node.hidden = !on;
}

/** Bild-Element aus einem Canvas-Sprite. */
export function spriteImg(canvas, cls = '') {
  const img = el('img', { src: canvas.toDataURL(), alt: '' });
  if (cls) img.className = cls;
  return img;
}

/** Canvas direkt einhängen — schneller als toDataURL bei vielen Icons. */
export function spriteNode(canvas, size) {
  const c = el('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  if (size) { c.style.width = size + 'px'; c.style.height = (size * canvas.height / canvas.width) + 'px'; }
  else { c.style.width = '100%'; c.style.height = 'auto'; }
  c.style.display = 'block';
  c.style.imageRendering = 'auto';
  return c;
}

/** Scrollbare Fläche so bauen, dass sie nicht am Spielfeld hängen bleibt. */
export function scrollArea(children) {
  const node = el('div.sheet-body', null, children);
  node.addEventListener('pointerdown', (e) => e.stopPropagation());
  node.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
  return node;
}

/** Zahl hübsch mit Vorzeichen. */
export const signed = (n, suffix = '') =>
  (n > 0 ? '+' : '') + (Number.isInteger(n) ? n : Math.round(n * 10) / 10) + suffix;
