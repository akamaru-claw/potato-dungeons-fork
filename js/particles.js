// ============================================================
// PARTICLES.JS — Particle system with object pooling — PREMIUM
// ============================================================
const ParticleSystem = {
  particles: [],
  pool: [],

  _create() {
    return { x:0, y:0, vx:0, vy:0, life:0, maxLife:0, size:0, sizeEnd:0, color:'#fff', alpha:1, alphaEnd:0, gravity:0, friction:1, rotation:0, rotationSpeed:0, active:false, type:'circle', glow:false };
  },

  _get() {
    if (this.pool.length > 0) return this.pool.pop();
    return this._create();
  },

  emit(x, y, options = {}) {
    const count = options.count || 1;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= CONFIG.VISUAL.MAX_PARTICLES) break;
      const p = this._get();
      const angle = options.angle !== undefined ? options.angle + Utils.rand(-options.spread || 0, options.spread || 0) : Utils.rand(0, Math.PI * 2);
      const speed = Utils.rand(options.speedMin || 50, options.speedMax || 150);
      p.x = x + Utils.rand(-(options.offsetX || 0), options.offsetX || 0);
      p.y = y + Utils.rand(-(options.offsetY || 0), options.offsetY || 0);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0;
      p.maxLife = Utils.rand(options.lifeMin || 0.3, options.lifeMax || 0.6);
      p.size = options.size || Utils.rand(2, 5);
      p.sizeEnd = options.sizeEnd !== undefined ? options.sizeEnd : 0;
      p.color = options.color || '#fff';
      p.alpha = options.alpha || 1;
      p.alphaEnd = options.alphaEnd !== undefined ? options.alphaEnd : 0;
      p.gravity = options.gravity || 0;
      p.friction = options.friction || 0.98;
      p.rotation = Utils.rand(0, Math.PI * 2);
      p.rotationSpeed = Utils.rand(-5, 5);
      p.type = options.type || 'circle';
      p.glow = options.glow || false;
      p.active = true;
      this.particles.push(p);
    }
  },

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.pool.push(p);
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
    }
  },

  render(ctx, camera) {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const alpha = Utils.lerp(p.alpha, p.alphaEnd, t);
      const size = Utils.lerp(p.size, p.sizeEnd, t);
      if (alpha <= 0 || size <= 0) continue;
      const zoom = camera.zoom || 1; const sx = (p.x - camera.x) * zoom + (ctx.canvas._cssWidth || ctx.canvas.width) / 2;
      const sy = (p.y - camera.y) * zoom + (ctx.canvas._cssHeight || ctx.canvas.height) / 2;

      ctx.globalAlpha = alpha;

      // Glow effect for bright particles
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = size * 3;
      }

      ctx.fillStyle = p.color;

      if (p.type === 'spark') {
        // Elongated spark based on velocity
        ctx.save();
        ctx.translate(sx, sy);
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        const len = Math.max(size * 2, speed * 0.02);
        ctx.beginPath();
        ctx.ellipse(0, 0, len, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'ring') {
        // Expanding ring
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size * (1 - t);
        ctx.beginPath();
        ctx.arc(sx, sy, size * 4 * t, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'star') {
        // Rotating star shape
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a = (j * Math.PI * 2 / 5) - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
          const a2 = a + Math.PI / 5;
          ctx.lineTo(Math.cos(a2) * size * 0.4, Math.sin(a2) * size * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // Circle (default)
        ctx.beginPath();
        ctx.arc(sx, sy, size * zoom, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  },

  clear() {
    this.pool.push(...this.particles);
    this.particles.length = 0;
  },

  // --- Preset effects — upgraded ---
  explosion(x, y, color, count = 15) {
    this.emit(x, y, { count, color, speedMin: 80, speedMax: 280, size: Utils.rand(3, 6), sizeEnd: 0, lifeMin: 0.2, lifeMax: 0.5, friction: 0.95, glow: true });
    // Ring effect
    this.emit(x, y, { count: 1, color, type: 'ring', speedMin: 0, speedMax: 0, size: 5, lifeMin: 0.3, lifeMax: 0.3, alpha: 0.6, alphaEnd: 0, friction: 1 });
    // Sparks
    this.emit(x, y, { count: 5, color: '#fff', type: 'spark', speedMin: 120, speedMax: 300, size: 2, sizeEnd: 0, lifeMin: 0.1, lifeMax: 0.25, friction: 0.92 });
  },

  hit(x, y, color) {
    this.emit(x, y, { count: 6, color, speedMin: 50, speedMax: 140, size: 2.5, sizeEnd: 0, lifeMin: 0.1, lifeMax: 0.2, friction: 0.9, glow: true });
    this.emit(x, y, { count: 2, color: '#fff', type: 'spark', speedMin: 80, speedMax: 160, size: 1.5, sizeEnd: 0, lifeMin: 0.08, lifeMax: 0.15, friction: 0.9 });
  },

  xpCollect(x, y) {
    this.emit(x, y, { count: 5, color: CONFIG.COLORS.XP_ORB, speedMin: 30, speedMax: 70, size: 3, sizeEnd: 0, lifeMin: 0.15, lifeMax: 0.3, friction: 0.9, glow: true, type: 'star' });
  },

  goldCollect(x, y) {
    this.emit(x, y, { count: 6, color: CONFIG.COLORS.GOLD, speedMin: 40, speedMax: 90, size: 3, sizeEnd: 0, lifeMin: 0.2, lifeMax: 0.35, friction: 0.9, glow: true, type: 'star' });
  },

  levelUpBurst(x, y) {
    this.emit(x, y, { count: 35, color: '#ffdd44', speedMin: 120, speedMax: 320, size: 4, sizeEnd: 0, lifeMin: 0.3, lifeMax: 0.7, friction: 0.96, glow: true });
    this.emit(x, y, { count: 20, color: '#fff', speedMin: 60, speedMax: 220, size: 2, sizeEnd: 0, lifeMin: 0.2, lifeMax: 0.5, friction: 0.96, glow: true });
    // Golden ring
    this.emit(x, y, { count: 1, color: '#ffdd44', type: 'ring', speedMin: 0, speedMax: 0, size: 8, lifeMin: 0.5, lifeMax: 0.5, alpha: 0.8, alphaEnd: 0, friction: 1 });
  },

  trail(x, y, color) {
    this.emit(x, y, { count: 1, color, speedMin: 5, speedMax: 20, size: 2, sizeEnd: 0, lifeMin: 0.1, lifeMax: 0.2, alpha: 0.5, friction: 0.9 });
  },

  damage(x, y) {
    this.emit(x, y, { count: 8, color: '#ff4444', speedMin: 70, speedMax: 180, size: 3, sizeEnd: 0, lifeMin: 0.15, lifeMax: 0.3, friction: 0.92, glow: true });
    this.emit(x, y, { count: 3, color: '#ff8888', type: 'spark', speedMin: 100, speedMax: 200, size: 2, sizeEnd: 0, lifeMin: 0.1, lifeMax: 0.2, friction: 0.9 });
  },

  // NEW: Enemy spawn portal effect
  spawnPortal(x, y) {
    this.emit(x, y, { count: 8, color: '#aa55ff', type: 'ring', speedMin: 0, speedMax: 0, size: 3, lifeMin: 0.3, lifeMax: 0.5, alpha: 0.7, alphaEnd: 0, friction: 1 });
    this.emit(x, y, { count: 6, color: '#8844cc', speedMin: 20, speedMax: 60, size: 2, sizeEnd: 0, lifeMin: 0.2, lifeMax: 0.4, friction: 0.95, glow: true });
  },

  // NEW: Heal effect
  heal(x, y) {
    this.emit(x, y, { count: 8, color: '#44ff88', speedMin: 30, speedMax: 80, size: 3, sizeEnd: 0, lifeMin: 0.3, lifeMax: 0.5, friction: 0.94, glow: true, type: 'star' });
  },

  // NEW: Dodge effect
  dodge(x, y) {
    this.emit(x, y, { count: 6, color: '#88aaff', speedMin: 40, speedMax: 100, size: 2, sizeEnd: 0, lifeMin: 0.15, lifeMax: 0.3, alpha: 0.6, friction: 0.9 });
  }
};

