// ============================================================
// WEAPONS.JS — Weapon instances & auto-attack logic
// ============================================================
const WeaponSystem = {
  create(defKey, tier = 0) {
    const def = CONFIG.WEAPON_DEFS[defKey];
    if (!def) return null;
    return { defKey, tier, cooldown: 0, angle: 0, swingProgress: -1, def: { ...def } };
  },

  addWeapon(player, weapon) {
    if (!weapon) return;
    if (player.weapons.length >= CONFIG.PLAYER.MAX_WEAPONS) {
      player.weapons.shift(); // Drop oldest weapon
    }
    player.weapons.push(weapon);
  },

  update(weapons, player, enemies, dt) {
    for (const w of weapons) {
      w.cooldown -= dt;
      if (w.swingProgress >= 0) {
        w.swingProgress += dt * (w.def.attackSpeed * (1 + (player.stats.attackSpeed || 0) / 100)) * 3;
        if (w.swingProgress >= 1) w.swingProgress = -1;
      }
      if (w.cooldown > 0) continue;

      // Find nearest enemy in range
      const range = w.def.range + (w.def.type === 'melee' ? player.size : 0);
      let nearest = null, nearestDist = Infinity;
      for (const e of enemies) {
        const dist = Utils.vecDist(player, e);
        if (dist < range && dist < nearestDist) { nearest = e; nearestDist = dist; }
      }
      if (!nearest) continue;

      const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
      w.angle = angle;
      const atkSpeedMult = 1 + (player.stats.attackSpeed || 0) / 100;
      w.cooldown = 1 / (w.def.attackSpeed * atkSpeedMult);

      if (w.def.type === 'ranged') {
        const spawnDist = player.size + 5;
        const sx = player.x + Math.cos(angle) * spawnDist;
        const sy = player.y + Math.sin(angle) * spawnDist;
        ProjectileSystem.spawnPlayer(sx, sy, angle, w.def, w.tier, player.stats);
        if (w.defKey === 'shotgun') SFX.shotgun();
        else SFX.shoot(w.defKey === 'smg' ? 1.3 : w.defKey === 'sniper' ? 0.6 : 1);
      } else {
        // Melee attack
        w.swingProgress = 0;
        SFX.melee();
        this._meleeHit(player, w, enemies);
      }
    }
  },

  _meleeHit(player, weapon, enemies) {
    const dmgMult = 1 + (player.stats.damagePercent || 0) / 100;
    const flatDmg = player.stats.meleeDamage || 0;
    let baseDmg = (weapon.def.baseDamage + weapon.def.baseDamage * weapon.tier * 0.5 + flatDmg) * dmgMult;
    let isCrit = false;
    if (Math.random() * 100 < (player.stats.critChance || 5)) { baseDmg *= 1.8; isCrit = true; }

    const range = weapon.def.range + player.size;
    const arc = weapon.def.arc;
    const isHost = !Multiplayer.connected || Multiplayer.isHost;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (Utils.pointInArc(e, player, weapon.angle, arc, range)) {
        const dir = Utils.vecNormalize(Utils.vecSub(e, player));
        if (isHost) {
          // Host applies damage directly
          e.takeDamage(baseDmg, dir, weapon.def.knockback, isCrit);
          // Send damage text to client
          if (Multiplayer.connected) {
            Multiplayer.send({ type: 'damageText', x: e.x, y: e.y - e.size, text: (isCrit ? '💥 ' : '') + '-' + Math.round(baseDmg), color: isCrit ? CONFIG.COLORS.CRIT_COLOR : '#fff', size: isCrit ? 24 : 16, particle: !e.alive ? 'death' : 'hit', particleColor: e.color });
          }
        } else {
          // Client sends damage to host
          Multiplayer.send({
            type: 'dealDamage',
            enemyIdx: i,
            damage: baseDmg,
            dir: { x: dir.x, y: dir.y },
            knockback: weapon.def.knockback,
            isCrit: isCrit
          });
          // Local feedback
          if (isCrit) FloatingText.add(e.x, e.y - e.size, '💥', CONFIG.COLORS.CRIT_COLOR, 20);
          FloatingText.add(e.x, e.y - e.size, '-' + Math.round(baseDmg), isCrit ? CONFIG.COLORS.CRIT_COLOR : '#fff', isCrit ? 24 : 16);
          ParticleSystem.hit(e.x, e.y, e.color);
        }
      }
    }
  },

  renderMeleeSwing(ctx, camera, player, weapons) {
    
    for (const w of weapons) {
      if (w.def.type !== 'melee' || w.swingProgress < 0) continue;
      const zoom = camera.zoom || 1; const px = (player.x - camera.x) * zoom + ctx.canvas.width / 2;
      const py = (player.y - camera.y) * zoom + ctx.canvas.height / 2;
      const range = (w.def.range + player.size) * zoom;
      const arc = w.def.arc;
      const progress = Utils.easeOutQuad(w.swingProgress);
      const startAngle = w.angle - arc / 2;
      const sweepAngle = arc * progress;

      ctx.save();
      ctx.globalAlpha = 0.4 * (1 - w.swingProgress);
      // Glow effect
      const grad = ctx.createRadialGradient(px, py, player.size * zoom, px, py, range);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, Utils.colorWithAlpha('#88ccff', 0.3));
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, range, startAngle, startAngle + sweepAngle);
      ctx.closePath();
      ctx.fill();

      // Edge line
      ctx.strokeStyle = '#aaddff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * (1 - w.swingProgress);
      const edgeAngle = startAngle + sweepAngle;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(edgeAngle) * range, py + Math.sin(edgeAngle) * range);
      ctx.stroke();
      ctx.restore();
    }
  }
};
