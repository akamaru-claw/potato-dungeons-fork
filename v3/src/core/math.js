// Mathe-Grundlagen. Alles hier ist hot-path, deshalb keine Objekt-Allokation.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

/** Kürzester Weg zwischen zwei Winkeln, Ergebnis in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;

/** Winkel a Richtung b drehen, maximal `max` Radiant. */
export function angleTowards(a, b, max) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= max ? b : a + sign(d) * max;
}

/** Frame-unabhängiges Annähern: t ist "Anteil pro Sekunde". */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// --- Kollision ---------------------------------------------------------

export const circleHit = (ax, ay, ar, bx, by, br) => {
  const r = ar + br;
  return dist2(ax, ay, bx, by) < r * r;
};

/** Kreis gegen achsenparalleles Rechteck (x,y = Mitte). */
export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const hw = rw * 0.5, hh = rh * 0.5;
  const nx = clamp(cx, rx - hw, rx + hw);
  const ny = clamp(cy, ry - hh, ry + hh);
  return dist2(cx, cy, nx, ny) < cr * cr;
}

/** Schiebt einen Kreis aus einem Rechteck heraus. Mutiert `out`. */
export function resolveCircleRect(cx, cy, cr, rx, ry, rw, rh, out) {
  const hw = rw * 0.5, hh = rh * 0.5;
  const nx = clamp(cx, rx - hw, rx + hw);
  const ny = clamp(cy, ry - hh, ry + hh);
  let dx = cx - nx, dy = cy - ny;
  let d2 = dx * dx + dy * dy;

  if (d2 > cr * cr) { out.x = cx; out.y = cy; out.hit = false; return out; }
  out.hit = true;

  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    out.x = nx + (dx / d) * cr;
    out.y = ny + (dy / d) * cr;
    return out;
  }
  // Mittelpunkt steckt im Rechteck: auf die nächste Kante schieben.
  const left = cx - (rx - hw), right = (rx + hw) - cx;
  const top = cy - (ry - hh), bottom = (ry + hh) - cy;
  const m = Math.min(left, right, top, bottom);
  out.x = cx; out.y = cy;
  if (m === left) out.x = rx - hw - cr;
  else if (m === right) out.x = rx + hw + cr;
  else if (m === top) out.y = ry - hh - cr;
  else out.y = ry + hh + cr;
  return out;
}

/** Punkt-zu-Segment-Abstand im Quadrat — für Strahl/Klingen-Treffer. */
export function pointSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return dist2(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist2(px, py, ax + dx * t, ay + dy * t);
}

/** Liegt ein Punkt im Kreissektor (Schwung-Angriff)? */
export function inArc(px, py, cx, cy, radius, facing, halfWidth) {
  if (dist2(px, py, cx, cy) > radius * radius) return false;
  return Math.abs(angleDiff(facing, angleTo(cx, cy, px, py))) <= halfWidth;
}

// --- Easing ------------------------------------------------------------

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
export const easeOutElastic = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
export const pingPong = (t) => 1 - Math.abs((t % 2) - 1);

// --- Formatierung ------------------------------------------------------

export function fmtNum(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(n < 1e5 ? 1 : 0) + 'k';
  return String(n);
}

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const fmtSigned = (n, suffix = '') =>
  (n > 0 ? '+' : '') + (Number.isInteger(n) ? n : n.toFixed(1)) + suffix;
