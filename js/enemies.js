// ============================================================
// ENEMIES.JS — Enemy types, AI, spawning for Potato Dungeons
// ============================================================
const EnemySystem = {
  enemies: [],
  grid: null,

  init() { this.grid = Utils.createSpatialGrid(100); },

  spawn(type, x, y, floorNum) {
    const def = CONFIG.ENEMY_DEFS[type];
    if (!def) return null;
    const hpScale = 1 + (floorNum - 1) * CONFIG.TOWER.HP_SCALING;
    const dmgScale = 1 + (floorNum - 1) * CONFIG.TOWER.DAMAGE_SCALING;
    const spdScale = 1 + (floorNum - 1) * CONFIG.TOWER.SPEED_SCALING;
    const enemy = {
      x, y, type, def,
      hp: Math.round(def.hp * hpScale), maxHp: Math.round(def.hp * hpScale),
      damage: def.damage * dmgScale, speed: def.speed * spdScale,
      size: def.size, xpValue: def.xp, color: def.color, colorDark: def.colorDark,
      knockbackVx: 0, knockbackVy: 0, flashTimer: 0, hitCooldown: 0,
      attackCooldown: def.attackCooldown || 0,
      chargeCooldown: def.chargeCooldown || 0, chargeTimer: 0, charging: false, chargeDir: { x: 0, y: 0 },
      alive: true, spawnAnim: 0.4, hitAnim: 0, pulsePhase: Utils.rand(0, Math.PI * 2),

      takeDamage(amount, dir, knockback, isCrit) {
        if (!this.alive) return;
        this.hp -= amount;
        this.flashTimer = 0.1;
        this.hitAnim = 0.15;
        this.knockbackVx += dir.x * (knockback || 0) * 8;
        this.knockbackVy += dir.y * (knockback || 0) * 8;
        ParticleSystem.hit(this.x, this.y, this.color);
        const color = isCrit ? CONFIG.COLORS.CRIT_COLOR : '#fff';
        const size = isCrit ? 24 : 16;
        const prefix = isCrit ? '💥 ' : '';
        FloatingText.add(this.x + Utils.rand(-8, 8), this.y - this.size, prefix + Math.round(amount), color, size);
        if (this.hp <= 0) this.die();
      },

      die() {
        this.alive = false;
        ParticleSystem.explosion(this.x, this.y, this.color, this.def.boss ? 40 : 15);
      }
    };
    this.enemies.push(enemy);
    ParticleSystem.spawnPortal(x, y);
    return enemy;
  },

  update(dt, player) {
    this.grid.clear();
    for (const e of this.enemies) { if (e.alive) this.grid.insert(e); }

    // Build target list: host player + remote co-op player
    const targets = [player];
    if (Multiplayer.connected) {
      Multiplayer.remotePlayers.forEach(rp => {
        if (rp.remotePlayer && rp.remotePlayer.alive) targets.push(rp.remotePlayer);
      });
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) { this.enemies.splice(i, 1); continue; }
      if (e.spawnAnim > 0) { e.spawnAnim -= dt; continue; }

      e.flashTimer -= dt;
      e.hitCooldown -= dt;
      e.hitAnim = Math.max(0, e.hitAnim - dt);
      e.pulsePhase += dt * 2;
      e.knockbackVx *= 0.85;
      e.knockbackVy *= 0.85;
      e.x += e.knockbackVx * dt * 60;
      e.y += e.knockbackVy * dt * 60;

      // Find closest target (host or co-op player)
      let closestTarget = targets[0];
      let closestDist = Utils.vecDist(e, targets[0]);
      for (let t = 1; t < targets.length; t++) {
        const d = Utils.vecDist(e, targets[t]);
        if (d < closestDist) {
          closestDist = d;
          closestTarget = targets[t];
        }
      }
      const toTarget = Utils.vecSub(closestTarget, e);
      const distToTarget = Utils.vecLength(toTarget);
      const dirToTarget = distToTarget > 0 ? Utils.vecScale(toTarget, 1 / distToTarget) : { x: 0, y: 0 };

      // AI
      if (e.def.ranged) {
        e.attackCooldown -= dt;
        if (distToTarget < e.def.attackRange && e.attackCooldown <= 0) {
          const angle = Math.atan2(toTarget.y, toTarget.x);
          ProjectileSystem.spawnEnemy(e.x, e.y, angle, e.def.projectileSpeed, e.damage, e.color);
          e.attackCooldown = e.def.attackCooldown || 2;
        }
        if (distToTarget < e.def.attackRange * 0.6) {
          e.x -= dirToTarget.x * e.speed * dt;
          e.y -= dirToTarget.y * e.speed * dt;
        } else if (distToTarget > e.def.attackRange * 0.9) {
          e.x += dirToTarget.x * e.speed * dt;
          e.y += dirToTarget.y * e.speed * dt;
        }
      } else if (e.def.charges) {
        if (e.charging) {
          e.chargeTimer -= dt;
          e.x += e.chargeDir.x * e.def.chargeSpeed * dt;
          e.y += e.chargeDir.y * e.def.chargeSpeed * dt;
          if (e.chargeTimer <= 0) { e.charging = false; e.chargeCooldown = e.def.chargeCooldown; }
        } else {
          e.chargeCooldown -= dt;
          e.x += dirToTarget.x * e.speed * dt;
          e.y += dirToTarget.y * e.speed * dt;
          if (e.chargeCooldown <= 0 && distToTarget < 200) {
            e.charging = true;
            e.chargeDir = { ...dirToTarget };
            e.chargeTimer = 0.5;
          }
        }
      } else {
        e.x += dirToTarget.x * e.speed * dt;
        e.y += dirToTarget.y * e.speed * dt;
      }

      // Separation
      const nearby = this.grid.query(e.x, e.y, e.size * 3);
      for (const other of nearby) {
        if (other === e) continue;
        const d = Utils.vecDist(e, other);
        const minDist = e.size + other.size;
        if (d < minDist && d > 0) {
          const push = Utils.vecScale(Utils.vecNormalize(Utils.vecSub(e, other)), (minDist - d) * 0.3);
          e.x += push.x; e.y += push.y;
        }
      }

      // Constrain to room
      Dungeon.constrainEnemy(e);
    }
  },

  render(ctx, camera) {
    const zoom = camera.zoom || 1;
    const w = (ctx.canvas._cssWidth || ctx.canvas.width);

    for (const e of this.enemies) {
      const sx = (e.x - camera.x) * zoom + w / 2;
      const sy = (e.y - camera.y) * zoom + (ctx.canvas._cssHeight || ctx.canvas.height) / 2;
      if (sx < -100 || sx > w + 100 || sy < -100 || sy > (ctx.canvas._cssHeight || ctx.canvas.height) + 100) continue;

      const scale = e.spawnAnim > 0 ? Utils.easeOutBack(1 - e.spawnAnim / 0.4) : 1;
      const s = e.size * scale * zoom;
      const squishX = e.hitAnim > 0 ? 1 + e.hitAnim * 1.5 : 1;
      const squishY = e.hitAnim > 0 ? 1 - e.hitAnim * 0.8 : 1;

      // Shadow
      ctx.fillStyle = `rgba(0,0,0,${CONFIG.VISUAL.SHADOW_ALPHA})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.7, s * 0.8 * squishX, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      if (e.flashTimer > 0) { ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 30) * 0.5; }
      if (e.hitAnim > 0) {
        ctx.save(); ctx.translate(sx, sy); ctx.scale(squishX, squishY); ctx.translate(-sx, -sy);
      }

      // Elite/Boss glow
      if (e.def.elite || e.def.boss) {
        ctx.save();
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 15 + Math.sin(e.pulsePhase) * 5;
        ctx.fillStyle = Utils.colorWithAlpha(e.color, 0.15);
        ctx.beginPath(); ctx.arc(sx, sy, s + 6 * zoom, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Body
      ctx.fillStyle = e.color;
      ctx.strokeStyle = e.colorDark;
      ctx.lineWidth = 2;
      const shape = e.def.shape;
      if (shape === 'circle') {
        ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (shape === 'triangle') {
        ctx.beginPath();
        const dirAngle = Game.player ? Math.atan2(Game.player.y - e.y, Game.player.x - e.x) : 0;
        for (let j = 0; j < 3; j++) {
          const a = dirAngle + (Math.PI * 2 / 3) * j - Math.PI / 2;
          ctx.lineTo(sx + Math.cos(a) * s, sy + Math.sin(a) * s);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (shape === 'square') {
        ctx.fillRect(sx - s, sy - s, s * 2, s * 2);
        ctx.strokeRect(sx - s, sy - s, s * 2, s * 2);
      } else if (shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s, sy);
        ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s, sy);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }

      // Eyes
      const eyeSize = s * 0.25;
      const eyeOff = s * 0.3;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx - eyeOff, sy - eyeSize, eyeSize, 0, Math.PI * 2);
      ctx.arc(sx + eyeOff, sy - eyeSize, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(sx - eyeOff, sy - eyeSize, eyeSize * 0.5, 0, Math.PI * 2);
      ctx.arc(sx + eyeOff, sy - eyeSize, eyeSize * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // HP bar
      if (e.hp < e.maxHp) {
        const barW = s * 2, barH = 3 * zoom;
        const barX = sx - barW / 2, barY = sy - s - 8 * zoom;
        const hpPct = e.hp / e.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = hpPct > 0.5 ? CONFIG.COLORS.HEALTH_HIGH : hpPct > 0.25 ? CONFIG.COLORS.HEALTH_MID : CONFIG.COLORS.HEALTH_LOW;
        ctx.fillRect(barX, barY, barW * hpPct, barH);
      }

      if (e.hitAnim > 0) ctx.restore();
      ctx.globalAlpha = 1;
    }
  },

  clear() { this.enemies.length = 0; }
};