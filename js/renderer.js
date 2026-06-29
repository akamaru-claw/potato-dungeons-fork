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

    // Theme name + live enemy count — the DOM #hud (see UI.updateHUD) already
    // covers floor/HP/XP/kills, so only draw the info that has no DOM equivalent.
    ctx.textAlign = 'center';
    ctx.font = `${isMobile ? 11 : 13}px 'Outfit', sans-serif`;
    ctx.fillStyle = '#aaa';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    const floorNum = Dungeon.currentFloor;
    const theme = Dungeon.getTheme(floorNum);
    ctx.fillText(`${theme.name}  👾 ${EnemySystem.enemies.length}`, w / 2, isMobile ? 30 : 28);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // Update DOM dash button state instead of drawing on canvas
    if (isMobile) {
      const dashBtn = document.getElementById('mobile-dash-btn');
      if (dashBtn) {
        const dashCD = Math.max(0, player.dashCooldown || 0);
        dashBtn.classList.toggle('cooldown', dashCD > 0);
      }
    }

    // Weapon slots (bottom left)
    const slotSize = isMobile ? 46 : 42;
    const slotPad = 5;
    const slotsOffsetX = isMobile ? 56 + pad + 8 : 0; // space for dash button
    const slotsY = h - pad - slotSize;
    for (let i = 0; i < player.weapons.length; i++) {
      const w2 = player.weapons[i];
      const sx = pad + slotsOffsetX + i * (slotSize + slotPad);
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