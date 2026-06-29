// ============================================================
// UTILS.JS — Vector math, collision, helpers
// ============================================================

// Polyfill for roundRect (older browsers)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
    const radius = Math.min(r, w / 2, h / 2);
    this.moveTo(x + radius, y);
    this.lineTo(x + w - radius, y);
    this.quadraticCurveTo(x + w, y, x + w, y + radius);
    this.lineTo(x + w, y + h - radius);
    this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this.lineTo(x + radius, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();
    return this;
  };
}

const Utils = {
  // --- Vector Math ---
  vecAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
  vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
  vecScale(v, s) { return { x: v.x * s, y: v.y * s }; },
  vecLength(v) { return Math.sqrt(v.x * v.x + v.y * v.y); },
  vecNormalize(v) {
    const len = Utils.vecLength(v);
    return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
  },
  vecDist(a, b) { return Utils.vecLength(Utils.vecSub(a, b)); },
  vecLerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; },
  vecAngle(v) { return Math.atan2(v.y, v.x); },
  vecFromAngle(angle, length = 1) { return { x: Math.cos(angle) * length, y: Math.sin(angle) * length }; },
  vecDot(a, b) { return a.x * b.x + a.y * b.y; },
  vecRotate(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  },

  // --- Collision ---
  circleCollision(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const dist = dx * dx + dy * dy;
    const radii = (a.radius || a.size || 10) + (b.radius || b.size || 10);
    return dist < radii * radii;
  },
  circleCollisionDist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },
  pointInArc(point, origin, angle, arc, range) {
    const dist = Utils.vecDist(point, origin);
    if (dist > range) return false;
    const toPoint = Math.atan2(point.y - origin.y, point.x - origin.x);
    let diff = toPoint - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= arc / 2;
  },

  // --- Random ---
  rand(min, max) { return Math.random() * (max - min) + min; },
  randInt(min, max) { return Math.floor(Utils.rand(min, max + 1)); },
  randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  randSign() { return Math.random() < 0.5 ? -1 : 1; },
  chance(pct) { return Math.random() * 100 < pct; },
  weightedRandom(items, weightFn) {
    const totalWeight = items.reduce((sum, item) => sum + weightFn(item), 0);
    let r = Math.random() * totalWeight;
    for (const item of items) {
      r -= weightFn(item);
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  },
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // --- Easing ---
  easeOutQuad(t) { return t * (2 - t); },
  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
  easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  easeOutElastic(t) {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  },
  easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },

  // --- Color ---
  hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  },
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
  },
  colorWithAlpha(hex, alpha) {
    const { r, g, b } = Utils.hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  },
  lerpColor(hex1, hex2, t) {
    const c1 = Utils.hexToRgb(hex1), c2 = Utils.hexToRgb(hex2);
    return Utils.rgbToHex(
      c1.r + (c2.r - c1.r) * t,
      c1.g + (c2.g - c1.g) * t,
      c1.b + (c2.b - c1.b) * t
    );
  },

  // --- Math ---
  clamp(val, min, max) { return Math.max(min, Math.min(max, val)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  formatNumber(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString(); },

  // --- Safe localStorage (private/incognito modes can throw on access) ---
  storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  },

  // --- Spatial Hash Grid ---
  createSpatialGrid(cellSize) {
    return { cellSize, cells: new Map(), clear() { this.cells.clear(); },
      _key(cx, cy) { return cx + ',' + cy; },
      insert(entity) {
        const cx = Math.floor(entity.x / this.cellSize);
        const cy = Math.floor(entity.y / this.cellSize);
        const key = this._key(cx, cy);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(entity);
      },
      query(x, y, radius) {
        const results = [];
        const minCx = Math.floor((x - radius) / this.cellSize);
        const maxCx = Math.floor((x + radius) / this.cellSize);
        const minCy = Math.floor((y - radius) / this.cellSize);
        const maxCy = Math.floor((y + radius) / this.cellSize);
        for (let cx = minCx; cx <= maxCx; cx++) {
          for (let cy = minCy; cy <= maxCy; cy++) {
            const cell = this.cells.get(this._key(cx, cy));
            if (cell) results.push(...cell);
          }
        }
        return results;
      }
    };
  }
};
