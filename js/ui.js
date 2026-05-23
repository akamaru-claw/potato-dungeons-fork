// ============================================================
// UI.JS — Screen management for Potato Dungeons
// ============================================================
const UI = {
  _screens: {
    menu: 'screen-menu',
    game: null, // canvas only
    gameover: 'screen-gameover',
    pause: 'screen-pause',
    reward: 'screen-reward',
    lobby: 'screen-lobby',
    highscores: 'screen-highscores',
    login: 'screen-login',
    shop: 'screen-shop',
    howtoplay: 'screen-howtoplay',
    profile: 'screen-profile',
    changename: 'screen-changename',
    changepass: 'screen-changepass',
  },

  init() {
    document.getElementById('btn-play').addEventListener('click', () => Game.startGame());
    document.getElementById('btn-coop').addEventListener('click', () => this.showLobby());
    document.getElementById('btn-retry').addEventListener('click', () => Game.startGame());
    document.getElementById('btn-pause').addEventListener('click', () => Game.togglePause());
    // Weapon panel close
    document.getElementById('weapon-panel-close')?.addEventListener('click', () => {
      document.getElementById('weapon-panel').style.display = 'none';
    });
    document.getElementById('btn-resume').addEventListener('click', () => Game.resumeGame());
    document.getElementById('btn-pause-quit').addEventListener('click', () => {
      Game.state = 'MENU'; Game.player = null;
      Multiplayer.disconnect();
      this.showMenu();
    });
    // Highscore
    document.getElementById('btn-submit-score')?.addEventListener('click', () => this._submitScore());
    document.getElementById('input-playername')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitScore();
    });
    document.getElementById('btn-highscores')?.addEventListener('click', () => this.showHighscores());
    document.getElementById('btn-menu-highscores')?.addEventListener('click', () => this.showHighscores());
    document.getElementById('btn-howtoplay')?.addEventListener('click', () => this.showScreen('howtoplay'));
    document.getElementById('btn-howtoplay-back')?.addEventListener('click', () => this.showMenu());
    document.getElementById('btn-profile-back')?.addEventListener('click', () => this.showMenu());
    document.getElementById('btn-logout')?.addEventListener('click', () => this._handleLogout());
    document.getElementById('btn-change-name')?.addEventListener('click', () => this.showScreen('changename'));
    document.getElementById('btn-change-pass')?.addEventListener('click', () => this.showScreen('changepass'));
    document.getElementById('btn-changename-back')?.addEventListener('click', () => this.showScreen('profile'));
    document.getElementById('btn-changepass-back')?.addEventListener('click', () => this.showScreen('profile'));
    document.getElementById('btn-save-name')?.addEventListener('click', () => this._handleChangeName());
    document.getElementById('btn-save-pass')?.addEventListener('click', () => this._handleChangePass());
    document.getElementById('btn-shop')?.addEventListener('click', () => this.showShop());
    document.getElementById('btn-shop-back')?.addEventListener('click', () => this.showMenu());
    document.getElementById('btn-login-back')?.addEventListener('click', () => this.showMenu());
    document.getElementById('btn-login')?.addEventListener('click', () => this._handleLogin());
    document.getElementById('btn-register')?.addEventListener('click', () => this._handleRegister());
    document.getElementById('input-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._handleLogin(); });

    // Shop tabs
    document.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderShopItems(tab.dataset.tab);
      });
    });
    document.getElementById('btn-hs-back')?.addEventListener('click', () => {
      this.showMenu();
    });
    const savedName = localStorage.getItem('pd_playername');
    if (savedName) {
      const ni = document.getElementById('input-playername');
      if (ni) ni.value = savedName;
    }
    document.getElementById('btn-wc-upgrade')?.addEventListener('click', () => UI._chooseWeaponUpgrade());
    document.getElementById('btn-wc-new')?.addEventListener('click', () => UI._chooseWeaponNew());
    document.getElementById('btn-wc-cancel')?.addEventListener('click', () => {
      UI._pendingWeaponPickIndex = null;
      UI.hideWeaponChoiceDialog();
    });
    document.getElementById('btn-wrd-cancel')?.addEventListener('click', () => {
      UI.hideWeaponReplaceDialog();
    });
    // Lobby buttons
    document.getElementById('btn-host').addEventListener('click', () => this._hostRoom());
    document.getElementById('btn-join').addEventListener('click', () => this._joinRoom());
    document.getElementById('btn-lobby-back').addEventListener('click', () => {
      Multiplayer.disconnect();
      this.showMenu();
    });
  },

  async _hostRoom() {
    const statusEl = document.getElementById('lobby-status');
    statusEl.textContent = 'Erstelle Raum...';
    statusEl.className = 'lobby-status';

    try {
      const roomId = await Multiplayer.createRoom();
      document.getElementById('lobby-code').textContent = roomId;
      document.getElementById('lobby-room-code').style.display = 'flex';
      // Auto-copy room code
      try { await navigator.clipboard.writeText(roomId); } catch(e) {}
      statusEl.textContent = 'Warte auf Mitspieler... (Code kopiert!)';
      statusEl.className = 'lobby-status';

      Multiplayer.onConnect = () => {
        statusEl.textContent = '🤝 Verbunden! Starte Spiel...';
        statusEl.className = 'lobby-status success';
        setTimeout(() => {
          Game.startCoop();
        }, 800);
      };
      Multiplayer.onDisconnect = () => {
        statusEl.textContent = '⚠️ Mitspieler hat die Verbindung getrennt';
        statusEl.className = 'lobby-status error';
      };
    } catch(e) {
      statusEl.textContent = 'Fehler: ' + e.message;
      statusEl.className = 'lobby-status error';
    }
  },

  async _joinRoom() {
    const roomInput = document.getElementById('input-room');
    const roomId = roomInput.value.trim();
    if (roomId.length < 3) {
      roomInput.style.borderColor = '#ff4466';
      return;
    }

    const statusEl = document.getElementById('lobby-status');
    statusEl.textContent = 'Verbinde...';
    statusEl.className = 'lobby-status';

    try {
      await Multiplayer.joinRoom(roomId);
      statusEl.textContent = '🤝 Verbunden! Warte auf Host...';
      statusEl.className = 'lobby-status success';

      // When host starts the game, also start on client
      Multiplayer.onStartGame = (roomData) => {
        statusEl.textContent = '⚔️ Spiel startet!';
        statusEl.className = 'lobby-status success';
        setTimeout(() => {
          Game.startCoop(roomData);
        }, 300);
      };

      // When host goes to next floor, client follows
      Multiplayer.onNextFloor = (roomData) => {
        if (roomData) {
          const pxW = roomData.cols * roomData.tileWidth;
          const pxH = roomData.rows * roomData.tileWidth;
          Dungeon.currentFloor = roomData.floorNum || (Dungeon.currentFloor + 1);
          Dungeon.cleared = false;
          Dungeon.doorOpen = false;
          Dungeon.doorPos = roomData.doorPos;
          Dungeon.room = {
            tiles: roomData.tiles,
            cols: roomData.cols,
            rows: roomData.rows,
            tileWidth: roomData.tileWidth,
            theme: roomData.theme,
            isBoss: roomData.isBoss,
            wallColor: roomData.theme.wallColor,
            floorColor: roomData.theme.floorColor,
            pixelWidth: pxW,
            pixelHeight: pxH
          };
          CONFIG.ROOM_WIDTH = pxW;
          CONFIG.ROOM_HEIGHT = pxH;
          Game.player.hp = Game.player.getMaxHp();
          Game.player.x = pxW / 2;
          Game.player.y = pxH - CONFIG.WALL_THICKNESS - Game.player.size - 10;
          // Recalculate zoom for new room
          const fitZoomW = Renderer.canvas.width / pxW;
          const fitZoomH = Renderer.canvas.height / pxH;
          const mobileFactor = Input.isMobile() ? 0.78 : 0.85;
          const fitZoom = Math.min(fitZoomW, fitZoomH) * mobileFactor;
          Renderer.camera.targetZoom = Utils.clamp(fitZoom, CONFIG.CAMERA.MIN_ZOOM, CONFIG.CAMERA.MAX_ZOOM);
          Renderer.camera.x = Game.player.x;
          Renderer.camera.y = Game.player.y;
          Game.state = 'PLAYING';
          UI.showGame();
          UI.announceFloor(roomData.floorNum, roomData.isBoss);
        }
      };

      // When host shows reward screen
      Multiplayer.onShowReward = (choices) => {
        // Client also shows reward screen (simplified)
        const simpleChoices = choices.map(c => ({ ...c, stat: c.stat || 'damage', value: c.value || 5, percent: c.percent || false, weaponKey: c.weaponKey || '', healAmount: c.healAmount || 5 }));
        Game.state = 'REWARD';
        Game.pendingReward = simpleChoices;
        UI.showReward(simpleChoices);
      };

      Multiplayer.onDisconnect = () => {
        statusEl.textContent = '⚠️ Verbindung getrennt';
        statusEl.className = 'lobby-status error';
      };
    } catch(e) {
      statusEl.textContent = 'Raum nicht gefunden — Code falsch?';
      statusEl.className = 'lobby-status error';
    }
  },

  showLobby() { this.showScreen('lobby'); },

  showScreen(key) {
    this._hideAll();
    const el = document.getElementById(this._screens[key]);
    if (el) el.classList.add('active');
    if (key === 'game') {
      const pb = document.getElementById('btn-pause');
      if (pb) pb.classList.add('visible');
      const hud = document.getElementById('hud');
      if (hud) hud.style.display = 'flex';
    }
  },

  _hideAll() {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('btn-pause')?.classList.remove('visible');
    document.getElementById('weapon-bar').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('hud-dash').style.display = 'none';
    this.hideWeaponPanel();
    this.stopMenuCanvas();
  },

  // ==================== MENU CHARACTER PREVIEW ====================
  _menuChar: null,
  _menuCanvas: null,
  _menuCtx: null,
  _menuAnimId: null,
  _menuKeys: {},

  startMenuCanvas() {
    const canvas = document.getElementById('menu-canvas');
    if (!canvas) return;
    this._menuCanvas = canvas;
    canvas.width = 220;
    canvas.height = 140;
    this._menuCtx = canvas.getContext('2d');

    // Character state in menu
    this._menuChar = {
      x: 110,
      y: 70,
      vx: 0, vy: 0,
      bobTimer: 0,
    };

    // Keyboard input for menu
    this._menuKeys = {};
    window.addEventListener('keydown', (e) => { this._menuKeys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this._menuKeys[e.code] = false; });

    // Touch/joystick for menu
    let touchStart = null;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!touchStart) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      this._menuChar.vx = Math.max(-1, Math.min(1, dx / 40));
      this._menuChar.vy = Math.max(-1, Math.min(1, dy / 40));
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this._menuChar.vx = 0; this._menuChar.vy = 0; touchStart = null; });

    if (this._menuAnimId) cancelAnimationFrame(this._menuAnimId);
    this._menuLoop();
  },

  stopMenuCanvas() {
    if (this._menuAnimId) { cancelAnimationFrame(this._menuAnimId); this._menuAnimId = null; }
  },

  _menuLoop() {
    const ctx = this._menuCtx;
    const c = this._menuChar;
    if (!ctx || !c) { this._menuAnimId = requestAnimationFrame(() => this._menuLoop()); return; }

    // Input
    const keys = this._menuKeys;
    if (keys['KeyW'] || keys['ArrowUp']) c.vy = -1;
    else if (keys['KeyS'] || keys['ArrowDown']) c.vy = 1;
    else if (!('ontouchstart' in window)) c.vy *= 0.85;

    if (keys['KeyA'] || keys['ArrowLeft']) c.vx = -1;
    else if (keys['KeyD'] || keys['ArrowRight']) c.vx = 1;
    else if (!('ontouchstart' in window)) c.vx *= 0.85;

    // Normalize
    const len = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    const speed = 60;
    if (len > 0) {
      c.x += (c.vx / len) * speed * 0.016;
      c.y += (c.vy / len) * speed * 0.016;
    }
    // Bounds
    c.x = Math.max(20, Math.min(200, c.x));
    c.y = Math.max(20, Math.min(120, c.y));

    c.bobTimer += 0.08;

    // Draw
    ctx.clearRect(0, 0, 220, 140);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 220; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 140); ctx.stroke(); }
    for (let y = 0; y < 140; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(220, y); ctx.stroke(); }

    // Draw character
    const charKey = Account.selectedCharacter || 'potato_default';
    const skinKey = Account.skin || 'skin_default';
    if (typeof Player !== 'undefined' && Player._drawMenuChar) {
      Player._drawMenuChar(ctx, c.x, c.y, charKey, skinKey, c.bobTimer);
    } else {
      // Fallback: simple circle
      ctx.fillStyle = '#e8b84b';
      ctx.strokeStyle = '#c89830';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y + Math.sin(c.bobTimer * 5) * 2, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(c.x - 5, c.y + Math.sin(c.bobTimer * 5) * 2 - 3, 2, 0, Math.PI * 2); ctx.arc(c.x + 5, c.y + Math.sin(c.bobTimer * 5) * 2 - 3, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Draw trail
    if (Account.trail && Account.TRAILS && Account.TRAILS[Account.trail] && len > 0.1) {
      const trailDef = Account.TRAILS[Account.trail];
      const tColor = trailDef.color === 'rainbow' ? `hsl(${(Date.now()/8)%360},80%,60%)` : trailDef.color;
      for (let i = 1; i <= 5; i++) {
        ctx.globalAlpha = 1 - i * 0.18;
        ctx.fillStyle = tColor;
        ctx.beginPath();
        ctx.arc(c.x - (c.vx / len) * (20 + i * 6), c.y - (c.vy / len) * (20 + i * 6), 4 - i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Label
    const charDef = (typeof CONFIG !== 'undefined' && CONFIG.CHARACTERS) ? CONFIG.CHARACTERS[charKey] : null;
    if (charDef) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(charDef.icon + ' ' + charDef.name, 110, 136);
    }

    this._menuAnimId = requestAnimationFrame(() => this._menuLoop());
  },

  showMenu() { this.showScreen('menu'); this.updateMenuAccount(); this.startMenuCanvas(); },

  updateWeaponBar(player) {
    // Weapon display is now on canvas — just update the data ref
    // No HTML weapon bar needed
  },

  showWeaponPanel(weapon) {
    const panel = document.getElementById('weapon-panel');
    if (!panel) return;

    const def = CONFIG.WEAPON_DEFS[weapon.defKey];
    const level = (weapon.tier || 0) + 1;
    const currentDmg = weapon.def.baseDamage;
    const currentSpeed = weapon.def.attackSpeed;
    const currentRange = weapon.def.range;
    const player = Game.player;
    const critChance = player ? (5 + (player.stats.critChance || 0)) : 5;
    const critMult = 1.8;
    const effectiveDPS = currentDmg * currentSpeed * (1 + critChance / 100 * (critMult - 1));

    const tierColors = ['#888', '#44cc66', '#4488ff', '#bb55ee', '#ff8800', '#ff4444', '#ff2222', '#ff00ff'];
    const rarityColor = tierColors[Math.min(weapon.tier, tierColors.length - 1)];
    const rarityNames = ['Gewöhnlich', 'Ungewöhnlich', 'Selten', 'Episch', 'Legendär', 'Mythisch', 'Göttlich', 'Transzendent'];
    const rarityName = rarityNames[Math.min(weapon.tier, rarityNames.length - 1)];

    document.getElementById('weapon-panel-icon').textContent = weapon.def.icon || '⚔️';
    const nameEl = document.getElementById('weapon-panel-name');
    nameEl.textContent = `${def.name}`;
    nameEl.style.color = rarityColor;

    const isMelee = def.type === 'melee';
    const nextDmg = def.baseDamage * (1 + level * 0.5);
    const nextSpeed = def.attackSpeed * (1 + level * 0.08);

    const statsDiv = document.getElementById('weapon-panel-stats');
    statsDiv.innerHTML = `
      <div class="wp-level-badge" style="color:${rarityColor}">⭐ Level ${level} — ${rarityName}</div>
      <div class="wp-stat"><span class="wp-stat-label">⚔️ Schaden</span><span class="wp-stat-value" style="color:${currentDmg > def.baseDamage ? '#ffdd44' : ''}">${Math.round(currentDmg)}</span></div>
      <div class="wp-stat"><span class="wp-stat-label">⚡ Angriffe/Sek</span><span class="wp-stat-value">${currentSpeed.toFixed(2)}</span></div>
      <div class="wp-stat"><span class="wp-stat-label">💥 DPS</span><span class="wp-stat-value" style="color:#ff9944">${Math.round(effectiveDPS)}</span></div>
      <div class="wp-stat"><span class="wp-stat-label">📏 Reichweite</span><span class="wp-stat-value" style="color:${currentRange > def.range ? '#ffdd44' : ''}">${Math.round(currentRange)}</span></div>
      ${isMelee ? `<div class="wp-stat"><span class="wp-stat-label">📐 Schwungbogen</span><span class="wp-stat-value">${(def.arc * 180 / Math.PI).toFixed(0)}°</span></div>` : ''}
      ${!isMelee ? `<div class="wp-stat"><span class="wp-stat-label">🎯 Projektile</span><span class="wp-stat-value">${def.pellets || 1}</span></div>` : ''}
      ${def.pierce ? `<div class="wp-stat"><span class="wp-stat-label">🗡️ Durchschlag</span><span class="wp-stat-value">${def.pierce}</span></div>` : ''}
      <div class="wp-stat"><span class="wp-stat-label">🎯 Krit-Chance</span><span class="wp-stat-value">${critChance}%</span></div>
      <div class="wp-stat"><span class="wp-stat-label">💥 Krit-Schaden</span><span class="wp-stat-value">${critMult}x</span></div>
      <div class="wp-stat" style="margin-top:8px;font-size:11px;color:var(--text-dim);padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);">
        <span>⬆️ Nächstes Lv: ${Math.round(nextDmg)} Dmg, ${nextSpeed.toFixed(2)}/s</span>
      </div>
    `;

    panel.style.display = 'block';
    panel.dataset.weaponKey = weapon.defKey;
    panel.dataset.weaponTier = weapon.tier || 0;
  },

  hideWeaponPanel() {
    const panel = document.getElementById('weapon-panel');
    if (panel) panel.style.display = 'none';
  },
  showGame() {
    this._hideAll();
    document.getElementById('btn-pause')?.classList.add('visible');
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('hud-dash').style.display = 'block';
    const bar = document.getElementById('weapon-bar');
    if (bar) bar.style.display = 'flex';
  },
  showGameOver(player, floorNum) {
    this.showScreen('gameover');
    // Reset highscore UI
    document.getElementById('highscore-submit').style.display = 'flex';
    document.getElementById('highscore-saved').style.display = 'none';
    const mins = Math.floor((player.timeSurvived || 0) / 60);
    const secs = Math.floor((player.timeSurvived || 0) % 60);
    const relicNames = (player.relics || []).map(r => (CONFIG.RELIC_DEFS?.[r.key]?.icon || '') + ' ' + (CONFIG.RELIC_DEFS?.[r.key]?.name || r.key)).join(', ');
    const weaponNames = player.weapons.map(w => w.def.icon + ' ' + w.def.name + ' Lv.' + (w.tier + 1)).join(', ');
    document.getElementById('gameover-floor').textContent = `Ebene ${floorNum}`;
    document.getElementById('gameover-stats').innerHTML = `
      <div class="endscreen-stat"><span>💀 Kills</span><strong>${player.kills}</strong></div>
      <div class="endscreen-stat"><span>🏰 Ebene</span><strong>${floorNum}</strong></div>
      <div class="endscreen-stat"><span>⏱️ Zeit</span><strong>${mins}:${secs < 10 ? '0' : ''}${secs}</strong></div>
      <div class="endscreen-stat"><span>💰 Gold</span><strong>${player.gold || 0}</strong></div>
      <div class="endscreen-stat"><span>🔥 Streak</span><strong>${player.maxKillStreak || 0}</strong></div>
      <div class="endscreen-stat"><span>⚔️ Waffen</span><strong>${player.weapons.length}</strong></div>
      ${weaponNames ? `<div class="endscreen-detail"><span>Waffen:</span> ${weaponNames}</div>` : ''}
      ${relicNames ? `<div class="endscreen-detail"><span>Relikte:</span> ${relicNames}</div>` : ''}
    `;
    this._lastScore = { floor: floorNum, kills: player.kills, weapons: player.weapons.length };

    // Save gold to account
    if (Account.loggedIn) {
      Account.saveProgress(player, floorNum);
    }
  },

  _submitScore() {
    const nameInput = document.getElementById('input-playername');
    const name = (nameInput?.value || '').trim();
    if (!name) {
      nameInput?.focus();
      return;
    }
    if (!this._lastScore) {
      console.error('No score data to submit');
      return;
    }

    localStorage.setItem('pd_playername', name);
    const btn = document.getElementById('btn-submit-score');
    if (btn) btn.textContent = '⏳...';

    fetch('highscore_api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        floor: this._lastScore.floor,
        kills: this._lastScore.kills,
        weapons: this._lastScore.weapons,
        mode: Multiplayer.connected ? 'coop' : 'solo'
      })
    })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      if (data.ok) {
        document.getElementById('highscore-submit').style.display = 'none';
        document.getElementById('highscore-saved').style.display = 'block';
        document.getElementById('highscore-rank').textContent = data.rank ? `Platz ${data.rank}!` : '';
      }
    })
    .catch(e => {
      console.error('Highscore save failed:', e);
      if (btn) btn.textContent = '❌ Fehler';
      setTimeout(() => { if (btn) btn.textContent = '💾 Speichern'; }, 2000);
    });
  },

  showHighscores() {
    this.showScreen('highscores');

    const listEl = document.getElementById('highscore-list');
    if (!listEl) { console.error('highscore-list element missing!'); return; }
    listEl.innerHTML = '<div class="hs-empty">Laden...</div>';

    fetch('highscore_api.php?limit=30')
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(scores => {
        if (!scores || !scores.length) {
          listEl.innerHTML = '<div class="hs-empty">Noch keine Einträge 🏆</div>';
          return;
        }
        listEl.innerHTML = scores.map((s, i) => {
          const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
          const modeIcon = s.mode === 'coop' ? '🤝' : '⚔️';
          return `
            <div class="hs-row ${rankClass}">
              <div class="hs-rank">${medal}</div>
              <div class="hs-name">${this._escHtml(s.name)}</div>
              <div class="hs-info">
                <div class="hs-floor">🏰 ${s.floor} ${modeIcon}</div>
                <div class="hs-date">💀${s.kills} ⚔️${s.weapons} · ${s.date || ''}</div>
              </div>
            </div>
          `;
        }).join('');
      })
      .catch(e => {
        console.error('Highscore load error:', e);
        listEl.innerHTML = '<div class="hs-empty">Fehler: ' + this._escHtml(e.message) + '</div>';
      });
  },

  updateHUD(player, floorNum) {
    if (!player) return;
    const hpFill = document.getElementById('hud-hp-fill');
    const hpText = document.getElementById('hud-hp-text');
    const xpFill = document.getElementById('hud-xp-fill');
    const floorEl = document.getElementById('hud-floor');
    const goldEl = document.getElementById('hud-gold');
    const killsEl = document.getElementById('hud-kills');
    const timeEl = document.getElementById('hud-time');
    if (!hpFill) return;

    const maxHp = player.getMaxHp();
    const hpPct = Math.max(0, player.hp / maxHp);

    // Track previous HP for damage flash
    const prevHp = player._lastHudHp !== undefined ? player._lastHudHp : player.hp;
    player._lastHudHp = player.hp;

    hpFill.style.width = (hpPct * 100) + '%';
    hpFill.className = 'hud-hp-fill'; // reset
    if (hpPct > 0.5) hpFill.classList.add('hp-high');
    else if (hpPct > 0.3) hpFill.classList.add('hp-mid');
    else hpFill.classList.add('hp-low');

    // Damage flash if HP went down
    if (player.hp < prevHp && player.hp > 0) {
      const bar = document.getElementById('hud-hp-bar');
      if (bar) {
        bar.classList.remove('damage-flash');
        void bar.offsetWidth; // force reflow
        bar.classList.add('damage-flash');
        setTimeout(() => bar.classList.remove('damage-flash'), 400);
      }
    }
    // Low HP pulse effect on bar border
    if (hpPct <= 0.3) {
      const bar = document.getElementById('hud-hp-bar');
      if (bar) bar.style.borderColor = 'rgba(255,68,85,0.6)';
    } else if (hpPct <= 0.5) {
      const bar = document.getElementById('hud-hp-bar');
      if (bar) bar.style.borderColor = 'rgba(255,204,51,0.5)';
    } else {
      const bar = document.getElementById('hud-hp-bar');
      if (bar) bar.style.borderColor = 'rgba(255,255,255,0.15)';
    }

    hpText.textContent = `${Math.ceil(player.hp)}/${Math.ceil(maxHp)}`;
    xpFill.style.width = Math.min(100, (player.xp || 0) / (player.xpToLevel || 100) * 100) + '%';
    floorEl.textContent = `🏰 ${floorNum || 1}`;
    goldEl.textContent = `💰 ${player.gold || 0}`;
    killsEl.textContent = `💀 ${player.kills || 0}`;
    const mins = Math.floor((player.timeSurvived || 0) / 60);
    const secs = Math.floor((player.timeSurvived || 0) % 60);
    timeEl.textContent = `⏱️ ${mins}:${secs < 10 ? '0' : ''}${secs}`;

    // Synergies
    const synEl = document.getElementById('hud-synergies');
    if (synEl && CONFIG.SYNERGY_TAGS) {
      const activeTags = {};
      for (const w of (player.weapons || [])) {
        if (w.tags) for (const t of w.tags) activeTags[t] = (activeTags[t] || 0) + 1;
      }
      let synHTML = '';
      for (const [tag, def] of Object.entries(CONFIG.SYNERGY_TAGS)) {
        const count = activeTags[tag] || 0;
        const threshold = def.bonus3 ? 3 : 2;
        if (count >= threshold) synHTML += `<span class="syn-badge" title="${def.desc}">${def.icon}</span>`;
      }
      synEl.innerHTML = synHTML;
    }

    // Relics
    const relEl = document.getElementById('hud-relics');
    if (relEl) {
      relEl.innerHTML = (player.relics || []).map(r => {
        const d = CONFIG.RELIC_DEFS?.[r.key];
        return d ? `<span class="relic-badge" title="${d.desc}">${d.icon}</span>` : '';
      }).join('');
    }

    // Dash cooldown indicator
    const dashEl = document.getElementById('hud-dash');
    const dashRing = document.getElementById('hud-dash-ring');
    if (dashEl && dashRing) {
      const cd = player.dashCooldown || 0;
      const maxCd = CONFIG.PLAYER.DASH_COOLDOWN || 1.5;
      const dur = CONFIG.PLAYER.DASH_DURATION || 0.15;
      if (player.isDashing) {
        dashRing.className = 'hud-dash-ring active';
      } else if (cd <= 0) {
        dashRing.className = 'hud-dash-ring ready';
      } else {
        dashRing.className = 'hud-dash-ring cooldown';
        const pct = cd / maxCd;
        dashRing.style.background = `conic-gradient(rgba(255,255,255,0.15) ${pct * 360}deg, transparent ${pct * 360}deg)`;
      }
      if (!player.isDashing && cd <= 0) {
        dashRing.style.background = 'none';
      }
      if (player.isDashing) {
        dashRing.style.background = 'none';
      }
    }
  },

  _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  showWeaponChoiceDialog(reward) {
    const dialog = document.getElementById('weapon-choice-dialog');
    if (!dialog) return;
    const def = CONFIG.WEAPON_DEFS[reward.weaponKey];
    const existingWeapon = Game.player?.weapons?.find(w => w.defKey === reward.weaponKey);
    const nextLevel = existingWeapon ? existingWeapon.tier + 2 : 1;
    document.getElementById('wcd-icon').textContent = def.icon;
    document.getElementById('wcd-title').textContent = `${def.name} — Upgraden oder als 2. Waffe?`;
    dialog.style.display = 'flex';
  },

  hideWeaponChoiceDialog() {
    const dialog = document.getElementById('weapon-choice-dialog');
    if (dialog) dialog.style.display = 'none';
  },

  // ==================== WEAPON REPLACE DIALOG ====================
  _pendingReplaceWeapon: null,

  showWeaponReplaceDialog(newWeapon) {
    this._pendingReplaceWeapon = newWeapon;
    const dialog = document.getElementById('weapon-replace-dialog');
    if (!dialog) return;

    const def = CONFIG.WEAPON_DEFS[newWeapon.defKey];
    document.getElementById('wrd-icon').textContent = def.icon;
    document.getElementById('wrd-title').textContent = `${def.name} — Waffe ersetzen?`;
    document.getElementById('wrd-subtitle').textContent = `Du hast ${CONFIG.PLAYER.MAX_WEAPONS} Waffen. Wähle welche ersetzt wird:`;

    // Build weapon slot buttons
    const slotsEl = document.getElementById('wrd-slots');
    slotsEl.innerHTML = '';
    Game.player.weapons.forEach((w, i) => {
      const wDef = CONFIG.WEAPON_DEFS[w.defKey];
      const tierColors = ['#888', '#44cc66', '#4488ff', '#bb55ee', '#ff8800', '#ff4444', '#ff2222', '#ff00ff'];
      const color = tierColors[Math.min(w.tier, tierColors.length - 1)];
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-small';
      btn.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px;min-width:60px;border-color:${color};`;
      btn.innerHTML = `<span style="font-size:20px;">${wDef.icon}</span><span style="font-size:11px;color:${color};white-space:nowrap;">${wDef.name}</span><span style="font-size:10px;color:#888;">Lv.${w.tier + 1}</span>`;
      btn.addEventListener('click', () => this._replaceWeaponSlot(i));
      slotsEl.appendChild(btn);
    });

    dialog.style.display = 'flex';
  },

  _replaceWeaponSlot(index) {
    if (!this._pendingReplaceWeapon) return;
    const newWeapon = this._pendingReplaceWeapon;
    this._pendingReplaceWeapon = null;
    this.hideWeaponReplaceDialog();
    WeaponSystem.replaceWeapon(Game.player, newWeapon, index);
    FloatingText.add(Game.player.x, Game.player.y - 30, `🎯 ${newWeapon.def.name}!`, '#44dd66', 18, 1.5);
  },

  hideWeaponReplaceDialog() {
    const dialog = document.getElementById('weapon-replace-dialog');
    if (dialog) dialog.style.display = 'none';
    this._pendingReplaceWeapon = null;
  },

  showPause() { document.getElementById('screen-pause')?.classList.add('active'); },
  hidePause() { document.getElementById('screen-pause')?.classList.remove('active'); },

  showReward(choices) {
    this._hideAll();
    document.getElementById('screen-reward')?.classList.add('active');
    const container = document.getElementById('reward-choices');
    container.innerHTML = '';
    this._selectedRewards = []; // Track selected indices
    choices.forEach((reward, i) => {
      const card = document.createElement('div');
      card.className = `reward-card rarity-${reward.type === 'weapon' ? 'rare' : reward.type === 'heal' ? 'common' : reward.type === 'relic' ? 'epic' : 'uncommon'}`;
      card.id = `reward-card-${i}`;
      card.innerHTML = `
        <div class="reward-icon">${reward.icon}</div>
        <div class="reward-name">${reward.name}</div>
        <div class="reward-type">${reward.type === 'weapon' ? '⚔️ Waffe' : reward.type === 'heal' ? '❤️ Heilung' : reward.type === 'relic' ? '✨ Relikt' : '📈 Upgrade'}</div>
        ${reward.desc ? `<div class="reward-desc">${reward.desc}</div>` : ''}
      `;
      card.addEventListener('click', () => {
        this._hideRewardTooltip();
        this._toggleRewardPick(i);
      });

      // Long press / hover for tooltip
      let pressTimer = null;
      card.addEventListener('pointerdown', (e) => {
        pressTimer = setTimeout(() => {
          this._showRewardTooltip(i, reward, card);
        }, 400);
      });
      card.addEventListener('pointerup', () => { clearTimeout(pressTimer); });
      card.addEventListener('pointerleave', () => { clearTimeout(pressTimer); this._hideRewardTooltip(); });
      card.addEventListener('pointercancel', () => { clearTimeout(pressTimer); });
      // Desktop hover
      card.addEventListener('mouseenter', () => {
        pressTimer = setTimeout(() => {
          this._showRewardTooltip(i, reward, card);
        }, 250);
      });
      card.addEventListener('mouseleave', () => { clearTimeout(pressTimer); this._hideRewardTooltip(); });
      container.appendChild(card);
    });
    // Update pick counter
    this._updateRewardInfo();
  },

  _showRewardTooltip(index, reward, cardEl) {
    this._hideRewardTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'reward-tooltip';
    tooltip.id = 'reward-tooltip';

    let statsHtml = '';
    if (reward.type === 'weapon') {
      const def = CONFIG.WEAPON_DEFS[reward.weaponKey];
      const isMelee = def.type === 'melee';
      const existingWeapon = Game.player?.weapons?.find(w => w.defKey === reward.weaponKey);
      const baseDmg = def.baseDamage;
      const baseSpeed = def.attackSpeed;
      const baseRange = def.range;
      const nextTier = existingWeapon ? existingWeapon.tier + 1 : 0;
      const nextDmg = Math.round(CONFIG.WEAPON_DEFS[reward.weaponKey].baseDamage * (1 + nextTier * 0.5));
      const nextSpeed = (CONFIG.WEAPON_DEFS[reward.weaponKey].attackSpeed * (1 + nextTier * 0.08)).toFixed(2);
      const dps = Math.round(baseDmg * baseSpeed);

      statsHtml = `
        <div class="rt-stat"><span>⚔️ Schaden</span><strong>${Math.round(baseDmg)}${nextTier > 0 ? ` → ${nextDmg}` : ''}</strong></div>
        <div class="rt-stat"><span>⚡ Angriffe/Sek</span><strong>${baseSpeed.toFixed(2)}${nextTier > 0 ? ` → ${nextSpeed}` : ''}</strong></div>
        <div class="rt-stat"><span>💥 DPS</span><strong>${dps}</strong></div>
        <div class="rt-stat"><span>📏 Reichweite</span><strong>${Math.round(baseRange)}</strong></div>
        ${isMelee ? `<div class="rt-stat"><span>📐 Schwungbogen</span><strong>${(def.arc * 180 / Math.PI).toFixed(0)}°</strong></div>` : ''}
        ${!isMelee && def.pellets ? `<div class="rt-stat"><span>🎯 Projektile</span><strong>${def.pellets}</strong></div>` : ''}
        ${def.pierce ? `<div class="rt-stat"><span>🗡️ Durchschlag</span><strong>${def.pierce}</strong></div>` : ''}
        ${existingWeapon ? `<div class="rt-hint">⬆️ Upgrade: Lv.${existingWeapon.tier + 1} → Lv.${existingWeapon.tier + 2}</div>` : ''}
        ${existingWeapon ? `<div class="rt-hint">➕ Oder als 2. Waffe ausrüsten</div>` : ''}
      `;
    } else if (reward.type === 'stat') {
      const valStr = reward.percent ? `${reward.value}%` : `+${reward.value}`;
      const playerStat = Game.player ? (Game.player[reward.stat] || 0) : 0;
      const maxHpVal = reward.stat === 'maxHp' && Game.player ? Game.player.getMaxHp() : null;
      const currentVal = maxHpVal !== null && maxHpVal !== undefined ? maxHpVal : playerStat;
      let newVal = currentVal;
      if (reward.percent) newVal = currentVal * (1 + reward.value / 100);
      else if (reward.stat === 'maxHp') newVal = currentVal + reward.value;
      else newVal = currentVal + reward.value;
      const statLabel = reward.stat === 'maxHp' ? '❤️ Max HP' : reward.stat === 'damage' ? '⚔️ Schaden' : reward.stat === 'attackSpeed' ? '⚡ Angriffstempo' : reward.stat === 'critChance' ? '💥 Krit-Chance' : reward.stat === 'armor' ? '🛡️ Rüstung' : reward.stat === 'speed' ? '👟 Tempo' : reward.stat === 'lifeSteal' ? '🧛 Lebensraub' : reward.stat;
      statsHtml = `
        <div class="rt-stat"><span>📈 Effekt</span><strong>${statLabel}</strong></div>
        <div class="rt-stat"><span>📊 Wert</span><strong>${valStr}</strong></div>
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:3px;">Dein Build:</div>
          <div class="rt-stat"><span>${statLabel}</span><strong>${Math.round(currentVal * 10) / 10} &#8594; ${Math.round(newVal * 10) / 10}</strong></div>
        </div>
      `;
    }

    tooltip.innerHTML = `
      <div class="rt-header">${reward.icon} ${reward.name}</div>
      ${statsHtml}
    `;
    document.body.appendChild(tooltip);

    // Position tooltip near the card
    const rect = cardEl.getBoundingClientRect();
    const tipW = Math.min(260, window.innerWidth - 20);
    tooltip.style.width = tipW + 'px';
    const tipLeft = Math.max(10, Math.min(rect.left, window.innerWidth - tipW - 10));
    const tipTop = rect.bottom + 6;
    tooltip.style.left = tipLeft + 'px';
    tooltip.style.top = tipTop + 'px';
  },

  _hideRewardTooltip() {
    const existing = document.getElementById('reward-tooltip');
    if (existing) existing.remove();
  },

  _updateRewardInfo() {
    let infoEl = document.getElementById('reward-info');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'reward-info';
      const container = document.querySelector('.reward-container');
      container.insertBefore(infoEl, document.getElementById('reward-choices'));
    }
    const selectedCount = this._selectedRewards ? this._selectedRewards.length : 0;
    const maxPicks = Rewards.maxPicks;
    const rerolls = Rewards.rerollsLeft;
    infoEl.innerHTML = `
      <div class="reward-counter">Wähle bis zu <strong>${maxPicks}</strong> (<strong>${selectedCount}</strong> gewählt${maxPicks > 2 ? ' ✨' : ''})</div>
      <button id="btn-reroll" class="btn btn-secondary btn-reroll">${rerolls > 0 ? '🔄 Reroll' : '🔄 Reroll (0)'}</button>
      <button id="btn-confirm-rewards" class="btn btn-primary btn-continue"${selectedCount === 0 ? ' disabled style="opacity:0.4"' : ''}>✅ Bestätigen (${selectedCount})</button>
    `;
    document.getElementById('btn-reroll')?.addEventListener('click', () => { this._selectedRewards = []; Game.rerollReward(); });
    document.getElementById('btn-confirm-rewards')?.addEventListener('click', () => this._confirmRewards());
  },

  _toggleRewardPick(index) {
    if (!this._selectedRewards) this._selectedRewards = [];
    const idx = this._selectedRewards.indexOf(index);
    const card = document.getElementById(`reward-card-${index}`);
    if (idx >= 0) {
      // Deselect
      this._selectedRewards.splice(idx, 1);
      delete this._rewardModes[index];
      if (card) { card.classList.remove('picked'); card.style.opacity = ''; card.style.pointerEvents = ''; }
      this._updateRewardInfo();
      return;
    }
    if (this._selectedRewards.length >= Rewards.maxPicks) return;

    const reward = Rewards.currentChoices[index];
    if (!reward) return;

    // If this is a weapon the player already owns, show choice dialog
    if (reward.type === 'weapon' && reward.isUpgrade) {
      this._pendingWeaponPickIndex = index;
      this.showWeaponChoiceDialog(reward);
      return;
    }

    // Normal pick
    this._selectedRewards.push(index);
    if (!this._rewardModes) this._rewardModes = {};
    this._rewardModes[index] = reward.type === 'weapon' ? 'new' : 'normal';
    if (card) { card.classList.add('picked'); card.style.opacity = '0.65'; }
    this._updateRewardInfo();
  },

  // Called when player picks "Upgrade" in the weapon choice dialog
  _chooseWeaponUpgrade() {
    const index = this._pendingWeaponPickIndex;
    if (index == null) return;
    this._selectedRewards.push(index);
    if (!this._rewardModes) this._rewardModes = {};
    this._rewardModes[index] = 'upgrade';
    const card = document.getElementById(`reward-card-${index}`);
    if (card) { card.classList.add('picked'); card.style.opacity = '0.65'; }
    this._pendingWeaponPickIndex = null;
    this.hideWeaponChoiceDialog();
    this._updateRewardInfo();
  },

  // Called when player picks "Neue Waffe" in the weapon choice dialog
  _chooseWeaponNew() {
    const index = this._pendingWeaponPickIndex;
    if (index == null) return;
    this._selectedRewards.push(index);
    if (!this._rewardModes) this._rewardModes = {};
    this._rewardModes[index] = 'new';
    const card = document.getElementById(`reward-card-${index}`);
    if (card) { card.classList.add('picked'); card.style.opacity = '0.65'; }
    this._pendingWeaponPickIndex = null;
    this.hideWeaponChoiceDialog();
    this._updateRewardInfo();
  },

  async _confirmRewards() {
    if (!this._selectedRewards || this._selectedRewards.length === 0) return;
    let needsReplace = false;
    for (const idx of [...this._selectedRewards]) {
      const reward = Rewards.currentChoices[idx];
      if (!reward) continue;
      const mode = this._rewardModes?.[idx];
      if (reward.type === 'weapon') {
        const result = Rewards.apply(reward, Game.player, mode || 'new');
        if (result === 'needs_replace') needsReplace = true;
      } else {
        Rewards.apply(reward, Game.player);
      }
      Rewards.pickedCount++;
    }
    this._selectedRewards = [];
    this._rewardModes = {};
    if (!needsReplace) {
      Game.finishReward();
    }
    // If needsReplace, finishReward will be called after player picks a slot
    // (we need to defer it)
    if (needsReplace) {
      // Watch for dialog close to then call finishReward
      this._waitForReplaceDialog();
    }
  },

  _waitForReplaceDialog() {
    // Poll until replace dialog is gone, then finish reward
    const check = () => {
      const dialog = document.getElementById('weapon-replace-dialog');
      if (!dialog || dialog.style.display === 'none') {
        Game.finishReward();
      } else {
        setTimeout(check, 200);
      }
    };
    setTimeout(check, 300);
  },

  _markCardPicked(index) {
    const card = document.getElementById(`reward-card-${index}`);
    if (card) {
      card.classList.add('picked');
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
    }
  },

  announceFloor(floorNum, isBoss) {
    const el = document.getElementById('floor-announce');
    if (!el) return;
    const theme = Dungeon.getTheme(floorNum);
    const text = isBoss ? `⚔️ BOSS — Ebene ${floorNum}` : `🏰 Ebene ${floorNum} — ${theme.name}`;
    el.textContent = text;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 2200);
  },

  // ==================== ACCOUNT / LOGIN / SHOP ====================

  showLogin() { this.showScreen('login'); document.getElementById('login-error').textContent = ''; },

  async _handleLogin() {
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value;
    const errEl = document.getElementById('login-error');
    if (!username || !password) { errEl.textContent = 'Bitte Username und Passwort eingeben'; return; }
    errEl.textContent = '⏳ Anmelden...';
    const result = await Account.login(username, password);
    if (result.ok) {
      errEl.textContent = '';
      this.showMenu();
      this.updateMenuAccount();
    } else {
      errEl.textContent = result.error || 'Anmeldung fehlgeschlagen';
    }
  },

  async _handleRegister() {
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value;
    const errEl = document.getElementById('login-error');
    if (!username || !password) { errEl.textContent = 'Bitte Username und Passwort eingeben'; return; }
    errEl.textContent = '⏳ Registrieren...';
    const result = await Account.register(username, password);
    if (result.ok) {
      errEl.textContent = '';
      this.showMenu();
      this.updateMenuAccount();
    } else {
      errEl.textContent = result.error || 'Registrierung fehlgeschlagen';
    }
  },

  async showShop() {
    this.showScreen('shop');
    this._renderShopItems('skins');
    const goldEl = document.getElementById('shop-gold');
    if (goldEl) goldEl.textContent = `💰 ${Account.gold}`;
    // Sync gold from server
    if (Account.loggedIn) {
      await Account._syncFromServer();
      if (goldEl) goldEl.textContent = `💰 ${Account.gold}`;
      this._renderShopItems(document.querySelector('.shop-tab.active')?.dataset.tab || 'skins');
    }
  },

  _renderShopItems(tab) {
    const container = document.getElementById('shop-items');
    if (!container) return;
    container.innerHTML = '';

    if (tab === 'skins') {
      // Cosmetic skins — pure visual overlays
      for (const [key, skin] of Object.entries(Account.SKINS)) {
        const owned = key === 'skin_default' || Account.unlockedSkins.includes(key);
        const equipped = Account.skin === key;
        const isDefault = key === 'skin_default';
        const item = document.createElement('div');
        item.className = `shop-item ${equipped ? 'equipped' : owned ? 'owned' : ''}`;
        item.dataset.shopKey = key;
        item.dataset.shopTab = tab;
        item.innerHTML = `
          <div class="shop-item-icon">${skin.icon}</div>
          <div class="shop-item-name">${skin.name}</div>
          ${isDefault ? '<div class="shop-item-price free">Start</div>' :
            equipped ? '<div class="shop-item-price free">✅ Aktiv</div>' :
            owned ? '<button class="btn btn-secondary btn-small" data-action="equip" data-key="' + key + '" data-type="skin">Anlegen</button>' :
            `<button class="btn btn-primary btn-small" data-action="buy" data-key="${key}" data-type="skin">💰 ${skin.price}</button>`}
        `;
        container.appendChild(item);
      }
    } else if (tab === 'chars') {
      // Characters tab
      for (const [key, char] of Object.entries(CONFIG.CHARACTERS)) {
        const unlocked = key === 'potato_default' || Account.unlockedSkins.includes(key);
        const selected = Account.selectedCharacter === key || (!Account.selectedCharacter && key === 'potato_default');
        const card = document.createElement('div');
        card.className = `char-card ${selected ? 'selected' : unlocked ? 'owned' : ''}`;
        card.dataset.shopKey = key;
        card.dataset.shopTab = 'chars';

        let statsHTML = '';
        for (const [stat, val] of Object.entries(char.stats)) {
          if (val === 0) continue;
          const isPos = val > 0;
          const labels = { hp: '❤️ HP', speed: '👟 Tempo', damage: '⚔️ Schaden', attackSpeed: '⚡ ATK-Speed', armor: '🛡️ Rüstung', dodge: '💨 Dodge', critChance: '💥 Krit', lifeSteal: '🧛 LifeSteal', maxWeapons: '🔫 Waffen+1' };
          const label = labels[stat] || stat;
          const display = stat === 'hp' ? (val > 0 ? `+${val}` : val) : (val > 0 ? `+${val}%` : `${val}%`);
          statsHTML += `<span class="char-stat ${isPos ? 'positive' : 'negative'}">${label} ${display}</span>`;
        }

        card.innerHTML = `
          <div class="char-card-header">
            <span class="char-card-icon">${char.icon}</span>
            <span class="char-card-name">${char.name}</span>
          </div>
          <div class="char-card-desc">${char.desc}</div>
          <div class="char-card-stats">${statsHTML || '<span class="char-stat">Ausgewogen</span>'}</div>
          ${char.abilityDesc ? `<div class="char-ability">⭐ ${char.abilityDesc}</div>` : ''}
          ${!unlocked ? `<button class="btn btn-primary btn-small" data-action="buy-char" data-key="${key}" style="margin-top:6px;">💰 ${char.price}</button>` :
            selected ? '<div style="margin-top:6px;font-size:12px;color:var(--gold);">✅ Ausgewählt</div>' :
            '<button class="btn btn-secondary btn-small" data-action="select-char" data-key="' + key + '" style="margin-top:6px;">Auswählen</button>'}
          <div class="char-preview" data-char="${key}" style="display:none;"></div>
        `;
        container.appendChild(card);
      }
    } else {
      // Trails
      for (const [key, trail] of Object.entries(Account.TRAILS)) {
        const owned = Account.ownsTrail(key);
        const equipped = Account.trail === key;
        const item = document.createElement('div');
        item.className = `shop-item ${equipped ? 'equipped' : owned ? 'owned' : ''}`;
        item.dataset.shopKey = key;
        item.dataset.shopTab = tab;
        item.innerHTML = `
          <div class="shop-item-icon">${trail.icon}</div>
          <div class="shop-item-name">${trail.name}</div>
          ${equipped ? '<div class="shop-item-price free">✅ Ausgerüstet</div>' :
            owned ? `<button class="btn btn-secondary btn-small" data-action="equip" data-key="${key}" data-type="trail">Anziehen</button>` :
            `<button class="btn btn-primary btn-small" data-action="buy" data-key="${key}" data-type="trail">💰 ${this._getTrailPrice(key)}</button>`}
        `;
        container.appendChild(item);
      }
      // "Keine Spur" option
      const noTrail = document.createElement('div');
      noTrail.className = `shop-item ${Account.trail === '' ? 'equipped' : 'owned'}`;
      noTrail.innerHTML = `<div class="shop-item-icon">🚫</div><div class="shop-item-name">Keine Spur</div><div class="shop-item-price free">${Account.trail === '' ? '✅ Aktiv' : '<button class="btn btn-secondary btn-small" data-action="unequip-trail">Deaktivieren</button>'}</div>`;
      container.appendChild(noTrail);
    }

    // Long-press preview — visual canvas rendering
    let previewOverlay = document.getElementById('preview-overlay');
    if (!previewOverlay) {
      previewOverlay = document.createElement('div');
      previewOverlay.id = 'preview-overlay';
      previewOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:200;justify-content:center;align-items:center;flex-direction:column;padding:20px;text-align:center;cursor:pointer;';
      previewOverlay.addEventListener('click', () => { previewOverlay.style.display = 'none'; if (previewAnimId) cancelAnimationFrame(previewAnimId); });
      document.body.appendChild(previewOverlay);
    }
    let previewAnimId = null;

    const drawCharPreview = (ctx, charKey, cx, cy, size, t) => {
      const def = Player._charDefs[charKey] || Player._charDefs.potato_default;
      const bob = Math.sin(t * 5) * 3;
      const rx = def.tall ? size * 0.75 : def.wide ? size * 1.25 : def.thin ? size * 0.6 : size;
      const ry = def.tall ? size * 1.2 : def.wide ? size * 0.85 : def.thin ? size * 1.1 : size;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + size * 0.7, rx * 0.8, ry * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = def.body;
      ctx.strokeStyle = def.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + bob, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Horns
      if (def.horns) {
        ctx.fillStyle = '#440000';
        ctx.beginPath(); ctx.moveTo(cx - rx*0.75, cy+bob - ry*0.4); ctx.lineTo(cx - rx, cy+bob - ry*1.3); ctx.lineTo(cx - rx*0.25, cy+bob - ry*0.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + rx*0.75, cy+bob - ry*0.4); ctx.lineTo(cx + rx, cy+bob - ry*1.3); ctx.lineTo(cx + rx*0.25, cy+bob - ry*0.5); ctx.fill();
      }
      if (def.glow) {
        ctx.save(); ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20 + Math.sin(t * 3) * 8;
        ctx.beginPath(); ctx.ellipse(cx, cy+bob, rx+4, ry+4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,0,0.35)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      }
      if (def.shadow) {
        ctx.save(); ctx.globalAlpha = 0.3 + Math.sin(t * 2.5) * 0.1;
        ctx.beginPath(); ctx.arc(cx, cy+bob, Math.max(rx, ry)+14, 0, Math.PI * 2); ctx.fillStyle = '#6600aa'; ctx.fill(); ctx.restore();
      }
      if (def.rainbow) {
        ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy+bob, rx+4, ry+4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(${(t * 40) % 360}, 80%, 55%)`; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      }
      // Eyes
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(cx - rx*0.3, cy+bob - ry*0.12, 2, 0, Math.PI*2); ctx.arc(cx + rx*0.3, cy+bob - ry*0.12, 2, 0, Math.PI*2); ctx.fill();
    };

    const drawSkinEffect = (ctx, skinKey, cx, cy, size, t) => {
      const def = Account.SKINS[skinKey] || Account.SKINS.skin_default;
      if (def.effect === 'none') return;
      const bob = Math.sin(t * 5) * 3;
      if (def.effect === 'glow') {
        ctx.save(); ctx.shadowColor = def.glowColor || '#ffd700'; ctx.shadowBlur = 15 + Math.sin(t * 3) * 5;
        ctx.beginPath(); ctx.arc(cx, cy+bob, size+3, 0, Math.PI*2); ctx.strokeStyle = (def.glowColor||'#ffd700')+'66'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      } else if (def.effect === 'aura') {
        ctx.save(); ctx.globalAlpha = 0.3 + Math.sin(t * 2)*0.15;
        ctx.beginPath(); ctx.arc(cx, cy+bob, size+8, 0, Math.PI*2); ctx.fillStyle = (def.auraColor||'#ff4400')+'44'; ctx.fill(); ctx.restore();
      } else if (def.effect === 'rainbow') {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy+bob, size+4, 0, Math.PI*2);
        ctx.strokeStyle = `hsl(${(t*40)%360},80%,60%)`; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      } else if (def.effect === 'outline') {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy+bob, size+4, 0, Math.PI*2);
        ctx.strokeStyle = def.outlineColor || '#00ff88'; ctx.lineWidth = 2; ctx.shadowColor = def.outlineColor||'#00ff88'; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore();
      } else if (def.effect === 'sparkle') {
        for (let i = 0; i < 5; i++) { const a = t*2 + i*1.2; const d = size + 6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx+Math.cos(a)*d, cy+bob+Math.sin(a)*d, 1.5, 0, Math.PI*2); ctx.fill(); }
      } else if (def.effect === 'diamond') {
        ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy-size-10); ctx.lineTo(cx+size+8, cy); ctx.lineTo(cx, cy+size+10); ctx.lineTo(cx-size-8, cy); ctx.closePath(); ctx.strokeStyle = '#88ddff88'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      } else if (def.effect === 'ghost' || def.effect === 'ghost_transparent') {
        // shown via globalAlpha in the main draw
      }
    };

    const drawTrailPreview = (ctx, trailKey, cx, cy, t) => {
      const trail = Account.TRAILS[trailKey];
      if (!trail) return;
      const color = trail.color === 'rainbow' ? `hsl(${(t*40)%360},80%,60%)` : trail.color;
      for (let i = 0; i < 12; i++) {
        const progress = i / 12;
        const x = cx - 40 + progress * 80;
        const y = cy + Math.sin(t * 3 + progress * 4) * 8;
        const a = 1 - progress * 0.7;
        const r = 5 - progress * 3;
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const showPreview = (key, tab) => {
      if (previewAnimId) cancelAnimationFrame(previewAnimId);
      previewOverlay.innerHTML = '<canvas id="preview-canvas" width="240" height="240" style="border-radius:12px;"></canvas><div id="preview-name" style="font-size:20px;font-weight:700;color:#fff;margin-top:10px;"></div><div style="margin-top:6px;color:#888;font-size:12px;">Tippen zum Schließen</div>';
      previewOverlay.style.display = 'flex';
      const canvas = document.getElementById('preview-canvas');
      const ctx = canvas.getContext('2d');
      const nameEl = document.getElementById('preview-name');
      let startTime = performance.now();

      function animate() {
        const t = (performance.now() - startTime) / 1000;
        ctx.clearRect(0, 0, 240, 240);

        if (tab === 'chars' && CONFIG.CHARACTERS[key]) {
          nameEl.textContent = CONFIG.CHARACTERS[key].name + ' — ' + CONFIG.CHARACTERS[key].desc;
          drawCharPreview(ctx, key, 120, 110, 30, t);
        } else if (tab === 'skins' && Account.SKINS[key]) {
          nameEl.textContent = Account.SKINS[key].name;
          // Draw default potato + skin overlay
          drawCharPreview(ctx, 'potato_default', 120, 110, 30, t);
          drawSkinEffect(ctx, key, 120, 110, 30, t);
        } else if (tab === 'trails' && Account.TRAILS[key]) {
          nameEl.textContent = Account.TRAILS[key].name;
          drawCharPreview(ctx, 'potato_default', 120, 100, 25, t);
          drawTrailPreview(ctx, key, 120, 155, t);
        }
        previewAnimId = requestAnimationFrame(animate);
      }
      animate();
    };

    // Bind long-press preview on items
    container.querySelectorAll('.shop-item, .char-card').forEach(el => {
      let pressTimer = null;
      const getKey = () => el.dataset.shopKey;
      const getTab = () => el.dataset.shopTab || tab;
      el.addEventListener('pointerdown', (e) => {
        pressTimer = setTimeout(() => { const k = getKey(); if (k) showPreview(k, getTab()); }, 500);
      });
      el.addEventListener('pointerup', () => { clearTimeout(pressTimer); });
      el.addEventListener('pointerleave', () => { clearTimeout(pressTimer); });
      el.addEventListener('pointercancel', () => { clearTimeout(pressTimer); });
    });

    // Bind click handlers
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const key = btn.dataset.key;
        const type = btn.dataset.type;
        if (action === 'buy') {
          const result = await Account.buyItem(key);
          if (result.ok) {
            Account.gold = result.gold || Account.gold;
            if (result.unlocked) {
              const newItems = result.unlocked.split(',').map(s => s.trim());
              if (type === 'trail') Account.unlockedTrails = newItems.filter(s => s);
              else Account.unlockedSkins = newItems;
            }
            Account._save();
            this._renderShopItems(tab);
            this.updateMenuAccount();
          } else {
            alert(result.error || 'Kauf fehlgeschlagen');
          }
        } else if (action === 'buy-char') {
          const result = await Account.buyItem(key);
          if (result.ok) {
            if (!Account.unlockedSkins.includes(key)) Account.unlockedSkins.push(key);
            Account.gold = result.gold || Account.gold;
            Account._save();
            this._renderShopItems(tab);
            this.updateMenuAccount();
          } else {
            alert(result.error || 'Kauf fehlgeschlagen');
          }
        } else if (action === 'select-char') {
          Account.selectedCharacter = key;
          Account._save();
          this._renderShopItems(tab);
          this.updateMenuAccount();
        } else if (action === 'equip') {
          const equipResult = await Account.equipItem(key, type);
          if (equipResult.ok) {
            if (type === 'trail') Account.trail = key;
            else Account.skin = key;
            Account._save();
            this._renderShopItems(tab);
            this.updateMenuAccount();
          } else {
            alert(equipResult.error || 'Ausrüsten fehlgeschlagen');
          }
        } else if (action === 'unequip-trail') {
          Account.trail = '';
          Account._save();
          this._renderShopItems(tab);
        }
      });
    });
  },

  _getSkinPrice(key) {
    if (CONFIG.CHARACTERS[key]) return CONFIG.CHARACTERS[key].price;
    const prices = { potato_fries: 50, potato_sweet: 80, potato_chips: 120, potato_golden: 200, potato_shadow: 300, potato_rainbow: 500, potato_devil: 666 };
    return prices[key] || 100;
  },

  _getTrailPrice(key) {
    const prices = { trail_fire: 100, trail_ice: 100, trail_rainbow: 250, trail_particles: 150 };
    return prices[key] || 100;
  },

  // ==================== PROFILE ====================

  updateMenuAccount() {
    const el = document.getElementById('menu-account');
    if (!el) return;
    if (Account.loggedIn) {
      el.innerHTML = `<span class="account-name" style="cursor:pointer;" onclick="UI.showProfile()">👤 ${this._escHtml(Account.username)}</span> · <span class="account-gold">💰 ${Account.gold}</span>`;
    } else {
      el.innerHTML = `<button class="btn btn-secondary btn-small" onclick="UI.showLogin()">🔑 Anmelden</button>`;
    }

    // Character selection
    const charSelect = document.getElementById('char-select');
    if (charSelect) {
      charSelect.innerHTML = '';
      for (const [key, char] of Object.entries(CONFIG.CHARACTERS)) {
        const unlocked = key === 'potato_default' || Account.unlockedSkins.includes(key);
        const selected = Account.selectedCharacter === key || (!Account.selectedCharacter && key === 'potato_default');
        if (!unlocked && !Account.loggedIn) continue;
        const btn = document.createElement('div');
        btn.className = `char-btn ${selected ? 'active' : ''} ${!unlocked ? 'locked' : ''}`;
        btn.innerHTML = `<span class="char-icon">${char.icon}</span><span class="char-name">${char.name}</span>`;
        if (unlocked) {
          btn.addEventListener('click', () => {
            Account.selectedCharacter = key;
            Account._save();
            this.updateMenuAccount();
          });
        }
        charSelect.appendChild(btn);
      }
    }
  },

  async showProfile() {
    this.showScreen('profile');
    // Sync from server
    if (Account.loggedIn) await Account._syncFromServer();
    const info = document.getElementById('profile-info');
    const stats = document.getElementById('profile-stats');
    if (info) {
      info.innerHTML = `
        <div class="name">👤 ${this._escHtml(Account.username)}</div>
        <div class="gold">💰 ${Account.gold} Gold</div>
      `;
    }
    if (stats) {
      const skinCount = Account.unlockedSkins.filter(s => s.startsWith('skin_')).length;
      const charCount = Account.unlockedSkins.filter(s => s.startsWith('potato_')).length;
      const trailCount = Account.unlockedTrails.length;
      const charName = CONFIG.CHARACTERS?.[Account.selectedCharacter]?.name || 'Kartoffel';
      const skinName = Account.SKINS?.[Account.skin]?.name || 'Classic';
      const trailName = Account.TRAILS?.[Account.trail]?.name || 'Keine';
      stats.innerHTML = `
        <div class="profile-stat"><div class="val">${Account.bestFloor}</div><div class="label">🏰 Beste Ebene</div></div>
        <div class="profile-stat"><div class="val">${Account.totalKills}</div><div class="label">💀 Kills gesamt</div></div>
        <div class="profile-stat"><div class="val">${charCount}</div><div class="label">🥔 Charaktere</div></div>
        <div class="profile-stat"><div class="val">${skinCount}</div><div class="label">🎭 Skins</div></div>
        <div class="profile-stat"><div class="val">${trailCount}</div><div class="label">✨ Spuren</div></div>
        <div class="profile-stat"><div class="val" style="font-size:14px;">${charName}</div><div class="label">Aktiver Char</div></div>
        <div class="profile-stat"><div class="val" style="font-size:14px;">${skinName}</div><div class="label">Aktiver Skin</div></div>
        <div class="profile-stat"><div class="val" style="font-size:14px;">${trailName}</div><div class="label">Aktive Spur</div></div>
      `;
    }
  },

  _handleLogout() {
    Account.logout();
    this.showMenu();
    this.updateMenuAccount();
  },

  async _handleChangeName() {
    const newName = document.getElementById('input-new-name').value.trim();
    const pass = document.getElementById('input-confirm-pass-name').value;
    const errEl = document.getElementById('changename-error');
    if (!newName || !pass) { errEl.textContent = 'Alle Felder ausfüllen'; return; }
    errEl.textContent = '⏳ Speichern...';
    try {
      const res = await fetch('auth_api.php?action=change_name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: Account.username, password: pass, new_name: newName })
      });
      const data = await res.json();
      if (data.ok) {
        Account.username = newName;
        Account._save();
        errEl.textContent = '';
        this.showProfile();
      } else {
        errEl.textContent = data.error || 'Fehler';
      }
    } catch(e) { errEl.textContent = 'Netzwerkfehler'; }
  },

  async _handleChangePass() {
    const oldPass = document.getElementById('input-old-pass').value;
    const newPass = document.getElementById('input-new-pass').value;
    const errEl = document.getElementById('changepass-error');
    if (!oldPass || !newPass) { errEl.textContent = 'Alle Felder ausfüllen'; return; }
    if (newPass.length < 4) { errEl.textContent = 'Mindestens 4 Zeichen'; return; }
    errEl.textContent = '⏳ Speichern...';
    try {
      const res = await fetch('auth_api.php?action=change_pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: Account.username, old_password: oldPass, new_password: newPass })
      });
      const data = await res.json();
      if (data.ok) {
        errEl.textContent = '✅ Passwort geändert!';
      } else {
        errEl.textContent = data.error || 'Fehler';
      }
    } catch(e) { errEl.textContent = 'Netzwerkfehler'; }
  }
};