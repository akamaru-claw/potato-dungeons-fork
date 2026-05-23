// ============================================================
// PLAYER.JS — Player entity for Potato Dungeons
// ============================================================
const Player = {
  create() {
    return {
      x: CONFIG.ROOM_WIDTH / 2,
      y: CONFIG.ROOM_HEIGHT - CONFIG.WALL_THICKNESS - 30,
      size: CONFIG.PLAYER.SIZE,
      speed: CONFIG.PLAYER.BASE_SPEED,
      hp: CONFIG.PLAYER.BASE_HP,
      maxHpBonus: 0,
      xp: 0, xpToLevel: CONFIG.XP.BASE_TO_LEVEL, level: 1,
      invincible: 0,
      alive: true,
      skin: 'potato_default',
      weapons: [],
      kills: 0,
      gold: 0,
      tookDamageThisFloor: false,
      stats: { dodge: CONFIG.PLAYER.DODGE_BASE, armor: 0, attackSpeed: 0, damage: 0, lifeSteal: 0, critChance: 0, speed: 0, harvesting: 0 },
      bobTimer: 0,
      flashTimer: 0,

      getMaxHp() { return CONFIG.PLAYER.BASE_HP + this.maxHpBonus; },

      update(dt) {
        if (!this.alive) return;
        const move = Input.getMovement();
        const speedMult = 1 + (this.stats.speed || 0) / 100;
        this.x += move.x * this.speed * speedMult * dt;
        this.y += move.y * this.speed * speedMult * dt;

        if (this.invincible > 0) this.invincible -= dt;
        this.bobTimer += dt * 8;
        this.flashTimer -= dt;
      },

      takeDamage(amount) {
        if (!this.alive || this.invincible > 0) return;
        const dodgeChance = Math.min(this.stats.dodge, 60);
        if (Math.random() * 100 < dodgeChance) {
          FloatingText.add(this.x, this.y - this.size - 10, 'MISS!', CONFIG.COLORS.DODGE_COLOR, 18);
          ParticleSystem.dodge(this.x, this.y);
          return;
        }
        const dmg = Math.max(1, amount - this.stats.armor);
        this.hp -= dmg;
        this.tookDamageThisFloor = true;
        this.invincible = CONFIG.PLAYER.INVINCIBILITY_TIME;
        ParticleSystem.damage(this.x, this.y);
        FloatingText.add(this.x, this.y - this.size - 10, '-' + Math.round(dmg), CONFIG.COLORS.HEALTH_LOW, 22);
        Renderer.shake(8);
        Renderer.flashDamage();
        if (this.hp <= 0) { this.hp = 0; this.alive = false; }
      },

      heal(amount) {
        const oldHp = this.hp;
        this.hp = Math.min(this.getMaxHp(), this.hp + amount);
        if (this.hp > oldHp) {
          FloatingText.add(this.x, this.y - this.size - 10, '+' + Math.round(this.hp - oldHp), CONFIG.COLORS.HEAL_COLOR, 14);
          ParticleSystem.heal(this.x, this.y);
        }
      }
    };
  },

  render(ctx, camera, player) {
    if (!player.alive && player.flashTimer <= 0) return;
    const zoom = camera.zoom || 1;
    const sx = (player.x - camera.x) * zoom + ctx.canvas.width / 2;
    const sy = (player.y - camera.y) * zoom + ctx.canvas.height / 2;
    const s = player.size * zoom;
    const bob = Math.sin(player.bobTimer) * 2 * zoom;

    // Shadow
    ctx.fillStyle = `rgba(0,0,0,${CONFIG.VISUAL.SHADOW_ALPHA})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.7, s * 0.8, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Invincibility flash
    if (player.invincible > 0 && Math.sin(player.invincible * 30) > 0) return;

    // Sprite
    const skinImg = Assets.get(player.skin);
    if (skinImg) {
      const drawH = s * 2.2;
      ctx.save();
      if (player.invincible > 0) ctx.globalAlpha = 0.5;
      ctx.drawImage(skinImg, sx - s, sy - drawH + bob + s * 0.3, s * 2, drawH);
      ctx.restore();
    } else {
      // Fallback circle
      ctx.fillStyle = '#e8b84b';
      ctx.beginPath();
      ctx.arc(sx, sy + bob, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c89830';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Render weapons
    this.renderWeapon(ctx, camera, player);
  },

  renderWeapon(ctx, camera, player) {
    if (player.weapons.length === 0) return;
    const zoom = camera.zoom || 1;
    const sx = (player.x - camera.x) * zoom + ctx.canvas.width / 2;
    const sy = (player.y - camera.y) * zoom + ctx.canvas.height / 2;
    const s = player.size * zoom;
    const bob = Math.sin(player.bobTimer) * 2 * zoom;

    for (let i = 0; i < player.weapons.length; i++) {
      const w = player.weapons[i];
      const angle = w.angle || 0;
      let weaponAngle, wX, wY;

      if (player.weapons.length === 1) {
        weaponAngle = angle;
        wX = sx + Math.cos(weaponAngle) * (s + 10 * zoom);
        wY = sy + bob + Math.sin(weaponAngle) * (s + 10 * zoom);
      } else {
        if (i === 0) {
          weaponAngle = angle;
        } else {
          const spread = Math.PI + (i - 1) * (Math.PI * 0.6 / (player.weapons.length - 1)) - (Math.PI * 0.3);
          weaponAngle = angle + spread;
        }
        wX = sx + Math.cos(weaponAngle) * (s + (6 + (i > 0 ? 3 : 0)) * zoom);
        wY = sy + bob + Math.sin(weaponAngle) * (s + (6 + (i > 0 ? 3 : 0)) * zoom);
      }

      ctx.save();
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle + Math.PI / 2);
      Player._drawWeaponShape(ctx, w, player);
      ctx.restore();
    }
  },

  // Same procedural weapon drawing from Brotato
  _drawWeaponShape(ctx, weapon, player) {
    const tierColors = ['#aaa', '#4488ff', '#bb55ee', '#ff8800'];
    const tier = weapon.tier || 0;
    const color = tierColors[Math.min(tier, 3)];
    if (tier >= 2) { ctx.shadowColor = color; ctx.shadowBlur = 8; }

    if (weapon.def.type === 'ranged') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = '#2a2a3a';
      ctx.beginPath(); ctx.roundRect(-3, -10, 6, 14, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.fillRect(-2, -14, 4, 6);
    } else {
      ctx.fillStyle = '#ddd';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-2, -14); ctx.lineTo(-1, 6); ctx.lineTo(1, 6); ctx.lineTo(2, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#663311'; ctx.fillRect(-2, 6, 4, 6);
    }
    ctx.shadowBlur = 0;
  }
};