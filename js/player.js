// ============================================================
// PLAYER.JS — Player entity for Potato Dungeons
// ============================================================
const Player = {
  // Character class visual definitions — each looks distinct
  _charDefs: {
    potato_default:  { body: '#e8b84b', outline: '#c89830', label: 'Kartoffel' },
    potato_fries:    { body: '#ffe066', outline: '#ccaa22', label: 'Pommes', tall: true },
    potato_sweet:    { body: '#cc6633', outline: '#993322', label: 'Süßkartoffel', wide: true },
    potato_chips:    { body: '#f0d890', outline: '#bba860', label: 'Chips', thin: true },
    potato_golden:   { body: '#ffd700', outline: '#cc9900', label: 'Goldene', glow: true },
    potato_shadow:   { body: '#2a2a3d', outline: '#151522', label: 'Schatten', shadow: true },
    potato_rainbow:  { body: '#e8b84b', outline: '#888', label: 'Regenbogen', rainbow: true },
    potato_devil:    { body: '#cc2222', outline: '#880000', label: 'Teufel', horns: true },
  },

  _getCharDefs(charKey) {
    return this._charDefs[charKey] || this._charDefs.potato_default;
  },

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
      skin: Account.loggedIn ? Account.selectedCharacter || 'potato_default' : 'potato_default',
      cosmeticSkin: Account.loggedIn ? Account.skin : 'skin_default',
      weapons: [],
      buildTimeline: [], // Track weapon/relic acquisitions: [{floor, type, name, icon, tier?}]
      kills: 0,
      gold: 0,
      tookDamageThisFloor: false,
      relics: [],
      dashCooldown: 0,
      isDashing: false,
      dashTimer: 0,
      dashDir: { x: 0, y: 0 },
      killStreak: 0,
      maxKillStreak: 0,
      killCount: 0,
      timeSurvived: 0,
      goldEarned: 0,
      dpsPerWeapon: {},
      lastKilledBy: null,
      shadowStrikeActive: false,
      stats: { dodge: CONFIG.PLAYER.DODGE_BASE, armor: 0, attackSpeed: 0, damage: 0, lifeSteal: 0, critChance: 0, speed: 0, harvesting: 0 },
      bobTimer: 0,
      flashTimer: 0,

      getMaxHp() { return CONFIG.PLAYER.BASE_HP + this.maxHpBonus; },

      applyCharacterStats() {
        const charKey = this.skin;
        const charDef = CONFIG.CHARACTERS?.[charKey];
        if (!charDef || !charDef.stats) return;
        for (const [stat, val] of Object.entries(charDef.stats)) {
          if (stat === 'hp') {
            this.maxHpBonus += val;
            this.hp = this.getMaxHp();
          } else if (stat === 'maxWeapons') {
            CONFIG.PLAYER.MAX_WEAPONS += val;
          } else {
            this.stats[stat] = (this.stats[stat] || 0) + val;
          }
        }
        if (charDef.ability === 'dash_master') {
          CONFIG.PLAYER.DASH_COOLDOWN *= 0.5;
        }
      },

      update(dt) {
        if (!this.alive) return;
        const move = Input.getMovement();
        const speedMult = 1 + (this.stats.speed || 0) / 100;

        if (this.isDashing) {
          this.dashTimer -= dt;
          const dashSpeed = CONFIG.PLAYER.DASH_SPEED || 600;
          this.x += this.dashDir.x * dashSpeed * dt;
          this.y += this.dashDir.y * dashSpeed * dt;
          this.lastDx = this.dashDir.x;
          this.lastDy = this.dashDir.y;
          if (this.dashTimer <= 0) {
            this.isDashing = false;
            const charDef = CONFIG.CHARACTERS?.[this.skin];
            if (charDef?.ability === 'shadow_strike') this.shadowStrikeActive = true;
          }
        } else {
          this.x += move.x * this.speed * speedMult * dt;
          this.y += move.y * this.speed * speedMult * dt;
          if (move.x !== 0 || move.y !== 0) {
            const len = Math.sqrt(move.x * move.x + move.y * move.y);
            this.lastDx = move.x / len;
            this.lastDy = move.y / len;
          }
        }
        if (this.dashCooldown > 0) this.dashCooldown -= dt;
        if (this.invincible > 0) this.invincible -= dt;
        this.bobTimer += dt * 8;
        this.flashTimer -= dt;
      },

      dash() {
        if (this.dashCooldown > 0 || this.isDashing) return;
        const move = Input.getMovement();
        if (move.x === 0 && move.y === 0) return;
        const len = Math.sqrt(move.x * move.x + move.y * move.y);
        this.dashDir = { x: move.x / len, y: move.y / len };
        this.isDashing = true;
        this.dashTimer = CONFIG.PLAYER.DASH_DURATION;
        this.invincible = CONFIG.PLAYER.DASH_IFRAMES;
        this.dashCooldown = CONFIG.PLAYER.DASH_COOLDOWN;
      },

      applyRelics() {
        for (const r of this.relics) {
          const def = CONFIG.RELIC_DEFS[r.key];
          if (!def) continue;
          if (def.tag === 'dmg_slow') { this.stats.damage += 3; this.stats.speed -= 0.1; }
          else if (def.tag === 'dodge') { if (this.hp < this.getMaxHp() * 0.3) this.stats.dodge += 0.3; }
          else if (def.tag === 'speed') { this.stats.attackSpeed += 0.15 * this.relics.length; }
        }
      },

      addRelic(key) {
        if (this.relics.find(r => r.key === key)) return false;
        this.relics.push({ key });
        const def = CONFIG.RELIC_DEFS?.[key];
        this.buildTimeline.push({
          floor: Dungeon.currentFloor,
          type: 'relic',
          name: def?.name || key,
          icon: def?.icon || '✨'
        });
        this.applyRelics();
        return true;
      },

      takeDamage(amount, attacker) {
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
        if (this.hp <= 0) {
          this.hp = 0; this.alive = false;
          // Track killer info
          if (attacker && attacker.def) {
            this.lastKiller = {
              name: attacker.def.name || 'Unbekannt',
              icon: attacker.def.icon || '💀',
              type: attacker.type || 'unknown',
              isBoss: !!attacker.def.boss,
              isElite: !!attacker.def.elite,
              color: attacker.def.color || '#888'
            };
          } else {
            this.lastKiller = { name: 'Unbekannt', icon: '💀', type: 'unknown', isBoss: false, isElite: false, color: '#888' };
          }
        }
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

  _drawMenuChar(ctx, x, y, charKey, skinKey, bobTimer) {
    const def = this._charDefs[charKey] || this._charDefs.potato_default;
    const s = 18;
    const bob = Math.sin(bobTimer * 5) * 2;
    const rx = def.tall ? s * 0.75 : def.wide ? s * 1.25 : def.thin ? s * 0.6 : s;
    const ry = def.tall ? s * 1.2 : def.wide ? s * 0.85 : def.thin ? s * 1.1 : s;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.6, rx * 0.7, ry * 0.2, 0, 0, Math.PI * 2); ctx.fill();

    // Character body
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + bob, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Character features
    if (def.horns) {
      ctx.fillStyle = '#440000';
      ctx.beginPath(); ctx.moveTo(x - rx*0.7, y+bob - ry*0.4); ctx.lineTo(x - rx*0.9, y+bob - ry*1.2); ctx.lineTo(x - rx*0.25, y+bob - ry*0.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + rx*0.7, y+bob - ry*0.4); ctx.lineTo(x + rx*0.9, y+bob - ry*1.2); ctx.lineTo(x + rx*0.25, y+bob - ry*0.5); ctx.fill();
    }
    if (def.glow) {
      ctx.save(); ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.ellipse(x, y+bob, rx+4, ry+4, 0, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    }
    if (def.shadow) {
      ctx.save(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y+bob, s+12, 0, Math.PI*2); ctx.fillStyle = '#6600aa'; ctx.fill(); ctx.restore();
    }
    if (def.rainbow) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, y+bob, rx+4, ry+4, 0, 0, Math.PI*2);
      ctx.strokeStyle = `hsl(${(Date.now()/8)%360},80%,55%)`; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    }
    if (def.thin) {
      ctx.strokeStyle = def.outline + '66'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x-rx*0.3, y+bob-ry*0.3); ctx.lineTo(x+rx*0.2, y+bob+ry*0.3); ctx.stroke();
    }

    // Skin effect
    const skinDef = Account.SKINS?.[skinKey];
    if (skinDef && skinDef.effect !== 'none') {
      if (skinDef.effect === 'glow') {
        ctx.save(); ctx.shadowColor = skinDef.glowColor || '#ffd700'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.ellipse(x, y+bob, rx+3, ry+3, 0, 0, Math.PI*2);
        ctx.strokeStyle = (skinDef.glowColor||'#ffd700')+'55'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      } else if (skinDef.effect === 'aura') {
        ctx.save(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(x, y+bob, rx+8, ry+8, 0, 0, Math.PI*2);
        ctx.fillStyle = (skinDef.auraColor||'#ff4400')+'44'; ctx.fill(); ctx.restore();
      } else if (skinDef.effect === 'rainbow') {
        ctx.save(); ctx.beginPath(); ctx.ellipse(x, y+bob, rx+3, ry+3, 0, 0, Math.PI*2);
        ctx.strokeStyle = `hsl(${(Date.now()/6)%360},80%,60%)`; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      } else if (skinDef.effect === 'outline') {
        ctx.save(); ctx.shadowColor = skinDef.outlineColor||'#00ff88'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(x, y+bob, rx+3, ry+3, 0, 0, Math.PI*2);
        ctx.strokeStyle = skinDef.outlineColor||'#00ff88'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      } else if (skinDef.effect === 'sparkle') {
        for (let i = 0; i < 4; i++) {
          const a = Date.now()/300 + i*1.5; const d = s+5;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x+Math.cos(a)*d, y+bob+Math.sin(a)*d, 1.2, 0, Math.PI*2); ctx.fill();
        }
      } else if (skinDef.effect === 'diamond') {
        ctx.save(); ctx.beginPath(); ctx.moveTo(x, y-ry-8); ctx.lineTo(x+rx+6, y+bob); ctx.lineTo(x, y+ry+8); ctx.lineTo(x-rx-6, y+bob); ctx.closePath();
        ctx.strokeStyle = '#88ddff55'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      } else if (skinDef.effect === 'ghost' || skinDef.effect === 'ghost_transparent') {
        ctx.save(); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(x, y+bob, rx+2, ry+2, 0, 0, Math.PI*2);
        ctx.strokeStyle = '#aaffaa88'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }
    }

    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x - rx*0.3, y+bob - ry*0.12, 2, 0, Math.PI*2); ctx.arc(x + rx*0.3, y+bob - ry*0.12, 2, 0, Math.PI*2); ctx.fill();
  },

  render(ctx, camera, player) {
    if (!player.alive && player.flashTimer <= 0) return;
    const zoom = camera.zoom || 1;
    const sx = (player.x - camera.x) * zoom + (ctx.canvas._cssWidth || ctx.canvas.width) / 2;
    const sy = (player.y - camera.y) * zoom + (ctx.canvas._cssHeight || ctx.canvas.height) / 2;
    const s = player.size * zoom;
    const bob = Math.sin(player.bobTimer) * 2 * zoom;

    // Shadow
    ctx.fillStyle = `rgba(0,0,0,${CONFIG.VISUAL.SHADOW_ALPHA})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.7, s * 0.8, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Invincibility flash
    if (player.invincible > 0 && Math.sin(player.invincible * 30) > 0) return;

    // Character class — each looks distinct
    const charDef = this._getCharDefs(player.skin);
    const cosSkin = player.cosmeticSkin || 'skin_default';
    const cosDef = Account.SKINS?.[cosSkin] || Account.SKINS.skin_default;

    ctx.save();
    if (player.invincible > 0) ctx.globalAlpha = 0.5;
    if (cosDef.effect === 'ghost' || cosDef.effect === 'ghost_transparent') {
      ctx.globalAlpha = cosDef.effect === 'ghost_transparent' ? 0.4 : 0.7;
    }

    // Shape varies by character
    const drawRadiusX = charDef.tall ? s * 0.75 : charDef.wide ? s * 1.25 : charDef.thin ? s * 0.6 : s;
    const drawRadiusY = charDef.tall ? s * 1.2 : charDef.wide ? s * 0.85 : charDef.thin ? s * 1.1 : s;

    ctx.fillStyle = charDef.body;
    ctx.strokeStyle = charDef.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy + bob, drawRadiusX, drawRadiusY, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Character-specific visuals
    if (charDef.horns) {
      // Devil horns
      ctx.fillStyle = '#440000';
      ctx.beginPath();
      ctx.moveTo(sx - drawRadiusX * 0.75, sy + bob - drawRadiusY * 0.4);
      ctx.lineTo(sx - drawRadiusX, sy + bob - drawRadiusY * 1.3);
      ctx.lineTo(sx - drawRadiusX * 0.25, sy + bob - drawRadiusY * 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx + drawRadiusX * 0.75, sy + bob - drawRadiusY * 0.4);
      ctx.lineTo(sx + drawRadiusX, sy + bob - drawRadiusY * 1.3);
      ctx.lineTo(sx + drawRadiusX * 0.25, sy + bob - drawRadiusY * 0.5);
      ctx.fill();
    }
    if (charDef.glow) {
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 20 + Math.sin(Date.now() / 200) * 8;
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, drawRadiusX + 4, drawRadiusY + 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,0,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    if (charDef.shadow) {
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 400) * 0.1;
      ctx.beginPath();
      ctx.arc(sx, sy + bob, Math.max(drawRadiusX, drawRadiusY) + 14, 0, Math.PI * 2);
      ctx.fillStyle = '#6600aa';
      ctx.fill();
      ctx.restore();
    }
    if (charDef.rainbow) {
      const hue = (Date.now() / 8) % 360;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, drawRadiusX + 4, drawRadiusY + 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    if (charDef.thin) {
      // Chips: crispy lines
      ctx.strokeStyle = charDef.outline + '88';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx - drawRadiusX*0.4, sy + bob - drawRadiusY*0.3); ctx.lineTo(sx + drawRadiusX*0.3, sy + bob + drawRadiusY*0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + drawRadiusX*0.3, sy + bob - drawRadiusY*0.2); ctx.lineTo(sx - drawRadiusX*0.15, sy + bob + drawRadiusY*0.4); ctx.stroke();
    }

    // Cosmetic skin overlay effects
    if (cosDef.effect === 'glow') {
      ctx.save();
      ctx.shadowColor = cosDef.glowColor || '#ffd700';
      ctx.shadowBlur = 15 + Math.sin(Date.now() / 200) * 5;
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, drawRadiusX + 3, drawRadiusY + 3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = (cosDef.glowColor || '#ffd700') + '66';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else if (cosDef.effect === 'aura') {
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 300) * 0.15;
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, drawRadiusX + 8, drawRadiusY + 8, 0, 0, Math.PI * 2);
      ctx.fillStyle = (cosDef.auraColor || '#ff4400') + '44';
      ctx.fill();
      ctx.restore();
    } else if (cosDef.effect === 'rainbow') {
      const hue = (Date.now() / 8) % 360;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, drawRadiusX + 4, drawRadiusY + 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else if (cosDef.effect === 'outline') {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, drawRadiusX + 4, drawRadiusY + 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = cosDef.outlineColor || '#00ff88';
      ctx.lineWidth = 2;
      ctx.shadowColor = cosDef.outlineColor || '#00ff88';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    } else if (cosDef.effect === 'sparkle') {
      if (Math.random() < 0.3) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(drawRadiusX, drawRadiusY) + Math.random() * 8;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx + Math.cos(angle) * dist, sy + bob + Math.sin(angle) * dist, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (cosDef.effect === 'diamond') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, sy + bob - drawRadiusY - 10);
      ctx.lineTo(sx + drawRadiusX + 8, sy + bob);
      ctx.lineTo(sx, sy + bob + drawRadiusY + 10);
      ctx.lineTo(sx - drawRadiusX - 8, sy + bob);
      ctx.closePath();
      ctx.strokeStyle = '#88ddff88';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Eyes
    ctx.fillStyle = '#222';
    const eyeOffset = s * 0.3;
    ctx.beginPath();
    ctx.arc(sx - eyeOffset, sy + bob - s * 0.15, 2, 0, Math.PI * 2);
    ctx.arc(sx + eyeOffset, sy + bob - s * 0.15, 2, 0, Math.PI * 2);
    ctx.fill();

    // Render weapons
    this.renderWeapon(ctx, camera, player);
  },

  renderWeapon(ctx, camera, player) {
    if (player.weapons.length === 0) return;
    const zoom = camera.zoom || 1;
    const sx = (player.x - camera.x) * zoom + (ctx.canvas._cssWidth || ctx.canvas.width) / 2;
    const sy = (player.y - camera.y) * zoom + (ctx.canvas._cssHeight || ctx.canvas.height) / 2;
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
        wX = sx + Math.cos(weaponAngle) * (s + ((6 + (i > 0 ? 3 : 0)) * zoom));
        wY = sy + bob + Math.sin(weaponAngle) * (s + ((6 + (i > 0 ? 3 : 0)) * zoom));
      }

      ctx.save();
      ctx.translate(wX, wY);
      ctx.rotate(weaponAngle + Math.PI / 2);
      Player._drawWeaponShape(ctx, w, player);
      ctx.restore();
    }
  },

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