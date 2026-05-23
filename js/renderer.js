// ============================================================
// RENDERER.JS — Canvas rendering for Potato Dungeons (with zoom)
// Formula: screenX = (worldX - camera.x) * zoom + canvas.width/2
// ============================================================
const Renderer = {
  canvas: null, ctx: null,
  camera: { x: 0, y: 0, shakeX: 0, shakeY: 0, shakeMagnitude: 0, zoom: 1.0, targetZoom: 1.0 },
  damageFlash: 0, time: 0,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._dpr = Math.min(window.devicePixelRatio || 1, 3); // Cap at 3x for performance
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this._dpr = dpr;
    this._width = w; this._height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas._cssWidth = w;
    this.canvas._cssHeight = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  updateCamera(target, dt) {
    // Use actual room dimensions if available
    const rw = Dungeon.room?.pixelWidth || CONFIG.ROOM_WIDTH;
    const rh = Dungeon.room?.pixelHeight || CONFIG.ROOM_HEIGHT;
    // Room center as soft anchor, with player influence
    const roomCx = rw / 2;
    const roomCy = rh / 2;
    const camTarget = {
      x: roomCx + (target.x - roomCx) * 0.4,
      y: roomCy + (target.y - roomCy) * 0.4
    };
    this.camera.x = Utils.lerp(this.camera.x, camTarget.x, 8 * dt);
    this.camera.y = Utils.lerp(this.camera.y, camTarget.y, 8 * dt);
    this.camera.zoom = Utils.lerp(this.camera.zoom, this.camera.targetZoom, CONFIG.CAMERA.SMOOTH_SPEED * dt);
    this.time += dt;
    if (this.camera.shakeMagnitude > 0.1) {
      this.camera.shakeX = Utils.rand(-this.camera.shakeMagnitude, this.camera.shakeMagnitude);
      this.camera.shakeY = Utils.rand(-this.camera.shakeMagnitude, this.camera.shakeMagnitude);
      this.camera.shakeMagnitude *= Math.pow(0.01, dt);
    } else { this.camera.shakeX = 0; this.camera.shakeY = 0; this.camera.shakeMagnitude = 0; }
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 4);
  },

  shake(amount) { this.camera.shakeMagnitude = Math.max(this.camera.shakeMagnitude, amount); },
  flashDamage() { this.damageFlash = 1; },
  setZoom(zoom) { this.camera.targetZoom = Utils.clamp(zoom, CONFIG.CAMERA.MIN_ZOOM, CONFIG.CAMERA.MAX_ZOOM); },
  getCameraWithShake() { return { x: this.camera.x + this.camera.shakeX, y: this.camera.y + this.camera.shakeY, zoom: this.camera.zoom }; },

  renderDamageFlash(ctx) {
    if (this.damageFlash <= 0) return;
    ctx.fillStyle = `rgba(255, 50, 50, ${this.damageFlash * 0.35})`;
    ctx.fillRect(0, 0, this._width, this._height);
  },

  renderVignette(ctx) {
    const w = this._width, h = this._height;
    const grad = ctx.createRadialGradient(w/2, h/2, w*0.25, w/2, h/2, w*0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },

  renderHUD(ctx, player) {
    const w = this._width, h = this._height;
    const pad = 15;
    const isMobile = Input.isMobile();

    // Floor indicator (top center)
    ctx.textAlign = 'center';
    ctx.font = `bold ${isMobile ? 16 : 20}px 'Outfit', sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    const floorNum = Dungeon.currentFloor;
    const theme = Dungeon.getTheme(floorNum);
    const isBoss = floorNum % CONFIG.TOWER.BOSS_EVERY === 0;
    const floorText = isBoss ? `⚔️ BOSS Ebene ${floorNum}` : `🏰 Ebene ${floorNum}`;
    ctx.fillText(floorText, w / 2, isMobile ? 30 : 28);
    ctx.font = `${isMobile ? 11 : 13}px 'Outfit', sans-serif`;
    ctx.fillStyle = '#aaa';
    ctx.fillText(`${theme.name}  👾 ${EnemySystem.enemies.length}`, w / 2, isMobile ? 48 : 48);
    ctx.shadowBlur = 0;

    // HP Bar
    const hpBarW = Math.min(280, w * 0.55);
    const hpBarH = isMobile ? 14 : 16;
    const hpX = (w - hpBarW) / 2, hpY = pad + (isMobile ? 48 : 50);
    const hpPct = player.hp / player.getMaxHp();
    const hpColor = hpPct > 0.5 ? CONFIG.COLORS.HEALTH_HIGH : hpPct > 0.25 ? CONFIG.COLORS.HEALTH_MID : CONFIG.COLORS.HEALTH_LOW;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._roundRect(ctx, hpX - 3, hpY - 3, hpBarW + 6, hpBarH + 6, 8); ctx.fill();
    if (hpPct > 0) {
      ctx.save();
      this._roundRect(ctx, hpX, hpY, hpBarW * hpPct, hpBarH, 5); ctx.clip();
      const hpGrad = ctx.createLinearGradient(hpX, hpY, hpX, hpY + hpBarH);
      hpGrad.addColorStop(0, hpColor); hpGrad.addColorStop(1, Utils.colorWithAlpha(hpColor, 0.7));
      ctx.fillStyle = hpGrad; ctx.fillRect(hpX, hpY, hpBarW * hpPct, hpBarH);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(hpX, hpY, hpBarW * hpPct, hpBarH * 0.4);
      ctx.restore();
    }
    ctx.fillStyle = '#fff'; ctx.font = `bold ${isMobile ? 11 : 12}px 'Outfit', sans-serif`;
    ctx.fillText(`❤️ ${Math.ceil(player.hp)} / ${player.getMaxHp()}`, w / 2, hpY + hpBarH - 3);

    // XP Bar
    const xpY = hpY + hpBarH + 4;
    const xpBarW = Math.min(160, w * 0.3);
    const xpBarH = isMobile ? 4 : 6;
    const xpX = (w - xpBarW) / 2;
    const xpPct = player.xp / player.xpToLevel;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this._roundRect(ctx, xpX - 1, xpY - 1, xpBarW + 2, xpBarH + 2, 4); ctx.fill();
    if (xpPct > 0) {
      ctx.save();
      this._roundRect(ctx, xpX, xpY, xpBarW * xpPct, xpBarH, 3); ctx.clip();
      const xpGrad = ctx.createLinearGradient(xpX, xpY, xpX + xpBarW * xpPct, xpY);
      xpGrad.addColorStop(0, '#6688ff'); xpGrad.addColorStop(1, '#aa88ff');
      ctx.fillStyle = xpGrad; ctx.fillRect(xpX, xpY, xpBarW * xpPct, xpBarH);
      ctx.restore();
    }
    ctx.fillStyle = '#aaccff'; ctx.font = `bold ${isMobile ? 9 : 10}px 'Outfit', sans-serif`;
    ctx.fillText(`Lv.${player.level}`, w / 2, xpY + xpBarH);

    // Kills
    ctx.textAlign = 'right';
    ctx.font = `bold ${isMobile ? 13 : 15}px 'Outfit', sans-serif`;
    ctx.fillStyle = '#ff6666';
    ctx.fillText(`💀 ${player.kills}`, w - pad, isMobile ? 35 : 30);
    ctx.textAlign = 'left';

    // Weapon slots (bottom left)
    const slotSize = isMobile ? 46 : 42;
    const slotPad = 5;
    const slotsY = h - pad - slotSize;
    for (let i = 0; i < player.weapons.length; i++) {
      const w2 = player.weapons[i];
      const sx = pad + i * (slotSize + slotPad);
      const level = (w2.tier || 0) + 1;
      const tierColors = ['#888', '#44cc66', '#4488ff', '#bb55ee', '#ff8800', '#ff4444', '#ff2222', '#ff00ff'];
      const tierColor = tierColors[Math.min(w2.tier, tierColors.length - 1)];
      ctx.fillStyle = 'rgba(10,9,20,0.75)'; ctx.strokeStyle = tierColor; ctx.lineWidth = 2;
      this._roundRect(ctx, sx, slotsY, slotSize, slotSize, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = Utils.colorWithAlpha(tierColor, 0.08);
      this._roundRect(ctx, sx + 1, slotsY + 1, slotSize - 2, slotSize - 2, 7); ctx.fill();
      ctx.save(); ctx.translate(sx + slotSize / 2, slotsY + slotSize / 2);
      ctx.scale(slotSize / 44, slotSize / 44);
      Player._drawWeaponShape(ctx, w2, player);
      ctx.restore();
      // Level badge
      ctx.fillStyle = tierColor;
      this._roundRect(ctx, sx + 1, slotsY + slotSize - 13, 24, 13, 3); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `bold ${isMobile ? 9 : 9}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`Lv${level}`, sx + 13, slotsY + slotSize - 3);
      ctx.textAlign = 'left';
    }
  },

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
};