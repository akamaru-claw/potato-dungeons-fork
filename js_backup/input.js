// ============================================================
// INPUT.JS — Keyboard, Mouse & Touch Input — PREMIUM MOBILE v3
// Full-screen touch + pinch-to-zoom + joystick + aim
// ============================================================
const Input = {

  // Check if a click/tap hit a weapon slot in the HUD
  _checkWeaponSlotClick(screenX, screenY) {
    if (!Game.player || !Game.player.weapons || Game.player.weapons.length === 0) return false;
    const isMobile = this.isMobile();
    const slotSize = isMobile ? 46 : 42;
    const slotPad = 5;
    const pad = 15;
    const canvas = this._canvas;
    const h = canvas.height;
    const slotsY = h - pad - slotSize;

    for (let i = 0; i < Game.player.weapons.length; i++) {
      const sx = pad + i * (slotSize + slotPad);
      if (screenX >= sx && screenX <= sx + slotSize && screenY >= slotsY && screenY <= slotsY + slotSize) {
        const panel = document.getElementById('weapon-panel');
        // Toggle: close if same weapon, open if different
        if (panel && panel.style.display !== 'none' && panel.dataset.weaponKey === Game.player.weapons[i].defKey && panel.dataset.weaponTier == Game.player.weapons[i].tier) {
          UI.hideWeaponPanel();
        } else {
          UI.showWeaponPanel(Game.player.weapons[i]);
        }
        return true;
      }
    }
    return false;
  },
  keys: {},
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
  _canvas: null,

  touch: {
    active: false,
    joystickX: 0, joystickY: 0,
    touchId: null,
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    baseRadius: 55, knobRadius: 26,
    deadzone: 10, maxDist: 60,
    opacity: 0, targetOpacity: 0,
  },

  aim: {
    active: false,
    touchId: null,
    x: 0, y: 0,
  },

  pinch: {
    active: false,
    startDist: 0,
    startZoom: 1,
  },

  isMobile() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  },

  init(canvas) {
    this._canvas = canvas;
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' && (Game.state === 'PLAYING' || Game.state === 'PAUSED')) {
        Game.togglePause();
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') Renderer.setZoom(Renderer.camera.targetZoom + 0.1);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') Renderer.setZoom(Renderer.camera.targetZoom - 0.1);
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', e => {
      this.mouse.down = true;
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      // Check weapon slot clicks
      if (Game.state === 'PLAYING' && Game.player) {
        this._checkWeaponSlotClick(this.mouse.x, this.mouse.y);
      }
    });
    canvas.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      Renderer.setZoom(Renderer.camera.targetZoom + delta);
    }, { passive: false });

    canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', e => this._onTouchEnd(e), { passive: false });
  },

  _onTouchStart(e) {
    e.preventDefault();
    if (Game.state !== 'PLAYING' && Game.state !== 'PAUSED') return;

    // Detect pinch start: 2+ fingers already on screen
    if (e.touches.length >= 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      this.pinch.active = true;
      this.pinch.startDist = dist;
      this.pinch.startZoom = Renderer.camera.targetZoom;
      // Cancel aim during pinch
      this.aim.active = false;
      this.aim.touchId = null;
      this.mouse.down = false;
      return;
    }

    const canvas = this._canvas;
    const rect = canvas.getBoundingClientRect();

    // Check weapon slot taps on first touch
    if (Game.state === 'PLAYING' && Game.player && e.changedTouches.length > 0) {
      const t0 = e.changedTouches[0];
      const tx = (t0.clientX - rect.left) * (canvas.width / rect.width);
      const ty = (t0.clientY - rect.top) * (canvas.height / rect.height);
      if (this._checkWeaponSlotClick(tx, ty)) return;
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;

      if (this.touch.touchId === null) {
        this.touch.touchId = t.identifier;
        this.touch.startX = tx;
        this.touch.startY = ty;
        this.touch.currentX = tx;
        this.touch.currentY = ty;
        this.touch.active = true;
        this.touch.targetOpacity = 1;
      } else if (this.aim.touchId === null) {
        this.aim.touchId = t.identifier;
        this.aim.active = true;
        this.aim.x = tx;
        this.aim.y = ty;
        this.mouse.x = tx * (canvas.width / rect.width);
        this.mouse.y = ty * (canvas.height / rect.height);
        this.mouse.down = true;
      }
    }
  },

  _onTouchMove(e) {
    e.preventDefault();

    // Pinch zoom with 2+ fingers
    if (e.touches.length >= 2 && this.pinch.active) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const scale = dist / this.pinch.startDist;
      Renderer.setZoom(this.pinch.startZoom * scale);
      return;
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.touch.touchId) {
        const rect = this._canvas.getBoundingClientRect();
        this.touch.currentX = t.clientX - rect.left;
        this.touch.currentY = t.clientY - rect.top;
      } else if (t.identifier === this.aim.touchId) {
        const rect = this._canvas.getBoundingClientRect();
        this.aim.x = t.clientX - rect.left;
        this.aim.y = t.clientY - rect.top;
        this.mouse.x = this.aim.x * (this._canvas.width / rect.width);
        this.mouse.y = this.aim.y * (this._canvas.height / rect.height);
      }
    }
  },

  _onTouchEnd(e) {
    e.preventDefault();

    if (e.touches.length < 2) {
      this.pinch.active = false;
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.touch.touchId) {
        this.touch.touchId = null;
        this.touch.active = false;
        this.touch.targetOpacity = 0;
        this.touch.joystickX = 0;
        this.touch.joystickY = 0;
      }
      if (t.identifier === this.aim.touchId) {
        this.aim.touchId = null;
        this.aim.active = false;
        this.mouse.down = false;
      }
    }
  },

  getMovement() {
    let dx = 0, dy = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dy = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dy = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx = 1;

    if (this.touch.active && dx === 0 && dy === 0) {
      const ddx = this.touch.currentX - this.touch.startX;
      const ddy = this.touch.currentY - this.touch.startY;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist > this.touch.deadzone) {
        const clampedDist = Math.min(dist, this.touch.maxDist);
        const normalDist = clampedDist / this.touch.maxDist;
        const smoothDist = normalDist * normalDist * (3 - 2 * normalDist);
        dx = (ddx / dist) * smoothDist;
        dy = (ddy / dist) * smoothDist;
        this.touch.joystickX = dx;
        this.touch.joystickY = dy;
      } else {
        this.touch.joystickX = 0;
        this.touch.joystickY = 0;
      }
    }

    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    return { x: dx, y: dy };
  },

  updateWorldMouse(camera) {
    const zoom = camera.zoom || 1;
    // Convert screen coords to world coords accounting for zoom
    const sx = this.mouse.x - this._canvas.width / 2;
    const sy = this.mouse.y - this._canvas.height / 2;
    this.mouse.worldX = camera.x + sx / zoom;
    this.mouse.worldY = camera.y + sy / zoom;
  },

  isPressed(code) { return !!this.keys[code]; },

  renderJoystick(ctx) {
    this.touch.opacity = Utils.lerp(this.touch.opacity, this.touch.targetOpacity, 0.15);
    if (this.touch.opacity < 0.01 && !this.touch.active) return;

    const canvas = this._canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const baseX = this.touch.startX * scaleX;
    const baseY = this.touch.startY * scaleY;
    const knobX = baseX + this.touch.joystickX * this.touch.maxDist * scaleX;
    const knobY = baseY + this.touch.joystickY * this.touch.maxDist * scaleY;
    const baseR = this.touch.baseRadius * scaleX;
    const knobR = this.touch.knobRadius * scaleX;
    const alpha = this.touch.opacity;

    ctx.save();
    ctx.globalAlpha = alpha;

    const grad1 = ctx.createRadialGradient(baseX, baseY, baseR * 0.6, baseX, baseY, baseR);
    grad1.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
    grad1.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
    ctx.beginPath();
    ctx.arc(baseX, baseY, baseR, 0, Math.PI * 2);
    ctx.fillStyle = grad1;
    ctx.fill();
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.25)';
    ctx.lineWidth = 2 * scaleX;
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dotX = baseX + Math.cos(angle) * (baseR * 0.75);
      const dotY = baseY + Math.sin(angle) * (baseR * 0.75);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2 * scaleX, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(167, 139, 250, 0.15)';
      ctx.fill();
    }

    const grad2 = ctx.createRadialGradient(knobX - 3 * scaleX, knobY - 3 * scaleY, 0, knobX, knobY, knobR);
    grad2.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    grad2.addColorStop(0.5, 'rgba(167, 139, 250, 0.5)');
    grad2.addColorStop(1, 'rgba(100, 80, 180, 0.35)');
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
    ctx.fillStyle = grad2;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5 * scaleX;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(knobX - 4 * scaleX, knobY - 4 * scaleY, knobR * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();

    ctx.restore();

    if (this.aim.active) {
      const aimX = this.aim.x * scaleX;
      const aimY = this.aim.y * scaleY;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ff6644';
      ctx.lineWidth = 2 * scaleX;
      const aimR = 15 * scaleX;
      ctx.beginPath();
      ctx.arc(aimX, aimY, aimR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(aimX - aimR - 5 * scaleX, aimY);
      ctx.lineTo(aimX - aimR + 5 * scaleX, aimY);
      ctx.moveTo(aimX + aimR - 5 * scaleX, aimY);
      ctx.lineTo(aimX + aimR + 5 * scaleX, aimY);
      ctx.moveTo(aimX, aimY - aimR - 5 * scaleX);
      ctx.lineTo(aimX, aimY - aimR + 5 * scaleX);
      ctx.moveTo(aimX, aimY + aimR - 5 * scaleX);
      ctx.lineTo(aimX, aimY + aimR + 5 * scaleX);
      ctx.stroke();
      ctx.restore();
    }
  }
};