// ============================================================
// FLOATINGTEXT.JS — Floating damage/XP/heal numbers
// ============================================================
const FloatingText = {
  texts: [],

  add(x, y, text, color, size, duration) {
    if (this.texts.length > CONFIG.VISUAL.MAX_FLOATING_TEXTS) this.texts.shift();
    this.texts.push({
      x, y, text: String(text), color: color || '#fff',
      size: size || 16, life: 0, maxLife: duration || 0.9,
      vy: -CONFIG.VISUAL.DAMAGE_NUMBER_SPEED
    });
  },

  update(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      t.y += t.vy * dt;
      t.vy *= 0.96;
      if (t.life >= t.maxLife) this.texts.splice(i, 1);
    }
  },

  render(ctx, camera) {
    const zoom = camera.zoom || 1;
    const W = (ctx.canvas._cssWidth || ctx.canvas.width);
    for (const t of this.texts) {
      const alpha = 1 - t.life / t.maxLife;
      const sx = (t.x - camera.x) * zoom + W / 2;
      const sy = (t.y - camera.y) * zoom + (ctx.canvas._cssHeight || ctx.canvas.height) / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${t.size * zoom}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, sx + 1, sy + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx, sy);
      ctx.restore();
    }
  },

  clear() { this.texts.length = 0; }
};