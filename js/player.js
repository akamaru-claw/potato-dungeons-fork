// ============================================================
// PLAYER.JS — Player entity for Potato Dungeons
// ============================================================
const Player = {
  // Character class visual definitions — each looks distinct
  _charDefs: {
    potato_default:  {
      body: '#e8b84b', outline: '#c89830', label: 'Kartoffel',
      draw: '_drawPotato', eyeStyle: 'normal', features: ['sprout']
    },
    potato_fries:    {
      body: '#ffe066', outline: '#ccaa22', label: 'Pommes', tall: true,
      draw: '_drawFries', eyeStyle: 'wide', features: ['stripes']
    },
    potato_sweet:    {
      body: '#cc6633', outline: '#993322', label: 'Süßkartoffel', wide: true,
      draw: '_drawSweetPotato', eyeStyle: 'normal', features: ['spots']
    },
    potato_chips:    {
      body: '#f0d890', outline: '#bba860', label: 'Chips', thin: true,
      draw: '_drawChips', eyeStyle: 'squint', features: ['waves']
    },
    potato_golden:   {
      body: '#ffd700', outline: '#cc9900', label: 'Goldene',
      draw: '_drawGolden', eyeStyle: 'shine', features: ['glow', 'sparkle']
    },
    potato_shadow:   {
      body: '#2a2a3d', outline: '#151522', label: 'Schatten',
      draw: '_drawShadow', eyeStyle: 'red', features: ['shadowAura', 'smoke']
    },
    potato_rainbow:  {
      body: '#e8b84b', outline: '#888', label: 'Regenbogen',
      draw: '_drawRainbow', eyeStyle: 'star', features: ['rainbowGlow']
    },
    potato_devil:    {
      body: '#cc2222', outline: '#880000', label: 'Teufel',
      draw: '_drawDevil', eyeStyle: 'angry', features: ['horns', 'tail']
    },
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
          // Co-op: notify other player of death
          if (Multiplayer.connected) {
            if (Multiplayer.isHost) {
              Multiplayer.send({ type: 'hostDead' });
            } else {
              Multiplayer.send({ type: 'clientDead' });
            }
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

    const drawer = def.draw || '_drawPotato';
    if (typeof this[drawer] === 'function') {
      this[drawer](ctx, x, y + bob, rx, ry, s, def);
    } else {
      this._drawPotato(ctx, x, y + bob, rx, ry, s, def);
    }

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

    const charDef = this._getCharDefs(player.skin);
    const cosSkin = player.cosmeticSkin || 'skin_default';
    const cosDef = Account.SKINS?.[cosSkin] || Account.SKINS.skin_default;

    ctx.save();
    if (player.invincible > 0) ctx.globalAlpha = 0.5;
    if (cosDef.effect === 'ghost' || cosDef.effect === 'ghost_transparent') {
      ctx.globalAlpha = cosDef.effect === 'ghost_transparent' ? 0.4 : 0.7;
    }

    const drawRadiusX = charDef.tall ? s * 0.75 : charDef.wide ? s * 1.25 : charDef.thin ? s * 0.6 : s;
    const drawRadiusY = charDef.tall ? s * 1.2 : charDef.wide ? s * 0.85 : charDef.thin ? s * 1.1 : s;

    // === NEW: Call the character-specific detailed drawer ===
    const drawer = charDef.draw || '_drawPotato';
    if (typeof this[drawer] === 'function') {
      this[drawer](ctx, sx, sy + bob, drawRadiusX, drawRadiusY, s, charDef);
    } else {
      this._drawPotato(ctx, sx, sy + bob, drawRadiusX, drawRadiusY, s, charDef);
    }

    // Cosmetic skin overlay effects (after body, before eyes)
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

    // Eyes — drawn on top, not affected by ghost alpha
    this._drawEyes(ctx, sx, sy + bob, s, charDef.eyeStyle);

    // Render weapons
    this.renderWeapon(ctx, camera, player);
  },

  // === DETAILED CHARACTER DRAWERS ===

  _drawPotato(ctx, x, y, rx, ry, s, def) {
    // Body: irregular "potato" shape using bezier
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.9, y - ry * 0.3);
    ctx.bezierQuadraticCurveTo = ctx.bezierCurveTo; // compat
    ctx.bezierCurveTo(x - rx, y - ry * 0.8, x - rx * 0.3, y - ry, x + rx * 0.2, y - ry * 0.85);
    ctx.bezierCurveTo(x + rx * 0.9, y - ry * 0.7, x + rx, y + ry * 0.2, x + rx * 0.8, y + ry * 0.6);
    ctx.bezierCurveTo(x + rx * 0.5, y + ry * 0.95, x - rx * 0.4, y + ry * 0.9, x - rx * 0.9, y + ry * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Potato "eyes" (dark spots) — characteristic of a real potato
    ctx.fillStyle = def.outline + 'aa';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.3, y - ry * 0.1, rx * 0.12, ry * 0.08, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + rx * 0.25, y + ry * 0.15, rx * 0.1, ry * 0.07, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + rx * 0.1, y - ry * 0.4, rx * 0.08, ry * 0.06, 0.6, 0, Math.PI * 2); ctx.fill();

    // Sprout on top
    ctx.fillStyle = '#448833';
    ctx.beginPath();
    ctx.ellipse(x, y - ry * 0.9, rx * 0.15, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#336622';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Sprout leaves
    ctx.fillStyle = '#55aa44';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.12, y - ry * 1.05, rx * 0.12, ry * 0.08, -0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + rx * 0.12, y - ry * 1.0, rx * 0.1, ry * 0.07, 0.8, 0, Math.PI * 2); ctx.fill();
  },

  _drawFries(ctx, x, y, rx, ry, s, def) {
    // Body: elongated with vertical fry-stripes
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.7, ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Vertical "fry" stripes
    ctx.strokeStyle = def.outline + '99';
    ctx.lineWidth = 1.5;
    for (let i = -3; i <= 3; i++) {
      const fx = x + i * rx * 0.18;
      ctx.beginPath();
      ctx.moveTo(fx, y - ry * 0.75);
      ctx.bezierCurveTo(fx - rx * 0.05, y, fx + rx * 0.05, y + ry * 0.3, fx, y + ry * 0.8);
      ctx.stroke();
    }

    // Crispy tips ( golden edges )
    ctx.fillStyle = '#ffcc44';
    ctx.beginPath(); ctx.ellipse(x, y - ry * 0.85, rx * 0.4, ry * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + ry * 0.85, rx * 0.4, ry * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  },

  _drawSweetPotato(ctx, x, y, rx, ry, s, def) {
    // Wider, slightly flattened shape
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.8, y - ry * 0.2);
    ctx.bezierCurveTo(x - rx, y - ry * 0.6, x, y - ry * 0.9, x + rx * 0.7, y - ry * 0.4);
    ctx.bezierCurveTo(x + rx, y, x + rx * 0.6, y + ry * 0.8, x, y + ry * 0.85);
    ctx.bezierCurveTo(x - rx * 0.6, y + ry * 0.7, x - rx * 0.9, y + ry * 0.2, x - rx * 0.8, y - ry * 0.2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Characteristic sweet potato spots
    ctx.fillStyle = '#aa5522aa';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.2, y + ry * 0.1, rx * 0.18, ry * 0.12, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + rx * 0.35, y - ry * 0.15, rx * 0.14, ry * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + ry * 0.35, rx * 0.1, ry * 0.08, 0.5, 0, Math.PI * 2); ctx.fill();

    // Small stem
    ctx.fillStyle = '#664422';
    ctx.beginPath(); ctx.ellipse(x, y - ry * 0.85, rx * 0.08, ry * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  },

  _drawChips(ctx, x, y, rx, ry, s, def) {
    // Very flat, wave-like shape
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.9, y - ry * 0.2);
    ctx.quadraticCurveTo(x - rx * 0.4, y - ry * 0.5, x, y - ry * 0.15);
    ctx.quadraticCurveTo(x + rx * 0.5, y + ry * 0.2, x + rx * 0.9, y - ry * 0.1);
    ctx.quadraticCurveTo(x + rx * 0.5, y + ry * 0.5, x, y + ry * 0.25);
    ctx.quadraticCurveTo(x - rx * 0.5, y + ry * 0.4, x - rx * 0.9, y - ry * 0.2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Ridge lines for "crisp" look
    ctx.strokeStyle = def.outline + '77';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x - rx * 0.5, y - ry * 0.05); ctx.quadraticCurveTo(x, y + ry * 0.15, x + rx * 0.5, y - ry * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - rx * 0.3, y + ry * 0.05); ctx.quadraticCurveTo(x, y + ry * 0.3, x + rx * 0.3, y + ry * 0.05); ctx.stroke();

    // Golden crispy edges
    ctx.strokeStyle = '#ffdd66';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - rx * 0.6, y, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + rx * 0.5, y - ry * 0.1, 2.5, 0, Math.PI * 2); ctx.stroke();
  },

  _drawGolden(ctx, x, y, rx, ry, s, def) {
    // Shiny golden body with star sparkle
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;

    // Glow behind
    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 25 + Math.sin(Date.now() / 200) * 10;
    ctx.beginPath();
    ctx.ellipse(x, y, rx + 5, ry + 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,215,0,0.15)';
    ctx.fill();
    ctx.restore();

    // Body
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Shine spot
    ctx.fillStyle = '#fff8';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.25, y - ry * 0.25, rx * 0.2, ry * 0.15, -0.5, 0, Math.PI * 2); ctx.fill();

    // Star sparkles
    const t = Date.now() / 300;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
      const angle = t + i * 1.2;
      const dist = rx + 6 + Math.sin(t * 2 + i) * 3;
      const sx2 = x + Math.cos(angle) * dist;
      const sy2 = y + Math.sin(angle) * dist;
      ctx.beginPath(); ctx.arc(sx2, sy2, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    // Gold crown hint
    ctx.fillStyle = '#ffee44';
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.35, y - ry * 0.55);
    ctx.lineTo(x - rx * 0.2, y - ry * 0.85);
    ctx.lineTo(x, y - ry * 0.65);
    ctx.lineTo(x + rx * 0.2, y - ry * 0.85);
    ctx.lineTo(x + rx * 0.35, y - ry * 0.55);
    ctx.closePath();
    ctx.fill();
  },

  _drawShadow(ctx, x, y, rx, ry, s, def) {
    // Dark body with purple aura
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(Date.now() / 400) * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(rx, ry) + 16, 0, Math.PI * 2);
    ctx.fillStyle = '#4400aa';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Smoke wisps
    ctx.strokeStyle = '#6600aa88';
    ctx.lineWidth=1;
    const t = Date.now()/500;
    ctx.beginPath();
    ctx.moveTo(x-rx, y-ry*0.3);
    ctx.quadraticCurveTo(x-rx*1.4, y-ry*0.8+Math.sin(t)*3, x-rx*0.6, y-ry*1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x+rx*0.8, y-ry*0.5);
    ctx.quadraticCurveTo(x+rx*1.3, y-ry*0.2+Math.sin(t+1)*3, x+rx*0.9, y+ry*0.3);
    ctx.stroke();
  },

  _drawRainbow(ctx, x, y, rx, ry, s, def) {
    const t = Date.now() / 60;
    // Rainbow gradient body
    const grad = ctx.createRadialGradient(x - rx*0.2, y - ry*0.2, 2, x, y, Math.max(rx, ry));
    grad.addColorStop(0, '#ff6666');
    grad.addColorStop(0.2, '#ffaa44');
    grad.addColorStop(0.4, '#ffdd44');
    grad.addColorStop(0.6, '#44dd88');
    grad.addColorStop(0.8, '#4488ff');
    grad.addColorStop(1, '#aa44ff');
    ctx.fillStyle = grad;
    ctx.strokeStyle = `hsl(${t % 360}, 60%, 60%)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Shimmer ring
    ctx.save();
    ctx.strokeStyle = `hsl(${(t+180)%360}, 80%, 70%)`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.ellipse(x, y, rx + 6, ry + 6, t/20, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },

  _drawDevil(ctx, x, y, rx, ry, s, def) {
    // Body
    ctx.fillStyle = def.body;
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Horns — curved, more detailed
    ctx.fillStyle = '#330000';
    ctx.strokeStyle = '#550000';
    ctx.lineWidth = 1;
    // Left horn
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.5, y - ry * 0.5);
    ctx.quadraticCurveTo(x - rx * 1.1, y - ry * 1.4, x - rx * 0.6, y - ry * 1.6);
    ctx.quadraticCurveTo(x - rx * 0.3, y - ry * 1.3, x - rx * 0.2, y - ry * 0.55);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Right horn
    ctx.beginPath();
    ctx.moveTo(x + rx * 0.5, y - ry * 0.5);
    ctx.quadraticCurveTo(x + rx * 1.1, y - ry * 1.4, x + rx * 0.6, y - ry * 1.6);
    ctx.quadraticCurveTo(x + rx * 0.3, y - ry * 1.3, x + rx * 0.2, y - ry * 0.55);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Small tail
    ctx.strokeStyle = def.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + rx * 0.8, y + ry * 0.3);
    ctx.quadraticCurveTo(x + rx * 1.3, y + ry * 0.1, x + rx * 1.1, y + ry * 0.6);
    ctx.quadraticCurveTo(x + rx * 1.0, y + ry * 0.9, x + rx * 1.2, y + ry * 0.8);
    ctx.stroke();
    // Tail tip (arrow shape)
    ctx.fillStyle = def.outline;
    ctx.beginPath();
    ctx.moveTo(x + rx * 1.2, y + ry * 0.75);
    ctx.lineTo(x + rx * 1.35, y + ry * 0.85);
    ctx.lineTo(x + rx * 1.15, y + ry * 0.9);
    ctx.closePath(); ctx.fill();

    // Fire aura (subtle)
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(Date.now()/300)*0.1;
    ctx.beginPath(); ctx.ellipse(x, y+ry*0.5, rx*1.2, ry*0.4, 0, 0, Math.PI*2);
    ctx.fillStyle = '#ff4400'; ctx.fill();
    ctx.restore();
  },

  _drawEyes(ctx, x, y, s, style) {
    const eyeOffset = s * 0.28;
    const eyeY = y - s * 0.12;
    const eyeSize = Math.max(2, s * 0.12);
    const pupilSize = Math.max(1, eyeSize * 0.45);

    if (style === 'red') {
      // Glowing red eyes for shadow
      ctx.fillStyle = '#ff2222';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Pupils
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, pupilSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, pupilSize, 0, Math.PI * 2); ctx.fill();
    } else if (style === 'angry') {
      // Angry slanted eyes for devil
      ctx.fillStyle = '#ffddaa';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.8;
      // Left eye (slanted \\)
      ctx.beginPath(); ctx.moveTo(x - eyeOffset - eyeSize, eyeY - eyeSize*0.5); ctx.lineTo(x - eyeOffset + eyeSize, eyeY + eyeSize*0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - eyeOffset - eyeSize, eyeY + eyeSize*0.5); ctx.lineTo(x - eyeOffset + eyeSize, eyeY - eyeSize*0.5); ctx.stroke();
      // Right eye
      ctx.beginPath(); ctx.moveTo(x + eyeOffset - eyeSize, eyeY - eyeSize*0.5); ctx.lineTo(x + eyeOffset + eyeSize, eyeY + eyeSize*0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + eyeOffset - eyeSize, eyeY + eyeSize*0.5); ctx.lineTo(x + eyeOffset + eyeSize, eyeY - eyeSize*0.5); ctx.stroke();
    } else if (style === 'shine') {
      // Golden shine eyes
      ctx.fillStyle = '#fff8cc';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cc9900';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, pupilSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, pupilSize, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - eyeOffset + 1, eyeY - 1, eyeSize * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset + 1, eyeY - 1, eyeSize * 0.25, 0, Math.PI * 2); ctx.fill();
    } else if (style === 'star') {
      // Star-shaped pupils for rainbow
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${(Date.now()/10)%360}, 80%, 50%)`;
      this._drawStar(ctx, x - eyeOffset, eyeY, 4, eyeSize * 0.5, eyeSize * 0.25);
      this._drawStar(ctx, x + eyeOffset, eyeY, 4, eyeSize * 0.5, eyeSize * 0.25);
    } else if (style === 'squint') {
      // Squinted happy eyes (like ^ ^)
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, eyeSize * 0.8, -0.8, -0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, eyeSize * 0.8, -0.8, -0.2); ctx.stroke();
    } else if (style === 'wide') {
      // Wide excited eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, eyeSize * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, eyeSize * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(x - eyeOffset + 0.5, eyeY, eyeSize * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset + 0.5, eyeY, eyeSize * 0.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // Normal eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(x - eyeOffset, eyeY, pupilSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset, eyeY, pupilSize, 0, Math.PI * 2); ctx.fill();
      // Eye shine
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - eyeOffset + 1, eyeY - 1, Math.max(0.8, eyeSize * 0.2), 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eyeOffset + 1, eyeY - 1, Math.max(0.8, eyeSize * 0.2), 0, Math.PI * 2); ctx.fill();
    }
  },

  _drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
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