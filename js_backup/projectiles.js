// ============================================================
// PROJECTILES.JS — Projectile management
// ============================================================
const ProjectileSystem = {
  projectiles: [],
  enemyProjectiles: [],

  spawnPlayer(x, y, angle, weaponDef, tier, playerStats) {
    const dmgMult = 1 + (playerStats.damagePercent || 0) / 100;
    const flatDmg = weaponDef.type === 'melee' ? (playerStats.meleeDamage || 0) : (playerStats.rangedDamage || 0);
    let baseDmg = (weaponDef.baseDamage + weaponDef.baseDamage * tier * 0.5 + flatDmg) * dmgMult;
    let isCrit = false;
    if (Math.random() * 100 < (playerStats.critChance || 5)) {
      baseDmg *= 1.8;
      isCrit = true;
    }
    const pellets = weaponDef.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const spreadAngle = pellets > 1
        ? angle + weaponDef.spread * ((i / (pellets - 1)) - 0.5) * 2
        : angle + Utils.rand(-weaponDef.spread, weaponDef.spread);
      this.projectiles.push({
        x, y,
        vx: Math.cos(spreadAngle) * weaponDef.projectileSpeed,
        vy: Math.sin(spreadAngle) * weaponDef.projectileSpeed,
        damage: baseDmg / pellets,
        size: weaponDef.projectileSize + tier * 0.5,
        color: weaponDef.projectileColor,
        piercing: (weaponDef.piercing || 0) + tier,
        piercedEnemies: new Set(),
        knockback: weaponDef.knockback || 0,
        life: 0,
        maxLife: (weaponDef.range || 300) / weaponDef.projectileSpeed,
        spinning: weaponDef.spinning || false,
        rotation: 0,
        isCrit,
        trail: []
      });
    }
  },

  spawnEnemy(x, y, angle, speed, damage, color) {
    this.enemyProjectiles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      size: 4,
      color: color || '#cc44cc',
      life: 0,
      maxLife: 3,
      trail: []
    });
  },

  update(dt) {
    this._updateList(this.projectiles, dt);
    this._updateList(this.enemyProjectiles, dt);
  },

  _updateList(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      if (p.spinning) p.rotation += 15 * dt;
      // Trail
      p.trail.push({ x: p.x, y: p.y, alpha: 1 });
      if (p.trail.length > 5) p.trail.shift();
      for (const t of p.trail) t.alpha -= dt * 4;
      // Remove if expired or out of room bounds
      const bounds = 80; // some margin outside room
      if (p.life >= p.maxLife || p.x < -bounds || p.x > CONFIG.ROOM_WIDTH + bounds || p.y < -bounds || p.y > CONFIG.ROOM_HEIGHT + bounds) {
        list.splice(i, 1);
      }
    }
  },

  render(ctx, camera) {
    this._renderList(ctx, camera, this.projectiles);
    this._renderList(ctx, camera, this.enemyProjectiles);
  },

  _renderList(ctx, camera, list) {
    for (const p of list) {
      const zoom = camera.zoom || 1; const sx = (p.x - camera.x) * zoom + ctx.canvas.width / 2;
      const sy = (p.y - camera.y) * zoom + ctx.canvas.height / 2;
      if (sx < -30 || sx > ctx.canvas.width + 30 || sy < -30 || sy > ctx.canvas.height + 30) continue;

      // Trail
      for (const t of p.trail) {
        if (t.alpha <= 0) continue;
        const tx = (t.x - camera.x) * zoom + ctx.canvas.width / 2;
        const ty = (t.y - camera.y) * zoom + ctx.canvas.height / 2;
        ctx.globalAlpha = t.alpha * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(tx, ty, p.size * 0.6 * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Glow
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;

      if (p.spinning) {
        ctx.translate(sx, sy);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        const s = p.size * zoom;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i;
          ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.4, Math.sin(a + Math.PI / 4) * s * 0.4);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * zoom, 0, Math.PI * 2);
        ctx.fill();
        // Bright center
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * 0.4 * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  clear() {
    this.projectiles.length = 0;
    this.enemyProjectiles.length = 0;
  }
};
